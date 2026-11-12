#!/usr/bin/env node
/**
 * run-project-scan-symlink.js
 * Test harness for the guarded reader in plugins/sdlc-utilities/scripts/lib/project-scan.js.
 *
 * Builds outside/ and project/ under one mkdtemp dir. project/ holds symlinks to
 * outside files and to /dev/zero, plus one regular file as a positive control.
 * The scan runs in a child process with a timeout so a hang shows as timedOut.
 *
 * Usage:
 *   node run-project-scan-symlink.js
 *
 * Output (one line):
 *   { "exit": 0, "timedOut": false, "claudeMdRules": [], "languages": [...],
 *     "frameworks": [...], "ciFiles": [], "files": [...] }
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCAN_MODULE = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'project-scan.js');

const CHILD_CODE = `
const { scanProject } = require(${JSON.stringify(SCAN_MODULE)});
const s = scanProject(process.argv[1], { prs: false });
process.stdout.write(JSON.stringify({
  claudeMdRules: s.signals.claudeMdRules,
  languages: s.signals.languages,
  frameworks: s.signals.frameworks,
  ciFiles: s.ciFiles,
  files: Object.keys(s.files),
}));
`;

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'project-scan-symlink-'));

try {
  const outside = path.join(base, 'outside');
  const projectDir = path.join(base, 'project');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(projectDir, 'serverless'), { recursive: true });

  fs.writeFileSync(path.join(outside, 'secret.md'), 'Engineers must rotate the outside secret\n');
  fs.writeFileSync(path.join(outside, 'package.json'), '{"dependencies":{"express":"4.0.0"}}');
  fs.writeFileSync(path.join(outside, 'Jenkinsfile'), 'pipeline {}\n');

  fs.symlinkSync(path.join(outside, 'secret.md'), path.join(projectDir, 'CLAUDE.md'));
  fs.symlinkSync(path.join(outside, 'package.json'), path.join(projectDir, 'package.json'));
  fs.symlinkSync('/dev/zero', path.join(projectDir, 'AGENTS.md'));
  fs.symlinkSync('/dev/zero', path.join(projectDir, 'serverless', 'resources.yml'));
  fs.symlinkSync(path.join(outside, 'Jenkinsfile'), path.join(projectDir, 'Jenkinsfile'));
  fs.writeFileSync(path.join(projectDir, 'requirements.txt'), 'flask==3.0\n');

  const res = spawnSync(process.execPath, ['-e', CHILD_CODE, projectDir], { timeout: 20000, encoding: 'utf8' });
  const timedOut = !!(res.error && res.error.code === 'ETIMEDOUT');
  let scan = {};
  try { scan = JSON.parse(res.stdout); } catch (_) { /* child failed or timed out */ }
  process.stdout.write(JSON.stringify({
    exit: res.status,
    timedOut,
    claudeMdRules: scan.claudeMdRules,
    languages: scan.languages,
    frameworks: scan.frameworks,
    ciFiles: scan.ciFiles,
    files: scan.files,
  }) + '\n');
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
