#!/usr/bin/env node
/**
 * execute.js
 * Prepare script for execute-plan-sdlc. Pre-computes the resolved flags, the
 * parsed plan, guardrails, resume state and config-version migration as one
 * JSON manifest (docs/specs/execute-plan-sdlc.md, Prepare script contract
 * P1, P2, P5, P7), plus the classification floor, waves, workspace and
 * openspec mapping (P3, P4, P6, P8).
 *
 * Usage:
 *   node execute.js [<plan>] [--plan <path>] [--quality full|balanced|minimal]
 *     [--resume] [--auto] [--commit-waves] [--rebase auto|skip|prompt]
 *     [--wave-timeout <s>] [--wave-interval <s>] [--branch <name>]
 *     [--skip-config-check] [--project-root <dir>] [--output-file]
 *
 * Exit codes:
 *   0 = success, JSON manifest path on stdout
 *   1 = errors[] non-empty, JSON manifest path on stdout
 *   2 = unexpected script crash, message on stderr
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const LIB = path.join(__dirname, '..', 'lib');

const { exec, detectBaseBranchSafe, deriveWorkspace } = require(path.join(LIB, 'git'));
const { readState, slugifyBranch } = require(path.join(LIB, 'state'));
const { readSection, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { writeOutput } = require(path.join(LIB, 'output'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { MAX_WAVE_TIMEOUT_SECONDS } = require(path.join(LIB, 'ship-fields'));
const { parsePlan } = require(path.join(LIB, 'plan-parse'));
const { computeWaveBudget, staticCap } = require(path.join(LIB, 'dispatch-budget'));
const { resolveBranchName } = require(path.join(LIB, 'branch-name'));

const SKILL_DIR = path.join(__dirname, '..', '..', 'skills', 'execute-plan-sdlc');
const TEMPLATE_FILES = ['wave-runner-template.md', 'classifying-and-waving-tasks.md'];

const EXECUTE_DEFAULTS = {
  commitWaves: false,
  waveTimeout: 1800,
  waveInterval: 60,
  rebase: 'skip',
  waveRunnerMinPlanTasks: 9,
  specReviewer: 'once',
};

const VALID_QUALITY = ['full', 'balanced', 'minimal'];
const LEGACY_QUALITY = { A: 'full', B: 'balanced', C: 'minimal' };
const VALID_REBASE = ['auto', 'skip', 'prompt'];
const VALID_SPEC_REVIEWER = ['once', 'per-wave'];
const VALID_COMPLEXITY = ['Trivial', 'Standard', 'Complex'];
const VALID_RISK = ['Low', 'Medium', 'High'];

// Model presets (classifying-and-waving-tasks.md): quality tier → model per complexity.
const PRESET_MODELS = {
  full:     { Trivial: 'haiku',  Standard: 'haiku',  Complex: 'sonnet' }, // Speed
  balanced: { Trivial: 'haiku',  Standard: 'sonnet', Complex: 'opus' },   // Balanced
  minimal:  { Trivial: 'sonnet', Standard: 'opus',   Complex: 'opus' },   // Quality
};
const MODEL_RANK = ['haiku', 'sonnet', 'opus'];

// Branch type from the plan title: first match wins, else 'feature'.
const TYPE_KEYWORDS = [
  [/\b(fix|bug)\b/i, 'bugfix'],
  [/\bdocs\b/i, 'docs'],
  [/\brefactor\b/i, 'refactor'],
  [/\bchore\b/i, 'chore'],
];

const VALUE_FLAGS = ['--plan', '--quality', '--rebase', '--wave-timeout', '--wave-interval', '--branch', '--project-root'];
const BOOLEAN_FLAGS = ['--resume', '--auto', '--commit-waves', '--skip-config-check', '--output-file'];

// R41 what/how/why text (SKILL.md plan-argument gate), without issue numbers.
const MISSING_PLAN_MESSAGE =
  'execute-plan-sdlc cannot run without an explicit plan document. ' +
  'Fix: re-run with a positional plan path (`/execute-plan-sdlc <path-to-plan.md>`) or `--plan <path-to-plan.md>`. ' +
  'If resuming, add `--plan <path-to-plan.md> --resume` — the persisted state file has no usable plan reference. ' +
  'Why: plan-file resolution is explicit-only (R41). This skill MUST NOT guess which plan to execute by scanning ' +
  'conversation context or by prompting interactively for a path — a silently-assumed or misremembered plan could ' +
  'execute the wrong work against this repository.';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const values = {};
  const booleans = {};
  let positional = null;
  const errors = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_FLAGS.includes(a)) {
      if (args[i + 1] === undefined) {
        errors.push({ id: 'invalidFlag', flag: a, value: null, message: `${a} requires a value.` });
      } else {
        values[a] = args[++i];
      }
    } else if (BOOLEAN_FLAGS.includes(a)) {
      booleans[a] = true;
    } else if (a.startsWith('--')) {
      // Unknown or removed flag (e.g. --workspace, A4): consume its value so it
      // is not taken as the positional plan.
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) i++;
      errors.push({ id: 'invalidFlag', flag: a, value: null, message: `${a} is not a recognised execute-plan-sdlc flag.` });
    } else if (positional === null) {
      positional = a;
    }
  }

  return {
    plan: values['--plan'] !== undefined ? values['--plan'] : positional,
    quality: values['--quality'] !== undefined ? values['--quality'] : null,
    resume: Boolean(booleans['--resume']),
    auto: Boolean(booleans['--auto']),
    commitWaves: Boolean(booleans['--commit-waves']),
    rebase: values['--rebase'] !== undefined ? values['--rebase'] : null,
    waveTimeout: values['--wave-timeout'] !== undefined ? values['--wave-timeout'] : null,
    waveInterval: values['--wave-interval'] !== undefined ? values['--wave-interval'] : null,
    branch: values['--branch'] !== undefined ? values['--branch'] : null,
    projectRoot: values['--project-root'] !== undefined ? path.resolve(values['--project-root']) : resolveSdlcRoot(),
    errors,
  };
}

// ---------------------------------------------------------------------------
// Flag resolution (CLI → execute config → legacy ship → default)
// ---------------------------------------------------------------------------

function intInRange(min, max) {
  return v => Number.isInteger(v) && v >= min && v <= max;
}

/** Parse a CLI integer string; returns NaN for anything not all digits. */
function cliInt(s) {
  return /^\d+$/.test(String(s)) ? parseInt(s, 10) : NaN;
}

