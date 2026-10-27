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

# R73 (#505) NEGATIVE-TERM guard: the session id matches, but the state file's
# mtime is backdated to 2024. The gate carries NO freshness/TTL term by design —
# `mtime` only advances on step transitions, so a long-running `execute` step
# must not be silenced by staleness. The hooks must still enforce.
cat > .sdlc/execution/ship-feat-ship-20260608T120000Z.json <<'EOF'
{
  "version": 1,
  "startedAt": "2026-06-08T12:00:00Z",
  "branch": "feat/ship",
  "sessionId": "sess-ancient",
  "flags": { "auto": true, "steps": ["execute", "commit", "pr"] },
  "steps": [
    { "name": "execute", "status": "in_progress" },
    { "name": "commit", "status": "pending" },
    { "name": "pr", "status": "pending" }
  ]
}
EOF

# Backdate the state file's mtime (mirrors project-ship-state-stale/setup.sh).
touch -t 202401010000 .sdlc/execution/ship-feat-ship-20260608T120000Z.json
