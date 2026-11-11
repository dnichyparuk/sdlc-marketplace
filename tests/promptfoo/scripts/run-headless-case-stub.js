'use strict';
// Deterministic checks for the headless runner (#9346). Prints one JSON line.
// Usage: run-headless-case-stub.js --scenario <scaffold|scaffold-in-worktree> [--kind <kind>]
//        run-headless-case-stub.js --scenario provider [--mode <ok|error|crash>] [--kind <kind>] [--tier <cheap|costly>]
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

async function main() {
  const scenario = arg('--scenario');
  const kind = arg('--kind');
  const D = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-case-stub-'));
  try {
    if (scenario === 'provider') {
      process.stdout.write(JSON.stringify(await runProvider(D)) + '\n');
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

main();
