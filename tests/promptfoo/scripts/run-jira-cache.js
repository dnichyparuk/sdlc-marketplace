#!/usr/bin/env node
/**
 * run-jira-cache.js
 * Test wrapper for the file-changing jira.js cache flags (--clear, --save-field,
 * --init-templates, --copy-template) and --cache-dir. Their effect is only visible to a second
 * call in the same HOME, so the wrapper runs the calls in order and reports them.
 *
 * Usage:
 *   node run-jira-cache.js --scenario clear|save-field|init-templates|copy-template|cache-dir --home <dir> --project <KEY>
 *
 * The wrapper copies --home into its own temp dir and runs every call with that
 * as HOME and cwd, so neither the real HOME nor the fixture is ever written.
 *
 * stdout (one JSON line):
 *   {"scenario":"<name>","calls":[{"args":[...],"exitCode":<n>,"stdout":"<text>"}],
 *    "files":{"<relative path>":true|false}}
 * jira.js prints the path of a JSON output file; "stdout" holds that file's content.
 *
 * Usage errors (missing or unknown --scenario, missing --home or --project,
 * unknown flag, a --home that does not exist): exit 2, message on stderr, nothing on stdout.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const SCENARIOS = ['clear', 'save-field', 'init-templates', 'copy-template', 'cache-dir'];

function usage(msg) {
  process.stderr.write(`run-jira-cache: ${msg}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
let scenario = null;
let home = null;
let project = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--scenario' && argv[i + 1]) scenario = argv[++i];
  else if (a === '--home' && argv[i + 1]) home = argv[++i];
  else if (a === '--project' && argv[i + 1]) project = argv[++i];
  else usage(`unknown flag or missing value: ${a}`);
}
if (!scenario) usage('--scenario is required');
if (!SCENARIOS.includes(scenario)) usage(`unknown scenario: ${scenario}`);
if (!home) usage('--home is required');
if (!project) usage('--project is required');
if (!fs.existsSync(path.resolve(home))) usage(`--home not found: ${home}`);

const jiraScript = path.resolve(__dirname, '..', '..', '..', 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'jira.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cache-wrap-'));

const calls = [];
function run(args, stdin) {
  const res = spawnSync('node', [jiraScript, '--project', project, ...args], {
    cwd: tmp,
    env: { ...process.env, HOME: tmp, TMPDIR: tmp },
    input: stdin === undefined ? '' : stdin,
    encoding: 'utf8',
    timeout: 15_000,
  });
  let out = (res.stdout || '').trim();
  try {
    if (out && fs.existsSync(out)) out = fs.readFileSync(out, 'utf8').trim();
  } catch (_) { /* keep raw stdout */ }
  calls.push({ args, exitCode: res.status ?? -1, stdout: out });
}

const cacheRel = '.sdlc-cache/jira/mycompany_atlassian_net/' + project + '.json';
const checks = [cacheRel];

let outside = null;
try {
  fs.cpSync(path.resolve(home), tmp, { recursive: true });
  switch (scenario) {
    case 'clear':
      run(['--clear']);
      run(['--check']);
      break;
    case 'cache-dir': {
      // The cache leaves HOME, so only --cache-dir can find it.
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cache-dir-'));
      fs.renameSync(path.join(tmp, '.sdlc-cache'), path.join(outside, '.sdlc-cache'));
      const dir = path.join(outside, '.sdlc-cache', 'jira', 'mycompany_atlassian_net');
      run(['--check', '--cache-dir', dir]);
      run(['--check']);
      break;
    }
    case 'save-field':
      // --save-field reads its JSON from stdin.
      run(['--save-field', 'savedNote'], JSON.stringify({ text: 'hello-roundtrip' }));
      run(['--load']);
      break;
    case 'init-templates':
      run(['--init-templates']);
      checks.push('.sdlc/jira-templates/Task.md');
      break;
    case 'copy-template':
      run(['--copy-template', '--type', 'Custom', '--from', 'Bug']);
      checks.push('.sdlc/jira-templates/Custom.md');
      break;
  }

  const files = {};
  for (const rel of checks) files[rel] = fs.existsSync(path.join(tmp, rel));
  console.log(JSON.stringify({ scenario, calls, files }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  if (outside) fs.rmSync(outside, { recursive: true, force: true });
}
