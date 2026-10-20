#!/usr/bin/env node
/**
 * run-openspec-step.js
 * Test wrapper for skill/openspec-step.js (flip / archive / validate / detect).
 *
 * A wrapper is needed for two things the script-runner cannot do: two script
 * calls in one case (flip twice, archive twice) and reading `git log` after
 * an archive. It prints exactly one JSON line so every assertion is a
 * `javascript` check over it. Script exit codes and stderr go into `calls[]`
 * so the provider never appends stderr to the JSON line. Always exits 0.
 *
 * Args:
 *   --project-root <p>      Fixture copy; cwd and --project-root of every script call
 *   --scenario <name>       flip-twice | flip-empty-line | archive | validate | detect-two
 *   --change <n>            Change name (default add-auth)
 *   --ref <r>               Task ref for flip-twice (default alpha-custom)
 *   --decision <d>          --decision for archive (default anyway)
 *   --uncheck <k>           Before the first call, turn the last k "- [x]" lines of
 *                           openspec/changes/<n>/tasks.md into "- [ ]" (default 0)
 *   --twice                 Repeat the archive call
 *   --stub-validate fail    Rewrite bin/openspec so `validate` exits 1 with
 *                           "stub validation failed" on stderr (archive unchanged)
 *   --no-cli                Run with PATH = an empty temp dir (no openspec, no git)
 *
 * Output JSON (one line):
 *   { scenario, calls: [{ args, exitCode, json, stderr }], lastSubject, commitCount, archived }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let scenario = null;
let change = 'add-auth';
let ref = 'alpha-custom';
let decision = 'anyway';
let uncheck = 0;
let twice = false;
let stubValidate = null;
let noCli = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  else if (args[i] === '--scenario' && args[i + 1]) scenario = args[++i];
  else if (args[i] === '--change' && args[i + 1]) change = args[++i];
  else if (args[i] === '--ref' && args[i + 1]) ref = args[++i];
  else if (args[i] === '--decision' && args[i + 1]) decision = args[++i];
  else if (args[i] === '--uncheck' && args[i + 1]) uncheck = parseInt(args[++i], 10) || 0;
  else if (args[i] === '--stub-validate' && args[i + 1]) stubValidate = args[++i];
  else if (args[i] === '--twice') twice = true;
  else if (args[i] === '--no-cli') noCli = true;
}

// Locate repo root with skill/openspec-step.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'openspec-step.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  console.log(JSON.stringify({ error: 'Could not find repo root with skill/openspec-step.js' }));
  process.exit(0);
}
const script = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'openspec-step.js');

// Before the first call: uncheck the last k done tasks.
if (uncheck > 0) {
  const tasksFile = path.join(projectRoot, 'openspec', 'changes', change, 'tasks.md');
  const lines = fs.readFileSync(tasksFile, 'utf8').split('\n');
  let left = uncheck;
  for (let i = lines.length - 1; i >= 0 && left > 0; i--) {
    if (/^- \[x\]/.test(lines[i])) { lines[i] = lines[i].replace('- [x]', '- [ ]'); left--; }
  }
  fs.writeFileSync(tasksFile, lines.join('\n'));
}

// Before the first call: make the stub `validate` fail.
if (stubValidate === 'fail') {
  fs.writeFileSync(path.join(projectRoot, 'bin', 'openspec'), [
    '#!/bin/sh',
    'case "$1" in',
    '  validate) echo "stub validation failed" >&2; exit 1 ;;',
    '  archive) mkdir -p openspec/changes/archive && mv "openspec/changes/$2" "openspec/changes/archive/2026-01-01-$2" ;;',
    '  *) exit 1 ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
}

let emptyPathDir = null;
const env = { ...process.env };
if (noCli) {
  emptyPathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-step-nopath-'));
  env.PATH = emptyPathDir;
}

const calls = [];
function run(argv) {
  const res = spawnSync(process.execPath, [script, ...argv, '--project-root', projectRoot], {
    cwd: projectRoot, env, encoding: 'utf8', timeout: 30_000,
  });
  const out = (res.stdout || '').trim();
  let json = null;
  try { json = JSON.parse(out.split('\n').filter(Boolean).pop() || ''); } catch (_) { json = null; }
  calls.push({ args: argv, exitCode: res.status ?? 1, json, stderr: (res.stderr || '').trim() });
}

switch (scenario) {
  case 'flip-twice':
    run(['flip', '--change', change, '--ref', ref]);
    run(['flip', '--change', change, '--ref', ref]);
    break;
  case 'flip-empty-line':
    run(['flip', '--change', 'feat-x', '--ref', 'alpha-custom', '--line', '', '--title', 'Alpha task']);
    break;
  case 'archive':
    run(['archive', '--change', change, '--decision', decision]);
    if (twice) run(['archive', '--change', change, '--decision', decision]);
    break;
  case 'validate':
    run(['validate', '--change', change]);
    break;
  case 'detect-two':
    fs.cpSync(
      path.join(projectRoot, 'openspec', 'changes', 'add-auth'),
      path.join(projectRoot, 'openspec', 'changes', 'second'),
      { recursive: true },
    );
    run(['detect']);
    break;
  default:
    console.log(JSON.stringify({ error: `unknown scenario: ${scenario}` }));
    process.exit(0);
}

if (emptyPathDir) fs.rmSync(emptyPathDir, { recursive: true, force: true });

function git(gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: projectRoot, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}
const count = git(['rev-list', '--count', 'HEAD']);
let archived = [];
try { archived = fs.readdirSync(path.join(projectRoot, 'openspec', 'changes', 'archive')).sort(); } catch (_) { archived = []; }

console.log(JSON.stringify({
  scenario,
  calls,
  lastSubject: git(['log', '-1', '--format=%s']),
  commitCount: count === null ? null : parseInt(count, 10),
  archived,
}));
