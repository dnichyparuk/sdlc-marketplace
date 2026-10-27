#!/bin/bash
# Fixture for pre-tool-agent-isolation-guard.js — no .sdlc/local.json.
# Hook must default to enabled (block) when no config is present.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"
# No .sdlc/local.json — guard defaults to enabled
