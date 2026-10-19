#!/bin/bash
set -e
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
