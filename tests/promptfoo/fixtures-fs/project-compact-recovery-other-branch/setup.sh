#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git checkout -B main -q 2>/dev/null || true
git commit --allow-empty -q -m "init"
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
node -e "
const fs=require('fs');
const p='.sdlc/execution/.compact-recovery-otherbranch.json';
const o=JSON.parse(fs.readFileSync(p,'utf8'));
o.savedAt='$NOW';
fs.writeFileSync(p,JSON.stringify(o,null,2));
"
