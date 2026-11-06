#!/usr/bin/env node
/**
 * run-review-tempdir-gc.js
 * Test harness for gcAgedTempdirs() in plugins/sdlc-utilities/scripts/lib/state.js.
 *
 * Creates sdlc-review-old1, sdlc-review-new1 and other-dir under a fresh mkdtemp
 * scan dir, sets their mtime to a fixed clock, calls gcAgedTempdirs with an
 * injected `now`, and prints the names that remain.
 *
 * Usage:
 *   node run-review-tempdir-gc.js <hoursAfterMtime>
 *
 * Output:
 *   { "remaining": ["other-dir", ...] }
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const { gcAgedTempdirs } = require(
  path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'state.js')
);

const hours = Number(process.argv[2]);
const scanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-tempdir-gc-'));
const mtime = new Date('2026-01-01T00:00:00Z');

try {
  for (const name of ['sdlc-review-old1', 'sdlc-review-new1', 'other-dir']) {
    const dir = path.join(scanDir, name);
    fs.mkdirSync(dir);
    fs.utimesSync(dir, mtime, mtime);
  }
  const now = mtime.getTime() + hours * 3600000;
  gcAgedTempdirs({ prefix: 'sdlc-review-', ttlHours: 24, tmpdir: scanDir, now });
  const remaining = fs.readdirSync(scanDir).sort();
  process.stdout.write(JSON.stringify({ remaining }) + '\n');
} finally {
  fs.rmSync(scanDir, { recursive: true, force: true });
}
