# execute-plan-sdlc Prepare Script (skill/execute.js, W5.2) Implementation Plan

**Goal:** Add the prepare script `scripts/skill/execute.js` (with `scripts/lib/plan-parse.js`), so execute-plan-sdlc resolves its flags, config, quality tier, plan, waves, workspace and resume deterministically. Ship stops forwarding execute tunables, and `state/execute.js wave-start` emits the wave manifest (W5.2 Changes 1–6, Fold-in (a)(1)–(2), owner decision Q16, rulings w1-plan Q1 (a) and Q2 (b)). The user-visible changes for the 0.32.0 release are listed in `## Context`.
**Architecture:** `plan-parse.js` takes over the validator's three parser functions and adds `parsePlan`. `execute.js` follows the CLI and output conventions of `skill/ship.js` and writes one JSON manifest via `writeOutput`. SKILL.md Step 1 runs it once and reads every value from it. `wave-start --manifest-json` builds the per-wave manifest that SKILL.md passes to the wave-runner verbatim. `ship.js` forwards only `--plan`, `--auto` and `--quality`; `execute.js` reads `execute.*` from `.sdlc/config.json`, falling back to the legacy `.sdlc/local.json` ship keys. The whole plan runs as ONE `/sdlc:ship-sdlc --plan docs/plans/2026-10-22-m5-w1-execute-prepare.md --steps execute,commit --rebase skip --quality balanced` (installed sdlc 0.21.29, reading R-installed), which makes exactly ONE commit: `feat(#9013): execute-plan-sdlc - skill/execute.js prepare script (W5.2)` (71 characters). Order of work (orchestrator decision M1): S1 commit, S2 commit, then one commit of the three wave-1 plan files plus the `site/` mirror produced by `node site/scripts/copy-docs.mjs`, with subject `docs(#9013): plans and site - wave 1 plans (W5.2)` (49 characters), then the ship run. Ship's `git add -A` then sees the plan files as unchanged. After the ship run: `node site/scripts/copy-docs.mjs`, then a direct commit-sdlc commit `docs(#9013): site - mirror wave 1 docs (W5.2)` (45 characters) if `site/` changed (Task 9 edits `docs/cost-tiers.md`, which the site mirrors). If the in-ship commit subject differs from the stated subject, the executor STOPs (standing commit rule); no amend.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5/wave-1-plan-source.md (plan 3; item W5.2 verbatim; readings R-Q16, R-W8.22, R-ship-args, R-legacy-config, R-preflight, R-installed, R-release; plan §0), /workspace/sdlc-marketplace/.sdlc/orchestration/m5/ruling-w1-plan.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5/ruling-w1-preflight.md, /workspace/sdlc-marketplace/.sdlc/orchestration/owner-q16.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5/preflight-wave-1.md, discovery brief /tmp/sdlc-explore-m5-w1-9013-execute-prepare-pFEHDN/discovery-brief.md (F-plan-parser-extraction-and-wave-building-*, F-ship-execute-args-decoupling-*, F-prepare-lib-workspace-resume-config-*, F-execute-skill-md-and-docs-derivations-*, F-spec-anchors-and-shape-validator-*, F-promptfoo-exec-conventions-and-ship-cases-*); the spec commits S1 (`2026-10-22-m5-w1-spec-q16.md`) and S2 (`2026-10-22-m5-w1-spec-prepare.md`) must already be on the branch
**Verification:** from the repository root, each promptfoo run on its own, in the background, with one bounded wait, never two at once. Set up first with `export PF=/tmp/claude-1000/pf-tmp-exec-m5w1/final; mkdir -p "$PF"`, then run, from `tests/promptfoo`, `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR="$PF" npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern <re>`. Expected results:
(1) `"execute-prepare"` → 34 of 34 pass.
(2) `"ship-step: \((t|u|u2|u3|u4)\) --after dispatch_execute|execute-plan-sdlc/cleanup-verify"` → 9 of 9 pass (the R-W8.22 set).
(3) `"execute-prepare: \((e|f|g|h|h2)\)|ship-prepare: --auto without --quality"` → 6 of 6 pass (the Q16 cases).
(4) `"ship-prepare|plan-format|setup-prepare"` → 0 failures.
(5) `"execute-plan-sdlc/(liveness|context-producer|wave-runner-overflow)"` → 0 failures (the existing `wave-start` consumers).
Then from the repository root, each must exit 0: `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root . --strict`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`, `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file docs/plans/2026-10-22-m5-w1-execute-prepare.md`. Finally `command grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `3`.

---

## Context

**What problem does this change solve?**

