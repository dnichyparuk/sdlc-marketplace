/**
 * Script runner provider — executes a node script directly and returns its stdout.
 * Used for validating that plugin scripts produce correct output against fixture directories.
 *
 * Expects vars:
 *   script_path  — absolute path to the node script
 *   script_args  — space-separated args (e.g., "--project-root /tmp/fixture-abc --json")
 *   script_cwd   — (optional) working directory for script execution; when unset, the case
 *                  runs in a fresh `promptfoo-cwd-*` temp dir that is removed afterwards
 *   script_home            — (optional) HOME override; useful for tests that depend on
 *                            `~/.sdlc-cache/...` layouts. Accepts a relative path (resolved
 *                            against `script_cwd`, or tests/promptfoo when it is unset) or an
 *                            absolute path. An in-repo HOME is copied per case.
 *   script_env             — (optional) JSON string or object of extra env vars; may override
 *                            the defaults GIT_SSH_COMMAND=false and GIT_TERMINAL_PROMPT=0
 *   script_stub_bin        — (optional) path to a directory whose binaries should shadow real
 *                            CLIs on PATH (e.g., a stub `gh` for testing). Accepts a relative
 *                            path (resolved as for `script_home`) or an absolute path. Prepended
 *                            to PATH after `script_env` merge so any user-supplied `script_env.PATH`
 *                            is honored as the base. Asymmetry: `hook-runner.js` does not implement
 *                            this — hook tests do not exec external CLIs (YAGNI).
 *   script_capture_stderr  — (optional) when truthy, append stderr to output even on exit 0
 *   script_show_exit       — (optional) when truthy, append a last line "[exit N]" to the output; the exit code is always in metadata.exitCode
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const PROMPTFOO_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Matches paths created by lib/output.js#createOutputFile via os.tmpdir() on macOS/Linux:
//   /tmp/...,  /var/folders/.../...  (macOS),  /private/var/...  (macOS canonicalized)
const TMP_PATH_RE = /^(?:\/(?:tmp|var|private)\/.+|.+\/\.sdlc\/execution\/out\/.+)\.json$/;

// spawnSync's limits, kept so every case sees the same outcome as before.
const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 1024 * 1024; // spawnSync default maxBuffer, bytes per stream


// Async stand-in for spawnSync('node', args, { timeout, encoding: 'utf8', input }):
// resolves (never rejects) with the same { stdout, stderr, status, signal, error } record.
function runNode(args, { cwd, env, input }) {
  return new Promise((resolve) => {
    const out = { stdout: '', stderr: '' };
    const bytes = { stdout: 0, stderr: 0 };
    let error;
    const child = spawn('node', args, { cwd, env, stdio: 'pipe' });
    const fail = (code) => {
      if (!error) error = new Error(`spawnSync node ${code}`);
      child.kill('SIGTERM');
    };
    const timer = setTimeout(() => fail('ETIMEDOUT'), TIMEOUT_MS);
    for (const name of ['stdout', 'stderr']) {
      child[name].setEncoding('utf8');
      child[name].on('data', (chunk) => {
        out[name] += chunk;
        bytes[name] += Buffer.byteLength(chunk, 'utf8');
        if (bytes[name] > MAX_BUFFER) fail('ENOBUFS');
      });
    }
    child.on('error', (err) => {
      if (!error) error = new Error(`spawnSync node ${err.code}`);
    });
    // Always end stdin (EOF), as spawnSync does; ignore EPIPE when the child exits first.
    child.stdin.on('error', () => {});
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      // spawnSync reports status null whenever it reports an error.
      resolve({ stdout: out.stdout, stderr: out.stderr, status: error ? null : code, signal, error });
    });
  });
}

function maybeReadTmpFile(stdout, scriptPassthrough) {
  if (scriptPassthrough === true) return stdout;
  const trimmed = (stdout || '').trim();
  if (!trimmed.includes('\n') && TMP_PATH_RE.test(trimmed) && fs.existsSync(trimmed)) {
    try {
      return fs.readFileSync(trimmed, 'utf8');
    } catch (_) {
      return stdout;
    }
  }
  return stdout;
}

class ScriptRunnerProvider {
  id() {
    return 'script-runner';
  }

  async callApi(prompt, context) {
    const vars = context?.vars ?? {};
    const scriptPath = vars.script_path;
    const scriptArgs = (vars.script_args ?? '').split(/\s+/).filter(Boolean);

    if (!scriptPath) {
      return { error: 'script-runner: script_path var is required' };
    }
    // Without script_cwd the case runs in its own temp dir (removed in `finally`, after any
    // stdout temp-file read), and relative paths resolve against tests/promptfoo.
    const tmpCwd = vars.script_cwd ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cwd-'));
    const cwd = vars.script_cwd || tmpCwd;
    const base = vars.script_cwd || PROMPTFOO_DIR;
    let tmpHome = null;
    try {
      // Build env: inherit parent env, git safety defaults (script_env may override them),
      // HOME override and arbitrary additions.
      const env = Object.assign({}, process.env, { GIT_SSH_COMMAND: 'false', GIT_TERMINAL_PROMPT: '0' });
      if (vars.script_home) {
        const home = path.isAbsolute(vars.script_home)
          ? vars.script_home
          : path.resolve(base, vars.script_home);
        // in-repo HOME: copy per case so no case writes into the repository (-j N safe)
        const rel = path.relative(REPO_ROOT, home);
        if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(home)) {
          tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-home-'));
          fs.cpSync(home, tmpHome, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
          env.HOME = tmpHome;
        } else env.HOME = home;
      }
      if (vars.script_env) {
        let extra = vars.script_env;
        if (typeof extra === 'string') {
          try { extra = JSON.parse(extra); } catch (_) { extra = {}; }
        }
        if (extra && typeof extra === 'object') Object.assign(env, extra);
      }
      // PATH stub injection: prepend a fixture's bin dir to PATH so spawned children resolve
      // stub binaries (e.g., a fake `gh`) before real CLIs. Order matters — this is the LAST
      // PATH mutation so user-supplied `script_env.PATH` (if any) is honored as the base.
      if (vars.script_stub_bin) {
        if (typeof vars.script_stub_bin !== 'string') {
          return { error: `script-runner: script_stub_bin must be a string path, got ${typeof vars.script_stub_bin}` };
        }
        const stubBin = path.isAbsolute(vars.script_stub_bin)
          ? vars.script_stub_bin
          : path.resolve(base, vars.script_stub_bin);
        let stat;
        try { stat = fs.statSync(stubBin); } catch (_) { stat = null; }
        if (!stat || !stat.isDirectory()) {
          return { error: `script-runner: script_stub_bin path not found or not a directory: ${stubBin}` };
        }
        env.PATH = stubBin + path.delimiter + (env.PATH || '');
      }

      // Optional stdin payload (string passed as-is, or object JSON-serialized).
      // Supports testing hooks that read JSON envelopes on stdin (e.g.,
      // SessionStart hook's matcher source per Fixes #392).
      let scriptStdin;
      if (vars.script_stdin !== undefined && vars.script_stdin !== null) {
        scriptStdin = (typeof vars.script_stdin === 'string')
          ? vars.script_stdin
          : JSON.stringify(vars.script_stdin);
      }

      const result = await runNode([scriptPath, ...scriptArgs], { cwd, env, input: scriptStdin });

      const rawStdout = result.stdout ?? '';
      const stderr = (result.stderr ?? '').trim();
      const exitCode = result.status ?? (result.error ? 1 : 0);

      // Auto-read tmp-path JSON when stdout is solely a temp file path.
      const stdoutTrimmed = rawStdout.trim();
      let stdout = rawStdout;
      let tmpFileRead = false;
      if (
        vars.script_passthrough !== true
        && stdoutTrimmed
        && !stdoutTrimmed.includes('\n')
        && TMP_PATH_RE.test(stdoutTrimmed)
        && fs.existsSync(stdoutTrimmed)
      ) {
        try { stdout = fs.readFileSync(stdoutTrimmed, 'utf8'); tmpFileRead = true; } catch (_) { /* fall through */ }
      }

      // Spawn error (ENOENT, ETIMEDOUT, etc.) — return the error message directly.
      if (result.error) {
        return { output: result.error.message, metadata: { exitCode: null } };
      }

      // Include stderr when: (a) exit non-zero AND no tmp-file was auto-read (to avoid appending
      // git noise after structured JSON), OR (b) script_capture_stderr is explicitly set.
      const includeStderr = (tmpFileRead ? false : exitCode !== 0) || vars.script_capture_stderr;
      const showExit = vars.script_show_exit ? `[exit ${exitCode}]` : null;
      const output = [stdout.trimEnd(), includeStderr ? stderr : null, showExit].filter(Boolean).join('\n');
      return { output, metadata: { exitCode } };
    } finally {
      if (tmpCwd) fs.rmSync(tmpCwd, { recursive: true, force: true });
      if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  }
}

module.exports = ScriptRunnerProvider;
