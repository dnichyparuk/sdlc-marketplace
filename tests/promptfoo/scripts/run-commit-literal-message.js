#!/usr/bin/env node
/**
 * run-commit-literal-message.js
 * Test wrapper for commit-sdlc Step 5: the commit message reaches git, the subject
 * gate and the link check only through a message file (C14).
 * Extracts three snippets from plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md
 * (the quoted-heredoc block, the subject-gate block, the `git commit -F` command),
 * runs them in a temp git repo with a message holding `"`, `$(...)` and backticks,
 * and reports whether the committed body equals the message and whether anything ran.
 *
 * Args: none
 *
 * Output JSON (one line):
 *   { gateExit, body, literal, pwned, wipGateExit }
 *   or { error: "block not found: <which>" } with exit 1.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Locate the repo root and read SKILL.md
// ---------------------------------------------------------------------------

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}

if (!repoRoot) {
  console.log(JSON.stringify({ error: 'SKILL.md not found' }));
  process.exit(1);
}

const skill = fs.readFileSync(path.join(repoRoot, 'plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md'), 'utf8');
const skillLines = skill.split('\n');

// ---------------------------------------------------------------------------
// Extract the snippets
// ---------------------------------------------------------------------------

// Fenced ```bash blocks, with the opening fence's indentation removed from each line
// (the blocks sit inside a list item; the model strips it when it runs them).
function fencedBlocks() {
  const blocks = [];
  for (let i = 0; i < skillLines.length; i++) {
    const open = /^(\s*)```bash\s*$/.exec(skillLines[i]);
    if (!open) continue;
    const indent = open[1];
    const body = [];
    let j = i + 1;
    while (j < skillLines.length && skillLines[j] !== `${indent}\`\`\``) {
      body.push(skillLines[j].startsWith(indent) ? skillLines[j].slice(indent.length) : skillLines[j]);
      j++;
    }
    blocks.push(body.join('\n'));
    i = j;
  }
  return blocks;
}

const blocks = fencedBlocks();
const heredocBlock = blocks.find(b => b.includes("<<'SDLC_COMMIT_MSG'"));
const gateBlock = blocks.find(b => b.includes('"<COMMIT_CONTEXT_FILE>" "<MSG_FILE>"'));
const commitMatch = /`(git commit -F "<MSG_FILE>")`/.exec(skill);

for (const [which, found] of [['heredoc', heredocBlock], ['subject gate', gateBlock], ['git commit -F', commitMatch]]) {
  if (!found) {
    console.log(JSON.stringify({ error: `block not found: ${which}` }));
    process.exit(1);
  }
}
const commitCommand = commitMatch[1];

// ---------------------------------------------------------------------------
// Run the snippets in a temp git repo
// ---------------------------------------------------------------------------

const dirs = [];

function runOnce(message) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-literal-'));
  dirs.push(repo);
  const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git('add', 'a.txt');
  fs.writeFileSync(path.join(repo, 'm.json'), JSON.stringify({ commitConfig: { subjectPattern: '^fix: ' } }));

  // Substitute with split/join: the message holds `$`, which String.replace would expand.
  const withMessage = heredocBlock.split('\n').map(l => (l === '<message>' ? message : l)).join('\n');
  const script = [
    withMessage,
    gateBlock,
    `GATE=$?; echo "GATE=$GATE"; [ "$GATE" -eq 0 ] && ${commitCommand}`,
  ].join('\n')
    .split('<MSG_FILE>').join(path.join(repo, 'm.msg'))
    .split('<COMMIT_CONTEXT_FILE>').join(path.join(repo, 'm.json'));

  const r = spawnSync('bash', ['-c', script], { cwd: repo, encoding: 'utf8' });
  const gate = /GATE=(\d+)/.exec(r.stdout || '');
  const gateExit = gate ? Number(gate[1]) : null;
  const body = git('log', '-1', '--format=%B').stdout || '';
  const pwned = ['PWNED1', 'PWNED2'].some(n => fs.existsSync(path.join(repo, n)));
  return { gateExit, body, pwned };
}

const message = 'fix: keep "quotes", $(touch PWNED1) and `touch PWNED2` literal\n\nBody $HOME stays literal.';
const first = runOnce(message);
const wip = runOnce('wip: x');

for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });

console.log(JSON.stringify({
  gateExit: first.gateExit,
  body: first.body,
  literal: first.body.trim() === message.trim(),
  pwned: first.pwned || wip.pwned,
  wipGateExit: wip.gateExit,
}));