- execute-plan-sdlc is the only pipeline skill without a prepare script (a Node script that computes the facts a skill needs before the model acts). Today the model derives these by hand in SKILL.md prose and inline `node -e` blocks:
  - flags and config;
  - the workspace decision (`branch` or `continue`);
  - the wave structure, per-wave `expectedFiles` and `verificationHint`;
  - the wave manifest.

  This is the largest transcription-error surface in the skill (design review #7).
- Execute learns its wave timeout, poll interval, commit-waves and rebase settings only from ship's command line. Ship resolves `ship.executeWave*` and forwards them (`ship.js:481-509`). A standalone run cannot read them at all (design §E "wire coupling").
- Under `--auto` without `--quality` the tier is undefined (owner Q16).
- R41's resume exemption (`--resume` takes the plan path from the state file) is untested prose.

**What prompted this change now?**

W5.2 is M5 wave 1. Its spec commits S1 (Q16) and S2 (prepare contract) land first. This plan is the code, tests and SKILL.md change that makes them true.

**What does success look like?**

- `node plugins/sdlc-utilities/scripts/skill/execute.js --plan <plan> --output-file` prints one manifest path, and the manifest has every P1–P8 field.
- SKILL.md has 3 `node -e` blocks (was 5), runs the prepare call once, and passes the `wave-start` manifest verbatim.
- `ship.js`'s execute args have three entries: `--plan`, `--auto`, `--quality`.
- The new exec dataset passes 34 of 34. The W8.22 set still passes 9 of 9.
- `validate-cost-tiers.js --strict` exits 0.

**User-visible changes (for the 0.32.0 minor release that follows, reading R-release):**

- New `.sdlc/config.json` `execute` keys: `commitWaves`, `waveTimeout`, `waveInterval`, `rebase`, `waveRunnerMinPlanTasks`, `specReviewer`.
- `/execute-plan-sdlc --auto` without `--quality` now uses `balanced` (or the resumed run's tier) and prints `Quality tier: balanced (default under --auto)`. Under `--auto` an invalid `--quality` is now an error (`invalidQuality`); an interactive run warns and keeps the selection prompt.
- Behaviour change for ship users: ship no longer forwards `--wave-timeout`, `--wave-interval`, `--commit-waves` or `--rebase` to execute. The `ship.executeWaveTimeout`, `ship.executeWaveInterval` and `ship.execute.commitWaves` keys in `.sdlc/local.json` still work as deprecated fallbacks, and setup no longer asks for the two `executeWave*` fields.
- Standalone `/execute-plan-sdlc` now runs the config-version check (migration) like the other skills. `--skip-config-check` and `SDLC_SKIP_CONFIG_CHECK=1` skip it.

## Research Findings

- **Parser** (`ci/validate-plan-format.js`):
  - `extractField` (`:81-85`), `stripFences` (`:93-95`) and `extractTasks` (`:101-120`) are top-level functions. The file has no `module.exports` (F-plan-parser-extraction-and-wave-building-1…4).
  - `extractTasks` bodies run to the next `### Task` or EOF, so the last task swallows trailing `## ` sections (F-…-3).
  - Files lists, Acceptance checkboxes, Notes, Contract and `openspec-task` blocks are not parsed anywhere today (F-…-7).
  - `plan-format-exec.yaml` has 23 cases (F-…-16).
- **Wave sizing** (`lib/dispatch-budget.js`):
  - It exports `computeWaveBudget`, `staticCap` (1–3 → no cap, 4–8 → 4, 9–15 → 5, 16+ → 6) and `MODEL_MAX_INPUT_BYTES`.
  - `computeWaveBudget` does not weight Complex tasks as 2; the caller must (F-…-8).
  - Nothing calls it today except prose (`SKILL.md:477`).
- **Wave algorithm** (`classifying-and-waving-tasks.md:73-119`): topological sort, the same-file rule (the later task moves on), the cap with the excess split into an inserted wave, at most one High-risk task per wave, and step 6b `expectedFiles` / `verificationHint` (F-…-13).
- **`state/execute.js`**:
  - `cmdWaveStart` (`:275-347`) prints `{ runId, factSheets }` only when `--tasks-json` is passed. `runId` is derived at `:323-326`, a Must-not-touch range (F-…-10).
  - `parseArgs` (`:55-160`) is hand-rolled `--flag value` pairs (F-…-11).
- **`lib/state.js`**:
  - `slugifyBranch` (`:68`), `findStateFile(prefix, slug)` (`:163`) and `readState(prefix, slug)` (`:336`). A corrupt file reads as null.
  - The execute state has no `completedWaves`; it is derived from `waves[].status` (F-prepare-lib-workspace-resume-config-1…6).
- **Workspace and branch helpers**:
  - `lib/git.js` exports `exec`, `deriveWorkspace` (returns the string `'branch'` or `'continue'`) and `detectBaseBranchSafe` (origin/HEAD, `main`, `master`, else `main`).
  - No lib helper computes `inLinkedWorktree`. SKILL.md does it by comparing `git worktree list --porcelain`'s first line with `git rev-parse --show-toplevel` (`SKILL.md:174`) (F-…-11, -12).
  - `lib/branch-name.js::resolveBranchName({ type, slug, config })` maps `bugfix` → `fix` and `feature` → `feat` and sanitises the result (F-…-13).
- **Config**:
  - `lib/config.js::readSection(root, 'execute')` reads `.sdlc/config.json`; `readSection(root, 'ship')` reads `.sdlc/local.json` (F-…-8).
  - `ship.js` reads `execute.commitWaves` from the ship section of `.sdlc/local.json` (`ship.js:179`, `:398`).
  - Fixture `project-ship-commit-waves-on` holds exactly that legacy key.
  - `lib/config-version-prepare.js` exports `resolveSkipConfigCheck` and `ensureConfigVersion(root, { skip, roles })` → `{ flags, migration, errors }`, used as in `skill/commit.js:188-192`.
  - `CURRENT_SCHEMA_VERSION` is 4.
- **Output** (`lib/output.js::writeOutput(data, prefix, exitCode)`): writes `<stateDir>/out/<prefix>-<slug>-<ts>-<hash>.json`, prints only the path and exits (F-…-14).
- **Ship coupling**:
  - Execute args are built at `ship.js:481-509` (quality, rebase, commit-waves, wave-timeout, wave-interval, plan, auto).
  - The tunables are resolved at `:372-411`, the commit-waves warning is at `:1002-1006`, and the flags output is at `:2640-2650` (F-ship-execute-args-decoupling-1…4).
  - `ship-fields.js` declares the two fields (`:152-173`) and the two defaults (`:207-208`). `MAX_WAVE_TIMEOUT_SECONDS` (`:33`) has no other JS consumer (F-…-6).
- **Tests that assert the removed surface**:
  - `ship-prepare-exec.yaml`: `:704`, `:719`, `:999`, `:1012`.
  - `setup-prepare-exec.yaml`: `:6` (15 fields), `:17` (field order).
  - The behavioral `ship-sdlc.yaml:914-941` with fixture `fixtures/ship-commit-waves-forwarding.md`, referenced only there (F-promptfoo-exec-conventions-and-ship-cases-9…12, -17).
- **Exec harness**:
  - `script-runner.js` splits `script_args` on whitespace, with no quoting.
  - If stdout is one `.sdlc/execution/out/….json` path, the runner returns that file's content.
  - `project_root: file://fixtures-fs/<dir>` is copied to a temp dir, and its `setup.sh` runs there. `{{project_root}}` and `{{repo_root}}` are substituted in `script_args`/`script_cwd`/`script_env` (F-…-3, -4).
- **SKILL.md `node -e` blocks**: 5 today, at `:75` (guardrails), `:186` (branch), `:455` (parseWaveSummary), `:943` (validateChangeStrict) and `:959` (parseTasks). Removing `:75` and `:186` leaves 3 (F-execute-skill-md-and-docs-derivations-3).
- **Consistency checker**: `check-consistency.js` already maps `execute-plan-sdlc` → `skill/execute.js` and skips it while the script is absent (`:163`, `:176`). Once the script exists, SKILL.md must run `node "<PLUGIN_ROOT>/scripts/skill/execute.js"` in a bash fence, with `--output-file`, `EXIT_CODE` and `$ARGUMENTS`, and no EXIT trap (rules 2–5, 11). `skill/commit.js`'s block in `commit-sdlc/SKILL.md:40-54` is the precedent.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Config-version check in `execute.js` | yes | `ensureConfigVersion` (project + local), `--skip-config-check`, `SDLC_SKIP_CONFIG_CHECK=1`, three exec cases | ruling w1-plan Q1 (a): a ruled extension of the item's flag list |
| `suggestedBranch` type and slug | yes | fixed keyword map on the H1 title; slug = H1 minus " Implementation Plan" via `slugifyBranch`; one case per mapped type and the default | ruling w1-plan Q2 (b) |
| Q16 replaces Verification case (e) | yes | (e) exit 0 `balanced`/`default`; adds (f) (g) (h); no `autoWithoutQuality` | reading R-Q16 (owner Q16) |
| cost-tiers bullet | yes | edits the `:62` bullet's trailing sentence only | ruling w1-preflight Q1 (a); the item's `:54` quote is gone |
| `node -e` count | yes | 5 → 3 (markTaskDone is prose) | ruling w1-preflight Q2 |
| `plan.header.title` | no | adds `title` (the H1 text, minus "# ") to the header object | ruling Q2 (b) needs the H1; the item's header shape has no title field |
| Same-file and cap ordering | no | same-file push first, then the weighted cap split, then risk spreading, then a budget split; each split inserts a wave right after | ports `classifying-and-waving-tasks.md` steps 4–6 in their documented order; inserting a wave (not pushing into N+1) keeps every dependant after its dependency |
| Same-file rule paths | no | a shared path of `files.create ∪ modify ∪ test` moves the later task (Task 5 step 2) | `classifying-and-waving-tasks.md:84` says "both modify"; a worker writes all three kinds of path, so the conservative split counts all three (planreview m3) |
| Default-branch probe | no | `detectBaseBranchSafe` (origin/HEAD, then local `main`/`master`, else `main`) instead of SKILL.md's `symbolic-ref` with fallback `main` | a deliberate reuse of the shared helper ship uses; it differs only in a repo with no origin/HEAD whose default is `master` (planreview m7) |
| SKILL.md Step 2 edit | no | Task 9 rewrites two Step 2 sentences so the skill starts from `classificationFloor` and `waves` | a consequence edit outside the item's named SKILL.md ranges: without it Step 2 rebuilds the waves, contradicting S2 C14–C16 and P4 (planreview M4) |
| Implicit dependencies | no | `waves` uses only declared `dependsOn` | "implicit dependencies" (barrel files) are LLM judgment; the floor-and-raise model (P3) leaves Step 3 CRITIQUE to add them |
| `classificationFloor.reasons` | no | always `[]` from the script | the item fixes the field; reasons belong to the model's later raise, which W5.3 records |
| `effort` in the manifest | no | passed through from `--manifest-json`, `null` when absent | no effort routing exists before W5.3 |
| `budget` estimate | no | `computeWaveBudget` over task-body bytes, with the wave's highest preset model (the `balanced` mapping when `quality` is `null`) | fact sheets do not exist at prepare time; dispatch-time recompute is unchanged |
| Legacy `--quality A/B/C` | no | normalised A → `full`, B → `balanced`, C → `minimal` (also for a resumed state's legacy `preset`) | SKILL.md:282 accepts them today; the preset table order is Speed, Balanced, Quality |
| Error ids `planParseError`, `invalidFlag`, `configVersion` | no | one id per class, with a `check`, `flag` or `step` field | the item says "PF-class parse failures" without ids; S2's paragraph lists them |
| Fixture state files | no | each fixture's `setup.sh` writes `.sdlc/execution/…json` and `plan.md` with heredocs | fixture copies run `setup.sh`; this matches `project-execute-commit-waves*/setup.sh` |
| Item Verification command run in place | no | runs it on a temp copy of the fixture | `ensureConfigVersion` creates `.sdlc/` infrastructure in the project root, which would leave untracked files in the repository |
| Files outside the item's list | no | edits `setup-prepare-exec.yaml` (2 cases), `ship-sdlc/SKILL.md:62` and `:208` (the `--auto` tier clause, forced by Q16), `ship-sdlc/state-format.md`, `ship-sdlc/config-format.md`, removes behavioral case `ship-sdlc.yaml:914-941` and its fixture `fixtures/ship-commit-waves-forwarding.md`; registers the dataset in `promptfooconfig-exec.yaml` | each asserts or describes the forwarding this plan removes (test-coverage-required: stale tests are corrected or removed; cross-skill-consistency) |
| `config-migrations.js` | no | not modified | the item lists it in Files, but Change 5 says "no cross-file migration" |
| `argument-hint` | no | unchanged (no `--skip-config-check`) | ship sets the env var, not the flag; the user docs (`docs/skills/`) are W5.5, and the docs checker compares them with the hint |
| Plan files commit | yes | the three plan files and the `site/` mirror get their own commit before the ship run (header) | orchestrator decision M1: the installed ship stages with `git add -A`, which would otherwise sweep the untracked plans into the feat commit |
| Behavioral case | no | not run inside the plan | source plan rules: the single case is the executor's final check after the ship run |

## Plan readings

- **Ruling w1-plan Q1 (a)** — `execute.js` runs `ensureConfigVersion` and accepts `--skip-config-check` and `SDLC_SKIP_CONFIG_CHECK=1`. This is a ruled extension of the item's flag list. The 0.32.0 CHANGELOG names it.
- **Ruling w1-plan Q2 (b)** — the type comes from a keyword map on the H1 title: `fix|bug` → bugfix, `docs` → docs, `refactor` → refactor, `chore` → chore, else feature. The first match wins, in that order, as whole words, case-insensitive. Recorded in S2's P6.
- **Ruling w1-preflight Q1 (a)** — `docs/cost-tiers.md:62` keeps its first sentence. Only its trailing sentence is replaced, and the routing table is not stated early. This bullet is a W5.3 pre-flight input.
- **Ruling w1-preflight Q2** — `markTaskDone` is prose, so the `node -e` count goes 5 → 3. The Done-when "≤ 3" holds.
- **R-W8.22** — `state/execute.js cmdCleanup` (the verifying cleanup) and ship's `completenessGate = 'no-execute-state'` path (`ship.js:1942-1946`) are not touched. The 9-case set re-runs in the final verification.
- **R-installed** — the installed sdlc 0.21.29 drives the ship run. Its ship still forwards `--wave-timeout` etc. to the executing skill; that is the installed code, not this branch.
- **R-legacy-config** — no config migration. The `sdlc-local.schema.json` entries stay, with a `DEPRECATED:` description prefix (the only deprecation precedent, `schemas/ship-config.schema.json:5`).

## Key Decisions

**Problem in one sentence:** execute-plan-sdlc derives its flags, waves, workspace and manifest in model prose, and learns its tunables only through ship's command line, so standalone runs drift and the model transcribes facts a script can compute.

- **One prepare call, then read fields.** `execute.js` is the single resolution site for every flag, config key and derived structure (S2 P1–P8, C13–C16). SKILL.md sites read `flags.*` and the other fields; they never re-parse `$ARGUMENTS`.

- **Port the wave rules; do not invent new ones.** `buildWaves` implements steps 2–6b of `classifying-and-waving-tasks.md` in their documented order (Deviations table). The model may still raise a floor value or restructure in Step 3/4, as today.

- **Config precedence CLI > `execute.*` > legacy ship keys > default.** This is the order the item states. The legacy keys keep current ship users working without a migration (R-legacy-config).

- **Keep `MAX_WAVE_TIMEOUT_SECONDS` in `ship-fields.js`; `execute.js` imports it.** The constant stays the single enforcement point that ship R57 and the schema name. Moving it would rename a spec-cited symbol.

- **`inLinkedWorktree` mirrors SKILL.md's own test.** Compare the first `worktree` line of `git worktree list --porcelain` with `git rev-parse --show-toplevel`, both via `lib/git.js::exec` with `cwd: process.cwd()`. Importing `detectWorktree` from `skill/ship.js` would load the whole ship script.

- **State, config and git roots.**
  - `--project-root` (default `resolveSdlcRoot()`, the main worktree) is the config root only: it is where `.sdlc/config.json` and `.sdlc/local.json` are read (a relative state `planPath` also resolves against it; a relative CLI plan path resolves against `process.cwd()`, see Task 4).
  - Every git call (`git branch --show-current`, `git rev-parse --show-toplevel`, `git worktree list --porcelain`, `detectBaseBranchSafe`) runs in `process.cwd()`, the invocation directory.
  - State files resolve through `lib/state.js` (`resolveStateDir()`: `SDLC_STATE_DIR_OVERRIDE` or `<main worktree of cwd>/.sdlc/execution`).
  - So in worktree mode `currentBranch` and `inLinkedWorktree` describe the linked worktree, while config and state come from the main worktree, as today. Case (l8) runs from a linked worktree.

- **Test-run rule (all tasks that run promptfoo).**
  - Each run is in the background with one bounded wait, and never two at once.
  - `TMPDIR` is a fresh subdirectory of `/tmp/claude-1000/pf-tmp-exec-m5w1/`.
  - The env vars are `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main`, and the command is `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache`.
  - Exec config only. No behavioral run, no `claude plugin eval`, no run-fix-rerun loop (AGENTS.md; no-auto-eval).

- **Tasks that run promptfoo are serialised by their dependencies.** Tasks 1, 4, 5, 6 and 7 run promptfoo; Task 7 depends on Task 6 for that reason only. Under the installed classifier (static cap 5 for 9 tasks, at most one High-risk task per wave) the waves are: 1 = Tasks 1, 2, 3; 2 = Task 4; 3 = Task 5; 4 = Task 6; 5 = Task 7; 6 = Tasks 8, 9 (Task 9 moves out of wave 5 because Tasks 7 and 9 are both High). Each wave holds at most one promptfoo-running task.

- **Worker rule (all tasks).** On a classifier refusal, stop and report; never switch tools to get past it. Fetch public docs with WebFetch only (ruling w4-curl).

- **Smallest viable cut.** Tasks 1–6 are the item's Changes 1–3, 6 and Fold-in (a). Task 7 is Change 5. Task 8 corrects the ship skill text and the stale behavioral test that Change 5 makes false. Task 9 is Change 4 plus the two doc rows of Change 6.

- **Non-goals.**
  - No routing table, effort mapping, wave-runner threshold logic or spec-reviewer cadence change. `waveRunnerMinPlanTasks` and `specReviewer` are resolved and emitted only; W5.3 consumes them.
  - No change to `WAVE_SUMMARY` parsing, `lib/task-factsheet.js` rendering, state-file naming, `ship.steps[]`, `verify-side-effect`, `--run-id` derivation, `resume-reset` or `wave-split` (item Must not touch).
  - No `docs/skills/*.md`, `site/` or README skills-table edit. These are W5.5 (owner Q16 "docs in W5.5"). The in-plugin ship reference files (`state-format.md`, `config-format.md`) are fixed in Task 8, because the ship model reads them.
  - No config migration and no removal of the legacy schema entries.
  - No change to the SKILL.md `:455`, `:943` and `:959` blocks (W5.1, W5.4, W4.4).
  - No edit of the `executeWaveTimeout` / `waveTimeout` prose in `execute-plan-sdlc/wave-runner-template.md` and `execute-plan-sdlc/state-format.md` (names only; W5.5).

- **Failure audience.**
  - Every user of `/execute-plan-sdlc` and `/ship-sdlc`. A wrong wave build dispatches conflicting tasks in parallel. A wrong quality resolution re-tiers a resumed run. A wrong workspace decision creates a branch in a worktree.
  - The exec cases pin each of these.

## Contract Examples

**code** (taken from Task 4):

```markdown
**Contract:**
- shape (code): CLI `node scripts/skill/execute.js [<plan>] [--plan <path>] [--quality full|balanced|minimal] [--resume] [--rebase auto|skip|prompt] [--auto] [--branch <name>] [--commit-waves] [--wave-timeout <s>] [--wave-interval <s>] [--skip-config-check] [--project-root <dir>] [--output-file]`; prints one manifest path; exit 0 clean, 1 with `errors[]`, 2 on crash.
- names: `execute.js`; output prefix `execute-prepare`; error ids `missingPlanFile`, `planFileNotFound`, `planParseError`, `invalidQuality`, `invalidFlag`, `configVersion`.
- mirror: `scripts/skill/ship.js` (`parseArgs` `:73`, `writeOutput` end `:2698-2709`, `require.main` guard), `scripts/skill/commit.js:188-192` (config-version).
- decisions: CLI > `execute.*` > legacy ship keys > default (Key Decisions).
- sync: S2 P1–P8; SKILL.md Step 1 (Task 9).
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Each code task adds exec cases (Tasks 4–7); the stale ship, setup and behavioral cases are rewritten or removed (Tasks 7–8); Task 1 keeps the 23 plan-format cases green |
| no-ci-bypass | error | PASS | No check is skipped; the consistency and spec validators run in the final verification |
| no-auto-eval | error | PASS | Exec config only, targeted filters, one run at a time; no behavioral run in the plan |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Every edit outside the item's Files is listed in the Deviations table with its reason |
| single-responsibility-tasks | warning | PASS (advisory accepted) | One deliverable per task. Task 9 carries the cost-tiers and README rows with the SKILL.md rewrite, because all three describe the same Step 1 change and the cost-tiers line names a script that must already exist |
| scripts-over-llm-logic | error | PASS | Moves flags, config, waves, workspace, resume and the manifest from prose into scripts |
| yagni | warning | PASS | `waveRunnerMinPlanTasks`/`specReviewer` are the item's fields; `reasons`/`effort` are the item's output shape (Deviations table) |
| cross-skill-consistency | error | PASS | Ship stops forwarding in the same commit that execute starts reading config; legacy keys keep ship users working; the ship skill paragraph, `state-format.md` and `config-format.md` are corrected in Task 8, and Task 7's consumer grep checks for leftovers |
| pr-link-github-issue | error | PASS | Local todo #9013 only |
| dry | warning | PASS | Parser code moves to `lib/plan-parse.js` and the validator requires it; `staticCap`, `computeWaveBudget`, `deriveWorkspace`, `resolveBranchName`, `slugifyBranch`, `findStateFile`/`readState`, `ensureConfigVersion` and `MAX_WAVE_TIMEOUT_SECONDS` are reused |
| kiss | warning | PASS | Hand-rolled `parseArgs` like `ship.js`; plain functions, no classes |
| spec-first | error | PASS | S1 and S2 are committed before this plan runs (Source line; Task 4 and Task 9 check them) |
| project-agnostic | error | PASS | Plugin code only; no repo-local config edit |
| flag-coherence-cross-skill | error | PASS | Task 9 rewrites the Parse paragraphs for `--auto`, `--plan`, `--commit-waves`, `--wave-*`, `--branch`, the rebase and quality sites and Resume step 1 to cite `flags.*`/`resume.*`/`plan.path`, and adds a Flag reading rule that defines every remaining "`--auto` is set" / "`--resume` was passed" phrase (Steps 0, 5a, 5c, 6) as `flags.auto` / `flags.resume` |
| no-opposite-logical-vectors | error | PASS | `flags.quality` and `flags.sources.quality` are the only tier gates in SKILL.md after Task 9 |
| flag-resolution-single-source | warning | PASS | `execute.js` is the only resolver; ship forwards no tunable; SKILL.md takes the state file (Resume step 1), the plan path and `flags.auto` from the prepare output |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | Key Decisions justifies Task 8 |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | Q1 and Q2 were asked and ruled; every other choice is in the Deviations table with its reason |
| state-machine-idempotency | error | PASS | `execute.js` writes no state of its own. The config-version check runs through the shared `ensureConfigVersion`: (k1) runs it on a project without config, (k4) runs it on an already-current (schemaVersion 4) config and asserts nothing is migrated again (no re-trigger after the transition), and (k2)/(k3) skip it |
| agent-dispatch-script-driven | error | PASS | The wave-runner manifest comes verbatim from `wave-start` (Task 6, Task 9) |
| flag-semantic-consistency-cross-skill | error | PASS | Task 4 acceptance greps each flag across `scripts/skill/*.js`; `--quality`, `--auto`, `--resume`, `--plan`, `--rebase`, `--skip-config-check`, `--project-root` keep the meaning they have in ship/commit/guardrails; `--commit-waves`, `--wave-timeout`, `--wave-interval`, `--branch` are defined nowhere else after Task 7 |
| workspace-mode-compatibility | error | PASS | Config via `resolveSdlcRoot()` (or `--project-root`), git calls in `process.cwd()`, state via `resolveStateDir()` (Key Decisions); branch mode: (l1)–(l6) cover `branch`, (c) covers a feature branch (`continue`); worktree mode: (l8) runs from a linked worktree and asserts `inLinkedWorktree: true`, `continue` |
| prompt-cache-hit-ratio | warning | PASS | The prepare call runs in main context; Task 6 orders the manifest keys stable-first (`escalationBudget`, `qualityTier`, `totalWaves`, tunables, `guardrails`) and puts `stateScript`, `waveNumber`, `runId`, `expectedFiles` and `tasks` last |

## Suggested Review Dimensions

### UPDATE: runtime-contract (U2, B1)

**Why:** The plan adds or changes `scripts/skill/execute.js`, `scripts/state/execute.js`, `scripts/skill/ship.js`, `scripts/lib/plan-parse.js`, `scripts/lib/ship-fields.js` and `scripts/ci/validate-plan-format.js`. The trigger `**/scripts/*.js` does not reach these subdirectories. The plan also adds the `--manifest-json` flag and six config keys, and removes the `executeWave*` and `commitWaves` flags.

**Severity hint:** high

**Patch:** Add `**/scripts/**/*.js` to the runtime-contract triggers.

**Action (dimension):** Edit `.sdlc/review-dimensions/runtime-contract.md` frontmatter: add `**/scripts/**/*.js` to `triggers` (or run `/setup-sdlc --dimensions` and choose runtime-contract).

**Action (Copilot mirror, X1):** Regenerate `.github/instructions/runtime-contract.instructions.md` per `setup-sdlc/setup-dimensions.md` Step 8 transform.

### UPDATE: hook-readiness (U2)

**Why:** hook-readiness triggers on `**/scripts/*.js`, which misses the new and modified scripts under `scripts/skill/`, `scripts/state/` and `scripts/lib/`. The plan puts at least 5 files there.

**Severity hint:** medium

**Patch:** Add `**/scripts/**/*.js` to the hook-readiness triggers.

**Action (dimension):** Edit `.sdlc/review-dimensions/hook-readiness.md` frontmatter: add `**/scripts/**/*.js` to `triggers`.

(Advisory, G17. Not part of this plan's tasks: the dimension files live under `.sdlc/`, outside this wave's scope.)

## Tasks

### Task 1: Extract the plan parser into lib/plan-parse.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/lib/plan-parse.js`
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — delete `extractField`, `stripFences`, `extractTasks` (`:77-120` with their doc comments) and require them from `../lib/plan-parse.js`.
- Test: `tests/promptfoo/datasets/plan-format-exec.yaml` (unchanged; run as regression)

**Notes:** Implements W5.2 Change 1 (F-plan-parser-extraction-and-wave-building-1…7). `extractTasks` keeps its exact behaviour, because the validator's PF checks depend on it; that is why `parsePlan` gets its own cut instead of reusing it.

**Anchors (each must print `1`; the new file must not exist):**

```bash
v=plugins/sdlc-utilities/scripts/ci/validate-plan-format.js
for a in 'function extractField(content, fieldName) {' 'function stripFences(content) {' 'function extractTasks(content) {' "const { resolveSdlcRoot } = require(path.join(__dirname, '..', 'lib', 'config'));"; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" "$v")" "$a"; done
test ! -e plugins/sdlc-utilities/scripts/lib/plan-parse.js && echo absent
```

**Must not touch:** every `checkPF*` function, `parseTemplate`, `parseArgs` and the main block of the validator; its CLI and output.

**Contract:**
- shape (code): `lib/plan-parse.js` exports `{ extractField, stripFences, extractTasks, parsePlan }`. The first three move verbatim (same signatures, same regexes). The validator change:

  ```diff
   const { resolveSdlcRoot } = require(path.join(__dirname, '..', 'lib', 'config'));
  +const { extractField, stripFences, extractTasks } = require(path.join(__dirname, '..', 'lib', 'plan-parse'));
  ```

  `parsePlan(content: string) → ParsedPlan`:

  ```text
  ParsedPlan = {
    header: { title: string|null, goal: string|null, architecture: string|null, source: string|null, verification: string|null },
    tasks: [ {
      id: number, title: string,
      complexity: string|null, risk: string|null,      // raw **Complexity:** / **Risk:** values
      dependsOn: number[],                             // /Task\s+(\d+)/g over **Depends on:**; "none" → []
      files: { create: string[], modify: string[], test: string[] },  // the FIRST backticked token of each "- Create|Modify|Test: `p`" line in the **Files:** block
      verify: string|null,                             // raw **Verify:** value
      contract: string|null,                           // verbatim lines after **Contract:** up to the next "**…:**" label or task end
      notes: string|null,                              // text after **Notes:** up to the next "**…:**" label
      acceptance: string[],                            // text of each "- [ ] " / "- [x] " line under **Acceptance criteria:**
      openspecTask: { change, ref, line: number, title } | null,       // **openspec-task:** sub-list
      body: string                                     // the cut task body (internal byte estimate; not emitted by execute.js)
    } ]
  }
  ```

  `header.title` is the first `^# ` line without the `# `. Header fields use `extractField` over the text before the first `### Task`. Task bodies are cut from the ORIGINAL content (after `\r\n` → `\n`): scan lines, track fence state (a fence line is `^\s*(`{3,})` with any leading indentation; it closes on a line whose backtick run, also with any indentation, is at least as long), and record `### Task N:` and `## ` headings only outside fences. A body runs from its `### Task N:` line to the next such heading or EOF. `contract` and `notes` are read from the original body, so fenced blocks inside a Contract stay verbatim. Each runs from its label line to the next label line, where a label line is `^\*\*[^*\n]+:\*\*` at column 0 and outside fences (indented `**…:**` text inside a fence is content, not a label). `complexity`, `risk`, `dependsOn`, `verify`, `files`, `acceptance` and `openspecTask` are read from `stripFences(body)`, so example text inside fences is never parsed as a field.
- names: `parsePlan`, `extractField`, `stripFences`, `extractTasks`; module `scripts/lib/plan-parse.js`.
- mirror: `ci/validate-plan-format.js:77-120` (moved code); the module header style of `scripts/lib/dispatch-budget.js:1-28`; the `**openspec-task:**` sub-list syntax (`- change:`, `- ref:`, `- line:`, `- title:` lines) at `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md:185-189`.
- decisions: own fence-aware cut in `parsePlan` only (the validator keeps `extractTasks` unchanged); `header.title` added (Deviations table).
- sync: `skill/execute.js` (Tasks 4–5) is the only `parsePlan` consumer; `hooks/post-tool-validate.js:88` runs the validator as a script, so the validator's CLI must not change.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] Before editing, the four anchors print `1` and the new file is `absent`.
- [ ] `command grep -c '^function \(extractField\|stripFences\|extractTasks\)' plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` prints `0`.
- [ ] `node -e "const p=require('./plugins/sdlc-utilities/scripts/lib/plan-parse.js'); const r=p.parsePlan(require('fs').readFileSync('docs/plans/2026-10-22-m5-w1-execute-prepare.md','utf8')); console.log(r.tasks.length, r.tasks[0].id, JSON.stringify(r.tasks[3].dependsOn), r.header.title)"` prints `9 1 [1,2,3] execute-plan-sdlc Prepare Script (skill/execute.js, W5.2) Implementation Plan`.
- [ ] Fenced Contract text survives: `node -e "const p=require('./plugins/sdlc-utilities/scripts/lib/plan-parse.js'); const t=p.parsePlan(require('fs').readFileSync('docs/plans/2026-10-22-m5-w1-execute-prepare.md','utf8')).tasks[6]; console.log(t.contract.includes('].filter(Boolean).join'), t.notes===null||!t.notes.includes('**Contract:**'), t.files.modify.length)"` prints `true true 4`.
- [ ] The last body stops at its section end: `node -e "const p=require('./plugins/sdlc-utilities/scripts/lib/plan-parse.js'); const t=p.parsePlan(require('fs').readFileSync('docs/plans/2026-10-22-m5-w1-execute-prepare.md','utf8')).tasks[8]; console.log(t.body.includes('## Final Shape'), t.contract.includes('EXECUTE_CONTEXT_FILE'), t.contract.includes('Flag reading rule'))"` prints `false true true`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file docs/plans/2026-10-22-m5-w1-execute-prepare.md; echo $?` prints `0`, the same as before the edit (run it once before and once after).
- [ ] Targeted run (Key Decisions test-run rule, `TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1/t1`) with `--filter-pattern "plan-format"` passes 23 of 23.

### Task 2: Fixtures for the base plan and the two resume states

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md`
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare/setup.sh`
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare-resume-planpath/setup.sh`
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare-resume-nullplan/setup.sh`

**Notes:** Implements the item's Verification fixture and Fold-in (a)'s two fixtures (F-promptfoo-exec-conventions-and-ship-cases-7, -8). `slugifyBranch('feat/resume')` is `feat-resume` (pre-flight, verified), so the state file name matches `findStateFile('execute', 'feat-resume')` and needs no rename. The plan text is written by heredoc in the planpath fixture because a fixture copy contains only its own directory.

**Anchors:** `ls -d tests/promptfoo/fixtures-fs/project-execute-prepare* 2>/dev/null | wc -l` prints `0`.

**Must not touch:** every existing fixture.

**Contract:**
- shape (code): `plan.md` is a valid plan-sdlc plan (header with Goal/Architecture/Source/Verification) with H1 `# Fixture Four Task Implementation Plan` and these four tasks:

  | Task | Complexity | Risk | Depends on | Files | Verify |
  |---|---|---|---|---|---|
  | 1 Alpha | Standard | Low | none | Create `src/a.js`; Test `tests/a.test.js` | tests |
  | 2 Beta | Standard | Low | none | Modify `src/a.js` | tests |
  | 3 Gamma | Trivial | Low | Task 1 | Create `src/c.js` | build |
  | 4 Delta | Complex | Medium | none | Create `src/d.js` | tests |

  Each task also has two `- [ ]` acceptance lines and a `**Contract:**` block, so `validate-plan-format.js --file plan.md` exits 0. Each `setup.sh` follows `project-execute-commit-waves-already-committed/setup.sh`: `set -e; git init -q -b main; git config user.email "test@test.com"; git config user.name "Test"; git config commit.gpgsign false`, then:
  - `project-execute-prepare/setup.sh`: `git add plan.md; git commit -q -m "chore: initial"` (stays on `main`).
  - `project-execute-prepare-resume-planpath/setup.sh`: writes `plan.md` (byte-identical to the base fixture's `plan.md`) by heredoc, commits it, runs `git checkout -q -b feat/resume`, then writes `.sdlc/execution/execute-feat-resume-20260101T000000Z.json`:

    ```json
    { "version": 1, "skill": "execute-plan-sdlc", "startedAt": "2026-01-01T00:00:00Z", "branch": "feat/resume",
      "planPath": "plan.md", "planHash": null, "quality": "minimal", "totalTasks": 4,
      "plannedTaskIds": ["1", "2", "3", "4"],
      "waves": [ { "number": 1, "status": "completed", "tasks": [] } ], "context": {} }
    ```

  - `project-execute-prepare-resume-nullplan/setup.sh`: one commit of a `README.md`, `git checkout -q -b feat/resume`, and the same state file with `"planPath": null`.
- names: fixture directories `project-execute-prepare`, `project-execute-prepare-resume-planpath`, `project-execute-prepare-resume-nullplan`; state file `execute-feat-resume-20260101T000000Z.json`.
- mirror: `tests/promptfoo/fixtures-fs/project-execute-commit-waves-already-committed/setup.sh`.
- decisions: fixtures write state by `setup.sh` (Deviations table).
- sync: Task 4–6 cases; the planpath fixture's `plan.md` must stay identical to the base `plan.md` (`diff` after running its `setup.sh` in a temp dir).

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md; echo $?` prints `0`.
- [ ] In a fresh temp dir (`mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w1; D=$(mktemp -d -p /tmp/claude-1000/pf-tmp-exec-m5w1)`), `cp -r tests/promptfoo/fixtures-fs/project-execute-prepare-resume-planpath/. "$D" && (cd "$D" && bash setup.sh) && diff "$D/plan.md" tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md && git -C "$D" branch --show-current` prints `feat/resume`; `ls "$D/.sdlc/execution/"` prints `execute-feat-resume-20260101T000000Z.json`.
- [ ] The same for the nullplan fixture prints `feat/resume`, and `node -e "console.log(require('$D/.sdlc/execution/execute-feat-resume-20260101T000000Z.json').planPath)"` prints `null`.
- [ ] Every `setup.sh` is LF and starts with `#!/bin/bash`.

### Task 3: execute config keys in the project schema; deprecate the local keys

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `schemas/sdlc-config.schema.json` — `$defs/executeSection.properties` gains six keys.
- Modify: `schemas/sdlc-local.schema.json` — the `executeWaveTimeout` and `executeWaveInterval` descriptions get the `DEPRECATED:` prefix.

**Notes:** Implements W5.2 Change 6 (schema part) and reading R-legacy-config (F-prepare-lib-workspace-resume-config-16…18). `executeSection` has `additionalProperties: false`, so without this task a config holding the new keys fails schema validation.

**Anchors (each must print `1`):**

```bash
for a in '"description": "Controls execute-plan-sdlc behavior and runtime guardrails.",' '"description": "Optional per-model input-token budgets for wave sizing; overrides built-in defaults in lib/dispatch-budget.js.",'; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" schemas/sdlc-config.schema.json)" "$a"; done
for a in '"description": "Maximum seconds a single execute wave may run before stalled tasks are terminated. Forwarded to execute-plan-sdlc as `--wave-timeout`.' '"description": "Seconds between execute wave liveness poll attempts. Forwarded to execute-plan-sdlc as `--wave-interval`. (R57, R-WAVE-LIVENESS)"'; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" schemas/sdlc-local.schema.json)" "$a"; done
```

**Must not touch:** `guardrails`, `dispatchBudget`, every other schema definition; the local keys' `type`/`minimum`/`maximum`/`default`.

**Contract:**
- shape (code): config delta (`executeSection.properties`, after `dispatchBudget`):

  | Op | Key | Type | Value | Notes |
  |---|---|---|---|---|
  | add | `commitWaves` | boolean | default `false` | "Commit each completed wave as a wip(execute) commit (R35)." |
  | add | `waveTimeout` | integer | min 60, max 3600, default 1800 | "Per-wave wall-clock deadline in seconds (R-WAVE-DEADLINE). The maximum restates MAX_WAVE_TIMEOUT_SECONDS in plugins/sdlc-utilities/scripts/lib/ship-fields.js." |
  | add | `waveInterval` | integer | min 10, default 60 | "Wave-runner Monitor poll interval in seconds (R-WAVE-LIVENESS)." |
  | add | `rebase` | string enum `auto`, `skip`, `prompt` | default `skip` | "Rebase onto the default branch before execution (A5)." |
  | add | `waveRunnerMinPlanTasks` | integer | min 1, default 9 | "Plans with at least this many tasks dispatch workers through the wave-runner; smaller plans dispatch from execute's main context" |
  | add | `specReviewer` | string enum `once`, `per-wave` | default `once` | "How often the spec-compliance review runs." |
  | replace | local `shipSection.executeWaveTimeout.description` | string | prefix `DEPRECATED: legacy fallback read by execute-plan-sdlc's skill/execute.js below execute.waveTimeout in .sdlc/config.json; ship-sdlc no longer forwards it. ` before the existing text, with ` Forwarded to execute-plan-sdlc as \`--wave-timeout\`.` removed | |
  | replace | local `shipSection.executeWaveInterval.description` | string | prefix `DEPRECATED: legacy fallback read by execute-plan-sdlc's skill/execute.js below execute.waveInterval in .sdlc/config.json; ship-sdlc no longer forwards it. ` with ` Forwarded to execute-plan-sdlc as \`--wave-interval\`.` removed | |

- names: `commitWaves`, `waveTimeout`, `waveInterval`, `rebase`, `waveRunnerMinPlanTasks`, `specReviewer`.
- mirror: `dispatchBudget` property style (`schemas/sdlc-config.schema.json:291-299`); `schemas/ship-config.schema.json:5` (`DEPRECATED:` prefix).
- decisions: R-legacy-config (no removal); the defaults mirror `EXECUTE_DEFAULTS` in Task 4.
- sync: `EXECUTE_DEFAULTS` in `skill/execute.js` (Task 4) must hold the same six defaults; S2 P1 names the keys.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] Before editing, the four anchors print `1`.
- [ ] `node -e "const s=require('./schemas/sdlc-config.schema.json').\$defs.executeSection; console.log(Object.keys(s.properties).join(','), s.additionalProperties)"` prints `guardrails,dispatchBudget,commitWaves,waveTimeout,waveInterval,rebase,waveRunnerMinPlanTasks,specReviewer false`.
- [ ] `node -e "const s=require('./schemas/sdlc-local.schema.json'); const j=JSON.stringify(s); console.log((j.match(/DEPRECATED: legacy fallback read by execute-plan-sdlc/g)||[]).length, /Forwarded to execute-plan-sdlc as/.test(j))"` prints `2 false`.
- [ ] Both files still parse (`node -e "require('./schemas/sdlc-config.schema.json'); require('./schemas/sdlc-local.schema.json')"` exits 0).

### Task 4: skill/execute.js — flags, config, quality, config version, plan and resume

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1, Task 2, Task 3
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/skill/execute.js`
- Create: `tests/promptfoo/datasets/execute-prepare-exec.yaml`
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare-config/setup.sh`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register the dataset after `execute-plan-sdlc-liveness-exec.yaml`.

**Notes:** Implements W5.2 Change 2 (flags, config, errors, output skeleton), Fold-in (a)(1)–(2), R-Q16 and ruling Q1 (a) (F-prepare-lib-workspace-resume-config-3, -4, -6, -8, -9, -14, -20; F-promptfoo-exec-conventions-and-ship-cases-3, -4). The output skeleton is complete from this task on, so later tasks only fill fields and SKILL.md never sees a missing key. `check-consistency.js` maps execute-plan-sdlc to this script, so it reports `skill-runs-script` from this task until Task 9 rewrites SKILL.md; that interim failure is expected.

**Anchors:** S2 is on the branch: `command grep -c '^## Prepare script contract$' docs/specs/execute-plan-sdlc.md` prints `1`, else STOP. `test ! -e plugins/sdlc-utilities/scripts/skill/execute.js && test ! -e tests/promptfoo/datasets/execute-prepare-exec.yaml && echo absent`; `command grep -cxF -- '  - file://datasets/execute-plan-sdlc-liveness-exec.yaml' tests/promptfoo/promptfooconfig-exec.yaml` prints `1`.

**Must not touch:** every other dataset line of `promptfooconfig-exec.yaml`; every `lib/*.js` module (import only).

**Contract:**
- shape (code): CLI flags (hand-rolled `parseArgs(argv)` like `ship.js:73`; the first non-flag argument is the positional plan):

  | Flag | Type | Resolution | Error |
  |---|---|---|---|
  | `<plan>` / `--plan <path>` | path | CLI; else, with `--resume`, the state's `planPath`. A relative CLI plan path resolves against `process.cwd()` (today's semantics: SKILL.md reads it relative to the session cwd; ship's `resolvePlanFile` uses `path.resolve`); a relative state `planPath` resolves against `projectRoot` | `missingPlanFile` / `planFileNotFound` |
  | `--quality <v>` | `full`\|`balanced`\|`minimal` (`A`/`B`/`C` → `full`/`balanced`/`minimal`) | A6: CLI → resumed state (`quality`, or legacy `preset` normalised) when `--resume` and the state was found → `balanced` when `--auto` → `null` | `invalidQuality` under `--auto`; without `--auto` a warning (see the error table) |
  | `--resume`, `--auto`, `--commit-waves` | boolean | CLI true; `commitWaves` also config → legacy `ship.execute.commitWaves` → `false` | — |
  | `--rebase <v>` | `auto`\|`skip`\|`prompt` | CLI → `execute.rebase` → `skip` | `invalidFlag` (`flag: "--rebase"`) |
  | `--wave-timeout <s>` | integer 60..`MAX_WAVE_TIMEOUT_SECONDS` | CLI → `execute.waveTimeout` → legacy `ship.executeWaveTimeout` → 1800 | `invalidFlag` |
  | `--wave-interval <s>` | integer ≥ 10 | CLI → `execute.waveInterval` → legacy `ship.executeWaveInterval` → 60 | `invalidFlag` |
  | `--branch <name>` | string | CLI only (R30) | — |
  | `--skip-config-check` | boolean | `resolveSkipConfigCheck(process.argv)` (CLI or `SDLC_SKIP_CONFIG_CHECK=1`) | — |
  | `--project-root <dir>` | path | `path.resolve(arg)`; default `resolveSdlcRoot()` | — |
  | `--output-file` | marker | no-op (always writes via `writeOutput`) | — |
  | any other `--flag` (e.g. the removed `--workspace`, A4) | — | rejected; its following value (when it does not start with `--`) is consumed and not taken as the positional plan | `invalidFlag` (`flag`) |
  | (config only) `waveRunnerMinPlanTasks`, `specReviewer` | integer ≥ 1 / `once`\|`per-wave` | `execute.*` → 9 / `once` | — |

  A config or legacy value of the wrong type (or out of range) is skipped with a `warnings[]` entry naming the key, and resolution falls to the next source. `sources.<name>` ∈ `cli`, `config`, `legacy-ship`, `default`. `sources.quality` ∈ `cli`, `state`, `default`, or `null` with `quality: null`. `EXECUTE_DEFAULTS = { commitWaves: false, waveTimeout: 1800, waveInterval: 60, rebase: 'skip', waveRunnerMinPlanTasks: 9, specReviewer: 'once' }`. `MAX_WAVE_TIMEOUT_SECONDS` is imported from `lib/ship-fields.js`.

  Order of work in `main()`:
  1. Parse args.
  2. `ensureConfigVersion(projectRoot, { skip })`, which maps each error to `{ id: 'configVersion', role, step, message }`.
  3. `readSection(projectRoot, 'execute')` and `readSection(projectRoot, 'ship')`.
  4. Resolve flags (except quality).
  5. Resume: `currentBranch` from `git branch --show-current` (cwd `process.cwd()`); `readState('execute', slugifyBranch(currentBranch))`. An empty branch (detached HEAD) or a git failure skips the lookup: `resume.found: false`, with a warning.
  6. Resolve quality.
  7. Resolve the plan path, read it, and `parsePlan`.
  8. Validate the plan (table below).
  9. Assemble the output.
  10. `writeOutput(result, 'execute-prepare', errors.length ? 1 : 0)`.

  `require.main === module` guard; an uncaught error goes to stderr with exit 2.

  Output (Task 4 fills the rows marked ✓; Task 5 fills the rest):

  ```text
  { flags ✓ { plan, quality, resume, rebase, auto, branch, commitWaves, waveTimeout, waveInterval,
              waveRunnerMinPlanTasks, specReviewer, skipConfigCheck, sources },
    plan ✓ { path, hash /* sha256 hex of the bytes */, header, tasks /* parsePlan tasks without body */ } | null,
    classificationFloor: [], waves: [],          // write these two as the literal `classificationFloor: [],` and `waves: [],` in the result object (Task 5's anchor greps for it)
    guardrails ✓ [ { id, description, severity } ]          // execute.guardrails || []
    workspace: null,
    resume ✓ { found, stateFile /* absolute path|null */, planPath, planHash, completedWaves: number[] },
    openspec: { specsDir: null, specFiles: [], taskMap: [], refToTaskIds: {} },
    migration ✓, warnings ✓ [], errors ✓ [] }
  ```

  `plan` is `null` after `missingPlanFile` or `planFileNotFound`; after `planParseError` it stays populated with what was parsed.

  Error table (each entry `{ id, message, … }`):

  | Condition | id | Extra field |
  |---|---|---|
  | no plan argument and (no `--resume`, or no state file, or `planPath` null/absent) | `missingPlanFile` | — (message = the R41 what/how/why text of `SKILL.md:34-38`, without issue numbers) |
  | the resolved plan file does not exist | `planFileNotFound` | `path` |
  | zero or one `### Task N:` heading | `planParseError` | `check: "taskCount"` |
  | a task's Complexity not `Trivial`/`Standard`/`Complex`, or Risk not `Low`/`Medium`/`High` | `planParseError` | `check: "PF3"`, `taskId` |
  | `dependsOn` names a missing task, or the dependency graph has a cycle | `planParseError` | `check: "PF4"`, `taskId` |
  | invalid `--quality` under `--auto`; `flags.quality` and `sources.quality` are then `null` | `invalidQuality` | `value` |
  | invalid `--quality` without `--auto`: not an error. `warnings[]` gets `Invalid --quality value "<v>" ignored; the tier is chosen at the selection prompt.`, `flags.quality` and `sources.quality` are `null`, exit 0 (the SKILL.md prompt fallback stays) | — | — |
  | invalid `--rebase` / `--wave-timeout` / `--wave-interval` | `invalidFlag` | `flag`, `value` |
  | `ensureConfigVersion` error | `configVersion` | `role`, `step` |

- names: `skill/execute.js`, `EXECUTE_DEFAULTS`, `parseArgs`, `resolveFlags`, `resolveQuality`, `main`; output prefix `execute-prepare`; dataset `execute-prepare-exec.yaml`; fixture `project-execute-prepare-config`.
- mirror: `scripts/skill/ship.js` (`parseArgs` `:73`, `mergeFlags` provenance `:193-411`, `writeFatalErrors`/`writeOutput` `:2698-2709`); `scripts/skill/commit.js:188-192`; `scripts/skill/guardrails.js:39-45` (`--project-root`).
- decisions: Key Decisions (precedence; state and config roots); Deviations table (legacy A/B/C, error ids).
- sync: S2 P1, P2, P5, P7 names; SKILL.md Step 1 (Task 9) reads exactly these fields.

  Fixture `project-execute-prepare-config/setup.sh` (git init on `main`, one commit) writes:

  ```json
  .sdlc/config.json: { "schemaVersion": 4, "execute": { "guardrails": [ { "id": "g1", "description": "no direct db", "severity": "error" } ],
                       "waveTimeout": 900, "commitWaves": true, "rebase": "auto", "waveRunnerMinPlanTasks": 5, "specReviewer": "per-wave" } }
  .sdlc/local.json:  { "schemaVersion": 4, "ship": { "executeWaveInterval": 30 } }
  ```

  Dataset cases (18). Each has `script_path: "repo://plugins/sdlc-utilities/scripts/skill/execute.js"`, `script_cwd: "{{project_root}}"` and a `javascript` assertion on `const o = JSON.parse(output)`. `P` means `--plan {{repo_root}}/tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md`.

  | # | description (exact) | project_root | script_args | assertion |
  |---|---|---|---|---|
  | c | `execute-prepare: (c) a state file for the current branch reports resume.found with its completed waves` | resume-planpath | `--plan plan.md --project-root {{project_root}}` | `o.resume.found && o.resume.completedWaves.join()==='1' && o.resume.planPath==='plan.md' && o.errors.length===0` |
  | d | `execute-prepare: (d) no plan argument exits 1 with missingPlanFile` | project-execute-prepare | `--project-root {{project_root}}` | `o.errors[0].id==='missingPlanFile'` |
  | e | `execute-prepare: (e) --auto without --quality resolves balanced with source default` | project-execute-prepare | `--plan plan.md --auto --project-root {{project_root}}` | `o.errors.length===0 && o.flags.quality==='balanced' && o.flags.sources.quality==='default'` |
  | f | `execute-prepare: (f) --auto --resume keeps the resumed state tier with source state` | resume-planpath | `--auto --resume --project-root {{project_root}}` | `o.flags.quality==='minimal' && o.flags.sources.quality==='state' && o.plan.path.endsWith('plan.md')` |
  | g | `execute-prepare: (g) an interactive run without --quality gets no default tier` | project-execute-prepare | `--plan plan.md --project-root {{project_root}}` | `o.flags.quality===null && o.flags.sources.quality===null && o.errors.length===0` |
  | h2 | `execute-prepare: (h2) an interactive run with an invalid --quality warns and leaves the tier unset` | project-execute-prepare | `--plan plan.md --quality bogus --project-root {{project_root}}` | `o.errors.length===0 && o.warnings.some(w=>String(w).includes('--quality')) && o.flags.quality===null` |
  | h | `execute-prepare: (h) --auto --quality bogus reports invalidQuality` | project-execute-prepare | `--plan plan.md --auto --quality bogus --project-root {{project_root}}` | `o.errors.some(e=>e.id==='invalidQuality') && o.flags.quality===null` |
  | i | `execute-prepare: (i) a plan path that does not exist reports planFileNotFound` | project-execute-prepare | `--plan nope.md --project-root {{project_root}}` | `o.errors.some(e=>e.id==='planFileNotFound')` |
  | r1 | `execute-prepare: --resume with state planPath non-null does not report missingPlanFile` | resume-planpath | `--resume --project-root {{project_root}}` | `!o.errors.some(e=>e.id==='missingPlanFile') && o.resume.found && o.plan.path.endsWith('plan.md')` (exact) |
  | r2 | `execute-prepare: --resume with state planPath null reports missingPlanFile` | resume-nullplan | `--resume --project-root {{project_root}}` | `JSON.parse(output).errors[0].id === 'missingPlanFile'` (exact) |
  | j1 | `execute-prepare: (j1) execute config keys resolve with source config and legacy ship keys with source legacy-ship` | project-execute-prepare-config | `P --project-root {{project_root}}` | `waveTimeout 900/config, waveInterval 30/legacy-ship, commitWaves true/config, rebase 'auto'/config, waveRunnerMinPlanTasks 5/config, specReviewer 'per-wave'/config, guardrails[0].id==='g1'` |
  | j2 | `execute-prepare: (j2) CLI flags override config with source cli` | project-execute-prepare-config | `P --wave-timeout 120 --wave-interval 15 --rebase skip --project-root {{project_root}}` | `waveTimeout 120, waveInterval 15, rebase 'skip', each source 'cli'` |
  | j3 | `execute-prepare: (j3) legacy ship.execute.commitWaves is read with source legacy-ship` | `project-ship-commit-waves-on` (existing) | `P --project-root {{project_root}}` | `o.flags.commitWaves===true && o.flags.sources.commitWaves==='legacy-ship' && o.flags.waveTimeout===1800 && o.flags.sources.waveTimeout==='default'` |
  | j4 | `execute-prepare: (j4) an out-of-range --wave-timeout reports invalidFlag` | project-execute-prepare | `--plan plan.md --wave-timeout 5 --project-root {{project_root}}` | `o.errors.some(e=>e.id==='invalidFlag' && e.flag==='--wave-timeout')` |
  | k1 | `execute-prepare: (k1) a standalone run performs the config-version check` | project-execute-prepare | `--plan plan.md --project-root {{project_root}}`; `script_env: { SDLC_SKIP_CONFIG_CHECK: "0" }` | `o.flags.skipConfigCheck===false && o.migration!==null && 'project' in o.migration && 'local' in o.migration` |
  | k2 | `execute-prepare: (k2) --skip-config-check skips the config-version check` | project-execute-prepare | `--plan plan.md --skip-config-check --project-root {{project_root}}` | `o.flags.skipConfigCheck===true && o.migration===null` |
  | k4 | `execute-prepare: (k4) an already-current config is not migrated again` | project-execute-prepare-config | `P --project-root {{project_root}}`; `script_env: { SDLC_SKIP_CONFIG_CHECK: "0" }` | `o.migration.project.migrated===false && o.migration.local.migrated===false && o.errors.length===0` |
  | k3 | `execute-prepare: (k3) SDLC_SKIP_CONFIG_CHECK=1 skips the config-version check` | project-execute-prepare | `--plan plan.md --project-root {{project_root}}`; `script_env: { SDLC_SKIP_CONFIG_CHECK: "1" }` | `o.flags.skipConfigCheck===true && o.migration===null` |

  The dataset starts with a comment header in the style of `execute-plan-sdlc-overflow-exec.yaml:1-8`, saying every description starts with `execute-prepare` so `--filter-pattern "execute-prepare"` selects them.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] The S2 check prints `1` and the anchors pass before editing.
- [ ] `command grep -c '^- description: "execute-prepare' tests/promptfoo/datasets/execute-prepare-exec.yaml` prints `18`, and `command grep -cxF -- '  - file://datasets/execute-prepare-exec.yaml' tests/promptfoo/promptfooconfig-exec.yaml` prints `1`.
- [ ] Flag grep evidence (flag-semantic-consistency): `command grep -ln -- "'--commit-waves'\|'--wave-timeout'\|'--wave-interval'\|'--branch'" plugins/sdlc-utilities/scripts/skill/*.js` is expected to list `execute.js` and `ship.js` (unverified prediction). `ship.js` keeps matching `'--branch'` in its own parsing and state-script calls; its execute-tunable matches disappear once Task 7 lands; record the output, and for any other script check that the flag means the same there and report it.
- [ ] Item Verification on a temp copy: `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w1; D=$(mktemp -d -p /tmp/claude-1000/pf-tmp-exec-m5w1); cp -r tests/promptfoo/fixtures-fs/project-execute-prepare/. "$D"; (cd "$D" && bash setup.sh); (cd "$D" && node "$OLDPWD/plugins/sdlc-utilities/scripts/skill/execute.js" --project-root "$D"; echo "exit=$?")` prints one JSON path and `exit=1`, and that JSON's `errors[0].id` is `missingPlanFile`; the same with `--plan plan.md` prints `exit=0` and `errors` is `[]`.
- [ ] Targeted run (test-run rule, `TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1/t4`) with `--filter-pattern "execute-prepare"` passes 18 of 18, including `execute-prepare: --resume` 2 of 2 (Fold-in (a) Verification).
- [ ] `git status --porcelain -- plugins/sdlc-utilities/scripts/skill/execute.js tests/promptfoo/datasets/execute-prepare-exec.yaml tests/promptfoo/fixtures-fs/project-execute-prepare-config tests/promptfoo/promptfooconfig-exec.yaml` lists exactly these four paths, and this task changed nothing else (files of tasks running in the same wave, such as Tasks 7–8, and the untracked plan files under `docs/plans/` may also appear in a full `git status` and are not this task's). Every run of `execute.js` in this task used a temp copy or a promptfoo fixture copy, because `ensureConfigVersion` runs `ensureSdlcInfrastructure` even when the check is skipped.

### Task 5: skill/execute.js — classification floor, waves, guardrail bytes, workspace and openspec

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` (created by Task 4) — add `buildClassificationFloor`, `buildWaves`, `deriveWorkspaceInfo`, `buildOpenspec`, and fill the four output fields.
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare-branch-type/setup.sh`
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` (created by Task 4) — append 14 cases.

**Notes:** Implements W5.2 Change 2 (`classificationFloor`, `waves`, `workspace`, `openspec`) and ruling Q2 (b). It uses F-plan-parser-extraction-and-wave-building-8, -13, F-prepare-lib-workspace-resume-config-11…13 and the Key Decisions on the wave port and `inLinkedWorktree`. Waves port `classifying-and-waving-tasks.md` steps 2–6b in their documented order. Do not add a rule that file does not state.

**Anchors:** `command grep -c '^- description: "execute-prepare' tests/promptfoo/datasets/execute-prepare-exec.yaml` prints `18`; `command grep -cF -- 'classificationFloor: []' plugins/sdlc-utilities/scripts/skill/execute.js` prints `1`; `test ! -e tests/promptfoo/fixtures-fs/project-execute-prepare-branch-type && echo absent`.

**Must not touch:** Task 4's flag, config, quality, resume and error code; `lib/dispatch-budget.js`, `lib/git.js`, `lib/branch-name.js`.

**Contract:**
- shape (code): when `errors[]` already holds `missingPlanFile`, `planFileNotFound` or `planParseError`, none of the four builders runs, and the Task 4 skeleton values stay (`[]`, `null`, empty `openspec`); `workspace` is still derived, because it needs no plan except the title (it is `null` without a plan). `buildWaves(tasks, { quality, guardrails, dispatchBudget })` call order:
  1. Order: Kahn topological sort over `dependsOn`, ties by ascending task id.
  2. Level and same-file: for each task in order, `w = 1 + max(wave of each dependency)` (1 when none). While wave `w` already holds a task sharing any path of `files.create ∪ modify ∪ test`, `w++`.
  3. Cap: `cap = staticCap(tasks.length)`, with weight 2 for `Complex` and 1 otherwise. When a wave's weight exceeds `cap`, keep the longest prefix of its tasks (in id order) whose weight is ≤ `cap`, move the rest into a new wave inserted directly after it, and repeat on the new wave. `Infinity` (1–3 tasks) means no split, and it is written to the output as `cap: null`.
  4. Risk spreading: when a wave holds more than one `High` task, keep the first (by id). Move the other `High` tasks into a new wave inserted directly after it, and repeat.
  5. Budget: per wave, call `computeWaveBudget` with:
     - `templateBytes`: the byte sizes of `skills/execute-plan-sdlc/wave-runner-template.md` and `classifying-and-waving-tasks.md`;
     - `guardrailsBytes`: `Buffer.byteLength(JSON.stringify(guardrails))`;
     - `perTaskFactSheetBytes`: each task's `body` bytes;
     - `priorWaveContextBytes: 0`;
     - `model`: the wave's highest model under the preset of `quality ?? 'balanced'`, where `full` = Speed (haiku/haiku/sonnet), `balanced` = Balanced (haiku/sonnet/opus) and `minimal` = Quality (sonnet/opus/opus), for Trivial/Standard/Complex;
     - `dispatchBudget`, and `totalRemainingTasks: tasks.length`.

     When `maxConcurrentTasks` is below the wave's task count, split like step 3 by count. An `Infinity` value is written as `null`. With the fixture sizes no budget split occurs; that branch is untested (unverified prediction for larger plans).
  6. Number the waves `n = 1..k`. `expectedFiles` = de-duplicated union in first-seen task order. `verificationHint` = the shared `verify` string, else `null`. `budget = { maxConcurrentTasks, perTaskCeiling, totalReservedBytes, model }`.

  Output records:

  ```text
  classificationFloor: [ { id, complexity, risk, fileCount /* unique paths */, reasons: [] } ]
  waves:     [ { n, taskIds: number[], cap, budget, expectedFiles: string[], verificationHint: string|null } ]
  workspace: { decision: 'branch'|'continue', currentBranch, defaultBranch, inLinkedWorktree: boolean, suggestedBranch: string|null }
  openspec:  { specsDir: string|null, specFiles: string[], taskMap: [ { taskId, change, ref, line, title } ], refToTaskIds: { [ref]: number[] } }
  ```

  Workspace:
  - `inLinkedWorktree` = `realpath(first "worktree " line of git worktree list --porcelain) !== realpath(git rev-parse --show-toplevel)`, with both commands run through `lib/git.js::exec` with `cwd: process.cwd()`.
  - `defaultBranch = detectBaseBranchSafe(process.cwd())`.
  - `decision = flags.branch ? 'continue' : deriveWorkspace({ inLinkedWorktree, currentBranch, defaultBranch })`.
  - When `decision === 'branch'`, `suggestedBranch = resolveBranchName({ type, slug, config: (readSection(projectRoot, 'workspace') || {}).branch || {} })`. Here `slug = slugifyBranch(title.replace(/ Implementation Plan$/, '').trim().toLowerCase())`. `type` is the first match, in order, of `/\b(fix|bug)\b/i` → `bugfix`, `/\bdocs\b/i` → `docs`, `/\brefactor\b/i` → `refactor`, `/\bchore\b/i` → `chore`, else `feature`.
  - A git failure gives `workspace: null` plus a warning.

  Openspec: when `header.source` contains `openspec/changes/<name>/`, `specsDir = openspec/changes/<name>/specs`, and `specFiles` lists its `*.md` files that exist, relative to `projectRoot` and sorted. `taskMap` and `refToTaskIds` come from tasks with `openspecTask`.

  Fixture `project-execute-prepare-branch-type/setup.sh`: git init on `main`, writes eight 2-task plans and one 6-task plan by a heredoc helper, writes `openspec/changes/demo/specs/demo.md`, commits all files, stays on `main`, and finally runs `git worktree add -q .wt -b feat/wt` (a linked worktree inside the fixture, for cases l8 and l9) and writes `.wt/plan-wt-only.md` (a 2-task plan) by heredoc into the worktree only, uncommitted, so the main checkout has no copy of it. Precedent for a linked-worktree `script_cwd`: `tests/promptfoo/datasets/pr-prepare-exec.yaml:14`. The plans are:
  - `plan-fix.md` `# Fix login redirect Implementation Plan`
  - `plan-bug.md` `# Bug in token refresh Implementation Plan`
  - `plan-docs.md` `# Docs refresh for setup Implementation Plan`
  - `plan-refactor.md` `# Refactor state helpers Implementation Plan`
  - `plan-chore.md` `# Chore bump fixtures Implementation Plan`
  - `plan-feature.md` `# Add webhook signing Implementation Plan`
  - `plan-openspec.md` `# Add demo spec Implementation Plan`: `**Source:** openspec/changes/demo/`, and Task 1 has `**openspec-task:**` `change: demo`, `ref: add-demo-abc123`, `line: 3`, `title: Add demo`
  - `plan-bad.md` `# Bad plan Implementation Plan`: Task 2 has no `**Complexity:**` line
  - `plan-waves.md` `# Wave split check Implementation Plan`, six tasks, each with its own single file (`w1.js` … `w6.js`): Tasks 1–3 `Complex`/`Low`, Tasks 4–5 `Standard`/`High`, Task 6 `Trivial`/`Low` with `**Depends on:** Task 1, Task 4`. Expected: `staticCap(6)` = 4; level 1 holds Tasks 1–5 (weight 8) → cap split `[1,2]` + `[3,4,5]` → risk split `[3,4]` + `[5]`; Task 6 at level 2. So the waves are `1,2 | 3,4 | 5 | 6`.

  Cases appended (14):

  | # | description (exact) | project_root | script_args | assertion |
  |---|---|---|---|---|
  | a | `execute-prepare: (a) a 4-task plan builds 2 waves and splits the two tasks that share a file` | project-execute-prepare | `--plan plan.md --project-root {{project_root}}` | `o.waves.length===2 && o.waves[0].taskIds.join()==='1,4' && o.waves[1].taskIds.join()==='2,3' && o.waves[0].cap===4 && o.classificationFloor.find(f=>f.id===1).fileCount===2 && o.openspec.specsDir===null` |
  | b | `execute-prepare: (b) wave expectedFiles is the union of Create, Modify and Test paths` | project-execute-prepare | `--plan plan.md --project-root {{project_root}}` | `o.waves[0].expectedFiles.join()==='src/a.js,tests/a.test.js,src/d.js' && o.waves[0].verificationHint==='tests' && o.waves[1].expectedFiles.join()==='src/a.js,src/c.js' && o.waves[1].verificationHint===null && o.workspace.decision==='branch'` |
  | l1 | `execute-prepare: (l1) an H1 title with fix suggests a fix/ branch` | branch-type | `--plan plan-fix.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='fix/fix-login-redirect'` |
  | l2 | `execute-prepare: (l2) an H1 title with bug suggests a fix/ branch` | branch-type | `--plan plan-bug.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='fix/bug-in-token-refresh'` |
  | l3 | `execute-prepare: (l3) an H1 title with docs suggests a docs/ branch` | branch-type | `--plan plan-docs.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='docs/docs-refresh-for-setup'` |
  | l4 | `execute-prepare: (l4) an H1 title with refactor suggests a refactor/ branch` | branch-type | `--plan plan-refactor.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='refactor/refactor-state-helpers'` |
  | l5 | `execute-prepare: (l5) an H1 title with chore suggests a chore/ branch` | branch-type | `--plan plan-chore.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='chore/chore-bump-fixtures'` |
  | l6 | `execute-prepare: (l6) an H1 title with no keyword suggests a feat/ branch` | branch-type | `--plan plan-feature.md --project-root {{project_root}}` | `o.workspace.suggestedBranch==='feat/add-webhook-signing' && o.workspace.decision==='branch' && o.workspace.inLinkedWorktree===false && o.waves.every(w=>w.cap===null)` |
  | l7 | `execute-prepare: (l7) --branch skips derivation and continues in place` | branch-type | `--plan plan-feature.md --branch feat/x --project-root {{project_root}}` | `o.workspace.decision==='continue' && o.workspace.suggestedBranch===null && o.flags.branch==='feat/x'` |
  | n | `execute-prepare: (n) a task without Complexity reports planParseError PF3` | branch-type | `--plan plan-bad.md --project-root {{project_root}}` | `o.errors.some(e=>e.id==='planParseError' && e.check==='PF3' && e.taskId===2)` |
  | l8 | `execute-prepare: (l8) a run from a linked worktree continues in place` | branch-type, with `script_cwd: "{{project_root}}/.wt"` | `--plan plan-feature.md --project-root {{project_root}}` | `o.workspace.inLinkedWorktree===true && o.workspace.decision==='continue' && o.workspace.currentBranch==='feat/wt' && o.workspace.suggestedBranch===null && o.errors.length===0 && o.plan.path.endsWith('/.wt/plan-feature.md')` |
  | l9 | `execute-prepare: (l9) a relative --plan run from a linked worktree reads the worktree's copy` | branch-type, with `script_cwd: "{{project_root}}/.wt"` | `--plan plan-wt-only.md --project-root {{project_root}}` | `o.errors.length===0 && o.plan.path.endsWith('/.wt/plan-wt-only.md') && o.plan.tasks.length===2` (resolving against `projectRoot`, the main checkout, would give `planFileNotFound`) |
  | q | `execute-prepare: (q) a 6-task plan splits a wave over the weighted cap and spreads High-risk tasks` | branch-type | `--plan plan-waves.md --project-root {{project_root}}` | `o.waves.map(w=>w.taskIds.join()).join(';')==='1,2;3,4;5;6' && o.waves.every(w=>w.cap===4)` |
  | o | `execute-prepare: (o) an OpenSpec-sourced plan maps its openspec-task refs` | branch-type | `--plan plan-openspec.md --project-root {{project_root}}` | `o.openspec.specsDir==='openspec/changes/demo/specs' && o.openspec.specFiles.join()==='openspec/changes/demo/specs/demo.md' && JSON.stringify(o.openspec.refToTaskIds)==='{"add-demo-abc123":[1]}'` |

- names: `buildClassificationFloor`, `buildWaves`, `deriveWorkspaceInfo`, `buildOpenspec`, `TYPE_KEYWORDS`; fixture `project-execute-prepare-branch-type`.
- mirror: `classifying-and-waving-tasks.md:73-130` (wave rules); `SKILL.md:172-197` (workspace prose being replaced); `lib/dispatch-budget.js:42,70` (API).
- decisions: Key Decisions (wave port; `inLinkedWorktree`); Deviations table (ordering, implicit dependencies, `reasons`, budget estimate); ruling Q2 (b).
- sync: S2 P3, P4, P6, P8; Task 6's `--manifest-json` takes a `waves[n]` record; Task 9's SKILL.md workspace sentence.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] Anchors pass before editing.
- [ ] `command grep -c '^- description: "execute-prepare' tests/promptfoo/datasets/execute-prepare-exec.yaml` prints `32`.
- [ ] Targeted run (test-run rule, `TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1/t5`) with `--filter-pattern "execute-prepare"` passes 32 of 32.
- [ ] `command grep -cE 'Date\.now|Math\.random' plugins/sdlc-utilities/scripts/skill/execute.js` prints `0` (the output is deterministic for a given repository state).

### Task 6: wave-start --manifest-json emits the wave manifest

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `parseArgs` gains `--manifest-json`; `cmdWaveStart` builds `manifest`; the usage header lists the flag.
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` (created by Task 4) — append 2 cases.

**Notes:** Implements W5.2 Change 3 (F-plan-parser-extraction-and-wave-building-10, -11). `--tasks-json` output, the fact-sheet writes and the `runId` derivation stay unchanged; the manifest is built inside the existing `--tasks-json` block, because the only caller (SKILL.md Step 5b) always passes both flags. Depends on Task 5 only because both tasks append to the same dataset file.

**Anchors (each must print `1`):**

```bash
x=plugins/sdlc-utilities/scripts/state/execute.js
for a in ' *   node execute-state.js wave-start  --wave <n> [--tasks-json <json>] [--run-id <id>]' \
  "    process.stdout.write(JSON.stringify({ runId, factSheets: writtenPaths }) + '\\n');" \
  "    } else if (a === '--read') {"; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" "$x")" "$a"; done
```

**Must not touch:** `:323-326`, the `--run-id` derivation (byte-identical), the fact-sheet loop, every other verb (`cleanup`, `verify-completeness`, `resume-reset`, `wave-split`, …), `lib/task-factsheet.js`.

**Contract:**
- shape (code):

  ```diff
  - *   node execute-state.js wave-start  --wave <n> [--tasks-json <json>] [--run-id <id>]
  + *   node execute-state.js wave-start  --wave <n> [--tasks-json <json>] [--manifest-json <json>] [--run-id <id>]
  …
      } else if (a === '--read') {
        result.read = true;
  +   } else if (a === '--manifest-json' && args[i + 1]) {
  +     result.manifestJson = args[++i];
      }
  …
  -    process.stdout.write(JSON.stringify({ runId, factSheets: writtenPaths }) + '\n');
  +    const out = { runId, factSheets: writtenPaths };
  +    if (opts.manifestJson) out.manifest = buildWaveManifest(opts, runId, tasks, writtenPaths);
  +    process.stdout.write(JSON.stringify(out) + '\n');
  ```

  There is no manifest-only mode. `--manifest-json` without `--tasks-json` exits 2 with `Error: --manifest-json requires --tasks-json` on stderr, checked right after the `--wave` check and before any state read or write. Invalid `--manifest-json` JSON or a non-object exits 2 with `Error: --manifest-json …` on stderr, like `--tasks-json`. The manifest has this shape (input `m` = a `waves[n]` record plus `qualityTier`, `totalWaves`, `waveTimeout`, `waveInterval`, `guardrails`, `tasks:[{ id, complexity, risk, assignedModel, effort?, verifyToken? }]`):

  ```text
  // key order: stable fields first, per-wave and per-run fields last (prompt-cache-hit-ratio)
  { escalationBudget: 2, qualityTier: m.qualityTier, totalWaves: m.totalWaves,
    waveTimeout: m.waveTimeout, waveInterval: m.waveInterval, guardrails: m.guardrails || [],
    stateScript: path.resolve(__filename), waveNumber: opts.wave, runId,
    expectedFiles: m.expectedFiles || [], verificationHint: m.verificationHint ?? null,
    tasks: (m.tasks || []).map(t => ({ id: t.id, complexity: t.complexity, risk: t.risk,
      factSheetPath: <written path whose file name is task-<normalizeTaskId(t.id)>.md, else null>,
      assignedModel: t.assignedModel, effort: t.effort ?? null, verifyToken: t.verifyToken ?? null })) }
  ```

  Cases appended (script_path `repo://plugins/sdlc-utilities/scripts/state/execute.js`, project_root resume-planpath, `script_cwd: "{{project_root}}"`; the JSON has no spaces because `script_args` is split on whitespace):

  | # | description (exact) | script_args | assertion |
  |---|---|---|---|
  | p1 | `execute-prepare: (p1) wave-start --manifest-json emits the manifest with fact-sheet paths, stateScript and runId` | `wave-start --wave 2 --tasks-json [{"id":"2","title":"Beta"}] --manifest-json {"n":2,"taskIds":[2],"expectedFiles":["src/a.js"],"verificationHint":"tests","qualityTier":"minimal","totalWaves":2,"waveTimeout":1800,"waveInterval":60,"guardrails":[],"tasks":[{"id":"2","complexity":"Standard","risk":"Low","assignedModel":"opus","verifyToken":"x"}]}` | `const o=JSON.parse(output), m=o.manifest; return m.waveNumber===2 && m.escalationBudget===2 && m.runId===o.runId && m.stateScript.endsWith('state/execute.js') && m.tasks[0].factSheetPath.endsWith('task-2.md') && m.tasks[0].effort===null && m.expectedFiles.join()==='src/a.js'` |
  | p2 | `execute-prepare: (p2) wave-start without --manifest-json keeps the runId and factSheets output only` | `wave-start --wave 2 --tasks-json [{"id":"2","title":"Beta"}]` | `const o=JSON.parse(output); return Object.keys(o).sort().join()==='factSheets,runId'` |

- names: `--manifest-json`, `result.manifestJson`, `buildWaveManifest`; output key `manifest`; error `Error: --manifest-json requires --tasks-json`.
- mirror: `--tasks-json` parsing and error handling in `cmdWaveStart` (`:308-321`); `normalizeTaskId` (`lib/task-factsheet.js:111`).
- decisions: `waveNumber` comes from `--wave` (authoritative), not `m.n`; `escalationBudget` is the constant 2 (R13).
- sync: S2 P9; SKILL.md Step 5b (Task 9) passes `manifest` verbatim; `wave-runner-template.md` reads `waveTimeout`, `waveInterval`, `runId`, `stateScript` (unchanged names).

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] The three anchors print `1` before editing.
- [ ] The `--run-id` derivation is byte-identical: `x=plugins/sdlc-utilities/scripts/state/execute.js; diff <(git show HEAD:$x | sed -n '323,326p') <(command grep -A3 -F -- 'const runId = opts.runId || (data.startedAt' "$x")` prints nothing and exits 0.
- [ ] `node plugins/sdlc-utilities/scripts/state/execute.js wave-start --wave 1 --manifest-json '{}'; echo "exit=$?"` prints `Error: --manifest-json requires --tasks-json` and `exit=2`, and `git status --porcelain` is unchanged by it.
- [ ] Targeted run (test-run rule, `TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1/t6`) with `--filter-pattern "execute-prepare|execute-plan-sdlc/wave-runner-overflow|execute-plan-sdlc/context-producer|execute-plan-sdlc/liveness"` passes every selected case (34 execute-prepare plus the existing wave-start consumers).

