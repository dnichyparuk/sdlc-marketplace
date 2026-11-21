#!/bin/bash
# Fixture: main checkout + linked worktree whose local.json and review dimensions differ from the main checkout's.
# Re-runnable: every git/config/staged state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p .sdlc
echo '{"version":4}' > .sdlc/config.json
echo "base" > base.txt
git add base.txt .sdlc
git commit -q -m "init"

# Main checkout local.json (untracked, written after the commit).
echo '{"receivedReview":{"alwaysFixSeverities":["low"]}}' > .sdlc/local.json

rm -rf worktrees
git worktree add -q -b feature/rr-roots worktrees/wt1 >/dev/null

# Worktree-only local.json and review dimension.
echo '{"receivedReview":{"alwaysFixSeverities":["critical"]}}' > worktrees/wt1/.sdlc/local.json
mkdir -p worktrees/wt1/.sdlc/review-dimensions
echo "# wtonlydim" > worktrees/wt1/.sdlc/review-dimensions/wtonlydim.md

cat > worktrees/wt1/review-comment.md <<'EOF'
## Code Review — 1 dimension(s), 1 finding(s)

### wtonlydim — 1 finding(s)

<details>
<summary>wtonlydim</summary>

#### [HIGH] Rule gap

**File:** `src/a.js:3`

The wtonlydim rule is not met.

</details>

---
EOF
