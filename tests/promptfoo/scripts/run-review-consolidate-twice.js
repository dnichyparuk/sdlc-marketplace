#!/usr/bin/env node
/**
 * run-review-consolidate-twice.js
 * Test wrapper for review-consolidate.js determinism: runs the script twice on the same
 * input into two output dirs and prints whether both comment files and both stdouts are
 * equal once each out-dir path is replaced with `<out>` and each date with `<date>`
 * (so a run across midnight cannot differ).
 *
 * Args: --manifest <path> --findings <dir>
 * Output (one line): true | false
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', '..', '..', 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review-consolidate.js');

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const manifest = arg('--manifest');
const findings = arg('--findings');
if (!manifest || !findings) {
  console.error('Usage: run-review-consolidate-twice.js --manifest <path> --findings <dir>');
  process.exit(1);
}

const normalize = (text, outDir) =>
  text.split(outDir).join('<out>').replace(/\d{4}-\d{2}-\d{2}/g, '<date>');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'review-consolidate-twice-'));
try {
  const runs = [1, 2].map((n) => {
    const outDir = path.join(base, `out${n}`);
    const res = spawnSync('node', [
      SCRIPT, '--manifest', manifest, '--findings', findings,
      '--output-dir', outDir, '--summary-path', path.join(outDir, 'summary.json'),
    ], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`run ${n} exited ${res.status}: ${res.stderr}`);
    return {
      stdout: normalize(res.stdout, outDir),
      comment: normalize(fs.readFileSync(path.join(outDir, 'review-comment.md'), 'utf8'), outDir),
    };
  });
  console.log(String(runs[0].stdout === runs[1].stdout && runs[0].comment === runs[1].comment));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
