#!/usr/bin/env node
/**
 * dimension-to-instructions.js
 *
 * Deterministic generator that transforms a review-dimension markdown file
 * (`.sdlc/review-dimensions/<name>.md`) into its GitHub Copilot mirror
 * (`.github/instructions/<name>.instructions.md`).
 *
 * Implements R-copilot-mirror (issue #456). The field-mapping is the SAME
 * mechanical transform that setup-sdlc performs as LLM prose in
 * `setup-dimensions.md` Step 8 (the format authority). Extracting it into a
 * script makes it exec-testable and satisfies the `scripts-over-llm-logic`
 * guardrail. setup-sdlc adoption of this helper is a documented follow-up
 * (out of scope for #456).
 *
 * Field mapping (closed enumeration — matches setup-dimensions Step 8):
 *   triggers (array)      → applyTo (string)          : join with ","
 *   name                  → H1 "# <name> — Review Instructions"
 *   description           → opening body paragraph (used as-is)
 *   severity              → "Default severity: <value>" (default "medium")
 *   body "## Checklist"   → "## Checklist" with "- [ ] " → "- "
 *   body "## Severity Guide" → copied verbatim (only if present)
 *   skip-when (array)     → "## Note" advisory (only if present)
 *   max-files / requires-full-diff / model / effort → omitted
 *
 * No 4,000-char condensing logic (`yagni`): the generator performs the
 * mechanical transform and a length CHECK only. On overflow it warns to
 * stderr — it does NOT summarize or truncate.
 *
 * Common Review Instructions (R-common-prompt, issue #519): when the caller
 * passes commonContent (CLI: --common-file <path>), its text is injected into
 * the mirror under a "## Common Review Instructions" heading, placed after
 * the description/severity block and before the Checklist section. This is
 * KD3 (per-mirror injection) — each Copilot mirror is self-contained, since
 * Copilot instructions files are read independently (no shared preamble).
 *
 * Usage:
 *   node dimension-to-instructions.js --file <path-to-dimension.md> [--common-file <path>]
 *   cat dimension.md | node dimension-to-instructions.js              # read stdin
 *   The generated mirror is written to STDOUT. The LLM (harden Step 5b /
 *   setup Step 8) is responsible for the actual Write — subprocess FS writes
 *   don't persist anyway.
 *
 * Exit codes:
 *   0 = mirror emitted to stdout (a length-overflow warning on stderr does NOT
 *       change the exit code — the transform still succeeds)
 *   2 = usage error (missing input) or unparseable dimension (no frontmatter,
 *       missing required `name` or `triggers`)
 */

'use strict';

const path = require('node:path');

// Reuse the shared YAML helpers (DRY — same parser dimensions.js uses).
// Resolve relative to this file so it works from any cwd.
const { extractFrontmatter, extractBody, parseSimpleYaml } = require(
  path.join(__dirname, 'yaml.js'),
);

const COPILOT_CHAR_LIMIT = 4000;

/**
 * Extract a single "## <Heading>" section's inner content (without the heading
 * line itself) from a markdown body. Returns null when the section is absent.
 * The section runs until the next "## " heading at the same level or EOF.
 *
 * @param {string} body
 * @param {string} heading  exact heading text after "## " (e.g. "Checklist")
 * @returns {string|null}
 */
function extractSection(body, heading) {
  const lines = body.split('\n');
  const startRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}

/**
 * Transform a review-dimension markdown string into its Copilot instructions
 * mirror string. Pure function — no I/O.
 *
 * @param {string} dimensionContent  raw `.sdlc/review-dimensions/<name>.md`
 * @param {string} [commonContent]   optional raw content of `_common.md`
 *                                   (R-common-prompt). When non-blank, it is
 *                                   injected under a "## Common Review
 *                                   Instructions" heading, after the
 *                                   description/severity block and before
 *                                   the Checklist section (KD3).
 * @returns {string}                 the `.instructions.md` mirror content
 * @throws {Error}                   when frontmatter is missing or required
 *                                   fields (`name`, `triggers`) are absent
 */
