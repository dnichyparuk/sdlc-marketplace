# Ship Step-Emitter (W4.2) Implementation Plan

**Goal:** Make `ship.js` own pipeline sequencing as a step emitter, so SKILL.md Step 5 shrinks to a short loop.
**Architecture:** `ship.js` keeps today's prepare call and adds `status/step/llm_decision/state_file/progress/ext` beside the existing keys. Follow-up calls `--after <step_id> --result-file <f> --state <ledger>` recompute the step plan from the ledger's frozen `flags`, record the finished step in-process, and emit the next envelope. The ledger is the existing `.sdlc/execution/ship-*.json` file, gaining `history`, `currentStep` and three frozen `flags` keys.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-1-plan-source.md (item W4.2 + readings 1–8, P1–P13, rulings w1-ledger L1–L6, w1-l6-inputs L7–L11 and w1-plan L12–L18)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-prepare|ship-state|ship-todos|ship-step|ship begin-step|ship complete-step|pipelineAdvancing|verify-side-effect" --no-cache` and `… -c promptfooconfig-exec-hooks.yaml --filter-pattern "stop-pipeline-continue|worktree-mismatch" --no-cache` (env prefix in Task 7)

---

## Context

**What problem does this change solve?**
The ship pipeline is sequenced by about 660 lines of prose in SKILL.md Step 5. The model must narrate each step, remember what comes next, and run bash for branch creation and rebase. That costs 6–8k tokens per load, and it is lost on compaction. The prose also carries shell-quoting failure modes (branch derivation, rebase) and pressure text repeated in several places.

**What prompted this change now?**
Milestone M4 of the prompt-audit plan. The step-emitter library `lib/stepper.js` and its contract exist but no script uses them. Waves M1–M3 landed the pieces this item builds on: usage accounting (W1.1), simplified hooks (W2), and a contract-shaped ship spec (W3.2).

**What does success look like?**
- `ship.js --has-plan --plan <p> --dry-run` prints a file with `"status": "step"` and the old prepare keys (for example `"sdlcGitignored"`).
- `--after <step_id>` calls move a fixture ledger through the map and record success or failure in `steps[]`.
- SKILL.md is at most 450 lines, has no `begin-step`/`complete-step` text, and calls `ship.js --after` in its loop.
- The spec's P-TRANS-1 is a table.

## Research Findings

Findings come from the discovery brief of 2026-10-19 (ids `F-<dimension>-<n>`), checked against base `7de2012`. Line numbers are base-dated; the executor re-locates every anchor by content (reading 6).

- **ship.js shape.** `main()` runs verify-side-effect, config check, git checks, gh probes, workspace derivation, plan resolution, `computeSteps` (call near `computeSteps(flags, flagSources, { openspecContext, expectedBranch, planFile })`), resume detection, then `writeOutput(result, 'ship-prepare', exitCode)` and `module.exports = { parseArgs, computeSteps, mergeFlags, loadConfig, detectWorktree }`. `parseArgs` silently ignores unknown flags, so `--after`, `--result-file` and `--state` do not disturb prepare (F-ship-js-step-emitter-integration-1, -2). `writeOutput` always calls `process.exit` (F-ship-js-step-emitter-integration-3).
- **Plan-mode-blocked precedent.** `ship.js` already creates a ledger by spawning the unchanged `state/ship.js init --branch <b> --flags <json>` and reading `{filePath}` from stdout. L1 reuses it (F-ship-js-step-emitter-integration-11; arch-wave-1-ledger §1).
- **computeSteps inputs.** It reads `flags.*` (all inside the merged flags that `init --flags` persists), plus `flagSources.steps`, `openspecContext` and `planFile`. Those three are not in the ledger today; L7 stores them inside `flags` (ruling w1-l6-inputs).
- **Ledger seed.** `cmdInit` seeds seven steps only. Recording `verify-openspec`, `archive-openspec`, `learnings-commit` fails today with "step not found" (reproduced in arch-wave-1-ledger §1). `cleanup` is never a `steps[]` entry because `cleanup-pipeline` would flag it (F-ship-ledger-state-exports-1..6).
- **State module.** `state/ship.js` runs its `try { … switch … }` block unguarded and has no exports. `startStepCore` and `completeStepCore(data, stepName, result, outcome, usage)` exist (W1.1 added `usage`). `lib/state.js` has `writeState`, `deleteState`, `migrateBranchSlug` (renames the ledger file) and `claimSession` (F-ship-ledger-state-exports-1..7).
- **Schema.** `schemas/ship-state.schema.json` has top-level `additionalProperties: false` (so `history` and `currentStep` must be declared) and a `flags` object without that restriction. The step-name enum lacks three names (F-ship-ledger-state-exports-9).
- **SKILL.md.** 1024 lines; Step 5 runs from `## Step 5 (EXECUTE): Run Pipeline Steps Sequentially` to the `---` before `## Step 6 (REPORT): Pipeline Summary`. Getting to 450 lines requires removing every range in the item's delete list (F-ship-skillmd-step5-loop-rewrite-1, -12). `begin-step`/`complete-step` appear only inside Step 5.
- **Tests.** `ship-prepare-exec.yaml` cases use the `script-runner` provider with `script_path`, `script_args`, `project_root: file://fixtures-fs/<dir>`, and `icontains`/`javascript` asserts. The harness copies the fixture to a temp dir and runs `setup.sh` if present. Wrapper `run-ship-begin-complete.js` is the model for a stepper wrapper (F-ship-stepper-promptfoo-fixtures-1, -2, -5).
- **Spec validator.** `validate-spec-shape.js` accepts a table in P-TRANS-1 unless a body line contains `#<digits>`, `(removed`, `**Model:**`, or a `## ` heading (F-ship-spec-docs-transition-map-4, -5).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Step 5 lens review and Verification Scorecard | no | runs the Step 3 critique lanes only; no Step 5 lens fan-out, no scorecard | the invoking brief says an external isolated Opus review checks this plan and asks for mandatory gates only |
| Initial envelope when prepare has errors | no | `status: "error"`, `step: null`, `error` = first error message, exit 1 | P-STEP-1 has no step to emit when prepare refuses to run; prepare keys stay as today |
| Ledger creation | no | spawns the unchanged `state/ship.js init` (L1) | one seed source, `init` untouched |
| `--after` step plan | no | recomputes `computeSteps` from `ledger.flags` on every call (L6, L8) | no snapshot field; step plan cannot change mid-run |
| `effort` in `step.data` | no | emitted only when the step object has one (L3) | `computeSteps` has no `effort` source before W4.3 |
| W4.3–W4.6 steps in the map | no | `review_gate`, `verify_openspec`, `archive_openspec`, `dispatch_*` emit with CURRENT commands/behaviour; no `confirm_<step>`, no `agent` key, no `openspec-step.js` | later waves own them |
| `review_gate` decision (L12) | no | the review step returns its verdict line in `output.artifacts.verdict`; `ship.js` parses the counts and applies the R6 threshold with `flags.reviewThreshold`; interactive runs get `yes\|defer`, `--auto` dispatches; unparseable → dispatch plus a warning | the deleted SKILL.md threshold text must not leave a gap; W4.5 later swaps the source to `review-summary.json` |
| Step start (L14) | no | a step is marked `in_progress` when it is emitted (with the R-pause clear and `stepTransition` todos); `--after` completes it | keeps the Stop hook's in-progress rule alive in interactive runs |
| Inline-step procedures (L13) | no | verify-openspec, archive-openspec, verify-pipeline, await-remote-review and learnings-commit procedures move to named sections of `reference.md`; `--ttl-days` is kept via `flags.ttlDays` | the deletions would otherwise drop spec MUSTs |
| Sub-agent prompt text (B7) | no | the loop's `dispatch_*` prompt spells out the Skill-tool instruction and the return items (1)–(4) from the deleted dispatch template, then reading 1 verbatim | the item's "take (1)–(4) from the return" and reading 1's "(2)"/"(4)" need that antecedent (arbiter ruling) |
| Step 4 prompt (L16) | no | Step 4's Interactive-mode prompt becomes a pointer to `confirm_pipeline` | otherwise users are asked twice |
| Side-effect check on `version` | no | reuses the existing `STEP_SIDE_EFFECTS`/`getTagList` check in-process; `commit`/`pr` have none yet | W4.6 extends it |
| Spec consequences (L17) | no | P-STEP-3, R70, R-pause, R6 and R-expected-branch-branch-derive are amended by a second one-task plan, `docs/plans/2026-10-19-m4-w1-ship-stepper-specs.md`, shipped as its own commit | consequences of P-STEP-4 and of removing begin/complete-step from SKILL.md |

