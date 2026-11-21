---
id: TK-015
type: task
title: Persisted ship summary file (#9454)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-20-w-d2-ship-execute-and-plan-follow-ups#8]
---

# TK-015: Persisted ship summary file (#9454)

## Why

#9454 [type:followup] [medium, wave D candidate] ship has no persisted final summary file: finalCheck.commit and the final report live only in the pane; write the summary (finalCheck, head, steps) to .sdlc/execution/ship-summary-<branch slug>.json | src: steward 2026-11-19

## What

Write the final summary (finalCheck, head, steps) to .sdlc/execution/ship-summary-<branch slug>.json.

## Acceptance

- A1: after the final report, the summary file exists with finalCheck, head and steps.
- A2: finalCheck.commit can be read from the file without the pane.

## Notes

Moved from .sdlc/orchestration/todos.md (#9454) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
