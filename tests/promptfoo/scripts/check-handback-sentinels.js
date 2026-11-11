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
const HANDBACK = 'No hand-back mid-wave (R86)';
const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`'];

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

const skill = has('skills/execute-plan-sdlc/SKILL.md', [HANDBACK]);
const waveRunner = has('skills/execute-plan-sdlc/wave-runner-template.md', [HANDBACK]);
const shipStepExecute = has('agents/ship-step-execute.md', [
  'Never end your turn while a worker or wave-runner you dispatched is still running',
]);
const shipSkill = has('skills/ship-sdlc/SKILL.md', ['wave-watch']);
const workers = {};
for (const name of ['execute-worker', 'execute-worker-complex', 'execute-worker-batch']) {
  workers[name] = has(`agents/${name}.md`, WORKER_SENTINELS);
}

const ok = skill && waveRunner && shipStepExecute && shipSkill && Object.values(workers).every(Boolean);

process.stdout.write(JSON.stringify({ ok, skill, waveRunner, shipStepExecute, shipSkill, workers }) + '\n');
if (!ok) {
  process.exit(1);
}
