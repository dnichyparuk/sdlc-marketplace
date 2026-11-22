#!/usr/bin/env node
/**
 * run-plan-prepare-case.js
 * Test wrapper for the plan-prepare, plan-tier, plan-splice and plan-sdlc skill-text cases of
 * datasets/plan-prepare-exec.yaml.
 *
 * Each case spawns skill/plan.js with an argv array (in the case's working dir, or in a temp dir),
 * calls tierCheck of lib/plan-critique.js on a generated plan, runs `plan.js splice` on temp copies
 * of a fixture plan, or counts sentences of the plan-sdlc skill text read at run time, and prints
 * one JSON line that the case's assertions read. Every case was a `node -e` program before; the
 * output is byte-compatible with it.
 *
 * Args:
 *   --case <name>      One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                      flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                      stdout.
 *   --fixture <dir>    Required by the splice-* cases: the case's project_root (plan-splice holds
 *                      plan.md and merged.json, plan-splice-latest holds the iter-N critique dirs).
 *                      Other cases ignore it.
 *
 * Cases (name: description of the case that uses it):
 *   quality-invalid: plan-prepare: invalid --quality exits 1 with an errors entry
 *   quality-alias: plan-prepare: (quality-alias) deprecated --quality full and minimal print exactly one warning each
 *   lightweight-flag: plan-prepare: (lightweight) flag resolves and warns about --quality
 *   lightweight-no-explore: plan-prepare: (lightweight) no explore pack (A5, P8)
 *   t4f-commit-config: plan-prepare T4f: commit carries the project commit config (P23)
 *   tier-e: plan-tier: (e) usage errors exit 1
 *   tier-f: plan-tier: (f) files-only breach
 *   tier-g: plan-tier: (g) six tasks stay lightweight
 *   tier-h: plan-tier: (h) seven tasks breach only the tasks bound
 *   tier-i: plan-tier: (i) marked entries are not counted
 *   tasks-heading: plan-sdlc/tasks-heading: plan-format-reference.md and SKILL.md name the literal ## Tasks heading that PF10 checks (R61, #9405)
 *   lightweight-sentinels: plan-sdlc/lightweight-sentinels: SKILL.md and review-loop.md read the routing fields (A5, R73, R74, R36)
 *   critique-rounds: plan-sdlc/critique-rounds: SKILL.md and review-loop.md dispatch critiqueDispatch per round, keep the no-agent-tool fallback and splice with plan.js (R75, R67 (f))
 *   audit-w33: plan-sdlc/audit-w33: Step 7 pointer condition, review.lenses and the non-zero-exit lens rule (R41, R36, E9, #9435, #9437)
 *   rerun-sentinels: plan-sdlc/rerun-sentinels: orchestrator and review-loop name R76
 *   splice-a: plan-splice: (a) places and replaces sections
 *   splice-b: plan-splice: (b) idempotent
 *   splice-c: plan-splice: (c) skips absent data
 *   splice-d: plan-splice: (d) --critique-dir writes the newest guardrail table only (R77)
 *   splice-e: plan-splice: (e) --critique-dir usage and empty cases (R77)
 *   splice-f: plan-splice: (f) --critique-dir fails closed on a bad newest merged.json, skips a non-directory iter entry (R77)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-plan-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name> [--fixture <dir>]\n`);
  process.exit(2);
}

// Locate repo root with skill/plan.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'plan.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/plan.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const PLAN = path.join(PLUGIN, 'scripts', 'skill', 'plan.js');
const PLAN_CRITIQUE_LIB = path.join(PLUGIN, 'scripts', 'lib', 'plan-critique.js');
const SKILL = path.join(PLUGIN, 'skills', 'plan-sdlc', 'SKILL.md');
const REVIEW_LOOP = path.join(PLUGIN, 'skills', 'plan-sdlc', 'review-loop.md');
const FORMAT_REFERENCE = path.join(PLUGIN, 'skills', 'plan-sdlc', 'plan-format-reference.md');
const ORCHESTRATOR = path.join(PLUGIN, 'agents', 'plan-critique-orchestrator.md');
const SPLICE_FIXTURE = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'plan-splice');
const SPLICE_PLAN = path.join(SPLICE_FIXTURE, 'plan.md');
const SPLICE_MERGED = path.join(SPLICE_FIXTURE, 'merged.json');

function print(value) {
  console.log(JSON.stringify(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

function tempDir(prefix) {
  return fs.mkdtempSync(`${os.tmpdir()}/${prefix}`);
}

function removeDir(d) {
  fs.rmSync(d, { recursive: true, force: true });
}

// plan.js <args> in `cwd` (default: this process's working dir, the case's script_cwd).
function spawnPlan(args, cwd) {
  const options = { encoding: 'utf8' };
  if (cwd) options.cwd = cwd;
  return cp.spawnSync('node', [PLAN, ...args], options);
}

function warnings(stderr) {
  return stderr.split('\n').filter((l) => l.indexOf('Warning:') === 0);
}

// The manifest whose path plan.js printed on stdout.
function manifest(r) {
  return JSON.parse(readText(r.stdout.trim()));
}

// A plan of `count` Standard tasks; filesOf(i) lists the **Files:** entries of task i.
function tierPlan(count, filesOf) {
  return Array.from({ length: count }, (_, i) =>
    `### Task ${i + 1}: T\n\n**Complexity:** Standard\n\n**Files:**\n${filesOf(i).join('\n')}\n`).join('\n');
}

function tier(plan) {
  print(require(PLAN_CRITIQUE_LIB).tierCheck(plan));
}

// plan.js splice --plan <planFile> <args>: exit status, stderr, stdout and the parsed stdout.
function splice(planFile, args) {
  const r = spawnPlan(['splice', '--plan', planFile, ...args]);
  return { status: r.status, err: r.stderr, stdout: r.stdout, out: r.stdout ? JSON.parse(r.stdout) : null };
}

let fixture = null;

const CASES = {
  'quality-invalid'() {
    const r = spawnPlan(['--quality', 'bogus']);
    print({ exitCode: r.status, out: manifest(r) });
  },

  'quality-alias'() {
    print(['full', 'minimal'].map((v) => {
      const r = spawnPlan(['--quality', v]);
      return { v, exitCode: r.status, warnings: warnings(r.stderr), flags: manifest(r).flags };
    }));
  },

  'lightweight-flag'() {
    const r = spawnPlan(['--lightweight', '--quality', 'speed']);
    print({ exitCode: r.status, warnings: warnings(r.stderr), flags: manifest(r).flags });
  },

  'lightweight-no-explore'() {
    const r = spawnPlan(['--output-file', '--lightweight']);
    print({ exitCode: r.status, explorePack: manifest(r).explorePack });
  },

  't4f-commit-config'() {
    const d = tempDir('plan-commit-');
    cp.spawnSync('git', ['init', '-q'], { cwd: d });
    fs.mkdirSync(`${d}/.sdlc`);
    fs.writeFileSync(`${d}/.sdlc/config.json`, JSON.stringify({ commit: { subjectPattern: '^fix: .+$', allowedTypes: ['fix'] } }));
    const o = manifest(spawnPlan(['--output-file'], d));
    removeDir(d);
    print(o);
  },

  'tier-e'() {
    print([['tier'], ['tier', '--bogus', 'x']].map((a) => spawnPlan(a).status));
  },

  'tier-f'() {
    tier(tierPlan(2, (i) => Array.from({ length: i ? 4 : 5 }, (_, j) => `- Modify: \`p${i}_${j}.js\``)));
  },

  'tier-g'() {
    tier(tierPlan(6, (i) => [`- Modify: \`p${i}.js\``]));
  },

  'tier-h'() {
    tier(tierPlan(7, (i) => [`- Modify: \`p${i}.js\``]));
  },

  'tier-i'() {
    const marks = [' — check only, no change expected (copy rule)', ' — byte copy'];
    tier(tierPlan(2, (i) => Array.from({ length: 3 }, (_, j) => `- Modify: \`e${i}_${j}.js\``)
      .concat(Array.from({ length: i ? 2 : 3 }, (_, j) => `- Modify: \`m${i}_${j}.js\`${marks[j % 2]}`))));
  },

  'tasks-heading'() {
    const f = readText(FORMAT_REFERENCE);
    const s = readText(SKILL);
    print({
      order: countOf(f, '8. **Tasks** — the literal `## Tasks` heading, then the `### Task N` blocks (required; PF10 checks the heading)'),
      perTask: countOf(f, 'Every `### Task N` block goes under the literal `## Tasks` heading; PF10 checks the heading.'),
      example: countOf(f, '\n## Tasks\n\n### Task 1: JWT utility module'),
      skill: countOf(s, 'the literal `## Tasks` heading (PF10 checks it)'),
    });
  },

  'lightweight-sentinels'() {
    const s = readText(SKILL);
    const l = readText(REVIEW_LOOP);
    print({
      tier: countOf(s, 'plan.js" tier --plan'),
      final: countOf(s, '--final --template'),
      noApply: countOf(s, 'PF9 and PF10 do not apply'),
      recheck: countOf(s, 'recheckLanes'),
      lightweight: countOf(s, 'flags.lightweight === true'),
      ge5: countOf(l, '≥5 tasks'),
      lt5: countOf(l, '<5 tasks'),
      lenses: countOf(l, 'dispatch.lenses'),
    });
  },

  'critique-rounds'() {
    const s = readText(SKILL);
    const l = readText(REVIEW_LOOP);
    const latest = 'splice --plan "<PLAN_PATH>" --critique-dir';
    print({
      skillDispatch: countOf(s, 'critiqueDispatch'),
      loopDispatch: countOf(l, 'critiqueDispatch'),
      skillFallback: countOf(s, 'no-agent-tool'),
      loopFallback: countOf(l, 'no-agent-tool'),
      skillSplice: countOf(s, 'plan.js" splice'),
      loopSplice: countOf(l, 'plan.js" splice'),
      skillLatest: countOf(s, latest),
      loopLatest: countOf(l, latest),
    });
  },

  'audit-w33'() {
    const s = readText(SKILL);
    const o = readText(ORCHESTRATOR);
    const l = readText(REVIEW_LOOP);
    print({
      pointer: countOf(s, 'holds one of the three verdict labels below (Gate B ran in Step 5)'),
      nonMaterial: countOf(o, '`review.lenses` (the review route of the plan as it is now, R36) plus the lanes'),
      nonZero: countOf(o, 'plus lens `all` when `DISPATCH` names `all`'),
      loopReview: countOf(l, 'and from its `review.lenses` when they were not'),
      loopAll: countOf(l, '`dispatch.lenses` to `["all"]` when this iteration dispatched lens `all`'),
      old: countOf(o, 'dispatch the lenses of `DISPATCH` only'),
    });
  },

  'rerun-sentinels'() {
    print({ o: readText(ORCHESTRATOR), l: readText(REVIEW_LOOP) });
  },

  'splice-a'() {
    const t = tempDir('plan-splice-');
    fs.copyFileSync(`${fixture}/plan.md`, `${t}/plan.md`);
    const { status, err, out } = splice(`${t}/plan.md`, ['--merged', `${fixture}/merged.json`]);
    const o = { status, err, out, text: readText(`${t}/plan.md`) };
    removeDir(t);
    print(o);
  },

  'splice-b'() {
    const t = tempDir('plan-splice-');
    fs.copyFileSync(`${fixture}/plan.md`, `${t}/plan.md`);
    const run = () => {
      const { status, out } = splice(`${t}/plan.md`, ['--merged', `${fixture}/merged.json`]);
      return { status, out, text: readText(`${t}/plan.md`) };
    };
    const first = run();
    const second = run();
    removeDir(t);
    print({ first, second });
  },

  'splice-c'() {
    const t = tempDir('plan-splice-');
    const base = JSON.parse(readText(`${fixture}/merged.json`));
    const run = (n, merged, extra) => {
      fs.copyFileSync(`${fixture}/plan.md`, `${t}/${n}.md`);
      fs.writeFileSync(`${t}/${n}.json`, JSON.stringify(merged));
      const { status, out } = splice(`${t}/${n}.md`, ['--merged', `${t}/${n}.json`, ...extra]);
      return { status, out, text: readText(`${t}/${n}.md`) };
    };
    const o = {
      noGuardrails: run('a', base, ['--no-guardrails']),
      noFindings: run('b', { ...base, g17Findings: { findings: [], suppressed_count: 0, rendering: '' } }, []),
      noScorecard: run('c', { ...base, scorecard: null }, []),
    };
    removeDir(t);
    print(o);
  },

  'splice-d'() {
    const t = tempDir('plan-splice-');
    const oldTable = '## Guardrail Compliance\n\n|g|s|st|r|\n|---|---|---|---|\n|x|warning|FAIL|old|';
    fs.writeFileSync(`${t}/plan.md`, readText(SPLICE_PLAN).replace('## Deviations', `${oldTable}\n\n## Deviations`));
    const { status, err, out } = splice(`${t}/plan.md`, ['--critique-dir', fixture]);
    const o = { status, err, out, text: readText(`${t}/plan.md`) };
    removeDir(t);
    print(o);
  },

  'splice-e'() {
    const t = tempDir('plan-splice-');
    fs.mkdirSync(`${t}/nulldir/iter-0`, { recursive: true });
    fs.writeFileSync(`${t}/nulldir/iter-0/merged.json`, '{"guardrailCompliancePayload":null}');
    const run = (n, args) => {
      fs.copyFileSync(SPLICE_PLAN, `${t}/${n}.md`);
      return { ...splice(`${t}/${n}.md`, args), same: readText(`${t}/${n}.md`) === readText(SPLICE_PLAN) };
    };
    const o = {
      both: run('a', ['--merged', SPLICE_MERGED, '--critique-dir', fixture]),
      neither: run('b', []),
      missing: run('c', ['--critique-dir', `${t}/nope`]),
      nullOnly: run('d', ['--critique-dir', `${t}/nulldir`]),
      noG: run('e', ['--critique-dir', fixture, '--no-guardrails']),
      noGMissing: run('f', ['--critique-dir', `${t}/nope`, '--no-guardrails']),
    };
    removeDir(t);
    print(o);
  },

  'splice-f'() {
    const t = tempDir('plan-splice-');
    const orig = readText(SPLICE_PLAN);
    const mk = (n) => {
      fs.cpSync(fixture, `${t}/${n}`, { recursive: true });
      return `${t}/${n}`;
    };
    const run = (n, critiqueDir) => {
      fs.copyFileSync(SPLICE_PLAN, `${t}/${n}.md`);
      return { ...splice(`${t}/${n}.md`, ['--critique-dir', critiqueDir]), same: readText(`${t}/${n}.md`) === orig };
    };
    const a = mk('a');
    const b = mk('b');
    const c = mk('c');
    fs.writeFileSync(`${a}/iter-2/merged.json`, '{x');
    fs.rmSync(`${b}/iter-2/merged.json`);
    fs.mkdirSync(`${b}/iter-2/merged.json`);
    fs.writeFileSync(`${c}/iter-9`, 'x');
    const o = { invalid: run('a', a), unreadable: run('b', b), notDir: run('c', c) };
    removeDir(t);
    print(o);
  },
};

function parseArgs(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else if (argv[i] === '--fixture') {
      if (i + 1 >= argv.length) usage('--fixture needs a value');
      fixture = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  if (name.startsWith('splice-') && fixture === null) usage(`--fixture is required by ${name}`);
  return name;
}

CASES[parseArgs(process.argv.slice(2))]();
