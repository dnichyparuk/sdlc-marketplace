#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git remote add origin git@github.com:rnagrodzki/sdlc-marketplace.git
echo "code" > app.js
git add -A
git commit -q -m "init"
git checkout -q -b feat/test
echo "feature" > feature.js
git add feature.js
git commit -q -m "feat: add feature"
