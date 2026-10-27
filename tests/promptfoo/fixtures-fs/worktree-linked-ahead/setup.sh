#!/bin/bash
# Fixture: main worktree (HEAD = "init", tagged v1.0.0) + linked worktree
# `worktrees/wt1` that is exactly one conventional commit ahead of `main` and
# untagged. From wt1, HEAD-relative git ops (diffs, main..HEAD, --points-at
# HEAD) differ from the main worktree's.
# Re-runnable: every git/worktree state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# Initial commit on main: package.json (version 1.0.0), base.txt, and .sdlc/*.
# Tag it v1.0.0 so the main worktree's HEAD carries the tag.
git add package.json base.txt .sdlc
git commit -q -m "init"
git tag v1.0.0

# Create a feature branch and a linked worktree at ./worktrees/wt1 pointing to it.
rm -rf worktrees
git worktree add -q -b feature/cwd-test worktrees/wt1 >/dev/null

# Advance wt1 by exactly one conventional commit — untagged, one commit ahead of main.
echo "linked content" > worktrees/wt1/linked-file.txt
git -C worktrees/wt1 add linked-file.txt
git -C worktrees/wt1 commit -q -m "feat: linked worktree change"
