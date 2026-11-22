#!/usr/bin/env node
/**
 * run-execute-overflow-case.js
 * Test wrapper for the `node -e` cases of datasets/execute-plan-sdlc-overflow-exec.yaml.
 *
 * Each case drives state/execute.js (or counts strings of the execute-plan-sdlc skill text read at
 * run time) and prints one JSON line (or a bare JSON array) that the case's assertions read. Every
 * case was a `node -e` program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>      One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                      flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                      stdout.
 *   --fixture <dir>    Required by verify-completeness-final: the case's project_root (holds the
 *                      state-*.json files). Other cases read the state fixture from the working
 *                      dir (the case's script_cwd) and ignore it.
 *
 * Cases (name: description of the case that uses it):
 *   verify-completeness-final: wave-runner-overflow/verify-completeness: (R94) --final passes a skipped record with a reason and a state without specReviewRequired
 *   spec-review-twice: wave-runner-overflow/spec-review: (R94) run twice keeps the second record, other fields unchanged, and --final gives the same verdict twice
 *   cleanup-verify-kept: cleanup-verify: (R94) a state with specReviewRequired and no record is kept and cleanup exits 65
 *   skill-text-step-8-bis: wave-runner-overflow/skill-text: (R94) Step 8-bis has three skipped calls and one ran call
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-execute-overflow-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name> [--fixture <dir>]\n`);
  process.exit(2);
}

// Locate repo root with state/execute.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with state/execute.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const EXECUTE = path.join(PLUGIN, 'scripts', 'state', 'execute.js');
const SKILL = path.join(PLUGIN, 'skills', 'execute-plan-sdlc', 'SKILL.md');
const STATE_NAME = 'execute-fix-cleanup-20261020T120000Z.json';
const UNRECORDED = 'state-spec-review-unrecorded.json';

function print(value) {
  console.log(JSON.stringify(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function tempDir(prefix) {
  return fs.mkdtempSync(`${os.tmpdir()}/${prefix}`);
}

function removeDir(d) {
  fs.rmSync(d, { recursive: true, force: true });
}

// execute.js <args> with the state dir overridden to `stateDir`.
function runIn(stateDir, args) {
  const env = Object.assign({}, process.env, { SDLC_STATE_DIR_OVERRIDE: stateDir });
  return cp.spawnSync('node', [EXECUTE, ...args], { env, encoding: 'utf8' });
}

let fixture = null;

const CASES = {
  'verify-completeness-final'() {
    print(['state-spec-review-skipped.json', 'state-all-done.json'].map((f) =>
      cp.spawnSync('node', [EXECUTE, 'verify-completeness', '--final', '--state-file', `${fixture}/${f}`], { encoding: 'utf8' }).status));
  },

  'spec-review-twice'() {
    const t = tempDir('spec-review-');
    const f = `${t}/${STATE_NAME}`;
    fs.copyFileSync(`${process.cwd()}/${UNRECORDED}`, f);
    const o = JSON.parse(readText(f));
    const a = runIn(t, ['spec-review', '--branch', 'fix/cleanup', '--status', 'ran', '--reason', 'a']);
    const b = runIn(t, ['spec-review', '--branch', 'fix/cleanup', '--status', 'skipped', '--reason', 'b']);
    const d = JSON.parse(readText(f));
    const v1 = runIn(t, ['verify-completeness', '--final', '--state-file', f]);
    const v2 = runIn(t, ['verify-completeness', '--final', '--state-file', f]);
    removeDir(t);
    print({
      a: a.status,
      b: b.status,
      second: d.specReview.status === 'skipped' && d.specReview.reason === 'b',
      rest: JSON.stringify(Object.assign({}, d, { specReview: undefined })) === JSON.stringify(o),
      v: [v1.status, v2.status],
      same: v1.stdout === v2.stdout && v1.stderr === v2.stderr,
    });
  },

  'cleanup-verify-kept'() {
    const t = tempDir('spec-cleanup-');
    const f = `${t}/${STATE_NAME}`;
    fs.copyFileSync(`${process.cwd()}/${UNRECORDED}`, f);
    const r = runIn(t, ['cleanup', '--branch', 'fix/cleanup']);
    const kept = fs.existsSync(f);
    removeDir(t);
    print({ status: r.status, kept, stderr: r.stderr });
  },

  'skill-text-step-8-bis'() {
    const s = readText(SKILL);
    const c = (t) => s.split(t).length - 1;
    print({
      all: c('state/execute.js" spec-review --status'),
      skipped: c('state/execute.js" spec-review --status skipped'),
      ran: c('state/execute.js" spec-review --status ran'),
    });
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
  if (name === 'verify-completeness-final' && fixture === null) usage(`--fixture is required by ${name}`);
  return name;
}

CASES[parseArgs(process.argv.slice(2))]();
