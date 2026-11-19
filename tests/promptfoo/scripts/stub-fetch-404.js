'use strict';
// Exec preload (loaded via NODE_OPTIONS=--require): makes every fetch answer 404 and every DNS lookup
// resolve to a public address, so generic-404 link cases need no network. Args: none; prints nothing.
globalThis.fetch = async () => new Response('', { status: 404, statusText: 'Not Found' });
const dns = require('dns');
dns.promises.lookup = async (host, opts) => (opts && opts.all)
  ? [{ address: '93.184.215.14', family: 4 }]
  : { address: '93.184.215.14', family: 4 };
