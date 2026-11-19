---
id: TK-018
type: task
title: State files match the exact branch name (#9450)
created: 2026-11-19
---

# TK-018: State files match the exact branch name (#9450)

## Why

#9450 [type:followup] [low, wave D2] slugifyBranch (lib/state.js:68-70) is lossy: fix/a and fix-a share state files when run at the same time (architect 2026-11-19; negligible risk) | src: #9444 review

## What

Exact-name match in lib/state.js and a branch check on read; the slug format stays unchanged.

## Acceptance

- A1: two branches whose slugs are equal (fix/a and fix-a) never read each other's state files.
- A2: the slug format of state file names is unchanged.

## Notes

Moved from .sdlc/orchestration/todos.md (#9450) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
