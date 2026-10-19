#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false
git checkout -q -b feat/test-plan-mode
git add -A
git commit -q -m "chore: initial commit"
git remote add origin "https://github.com/example/test-repo.git"
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main

# Stop-hook cap-exhaustion sidecar for the branch (slug feat-test-plan-mode):
# prepare must surface it as a warning and resume.capExhausted.
cat > .sdlc/execution/.stop-cap-exhausted-feat-test-plan-mode.json <<'JSON'
{"stepName":"execute","count":3,"at":"2026-01-01T00:00:00.000Z"}
JSON
