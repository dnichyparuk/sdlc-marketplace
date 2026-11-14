'use strict';
// Stub-`claude` check for providers/claude-cli.js error detail and the usage-limit latch.
// Usage: run-claude-cli-limit-stub.js <limit|exit|ok>. PATH is the temp dir only, so the
// stub uses shell builtins and /bin/cat. Prints one JSON line.
const fs = require('fs');
const os = require('os');
const path = require('path');
const mode = process.argv[2];
const LIMIT_MSG = "You've hit your 5-hour limit · resets 9pm (UTC)";
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-cli-limit-'));
const marker = path.join(D, 'marker');
const bodies = {
  limit: `echo call >> "${marker}"\necho "${LIMIT_MSG}"\nexit 1\n`,
  exit: 'echo TAIL-MARKER-77\nexit 3\n',
  ok: `echo "${LIMIT_MSG}"\n`,
};
process.env.PATH = D;

async function main() {
  if (!bodies[mode]) throw new Error(`unknown mode: ${mode}`);
  fs.writeFileSync(path.join(D, 'claude'), `#!/bin/sh\n/bin/cat >/dev/null\n${bodies[mode]}`, { mode: 0o755 });
  const P = require('../providers/claude-cli.js');
  const provider = new P();
  if (mode === 'limit') {
    const first = await provider.callApi('x');
    const second = await provider.callApi('x');
    const calls = fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).length;
    return { first, second, calls };
  }
  return { result: await provider.callApi('x') };
}

main().then(
  (out) => {
    process.stdout.write(JSON.stringify(out) + '\n');
  },
  (err) => {
    process.stdout.write(JSON.stringify({ error: String((err && err.message) || err) }) + '\n');
    process.exitCode = 1;
  },
).finally(() => {
  fs.rmSync(D, { recursive: true, force: true });
});
