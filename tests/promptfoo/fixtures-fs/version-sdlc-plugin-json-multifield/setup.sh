#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "chore: init plugin manifest fixture"
git tag v0.1.0
echo "// noop" >> src/main.js
git add -A
git commit -q -m "fix: tighten input validation"
