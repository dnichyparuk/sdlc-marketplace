#!/usr/bin/env node
/**
 * run-script-resolution-case.js
 * Test wrapper for the args-rule-skills and subagent-brief-root-line cases of
 * datasets/sdlc-script-resolution-exec.yaml.
 *
 * Each case reads skill text under the repo root (absolute paths, not the cwd) and prints one JSON
 * line that the case's assertions read. Both cases were `node -e` programs before; the output is
 * byte-compatible with them.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   args-rule-skills: script-resolution: (args-rule) EXPLICIT_FLAG_SKILLS lists the six request-text skills and the SKILL.md sentence names them
 *   subagent-brief-root-line: script-resolution: (R-subagent-brief) ship dispatch prompt and six step agents carry the plugin root line
 */

'use strict';

const path = require('path');
const fs = require('fs');

const NAME = 'run-script-resolution-case';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with the validate-plugin-consistency skill.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, '.claude', 'skills', 'validate-plugin-consistency', 'check-consistency.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with .claude/skills/validate-plugin-consistency\n`);
  process.exit(1);
}

function read(p) {
  return fs.readFileSync(path.join(repoRoot, p), 'utf8');
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

const SKILLS = ['error-report-sdlc', 'github-sdlc', 'harden-sdlc', 'jira-sdlc', 'plan-sdlc', 'received-review-sdlc'];
const STEPS = ['commit', 'review', 'received-review', 'version', 'pr', 'execute'];

const CASES = {
  'args-rule-skills'() {
    const match = read('.claude/skills/validate-plugin-consistency/check-consistency.js')
      .match(/EXPLICIT_FLAG_SKILLS\x20=\x20\[([^\]]*)\]/);
    const skillMd = read('.claude/skills/validate-plugin-consistency/SKILL.md');
    const sentence = SKILLS.every((n) => skillMd.includes('`' + n + '`'));
    console.log(JSON.stringify({ list: match && match[1], sentence }));
  },

  'subagent-brief-root-line'() {
    const never = "never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief).";
    const keep = 'the `sdlc plugin root:` line the skill names, not one of the other occurrences the skill tells you to ignore';
    const agent = (n) => read('plugins/sdlc-utilities/agents/ship-step-' + n + '.md');
    console.log(JSON.stringify({
      s: count(read('plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md'), '\\nsdlc plugin root: <PLUGIN_ROOT>\\n'),
      a: STEPS.map((n) => count(agent(n), never)),
      b: STEPS.map((n) => count(agent(n), keep)),
    }));
  },
};

function parseCase(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  return name;
}

CASES[parseCase(process.argv.slice(2))]();