/**
 * Resolve one value from ordered candidates [{ source, key, value }]. A
 * candidate whose value is undefined/null is absent; one that fails `valid`
 * is skipped with a warning naming its key.
 */
function pick(name, candidates, valid, warnings) {
  for (const c of candidates) {
    if (c.value === undefined || c.value === null) continue;
    if (valid(c.value)) return { value: c.value, source: c.source };
    warnings.push(`Ignoring ${c.key}: invalid value ${JSON.stringify(c.value)}; falling back to the next source.`);
  }
  return { value: EXECUTE_DEFAULTS[name], source: 'default' };
}

function resolveFlags(cli, execCfg, shipCfg, errors, warnings) {
  const ex = execCfg || {};
  const sh = shipCfg || {};
  const shExec = (sh.execute && typeof sh.execute === 'object') ? sh.execute : {};
  const flags = {};
  const sources = {};
  const set = (name, r) => { flags[name] = r.value; sources[name] = r.source; };

  // commitWaves: CLI true → execute.commitWaves → ship.execute.commitWaves → default.
  const isBool = v => typeof v === 'boolean';
  set('commitWaves', pick('commitWaves', [
    { source: 'cli', key: '--commit-waves', value: cli.commitWaves ? true : undefined },
    { source: 'config', key: 'execute.commitWaves', value: ex.commitWaves },
    { source: 'legacy-ship', key: 'ship.execute.commitWaves', value: shExec.commitWaves },
  ], isBool, warnings));

  // rebase
  const rebaseValid = v => VALID_REBASE.includes(v);
  let rebaseCli;
  if (cli.rebase !== null) {
    if (rebaseValid(cli.rebase)) rebaseCli = cli.rebase;
    else errors.push({ id: 'invalidFlag', flag: '--rebase', value: cli.rebase, message: `--rebase must be one of ${VALID_REBASE.join('|')}, got "${cli.rebase}".` });
  }
  set('rebase', pick('rebase', [
    { source: 'cli', key: '--rebase', value: rebaseCli },
    { source: 'config', key: 'execute.rebase', value: ex.rebase },
  ], rebaseValid, warnings));

  // waveTimeout / waveInterval
  const numeric = [
    { name: 'waveTimeout', flag: '--wave-timeout', legacy: 'executeWaveTimeout', valid: intInRange(60, MAX_WAVE_TIMEOUT_SECONDS), range: `an integer 60..${MAX_WAVE_TIMEOUT_SECONDS}` },
    { name: 'waveInterval', flag: '--wave-interval', legacy: 'executeWaveInterval', valid: intInRange(10, Infinity), range: 'an integer >= 10' },
  ];
  for (const n of numeric) {
    let cliValue;
    if (cli[n.name] !== null) {
      const v = cliInt(cli[n.name]);
      if (n.valid(v)) cliValue = v;
      else errors.push({ id: 'invalidFlag', flag: n.flag, value: cli[n.name], message: `${n.flag} must be ${n.range}, got "${cli[n.name]}".` });
    }
    set(n.name, pick(n.name, [
      { source: 'cli', key: n.flag, value: cliValue },
      { source: 'config', key: `execute.${n.name}`, value: ex[n.name] },
      { source: 'legacy-ship', key: `ship.${n.legacy}`, value: sh[n.legacy] },
    ], n.valid, warnings));
  }

  // Config-only keys.
  set('waveRunnerMinPlanTasks', pick('waveRunnerMinPlanTasks', [
    { source: 'config', key: 'execute.waveRunnerMinPlanTasks', value: ex.waveRunnerMinPlanTasks },
  ], intInRange(1, Infinity), warnings));
  set('specReviewer', pick('specReviewer', [
    { source: 'config', key: 'execute.specReviewer', value: ex.specReviewer },
  ], v => VALID_SPEC_REVIEWER.includes(v), warnings));

  return { flags, sources };
}

