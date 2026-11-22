'use strict';
// In-process stub gh, loaded with `node -r` by run-github-case.js before the target script.
// It replaces child_process.spawnSync so a spawnSync('gh', ...) call is answered by
// fixtures-fs/stub-bin-gh-issues/lib/gh-stub.js in this process, without starting the binary,
// but only when the stub binary is the first `gh` on the call's PATH; any other call goes to the
// real spawnSync (so a PATH without gh still fails with ENOENT). A timeout answer whose sleep is at
// least the call's `timeout` returns at once as a timed-out result. Shell calls (execSync('gh ...'))
// are not intercepted and still run the binary. Both spawnSync(cmd, args, options) and
// spawnSync(cmd, options) are handled; an error inside the stub returns status 1 with the message on stderr.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { answer, sleepSync } = require('../fixtures-fs/stub-bin-gh-issues/lib/gh-stub.js');

const STUB_GH = path.resolve(__dirname, '..', 'fixtures-fs', 'stub-bin-gh-issues', 'bin', 'gh');
const real = cp.spawnSync;

function firstGhOnPath(searchPath) {
  for (const dir of (searchPath || '').split(path.delimiter).filter(Boolean)) {
    const full = path.resolve(dir, 'gh');
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch (_) { /* next */ }
  }
  return null;
}

function text(value, encoding) {
  return encoding && encoding !== 'buffer' ? value : Buffer.from(value);
}

function timedOut(args, encoding) {
  const error = Object.assign(new Error('spawnSync gh ETIMEDOUT'), {
    errno: -110, code: 'ETIMEDOUT', syscall: 'spawnSync gh', path: 'gh', spawnargs: args,
  });
  const out = text('', encoding);
  const err = text('', encoding);
  return { error, pid: 0, output: [null, out, err], stdout: out, stderr: err, status: null, signal: 'SIGTERM' };
}

function result(r, encoding) {
  const out = text(r.stdout, encoding);
  const err = text(r.stderr, encoding);
  return { pid: 0, output: [null, out, err], stdout: out, stderr: err, status: r.status, signal: null };
}

cp.spawnSync = function spawnSync(cmd, args, opts = {}) {
  if (args !== null && args !== undefined && !Array.isArray(args) && typeof args === 'object') {
    opts = args; // spawnSync(cmd, options)
    args = [];
  }
  opts = opts || {};
  const env = opts.env || process.env;
  if (cmd !== 'gh' || firstGhOnPath(env.PATH) !== STUB_GH) return real.apply(this, arguments);
  let r;
  try {
    r = answer(args || [], env, opts.input);
  } catch (err) {
    // The stub binary would crash with exit 1; return that instead of throwing into the caller.
    return result({ stdout: '', stderr: `gh-inprocess: ${err.message}\n`, status: 1 }, opts.encoding);
  }
  if (opts.timeout && r.sleepMs >= opts.timeout) return timedOut(args || [], opts.encoding);
  if (r.sleepMs) sleepSync(r.sleepMs);
  return result(r, opts.encoding);
};
