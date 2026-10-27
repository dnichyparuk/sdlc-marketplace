#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// W8.29 (#9161): every fixture setup.sh that runs `git init` or `git config` must refuse to run inside an
// existing git work tree, before its first such command. Without the guard, a setup.sh run from the wrong
// directory of a linked worktree rewrites the SHARED .git/config.
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests/promptfoo/fixtures-fs');
const GUARD_LINE = 'if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi';
const PROBE_FIXTURE = 'project-execute-prepare';

function findSetupScripts(dir) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSetupScripts(full));
    } else if (entry.isFile() && entry.name === 'setup.sh') {
      found.push(full);
    }
  }
  return found;
}

function isGitLine(line) {
  const trimmed = line.trim();
  return !trimmed.startsWith('#') && (trimmed.includes('git init') || trimmed.includes('git config'));
}

function scanGuards() {
  let scanned = 0;
  const unguarded = [];
  for (const file of findSetupScripts(FIXTURES_DIR)) {
    const content = fs.readFileSync(file, 'utf8');
    if (!content.includes('git init') && !content.includes('git config')) continue;
    scanned++;
    const lines = content.split('\n');
    const guardAt = lines.findIndex((l) => l.trimEnd() === GUARD_LINE);
    const gitAt = lines.findIndex(isGitLine);
    if (guardAt === -1 || (gitAt !== -1 && guardAt > gitAt)) {
      unguarded.push(path.relative(FIXTURES_DIR, path.dirname(file)).split(path.sep).join('/'));
    }
  }
  return { ok: unguarded.length === 0, scanned, unguarded };
}

// Part (ii): run a guarded setup.sh inside a git work tree of its own and report what it did.
function probe() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-guard-probe-'));
  try {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    const init = spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf8' });
    if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
    const gitConfig = path.join(repo, '.git', 'config');
    const before = fs.readFileSync(gitConfig, 'utf8');
    const fx = path.join(repo, 'fx');
    fs.cpSync(path.join(FIXTURES_DIR, PROBE_FIXTURE), fx, { recursive: true });
    const run = spawnSync('bash', ['setup.sh'], { cwd: fx, encoding: 'utf8' });
    const after = fs.readFileSync(gitConfig, 'utf8');
    return { exitCode: run.status, stderr: (run.stderr || '').trim(), gitConfigChanged: before !== after };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  if (process.argv.includes('--probe')) {
    process.stdout.write(JSON.stringify(probe()) + '\n');
  } else {
    const result = scanGuards();
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
