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

const orchestrator = has('agents/plan-explore-orchestrator.md', [
  '**Fan-out is mandatory (R72).**',
  'you never explore inline in its place',
  '`Brief file: none` and `Error: <the tool error text>`',
  '**Result files (R72).**',
  '`<outDir>/dim-<dimension.name>.md`',
]);
const skill = has('skills/plan-sdlc/SKILL.md', [
  'Spawn the Agent exactly once with `subagent_type: sdlc:plan-explore-orchestrator`. Do not pass `model`, `effort`, isolation or background',
  '**Brief check (R72):**',
  'plan-explore.js" --check-brief',
]);

const ok = orchestrator && skill;

process.stdout.write(JSON.stringify({ ok, orchestrator, skill }) + '\n');
if (!ok) {
  process.exit(1);
}
