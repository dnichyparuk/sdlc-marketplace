'use strict';

/**
 * plan-parse.js
 * Plan-file parsing shared by ci/validate-plan-format.js and skill/execute.js.
 *
 * Exports the validator's three parser helpers (moved verbatim: extractField,
 * stripFences, extractTasks) and parsePlan, a fence-aware parse of a plan file
 * into { header, tasks }. extractTasks keeps its exact behaviour because the
 * validator's PF checks depend on it; parsePlan has its own cut.
 *
 * No I/O. Zero npm dependencies.
 */

// ---------------------------------------------------------------------------
// Moved verbatim from ci/validate-plan-format.js
// ---------------------------------------------------------------------------

/**
 * Extract text after a bold field marker like **Goal:** from the content.
 * Returns the trimmed value or null if not found.
 */
function extractField(content, fieldName) {
  const re = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?:\\n|$)`);
  const match = content.match(re);
  return match ? match[1].trim() : null;
}

/**
 * Strip fenced code blocks (```, ````, or longer) from content so checks that
 * scan for headings/patterns don't false-positive (or false-negative) on
 * example text inside a fence. Handles fences of 3+ backticks via a
 * backreference, so a 4-backtick fence can safely contain literal ``` text.
 */
function stripFences(content) {
  return content.replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1`*[ \t]*$/gm, '');
}

/**
 * Split plan content into task blocks.
 * Returns array of { number, title, body } objects.
 */
