#!/usr/bin/env node
/**
 * check-docs-consistency.js
 * Validates content consistency between SKILL.md files and their documentation surfaces.
 *
 * Rules checked:
 *   1. user-invocable-match   — userInvocable in skills-meta.ts matches user-invocable
 *                               frontmatter in SKILL.md (for skills present in both)
 *   2. connections-valid      — every connections[].to slug in skills-meta.ts exists
 *                               as a slug entry in the same file
 *   3. doc-template-sections  — every docs/skills/<name>.md contains the required
 *                               template sections (Overview, Usage, Examples, Prerequisites,
 *                               What It Creates or Modifies, Related Skills)
 *   4. doc-flags-present      — skills with --flags in argument-hint have at least one
 *                               flag mentioned in their docs/skills/<name>.md
 *
 * Usage:
 *   node check-docs-consistency.js [--project-root <path>] [--json]
 *
 * Exit codes: 0 = all pass (or warnings only), 1 = errors found, 2 = script error
 * Output: human-readable report (default) or JSON array of findings
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = process.cwd();
  let jsonOutput  = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (args[i] === '--json') {
      jsonOutput = true;
    }
  }
  return { projectRoot, jsonOutput };
}

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function listDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function discoverSkills(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/skills');
  return listDir(dir)
    .filter(d => isDir(path.join(dir, d)))
    .map(d => ({ name: d, file: path.join(dir, d, 'SKILL.md') }))
    .filter(s => isFile(s.file));
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fm[key] = value;
  }
  return fm;
}

// ---------------------------------------------------------------------------
// skills-meta.ts parsing
// ---------------------------------------------------------------------------

/**
 * Parse skills-meta.ts and return:
 *   - slugs: Set of all slug values
 *   - entries: Map of slug -> { userInvocable, connections: [{to}] }
 *
 * Strategy: scan sequentially; when we see a slug, open a new entry.
 * Associate userInvocable and to: values with the most recently opened entry.
 */
function parseSkillsMeta(content) {
  const slugs   = new Set();
  const entries = new Map(); // slug -> { userInvocable, connections }

  const slugRe          = /slug:\s*'([^']+)'/g;
  const userInvocableRe = /userInvocable:\s*(true|false)/g;
  const toRe            = /to:\s*'([^']+)'/g;

  // Collect all slug positions
  const slugMatches = [];
  let m;
  while ((m = slugRe.exec(content)) !== null) {
    slugMatches.push({ slug: m[1], index: m.index });
    slugs.add(m[1]);
  }

  // For each slug, determine the range of content that belongs to it
  // (from its position to the start of the next slug, or end of file)
  for (let i = 0; i < slugMatches.length; i++) {
    const { slug, index } = slugMatches[i];
    const end = i + 1 < slugMatches.length ? slugMatches[i + 1].index : content.length;
    const chunk = content.slice(index, end);

    // Extract userInvocable from this chunk
    userInvocableRe.lastIndex = 0;
    const uiMatch = userInvocableRe.exec(chunk);
    const userInvocable = uiMatch ? uiMatch[1] === 'true' : null;

    // Extract all to: values from this chunk
    const connections = [];
    toRe.lastIndex = 0;
    let toMatch;
    while ((toMatch = toRe.exec(chunk)) !== null) {
      connections.push({ to: toMatch[1] });
    }

    entries.set(slug, { userInvocable, connections });
  }

  return { slugs, entries };
}

// ---------------------------------------------------------------------------
// Rule 1 — user-invocable-match
// ---------------------------------------------------------------------------

/**
 * For skills present in both skills-meta.ts and plugins/sdlc-utilities/skills/,
 * verify that userInvocable in skills-meta.ts matches user-invocable in SKILL.md frontmatter.
 */
