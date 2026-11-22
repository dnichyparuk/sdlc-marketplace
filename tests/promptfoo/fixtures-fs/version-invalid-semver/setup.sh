#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
# File-mode config and a package.json version that is not semver on purpose: version.js must reject '1.2'.
mkdir -p .sdlc
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
cat > package.json <<'EOF'
{
  "name": "invalid-semver-fixture",
  "version": "1.2"
}
EOF
git add -A
git commit -q -m "chore: init"
