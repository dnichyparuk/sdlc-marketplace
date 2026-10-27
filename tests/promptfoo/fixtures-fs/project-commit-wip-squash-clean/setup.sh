#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# Base commit on main (the fork-point for the feature branch)
echo "base" > base.txt
git add base.txt
git commit -q -m "chore: initial"

# Feature branch with two wip(execute): commits, no staged changes on top
git checkout -q -b feat/wip-squash

echo "wave1-file" > wave1.txt
git add wave1.txt
git commit -q -m "wip(execute): wave 1 — add wave1.txt"

echo "wave2-file" > wave2.txt
git add wave2.txt
git commit -q -m "wip(execute): wave 2 — add wave2.txt"

# Stage nothing; index is clean.
