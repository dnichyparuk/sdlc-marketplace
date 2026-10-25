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

module.exports = { extractField, stripFences, extractTasks, parsePlan };
