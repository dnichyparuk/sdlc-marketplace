---
id: TK-011
type: task
title: R74 re-check keeps the rerun lanes (#9449)
created: 2026-11-19
---

# TK-011: R74 re-check keeps the rerun lanes (#9449)

## Why

#9449 [type:followup] [later wave] R74 re-check: recheckLanes drops the rerun lanes on a non-material fix (plan-critique.js:219); found by the w34 planner | src: w34 plan

## What

recheckLanes keeps the rerun lanes on a non-material fix.

## Acceptance

- A1: the R74 re-check dispatches the rerun lanes after a non-material fix.
- A2: an exec case covers it.

## Notes

Moved from .sdlc/orchestration/todos.md (#9449) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