### Task 7: Ship forwards only --plan, --auto and --quality to execute

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — execute `args`; delete the `executeWave*`/`commitWaves` resolution, the `commitWavesInvalidType` warning and the three flags-output entries.
- Modify: `plugins/sdlc-utilities/scripts/lib/ship-fields.js` — delete the two SHIP_FIELDS entries and the two BUILT_IN_DEFAULTS; reword the `MAX_WAVE_TIMEOUT_SECONDS` comment.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — rewrite four cases (at `:704`, `:719`, `:999`, `:1012` at d551d87); add one Q16 case.
- Modify: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — rewrite two cases (at `:6`, `:17` at d551d87).

**Notes:** Depends on Task 6 only so that no two promptfoo runs share a wave (Key Decisions). Implements W5.2 Change 5 and readings R-ship-args and R-Q16 (ship part) (F-ship-execute-args-decoupling-1…9, F-promptfoo-exec-conventions-and-ship-cases-9…13). The quality-forwarding cases `:461`, `:476` and `:883` keep passing unchanged: args still carry `--quality` only when the user passed it. `flags.rebase` stays, because ship's own rebase step uses it.

**Anchors (each must print `1` in its file):**

```bash
s=plugins/sdlc-utilities/scripts/skill/ship.js; f=plugins/sdlc-utilities/scripts/lib/ship-fields.js
for a in "        flags.rebase !== 'prompt' ? \`--rebase \${flags.rebase}\` : ''," "        flags.executeCommitWaves ? '--commit-waves' : ''," '        `--wave-timeout ${flags.executeWaveTimeout}`,' '        `--wave-interval ${flags.executeWaveInterval}`,' '  // executeWaveTimeout (integer 60-3600, default from BUILT_IN_DEFAULTS).' '  if (flags.commitWavesInvalidType) {' '      executeCommitWaves: flags.executeCommitWaves === true,'; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" "$s")" "$a"; done
for a in "    name: 'executeWaveTimeout'," "    name: 'executeWaveInterval'," '  executeWaveTimeout: 1800,' '  executeWaveInterval: 60,' '// Hard ceiling for `ship.executeWaveTimeout` (R57, R-WAVE-DEADLINE).'; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" "$f")" "$a"; done
```

