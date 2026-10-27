#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Fixture: project with a stubbed git remote for access-probe tests.
# The remote URL is a placeholder — parseRemoteOwner must return a non-null
# result so the probe is invoked at all. The actual network call is bypassed
# by the SDLC_PROBE_REPO_ACCESS env var set in each test case.
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git remote add origin git@github.com:example-org/example-repo.git
git add -A
git commit -q -m "init"
git checkout -q -b feat/test
echo "feature code" > feature.js
git add feature.js
git commit -q -m "feat: add feature"
