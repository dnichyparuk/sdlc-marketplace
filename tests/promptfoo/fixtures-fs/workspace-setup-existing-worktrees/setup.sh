#!/bin/bash
# Fixture: workspace section with an existing inside-layout worktree + sibling layout config.
# Used to verify that setup.js emits mismatchesByLayout.sibling containing the inside-layout
# worktree path (T11 existing-worktrees safety check).
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create a linked worktree at the inside-layout path (.claude/worktrees/feat-x)
mkdir -p .claude/worktrees
git worktree add --quiet .claude/worktrees/feat-x -b feat/x 2>/dev/null || \
  git worktree add --quiet .claude/worktrees/feat-x -b feat-x

# Config is set to sibling — so the existing inside-layout worktree is a mismatch
mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "workspace": { "worktree": { "layout": "sibling" } }
}
EOF
