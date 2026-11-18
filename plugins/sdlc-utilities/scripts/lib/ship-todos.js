#!/usr/bin/env node
/**
 * ship-todos.js — deterministic state→TodoWrite JSON helper (R-todowrite-visibility, #427)
 *
 * Reads a ship state file and returns a JSON object:
 *   { todos: [{content, activeForm, status}], marker: "[task-tray] <event>: ..." }
 *
 * CLI usage:
 *   node ship-todos.js --state-file <path> --event <name> [options]
 *
 * Options:
 *   --state-file <path>      required: ship state JSON path
 *   --plan <path>            optional: plan markdown for execute-step task mirroring
 *   --event <name>           required: init|step|resume|execute|cleanup
 *   --current-step <name>    required when --event=step: step transitioning
 *   --substep <name>         optional: substep to mark in_progress within current-step
 *   --mark-completed <csv>   optional: step names to force-mark all substeps completed
 *   --fail-step <name>       optional: step that failed; in_progress todos closed with " (failed)"
 *
 * Exit 0 on success; exit 2 on bad args / missing files.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { extractTasksRaw } = require('./plan-parse');

// ---------------------------------------------------------------------------
// Static substep map (single source of truth — do not duplicate in SKILL.md)
// ---------------------------------------------------------------------------
const SUBSTEP_MAP = {
  execute:            ['execute plan'],          // overridden by plan-task mirroring
  commit:             ['stash unstaged', 'generate message', 'commit', 'restore stash'],
  review:             ['dispatch review dimensions', 'collect verdicts'],
  'received-review':  ['fetch comments', 'classify findings', 'apply auto-fixes', 'surface remaining'],
  'commit-fixes':     ['re-stage', 'commit fixes'],
  version:            ['bump version', 'update CHANGELOG', 'tag'],
  'verify-openspec':  ['openspec validate --strict', 'check result'],
  'archive-openspec': ['validate', 'run archive', 'stage', 'commit'],
  pr:                 ['push branch', 'draft body', 'gh pr create', 'apply labels'],
  'verify-pipeline':  ['poll checks', 'fetch logs on failure', 'analyze', 'commit fix if any'],
  'await-remote-review': ['poll reviews', 'dispatch received-review if actionable', 'commit fix if any'],
  'learnings-commit': ['append log', 'commit log'],
  cleanup:            ['cleanup pipeline state'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse plan markdown and extract task titles.
 * Headings inside fenced code blocks are skipped (plan-parse extractTasksRaw).
 * Returns array of { n, title } objects.
 */
function parsePlanTasks(markdown) {
  return extractTasksRaw(markdown).map(t => ({ n: t.number, title: t.title }));
}

/**
 * Build substep list for a given step name.
 * When stepName === 'execute' and planTasks is non-empty, mirrors plan tasks.
 */
function parseSubsteps(stepName, planTasks) {
  if (stepName === 'execute' && planTasks && planTasks.length > 0) {
    return planTasks.map(t => `Task ${t.n}: ${t.title}`);
  }
  return SUBSTEP_MAP[stepName] || [`${stepName}`];
}

/**
 * Build the content and activeForm labels for a substep.
 * content    → "Commit: stash unstaged"
 * activeForm → "Stashing unstaged" (title-cased imperative; for execute tasks uses "Executing Task N — <title>")
 */
