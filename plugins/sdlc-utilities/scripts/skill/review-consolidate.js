#!/usr/bin/env node
/**
 * review-consolidate.js
 * Deterministic half of the review-orchestrator (review-sdlc R-consolidate, P11):
 * renders the Step 1 review plan, and consolidates per-dimension findings JSON
 * into the PR comment, review-summary.json and the `Review complete` block.
 *
 * Usage:
 *   node review-consolidate.js --render-plan --manifest <path>
 *   node review-consolidate.js --manifest <path> --findings <dir> --output-dir <dir> [--summary-path <path>]
 *
 * Options:
 *   --render-plan           Print the review plan for the manifest and exit
 *   --manifest <path>       Manifest JSON written by skill/review.js
 *   --findings <dir>        Directory holding <dimension>.findings.json files
 *   --output-dir <dir>      Where review-comment.md is written (created when missing)
 *   --summary-path <path>   review-summary.json path (default: manifest.summary_copy_path; tests only)
 *
 * Exit codes: 0 = success, 1 = bad input (nothing written), 2 = unexpected error
 * Stdout: plan text or summary block
 * Stderr: `review-consolidate: <file>: <reason>` on bad input
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const LIB = path.join(__dirname, '..', 'lib');

const { emitText } = require(path.join(LIB, 'output'));

const USAGE =
  'Usage: review-consolidate.js --render-plan --manifest <path> | ' +
  '--manifest <path> --findings <dir> --output-dir <dir> [--summary-path <path>]';

const SEVERITIES    = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const FILE_STATUSES = ['ok', 'no-findings', 'error'];

const SCOPE_LABELS = {
  all:       'All changes (committed + staged)',
  committed: 'Committed branch changes only',
  staged:    'Staged changes only',
  working:   'Working tree changes (staged + unstaged)',
  worktree:  'Full working tree vs base (committed + staged + unstaged)',
};

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let renderPlanMode = false;
  let manifest = null;
  let findings = null;
  let outputDir = null;
  let summaryPath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--render-plan') renderPlanMode = true;
    else if (a === '--manifest' && args[i + 1])     manifest = args[++i];
    else if (a === '--findings' && args[i + 1])     findings = args[++i];
    else if (a === '--output-dir' && args[i + 1])   outputDir = args[++i];
    else if (a === '--summary-path' && args[i + 1]) summaryPath = args[++i];
  }

  return { renderPlanMode, manifest, findings, outputDir, summaryPath };
}

function fail(file, reason) {
  process.stderr.write(`review-consolidate: ${file}: ${reason}\n`);
  process.exit(1);
}

function requireArg(value, flag) {
  if (!value) {
    process.stderr.write(`review-consolidate: ${flag}: missing required argument\n${USAGE}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Input loading and validation
// ---------------------------------------------------------------------------

function readManifest(file) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(file, err.code ? `cannot read manifest (${err.code})` : `invalid JSON (${err.message})`);
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.dimensions)) {
    fail(file, 'manifest has no dimensions array');
  }
  return manifest;
}

function isDispatched(dim) {
  return dim.status === 'ACTIVE' || dim.status === 'TRUNCATED';
}

function validLine(line) {
  if (Number.isInteger(line)) return line >= 0;
  return typeof line === 'string' && /^\d+(-\d+)?$/.test(line);
}

/** Returns a reason string when the parsed findings file is invalid, else null. */
function findingsFileError(data, name) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'not a JSON object';
  if (data.dimension !== name) return `dimension "${data.dimension}" does not match file name "${name}"`;
  if (!FILE_STATUSES.includes(data.status)) return `status must be one of ${FILE_STATUSES.join(', ')}`;
  if (data.findings !== undefined && !Array.isArray(data.findings)) return 'findings must be an array';
  if (data.omittedCount !== undefined && !(Number.isInteger(data.omittedCount) && data.omittedCount >= 0)) {
    return 'omittedCount must be a non-negative integer';
  }
  const findings = data.findings || [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const at = `findings[${i}]`;
    if (!f || typeof f !== 'object') return `${at} is not an object`;
    for (const key of ['file', 'title', 'description', 'suggestion']) {
      if (typeof f[key] !== 'string') return `${at}.${key} must be a string`;
    }
    if (!SEVERITIES.includes(f.severity)) return `${at}.severity must be one of ${SEVERITIES.join(', ')}`;
    if (!validLine(f.line)) return `${at}.line must be an integer or a range string like "42-48"`;
    if (f.owasp !== undefined && typeof f.owasp !== 'string') return `${at}.owasp must be a string`;
    if (f.note !== undefined && typeof f.note !== 'string') return `${at}.note must be a string`;
    if (f.alsoFlaggedBy !== undefined &&
        !(Array.isArray(f.alsoFlaggedBy) && f.alsoFlaggedBy.every(s => typeof s === 'string'))) {
      return `${at}.alsoFlaggedBy must be an array of strings`;
    }
  }
  return null;
}

