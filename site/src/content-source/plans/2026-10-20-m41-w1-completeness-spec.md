# Verifying Execute Cleanup and Scoped Completeness Gate — Spec Commit (W8.22 Change 1) Implementation Plan

**Goal:** Amend the execute and ship specs so that execute's R14 cleanup verifies completeness before it deletes the state file, and ship's R-INVARIANT-COMPLETENESS gate runs only when an execute state file still exists (W8.22 Change 1, the spec-first commit).
**Architecture:** One task, two spec files, five in-line text edits. No id line is added, removed or renamed, so the P-5 id-set check prints `SAME` for both specs. The code, docs and tests follow in two later plans (`2026-10-20-m41-w1-completeness-code.md`, `2026-10-20-m41-w1-completeness-tests.md`).
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/wave-1-plan-source.md (item W8.22, Change 1; plan §0; W3 shared procedure P-1 and P-5; readings R-order, R-dated), /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/preflight-wave-1.md (W8.22 table), discovery brief F-spec-lines-and-id-set-1…8
**Verification:** in ONE Bash call, for both specs: `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m41; mkdir -p "$TMPDIR";` then `RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; for n in execute-plan-sdlc ship-sdlc; do diff <(git show HEAD:docs/specs/$n.md | ids) <(ids < docs/specs/$n.md) && echo "SAME $n"; done` prints `SAME execute-plan-sdlc` and `SAME ship-sdlc`; then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . > "$TMPDIR/w822-vss.out" 2>&1; echo "exit=$?"; command grep -cE 'execute-plan-sdlc|ship-sdlc' "$TMPDIR/w822-vss.out"` prints `exit=0` and `0` (the `LEGACY_SHAPE` lines of other specs are baseline at 7a002fb and unrelated).

---

## Context

**What problem does this change solve?**

- Ship halts after every successful execute run. This is a shipped defect (v0.26.0 to v0.29.0, todo #9123).
- The cause is a spec conflict between two rules:
  - Execute's R14 says execute deletes its state file on success. Execute's R5 says a small plan never writes one.
  - Ship's R-INVARIANT-COMPLETENESS says ship must run `state/execute.js verify-completeness` after every execute. With no state file, that script exits 1, and ship halts.
- The owner settled the conflict on 2026-10-20: "R14 wins + verifying cleanup".
  - Execute keeps owning its state lifecycle.
  - Execute's cleanup script itself checks completeness before it deletes the file.
  - Ship's gate is scoped to "an execute state file for the branch exists when execute returns".

**What prompted this change now?**

Every M4 wave 3b ship run needed a manual `complete-step` bypass. The owner moved #9123 to M4.1 wave 1 as PRIORITY. The repository rule is spec first: the spec commit lands before any code (plan §3 Execution conventions; AGENTS.md "Spec-driven development").

**What does success look like?**

- The five spec sentences read as the item states.
- P-5 prints `SAME` for both specs: no id was added, lost or renamed.
- `validate-spec-shape.js` reports nothing for either spec.
- The commit contains only these two files.

## Research Findings

- Both specs are LF and already contract-shaped (`## Inputs and flags` present; `grep -c $'\r'` = 0 at 7a002fb) (F-spec-lines-and-id-set-7).
- Every anchor below occurs exactly once at 7a002fb (`command grep -F -- … | wc -l` = 1). The pre-flight found no shifted line numbers (F-spec-lines-and-id-set-1, -2, -4, -5, -6).
- The id `R-INVARIANT-COMPLETENESS` occurs four times in the ship spec (`:343`, `:477`, `:478`, `:479`). The last three are Issue-trail table rows. So every anchor in this plan is a quoted sentence, never the bare id (F-spec-lines-and-id-set-7).
- The ship spec's R-INVARIANT-COMPLETENESS line continues after the Scope sentence with the `execute_handoff` sentences ("After a pending-question stop, …"). Only the Scope sentence is replaced; the rest of the line stays (F-spec-lines-and-id-set-5).
- The execute spec's R-INVARIANT-COMPLETENESS line continues after the replaced sentence with " Testable assertion: …". The replacement keeps that single space separator (F-spec-lines-and-id-set-4).
- Ship already uses the scoped form at `execute_handoff`. The ship spec's P-TRANS-1 row (`:271`) states it: "if an execute state file exists, `verify-completeness` runs … otherwise execute is recorded completed". This plan extends the same scope to the normal dispatch path (F-spec-lines-and-id-set-7).
- Today's P-1 id counts are 199 (ship) and 133 (execute). The source's 196/124 are stale. The check uses the `diff` form, so no count is hard-coded (F-spec-lines-and-id-set-7).
- `validate-spec-shape.js --root .` exits 0 today but prints `LEGACY_SHAPE` lines for eight other specs (commit-sdlc, error-report-sdlc, harden-sdlc, jira-sdlc, received-review-sdlc, setup-sdlc, verify-pipeline-sdlc, version-sdlc). It prints no line for execute or ship.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Single-task plan | no | one task | the source names this plan as ONE task (one spec commit); plan-sdlc's "at least 2 tasks" default yields to the source |
| R14 append punctuation | no | appends ". In this verifying cleanup, " + the item's sentence | the original R14 line has no closing period, so the literal append would join two sentences with no break; ruling w1-plan m4 adds "In this verifying cleanup," so R14 literally names the verifying cleanup (M4.1 exit criterion); the item's appended words follow verbatim |
| Validator check | no | "prints no line naming execute-plan-sdlc or ship-sdlc, exit 0" instead of "prints no stdout line" | the validator writes its `LEGACY_SHAPE` lines for other specs to stderr, not stdout (`validate-spec-shape.js --root . 2>/dev/null \| wc -l` prints `0` at a1cea5b), so the item's "no stdout line" check is satisfiable; the plan keeps the named-spec check because it also reads stderr and is no weaker (ruling w1-plan m1) |
| Full critique for a 2-file plan | no | ran the full plan-sdlc critique and review | the requester asked for the full critique and review; lightweight routing would have skipped them |

