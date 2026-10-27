#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Fixture (#451): main worktree already on a FEATURE branch. Drives the
# main+feature → flags.workspace === "continue" emission case — the
# post-branch-creation second-run state (re-running ship on a feature branch
# never re-branches or re-migrates; derive returns `continue`).
#
# Note: .sdlc/local.json carries a stale { ship: { workspace: "worktree" } }
# config on purpose — workspace is auto-detected (R60), so the derived value
# (`continue`) MUST override any config workspace value. The removed-flag /
# config-ignored contract is exercised by this fixture state.
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false
git add -A
git commit -q -m "init"
git checkout -q -b feat/some-feature