## Key Decisions

**Problem in one sentence:** step sequencing lives in narrated prose that the model must re-derive each turn, so it costs tokens, is lost on compaction and fails on shell quoting; a script can own it.

- **Spawn `init`, do not copy its seed (L1).** Alternative: write the seed from `ship.js`. Spawning keeps one seed, one prune rule and the `sessionId` stamp. `init` runs on the pre-branch slug exactly as SKILL.md ran it before; `branch_prepare` migrates it later. Cancel/edit with nothing run deletes the ledger so a stale ledger cannot cause an implicit resume.
- **Reconcile `steps[]` in `ship.js` (L2).** Alternative: restrict recording to the seven seeded steps. That would keep today's "step not found" defect. Missing names are inserted at their `computeSteps` position; existing statuses never change; `cleanup` lives in `history` only.
- **Freeze `computeSteps` inputs in `ledger.flags` (L6, L7, L8, L9).** Alternative: persist a step snapshot (rejected: Change 2 limits ledger additions to `history`/`currentStep`). `planFile`, `openspecContext` and `sources` are stored once at init (or once on resume of a legacy ledger) and never re-read. `--expected-branch` keeps today's value: the ledger `branch` (set by `init`, rewritten by `migrateBranchSlug`), never a live `git` query. One value, one source: `--after` takes no `--plan`.
- **Fixed id→name table (L5).** A constant in `ship.js`, no string munging at call sites.
- **Dry-run (P11, arbiter-accepted).** The initial call always emits `confirm_pipeline` (`llm_decision: null` under dry-run), writes no ledger and returns `state_file: null`. `--after confirm_pipeline` on a ledger whose `flags.dryRun` is true returns `done` with `ext.reason: "dry-run"` immediately: no record, no history, no `writeState`.
- **Start on emit (L14).** Alternative: record start and completion back to back inside `--after`. That would leave no step `in_progress` while its Agent runs, so the Stop hook's in-progress rule would never fire in interactive runs. `ship.js` therefore calls `startStepCore`, the R-pause clear and `stepTransition` when it emits a step.
- **`review_gate` source (L12).** Alternative: the LLM applies the threshold table (rejected: under `--auto` `llm_decision` is null and C-STEP-3 forbids judgment calls). `ship.js` parses the verdict line instead.
- **Pruning timing (L15).** `init` on the initial call prunes a found-but-not-resumed ledger before the prompt, where SKILL.md used to run it after. Only interactive runs are affected; the warning text no longer points to the pruned file; the PR names it.
- **Frozen `auto` (note for the PR).** `--after` reads `flags.auto` and `flags.dryRun` from the frozen `ledger.flags`, so a `--resume --auto` of an interactive run keeps the original run's `auto` value after the initial call (a consequence of L6/L8; named in Plan readings).
- **Rebase behaviour change (L19; PR note).** `rebase` is no longer emitted when `flags.rebase` is `skip`; SKILL.md ran it regardless. The PR names this behaviour change.
- **Smallest cut.** Only what W4.2 lists. Not built: agents (W4.3), `confirm_<step>` steps (W4.3), `openspec-step.js` (W4.4), `review-summary.json` gate (W4.5), side-effect checks for `commit`/`pr` (W4.6).
- **Who fails if wrong.** Every `/ship-sdlc` user: a wrong transition skips or repeats a pipeline step. The Stop hook reads `steps[]`, which keeps its shape.
- **Non-goals.** No change to `computeSteps` composition, `skipSource`, `--preset/--skip` rejection, `verify-side-effect`, `state/ship.js` verbs, `lib/ship-todos.js` rendering, the ancestry-gate bash, `git add -A -- ':!.sdlc/'`, the `--auto` audit table or any hook. Spec gaps carried from M2/M3 (reading 8) are listed in the PR as follow-ups, not fixed.
- **Workspace modes.** `ship.workspace=branch`: `branch_prepare` is emitted and migrates the ledger. `ship.workspace=worktree` or `continue`: `branch_prepare` is not emitted; no migrate, no checkout; `--expected-branch` keeps today's value (ledger `branch`). State paths go through `lib/state.js` (`resolveStateDir`) and the project root through `resolveSdlcRoot()`, never `.claude/` or cwd.
- **Flag coherence.** No new flag is added to a prepare script: `--after`, `--result-file`, `--state` are the stepper library's names; grep evidence for name clashes is a Task 4 acceptance item. `flags.dryRun`/`flags.auto` are read from the resolved `ledger.flags`, never from raw args.

## Contract Examples

**code** (taken from Task 4):

```markdown
**Contract:**
- shape (code): `STEP_ID_TO_LEDGER_NAME: Record<string,string>` constant and `runAfter(stepArgs): never` in `scripts/skill/ship.js`; `runAfter` loads `--state`, recomputes steps from `ledger.flags`, completes the step, emits the next one, and writes the next envelope with `writeOutput(envelope, 'ship-step', exitCode)`.
- names: `STEP_ID_TO_LEDGER_NAME`, `runAfter`, `ensureLedger`, `reconcileSteps`.
- mirror: plan-mode-blocked `spawnSync('node', [stateShipPath, 'init', …])` block in `main()`.
- decisions: Key Decisions "Spawn init", "Freeze computeSteps inputs".
- sync: `docs/specs/ship-sdlc.md` P-TRANS-1 table; SKILL.md Step 5 family rules.
```

