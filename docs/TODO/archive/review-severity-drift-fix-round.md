# Review severity drifts between the fix-round review and the final check

Plugin process defect (lean ledger F-170). In lean-w40 the fix-round review-sdlc on f2522a0..7c96b1e rated "E9 omits the Gate B splice" low, while the ship `--resume` final check (R104) on the same range rated it medium (spec-compliance), which forced a second fix round.

Proposal: have the R104 re-check reuse the fix-round review's verdict for an unchanged range, or make ship-sdlc's fix-round review run at the same threshold and dimension set as the final check.
