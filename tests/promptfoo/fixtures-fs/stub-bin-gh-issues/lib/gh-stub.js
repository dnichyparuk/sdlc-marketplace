'use strict';
// Answers of the stub `gh` (fixtures-fs/stub-bin-gh-issues), shared by bin/gh (the binary) and
// scripts/gh-inprocess.js (the in-process spawnSync preload). See the bin/gh header for the
// GH_STUB_* variables, the built-ins and the scenario file format.
// answer(argv, env, input?) -> { stdout, stderr, status, sleepMs }: it appends to GH_STUB_LOG and
// bumps the GH_STUB_SEQ counter like one binary call, but returns a timeout answer's sleep as
// sleepMs instead of sleeping. `env` is not changed; `input` (the call's stdin) is not read today.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCENARIOS = path.resolve(__dirname, '..', 'scenarios');

const FAILS = {
  'rate-limit': 'HTTP 403: API rate limit exceeded for user ID 1 (x-ratelimit-reset 1767225600)',
  'secondary-rate-limit': 'HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
  '401': 'HTTP 401: Bad credentials (https://api.github.com/graphql)',
  '403': 'HTTP 403: Resource not accessible by integration',
  '404': 'HTTP 404: Not Found',
  '422': 'HTTP 422: Validation Failed',
  scope: "HTTP 403: This API operation requires the 'project' scope",
  pat: 'HTTP 401: Bad credentials for token github_pat_11ABCDEFG0123456789_secret',
};

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Value of `--name value` or `--name=value`.
function opt(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
  }
  return undefined;
}

// Per-run call counter in $GH_STUB_LOG.seq, guarded by a mkdir lock (calls may run in parallel).
function nextCount(env, key) {
  if (!env.GH_STUB_LOG) return 1;
  const file = `${env.GH_STUB_LOG}.seq`;
  const lock = `${file}.lock`;
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(lock); break; } catch (err) {
      if (err.code !== 'EEXIST' || i > 400) throw err;
      sleepSync(5);
    }
  }
  try {
    let counts = {};
    try { counts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* first call */ }
    counts[key] = (counts[key] || 0) + 1;
    fs.writeFileSync(file, JSON.stringify(counts));
    return counts[key];
  } finally {
    fs.rmdirSync(lock);
  }
}

function accounts(env) {
  return (env.GH_STUB_ACCOUNTS || 'alice*').split(',').filter(Boolean)
    .map((a) => ({ login: a.replace(/\*$/, ''), active: a.endsWith('*') }));
}

function activeLogin(env) {
  const list = accounts(env);
  return (list.find((a) => a.active) || list[0]).login;
}

// The timeout answer: sleep (Number(GH_STUB_SLEEP_MS) || 3000), then exit 1.
function timeout(env) {
  return ['', 'STUB-GH-TIMEOUT', 1, Number(env.GH_STUB_SLEEP_MS) || 3000];
}