**Must not touch:** ship's own `--rebase` parsing, `mergeFlags` rebase block (`:291-310`), the rebase step, `flags.quality` handling and the `execute_tier` stepper path (`:1731`); `ship.steps[]`; the completeness gate (`:1942-1946`, R-W8.22); `MAX_WAVE_TIMEOUT_SECONDS` value and export; every other ship-prepare and setup-prepare case; `fixtures-fs/project-ship-commit-waves-on|off/` and `project-ship-stepper/setup.sh`.

**Contract:**
- shape (code): execute step `args` (now → after):

  ```diff
        args: [
  -        // Forward --quality to execute-plan-sdlc only when the user
  -        // explicitly passed --quality to ship. …
  -        flags.quality ? `--quality ${flags.quality}` : '',
  -        // No --workspace forward (issue #378, #379): …
  -        flags.rebase !== 'prompt' ? `--rebase ${flags.rebase}` : '',
  -        // Forward --commit-waves … (Fixes #392 / R35).
  -        flags.executeCommitWaves ? '--commit-waves' : '',
  -        // Forward the wave liveness/deadline tunables … (R57, R-WAVE-DEADLINE, R-WAVE-LIVENESS).
  -        `--wave-timeout ${flags.executeWaveTimeout}`,
  -        `--wave-interval ${flags.executeWaveInterval}`,
          // R-PLANFILE: forward the resolved plan file explicitly …
          planFile ? `--plan "${planFile}"` : '',
          // Forward --auto …
          flags.auto ? '--auto' : '',
  +        // Forward --quality only when the user passed it (or chose it at
  +        // execute_tier); ship never synthesizes a tier — under --auto,
  +        // execute-plan-sdlc resolves it (execute A6). Every other execute
  +        // setting (rebase, commit-waves, wave tunables) is read by
  +        // execute-plan-sdlc's own prepare script from its config.
  +        flags.quality ? `--quality ${flags.quality}` : '',
        ].filter(Boolean).join(' '),
  ```

  Delete these three spans in `ship.js`. Each is located by its first and last line; both occur once:

  ```diff
     }
  
  -  // executeWaveTimeout (integer 60-3600, default from BUILT_IN_DEFAULTS).
  -  …   (the executeWaveTimeout, executeWaveInterval and execute.commitWaves blocks, including `const execCfg = …`)
  -      merged.commitWavesInvalidType = true;
  -    }
  -  }
  -
     // Pass-through flags that don't come from config.
  ```

  ```diff
  -  // execute.commitWaves must be a boolean; non-boolean values are silently
  -  // treated as false — warn the user so they can correct the config.
  -  if (flags.commitWavesInvalidType) {
  -    warnings.push('execute.commitWaves in ship config is not a boolean — value ignored, defaulting to false. Set it to true or false explicitly.');
  -  }
  -
     // Always note conditional pause
  ```

  ```diff
         awaitRemoteReviewers: flags.awaitRemoteReviewers,
  -      // R57 / R-WAVE-DEADLINE / R-WAVE-LIVENESS: wave tunables resolved at
  -      …   (the rest of that comment)
  -      executeWaveTimeout: flags.executeWaveTimeout,
  -      executeWaveInterval: flags.executeWaveInterval,
  -      // Fixes #392 / R35: execute.commitWaves resolved at config-merge time;
  -      …   (the rest of that comment)
  -      executeCommitWaves: flags.executeCommitWaves === true,
         planModeBlocked: flags.planModeBlocked || false,
  ```

  In `ship-fields.js`, delete the two `SHIP_FIELDS` objects that start with `    name: 'executeWaveTimeout',` and `    name: 'executeWaveInterval',` (each from its opening `  {` through its closing `  },`), and delete the two `BUILT_IN_DEFAULTS` lines `  executeWaveTimeout: 1800,` and `  executeWaveInterval: 60,`. Replace the constant's comment:

  ```diff
  -// Hard ceiling for `ship.executeWaveTimeout` (R57, R-WAVE-DEADLINE).
  -// Single enforcement point: the questionnaire `max`, the JSON Schema
  -// `maximum`, and the user docs all restate this number and name this
  -// constant as their source.
  +// Hard ceiling for execute-plan-sdlc's wave timeout (`execute.waveTimeout`,
  +// legacy `ship.executeWaveTimeout`; R57, R-WAVE-DEADLINE). Single enforcement
  +// point, imported by scripts/skill/execute.js; the JSON Schema `maximum` and
  +// the user docs restate this number and name this constant as their source.
  ```

  Test changes (`ship-prepare-exec.yaml`; each keeps `script_path` ship.js, `script_cwd`, its `project_root`):

  | Case (now; locate by its exact description line) | New description (exact) | script_args | assertion |
  |---|---|---|---|
  | `- description: "ship-prepare: executeWaveTimeout falls back to BUILT_IN_DEFAULTS when cfg.ship is empty (R57, #506)"` | `ship-prepare: flags output carries no execute tunables (W5.2)` | `--has-plan` | `['executeWaveTimeout','executeWaveInterval','executeCommitWaves'].every(k=>!(k in o.flags)) && !('executeWaveTimeout' in o.flags.sources)` |
  | `- description: "ship-prepare: execute step forwards --wave-timeout from resolved config (R57, #506)"` | `ship-prepare: execute step args carry only --plan, --auto and --quality (W5.2)` | `--has-plan --auto --quality balanced` | `execute.args==='--auto --quality balanced' && !/--wave-|--commit-waves|--rebase/.test(execute.invocation)` |
  | `- description: "ship-prepare: execute.commitWaves=true forwards --commit-waves to execute step (#392)"` | `ship-prepare: ship.execute.commitWaves=true is not forwarded to the execute step (W5.2)` | `--has-plan` | `not-icontains "--commit-waves"`, `not-icontains "executeCommitWaves"` |
  | `- description: "ship-prepare: execute.commitWaves=false omits --commit-waves from execute step (#392)"` | `ship-prepare: ship.execute.commitWaves=false is not forwarded to the execute step (W5.2)` | `--has-plan` | same two `not-icontains` |
  | (new, inserted after the case `ship-prepare (issue #353): no --quality passed → execute step args is empty (no default quality synthesized)`) | `ship-prepare: --auto without --quality forwards no --quality to execute (Q16)` | `--has-plan --auto`, with `project_root: file://fixtures-fs/project-sdlc-gitignore-inner` and `script_cwd: {{project_root}}` | `o.flags.quality===undefined && !execute.args.includes('--quality') && execute.args.includes('--auto')` |

  Banners: the three lines `# Issue #506 / R57 / R-WAVE-DEADLINE — ship.executeWaveTimeout and`, `# ship.executeWaveInterval resolve config-or-default and are forwarded to` and `# execute-plan-sdlc on the execute step's invocation.` become `# W5.2 — execute tunables are no longer resolved or forwarded by ship;` and `# execute-plan-sdlc's prepare script reads them from its own config.`. The line `# Fixes #392 / R35 — ship.execute.commitWaves forwarding to execute step` becomes `# W5.2 / R35 — ship.execute.commitWaves is no longer forwarded to execute`. Changes in `setup-prepare-exec.yaml`:
  - `- description: "setup-prepare: emits shipFields with 15 entries (7 base + 8 R57 tunables, issue #292, #506)"` → `- description: "setup-prepare: emits shipFields with 13 entries (7 base + 6 R57 tunables, W5.2)"`, and its `JSON.parse(output).shipFields.length === 15` → `=== 13`.
  - `- description: "setup-prepare: shipFields order is stable (steps → reviewThreshold → 8 R57 tunables, issue #292, #506)"` → `- description: "setup-prepare: shipFields order is stable (steps → reviewThreshold → 6 R57 tunables, W5.2)"`, and its `expected` list loses `,'executeWaveTimeout','executeWaveInterval'`.
