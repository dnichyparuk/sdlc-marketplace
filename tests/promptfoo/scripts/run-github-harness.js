#!/usr/bin/env node
/**
 * run-github-harness.js
 * Test wrapper for the github-sdlc harness cases of datasets/github-sdlc-exec.yaml. Each mode or case was a
 * `node -e` program before; stdout and the exit code are byte-compatible with it.
 *
 * Usage:
 *   node run-github-harness.js parity <payloads-apply.json key | -> <run-github-case.js args>
 *     Writes that payload to a temp file for @INPUT@, runs run-github-case.js with those args and again with
 *     --gh-subprocess first, and prints { inProcess, subprocess }: each { exit, json, calls, ms } (ms: wall
 *     time), with the run's temp folder replaced by <tmp>.
 *   node run-github-harness.js apply <payload keys, comma-separated> <run-github-case.js args>
 *     For each key writes payloads[key] to a temp file, replaces @INPUT@ with that path, @HASH:<k>@ with
 *     github.js payloadHash(payloads[k]) and @HASH@ with the hash of the current key's payload, runs
 *     run-github-case.js, and adds `bodies`: the text of every body file a --dry-run listed (the harness
 *     removes those files). Prints a JSON array, one run-github-case.js result per key.
 *   node run-github-harness.js --case <name>
 *     refresh-c15     refresh acme/a then acme/b, then --load --repo acme/b
 *     skill-text-a14  count the github-sdlc SKILL.md markers (A14, C21)
 *
 * Everything after the key is passed on verbatim. Usage errors exit 2 with a message on stderr and nothing
 * on stdout.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-github-harness';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js parity|apply <key> <run-github-case.js args…> | --case refresh-c15|skill-text-a14\n`);
  process.exit(2);
}

// Locate repo root with skill/github.js.
let root = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'github.js'))) {
    root = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!root) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/github.js\n`);
  process.exit(1);
}

const pf = path.join(root, 'tests', 'promptfoo');
const PAYLOADS = path.join(pf, 'fixtures-fs', 'github-sdlc-inputs', 'payloads-apply.json');

function parity(key, rest) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'github-parity-'));
  const input = path.join(tmp, 'input.json');
  if (key !== '-') {
    const { payloads } = JSON.parse(fs.readFileSync(PAYLOADS, 'utf8'));
    fs.writeFileSync(input, JSON.stringify(payloads[key], null, 2));
  }
  const run = (mode) => {
    const start = Date.now();
    const r = cp.spawnSync(process.execPath, [path.join(pf, 'scripts', 'run-github-case.js'), ...mode,
      ...rest.map((a) => a.replace('@INPUT@', input))], { encoding: 'utf8' });
    const ms = Date.now() - start;
    const o = JSON.parse(r.stdout);
    const caseTmp = path.dirname(path.dirname(o.outputFile.path));
    const { exit, json, calls } = JSON.parse(JSON.stringify(o).split(caseTmp).join('<tmp>'));
    return { exit, json, calls, ms };
  };
  const out = { inProcess: run([]), subprocess: run(['--gh-subprocess']) };
  fs.rmSync(tmp, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(out));
}

function apply(keys, rest) {
  const { payloads } = JSON.parse(fs.readFileSync(PAYLOADS, 'utf8'));
  const { payloadHash } = require(path.join(root, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'github.js'));
  const { runCase } = require(path.join(pf, 'scripts', 'run-github-case.js'));
  const entry = (key) => {
    if (!(key in payloads)) throw new Error(`no payload "${key}" in ${PAYLOADS}`);
    return payloads[key];
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'github-apply-'));
  const runs = keys.split(',').map((key, i) => {
    const input = path.join(tmp, `payload-${i}.json`);
    fs.writeFileSync(input, JSON.stringify(entry(key), null, 2));
    const args = rest.map((a) => a.replace('@INPUT@', input).replace(/@HASH:([^@]+)@/, (_, k) => payloadHash(entry(k)))
      .replace('@HASH@', payloadHash(entry(key))));
    const o = runCase(args);
    const files = ((o.json && o.json.commands) || []).flat().filter((a) => a.startsWith('--body-file=/'))
      .map((a) => a.slice('--body-file='.length));
    o.bodies = files.map((f) => fs.readFileSync(f, 'utf8'));
    for (const f of files) fs.rmSync(path.dirname(f), { recursive: true, force: true });
    return o;
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  process.stdout.write(JSON.stringify(runs));
}

const CASES = {
  'refresh-c15'() {
    const h = fs.mkdtempSync(path.join(os.tmpdir(), 'github-c15-'));
    const env = Object.assign({}, process.env, { HOME: h });
    const run = (...a) => {
      const x = cp.spawnSync('node', [path.join(root, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'github.js'), ...a],
        { cwd: h, env, encoding: 'utf8' });
      try { return { exit: x.status, json: JSON.parse(x.stdout) }; } catch (e) { return { exit: x.status, json: null, stderr: x.stderr }; }
    };
    const a = run('--refresh', '--repo', 'acme/a');
    const b = run('--refresh', '--repo', 'acme/b');
    const l = run('--load', '--repo', 'acme/b');
    const f = (n) => fs.existsSync(path.join(h, '.sdlc-cache/github/github_com/acme', n));
    const out = { a, b, l, files: [f('a.json'), f('b.json')] };
    fs.rmSync(h, { recursive: true, force: true });
    console.log(JSON.stringify(out));
  },

  'skill-text-a14'() {
    const t = fs.readFileSync(path.join(root, 'plugins', 'sdlc-utilities', 'skills', 'github-sdlc', 'SKILL.md'), 'utf8');
    const fence = [...t.matchAll(/^```bash[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1]).join('\n');
    const n = (s) => t.split(s).length - 1;
    console.log(JSON.stringify({
      inFence: fence.split('$ARGUMENTS').length - 1,
      flagsCalls: n('<FLAGS> --output-file'),
      rule: n('**Flags (A14, C21).**'),
      notFlag: n('Not a github-sdlc flag, read as request text:'),
    }));
  },
};

const argv = process.argv.slice(2);
if (argv.length === 0) usage('a mode or --case is required');
if (argv[0] === '--case') {
  if (argv.length < 2) usage('--case needs a value');
  if (!Object.prototype.hasOwnProperty.call(CASES, argv[1])) usage(`unknown case ${argv[1]}`);
  CASES[argv[1]]();
} else if (argv[0] === 'parity' || argv[0] === 'apply') {
  if (argv.length < 2) usage(`${argv[0]} needs a key`);
  (argv[0] === 'parity' ? parity : apply)(argv[1], argv.slice(2));
} else usage(`unknown mode ${argv[0]}`);
