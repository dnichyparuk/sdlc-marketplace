#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Clean project for setup-sdlc --only pr-labels sub-flow tests.
# Pre-existing pr.titlePattern is intentionally present so that writing
# pr.labels does not clobber siblings (sub-flow gotcha #1).
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "init"
