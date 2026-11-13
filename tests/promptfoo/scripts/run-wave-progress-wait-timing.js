#!/usr/bin/env node
'use strict';

// Runs `wave-progress --wait` against a temp state dir, flips the last task to
// `reporting` after 1 s, and prints {elapsedMs, result}. Exercises the reporting
// poll (R92): with --interval 60 the wait must return well before one interval.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const RUN_ID = '20250101T000000';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-progress-wait-'));
fs.mkdirSync(path.join(dir, RUN_ID), { recursive: true });
const markerPath = path.join(dir, RUN_ID, 'progress-wave-1.json');
const stamp = '2025-01-01T00:00:00Z';

const writeMarker = (t2Phase) => {
  const tmp = markerPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    tasks: { T1: { phase: 'reporting', updatedAt: stamp }, T2: { phase: t2Phase, updatedAt: stamp } },
  }));
  fs.renameSync(tmp, markerPath);
};
writeMarker('editing');

const startedAt = Date.now();
const child = spawn(process.execPath, [
  path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/state/execute.js'),
  'wave-progress', '--wave', '1', '--run-id', RUN_ID, '--wait', '--tasks', 'T1,T2',
  '--interval', '60', '--grace', '0', '--timeout', '120',
], { env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: dir } });

let stdout = '';
child.stdout.on('data', (d) => { stdout += d; });
child.stderr.on('data', (d) => process.stderr.write(d));
setTimeout(() => writeMarker('reporting'), 1000);

child.on('exit', () => {
  const elapsedMs = Date.now() - startedAt;
  fs.rmSync(dir, { recursive: true, force: true });
  process.stdout.write(JSON.stringify({ elapsedMs, result: JSON.parse(stdout) }));
});
