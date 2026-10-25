# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.32.0] - 2026-10-25

### Added
- feat: new prepare script `scripts/skill/execute.js` (W5.2) resolves execute-plan-sdlc's flags, config, quality tier, plan, classification floor, waves, guardrails, workspace, resume state and OpenSpec data in one call, and the shared parser `scripts/lib/plan-parse.js` (moved out of `ci/validate-plan-format.js`, whose behaviour is unchanged) feeds it; `state/execute.js wave-start` now returns the wave `manifest` (`--manifest-json`) and execute-plan-sdlc Step 1 reads the prepare output instead of running `node -e` blocks (#9013)
- feat: new `execute` keys in `.sdlc/config.json`, all in the schema: `dispatchBudget`, `commitWaves`, `waveTimeout`, `waveInterval`, `rebase`, `waveRunnerMinPlanTasks` and `specReviewer` (next to the existing `guardrails`); precedence is CLI, then `execute.*`, then the legacy ship keys, then the default (#9013)
- feat: standalone execute-plan-sdlc now runs the config-version migration check like the other skills; `--skip-config-check` or `SDLC_SKIP_CONFIG_CHECK=1` skips it (#9013)

### Changed
- feat: under `--auto` with no `--quality`, execute-plan-sdlc uses the tier from the resumed state, else `balanced`, and prints `Quality tier: balanced (default under --auto)` (Q16); under `--auto` an invalid `--quality` is the error `invalidQuality`; interactive runs are unchanged (#9013)
- feat: behaviour change for ship users: ship-sdlc no longer forwards the execute tunables (`--wave-timeout`, `--wave-interval`, `--commit-waves`, `--rebase`); it passes execute only `--plan`, `--auto` and `--quality`; execute reads its own `execute.*` config, with `ship.executeWaveTimeout` and `ship.executeWaveInterval` in `.sdlc/local.json` kept as deprecated fallbacks; setup no longer prompts for the wave tunables (#9013)
- feat: execute-plan-sdlc now rejects unknown flags (`invalidFlag`) and stops at prepare on a plan with a missing or invalid `**Complexity:**` or `**Risk:**` or with one task or fewer (`planParseError`); `invalidFlag`, `planParseError` and (under `--auto`) `invalidQuality` stop the run (#9013)
- docs: `docs/specs/execute-plan-sdlc.md` gains the Prepare script contract (P1-P9, C13-C16) and the Q16 rewording; `docs/specs/ship-sdlc.md` A3 follows; `docs/cost-tiers.md` and `scripts/README.md` name `skill/execute.js` (#9013)
- docs: user docs for execute and ship are updated in a later release (W5.5) (#9013)

### Removed
- tests: the behavioural case in `ship-sdlc.yaml` that asserted ship's forwarding of commit-waves to execute is deleted with its fixture, because the forwarding is gone; exec coverage replaces it (not-forwarded cases in `ship-prepare-exec.yaml`); a validated behavioural replacement is follow-up #9159 (#9013)

## [0.31.0] - 2026-10-22

### Added
- feat: new `scripts/ci/session-cost.js` reads Claude Code session transcripts (main transcripts and `subagents/*.jsonl`) for a tag-to-sessions map and prices them per model: one usage per message id (largest token sum), `<synthetic>` messages dropped, 5m and 1h cache writes in separate columns, USD in integer pico-dollars, optional per-model price `tiers` chosen per message by prompt size, an Opus 5.5 `fast` block and a `geoMultiplier` of `us: 1.1`; models and modifiers with no published price go to `unpriced` with a reason and counts, `aux-` tags stay out of `total`, and output tokens are labelled a floor (#9011)
- feat: new `scripts/ci/wave-metrics.js` reads every `m*/metrics.json` (schema `sdlc-wave-metrics-1`) and prints one markdown row per milestone with the 16 summary columns plus `Cost USD`; a field that holds `not recorded` gives the `<sum> (<k> of <n> waves)` marker and nothing is estimated (#9011)
- feat: new `scripts/ci/session-prices.json` is the bundled price table; every figure is copied from https://platform.claude.com/docs/en/about-claude/pricing, retrieved 2026-10-22, with that URL and date stored in the file (#9011)
- tests: new `session-cost-exec.yaml` dataset with 20 exec cases (fixtures under `fixtures-fs/session-cost/` and `fixtures-fs/wave-metrics/`), registered in `promptfooconfig-exec.yaml`; `scripts/README.md` lists both scripts (#9011)

## [0.30.0] - 2026-10-21

### Changed
- feat: new local eval smoke suite under `plugins/sdlc-utilities/evals/` for `claude plugin eval`: seven cases (`commit-auto`, `review-dry-run`, `ship-dry-run`, `execute-two-task`, `ship-auto-commit-review`, `ship-review-zero-findings`, `crlf-checkout`), each a `prompt.md` and a `case.yaml` with file-based graders (state files and git, not text), built from throwaway fixture repos by `evals/_fixture/build-fixture-repo.js` and per-case `scaffold.sh`; the `ship-review-zero-findings` case checks the review-summary file for the zero-findings gate (#9129)
- feat: `plugin.json` declares the suite with the new `experimental.evals` field (`"evals": "evals"`), and `schemas/plugin.schema.json` is extended to accept `experimental.evals`; `.gitignore` ignores `plugins/sdlc-utilities/evals/results/`
- docs: `tests/promptfoo/README.md` gains an "Eval smoke suite (local, pre-release)" section (invocation, defaults, cost warning, never in CI)
- tests: `claude plugin eval` is not wired into CI; the two checks (`commit-auto`, `ship-review-zero-findings`) ran directly in headless `claude -p` runs graded by their own graders, because the `claude plugin eval` harness run waits for a host with a sandbox (bubblewrap and socat; #9150)

## [0.29.1] - 2026-10-21

### Changed
- fix: execute's state cleanup (`state/execute.js cleanup`) now runs the completeness check itself and refuses to delete an incomplete state: on exit 65 (planned tasks unaccounted) or 2 (no `plannedTaskIds`) it keeps the state file and exits with that code; ship-sdlc's completeness gate runs only when an execute state file exists, otherwise the execute step is recorded completed with `completenessGate: "no-execute-state"`, so ship no longer halts after every successful execute (W8.22, #9123)
- fix: commit-sdlc's `--auto` path: a subject-gate rejection (exit 1 or 2) now stops without a prompt and without committing; the message reaches git, the subject gate and the link check only through a message file (`git commit -F`), never through a shell argument, so quotes, `$()` and backticks in a message are literal (W8.1)
- fix: `post-tool-validate` runs the plan validator with an argv list (`execFileSync`), so a plan file name holding `$()` or backticks runs no shell (W8.21, #9122)
- docs: `docs/specs/commit-sdlc.md` is restructured into the ten contract sections (history in the appendix, ids unchanged), with C14 and E8 added (W3.5); the ship and execute specs and the ship and execute skill pages describe the verifying cleanup and the scoped completeness gate
- tests: new `run-execute-cleanup-verify.js` cases (four `cleanup-verify` cases), ship-step case (u4) and a reworked (u2), `commit-literal-message` and `post-tool-validate-argv` cases

## [0.29.0] - 2026-10-20

### Changed
- feat: new `scripts/skill/openspec-step.js` (`detect`, `flip`, `validate`, `archive`) owns every OpenSpec action of the pipeline, one JSON line each; ship-sdlc emits real commands for `verify_openspec` and `archive_openspec` and asks the archive question through `llm_decision`, and the model reads the procedure from the new `skills/ship-sdlc/openspec-steps.md` only when one of those steps is current (`reference.md` no longer carries OpenSpec text)
- feat: execute-plan-sdlc flips OpenSpec checkboxes through `openspec-step.js flip`, plan-sdlc reads detection through `openspec-step.js detect`, and `pr.js` reports an `openspec` field (`detected`, `changeName`, `proposalPath`, `designPath`) that pr-sdlc uses instead of Glob calls
- docs: `docs/specs/pr-sdlc.md` is restructured into the ten contract sections (history in the appendix, ids unchanged); the ship, execute and plan specs and the ship skill page describe the OpenSpec script
- tests: new `openspec-step-exec.yaml` (18 cases) plus ten `ship-step` and two `pr-prepare` cases (#9006)

## [0.28.0] - 2026-10-20

### Changed
- feat: `review-orchestrator` writes `review-summary.json` (`schemas/review-summary.schema.json`: `verdict`, `counts`, `dimensions`) beside the review comment, `skill/review.js` emits `summary_copy_path` (main worktree, `resolveStateDir()`), and review-sdlc copies the file to `.sdlc/execution/review-summary-<branch-slug>.json` before it removes its temp dir (#9005)
- feat: ship-sdlc's `review_gate` step reads the counts in that summary (new `ship.js review-gate --summary --threshold` and the in-process gate share one function) instead of parsing the verdict text; a missing, stale or malformed summary dispatches received-review-sdlc with a warning, never approves (#9005)
- feat: `ship.js verify-side-effect` and `--after` verify the `commit` step (artifact sha is an existing commit and HEAD) and the `pr` step (`gh pr view` confirms the URL is OPEN or MERGED), next to the existing `version` tag check (#9005)
- docs: `docs/specs/review-sdlc.md` is restructured into the contract sections (history in the appendix, ids unchanged); `docs/specs/ship-sdlc.md` R6 and R-b3 and `docs/skills/review-sdlc.md` describe the summary and its copy path (#9005)
- tests: new `ship-review-gate-exec.yaml`, verify-side-effect cases for commit and pr, a `summary_copy_path` case, and the review_gate cases re-seeded to read a summary file (#9005)

## [0.27.0] - 2026-10-20

### Changed
- feat: every `ship-sdlc` sub-skill step dispatches through its own agent file, `agents/ship-step-<step>.md` (execute, commit, review, received-review, version, pr), which pins `model`, `effort` and the preloaded skill; `skill/ship.js` reads model and effort from those files and emits `agent` on each dispatch step, and SKILL.md Step 5 dispatches with `subagent_type: step.data.agent` only (#9003)
- feat: because a forked sub-skill cannot ask the user, interactive runs now ask in the main context before dispatch: `confirm_commit`, `confirm_commit_fixes`, `confirm_version` and `confirm_pr` (yes, skip or cancel), `execute_tier` when `--quality` is absent, `execute_state` (resume or restart) and `execute_gate` for a high-risk question; the forked sub-skill then runs with `--auto`; none of these are emitted under `--auto` (#9003)
- feat: a question a sub-skill cannot ask comes back as `output.pendingQuestion`; ship carries a high-risk `yes` back to execute as `--resume --auto` (this approves every later high-risk gate in that run) and otherwise stops with the state kept and the commands to continue; `execute_handoff` records an execute run finished outside the pipeline, with `source: "user-attested"` when no execute state file exists (#9003)
- changed: content previews (commit message, changelog draft, PR body, received-review plan) are not shown in interactive mode, and the `--auto` flag is now always part of the computed args of commit, commit-fixes, received-review, version and pr (#9003)
- docs: `docs/specs/ship-sdlc.md` and `docs/specs/execute-plan-sdlc.md` state the per-step dispatch, the tier rule (ship asks), the pending-question stop and the P-TRANS-1 rows; `docs/cost-tiers.md` lists the six agents and the S1 = NO per-step shape; `docs/architecture.md`, `docs/skill-best-practices.md` and `docs/skills/ship-sdlc.md` describe per-step agents (#9003)
- tests: 28 new exec cases for the agent fields, consent, tier, execute-state, pending-question and handoff branches, and a cost-tier fixture agent with `effort:` (#9003)
- changed: the `review_gate` prompt names received-review-sdlc and its computed args and says it runs unattended without showing its plan; its `yes` is received-review's consent, so `confirm_received_review` is emitted only when `review_gate` did not ask (#9003)
- fix: return item (4) of the six `agents/ship-step-*.md` asks for the pending question and its answer options, one short keyword each, so `output.pendingQuestion` carries options; `validPendingQuestion` also accepts `options: []`, which takes the pending-question stop path (the question plus both commands) instead of a plain failure (#9003)
- fix: `execute_gate` takes an answer only on an exact match with an offered option, so free text such as "yes, but only task 3" takes the stop path and never `--resume --auto` (#9003)
- docs: `docs/specs/execute-plan-sdlc.md` A2 matches the ship-asks tier rule: `--quality` is forwarded when passed to ship or chosen at `execute_tier`, and ship never invents a tier (#9003)
- tests: exec cases `pq7` (no options) and `pq8` (free-text answer), and `es2` now seeds a second branch's execute state file and asserts it survives a restart (#9003)

## [0.26.0] - 2026-10-19

### Changed
- feat: `ship-sdlc` adopts the step-emitter — `skill/ship.js` sequences the pipeline (initial call plus `--after <step_id> --result-file <f> --state <ledger>` calls) and emits `status/step/llm_decision/state_file/progress/ext` beside the existing prepare keys; SKILL.md Step 5 shrinks to a short loop, the judgment procedures move to `reference.md`, and branch derivation, rebase, staging and the review-gate threshold run in the script (#9001)
- feat: the ship ledger gains `history`, `currentStep` and the frozen `flags.planFile`, `flags.openspecContext`, `flags.sources` and optional `flags.ttlDays`; steps are marked `in_progress` when emitted; `state/ship.js` exports `startStepCore` and `completeStepCore` (#9001)
- fix: the execute-step completeness gate, `--resume` forwarding to execute and per-task execute todos now run in `ship.js`; a completeness failure exits with the completeness script's code (#9001)
- changed: `rebase` is not emitted when `flags.rebase` is `skip` (still recorded as skipped); the found-but-not-resumed worktree warning now says the earlier ledger was replaced (#9001)
- docs: `docs/specs/ship-sdlc.md` gets the P-TRANS-1 transition table and amended P-STEP-3, R70, R-pause, R6 and R-expected-branch-branch-derive (#9001)
- fix: `status: "done"` is routed on `ext.reason` (edit → the Step 4 edit path; cancel, paused and dry-run stop; otherwise the Step 6 report) (#9001)
- fix: the stale-state GC sweep that R38 requires on failure paths is restored — `ship.js` runs it before emitting a failure envelope, and the failed ledger is kept for `--resume` (#9001)
- fix: `ext.summary` is returned after `cleanup-pipeline` has deleted the ledger (the summary is persisted when `cleanup` is emitted and removed again on forced cleanup) (#9001)
- fix: the `rebase` step aborts a conflicted rebase (`git rebase --abort`) in every mode, and a rebase skipped under `flags.rebase=skip` is recorded in `progress.skipped` (#9001)
- changed: a failed `archive_openspec` or `verify_pipeline` result now halts the pipeline with `status: "error"` (R25, R-archive-sync-3, R45); `verify_openspec`, `await_remote_review` and `learnings_commit` stay non-fatal (#9001)
- docs: R37 and the R60 lifecycle follow the step-emitter branch order (checkout first, then the ledger migration in `--after branch_prepare`) (#9001)
- tests: 44 `ship-step: ` exec cases, a stepper fixture and wrapper, one new hooks case; the R37 rubric in `ship-sdlc.yaml` follows the same branch order (#9001)

## [0.25.3] - 2026-10-19

### Changed
- docs: `docs/specs/plan-sdlc.md` is restructured into the contract sections; all requirement ids stay as stable anchors, issue numbers and the withdrawn R17 move to the appendix, and model values leave the spec for `scripts/skill/plan.js` and `docs/cost-tiers.md` §5 (#23)

## [0.25.2] - 2026-10-19

### Changed
- docs: `docs/specs/execute-plan-sdlc.md` is restructured into the contract sections; all requirement ids stay as stable anchors, issue numbers and the withdrawn R26 move to the appendix, tuning values (models per preset, wave-size cap table, escalation ladder) leave the spec for `docs/cost-tiers.md` §5 and `dispatch-budget.js`, and the step-emitter contract block is copied from the ship spec (#21)
- docs: `cost-tiers.md` gains the "Execute quality presets" table and records the spike S1 result under §7 (#21)
- tests: `execute-plan-sdlc.yaml` R41 descriptions cite `R41` instead of an issue number (#21)

## [0.25.1] - 2026-10-19

### Changed
- docs: `docs/specs/ship-sdlc.md` is restructured into the ten contract sections; all requirement ids stay as stable anchors, issue numbers and withdrawn entries move to the appendix, and tuning values (model, timeouts, defaults) leave the spec for `docs/cost-tiers.md` and the config schema (#19)
- tests: `ship-hooks-exec.yaml` descriptions cite `R71` instead of an issue number (#19)

## [0.25.0] - 2026-10-19

### Added
- ci: `validate-spec-shape.js` checks `docs/specs/*.md` against the contract shape (heading order, missing sections, issue numbers and withdrawn entries in the body, `**Model:**` header, duplicate ids) and that every `R` id cited by skill and agent files is defined in some spec; legacy specs warn on stderr until `--strict` (#17)
- tests: `validate-spec-shape-exec.yaml` dataset with clean and bad fixtures (#17)

### Changed
- docs: `spec-template.md` is contract-shaped (ten sections grouped by behaviour); `AGENTS.md` principle 1 and a new "Spec shape" bullet, `adding-skills.md` and `step-emitter-architecture.md` follow it (#17)
- docs: `cost-tiers.md` §6 states that tuning values (model, effort, timeouts, caps) live outside specs and need no spec update; the `spec-first` guardrail says so too; the spec-compliance dimension accepts id gaps listed under Withdrawn (#17)

## [0.24.0] - 2026-10-19

### Added
- ship-sdlc: `state/ship.js pause [--reason] [--state-file]` sets `paused` in the ship state; `pipelineAdvancing` reports not advancing while it is set, so both continuation hooks stay silent; `begin-step` and `--resume` clear it (R-pause, #15)
- ship-sdlc: prepare surfaces a Stop-hook cap exhaustion as a `warnings` entry and `resume.capExhausted`; `schemas/ship-state.schema.json` accepts `paused` (#15)
- hooks: `resolveHookContext` in `lib/state.js` and `mainWorktreeFromFs` in `lib/worktree.js` give the hooks a spawn-free state dir, branch and session id (#15)

### Changed
- hooks: `pipeline-continue.js` matches `Bash` only, exits before any git spawn when no ship state exists, and nudges once per step transition with factual wording (`.pipeline-nudge-<slug>.json`) (#15)
- hooks: `stop-plan-integrity.js` exits 2 with the warning on stderr when plan-integrity markers are missing and no longer scans the transcript or reads stdin (R20, R21, #15)
- hooks: `stop-pipeline-continue.js` never modifies the ship ledger; at cap exhaustion it writes `.stop-cap-exhausted-<slug>.json` and stays silent for that step (R-cap-recovery, #15)
- hooks: `session-start.js` sweeps `.pipeline-nudge-*` and `.stop-cap-exhausted-*` sidecars with the existing 24h stale sweep (#15)

### Removed
- hooks: the `PreCompact` hook, `pre-compact-save.js`, `stop-state-save.js` and the compact-recovery sidecar and its consumption; recovery relies on the ledger and the SessionStart banner (#15)

## [0.23.3] - 2026-10-19

### Fixed
- plan-sdlc: `plan-explore.js` reads the prompt from stdin via fd 0 instead of `/dev/stdin`, which fails with ENXIO on Linux when stdin is a socketpair (#13)

### Changed
- promptfoo fixtures: the seven gitlink fixtures (`plan-integrity-*`, `project-plan-integrity`, `project-skill-skip-via-env`) are real fixtures built by `setup.sh`; the ship v3/v4 fixtures write their configs from `setup.sh`; `project-ship-openspec-ready/.sdlc/.gitignore` is committed (#13)

## [0.23.2] - 2026-10-19

### Changed
- commit-sdlc, version-sdlc, pr-sdlc, error-report-sdlc: skills run on the session model (`model: inherit`); `docs/cost-tiers.md` rows and the version and pr spec headers match (#11)
- error-report-sdlc: `error-report-prepare.js` puts the template text and the priority in the manifest, the orchestrator returns `{title, body, priority}`, and `REFERENCE.md` is inlined into `SKILL.md`; callers and `harden-surfaces.js` point at `SKILL.md` (#11)
- commit-sdlc: Step 5 subject gate always runs and rejects `wip:` / `wip(execute):` subjects (exit 2); exit code 3 (expected-branch guard) is documented and Step 0.5 is removed; the argument-hint lists `--no-squash-wip` and `--expected-branch` (#11)
- commit, error-report, harden orchestrators: `effort: low` and plain output instructions; `docs/cost-tiers.md` §4 gets an Effort column (#11)
- verify-pipeline-sdlc: plain wording for the proposal rule without `--auto` (#11)
- version, jira, pr, commit skills: shorter descriptions and aligned argument-hints (#11)

### Removed
- commit-sdlc: the false claims that a Step 2 reminder and a `commit.js` check enforce the no-`wip:` subject rule, and the "skip the critique" DO NOT bullet (#11)

## [0.23.1] - 2026-10-19

### Added
- ship-sdlc: sub-skill dispatch brief keeps approval prompts without `--auto` (`R-subagent-brief`); Step 5 prompting rule per `--auto` mode (#9)
- verify-pipeline-sdlc: re-run the failed check before emitting `fix-applied` (#9)
- execute-plan-sdlc: workers run a real check before reporting done (#9)

### Changed
- ship-sdlc: `received-review` and `version` steps do not pause under `--auto` (R20); the audit table, R7 and the docs list `execute-plan-sdlc` as an `--auto`-forwarded sub-skill (#9)
- ship-sdlc: `state-format.md` examples regenerated from a real `flags` write; `config-format.md` and `entry-modes.md` drop the removed `workspace`, `--preset` and `--skip` text (#9)
- execute-plan-sdlc: failed tasks get FAILED status and the batch continues; the wave-summary parse uses a temp file (#9)

### Removed
- ship-sdlc: worktree-mode text, the legacy `start`/`complete` state commands and stub sections (#9)
- execute-plan-sdlc: the "paste the full task text", `--run-id`, `attempts` array, compaction and removed-hook text (#9)

## [0.23.0] - 2026-10-19

### Added
- execute-plan-sdlc: `dispatch-budget.js` sizes waves for 1M-context models (Haiku capped at 100K) and accepts a per-model `execute.dispatchBudget` override in the config schema (#6)
- docs: `docs/cost-tiers.md` §7 records the M1 usage baseline (#6)

### Fixed
- hooks: `hooks.json` timeouts are now in seconds, as Claude Code reads them (#6)
- hooks: `block-askuserquestion-auto` deny reason is a plain statement (#6)

### Removed
- plan-sdlc, ship-sdlc, execute-plan-sdlc: the dead context-heaviness advisory path (`context-advisory.js`, `plan-handoff-advisory.js`, `contextAdvisory` ship output field) (#6)

## [0.22.1] - 2026-10-18

### Fixed
- prepare scripts: manifests are now written to `.sdlc/execution/out/` (falling back to the system temp dir outside git) and pruned on write, so the Step 0 hand-off works across Bash calls; every `trap … EXIT` cleanup is removed from the skills (#4)
- validators: frontmatter parsing, `validate-cost-tiers.js` and `session-start.js` now accept CRLF line endings; `docs/cost-tiers.md` is reconciled with agent and skill frontmatter (#4)
- validate-plugin-consistency: rules 2-5 now check the real prepare-script contract and rule 11 (`no-exit-trap`) forbids `trap … EXIT` in skill bash blocks (#4)
- harden-sdlc: invokes `harden-prepare.js` inline (#4)

## [0.22.0] - 2026-10-18

### Added
- ship-sdlc, execute-plan-sdlc: usage accounting recorded in ship and execute state, enabled with the new `--usage` flag (#2)

### Fixed
- ship-sdlc: addressed review findings in `--usage` accounting (#2)

## [0.21.29] - 2026-09-05

### Added
- plan-sdlc: gate option 2 now generates OpenSpec artifacts autonomously instead of requiring manual completion
- plan-sdlc: Step 5/6 gates re-dispatch automatically when material changes occur (task count, deviations, or file set change), covering the full set of review-defined trigger conditions; `--auto` suppresses re-dispatch prompts (#523)

## [0.21.28] - 2026-09-04

### Fixed
- git-lib: raised the exec buffer limit from Node's 1MB default to 50MB and surface a clear error when a command still exceeds it, instead of silently truncating large diffs and logs (#522)

## [0.21.27] - 2026-08-28

### Added
- review-sdlc: common review dimension prompt — shared instructions applied consistently across all review dimensions instead of being defined per-dimension (#519)
- harden-sdlc: pass the common review dimension prompt through to review mirrors, keeping hardening reviews aligned with review-sdlc's dimension criteria (#519)

## [0.21.26] - 2026-08-24

### Fixed
- ship-sdlc: git-diff fallback for branch-to-change matching when branch name doesn't match the openspec change slug, and pre-archive task synchronization with interactive prompts for incomplete tasks (#492)
- received-review-sdlc: reinstate post-validation archive approval prompt for the all-tasks-done path, fix shell-injection pattern in commit step, add exit-code checks on inline node invocations, and move isArchived idempotence check ahead of I/O (#492)

## [0.21.25] - 2026-08-23

### Fixed
- ship-sdlc: worktree-gated resume and cap-exhaustion recovery — promote worktree mismatch from diagnostic to resume gate, re-read state before writes to prevent concurrent conflicts, locate steps by name instead of index for safe concurrent handling, delete sidecar on cap exhaustion so retry gets fresh budget (#503)
- plan-sdlc: `plan.js` template resolution now tries the workspace-relative path before the `~/.claude/plugins` find cascade, eliminating ~10s-per-call overhead that stalled the pre-push hook suite (#514)

### Changed
- harvest-learnings: reads from `.sdlc/learnings/log.md` (canonical path per #231 spec); legacy path triggers a one-version stderr deprecation fallback; `migrate-learnings-log.js` available for migration (#356)
- ship-sdlc: post-PR CI verification and remote-review awaiting are now opt-in via `ship.steps[]` entries (`verify-pipeline`, `await-remote-review`). Boolean flags and CLI flags removed; schema bumped v3 → v4 with auto-migration on first read.

## [0.21.24] - 2026-08-22

### Added
- plan-sdlc: configurable plan templates — per-project override via `.sdlc/plan-template.md` with a shipped default fallback — plus human-readable narrative sections using plain-language writing rules, exempt from the render-don't-narrate gate. Includes review-driven hardening: quoted template-flag path handling (fixes word-splitting on paths with spaces), template-resolution error handling, and clarified behavior for unknown template conditions (#515)

## [0.21.23] - 2026-08-22

### Added
- execute-plan-sdlc: sibling test convention checking — task classification/waving now accounts for matching sibling test files when planning changed source files, with spec and dataset coverage updated accordingly (#508)

## [0.21.22] - 2026-07-29

### Fixed
- execute-plan-sdlc: wave context contract hardening — deterministic wave-context producer with bounded schema, wall-clock liveness tracking, timeout enforcement, and two-level agent isolation (wave-runner → per-task dispatch); a follow-up pass resolves reviewer findings, including a path-traversal issue in `wave-progress.js`, timeout-verdict misattribution in the wave-runner template, and a fresh-run bootstrap-ordering bug (init running before wave-start) (#353, #463, #505, #506)

## [0.21.21] - 2026-07-28

### Fixed
- execute-plan-sdlc: plan-file resolution now requires an explicit `<plan-file-path>` argument — the conversation-context "Smart loading" fallback is removed; an in-progress resume is exempted only when its persisted state carries a matching plan path, and a resume hash mismatch now halts deterministically under `--auto` instead of prompting (#505)
- ship-sdlc: forward the skill's own arguments verbatim into `skill/ship.js` instead of hardcoding `--has-plan --auto`, restoring `--plan`/`--resume`/other flags that were previously dropped; also fixes a prepare-output variable name mismatch when reading the resolved plan file (#505)
- ship-sdlc + execute-plan-sdlc: gate pipeline resume and state recovery by session identity, so stale or cross-session state (including compact-recovery and linked-worktree scenarios) is no longer treated as the active session's (#505)

## [0.21.20] - 2026-07-28

### Fixed
- ship-sdlc: add a proceed-gate that blocks starting a pipeline step until earlier non-conditional steps are terminal-OK, and verify step completion against actual outcomes so a failed dispatch is recorded as `failed` rather than silently `completed`; the version step specifically is now confirmed complete only when its release tag actually lands in the active worktree, not from the agent's self-report (#501)
- ship-sdlc: scope pipeline state and the active-pipeline resume banner to the worktree that initialized them, so a sibling worktree's stale state no longer surfaces as the current session's; also fix `ship-todos` rendering so skipped/failed steps show an explicit label instead of collapsing to "pending" (#501)
- check-consistency: add invocation-verbatim and orchestrator-await-barrier lint rules (generalizing prior fixes) and apply them to `review-orchestrator.md` and `plan-sdlc`'s lens fan-out step (#501)

## [0.21.19] - 2026-07-24

### Fixed
- script-resolution: replace `find ~/.claude/plugins ... | sort -V | tail -1` resolver blocks with a hook-injected plugin-root path across ~86 skill invocations, avoiding false matches against fixture/marketplace-clone copies and enabling static Bash-permission allowlisting; also pins the `<PLUGIN_ROOT>` trust source to the SessionStart hook line explicitly to close a prompt-injection gap in skills that ingest untrusted text (#485)

## [0.21.18] - 2026-07-21

### Fixed
- worktree-cwd: route git operations (tags, commits, refs, remote state) through the active worktree instead of the project root, so `version-sdlc` and related tooling correctly detect commits, changed files, and tags when invoked from a linked worktree (#490)

## [0.21.17] - 2026-07-21

### Fixed
- orchestrator: enforce await barrier so all dispatched dimensions — including TRUNCATED ones — are awaited before proceeding, preventing premature continuation past incomplete parallel dispatch (#487)

## [0.21.16] - 2026-07-21

### Fixed
- plan-sdlc: clarified G19 render-don't-narrate gate reporting and split surface-vs-shape capping rules, tightening how format violations are reported (#488)

## [0.21.15] - 2026-06-27

### Fixed
- plan-sdlc: deterministic G18 floor and format gate — adds a PF7 deterministic floor to the G18 gate (backed by `validate-plan-format.js`) and a Step 6.6 format-validation gate so plan format is enforced by script rather than LLM judgement alone; PF9 adds a Verification Scorecard floor for Gate B on full-pipeline plans (#483)

## [0.21.14] - 2026-06-26

### Fixed
- version-sdlc: pre-release tag counter continuation — when a pre-release tag already exists (e.g. `v1.3.3-rc.1`), the counter now advances to the next available number (`rc.2`, `rc.3`, etc.) by scanning existing git tags; out-of-spec labels are rejected before RegExp construction (#479)

## [0.21.13] - 2026-06-25

### Added
- ship-sdlc: auto mode now blocks `AskUserQuestion` calls and documents the hook behavior, ensuring fully non-interactive pipeline runs (#477)

## [0.21.12] - 2026-06-24

### Fixed
- harden-sdlc: worktree-aware surface writes — when `/harden-sdlc` runs from a linked git worktree, approved review-dimension and Copilot-instruction edits now land in the active worktree (branch-tracked content) while guardrail/config edits stay in the main worktree's shared `.sdlc/` config (#474)

## [0.21.11] - 2026-06-21

### Fixed
- ship-sdlc: remove dangling `opsx:` namespace dispatch pattern from inline OpenSpec validation block (#461)
- ship-sdlc: harden OpenSpec validation invocation to prevent broken dispatch on inline execution (#461)

## [0.21.10] - 2026-06-18

### Added
- plan-sdlc: G20 gate demoting Description to optional Notes field, G21 gate enforcing self-contained code references, and Deviations & assumptions section (PF6) at plan top; expands content-coverage lane (#472)
- plan-sdlc: G19 render-don't-narrate gate promoted to blocking; Mermaid diagram support and code-ref enforcement added (#472)

## [0.21.9] - 2026-06-17

### Added
- plan-sdlc: G19 advisory gate enforcing concrete artifacts (not narrative prose) on tasks touching render-trigger surfaces (catalog #1–#8); non-blocking, warning severity (#470)
- version-sdlc: idempotency guard — skip release bump when HEAD is already tagged with a release tag, preventing duplicate releases (#468)

### Fixed
- review-sdlc: migrate review save path to `.sdlc/reviews/` directory and sanitize branch-derived filenames (#466)

## [0.21.7] - 2026-06-16

### Fixed
- review-sdlc: migrate review files to `.sdlc/reviews/` directory and sanitize branch-derived filenames to strip characters outside `[a-zA-Z0-9_-]`, fixing issues with branches like `feat/foo.bar` or `deps/update@2` (#466)

## [0.21.6] - 2026-06-15

### Fixed
- execute-plan-sdlc: harden nested-dispatch sentinel to prevent double-dispatching when running inside a subagent context; docs updated to reflect the new behavior (#463)

## [0.21.5] - 2026-06-15

### Fixed
- ship-sdlc: Restore workspace field-path read from `flags.workspace` (correct, per R60 spec) instead of `context.workspace` (non-existent field) (#451)

## [0.21.4] - 2026-06-14

### Added
- plan-sdlc: per-task `Contract:` block with type-aware decided shape (code/docs/openspec columns); G18 gate (content-coverage lane settlement/contract concreteness check) (#459)
- execute-plan-sdlc: verbatim consumption of Contract fields from task metadata (#459)

### Fixed
- execute-plan-sdlc: Contract extraction parsing guidance added; per-task fact sheet Contract field flow documented (#459)

## [0.21.3] - 2026-06-14

### Added
- sdlc: OpenSpec scans now route through the active worktree — plan, ship, and explore operations in linked worktrees detect their own OpenSpec changes instead of the main worktree's empty state (#457)

### Fixed
- openspec-scan-worktree: disabled GPG signing in test fixture to prevent CI failures when GPG signing is globally configured (#457)

## [0.21.1] - 2026-06-14

### Added
- ship-sdlc: WIP commit squashing — the pipeline now detects and squashes execute-plan-sdlc work-in-progress commits, allowing continuation to subsequent steps (#454)
- harden-sdlc: dimension-to-instructions generator for Copilot path-specific instructions (Step 5b, R45-R52) (#454)

### Fixed
- harden-sdlc: mirror gate clarified — "already exists" branch covers only manually pre-seeded mirrors; normal add-flow and strengthen proposals are excluded (#456)
- dimension-to-instructions: `readStdin` catch block now writes errors to stderr instead of silently swallowing them (#456)

## [0.21.0] - 2026-06-10

### Added
- ship-sdlc: workspace auto-detected from cwd and current branch — removed `--workspace`/`--branch`/`--tree` flags; six hooks deleted, reducing total hook count to 7
- ship-sdlc: `--auto` continuation broadened via `pipelineAdvancing()` predicate so the pipeline advances across steps in a single turn

### Fixed
- ship-sdlc: corrected stale `--branch` prose in execute-plan-sdlc docs and SKILL.md; added jira-sdlc DO NOT note reinforcing `AskUserQuestion` gate after hook removal

## [0.20.36] - 2026-06-08

### Added
- ship-sdlc: pipeline continuation — PostToolUse hook emits in-progress context, Stop hook blocks auto-run when a step is in progress, and begin-step/complete-step state subcommands atomically persist per-step progress for TodoWrite task rendering (#452)

## [0.20.35] - 2026-06-05

### Added
- ship-sdlc: worktree in-place guard — when ship is launched from inside a linked worktree with `--workspace worktree`, the mode automatically downgrades to continue and runs in place, making the manual "create worktree → write plan → ship" workflow work without explicit `--workspace continue` (#449)

## [0.20.34] - 2026-06-04

### Fixed
- review-sdlc: split review manifest into thin index and per-dimension slice files to bound orchestrator context on large changesets, preventing context overflow (#447)

## [0.20.33] - 2026-06-01

### Added
- plan-sdlc: opsx:verify methodology integration — Gate A intake audit (completeness/correctness/coherence checks before decomposition), Gate B verification scorecard (traceability matrix and Go/no-go verdict at plan audit), requirement inventory via openspec delta tracking, and verdict-to-action mapping (CRITICAL findings block decomposition) (#445)

## [0.20.32] - 2026-05-30

### Added
- ship-sdlc: progressive-disclosure pattern for context reduction — extracted cold sections (--init-config, --gc, --dry-run handlers, workspace isolation setup, error recovery, DO NOT, Gotchas, Learning Capture) into companion docs (entry-modes.md, workspace-worktree.md, reference.md)

### Fixed
- ship-sdlc: entry-modes failure guard for --init-config and --gc; spec companion file names enumerated in R-progressive-disclosure; skills-meta stale description corrected

### Changed
- ship-sdlc SKILL.md: reduced from ~1209 to ~992 lines; users read companion docs on-demand

## [0.20.31] - 2026-05-30

### Added
- verify-openspec step for ship-sdlc to validate OpenSpec changes during release workflow
- OpenSpec-Change trailer support for commit-sdlc integration

## [0.20.30] - 2026-05-29

### Fixed
- sdlc-utilities: raise guardrail description limit from 512 to 1024 characters (#438)
- sdlc-utilities: add Copilot login normalization for reviewer matching in awaited remote reviews (#439)

## [0.20.29] - 2026-05-25

### Fixed
- jira-sdlc: approval token hash mismatch validation with trailing-whitespace normalization (R21.1, R21.2) (#435)
- jira-sdlc: atomic-write diagnostic path for artifact verification (#435)
- ship-pipeline: agent isolation hook, task ID normalization, and planFile wiring (#434)

## [0.20.28] - 2026-05-25

### Fixed
- ship-pipeline: agent-isolation hook, task ID normalization, and planFile wiring (#434)
- execute-plan-sdlc: add EXPLICIT_PLAN_FILE for compaction-stable plan discovery (#435)

## [0.20.27] - 2026-05-25

### Added
- execute-plan-sdlc: hardened completeness gate — wave-runner context-overflow recovery with comprehensive budget and fact-sheet dispatch validation

### Fixed
- wave-runner: address context-overflow with dispatch budget, fact sheets, wave-split, and completeness checks (#432)
- received-review: completeness gate hardening and spec/doc sync (#432)

## [0.20.26] - 2026-05-24

### Added
- received-review: meta-analysis of evaluated findings clustered by hardening surface and target, with auto-dispatch to harden-sdlc for approved findings (#429)
- ship-sdlc: TodoWrite integration for real-time pipeline step visibility during release execution (#427)

## [0.20.25] - 2026-05-24

### Added
- ship-sdlc: TodoWrite integration for pipeline step visibility — surface each step and substep as tasks in the task tray during release execution for real-time progress tracking (#427)
- execute-plan-sdlc: task mirroring for plan waves — each wave's substeps are converted to TodoWrite tasks and synchronized during execution (#427)

### Fixed
- ship-sdlc: todo visibility substep refinement — resolved substeps are closed atomically when a step fails, ensuring accurate task-tray state (#427)

## [0.20.24] - 2026-05-23

### Added
- jira-sdlc: project-local template overrides migrate automatically from `.claude/jira-templates/` to `.sdlc/jira-templates/` on first use; one-shot idempotent migration shim available via `/setup-sdlc --migrate` (#423)
- setup-sdlc: verifies installed pipeline-script files are at-or-above the version expected by the running plugin; surfaces outdated files with a warning and migration prompt (#424)
- version-sdlc: `--retag` flag retags the current resolved version at HEAD — deletes local and remote tag, recreates annotated tag, and pushes; incompatible with bump types and `--init`/`--changelog`/`--hotfix` (#424)

### Fixed
- harden-sdlc: `harden-prepare.js` now uses `spawnSync` with an argv array instead of `execSync` with shell string interpolation, preventing command injection via branch names containing shell metacharacters
- jira-sdlc: SKILL.md HELPER blocks for `mcp-failure.js` now guarded with stderr `WARNING:` prefix to prevent silent failure swallowing in MCP contexts
- harden-sdlc: SKILL.md plugin-defect routing phrasing normalized for consistency across all dispatch sites

## [0.20.23] - 2026-05-22

### Added
- plan-sdlc: 5-lane parallel review architecture for concurrent content, file structure, guardrail, and coverage analysis
- plan-sdlc: 3-lens cross-review for requirements, architecture, and risk dimension assessment

## [0.20.22] - 2026-05-22

### Added
- plan-sdlc: 5-lane parallel review architecture for concurrent content, file structure, guardrail, and coverage analysis
- plan-sdlc: 3-lens cross-review for requirements, architecture, and risk dimension assessment

### Fixed
- plan-sdlc: documentation updated for 5-lane + multi-lens parallelization architecture

## [0.20.21] - 2026-05-22

### Added
- plan-sdlc: G17 dimension coverage gate — analyzes plan paths and tasks against active review-dimension catalog, emitting structured advisory findings for suggested review dimensions

### Fixed
- plan-sdlc: G17 gate - semver sort & graceful-degradation

## [0.20.20] - 2026-05-22

### Added
- harden-sdlc: review-dimensions run first in the orchestrator, guardrail deduplication, pre-flight config validation, and severity vocabulary centralized as single source of truth

### Fixed
- validate-guardrails: severity list now sourced from `GUARDRAIL_SEVERITIES` in `lib/dimensions.js` instead of hardcoded values

## [0.20.19] - 2026-05-22

### Added
- openspec: checkbox flipping on execute-plan-sdlc — tasks marked - [ ] now flip to - [x] as each wave completes during plan execution

### Fixed
- openspec-guards: shell injection and path traversal guards

## [0.20.18] - 2026-05-20

### Fixed
- jira-sdlc: enforce terse acceptance criteria as checklists and restrict ADF gate to taskList-only (#412)

## [0.20.17] - 2026-05-20

### Fixed
- agent-isolation-guard: use block mode (`continue: false` + `stopReason`) instead of `permissionDecision: deny`; remove redundant `reason` key from emitted block response (#382)

## [0.20.16] - 2026-05-20

### Added
- plan-sdlc: dynamic-dimension orchestrator with web research support — pre-computes scope hints, web-research signals, skill registry samples, and recent plans for intelligent dimension recommendation (#408)

### Fixed
- plan-sdlc: post-review fixes for orchestrator — tempdir cleanup trap, spawnSync for git grep to avoid shell injection, brief validation gate (#408)

## [0.20.15] - 2026-05-20

### Added
- ship-sdlc: `--quick` flag for user-defined shortened step profile — configure a custom subset of pipeline steps via `ship.quick[]` in `.sdlc/local.json` to activate a shortened pipeline on demand (#403)

### Fixed
- ship-sdlc: post-review cleanup for `--quick` profile implementation (#403)

## [0.20.14] - 2026-05-20

### Fixed
- ship-sdlc: env-var injection safety and workspace cwd diagnostics — removed dead projectRoot parameter from resolveDefaultBranch() and detectWipSquash(); added $PREPARE_OUTPUT_FILE env-var injection for shell-escaping safety; added stderr hint to worktree-list probe failure (#405, #406)
- workspace branch detection in git-state queries — linked worktree support via process.cwd() in commit.js, pr.js, review.js, version.js, and ship.js (#405, #406)

## [0.20.13] - 2026-05-18

### Fixed
- review-sdlc: force-active on-demand dimensions by explicit name — activate role-based dimensions when named in --dimensions filter even if triggers match zero files (#362)
- review-sdlc: remove test harness duplication — export loadAndMatchDimensions from review.js to eliminate code drift risk (#362)

## [0.20.12] - 2026-05-17

### Fixed
- commit-ship safety: added missing plan-mode guards and cleanup docs (#399, #400)
- commit-ship safety: persistent manifest and branch guard for commit/ship (#398, #399, #400)
- ship-sdlc pipeline: branch-verification guards to prevent silent branch mismatch (#347, #348, #349)

## [0.20.11] - 2026-05-17

### Fixed
- Added branch-verification guards to prevent silent branch mismatch in pipeline (scripts/lib/branch-guard.js, verify-tag-ancestry.js) (#347, #348, #349)
- Added WARNING when verify-tag-ancestry.js not found during ship-sdlc release (#349)

## [0.20.10] - 2026-05-17

### Fixed
- ship-sdlc: Copilot login + prerelease version override — bot-identity normalization for Copilot reviewer matching and prerelease version override from config (#393, #394)

### Changed
- ship-sdlc: updated --bump flag documentation to reflect version.preRelease config override (#393)

## [0.20.9] - 2026-05-17

### Fixed
- plan-sdlc: removed autonomous critique session-recovery prompt (Step 0) and approval gate (Step 4); single touchpoint at Step 7 handoff (#388)
- execute-plan-sdlc: guardrail injection, expectedFiles cross-check, --commit-waves WIP commits, post-compact implicit resume; ship-sdlc commitWaves config; commit-sdlc wip-squash path (#392)

## [0.20.8] - 2026-05-16

### Added
- review-sdlc: plugin version attribution in consolidated comment footer (R17 in spec)

### Fixed
- review-sdlc: clarifying docs and test coverage for plugin version attribution spec entries (#363)

## [0.20.7] - 2026-05-15

### Fixed
- harden-sdlc: each approved proposal is now persisted to disk immediately after approval, before advancing to the next iteration (#387)

## [0.20.6] - 2026-05-15

### Added
- jira-sdlc: Test Case and Test Plan templates for QA workflows — Test Case supports Gherkin-based step definitions, Preconditions, and Expected Results; Test Plan includes Objective, Entry/Exit Criteria, and Scope partitioning (#386)

## [0.20.5] - 2026-05-14

### Fixed
- pr-sdlc - harden probeRepoAccess against shell injection (378)
- pr-sdlc org-account access probe - replace string match with repo-access verification (380)
- ship-sdlc workspace isolation - pre-execute branch/worktree (378)
- worktree-isolation - promote guard to plugin hook (370)

### Changed
- add execute.guardrails[] best-practices guide (343)
- harden-sdlc - add scenario walkthroughs and iteration loop (344)

## [0.20.4] - 2026-05-14

### Fixed
- execute-plan-sdlc: agent-isolation-guard promoted to plugin-level PreToolUse hook, blocking `isolation: worktree` on Agent dispatch at harness level; configurable per-developer opt-out via `hooks.agentIsolationGuard.enabled` in `.sdlc/local.json` (#370 #371 #372)
- execute-plan-sdlc / ship-sdlc: stale cross-reference in SKILL.md corrected (R-no-agent-sdk-isolation); spec-traceability comment added in ship-sdlc to clarify intentional workspace mode omission from ship.js invocation example (#370 #371 #372)

## [0.20.3] - 2026-05-13

### Fixed
- ship-sdlc: Agent dispatch for execute-plan-sdlc restores pipeline continuity after execute-plan-sdlc completion, enabling post-execute work (branch migration, staging window, commit dispatch)
- ship-sdlc: documentation clarified for Agent dispatch mode in spec and SKILL.md
- jira-sdlc: bracket-form placeholder detection (e.g., [OIDC/SSO]) no longer triggers false positives on summary field

## [0.20.2] - 2026-05-13

### Fixed
- jira-sdlc: bracket-form placeholder false-positive on Jira summary field (e.g., `[OIDC/SSO]`, `[FEAT]`, `[BUG]`) — bracket-form detection now excluded from summary field per spec C13

## [0.20.1] - 2026-05-13

### Fixed
- fix(#356): learnings log path - align to .sdlc canonical path (#357)

## [0.20.0] - 2026-05-13

### Added
- harvest-learnings: canonical learnings log path resolution with `resolveLogPath()` and one-shot migration script from legacy `.claude/learnings/log.md` to `.sdlc/learnings/log.md` (#356)

### Changed
- harden-sdlc: updated documentation to reference learnings log migration (#356)

## [0.19.14] - 2026-05-12

### Added
- ship-sdlc + execute-plan-sdlc: wave-level Agent dispatch for context isolation, bounding context pollution to wave-level events (#353)

### Changed
- wave-runner documentation and spec reference: clarified Agent (not main context) parses per-task results; documented recovery wave-runner budget carryover; added single-Trivial dispatch rule; updated terminology from 'inline-Bash' to 'inline-executed' (#353)

## [0.19.13] - 2026-05-12

### Added
- setup-sdlc: configurable git worktree placement with four layouts (inside/sibling/central/template); workspace wizard step with live previews, mismatch detection, and nameTemplate support (#351)
- setup-sdlc: workspace section in setup wizard with numbered layout menu, conditional follow-up fields, and writes to `.sdlc/local.json` (#351)
- worktree-doctor: new diagnostic CLI for layout-match, gitignore, config-resolution, and orphan checks with migration hints (#351)
- ensure-worktree-gitignore hook: SessionStart hook that adds `.claude/worktrees/` to root `.gitignore` when `layout=inside` (#351)

### Fixed
- config: all skill and util callers now resolve `.sdlc/` config from the main worktree root, fixing dead config paths when invoked from a linked worktree (#351)
- worktree-create: replaced shell-interpolated `exec()` with `execFileSync` in `branchExists()` for shell-injection safety; added stderr warning on path fallback (#351)
- ensure-worktree-gitignore hook: changed silent catch to stderr error log; hook still exits 0; broadened matcher from `startup` to `startup|clear|compact` (#351)

## [0.19.12] - 2026-05-12

### Fixed
- ship-sdlc: agent dispatch now uses script-driven isolation — every step sets `isolation: null` to prevent accidental agent spawning; added `--branch` and `--tree` flags as workspace shortcuts for common dispatch patterns (#350)
- ship-sdlc: spec review fixes — corrected acceptance text for R-agent-isolation-script-driven to reference actual promptfoo exec test names; added missing test cases for `--workspace`/`--tree` conflict validation (#350)

## [0.19.11] - 2026-05-11

### Added
- setup-guardrails: categorized proposals with framework-specific guardrails for Svelte, Astro, and Prisma; two-stage custom prompt flow (#336)
- pr-sdlc: `defaultBranch` field in the `pr` config section with safe base-branch detection helper, replacing duplicate git symbolic-ref logic (#336)

### Fixed
- setup-sdlc: address review-sdlc findings on prerelease compat and menu redesign
- pr-sdlc: shell-injection safety and proposal invariant check placement in default-branch validation (#339)

## [0.19.10] - 2026-05-11

### Added
- setup-guardrails: categorized proposals with framework-specific guardrails for Svelte, Astro, and Prisma; two-stage custom prompt flow (#336)
- pr-sdlc: `defaultBranch` field in the `pr` config section with safe base-branch detection helper, replacing duplicate git symbolic-ref logic (#336)

### Fixed
- pr-sdlc: shell-injection safety and proposal invariant check placement in default-branch validation (#339)

## [0.19.9] - 2026-05-09

### Fixed
- plan-state-cleanup: marker lifecycle and GC integration for .sdlc/execution/ plan-*.json files (#334)
- plan-state-cleanup: review fixes — dead code removal and documentation updates (#334)
- promptfoo-exec: add script_stub_bin PATH-prepend for spawned child process fixture invocation (#290)

## [0.19.8] - 2026-05-09

### Fixed
- promptfoo-exec: add script_stub_bin PATH-prepend for spawned child process fixture invocation (#290)

## [0.19.7] - 2026-05-09

### Added
- harvest-learnings: new classifiers for operational-note and already-fixed learnings; classification preview gate before committing; `--clear` flag for full-log clearance; close-stale mode for obsolete learnings (#330)

### Fixed
- harvest-learnings: propagate verifyError to gh field, temp-file trap cleanup, quote variables, dry-run comment (#330)

## [0.19.6] - 2026-05-09

### Added
- pr-recover-gh-account: fallback account query for SSH host aliases — when the remote uses an SSH alias (not canonical github.com), queries fallback account file before failing (#295, #311)

### Fixed
- pr-recover-gh-account: clarified `fallbackAccounts` JSDoc and added test case for fallback-ignored-on-github behavior (#295)

## [0.19.5] - 2026-05-08

### Fixed
- setup-sdlc: added explicit min/max constraint properties to numeric SHIP_FIELDS (#292)
- ship-sdlc: corrected step ordering (archive-openspec moves from 5a to 5c post-publish) (#287)
- harden-sdlc: clarified pluginRepoUrl sourcing from manifest (#288)

## [0.19.4] - 2026-05-08

### Added
- version-sdlc: patch release with ship-sdlc and harden-sdlc extensions

### Fixed
- harden-sdlc: clarified pluginRepoUrl sourcing from manifest (#288)
- ship-sdlc: corrected archive-openspec step ordering to execute after publish-release (#287)

### Renamed
- `await-review.js` → `await-remote-review.js`; `awaitReviewExhausted` state marker → `awaitRemoteReviewExhausted`; `ship.awaitReviewTimeout` / `awaitReviewInterval` / `awaitReviewers` → `ship.awaitRemoteReviewTimeout` / `awaitRemoteReviewInterval` / `awaitRemoteReviewers`.

### Migration
- v3 → v4 LOCAL config migration runs automatically on first read: legacy boolean `ship.verifyPipeline: true` / `ship.awaitReview: true` are rewritten as `verify-pipeline` / `await-remote-review` entries appended to `ship.steps[]`; `awaitReview*` tunable keys are renamed to `awaitRemoteReview*` (values preserved); legacy keys are removed.

## [0.19.3] - 2026-05-08

### Added
- plan-sdlc: added stop-plan-integrity hook to verify plan traverses all quality gates when presenting release plan (#285)

### Fixed
- plan-sdlc: fixed $SCRIPT scope bug in Step 5 marker blocks — each --mark block now re-resolves independently to ensure correct path resolution (#285)
- plan-integrity: deferred stdin I/O to fallback path only, eliminating synchronous blocking on common execution path (#285)

## [0.19.2] - 2026-05-08

### Changed
- shared lib: extracted duplicated utilities from skill scripts into lib/ modules (diff-truncate, jira-keys, yaml, dimensions, version, state, output, discovery) removing ~250 lines of duplication (#284)
- shared scripts: improved comment and documentation clarity in diff-truncate.js (UTF-16 unit semantics), output.js (legacy writeJsonLine call shape), and plan-handoff-advisory.js (process.exit control flow) (#284)

## [0.19.1] - 2026-05-08

### Added
- docs: updated configuration references to use current schema version (v4)

### Fixed
- ship-sdlc: added error guards for missing script resolution
- verify-pipeline-sdlc: fixed dynamic script path resolution
- await-review.js: removed bogus state marker that prematurely signaled completion

## [0.19.0] - 2026-05-08

### Added
- ship-sdlc: post-PR CI verification and Copilot review integration with pipeline status polling and GitHub Copilot review completion awaiting (#130)
- verify-pipeline-sdlc: new skill to poll GitHub workflow status until success or failure (#130)
- verify-pipeline.js, await-review.js, verify-pipeline-sdlc-classify.js: supporting scripts for CI verification and test failure classification (#130)
- git.js: enhanced utilities for multi-tenant Jira caching in ship.js (#130)

### Fixed
- await-review.js: removed bogus 'awaitReviewExhausted' state marker that prematurely signaled verdict completion (#130)
- ship-sdlc and verify-pipeline-sdlc: added missing error guards to handle script resolution failures when sdlc plugin is not installed (#130)
- verify-pipeline-sdlc: fixed hardcoded paths to use dynamic script resolution pattern consistent with other skills (#130)

## [0.18.14] - 2026-05-08

### Added
- guardrails: added five planning-discipline always-on guardrails for plan targets — enforcing root-problem statement, minimum viable scope identification, failure-audience naming, explicit non-goal listing, and a hard gate on ambiguous patterns (#270)

## [0.18.13] - 2026-05-07

### Added
- setup-sdlc: added five planning-discipline always-on guardrails for plan targets — enforcing root-problem statement, minimum viable scope identification, failure-audience naming, explicit non-goal listing, and hard gate on ambiguous patterns (#270)

### Fixed
- testbed and harvest-learnings: reliability fixes including assertions extraction, direct JSON parsing, and fixture path migration from `.claude/sdlc.json` to `.sdlc/config.json`; added error handling for invalid JSON and missing cluster guard (#251, #252, #253)

## [0.18.12] - 2026-05-07

### Fixed
- harvest-learnings: added error handling for invalid JSON output and missing cluster guard to prevent uncaught errors during commit clustering (#242)
- test infrastructure: extracted inline assertions to external file, simplified harvest-learnings test assertions with direct JSON parsing, and migrated fixture path from `.claude/sdlc.json` to `.sdlc/config.json` (#251, #252, #253)

## [0.18.11] - 2026-05-07

### Fixed
- ship-sdlc: reviewThreshold config now correctly applied to received-review dispatch threshold gate (#275)
- jira-sdlc: PreToolUse write-guard hook no longer incorrectly denies addCommentToJiraIssue due to hash mismatch; placeholder detection improved with exact match logic (#275, #276)

## [0.18.10] - 2026-05-07

### Added
- review-sdlc: added OWASP Top 10 (2024) security review dimension; findings are auto-tagged with OWASP category codes (A01–A10) and default severity levels (#272)

## [0.18.9] - 2026-05-07

### Fixed
- promptfoo exec test provider: auto-read temporary file paths from script stdout — when a script's stdout is a single-line path matching the system temp directory pattern, the provider now reads the file content instead of returning the raw path (#273)
- config.js: normalize `.sdlc`-gitignore separator from double-newline to single-newline to prevent separator accumulation on repeated writes (#242–#250)

## [0.18.8] - 2026-05-07

### Fixed
- setup-sdlc: default configuration flow now walks every configurable field with keep/change/unset actions; `--force` re-prompts all values; end-of-run diff preview shown before any config write; zero-change writes skipped (#235)
- setup-sdlc: clarified `--force` flag description and added `--unset-only` cross-reference in docs (#228)
- pr-sdlc: added `expectedAccount` field (defaults to origin remote owner) to validate PR target account (#234)
- pr-sdlc: PR template now scaffolds to `.sdlc/pr-template.md`; deprecated `.claude/pr-template.md` path no longer written (#234)
- pr-sdlc: removed redundant preflight halt block already covered by `errors[]` check (#228)
- Shell quoting hardened in diff preview block to prevent injection (#228)

## [0.18.7] - 2026-05-07

### Fixed
- config.js: added blank-line normalization to prevent accumulation during repeated `ensureSdlcGitignore()` / `ensureRootGitignore()` runs (#266)
- hooks: pre-compact-save, stop-state-save, and post-tool-validate now use per-branch `.compact-recovery` filenames to prevent cross-branch interference (#256)
- ship-sdlc: added pruning of orphaned state files on `--init` (#255)
- guardrails: route dimension operations through `resolveDimensionsDir()` for consistent directory resolution (#259)
- pr-template: canonicalized PR template location from `.claude/pr-template.md` to `.sdlc/pr-template.md`; deprecated path migrated automatically (#260)
- script resolution: all skills now pick the newest installed plugin version using `sort -V | tail -1` instead of `head -1` (#258)

## [0.18.6] - 2026-05-07

### Fixed
- script resolution: all skills now pick the newest installed plugin version using `sort -V | tail -1` instead of `head -1`, preventing arbitrary cache version selection when multiple versions are installed; downstream symptoms (#261–#264) where `/setup-sdlc` reported config sections as [not set] are also resolved (#258)
- execute-plan-sdlc: renamed internal `SCRIPT` variable to `STATE_SCRIPT` in state-persistence block to eliminate silent variable shadowing

## [0.18.5] - 2026-05-07

### Fixed
- jira-sdlc: hardened cloudId auth-error recovery with automatic namespace retry and cache update; narrowed placeholder detection regex to reduce false positives on ADF payloads (#240)
- jira-sdlc: fixed tmpdir canonicalization via `fs.realpathSync` to handle macOS symlink chains in artifact-store; added dual-hash diagnostics to write-guard hook for easier debugging (#240)
- jira-sdlc: issue type template fallback map (Sub-bug → Bug, Sub-task → Task) now consulted before resolving to no template; adds Sub-task.md template (#240)

## [0.18.4] - 2026-05-06

### Fixed
- review-sdlc, pr-sdlc: use three-dot diffs to exclude stale base commits on non-rebased branches; adds `fetchBaseRef()` to refresh local base before diff computation and `buildBranchContribDiffCmd()` to centralize three-dot diff semantics (#239)
- git-lib: corrected inverted test assertions and enforce contract violations with `process.exit(1)` on `fetchBaseRef` failures (#239)

## [0.18.3] - 2026-05-06

### Added
- received-review-sdlc: added configurable `alwaysFixSeverities` — a per-user, per-project allowlist of finding severities whose "agree, will fix" verdicts bypass consent gates (#233)

### Fixed
- received-review-sdlc: `--auto` mode now falls back to the original behavior (auto-apply all "will fix" findings) when `alwaysFixSeverities` is unconfigured, preserving backward compatibility for existing users (#233)

## [0.18.0] - 2026-05-06

### Added
- harden-sdlc: new skill for analyzing SDLC pipeline failures and proposing targeted hardening changes across plan guardrails, execute guardrails, review dimensions, copilot instructions, and plugin self-bugs (#221)

### Fixed
- harden-sdlc: corrected orchestrator agent behavior to ensure failure analysis correctly routes through all five hardening surfaces (#220)
- state module: lifted shared `listBranches()` and `readTtlDaysFromConfig()` helpers to `lib/state.js`, eliminating duplicate implementations across ship and execute state modules (#227)

## [0.17.46] - 2026-05-05

### Added
- review-sdlc: added runtime-contract and skill-architecture review dimensions to prevent changelog-related regressions (#224)

### Fixed
- version-sdlc: fixed CHANGELOG generation being skipped when `--auto` mode is active; `config.changelog` is now correctly honored in auto mode (#219)

## [0.17.43] - 2026-05-05

### Fixed
- version-sdlc: fixed plugin.json corruption during version bump by switching to targeted field replacement with a post-edit diff gate (#211)
- version-sdlc: fixed `--output-file` flag parser consuming the following positional argument (e.g. `patch`), causing incorrect bump resolution (#212)
- version-sdlc: `config.changelog` is now respected without requiring an explicit `--changelog` flag; unified changelog gate reads from both flags and config (#213)

## [0.17.40] - 2026-05-05

### Fixed
- setup-sdlc: corrected review dimension file count to look for `.md` files instead of `.yaml`/`.yml`, fixing dimensions always reporting a count of 0 (#203)

## [0.17.39] - 2026-05-05

### Added
- review-sdlc: per-dimension model override — dimension frontmatter can declare a `model` field that overrides the manifest's `subagent_model` for that dimension; orchestrator dispatch uses `dimension.model || manifest.subagent_model` (R15) (#199)
- review-sdlc: structural validation (D13) for `model` field in dimension frontmatter (#199)

### Changed
- sdlc-config: updated version and PR settings (#199)

## [0.17.38] - 2026-05-05

### Fixed
- link-validation: added URL validator for all SDLC skills with GitHub identity match, Atlassian host validation, generic URL reachability checks, offline mode support, and skip-list for social platforms (#198)
- link-validation: added missing exit guards to LINKS_LIB blocks (#198)

## [0.17.36] - 2026-05-04

### Added
- setup-sdlc: replaced linear configuration flow with a selective multiselect menu; each section now shows a verbose header with purpose, affected files, and current value before prompting (#191)

### Fixed
- setup-sdlc: corrected stale documentation references, improved error logging, and replaced magic literals with named constants (#191)

## [0.17.35] - 2026-05-04

### Added
- version-sdlc, ship-sdlc: support for pre-release bump labels via `--pre-release-bump-label` flag and `preReleaseBumpLabel` config option, enabling automated label assignment during pre-release versioning (#193)

## [0.17.34] - 2026-05-03

### Fixed
- test infrastructure: converted exec-test provider declarations from string form to object form, fixing a "Could not identify provider" crash introduced by promptfoo 0.121.9 (#191)

## [0.17.33] - 2026-05-03

### Fixed
- ship-sdlc: removed legacy `--preset` and `--skip` flags; `--preset` is renamed to `--quality`; users are now directed to `--steps` and `--quality` with clear error messages (#190)

## [0.17.32] - 2026-04-29

### Changed
- plan-sdlc: added skill-docs-required guardrail to enforce documentation completeness checks (#185)

## [0.17.31] - 2026-04-29

### Fixed
- pr-sdlc: post-failure gh-account-switch retry now correctly re-attempts the PR creation flow after switching GitHub accounts (#184)
- pr-sdlc: null-check guard added for `verify.accounts` to prevent failures when account verification data is absent (#184)

## [0.17.30] - 2026-04-29

### Fixed
- version-sdlc: consolidated upstream auto-set fix — release push now correctly sets the upstream branch on first push from untracked branches (#183)

## [0.17.29] - 2026-04-28

### Fixed
- version-sdlc: auto-set upstream branch on first push when no upstream is configured (#183)

### Changed
- Internal maintenance: triaged and pruned stale learnings-log entries (#186)

## [0.17.28] - 2026-04-28

### Added
- plan-sdlc, ship-sdlc, execute-plan-sdlc: added context-heaviness advisory to warn users when context window usage is high (#173)

## [0.17.27] - 2026-04-28

### Added
- ship-sdlc: replaced `preset` abstraction with `steps[]` as the canonical source of truth; CLI `--preset` and `--skip` now expand/subtract from the resolved steps array (#180)
- ship-sdlc: added config schema versioning (v2) with automatic migration of legacy v1 preset-based configs (#180)

### Fixed
- ship-sdlc: corrected balanced preset defaults, BUILT_IN_DEFAULTS.steps alignment, setup-sdlc questionnaire steps emission, and stale skills-meta.ts file references (#180)

## [0.17.26] - 2026-04-28

### Added
- jira-sdlc write-operation guardrails: artifact-based approval gates, placeholder detection, and PreToolUse hook enforcement for all write operations (Create, Edit, Transition, Comment, Link, Worklog) (#178)

## [0.17.25] - 2026-04-27

### Fixed
- review-sdlc now displays the full comment body to the user before the posting prompt, ensuring all per-dimension findings and severity levels are visible before confirming (#176)

## [0.17.24] - 2026-04-23

### Fixed
- review-sdlc post-confirm handling moved to the skill's main context, preventing the orchestrator from re-running the full review pipeline when the user confirms posting the PR comment; includes branch-name escaping for save paths, corrected field reference in review-orchestrator, and stale pipeline step types in skills-meta.ts (#167)

## [0.17.23] - 2026-04-23

### Added
- jira-sdlc cache moved to `~/.sdlc-cache/jira/<site>/<KEY>.json` for XDG compliance; multi-project support via `jira.projects` array; new `--skip-workflow-discovery` flag for setup control

### Fixed
- jira-sdlc spec and doc hardening: R-number annotations, siteUrl format clarity, cache path handling, and additional roundtrip and home-cache layout tests

## [0.17.22] - 2026-04-23

### Added
- received-review-sdlc now auto-executes Step 12 (reply to PR threads and resolve addressed items) when `--auto` is active, without an interactive consent gate (#131)

## [0.17.21] - 2026-04-15

### Added
- OpenSpec integration across the SDLC pipeline: setup-sdlc enriches openspec/config.yaml with managed workflow guidance, ship-sdlc adds a conditional archive-openspec step, and execute-plan-sdlc suggests archival after pipeline completion (#162)

### Fixed
- OpenSpec archive step and test fixtures corrected after initial integration review (#162)

## [0.17.20] - 2026-04-15

### Fixed
- openspec-detection hardened against contradictory session-start signals; plan-sdlc and ship-sdlc now respect the `openspecAuthoritative` field to override conflicting context (#164)

## [0.17.19] - 2026-04-15

### Fixed
- Ship-config fields (auto, skip, bump) extracted into shared `ship-fields.js` library to prevent setup-sdlc from silently dropping questions during configuration (#152)

## [0.17.18] - 2026-04-13

### Fixed
- Pipeline step cleanup now validates all steps reach a terminal state (completed, skipped, or failed), with violations surfaced as JSON for debugging (#159)
- Per-step model routing assigned across the ship pipeline — subagents now use the correct model for each step rather than defaulting to opus (#159)

## [0.17.17] - 2026-04-12

### Fixed
- CI scripts renamed from `.js` to `.cjs` to prevent ESM/CommonJS namespace collision when consumer repos use `"type": "module"` (#156)

## [0.17.16] - 2026-04-12

### Added
- Jira comment posting now converts markdown to Atlassian Document Format (ADF), supporting headings, bold, italic, code blocks, lists, tables, blockquotes, links, and horizontal rules (#154)

### Fixed
- jira-sdlc documentation updated and script resolution guards added for markdown-to-ADF conversion (#154)

## [0.17.15] - 2026-04-06

### Added
- Self-contained CI scripts with inlined config reading, and new `scaffold-ci.js` utility for deterministic CI file scaffolding with version tracking (#150)

## [0.17.14] - 2026-04-06

### Added
- Pipeline safety validation hooks: stop-state-save, post-failure-error-report, pre-tool-git-guard, and validate-plan-format (#148)

## [0.17.13] - 2026-04-04

### Fixed
- setup-sdlc centralized initialization via new `setup-init.js` utility script for unified config and local config writing (#129, #134)
- setup-sdlc dimension scanning now uses Glob tool; permission constraints applied per spec (#129, #135, #133)
- ship-sdlc fabrication guard and coherent flag handling (#136)
- ship-sdlc auto workspace handling (#146)

## [0.17.12] - 2026-04-04

### Fixed
- Guardrails detection expanded to cover Lambda HTTP APIs (via @middy/ dependencies), NoSQL databases (DynamoDB, MongoDB, Redis), and framework signals (zod, sentry, datadog, esbuild) (#137, #138, #139)

## [0.17.11] - 2026-04-04

### Added
- Step-emitter architecture with shared `lib/stepper.js` module that inverts control between SDLC skill scripts and the LLM (#143)
- P-STEP, P-TRANS, and C-STEP requirement fields added to all 9 skill specifications (#143)

## [0.17.10] - 2026-04-04

### Added
- Specification files for all SDLC skills as authoritative source of truth for workflows and requirements (#133)
- Spec-compliance review dimension and plan guardrail enforcing spec-first development (#133)

### Changed
- Scripts reorganized from flat `scripts/` directory into logical subdirectories (`skill/`, `ci/`, `state/`, `util/`) with backward-compatible installation paths (#141)

## [0.17.9] - 2026-04-03

### Fixed
- received-review-sdlc now supports `--auto` flag to skip consent gate and auto-implement review fixes in the ship pipeline (#117)

## [0.17.8] - 2026-04-03

### Added
- OpenSpec documentation section on the site — landing page, overview, integration guide, and handover workflow pages with navigation dropdown and cross-linking (#127)

## [0.17.7] - 2026-04-02

### Added
- OpenSpec integration bridge with stage hints for bidirectional workflow between OpenSpec specification and SDLC planning (#125)

### Fixed
- plan-sdlc now correctly captures plan-prepare.js exit code in VERBATIM block (#125)

## [0.17.6] - 2026-04-01

### Changed
- Execution presets renamed from A/B/C to full/balanced/minimal with backward compatibility for legacy values (#114)
- YAGNI added as a default guardrail proposal alongside existing DRY and KISS (#120)

## [0.17.5] - 2026-04-01

### Fixed
- Atomic state file writes to prevent corruption from parallel worktree access (#109)
- Ship pipeline sub-skills dispatched as Agents to eliminate context pollution in later steps (#119)
- `skipSource` field added to ship-prepare.js step output for skip-flag provenance tracking (#118)
- Network-dependent commands gain retry logic via `retryExec` helper with exponential backoff (#116)

## [0.17.4] - 2026-04-01

### Fixed
- commit-sdlc "Prompt is too long" error when staging large diffs — truncates diffs to an 8000-character budget, keeping the largest file diffs and using diffstat for the rest (#115)

## [0.17.3] - 2026-04-01

### Added
- Execution guardrails evaluation (pre-wave and post-wave checks) with separate `execute.guardrails[]` config section (#103)
- `/setup-sdlc --execution-guardrails` sub-flow for configuring runtime guardrails (#103)

### Fixed
- Guardrail proposal generation for execute context now uses execution-specific descriptions (#103)

## [0.17.2] - 2026-04-01

### Fixed
- Script resolution `find` patterns now scoped to `*/sdlc*` to prevent cross-plugin collisions (#111)
- Auto mode execution no longer resumes from stale state files without explicit `--resume` (#110)
- Synced plan-sdlc and execute-plan-sdlc docs with SKILL.md changes (#107, #108, #110)
- received-review-sdlc fallback pattern aligned with other skills (#111)

### Changed
- Plan handoff menu now offers ship (full pipeline) as the primary option (#108)
- Ship pipeline includes context budget awareness guidance for inter-step compaction (#105)
- Plan approval output no longer includes wave preview (#107)

### Added
- DRY and KISS plan guardrails

## [0.17.1] - 2026-03-31

### Fixed
- False gitignore warning when `.sdlc/.gitignore` exists instead of root `.gitignore` entry (#99)
- `mktemp` collision in prepare script invocations — replaced with script-driven `--output-file` flag using crypto-random temp filenames (#101)
- `execute-plan-sdlc` interactive prompts when config provides all answers — added `--auto` flag for non-interactive execution (#104)
- Auto-mode workspace default now overrides from `prompt` to `branch` in ship-prepare.js (#104)
- Missing prefix argument in `jira-prepare.js` `writeOutput` call causing wrong exit code

### Changed
- Migrated legacy unit tests to promptfoo exec datasets (#100)
- `validate-plugin-consistency` now checks for `--output-file` instead of `mktemp`

## [0.17.0] - 2026-03-31

### Changed
- Consolidated review-init-sdlc, pr-customize-sdlc, and guardrails-init-sdlc into setup-sdlc as internal sub-flows with `--dimensions`, `--pr-template`, and `--guardrails` flags (#94)

## [0.16.13] - 2026-03-31

### Added
- Custom plan guardrails support — configurable `plan.guardrails[]` in sdlc.json with interactive `/guardrails-init-sdlc` skill for project-aware proposal generation (#91)

### Fixed
- Review dimension detection in guardrails-prepare.js now correctly identifies `.md` dimension files

## [0.16.12] - 2026-03-31

### Fixed
- Ship pipeline LLM now uses computed `invocation` field from ship-prepare.js output instead of copying hardcoded example args from SKILL.md (#97)

## [0.16.11] - 2026-03-31

### Added
- Configurable message patterns for commit and PR skills
- New review dimensions: dependency-management and ui-review

## [0.16.10] - 2026-03-31

### Fixed
- Worktree PRs no longer fail CI version check — `pr-sdlc` now accepts `--label` flag for forced labels, and `ship-sdlc` auto-applies `skip-version-check` when workspace is worktree (#88)

## [0.16.9] - 2026-03-31

### Fixed
- `setup-sdlc` now detects stale `ship` sections left in project config after migration and triggers cleanup automatically (#90)

## [0.16.8] - 2026-03-31

### Added
- Unified configuration: consolidates 4 config files into 2 (`sdlc.json` + `local.json`) with centralized `lib/config.js` and `/setup-sdlc` skill for one-step project initialization (#86)
- Hook-based context injection: session-start hook detects pipeline resume, OpenSpec context, git status, Jira cache staleness, and ship config; adds PostToolUse and PreCompact hooks for workflow awareness (#85)

### Fixed
- Ship config section moved from project config to local config; legacy fallback now resolves review and ship sections independently instead of returning early on first match (#87)

## [0.16.7] - 2026-03-30

### Added
- JSON Schema definitions for all SDLC configuration files — enables IDE autocompletion and inline validation for ship-config, review-config, version-config, jira-config, plugin.json, ship-state, execute-state, and review-dimension frontmatter (#80)

### Changed
- User-local SDLC state (review.json, jira-cache/) migrated from `.claude/` to `.sdlc/` with backward-compatible fallback reads and deprecation warnings (#81)
- `$schema` references in ship-config.json and version.json updated from placeholder labels to resolvable raw GitHub URLs

## [0.16.6] - 2026-03-30

### Added
- SessionStart hook that outputs plugin version and skill count into every session's system-reminder context (#82)
- Per-skill version announcement for all 11 user-invocable skills — extracts version from session-start hook output at runtime (#82)

## [0.16.5] - 2026-03-29

### Fixed
- `--workspace worktree` flag now creates actual git worktrees via `worktree-create.js` instead of falling back to branch checkout (#78)
- State file I/O moved from LLM instructions to deterministic scripts (`ship-state.js`, `execute-state.js`, `lib/state.js`)
- Branch name validation in worktree creation prevents command injection via shell metacharacters
- State file slug matching uses delimiter-aware patterns to prevent partial branch name collisions
- Missing flags restored in argument-hint frontmatter: ship-sdlc (`--resume`, `--bump`, `--workspace`, `--init-config`) and execute-plan-sdlc (`--workspace`, `--rebase`)

## [0.16.4] - 2026-03-29

### Added
- `--auto` flag for version-sdlc — skips interactive release approval prompt while retaining critique gates and pre-condition checks (#73)
- `ship-sdlc` now forwards `--auto` to version-sdlc, removing the last mandatory pause point in fully automated pipelines

## [0.16.3] - 2026-03-29

### Fixed
- GitHub hosting detection in `review-init-sdlc` now handles custom SSH aliases via multi-signal cascade (#70)

## [0.16.2] - 2026-03-29

### Added
- New review dimensions for expanded code analysis coverage

### Fixed
- Resolved issues #66 and #68

## [0.16.1] - 2026-03-28

### Added
- Pause/resume support for `execute-plan-sdlc` — writes execution state to `.sdlc/execution/` after each wave, enabling cross-session resume via `--resume` flag (#67)
- `ship-sdlc` forwards `--resume` to `execute-plan-sdlc` when resuming a pipeline with an in-progress execute step

## [0.16.0] - 2026-03-27

### Added
- `ship-sdlc` skill for end-to-end feature shipping — chains execute, commit, review, fix, version, and PR creation in a single pipeline (#60)
- Full orchestration workflow page on the documentation site
- Ship pipeline visualization component for the docs site

### Changed
- Redesigned documentation site skill pages and workflow navigation

## [0.15.2] - 2026-03-27

### Added
- `--auto` flag for commit-sdlc — skips interactive approval prompt while retaining all critique gates (#58)
- `--auto` flag for pr-sdlc — skips interactive approval prompt and auto-applies inferred labels (#59)

### Changed
- PR description "Changes Overview" section now requires concept-level bullets describing behavior changes instead of file-path listings (#62)
- Auto-label inference in pr-sdlc applies labels directly without a separate approval prompt in auto mode (#61)
- Reordered "What's Next" suggestions in commit-sdlc and execute-plan-sdlc to list review before PR creation

## [0.15.1] - 2026-03-26

### Added
- Final holistic spec completeness check (Step 8-bis) in execute-plan-sdlc — verifies cross-wave OpenSpec requirements coverage after all waves complete (#49)
- OpenSpec completion handoff in execute-plan-sdlc — suggests `/opsx:verify` and `/opsx:archive` after plan execution (#49)
- Post-merge OpenSpec guidance in pr-sdlc — suggests verification and archival steps in What's Next (#49)
- `OpenSpec-Change` commit trailer in commit-sdlc for spec-to-commit traceability (#49)

## [0.15.0] - 2026-03-26

### Added
- PR thread reply and resolve workflow in received-review-sdlc — posts replies to addressed comments and resolves threads after user consent (#50)
- Pre-compute script (`received-review-prepare.js`) for incremental review processing — skips resolved, self-replied, and stale threads (#50)
- Shared git helper library (`scripts/lib/git.js`) for PR and review data retrieval (#50)
- Interactive template suggestion in jira-sdlc `--init-templates` — proposes default templates for unmapped issue types based on Jira hierarchy level (#46)
- Unit tests for jira-prepare.js (#47)

### Changed
- jira-sdlc now captures `hierarchyLevel` in issue type metadata for hierarchy-aware template matching (#46)
- review-init-sdlc detects GitHub hosting before prompting for Copilot instructions — skips the prompt entirely for non-GitHub repos (#48)

## [0.14.7] - 2026-03-26

### Fixed
- Workspace isolation check in execute-plan-sdlc no longer relies on stale session-level branch snapshot — always detects the current branch via live git state (#55)

## [0.14.6] - 2026-03-26

### Added
- Auto-label inference in PR creation — analyzes branch name, commit messages, changed file paths, and diff size to suggest repository labels, with mandatory user approval before applying

## [0.14.5] - 2026-03-26

### Added
- Workspace isolation check in execute-plan-sdlc — detects when execution starts on the default branch and offers to create a feature branch or worktree before proceeding

### Changed
- Removed references to non-existent `plugin-check-sdlc` skill from consistency validation
- Added Github Issue section to the PR description template

## [0.14.4] - 2026-03-22

### Changed
- Updated Jira issue description templates

## [0.14.3] - 2026-03-21

### Added
- New review dimension for expanded code analysis coverage
- Autonomous detection in PR creation workflow

### Changed
- Updated GitHub Pages documentation to cover openspec workflows
- Refined openspec skill integration
- Optimized review skill performance

## [0.14.2] - 2026-03-21

### Added
- OpenSpec CLI integration for spec-driven development workflows

### Changed
- Improved skill descriptions and interaction patterns
- Updated plan skill decomposition and output

## [0.14.1] - 2026-03-20

### Added
- `argument-hint` frontmatter field across all user-invocable skills for autocomplete hints in the `/` menu
- Plan Mode detection in skills that require write operations — stops and instructs to exit plan mode before proceeding

### Changed
- User approval prompts now use `AskUserQuestion` for structured interaction
- Replaced interactive "Workflow Continuation" menus with static "What's Next" reference sections
- Improved plan-sdlc task decomposition and reviewer prompt
- Added harness integration fields documentation to the adding-skills guide

## [0.14.0] - 2026-03-20

### Added
- Consent gate in `received-review-sdlc` requiring explicit user approval before any PR changes or code modifications
- Full codebase context verification in `received-review-sdlc` — traces callers, dependents, and architectural intent instead of only checking the change diff

### Changed
- Renamed `review-receive-sdlc` to `received-review-sdlc` across all documentation, tests, and site pages
- Internal critique steps in `received-review-sdlc` no longer produce user-visible output

## [0.13.2] - 2026-03-20

### Fixed
- Fixed build configuration

## [0.13.1] - 2026-03-20

### Changed
- Refactored jira-sdlc, version-sdlc, and review-init-sdlc to use conditional loading for operation-specific content, reducing initial prompt size
- Added Gotchas, DO NOT, Error Recovery, and Workflow Continuation sections to pr-customize-sdlc and review-init-sdlc
- Added DO NOT section to review-sdlc
- Updated plan-sdlc Workflow Continuation menu to include commit option
- Added skill best practices documentation guide and removed guides section from site

## [0.13.0] - 2026-03-19

### Added
- Skills now present an interactive "what next?" menu after completing, enabling automatable chains (jira → plan → execute → commit → pr → version)
- Added `--preset` flag to `execute-plan-sdlc` to skip the A/B/C model selection prompt
- Normalized `See Also` cross-skill links and added `Related Skills` sections across all SKILL.md and docs/skills/*.md files
- Added promptfoo test datasets and fixtures for workflow continuation behavior

### Changed
- `execute-plan-sdlc` no longer shows a confirmation prompt before executing a plan (removed the "yes" confirmation gate)
- Removed duplicate skill references in nav bar

### Fixed
- Fixed skill navigation links in the site
- Fixed GitHub Pages deployment

## [0.12.1] - 2026-03-19

### Added
- New documentation pages

## [0.12.0] - 2026-03-19

### Added
- New planning skill for designing multi-step implementation plans before writing code

### Changed
- Plans directory location updated
- Execution mode simplified

## [0.11.5] - 2026-03-18

### Added
- Guardrails for skill execution to prevent unsafe automated behavior

### Changed
- Execution mode now propagates consistently across skill invocations
- Improved bypass permissions handling during skill execution

## [0.11.4] - 2026-03-18

### Changed
- Enabled changelog generation as part of the release workflow
- Improved versioning behavior and configuration

## [0.11.3] - 2026-03-16

### Added
- `commit-sdlc` skill for generating conventional commit messages from staged changes
- Model presets support in `execute-plan-sdlc` for configuring Claude model selection per task

## [0.11.2] - 2026-03-13

### Fixed
- `error-report-sdlc` now files issues in GitHub instead of Jira for broader compatibility

## [0.11.1] - 2026-03-13

### Added
- `error-report-sdlc` skill for proposing GitHub issues when actionable errors occur in SDLC skills
- Permanent Jira metadata cache in `jira-sdlc` to reduce redundant API calls

## [0.11.0] - 2026-03-13

### Added
- `jira-sdlc` skill for creating, editing, searching, transitioning, and linking Jira issues via Atlassian MCP

## [0.10.0] - 2026-03-12

### Added
- `execute-plan-sdlc` skill for adaptive parallel plan execution with wave dependency management
- `received-review-sdlc` skill for responding to code review feedback with dual self-critique gate

## [0.9.0] - 2026-03-12

### Changed
- All skills renamed to action-first naming convention (e.g. `pr-sdlc`, `review-sdlc`, `version-sdlc`)
- Removed legacy `commands/` layer; all functionality now delivered through skills

## [0.8.1] - 2026-03-08

### Added
- Smarter review dimension suggestions for files not covered by existing dimensions in `review-init-sdlc`

## [0.8.0] - 2026-03-08

### Added
- `--hotfix` flag to `version-sdlc` for annotating releases with DORA metrics metadata

## [0.7.3] - 2026-03-08

### Added
- `test-report` and `promptfoo-results` skills for analyzing promptfoo BDD test results and generating evidence reports

## [0.7.2] - 2026-03-08

### Added
- `promptfoo` BDD test suite for automated SDLC skill behavior validation

## [0.7.1] - 2026-03-06

### Fixed
- Script resolution moved into skills to prevent path-dependent failures; simplified `find` commands

## [0.7.0] - 2026-03-06

### Added
- `plugin-check` command for validating plugin discovery and installation

## [0.6.3] - 2026-03-05

### Added
- Review scope options (`committed`, `staged`, `working`, `worktree`) for `review-sdlc`

## [0.6.2] - 2026-03-05

### Fixed
- Script resolution order corrected to prevent plugin scripts from shadowing project-local scripts
- Plugin consistency validation added to catch structural issues before they reach users

## [0.6.1] - 2026-03-05

### Added
- GitHub Copilot instructions generation in `review-init-sdlc`

## [0.6.0] - 2026-03-04

### Changed
- All skills renamed with `sdlc-` prefix for namespace clarity
- Added per-skill reference documentation

## [0.5.3] - 2026-03-04

### Fixed
- Git identity now configured correctly in the `retag-release` CI workflow
- Automated tag repair CI workflow now triggers correctly on push to main

## [0.5.2] - 2026-03-04

### Added
- `retag-release.yml` CI workflow to automatically repair orphaned tags after squash merges to main

## [0.5.1] - 2026-03-04

### Added
- `version-sdlc` skill for semantic version management (bump, tag, changelog, push)
- `pr-customize-sdlc` skill for creating and managing custom PR templates
- Review orchestrator now requires explicit user approval before executing review steps

### Fixed
- Script paths updated to use absolute resolution for cross-platform compatibility
- Portable glob patterns for script and agent references
