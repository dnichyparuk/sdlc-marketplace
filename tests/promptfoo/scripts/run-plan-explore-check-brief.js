#!/usr/bin/env node
'use strict';

// Wrapper for `plan-explore.js --check-brief` exec cases: reports the exit code, stdout and
// stderr as one JSON line. With --fault, preloads a module that makes fs.readFileSync return 42
// for a path ending in discovery-brief.md, to exercise the check-error path.

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

const DATA_URL = 'data:text/javascript,'
  + 'import fs from "node:fs";const r=fs.readFileSync;'
  + 'fs.readFileSync=(p,...a)=>String(p).endsWith("discovery-brief.md")?42:r(p,...a);';

let rest = process.argv.slice(2);
const fault = rest[0] === '--fault';
if (fault) rest = rest.slice(1);

const script = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/plan-explore.js');
const r = spawnSync(
  process.execPath,
  [...(fault ? ['--import', DATA_URL] : []), script, '--check-brief', ...rest],
  { encoding: 'utf8' },
);
console.log(JSON.stringify({ status: r.status, out: r.stdout, err: r.stderr }));
