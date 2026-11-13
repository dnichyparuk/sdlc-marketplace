'use strict';
// Exec-case runner for the github-sdlc datasets. Prints one JSON line:
//   { exit, stdout, json, stderr, calls, outputFile: { path, content }, dumps }
// It copies $HOME (the case's script_home, when inside the repo) to a temp home, builds a
// temp workspace, points GH_STUB_LOG at a temp file (fixtures-fs/stub-bin-gh-issues/bin/gh
// logs every call there) and runs the target script, or gh itself with --raw-gh.
// Usage: run-github-case.js [options] -- <script args>
//   --script <repo-relative path>  target script (default plugins/sdlc-utilities/scripts/skill/github.js)
//   --raw-gh                       run `gh` with the args after `--` (stub self-tests)
//   --origin <url> | --no-git      workspace git repo with that origin | no git repo
//   --config <json>                write .sdlc/config.json with that text
//   --sub <dir>                    run from that sub-directory of the workspace
//   --break-cache                  make $HOME/.sdlc-cache/github a file
//   --no-gh-path                   PATH = a temp dir holding only node and git
//   --dump <path>                  add the file's text to `dumps` (`~/` = temp home, else workspace)
//   --drop-key <path>:<key>        delete a top-level key of a JSON file in the temp home first
//   --check-dataset <path>         print the C17 check { ok, offenders[] } for a dataset
//   --schema-sync                  print { keysEqual, defaultEqual, ... }: github.js constants vs the schema
// Script-arg tokens: @OUT@ (temp output path), @HOME@, @WS@, @NL@ (LF), @CR@ (CR), @FIX:<path under fixtures-fs>@.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROMPTFOO_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURES = path.join(PROMPTFOO_DIR, 'fixtures-fs');
const STUB_BIN_RE = /script_stub_bin:\s*"?fixtures-fs\/stub-bin-gh-issues\/bin"?/;
const OFFLINE_RE = /SDLC_LINKS_OFFLINE"?\s*:\s*"?1/;
const TIMEOUT_MS = 25_000;

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep);
  const opts = {
    script: 'plugins/sdlc-utilities/scripts/skill/github.js', rawGh: false, origin: null, noGit: false,
    config: null, sub: null, breakCache: false, noGhPath: false, dumps: [], dropKeys: [], checkDataset: null,
    schemaSync: false, rest: sep < 0 ? [] : argv.slice(sep + 1),
  };
  for (let i = 0; i < own.length; i++) {
    switch (own[i]) {
      case '--script': opts.script = own[++i]; break;
      case '--raw-gh': opts.rawGh = true; break;
      case '--origin': opts.origin = own[++i]; break;
      case '--no-git': opts.noGit = true; break;
      case '--config': opts.config = own[++i]; break;
      case '--sub': opts.sub = own[++i]; break;
      case '--break-cache': opts.breakCache = true; break;
      case '--no-gh-path': opts.noGhPath = true; break;
      case '--dump': opts.dumps.push(own[++i]); break;
      case '--drop-key': opts.dropKeys.push(own[++i]); break;
      case '--check-dataset': opts.checkDataset = own[++i]; break;
      case '--schema-sync': opts.schemaSync = true; break;
      default: throw new Error(`unknown option ${own[i]}`);
    }
  }
  return opts;
}

