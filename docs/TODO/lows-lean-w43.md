# Deferred lows of lean-w43 (unit W-F, PR #125, merge bb03139)

Source: the ship report and the review of PR #125 (wave lean-w43).

| Severity | Path:line | Title | Text | Wave/PR |
|---|---|---|---|---|
| low | tests/promptfoo/scripts/run-ship-prepare-plan-fields.js:622 | inTempDir leaks its temp dir when the body throws | inTempDir calls body(tmpDir) and only then runs fs.rmSync, with no try/finally; readEnvelope throws when ship.js crashes or prints nothing, so the temp dir is left behind (a second review lane reported the same at :622) | lean-w43/PR #125 |
| low | docs/specs/ship-sdlc.md:246 | R78 acceptance points ship-summary-commits (a) at the wrong split dataset | The changed R78 acceptance line says ship-summary-commits (a) and (b) are in ship-stepper-flows-exec.yaml; only (b) and (c) are there (lines 373 and 386) | lean-w43/PR #125 |
| low | tests/promptfoo/fixtures-fs/version-no-tags/setup.sh:11 | New fixtures write deprecated .claude/sdlc.json instead of .sdlc/config.json | version-no-tags and version-invalid-semver (setup.sh :11 and :9) create .claude/sdlc.json, which lib/config.js treats as a deprecated fallback with a stderr deprecation warning | lean-w43/PR #125 |
| low | tests/promptfoo/scripts/run-jira-cache.js:57 | Temp dir leaks if the wrapper throws before cleanup | (no body) | lean-w43/PR #125 |
| low | tests/promptfoo/scripts/run-ship-prepare-ledger.js:63 | Repo-root-not-found exits 1 instead of 2 (script error) | (no body) | lean-w43/PR #125 |

## Process finding (plugin defect, low)

- low | plan-sdlc plan.copyRules | a spec edit that only changes acceptance file names still requires the skill's user doc, its site copy and all companions as check-only Files entries (8 in W-F Task 11), costing about two blocking plan-critique rounds | lean-w43 ledger F-176
