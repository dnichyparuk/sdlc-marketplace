#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false
git checkout -B main -q 2>/dev/null || git branch -m main
git add -A
git commit -q -m "chore: initial commit"

# Create a controlled fake-tmpdir to hold sdlc-explore-* directories
mkdir -p fake-tmpdir

# Stale tempdir for a dead branch (slug: dead-branch)
mkdir -p fake-tmpdir/sdlc-explore-dead-branch-abc123
touch -t 202401010000 fake-tmpdir/sdlc-explore-dead-branch-abc123

# Fresh tempdir for a live branch (slug: main)
mkdir -p fake-tmpdir/sdlc-explore-main-xyz789