// C17: line-based, one block per `- description:` line (no YAML parser).
function checkDataset(rel) {
  const text = fs.readFileSync(path.resolve(PROMPTFOO_DIR, rel), 'utf8');
  const offenders = [];
  for (const block of text.split(/^(?=- description:)/m)) {
    if (!block.startsWith('- description:')) continue;
    const description = block.split('\n')[0].replace(/^- description:\s*/, '').replace(/^["']|["']$/g, '');
    const missing = [];
    if (!description.includes('E11') && !STUB_BIN_RE.test(block)) missing.push('script_stub_bin');
    if (!/script_home:/.test(block)) missing.push('script_home');
    if (!description.includes('online G8') && !OFFLINE_RE.test(block)) missing.push('SDLC_LINKS_OFFLINE');
    if (missing.length) offenders.push({ description, missing });
  }
  return { ok: offenders.length === 0, offenders };
}

// R4 sync: github.js GITHUB_CONFIG_KEYS / CACHE_MAX_AGE_HOURS_DEFAULT vs schema `githubSection`.
function schemaSync() {
  const gh = require(path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/github.js'));
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schemas/sdlc-config.schema.json'), 'utf8'));
  const section = schema.$defs.githubSection;
  const scriptKeys = [...gh.GITHUB_CONFIG_KEYS].sort();
  const schemaKeys = Object.keys(section.properties).sort();
  const schemaDefault = section.properties.cacheMaxAgeHours.default;
  return {
    scriptKeys, schemaKeys, keysEqual: JSON.stringify(scriptKeys) === JSON.stringify(schemaKeys),
    scriptDefault: gh.CACHE_MAX_AGE_HOURS_DEFAULT, schemaDefault,
    defaultEqual: gh.CACHE_MAX_AGE_HOURS_DEFAULT === schemaDefault,
  };
}

function which(bin, searchPath) {
  for (const dir of (searchPath || '').split(path.delimiter).filter(Boolean)) {
    const full = path.join(dir, bin);
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch (_) { /* next */ }
  }
  return null;
}

function readOrNull(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
}

function run(opts, tmp) {
  const home = path.join(tmp, 'home');
  const ws = path.join(tmp, 'ws');
  const out = path.join(tmp, 'out', 'output.json');
  const log = path.join(tmp, 'gh-calls.jsonl');

  // Copy only a fixture home: never the real $HOME of a case that forgot script_home.
  const srcHome = process.env.HOME ? path.resolve(process.env.HOME) : '';
  if (srcHome.startsWith(REPO_ROOT + path.sep) && fs.existsSync(srcHome)) {
    fs.cpSync(srcHome, home, { recursive: true });
  } else {
    fs.mkdirSync(home);
  }
  fs.mkdirSync(ws);
  fs.mkdirSync(path.dirname(out));
  const env = { ...process.env, HOME: home, GH_STUB_LOG: log };

  if (!opts.noGit) {
    spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: ws, env });
    if (opts.origin) spawnSync('git', ['remote', 'add', 'origin', opts.origin], { cwd: ws, env });
  }
  if (opts.config !== null) {
    fs.mkdirSync(path.join(ws, '.sdlc'), { recursive: true });
    fs.writeFileSync(path.join(ws, '.sdlc', 'config.json'), opts.config);
  }
  if (opts.breakCache) {
    const cache = path.join(home, '.sdlc-cache', 'github');
    fs.rmSync(cache, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, '');
  }
  for (const spec of opts.dropKeys) {
    const colon = spec.lastIndexOf(':');
    const file = path.join(home, spec.slice(0, colon));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete data[spec.slice(colon + 1)];
    fs.writeFileSync(file, JSON.stringify(data));
  }
  const cwd = opts.sub ? path.join(ws, opts.sub) : ws;
  fs.mkdirSync(cwd, { recursive: true });
  if (opts.noGhPath) {
    const bare = path.join(tmp, 'bare-bin');
    fs.mkdirSync(bare);
    fs.symlinkSync(process.execPath, path.join(bare, 'node'));
    const git = which('git', process.env.PATH);
    if (git) fs.symlinkSync(git, path.join(bare, 'git'));
    env.PATH = bare;
  }

  const args = opts.rest.map((a) => a
    .replace(/@OUT@/g, out)
    .replace(/@HOME@/g, home)
    .replace(/@WS@/g, ws)
    .replace(/@NL@/g, '\n')
    .replace(/@CR@/g, '\r')
    .replace(/@FIX:([^@]+)@/g, (_, p) => path.join(FIXTURES, p)));
  const r = opts.rawGh
    ? spawnSync('gh', args, { cwd, env, encoding: 'utf8', timeout: TIMEOUT_MS })
    : spawnSync(process.execPath, [path.resolve(REPO_ROOT, opts.script), ...args],
      { cwd, env, encoding: 'utf8', timeout: TIMEOUT_MS });

  const stdout = r.stdout || '';
  let json = null;
  try { json = JSON.parse(stdout); } catch (_) { /* not JSON */ }
  const calls = (readOrNull(log) || '').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const dumps = {};
  for (const p of opts.dumps) {
    dumps[p] = readOrNull(p.startsWith('~/') ? path.join(home, p.slice(2)) : path.join(ws, p));
  }
  return {
    exit: r.status,
    stdout,
    json,
    stderr: (r.stderr || '') + (r.error ? `${r.error.message}\n` : ''),
    calls,
    outputFile: { path: out, content: readOrNull(out) },
    dumps,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.checkDataset) {
    process.stdout.write(`${JSON.stringify(checkDataset(opts.checkDataset))}\n`);
    return;
  }
  if (opts.schemaSync) {
    process.stdout.write(`${JSON.stringify(schemaSync())}\n`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'github-case-'));
  try {
    process.stdout.write(`${JSON.stringify(run(opts, tmp))}\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`run-github-case: ${(err && err.stack) || err}\n`);
  process.exitCode = 2;
}
