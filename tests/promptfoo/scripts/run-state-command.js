#!/usr/bin/env node
/**
 * run-state-command.js
 * Test wrapper for the `state/execute.js` and `state/ship.js` write subcommands,
 * whose success path prints nothing: only a read-back proves the write.
 *
 * Usage:
 *   node run-state-command.js --script execute|ship --seed mid-run|none --branch <name> -- <subcommand> [args...]
 *
 * Makes a temp state dir (SDLC_STATE_DIR_OVERRIDE, so no git fixture is needed),
 * optionally seeds a state file, runs the subcommand with `--branch <name>`,
 * reads the state back with lib/state.js `readState`, prints one JSON line and
 * removes the dir.
 *
 * Output JSON: { exitCode, stdout, stderr, state }   (always exit 0)
 * Usage errors: exit 2, message on stderr, nothing on stdout.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawnSync } = require('child_process');

function usage(msg) {
  process.stderr.write(`run-state-command: ${msg}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep === -1 ? argv : argv.slice(0, sep);
const sub = sep === -1 ? [] : argv.slice(sep + 1);

let script = null;
let seed = 'mid-run';
let branch = null;
for (let i = 0; i < own.length; i++) {
  if (own[i] === '--script' && own[i + 1]) script = own[++i];
  else if (own[i] === '--seed' && own[i + 1]) seed = own[++i];
  else if (own[i] === '--branch' && own[i + 1]) branch = own[++i];
  else usage(`unknown flag "${own[i]}"`);
}
if (!script) usage('--script is required');
if (script !== 'execute' && script !== 'ship') usage(`bad --script "${script}" (execute|ship)`);
if (seed !== 'mid-run' && seed !== 'none') usage(`bad --seed "${seed}" (mid-run|none)`);
if (!branch) usage('--branch is required');
if (sep === -1) usage('missing "--" before the subcommand');
if (sub.length === 0) usage('missing subcommand after "--"');

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'state', `${script}.js`))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) usage('could not find repo root');

const SEEDS = {
  execute: {
    version: 1,
    skill: 'execute-plan-sdlc',
    startedAt: '2025-01-01T00:00:00Z',
    branch,
    waves: [
      {
        number: 1,
        status: 'completed',
        startedAt: '2025-01-01T00:00:10Z',
        completedAt: '2025-01-01T00:09:00Z',
        tasks: [],
      },
      {
        number: 2,
        status: 'in_progress',
        startedAt: '2025-01-01T00:10:00Z',
        tasks: [
          {
            id: '1',
            name: 'Seed task',
            complexity: 'Standard',
            risk: 'Low',
            status: 'in_progress',
            filesChanged: [],
          },
        ],
      },
    ],
  },
  ship: {
    version: 1,
    startedAt: '2026-06-08T12:00:00.000Z',
    branch,
    flags: { auto: true, steps: ['execute', 'commit', 'review', 'version', 'pr'] },
    steps: [
      { name: 'execute', status: 'completed' },
      { name: 'commit', status: 'pending' },
      { name: 'review', status: 'pending' },
      { name: 'version', status: 'pending' },
      { name: 'pr', status: 'pending' },
    ],
    decisions: [],
    deferredFindings: [],
  },
};

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-command-'));
process.env.SDLC_STATE_DIR_OVERRIDE = stateDir;
const { readState, slugifyBranch } = require(path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'state.js'));
const slug = slugifyBranch(branch);

let out;
try {
  if (seed === 'mid-run') {
    fs.writeFileSync(path.join(stateDir, `${script}-${slug}-20250101T000000Z.json`), JSON.stringify(SEEDS[script], null, 2));
  }

  const target = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', `${script}.js`);
  const r = spawnSync('node', [target, ...sub, '--branch', branch], {
    cwd: stateDir,
    env: process.env,
    encoding: 'utf8',
    timeout: 15_000,
  });

  const found = readState(script, slug);
  out = {
    exitCode: r.status ?? -1,
    stdout: r.stdout || '',
    stderr: ((r.stderr || '') + (r.error ? ` spawn error: ${r.error.message}` : '')).trim(),
    state: found ? found.data : null,
  };
} finally {
  fs.rmSync(stateDir, { recursive: true, force: true });
}

console.log(JSON.stringify(out));
