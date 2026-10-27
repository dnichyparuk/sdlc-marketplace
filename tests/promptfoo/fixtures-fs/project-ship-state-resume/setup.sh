#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
# Initial commit on default branch
git add -A
git commit -q -m "chore: init"
# Use 'main' as the working branch (matches state file slug below).
git branch -M main
# Touch the state file so its mtime is "now" — detectResumeState() requires
# fresh === true (within COMPACT_RECOVERY_TTL_MS = 1h) for implicit resume.
touch .sdlc/execution/ship-main-20260101T000000Z.json
