# W-D2 Ship, Execute and Plan Follow-ups Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #123, 1e3e3d7

**Commit:** `fix(W-D2): ship, execute and plan - ten follow-ups and PF13 delete`
**Goal:**
- Close the ten W-D2 tickets (TK-009 to TK-018) of the sdlc-utilities plugin.
- Fix the homed TODO note: plan-format PF13 fails `Modify: <path> — delete` entries once the file is gone.
- Every behaviour change cites a spec id and has an exec test case.
**Architecture:** Thirteen tasks in three execute waves. Each shared file belongs to one task per wave: the ship-sdlc spec and user doc go to one docs task (Task 7) that writes every new ship id (R109 to R112) and the amended R97 and R-subagent-brief; the ship code tasks depend on it (spec first) and then run in parallel. Script logic stays in scripts (plan-critique.js, validate-plan-format.js, state/execute.js, lib/state.js, ship.js, commit.js, received-review.js, two hooks); skill prose changes are one paragraph or one line each.
**Source:** docs/plans/programme.md#W-D2
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- Ten follow-up defects from the lean waves w33 to w36 are still open. They sit in ship-sdlc (step agents, summary, Stop hook, state files), execute-plan-sdlc (the final spec-compliance review), plan-sdlc (the R74 re-check) and commit-sdlc / received-review-sdlc (config reads in a linked worktree).
- One more defect is homed in this wave: the plan-format check PF13 fails every deleted file, so a plan that deletes files fails its own PR check (PR #121, 17 paths).

**What prompted this change now?**

- The programme register schedules unit W-D2 right after W-D1, which is Done.
- The owner set the wave order on 2026-11-19: about 10 tasks, at most 2 Complex.

**What does success look like?**

- Each ticket's two acceptance items (A1, A2) hold, each checked by an exec case or, for doc-only items, by a stated doc sentence.
- `validate-plan-format.js --final --root .` passes a plan whose task deletes a file.
- The six main-session validators and the full exec suites stay green.

**Re-verification at HEAD a404222 (every item still reproduces):**

| Item | Evidence at HEAD |
|---|---|
| TK-009 | `skills/received-review-sdlc/SKILL.md` Step 11 (lines 382–423) has no rule to grep datasets for a removed phrase. |
| TK-010 | `agents/ship-step-commit.md:15` has no "return only once" paragraph; `ship-step-review.md:16` and `ship-step-execute.md:15` do. |
| TK-011 | `scripts/lib/plan-critique.js:222` `recheckLanes: material ? dispatch.lanes : []`; exec case `plan-prepare-exec.yaml:785` pins the empty list. |
| TK-012 | `skills/execute-plan-sdlc/SKILL.md:647-663` (Step 8-bis) records nothing; `state/execute.js` `completenessOf` (:1193) checks task ids only. |
| TK-013 | `skills/ship-sdlc/SKILL.md:273` prompt is `"<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>"`, no plugin root line. |
| TK-014 | `docs/skills/ship-sdlc.md` has no statement about which plugin copy ship uses. |
| TK-015 | `scripts/skill/ship.js:3027-3037` writes only the sidecar and the R108 rounds file; no `ship-summary-*.json`. |
| TK-016 | `hooks/stop-pipeline-continue.js:107-117` blocks on any `in_progress` step; `hooks/hooks.json` has no SubagentStart/SubagentStop entry. |
| TK-017 | `scripts/skill/commit.js:278` and `scripts/skill/received-review.js:255` default `projectRoot` to `resolveSdlcRoot()` (the main checkout). |
| TK-018 | `scripts/lib/state.js:68-70` slug is lossy; `findStateFile` (:177-181) and `detectResumeState` (:260-263) match by name prefix, so `ship-fix-` also matches `ship-fix-a-<ts>.json`. |
| PF13 TODO | `scripts/ci/validate-plan-format.js:586` fails every missing Modify path; `lib/plan-parse.js:250` already keeps the `— delete` text as `note: "delete"`. |

No item was dropped.

**Non-goals and smallest cut:**

- Not in this wave: units W-F and W-END, deferred LOW review findings, every other TODO note, the plan register, tickets and the lift-planning CLI.
- No caller sweep for TK-018 (the lib-only rule, R111), no worktree-script mode for ship (TK-014 stays doc-only), no new Delete kind in the plan format.
- The smallest cut is one task per ticket item; the three extra tasks are forced by file ownership (Task 4 for the execute SKILL.md, Task 11 for the second TK-017 script, Task 7 for the shared ship spec and doc).

## Research Findings

Exploration ran one discovery orchestrator with three code dimensions (brief: 15 findings, ids `F-ship-step-agents-and-summary-1..5`, `F-plan-critique-recheck-and-final-reviewer-1..3`, `F-worktree-config-and-state-slug-1..7`). No web research was needed.

**File patterns and modules**

- Plugin scripts live in `plugins/sdlc-utilities/scripts/` (`lib/`, `skill/`, `state/`, `ci/`). Hooks live in `plugins/sdlc-utilities/hooks/` and are wired in `hooks/hooks.json`.
- Ship step agents are `agents/ship-step-<step>.md`. Each preloads its skill and carries the R99 arguments paragraph (F-ship-step-agents-and-summary-1, -2).
- `lib/state.js` holds every state-file lookup. `parseStateFilename` (:470) already parses `<prefix>-<slug>-<YYYYMMDDTHHmmssZ>.json` exactly; `pruneStateFiles` and `gcStateFiles` use it, but `findStateFile` and `detectResumeState` use a name prefix (F-worktree-config-and-state-slug-1).
- `resolveHookContext` (state.js:131) gives the hooks their branch from `SDLC_BRANCH_OVERRIDE` or the HEAD file, with no spawn.
- `lib/config.js`: `PROJECT_SECTIONS` (:315) are read from `.sdlc/config.json`; `ship`, `review`, `receivedReview`, `workspace` and `state` come from the gitignored `.sdlc/local.json` (F-worktree-config-and-state-slug-3, -7).
- `resolveActiveWorktreeSafe()` (lib/worktree.js) is the worktree toplevel; plan.js, pr.js and review.js already use it for content and git operations.
- Saved review reports (`review --post save`) go to `<active worktree>/.sdlc/reviews/` (review.js:767); `review-summary.json` and `review-rounds-<slug>.json` go to the main checkout's `.sdlc/execution/` (review-sdlc P11, ship R108). This settles the brief's contradiction (F-worktree-config-and-state-slug-5).

**Specs and next free ids** (grepped over the whole file, appendix included)

| Spec | Highest id used | New ids in this plan |
|---|---|---|
| `docs/specs/ship-sdlc.md` | R108 | R109, R110, R111, R112 |
| `docs/specs/execute-plan-sdlc.md` | R93 | R94 |
| `docs/specs/commit-sdlc.md` | R20 (R66 is a cross-reference) | R21 |
| `docs/specs/received-review-sdlc.md` | R36 (R82, R85 are ship cross-references) | R37, R38 |
| `docs/specs/plan-sdlc.md` | R77 | none (R67(b), R74 and PF13 are amended) |

Every spec and skill doc has a byte copy under `site/src/content-source/` (`specs/`, `skills/`); `docs-copies-exec.yaml` fails on drift, so each copy is refreshed with `cp` in the same task.

**Testing patterns**

- Exec datasets: `tests/promptfoo/datasets/*-exec.yaml`, run by `promptfooconfig-exec.yaml`; the hook dataset `ship-hooks-exec.yaml` runs under `promptfooconfig-exec-hooks.yaml`.
- Text cases count a literal in a file with an inline `-e` script (pattern: the "ship-step-text:" case at `ship-prepare-exec.yaml:5857`; `received-review-prepare-exec.yaml:403`).
- Count floors over the datasets are lower bounds only: `dataset-asserts-exec.yaml:8` (`r.cases >= 1641`, `r.datasets >= 77`) and `dataset-regex-exec.yaml:8` (`r.checked >= 300`). This plan only adds cases and changes one assertion (Task 1), so no floor changes.

**Build, lint and test commands**

- Targeted exec run (workers): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Plan format: `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --markdown --file <plan> --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --root .`.
- Main-session validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --root . --strict`, `validate-cost-tiers.js`, `validate-discovery.js`, `validate-args-rule.js --root .`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Ship spec and user-doc text for TK-010, TK-013, TK-015, TK-016, TK-017 (A2) and TK-018 | no | Task 7 (TK-014) writes all ship-sdlc spec ids and the `docs/skills/ship-sdlc.md` sentences; the ship code tasks depend on Task 7 and cite those ids | One owner per shared file per wave (F-43); spec first (guardrail `spec-first`) |
| Companion files of the edited skills | no | Each is listed once as `check only, no change expected` in the task that edits that skill's spec or SKILL.md | `plan.copyRules` requires every companion to be named; none of them states a changed rule |
| TK-017 A2 sentence | no | Written by Task 7, not by the TK-017 tasks | Same file-ownership rule; Task 10 and Task 11 Notes point at it |
| TK-017 `.sdlc/local.json` | no | Project config (`.sdlc/config.json`, dimensions, guardrails, git) reads move to the worktree toplevel; `local.json` reads stay in the main checkout | `local.json` is gitignored and lives in the main checkout; moving it would drop local-only settings |
| TK-018 branch check source | no | The expected branch is the explicit branch when the caller gives one, else the checked-out branch when its slug equals the asked slug; no caller changes | Avoids editing about 40 call sites in 7 files that other tasks also edit; covers the concurrent-run case the ticket names |
| TK-018 extra fix | no | Lookups also require an exact parsed slug (`fix` no longer reads `fix-a` files) | This is the "exact-name match" of the programme scope; it also keeps `ship-summary-<slug>.json` (Task 8) out of ledger lookups |
| TK-012 check point | no | The spec-review record is required by the verifying `cleanup` and by `verify-completeness --final`, not by the Step 5f call | Step 5f runs before Step 8-bis; a record cannot exist there yet |
| TK-013 agent files | no | Task 6 edits all six ship-step agent files (8 paths, above the 5-file guide) | One identical sentence per agent file; splitting would add a wave for no review gain |
| TK-016 mechanism | no | SubagentStart/SubagentStop hooks keep a live-agent marker; the Stop hook stays quiet while it is fresh | The ledger-flag option cannot tell a live agent from a dead one (F-ship-step-agents-and-summary-5) |
| PF13 TODO | no | Planned as Task 2 with no `**Ticket:**` line | It is a homed TODO note, not a ticket of the map |

## Key Decisions

- **One docs task owns the ship spec and the ship user doc (Task 7).**
  - Alternative: each ticket task edits `docs/specs/ship-sdlc.md` itself.
  - Why: five tasks would share one file, which forces a five-deep dependency chain (five execute waves). With one owner in wave 1, the ship code tasks depend only on it (spec first) and run in parallel in waves 2 and 3, and the plan pins every id and sentence so they stay consistent.

- **Wave layout.** Wave 1: Tasks 1, 3, 7, 10. Wave 2: Tasks 2, 4, 5, 9, 11, 13 (two Complex: 9 and 13). Wave 3: Tasks 6, 8, 12.

- **TK-018 reads the expected branch inside `lib/state.js`.**
  - Alternative: add a `branch` argument to `readState`/`findStateFile` and change every caller.
  - Why: the callers are spread over seven files that other tasks of this wave also edit. The checked-out branch (from the HEAD file, the same source the hooks use) is the branch a running session means in almost every case. The gap is stated in R111.

- **TK-016 tracks live step agents with two new hook events.**
  - Alternative: a ledger flag set at dispatch and cleared at `--after`.
  - Why: a flag stays set when an agent dies, so the hook would go quiet for good. A marker removed by SubagentStop, with a time bound, is accurate and still fails toward blocking.

- **TK-017 splits config roots by file, not by script.**
  - Alternative: read everything from the worktree, with a fallback to the main checkout when `local.json` is missing.
  - Why: the split is simpler and matches what each file is. `config.json` is tracked per branch; `local.json` is the developer's own file in the main checkout. State stays in the main checkout (#9444).

- **TK-012 records the review in the execute state file.**
  - Alternative: the skill only prints a skip line.
  - Why: a printed line cannot be checked by a script. A `specReview` field written by a new `spec-review` subcommand can be checked by `verify-completeness --final` and the verifying cleanup. Old state files without `specReviewRequired` still pass.

- **TK-013 puts the plugin root line in the dispatch prompt template of ship SKILL.md and teaches the six agents to use it.**
  - Alternative: ship.js adds `pluginRoot` to `step.data`.
  - Why: the main session already holds `<PLUGIN_ROOT>`; the prompt template is the one place every dispatch passes through. ship.js is edited by Task 8 in the same wave.

- **Brief findings:** every finding is ADOPTED by the task that cites it. The brief has no web findings.

## Decisions taken without the owner

1. TK-017: `local.json` reads stay in the main checkout; only project config and content reads move to the worktree toplevel (the brief's open decision).
2. TK-016: Plan A (SubagentStart/SubagentStop marker) over Plan B (ledger flag).
3. TK-018: branch check without caller changes; a read for another branch with no branch given keeps slug-only matching (stated gap).
4. TK-012: the record is enforced by `cleanup` and `verify-completeness --final` only.
5. TK-017 doc sentence: "saved review reports" means `review --post save` files in `.sdlc/reviews/` of the active worktree; review-summary and review-rounds files are execution files in the main checkout.
6. TK-015: the summary file is written at cleanup emission and at the R95 final-check-open stop, and cleanup never removes it.
7. TK-014: document the behaviour (ship uses the installed plugin) instead of switching ship steps to worktree scripts.
8. plan-sdlc review loop reached 3 iterations with one wording issue (G21, Task 11 call-site diff) left; the author fixed it inline without a fourth round (recommended option of the max-iterations menu with no user present).

## Contract Examples

**code** (Task 1):

```markdown
**Contract:**
- shape (code): `diffMaterial(beforeText, afterText, { full, prevDir })` returns `recheckLanes: dispatch.lanes` (no `material` gate).
- names: `recheckLanes`, `dispatch.lanes`, `rerun`.
- mirror: `scripts/lib/plan-critique.js:212-222`.
- decisions: a non-material fix with blocking lanes in `--prev-dir` still re-dispatches those lanes.
- sync: `docs/specs/plan-sdlc.md` R67(b) and R74.
- example: rerun `['lens:requirements','static-structural']`, no trigger → `recheckLanes: ['static-structural']`.
```

**docs** (Task 7):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md`; add `### Which plugin copy ship runs` under `## Prerequisites`, before `### Harness Configuration`; audience: plugin maintainers.
- names: heading `### Which plugin copy ship runs`.
- mirror: `docs/skills/ship-sdlc.md:875-893`.
- decisions: document, do not change behaviour (Decisions taken without the owner, 7).
- sync: byte copy `site/src/content-source/skills/ship-sdlc.md`.
```

**openspec / spec** (Task 3):

```markdown
**Contract:**
- shape (openspec): ADD `R94` to `docs/specs/execute-plan-sdlc.md` under `## Gates`; MODIFY `R-INVARIANT-COMPLETENESS` to name the `--final` mode; numbering continues from R93.
- names: `R94` (new), `R-INVARIANT-COMPLETENESS` (modified).
- mirror: requirement style at `docs/specs/execute-plan-sdlc.md:245`.
- decisions: record in state, enforce at cleanup and `--final`.
- sync: SKILL.md Step 8-bis (Task 4) cites R94.
```

## Tasks

### Task 1: R74 re-check keeps the rerun lanes
**Ticket:** TK-011 @d522a210

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R67(b) and R74 sentences on `recheckLanes`, appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `recheckLanes` no longer gated on `material`
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — flip one assertion of the non-material `plan-diff:` case, add one case
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected

**Notes:** Cites F-plan-critique-recheck-and-final-reviewer-1. When no trigger fires, `affectedLanes` is exactly the rerun set, so `dispatch.lanes` already holds only the rerun lanes (lens entries are filtered out by the lane table); without `--prev-dir` it is `[]`, so the old empty result stays for that case.

**Acceptance criteria:**
- [x] `diff-material --prev-dir` on a non-material fix whose previous `static-structural.json` is blocking returns `recheckLanes: ["static-structural"]` (A1).
- [x] Without `--prev-dir` and with no trigger, `recheckLanes` is `[]`.
- [x] The existing non-material case keeps its `plan-diff:` name and its assertion changes as below (A2):
  ```diff
  -      value: "const r = JSON.parse(output); r.material === false && r.triggers.length === 0 && Array.isArray(r.recheckLanes) && r.recheckLanes.length === 0 && JSON.stringify(r.rerun) === JSON.stringify(['lens:requirements', 'static-structural'])"
  +      value: "const r = JSON.parse(output); r.material === false && r.triggers.length === 0 && JSON.stringify(r.recheckLanes) === JSON.stringify(['static-structural']) && JSON.stringify(r.rerun) === JSON.stringify(['lens:requirements', 'static-structural'])"
  ```
- [x] The five plan-sdlc companion files were checked and need no change (they do not state `recheckLanes`).
- [x] Spec and site copy are byte-equal (`cmp`).

**Contract:**
- shape (code): one-line change at the return of `diffMaterial`:
  ```diff
  -  return { material, triggers, details, ...sets, rerun, dispatch, recheckLanes: material ? dispatch.lanes : [], review: afterRoute };
  +  return { material, triggers, details, ...sets, rerun, dispatch, recheckLanes: dispatch.lanes, review: afterRoute };
  ```
- names: `recheckLanes`, `diffMaterial`.
- mirror: `scripts/lib/plan-critique.js:212-222`.
- decisions: spec R67(b), after "`recheckLanes` lists the lanes R74 dispatches once", adds ": the lanes of `dispatch.lanes`, which after a non-material fix are the `rerun` lanes (empty without `--prev-dir`)". R74, after "it dispatches the lanes of `recheckLanes` once", adds "(after a non-material fix these are the lanes whose previous result was blocking or failed, R67(b))". Appendix row `| R67, R74 | rerun lanes kept on a non-material fix, W-D2 (TK-011) |`.
- sync: `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`.
- example: new case "plan-diff: (rerun) non-material fix without --prev-dir keeps recheckLanes empty" asserts `r.material === false && r.recheckLanes.length === 0`.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-diff:"`

### Task 2: PF13 accepts deleted Modify paths

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — `checkPF13` skips Modify entries whose note starts with `delete`; header comment
- Modify: `docs/specs/plan-sdlc.md` — PF13 bullet gains the delete exemption
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy
- Modify: `docs/skills/plan-sdlc.md` — PF13 bullet gains the exemption
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — two PF13 cases

**Notes:** Implements the homed TODO `docs/TODO/plan-format-pf13-deleted-paths.md` (no ticket; the main session archives the note). The parser already keeps the text after the path (`lib/plan-parse.js:250`, leading dashes and spaces stripped), so no Delete kind is needed; the real format in archived plans is ``- Modify: `path` — delete`` (docs/archived/plans/2026-11-19-w-d1-suite-reduction.md:729). Depends on Task 1 only for the shared spec file. Cites F-plan-critique-recheck-and-final-reviewer-3.

**Acceptance criteria:**
- [x] A plan with ``- Modify: `gone.js` — delete`` and no `gone.js` under `--root` passes PF13 with `--final`.
- [x] A plan with ``- Modify: `gone.js` — deleted`` passes too; ``- Modify: `gone.js` — update the delete helper`` (the note does not start with the word) still fails PF13.
- [x] Spec, skill doc and both site copies are updated and byte-equal to their sources.

**Contract:**
- shape (code): in `checkPF13`, after the `*` skip:
  ```js
  // PF13: a Modify entry whose note starts with "delete" lists a file the task deletes.
  if (/^deleted?\b/i.test(e.note || '')) continue;
  ```
- names: `checkPF13`, `e.note`.
- mirror: `scripts/ci/validate-plan-format.js:573-598`.
- decisions: exemption by note text, not a new Files kind (TODO proposal 1); applies with or without `--final`.
- sync: spec bullet (docs/specs/plan-sdlc.md, the `- PF13:` line):
  ```diff
  -… `Create:` and `Test:` paths are exempt. A `Modify:` path is exempt only when a task in the transitive closure …
  +… `Create:` and `Test:` paths are exempt. A `Modify:` entry whose text after the path starts with the word `delete` or `deleted` (the plan format's way to list a deletion) is exempt. A `Modify:` path is also exempt when a task in the transitive closure …
  ```
  Skill doc bullet (docs/skills/plan-sdlc.md):
  ```diff
  -- **PF13** — every `Modify:` path exists in the active worktree, unless a task it depends on creates it. Runs only …
  +- **PF13** — every `Modify:` path exists in the active worktree, unless a task it depends on creates it or the entry is a deletion (`— delete`). Runs only …
  ```
  Copies by `cp`.
- example: cases "plan-format: PF13 delete entry of a missing file passes" and "plan-format: PF13 non-delete note of a missing file fails", each with an inline plan fixture written by the case like the cases near plan-format-exec.yaml:477.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "PF13"`

### Task 3: Execute state records the final spec review
**Ticket:** TK-012 @2bd0f438

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — ADD R94, MODIFY R-INVARIANT-COMPLETENESS, appendix row
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `init` stamps `specReviewRequired: true`; new `spec-review` subcommand; `completenessOf(data, { requireSpecReview })`; `cleanup` and `verify-completeness --final` pass it; usage comment
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — R94 cases after :207
- Create: `tests/promptfoo/fixtures-fs/execute-overflow/state-spec-review-unrecorded.json` — all tasks done, `specReviewRequired: true`, no `specReview`
- Create: `tests/promptfoo/fixtures-fs/execute-overflow/state-spec-review-skipped.json` — same, with `specReview: { status: "skipped", reason: "all reviewed tasks Trivial", at: "2026-11-20T00:00:00Z" }`

**Notes:** Cites F-plan-critique-recheck-and-final-reviewer-2. Step 5f (`verify-completeness` without `--final`) runs before Step 8-bis, so it must not require the record; ship.js calls it the same way (ship.js:1803), so ship is unchanged. Six paths: the two fixtures are small JSON files copied from `state-all-done.json`.

**Acceptance criteria:**
- [x] `verify-completeness --final --state-file state-spec-review-unrecorded.json` exits 65 with stderr JSON `{"missingIds":[],"totalPlanned":4,"totalAccounted":4,"specReview":"unrecorded"}` (A2).
- [x] `verify-completeness --final` exits 0 on `state-spec-review-skipped.json` and on `state-all-done.json` (no `specReviewRequired`).
- [x] `verify-completeness` without `--final` exits 0 on `state-spec-review-unrecorded.json`.
- [x] `spec-review` with no `--status`, an unknown status, or `--status skipped` without `--reason` exits 2 with the message on stderr and nothing on stdout.
- [x] `cleanup` on a state with `specReviewRequired: true` and no record keeps the file and exits 65 (A1 enforced).
- [x] Run-twice (state-machine idempotency): in a case that copies a fixture state into an `fs.mkdtempSync` dir (`SDLC_STATE_DIR_OVERRIDE`), `spec-review --status ran --reason a` then `--status skipped --reason b` leaves one valid JSON state whose `specReview` is the second record and whose other fields are unchanged; `verify-completeness --final` run twice on it gives the same exit code and output.

**Contract:**
- shape (code): CLI and state field:

  | Command | Effect | Exit / output |
  |---|---|---|
  | `spec-review --status ran --reason <verdict> [--branch <b>]` | writes `data.specReview = { status: "ran", reason, at }` | 0, prints `{"ok":true,"specReview":{…}}` |
  | `spec-review --status skipped --reason <rule> [--branch <b>]` | writes `{ status: "skipped", reason, at }` | 0, same |
  | `spec-review` with a missing or unknown `--status`, a missing `--reason`, or a flag without its value | none | 2, message on stderr, no stdout |
  | no state file for the branch | none | 1, stderr `Error: no state file found for branch "<b>"` |
  | `verify-completeness --final` | `completenessOf(data, { requireSpecReview: true })` | 65 with `specReview: "unrecorded"` in the stderr JSON when `data.specReviewRequired === true` and no valid record |
  | `cleanup` | same check as `--final` | 65, state kept |

  A valid record is `status === "ran"`, or `status === "skipped"` with a non-empty `reason`. Re-running `spec-review` overwrites the record (idempotent).
- names: `spec-review`, `specReview`, `specReviewRequired`, `requireSpecReview`, `--final`.
- mirror: `wave-committed` subcommand shape (state/execute.js ~:753) and `completenessOf` (:1193-1255).
- decisions: R94 text: "R94 (Final spec review record): every execute run whose state carries `specReviewRequired: true` (stamped by `init`) records the Step 8-bis outcome with `state/execute.js spec-review --status ran|skipped --reason <text>`: `ran` after the final reviewer returns (reason: its verdict), `skipped` with the skip rule that applied (reason). `verify-completeness --final` and the verifying `cleanup` (R14) exit 65 with `specReview: \"unrecorded\"` when the record is missing or a skip has no reason. State files without `specReviewRequired` pass. Acceptance: exec cases `execute-plan-sdlc/wave-runner-overflow/verify-completeness: (R94)`." R-INVARIANT-COMPLETENESS gains: "With `--final` the R94 record is also required." Appendix row `| R94 | final spec review record, W-D2 (TK-012) |`.
- sync: Task 4 adds the SKILL.md calls and the `state-format.md` rows; `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "verify-completeness"`

### Task 4: Step 8-bis runs the reviewer or records the skip
**Ticket:** TK-012 @2bd0f438

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — Step 8-bis calls `spec-review` on each branch; gate table row; Step 9 cleanup note
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — rows for `specReviewRequired` and `specReview`
- Modify: `docs/skills/execute-plan-sdlc.md` — one sentence after the `**Cadence (`execute.specReviewer`):**` paragraph
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — byte copy
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — one text case
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/spec-compliance-reviewer.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — check only, no change expected

**Notes:** The Step 8-bis skip branches each name their rule; the reason text is that rule, so a reader of the state can tell a real skip from a forgotten step. Depends on Task 3 for the subcommand and the shared dataset. Cites F-plan-critique-recheck-and-final-reviewer-2.

**Acceptance criteria:**
- [x] Step 8-bis has one `spec-review --status skipped` call per skip rule (three: per-wave cadence without OpenSpec specs, per-wave reviews all passed with 3 or fewer waves, all reviewed tasks Trivial) and one `spec-review --status ran` call after the reviewer returns.
- [x] The gate table row "Spec compliance reviewed" names R94.
- [x] A text case "execute-plan-sdlc/wave-runner-overflow/skill-text: (R94)" counts `state/execute.js" spec-review --status` in SKILL.md as 4 and fails otherwise.

**Contract:**
- shape (code): Step 8-bis call, rendered once per call site:
  ```bash
  node "<PLUGIN_ROOT>/scripts/state/execute.js" spec-review --status skipped --reason "per-wave cadence, no OpenSpec specs"
  ```
  The other reasons are `"per-wave reviews passed, 3 or fewer waves"` and `"all reviewed tasks Trivial"`; after the reviewer returns: `spec-review --status ran --reason "<verdict>"`. Each runs as one plain Bash call; a non-zero exit is reported and the run stops as in Step 5f. Add the sentence "Every branch of this step records its outcome (R94); the verifying cleanup fails a run that recorded none."
- names: `spec-review`, R94.
  Placement in Step 8-bis (each call goes right after the sentence that states its rule):
  ```diff
   … Skip this sub-step when `flags.specReviewer === 'per-wave'` and `openspecSpecs` is empty — the per-wave reviews already ran.
  +Record the skip: `node "<PLUGIN_ROOT>/scripts/state/execute.js" spec-review --status skipped --reason "per-wave cadence, no OpenSpec specs"`.

   When `flags.specReviewer === 'per-wave'`, also skip if ALL per-wave spec compliance reviews (Step 5c-bis) passed without issues AND the plan has 3 or fewer waves — the per-wave reviews already provided sufficient coverage in that case.
  +Record the skip: `… spec-review --status skipped --reason "per-wave reviews passed, 3 or fewer waves"`.
  ```
  The Trivial-only skip (in the first paragraph, "it skips when the reviewed tasks are all Trivial") gets `… --reason "all reviewed tasks Trivial"`; the `ran` call follows the **Verdict handling:** paragraph. Each call is rendered as its own fenced `bash` block.
- mirror: Step 5f block at SKILL.md:597-601.
- decisions: Step 5f stays without `--final`. The six other companion files were checked and need no change.
- sync: `docs/skills/execute-plan-sdlc.md` sentence "Step 8-bis always records whether the final review ran or which rule skipped it; the state cleanup fails a run with no record." and its site copy by `cp`; state-format.md rows use the R94 field names.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "wave-runner-overflow"`

### Task 5: Commit step agent waits for its drafter
**Ticket:** TK-010 @ca859225

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-commit.md` — add the return-once paragraph after the attribution paragraph
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — one "ship-step-text:" case after :5866

**Notes:** Mirrors the review agents' paragraph (agents/ship-step-review.md:16); the spec text (R97 amendment) is written by Task 7.

**Acceptance criteria:**
- [x] `ship-step-commit.md` contains the paragraph below once (A1).
- [x] Case "ship-step-text: (R97) commit agent waits for its drafter" counts `never end your turn while the commit-orchestrator` as 1 and `Run \`git commit\` with the drafted message` as 1 (A2).

**Contract:** shape (docs): paragraph "Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Dispatch the commit-orchestrator in the foreground and wait for its message; never end your turn while the commit-orchestrator you dispatched is still running, and never wait with `Monitor`, a background Bash command or a `sleep` timer. Run `git commit` with the drafted message before you report. After your final report, answer any later notification with one short line, no tool call and no new report (ship-sdlc R97)."; names: R97; sync: Task 7 spec R97

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^ship-step-text:"`

### Task 6: Ship step prompts carry the plugin root line
**Ticket:** TK-013 @03106013

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5, Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the Step 5 `dispatch_*` prompt gains the plugin root line
- Modify: `plugins/sdlc-utilities/agents/ship-step-commit.md` — plugin-root sentence after the R99 paragraph
- Modify: `plugins/sdlc-utilities/agents/ship-step-review.md` — same sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — same sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-version.md` — same sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-pr.md` — same sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-execute.md` — same sentence
- Modify: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — one case

**Notes:** The preloaded skills tell the agent to ignore a plugin-root line in "user-supplied text" and to fall back to the skill's base directory; the agent sentence makes the task-message line the one to use. Depends on Task 5 only for `ship-step-commit.md`. Eight paths: one identical sentence per agent file. The spec text (R-subagent-brief) is written by Task 7. Cites F-ship-step-agents-and-summary-2.

**Acceptance criteria:**
- [x] The SKILL.md:273 prompt reads `"<step.data.invocation>\nBranch: <branch>\nsdlc plugin root: <PLUGIN_ROOT>\nPrior results: <one line>"` (A1).
- [x] Each of the six agent files has the sentence below exactly once (A2).
- [x] Case "script-resolution: (R-subagent-brief) ship dispatch prompt and six step agents carry the plugin root line" counts the SKILL.md literal `\nsdlc plugin root: <PLUGIN_ROOT>\n` as 1 and the agent sentence as 1 in each of the six files.

**Contract:**
- shape (docs): SKILL.md Step 5 `dispatch_*` bullet (the rest of the line is unchanged):
  ```diff
  -   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present …
  +   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nsdlc plugin root: <PLUGIN_ROOT>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present …
  ```
  Agent sentence, verbatim: "The task message carries a `sdlc plugin root: <path>` line: use that path wherever the skill substitutes `<PLUGIN_ROOT>` from the `sdlc plugin root:` line, and never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief)."
- names: `sdlc plugin root:`, `<PLUGIN_ROOT>`.
- mirror: R99 paragraph in each agent file (e.g. agents/ship-step-pr.md:11).
- decisions: prompt template, not ship.js data (Key Decisions).
- sync: R-subagent-brief in Task 7; the case counts with `split`, like sdlc-script-resolution-exec.yaml:6, so no regex `|` needs escaping.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^script-resolution:"`

### Task 7: Ship spec ids and user doc for this wave
**Ticket:** TK-014 @784197f1

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — MODIFY R97 and R-subagent-brief; ADD R109, R110, R111, R112; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy
- Modify: `docs/skills/ship-sdlc.md` — plugin-copy subsection, file-location sentence, summary file and marker rows, Stop hook sentence
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (no skill gains a flag, connection or description change)

**Notes:** Owns every ship-sdlc spec and doc edit of the wave, and runs in wave 1; Tasks 5, 6, 8, 9 and 13 depend on it (spec first) and share no other file with it (Key Decisions). Also writes the TK-017 A2 sentence. Cites F-ship-step-agents-and-summary-1 to -5 and F-worktree-config-and-state-slug-5. Each new requirement carries an `Acceptance:` line (validate-spec-shape.js).

**Acceptance criteria:**
- [x] The spec holds R109–R112 with the text below, in the sections named, each with an Acceptance line; R97 and R-subagent-brief carry the amendments; the appendix has the rows below.
- [x] `docs/skills/ship-sdlc.md` states which plugin copy ship steps use when a wave ships the plugin itself (TK-014 A1) and what to do for a feature the wave ships (A2).
- [x] `docs/skills/ship-sdlc.md` states where state, execution, learnings and saved review-report files go (TK-017 A2).
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; both copies are `cmp` equal.

**Contract:**
- shape (openspec): requirement text, numbering continues from R108:

  | Id | Section | Text (verbatim core) |
  |---|---|---|
  | R97 (MODIFY) | Step composition | first sentence becomes "`ship-step-review`, `ship-step-received-review` and `ship-step-commit` return only once…"; add "`ship-step-commit` runs the commit-orchestrator drafter in the foreground and runs `git commit` with the drafted message before it reports." |
  | R-subagent-brief (MODIFY) | Dispatch and routing | "The Agent prompt carries only the arguments, the branch, the `sdlc plugin root: <PLUGIN_ROOT>` line (the main session's plugin root) and the prior results; each agent file tells the agent to use that line, never the skill's base directory." |
  | R109 | State model, after R108 | "Ship summary file. When ship.js emits the cleanup step, and when it stops with `final-check-open` (R95), it writes `<state dir>/ship-summary-<slug>.json` (`<slug>` = `slugifyBranch(ledger.branch)`) as `{ schemaVersion: 1, branch, startedAt, head, finalCheck, steps, prUrl }`: `head` is `git rev-parse HEAD` in the active worktree (null on error), `finalCheck` the ledger's `finalCheck` or null, `steps` and `prUrl` from the summary (R78). Cleanup does not remove it; the next run on the branch overwrites it. A write error adds no error and does not stop the pipeline. Acceptance: exec cases `ship-summary-file:`." |
  | R110 | Invariants and constraints, after R-stop-inprogress-mode-independent | "Live step agent. `hooks/subagent-track.js` runs on SubagentStart and SubagentStop. For an `agent_type` that matches `ship-step-` it adds or removes the `agent_id` in `<state dir>/.step-agent-live-<branchSlug>.json` (`{ schemaVersion: 1, branch, agents: { <agent_id>: { agentType, startedAt } } }`). The Stop hook exits 0 silently, before the stop-cap counter, when the current step is `in_progress` and the file lists one agent started less than 2 hours ago. Otherwise R68 and R-stop-inprogress-mode-independent apply unchanged. Threat model: repeated Stop blocks while a dispatched step agent works. Accepted gaps: an agent that dies without SubagentStop keeps the hook quiet for up to 2 hours; a harness without SubagentStart events keeps today's behaviour. Acceptance: exec cases `stop-pipeline-continue (R110):`." |
  | R111 | State model, after R109 | "Exact state-file match. `findStateFile`, `readState`, `detectResumeState` and `pruneStateFiles` (`lib/state.js`) accept only file names that `parseStateFilename` parses, with the exact prefix and slug asked for (`ship-fix-` no longer matches `ship-fix-a-…`). The expected branch is the caller's branch when given, else the checked-out branch (`SDLC_BRANCH_OVERRIDE`, else the HEAD file) when its slug equals the slug asked for; a file whose JSON `branch` is a string other than the expected branch is skipped (not read, not pruned). The slug format is unchanged. Threat model: two branches with one slug (`fix/a`, `fix-a`) run at the same time. Accepted gaps: a read for a branch other than the checked-out one with no branch given matches by slug only; files without a `branch` field match by slug. Acceptance: exec cases `state-exact-branch:`." |
  | R112 | Integration | "Installed plugin copy. Ship and its step agents run the installed plugin (`<PLUGIN_ROOT>` from the session), never the scripts of the worktree being shipped. When a wave ships a change to this plugin, the new behaviour is not active in that ship run; the operator applies it by hand or re-installs the plugin first, and records it in the PR. Acceptance: `docs/skills/ship-sdlc.md` section `Which plugin copy ship runs`." |
- names: R97, R-subagent-brief, R109, R110, R111, R112; doc heading `### Which plugin copy ship runs`.
- mirror: R108 bullet at docs/specs/ship-sdlc.md:246; appendix rows at :632-634; doc sections at docs/skills/ship-sdlc.md:875-893.
- decisions: appendix rows `| R97, R-subagent-brief | commit agent waits, plugin root line, W-D2 (TK-010, TK-013) |`, `| R109 | ship summary file, W-D2 (TK-015) |`, `| R110 | Stop hook quiet while a step agent runs, W-D2 (TK-016) |`, `| R111 | exact state-file match, W-D2 (TK-018) |`, `| R112 | installed plugin copy, W-D2 (TK-014) |`.
- sync: user doc text: (1) new `### Which plugin copy ship runs` under `## Prerequisites`, before `### Harness Configuration`, R112 in user words; (2) one sentence near the workspace paragraph (:66): "State, execution and learnings files (ledgers, `review-summary.json`, `review-rounds-<slug>.json`, `ship-summary-<slug>.json`, `.sdlc/learnings/log.md`) go to the main checkout's `.sdlc/` even when ship runs in a linked worktree; saved review reports (`review-sdlc --post save`, `.sdlc/reviews/`) go to the active worktree."; (3) `## What It Creates or Modifies` rows for `ship-summary-<slug>.json` and `.step-agent-live-<branchSlug>.json`; (4) one sentence where the doc describes the Stop hook: it stays quiet while a dispatched step agent runs (R110). Copies by `cp`.

### Task 8: Ship writes a persisted summary file
**Ticket:** TK-015 @b15cd550

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5, Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — new `writeShipSummaryFile(ledger, summary)`, called in the cleanup block and in `finalCheckStop`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — "ship-summary-file:" cases after :4714

**Notes:** Implements R109 (text in Task 7). The name starts with `ship-` but has no timestamp, so `parseStateFilename` rejects it: GC keeps it ("unparseable-name"), and with R111 (Task 13) no ledger lookup reads it. Depends on Task 5 only for the shared dataset. Cites F-ship-step-agents-and-summary-4.

**Acceptance criteria:**
- [x] After the R108 walk scenario (`rounds-final-check`, `--walk`), `.sdlc/execution/ship-summary-feat-ship.json` exists with `schemaVersion` 1, `branch` `"feat/ship"`, `head` (40 hex characters or null), `finalCheck` equal to the cleanup summary's `finalCheck`, and `steps` equal to its `steps` (A1).
- [x] `file.finalCheck.commit` equals the cleanup summary's `finalCheck.commit` (A2).
- [x] A case with an unwritable summary path (a directory pre-created at that path) still gets the same cleanup envelope.

**Contract:**
- shape (code):
  ```js
  /** R109: persisted ship summary; a write error never stops the pipeline. */
  function writeShipSummaryFile(ledger, summary) {
    try {
      let head = null;
      try { head = /* HEAD of resolveActiveWorktreeSafe(), with the git helper ship.js already uses */ null; } catch (_) { /* null */ }
      const file = path.join(resolveStateDir(), `ship-summary-${slugifyBranch(ledger.branch || 'nobranch')}.json`);
      fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, branch: ledger.branch, startedAt: ledger.startedAt,
        head, finalCheck: summary.finalCheck || null, steps: summary.steps, prUrl: summary.prUrl }, null, 2) + '\n');
    } catch (_) { /* R109 */ }
  }
  ```
  Reuse the HEAD-reading `try` pattern near ship.js:2998; add no new import style. Call sites:
  ```diff
     const finalCheckStop = () => {
       ledger.finalCheck.handoff = true; // R104: the next resume re-checks or asks
       ledger.paused = { at: new Date().toISOString(), reason: 'final check open' };
  +    const summary = buildSummary(ledger);
  +    writeShipSummaryFile(ledger, summary); // R109
       return finish(createEnvelope('done', null, {
  -      ext: { ...ext, reason: 'final-check-open', summary: buildSummary(ledger), commands: [resumeCommand(flags, true)] },
  +      ext: { ...ext, reason: 'final-check-open', summary, commands: [resumeCommand(flags, true)] },
  ```
  ```diff
         rounds: next.step.data.summary.reviewRounds || [] }, null, 2) + '\n');
       } catch (_) { /* R108: a write error never stops the pipeline */ }
  +    writeShipSummaryFile(ledger, next.step.data.summary); // R109
     }
  ```
- names: `writeShipSummaryFile`, `ship-summary-<slug>.json`.
- mirror: R108 block at ship.js:3032-3036 and its case at ship-prepare-exec.yaml:4699-4714.
- decisions: written at cleanup emission and at the final-check-open stop; never deleted by cleanup.
- sync: R109 in Task 7.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^ship-summary-"`

### Task 9: Stop hook quiet while a step agent runs
**Ticket:** TK-016 @bae9b84c

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/hooks/subagent-track.js` — SubagentStart/SubagentStop marker writer
- Modify: `plugins/sdlc-utilities/hooks/stop-pipeline-continue.js` — live-agent check before the cap counter
- Modify: `plugins/sdlc-utilities/hooks/hooks.json` — SubagentStart and SubagentStop entries
- Modify: `plugins/sdlc-utilities/hooks/README.md` — the new hook and R110
- Modify: `tests/promptfoo/datasets/ship-hooks-exec.yaml` — four "stop-pipeline-continue (R110):" cases after :214

**Notes:** Implements R110 (text in Task 7); its threat model and accepted gaps are stated there. The marker is dot-prefixed, so no state glob or `parseStateFilename` matches it. Check the SubagentStart/SubagentStop payload fields (`agent_id`, `agent_type`) against the Claude Code hooks reference before coding; if the harness has no SubagentStart event, stop and report. Adds no deny or block rule: the new hook only writes a marker and never blocks. Cites F-ship-step-agents-and-summary-5.

**Acceptance criteria:**
- [x] After `subagent-track.js start` with `{"agent_id":"a1","agent_type":"sdlc:ship-step-review","session_id":"sess-fixture"}`, the Stop hook on an in-progress ledger exits 0 with empty stdout and writes no stop-cap counter file (A1).
- [x] After `start` then `stop` for the same id, the Stop hook blocks (A2).
- [x] A marker whose only agent started 3 hours ago does not silence the hook.
- [x] `start` for `agent_type` `general-purpose` writes no marker; the hook blocks.
- [x] The existing cases at ship-hooks-exec.yaml:160-214 stay green; hooks.json stays valid JSON and `check-consistency.js` passes.

**Contract:**
- shape (code): hooks.json additions:
  ```json
  "SubagentStart": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/subagent-track.js\" start", "timeout": 3 }] }],
  "SubagentStop":  [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/subagent-track.js\" stop",  "timeout": 3 }] }]
  ```
  `subagent-track.js <start|stop>`: reads stdin JSON; ignores the event (exit 0) unless `agent_type` matches `/(^|:)ship-step-[a-z-]+$/` and `agent_id` is a string; resolves `stateDir` and `branchSlug` with `resolveHookContext(payload)`; `start` merges `agents[agent_id] = { agentType, startedAt: <ISO> }` into `<stateDir>/.step-agent-live-<branchSlug>.json` (atomic write); `stop` deletes that key, and deletes the file when `agents` is empty. Never prints, never throws, always exits 0. Stop hook: new `STEP_AGENT_LIVE_TTL_MS = 2 * 60 * 60 * 1000`; after the R73 gate and before the cap counter, `if (step.status === 'in_progress' && liveStepAgent(stateDir, branchSlug, Date.now())) process.exit(0);`, where `liveStepAgent` is true when the marker parses and one `startedAt` is within the TTL; a missing, corrupt or stale marker gives false.
  Marker file shape:
  ```json
  { "schemaVersion": 1, "branch": "feat/x", "agents": { "a1": { "agentType": "sdlc:ship-step-review", "startedAt": "2026-11-20T10:00:00.000Z" } } }
  ```
  Lifecycle:
  ```mermaid
  sequenceDiagram
    participant Main as main session
    participant Track as subagent-track.js
    participant Marker as .step-agent-live-<slug>.json
    participant Stop as stop-pipeline-continue.js
    Main->>Track: SubagentStart (agent_id, agent_type ship-step-*)
    Track->>Marker: add agents[agent_id]
    Main->>Stop: Stop (turn ends, step in_progress)
    Stop->>Marker: read; fresh entry found
    Stop-->>Main: exit 0, no output
    Main->>Track: SubagentStop (agent_id)
    Track->>Marker: delete agents[agent_id]; delete file when empty
    Main->>Stop: Stop (step still in_progress)
    Stop-->>Main: decision block (R68 / R-stop-inprogress-mode-independent)
  ```
  Condition → behaviour:

  | Condition | subagent-track.js | Stop hook |
  |---|---|---|
  | `agent_type` not matching `ship-step-`, or no `agent_id` | no write, exit 0 | unchanged rules |
  | stdin not JSON, state dir missing, write error | no write, exit 0, no stderr | unchanged rules |
  | marker missing or not valid JSON | — | not live → unchanged rules |
  | every `startedAt` older than 2 h, or not a date | — | not live → unchanged rules |
  | one fresh entry, step `in_progress` | — | exit 0 silently, cap counter untouched |
  | one fresh entry, step `pending` (between steps) | — | unchanged rules (only `in_progress` is quieted) |
- names: `subagent-track.js`, `.step-agent-live-<branchSlug>.json`, `STEP_AGENT_LIVE_TTL_MS`, `liveStepAgent`.
- mirror: `hooks/stop-pipeline-continue.js:60-130` (payload read, `resolveHookContext`, silent exits).
- decisions: the test cases run an `-e` driver that copies the `ship-pipeline-inprogress` fixture's state file into an `fs.mkdtempSync` dir, sets `SDLC_STATE_DIR_OVERRIDE` and `SDLC_BRANCH_OVERRIDE` for both scripts, and never writes inside the fixture tree; the stale case writes the marker itself with a `startedAt` 3 hours old.
- sync: R110 in Task 7; hooks/README.md lists `subagent-track.js` with its two events.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "^stop-pipeline-continue"`