- names: `flags.executeWaveTimeout`, `flags.executeWaveInterval`, `flags.executeCommitWaves`, `flags.commitWavesInvalidType` (all removed); `MAX_WAVE_TIMEOUT_SECONDS` (kept).
- mirror: the existing case shapes at `ship-prepare-exec.yaml:461-488` and `:883-894`.
- decisions: Key Decisions (`MAX_WAVE_TIMEOUT_SECONDS` stays; precedence); R-legacy-config.
- sync: `skill/execute.js` reads the legacy keys (Task 4); `ship-sdlc/SKILL.md:62` (Task 8); S2 ship R57.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] All twelve anchors print `1` before editing.
- [ ] `command grep -cE 'executeWaveTimeout|executeWaveInterval|executeCommitWaves|commitWavesInvalidType' plugins/sdlc-utilities/scripts/skill/ship.js` prints `0`; `command grep -cE "name: 'executeWave|executeWave(Timeout|Interval): [0-9]" plugins/sdlc-utilities/scripts/lib/ship-fields.js` prints `0`; `command grep -c 'MAX_WAVE_TIMEOUT_SECONDS' plugins/sdlc-utilities/scripts/lib/ship-fields.js` prints `2` (declaration and export).
- [ ] `node -e "const {SHIP_FIELDS}=require('./plugins/sdlc-utilities/scripts/lib/ship-fields.js'); console.log(SHIP_FIELDS.length)"` prints `13`.
- [ ] `command grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml` prints `209`; setup-prepare stays `22`.
- [ ] Consumer grep: `command grep -rlE 'executeCommitWaves|commitWavesInvalidType|flags\.executeWave' plugins tests --include=*.js --include=*.md --include=*.yaml --include=*.sh` lists exactly `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` and `tests/promptfoo/fixtures/ship-commit-waves-forwarding.md` (both Task 8), `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` (Must not touch; ship.js ignores unknown keys) and `tests/promptfoo/datasets/ship-prepare-exec.yaml` (the new assertions name the removed keys). `ship.js` and `ship-fields.js` are not listed. Report any other hit.
- [ ] Targeted run (test-run rule, `TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1/t7`) with `--filter-pattern "ship-prepare|setup-prepare"` reports 0 failures; then, as its own run, the R-W8.22 filter `"ship-step: \((t|u|u2|u3|u4)\) --after dispatch_execute|execute-plan-sdlc/cleanup-verify"` passes 9 of 9.

