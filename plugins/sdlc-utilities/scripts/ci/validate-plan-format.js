#!/usr/bin/env node
/**
 * validate-plan-format.js
 * Validates plan files against the canonical plan format reference.
 *
 * Usage:
 *   node validate-plan-format.js [options]
 *
 * Options:
 *   --project-root <path>   Project root (default: cwd)
 *   --file <path>           Plan file to validate (required)
 *   --json                  JSON output to stdout (default)
 *   --markdown              Formatted markdown output to stdout
 *   --final                 Also enforce PF9 (Verification Scorecard)
 *   --template <path>       Active plan template; enables PF10 (under --final only)
 *
 * Exit codes: 0 = all pass, 1 = issues found, 2 = script error
 *
 * Checks:
 *   PF1  — Header fields (Goal, Architecture, Source, Verification)
 *   PF2  — Task numbering (contiguous from 0 or 1)
 *   PF3  — Required metadata (Complexity, Risk, Depends on, Verify)
 *   PF4  — Dependency validity (valid refs, no cycles)
 *   PF5  — Task body (Acceptance criteria; optional Notes capped at 5 lines)
 *   PF6  — Deviations & assumptions section present
 *   PF7  — Contract presence (artifact-touching tasks have **Contract:** block)
 *   PF9  — Scorecard presence (under --final only)
 *   PF10 — Template-driven required section presence (under --final, when --template given)
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const { resolveSdlcRoot } = require(path.join(__dirname, '..', 'lib', 'config'));
const { extractField, stripFences, extractTasks } = require(path.join(__dirname, '..', 'lib', 'plan-parse'));

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  // C-projectroot (#360): default to main-worktree .sdlc/ root, not cwd.
  let projectRoot  = resolveSdlcRoot();
  let filePath     = null;
  let outputFormat = 'json';
  let requireScorecard = false;
  let templatePath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project-root' && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (a === '--file' && args[i + 1]) {
      filePath = path.resolve(args[++i]);
    } else if (a === '--json') {
      outputFormat = 'json';
    } else if (a === '--markdown') {
      outputFormat = 'markdown';
    } else if (a === '--final') {
      requireScorecard = true;
    } else if (a === '--template' && args[i + 1]) {
      templatePath = path.resolve(args[++i]);
    }
  }

  return { projectRoot, filePath, outputFormat, requireScorecard, templatePath };
}

// ---------------------------------------------------------------------------
// Plan parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a plan template file's "## Required Sections" list.
 * Each list item is a section name, optionally annotated with an HTML
 * comment marker:
 *   - Context <!-- narrative: true -->
 *   - OpenSpec Appendix <!-- conditional: source matches openspec/changes/ -->
 * Returns { sections: [{ name, narrative, condition }] }.
 */
function parseTemplate(templatePath) {
  const content = fs.readFileSync(templatePath, 'utf8');
  const sections = [];

  // Find the "## Required Sections" heading and the next "## " heading (or
  // end of file) to bound the list. Done via explicit heading scanning
  // rather than a single regex: a lazy [\s\S]*? terminated by (?=\n##|$)
  // is unsafe here because the /m flag makes $ match before ANY newline,
  // not just end-of-string, truncating the block at its first line break.
  const headingRe = /^##\s+(.+)$/gm;
  let headingMatch;
  let blockStart = -1;
  let blockEnd   = content.length;

  while ((headingMatch = headingRe.exec(content)) !== null) {
    if (blockStart === -1) {
      if (headingMatch[1].trim() === 'Required Sections') {
        blockStart = headingRe.lastIndex;
      }
      continue;
    }
    blockEnd = headingMatch.index;
    break;
  }

  if (blockStart === -1) {
    return { sections };
  }

  const block = content.slice(blockStart, blockEnd);
  const lineRe = /^-\s+(.+)$/gm;
  let match;
  while ((match = lineRe.exec(block)) !== null) {
    let line = match[1].trim();

    const narrative = /<!--\s*narrative:\s*true\s*-->/.test(line);
    line = line.replace(/<!--\s*narrative:\s*true\s*-->/, '').trim();

    let condition = null;
    const condMatch = line.match(/<!--\s*conditional:\s*(.+?)\s*-->/);
    if (condMatch) {
      condition = condMatch[1].trim();
      line = line.replace(/<!--\s*conditional:[\s\S]*?-->/, '').trim();
    }

    const name = line.trim();
    if (name) {
      sections.push({ name, narrative, condition });
    }
  }

  return { sections };
}

