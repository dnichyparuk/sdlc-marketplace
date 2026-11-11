#!/usr/bin/env node
/**
 * run-schema-truth-cleanup.js
 * Forces the init failure in run-schema-truth.js (PATH without `node`) with a
 * private TMPDIR, then reports the exit status, whether stderr carries
 * `init failed:`, and any leftover entries in that TMPDIR.
 * Output: {"status":2,"stderrHasInitFailed":true,"leftovers":[]}
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-truth-cleanup-'));
try {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'tests', 'promptfoo', 'scripts', 'run-schema-truth.js'), '--surface', 'execute-state'],
    { env: { ...process.env, TMPDIR: D, PATH: '/nonexistent' }, encoding: 'utf8' }
  );
  process.stdout.write(JSON.stringify({
    status: r.status,
    stderrHasInitFailed: (r.stderr || '').includes('init failed:'),
    leftovers: fs.readdirSync(D),
  }) + '\n');
} finally {
  fs.rmSync(D, { recursive: true, force: true });
}
