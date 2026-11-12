#!/usr/bin/env node
/**
 * run-setup-init-dry-run.js
 * Test harness for issue #9362 (spec P9): `setup-init.js --dry-run` prints the
 * per-file diff of the merged write and writes nothing.
 *
 * Copies the setup-fully-configured fixture into a fresh non-git temp dir,
 * snapshots its file tree, runs setup-init --dry-run twice with the same
 * arguments, and reports whether the tree is unchanged and both diffs match.
 * The temp dir is removed in `finally`.
 *
 * Usage:
 *   node run-setup-init-dry-run.js
 *
 * Output:
 *   { "exit": 0, "treeUnchanged": true, "secondRunSame": true, "dryRun": true,
 *     "projectPaths": [...], "localPaths": [...] }
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const setupInit = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'util', 'setup-init.js');
const fixture = path.join(REPO_ROOT, 'tests', 'promptfoo', 'fixtures-fs', 'setup-fully-configured');

function snapshot(root) {
  const files = {};
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files[path.relative(root, full)] = fs.readFileSync(full, 'utf8');
    }
  })(root);
  return files;
}

// Run setup-init --dry-run in `cwd`; read and remove the manifest it prints.
function dryRun(cwd) {
  const res = spawnSync(process.execPath, [
    setupInit, '--dry-run',
    '--project-config', '{"version":{"mode":"tag","tagPrefix":"v"}}',
    '--local-config', '{"ship":{"bump":"minor"}}',
  ], { cwd, encoding: 'utf8' });
  const manifestPath = (res.stdout || '').trim().split('\n').pop();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.rmSync(manifestPath, { force: true });
  return { exit: res.status, manifest };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-init-dry-run-'));
try {
  fs.cpSync(fixture, tmp, { recursive: true });
  const before = snapshot(tmp);
  const first = dryRun(tmp);
  const second = dryRun(tmp);
  const after = snapshot(tmp);
  const paths = (d) => (d ? d.changed.map((c) => c.path) : null);
  const diff = first.manifest.diff || {};
  process.stdout.write(JSON.stringify({
    exit: first.exit !== 0 ? first.exit : second.exit,
    treeUnchanged: JSON.stringify(before) === JSON.stringify(after),
    secondRunSame: JSON.stringify(first.manifest.diff) === JSON.stringify(second.manifest.diff),
    dryRun: first.manifest.dryRun === true,
    projectPaths: paths(diff.projectConfig),
    localPaths: paths(diff.localConfig),
  }) + '\n');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
