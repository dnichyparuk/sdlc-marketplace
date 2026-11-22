#!/usr/bin/env node
/**
 * run-commit-prepare-case.js
 * Test wrapper for the commit-subject, commit-trailers and commit-skill-text cases of
 * datasets/commit-prepare-exec.yaml.
 *
 * Each case spawns skill/commit.js with an argv array in the fixture working dir (the case's
 * script_cwd), calls a lib/commit-message.js export, or counts sentences of SKILL.md or an agent
 * file, and prints one JSON line that the case's assertions read. Every case was a `node -e`
 * program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   subject-spaces: commit-subject: (a) --subject with spaces appears verbatim as flags.subject
 *   subject-empty: commit-subject: (b) an empty --subject gives an errors[] entry and exit 1
 *   subject-73-chars: commit-subject: (c) a 73-character --subject gives exit 1
 *   subject-message-file: commit-subject: message-file — the file path is absolute in flags; a different --subject or a path with $ is rejected before drafting
 *   subject-gate: commit-subject: expected-subject gate — the SKILL.md subject gate exits 3 on a different first line and 0 on the same
 *   subject-length-before-draft: commit-subject: length before draft — a 73-character --expected-subject or message-file first line, or a --subject with a double quote, or an --expected-subject with a backtick, gives exit 1
 *   subject-prune: commit-subject: prune — the script deletes this branch's earlier .msg files and keeps foreign ones
 *   subject-prune-out: commit-subject: prune out — the script deletes this branch's earlier out/ .msg files and keeps foreign ones
 *   trailers-valued: commit-trailers: (a) a valued entry reaches the manifest unchanged
 *   trailers-malformed: commit-trailers: (c) a malformed entry is an error
 *   trailers-orchestrator-copies: commit-trailers: the orchestrator copies resolved values
 *   trailers-lf: commit-trailers: (G10+) LF message passes
 *   trailers-crlf: commit-trailers: (G10+) CRLF message passes
 *   trailers-dup-model: commit-trailers: (G10+) second model trailer fails as duplicate
 *   trailers-dup-lowercase: commit-trailers: (G10+) lowercase duplicate fails
 *   trailers-missing: commit-trailers: (G10+) missing trailer fails
 *   trailers-no-config: commit-trailers: (G10+) no config passes
 *   trailers-no-trailers-key: commit-trailers: (G10+) no trailers key passes
 *   trailers-unreadable: commit-trailers: (G10+) unreadable file exits 2
 *   trailers-repo-config: commit-trailers: (config) repo config resolves the Sonnet 5.5 trailer
 *   skill-text-trailer-gate: commit-skill-text: (G10+) trailer gate step and R19 rule appear once, the inline trailer loop is gone
 *   skill-text-fallback: commit-skill-text: (R18) the fallback sentence appears once
 *   skill-text-soft-reset: commit-skill-text: (R16, R20) the soft-reset uses wipSquash.forkPoint, no symbolic-ref call, and the Exit 2 given-subject sentence appears once
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-commit-prepare-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/commit.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'commit.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/commit.js\n`);
  process.exit(1);
}

const COMMIT = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'commit.js');
const SKILL = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'skills', 'commit-sdlc', 'SKILL.md');
const ORCHESTRATOR = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'agents', 'commit-orchestrator.md');
const COMMIT_MESSAGE_LIB = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'commit-message.js');

const SUBJECT = 'docs(#1): x - y';
const LONG_SUBJECT = `docs(#1): ${'a'.repeat(63)}`;

function print(value) {
  console.log(JSON.stringify(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

function spawnCommit(args, env) {
  const options = { cwd: process.cwd(), encoding: 'utf8' };
  if (env) options.env = Object.assign({}, process.env, env);
  return cp.spawnSync('node', [COMMIT, ...args], options);
}

// commit.js --output-file <args>: its exit status and the manifest it wrote.
function prepare(args) {
  const r = spawnCommit(['--output-file', ...args]);
  const file = (r.stdout || '').trim();
  if (r.error || !file) {
    throw new Error(`commit.js --output-file failed (status ${r.status})${r.error ? `: ${r.error.message}` : ''}\n${r.stderr || ''}`);
  }
  return { status: r.status, out: JSON.parse(readText(file)) };
}

// commit.js --check-message <file> --manifest <manifest>: exit status, stdout and stderr.
function checkMessage(file, manifest) {
  const r = spawnCommit(['--check-message', file, '--manifest', manifest]);
  print({ status: r.status, out: r.stdout, err: r.stderr });
}

function tempDir(prefix) {
  return fs.mkdtempSync(`${os.tmpdir()}/${prefix}`);
}

function removeDir(d) {
  fs.rmSync(d, { recursive: true, force: true });
}

// Message file path relative to the working dir, as a user passes it.
function relativeTo(file) {
  return path.relative(process.cwd(), file);
}

// commit.js --output-file with SDLC_STATE_DIR_OVERRIDE=<temp dir>: seeds `names` under `sub` of
// the state dir, then reports which .msg files are left there after the prune-on-write.
function pruneCase(sub, names) {
  const d = tempDir('commit-prune-');
  const msgDir = sub ? `${d}/${sub}` : d;
  if (sub) fs.mkdirSync(msgDir, { recursive: true });
  names.forEach((n) => fs.writeFileSync(`${msgDir}/${n}`, 'x\n'));
  const r = spawnCommit(['--output-file'], { SDLC_STATE_DIR_OVERRIDE: d });
  const o = {
    status: r.status,
    manifest: fs.existsSync(r.stdout.trim()),
    left: fs.readdirSync(msgDir).filter((n) => n.endsWith('.msg')).sort(),
  };
  removeDir(d);
  print(o);
}

// The subject-gate block of SKILL.md: the text between `node -e '` and `' "<COMMIT_CONTEXT_FILE>"`.
function gateBlock() {
  const parts = readText(SKILL).split("node -e '");
  return parts.length > 1 ? parts[1].split('\' "<COMMIT_CONTEXT_FILE>"')[0] : '';
}

const CASES = {
  'subject-spaces'() {
    print(prepare(['--subject', SUBJECT]));
  },

  'subject-empty'() {
    print(prepare(['--subject', '']));
  },

  'subject-73-chars'() {
    print(prepare(['--subject', LONG_SUBJECT]));
  },

  'subject-message-file'() {
    const t = tempDir('commit-subject-');
    const msg = `${t}/msg.txt`;
    fs.writeFileSync(msg, `${SUBJECT}\n\nWhy it changed.\n`);
    const o = {
      alone: prepare(['--message-file', relativeTo(msg)]),
      clash: prepare(['--message-file', relativeTo(msg), '--subject', 'docs(#1): other - z']),
      badpath: prepare(['--message-file', 'm$x.txt']),
    };
    removeDir(t);
    print(o);
  },

  'subject-gate'() {
    const t = tempDir('commit-gate-');
    const js = gateBlock();
    fs.writeFileSync(`${t}/e.json`, JSON.stringify({ flags: { expectedSubject: SUBJECT }, commitConfig: null }));
    fs.writeFileSync(`${t}/g.json`, JSON.stringify({ flags: { subject: SUBJECT }, commitConfig: null }));
    fs.writeFileSync(`${t}/f.json`, JSON.stringify({ flags: { messageFile: `${t}/same.msg` }, commitConfig: null }));
    fs.writeFileSync(`${t}/other.msg`, 'docs(#1): other - z\n\nBody.\n');
    fs.writeFileSync(`${t}/same.msg`, `${SUBJECT}\n\nBody.\n`);
    const gate = (context, message) => cp.spawnSync('node', ['-e', js, `${t}/${context}`, `${t}/${message}`]).status;
    const o = {
      found: js.includes('f.expectedSubject') && js.includes('process.argv[2]'),
      differ: gate('e.json', 'other.msg'),
      same: gate('e.json', 'same.msg'),
      given: gate('g.json', 'other.msg'),
      file: gate('f.json', 'other.msg'),
    };
    removeDir(t);
    print(o);
  },

  'subject-length-before-draft'() {
    const t = tempDir('commit-subject-');
    const long = `${t}/long.txt`;
    fs.writeFileSync(long, `${LONG_SUBJECT}\n\nBody.\n`);
    const o = {
      expected: prepare(['--expected-subject', LONG_SUBJECT]),
      file: prepare(['--message-file', relativeTo(long)]),
      quote: prepare(['--subject', 'docs(#1): a"b - y']),
      tick: prepare(['--expected-subject', 'docs(#1): a`b - y']),
    };
    removeDir(t);
    print(o);
  },

  'subject-prune'() {
    pruneCase(null, [
      'commit-main-20240101T000000Z.msg',
      'commit-otherbranch-20240101T000000Z.msg',
      'review-main-20240101T000000Z.msg',
      'commit-main-notes.msg',
    ]);
  },

  'subject-prune-out'() {
    pruneCase('out', [
      'commit-context-main-20240101T000000Z-ab12.msg',
      'commit-context-otherbranch-20240101T000000Z-ab12.msg',
      'review-main-20240101T000000Z-ab12.msg',
      'commit-context-main-notes.msg',
    ]);
  },

  'trailers-valued'() {
    print(prepare([]));
  },

  'trailers-malformed'() {
    fs.writeFileSync(`${process.cwd()}/.claude/sdlc.json`, JSON.stringify({ commit: { requiredTrailers: ['Bad Key: x'] } }));
    print(prepare([]));
  },

  'trailers-orchestrator-copies'() {
    const t = readText(ORCHESTRATOR);
    print({
      a: t.includes('**`commitConfig.trailers`**'),
      b: t.includes('copied verbatim'),
      c: t.includes('Never invent a value'),
      d: t.includes('Use an empty string as the value placeholder when no value is known'),
    });
  },

  'trailers-lf'() {
    checkMessage('ok-lf.txt', 'manifest.json');
  },

  'trailers-crlf'() {
    checkMessage('ok-crlf.txt', 'manifest.json');
  },

  'trailers-dup-model'() {
    checkMessage('dup-model.txt', 'manifest.json');
  },

  'trailers-dup-lowercase'() {
    checkMessage('dup-lowercase.txt', 'manifest.json');
  },

  'trailers-missing'() {
    checkMessage('missing.txt', 'manifest.json');
  },

  'trailers-no-config'() {
    checkMessage('missing.txt', 'manifest-null.json');
  },

  'trailers-no-trailers-key'() {
    checkMessage('missing.txt', 'manifest-no-trailers.json');
  },

  'trailers-unreadable'() {
    checkMessage('absent.txt', 'manifest.json');
  },

  'trailers-repo-config'() {
    const lib = require(COMMIT_MESSAGE_LIB);
    const cfg = JSON.parse(readText(`${repoRoot}/.sdlc/config.json`));
    const errs = [];
    const o = { errs, list: cfg.commit.requiredTrailers, trailers: lib.resolveTrailers(cfg.commit.requiredTrailers, errs) };
    print(o);
  },

  'skill-text-trailer-gate'() {
    const skill = readText(SKILL);
    print({
      gate: countOf(skill, '0b. **Trailer gate (G10, R17):**'),
      cmd: countOf(skill, '--check-message "<MSG_FILE>"'),
      r19s: countOf(skill, 'Add no attribution line of your own'),
      r19o: countOf(readText(ORCHESTRATOR), 'Add no attribution line of your own'),
      loop: countOf(skill, 'lines.some(l'),
      crlf: countOf(skill, 'split(/\\r?\\n/)[0]'),
    });
  },

  'skill-text-fallback'() {
    const skill = readText(SKILL);
    print({
      fallback: countOf(skill, 'draft `MESSAGE` in this context with the same rules, and continue to Step 5 (R18).'),
      errors: countOf(skill, "If the manifest's `errors[]` is non-empty, surface those errors and stop."),
      old: countOf(skill, 'If `MESSAGE` is empty, the orchestrator detected'),
    });
  },

  'skill-text-soft-reset'() {
    const skill = readText(SKILL);
    print({
      sym: countOf(skill, 'git symbolic-ref --short HEAD'),
      fork: countOf(skill, 'wipSquash.forkPoint'),
      mb: countOf(skill, 'git merge-base'),
      up: countOf(skill, '@{upstream}'),
      exit2: countOf(skill, 'offer only **cancel** (R16)'),
    });
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
