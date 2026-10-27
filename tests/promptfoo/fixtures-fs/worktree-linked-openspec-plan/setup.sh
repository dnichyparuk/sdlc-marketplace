#!/bin/bash
# Fixture (#457): main worktree WITHOUT openspec + linked worktree WITH an active
# openspec change. Discriminates content-root routing: prepare scripts run from the
# linked worktree must detect the linked tree's openspec change, not main's (empty).
#
# detectActiveChanges/validateChange are pure fs.existsSync — openspec content does
# NOT need committing; uncommitted working-tree files in the linked worktree suffice
# (mirrors project-linked-worktree-staged, which stages an uncommitted file).
#
# Re-runnable: every git/worktree state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# Minimal valid .sdlc/config.json on main — resolveSdlcRoot() walks back to the main
# worktree for config reads (issue #351), so this MUST live in the main tree.
mkdir -p .sdlc
cat > .sdlc/config.json <<'JSON'
{
  "sdlc": "1.0.0",
  "plan": { "guardrails": [] },
  "execute": { "guardrails": [] }
}
JSON

# Initial commit on main so HEAD has a base for the worktree to branch from.
# Main's working tree deliberately has NO openspec/ directory.
git add -A
git commit -q -m "init: sdlc config on main, no openspec"

# Create a linked worktree on a fresh feature branch.
rm -rf worktrees
git worktree add -q -b feat/my-feature worktrees/wt1 >/dev/null

# Populate the linked worktree's working tree with an active openspec change.
# Branch feat/my-feature -> strips "feat/" -> slug "my-feature" matches the change
# dir name "my-feature", so detectActiveChanges sets branchMatch=my-feature.
mkdir -p worktrees/wt1/openspec/specs
mkdir -p worktrees/wt1/openspec/changes/my-feature/specs

cat > worktrees/wt1/openspec/config.yaml <<'YAML'
version: 1
YAML

cat > worktrees/wt1/openspec/specs/baseline.md <<'MD'
# Baseline Spec

## Requirement: Baseline behavior
The system SHALL retain baseline behavior.
MD

cat > worktrees/wt1/openspec/changes/my-feature/proposal.md <<'MD'
# Change: my-feature

## Why
Route content scans through the active worktree.

## What Changes
- Add active-worktree resolution for content scans.
MD

cat > worktrees/wt1/openspec/changes/my-feature/specs/spec1.md <<'MD'
# Delta Spec: my-feature

## ADDED Requirements

### Requirement: Active worktree routing
Content scans SHALL resolve against the active worktree root.

#### Scenario: linked worktree
- WHEN a prepare script runs from a linked worktree
- THEN it scans the linked tree's openspec change
MD

# tasks.md with exactly ONE injectable unchecked line and NO pre-existing ref comment,
# so plan.js --from-openspec injects exactly one ref -> tasksUpdated == 1.
cat > worktrees/wt1/openspec/changes/my-feature/tasks.md <<'MD'
# Tasks: my-feature

- [ ] Implement active worktree routing
MD
