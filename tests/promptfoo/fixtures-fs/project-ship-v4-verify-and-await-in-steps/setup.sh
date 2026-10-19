#!/bin/bash
set -e
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
