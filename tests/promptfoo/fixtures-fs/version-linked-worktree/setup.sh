#!/bin/bash
# Fixture: main worktree (version 1.0.0, MAIN-CHANGELOG-MARKER, tagged v1.0.0) +
# linked worktree `worktrees/wt1` whose package.json is 1.1.0 and whose
# CHANGELOG.md carries WT1-CHANGELOG-MARKER, plus one uncommitted change in wt1.
# Only a read from the active (wt1) root can see wt1's version and changelog.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

git add package.json CHANGELOG.md .sdlc
git commit -q -m "init"
git tag v1.0.0

rm -rf worktrees
git worktree add -q -b feature/rel worktrees/wt1 >/dev/null

cat > worktrees/wt1/package.json <<'EOF'
{
  "name": "fixture-version-linked-worktree",
  "version": "1.1.0"
}
EOF
printf '# Changelog\n\nWT1-CHANGELOG-MARKER\n' > worktrees/wt1/CHANGELOG.md
git -C worktrees/wt1 add package.json CHANGELOG.md
git -C worktrees/wt1 commit -q -m "feat: wt1 release prep"

# Uncommitted change in wt1.
echo "uncommitted line" >> worktrees/wt1/CHANGELOG.md