/**
 * Reads <dir>/<name>.findings.json for each dispatched dimension.
 * An invalid file exits 1 (before any write); a missing file is a failed dimension.
 */
function loadFindings(dir, dispatched) {
  return dispatched.map(dim => {
    const file = path.join(dir, `${dim.name}.findings.json`);
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { name: dim.name, status: 'error', error: 'no findings file returned', findings: [], omittedCount: 0 };
      }
      fail(file, `cannot read findings file (${err.code || err.message})`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      fail(file, `invalid JSON (${err.message})`);
    }
    const reason = findingsFileError(data, dim.name);
    if (reason) fail(file, reason);
    if (data.status === 'error') {
      const error = typeof data.error === 'string' && data.error ? data.error : 'reviewer reported an error';
      return { name: dim.name, status: 'error', error, findings: [], omittedCount: data.omittedCount || 0 };
    }
    const findings = (data.findings || []).map(f => ({
      ...f,
      dimension: dim.name,
      alsoFlaggedBy: f.alsoFlaggedBy ? [...f.alsoFlaggedBy] : [],
    }));
    return { name: dim.name, status: data.status, findings, omittedCount: data.omittedCount || 0 };
  });
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

/**
 * Findings sharing file:line across dimensions keep the one from the dimension
 * with the higher manifest severity (tie: higher finding severity, then
 * dimension name A→Z); the other dimensions are named in alsoFlaggedBy.
 */
function dedupe(results, manifest) {
  const dimSeverity = {};
  for (const d of manifest.dimensions) dimSeverity[d.name] = SEVERITY_RANK[d.severity] || 0;

  const rank = (a, b) =>
    (dimSeverity[b.dimension] - dimSeverity[a.dimension]) ||
    (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0);

  const byKey = new Map();
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.file}:${f.line}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(f);
    }
  }

  const dropped = new Set();
  for (const group of byKey.values()) {
    if (new Set(group.map(f => f.dimension)).size < 2) continue;
    const sorted = [...group].sort(rank);
    const winner = sorted[0];
    for (const f of sorted.slice(1)) {
      if (f.dimension === winner.dimension) continue;
      dropped.add(f);
      if (!winner.alsoFlaggedBy.includes(f.dimension)) winner.alsoFlaggedBy.push(f.dimension);
    }
  }

  for (const r of results) r.findings = r.findings.filter(f => !dropped.has(f));
  return results;
}

function zeroCounts() {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

function count(results) {
  const total = zeroCounts();
  const perDimension = {};
  for (const r of results) {
    const c = zeroCounts();
    for (const f of r.findings) {
      c[f.severity]++;
      total[f.severity]++;
    }
    perDimension[r.name] = c;
  }
  return { perDimension, total };
}

function sum(c) {
  return SEVERITIES.reduce((n, s) => n + c[s], 0);
}

function verdict(counts) {
  if (counts.critical > 0 || counts.high >= 3) return 'CHANGES REQUESTED';
  if (counts.high > 0 || counts.medium >= 5) return 'APPROVED WITH NOTES';
  return 'APPROVED';
}

function lineStart(line) {
  return parseInt(String(line), 10);
}

function compareFindings(a, b) {
  return (SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]) ||
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
    (lineStart(a.line) - lineStart(b.line)) ||
    (String(a.line) < String(b.line) ? -1 : String(a.line) > String(b.line) ? 1 : 0);
}

function today() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function scopeLabel(manifest) {
  return SCOPE_LABELS[manifest.scope] || String(manifest.scope);
}

function listWithMore(items, max) {
  const shown = items.slice(0, max);
  return items.length > max ? [...shown, `… and ${items.length - max} more`] : shown;
}

