#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
mkdir -p .sdlc/execution
cat > .sdlc/execution/plan-test-branch-20260101T000000Z.json <<'JSON'
{
  "planIntegrity": {
    "skillInvoked": "2026-01-01T00:00:00.000Z"
  },
  "planFilePath": null
}
JSON
