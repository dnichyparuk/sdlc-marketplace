---
id: TK-009
type: task
title: Update exec cases of removed phrases (#9445)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-20-w-d2-ship-execute-and-plan-follow-ups#12]
---

# TK-009: Update exec cases of removed phrases (#9445)

## Why

#9445 [type:followup] [later wave] received-review fix step leaves exec cases counting a phrase it removed; grep datasets for removed phrases and update them in the same commit (ledger F-143) | src: w33 ship

## What

The received-review fix step greps the datasets for each phrase it removes and updates those cases in the same commit.

## Acceptance

- A1: a fix that removes a phrase also updates every exec case that counted it, in the same commit.
- A2: no exec case counts a phrase that the fix removed.

## Notes

Moved from .sdlc/orchestration/todos.md (#9445) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
