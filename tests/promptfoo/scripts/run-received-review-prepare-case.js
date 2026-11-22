#!/usr/bin/env node
/**
 * run-received-review-prepare-case.js
 * Test wrapper for the program cases of datasets/received-review-prepare-exec.yaml.
 *
 * Each case counts substrings of the received-review-sdlc SKILL.md or an agent file, calls
 * parseArgs of scripts/skill/received-review.js, or spawns received-review.js in the fixture working
 * dir (the case's script_cwd; the wrapper never changes directory), and prints what the case's
 * assertions read. Every case was a `node -e` program before; stdout and exit code are unchanged.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, a missing value, an unknown name,
 *                   an unknown flag) exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   output-file-noop: rr-output-file: --output-file is a no-op that does not consume the next argument
 *   skill-text-own-checks: rr-skill-text: one own-checks line, no banners, opener list or trust block
 *   comment-file-parsed: rr-comment-file: (a) findings parsed with severity, path and line
 *   comment-file-unreadable: rr-comment-file: (b) an unreadable path exits 2
 *   r37-worktree-roots: received-review-prepare (R37): linked worktree projectRoot and localRoot
 *   comment-file-parse-args: rr-comment-file: (c) parseArgs carries commentFile
 *   scope-plan-allowed-files: rr-scope: (a) --plan writes allowedFiles
 *   scope-no-plan-null: rr-scope: (b) no --plan gives null allowedFiles
 *   verify-r34-rule: rr-verify: (a) SKILL.md Step 3 carries the R34 doc-versus-spec rule
 *   scope-invalid-min-severity: rr-scope: (c) invalid --min-severity is an error (and an unreadable --plan)
 *   scope-min-severity-no-value: rr-scope: (c2) --min-severity without a value is an error
 *   scope-check-allowed: rr-scope: (d) check-scope passes on allowed paths
 *   scope-check-outside: rr-scope: (e) check-scope fails on an outside path
 *   scope-check-prefix: rr-scope: (e2) check-scope matches a directory Files entry by prefix
 *   scope-check-below-threshold: rr-scope: (f) check-scope fails on a below-threshold fixed id
 *   scope-check-unreadable-manifest: rr-scope: (g) check-scope exit 2 on an unreadable manifest
 *   skill-text-comment-file-source: rr-skill-text: comment-file source and the no-PR skip rule
 *   skill-text-a7-c20: received-review-prepare/skill-text A7 C20
 *   skill-text-scope-blocks: rr-skill-text: (scope) fix-scope and scope-check blocks appear once
 *   skill-text-r31-r32: rr-skill-text: (comment-file) R31 and R32 lines appear once
 *   skill-text-auto-line: rr-skill-text: (auto) the needs-discussion auto line appears twice
 *   skill-text-r38: rr-skill-text: (R38) removed-phrase rule in SKILL.md Step 11 and ship-step-received-review
 *   refusal-r36: rr-refusal: (a) R36 refusal rule in SKILL.md Step 11, the DO NOT list and ship-step-received-review
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-received-review-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with scripts/skill/received-review.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'received-review.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with scripts/skill/received-review.js\n`);
  process.exit(1);
}

const PLUGIN = path.join(repoRoot, 'plugins', 'sdlc-utilities');
const RECEIVED_REVIEW = path.join(PLUGIN, 'scripts', 'skill', 'received-review.js');
const SKILL = path.join(PLUGIN, 'skills', 'received-review-sdlc', 'SKILL.md');
const SHIP_AGENT = path.join(PLUGIN, 'agents', 'ship-step-received-review.md');

function print(value) {
  console.log(JSON.stringify(value));
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

// Runs received-review.js with `args` in the fixture working dir.
function run(args) {
  return cp.spawnSync('node', [RECEIVED_REVIEW, ...args], { cwd: process.cwd(), encoding: 'utf8' });
}

const SCOPE_ARGS = ['--output-file', '--project-root', process.cwd(), '--comment-file', 'review-comment.md'];
const PLAN_ARGS = [...SCOPE_ARGS, '--plan', 'plan.md', '--min-severity', 'medium'];

// Runs the manifest-writing call and returns the manifest path it prints.
function writeManifest(args) {
  return run(args).stdout.trim();
}

function parseArgs(argv) {
  return require(RECEIVED_REVIEW).parseArgs(argv);
}

function statusAndManifest(args) {
  const r = run(args);
  print({ status: r.status, manifest: JSON.parse(read(r.stdout.trim())) });
}

function statusAndStreams(args) {
  const r = run(args);
  print({ status: r.status, stdout: r.stdout, stderr: r.stderr });
}

function checkScope(manifestArgs, fixedIds) {
  const manifest = writeManifest(manifestArgs);
  const r = run(['--check-scope', '--manifest', manifest, '--fixed', fixedIds]);
  print({ status: r.status, out: r.stdout.trim() });
}

const CASES = {
  'output-file-noop': () => {
    print(parseArgs(['node', 'x', '--output-file', '--pr', '7']));
  },

  'skill-text-own-checks': () => {
    const t = read(SKILL);
    print({
      own: count(t, 'Steps 5-9 are your own checks'),
      internal: count(t, 'INTERNAL'),
      openers: count(t, 'Forbidden openers'),
      trust: count(t, 'Source trust'),
      gratitude: count(t, 'Express gratitude'),
      r18: count(t, 'Apply the R18 bypass rule and the `--auto` interaction from Configuration'),
    });
  },

  'comment-file-parsed': () => {
    statusAndManifest(SCOPE_ARGS);
  },

  'comment-file-unreadable': () => {
    const r = run(['--output-file', '--project-root', process.cwd(), '--comment-file', 'missing.md']);
    print({ status: r.status, stderr: r.stderr });
  },

  'r37-worktree-roots': () => {
    const a = parseArgs(['node', 'x']);
    const b = parseArgs(['node', 'x', '--project-root', '/tmp/zz']);
    print({
      wt: a.projectRoot.endsWith('/worktrees/wt1'),
      main: !a.localRoot.includes('/worktrees/'),
      both: b.projectRoot === b.localRoot && b.localRoot.endsWith('/zz'),
    });
  },

  'comment-file-parse-args': () => {
    print(parseArgs(['node', 'x', '--comment-file', 'x.md', '--auto']));
  },

  'scope-plan-allowed-files': () => {
    statusAndManifest(PLAN_ARGS);
  },

  'scope-no-plan-null': () => {
    statusAndManifest(SCOPE_ARGS);
  },

  'verify-r34-rule': () => {
    console.log(read(SKILL));
  },

  'scope-invalid-min-severity': () => {
    const streams = (r) => ({ status: r.status, stdout: r.stdout, stderr: r.stderr });
    const a = run([...SCOPE_ARGS, '--min-severity', 'severe']);
    const b = run([...SCOPE_ARGS, '--plan', 'missing-plan.md']);
    print({ a: streams(a), b: streams(b) });
  },

  'scope-min-severity-no-value': () => {
    statusAndStreams([...SCOPE_ARGS, '--min-severity']);
  },

  'scope-check-allowed': () => {
    checkScope(PLAN_ARGS, 'F1,F2');
  },

  'scope-check-outside': () => {
    checkScope(PLAN_ARGS, 'F1');
  },

  'scope-check-prefix': () => {
    const manifest = writeManifest(PLAN_ARGS);
    const json = JSON.parse(read(manifest));
    json.allowedFiles = ['src', 'x.js'];
    fs.writeFileSync(manifest, JSON.stringify(json));
    const r = run(['--check-scope', '--manifest', manifest, '--fixed', 'F1']);
    print({ status: r.status, out: r.stdout.trim() });
  },

  'scope-check-below-threshold': () => {
    checkScope(PLAN_ARGS, 'F1,F3');
  },

  'scope-check-unreadable-manifest': () => {
    statusAndStreams(['--check-scope', '--manifest', 'missing-manifest.json', '--fixed', 'F1']);
  },

  'skill-text-comment-file-source': () => {
    const t = read(SKILL);
    print({
      hint: count(t, 'argument-hint: "[--pr <number>] [--auto] [--comment-file <path>] [--plan <path>] [--min-severity <level>]"'),
      src: count(t, 'When `manifest.source` is `comment-file`'),
      nopr: count(t, 'When `manifest.pr` is null'),
      fence: count(t, 'node "<PLUGIN_ROOT>/scripts/skill/received-review.js" --output-file <FLAGS>'),
      post: count(t, 'With `manifest.pr` null (`comment-file` source, R27), post nothing'),
      s12: count(t, 'show the summary in item 1; no consent gate, no posting (R27). Then apply the R35 open-decisions stop from Step 11 when it applies.'),
    });
  },

  'skill-text-a7-c20': () => {
    const t = read(SKILL);
    const inFence = t.split('\n').reduce((a, l) => {
      if (a.f) {
        if (l.startsWith('```')) a.f = 0;
        else a.n += l.split('$ARGUMENTS').length - 1;
      } else if (l.startsWith('```')) {
        a.f = 1;
      }
      return a;
    }, { f: 0, n: 0 });
    print({
      inFence: inFence.n,
      call: count(t, '--output-file <FLAGS>\n'),
      rule: count(t, '**Flags (A7, C20).**'),
      notFlag: count(t, 'Not a received-review-sdlc flag, read as request text:'),
      old: count(t, 'Replace `--pr <PR_NUMBER>`'),
      stop: count(t, 'stop and report it as an invalid value'),
      minSev: count(t, '`--min-severity` takes only `critical`, `high`, `medium` or `low`; any other value is reported the same way'),
    });
  },

  'skill-text-scope-blocks': () => {
    const t = read(SKILL);
    print({
      fix: count(t, '**Fix scope (R28, R29):**'),
      chk: count(t, '**Scope check (R30, G13):**'),
      cmd: count(t, '--check-scope --manifest'),
    });
  },

  'skill-text-r31-r32': () => {
    const t = read(SKILL);
    print({
      r31: count(t, '**Comment-file mode (R31):**'),
      r32: count(t, 'PR: none (comment-file <basename of manifest.comment_file>)) (R32)'),
      src: count(t, 'When `manifest.source` is `comment-file`'),
    });
  },

  'skill-text-auto-line': () => {
    const t = read(SKILL);
    print({
      auto: count(t, 'when `flags.auto` is true (the boolean resolved in Step 1), ask nothing;'),
      verdict: count(t, 'the verdict "needs discussion" (C19)'),
    });
  },

  'skill-text-r38': () => {
    print({
      step: count(read(SKILL), '**Removed phrases (R38).**'),
      agent: count(read(SHIP_AGENT), '(received-review-sdlc R38)'),
    });
  },

  'refusal-r36': () => {
    const s = read(SKILL);
    print({
      step: count(s, '**A refusal is a stop (R36).**'),
      dont: count(s, 'or run an owner-only command as a fix check (R36)'),
      agent: count(read(SHIP_AGENT), '(received-review-sdlc R36)'),
    });
  },
};

// Parse arguments.
const argv = process.argv.slice(2);
let caseName = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--case') {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage('--case needs a value');
    caseName = value;
    i++;
  } else {
    usage(`unknown flag: ${argv[i]}`);
  }
}
if (caseName === null) usage('--case is required');
if (!Object.prototype.hasOwnProperty.call(CASES, caseName)) usage(`unknown case: ${caseName}`);

CASES[caseName]();
