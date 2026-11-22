---
id: TK-022
type: task
title: Guardrail lane re-runs on a warning FAIL (F-141)
created: 2026-11-22
resolution: done
closed: 2026-11-22
by: [2026-11-22-w-e7-guardrail-table-re-run-fix#2]
---

# TK-022: Guardrail lane re-runs on a warning FAIL (F-141)

## Why

plan-sdlc leaves stale FAIL rows in the Guardrail Compliance table after a fix in Context or Non-goals when the failing guardrail has warning severity. `rerunFrom` in `plugins/sdlc-utilities/scripts/lib/plan-critique.js` (about lines 235-239) re-runs a lane only when its result has a blocking issue, and R77 (`docs/specs/plan-sdlc.md:90`) accepts the gap. It was seen again in `docs/archived/plans/2026-11-20-w-d2-ship-execute-and-plan-follow-ups.md` lines 818 and 820 after the R77 fix (ledger F-141).

## What

Treat the `guardrail-compliance` lane as needing a rerun when its previous result has any FAIL issue, warning included. Remove the accepted-gap sentence from R77. Add one exec case. Update the spec appendix.

## Acceptance

- A1: after a warning-severity guardrail FAIL is fixed in the plan text, the next critique re-runs the guardrail lane and the spliced table has no stale FAIL row.
- A2: an exec case in plan-prepare-exec covers it.

## Notes

Scheduled in unit W-E7 (decision PD-6), milestone M1. Light wave, patch bump, exec-only verification.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
