const { execFile } = require('child_process');

const MAX_ATTEMPTS = 3;

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
        return { error: error.message, output: stderr };
      }
      return { output: stdout };
    }
  }
}

module.exports = ClaudeCliProvider;
