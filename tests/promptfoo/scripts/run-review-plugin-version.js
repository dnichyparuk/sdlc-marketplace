#!/usr/bin/env node
/**
 * run-review-plugin-version.js
 * Test harness that exercises the plugin_version resolution path in
 * plugins/sdlc-utilities/scripts/skill/review.js without invoking git or gh API.
 *
 * Directly calls getPluginVersion() from config-version.js (the same function
 * review.js uses after Task 1 exported it) and emits a JSON fragment matching
 * the manifest field shape.
 *
 * Usage:
 *   node run-review-plugin-version.js
 *
 * Output:
 *   { "plugin_version": "<version or unknown>", "expected": "<plugin.json version>" }
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const configVersionPath = path.join(
  REPO_ROOT,
  'plugins',
  'sdlc-utilities',
  'scripts',
  'lib',
  'config-version.js'
);

const { getPluginVersion } = require(configVersionPath);

const pluginJsonPath = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', '.claude-plugin', 'plugin.json');
const expected = JSON.parse(require('fs').readFileSync(pluginJsonPath, 'utf8')).version;

const version = getPluginVersion();
process.stdout.write(JSON.stringify({ plugin_version: version, expected }) + '\n');
