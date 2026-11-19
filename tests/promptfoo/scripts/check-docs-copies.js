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

// Every docs/<dir>/*.md file must be byte-identical to its copy in site/src/content-source/<dir>/.
// Threat model: accidental drift after a hand edit of one side only. Accepted gaps:
//  - only *.md files at depth 1 of each dir are compared (files below depth 1 and non-.md files are not);
//  - only the dirs in DIRS are compared (docs/plans has no copies and is not compared);
//  - a copy edited in the same way on both sides passes (it is not drift).
// --probe-drift proves that the scan reports a drifted, a missing and an extra copy, and not a matching one.
const DIRS = ['skills', 'specs'];
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');
const COPY_ROOT = path.join(REPO_ROOT, 'site/src/content-source');

function listMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name);
}

// Paths in the result are posix `<dir>/<file>`, sorted.
function scanCopies(docsRoot, copyRoot) {
  const drift = [];
  const missing = [];
  const extra = [];
  let compared = 0;
  for (const dir of DIRS) {
    const docs = listMd(path.join(docsRoot, dir));
    const copies = listMd(path.join(copyRoot, dir));
    for (const name of docs) {
      const rel = `${dir}/${name}`;
      if (!copies.includes(name)) {
        missing.push(rel);
        continue;
      }
      compared++;
      const a = fs.readFileSync(path.join(docsRoot, dir, name));
      const b = fs.readFileSync(path.join(copyRoot, dir, name));
      if (!a.equals(b)) drift.push(rel);
    }
    for (const name of copies) {
      if (!docs.includes(name)) extra.push(`${dir}/${name}`);
    }
  }
  drift.sort();
  missing.sort();
  extra.sort();
  return {
    ok: drift.length === 0 && missing.length === 0 && extra.length === 0,
    dirs: DIRS,
    compared,
    drift,
    missing,
    extra,
  };
}

// Negative self-test: build a temp tree with a matching, a drifted, a missing and an extra copy.
function probeDrift() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-copies-drift-'));
  try {
    const files = {
      'docs/skills/a.md': 'same\n',
      'docs/skills/b.md': 'bytes\n',
      'docs/skills/c.md': 'no copy\n',
      'copy/skills/a.md': 'same\n',
      'copy/skills/b.md': 'bytez\n',
      'copy/skills/d.md': 'no doc\n',
    };
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(root, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return scanCopies(path.join(root, 'docs'), path.join(root, 'copy'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

try {
  if (process.argv.includes('--probe-drift')) {
    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
    process.stdout.write(JSON.stringify(probeDrift()) + '\n');
  } else {
    const result = scanCopies(DOCS_ROOT, COPY_ROOT);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!result.ok) process.exit(1);
  }
} catch (err) {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
}
