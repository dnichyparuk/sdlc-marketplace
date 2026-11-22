#!/usr/bin/env node
/**
 * run-ship-hooks-case.js
 * Test wrapper for the program cases of datasets/ship-hooks-exec.yaml (pipeline-continue,
 * stop-pipeline-continue, hookEnforcementAllowed, claimSession, cap-exhaustion, hook-runner).
 *
 * Each case spawns the ship hooks, the ship state CLI or skill/ship.js in the fixture working dir
 * (the case's script_cwd; the wrapper never changes directory), or calls a lib/state.js export, and
 * prints one JSON line that the case's assertions read. Every case was a `node -e` program before;
 * the output is byte-compatible with it. The hook-runner provider also reports stderr and the exit
 * code, so the wrapper writes nothing of its own to stderr and exits 0 on every case.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   r67-second-call-silent: pipeline-continue (R67): second call same step emits nothing
 *   cap-silences-after-three: stop-pipeline-continue (Task 6, #505): consecutive-block cap silences after 3 unchanged blocks
 *   cap-reset-on-step-change: stop-pipeline-continue (Task 6, #505): consecutive-block counter resets on step change
 *   w42-history-current-step-blocks: stop-pipeline-continue (W4.2): ledger with history and currentStep, non-auto in_progress blocks
 *   r110-live-agent-silences: stop-pipeline-continue (R110): live ship step agent silences the in_progress block, cap counter untouched
 *   r110-start-stop-blocks: stop-pipeline-continue (R110): start then stop for the same agent id blocks again
 *   r110-stale-marker-blocks: stop-pipeline-continue (R110): a marker whose only agent started 3 hours ago does not silence the block
 *   r110-general-purpose-no-marker: stop-pipeline-continue (R110): a general-purpose agent writes no marker and the hook blocks
 *   enforcement-match: hookEnforcementAllowed (R73, #505): matching session ids allows enforcement (payload.cwd ignored)
 *   enforcement-mismatch: hookEnforcementAllowed (R73, #505): mismatched session ids denies enforcement
 *   enforcement-state-absent: hookEnforcementAllowed (R73, #505): state sessionId absent denies enforcement
 *   enforcement-payload-absent: hookEnforcementAllowed (R73, #505): payload session_id absent denies enforcement
 *   claim-implicit-resume: claimSession (R73, #505): implicit resume reclaims sessionId for the resuming session
 *   claim-explicit-resume: claimSession (R73, #505): explicit --resume reclaims sessionId for the resuming session
 *   r73-reclaimed-still-nudges: pipeline-continue (R73, #505): reclaimed pipeline still nudges the resuming session
 *   cap-exhaustion-sidecar: cap-exhaustion: consecutive-block cap leaves the step in_progress and writes the cap-exhausted sidecar
 *   cap-exhaustion-fifth-run-silent: cap-exhaustion: fifth Stop run after exhaustion prints nothing
 *   pause-state-cli-silences: stop-pipeline-continue (R-pause): paused state stays silent
 *   pause-silences-both-hooks: stop-pipeline-continue (R-pause): state with paused set silences both hooks
 *   pause-begin-step-clears: stop-pipeline-continue (R-pause): begin-step clears paused
 *   pause-claim-session-clears: stop-pipeline-continue (R-pause): claimSession clears paused
 *   w25-no-execution-dir-silent: stop-pipeline-continue (W2.5): hooks in a repo without .sdlc/execution exit 0 silently
 *   w25-no-git-fallback: stop-pipeline-continue (W2.5): no .git anywhere falls back and exits 0 silently
 *   hook-runner-temp-cwd: hook-runner: a case without script_cwd runs in a removed temp dir with git defaults
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-ship-hooks-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with hooks/pipeline-continue.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'hooks', 'pipeline-continue.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with hooks/pipeline-continue.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const HOOKS = path.join(PLUGIN, 'hooks');
const POST_HOOK = path.join(HOOKS, 'pipeline-continue.js');
const STOP_HOOK = path.join(HOOKS, 'stop-pipeline-continue.js');
const TRACK_HOOK = path.join(HOOKS, 'subagent-track.js');
const STATE_LIB = path.join(PLUGIN, 'scripts', 'lib', 'state.js');
const STATE_CLI = path.join(PLUGIN, 'scripts', 'state', 'ship.js');
const SHIP = path.join(PLUGIN, 'scripts', 'skill', 'ship.js');

// Ledgers inside the fixture working dir.
const FEAT_SHIP_LEDGER = 'ship-feat-ship-20260608T120000Z.json';
const MAIN_LEDGER = 'ship-main-20260101T000000Z.json';

const STOP_PAYLOAD = { stop_hook_active: false, session_id: 'sess-fixture' };
const POST_PAYLOAD = { tool_name: 'Bash', session_id: 'sess-fixture' };

function print(value) {
  console.log(JSON.stringify(value));
}

function executionFile(name) {
  return path.join(process.cwd(), '.sdlc', 'execution', name);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value));
}

// Runs `node <args>` with `payload` as JSON on stdin, in the fixture working dir unless `cwd` is given.
function runNode(args, payload, { cwd = process.cwd(), env } = {}) {
  const options = { input: JSON.stringify(payload), cwd, encoding: 'utf8' };
  if (env) options.env = env;
  return cp.spawnSync('node', args, options);
}

function runHook(hook, payload, options) {
  return runNode([hook], payload, options);
}

// Runs the state CLI without stdin, as the old programs did.
function runStateCli(args) {
  return cp.spawnSync('node', [STATE_CLI, ...args], { encoding: 'utf8' });
}

function times(n, fn) {
  return Array.from({ length: n }, () => fn());
}

function record(r) {
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function shortRecord(r) {
  return { status: r.status, stdout: r.stdout };
}

// R110: copies the fixture's ship ledger into a fresh temp state dir, optionally seeds the live-agent
// marker, runs each [script, arg, payload] call with SDLC_STATE_DIR_OVERRIDE / SDLC_BRANCH_OVERRIDE
// pointing there, prints {runs, marker, counter} and removes the dir.
function stepLiveCase(calls, seedMarker) {
  const stateDir = fs.mkdtempSync(os.tmpdir() + '/step-live-');
  const env = Object.assign({}, process.env, { SDLC_STATE_DIR_OVERRIDE: stateDir, SDLC_BRANCH_OVERRIDE: 'feat/ship' });
  const markerPath = path.join(stateDir, '.step-agent-live-feat-ship.json');
  fs.copyFileSync(executionFile(FEAT_SHIP_LEDGER), path.join(stateDir, FEAT_SHIP_LEDGER));
  if (seedMarker) writeJson(markerPath, seedMarker());
  const runs = calls.map(([script, arg, payload]) => runNode([script, arg].filter(Boolean), payload, { env }));
  const result = {
    runs: runs.map(record),
    marker: fs.existsSync(markerPath),
    counter: fs.existsSync(path.join(stateDir, '.stop-block-count-feat-ship.json')),
  };
  fs.rmSync(stateDir, { recursive: true, force: true });
  print(result);
}

function hookEnforcement(data, payload) {
  print(require(STATE_LIB).hookEnforcementAllowed(data, payload));
}

// claimSession: stamps the resume fixture's ledger for session A, runs skill/ship.js under another
// session and reports {status, before, after} (after = the sessionId read back from disk).
function claimCase(shipArgs, sessionId) {
  const ledger = executionFile(MAIN_LEDGER);
  writeJson(ledger, {
    version: 1,
    startedAt: '2026-01-01T00:00:00Z',
    branch: 'main',
    flags: { auto: true, steps: ['commit'] },
    steps: [{ name: 'commit', status: 'pending' }],
    decisions: [],
    deferredFindings: [],
    sessionId: 'sess-A',
  });
  const ship = cp.spawnSync('node', [SHIP, ...shipArgs], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { CLAUDE_CODE_SESSION_ID: sessionId }),
    encoding: 'utf8',
  });
  print({ status: ship.status, before: 'sess-A', after: readJson(ledger).sessionId });
}

function setPaused(ledger, paused) {
  writeJson(ledger, Object.assign(readJson(ledger), { paused }));
}

function isPaused(ledger) {
  return readJson(ledger).paused !== undefined;
}

// W2.5: the two Stop hooks and the PostToolUse hook, each with its stdin payload.
const W25_HOOK_CALLS = [
  { hook: STOP_HOOK, payload: STOP_PAYLOAD },
  { hook: path.join(HOOKS, 'stop-plan-integrity.js'), payload: {} },
  { hook: POST_HOOK, payload: POST_PAYLOAD },
];

const CASES = {
  'r67-second-call-silent'() {
    print(times(2, () => runHook(POST_HOOK, POST_PAYLOAD)).map(record));
  },

  'cap-silences-after-three'() {
    print(times(4, () => runHook(STOP_HOOK, STOP_PAYLOAD)).map(record));
  },

  'cap-reset-on-step-change'() {
    const capped = times(4, () => runHook(STOP_HOOK, STOP_PAYLOAD));
    writeJson(executionFile(FEAT_SHIP_LEDGER), {
      version: 1,
      startedAt: '2026-06-08T12:00:00Z',
      branch: 'feat/ship',
      sessionId: 'sess-fixture',
      flags: { auto: true, steps: ['execute', 'commit', 'pr'] },
      steps: [
        { name: 'execute', status: 'completed' },
        { name: 'commit', status: 'in_progress' },
        { name: 'pr', status: 'pending' },
      ],
    });
    const afterReset = runHook(STOP_HOOK, STOP_PAYLOAD);
    print([...capped, afterReset].map(record));
  },

  'w42-history-current-step-blocks'() {
    writeJson(executionFile(FEAT_SHIP_LEDGER), {
      version: 1,
      startedAt: '2026-06-08T12:00:00Z',
      branch: 'feat/ship',
      sessionId: 'sess-fixture',
      flags: { auto: false, steps: ['execute', 'commit', 'pr'] },
      currentStep: 'commit',
      history: [{ step: 'execute', result: 'success', timestamp: '2026-06-08T12:05:00Z' }],
      steps: [
        { name: 'execute', status: 'completed' },
        { name: 'commit', status: 'in_progress' },
        { name: 'pr', status: 'pending' },
      ],
    });
    print(record(runHook(STOP_HOOK, STOP_PAYLOAD)));
  },

  'r110-live-agent-silences'() {
    stepLiveCase([
      [TRACK_HOOK, 'start', { agent_id: 'a1', agent_type: 'sdlc:ship-step-review', session_id: 'sess-fixture' }],
      [STOP_HOOK, '', STOP_PAYLOAD],
    ]);
  },

  'r110-start-stop-blocks'() {
    stepLiveCase([
      [TRACK_HOOK, 'start', { agent_id: 'a1', agent_type: 'sdlc:ship-step-review', session_id: 'sess-fixture' }],
      [TRACK_HOOK, 'stop', { agent_id: 'a1', agent_type: 'sdlc:ship-step-review', session_id: 'sess-fixture' }],
      [STOP_HOOK, '', STOP_PAYLOAD],
    ]);
  },

  'r110-stale-marker-blocks'() {
    const threeHoursMs = 108e5;
    stepLiveCase([[STOP_HOOK, '', STOP_PAYLOAD]], () => ({
      schemaVersion: 1,
      branch: 'feat/ship',
      agents: { a1: { agentType: 'sdlc:ship-step-review', startedAt: new Date(Date.now() - threeHoursMs).toISOString() } },
    }));
  },

  'r110-general-purpose-no-marker'() {
    stepLiveCase([
      [TRACK_HOOK, 'start', { agent_id: 'a1', agent_type: 'general-purpose', session_id: 'sess-fixture' }],
      [STOP_HOOK, '', STOP_PAYLOAD],
    ]);
  },

  'enforcement-match'() {
    hookEnforcement({ sessionId: 'sess-A' }, { session_id: 'sess-A', cwd: '/some/other/worktree' });
  },

  'enforcement-mismatch'() {
    hookEnforcement({ sessionId: 'sess-A' }, { session_id: 'sess-B' });
  },

  'enforcement-state-absent'() {
    hookEnforcement({}, { session_id: 'sess-A' });
  },

  'enforcement-payload-absent'() {
    hookEnforcement({ sessionId: 'sess-A' }, {});
  },

  // The ledger write must stay right before the ship.js spawn: resume.fresh is an mtime check.
  'claim-implicit-resume'() {
    claimCase(['--steps', 'commit'], 'sess-B');
  },

  'claim-explicit-resume'() {
    claimCase(['--resume', '--steps', 'commit'], 'sess-C');
  },

  'r73-reclaimed-still-nudges'() {
    const state = require(STATE_LIB);
    const claimed = state.claimSession('ship', 'feat-ship');
    const hook = runHook(POST_HOOK, { tool_name: 'Bash', tool_response: {}, session_id: 'sess-B' });
    print({ claimed, hook });
  },

  'cap-exhaustion-sidecar'() {
    times(4, () => runHook(STOP_HOOK, STOP_PAYLOAD));
    print({
      step: readJson(executionFile(FEAT_SHIP_LEDGER)).steps.find((s) => s.name === 'execute'),
      sidecar: readJson(executionFile('.stop-cap-exhausted-feat-ship.json')),
    });
  },

  'cap-exhaustion-fifth-run-silent'() {
    print(times(5, () => runHook(STOP_HOOK, STOP_PAYLOAD)).map(shortRecord));
  },

  'pause-state-cli-silences'() {
    const pause = runStateCli(['pause', '--reason', 'test', '--state-file', executionFile(FEAT_SHIP_LEDGER)]);
    const hook = runHook(STOP_HOOK, STOP_PAYLOAD);
    print([pause, hook].map(shortRecord));
  },

  'pause-silences-both-hooks'() {
    setPaused(executionFile(FEAT_SHIP_LEDGER), { at: '2026-01-01T00:00:00.000Z', reason: null });
    const runs = [runHook(STOP_HOOK, STOP_PAYLOAD), runHook(POST_HOOK, POST_PAYLOAD)];
    print(runs.map(shortRecord));
  },

  'pause-begin-step-clears'() {
    const ledger = executionFile(FEAT_SHIP_LEDGER);
    const pause = runStateCli(['pause', '--reason', 'test', '--state-file', ledger]);
    const pausedSet = isPaused(ledger);
    const begin = runStateCli(['begin-step', '--step', 'execute', '--state-file', ledger]);
    print({ pause: pause.status, pausedSet, begin: begin.status, pausedGone: !isPaused(ledger) });
  },

  'pause-claim-session-clears'() {
    const ledger = executionFile(FEAT_SHIP_LEDGER);
    const state = require(STATE_LIB);
    setPaused(ledger, { at: '2026-01-01T00:00:00.000Z', reason: 'test' });
    const pausedSet = isPaused(ledger);
    const claimed = state.claimSession('ship', 'feat-ship');
    print({ pausedSet, claimed, pausedGone: !isPaused(ledger) });
  },

  'w25-no-execution-dir-silent'() {
    const runs = W25_HOOK_CALLS.map(({ hook, payload }) => runHook(hook, payload));
    const execDir = path.join(process.cwd(), '.sdlc', 'execution');
    print(runs.map((r) => ({ ...record(r), hasExecDir: fs.existsSync(execDir) })));
  },

  'w25-no-git-fallback'() {
    const noGitDir = fs.mkdtempSync(os.tmpdir() + '/nogit-');
    try {
      print({
        gitStatus: cp.spawnSync('git', ['rev-parse', '--git-dir'], { cwd: noGitDir, encoding: 'utf8' }).status,
        runs: W25_HOOK_CALLS.map(({ hook, payload }) => runHook(hook, payload, { cwd: noGitDir })).map(shortRecord),
      });
    } finally {
      fs.rmSync(noGitDir, { recursive: true, force: true });
    }
  },

  'hook-runner-temp-cwd'() {
    print({ cwd: process.cwd(), ssh: process.env.GIT_SSH_COMMAND, prompt: process.env.GIT_TERMINAL_PROMPT });
  },
};

function parseCase(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  return name;
}

CASES[parseCase(process.argv.slice(2))]();
