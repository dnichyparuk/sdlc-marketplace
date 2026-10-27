#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
cat > transcript.jsonl <<'JSONL'
{"type":"user","message":{"role":"user","content":"Plan the feature"}}
{"type":"system","message":{"role":"system","content":"Plan mode is active. You MUST NOT make any edits."}}
JSONL