// Note: no per-condition evaluation lives here. PF10 checks every declared
// section's heading unconditionally (see checkPF10 below) — R59 requires the
// heading present on every plan regardless of the section's conditional
// applicability; only the section's BODY differs by condition, and body
// content is an LLM (plan-sdlc SKILL.md Step 0/4) concern, not a
// deterministic-floor concern.

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

function checkPF1(content) {
  const fields = ['Goal', 'Architecture', 'Source', 'Verification'];
  const missing = [];

  for (const field of fields) {
    const value = extractField(content, field);
    if (!value) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return { id: 'PF1', status: 'fail', message: `Missing or empty header field(s): ${missing.join(', ')}` };
  }
  return { id: 'PF1', status: 'pass', message: 'All header fields present' };
}

function checkPF2(tasks) {
  if (tasks.length === 0) {
    return { id: 'PF2', status: 'fail', message: 'No tasks found (expected ### Task N: format)' };
  }

  const numbers = tasks.map(t => t.number).sort((a, b) => a - b);
  const start   = numbers[0];

  // Must start at 0 or 1
  if (start !== 0 && start !== 1) {
    return { id: 'PF2', status: 'fail', message: `Task numbering must start at 0 or 1, found: ${start}` };
  }

  // Check contiguous
  const gaps = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      gaps.push(`gap between Task ${numbers[i - 1]} and Task ${numbers[i]}`);
    }
  }

  // Check duplicates
  const dupes = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1]) {
      dupes.push(numbers[i]);
    }
  }

  const issues = [];
  if (gaps.length > 0) issues.push(`non-contiguous numbering: ${gaps.join(', ')}`);
  if (dupes.length > 0) issues.push(`duplicate task number(s): ${dupes.join(', ')}`);

  if (issues.length > 0) {
    return { id: 'PF2', status: 'fail', message: `Task numbering issues: ${issues.join('; ')}` };
  }

  return { id: 'PF2', status: 'pass', message: `${tasks.length} task(s) numbered contiguously from ${start}` };
}

function checkPF3(tasks) {
  const VALID_COMPLEXITY = ['Trivial', 'Standard', 'Complex'];
  const VALID_RISK       = ['Low', 'Medium', 'High'];
  const VALID_VERIFY     = ['tests', 'build', 'lint', 'manual'];

  const issues = [];

  for (const task of tasks) {
    const prefix = `Task ${task.number}`;

    // Complexity
    const complexity = extractField(task.body, 'Complexity');
    if (!complexity) {
      issues.push(`${prefix}: missing **Complexity:**`);
    } else if (!VALID_COMPLEXITY.includes(complexity)) {
      issues.push(`${prefix}: invalid Complexity "${complexity}" (expected: ${VALID_COMPLEXITY.join('|')})`);
    }

    // Risk
    const risk = extractField(task.body, 'Risk');
    if (!risk) {
      issues.push(`${prefix}: missing **Risk:**`);
    } else if (!VALID_RISK.includes(risk)) {
      issues.push(`${prefix}: invalid Risk "${risk}" (expected: ${VALID_RISK.join('|')})`);
    }

    // Depends on
    const dependsOn = extractField(task.body, 'Depends on');
    if (!dependsOn) {
      issues.push(`${prefix}: missing **Depends on:**`);
    }

    // Verify
    const verify = extractField(task.body, 'Verify');
    if (!verify) {
      issues.push(`${prefix}: missing **Verify:**`);
    } else {
      const values = verify.split(/,\s*/).map(v => v.trim());
      const invalid = values.filter(v => !VALID_VERIFY.includes(v));
      if (invalid.length > 0) {
        issues.push(`${prefix}: invalid Verify value(s): ${invalid.join(', ')} (expected: ${VALID_VERIFY.join('|')})`);
      }
    }
  }

  if (issues.length > 0) {
    return { id: 'PF3', status: 'fail', message: issues.join('; ') };
  }
  return { id: 'PF3', status: 'pass', message: 'All tasks have valid metadata' };
}

