#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
cat > transcript.jsonl <<'JSONL'
{"type":"user","message":{"role":"user","content":"Hello"}}
{"type":"assistant","message":{"role":"assistant","content":"Hi, how can I help?"}}
JSONL
