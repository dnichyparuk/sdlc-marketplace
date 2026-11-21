/**
 * pipeline-advancing-test.js — exercise the pure pipelineAdvancing export in lib/state.js.
 *
 * Used by datasets/ship-state-exec.yaml pipelineAdvancing cases via
 *   script_path: "repo://tests/promptfoo/scripts/pipeline-advancing-test.js".
 * The lib path is resolved relative to this script's real __dirname so it works
 * regardless of cwd.
 *
 * Usage:
 *   node pipeline-advancing-test.js --data '<json ship-state-like object with steps[]>'
 *
 * Prints {ok:true, advancing:<bool>, step:<name|null>, index:<int>} on stdout.
 * pipelineAdvancing is pure (no I/O), so no fixture is required.
 */
'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const LIB_PATH  = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'state.js');

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

const dataRaw = getArg('--data');
let data;
try {
  data = JSON.parse(dataRaw || '{}');
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: 'bad --data json: ' + e.message }));
  process.exit(0);
}

const { pipelineAdvancing } = require(LIB_PATH);

if (typeof pipelineAdvancing !== 'function') {
  console.log(JSON.stringify({ ok: false, error: 'pipelineAdvancing not exported' }));
  process.exit(0);
}

const r = pipelineAdvancing(data);
console.log(JSON.stringify({
  ok: true,
  advancing: r.advancing,
  step: r.step ? (r.step.name || r.step.id || null) : null,
  index: r.index,
}));
