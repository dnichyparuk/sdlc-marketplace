#!/bin/bash
# Fixture: version 1.0.0 tagged v1.0.0 with one commit after the tag, and
# commit.requiredTrailers configured. msg-ok.txt carries all trailers,
# msg-missing.txt lacks "Refs: M9-Ra".
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

git add package.json .sdlc msg-ok.txt msg-missing.txt
git commit -q -m "init"
git tag v1.0.0

echo "after tag" > after-tag.txt
git add after-tag.txt
git commit -q -m "fix: after tag"