/** Normalise a quality value (legacy A/B/C accepted); null when invalid. */
function normaliseQuality(v) {
  if (typeof v !== 'string') return null;
  if (VALID_QUALITY.includes(v)) return v;
  return LEGACY_QUALITY[v] || null;
}

/**
 * A6: CLI → resumed state (quality, or legacy preset) when --resume and the
 * state was found → balanced under --auto → null.
 */
function resolveQuality(cli, stateData, errors, warnings) {
  if (cli.quality !== null) {
    const q = normaliseQuality(cli.quality);
    if (q) return { value: q, source: 'cli' };
    if (cli.auto) {
      errors.push({ id: 'invalidQuality', value: cli.quality, message: `Invalid --quality value "${cli.quality}"; expected one of ${VALID_QUALITY.join('|')}.` });
    } else {
      warnings.push(`Invalid --quality value "${cli.quality}" ignored; the tier is chosen at the selection prompt.`);
    }
    return { value: null, source: null };
  }
  if (cli.resume && stateData) {
    const q = normaliseQuality(stateData.quality) || normaliseQuality(stateData.preset);
    if (q) return { value: q, source: 'state' };
  }
  if (cli.auto) return { value: 'balanced', source: 'default' };
  return { value: null, source: null };
}

// ---------------------------------------------------------------------------
// Resume lookup
// ---------------------------------------------------------------------------

