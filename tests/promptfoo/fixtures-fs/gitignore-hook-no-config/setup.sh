#!/bin/bash
# Fixture for ensure-worktree-gitignore hook — no workspace.worktree config.
# Hook should be a no-op: no .gitignore written or modified.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# No .sdlc/local.json — hook must exit 0 without touching .gitignore
