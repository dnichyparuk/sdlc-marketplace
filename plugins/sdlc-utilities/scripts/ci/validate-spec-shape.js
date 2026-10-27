#!/usr/bin/env node
/**
 * validate-spec-shape.js
 *
 * Check that every `docs/specs/*.md` follows the contract shape defined in
 * `docs/spec-template.md`, and that every requirement id cited by a skill or
 * agent markdown file is defined in some spec.
 *
 * Usage:
 *   node validate-spec-shape.js [options]
 *
 * Options:
 *   --root <path>   Project root (default: main worktree root via resolveSdlcRoot())
 *   --strict        Treat LEGACY_SHAPE (spec not yet contract-shaped) as an error
 *   --json          Emit findings as JSON instead of human-readable lines
 *
 * Exit codes:
 *   0 — clean (LEGACY_SHAPE only emitted to stderr unless --strict)
 *   1 — shape or citation findings, or (with --strict) legacy specs
 *   2 — parse / IO error
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', 'lib');
const { resolveSdlcRoot } = require(path.join(LIB, 'config'));

const CONTRACT_HEADINGS = [
  'Inputs and flags',
  'State model',
  'Step composition',
  'Dispatch and routing',
  'Gates',
  'Prepare script contract',
  'Failure handling and resume',
  'Invariants and constraints',
  'Integration',
  'Appendix — history',
];

const APPENDIX = 'Appendix — history';
const PREPARE_SECTION = 'Prepare script contract';
const FIRST_SECTION = 'Inputs and flags';

const ID_RE = /^\s*- (R\d+[a-z]?|R-[A-Za-z0-9_-]+|A\d+|G\d+[a-z]?|PF\d+|P\d+|P-[A-Z]+-\d+|E\d+|C\d+|C-[A-Z]+-\d+|I\d+)[:( ]/;
const RID_CITATION_RE = /\bR(?:\d+[a-z]?|-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*)\b/g;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = null;
  let strict = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root' && args[i + 1]) {
      root = path.resolve(args[++i]);
    } else if (a === '--strict') {
      strict = true;
    } else if (a === '--json') {
      json = true;
    }
  }

  if (!root) root = resolveSdlcRoot();
  return { root, strict, json };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function splitLines(text) {
  return text.split(/\r?\n/);
}

/** Yield [lineNumber (1-based), text] for lines outside fenced code blocks. */
function bodyLines(lines) {
  const out = [];
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out.push([i + 1, lines[i]]);
  }
  return out;
}

function extractDefinitions(lines) {
  const defs = new Map();
  for (const [n, text] of bodyLines(lines)) {
    const m = ID_RE.exec(text);
    if (!m) continue;
    if (!defs.has(m[1])) defs.set(m[1], []);
    defs.get(m[1]).push(n);
  }
  return defs;
}