### Task 8: Ship skill text, ship reference files and the stale behavioral commit-waves case

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the `execute.commitWaves` paragraph (`:62`) and the `--auto` tier clause of the execute-plan-sdlc row (`:208`).
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — delete the banner and case at `:914-941`.
- Delete: `tests/promptfoo/fixtures/ship-commit-waves-forwarding.md`
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — drop the three removed flags-output keys and their three `sources` keys from both JSON examples.
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — drop the two keys from the `local.json` example; mark the two field rows deprecated.

**Notes:** Implements the cross-skill consequence of Change 5 (F-promptfoo-exec-conventions-and-ship-cases-16, -17). The behavioral case asserts that ship forwards `--commit-waves`, which is now false. It is removed, not run (no-auto-eval). The fixture is referenced only by that case. The spec change behind this edit is S2 (execute R35, ship R57), so spec-first holds.

**Anchors:** `command grep -cF -- 'When set to `true` in ship config, `--commit-waves` is appended to the execute step'"'"'s invocation;' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `1`; `command grep -cF -- '- description: "ship-sdlc: pipeline table surfaces --commit-waves in execute step when execute.commitWaves: true (#392)"' tests/promptfoo/datasets/ship-sdlc.yaml` prints `1`; `command grep -rl 'ship-commit-waves-forwarding' tests plugins | wc -l` prints `1`; `command grep -cF -- '(`--quality` then required)' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `1`.

