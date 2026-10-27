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

git checkout -q -b feat/execute-and-ship

mkdir -p .sdlc/execution

# Execute state
cat > .sdlc/execution/execute-feat-execute-and-ship-20260516T100000Z.json <<'EOF'
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/execute-and-ship",
  "planPath": null,
  "planHash": null,
  "quality": "balanced",
  "totalTasks": 4,
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] },
    { "number": 2, "status": "in_progress", "tasks": [] }
  ],
  "context": {}
}
EOF

# Ship state — ship-sdlc owns the active pipeline.
cat > .sdlc/execution/ship-feat-execute-and-ship-20260516T100000Z.json <<'EOF'
{
  "version": 1,
  "skill": "ship-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/execute-and-ship",
  "steps": [
    { "name": "execute",  "status": "in_progress" },
    { "name": "commit",   "status": "pending" },
    { "name": "pr",       "status": "pending" }
  ]
}
EOF
