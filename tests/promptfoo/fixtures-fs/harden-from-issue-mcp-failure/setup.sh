#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Minimal git-init for a project fixture used by harden-prepare-exec.yaml R19
# tests. harden-prepare.js inspects git state, so the fixture must be a valid
# git repo. The bin/gh stub returns a deterministic `gh issue view` payload
# carrying the `mcp-failure` label.
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "init"
