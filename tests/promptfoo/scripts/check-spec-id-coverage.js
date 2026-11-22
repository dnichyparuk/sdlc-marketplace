#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { DATASET_RE } = require('./check-fixture-refs.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// Coverage gate for the exec suites: no exec dataset, assertion count, cited id or parsed flag may drop below
// the committed baseline (tests/promptfoo/baselines/spec-id-coverage.json). Growth never fails.
// Threat model: a later wave deletes or merges cases and loses coverage by accident. A text scan, not a YAML
// parse. Accepted gaps:
//  - the id regex also collects tokens that are not spec ids (they only must not drop);
//  - ids cited only inside assertion values are not counted;
//  - a case moved to another dataset needs a deliberate --update;
//  - flag keys from a script_args value that spans several lines are not seen;
//  - a missing exec config is an error, not skipped;
//  - --update can hide a drop, so a baseline diff in a PR must be reviewed.
// --update [--scan-dir <promptfooDir>] writes the baseline from a scan of <promptfooDir> (default tests/promptfoo).
// --probe-drop proves that a dropped dataset, assertion, id and flag are reported and that growth is not.
const PROMPTFOO_DIR = path.join(REPO_ROOT, 'tests/promptfoo');
const BASELINE = 'tests/promptfoo/baselines/spec-id-coverage.json';
const EXEC_CONFIGS = ['promptfooconfig-exec.yaml', 'promptfooconfig-exec-hooks.yaml'];
const ASSERT_RE = /^\s*-\s*type:/;
const DESCRIPTION_RE = /^\s*-?\s*description:/;
const ID_RE = /\b[A-Z]{1,3}\d{1,4}\b/g;
const SCRIPT_PATH_RE = /^\s*script_path:\s*(.*)$/;
const SCRIPT_ARGS_RE = /^\s*script_args:\s*(.*)$/;
const FLAG_RE = /^--[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SUBCOMMAND_RE = /^[a-z][a-z0-9-]*$/;

function unquote(text) {
  const t = text.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.endsWith(t[0])) return t.slice(1, -1);
  return t;
}

// Flag keys of one case block: '<basename of script_path> <token>' for each --name token and a leading subcommand.
function caseFlags(block) {
  let scriptPath = null;
  let scriptArgs = null;
  for (const line of block) {
    const p = SCRIPT_PATH_RE.exec(line);
    if (p) scriptPath = unquote(p[1]);
    const a = SCRIPT_ARGS_RE.exec(line);
    if (a) scriptArgs = unquote(a[1]);
  }
  const keys = new Set();
  if (scriptPath === null || scriptArgs === null) return keys;
  const base = path.posix.basename(scriptPath);
  const tokens = scriptArgs.split(/\s+/).filter(Boolean);
  if (tokens.length > 0 && SUBCOMMAND_RE.test(tokens[0])) keys.add(`${base} ${tokens[0]}`);
  for (const token of tokens) {
    const name = token.split('=')[0];
    if (FLAG_RE.test(name)) keys.add(`${base} ${name}`);
  }
  return keys;
}

// promptfooDir: a directory that holds EXEC_CONFIGS. Dataset keys are posix-relative to promptfooDir.
// Returns the baseline-shaped record plus the total case count (not persisted).
function scanCoverage(promptfooDir) {
  const names = [];
  for (const config of EXEC_CONFIGS) {
    const configFile = path.join(promptfooDir, config);
    if (!fs.existsSync(configFile)) throw new Error(`exec config not found: ${configFile}`);
    for (const line of fs.readFileSync(configFile, 'utf8').split('\n')) {
      if (line.trimStart().startsWith('#')) continue;
      for (const m of line.matchAll(DATASET_RE)) {
        if (!names.includes(m[1])) names.push(m[1]);
      }
    }
  }
  const datasets = {};
  const flags = {};
  let cases = 0;
  for (const name of names.slice().sort()) {
    const file = path.join(promptfooDir, name);
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n') : [];
    const ids = new Set();
    let asserts = 0;
    let block = null;
    const blocks = [];
    for (const line of lines) {
      const comment = line.trimStart().startsWith('#');
      if (line.startsWith('- ')) {
        block = [];
        blocks.push(block);
        cases++;
      }
      if (block && !comment) block.push(line);
      if (!comment && ASSERT_RE.test(line)) asserts++;
      if (comment || DESCRIPTION_RE.test(line)) {
        for (const m of line.matchAll(ID_RE)) ids.add(m[0]);
      }
    }
    for (const b of blocks) {
      for (const key of caseFlags(b)) flags[key] = (flags[key] || 0) + 1;
    }
    datasets[name] = { asserts, ids: [...ids].sort() };
  }
  const sortedFlags = {};
  for (const key of Object.keys(flags).sort()) sortedFlags[key] = flags[key];
  return { version: 1, configs: EXEC_CONFIGS.slice().sort(), datasets, flags: sortedFlags, cases };
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Returns drops[] sorted by kind, then dataset, then key. New datasets, ids, flags and higher counts never drop.
function compareCoverage(baseline, current) {
  const drops = [];
  for (const [dataset, base] of Object.entries(baseline.datasets || {})) {
    const now = current.datasets[dataset];
    if (!now) {
      drops.push({ kind: 'dataset', dataset });
      continue;
    }
    if (now.asserts < base.asserts) drops.push({ kind: 'asserts', dataset, baseline: base.asserts, now: now.asserts });
    for (const key of base.ids) {
      if (!now.ids.includes(key)) drops.push({ kind: 'id', dataset, key });
    }
  }
  for (const [key, count] of Object.entries(baseline.flags || {})) {
    if (count > 0 && !current.flags[key]) drops.push({ kind: 'flag', key });
  }
  return drops.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.dataset || '', b.dataset || '') || cmp(a.key || '', b.key || ''));
}

