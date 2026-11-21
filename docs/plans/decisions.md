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
