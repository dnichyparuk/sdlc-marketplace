#!/usr/bin/env node
/**
 * run-ship-prepare-ledger.js
 * Test wrapper for the ship-prepare ledger cases of datasets/ship-prepare-exec.yaml (R75, R76, R15, R64,
 * R-implicit-resume, ship-resume-flags).
 *
 * Each case seeds the fixture working dir (the case's script_cwd), runs skill/ship.js one or more times
 * and prints one JSON line that the case's assertions read. Every case was a `node -e` program before;
 * the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   r75-config-rebase-true: ship-prepare (R75): config ship.rebase true resolves auto with source config
 *   r75-default-rebase-ledger: ship-prepare (R75): the default rebase skip is written into the ledger the step emitter reads
 *   r76-resume-no-tasks: ship-prepare (R76): --resume does not restore --tasks from the ledger
 *   r15-dry-run-resume: ship-prepare (R15): --dry-run --resume leaves the resumed ledger's bytes and mtime unchanged (#9132)
 *   r15-dry-run-implicit-resume: ship-prepare (R15): --dry-run with an implicit resume leaves the ledger's bytes and mtime unchanged (#9132)
 *   r15-dry-run-section-text: ship-prepare (R15): the dry-run section keeps PREPARE_OUTPUT_FILE and runs no rm
 *   r64-adopt-twice: ship-prepare (R64): --plan-mode-blocked twice adopts its own ledger — same stateFile, bytes unchanged, one file
 *   r64-different-plan: ship-prepare (R64): --plan-mode-blocked with a different plan on an unfinished ledger is refused and the ledger is unchanged
 *   r64-no-plan-arg: ship-prepare (R64): --plan-mode-blocked without --plan on an unfinished planned ledger is refused and the ledger is unchanged
 *   r64-same-plan: ship-prepare (R64): --plan-mode-blocked adopts an unfinished ledger of the same plan and leaves it unchanged
 *   r64-no-recorded-plan: ship-prepare (R64): --plan-mode-blocked stops on an unfinished ledger that records no plan and leaves it unchanged
 *   r64-unparsable-ledger: ship-prepare (R64): --plan-mode-blocked stops on a ledger file that cannot be parsed and leaves it unchanged
 *   r64-two-unfinished: ship-prepare (R64): --plan-mode-blocked stops on two unfinished plan-mode ledgers and names both
 *   r64-finished-replaced: ship-prepare (R64): --plan-mode-blocked replaces a finished ledger by init as before
 *   implicit-resume-stale-unparsable: ship-prepare (R-implicit-resume): a stale ledger file that cannot be parsed stops the normal path and is not pruned (#9227)
 *   implicit-resume-fresh-unparsable: ship-prepare (R-implicit-resume): a fresh ledger file that cannot be parsed stops the normal path without a crash (#9227)
 *   r76-tasks-whitespace: ship-prepare (R76): a --tasks value with whitespace is a prepare error (#9231)
 *   resume-flags-merged: ship-resume-flags: (a) --resume rewrites the ledger flags from the merged values
 *   resume-flags-twice: ship-resume-flags: (b) bare --resume twice gives byte-identical ledger flags
 *   resume-flags-frozen-keys: ship-resume-flags: (c) frozen and own-rule keys never change
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-ship-prepare-ledger';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/ship.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/ship.js\n`);
  process.exit(1);
}

const SHIP = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js');
const PLAN_A_TEXT = '# A\n\n### Task 1: A\n';
const STARTED_AT = '2026-10-27T12:00:00.000Z';
const LEDGER_TS = '20261027T120000Z';
const PAUSED_SESSION = { sessionId: 'earlier-session', paused: { at: STARTED_AT, reason: 'fixture' } };
const RESUME_LEDGER = '.sdlc/execution/ship-main-20261027T120000Z.json';

function print(value) {
  console.log(JSON.stringify(value));
}

function cwdPath(...parts) {
  return path.join(process.cwd(), ...parts);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function ship(args, options = {}) {
  return cp.spawnSync('node', [SHIP, ...args], { cwd: process.cwd(), encoding: 'utf8', ...options });
}

// The prepare envelope: ship.js prints the path of its output file.
function readEnvelope(r) {
  return JSON.parse(readText(r.stdout.trim()));
}

// As readEnvelope, from the last stdout line.
function readLastEnvelope(r) {
  return JSON.parse(readText(r.stdout.trim().split('\n').pop()));
}

function shipLedgers(execDir) {
  return fs.readdirSync(execDir).filter(f => /^ship-/.test(f));
}

function sameText(file, before) {
  return fs.existsSync(file) && readText(file) === before;
}

function ledgerFile(execDir, branch, ts) {
  return path.join(execDir, `ship-${branch.replace(/[^a-zA-Z0-9-]/g, '-')}-${ts}.json`);
}

// The fixture's execution dir, current branch and the branch's ledger path (nothing is written).
function branchLedger() {
  const execDir = cwdPath('.sdlc', 'execution');
  const branch = cp.execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  return { execDir, branch, ledger: ledgerFile(execDir, branch, LEDGER_TS) };
}

function planFlags(planFile, extra = {}) {
  return { planFile, openspecContext: null, sources: {}, ...extra };
}

// A two-step ledger (execute, commit) whose steps all have `status`; `session` keys follow `branch`.
function ledgerJson(branch, flags, { status = 'pending', ...session } = {}) {
  return JSON.stringify({
    version: 1,
    startedAt: STARTED_AT,
    branch,
    ...session,
    flags,
    steps: [{ name: 'execute', status }, { name: 'commit', status }],
  });
}

// R15: a --dry-run call leaves the ledger's bytes and mtime unchanged.
function printDryRunUnchanged(ledger, args) {
  const bytes = readText(ledger);
  const mtime = fs.statSync(ledger).mtimeMs;
  const r = ship(args, { env: Object.assign({}, process.env, { CLAUDE_CODE_SESSION_ID: 'w1a-9132' }) });
  print({
    status: r.status,
    out: readEnvelope(r),
    sameBytes: bytes === readText(ledger),
    sameMtime: mtime === fs.statSync(ledger).mtimeMs,
  });
}

// A dry-run ledger of plan-a.md that an earlier, paused session left.
function seedPausedLedger() {
  const { execDir, branch, ledger } = branchLedger();
  fs.mkdirSync(execDir, { recursive: true });
  fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
  fs.writeFileSync(ledger, ledgerJson(branch, planFlags(cwdPath('plan-a.md'), { steps: ['execute', 'commit'] }), PAUSED_SESSION));
  return ledger;
}

// R-implicit-resume: a ledger file that cannot be parsed, optionally older than the stale limit.
function printUnparsableLedgerRun(stale) {
  const { execDir, ledger } = branchLedger();
  const plan = cwdPath('plan-a.md');
  fs.mkdirSync(execDir, { recursive: true });
  fs.writeFileSync(plan, PLAN_A_TEXT);
  fs.writeFileSync(ledger, '{not-json');
  if (stale) fs.utimesSync(ledger, 1767225600, 1767225600);
  const r = ship(['--has-plan', '--plan', plan]);
  print({
    status: r.status,
    out: readEnvelope(r),
    stderr: r.stderr,
    content: fs.existsSync(ledger) ? readText(ledger) : null,
    files: shipLedgers(execDir),
    name: path.basename(ledger),
  });
}

function ledgerFlags() {
  return JSON.parse(readText(RESUME_LEDGER)).flags;
}

function resume(args) {
  return ship(['--resume', '--has-plan', ...args]);
}

const CASES = {
  'r75-config-rebase-true'() {
    fs.mkdirSync(cwdPath('.sdlc'), { recursive: true });
    fs.writeFileSync(cwdPath('.sdlc', 'local.json'), JSON.stringify({ ship: { rebase: true } }));
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    const r = ship(['--has-plan', '--plan', 'plan-a.md']);
    print({ status: r.status, out: readEnvelope(r) });
  },

  'r75-default-rebase-ledger'() {
    fs.writeFileSync('plan-a.md', PLAN_A_TEXT);
    const r = ship(['--has-plan', '--plan', 'plan-a.md']);
    const out = readEnvelope(r);
    print({ status: r.status, out, ledger: JSON.parse(readText(out.state_file)) });
  },

  'r76-resume-no-tasks'() {
    const { execDir, branch, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledger, ledgerJson(branch, planFlags(cwdPath('plan-a.md'), { steps: ['execute', 'commit'], tasks: '3,4' })));
    const r = ship(['--resume', '--has-plan', '--steps', 'execute,commit']);
    print({ status: r.status, out: readEnvelope(r), flags: JSON.parse(readText(ledger)).flags });
  },

  'r15-dry-run-resume'() {
    const ledger = seedPausedLedger();
    fs.utimesSync(ledger, 1767225600, 1767225600);
    printDryRunUnchanged(ledger, ['--dry-run', '--resume', '--has-plan', '--steps', 'execute,commit']);
  },

  'r15-dry-run-implicit-resume'() {
    const ledger = seedPausedLedger();
    printDryRunUnchanged(ledger, ['--dry-run', '--has-plan', '--plan', cwdPath('plan-a.md'), '--steps', 'execute,commit']);
  },

  'r15-dry-run-section-text'() {
    const text = readText(path.join(repoRoot, 'plugins', 'sdlc-utilities', 'skills', 'ship-sdlc', 'entry-modes.md'));
    const section = text.slice(text.indexOf('## Dry-run mode'));
    const count = (needle) => section.split(needle).length - 1;
    print({ keep: count('Leave `PREPARE_OUTPUT_FILE` in place'), rm: count('rm -') });
  },

  'r64-adopt-twice'() {
    const run = () => {
      const r = ship(['--plan-mode-blocked', '--bump', 'patch', '--has-plan']);
      return { status: r.status, sf: readEnvelope(r).stateFile };
    };
    const a = run();
    const before = readText(a.sf);
    const b = run();
    print({ status: a.status + b.status, stateFile: b.sf, same: a.sf === b.sf, unchanged: readText(b.sf) === before });
  },

  'r64-different-plan'() {
    const { execDir, branch, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(cwdPath('plan-b.md'), '# B\n\n### Task 1: B\n');
    fs.writeFileSync(ledger, ledgerJson(branch, planFlags(cwdPath('plan-a.md'))));
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan', '--plan', cwdPath('plan-b.md')]);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, unchanged: sameText(ledger, before), files: shipLedgers(execDir) });
  },

  'r64-no-plan-arg'() {
    const { execDir, branch, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledger, ledgerJson(branch, planFlags(cwdPath('plan-a.md'))));
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan']);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, unchanged: sameText(ledger, before), files: shipLedgers(execDir) });
  },

  'r64-same-plan'() {
    const { execDir, branch, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledger, ledgerJson(branch, planFlags(cwdPath('plan-a.md'))));
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan', '--plan', cwdPath('plan-a.md')]);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, led: ledger, unchanged: sameText(ledger, before), files: shipLedgers(execDir) });
  },

  'r64-no-recorded-plan'() {
    const ledger = cwdPath('.sdlc', 'execution', 'ship-feat-test-plan-mode-20240101T000000Z.json');
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--bump', 'patch', '--has-plan']);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, unchanged: sameText(ledger, before), files: shipLedgers(path.dirname(ledger)) });
  },

  'r64-unparsable-ledger'() {
    const { execDir, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledger, '{not-json');
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan']);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, led: ledger, unchanged: sameText(ledger, before), files: shipLedgers(execDir) });
  },

  'r64-two-unfinished'() {
    const { execDir, branch, ledger } = branchLedger();
    const planModeLedger = ledgerJson(branch, { planModeBlocked: true });
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledgerFile(execDir, branch, '20261027T120000Z'), planModeLedger);
    fs.writeFileSync(ledgerFile(execDir, branch, '20261027T130000Z'), planModeLedger);
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan']);
    const unchanged = fs.existsSync(ledger)
      && shipLedgers(execDir).every(f => readText(path.join(execDir, f)) === before)
      && shipLedgers(execDir).length === 2;
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, led: ledger, unchanged, files: shipLedgers(execDir) });
  },

  'r64-finished-replaced'() {
    const { execDir, branch, ledger } = branchLedger();
    fs.mkdirSync(execDir, { recursive: true });
    fs.writeFileSync(cwdPath('plan-a.md'), PLAN_A_TEXT);
    fs.writeFileSync(ledger, ledgerJson(branch, { planModeBlocked: true }, { status: 'completed' }));
    const before = readText(ledger);
    const r = ship(['--plan-mode-blocked', '--has-plan']);
    print({ status: r.status, out: readEnvelope(r), stderr: r.stderr, led: ledger, unchanged: sameText(ledger, before), files: shipLedgers(execDir) });
  },

  'implicit-resume-stale-unparsable'() {
    printUnparsableLedgerRun(true);
  },

  'implicit-resume-fresh-unparsable'() {
    printUnparsableLedgerRun(false);
  },

  'r76-tasks-whitespace'() {
    const r = ship(['--has-plan', '--tasks', '1 --auto']);
    print({ status: r.status, out: readLastEnvelope(r) });
  },

  'resume-flags-merged'() {
    const r = resume(['--bump', 'minor', '--review-threshold', 'medium']);
    print({ status: r.status, flags: ledgerFlags() });
  },

  'resume-flags-twice'() {
    const s1 = resume([]).status;
    const f1 = JSON.stringify(ledgerFlags());
    const s2 = resume([]).status;
    print({ s1, s2, f1, f2: JSON.stringify(ledgerFlags()) });
  },

  'resume-flags-frozen-keys'() {
    const b = ledgerFlags();
    const r = resume(['--bump', 'minor']);
    print({ status: r.status, b, a: ledgerFlags() });
  },
};

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