## Key Decisions

**Problem in one sentence:** the execute spec deletes or never writes the state file that ship's completeness gate unconditionally requires, so ship halts after every successful execute.

- **Scope the gate; do not special-case exit 1.** The gate decides by whether the state file exists, not by the script's exit code. Exit 1 also means "wrong branch" or "wrong state directory", so ignoring it would hide real faults (item guardrail "Do not special-case exit 1").

- **A corrupt state file counts as existing.** Then ship runs the check, which fails loudly. Treating a corrupt file as "no state" would let a broken run pass.

- **Edit sentences in place; add no ids.** The rules change meaning only inside existing R14, R-INVARIANT-COMPLETENESS (both specs) and the REPORT phase entry. No new id is needed, and P-5 stays a one-line proof.

- **Non-goals.**
  - No code, SKILL.md, docs page or test changes (plans 2 and 3).
  - No edit to execute R5, the Step 5f text, the P-TRANS-1 row or any other spec line.
  - No `site/` refresh; copy-docs runs once at the end of the wave.
  - No change to the installed plugin 0.21.29 (reading R-installed).

- **Failure audience.** Plan 2's executor and every later reader of the two specs. A wrong sentence would make plan 2 implement a different gate; plan 2 STOPs if the amended sentences are absent.

## Contract Examples

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY execute R14, the REPORT phase **Output:** entry and execute R-INVARIANT-COMPLETENESS; MODIFY ship R-INVARIANT-COMPLETENESS and its Acceptance line; delta text pinned in the task's diff; no ids added or removed.
- names: `R14`, `R-INVARIANT-COMPLETENESS` (execute), `R-INVARIANT-COMPLETENESS` + Acceptance (ship).
- mirror: ship spec P-TRANS-1 `execute_handoff` row (`docs/specs/ship-sdlc.md:271`) for the scoped-gate wording.
- decisions: gate decided by state-file existence; corrupt file counts as existing.
- sync: plan 2 cites these sentences verbatim.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source code changes in this plan; the code and its promptfoo cases are plans 2 and 3 |
| no-ci-bypass | error | PASS | No CI step is skipped; the spec validator and consistency checks run |
| no-auto-eval | error | PASS | No promptfoo run in this plan |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Only the five item edits; non-goals listed |
| single-responsibility-tasks | warning | PASS | One deliverable: the amended spec sentences |
| scripts-over-llm-logic | error | PASS | The amended rule moves the check into `state/execute.js cleanup` (script) instead of prose order |
| yagni | warning | PASS | No new ids or sections |
| cross-skill-consistency | error | PASS | Execute and ship specs are amended together in one commit, so both sides of the contract agree |
| pr-link-github-issue | error | PASS | Tracking is local todo #9008 / #9123 with no GitHub issue; nothing to link |
| dry | warning | PASS | The scope rule is stated once in ship's spec; execute's spec points to it ("ship R-INVARIANT-COMPLETENESS, Scope") |
| kiss | warning | PASS | In-place sentence edits |
| spec-first | error | PASS | This is the spec commit; it lands before the SKILL.md and code commit (plan 2) |
| project-agnostic | error | PASS | Spec of the plugin itself; no repo-local config edits |
| flag-coherence-cross-skill | error | PASS | No flag sites touched |
| no-opposite-logical-vectors | error | PASS | Both specs state the same gate condition ("an execute state file … exists when execute returns") |
| flag-resolution-single-source | warning | PASS | No flags |
| state-premise | error | PASS | Key Decisions states the problem in one sentence |
| smallest-viable-cut | warning | PASS | One task, two files, the five item edits only |
| failure-audience | warning | PASS | Key Decisions names plan 2's executor and spec readers |
| explicit-non-goals | warning | PASS | Key Decisions lists the non-goals |
| ambiguity-stops-and-asks | error | PASS | The two literal-text adjustments are in the Deviations table with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified in this plan |
| agent-dispatch-script-driven | error | PASS | No agent dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag |
| workspace-mode-compatibility | error | PASS | Docs-only edit of tracked files; the state-file lookup it specifies uses `resolveStateDir()` (main worktree) in both workspace modes |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md or dispatched prompt changes |

