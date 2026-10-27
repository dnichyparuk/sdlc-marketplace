'use strict';
// Deterministic ENOENT-retry check for providers/claude-cli.js (ruling w2-plan Q2):
// PATH is an empty temp dir; attempt 1 fails with ENOENT inside callApi(); the stub
// `claude` is written synchronously after the call; the retry (1000 ms) finds it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cli-stub-'));
process.env.PATH = D;
process.env.SDLC_CLAUDE_CLI_RETRY_MS = '1000';
const which = () => { try { return execFileSync('/bin/sh', ['-c', 'command -v claude'], { env: { PATH: D }, encoding: 'utf8' }).trim(); } catch { return ''; } };
const before = which();
const P = require('../providers/claude-cli.js');
const pending = new P().callApi('x');
fs.writeFileSync(path.join(D, 'claude'), '#!/bin/sh\n/bin/cat >/dev/null\necho STUB-OK\n', { mode: 0o755 });
const after = which();
pending.then((result) => {
  process.stdout.write(JSON.stringify({ before, after, result }) + '\n');
  fs.rmSync(D, { recursive: true, force: true });
});
