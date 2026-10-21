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
 *   script_cwd   — (optional) working directory for script execution
 *   script_home  — (optional) HOME override; accepts relative (resolved against
 *                  script_cwd) or absolute path. Useful for tests depending on
 *                  ~/.sdlc-cache/... layouts.
 *   script_env   — (optional) JSON string or object of extra env vars. Useful for
 *                  per-test TMPDIR isolation when the hook writes diagnostic files
 *                  to `os.tmpdir()` (e.g., jira-sdlc-debug dumps per R21.2).
 */
const path = require('path');
const { spawn } = require('child_process');

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
    const cwd        = vars.script_cwd || undefined;

    if (!scriptPath) {
      return { error: 'hook-runner: script_path var is required' };
    }

    const env = Object.assign({}, process.env);
    if (vars.script_home) {
      const home = path.isAbsolute(vars.script_home)
        ? vars.script_home
        : path.resolve(cwd || process.cwd(), vars.script_home);
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
  }
}

module.exports = HookRunnerProvider;
