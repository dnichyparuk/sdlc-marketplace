#!/usr/bin/env node
/**
 * run-session-map-case.js
 * Test wrapper for the map-out-accepted case of datasets/session-map-exec.yaml.
 *
 * The case runs ci/session-map.js with --map-out in the fixture working dir (the case's script_cwd),
 * then ci/session-cost.js --sessions on that map, and prints one JSON line that the case's
 * assertions read. The case was a `node -e` program before; the output is byte-compatible with it.
 * map.json is written into the fixture copy, as before.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   map-out-accepted: session-map: (e) the --map-out map is accepted by session-cost.js --sessions
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-session-map-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with ci/session-map.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'ci', 'session-map.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with ci/session-map.js\n`);
  process.exit(1);
}

const CI = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'ci');
const PRICES = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'session-cost', 'prices.json');

const CASES = {
  'map-out-accepted'() {
    const f = process.cwd();
    const run = (args) => cp.spawnSync('node', args, { encoding: 'utf8' });
    const a = run([path.join(CI, 'session-map.js'), '--agents', f + '/agents-two.json', '--projects-dir', f + '/projects', '--map-out', f + '/map.json']);
    const b = run([path.join(CI, 'session-cost.js'), '--sessions', f + '/map.json', '--projects-dir', f + '/projects', '--prices', PRICES, '--json']);
    console.log(JSON.stringify({
      mapExit: a.status,
      costExit: b.status,
      costErr: b.stderr,
      map: fs.existsSync(f + '/map.json') ? JSON.parse(fs.readFileSync(f + '/map.json', 'utf8')) : null,
    }));
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
