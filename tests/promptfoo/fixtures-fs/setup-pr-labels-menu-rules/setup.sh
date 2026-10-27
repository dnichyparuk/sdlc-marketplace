#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Project with pr.labels.mode=rules and one rule — section-menu summary
# should render `[set]` and `rules: 1 rule` (issue #205 regression guard).
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "init"
