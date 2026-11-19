---
id: TK-012
type: task
title: Final spec-compliance review runs or records a skip (#9451)
created: 2026-11-19
---

# TK-012: Final spec-compliance review runs or records a skip (#9451)

## Why

#9451 [type:followup] [medium, wave Q candidate] execute-plan-sdlc skipped the final spec-compliance reviewer (Step 8-bis) in w34 and checked criteria itself; the step must run or record an explicit skip that verify-completeness checks | src: F-146 (lean-w34)

## What

execute-plan-sdlc runs Step 8-bis or records an explicit skip that verify-completeness checks.

## Acceptance

- A1: every execute run either runs the final spec-compliance reviewer or records an explicit skip.
- A2: verify-completeness fails a run that has neither.

## Notes

Moved from .sdlc/orchestration/todos.md (#9451) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
