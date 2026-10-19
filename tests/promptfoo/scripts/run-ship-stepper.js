#!/usr/bin/env node
/**
 * run-ship-stepper.js
 * Test wrapper for the ship.js step emitter (P-STEP-1..4, P-TRANS-1).
 *
 * Runs one or more skill/ship.js calls (the initial call and/or `--after` calls)
 * against the project-ship-stepper fixture and prints exactly one JSON line so
 * every assertion is a `javascript` check over it. A wrapper is needed because
 * most scenarios chain several calls (the `--state` of a call is the
 * `state_file` of the previous envelope) and assert the persisted ledger.
 *
 * Args:
 *   --project-root <p>   Fixture working dir (copied to tmp by the harness)
 *   --scenario <name>    initial | initial-dry-run | initial-resume-legacy |
 *                        legacy-twice | after-confirm | edit-cancel |
 *                        after-commit-ok | after-commit-fail | after-cleanup |
 *                        after-version-no-tag | after-bad-result |
 *                        step-list-equal | branch-migrate | resumed-completed |
 *                        emit-in-progress | review-gate-rows | ttl-days |
 *                        worktree-mismatch | after-execute | plan-no-tasks | after-commit-fail-gc |
 *                        rebase-emit | inline-fail-<step-with-dashes> | forced-cleanup
 *   --plan <path>        Plan passed to initial calls only (never to --after, L8)
 *   --result <rel>       Result file (relative to project-root) for the scenario's --after call
 *   --seed <name>        legacy | frozen | frozen-dryrun | frozen-branch | frozen-resumed | frozen-exec | none
 *                        (copies seed/ledger-<name>.json to .sdlc/execution/ship-<slug>-<ts>.json)
 *   --exec-seed <name>   complete | missing | noplanned | none
 *                        (copies seed/execute-<name>.json to .sdlc/execution/execute-feat-ship-<ts>.json)
 *   --answer <a>         yes | edit | cancel — answer file used for confirm_pipeline/review_gate
 *
 * Output JSON (one line):
 *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], ledger, ledgerExists, ledgerFiles }
 *   ledger = { stepStatuses, history, currentStep, flagsKeys, flags, paused } | null
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let scenario = 'initial';
let plan = null;
let resultRel = null;
let seed = 'none';
let answer = 'yes';
let execSeed = 'none';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  else if (args[i] === '--scenario' && args[i + 1]) scenario = args[++i];
  else if (args[i] === '--plan' && args[i + 1]) plan = args[++i];
  else if (args[i] === '--result' && args[i + 1]) resultRel = args[++i];
  else if (args[i] === '--seed' && args[i + 1]) seed = args[++i];
  else if (args[i] === '--answer' && args[i + 1]) answer = args[++i];
  else if (args[i] === '--exec-seed' && args[i + 1]) execSeed = args[++i];
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
  console.log(JSON.stringify({ error: 'Could not find repo root with skill/ship.js' }));
  process.exit(0);
}

const shipScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js');
const execDir = path.join(projectRoot, '.sdlc', 'execution');
const SEED_TS = '20261019T120000Z';

// Stub `gh` so the initial call's auth preflight passes offline.
const stubDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ship-stepper-gh-'));
fs.writeFileSync(path.join(stubDir, 'gh'), '#!/bin/sh\necho "Logged in to github.com account fixture"\nexit 0\n', { mode: 0o755 });
const env = { ...process.env, PATH: stubDir + path.delimiter + (process.env.PATH || '') };
delete env.SDLC_STATE_DIR_OVERRIDE;

const calls = [];
let statePath = null;

function sh(cmd) {
  return spawnSync('sh', ['-c', cmd], { cwd: projectRoot, env, encoding: 'utf8', timeout: 8000 });
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function ledgerFiles() {
  try { return fs.readdirSync(execDir).filter(f => /^ship-.*\.json$/.test(f)).sort(); } catch (_) { return []; }
}

function ship(shipArgs) {
  const res = spawnSync('node', [shipScript, ...shipArgs], { cwd: projectRoot, env, encoding: 'utf8', timeout: 8000 });
  const out = (res.stdout || '').trim();
  let envelope = null;
  if (out && !out.includes('\n') && fs.existsSync(out)) envelope = readJson(out);
  if (envelope && envelope.state_file) statePath = envelope.state_file;
  const ledger = envelope && envelope.state_file ? readJson(envelope.state_file) : null;
  calls.push({
    args: shipArgs,
    exitCode: res.status ?? -1,
    envelope: envelope || { raw: out, stderr: (res.stderr || '').trim() },
    stateFlags: ledger ? ledger.flags : null,
  });
  return envelope || {};
}

function initial(extra = []) {
  const planArgs = plan ? ['--has-plan', '--plan', path.resolve(projectRoot, plan)] : [];
  return ship([...planArgs, ...extra]);
}

function after(id, rel) {
  return ship(['--after', id, '--result-file', path.join(projectRoot, rel), '--state', statePath || '']);
}

function seedLedger(name, patch) {
  if (name === 'frozen-branch') sh('git checkout -q main');
  const data = readJson(path.join(projectRoot, 'seed', `ledger-${name}.json`));
  if (patch) patch(data);
  fs.mkdirSync(execDir, { recursive: true });
  statePath = path.join(execDir, `ship-${data.branch.replace(/[^a-zA-Z0-9-]/g, '-')}-${SEED_TS}.json`);
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
}

function clearLedgers() {
  for (const f of ledgerFiles()) fs.unlinkSync(path.join(execDir, f));
}

// Answer each emitted step with yes.json (decisions) or generic-ok.json until done.
function walk(env0) {
  let envelope = env0;
  for (let i = 0; i < 12 && envelope && envelope.status === 'step'; i++) {
    const id = envelope.step.id;
    envelope = after(id, ['confirm_pipeline', 'review_gate'].includes(id) ? `results/${answer}.json` : 'results/generic-ok.json');
  }
}

if (seed !== 'none' && !['initial', 'initial-dry-run', 'step-list-equal', 'ttl-days'].includes(scenario)) {
  const result = resultRel ? readJson(path.join(projectRoot, resultRel)) : null;
  seedLedger(seed, (data) => {
    if (scenario === 'review-gate-rows' && result && result.threshold) data.flags.reviewThreshold = result.threshold;
    if (scenario === 'emit-in-progress') data.paused = { at: '2026-10-19T12:00:00.000Z', reason: 'fixture' };
    if (scenario === 'worktree-mismatch') data.worktree = path.dirname(projectRoot);
    if (scenario === 'rebase-emit') { data.flags.rebase = 'auto'; data.flags.auto = true; }
    if (scenario.startsWith('inline-fail-') || scenario === 'forced-cleanup') {
      const nm = scenario === 'forced-cleanup' ? 'learnings-commit' : scenario.slice('inline-fail-'.length);
      data.flags.auto = true;
      if (!data.flags.steps.includes(nm)) data.flags.steps.push(nm);
      const e = data.steps.find(x => x.name === nm);
      if (e) e.status = 'in_progress'; else data.steps.push({ name: nm, status: 'in_progress' });
    }
    if (scenario === 'plan-no-tasks') data.flags.planFile = path.join(projectRoot, 'plan-notasks.md');
  });
}
if (execSeed !== 'none') {
  fs.mkdirSync(execDir, { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'seed', `execute-${execSeed}.json`), path.join(execDir, `execute-feat-ship-${SEED_TS}.json`));
}

switch (scenario) {
  case 'initial':
    clearLedgers();
    initial();
    break;
  case 'initial-dry-run':
    clearLedgers();
    initial(['--dry-run']);
    break;
  case 'initial-resume-legacy':
    initial();
    break;
  case 'legacy-twice':
    initial();
    initial();
    break;
  case 'after-confirm':
  case 'edit-cancel':
  case 'resumed-completed':
    after('confirm_pipeline', resultRel || `results/${answer}.json`);
    break;
  case 'after-commit-ok':
  case 'after-commit-fail':
    after('dispatch_commit', resultRel);
    break;
  case 'after-commit-fail-gc': {
    // R38 failure-path sweep (M7): a stale ledger of a branch that no longer exists
    // must be pruned when a step fails; the failed ledger itself is kept.
    const orphan = path.join(execDir, 'ship-gone-branch-20200101T000000Z.json');
    fs.writeFileSync(orphan, JSON.stringify({ version: 1, branch: 'gone-branch', steps: [] }));
    const old = new Date(Date.now() - 30 * 86400000);
    fs.utimesSync(orphan, old, old);
    after('dispatch_commit', resultRel || 'results/commit-fail.json');
    break;
  }
  case 'rebase-emit': {
    // A real local origin so `git fetch origin` succeeds; rebase.flag auto + version runnable.
    sh('git init -q --bare ../origin-bare.git && git remote add origin ../origin-bare.git && git push -q origin main && git fetch -q origin');
    const gate = after('dispatch_review', resultRel || 'results/review-approved.json');
    if (gate.status === 'step' && gate.step.id === 'review_gate') after('review_gate', `results/${answer}.json`);
    break;
  }
  case 'forced-cleanup':
    // learnings_commit fails (non-fatal) -> forced cleanup is emitted with the ledger kept.
    after('learnings_commit', 'results/commit-fail.json');
    after('cleanup', 'results/cleanup-ok.json');
    break;
  case 'after-execute':
    after('dispatch_execute', resultRel || 'results/execute-ok.json');
    break;
  case 'plan-no-tasks':
    after('confirm_pipeline', `results/${answer}.json`);
    break;
  case 'after-version-no-tag':
    after('dispatch_version', resultRel || 'results/version-tag-missing.json');
    break;
  case 'after-bad-result':
    after('confirm_pipeline', resultRel || 'results/does-not-exist.json');
    break;
  case 'after-cleanup': {
    after('learnings_commit', 'results/generic-ok.json');
    // The normal cleanup-pipeline deletes the ledger before `--after cleanup`.
    if (statePath) fs.rmSync(statePath, { force: true });
    after('cleanup', resultRel || 'results/cleanup-ok.json');
    break;
  }
  case 'step-list-equal': {
    clearLedgers();
    initial(['--steps', 'commit']);
    // A config change after init must not change the frozen step plan (L6).
    fs.writeFileSync(path.join(projectRoot, '.sdlc', 'local.json'), JSON.stringify({ ship: { steps: ['commit', 'review'] } }));
    walk(after('confirm_pipeline', `results/${answer}.json`));
    break;
  }
  case 'ttl-days': {
    clearLedgers();
    initial(['--steps', 'commit', '--ttl-days', '3']);
    walk(after('confirm_pipeline', `results/${answer}.json`));
    break;
  }
  case 'branch-migrate': {
    const env1 = after('confirm_pipeline', 'results/yes.json');
    const cmd = env1.step && env1.step.data && env1.step.data.commands && env1.step.data.commands[0];
    if (cmd) sh(cmd);
    after('branch_prepare', resultRel || 'results/branch-prepare-ok.json');
    break;
  }
  case 'emit-in-progress':
    fs.writeFileSync(path.join(execDir, '.stop-cap-exhausted-feat-ship.json'), '{"stepName":"commit","count":3}');
    after('stage_changes', resultRel || 'results/generic-ok.json');
    break;
  case 'review-gate-rows': {
    const gate = after('dispatch_review', resultRel);
    if (gate.status === 'step') after('review_gate', `results/${answer}.json`);
    break;
  }
  case 'worktree-mismatch':
    initial(['--dry-run']);
    initial();
    break;
  default:
    if (scenario.startsWith('inline-fail-')) {
      after(scenario.slice('inline-fail-'.length).replace(/-/g, '_'), resultRel || 'results/commit-fail.json');
      break;
    }
    console.log(JSON.stringify({ scenario, error: `unknown scenario: ${scenario}` }));
    process.exit(0);
}

let ledger = null;
const finalPath = statePath && fs.existsSync(statePath)
  ? statePath
  : (ledgerFiles()[0] ? path.join(execDir, ledgerFiles()[0]) : null);
const data = finalPath ? readJson(finalPath) : null;
if (data) {
  ledger = {
    stepStatuses: Object.fromEntries((data.steps || []).map(s => [s.name, s.status])),
    history: (data.history || []).map(h => ({ step: h.step, result: h.result })),
    currentStep: data.currentStep === undefined ? null : data.currentStep,
    flagsKeys: Object.keys(data.flags || {}),
    flags: data.flags || {},
    paused: data.paused !== undefined,
  };
}

// Existence of every script path named in an emitted command (`node "<path>" …`),
// so assertions can check absolute paths without filesystem access.
const commandScripts = {};
for (const c of calls) {
  const cmds = (c.envelope.step && c.envelope.step.data && c.envelope.step.data.commands) || [];
  for (const cmd of cmds) {
    const m = /^node "([^"]+)"/.exec(cmd);
    if (m) commandScripts[m[1]] = path.isAbsolute(m[1]) && fs.existsSync(m[1]);
  }
}

fs.rmSync(stubDir, { recursive: true, force: true });

console.log(JSON.stringify({
  scenario,
  calls,
  ledger,
  ledgerExists: Boolean(data),
  ledgerFiles: ledgerFiles(),
  summarySidecars: (() => { try { return fs.readdirSync(execDir).filter(f => f.startsWith('.summary-')); } catch (_) { return []; } })(),
  commandScripts,
  stopCapExists: fs.existsSync(path.join(execDir, '.stop-cap-exhausted-feat-ship.json')),
}));
