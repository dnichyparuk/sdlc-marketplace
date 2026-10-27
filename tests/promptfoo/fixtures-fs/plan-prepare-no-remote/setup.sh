#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Fixture for plan-prepare-exec.yaml — T3c: no origin → githubHosting.detected = false, host = null
git init -q
git config user.email "test@test.com"
git config user.name "Test"
echo "init" > README.md
git add -A
git commit -q -m "init"
