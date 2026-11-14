const { execFile } = require('child_process');

const MAX_ATTEMPTS = 3;
// A `claude -p` usage-limit refusal ("You've hit your ... limit ... resets ..."); text mode prints it to stdout.
const USAGE_LIMIT_RE = /hit your[^\n]*limit/i;
const STDOUT_TAIL_CHARS = 500;
// Set on the first refusal; every later call in this process returns it without spawning `claude -p`.
let usageLimitError = null;

// One `claude -p` run. The execFile call happens synchronously inside the Promise executor.
function runClaudeOnce(prompt) {
  return new Promise((resolve) => {
    // Unset CLAUDECODE so claude doesn't refuse to run inside another Claude session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = execFile('claude', ['-p', '--output-format', 'text', '--input-format', 'text'], {
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
      env,
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
    // A failed spawn closes stdin; ignore the resulting EPIPE.
    proc.stdin.on('error', () => {});
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

class ClaudeCliProvider {
  id() {
    return 'claude-cli';
  }

  async callApi(prompt, context) {
    if (usageLimitError) return { error: usageLimitError };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { error, stdout, stderr } = await runClaudeOnce(prompt);
      // The binary is briefly absent while the CLI auto-updates: retry only ENOENT.
      // Timeouts and non-zero exits are real results.
      if (error && error.code === 'ENOENT' && attempt < MAX_ATTEMPTS) {
        const waitMs = Number(process.env.SDLC_CLAUDE_CLI_RETRY_MS) || 5000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (error) {
        const limitLine = [stdout, stderr].join('\n').split('\n').find((l) => USAGE_LIMIT_RE.test(l));
        if (limitLine) {
          usageLimitError = `claude -p usage limit reached: ${limitLine.trim().slice(0, 300)}`;
          return { error: usageLimitError };
        }
        const exit = typeof error.code === 'number' ? error.code : (error.signal || error.code);
        const tail = (stdout || '').trim().slice(-STDOUT_TAIL_CHARS) || '(empty)';
        return { error: `${error.message} | exit: ${exit} | stdout tail: ${tail}`, output: stderr };
      }
      return { output: stdout };
    }
  }
}

module.exports = ClaudeCliProvider;
