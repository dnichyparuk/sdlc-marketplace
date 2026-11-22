# Deferred lows: lean-w34 (PR #111)

> ARCHIVED / IMPLEMENTED — owner sign-off 2026-11-22 (PD-5), PR #142

Deferred review lows of lean-w34, homed to the END gate `W-END` (decision PD-1 in `docs/plans/decisions.md`). This programme only.

Impact: the END audit re-checks the unmarked rows on HEAD in full (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap; marked rows get the mechanical check and a spot check (PD-3).

Source: `.sdlc/orchestration/programme-lows.md`, written by lean-sdlc-w37-main on 2026-11-19 (frozen copy sha256 d0b8b598918fb82d4a0dc62a76ed6d5d7d77041769bc4a4e765d9f9840bcdc26), section `## lean-w34 (PR #111)`, rows copied verbatim.

Format: severity | path:line | title | one-line text | wave/PR. No line number where the source had none.

- low | plugins/sdlc-utilities/scripts/skill/ship.js:526 (also reported at :524) | Missing space in computeSteps signature | `(flags,flagSources)` lacks a space after the comma | lean-w34 / #111 — FIXED by W-E1 (PR #129, bb344de, Task 9)
- low | plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:41 | Iteration-1 diff-material command is inline | the sibling rule uses a bash block | lean-w34 / #111 — FIXED by W-E1 (PR #129, bb344de, Task 2)
- low | plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:104 | --lanes row holds two overlapping descriptions | lens-only `""` dropped | lean-w34 / #111 — FIXED by W-E1 (PR #129, bb344de, Task 2)
- low | plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:456 | Footer added after Step 5 approval | placeholders not in code spans | lean-w34 / #111 — FIXED by W-E1 (PR #129, bb344de, Task 10)
- low | docs/specs/plan-sdlc.md:86 (R75) | R75 Step 5 dispatch rule not updated for new R76 rerun lanes | spec R75 rerun lanes | lean-w34 / #111 — FIXED by W-E1 (PR #129, bb344de, Task 1)
