#!/usr/bin/env node
/**
 * run-pr-prepare-case.js
 * Test wrapper for the validate-body and footer cases of datasets/pr-prepare-exec.yaml.
 *
 * Each case spawns skill/pr.js --validate-body in the case's working dir (the fixture project, the
 * case's script_cwd) or in a temp dir, and prints one JSON line that the case's assertions read.
 * Every case was a `node -e` program before; the output is byte-compatible with it. The gh stub is
 * found by PATH (the case's script_stub_bin), so no child reaches the real gh.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag,
 *                   a flag without a value) exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   validate-body-open-stdin: no --file and an open stdin pipe exits 2 at once without reading stdin (#9205)
 *   validate-body-file-stdin: --file - reads the body from stdin (#9205)
 *   validate-body-unreadable: a --file path that cannot be read exits 2 with a message, not a stack trace (#9205)
 *   footer-once: footer (a) appends the configured footer once
 *   footer-twice: footer (b) a second run appends nothing
 *   footer-none: footer (c) no footer key leaves the body unchanged
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-pr-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/pr.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'pr.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/pr.js\n`);
  process.exit(1);
}

const PR = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'pr.js');

function print(value) {
  console.log(JSON.stringify(value));
}

// pr.js --validate-body <args> --json in `cwd` (default: this process's working dir, the case's script_cwd).
function spawnValidate(args, options) {
  return cp.spawnSync('node', [PR, '--validate-body', ...args, '--json'], { cwd: process.cwd(), encoding: 'utf8', ...options });
}

// footer cases: a temp dir with .sdlc/config.json and body.md; runs --validate-body `runs` times
// offline (SDLC_LINKS_OFFLINE=1 in the child env) and prints the first/second results.
function footer(config, names) {
  const d = fs.mkdtempSync(`${os.tmpdir()}/pr-footer-`);
  fs.mkdirSync(`${d}/.sdlc`);
  fs.writeFileSync(`${d}/.sdlc/config.json`, JSON.stringify(config));
  fs.writeFileSync(`${d}/body.md`, 'Body text\n');
  const run = () => {
    const r = spawnValidate(['--file', `${d}/body.md`], { cwd: d, env: { ...process.env, SDLC_LINKS_OFFLINE: '1' } });
    return { status: r.status, out: JSON.parse(r.stdout), file: fs.readFileSync(`${d}/body.md`, 'utf8') };
  };
  const o = {};
  for (const n of names) o[n] = run();
  fs.rmSync(d, { recursive: true, force: true });
  print(o);
}

const CASES = {
  // #9205: without --file the validator never waits on stdin. The wrapper case keeps the child's stdin
  // open and prints when the child's exit event fires (the producer-side fact); no timer.
  'validate-body-open-stdin'() {
    const child = cp.spawn('node', [PR, '--validate-body', '--json'], { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    const err = [];
    child.stderr.on('data', (d) => err.push(String(d)));
    child.on('exit', (code) => {
      print({ code, stderr: err.join('') });
      child.stdin.destroy();
    });
  },

  'validate-body-file-stdin'() {
    const r = spawnValidate(['--file', '-'], { input: fs.readFileSync('body-clean.md', 'utf8') });
    print({ status: r.status, out: r.stdout.trim() });
  },

  'validate-body-unreadable'() {
    const r = spawnValidate(['--file', 'no-such-body.md']);
    print({ status: r.status, stderr: r.stderr });
  },

  'footer-once'() {
    footer({ pr: { footer: 'Made with care' } }, ['first']);
  },

  'footer-twice'() {
    footer({ pr: { footer: 'Made with care' } }, ['first', 'second']);
  },

  'footer-none'() {
    footer({ pr: {} }, ['first']);
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
