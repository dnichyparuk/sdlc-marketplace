#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const USAGE = 'Usage: check-pr-gh-ref-sentinels.js [--file <repo-relative path>]\n';
const DEFAULT_FILE = 'plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md';

const args = process.argv.slice(2);
let file = DEFAULT_FILE;
if (args.length === 2 && args[0] === '--file') {
  file = args[1];
} else if (args.length !== 0) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

let content;
try {
  content = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
} catch (err) {
  process.stderr.write(`Script error reading ${file}: ${err.message}\n`);
  process.exit(2);
}

const RETRY_NEEDLE = 'with the same arguments **exactly once** (the same `--base` and `--head`';
const counts = { createCalls: 0, createWithRefs: 0, editCalls: 0, editWithBranch: 0, retryRefs: 0 };

let inFence = false;
for (const line of content.split('\n')) {
  const t = line.trim();
  if (t.startsWith('```')) {
    inFence = !inFence;
    continue;
  }
  if (!inFence) continue;
  if (t.startsWith('gh pr create')) {
    counts.createCalls++;
    if (t.includes("--base '<baseBranch>' --head '<currentBranch>'")) counts.createWithRefs++;
  } else if (t.startsWith('gh pr edit')) {
    counts.editCalls++;
    if (t.startsWith("gh pr edit '<currentBranch>' ")) counts.editWithBranch++;
  }
}
counts.retryRefs = content.split(RETRY_NEEDLE).length - 1;

const ok = counts.createCalls >= 1 && counts.createWithRefs === counts.createCalls &&
  counts.editCalls >= 1 && counts.editWithBranch === counts.editCalls && counts.retryRefs === 1;

process.stdout.write(JSON.stringify({ ok, file, counts }) + '\n');
process.exit(ok ? 0 : 1);
