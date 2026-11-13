#!/usr/bin/env node
/**
 * received-review-prepare.js
 * Pre-computes review thread state for the received-review-sdlc skill:
 * fetches PR review threads, classifies each into one of four categories
 * (outstanding, resolved, self-replied, stale), and outputs a JSON manifest.
 *
 * Usage:
 *   node received-review-prepare.js --pr <number> [options]
 *   node received-review-prepare.js --comment-file <path> [options]
 *
 * Options:
 *   --pr <number>          PR number (required unless --comment-file is given)
 *   --comment-file <path>  Parse findings from a review-sdlc comment file (no gh call; --pr wins if both)
 *   --owner <owner>        Repository owner (auto-detect from git remote if omitted)
 *   --repo <repo>          Repository name (auto-detect if omitted)
 *   --project-root <path>  Project root (default: cwd)
 *   --auto                 Auto-proceed mode (surfaced as flags.auto in the manifest)
 *   --plan <path>          Plan whose Files paths bound the fixes (manifest allowedFiles, R28)
 *   --min-severity <level> Lowest severity that may be fixed: critical|high|medium|low (flags.minSeverity, R29)
 *   --output-file          Accepted for convention; the manifest file is always written
 *
 * Check mode (R30):
 *   node received-review.js --check-scope --manifest <path> --fixed <id,id,...>
 *   Prints {"ok","outOfScope","belowThreshold"} as one JSON line on stdout.
 *   Exit 0 = in scope, 1 = out-of-scope path or below-threshold id, 2 = script error.
 *
 * Exit codes:
 *   0 = success, JSON on stdout (including when PR has no review threads)
 *   1 = missing --pr argument, invalid --min-severity, unreadable --plan
 *   2 = script error
 *
 * Stdout: JSON manifest
 * Stderr: warnings/progress
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const LIB = path.join(__dirname, '..', 'lib');

const {
  detectBaseBranch,
  getChangedFiles,
  parseRemoteOwner,
  ensureGhAccount,
  getCurrentUser,
  fetchPrReviewThreads,
} = require(path.join(LIB, 'git'));
const { writeOutput, writeJsonLine } = require(path.join(LIB, 'output'));
const { planFilesPaths } = require(path.join(LIB, 'plan-parse'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { readSection, readProjectConfig, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { getPluginVersion } = require(path.join(LIB, 'config-version'));
const { loadGuardrails } = require(path.join(LIB, 'harden-surfaces'));
const { resolveDimensionsDir } = require(path.join(LIB, 'dimensions'));

// ---------------------------------------------------------------------------
// Severity parsing (issue #233)
// ---------------------------------------------------------------------------

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

/**
 * Parse a severity tag from a PR review comment body.
 *
 * Recognized format (emitted by review-sdlc per REFERENCE.md):
 *   - **Severity**: critical
 *   - **Severity**: high
 *
 * The format is matched case-insensitively. Only the four user-configurable
 * severities are returned (`low|medium|high|critical`); `info` is mapped to
 * null because it cannot appear in `alwaysFixSeverities` (R18).
 *
 * @param {string} body  Comment body text
 * @returns {'low'|'medium'|'high'|'critical'|null}
 */
function parseSeverity(body) {
  if (typeof body !== 'string' || body.length === 0) return null;
  // Match `**Severity**: <value>` or `Severity: <value>`; tolerate surrounding whitespace.
  const m = body.match(/(?:^|\n)\s*[-*]?\s*\*{0,2}\s*severity\s*\*{0,2}\s*:\s*([a-zA-Z]+)/i);
  if (!m) return null;
  const value = m[1].toLowerCase();
  return VALID_SEVERITIES.has(value) ? value : null;
}

/**
 * Resolve `alwaysFixSeverities` from `.sdlc/local.json` only (R19, C15).
 * If the field appears in `.sdlc/config.json`, emit one stderr warning and ignore it.
 *
 * @param {string} projectRoot
 * @returns {string[]} severity list (empty array when unset)
 */
