#!/usr/bin/env node
/**
 * run-ship-begin-complete.js
 * Test wrapper for state/ship.js begin-step / complete-step subcommands (R69, #452).
 *
 * Runs one or more begin-step/complete-step invocations against a fixture ship
 * state file (via --state-file), then emits a JSON object describing the result
 * (stdout from the LAST invocation, exit codes, and the post-run step status)
 * so all assertions can be `contains`/`javascript` checks over the JSON output.
 *
 * A wrapper is needed because: (a) some scenarios run TWO sequential commands
 * (begin then complete; or begin twice for idempotency) which a single
 * script-runner invocation cannot express, and (b) we want to assert the
 * post-mutation status persisted in the state file, not just stdout.
 *
 * Args:
 *   --project-root <path>   Fixture working dir (copied to tmp by the harness)
 *   --state-rel <path>      State file path relative to project-root
 *   --step <name>           Step name to operate on
 *   --scenario <name>       One of: begin | begin-twice | begin-then-complete |
 *                           begin-unknown | complete-unknown | complete-pending |
 *                           complete-with-usage | complete-bad-usage |
 *                           complete-usage-guard | complete-usage-guard-reverse
 *
 * Output JSON:
 *   {
 *     scenario, exitCodes: number[], lastStdout: string, lastStderr: string,
 *     finalStatus: string|null, finalStepFound: boolean,
 *     todosCount: number|null, finalUsage: object|null
 *   }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let stateRel = null;
let step = null;
let scenario = 'begin';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  else if (args[i] === '--state-rel' && args[i + 1]) stateRel = args[++i];
  else if (args[i] === '--step' && args[i + 1]) step = args[++i];
  else if (args[i] === '--scenario' && args[i + 1]) scenario = args[++i];
}

// Locate repo root with state/ship.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'ship.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  console.log(JSON.stringify({ error: 'Could not find repo root with state/ship.js' }));
  process.exit(0);
}

const shipScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'ship.js');
const stateFile = path.join(projectRoot, stateRel);

function run(subArgs) {
  return spawnSync('node', [shipScript, ...subArgs], {
    cwd: projectRoot,
    env: { ...process.env },
    encoding: 'utf8',
    timeout: 15_000,
  });
}

const exitCodes = [];
let last = null;

function record(res) {
  exitCodes.push(res.status ?? -1);
  last = res;
}

switch (scenario) {
  case 'begin':
    record(run(['begin-step', '--step', step, '--state-file', stateFile]));
    break;
  case 'begin-twice':
    record(run(['begin-step', '--step', step, '--state-file', stateFile]));
    record(run(['begin-step', '--step', step, '--state-file', stateFile]));
    break;
  case 'begin-then-complete':
    record(run(['begin-step', '--step', step, '--state-file', stateFile]));
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done']));
    break;
  case 'begin-unknown':
    record(run(['begin-step', '--step', step, '--state-file', stateFile]));
    break;
  case 'complete-unknown':
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'x']));
    break;
  case 'complete-pending':
    // complete-step on a step that was never begun (still pending). Should not
    // corrupt — the step is found and marked completed, OR (if a stricter guard
    // is added later) exits non-zero. Either way, assert no corruption.
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'x']));
    break;
  case 'complete-with-usage':
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', '{"inputTokens":10,"outputTokens":5,"model":"sonnet","effort":"medium"}']));
    break;
  case 'complete-bad-usage':
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', 'not-json']));
    break;
  case 'complete-usage-guard':
    // A hook-written subagent-stop value, then a self-report for the same step.
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', '{"inputTokens":99,"source":"subagent-stop"}']));
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', '{"inputTokens":1,"source":"self-report"}']));
    break;
  case 'complete-usage-guard-reverse':
    // A self-report first, then a hook-written subagent-stop value: the hook value wins.
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', '{"inputTokens":1,"source":"self-report"}']));
    record(run(['complete-step', '--step', step, '--state-file', stateFile, '--result', 'done',
      '--usage', '{"inputTokens":99,"source":"subagent-stop"}']));
    break;
  default:
    console.log(JSON.stringify({ error: `unknown scenario: ${scenario}` }));
    process.exit(0);
}

// Read final persisted status of the target step.
let finalStatus = null;
let finalStepFound = false;
let finalUsage = null;
try {
  const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const s = Array.isArray(data.steps) ? data.steps.find((x) => x.name === step) : null;
  if (s) { finalStepFound = true; finalStatus = s.status; finalUsage = s.usage ?? null; }
} catch (_) { /* state unreadable */ }

// Parse todos count from the last stdout (begin/complete print { todos, marker }).
let todosCount = null;
try {
  const parsed = JSON.parse((last.stdout || '').trim());
  if (parsed && Array.isArray(parsed.todos)) todosCount = parsed.todos.length;
} catch (_) { /* last stdout was not JSON (error path) */ }

console.log(JSON.stringify({
  scenario,
  exitCodes,
  lastStdout: (last.stdout || '').trim(),
  lastStderr: (last.stderr || '').trim(),
  finalStatus,
  finalStepFound,
  todosCount,
  finalUsage,
}));
