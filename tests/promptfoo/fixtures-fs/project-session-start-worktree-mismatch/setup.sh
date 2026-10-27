#!/bin/bash
# Fixture for session-start-exec.yaml — Task 10 / F-session-start-worktree-banner-scoping.
# Ship + execute state whose recorded "worktree" field points at a real SIBLING
# worktree (checked out on a different branch, living inside this fixture root)
# rather than the active worktree. sameWorktree() must resolve false and both
# banners must be suppressed.
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

git checkout -q -b feat/worktree-mismatch

# A real, on-disk linked worktree checked out on a different branch.
git worktree add --quiet other-wt -b feat/other-wt-branch
OTHER="$(cd other-wt && pwd)"

mkdir -p .sdlc/execution

cat > .sdlc/execution/ship-feat-worktree-mismatch-20260516T100000Z.json <<EOF
{
  "version": 1,
  "skill": "ship-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-mismatch",
  "worktree": "$OTHER",
  "steps": [
    { "name": "execute", "status": "in_progress" },
    { "name": "commit",  "status": "pending" }
  ]
}
EOF

cat > .sdlc/execution/execute-feat-worktree-mismatch-20260516T100000Z.json <<EOF
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-mismatch",
  "planPath": null,
  "planHash": null,
  "quality": "balanced",
  "totalTasks": 4,
  "worktree": "$OTHER",
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] },
    { "number": 2, "status": "in_progress", "tasks": [] }
  ],
  "context": {}
}
EOF
