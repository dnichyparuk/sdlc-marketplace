#!/usr/bin/env node
/**
 * build-fixture-repo.js
 * Builds one small git fixture repository in the current (empty) directory for
 * a `claude plugin eval` case. Every case's scaffold.sh calls it with a kind.
 * The fixture commits once on `main`, then switches to a feature branch
 * (`eval-<kind>`) so commit-sdlc --auto and ship run off the default branch.
 *
 * Usage: node build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean>
 * Exit:  0 ok, 1 a git command failed (its stderr is passed through),
 *        2 usage or non-empty working directory.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const USAGE = 'usage: build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean>';

const README = [
  '# Eval fixture',
  '',
  'A small repository for sdlc plugin eval cases.',
  '',
].join('\n');

const CONFIG = [
  '{',
  '  "schemaVersion": 4,',
  '  "commit": {',
  '    "subjectPattern": "^(feat|fix|docs|chore)(\\\\([a-z0-9-]+\\\\))?: \\\\S.*$",',
  '    "subjectPatternError": "Use type(scope): subject, type one of feat, fix, docs, chore"',
  '  }',
  '}',
  '',
].join('\n');

const DIMENSION = [
  '---',
  'name: docs-clarity',
  'description: README text is clear and correct',
  'triggers: ["**/*.md"]',
  '---',
  'Flag README lines that are wrong, unclear or misspelled.',
  '',
].join('\n');

function planFor(first, second) {
  return [
    '# Eval fixture plan',
    '',
    '**Goal:** Add two comment lines to README.md.',
    '**Architecture:** Two one-line edits to one file.',
    '**Source:** eval fixture',
    '**Verification:** none',
    '',
    '### Task 1: Append the first comment to README.md',
    '',
    '**Complexity:** Trivial',
    '**Risk:** Low',
    '**Depends on:** none',
    '**Verify:** manual',
    '',
    '**Files:**',
    '- Modify: `README.md` — append one line',
    '',
    '**Acceptance criteria:**',
    `- [ ] The last line of README.md is \`${first}\``,
    '',
    '### Task 2: Append the second comment to README.md',
    '',
    '**Complexity:** Trivial',
    '**Risk:** Low',
    '**Depends on:** Task 1',
    '**Verify:** manual',
    '',
    '**Files:**',
    '- Modify: `README.md` — append one line',
    '',
    '**Acceptance criteria:**',
    `- [ ] The last line of README.md is \`${second}\``,
    '',
  ].join('\n');
}

const EXECUTE_PLAN = [
  '# Eval fixture plan',
  '',
  '**Goal:** Create two note files.',
  '**Architecture:** Two new files.',
  '**Source:** eval fixture',
  '**Verification:** none',
  '',
  '### Task 1: Create notes/one.txt',
  '',
  '**Complexity:** Trivial',
  '**Risk:** Low',
  '**Depends on:** none',
  '**Verify:** manual',
  '',
  '**Files:**',
  '- Create: `notes/one.txt`',
  '',
  '**Acceptance criteria:**',
  '- [ ] notes/one.txt contains the single line `one`',
  '',
  '### Task 2: Create notes/two.txt',
  '',
  '**Complexity:** Trivial',
  '**Risk:** Low',
  '**Depends on:** none',
  '**Verify:** manual',
  '',
  '**Files:**',
  '- Create: `notes/two.txt`',
  '',
  '**Acceptance criteria:**',
  '- [ ] notes/two.txt contains the single line `two`',
  '',
].join('\n');

const BASE_FILES = {
  'README.md': README,
  '.sdlc/config.json': CONFIG,
};

const FIXTURES = {
  commit: { branch: 'eval-commit', files: { ...BASE_FILES }, staged: true },
  'commit-crlf': { branch: 'eval-crlf', files: { ...BASE_FILES }, staged: true, crlf: true },
  review: {
    branch: 'eval-review',
    files: { ...BASE_FILES, '.sdlc/review-dimensions/docs-clarity.md': DIMENSION },
    staged: true,
  },
  execute: {
    branch: 'eval-execute',
    files: { ...BASE_FILES, 'docs/plans/eval-plan.md': EXECUTE_PLAN },
    staged: false,
  },
  ship: {
    branch: 'eval-ship',
    files: {
      ...BASE_FILES,
      '.sdlc/review-dimensions/docs-clarity.md': DIMENSION,
      'docs/plans/eval-plan.md': planFor('<!-- eval fixture: usage note -->', '<!-- eval fixture: help note -->'),
    },
    staged: false,
  },
  'ship-clean': {
    branch: 'eval-ship',
    files: {
      ...BASE_FILES,
      '.sdlc/review-dimensions/docs-clarity.md': DIMENSION,
      'docs/plans/eval-plan.md': planFor('<!-- eval fixture: comment only -->', '<!-- eval fixture: second comment -->'),
    },
    staged: false,
  },
};

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const kind = process.argv[2];
  const fixture = Object.prototype.hasOwnProperty.call(FIXTURES, kind) ? FIXTURES[kind] : null;
  if (!fixture || process.argv.length !== 3) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }

  const cwd = process.cwd();
  if (fs.readdirSync(cwd).length > 0) {
    process.stderr.write(`build-fixture-repo: workspace not empty: ${cwd}\n`);
    return 2;
  }

  const eol = (text) => (fixture.crlf ? text.replace(/\n/g, '\r\n') : text);

  try {
    git(cwd, ['init', '-q', '-b', 'main']);
    git(cwd, ['config', 'user.name', 'sdlc eval fixture']);
    git(cwd, ['config', 'user.email', 'eval-fixture@example.invalid']);
    git(cwd, ['config', 'commit.gpgsign', 'false']);
    git(cwd, ['config', 'core.autocrlf', 'false']);

    for (const [rel, content] of Object.entries(fixture.files)) {
      const abs = path.join(cwd, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, eol(content));
    }

    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', 'chore: fixture']);
    // The scaffold's own subject already matches the subject grader; remove it
    // so the grader can only see the eval run's commit.
    fs.rmSync(path.join(cwd, '.git', 'COMMIT_EDITMSG'), { force: true });
    git(cwd, ['switch', '-q', '-c', fixture.branch]);

    if (fixture.staged) {
      fs.appendFileSync(path.join(cwd, 'README.md'), eol('Second line.\n'));
      git(cwd, ['add', 'README.md']);
    }
  } catch (err) {
    if (err.stderr) process.stderr.write(err.stderr);
    else process.stderr.write(`build-fixture-repo: ${err.message}\n`);
    return 1;
  }

  const tracked = Object.keys(fixture.files);
  const lines = tracked.reduce((sum, rel) => {
    const text = fs.readFileSync(path.join(cwd, rel), 'utf8');
    return sum + (text.match(/\n/g) || []).length;
  }, 0);
  process.stdout.write(`fixture ${kind}: branch ${fixture.branch}, ${tracked.length} tracked files, ${lines} lines\n`);
  return 0;
}

process.exitCode = main();