**Anchors (reference files; each must print `1`):**

```bash
f=plugins/sdlc-utilities/skills/ship-sdlc/state-format.md; c=plugins/sdlc-utilities/skills/ship-sdlc/config-format.md
for a in '  "executeWaveTimeout": 1800,' '  "executeWaveInterval": 60,' '  "executeCommitWaves": false,' '    "executeWaveTimeout": 1800,' '    "executeWaveInterval": 60,' '    "executeCommitWaves": false,' \
  '    "executeWaveTimeout": "default",' '    "executeWaveInterval": "default",' '    "executeCommitWaves": "default",' '      "executeWaveTimeout": "default",' '      "executeWaveInterval": "default",' '      "executeCommitWaves": "default",'; do
  printf '%s  %s\n' "$(command grep -cxF -- "$a" "$f")" "$a"; done
for a in '    "awaitRemoteReviewers": ["copilot"],' '    "executeWaveTimeout": 1800,' '    "executeWaveInterval": 60'; do
  printf '%s  %s\n' "$(command grep -cxF -- "$a" "$c")" "$a"; done
printf '%s  rows\n' "$(command grep -cE '^\| `executeWave(Timeout|Interval)` \|' "$c")"   # must print 2
```

**Must not touch:** every other ship SKILL.md line; the `# R-post-version-ancestry (#349)` banner and every other case in `ship-sdlc.yaml`; every other key of both JSON examples in `state-format.md`; every other row and example line of `config-format.md`.

**Contract:**
- shape (docs): `ship-sdlc/SKILL.md:62`, whole paragraph:

  ```diff
  -The `execute.commitWaves` field (Fixes #392 / R35) controls per-wave WIP commits during the execute step. Default `false`. When set to `true` in ship config, `--commit-waves` is appended to the execute step's invocation; the execute-plan-sdlc skill then runs `git add -A && git commit -m "wip(execute): wave N — <titles>"` after each wave's G9 + G11 pass. The subsequent commit step (commit-sdlc) … unchanged. Resolution is centralized in `scripts/skill/ship.js` (per `scripts-over-llm-logic` and `flag-coherence-cross-skill` guardrails) — SKILL.md cites `step.invocation`, never raw `config.execute.commitWaves`.
  +The `execute.commitWaves` setting (R35) controls per-wave WIP commits during the execute step. Default `false`. execute-plan-sdlc's own prepare script resolves it (`.sdlc/config.json` `execute.commitWaves`, with the legacy `ship.execute.commitWaves` in `.sdlc/local.json` as a fallback); ship does not forward it. When it is `true`, the execute-plan-sdlc skill runs `git add -A && git commit -m "wip(execute): wave N — <titles>"` after each wave's G9 + G11 pass. The subsequent commit step (commit-sdlc) … unchanged.
  ```

  (`…` keeps the existing sentence about the `wip(execute):` squash verbatim.) In `ship-sdlc.yaml`, delete from the line `# Fixes #392 / R35 — execute.commitWaves forwarding behavior` together with the separator line above it, through the case's last rubric line `path in commit-sdlc as the pair that produces the final clean PR history.`. Keep the blank line and the `# ----` separator that open the `R-post-version-ancestry` banner.
  `state-format.md`: delete the twelve whole lines listed in the anchors (three flags keys and three `sources` keys in each of the two examples); the neighbour lines `"planModeBlocked": false,` and `"workspace": "derived"` stay, so both examples remain valid JSON.

  `config-format.md`, `local.json` example:

  ```diff
  -    "awaitRemoteReviewers": ["copilot"],
  -    "executeWaveTimeout": 1800,
  -    "executeWaveInterval": 60
  +    "awaitRemoteReviewers": ["copilot"]
     }
  ```

  `config-format.md`, field rows: in each `executeWave*` row, replace `Forwarded to \`execute-plan-sdlc\` as \`--wave-timeout\`.` (respectively `--wave-interval`) and `Only prompted in \`setup-sdlc\` when \`execute\` is in \`ship.steps[]\`.` with `**Deprecated:** ship-sdlc no longer resolves, prompts for or forwards this key; execute-plan-sdlc's prepare script reads it only as a fallback below \`execute.waveTimeout\` (respectively \`execute.waveInterval\`) in \`.sdlc/config.json\`.`
  `ship-sdlc/SKILL.md:208` (Q16, ship A3 after S1):

  ```diff
  -… `--auto` forwarded only when ship runs with `--auto` (`--quality` then required). In interactive runs …
  +… `--auto` forwarded only when ship runs with `--auto` (no tier is forwarded unless the user passed `--quality`; execute-plan-sdlc resolves it, `balanced` unless resumed — execute A6). In interactive runs …
  ```
- names: ship SKILL.md paragraph on `execute.commitWaves`; the `:208` row clause; deleted case and fixture; `state-format.md` example keys; `config-format.md` example and rows.
- mirror: the paragraph's own sentence order.
- decisions: remove, not rewrite, the behavioral case (Deviations table; no behavioral runs in the plan).
- sync: S2 execute R35; Task 7's ship-prepare cases.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] Anchors print `1`, `1`, `1`, `1` before editing.
- [ ] After editing: `command grep -cE 'executeWave|executeCommitWaves' plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` prints `0`; `command grep -c 'Forwarded to `execute-plan-sdlc`' plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` prints `0`; `command grep -c '\*\*Deprecated:\*\* ship-sdlc no longer resolves' plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` prints `2`.
- [ ] After editing: `command grep -cF -- '(`--quality` then required)' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`, and `command grep -cF -- 'execute-plan-sdlc resolves it, `balanced` unless resumed — execute A6' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `1`.
- [ ] After editing: `command grep -c 'commit-waves' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`; `command grep -rl 'ship-commit-waves-forwarding' tests plugins | wc -l` prints `0`; `command grep -c '^- description:' tests/promptfoo/datasets/ship-sdlc.yaml` is one less than before (record both numbers).
- [ ] The dataset still parses as YAML: `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/ship-sdlc.yaml > /dev/null; echo $?` prints `0`. No behavioral run (no-auto-eval).

### Task 9: SKILL.md runs the prepare script; cost-tiers and scripts README rows

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 5, Task 6
**Verify:** tests, lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — Step 0 gate-time check, Step 1 prepare block and guardrail loading, flag-parse paragraphs, workspace derivation, rebase, resume quality, Step 4 quality, Step 5b manifest.
- Modify: `docs/cost-tiers.md` — the `:62` bullet's trailing sentence.
- Modify: `plugins/sdlc-utilities/scripts/README.md` — the execute-plan-sdlc row (`:44`).

**Notes:** Implements W5.2 Change 4 and Change 6 (doc rows), rulings w1-preflight Q1 and Q2, and the Q16 printed line `Quality tier: balanced (default under --auto)` (F-execute-skill-md-and-docs-derivations-1…13). S1 and S2 are the spec-first commits. The behavioral case `execute-plan-sdlc.yaml:54` asserts "execution guardrails" and "guardrail" and the pre-wave/post-wave rubric. Keep the sentence "Loaded N execution guardrails." and the `execute.guardrails` vs `plan.guardrails` note verbatim. Apply the edits bottom-up. Locate every anchor by content (`grep -cF` prints `1`); if any does not, STOP and report.

**Anchors (each must print `1` in SKILL.md unless stated):**

```bash
k=plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md
for a in '**Gate-time existence check (resolves the resume carve-out'"'"'s dependency on Step 1):**' \
  '**Guardrail loading:** Load execution guardrails from project config:' \
  "console.log(JSON.stringify(execute?.guardrails || []));" \
  '  6. Load the `quality` from the state file (CLI `--quality` overrides if provided).' \
  'quality-tier selection uses the value from `--quality` (required when `--auto` is set).' \
  '**Parse `--commit-waves` (Fixes #392 / R35):** If `--commit-waves` was passed, store `commitWaves = true`.' \
  '**Parse `--wave-timeout <seconds>` / `--wave-interval <seconds>` (R-WAVE-DEADLINE, #506):**' \
  '**If `--branch` was NOT passed (standalone invocation):** Derive the workspace as a 2-way decision:' \
  "There is no \`WORKTREE_PATH\` — execute-plan-sdlc never creates a worktree." \
  '**Pre-execution rebase:** If `--rebase auto` was passed, rebase onto the default branch before executing the plan.' \
  'Valid values: `full` (Speed), `balanced` (Balanced), `minimal` (Quality). Legacy `A`/`B`/`C` are accepted and normalized. Invalid values → fall back to interactive selection.' \
  "   WAVE_START_RESULT=\$(node \"\$STATE_SCRIPT\" wave-start --wave <N> --tasks-json '<json-array-of-task-objects>')" \
  '   **Manifest extensions (Fixes #392 — R33/R34):** every wave manifest MUST additionally carry:' \
  '5. Provide `priorWaveSummary` (bounded, not raw `priorWaveContext`) by running the summarizer between waves (R-BYTE-BUDGET, #432):' \
  '**Parse `--auto`:** If `--auto` was passed, store the flag.' \
  '**Parse `--plan <path>` (R-PLANFILE):** If `--plan <path>` (or the positional plan-file-path argument) was passed, store it as `EXPLICIT_PLAN_FILE`.' \
  '  1. Find the most recent state file for the current branch in `<main-worktree>/.sdlc/execution/`. If none found,' \
  '`Wave N exceeded executeWaveTimeout (<n>s) — <k> task(s) terminated.`' \
  'For each task, determine three things:' \
  'After classification, Read `./classifying-and-waving-tasks.md` for wave-building algorithm and adaptive sizing.' \
  '(`--quality full|balanced|minimal`) or custom editing'; do
  printf '%s  %s\n' "$(command grep -cF -- "$a" "$k")" "$a"; done
