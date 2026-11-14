'use strict';
// Deterministic checks for the headless runner (#9346). Prints one JSON line.
// Usage: run-headless-case-stub.js --scenario <scaffold|scaffold-in-worktree> [--kind <kind>]
//        run-headless-case-stub.js --scenario provider [--mode <ok|error|crash>] [--kind <kind>] [--tier <cheap|costly>]
//        run-headless-case-stub.js --scenario provider-env [--variant <ok|missing|badjson>]
//        run-headless-case-stub.js --scenario provider-stream [--variant <stream|snap-json|snap-plain|snap-bad>]
// The provider scenario drives providers/headless-case.js against the stub claude
// in fixtures-fs/stub-bin-claude; it never starts a real claude.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BUILDER = path.resolve(__dirname, '../fixtures-headless/build-fixture-repo.js');
const STUB_BIN = path.resolve(__dirname, '../fixtures-fs/stub-bin-claude/bin');
const HeadlessCaseProvider = require('../providers/headless-case.js');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

function findGitDirs(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === '.git') found.push(full);
    else if (entry.isDirectory()) found.push(...findGitDirs(full));
  }
  return found;
}

// Runs the provider once with the stub claude first on PATH. TMPDIR points at D so
// the provider's sdlc-headless-* workspace is created there and its removal is checkable.
async function runProvider(D) {
  const log = path.join(D, 'log.jsonl');
  process.env.PATH = `${STUB_BIN}${path.delimiter}${process.env.PATH}`;
  process.env.CLAUDECODE = '1';
  process.env.STUB_CLAUDE_MODE = arg('--mode') || 'ok';
  process.env.STUB_CLAUDE_LOG = log;
  process.env.TMPDIR = D;
  delete process.env.SDLC_HEADLESS_COSTLY;

  const res = await new HeadlessCaseProvider().callApi('stub prompt', {
    vars: {
      scaffold: arg('--kind') || 'commit',
      allowed_tools: 'Read,Bash',
      tier: arg('--tier') || 'cheap',
      snapshot_files: ['README.md'],
    },
  });
  const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return {
    result: res.output !== undefined ? JSON.parse(res.output) : null,
    error: res.error ?? null,
    log: lines.map((l) => JSON.parse(l)),
    workspaceGone: !fs.readdirSync(D).some((name) => name.startsWith('sdlc-headless-')),
  };
}

// stub_bin / script_env: a `claude` placed in D/bin (passed as stub_bin, so it is first on
// PATH) records the PATH head and GH_STUB_LOG it sees. Variants: ok | missing | badjson.
async function runProviderEnv(D) {
  const variant = arg('--variant') || 'ok';
  const bin = path.join(D, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(D, 'env-log.json');
  fs.writeFileSync(path.join(bin, 'claude'), [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "fs.writeFileSync(process.env.ENV_LOG, JSON.stringify({ pathHead: process.env.PATH.split(require('path').delimiter)[0], ghStubLog: process.env.GH_STUB_LOG }));",
    "process.stdin.resume();",
    "process.stdin.on('end', () => console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0 })));",
    '',
  ].join('\n'), { mode: 0o755 });
  process.env.ENV_LOG = log;
  process.env.TMPDIR = D;

  const vars = {
    scaffold: 'commit',
    allowed_tools: 'Read',
    stub_bin: variant === 'missing' ? path.join(D, 'no-such-dir') : bin,
    script_env: variant === 'badjson' ? '{not json' : JSON.stringify({ GH_STUB_LOG: path.join(D, 'gh.log') }),
  };
  const res = await new HeadlessCaseProvider().callApi('stub prompt', { vars });
  return {
    error: res.error ?? null,
    ran: res.output !== undefined,
    bin,
    ghLog: path.join(D, 'gh.log'),
    seen: fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : null,
  };
}

// Stream parsing and snapshot_files forms: a `claude` in D/bin prints two tool results
// (array content, string content) and a long result text. Variants: stream | snap-json |
// snap-plain | snap-bad. The harness prints { error, result }.
async function runProviderStream(D) {
  const variant = arg('--variant') || 'stream';
  const bin = path.join(D, 'bin');
  fs.mkdirSync(bin);
  const events = [
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'echo 1' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'x'.repeat(500) + 'END1' }] }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'echo 2' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'short' }] } },
    { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, result: 'y'.repeat(1500) + 'FINAL' },
  ];
  fs.writeFileSync(path.join(bin, 'claude'), [
    '#!/usr/bin/env node',
    `const events = ${JSON.stringify(events)};`,
    "process.stdin.resume();",
    "process.stdin.on('end', () => events.forEach((e) => console.log(JSON.stringify(e))));",
    '',
  ].join('\n'), { mode: 0o755 });
  process.env.TMPDIR = D;

  const snapshot = {
    stream: '["README.md"]',
    'snap-json': '["README.md",".git/HEAD"]',
    'snap-plain': 'README.md',
    'snap-bad': '[oops',
  }[variant];
  const vars = {
    scaffold: 'commit',
    allowed_tools: 'Read',
    stub_bin: bin,
    snapshot_files: snapshot,
    script_env: JSON.stringify({ STUB_SECRET: 'stub-secret-9389' }),
  };
  const res = await new HeadlessCaseProvider().callApi('stub prompt', { vars });
  return {
    error: res.error ?? null,
    result: res.output !== undefined ? JSON.parse(res.output) : null,
  };
}

async function main() {
  const scenario = arg('--scenario');
  const kind = arg('--kind');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-case-stub-'));
  try {
    if (scenario === 'provider') {
      process.stdout.write(JSON.stringify(await runProvider(D)) + '\n');
    } else if (scenario === 'provider-env') {
      process.stdout.write(JSON.stringify(await runProviderEnv(D)) + '\n');
    } else if (scenario === 'provider-stream') {
      process.stdout.write(JSON.stringify(await runProviderStream(D)) + '\n');
    } else if (scenario === 'scaffold') {
      const r = spawnSync('node', [BUILDER, kind], { cwd: D, encoding: 'utf8' });
      const out = { exit: r.status };
      if (r.status === 0) {
        out.stdout = r.stdout.trim();
        out.branch = git(D, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
        out.staged = git(D, ['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
      } else {
        out.stderr = r.stderr;
      }
      process.stdout.write(JSON.stringify(out) + '\n');
    } else if (scenario === 'scaffold-in-worktree') {
      git(D, ['init', '-q']);
      const sub = path.join(D, 'sub');
      fs.mkdirSync(sub);
      const r = spawnSync('node', [BUILDER, 'commit'], { cwd: sub, encoding: 'utf8' });
      process.stdout.write(JSON.stringify({ exit: r.status, stderr: r.stderr, gitDirs: findGitDirs(sub) }) + '\n');
    } else {
      process.stderr.write('unknown scenario\n');
      process.exitCode = 2;
    }
  } finally {
    fs.rmSync(D, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`run-headless-case-stub: ${err && err.stack || err}\n`);
  process.exitCode = 2;
});