/** Step 1 plan text of the review-orchestrator, rendered from the manifest. */
function renderPlan(manifest) {
  const dims = manifest.dimensions;
  const git = manifest.git || {};
  const summary = manifest.summary || {};
  const critique = manifest.plan_critique || {};
  const out = [];

  out.push('Review Plan');
  out.push(`  Scope:         ${scopeLabel(manifest)}`);
  if (['all', 'committed', 'worktree'].includes(manifest.scope)) {
    out.push(`  Base branch:   ${manifest.base_branch}`);
  }
  out.push(`  Changed files: ${git.changed_files_count}`);
  out.push(`  Dimensions:    ${summary.active_dimensions} active, ${summary.skipped_dimensions} skipped`);
  out.push('');

  const header = ['Dimension', 'Files', 'Severity', 'Status'];
  const rows = dims.map(d => [String(d.name), String(d.matched_count), String(d.severity), String(d.status)]);
  const minWidths = [16, 5, 8, 8];
  const widths = header.map((h, i) => Math.max(minWidths[i], h.length, ...rows.map(r => r[i].length)));
  const row = cells => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  out.push(row(header));
  out.push(`|${widths.map(w => '-'.repeat(w + 2)).join('|')}|`);
  for (const r of rows) out.push(row(r));

  const warnings = [];
  const uncovered = critique.uncovered_files || [];
  if (uncovered.length > 0) {
    warnings.push(`Uncovered files (${uncovered.length}) — not matched by any dimension:`);
    for (const f of uncovered) warnings.push(`  ${f}`);
  }
  const overBroad = critique.over_broad_dimensions || [];
  if (overBroad.length > 0) {
    warnings.push(`Over-broad dimensions (match more than 80% of changed files): ${overBroad.join(', ')}`);
  }
  if (critique.dimension_cap_applied === true) {
    const batches = new Map();
    for (const d of dims.filter(isDispatched)) {
      if (!batches.has(d.batch)) batches.set(d.batch, []);
      batches.get(d.batch).push(d.name);
    }
    warnings.push('Batches: the dispatched dimensions run in batches of 8');
    for (const b of [...batches.keys()].sort((x, y) => x - y)) {
      warnings.push(`  Batch ${b}: ${batches.get(b).join(', ')}`);
    }
  }
  if (warnings.length > 0) out.push('', ...warnings);

  const suggestions = critique.uncovered_suggestions || [];
  if (suggestions.length > 0) {
    out.push('', 'Suggested new dimensions for uncovered files:', '');
    for (const s of suggestions) {
      out.push(`  ${s.dimension} — ${s.reason}`);
      out.push(`    Files: ${listWithMore(s.files || [], 5).join(', ')}`);
      out.push('');
    }
    out.push('Run `/setup-sdlc --dimensions --add` to create these dimensions.');
  }

  const still = critique.still_uncovered || [];
  if (still.length > 0) {
    out.push('', `${still.length} file(s) not mappable to any known dimension type:`);
    for (const f of listWithMore(still, 10)) out.push(`  ${f}`);
    out.push('Consider creating a custom dimension or broadening existing trigger patterns.');
  }

  if (manifest.uncommitted_changes === true) {
    if (manifest.scope === 'all') {
      out.push('', 'Note: unstaged changes are not included in this review.');
    } else if (manifest.scope === 'committed') {
      out.push('', 'Warning: uncommitted changes are excluded from this review (committed scope).');
    }
  }

  return out.join('\n') + '\n';
}

function renderComment(manifest, dispatched, results, counts, verdictText, date) {
  const total = sum(counts.total);
  const t = counts.total;
  const out = [];

  out.push(`## Code Review — ${dispatched.length} dimension(s), ${total} finding(s)`);
  out.push('');
  out.push(`> Automated review by \`review-sdlc\` v${manifest.plugin_version} · ${date}`);
  out.push('');
  out.push('### Summary');
  out.push('');
  out.push('| Dimension | Findings | Critical | High | Medium | Low | Info |');
  out.push('|-----------|----------|----------|------|--------|-----|------|');
  for (const r of results) {
    const c = counts.perDimension[r.name];
    out.push(`| ${r.name} | ${sum(c)} | ${c.critical} | ${c.high} | ${c.medium} | ${c.low} | ${c.info} |`);
  }
  out.push(`| **Total** | **${total}** | **${t.critical}** | **${t.high}** | **${t.medium}** | **${t.low}** | **${t.info}** |`);
  out.push('');
  out.push(`### Verdict: ${verdictText}`);
  out.push('');
  out.push(`${t.critical} critical, ${t.high} high, ${t.medium} medium finding(s) across ${dispatched.length} dimension(s).`);
  out.push('');
  out.push('---');

  dispatched.forEach((dim, i) => {
    const r = results[i];
    const c = counts.perDimension[r.name];
    out.push('');
    out.push(`### ${r.name} — ${sum(c)} finding(s)`);
    out.push('');
    out.push('<details>');
    out.push(`<summary>${c.critical} critical · ${c.high} high · ${c.medium} medium · ${c.low} low · ${c.info} info</summary>`);
    out.push('');
    if (r.status === 'error') {
      out.push(`_Dimension failed: ${r.error}._`);
      out.push('');
    } else if (r.findings.length === 0) {
      out.push(`No findings; ${dim.matched_count} files in scope.`);
      out.push('');
    } else {
      for (const f of [...r.findings].sort(compareFindings)) {
        out.push(`#### [${f.severity.toUpperCase()}] ${f.title}`);
        out.push(`**File:** \`${f.file}:${f.line}\`${f.owasp ? ` · OWASP ${f.owasp}` : ''}`);
        out.push(f.description);
        out.push(`**Suggestion:** ${f.suggestion}`);
        if (f.alsoFlaggedBy.length > 0) out.push(`Also flagged by: ${f.alsoFlaggedBy.join(', ')}`);
        if (f.note) out.push(`Note: ${f.note}`);
        out.push('');
      }
    }
    if (r.omittedCount > 0) {
      out.push(`_${r.omittedCount} additional finding(s) omitted by the reviewer._`);
      out.push('');
    }
    out.push('</details>');
    out.push('');
    out.push('---');
  });

  return out.join('\n') + '\n';
}