function resolveAlwaysFixSeverities(projectRoot) {
  // Misplacement check: warn if found in project config.
  try {
    const { config: projectConfig } = readProjectConfig(projectRoot);
    const misplaced = projectConfig?.receivedReview?.alwaysFixSeverities;
    if (misplaced !== undefined) {
      process.stderr.write(
        'warning: receivedReview.alwaysFixSeverities found in .sdlc/config.json — ' +
        'this field is local-only and will be ignored. Move it to .sdlc/local.json.\n'
      );
    }
  } catch (_) { /* missing or unreadable project config — silent */ }

  const local = readSection(projectRoot, 'receivedReview');
  const list = local?.alwaysFixSeverities;
  if (!Array.isArray(list)) return [];
  const valid = list.filter(s => typeof s === 'string' && VALID_SEVERITIES.has(s));
  const invalid = list.filter(s => !VALID_SEVERITIES.has(s));
  if (invalid.length > 0) {
    process.stderr.write(
      `[received-review] alwaysFixSeverities: unrecognized severity values ignored: ` +
      `${JSON.stringify(invalid)}. Allowed: low, medium, high, critical.\n`
    );
  }
  return valid;
}

// ---------------------------------------------------------------------------
// harden surface + target file hint inference (issue #429, R24, KD6)
// ---------------------------------------------------------------------------

/**
 * Resolve `alwaysHardenFromReview` from `.sdlc/local.json` only (R24, C17).
 * Warns and ignores if found in `.sdlc/config.json`.
 */
function resolveAlwaysHardenFromReview(projectRoot) {
  try {
    const { config: projectConfig } = readProjectConfig(projectRoot);
    if (projectConfig?.receivedReview?.alwaysHardenFromReview !== undefined) {
      process.stderr.write(
        'warning: receivedReview.alwaysHardenFromReview found in .sdlc/config.json — ' +
        'this field is local-only and will be ignored. Move it to .sdlc/local.json.\n'
      );
    }
  } catch (_) { /* missing or unreadable project config — silent */ }

  const local = readSection(projectRoot, 'receivedReview');
  return Boolean(local?.alwaysHardenFromReview);
}

/**
 * Resolve `hardenClusterCap` from `.sdlc/local.json`. Default 5, clamped to [1, 50].
 */
function resolveHardenClusterCap(projectRoot) {
  const local = readSection(projectRoot, 'receivedReview');
  const raw = local?.hardenClusterCap;
  if (raw === undefined || raw === null) return 5;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(50, n));
}

/**
 * Load known dimension names and guardrail IDs for hint inference.
 * Tolerates any load error (returns empty sets).
 */
function loadKnownHardenData(projectRoot) {
  const result = {
    dimensionNames: new Set(),
    planGuardrailIds: new Set(),
    executeGuardrailIds: new Set(),
  };

  try {
    const dimDir = resolveDimensionsDir(projectRoot);
    if (fs.existsSync(dimDir)) {
      for (const f of fs.readdirSync(dimDir).filter(f => f.endsWith('.md'))) {
        result.dimensionNames.add(f.replace(/\.md$/, ''));
      }
    }
  } catch (_) { /* tolerate */ }

  try {
    const errors = [];
    for (const g of loadGuardrails(projectRoot, 'plan', errors)) {
      if (g.id) result.planGuardrailIds.add(g.id);
    }
    for (const g of loadGuardrails(projectRoot, 'execute', errors)) {
      if (g.id) result.executeGuardrailIds.add(g.id);
    }
  } catch (_) { /* tolerate */ }

  return result;
}

/**
 * Rule-based heuristic for hardenSurfaceHint (KD6, P12).
 * Priority: review-dimensions > plan-guardrails > execute-guardrails > copilot-instructions > null.
 */
