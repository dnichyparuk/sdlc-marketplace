#!/usr/bin/env node
/**
 * run-schema-truth.js
 * Test harness asserting that a schema agrees with what its writer or consumer
 * really produces.
 *
 *   --surface execute-state
 *     Runs the real `state/execute.js init`, then compares the top-level keys
 *     of the state file it wrote with schemas/execute-state.schema.json.
 *     Output: {"surface":"execute-state","extraKeys":[],"planHashNullable":true}
 *
 *   --surface review-dimension
 *     Evaluates schemas/review-dimension.schema.json `properties.model`
 *     (keywords type, enum, pattern, anyOf only) against known valid and
 *     invalid model values.
 *     Output: {"surface":"review-dimension","rejectedValid":[],"acceptedInvalid":[]}
 *
 * Exit 2 on a usage error, when `init` fails, or when a schema read or parse fails; exit 0 otherwise.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const USAGE = 'Usage: node run-schema-truth.js --surface execute-state|review-dimension\n';

const argv = process.argv.slice(2);
const idx = argv.indexOf('--surface');
const surface = idx === -1 ? undefined : argv[idx + 1];

if (surface !== 'execute-state' && surface !== 'review-dimension') {
  process.stderr.write(USAGE);
  process.exit(2);
}

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schemas', name), 'utf8'));
}

function allowsNull(prop) {
  if (!prop) return false;
  if (prop.type === 'null') return true;
  if (Array.isArray(prop.type) && prop.type.includes('null')) return true;
  return ['oneOf', 'anyOf'].some(
    (k) => Array.isArray(prop[k]) && prop[k].some(allowsNull)
  );
}

function executeStateSurface() {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-truth-'));
  try {
    const r = spawnSync(
      'node',
      [
        'plugins/sdlc-utilities/scripts/state/execute.js', 'init',
        '--branch', 'schema-truth',
        '--quality', 'balanced',
        '--total-tasks', '1',
        '--planned-task-ids', '["1"]',
        '--selection', '{"tasks":"1","fromWave":null,"taskIds":["1"]}',
      ],
      { cwd: REPO_ROOT, env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: T }, encoding: 'utf8' }
    );
    const file = fs.readdirSync(T).find((f) => /^execute-.*\.json$/.test(f));
    if (r.status !== 0 || !file) {
      process.stderr.write('init failed: ' + (r.stderr || '') + '\n');
      process.exitCode = 2;
      return null; // `finally` still removes T
    }
    const state = JSON.parse(fs.readFileSync(path.join(T, file), 'utf8'));
    const schema = readSchema('execute-state.schema.json');
    const props = schema.properties || {};
    return {
      surface,
      extraKeys: Object.keys(state).filter((k) => !Object.prototype.hasOwnProperty.call(props, k)),
      planHashNullable: allowsNull(props.planHash),
    };
  } finally {
    fs.rmSync(T, { recursive: true, force: true });
  }
}

function accepts(s, v) {
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
    if (!types.includes(t)) return false;
  }
  if (Array.isArray(s.enum) && !s.enum.includes(v)) return false;
  if (s.pattern !== undefined && !(typeof v === 'string' && new RegExp(s.pattern).test(v))) return false;
  if (Array.isArray(s.anyOf) && !s.anyOf.some((sub) => accepts(sub, v))) return false;
  return true;
}

function reviewDimensionSurface() {
  const model = readSchema('review-dimension.schema.json').properties.model;
  const valid = ['haiku', 'sonnet', 'opus', 'fable', 'claude-opus-4-1', 'claude-sonnet-4-5[1m]'];
  const invalid = ['gpt-4', 'Claude-opus', ''];
  return {
    surface,
    rejectedValid: valid.filter((v) => !accepts(model, v)),
    acceptedInvalid: invalid.filter((v) => accepts(model, v)),
  };
}

let result;
try {
  result = surface === 'execute-state' ? executeStateSurface() : reviewDimensionSurface();
} catch (err) {
  process.stderr.write(`schema-truth: ${err.message}\n`);
  process.exit(2);
}
if (result !== null) process.stdout.write(JSON.stringify(result) + '\n');
