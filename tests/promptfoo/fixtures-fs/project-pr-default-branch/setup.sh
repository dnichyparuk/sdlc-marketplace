#!/bin/bash
# Fixture for pr-prepare-exec.yaml — issue #339 config.pr.defaultBranch test.
# Sets up a git repo on a feature branch. The .sdlc/config.json ships with
# pr.defaultBranch set to a branch that doesn't exist on any remote, so
# pr.js should emit an error naming the config path.
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
# No remote — origin/<branch> checks will fail for any branch name.
