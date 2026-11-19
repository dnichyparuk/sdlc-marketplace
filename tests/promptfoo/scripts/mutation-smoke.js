#!/usr/bin/env node
'use strict';

// OWNER-ONLY mutation smoke. Not part of any promptfoo config, lefthook.yml or Taskfile.yml.
//
// It breaks one library line at a time, in a throwaway copy of the repository, and runs the
// exec-suite cases that should notice. A mutation is "killed" when promptfoo exits non-zero;
// a survivor marks a case that does not really check the mutated path.
//
// Modes:
//   --list                          print the mutations
//   --check                         verify every mutation still applies and has a case (read-only)
//   --run --owner [--only <id>]     run the mutations in a temp copy (starts promptfoo)
//
// Threat model: an accidental start by CI, a git hook or an agent. The guard is against
// accidents, not a security boundary. Accepted gaps: a person can unset the variables and pass
// --owner; CLAUDECODE covers Claude Code shells only; whether each mutation turns its case red
// is proven only by the owner's --run.
//
// Wave-P files (plan-parse, plan-critique, skill/plan, skill/pr, skill/ship and the plan-*, pr-*,
// ship-prepare datasets) are not mutation targets, so that wave cannot break --check. The one
// exception is the pr-prepare dataset named only as the case source of the pr-template mutation.
//
// Never run it in CI or from a pre-push hook.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB = 'plugins/sdlc-utilities/scripts/lib/';
const SD = 'tests/promptfoo/datasets/';
const PROMPTFOO = 'promptfoo@0.123.1';

const MUTATIONS = [
  {
    id: 'ship-fields-drop-step',
    file: LIB + 'ship-fields.js',
    find: "'await-remote-review', 'learnings-commit'];",
    replace: "'await-remote-review'];",
    dataset: SD + 'setup-prepare-exec.yaml',
    filter: 'setup-prepare: shipFields\\.steps has exactly 10',
    why: 'the case compares shipFields.steps.options to the full 10-step list, which comes from CANONICAL_STEPS',
  },
  {
    id: 'pr-template-priority-swap',
    file: LIB + 'pr-template.js',
    find: "const canonical = path.join(projectRoot, '.sdlc', 'pr-template.md');\n  const legacy    = path.join(projectRoot, '.claude', 'pr-template.md');",
    replace: "const canonical = path.join(projectRoot, '.claude', 'pr-template.md');\n  const legacy    = path.join(projectRoot, '.sdlc', 'pr-template.md');",
    dataset: SD + 'pr-prepare-exec.yaml',
    filter: 'pr\\.js: template at',
    why: 'the three pr.js template cases use the sdlc-only, legacy-only and both fixtures and assert which path resolves and whether the deprecation warning shows',
  },
  {
    id: 'execute-wave-committed-no-write',
    file: 'plugins/sdlc-utilities/scripts/state/execute.js',
    find: '  wave.committedSha = newSha;\n  writeState(filePath, data);',
    replace: '  wave.committedSha = newSha;',
    dataset: SD + 'state-gc-migrate-exec.yaml',
    filter: 'wave-committed',
    why: 'the matched cases check exit paths and error text; the success case asserts only that no "Error:" appears, so this mutation is expected to SURVIVE and points at a weak case',
  },
  {
    id: 'links-skip-host',
    file: LIB + 'links.js',
    find: "  'linkedin.com',\n",
    replace: '',
    dataset: SD + 'links-lib-exec.yaml',
    filter: 'links: skip-list hosts',
    why: 'the case runs a file with a linkedin.com URL and asserts reason skip-list',
  },
  {
    id: 'branch-guard-match-inverted',
    file: LIB + 'branch-guard.js',
    find: 'if (currentBranch === expectedBranch) {',
    replace: 'if (currentBranch !== expectedBranch) {',
    dataset: SD + 'branch-guard-exec.yaml',
    filter: 'branch-guard: (matching|mismatching) branches',
    why: 'both cases assert ok and message for equal and different branches',
  },
  {
    id: 'version-prerelease-tag-inverted',
    file: LIB + 'version.js',
    find: 'return tags.includes(',
    replace: 'return !tags.includes(',
    dataset: SD + 'version-lib-exec.yaml',
    filter: 'version-lib: preReleaseTagExists',
    why: 'the case runs the predicate against present and absent tags and expects RESULT: PASS',
  },
  {
    id: 'commit-message-duplicate-allowed',
    file: LIB + 'commit-message.js',
    find: 'if (found.length > 1) out.push',
    replace: 'if (found.length > 2) out.push',
    dataset: SD + 'commit-prepare-exec.yaml',
    filter: 'commit-trailers: \\(G10\\+\\) (second model trailer|lowercase duplicate)',
    why: 'both cases feed a message with two trailer lines and expect exit 4 with the duplicate text',
  },
  {
    id: 'wave-split-depth-off-by-one',
    file: LIB + 'wave-split.js',
    find: 'if (splitDepth >= maxSplitDepth) {',
    replace: 'if (splitDepth > maxSplitDepth) {',
    dataset: SD + 'execute-plan-sdlc-overflow-exec.yaml',
    filter: 'wave-split: depth-ceiling',
    why: 'the case calls splitWave with splitDepth equal to maxSplitDepth and expects MaxSplitDepthExceededError',
  },
  {
    id: 'dimensions-triple-star-allowed',
    file: LIB + 'dimensions.js',
    find: 'if (/\\*{3,}/.test(pattern)) return false;',
    replace: 'if (false) return false;',
    dataset: SD + 'sdlc-dimensions-exec.yaml',
    filter: 'sdlc-dimensions: invalid glob syntax',
    why: 'the fixture trigger is "***/*.js" and the case asserts a D5 error',
  },
  {
    id: 'yaml-multiline-array-empty',
    file: LIB + 'yaml.js',
    find: 'while (i < lines.length && lines[i].match(/^\\s+-\\s+/)) {',
    replace: 'while (false) {',
    dataset: SD + 'sdlc-dimensions-exec.yaml',
    filter: 'sdlc-dimensions: valid dimensions pass all checks',
    why: 'dimension triggers are multiline arrays; empty arrays raise D4 and the case asserts zero errors',
  },
];

