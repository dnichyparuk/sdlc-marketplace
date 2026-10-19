# Ship Step-Emitter — Spec Consequences Implementation Plan

**Goal:** Amend five ship-spec requirements so the spec matches the shipped step-emitter (ledger lifecycle, start on emit, review gate and branch derive in `ship.js`).
**Architecture:** One edit pass on `docs/specs/ship-sdlc.md`. Requirement ids and positions do not change; only the text of `P-STEP-3`, `R70`, `R-pause`, `R6` and `R-expected-branch-branch-derive` changes. It ships as its own commit after the feature plan.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/question-w1-plan.md (Q7), ruling-w1-plan.md (Q7), arch-wave-1-ledger.md §2 Minor 2, wave-1-readings.md L4, L17
**Verification:** `RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | command grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show HEAD:docs/specs/ship-sdlc.md | ids) <(ids < docs/specs/ship-sdlc.md) && echo SAME`, then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` (stdout empty)

---

## Context

**What problem does this change solve?**
After the feature plan lands, five spec lines contradict the code and SKILL.md. R70 says Step 5 must call `begin-step`/`complete-step`; R-pause says only `begin-step` clears a pause; R6 and R-expected-branch-branch-derive name SKILL.md sections that were deleted; P-STEP-3 says the state file is cleaned up when status is `done`, which the ledger lifecycle contradicts.

**What prompted this change now?**
The plan review of the feature plan (ruling w1-plan, Q7) found that W4.2's Done-when forces these amendments and that the spec is the source of truth.

**What does success look like?**
- The five requirements read as the wordings below.
- The set of spec ids is identical to HEAD (`SAME`).
- `validate-spec-shape.js --root .` prints nothing on stdout.

## Research Findings

- The five bullets sit in `docs/specs/ship-sdlc.md`: `R70` (line near 93), `R-pause` (near 113), `R6` (near 183), `P-STEP-3` (near 261), `R-expected-branch-branch-derive` (near 283). Line numbers are base-dated; the executor locates each bullet by its id, exactly once.
- `validate-spec-shape.js` rejects body lines that contain `#<digits>`, `(removed`, `**Model:**` or a `## ` heading, and flags duplicate ids.
- Ids are matched by the W3 id-set procedure in the Verification line above; the amended text must keep each bullet's leading `- <id>:`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| R6 and R-expected-branch-branch-derive wording | no | minimal re-pointings to `ship.js`, drafted from the ruling's "minimal re-pointings" | the ruling gives no exact text for these two; the executor keeps the rest of each requirement unchanged |
| Other spec lines | no | none touched | scope is the five ids of ruling Q7 |

## Key Decisions

**Problem in one sentence:** five spec requirements still describe SKILL.md-driven sequencing that the step-emitter replaced, so the spec contradicts the shipped behaviour.

- **Separate plan and commit (L17).** The feature plan keeps P-TRANS-1 (item Change 9). These consequential amendments ship alone, so the commit names exactly what changed.
- **Ids unchanged.** Only text changes; `P-5` must print SAME.
- **Non-goals.** No other requirement, no SKILL.md, no code, no tests.
- **Failure audience.** Spec readers and the spec validators; a wrong edit fails `validate-spec-shape.js`.

## Contract Examples

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY `R70`, `R-pause`, `R6`, `P-STEP-3`, `R-expected-branch-branch-derive`; no ids added or removed.
- names: `R70`, `R-pause`, `R6`, `P-STEP-3`, `R-expected-branch-branch-derive`.
- mirror: neighbouring bullets in the same sections.
- decisions: ids and positions unchanged.
- sync: shipped SKILL.md Step 5 and `ship.js`.
```

## Final Shape

`docs/specs/ship-sdlc.md` has the five amended requirements, the same id set as HEAD, and passes `validate-spec-shape.js`. One commit holds the change.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| spec-first | error | PASS | the task edits only the spec |
| test-coverage-required | error | PASS | no source code changes; the id-set diff and the spec validator are the checks |
| no-scope-creep | warning | PASS | five ids only |
| no-auto-eval | error | PASS | no promptfoo run in this plan |
| single-responsibility-tasks | warning | PASS | one task, one deliverable |
| pr-link-github-issue | error | PASS | the PR body links the tracking todo (Phase B) |

## Tasks

### Task 1: Spec consequences of the step-emitter

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — replace the text of `P-STEP-3`, `R70`, `R-pause`, `R6` and `R-expected-branch-branch-derive` only.

**Notes:** Locate each bullet by its leading `- <id>:` with `command grep -nF`, exactly once; if a bullet is missing or occurs more than once, STOP. Keep each bullet's other sentences unless this Contract says to replace them. No text may contain `#` followed by digits. The commit subject is `docs(#9001): specs - ship ledger lifecycle and step-emitter consequences (P-STEP-3, R70, R-pause, R6, R-expected-branch-branch-derive)`; list each amended block before and after in the report for the PR's Plan readings.

