#!/usr/bin/env node
/**
 * run-review-dry-run-gitignore.js
 * Test harness documenting that `review.js --dry-run` still creates the managed
 * `.gitignore` files (project root and state dir). Spec R3 does not forbid it.
 *
 * Runs review.js with the current working directory, reads the manifest path it
 * prints, removes the run's diff_dir, and reports whether both files exist.
 *
 * Usage:
 *   node run-review-dry-run-gitignore.js
 *
 * Output:
 *   { "exit": 0, "rootGitignore": true, "sdlcGitignore": true }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const reviewScript = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review.js');

const res = spawnSync(
  process.execPath,
  [reviewScript, '--output-file', '--committed', '--base', 'main', '--dry-run', '--json'],
  { cwd: process.cwd(), encoding: 'utf8' }
);

// With --output-file the last stdout line is the manifest path. Remove the run's diff_dir and
// the manifest file; a manifest that cannot be read is a visible failure, not a silent leak.
let exitCode = res.status;
const manifestPath = (res.stdout || '').trim().split('\n').pop();
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.diff_dir) fs.rmSync(manifest.diff_dir, { recursive: true, force: true });
  fs.rmSync(manifestPath, { force: true });
} catch (err) {
  process.stderr.write(`run-review-dry-run-gitignore: cannot read manifest "${manifestPath}": ${err.message}\n`);
  if (exitCode === 0) exitCode = 1;
}

// The managed files live in the main worktree, which is the parent of the common git dir.
const commonDir = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: process.cwd(), encoding: 'utf8',
}).stdout.trim();
const mainRoot = path.dirname(commonDir);
const rootGitignore = fs.existsSync(path.join(mainRoot, '.gitignore'));
const sdlcGitignore = fs.existsSync(path.join(mainRoot, '.sdlc', '.gitignore'));
process.stdout.write(JSON.stringify({ exit: exitCode, rootGitignore, sdlcGitignore }) + '\n');
