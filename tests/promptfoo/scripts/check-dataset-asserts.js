#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { DATASET_RE } = require('./check-fixture-refs.js');
const { decode } = require('./check-dataset-regex.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// Assertion lint for the exec suites. Rules, per case block (a top-level "- " item of a dataset):
//  - empty-regex: a regex value that compiles and matches the empty string;
//  - negative-only: every assertion type starts with not- and the case does not capture stderr;
//  - key-only-contains: a contains/icontains value that is only a JSON key ("key":).
// A finding outside the allowlist (tests/promptfoo/baselines/dataset-asserts-allow.json) fails; an allowlist
// entry with no matching finding is reported as stale but does not fail.
// Threat model: an author adds an assertion that cannot fail. A text scan, not a YAML parse. Accepted gaps:
//  - a value on a later line than the first non-comment line after its type: line, or a block scalar, is skipped;
//  - javascript assertions are not judged;
//  - a negative-only case that captures stderr (script_capture_stderr) is trusted;
//  - two cases with the same description in one dataset share one allowlist entry;
//  - behavioural and headless datasets are not linted;
//  - a missing exec config or dataset file is skipped (the dataset and case floors of the exec case catch a loss).
// --update writes the allowlist from the current findings (review the diff). --probe proves that each rule
// reports its case, that a positive control and an allowlisted case are not reported, and that an unused entry
// is stale, and that an unreadable allowlist names its file.
const PROMPTFOO_DIR = path.join(REPO_ROOT, 'tests/promptfoo');
const ALLOWLIST = 'tests/promptfoo/baselines/dataset-asserts-allow.json';
const EXEC_CONFIGS = ['promptfooconfig-exec.yaml', 'promptfooconfig-exec-hooks.yaml'];
const TYPE_RE = /^\s*-\s*type:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/;
const VALUE_RE = /^\s*value:\s*([^\n]*)$/;
const DESCRIPTION_RE = /^(?:- | {2})description:\s*(.*)$/;
const STDERR_RE = /^\s*script_capture_stderr:\s*(.*)$/;
const KEY_ONLY_RE = /^"[^"]+":\s*$/;
const FALSY = new Set(['', 'false', '0', 'null', '~']);

function isComment(line) {
  return line.trimStart().startsWith('#');
}

// Decoded text of a raw scalar, or null when it cannot be decoded.
function text(raw) {
  const d = decode(raw);
  return d.error ? null : d.value;
}

// Decoded value of the first non-comment line after line i, when it is a value: line; else null.
function valueAfter(lines, i) {
  let j = i + 1;
  while (j < lines.length && (lines[j].trim() === '' || isComment(lines[j]))) j++;
  const vm = j < lines.length ? VALUE_RE.exec(lines[j]) : null;
  if (!vm) return null;
  const value = text(vm[1]);
  return value === null ? null : { value, line: j + 1 };
}

function matchesEmpty(value) {
  try {
    return new RegExp(value).test('');
  } catch {
    return false;
  }
}

// lines: the dataset lines; start, end: 0-based line range of one case block.
function lintCase(dataset, lines, start, end) {
  let description = null;
  let captureStderr = false;
  const types = [];
  const valueFindings = [];
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isComment(line)) continue;
    const d = DESCRIPTION_RE.exec(line);
    if (d && description === null) description = text(d[1]) ?? d[1].trim();
    const s = STDERR_RE.exec(line);
    if (s && !FALSY.has(text(s[1]) ?? '')) captureStderr = true;
    const t = TYPE_RE.exec(line);
    if (!t) continue;
    const type = t[1];
    types.push(type);
    if (type !== 'regex' && type !== 'contains' && type !== 'icontains') continue;
    const v = valueAfter(lines, i);
    if (!v) continue;
    if (type === 'regex' && matchesEmpty(v.value)) valueFindings.push({ rule: 'empty-regex', line: v.line });
    if (type !== 'regex' && KEY_ONLY_RE.test(v.value)) valueFindings.push({ rule: 'key-only-contains', line: v.line });
  }
  const desc = description ?? '';
  const findings = valueFindings.map((f) => ({ rule: f.rule, dataset, line: f.line, description: desc }));
  if (types.length > 0 && types.every((t) => t.startsWith('not-')) && !captureStderr) {
    findings.push({ rule: 'negative-only', dataset, line: start + 1, description: desc });
  }
  return findings;
}

