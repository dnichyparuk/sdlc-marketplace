#!/usr/bin/env node
'use strict';

// R75 sentinels: the plan-critique-orchestrator agent file carries its frontmatter,
// await barrier, statuses and script calls, and never asks the user or writes markers.

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const REL = 'plugins/sdlc-utilities/agents/plan-critique-orchestrator.md';

let content;
try {
  content = fs.readFileSync(path.join(REPO_ROOT, REL), 'utf8');
} catch (err) {
  process.stderr.write(`Script error reading ${REL}: ${err.message}\n`);
  process.exit(2);
}

const frontmatter = [
  '---\nname: plan-critique-orchestrator\n',
  '\ntools: Read, Write, Bash, Agent\n',
  '\nmodel: sonnet\n',
  '\neffort: medium\n',
].every((s) => content.includes(s));

const sentinels = [
  'Your turn is NOT complete until you have collected exactly one result per dispatched agent.',
  '`ok`',
  '`guardrail-block`',
  '`max-iterations`',
  '`no-agent-tool`',
  '`error`',
  'never ask',
  'only under',
  'critique-prep',
  'merge-lanes',
  '--compact',
  'diff-material',
  '--g17-not-run',
  'G17_NOT_RUN',
  'AUTHOR_MODEL',
];
const missing = sentinels.filter((s) => !content.includes(s));
const forbidden = ['AskUserQuestion', '--mark'].filter((s) => content.includes(s));

const ok = frontmatter && missing.length === 0 && forbidden.length === 0;

process.stdout.write(JSON.stringify({ ok, frontmatter, missing, forbidden }) + '\n');
if (!ok) {
  process.exit(1);
}
