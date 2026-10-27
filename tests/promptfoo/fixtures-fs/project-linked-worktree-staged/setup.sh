#!/bin/bash
# Fixture: main worktree + linked worktree with a staged file in the linked worktree.
# Re-runnable: every git/staged state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# Initial commit on main so HEAD has a base.
echo "base" > base.txt
git add base.txt .sdlc
git commit -q -m "init"

# Create a feature branch and a linked worktree at ./worktrees/wt1 pointing to it.
rm -rf worktrees
git worktree add -q -b feature/cwd-test worktrees/wt1 >/dev/null

# Stage a file INSIDE the linked worktree only — main worktree index stays empty.
echo "linked content" > worktrees/wt1/linked-file.txt
git -C worktrees/wt1 add linked-file.txt
