#!/bin/bash
# Fixture for worktree-doctor-exec.yaml — stale local config in linked cwd.
# Plants a .sdlc/local.json in the linked worktree's directory that differs
# from the main worktree's .sdlc/local.json.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create main .sdlc/local.json
mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "workspace": { "worktree": { "layout": "inside" } }
}
EOF

# Create linked worktree
mkdir -p .claude/worktrees
git worktree add --quiet .claude/worktrees/feat-stale -b feat/stale 2>/dev/null || \
  git worktree add --quiet .claude/worktrees/feat-stale -b feat-stale

# Plant a different .sdlc/local.json inside the linked worktree cwd
mkdir -p .claude/worktrees/feat-stale/.sdlc
cat > .claude/worktrees/feat-stale/.sdlc/local.json << 'EOF'
{
  "workspace": { "worktree": { "layout": "sibling" } }
}
EOF
