#!/usr/bin/env node
/**
 * session-cost.js
 *
 * Tally the token usage of tagged Claude Code sessions from their transcripts
 * (main transcript plus its subagents/*.jsonl) and price it in exact
 * pico-dollars against a price table (session-prices.json).
 *
 * Usage:
 *   node session-cost.js --sessions <map.json> (--json | --out <file>) [options]
 *
 * Options:
 *   --sessions <map.json>   JSON object: tag -> array of entries. An entry ending
 *                           in .jsonl or containing / is a transcript path
 *                           relative to --projects-dir; any other entry is a
 *                           session id (required)
 *   --projects-dir <dir>    Transcript root (default: ~/.claude/projects)
 *   --prices <file>         Price table (default: session-prices.json next to
 *                           this script)
 *   --out <file>            Write the JSON report to <file>
 *   --json                  Print the JSON report to stdout
 *   --help                  Print this usage text
 *
 * Tags starting with "aux-" are reported under aux and kept out of total.
 *
 * Exit codes:
 *   0 — report written (unpriced usage is listed in unpriced, complete: false)
 *   1 — a tag's session or transcript path not found
 *   2 — usage, IO, parse, price-table or path error
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCHEMA = 'sdlc-session-cost-1';
const CATEGORIES = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'];
const CACHE_CATEGORIES = ['cacheWrite5m', 'cacheWrite1h', 'cacheRead'];
const PICO_PER_USD = 10n ** 12n;
const MTOK = 10n ** 6n;
const NOT_RECORDED = 'not recorded';
const FLOOR_NOTE = 'output tokens are a floor (subagent transcripts)';

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Pico-dollar helpers
// ---------------------------------------------------------------------------

/** '1.250000000000' -> 1250000000000n; more than 12 fractional digits -> null. */
function toPico(str) {
  const m = /^(\d+)(?:\.(\d{1,12}))?$/.exec(str);
  if (!m) return null;
  return BigInt(m[1]) * PICO_PER_USD + BigInt((m[2] || '').padEnd(12, '0'));
}

