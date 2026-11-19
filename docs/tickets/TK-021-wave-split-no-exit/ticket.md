---
id: TK-021
type: task
title: Wave split returns an error instead of exiting (#9463)
created: 2026-11-19
---

# TK-021: Wave split returns an error instead of exiting (#9463)

## Why

#9463 [type:followup] [low, later wave] execute.js cmdWaveSplit calls resolveBranchOrExit (process.exit 2) inside its best-effort try when --state-file is absent, so the split result is never printed outside a git repo; return an error instead of exiting (architect 2026-11-19, found by the lean-w37 temp-cwd change) | src: w37 ship

## What

cmdWaveSplit returns an error instead of calling process.exit inside its best-effort try.

## Acceptance

- A1: without --state-file and outside a git repo, the wave split prints its result or a JSON error and does not exit with code 2.
- A2: an exec case covers it.

## Notes

Moved from .sdlc/orchestration/todos.md (#9463) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