function checkPF4(tasks) {
  const taskNumbers = new Set(tasks.map(t => t.number));
  const issues      = [];
  const depGraph    = new Map(); // number -> [dependency numbers]

  for (const task of tasks) {
    const dependsOn = extractField(task.body, 'Depends on');
    if (!dependsOn || dependsOn.toLowerCase() === 'none') {
      depGraph.set(task.number, []);
      continue;
    }

    const refs = [];
    const refRe = /Task\s+(\d+)/gi;
    let match;
    while ((match = refRe.exec(dependsOn)) !== null) {
      const refNum = parseInt(match[1], 10);
      refs.push(refNum);
      if (!taskNumbers.has(refNum)) {
        issues.push(`Task ${task.number}: depends on nonexistent Task ${refNum}`);
      }
    }
    depGraph.set(task.number, refs);
  }

  // Cycle detection using DFS
  const visited  = new Set();
  const inStack  = new Set();

  function hasCycle(node, path) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      issues.push(`Circular dependency: ${cycle.map(n => 'Task ' + n).join(' -> ')}`);
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    const deps = depGraph.get(node) || [];
    for (const dep of deps) {
      if (hasCycle(dep, [...path, node])) return true;
    }

    inStack.delete(node);
    return false;
  }

  for (const num of taskNumbers) {
    if (!visited.has(num)) {
      hasCycle(num, []);
    }
  }

  if (issues.length > 0) {
    return { id: 'PF4', status: 'fail', message: issues.join('; ') };
  }
  return { id: 'PF4', status: 'pass', message: 'All dependencies valid, no cycles' };
}

