# END audit: recover the text of counts-only deferred lows

Owner request 2026-11-19 (lean-w40): add to the END audit a step to recover the text of the counts-only deferred lows.

- Goal: before the END audit re-checks the lows, recover title, file:line and body of every deferred low that the ledger holds only as a count (`ledger.js backlog`: "N deferred finding(s) without titles (counts-only review runs)").
- Known at 2026-11-19: 10 of 25 — lean-w34 (PR #111) 4, lean-w35 (PR #112) 1, lean-w36 (PR #113) 2, lean-w39 (PR #117) 3; add any later wave's counts-only rows from backlog at END time (from skill PR #25 on, new waves keep the text).
- Sources, cheapest first: (1) the ship/fix session transcripts named by the waves' ship cost-row notes (sid=...) — the review-orchestrator dimension outputs of each round hold the full finding text; (2) .sdlc/orchestration/review-archive/ (final summaries only); (3) last resort: re-run review-sdlc on the PR's round commit range.
- Output: append the recovered entries to the wave's docs/TODO/lows-<wave>.md (or a new one for w39 if absent) so the END audit's "re-check every entry of the homed lows notes" covers them; any low not recoverable is listed as NOT RECOVERED with its wave, round and severity.
- Order: an END step before the audit brief is built (brief.js audit context-file).
