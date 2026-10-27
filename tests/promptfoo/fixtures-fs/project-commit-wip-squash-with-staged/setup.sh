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

git checkout -q -b feat/wip-squash-staged

echo "wave1-file" > wave1.txt
git add wave1.txt
git commit -q -m "wip(execute): wave 1 — add wave1.txt"

# User hand-edits a new file on top, leaves it staged.
echo "hand-edit" > extra.txt
git add extra.txt
