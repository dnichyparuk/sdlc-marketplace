---
id: TK-002
type: task
title: Per-round review findings in review-summary (#9462)
created: 2026-11-19
---

# TK-002: Per-round review findings in review-summary (#9462)

## Why

#9462 [type:followup] [medium, wave H2] review: write the findings array (severity, path, line, title) of EVERY review round into review-summary-<slug>.json (or ship keeps a per-round copy), so rounds below the received-review threshold no longer lose finding text (counts-only rounds; ship.js:1854 skips received-review there; ledger.js:318/:324/:342 then store counts only) | src: skill architect 2026-11-19, owner yes

## What

Write the findings array (severity, path, line, title) of every review round into review-summary-<slug>.json, or let ship keep a per-round copy.

## Acceptance

- A1: after a ship run, the findings of every review round are on disk, including rounds below the received-review threshold.
- A2: the lean ledger can record finding text for such rounds instead of counts only.

## Notes

Moved from .sdlc/orchestration/todos.md (#9462) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
