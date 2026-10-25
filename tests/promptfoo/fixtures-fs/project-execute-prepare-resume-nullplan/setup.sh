#!/bin/bash
set -e
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

echo "readme" > README.md
git add README.md
git commit -q -m "chore: initial"

git checkout -q -b feat/resume

mkdir -p .sdlc/execution

cat > .sdlc/execution/execute-feat-resume-20260101T000000Z.json <<'EOF'
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-01-01T00:00:00Z",
  "branch": "feat/resume",
  "planPath": null,
  "planHash": null,
  "quality": "minimal",
  "totalTasks": 4,
  "plannedTaskIds": ["1", "2", "3", "4"],
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] }
  ],
  "context": {}
}
EOF
