#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
cat > transcript.jsonl <<'JSONL'
{"type":"user","message":{"role":"user","content":"Plan the feature"}}
{"type":"system","message":{"role":"system","content":"Plan mode is active. You MUST NOT make any edits."}}
JSONL
