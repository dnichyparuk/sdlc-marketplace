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
  [reviewScript, '--committed', '--base', 'main', '--dry-run', '--json'],
  { cwd: process.cwd(), encoding: 'utf8' }
);

const manifestPath = (res.stdout || '').trim().split('\n').pop();
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.diff_dir) fs.rmSync(manifest.diff_dir, { recursive: true, force: true });
} catch (_) { /* no manifest: the exit code reports the failure */ }

// The managed files live in the main worktree, which is the parent of the common git dir.
const commonDir = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: process.cwd(), encoding: 'utf8',
}).stdout.trim();
const mainRoot = path.dirname(commonDir);
const rootGitignore = fs.existsSync(path.join(mainRoot, '.gitignore'));
const sdlcGitignore = fs.existsSync(path.join(mainRoot, '.sdlc', '.gitignore'));
process.stdout.write(JSON.stringify({ exit: res.status, rootGitignore, sdlcGitignore }) + '\n');
