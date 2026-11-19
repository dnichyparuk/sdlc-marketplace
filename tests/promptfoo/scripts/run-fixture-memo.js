#!/usr/bin/env node
/**
 * run-fixture-memo.js
 * Test wrapper for the memoised fixture build in scripts/extract-skill-content.js (TK-001).
 *
 * Usage:
 *   --fixture <name> --cases <n>   Run n concurrent transformVars calls for fixtures-fs/<name>.
 *                                  Prints { roots, distinctRoots, buildIds, distinctBuildIds,
 *                                  agedMtimes, linkTargets, templates }; exit 0.
 *   --scan [--fixtures a,b,c]      For every fixture with a setup.sh (or the named ones), compare
 *                                  a fresh build with a template copy. Prints
 *                                  { scanned, memo, perCase, mismatches: [{ fixture, diff }] };
 *                                  exit 0 when mismatches is empty, else 1.
 * A usage error prints `Error: <reason>` on stderr and exits 2.
 * Every folder the run made is removed before it exits.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const transformVars = require('./extract-skill-content.js');
const { afterAll: removeFixtureCopies } = require('./fixture-copies-cleanup.js');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures-fs');

function usage(reason) {
  process.stderr.write(`Error: ${reason}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { fixture: null, cases: 1, scan: false, fixtures: null };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) usage(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--fixture') opts.fixture = value(i++, flag);
    else if (flag === '--cases') {
      const v = value(i++, flag);
      if (!/^[1-9]\d*$/.test(v)) usage(`--cases must be a positive integer, got "${v}"`);
      opts.cases = Number(v);
    } else if (flag === '--scan') opts.scan = true;
    else if (flag === '--fixtures') opts.fixtures = value(i++, flag).split(',').filter(Boolean);
    else usage(`unknown flag "${flag}"`);
  }
  if (!opts.scan && !opts.fixture) usage('--fixture <name> or --scan is required');
  return opts;
}

const tryOr = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
const caseVars = (name) => ({ project_root: `file://fixtures-fs/${name}` });

async function runFixture(name, cases) {
  const results = await Promise.all(Array.from({ length: cases }, () => transformVars(caseVars(name))));
  const roots = results.map((r) => r.project_root);
  const buildIds = roots.map((r) => tryOr(() => fs.readFileSync(path.join(r, 'build-id'), 'utf8').trim()));
  const templates = await Promise.all([...(globalThis.__sdlcFixtureTemplates ?? new Map()).values()]);
  return {
    roots,
    distinctRoots: new Set(roots).size,
    buildIds,
    distinctBuildIds: new Set(buildIds.filter((id) => id !== null)).size,
    agedMtimes: roots.map((r) => tryOr(() => fs.lstatSync(path.join(r, 'aged.txt')).mtime.toISOString())),
    linkTargets: roots.map((r) => tryOr(() => fs.readlinkSync(path.join(r, 'link-rel')))),
    templates,
  };
}

/** Relative names (posix) of every fixtures-fs directory that holds a setup.sh, at any depth. */
function setupFixtures(dir = FIXTURES_DIR) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (entries.some((e) => e.isFile() && e.name === 'setup.sh')) {
    found.push(path.relative(FIXTURES_DIR, dir).split(path.sep).join('/'));
  }
  for (const e of entries) if (e.isDirectory()) found.push(...setupFixtures(path.join(dir, e.name)));
  return found;
}

const RUN_START_MS = Date.now();
// A setup.sh may backdate relative to its own build time ("25 hours ago"), so the fresh build and
// the template copy, built seconds apart, may differ by that much.
const MTIME_TOLERANCE_MS = 60_000;

/**
 * Comparable lines for a built fixture: every entry outside .git (flagged `backdated` when a
 * setup.sh set its mtime before this run), then the git state; and the backdated mtimes by path.
 */
function describe(root) {
  const lines = [];
  const backdated = new Map();
  const walk = (d) => {
    const entries = fs.readdirSync(d, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = path.join(d, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      const st = fs.lstatSync(full);
      let meta = (st.mode & 0o7777).toString(8);
      if (st.mtimeMs < RUN_START_MS && e.name !== '.git') {
        meta += ' backdated';
        backdated.set(rel, st.mtimeMs);
      }
      if (e.isSymbolicLink()) lines.push(`${rel} symlink ${meta} -> ${fs.readlinkSync(full)}`);
      else if (e.isDirectory()) {
        if (e.name === '.git') continue;
        lines.push(`${rel} dir ${meta}`);
        walk(full);
      } else lines.push(`${rel} ${e.isFile() ? 'file' : 'other'} ${meta}`);
    }
  };
  walk(root);
  if (fs.existsSync(path.join(root, '.git'))) {
    for (const args of [['status', '--porcelain=v1'], ['rev-parse', '--abbrev-ref', 'HEAD'], ['log', '--format=%s']]) {
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      lines.push(`git ${args.join(' ')} [${r.status}]: ${(r.stdout || '').trimEnd()}`);
    }
  }
  return { lines, backdated };
}

function diffBuilds(fresh, copy) {
  const inCopy = new Set(copy.lines);
  const inFresh = new Set(fresh.lines);
  const iso = (ms) => new Date(ms).toISOString();
  return [
    ...fresh.lines.filter((l) => !inCopy.has(l)).map((l) => `- ${l}`),
    ...copy.lines.filter((l) => !inFresh.has(l)).map((l) => `+ ${l}`),
    ...[...fresh.backdated]
      .filter(([rel, ms]) => copy.backdated.has(rel) && Math.abs(copy.backdated.get(rel) - ms) > MTIME_TOLERANCE_MS)
      .map(([rel, ms]) => `~ ${rel} mtime ${iso(ms)} vs ${iso(copy.backdated.get(rel))}`),
  ].join('\n');
}

async function scan(names) {
  const out = { scanned: 0, memo: 0, perCase: 0, mismatches: [] };
  for (const fixture of names) {
    const sourceDir = path.join(FIXTURES_DIR, fixture);
    out.scanned++;
    try {
      if (!(await transformVars.templateFor(sourceDir))) {
        out.perCase++;
        continue;
      }
      out.memo++;
      const fresh = await transformVars.buildFresh(sourceDir);
      const { project_root: copy } = await transformVars(caseVars(fixture));
      const diff = diffBuilds(describe(fresh), describe(copy));
      if (diff) out.mismatches.push({ fixture, diff });
    } catch (err) {
      out.mismatches.push({ fixture, diff: `build failed: ${err.message.trim()}` });
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let names = null;
  if (opts.scan) {
    names = opts.fixtures ?? setupFixtures();
    for (const name of names) {
      if (!fs.existsSync(path.join(FIXTURES_DIR, name, 'setup.sh'))) usage(`fixture "${name}" has no setup.sh`);
    }
  } else if (!fs.existsSync(path.join(FIXTURES_DIR, opts.fixture))) {
    usage(`fixture "${opts.fixture}" not found`);
  }
  let out;
  try {
    out = opts.scan ? await scan(names) : await runFixture(opts.fixture, opts.cases);
  } finally {
    await removeFixtureCopies();
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = opts.scan && out.mismatches.length > 0 ? 1 : 0;
}

main().catch((err) => {
  process.stderr.write(`run-fixture-memo: ${err.stack || err.message}\n`);
  process.exit(2);
});
