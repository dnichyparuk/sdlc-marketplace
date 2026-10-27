#!/bin/bash
# Fixture (Task 5): git repo where the current branch name does NOT match the
# active change's slug, forcing detectActiveChanges() past the branch-slug
# regex and into the committed-diff fallback (openspec/changes/<name>/ file
# touched on the branch). Also carries a tasks.md with 1 done + 2 pending
# tasks for syncIncompleteTasks coverage.
#
# Re-runnable: every git state is recreated from scratch on each run.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi

git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p openspec/specs
mkdir -p openspec/changes/my-change

cat > openspec/config.yaml <<'YAML'
version: 1
YAML

cat > openspec/changes/my-change/proposal.md <<'MD'
# Change: my-change

## Why
Test fixture for detectActiveChanges diff-fallback branch matching and
syncIncompleteTasks.

## What Changes
- Add a diff-fallback branch-matching test fixture.
MD

cat > openspec/changes/my-change/tasks.md <<'MD'
# Tasks: my-change

- [x] Already done task
- [ ] Pending task one
- [ ] Pending task two
MD

git add -A
git commit -q -m "init: my-change proposal and tasks on main"

# Feature branch name deliberately does NOT match the change slug "my-change" —
# forces detectActiveChanges past the branch-slug match and into the
# committed-diff fallback (git diff --name-only main...HEAD).
git checkout -q -b feat/issue-42-rework

mkdir -p openspec/changes/my-change/specs
cat > openspec/changes/my-change/specs/delta.md <<'MD'
# Delta Spec: my-change

## ADDED Requirements

### Requirement: Diff fallback matching
The system SHALL resolve branchMatch via the committed-diff fallback when the
current branch name does not match any active change slug.

#### Scenario: mismatched branch name
- WHEN the current branch name does not match any active change slug
- THEN detectActiveChanges resolves branchMatch via the single-change diff heuristic
MD

git add -A
git commit -q -m "feat: add delta spec for my-change on feat/issue-42-rework"