function buildSummary(manifest, results, counts, verdictText, commentPath) {
  const byName = new Map(results.map(r => [r.name, r]));
  const dimensions = manifest.dimensions
    .filter(d => d.status === 'ACTIVE' || d.status === 'TRUNCATED' || d.status === 'SKIPPED')
    .map(d => {
      const entry = { name: d.name, status: d.status, findings: byName.has(d.name) ? byName.get(d.name).findings.length : 0 };
      if (isDispatched(d)) {
        const model = d.model || manifest.subagent_model;
        if (typeof model === 'string' && model) entry.model = model;
      }
      return entry;
    });
  return {
    schemaVersion: 1,
    verdict: verdictText,
    counts: counts.total,
    dimensions,
    commentPath,
    branch: manifest.current_branch || '',
  };
}

function renderBlock(manifest, info) {
  const pr = manifest.pr || {};
  const prExists = pr.exists === true;
  const t = info.counts.total;
  const lines = [
    'Review complete',
    `  Dimensions run:  ${info.active} (${info.skipped} skipped — no matching files)`,
  ];
  if (info.failed > 0) lines.push(`  Dimensions failed: ${info.failed}`);
  lines.push(
    `  Total findings:  ${sum(t)}`,
    `    critical: ${t.critical} | high: ${t.high} | medium: ${t.medium} | low: ${t.low} | info: ${t.info}`,
    `  Verdict:         ${info.verdict}`,
    `  Scope:           ${scopeLabel(manifest)}`,
    `  Branch:          ${manifest.current_branch}`,
    `  Comment file:    ${info.commentPath}`,
    `  Summary file:    ${info.summaryPath}`,
    `  Summary copy path: ${info.summaryPath}`,
    `  PR exists:       ${prExists}`,
    `  PR owner:        ${(prExists && pr.owner) || '—'}`,
    `  PR repo:         ${(prExists && pr.repo) || '—'}`,
    `  PR number:       ${(prExists && pr.number) || '—'}`,
    `  Diff dir:        ${manifest.diff_dir}`,
    `  Post decision:   ${manifest.post_decision || 'ask'}`,
    `  Auto:            ${!!(manifest.flags && manifest.flags.auto === true)}`,
    `  Save path:       ${manifest.save_path}`,
  );
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  requireArg(args.manifest, '--manifest');

  if (args.renderPlanMode) {
    const manifest = readManifest(args.manifest);
    emitText(renderPlan(manifest));
    return;
  }

  requireArg(args.findings, '--findings');
  requireArg(args.outputDir, '--output-dir');

  const manifest = readManifest(args.manifest);
  const summaryPathArg = args.summaryPath || manifest.summary_copy_path;
  if (!summaryPathArg) fail(args.manifest, 'no --summary-path given and manifest has no summary_copy_path');

  const dispatched = manifest.dimensions.filter(isDispatched);
  const results = loadFindings(args.findings, dispatched);
  dedupe(results, manifest);
  const counts = count(results);
  const verdictText = verdict(counts.total);

  const outputDir = path.resolve(args.outputDir);
  const commentPath = path.join(outputDir, 'review-comment.md');
  const summaryPath = path.resolve(summaryPathArg);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(commentPath, renderComment(manifest, dispatched, results, counts, verdictText, today()));

  const summary = buildSummary(manifest, results, counts, verdictText, commentPath);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

  emitText(renderBlock(manifest, {
    active: dispatched.length,
    skipped: manifest.dimensions.filter(d => d.status === 'SKIPPED').length,
    failed: results.filter(r => r.status === 'error').length,
    counts,
    verdict: verdictText,
    commentPath,
    summaryPath,
  }));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`review-consolidate.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = { renderPlan, loadFindings, dedupe, count, verdict, renderComment, renderBlock };
