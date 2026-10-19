#!/usr/bin/env node
/**
 * pipeline-continue.js
 * PostToolUse hook (matcher Bash) — implements R67 (issue #452, broadened).
 *
 * Consumes the shared `pipelineAdvancing(data)` predicate (R-advancing-predicate,
 * lib/state.js) against the ship state file for the current branch:
 *   - in_progress step present  → emit "continue this step" context, MODE-INDEPENDENT
 *     (fires regardless of flags.auto).
 *   - advancing via a between-steps `pending` step (none in_progress) → emit a
 *     forward "advance to next step" context ONLY when flags.auto === true;
 *     otherwise exit 0 silently (interactive between-step review preserved).
 *   - advancing false (all terminal, or failed without a terminal cleanup pending)
 *     → exit 0 silently.
 *   - no ship state file / git or state resolution failure → exit 0 silently.
 *   - the invoking session does not own the pipeline (R73, #505 —
 *     `hookEnforcementAllowed(data, payload)`) → exit 0, reason to stderr only.
 *
 * Lazy-loads ../scripts/lib/state.js and ../scripts/lib/git.js. Requires only
 * Node.js built-ins plus those two lib files — no new npm dependencies.
 *
 * Exit codes:
 *   0 = always (graceful degradation — emits context only per the rules above;
 *       otherwise exits 0 silently).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function main() {
  // 1. Read stdin JSON. If parse fails, exit 0 silently.
  let payload;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }
  // tool_name / tool_response are available on the payload but not required for
  // the in_progress decision. `payload.session_id` IS required — the R73 gate
  // below reads it to confirm this session owns the pipeline.

  let slugifyBranch, findStateFile, readState, pipelineAdvancing, hookEnforcementAllowed, resolveStateDir, exec;
  try {
    ({ slugifyBranch, findStateFile, readState, pipelineAdvancing, hookEnforcementAllowed, resolveStateDir } = require('../scripts/lib/state'));
    ({ exec } = require('../scripts/lib/git'));
    // Early gate (spawns nothing): no state dir, or no ship-* entry in it, means
    // no pipeline — skip the git spawns below. Falls through when the dir is unknown.
    const { mainWorktreeFromFs } = require('../scripts/lib/worktree');
    const mainWt = process.env.SDLC_STATE_DIR_OVERRIDE ? null : mainWorktreeFromFs(process.cwd());
    const earlyDir = process.env.SDLC_STATE_DIR_OVERRIDE || (mainWt && path.join(mainWt, '.sdlc', 'execution'));
    if (earlyDir) {
      if (!fs.existsSync(earlyDir)) process.exit(0);
      if (!fs.readdirSync(earlyDir).some((e) => e.startsWith('ship-'))) process.exit(0);
    }
  } catch {
    process.exit(0);
  }

  // 2. Resolve current branch. If none, exit 0 silently.
  let branch;
  try {
    branch = exec('git branch --show-current');
  } catch {
    process.exit(0);
  }
  if (!branch) process.exit(0);

  const branchSlug = slugifyBranch(branch);

  // 3. Find ship state file. If none, exit 0 silently.
  if (!findStateFile('ship', branchSlug)) process.exit(0);

  // 4. Read state. If no data or steps missing, exit 0 silently.
  const result = readState('ship', branchSlug);
  if (!result || !result.data || !Array.isArray(result.data.steps)) {
    process.exit(0);
  }
  const steps = result.data.steps;

  // 5. Evaluate the shared advancing predicate. If not advancing, exit 0 silently.
  const { advancing, step, index } = pipelineAdvancing(result.data);
  if (!advancing || !step) process.exit(0);

  // 5b. R73 (#505): only the session that currently claims this pipeline. Session
  //     id only — no worktree comparison: linked worktrees share the main
  //     worktree's state dir, so a step dispatched with isolation: "worktree"
  //     must keep receiving its nudge. Placed after the cheap advancing check so
  //     the reason string is computed only when a decision was otherwise imminent.
  const gate = hookEnforcementAllowed(result.data, payload);
  if (!gate.allowed) {
    process.stderr.write(`pipeline-continue: not enforcing — ${gate.reason}\n`);
    process.exit(0);
  }

  const auto = !!(result.data.flags && result.data.flags.auto);
  const stepIndex = index + 1;
  const stepName = step.name || step.id || 'unknown';

  // 6. Two cases:
  //   (a) in_progress step → emit a factual in-progress statement, MODE-INDEPENDENT.
  //   (b) between-steps pending (no in_progress) → emit forward context ONLY in
  //       --auto; non-auto exits silently to preserve interactive review.
  let additionalContext;
  if (step.status === 'in_progress') {
    additionalContext =
      `Ship pipeline: step ${stepIndex} of ${steps.length} (${stepName}) is in progress; the pipeline advances when its result is recorded.`;
  } else {
    // between-steps pending — auto-gated
    if (!auto) process.exit(0);
    additionalContext =
      `Ship pipeline: step ${stepIndex} of ${steps.length} (${stepName}) is next; in --auto mode begin it now.`;
  }

  // 6b. Nudge once per (stepName, status) transition. Sidecar shares the state
  //     dir and branch slug with .stop-block-count-<slug>.json. Written only on
  //     a path that emits; a write failure never blocks the nudge.
  let sidecarPath = null;
  try {
    sidecarPath = path.join(resolveStateDir(), `.pipeline-nudge-${branchSlug}.json`);
    const prior = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    if (prior && prior.stepName === stepName && prior.status === step.status) process.exit(0);
  } catch { /* absent or corrupt = no prior nudge */ }
  if (sidecarPath) {
    try {
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
      fs.writeFileSync(sidecarPath, JSON.stringify({ stepName, status: step.status }));
    } catch { /* never block the nudge */ }
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

main();