### Task 10: commit-sdlc reads project config from the worktree
**Ticket:** TK-017 @1f36eebc

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/commit-sdlc.md` — ADD R21, appendix row
- Modify: `site/src/content-source/specs/commit-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/scripts/skill/commit.js` — `configRoot = resolveActiveWorktreeSafe()` for `ensureConfigVersion` and `readSection(…, 'commit')`; state calls unchanged
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — one case after the #406 case (:9-20)
- Create: `tests/promptfoo/fixtures-fs/project-linked-worktree-config/setup.sh` — main and linked worktree with different `commit.subjectPattern`
- Modify: `docs/skills/commit-sdlc.md` — check only, no change expected (the doc does not state the config root)
- Modify: `site/src/content-source/skills/commit-sdlc.md` — check only, no change expected

**Notes:** #351 routed reads to the main checkout on purpose; this keeps that for state and `local.json` and moves only `.sdlc/config.json` (tracked per branch). The TK-017 doc sentence (A2) is written by Task 7. Cites F-worktree-config-and-state-slug-3, -7.

**Acceptance criteria:**
- [x] Run from `worktrees/wt1` of the new fixture, `commit.js` reports the worktree's `commitConfig.subjectPattern`, not the main checkout's (A1).
- [x] The commit manifest is still written under the main checkout's `.sdlc/execution/` (the case asserts the printed manifest path).
- [x] The #406 case at commit-prepare-exec.yaml:9 stays green.

**Contract:**
- shape (code):
  ```diff
  -  const projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/
  +  const configRoot = resolveActiveWorktreeSafe(); // R21: project config from the worktree toplevel; state stays in the main checkout (#9444)
  ```
  Every `projectRoot` use in `main()` that reads `.sdlc/config.json` (`ensureConfigVersion(…, { roles: ['project'] })`, `readSection(…, 'commit')`) takes `configRoot`; any `local.json` read keeps `resolveSdlcRoot()`.
- names: `configRoot`, R21.
- mirror: `skill/review.js:617` (`activeRoot = resolveActiveWorktreeSafe()`).
- decisions: R21 text: "R21 (Config root): `skill/commit.js` reads `.sdlc/config.json` from the active worktree toplevel (`resolveActiveWorktreeSafe()`); `.sdlc/local.json` and state files stay in the main checkout (`resolveSdlcRoot()`, `resolveStateDir()`). Acceptance: exec case `commit-prepare (R21):`." Appendix row `| R21 | config root in a linked worktree, W-D2 (TK-017) |`.
- sync: the fixture setup.sh mirrors `fixtures-fs/project-linked-worktree-staged/setup.sh` (fixture guard, `git init`, `git worktree add -q -b feature/config-test worktrees/wt1`), writes `.sdlc/config.json` with `"subjectPattern": "^main: .+$"` before the first commit, then overwrites `worktrees/wt1/.sdlc/config.json` with `"^wt: .+$"` and stages one file there; site copy by `cp`.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^commit-prepare"`

