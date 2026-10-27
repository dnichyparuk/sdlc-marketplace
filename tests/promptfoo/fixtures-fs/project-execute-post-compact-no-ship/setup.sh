#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

echo "base" > base.txt
git add base.txt
git commit -q -m "chore: initial"

git checkout -q -b feat/execute-only

# Write an execute state file that the session-start hook will pick up.
mkdir -p .sdlc/execution
cat > .sdlc/execution/execute-feat-execute-only-20260516T100000Z.json <<'EOF'
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/execute-only",
  "planPath": null,
  "planHash": null,
  "quality": "balanced",
  "totalTasks": 6,
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] },
    { "number": 2, "status": "in_progress", "tasks": [] },
    { "number": 3, "status": "pending", "tasks": [] }
  ],
  "context": {}
}
EOF
