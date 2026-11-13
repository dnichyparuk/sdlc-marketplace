/**
 * run-links-blocked-host.js — print blockedHostReason for a fixed host list as JSON.
 *
 * Used by datasets/links-lib-exec.yaml via
 *   script_path: "repo://tests/promptfoo/scripts/run-links-blocked-host.js".
 */
'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const { blockedHostReason } = require(path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'lib', 'links.js'));

const list = ['[fec0::1]', 'feff::1', '::ffff:198.18.0.1', '::ffff:c000:0008', '93.184.216.34', '192.0.2.1', '198.20.0.1'];
console.log(JSON.stringify(Object.fromEntries(list.map(h => [h, blockedHostReason(h)]))));
