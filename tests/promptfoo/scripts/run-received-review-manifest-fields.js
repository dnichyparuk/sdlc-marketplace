#!/usr/bin/env node
/**
 * run-received-review-manifest-fields.js
 * Test harness that exercises manifest fields computed by received-review.js
 * without invoking gh API or git. Supports:
 *
 *   plugin_version   — getPluginVersion() result (issue #363)
 *   reply_footer     — pre-composed footer string (issue #363)
 *   hardenSurfaceHint — inferHardenSurfaceHint() result for a test comment body
 *                       indexed by --thread-index (issue #429)
 *
 * Usage:
 *   node run-received-review-manifest-fields.js --field <field> [--thread-index <n>]
 *
 * Output:
 *   The raw value of the requested field (string, not JSON-encoded).
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const LIB = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib');
const configVersionPath = path.join(LIB, 'config-version.js');
const receivedReviewPath = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'received-review.js');

const { getPluginVersion } = require(configVersionPath);
const { inferHardenSurfaceHint } = require(receivedReviewPath);

// Test comment bodies indexed by --thread-index (issue #429 inference tests)
const TEST_COMMENT_BODIES = [
  'The .sdlc/review-dimensions/security.md file needs an injection-attack trigger added to its triggers list.',
  'The plan.guardrails array is missing a test-coverage-required rule; new source files can ship untested.',
  'The execute.guardrails array lacks a wave-failure-halts-pipeline rule.',
  'The .github/instructions/general.instructions.md is missing OWASP security guidance.',
];

const VALID_HARDEN_SURFACE_HINTS = new Set(['review-dimensions', 'plan-guardrails', 'execute-guardrails', 'copilot-instructions', null]);

const argv = process.argv.slice(2);
let field = null;
let threadIndex = 0;
let withExpected = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--field' && argv[i + 1]) field = argv[++i];
  else if (argv[i] === '--thread-index' && argv[i + 1]) threadIndex = parseInt(argv[++i], 10);
  else if (argv[i] === '--with-expected') withExpected = true;
}

if (!field) {
  process.stderr.write('Usage: run-received-review-manifest-fields.js --field <plugin_version|reply_footer|hardenSurfaceHint> [--thread-index <n>] [--with-expected]\n');
  process.exit(1);
}

// Emit the raw field text, or {value, expected} when --with-expected is set,
// where expected is the version read straight from plugin.json.
function emitField(value) {
  if (!withExpected) {
    process.stdout.write(value);
    return;
  }
  const pluginJsonPath = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', '.claude-plugin', 'plugin.json');
  const expected = JSON.parse(require('fs').readFileSync(pluginJsonPath, 'utf8')).version;
  process.stdout.write(JSON.stringify({ value, expected }));
}

if (field === 'plugin_version') {
  emitField(getPluginVersion());
} else if (field === 'reply_footer') {
  const pluginVersion = getPluginVersion();
  // Format mirrors the production source: plugins/sdlc-utilities/scripts/skill/received-review.js
  emitField('\n\n_via `received-review-sdlc` v' + pluginVersion + '_');
} else if (field === 'hardenSurfaceHint') {
  const body = TEST_COMMENT_BODIES[threadIndex] || TEST_COMMENT_BODIES[0];
  // Empty knownData — inference relies on text matching only (KD6 priority 1/2/3/4).
  const emptyKnown = { dimensionNames: new Set(), planGuardrailIds: new Set(), executeGuardrailIds: new Set() };
  const hint = inferHardenSurfaceHint(body, emptyKnown);
  if (!VALID_HARDEN_SURFACE_HINTS.has(hint)) {
    process.stderr.write('ERROR: inferHardenSurfaceHint returned out-of-enum value: ' + JSON.stringify(hint) + '\n');
    process.exit(1);
  }
  process.stdout.write(hint === null ? 'null' : hint);
} else {
  process.stderr.write('Unknown field: ' + field + '\n');
  process.exit(1);
}
