#!/usr/bin/env node
/**
 * run-review-consolidate-case.js
 * Test wrapper for a case of datasets/review-consolidate-exec.yaml that was a `node -e` program
 * before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>      One of the names below. Usage errors (no --case, an unknown name, an unknown
 *                      flag, a flag without a value, a missing --fixture) exit 2 with a message on
 *                      stderr and nothing on stdout.
 *   --fixture <dir>    Required by comment-copy: the case's project_root (manifest.json and
 *                      findings-1high).
 *
 * Cases (name: description of the case that uses it):
 *   comment-copy: review-consolidate: comment copy beside the summary (runs review-consolidate.js into a
 *                 temp dir, prints {exit, copy, same})
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-review-consolidate-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name> --fixture <dir>\n`);
  process.exit(2);
}

// Locate repo root with skill/review-consolidate.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review-consolidate.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/review-consolidate.js\n`);
  process.exit(1);
}

const CONSOLIDATE = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review-consolidate.js');

let fixture = null;

const CASES = {
  'comment-copy'() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-copy-'));
    try {
      const r = cp.spawnSync('node', [
        CONSOLIDATE,
        '--manifest', `${fixture}/manifest.json`,
        '--findings', `${fixture}/findings-1high`,
        '--output-dir', `${d}/out`,
        '--summary-path', `${d}/summary.json`,
      ], { encoding: 'utf8' });
      const s = JSON.parse(fs.readFileSync(`${d}/summary.json`, 'utf8'));
      const c = fs.readFileSync(`${d}/summary.comment.md`, 'utf8');
      console.log(JSON.stringify({
        exit: r.status,
        copy: s.commentCopyPath === `${d}/summary.comment.md`,
        same: c === fs.readFileSync(`${d}/out/review-comment.md`, 'utf8'),
      }));
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  },
};

function parseArgs(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else if (argv[i] === '--fixture') {
      if (i + 1 >= argv.length) usage('--fixture needs a value');
      fixture = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  if (fixture === null) usage(`--fixture is required by ${name}`);
  return name;
}

CASES[parseArgs(process.argv.slice(2))]();
