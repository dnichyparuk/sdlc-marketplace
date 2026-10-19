#!/usr/bin/env node
/**
 * ship-prepare.js
 * Pre-computes the entire ship-sdlc pipeline plan as structured JSON.
 * The LLM calls this once at the start of the pipeline, then follows
 * the output mechanically. Skip decisions are made by deterministic code,
 * not LLM judgment.
 *
 * Usage:
 *   node ship-prepare.js [options]
 *
 * Options:
 *   --has-plan              Plan is present in conversation context
 *   --auto                  Skip interactive approval prompts
 *   --steps <csv>           Comma-separated steps to run (overrides config)
 *   --quick                 Run ship.quick profile from config instead of ship.steps[] (R-quick-2)
 *   --quality full|balanced|minimal  Forwarded to execute-plan-sdlc as --quality (only when explicitly passed)
 *   --bump patch|minor|major  Version bump type
 *   --draft                 Mark PR as draft
 *   --dry-run               Print plan without executing
 *   --resume                Resume from last checkpoint
 *   (workspace is auto-detected from cwd + branch; --workspace/--branch/--tree removed)
 *
 * Removed (legacy CLI sugar — passing these now produces a hard error):
 *   --preset                Use --steps <csv> instead.
 *   --skip                  Use --steps <csv> with the desired steps listed instead.
 *
 * Exit codes:
 *   0 = success, JSON on stdout
 *   1 = fatal error, JSON with non-empty errors[] on stdout
 *   2 = unexpected script crash, message on stderr
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const LIB = path.join(__dirname, '..', 'lib');

const { exec, checkGitState, detectBaseBranch, deriveWorkspace, parseRemoteOwner, probeGhAuth, formatAccountMismatch, probeRepoAccess, formatAccessDenied, getTagList } = require(path.join(LIB, 'git'));
const { resolveMainWorktree, detectResumeState: detectResumeStateLib, readState, slugifyBranch, claimSession } = require(path.join(LIB, 'state'));
const { readSection, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { writeOutput } = require(path.join(LIB, 'output'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { VALID_STEPS, BUILT_IN_DEFAULTS, CANONICAL_STEPS, RESERVED_STEPS } = require(path.join(LIB, 'ship-fields'));
const { gcStateFiles, gcTempdirs, gcOutputDir } = require(path.join(LIB, 'state'));
const { detectActiveChanges, isArchived } = require(path.join(LIB, 'openspec'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
const { PRE_RELEASE_LABEL_RE } = require(path.join(LIB, 'version'));

const VALID_QUALITY = ['full', 'balanced', 'minimal'];

// Bump value space accepted by --bump and ship config `ship.bump`. Mirrors
// the JSON Schema pattern in `schemas/sdlc-local.schema.json` (shipSection.bump).
// The value space is the union of the three semver bump types and any
// pre-release label (forwarded verbatim to version-sdlc, where it is
// interpreted as `--bump patch --pre <label>`).
const BUMP_RE = new RegExp(`^(major|minor|patch|${PRE_RELEASE_LABEL_RE.source.slice(1, -1)})$`);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let hasPlan   = false;
  let auto      = false;
  let steps     = null;
  let quick     = false;
  let quality   = null;
  let bump      = null;
  let draft     = false;
  let dryRun    = false;
  let resume    = false;
  let rebase          = null;
  let openspecChange  = null;
  let gc              = false;
  let ttlDays         = null;
  let planModeBlocked = false;
  // R-implicit-resume (#359): set by session-start.js when re-injecting the
  // "Active pipeline" reminder after /compact. ship-prepare uses this to
  // distinguish a hook-driven resume probe from a direct user invocation —
  // when no state file is found, the hook variant surfaces a structured
  // `implicitResumeNoState` error rather than silently starting fresh.
  let hookActivePipeline = false;
  // R-PLANFILE/R72: path to the active plan markdown, sourced solely from an explicit --plan
  let planFile = null;
  const errors = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--has-plan') {
      hasPlan = true;
    } else if (a === '--auto') {
      auto = true;
    } else if (a === '--steps' && args[i + 1]) {
      steps = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--quick') {
      quick = true;
    } else if (a === '--quality' && args[i + 1]) {
      quality = args[++i];
    } else if (a === '--preset') {
      // Hard-removed: --preset is no longer accepted (#190). Consume the
      // following value (if any) so it doesn't get parsed as a positional.
      if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
      errors.push('--preset is no longer accepted by ship-sdlc. Use --steps <csv> to control which steps run, or --quality <full|balanced|minimal> to set the model tier forwarded to execute-plan-sdlc.');
    } else if (a === '--skip') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
      errors.push('--skip is no longer accepted by ship-sdlc. Use --steps <csv> with the desired steps listed instead.');
    } else if (a === '--bump' && args[i + 1]) {
      bump = args[++i];
      if (!BUMP_RE.test(bump)) {
        errors.push(`--bump value '${bump}' is invalid. Expected one of: major|minor|patch, or a pre-release label matching ${PRE_RELEASE_LABEL_RE.toString()}.`);
      }
    } else if (a === '--draft') {
      draft = true;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--resume') {
      resume = true;
    } else if (a === '--workspace' || a === '--branch' || a === '--tree') {
      // Removed (issue #378, #379): workspace is auto-detected from cwd + branch
      // (deriveWorkspace in lib/git.js). Consume a value arg for --workspace so it
      // is not mis-parsed as a positional, then error.
      if (a === '--workspace' && args[i + 1] && !args[i + 1].startsWith('--')) i++;
      errors.push(`${a} is no longer accepted: workspace is auto-detected from cwd + current branch (main worktree on the default branch → new feature branch; otherwise run in place). Remove the flag.`);
    } else if (a === '--rebase' && args[i + 1]) {
      rebase = args[++i]; // 'auto' | 'skip' | 'prompt'
    } else if (a === '--openspec-change' && args[i + 1]) {
      openspecChange = args[++i];
    } else if (a === '--gc') {
      gc = true;
    } else if (a === '--plan-mode-blocked') {
      planModeBlocked = true;
    } else if (a === '--ttl-days' && args[i + 1]) {
      const v = parseInt(args[++i], 10);
      if (isNaN(v)) {
        errors.push(`--ttl-days requires an integer, got "${args[i]}".`);
      } else {
        ttlDays = v;
      }
    } else if (a === '--plan' && args[i + 1]) {
      planFile = args[++i];
    } else if (a === '--hook-active-pipeline') {
      hookActivePipeline = true;
    } else if (a === '--verify-pipeline') {
      // Hard-removed (issue #130): the verify-pipeline phase is now opt-in via
      // step membership in ship.steps[] / --steps. Boolean enabler removed.
      errors.push('--verify-pipeline is no longer accepted by ship-sdlc. Add `verify-pipeline` to --steps <csv> or to ship.steps[] in .sdlc/local.json.');
    } else if (a === '--await-review') {
      // Hard-removed (issue #130): the await-remote-review phase is now opt-in
      // via step membership in ship.steps[] / --steps. Boolean enabler removed.
      errors.push('--await-review is no longer accepted by ship-sdlc. Add `await-remote-review` to --steps <csv> or to ship.steps[] in .sdlc/local.json.');
    }
  }

  return { hasPlan, auto, steps, quick, quality, bump, draft, dryRun, resume, rebase, openspecChange, gc, ttlDays, hookActivePipeline, planModeBlocked, planFile, errors };
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Read ship config from .sdlc/local.json if it exists, return parsed object or null.
 * @param {string} projectRoot
 * @returns {{ config: object|null, source: string }}
 */
function loadConfig(projectRoot) {
  const result = readSection(projectRoot, 'ship');
  return result
    ? { config: result, source: '.sdlc/local.json' }
    : { config: null, source: 'defaults' };
}

// ---------------------------------------------------------------------------
// Flag merging with source tracking
// ---------------------------------------------------------------------------

/**
 * Merge CLI flags > config > built-in defaults.
 * Returns merged values and a sources map tracking which source each value came from.
 */
