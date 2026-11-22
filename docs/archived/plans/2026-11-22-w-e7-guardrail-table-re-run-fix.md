# Guardrail Table Re-run Fix Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #144, dfd3dbc

**Commit:** `fix(W-E7): plan-sdlc - re-run guardrail lane on a warning FAIL`
**Goal:** Make plan-sdlc re-run the guardrail-compliance critique lane whenever its previous result has any FAIL, warning severity included, so the spliced Guardrail Compliance table never keeps a stale FAIL row after a fix.
**Architecture:** One predicate change in `rerunFrom` (`plugins/sdlc-utilities/scripts/lib/plan-critique.js`): the guardrail-compliance lane counts as dirty when its previous result has any issue. The spec (R64, R67 (b), R74, R76, R77) and two prompt companions are reworded to match, and one exec case with a new fixture directory pins the behaviour.
**Source:** docs/plans/programme.md#W-E7
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-diff

---

## Context

**What problem does this change solve?**

- plan-sdlc writes a `## Guardrail Compliance` table into each plan. The table comes from the guardrail lane (a critique subagent that checks the plan against the project's guardrails).
- When a guardrail of warning severity fails, the lane reports the failure as an issue with `blocking: false`.
- After the author fixes it with a non-material edit (for example a new Non-goals paragraph in Context), the next critique round decides which lanes to run again. It runs a lane again only when its previous result had a blocking issue.
- So the guardrail lane is not run again. Its old result is carried forward (`--carry`, R64), and the re-splice (R77) writes the old table with the stale FAIL row.

**What prompted this change now?**

- Ledger finding F-141, ticket TK-022, decision PD-6: the stale rows showed again in `docs/archived/plans/2026-11-20-w-d2-ship-execute-and-plan-follow-ups.md` (lines 818 to 820: `smallest-viable-cut`, `failure-audience`, `explicit-non-goals`), after the R77 re-splice fix of wave W-B.
- R77 (`docs/specs/plan-sdlc.md:90`) currently states this as an accepted gap.

**What does success look like?**

- A1: after a warning-severity guardrail FAIL is fixed in the plan text, the next critique re-runs the guardrail lane and the spliced table has no stale FAIL row.
- A2: an exec case in `tests/promptfoo/datasets/plan-prepare-exec.yaml` covers it.

**Who is affected if this ships wrong (failure audience):** plan authors and plan reviewers. A wrong predicate either keeps stale FAIL rows (the current defect) or re-runs a lane it should not (extra cost of one Sonnet lane per round). Shipped plans are not broken by either case; only the guardrail table and critique cost are.

**Smallest viable cut:** the one-predicate change, the spec wording, one exec case. The two prompt-companion sentences are reworded only because they state the old rule and would mislead an orchestrator.

**Non-goals:**

- F-144 and F-146 (already fixed by wave W-D2), F-170 (not a defect, PD-2(b)).
- Any rule that fixes low findings early, or any other plan-sdlc critique change (other lanes and the lenses keep their rerun rule).
- The plan register, its generated regions, ticket files and TODO notes: the planning PR closes TK-022.
- No change to `--carry`, `splice` or the guardrail lane agent.

## Research Findings

Re-verified at HEAD `70dc348`; the item still reproduces.

- The rerun rule lives in `rerunFrom` (`plugins/sdlc-utilities/scripts/lib/plan-critique.js:226-249`). Its lane predicate is `v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && i.blocking === true)` (F-rerunfrom-guardrail-lane-logic-2). The lane key is `guardrail-compliance` (`LANE_DEFS`, line 11; F-rerunfrom-guardrail-lane-logic-1).
- The guardrail lane agent reports one issue per failing guardrail, error or warning, and marks only error ones blocking (`plugins/sdlc-utilities/agents/plan-lane-guardrail.md:36`, `:66`; F-rerunfrom-guardrail-lane-logic-3).
- `merge-lanes --carry` and `splice --critique-dir` need no change: once the lane is re-dispatched, the current iteration has its own file and the newest `merged.json` holds the fresh table (F-rerunfrom-guardrail-lane-logic-4, F-rerunfrom-guardrail-lane-logic-5).
- The rerun rule is stated in the spec at R64 (line 148), R76 (line 88), R74 (line 92), R77 (line 90, the accepted-gap sentence) and canonically at R67 (b) (line 215) (F-rerun-rule-wording-sites-1 to F-rerun-rule-wording-sites-4, F-rerun-rule-wording-sites-10). The wording differs between them (brief contradiction note).
- Prompt companions that restate it: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:46` and `:55` ("the Step 3 lanes whose result blocked", "the lanes whose result blocked, R76") and `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md:141` ("held a blocking issue") (F-rerun-rule-wording-sites-5, F-rerun-rule-wording-sites-6). SKILL.md only refers to the rule (F-rerun-rule-wording-sites-9). The user doc `docs/skills/plan-sdlc.md` does not state the rerun clause (F-rerun-rule-wording-sites-7).
- `site/src/content-source/specs/plan-sdlc.md` is byte-identical to the spec (`cmp` run at planning time; F-rerun-rule-wording-sites-8).
- The spec appendix is the `| Id | History |` table at the end of `docs/specs/plan-sdlc.md`; the last row is W-E1 (F-rerun-rule-wording-sites-11).
- Tests: the `plan-diff:` cases run `plan.js diff-material` against `tests/promptfoo/fixtures-fs/plan-diff-material/`. The `prev-blocking/` fixture is used by three cases, so a new fixture directory is needed (F-plan-prepare-exec-test-surface-1, F-plan-prepare-exec-test-surface-2). No count or floor check over the dataset exists (F-plan-prepare-exec-test-surface-5; re-checked with `git grep plan-prepare-exec` over `tests/promptfoo/scripts`, configs and `plugins/sdlc-utilities/scripts/ci`).
- Literal grep for the removed and reworded sentences over `tests/` and `tests/promptfoo/scripts/check-*.js`: whole sentences and the fragments `warning-severity FAIL`, `carried forward`, `can still show`, `non-material edit`, `whose result blocked`, `held a blocking issue`, `was blocking or failed`, `was blocking before` give no hit. `Accepted gap` hits only header comments of unrelated check scripts. The `rerun-sentinels` case (`run-plan-prepare-case.js:250`) asserts `<!-- R76 -->`, a `diff-material` command line, `dispatch.lanes`, a `--lanes` line and a `--carry` line, none of which change.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Planning route | no | runs plan-sdlc at `--quality balanced`, not `--lightweight` | the change alters which lanes a critique round dispatches (R74, R76), which the brief names as a reason to skip the light route |
| Prompt companions | no | rewords the rerun sentence in `plan-critique-orchestrator.md` and `review-loop.md` | they state the old blocking-only rule; leaving them would contradict R67 (b) |
| User doc and companions | no | lists `docs/skills/plan-sdlc.md`, its site copy, `skills-meta.ts` and the other plan-sdlc companions in Task 3 as `check only, no change expected` | `plan.copyRules` requires every companion to be named for a spec change; none states the rerun clause (F-rerun-rule-wording-sites-7) |

## Decisions taken without the owner

- Planning route: `--quality balanced` full pipeline, because the scope changes plan-sdlc critique dispatch (brief rule). No user question was asked.
- Rerun scope: only the guardrail-compliance lane re-runs on a non-blocking issue. Other lanes and the lenses keep the blocking-only rule (ticket What, Non-goals).
- No new spec id: R64, R67 (b), R74, R76 and R77 are modified in place; one appendix row records it.

## Key Decisions

- **Any issue, for the guardrail lane only, over any issue for every lane:**
  - The guardrail lane is the only lane whose output is written into the plan as a table, so a stale non-blocking issue is visible only there.
  - Re-running every lane with an advisory issue would add cost to every round for no visible gain, and the ticket limits the scope to this lane.
- **Re-run on every issue, over comparing the plan text with the failing guardrail:**
  - The script cannot tell whether a fix touched the failing guardrail; only the lane can judge it.
  - Accepted cost: a warning the author leaves unfixed re-runs the guardrail lane once per round (one Sonnet lane call; the loop is capped at 3 iterations, R8).
- **New fixture directory `prev-guardrail-warning/`, over a file added to `prev-blocking/`:**
  - Three existing cases assert the exact `rerun` of `prev-blocking/`; a new file there would change them.
  - The new directory also holds a non-blocking issue of another lane, so the case proves the rule does not spread.

## Contract Examples

**code** (Task 2):

```markdown
**Contract:**
- shape (code): `rerunFrom(prevDir, afterRoute)` unchanged signature; lane predicate adds `name === 'guardrail-compliance'` as a dirty reason for any object issue.
- names: `rerunFrom`, `LANE_DEFS`, `guardrail-compliance`.
- mirror: the lens predicate in the same function (`plan-critique.js:241-246`).
- decisions: Key Decisions 1 and 2.
- sync: R67 (b) in `docs/specs/plan-sdlc.md` states the same rule.
```

**docs** (Task 3):

```markdown
**Contract:**
- shape (docs): MODIFY one sentence in `review-loop.md` (Step 6) and two parentheses in `plan-critique-orchestrator.md` (R76 block, lines 46 and 55); audience: the orchestrator and author agents.
- names: `rerun`, `dispatch.lanes`, `guardrail-compliance`.
- mirror: the existing sentence style at `review-loop.md:141`.
- decisions: wording follows R67 (b) as Task 1 writes it.
- sync: R67 (b), R76 in `docs/specs/plan-sdlc.md`.
```

**openspec** (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY R64, R67 (b), R74, R76, R77 in `docs/specs/plan-sdlc.md`; ADD one appendix row; no new id.
- names: R64, R67, R74, R76, R77.
- mirror: the appendix row style `| R67, R74 | rerun lanes kept on a non-material fix, W-D2 (TK-011) |`.
- decisions: no new id (Decisions taken without the owner).
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.
```

## Tasks

### Task 1: Spec — guardrail lane re-runs on any previous issue

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — reword R64, R67 (b), R74, R76; remove the R77 accepted-gap sentence; add one appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec (`cp`)

**Notes:** Spec first (guardrail `spec-first`): Tasks 2 and 3 depend on this task. The fragment grep in Research Findings found no test that asserts the old sentences, so no test file is listed. Cites F-rerun-rule-wording-sites-1 to F-rerun-rule-wording-sites-4, F-rerun-rule-wording-sites-10, F-rerun-rule-wording-sites-11.

**Acceptance criteria:**
- [x] R67 (b) states that the guardrail-compliance lane is in `rerun` when its previous result holds any issue, warning included
- [x] R64, R74 and R76 state the same rule (by the inserted text below)
- [x] R77 no longer contains `Accepted gap: a warning-severity FAIL fixed by a non-material edit`
- [x] The appendix ends with the new row below
- [x] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0

**Contract:**
- shape (openspec): MODIFY five requirements in place; ADD one appendix row; no id is added, renumbered or reused. Edits (before → after):

  R67 (b), line 215:
  ```diff
  -With `--prev-dir`, `rerun` lists each lane of the lane table whose `<name>.json` in `<iterDir>` holds an issue with `blocking: true`, has a `laneStatus` other than `ok`, or is not valid JSON, and each
  +With `--prev-dir`, `rerun` lists each lane of the lane table whose `<name>.json` in `<iterDir>` holds an issue with `blocking: true` (for `guardrail-compliance`, any issue, so a warning-severity FAIL with `blocking: false` counts), has a `laneStatus` other than `ok`, or is not valid JSON, and each
  ```

  R64, line 148:
  ```diff
  -A lane or lens whose result in the previous iteration held a blocking issue is re-dispatched with the affected ones (R67 `rerun`),
  +A lane or lens whose result in the previous iteration held a blocking issue (for the guardrail-compliance lane, any issue, warning included) is re-dispatched with the affected ones (R67 `rerun`),
  ```

  R74, line 92:
  ```diff
  -(after a non-material fix these are the lanes whose previous result was blocking or failed, R67(b))
  +(after a non-material fix these are the lanes whose previous result was blocking or failed, and the guardrail-compliance lane when its previous result held any issue, R67(b))
  ```

  R76, line 88:
  ```diff
  -A Step 5 round never carries a lane result that was blocking before the last fix.
  +A Step 5 round never carries a lane result that was blocking before the last fix, nor a guardrail-compliance result that held any issue (R67 (b)).
  ```

  R77, line 90 (last two sentences):
  ```diff
  -Threat model: a table written from a result older than the newest guardrail lane result. Accepted gap: a warning-severity FAIL fixed by a non-material edit is carried forward by `--carry` (R64) and can still show.
  +Threat model: a table written from a result older than the newest guardrail lane result. A guardrail lane result that held any issue, warning included, is re-run and not carried (R67 (b)), so a fixed FAIL of either severity leaves the table.
  ```

  Appendix, new last row:
  ```markdown
  | R64, R67, R74, R76, R77 | guardrail lane re-run on any previous issue, warning included; R77 accepted gap removed (F-141), W-E7 (TK-022) |
  ```
- names: R64, R67, R74, R76, R77; appendix table `| Id | History |`.
- mirror: appendix row `| R67, R74 | rerun lanes kept on a non-material fix, W-D2 (TK-011) |` near the end of the table.
- decisions: modify in place, no new id (Decisions taken without the owner); only the guardrail lane changes (Key Decisions 1).
- sync: `site/src/content-source/specs/plan-sdlc.md` by `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` (never `site/scripts/copy-docs.mjs`).

### Task 2: Re-run the guardrail lane on any previous issue, with an exec case
**Ticket:** TK-022 @b3f64445

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `rerunFrom` lane predicate and its JSDoc line
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add one `plan-diff: (rerun)` case (+1 case; no count or floor check exists over this dataset)
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/prev-guardrail-warning/guardrail-compliance.json`
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/prev-guardrail-warning/content-coverage.json`

**Notes:** Cites F-rerunfrom-guardrail-lane-logic-2, F-rerunfrom-guardrail-lane-logic-3, F-plan-prepare-exec-test-surface-1, F-plan-prepare-exec-test-surface-2. A1 follows from this change plus the unchanged splice: a re-dispatched lane writes its own file in the new iteration, and `splice --critique-dir` already takes the newest table (pinned by `plan-splice: (d)`). The content-coverage fixture is a negative control: its non-blocking warning must not put that lane in `rerun`.

**Acceptance criteria:**
- [x] The new case passes and the existing `plan-diff:` cases still pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-diff`
- [x] The `plan-splice:` cases still pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-splice`
- [x] A `rerun` over `prev-blocking/` stays `['lens:all', 'static-structural']` (existing case unchanged)

**Contract:**
- shape (code): `rerunFrom(prevDir, afterRoute)` keeps its signature, return type (sorted string array) and usage error. Change in `plugins/sdlc-utilities/scripts/lib/plan-critique.js`:

  ```diff
  -/** Lanes and lenses whose previous result in prevDir is blocking or unreadable: they must be re-dispatched (R67). */
  +/** Lanes and lenses whose previous result in prevDir is blocking (for guardrail-compliance: any issue) or unreadable: they must be re-dispatched (R67 (b), R77). */
   function rerunFrom(prevDir, afterRoute) {
  ...
     for (const { name } of LANE_DEFS) {
       if (!files.includes(`${name}.json`)) continue;
       if (dirty(`${name}.json`, v => isObject(v) && Array.isArray(v.issues),
  -      v => v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && i.blocking === true))) out.add(name);
  +      v => v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && (i.blocking === true || name === 'guardrail-compliance')))) out.add(name);
     }
  ```

  New fixture `prev-guardrail-warning/guardrail-compliance.json` (one line):
  ```json
  {"gateIds":["G14"],"issues":[{"gateId":"G14","severity":"warning","taskRef":null,"message":"Guardrail 'explicit-non-goals' violated: no non-goals section","blocking":false}],"passes":[],"laneStatus":"ok","guardrailCompliancePayload":"| Guardrail | Severity | Status | Rationale |\n|---|---|---|---|\n| explicit-non-goals | warning | FAIL | No non-goals section |"}
  ```

  New fixture `prev-guardrail-warning/content-coverage.json` (one line):
  ```json
  {"gateIds":["G5"],"issues":[{"gateId":"G5","taskRef":"Task 1","message":"Acceptance criterion could name the exit code","severity":"warning","blocking":false}],"passes":[],"laneStatus":"ok"}
  ```

  New case, inserted directly after `plan-diff: (rerun) iteration 1 dispatches the blocking lanes (R76)`:
  ```yaml
  - description: "plan-diff: (rerun) a warning guardrail FAIL re-runs only the guardrail lane (R67 (b), R77, TK-022)"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
      project_root: "file://fixtures-fs/plan-diff-material"
      script_args: "diff-material --before {{project_root}}/before-5.md --after {{project_root}}/before-5.md --prev-dir {{project_root}}/prev-guardrail-warning"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output); r.material === false && JSON.stringify(r.rerun) === JSON.stringify(['guardrail-compliance']) && JSON.stringify(r.dispatch.lanes) === JSON.stringify(['guardrail-compliance']) && JSON.stringify(r.recheckLanes) === JSON.stringify(['guardrail-compliance'])"
  ```
- names: `rerunFrom`, `guardrail-compliance`, fixture dir `prev-guardrail-warning`, case description prefix `plan-diff: (rerun)`.
- mirror: the case `plan-diff: (rerun) iteration 1 dispatches the blocking lanes (R76)` and fixture `prev-blocking/static-structural.json`.
- decisions: Key Decisions 1, 2 and 3.
- sync: R67 (b) text from Task 1.

### Task 3: Reword the rerun rule in the orchestrator and review-loop prompts

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — two parentheses in the R76 dispatch sentences (lines 46 and 55)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — the `rerun` sentence in Step 6
- Modify: `docs/skills/plan-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/plan-sdlc.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected

**Notes:** The check-only paths are the plan-sdlc companions that `plan.copyRules` requires for a spec change; none states the rerun rule, so none changes. `SKILL.md` only refers to the rule. Cites F-rerun-rule-wording-sites-5, F-rerun-rule-wording-sites-6, F-rerun-rule-wording-sites-7, F-rerun-rule-wording-sites-9.

**Acceptance criteria:**
- [x] All three sentences read as in the Contract
- [x] `git grep -n -e "rerun" -e "held a blocking" -- docs/skills/plan-sdlc.md site/src/data/skills-meta.ts plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` shows no statement of the rerun rule, so the check-only files stay unchanged
- [x] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern rerun-sentinels` passes
- [x] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0

**Contract:**
- shape (docs): three one-sentence edits (audience: the orchestrator and author agents), before → after:

  `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` (R76 block):
  ```diff
  -(the Step 3 lanes whose result blocked; nothing is material)
  +(the Step 3 lanes whose result blocked, and the guardrail-compliance lane when its result held any issue; nothing is material)
  ```

  `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` (R76 block, `material: false` bullet, line 55):
  ```diff
  -(the lanes whose result blocked, R76)
  +(the lanes whose result blocked, and the guardrail-compliance lane when its result held any issue, R76)
  ```

  `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` (Step 6, the line after the R64 paragraph; `<ITER_DIR>` keeps its backticks):
  ```diff
  -each lane or lens whose result in `<ITER_DIR>` held a blocking issue, so a result older than the fix
  +each lane or lens whose result in `<ITER_DIR>` held a blocking issue, and the guardrail-compliance lane when its result held any issue, so a result older than the fix
  ```
- names: `rerun`, `dispatch.lanes`, `guardrail-compliance`.
- mirror: the existing sentences at `review-loop.md:141` and `plan-critique-orchestrator.md:46` and `:55`.
- decisions: wording follows R67 (b) as Task 1 writes it; the check-only files are named only to satisfy `plan.copyRules`.
- sync: R67 (b), R76 in `docs/specs/plan-sdlc.md`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds a plan-diff exec case and fixtures; Task 3 reuses the existing rerun-sentinels case, and no stale tests were found (fragment grep) |
| no-ci-bypass | error | PASS | No step skips or disables CI; the validators are run |
| no-auto-eval | error | PASS | Only the exec-only config with --filter-pattern is used, with no retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks cover only the guardrail-lane rerun rule, its spec wording and prompt companions |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable: spec, predicate with its test, prompt wording |
| scripts-over-llm-logic | error | PASS | The rule is a deterministic predicate in plan-critique.js, not LLM instructions |
| yagni | warning | PASS | Only the guardrail-compliance lane changes; there is no generalization to other lanes |
| cross-skill-consistency | error | PASS | Spec, site copy, orchestrator and review-loop prompts are all aligned |
| pr-link-github-issue | error | PASS | Only internal ids (W-E7, TK-022, F-141) appear; no GitHub issue is involved |
| dry | warning | PASS | The rule is stated once canonically (R67 (b)) and the other sites reference it; the predicate is not duplicated |
| kiss | warning | PASS | A one-line predicate change is the simplest fix |
| spec-first | error | PASS | Task 1 updates the spec and Tasks 2 and 3 depend on it |
| project-agnostic | error | PASS | The change is in plugin code, prompts and spec, not in repo-local config |
| flag-coherence-cross-skill | error | PASS | No flags are involved |
| no-opposite-logical-vectors | error | PASS | The same wording is applied at all gate sites in the spec and prompts |
| flag-resolution-single-source | warning | PASS | No flags are involved; the rerun is resolved once in rerunFrom |
| state-premise | error | PASS | The Context section states the root problem: a stale FAIL row after a warning fix |
| smallest-viable-cut | warning | PASS | A dedicated paragraph names the minimal cut and justifies the prompt edits |
| failure-audience | warning | PASS | The Context section names plan authors and reviewers and the blast radius |
| explicit-non-goals | warning | PASS | A Non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | Key Decisions record the choices with rationale |
| state-machine-idempotency | error | PASS | The change is not migration, init or preflight logic |
| agent-dispatch-script-driven | error | PASS | Dispatch lanes come from the diff-material output (dispatch.lanes) |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added |
| workspace-mode-compatibility | error | PASS | The change is pure-function logic with no state, config or path handling, so it behaves the same in branch and worktree modes |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 changes the rerunFrom predicate in plugins/sdlc-utilities/scripts/lib/plan-critique.js so guardrail-compliance is in rerun on a non-blocking issue, which changes the contract of the diff-material output.

**Severity hint:** high

**Patch:** Check that the diff-material rerun, dispatch.lanes and recheckLanes output now includes guardrail-compliance on any previous issue, and that R67 (b) and the prompt companions match.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the diff-material rerun, dispatch.lanes and recheckLanes output now includes guardrail-compliance on any previous issue, and that R67 (b) and the prompt companions match.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-3 touch docs/specs/plan-sdlc.md, the plan-prepare-exec.yaml dataset, the new prev-guardrail-warning/ fixtures, plan-critique-orchestrator.md and review-loop.md, all outside the dimension's current triggers.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: security-review (U5)

**Why:** Task 3 edits plugins/sdlc-utilities/agents/plan-critique-orchestrator.md (the R76 dispatch parenthesis), which the plugins/**/scripts/**/*.js trigger does not match.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 rerunFrom in plan-critique.js treats the guardrail-compliance lane as needing a rerun when its previous result has any issue, warning included (TK-022 What) | Task 2 | covered |
| 2 Remove the R77 accepted-gap sentence from docs/specs/plan-sdlc.md and align R64, R67 (b), R74, R76 wording; add a spec appendix row; byte-copy the spec to site/src/content-source/specs/plan-sdlc.md | Task 1 | covered |
| 3 Add one exec case in tests/promptfoo/datasets/plan-prepare-exec.yaml covering it (A2), with a new fixture directory | Task 2 | covered |
| 4 A1: after a warning-severity guardrail FAIL is fixed, the next critique re-runs the guardrail lane and the spliced table has no stale FAIL row | Task 1, Task 2, Task 3 | covered |
| 5 Out of scope: F-144, F-146, F-170, other critique changes, register/regions/tickets/TODO notes | — | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- `rerunFrom` treats a previous guardrail-compliance result with any issue as dirty. Other lanes and the lenses keep their rules.
- After a fix of a warning-severity guardrail FAIL, the next critique round (R74 re-check or a Step 5 iteration) re-dispatches the guardrail lane. The new iteration holds a fresh guardrail result, and the R77 re-splice writes the fresh table.
- The spec states one rule in R64, R67 (b), R74, R76 and R77, and R77 no longer lists the accepted gap. The appendix has a W-E7 row. The site copy is byte-identical.
- The orchestrator and review-loop prompts state the same rule.
- `plan-prepare-exec.yaml` has one more `plan-diff: (rerun)` case, backed by the new `prev-guardrail-warning/` fixture.

## OpenSpec Appendix

Not applicable — no OpenSpec change