**Contract:**
- shape (openspec):
  - `P-STEP-3` (replace the whole bullet text; exact wording): "P-STEP-3: The state file is the ship ledger. The first invocation that has no errors and no `--dry-run` creates it through `state/ship.js init`, or reuses the ledger being resumed. Every `--after` call updates it. The `cleanup` step's `cleanup-pipeline` deletes it on success. It is preserved on `status: "error"` and on forced cleanup, so `--resume` keeps working. A `done` from `edit`/`cancel` deletes it only when no step has run."
  - `R70` (replace the whole bullet text): "R70: Step 5 sends every step through `skill/ship.js --after`, which records start (on emission) and completion in-process with `startStepCore`/`completeStepCore`; the `begin-step`/`complete-step` CLI verbs remain for manual recovery and exec tests."
  - `R-pause` (one insertion): change "`begin-step` and `claimSession` (`--resume`) clear it" to "`begin-step` (or `ship.js` when it emits a step) and `claimSession` (`--resume`) clear it"; the rest of the bullet is unchanged.
  - `R6` (replace the first sentence only): the sentence "Review verdict conditional logic is gated by `flags.reviewThreshold` resolved by `scripts/skill/ship.js`." becomes "The review-gate dispatch decision is computed by `scripts/skill/ship.js` at the `review_gate` step from the review verdict line (`output.artifacts.verdict`) and `flags.reviewThreshold`, which the same script resolves."; the sentences after it are unchanged.
  - `R-expected-branch-branch-derive` (re-point the patch site): the sentence beginning "`ship-sdlc/SKILL.md` MUST close this gap" through "persisting the corrected JSON back to the same file." becomes "`skill/ship.js` MUST close this gap in its `--after branch_prepare` call: after `migrateBranchSlug` it recomputes the steps with `expectedBranch` set to the new branch, so every `--expected-branch <value>` in the emitted `steps[].args` and `steps[].invocation` (string-typed only — `cleanup`'s `invocation` is an object and MUST NOT be touched) carries the new branch." The bullet's first sentence, which says prepare runs before SKILL.md's "Pre-execute workspace auto-detection" decides `EXECUTE_BRANCH` (via an LLM-derived type/slug), is reworded minimally to say prepare runs before the `branch_prepare` step of `ship.js` derives the branch name (via `deriveBranchFromPlan`). Any sentence of the bullet that names SKILL.md, the shell invocation or the prepare-output file as the patch site is minimally reworded to name `ship.js`; all other text stays.
- names: `P-STEP-3`, `R70`, `R-pause`, `R6`, `R-expected-branch-branch-derive`.
- mirror: neighbouring bullets in the same sections (`P-STEP-1`/`P-STEP-2`, `R69`/`R71`).
- decisions: ids and positions unchanged; the P-STEP-3 and R70 wordings are the arbiter's (ruling w1-plan Q7, arch-wave-1-ledger §2 Minor 2).
- sync: feature plan Tasks 1, 4 and 5 (P-TRANS-1, `ship.js`, SKILL.md Step 5).

**Acceptance criteria:**
- [ ] The id-set check in the plan header prints `SAME`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.
- [ ] `command grep -c 'cleaned up when status is' docs/specs/ship-sdlc.md` is 0, and `R70` no longer contains `begin-step` as a MUST.
- [ ] `git diff --stat` shows only `docs/specs/ship-sdlc.md`.

## Verification Scorecard

Not applicable — the Step 5 multi-lens review is run externally by the orchestrator's isolated Opus subagents (invoking brief).
