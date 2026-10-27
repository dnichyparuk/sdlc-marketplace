#!/bin/bash
# Legacy v1 ship config — has preset/skip but no top-level version field.
# Used by tests verifying detection (setup-prepare.localIsV1) and the v1→v2
# migration in lib/config.js::readLocalConfig.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
mkdir -p .sdlc
cat > .sdlc/local.json <<'EOF'
{
  "$schema": "https://raw.githubusercontent.com/rnagrodzki/sdlc-marketplace/main/schemas/sdlc-local.schema.json",
  "ship": {
    "preset": "balanced",
    "skip": [],
    "bump": "patch"
  }
}
EOF
git add .
git commit -q -m "init"
