#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

echo "base" > base.txt
git add base.txt
git commit -q -m "chore: initial"

git checkout -q -b feat/ship

mkdir -p .sdlc/execution

# Ship state for branch feat/ship (slug feat-ship): between-steps gap — the
# execute step is completed, commit is pending, NONE in_progress, flags.auto = true.
# Exercises the broadened R67/R68 "advance to next step" path (auto-gated).
cat > .sdlc/execution/ship-feat-ship-20260608T120000Z.json <<'EOF'
{
  "version": 1,
  "startedAt": "2026-06-08T12:00:00Z",
  "branch": "feat/ship",
  "sessionId": "sess-fixture",
  "flags": { "auto": true, "steps": ["execute", "commit", "pr"] },
  "steps": [
    { "name": "execute", "status": "completed" },
    { "name": "commit", "status": "pending" },
    { "name": "pr", "status": "pending" }
  ]
}
EOF
