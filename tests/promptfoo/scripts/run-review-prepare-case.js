#!/usr/bin/env node
/**
 * run-review-prepare-case.js
 * Test wrapper for the dimension-effort, review-cap, review-dimension-globs and review-glob-brace
 * cases of datasets/review-prepare-exec.yaml.
 *
 * Each case calls lib exports of skill/review.js (in the fixture working dir for the review-cap
 * cases (a), (b) and (b2), which is the case's script_cwd) or reads review-orchestrator.md, and
 * prints one JSON line that the case's assertions read. Every case was a `node -e` program
 * before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   effort-forwarded: dimension-effort: the orchestrator dispatch forwards effort
 *   cap-10-dimensions: review-cap: (a) 10 matching dimensions give 10 dispatched entries with a slice_file and batch 1 or 2, none QUEUED
 *   cap-8-dimensions: review-cap: (b) 8 matching dimensions all go to batch 1
 *   cap-17-dimensions: review-cap: (b2) 17 matching dimensions give batches of 8, 8 and 1 in priority order
 *   cap-code-quality-match: review-cap: (c) the repo's code-quality dimension matches plugins/sdlc-utilities/hooks/session-start.js
 *   globs-runtime-contract: review-dimension-globs: runtime-contract and code-quality match scripts/skill/ and scripts/ci/ files
 *   brace-js-ts: review-glob-brace: a/*.{js,ts} matches js and ts only
 *   brace-nested: review-glob-brace: {src,lib}/**\/*.js matches nested files
 *   brace-unbalanced: review-glob-brace: unbalanced brace matches literally
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const NAME = 'run-review-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/review.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/review.js\n`);
  process.exit(1);
}

const REVIEW = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review.js');
const ORCHESTRATOR = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'agents', 'review-orchestrator.md');

function print(value) {
  console.log(JSON.stringify(value));
}

// Builds the index entries for the dimensions that match `files` in the current directory, writes the
// slices to a temp dir, and prints the refined plan size, the slice-file check and the entries.
function capCase(files) {
  const { loadAndMatchDimensions, writeDimensionSlices, toIndexEntry, refinePlan } = require(REVIEW);
  const d = loadAndMatchDimensions(process.cwd(), files, null);
  const o = fs.mkdtempSync(path.join(os.tmpdir(), 'review-cap-'));
  writeDimensionSlices(d.filter((x) => x.status === 'ACTIVE'), o, null);
  const n = refinePlan(d);
  const e = d.map((x) => toIndexEntry(x));
  const ok = e.filter((x) => x.status === 'ACTIVE').every((x) => fs.existsSync(x.slice_file));
  fs.rmSync(o, { recursive: true, force: true });
  print({ n, ok, e });
}

function matched(triggers, files) {
  print(require(REVIEW).matchFiles({ triggers }, files).matched);
}

const CASES = {
  'effort-forwarded'() {
    const text = fs.readFileSync(ORCHESTRATOR, 'utf8');
    const needle = 'effort: dimension.effort || manifest.subagent_effort';
    const lines = text.split('\n');
    print({
      dispatch: lines.some((l) => l.startsWith('3. Dispatch via Agent tool (') && l.includes(needle)),
      donot: lines.some((l) => l.startsWith('- Dispatch dimension subagents') && l.includes(needle)),
      front: !text.includes('persists the consolidated comment body'),
    });
  },

  'cap-10-dimensions'() {
    capCase(['src/a.js', 'lib/a.js']);
  },

  'cap-8-dimensions'() {
    capCase(['src/a.js']);
  },

  'cap-17-dimensions'() {
    capCase(['src/a.js', 'lib/a.js', 'pkg/a.js']);
  },

  'cap-code-quality-match'() {
    const { loadAndMatchDimensions } = require(REVIEW);
    const h = loadAndMatchDimensions(repoRoot, ['plugins/sdlc-utilities/hooks/session-start.js'], null)
      .find((x) => x.name === 'code-quality');
    print({ status: h && h.status, matched: h && h.matched_count });
  },

  'globs-runtime-contract'() {
    const { loadAndMatchDimensions } = require(REVIEW);
    const d = loadAndMatchDimensions(repoRoot, [
      'plugins/sdlc-utilities/scripts/skill/review.js',
      'plugins/sdlc-utilities/scripts/ci/validate-dimensions.js',
    ], null);
    const f = (n) => d.find((x) => x.name === n);
    print({ rc: f('runtime-contract'), hr: f('code-quality') });
  },

  'brace-js-ts'() {
    matched(['a/*.{js,ts}'], ['a/x.js', 'a/y.ts', 'a/z.md']);
  },

  'brace-nested'() {
    matched(['{src,lib}/**/*.js'], ['src/a.js', 'lib/b/c.js', 'pkg/d.js']);
  },

  'brace-unbalanced'() {
    matched(['a/{b,c'], ['a/b', 'a/{b,c']);
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
