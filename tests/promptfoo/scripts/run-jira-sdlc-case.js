#!/usr/bin/env node
/**
 * run-jira-sdlc-case.js
 * Test wrapper for two cases of datasets/jira-sdlc-exec.yaml that were `node -e` programs before;
 * the output is byte-compatible with them.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                   flag, a flag without a value) exit 2 with a message on stderr and nothing on
 *                   stdout.
 *
 * Cases (name: description of the case that uses it):
 *   record-occurrence-first: mcp-failure: record-occurrence returns 1 on first call (runs mcp-failure.js
 *                            twice in the working dir with a fresh session id, prints {first, second})
 *   skill-text-a6-c16: jira-sdlc/skill-text A6 C16: no $ARGUMENTS in a bash fence, <FLAGS> in the check
 *                      call, the allow-list rule present
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-jira-sdlc-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/jira.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'jira.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/jira.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const MCP_FAILURE = path.join(PLUGIN, 'scripts', 'lib', 'mcp-failure.js');
const SKILL = path.join(PLUGIN, 'skills', 'jira-sdlc', 'SKILL.md');

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

const CASES = {
  'record-occurrence-first'() {
    const id = `w-b-${process.pid}-${Date.now()}`;
    const run = () => cp.spawnSync('node', [MCP_FAILURE, '--record-occurrence', '--class', 'hook-block', '--key', 'test-key-wave4'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, SDLC_SESSION_ID: id },
    }).stdout.trim();
    const first = run();
    const second = run();
    fs.rmSync(path.join(os.tmpdir(), `sdlc-mcp-session-${id}`), { recursive: true, force: true });
    console.log(JSON.stringify({ first, second }));
  },

  'skill-text-a6-c16'() {
    const text = fs.readFileSync(SKILL, 'utf8');
    const fence = text.split('\n').reduce((a, l) => {
      if (a.f) {
        if (l === '```') a.f = 0;
        else a.n += countOf(l, '$ARGUMENTS');
      } else if (l.startsWith('```bash')) a.f = 1;
      return a;
    }, { f: 0, n: 0 });
    console.log(JSON.stringify({
      inFence: fence.n,
      call: countOf(text, '--output-file <FLAGS> --check'),
      rule: countOf(text, '**Flags (A6, C16).**'),
      notFlag: countOf(text, 'Not a jira-sdlc flag, read as request text:'),
    }));
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
