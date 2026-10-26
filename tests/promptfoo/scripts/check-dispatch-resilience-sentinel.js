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

// The same resilience property as before: every dispatch layer that runs as a subagent is told,
// in its own prompt text, that it still has the Agent tool and must dispatch instead of self-blocking.
// Execute's main context: the kept Nested-dispatch paragraph and the top-of-Step-5 sentence (B3).
// The wave-runner (runner mode): the §2 sentence that replaced the deleted disambiguation copy (B33).
const SKILL_SENTINEL = 'Nested Agent dispatch is supported — being dispatched as a subagent does not remove your Agent tool';
const STEP5_SENTINEL = 'When ship-sdlc dispatches you as a subagent you still have the Agent tool — dispatch workers normally.';
const RUNNER_SENTINEL = 'You run as a subagent and you still have the Agent tool — dispatch the workers normally; never report that no agent-dispatch tool is available.';

let skillContent;
let waveRunnerContent;
try {
  skillContent = fs.readFileSync(
    path.join(REPO_ROOT, 'plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md'),
    'utf8'
  );
} catch (err) {
  process.stderr.write(`Script error reading SKILL.md: ${err.message}\n`);
  process.exit(2);
}
try {
  waveRunnerContent = fs.readFileSync(
    path.join(REPO_ROOT, 'plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md'),
    'utf8'
  );
} catch (err) {
  process.stderr.write(`Script error reading wave-runner-template.md: ${err.message}\n`);
  process.exit(2);
}

const inSkill = skillContent.includes(SKILL_SENTINEL);
const inSkillStep5 = skillContent.includes(STEP5_SENTINEL);
const inWaveRunner = waveRunnerContent.includes(RUNNER_SENTINEL);
const ok = inSkill && inSkillStep5 && inWaveRunner;

process.stdout.write(JSON.stringify({ ok, inSkill, inSkillStep5, inWaveRunner }) + '\n');
if (!ok) {
  process.exit(1);
}
