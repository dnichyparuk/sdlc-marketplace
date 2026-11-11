'use strict';
/**
 * Headless case provider (#9346): runs one `claude -p` session against a fresh
 * fixture repository built by fixtures-headless/build-fixture-repo.js, then
 * returns a JSON document of what happened (tool uses, cost, workspace files).
 *
 * Vars (context.vars):
 *   scaffold         — builder kind (required)
 *   allowed_tools    — comma list passed to --allowedTools (required)
 *   timeout_seconds  — SIGTERM the run after this many seconds (default 600)
 *   max_budget_usd   — --max-budget-usd value (default 2)
 *   tier             — cheap | costly (default cheap); costly needs SDLC_HEADLESS_COSTLY=1
 *   snapshot_files   — workspace-relative files whose text goes to `contents` (default [])
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '../../..');
const BUILDER = path.join(REPO, 'tests/promptfoo/fixtures-headless/build-fixture-repo.js');
const PLUGIN_DIR = path.join(REPO, 'plugins/sdlc-utilities');
const STDERR_TAIL = 2000;

// Spawn claude with the prompt on stdin; resolves (never rejects) once.
function runClaude(prompt, { cwd, args, timeoutMs }) {
  return new Promise((resolve) => {
    // Unset CLAUDECODE so claude doesn't refuse to run inside another Claude session
    const env = { ...process.env };
    delete env.CLAUDECODE;

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let done = false;
    const finish = (rec) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, ...rec });
    };

    const proc = spawn('claude', args, { cwd, env, stdio: 'pipe' });
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', (err) => finish({ spawnError: err }));
    proc.on('close', (code, signal) => finish({ exitCode: code, signal }));
    // A failed spawn closes stdin; ignore the resulting EPIPE.
    proc.stdin.on('error', () => {});
    proc.stdin.end(prompt);
  });
}

function parseStream(stdout) {
  const toolUses = [];
  let result = null;
  for (const line of stdout.split('\n')) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (!ev || typeof ev !== 'object') continue;
    const content = ev.message && Array.isArray(ev.message.content) ? ev.message.content : [];
    if (ev.type === 'assistant') {
      for (const item of content) {
        if (item && item.type === 'tool_use') {
          toolUses.push({ id: item.id, name: item.name, input: item.input, isError: null });
        }
      }
    } else if (ev.type === 'user') {
      for (const item of content) {
        if (!item || item.type !== 'tool_result') continue;
        const use = toolUses.find((u) => u.id === item.tool_use_id);
        if (use) use.isError = item.is_error === true;
      }
    } else if (ev.type === 'result') {
      result = ev;
    }
  }
  return { toolUses, result };
}

function listFiles(root, dir = root) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (rel === '.git/objects') continue;
      files.push(...listFiles(root, full));
    } else {
      files.push(rel);
    }
  }
  return files;
}

function snapshotContents(root, names) {
  const contents = {};
  for (const name of names) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) contents[name] = fs.readFileSync(abs, 'utf8');
  }
  return contents;
}

class HeadlessCaseProvider {
  id() {
    return 'headless-case';
  }

  async callApi(prompt, context) {
    const vars = (context && context.vars) || {};
    const tier = vars.tier || 'cheap';
    if (tier === 'costly' && process.env.SDLC_HEADLESS_COSTLY !== '1') {
      return { error: 'costly case skipped: set SDLC_HEADLESS_COSTLY=1 to run it' };
    }
    const timeoutSeconds = vars.timeout_seconds ?? 600;
    const maxBudget = vars.max_budget_usd ?? 2;
    const snapshotFiles = vars.snapshot_files || [];

    const W = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-headless-'));
    try {
      const build = spawnSync(process.execPath, [BUILDER, String(vars.scaffold)], { cwd: W, encoding: 'utf8' });
      if (build.status !== 0) {
        return { error: `scaffold failed (exit ${build.status}): ${(build.stderr || '').trim()}` };
      }

      const args = [
        '-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
        '--plugin-dir', PLUGIN_DIR,
        '--max-budget-usd', String(maxBudget),
        '--allowedTools', String(vars.allowed_tools),
      ];
      const run = await runClaude(prompt, { cwd: W, args, timeoutMs: timeoutSeconds * 1000 });
      if (run.spawnError) {
        if (run.spawnError.code === 'ENOENT') return { error: 'claude not found on PATH' };
        return { error: run.spawnError.message };
      }

      const { toolUses, result } = parseStream(run.stdout);
      const doc = {
        workspace: W,
        exitCode: run.exitCode,
        signal: run.signal,
        timedOut: run.timedOut,
        isError: !result || result.is_error === true || run.exitCode !== 0,
        costUsd: result && typeof result.total_cost_usd === 'number' ? result.total_cost_usd : null,
        resultSubtype: result ? result.subtype ?? null : null,
        toolUses,
        files: listFiles(W).sort(),
        contents: snapshotContents(W, snapshotFiles),
        stderrTail: run.stderr.slice(-STDERR_TAIL),
      };
      return { output: JSON.stringify(doc), cost: doc.costUsd ?? undefined };
    } finally {
      fs.rmSync(W, { recursive: true, force: true });
    }
  }
}

module.exports = HeadlessCaseProvider;
