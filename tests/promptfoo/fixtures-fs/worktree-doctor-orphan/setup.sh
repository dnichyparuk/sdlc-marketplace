#!/bin/bash
# Fixture for worktree-doctor-exec.yaml — orphan worktree (branch deleted but worktree remains).
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create linked worktree
mkdir -p .claude/worktrees
git worktree add --quiet .claude/worktrees/feat-orphan -b feat/orphan 2>/dev/null || \
  git worktree add --quiet .claude/worktrees/feat-orphan -b feat-orphan

# Now delete the branch to simulate orphan (worktree still references the branch)
# git worktree list will show the branch but git rev-parse won't find the ref after delete
# We need to force-remove the branch while worktree is checked out
# Actually: we prune the worktree ref to simulate a detached/orphaned state
git branch -D feat/orphan 2>/dev/null || git branch -D feat-orphan 2>/dev/null || true
