#!/bin/bash
# Fixture for session-start-exec.yaml — Task 10 / F-session-start-worktree-banner-scoping.
# Ship + execute state whose "worktree" field points at a path that does not
# exist on disk, so fs.realpathSync() throws inside sameWorktree(). Must fail
# OPEN — banners still shown — never silently hide active pipeline state on a
# resolution error.
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

git checkout -q -b feat/worktree-resolve-error

mkdir -p .sdlc/execution

cat > .sdlc/execution/ship-feat-worktree-resolve-error-20260516T100000Z.json <<'EOF'
{
  "version": 1,
  "skill": "ship-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-resolve-error",
  "worktree": "/nonexistent-sdlc-worktree-path-xyz123",
  "steps": [
    { "name": "execute", "status": "in_progress" },
    { "name": "commit",  "status": "pending" }
  ]
}
EOF

cat > .sdlc/execution/execute-feat-worktree-resolve-error-20260516T100000Z.json <<'EOF'
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-05-16T10:00:00Z",
  "branch": "feat/worktree-resolve-error",
  "planPath": null,
  "planHash": null,
  "quality": "balanced",
  "totalTasks": 4,
  "worktree": "/nonexistent-sdlc-worktree-path-xyz123",
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] },
    { "number": 2, "status": "in_progress", "tasks": [] }
  ],
  "context": {}
}
EOF
