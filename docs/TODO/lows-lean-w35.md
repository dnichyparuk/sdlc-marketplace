# Deferred lows: lean-w35 (PR #112)

Deferred review lows of lean-w35, homed to the END gate `W-END` (decision PD-1 in `docs/plans/decisions.md`). This programme only.

Impact: the END audit re-checks the unmarked rows on HEAD in full (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap; marked rows get the mechanical check and a spot check (PD-3).

Source: `.sdlc/orchestration/programme-lows.md`, written by lean-sdlc-w37-main on 2026-11-19 (frozen copy sha256 d0b8b598918fb82d4a0dc62a76ed6d5d7d77041769bc4a4e765d9f9840bcdc26), section `## lean-w35 (PR #112)`, rows copied verbatim.

Format: severity | path:line | title | one-line text | wave/PR. No line number where the source had none.

- low | tests/promptfoo/scripts/mutation-smoke.js | --run does not verify the mutation applied before running promptfoo (a mutation that does not apply is reported as a survivor, not an error) | — | lean-w35 / #112 — FIXED by W-E3 (PR #133, d128590, Task 1)
- low | tests/promptfoo/scripts/mutation-smoke.js | Mutation expected to survive makes --run always report ok:false (one mutation is declared to survive, so --run can never report ok) | — | lean-w35 / #112 — FIXED by W-E3 (PR #133, d128590, Task 1)
- low | tests/promptfoo/scripts/check-dataset-asserts.js:175 | Allowlist JSON parse error lacks file context | inconsistent with the baseline reader | lean-w35 / #112 — FIXED by W-E3 (PR #133, d128590, Task 3)
- low | tests/promptfoo/scripts/check-spec-id-coverage.js:73 | Missing exec config throws ENOENT | the sibling lint skips a missing config | lean-w35 / #112 — FIXED by W-E3 (PR #133, d128590, Task 3)
- low | tests/promptfoo/scripts/mutation-smoke.js | Temp path built by string concatenation | — | lean-w35 / #112 — FIXED by W-E3 (PR #133, d128590, Task 1)
- note | tests/promptfoo/scripts/mutation-smoke.js:164,165,172,187 | END-line file:line list for the mutation-smoke lows above (mapping per line not recorded) | — | lean-w35 / #112
