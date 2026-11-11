#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p .sdlc
cat > .sdlc/config.json <<'EOF'
{
  "schemaVersion": 4,
  "execute": {
    "specReviewer": "once"
  }
}
EOF

git add .sdlc
git commit -q -m "chore: initial"
