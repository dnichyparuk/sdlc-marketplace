#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { CONFIGS, DATASET_RE } = require('./check-fixture-refs.js');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// #9391: every regex/not-regex value in a behavioural or headless dataset must compile with
// new RegExp(value) (promptfoo adds no flags), or the assertion can never pass.
// Threat model: a best-effort lint for dataset authors, a text scan, not a YAML parse. Accepted gaps:
//  - the value must be on the first non-comment line after its type: line (every current value is);
//  - a value with {{...}} is compiled as written, before promptfoo renders it;
//  - an assertion in a config file (not a dataset) or under defaultTest is not seen;
//  - a dataset file that a config names but that does not exist is skipped (check-fixture-refs.js reports it);
//  - a JSON-incompatible YAML escape (\x, \ ) is reported as undecodable (fails safe).
// --probe-invalid proves that the scan reports an invalid regex, an invalid not-regex and an empty value.
const PROMPTFOO_DIR = path.join(REPO_ROOT, 'tests/promptfoo');
const TYPE_RE = /^\s*-?\s*type:\s*["']?(not-)?regex["']?\s*$/;
const VALUE_RE = /^\s*value:\s*([^\n]*)$/;

// Returns { value } or { error } for a raw value text.
function decode(raw) {
  const text = raw.trim();
  if (text === '') return { error: 'empty value' };
  if (/^([|>][-+0-9]*)?$/.test(text)) return { error: 'block scalar not supported' };
  if (text.startsWith('"')) {
    try {
      return { value: JSON.parse(text) };
    } catch (err) {
      return { error: `cannot decode double-quoted value: ${err.message}` };
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return { value: text.slice(1, -1).replace(/''/g, "'") };
  }
  return { value: text };
}

// root: a directory that holds CONFIGS. Paths in the result are posix-relative to root.
function scanRegex(root) {
  const datasets = [];
  for (const config of CONFIGS) {
    for (const line of fs.readFileSync(path.join(root, config), 'utf8').split('\n')) {
      for (const m of line.matchAll(DATASET_RE)) {
        if (!datasets.includes(m[1])) datasets.push(m[1]);
      }
    }
  }
  const invalid = [];
  let checked = 0;
  for (const dataset of datasets) {
    const file = path.join(root, dataset);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith('#') || !TYPE_RE.test(lines[i])) continue;
      let j = i + 1;
      while (j < lines.length && (lines[j].trim() === '' || lines[j].trimStart().startsWith('#'))) j++;
      const vm = j < lines.length ? VALUE_RE.exec(lines[j]) : null;
      if (!vm) {
        invalid.push({ dataset, line: i + 1, value: '', error: 'no value: line after type' });
        continue;
      }
      checked++;
      const decoded = decode(vm[1]);
      if (decoded.error) {
        invalid.push({ dataset, line: j + 1, value: vm[1].trim(), error: decoded.error });
        continue;
      }
      try {
        new RegExp(decoded.value);
      } catch (err) {
        invalid.push({ dataset, line: j + 1, value: decoded.value, error: err.message });
      }
    }
  }
  return { ok: invalid.length === 0, configs: CONFIGS.length, datasets: datasets.length, checked, invalid };
}

// Negative self-test: build a temp tree with an inline-flag regex and not-regex, outside tests/promptfoo,
// and scan it with the real scanRegex.
function probeInvalid() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dataset-regex-invalid-'));
  try {
    const files = {
      'promptfooconfig.yaml': ['tests:', '  - file://datasets/a.yaml', ''],
      'promptfooconfig-headless.yaml': ['tests:', '  - file://datasets/b.yaml', ''],
      'datasets/a.yaml': ['- assert:', '    - type: regex', "      value: '(?i)bad'",
        '    - type: regex', "      value: 'it''s ok'", ''],
      'datasets/b.yaml': ['- assert:', '    - type: not-regex', '      value: "(?s)x.*y"',
        '    - type: not-regex', '      value: "x\\\\.y"', '    - type: regex', '      value:', ''],
    };
    for (const [name, lines] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, lines.join('\n'));
    }
    return scanRegex(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { decode, scanRegex };

if (require.main === module) try {
  if (process.argv.includes('--probe-invalid')) {
    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
    process.stdout.write(JSON.stringify(probeInvalid()) + '\n');
  } else {
    const result = scanRegex(PROMPTFOO_DIR);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