/** 1250000000000n -> '1.250000000000'. */
function formatPico(pico) {
  return `${pico / PICO_PER_USD}.${(pico % PICO_PER_USD).toString().padStart(12, '0')}`;
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
    .trim() + '\n';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    sessions: null,
    projectsDir: path.join(os.homedir(), '.claude', 'projects'),
    prices: path.join(__dirname, 'session-prices.json'),
    out: null,
    json: false,
    help: false,
  };
  const valued = { '--sessions': 'sessions', '--projects-dir': 'projectsDir', '--prices': 'prices', '--out': 'out' };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help') {
      opts.help = true;
      return opts;
    } else if (a === '--json') {
      opts.json = true;
    } else if (Object.prototype.hasOwnProperty.call(valued, a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) throw new CliError(`missing value for ${a}`);
      opts[valued[a]] = v;
      i++;
    } else {
      throw new CliError(`unknown flag: ${a}`);
    }
  }

  if (!opts.sessions) throw new CliError('--sessions is required');
  if (!opts.json && !opts.out) throw new CliError('one of --json or --out is required');
  return opts;
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new CliError(`${file}: ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CliError(`${file}: invalid JSON: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Price table -> exact per-token pico rates (KD2)
// ---------------------------------------------------------------------------

/** Price in USD/MTok -> whole pico per token; "not recorded" -> null. */
function pricePico(value, label) {
  if (value === NOT_RECORDED) return null;
  const pico = typeof value === 'number' ? toPico(String(value)) : null;
  if (pico === null || pico % MTOK !== 0n) throw new CliError(`invalid price ${label}`);
  return pico / MTOK;
}

/** Multiplier -> exact fraction numerator over 10^12. */
function multiplierPico(value, label) {
  const pico = typeof value === 'number' ? toPico(String(value)) : null;
  if (pico === null) throw new CliError(`invalid price ${label}`);
  return pico;
}

function scale(rate, fracPico, label) {
  if (rate === null) return null;
  const n = rate * fracPico;
  if (n % PICO_PER_USD !== 0n) throw new CliError(`inexact rate ${label}`);
  return n / PICO_PER_USD;
}

function baseRates(model, row) {
  const rates = {};
  for (const c of CATEGORIES) rates[c] = pricePico(row[c], `${model}.${c}`);
  return rates;
}

function fastRates(model, fast) {
  const input = pricePico(fast.input, `${model}.input`);
  const rates = { input, output: pricePico(fast.output, `${model}.output`) };
  const mult = fast.cacheMultipliers || {};
  for (const c of CACHE_CATEGORIES) {
    const m = mult[c];
    rates[c] = m === undefined || m === NOT_RECORDED || input === null
      ? null
      : scale(input, multiplierPico(m, `${model}.${c}`), `${model}.${c}`);
  }
  return rates;
}

function applyGeo(model, rates, fracPico) {
  const out = {};
  for (const c of CATEGORIES) out[c] = scale(rates[c], fracPico, `${model}.${c}`);
  return out;
}

/**
 * models[model][geo] = { tiers: [{ max, rates }], fast: rates|null } for
 * geo "global" and every geoMultiplier key.
 */
function buildRateTable(prices) {
  const models = prices && typeof prices.models === 'object' && prices.models ? prices.models : {};
  const geos = { global: null };
  for (const [k, v] of Object.entries(prices.geoMultiplier || {})) geos[k] = multiplierPico(v, `geoMultiplier.${k}`);

  const table = {};
  for (const [model, row] of Object.entries(models)) {
    const tierRows = Array.isArray(row.tiers) ? row.tiers : [row];
    const tiers = tierRows.map((t) => ({
      max: typeof t.maxPromptTokens === 'number' ? t.maxPromptTokens : Infinity,
      rates: baseRates(model, t),
    }));
    const fast = row.fast && typeof row.fast === 'object' ? fastRates(model, row.fast) : null;

    table[model] = {};
    for (const [geo, frac] of Object.entries(geos)) {
      table[model][geo] = frac === null
        ? { tiers, fast }
        : {
          tiers: tiers.map((t) => ({ max: t.max, rates: applyGeo(model, t.rates, frac) })),
          fast: fast && applyGeo(model, fast, frac),
        };
    }
  }
  return table;
}

// ---------------------------------------------------------------------------
// Transcript resolution and reading
// ---------------------------------------------------------------------------

function resolveMain(tag, entry, projectsDir) {
  if (entry.endsWith('.jsonl') || entry.includes('/')) {
    const p = path.resolve(projectsDir, entry);
    const rel = path.relative(projectsDir, p);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new CliError(`transcript path outside --projects-dir: ${entry}`);
    }
    if (!fs.existsSync(p)) throw new CliError(`session not found: ${tag}: ${entry}`, 1);
    return p;
  }

  let dirs = [];
  try {
    dirs = fs.readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch (err) {
    if (err.code !== 'ENOENT') throw new CliError(`${projectsDir}: ${err.message}`);
  }
  const matches = dirs
    .map((d) => path.join(projectsDir, d.name, `${entry}.jsonl`))
    .filter((p) => fs.existsSync(p));
  if (matches.length === 0) throw new CliError(`session not found: ${tag}: ${entry}`, 1);
  if (matches.length > 1) throw new CliError(`ambiguous session id: ${entry}`);
  return matches[0];
}

function subagentFiles(main) {
  const dir = path.join(path.dirname(main), path.basename(main, '.jsonl'), 'subagents');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .map((f) => path.join(dir, f));
}

/** Usable message objects of one transcript (R-skip-lines, <synthetic> dropped). */
function readMessages(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new CliError(`${file}: ${err.message}`);
  }
  const out = [];
  text.split('\n').forEach((line, idx) => {
    if (line.trim() === '') return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new CliError(`${file}:${idx + 1}: invalid JSON`);
    }
    const msg = obj && obj.message;
    if (!msg || typeof msg !== 'object') return;
    const u = msg.usage;
    if (!u || typeof u !== 'object' || Array.isArray(u) || typeof msg.id !== 'string') return;
    if (msg.model === '<synthetic>') return;
    out.push(msg);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Booking and pricing
// ---------------------------------------------------------------------------

function count(v) {
  return Number.isSafeInteger(v) && v > 0 ? v : 0;
}

function usageSum(u) {
  return count(u.input_tokens) + count(u.output_tokens)
    + count(u.cache_read_input_tokens) + count(u.cache_creation_input_tokens);
}

function emptyTokens() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
}

function addTokens(into, from) {
  for (const c of CATEGORIES) into[c] += from[c];
}

/** Returns { tokens, unsplit } for one message's usage. */
function bookTokens(u) {
  const tokens = emptyTokens();
  tokens.input = count(u.input_tokens);
  tokens.output = count(u.output_tokens);
  tokens.cacheRead = count(u.cache_read_input_tokens);
  let unsplit = false;
  const cc = u.cache_creation;
  if (cc && typeof cc === 'object') {
    tokens.cacheWrite5m = count(cc.ephemeral_5m_input_tokens);
    tokens.cacheWrite1h = count(cc.ephemeral_1h_input_tokens);
  } else {
    tokens.cacheWrite5m = count(u.cache_creation_input_tokens);
    unsplit = tokens.cacheWrite5m > 0;
  }
  return { tokens, unsplit };
}

/** Returns { pico, unpriced: [{ reason, tokens }] } for one message (KD4 order). */
function priceMessage(model, u, tokens, table, geoMultiplier) {
  const whole = (reason) => ({ pico: 0n, unpriced: [{ reason, tokens }] });

  const byGeo = Object.prototype.hasOwnProperty.call(table, model) ? table[model] : null;
  if (!byGeo) return whole('model not in price table');

  const tier = u.service_tier;
  if (tier !== undefined && tier !== 'standard') return whole(`service_tier: ${tier}`);

  const speed = u.speed;
  const fast = speed === 'fast';
  if (speed !== undefined && speed !== 'standard' && !fast) return whole(`speed: ${speed}`);

  const geoVal = u.inference_geo;
  let geo;
  if (geoVal === undefined || geoVal === 'global') geo = 'global';
  else if (geoVal === 'us' && Object.prototype.hasOwnProperty.call(geoMultiplier || {}, 'us')) geo = 'us';
  else return whole(`inference_geo: ${geoVal}`);

  const entry = byGeo[geo];
  let rates;
  if (fast) {
    if (!entry.fast) return whole('fast: no fast price for model');
    rates = entry.fast;
  } else {
    const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite5m + tokens.cacheWrite1h;
    const chosen = entry.tiers.find((t) => prompt <= t.max) || entry.tiers[entry.tiers.length - 1];
    rates = chosen.rates;
  }

  let pico = 0n;
  const unpriced = [];
  for (const c of CATEGORIES) {
    if (tokens[c] === 0) continue;
    if (rates[c] === null) {
      const t = emptyTokens();
      t[c] = tokens[c];
      unpriced.push({ reason: `price not recorded: ${c}`, tokens: t });
    } else {
      pico += BigInt(tokens[c]) * rates[c];
    }
  }
  return { pico, unpriced };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function tallyTag(tag, entries, opts, table, geoMultiplier, unpricedMap) {
  const best = new Map();
  for (const entry of entries) {
    const main = resolveMain(tag, entry, opts.projectsDir);
    for (const file of [main, ...subagentFiles(main)]) {
      for (const msg of readMessages(file)) {
        const sum = usageSum(msg.usage);
        const prev = best.get(msg.id);
        if (!prev || sum > prev.sum) best.set(msg.id, { msg, sum });
      }
    }
  }

  const acc = {
    sessions: entries.length, messages: 0, unsplitCacheWriteLines: 0, unpricedMessages: 0,
    tokens: emptyTokens(), pico: 0n, byModel: {},
  };
  for (const { msg } of best.values()) {
    const model = typeof msg.model === 'string' ? msg.model : String(msg.model);
    const { tokens, unsplit } = bookTokens(msg.usage);
    const { pico, unpriced } = priceMessage(model, msg.usage, tokens, table, geoMultiplier);

    acc.messages += 1;
    if (unsplit) acc.unsplitCacheWriteLines += 1;
    if (unpriced.length > 0) acc.unpricedMessages += 1;
    addTokens(acc.tokens, tokens);
    acc.pico += pico;

    const bm = acc.byModel[model] || (acc.byModel[model] = { messages: 0, tokens: emptyTokens(), pico: 0n });
    bm.messages += 1;
    addTokens(bm.tokens, tokens);
    bm.pico += pico;

    for (const { reason, tokens: t } of unpriced) {
      const key = `${model}\u0000${reason}`;
      const u = unpricedMap.get(key) || { model, reason, messages: 0, tokens: emptyTokens() };
      u.messages += 1;
      addTokens(u.tokens, t);
      unpricedMap.set(key, u);
    }
  }
  return acc;
}

function renderTag(acc) {
  const byModel = {};
  for (const [m, bm] of Object.entries(acc.byModel)) {
    byModel[m] = { messages: bm.messages, tokens: bm.tokens, usd: formatPico(bm.pico) };
  }
  return {
    sessions: acc.sessions,
    messages: acc.messages,
    unsplitCacheWriteLines: acc.unsplitCacheWriteLines,
    unpricedMessages: acc.unpricedMessages,
    tokens: acc.tokens,
    usd: formatPico(acc.pico),
    byModel,
  };
}

function renderTotal(accs) {
  const tokens = emptyTokens();
  let pico = 0n;
  let unsplit = 0;
  let unpricedMessages = 0;
  for (const a of accs) {
    addTokens(tokens, a.tokens);
    pico += a.pico;
    unsplit += a.unsplitCacheWriteLines;
    unpricedMessages += a.unpricedMessages;
  }
  return {
    tokens,
    usd: formatPico(pico),
    unsplitCacheWriteLines: unsplit,
    unpricedMessages,
    complete: unpricedMessages === 0,
  };
}

function renderUnpriced(map) {
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return [...map.values()].sort((a, b) => cmp(a.model, b.model) || cmp(a.reason, b.reason));
}

function buildReport(prices, sessions, opts) {
  const table = buildRateTable(prices);
  const main = { tags: {}, accs: [], unpriced: new Map() };
  const aux = { tags: {}, accs: [], unpriced: new Map() };

  for (const [tag, entries] of Object.entries(sessions)) {
    const group = tag.startsWith('aux-') ? aux : main;
    const acc = tallyTag(tag, entries, opts, table, prices.geoMultiplier, group.unpriced);
    group.tags[tag] = renderTag(acc);
    group.accs.push(acc);
  }

  const total = renderTotal(main.accs);
  const notes = [FLOOR_NOTE];
  if (!total.complete) notes.push(`${total.unpricedMessages} messages unpriced: usd is a lower bound`);

  return {
    schema: SCHEMA,
    prices: { source: prices.source, retrieved: prices.retrieved },
    tags: main.tags,
    total,
    aux: { tags: aux.tags, total: renderTotal(aux.accs), unpriced: renderUnpriced(aux.unpriced) },
    unpriced: renderUnpriced(main.unpriced),
    notes,
  };
}

function validateSessions(file, sessions) {
  if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) {
    throw new CliError(`${file}: expected a JSON object of tag -> array of entries`);
  }
  for (const [tag, entries] of Object.entries(sessions)) {
    if (!Array.isArray(entries) || entries.some((e) => typeof e !== 'string' || e === '')) {
      throw new CliError(`${file}: tag ${tag}: expected an array of non-empty strings`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    process.stdout.write(usageText());
    return 0;
  }
  opts.projectsDir = path.resolve(opts.projectsDir);

  const prices = readJson(opts.prices);
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
    throw new CliError(`${opts.prices}: expected a JSON object`);
  }
  const sessions = readJson(opts.sessions);
  validateSessions(opts.sessions, sessions);

  const report = buildReport(prices, sessions, opts);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (opts.out) {
    try {
      fs.writeFileSync(opts.out, json);
    } catch (err) {
      throw new CliError(`${opts.out}: ${err.message}`);
    }
  }
  if (opts.json) process.stdout.write(json);
  return 0;
}

module.exports = { toPico, formatPico };

// ---------------------------------------------------------------------------
// Entry point (KD11)
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`session-cost.js error: ${err.message}\n`);
    process.exit(err instanceof CliError ? err.code : 2);
  }
}