function substepLabels(stepName, substep) {
  const prefix = capitalize(stepName.replace(/-/g, ' '));

  // Execute task mirror: "Task N: <title>" → special activeForm
  const execMatch = substep.match(/^Task (\d+): (.+)$/);
  if (execMatch) {
    return {
      content:    substep,
      activeForm: `Executing Task ${execMatch[1]} — ${execMatch[2]}`,
    };
  }

  return {
    content:    `${prefix}: ${substep}`,
    activeForm: capitalize(substep),
  };
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Core render function.
 *
 * @param {object} state        - parsed ship state JSON
 * @param {object} opts
 * @param {string} opts.event
 * @param {string} [opts.currentStep]
 * @param {string} [opts.substep]
 * @param {string[]} [opts.markCompleted]  - step names to force-complete
 * @param {string} [opts.failStep]
 * @param {object[]} [opts.planTasks]      - parsed plan tasks [{n, title}]
 * @returns {{ todos: object[], marker: string }}
 */
function renderTodos(state, opts = {}) {
  const {
    event        = 'init',
    currentStep  = null,
    substep      = null,
    markCompleted = [],
    failStep     = null,
    planTasks    = [],
  } = opts;

  // Derive ordered step list from flags.steps + always append cleanup
  const flagSteps = (state.flags && state.flags.steps) ? state.flags.steps : [];
  const allSteps  = [...flagSteps];
  if (!allSteps.includes('cleanup')) allSteps.push('cleanup');

  // R-b4 (#496, docs/specs/ship-sdlc.md): state.steps is an array of
  // {name, status} objects, not a name-keyed object — build a lookup map
  // instead of indexing the array by string key (which was always undefined).
  // R-SHIPTODOS-FAILLOUD: a non-array `steps` field is a state-file shape bug
  // (e.g. a stale pre-#496 object-keyed shape), not "zero steps" — silently
  // coercing to [] makes every step misreport as pending. Fail loudly instead.
  if (state.steps !== undefined && !Array.isArray(state.steps)) {
    throw new Error(
      'renderTodos: state.steps must be an array of {name, status} objects ' +
      `(R-b4, #496) — got ${Array.isArray(state.steps) ? 'array' : typeof state.steps}. ` +
      'This state file uses a stale pre-#496 shape and needs migration.'
    );
  }
  const stepByName = new Map((state.steps || []).map(s => [s.name, s]));

  const todos = [];
  let skippedCount = 0;
  let failedCount  = 0;

  for (const stepName of allSteps) {
    const stepState  = stepByName.get(stepName) || {};
    const stepStatus = stepState.status || 'pending';

    const substeps = parseSubsteps(stepName, planTasks);

    // Determine base status for this step's substeps.
    // R-b4 (#496): honor the recorded terminal/stranded status instead of
    // collapsing every non-current step to 'pending'. TodoWrite has no
    // skipped/failed value, so terminal statuses map into 'completed' but
    // carry an explicit content label + a distinct marker count below —
    // never encoded via activeForm, which stays the in_progress display
    // string. A stranded in_progress step (recorded in_progress but not
    // the current step) stays 'in_progress' rather than being silently
    // downgraded to 'pending'.
    let baseStatus;
    let labelSuffix = null;
    let isSkipped = false;
    let isFailed  = false;
    if (markCompleted.includes(stepName) || stepStatus === 'completed') {
      baseStatus = 'completed';
    } else if (stepStatus === 'skipped') {
      baseStatus  = 'completed';
      labelSuffix = ' (skipped)';
      isSkipped   = true;
    } else if (stepStatus === 'failed' && stepName !== failStep) {
      // Excludes the step currently transitioning to failed (stepName ===
      // failStep): completeStepCore persists status:'failed' BEFORE this
      // render runs, so without this exclusion this branch would preempt the
      // fail-step per-substep override below (T6/R-TODOWRITE-TRUTHFUL, #432),
      // collapsing every substep to a uniform "(failed)" instead of
      // distinguishing in_progress→"(failed)" from pending→"(not attempted)".
      // A step that failed in a *prior* run (not the one failing right now)
      // still takes this coarse branch, which is the intended R-b4 behavior.
      baseStatus  = 'completed';
      labelSuffix = ' (failed)';
      isFailed    = true;
    } else if (stepName === currentStep) {
      baseStatus = 'in_progress'; // overridden per-substep below
    } else if (stepStatus === 'in_progress') {
      baseStatus = 'in_progress'; // stranded in_progress: honor, don't downgrade
    } else {
      baseStatus = 'pending';
    }
    if (isSkipped) skippedCount++;
    if (isFailed || (failStep && stepName === failStep)) failedCount++;

    for (let i = 0; i < substeps.length; i++) {
      const sub    = substeps[i];
      const labels = substepLabels(stepName, sub);
      let status     = baseStatus;
      let activeForm = labels.activeForm;
      let content    = labelSuffix ? `${labels.content}${labelSuffix}` : labels.content;

      // Per-substep refinement when this is the current step
      if (stepName === currentStep && baseStatus !== 'completed') {
        if (substep) {
          // Named substep is in_progress; others are pending
          status = (sub === substep || labels.content === substep) ? 'in_progress' : 'pending';
        } else {
          // No named substep: first substep in_progress, rest pending
          status = (i === 0) ? 'in_progress' : 'pending';
        }
      }

      // Fail-step override (T6 / R-TODOWRITE-TRUTHFUL, #432):
      // - substeps that were in_progress when failure fired → completed "(failed)"
      // - substeps that were pending (never dispatched) → remain pending "(not attempted)"
      // - substeps that were already completed → untouched
      if (failStep && stepName === failStep && status !== 'completed') {
        if (status === 'in_progress') {
          status     = 'completed';
          activeForm = `${activeForm} (failed)`;
        } else {
          // status === 'pending' — never dispatched; surface as not-attempted
          status     = 'pending';
          activeForm = `${activeForm} (not attempted)`;
        }
      }

      todos.push({ content, activeForm, status });
    }
  }

  // Build marker
  const pending    = todos.filter(t => t.status === 'pending').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const completed  = todos.filter(t => t.status === 'completed').length;

  let eventLabel;
  if (event === 'execute' && planTasks.length > 0) {
    eventLabel = `execute: ${planTasks.length} plan tasks queued`;
  } else if (event === 'step' && currentStep) {
    eventLabel = `step ${currentStep}`;
  } else {
    eventLabel = event;
  }

  // R-b4 (#496): skipped/failed counts are appended only when non-zero so
  // the marker stays byte-identical to the pre-fix format for the common
  // (no skipped/failed steps) case.
  let marker = `[task-tray] ${eventLabel}: pending=${pending}, in_progress=${inProgress}, completed=${completed}`;
  if (skippedCount > 0) marker += `, skipped=${skippedCount}`;
  if (failedCount  > 0) marker += `, failed=${failedCount}`;

  return { todos, marker };
}

// ---------------------------------------------------------------------------
// Reusable step-transition helpers (R69, issue #452)
//
// These render the task-tray todos for a step transition / completion from an
// already-loaded state object, mirroring the `--event step` CLI path. They are
// pure (no file I/O, no process.exit) so state/ship.js begin-step/complete-step
// can reuse them after mutating + persisting state — avoiding duplicated render
// logic (DRY). The existing CLI `main()` continues to drive `renderTodos`
// directly through the generic `--event` interface; these helpers do not change
// that path.
// ---------------------------------------------------------------------------

/**
 * Render the todos for marking `stepName` in_progress (the `--event step
 * --current-step <stepName>` CLI shape). Caller is responsible for having
 * already persisted status=in_progress to the state file.
 * @param {object} state    parsed ship state object
 * @param {string} stepName step to mark in_progress
 * @returns {{ todos: Array<{id: string, content: string, status: string}>, marker: string }}
 *   todos — the TodoWrite input array representing current pipeline step states;
 *   marker — stdout audit string in the form "[task-tray] step <name>: pending=N, in_progress=M, completed=K".
 */
function stepTransition(state, stepName) {
  return renderTodos(state, { event: 'step', currentStep: stepName });
}

/**
 * Render the todos for marking `stepName` completed (the `--event step
 * --current-step <stepName> --mark-completed <stepName>` CLI shape). Caller is
 * responsible for having already persisted status=completed to the state file.
 * @param {object} state    parsed ship state object
 * @param {string} stepName step to mark completed
 * @returns {{ todos: Array<{id: string, content: string, status: string}>, marker: string }}
 *   todos — the TodoWrite input array representing current pipeline step states;
 *   marker — stdout audit string in the form "[task-tray] step <name>: pending=N, in_progress=M, completed=K".
 */
function markCompleted(state, stepName) {
  return renderTodos(state, {
    event: 'step',
    currentStep: stepName,
    markCompleted: [stepName],
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--state-file':    args.stateFile    = argv[++i]; break;
      case '--plan':          args.planFile      = argv[++i]; break;
      case '--event':         args.event         = argv[++i]; break;
      case '--current-step':  args.currentStep   = argv[++i]; break;
      case '--substep':       args.substep       = argv[++i]; break;
      case '--mark-completed':args.markCompleted = argv[++i]; break;
      case '--fail-step':     args.failStep      = argv[++i]; break;
      case '--help':
        process.stdout.write([
          'Usage: node ship-todos.js --state-file <path> --event <name> [options]',
          '',
          'Options:',
          '  --state-file <path>      required: ship state JSON path',
          '  --plan <path>            optional: plan markdown for execute task mirroring',
          '  --event <name>           required: init|step|resume|execute|cleanup',
          '  --current-step <name>    required when --event=step',
          '  --substep <name>         optional: substep to mark in_progress',
          '  --mark-completed <csv>   optional: step names to force-mark completed',
          '  --fail-step <name>       optional: step that failed (closes in_progress with " (failed)")',
        ].join('\n') + '\n');
        process.exit(0);
        break;
      default:
        // ignore unknown flags
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const errors = [];
  if (!args.stateFile) errors.push('--state-file is required');
  if (!args.event)     errors.push('--event is required');

  if (errors.length > 0) {
    process.stderr.write(errors.join('\n') + '\n');
    process.exit(2);
  }

  // Load state file
  if (!fs.existsSync(args.stateFile)) {
    process.stderr.write(`state-file not found: ${args.stateFile}\n`);
    process.exit(2);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(args.stateFile, 'utf8'));
  } catch (e) {
    process.stderr.write(`failed to parse state file: ${e.message}\n`);
    process.exit(2);
  }

  // Optionally load plan tasks.
  // R-SHIPTODOS-FAILLOUD: for --event execute, --plan is required and must
  // parse to ≥1 task heading. Other events tolerate a missing/empty plan file.
  let planTasks = [];
  if (args.event === 'execute') {
    if (!args.planFile) {
      process.stderr.write(
        'ERROR: --event execute requires --plan pointing to a plan with at least one \'### Task N:\' heading\n'
      );
      process.exit(2);
    }
    if (!fs.existsSync(args.planFile)) {
      process.stderr.write(
        `ERROR: --event execute requires --plan pointing to a plan with at least one '### Task N:' heading\n` +
        `--plan not found: ${args.planFile}\n`
      );
      process.exit(2);
    }
    try {
      const md = fs.readFileSync(args.planFile, 'utf8');
      planTasks = parsePlanTasks(md);
      if (planTasks.length === 0) {
        process.stderr.write(
          `ERROR: --event execute requires --plan pointing to a plan with at least one '### Task N:' heading\n` +
          `--plan parsed but no '### Task N:' headings found: ${args.planFile}\n`
        );
        process.exit(2);
      }
    } catch (e) {
      process.stderr.write(
        `ERROR: --event execute requires --plan pointing to a plan with at least one '### Task N:' heading\n` +
        `failed to read plan file: ${e.message}\n`
      );
      process.exit(2);
    }
  } else if (args.planFile) {
    // Non-execute events: plan file is optional; silently degrade on error.
    if (!fs.existsSync(args.planFile)) {
      process.stderr.write(`plan-file not found (falling back to placeholder): ${args.planFile}\n`);
    } else {
      try {
        const md = fs.readFileSync(args.planFile, 'utf8');
        planTasks = parsePlanTasks(md);
        if (planTasks.length === 0) {
          process.stderr.write(`plan-file parsed but no tasks found (falling back to placeholder): ${args.planFile}\n`);
        }
      } catch (e) {
        process.stderr.write(`failed to read plan file (falling back to placeholder): ${e.message}\n`);
      }
    }
  }

  const markCompleted = args.markCompleted
    ? args.markCompleted.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const result = renderTodos(state, {
    event:        args.event,
    currentStep:  args.currentStep || null,
    substep:      args.substep     || null,
    markCompleted,
    failStep:     args.failStep    || null,
    planTasks,
  });

  // Dual output split: marker → stderr, JSON → stdout.
  // SKILL.md captures stdout with $(...) for TodoWrite, then echoes the marker
  // (captured separately from stderr) to produce the stdout audit trail.
  // Keeping them on separate streams avoids stdout JSON parse errors when marker
  // text is mixed in.
  process.stderr.write(result.marker + '\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Module exports (for tests and direct require)
// ---------------------------------------------------------------------------
module.exports = { renderTodos, parseSubsteps, parsePlanTasks, SUBSTEP_MAP, stepTransition, markCompleted };

// Run CLI only when invoked directly (not when required as a module)
if (require.main === module) {
  main();
}
