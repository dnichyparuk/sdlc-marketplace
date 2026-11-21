#!/usr/bin/env node
/**
 * run-wave-progress-parallel.js
 * Exercises lib/wave-progress.js#writeProgress under concurrent writers
 * (R-WAVE-LIVENESS): six child processes each write 25 distinct task ids into
 * one wave marker; the parent counts the entries that survived.
 *
 * Usage: node run-wave-progress-parallel.js (no arguments)
 *
 * Output (parent): one JSON line
 *   {"writers":6,"perWriter":25,"expected":150,"found":<n>,"exits":[<codes>],"lockLeft":<bool>}
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const { writeProgress, readProgress } = require(path.resolve(__dirname, '../../../plugins/sdlc-utilities/scripts/lib/wave-progress.js'));

const WRITERS = 6;
const PER_WRITER = 25;
const RUN_ID = 'parallel-run';
const WAVE = 1;

if (process.argv.length > 2) {
  process.stderr.write('usage: run-wave-progress-parallel.js (no arguments)\n');
  process.exit(2);
}

if (process.env.WAVE_PROGRESS_CHILD !== undefined) {
  const k = process.env.WAVE_PROGRESS_CHILD;
  try {
    for (let i = 0; i < PER_WRITER; i++) {
      writeProgress({ runId: RUN_ID, wave: WAVE, stateDir: process.env.WAVE_PROGRESS_DIR, taskId: `W${k}-T${i}`, phase: 'reporting' });
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`${err && err.message}\n`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-progress-parallel-'));
const children = [];
for (let k = 0; k < WRITERS; k++) {
  children.push(new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { WAVE_PROGRESS_CHILD: String(k), WAVE_PROGRESS_DIR: tmp }),
      stdio: 'ignore',
    });
    child.on('error', () => resolve(-1));
    child.on('exit', (code) => resolve(code === null ? -1 : code));
  }));
}

Promise.all(children).then((exits) => {
  let found = 0;
  let lockLeft = false;
  try {
    found = Object.keys(readProgress({ runId: RUN_ID, wave: WAVE, stateDir: tmp }).tasks).length;
    lockLeft = fs.existsSync(path.join(tmp, RUN_ID, `.progress-wave-${WAVE}.lock`));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify({ writers: WRITERS, perWriter: PER_WRITER, expected: WRITERS * PER_WRITER, found, exits, lockLeft }) + '\n');
  process.exit(0);
});