/** Ids defined under `### Withdrawn`, up to the next heading line. */
function withdrawnIds(lines) {
  const ids = new Set();
  let inWithdrawn = false;
  for (const [, text] of bodyLines(lines)) {
    if (text.trimEnd() === '### Withdrawn') { inWithdrawn = true; continue; }
    if (text.startsWith('#')) { inWithdrawn = false; continue; }
    if (!inWithdrawn) continue;
    const m = ID_RE.exec(text);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function isContractShaped(lines) {
  return bodyLines(lines).some(([, text]) => text.trimEnd() === '## ' + FIRST_SECTION);
}

function preparePathIsNone(lines) {
  for (const [, text] of bodyLines(lines)) {
    const m = /^\*\*Prepare script:\*\*\s*(.*?)\s*$/.exec(text);
    if (m) return m[1].replace(/`/g, '').toLowerCase() === 'none';
  }
  return false;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkShape(name, lines) {
  if (!isContractShaped(lines)) {
    return [{
      kind: 'LEGACY_SHAPE',
      spec: name,
      line: null,
      message: 'no "## Inputs and flags" section — spec is not contract-shaped yet',
    }];
  }

  const findings = [];
  const body = bodyLines(lines);
  const add = (kind, line, message) => findings.push({ kind, spec: name, line, message });

  // Headings: known and in order
  const seen = [];
  let lastIdx = -1;
  for (const [n, text] of body) {
    const m = /^## (.*?)\s*$/.exec(text);
    if (!m) continue;
    const heading = m[1];
    const idx = CONTRACT_HEADINGS.indexOf(heading);
    if (seen.includes(heading)) { add('DUPLICATE_SECTION', n, `section "## ${heading}" appears more than once`); continue; }
    seen.push(heading);
    if (idx === -1) {
      add('HEADING_ORDER', n, `unknown section "## ${heading}" — not a contract heading`);
    } else if (idx < lastIdx) {
      add('HEADING_ORDER', n, `section "## ${heading}" is out of order`);
    } else {
      lastIdx = idx;
    }
  }

  // Required sections
  const prepareOptional = preparePathIsNone(lines);
  for (const heading of CONTRACT_HEADINGS) {
    if (heading === APPENDIX) continue;
    if (heading === PREPARE_SECTION && prepareOptional) continue;
    if (!seen.includes(heading)) add('MISSING_SECTION', null, `required section "## ${heading}" is absent`);
  }

  // Body vs appendix
  let inAppendix = false;
  for (const [n, text] of body) {
    if (text.trimEnd() === '## ' + APPENDIX) inAppendix = true;
    if (/^\*\*Model:\*\*/.test(text)) add('MODEL_HEADER', n, 'tuning value in header — model belongs in frontmatter / docs/cost-tiers.md');
    if (inAppendix) continue;
    if (/#\d+/.test(text)) add('ISSUE_REF', n, 'GitHub issue number in body — move it to the appendix Issue trail');
    if (/\(removed\b/.test(text)) add('WITHDRAWN_IN_BODY', n, 'withdrawn entry in body — move it to the appendix Withdrawn list');
  }

  // Duplicate ids
  for (const [id, nums] of extractDefinitions(lines)) {
    if (nums.length > 1) add('DUPLICATE_ID', nums[1], `id ${id} defined on lines ${nums.join(', ')}`);
  }

  return findings;
}

function listMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

function resolveSkillsDir(root) {
  const real = path.join(root, 'plugins', 'sdlc-utilities', 'skills');
  if (fs.existsSync(real)) return real;
  const flat = path.join(root, 'skills');
  if (fs.existsSync(flat)) return flat;
  return null;
}

function resolveAgentsDir(root) {
  const real = path.join(root, 'plugins', 'sdlc-utilities', 'agents');
  if (fs.existsSync(real)) return real;
  const flat = path.join(root, 'agents');
  if (fs.existsSync(flat)) return flat;
  return null;
}

function citedFiles(root) {
  const files = [];
  const skillsDir = resolveSkillsDir(root);
  if (skillsDir) {
    for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory()) files.push(...listMarkdown(path.join(skillsDir, e.name)));
    }
  }
  const agentsDir = resolveAgentsDir(root);
  if (agentsDir) files.push(...listMarkdown(agentsDir));
  return files;
}

function checkCitations(root, allDefinedRids) {
  const findings = [];
  for (const file of citedFiles(root)) {
    const lines = splitLines(fs.readFileSync(file, 'utf8'));
    const cited = new Set();
    for (const [, text] of bodyLines(lines)) {
      for (const m of text.matchAll(RID_CITATION_RE)) cited.add(m[0]);
    }
    const rel = path.relative(root, file).split(path.sep).join('/');
    for (const id of [...cited].sort()) {
      if (allDefinedRids.has(id)) continue;
      findings.push({
        kind: 'UNRESOLVED_RID',
        file: rel,
        line: null,
        message: `${rel} cites ${id} — not defined in any docs/specs/*.md`,
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function formatFinding(f) {
  if (f.kind === 'UNRESOLVED_RID') return `UNRESOLVED_RID: ${f.message}`;
  return `${f.kind}: ${f.spec}${f.line ? ':' + f.line : ''} — ${f.message}`;
}

function main() {
  const { root, strict, json } = parseArgs(process.argv);

  const specsDir = path.join(root, 'docs', 'specs');
  let specFiles;
  try {
    specFiles = listMarkdown(specsDir);
  } catch (err) {
    process.stderr.write(`validate-spec-shape: cannot read ${specsDir}: ${err.message}\n`);
    process.exit(2);
  }

  const findings = [];
  const contractShaped = [];
  const legacy = [];
  const allRids = new Set();

  try {
    for (const file of specFiles) {
      const name = path.basename(file, '.md');
      const lines = splitLines(fs.readFileSync(file, 'utf8'));
      const withdrawn = withdrawnIds(lines);
      for (const id of extractDefinitions(lines).keys()) {
        if (id.startsWith('R') && !withdrawn.has(id)) allRids.add(id);
      }
      (isContractShaped(lines) ? contractShaped : legacy).push(name);
      findings.push(...checkShape(name, lines));
    }
    findings.push(...checkCitations(root, allRids));
  } catch (err) {
    process.stderr.write(`validate-spec-shape: ${err.message}\n`);
    process.exit(2);
  }

  const legacyFindings = findings.filter((f) => f.kind === 'LEGACY_SHAPE');
  const hard = findings.filter((f) => f.kind !== 'LEGACY_SHAPE');
  const failing = hard.length > 0 || (strict && legacyFindings.length > 0);

  if (json) {
    process.stdout.write(JSON.stringify({ findings, contractShaped, legacy }, null, 2) + '\n');
  } else {
    for (const f of hard) process.stdout.write(formatFinding(f) + '\n');
    const sink = strict ? process.stdout : process.stderr;
    for (const f of legacyFindings) sink.write(formatFinding(f) + '\n');
  }

  process.exit(failing ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, CONTRACT_HEADINGS, extractDefinitions, withdrawnIds, checkShape, checkCitations };
