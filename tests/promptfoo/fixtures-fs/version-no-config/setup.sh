#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
# No version config on purpose: version.js must report "No version config found".
echo "# no-config" > README.md
git add -A
git commit -q -m "chore: init"
git tag v1.0.0
