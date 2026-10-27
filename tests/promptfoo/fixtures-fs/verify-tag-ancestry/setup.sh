#!/bin/bash
# Fixture for verify-tag-ancestry-exec.yaml — multi-branch git history.
# Creates:
#   main:        A -- B (v1.0.0) -- C (v1.0.1)
#   feat/branch: A -- B -- D (v1.0.2-feature) [branch diverges from B]
#   orphan:      E (v1.0.3-orphan) [independent root — not reachable from main or feat/branch]
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"

# Commit A
echo "init" > README.md
git add README.md
git commit -q -m "chore: init"

# Commit B — tag v1.0.0 on main
echo "v1" > version.txt
git add version.txt
git commit -q -m "feat: first release"
git tag v1.0.0

# Commit C — tag v1.0.1 on main (stays on main)
echo "v1.0.1" > version.txt
git add version.txt
git commit -q -m "fix: patch on main"
git tag v1.0.1

# Create feat/branch from v1.0.0 (commit B)
git checkout -q v1.0.0
git checkout -q -b feat/branch

# Commit D — tag v1.0.2-feature on feat/branch
echo "feature" > feature.txt
git add feature.txt
git commit -q -m "feat: feature work"
git tag v1.0.2-feature

# Create orphan branch with an unrelated commit E
git checkout -q --orphan orphan
git rm -qrf . 2>/dev/null || true
echo "orphan" > orphan.txt
git add orphan.txt
git commit -q -m "orphan: independent root"
git tag v1.0.3-orphan

# Return to main
git checkout -q main
