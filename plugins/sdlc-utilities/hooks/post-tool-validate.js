#!/usr/bin/env node
/**
 * post-tool-validate.js
 * PostToolUse hook — validates edited files against known schemas.
 *
 * Fires on Edit|Write tool events. Reads JSON from stdin to extract the
 * file path, then runs the appropriate validator script if the path matches
 * a known pattern.
 *
 * Patterns:
 *   .sdlc/review-dimensions/*.ya?ml   → validate-dimensions.js (canonical, issue #231)
 *   .claude/review-dimensions/*.ya?ml → validate-dimensions.js (legacy, deprecated; dropped in 0.21.x)
 *   .sdlc/pr-template.md              → validate-pr-template.js (canonical, issue #260)
 *   .claude/pr-template.md            → validate-pr-template.js (legacy, deprecated)
 *   plans/*.md                        → validate-plan-format.js
 *
 * Exit codes:
 *   0 = clean or no match (always safe to continue)
 *   2 = validation found issues (surfaced to Claude as feedback)
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const fs           = require('node:fs');
const path         = require('node:path');
const { execFileSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Read stdin
// ---------------------------------------------------------------------------

let input = {};
try {
  const raw = fs.readFileSync('/dev/stdin', 'utf8');
  if (raw.trim()) {
    input = JSON.parse(raw);
  }
} catch {
  // Unparseable or missing stdin — exit silently
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Extract file path from tool_input
// The PostToolUse schema is not publicly documented; try known field names.
// ---------------------------------------------------------------------------

const toolInput = input.tool_input || {};
const filePath  = toolInput.file_path || toolInput.path || null;

if (!filePath) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

// Issue #231: dual-match for two minor versions (0.19.x, 0.20.x). Drop the
// `.claude/` alternation in 0.21.x.
const DIMENSION_RE   = /[/\\]\.(?:claude|sdlc)[/\\]review-dimensions[/\\][^/\\]+\.ya?ml$/;
// Issue #260: dual-match canonical .sdlc/ and deprecated .claude/.
const PR_TEMPLATE_RE = /[/\\]\.(?:claude|sdlc)[/\\]pr-template\.md$/;
const PLAN_RE        = /[/\\]plans[/\\][^/\\]+\.md$/;

const isDimension  = DIMENSION_RE.test(filePath);
const isPrTemplate = PR_TEMPLATE_RE.test(filePath);
const isPlan       = PLAN_RE.test(filePath);

if (!isDimension && !isPrTemplate && !isPlan) {
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Locate validator scripts (../scripts/ relative to this hook file)
// ---------------------------------------------------------------------------

const scriptsDir = path.resolve(__dirname, '..', 'scripts');

let validatorScript;
if (isDimension) {
  validatorScript = path.join(scriptsDir, 'ci', 'validate-dimensions.js');
} else if (isPrTemplate) {
  validatorScript = path.join(scriptsDir, 'ci', 'validate-pr-template.js');
} else {
  validatorScript = path.join(scriptsDir, 'ci', 'validate-plan-format.js');
}

// Use the project root from cwd (where Claude runs the hook)
// KEEP: hook entry point — do not change to resolveSdlcRoot()
const projectRoot = process.cwd();

// ---------------------------------------------------------------------------
// Run validator
// ---------------------------------------------------------------------------

try {
  const args = [validatorScript, '--project-root', projectRoot, '--markdown'];
  if (isPlan) args.push('--file', filePath);
  execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  // Exit 0 from validator — all good
  process.exit(0);
} catch (err) {
  // execFileSync throws when exit code is non-zero
  const stdout = (err.stdout || '').trim();
  const stderr = (err.stderr || '').trim();
  const findings = stdout || stderr;

  if (findings) {
    process.stderr.write(findings + '\n');
  }

  // Exit 2 surfaces the feedback to Claude (PostToolUse convention)
  process.exit(2);
}
