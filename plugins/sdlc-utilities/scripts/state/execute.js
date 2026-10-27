#!/usr/bin/env node
/**
 * execute-state.js
 * CLI wrapper for managing execute-plan-sdlc execution state files.
 * Delegates all I/O to lib/state.js; zero npm dependencies.
 *
 * Usage:
 *   node execute-state.js init        --branch <b> --quality <X> --total-tasks <n> [--planned-task-ids <json>] [--plan-path <p>] [--plan-hash <h>]
 *   node execute-state.js wave-start  --wave <n> [--tasks-json <json>] [--manifest-json <json>] [--run-id <id>]
 *   node execute-state.js wave-done   --wave <n> [--decisions <json>] [--status <completed|partial>] [--timed-out] [--usage <json>]
 *   node execute-state.js wave-fail   --wave <n>
 *   node execute-state.js wave-committed --branch <b> --wave <n> --sha <sha>
 *   node execute-state.js task-done   --wave <n> --task <id> --name <name> --complexity <c> --risk <r> --files-changed <json> [--files-added <json>] [--verify-token <json>]
 *   node execute-state.js task-fail   --wave <n> --task <id> --name <name> --complexity <c> --risk <r> --error <text> [--skipped-dependency]
 *   node execute-state.js context     --data <json>
 *   node execute-state.js read        [--branch <b>]
 *   node execute-state.js cleanup     [--branch <b>]
 *   node execute-state.js gc          [--ttl-days <N>] [--dry-run]
 *   node execute-state.js summarize-prior-wave-context [--run-id <id>] [--max-files <n>] [--max-decisions <n>] [--max-interfaces <n>] [--max-task-ids <n>]
 *   node execute-state.js wave-split --wave <n> --dispatched <json-id-array> [--missing-ids <json-id-array>] [--split-depth <n>] [--max-split-depth <n>]
 *   node execute-state.js verify-completeness --run-id <id>
 *   node execute-state.js wave-progress --wave <n> --run-id <id> --task <id> --phase <started|reading|editing|verifying|reporting>  (write)
 *   node execute-state.js wave-progress --wave <n> --run-id <id> --read                                                             (read; prints JSON)
 *   node execute-state.js resume-reset [--branch <b>]
 *
 * Exit codes:
 *   0 = success
 *   1 = state file not found (read/cleanup)
 *   2 = unexpected error
 *   65 = cleanup/verify-completeness: planned tasks unaccounted (cleanup keeps the state file)
 */

'use strict';

const path = require('node:path');
const fs   = require('node:fs');
const LIB = path.join(__dirname, '..', 'lib');

const {
  slugifyBranch, findStateFile, readState, writeState, initState, deleteState, resolveBranch,
  gcStateFiles, resolveStateDir, parseStateFilename,
  listBranches, readTtlDaysFromConfig, summarizePriorWaveContext,
} = require(path.join(LIB, 'state'));