## Tasks

### Task 1: Amend execute R14 / REPORT / R-INVARIANT-COMPLETENESS and ship R-INVARIANT-COMPLETENESS

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — three in-line edits (R14, REPORT **Output:**, R-INVARIANT-COMPLETENESS).
- Modify: `docs/specs/ship-sdlc.md` — two in-line edits (R-INVARIANT-COMPLETENESS, its Acceptance line).

**Notes:** Implements F-spec-lines-and-id-set-1, -2, -4, -5, -6 (the five sites) under the id-set facts of F-spec-lines-and-id-set-7 and -8. Line numbers are at 7a002fb (`:32`, `:103`, `:214`, `:343`, `:344`). Run `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m41; mkdir -p "$TMPDIR";` in the same Bash call as every command that uses `$TMPDIR`. The branch gets the W3.5 commit-sdlc restructure before this run, which does not touch these files. Still, locate every site by content: each anchor must print `1`. If any prints another number, STOP and report; do not search for an alternative (plan §0 rule 2, reading R-dated). A shifted line number alone is only a note.

**Anchors (run before editing; each must print `1`):**

```bash
e=docs/specs/execute-plan-sdlc.md; s=docs/specs/ship-sdlc.md
for a in '- R14: State persistence after every wave via `state/execute.js`; cleanup on success, preserve on failure for `--resume`' \
  '   - **Output:** state file removed on success; preserved on failure for `--resume`' \
  '`ship-sdlc` MUST gate the execute step on this exit code before advancing to commit. Testable assertion:'; do
  printf '%s  %s\n' "$(tr -d '\r' < "$e" | command grep -F -- "$a" | wc -l)" "$a"
done
for a in 'ship-sdlc MUST run `state/execute.js verify-completeness` as a blocking invariant check.' \
  'Scope: the check covers an execute run that ship dispatched and that returned to ship. After a pending-question stop' \
  'when all tasks are accounted the pipeline advances normally.'; do
  printf '%s  %s\n' "$(tr -d '\r' < "$s" | command grep -F -- "$a" | wc -l)" "$a"
done
```

