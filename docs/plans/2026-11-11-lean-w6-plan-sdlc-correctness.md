# Lean Wave 6 plan-sdlc Correctness Implementation Plan

**Commit:** `fix(#9348): plan-sdlc - stop hook, carry, gc and spec fixes`
**Goal:** Fix the plan-sdlc correctness defects of lean wave 6, tracked as #9348:
- the plan-integrity Stop hook stays silent on a run that names no plan file (#9271);
- the hook keeps the marker while the planning run is still in flight, so later checkpoints are recorded (#9278);
- a merged re-dispatch in the review loop re-runs every lane or lens whose earlier result had a blocking issue, so fixed issues do not come back through `--carry` (#9276);
- `dimension-coverage` is not carried when G17 did not run (#9277);
- the Step 1 brief check accepts lowercase finding ids (#9301);
- the Step 6.5 and 6.6 bash blocks use no shell variables from other calls (#9246);
- PF5 reads the whole Acceptance criteria block, with no 5000-character window (#9264);
- the session-start hook removes old `sdlc-plan-critique-*` directories (#9258);
- the misleading R37 bullet, and the spec and doc wording lows, are fixed (#9249, #9270, #9274).
**Architecture:** The root problem: plan-sdlc's own bookkeeping gives wrong signals. The Stop hook cannot tell a finished plan run from one in progress or from a run that wrote no plan, and the critique carry brings back results that were already fixed. The fix gives the hook one in-flight signal (the critique directory, now recorded in the plan state file), adds a deterministic `rerun` list to `plan.js diff-material`, and corrects the text, validator and sweep defects in place. The spec changes come first (Task 1); scripts and the hook follow with promptfoo exec cases; SKILL.md, review-loop.md and the user doc change last.
**Source:** conversation context (wave 6 scope list, /tmp scratchpad `w6-scope.md`; discovery brief `F-*` ids)
**Verification:** targeted promptfoo exec runs per task (`promptfooconfig-exec.yaml` and `promptfooconfig-exec-hooks.yaml` with `--filter-pattern`), `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`, the plugin consistency validator, and `validate-plan-format.js` on this plan.

---

## Context

**What problem does this change solve?**

- plan-sdlc writes a plan state file (the "marker") at Step 0. A Stop hook (`hooks/stop-plan-integrity.js`) reads it when a turn ends. The hook warns when checkpoints are missing, and it deletes the marker on every Stop.
- So a turn that ends while Step 3 lanes run in the background, or while a lean-mode plan subagent still works, deletes the marker too early. The later checkpoint writes then fail without a message (#9278).
- The hook also warns on a run that never named a plan file (#9271). The warning text says a plan was "presented", which is false there.
- The review loop copies ("carries") lane results from the previous iteration when a lane is not re-dispatched. Those results can date from before the Step 4 fixes. So blocking issues that were already fixed come back into `merged.json` and cost extra iterations (#9276).
- When G17 did not run, `dimension-coverage` still sits in the carry set. Each merge then adds one advisory "no result file" entry (#9277).
- Smaller defects: an uppercase-only finding-id check (#9301); shell variables that no Bash call sets (#9246); a 5000-character window in PF5 (#9264); critique temp directories that nothing removes (#9258); a misleading bullet (#9249); and spec and doc wording that no longer matches the code (#9270, #9274).

**What prompted this change now?**

- The lean loop runs plan-sdlc in a subagent every wave. The Stop hook fired on the planner in waves 3a and 3b. The ledger lists the residual of F-4 as a recurring cost.
- The owner's focus (2026-11-10) is finishing the plugin, and plan-sdlc runs in every wave.

**What does success look like?**

- A Stop during a plan run in flight keeps the marker and prints nothing.
- A Stop after a run that named no plan file prints nothing.
- A Stop after a finished run with skipped gates still warns once, as before.
- A merged re-dispatch never brings back a blocking issue from a result that predates the fix.
- Every item has exec test cases, and the spec says what the code does.

## Research Findings

Every item was re-checked against HEAD `5a44a90` (plugin v0.49.0). All of them still reproduce, so no item is dropped.

- **#9271, #9278 — Stop hook.** `hooks/stop-plan-integrity.js:98-149` collects missing markers, deletes the marker at `:126` on every owned Stop, and exits 2 when one is missing. `skill/plan.js:478-490` creates the marker at prepare time with only `skillInvoked`, before any plan exists. v0.49.0 added session ownership (`:86-92`), but R20 says a subagent stamps its parent's session id, so ownership cannot separate a lean plan subagent from its parent (F-stop-hook-plan-integrity-marker-1, -2, -3). The `--mark` writes swallow the "no plan state file" error (`plan.js:110-117`, called with `2>/dev/null || true`), so the lost checkpoints are silent (F-stop-hook-plan-integrity-marker-4).
- **#9278 reproduced in this planning run.** This plan was written by plan-sdlc v0.49.0 in a subagent. While the four Step 3 lanes ran in the background, the plan marker `plan-main-*.json` disappeared from `.sdlc/execution/`. The later `--mark guardrailsEvaluated` call then printed `no plan state file found for branch "main"` and exited 1, and `--mark critiqueRan` failed silently.
- **Critique directory as the in-flight signal.** `plan.js:627-631` creates `critiqueDir` (P22) on every prepare run. SKILL.md removes it at Step 7 and on every stop path (Error Recovery table). So "the directory still exists" means "the run has not reached its end". The directory is created after the marker today, so its path is not in the state file.
- **#9276, #9277 — carry.** `scripts/lib/plan-critique.js:587-597` builds `laneCarry` from every lane plus `dimension-coverage` and copies each previous file unfiltered; `:637` then takes all of its issues (F-plan-critique-carry-filtering-1). `:588` has no `g17NotRun` exclusion (F-plan-critique-carry-filtering-2). `diffMaterial` (`:135-167`) decides which lanes are re-dispatched and does not look at earlier results.
- **#9301.** `skills/plan-sdlc/SKILL.md:151` greps `F-[A-Z0-9_-]+-[0-9]+`. The orchestrator writes lowercase ids such as `F-stop-hook-plan-integrity-marker-1` (`agents/plan-explore-orchestrator.md:115`) (F-skill-md-step-text-fixes-1, -2).
- **#9246.** `SKILL.md:399` uses `"$plan_path"`; `:431-433` read `$FINAL_FLAG`, `$TEMPLATE_PATH` and `$plan_path`. Each Bash call is a new shell, so these are empty, and PF9 and PF10 are skipped without a message. `:419` describes `${FINAL_FLAG:+--final}`, which the block does not use (F-skill-md-step-text-fixes-5, -6).
- **#9264.** `scripts/ci/validate-plan-format.js:363` matches `[\s\S]{0,5000}?` up to the next `### `, `---` or `## `. A task whose Contract runs past 5000 characters gets a false "missing **Acceptance criteria:**". A `- [ ]` line inside the Contract also counts as an acceptance checkbox. The Notes regex at `:374` has a similar `{0,2000}` window (F-skill-md-step-text-fixes-7).
- **#9258.** `hooks/session-start.js:242-257` sweeps only `sdlc-explore-`. `gcTempdirs` (`scripts/lib/state.js:755-825`) needs a branch slug in the name, and `sdlc-plan-critique-XXXXXX` has none (F-gc-tempdir-sweep-and-spec-doc-lows-1, -2, -3). An age-only helper already exists: `gcAgedTempdirs` (`state.js:839-874`, used by `skill/review.js:645` for `sdlc-review-`).
- **#9249.** `SKILL.md:179` puts the R37 parallel-call rule, with "(lightweight scope and error fallback included)", as a bullet in the list of things to explore (F-skill-md-step-text-fixes-8).
- **#9270.** `docs/specs/plan-sdlc.md:81` (R36) says the R8 author rule "may add `model: opus`". P17 and P25 (`:186`, `:194`) have no null-`agentPath` rule. P16 and P17 do not list their `inputNames`. `docs/skills/plan-sdlc.md:5` and `:287` speak of a "cross-model" reviewer and a `{GUARDRAILS}` template variable (F-gc-tempdir-sweep-and-spec-doc-lows-7, -8, -9).
- **#9274.** `docs/specs/plan-sdlc.md:170` (P1) names `openspec.detected`. `lib/openspec.js` returns `present`, and `plan.js:497` reads `openspec.present` (F-gc-tempdir-sweep-and-spec-doc-lows-10).
- **Tests.** Hook cases are in `tests/promptfoo/datasets/hook-stop-plan-integrity-exec.yaml` (config `promptfooconfig-exec-hooks.yaml`), with the wrapper `tests/promptfoo/scripts/run-stop-plan-integrity.js` (F-stop-hook-plan-integrity-marker-6). Merge and diff cases are in `plan-prepare-exec.yaml` (`plan-merge:`, `plan-diff:`), PF5 cases in `plan-format-exec.yaml`, and the sweep case in `session-start-exec.yaml:277-284` (F-plan-critique-carry-filtering-5, -6; F-skill-md-step-text-fixes-9 to -12; F-gc-tempdir-sweep-and-spec-doc-lows-5).
- **Mirrors.** `site/src/content-source/` holds tracked byte copies of `docs/specs/` and `docs/skills/` (made by `site/scripts/copy-docs.mjs`). Both copies of `plan-sdlc.md` are identical to `docs/` today.
- **Commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "<pattern>"`; hooks use `promptfooconfig-exec-hooks.yaml`. Spec shape: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Owner questions | no | every choice below was taken without the owner (no user is available) | the brief says to take the recommended option and record it |
| #9258 scope | no | adds the sweep to the session-start hook only; `ship.js --gc` is not changed | the brief puts ship out of scope; the session-start sweep runs in every session, so it covers the item |
| PF5 Notes window | no | also removes the `{0,2000}` window of the Notes regex in the same check | same defect class in the same PF5 function; without it a long Notes block escapes the 5-line cap |
| #9301 test | no | adds one behavioural case to `plan-sdlc.yaml` and does not run it | SKILL.md text has no exec surface; behavioural runs are user-initiated only |
| P25 null `agentPath` | no | defines the rule (not dispatched, logged, still in `--lenses all`) in the spec and review-loop.md | #9270 asks for the missing rule; this mirrors the P16 lane rule, where a missing result is a blocking failure |
| Release | no | writes CHANGELOG `[Unreleased]` entries only; ship's version step bumps the minor version | as the brief says |
| Tracking id | no | `#9348` is a tracking id in the local todo list, not a GitHub issue; the PR names it and carries no `Fixes` line | same rule as waves 1 and 2 |

## Decisions taken without the owner

1. **In-flight signal for the Stop hook:** the existence of the critique directory, recorded in the plan state file. Recommended over a new `handoff` checkpoint, because the directory already exists and every end path already removes it.
2. **A marker with no `planFilePath`:** the hook deletes it without a warning. The run named no plan file, so no plan was presented (#9271).
3. **#9276 approach:** re-run every lane or lens whose previous result had a blocking issue, instead of filtering the carried issues out. Filtering would hide issues that the fix did not resolve.
4. **#9258:** use the existing `gcAgedTempdirs` helper with a 168-hour (7-day) window in the session-start hook. `ship.js` is not changed (out of scope).
5. **#9246:** two literal validator command blocks in Step 6.6 (full pipeline and lightweight), and `<PLAN_PATH>` in Step 6.5, as in Step 3.
6. **#9301:** the pattern becomes `F-[A-Za-z0-9_.-]+-[0-9]+`. The spec (R26) says ids match in either case.
7. **PF5:** the Acceptance criteria block ends at the next `**<Label>:**` line. The Notes window goes too (see Deviations).

## Key Decisions

- **Critique directory over a new checkpoint marker.** The hook needs to know if the run is still going. A new `handoff` marker at Step 7 would also work. But the critique directory already marks the run's lifetime: prepare creates it, and Step 7 and every stop path remove it. Recording its path in the state file costs one field. A new marker would cost a new `--mark` name, a SKILL.md step and a new failure mode.
- **Accepted trade-off of the in-flight rule.** A model that skips Step 7 entirely leaves the directory behind, so the hook never warns for that run. Prune-on-write at the next prepare and the 7-day sweep remove the leftovers. A run that skips Step 3 but reaches Step 7 still gets the warning, which is the case the hook exists for.
- **No plan file named means no warning.** A marker without `planFilePath` comes from a run that stopped before Step 0 path resolution, or from a session that never wrote a plan. Today this is the false "Plan presented" warning of #9271. The cost: a model that writes a plan but skips the `plan-file` checkpoint is no longer warned. That checkpoint is a single line at Step 0, so the risk is small.
- **Re-run dirty results instead of filtering them.** "Carry only clean results" could mean two things. Dropping the dirty file gives a missing-result lane failure, which blocks. Stripping its issues hides issues the fix did not resolve. Re-running the lane gives a fresh, honest result. The list comes from a script (`diff-material --prev-dir`), not from model judgement (guardrail `scripts-over-llm-logic`).
- **`--prev-dir` on `diff-material`, not on `merge-lanes`.** `merge-lanes` runs after the dispatch, so it is too late to choose what to dispatch. `diff-material` already produces `affectedLanes`, the dispatch list of the merged re-dispatch.
- **Reuse `gcAgedTempdirs`.** It already does an age-only sweep for `sdlc-review-` (guardrail `dry`). `gcTempdirs` needs a branch slug, which critique directory names do not have.
- **Smallest viable cut.** Tasks 1 to 4 fix the hook and the carry, which cost the lean loop real time each wave. Tasks 5 to 9 are small text, validator and sweep fixes in the same files and the same release. The owner put all of them in this wave, so none is speculative.
- **Who fails if this ships wrong.** Every plan-sdlc user: a wrong hook rule either hides skipped gates or keeps warning. A wrong `rerun` list makes the review loop run too few lanes (stale results) or too many (cost). The lean orchestrator reads the hook output every wave.
- **Non-goals.** Not changed: `ship.js --gc` and the ship skill; the explore orchestrator's id format; the R8 model rule itself; the other validators; `gcTempdirs`; other skills' state files. No new behavioural suite run.
- **One task for the plan-sdlc instruction text.** Task 7 holds five small edits in SKILL.md and review-loop.md. Each is a few lines, and all of them are the model-facing text of one skill. One deliverable ("plan-sdlc instructions match the spec") is easier to review than five one-line tasks. Task 9 follows the wave 1 and 2 pattern: the CHANGELOG entry and the plan file ship together.
- **`--prev-dir` is a new flag name.** `grep -rn "prev-dir\|prevDir" plugins/*/scripts/skill/*.js plugins/*/scripts/lib/*.js` returns nothing at HEAD. No other prepare script defines it, so no meaning needs to be aligned (guardrail `flag-semantic-consistency-cross-skill`).
- **Workspace modes.** The plan state file lives in the main worktree's `.sdlc/execution/` (`resolveStateDir`), and `critiqueDir` is an absolute path under `os.tmpdir()`. Both resolve the same under `ship.workspace=branch` and `ship.workspace=worktree`, so the hook rule behaves the same in both modes.

## Contract Examples

**code** (Task 3):

````markdown
**Contract:**
- shape (code): in `hooks/stop-plan-integrity.js`, an owned marker with a failing check and an existing `critiqueDir` exits 0 and is kept; a marker without `planFilePath` is deleted and exits 0.
- names: `critiqueDir` (state field), wrapper flag `--critique-dir present|gone`.
- mirror: the ownership exit at `stop-plan-integrity.js:86-92`.
- decisions: Decisions taken without the owner 1, 2.
- sync: R20, R21 (Task 1).
````

**docs** (Task 8):

````markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md`; Overview sentence and Plan Mode step 5 name "plan reviewer"; audience: end users.
- names: none.
- mirror: wording of the Step 5 lens table in `skills/plan-sdlc/review-loop.md:30-38`.
- decisions: #9270.
- sync: `site/src/content-source/skills/plan-sdlc.md` byte-identical.
````

**openspec / spec** (Task 1):

````markdown
**Contract:**
- shape (openspec): MODIFY R20, R21, R26, R36, R64, R67, P1, P16, P17, P22, P25, PF5 in `docs/specs/plan-sdlc.md`; no id added, removed or renumbered.
- names: the ids above.
- mirror: the R20/R21 amendment of v0.49.0 (history row `R20, R21 | marker ownership, #9339`).
- decisions: Decisions taken without the owner 1 to 7.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte-identical.
````

## Tasks

### Task 1: plan-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R20, R21, R26, R36, R64, R67, P1, P16, P17, P22, P25, PF5 text; history rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec

**Notes:** Cites F-stop-hook-plan-integrity-marker-5, F-plan-critique-carry-filtering-4, F-skill-md-step-text-fixes-1, F-gc-tempdir-sweep-and-spec-doc-lows-7, -8, -10, -12. The spec comes first (guardrail `spec-first`). Issue numbers go only into the history table.

**Acceptance criteria:**
- [ ] Each id in the Contract carries the new text, and no other requirement line changes.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js` exits 0.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.
- [ ] `grep -c "openspec.detected" docs/specs/plan-sdlc.md` prints 0.

**Contract:**
- shape (openspec): MODIFY these ids. Added text is shown; the rest of each line stays.

```text
R20 (after "...from `CLAUDE_CODE_SESSION_ID`)."):
  The state file also carries `critiqueDir` (P22, the prepare output's path, or null), written
  with `skillInvoked` at Step 0 prepare; `--mark` keeps it.
R20 Lifecycle (b), after "A marker the hook does not own is left in place; ...":
  A marker the hook keeps because the run is in flight (R21) is not deleted either.
R21, replace "if any check fails it emits a structured stderr warning" with
  "if any check fails, and neither rule below applies, it emits a structured stderr warning";
  append: For an owned marker with a failing check: when `critiqueDir` is a non-empty string
  naming an existing directory, the run is still in flight (Step 7 and every stop path remove
  that directory), so the hook exits 0 silently and keeps the marker; otherwise, when
  `planFilePath` is not set, the run named no plan file, so the hook deletes the marker and
  exits 0 silently. A marker whose checks all pass is deleted and the hook exits 0.
  - Acceptance: exec cases whose descriptions start with `stop-plan-integrity: run`.
R26, append: Finding ids match in either case: the orchestrator writes the dimension name in
  lowercase (e.g. `F-stop-hook-1`), and the Step 1 brief check and G15 accept both cases.
R36, replace "the R8 author rule may add `model: opus`" with
  "the R8 author rule applies: `model: opus` is passed when the plan author ran on sonnet,
  otherwise no `model` is passed".
R64, append: A lane or lens whose result in the previous iteration held a blocking issue is
  re-dispatched with the affected ones (R67 `rerun`), so a result that predates a fix never
  returns through the carry.
R67 (a), replace "minus `guardrail-compliance` under `--no-guardrails`" with
  "minus `guardrail-compliance` under `--no-guardrails`, and minus `dimension-coverage`
  under `--g17-not-run`".
R67 (b), replace "`diff-material --before <path> --after <path> [--full]` →
  `{ material, triggers, details, affectedGates, affectedLanes }`" with
  "`diff-material --before <path> --after <path> [--full] [--prev-dir <iterDir>]` →
  `{ material, triggers, details, affectedGates, affectedLanes, rerun }`"; append:
  With `--prev-dir`, `rerun` lists each lane of the lane table whose `<name>.json` in
  `<iterDir>` holds an issue with `blocking: true`, has a `laneStatus` other than `ok`, or is
  not valid JSON, and each `lens-<name>.json` that holds an issue with `blocking: true` or
  severity `CRITICAL`, or is not valid JSON (as `lens:<name>`; `lens:all` when the after plan
  has fewer than 5 tasks), sorted; these entries are added to `affectedLanes` unless it is
  `["*"]`. `rerun` is `[]` without `--prev-dir`. It changes neither `material` nor
  `triggers`. An `<iterDir>` that is not a readable directory is a usage error.
P1, replace "`openspec.detected` (boolean)" with "`openspec.present` (boolean)".
P16, append: `inputNames` per lane: static-structural `PLAN_FILE_PATH`,
  `REQUIREMENTS_SUMMARY`, `ACTIVE_GUARDRAILS`; content-coverage `PLAN_FILE_PATH`,
  `REQUIREMENTS_SUMMARY`, `OPENSPEC_TASKS`, `ACTIVE_GUARDRAILS`, `BRIEF_FINDING_IDS`,
  `FORMAT_REFERENCE_PATH`, `PLAN_TEMPLATE_PATH`; guardrail-compliance `PLAN_FILE_PATH`,
  `ACTIVE_GUARDRAILS`; dimension-coverage `PLAN_FILE_PATH`, `FIRED_CRITERIA_JSON`.
P17, append: `inputNames` per lens: `PLAN_FILE_PATH`, `REQUIREMENTS_CHECKLIST`, `LENS`,
  `LENS_FOCUS`, `BRIEF_FILE`, `GUARDRAILS`, `REQUIREMENTS_JSON`. An entry with a null
  `agentPath` is well-formed; SKILL.md does not dispatch that lens, logs it, and leaves it out
  of `--lenses`.
P22, append: `critiqueDir` is also recorded in the plan state file (R20). The session-start
  hook removes a `sdlc-plan-critique-*` directory older than 7 days by mtime alone (the name
  carries no branch).
P25, append: A null `agentPath` is well-formed; SKILL.md does not dispatch the reviewer and
  logs it as for a lens (P17), but keeps `all` in `--lenses`, so `merge-lanes` reports the
  missing result as a blocking lens failure.
PF5, append: The Acceptance criteria block runs from its label to the next `**<Label>:**`,
  `### `, `## ` or `---` line, and the Notes block to the next `**`, `### `, `## ` or `---`
  line, with no length limit.
History table, append rows:
  | R20, R21 | in-flight marker, #9271, #9278 |
  | R64, R67 | carry rerun and G17 carry, #9276, #9277 |
  | R26 | case-insensitive finding ids, #9301 |
  | PF5 | block boundary, #9264 |
  | P22 | critique dir sweep, #9258 |
  | R36, P1, P16, P17, P25 | wording, #9270, #9274 |
```

- names: ids R20, R21, R26, R36, R64, R67, P1, P16, P17, P22, P25, PF5.
- mirror: the history row `| R20, R21 | marker ownership, #9339 |` at `docs/specs/plan-sdlc.md:362`.
- decisions: Decisions taken without the owner 1 to 7.
- sync: the site byte copy; Tasks 2 to 8 implement these ids.

### Task 2: prepare records the critique directory in the plan state

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — create `critiqueDir` before the marker and pass it to `initState` (R20, P22)
- Modify: `tests/promptfoo/scripts/test-plan-integrity-markers.js` — report `critiqueDirRecorded`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — assert `critiqueDirRecorded` in the existing marker case

**Notes:** Cites F-stop-hook-plan-integrity-marker-4 and F-gc-tempdir-sweep-and-spec-doc-lows-2. No early return sits between the config check and the old creation site, so moving the block changes no output. `--mark` reads the whole state and writes it back, so the field survives.

**Acceptance criteria:**
- [ ] After `plan.js --output-file`, the plan state file holds `critiqueDir` equal to the output's `critiqueDir`.
- [ ] After the three `--mark` calls of the test script, `critiqueDir` is still present.
- [ ] Idempotency: the test script runs `--output-file` a second time and reports `rePrepareSingleMarker: true` (exactly one `plan-*.json` remains, and its `critiqueDir` is the second run's directory, not the first one's).
- [ ] The case `plan-prepare: --output-file writes plan state file with skillInvoked and all four markers via --mark (#285)` passes with the new assertion `"critiqueDirRecorded": true`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "plan-prepare:"` passes.

**Contract:**
- shape (code):

```diff
   // (after the config-version early return, before the skillInvoked marker)
+  // P22 — critique temp directory, created before the marker so R20 can record it.
+  let critiqueDir = null;
+  try {
+    critiqueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-plan-critique-'));
+  } catch (err) {
+    errors.push(`Failed to create critiqueDir: ${err.message}`);
+  }
+
   // Write skillInvoked marker (R20) — plan-sdlc was invoked (issue #285).
@@
       initState('plan', branch, {
         planIntegrity: { skillInvoked: new Date().toISOString() },
+        critiqueDir,
       });
@@
-  // 7b. P22 — critique temp directory
-  let critiqueDir = null;
-  try {
-    critiqueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-plan-critique-'));
-  } catch (err) {
-    errors.push(`Failed to create critiqueDir: ${err.message}`);
-  }
```

  State file after prepare:

```json
{ "planIntegrity": { "skillInvoked": "<ISO>" }, "critiqueDir": "/tmp/sdlc-plan-critique-AbC123", "sessionId": "<sid or null>" }
```

  Test script output also gains `rePrepareSingleMarker` (second `--output-file` run, then count `plan-*.json` and compare `critiqueDir` with the first value). It gains `critiqueDirRecorded: typeof stateData.critiqueDir === 'string' && path.basename(stateData.critiqueDir).startsWith('sdlc-plan-critique-')`.
- names: state field `critiqueDir`; output field `critiqueDirRecorded`.
- mirror: the existing P22 block at `plan.js:626-631`; `planFilePathSet` in `test-plan-integrity-markers.js:157`.
- decisions: Decisions taken without the owner 1.
- sync: R20, P22 (Task 1); the hook reads the field (Task 3).

### Task 3: Stop hook keeps an in-flight marker and stays silent without a plan

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/stop-plan-integrity.js` — in-flight and no-plan rules (R21)
- Modify: `tests/promptfoo/scripts/run-stop-plan-integrity.js` — flags `--critique-dir present|gone`, `--repeat <n>`
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — `critiqueDir` field and the two rules in Consume-then-Delete
- Create: `tests/promptfoo/fixtures-fs/plan-integrity-step3-missing/setup.sh` — marker with `skillInvoked` and `planFile`, `planFilePath` set, a non-empty `plan.md`
- Test: `tests/promptfoo/datasets/hook-stop-plan-integrity-exec.yaml` — six `stop-plan-integrity: run` cases; four existing cases move to the new fixture

**Notes:** Cites F-stop-hook-plan-integrity-marker-1, -2, -3, -6. The existing cases that expect a warning use `plan-integrity-partial`, which has no `planFilePath`; under the new rule that fixture is silent. So they move to the new fixture and keep their intent (guardrail `test-coverage-required`: stale tests are corrected, not left).

**Acceptance criteria:**
- [ ] `stop-plan-integrity: run (a) no plan file named is consumed silently`: fixture `plan-integrity-partial`, `--report-state-files` → inner exit 0, no `[plan-integrity]` text, no `plan-` file left.
- [ ] `stop-plan-integrity: run (b) critique dir present keeps the marker`: new fixture, `--fix-planfile-path --critique-dir present --report-state-files` → inner exit 0, no `[plan-integrity]` text, the `plan-` file still present.
- [ ] `stop-plan-integrity: run (c) critique dir gone warns and consumes`: new fixture, `--fix-planfile-path --critique-dir gone --report-state-files` → inner exit 2, stderr names `guardrailsEvaluated` and `critiqueRan`, no `plan-` file left.
- [ ] `stop-plan-integrity: run (d) complete marker is consumed even while the critique dir exists`: fixture `plan-integrity-complete`, `--fix-planfile-path --critique-dir present --report-state-files` → inner exit 0, no `plan-` file left.
- [ ] `stop-plan-integrity: run (e) a kept marker stays kept on a second Stop`: as (b) with `--repeat 2` → both runs exit 0 with no `[plan-integrity]` text, and the `plan-` file is still present after the second run.
- [ ] `stop-plan-integrity: run (f) a second Stop after a warning is silent`: as (c) with `--repeat 2` → first run exit 2 with the warning, second run exit 0 with no `[plan-integrity]` text.
- [ ] Case 3 ("warns and names missing checkpoints ..."), `stop-plan-integrity-undeletable`, `owner (b)` and `owner (c)` use the new fixture with `--fix-planfile-path`. Case 3 is renamed `stop-plan-integrity: warns and names missing checkpoints when Step 3 markers are missing` and asserts `guardrailsEvaluated` and `critiqueRan`. The other three keep their assertions.
- [ ] `owner (a)` and the cases without a state file pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml --filter-pattern "stop-plan-integrity"` passes.

**Contract:**
- shape (code):

```diff
     const planFilePath = typeof data.planFilePath === 'string' ? data.planFilePath : null;
     ...
-    // Consume-then-delete: remove the marker regardless of integrity outcome,
-    // so the warning fires once. If the unlink fails the marker survives and
-    // every later Stop would block again, so only a consumed marker may exit 2.
+    // R21: a run still in flight (its critique dir exists) keeps its marker.
+    const critiqueDir = typeof data.critiqueDir === 'string' && data.critiqueDir ? data.critiqueDir : null;
+    if (missing.length > 0 && critiqueDir && fs.existsSync(critiqueDir)) process.exit(0);
+
+    // Consume-then-delete: remove the marker, so the warning fires once. If the
+    // unlink fails the marker survives, so only a consumed marker may exit 2.
     try { deleteState(markerPath); } catch (_) { /* best-effort */ }
     const consumed = !fs.existsSync(markerPath);

-    if (missing.length === 0) {
-      // All checks passed — silent exit
-      process.exit(0);
-    }
+    // All checks passed, or the run named no plan file (R21): silent exit.
+    if (missing.length === 0 || !planFilePath) process.exit(0);
```

  Decision table of an owned marker:

| Checks | `critiqueDir` exists | `planFilePath` | Result |
|---|---|---|---|
| all pass | any | any | delete, exit 0, silent |
| some fail | yes | any | keep, exit 0, silent |
| some fail | no or unset | unset | delete, exit 0, silent |
| some fail | no or unset | set | delete, warn, exit 2 (exit 0 if the delete failed) |

  Wrapper flag `--repeat <n>` (default 1) runs the hook n times with the same payload; the output gains `runs: [{ stdout, stderr, exitCode }]`, and the top-level fields stay those of the first run, so existing cases are unchanged.

  Wrapper flag: `--critique-dir present` creates `<project-root>/critique-dir` and patches `critiqueDir` to its path in each `plan-*.json`; `--critique-dir gone` patches `critiqueDir` to `<project-root>/critique-dir-gone`, which is not created.

  New fixture state file `.sdlc/execution/plan-test-branch-20260101T000000Z.json`:

```json
{ "planIntegrity": { "skillInvoked": "2026-01-01T00:00:00.000Z", "planFile": "2026-01-01T00:00:01.000Z" }, "planFilePath": "/nonexistent/plan.md" }
```

  plus `plan.md` with `# Test Plan` and one content line; `setup.sh` has the same guard and git init lines as `plan-integrity-complete/setup.sh`.
- names: `critiqueDir`; wrapper flags `--critique-dir`, `--repeat`; fixture `plan-integrity-step3-missing`; case prefix `stop-plan-integrity: run`.
- mirror: the `--marker-session` patch loop in `run-stop-plan-integrity.js:117-131`; fixture `plan-integrity-complete/setup.sh`; the ownership exit at `stop-plan-integrity.js:92`.
- decisions: Decisions taken without the owner 1, 2; Key Decisions "Critique directory over a new checkpoint marker", "No plan file named means no warning".
- sync: R20, R21 (Task 1); SKILL.md lifecycle text (Task 7); user doc (Task 8).

### Task 4: re-run dirty carried results and skip dimension-coverage without G17

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `diffMaterial` option `prevDir` and output `rerun`; `laneCarry` excludes `dimension-coverage` under `g17NotRun`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `diff-material` accepts `--prev-dir`; usage line
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/prev-blocking/static-structural.json` — lane result with one blocking G1 issue
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/prev-blocking/lens-requirements.json` — lens result with one CRITICAL issue
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — three `plan-diff:` cases and one `plan-merge:` case

**Notes:** Cites F-plan-critique-carry-filtering-1, -2, -3, -5, -6. `--prev-dir` is new: a grep of `plugins/*/scripts/skill/*.js` and `scripts/lib/*.js` finds no other definition (Key Decisions). The lens-only merge reads only `lens`, so stale lane issues there do no harm; only the merged re-dispatch needs the rerun list.

**Acceptance criteria:**
- [ ] `plan-diff: --prev-dir adds lanes and lenses with blocking results to affectedLanes`: `diff-material --before before-5.md --after after-contract.md --prev-dir prev-blocking` → `rerun` is `["lens:requirements","static-structural"]` and `affectedLanes` is `["content-coverage","guardrail-compliance","lens:architecture","lens:requirements","lens:risk","static-structural"]`; `material` and `triggers` equal the case without the flag.
- [ ] `plan-diff: without --prev-dir rerun is empty`: the existing contract-change call → `rerun` is `[]`.
- [ ] `plan-diff: unreadable --prev-dir is a usage error`: `--prev-dir <fixture>/no-such-dir` → exit 1, stderr names `--prev-dir`.
- [ ] `plan-merge: --g17-not-run keeps dimension-coverage out of the carry`: `merge-lanes --dir carry/lens-only --lenses requirements --carry carry/prev --g17-not-run` → `carried` lacks `dimension-coverage.json` and no `laneFailures` entry names `dimension-coverage`.
- [ ] The existing `plan-diff:` and `plan-merge:` cases pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "plan-diff:|plan-merge:"` passes.

**Contract:**
- shape (code): `diffMaterial(beforeText, afterText, { full = false, prevDir = null } = {})` returns `{ material, triggers, details, affectedGates, affectedLanes, rerun }`.

```js
// plan-critique.js — new helper; reuses readResult, isObject, LANE_DEFS, LENS_NAMES
function rerunFrom(prevDir, afterTaskCount) {
  let files;
  try { files = fs.readdirSync(prevDir); }
  catch (err) { throw Object.assign(new Error(`cannot read --prev-dir ${prevDir}: ${err.message}`), { code: 'USAGE' }); }
  const out = new Set();
  const dirty = (file, valid, isBlocking) => {
    const r = readResult(path.join(prevDir, file), valid);
    return r.reason === 'invalid JSON' || r.reason === 'invalid result shape' || (r.value && isBlocking(r.value));
  };
  for (const { name } of LANE_DEFS) {
    if (!files.includes(`${name}.json`)) continue;
    if (dirty(`${name}.json`, v => isObject(v) && Array.isArray(v.issues),
      v => v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && i.blocking === true))) out.add(name);
  }
  for (const lens of LENS_NAMES) {
    if (!files.includes(`lens-${lens}.json`)) continue;
    if (dirty(`lens-${lens}.json`, v => isObject(v) && Array.isArray(v.issues),
      v => v.issues.some(i => isObject(i) && (i.blocking === true || i.severity === 'CRITICAL')))) {
      out.add(afterTaskCount < 5 ? 'lens:all' : `lens:${lens}`);
    }
  }
  return [...out].sort();
}
// diffMaterial tail:
const sets = affectedSets(triggers, after.size, full);
const rerun = prevDir === null ? [] : rerunFrom(prevDir, after.size);
if (sets.affectedLanes[0] !== '*') sets.affectedLanes = [...new Set([...sets.affectedLanes, ...rerun])].sort();
return { material: triggers.length > 0, triggers, details, ...sets, rerun };
```

```diff
     const laneCarry = [...LANE_DEFS.map(d => d.name), 'dimension-coverage']
-      .filter(n => !lanes.includes(n) && !(noGuardrails && n === 'guardrail-compliance'));
+      .filter(n => !lanes.includes(n) && !(noGuardrails && n === 'guardrail-compliance') && !(g17NotRun && n === 'dimension-coverage'));
```

  CLI: `node plan.js diff-material --before <path> --after <path> [--full] [--prev-dir <iterDir>]`; `SUBCOMMAND_FLAGS['diff-material']` becomes `['before', 'after', 'full', 'prev-dir']`; `runDiffMaterial` passes `prevDir: flags['prev-dir'] ?? null`. A usage error exits 1 through the existing `runSubcommand` mapping.

  Fixture `prev-blocking/static-structural.json`:

```json
{"gateIds":["G1","G2","G7"],"issues":[{"gateId":"G1","taskRef":"Task 2","message":"Requirement 3 has no task","severity":"error","blocking":true}],"passes":["G2","G7"],"laneStatus":"ok"}
```

  Fixture `prev-blocking/lens-requirements.json`:

```json
{"status":"Issues Found","issues":[{"taskRef":"Task 1","message":"Acceptance criteria do not cover requirement 2","severity":"CRITICAL","dimension":"Completeness","blocking":false}],"recommendations":[],"traceability":[]}
```

- names: `rerunFrom`, option `prevDir`, output `rerun`, flag `--prev-dir`.
- mirror: the `--carry` read and usage error at `plan-critique.js:580-586`; the lens blocking tag at `:658`; flag table `plan.js:341-345`.
- decisions: Decisions taken without the owner 3; Key Decisions "Re-run dirty results instead of filtering them", "`--prev-dir` on `diff-material`, not on `merge-lanes`".
- sync: R64, R67 (Task 1); review-loop.md Step 6 call (Task 7).

### Task 5: PF5 reads the whole Acceptance criteria block

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — PF5 Acceptance block ends at the next label line; no window on either regex
- Create: `tests/promptfoo/fixtures-fs/project-plan-long-contract/plans/plan.md` — one task whose Contract after the Acceptance block is over 5000 characters
- Create: `tests/promptfoo/fixtures-fs/project-plan-checkbox-outside-ac/plans/plan.md` — Acceptance block without a checkbox, a `- [ ]` line inside the Contract
- Test: `tests/promptfoo/datasets/plan-format-exec.yaml` — two PF5 cases; header comment lists the two fixtures

**Notes:** Cites F-skill-md-step-text-fixes-7, -9 to -12. The second fixture catches the other half of the defect: today a checkbox in the Contract makes an empty Acceptance block pass.

**Acceptance criteria:**
- [ ] `plan-format: PF5 passes when the Contract after Acceptance criteria exceeds 5000 characters`: fixture `project-plan-long-contract` → the PF5 check has `"status": "pass"`.
- [ ] `plan-format: PF5 does not count a checkbox outside the Acceptance criteria block`: fixture `project-plan-checkbox-outside-ac` → PF5 fails with `has no checkbox items`.
- [ ] Before the change, the first case fails with `missing **Acceptance criteria:**` and the second passes (checked once by the executor and reported).
- [ ] The existing PF5 cases (`missing checkbox`, `oversized Notes`, `short Notes`, `no Notes`) pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "plan-format:"` passes.

**Contract:**
- shape (code):

```diff
-    const acMatch = task.body.match(/\*\*Acceptance criteria:\*\*\s*\n([\s\S]{0,5000}?)(?=\n### |\n---|\n## |$)/);
+    const acMatch = task.body.match(/\*\*Acceptance criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n### |\n---|\n## |$)/);
@@
-    const notesMatch = task.body.match(/\*\*Notes:\*\*\s*\n([\s\S]{0,2000}?)(?=\n\*\*|\n### |\n---|\n## |$)/);
+    const notesMatch = task.body.match(/\*\*Notes:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n### |\n---|\n## |$)/);
```

  Fixture layout: both fixtures copy the header, `## Deviations & assumptions` and task metadata of `project-plan-with-notes/plans/plan.md`, with `**Acceptance criteria:**` followed by a `**Contract:**` block. In `project-plan-long-contract` the Acceptance block has `- [ ] Feature is implemented` and the Contract holds a fenced `text` block of at least 5100 characters. In `project-plan-checkbox-outside-ac` the Acceptance block has one prose line and the Contract holds `- [ ] not an acceptance item`.

  Case shape (both): `script_args: "--project-root {{project_root}} --file {{project_root}}/plans/plan.md --json"`, as `plan-format-exec.yaml:129-131`.
- names: fixtures `project-plan-long-contract`, `project-plan-checkbox-outside-ac`.
- mirror: `checkPF5` at `validate-plan-format.js:356-388`; the `oversized Notes` case at `plan-format-exec.yaml:127-138`.
- decisions: Decisions taken without the owner 7; Deviations row "PF5 Notes window".
- sync: PF5 (Task 1).

### Task 6: session-start sweeps old critique directories

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/session-start.js` — second sweep with `gcAgedTempdirs` for `sdlc-plan-critique-` (P22)
- Modify: `tests/promptfoo/scripts/run-session-start-gc-tempdirs.js` — also create a stale and a fresh critique dir; report `critiqueStaleRemoved`, `critiqueFreshKept` and a second run
- Test: `tests/promptfoo/datasets/session-start-exec.yaml` — one `session-start-gc-tempdirs:` case for critique dirs

**Notes:** Cites F-gc-tempdir-sweep-and-spec-doc-lows-1, -3, -5. The critique sweep needs no branch list, so it sits in its own try block and runs even when the branch list is empty. It reuses `SDLC_EXPLORE_TMPDIR_OVERRIDE` as the test tmpdir, so the wrapper needs no second variable.

**Acceptance criteria:**
- [ ] `session-start-gc-tempdirs: stale sdlc-plan-critique dir is removed, fresh one kept`: back-dated `sdlc-plan-critique-old123` is gone, fresh `sdlc-plan-critique-new456` remains, hook exit 0.
- [ ] Idempotency: the wrapper runs the hook a second time and reports `secondRunExit: 0` and `critiqueFreshKeptAfterSecond: true`; the new case asserts both.
- [ ] The existing explore case passes unchanged (its JSON fields stay).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "session-start-gc-tempdirs"` passes.

**Contract:**
- shape (code):

```diff
   } catch (sweepErr) {
     console.error('[sdlc/session-start] explore tempdir sweep error:', sweepErr.message);
   }
+
+  // Sweep stale plan-critique tempdirs (sdlc-plan-critique-XXXXXX, P22). The name
+  // carries no branch, so the rule is age only: older than 7 days.
+  try {
+    require('../scripts/lib/state').gcAgedTempdirs({
+      prefix: 'sdlc-plan-critique-', ttlHours: 168,
+      tmpdir: process.env.SDLC_EXPLORE_TMPDIR_OVERRIDE || undefined,
+    });
+  } catch (sweepErr) {
+    console.error('[sdlc/session-start] critique tempdir sweep error:', sweepErr.message);
+  }
```

  Wrapper output: `{ staleRemoved, freshKept, critiqueStaleRemoved, critiqueFreshKept, secondRunExit, critiqueFreshKeptAfterSecond, exitCode }`; the stale critique dir is back-dated to 2024-01-01 like the stale explore dir.
- names: `gcAgedTempdirs`, output fields `critiqueStaleRemoved`, `critiqueFreshKept`.
- mirror: `gcAgedTempdirs({ prefix: 'sdlc-review-', ttlHours: 24 })` at `scripts/skill/review.js:645`; the explore sweep at `session-start.js:242-257`.
- decisions: Decisions taken without the owner 4; Key Decisions "Reuse `gcAgedTempdirs`".
- sync: P22 (Task 1); user doc (Task 8).

### Task 7: plan-sdlc SKILL.md and review-loop.md text fixes

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 3, Task 4
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 1 id pattern (R26); R37 rule out of the explore list; Consume-then-delete bullet (R20, R21); Step 6.5 and 6.6 literal blocks
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — Step 6 `diff-material --prev-dir`; dispatch contents name `rerun`; single reviewer with a null `agentPath` (P25)
- Test: `tests/promptfoo/datasets/plan-sdlc.yaml` — one behavioural case: a brief with only lowercase ids does not trigger the fallback (not run in this wave)

**Notes:** Cites F-skill-md-step-text-fixes-1, -4, -5, -6, -8 and F-stop-hook-plan-integrity-marker-4. The Step 6.6 gate stays keyed to the Step 0 routing branch, as today (guardrail `no-opposite-logical-vectors`). Only the way the flags reach the command changes.

**Acceptance criteria:**
- [ ] `grep -c 'F-\[A-Z0-9_-\]' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` prints 0, and the line has the pattern `F-[A-Za-z0-9_.-]+-[0-9]+`.
- [ ] `grep -nE '\$plan_path|\$FINAL_FLAG|\$TEMPLATE_PATH|FINAL_FLAG:' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` prints nothing.
- [ ] The `**Codebase exploration:**` list has no bullet that starts "Read, Glob and Grep calls"; the R37 sentence follows the list with its `<!-- implements R37 -->` anchor.
- [ ] `grep -c -- '--prev-dir' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` prints at least 1.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` reports no new error for plan-sdlc.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/plan-sdlc.yaml > /dev/null` exits 0 (the dataset still parses).

**Contract:**
- shape (code): SKILL.md edits, before → after.

```diff
-  3. **Brief validation:** After loading the brief, grep its content for the pattern `F-[A-Z0-9_-]+-[0-9]+` (the `F-<DIM>-<n>` finding ID format).
+  3. **Brief validation:** After loading the brief, grep its content for the pattern `F-[A-Za-z0-9_.-]+-[0-9]+` (the `F-<DIM>-<n>` finding ID format; ids match in either case, and the orchestrator writes them in lowercase, R26).
@@
 - Naming conventions and code style
-- Read, Glob and Grep calls that don't depend on each other go in one message (lightweight scope and error fallback included). <!-- implements R37 -->
+
+On the inline path (lightweight scope or error fallback), issue Read, Glob and Grep calls that do not depend on each other in one message. <!-- implements R37 -->
@@
-- **Consume-then-delete** — the Stop hook reads `planIntegrity` markers, evaluates the gates, then unlinks the marker regardless of outcome (single-shot semantics). Subsequent Stop events on the same branch find no marker and exit 0 — this is correct R21 behavior.
+- **Consume-then-delete** — the Stop hook reads `planIntegrity` markers and evaluates the gates. While a gate is missing and the recorded `critiqueDir` still exists, the run is in flight: the hook keeps the marker and stays silent. Otherwise it unlinks the marker (single-shot), and warns only when a gate is missing and a plan file was named (R21). Subsequent Stop events on the same branch find no marker and exit 0.
@@ Step 6.5
-node "<PLUGIN_ROOT>/scripts/lib/links.js" --file "$plan_path" --json
+node "<PLUGIN_ROOT>/scripts/lib/links.js" --file "<PLAN_PATH>" --json
@@ Step 6.6, after the paragraph that ends "PF13 (Modify paths exist) runs because the block passes `--root`, the active worktree."
-**Set `FINAL_FLAG` from the Step 0 routing branch THIS run took** — NOT from scorecard presence (deriving it from the artifact it checks would make PF9 circular):
-
-- **Full-pipeline plan** (Step 0 routed through Step 5, the multi-lens review — i.e. ≥4 files): `FINAL_FLAG="--final"`. A scorecard is expected, so PF9 is enforced.
-- **Lightweight plan** (Step 5 skipped): `FINAL_FLAG=""`. No scorecard expected, so PF9 is not applied.
-
-Substitute the correct values into the block below before running it; `${FINAL_FLAG:+--final}` expands to `--final` only when `FINAL_FLAG` is non-empty, and to nothing otherwise (no word-splitting, no empty positional argument). `TEMPLATE_PATH` passes the active template path so PF10 can check template-required sections — it is appended via a bash array, never inline-interpolated, so a path containing spaces is not word-split.
-
-**Set `TEMPLATE_PATH`:** When `FINAL_FLAG` is `"--final"` (full-pipeline plan), set `TEMPLATE_PATH="$activeTemplatePath"` (the absolute path resolved in Step 0's template resolution). When `FINAL_FLAG` is empty (lightweight plan), leave `TEMPLATE_PATH` unset/empty — PF10 is skipped along with PF9.
-
-```bash
-# FINAL_FLAG is set above from the Step 0 routing branch THIS run took:
-# ... (seven comment lines)
-ARGS=(--markdown --file "$plan_path")
-[ -n "$FINAL_FLAG" ] && ARGS+=(--final)
-[ -n "$TEMPLATE_PATH" ] && ARGS+=(--template "$TEMPLATE_PATH")
-ARGS+=(--root "$PWD")
-node "<PLUGIN_ROOT>/scripts/ci/validate-plan-format.js" "${ARGS[@]}"
-```
+Run the block for the Step 0 routing branch THIS run took — not chosen from scorecard presence (that would make PF9 circular). Substitute `<PLAN_PATH>` and `<activeTemplatePath>` (Step 0 template resolution) with literal paths.
+
+Full-pipeline plan (Step 5 ran; PF9 and PF10 apply):
+
+```bash
+node "<PLUGIN_ROOT>/scripts/ci/validate-plan-format.js" --markdown --file "<PLAN_PATH>" --final --template "<activeTemplatePath>" --root "$PWD"
+```
+
+Lightweight plan (Step 5 skipped; PF9 and PF10 do not apply):
+
+```bash
+node "<PLUGIN_ROOT>/scripts/ci/validate-plan-format.js" --markdown --file "<PLAN_PATH>" --root "$PWD"
+```
```

  review-loop.md edits:

```diff
@@ Step 6 material change detection
-node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<ITER_DIR>/plan-before.md" --after "<PLAN_PATH>"
+node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<ITER_DIR>/plan-before.md" --after "<PLAN_PATH>" --prev-dir "<ITER_DIR>"
@@ Step 6, after the paragraph that starts "Set `materialChangeDetected` to its `material` value and keep its `affectedLanes` for the merged re-dispatch;" and ends "Wording, formatting and metadata-only fixes produce `material: false`. <!-- R64 -->"
+
+`affectedLanes` already includes the `rerun` entries: each lane or lens whose result in `<ITER_DIR>` held a blocking issue, so a result older than the fix is re-dispatched, not carried (R64, R67).
@@ single reviewer
 For plans with <5 tasks, dispatch one reviewer, `reviewerDispatch` (P25), by the same rule, including the R8 author rule (`description: "plan review"`). Its JSON goes to `<ITER_DIR>/lens-all.json` and merge-lanes runs with `--lenses all`.
+When `reviewerDispatch.agentPath` is null, do not dispatch it; log it as for a lens and still run merge-lanes with `--lenses all`, which reports the missing result as a blocking lens failure (P25).
```

  Behavioural case: description `plan-sdlc: a brief with only lowercase F-<dim>-<n> ids passes brief validation (#9301)`; fixture context `file://fixtures/plan-orchestrator-dispatch.md`; asserts `not-icontains: "using fallback inline exploration"` and an `llm-rubric` that the response treats the lowercase ids as valid findings.
- names: pattern `F-[A-Za-z0-9_.-]+-[0-9]+`; flag `--prev-dir`; field `rerun`.
- mirror: the Step 3 deterministic-check blocks at `SKILL.md:303-313` (literal `<PLAN_PATH>`, one plain Bash call); the case at `plan-sdlc.yaml:380-400`.
- decisions: Decisions taken without the owner 5, 6; Deviations row "#9301 test".
- sync: R20, R21, R26, R64, R67, P25 (Task 1); Tasks 3 and 4 implement the scripts these lines call.

### Task 8: plan-sdlc user doc wording

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 3, Task 6
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — Overview "cross-model"; Plan Mode step 5; Stop hook paragraph; critique dir row
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy

**Notes:** Cites F-gc-tempdir-sweep-and-spec-doc-lows-9. The reviewer model is chosen by the `--quality` preset and R8, so "cross-model" is no longer always true.

**Acceptance criteria:**
- [ ] `grep -c "cross-model" docs/skills/plan-sdlc.md` prints 0.
- [ ] `grep -c "{GUARDRAILS}" docs/skills/plan-sdlc.md` prints 0.
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` reports no new error for plan-sdlc.

**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md`, audience end users:

```text
Line 5: "...presents for user approval, and runs a cross-model plan review loop."
     →  "...runs a plan review loop (lens reviewers, or one reviewer for plans under 5 tasks), and presents the plan for user approval."
Line 287 (Plan Mode step 5): "The skill calls `ExitPlanMode` — Claude Code presents the finalized plan for your review; the cross-model reviewer also receives the guardrails as a `{GUARDRAILS}` template variable so the second model can verify compliance independently"
     →  "The skill runs the plan review loop; each reviewer receives the guardrails as its `GUARDRAILS` input and checks compliance independently. Then it calls `ExitPlanMode`, and Claude Code presents the finalized plan for your review"
Stop hook paragraph (line 376): "...and exits 0 on every other path. With no state file it exits 0 silently. See [`hooks/stop-plan-integrity.js`]..."
     →  "...and exits 0 on every other path. With no state file it exits 0 silently. While the run is still in flight (its critique directory exists), the hook keeps the state file and prints nothing. A run that never named a plan file ends silently. See [`hooks/stop-plan-integrity.js`]..."
Critique dir row (line 300): "...Created by the prepare script; removed at Step 7, and on any stop, cancel or exit before Step 7. |"
     →  "...Created by the prepare script; removed at Step 7, and on any stop, cancel or exit before Step 7. The session-start hook removes a directory left by an abandoned run after 7 days. |"
```

- names: none.
- mirror: the lens table wording in `skills/plan-sdlc/review-loop.md:30-38`.
- decisions: #9270; Decisions taken without the owner 1, 4.
- sync: the site byte copy.

### Task 9: CHANGELOG entries and this plan

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
**Verify:** manual

**Files:**
- Modify: `CHANGELOG.md` — `[Unreleased]` entries
- Create: `docs/plans/2026-11-11-lean-w6-plan-sdlc-correctness.md`

**Notes:** No version bump here; ship's version step bumps the minor version. The PR body names `#9348` as the tracking id and the item ids, with no `Fixes` line (Deviations row "Tracking id").

**Acceptance criteria:**
- [ ] `[Unreleased]` holds the entries of the Contract and nothing under `[0.49.0]` changes.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --markdown --file docs/plans/2026-11-11-lean-w6-plan-sdlc-correctness.md --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --root .` exits 0.

**Contract:**
- shape (docs): under the existing `[Unreleased]` heading of `CHANGELOG.md`:

```text
### Changed
- plan-sdlc: a merged re-dispatch re-runs every lane or lens whose earlier result had a blocking issue (`diff-material --prev-dir`) (#9276).
- plan-sdlc: the session-start hook removes `sdlc-plan-critique-*` directories older than 7 days (#9258).

### Fixed
- plan-sdlc: the plan-integrity Stop hook keeps the marker while the run is in flight and stays silent when no plan file was named (#9271, #9278).
- plan-sdlc: `dimension-coverage` is not carried when G17 did not run (#9277).
- plan-sdlc: the Step 1 brief check accepts lowercase finding ids (#9301).
- plan-sdlc: the Step 6.5 and 6.6 commands no longer use shell variables from other calls, so PF9 and PF10 run (#9246).
- plan-sdlc: PF5 reads the whole Acceptance criteria block, with no 5000-character window (#9264).
- plan-sdlc: SKILL.md, spec and doc wording fixes (#9249, #9270, #9274).
```

- names: none.
- mirror: the `[0.49.0]` entry style (`CHANGELOG.md:10-24`).
- decisions: Deviations rows "Release", "Tracking id".
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks carry promptfoo exec cases, and stale hook cases are moved to the new fixture. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern exec runs; the behavioural case is not run. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | All tasks map to the listed items; the PF5 Notes window is justified in Deviations. |
| single-responsibility-tasks | warning | PASS | Task 7 has one deliverable (plan-sdlc instruction text matches the spec) and Task 9 follows the wave 1 and 2 pattern; Key Decisions "One task for the plan-sdlc instruction text". |
| scripts-over-llm-logic | error | PASS | The rerun list comes from a script, and Step 6.6 becomes literal commands. |
| yagni | warning | PASS | Every addition serves a listed defect. |
| cross-skill-consistency | error | PASS | The ship and other skills' state files are explicitly non-goals; the cross-skill carry is handled by the plan. |
| pr-link-github-issue | error | PASS | The Deviations row states #9348 is a local tracking id and the PR body names the item ids. |
| dry | warning | PASS | Reuses gcAgedTempdirs, readResult and LANE_DEFS. |
| kiss | warning | PASS | One in-flight signal on an existing directory instead of a new checkpoint. |
| spec-first | error | PASS | Task 1 (spec) precedes the SKILL.md task, and Task 7 depends on it. |
| project-agnostic | error | PASS | Changes are in plugin code, hooks and scripts. |
| flag-coherence-cross-skill | error | PASS | The Step 6.6 gate stays keyed to the Step 0 routing branch, and flags are passed literally. |
| no-opposite-logical-vectors | error | PASS | The gate phrasing is unchanged and the Notes state this. |
| flag-resolution-single-source | warning | PASS | The rerun list is resolved in diff-material only. |
| state-premise | error | PASS | Architecture states the root problem. |
| smallest-viable-cut | warning | PASS | Key Decisions justify tasks 5 to 9. |
| failure-audience | warning | PASS | Key Decisions name who fails. |
| explicit-non-goals | warning | PASS | The Non-goals bullet is present. |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Decisions and Key Decisions. |
| state-machine-idempotency | error | PASS | Task 2 re-runs prepare (one marker remains), Task 3 runs the hook twice for a kept and a consumed marker, Task 6 runs the sweep twice. |
| agent-dispatch-script-driven | error | PASS | Dispatch lists come from diff-material, and a null agentPath is not dispatched. |
| flag-semantic-consistency-cross-skill | error | PASS | `--prev-dir` is new; the grep of `plugins/*/scripts/skill/*.js` and `scripts/lib/*.js` is recorded in Key Decisions. |
| workspace-mode-compatibility | error | PASS | Key Decisions state the behaviour in both modes via resolveStateDir. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts; critiqueDir lives in state. |

## Suggested Review Dimensions

### UPDATE: hook-readiness (B1)

**Why:** Task 3 changes the exit and marker contract of `plugins/sdlc-utilities/hooks/stop-plan-integrity.js` ("keeps the marker ... exits 0 silently"), and Task 6 adds a sweep to `hooks/session-start.js`.

**Severity hint:** high

**Patch:** Add checklist items: the Stop hook keeps the marker and exits 0 silently while `critiqueDir` exists, and exits 0 silently when `planFilePath` is unset. The session-start hook runs a fail-soft age-only critique-dir sweep.

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — Add checklist items: the Stop hook keeps the marker and exits 0 silently while `critiqueDir` exists, and exits 0 silently when `planFilePath` is unset. The session-start hook runs a fail-soft age-only critique-dir sweep.

### UPDATE: runtime-contract (B1)

**Why:** Task 4 adds a new CLI flag `--prev-dir` and output field `rerun` to `plugins/sdlc-utilities/scripts/skill/plan.js diff-material`, and Task 2 adds the `critiqueDir` state-file field.

**Severity hint:** high

**Patch:** Add checklist items: `plan.js diff-material --prev-dir` and its `rerun` output field, and the `critiqueDir` plan-state field, are documented in the spec and SKILL.md/review-loop.md and covered by exec cases.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add checklist items: `plan.js diff-material --prev-dir` and its `rerun` output field, and the `critiqueDir` plan-state field, are documented in the spec and SKILL.md/review-loop.md and covered by exec cases.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: test-quality (U3)

**Why:** Tasks 2-6 add and modify promptfoo exec cases and fixtures (e.g. Task 3 `tests/promptfoo/fixtures-fs/plan-integrity-step3-missing/setup.sh`, Task 4 `plan-diff:` cases), and the script's U3 trigger points at `tests/promptfoo/datasets` paths that the plan touches.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/datasets` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/datasets` after the rename

_1 additional candidates suppressed_

## Final Shape

When all tasks are done:

- The plan state file carries `critiqueDir`. The Stop hook keeps the marker while that directory exists and a gate is missing. It ends silently when no plan file was named. It still warns once on a finished run with skipped gates.
- `plan.js diff-material --prev-dir <iterDir>` returns `rerun`. A merged re-dispatch then re-runs every lane or lens whose previous result had a blocking issue. `merge-lanes` does not carry `dimension-coverage` under `--g17-not-run`.
- PF5 checks the whole Acceptance criteria block, and only that block.
- The session-start hook removes critique directories older than 7 days.
- SKILL.md runs Step 6.5 and 6.6 with literal paths, accepts lowercase finding ids, and states the R37 rule as its own sentence.
- The spec, the user doc and their site copies say what the code does. CHANGELOG `[Unreleased]` lists the fixes, and ship's version step makes them a minor release.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9271 | Task 1, Task 2, Task 3 | covered |
| 2 #9278 | Task 1, Task 2, Task 3, Task 7 | covered |
| 3 #9276 | Task 1, Task 4, Task 7 | covered |
| 4 #9277 | Task 1, Task 4 | covered |
| 5 #9301 | Task 1, Task 7 | covered |
| 6 #9246 | Task 7 | covered |
| 7 #9264 | Task 1, Task 5 | covered |
| 8 #9258 | Task 1, Task 6, Task 8 | covered |
| 9 #9249 | Task 7 | covered |
| 10 #9270 | Task 1, Task 7, Task 8 | covered |
| 11 #9274 | Task 1 | covered |
| 12 CHANGELOG | Task 9 | covered |
| 13 tests | Task 2, Task 3, Task 4, Task 5, Task 6 | covered |
| 14 plan file | Task 9 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