function writeBaseline(file, record) {
  const { version, configs, datasets, flags } = record;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version, configs, datasets, flags }, null, 2) + '\n');
}

function readBaseline(file) {
  if (!fs.existsSync(file)) throw new Error(`baseline not found: ${file}; run with --update`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`baseline unreadable: ${file}: ${err.message}`);
  }
}

function summary(current, drops) {
  const datasets = Object.values(current.datasets);
  return {
    ok: drops.length === 0,
    configs: current.configs.length,
    datasets: datasets.length,
    cases: current.cases,
    asserts: datasets.reduce((n, d) => n + d.asserts, 0),
    ids: datasets.reduce((n, d) => n + d.ids.length, 0),
    flags: Object.keys(current.flags).length,
    drops,
  };
}

// Negative self-test: build a temp tests/promptfoo-shaped tree, write a baseline from it, then drop one
// assertion and id R7 (a.yaml), the only --x flag case (b.yaml), the dataset c.yaml, and grow d.yaml.
function probeDrop() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-id-coverage-drop-'));
  const write = (files) => {
    for (const [name, lines] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, lines.join('\n'));
    }
  };
  const flagCase = (args, asserts) => ['- description: "flag case"', '  vars:',
    '    script_path: "repo://scripts/x.js"', `    script_args: "${args}"`, '  assert:',
    ...Array.from({ length: asserts }, () => '    - type: equals\n      value: "ok"')];
  const plainCase = (description) => [`- description: "${description}"`, '  assert:', '    - type: equals',
    '      value: "ok"'];
  try {
    write({
      'promptfooconfig-exec.yaml': ['tests:', '  - file://datasets/a.yaml', '  - file://datasets/b.yaml', ''],
      'promptfooconfig-exec-hooks.yaml': ['tests:', '  - file://datasets/c.yaml', '  - file://datasets/d.yaml', ''],
      'datasets/a.yaml': ['# probe dataset a', ...plainCase('keeps P1'), ...plainCase('cites R7'), ''],
      'datasets/b.yaml': [...flagCase('--x 1', 1), ...flagCase('--y', 1), ''],
      'datasets/c.yaml': [...plainCase('cites C3'), ''],
      'datasets/d.yaml': [...plainCase('cites D4'), ''],
    });
    const baselineFile = path.join(root, 'baselines/spec-id-coverage.json');
    writeBaseline(baselineFile, scanCoverage(root));
    write({
      'promptfooconfig-exec-hooks.yaml': ['tests:', '  - file://datasets/d.yaml', ''],
      'datasets/a.yaml': ['# probe dataset a', ...plainCase('keeps P1'), ''],
      'datasets/b.yaml': [...flagCase('--y', 2), ''],
      'datasets/d.yaml': [...plainCase('cites D4'), ...plainCase('grows'), ...plainCase('grows more'), ''],
    });
    const current = scanCoverage(root);
    const result = summary(current, compareCoverage(readBaseline(baselineFile), current));
    fs.rmSync(path.join(root, 'promptfooconfig-exec.yaml'));
    const missingConfig = (() => { try { scanCoverage(root); return null; } catch (err) { return err.message; } })();
    return { ...result, missingConfig };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { EXEC_CONFIGS, scanCoverage, compareCoverage };

if (require.main === module) try {
  const args = process.argv.slice(2);
  const baselineFile = path.join(REPO_ROOT, BASELINE);
  if (args.includes('--probe-drop')) {
    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
    process.stdout.write(JSON.stringify(probeDrop()) + '\n');
  } else if (args.includes('--update')) {
    const i = args.indexOf('--scan-dir');
    if (i !== -1 && !args[i + 1]) throw new Error('--scan-dir needs a directory');
    const current = scanCoverage(i === -1 ? PROMPTFOO_DIR : path.resolve(args[i + 1]));
    writeBaseline(baselineFile, current);
    process.stdout.write(JSON.stringify({ ...summary(current, []), updated: true }) + '\n');
  } else {
    if (args.includes('--scan-dir')) throw new Error('--scan-dir needs --update');
    const current = scanCoverage(PROMPTFOO_DIR);
    const result = summary(current, compareCoverage(readBaseline(baselineFile), current));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
