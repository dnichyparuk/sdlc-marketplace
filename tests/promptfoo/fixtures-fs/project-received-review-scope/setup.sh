#!/bin/bash
# Fixture: a git repo with plan.md + review-comment.md committed, then changes ONLY
# to plan Files paths (one tracked edit, one untracked new file). Used by the
# rr-scope: cases of received-review-prepare-exec.yaml (R28-R30).
set -e
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p src
echo "module.exports = (x) => x.y;" > src/a.js
echo "const v = 1;" > src/b.js
git add -A
git commit -q -m "chore: initial"

# In-scope changes: a tracked allowed path and an untracked allowed path.
echo "// guarded" >> src/a.js
mkdir -p docs
echo "# Guard" > docs/a.md