function dimensionToInstructions(dimensionContent, commonContent) {
  const rawFm = extractFrontmatter(dimensionContent);
  if (rawFm == null) {
    throw new Error('dimensionToInstructions: missing YAML frontmatter block (--- delimiters)');
  }
  const fm = parseSimpleYaml(rawFm);
  const body = extractBody(dimensionContent);

  const name = typeof fm.name === 'string' ? fm.name.trim() : '';
  if (!name) {
    throw new Error('dimensionToInstructions: missing required frontmatter field "name"');
  }

  const triggers = Array.isArray(fm.triggers) ? fm.triggers : [];
  if (triggers.length === 0) {
    throw new Error('dimensionToInstructions: missing required frontmatter field "triggers" (non-empty array)');
  }
  const applyTo = triggers.join(',');

  const description = typeof fm.description === 'string' ? fm.description.trim() : '';
  // severity defaults to "medium" when absent (R-copilot-mirror / Task 6).
  const severity = typeof fm.severity === 'string' && fm.severity.trim()
    ? fm.severity.trim()
    : 'medium';

  const skipWhen = Array.isArray(fm['skip-when']) ? fm['skip-when'] : [];

  // --- Build the mirror ---------------------------------------------------
  const out = [];
  out.push('---');
  out.push(`applyTo: "${applyTo}"`);
  out.push('---');
  out.push(`# ${name} — Review Instructions`);
  out.push('');
  if (description) {
    out.push(description);
    out.push('');
  }
  out.push(`Default severity: ${severity}`);

  // Common Review Instructions (R-common-prompt) — injected per-mirror so
  // each Copilot instructions file is self-contained (KD3). Placed after
  // description/severity, before the Checklist section.
  if (typeof commonContent === 'string' && commonContent.trim()) {
    out.push('');
    out.push('## Common Review Instructions');
    out.push('');
    out.push(commonContent.trim());
  }

  // Checklist — strip "- [ ] " checkbox prefix to a plain "- " list item.
  const checklist = extractSection(body, 'Checklist');
  if (checklist) {
    out.push('');
    out.push('## Checklist');
    out.push('');
    out.push(checklist.replace(/^(\s*)-\s+\[[ xX]\]\s+/gm, '$1- '));
  }

  // Severity Guide — copied verbatim when present.
  const severityGuide = extractSection(body, 'Severity Guide');
  if (severityGuide) {
    out.push('');
    out.push('## Severity Guide');
    out.push('');
    out.push(severityGuide);
  }

  // Note — built from skip-when patterns when present (advisory; Copilot
  // path-specific instructions cannot express exclusions).
  if (skipWhen.length > 0) {
    out.push('');
    out.push('## Note');
    out.push('');
    out.push(
      `In Claude Code reviews, files matching these patterns are excluded: ${skipWhen.join(', ')}.`,
    );
    out.push(
      'Copilot path-specific instructions do not support exclusion patterns — use judgment when findings apply to these files.',
    );
  }

  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function readStdin() {
  try {
    return require('node:fs').readFileSync(0, 'utf8');
  } catch (e) {
    process.stderr.write('Error reading stdin: ' + e.message + '\n');
    return '';
  }
}

function main(argv) {
  const fileIdx = argv.indexOf('--file');
  let input;
  if (fileIdx !== -1) {
    const filePath = argv[fileIdx + 1];
    if (!filePath) {
      process.stderr.write('Error: --file requires a path argument\n');
      process.exit(2);
    }
    try {
      input = require('node:fs').readFileSync(filePath, 'utf8');
    } catch (e) {
      process.stderr.write(`Error: cannot read dimension file "${filePath}": ${e.message}\n`);
      process.exit(2);
    }
  } else {
    input = readStdin();
    if (!input || !input.trim()) {
      process.stderr.write('Error: no input. Pass --file <path> or pipe a dimension via stdin.\n');
      process.exit(2);
    }
  }

  const commonFileIdx = argv.indexOf('--common-file');
  let commonContent;
  if (commonFileIdx !== -1) {
    const commonFilePath = argv[commonFileIdx + 1];
    if (!commonFilePath) {
      process.stderr.write('Error: --common-file requires a path argument\n');
      process.exit(2);
    }
    try {
      commonContent = require('node:fs').readFileSync(commonFilePath, 'utf8');
    } catch (e) {
      process.stderr.write(`Error: cannot read common file "${commonFilePath}": ${e.message}\n`);
      process.exit(2);
    }
  }

  let mirror;
  try {
    mirror = dimensionToInstructions(input, commonContent);
  } catch (e) {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(2);
  }

  // Length CHECK only — warn on overflow, never condense (yagni).
  if (mirror.length > COPILOT_CHAR_LIMIT) {
    process.stderr.write(
      `Warning: generated mirror is ${mirror.length} chars, exceeding the ${COPILOT_CHAR_LIMIT}-char Copilot limit. ` +
        'Not condensed — review and trim the source dimension if needed.\n',
    );
  }

  process.stdout.write(mirror);
  process.exit(0);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { dimensionToInstructions, extractSection, COPILOT_CHAR_LIMIT };
