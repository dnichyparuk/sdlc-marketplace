---
id: TK-019
type: task
title: Suite coverage gaps (#9428)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#2, 2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#3, 2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#4, 2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#5, 2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#6, 2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure#7]
---

# TK-019: Suite coverage gaps (#9428)

## Why

#9428 [suite-F] coverage gaps (audit W7, 8-10 tasks): state/execute wave-fail task-fail, state/ship decide defer skip fail, review.js scope flags, jira.js cache flags, setup --migrate --only --scan-prs, version.js errors, execute --commit-waves --from-wave, ship --await-review, commit type/scope rejects | src: audit

## What

Exec cases for each gap listed in the todo.

## Acceptance

- A1: each listed gap has an exec case that fails when the covered behaviour breaks.
- A2: the exec suite passes.

## Notes

Moved from .sdlc/orchestration/todos.md (#9428) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