function checkUserInvocableMatch(skills, _metaPath, metaEntries, findings) {
  for (const skill of skills) {
    if (!metaEntries.has(skill.name)) continue; // not in skills-meta.ts — skip

    const content = readFile(skill.file);
    if (!content) continue;

    const fm = parseFrontmatter(content);
    const fmValue = fm['user-invocable'];
    if (fmValue === undefined) continue; // no user-invocable field — skip

    const fmBool   = fmValue === 'true';
    const metaEntry = metaEntries.get(skill.name);
    if (metaEntry.userInvocable === null) continue; // could not parse from meta

    if (fmBool !== metaEntry.userInvocable) {
      findings.push({
        rule: 'user-invocable-match',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skill.name}': user-invocable is '${fmValue}' in SKILL.md but userInvocable is ${metaEntry.userInvocable} in skills-meta.ts. Sync them — SKILL.md frontmatter is the source of truth.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 2 — connections-valid
// ---------------------------------------------------------------------------

/**
 * Every connections[].to slug in skills-meta.ts must exist as a slug in the same file.
 */
function checkConnectionsValid(metaPath, slugs, entries, findings) {
  for (const [slug, entry] of entries) {
    for (const conn of entry.connections) {
      if (!slugs.has(conn.to)) {
        findings.push({
          rule: 'connections-valid',
          severity: 'error',
          file: path.relative(process.cwd(), metaPath),
          message: `Skill '${slug}' has a connection to '${conn.to}' which is not a known slug in skillsMeta. Fix the typo or add the missing entry.`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 3 — doc-template-sections
// ---------------------------------------------------------------------------

const REQUIRED_SECTIONS = [
  'Overview',
  'Usage',
  'Examples',
  'Prerequisites',
  'What It Creates or Modifies',
  'Related Skills',
];

/**
 * Every docs/skills/<name>.md must contain the required template section headings.
 * Flags is NOT required — some skills have no flags.
 */
function checkDocTemplateSections(projectRoot, findings) {
  const docsDir = path.join(projectRoot, 'docs/skills');
  const files   = listDir(docsDir).filter(f => f.endsWith('.md'));

  for (const fname of files) {
    const filePath = path.join(docsDir, fname);
    const content  = readFile(filePath);
    if (!content) continue;

    // Extract all h2 headings
    const headingRe = /^##\s+(.+)$/gm;
    const headings  = new Set();
    let hm;
    while ((hm = headingRe.exec(content)) !== null) {
      headings.add(hm[1].trim().toLowerCase());
    }

    for (const required of REQUIRED_SECTIONS) {
      if (!headings.has(required.toLowerCase())) {
        findings.push({
          rule: 'doc-template-sections',
          severity: 'warning',
          file: path.relative(process.cwd(), filePath),
          message: `Missing required section '## ${required}'. Add it using docs/skill-doc-template.md as reference.`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 4 — doc-flags-present
// ---------------------------------------------------------------------------

/**
 * For each skill with --flags in argument-hint, at least one flag must appear
 * in the corresponding docs/skills/<name>.md.
 */
function checkDocFlagsPresent(skills, projectRoot, findings) {
  const docsDir = path.join(projectRoot, 'docs/skills');

  for (const skill of skills) {
    const content = readFile(skill.file);
    if (!content) continue;

    const fm = parseFrontmatter(content);
    const hint = fm['argument-hint'];
    if (!hint) continue;

    // Extract --flag tokens from argument-hint
    const flagRe = /--[\w-]+/g;
    const flags  = [];
    let fm2;
    while ((fm2 = flagRe.exec(hint)) !== null) {
      flags.push(fm2[0]);
    }
    if (flags.length === 0) continue; // no -- flags — skip

    const docPath    = path.join(docsDir, skill.name + '.md');
    const docContent = readFile(docPath);
    if (!docContent) continue; // doc missing — handled by docs-skill-existence in other script

    const anyFlagPresent = flags.some(flag => docContent.includes(flag));
    if (!anyFlagPresent) {
      findings.push({
        rule: 'doc-flags-present',
        severity: 'warning',
        file: path.relative(process.cwd(), docPath),
        message: `Skill '${skill.name}' has flags [${flags.join(', ')}] in argument-hint but none appear in the doc. Add a Flags table using docs/skill-doc-template.md as reference.`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { projectRoot, jsonOutput } = parseArgs(process.argv);

  const pluginRoot = path.join(projectRoot, 'plugins/sdlc-utilities');
  if (!isDir(pluginRoot)) {
    process.stderr.write(`ERROR: Plugin directory not found: ${pluginRoot}\n`);
    process.stderr.write(`Run this script from the sdlc-marketplace repository root, or pass --project-root.\n`);
    process.exit(2);
  }

  const metaPath = path.join(projectRoot, 'site/src/data/skills-meta.ts');
  const metaContent = readFile(metaPath);
  if (!metaContent) {
    process.stderr.write(`ERROR: Could not read ${metaPath}\n`);
    process.exit(2);
  }

  const skills             = discoverSkills(projectRoot);
  const { slugs, entries } = parseSkillsMeta(metaContent);

  const findings = [];

  checkUserInvocableMatch(skills, metaPath, entries, findings);
  checkConnectionsValid(metaPath, slugs, entries, findings);
  checkDocTemplateSections(projectRoot, findings);
  checkDocFlagsPresent(skills, projectRoot, findings);

  const errors   = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    process.exit(errors.length > 0 ? 1 : 0);
  }

  // Human-readable output
  if (findings.length === 0) {
    process.stdout.write('✓ All doc consistency checks passed.\n');
    process.exit(0);
  }

  process.stdout.write(`Doc consistency check: ${errors.length} error(s), ${warnings.length} warning(s)\n\n`);

  for (const f of findings) {
    const loc  = f.line ? `:${f.line}` : '';
    const icon = f.severity === 'error' ? '✗' : '⚠';
    process.stdout.write(`${icon} [${f.rule}] ${f.file}${loc}\n  ${f.message}\n\n`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
