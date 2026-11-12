#!/bin/bash
# Fixture: git repo in the repo/ subdirectory, so state/ sits outside the
# worktree (but inside the temp copy). Used by pr-prepare-testing case (f).
#
# Re-runnable: every git state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

mkdir -p repo && cd repo
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

echo "# Fixture" > README.md
git add -A
git commit -q -m "init: readme on main"

git checkout -q -b feat/state-dir
echo "change" > change.txt
git add -A
git commit -q -m "feat: add change on feat/state-dir"
