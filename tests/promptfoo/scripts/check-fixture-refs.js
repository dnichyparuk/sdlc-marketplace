#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// #9388: every file://fixtures/... or file://fixtures-fs/... reference in a behavioural or headless dataset must
// resolve, or promptfoo aborts the whole suite before any case runs.
// Threat model: a best-effort lint for dataset authors, a text scan, not a YAML parse. Accepted gaps:
//  - a reference built from a template variable ({{...}}) or split over lines is not seen;
//  - a fixture path without file:// (for example stub_bin in headless-github.yaml) is not checked;
//  - a .. segment is resolved as written, not confined to tests/promptfoo/;
//  - a reference inside a block scalar or after a # on the same line is checked (fails safe).
// --probe-missing proves that the scan reports a missing fixture and a missing dataset.
const PROMPTFOO_DIR = path.join(REPO_ROOT, 'tests/promptfoo');
const CONFIGS = ['promptfooconfig.yaml', 'promptfooconfig-headless.yaml'];
const DATASET_RE = /file:\/\/(datasets\/[^"'\s]+\.ya?ml)/g;
const REF_RE = /file:\/\/(fixtures(?:-fs)?\/[^"'\s,\]}]+)/g;

// root: a directory that holds CONFIGS. Paths in the result are posix-relative to root.
function scanRefs(root) {
  const missing = [];
  const datasets = [];
  for (const config of CONFIGS) {
    const lines = fs.readFileSync(path.join(root, config), 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(DATASET_RE)) {
        if (!datasets.includes(m[1])) datasets.push(m[1]);
        if (!fs.existsSync(path.join(root, m[1]))) {
          missing.push({ dataset: config, line: i + 1, ref: m[1] });
        }
      }
    });
  }
  let refs = 0;
  for (const dataset of datasets) {
    const file = path.join(root, dataset);
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('#')) return;
      for (const m of line.matchAll(REF_RE)) {
        refs++;
        if (!fs.existsSync(path.join(root, m[1]))) missing.push({ dataset, line: i + 1, ref: m[1] });
      }
    });
  }
  return { ok: missing.length === 0, configs: CONFIGS.length, datasets: datasets.length, refs, missing };
}

// Negative self-test: build a temp tree with a missing fixture and a missing fixture dir, outside tests/promptfoo,
// and scan it with the real scanRefs.
function probeMissing() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-refs-missing-'));
  try {
    const files = {
      'promptfooconfig.yaml': ['tests:', '  - file://datasets/a.yaml', ''],
      'promptfooconfig-headless.yaml': ['tests:', '  - file://datasets/b.yaml', ''],
      'datasets/a.yaml': ['- vars:', '    project_context: "file://fixtures/present.md"',
        '    other: "file://fixtures/absent.md"', '# project_context: "file://fixtures/commented.md"', ''],
      'datasets/b.yaml': ['- vars:', '    project_root: "file://fixtures-fs/absent-dir"', ''],
      'fixtures/present.md': ['# present', ''],
    };
    for (const [name, lines] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, lines.join('\n'));
    }
    return scanRefs(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { CONFIGS, DATASET_RE };

if (require.main === module) try {
  if (process.argv.includes('--probe-missing')) {
    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
    process.stdout.write(JSON.stringify(probeMissing()) + '\n');
  } else {
    const result = scanRefs(PROMPTFOO_DIR);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
