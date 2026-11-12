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
const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`', 'has a `## Verification` section, run its commands exactly as written'];

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
const STEP_RETURN = 'Never end your turn while a subagent you dispatched is still running';
const shipStepReview = has('agents/ship-step-review.md', [STEP_RETURN]);
const shipStepReceivedReview = has('agents/ship-step-received-review.md', [STEP_RETURN, 'Do not run `git commit`']);
const shipSkill = has('skills/ship-sdlc/SKILL.md', ['wave-watch']);
const shipStale = has('skills/ship-sdlc/SKILL.md', ['**Stale hand-backs (R98).**']);
const executeStale = has('skills/execute-plan-sdlc/SKILL.md', ['**Stale hand-backs (R91).**']);
const waveRunnerStale = has('skills/execute-plan-sdlc/wave-runner-template.md', ['**Stale hand-backs (R91).**']);
const WAIT = 'wave-progress --wait';
const NO_MONITOR = 'Never start `Monitor`';
const waitSkill = has('skills/execute-plan-sdlc/SKILL.md', [WAIT, '--wait --tasks', NO_MONITOR]);
const waitWaveRunner = has('skills/execute-plan-sdlc/wave-runner-template.md', [WAIT, '--wait --tasks', NO_MONITOR]);
const waitShipStepExecute = has('agents/ship-step-execute.md', [WAIT]);
const workers = {};
for (const name of ['execute-worker', 'execute-worker-complex', 'execute-worker-batch']) {
  workers[name] = has(`agents/${name}.md`, WORKER_SENTINELS);
}

const ok = skill && waveRunner && shipStepExecute && shipStepReview && shipStepReceivedReview && shipSkill && shipStale && executeStale && waveRunnerStale && waitSkill && waitWaveRunner && waitShipStepExecute && Object.values(workers).every(Boolean);

process.stdout.write(JSON.stringify({ ok, skill, waveRunner, shipStepExecute, shipStepReview, shipStepReceivedReview, shipSkill, shipStale, executeStale, waveRunnerStale, waitSkill, waitWaveRunner, waitShipStepExecute, workers }) + '\n');
if (!ok) {
  process.exit(1);
}
