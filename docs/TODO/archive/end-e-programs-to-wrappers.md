# Convert the remaining inline `-e` programs of the exec suite to wrapper scripts

Owner decision 2026-11-21 (lean-w43 main session): convert the remaining inline `script_path: "-e"` programs of the exec suite into readable wrapper scripts, as part of END (W-END).

Background: W-F (PR #125) moved only the 48 programs of `ship-prepare-exec.yaml` into `tests/promptfoo/scripts/run-ship-prepare-{ledger,plan-fields,summary}.js` (planner decision D1 in `docs/archived/plans/2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure.md`, section "Decisions taken without the owner"). D1 listed the rest: `github-sdlc-exec.yaml` (29), `ship-hooks-exec.yaml` (24), `commit-prepare-exec.yaml` (23), `received-review-prepare-exec.yaml` (23), `plan-prepare-exec.yaml` (21), `plan-format-exec.yaml` (17), `review-prepare-exec.yaml` (9), `state-gc-migrate-exec.yaml` (7), `pr-prepare-exec.yaml` (6) and nine datasets with 1 to 4 each.

Recount at HEAD (`grep -c 'script_path: "-e"' tests/promptfoo/datasets/*.yaml`), 179 in 18 datasets, as planning counted: github-sdlc-exec 29, ship-hooks-exec 24, commit-prepare-exec 23, received-review-prepare-exec 23, plan-prepare-exec 21, plan-format-exec 17, review-prepare-exec 9, state-gc-migrate-exec 7, pr-prepare-exec 6, execute-plan-sdlc-overflow-exec 4, execute-prepare-exec 4, script-runner-stub-bin-exec 3, execute-plan-sdlc-context-producer-exec 2, jira-sdlc-exec 2, sdlc-script-resolution-exec 2, fixture-guard-exec 1, review-consolidate-exec 1, session-map-exec 1. Total 179.

Acceptance:

- No dataset keeps a `script_path: "-e"` case.
- Wrappers print byte-identical output, so assertions stay unchanged.
- No case or assertion is lost against the coverage baseline.
- The exec suite passes.

Sizing: by the usual plan bounds; it may need more than one fix wave.

Source: owner decision 2026-11-21, lean-w43 main session
