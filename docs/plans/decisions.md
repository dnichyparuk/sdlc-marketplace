# Programme decisions

Append-only. The log wins over the text of a plan.

## PD-1: Deferred lows of waves H1 to F go to the END gate

- **Date and owner:** 2026-11-19, owner (lows ledger by the architect, strong, accepted).
- **Decision:** this programme only, not a skill rule. Every deferred review low of waves H1 to F goes to one TODO note per wave, `docs/TODO/lows-<wave>.md` (severity, path:line, title, one-line text, wave/PR), homed to the gate unit `W-END`. No per-wave low batches. The END audit gets every note as context and re-checks each row on HEAD (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap. No post-merge audit and no backlog clearing before END.
- **Rejected options:** per-wave low batches (overridden for H1 to F); one file `docs/plans/programme-lows.md`; a ticket or a TODO note per low.
- **Made obsolete:** the per-wave backlog batching for waves H1 to F; the untracked `.sdlc/orchestration/programme-lows.md` once wave L merges (its rows are in `docs/TODO/lows-lean-w34.md`, `lows-lean-w35.md` and `lows-lean-w36.md`).
