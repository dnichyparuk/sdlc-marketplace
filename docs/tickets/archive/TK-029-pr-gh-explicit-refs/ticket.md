---
id: TK-029
type: task
title: pr-sdlc passes explicit base and head to gh
created: 2026-11-22
links: [todo:pr-step-gh-in-main-checkout]
resolution: done
closed: 2026-11-22
by: [2026-11-22-w-f1-pr-sdlc-explicit-gh-refs-and#1, 2026-11-22-w-f1-pr-sdlc-explicit-gh-refs-and#2, 2026-11-22-w-f1-pr-sdlc-explicit-gh-refs-and#3]
---

# TK-029: pr-sdlc passes explicit base and head to gh

## Why

plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:497, :511 and :534 run gh pr create and gh pr edit with no --base or --head. From the main checkout (cwd = base branch) gh fails with "head branch main is the same as base branch main", and a main checkout on another feature branch would open a PR for the wrong branch. The resolved baseBranch (docs/specs/pr-sdlc.md R-basebranch-config-cascade, A3 --base) is never passed. Source: TODO note pr-step-gh-in-main-checkout (ledger F-195).

## What

Add a requirement to docs/specs/pr-sdlc.md (R-gh-explicit-refs): gh pr create passes --base '<baseBranch>' --head '<currentBranch>' from pr-context, the E7 retry the same, gh pr edit names '<currentBranch>'; origin is assumed to be the base repo. Its Acceptance line names a new exec case. Edit SKILL.md at those lines citing the id, add one sentence to docs/skills/pr-sdlc.md, byte-copy the changed docs and spec to site/src/content-source, add the sentinel script tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js modelled on check-ship-tool-handling-sentinels.js and 1-2 cases in tests/promptfoo/datasets/pr-prepare-exec.yaml. Archive the TODO note (promoted).

## Acceptance

- A1: docs/specs/pr-sdlc.md has R-gh-explicit-refs with an Acceptance line naming the new exec case.
- A2: pr-sdlc SKILL.md passes --base and --head to gh pr create (and its E7 retry) and names the branch in gh pr edit, citing R-gh-explicit-refs.
- A3: docs/skills/pr-sdlc.md states the explicit refs; site/src/content-source copies of the spec and doc are byte copies.
- A4: tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js exists and fails when a gh call lacks the refs.
- A5: tests/promptfoo/datasets/pr-prepare-exec.yaml has 1-2 cases running the sentinel script; they pass.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