function refusal() {
  if (!process.argv.includes('--owner')) return 'missing --owner';
  if ('CI' in process.env) return 'CI is set';
  if ('CLAUDECODE' in process.env) return 'CLAUDECODE is set';
  return null;
}

function check() {
  const problems = [];
  for (const m of MUTATIONS) {
    const file = path.join(REPO_ROOT, m.file);
    if (!fs.existsSync(file)) {
      problems.push({ id: m.id, problem: 'file-missing' });
    } else {
      const text = fs.readFileSync(file, 'utf8');
      const n = text.split(m.find).length - 1;
      if (n === 0) problems.push({ id: m.id, problem: 'find-missing' });
      else if (n > 1) problems.push({ id: m.id, problem: 'find-not-unique' });
    }
    const dataset = path.join(REPO_ROOT, m.dataset);
    if (!fs.existsSync(dataset)) {
      problems.push({ id: m.id, problem: 'dataset-missing' });
    } else {
      const re = new RegExp(m.filter);
      const lines = fs.readFileSync(dataset, 'utf8').split(/\r?\n/);
      if (!lines.some(l => /^\s*-?\s*description:/.test(l) && re.test(l))) {
        problems.push({ id: m.id, problem: 'filter-no-case' });
      }
    }
  }
  return { ok: problems.length === 0, mutations: MUTATIONS.length, problems };
}

function run(only) {
  const todo = only ? MUTATIONS.filter(m => m.id === only) : MUTATIONS;
  if (todo.length === 0) return { ok: false, results: [], error: `unknown --only id: ${only}` };
  const copy = fs.mkdtempSync(os.tmpdir() + '/mutation-smoke-');
  try {
    const skip = [path.join(REPO_ROOT, '.git'), path.join(REPO_ROOT, '.sdlc', 'execution')];
    fs.cpSync(REPO_ROOT, copy, {
      recursive: true,
      filter: src => !skip.includes(src) && path.basename(src) !== 'node_modules',
    });
    const results = [];
    for (const m of todo) {
      const target = path.join(copy, m.file);
      const original = fs.readFileSync(target, 'utf8');
      fs.writeFileSync(target, original.replace(m.find, () => m.replace));
      try {
        const r = spawnSync('npx', ['--yes', PROMPTFOO, 'eval', '-c', 'promptfooconfig-exec.yaml',
          '-j', '1', '--no-cache', '--filter-pattern', m.filter],
        { cwd: path.join(copy, 'tests', 'promptfoo'), encoding: 'utf8', timeout: 600000 });
        if (r.error || r.signal) {
          results.push({ id: m.id, killed: false, exitCode: r.status, error: r.error ? r.error.message : `signal ${r.signal}` });
        } else {
          results.push({ id: m.id, killed: r.status !== 0, exitCode: r.status });
        }
      } finally {
        fs.writeFileSync(target, original);
      }
    }
    return { ok: results.every(r => r.killed), results };
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

try {
  const argv = process.argv;
  let result;
  let code = 0;
  if (argv.includes('--list')) {
    result = { mutations: MUTATIONS.map(({ id, file, dataset, filter }) => ({ id, file, dataset, filter })) };
  } else if (argv.includes('--check')) {
    result = check();
    if (!result.ok) code = 1;
  } else if (argv.includes('--run')) {
    const reason = refusal();
    if (reason) {
      result = { ok: false, refused: reason };
      code = 2;
    } else {
      const i = argv.indexOf('--only');
      if (i >= 0 && (argv[i + 1] === undefined || argv[i + 1].startsWith('--'))) {
        throw new Error('--only needs a mutation id');
      }
      result = run(i >= 0 ? argv[i + 1] : null);
      if (!result.ok) code = 1;
    }
  } else {
    process.stderr.write('Usage: mutation-smoke.js (--list | --check | --run --owner [--only <id>])\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(code);
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
