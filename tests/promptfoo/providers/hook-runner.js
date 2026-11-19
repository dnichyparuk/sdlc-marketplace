/**
 * Hook runner provider — executes a node hook script with stdin piped
 * and returns {stdout, stderr, exitCode} as JSON.
 *
 * Used for testing stdin-based hook scripts that communicate via exit codes
 * and stderr (unlike script-runner.js which returns stdout only).
 *
 * Expects vars:
 *   script_path  — absolute path to the hook script
 *   script_args  — (optional) space-separated args
 *   script_stdin — JSON string piped to the script's stdin
 *   script_cwd   — (optional) working directory for script execution; when unset,
 *                  the case runs in a fresh `promptfoo-cwd-*` temp dir that is
 *                  removed afterwards
 *   script_home  — (optional) HOME override; accepts relative (resolved against
 *                  script_cwd, or tests/promptfoo when unset) or absolute path. Useful for tests depending on
 *                  ~/.sdlc-cache/... layouts.
 *   script_env   — (optional) JSON string or object of extra env vars. Useful for
 *                  per-test TMPDIR isolation when the hook writes diagnostic files
 *                  to `os.tmpdir()`.
 *
 * The child env defaults GIT_SSH_COMMAND=false and GIT_TERMINAL_PROMPT=0 (script_env
 * may override). There is no script_stub_bin support: hook cases need no stub binaries.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROMPTFOO_DIR = path.resolve(__dirname, '..');

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


class HookRunnerProvider {
  id() {
    return 'hook-runner';
  }

  async callApi(prompt, context) {
    const vars = context?.vars ?? {};
    const scriptPath = vars.script_path;
    const scriptArgs = (vars.script_args ?? '').split(/\s+/).filter(Boolean);
    const stdinData  = vars.script_stdin || '';

    if (!scriptPath) {
      return { error: 'hook-runner: script_path var is required' };
    }

    // A case without script_cwd gets its own temp directory, removed afterwards.
    const tmpCwd = vars.script_cwd ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cwd-'));
    const cwd = vars.script_cwd || tmpCwd;
    const base = vars.script_cwd || PROMPTFOO_DIR;
    try {
      const env = Object.assign({}, process.env, { GIT_SSH_COMMAND: 'false', GIT_TERMINAL_PROMPT: '0' });
      if (vars.script_home) {
        const home = path.isAbsolute(vars.script_home)
          ? vars.script_home
          : path.resolve(base, vars.script_home);
        env.HOME = home;
      }
      if (vars.script_env) {
        let extra = vars.script_env;
        if (typeof extra === 'string') {
          try { extra = JSON.parse(extra); } catch (_) { extra = {}; }
        }
        if (extra && typeof extra === 'object') Object.assign(env, extra);
      }

      const result = await runNode([scriptPath, ...scriptArgs], { cwd, env, input: stdinData });

      const output = JSON.stringify({
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.status ?? -1,
      }, null, 2);

      return { output };
    } finally {
      if (tmpCwd) fs.rmSync(tmpCwd, { recursive: true, force: true });
    }
  }
}

module.exports = HookRunnerProvider;