function extractTasks(content) {
  const stripped = stripFences(content);
  const tasks = [];
  const taskRe = /^### Task (\d+):\s*(.+)$/gm;
  let match;

  const matches = [];
  while ((match = taskRe.exec(stripped)) !== null) {
    matches.push({ number: parseInt(match[1], 10), title: match[2].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end   = i + 1 < matches.length ? matches[i + 1].index : stripped.length;
    const body  = stripped.slice(start, end);
    tasks.push({ number: matches[i].number, title: matches[i].title, body });
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// parsePlan
// ---------------------------------------------------------------------------

const LABEL_RE = /^\*\*[^*\n]+:\*\*/;

/**
 * Walk lines tracking fence state. Calls visit(line, index, inFence) where
 * inFence is false for a line that sits outside any fence (fence delimiter
 * lines count as inside).
 */
function walkLines(lines, visit) {
  let open = 0; // backtick count of the open fence, 0 when outside
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(`{3,})(.*)$/);
    if (open === 0) {
      if (m) {
        open = m[1].length;
        visit(line, i, true);
        continue;
      }
      visit(line, i, false);
    } else {
      if (m && m[1].length >= open && m[2].trim() === '') open = 0;
      visit(line, i, true);
    }
  }
}

/** Text of a labelled block: label line remainder plus lines up to the next label. */
function labelBlock(body, label) {
  const lines = body.split('\n');
  const out = [];
  let found = false;
  let done = false;
  walkLines(lines, (line, _i, inFence) => {
    if (done) return;
    if (!inFence && LABEL_RE.test(line)) {
      if (found) { done = true; return; }
      if (line.startsWith(`**${label}:**`)) {
        found = true;
        const rest = line.slice(label.length + 5).trim();
        if (rest) out.push(rest);
      }
      return;
    }
    if (found) out.push(line);
  });
  if (!found) return null;
  return out.join('\n').trim();
}

function parseFiles(block) {
  const files = { create: [], modify: [], test: [] };
  if (!block) return files;
  const re = /^\s*-\s*(Create|Modify|Test):\s*`([^`]+)`/gm;
  let m;
  while ((m = re.exec(block)) !== null) files[m[1].toLowerCase()].push(m[2]);
  return files;
}

function parseOpenspec(block) {
  if (block === null) return null;
  const pick = key => {
    const m = block.match(new RegExp(`^\\s*-\\s*${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  const line = pick('line');
  return {
    change: pick('change'),
    ref: pick('ref'),
    line: line === null ? null : parseInt(line, 10),
    title: pick('title'),
  };
}

function parseTask(id, title, body) {
  const flat = stripFences(body);
  const field = name => extractField(flat, name);
  const dep = field('Depends on');
  const accBlock = labelBlock(flat, 'Acceptance criteria');
  const acceptance = [];
  if (accBlock) {
    for (const l of accBlock.split('\n')) {
      const m = l.match(/^\s*-\s*\[[ xX]\]\s*(.*)$/);
      if (m) acceptance.push(m[1].trim());
    }
  }
  return {
    id,
    title,
    complexity: field('Complexity'),
    risk: field('Risk'),
    dependsOn: dep ? Array.from(dep.matchAll(/Task\s+(\d+)/g), m => parseInt(m[1], 10)) : [],
    files: parseFiles(labelBlock(flat, 'Files')),
    verify: field('Verify'),
    contract: labelBlock(body, 'Contract'),
    notes: labelBlock(body, 'Notes'),
    acceptance,
    openspecTask: parseOpenspec(labelBlock(flat, 'openspec-task')),
    body,
  };
}

/**
 * Parse a plan file into { header, tasks }. See the Contract of Task 1 of the
 * W5.2 plan for the full shape.
 */
function parsePlan(content) {
  const text = String(content).replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  // Cut: record `### Task N:` and `## ` headings outside fences only.
  const marks = [];
  walkLines(lines, (line, i, inFence) => {
    if (inFence) return;
    const t = line.match(/^### Task (\d+):\s*(.+)$/);
    if (t) marks.push({ i, task: { id: parseInt(t[1], 10), title: t[2].trim() } });
    else if (/^## /.test(line)) marks.push({ i, task: null });
  });

  const firstTask = marks.find(m => m.task);
  const headerText = lines.slice(0, firstTask ? firstTask.i : lines.length).join('\n');
  const titleLine = lines.find(l => /^# /.test(l));

  const tasks = [];
  for (let k = 0; k < marks.length; k++) {
    if (!marks[k].task) continue;
    const end = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    const body = lines.slice(marks[k].i, end).join('\n');
    tasks.push(parseTask(marks[k].task.id, marks[k].task.title, body));
  }

  return {
    header: {
      title: titleLine ? titleLine.slice(2).trim() : null,
      goal: extractField(headerText, 'Goal'),
      architecture: extractField(headerText, 'Architecture'),
      source: extractField(headerText, 'Source'),
      verification: extractField(headerText, 'Verification'),
    },
    tasks,
  };
}

// ---------------------------------------------------------------------------
// Parser helpers (fence-aware, pure)
// ---------------------------------------------------------------------------

/** Task blocks with fences kept in the body. Returns [{ number, title, body }]. */
function extractTasksRaw(content) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  const marks = [];
  walkLines(lines, (line, i, inFence) => {
    if (inFence) return;
    const t = line.match(/^### Task (\d+):\s*(.+)$/);
    if (t) marks.push({ i, number: parseInt(t[1], 10), title: t[2].trim() });
  });
  return marks.map((mk, k) => ({
    number: mk.number,
    title: mk.title,
    body: lines.slice(mk.i, k + 1 < marks.length ? marks[k + 1].i : lines.length).join('\n'),
  }));
}

/** The task body cut before the first `## ` line outside a fence. */
function taskSection(body) {
  const lines = body.split('\n');
  let cut = -1;
  walkLines(lines, (line, i, inFence) => {
    if (cut === -1 && !inFence && line.startsWith('## ')) cut = i;
  });
  return cut === -1 ? body : lines.slice(0, cut).join('\n');
}

/** Files entries of a task body: [{ kind, path }]. */
function parseFilesEntries(body) {
  const entries = [];
  const re = /^\s*[-*]\s+(Create|Modify|Test):\s+(.+)$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const tick = m[2].match(/`([^`]+)`/);
    const raw = tick ? tick[1] : m[2].trim().split(/\s+/)[0];
    entries.push({ kind: m[1], path: raw.replace(/:\d+(-\d+)?$/, '') });
  }
  return entries;
}

/** Task numbers named by the `**Depends on:**` field; [] when absent or none. */
function parseDependsOn(body) {
  const dep = extractField(body, 'Depends on');
  if (dep === null) return [];
  if (['none', '—', '-'].includes(dep.toLowerCase())) return [];
  return Array.from(dep.matchAll(/Task\s+(\d+)/gi), m => parseInt(m[1], 10));
}

/** Text of the section opened by the first fenced-out line matching headingRegex, or null. */
function sectionBody(content, headingRegex) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  let start = -1;
  let end = lines.length;
  walkLines(lines, (line, i, inFence) => {
    if (inFence || end !== lines.length) return;
    if (start === -1) {
      if (headingRegex.test(line)) start = i;
    } else if (line.startsWith('## ') || /^### Task \d+:/.test(line)) {
      end = i;
    }
  });
  return start === -1 ? null : lines.slice(start + 1, end).join('\n');
}

/**
 * The plan header's `**Commit:**` field: { subject, failure }. failure is null
 * or { code } with code duplicate | format | length | chars | pattern-invalid |
 * pattern-mismatch (plus length / error where noted).
 */
function parsePlanCommit(content, subjectPattern, label = 'Commit') {
  const prefix = `**${label}:**`;
  const lines = String(content).split(/\r?\n/);
  const end = lines.findIndex(l => l === '---' || l.startsWith('## ') || l.startsWith('### '));
  const fields = (end === -1 ? lines : lines.slice(0, end)).filter(l => l.startsWith(prefix));
  const bad = failure => ({ subject: null, failure });
  if (fields.length === 0) return { subject: null, failure: null };
  if (fields.length > 1) return bad({ code: 'duplicate' });
  const m = new RegExp('^' + prefix.replace(/[*]/g, '\\*') + ' `([^`]+)`\\s*$').exec(fields[0]);
  if (!m) return bad({ code: 'format' });
  const subject = m[1];
  if (subject.length > 72) return bad({ code: 'length', length: subject.length });
  if (/["$\\]/.test(subject)) return bad({ code: 'chars' });
  if (subjectPattern) {
    let ok;
    try { ok = new RegExp(subjectPattern).test(subject); } catch (err) { return bad({ code: 'pattern-invalid', error: err.message }); }
    if (!ok) return bad({ code: 'pattern-mismatch' });
  }
  return { subject, failure: null };
}

// ---------------------------------------------------------------------------
// Copy rules: plan Files paths and the capture-aware glob matcher
// ---------------------------------------------------------------------------

/** "./a/b/" → "a/b" (no leading "./", no trailing "/"). Same normalisation as ship's stageScope. */
function normalisePlanPath(p) {
  return String(p).replace(/^\.\//, '').replace(/\/$/, '');
}

/** Sorted, unique, normalised Files paths of every task, every kind. */
function planFilesPaths(planText) {
  const paths = new Set();
  for (const t of extractTasks(planText)) {
    for (const e of parseFilesEntries(taskSection(t.body))) paths.add(normalisePlanPath(e.path));
  }
  return [...paths].sort();
}

const CAPTURE_RE = /\{([a-z][a-z0-9]*)\}/;

/** Capture names of a glob, in order. */
function globCaptureNames(glob) {
  return glob.split(CAPTURE_RE).filter((_, i) => i % 2 === 1);
}

/**
 * The one capture-aware matcher. Compiles a glob with {name} tokens into
 * (path) => captures object | null. A token matches one path segment ([^/]+);
 * with `bound`, a token matches that literal value instead.
 * globToRegex is required lazily: review.js must not load with plan-parse.js,
 * and review.js must never require plan-parse.js (load cycle).
 */
function compileCaptureGlob(glob, bound) {
  const { globToRegex } = require('../skill/review');
  const names = [];
  const src = glob.split(CAPTURE_RE).map((piece, i) => {
    if (i % 2 === 0) return piece === '' ? '' : globToRegex(piece).source.slice(1, -1);
    if (bound && Object.prototype.hasOwnProperty.call(bound, piece)) return bound[piece].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    names.push(piece);
    return '([^/]+)';
  }).join('');
  const re = new RegExp('^' + src + '$');
  return p => {
    const m = re.exec(p);
    if (!m) return null;
    const caps = {};
    names.forEach((n, i) => { if (!(n in caps)) caps[n] = m[i + 1]; });
    return caps;
  };
}

/** Existing files under cwd matching `glob` (walk the static directory prefix; recursive only for `**`). */
function expandGlob(glob, cwd, bound) {
  const fs = require('node:fs');
  const path = require('node:path');
  const match = compileCaptureGlob(glob, bound);
  const segs = glob.split('/');
  const prefix = [];
  while (segs.length > 1 && !/[*?[\]{}]/.test(segs[0])) prefix.push(segs.shift());
  const recursive = glob.includes('**');
  const maxDepth = segs.length;
  const out = [];
  const walk = (rel, depth) => {
    let entries;
    try { entries = fs.readdirSync(path.join(cwd, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (recursive || depth + 1 < maxDepth) walk(p, depth + 1); }
      else if (match(p)) out.push(p);
    }
  };
  walk(prefix.join('/'), 0);
  return out;
}

const isStringList = a => Array.isArray(a) && a.length > 0 && a.every(s => typeof s === 'string' && s !== '');

/** Rule indexes and the reasons they are invalid. */
function ruleProblems(rule) {
  const { isValidGlob } = require('./dimensions');
  const problems = [];
  if (!rule || typeof rule !== 'object') return ['is not an object'];
  if (!isStringList(rule.when)) problems.push('`when` must be a non-empty string array');
  if (!isStringList(rule.require)) problems.push('`require` must be a non-empty string array');
  if (problems.length > 0) return problems;
  for (const g of [...rule.when, ...rule.require]) if (!isValidGlob(g)) problems.push(`glob "${g}" is not valid`);
  const known = new Set(rule.when.flatMap(globCaptureNames));
  for (const g of rule.require) for (const n of globCaptureNames(g)) if (!known.has(n)) problems.push(`capture {${n}} in "${g}" is absent from every \`when\` glob`);
  return problems;
}

/** → { errors, warnings }; each message starts with `plan.copyRules[<i>]`. Warnings only when cwd is given. */
function validateCopyRules(rules, cwd) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(rules)) return { errors: ['plan.copyRules must be an array'], warnings };
  rules.forEach((rule, i) => {
    const problems = ruleProblems(rule);
    for (const p of problems) errors.push(`plan.copyRules[${i}] ${p}`);
    if (problems.length === 0 && cwd && !rule.when.some(g => expandGlob(g, cwd).length > 0)) {
      warnings.push(`plan.copyRules[${i}] no existing file matches any \`when\` glob`);
    }
  });
  return { errors, warnings };
}

/** → [{ path, rule, trigger, covered }], sorted by path then rule. Invalid rules are skipped. */
function requiredCopies(planText, rules, cwd) {
  if (!Array.isArray(rules)) return [];
  const files = planFilesPaths(planText);
  const found = new Map();
  rules.forEach((rule, i) => {
    if (ruleProblems(rule).length > 0) return;
    const whenMatchers = rule.when.map(g => compileCaptureGlob(g));
    for (const file of files) {
      for (const match of whenMatchers) {
        const caps = match(file);
        if (!caps) continue;
        for (const req of rule.require) {
          for (const p of expandGlob(req, cwd, caps)) {
            if (whenMatchers.some(m => m(p))) continue;
            const key = `${p}\0${i}`;
            if (!found.has(key)) found.set(key, { path: p, rule: i, trigger: file, covered: files.some(a => p === a || p.startsWith(a + '/')) });
          }
        }
      }
    }
  });
  return [...found.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.rule - b.rule));
}

module.exports = {
  extractField, stripFences, extractTasks, parsePlan,
  extractTasksRaw, taskSection, parseFilesEntries, parseDependsOn, sectionBody, parsePlanCommit,
  normalisePlanPath, planFilesPaths, validateCopyRules, requiredCopies,
};
