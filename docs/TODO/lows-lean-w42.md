# Deferred lows of lean-w42 (unit W-D2, PR #123, merge 1e3e3d7)

Source: review-rounds-fix-lean-w42-w-d2-ship-execute-and-plan-follow-ups.json (rounds 1-2), the fix-round-3 review of 363c58d, and the ship report; re-rated LOW by an isolated architect on 2026-11-20 (owner agreed to keep them for END).

| Severity | Path:line | Title | Text | Wave/PR |
|---|---|---|---|---|
| low | docs/skills/received-review-sdlc.md:33 | R38 removed-phrase rule not in the skill doc | The fix-step rule R38 (grep datasets for a removed phrase, update the cases in the same change set) is in the spec and SKILL.md but not documented in the user doc (flagged in review rounds 1 and 2). | lean-w42 / PR #123 |
| low | plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:651 | "few-waves" label not attached to the rule it names | Step 8-bis line 651 says "the per-wave few-waves rule below"; the rule at :658 does not carry the label. Readability only; the rule paragraph was churned by three fix rounds. | lean-w42 / PR #123 |
| low | tests/promptfoo/datasets/received-review-prepare-exec.yaml | R37 exec case checks only parseArgs roots | The R37 case for received-review.js asserts the resolved roots, not that the manifest's project-config fields come from the worktree. Coverage gap only. | lean-w42 / PR #123 |
| low | plugins/sdlc-utilities/scripts/skill/ship.js:2823 | No exec case for the R109 summary write at the final-check-open stop | writeShipSummaryFile is tested at the cleanup site (:3050) only. Put the case next to the split ship-prepare-exec.yaml cases (W-F TK-020). | lean-w42 / PR #123 |
