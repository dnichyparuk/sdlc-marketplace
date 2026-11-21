---
id: TK-013
type: task
title: Ship-step prompts pass PLUGIN_ROOT (#9452)
created: 2026-11-19
resolution: done
closed: 2026-11-21
by: [2026-11-20-w-d2-ship-execute-and-plan-follow-ups#6]
---

# TK-013: Ship-step prompts pass PLUGIN_ROOT (#9452)

## Why

#9452 [type:followup] [low] ship-step pr agent had no `sdlc plugin root:` line and used the skill base dir; pass PLUGIN_ROOT explicitly in ship-step dispatch prompts | src: F-147 (lean-w34)

## What

Pass PLUGIN_ROOT explicitly in the ship-step dispatch prompts.

## Acceptance

- A1: every ship-step dispatch prompt carries the plugin root line.
- A2: the pr step resolves its scripts from that root, not from the skill base dir.

## Notes

Moved from .sdlc/orchestration/todos.md (#9452) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