**Must not touch:** every other line of both specs, including execute R5 ("no wave orchestration, no state file"), the REPORT **Script:** and **Params:** lines, the execute_handoff sentences that follow the ship Scope sentence, the P-TRANS-1 table row and the Issue-trail rows. Every other file.

**Contract:**
- shape (openspec): five MODIFY edits, no ids added or removed. `…` marks unchanged text inside the same line.

  `docs/specs/execute-plan-sdlc.md`:

  ```diff
  -- R14: State persistence after every wave via `state/execute.js`; cleanup on success, preserve on failure for `--resume`
  +- R14: State persistence after every wave via `state/execute.js`; cleanup on success, preserve on failure for `--resume`. In this verifying cleanup, `state/execute.js cleanup` runs the R-INVARIANT-COMPLETENESS check itself and deletes the state file only when the check exits 0; on exit 65 or 2 it keeps the file and exits with that code.
  -   - **Output:** state file removed on success; preserved on failure for `--resume`
  +   - **Output:** state file removed on success, and only when the completeness check passes (R14); preserved on failure for `--resume`
  -- R-INVARIANT-COMPLETENESS: At execute-step finalization, … `ship-sdlc` MUST gate the execute step on this exit code before advancing to commit. Testable assertion: …
  +- R-INVARIANT-COMPLETENESS: At execute-step finalization, … `ship-sdlc` MUST gate the execute step on this exit code before advancing to commit whenever the state file still exists when execute returns (ship R-INVARIANT-COMPLETENESS, Scope). R14's verifying cleanup and the R5 small-plan path leave no state file; ship then advances without the check. Testable assertion: …
  ```

  `docs/specs/ship-sdlc.md`:

  ```diff
  -- R-INVARIANT-COMPLETENESS: After `execute-plan-sdlc` returns …, ship-sdlc MUST run `state/execute.js verify-completeness` as a blocking invariant check. … Scope: the check covers an execute run that ship dispatched and that returned to ship. After a pending-question stop, …
  +- R-INVARIANT-COMPLETENESS: After `execute-plan-sdlc` returns …, ship-sdlc MUST run `state/execute.js verify-completeness`, within the Scope below, as a blocking invariant check. … Scope: the check covers an execute run that ship dispatched and that returned to ship, when an execute state file for the branch exists at that point (a corrupt file counts as existing). When none exists — execute-plan-sdlc's R14 cleanup, which deletes the file only after the same check passed, or the R5 small-plan path, which never writes one — ship-sdlc records the execute step completed without running the check and adds `completenessGate: "no-execute-state"` to that history entry's data. After a pending-question stop, …
  -  - Acceptance: … when all tasks are accounted the pipeline advances normally.
  +  - Acceptance: … when all tasks are accounted the pipeline advances normally. When `execute-plan-sdlc` returns success and no execute state file exists for the branch, the execute step is recorded completed with `completenessGate: "no-execute-state"` and the pipeline advances to `stage_changes`.
  ```

- names: `R14`, `R-INVARIANT-COMPLETENESS` (execute, `## Gates`), REPORT phase **Output:** entry (execute `### Phases`), `R-INVARIANT-COMPLETENESS` and its `  - Acceptance:` line (ship); ledger field `completenessGate`, value `"no-execute-state"`.
- mirror: ship P-TRANS-1 `execute_handoff` row (`docs/specs/ship-sdlc.md:271`) for the scoped wording.
- decisions: see Key Decisions (scope by existence; corrupt counts as existing); R14 period per the Deviations table.
- sync: plan 2 (`2026-10-20-m41-w1-completeness-code.md`) quotes the new sentences as its pre-condition; `docs/skills/ship-sdlc.md` and `docs/skills/execute-plan-sdlc.md` are aligned in plan 2.