function lookupResume(warnings) {
  const empty = { found: false, stateFile: null, planPath: null, planHash: null, completedWaves: [] };
  const branch = exec('git branch --show-current', { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
  if (!branch) {
    warnings.push('Could not determine the current branch (detached HEAD or git failure); resume lookup skipped.');
    return { resume: empty, data: null };
  }
  const state = readState('execute', slugifyBranch(branch));
  if (!state) return { resume: empty, data: null };
  const d = state.data || {};
  return {
    resume: {
      found: true,
      stateFile: path.resolve(state.filePath),
      planPath: d.planPath ?? null,
      planHash: d.planHash ?? null,
      completedWaves: (Array.isArray(d.waves) ? d.waves : [])
        .filter(w => w && w.status === 'completed')
        .map(w => w.number),
    },
    data: d,
  };
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

function validatePlan(tasks) {
  const errors = [];
  if (tasks.length <= 1) {
    errors.push({ id: 'planParseError', check: 'taskCount', message: `The plan has ${tasks.length} \`### Task N:\` heading(s); at least two are required.` });
    return errors;
  }
  for (const t of tasks) {
    if (!VALID_COMPLEXITY.includes(t.complexity) || !VALID_RISK.includes(t.risk)) {
      errors.push({ id: 'planParseError', check: 'PF3', taskId: t.id, message: `Task ${t.id}: Complexity must be ${VALID_COMPLEXITY.join('/')} and Risk ${VALID_RISK.join('/')} (got ${t.complexity}/${t.risk}).` });
    }
  }
  const ids = new Set(tasks.map(t => t.id));
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) {
        errors.push({ id: 'planParseError', check: 'PF4', taskId: t.id, message: `Task ${t.id} depends on Task ${dep}, which does not exist.` });
      }
    }
  }
  // Cycle detection (DFS, colours: 1 = visiting, 2 = done).
  const deps = new Map(tasks.map(t => [t.id, t.dependsOn.filter(d => ids.has(d))]));
  const colour = new Map();
  const visit = id => {
    colour.set(id, 1);
    for (const d of deps.get(id)) {
      if (colour.get(d) === 1) return id;
      if (!colour.get(d)) {
        const hit = visit(d);
        if (hit !== null) return hit;
      }
    }
    colour.set(id, 2);
    return null;
  };
  for (const t of tasks) {
    if (colour.get(t.id)) continue;
    const hit = visit(t.id);
    if (hit !== null) {
      errors.push({ id: 'planParseError', check: 'PF4', taskId: hit, message: `The task dependency graph has a cycle through Task ${hit}.` });
      break;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Classification floor and waves (classifying-and-waving-tasks.md steps 2–6b)
// ---------------------------------------------------------------------------

/** Unique Create/Modify/Test paths of a task, in declaration order. */
function taskFiles(t) {
  return [...new Set([...t.files.create, ...t.files.modify, ...t.files.test])];
}

function buildClassificationFloor(tasks) {
  return tasks.map(t => ({
    id: t.id,
    complexity: t.complexity,
    risk: t.risk,
    fileCount: taskFiles(t).length,
    reasons: [],
  }));
}

/** Kahn topological sort over dependsOn, ties by ascending task id. */
function topoOrder(tasks) {
  const indeg = new Map(tasks.map(t => [t.id, t.dependsOn.length]));
  const ready = tasks.filter(t => t.dependsOn.length === 0);
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => a.id - b.id);
    const t = ready.shift();
    order.push(t);
    for (const u of tasks) {
      if (!u.dependsOn.includes(t.id)) continue;
      indeg.set(u.id, indeg.get(u.id) - 1);
      if (indeg.get(u.id) === 0) ready.push(u);
    }
  }
  return order;
}

/**
 * Split waves in place: part(wave) returns [keep, move]; a non-empty move
 * becomes a new wave inserted directly after, which is then checked in turn.
 */
function splitWaves(groups, part) {
  for (let i = 0; i < groups.length; i++) {
    const [keep, move] = part(groups[i]);
    if (move.length) {
      groups[i] = keep;
      groups.splice(i + 1, 0, move);
    }
  }
}

const prefix = (g, k) => [g.slice(0, k), g.slice(k)];
const finiteOrNull = v => (v === Infinity ? null : v);

function buildWaves(tasks, { quality, guardrails, dispatchBudget }) {
  // 1–2. Order, level and same-file constraint.
  const groups = [];
  const waveOf = new Map();
  for (const t of topoOrder(tasks)) {
    let w = 1 + Math.max(0, ...t.dependsOn.map(d => waveOf.get(d)));
    const files = taskFiles(t);
    while ((groups[w - 1] || []).some(o => taskFiles(o).some(f => files.includes(f)))) w++;
    (groups[w - 1] = groups[w - 1] || []).push(t);
    waveOf.set(t.id, w);
  }
  for (const g of groups) g.sort((a, b) => a.id - b.id);

  // 3. Weighted static cap (Complex counts 2).
  const cap = staticCap(tasks.length);
  const weight = t => (t.complexity === 'Complex' ? 2 : 1);
  splitWaves(groups, g => {
    let sum = 0;
    let k = 0;
    while (k < g.length && sum + weight(g[k]) <= cap) sum += weight(g[k++]);
    return prefix(g, k);
  });

  // 4. Risk spreading: at most one High task per wave.
  splitWaves(groups, g => {
    const extraHigh = g.filter(t => t.risk === 'High').slice(1);
    return [g.filter(t => !extraHigh.includes(t)), extraHigh];
  });

  // 5. Byte budget per wave.
  const templateBytes = TEMPLATE_FILES.reduce((n, f) => n + fs.statSync(path.join(SKILL_DIR, f)).size, 0);
  const guardrailsBytes = Buffer.byteLength(JSON.stringify(guardrails));
  const presets = PRESET_MODELS[quality ?? 'balanced'];
  const budgetOf = g => {
    const model = MODEL_RANK[Math.max(...g.map(t => MODEL_RANK.indexOf(presets[t.complexity])))];
    const b = computeWaveBudget({
      templateBytes,
      guardrailsBytes,
      perTaskFactSheetBytes: g.map(t => Buffer.byteLength(t.body)),
      priorWaveContextBytes: 0,
      model,
      dispatchBudget,
      totalRemainingTasks: tasks.length,
    });
    return { ...b, maxConcurrentTasks: finiteOrNull(b.maxConcurrentTasks), model };
  };
  splitWaves(groups, g => prefix(g, budgetOf(g).maxConcurrentTasks ?? g.length));

  // 6/6b. Number the waves; expectedFiles and verificationHint.
  return groups.map((g, i) => {
    const verify = g[0].verify;
    return {
      n: i + 1,
      taskIds: g.map(t => t.id),
      cap: finiteOrNull(cap),
      budget: budgetOf(g),
      expectedFiles: [...new Set(g.flatMap(taskFiles))],
      verificationHint: verify && g.every(t => t.verify === verify) ? verify : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Workspace (git calls run in process.cwd(); config from projectRoot)
// ---------------------------------------------------------------------------

function deriveWorkspaceInfo({ branchFlag, title, projectRoot, warnings }) {
  const opts = { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] };
  const currentBranch = exec('git branch --show-current', opts);
  const topLevel = exec('git rev-parse --show-toplevel', opts);
  const list = exec('git worktree list --porcelain', opts);
  const firstWorktree = list && list.split('\n').find(l => l.startsWith('worktree '));
  if (currentBranch === null || !topLevel || !firstWorktree) {
    warnings.push('Could not read git workspace state (branch, top level or worktree list); workspace not derived.');
    return null;
  }
  const inLinkedWorktree =
    fs.realpathSync(firstWorktree.slice('worktree '.length)) !== fs.realpathSync(topLevel);
  const defaultBranch = detectBaseBranchSafe(process.cwd());
  const decision = branchFlag ? 'continue' : deriveWorkspace({ inLinkedWorktree, currentBranch, defaultBranch });

  let suggestedBranch = null;
  if (decision === 'branch') {
    const name = String(title || '').replace(/ Implementation Plan$/, '').trim().toLowerCase();
    const hit = TYPE_KEYWORDS.find(([re]) => re.test(name));
    try {
      suggestedBranch = resolveBranchName({
        type: hit ? hit[1] : 'feature',
        slug: slugifyBranch(name),
        config: (readSection(projectRoot, 'workspace') || {}).branch || {},
      });
    } catch (err) {
      warnings.push(`Could not suggest a branch name: ${err.message}`);
    }
  }

  return { decision, currentBranch, defaultBranch, inLinkedWorktree, suggestedBranch };
}

// ---------------------------------------------------------------------------
// OpenSpec mapping
// ---------------------------------------------------------------------------

function buildOpenspec(header, tasks, projectRoot) {
  const m = (header.source || '').match(/openspec\/changes\/([^/\s]+)\//);
  const specsDir = m ? `openspec/changes/${m[1]}/specs` : null;
  let specFiles = [];
  const absDir = specsDir && path.join(projectRoot, specsDir);
  if (absDir && fs.existsSync(absDir)) {
    specFiles = fs.readdirSync(absDir, { recursive: true })
      .filter(f => f.endsWith('.md'))
      .map(f => `${specsDir}/${f.split(path.sep).join('/')}`)
      .sort();
  }
  const taskMap = tasks
    .filter(t => t.openspecTask)
    .map(t => ({ taskId: t.id, ...t.openspecTask }));
  const refToTaskIds = {};
  for (const e of taskMap) {
    if (e.ref) (refToTaskIds[e.ref] = refToTaskIds[e.ref] || []).push(e.taskId);
  }
  return { specsDir, specFiles, taskMap, refToTaskIds };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const cli = parseArgs(process.argv);
  const projectRoot = cli.projectRoot;
  const errors = [...cli.errors];
  const warnings = [];

  const skipConfigCheck = resolveSkipConfigCheck(process.argv);
  const cv = ensureConfigVersion(projectRoot, { skip: skipConfigCheck });
  for (const e of cv.errors) {
    errors.push({ id: 'configVersion', role: e.role, step: e.step, message: e.message });
  }

  const execCfg = readSection(projectRoot, 'execute');
  const shipCfg = readSection(projectRoot, 'ship');

  const { flags: resolved, sources } = resolveFlags(cli, execCfg, shipCfg, errors, warnings);

  const { resume, data: stateData } = lookupResume(warnings);

  const quality = resolveQuality(cli, resume.found ? stateData : null, errors, warnings);
  sources.quality = quality.source;

  let planFile = null;
  if (cli.plan !== null) planFile = path.resolve(process.cwd(), cli.plan);
  else if (cli.resume && resume.found && resume.planPath) planFile = path.resolve(projectRoot, resume.planPath);

  let plan = null;
  let parsed = null;
  if (planFile === null) {
    errors.push({ id: 'missingPlanFile', message: MISSING_PLAN_MESSAGE });
  } else if (!fs.existsSync(planFile)) {
    errors.push({ id: 'planFileNotFound', path: planFile, message: `Plan file not found: ${planFile}` });
  } else {
    const bytes = fs.readFileSync(planFile);
    parsed = parsePlan(bytes.toString('utf8'));
    plan = {
      path: planFile,
      hash: crypto.createHash('sha256').update(bytes).digest('hex'),
      header: parsed.header,
      tasks: parsed.tasks.map(({ body, ...rest }) => rest),
    };
    errors.push(...validatePlan(plan.tasks));
  }

  const guardrails = (Array.isArray(execCfg?.guardrails) ? execCfg.guardrails : [])
    .map(g => ({ id: g.id, description: g.description, severity: g.severity }));

  // Builders run only on a plan that parsed and validated; workspace needs only the title.
  const planUsable = plan !== null && !errors.some(e => e.id === 'planParseError');
  const workspace = plan
    ? deriveWorkspaceInfo({ branchFlag: cli.branch, title: plan.header.title, projectRoot, warnings })
    : null;

  const result = {
    flags: {
      plan: planFile,
      quality: quality.value,
      resume: cli.resume,
      rebase: resolved.rebase,
      auto: cli.auto,
      branch: cli.branch,
      commitWaves: resolved.commitWaves,
      waveTimeout: resolved.waveTimeout,
      waveInterval: resolved.waveInterval,
      waveRunnerMinPlanTasks: resolved.waveRunnerMinPlanTasks,
      specReviewer: resolved.specReviewer,
      skipConfigCheck,
      sources,
    },
    plan,
    classificationFloor: planUsable ? buildClassificationFloor(parsed.tasks) : [],
    waves: planUsable
      ? buildWaves(parsed.tasks, { quality: quality.value, guardrails, dispatchBudget: execCfg?.dispatchBudget })
      : [],
    guardrails,
    workspace,
    resume,
    openspec: planUsable
      ? buildOpenspec(parsed.header, parsed.tasks, projectRoot)
      : { specsDir: null, specFiles: [], taskMap: [], refToTaskIds: {} },
    migration: cv.migration,
    warnings,
    errors,
  };

  writeOutput(result, 'execute-prepare', errors.length ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`execute.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = {
  EXECUTE_DEFAULTS, TYPE_KEYWORDS, parseArgs, resolveFlags, resolveQuality,
  buildClassificationFloor, buildWaves, deriveWorkspaceInfo, buildOpenspec, main,
};
