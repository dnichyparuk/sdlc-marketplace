#!/usr/bin/env node
/**
 * run-session-start-gc-tempdirs.js
 * Verifies that hooks/session-start.js sweeps stale sdlc-explore-* tempdirs (W8.5),
 * by the same rule as ship.js --gc: older than the TTL AND the branch is gone.
 *
 * The fixture (project-ship-gc-explore-tempdirs) is a git repo on branch main. This script
 * creates, inside the fixture copy:
 *   fake-tmpdir/sdlc-explore-dead-branch-abc123  (back-dated to 2024-01-01, branch gone)
 *   fake-tmpdir/sdlc-explore-main-xyz789         (fresh mtime, branch lives)
 * then runs the hook with SDLC_EXPLORE_TMPDIR_OVERRIDE=<fixture>/fake-tmpdir and
 * SDLC_STATE_DIR_OVERRIDE=<fixture>/.sdlc/execution.
 *
 * Args:
 *   --project-root <path>  Working directory (the fixture directory)
 *
 * Outputs: JSON { staleRemoved, freshKept, exitCode }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
}

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/hooks/session-start.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  console.log(JSON.stringify({ error: 'could not locate repo root (session-start.js not found)' }));
  process.exit(1);
}

const hook       = path.join(repoRoot, 'plugins/sdlc-utilities/hooks/session-start.js');
const fakeTmpdir = path.join(projectRoot, 'fake-tmpdir');
const stateDir   = path.join(projectRoot, '.sdlc', 'execution');

fs.mkdirSync(fakeTmpdir, { recursive: true });
const staleDir = path.join(fakeTmpdir, 'sdlc-explore-dead-branch-abc123');
const freshDir = path.join(fakeTmpdir, 'sdlc-explore-main-xyz789');
if (!fs.existsSync(staleDir)) fs.mkdirSync(staleDir);
if (!fs.existsSync(freshDir)) fs.mkdirSync(freshDir);

// Back-date the stale dir to 2024-01-01
const staleDate = new Date('2024-01-01T00:00:00Z');
fs.utimesSync(staleDir, staleDate, staleDate);

const r = spawnSync('node', [hook], {
  input: '{}',
  cwd: projectRoot,
  encoding: 'utf8',
  timeout: 30_000,
  env: Object.assign({}, process.env, {
    SDLC_EXPLORE_TMPDIR_OVERRIDE: fakeTmpdir,
    SDLC_STATE_DIR_OVERRIDE: stateDir,
  }),
});

console.log(JSON.stringify({
  staleRemoved: !fs.existsSync(staleDir),
  freshKept: fs.existsSync(freshDir),
  exitCode: r.status,
}));
