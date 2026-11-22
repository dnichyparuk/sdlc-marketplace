#!/usr/bin/env node
/**
 * run-execute-context-producer-case.js
 * Test wrapper for the wave-start fact-sheet cases of
 * datasets/execute-plan-sdlc-context-producer-exec.yaml.
 *
 * Each case spawns state/execute.js `wave-start` with an argv array in the case's working dir (the
 * project_root copy; the case's script_env points SDLC_STATE_DIR_OVERRIDE at its state dir, and the
 * child inherits it), reads the first fact sheet it wrote, and prints one JSON line that the case's
 * assertions read. Every case was a `node -e` program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>      One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                      flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                      stdout.
 *
 * Cases (name: description of the case that uses it):
 *   wave-start-verification: wave-start: the fact sheet carries the plan verification verbatim (R89)
 *   wave-start-no-plan: wave-start: a missing plan omits the verification section (R89)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-execute-context-producer-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with state/execute.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with state/execute.js\n`);
  process.exit(1);
}

const STATE_EXECUTE = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js');

function print(value) {
  console.log(JSON.stringify(value));
}

// state/execute.js wave-start in this process's working dir; the text of the first fact sheet.
function firstFactSheet(args) {
  const r = cp.spawnSync('node', [STATE_EXECUTE, 'wave-start', ...args], { cwd: process.cwd(), encoding: 'utf8' });
  return fs.readFileSync(JSON.parse(r.stdout).factSheets[0], 'utf8');
}

const HEADING = '## Verification';

const CASES = {
  'wave-start-verification'() {
    const s = firstFactSheet(['--wave', '1', '--branch', 'fix/verify-sheet', '--run-id', '20250105T000000',
      '--tasks-json', '[{"id":"1","name":"Alpha"}]']);
    print({
      heading: s.includes(HEADING),
      check: s.includes('Task check: tests'),
      cmd: s.includes('npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml'),
    });
  },

  'wave-start-no-plan'() {
    const s = firstFactSheet(['--wave', '3', '--branch', 'fix/ctx-alpha', '--run-id', '20250101T000000',
      '--tasks-json', '[{"id":"T9","name":"Gamma"}]']);
    print({ heading: s.includes(HEADING) });
  },
};

function parseArgs(argv) {
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

CASES[parseArgs(process.argv.slice(2))]();
