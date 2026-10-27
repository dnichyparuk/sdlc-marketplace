#!/bin/bash
# Fixture for worktree-doctor-exec.yaml — clean fixture with one linked worktree.
# Layout: inside (default). Gitignore includes .claude/worktrees/.
# No orphan branches.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create .claude/worktrees/ and gitignore it
mkdir -p .claude/worktrees
cat >> .gitignore << 'EOF'
.claude/worktrees/
EOF
git add .gitignore
git commit --quiet -m "add gitignore"

# Create a linked worktree under .claude/worktrees/
git worktree add --quiet .claude/worktrees/feat-login -b feat/login 2>/dev/null || \
  git worktree add --quiet .claude/worktrees/feat-login -b feat-login
