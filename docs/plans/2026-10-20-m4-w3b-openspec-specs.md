# OpenSpec Step Script — Spec Consequences (W4.4) Implementation Plan

**Goal:** Amend the specs first, so they state what the W4.4 feature plan (`2026-10-20-m4-w3b-openspec.md`) then implements: one `openspec-step.js` script behind the ship OpenSpec steps, execute's task flip, pr's prepare field and plan's detection.
**Architecture:** One edit pass on four contract-shaped specs: `docs/specs/ship-sdlc.md`, `docs/specs/execute-plan-sdlc.md`, `docs/specs/pr-sdlc.md` (restructured by plan 1) and `docs/specs/plan-sdlc.md`. Requirement ids and positions do not change. Only bullet text and P-TRANS-1 table rows change, and one table row is added. It ships as the second commit of wave 3b, after the pr-sdlc restructure and before the feat run (ruling w3b-preplan R10, w2-specfirst).
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-3b-plan-source.md (item W4.4 Changes 6–7; judge readings W44-8, W44-R2–R7, W44-R9, W44-R10, C7; ruling w3b-preplan), /workspace/sdlc-marketplace/.sdlc/orchestration/m4/preflight-wave-3b.md §1
**Verification:** in ONE Bash call, for each `S` in `docs/specs/ship-sdlc.md docs/specs/execute-plan-sdlc.md docs/specs/pr-sdlc.md docs/specs/plan-sdlc.md`: `RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | command grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; for S in …; do diff <(git show HEAD:$S | ids) <(ids < $S) && echo "SAME $S"; done` prints four `SAME` lines; then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.

---

## Context

**What problem does this change solve?**

W4.4 moves the OpenSpec work of three skills into one script, `scripts/skill/openspec-step.js`. Several spec lines then describe the old mechanism, and the spec is the source of truth. So these lines change first, and the feat plan implements them:

- ship I13 names the library helpers, not the script that now wraps them.
- ship `R-progressive-disclosure` says the skill has exactly two companion files. The skill already has four, and W4.4 adds a fifth (`openspec-steps.md`).
- ship P-TRANS-1 (the step transition table) has no row for the archive prompts, the abort answer or the emitted commands.
- execute I13 names `markTaskDone` directly; execute now calls it through `openspec-step.js flip`.
- pr R13 says nothing about where the OpenSpec context comes from. pr's prepare script now reports it as a new `openspec` field.
- plan I4 does not say that Step 0 now reads OpenSpec state from `openspec-step.js detect`.

**What prompted this change now?**

The source orders the wave as: pr-sdlc restructure, then these spec consequences, then the feat commit (ruling w3b-preplan R10). The `spec-first` guardrail also requires a spec update before any SKILL.md behaviour change. The feat plan changes the SKILL.md of ship, execute, pr and plan.

**What does success look like?**