function checkPF5(tasks) {
  const issues = [];

  for (const task of tasks) {
    const prefix = `Task ${task.number}`;

    // Check Acceptance criteria with at least one checkbox
    const acMatch = task.body.match(/\*\*Acceptance criteria:\*\*\s*\n([\s\S]{0,5000}?)(?=\n### |\n---|\n## |$)/);
    if (!acMatch) {
      issues.push(`${prefix}: missing **Acceptance criteria:**`);
    } else {
      const checkboxCount = (acMatch[1].match(/- \[ \]/g) || []).length;
      if (checkboxCount === 0) {
        issues.push(`${prefix}: **Acceptance criteria:** has no checkbox items (expected at least one "- [ ]")`);
      }
    }

    // Optional Notes block, capped at 5 non-blank lines
    const notesMatch = task.body.match(/\*\*Notes:\*\*\s*\n([\s\S]{0,2000}?)(?=\n\*\*|\n### |\n---|\n## |$)/);
    if (notesMatch) {
      const notesBody = notesMatch[1];
      const lineCount = notesBody.split('\n').filter(l => l.trim().length > 0).length;
      if (lineCount > 5) {
        issues.push(`${prefix}: **Notes:** has ${lineCount} non-blank lines (max 5)`);
      }
    }
  }

  if (issues.length > 0) {
    return { id: 'PF5', status: 'fail', message: issues.join('; ') };
  }
  return { id: 'PF5', status: 'pass', message: 'All tasks have valid Acceptance criteria' };
}

function checkPF6(content) {
  // Strip fenced code blocks before checking so headers inside code examples don't produce false passes.
  const stripped = stripFences(content);
  const re = /^##\s+Deviations\s*&\s*assumptions/im;
  if (!re.test(stripped)) {
    return { id: 'PF6', status: 'fail', message: 'Missing required "## Deviations & assumptions" section' };
  }
  return { id: 'PF6', status: 'pass', message: 'Deviations & assumptions section present' };
}

function checkPF7(tasks) {
  const offenders = tasks
    .filter(t => /^[-*]\s+(Create|Modify|Test):/m.test(t.body)
              && !/^\*\*Contract:\*\*/m.test(t.body))
    .map(t => `Task ${t.number}`);
  return offenders.length
    ? { id: 'PF7', status: 'fail', message: `Missing **Contract:** block: ${offenders.join(', ')}` }
    : { id: 'PF7', status: 'pass', message: 'All artifact-touching tasks have a Contract block' };
}

function checkPF9(content) {
  const stripped = stripFences(content);
  return /^##\s+Verification\s+Scorecard/im.test(stripped)
    ? { id: 'PF9', status: 'pass', message: 'Verification Scorecard section present' }
    : { id: 'PF9', status: 'fail', message: 'Missing required "## Verification Scorecard" section' };
}

/**
 * Dynamic, template-driven required-section presence check.
 * For every required section from the active template — conditional or not
 * — check that the "## <name>" heading is present in the plan (implements
 * R59: the heading is present on every plan regardless of the section's
 * conditional applicability; a not-applicable conditional section still
 * carries its heading, with body text like "Not applicable — <reason>").
 * Conditions are not evaluated here; they only affect the section's BODY,
 * which is an LLM (plan-sdlc SKILL.md) concern at plan-authoring time.
 */
function checkPF10(content, requiredSections) {
  if (!requiredSections || requiredSections.length === 0) {
    return { id: 'PF10', status: 'pass', message: 'No template-required sections to check' };
  }

  const stripped = stripFences(content);
  const missing  = [];

  for (const section of requiredSections) {
    const namePattern = section.name
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s+');
    // (?=\s|$) instead of \b: \b fails to match when the section name ends
    // in punctuation (e.g. a name ending in ')'), since \b requires a
    // word-char/non-word-char transition and ')' is already a non-word char.
    // $ is safe here (not just end-of-string) because the 'm' flag makes it
    // match end-of-line.
    const headingRe = new RegExp(`^##\\s+${namePattern}(?=\\s|$)`, 'im');

    if (!headingRe.test(stripped)) {
      missing.push(section.name);
    }
  }

  if (missing.length > 0) {
    return { id: 'PF10', status: 'fail', message: `Missing required section(s): ${missing.join(', ')}` };
  }
  return { id: 'PF10', status: 'pass', message: 'All template-required sections present' };
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatJson(report) {
  return JSON.stringify(report, null, 2);
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# Plan Format Validation Report');
  lines.push('');
  lines.push(`**Format floor:** ${report.passed ? 'PASS' : 'FAIL'} | ${report.summary.passed}/${report.summary.total} deterministic structure checks`);
  lines.push('');
  lines.push('_Format floor checks STRUCTURE only (headers, Contract presence, metadata). It does NOT judge render-vs-narrate or prose density — that is Step 3 gates G18–G21._');
  lines.push('');

  lines.push('| Check | Status | Message |');
  lines.push('|-------|--------|---------|');
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? 'PASS' : 'FAIL';
    lines.push(`| ${check.id} | ${icon} | ${check.message} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

try {
  const { projectRoot, filePath, outputFormat, requireScorecard, templatePath } = parseArgs(process.argv);

  if (!filePath) {
    process.stderr.write('validate-plan-format.js error: --file <path> is required\n');
    process.exit(2);
  }

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`validate-plan-format.js error: file not found: ${filePath}\n`);
    process.exit(2);
  }

  if (templatePath && !fs.existsSync(templatePath)) {
    process.stderr.write(`validate-plan-format.js error: template file not found: ${templatePath}\n`);
    process.exit(2);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const tasks   = extractTasks(content);

  const checks = [
    checkPF1(content),
    checkPF2(tasks),
    checkPF3(tasks),
    checkPF4(tasks),
    checkPF5(tasks),
    checkPF6(content),
    checkPF7(tasks),
  ];
  if (requireScorecard) checks.push(checkPF9(content));
  if (requireScorecard && templatePath) {
    const template = parseTemplate(templatePath);
    checks.push(checkPF10(content, template.sections));
  }

  const passed = checks.every(c => c.status === 'pass');
  const report = {
    passed,
    checks,
    summary: {
      total:  checks.length,
      passed: checks.filter(c => c.status === 'pass').length,
      failed: checks.filter(c => c.status === 'fail').length,
    },
  };

  if (outputFormat === 'markdown') {
    process.stdout.write(formatMarkdown(report) + '\n');
  } else {
    process.stdout.write(formatJson(report) + '\n');
  }

  process.exit(passed ? 0 : 1);
} catch (err) {
  process.stderr.write(`validate-plan-format.js error: ${err.message}\n`);
  process.exit(2);
}
