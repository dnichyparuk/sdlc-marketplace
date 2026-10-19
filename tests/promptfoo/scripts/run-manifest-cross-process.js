#!/usr/bin/env node
/**
 * run-manifest-cross-process.js
 * Exercises lib/output.js#writeOutput persistence (W1.9) in throwaway git repos.
 *
 * Usage: node run-manifest-cross-process.js --mode <cross-process|prune|nongit|gc>
 *
 * Output: a single JSON object describing what the mode observed.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const scripts = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill');
const versionJs = path.join(scripts, 'version.js');
const shipJs = path.join(scripts, 'ship.js');
const versionFixture = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'version-sdlc-config-changelog');

const args = process.argv.slice(2);
const mode = args[args.indexOf('--mode') + 1];

function run(cmd, cmdArgs, cwd) {
  return spawnSync(cmd, cmdArgs, { cwd, encoding: 'utf8', env: Object.assign({}, process.env, { SDLC_STATE_DIR_OVERRIDE: '' }) });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-persist-'));
  fs.cpSync(versionFixture, dir, { recursive: true });
  const r = run('bash', ['setup.sh'], dir);
  if (r.status !== 0) throw new Error('setup.sh failed: ' + r.stderr);
  run('git', ['checkout', '-q', '-B', 'main'], dir);
  return dir;
}

function printedPath(r) {
  return (r.stdout || '').trim().split('\n').pop();
}

const cleanup = [];
let result;
try {
  if (mode === 'cross-process') {
    const dir = makeRepo(); cleanup.push(dir);
    const first = run('node', [versionJs, '--output-file'], dir);
    const p = printedPath(first);
    const second = run('node', ['-e', 'const fs=require("fs");const p=process.argv[1];console.log(JSON.stringify({exists:fs.existsSync(p),parses:!!JSON.parse(fs.readFileSync(p,"utf8"))}))', p], dir);
    const seen = JSON.parse(second.stdout);
    result = { path: p, exists: seen.exists, parses: seen.parses, underOut: p.includes('/.sdlc/execution/out/'), inVersionContext: p.includes('/.sdlc/execution/out/version-context-') };
  } else if (mode === 'prune') {
    const dir = makeRepo(); cleanup.push(dir);
    const first = printedPath(run('node', [versionJs, '--output-file'], dir));
    const old = new Date(Date.now() - 2 * 3600000);
    fs.utimesSync(first, old, old);
    const second = printedPath(run('node', [versionJs, '--output-file'], dir));
    const outDir = path.dirname(second);
    result = { firstGone: !fs.existsSync(first), secondExists: fs.existsSync(second), files: fs.readdirSync(outDir).filter(f => f.startsWith('version-context-')).length };
  } else if (mode === 'nongit') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-nongit-')); cleanup.push(dir);
    const p = printedPath(run('node', [versionJs, '--output-file'], dir));
    result = { path: p, underTmpdir: p.startsWith(os.tmpdir() + path.sep), notInSdlcOut: !p.includes('/.sdlc/execution/out/'), exists: fs.existsSync(p) };
    cleanup.push(p);
  } else if (mode === 'gc') {
    const dir = makeRepo(); cleanup.push(dir);
    const outDir = path.join(dir, '.sdlc', 'execution', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const stale = path.join(outDir, 'pr-context-main-20240101T000000Z-aaaa.json');
    const fresh = path.join(outDir, 'pr-context-main-fresh-bbbb.json');
    fs.writeFileSync(stale, '{}'); fs.writeFileSync(fresh, '{}');
    const nineDays = new Date(Date.now() - 9 * 86400000);
    fs.utimesSync(stale, nineDays, nineDays);
    const p = printedPath(run('node', [shipJs, '--output-file', '--gc', '--ttl-days', '7'], dir));
    const report = JSON.parse(fs.readFileSync(p, 'utf8')).report;
    result = { out: report.out, staleGone: !fs.existsSync(stale), freshKept: fs.existsSync(fresh) };
  } else {
    result = { error: 'unknown mode ' + mode };
  }
} finally {
  for (const c of cleanup) fs.rmSync(c, { recursive: true, force: true });
}
console.log(JSON.stringify(result));
