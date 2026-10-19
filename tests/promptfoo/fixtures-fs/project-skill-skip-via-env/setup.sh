#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit --allow-empty -q -m "init"
mkdir -p .sdlc
cat > .sdlc/config.json <<'JSON'
{
  "version": 3,
  "ship": {
    "preset": "balanced"
  }
}
JSON
