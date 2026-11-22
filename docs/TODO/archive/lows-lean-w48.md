# Deferred lows of lean-w48 (unit W-E4, PR #135, merge 1432562)

> ARCHIVED / IMPLEMENTED — owner sign-off 2026-11-22 (PD-5), PR #142

Source: the ship report and the review of PR #135 (wave lean-w48).

| Severity | Path:line | Title | Text | Wave/PR |
|---|---|---|---|---|
| low | tests/promptfoo/scripts/run-commit-prepare-case.js:68 | Repo-root-not-found exits 1, but script errors must exit 2 | (review round 1 finding) | lean-w48/PR #135 | — NOT A DEFECT per PD-4
| low | tests/promptfoo/scripts/run-commit-prepare-case.js:101 | prepare() parses stdout without handling a failed spawn | (review round 1 finding) | lean-w48/PR #135 | — FIXED by W-E6 (PR #140, 71bb076, Task 5)
| low | tests/promptfoo/scripts/run-ship-hooks-case.js:349 | w25-no-git-fallback leaks its nogit- temp dir on every run | (review round 1 finding) | lean-w48/PR #135 | — FIXED by W-E6 (PR #140, 71bb076, Task 5)
| low | tests/promptfoo/datasets/ship-hooks-exec.yaml:562-565 | Stale comment on the claimSession implicit-resume case | still says the claim and spawn are in "the same expression below" and "a separate script_args", wrong after the move to run-ship-hooks-case.js; the case must write the state file right before it spawns ship.js because resume.fresh is an mtime check (plan validator finding, not in Task 2) | lean-w48/PR #135 | — FIXED by W-E6 (PR #140, 71bb076, Task 5)
