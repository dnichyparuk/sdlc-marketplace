#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');

// Marker-file guard: confirm REPO_ROOT resolved to the repository root.
const MARKER = path.join(REPO_ROOT, 'CLAUDE.md');
if (!fs.existsSync(MARKER)) {
  process.stderr.write(`Script error: REPO_ROOT marker not found at ${MARKER} — script may have moved\n`);
  process.exit(2);
}

// No agent or skill prompt may instruct a bypassPermissions dispatch: subagents inherit the session's permission mode.
const ROOTS = ['plugins/sdlc-utilities/agents', 'plugins/sdlc-utilities/skills'];
const NEEDLE = 'bypassPermissions';

function listMarkdown(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

const hits = [];
try {
  for (const root of ROOTS) {
    for (const file of listMarkdown(path.join(REPO_ROOT, root)).sort()) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, i) => {
        if (text.includes(NEEDLE)) {
          hits.push({ file: path.relative(REPO_ROOT, file).split(path.sep).join('/'), line: i + 1 });
        }
      });
    }
  }
} catch (err) {
  process.stderr.write(`Script error scanning ${ROOTS.join(', ')}: ${err.message}\n`);
  process.exit(2);
}

const ok = hits.length === 0;
process.stdout.write(JSON.stringify({ ok, hits }) + '\n');
if (!ok) {
  process.exit(1);
}
