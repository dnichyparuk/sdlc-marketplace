#!/usr/bin/env node
/**
 * run-post-tool-validate-plans.js
 * Test wrapper for the post-tool-validate.js hook on plans/*.md files: writes the case's
 * files into a temp project, feeds the hook a PostToolUse payload for the first file
 * (stdin is a regular file, so /dev/stdin opens), and reports what the hook did.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, a missing value, an unknown
 *                   name, an unknown argument) exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases:
 *   readme-no-task:  docs/plans/README.md with no task heading
 *   fenced-task-only: docs/plans/notes.md with a task heading only inside a code fence
 *   plan-no-goal:    docs/plans/p.md with a task heading and no **Goal:** line
 *   archived-docs, archive-plans: a failing plan under an archived/archive segment (skipped)
 *   archive-above-root: the archive segment is above the hook cwd (validated)
 *   outside-root:    the plan is outside the hook cwd (validated)
 *   archived-substring, archives-segment: near-miss segment names (validated)
 *
 * Output JSON (one line): { exitCode, stdout, stderr }
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const NAME = 'run-post-tool-validate-plans';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

const FAILING_PLAN = '# P\n\n### Task 1: x\n';

// Case name -> [relative path of the edited file, its content, optional cwd relative to the temp dir].
const CASES = {
  'readme-no-task': ['docs/plans/README.md', '# Plans\n\nIndex.\n'],
  'fenced-task-only': ['docs/plans/notes.md', '# Notes\n\n```\n### Task 1: x\n```\n'],
  'plan-no-goal': ['docs/plans/p.md', '# P\n\n### Task 1: x\n'],
  'archived-docs': ['docs/archived/plans/x.md', FAILING_PLAN],
  'archive-plans': ['plans/archive/x.md', FAILING_PLAN],
  'archive-above-root': ['x/archive/proj/docs/plans/p.md', FAILING_PLAN, 'x/archive/proj'],
  'outside-root': ['archived/plans/p.md', FAILING_PLAN, 'proj'],
  'archived-substring': ['docs/plans-archived-notes/plans/p.md', FAILING_PLAN],
  'archives-segment': ['archives/plans/p.md', FAILING_PLAN],
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

const caseName = parseCase(process.argv.slice(2));

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/hooks/post-tool-validate.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: post-tool-validate.js not found\n`);
  process.exit(1);
}
const hookScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'hooks', 'post-tool-validate.js');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ptv-plans-')));
const [rel, content, cwdRel = '.'] = CASES[caseName];
const hookCwd = path.join(tmp, cwdRel);
fs.mkdirSync(hookCwd, { recursive: true });
const planFile = path.join(tmp, rel);
fs.mkdirSync(path.dirname(planFile), { recursive: true });
fs.writeFileSync(planFile, content);
const payloadFile = path.join(tmp, 'payload.json');
fs.writeFileSync(payloadFile, JSON.stringify({ tool_name: 'Write', tool_input: { file_path: planFile } }));

const fd = fs.openSync(payloadFile, 'r');
const r = spawnSync('node', [hookScript], { cwd: hookCwd, stdio: [fd, 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000 });
fs.closeSync(fd);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(JSON.stringify({ exitCode: r.status, stdout: r.stdout || '', stderr: r.stderr || '' }));
