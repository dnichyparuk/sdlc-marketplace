#!/usr/bin/env node
/**
 * run-pipeline-continue-rearm.js
 * Test wrapper for hooks/pipeline-continue.js (W8.3): the nudge dedupe is keyed on
 * (stepName, status, startedAt, ledger), so a retried step start or a new ledger
 * re-arms the nudge while the same start stays silent.
 *
 * Args:
 *   --project-root <path>  Fixture copy (git-init'd, one .sdlc/execution/ship-*.json
 *                          ledger with an in_progress step)
 *
 * Runs the hook four times with the same stdin payload:
 *   1. first call                         -> nudge
 *   2. same step, status, start, ledger   -> silent
 *   3. after setting startedAt on the step -> nudge (new step start)
 *   4. after renaming the ledger           -> nudge (new ledger)
 * Writes only inside the fixture copy.
 *
 * Output: JSON array of four { status, stdout } records.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
}

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/hooks/pipeline-continue.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  console.log(JSON.stringify({ error: 'pipeline-continue.js not found' }));
  process.exit(1);
}

const hook = path.join(repoRoot, 'plugins/sdlc-utilities/hooks/pipeline-continue.js');
const stateDir = path.join(projectRoot, '.sdlc', 'execution');

function run() {
  return spawnSync('node', [hook], {
    input: '{"tool_name":"Bash","session_id":"sess-fixture"}',
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function ledgerFile() {
  const files = fs.readdirSync(stateDir).filter(f => /^ship-.*\.json$/.test(f));
  if (files.length !== 1) throw new Error(`expected one ship ledger, found ${files.length}`);
  return path.join(stateDir, files[0]);
}

const runs = [];
runs.push(run());
runs.push(run());

// A retried begin-step on the in_progress step stamps a new startedAt.
const ledger = ledgerFile();
const data = JSON.parse(fs.readFileSync(ledger, 'utf8'));
const step = data.steps.find(s => s.status === 'in_progress');
step.startedAt = '2026-06-08T13:00:00Z';
fs.writeFileSync(ledger, JSON.stringify(data, null, 2));
runs.push(run());

// A new pipeline on the same branch is a different ledger file.
fs.renameSync(ledger, path.join(stateDir, 'ship-feat-ship-20260608T140000Z.json'));
runs.push(run());

console.log(JSON.stringify(runs.map(r => ({ status: r.status, stdout: r.stdout }))));
