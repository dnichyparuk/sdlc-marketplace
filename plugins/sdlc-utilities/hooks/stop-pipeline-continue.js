#!/usr/bin/env node
/**
 * stop-pipeline-continue.js
 * Stop hook (no matcher) — implements R68 (issue #452, broadened) and
 * R-stop-inprogress-mode-independent (issue #454, recurrence of #452).
 *
 * Returns `decision: "block"` with a factual `reason` when the following hold,
 * with the `flags.auto` gate applied ASYMMETRICALLY by step status:
 *   (a) a ship state file exists for the current branch,
 *   (b) `pipelineAdvancing(data).advancing === true` (R-advancing-predicate,
 *       lib/state.js — covers both an `in_progress` step AND the between-steps
 *       `pending` gap, incl. the R38 failed+terminal-`cleanup` case),
 *   (c) the `flags.auto` gate:
 *         - `in_progress` step → block REGARDLESS of `flags.auto` (#454: a mid-step
 *           gap is never a valid pause; the Stop hook is the only enforcement layer
 *           that can prevent turn-end before the next Agent dispatch),
 *         - between-steps `pending` → block ONLY when `flags.auto === true`
 *           (non-auto interactive review between steps is a legitimate pause), AND
 *   (d) `stop_hook_active !== true` on stdin, AND
 *   (e) the invoking session owns the pipeline (R73, #505 —
 *       `hookEnforcementAllowed(data, payload)` matches `payload.session_id`
 *       against `data.sessionId`). R73 GATES the rules above; it does not
 *       replace them — the mode-independent `in_progress` block and the
 *       `stop_hook_active` early-exit are preserved unchanged.
 *
 * In every other condition (no state file, advancing false, between-steps pending
 * with non-auto, stop_hook_active === true, foreign session) the hook exits 0
 * silently with no stdout.
 *
 * The asymmetry mirrors hooks/pipeline-continue.js (in_progress mode-independent;
 * pending auto-gated — no-opposite-logical-vectors). The `stop_hook_active === true`
 * early-exit avoids contributing to the Claude Code 8-consecutive-continuation cap
 * (and prevents the now-mode-independent in_progress block from looping against that
 * cap in non-auto mode). The hook NEVER mutates the ship state file (the state CLI is
 * the ledger's only writer), so its block decision is a pure function of pipeline
 * state — but an unchanged advancing step would otherwise block forever, so a
 * consecutive-block counter (STOP_BLOCK_CAP, keyed by step name) is kept in its own
 * sidecar file. After STOP_BLOCK_CAP consecutive blocks on the same unchanged step,
 * the hook writes `.stop-cap-exhausted-<branchSlug>.json`
 * ({stepName, count, at}), deletes the counter sidecar, and degrades to silent exit 0
 * (with a stderr note); while that sidecar names the current step it stays silent.
 * `skill/ship.js` prepare surfaces the stall as a warning. The counter resets
 * whenever the current step name differs from the one recorded in the sidecar, so
 * ordinary multi-step progress is unaffected.
 *
 * Lazy-loads ../scripts/lib/state.js and ../scripts/lib/git.js. Requires only
 * Node.js built-ins plus those two lib files — no new npm dependencies.
 *
 * Exit codes:
 *   0 = always (graceful degradation — emits a block decision only when all four
 *       conditions hold; otherwise exits 0 silently).
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Consecutive-block cap (Task 6, issue #505 follow-up): three consecutive blocks
// on one unchanged step is well past normal (a healthy step advances on the
// first) while still tolerating a transient stall.
const STOP_BLOCK_CAP = 3;

function main() {
  // Read stdin JSON. If parse fails, exit 0 silently.
  let payload;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }

  // (d) stop_hook_active === true → exit 0 silently (cap avoidance).
  //     `payload.session_id` is read further down by the R73 gate (e).
  if (payload.stop_hook_active === true) process.exit(0);

  let slugifyBranch, findStateFile, readState, pipelineAdvancing, hookEnforcementAllowed, resolveStateDir, exec;
  try {
    ({ slugifyBranch, findStateFile, readState, pipelineAdvancing, hookEnforcementAllowed, resolveStateDir } = require('../scripts/lib/state'));
    ({ exec } = require('../scripts/lib/git'));
  } catch {
    process.exit(0);
  }

  // Resolve current branch. If none, exit 0 silently.
  let branch;
  try {
    branch = exec('git branch --show-current');
  } catch {
    process.exit(0);
  }
  if (!branch) process.exit(0);

  const branchSlug = slugifyBranch(branch);

  // (a) ship state file exists for the current branch.
  if (!findStateFile('ship', branchSlug)) process.exit(0);

  const result = readState('ship', branchSlug);
  if (!result || !result.data || !Array.isArray(result.data.steps)) {
    process.exit(0);
  }
  const data = result.data;

  // (b) pipeline is advancing (in_progress step OR a between-steps pending step,
  //     incl. the R38 failed+terminal-cleanup case). Evaluated BEFORE the auto
  //     gate so the in_progress case can be distinguished from the pending case
  //     (R-stop-inprogress-mode-independent, #454).
  const steps = data.steps;
  const { advancing, step, index } = pipelineAdvancing(data);
  if (!advancing || !step) process.exit(0);

  // (c) flags.auto gate — applied ASYMMETRICALLY (R-stop-inprogress-mode-independent,
  //     #454, recurrence of #452; mirrors hooks/pipeline-continue.js):
  //       - in_progress step → block REGARDLESS of auto (a mid-step gap is never a
  //         valid pause; the Stop hook is the only enforcement layer that can prevent
  //         turn-end before the next Agent dispatch).
  //       - between-steps pending → block ONLY in auto (non-auto interactive review
  //         between steps is a legitimate pause — no-opposite-logical-vectors).
  const auto = !!(data.flags && data.flags.auto === true);
  if (step.status !== 'in_progress' && !auto) process.exit(0);

  // (e) R73 (#505): only the session that currently claims this pipeline may be
  //     blocked from ending its turn. Session id only — no worktree comparison:
  //     linked worktrees share the main worktree's state dir, so a step
  //     dispatched with isolation: "worktree" must keep being held open.
  const gate = hookEnforcementAllowed(data, payload);
  if (!gate.allowed) {
    process.stderr.write(`stop-pipeline-continue: not enforcing — ${gate.reason}\n`);
    process.exit(0);
  }

  // Conditions hold → block, subject to the consecutive-block cap below.
  const stepIndex = index + 1;
  const stepName = step.name || step.id || 'unknown';
  const stateWord = step.status === 'in_progress' ? 'is in_progress' : 'is pending';

  // Consecutive-block cap: counter lives in a sidecar file (never the ship
  // state file) so the hook remains non-mutating with respect to pipeline
  // state. A stepName mismatch against the recorded counter resets it — a
  // healthy step advances on its first block, so 3 consecutive blocks on the
  // SAME unchanged step is already past normal while still tolerating a
  // transient stall. ANY sidecar I/O failure degrades to "do not block".
  try {
    const stateDir = resolveStateDir();
    const sidecarPath = path.join(stateDir, `.stop-block-count-${branchSlug}.json`);
    const exhaustedPath = path.join(stateDir, `.stop-cap-exhausted-${branchSlug}.json`);

    // Cap already exhausted for THIS step → stay silent (otherwise the next Stop
    // would block three more times, since pipelineAdvancing still reports the step
    // as advancing). A different stepName is stale: ignored, overwritten later.
    try {
      const exhausted = JSON.parse(fs.readFileSync(exhaustedPath, 'utf8'));
      if (exhausted && exhausted.stepName === stepName) process.exit(0);
    } catch { /* absent or corrupt — no exhaustion recorded */ }

    let counter = { stepName: null, count: 0 };
    try {
      const raw = fs.readFileSync(sidecarPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') counter = parsed;
    } catch {
      // Absent or unreadable/corrupt — treat as a fresh counter.
    }

    if (counter.stepName !== stepName) {
      counter = { stepName, count: 0 };
    }

    if (counter.count >= STOP_BLOCK_CAP) {
      // Record the stall in its own sidecar; the ledger is never modified here.
      try {
        fs.writeFileSync(
          exhaustedPath,
          JSON.stringify({ stepName, count: counter.count, at: new Date().toISOString() }),
          'utf8'
        );
      } catch (e) {
        // Fail open — a write error must not crash the hook, but emit a diagnostic.
        process.stderr.write(
          `stop-pipeline-continue: cap-exhaustion sidecar write failed: ${e.message}\n`
        );
      }
      // Delete sidecar so a retry of the same step gets a fresh block
      // budget instead of re-triggering exhaustion immediately (#review F1).
      try { fs.unlinkSync(sidecarPath); } catch { /* absent is fine */ }
      process.stderr.write(
        `stop-pipeline-continue: consecutive-block cap (${STOP_BLOCK_CAP}) reached for step ` +
        `"${stepName}" — no longer blocking\n`
      );
      process.exit(0);
    }

    counter.count += 1;
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(sidecarPath, JSON.stringify(counter), 'utf8');
  } catch {
    process.exit(0);
  }

  const output = {
    decision: 'block',
    reason:
      `Ship pipeline step ${stepIndex} of ${steps.length} (${stepName}) ${stateWord} and ` +
      'has not been completed. Record the step result and continue to the next pipeline step.',
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

main();