// promptfooDir: a directory that holds EXEC_CONFIGS. Dataset paths are posix-relative to promptfooDir.
// Returns findings[]; the array also carries the scan counts as .datasets and .cases.
function lintDatasets(promptfooDir) {
  const names = [];
  for (const config of EXEC_CONFIGS) {
    const file = path.join(promptfooDir, config);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (isComment(line)) continue;
      for (const m of line.matchAll(DATASET_RE)) {
        if (!names.includes(m[1])) names.push(m[1]);
      }
    }
  }
  const findings = [];
  let cases = 0;
  for (const dataset of names) {
    const file = path.join(promptfooDir, dataset);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const starts = [];
    lines.forEach((line, i) => {
      if (line.startsWith('- ')) starts.push(i);
    });
    cases += starts.length;
    starts.forEach((start, k) => {
      findings.push(...lintCase(dataset, lines, start, k + 1 < starts.length ? starts[k + 1] : lines.length));
    });
  }
  findings.datasets = names.length;
  findings.cases = cases;
  return findings;
}

function entryKey(x) {
  return JSON.stringify([x.rule, x.dataset, x.description]);
}

// A finding is allowed when an entry has the same rule, dataset and description; an unused entry is stale.
// allowed counts the entries in use (one entry covers every finding of its rule in its case).
function applyAllowlist(findings, entries) {
  const keys = new Set(entries.map(entryKey));
  const used = new Set();
  const rest = [];
  for (const f of findings) {
    const key = entryKey(f);
    if (keys.has(key)) used.add(key);
    else rest.push(f);
  }
  const stale = entries.filter((e) => !used.has(entryKey(e)));
  return { findings: rest, allowed: entries.length - stale.length, stale };
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toEntries(findings) {
  const byKey = new Map();
  for (const f of findings) byKey.set(entryKey(f), { rule: f.rule, dataset: f.dataset, description: f.description });
  return [...byKey.values()].sort((a, b) => cmp(a.rule, b.rule) || cmp(a.dataset, b.dataset)
    || cmp(a.description, b.description));
}

function writeAllowlist(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries }, null, 2) + '\n');
}

function readAllowlist(file) {
  if (!fs.existsSync(file)) throw new Error(`allowlist not found: ${file}; run with --update`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`allowlist unreadable: ${file}: ${err.message}`);
  }
  const entries = data && data.entries;
  if (!Array.isArray(entries)) throw new Error(`allowlist has no entries array: ${file}`);
  return entries;
}

function summary(findings, entries) {
  const r = applyAllowlist(findings, entries);
  return { ok: r.findings.length === 0, datasets: findings.datasets, cases: findings.cases, findings: r.findings,
    allowed: r.allowed, stale: r.stale };
}

// Negative self-test: build a temp tree with one exec config, one dataset and a temp allowlist, and lint it.
function probe() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-asserts-probe-'));
  const item = (description, asserts) => [`- description: "${description}"`, '  assert:',
    ...asserts.map(([type, value]) => `    - type: ${type}\n      value: ${value}`)];
  try {
    const files = {
      'promptfooconfig-exec.yaml': ['tests:', '  - file://datasets/a.yaml', ''],
      'datasets/a.yaml': [
        ...item('probe empty regex', [['regex', "'(?!x)'"]]),
        ...item('probe negative only', [['not-contains', '"error"']]),
        ...item('probe key only', [['contains', `'"key":'`]]),
        ...item('probe positive control', [['contains', `'"key": "v"'`], ['not-contains', '"error"']]),
        ...item('probe allowlisted negative only', [['not-icontains', '"error"']]),
        ''],
    };
    for (const [name, lines] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, lines.join('\n'));
    }
    const allowFile = path.join(root, 'baselines/dataset-asserts-allow.json');
    writeAllowlist(allowFile, [
      { rule: 'negative-only', dataset: 'datasets/a.yaml', description: 'probe allowlisted negative only' },
      { rule: 'negative-only', dataset: 'datasets/a.yaml', description: 'probe no such case' },
    ]);
    const caught = (fn) => { try { fn(); return null; } catch (err) { return err.message; } };
    fs.writeFileSync(path.join(root, 'baselines/null.json'), 'null');
    fs.writeFileSync(path.join(root, 'baselines/invalid.json'), '{');
    const extra = {
      unreadable: caught(() => readAllowlist(path.join(root, 'baselines/null.json'))),
      invalid: caught(() => readAllowlist(path.join(root, 'baselines/invalid.json'))),
    };
    return { ...summary(lintDatasets(root), readAllowlist(allowFile)), ...extra };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

try {
  const args = process.argv.slice(2);
  const allowFile = path.join(REPO_ROOT, ALLOWLIST);
  if (args.includes('--probe')) {
    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
    process.stdout.write(JSON.stringify(probe()) + '\n');
  } else if (args.includes('--update')) {
    const findings = lintDatasets(PROMPTFOO_DIR);
    const entries = toEntries(findings);
    writeAllowlist(allowFile, entries);
    process.stdout.write(JSON.stringify({ ...summary(findings, entries), updated: true }) + '\n');
  } else {
    const result = summary(lintDatasets(PROMPTFOO_DIR), readAllowlist(allowFile));
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
