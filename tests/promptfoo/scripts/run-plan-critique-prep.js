#!/usr/bin/env node
'use strict';

// Wrapper for `plan.js critique-prep` and `plan.js merge-lanes --compact` exec cases. It owns a
// temp dir (a dataset line cannot run mktemp) and reports one JSON line.
//
//   prep <root> <plan> [--g17-fail]   runs critique-prep with --root <root> (with --g17-fail, a temp
//                                     root whose .sdlc/review-dimensions is a regular file, so
//                                     g17-prepare throws ENOTDIR); reports status, out, err and the
//                                     file names under iterDir
//   merge <fixtureDir> <args...>      copies the fixture dir to a temp dir (the fixture stays clean),
//                                     replaces the token @COPY@ in the args with that copy, runs
//                                     `merge-lanes <args> --compact`; reports status, out, err and
//                                     the dir's merged.json (null when absent)

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const script = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/plan.js');
const [mode, ...rest] = process.argv.slice(2);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-critique-prep-'));

function run(args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  if (r.error) {
    throw new Error(r.error.message);
  }
  return r;
}

let report;
try {
  if (mode === 'prep') {
    const [rootArg, plan, ...flags] = rest;
    let root = rootArg;
    if (flags.includes('--g17-fail')) {
      root = path.join(tmp, 'root');
      fs.mkdirSync(path.join(root, '.sdlc'), { recursive: true });
      fs.writeFileSync(path.join(root, '.sdlc/review-dimensions'), 'not a directory\n');
    }
    const critiqueDir = path.join(tmp, 'critique');
    const r = run(['critique-prep', '--critique-dir', critiqueDir, '--iter', '1', '--plan', plan, '--root', root]);
    const iterDir = path.join(critiqueDir, 'iter-1');
    report = { status: r.status, out: r.stdout, err: r.stderr, files: fs.existsSync(iterDir) ? fs.readdirSync(iterDir).sort() : [] };
  } else if (mode === 'merge') {
    const [fixture, ...args] = rest;
    const copy = path.join(tmp, 'copy');
    fs.cpSync(fixture, copy, { recursive: true });
    const dir = args.map(a => a.split('@COPY@').join(copy));
    if (dir.indexOf('--dir') === -1) throw new Error('merge needs --dir');
    const r = run(['merge-lanes', ...dir, '--compact']);
    const mergedFile = path.join(dir[dir.indexOf('--dir') + 1], 'merged.json');
    report = { status: r.status, out: r.stdout, err: r.stderr, merged: fs.existsSync(mergedFile) ? JSON.parse(fs.readFileSync(mergedFile, 'utf8')) : null };
  } else {
    throw new Error('mode must be prep or merge');
  }
} catch (err) {
  fs.rmSync(tmp, { recursive: true, force: true });
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify(report));
