#!/usr/bin/env node
/**
 * validate-copilot-mirror.js
 *
 * Regenerate every Copilot instructions mirror from its review dimension and
 * report the mirrors that differ. Mirrors are opt-in: a dimension without a
 * `.github/instructions/<name>.instructions.md` file is skipped.
 *
 * Usage:
 *   node validate-copilot-mirror.js [options]
 *
 * Options:
 *   --root <path>   Project root (default: process.cwd())
 *   --json          Emit {"checked":[...],"drift":[...],"skipped":[...]} as JSON
 *
 * Output:
 *   One `DRIFT: <name>.instructions.md` line per drifted mirror, then
 *   `checked <n> mirror(s), <d> drift`. A regenerated mirror over the Copilot
 *   character limit adds a stderr `WARNING:` line; the size never changes the
 *   exit code.
 *
 * Exit codes:
 *   0 — clean (every existing mirror equals its regeneration)
 *   1 — drift
 *   2 — generator or IO error
 *
 * Reuses dimensionToInstructions from `lib/dimension-to-instructions.js` and
 * readCommonPrompt from `lib/dimensions.js`. Both line endings compare equal.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', 'lib');
const { dimensionToInstructions, COPILOT_CHAR_LIMIT } = require(path.join(LIB, 'dimension-to-instructions'));
const { readCommonPrompt } = require(path.join(LIB, 'dimensions'));

const COMMON_FILE = '_common.md';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = process.cwd();
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root' && args[i + 1]) {
      root = path.resolve(args[++i]);
    } else if (a === '--json') {
      json = true;
    }
  }

  return { root, json };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

function checkMirrors(root) {
  const dimensionsDir = path.join(root, '.sdlc', 'review-dimensions');
  const mirrorsDir = path.join(root, '.github', 'instructions');
  const common = readCommonPrompt(root);

  let files = [];
  try {
    files = fs.readdirSync(dimensionsDir).filter(f => f.endsWith('.md') && f !== COMMON_FILE).sort();
  } catch {
    files = [];
  }

  const checked = [];
  const drift = [];
  const skipped = [];
  const warnings = [];

  for (const file of files) {
    const name = path.basename(file, '.md');
    const mirrorFile = `${name}.instructions.md`;
    const mirrorPath = path.join(mirrorsDir, mirrorFile);
    if (!fs.existsSync(mirrorPath)) {
      skipped.push(name);
      continue;
    }

    const expected = normalize(dimensionToInstructions(fs.readFileSync(path.join(dimensionsDir, file), 'utf8'), common));
    const actual = normalize(fs.readFileSync(mirrorPath, 'utf8'));
    checked.push(mirrorFile);
    if (expected !== actual) drift.push(mirrorFile);
    if (expected.length > COPILOT_CHAR_LIMIT) {
      warnings.push(`WARNING: ${mirrorFile} is ${expected.length} chars, over the ${COPILOT_CHAR_LIMIT}-char Copilot limit`);
    }
  }

  return { checked, drift, skipped, warnings };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { root, json } = parseArgs(process.argv);

  let result;
  try {
    result = checkMirrors(root);
  } catch (err) {
    process.stderr.write(`validate-copilot-mirror: ${err.message}\n`);
    process.exit(2);
  }

  for (const w of result.warnings) process.stderr.write(w + '\n');

  if (json) {
    process.stdout.write(JSON.stringify({ checked: result.checked, drift: result.drift, skipped: result.skipped }) + '\n');
  } else {
    for (const m of result.drift) process.stdout.write(`DRIFT: ${m}\n`);
    process.stdout.write(`checked ${result.checked.length} mirror(s), ${result.drift.length} drift\n`);
  }

  process.exit(result.drift.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, checkMirrors };