command grep -c 'node -e' "$k"   # must print 5
command grep -cF -- 'A prepare-script subcommand may replace this later (W5.2); update this line when it exists.' docs/cost-tiers.md   # 1
command grep -cF -- '| execute-plan-sdlc | `state/execute.js`, `util/worktree-create.js` |' plugins/sdlc-utilities/scripts/README.md   # 1
```

**Must not touch:** the `node -e` blocks at `:455` (parseWaveSummary), `:943` (validateChangeStrict) and `:959` (parseTasks); the `markTaskDone`/`openspec-step.js` prose; the R41 halt message (`:34-38`) and its STOP paragraph; Resume detection steps 2–5 and 7–9; the Post-compact recovery section; Step 3 and Step 5c onward except the lines named; the rest of Step 2 (the complexity, risk, dependency and model bullets); the `argument-hint` frontmatter; the first sentence of the cost-tiers bullet; every other README row.

**Contract:**
- shape (code): SKILL.md edits (now → after). `<PLUGIN_ROOT>` is the literal placeholder; the block mirrors `commit-sdlc/SKILL.md:40-54`.

  1. **Step 1 opens with the prepare call.** Insert directly under `## Step 1 (LOAD): Load and Validate Plan`:

     ````markdown
     **Prepare (implements C13, R41, A6):** Run the prepare script once, before anything else in this step. Forward the skill's own arguments verbatim; add `--resume` when `implicitResume` is set (R36).

     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line.
     EXECUTE_CONTEXT_FILE=$(node "<PLUGIN_ROOT>/scripts/skill/execute.js" --output-file $ARGUMENTS)
     EXIT_CODE=$?
     # No EXIT trap: each Bash call is its own shell. Remove the manifest with rm -f once read.
     ```

     **Flag reading rule (flag-coherence):** throughout this skill, "`--auto` is set" / "`--auto` mode" means `flags.auto === true`, "`--resume` was passed" means `flags.resume === true`, and `EXPLICIT_PLAN_FILE` is `plan.path` when `flags.plan` is set. No site re-parses `$ARGUMENTS`.

     Read `EXECUTE_CONTEXT_FILE` as `EXECUTE_CONTEXT` and run `rm -f "$EXECUTE_CONTEXT_FILE"`. Exit code 1: print each `errors[].message` (a `missingPlanFile` message is the R41 halt text) and STOP. Exit code 2: print `Script error — see output above` and STOP. Exit code 0: print one summary line per field — plan path and task count, `waves.length`, `workspace.decision`, `resume.found`, and the quality tier. When `flags.sources.quality` is `default`, print exactly `Quality tier: balanced (default under --auto)`. Every later step reads `flags.*`, `plan`, `classificationFloor`, `waves`, `guardrails`, `workspace`, `resume` and `openspec` from `EXECUTE_CONTEXT`; never re-derive them (C14–C16).
     ````

  2. **Step 0 gate-time check.** Replace the paragraph that starts `**Gate-time existence check (resolves …):**` (it instructs a manual glob and `state read`) with:
     `**Gate-time existence check:** first evaluate the Post-compact recovery signals (R36, below) so that \`implicitResume\` is known, then run the Step 1 prepare call now. The gate applies exactly when it exits 1 with \`errors[].id === 'missingPlanFile'\` — the script already applies the resume exemption (state \`planPath\`, R40) deterministically. Then continue with Step 1 using that same output; do not run the prepare call twice.`
  3. **Guardrail loading.** Replace the `> **Substitute <PLUGIN_ROOT>** …` line, the bash fence with `node -e … readSection(process.cwd(), 'execute')` and the line `Parse the JSON output. If the array is non-empty, …` with:
     `Read \`guardrails\` from \`EXECUTE_CONTEXT\` (the \`execute.guardrails\` section of \`.sdlc/config.json\`, P5). If the array is non-empty, store it as \`activeGuardrails\` and print: "Loaded N execution guardrails." If empty: "No execution guardrails configured." This is backward compatible — no guardrails means no change in behavior.`
     Keep the heading line `**Guardrail loading:** …` and the `Note: this reads \`execute.guardrails\` …` line.
  4. **Resume step 6:** `  6. Use \`flags.quality\` from \`EXECUTE_CONTEXT\` (CLI \`--quality\` → the resumed state's \`quality\` when \`--resume\`/\`implicitResume\` → the \`--auto\` default, A6). When it is \`null\` because the resume was confirmed at the interactive prompt (no \`--resume\`), use the \`quality\` field of the state file read in step 3.`
  5. **Parse `--auto`:** the whole paragraph becomes `**Parse \`--auto\`:** Read \`flags.auto\`. Auto mode suppresses interactive prompts: resume detection auto-resumes if state exists, high-risk gates auto-approve, and quality-tier selection uses \`flags.quality\` (A6: \`--quality\`, else the resumed tier, else \`balanced\`).`
  5a. **Parse `--plan`:** `**Parse \`--plan <path>\` (R-PLANFILE):** If \`--plan <path>\` (or the positional plan-file-path argument) was passed, store it as \`EXPLICIT_PLAN_FILE\`.` → `**Parse \`--plan <path>\` (R-PLANFILE):** When \`flags.plan\` is set (from \`--plan <path>\` or the positional plan-file-path argument), set \`EXPLICIT_PLAN_FILE = plan.path\` from the prepare output.` (the rest of the paragraph stays).
  5b. **Resume step 1:** `  1. Find the most recent state file for the current branch in \`<main-worktree>/.sdlc/execution/\`. If none found,` → `  1. Use \`resume.stateFile\` from \`EXECUTE_CONTEXT\` (the most recent state file for the current branch). If \`resume.found\` is false,` (the rest of the line stays).
  6. **Parse `--commit-waves`:** `**Parse \`--commit-waves\` (R35):** Set \`commitWaves = flags.commitWaves\` (CLI \`--commit-waves\`, else \`execute.commitWaves\`, else the legacy \`ship.execute.commitWaves\`, else \`false\`).` Keep the rest of the paragraph and its table.
  7. **Parse `--wave-timeout` / `--wave-interval`:** Replace the paragraph body with `Set \`WAVE_TIMEOUT = flags.waveTimeout\` and \`WAVE_INTERVAL = flags.waveInterval\` (CLI flag, else \`execute.waveTimeout\` / \`execute.waveInterval\` in \`.sdlc/config.json\`, else the legacy \`ship.executeWaveTimeout\` / \`ship.executeWaveInterval\` in \`.sdlc/local.json\`, else the built-in default). Both reach the wave-runner through the \`wave-start\` manifest (Step 5b).` In the table, replace `1800 (\`BUILT_IN_DEFAULTS.executeWaveTimeout\`)` with `1800 (\`execute.waveTimeout\`)` and `60 (\`BUILT_IN_DEFAULTS.executeWaveInterval\`)` with `60 (\`execute.waveInterval\`)`.
  8. **Parse `--branch`:** in that paragraph, `capture it as \`EXECUTE_NEW_BRANCH\` immediately` → `set \`EXECUTE_NEW_BRANCH = flags.branch\``.
  9. **Workspace:** replace everything from `**If \`--branch\` was NOT passed (standalone invocation):** …` through the line before `There is no \`WORKTREE_PATH\`` (steps 1–3, the `node -e` fence at `:186` and the branch-name prose) with: `Workspace is \`workspace.decision\` from the prepare output. When \`branch\`: run \`git checkout -b "<workspace.suggestedBranch>"\`. When \`continue\`: run in place.` followed by `Set \`EXECUTE_NEW_BRANCH\` to \`workspace.suggestedBranch\` when a branch was created. Do not use the \`gitStatus\` snapshot from conversation context. (R16, R30)`.
  10. **Pre-execution rebase:** in that block, `If \`--rebase auto\` was passed` → `If \`flags.rebase\` is \`auto\``; `If \`--rebase auto\` and not up to date` → `If \`flags.rebase\` is \`auto\` and not up to date`; `If \`--rebase prompt\`` → `If \`flags.rebase\` is \`prompt\``; `If \`--rebase skip\` or absent` → `If \`flags.rebase\` is \`skip\``.
  11. **Step 4 Quality auto-selection:** `If the user invoked the skill with \`--quality <full|balanced|minimal>\` (e.g., …), apply` → `If \`flags.quality\` is set, apply`. Replace the `Valid values: …` line with `Valid values: \`full\` (Speed), \`balanced\` (Balanced), \`minimal\` (Quality); legacy \`A\`/\`B\`/\`C\` are normalized by the prepare script. Under \`--auto\` an invalid value never reaches this step: the prepare call reports \`invalidQuality\` and stops (A2). In an interactive run an invalid value is a prepare warning and \`flags.quality\` is \`null\`. When \`flags.quality\` is \`null\` (interactive, no resumed tier), present the selection prompt below.`
  11a. **Step 2 (CLASSIFY):** `For each task, determine three things:` → `Start from \`classificationFloor\` (P3) and \`waves\` (P4) in \`EXECUTE_CONTEXT\`. Raise a task's complexity or risk only with a stated reason; never lower it. Do not rebuild the waves — Step 3 may move a task later with a stated reason (P4).`; and `After classification, Read \`./classifying-and-waving-tasks.md\` for wave-building algorithm and adaptive sizing.` → `Read \`./classifying-and-waving-tasks.md\` for the rules the prepare script applied (and for the batching rules of steps 7–8).`
  11b. **Quality Gates table, G3 row:** `(\`--quality full|balanced|minimal\`) or custom editing` → `(\`--quality full|balanced|minimal\`, or the A6 \`--auto\` default) or custom editing`.
  12a. **Timeout warning line:** `Wave N exceeded executeWaveTimeout (<n>s) — <k> task(s) terminated.` → `Wave N exceeded waveTimeout (<n>s) — <k> task(s) terminated.`
  12. **Step 5b:** in item 4, change the wave-start call to:

      ```bash
      WAVE_START_RESULT=$(node "$STATE_SCRIPT" wave-start --wave <N> --tasks-json '<json-array-of-task-objects>' --manifest-json '<json>')
      ```

      Add the sentence: `Both JSON arguments are single-quoted; write any \`'\` inside them as \`'\''\`.`

      Add the sentence: `\`--manifest-json\` is the wave's \`waves[n]\` record from \`EXECUTE_CONTEXT\` plus \`qualityTier\`, \`totalWaves\`, \`waveTimeout: WAVE_TIMEOUT\`, \`waveInterval: WAVE_INTERVAL\`, \`guardrails: activeGuardrails\` and per-task \`{ id, complexity, risk, assignedModel, effort, verifyToken }\`.` Then delete from `   **Manifest extensions (Fixes #392 — R33/R34):**` through the closing fence of the `Concrete example:` JSON block, and put in its place: `   The manifest is \`wave-start\`'s \`manifest\` field — pass it verbatim. (P9; R-WAVE-DEADLINE, R33/R34)`. Keep item 4's first sentence, the Fact-sheet, Notes-source and Contract paragraphs, and item 5 onward.

  `docs/cost-tiers.md:62` (ruling w1-preflight Q1 (a)):

  ```diff
  -… by the executor. A prepare-script subcommand may replace this later (W5.2); update this line when it exists.
  +… by the executor. `plugins/sdlc-utilities/scripts/skill/execute.js` emits the classification floor and wave structure; the per-task model is still chosen here.
  ```

  `plugins/sdlc-utilities/scripts/README.md:44`:

  ```diff
  -| execute-plan-sdlc | `state/execute.js`, `util/worktree-create.js` |
  +| execute-plan-sdlc | `skill/execute.js`, `state/execute.js` |
  ```

- names: `EXECUTE_CONTEXT_FILE`, `EXECUTE_CONTEXT`, `EXIT_CODE`; fields `flags.quality`, `flags.sources.quality`, `flags.commitWaves`, `flags.waveTimeout`, `flags.waveInterval`, `flags.rebase`, `flags.branch`, `workspace.decision`, `workspace.suggestedBranch`, `guardrails`, `manifest`.
- mirror: `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md:40-54` (prepare block and exit-code handling).
- decisions: Key Decisions (one prepare call; read fields); Deviations table (`argument-hint` unchanged); flag-coherence-cross-skill (every rewritten site cites `flags.*`).
- sync: S2 P1–P9 and C13–C16; `check-consistency.js` rules 2–5 and 11; behavioral case `execute-plan-sdlc.yaml:54` wording.

**Acceptance criteria:**
- [ ] Worker rule followed: on a classifier refusal you stopped and reported, never switched tools to get past it, and fetched public docs with WebFetch only. You made no commit (the ship run's commit step makes the single commit).
- [ ] Before editing, the 21 SKILL.md anchors print `1`, `node -e` prints `5`, and the two doc anchors print `1`.
- [ ] After editing: `command grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `3`; `command grep -cF -- 'node "<PLUGIN_ROOT>/scripts/skill/execute.js" --output-file $ARGUMENTS' …/SKILL.md` prints `1`; `command grep -cF -- 'Quality tier: balanced (default under --auto)' …/SKILL.md` prints `1`; `command grep -cF -- "The manifest is \`wave-start\`'s \`manifest\` field — pass it verbatim." …/SKILL.md` prints `1`; `command grep -cE 'required when `--auto` is set|BUILT_IN_DEFAULTS|fall back to interactive selection|executeWave' …/SKILL.md` prints `0`; `command grep -cF -- 'Loaded N execution guardrails.' …/SKILL.md` prints `1`; `command grep -cF -- '**Flag reading rule (flag-coherence):**' …/SKILL.md` prints `1`; `command grep -cF -- 'store it as `EXPLICIT_PLAN_FILE`' …/SKILL.md` prints `0`; `command grep -cF -- 'use the `quality` field of the state file read in step 3' …/SKILL.md` prints `1`; `command grep -cF -- 'Start from `classificationFloor` (P3) and `waves` (P4)' …/SKILL.md` prints `1`; `command grep -cF -- 'or the A6 `--auto` default) or custom editing' …/SKILL.md` prints `1`; `command grep -cF -- 'For each task, determine three things:' …/SKILL.md` prints `0`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 (rules 2–5 and 11 now apply to execute-plan-sdlc).
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0, and `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root . --strict` exits 0.
- [ ] Consumer grep (addendum C9): `command grep -rnE 'Manifest extensions \(Fixes #392|BUILT_IN_DEFAULTS\.executeWave|worktree-create\.js|executeWave(Timeout|Interval)' plugins docs tests --include=*.md --include=*.yaml --include=*.js | command grep -vE '^docs/(skills|plans)/'` is expected to list only legacy-key mentions that this wave keeps on purpose: `docs/specs/*` (the deprecated `ship.executeWave*` keys named in S2), `skill/execute.js` (the legacy fallback), `lib/ship-fields.js` (the reworded `MAX_WAVE_TIMEOUT_SECONDS` comment), `tests/promptfoo/datasets/ship-prepare-exec.yaml` (assertions that the removed keys are absent), `ship-sdlc/config-format.md` (the deprecated rows), `execute-plan-sdlc/wave-runner-template.md` and `execute-plan-sdlc/state-format.md` (names in prose; W5.5). This is an unverified prediction: report every hit with its file:line instead of editing it.

## Final Shape

- execute-plan-sdlc now has a prepare script:
  - `scripts/skill/execute.js` resolves every flag with provenance: the CLI, then `execute.*` in `.sdlc/config.json`, then the legacy ship keys, then the defaults.
  - It runs the config-version check.
  - It resolves the quality tier per A6.
  - It parses the plan with `lib/plan-parse.js`.
  - It emits the classification floor, the wave structure with `expectedFiles` and `verificationHint`, the workspace decision with a suggested branch name, the resume state and the OpenSpec mapping.
- SKILL.md runs it once in Step 1, reads its fields everywhere, and keeps three `node -e` blocks. Per wave, it passes the manifest that `wave-start --manifest-json` builds, unchanged.
- Ship forwards only `--plan`, `--auto` and `--quality`. Its setup questionnaire has 13 ship fields.
- The legacy `ship.executeWave*` and `ship.execute.commitWaves` keys still work, read by execute.
- Docs and tests that described the old forwarding are corrected or removed:
  - the cost-tiers bullet and the scripts README row;
  - the ship skill paragraph;
  - the ship and setup exec cases;
  - one behavioral case.
- The new `execute-prepare-exec.yaml` has 34 cases, and the W8.22 regression set still passes.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement (source checklist) | Task(s) | Status |
|---|---|---|
| 7 One ship run, one ≤ 72-char commit | header; every task's acceptance | covered |
| 8 W5.2 Changes 1–6 and Fold-in (a)(1)–(2) | Tasks 1–9 | covered |
| 9 R-Q16 cases (e)–(h) and the ship non-synthesis case | Task 4, Task 7 | covered |
| 10 R-legacy-config | Task 3, Task 4 | covered |
| 11 R-ship-args (rewrite `:719`, name every changed case) | Task 7 | covered |
| 12 Ruling Q1 (a) and Q2 (b) cases | Task 4 (k1–k4), Task 5 (l1–l8) | covered |
| 13 R-W8.22 set re-run, gate untouched | Verification (2), Task 7 | covered |
| 14 Format, anchors, Must-not-touch, test-run rules | all tasks; Verification | covered |
| 15 User-visible changes for 0.32.0 | Context | covered |
| 16 Worker rule in task text | every task's acceptance | covered |
| 17 Plan readings | Plan readings | covered |

Review: round 1 Issues Found, fixed (blocking: G10, G20, G21, workspace-mode, idempotency, flag-coherence, cross-skill; warnings incl. untested wave splits, fenced Contract loss, runId wording). Round 2 Issues Found, fixed (architecture: git-status scope, fence indentation; suggestions applied). Round 3: architecture, requirements and risk lenses Approved; lanes clean except one G20 wording finding (Task 1 Notes restated the Contract), fixed after round 3 as a wording-only edit with no re-review. Open advisories: G17 review-dimension trigger updates (out of scope); unverified predictions are labelled in the acceptance text.

Fix round 1 (planreview-wave-1): B1, M1–M5, m1–m8 applied or recorded per the orchestrator's decisions; no further review round (the fix brief asks for none). Fix round 2 (ruling w1-plancheck B1, m2): a relative CLI plan path resolves against `process.cwd()`, case (l9) added and (l8) strengthened; post-ship site mirror commit stated in the header.

Verdict: All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
