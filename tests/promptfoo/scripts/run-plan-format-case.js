#!/usr/bin/env node
/**
 * run-plan-format-case.js
 * Test wrapper for the PF11, PF14, PF13 and plan-format-compact (b) cases of
 * datasets/plan-format-exec.yaml.
 *
 * The PF11/PF14 cases write .sdlc/config.json ({commit: {subjectPattern}}) and plans/c.md (the
 * fixture's plans/test-plan.md with a header line after the title and a tail appended) in the
 * fixture working dir (the case's script_cwd), then print the stdout of
 * `validate-plan-format.js --project-root <cwd> --file <cwd>/plans/c.md --json`. The PF13 cases
 * write a copy of plans/test-plan.md with one word replaced to a temp dir and validate it with
 * --root <cwd>. The compact case prints what lib/plan-parse.js sees in a fixture plan. Every case
 * was a `node -e` program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   pf11-valid: plan-format PF11: valid header subject passes
 *   pf11-73-chars: plan-format PF11: a 73-character subject fails
 *   pf11-dollar: plan-format PF11: a subject with $ fails
 *   pf11-pattern: plan-format PF11: a subject outside commit.subjectPattern fails
 *   pf11-two-fields: plan-format PF11: two header fields fail
 *   pf11-no-backticks: plan-format PF11: a field without backticks fails
 *   pf11-below-header: plan-format PF11: a **Commit:** line below the header is not read
 *   pf11-inner-backtick: plan-format PF11: a subject with an inner backtick fails
 *   pf11-double-quote: plan-format PF11: a subject with a double quote fails
 *   pf11-backslash: plan-format PF11: a subject with a backslash fails
 *   pf14-valid: plan-format: PF14 valid Fix commit subject passes
 *   pf14-73-chars: plan-format: PF14 a 73-character Fix commit subject fails
 *   pf14-duplicate: plan-format: PF14 a duplicate Fix commit field fails
 *   pf13-delete-missing: plan-format: PF13 delete entry of a missing file passes
 *   pf13-deleted-final: plan-format: PF13 deleted entry of a missing file passes with --final
 *   pf13-note-missing: plan-format: PF13 non-delete note of a missing file fails
 *   compact-parse: plan-format-compact: (b) plan-parse sees every task
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-plan-format-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with ci/validate-plan-format.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'ci', 'validate-plan-format.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with ci/validate-plan-format.js\n`);
  process.exit(1);
}

const VALIDATE = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'ci', 'validate-plan-format.js');
const PLAN_PARSE = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'plan-parse.js');
const COMPACT_PLAN = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'project-plan-compact-lightweight', 'plans', 'plan.md');

const COMMIT_CONFIG = { subjectPattern: '^(feat|fix|refactor|chore|docs|test|ci)\\(#\\d+\\): .+ - .+$' };
const LONG_TAIL = 'x'.repeat(48); // with "docs(#9242): plan-sdlc - " a 73-character subject

// PF11/PF14 cases: [header line(s) inserted after the plan title, tail appended to the plan].
const HEADER_CASES = {
  'pf11-valid': ['**Commit:** `docs(#9242): plan-sdlc - probe subject`', ''],
  'pf11-73-chars': ['**Commit:** `docs(#9242): plan-sdlc - ' + LONG_TAIL + '`', ''],
  'pf11-dollar': ['**Commit:** `docs(#9242): plan-sdlc - cost $5`', ''],
  'pf11-pattern': ['**Commit:** `plan-sdlc probe subject`', ''],
  'pf11-two-fields': ['**Commit:** `docs(#9242): plan-sdlc - a`\n**Commit:** `docs(#9242): plan-sdlc - b`', ''],
  'pf11-no-backticks': ['**Commit:** docs(#9242): plan-sdlc - probe', ''],
  'pf11-below-header': ['', '\n**Commit:** not a subject\n'],
  'pf11-inner-backtick': ['**Commit:** `docs(#9242): plan-sdlc - a`b`', ''],
  'pf11-double-quote': ['**Commit:** `docs(#9242): plan-sdlc - say "hi"`', ''],
  'pf11-backslash': ['**Commit:** `docs(#9242): plan-sdlc - a\\b`', ''],
  'pf14-valid': ['**Fix commit:** `fix(#9242): plan-sdlc - probe subject`', ''],
  'pf14-73-chars': ['**Fix commit:** `docs(#9242): plan-sdlc - ' + LONG_TAIL + '`', ''],
  'pf14-duplicate': ['**Fix commit:** `fix(#9242): plan-sdlc - a`\n**Fix commit:** `fix(#9242): plan-sdlc - b`', ''],
};

// PF13 cases: [replacement for "mention the helper" in the plan, extra validate args].
const PF13_CASES = {
  'pf13-delete-missing': ['delete', []],
  'pf13-deleted-final': ['deleted', ['--final']],
  'pf13-note-missing': ['update the delete helper', []],
};

function validate(args) {
  return cp.spawnSync('node', [VALIDATE, ...args], { encoding: 'utf8' }).stdout;
}

function headerCase(header, tail) {
  const d = process.cwd();
  fs.mkdirSync(path.join(d, '.sdlc'), { recursive: true });
  fs.writeFileSync(path.join(d, '.sdlc', 'config.json'), JSON.stringify({ commit: COMMIT_CONFIG }));
  const lines = fs.readFileSync(path.join(d, 'plans', 'test-plan.md'), 'utf8').split('\n');
  fs.writeFileSync(path.join(d, 'plans', 'c.md'), [lines[0], '', header].concat(lines.slice(1)).join('\n') + tail);
  process.stdout.write(validate(['--project-root', d, '--file', path.join(d, 'plans', 'c.md'), '--json']));
}

function pf13Case(replacement, extraArgs) {
  const d = process.cwd();
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'pf13-'));
  fs.writeFileSync(path.join(t, 'c.md'), fs.readFileSync(path.join(d, 'plans', 'test-plan.md'), 'utf8').replace('mention the helper', replacement));
  process.stdout.write(validate(['--project-root', d, '--file', path.join(t, 'c.md'), '--json', '--root', d, ...extraArgs]));
  fs.rmSync(t, { recursive: true });
}

const CASES = {
  'compact-parse'() {
    const p = require(PLAN_PARSE);
    const t = fs.readFileSync(COMPACT_PLAN, 'utf8');
    console.log(JSON.stringify({
      ids: p.parsePlan(t).tasks.map((x) => x.id || x.number),
      nums: p.extractTasks(t).map((x) => x.number),
      compact: p.parsePlan(t).tasks.slice(1).every((x) => x.contract && x.notes),
    }));
  },
};
for (const [name, [header, tail]] of Object.entries(HEADER_CASES)) CASES[name] = () => headerCase(header, tail);
for (const [name, [replacement, extraArgs]] of Object.entries(PF13_CASES)) CASES[name] = () => pf13Case(replacement, extraArgs);

function parseCase(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  return name;
}

CASES[parseCase(process.argv.slice(2))]();
