'use strict';
// Exec helper (A04): scans a body with a very long backtick run and many unclosed fences, then prints
// { ms, logins } so a dataset case can assert the scan stays linear. Args: none.
const path = require('path');

const content = require(path.resolve(__dirname, '../../../plugins/sdlc-utilities/scripts/lib/github-content.js'));
const text = 'x' + '`'.repeat(30000) + ' @bob\n' + '```\n'.repeat(15000) + '@carol';
const t0 = Date.now();
const logins = content.findMentions(text).map((m) => m.login);
process.stdout.write(JSON.stringify({ ms: Date.now() - t0, logins }) + '\n');
