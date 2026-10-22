#!/usr/bin/env node
/**
 * wave-metrics.js
 *
 * Summarise per-wave metrics records (`<root>/m*\/metrics.json`) into one row
 * per milestone. Read-only over --root.
 *
 * Usage:
 *   node wave-metrics.js [options]
 *
 * Options:
 *   --root <dir>   Orchestration directory (default: <sdlc root>/.sdlc/orchestration)
 *   --json         Print a JSON array of objects keyed by the column headers
 *   --help         Print this usage text
 *
 * Exit codes:
 *   0 - table printed (zero metrics files: header only, or [])
 *   1 - a record is not an object, has a schema other than sdlc-wave-metrics-1,
 *       no milestone, or a cost.usd string that is neither a plain decimal nor
 *       "not recorded"
 *   2 - usage error, missing root, unreadable or invalid metrics file
 *
 * Money sums reuse toPico / formatPico from ./session-cost.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LIB = path.join(__dirname, '..', 'lib');
const { resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { toPico, formatPico } = require('./session-cost');

const SCHEMA = 'sdlc-wave-metrics-1';
const NOT_RECORDED = 'not recorded';

const HEADERS = [
  'Milestone',
  'Waves',
  'Items',
  'Sum net h',
  'Sum owner-wait h',
  'Plan stops',
  'Exec stops',
  'Executor resets',
  'Review findings total / fixed / declined / REAL',
  'Fix rounds',
  'Orch gate first-try',
  'Arb plan-check blocking items',
  'Arbiter overturns',
  'Gate bypasses',
  'D15 deletes',
  'Behavioural runs',
  'Cost USD',
];

class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function usageText() {
  const src = fs.readFileSync(__filename, 'utf8');
  const header = src.slice(src.indexOf('/**') + 3, src.indexOf('*/'));
  return header
    .split('\n')
    .map((l) => l.replace(/^ \* ?/, ''))
    .join('\n')
    .trim();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = path.join(resolveSdlcRoot(), '.sdlc', 'orchestration');
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root') {
      if (i + 1 >= args.length) throw new ExitError(2, 'missing value for --root');
      root = path.resolve(args[++i]);
    } else if (a === '--json') {
      json = true;
    } else if (a === '--help') {
      help = true;
    } else {
      throw new ExitError(2, `unknown flag: ${a}`);
    }
  }
  return { root, json, help };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function loadRecords(root) {
  let st;
  try {
    st = fs.statSync(root);
  } catch (err) {
    throw new ExitError(2, `${root}: ${err.code === 'ENOENT' ? 'directory not found' : err.message}`);
  }
  if (!st.isDirectory()) throw new ExitError(2, `${root}: not a directory`);

  const files = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('m'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(root, name, 'metrics.json'))
    .filter((f) => fs.existsSync(f));

  const records = [];
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new ExitError(2, `${file}: ${err.message}`);
    }
    if (!Array.isArray(data)) throw new ExitError(2, `${file}: not a JSON array`);
    data.forEach((rec, i) => {
      if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) {
        throw new ExitError(1, `${file}: record ${i} is not an object`);
      }
      const schema = rec.schema;
      if (schema !== SCHEMA) {
        throw new ExitError(1, `${file}: record ${i} schema ${JSON.stringify(schema)}`);
      }
      if (typeof rec.milestone !== 'string' || rec.milestone === '') {
        throw new ExitError(1, `${file}: record ${i} milestone ${JSON.stringify(rec.milestone)}`);
      }
      const usd = get(rec, ['cost', 'usd']);
      if (typeof usd === 'string' && usd !== NOT_RECORDED && toPico(usd) === null) {
        throw new ExitError(1, `${file}: wave ${rec.wave === undefined ? `(record ${i})` : rec.wave}: cost.usd is not a decimal string: ${usd}`);
      }
      records.push(rec);
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function get(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Value extractors return a number (or bigint pico for cost) when recorded, else null. */
const numAt = (keys) => (rec) => num(get(rec, keys));

function findingsTotal(rec) {
  const f = get(rec, ['review', 'findings']);
  if (f === null || typeof f !== 'object' || Array.isArray(f)) return null;
  const nums = Object.values(f).filter((v) => num(v) !== null);
  return nums.length ? nums.reduce((s, v) => s + v, 0) : null;
}

function costPico(rec) {
  const usd = get(rec, ['cost', 'usd']);
  return typeof usd === 'string' ? toPico(usd) : null;
}

function formatNumber(sum) {
  return Number.isInteger(sum) ? String(sum) : String(Number(sum.toFixed(2)));
}

/** Apply the k-of-n cell rule to the recorded values of one group. */
function cell(values, n, render) {
  const k = values.length;
  if (k === 0) return NOT_RECORDED;
  return k === n ? render(values) : `${render(values)} (${k} of ${n} waves)`;
}

function sumCell(group, extract, render = (vals) => formatNumber(vals.reduce((s, v) => s + v, 0))) {
  return cell(group.map(extract).filter((v) => v !== null), group.length, render);
}

function gateCell(group) {
  const vals = group.map((r) => get(r, ['gate', 'orchGateFirstTry'])).filter((v) => typeof v === 'boolean');
  return cell(vals, group.length, (v) => `${v.filter(Boolean).length}/${v.length}`);
}

const COLUMNS = [
  (m) => m,
  (m, g) => String(g.length),
  (m, g) => sumCell(g, (r) => (Array.isArray(r.items) ? r.items.length : null)),
  (m, g) => sumCell(g, numAt(['hours', 'net'])),
  (m, g) => sumCell(g, numAt(['hours', 'ownerWait'])),
  (m, g) => sumCell(g, numAt(['plan', 'plannerStops'])),
  (m, g) => sumCell(g, numAt(['exec', 'execStops'])),
  (m, g) => sumCell(g, numAt(['exec', 'executorResets'])),
  (m, g) =>
    [findingsTotal, numAt(['review', 'fixed']), numAt(['review', 'declined']), numAt(['review', 'declineRecheck', 'real'])]
      .map((ex) => sumCell(g, ex))
      .join(' / '),
  (m, g) => sumCell(g, numAt(['review', 'fixRounds'])),
  (m, g) => gateCell(g),
  (m, g) => sumCell(g, numAt(['plan', 'arbCheck', 'B'])),
  (m, g) => sumCell(g, numAt(['arbiter', 'overturns'])),
  (m, g) => sumCell(g, numAt(['exec', 'gateBypasses'])),
  (m, g) => sumCell(g, numAt(['exec', 'd15Deletes'])),
  (m, g) => sumCell(g, numAt(['gate', 'behaviouralRuns'])),
  (m, g) => sumCell(g, costPico, (vals) => formatPico(vals.reduce((s, v) => s + v, 0n))),
];

function buildRows(records) {
  const groups = new Map();
  for (const rec of records) {
    if (!groups.has(rec.milestone)) groups.set(rec.milestone, []);
    groups.get(rec.milestone).push(rec);
  }
  return [...groups].map(([m, g]) => COLUMNS.map((col) => col(m, g)));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const { root, json, help } = parseArgs(process.argv);
  if (help) {
    process.stdout.write(`${usageText()}\n`);
    return 0;
  }

  const rows = buildRows(loadRecords(root));
  if (json) {
    const objs = rows.map((r) => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]])));
    process.stdout.write(`${JSON.stringify(objs, null, 2)}\n`);
  } else {
    const line = (cells) => `| ${cells.join(' | ')} |`;
    const out = [line(HEADERS), `|${HEADERS.map(() => '---').join('|')}|`, ...rows.map(line)];
    process.stdout.write(`${out.join('\n')}\n`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`wave-metrics.js error: ${err.message}\n`);
    process.exit(err.exitCode || 2);
  }
}
