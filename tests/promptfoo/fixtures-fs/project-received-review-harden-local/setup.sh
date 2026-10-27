#!/bin/bash
# Issue #429: receivedReview.alwaysHardenFromReview=true configured in .sdlc/local.json
# (the canonical local-only location). Used by received-review-prepare-exec tests to
# verify that the prepare script resolves flags.alwaysHardenFromReview from local config.
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
  "schemaVersion": 3,
  "receivedReview": {
    "alwaysHardenFromReview": true,
    "hardenClusterCap": 5
  }
}
EOF
cat > .sdlc/config.json <<'EOF'
{
  "$schema": "https://raw.githubusercontent.com/rnagrodzki/sdlc-marketplace/main/schemas/sdlc-config.schema.json",
  "schemaVersion": 3
}
EOF
git add .
git commit -q -m "init"
