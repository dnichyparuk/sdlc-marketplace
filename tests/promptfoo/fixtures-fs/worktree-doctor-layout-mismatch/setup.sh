#!/bin/bash
# Fixture for worktree-doctor-exec.yaml — layout-switch migration hints (issue #351 T14).
# Creates inside-layout worktree, then switches config to sibling → layout mismatch.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create worktree at inside-layout path (.claude/worktrees/feat-x)
mkdir -p .claude/worktrees
git worktree add --quiet .claude/worktrees/feat-x -b feat/x 2>/dev/null || \
  git worktree add --quiet .claude/worktrees/feat-x -b feat-x

# Configure sibling layout — now .claude/worktrees/feat-x is a layout mismatch
mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "workspace": { "worktree": { "layout": "sibling" } }
}
EOF
