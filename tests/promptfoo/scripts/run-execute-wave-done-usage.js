#!/usr/bin/env node
/**
 * run-execute-wave-done-usage.js
 * Test wrapper for `state/execute.js wave-done --usage`.
 *
 * Runs `wave-start` then `wave-done --usage <json>` against a fixture execute
 * state (resolved through SDLC_STATE_DIR_OVERRIDE), then emits the persisted
 * wave as JSON so assertions can be `javascript` checks over the output.
 *
 * Args:
 *   --project-root <path>   Fixture working dir (copied to tmp by the harness)
 *   --branch <name>         Branch whose state file is used (e.g. fix/ctx-alpha)
 *   --wave <n>              Wave number to start and finish
 *   --usage <json>          Raw --usage payload (no whitespace)
 *
 * Output JSON:
 *   { exitCodes: number[], lastStderr: string, wave: object|null }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let branch = null;
let wave = '2';
let usage = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  else if (args[i] === '--branch' && args[i + 1]) branch = args[++i];
  else if (args[i] === '--wave' && args[i + 1]) wave = args[++i];
  else if (args[i] === '--usage' && args[i + 1]) usage = args[++i];
}

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
  console.log(JSON.stringify({ error: 'Could not find repo root with state/execute.js' }));
  process.exit(0);
}

const executeScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js');
const stateDir = path.join(projectRoot, '.sdlc', 'execution');

function run(subArgs) {
  return spawnSync('node', [executeScript, ...subArgs], {
    cwd: projectRoot,
    env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: stateDir },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

const exitCodes = [];
let last = run(['wave-start', '--wave', wave, '--branch', branch]);
exitCodes.push(last.status ?? -1);
last = run(['wave-done', '--wave', wave, '--branch', branch, ...(usage ? ['--usage', usage] : [])]);
exitCodes.push(last.status ?? -1);

let persisted = null;
try {
  const file = fs.readdirSync(stateDir).find((f) => f.startsWith(`execute-${branch.replace(/\//g, '-')}-`));
  const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8'));
  persisted = (data.waves || []).find((w) => String(w.number) === String(wave)) ?? null;
} catch (_) { /* state unreadable */ }

console.log(JSON.stringify({
  exitCodes,
  lastStderr: (last.stderr || '').trim(),
  wave: persisted,
}));
