#!/usr/bin/env node
/**
 * run-cost-tiers-crlf.js
 * Copies fixtures-fs/cost-tiers-clean to a temp dir, rewrites every .md with CRLF
 * line endings, and runs validate-cost-tiers.js --strict against the copy.
 *
 * Output JSON: { exitCode, stdout, stderr }
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fixture = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'cost-tiers-clean');
const validator = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'ci', 'validate-cost-tiers.js');

function toCrlf(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) toCrlf(p);
    else if (entry.name.endsWith('.md')) {
      const text = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      fs.writeFileSync(p, text);
    }
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-tiers-crlf-'));
let result;
try {
  fs.cpSync(fixture, tmp, { recursive: true });
  toCrlf(tmp);
  const r = spawnSync('node', [validator, '--root', tmp, '--strict'], { encoding: 'utf8' });
  result = { exitCode: r.status, stdout: r.stdout, stderr: r.stderr };
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify(result));
