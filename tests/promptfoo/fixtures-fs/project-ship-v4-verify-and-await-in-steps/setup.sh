#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
mkdir -p .sdlc
cat > .sdlc/local.json <<'JSON'
{
  "schemaVersion": 4,
  "ship": {
    "steps": ["execute", "commit", "review", "version", "pr", "verify-pipeline", "await-remote-review"]
  }
}
JSON
git add -f .sdlc/.gitignore
git commit -q -m "init"