**Commit:** subject `docs(#9008): specs - verifying execute cleanup and scoped completeness gate (R14)`. Do not commit inside the task; the ship run's commit step uses this subject. Body: one line per edited id (execute R14, REPORT Output, execute R-INVARIANT-COMPLETENESS, ship R-INVARIANT-COMPLETENESS + Acceptance), then `Checks: P-5 SAME (execute, ship); validate-spec-shape prints nothing for either spec.` with the real results.

**Acceptance criteria:**
- [ ] Before editing, all six anchors print `1`.
- [ ] Before editing, `node .claude/skills/validate-plugin-consistency/check-consistency.js > "$TMPDIR/w822-cc.before"; node .claude/skills/validate-skill-docs/check-docs-consistency.js > "$TMPDIR/w822-dc.before"` ran; after editing, the same commands write `.after` files and `diff` of each pair is empty.
- [ ] After editing, each new text prints `1`: `command grep -cF -- 'runs the R-INVARIANT-COMPLETENESS check itself and deletes the state file only when the check exits 0; on exit 65 or 2 it keeps the file and exits with that code.' docs/specs/execute-plan-sdlc.md`; `command grep -cF -- 'state file removed on success, and only when the completeness check passes (R14); preserved on failure for' docs/specs/execute-plan-sdlc.md`; `command grep -cF -- 'whenever the state file still exists when execute returns (ship R-INVARIANT-COMPLETENESS, Scope). R14' docs/specs/execute-plan-sdlc.md`; `command grep -cF -- 'verify-completeness`, within the Scope below, as a blocking invariant check.' docs/specs/ship-sdlc.md`; `command grep -cF -- 'adds `completenessGate: "no-execute-state"` to that history entry'"'"'s data. After a pending-question stop' docs/specs/ship-sdlc.md`; `command grep -cF -- 'advances normally. When `execute-plan-sdlc` returns success and no execute state file exists for the branch' docs/specs/ship-sdlc.md`.
- [ ] The old sentence `before advancing to commit. Testable assertion:` now prints `0` in the execute spec, and `returned to ship. After a pending-question stop` prints `0` in the ship spec.
- [ ] The header Verification command prints `SAME execute-plan-sdlc` and `SAME ship-sdlc`, the validator line count is `0`, and the validator exits 0.
- [ ] `git diff --stat` shows only the two spec files; `git diff | command grep -c $'\r'` prints `0`.
- [ ] `git status --porcelain` shows no untracked file outside this plan's file list before the ship commit step.

## Final Shape

The two specs now agree on who owns the execute state file.

- Execute's R14 says its cleanup verifies completeness and deletes the file only when the check passes. Otherwise it keeps the file and exits with the check's code.
- Ship's R-INVARIANT-COMPLETENESS runs the check only when a state file still exists after execute returns. A corrupt file counts as existing.
- When no file exists, ship records the execute step completed and marks the history entry `completenessGate: "no-execute-state"`.
- No id changed. Plan 2 can now implement the rule and cite these sentences.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 1 |
| Correctness | 0 | 0 | 1 | 1 |
| Coherence | 0 | 0 | 1 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Task(s) | Status |
|---|---|---|
| W8.22 Change 1: execute R14 append | Task 1 | covered |
| W8.22 Change 1: execute REPORT `:103` | Task 1 | covered |
| W8.22 Change 1: execute R-INVARIANT-COMPLETENESS `:214` | Task 1 | covered |
| W8.22 Change 1: ship `:343` insert + Scope replacement | Task 1 | covered |
| W8.22 Change 1: ship `:344` Acceptance append | Task 1 | covered |
| P-5 SAME both specs; validator clean | Task 1 | covered |

Review: round 1 Approved (single reviewer, all lenses). Applied: the validator's exit code is read separately from the `grep` count. Open advisories (not blocking): `git diff | grep -c $'\r'` exits 1 when it prints `0`, so read its printed count, not its exit code.

Verdict: All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
