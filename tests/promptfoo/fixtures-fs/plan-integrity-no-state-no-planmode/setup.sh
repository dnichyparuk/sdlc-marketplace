#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
cat > transcript.jsonl <<'JSONL'
{"type":"user","message":{"role":"user","content":"Hello"}}
{"type":"assistant","message":{"role":"assistant","content":"Hi, how can I help?"}}
JSONL
