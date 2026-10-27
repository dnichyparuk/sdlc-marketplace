#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
mkdir -p .sdlc/execution
cat > .sdlc/execution/plan-test-branch-20260101T000000Z.json <<'JSON'
{
  "planIntegrity": {
    "skillInvoked": "2026-01-01T00:00:00.000Z",
    "planFile": "2026-01-01T00:00:01.000Z",
    "guardrailsEvaluated": "2026-01-01T00:00:02.000Z",
    "critiqueRan": "2026-01-01T00:00:03.000Z"
  },
  "planFilePath": "/nonexistent/plan.md"
}
JSON
cat > plan.md <<'MD'
# Test Plan

Some content.
MD
