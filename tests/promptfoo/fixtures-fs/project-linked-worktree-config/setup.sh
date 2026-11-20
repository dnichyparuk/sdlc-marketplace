#!/bin/bash
# Fixture: main worktree + linked worktree whose .sdlc/config.json differs from the main checkout's.
# Re-runnable: every git/config/staged state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# Main checkout config, committed so the linked worktree inherits the tracked file.
mkdir -p .sdlc
cat > .sdlc/config.json <<'EOF'
{
  "version": 4,
  "commit": { "subjectPattern": "^main: .+$" }
}
EOF
echo "base" > base.txt
git add base.txt .sdlc
git commit -q -m "init"

# Create a feature branch and a linked worktree at ./worktrees/wt1 pointing to it.
rm -rf worktrees
git worktree add -q -b feature/config-test worktrees/wt1 >/dev/null

# The worktree's own (per-branch) config overrides the pattern.
cat > worktrees/wt1/.sdlc/config.json <<'EOF'
{
  "version": 4,
  "commit": { "subjectPattern": "^wt: .+$" }
}
EOF

# Stage a file INSIDE the linked worktree only.
echo "linked content" > worktrees/wt1/linked-file.txt
git -C worktrees/wt1 add linked-file.txt
