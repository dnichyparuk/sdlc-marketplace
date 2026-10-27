#!/usr/bin/env node
/**
 * openspec-step.js
 *
 * One entry point for the OpenSpec operations that ship-sdlc, execute-plan-sdlc,
 * pr-sdlc and plan-sdlc run. Each subcommand wraps existing `lib/openspec.js`
 * functions; this script adds only ordering and result strings.
 *
 * Usage:
 *   node openspec-step.js detect   [--change <n>] [--project-root <p>]
 *   node openspec-step.js flip     --change <n> --ref <r> [--line <n>] [--title <t>] [--project-root <p>]
 *   node openspec-step.js validate --change <n> [--project-root <p>]
 *   node openspec-step.js archive  --change <n> --decision sync|anyway|cancel [--auto] [--project-root <p>]
 *   node openspec-step.js tasks    --change <n> [--project-root <p>]
 *
 * The project root is `--project-root <p>`, else the active worktree
 * (`resolveActiveWorktreeSafe()`), where OpenSpec content lives.
 *
 * `tasks` reads <root>/openspec/changes/<n>/tasks.md through `parseTasks`. Its --change
 * must match ^[A-Za-z0-9._-]+$ and not be . or .. (else the usage error, exit 2).
 *
 * Stdout: exactly ONE JSON line, one of:
 *   detect   {"detected":B,"changeName":S|null,"isArchived":B,"tasksDone":N,"tasksTotal":N,
 *             "matchedBy":"flag"|"branch"|"single-active"|null,"proposalPath":S|null,
 *             "designPath":S|null,"specPaths":[S],"activeChanges":[S]}            exit 0
 *   flip     {"flipped":B,"ref":S,"reason":"ok"|"already-done"|"not-found"|"io-error"}  exit 0
 *   validate {"ok":B,"cliAvailable":B,"stderr":S}     exit 0 (ok or CLI missing), 1 otherwise
 *   archive  {"status":"archived"|"synced-and-archived"|"halted"|"cancelled",
 *             "taskCounts":{"done":N,"total":N,"synced":N,"failed":[S]},
 *             "validation":{...}|null,"commitMade":B,"resultText":S|null}
 *            exit 0 archived, 1 halted or cancelled
 *   tasks    {"ok":true,"tasks":[{"ref":S,"line":N,"title":S,"indent":N,"done":B}]}   exit 0
 *            {"ok":false,"error":"not-found"|"io-error"}   exit 1
 *   usage    {"error":"<message>"}                    exit 2
 *
 * Stderr: progress and warnings.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const LIB = path.join(__dirname, '..', 'lib');

const {
  detectActiveChanges,
  isArchived,
  getTaskCounts,
  syncIncompleteTasks,
  validateChangeStrict,
  runArchive,
  markTaskDone,
  parseTasks,
} = require(path.join(LIB, 'openspec'));
const { writeJsonLine } = require(path.join(LIB, 'output'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));

const SUBCOMMANDS = ['detect', 'flip', 'validate', 'archive', 'tasks'];
const DECISIONS = ['sync', 'anyway', 'cancel'];
const VALUE_FLAGS = ['--change', '--ref', '--line', '--title', '--decision', '--project-root'];
// The W44-R6 pattern (skill/ship.js OPENSPEC_CHANGE_RE). `tasks` also rejects `.` and `..`,
// which would read openspec/changes/tasks.md and openspec/tasks.md.
const CHANGE_NAME_RE = /^[A-Za-z0-9._-]+$/;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { sub: argv[0], auto: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--auto') opts.auto = true;
    else if (VALUE_FLAGS.includes(a) && i + 1 < argv.length) opts[a.slice(2)] = argv[++i];
  }
  return opts;
}

function usageError(opts) {
  if (!SUBCOMMANDS.includes(opts.sub)) {
    return opts.sub
      ? `unknown subcommand: ${opts.sub} (expected ${SUBCOMMANDS.join('|')})`
      : `missing subcommand (expected ${SUBCOMMANDS.join('|')})`;
  }
  if (opts.sub !== 'detect' && !opts.change) return `${opts.sub}: --change <name> is required`;
  if (opts.sub === 'tasks' && (!CHANGE_NAME_RE.test(opts.change) || opts.change === '.' || opts.change === '..')) {
    return 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..';
  }
  if (opts.sub === 'flip' && !opts.ref) return 'flip: --ref <ref> is required';
  if (opts.sub === 'archive' && !DECISIONS.includes(opts.decision)) {
    return `archive: --decision ${DECISIONS.join('|')} is required`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function existingPath(p) {
  return fs.existsSync(p) ? p : null;
}

function listMdFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMdFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function detect(root, opts) {
  const info = detectActiveChanges(root);
  const names = info.activeChanges.map((c) => c.name);

  let changeName = null;
  let matchedBy = null;
  if (opts.change) {
    changeName = opts.change;
    matchedBy = 'flag';
  } else if (info.branchMatch) {
    changeName = info.branchMatch;
    matchedBy = 'branch';
  } else if (names.length === 1) {
    changeName = names[0];
    matchedBy = 'single-active';
  }

  let tasksDone = 0;
  let tasksTotal = 0;
  let proposalPath = null;
  let designPath = null;
  let specPaths = [];
  if (changeName) {
    const counts = getTaskCounts(root, changeName);
    if (!counts.error) {
      tasksDone = counts.tasksDone;
      tasksTotal = counts.tasksTotal;
    }
    const changeDir = path.join(root, 'openspec', 'changes', changeName);
    proposalPath = existingPath(path.join(changeDir, 'proposal.md'));
    designPath = existingPath(path.join(changeDir, 'design.md'));
    specPaths = listMdFiles(path.join(changeDir, 'specs')).sort();
  }

  writeJsonLine({
    detected: info.present,
    changeName,
    isArchived: changeName ? isArchived(root, changeName) : false,
    tasksDone,
    tasksTotal,
    matchedBy,
    proposalPath,
    designPath,
    specPaths,
    activeChanges: names,
  });
}

function flip(root, opts) {
  const line = opts.line ? Number(opts.line) : undefined;
  const r = markTaskDone(opts.change, opts.ref, { line, title: opts.title }, { projectRoot: root });
  writeJsonLine({
    flipped: r.changed,
    ref: opts.ref,
    reason: r.reason === null ? 'ok' : r.reason,
  });
}

function validate(root, opts) {
  const r = validateChangeStrict(root, opts.change);
  writeJsonLine(
    { ok: r.ok, cliAvailable: r.cliAvailable, stderr: r.stderr || '' },
    { exitCode: r.ok || !r.cliAvailable ? 0 : 1 }
  );
}

function runGit(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(`archive-openspec: git ${args[0]} failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}\n`);
    return false;
  }
  return true;
}

function archive(root, opts) {
  const name = opts.change;
  const taskCounts = { done: 0, total: 0, synced: 0, failed: [] };
  const result = { status: 'halted', taskCounts, validation: null, commitMade: false, resultText: null };
  const halt = () => writeJsonLine(result, { exitCode: 1 });

  // 1. Already archived — nothing else to do.
  if (isArchived(root, name)) {
    writeJsonLine({
      status: 'archived',
      reason: 'already archived',
      taskCounts,
      validation: null,
      commitMade: false,
      resultText: `archived ${name}`,
    });
    return;
  }

  // 2. Fresh task counts.
  const counts = getTaskCounts(root, name);
  if (counts.error) {
    process.stderr.write(`archive-openspec: cannot read tasks for ${name}: ${counts.error}\n`);
    halt();
    return;
  }
  taskCounts.done = counts.tasksDone;
  taskCounts.total = counts.tasksTotal;
  const incomplete = taskCounts.total - taskCounts.done;

  // 3. Cancel — before any write.
  if (opts.decision === 'cancel') {
    result.status = 'cancelled';
    halt();
    return;
  }

  // 4. Unattended run with incomplete tasks: warn and proceed.
  if (opts.auto && incomplete > 0) {
    process.stderr.write(`archive-openspec: ${incomplete} task(s) incomplete — proceeding without sync (--auto)\n`);
  }

  // 5. Sync incomplete tasks (failures are non-fatal).
  if (opts.decision === 'sync') {
    const s = syncIncompleteTasks(root, name);
    taskCounts.synced = s.synced;
    taskCounts.failed = s.failed.map((f) => f.ref);
  }

  // 6. Strict validation (a missing CLI halts here).
  const v = validateChangeStrict(root, name);
  result.validation = { ok: v.ok, cliAvailable: v.cliAvailable, stderr: v.stderr || '' };
  if (!v.ok) {
    halt();
    return;
  }

  // 7. Archive through the CLI.
  const a = runArchive(root, name);
  if (!a.ok) {
    process.stderr.write(`archive-openspec: openspec archive failed: ${a.stderr || ''}\n`);
    halt();
    return;
  }

  // 8. Commit the archive (argv form; the name never enters a shell string).
  if (!runGit(root, ['add', 'openspec/']) ||
      !runGit(root, ['commit', '-m', `chore(openspec): archive ${name}`])) {
    halt();
    return;
  }
  result.commitMade = true;

  // 9. Done.
  if (opts.decision === 'sync') {
    result.status = 'synced-and-archived';
    result.resultText = `archived ${name} (synced ${taskCounts.synced} tasks)`;
  } else {
    result.status = 'archived';
    result.resultText = incomplete > 0
      ? `archived ${name}, ${incomplete} task(s) left incomplete`
      : `archived ${name}`;
  }
  writeJsonLine(result);
}

function tasks(root, opts) {
  const file = path.join(root, 'openspec', 'changes', opts.change, 'tasks.md');
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    writeJsonLine({ ok: false, error: err.code === 'ENOENT' ? 'not-found' : 'io-error' }, { exitCode: 1 });
    return;
  }
  writeJsonLine({ ok: true, tasks: parseTasks(content) });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const err = usageError(opts);
  if (err) {
    writeJsonLine({ error: err }, { exitCode: 2 });
    return;
  }

  const root = opts['project-root'] ? path.resolve(opts['project-root']) : resolveActiveWorktreeSafe();
  const handlers = { detect, flip, validate, archive, tasks };
  handlers[opts.sub](root, opts);
}

main();