- The amended lines read as the Contract below.
- The id sets of all four specs are identical to HEAD (`SAME` four times).
- `validate-spec-shape.js --root .` prints nothing on stdout.
- `command grep -c 'exactly five files' docs/specs/ship-sdlc.md` prints `1` (the item's Done-when).

## Research Findings

- All four specs are contract-shaped once plan 1 lands. `pr-sdlc.md` gains `## Inputs and flags` in plan 1; the others already have it (pre-flight §3). Rule 9 (W3.5 first) is therefore satisfied for every spec this plan touches.
- ship spec (at 10c0978): `R-progressive-disclosure` at :381, its parts at :382–383 and its Acceptance at :384; I13 at :419; the P-TRANS-1 rows for the OpenSpec steps at :288 and :289. Each quoted text below occurs exactly once (checked with `command grep -F … | wc -l`).
- execute spec I13 is at `docs/specs/execute-plan-sdlc.md:308`. The two I13s are different ids in different specs; do not mix them up (brief contradiction 4).
- pr spec R13 (`docs/specs/pr-sdlc.md:33` at 10c0978) and I4 (:156) say nothing about the mechanism. The pr spec has no P-field for the new key, and the source requires `SAME` (no new id). So the new field is stated inside R13.
- plan spec I4 (`docs/specs/plan-sdlc.md:273`) names the flags only. P1–P3 (plan.js `openspec.*` output) stay true, because plan.js keeps its detection.
- Lines this plan deliberately leaves alone:
  - ship R22 ("dispatched inline via bash") and R-verify-openspec-3 ("a Bash invocation of `openspec validate --strict`"): judge reading C7 says they stay true enough, because Bash runs the script. They are listed as follow-ups.
  - ship I12 ("opt-in, inline Bash; runs `openspec validate --strict <change>`"): the same reasoning as C7, so also a follow-up.
  - ship R27 ("skipped with reason 'already archived'"): ship.js still skips an archived change at prepare time. The rare runtime case records `"archived <name>"` with `reason: "already archived"` (ruling W44-R4). This is a follow-up and is not edited.
  - R-archive-sync-1…4: the item's Must-not-touch.
- `validate-spec-shape.js` rejects body lines with `#<digits>`, `(removed` or `**Model:**`. Table rows are not id lines, so a new P-TRANS-1 row keeps the id set unchanged.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| pr R13 and plan I4 amended | no | in this commit, although the given subject names ship and execute | source: the plan covers "any other spec line the feat plan relies on"; the `spec-first` guardrail needs a spec line before the pr and plan SKILL.md changes; `SAME` forbids a new P-id, so the field goes into R13 |
| Commit subject | no | kept verbatim from the source | the body lists all four specs |
| P-TRANS-1 rows | no | `:288` and `:289` `when` cells rewritten; one row added for `abort` | rulings W44-R2 (decision and commands), W44-R3 (abort), W44-R4 (resultText), W44-R5 (verify non-halting), W44-R6 (name check) state the behaviour; the table must name it (P-TRANS-2) |
| R22, R-verify-openspec-3, I12, R27 | no | not edited; listed as follow-ups in the PR's Plan readings | judge reading C7 (R22, R-verify-openspec-3); I12 and R27 by the same reasoning |
| Wordings | no | drafted from the item and the rulings' texts | the item gives exact text for I13 and R-progressive-disclosure only |

## Key Decisions

**Problem in one sentence:** W4.4 makes six spec statements stale or incomplete, and the spec is the source of truth, so they are amended before the code that implements them.

- **Ids unchanged.** Only text changes, plus one new table row. P-5 must print `SAME` for all four specs.

- **The new pr field lives in R13, not in a new P-id.** The source requires `SAME` for every touched spec. R13 is the requirement the field serves, so the field's shape is written there.

- **Follow-ups, not fixes, for the "inline Bash" wording.** C7 rules that R22 and R-verify-openspec-3 stay. I12 and R27 have the same kind of drift and are treated the same way. This keeps the commit to what the feature needs.

- **Non-goals.** No SKILL.md, script, test or doc edits. No other requirement is touched. `site/src/content-source/**` is not hand-edited; copy-docs runs once after the third ship run.

- **Failure audience.** Spec readers and the spec validators. A wrong edit fails `validate-spec-shape.js` or the id-set check. A wrong wording misleads the feat executor, who implements against these lines.

## Contract Examples

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY ship `I13`, `R-progressive-disclosure`, two P-TRANS-1 rows and ADD one P-TRANS-1 row; MODIFY execute `I13`, pr `R13`, plan `I4`; no ids added or removed.
- names: the ids above.
- mirror: neighbouring bullets and P-TRANS-1 rows (the `confirm_<s>` row's `cancel` wording).
- decisions: ids and positions unchanged; texts follow the item (I13, R-progressive-disclosure) and rulings W44-R2…R9.
- sync: feat plan `2026-10-20-m4-w3b-openspec.md` implements these lines and STOPs if they are absent.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task edits only four spec markdown files; no source code is created or modified |
| no-ci-bypass | error | PASS | Plan runs validate-spec-shape.js and does not skip CI |
| no-auto-eval | error | PASS | No promptfoo eval runs planned |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Only lines the feat plan relies on are edited; R22, R-verify-openspec-3, I12 and R27 are explicitly deferred |
| single-responsibility-tasks | warning | PASS | One task with one deliverable: spec consequences of openspec-step.js |
| scripts-over-llm-logic | error | PASS | The spec lines move OpenSpec logic into a script |
| yagni | warning | PASS | No speculative additions; only lines needed by the feat plan |
| cross-skill-consistency | error | PASS | The ship, execute, pr and plan specs are amended together |
| pr-link-github-issue | error | PASS | Tracking is local todo #9006 with no GitHub issue; the commit subject carries #9006 |
| dry | warning | PASS | No duplicated logic; the pr R13 field is stated once |
| kiss | warning | PASS | Text-only edits, ids unchanged |
| spec-first | error | PASS | This plan is the spec update and is ordered before the SKILL.md feat plan |
| project-agnostic | error | PASS | Specs describe plugin behaviour; no repo-local config is edited |
| flag-coherence-cross-skill | error | PASS | No SKILL.md decision sites are added; the pr field is resolved in the prepare output |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are introduced |
| flag-resolution-single-source | warning | PASS | The `<decision>` mapping and the pr openspec field each have a single source |
| state-premise | error | PASS | Key Decisions states the problem in one sentence |
| smallest-viable-cut | warning | PASS | Scope is limited to the lines the feat plan needs; follow-ups are listed |
| failure-audience | warning | PASS | Key Decisions names spec readers, validators and the feat executor |
| explicit-non-goals | warning | PASS | Non-goals are listed |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions and Deviations, and Task 1 has STOP rules |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added in the specs |
| workspace-mode-compatibility | error | PASS | No state, path or cwd logic changes; docs only |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts or volatile bytes are touched |

## Tasks

### Task 1: Spec consequences of openspec-step.js

**Complexity:** Standard
**Risk:** Low
**Depends on:** none (plan 1, `2026-10-20-m4-w3b-pr-spec.md`, must have been committed first; its commit is HEAD~0 or an ancestor)
**Verify:** build

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — I13, R-progressive-disclosure (one sentence and the Acceptance line), P-TRANS-1 rows for `verify_openspec`/`archive_openspec`, one new row.
- Modify: `docs/specs/execute-plan-sdlc.md` — I13.
- Modify: `docs/specs/pr-sdlc.md` — R13.
- Modify: `docs/specs/plan-sdlc.md` — I4.

**Notes:** Run every anchor before editing. If any count is not exactly `1`, STOP and report the discrepancy; do not search for an alternative and do not guess (plan §0 rule 2). In particular, `docs/specs/pr-sdlc.md` must already contain `## Inputs and flags` (plan 1 landed); if `command grep -c '^## Inputs and flags' docs/specs/pr-sdlc.md` is not `1`, STOP. No text may contain `#` followed by digits. List each amended line before and after in the report, for the PR's Plan readings.

**Anchors (each must print `1`):**

```bash
c() { printf '%s  %s\n' "$(tr -d '\r' < "$1" | command grep -F -- "$2" | wc -l)" "$1"; }
c docs/specs/ship-sdlc.md '- I13: `lib/openspec.js` — `validateChangeStrict`, `isArchived`, `runArchive` helpers for the `archive-openspec` step'
c docs/specs/ship-sdlc.md 'The canonical companion file set under `plugins/sdlc-utilities/skills/ship-sdlc/` is exactly two files: `entry-modes.md` (entry-mode handlers `--init-config`, `--gc`, dry-run) and `reference.md` (Error Recovery, Learning Capture, Gotchas, DO NOT). No other companion files are permitted; adding a third requires amending this requirement.'
c docs/specs/ship-sdlc.md '  - Acceptance: `entry-modes.md` and `reference.md` exist under `plugins/sdlc-utilities/skills/ship-sdlc/`;'
c docs/specs/ship-sdlc.md '| `verify_version_tag` | `verify_openspec` → `archive_openspec` | per step status (W4.4 `openspec-step.js`) |'
c docs/specs/ship-sdlc.md '| `archive_openspec` | `dispatch_pr` | — (interactive: via `confirm_pr`) |'
c docs/specs/execute-plan-sdlc.md '- I13: `lib/openspec.js::markTaskDone` — mutator called per completed-and-grouped plan task to flip OpenSpec `tasks.md` checkboxes (R37).'
c docs/specs/pr-sdlc.md '- R13: OpenSpec enrichment: when an active OpenSpec change is detected, use proposal.md for Business Context/Benefits and design.md for Technical Design'
c docs/specs/plan-sdlc.md '- I4: OpenSpec — optional spec-driven planning via `--spec` or `--from-openspec`'
```

**Must not touch:**
- In `docs/specs/ship-sdlc.md`: every other line of `R-progressive-disclosure` (the id, the opening sentence up to "(`classifying-and-waving-tasks.md`, `wave-runner-template.md`, `recovering-from-failures.md`).", the `workspace-worktree.md` sentence, part 1, part 2 with the HARD GATE sentence, and the rest of the Acceptance line after `ship-sdlc/`;); R21–R27; R-archive-sync-1…6; R-verify-openspec-1…5; I12; every other P-TRANS-1 row.
- Every other line of all four specs; every file outside them.

**Contract:**
- shape (openspec): MODIFY these lines, ADD one table row; no ids added or removed.

  ```diff
  # docs/specs/ship-sdlc.md — I13 (whole line; item Change 6)
  -- I13: `lib/openspec.js` — `validateChangeStrict`, `isArchived`, `runArchive` helpers for the `archive-openspec` step
  +- I13: `scripts/skill/openspec-step.js` (wraps `lib/openspec.js`) — `detect|flip|validate|archive`

  # docs/specs/ship-sdlc.md — R-progressive-disclosure, one sentence inside the first line (item Change 7 + W44-R9)
  -… The canonical companion file set under `plugins/sdlc-utilities/skills/ship-sdlc/` is exactly two files: `entry-modes.md` (entry-mode handlers `--init-config`, `--gc`, dry-run) and `reference.md` (Error Recovery, Learning Capture, Gotchas, DO NOT). No other companion files are permitted; adding a third requires amending this requirement. (The former …
  +… The canonical companion file set under `plugins/sdlc-utilities/skills/ship-sdlc/` is exactly five files: `entry-modes.md` (entry-mode handlers `--init-config`, `--gc`, dry-run), `reference.md` (Error Recovery, Learning Capture, Gotchas, DO NOT, and the judgment sections of the inline steps `verify_pipeline`, `await_remote_review` and `learnings_commit`), `config-format.md` and `state-format.md` (reference formats) and `openspec-steps.md` (verify-openspec/archive-openspec steps). Adding another requires amending this requirement. (The former …

  # docs/specs/ship-sdlc.md — R-progressive-disclosure Acceptance (start of the line only)
  -  - Acceptance: `entry-modes.md` and `reference.md` exist under `plugins/sdlc-utilities/skills/ship-sdlc/`; `workspace-worktree.md` does NOT exist; …
  +  - Acceptance: the five companion files exist under `plugins/sdlc-utilities/skills/ship-sdlc/`; `workspace-worktree.md` does NOT exist; …
  ```

  P-TRANS-1 (ship spec), replace the two rows and add the third directly after the second:

  ```diff
  -| `verify_version_tag` | `verify_openspec` → `archive_openspec` | per step status (W4.4 `openspec-step.js`) |
  -| `archive_openspec` | `dispatch_pr` | — (interactive: via `confirm_pr`) |
  +| `verify_version_tag` | `verify_openspec` → `archive_openspec` | per step status. The change name must match `^[A-Za-z0-9._-]+$`, else `status:"error"` (the name is quoted inside an emitted shell command). `verify_openspec`: `data.commands` = `node "<abs>/openspec-step.js" validate --change "<n>"`; it never halts — the result is `success: true` whatever the command exits (R-verify-openspec-4). `archive_openspec`: ship.js reads `isArchived` and `getTaskCounts` fresh when it emits the step (R-archive-sync-2) and, for an interactive change with every task done, runs `validateChangeStrict`. `data.commands` = `node "<abs>/openspec-step.js" archive --change "<n>" --decision <decision>`. Interactive and tasks incomplete: `llm_decision {type:"choice", options:["sync-and-archive","archive-anyway","abort"]}`. Interactive, all tasks done and validation passed: `llm_decision {type:"choice", options:["archive","abort"]}` (prompt texts in `openspec-steps.md`). The LLM puts `sync` (sync-and-archive) or `anyway` (archive-anyway, archive) in place of `<decision>`. `llm_decision` is null under `--auto` (the command ends `--decision anyway --auto`), on an already-archived change, on a task-read error and on a failed validation (the command carries `--decision anyway`; the script returns at once or halts on its own check) |
  +| `archive_openspec` | `dispatch_pr` | the recorded result is the script's `output.resultText` when it is a string, else `output.summary` (interactive: via `confirm_pr`) |
  +| `archive_openspec` with answer `abort` | `done` | no command runs; `ext.reason:"cancel"`; `archive-openspec` stays `in_progress` and the ledger is kept, so `--resume` emits `archive_openspec` again (R-archive-sync-3) |
  ```

  ```diff
  # docs/specs/execute-plan-sdlc.md — I13 (whole line; item Change 6 "likewise")
  -- I13: `lib/openspec.js::markTaskDone` — mutator called per completed-and-grouped plan task to flip OpenSpec `tasks.md` checkboxes (R37).
  +- I13: `scripts/skill/openspec-step.js flip` (wraps `lib/openspec.js::markTaskDone`) — mutator called per completed-and-grouped plan task to flip OpenSpec `tasks.md` checkboxes (R37).

  # docs/specs/pr-sdlc.md — R13 (whole line; item Change 4, W44-R8)
  -- R13: OpenSpec enrichment: when an active OpenSpec change is detected, use proposal.md for Business Context/Benefits and design.md for Technical Design
  +- R13: OpenSpec enrichment: `skill/pr.js` reports `openspec: { detected, changeName, proposalPath, designPath }`, computed with `lib/openspec.js::detectActiveChanges` (`detected`: `openspec/config.yaml` exists; `changeName`: the change matched by the current branch, else the only active change, else null; each path is absolute, or null when the file does not exist). When `openspec.detected` is true, use proposal.md (`proposalPath`) for Business Context/Benefits and design.md (`designPath`, when non-null) for Technical Design; when `changeName` is non-null, the description carries the line `**OpenSpec:** openspec/changes/<changeName>/`. The skill does not search the project for OpenSpec files itself.

  # docs/specs/plan-sdlc.md — I4 (whole line; item Change 5, W44-R7)
  -- I4: OpenSpec — optional spec-driven planning via `--spec` or `--from-openspec`
  +- I4: OpenSpec — optional spec-driven planning via `--spec` or `--from-openspec`; the Step 0 OpenSpec block reads the project's OpenSpec state (`detected`, `changeName`, `matchedBy`, `activeChanges`) from `scripts/skill/openspec-step.js detect`
  ```

  (`…` marks unchanged text inside the same line.)
- names: ship `I13`, `R-progressive-disclosure`, `P-TRANS-1`; execute `I13`; pr `R13`; plan `I4`.
- mirror: the P-TRANS-1 row style of `confirm_<s>` (`cancel` → `done` with `ext.reason:"cancel"`, ledger kept) and of `rebase` (inline `llm_decision {options:[…]}`).
- decisions: no new ids (`SAME`); follow-ups R22, R-verify-openspec-3, I12, R27 (Key Decisions).
- sync: feat plan Tasks 1, 3, 4, 5, 6 and 7 implement these lines after this commit.

**Commit:** subject `docs(#9006): specs - ship and execute openspec-step consequences (W4.4)`. The body names the four specs and the amended ids, and lists the follow-ups (R22, R-verify-openspec-3, I12, R27, R-archive-sync-3 'exit 1' wording (ship returns `done`/`cancel` per W44-R3)).

**Acceptance criteria:**
- [ ] Before editing, every anchor prints `1`, and `command grep -c '^## Inputs and flags' docs/specs/pr-sdlc.md` prints `1`.
- [ ] The header's Verification command prints `SAME` for each of the four specs.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.
- [ ] `command grep -c 'exactly five files' docs/specs/ship-sdlc.md` prints `1`; `command grep -c 'exactly two files' docs/specs/ship-sdlc.md` prints `0`; `command grep -c 'the five companion files exist' docs/specs/ship-sdlc.md` prints `1`.
- [ ] `command grep -c 'openspec-step.js' docs/specs/ship-sdlc.md` prints `2` (lines: I13 and the `verify_openspec` → `archive_openspec` row); `command grep -c 'openspec-step.js flip' docs/specs/execute-plan-sdlc.md` prints `1`; `command grep -c 'proposalPath' docs/specs/pr-sdlc.md` prints `1`; `command grep -c 'openspec-step.js detect' docs/specs/plan-sdlc.md` prints `1`.
- [ ] `command grep -c '| `archive_openspec` with answer `abort` | `done` |' docs/specs/ship-sdlc.md` prints `1`.
- [ ] `git diff --stat` shows only the four spec files.

## Final Shape

The four specs describe the post-W4.4 system:

- ship I13 names `openspec-step.js` and its four subcommands.
- `R-progressive-disclosure` lists the five real companion files.
- P-TRANS-1 states the emitted OpenSpec commands, the two archive prompts, the `<decision>` mapping, the abort row and which result is recorded.
- execute I13 names the `flip` subcommand.
- pr R13 states the prepare field `openspec` and what the skill does with it.
- plan I4 names the `detect` call.

No id was added, removed or moved. The feat plan can cite every line as present.

## Verification Scorecard

Not applicable — lightweight plan (one task). The feat plan's review covers the rows these lines feed, and the orchestrator's isolated review checks this file.

## OpenSpec Appendix

Not applicable — no OpenSpec change
