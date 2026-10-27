#!/bin/bash
# Fixture for session-start-exec.yaml — Task 10 / F-session-start-worktree-banner-scoping.
# Ship + execute state whose recorded "worktree" field equals the active worktree
# (this fixture root). sameWorktree() must resolve true and both banners must
# render exactly as they would with no "worktree" field at all.
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

git checkout -q -b feat/worktree-match

mkdir -p .sdlc/execution
SELF="$(pwd)"

cat > .sdlc/execution/ship-feat-worktree-match-20260516T100000Z.json <<EOF
{
  "version": 1,
  "skill": "ship-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-match",
  "worktree": "$SELF",
  "steps": [
    { "name": "execute", "status": "in_progress" },
    { "name": "commit",  "status": "pending" }
  ]
}
EOF

cat > .sdlc/execution/execute-feat-worktree-match-20260516T100000Z.json <<EOF
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-match",
  "planPath": null,
  "planHash": null,
  "quality": "balanced",
  "totalTasks": 4,
  "worktree": "$SELF",
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] },
    { "number": 2, "status": "in_progress", "tasks": [] }
  ],
  "context": {}
}
EOF
