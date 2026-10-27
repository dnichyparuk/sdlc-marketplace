#!/bin/bash
# Fixture for pr-prepare-exec.yaml — invalid pr.defaultBranch shell-metacharacter
# rejection test. The config field contains shell metacharacters, so pr.js must
# reject the value via the branch-name validator BEFORE any shell interpolation
# reaches `git rev-parse`.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add .
git commit --quiet -m "init"
git checkout -q -b feat/my-feature
echo "feature" > feature.js
git add feature.js
git commit --quiet -m "feat: add feature"
