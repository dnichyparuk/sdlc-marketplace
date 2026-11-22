#!/usr/bin/env node
/**
 * run-execute-prepare-case.js
 * Test wrapper for the execute-prepare (sel9, sel10, sel11) and execute-plan-sdlc skill-text (#9241)
 * cases of datasets/execute-prepare-exec.yaml.
 *
 * Each case spawns skill/execute.js or state/execute.js with an argv array in the case's working
 * dir (the project_root copy), or counts strings of the execute-plan-sdlc skill text read at run
 * time, and prints one JSON line that the case's assertions read. Every case was a `node -e`
 * program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>      One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                      flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                      stdout.
 *
 * Cases (name: description of the case that uses it):
 *   sel9-resume-selection: execute-prepare: (sel9) --auto --resume uses the selection recorded in the state file
 *   sel10-invalid-flag: execute-prepare: (sel10) --resume with a different --tasks reports invalidFlag and leaves the state file unchanged
 *   sel11-state-init: execute-prepare: (sel11) state init records --selection, records null without it, and rejects a non-object
 *   skill-text-9241: execute-prepare: (#9241) SKILL.md has no PARSE_EXIT echo and a separate rm call
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-execute-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/execute.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'execute.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/execute.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const SKILL_EXECUTE = path.join(PLUGIN, 'scripts', 'skill', 'execute.js');
const STATE_EXECUTE = path.join(PLUGIN, 'scripts', 'state', 'execute.js');
const SKILL = path.join(PLUGIN, 'skills', 'execute-plan-sdlc', 'SKILL.md');

function print(value) {
  console.log(JSON.stringify(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

// `node <script> <args>` in this process's working dir (the case's script_cwd).
function spawnNode(script, args) {
  return cp.spawnSync('node', [script, ...args], { cwd: process.cwd(), encoding: 'utf8' });
}

const STATE_FILE = path.join(process.cwd(), '.sdlc', 'execution', 'execute-feat-resume-20260101T000000Z.json');

// Writes selection {tasks:[2,3]} into the fixture state file, runs skill/execute.js with `args`.
function resumeRun(args) {
  const s = JSON.parse(readText(STATE_FILE));
  s.selection = { tasks: [2, 3], fromWave: null, taskIds: [2, 3] };
  fs.writeFileSync(STATE_FILE, JSON.stringify(s));
  const before = readText(STATE_FILE);
  const r = spawnNode(SKILL_EXECUTE, [...args, '--project-root', process.cwd()]);
  print({ status: r.status, out: JSON.parse(readText(r.stdout.trim())), before, after: readText(STATE_FILE) });
}

const CASES = {
  'sel9-resume-selection'() {
    resumeRun(['--auto', '--resume']);
  },

  'sel10-invalid-flag'() {
    resumeRun(['--resume', '--tasks', '4']);
  },

  'sel11-state-init'() {
    const run = (extra) => {
      const r = spawnNode(STATE_EXECUTE, ['init', '--branch', 'main', '--quality', 'balanced', '--total-tasks', '2', '--planned-task-ids', '["2","3"]', ...extra]);
      return {
        status: r.status,
        file: r.status === 0 ? JSON.parse(readText(r.stdout.trim())) : null,
        removed: r.status === 0 ? (fs.unlinkSync(r.stdout.trim()), true) : false,
        stderr: r.stderr,
      };
    };
    print({
      a: run(['--selection', '{"tasks":[2,3],"fromWave":null,"taskIds":[2,3]}']),
      b: run([]),
      c: run(['--selection', '[1]']),
    });
  },

  'skill-text-9241'() {
    const s = readText(SKILL);
    print({
      parseExit: countOf(s, 'PARSE_EXIT='),
      rm: countOf(s, '   ```bash\n   rm -f "<SUMMARY_FILE>"\n   ```'),
    });
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
