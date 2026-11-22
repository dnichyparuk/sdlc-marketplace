#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
# Tag-mode config and no tags on purpose: version.js must report "No version tags found".
mkdir -p .sdlc
cat > .sdlc/config.json <<'EOF'
{
  "schemaVersion": 4,
  "version": {
    "mode": "tag",
    "tagPrefix": "v"
  }
}
EOF
git add -A
git commit -q -m "chore: init"
