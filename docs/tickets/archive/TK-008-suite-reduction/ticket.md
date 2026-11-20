---
id: TK-008
type: task
title: Suite reduction (#9426)
created: 2026-11-19
resolution: done
closed: 2026-11-20
by: [2026-11-19-w-d1-suite-reduction#1, 2026-11-19-w-d1-suite-reduction#2, 2026-11-19-w-d1-suite-reduction#3, 2026-11-19-w-d1-suite-reduction#4, 2026-11-19-w-d1-suite-reduction#5, 2026-11-19-w-d1-suite-reduction#6, 2026-11-19-w-d1-suite-reduction#7, 2026-11-19-w-d1-suite-reduction#8, 2026-11-19-w-d1-suite-reduction#9, 2026-11-19-w-d1-suite-reduction#10, 2026-11-19-w-d1-suite-reduction#11]
---

# TK-008: Suite reduction (#9426)

## Why

#9426 [suite-D] reduction (audit W5, 8 tasks): ~230 merges/removals by dataset family, gated by #9422; delete 15 orphan fixtures-fs dirs and 2 orphan fixtures | src: audit (after #9422)

## What

About 230 merges or removals by dataset family; delete 15 orphan fixtures-fs dirs and 2 orphan fixtures.

## Acceptance

- A1: the merged and removed cases keep every cited spec id and pass the coverage baseline after a reviewed update.
- A2: the orphan fixtures-fs dirs and fixtures are deleted.

## Notes

Moved from .sdlc/orchestration/todos.md (#9426) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
