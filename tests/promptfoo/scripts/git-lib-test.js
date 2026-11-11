/**
 * git-lib-test.js — exercise exported helpers in lib/git.js.
 *
 * Used by datasets/git-lib-exec.yaml tests via
 *   script_path: "repo://tests/promptfoo/scripts/git-lib-test.js".
 * The lib path is resolved relative to this script's real __dirname so it works
 * regardless of cwd.
 *
 * Usage:
 *   node git-lib-test.js --op <operation> [--project-root <path>] [--base <branch>]
 *                        [--scope <name-only|stat|content|cached>] [--no-throw-check]
 *
 * Operations:
 *   exports             — prints which helpers are exported (presence-only check)
 *   fetchBaseRef        — invokes fetchBaseRef(base, projectRoot); prints {ok:true} when no exception
 *                         (best-effort by contract — never throws, even when origin missing/unreachable)
 *   buildDiffCmd        — invokes buildBranchContribDiffCmd(scope, base) and prints the resulting
 *                         git command string. Used to assert 3-dot semantics for branch-contribution
 *                         scopes (committed/stat/content) — issue #239.
 *   getChangedFilesScope — invokes getChangedFiles(base, projectRoot, scope) against a fixture repo
 *                         and prints {scope, base, files}. Used to assert default 'all' scope routes
 *                         through buildBranchContribDiffCmd (three-dot) — issue #364.
 *   execMaxBuffer               — basic sanity check that exec() succeeds for a trivial command.
 *   execDefaultMaxBufferApplied — proves the default 50MB maxBuffer (not Node's 1MB execSync
 *                         default) is actually applied — issue #522.
 *   execMaxBufferOverflow       — proves exec() throws on overflow and reports the actual
 *                         effective byte limit for the call — issue #522.
 *   execNormalFailure          — proves non-overflow failures still return null (throwOnError=false).
 *   execGhTimeoutApplied       — proves every gh call through exec() carries GH_TIMEOUT_MS and other commands none (#9188).
 *   probeGhAuthTimeout         — proves a timed-out gh auth status reports timedOut, a plain failure reports "Not logged in" (#9237).
 */
'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const cp   = require('child_process');

// Resolve lib path relative to this script — works correctly when run as a real file.
const REPO_ROOT = path.resolve(__dirname, '../../..');
const LIB_PATH  = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'git.js');

