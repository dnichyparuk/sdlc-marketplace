#!/usr/bin/env node
/**
 * run-execute-cleanup-verify.js
 * Test wrapper for `state/execute.js cleanup` (verifying cleanup, R14).
 * Seeds a temporary state directory (SDLC_STATE_DIR_OVERRIDE), runs cleanup for
 * branch fix/cleanup and reports whether the state file survived.
 *
 * Args:
 *   --seed <name>     all-done | missing | noplanned | corrupt | none (default none)
 *   --fixture <dir>   directory holding state-all-done.json and state-missing-t3-t4.json
 *
 * Output JSON: { exitCode: number|null, kept: boolean, stderr: string }
 * Prints { "error": ... } and exits 1 when the repo root is not found.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let seed = 'none';
let fixture = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed' && args[i + 1]) seed = args[++i];
  else if (args[i] === '--fixture' && args[i + 1]) fixture = args[++i];
}

// ---------------------------------------------------------------------------
// Locate execute.js
// ---------------------------------------------------------------------------

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/scripts/state/execute.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}

if (!repoRoot) {
  console.log(JSON.stringify({ error: 'execute.js not found' }));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Seed a temporary state directory and run cleanup
// ---------------------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-cleanup-'));
const target = path.join(tmp, 'execute-fix-cleanup-20261020T120000Z.json');

if (seed === 'all-done') {
  fs.copyFileSync(path.join(fixture, 'state-all-done.json'), target);
} else if (seed === 'missing') {
  fs.copyFileSync(path.join(fixture, 'state-missing-t3-t4.json'), target);
} else if (seed === 'noplanned') {
  const d = JSON.parse(fs.readFileSync(path.join(fixture, 'state-all-done.json'), 'utf8'));
  delete d.plannedTaskIds;
  if (d.context) delete d.context.plannedTaskIds;
  fs.writeFileSync(target, JSON.stringify(d, null, 2));
} else if (seed === 'corrupt') {
  fs.writeFileSync(target, '{not json');
}

const r = spawnSync(
  'node',
  [path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js'), 'cleanup', '--branch', 'fix/cleanup'],
  { env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: tmp }, encoding: 'utf8' }
);

const kept = fs.existsSync(target);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(JSON.stringify({ exitCode: r.status, kept, stderr: r.stderr || '' }));
