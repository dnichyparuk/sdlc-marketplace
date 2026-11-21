'use strict';

/**
 * wave-progress.js
 * Atomic in-flight progress markers for wave-runner Agent dispatches.
 *
 * Each wave gets a compact JSON marker at:
 *   <stateDir>/execution/<runId>/progress-wave-<N>.json
 *
 * Per-task worker agents write their current phase into the marker as they
 * progress; the wave-runner reads it back to observe a running wave from
 * outside (R-WAVE-LIVENESS). The per-run directory is never reaped by the
 * existing state GC (which only scans top-level `.json` files), making it a
 * durable, kill-surviving location for this data
 * (F-wave-liveness-abort-and-resume-durability).
 *
 * Zero npm dependencies — `node:fs` and `node:path` only.
 */

const fs   = require('node:fs');
const path = require('node:path');

// runId flows into path.join() below (progressPath). It may originate from an
// explicit --run-id CLI flag (state/execute.js), so it MUST be validated before use —
// an unvalidated value containing "../" or an absolute-path segment would let path.join
// escape stateDir (path traversal). Same discipline as task-factsheet.js::assertSafeRunId.
const SAFE_RUN_ID_RE = /^[A-Za-z0-9_-]+$/;

function assertSafeRunId(runId, callerName) {
  if (!SAFE_RUN_ID_RE.test(runId)) {
    throw new Error(`${callerName}: runId contains invalid characters (expected only [A-Za-z0-9_-]): ${JSON.stringify(runId)}`);
  }
}

// Bounded phase enum — a free-text phase is rejected (same discipline as
// R-BOUNDED-RETURN's errorCode enum).
const VALID_PHASES = new Set(['started', 'reading', 'editing', 'verifying', 'reporting']);

/**
 * Read and parse a progress marker file. Returns `{ tasks: {} }` when the
 * file is missing, unreadable, or does not contain a valid `tasks` object —
 * never throws.
 *
 * @param {string} filePath
 * @returns {{ tasks: Object.<string, {phase: string, updatedAt: string}> }}
 */
function readMarkerFile(filePath) {
  if (!fs.existsSync(filePath)) return { tasks: {} };

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.tasks !== 'object' || parsed.tasks === null) {
      return { tasks: {} };
    }
    return parsed;
  } catch (_) {
    return { tasks: {} };
  }
}

/**
 * Return the absolute path for a wave's progress marker.
 *
 * `stateDir` is the resolved state directory (`resolveStateDir()`, which already
 * ends in `.sdlc/execution`) — so the marker goes directly into the per-run
 * directory `<stateDir>/<runId>/`, alongside the fact sheets written by
 * `task-factsheet.js::writeTaskFactSheet`. Co-location is the point: that
 * per-run directory is the durable, kill-surviving location R-WAVE-LIVENESS
 * relies on, and it is what `execute.js` GC recurses into.
 *
 * @param {{ runId: string, wave: number, stateDir: string }} opts
 * @returns {string}
 */
function progressPath({ runId, wave, stateDir } = {}) {
  if (!runId) throw new Error('progressPath: runId is required');
  if (wave === undefined || wave === null) throw new Error('progressPath: wave is required');
  if (!stateDir) throw new Error('progressPath: stateDir is required');
  assertSafeRunId(runId, 'progressPath');
  return path.join(stateDir, runId, `progress-wave-${wave}.json`);
}

// Tuning values (docs/cost-tiers.md): lock poll and the wait after which a lock counts as stale.
const LOCK_RETRY_MS = 10;
const LOCK_WAIT_MS = 2000;

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run fn while holding `.progress-wave-<N>.lock` beside the marker (R-WAVE-LIVENESS). */
function withMarkerLock(filePath, fn) {
  const lockPath = path.join(path.dirname(filePath), `.${path.basename(filePath, '.json')}.lock`);
  let waitStart = Date.now();
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'));
      break;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
      if (Date.now() - waitStart >= LOCK_WAIT_MS) {
        fs.rmSync(lockPath, { force: true }); // stale holder (accepted gap, R-WAVE-LIVENESS)
        waitStart = Date.now();
        continue;
      }
      sleepMs(LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}

/**
 * Merge a single task's phase into a wave's progress marker and write it
 * atomically (tmp write + rename), mirroring `task-factsheet.js`'s
 * tmp + rename discipline.
 *
 * @param {{ runId: string, wave: number, stateDir: string, taskId: string, phase: string }} opts
 * @returns {string} Absolute path of the written marker
 */
function writeProgress({ runId, wave, stateDir, taskId, phase } = {}) {
  if (!taskId) throw new Error('writeProgress: taskId is required');
  if (!VALID_PHASES.has(phase)) {
    throw new Error(`writeProgress: phase "${phase}" not in bounded enum (started|reading|editing|verifying|reporting)`);
  }

  const filePath = progressPath({ runId, wave, stateDir });
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return withMarkerLock(filePath, () => {
    const marker = readMarkerFile(filePath);
    marker.tasks[taskId] = { phase, updatedAt: new Date().toISOString() };

    const content = JSON.stringify(marker, null, 2);

    // Atomic write via tmp -> rename. Suffix built from pid/time/random rather
    // than node:crypto to keep this module's dependency surface at
    // node:fs + node:path only.
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tmp = path.join(dir, `.progress-wave-${wave}.${suffix}.tmp`);
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);

    return filePath;
  });
}

/**
 * Read a wave's progress marker.
 * @param {{ runId: string, wave: number, stateDir: string }} opts
 * @returns {{ tasks: Object.<string, {phase: string, updatedAt: string}> }}
 */
function readProgress({ runId, wave, stateDir } = {}) {
  const filePath = progressPath({ runId, wave, stateDir });
  return readMarkerFile(filePath);
}

module.exports = { progressPath, writeProgress, readProgress };
