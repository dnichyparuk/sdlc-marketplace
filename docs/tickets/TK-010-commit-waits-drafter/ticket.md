---
id: TK-010
type: task
title: Commit step waits for its message drafter (#9446)
created: 2026-11-19
---

# TK-010: Commit step waits for its message drafter (#9446)

## Why

#9446 [type:followup] [later wave] ship-step-commit (haiku) returns before its message drafter finishes; wait for the drafter (ledger F-144) | src: w33 ship

## What

ship-step-commit waits for its message drafter before it returns.

## Acceptance

- A1: ship-step-commit returns only after its message drafter has finished.
- A2: the commit carries the drafted message.

## Notes

Moved from .sdlc/orchestration/todos.md (#9446) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