const { writeTaskFactSheet, taskFactSheetPath, normalizeTaskId } =require(path.join(LIB, 'task-factsheet'));
const { splitWave, MaxSplitDepthExceededError } = require(path.join(LIB, 'wave-split'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
const { writeProgress, readProgress } = require(path.join(LIB, 'wave-progress'));
const { parseUsage, resolveUsage } = require(path.join(LIB, 'usage'));

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { subcommand: args[0] || null };

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--branch' && args[i + 1]) {
      result.branch = args[++i];
    } else if (a === '--quality' && args[i + 1]) {
      result.quality = args[++i];
    } else if (a === '--preset') {
      // Hard-removed (#190): --preset renamed to --quality. Consume the
      // following value (if any) and surface a clear error so callers update
      // their invocations. The error is written to stderr and exits non-zero;
      // the orchestrator surfaces it in the agent prompt.
      if (args[i + 1] && !args[i + 1].startsWith('--')) i++;
      result._presetRejected = true;
    } else if (a === '--total-tasks' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (isNaN(val)) { process.stderr.write(`Error: --total-tasks requires a number, got "${args[i]}"\n`); process.exit(2); }
      result.totalTasks = val;
    } else if (a === '--planned-task-ids' && args[i + 1]) {
      result.plannedTaskIds = args[++i];
    } else if (a === '--plan-path' && args[i + 1]) {
      result.planPath = args[++i];
    } else if (a === '--plan-hash' && args[i + 1]) {
      result.planHash = args[++i];
    } else if (a === '--wave' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (isNaN(val)) { process.stderr.write(`Error: --wave requires a number, got "${args[i]}"\n`); process.exit(2); }
      result.wave = val;
    } else if (a === '--task' && args[i + 1]) {
      result.task = args[++i];
    } else if (a === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (a === '--complexity' && args[i + 1]) {
      result.complexity = args[++i];
    } else if (a === '--risk' && args[i + 1]) {
      result.risk = args[++i];
    } else if (a === '--files-changed' && args[i + 1]) {
      result.filesChanged = args[++i];
    } else if (a === '--files-added' && args[i + 1]) {
      result.filesAdded = args[++i];
    } else if (a === '--verify-token' && args[i + 1]) {
      result.verifyToken = args[++i];
    } else if (a === '--decisions' && args[i + 1]) {
      result.decisions = args[++i];
    } else if (a === '--status' && args[i + 1]) {
      result.status = args[++i];
    } else if (a === '--timed-out') {
      result.timedOut = true;
    } else if (a === '--usage' && args[i + 1]) {
      result.usage = args[++i];
    } else if (a === '--error' && args[i + 1]) {
      result.error = args[++i];
    } else if (a === '--data' && args[i + 1]) {
      result.data = args[++i];
    } else if (a === '--sha' && args[i + 1]) {
      result.sha = args[++i];
    } else if (a === '--ttl-days' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (isNaN(val)) { process.stderr.write(`Error: --ttl-days requires a number, got "${args[i]}"\n`); process.exit(2); }
      result.ttlDays = val;
    } else if (a === '--dry-run') {
      result.dryRun = true;
    } else if (a === '--tasks-json' && args[i + 1]) {
      result.tasksJson = args[++i];
    } else if (a === '--run-id' && args[i + 1]) {
      result.runId = args[++i];
    } else if (a === '--max-files' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.maxFiles = val;
    } else if (a === '--max-decisions' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.maxDecisions = val;
    } else if (a === '--max-interfaces' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.maxInterfaces = val;
    } else if (a === '--max-task-ids' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.maxTaskIds = val;
    } else if (a === '--dispatched' && args[i + 1]) {
      result.dispatched = args[++i];
    } else if (a === '--missing-ids' && args[i + 1]) {
      result.missingIds = args[++i];
    } else if (a === '--split-depth' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.splitDepth = val;
    } else if (a === '--max-split-depth' && args[i + 1]) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val)) result.maxSplitDepth = val;
    } else if (a === '--state-file' && args[i + 1]) {
      result.stateFile = args[++i];
    } else if (a === '--skipped-dependency') {
      result.skippedDependency = true;
    } else if (a === '--phase' && args[i + 1]) {
      result.phase = args[++i];
    } else if (a === '--read') {
      result.read = true;
    } else if (a === '--manifest-json' && args[i + 1]) {
      result.manifestJson = args[++i];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Branch resolution
// ---------------------------------------------------------------------------

function resolveBranchOrExit(argBranch) {
  try {
    return resolveBranch(argBranch);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Wave helpers
// ---------------------------------------------------------------------------

function findOrCreateWave(waves, waveNumber) {
  let wave = waves.find(w => w.number === waveNumber);
  if (!wave) {
    wave = { number: waveNumber, status: 'in_progress', startedAt: new Date().toISOString(), tasks: [] };
    waves.push(wave);
  }
  return wave;
}

// ---------------------------------------------------------------------------
// Deep merge helper (arrays concatenate, objects merge, scalars overwrite)
// ---------------------------------------------------------------------------

function deepMerge(target, source) {
  if (source === null || typeof source !== 'object') return source;
  if (Array.isArray(source)) {
    if (Array.isArray(target)) return target.concat(source);
    return source.slice();
  }
  const result = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (
      key in result &&
      result[key] !== null &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else if (Array.isArray(result[key]) && Array.isArray(source[key])) {
      result[key] = result[key].concat(source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

function cmdInit(opts) {
  if (opts._presetRejected) {
    process.stderr.write('Error: --preset is no longer accepted by execute-plan-sdlc state init. Use --quality <full|balanced|minimal> instead (#190).\n');
    process.exit(2);
  }
  if (!opts.branch) {
    process.stderr.write('Error: --branch is required for init\n');
    process.exit(2);
  }
  if (!opts.quality) {
    process.stderr.write('Error: --quality is required for init (--preset was renamed to --quality, #190)\n');
    process.exit(2);
  }
  if (opts.totalTasks == null || isNaN(opts.totalTasks)) {
    process.stderr.write('Error: --total-tasks is required for init\n');
    process.exit(2);
  }

  let plannedTaskIds = null;
  if (opts.plannedTaskIds) {
    try {
      plannedTaskIds = JSON.parse(opts.plannedTaskIds);
      if (!Array.isArray(plannedTaskIds)) throw new Error('must be an array');
    } catch (e) {
      process.stderr.write(`Error: --planned-task-ids must be a JSON array: ${e.message}\n`);
      process.exit(2);
    }
  }

  const data = {
    version: 1,
    skill: 'execute-plan-sdlc',
    startedAt: new Date().toISOString(),
    branch: opts.branch,
    worktree: resolveActiveWorktreeSafe(process.cwd()),
    planPath: opts.planPath || null,
    planHash: opts.planHash || null,
    quality: opts.quality,
    totalTasks: opts.totalTasks,
    plannedTaskIds: plannedTaskIds,
    waves: [],
    context: {},
  };

  try {
    const filePath = initState('execute', opts.branch, data);
    process.stdout.write(filePath + '\n');
    process.exit(0);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(2);
  }
}

// Wave manifest handed verbatim to the wave-runner. Stable fields first,
// per-wave and per-run fields last (prompt-cache-hit-ratio). waveNumber comes
// from --wave; escalationBudget is the constant 2 (R13).
function buildWaveManifest(opts, runId, m, writtenPaths) {
  return {
    escalationBudget: 2,
    qualityTier: m.qualityTier,
    totalWaves: m.totalWaves,
    waveTimeout: m.waveTimeout,
    waveInterval: m.waveInterval,
    guardrails: m.guardrails || [],
    stateScript: path.resolve(__filename),
    waveNumber: opts.wave,
    runId,
    expectedFiles: m.expectedFiles || [],
    verificationHint: m.verificationHint ?? null,
    tasks: (m.tasks || []).map(t => ({
      id: t.id,
      complexity: t.complexity,
      risk: t.risk,
      factSheetPath: writtenPaths.find(p => path.basename(p) === `task-${normalizeTaskId(t.id)}.md`) || null,
      assignedModel: t.assignedModel,
      effort: t.effort ?? null,
      verifyToken: t.verifyToken ?? null,
    })),
  };
}

function cmdWaveStart(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }
  if (opts.manifestJson && !opts.tasksJson) {
    process.stderr.write('Error: --manifest-json requires --tasks-json\n');
    process.exit(2);
  }
  let manifestInput = null;
  if (opts.manifestJson) {
    try {
      manifestInput = JSON.parse(opts.manifestJson);
    } catch (e) {
      process.stderr.write(`Error: --manifest-json is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (manifestInput === null || typeof manifestInput !== 'object' || Array.isArray(manifestInput)) {
      process.stderr.write('Error: --manifest-json must be a JSON object\n');
      process.exit(2);
    }
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = data.waves.find(w => w.number === opts.wave);
  if (wave) {
    wave.status = 'in_progress';
    if (!wave.startedAt) wave.startedAt = new Date().toISOString();
  } else {
    data.waves.push({
      number: opts.wave,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      tasks: [],
    });
  }

  writeState(filePath, data);

  // Write per-task fact sheets when --tasks-json is provided (R-FACT-SHEET-DISPATCH, #432).
  // --tasks-json is a JSON array of task objects; --run-id is the execution run ID
  // (defaults to the state file's startedAt timestamp slug when not provided).
  if (opts.tasksJson) {
    let tasks;
    try {
      tasks = JSON.parse(opts.tasksJson);
    } catch (e) {
      process.stderr.write(`Error: --tasks-json is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (!Array.isArray(tasks)) {
      process.stderr.write('Error: --tasks-json must be a JSON array\n');
      process.exit(2);
    }
    const stateDir = resolveStateDir();
    // Derive runId from --run-id flag or from the state file's startedAt field
    const runId = opts.runId || (data.startedAt
      ? data.startedAt.replace(/[^0-9T]/g, '').replace('T', 'T')
      : `wave-${opts.wave}`);
    const writtenPaths = [];
    // R-WAVE-CONTEXT-PRODUCER (#506): bounded prior-wave context is rendered into
    // each fact sheet so the worker never has to crawl the filesystem for it.
    const priorWaveSummary = summarizePriorWaveContext(data);
    for (const task of tasks) {
      if (!task || !task.id) continue; // skip malformed entries
      try {
        const p = writeTaskFactSheet(task, { runId, stateDir, priorWaveSummary, scratchDir: process.env.TMPDIR });
        writtenPaths.push(p);
      } catch (e) {
        process.stderr.write(`Warning: failed to write fact sheet for task ${task.id}: ${e.message}\n`);
      }
    }
    // Always surface the derived runId (even when writtenPaths is empty, e.g. every
    // task entry was malformed) — callers rely on this as the single source of the
    // run id; SKILL.md no longer generates or passes one via --run-id (#506).
    const out = { runId, factSheets: writtenPaths };
    if (manifestInput) out.manifest = buildWaveManifest(opts, runId, manifestInput, writtenPaths);
    process.stdout.write(JSON.stringify(out) + '\n');
  }

  process.exit(0);
}

function cmdWaveDone(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }

  // R-WAVE-CONTEXT-PRODUCER (#506): decisions arrive on the wire from
  // WAVE_SUMMARY.tasks[].decisions[]; parsed before any state I/O so a caller
  // error is always exit 2.
  let decisions = [];
  if (opts.decisions) {
    try {
      decisions = JSON.parse(opts.decisions);
    } catch (e) {
      process.stderr.write(`Error: --decisions is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (!Array.isArray(decisions)) {
      process.stderr.write('Error: --decisions must be a JSON array\n');
      process.exit(2);
    }
  }

  let usage;
  if (opts.usage !== undefined) {
    const parsed = parseUsage(opts.usage);
    if (!parsed.ok) {
      process.stderr.write(`Error: --usage is not valid: ${parsed.error}\n`);
      process.exit(2);
    }
    usage = parsed.value;
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = findOrCreateWave(data.waves, opts.wave);
  const VALID_WAVE_DONE_STATUS = ['completed', 'partial'];
  const status = opts.status || 'completed';
  if (!VALID_WAVE_DONE_STATUS.includes(status)) {
    process.stderr.write(`Error: --status must be one of ${VALID_WAVE_DONE_STATUS.join(', ')}\n`);
    process.exit(2);
  }
  wave.status = status;
  if (opts.timedOut) wave.timedOut = true;   // R-WAVE-DEADLINE resume short-circuit (#506)
  wave.completedAt = new Date().toISOString();
  if (usage !== undefined) wave.usage = resolveUsage(wave.usage, usage);

  // Append decisions to the prior-wave context. Idempotent by value: re-running
  // wave-done with the same --decisions leaves the array length unchanged.
  if (!data.context || typeof data.context !== 'object') data.context = {};
  const ctx = data.context;
  if (!Array.isArray(ctx.decisionsFromPriorWaves)) ctx.decisionsFromPriorWaves = [];
  const pushUnique = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  for (const d of decisions) pushUnique(ctx.decisionsFromPriorWaves, d);

  writeState(filePath, data);
  process.exit(0);
}

function cmdWaveFail(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = findOrCreateWave(data.waves, opts.wave);
  wave.status = 'failed';
  wave.completedAt = new Date().toISOString();

  writeState(filePath, data);
  process.exit(0);
}

/**
 * `wave-committed` — record the per-wave WIP commit sha on a completed wave.
 * Implements Fixes #392 / R35 (`--commit-waves` state persistence).
 *
 * Idempotent on identical sha (re-running with the same sha is a no-op).
 * Errors when the wave already has a different committedSha (conflict).
 * Accepts `--sha ""` or omitted `--sha` as the explicit "no diff produced
 * a commit" soft-success path: persists `committedSha: null`.
 */
function cmdWaveCommitted(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = data.waves.find(w => w.number === opts.wave);
  if (!wave) {
    process.stderr.write(`Error: wave ${opts.wave} not found in state\n`);
    process.exit(2);
  }

  if (wave.status !== 'completed') {
    process.stderr.write(`Error: wave ${opts.wave} status is "${wave.status}", expected "completed"\n`);
    process.exit(2);
  }

  // Normalize sha: empty string or undefined → null (soft-success "no diff")
  const newSha = (typeof opts.sha === 'string' && opts.sha.length > 0) ? opts.sha : null;

  // Idempotency / conflict check
  if ('committedSha' in wave) {
    if (wave.committedSha === newSha) {
      // No-op: identical sha (or both null)
      process.exit(0);
    }
    process.stderr.write(`Error: wave ${opts.wave} already has committedSha "${wave.committedSha}" — refusing to overwrite with "${newSha}"\n`);
    process.exit(2);
  }

  wave.committedSha = newSha;
  writeState(filePath, data);
  process.exit(0);
}

function cmdTaskDone(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }
  if (!opts.task) {
    process.stderr.write('Error: --task is required\n');
    process.exit(2);
  }

  let filesChanged;
  try {
    filesChanged = opts.filesChanged ? JSON.parse(opts.filesChanged) : [];
  } catch (e) {
    process.stderr.write(`Error: --files-changed is not valid JSON: ${e.message}\n`);
    process.exit(2);
  }

  // R-WAVE-CONTEXT-PRODUCER (#506): the added/modified split arrives on the wire
  // from the worker's own COMPLETE line; it is never probed from the working tree.
  let filesAdded = [];
  if (opts.filesAdded) {
    try {
      filesAdded = JSON.parse(opts.filesAdded);
    } catch (e) {
      process.stderr.write(`Error: --files-added is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (!Array.isArray(filesAdded)) {
      process.stderr.write('Error: --files-added must be a JSON array\n');
      process.exit(2);
    }
  }

  let verifyTokens = [];
  if (opts.verifyToken) {
    try {
      verifyTokens = JSON.parse(opts.verifyToken);
    } catch (e) {
      process.stderr.write(`Error: --verify-token is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (typeof verifyTokens === 'string') verifyTokens = [verifyTokens];
    if (!Array.isArray(verifyTokens)) {
      process.stderr.write('Error: --verify-token must be a JSON array or string\n');
      process.exit(2);
    }
  }

  // KD-1 invariant: filesAdded ⊆ filesTouched. Enforced before any state I/O so a
  // caller error is always exit 2 (never masked by a missing state file).
  const changedSet = new Set(Array.isArray(filesChanged) ? filesChanged : []);
  for (const f of filesAdded) {
    if (!changedSet.has(f)) {
      process.stderr.write(`Error: --files-added entry "${f}" is not present in --files-changed (filesAdded must be a subset of filesChanged)\n`);
      process.exit(2);
    }
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = findOrCreateWave(data.waves, opts.wave);
  if (!Array.isArray(wave.tasks)) wave.tasks = [];

  const taskEntry = {
    id: opts.task,
    name: opts.name || '',
    complexity: opts.complexity || '',
    risk: opts.risk || '',
    status: 'completed',
    filesChanged: Array.isArray(filesChanged) ? filesChanged : [],
    completedAt: new Date().toISOString(),
  };

  const existingIdx = wave.tasks.findIndex(t => t.id === opts.task);
  if (existingIdx >= 0) {
    wave.tasks[existingIdx] = taskEntry;
  } else {
    wave.tasks.push(taskEntry);
  }

  // R-WAVE-CONTEXT-PRODUCER (#506): the four prior-wave context fields had no
  // producer — summarizePriorWaveContext read them and nothing ever wrote them.
  // The added/modified split is carried on the wire by the worker's own
  // `COMPLETE: files_created=` list; it is NOT probed from the working tree.
  if (!data.context || typeof data.context !== 'object') data.context = {};
  const ctx = data.context;
  for (const key of ['filesAdded', 'filesModified', 'interfacesCreated', 'completedTaskIds']) {
    if (!Array.isArray(ctx[key])) ctx[key] = [];
  }
  const added = new Set(Array.isArray(filesAdded) ? filesAdded : []);
  const pushUnique = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  for (const f of taskEntry.filesChanged) {
    pushUnique(added.has(f) ? ctx.filesAdded : ctx.filesModified, f);
  }
  for (const t of verifyTokens) pushUnique(ctx.interfacesCreated, t);
  pushUnique(ctx.completedTaskIds, String(opts.task));

  writeState(filePath, data);
  process.exit(0);
}

function cmdTaskFail(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }
  if (!opts.task) {
    process.stderr.write('Error: --task is required\n');
    process.exit(2);
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  if (!Array.isArray(data.waves)) data.waves = [];

  const wave = findOrCreateWave(data.waves, opts.wave);
  if (!Array.isArray(wave.tasks)) wave.tasks = [];

  // Support SKIPPED-DEPENDENCY status (R-INVARIANT-COMPLETENESS, T9, #432).
  // When --skipped-dependency is passed, the task is recorded with status
  // 'skipped-dependency' (counted as accounted by verify-completeness).
  // No schema change: uses the existing status field.
  const taskStatus = opts.skippedDependency ? 'skipped-dependency' : 'failed';

  const taskEntry = {
    id: opts.task,
    name: opts.name || '',
    complexity: opts.complexity || '',
    risk: opts.risk || '',
    status: taskStatus,
    filesChanged: [],
    error: opts.error || '',
    completedAt: new Date().toISOString(),
  };

  const existingIdx = wave.tasks.findIndex(t => t.id === opts.task);
  if (existingIdx >= 0) {
    wave.tasks[existingIdx] = taskEntry;
  } else {
    wave.tasks.push(taskEntry);
  }

  writeState(filePath, data);
  process.exit(0);
}

function cmdContext(opts) {
  if (!opts.data) {
    process.stderr.write('Error: --data is required\n');
    process.exit(2);
  }

  let incoming;
  try {
    incoming = JSON.parse(opts.data);
  } catch (e) {
    process.stderr.write(`Error: --data is not valid JSON: ${e.message}\n`);
    process.exit(2);
  }

  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const { data, filePath } = found;
  const CONTEXT_KEYS = new Set([
    'planSummary', 'completedTaskIds', 'filesAdded',
    'filesModified', 'interfacesCreated', 'decisionsFromPriorWaves',
  ]);
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    process.stderr.write('Error: --data must be a JSON object (R-WAVE-CONTEXT-PRODUCER)\n');
    process.exit(2);
  }
  const unknown = Object.keys(incoming).filter(k => !CONTEXT_KEYS.has(k));
  if (unknown.length > 0) {
    process.stderr.write(`Error: --data contains unknown context keys: ${unknown.join(', ')}\n`);
    process.exit(2);
  }
  if (Object.keys(incoming).length === 0) {
    process.stderr.write('Error: --data is an empty object — nothing to merge\n');
    process.exit(2);
  }
  for (const key of Object.keys(incoming)) {
    const value = incoming[key];
    if (key === 'planSummary') {
      if (typeof value !== 'string') {
        process.stderr.write(`Error: --data.${key} must be a string\n`);
        process.exit(2);
      }
    } else if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
      process.stderr.write(`Error: --data.${key} must be an array of strings\n`);
      process.exit(2);
    }
  }
  if (!data.context || typeof data.context !== 'object') data.context = {};
  data.context = deepMerge(data.context, incoming);

  writeState(filePath, data);
  process.exit(0);
}

function cmdRead(opts) {
  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(found.data, null, 2) + '\n');
  process.exit(0);
}

function cmdCleanup(opts) {
  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const located = findStateFile('execute', slug);
  if (!located) {
    // Nothing to delete — treat as success
    process.exit(0);
  }
  const found = readState('execute', slug);
  if (!found) {
    // R14: a state file that exists but cannot be parsed is kept for inspection.
    process.stderr.write(`Error: state file kept (unreadable or corrupt): ${located.fullPath}\n`);
    process.exit(2);
  }

  // R14: verifying cleanup; a state whose completeness check fails is kept for --resume.
  const v = completenessOf(found.data);
  if (v.code !== 0) {
    writeCompleteness(v);
    process.stderr.write(`Error: state file kept (completeness check failed): ${found.filePath}\n`);
    process.exit(v.code);
  }
  deleteState(found.filePath);
  process.exit(0);
}

/**
 * Reap stale per-run directories under `resolveStateDir()` (e.g. `<runId>/`
 * fact-sheet + wave-progress-marker directories written by `wave-start` /
 * `wave-progress`). Mirrors `gcStateFiles`'s own ttl-fresh / owner-exists /
 * stale+gone pruning rule (F-wave-liveness-abort-and-resume-durability):
 *
 *   - Directory mtime within TTL           → KEEP, reason "ttl-fresh".
 *   - Directory name matches a live run     → KEEP, reason "state-file-exists".
 *   - Directory is stale AND unmatched      → DELETE (rm -rf), reason "stale+state-file-gone".
 *
 * "Live run" is derived from every surviving `execute-*.json` state file's
 * `startedAt` field, using the exact same slug derivation `wave-start` uses
 * for its default `--run-id` (punctuation stripped). This does not recover
 * an explicit custom `--run-id` (e.g. an issue-number-based id) that has no
 * stored linkage back to a state file — those directories rely on the
 * ttl-fresh path for protection instead, same as any other stale+unreferenced
 * artifact. No exact algorithm is pinned by spec; this is the simplest rule
 * that satisfies "never remove a live run's directory" without inventing a
 * new persisted runId↔state-file mapping.
 *
 * When `dryRun` is true, classification runs identically but `fs.rmSync` is
 * never called — the result uses `wouldDelete`/`wouldKeep` bucket names (same
 * convention `cmdGc`'s own `--dry-run` branch already uses for `.json` files)
 * so callers can tell a preview result from a real one at a glance.
 *
 * @param {{ stateDir: string, ttlDays: number, now?: number, dryRun?: boolean }} opts
 * @returns {{ deleted: Array<{dir,mtime,reason}>, kept: Array<{dir,reason}> } | { wouldDelete: Array<{dir,reason}>, wouldKeep: Array<{dir,reason}> }}
 */
function reapRunDirectories({ stateDir, ttlDays, now, dryRun }) {
  const result = dryRun ? { wouldDelete: [], wouldKeep: [] } : { deleted: [], kept: [] };
  const deleteBucket = dryRun ? result.wouldDelete : result.deleted;
  const keepBucket = dryRun ? result.wouldKeep : result.kept;
  if (!fs.existsSync(stateDir)) return result;

  let entries;
  try {
    entries = fs.readdirSync(stateDir, { withFileTypes: true });
  } catch (_) {
    return result;
  }

  const liveRunIds = new Set();
  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue;
    const parsed = parseStateFilename(entry.name);
    if (!parsed || parsed.prefix !== 'execute') continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(stateDir, entry.name), 'utf8'));
      if (data && typeof data.startedAt === 'string') {
        liveRunIds.add(data.startedAt.replace(/[^0-9T]/g, ''));
      }
    } catch (_) {
      // Unreadable/corrupt state file — cannot contribute a live runId.
    }
  }

  const nowMs = typeof now === 'number' ? now : Date.now();
  const ttlMs = ttlDays * 86400000;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    const dirPath = path.join(stateDir, dirName);
    let stat;
    try {
      stat = fs.statSync(dirPath);
    } catch (_) {
      continue; // disappeared between readdir and stat
    }

    const ageMs = nowMs - stat.mtimeMs;

    if (ageMs < ttlMs) {
      keepBucket.push({ dir: dirName, reason: 'ttl-fresh' });
      continue;
    }

    if (liveRunIds.has(dirName)) {
      keepBucket.push({ dir: dirName, reason: 'state-file-exists' });
      continue;
    }

    if (dryRun) {
      deleteBucket.push({ dir: dirName, reason: 'stale+state-file-gone' });
      continue;
    }

    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      deleteBucket.push({ dir: dirName, mtime: stat.mtimeMs, reason: 'stale+state-file-gone' });
    } catch (_) {
      keepBucket.push({ dir: dirName, reason: 'rm-failed' });
    }
  }

  return result;
}

/**
 * `gc` — prune stale execute-state files. Mirrors `state/ship.js gc` but
 * scoped to the `execute-` prefix only.
 */
function cmdGc(opts) {
  const ttlDays = (typeof opts.ttlDays === 'number') ? opts.ttlDays : readTtlDaysFromConfig();
  const knownBranches = listBranches();

  if (opts.dryRun) {
    const stateDir = resolveStateDir();
    const liveSlugs = new Set(knownBranches.map(slugifyBranch));
    const now = Date.now();
    const ttlMs = ttlDays * 86400000;
    const out = { execute: { wouldDelete: [], wouldKeep: [] }, plan: { wouldDelete: [], wouldKeep: [] } };

    let entries = [];
    try { entries = fs.readdirSync(stateDir); } catch (_) { /* empty */ }

    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      const parsed = parseStateFilename(name);
      if (!parsed) continue;
      const bucket = out[parsed.prefix];
      if (!bucket) continue;
      let stat;
      try { stat = fs.statSync(path.join(stateDir, name)); } catch (_) { continue; }
      const fresh = (now - stat.mtimeMs) < ttlMs;
      const branchExists = liveSlugs.has(parsed.slug);
      if (fresh) {
        bucket.wouldKeep.push({ file: name, branch: parsed.slug, reason: 'ttl-fresh' });
      } else if (branchExists) {
        bucket.wouldKeep.push({ file: name, branch: parsed.slug, reason: 'branch-exists' });
      } else {
        bucket.wouldDelete.push({ file: name, branch: parsed.slug, reason: 'stale+branch-gone' });
      }
    }

    const directories = reapRunDirectories({ stateDir, ttlDays, dryRun: true });
    process.stdout.write(JSON.stringify({ dryRun: true, ttlDays, ...out, directories }, null, 2) + '\n');
    process.exit(0);
  }

  const execute = gcStateFiles({ prefix: 'execute', ttlDays, knownBranches });
  const plan    = gcStateFiles({ prefix: 'plan',    ttlDays, knownBranches });
  // Sweep run-id directories after the json sweep above so a run whose
  // execute-state file was just deleted is correctly treated as unowned
  // in this same pass (F-wave-liveness-abort-and-resume-durability).
  const directories = reapRunDirectories({ stateDir: resolveStateDir(), ttlDays });
  process.stdout.write(JSON.stringify({ ttlDays, execute, plan, directories }, null, 2) + '\n');
  process.exit(0);
}

/**
 * `wave-split` — persist a CONTEXT_OVERFLOW split decision to state for resume safety.
 *
 * Calls lib/wave-split.js splitWave() with the provided dispatched/missing-ids arrays,
 * records the resulting split tree on the wave entry, and prints the JSON result to stdout.
 *
 * Idempotent: if the wave already has a splitTree for the same splitDepth, returns the
 * persisted tree without re-computing (same inputs → same partition is guaranteed by splitWave).
 *
 * Exit codes:
 *   0 = success; JSON printed to stdout
 *   2 = argument error, JSON parse error, MaxSplitDepthExceededError
 *
 * Implements R-CONTEXT_OVERFLOW, T8, #432.
 */
function cmdWaveSplit(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }
  if (!opts.dispatched) {
    process.stderr.write('Error: --dispatched is required (JSON array of task ID strings)\n');
    process.exit(2);
  }

  let dispatched;
  try {
    dispatched = JSON.parse(opts.dispatched);
  } catch (e) {
    process.stderr.write(`Error: --dispatched is not valid JSON: ${e.message}\n`);
    process.exit(2);
  }
  if (!Array.isArray(dispatched)) {
    process.stderr.write('Error: --dispatched must be a JSON array\n');
    process.exit(2);
  }

  let missingIds = [];
  if (opts.missingIds) {
    try {
      missingIds = JSON.parse(opts.missingIds);
    } catch (e) {
      process.stderr.write(`Error: --missing-ids is not valid JSON: ${e.message}\n`);
      process.exit(2);
    }
    if (!Array.isArray(missingIds)) {
      process.stderr.write('Error: --missing-ids must be a JSON array\n');
      process.exit(2);
    }
  }

  const splitDepth    = opts.splitDepth    != null ? opts.splitDepth    : 0;
  const maxSplitDepth = opts.maxSplitDepth != null ? opts.maxSplitDepth : 3;

  // Compute split (pure, deterministic)
  let result;
  try {
    result = splitWave({ dispatched, missingIds, splitDepth, maxSplitDepth });
  } catch (e) {
    if (e instanceof MaxSplitDepthExceededError) {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }

  // Persist split tree to state so resume-after-crash can replay the same partition.
  // Best-effort: if state lookup fails, still emit the result to stdout (idempotent).
  try {
    let found = null;

    // Support direct --state-file path (used in tests + orchestration)
    if (opts.stateFile) {
      try {
        const raw = fs.readFileSync(opts.stateFile, 'utf8');
        const data = JSON.parse(raw);
        found = { data, filePath: opts.stateFile };
      } catch (_) {
        // fall through — no state to persist to
      }
    } else {
      const branch = resolveBranchOrExit(opts.branch);
      const slug = slugifyBranch(branch);
      found = readState('execute', slug);
    }

    if (found) {
      const { data, filePath } = found;
      if (!Array.isArray(data.waves)) data.waves = [];

      const wave = findOrCreateWave(data.waves, opts.wave);

      // Idempotency: if same splitDepth already recorded, skip write
      if (!wave.splitTree || wave.splitTree.splitDepth !== splitDepth) {
        wave.splitTree = {
          splitDepth,
          maxSplitDepth,
          dispatched: [...dispatched],
          missingIds: [...missingIds],
          halves: result.halves,
          computedAt: new Date().toISOString(),
        };
        writeState(filePath, data);
      }
    }
  } catch (_) {
    // State persistence is best-effort; never fail the command due to state I/O errors
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

/**
 * `verify-completeness` — post-execution completeness invariant (R-INVARIANT-COMPLETENESS, #432).
 *
 * Reads the execute state file (by current branch or --run-id / --state-file),
 * collects every task entry across all waves, and checks whether the union of
 * accounted task IDs covers the full planned set.
 *
 * Accounted statuses: 'completed', 'failed', 'skipped-dependency'.
 * Any task whose ID appears in state with one of these statuses is accounted.
 *
 * Exit codes:
 *   0  — all planned tasks accounted for
 *   65 — one or more planned tasks unaccounted; stderr JSON: {missingIds, totalPlanned, totalAccounted}
 *   2  — argument or state error
 *
 * Idempotent: re-running on same state returns the same verdict.
 *
 * Implements R-INVARIANT-COMPLETENESS, T9, #432.
 */
function cmdVerifyCompleteness(opts) {
  // Resolve state
  let found = null;

  if (opts.stateFile) {
    // Direct file path (used in tests)
    try {
      const raw = fs.readFileSync(opts.stateFile, 'utf8');
      const data = JSON.parse(raw);
      found = { data, filePath: opts.stateFile };
    } catch (e) {
      process.stderr.write(`Error: cannot read state file "${opts.stateFile}": ${e.message}\n`);
      process.exit(2);
    }
  } else {
    const branch = resolveBranchOrExit(opts.branch);
    const slug = slugifyBranch(branch);
    found = readState('execute', slug);
    if (!found) {
      process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
      process.exit(1);
    }
  }

  const v = completenessOf(found.data);
  writeCompleteness(v);
  process.exit(v.code);
}

/**
 * Pure R-INVARIANT-COMPLETENESS verdict over one execute state object, shared by
 * verify-completeness and the verifying cleanup (R14). Prints nothing, never exits.
 * @returns {{code: 0, out: object} | {code: 65, err: object} | {code: 2, err: string}}
 */
function completenessOf(data) {
  const ACCOUNTED_STATUSES = new Set(['completed', 'failed', 'skipped-dependency']);

  // Collect all task entries across waves
  const waves = Array.isArray(data.waves) ? data.waves : [];
  const accountedById = new Map(); // id → status

  for (const wave of waves) {
    const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
    for (const task of tasks) {
      if (!task || !task.id) continue;
      // Last write wins (task-fail after task-done, etc.)
      if (!accountedById.has(task.id) || ACCOUNTED_STATUSES.has(task.status)) {
        accountedById.set(task.id, task.status);
      }
    }
  }

  // Determine planned task IDs. Prefer state.plannedTaskIds[] if present;
  // fall back to totalTasks count (not reliable for ID listing).
  // The canonical source is state.context.plannedTaskIds when set by init.
  const plannedIds = Array.isArray(data.plannedTaskIds)
    ? data.plannedTaskIds
    : (data.context && Array.isArray(data.context.plannedTaskIds)
        ? data.context.plannedTaskIds
        : null);

  if (!plannedIds) {
    // Cannot verify without planned task ID list — plannedTaskIds missing means the state is
    // structurally incomplete (pre-#432 state or corrupted init). Hard-fail so ship-sdlc does
    // not silently advance past an unverifiable execute step (R-INVARIANT-COMPLETENESS, #432).
    return { code: 2, err: 'ERROR: verify-completeness cannot find plannedTaskIds in state — invariant check cannot run. Use --resume on a fresh execute run, or re-run without --resume to start over.\n' };
  }

  // Normalize IDs for comparison (R-IDNORM): strip leading T/t so "T1" == "1".
  // Comparison-only — persisted IDs in state retain their wire form.
  function normalizeId(id) {
    return typeof id === 'string' ? id.trim().replace(/^[Tt](?=\d)/, '') : id;
  }

  // Build a normalized lookup from the accounted map
  const accountedByNormId = new Map();
  for (const [id, status] of accountedById.entries()) {
    accountedByNormId.set(normalizeId(id), status);
  }

  // Find accounted and missing
  const accountedIds = plannedIds.filter(id => {
    const status = accountedByNormId.get(normalizeId(id));
    return status !== undefined && ACCOUNTED_STATUSES.has(status);
  });
  const missingIds = plannedIds.filter(id => !accountedIds.includes(id));

  const totalPlanned  = plannedIds.length;
  const totalAccounted = accountedIds.length;

  if (missingIds.length === 0) return { code: 0, out: { ok: true, totalPlanned, totalAccounted } };

  // Incomplete — exit 65 (BSD EX_DATAERR) with structured stderr JSON
  return { code: 65, err: { missingIds, totalPlanned, totalAccounted } };
}

/** Write a completenessOf verdict exactly as verify-completeness always has. */
function writeCompleteness(v) {
  if (v.code === 0) process.stdout.write(JSON.stringify(v.out) + '\n');
  else process.stderr.write(typeof v.err === 'string' ? v.err : JSON.stringify(v.err) + '\n');
}

/**
 * summarize-prior-wave-context — return bounded slice of execution context.
 * Reads state for current branch and applies caps via state.js::summarizePriorWaveContext.
 * Outputs JSON to stdout. (R-BYTE-BUDGET / T4, #432)
 */
function cmdSummarizePriorWaveContext(opts) {
  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);

  // Support --run-id as an alternate lookup path (for test harnesses that don't
  // have a git repo, e.g. when SDLC_STATE_DIR_OVERRIDE is set).
  const found = readState('execute', slug);
  if (!found) {
    process.stderr.write(`Error: no state file found for branch "${branch}"\n`);
    process.exit(1);
  }

  const caps = {};
  if (opts.maxFiles      != null) caps.maxFiles      = opts.maxFiles;
  if (opts.maxDecisions  != null) caps.maxDecisions  = opts.maxDecisions;
  if (opts.maxInterfaces != null) caps.maxInterfaces = opts.maxInterfaces;
  if (opts.maxTaskIds    != null) caps.maxTaskIds    = opts.maxTaskIds;

  const summary = summarizePriorWaveContext(found.data, caps);
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  process.exit(0);
}

// Bounded phase enum mirrored from lib/wave-progress.js's own VALID_PHASES so
// this CLI verb controls its own exit code / stderr wording on an invalid
// --phase, independent of the library's thrown error message (R-WAVE-LIVENESS).
const VALID_WAVE_PROGRESS_PHASES = ['started', 'reading', 'editing', 'verifying', 'reporting'];

/**
 * `wave-progress` — thin CLI surface over lib/wave-progress.js's writeProgress
 * / readProgress. Workers cannot `require()` a lib directly, so this verb is
 * the only way an Agent dispatch can record or observe in-flight wave phase
 * (R-WAVE-LIVENESS, #506, Task 16/17).
 *
 * Write mode:  --wave <n> --run-id <id> --task <id> --phase <enum>
 * Read mode:   --wave <n> --run-id <id> --read           (prints JSON, absence is not an error)
 */
function cmdWaveProgress(opts) {
  if (opts.wave == null || isNaN(opts.wave)) {
    process.stderr.write('Error: --wave is required\n');
    process.exit(2);
  }
  if (!opts.runId) {
    process.stderr.write('Error: --run-id is required\n');
    process.exit(2);
  }

  const stateDir = resolveStateDir();

  if (opts.read) {
    const progress = readProgress({ runId: opts.runId, wave: opts.wave, stateDir });
    process.stdout.write(JSON.stringify(progress) + '\n');
    process.exit(0);
  }

  if (!opts.task) {
    process.stderr.write('Error: --task is required (write mode)\n');
    process.exit(2);
  }
  if (!VALID_WAVE_PROGRESS_PHASES.includes(opts.phase)) {
    process.stderr.write(`Error: --phase must be one of ${VALID_WAVE_PROGRESS_PHASES.join(', ')}\n`);
    process.exit(2);
  }

  writeProgress({ runId: opts.runId, wave: opts.wave, stateDir, taskId: opts.task, phase: opts.phase });
  process.exit(0);
}

/**
 * `resume-reset` — clear untrusted task rows before a resume computes its wave pointer.
 *
 * Main context writes a wave's task rows in a batch after the wave-runner returns, so a
 * run interrupted mid-wave leaves a partial set of rows that `verify-completeness` would
 * otherwise count as accounted — a false-complete at the exit-65 gate. For every wave with
 * status `in_progress` this verb sets `tasks = []` and clears `completedAt`, preserving
 * `startedAt` and `status`. Waves with any other status are untouched: `completed`,
 * `failed` and `partial` are terminal (their rows are a deliberate record) and `pending`
 * waves never ran.
 *
 * Prints {resetWaves, clearedTaskIds}. Exit 0 always — a no-op is success.
 *
 * Implements R-WAVE-RESUME-RESET (#506, Task 20).
 */
function cmdResumeReset(opts) {
  const branch = resolveBranchOrExit(opts.branch);
  const slug = slugifyBranch(branch);
  const found = readState('execute', slug);

  const resetWaves = [];
  const clearedTaskIds = [];

  // Unlike the sibling verbs, a missing state file is not an error here: there is simply
  // nothing to reset, and the resume flow calls this unconditionally.
  if (found) {
    const { data, filePath } = found;
    const waves = Array.isArray(data.waves) ? data.waves : [];

    for (const wave of waves) {
      // Positive equality only. `status !== 'completed'` would also sweep `failed` and
      // `partial`, whose rows must survive.
      if (!wave || wave.status !== 'in_progress') continue;

      const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
      // Idempotency (state-machine-idempotency): `status` is preserved by design, so the
      // status check alone would re-report the same wave on every run. A wave only counts
      // as reset when it still has something to clear.
      if (tasks.length === 0 && wave.completedAt === undefined) continue;

      // Collect the ids before emptying the row set.
      for (const task of tasks) {
        if (task && task.id) clearedTaskIds.push(task.id);
      }
      wave.tasks = [];
      delete wave.completedAt;
      resetWaves.push(wave.number);
    }

    // Skip the write entirely when nothing changed, so a second run leaves the file
    // byte-identical.
    if (resetWaves.length > 0) writeState(filePath, data);
  }

  process.stdout.write(JSON.stringify({ resetWaves, clearedTaskIds }) + '\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const opts = parseArgs(process.argv);

  switch (opts.subcommand) {
    case 'init':        cmdInit(opts);       break;
    case 'wave-start':  cmdWaveStart(opts);  break;
    case 'wave-done':   cmdWaveDone(opts);   break;
    case 'wave-fail':   cmdWaveFail(opts);   break;
    case 'wave-committed': cmdWaveCommitted(opts); break;
    case 'task-done':   cmdTaskDone(opts);   break;
    case 'task-fail':   cmdTaskFail(opts);   break;
    case 'context':     cmdContext(opts);    break;
    case 'read':        cmdRead(opts);       break;
    case 'cleanup':     cmdCleanup(opts);    break;
    case 'gc':          cmdGc(opts);         break;
    case 'summarize-prior-wave-context': cmdSummarizePriorWaveContext(opts); break;
    case 'wave-split': cmdWaveSplit(opts); break;
    case 'verify-completeness': cmdVerifyCompleteness(opts); break;
    case 'wave-progress': cmdWaveProgress(opts); break;
    case 'resume-reset': cmdResumeReset(opts); break;
    default:
      process.stderr.write(`Error: unknown subcommand "${opts.subcommand}"\n`);
      process.stderr.write('Usage: node execute-state.js <init|wave-start|wave-done|wave-fail|wave-committed|task-done|task-fail|context|read|cleanup|gc|summarize-prior-wave-context|wave-split|verify-completeness|wave-progress|resume-reset> [options]\n');
      process.exit(2);
  }
} catch (e) {
  process.stderr.write(`Unexpected error: ${e.message}\n`);
  process.exit(2);
}
