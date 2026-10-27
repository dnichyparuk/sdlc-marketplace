#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

echo "base" > base.txt
git add base.txt
git commit -q -m "chore: initial"

# Stage a change so commit.js sees staged files
echo "new feature" > feature.txt
git add feature.txt

# Pre-create stale commit manifests for the prune-on-write test (E5):
# Two stale files for 'main' branch slug (should be pruned)
mkdir -p .sdlc/execution
echo '{}' > .sdlc/execution/commit-main-20240101T000000Z.json
echo '{}' > .sdlc/execution/commit-main-20240102T000000Z.json
# One stale file for another branch slug (must NOT be pruned)
echo '{}' > .sdlc/execution/commit-otherbranch-20240101T000000Z.json
