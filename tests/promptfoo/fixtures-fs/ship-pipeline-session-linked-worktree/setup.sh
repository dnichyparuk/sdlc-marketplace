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

# R73 (#505) NEGATIVE-TERM guard — this is the reported stall. The state's
# `worktree` field records the MAIN checkout (written unexpanded below), while
# the hook is invoked with a payload `cwd` pointing at a linked task worktree.
# The three stdin-driven hooks (pipeline-continue.js, stop-pipeline-continue.js,
# block-askuserquestion-auto.js) carry NO worktree term by design: `worktree`
# legitimately mismatches a payload cwd for a step dispatched with
# isolation: "worktree", and resolveStateDir() already routes through the main
# worktree so merely locating the file proves same-repo. The hooks must still
# enforce (see the cases below).
#
# `worktree` is NOT diagnostic-only everywhere, though (this plan, follow-up to
# #503/#506/#509): ship.js's OWN resume detection (lib/state.js::
# detectResumeState) DOES gate implicit resume on this same field — see
# state-format.md's `worktree` row and the `worktree-mismatch:`-prefixed cases
# in ship-hooks-exec.yaml. That is a separate code path (ship.js comparing its
# own active worktree against the field at prepare time) from the hook-payload
# `cwd` comparison this fixture exercises below, which stays deliberately
# worktree-unaware.
# NOTE: unquoted heredoc — $PWD expands to this fixture's temp-copied checkout.
cat > .sdlc/execution/ship-feat-ship-20260608T120000Z.json <<EOF
{
  "version": 1,
  "startedAt": "2026-06-08T12:00:00Z",
  "branch": "feat/ship",
  "sessionId": "sess-wt",
  "worktree": "$PWD",
  "flags": { "auto": true, "steps": ["execute", "commit", "pr"] },
  "steps": [
    { "name": "execute", "status": "in_progress" },
    { "name": "commit", "status": "pending" },
    { "name": "pr", "status": "pending" }
  ]
}
EOF
