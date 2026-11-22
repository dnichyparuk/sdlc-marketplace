# Deferred lows of lean-w43 (unit W-F, PR #125, merge bb03139)

Source: the ship report and the review of PR #125 (wave lean-w43).

| Severity | Path:line | Title | Text | Wave/PR |
|---|---|---|---|---|
| low | tests/promptfoo/scripts/run-ship-prepare-plan-fields.js:109-114 | inTempDir leaks its temp dir when the body throws | inTempDir calls body(tmpDir) and only then runs fs.rmSync, with no try/finally; readEnvelope throws when ship.js crashes or prints nothing, so the temp dir is left behind (a second review lane reported the same at :109-114) | lean-w43/PR #125 — FIXED by W-E3 (PR #133, d128590, Task 2) |
| low | docs/specs/ship-sdlc.md:246 | R78 acceptance points ship-summary-commits (a) at the wrong split dataset | The changed R78 acceptance line says ship-summary-commits (a) and (b) are in ship-stepper-flows-exec.yaml; only (b) and (c) are there (lines 373 and 386) | lean-w43/PR #125 — FIXED by W-E2 (PR #131, 25c3ffc, Task 1) |
| low | tests/promptfoo/fixtures-fs/version-no-tags/setup.sh:11 | New fixtures write deprecated .claude/sdlc.json instead of .sdlc/config.json | version-no-tags and version-invalid-semver (setup.sh :11 and :9) create .claude/sdlc.json, which lib/config.js treats as a deprecated fallback with a stderr deprecation warning | lean-w43/PR #125 — FIXED by W-E3 (PR #133, d128590, Task 7) |
| low | tests/promptfoo/scripts/run-jira-cache.js:57 | Temp dir leaks if the wrapper throws before cleanup | (no body) | lean-w43/PR #125 — FIXED by W-E3 (PR #133, d128590, Task 2) |
| low | tests/promptfoo/scripts/run-ship-prepare-ledger.js:63 | Repo-root-not-found exits 1 instead of 2 (script error) | (no body) | lean-w43/PR #125 — NOT A DEFECT per docs/archived/plans/2026-11-21-w-e3-test-tooling-hygiene.md Deviations (item 6a: :63 is the missing-repo-root runtime exit 1, usage already exits 2, sibling wrappers use the same split) |

## Process finding (plugin defect, low)

- low | plan-sdlc plan.copyRules | a spec edit that only changes acceptance file names still requires the skill's user doc, its site copy and all companions as check-only Files entries (8 in W-F Task 11), costing about two blocking plan-critique rounds | lean-w43 ledger F-176 — NOT A DEFECT per PD-2(c)
- low | execute-plan-sdlc wave-runner | the wave-4 WAVE_SUMMARY reported Task 10 (Complex split) FAILED/TIMEOUT although its worker finished with a passing eval; a false TIMEOUT can trigger needless retries | lean-w43 ledger F-177 — FIXED by W-E1 (PR #129, bb344de, Task 8)
