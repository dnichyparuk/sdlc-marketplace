#!/usr/bin/env node
/**
 * run-verify-side-effect-commit.js
 * Test wrapper for `ship.js verify-side-effect --step commit` (R-b3, W4.6).
 *
 * The HEAD sha of a generated fixture repo is not deterministic, so the wrapper
 * resolves it in the working directory (`git rev-parse HEAD`) and passes it as
 * `--expected`. Prints ship.js's stdout unchanged.
 *
 * Args:
 *   --short   pass the 7-character prefix of HEAD instead of the full sha
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

let dir = __dirname;
let shipScript = null;
while (dir !== path.dirname(dir)) {
  const candidate = path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js');
  if (fs.existsSync(candidate)) { shipScript = candidate; break; }
  dir = path.dirname(dir);
}
if (!shipScript) {
  console.log(JSON.stringify({ error: 'Could not find repo root with skill/ship.js' }));
  process.exit(0);
}

const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8' }).stdout.trim();
const expected = process.argv.includes('--short') ? head.slice(0, 7) : head;
const res = spawnSync('node', [shipScript, 'verify-side-effect', '--step', 'commit', '--expected', expected], { cwd: process.cwd(), encoding: 'utf8' });
process.stdout.write(res.stdout || '');
if (res.stderr) process.stderr.write(res.stderr);
process.exit(0);
