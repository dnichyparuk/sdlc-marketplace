---
id: TK-017
type: task
title: Config and plan reads from the worktree (#9458)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-20-w-d2-ship-execute-and-plan-follow-ups#10, 2026-11-20-w-d2-ship-execute-and-plan-follow-ups#11]
---

# TK-017: Config and plan reads from the worktree (#9458)

## Why

#9458 [type:followup] [later wave] commit-sdlc and received-review prepare first ran against the main checkout instead of the ship worktree (config and manifests); state files there are intended (#9444), but config/plan reads must come from the worktree toplevel (ledger F-153) | src: w35 ship

## What

commit-sdlc and received-review prepare read config and plan from the worktree toplevel; state files stay in the main checkout (#9444). Also one sentence in docs/skills/ship-sdlc.md: state, execution and learnings files go to the main checkout's .sdlc/ even from a linked worktree; saved review reports go to the active worktree.

## Acceptance

- A1: in a linked worktree, commit-sdlc and received-review prepare read config and plan from the worktree toplevel.
- A2: docs/skills/ship-sdlc.md states where state, execution, learnings and review-report files go.

## Notes

Moved from .sdlc/orchestration/todos.md (#9458) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
