#!/bin/bash
# Fixture for git-lib-exec.yaml — issue #364 reverse-merge test.
# Builds a repo where `main` advanced after the feature branch forked, so that
# two-dot (`main..HEAD`) reports zero base-only files but three-dot (`main...HEAD`)
# correctly limits the diff to branch-contributed files only.
#
# History after setup (HEAD = feature):
#
#   * (main)    add base-only.js          <- after fork
#   |
#   | * (HEAD, feature) add feature.js
#   |/
#   * init seed.txt                       <- merge-base
#
# Expected behavior:
#   getChangedFiles('main', repo, 'all')       -> ['feature.js']           (three-dot, post-fix)
#   getChangedFiles('main', repo, 'committed') -> ['feature.js']           (three-dot, baseline)
#   Pre-fix 'all' would emit `git diff --cached --name-only main`, which is
#   wrong-direction (compares index to main) and leaks `base-only.js` because
#   it is present on `main` but not in feature's index.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"

# Common ancestor — merge-base for both branches.
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

# Create feature branch off the seed commit; add feature.js.
git checkout --quiet -b feature
echo "feature" > feature.js
git add feature.js
git commit --quiet -m "feat: add feature.js"

# Switch back to main and advance it with base-only.js (the reverse-merge scenario).
git checkout --quiet main
echo "base-only" > base-only.js
git add base-only.js
git commit --quiet -m "chore: add base-only.js on main"

# Leave HEAD on feature so getChangedFiles sees the branch-contribution diff.
git checkout --quiet feature
