'use strict';
// Exec helper (A04): scans a body with a very long backtick run and many unclosed fences, then prints
// { ms, msSmall, logins } (best of 3 runs at full and quarter size) so a dataset case can assert the scan stays linear. Args: none.
const path = require('path');

const content = require(path.resolve(__dirname, '../../../plugins/sdlc-utilities/scripts/lib/github-content.js'));
const text = (n) => 'x' + '`'.repeat(n) + ' @bob\n' + '```\n'.repeat(n / 2) + '@carol';
let logins = [];
const time = (n) => {
  const t0 = Date.now();
  const found = content.findMentions(text(n)).map((m) => m.login);
  const ms = Date.now() - t0;
  if (n === 30000) logins = found;
  return ms;
};
const best = (n) => Math.min(...[0, 1, 2].map(() => time(n)));
process.stdout.write(JSON.stringify({ ms: best(30000), msSmall: best(7500), logins }) + '\n');
