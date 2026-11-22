'use strict';
// Target script for the github-sdlc exec case on gh-inprocess.js call forms; run by
// run-github-case.js --script. Prints one JSON line with the result of two spawnSync('gh') calls.
const cp = require('child_process');
const extra = process.argv.slice(2);
if (extra.length) { process.stderr.write(`gh-inprocess-forms: unexpected argument: ${extra[0]}\n`); process.exit(2); }
const a = cp.spawnSync('gh', { encoding: 'utf8' });
const b = cp.spawnSync('gh', ['issue', 'list'], { encoding: 'utf8', env: { ...process.env, GH_STUB_DATA: 'no-such-scenario' } });
process.stdout.write(JSON.stringify({
  optionsForm: { status: a.status, stdoutType: typeof a.stdout },
  answerThrows: { status: b.status, stderr: b.stderr },
}) + '\n');
