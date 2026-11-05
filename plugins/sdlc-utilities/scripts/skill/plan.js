#!/usr/bin/env node
/**
 * plan-prepare.js
 * Pre-compute OpenSpec context and plan guardrails for plan-sdlc.
 * Uses lib/openspec.js for detection and lib/config.js for guardrail loading.
 *
 * Usage:
 *   node plan-prepare.js [--from-openspec <change-name>] [--output-file] [--quality full|balanced|minimal]
 *   node plan-prepare.js --mark <name> [--path <abs>]
 *   node plan.js diff-material --before <path> --after <path>
 *   node plan.js g17-prepare --plan <path> --dimensions-dir <dir> --instructions-dir <dir> --learnings <path> [--window <days>] [--github-hosting true|false] [--root <dir>] [--today YYYY-MM-DD]
 *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>]
 *
 * Options:
 *   --from-openspec <name>  Validate a specific OpenSpec change for direct bridging
 *   --output-file           Write JSON to temp file, print path (default: stdout)
 *   --quality <preset>     Plan-review preset (A4): full | balanced (default) | minimal
 *   --mark <name>           Update the latest plan state file with a checkpoint marker.
 *                           Valid names: plan-file, guardrailsEvaluated, critiqueRan
 *   --path <abs>            Absolute path to the plan file (required when --mark plan-file)
 *
 * Exit codes: 0 = success, 1 = validation error, 2 = unexpected crash
 * Stdout: JSON (or file path with --output-file)
 * Stderr: warnings/progress
 *
 * Uses only Node.js built-in modules + lib/*.js. No npm install required.
 */

'use strict';

const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');
const { spawnSync } = require('node:child_process');
const LIB = path.join(__dirname, '..', 'lib');

