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
//   --set-key <path>:<a.b.c>=<json> set a (nested) key of a JSON file in the temp home first
//   --payload <key>                write that entry of PAYLOADS (a string verbatim, else as JSON) to a temp
//                                  file for @PAYLOAD@; repeatable: one run per payload, all in `runs[]`
//                                  ({ exit, json, stderr }); the top-level fields are the first run's
//   --bulk-over-max                wrap each --payload in { ops } of BULK_MAX + 1 copies; adds `bulkMax`
//   --check-dataset <path>         print the C17 check { ok, offenders[] } for a dataset
//   --check-triggers               print { overlap, length }: R33 trigger phrases shared by the github and jira skills
//   --schema-sync                print { keysEqual, defaultEqual, ... }: github.js constants vs the schema
//   --auto-argv <key>:<flag>       print { base, extra }: github.js commands of PAYLOADS[<key>] against the
//                                  $HOME cache and its R34 class, then the same with <flag> appended to the last argv
// Script-arg tokens: @OUT@ (temp output path), @HOME@, @WS@, @NL@ (LF), @CR@ (CR), @FIX:<path under fixtures-fs>@,
// @PAYLOAD@ (the current --payload file).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PROMPTFOO_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURES = path.join(PROMPTFOO_DIR, 'fixtures-fs');
const PAYLOADS = path.join(FIXTURES, 'github-sdlc-inputs', 'payloads-core.json');
const GITHUB_JS = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/github.js');
const STUB_BIN_RE = /script_stub_bin:\s*"?fixtures-fs\/stub-bin-gh-issues\/bin"?/;
const OFFLINE_RE = /SDLC_LINKS_OFFLINE"?\s*:\s*"?1/;
const TIMEOUT_MS = 25_000;

function parseArgs(argv) {
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep);
  const opts = {
    script: 'plugins/sdlc-utilities/scripts/skill/github.js', rawGh: false, origin: null, noGit: false,
    config: null, sub: null, breakCache: false, noGhPath: false, dumps: [], dropKeys: [], setKeys: [], payloads: [],
    bulkOverMax: false, checkDataset: null, schemaSync: false, autoArgv: null, rest: sep < 0 ? [] : argv.slice(sep + 1),
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
      case '--set-key': opts.setKeys.push(own[++i]); break;
      case '--payload': opts.payloads.push(own[++i]); break;
      case '--bulk-over-max': opts.bulkOverMax = true; break;
      case '--check-dataset': opts.checkDataset = own[++i]; break;
      case '--schema-sync': opts.schemaSync = true; break;
      case '--check-triggers': opts.checkTriggers = true; break;
      case '--auto-argv': opts.autoArgv = own[++i]; break;
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

// R33: exact (case-insensitive) trigger phrases shared by the github-sdlc and jira-sdlc descriptions.
function checkTriggers() {
  const read = (skill) => {
    const text = fs.readFileSync(path.join(REPO_ROOT, 'plugins/sdlc-utilities/skills', skill, 'SKILL.md'), 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('description:')) || '';
    const description = line.replace(/^description:\s*/, '').replace(/^["']|["']$/g, '');
    const triggers = (description.split('Triggers on:')[1] || '').split(',')
      .map((t) => t.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
    return { description, triggers };
  };
  const gh = read('github-sdlc');
  const jira = read('jira-sdlc');
  return { overlap: gh.triggers.filter((t) => jira.triggers.includes(t)), length: gh.description.length };
}

// R4 sync: github.js GITHUB_CONFIG_KEYS / CACHE_MAX_AGE_HOURS_DEFAULT vs schema `githubSection`.
function schemaSync() {
  const gh = require(GITHUB_JS);
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

function payloadEntry(key) {
  const all = JSON.parse(fs.readFileSync(PAYLOADS, 'utf8'));
  if (!(key in all)) throw new Error(`no payload "${key}" in ${PAYLOADS}`);
  return all[key];
}

// R34: github.js commands of one payload and their class against the $HOME cache, plain and with one extra flag.
function autoArgv(spec) {
  const colon = spec.indexOf(':');
  const op = payloadEntry(spec.slice(0, colon));
  const gh = require(GITHUB_JS);
  const repo = gh.parseSlug(op.repo);
  const cache = JSON.parse(fs.readFileSync(gh.cachePath(repo), 'utf8'));
  const classify = (commands) => {
    const autoBlockers = gh.shapeBlockers(commands, repo, cache);
    return { commands, autoApprovable: gh.isAutoApprovable(commands, autoBlockers), autoBlockers };
  };
  const commands = gh.buildCommands(op, cache, {});
  const extra = commands.map((argv, i) => (i === commands.length - 1 ? [...argv, spec.slice(colon + 1)] : argv));
  return { base: classify(commands), extra: classify(extra) };
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
  for (const spec of opts.setKeys) {
    const colon = spec.indexOf(':');
    const eq = spec.indexOf('=', colon);
    const file = path.join(home, spec.slice(0, colon));
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const keys = spec.slice(colon + 1, eq).split('.');
    const parent = keys.slice(0, -1).reduce((o, k) => o[k], data);
    parent[keys[keys.length - 1]] = JSON.parse(spec.slice(eq + 1));
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

  const bulkMax = opts.bulkOverMax ? require(GITHUB_JS).BULK_MAX : undefined;
  const payloadFiles = opts.payloads.map((key, i) => {
    let entry = payloadEntry(key);
    if (opts.bulkOverMax) entry = { ops: Array.from({ length: bulkMax + 1 }, () => entry) };
    const file = path.join(tmp, `payload-${i}.json`);
    fs.writeFileSync(file, typeof entry === 'string' ? entry : JSON.stringify(entry, null, 2));
    return file;
  });
  const exec = (payloadFile) => {
    const args = opts.rest.map((a) => a
      .replace(/@OUT@/g, out)
      .replace(/@HOME@/g, home)
      .replace(/@WS@/g, ws)
      .replace(/@PAYLOAD@/g, payloadFile)
      .replace(/@NL@/g, '\n')
      .replace(/@CR@/g, '\r')
      .replace(/@FIX:([^@]+)@/g, (_, p) => path.join(FIXTURES, p)));
    const r = opts.rawGh
      ? spawnSync('gh', args, { cwd, env, encoding: 'utf8', timeout: TIMEOUT_MS })
      : spawnSync(process.execPath, [path.resolve(REPO_ROOT, opts.script), ...args],
        { cwd, env, encoding: 'utf8', timeout: TIMEOUT_MS });
    let json = null;
    try { json = JSON.parse(r.stdout || ''); } catch (_) { /* not JSON */ }
    return { r, json };
  };
  const results = payloadFiles.length ? payloadFiles.map(exec) : [exec('')];
  const { r, json } = results[0];
  const stdout = r.stdout || '';
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
    ...(payloadFiles.length ? { runs: results.map((x) => ({ exit: x.r.status, json: x.json, stderr: x.r.stderr || '' })) } : {}),
    ...(bulkMax === undefined ? {} : { bulkMax }),
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.checkDataset) {
    process.stdout.write(`${JSON.stringify(checkDataset(opts.checkDataset))}\n`);
    return;
  }
  if (opts.checkTriggers) {
    process.stdout.write(`${JSON.stringify(checkTriggers())}\n`);
    return;
  }
  if (opts.schemaSync) {
    process.stdout.write(`${JSON.stringify(schemaSync())}\n`);
    return;
  }
  if (opts.autoArgv) {
    process.stdout.write(`${JSON.stringify(autoArgv(opts.autoArgv))}\n`);
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
