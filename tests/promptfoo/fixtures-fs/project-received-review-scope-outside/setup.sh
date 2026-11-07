#!/bin/bash
# Fixture: a git repo with plan.md + review-comment.md committed, then one change to
# a plan Files path (src/a.js) and one untracked file outside the plan (x.js).
# Used by the rr-scope: cases of received-review-prepare-exec.yaml (R30).
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

# One allowed change, one outside change.
echo "// guarded" >> src/a.js
echo "module.exports = 1;" > x.js
