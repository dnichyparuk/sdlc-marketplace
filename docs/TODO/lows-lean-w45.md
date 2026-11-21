# Deferred lows of lean-w45 (unit W-E1, PR #129, merge bb344de)

Source: the ship report and the review of PR #129 (wave lean-w45).

| Severity | Path:line | Title | Text | Wave/PR |
|---|---|---|---|---|
| low | tests/promptfoo/scripts/run-wave-progress-parallel.js:62 | Parent failure path has no catch: unhandled rejection, not exit code 2 | The Promise.all(...).then(...) callback uses try/finally with no catch. If readProgress throws (for example the marker is missing because every child failed), the error becomes an unhandled promise rejection instead of a clean exit. (duplicate report at :251 merged here) | lean-w45/PR #129 |
| low | plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:557 | Step 12 summary gains a deferred line not shown in the reference doc | The new line `D comments deferred (needs discussion or below threshold)` is not in the example of docs/skills/received-review-sdlc.md:247 (and its site copy); the example already omits the K line. (duplicate report merged here) | lean-w45/PR #129 |
| low | plugins/sdlc-utilities/scripts/lib/wave-progress.js:65 | Stale-lock break and release remove a lock another writer now holds | withMarkerLock removes the lock after LOCK_WAIT_MS and in finally without an owner check; a writer that was paused can remove the lock of another writer. This is an accepted gap of spec R-WAVE-LIVENESS (threat model) but has no owner token. | lean-w45/PR #129 |
| low | plugins/sdlc-utilities/scripts/skill/plan.js:489 | Critique dir is read twice; the bare readCritiqueDir call discards its result | runSplice calls readCritiqueDir only for its error and then latestGuardrailMerged reads the directory again. | lean-w45/PR #129 |
| low | plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md:104 and SKILL.md direct mode | Stale 60 s timeout rationale | The step 4 timeout rationale ("at most 60 once some workers returned") still reflects the old wait target after the wave wait lists only unreturned workers. (ship report, not in the review rows) | lean-w45/PR #129 |
| low | tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml:196-205 | The R-subagent-brief case now pins only the shared tail of the plugin-root sentence for the commit, pr and execute agents | The first half of the old sentence is no longer pinned there. (commit validator, minor) | lean-w45/PR #129 |
