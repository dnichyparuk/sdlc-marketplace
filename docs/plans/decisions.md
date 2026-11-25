# Programme decisions

Append-only. The log wins over the text of a plan.

## PD-1: Deferred lows of waves H1 to F go to the END gate

- **Date and owner:** 2026-11-19, owner (lows ledger by the architect, strong, accepted).
- **Decision:** this programme only, not a skill rule. Every deferred review low of waves H1 to F goes to one TODO note per wave, `docs/TODO/lows-<wave>.md` (severity, path:line, title, one-line text, wave/PR), homed to the gate unit `W-END`. No per-wave low batches. The END audit gets every note as context and re-checks each row on HEAD (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap. No post-merge audit and no backlog clearing before END.
- **Rejected options:** per-wave low batches (overridden for H1 to F); one file `docs/plans/programme-lows.md`; a ticket or a TODO note per low.
- **Made obsolete:** the per-wave backlog batching for waves H1 to F; the untracked `.sdlc/orchestration/programme-lows.md` once wave L merges (its rows are in `docs/TODO/lows-lean-w34.md`, `lows-lean-w35.md` and `lows-lean-w36.md`).

## PD-2: END audit decisions (fix waves W-E1 to W-E5)

- **Date and owner:** 2026-11-21, owner delegation (architect-accepted).
- **Decision:** the END audit result becomes five fix waves, `W-E1` to `W-E5` (keys of the register pattern; they stand for "END1" to "END5"), and the `W-END` gate stays the programme close and depends on all five. Decided on the audited rows: (a) the `subagent-track.js` marker race (lean-w42) is accepted and dropped; one sentence for the "Accepted gaps" of spec R110 in `docs/specs/ship-sdlc.md` is part of the scope of `W-E2` (a spec edit is not a planning-PR change): the marker read-modify-write has no lock, two step agents that start or stop at the same moment can lose an update, and this race is accepted (decision PD-2). (b) F-170, review severity drift between the fix-round review and the final check, is NOT A DEFECT: both use the same review step and threshold; the note is archived. (c) F-176, `plan.copyRules`, stays unchanged because R71(d) is deliberate; the optional planner hint is in the scope of `W-E2`. (d) D9, the `-j 4` trial: run once on 2026-11-21 by an agent the owner delegated, `promptfooconfig-exec.yaml` 1529/1529 passed (8 min 8 s), `promptfooconfig-exec-hooks.yaml` 179/179 passed (36 s), command `npx --yes promptfoo@0.123.1 eval -c <config> -j 4 --no-cache`; recorded under A2 of TK-001. (e) The counts-only lows: the four of lean-w34 duplicate listed rows (line refs added to them); the rows for lean-w35 (1), lean-w36 (2) and lean-w39 (3) are covered by their END-line notes and are dropped; the note `end-recover-counts-only-lows` is archived. Also: F-169 (`script-runner-eisdir-plan-splice`) is not a plugin defect, there is no repro, and `tests/promptfoo/README.md:73` names the cause (promptfoo 0.125+ pin issue); the note is archived. Rows marked FIXED and dropped: lean-w35 `mutation-smoke.js` `--only` without a value; lean-w40 "E9 omits splice" and ENOTDIR; duplicate rows are merged into one.
- **Rejected options:** a fix wave per audit finding; a lock for the marker file (the race is rare and its effect is bounded by the 2-hour limit).
- **Made obsolete:** the "final fix wave(s)" wording of the END brief in `docs/plans/programme.md`.

## PD-3: Fixed lows are marked in the planning PR; END re-checks unmarked rows

- **Date and owner:** 2026-11-22, owner (accepted the architect's recommendation).
- **Decision:** this programme only. The planning PR of every fix wave marks the rows of `docs/TODO/lows-*.md` that the wave fixed, with ` — FIXED by <unit> (PR #<n>, <merge sha>, Task <N>)`, or ` — NOT A DEFECT per <plan file> Deviations (<reason>)` when the plan's Deviations table records it with evidence. A row is marked only when a ticked task (or a Deviations row) names its path and its line or title, the merged commit changed that path (not required for NOT A DEFECT), and the row is not a composite note row; otherwise it stays unmarked. A lows note stays open and homed to `W-END` until the gate, whether all, some or none of its rows are marked. At END, unmarked rows get the full re-check; marked rows get a mechanical check (the cited SHA is an ancestor of HEAD and `git show --stat <sha> -- <path>` is not empty) plus a spot check of 3 marked rows from different waves, fully re-checked on HEAD; if one fails, every marked row of that wave is re-checked. A NOT A DEFECT mark has no SHA and gets the full re-check. The W-E3 planning PR backfills the marks for W-E1 and W-E2 and re-homes `lows-lean-w35.md` and `lows-lean-w42.md` to `W-END`.
- **Rejected options:** a new lift-planning CLI command `todo mark`; archiving the fixed rows per wave.
- **Made obsolete or amended:** PD-1's "re-check each row" for the END audit is amended: only unmarked rows get the full re-check. PD-1's text is unchanged.

## PD-4: Final lows wave W-E6; accepted gap and closed rows

- **Date and owner:** 2026-11-22, owner request ("dispatch one more low-fi wave to clean up them") plus architect-accepted (strong).
- **Decision:** (a) One final low-fix wave `W-E6` covers items A1 to A4 of the architect's consolidation (lean-w45:8, :10, :11, :12 and lean-w48:8, :9, :10): light plan, no spec edit. (b) lean-w45:9 (wave-progress lock owner) is accepted as the existing accepted gap of `docs/specs/execute-plan-sdlc.md:84` (R-WAVE-LIVENESS), clause: "a paused lock holder that resumes after a stale break can also remove the next holder's lock in its finally; the effect is the same lost advisory update; no owner token is added"; no code or spec change. (c) lean-w45:7 and lean-w48:7 are NOT A DEFECT (evidence in the architect report, section 2). (d) lean-w36:11 is closed as FIXED (deferred count, W-E1 Task 5, bb344de) plus NOT A DEFECT (titles, W-E1 Deviations row b).
- **Rejected options:** a spec edit for (b), which would pull in the user doc, the site copy and all companions under R71(d); fixing only A1 and A2.
- **Made obsolete or amended:** PD-2's "five fix waves" count: the fix waves are W-E1 to W-E6, and `W-END` depends on all six.


## PD-5: The W-END gate closes; the deferred-lows policy ends

- **Date and owner:** 2026-11-22, owner sign-off. Evidence, the owner's words: "whenever everything done, we can wrap up w-end" and "ensure all stats are collected before wrapping up".
- **Decision:** (a) The `W-END` gate closes on the merge of its planning PR. (b) The programme's deferred-lows policy (PD-1, PD-3) ends; the orchestration profile returns to per-wave handling of lows through a separate skill PR, not part of that planning PR. (c) The 7 residual lows (lean-w45:8, :10, :11, :12 and lean-w48:8, :9, :10) were fixed by W-E6; lean-w45:9 is the accepted gap of PD-4; lean-w45:7, lean-w48:7 and lean-w36:11 were closed under PD-4. (d) The `docs/TODO/lows-lean-w*.md` notes and `docs/TODO/lean-skill-pr-b-9464.md` are archived by the gate close.
- **Rejected options:** a second audit; a further fix wave.
- **Made obsolete or amended:** PD-1's and PD-3's "stays open and homed to `W-END` until the gate": the gate is now closed. PD-1 to PD-4 text is unchanged.

## PD-6: One more plugin fix wave W-E7 for F-141 only

- **Date and owner:** 2026-11-22, owner request ("run one more plugin fix wave") plus architect-accepted (strong).
- **Decision:** one light fix wave `W-E7` for F-141 only (the guardrail lane re-run on a warning FAIL, ticket TK-022). F-144 (#9446) and F-146 (#9451) are already fixed by wave W-D2 (commit 1e3e3d7, tickets TK-010 and TK-012 closed, no recurrence in 7 later waves). F-170 stays NOT A DEFECT per PD-2(b), and no rule that fixes lows early is added.
- **Rejected options:** a wave for the three fixed items; a fix-lows-early rule.
- **Made obsolete or amended:** none.

## PD-7: One more plugin fix wave W-E8 for the ledger findings still present

- **Date and owner:** 2026-11-22, owner request ("define one more fix wave to address remaining findings and defects", then "accepted") plus architect-accepted (strong).
- **Decision:** one more light fix wave `W-E8` for the ledger findings still present at HEAD: F-193, F-194 (two tickets) and a `plan.copyRules` addition (F-179). The other 16 candidate plugin defects were verified fixed at HEAD 70dc348 or closed by PD-2(c), and were marked resolved in the ledger. The planner-recall findings (F-55, F-158, F-160, F-179 to F-185, F-188 to F-190, F-192) need no plugin change: every miss since w45 was caught at plan stage for 0.24 to 1.42 USD, while a `plan.js` recall step would cost 20 to 40 USD for 0.5 to 1 USD saved per wave. They are handled in the orchestration skill.
- **Rejected options:** a `plan.js` recall step; more plan-brief rules in the plugin.
- **Made obsolete or amended:** none.

## PD-8: One more doc fix wave W-E9 for three audit lows

- **Date and owner:** 2026-11-22, owner request plus architect-accepted (strong).
- **Decision:** one light fix wave `W-E9` for the three doc and spec lows left open after W-E8: F-196 (ship-sdlc doc wording of the deferred Monitor rule), F-197 (ship-sdlc spec R92 and P-STEP-2 Acceptance lines, SKILL.md:278 spec citation) and F-198 (cost-tiers 60 s `--timeout` row). Doc and spec text only; the note `pr-step-gh-in-main-checkout` stays in the backlog.
- **Rejected options:** a wave that includes the gh-in-main-checkout note; leaving the lows to the next audit.
- **Made obsolete or amended:** none.

## PD-9: Light fix wave W-F1 for the proposed items (pr-sdlc gh refs, lane constant, ship citation)

- **Date and owner:** 2026-11-22, owner request ("collect proposed items into a wave and dispatch"); scope validated by an isolated Opus architect.
- **Decision:** one light fix wave `W-F1` for three proposed items: F-195 (pr-sdlc passes explicit `--base` and `--head` to `gh pr create` and names the branch in `gh pr edit`; the TODO note `pr-step-gh-in-main-checkout` is promoted into it), the deferred low of lean-w51 (a named constant for the `guardrail-compliance` rerun lane in `plan-critique.js`, no behaviour change) and the optional low of W-E8 (ship-sdlc SKILL.md item 3 cites `R-todowrite-visibility`). Patch bump, exec-only verification. F-183 is left out: it needs an owner decision between options and becomes its own later wave.
- **Rejected options:** adding F-183 to this wave; a `ship-step-pr` change that runs `gh` from the worktree instead of passing refs.
- **Made obsolete or amended:** the backlog placement of the note `pr-step-gh-in-main-checkout` in PD-8.

## PD-10: Light fix wave W-F2 for the remaining review lows

- **Date and owner:** 2026-11-25, owner request ("wrap remaining lows onto a wave and kick it off"); architect check 2026-11-25 (item 1 and item 3 valid, item 2 obsolete convention).
- **Decision:** one light fix wave `W-F2` for the two valid lows of the W-F1 review note `pr-gh-refs-review-lows`: the empty if-branch in `check-pr-gh-ref-sentinels.js` (BG-001, no behaviour change) and the `baseBranch` mention in the pr-sdlc update-mode quoting rule (TK-032). Patch bump, exec-only verification.
- **Rejected options:** changing the usage-error exit code from 2 to 1 (exit 2 is a documented convention, W-E3 and F-151); leaving the lows to the end audit.
- **Made obsolete or amended:** none.
