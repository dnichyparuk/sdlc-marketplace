#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const PLUGIN = 'plugins/sdlc-utilities';

function has(rel, sentinels) {
  let content;
  try {
    content = fs.readFileSync(path.join(REPO_ROOT, PLUGIN, rel), 'utf8');
  } catch (err) {
    process.stderr.write(`Script error reading ${rel}: ${err.message}\n`);
    process.exit(2);
  }
  return sentinels.every((s) => content.includes(s));
}

const risk = has('agents/plan-lens-risk.md', ['Runtime semantics (R71']);
const reviewer = has('agents/plan-reviewer.md', ['Runtime semantics (R71, under Verification strategy and Scope discipline)']);
const skill = has('skills/plan-sdlc/SKILL.md', ['(implements R71)']);

const ok = risk && reviewer && skill;

process.stdout.write(JSON.stringify({ ok, risk, reviewer, skill }) + '\n');
if (!ok) {
  process.exit(1);
}
