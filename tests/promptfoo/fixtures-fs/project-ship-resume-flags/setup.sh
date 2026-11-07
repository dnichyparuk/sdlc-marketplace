#!/bin/bash
# Fixture: git repo on `main` with an unfinished ship ledger whose flags hold auto: true,
# bump: "patch", quality: "full" (#9228). --resume must rewrite the non-frozen flags from the
# run's merged values and leave planFile, openspecContext, steps and tasks to their own rules.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

printf '# A\n\n### Task 1: A\n' > plan-a.md
echo '{"name":"fixture-ship-resume-flags","version":"1.0.0"}' > package.json
git add -A
git commit -q -m "chore: init"

mkdir -p .sdlc/execution
cat > .sdlc/execution/ship-main-20261027T120000Z.json <<EOF
{
  "version": 1,
  "startedAt": "2026-10-27T12:00:00.000Z",
  "branch": "main",
  "flags": {
    "planFile": "$PWD/plan-a.md",
    "openspecContext": null,
    "sources": { "auto": "cli", "bump": "cli", "quality": "cli", "steps": "cli" },
    "steps": ["execute", "commit", "review", "version"],
    "tasks": "3,4",
    "auto": true,
    "bump": "patch",
    "quality": "full"
  },
  "steps": [
    { "name": "execute", "status": "pending" },
    { "name": "commit", "status": "pending" },
    { "name": "review", "status": "pending" },
    { "name": "version", "status": "pending" }
  ]
}
EOF
