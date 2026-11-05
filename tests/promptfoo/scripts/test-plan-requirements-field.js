#!/usr/bin/env node
/**
 * test-plan-requirements-field.js
 * Exercises plan.js --from-openspec to verify openspecContext.requirements (P18/P19)
 * and intakeAuditDispatch (P20) are emitted correctly.
 *
 * Usage:
 *   node test-plan-requirements-field.js \
 *     --project-root <path> \
 *     --change <name> \
 *     [--no-path]            -- removes openspec from PATH (simulate CLI-absent)
 *     [--check-dispatch-only] -- only report on intakeAuditDispatch shape
 *
 * Outputs a JSON report with boolean fields suitable for promptfoo icontains assertions.
 */
'use strict';

const path       = require('path');
const fs         = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}
function hasFlag(name) { return args.includes(name); }

const projectRoot      = getArg('--project-root');
const changeName       = getArg('--change');
const noPath           = hasFlag('--no-path');
const checkDispatchOnly = hasFlag('--check-dispatch-only');

if (!projectRoot || !changeName) {
  process.stderr.write('--project-root and --change are required\n');
  process.exit(1);
}

// Plan.js lives at the workspace root relative path
const REPO_ROOT   = path.resolve(__dirname, '../../..');
const PLAN_SCRIPT = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'plan.js');

// Inherit env but strip openspec from PATH when --no-path
const env = Object.assign({}, process.env);
if (noPath) {
  env.PATH = '/nonexistent-dir-only';
}
// Skip config check so the fixture doesn't need a full .sdlc/config.json
env.SDLC_SKIP_CONFIG_CHECK = '1';

// Run plan.js --from-openspec <change>
const result = spawnSync(
  process.execPath,
  [PLAN_SCRIPT, '--from-openspec', changeName],
  {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30000,
    env,
  }
);

let data;
try {
  data = JSON.parse(result.stdout);
} catch (_) {
  // plan.js may write to a temp file; try parsing as a path
  const trimmed = (result.stdout || '').trim();
  if (trimmed && fs.existsSync(trimmed)) {
    try {
      data = JSON.parse(fs.readFileSync(trimmed, 'utf8'));
    } catch (_2) {
      process.stderr.write(`parse error on file ${trimmed}: ${_2.message}\n`);
      process.stderr.write(`raw stdout: ${result.stdout}\n`);
      process.stderr.write(`raw stderr: ${result.stderr}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write(`parse error: ${_.message}\n`);
    process.stderr.write(`raw stdout: ${result.stdout}\n`);
    process.stderr.write(`raw stderr: ${result.stderr}\n`);
    process.exit(1);
  }
}

const ctx = data.openspecContext || {};
const iad = data.intakeAuditDispatch || null;

const dispatchReport = {
  intakeAuditDispatchPresent: iad !== null && typeof iad === 'object',
  intakeAuditModel:           iad ? iad.model : null,
  intakeAuditAgent:           iad ? iad.agent : null,
};

const report = checkDispatchOnly
  ? dispatchReport
  : {
      requirementsNull:          ctx.requirements === null || ctx.requirements === undefined,
      requirementsErrorPresent:  typeof ctx.requirementsError === 'string' && ctx.requirementsError.length > 0,
      requirementsArray:         Array.isArray(ctx.requirements),
      requirementsCount:         Array.isArray(ctx.requirements) ? ctx.requirements.length : 0,
      ...dispatchReport,
    };

console.log(JSON.stringify(report, null, 2));
