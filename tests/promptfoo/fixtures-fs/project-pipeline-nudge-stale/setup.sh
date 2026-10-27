#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git checkout -B main -q 2>/dev/null || true
git commit --allow-empty -q -m "init"
# Set mtime to 25 hours ago (well beyond the 24h stale threshold)
node -e "
const fs = require('fs');
const p = '.sdlc/execution/.pipeline-nudge-main.json';
const staleMs = Date.now() - (25 * 60 * 60 * 1000);
const staleDate = new Date(staleMs);
fs.utimesSync(p, staleDate, staleDate);
"
