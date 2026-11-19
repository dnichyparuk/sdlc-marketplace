---
id: TK-020
type: task
title: Suite tiers and structure (#9427)
created: 2026-11-19
---

# TK-020: Suite tiers and structure (#9427)

## Why

#9427 [suite-E] tiers and structure (audit W6, 5 tasks, 1 Complex): fast pre-push tier, split ship-prepare-exec.yaml (6,578 lines), -e programs to wrappers, stale headers/descriptions | src: audit (owner decision for pre-push tier)

## What

#9427 without the pre-push tier (that part is TK-003): split ship-prepare-exec.yaml (last step of the wave), move -e programs to wrappers, fix stale headers and descriptions.

## Acceptance

- A1: ship-prepare-exec.yaml is split and the -e programs are wrapper scripts, with no case or assertion lost against the coverage baseline.
- A2: dataset headers and descriptions match their cases.

## Notes

Moved from .sdlc/orchestration/todos.md (#9427) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
