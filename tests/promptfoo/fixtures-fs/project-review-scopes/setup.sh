#!/bin/bash
# Fixture: three change kinds kept apart so each review scope lists distinct files.
#   committed.txt  committed on feature/scopes (vs main)
#   staged.txt     tracked on main, modified and staged
#   unstaged.txt   tracked on main, modified and not staged
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p .sdlc/review-dimensions
cat > .sdlc/config.json <<'EOF'
{
  "schemaVersion": 4,
  "version": {
    "mode": "file",
    "versionFile": "package.json",
    "fileType": "package.json",
    "tagPrefix": "v"
  }
}
EOF
cat > .sdlc/review-dimensions/text-review.md <<'EOF'
---
name: text-review
description: Review plain-text content changes for clarity and correctness.
severity: medium
triggers:
  - "**/*.txt"
---

# Text Review

Check plain-text file changes for clarity, correctness, and completeness.
EOF
echo '{"name":"fixture-review-scopes","version":"1.0.0"}' > package.json
echo "staged base" > staged.txt
echo "unstaged base" > unstaged.txt
git add .
git commit -q -m "init"

git checkout -q -b feature/scopes
echo "committed" > committed.txt
git add committed.txt
git commit -q -m "feat: committed change"

echo "staged change" >> staged.txt
git add staged.txt
echo "unstaged change" >> unstaged.txt
