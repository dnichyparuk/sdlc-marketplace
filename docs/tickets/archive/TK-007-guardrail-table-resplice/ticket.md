---
id: TK-007
type: task
title: Re-splice Guardrail Compliance after fixes (#9453)
created: 2026-11-19
resolution: done
closed: 2026-11-19
by: [2026-11-19-w-b-suite-false-passes-and-the-guardrail#11, 2026-11-19-w-b-suite-false-passes-and-the-guardrail#12, 2026-11-19-w-b-suite-false-passes-and-the-guardrail#13]
---

# TK-007: Re-splice Guardrail Compliance after fixes (#9453)

## Why

#9453 [type:followup] [low, wave B candidate] plan-sdlc leaves stale Guardrail Compliance rows (FAIL) after the planner fixes the finding in Context; recompute the table after fixes (ledger F-141; recurred lean-w36 after #9432 shipped: R74 re-check runs without a splice, SKILL.md:471,491 — re-splice the table from the newest merged.json with a guardrail lane after R74 and the last Step 5 iteration; architect 2026-11-19) | src: steward 2026-11-19

## What

Re-splice the Guardrail Compliance table from the newest merged.json with a guardrail lane after the R74 re-check and after the last Step 5 iteration.

## Acceptance

- A1: a plan whose guardrail finding was fixed during critique shows no stale FAIL row.
- A2: the re-splice also runs after the R74 re-check.

## Notes

Moved from .sdlc/orchestration/todos.md (#9453) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