const { detectActiveChanges, validateChange, parseTasks, getRequirementInventory } = require(path.join(LIB, 'openspec'));
const { readSection, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
const { writeOutput } = require(path.join(LIB, 'output'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { initState, findStateFile, readState, writeState, slugifyBranch, pruneStateFiles } = require(path.join(LIB, 'state'));
const { exec, parseRemoteOwner } = require(path.join(LIB, 'git'));
const { LANE_DEFS, diffMaterial, g17Prepare, mergeLanes } = require(path.join(LIB, 'plan-critique'));
const { extractFrontmatter, parseSimpleYaml } = require(path.join(LIB, 'yaml'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MARK_NAMES = ['plan-file', 'guardrailsEvaluated', 'critiqueRan'];

/**
 * Map CLI --mark name to the JSON key in planIntegrity.
 * 'plan-file' → 'planFile'; others map identity.
 */
function markerKey(name) {
  return name === 'plan-file' ? 'planFile' : name;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let fromOpenspec = null;
  let markName = null;
  let markPath = null;
  let quality = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from-openspec' && args[i + 1]) {
      fromOpenspec = args[++i];
    } else if (args[i] === '--mark' && args[i + 1]) {
      markName = args[++i];
    } else if (args[i] === '--path' && args[i + 1]) {
      markPath = args[++i];
    } else if (args[i] === '--quality') { quality = args[i + 1] ?? ''; i++; }
    // --output-file is handled by writeOutput
  }

  return { fromOpenspec, markName, markPath, quality };
}

// ---------------------------------------------------------------------------
// --mark mode: update the latest plan state file with a checkpoint marker
// ---------------------------------------------------------------------------

function runMarkMode(markName, markPath) {
  if (!VALID_MARK_NAMES.includes(markName)) {
    process.stderr.write(
      `[plan-prepare] --mark: unknown marker name "${markName}". ` +
      `Valid names: ${VALID_MARK_NAMES.join(', ')}\n`
    );
    process.exit(1);
  }

  if (markName === 'plan-file' && !markPath) {
    process.stderr.write('[plan-prepare] --mark plan-file requires --path <abs>\n');
    process.exit(1);
  }

  const branch = exec('git branch --show-current');
  if (!branch) {
    process.stderr.write('[plan-prepare] --mark: could not determine current branch\n');
    process.exit(1);
  }

  const branchSlug = slugifyBranch(branch);
  const found = findStateFile('plan', branchSlug);
  if (!found) {
    process.stderr.write(
      `[plan-prepare] --mark: no plan state file found for branch "${branch}". ` +
      `Run plan-prepare.js --output-file first.\n`
    );
    process.exit(1);
  }

  const existing = readState('plan', branchSlug);
  const data = (existing && existing.data) ? existing.data : {};

  if (!data.planIntegrity || typeof data.planIntegrity !== 'object') {
    data.planIntegrity = {};
  }

  const key = markerKey(markName);
  data.planIntegrity[key] = new Date().toISOString();

  if (markName === 'plan-file') {
    data.planFilePath = markPath;
  }

  writeState(found.fullPath, data);
  process.stderr.write(`[plan-prepare] marker "${key}" written to ${found.fullPath}\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// P14/P15 helpers — G17 Dimension Coverage gate (R32, R33) — Fixes #417
// ---------------------------------------------------------------------------

/**
 * Build P14 githubHosting signal (R32).
 * Uses parseRemoteOwner from lib/git.js — no re-derivation in SKILL.md or G17 prompt.
 * @param {string} projectRoot
 * @returns {{ detected: boolean, host: string|null }}
 */
function buildGithubHosting(projectRoot) {
  try {
    const parsed = parseRemoteOwner(projectRoot);
    if (!parsed) return { detected: false, host: null };
    return { detected: parsed.host === 'github.com', host: parsed.host };
  } catch {
    return { detected: false, host: null };
  }
}

// P15–P17, P20, P25 — agent dispatch (R33, R35, R36, R39). Agents ship with the
// plugin next to scripts/, so no other location is searched (#9196).
const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
const FORMAT_REFERENCE_PATH = path.join(__dirname, '..', '..', 'skills', 'plan-sdlc', 'plan-format-reference.md');

const LANE_AGENTS = {
  'static-structural':    'plan-lane-static',
  'content-coverage':     'plan-lane-content',
  'guardrail-compliance': 'plan-lane-guardrail',
};

const LENS_INPUTS = ['PLAN_FILE_PATH', 'REQUIREMENTS_CHECKLIST', 'LENS', 'LENS_FOCUS', 'BRIEF_FILE', 'GUARDRAILS', 'REQUIREMENTS_JSON'];
const INPUT_NAMES = {
  'plan-lane-static':       ['PLAN_FILE_PATH', 'REQUIREMENTS_SUMMARY', 'ACTIVE_GUARDRAILS'],
  'plan-lane-content':      ['PLAN_FILE_PATH', 'REQUIREMENTS_SUMMARY', 'OPENSPEC_TASKS', 'ACTIVE_GUARDRAILS', 'BRIEF_FINDING_IDS', 'FORMAT_REFERENCE_PATH', 'PLAN_TEMPLATE_PATH'],
  'plan-lane-guardrail':    ['PLAN_FILE_PATH', 'ACTIVE_GUARDRAILS'],
  'plan-lane-g17':          ['PLAN_FILE_PATH', 'FIRED_CRITERIA_JSON'],
  'plan-lens-architecture': LENS_INPUTS,
  'plan-lens-requirements': [...LENS_INPUTS, 'OPENSPEC_TASKS'],
  'plan-lens-risk':         LENS_INPUTS,
  'plan-reviewer':          ['PLAN_FILE_PATH', 'REQUIREMENTS_CHECKLIST', 'SOURCE_REQUIREMENTS', 'BRIEF_FILE', 'OPENSPEC_TASKS', 'REQUIREMENTS_JSON', 'GUARDRAILS'],
  'plan-intake-verify':     ['PROPOSAL', 'DELTA_SPECS', 'TASKS_MD', 'DESIGN', 'REQUIREMENTS_JSON'],
};

const LENS_DEFS = [
  { lens: 'architecture', focusCategories: ['Buildability', 'Task descriptions', 'Decision documentation', 'Dependency accuracy'] },
  { lens: 'requirements', focusCategories: ['Requirements coverage', 'Metadata completeness', 'Plan completeness', 'OpenSpec G16', 'Exploration provenance', 'Best-practice traceability'] },
  { lens: 'risk',         focusCategories: ['File paths', 'Verification strategy', 'Scope discipline', 'Guardrail compliance'] },
];

// A4/P24 — plan quality presets (docs/cost-tiers.md §5 "Plan quality presets"; tuning values).
const VALID_QUALITY = ['full', 'balanced', 'minimal'];
const QUALITY_DISPATCH = {
  full:     { dispatchModel: 'sonnet', dispatchEffort: 'low' },
  balanced: { dispatchModel: null,     dispatchEffort: null },
  minimal:  { dispatchModel: 'opus',   dispatchEffort: 'high' },
};

/** Read agents/<name>.md; model/effort from frontmatter, all null when absent. */
function readAgent(name) {
  const p = path.join(AGENTS_DIR, name + '.md');
  const out = { agent: 'sdlc:' + name, agentPath: null, model: null, effort: null };
  if (!fs.existsSync(p)) return out;
  out.agentPath = p;
  try {
    const fm = extractFrontmatter(fs.readFileSync(p, 'utf8'));
    if (fm !== null) {
      const y = parseSimpleYaml(fm);
      out.model = y.model ?? null;
      out.effort = y.effort ?? null;
    }
  } catch (err) {
    process.stderr.write(`[plan-prepare] agent ${name}: could not read model/effort from frontmatter: ${err.message}\n`);
  }
  return out;
}

/** Agent-dispatch shape (P15): readAgent + inputNames + the preset values those names use. */
function buildDispatch(name, preset) {
  const inputNames = INPUT_NAMES[name];
  const presetInputs = {};
  for (const n of inputNames) if (Object.prototype.hasOwnProperty.call(preset, n)) presetInputs[n] = preset[n];
  return { ...readAgent(name), inputNames, presetInputs };
}

/** Values plan.js can compute for every dispatch (P15); noTasks is the OPENSPEC_TASKS sentinel. */
function buildPreset(guardrails, openspecContext, noTasks) {
  const tasks = openspecContext && Array.isArray(openspecContext.tasks) ? openspecContext.tasks : null;
  const reqs = openspecContext && Array.isArray(openspecContext.requirements) ? openspecContext.requirements : null;
  return {
    FORMAT_REFERENCE_PATH,
    ACTIVE_GUARDRAILS: JSON.stringify(guardrails),
    GUARDRAILS: guardrails.length ? guardrails.map(g => `- [${g.id}] (${g.severity}): ${g.description}`).join('\n') : 'none configured',
    OPENSPEC_TASKS: tasks ? JSON.stringify(tasks) : noTasks,
    REQUIREMENTS_JSON: reqs ? JSON.stringify(reqs) : 'null',
  };
}

function buildDispatchSet(guardrails, openspecContext, quality) {
  const lanePreset = buildPreset(guardrails, openspecContext, 'null');                          // content lane sentinel
  const preset = buildPreset(guardrails, openspecContext, 'none — plan not from OpenSpec');     // lenses and reviewer
  const q = QUALITY_DISPATCH[quality];
  const g17Dispatch = buildDispatch('plan-lane-g17', lanePreset);
  const lanes = LANE_DEFS.map(def => ({ name: def.name, ...buildDispatch(LANE_AGENTS[def.name], lanePreset), gateIds: def.gateIds }));
  lanes.push({ name: 'dimension-coverage', ...g17Dispatch, gateIds: ['G17'] });
  const lensReviewers = LENS_DEFS.map(def => ({
    lens: def.lens,
    ...buildDispatch('plan-lens-' + def.lens, { ...preset, LENS: def.lens, LENS_FOCUS: def.focusCategories.map(c => '- ' + c).join('\n') }),
    focusCategories: def.focusCategories,
    ...q,
  }));
  const reviewerDispatch = { lens: 'all', ...buildDispatch('plan-reviewer', preset), ...q };
  const intakeAuditDispatch = buildDispatch('plan-intake-verify', lanePreset);
  return { g17Dispatch, lanes, lensReviewers, reviewerDispatch, intakeAuditDispatch };
}

// plan-explore.js invocation — builds explorePack (R24 / P8–P12)
// ---------------------------------------------------------------------------

/**
 * Invoke plan-explore.js via spawnSync, passing the user prompt via stdin.
 * User prompt comes in on plan.js stdin (piped by SKILL.md; may be empty).
 * Passing via stdin avoids a new CLI surface and sidesteps argv length limits.
 *
 * Returns an explorePack object with five P8–P12 keys:
 *   { manifestPath, outDir, scopeHintCount, webResearchSignal, error }
 *
 * Never throws — on any spawn error the error field is populated and plan.js
 * continues (R28 fallback is the SKILL.md Step 1 consumer's responsibility).
 */
function runExplorePack(fromOpenspec, userPrompt) {
  const EMPTY_PACK = {
    manifestPath: null,
    outDir: null,
    scopeHintCount: 0,
    webResearchSignal: false,
    error: null,
  };

  // Allow test override via env var (avoids filesystem stubbing for unit tests)
  const exploreScript = process.env.SDLC_PLAN_EXPLORE_SCRIPT || path.join(__dirname, 'plan-explore.js');
  if (!fs.existsSync(exploreScript)) {
    return { ...EMPTY_PACK, error: 'plan-explore.js not found' };
  }

  const args = ['--output-file'];
  if (fromOpenspec) {
    args.push('--from-openspec', fromOpenspec);
  }

  const result = spawnSync(process.execPath, [exploreScript, ...args], {
    input: userPrompt || '',
    encoding: 'utf8',
    timeout: 30000,
  });

  if (result.error) {
    return { ...EMPTY_PACK, error: `plan-explore spawn error: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const errMsg = (result.stderr || '').trim();
    return { ...EMPTY_PACK, error: `plan-explore exited ${result.status}${errMsg ? ': ' + errMsg : ''}` };
  }

  const outputFilePath = (result.stdout || '').trim();
  if (!outputFilePath) {
    return { ...EMPTY_PACK, error: 'plan-explore produced no output path' };
  }

  let packData;
  try {
    packData = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
    // Clean up the explore output file — we've inlined it into our own output
    try { fs.unlinkSync(outputFilePath); } catch (_) { /* non-fatal */ }
  } catch (readErr) {
    return { ...EMPTY_PACK, error: `plan-explore output read error: ${readErr.message}` };
  }

  // Validate the five required P8–P12 keys are present
  const required = ['manifestPath', 'outDir', 'scopeHintCount', 'webResearchSignal', 'error'];
  for (const key of required) {
    if (!(key in packData)) {
      return { ...EMPTY_PACK, error: `plan-explore output missing key: ${key}` };
    }
  }

  return {
    manifestPath: packData.manifestPath,
    outDir: packData.outDir,
    scopeHintCount: packData.scopeHintCount,
    webResearchSignal: packData.webResearchSignal,
    error: packData.error,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const SUBCOMMANDS = { 'diff-material': runDiffMaterial, 'g17-prepare': runG17Prepare, 'merge-lanes': runMergeLanes };

// Flags each subcommand accepts (without `--`); any other flag is a usage error (exit 1).
const SUBCOMMAND_FLAGS = {
  'diff-material': ['before', 'after'],
  'g17-prepare': ['plan', 'dimensions-dir', 'instructions-dir', 'learnings', 'window', 'github-hosting', 'root', 'today'],
  'merge-lanes': ['dir', 'lanes', 'lenses', 'no-guardrails', 'gate-a', 'inventory'],
};

function usageError(message) {
  return Object.assign(new Error(message), { code: 'USAGE' });
}

function requireFlag(flags, name) {
  if (flags[name] === undefined) throw usageError(`--${name} is required`);
  return flags[name];
}

function readPlanFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw usageError(`cannot read ${file}: ${err.message}`);
  }
}

function runDiffMaterial(flags) {
  const before = readPlanFile(requireFlag(flags, 'before'));
  const after = readPlanFile(requireFlag(flags, 'after'));
  return diffMaterial(before, after);
}

function runG17Prepare(flags) {
  const planPath = requireFlag(flags, 'plan');
  const dimensionsDir = requireFlag(flags, 'dimensions-dir');
  const instructionsDir = requireFlag(flags, 'instructions-dir');
  const learningsPath = requireFlag(flags, 'learnings');
  return g17Prepare({
    planPath,
    dimensionsDir,
    instructionsDir,
    learningsPath,
    windowDays: flags.window === undefined ? undefined : Number(flags.window),
    githubHosting: flags['github-hosting'] === 'true',
    rootDir: flags.root,
    today: flags.today,
  });
}

function runMergeLanes(flags) {
  const dir = requireFlag(flags, 'dir');
  const list = v => (v === undefined ? [] : v.split(',').map(s => s.trim()).filter(Boolean));
  return mergeLanes({
    dir,
    lanes: list(flags.lanes),
    lenses: list(flags.lenses),
    noGuardrails: flags.noGuardrails === true,
    gateAPath: flags['gate-a'] ?? null,
    inventoryPath: flags.inventory ?? null,
  });
}

/** Parse `--<name> <value>` pairs and `--no-guardrails`, run the handler, map outcomes to exit codes. */
function runSubcommand(sub, args) {
  const fail = (code, message) => {
    process.stderr.write(`plan.js ${sub} error: ${message}\n`);
    process.exit(code);
  };
  const allowed = SUBCOMMAND_FLAGS[sub];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--') || !allowed.includes(arg.slice(2))) fail(1, `unknown flag ${arg}`);
    if (arg === '--no-guardrails') { flags.noGuardrails = true; continue; }
    const next = args[i + 1];
    if (next === undefined || (next.startsWith('--') && allowed.includes(next.slice(2)))) fail(1, `${arg} needs a value`);
    if (Object.prototype.hasOwnProperty.call(flags, arg.slice(2))) fail(1, `${arg} given twice`);
    flags[arg.slice(2)] = args[++i];
  }
  let result;
  try {
    result = SUBCOMMANDS[sub](flags);
  } catch (err) {
    fail(err.code === 'USAGE' ? 1 : 2, err.message);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

function main() {
  const sub = process.argv[2];
  if (Object.prototype.hasOwnProperty.call(SUBCOMMANDS, sub)) { runSubcommand(sub, process.argv.slice(3)); return; }
  const { fromOpenspec, markName, markPath, quality } = parseArgs(process.argv);

  // Read user prompt from stdin (piped by SKILL.md). May be empty when
  // invoked without stdin — e.g. from --mark mode or unit tests.
  // Passing via stdin avoids a new CLI surface (see Task 5 Key Decision).
  let userPrompt = '';
  try {
    if (!process.stdin.isTTY) {
      userPrompt = fs.readFileSync(0, 'utf8');
    }
  } catch (_) {
    // Non-fatal — plan-explore will run with empty prompt
  }

  // --mark mode: short-circuit before normal prepare flow
  if (markName !== null) {
    runMarkMode(markName, markPath);
    return; // runMarkMode calls process.exit(); this is a safeguard
  }

  const projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/
  // issue #457: OpenSpec content scans (openspec/changes/, openspec/specs/) live on the
  // active branch in the active worktree — route them through contentRoot, NOT projectRoot.
  const contentRoot = resolveActiveWorktreeSafe();
  const errors = [];

  // A4/P24 — --quality (default balanced); an invalid value stops before any other work.
  const flags = { quality: quality === null ? 'balanced' : quality, sources: { quality: quality === null ? 'default' : 'cli' } };
  if (!VALID_QUALITY.includes(flags.quality)) {
    errors.push(`Invalid --quality value "${flags.quality}"; expected one of ${VALID_QUALITY.join('|')}.`);
    writeOutput({ errors, flags }, 'plan-prepare', 1);
    return;
  }

  // Issue #232: verifyAndMigrate gate (CLI > env > default false).
  const skipConfigCheck = resolveSkipConfigCheck(process.argv);
  const cv = ensureConfigVersion(projectRoot, { skip: skipConfigCheck, roles: ['project'] });
  if (cv.errors.length > 0) {
    for (const e of cv.errors) errors.push(`config-version: ${e.role}: ${e.message}`);
    writeOutput({ errors, flags: { skipConfigCheck }, migration: cv.migration }, 'plan-prepare', 1);
    return;
  }

  // Write skillInvoked marker (R20) — plan-sdlc was invoked (issue #285).
  // Done early so the marker is present even if later steps fail.
  // Prune prior plan markers for this branch before writing a new one (issue #334):
  // ensures at most one plan-<branchSlug>-*.json exists per branch.
  try {
    const branch = exec('git branch --show-current');
    if (branch) {
      pruneStateFiles('plan', slugifyBranch(branch));
      initState('plan', branch, {
        planIntegrity: { skillInvoked: new Date().toISOString() },
      });
    }
  } catch (_) {
    // Non-fatal: marker write failures must not block prepare output.
  }

  // 1. OpenSpec detection
  const openspec = detectActiveChanges(contentRoot);

  // Add authoritative evidence when OpenSpec is present
  if (openspec.present) {
    openspec.authoritative = {
      path: 'openspec/config.yaml',
      specsCount: openspec.specsCount,
    };
  }

  // 1a. Plan template detection
  const planTemplate = { path: null };
  const planTemplateProjectPath = path.join(projectRoot, '.sdlc', 'plan-template.md');
  if (fs.existsSync(planTemplateProjectPath)) {
    planTemplate.path = planTemplateProjectPath;
  }

  // 2. --from-openspec validation
  let fromOpenspecResult = null;
  let openspecContext = { tasks: null, tasksUpdated: 0 };
  if (fromOpenspec) {
    const validation = validateChange(contentRoot, fromOpenspec);
    fromOpenspecResult = {
      valid: validation.valid,
      changeName: fromOpenspec,
      hasProposal: validation.hasProposal,
      deltaSpecCount: validation.deltaSpecCount,
      hasDesign: validation.hasDesign,
      hasTasks: validation.hasTasks,
      tasksDone: validation.tasksDone,
      tasksTotal: validation.tasksTotal,
      stage: validation.stage,
    };

    if (!validation.valid) {
      for (const err of validation.errors) {
        if (!err.startsWith('Warning:')) {
          errors.push(err);
        }
      }
    }

    // 2a. Parse tasks.md, populate openspecContext.tasks (P13), inject ref comments (I7).
    // Idempotent + additive: existing <!-- ref: --> comments are left untouched.
    // Path-traversal guard: fromOpenspec is caller-supplied (CLI/argv) and is interpolated
    // into a filesystem path. Reject empty, separator, or parent-ref components so the
    // resulting path cannot escape openspec/changes/<fromOpenspec>/.
    if (
      validation.valid &&
      validation.hasTasks &&
      typeof fromOpenspec === 'string' &&
      fromOpenspec.length > 0 &&
      !fromOpenspec.includes('/') &&
      !fromOpenspec.includes('\\') &&
      !fromOpenspec.includes('..') &&
      !fromOpenspec.includes('\0')
    ) {
      const tasksPath = path.join(contentRoot, 'openspec', 'changes', fromOpenspec, 'tasks.md');
      try {
        const original = fs.readFileSync(tasksPath, 'utf8');
        const parsed = parseTasks(original);
        openspecContext.tasks = parsed;

        // Inject <!-- ref:<ref> --> on `- [ ]` or `- [x]` lines without an existing ref comment.
        const lines = original.split('\n');
        let updated = 0;
        for (const entry of parsed) {
          const idx = entry.line - 1;
          if (idx < 0 || idx >= lines.length) continue;
          if (/<!--\s*ref:/.test(lines[idx])) continue; // write-once
          lines[idx] = lines[idx].replace(/\s*$/, '') + ` <!-- ref:${entry.ref} -->`;
          updated++;
        }
        if (updated > 0) {
          fs.writeFileSync(tasksPath, lines.join('\n'), 'utf8');
        }
        openspecContext.tasksUpdated = updated;
      } catch (err) {
        // Surface as warning but do not block prepare.
        process.stderr.write(`[plan-prepare] tasks.md ref injection warning: ${err.message}\n`);
      }
    }

    // 2b. Populate requirement inventory (R38 — Fixes #445).
    // Called inside the `if (fromOpenspec)` block; only runs when --from-openspec is active.
    // NOTE: The path-traversal guard (lines above) protects the tasks.md block (section 2a)
    // only. getRequirementInventory() is NOT covered by that guard — it receives `fromOpenspec`
    // which is validated by validateChange() before we reach this point.
    if (validation.valid) {
      const invResult = getRequirementInventory(contentRoot, fromOpenspec);
      if (invResult.ok) {
        openspecContext.requirements = invResult.requirements;
        openspecContext.requirementsError = null;
      } else {
        openspecContext.requirements = null;
        openspecContext.requirementsError = invResult.error;
        if (!invResult.cliAvailable) {
          process.stderr.write('[plan-prepare] openspec CLI not found — requirement inventory unavailable (graceful degradation)\n');
        } else {
          process.stderr.write(`[plan-prepare] requirement inventory warning: ${invResult.error}\n`);
        }
      }
    }
  }

  // 3. Guardrail loading from plan config section
  let guardrails = [];
  try {
    const planConfig = readSection(projectRoot, 'plan');
    if (planConfig && Array.isArray(planConfig.guardrails)) {
      guardrails = planConfig.guardrails;
    }
  } catch (err) {
    errors.push(`Failed to read plan config: ${err.message}`);
  }

  // 4. plan-explore invocation — gather dynamic-dimension materials (R24 / P8–P12)
  // Errors absorbed into explorePack.error; never propagated to plan.js errors[] (R28).
  const explorePack = runExplorePack(fromOpenspec, userPrompt);
  if (explorePack.error) {
    process.stderr.write(`[plan-prepare] plan-explore warning: ${explorePack.error}\n`);
  }

  // 5. P14/P15 — G17 dispatch signals (R32, R33 — Fixes #417)
  // --mark mode short-circuits before this point, so these only run in --output-file mode.
  const githubHosting = buildGithubHosting(projectRoot);
  const { g17Dispatch, lanes, lensReviewers, reviewerDispatch, intakeAuditDispatch } = buildDispatchSet(guardrails, openspecContext, flags.quality);
  for (const e of [...lanes, ...lensReviewers, reviewerDispatch, intakeAuditDispatch]) {
    if (e.agentPath === null) process.stderr.write(`[plan-prepare] ${e.agent}: agent file not found — not dispatched\n`);
  }

  // 7b. P22 — critique temp directory
  let critiqueDir = null;
  try {
    critiqueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-plan-critique-'));
  } catch (err) {
    errors.push(`Failed to create critiqueDir: ${err.message}`);
  }

  // 7c. P23 — commit config
  let commit = { subjectPattern: null, subjectPatternError: null, allowedTypes: null };
  try {
    const c = readSection(projectRoot, 'commit') || {};
    commit = {
      subjectPattern: c.subjectPattern ?? null,
      subjectPatternError: c.subjectPatternError ?? null,
      allowedTypes: Array.isArray(c.allowedTypes) ? c.allowedTypes : null,
    };
  } catch (_) { /* commit config absent or unreadable — keep nulls */ }

  // 7. Output
  const output = {
    openspec,
    fromOpenspec: fromOpenspecResult,
    openspecContext,
    guardrails,
    explorePack,
    planTemplate,
    githubHosting,
    g17Dispatch,
    intakeAuditDispatch,
    lanes,
    lensReviewers,
    reviewerDispatch,
    critiqueDir,
    commit,
    flags,
    errors,
  };

  writeOutput(output, 'plan-prepare', errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`plan-prepare.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = { main };
