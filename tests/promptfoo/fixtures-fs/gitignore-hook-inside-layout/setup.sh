#!/bin/bash
# Fixture for ensure-worktree-gitignore hook — inside layout with ensureGitignore:true.
# Hook should add .claude/worktrees/ to root .gitignore managed block.
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
