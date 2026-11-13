#!/usr/bin/env node
/**
 * run-plan-copy-subdir.js
 * Test wrapper for skill/plan.js merge-lanes --plan copy check run from a
 * subdirectory of the project (#9375). The script runner copies fixtures to a
 * non-git temp folder, where both roots fall back to the working directory and
 * the bug cannot show, so this wrapper git-inits the folder first.
 *
 * Args:
 *   --project-root <path>   Fixture copy (plan-copy-rules); git-init'd here
 *
 * Prints the child's stdout unchanged and exits with its status.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) {
    projectRoot = path.resolve(args[++i]);
  }
}

const repo = path.resolve(__dirname, '../../..');

spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: projectRoot, encoding: 'utf8' });

const res = spawnSync(process.execPath, [
  path.join(repo, 'plugins/sdlc-utilities/scripts/skill/plan.js'),
  'merge-lanes',
  '--dir', path.join(projectRoot, 'iter'),
  '--lenses', 'all',
  '--plan', path.join(projectRoot, 'plans/missing-doc.md'),
], { cwd: path.join(projectRoot, 'docs'), encoding: 'utf8' });

process.stdout.write(res.stdout || '');
if (res.stderr) process.stderr.write(res.stderr);
process.exit(res.status === null ? 1 : res.status);
