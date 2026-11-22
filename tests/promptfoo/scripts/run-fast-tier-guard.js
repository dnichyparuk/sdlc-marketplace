#!/usr/bin/env node
/**
 * run-fast-tier-guard.js
 * Test wrapper for the fast-tier case of datasets/fixture-guard-exec.yaml. Reads
 * promptfooconfig-exec-fast.yaml and promptfooconfig-exec.yaml as text (no YAML parser) and prints
 * one JSON line {fastCount, missing, mismatched}: the fast datasets, those missing from the full
 * config, and the config blocks (providers, defaultTest, extensions) that differ. The repo root is
 * found from this file's own path.
 *
 * Takes no flags: any argument exits 2 with a message on stderr and nothing on stdout.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const NAME = 'run-fast-tier-guard';

if (process.argv.length > 2) {
  process.stderr.write(`${NAME}: unknown argument ${process.argv[2]}\nusage: node tests/promptfoo/scripts/${NAME}.js\n`);
  process.exit(2);
}

// Locate the repo root with tests/promptfoo/promptfooconfig-exec.yaml.
let repoRoot = null;
let up = __dirname;
while (up !== path.dirname(up)) {
  if (fs.existsSync(path.join(up, 'tests', 'promptfoo', 'promptfooconfig-exec.yaml'))) {
    repoRoot = up;
    break;
  }
  up = path.dirname(up);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with tests/promptfoo/promptfooconfig-exec.yaml\n`);
  process.exit(1);
}

const dir = path.join(repoRoot, 'tests', 'promptfoo');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => l.trim() && !/^\s*#/.test(l));
const fast = read('promptfooconfig-exec-fast.yaml');
const full = read('promptfooconfig-exec.yaml');
const datasets = (lines) => lines.map((l) => (l.match(/^\s*-\s*file:\/\/(datasets\/\S+)\s*$/) || [])[1]).filter(Boolean);
const block = (lines, key) => {
  const i = lines.findIndex((l) => l.startsWith(key + ':'));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && /^\s/.test(lines[j])) j++;
  return lines.slice(i, j).join('\n');
};
const fastSets = datasets(fast);
const fullSets = new Set(datasets(full));
const out = {
  fastCount: fastSets.length,
  missing: fastSets.filter((d) => !fullSets.has(d)),
  mismatched: ['providers', 'defaultTest', 'extensions'].filter((k) => block(fast, k) === null || block(fast, k) !== block(full, k)),
};
console.log(JSON.stringify(out));
