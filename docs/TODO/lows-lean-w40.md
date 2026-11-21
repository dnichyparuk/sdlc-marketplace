# Deferred lows: lean-w40 (PR #119)

Deferred review lows of lean-w40, homed to the END gate `W-END` (decision PD-1 in `docs/plans/decisions.md`). This programme only.

- low | tests/promptfoo/scripts/run-review-plugin-version.js:35 (also :34) | Duplicated plugin.json read, inline require('fs'), unguarded JSON.parse | The same plugin.json path build and `JSON.parse(require('fs').readFileSync(...)).version` appears here and in run-received-review-manifest-fields.js (line 130). If plugin.json is missing or malformed… | lean-w40/PR #119
- low | plugins/sdlc-utilities/scripts/skill/plan.js:489 (also :490; docs/specs/plan-sdlc.md:215) | --no-guardrails skips the --critique-dir readability usage check | Spec R67(f) says that a --critique-dir which is not a readable directory is a usage error (exit 1). With --no-guardrails, runSplice sets latest = null without calling latestGuardrailMerged, so it nev… | lean-w40/PR #119
- low | docs/specs/plan-sdlc.md:413 | Appendix history row omits E9, which this changeset amended | (no body) | lean-w40/PR #119

Note: the E9 splice and ENOTDIR entries were fixed in fix rounds 7c96b1e and cf713f5; the END audit re-check marks them.
