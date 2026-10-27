#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
# Stay on the default initial branch (main) so cmdInit's pruneStateFiles
# matches ship-main-*.json.
git checkout -B main -q 2>/dev/null || git branch -m main
git add -A
git commit -q -m "init"
