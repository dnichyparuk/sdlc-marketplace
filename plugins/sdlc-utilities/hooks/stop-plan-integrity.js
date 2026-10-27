#!/usr/bin/env node
/**
 * stop-plan-integrity.js
 * Stop hook — verifies that plan-sdlc traversed its quality gates when a plan
 * is presented. Exits 2 with the warning on stderr when markers are missing, so
 * the model sees it; exits 0 otherwise.
 *
 * Reads the plan state file for the current branch (no stdin). If one exists,
 * checks the planIntegrity markers and stats the recorded planFilePath, then
 * deletes the marker (single-shot). Warns on any missing or failed check.
 *
 * Exit codes:
 *   2 = one or more integrity markers missing and the marker was consumed (warning on stderr)
 *   0 = every other path, including an undeletable marker (warning still on stderr) and any internal error
 *
 * Implements: R20, R21 (issue #285)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// Marker names in the planIntegrity object that must all be present.
const REQUIRED_MARKERS = ['skillInvoked', 'planFile', 'guardrailsEvaluated', 'critiqueRan'];

// Human-readable descriptions for each marker (used in warning text).
const MARKER_DESCRIPTIONS = {
  skillInvoked:        'plan-sdlc Step 0 (prepare) did not run',
  planFile:            'plan file was not written or is empty',
  guardrailsEvaluated: 'Step 3 guardrail-compliance gate did not run',
  critiqueRan:         'Step 3 self-critique did not run',
};

try {
  const { findStateFile, readState, deleteState, slugifyBranch, resolveHookContext } = require('../scripts/lib/state');
  const { exec } = require('../scripts/lib/git');

  // Spawn-free gate: no state dir means no plan marker. No stdin is read.
  const ctx = resolveHookContext(null);
  if (ctx.stateDir && !fs.existsSync(ctx.stateDir)) process.exit(0);

  // -------------------------------------------------------------------------
  // 1. Get current branch
  // -------------------------------------------------------------------------

  // SDLC_BRANCH_OVERRIDE allows test harnesses to inject a branch name without
  // requiring an embedded .git repo in fixture directories.
  const branch = ctx.branch || exec('git branch --show-current');
  if (!branch) process.exit(0);

  const branchSlug = slugifyBranch(branch);

  // -------------------------------------------------------------------------
  // 2. State-file-first branch (no I/O on the primary path)
  // -------------------------------------------------------------------------

  // findStateFile can throw (e.g. resolveMainWorktree() failing outside any
  // git repo, as happens for promptfoo's copied fixture dirs). Degrade to
  // "no state file" rather than letting the outer catch swallow the whole
  // hook and skip the transcript-fallback branch below.
  let found;
  try {
    found = findStateFile('plan', branchSlug);
  } catch (_) {
    found = null;
  }

  if (found) {
    // State file exists — check all four markers and the planFilePath stat.
    // Capture the full path before reading so we can delete it after evaluation
    // regardless of integrity outcome (single-shot semantics, issue #334).
    // findStateFile returns { file, fullPath, ... } when found, null otherwise.
    const markerPath = found.fullPath;
    const stateResult = readState('plan', branchSlug);
    if (!stateResult || !stateResult.data) {
      // Unreadable state file — consume and exit silently (can't verify accurately)
      try { deleteState(markerPath); } catch (_) { /* best-effort */ }
      process.exit(0);
    }

    const data = stateResult.data;
    const pi = (data.planIntegrity && typeof data.planIntegrity === 'object')
      ? data.planIntegrity
      : {};

    const missing = [];

    for (const marker of REQUIRED_MARKERS) {
      if (typeof pi[marker] !== 'string') {
        // Missing marker — add to list
        missing.push(marker);
      }
    }

    // Additionally stat the planFilePath for the planFile check.
    // Even if planFile marker is present, an absent/empty file is a failed check.
    const planFilePath = typeof data.planFilePath === 'string' ? data.planFilePath : null;
    if (planFilePath) {
      try {
        const stat = fs.statSync(planFilePath);
        if (stat.size === 0) {
          // File exists but is empty — treat as planFile failure
          if (!missing.includes('planFile')) missing.push('planFile');
        }
      } catch (_) {
        // File does not exist — treat as planFile failure
        if (!missing.includes('planFile')) missing.push('planFile');
      }
    }

    // Consume-then-delete: remove the marker regardless of integrity outcome,
    // so the warning fires once. If the unlink fails the marker survives and
    // every later Stop would block again, so only a consumed marker may exit 2.
    try { deleteState(markerPath); } catch (_) { /* best-effort */ }
    const consumed = !fs.existsSync(markerPath);

    if (missing.length === 0) {
      // All checks passed — silent exit
      process.exit(0);
    }

    // Emit structured warning
    const lines = [
      '[plan-integrity] WARNING: Plan presented with incomplete plan-sdlc execution.',
      `  Missing checkpoints: ${missing.join(', ')}`,
    ];

    for (const marker of missing) {
      let desc = MARKER_DESCRIPTIONS[marker] || marker;
      if (marker === 'planFile' && planFilePath) {
        desc = `plan file was not written or is empty (planFilePath=${planFilePath})`;
      }
      lines.push(`  - ${marker}: ${desc}`);
    }

    process.stderr.write(lines.join('\n') + '\n');
    process.exit(consumed ? 2 : 0);
  }

  process.exit(0);
} catch (_) {
  // Top-level catch — graceful degradation (R21: advisory-only, always exit 0)
  process.exit(0);
}