function inferHardenSurfaceHint(commentBody, knownData) {
  if (typeof commentBody !== 'string' || commentBody.length === 0) return null;
  const body = commentBody.toLowerCase();

  if (body.includes('.sdlc/review-dimensions/') || body.includes('review-dimensions')) {
    return 'review-dimensions';
  }
  for (const name of knownData.dimensionNames) {
    if (body.includes(name.toLowerCase())) return 'review-dimensions';
  }

  if (body.includes('plan.guardrails') || body.includes('plan guardrails')) {
    return 'plan-guardrails';
  }
  for (const id of knownData.planGuardrailIds) {
    if (id && body.includes(id.toLowerCase())) return 'plan-guardrails';
  }

  if (body.includes('execute.guardrails') || body.includes('execute guardrails')) {
    return 'execute-guardrails';
  }
  for (const id of knownData.executeGuardrailIds) {
    if (id && body.includes(id.toLowerCase())) return 'execute-guardrails';
  }

  if (body.includes('.github/instructions/') || body.includes('.instructions.md')) {
    return 'copilot-instructions';
  }

  return null;
}

/**
 * Rule-based heuristic for hardenTargetFileHint (KD6, P13).
 * Returns first path-like mention that resolves to an existing file, else null.
 */
function inferHardenTargetFileHint(commentBody, projectRoot) {
  if (typeof commentBody !== 'string' || commentBody.length === 0) return null;
  const pathPattern = /(?:^|[\s`'"(])([/.][a-zA-Z0-9_./-]+\.(?:md|json|yaml|yml|js|ts))/gm;
  let m;
  while ((m = pathPattern.exec(commentBody)) !== null) {
    const candidate = m[1].trim();
    if (candidate.startsWith('/') && fs.existsSync(candidate)) return candidate;
    const abs = path.resolve(projectRoot, candidate);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let prNumber = null;
  let owner = null;
  let repo = null;
  let projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/ (overridable via --project-root)
  let auto = false;
  let commentFile = null;
  let planFile = null;
  let minSeverity = null;
  let checkScope = false;
  let manifestPath = null;
  let fixedIds = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pr' && args[i + 1])           prNumber = parseInt(args[++i], 10);
    else if (a === '--owner' && args[i + 1])    owner = args[++i];
    else if (a === '--repo' && args[i + 1])     repo = args[++i];
    else if (a === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
    else if (a === '--auto')                    auto = true;
    else if (a === '--comment-file' && args[i + 1]) commentFile = path.resolve(args[++i]);
    else if (a === '--plan' && args[i + 1])     planFile = path.resolve(args[++i]);
    else if (a === '--min-severity') minSeverity = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : ''; // '' fails the R29 check below
    else if (a === '--check-scope')             checkScope = true;
    else if (a === '--manifest' && args[i + 1]) manifestPath = path.resolve(args[++i]);
    else if (a === '--fixed' && args[i + 1] !== undefined) fixedIds = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--output-file')          { /* accepted for convention; writeOutput always writes the manifest file and prints its path */ }
  }

  return { prNumber, owner, repo, projectRoot, auto, commentFile,
           planFile, minSeverity, checkScope, manifestPath, fixedIds };
}

// ---------------------------------------------------------------------------
// Fix scope (R28-R30): allowedFiles from the plan, and the --check-scope mode
// ---------------------------------------------------------------------------

/** R29: rank order LOW < MEDIUM < HIGH < CRITICAL; null and unknown rank below LOW. */
const SEVERITY_RANK = ['low', 'medium', 'high', 'critical'];

/** R28: sorted, unique Files paths of every plan task, every kind. Throws when the plan is unreadable. */
function allowedFilesFromPlan(planFile) {
  const text = fs.readFileSync(planFile, 'utf8');
  return planFilesPaths(text); // same normalisation as ship's stageScope (plan-parse normalisePlanPath)
}

/** NUL-separated path list from a git command run in cwd. Throws on a git failure. */
function gitPathList(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 8000 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.split('\0').filter(Boolean);
}

/**
 * R30: compare the working tree's changed paths with manifest.allowedFiles and the
 * fixed ids' severities with manifest.flags.minSeverity. Throws (exit 2) on an
 * unreadable manifest or an unknown fixed id.
 */
function checkScope({ manifestPath, fixedIds, cwd }) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`--manifest ${manifestPath} is not a readable manifest (${err.message})`);
  }
  const items = new Map([...(manifest.findings || []), ...(manifest.threads || [])].map(x => [x.id, x]));
  const unknown = fixedIds.filter(id => !items.has(id));
  if (unknown.length > 0) throw new Error(`--fixed ids not in the manifest: ${unknown.join(', ')}`);

  let outOfScope = [];
  if (Array.isArray(manifest.allowedFiles)) {
    const allowed = manifest.allowedFiles;
    const changed = new Set([
      ...gitPathList(['diff', '--name-only', '-z', 'HEAD'], cwd),
      ...gitPathList(['ls-files', '--others', '--exclude-standard', '--full-name', '-z', ':/'], cwd),
    ]);
    // A directory Files entry covers every path under it, as in ship's stageScope.
    outOfScope = [...changed].filter(p => !p.startsWith('.sdlc/') && !allowed.some(a => p === a || p.startsWith(`${a}/`))).sort();
  }

  const minSeverity = manifest.flags?.minSeverity ?? null;
  const belowThreshold = minSeverity === null ? [] : fixedIds.filter(
    id => SEVERITY_RANK.indexOf(items.get(id).severity) < SEVERITY_RANK.indexOf(minSeverity));

  return { ok: outOfScope.length === 0 && belowThreshold.length === 0, outOfScope, belowThreshold };
}

// ---------------------------------------------------------------------------
// Review-comment findings parsing (--comment-file, P17)
// ---------------------------------------------------------------------------

/**
 * Parse a review-sdlc consolidated comment (the `renderComment` block format) into findings.
 *
 * @param {string} text  Comment markdown
 * @param {string} projectRoot
 * @param {object} knownData  Result of loadKnownHardenData
 * @returns {Array<{id:string,title:string,severity:string|null,path:string|null,line:number|null,body:string,hardenSurfaceHint:string|null,hardenTargetFileHint:string|null}>}
 */
function parseReviewComment(text, projectRoot = process.cwd(), knownData = { dimensionNames: new Set(), planGuardrailIds: new Set(), executeGuardrailIds: new Set() }) {
  const lines = String(text).split(/\r?\n/);
  const headingRe = /^#### \[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\] (.+)$/;
  const endRe = /^(#### \[|### |<\/details>|---)/;
  const fileRe = /^\*\*File:\*\* `([^`]+?):(\d+)`/;
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (!m) continue;
    let end = i + 1;
    while (end < lines.length && !endRe.test(lines[end])) end++;
    const blockLines = lines.slice(i + 1, end);
    const fileLine = blockLines.find(l => l.trim() !== '');
    const fm = fileLine ? fileRe.exec(fileLine) : null;
    const body = blockLines.join('\n').trim();
    const tag = m[1].toLowerCase();
    findings.push({
      id: 'F' + (findings.length + 1),
      title: m[2].trim(),
      severity: tag === 'info' ? null : tag,
      path: fm ? fm[1] : null,
      line: fm ? Number(fm[2]) : null,
      body,
      hardenSurfaceHint: inferHardenSurfaceHint(body, knownData),
      hardenTargetFileHint: inferHardenTargetFileHint(body, projectRoot),
    });
    i = end - 1;
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Thread classification
// ---------------------------------------------------------------------------

/**
 * Classify a single review thread into one of four statuses.
 *
 * Priority order:
 *   1. resolved   — thread is marked resolved
 *   2. self-replied — current user has replied in the thread
 *   3. stale      — thread is outdated AND its file is not in the current diff
 *   4. outstanding — none of the above
 *
 * @param {object} thread       Thread object from fetchPrReviewThreads
 * @param {string} currentUser  Authenticated GitHub username
 * @param {Set<string>} changedFileSet  Set of files changed in the current diff
 * @returns {'outstanding'|'resolved'|'self-replied'|'stale'}
 */
function classifyThread(thread, currentUser, changedFileSet) {
  if (thread.isResolved) return 'resolved';

  const hasUserReply = thread.comments.some(c => c.authorLogin === currentUser);
  if (hasUserReply) return 'self-replied';

  if (thread.isOutdated && !changedFileSet.has(thread.path)) return 'stale';

  return 'outstanding';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const {
    prNumber, owner: cliOwner, repo: cliRepo, projectRoot, auto, commentFile,
    planFile, minSeverity, checkScope: checkScopeMode, manifestPath, fixedIds,
  } = parseArgs(process.argv);

  // R30: check mode reads only the given manifest and the working tree.
  if (checkScopeMode) {
    let result;
    try {
      result = checkScope({ manifestPath, fixedIds, cwd: process.cwd() });
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.exit(2);
    }
    writeJsonLine(result, result.ok ? 0 : 1);
    return;
  }

  // R29: an invalid --min-severity is an error; no manifest is written.
  if (minSeverity !== null && !VALID_SEVERITIES.has(minSeverity)) {
    process.stderr.write(`Error: --min-severity must be one of critical, high, medium, low (got "${minSeverity}").\n`);
    process.exit(1);
  }
  // R28: allowedFiles from --plan; an unreadable plan is an error.
  let allowedFiles = null;
  if (planFile) {
    try {
      allowedFiles = allowedFilesFromPlan(planFile);
    } catch (err) {
      process.stderr.write(`Error: --plan ${planFile} is not a readable file. Cause: ${err && err.message ? err.message : err}\n`);
      process.exit(1);
    }
  }

  // Issue #232: verifyAndMigrate gate (CLI > env > default false).
  const skipConfigCheck = resolveSkipConfigCheck(process.argv);
  const cv = ensureConfigVersion(projectRoot, { skip: skipConfigCheck, roles: ['project'] });
  if (cv.errors.length > 0) {
    writeOutput({
      errors: cv.errors.map(e => `config-version: ${e.role}: ${e.message}`),
      warnings: [],
      flags: { skipConfigCheck },
      migration: cv.migration,
    }, 'received-review-manifest', 1);
    return;
  }

  if (prNumber != null && !isNaN(prNumber) && commentFile) {
    process.stderr.write('Note: --pr given; --comment-file ignored.\n');
  } else if (commentFile) {
    // Comment-file path (A3/P16-P18): no gh call, findings parsed from a review comment.
    const knownData = loadKnownHardenData(projectRoot);
    const version = getPluginVersion();
    const flags = {
      auto,
      alwaysFixSeverities: resolveAlwaysFixSeverities(projectRoot),
      alwaysHardenFromReview: resolveAlwaysHardenFromReview(projectRoot),
      hardenClusterCap: resolveHardenClusterCap(projectRoot),
      minSeverity,
    };
    let text;
    try {
      text = fs.readFileSync(commentFile, 'utf8');
    } catch (_) {
      process.stderr.write(`Error: --comment-file ${commentFile} is not a readable file.\n`);
      process.exit(2);
    }
    const findings = parseReviewComment(text, projectRoot, knownData);
    writeOutput({
      version: 1,
      timestamp: new Date().toISOString(),
      source: 'comment-file',
      comment_file: commentFile,
      pr: null,
      currentUser: null,
      allowedFiles,
      planFile: planFile || null,
      flags,
      threads: [],
      findings,
      summary: { total: findings.length, outstanding: findings.length, resolved: 0, selfReplied: 0, stale: 0 },
      plugin_version: version,
      reply_footer: '\n\n_via `received-review-sdlc` v' + version + '_',
    }, 'received-review-manifest');
    return;
  }

  // Validate required --pr argument
  if (prNumber == null || isNaN(prNumber)) {
    process.stderr.write('Error: --pr <number> is required.\n');
    process.exit(1);
  }

  // Ensure correct GitHub account
  const ghAuth = ensureGhAccount(projectRoot);
  if (ghAuth.warning) process.stderr.write(`Warning: ${ghAuth.warning}\n`);
  if (ghAuth.switched) process.stderr.write(`Switched GitHub account to "${ghAuth.account}" (was "${ghAuth.previousAccount}")\n`);

  // Auto-detect owner/repo from git remote if not provided
  let owner = cliOwner;
  let repo = cliRepo;

  if (!owner || !repo) {
    const remote = parseRemoteOwner(projectRoot);
    if (!remote) {
      process.stderr.write('Error: could not detect owner/repo from git remote. Provide --owner and --repo explicitly.\n');
      process.exit(2);
    }
    if (!owner) owner = remote.owner;
    if (!repo) repo = remote.repo;
  }

  // Get current user login
  const currentUser = getCurrentUser();
  if (!currentUser) {
    process.stderr.write('Warning: could not determine current GitHub user. Thread classification may be incomplete.\n');
  }

  // Fetch review threads
  process.stderr.write(`Fetching review threads for ${owner}/${repo}#${prNumber}...\n`);
  const rawThreads = fetchPrReviewThreads(owner, repo, prNumber);

  // Detect changed files in current diff (for stale classification)
  let changedFiles = [];
  try {
    const base = detectBaseBranch(projectRoot);
    changedFiles = getChangedFiles(base, projectRoot);
  } catch (_) {
    process.stderr.write('Warning: could not detect base branch; stale classification will be skipped.\n');
  }
  const changedFileSet = new Set(changedFiles);

  // Resolve alwaysFixSeverities (issue #233, R18/R19) — single source: .sdlc/local.json
  const alwaysFixSeverities = resolveAlwaysFixSeverities(projectRoot);

  // Resolve harden-from-review flags (issue #429, R24) — single source: .sdlc/local.json
  const alwaysHardenFromReview = resolveAlwaysHardenFromReview(projectRoot);
  const hardenClusterCap = resolveHardenClusterCap(projectRoot);
  const knownHardenData = loadKnownHardenData(projectRoot);

  // Classify threads and build output
  const threads = rawThreads.map(thread => {
    const status = classifyThread(thread, currentUser, changedFileSet);
    const firstComment = thread.comments[0] || null;
    const hasUserReply = thread.comments.some(c => c.authorLogin === currentUser);
    // Per-thread severity parsed from the first comment body (issue #233, P9).
    // null when severity cannot be parsed; such threads NEVER bypass consent (R18).
    const severity = firstComment ? parseSeverity(firstComment.body) : null;

    // Per-thread harden surface + target file hints (issue #429, P12/P13).
    const body = firstComment?.body || '';
    const hardenSurfaceHint = inferHardenSurfaceHint(body, knownHardenData);
    const hardenTargetFileHint = inferHardenTargetFileHint(body, projectRoot);

    return {
      id: thread.id,
      status,
      path: thread.path,
      line: thread.line,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      severity,
      hardenSurfaceHint,
      hardenTargetFileHint,
      firstComment: firstComment
        ? {
            id: firstComment.id,
            databaseId: firstComment.databaseId,
            body: firstComment.body,
            authorLogin: firstComment.authorLogin,
            createdAt: firstComment.createdAt,
          }
        : null,
      replyCount: Math.max(0, thread.comments.length - 1),
      hasUserReply,
      allComments: thread.comments,
    };
  });

  // Compute summary counts
  const summary = {
    total: threads.length,
    outstanding: threads.filter(t => t.status === 'outstanding').length,
    resolved: threads.filter(t => t.status === 'resolved').length,
    selfReplied: threads.filter(t => t.status === 'self-replied').length,
    stale: threads.filter(t => t.status === 'stale').length,
  };

  const pluginVersion = getPluginVersion();
  const manifest = {
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'pr',
    comment_file: null,
    findings: [],
    pr: { number: prNumber, owner, repo },
    currentUser,
    allowedFiles,
    planFile: planFile || null,
    flags: { auto, alwaysFixSeverities, alwaysHardenFromReview, hardenClusterCap, minSeverity },
    threads,
    summary,
    plugin_version: pluginVersion,
    reply_footer: '\n\n_via `received-review-sdlc` v' + pluginVersion + '_',
  };

  writeOutput(manifest, 'received-review-manifest');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`received-review-prepare.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = { parseArgs, parseReviewComment, classifyThread, resolveAlwaysHardenFromReview, resolveHardenClusterCap, inferHardenSurfaceHint, inferHardenTargetFileHint, allowedFilesFromPlan, checkScope };
