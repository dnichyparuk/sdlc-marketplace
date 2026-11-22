#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

if (process.argv.length > 2) {
  process.stderr.write('Usage: check-ship-tool-handling-sentinels.js (no arguments)\n');
  process.exit(2);
}

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const SKILL = 'plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md';

function count(rel, needle) {
  let content;
  try {
    content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
  } catch (err) {
    process.stderr.write(`Script error reading ${rel}: ${err.message}\n`);
    process.exit(2);
  }
  return content.split(needle).length - 1;
}

const counts = {
  mktempRead: count(SKILL, 'Read that empty file once (the Write tool refuses a file that was not read)'),
  mktempOld: count(SKILL, 'note the printed path; write'),
  todoGuard: count(SKILL, 'when that tool is available (skip the call when it is not)'),
  todoOld: count(SKILL, 'call `TodoWrite` with it and echo'),
  deferredLoad: count(SKILL, 'first load both with one `ToolSearch` call, query `select:Monitor,TaskStop`'),
};
const ok = counts.mktempRead === 1 && counts.mktempOld === 0 &&
  counts.todoGuard === 2 && counts.todoOld === 0 && counts.deferredLoad === 1;

process.stdout.write(JSON.stringify({ ok, counts }) + '\n');
process.exit(ok ? 0 : 1);
