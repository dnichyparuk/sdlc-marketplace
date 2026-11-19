---
id: TK-003
type: task
title: Fast pre-push exec tier (#9427, part)
created: 2026-11-19
resolution: done
closed: 2026-11-19
by: [2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#13, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#14]
---

# TK-003: Fast pre-push exec tier (#9427, part)

## Why

#9427 [suite-E] tiers and structure (audit W6, 5 tasks, 1 Complex): fast pre-push tier, split ship-prepare-exec.yaml (6,578 lines), -e programs to wrappers, stale headers/descriptions | src: audit (owner decision for pre-push tier)

## What

The fast pre-push tier only. The rest of #9427 is TK-020. If this tier is Complex and W-H2 would reach 3 Complex tasks, move the ticket to W-F.

## Acceptance

- A1: the pre-push hook runs a fast exec tier, whose content the owner decided, instead of both full exec configs.
- A2: the full exec configs still run on demand.

## Notes

Moved from .sdlc/orchestration/todos.md (#9427) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