function injectedFailure({ argv, env, line }) {
  for (const entry of (env.GH_STUB_FAIL || '').split(';').filter(Boolean)) {
    const at = entry.indexOf('@');
    if (at < 0) return ['', `STUB-GH-BAD-FAIL ${entry}`, 2];
    const kind = entry.slice(0, at);
    let prefix = entry.slice(at + 1);
    let nth = null;
    const m = prefix.match(/#(\d+)$/);
    if (m) { nth = Number(m[1]); prefix = prefix.slice(0, m.index); }
    if (!line.startsWith(prefix)) continue;
    if (nth !== null && nextCount(env, `fail:${entry}`) !== nth) continue;
    if (kind === 'timeout') return timeout(env);
    if (!(kind in FAILS)) return ['', `STUB-GH-BAD-FAIL ${entry}`, 2];
    return ['', FAILS[kind], 1];
  }
  return null;
}

function authStatus({ argv, env }) {
  const host = opt(argv, '--hostname') || 'github.com';
  const mode = env.GH_STUB_AUTH || 'ok';
  if (mode === 'timeout') return timeout(env);
  const list = mode === 'logged-out' ? [] : accounts(env);
  const source = (a) => (env.GH_TOKEN && a.active ? 'GH_TOKEN' : 'keyring');
  const failed = (a) => mode === 'expired' && a.active;
  if (opt(argv, '--json') === 'hosts') {
    const hosts = list.length === 0 ? {} : {
      [host]: list.map((a) => ({
        state: failed(a) ? 'error' : 'success', active: a.active, host, login: a.login,
        tokenSource: source(a), gitProtocol: 'https',
      })),
    };
    return [`${JSON.stringify({ hosts })}\n`, '', 0];
  }
  if (mode === 'logged-out') {
    return ['', 'You are not logged into any GitHub hosts. To log in, run: gh auth login', 1];
  }
  const scopes = env.GH_STUB_SCOPES || 'repo,read:org,project,read:project';
  const scopesText = scopes === 'none' ? 'none' : scopes.split(',').map((s) => `'${s}'`).join(', ');
  const out = [host];
  for (const a of list) {
    if (failed(a)) {
      out.push(`  X Failed to log in to ${host} account ${a.login} (${source(a)})`,
        `  - Active account: ${a.active}`,
        `  - The token in ${source(a)} is invalid or has expired.`,
        `  - To re-authenticate, run: gh auth login -h ${host}`);
      continue;
    }
    out.push(`  ✓ Logged in to ${host} account ${a.login} (${source(a)})`,
      `  - Active account: ${a.active}`,
      '  - Git operations protocol: https',
      '  - Token: gho_************************************');
    if (!env.GH_TOKEN) out.push(`  - Token scopes: ${scopesText}`);
  }
  const text = `${out.join('\n')}\n`;
  return mode === 'expired' ? ['', text, 1] : [text, '', 0];
}

function authToken({ argv, env }) {
  const host = opt(argv, '--hostname') || 'github.com';
  if (env.GH_STUB_AUTH === 'logged-out') return ['', `no oauth token found for ${host}`, 1];
  const login = opt(argv, '--user') || activeLogin(env);
  if (!accounts(env).some((a) => a.login === login)) {
    return ['', `no oauth token found for ${host} account ${login}`, 1];
  }
  return [`stub-token-${login}-S3CR3T\n`, '', 0];
}

function apiUser({ argv, env }) {
  if (env.GH_STUB_AUTH === 'logged-out') return ['', 'To get started with GitHub CLI, please run:  gh auth login', 4];
  if (env.GH_STUB_AUTH === 'expired') return ['', 'HTTP 401: Bad credentials (https://api.github.com/user)', 1];
  const login = activeLogin(env);
  return [opt(argv, '--jq') === '.login' ? `${login}\n` : `${JSON.stringify({ login })}\n`, '', 0];
}

function loadRoutes(name) {
  const file = path.isAbsolute(name) ? name : path.join(SCENARIOS, name.endsWith('.json') ? name : `${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return [...(data.routes || []), ...(data.extends ? loadRoutes(data.extends) : [])];
}

function seqs(env) {
  const map = {};
  for (const entry of (env.GH_STUB_SEQ || '').split(';').filter(Boolean)) {
    const eq = entry.indexOf('=');
    map[entry.slice(0, eq)] = entry.slice(eq + 1).split(',');
  }
  return map;
}

function routeAnswer({ argv, env, line }) {
  const route = loadRoutes(env.GH_STUB_DATA || 'default').find((r) => line.startsWith(r.match)
    && (r.contains || []).every((c) => argv.some((a) => a.includes(c))));
  if (!route) return ['', `STUB-GH-UNEXPECTED ${line}`, 1];
  let answer = route;
  if (route.variants) {
    // Without a GH_STUB_SEQ entry for the route key, the first variant answers.
    const list = seqs(env)[route.key];
    const name = list
      ? list[Math.min(nextCount(env, `seq:${route.key}`), list.length) - 1]
      : Object.keys(route.variants)[0];
    answer = route.variants[name];
    if (!answer) return ['', `STUB-GH-BAD-SEQ ${route.key}=${name}`, 2];
  }
  let stdout = '';
  if (typeof answer.stdout === 'string') stdout = answer.stdout;
  else if (answer.stdout !== undefined) stdout = `${JSON.stringify(answer.stdout)}\n`;
  return [argv.includes('--silent') ? '' : stdout, answer.stderr || '', answer.exit ?? 0];
}

function dispatch(c) {
  const failure = injectedFailure(c);
  if (failure) return failure;
  const { argv } = c;
  if (argv[0] === '--version') {
    return ['gh version 2.83.0 (2026-01-01)\nhttps://github.com/cli/cli/releases/tag/v2.83.0\n', '', 0];
  }
  if (argv[0] === 'auth' && argv[1] === 'status') return authStatus(c);
  if (argv[0] === 'auth' && argv[1] === 'token') return authToken(c);
  if (argv[0] === 'api' && argv[1] === 'user') return apiUser(c);
  return routeAnswer(c);
}

function answer(argv, envIn, input) {
  const env = { ...envIn };
  // Real gh reads GH_TOKEN only for github.com and *.ghe.com; other hosts read GH_ENTERPRISE_TOKEN.
  const stubHost = (opt(argv, '--hostname') || 'github.com').toLowerCase().replace(/:\d+$/, '');
  if (stubHost === 'github.com' || stubHost.endsWith('.ghe.com')) {
    delete env.GH_ENTERPRISE_TOKEN;
  } else if (env.GH_ENTERPRISE_TOKEN) {
    env.GH_TOKEN = env.GH_ENTERPRISE_TOKEN;
  } else {
    delete env.GH_TOKEN;
  }
  if (env.GH_STUB_LOG) {
    const tokenHash = env.GH_TOKEN
      ? crypto.createHash('sha256').update(env.GH_TOKEN).digest('hex').slice(0, 12)
      : null;
    fs.appendFileSync(env.GH_STUB_LOG, `${JSON.stringify({ argv, tokenHash })}\n`);
  }
  const [stdout, stderr, status, sleepMs = 0] = dispatch({ argv, env, line: argv.join(' ') });
  return {
    stdout,
    stderr: stderr && !stderr.endsWith('\n') ? `${stderr}\n` : stderr,
    status,
    sleepMs,
  };
}

module.exports = { answer, sleepSync };