**docs** (taken from Task 6):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` — a step-emitter paragraph under "How the Pipeline Works" and an updated state-file row in "What It Creates or Modifies" (audience: users).
- names: `history`, `currentStep`, `--after`.
- mirror: existing section style in the same file.
- decisions: user-facing prose, no internal function names.
- sync: `site/src/content-source/skills/ship-sdlc.md` is generated later by the executor's copy-docs run in Phase S, never by this plan.
```

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY `P-TRANS-1` (table replaces "TBD"); ADD `P-STEP-4`; MODIFY `P-TRANS-2`; ids never renumbered.
- names: `P-TRANS-1`, `P-STEP-4`, `P-TRANS-2`.
- mirror: bullets `P-STEP-1`…`P-STEP-3` in `### Step-emitter contract`.
- decisions: no `#<digits>` in any spec body line (validate-spec-shape).
- sync: SKILL.md Step 5 item 5 family rules named in P-TRANS-2.
```

## Final Shape

When all tasks are done:

- `ship.js` has two modes (initial call and `--after`). The initial call prints today's prepare JSON plus the envelope keys, and creates or reuses the ledger. `--after` calls print an envelope only.
- The ledger has `history[]`, `currentStep`, reconciled `steps[]`, and `flags.planFile/openspecContext/sources`.
- `state/ship.js` is `require`-able and exports `startStepCore` and `completeStepCore`; its CLI verbs are unchanged.
- SKILL.md Step 5 is the short loop from the item, followed by judgment sections (ancestry gate, `review_gate`, `rebase_conflict`, `archive_openspec`, cleanup contract text).
- The spec has the P-TRANS-1 table, P-STEP-4 and the amended P-TRANS-2; the second plan amends P-STEP-3, R70, R-pause, R6 and R-expected-branch-branch-derive.
- Exec dataset gains at least 15 `ship-step: ` cases plus a new fixture and wrapper; one hooks case carries `history`/`currentStep`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 4 adds cases; Task 7 re-runs and updates stale cases found by the consumer sweep |
| no-ci-bypass | error | PASS | no CI step skipped |
| no-auto-eval | error | PASS | exec configs targeted only; the behavioural case runs once, after ship (brief Phase S) |
| skill-docs-required | error | PASS | no new SKILL.md; existing skill docs updated (Task 6) |
| scripts-over-llm-logic | error | PASS | sequencing moves from prose to `ship.js` |
| cross-skill-consistency | error | PASS | `state/ship.js` verbs unchanged; consumers swept in Task 7 |
| pr-link-github-issue | error | PASS | PR body links the tracking todo (Phase B) |
| spec-first | error | PASS | Task 1 (spec) precedes Tasks 4 and 5 (SKILL.md); the remaining spec lines are the second plan |
| project-agnostic | error | PASS | all changes are plugin code, schema and docs |
| flag-coherence-cross-skill | error | PASS | decision sites cite `flags.auto`/`flags.dryRun` from resolved flags |
| no-opposite-logical-vectors | error | PASS | one gate phrasing per concept in the loop text |
| flag-semantic-consistency-cross-skill | error | PASS | Task 4 acceptance greps `--after`, `--result-file`, `--state` across `scripts/skill/*.js` |
| workspace-mode-compatibility | error | PASS | stated in Key Decisions; tested in Task 4 |
| state-machine-idempotency | error | PASS | Task 4 runs init-then-resume twice and checks no re-seed and no second ledger |
| agent-dispatch-script-driven | error | PASS | dispatch parameters come from the envelope `step.data` |
| state-premise, no-scope-creep, smallest-viable-cut, failure-audience, explicit-non-goals | warning/error | PASS | Key Decisions |
| dry, kiss, yagni, single-responsibility-tasks | warning | PASS | one id→name table, one reconcile function |
| flag-resolution-single-source | warning | PASS | L8: no `--plan` on `--after` |
| prompt-cache-hit-ratio | warning | PASS | loop text is static; volatile values arrive in envelopes |

## Execution rules

- Every quoted anchor is located with `command grep -nF` and must occur exactly once (the one exception is the schema enum anchor of Task 3, which names its own rule). If it is missing or occurs more than once, STOP (reading 6). A shifted line number alone is a note.
- If the code contradicts a task, STOP (plan §0 rule 8). Do not adapt.
- Multi-site edits are applied bottom-up.
- Every grep in Verification and Done-when is written `command grep` (the host shell's `grep` can be a wrapper that prints a different message when its binary is missing).
- Spec consequences (P-STEP-3, R70, R-pause, R6, R-expected-branch-branch-derive) are not in this plan; they are the one task of `docs/plans/2026-10-19-m4-w1-ship-stepper-specs.md` (ruling L17). Do not run `node site/scripts/copy-docs.mjs` in this plan; the executor runs it in Phase S, after both ship runs, and commits `docs(#9001): site - regenerate content-source`.

## Tasks

### Task 1: Spec — P-TRANS-1 table, P-STEP-4, P-TRANS-2

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — fill P-TRANS-1, add P-STEP-4, amend P-TRANS-2, and replace the blockquote sentence "P-TRANS-1 transition map to be defined during script migration." with "Transition map: P-TRANS-1." (required by filling P-TRANS-1; reading 8).

**Notes:** Spec comes first (spec-first guardrail). The other consequential spec lines are in the second plan (L17). Locate each line by content, exactly once.

**Contract:**
- shape (openspec): MODIFY `P-TRANS-1` — replace its text with a lead sentence and the item's Change 4 table verbatim (keeping `(R8)`, `stays inline (R-progressive-disclosure, R-post-version-ancestry)` and the `(W4.4 …)`/`(W4.5 …)` parentheticals). Only three edits to the item's table: the `dispatch_pr` row drops the line-number reference "from :760–806"; row (initial) replaces "`--dry-run` → `done` immediately" with "the initial call emits it under `--dry-run` too, with `llm_decision: null`"; row `confirm_pipeline` adds "a ledger with `flags.dryRun` → `done` with `ext.reason: \"dry-run\"`, no step run". The `review_gate` row stays as in the item. ADD `P-STEP-4`; MODIFY `P-TRANS-2`. The P11 origin is recorded in the spec's `Appendix — history` as one line that starts `Reading P11:` (never `- P11`, which would enter the id set), with no issue number.

  | from | to | when |
  |---|---|---|
  | (initial) | `confirm_pipeline` | always; `llm_decision: {type:"confirm", prompt:"Run this pipeline?", options:["yes","edit","cancel"]}` — `null` when `flags.auto` or `flags.dryRun`; the initial call emits it under `--dry-run` too, with `llm_decision: null` |
  | `confirm_pipeline` | `branch_prepare` | answer `yes` (or auto); `edit`/`cancel` → `done` with `ext.reason`; a ledger with `flags.dryRun` → `done` with `ext.reason: "dry-run"`, no step run |
  | `branch_prepare` | `dispatch_execute` | execute `will_run`; else next `will_run` step |
  | `dispatch_<s>` | (recording happens inside the `--after dispatch_<s>` call — no separate `record_` step) | — |
  | `dispatch_execute` | `stage_changes` | `data.commands: ["git add -A -- ':!.sdlc/'"]` (R8) |
  | `stage_changes` | `dispatch_commit` | commit `will_run` |
  | `dispatch_commit` | `dispatch_review` | review `will_run` |
  | `dispatch_review` | `review_gate` | always (W4.5: `ship.js` reads `review-summary.json`) |
  | `review_gate` | `dispatch_received_review` | `dispatchReceivedReview: true` |
  | `review_gate` | `rebase` | otherwise |
  | `dispatch_received_review` | `dispatch_commit_fixes` | `git status --porcelain` non-empty (script checks) |
  | `dispatch_commit_fixes` | `rebase` | — |
  | `rebase` | `dispatch_version` | script ran `git fetch` + `git merge-base --is-ancestor`; if rebase needed, `data.commands: ["git rebase origin/<default>"]`; on conflict the LLM reports `success:false` → script emits `rebase_conflict` with `llm_decision {options:["pause","skip","merge"]}` (interactive) or `status:"error"` + resume hint (`--auto`) |
  | `dispatch_version` | `verify_version_tag` | `data.commands: [verify-tag-ancestry.js …]`; no-op when `NEW_TAG`/`EXECUTE_BRANCH` unset — stays inline (R-progressive-disclosure, R-post-version-ancestry) |
  | `verify_version_tag` | `verify_openspec` → `archive_openspec` | per step status (W4.4 `openspec-step.js`) |
  | `archive_openspec` | `dispatch_pr` | — |
  | `dispatch_pr` | `verify_pipeline` → `await_remote_review` | opt-in steps; `data.commands` use the existing `verify-pipeline.js` / `await-remote-review.js` invocations |
  | `await_remote_review` | `learnings_commit` | — |
  | `learnings_commit` | `cleanup` | `data.commands: ["node state/ship.js cleanup-pipeline[ --force]"]` — script picks `--force` when any step is `failed` |
  | `cleanup` | `done` | `ext.summary` = Step 6 report data |
  | any `dispatch_<s>` with `success:false` | `status:"error"` | `error`: "<step> failed: <summary>. State preserved; re-run with --resume." |

  Skipped and conditional-not-met steps are not emitted as steps; the script records `skip --reason` itself and lists them in `progress`. No spec body line may contain `#` followed by digits.
- names: `P-TRANS-1`, `P-TRANS-2`, `P-STEP-4`.
- mirror: bullet style of `P-STEP-1`…`P-STEP-3` in `### Step-emitter contract`.
- decisions: ids are never renumbered; the table uses `step.id` spellings with underscores; the spec table keeps the item's abstract command wording (absolute paths are a `ship.js` detail, Task 4).
- sync: Task 5 Step 5 item 5 families; `docs/step-emitter-architecture.md` (read-only).

**Acceptance criteria:**
- [ ] `command grep -c 'P-TRANS-1: Step transition map — TBD' docs/specs/ship-sdlc.md` was 1 before and is 0 after.
- [ ] `awk '/P-TRANS-1/{f=1} /P-TRANS-2/{f=0} f' docs/specs/ship-sdlc.md | command grep -c '^|'` prints at least 22 (header, separator, 20 rows).
- [ ] `P-STEP-4` exists once, reading: "history[] and currentStep are persisted in the ship ledger (schemas/ship-state.schema.json), never in a tmp file".
- [ ] P-TRANS-2 reads: "Every `step.id` is covered either by a family rule in Step 5 item 5 or by a named judgment section."
- [ ] Spec id set unchanged except the added `P-STEP-4`: `RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | command grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show HEAD:docs/specs/ship-sdlc.md | ids) <(ids < docs/specs/ship-sdlc.md)` prints only `> P-STEP-4`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.

### Task 2: `state/ship.js` — guard main, export step cores

**Complexity:** Trivial
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/ship.js` — guard the final `try { const opts = parseArgs(process.argv); switch … } catch (e) { … }` block with `if (require.main === module) { … }`; add `module.exports = { startStepCore, completeStepCore };`.

**Notes:** Must not touch `init`, `cleanup-pipeline`, `gc`, `migrate` verbs or the `pause` verb (P7). The block is located by the exact line `const opts = parseArgs(process.argv);` (occurs once).

**Contract:**
- shape (code): insert `if (require.main === module) {` before `try {` and `}` after the final `}` of the catch; do not re-indent the enclosed lines (`git diff` shows only the two added lines plus the exports line); `module.exports = { startStepCore, completeStepCore };` after the guard.
- names: `startStepCore`, `completeStepCore`.
- mirror: `if (require.main === module)` guard at the end of `scripts/skill/ship.js`.
- decisions: export only the two cores (item Change 3); `loadShipStateOrExit` and `cmd*` stay private because they call `process.exit`.
- sync: Task 4 uses these two exports with signatures `(data, stepName)` and `(data, stepName, result, outcome, usage)`.

**Acceptance criteria:**
- [ ] `node -e "const s=require('./plugins/sdlc-utilities/scripts/state/ship.js'); console.log(typeof s.startStepCore, typeof s.completeStepCore)"` prints `function function` and does not exit the process early.
- [ ] CLI behaviour unchanged: exec cases matching `ship begin-step|ship complete-step|ship-state` pass.

### Task 3: Ledger schema and state-format docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** build

**Files:**
- Modify: `schemas/ship-state.schema.json` — add top-level optional `history` and `currentStep`; add optional `planFile`, `openspecContext`, `sources`, `ttlDays` to `flags.properties`; add `verify-openspec`, `archive-openspec`, `learnings-commit` to the `steps.items.properties.name.enum` only (schema line under `"steps": {`). `flags.properties.skip.items.enum` stays byte-identical (L10).
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `history` and `currentStep` rows go in `## Top-Level Schema` after `nextPendingStep`; `planFile`, `openspecContext`, `ttlDays` rows go in the `` ## `flags` Object `` table; `sources` already has a row there — extend its text only if needed.

**Notes:** The stale `skip`/`preset` entries in `flags.properties` stay untouched (ruling w1-l6-inputs 5; PR follow-up). Anchors: the line `"required": ["version", "startedAt", "branch", "flags", "steps"],` (once) and the `"enum": ["execute", "commit", … "await-remote-review"]` line. Locate it with `command grep -n`: it occurs twice (schema line 29 under `skip`, line 66 under `steps` at base). Edit only the occurrence after the `"steps": {` line (under `"name": {`). This anchor is exempt from the exactly-once rule.

**Contract:**
- shape (code): schema fragments —
  ```json
  "currentStep": { "oneOf": [ { "type": "string" }, { "type": "null" } ] },
  "history": { "type": "array", "items": { "type": "object",
    "properties": { "step": {"type":"string"},
      "result": {"type":"string","enum":["success","failed","unknown"]},
      "data": {}, "timestamp": {"type":"string"} },
    "required": ["step","result","timestamp"] } }
  ```
  and in `flags.properties`: `"planFile": {"oneOf":[{"type":"string"},{"type":"null"}]}`, `"openspecContext": {"type":"object","properties":{"branchMatch":{},"isAlreadyArchived":{"type":"boolean"},"tasksDone":{"oneOf":[{"type":"integer"},{"type":"null"}]},"tasksTotal":{"oneOf":[{"type":"integer"},{"type":"null"}]}}}`, `"sources": {"type":"object"}`, `"ttlDays": {"type":"integer","minimum":0}` (optional; L13).
- names: `history`, `currentStep`, `planFile`, `openspecContext`, `sources`, `ttlDays`.
- mirror: existing `steps[].usage` schema entry (`"usage": {…}`) for inline style.
- decisions: Key Decisions "Freeze computeSteps inputs"; optional and additive only.
- sync: Task 4 writes exactly these key names; `state-format.md` row text matches the schema.

**Acceptance criteria:**
- [ ] `node -e "JSON.parse(require('fs').readFileSync('schemas/ship-state.schema.json','utf8'))"` exits 0.
- [ ] Top-level `additionalProperties:false` is still present and `history`, `currentStep` are in `properties`.
- [ ] `flags.properties.planFile` is `string|null`; `openspecContext` is an object with `branchMatch`, `isAlreadyArchived`, `tasksDone`, `tasksTotal`; `sources` is an object; `ttlDays` is an optional integer.
- [ ] `git diff` of the schema shows the `flags.properties.skip.items.enum` line unchanged and the `steps` enum extended by exactly three names.
- [ ] `state-format.md` has rows for `history`, `currentStep`, `flags.planFile`, `flags.openspecContext`, `flags.ttlDays` in the places named above.

### Task 4: `ship.js` step emitter and its exec tests

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1, Task 2, Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — imports; id→name table; ledger helpers; initial-call envelope; `runAfter`; transition engine; command builders; `deriveBranchFromPlan`; the found-but-not-resumed warning text.
- Create: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — `git init -b main`, commit, `git checkout -b feat/ship`; writes `plan.md`, the seeds `seed/ledger-legacy.json`, `seed/ledger-frozen.json`, `seed/ledger-frozen-dryrun.json`, `seed/ledger-frozen-branch.json` and `seed/ledger-frozen-resumed.json` (execute and commit `completed`, the rest `pending`, for case (p)) (unquoted heredoc, `planFile:"$PWD/plan.md"`, `worktree:"$PWD"`; every seed file is named `ship-<slug>-<ts>.json` so `findStateFile` and `detectResumeState` find it), and `results/yes.json`, `edit.json`, `cancel.json`, `generic-ok.json`, `branch-prepare-ok.json`, `commit-ok.json`, `commit-fail.json`, `version-tag-missing.json` (`artifacts.tag:"v9.9.9"`), `cleanup-ok.json`, and the review-verdict files `review-<row>.json` (one per row of the R6 threshold table), `review-approved.json`, `review-approved-notes.json`, `review-unparseable.json`; no `.sdlc/.gitignore` (reading 5).
- Create: `tests/promptfoo/scripts/run-ship-stepper.js` — wrapper modelled on `run-ship-begin-complete.js`.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add cases with descriptions starting `ship-step: `.

**Notes:** High risk: this is the sequencing core. Edit bottom-up; locate anchors by content, exactly once: `function computeSteps(flags, flagSources, { openspecContext, expectedBranch, planFile } = {}) {`, `writeOutput(result, 'ship-prepare', exitCode);`, `if (process.argv[2] === 'verify-side-effect') {`. Before Task 5 deletes it, read SKILL.md `### Review verdict conditional logic` for the R6 threshold table the `review_gate` parser must reproduce. Must not touch: `computeSteps` body, `skipSource`, the `--preset/--skip` rejection block, `verifySideEffect`/`STEP_SIDE_EFFECTS` (read-only reuse), the plan-mode-blocked block. Transition rows are the Task 1 table.

**Contract:**
- shape (code):
  - Imports: `const { parseArgs: parseStepArgs, createEnvelope } = require(path.join(LIB, 'stepper'));`, `const shipState = require(path.join(__dirname, '..', 'state', 'ship'));`, plus `writeState`, `deleteState`, `migrateBranchSlug` from `lib/state`, `stepTransition`, `markCompleted`, `renderTodos` from `lib/ship-todos`, `parseUsage` from `lib/usage`, `resolveBranchName` from `lib/branch-name`.
  - Table (L5), `STEP_ID_TO_LEDGER_NAME`:

    | `step.id` | ledger `steps[].name` |
    |---|---|
    | `dispatch_execute` | `execute` |
    | `dispatch_commit` | `commit` |
    | `dispatch_review` | `review` |
    | `dispatch_received_review` | `received-review` |
    | `dispatch_commit_fixes` | `commit-fixes` |
    | `dispatch_version` | `version` |
    | `verify_openspec` | `verify-openspec` |
    | `archive_openspec` | `archive-openspec` |
    | `dispatch_pr` | `pr` |
    | `verify_pipeline` | `verify-pipeline` |
    | `await_remote_review` | `await-remote-review` |
    | `learnings_commit` | `learnings-commit` |
    | `confirm_pipeline`, `branch_prepare`, `stage_changes`, `review_gate`, `rebase`, `rebase_conflict`, `verify_version_tag`, `cleanup` | none — recorded in `history[]` only |
  - `main()` first lines: after the `verify-side-effect` short-circuit, `const stepArgs = parseStepArgs(); if (stepArgs.after) return runAfter(stepArgs);`. `parseStepArgs()` takes no arguments and returns `{after, result, stateFile, rest}`; `after != null && result == null` (unreadable `--result-file`, P8) → error envelope.
  - `ensureLedger({flags, flagSources, openspecContext, planFile, gitState, resume, errors})` returns the ledger path or `null`: `null` when `errors.length>0` or `flags.dryRun`; `resume.fullPath` when `resume.found && flags.resume`; otherwise `spawnSync('node',[stateShipPath,'init','--branch',gitState.currentBranch,'--flags',JSON.stringify({...flags, planFile, openspecContext, sources: flagSources, ...(ttlDays != null ? { ttlDays } : {})})],{encoding:'utf8',timeout:10000})` mirroring the plan-mode-blocked block, where `ttlDays` is the value the existing `--ttl-days` parse in `parseArgs` produces (L13); non-zero exit → error envelope. After creation or resume: read the ledger JSON, fill `flags.planFile/openspecContext/sources` when absent (L9; present keys are never overwritten), set `history ??= []`, `currentStep = 'confirm_pipeline'`, `reconcileSteps(ledger, steps)`, `writeState(path, ledger)`.
  - `reconcileSteps(ledger, steps)`: for each `steps[]` entry of `computeSteps` (skipping `cleanup`), insert `{name, status:'pending'}` at the computeSteps position when absent (`conditional` → add `condition: <reason>`); for `skipped` entries still `pending` set `status:'skipped'`, `completedAt`, `reason`; never change another existing status.
  - Found-but-not-resumed branch (L15): Only the existing worktree-mismatch warning (`Ship state file exists but was created in a different worktree. Use --resume to resume explicitly.`) changes, and only when `init` will run (no errors, not `--dry-run`). Its second sentence becomes one that says this run replaced the earlier ledger and it cannot be resumed; the first sentence stays. Exact text: `Ship state file exists but was created in a different worktree. This run replaced it with a new ledger; the earlier run cannot be resumed.` No warning is added for a stale ledger. Every other branch keeps today's text.
  - Initial envelope: `Object.assign(result, createEnvelope('step', { id:'confirm_pipeline', action:'Confirm the pipeline with the user (skip when llm_decision is null).', tool_hints:['AskUserQuestion'], data:{} }, { llmDecision: (flags.auto||flags.dryRun) ? null : {type:'confirm', prompt:'Run this pipeline?', options:['yes','edit','cancel']}, stateFile: ledgerPath, progress:{completed:0,total:N}, ext:{} }))`; on `errors.length>0` the envelope is `createEnvelope('error', null, {error: <first message>, stateFile: null})` and exit 1. `progress.total` (`N`) is defined once: the number of `steps[]` entries with status `will_run`, plus `conditional` entries whose condition is met, `cleanup` included (it is appended with `will_run`). Conditions unknown at the initial call count as not met, and `total` never changes during a run: every envelope reports the same `total`.
  - `runAfter(stepArgs)` call order:
    1. Validate: `stepArgs.after` set; `stepArgs.result` non-null (else error row below); ledger read from `stepArgs.stateFile` (a missing file is normal only for `after==='cleanup'`). When `after === 'cleanup'` and the `--state` file is absent (the normal `cleanup-pipeline` already ran `deleteState`), return `done` with `ext.summary`: append no history and do no `writeState`. Append and write only when the file still exists (forced cleanup).
    1b. If `after === 'confirm_pipeline'` and `ledger.flags.dryRun === true`, return `createEnvelope('done', null, {ext:{reason:'dry-run'}, stateFile: <--state>})` immediately: no record, no history, no `writeState`.
    2. `flags = ledger.flags`; `steps = computeSteps(flags, flags.sources, { openspecContext: flags.openspecContext, expectedBranch: ledger.branch, planFile: flags.planFile })`. `ledger.branch` is set by `init` and rewritten by `migrateBranchSlug`; never null, never a live `git` query, in every workspace mode.
    3. `confirm_pipeline` with answer `edit`/`cancel`, evaluated before any history append: if no `steps[]` entry has status `in_progress`, `completed` or `failed` and `history` is empty, call `deleteState(path)` and return `done` with `ext.reason: <answer>`, `state_file: null`; otherwise keep the ledger.
    4. Record the finished step when it has a ledger name: `completeStepCore(data, name, result.output.summary, result.success ? 'success' : 'failure', usage)` (call `startStepCore` first only when the step is still `pending`, L14). `usage`: `const res = parseUsage(JSON.stringify(output.usage)); usage = res.ok ? res.value : undefined` (`lib/usage.js` line 16 returns `{ok, value}`); absent or invalid → `undefined` and a `warnings` line in the envelope `ext`. For `dispatch_version`, force failure unless `getTagList(activeRoot)` contains `result.output.artifacts.tag` (`STEP_SIDE_EFFECTS.version`). Append `history` `{step, result:'success'|'failed'|'unknown', data: result.output, timestamp}` and set `currentStep`.
    5. Pick the next candidate in Task 1 table order. Emission is decided only by `ledger.flags` and the ledger `steps[]`/`history` state (L6, w1-l6-inputs). A step with a ledger name is runnable when its `computeSteps` status is `will_run`, or is `conditional` and its condition is met. Conditions: `received-review` is met when the `review_gate` decision is dispatch (below); `commit-fixes` is met when `git status --porcelain` is non-empty (the script checks); `archive-openspec` is met whenever `computeSteps` returns it `conditional`. A conditional step whose condition is not met is recorded `skipped` with `reason` = the unmet condition (`cmdSkip` fields). Skip any candidate whose ledger `steps[]` status is `completed` or `skipped`; `failed`/`in_progress`/`pending` candidates are emitted. History-only steps have their own gates, and each is skipped when `history` already holds a success for it:
       - `branch_prepare` iff `flags.workspace==='branch'`, `history` has no successful `branch_prepare`, and `ledger.branch` is not already the derived name (so `--resume` never re-runs `git checkout -b`);
       - `stage_changes` iff `execute` was completed in this call;
       - `review_gate` iff `review` was recorded in this call;
       - `rebase` iff `flags.rebase !== 'skip'` (ship's own resolved flag: `auto|skip|prompt`, `scripts/lib/ship-fields.js` line 82 and `ship.js` lines 285-303; the same value is also forwarded to execute-plan at `ship.js` line 463, which is noted only) and `version` or `pr` is runnable; `auto` and `prompt` both emit `rebase` as today. The SKILL.md rebase section (base lines 827-877) defines no handling for a failed `git fetch`, so a failed `git fetch` gives `status:"error"` with the resume hint;
       - `verify_version_tag` iff `version` was completed in this call.
    6. Start on emit (L14): when the emitted step has a ledger name, call `startStepCore`, apply the exact R-pause clear of `cmdBeginStep` (`delete data.paused` and unlink `.stop-cap-exhausted-<slug>.json`), and render `stepTransition(ledger, name)` into `step.data.todos` and `step.data.marker`, all before `writeState`. After a record, render `markCompleted(ledger, name)` on success, or `renderTodos(ledger, {event:'step', currentStep:name, failStep:name})` on failure, into `ext.todos` of the next envelope (as the CLI verbs do, `state/ship.js` `cmdBeginStep`/`cmdCompleteStep`).
    7. `writeState(ledgerPath, ledger)` (never for `after==='cleanup'` with an absent file); `writeOutput(envelope, 'ship-step', status==='error' ? 1 : 0)`.
  - `review_gate` (L12): `dispatch_review` result carries the review verdict line in `output.artifacts.verdict`, in today's banner form (for example `CHANGES REQUESTED (1 critical, 2 high)`). At `--after review_gate`, `ship.js` recomputes the decision from the latest `dispatch_review` history entry's `data.artifacts.verdict` and `flags.reviewThreshold`, then applies `output.answer` (yes/defer) when interactive. It parses `(\d+) (critical|high|medium|low)` and applies the R6 threshold table deterministically. Parseable = the verdict contains one of `CHANGES REQUESTED`, `APPROVED WITH NOTES` or `APPROVED`; missing counts mean 0; anything else, or an absent verdict, is unparseable. Interactive runs get `llm_decision {type:'choice', prompt:'Review found <counts>. Dispatch received-review-sdlc now?', options:['yes','defer']}` when the threshold is met; `--auto` dispatches. A missing or unparseable verdict means dispatch plus a `warnings` line.
  - Command builders (P8, Q2): `ship.js` builds every emitted command with an absolute, double-quoted path from `path.join(__dirname, …)`: `state/ship.js` and `util/verify-tag-ancestry.js`, plus `skill/verify-pipeline.js` and `skill/await-remote-review.js` (`<step.args> --state-file "<ledger>"`). `learnings_commit` is one command that exits 0 unless the commit fails: `git diff --quiet -- .sdlc/learnings/log.md || { git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings" && { git push || echo "push failed (non-fatal)" >&2; }; }`. `cleanup` is `node "<abs state/ship.js>" cleanup-pipeline` plus ` --force` when any step is `failed` and ` --ttl-days <ttlDays>` when `flags.ttlDays` is present; without it the config TTL applies as today (L13).
  - Next-step payloads: `branch_prepare` (emitted under the gate in call-order step 5: workspace branch, no successful `branch_prepare` in `history`, `ledger.branch` not already the derived name) → `data:{branch, commands:['git checkout -b <name>']}`; `stage_changes` → `data.commands:["git add -A -- ':!.sdlc/'"]`; `dispatch_*` → `data:{skill, args, invocation, model}` from the step (add `effort` only when the step object has it, L3); `rebase` → script runs `git fetch` and `git merge-base --is-ancestor`, `data.commands:["git rebase origin/<default>"]` only when needed; `rebase_conflict` after `rebase` with `success:false` → interactive `llm_decision {options:['pause','skip','merge']}`, `--auto` → `status:'error'` with resume hint; `verify_version_tag` → `data:{ NEW_TAG: <artifacts.tag of the dispatch_version history entry>|null, EXECUTE_BRANCH: <ledger.branch if history has a successful branch_prepare, else null>, commands: <[node "<abs util/verify-tag-ancestry.js>" --tag … --branch … --remote origin] only when both are non-null, else []> }`; `verify_openspec`/`archive_openspec` → `data:{ change, args, commands: [] }` (the step's existing `args`; current behaviour, W4.4 later): the reference.md judgment section is the procedure — run it and report its outcome as `success`/`output` — and the step carries no Agent `invocation` payload until W4.4; `done` → `ext.summary` = Step 6 report data (steps with status, usage totals, PR url from `artifacts.prUrl`).
  - `--after branch_prepare` (absorbs C7): `migrateBranchSlug({prefix:'ship', fromSlug: slugifyBranch(<old branch>), toBranch: <new branch>})`; the next envelope's `state_file` is the returned `filePath` when `migrated:true`; the recomputed steps use `expectedBranch = ledger.branch` (now the new branch), replacing the SKILL.md regex patch; New branch = the live current branch (`checkGitState(process.cwd()).currentBranch`; L6 allows live context for exactly this value), with `output.artifacts.branch` as a cross-check. Call `migrateBranchSlug` before any in-memory mutation; then set `ledgerPath = res.filePath` and `ledger.branch = <new>`, and apply steps 4–7 against the new path (a later `writeState` to the old path would bring the old file back).
  - `deriveBranchFromPlan(planPath, config) → { type, slug, name }`: read the plan's first `# ` heading; `type` by first word/keywords: `fix|bug` → `bugfix`, `doc` → `docs`, `refactor` → `refactor`, `chore|ci|deps` → `chore`, else `feature`; `slug` = heading lower-cased, non-alphanumerics → `-`, trimmed (length is truncated by `resolveBranchName` per `workspace.branch.slugMaxLength`); `name = resolveBranchName({ type, slug, config })` with `config = (readSection(resolveSdlcRoot(),'workspace')||{}).branch||{}`; catch `TypeError` → `status:'error'`.

  Failure and error behaviour:

  | condition | `status` | behaviour |
  |---|---|---|
  | `--result-file` unreadable (`result===null`) | `error` | nothing recorded; message names the file |
  | `ledger.flags` lacks `planFile`, `openspecContext` or `sources` | `error` | message names the missing key and says to re-run with `--resume` so the initial call freezes it (L6); no write |
  | `state/ship.js init` exits non-zero | `error` | stderr text in `error`; no ledger |
  | `dispatch_<s>` with `success:false` | `error` | step recorded `failed`; ledger kept; text "<step> failed: <summary>. State preserved; re-run with --resume." |
  | `dispatch_version` and tag not in `getTagList` | `error` | step recorded `failed` with the missing-tag reason |
  | `rebase` with `success:false` and `flags.auto` | `error` | resume hint; no `rebase_conflict` step |
  | `deriveBranchFromPlan` throws `TypeError` | `error` | message from `resolveBranchName`; no checkout command emitted |
  | review verdict missing or unparseable | `step` | dispatch received-review; `warnings` line in `ext` |

- Test shape: wrapper args `--project-root <p> --scenario <name> [--plan <path>] [--result <rel>] [--seed legacy|frozen|frozen-dryrun|frozen-branch|frozen-resumed|none] [--answer yes|edit|cancel]`; `--seed` copies the chosen file from `seed/` into `.sdlc/execution/` before the call, `none` is used for (f) and (i); for `frozen-branch` the wrapper first runs `git checkout main` (case (n)). The wrapper passes `--plan` only for `initial*` scenarios (L8); `initial`/`initial-dry-run` delete `.sdlc/execution/ship-*.json` before the call; `initial-resume-legacy` uses the seeded legacy ledger. It prepends a stub dir to `PATH` whose `gh` prints `Logged in to github.com account fixture` and exits 0, spawns `ship.js` with `timeout: 8000`, prints exactly one JSON line `{scenario, calls:[{args, exitCode, envelope}], ledger:{stepStatuses, history, currentStep, flagsKeys}, ledgerExists}` (`calls` holds one entry per `ship.js` call, so multi-call cases are expressible) and always exits 0. Scenario catalogue: `initial | initial-dry-run | initial-resume-legacy | legacy-twice | after-confirm | edit-cancel | after-commit-ok | after-commit-fail | after-cleanup | after-version-no-tag | after-bad-result | step-list-equal | branch-migrate | resumed-completed | emit-in-progress | review-gate-rows | ttl-days | worktree-mismatch`. It locates `ship.js` by walking up from `__dirname`, as `run-ship-begin-complete.js` does.
- Cases (descriptions start `ship-step: `; the item's filter selects them): (a) initial call has `"status": "step"`, `"id": "confirm_pipeline"` and `"sdlcGitignored"`; (b) `--after confirm_pipeline` with `yes.json` → `branch_prepare` or `dispatch_execute`; (c) `--after dispatch_commit` with `commit-ok.json` → next `dispatch_review`, ledger `commit` is `completed`, `history` has one entry; (d) `commit-fail.json` → `"status": "error"`, ledger `commit` is `failed`; (e) `--after learnings_commit` emits a `cleanup` command whose script path is absolute and exists, then `--after cleanup` → `"status": "done"`; (f) fresh initial call creates the ledger with `flags.planFile/openspecContext/sources` present and `history` empty (keys-after-init); (g) resumed legacy ledger lacking the keys gets them filled once and a second call leaves them unchanged; (h) `step-list-equal`: initial call (seed none) with `--steps commit` (no execute, so no plan is needed; no version or pr, so no `rebase`); then write `.sdlc/local.json` with `ship.steps:["commit","review"]`; then walk `--after` with `generic-ok.json` results to `done`; the emitted ids equal the initial set (`dispatch_commit`, `cleanup`) and every `progress.total` equals the initial one (the walk reaches `done` in the no-origin fixture); (i) dry-run initial call → `status === "step"`, `step.id === "confirm_pipeline"`, `llm_decision === null`, `state_file === null`, `ledgerExists:false`, keys `sdlcGitignored` and `steps` present; (j) `--after confirm_pipeline` with `edit.json` and nothing run → `done`, `state_file` null, ledger deleted; with `cancel.json` likewise; with `frozen-dryrun` → `done`, `ext.reason` `dry-run`, ledger unchanged; (k) unreadable `--result-file` → `status: "error"`; (l) `--after dispatch_version` with `version-tag-missing.json` → `error`, ledger `version` is `failed`; (m) worktree/continue ledger: `--after confirm_pipeline` skips `branch_prepare`; (n) `branch mode migrates the ledger and patches --expected-branch` (seed `frozen-branch` on `main`): the `branch_prepare` command starts with `git checkout -b `; the wrapper runs that emitted command before calling `--after branch_prepare` (with `branch-prepare-ok.json`); then `state_file` has the new slug, the old file is gone, and the next `dispatch_*` invocation contains `--expected-branch <new>`; (o) `emitted dispatch step is in_progress in the ledger` (`stepStatuses.commit === "in_progress"` after `--after stage_changes`) and a paused ledger is cleared on emit; (p) scenario `resumed-completed` (seed `frozen-resumed`): execute and commit completed → `--after confirm_pipeline` emits `dispatch_review`; (q) `review_gate`: one case per row of the R6 threshold table plus one unparseable verdict (dispatch, `warnings` line); (r) `--ttl-days 3` on the initial call stores `flags.ttlDays` and the cleanup command forwards `--ttl-days 3`; without it, no forward; (s) worktree-mismatch ledger, no `--resume`, not dry-run → the warning contains `different worktree` and does not contain `Use --resume`; the same under `--dry-run` → the old text stays.
- names: `STEP_ID_TO_LEDGER_NAME`, `ensureLedger`, `reconcileSteps`, `runAfter`, `deriveBranchFromPlan`, `parseStepArgs`, `createEnvelope`, envelope keys `status/step/llm_decision/state_file/progress/ext/error`, `run-ship-stepper.js`, `project-ship-stepper`.
- mirror: plan-mode-blocked `init` spawn in `main()` (anchor: `const result = spawnSync('node', [` followed by `stateShipPath, 'init',`); `cmdSkip`, `cmdBeginStep`, `cmdCompleteStep` in `scripts/state/ship.js`; `tests/promptfoo/scripts/run-ship-begin-complete.js` and `tests/promptfoo/fixtures-fs/ship-pipeline-inprogress/setup.sh`.
- decisions: Key Decisions "Spawn init", "Reconcile steps", "Freeze computeSteps inputs", "Start on emit", "Dry-run", "review_gate"; exit 0 for `step|done`, 1 for `error`.
- sync: Task 1 map; Task 3 key names; Task 5 loop item 5 families and judgment sections.

**Acceptance criteria:**
- [ ] Initial call keeps every old top-level key and `flags` byte-compatible and adds `status`, `step`, `llm_decision`, `state_file`, `progress`, `ext`.
- [ ] A fresh, error-free, non-dry-run initial call spawns the unchanged `state/ship.js init` once; a dry-run or error call creates no ledger and gives `state_file: null`; a resumed ledger is not re-inited.
- [ ] `--after` takes every `computeSteps` input from `ledger.flags` (no `--plan`); a missing key gives a `status: "error"` envelope naming the key.
- [ ] Every transition in the Task 1 table is implemented; start-on-emit and complete-on-`--after` follow the order above; failure rows behave as in the error table.
- [ ] `command grep -nE "'--(after|result-file|state)'" plugins/sdlc-utilities/scripts/skill/*.js` shows these flag names used only by `ship.js`; the output is pasted in the task report.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-step" --no-cache` (env prefix of Task 7) passes with at least 15 cases (a–o plus p–s).

### Task 5: SKILL.md Step 5 loop, Step 4 prompt, reference.md

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 4
**Verify:** tests, lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — replace Step 5 with the loop; delete the listed ranges; delete "Review verdict conditional logic"; replace Step 4's Interactive-mode AskUserQuestion block.
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — delete the C3 duplicate and hook-restating bullets; add R3's single item; add the relocated judgment sections.

**Notes:** High risk: a wrong deletion removes behaviour the loop now relies on. SKILL.md line 200 (the pipeline table row for learnings-commit) points to the deleted "After pr — learnings-commit" section; re-point it to the reference.md `learnings_commit` section. `reference.md` lines 17 and 53 ("treat missing verdict as APPROVED WITH NOTES") now contradict L12; do not fix them (rule 3), the PR lists them as follow-ups. Locate every section by heading text with `command grep -nF` (exactly once) and edit bottom-up so shifting anchors do not matter (P4).

**Contract:**
- shape (code): replace Step 5 with this block (reading 2 sentence first, reading 1 paragraph in item 5; L3 effort rule):

  ```
  ## Step 5 (EXECUTE): Run the step loop
  Ask the user only when a step's `llm_decision` is non-null (ship.js sets none under `--auto`); before each step print one line saying what runs next; after each step print the one-line result.
  Dispatch every `will_run` step as computed by `ship.js`, even when the change looks low-risk — the pipeline's value is catching cases the developer under-estimates. `cleanup-pipeline` fails the run if a `will_run` step was not resolved.
  Running a step and the `--after` call that records it are one uninterrupted sequence; do not end the turn between them (the Stop hook blocks such turns).
  1. `ENVELOPE_FILE` is the prepare output from Step 1 (first call). Loop:
  2. Parse `$ENVELOPE_FILE`. If `status === "done"` → Step 6 with `ext.summary`. If `status === "error"` → print `error`, stop (state is preserved for `--resume`).
  3. Print `step.action`. If `step.data.todos` is present, call `TodoWrite` with it and echo `step.data.marker`.
  4. If `llm_decision` is non-null: resolve it — ask the user with `AskUserQuestion` using `prompt`/`options` (never in `--auto`; the script sets it to null there) — and put the answer in `output.answer`.
  5. Execute by `step.id` family:
     - `dispatch_*`: `Agent(subagent_type: "general-purpose", model: step.data.model, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>\nInvoke the skill with the Skill tool and return a structured result:\n(1) status — success or failure\n(2) result summary — 2-3 lines\n(3) artifacts — commit hash, tag, PR URL, verdict, etc.\n(4) any warnings or issues encountered\n\nThe arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).")`, adding `effort: step.data.effort` only when `step.data.effort` is present. Take `(1)–(4)` from the return into `output`. (R-subagent-brief)
     - `stage_changes`, `rebase`, `verify_version_tag`, `verify_openspec`, `archive_openspec`, `verify_pipeline`, `await_remote_review`, `learnings_commit`, `cleanup`: run each command in `step.data.commands` with Bash, in order; `success` = every command exited 0; capture the command's JSON stdout into `output`. For `verify_openspec` and `archive_openspec` (empty `commands`) the reference.md section is the procedure: run it and report its outcome as `success`/`output`.
     - `branch_prepare`: run `step.data.commands`, then continue.
  6. Run `mktemp` and note the printed path; write `{step_id, success, output, error}` to that path with the Write tool (no shell quoting of agent text), then run `node "<PLUGIN_ROOT>/scripts/skill/ship.js" --after <step.id> --result-file <tmp> --state <state_file>`; set `ENVELOPE_FILE` to the path it prints; `rm -f <tmp>`; go to 2.
  Judgment sections (read only when the step id matches): `review_gate` interactive choice (defer = collect findings for the summary); `rebase_conflict` (first run `git rebase --abort`, then: pause → stop with state; skip → continue to version; merge → run `git merge origin/<default>`, on conflict abort and pause); `verify_openspec`, `archive_openspec`, `verify_pipeline`, `await_remote_review`, `learnings_commit`: read the matching section of `./reference.md` (archive_openspec prompts: texts in W4.4).
  ```

  - Delete by heading (inside Step 5 unless noted): `### Pre-step validation`, `### Context budget — dispatch isolation`, `### Dispatch protocol` with `#### When \`step.dispatchMode === 'agent'\``, `### Main-thread TodoWrite orchestration` (deleted entirely; loop item 3 is its one kept sentence), `### Pre-execute workspace auto-detection`, `### Execution loop`, `### Between execute and commit`, `### Between review and received-review`, `### Between version and archive-openspec — verify-openspec`, `### Between version and pr — archive-openspec`, `### After pr — verify-pipeline`, `### After verify-pipeline — await-remote-review`, `### After pr — learnings-commit`, `### Between last commit and version — rebase` (including the `Note: in a worktree, all of this is safe` line), `### State persistence` (replaced by the one sentence in the acceptance bullet), `### Terminal cleanup step`, and in Step 2 `### Review verdict conditional logic` with its `--auto`-mode sentences. Keep: `### After version — post-version ancestry HARD GATE` (moved right after the loop as the `verify_version_tag` judgment section; add one sentence before the kept block: "Take `NEW_TAG` and `EXECUTE_BRANCH` from `step.data` of the `verify_version_tag` envelope."; the bash stays byte-identical), the `PIPELINE CONTRACT VIOLATION` display text (the `cleanup` judgment section), and the `--auto` audit table (must not touch). The `--auto` block-quotes of the dispatch protocol become one-line hook pointers in reference.md.
  - Step 4 (L16): replace only the Interactive-mode AskUserQuestion block, from `Display the pipeline table, then:` through `Loop until \`yes\` or \`cancel\`.` (SKILL.md lines 276-286 at base), with: "Display the pipeline table. The confirmation is the loop's first step (`confirm_pipeline`). When the loop returns `done` with `ext.reason: \"edit\"`, ask what to change, re-run the Step 1c invocation with the changed flags and restart at Step 2; `cancel` → stop." The Auto and Dry-run subsections stay byte-identical (the behavioural case rests on Auto).
  - reference.md judgment sections (Q2, L13): relocate verbatim, without any begin/complete-step or "record via" line and keeping their R-ids, the procedures of `verify_openspec`, `archive_openspec`, `verify_pipeline` (status branching R45/R46), `await_remote_review` (R52) and `learnings_commit` (first run the ship-level Learning Capture) into named sections of `reference.md`; openspec stays interim until W4.4.
- names: `ENVELOPE_FILE`, `step.id`, `step.data.todos`, `step.data.marker`, `llm_decision`, `output.answer`, `state_file`.
- mirror: item Change 7 block (source file lines 74–90 of the plan source).
- decisions: Key Decisions; keep `R<n>`/`R-slug` anchors in surviving text; no issue numbers in model-facing prose.
- sync: `docs/specs/ship-sdlc.md` P-TRANS-2 (every step id is a family rule or a judgment section); reference.md pointers to SKILL.md sections that were deleted name the surviving section instead.

**Acceptance criteria:**
- [ ] `wc -l plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` ≤ 450.
- [ ] `command grep -c 'scripts/skill/ship.js" --after' …/SKILL.md` ≥ 1.
- [ ] `command grep -cE 'begin-step|complete-step' …/SKILL.md` = 0.
- [ ] `command grep -c 'node -e' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` = 0.
- [ ] The State persistence sentence reads: "State is written by `ship.js` on every `--after` call; manual verbs: `skip`, `fail`, `decide`, `defer`."
- [ ] The three binding sentences appear once; the X11 sentence is reading 2 verbatim; the C16 paragraph is reading 1 verbatim, cited with `R-subagent-brief`; neither original wording remains.
- [ ] The ancestry-gate bash block (identified by `verify-tag-ancestry.js" --tag "$NEW_TAG" --branch "$EXECUTE_BRANCH" --remote origin`, SKILL.md line 596 at base) is byte-identical to base; `git add -A -- ':!.sdlc/'` occurs only where it did, or in `ship.js`/reference.md.
- [ ] Step 4 Auto and Dry-run subsections are byte-identical to base (`git diff` shows no hunk inside them).
- [ ] reference.md: the bullet starting "Skip pipeline steps that were marked" is gone; "Copy example args" and the Gotcha "Pipeline plan is binding" remain; the three hook-restating bullets ("End your response turn between pipeline steps", "Interpret tool call result processing", "Treat the PostToolUse") are replaced by exactly "Do not end the turn between pipeline steps or treat a tool result as a stopping point; the continuation hooks block such turns and state the next action."
- [ ] `command grep -rnF` of every removed sentence's distinctive phrase across `tests/promptfoo`, `docs/`, `site/src/data`, `plugins/` is recorded; hits are handled in Task 7.

### Task 6: Skill reference doc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 5
**Verify:** build

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — a short step-emitter paragraph under `## How the Pipeline Works`; the state-file row in `## What It Creates or Modifies` lists `history` and `currentStep`; fix the sentence at about line 239 that says "Step 5 uses the atomic `state/ship.js begin-step`".

**Notes:** `README.md` table and `site/src/data/skills-meta.ts` change only if the skill's description or flags change; they do not. The stale hook sentence near the hooks table (reading 8) is not fixed here; it goes to the PR follow-ups. Do not run `node site/scripts/copy-docs.mjs` here.

**Contract:**
- shape (docs): a step-emitter paragraph under `## How the Pipeline Works` (audience: users; 3–4 sentences: the script sequences the pipeline; the model runs each emitted step; progress is saved in the state file) and the updated state-file row in `## What It Creates or Modifies` listing `history` and `currentStep`; the line-239 sentence reworded to: Step 5 sends every step through `ship.js --after`, which records start and completion in the state file.
- names: `--after`, `history`, `currentStep`, `state_file`.
- mirror: surrounding section prose in `docs/skills/ship-sdlc.md` (`## How the Pipeline Works`).
- decisions: user-facing wording; no function names.
- sync: `site/src/content-source/skills/ship-sdlc.md` is generated later by the executor's copy-docs run in Phase S, never hand-edited.

**Acceptance criteria:**
- [ ] `docs/skills/ship-sdlc.md` mentions `--after` in `## How the Pipeline Works` and `history`/`currentStep` in `## What It Creates or Modifies`, and `command grep -c 'atomic `state/ship.js begin-step`' docs/skills/ship-sdlc.md` is 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

### Task 7: Consumer sweep and final verification

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4, Task 5, Task 6
**Verify:** tests, lint

**Files:**
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — rewrite only the rubric or `icontains` text that cites deleted prose, so it describes the envelope-driven equivalent. Delete no case and drop no assertion. Do not run them (policy); the PR lists them as "behavioural cases updated, unrun (policy)". Cases, by line at base:
  - lines 112, 140, 161, 567: cite "Review verdict conditional logic" (deleted) → the `review_gate` step; line 112 also asserts `PAUSING PIPELINE`, which is absent from SKILL.md at base, so rewrite that assertion to the `review_gate` equivalent;
  - line 287: `step.invocation verbatim` (dispatch protocol deleted) → `step.data.invocation`;
  - line 519: the learnings-commit section → the `learnings_commit` step and its reference.md section;
  - line 647: the verify-pipeline section → the `verify_pipeline` step and its reference.md section;
  - lines 675, 697, 717: the dispatch protocol → the `dispatch_*` family rule in Step 5 item 5;
  - lines 744, 763, 781, 800, 829: pre-execute workspace auto-detection → `branch_prepare` / `--after branch_prepare`;
  - line 898: the `NEW_TAG` capture point → `step.data` of the `verify_version_tag` envelope;
  - line 945: TodoWrite / `[task-tray] init:` orchestration → `step.data.todos` / `step.data.marker`.
- Modify: `tests/promptfoo/datasets/ship-hooks-exec.yaml` — add one `stop-pipeline-continue (W4.2): …` case whose ledger carries `history:[{…}]`, `currentStep` and an `in_progress` step, with `flags.auto:false`, expecting `block`.
- Modify: other `tests/promptfoo/datasets/*.yaml` only where the sweep finds a stale assertion. A case asserting the old "Use --resume to resume explicitly" text in the found-but-not-resumed branch gets a consequential assertion change; report each such hit to the orchestrator, because it is committed separately with its reason (L15).

**Notes:** Env prefix for every run: `mkdir -p /tmp/claude-1000/pf-tmp-exec-m4; GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m4`; run from `tests/promptfoo` with `npx --yes promptfoo@0.123.1 eval -c <config> --filter-pattern "<re>" --no-cache`, in the background with a single bounded wait. No run-fix-rerun loops. The behavioural case `ship-sdlc.yaml` "ship-sdlc: --auto mode proceeds without asking 'Run this pipeline?'" is not run in this plan; it runs once, last, after copy-docs, in the brief's Phase S.

**Contract:**
- shape (code): command list in the acceptance bullets, run once each; results recorded as command, exit code, pass/total.
- names: filter alternatives from the item's Verification plus `worktree-mismatch`; the hooks case name starts `stop-pipeline-continue (W4.2)`.
- mirror: Task 7 acceptance bullets are the full command list (item Verification and Done-when).
- decisions: exec configs only, targeted; behavioural datasets edited but not run.
- sync: Task 4 case names; Task 5 line count.

**Acceptance criteria:**
- [ ] Sweep: `command grep -rn` of removed SKILL.md/reference.md phrases, `begin-step`/`complete-step` mentions and the new ledger fields across `tests/promptfoo`, `docs/`, `site/`, `plugins/` is recorded; every **exec** dataset hit (`*-exec.yaml`) is run with `--filter-pattern` and passes; behavioural hits are edited per the Files list and not run.
- [ ] `promptfooconfig-exec.yaml` with `ship-prepare|ship-state|ship-todos|ship-step|ship begin-step|ship complete-step|pipelineAdvancing|verify-side-effect` passes (baseline before this plan: all green).
- [ ] `promptfooconfig-exec-hooks.yaml` with `stop-pipeline-continue|worktree-mismatch` passes.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; `check-docs-consistency.js` exits 0 with only pre-existing warnings.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` stdout empty, exit 0; `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root . --strict` exits 0.
- [ ] Done-when: `wc -l …/SKILL.md` ≤ 450; `command grep -c 'scripts/skill/ship.js" --after'` ≥ 1; `command grep -cE 'begin-step|complete-step'` = 0; `command grep -c 'node -e' …/SKILL.md` = 0; P-TRANS-1 is a table; the `ship-step` cases pass.
- [ ] Exit-criterion probe: `node plugins/sdlc-utilities/scripts/skill/ship.js --has-plan --plan docs/plans/2026-10-19-m4-w1-ship-stepper.md --dry-run` exits 0 and prints a path whose file has `errors` equal to `[]` and contains `"status": "step"`, `"sdlcGitignored"` and `"steps"`.

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B4)

**Why:** Task 4 adds the `--after`/`--result-file`/`--state` CLI contract and an envelope (`status/step/llm_decision/state_file/progress/ext`) to `scripts/skill/ship.js`; Task 3 extends the ledger schema; Task 2 makes `scripts/state/ship.js` require-able.

**Severity hint:** high

**Patch (advisory, not a task of this plan):** add a checklist item to `.sdlc/review-dimensions/runtime-contract.md`: envelope keys, flags, ledger schema fields and `state/ship.js` exports must agree across `ship.js`, `state/ship.js`, `state-format.md` and SKILL.md Step 5. Strengthen-only. Left out of the tasks to avoid scope creep (guardrail no-scope-creep); the orchestrator may take it as a follow-up.

## Verification Scorecard

Not applicable — the Step 5 multi-lens review is run externally by the orchestrator's isolated Opus subagents (invoking brief). The Step 3 critique gates (G1–G21) ran in-skill.