// --- Arg parsing ---
const args = process.argv.slice(2);
function getArg(name) {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

const op          = getArg('--op');
const projectRoot = getArg('--project-root');
const base        = getArg('--base') || 'main';
const scope       = getArg('--scope');

if (!op) {
  console.error('--op is required');
  process.exit(1);
}

const lib = require(LIB_PATH);

switch (op) {
  case 'exports': {
    console.log(JSON.stringify({
      hasFetchBaseRef:               typeof lib.fetchBaseRef === 'function',
      hasBuildBranchContribDiffCmd:  typeof lib.buildBranchContribDiffCmd === 'function',
      hasGetChangedFiles:            typeof lib.getChangedFiles === 'function',
      hasGetDiffStat:                typeof lib.getDiffStat === 'function',
      hasGetDiffContent:             typeof lib.getDiffContent === 'function',
    }, null, 2));
    break;
  }

  case 'fetchBaseRef': {
    if (!projectRoot) {
      console.error('--project-root required for fetchBaseRef');
      process.exit(1);
    }
    try {
      lib.fetchBaseRef(base, projectRoot);
      console.log(JSON.stringify({ ok: true, threw: false }, null, 2));
    } catch (err) {
      // By contract this MUST NOT throw — surface the failure for the test to assert.
      console.log(JSON.stringify({ ok: false, threw: true, message: String(err && err.message) }, null, 2));
      process.exit(1);
    }
    break;
  }

  case 'buildDiffCmd': {
    if (!scope) {
      console.error('--scope required for buildDiffCmd (committed|stat|content|cached|worktree)');
      process.exit(1);
    }
    if (typeof lib.buildBranchContribDiffCmd !== 'function') {
      console.error('buildBranchContribDiffCmd is not exported');
      process.exit(1);
    }
    const cmd = lib.buildBranchContribDiffCmd(scope, base);
    console.log(JSON.stringify({ scope, base, cmd }, null, 2));
    break;
  }

  case 'getChangedFilesScope': {
    if (!projectRoot) {
      console.error('--project-root required for getChangedFilesScope');
      process.exit(1);
    }
    if (!scope) {
      console.error('--scope required for getChangedFilesScope (all|committed|staged|working|worktree)');
      process.exit(1);
    }
    if (typeof lib.getChangedFiles !== 'function') {
      console.error('getChangedFiles is not exported');
      process.exit(1);
    }
    const files = lib.getChangedFiles(base, projectRoot, scope);
    console.log(JSON.stringify({ scope, base, files }, null, 2));
    break;
  }

  case 'execMaxBuffer': {
    // Verify exec() succeeds for a trivial command (basic sanity check — does not by
    // itself prove the 50MB limit is applied; see execDefaultMaxBufferApplied for that).
    const out = lib.exec('echo hello');
    console.log(JSON.stringify({ ok: out === 'hello', output: out }, null, 2));
    break;
  }

  case 'execDefaultMaxBufferApplied': {
    // Verify the configured 50MB maxBuffer (not Node's 1MB execSync default) is actually
    // applied when no opts.maxBuffer override is given. 2MB of output would fail under
    // Node's 1MB default but succeeds under git.js's 50MB default.
    const size = 2 * 1024 * 1024;
    const out = lib.exec(`node -e "process.stdout.write('x'.repeat(${size}))"`);
    console.log(JSON.stringify({ ok: out !== null && out.length === size, length: out === null ? null : out.length }, null, 2));
    break;
  }

  case 'execMaxBufferOverflow': {
    // Verify exec() throws on buffer overflow when maxBuffer is exceeded, and that the
    // thrown message reports the actual effective limit for this call (opts.maxBuffer
    // override), not a hardcoded constant unrelated to what was really configured.
    try {
      lib.exec('echo hello world this is a long string that exceeds ten bytes', { maxBuffer: 10 });
      console.log(JSON.stringify({ threw: false }, null, 2));
    } catch (e) {
      console.log(JSON.stringify({ threw: true, message: e.message }, null, 2));
    }
    break;
  }

  case 'execGhTimeoutApplied': {
    // #9188: every gh call through exec() carries GH_TIMEOUT_MS; other commands carry none.
    // A recording execSync is injected before a fresh require of lib/git.js; no gh runs, no timer.
    const calls = [];
    const realExecSync = cp.execSync;
    cp.execSync = (cmd, opts) => {
      calls.push({ cmd, timeout: opts ? opts.timeout : undefined });
      if (/^gh auth status --json/.test(cmd)) return '{"hosts":{"github.com":[{"state":"success","active":true,"login":"stub-user"}]}}';
      if (/^gh auth status/.test(cmd)) return 'Logged in to github.com account stub-user';
      if (/^gh api user/.test(cmd)) return 'stub-user';
      return 'ok';
    };
    delete require.cache[require.resolve(LIB_PATH)];
    const fresh = require(LIB_PATH);
    cp.execSync = realExecSync;
    const auth = fresh.probeGhAuth();
    fresh.getGhAccounts('github.com');
    fresh.exec('git rev-parse --is-inside-work-tree');
    const gh = calls.filter(c => /^gh\s/.test(c.cmd));
    const other = calls.filter(c => !/^gh\s/.test(c.cmd));
    console.log(JSON.stringify({
      expected: fresh.GH_TIMEOUT_MS,
      ghCalls: gh.map(c => c.cmd),
      ghTimeouts: gh.map(c => c.timeout),
      otherTimeouts: other.map(c => (c.timeout === undefined ? null : c.timeout)),
      authenticated: auth.authenticated,
    }));
    break;
  }

  case 'probeGhAuthTimeout': {
    // #9237: a timed-out `gh auth status` is named as a timeout, not "Not logged in".
    let mode = 'timeout';
    const realExecSync = cp.execSync;
    cp.execSync = (cmd) => {
      if (/^gh auth status/.test(cmd)) {
        if (mode === 'timeout') throw Object.assign(new Error('spawnSync /bin/sh ETIMEDOUT'), { code: 'ETIMEDOUT' });
        throw Object.assign(new Error('exit 1'), { status: 1 });
      }
      return 'ok';
    };
    delete require.cache[require.resolve(LIB_PATH)];
    const fresh = require(LIB_PATH);
    cp.execSync = realExecSync;
    const pick = (r) => ({ authenticated: r.authenticated, timedOut: r.timedOut, errorMessage: r.errorMessage });
    const timeout = pick(fresh.probeGhAuth());
    mode = 'loggedOut';
    const loggedOut = pick(fresh.probeGhAuth());
    console.log(JSON.stringify({ timeout, loggedOut }));
    break;
  }

  case 'execNormalFailure': {
    // Verify exec() returns null on normal command failure (non-buffer-overflow) with throwOnError=false.
    const result = lib.exec('exit 1', { shell: true });
    console.log(JSON.stringify({ returnedNull: result === null }, null, 2));
    break;
  }

  case 'tagListVariants': {
    // Create a temp git repo, add tags, and assert getAllSemverTags vs getTagList behaviour.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-lib-tag-test-'));
    const run = cmd => cp.execSync(cmd, { cwd: tmp, stdio: 'pipe' });
    try {
      run('git init -b main');
      run('git config user.email test@example.com');
      run('git config user.name Test');
      run('git commit --allow-empty -m init');
      run('git tag v1.3.2');
      run('git tag v1.3.3-rc.1');
      run('git tag v1.3.3-rc.2');
      run('git tag nightly');

      const allTags  = lib.getAllSemverTags(tmp);
      const stableTags = lib.getTagList(tmp);

      // getAllSemverTags must include rc tags and exclude nightly
      const expectedAll = new Set(['v1.3.3-rc.2', 'v1.3.3-rc.1', 'v1.3.2']);
      const actualAllSet = new Set(allTags);
      const allMatch = allTags.length === 3 &&
        [...expectedAll].every(t => actualAllSet.has(t)) &&
        !actualAllSet.has('nightly');

      // getTagList must return only [v1.3.2]
      const stableMatch = stableTags.length === 1 && stableTags[0] === 'v1.3.2';

      if (allMatch && stableMatch) {
        console.log('RESULT: PASS');
      } else {
        console.log(`RESULT: FAIL allTags=${JSON.stringify(allTags)} stableTags=${JSON.stringify(stableTags)}`);
        process.exitCode = 1;
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    break;
  }

  default: {
    console.error(`Unknown --op: ${op}`);
    process.exit(1);
  }
}