### Task 11: received-review reads project config from the worktree
**Ticket:** TK-017 @1f36eebc

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 10
**Verify:** tests

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — ADD R37, appendix row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/scripts/skill/received-review.js` — default `projectRoot` = `resolveActiveWorktreeSafe()`; new `localRoot = resolveSdlcRoot()` for `readSection(…, 'receivedReview')`; `--project-root` sets both
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — one case using the Task 10 fixture

**Notes:** Depends on Task 10 for the fixture. `--project-root` keeps setting both roots, so the existing fixture cases (:11, :21, :31, :75, :87) read their fixture's `local.json` unchanged. Dimensions, guardrails, git remote and changed files then come from the worktree, which is what the answered review saw. Cites F-worktree-config-and-state-slug-4.

**Acceptance criteria:**
- [x] Run from `worktrees/wt1` of the Task 10 fixture with `--comment-file`, the manifest's project-config fields come from the worktree's `.sdlc/config.json` (A1).
- [x] `alwaysFixSeverities` is still read from the main checkout's `.sdlc/local.json`.
- [x] The existing `received-review-prepare` cases stay green.

**Contract:**
- shape (code):
  ```diff
   function parseArgs(argv) {
  -  let projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/ (overridable via --project-root)
  +  let projectRoot = resolveActiveWorktreeSafe(); // R37: config, dimensions, guardrails, git from the worktree toplevel
  +  let localRoot = resolveSdlcRoot();             // R37: .sdlc/local.json stays in the main checkout
  …
  -    else if (a === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  +    else if (a === '--project-root' && args[i + 1]) { projectRoot = path.resolve(args[++i]); localRoot = projectRoot; }
  …
  -  return { prNumber, owner, repo, projectRoot, auto, commentFile,
  +  return { prNumber, owner, repo, projectRoot, localRoot, auto, commentFile,
  ```
  ```diff
  -function resolveAlwaysFixSeverities(projectRoot) {
  +function resolveAlwaysFixSeverities(projectRoot, localRoot) {   // misplacement check on projectRoot
  -  const local = readSection(projectRoot, 'receivedReview');
  +  const local = readSection(localRoot, 'receivedReview');
  -function resolveAlwaysHardenFromReview(projectRoot) {
  +function resolveAlwaysHardenFromReview(projectRoot, localRoot) {
  -function resolveHardenClusterCap(projectRoot) {
  +function resolveHardenClusterCap(localRoot) {
  ```
  Call sites in `main()` (both blocks; `localRoot` comes from `parseArgs`):
  ```diff
  -      alwaysFixSeverities: resolveAlwaysFixSeverities(projectRoot),
  -      alwaysHardenFromReview: resolveAlwaysHardenFromReview(projectRoot),
  -      hardenClusterCap: resolveHardenClusterCap(projectRoot),
  +      alwaysFixSeverities: resolveAlwaysFixSeverities(projectRoot, localRoot),
  +      alwaysHardenFromReview: resolveAlwaysHardenFromReview(projectRoot, localRoot),
  +      hardenClusterCap: resolveHardenClusterCap(localRoot),
  ```
  ```diff
  -  const alwaysFixSeverities = resolveAlwaysFixSeverities(projectRoot);
  +  const alwaysFixSeverities = resolveAlwaysFixSeverities(projectRoot, localRoot);
  …
  -  const alwaysHardenFromReview = resolveAlwaysHardenFromReview(projectRoot);
  -  const hardenClusterCap = resolveHardenClusterCap(projectRoot);
  +  const alwaysHardenFromReview = resolveAlwaysHardenFromReview(projectRoot, localRoot);
  +  const hardenClusterCap = resolveHardenClusterCap(localRoot);
  ```
  `resolveActiveWorktreeSafe` is imported from `lib/worktree` like review.js does.
- names: `localRoot`, R37.
- mirror: Task 10 `configRoot` change; `received-review.js:95-158`.
- decisions: R37 text: "R37 (Config root): `skill/received-review.js` reads `.sdlc/config.json`, review dimensions, guardrails and git state from the active worktree toplevel; the `receivedReview` settings in `.sdlc/local.json` stay in the main checkout. `--project-root` sets both. Acceptance: exec case `received-review-prepare (R37):`." Appendix row `| R37 | config root in a linked worktree, W-D2 (TK-017) |`.
- sync: site copy by `cp`.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "received-review-prepare"`

### Task 12: Fix step updates exec cases of removed phrases
**Ticket:** TK-009 @430fc9d8

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 11
**Verify:** tests

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — ADD R38, appendix row (written first)
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Step 11 rule after "For each change: …"
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — one sentence naming R38
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — one "rr-skill-text:" case
- Modify: `docs/skills/received-review-sdlc.md` — check only, no change expected (R38 is an internal fix-step rule)
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — check only, no change expected

**Notes:** In ship, received-review leaves its fixes in the working tree and commit-fixes commits them, so "the same commit" means the same change set. The rule is prose because the fix step is model work; the text case guards its presence. Depends on Task 11 (shared spec and dataset) and Task 6 (shared agent file). Cites F-worktree-config-and-state-slug-6.

**Acceptance criteria:**
- [x] SKILL.md Step 11 holds the rule below once (A1).
- [x] The rule names the scan command and says that a fix that removes a phrase also updates every exec case that counts it (A2).
- [x] The text case counts `**Removed phrases (R38).**` in SKILL.md as 1 and `(received-review-sdlc R38)` in the agent file as 1.

**Contract:**
- shape (docs): SKILL.md rule, verbatim core: "**Removed phrases (R38).** Before a fix removes or rewords a sentence, phrase, name or count, run `git grep -n -F -- \"<old text>\" tests/promptfoo/datasets` as one plain Bash call. Update every case that counts or asserts the old text in the same change set as the fix, and name those cases in the Step 12 summary. A case that must keep the old text is a reason to keep the phrase, not to skip the update." Agent sentence: "When a fix removes or rewords a phrase, update the exec cases that count it in the same change set (received-review-sdlc R38)."
- names: R38, `git grep -n -F`.
- mirror: R36 paragraph at SKILL.md:396 and its case at received-review-prepare-exec.yaml:400-410.
- decisions: R38 text: "R38 (Removed phrases): Step 11 greps `tests/promptfoo/datasets` for each phrase a fix removes or rewords and updates the cases that count or assert it in the same change set. Acceptance: exec case `rr-skill-text: (R38)`." Appendix row `| R38 | removed-phrase cases updated with the fix, W-D2 (TK-009) |`.
- sync: the case builds the literal with `\x20` escapes like :403; its pattern holds no `|`.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "rr-skill-text"`

### Task 13: State files match the exact branch name
**Ticket:** TK-018 @2b909f3e

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/state.js` — exact parsed-slug match in `findStateFile` and `detectResumeState`; `expectedBranch` and `branchMatches` helpers; branch check in `findStateFile`, `readState`, `detectResumeState`, `pruneStateFiles`
- Modify: `tests/promptfoo/datasets/state-gc-migrate-exec.yaml` — "state-exact-branch:" cases
- Create: `tests/promptfoo/fixtures-fs/state-exact-branch/.sdlc/execution/ship-fix-a-20261101T000000Z.json` — `branch: "fix/a"`
- Create: `tests/promptfoo/fixtures-fs/state-exact-branch/.sdlc/execution/ship-fix-a-20261102T000000Z.json` — `branch: "fix-a"`
- Create: `tests/promptfoo/fixtures-fs/state-exact-branch/.sdlc/execution/ship-fix-20261103T000000Z.json` — `branch: "fix"`

**Notes:** Implements R111 (text in Task 7); its threat model and gaps bound what reviewers report. No caller changes (Key Decisions). This changes a shared helper that every state reader inherits (F-160): find the affected cases with `git grep -l -E "SDLC_STATE_DIR_OVERRIDE|SDLC_BRANCH_OVERRIDE|\.sdlc/execution" tests/promptfoo/datasets` and run each listed dataset's description prefix as a targeted filter, under the exec and the hooks configs. Cites F-worktree-config-and-state-slug-1, -2.

**Acceptance criteria:**
- [x] With `SDLC_STATE_DIR_OVERRIDE` on the fixture, `state/ship.js read --branch fix/a` (with `SDLC_BRANCH_OVERRIDE=fix/a`) returns the `fix/a` ledger, and `--branch fix-a` (with `SDLC_BRANCH_OVERRIDE=fix-a`) the `fix-a` ledger, though the `fix-a` file is newer (A1).
- [x] `--branch fix` reads the `fix` ledger, never a `fix-a` file.
- [x] File names stay `<prefix>-<slugifyBranch(branch)>-<timestamp>.json` (A2; a case asserts `slugifyBranch('fix/a') === 'fix-a'` and the `initState` file name).
- [x] `detectResumeState({ prefix: 'ship' })` ignores a `ship-summary-x.json` file in the state dir.
- [x] Every dataset found by the scan in Notes passes its targeted run.
- [x] Run-twice (state-machine idempotency): `readState` and `detectResumeState` called twice on the same fixture return the same file; `pruneStateFiles('ship', 'fix-a', 'fix/a')` run twice on a temp copy removes the `fix/a` file once, keeps the `fix-a` file, and the second call returns `[]`.

**Contract:**
- shape (code):
  ```js
  /** R111: the branch a lookup means — the caller's, else the checked-out branch when its slug matches. */
  function expectedBranch(branchSlug, branch) {
    if (typeof branch === 'string' && branch) return branch;
    const cur = process.env.SDLC_BRANCH_OVERRIDE || branchFromHeadFile(process.cwd());
    return cur && slugifyBranch(cur) === branchSlug ? cur : null;
  }
  /** R111: a file whose JSON names another branch is skipped; a missing or unreadable branch field matches. */
  function branchMatches(fullPath, want) { /* read JSON; return want === null || typeof data.branch !== 'string' || data.branch === want */ }
  ```
  Signatures: `findStateFile(prefix, branchSlug, branch?)`, `readState(prefix, branchSlug, branch?)`, `pruneStateFiles(prefix, branchSlug, branch?)`; `detectResumeState({ prefix, branch })` keeps its signature. Name filter in all four: `const p = parseStateFilename(f); p && p.prefix === prefix && (branchSlug === null || p.slug === branchSlug)`. `writeManifestState` passes its raw `branch` to `pruneStateFiles`. A file that cannot be parsed for the branch check counts as matching (today's behaviour; `readState` still warns on it).
- names: `expectedBranch`, `branchMatches`, R111.
- mirror: `parseStateFilename` use in `pruneStateFiles` (state.js:582-606); `resolveHookContext` branch source (state.js:131-149).
- decisions: slug format unchanged; GC (`gcStateFiles`, `gcTempdirs`) stays slug-based on purpose (branch liveness).
- sync: R111 in Task 7; Task 8's `ship-summary-<slug>.json` relies on the parsed-name filter.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "state-exact-branch|state/ship.js|state/execute.js"`

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code task adds or flips exec cases (Task 1 flips the stale assertion); doc-only Task 7 is covered by validators |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern exec-config runs; no full-suite promptfoo eval |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to TK-009..TK-018 and the homed PF13 note; extras are justified in Deviations |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Logic goes into scripts (execute.js, ship.js, state.js, hooks); the only prose rule (R38) is model work guarded by a text case |
| yagni | warning | PASS | Only the ticketed behaviour is added |
| cross-skill-consistency | error | PASS | Ship, execute, commit, received-review and plan are kept consistent via the shared spec task and the R94/R111 cross-checks |
| pr-link-github-issue | error | PASS | TK and W-D2 ids are internal register ids, not GitHub issues; rule does not apply |
| dry | warning | PASS | Repeated agent sentence is deliberate per-file text, guarded by one count case |
| kiss | warning | PASS | Simplest mechanisms chosen and alternatives recorded in Key Decisions |
| spec-first | error | PASS | Tasks 5, 6, 8, 9 and 13 depend on Task 7 (ship spec); Task 4 depends on Task 3 (R94); Tasks 1, 2, 3, 10, 11 and 12 list their spec edit before the code or SKILL.md edit |
| project-agnostic | error | PASS | All changes are in plugin code, specs and docs |
| flag-coherence-cross-skill | error | PASS | No new flag gating sites in SKILL.md |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings introduced |
| flag-resolution-single-source | warning | PASS | No new contractual flag with multiple resolution sites |
| state-premise | error | PASS | Context states the problem (open follow-up defects plus PF13) |
| smallest-viable-cut | warning | FAIL | No smallest viable cut is named for the 13-task scope; extra tasks are not justified against a minimum |
| failure-audience | warning | FAIL | The plan does not name who or what fails if this ships wrong |
| explicit-non-goals | warning | FAIL | No non-goals section; excluded alternatives appear only inside Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | Task 3 (spec-review overwrite, verify-completeness twice) and Task 13 (readState/detectResumeState/prune twice) have run-twice criteria |
| agent-dispatch-script-driven | error | PASS | Only a plugin-root line is added to the prompt; model and isolation are untouched |
| flag-semantic-consistency-cross-skill | error | PASS | New --status and --reason flags are on state/execute.js, an internal helper out of scope |
| workspace-mode-compatibility | error | PASS | State goes via resolveStateDir and config via resolveSdlcRoot or the worktree root; the split is stated per file (Tasks 10, 11, 13, R111) |
| prompt-cache-hit-ratio | warning | PASS | The plugin root line is stable and sits in the dispatch tail after Branch |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 3 adds a `state/execute.js spec-review` subcommand and a new exit-65 `specReview: "unrecorded"` result, Task 6 changes the ship dispatch prompt to carry `sdlc plugin root: <PLUGIN_ROOT>`, and Task 9 adds `SubagentStart`/`SubagentStop` entries in `hooks/hooks.json`.

**Severity hint:** high

**Patch:** Check the new `spec-review` CLI subcommand and its exit codes, the `sdlc plugin root:` line in the ship dispatch prompt, and the SubagentStart/SubagentStop hooks with the `.step-agent-live-<branchSlug>.json` marker.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new `spec-review` CLI subcommand and its exit codes, the `sdlc plugin root:` line in the ship dispatch prompt, and the SubagentStart/SubagentStop hooks with the `.step-agent-live-<branchSlug>.json` marker.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (U5, U1)

**Why:** Task 6 edits all six `plugins/sdlc-utilities/agents/ship-step-*.md` files and Task 9 edits `plugins/sdlc-utilities/hooks/README.md`, none of which match the `plugins/**/scripts/**/*.js` trigger.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/ship-step-commit.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/ship-step-commit.md`

### UPDATE: code-quality (U1)

**Why:** Tasks 1 to 13 edit many `.md` files (specs, skill docs, agent files, `SKILL.md`, `state-format.md`), for example Task 7's `docs/specs/ship-sdlc.md`, and the dimension's triggers do not cover `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 1 | 0 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 TK-009 received-review fix step greps datasets for removed phrases | Task 12 | covered |
| 2 TK-010 ship-step-commit waits for its drafter | Task 5, Task 7 | covered |
| 3 TK-011 R74 recheckLanes keeps rerun lanes | Task 1 | covered |
| 4 TK-012 Step 8-bis runs or records skip; verify-completeness fails neither | Task 3, Task 4 | covered |
| 5 TK-013 plugin root line in every ship-step prompt | Task 6, Task 7 | covered |
| 6 TK-014 ship docs state plugin copy used (doc-only) | Task 7 | covered |
| 7 TK-015 ship-summary file with finalCheck, head, steps | Task 8, Task 7 | covered |
| 8 TK-016 Stop hook quiet while step agent live | Task 9, Task 7 | covered |
| 9 TK-017 worktree config reads and doc of file locations | Task 10, Task 11, Task 7 | covered |
| 10 TK-018 fix/a and fix-a state files isolated | Task 13, Task 7 | covered |
| 11 TODO plan-format-pf13-deleted-paths | Task 2 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

- **ship-sdlc**
  - Every step agent gets the main session's plugin root in its task message and uses it.
  - The commit step agent waits for its message drafter before it returns.
  - Each run leaves `.sdlc/execution/ship-summary-<slug>.json` with the final check, HEAD and the step statuses.
  - The Stop hook stays quiet while a dispatched step agent is live, and still blocks otherwise.
  - State lookups match the exact file name and the exact branch; `fix/a` and `fix-a` no longer share state.
  - The user doc says which plugin copy ship runs and where each kind of file goes.

- **execute-plan-sdlc**
  - Step 8-bis always records whether the final spec review ran or why it was skipped.
  - The verifying cleanup and `verify-completeness --final` fail a run with no record.

- **plan-sdlc**
  - The R74 re-check re-dispatches lanes that were blocking, even after a non-material fix.
  - PF13 accepts `Modify: <path> — delete` entries of deleted files.

- **commit-sdlc and received-review-sdlc**
  - In a linked worktree, project config and plan reads come from the worktree; `local.json` and state stay in the main checkout.
  - received-review's fix step updates the exec cases that count a phrase it removes.

## OpenSpec Appendix

Not applicable — no OpenSpec change