function mergeFlags(cli, config) {
  const cfg = config || {};
  const merged  = {};
  const sources = {};

  // Boolean flags: CLI true overrides; otherwise config; otherwise default.
  // For booleans, CLI "wins" only if the flag was explicitly passed (true).
  // --auto, --draft are boolean flags that default to false when not passed.
  for (const key of ['auto', 'draft']) {
    if (cli[key] === true) {
      merged[key]  = true;
      sources[key] = 'cli';
    } else if (cfg[key] !== undefined) {
      merged[key]  = cfg[key];
      sources[key] = 'config';
    } else {
      merged[key]  = BUILT_IN_DEFAULTS[key];
      sources[key] = 'default';
    }
  }

  // Value flags
  for (const key of ['bump']) {
    if (cli[key] !== null && cli[key] !== undefined) {
      merged[key]  = cli[key];
      sources[key] = 'cli';
    } else if (cfg[key] !== undefined) {
      merged[key]  = cfg[key];
      sources[key] = 'config';
    } else {
      merged[key]  = BUILT_IN_DEFAULTS[key];
      sources[key] = 'default';
    }
  }

  // -- Step resolution --
  //
  // Precedence (highest → lowest): R-quick-3
  //   1. CLI --steps (one-shot override; fully replaces resolved list)
  //   2. CLI --quick (resolves ship.quick from config; conflict with --steps
  //      is caught later by runValidation — R-quick-5)
  //   3. config.steps from .sdlc/local.json
  //   4. BUILT_IN_DEFAULTS.steps
  //
  // No --preset/--skip override paths exist (#190 — hard-removed).
  let stepsList;
  let stepsSource;
  if (Array.isArray(cli.steps) && cli.steps.length > 0) {
    stepsList   = cli.steps.slice();
    stepsSource = 'cli';
  } else if (cli.quick === true) {
    // R-quick-2: resolve from ship.quick when --quick is set and --steps absent.
    // When ship.quick is unset/empty, leave stepsList empty — runValidation
    // surfaces the missing-config error (R-quick-6).
    if (Array.isArray(cfg.quick) && cfg.quick.length > 0) {
      stepsList   = cfg.quick.slice();
      stepsSource = 'quick';
    } else {
      // No ship.quick configured — runValidation will error (R-quick-6).
      // stepsSource is still 'quick' here (meaning "--quick flag was used"),
      // not "a quick profile was applied". The empty stepsList + 'quick' source
      // is the sentinel runValidation uses to detect R-quick-6 (flag requested
      // but no profile configured). Consumers MUST check flags.steps.length > 0
      // before treating source 'quick' as a successfully-resolved profile.
      stepsList   = [];
      stepsSource = 'quick';
    }
  } else if (Array.isArray(cfg.steps)) {
    stepsList   = cfg.steps.slice();
    stepsSource = 'config';
  } else {
    stepsList   = BUILT_IN_DEFAULTS.steps.slice();
    stepsSource = 'default';
  }

  merged.steps  = stepsList;
  sources.steps = stepsSource;

  // -- Quality (model tier forwarded to execute-plan-sdlc) --
  //
  // Only emitted when CLI explicitly passed --quality. When absent, ship does
  // not forward the flag and execute-plan-sdlc applies its own selection
  // logic (interactive prompt or its own config default).
  if (cli.quality !== null && cli.quality !== undefined) {
    merged.quality  = cli.quality;
    sources.quality = 'cli';
  }
  // Otherwise: no merged.quality / no sources.quality — intentionally absent.

  // reviewThreshold: not a CLI flag, comes from config or default.
  if (cfg.reviewThreshold !== undefined) {
    merged.reviewThreshold  = cfg.reviewThreshold;
    sources.reviewThreshold = 'config';
  } else {
    merged.reviewThreshold  = BUILT_IN_DEFAULTS.reviewThreshold;
    sources.reviewThreshold = 'default';
  }

  // rebase: CLI non-null string wins; otherwise map config boolean/string to
  // 'auto' | 'skip' | 'prompt'; otherwise default (true → 'auto').
  if (cli.rebase !== null && cli.rebase !== undefined) {
    merged.rebase  = cli.rebase; // already a string: 'auto' | 'skip' | 'prompt'
    sources.rebase = 'cli';
  } else if (cfg.rebase !== undefined) {
    // Config may store true/false booleans or the string "prompt"
    if (cfg.rebase === true) {
      merged.rebase = 'auto';
    } else if (cfg.rebase === false) {
      merged.rebase = 'skip';
    } else {
      merged.rebase = cfg.rebase; // "prompt" or any future string value
    }
    sources.rebase = 'config';
  } else {
    // Default is true → 'auto'
    merged.rebase  = 'auto';
    sources.rebase = 'default';
  }

  // -- verify-pipeline / await-remote-review tunables (R57) --
  //
  // The two phases are gated by step membership in flags.steps, not by
  // boolean flags. These tunables apply when the corresponding step is in
  // flags.steps; values come from config or fall back to the spec default.

  // verifyPipelineTimeout (integer ≥30, default from BUILT_IN_DEFAULTS)
  if (cfg.verifyPipelineTimeout !== undefined) {
    merged.verifyPipelineTimeout  = cfg.verifyPipelineTimeout;
    sources.verifyPipelineTimeout = 'config';
  } else {
    merged.verifyPipelineTimeout  = BUILT_IN_DEFAULTS.verifyPipelineTimeout;
    sources.verifyPipelineTimeout = 'default';
  }

  // verifyPipelineInterval (integer ≥10, default from BUILT_IN_DEFAULTS)
  if (cfg.verifyPipelineInterval !== undefined) {
    merged.verifyPipelineInterval  = cfg.verifyPipelineInterval;
    sources.verifyPipelineInterval = 'config';
  } else {
    merged.verifyPipelineInterval  = BUILT_IN_DEFAULTS.verifyPipelineInterval;
    sources.verifyPipelineInterval = 'default';
  }

  // verifyPipelineMaxIterations (integer 1-10, default from BUILT_IN_DEFAULTS)
  if (cfg.verifyPipelineMaxIterations !== undefined) {
    merged.verifyPipelineMaxIterations  = cfg.verifyPipelineMaxIterations;
    sources.verifyPipelineMaxIterations = 'config';
  } else {
    merged.verifyPipelineMaxIterations  = BUILT_IN_DEFAULTS.verifyPipelineMaxIterations;
    sources.verifyPipelineMaxIterations = 'default';
  }

  // awaitRemoteReviewTimeout (integer ≥30, default from BUILT_IN_DEFAULTS)
  if (cfg.awaitRemoteReviewTimeout !== undefined) {
    merged.awaitRemoteReviewTimeout  = cfg.awaitRemoteReviewTimeout;
    sources.awaitRemoteReviewTimeout = 'config';
  } else {
    merged.awaitRemoteReviewTimeout  = BUILT_IN_DEFAULTS.awaitRemoteReviewTimeout;
    sources.awaitRemoteReviewTimeout = 'default';
  }

  // awaitRemoteReviewInterval (integer ≥10, default from BUILT_IN_DEFAULTS)
  if (cfg.awaitRemoteReviewInterval !== undefined) {
    merged.awaitRemoteReviewInterval  = cfg.awaitRemoteReviewInterval;
    sources.awaitRemoteReviewInterval = 'config';
  } else {
    merged.awaitRemoteReviewInterval  = BUILT_IN_DEFAULTS.awaitRemoteReviewInterval;
    sources.awaitRemoteReviewInterval = 'default';
  }

  // awaitRemoteReviewers (array of strings, minItems 1, default from BUILT_IN_DEFAULTS)
  if (Array.isArray(cfg.awaitRemoteReviewers) && cfg.awaitRemoteReviewers.length > 0) {
    merged.awaitRemoteReviewers  = cfg.awaitRemoteReviewers.slice();
    sources.awaitRemoteReviewers = 'config';
  } else {
    merged.awaitRemoteReviewers  = BUILT_IN_DEFAULTS.awaitRemoteReviewers.slice();
    sources.awaitRemoteReviewers = 'default';
  }

  // executeWaveTimeout (integer 60-3600, default from BUILT_IN_DEFAULTS).
  // Flat inside `ship`, not nested under `ship.execute` — same section as
  // every other timeout knob. Forwarded to execute-plan-sdlc as
  // `--wave-timeout` (R57, R-WAVE-DEADLINE).
  if (cfg.executeWaveTimeout !== undefined) {
    merged.executeWaveTimeout  = cfg.executeWaveTimeout;
    sources.executeWaveTimeout = 'config';
  } else {
    merged.executeWaveTimeout  = BUILT_IN_DEFAULTS.executeWaveTimeout;
    sources.executeWaveTimeout = 'default';
  }

  // executeWaveInterval (integer ≥10, default from BUILT_IN_DEFAULTS).
  // Forwarded to execute-plan-sdlc as `--wave-interval` (R57, R-WAVE-LIVENESS).
  if (cfg.executeWaveInterval !== undefined) {
    merged.executeWaveInterval  = cfg.executeWaveInterval;
    sources.executeWaveInterval = 'config';
  } else {
    merged.executeWaveInterval  = BUILT_IN_DEFAULTS.executeWaveInterval;
    sources.executeWaveInterval = 'default';
  }

  // execute.commitWaves (boolean, default false) — Fixes #392 / R35.
  // Forwarded to execute-plan-sdlc as `--commit-waves` when true. Resolved
  // here (scripts-over-llm-logic guardrail) so SKILL.md only cites
  // `step.invocation`, never raw `config.execute.commitWaves`.
  const execCfg = (cfg && cfg.execute && typeof cfg.execute === 'object') ? cfg.execute : {};
  if (execCfg.commitWaves === true) {
    merged.executeCommitWaves  = true;
    sources.executeCommitWaves = 'config';
  } else if (execCfg.commitWaves === false) {
    merged.executeCommitWaves  = false;
    sources.executeCommitWaves = 'config';
  } else {
    merged.executeCommitWaves  = false;
    sources.executeCommitWaves = 'default';
    // Track non-boolean values so runValidation can emit a warning.
    if (execCfg.commitWaves !== undefined) {
      merged.commitWavesInvalidType = true;
    }
  }

  // Pass-through flags that don't come from config.
  merged.hasPlan          = cli.hasPlan;
  merged.dryRun           = cli.dryRun;
  merged.resume           = cli.resume;
  merged.openspecChange   = cli.openspecChange || null;
  merged.planModeBlocked  = cli.planModeBlocked === true;
  // quick is already set above in step resolution; re-affirm as bool for clarity.
  merged.quick            = cli.quick === true;

  return { merged, sources };
}

