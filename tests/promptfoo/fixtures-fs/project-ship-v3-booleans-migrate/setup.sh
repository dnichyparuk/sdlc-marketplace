#!/bin/bash
set -e
git init -q
git config user.email "test@test.com"
git config user.name "Test"
mkdir -p .sdlc
cat > .sdlc/local.json <<'JSON'
{
  "schemaVersion": 3,
  "ship": {
    "preset": "balanced",
    "verifyPipeline": true,
    "awaitReview": true,
    "awaitReviewers": ["gh-bot"]
  }
}
JSON
git add -f .sdlc/.gitignore
git commit -q -m "init"
