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
 *   { "exit": 0, "treeUnchanged": true, "secondRunSame": true, "dryRun": true, "inputsAcked": true,
 *     "fileFormSame": true, "fileFormRoundTrip": true,
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

const PROJECT_JSON = '{"version":{"mode":"tag","tagPrefix":"v"}}';
const LOCAL_JSON = '{"ship":{"bump":"minor"}}';

// Run setup-init --dry-run in `cwd`; read and remove the manifest it prints.
// `extra` replaces the inline config arguments (used for the file form).
function dryRun(cwd, extra) {
  const res = spawnSync(process.execPath, [
    setupInit, '--dry-run',
    ...(extra || ['--project-config', PROJECT_JSON, '--local-config', LOCAL_JSON]),
  ], { cwd, encoding: 'utf8' });
  const manifestPath = (res.stdout || '').trim().split('\n').pop();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.rmSync(manifestPath, { force: true });
  return { exit: res.status, manifest };
}

// Run an invalid invocation; report its exit code and the errors[] text (manifest path on stdout).
function failing(cwd, args) {
  const res = spawnSync(process.execPath, [setupInit, ...args], { cwd, encoding: 'utf8' });
  let errors = [];
  const manifestPath = (res.stdout || '').trim().split('\n').pop();
  try {
    errors = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).errors || [];
    fs.rmSync(manifestPath, { force: true });
  } catch (_) { /* no manifest */ }
  return { exit: res.status, errors: errors.join(' | ') };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-init-dry-run-'));
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-init-cfg-'));
try {
  fs.cpSync(fixture, tmp, { recursive: true });
  const before = snapshot(tmp);
  const first = dryRun(tmp);
  const second = dryRun(tmp);
  // File form: the same configs read from files (no shell quoting), plus a value with a
  // single quote and shell metacharacters that must round-trip untouched.
  const projFile = path.join(cfgDir, 'project.json');
  const localFile = path.join(cfgDir, 'local.json');
  fs.writeFileSync(projFile, PROJECT_JSON);
  fs.writeFileSync(localFile, LOCAL_JSON);
  const viaFile = dryRun(tmp, ['--project-config-file', projFile, '--local-config-file', localFile]);
  const nastyValue = "it's $(touch pwned); `id` \"x\"";
  fs.writeFileSync(projFile, JSON.stringify({ pr: { expectedAccount: nastyValue } }));
  const nasty = dryRun(tmp, ['--project-config-file', projFile]);
  const nastyRow = ((nasty.manifest.diff || {}).projectConfig || { changed: [] }).changed
    .find((c) => c.path === 'pr.expectedAccount' || c.path === 'pr');
  // Error paths: each must exit 1 (not 2); a non-JSON file's content must not be echoed.
  fs.writeFileSync(projFile, 'SECRET-TOKEN-123 not json');
  const badFile = failing(tmp, ['--dry-run', '--project-config-file', projFile]);
  const missing = failing(tmp, ['--dry-run', '--project-config-file', path.join(cfgDir, 'nope.json')]);
  const nonObject = failing(tmp, ['--dry-run', '--project-config', 'null']);
  const badInline = failing(tmp, ['--dry-run', '--project-config', 'not-json']);
  const after = snapshot(tmp);
  const paths = (d) => (d ? d.changed.map((c) => c.path) : null);
  const diff = first.manifest.diff || {};
  process.stdout.write(JSON.stringify({
    exit: [first, second, viaFile, nasty].map((r) => r.exit).find((e) => e !== 0) || 0,
    treeUnchanged: JSON.stringify(before) === JSON.stringify(after),
    secondRunSame: JSON.stringify(first.manifest.diff) === JSON.stringify(second.manifest.diff),
    dryRun: first.manifest.dryRun === true,
    inputsAcked: !!first.manifest.inputs && first.manifest.inputs.projectConfig === true && first.manifest.inputs.localConfig === true,
    fileFormSame: JSON.stringify(first.manifest.diff) === JSON.stringify(viaFile.manifest.diff),
    fileFormRoundTrip: !!nastyRow && JSON.stringify(nastyRow.after).includes(JSON.stringify(nastyValue).slice(1, -1)),
    errorExits: { badFile: badFile.exit, missing: missing.exit, nonObject: nonObject.exit, badInline: badInline.exit },
    missingNamed: /cannot be read/.test(missing.errors),
    fileContentNotEchoed: !/SECRET-TOKEN/.test(badFile.errors) && /not valid JSON/.test(badFile.errors),
    projectPaths: paths(diff.projectConfig),
    localPaths: paths(diff.localConfig),
  }) + '\n');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(cfgDir, { recursive: true, force: true });
}