// ---------------------------------------------------------------------------
// Step computation
// ---------------------------------------------------------------------------

function computeSteps(flags, flagSources, { openspecContext, expectedBranch, planFile } = {}) {
  // Steps[] is the canonical source of truth for which top-level steps run.
  // A step IS skipped when it is NOT in flags.steps. The provenance for an
  // exclusion is whatever determined the resolved steps[] (cli --steps /
  // config / built-in default).
  const stepsSet = new Set(Array.isArray(flags.steps) ? flags.steps : []);

  // Derive the skipSource for a given step name. Convention preserved for
  // downstream consumers (state files, hooks, learnings).
  function skipSource(name) {
    if (stepsSet.has(name)) return 'none';
    const src = flagSources && flagSources.steps;
    if (src === 'cli')    return 'cli';
    if (src === 'quick')  return 'quick';  // R-quick-4: step excluded by --quick profile
    if (src === 'config') return 'config';
    return 'default';
  }

  const isIn = (name) => stepsSet.has(name);

  const steps = [
    {
      name: 'execute',
      skill: 'execute-plan-sdlc',
      model: 'opus',
      status: (!flags.hasPlan || !isIn('execute')) ? 'skipped' : 'will_run',
      skipSource: !flags.hasPlan && isIn('execute')
        ? 'none'
        : !flags.hasPlan
          ? 'condition'
          : skipSource('execute'),
      args: [
        // Forward --quality to execute-plan-sdlc only when the user
        // explicitly passed --quality to ship. Otherwise execute-plan-sdlc
        // applies its own selection logic (interactive or its own default).
        flags.quality ? `--quality ${flags.quality}` : '',
        // No --workspace forward (issue #378, #379): ship establishes the feature
        // branch BEFORE dispatching execute, so execute's own deriveWorkspace yields
        // `continue` (run in place). No workspace value crosses the boundary.
        flags.rebase !== 'prompt' ? `--rebase ${flags.rebase}` : '',
        // Forward --commit-waves when ship config sets execute.commitWaves:
        // true. Pairs with commit-sdlc's wip(execute): squash path so the
        // final feature commit subsumes per-wave WIP commits cleanly
        // (Fixes #392 / R35).
        flags.executeCommitWaves ? '--commit-waves' : '',
        // Forward the wave liveness/deadline tunables resolved from
        // ship.executeWaveTimeout / ship.executeWaveInterval. Always
        // forwarded (they always resolve to config-or-default) — this
        // invocation is the ONLY path by which execute-plan-sdlc learns the
        // configured values (R57, R-WAVE-DEADLINE, R-WAVE-LIVENESS).
        `--wave-timeout ${flags.executeWaveTimeout}`,
        `--wave-interval ${flags.executeWaveInterval}`,
        // R-PLANFILE: forward the resolved plan file explicitly so
        // execute-plan-sdlc never has to infer it from conversation context
        // (fragile under compaction) — resolution is CLI-only (R72).
        planFile ? `--plan "${planFile}"` : '',
        // Forward --auto so the plan-hash mismatch branch (R15) has a
        // deterministic non-interactive default under ship dispatch,
        // mirroring the resume-prompt's existing --auto handling.
        flags.auto ? '--auto' : '',
      ].filter(Boolean).join(' '),
      reason: !flags.hasPlan
        ? 'no plan (--has-plan not set)'
        : !isIn('execute')
          ? 'not in steps[]'
          : 'plan available (--has-plan set)',
      pause: false,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'commit',
      skill: 'commit-sdlc',
      model: 'haiku',
      status: isIn('commit') ? 'will_run' : 'skipped',
      skipSource: skipSource('commit'),
      args: [
        flags.auto ? '--auto' : '',
        expectedBranch ? `--expected-branch ${expectedBranch}` : '',
      ].filter(Boolean).join(' '),
      reason: isIn('commit') ? 'pending (will check after execute)' : 'not in steps[]',
      pause: false,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'review',
      skill: 'review-sdlc',
      model: 'sonnet',
      status: isIn('review') ? 'will_run' : 'skipped',
      skipSource: skipSource('review'),
      args: '--committed',
      reason: isIn('review') ? 'in steps[]' : 'not in steps[]',
      pause: false,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'received-review',
      skill: 'received-review-sdlc',
      model: 'sonnet',
      status: 'conditional',
      skipSource: 'none',
      args: flags.auto ? '--auto' : '',
      reason: 'triggered by review verdict (critical/high findings)',
      pause: !flags.auto,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'commit-fixes',
      skill: 'commit-sdlc',
      model: 'haiku',
      status: 'conditional',
      skipSource: 'none',
      args: [
        flags.auto ? '--auto' : '',
        expectedBranch ? `--expected-branch ${expectedBranch}` : '',
      ].filter(Boolean).join(' '),
      reason: 'triggered if review fixes applied',
      pause: false,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'version',
      skill: 'version-sdlc',
      model: 'sonnet',
      // Version always runs when in steps[] regardless of checkout (issue #378,
      // #379): tags are repo-global and writable from any worktree, so there is
      // no worktree-mode auto-skip.
      status: !isIn('version') ? 'skipped' : 'will_run',
      skipSource: !isIn('version') ? skipSource('version') : 'none',
      // R-bump-forward (#358): forward bump as the named `--bump <value>`
      // flag (NOT a positional). version-sdlc treats --bump as authoritative
      // over the positional, so this wire shape prevents silent promotion
      // when the version skill consults conventional-commit suggestions.
      args: [
        `--bump ${flags.bump || 'patch'}`,
        flags.auto ? '--auto' : '',
        expectedBranch ? `--expected-branch ${expectedBranch}` : '',
      ].filter(Boolean).join(' '),
      reason: !isIn('version') ? 'not in steps[]' : 'in steps[]',
      pause: !flags.auto,
      isolation: null,
      dispatchMode: 'agent',
    },
    // verify-openspec: inline `openspec validate --strict` opt-in step between version and archive-openspec (R-verify-openspec-1..5)
    (() => {
      const oc = openspecContext || {};
      const changeName = flags.openspecChange || oc.branchMatch || null;

      if (!isIn('verify-openspec')) {
        return {
          name: 'verify-openspec',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: skipSource('verify-openspec'),
          args: '',
          reason: 'not in steps[]',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      if (!changeName) {
        return {
          name: 'verify-openspec',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: 'condition',
          args: '',
          reason: 'no matching openspec change for current branch',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      return {
        name: 'verify-openspec',
        skill: null,
        model: null,
        status: 'will_run',
        skipSource: 'none',
        args: `--change ${changeName}${flags.auto ? ' --auto' : ''}`,
        reason: `openspec change "${changeName}" ready for verify`,
        pause: !flags.auto,
        isolation: null,
        dispatchMode: null,
      };
    })(),
    // archive-openspec: conditional step between version and pr
    (() => {
      const oc = openspecContext || {};
      const changeName = flags.openspecChange || oc.branchMatch || null;
      const archiveActionable = changeName && !oc.isAlreadyArchived;

      if (!isIn('archive-openspec')) {
        return {
          name: 'archive-openspec',
          skill: null,
          model: 'haiku',
          status: 'skipped',
          skipSource: skipSource('archive-openspec'),
          args: '',
          reason: 'not in steps[]',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      if (!archiveActionable) {
        return {
          name: 'archive-openspec',
          skill: null,
          model: 'haiku',
          status: 'skipped',
          skipSource: 'condition',
          args: '',
          reason: !changeName
            ? 'no matching openspec change for current branch'
            : 'change already archived',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      // Only show the "N/M tasks done" suffix when the change actually has a
      // tasks.md with at least one task line — tasksTotal is 0 (not null) both
      // when there's no tasks.md and when tasks.md has zero task lines, and in
      // either case "(0/0 tasks done)" misleadingly reads as "fully complete".
      const hasTaskCounts = typeof oc.tasksDone === 'number' && typeof oc.tasksTotal === 'number' && oc.tasksTotal > 0;
      const taskSuffix = hasTaskCounts ? ` (${oc.tasksDone}/${oc.tasksTotal} tasks done)` : '';
      return {
        name: 'archive-openspec',
        skill: null,
        model: 'haiku',
        status: 'conditional',
        skipSource: 'none',
        args: `--change ${changeName}${flags.auto ? ' --auto' : ''}`,
        reason: `openspec change "${changeName}" ready for archive${taskSuffix}`,
        pause: !flags.auto,
        isolation: null,
        dispatchMode: null,
      };
    })(),
    {
      name: 'pr',
      skill: 'pr-sdlc',
      model: 'sonnet',
      status: isIn('pr') ? 'will_run' : 'skipped',
      skipSource: skipSource('pr'),
      // No skip-version-check label (issue #378, #379): version always runs in
      // all checkouts now, so the worktree-mode auto-skip label is gone.
      args: [
        flags.auto ? '--auto' : '',
        flags.draft ? '--draft' : '',
        expectedBranch ? `--expected-branch ${expectedBranch}` : '',
      ].filter(Boolean).join(' '),
      reason: !isIn('pr') ? 'not in steps[]' : 'in steps[]',
      pause: false,
      isolation: null,
      dispatchMode: 'agent',
    },
    // R41-R49: verify-pipeline — opt-in inline-execution step (skill: null,
    // dispatched by ship-sdlc/SKILL.md which parses the JSON verdict). Gated
    // by step membership in flags.steps; auto-skipped when 'pr' is excluded
    // from flags.steps (cannot poll a PR that does not exist).
    (() => {
      if (!isIn('verify-pipeline')) {
        return {
          name: 'verify-pipeline',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: skipSource('verify-pipeline'),
          args: '',
          reason: 'not in steps[]',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      if (!isIn('pr')) {
        return {
          name: 'verify-pipeline',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: 'condition',
          args: '',
          reason: 'pr step excluded — cannot verify CI for a non-existent PR',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      return {
        name: 'verify-pipeline',
        skill: null,
        model: null,
        status: 'will_run',
        skipSource: 'none',
        args: `--timeout ${flags.verifyPipelineTimeout} --interval ${flags.verifyPipelineInterval}`,
        reason: 'verify CI checks before await-remote-review',
        pause: true,
        isolation: null,
        dispatchMode: null,
      };
    })(),
    // R50-R56: await-remote-review — opt-in inline-execution step. Gated by
    // step membership in flags.steps; auto-skipped when 'pr' is excluded from
    // flags.steps.
    (() => {
      if (!isIn('await-remote-review')) {
        return {
          name: 'await-remote-review',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: skipSource('await-remote-review'),
          args: '',
          reason: 'not in steps[]',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      if (!isIn('pr')) {
        return {
          name: 'await-remote-review',
          skill: null,
          model: null,
          status: 'skipped',
          skipSource: 'condition',
          args: '',
          reason: 'pr step excluded — cannot await review on a non-existent PR',
          pause: false,
          isolation: null,
          dispatchMode: null,
        };
      }
      return {
        name: 'await-remote-review',
        skill: null,
        model: null,
        status: 'will_run',
        skipSource: 'none',
        args: `--timeout ${flags.awaitRemoteReviewTimeout} --interval ${flags.awaitRemoteReviewInterval} --reviewers ${flags.awaitRemoteReviewers.join(',')}`,
        reason: 'await automated reviewer (e.g., Copilot)',
        pause: false,
        isolation: null,
        dispatchMode: null,
      };
    })(),
    {
      name: 'learnings-commit',
      // No dispatched skill — this is a deterministic shell step the
      // orchestrator runs inline (see ship-sdlc SKILL.md). The model field
      // is unused but kept for table-rendering consistency.
      skill: null,
      model: 'haiku',
      status: isIn('learnings-commit') ? 'will_run' : 'skipped',
      skipSource: skipSource('learnings-commit'),
      args: '',
      reason: isIn('learnings-commit')
        ? 'final step — appends pipeline learnings and commits if changed'
        : 'not in steps[]',
      pause: false,
      isolation: null,
      dispatchMode: null,
    },
  ];

  for (const step of steps) {
    step.invocation = step.args
      ? `skill: "${step.skill}", args: "${step.args}"`
      : `skill: "${step.skill}"`;
  }

  // Append synthetic terminal `cleanup` step (R38, issue #223). NOT user-
  // configurable — appended unconditionally on every pipeline run. The skill
  // field is null (dispatched as a direct Bash call, not as an Agent). Two
  // command variants are emitted; SKILL.md selects `forced` when any prior
  // step has status: "failed", `normal` otherwise.
  //
  // The path resolution is deferred to the skill (find ~/.claude/plugins +
  // fallback to plugins/sdlc-utilities/scripts/state/ship.js) — same pattern
  // as every other state-script invocation in SKILL.md. We pass the script
  // path placeholder `<state-ship>` here for documentation; the skill
  // substitutes `$SCRIPT` at runtime.
  steps.push({
    name: 'cleanup',
    skill: null,
    model: 'haiku',
    status: 'will_run',
    skipSource: 'none',
    args: '',
    reason: 'terminal cleanup — pipeline contract validation, current-run state delete, GC sweep',
    pause: false,
    invocation: {
      method: 'bash',
      // SKILL.md selects one of these. `normal` runs the contract check and
      // current-run delete; `forced` skips both and only sweeps stale orphans.
      normal: `node "$SCRIPT" cleanup-pipeline`,
      forced: `node "$SCRIPT" cleanup-pipeline --force`,
    },
    reserved: true,
    isolation: null,
    dispatchMode: null,
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Worktree detection
// ---------------------------------------------------------------------------

/**
 * Detect whether the current process is running inside a linked (non-main) git worktree.
 * @param {string} projectRoot  The working directory to inspect (typically process.cwd())
 * @returns {{
 *   inLinkedWorktree: boolean,
 *   currentPath: string|null,
 *   mainWorktreePath: string
 * }}
 */
function detectWorktree(projectRoot) {
  let mainPath;
  try {
    mainPath = resolveMainWorktree();
  } catch (_) {
    // If git worktree list fails (e.g. very old git), assume we are in the main worktree.
    const cwd = fs.realpathSync(projectRoot);
    return { inLinkedWorktree: false, currentPath: null, mainWorktreePath: cwd };
  }

  const cwd         = fs.realpathSync(projectRoot);
  const mainResolved = fs.realpathSync(mainPath);

  return {
    inLinkedWorktree: cwd !== mainResolved,
    currentPath: cwd !== mainResolved ? cwd : null,
    mainWorktreePath: mainResolved,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function runValidation(flags, flagSources, steps, context) {
  const errors   = [];
  const warnings = [];

  // gh auth must be true (issue #234 — preflight via lib/git.js::probeGhAuth).
  if (!context.ghAuthenticated) {
    errors.push(
      context.ghAuthErrorMessage ||
        'GitHub CLI is not authenticated. Run "gh auth login" before using ship-sdlc.'
    );
  }

  // Active-account preflight — halt on identity mismatch with the canonical 3-line message.
  if (context.accountMismatch && context.accountMismatchMessage) {
    errors.push(context.accountMismatchMessage);
  }

  // Access-mode preflight — halt when the active account is definitively denied (404/403).
  if (context.accessDeniedMessage) {
    errors.push(context.accessDeniedMessage);
  }

  // Current branch should not equal base branch
  const notOnDefault = context.currentBranch !== context.defaultBranch;
  if (!notOnDefault) {
    warnings.push(`You are on the default branch "${context.defaultBranch}". Ship pipelines should run on feature branches.`);
  }

  // All steps[] values must be recognized; CLI --steps unrecognized values
  // are errors (the user passed something invalid). Config-sourced unknowns
  // remain warnings to avoid breaking pre-existing configs that drift.
  let stepValuesRecognized = true;
  if (Array.isArray(flags.steps)) {
    for (const s of flags.steps) {
      // Reserved steps (e.g. `cleanup`) are appended unconditionally by
      // computeSteps. Listing them in --steps or ship.steps[] is a config
      // bug — always an error regardless of source.
      if (RESERVED_STEPS.includes(s)) {
        errors.push(`"${s}" is a reserved terminal step appended automatically by the pipeline. Remove it from --steps and ship.steps[].`);
        stepValuesRecognized = false;
        continue;
      }
      if (!VALID_STEPS.includes(s)) {
        if (flagSources.steps === 'cli') {
          errors.push(`Unrecognized step "${s}" in --steps. Valid values: ${VALID_STEPS.join(', ')}`);
          stepValuesRecognized = false;
        } else {
          warnings.push(`Unrecognized step "${s}" in steps[]. Valid values: ${VALID_STEPS.join(', ')}`);
        }
      }
    }
  }

  // Validate --quality value when forwarded
  if (flags.quality !== undefined && !VALID_QUALITY.includes(flags.quality)) {
    errors.push(`Invalid --quality "${flags.quality}". Valid values: ${VALID_QUALITY.join(', ')}`);
  }

  // At least one non-conditional step must run (conditional steps only
  // fire in response to other steps, so they don't count on their own)
  const atLeastOneStepRuns = steps.some(s => s.status === 'will_run');
  if (!atLeastOneStepRuns) {
    errors.push('All steps are skipped. At least one step must run.');
  }

  // R72/C19 (#505): explicit-only plan resolution. Keyed on the RESOLVED step
  // list containing an execute step that will actually run — not on the raw
  // --has-plan flag — because step membership is what actually decides
  // whether a plan gets implemented.
  const executeWillRun = steps.some(s => s.name === 'execute' && s.status === 'will_run');
  if (!context.planFile && executeWillRun) {
    errors.push({
      id: 'missingPlanFile',
      message:
        'ship-sdlc cannot run the "execute" step without a plan document. ' +
        'Fix: re-run with --plan <path-to-plan.md>. ' +
        'Why: plan autodiscovery was removed (#505). It picked the most recently modified *.md in ~/.claude/plans/, which is shared across repositories — it could hand this repo a plan written for a different one and implement it here. ' +
        'If you did not mean to run execute, drop --has-plan (or omit execute from --steps) and the pipeline will skip it.',
    });
  }

  // --bump without version step (only error when user explicitly set bump on
  // the CLI — config-level/default bump is just a no-op when version is
  // excluded from steps[]).
  let coherentFlags = true;
  const versionStep = steps.find(s => s.name === 'version');
  if (flags.bump && flagSources.bump === 'cli' && versionStep && versionStep.status === 'skipped') {
    errors.push(`--bump "${flags.bump}" specified but version step is skipped — resolve by removing --bump or adding "version" to ship.steps[].`);
    coherentFlags = false;
  }

  // R-quick-5: --quick combined with --steps is a hard error.
  if (flags.quick && flagSources.steps === 'cli') {
    errors.push('--quick + --steps not allowed: use --quick or --steps, not both');
  }

  // R-quick-6: --quick invoked with no ship.quick configured is a hard error.
  if (flags.quick && flagSources.steps === 'quick' && flags.steps.length === 0) {
    errors.push('No quick profile defined. Run `ship-sdlc --init-config` to set one.');
  }

  // execute.commitWaves must be a boolean; non-boolean values are silently
  // treated as false — warn the user so they can correct the config.
  if (flags.commitWavesInvalidType) {
    warnings.push('execute.commitWaves in ship config is not a boolean — value ignored, defaulting to false. Set it to true or false explicitly.');
  }

  // Always note conditional pause
  warnings.push('If review finds critical/high issues, pipeline will pause for fix approval');

  return {
    ghAuth: context.ghAuthenticated,
    notOnDefault,
    stepValuesRecognized,
    atLeastOneStepRuns,
    coherentFlags,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Resume state detection
// ---------------------------------------------------------------------------

/**
 * Look for the most recent ship state file matching the current branch.
 *
 * Thin wrapper over `lib/state.js::detectResumeState` — see issue #284,
 * task 19. The selection rule (slugify branch, pick newest mtime) is
 * canonical there; this wrapper preserves the historical
 * `(projectRoot, currentBranch)` call signature and the
 * `{stateFile, found}` return shape that ship.js's caller depends on.
 *
 * @param {string} _projectRoot  Unused; kept for call-site compatibility.
 *                                State directory is resolved via
 *                                `resolveStateDir()` (main worktree) inside
 *                                the canonical helper.
 * @param {string} currentBranch
 * @returns {{ stateFile: string|null, found: boolean }}
 */
function detectResumeState(_projectRoot, currentBranch) {
  const { stateFile, found, fresh, nextPendingStep, fullPath, worktreeMismatch } = detectResumeStateLib({
    prefix: 'ship',
    branch: currentBranch,
  });
  // Forward fresh / nextPendingStep / fullPath for R-implicit-resume (#359).
  // Forward worktreeMismatch so implicit resume can be gated on it (#506/#509 follow-up).
  return { stateFile, found, fresh, nextPendingStep, fullPath, worktreeMismatch };
}

// ---------------------------------------------------------------------------
// verify-side-effect subcommand (R-b3, issue #478 — F-ship-step-status-integrity-guard-8)
// ---------------------------------------------------------------------------

// Steps whose completion has an objective, externally-observable side-effect.
// Only `version` is wired today: its side-effect is the release git tag. The
// pr/commit steps are a documented extension point (see the ship-sdlc SKILL.md
// per-step completion block) but are intentionally NOT implemented here.
const STEP_SIDE_EFFECTS = { version: 'tag' };

/**
 * `verify-side-effect --step <name> [--expected <tag>]`
 *
 * Objectively verifies that a dispatched step actually produced its expected
 * side-effect rather than trusting the agent's self-report (R-b3). For the
 * `version` step the side-effect is the release tag: it MUST appear in
 * `getTagList(activeRoot)` — the active worktree's tag list (tags are
 * repo-global, so the lookup is correct from any worktree; the same helper
 * #498 used). Emits a single JSON object on stdout and exits 0 when the
 * side-effect landed, 1 when it did not. Steps without a defined side-effect
 * emit `{ landed: true, reason: 'no-side-effect' }` (exit 0) so callers are
 * uniform.
 *
 * @param {string[]} argv  process.argv (argv[2] === 'verify-side-effect')
 */
function verifySideEffect(argv) {
  const args = argv.slice(3);
  let step = null;
  let expected = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--step' && args[i + 1]) {
      step = args[++i];
    } else if (args[i] === '--expected' && args[i + 1]) {
      expected = args[++i];
    }
  }

  const emit = (obj, code) => {
    process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
    process.exit(code);
  };

  const sideEffect = step ? STEP_SIDE_EFFECTS[step] : undefined;
  if (!sideEffect) {
    // No defined side-effect for this step — uniform pass-through so the
    // caller can invoke verify-side-effect for every step without branching.
    emit({ step, landed: true, reason: 'no-side-effect' }, 0);
    return;
  }

  // version → tag: the expected release tag MUST exist in the active worktree's
  // tag list. An empty/absent expected tag is itself the #478 failure mode
  // (version-sdlc produced no tag) → landed:false.
  const activeRoot = resolveActiveWorktreeSafe();
  const tags = getTagList(activeRoot);
  const landed = Boolean(expected) && tags.includes(expected);
  emit({ step, sideEffect, landed, expected: expected || null }, landed ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Fatal error stderr mirror
// ---------------------------------------------------------------------------

/**
 * R72: writeOutput() writes the result JSON to a temp file and prints ONLY
 * that file path to stdout — nothing human-readable reaches the terminal on
 * failure. Mirror every fatal error to stderr, one block per error, so a
 * plain `node ship.js ...` run in a terminal shows the remediation text
 * instead of just a temp-file path and a bare exit code.
 *
 * `errors[]` mixes bare strings (legacy validations) and structured
 * `{id, message}` objects (R72 and other newer checks) — handle both.
 *
 * @param {Array<string|{id: string, message: string}>} errors
 */
function writeFatalErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return;
  const blocks = errors.map(e => (typeof e === 'string' ? e : e.message));
  process.stderr.write(blocks.join('\n\n') + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // verify-side-effect subcommand (R-b3, issue #478): objective post-dispatch
  // side-effect check invoked by the ship-sdlc SKILL.md per-step completion
  // block. Short-circuits the prepare pipeline entirely — it composes no steps,
  // so none of the config/gh/worktree setup below runs.
  if (process.argv[2] === 'verify-side-effect') {
    return verifySideEffect(process.argv);
  }

  const projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/
  // issue #457: OpenSpec content scans live on the active branch in the active worktree —
  // route detectActiveChanges/isArchived through contentRoot, NOT projectRoot.
  const contentRoot = resolveActiveWorktreeSafe();
  const cli = parseArgs(process.argv);

  const errors   = [];
  const warnings = [];

  // Surface argument-parsing errors first (legacy --preset/--skip rejection).
  if (Array.isArray(cli.errors) && cli.errors.length > 0) {
    errors.push(...cli.errors);
  }

  // Issue #232: verifyAndMigrate at pipeline entry. On success, export
  // SDLC_SKIP_CONFIG_CHECK=1 so every subsequent Bash invocation in the
  // pipeline (including `node scripts/skill/<sub>.js`) inherits the env var
  // and short-circuits its own per-skill check.
  const skipConfigCheck = resolveSkipConfigCheck(process.argv);
  const cv = ensureConfigVersion(projectRoot, { skip: skipConfigCheck, roles: ['project', 'local'] });
  let migrationManifest = { ...(cv.migration || {}), infrastructure: cv.infrastructure };
  if (cv.errors.length > 0) {
    for (const e of cv.errors) errors.push(`config-version: ${e.role}: ${e.message}`);
    writeFatalErrors(errors);
    writeOutput({
      errors,
      warnings,
      flags: { skipConfigCheck },
      migration: migrationManifest,
    }, 'ship-prepare', 1);
    return;
  }
  // Set the env var so child processes inherit it. Avoid clobbering a
  // pre-existing value (e.g., a parent shipped already set it).
  if (!skipConfigCheck && process.env.SDLC_SKIP_CONFIG_CHECK !== '1') {
    process.env.SDLC_SKIP_CONFIG_CHECK = '1';
  }

  // --gc short-circuit (R39): on-demand pruning. Skip pipeline composition
  // entirely. Emit {action: "gc", report, errors, warnings} and exit.
  if (cli.gc) {
    if (errors.length > 0) {
      writeFatalErrors(errors);
      writeOutput({ action: 'gc', errors, warnings }, 'ship-prepare', 1);
      return;
    }

    // TTL resolution: CLI --ttl-days > config state.gc.ttlDays > 7.
    let ttlDays = (typeof cli.ttlDays === 'number') ? cli.ttlDays : null;
    if (ttlDays == null) {
      try {
        const stateCfg = readSection(projectRoot, 'state');
        const v = stateCfg && stateCfg.gc && stateCfg.gc.ttlDays;
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          ttlDays = v;
        }
      } catch (_) { /* fall through */ }
    }
    if (ttlDays == null) ttlDays = 7;

    // Build knownBranches from local git
    let knownBranches = [];
    const out = exec("git branch --list --format='%(refname:short)'", { cwd: process.cwd(), shell: true });
    if (typeof out === 'string') {
      knownBranches = out.split('\n').map(s => s.trim()).filter(Boolean);
    }

    let report;
    try {
      const ship             = gcStateFiles({ prefix: 'ship',    ttlDays, knownBranches });
      const execute          = gcStateFiles({ prefix: 'execute', ttlDays, knownBranches });
      const plan             = gcStateFiles({ prefix: 'plan',    ttlDays, knownBranches });
      const commit           = gcStateFiles({ prefix: 'commit',  ttlDays, knownBranches });
      // Sweep per-invocation tempdirs created by plan-explore.js (issue #408)
      // SDLC_EXPLORE_TMPDIR_OVERRIDE allows tests to point at a controlled directory.
      const exploreTmpdir    = process.env.SDLC_EXPLORE_TMPDIR_OVERRIDE || undefined;
      const exploreTempdirs  = gcTempdirs({ prefix: 'sdlc-explore-', ttlDays, knownBranches, tmpdir: exploreTmpdir });
      const out              = gcOutputDir({ ttlHours: ttlDays * 24 });
      report = { ttlDays, ship, execute, plan, commit, exploreTempdirs, out };
    } catch (err) {
      errors.push(`gc failed: ${err.message}`);
      writeFatalErrors(errors);
      writeOutput({ action: 'gc', errors, warnings }, 'ship-prepare', 1);
      return;
    }

    writeOutput({ action: 'gc', report, errors, warnings }, 'ship-prepare', 0);
    return;
  }

  // Load config
  const { config: fileConfig, source: configSource } = loadConfig(projectRoot);

  // Merge flags
  const { merged: flags, sources: flagSources } = mergeFlags(cli, fileConfig);

  // #394: When version.preRelease is set in .sdlc/config.json AND the user did
  // NOT explicitly pass --bump on the CLI, forward the pre-release label as
  // --bump <label> (sugar for patch + --pre <label> in version-sdlc) so ship
  // pipelines produce pre-release tags. Explicit CLI --bump graduates out of
  // the train (version-sdlc R16). See ship-sdlc spec R63.
  const versionCfg = readSection(projectRoot, 'version') || {};
  if (
    typeof versionCfg.preRelease === 'string' &&
    versionCfg.preRelease.length > 0 &&
    PRE_RELEASE_LABEL_RE.test(versionCfg.preRelease) &&
    flagSources.bump !== 'cli'
  ) {
    flags.bump = versionCfg.preRelease;
    flagSources.bump = 'config (version.preRelease)';
  }

  // (workspace is auto-detected later from cwd + branch — no --auto override needed;
  // the derive runs after gitState/worktreeInfo/defaultBranch are known.)

  // Check git state
  let gitState;
  try {
    gitState = checkGitState(process.cwd());
  } catch (err) {
    errors.push(err.message);
    writeFatalErrors(errors);
    writeOutput({ errors, warnings }, 'ship-prepare', 1);
    return;
  }

  // plan-mode-blocked short-circuit (R64, fixes #400)
  // When SKILL.md detects plan mode active, it invokes ship.js with --plan-mode-blocked
  // to persist pipeline init state so the next /ship-sdlc invocation can auto-resume.
  if (flags.planModeBlocked) {
    const stateShipPath = path.join(__dirname, '..', 'state', 'ship.js');
    const flagsJson = JSON.stringify(flags);
    const currentBranch = gitState.currentBranch;
    const result = spawnSync('node', [
      stateShipPath, 'init',
      '--branch', currentBranch,
      '--flags', flagsJson,
    ], { encoding: 'utf8', timeout: 10000 });
    if (result.error) {
      process.stderr.write(`state/ship.js init timed out or crashed: ${result.error.message}\n`);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.stderr.write(result.stderr || 'state/ship.js init failed\n');
      process.exit(result.status || 1);
    }
    const { filePath, prunedOrphans } = JSON.parse(result.stdout);
    writeOutput({
      flags: { ...flags, planModeBlocked: true },
      stateFile: filePath,
      prunedOrphans,
      planModeBlocked: true,
    }, 'ship-prepare', 0);
    return;
  }

  // Detect base branch
  let defaultBranch;
  try {
    defaultBranch = detectBaseBranch(projectRoot);
  } catch (err) {
    errors.push(err.message);
    writeFatalErrors(errors);
    writeOutput({ errors, warnings }, 'ship-prepare', 1);
    return;
  }

  // Check gh auth + active-account preflight (issue #234, fixes #380, shared with pr.js).
  // Two-mode cascade:
  //   Identity mode  (prConfig.expectedAccount set): strict login comparison.
  //   Access mode    (prConfig.expectedAccount unset): probe repo accessibility via gh api.
  // Halt on no-auth, expired-token, identity mismatch, or definitive probe denial (404/403).
  // Network failure in probe warns and proceeds (non-blocking).
  const ghAuthState = probeGhAuth();
  const ghAuthenticated = ghAuthState.authenticated;
  const ghUser = ghAuthState.activeAccount;
  const ghAuthExpired = ghAuthState.expired;
  const ghAuthErrorMessage = ghAuthState.errorMessage;

  // Resolve expectedAccount: prConfig.expectedAccount only (no origin-owner fallback).
  const prConfigForAuth = readSection(projectRoot, 'pr') || {};
  const remoteForAuth = parseRemoteOwner(projectRoot);
  const expectedAccount =
    (typeof prConfigForAuth.expectedAccount === 'string' && prConfigForAuth.expectedAccount.trim()) ||
    null;

  // Default values for the new probe-output fields — overwritten below when the probe runs.
  let repoAccessProbed = false;
  let repoAccessible = null;
  let repoAccessStatus = null;

  // Mismatch detection — only when authenticated + we resolved an expected account.
  const accountMismatch = Boolean(
    ghAuthenticated && expectedAccount && ghUser && ghUser.toLowerCase() !== expectedAccount.toLowerCase()
  );
  const accountMismatchMessage = accountMismatch
    ? formatAccountMismatch(expectedAccount, ghUser)
    : null;

  // Access-mode: no explicit expectedAccount — probe repo accessibility instead.
  let accessDeniedMessage = null;
  if (ghAuthenticated && !expectedAccount && remoteForAuth) {
    const probeResult = probeRepoAccess({
      owner: remoteForAuth.owner,
      repo: remoteForAuth.repo,
      host: remoteForAuth.host,
    });
    repoAccessProbed = true;
    repoAccessible = probeResult.accessible;
    repoAccessStatus = probeResult.statusCode;

    if (probeResult.accessible === false) {
      accessDeniedMessage = formatAccessDenied({
        activeAccount: ghUser,
        owner: remoteForAuth.owner,
        repo: remoteForAuth.repo,
        suggestedAccounts: probeResult.suggestedAccounts,
      });
    } else if (probeResult.accessible === null) {
      warnings.push(
        `Repo access probe failed (${probeResult.errorMessage || 'network error'}) — proceeding without access verification.`
      );
    }
  }

  // Check OpenSpec (use shared lib for consistent detection)
  const openspecResult = detectActiveChanges(contentRoot);
  const openspecDetected = openspecResult.present;
  const openspecAuthoritative = openspecResult.present
    ? { path: 'openspec/config.yaml', specsCount: openspecResult.specsCount }
    : null;

  // Check .sdlc/ gitignore status
  // git check-ignore returns non-null (empty string) if ignored, null if not ignored.
  // Also detect .sdlc/.gitignore (self-ignoring pattern created by setup-sdlc).
  const sdlcGitignored =
    exec('git check-ignore -q .sdlc/', { cwd: projectRoot }) !== null ||
    fs.existsSync(path.join(projectRoot, '.sdlc', '.gitignore'));

  // Detect worktree context
  const worktreeInfo = detectWorktree(projectRoot);

  // Workspace auto-detection (issue #378, #379): workspace is derived from cwd +
  // current branch, NOT a user flag. `branch` → ship auto-creates a feature branch;
  // `continue` → run in place. Computed once here from already-available data and
  // threaded into flags.workspace so computeSteps (version gating) reads the derived
  // value. See lib/git.js::deriveWorkspace, ship-sdlc spec R60.
  flags.workspace = deriveWorkspace({
    inLinkedWorktree: worktreeInfo.inLinkedWorktree,
    currentBranch: gitState.currentBranch,
    defaultBranch,
  });
  flagSources.workspace = 'derived';

  // Compute openspec archive actionability
  const openspecBranchMatch = openspecResult.branchMatch || null;
  const openspecChangeName  = flags.openspecChange || openspecBranchMatch;
  const openspecIsArchived  = openspecChangeName
    ? isArchived(contentRoot, openspecChangeName)
    : false;
  const openspecMatchedChange = openspecChangeName
    ? (openspecResult.activeChanges || []).find(c => c.name === openspecChangeName)
    : null;

  // R-expected-branch-injection (issues #347, #348, #349): resolve the feature branch
  // that commit/version/pr sub-skills should operate on.
  // Preferred source: state.data.branch from the current ship state file (set by cmdInit).
  // Fallback: gitState.currentBranch (e.g., first-run before init or --workspace continue).
  let expectedBranch = gitState.currentBranch;
  try {
    const slug = slugifyBranch(gitState.currentBranch);
    const shipState = readState('ship', slug);
    if (shipState && shipState.data && typeof shipState.data.branch === 'string' && shipState.data.branch) {
      expectedBranch = shipState.data.branch;
    }
  } catch (_) {
    // Non-fatal: fall back to currentBranch already set above
  }

  // Build context
  // R72/C19: the plan file is explicit-only. No plansDirectory scan, no mtime
  // heuristic — a global ~/.claude/plans/ is cross-repo, so "newest *.md" could
  // select a plan written for a different repository and implement it here (#505).
  function resolvePlanFile(cliPlanFile, errors) {
    if (!cliPlanFile) return null;
    const resolved = path.resolve(cliPlanFile);
    let stat = null;
    try { stat = fs.statSync(resolved); } catch { /* missing */ }
    if (!stat || !stat.isFile()) {
      errors.push({
        id: 'planFileNotFound',
        message:
          `--plan "${cliPlanFile}" does not exist. ` +
          `Resolved to: ${resolved}. ` +
          `Fix: check the path, or run /plan-sdlc first to produce one.`,
      });
      return null;
    }
    if (!resolved.endsWith('.md')) {
      errors.push({
        id: 'planFileNotMarkdown',
        message:
          `--plan must point at a .md plan document. ` +
          `Got: ${resolved}. ` +
          `Fix: pass the plan markdown itself, not its directory or a state file.`,
      });
      return null;
    }
    return resolved;
  }

  const planFile = resolvePlanFile(cli.planFile || null, errors);

  const context = {
    currentBranch: gitState.currentBranch,
    defaultBranch,
    uncommittedChanges: gitState.dirtyFiles.length,
    dirtyFiles: gitState.dirtyFiles,
    ghAuthenticated,
    ghUser,
    ghAuthExpired,
    ghAuthErrorMessage,
    expectedAccount,
    accountMismatch,
    accountMismatchMessage,
    repoAccessProbed,
    repoAccessible,
    repoAccessStatus,
    accessDeniedMessage,
    openspecDetected,
    openspecAuthoritative,
    openspecBranchMatch,
    openspecArchiveActionable: !!(openspecChangeName && !openspecIsArchived),
    sdlcGitignored,
    worktree: worktreeInfo,
    expectedBranch,
    planFile,
  };

  // Compute steps (pass openspec context for archive-openspec step)
  // Note: no `stage` field — nothing in computeSteps reads it (dead plumbing).
  const openspecContext = {
    branchMatch: openspecBranchMatch,
    isAlreadyArchived: openspecIsArchived,
    tasksDone: openspecMatchedChange ? openspecMatchedChange.tasksDone : null,
    tasksTotal: openspecMatchedChange ? openspecMatchedChange.tasksTotal : null,
  };
  const steps = computeSteps(flags, flagSources, { openspecContext, expectedBranch, planFile });

  // Run validation
  const validation = runValidation(flags, flagSources, steps, context);

  // Collect validation errors/warnings into top-level arrays
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  // Detect resume state
  const resume = detectResumeState(projectRoot, gitState.currentBranch);

  // R-implicit-resume (#359): when a fresh state file exists for the current
  // branch AND the user did NOT explicitly pass --resume, flip the resume
  // flag implicitly so a post-/compact session continues the same pipeline.
  // The implicitResume marker lets SKILL.md / state lifecycle distinguish
  // this from an explicit --resume request.
  let implicitResume = false;
  // R73/#505: claimSession() re-stamps sessionId on the resumed state file so
  // hookEnforcementAllowed() tracks the session actually driving this resume
  // rather than whichever session originally created the pipeline. Gated on
  // errors.length === 0 so a run that is about to hard-error (e.g. R72
  // missingPlanFile) never mutates the state file it is refusing to run.
  if (resume && resume.found && resume.fresh && !cli.resume && !resume.worktreeMismatch) {
    implicitResume = true;
    flags.resume = true;
    flagSources.resume = 'implicit';
    if (errors.length === 0) claimSession('ship', slugifyBranch(gitState.currentBranch));
  } else if (cli.resume && resume && resume.found && errors.length === 0) {
    claimSession('ship', slugifyBranch(gitState.currentBranch));
  }
  if (resume && resume.found && resume.worktreeMismatch && !cli.resume) {
    warnings.push('Ship state file exists but was created in a different worktree. Use --resume to resume explicitly.');
  }
  flags.implicitResume = implicitResume;

  // R-implicit-resume (#359): when session-start.js dispatches ship with
  // --hook-active-pipeline (it rendered an "Active pipeline" reminder) but
  // no state file is present for the current branch, surface a structured
  // error so the orchestrator can prompt rather than silently start fresh.
  if (cli.hookActivePipeline && (!resume || !resume.found)) {
    errors.push({
      id: 'implicitResumeNoState',
      message:
        'Active pipeline reminder found but no state file for current branch. ' +
        'Run with --resume <path> or start fresh.',
    });
  }

  // R65 removed (issue #378, #379): the cwd-assertion diagnostic is gone. Under
  // workspace auto-detection, the derive returns `branch` ONLY when cwd is already
  // the main worktree on the default branch, so branch creation can never fire from
  // the wrong cwd — the assertion is unreachable by construction.

  // Build config values for output
  const configValues = {};
  for (const key of Object.keys(BUILT_IN_DEFAULTS)) {
    configValues[key] = flags[key] !== undefined ? flags[key] : BUILT_IN_DEFAULTS[key];
  }

  const result = {
    errors,
    warnings,
    config: {
      source: configSource,
      values: configValues,
    },
    flags: {
      auto: flags.auto,
      steps: flags.steps,
      // quality is included only when explicitly passed via CLI (forwarded to
      // execute-plan-sdlc as --quality); absent otherwise so downstream
      // consumers can rely on `flags.quality === undefined` to detect "user
      // did not specify".
      ...(flags.quality !== undefined ? { quality: flags.quality } : {}),
      bump: flags.bump,
      draft: flags.draft,
      dryRun: flags.dryRun,
      resume: flags.resume,
      // R-implicit-resume (#359): true when the resume flag was flipped on
      // by ship-prepare because a fresh state file existed for the current
      // branch and the user did not pass --resume explicitly.
      implicitResume: flags.implicitResume === true,
      hasPlan: flags.hasPlan,
      workspace: flags.workspace,
      rebase: flags.rebase,
      openspecChange: flags.openspecChange,
      // R57: post-PR CI verification + await-remote-review tunables
      // (gating is via step membership in flags.steps, not boolean flags)
      verifyPipelineTimeout: flags.verifyPipelineTimeout,
      verifyPipelineInterval: flags.verifyPipelineInterval,
      verifyPipelineMaxIterations: flags.verifyPipelineMaxIterations,
      awaitRemoteReviewTimeout: flags.awaitRemoteReviewTimeout,
      awaitRemoteReviewInterval: flags.awaitRemoteReviewInterval,
      awaitRemoteReviewers: flags.awaitRemoteReviewers,
      // R57 / R-WAVE-DEADLINE / R-WAVE-LIVENESS: wave tunables resolved at
      // config-merge time and forwarded to the execute step's invocation as
      // --wave-timeout / --wave-interval (see computeSteps). Surfaced here so
      // downstream consumers can introspect the resolution without parsing
      // step args.
      executeWaveTimeout: flags.executeWaveTimeout,
      executeWaveInterval: flags.executeWaveInterval,
      // Fixes #392 / R35: execute.commitWaves resolved at config-merge time;
      // forwarded as --commit-waves to the execute step's invocation (see
      // computeSteps). Surfaced here so downstream consumers can introspect
      // the resolution without parsing step args.
      executeCommitWaves: flags.executeCommitWaves === true,
      planModeBlocked: flags.planModeBlocked || false,
      skipConfigCheck,
      sources: flagSources,
    },
    migration: migrationManifest,
    context,
    steps,
    validation: {
      ghAuth: validation.ghAuth,
      notOnDefault: validation.notOnDefault,
      stepValuesRecognized: validation.stepValuesRecognized,
      atLeastOneStepRuns: validation.atLeastOneStepRuns,
      coherentFlags: validation.coherentFlags,
      warnings: validation.warnings,
    },
    resume,
  };

  // Exit with 1 if there are fatal errors, 0 otherwise
  const exitCode = errors.length > 0 ? 1 : 0;
  writeFatalErrors(errors);
  writeOutput(result, 'ship-prepare', exitCode);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`ship-prepare.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = { parseArgs, computeSteps, mergeFlags, loadConfig, detectWorktree };
