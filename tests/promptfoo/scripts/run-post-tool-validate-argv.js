#!/usr/bin/env node
/**
 * run-post-tool-validate-argv.js
 * Test wrapper for the post-tool-validate.js hook: a plan file whose name holds
 * shell syntax must reach the validator literally and must run no shell.
 * Writes two plan files named `a$(touch PWNED1)b.md` and "c`touch PWNED2`d.md"
 * into a temp project, feeds the hook a PostToolUse payload for each (stdin is a
 * regular file, so /dev/stdin opens), and reports whether anything was executed.
 *
 * Args: none
 *
 * Output JSON (one line):
 *   { runs: [{ exitCode, notFound, findings }, ...], pwned }
 *   notFound = stderr matches /file not found/; findings = stderr is not empty;
 *   pwned = PWNED1 or PWNED2 exists in the temp project or its plans/ directory.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Locate hook script
// ---------------------------------------------------------------------------

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
  console.log(JSON.stringify({ error: 'post-tool-validate.js not found' }));
  process.exit(1);
}

const hookScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'hooks', 'post-tool-validate.js');

// ---------------------------------------------------------------------------
// Build the temp project and run the hook once per file
// ---------------------------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ptv-argv-'));
const plansDir = path.join(tmp, 'plans');
fs.mkdirSync(plansDir);

const names = ['a$(touch PWNED1)b.md', 'c`touch PWNED2`d.md'];
const runs = [];

names.forEach((name, i) => {
  const planFile = path.join(plansDir, name);
  fs.writeFileSync(planFile, '# not a plan\n');
  const payloadFile = path.join(tmp, `payload-${i + 1}.json`);
  fs.writeFileSync(payloadFile, JSON.stringify({ tool_name: 'Write', tool_input: { file_path: planFile } }));
  const fd = fs.openSync(payloadFile, 'r');
  const r = spawnSync('node', [hookScript], {
    cwd: tmp,
    stdio: [fd, 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 10000,
  });
  fs.closeSync(fd);
  const stderr = r.stderr || '';
  runs.push({ exitCode: r.status, notFound: /file not found/.test(stderr), findings: stderr.trim() !== '' });
});

const pwned = ['PWNED1', 'PWNED2'].some(n => fs.existsSync(path.join(tmp, n)) || fs.existsSync(path.join(plansDir, n)));

fs.rmSync(tmp, { recursive: true, force: true });

console.log(JSON.stringify({ runs, pwned }));
