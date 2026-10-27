#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false
git checkout -q -b feat/test-plan-mode
git add -A
git commit -q -m "chore: initial commit"
git remote add origin "https://github.com/example/test-repo.git"
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
