---
id: TK-016
type: task
title: Ship Stop hook quiet while a step agent runs (#9455)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-20-w-d2-ship-execute-and-plan-follow-ups#9]
---

# TK-016: Ship Stop hook quiet while a step agent runs (#9455)

## Why

#9455 [type:followup] [low, wave D candidate] ship Stop hook fires repeatedly while step subagents run ("step N is in_progress"); suppress it while a dispatched step agent is live | src: steward 2026-11-19 (w34 ship report)

## What

Suppress the ship Stop hook while a dispatched step agent is live.

## Acceptance

- A1: the Stop hook stays quiet while a dispatched step agent is live.
- A2: it still fires when a step is in progress and no step agent runs.

## Notes

Moved from .sdlc/orchestration/todos.md (#9455) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
