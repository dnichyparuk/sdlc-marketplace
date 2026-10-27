#!/bin/bash
# Fixture for ensure-worktree-gitignore hook — idempotency test.
# Pre-seeds .gitignore with the v3 managed block already containing .claude/worktrees/.
# Running the hook must produce exactly one .claude/worktrees/ entry (no duplicates).
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Configure workspace.worktree with inside layout
mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "workspace": { "worktree": { "layout": "inside" } }
}
EOF

# Pre-seed .gitignore with the v3 managed block (simulates hook already ran once)
# The hook must recognize this block and not add a duplicate entry.
cat > .gitignore << 'EOF'
node_modules/
# >>> sdlc-utilities managed v3 (do not edit) — transient skill artifacts
*-context-*.json
*-manifest-*.json
*-prepare-*.json
.claude/worktrees/
# <<< sdlc-utilities managed
EOF
