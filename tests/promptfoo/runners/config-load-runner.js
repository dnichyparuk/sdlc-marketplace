#!/usr/bin/env node
'use strict';

// Tiny test runner: read project config and emit its source list as JSON.
// Invoked by tests/promptfoo/datasets/config-load-exec.yaml.

const path = require('path');
const cfg = require(path.resolve(__dirname, '..', '..', '..', 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'config.js'));

const sectionIdx = process.argv.indexOf('--section');
if (sectionIdx !== -1) {
  process.stdout.write(JSON.stringify(cfg.readSection(process.cwd(), process.argv[sectionIdx + 1])) + '\n');
} else {
  const result = cfg.readProjectConfig(process.cwd());
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
