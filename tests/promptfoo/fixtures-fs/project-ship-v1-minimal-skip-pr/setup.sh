#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
mkdir -p .sdlc
cat > .sdlc/local.json <<'EOF'
{
  "ship": {
    "preset": "minimal",
    "skip": ["pr"]
  }
}
EOF
echo '*' > .sdlc/.gitignore
git add -f .sdlc/.gitignore
git commit -q -m "init"
