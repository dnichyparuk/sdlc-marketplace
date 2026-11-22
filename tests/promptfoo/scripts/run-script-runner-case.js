#!/usr/bin/env node
/**
 * run-script-runner-case.js
 * Test wrapper for the cases of datasets/script-runner-stub-bin-exec.yaml that test the
 * script runner's own environment (providers/script-runner.js): PATH from script_stub_bin,
 * HOME from script_home, and the per-case temp cwd. Each case was a `node -e` program before;
 * the output is byte-compatible with it. The wrapper reads the environment it is given and
 * never sets PATH, HOME or the cwd itself.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   stub-bin-relative: script_stub_bin: a relative path without script_cwd resolves against tests/promptfoo (gh is found by PATH)
 *   home-copied: script-runner: an in-repo script_home is copied per case and the repo fixture stays untouched
 *   home-outside: script-runner: a script_home outside the repo is used as is
 */

'use strict';

const fs = require('fs');

const NAME = 'run-script-runner-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

const CASES = {
  'stub-bin-relative'() {
    console.log(require('child_process').execSync('gh --version').toString());
  },

  'home-copied'() {
    fs.writeFileSync(process.env.HOME + '/probe-home.txt', 'x');
    console.log(process.env.HOME);
  },

  'home-outside'() {
    console.log(process.env.HOME);
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
