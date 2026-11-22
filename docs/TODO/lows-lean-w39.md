# Deferred lows: lean-w39 (PR #117)

Deferred review lows of lean-w39, homed to the END gate `W-END` (decision PD-1 in `docs/plans/decisions.md`). This programme only.

Impact: the END audit re-checks the unmarked rows on HEAD in full (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap; marked rows get the mechanical check and a spot check (PD-3).

Source: `ledger.js deferred --wave lean-w39 --md` (written by lean-sdlc-w39-main on 2026-11-19) plus ship's done message, rows copied verbatim.

Format: severity | path:line | title | one-line text | wave/PR. No line number where the source had none.

- low | tests/promptfoo/scripts/gh-inprocess.js:542 | spawnSync override breaks the (cmd, options) call form | child_process.spawnSync accepts spawnSync(cmd, options) with the args array omitted. The override declares (cmd, args, opts = {}) and takes opts from the third parameter. For spawnSync('gh', { env, t… | lean-w39 / #117 — FIXED by W-E3 (PR #133, d128590, Task 4)
- low | docs/specs/ship-sdlc.md:242 | R106 findings: spec omits the entry filtering ship.js applies | R106 says a round record's `findings` is "the `findings` array of the review summary that round's gate read". ship.js summaryFindings() (plugins/sdlc-utilities/scripts/skill/ship.js, after reviewGate… | lean-w39 / #117 — FIXED by W-E2 (PR #131, 25c3ffc, Task 1)
- note | tests/promptfoo/scripts/gh-inprocess.js:276; tests/promptfoo/scripts/run-fixture-memo.js:346; docs/specs/review-sdlc.md P11; docs/specs/ship-sdlc.md R106 | open lows/info named by ship's done message (round 2): throw in answer(); Promise.all vs allSettled; P11 wording; R106 filtering note | — | lean-w39 / #117
