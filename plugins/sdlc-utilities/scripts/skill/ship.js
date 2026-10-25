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
const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, findStateFile, readState, slugifyBranch, claimSession, writeState, deleteState, migrateBranchSlug, listBranches, readTtlDaysFromConfig } = require(path.join(LIB, 'state'));
const { parseArgs: parseStepArgs, createEnvelope } = require(path.join(LIB, 'stepper'));
const shipState = require(path.join(__dirname, '..', 'state', 'ship'));
const { stepTransition, markCompleted, renderTodos, parsePlanTasks } = require(path.join(LIB, 'ship-todos'));
const { parseUsage } = require(path.join(LIB, 'usage'));
const { resolveBranchName } = require(path.join(LIB, 'branch-name'));
const { readSection, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { writeOutput } = require(path.join(LIB, 'output'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { VALID_STEPS, BUILT_IN_DEFAULTS, CANONICAL_STEPS, RESERVED_STEPS } = require(path.join(LIB, 'ship-fields'));
const { gcStateFiles, gcTempdirs, gcOutputDir } = require(path.join(LIB, 'state'));
const { detectActiveChanges, isArchived, getTaskCounts, validateChangeStrict } = require(path.join(LIB, 'openspec'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
const { PRE_RELEASE_LABEL_RE } = require(path.join(LIB, 'version'));
const { extractFrontmatter, parseSimpleYaml } = require(path.join(LIB, 'yaml'));

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

// W4.3: agents/ship-step-*.md pin model and effort; validate-cost-tiers.js checks the model against docs/cost-tiers.md §4.
const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
const stepAgentCache = {};

/**
 * `{ agent, model, effort }` of agents/ship-step-<file>.md, read once per process.
 * @throws {Error} when the file is missing or its frontmatter lacks model or effort
 */
function stepAgent(file) {
  if (!stepAgentCache[file]) {
    const fm = parseSimpleYaml(extractFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, `ship-step-${file}.md`), 'utf8')) || '');
    if (!fm.model || !fm.effort) throw new Error(`agents/ship-step-${file}.md: frontmatter lacks model or effort`);
    stepAgentCache[file] = { agent: `sdlc:ship-step-${file}`, model: fm.model, effort: fm.effort };
  }
  return stepAgentCache[file];
}

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
      ...stepAgent('execute'),
      status: (!flags.hasPlan || !isIn('execute')) ? 'skipped' : 'will_run',
      skipSource: !flags.hasPlan && isIn('execute')
        ? 'none'
        : !flags.hasPlan
          ? 'condition'
          : skipSource('execute'),
      args: [
        // R-PLANFILE: forward the resolved plan file explicitly so
        // execute-plan-sdlc never has to infer it from conversation context
        // (fragile under compaction) — resolution is CLI-only (R72).
        planFile ? `--plan "${planFile}"` : '',
        // Forward --auto so the plan-hash mismatch branch (R15) has a
        // deterministic non-interactive default under ship dispatch,
        // mirroring the resume-prompt's existing --auto handling.
        flags.auto ? '--auto' : '',
        // Forward --quality only when the user passed it (or chose it at
        // execute_tier); ship never synthesizes a tier — under --auto,
        // execute-plan-sdlc resolves it (execute A6). Every other execute
        // setting (rebase, commit-waves, wave tunables) is read by
        // execute-plan-sdlc's own prepare script from its config.
        flags.quality ? `--quality ${flags.quality}` : '',
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
      ...stepAgent('commit'),
      status: isIn('commit') ? 'will_run' : 'skipped',
      skipSource: skipSource('commit'),
      args: [
        '--auto',
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
      ...stepAgent('review'),
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
      ...stepAgent('received-review'),
      status: 'conditional',
      skipSource: 'none',
      args: '--auto',
      reason: 'triggered by review verdict (critical/high findings)',
      pause: !flags.auto,
      isolation: null,
      dispatchMode: 'agent',
    },
    {
      name: 'commit-fixes',
      skill: 'commit-sdlc',
      ...stepAgent('commit'),
      status: 'conditional',
      skipSource: 'none',
      args: [
        '--auto',
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
      ...stepAgent('version'),
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
        '--auto',
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
      ...stepAgent('pr'),
      status: isIn('pr') ? 'will_run' : 'skipped',
      skipSource: skipSource('pr'),
      // No skip-version-check label (issue #378, #379): version always runs in
      // all checkouts now, so the worktree-mode auto-skip label is gone.
      args: [
        '--auto',
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

// Steps whose completion has an objective, externally-observable side-effect:
// version → the release git tag, commit → the HEAD commit, pr → the PR URL.
const STEP_SIDE_EFFECTS = { version: 'tag', commit: 'head-commit', pr: 'pr-url' };

/**
 * commit side-effect: `sha` (short or full) names an existing commit and is the
 * current HEAD. Git only; fails closed on an empty/odd value or any git error.
 */
function checkHeadCommit(sha, cwd) {
  const git = (...a) => spawnSync('git', a, { cwd, encoding: 'utf8', timeout: 8000 });
  if (typeof sha !== 'string' || !/^[0-9a-fA-F]{4,40}$/.test(sha)) return { landed: false, head: null };
  const head = git('rev-parse', 'HEAD');
  const headSha = head.status === 0 ? head.stdout.trim() : null;
  if (!headSha) return { landed: false, head: null };
  const exists = git('cat-file', '-e', `${sha}^{commit}`);
  return { landed: exists.status === 0 && headSha.toLowerCase().startsWith(sha.toLowerCase()), head: headSha };
}

/**
 * pr side-effect: `gh pr view <url>` reports the same URL in state OPEN or
 * MERGED. gh only; an unavailable or unauthenticated gh is `gh-unavailable`.
 */
function checkPrUrl(url, cwd) {
  if (typeof url !== 'string' || !url) return { landed: false };
  const res = spawnSync('gh', ['pr', 'view', url, '--json', 'url,state'], { cwd, encoding: 'utf8', timeout: 15000 });
  if (res.error || res.status !== 0) return { landed: false, reason: 'gh-unavailable' };
  let pr;
  try { pr = JSON.parse(res.stdout); } catch { return { landed: false, reason: 'pr-not-confirmed' }; }
  const ok = pr && pr.url === url && ['OPEN', 'MERGED'].includes(pr.state);
  return ok ? { landed: true } : { landed: false, reason: 'pr-not-confirmed' };
}

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
 * uniform. `commit` (expected: sha) and `pr` (expected: URL) are checked the same
 * way against git HEAD and `gh pr view`; every tool error is `landed:false`.
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

  if (sideEffect === 'head-commit') {
    const c = checkHeadCommit(expected, resolveActiveWorktreeSafe());
    emit({ step, sideEffect, landed: c.landed, expected: expected || null, head: c.head }, c.landed ? 0 : 1);
    return;
  }
  if (sideEffect === 'pr-url') {
    const c = checkPrUrl(expected, resolveActiveWorktreeSafe());
    const out = { step, sideEffect, landed: c.landed, expected: expected || null };
    if (c.reason) out.reason = c.reason;
    emit(out, c.landed ? 0 : 1);
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
// Step emitter (P-STEP-1..4, P-TRANS-1)
// ---------------------------------------------------------------------------

// L5: fixed step.id → ledger steps[].name table. Ids not listed here
// (confirm_pipeline, branch_prepare, stage_changes, review_gate, rebase,
// rebase_conflict, verify_version_tag, cleanup) are recorded in history[] only.
const STEP_ID_TO_LEDGER_NAME = {
  dispatch_execute:         'execute',
  dispatch_commit:          'commit',
  dispatch_review:          'review',
  dispatch_received_review: 'received-review',
  dispatch_commit_fixes:    'commit-fixes',
  dispatch_version:         'version',
  verify_openspec:          'verify-openspec',
  archive_openspec:         'archive-openspec',
  dispatch_pr:              'pr',
  verify_pipeline:          'verify-pipeline',
  await_remote_review:      'await-remote-review',
  learnings_commit:         'learnings-commit',
};

// P-TRANS-1 row order. rebase_conflict is emitted only by `--after rebase`, execute_gate only by `--after dispatch_execute`.
const STEP_ORDER = [
  'confirm_pipeline', 'branch_prepare',
  'execute_handoff', 'execute_state', 'execute_tier', 'dispatch_execute', 'execute_gate', 'stage_changes',
  'confirm_commit', 'dispatch_commit', 'dispatch_review', 'review_gate',
  'confirm_received_review', 'dispatch_received_review',
  'confirm_commit_fixes', 'dispatch_commit_fixes', 'rebase', 'rebase_conflict',
  'confirm_version', 'dispatch_version', 'verify_version_tag', 'verify_openspec', 'archive_openspec',
  'confirm_pr', 'dispatch_pr', 'verify_pipeline', 'await_remote_review', 'learnings_commit', 'cleanup',
];

// Steps whose result carries an answer, not an outcome.
const DECISION_STEPS = [
  'confirm_pipeline', 'review_gate', 'rebase_conflict',
  'execute_handoff', 'execute_state', 'execute_tier', 'execute_gate',
  'confirm_commit', 'confirm_received_review', 'confirm_commit_fixes', 'confirm_version', 'confirm_pr',
];
// W4.3 consent steps (S1 = NO): the main context asks before the forked sub-skill runs with --auto.
const CONFIRM_TARGETS = {
  confirm_commit: 'commit', confirm_received_review: 'received-review',
  confirm_commit_fixes: 'commit-fixes', confirm_version: 'version', confirm_pr: 'pr',
};
// Interactive-only decisions, emitted when their target step is about to run (never via historySuccess).
const DECISION_TARGETS = { ...CONFIRM_TARGETS, execute_handoff: 'execute', execute_state: 'execute', execute_tier: 'execute' };
// Inline steps whose failure halts the pipeline: archive_openspec (R25, R-archive-sync-3:
// validation failure or abort) and verify_pipeline (R45: abort). Other inline steps
// (verify_openspec, await_remote_review, learnings_commit) stay non-fatal.
const HALTING_INLINE_STEPS = ['archive_openspec', 'verify_pipeline'];

// L6/L9: computeSteps inputs frozen in ledger.flags.
const FROZEN_FLAG_KEYS = ['planFile', 'openspecContext', 'sources'];

// R6 threshold table, most to least severe.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// P8/Q2: every emitted command uses an absolute, double-quoted script path.
const STATE_SHIP_SCRIPT      = path.join(__dirname, '..', 'state', 'ship.js');
const EXECUTE_STATE_SCRIPT   = path.join(__dirname, '..', 'state', 'execute.js');
const VERIFY_TAG_SCRIPT      = path.join(__dirname, '..', 'util', 'verify-tag-ancestry.js');
const VERIFY_PIPELINE_SCRIPT = path.join(__dirname, 'verify-pipeline.js');
const AWAIT_REVIEW_SCRIPT    = path.join(__dirname, 'await-remote-review.js');
const OPENSPEC_STEP_SCRIPT   = path.join(__dirname, 'openspec-step.js');
// W44-R6: the change name is quoted inside an emitted shell command, so only these characters pass.
const OPENSPEC_CHANGE_RE     = /^[A-Za-z0-9._-]+$/;
const STAGE_COMMAND = "git add -A -- ':!.sdlc/'";
const LEARNINGS_COMMIT_COMMAND = 'git diff --quiet -- .sdlc/learnings/log.md || { git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings" && { git push || echo "push failed (non-fatal)" >&2; }; }';

/**
 * W44-R2 (a): the archive_openspec prompt and --decision are fixed at emission, from fresh
 * reads of the active worktree (R-archive-sync-2). Prompts mirror openspec-steps.md.
 * Returns { decision: 'anyway'|'<decision>', llmDecision: object|null }.
 */
function archiveDecision(change, auto) {
  const none = { decision: 'anyway', llmDecision: null };
  if (auto) return none;
  const root = resolveActiveWorktreeSafe();
  if (isArchived(root, change)) return none;
  const { tasksDone: done, tasksTotal: total, error } = getTaskCounts(root, change);
  if (error) return none; // the script halts on its own read
  if (done < total) {
    return {
      decision: '<decision>',
      llmDecision: {
        type: 'choice',
        prompt: `OpenSpec change "${change}" has ${total - done} incomplete task(s) (${done}/${total} done).`,
        options: ['sync-and-archive', 'archive-anyway', 'abort'],
      },
    };
  }
  if (!validateChangeStrict(root, change).ok) return none; // the script halts on its own validation
  return {
    decision: '<decision>',
    llmDecision: {
      type: 'choice',
      prompt: `OpenSpec change "${change}" passed validation with all ${total} task(s) already complete. Archive now?`,
      options: ['archive', 'abort'],
    },
  };
}

/**
 * progress.total: will_run steps (cleanup included) plus conditional steps whose
 * condition is known to be met — only archive-openspec; review-driven conditions
 * are unknown up front and count as not met. Same value on every call of a run.
 */
function countTotal(steps) {
  return steps.filter(s => s.status === 'will_run' || (s.status === 'conditional' && s.name === 'archive-openspec')).length;
}

/**
 * L2: insert computeSteps names missing from ledger.steps[] at their computeSteps
 * position and mark still-pending skipped steps skipped. Existing statuses are
 * never changed otherwise; cleanup lives in history[] only.
 */
function reconcileSteps(ledger, steps) {
  if (!Array.isArray(ledger.steps)) ledger.steps = [];
  const ordered = steps.filter(s => s.name !== 'cleanup');
  ordered.forEach((cs, i) => {
    let entry = ledger.steps.find(e => e.name === cs.name);
    if (!entry) {
      entry = { name: cs.name, status: 'pending' };
      if (cs.status === 'conditional') entry.condition = cs.reason;
      const prevIdx = Math.max(-1, ...ordered.slice(0, i).map(p => ledger.steps.findIndex(e => e.name === p.name)));
      ledger.steps.splice(prevIdx + 1, 0, entry);
    }
    if (cs.status === 'skipped' && entry.status === 'pending') {
      entry.status = 'skipped';
      entry.completedAt = new Date().toISOString();
      entry.reason = cs.reason;
    }
  });
}

/**
 * L1/L7/L9: create the ledger with the unchanged `state/ship.js init` (mirrors the
 * plan-mode-blocked spawn), or adopt the resumed one; freeze the computeSteps
 * inputs in ledger.flags (present keys are never overwritten).
 * @returns {string|null} ledger path; null on errors or --dry-run (init failure is pushed to errors)
 */
function ensureLedger({ flags, flagSources, openspecContext, planFile, gitState, resume, errors, steps, ttlDays }) {
  if (errors.length > 0 || flags.dryRun) return null;
  let ledgerPath;
  if (resume && resume.found && flags.resume) {
    ledgerPath = resume.fullPath;
  } else {
    const initFlags = { ...flags, planFile, openspecContext, sources: flagSources, ...(ttlDays != null ? { ttlDays } : {}) };
    const res = spawnSync('node', [
      STATE_SHIP_SCRIPT, 'init',
      '--branch', gitState.currentBranch,
      '--flags', JSON.stringify(initFlags),
    ], { encoding: 'utf8', timeout: 10000 });
    if (res.error || res.status !== 0) {
      errors.push(`state/ship.js init failed: ${res.error ? res.error.message : ((res.stderr || '').trim() || `exit ${res.status}`)}`);
      return null;
    }
    ledgerPath = JSON.parse(res.stdout).filePath;
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  ledger.flags = ledger.flags || {};
  const frozen = { planFile, openspecContext, sources: flagSources };
  for (const key of FROZEN_FLAG_KEYS) {
    if (!(key in ledger.flags)) ledger.flags[key] = frozen[key];
  }
  if (!Array.isArray(ledger.history)) ledger.history = [];
  ledger.currentStep = 'confirm_pipeline';
  reconcileSteps(ledger, steps);
  writeState(ledgerPath, ledger);
  return ledgerPath;
}

/**
 * Branch name for workspace=branch, from the plan's first `# ` heading.
 * @returns {{ type: string, slug: string, name: string }}
 * @throws {TypeError} from resolveBranchName (empty slug, bad template)
 */
function deriveBranchFromPlan(planPath, config) {
  const text = fs.readFileSync(planPath, 'utf8');
  const m = /^# (.+)$/m.exec(text);
  const heading = m ? m[1].trim() : '';
  const first = (heading.split(/\s+/)[0] || '').toLowerCase();
  const type = /^(fix|bug)/.test(first) ? 'bugfix'
    : /^doc/.test(first) ? 'docs'
      : /^refactor/.test(first) ? 'refactor'
        : /^(chore|ci|deps)$/.test(first) ? 'chore'
          : 'feature';
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return { type, slug, name: resolveBranchName({ type, slug, config }) };
}

function lastHistory(ledger, id) {
  for (let i = ledger.history.length - 1; i >= 0; i--) {
    if (ledger.history[i].step === id) return ledger.history[i];
  }
  return null;
}

/** Latest `id` history entry recorded after the latest `sinceId` entry, or null. */
function historyAfter(ledger, id, sinceId) {
  for (let i = ledger.history.length - 1; i >= 0; i--) {
    if (ledger.history[i].step === sinceId) return null;
    if (ledger.history[i].step === id) return ledger.history[i];
  }
  return null;
}

/** Mark a ledger step skipped with a reason (no-op when the step is absent). */
function skipEntry(ledger, name, reason) {
  const e = ledger.steps.find(s => s.name === name);
  if (e) { e.status = 'skipped'; e.completedAt = new Date().toISOString(); e.reason = reason; }
}

/**
 * `{prompt, options}` when `v` is a well-formed pending question (SKILL.md Step 5 fills it from return item (4)), else null.
 * `options` may be `[]` when the sub-agent listed none: the question then takes the stop path, never `execute_gate`.
 */
function validPendingQuestion(v) {
  if (!v || typeof v !== 'object' || typeof v.prompt !== 'string' || !v.prompt.trim()) return null;
  if (!Array.isArray(v.options) || !v.options.every(o => typeof o === 'string')) return null;
  return { prompt: v.prompt, options: v.options };
}

const EXECUTE_GATE_YES = 'yes — approve this and all remaining high-risk tasks in this run';
const EXECUTE_GATE_STOP = 'stop — continue in execute-plan-sdlc directly';

/**
 * `'yes'` or `'stop'` when `answer` is exactly an offered `execute_gate` option (its label or its key word), else null.
 * Free text such as "yes, but only task 3" is never approval (ruling w2-declines item 3).
 */
function executeGateChoice(answer) {
  if (answer === EXECUTE_GATE_YES || answer === 'yes') return 'yes';
  if (answer === EXECUTE_GATE_STOP || answer === 'stop') return 'stop';
  return null;
}

/** execute-plan-sdlc's high-risk gate is the only question offering both `yes` and `skip` (SKILL.md 5a). */
function isHighRiskGate(pq) {
  const keys = pq.options.map(o => o.trim().toLowerCase().split(/\s+/)[0]);
  return keys.includes('yes') && keys.includes('skip');
}

/**
 * L23 completeness gate, moved unchanged from runAfter step 4.
 * @returns {{ ok: true } | { ok: false, exitCode: number, text: string }}
 */
function runCompletenessGate(branch) {
  if (!fs.existsSync(EXECUTE_STATE_SCRIPT)) {
    return { ok: false, exitCode: 2, text: 'Cannot locate execute.js — completeness gate cannot run (exit 2).' };
  }
  const r = spawnSync('node', [EXECUTE_STATE_SCRIPT, 'verify-completeness', '--branch', branch], { encoding: 'utf8', timeout: 10000 });
  if (r.error || r.status !== 0) {
    return {
      ok: false,
      exitCode: r.error || r.status == null ? 2 : r.status,
      text: `execute-plan-sdlc returned but planned tasks are unaccounted. Pipeline halted (verify-completeness exit ${r.error ? 'error' : r.status}): ${(r.stderr || '').trim()}`,
    };
  }
  return { ok: true };
}

/** `### Task N:` headings of the plan file; [] when it cannot be read. */
function readPlanTasks(planFile) {
  try { return parsePlanTasks(fs.readFileSync(planFile, 'utf8')); } catch { return []; }
}

function historySuccess(ledger, id) {
  return ledger.history.some(h => h.step === id && h.result === 'success');
}

const REVIEW_SUMMARY_MISSING = 'review summary missing or malformed — dispatching received-review to be safe';
const REVIEW_VERDICTS = ['APPROVED', 'APPROVED WITH NOTES', 'CHANGES REQUESTED'];

/** Absolute path of the review-summary copy for a branch (same slug rule and state dir as review.js's `summary_copy_path`). */
function reviewSummaryPath(branch) {
  return path.join(resolveStateDir(), `review-summary-${slugifyBranch(branch || 'nobranch')}.json`);
}

/**
 * W4.5: the one review-gate decision (R6). Reads `review-summary.json`
 * (schemas/review-summary.schema.json) and applies the `reviewThreshold`
 * table: critical → any critical; high → critical or high; medium → + medium;
 * low → any finding except info. A missing, stale (mtime before `notBefore`)
 * or malformed file dispatches received-review-sdlc (C17: never approve on a
 * missing summary).
 */
function reviewGateFromSummary(summaryPath, threshold, opts = {}) {
  const missing = { dispatchReceivedReview: true, reason: REVIEW_SUMMARY_MISSING, counts: null, verdict: null, summaryFound: false };
  let doc;
  try {
    const st = fs.statSync(summaryPath);
    if (opts.notBefore && st.mtimeMs < opts.notBefore) return missing;
    doc = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } catch { return missing; }
  const c = doc && doc.counts;
  const valid = doc && typeof doc === 'object' && REVIEW_VERDICTS.includes(doc.verdict) && c && typeof c === 'object'
    && [...SEVERITIES, 'info'].every(k => Number.isInteger(c[k]) && c[k] >= 0);
  if (!valid) return missing;
  const counts = { critical: c.critical, high: c.high, medium: c.medium, low: c.low, info: c.info };
  const met = SEVERITIES.slice(0, SEVERITIES.indexOf(threshold) + 1).some(k => counts[k] > 0);
  return {
    dispatchReceivedReview: met,
    reason: met ? `findings at or above reviewThreshold (${threshold})` : `no findings at or above reviewThreshold (${threshold})`,
    counts, verdict: doc.verdict, summaryFound: true,
  };
}

/**
 * `review-gate --threshold critical|high|medium|low [--summary <path>] [--auto]`
 *
 * Prints the decision of reviewGateFromSummary as JSON and exits 0. `--auto`
 * is accepted and does not change the output (only ship's `llm_decision`
 * differs). Without `--summary` the current branch's copy is read.
 */
function reviewGateCli(argv) {
  const args = argv.slice(3);
  let summary = null;
  let threshold = BUILT_IN_DEFAULTS.reviewThreshold;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--summary' && args[i + 1]) summary = args[++i];
    else if (args[i] === '--threshold' && args[i + 1]) threshold = args[++i];
  }
  if (!SEVERITIES.includes(threshold)) threshold = BUILT_IN_DEFAULTS.reviewThreshold;
  if (!summary) summary = reviewSummaryPath(exec('git branch --show-current', { cwd: process.cwd() }) || '');
  const r = reviewGateFromSummary(summary, threshold);
  if (!r.summaryFound) process.stderr.write(`review-gate: ${REVIEW_SUMMARY_MISSING}\n`);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  process.exit(0);
}

/**
 * Decision for the `review_gate` step: the summary file is the only source
 * (no verdict-string fallback). The summary must not predate the ledger's
 * `review` step.
 */
function reviewGateDecision(ledger) {
  const threshold = SEVERITIES.includes(ledger.flags.reviewThreshold)
    ? ledger.flags.reviewThreshold
    : BUILT_IN_DEFAULTS.reviewThreshold;
  const review = ledger.steps.find(s => s.name === 'review');
  const notBefore = review && review.startedAt ? Date.parse(review.startedAt) : 0;
  const summaryPath = reviewSummaryPath(ledger.branch);
  const r = reviewGateFromSummary(summaryPath, threshold, { notBefore });
  return { parseable: r.summaryFound, threshold, verdict: r.verdict, counts: r.counts, met: r.dispatchReceivedReview, summaryFound: r.summaryFound, summaryPath, reason: r.reason };
}

/** Reason a conditional step's condition is not met, or null when it is met. */
function unmetCondition(name, ledger) {
  if (name === 'received-review') {
    const review = ledger.steps.find(s => s.name === 'review');
    if (!review || review.status !== 'completed') return 'review did not run';
    const d = reviewGateDecision(ledger);
    if (!d.met) return `review verdict below reviewThreshold (${d.threshold})`;
    if (ledger.flags.auto || !d.parseable) return null;
    const gate = lastHistory(ledger, 'review_gate');
    return gate && gate.data && gate.data.answer === 'defer' ? 'deferred by the user at review_gate' : null;
  }
  if (name === 'commit-fixes') {
    const rr = ledger.steps.find(s => s.name === 'received-review');
    if (!rr || rr.status !== 'completed') return 'received-review did not run';
    return exec('git status --porcelain', { cwd: process.cwd() }) ? null : 'no working-tree changes after received-review';
  }
  return null; // archive-openspec: met whenever computeSteps returns it conditional
}

/** Step 6 report data: step statuses, usage totals, PR url. */
function buildSummary(ledger) {
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  for (const s of ledger.steps || []) {
    for (const k of Object.keys(usage)) {
      if (s.usage && Number.isInteger(s.usage[k])) usage[k] += s.usage[k];
    }
  }
  const pr = lastHistory(ledger, 'dispatch_pr');
  const handoff = lastHistory(ledger, 'execute_handoff');
  const attested = !!(handoff && handoff.data && handoff.data.source === 'user-attested');
  return {
    steps: (ledger.steps || []).map(s => ({ name: s.name, status: s.status, ...(attested && s.name === 'execute' ? { source: 'user-attested' } : {}) })),
    usage,
    prUrl: (pr && pr.data && pr.data.artifacts && pr.data.artifacts.prUrl) || null,
  };
}

/**
 * Sidecar for the Step 6 summary (X1). `cleanup-pipeline` deletes the ledger before
 * `--after cleanup` runs, so the summary is persisted next to the ledger when the
 * cleanup step is emitted. The dot-prefixed name keeps `ship-<slug>-*` globs from
 * matching it.
 */
function summarySidecarPath(ledgerPath) {
  return path.join(path.dirname(ledgerPath), '.summary-' + path.basename(ledgerPath));
}

/**
 * R38 failure-path sweep (M7): the GC that `cleanup-pipeline --force` runs, in-process,
 * before a failure envelope is emitted. The failed ledger itself is never deleted
 * (P-STEP-3 keeps it for `--resume`).
 */
function sweepStateFiles(flags) {
  try {
    const ttlDays = (flags && typeof flags.ttlDays === 'number') ? flags.ttlDays : readTtlDaysFromConfig();
    const knownBranches = listBranches();
    for (const prefix of ['ship', 'execute', 'plan', 'commit']) {
      gcStateFiles({ prefix, ttlDays, knownBranches });
    }
  } catch (_) { /* the sweep is best effort; the error envelope must still be emitted */ }
}

/**
 * Pick the next step after `after` in P-TRANS-1 order (L6, L19) and build its
 * payload. Conditional steps whose condition is not met are recorded skipped.
 * @returns {{ step, planTasks?, llmDecision, warnings: string[] } | { error: string } | { done: true }}
 */
function pickNextStep(after, ctx) {
  const { ledger, flags, steps, ledgerPath, recorded, skipped } = ctx;
  const stepOf = (name) => steps.find(s => s.name === name);
  const entryOf = (name) => ledger.steps.find(s => s.name === name);
  const isDone = (name) => { const e = entryOf(name); return !!e && (e.status === 'completed' || e.status === 'skipped'); };
  const runnable = (name) => { const cs = stepOf(name); return !!cs && cs.status === 'will_run' && !isDone(name); };

  for (const id of STEP_ORDER.slice(STEP_ORDER.indexOf(after) + 1)) {
    if (id === 'rebase_conflict' || id === 'execute_gate') continue;
    const name = STEP_ID_TO_LEDGER_NAME[id];
    const target = DECISION_TARGETS[id];
    const cs = name ? stepOf(name) : (target ? stepOf(target) : null);
    let data;
    let planTasks;
    let llmDecision = null;
    const warnings = [];

    if (name) {
      if (!cs || cs.status === 'skipped' || isDone(name)) continue;
      if (cs.status === 'conditional') {
        const reason = unmetCondition(name, ledger);
        if (reason) {
          const e = entryOf(name);
          if (e) { e.status = 'skipped'; e.completedAt = new Date().toISOString(); e.reason = reason; }
          skipped.push(name);
          continue;
        }
      }
    } else if (target) {
      if (flags.auto || !cs || cs.status === 'skipped' || isDone(target)) continue;
      if (cs.status === 'conditional') {
        const reason = unmetCondition(target, ledger);
        if (reason) { skipEntry(ledger, target, reason); skipped.push(target); continue; }
      }
    } else if (historySuccess(ledger, id)) {
      continue;
    }

    switch (id) {
      case 'branch_prepare': {
        if (flags.workspace !== 'branch') continue;
        let derived;
        try {
          const config = (readSection(resolveSdlcRoot(), 'workspace') || {}).branch || {};
          derived = deriveBranchFromPlan(flags.planFile, config);
        } catch (err) {
          return { error: `branch_prepare: cannot derive the branch name from the plan: ${err.message}` };
        }
        if (ledger.branch === derived.name) continue;
        data = { branch: derived.name, commands: [`git checkout -b ${derived.name}`] };
        break;
      }
      case 'stage_changes':
        if (!recorded.has('execute')) continue;
        data = { commands: [STAGE_COMMAND] };
        break;
      case 'review_gate': {
        if (!recorded.has('review')) continue;
        const d = reviewGateDecision(ledger);
        data = { verdict: d.verdict, threshold: d.threshold, counts: d.counts, dispatchReceivedReview: d.met, summaryFound: d.summaryFound, summaryPath: d.summaryPath };
        if (!d.parseable) {
          warnings.push(`${REVIEW_SUMMARY_MISSING} (${d.summaryPath}).`);
        } else if (d.met && !flags.auto) {
          const found = SEVERITIES.filter(s => d.counts[s] > 0).map(s => `${d.counts[s]} ${s}`).join(', ');
          llmDecision = { type: 'choice', prompt: `Review found ${found}. Dispatch received-review-sdlc now with "${stepOf('received-review').args}"? It runs unattended and applies the fixes without showing its plan.`, options: ['yes', 'defer'] };
        }
        break;
      }
      case 'rebase': {
        if (!(runnable('version') || runnable('pr'))) continue;
        if (flags.rebase === 'skip') { skipped.push('rebase'); continue; }
        let base;
        try { base = detectBaseBranch(process.cwd()); } catch (err) {
          return { error: `rebase: ${err.message} State preserved; re-run with --resume.` };
        }
        if (exec('git fetch origin', { cwd: process.cwd() }) === null) {
          return { error: 'rebase: git fetch origin failed. State preserved; re-run with --resume.' };
        }
        const upToDate = exec(`git merge-base --is-ancestor origin/${base} HEAD`, { cwd: process.cwd() }) !== null;
        data = { base, commands: upToDate ? [] : [`git rebase origin/${base}`] };
        break;
      }
      case 'verify_version_tag': {
        if (!recorded.has('version')) continue;
        const v = lastHistory(ledger, 'dispatch_version');
        const NEW_TAG = (v && v.data && v.data.artifacts && v.data.artifacts.tag) || null;
        const EXECUTE_BRANCH = historySuccess(ledger, 'branch_prepare') ? ledger.branch : null;
        data = {
          NEW_TAG,
          EXECUTE_BRANCH,
          commands: NEW_TAG && EXECUTE_BRANCH
            ? [`node "${VERIFY_TAG_SCRIPT}" --tag "${NEW_TAG}" --branch "${EXECUTE_BRANCH}" --remote origin`]
            : [],
        };
        break;
      }
      case 'verify_openspec':
      case 'archive_openspec': {
        const change = flags.openspecChange || (flags.openspecContext && flags.openspecContext.branchMatch) || null;
        if (!change || !OPENSPEC_CHANGE_RE.test(change)) {
          return { error: `${id}: openspec change name not shell-safe: ${JSON.stringify(change)}` };
        }
        data = { change, args: cs.args, commands: [] };
        if (id === 'verify_openspec') {
          data.commands = [`node "${OPENSPEC_STEP_SCRIPT}" validate --change "${change}"`];
          break;
        }
        const a = archiveDecision(change, flags.auto);
        data.commands = [`node "${OPENSPEC_STEP_SCRIPT}" archive --change "${change}" --decision ${a.decision}${flags.auto ? ' --auto' : ''}`];
        llmDecision = a.llmDecision;
        break;
      }
      case 'verify_pipeline':
      case 'await_remote_review':
        data = { commands: [`node "${id === 'verify_pipeline' ? VERIFY_PIPELINE_SCRIPT : AWAIT_REVIEW_SCRIPT}" ${cs.args} --state-file "${ledgerPath}"`] };
        break;
      case 'learnings_commit':
        data = { commands: [LEARNINGS_COMMIT_COMMAND] };
        break;
      case 'cleanup': {
        const force = ledger.steps.some(s => s.status === 'failed');
        data = {
          commands: [`node "${STATE_SHIP_SCRIPT}" cleanup-pipeline${force ? ' --force' : ''}${flags.ttlDays != null ? ` --ttl-days ${flags.ttlDays}` : ''}`],
          summary: buildSummary(ledger),
        };
        break;
      }
      case 'execute_handoff': {
        const e = entryOf('execute');
        const last = lastHistory(ledger, 'dispatch_execute');
        const pq = last && last.data ? validPendingQuestion(last.data.pendingQuestion) : null;
        if (!e || e.status !== 'in_progress' || !pq || readState('execute', slugifyBranch(ledger.branch))) continue;
        data = { pendingQuestion: pq };
        llmDecision = { type: 'choice', prompt: 'Did execute-plan-sdlc finish the plan outside the pipeline?', options: ['finished', 'not finished'] };
        break;
      }
      case 'execute_state': {
        const e = entryOf('execute');
        const found = readState('execute', slugifyBranch(ledger.branch));
        if ((e && e.status === 'in_progress') || !found) continue;
        data = { stateFile: found.filePath };
        llmDecision = { type: 'choice', prompt: 'An execute-plan-sdlc state file exists for this branch. Resume it, or restart from scratch?', options: ['resume', 'restart'] };
        break;
      }
      case 'execute_tier':
        if (flags.quality) continue;
        data = {};
        llmDecision = { type: 'choice', prompt: 'Which quality tier should execute-plan-sdlc use? The answer is forwarded as --quality.', options: ['full', 'balanced', 'minimal'] };
        break;
      case 'confirm_received_review': {
        const gate = historyAfter(ledger, 'review_gate', 'dispatch_review');
        if (gate && gate.data && gate.data.answer === 'yes') continue; // review_gate's yes is the consent (ruling w2-handoff item 2)
      }
      // falls through
      case 'confirm_commit':
      case 'confirm_commit_fixes':
      case 'confirm_version':
      case 'confirm_pr':
        data = { step: cs.name, skill: cs.skill, args: cs.args };
        llmDecision = { type: 'choice', prompt: `Run ${cs.skill} (${cs.name}) now with "${cs.args}"? It runs unattended, without its own approval prompt.`, options: ['yes', 'skip', 'cancel'] };
        break;
      default: // dispatch_*
        data = { skill: cs.skill, args: cs.args, invocation: cs.invocation, agent: cs.agent, model: cs.model, ...(cs.effort ? { effort: cs.effort } : {}), ...(cs.isolation ? { isolation: cs.isolation } : {}) };
        if (id === 'dispatch_execute') {
          // L22: a resumed run (execute in_progress with an execute state file) forwards --resume only.
          const exec0 = entryOf('execute');
          const hasState = !!readState('execute', slugifyBranch(ledger.branch));
          const st = historyAfter(ledger, 'execute_state', 'dispatch_execute');
          const gate = historyAfter(ledger, 'execute_gate', 'dispatch_execute');
          const gateYes = !!(gate && gate.data && executeGateChoice(gate.data.answer) === 'yes');
          const resume = gateYes || (hasState && ((exec0 && exec0.status === 'in_progress') || (st && st.data && st.data.answer === 'resume')));
          const extra = [resume ? '--resume' : '', gateYes && !flags.auto ? '--auto' : ''].filter(Boolean);
          if (extra.length > 0) {
            data.args = `${cs.args} ${extra.join(' ')}`;
            data.invocation = `skill: "${cs.skill}", args: "${data.args}"`;
          }
          planTasks = readPlanTasks(flags.planFile);
          if (planTasks.length === 0) {
            return { error: `dispatch_execute: the plan must contain at least one "### Task N:" heading (R-SHIPTODOS-FAILLOUD): ${flags.planFile}` };
          }
        }
    }

    const ACTIONS = {
      branch_prepare: 'Create the feature branch: run data.commands, then report the result.',
      stage_changes: 'Stage the changes: run data.commands, then report the result.',
      review_gate: 'Apply the review gate: ask the user when llm_decision is set; otherwise report the result.',
      rebase: 'Run data.commands (none when the branch is up to date). On a rebase conflict run `git rebase --abort` first, then report success:false.',
      verify_version_tag: 'Run data.commands (a no-op when empty) to verify the release tag ancestry.',
      verify_openspec: 'Run data.commands and report success:true with its JSON verdict (non-blocking; see openspec-steps.md).',
      archive_openspec: 'Resolve llm_decision when set, then run data.commands per openspec-steps.md (no command on abort) and report the result.',
      verify_pipeline: 'Run data.commands and handle its JSON verdict per the verify-pipeline section of reference.md.',
      await_remote_review: 'Run data.commands and handle its JSON verdict per the await-remote-review section of reference.md.',
      learnings_commit: 'Run data.commands, then report the result.',
      cleanup: 'Run data.commands to finish the pipeline, then report the result.',
      execute_handoff: 'Ask the user with llm_decision, then report the answer.',
      execute_state: 'Ask the user with llm_decision, then report the answer.',
      execute_tier: 'Ask the user with llm_decision, then report the answer.',
      confirm_commit: 'Ask the user with llm_decision, then report the answer.',
      confirm_received_review: 'Ask the user with llm_decision, then report the answer.',
      confirm_commit_fixes: 'Ask the user with llm_decision, then report the answer.',
      confirm_version: 'Ask the user with llm_decision, then report the answer.',
      confirm_pr: 'Ask the user with llm_decision, then report the answer.',
    };
    const isDispatch = id.startsWith('dispatch_');
    return {
      step: {
        id,
        action: isDispatch ? `Dispatch ${cs.skill} as a sub-agent with data.invocation, then report its result.` : ACTIONS[id],
        tool_hints: isDispatch ? ['Agent'] : (DECISION_STEPS.includes(id) ? ['AskUserQuestion'] : ['Bash']),
        data,
      },
      planTasks,
      llmDecision,
      warnings,
    };
  }
  return { done: true };
}

/**
 * `--after <id> --result-file <p> --state <ledger>` (P-STEP-2): record the finished
 * step in the ledger, then emit the next one (P-TRANS-1). Every computeSteps
 * input comes from ledger.flags (L6, L8).
 */
function runAfter(stepArgs) {
  const after = stepArgs.after;
  let ledgerPath = stepArgs.stateFile;
  const emit = (envelope, exitCode) => writeOutput(envelope, 'ship-step', envelope.status === 'error' ? (exitCode ?? 1) : 0);
  const fail = (message, extra = {}) => emit(createEnvelope('error', null, { error: message, stateFile: ledgerPath, ...extra }));

  // 1. Validate.
  if (stepArgs.result == null) {
    const i = process.argv.indexOf('--result-file');
    const file = i !== -1 ? process.argv[i + 1] : null;
    return fail(`--after ${after}: the result ${file ? `file "${file}"` : '(--result-file)'} is missing or not valid JSON; nothing recorded.`);
  }
  if (!STEP_ORDER.includes(after)) return fail(`--after ${after}: unknown step id.`);
  if (!ledgerPath) return fail(`--after ${after}: --state <ledger path> is required.`);
  if (!fs.existsSync(ledgerPath)) {
    // The normal cleanup-pipeline already deleted the ledger.
    if (after === 'cleanup') {
      let summary = null;
      const sidecar = summarySidecarPath(ledgerPath);
      try {
        summary = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
        fs.unlinkSync(sidecar);
      } catch (_) { /* no sidecar (older run): summary stays null */ }
      return emit(createEnvelope('done', null, { ext: { summary } }));
    }
    return fail(`--after ${after}: state file not found: ${ledgerPath}`);
  }
  let ledger;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch (err) {
    return fail(`--after ${after}: state file unreadable: ${err.message}`);
  }
  const flags = ledger.flags || {};

  // The ledger still exists after a forced cleanup or a contract violation: the summary
  // sidecar was not consumed above, so remove it here (GC never prunes it).
  if (after === 'cleanup') {
    try { fs.unlinkSync(summarySidecarPath(ledgerPath)); } catch (_) { /* absent is fine */ }
  }

  // 1b. Dry-run ledger: no step runs (P11).
  if (after === 'confirm_pipeline' && flags.dryRun === true) {
    return emit(createEnvelope('done', null, { ext: { reason: 'dry-run' }, stateFile: ledgerPath }));
  }
  const missing = FROZEN_FLAG_KEYS.find(k => !(k in flags));
  if (missing) {
    return fail(`ledger.flags lacks "${missing}"; re-run /ship-sdlc with --resume so the initial call freezes it.`);
  }
  if (!Array.isArray(ledger.history)) ledger.history = [];
  const result = stepArgs.result;
  const output = (result.output && typeof result.output === 'object') ? result.output : {};
  const warnings = [];

  // --after branch_prepare: migrate the ledger before any in-memory mutation.
  if (after === 'branch_prepare' && result.success === true) {
    const newBranch = checkGitState(process.cwd()).currentBranch;
    const reported = output.artifacts && output.artifacts.branch;
    if (reported && reported !== newBranch) {
      warnings.push(`branch_prepare reported branch "${reported}" but the current branch is "${newBranch}"; using "${newBranch}".`);
    }
    const res = migrateBranchSlug({ prefix: 'ship', fromSlug: slugifyBranch(ledger.branch), toBranch: newBranch });
    if (res.migrated) ledgerPath = res.filePath;
    ledger.branch = newBranch;
  }

  // Q15: the tier answer is frozen in ledger.flags.quality before the steps are recomputed.
  if (after === 'execute_tier') {
    const tier = typeof output.answer === 'string' ? output.answer : null;
    if (!VALID_QUALITY.includes(tier)) return fail(`execute_tier: unknown answer "${tier}" (expected full, balanced or minimal).`);
    flags.quality = tier;
  }

  // 2. Recompute the step plan from the frozen flags.
  const steps = computeSteps(flags, flags.sources, {
    openspecContext: flags.openspecContext,
    expectedBranch: ledger.branch,
    planFile: flags.planFile,
  });
  const total = countTotal(steps);
  const skipped = [];
  const progress = () => ({
    completed: ledger.steps.filter(s => s.status === 'completed').length,
    total,
    ...(skipped.length > 0 ? { skipped } : {}),
  });

  // 3. edit/cancel before anything ran: delete the ledger (L1).
  const answer = typeof output.answer === 'string' ? output.answer : null;
  if (after === 'confirm_pipeline' && (answer === 'edit' || answer === 'cancel')) {
    const pristine = ledger.history.length === 0 &&
      !ledger.steps.some(s => ['in_progress', 'completed', 'failed'].includes(s.status));
    if (pristine) {
      deleteState(ledgerPath);
      return emit(createEnvelope('done', null, { ext: { reason: answer } }));
    }
  }

  // 4. Record the finished step.
  const name = STEP_ID_TO_LEDGER_NAME[after];
  // W44-R3: abort leaves archive-openspec in_progress so --resume re-emits it (R-archive-sync-3).
  const archiveAbort = after === 'archive_openspec' && answer === 'abort';
  let success = result.success === true;
  let failureText = output.summary;
  if (name && STEP_SIDE_EFFECTS[name] === 'tag' && success) {
    const tag = output.artifacts && output.artifacts.tag;
    if (!tag || !getTagList(resolveActiveWorktreeSafe()).includes(tag)) {
      success = false;
      failureText = `version tag "${tag || ''}" was not found in the git tag list`;
    }
  }
  // W4.6: commit/commit-fixes and pr are cross-checked like version (git HEAD; gh pr view).
  const sideKey = name === 'commit-fixes' ? 'commit' : name;
  if (sideKey && success && STEP_SIDE_EFFECTS[sideKey] === 'head-commit') {
    const sha = output.artifacts && output.artifacts.commit;
    if (!checkHeadCommit(sha, resolveActiveWorktreeSafe()).landed) {
      success = false;
      failureText = `commit "${sha || ''}" is not HEAD`;
    }
  } else if (sideKey && success && STEP_SIDE_EFFECTS[sideKey] === 'pr-url') {
    const url = output.artifacts && output.artifacts.prUrl;
    const c = checkPrUrl(url, resolveActiveWorktreeSafe());
    if (!c.landed) {
      success = false;
      failureText = `PR "${url || ''}" not confirmed by gh (${c.reason || 'no-url'})`;
    }
  }
  // L23/L27: completeness gate when an execute state file exists; any non-zero exit halts and becomes the process exit code.
  let failExitCode;
  if (name === 'execute' && success) {
    // R-INVARIANT-COMPLETENESS scope: execute's verifying R14 cleanup (or the R5 small-plan path) leaves no state to check.
    if (findStateFile('execute', slugifyBranch(ledger.branch))) {
      const g = runCompletenessGate(ledger.branch);
      if (!g.ok) { success = false; failExitCode = g.exitCode; failureText = g.text; }
    } else {
      output.completenessGate = 'no-execute-state';
    }
  }
  // ruling w2-pending: a dispatch failure that carries a question is not a step failure.
  const pq = after.startsWith('dispatch_') && !success ? validPendingQuestion(output.pendingQuestion) : null;
  const ext = {};
  const recorded = new Set();
  if (name && !pq && !archiveAbort) {
    const entry = ledger.steps.find(s => s.name === name);
    if (entry && entry.status === 'pending') shipState.startStepCore(ledger, name);
    // Usage is reported by dispatched sub-agents only; inline steps carry none.
    let usage;
    if (after.startsWith('dispatch_')) {
      const parsedUsage = parseUsage(JSON.stringify(output.usage));
      usage = parsedUsage.ok ? parsedUsage.value : undefined;
      if (!parsedUsage.ok) warnings.push(`${name}: usage absent or invalid (${parsedUsage.error}); not recorded.`);
    }
    // W44-R4: archive_openspec records the script's resultText.
    const okText = after === 'archive_openspec' && typeof output.resultText === 'string' ? output.resultText : output.summary;
    const res = shipState.completeStepCore(ledger, name, success ? okText : failureText, success ? 'success' : 'failure', usage);
    if (!res.ok) return fail(`--after ${after}: ${res.error} in the ledger.`);
    // A failed execute lists one todo per plan task (HEAD's `--event execute --fail-step execute`).
    const failTasks = !success && name === 'execute' ? readPlanTasks(flags.planFile) : [];
    ext.todos = success
      ? markCompleted(ledger, name)
      : failTasks.length > 0
        ? renderTodos(ledger, { event: 'execute', currentStep: 'execute', failStep: 'execute', planTasks: failTasks })
        : renderTodos(ledger, { event: 'step', currentStep: name, failStep: name });
    if (success) recorded.add(name);
  }
  // R-INVARIANT-COMPLETENESS scope (ruling w2-handoff): execute finished outside the pipeline.
  let handoffFail = null;
  if (after === 'execute_handoff' && answer === 'finished') {
    const found = readState('execute', slugifyBranch(ledger.branch));
    const gate = found ? runCompletenessGate(ledger.branch) : { ok: true };
    if (!gate.ok) {
      shipState.completeStepCore(ledger, 'execute', gate.text, 'failure');
      handoffFail = gate;
      success = false;
    } else {
      shipState.completeStepCore(ledger, 'execute', 'finished outside the pipeline', 'success');
      if (!found) output.source = 'user-attested';
      ext.todos = markCompleted(ledger, 'execute');
      recorded.add('execute');
    }
  }
  ledger.history.push({
    step: after,
    result: result.success === undefined ? 'unknown' : (success ? 'success' : 'failed'),
    data: output,
    timestamp: new Date().toISOString(),
  });
  ledger.currentStep = null;

  const finish = (envelope, exitCode) => {
    if (warnings.length > 0) envelope.ext.warnings = warnings;
    writeState(ledgerPath, ledger);
    emit(envelope, exitCode);
  };
  const failStep = (message, exitCode) => {
    sweepStateFiles(flags);
    return finish(createEnvelope('error', null, { error: message, stateFile: ledgerPath, progress: progress(), ext }), exitCode);
  };
  const pendingStop = (question, viaExecute) => {
    ledger.paused = { at: new Date().toISOString(), reason: 'pending question' };
    const commands = [
      ...(viaExecute ? [`/sdlc:execute-plan-sdlc --plan "${flags.planFile}" --resume`] : []),
      '/sdlc:ship-sdlc --resume',
    ];
    return finish(createEnvelope('done', null, {
      ext: { ...ext, reason: 'pending-question', pendingQuestion: question, commands },
      stateFile: ledgerPath, progress: progress(),
    }));
  };

  // Failure rows.
  if (pq) {
    if (after === 'dispatch_execute' && !flags.auto && flags.quality && isHighRiskGate(pq)) {
      ledger.currentStep = 'execute_gate';
      return finish(createEnvelope('step', {
        id: 'execute_gate',
        action: 'Ask the user with llm_decision, then report the answer.',
        tool_hints: ['AskUserQuestion'],
        data: { pendingQuestion: pq },
      }, {
        llmDecision: {
          type: 'choice',
          prompt: `execute-plan-sdlc asks: ${pq.prompt} Ship can only carry "yes" back: execute then re-runs with --resume --auto, which approves this and every later high-risk gate in this run and suppresses its other prompts.`,
          options: [EXECUTE_GATE_YES, EXECUTE_GATE_STOP],
        },
        stateFile: ledgerPath, progress: progress(), ext,
      }));
    }
    return pendingStop(pq, after === 'dispatch_execute');
  }
  if (handoffFail) {
    return failStep(`execute failed: ${handoffFail.text}. State preserved; re-run with --resume.`, handoffFail.exitCode);
  }
  if (!success && !DECISION_STEPS.includes(after)) {
    if (after === 'rebase' && !flags.auto) {
      ledger.currentStep = 'rebase_conflict';
      return finish(createEnvelope('step', {
        id: 'rebase_conflict',
        action: 'Ask the user how to resolve the rebase conflict, then report the answer.',
        tool_hints: ['AskUserQuestion'],
        data: {},
      }, {
        llmDecision: { type: 'choice', prompt: 'The rebase hit a conflict. How should the pipeline continue?', options: ['pause', 'skip', 'merge'] },
        stateFile: ledgerPath, progress: progress(), ext,
      }));
    }
    if (after === 'rebase' || after.startsWith('dispatch_') || !name || HALTING_INLINE_STEPS.includes(after)) {
      return failStep(`${name || after} failed: ${failureText || 'no summary'}. State preserved; re-run with --resume.`, failExitCode);
    }
    // The other inline named steps (verify-openspec, await-remote-review, learnings-commit)
    // stay recorded failed; cleanup then runs with --force.
  }
  if (after === 'confirm_pipeline' && !flags.auto && answer !== 'yes') {
    if (answer === 'edit' || answer === 'cancel') {
      return finish(createEnvelope('done', null, { ext: { ...ext, reason: answer }, stateFile: ledgerPath, progress: progress() }));
    }
    return failStep(`confirm_pipeline: unknown answer "${answer}" (expected yes, edit or cancel).`);
  }
  if (archiveAbort) {
    return finish(createEnvelope('done', null, { ext: { ...ext, reason: 'cancel' }, stateFile: ledgerPath, progress: progress() }));
  }
  if (after === 'rebase_conflict' && answer === 'pause') {
    ledger.paused = { at: new Date().toISOString(), reason: 'rebase conflict' };
    return finish(createEnvelope('done', null, { ext: { ...ext, reason: 'paused' }, stateFile: ledgerPath, progress: progress() }));
  }
  if (CONFIRM_TARGETS[after]) {
    const target = CONFIRM_TARGETS[after];
    if (answer === 'cancel') {
      return finish(createEnvelope('done', null, { ext: { ...ext, reason: 'cancel' }, stateFile: ledgerPath, progress: progress() }));
    }
    if (answer === 'skip') {
      const reason = `skipped by the user at ${after}`;
      skipEntry(ledger, target, reason);
      skipped.push(target);
      if (target === 'pr') {
        for (const dep of ['verify-pipeline', 'await-remote-review']) {
          const e = ledger.steps.find(s => s.name === dep);
          if (e && e.status === 'pending') { skipEntry(ledger, dep, 'pr skipped by the user'); skipped.push(dep); }
        }
      }
    } else if (answer !== 'yes') {
      return failStep(`${after}: unknown answer "${answer}" (expected yes, skip or cancel).`);
    }
  }
  if (after === 'execute_state') {
    if (answer === 'restart') {
      const found = readState('execute', slugifyBranch(ledger.branch));
      if (found) deleteState(found.filePath); // ruling w2-handoff item 6: this branch's execute state file only
    } else if (answer !== 'resume') {
      return failStep(`execute_state: unknown answer "${answer}" (expected resume or restart).`);
    }
  }
  let from = after;
  if (after === 'execute_gate') {
    const last = lastHistory(ledger, 'dispatch_execute');
    // Exact option match only: anything else (free text included) takes the stop path (ruling w2-declines item 3).
    if (executeGateChoice(answer) === 'yes') from = 'execute_tier';
    else return pendingStop(last.data.pendingQuestion, true);
  }
  if (after === 'execute_handoff' && answer !== 'finished') {
    if (answer === 'not finished') return pendingStop(lastHistory(ledger, 'dispatch_execute').data.pendingQuestion, true);
    return failStep(`execute_handoff: unknown answer "${answer}" (expected finished or not finished).`);
  }

  // 5. Pick the next step.
  const next = pickNextStep(from, { ledger, flags, steps, ledgerPath, recorded, skipped });
  if (next.error) return failStep(next.error);
  if (next.done) {
    return finish(createEnvelope('done', null, { ext: { ...ext, summary: buildSummary(ledger) }, stateFile: ledgerPath, progress: progress() }));
  }
  warnings.push(...next.warnings);

  // 6. Start on emit (L14).
  const nextName = STEP_ID_TO_LEDGER_NAME[next.step.id];
  if (nextName) {
    const res = shipState.startStepCore(ledger, nextName);
    if (!res.ok) return failStep(`${next.step.id}: ${res.error} in the ledger.`);
    delete ledger.paused;
    try {
      fs.unlinkSync(path.join(resolveStateDir(), '.stop-cap-exhausted-' + slugifyBranch(ledger.branch) + '.json'));
    } catch { /* absent is fine */ }
    const rendered = nextName === 'execute'
      ? renderTodos(ledger, { event: 'execute', currentStep: 'execute', planTasks: next.planTasks })
      : stepTransition(ledger, nextName);
    next.step.data.todos = rendered.todos;
    next.step.data.marker = rendered.marker;
  }
  ledger.currentStep = next.step.id;

  // X1: `cleanup-pipeline` deletes the ledger before `--after cleanup` runs, so keep
  // the Step 6 summary where that call can still read it.
  if (next.step.id === 'cleanup' && next.step.data && next.step.data.summary) {
    try {
      fs.writeFileSync(summarySidecarPath(ledgerPath), JSON.stringify(next.step.data.summary));
    } catch (_) { /* the summary then stays null after cleanup */ }
  }

  // 7. Persist and emit.
  return finish(createEnvelope('step', next.step, {
    llmDecision: next.llmDecision, stateFile: ledgerPath, progress: progress(), ext,
  }));
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

  // review-gate subcommand (W4.5): the review_gate decision from review-summary.json.
  if (process.argv[2] === 'review-gate') {
    return reviewGateCli(process.argv);
  }

  // P-STEP-2: every call after the initial one is `--after <id> --result-file <p> --state <ledger>`.
  const stepArgs = parseStepArgs();
  if (stepArgs.after) return runAfter(stepArgs);

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

  // R-cap-recovery: the Stop hook records a stall in .stop-cap-exhausted-<slug>.json
  // instead of mutating the ledger; surface it here when a pipeline is resumable.
  try {
    const exhausted = JSON.parse(fs.readFileSync(
      path.join(resolveStateDir(), `.stop-cap-exhausted-${slugifyBranch(gitState.currentBranch)}.json`), 'utf8'));
    if (exhausted && exhausted.stepName && resume && resume.found) {
      warnings.push(`Step ${exhausted.stepName} stalled after 3 consecutive Stop blocks; resume with --resume or mark it failed`);
      resume.capExhausted = { stepName: exhausted.stepName, at: exhausted.at };
    }
  } catch { /* absent or corrupt — no stall recorded */ }

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
    // L15: when init will run (no errors, not --dry-run) it prunes the earlier
    // ledger, so the warning no longer offers --resume.
    warnings.push(errors.length === 0 && !flags.dryRun
      ? 'Ship state file exists but was created in a different worktree. This run replaced it with a new ledger; the earlier run cannot be resumed.'
      : 'Ship state file exists but was created in a different worktree. Use --resume to resume explicitly.');
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

  // L1: create (or adopt on resume) the ledger once, before the envelope names it.
  const ledgerPath = ensureLedger({
    flags, flagSources, openspecContext, planFile, gitState, resume, errors, steps,
    ttlDays: cli.ttlDays,
  });

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

  // P-STEP-1 / P-TRANS-1 (initial): the prepare keys above stay as they are;
  // the envelope keys are added beside them. Error-free runs emit confirm_pipeline
  // (under --dry-run too, P11) — prepare errors emit status "error" instead.
  if (errors.length > 0) {
    const first = errors[0];
    Object.assign(result, createEnvelope('error', null, {
      error: typeof first === 'string' ? first : first.message,
      stateFile: null,
    }));
  } else {
    Object.assign(result, createEnvelope('step', {
      id: 'confirm_pipeline',
      action: 'Confirm the pipeline with the user (skip when llm_decision is null).',
      tool_hints: ['AskUserQuestion'],
      data: {},
    }, {
      llmDecision: (flags.auto || flags.dryRun)
        ? null
        : { type: 'confirm', prompt: 'Run this pipeline?', options: ['yes', 'edit', 'cancel'] },
      stateFile: ledgerPath,
      progress: { completed: 0, total: countTotal(steps) },
      ext: {},
    }));
  }

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
