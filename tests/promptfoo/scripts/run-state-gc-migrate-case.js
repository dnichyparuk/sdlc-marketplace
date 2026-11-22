#!/usr/bin/env node
/**
 * run-state-gc-migrate-case.js
 * Test wrapper for the state/execute.js wave-committed and state-exact-branch cases of
 * datasets/state-gc-migrate-exec.yaml.
 *
 * Each case runs in the case's working dir (a fixture copy), calls state/execute.js, state/ship.js
 * or lib/state.js, and prints one JSON line that the case's assertions read. The exact-branch cases
 * work on a temp copy of the fixture's .sdlc/execution, so reruns see the same files. Every case was
 * a `node -e` program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                   flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                   stdout.
 *
 * Cases (name: description of the case that uses it):
 *   wave-committed-sets-sha: state/execute.js wave-committed sets committedSha on a completed wave (#392)
 *   wave-committed-idempotent: state/execute.js wave-committed is idempotent on identical sha (#392)
 *   exact-read: state-exact-branch: state/ship.js read picks the fix/a, fix-a and fix ledgers by exact branch (R111)
 *   exact-slug: state-exact-branch: file names keep the slug format (R111)
 *   exact-read-twice: state-exact-branch: readState and detectResumeState return the same file twice (R111)
 *   exact-prune-twice: state-exact-branch: pruneStateFiles twice removes the fix/a file once (R111)
 *   exact-gc-sweep: state-exact-branch: gcStateFiles sweeps gone branches, keeps live ones (R109)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-state-gc-migrate-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
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

const SCRIPTS = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts');
const EXECUTE = path.join(SCRIPTS, 'state', 'execute.js');
const SHIP = path.join(SCRIPTS, 'state', 'ship.js');
const STATE_LIB = path.join(SCRIPTS, 'lib', 'state.js');
const SHA = 'abc1234567890abc1234567890abc1234567890a';

function print(value) {
  console.log(JSON.stringify(value));
}

// A temp copy of the case's .sdlc/execution (the case's working dir is a fixture copy).
function copyState(prefix) {
  const t = fs.mkdtempSync(`${os.tmpdir()}/${prefix}`);
  fs.cpSync(`${process.cwd()}/.sdlc/execution`, t, { recursive: true });
  return t;
}

// The three ship ledgers get mtimes so the fix ledger is oldest and the fix-a one newest.
function setMtimes(d) {
  fs.utimesSync(`${d}/ship-fix-a-20261101T000000Z.json`, 2000, 2000);
  fs.utimesSync(`${d}/ship-fix-a-20261102T000000Z.json`, 3000, 3000);
  fs.utimesSync(`${d}/ship-fix-20261103T000000Z.json`, 1000, 1000);
}

function runExecute(args) {
  return cp.spawnSync('node', [EXECUTE, ...args], { cwd: process.cwd(), encoding: 'utf8' });
}

function waveCommitted(branch) {
  const before = runExecute(['read', '--branch', branch]).stdout;
  const r = runExecute(['wave-committed', '--branch', branch, '--wave', '1', '--sha', SHA]);
  const after = runExecute(['read', '--branch', branch]).stdout;
  print({ status: r.status, stderr: r.stderr, before, after });
}

const CASES = {
  'wave-committed-sets-sha'() {
    waveCommitted('feat/commit-waves-state');
  },

  'wave-committed-idempotent'() {
    waveCommitted('feat/commit-waves-already');
  },

  'exact-read'() {
    const d = copyState('seb-');
    setMtimes(d);
    const run = (b) => {
      const r = cp.spawnSync('node', [SHIP, 'read', '--branch', b], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { SDLC_STATE_DIR_OVERRIDE: d, SDLC_BRANCH_OVERRIDE: b }),
      });
      return { status: r.status, branch: r.status === 0 ? JSON.parse(r.stdout).branch : r.stderr };
    };
    const o = { slash: run('fix/a'), dash: run('fix-a'), fix: run('fix') };
    fs.rmSync(d, { recursive: true, force: true });
    print(o);
  },

  'exact-slug'() {
    const s = require(STATE_LIB);
    const d = copyState('seb-');
    process.env.SDLC_STATE_DIR_OVERRIDE = d;
    const o = { slug: s.slugifyBranch('fix/a'), file: s.initState('ship', 'fix/a', { branch: 'fix/a' }).split('/').pop() };
    fs.rmSync(d, { recursive: true, force: true });
    print(o);
  },

  'exact-read-twice'() {
    const s = require(STATE_LIB);
    const d = copyState('seb-');
    process.env.SDLC_STATE_DIR_OVERRIDE = d;
    process.env.SDLC_BRANCH_OVERRIDE = 'fix/a';
    setMtimes(d);
    fs.writeFileSync(`${d}/ship-summary-x.json`, '{}');
    const o = {
      read: [s.readState('ship', 'fix-a'), s.readState('ship', 'fix-a')].map((r) => r && r.filePath.split('/').pop()),
      any: [s.detectResumeState({ prefix: 'ship' }), s.detectResumeState({ prefix: 'ship' })].map((r) => r.stateFile.split('/').pop()),
      slash: s.detectResumeState({ prefix: 'ship', branch: 'fix/a' }).stateFile.split('/').pop(),
    };
    fs.rmSync(d, { recursive: true, force: true });
    print(o);
  },

  'exact-prune-twice'() {
    const s = require(STATE_LIB);
    const d = copyState('seb-');
    process.env.SDLC_STATE_DIR_OVERRIDE = d;
    const o = {
      first: s.pruneStateFiles('ship', 'fix-a', 'fix/a'),
      second: s.pruneStateFiles('ship', 'fix-a', 'fix/a'),
      left: fs.readdirSync(d).sort(),
    };
    fs.rmSync(d, { recursive: true, force: true });
    print(o);
  },

  'exact-gc-sweep'() {
    const s = require(STATE_LIB);
    const d = fs.mkdtempSync(`${os.tmpdir()}/gcs-`);
    process.env.SDLC_STATE_DIR_OVERRIDE = d;
    ['ship-summary-gone.json', 'ship-summary-live.json', 'review-rounds-gone.json'].forEach((n) => fs.writeFileSync(`${d}/${n}`, '{}'));
    const o = { r: s.gcStateFiles({ ttlDays: 0, knownBranches: ['live'] }), left: fs.readdirSync(d).sort() };
    fs.rmSync(d, { recursive: true, force: true });
    print(o);
  },
};

function parseArgs(argv) {
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

CASES[parseArgs(process.argv.slice(2))]();
