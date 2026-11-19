# Audit Fixes for Review Routing and Step 7 Implementation Plan

**Commit:** `fix(#9443): plan - audit fixes for review routing and step 7`
**Goal:**
- Show the Step 7 scorecard pointer only when the scorecard holds a real verdict (#9435).
- Make a non-material Step 5 round dispatch the lenses of the current review route, not the first round's lenses (#9436).
- Make a failed `diff-material` call on the single-reviewer route dispatch the single reviewer, not the three fan-out lenses (#9437).
- Name the `--lightweight` route in the R37 skip list (PR #109 deferred low).
**Architecture:** Spec first: one task edits R36, R37, R41, R67(b), R75 and E9 in `docs/specs/plan-sdlc.md` and its site copy. One task adds a `review` field to the `diffMaterial` return in `scripts/lib/plan-critique.js`. One task updates the orchestrator agent and `review-loop.md` to read that field and to apply the new non-zero-exit rule. One task narrows the Step 7 pointer in SKILL.md and the user doc. A last task adds three exec test cases to `plan-prepare-exec.yaml`.
**Source:** conversation context (wave lean-w33 scope, tracking #9443; items #9435, #9436, #9437 and the PR #109 deferred low)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-diff: \(route\)|plan-sdlc/audit-w33"`

---

## Context

**What problem does this change solve?**

An audit of plan-sdlc at HEAD `e4e431c` found four small faults.

- Step 7 shows a "Verification Scorecard" pointer whenever the scorecard heading exists. A Lightweight plan keeps that heading with the body `Not applicable — lightweight plan`, so the pointer shows with no verdict to point at (#9435).
- Step 5 can change its review route. The route is either one reviewer (lens `all`) or three lens reviewers (the fan-out). After a fix flips the route, a later round with no material change still dispatches the first round's lenses, because the orchestrator falls back to the stale `DISPATCH` line (#9436).
- When `diff-material` fails (non-zero exit), the orchestrator dispatches every fan-out lens even on the single-reviewer route (#9437).
- Spec R37 lists when inline exploration replaces the orchestrator, but it leaves out the `--lightweight` route that R24 names.

**What prompted this change now?**

An isolated architect review confirmed the four items at HEAD `e4e431c`. This is wave A of two; wave B (lean-w34) waits for this wave because both edit `plan-prepare-exec.yaml`.

**What does success look like?**

- A Lightweight plan's handoff shows no scorecard pointer; a full-pipeline plan still shows it.
- `diff-material` returns `review: { route, lenses }` for the after plan, and the orchestrator uses `review.lenses` on a non-material round.
- A failed `diff-material` on the single-reviewer route dispatches lens `all`.
- The spec, its site copy, the skill, the agent and the user doc all say the same thing, and the targeted exec cases pass.

**Who is affected if this goes wrong?**

- Plan authors: a wrong Step 5 rule makes plan-sdlc review with the wrong lenses (too few on a fan-out plan, or three on a small plan), so a plan ships with less review or costs more.
- Ship runs and reviewers: a wrong Step 7 line shows a pointer with no verdict, which reads as a missing review.
- The failure is visible in the plan file and the critique round's dispatch; no data is lost.

**Non-goals (explicitly not built here):**

- Wave B items #9438 to #9442 and the PR #109 low on `site/src/data/skills-meta.ts` explore wording (lean-w34).
- Skipping `runExplorePack` in code under `--lightweight`; #9431 (R73 counting); #9432 to #9434; #9429; suite waves #9422 to #9428.
- A fix for the stale `DISPATCH` on a failed `diff-material` after a route flip (accepted gap, see Deviations).
- The stale header comment at `tests/promptfoo/datasets/plan-prepare-exec.yaml:9` (F-diffmaterial-after-route-dispatch-8).

## Research Findings

Every item was re-checked at HEAD `e4e431c`. All four still reproduce. The discovery brief (four code dimensions, 29 findings, no contradictions) agrees; its finding ids are cited in each task's Notes.

- **#9435.** `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md:540` says the pointer shows "when a `## Verification Scorecard` section exists in the plan file". The Lightweight adjustment in Step 0 (same file) writes that heading with the body `Not applicable — lightweight plan`, and R53 (`docs/specs/plan-sdlc.md:142`) keeps it. R41 (`docs/specs/plan-sdlc.md:138`) says only "surface the verdict line and a pointer". The user doc `docs/skills/plan-sdlc.md:539` says "At Step 7 Handoff, the verdict line is surfaced".
- **#9436.** `scripts/lib/plan-critique.js:205-219` computes `afterRoute = reviewRoute(planShape(afterText))` but returns only `{ material, triggers, details, ...sets, rerun, dispatch, recheckLanes }`. `reviewRoute` (`plan-critique.js:131-135`) returns `{ route: 'fan-out', lenses: ['architecture', 'requirements', 'risk'] }` or `{ route: 'single', lenses: ['all'] }`. The orchestrator (`agents/plan-critique-orchestrator.md:47`) says "`material: false`: dispatch the lenses of `DISPATCH` only", and `review-loop.md:24` fills `DISPATCH` from `plan.js tier` at every iteration. So after a flip, a non-material round reviews with the old route's lenses.
- **#9437.** `agents/plan-critique-orchestrator.md:48` and `review-loop.md:130` both say a non-zero `diff-material` exit dispatches "every `lensReviewers[]` entry", which is the fan-out set, even when the round's route is single.
- **R37.** SKILL.md Step 1 (`:188`) repeats the same short list (F-r37-skip-list-lightweight-route-5). `docs/specs/plan-sdlc.md:79` reads "When the orchestrator path is skipped (lightweight scope ≤3 files or error fallback per R28)". R24 (`:76`) says "Lightweight scope (≤3 files) or the `--lightweight` route (A5) skips the orchestrator".
- **Spec copy.** `site/src/content-source/specs/plan-sdlc.md` and `site/src/content-source/skills/plan-sdlc.md` are byte copies of their `docs/` sources (`cmp` shows no difference). They are refreshed with `cp`.
- **Tests.** `tests/promptfoo/datasets/plan-prepare-exec.yaml` holds 13 `plan-diff:` cases (`:740-812`). The case "plan-diff: (route) fan-out plan keeps per-lens rerun" (`:803`) already uses `after-route-flip.md` as both before and after. Skill-text cases count literal sentences with an inline `node -e` script (for example `plan-sdlc/tasks-heading` at `:1236`). No count or floor check reads this dataset (Grep for `plan-prepare-exec` finds only `promptfooconfig-exec.yaml:43`).
- **Sentinels.** `tests/promptfoo/scripts/check-plan-critique-orchestrator.js` checks for `diff-material` in the orchestrator but not for the lines this plan rewrites. The `plan-sdlc/lightweight-sentinels` case needs `dispatch.lenses` at least once in `review-loop.md`; the rewrite keeps it.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Planning route | no | runs the full pipeline at `--quality balanced`, not `--lightweight` | items #9436 and #9437 change which lenses the Step 5 critique dispatches, and the wave brief says a dispatch change takes the full pipeline |
| R36 and R75 edits | no | adds the non-material and non-zero-exit dispatch rules to R36 and R75 as well as R67(b) | spec first: R36 and R75 state the Step 5 dispatch rule, so they must name the new rule too |
| User doc line | no | edits `docs/skills/plan-sdlc.md:539` and its site copy | R71: a skill behaviour change lists every file that documents it for users |
| Copy-rule files | no | lists `skills-meta.ts` and the four other plan-sdlc companion `.md` files under Files with no change expected | `plan.copyRules` requires each one under some task's Files when the spec or SKILL.md changes; each was checked and states none of the changed behaviour |
| Site copy refresh | no | refreshes each site copy with `cp` of its one file, not `site/scripts/copy-docs.mjs` | the brief suggests either; project notes forbid `copy-docs.mjs` because it copies the whole tree |
| Stale DISPATCH on a non-zero exit | no | keeps the architect's rule (lens `all` when `DISPATCH` names `all`) | a failed `diff-material` returns no route; `DISPATCH` is the only route signal left. Accepted gap: after a route flip, a failed call can still use the old route once |

## Key Decisions

- **Return the route from `diff-material`, not re-run `plan.js tier`.** The orchestrator already runs `diff-material` on every Step 5 round after the first. Adding `review` to its output costs nothing. A second `tier` call would add a Bash call per round and a second source of truth.

- **Keep `DISPATCH` as the first-round input.** At iteration 1 no `diff-material` runs, so `DISPATCH` from `plan.js tier` is still correct there. Only later rounds switch to `review.lenses`.

- **On a non-zero exit, read the route from `DISPATCH`.** The script failed, so it gives no route. `DISPATCH` names `all` on the single route. Dispatching lens `all` there keeps one reviewer, as R36 asks. The fan-out case is unchanged.

- **Condition the Step 7 pointer on the verdict label, not on the route.** The skill could check `flags.lightweight` instead. But an escalated Lightweight run (R73) does run Gate B and does get a verdict. Checking for one of the three verdict labels is right on every route.

- **One task per shared file.** The spec, its site copy and the dataset each belong to exactly one task. This keeps the first execute wave free of file conflicts (ledger F-43).

## Contract Examples

### Code

```markdown
**Contract:**
- shape (code): `diffMaterial(...)` returns `{ material, triggers, details, affectedGates, affectedLanes, rerun, dispatch, recheckLanes, review }`; `review` is `{ route: 'single'|'fan-out', lenses: string[] }` for the after plan.
- names: `review`, `afterRoute`.
- mirror: `tierCheck` return of `review` at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:139-150`.
- decisions: reuse the `afterRoute` value already computed (Key Decisions: return the route from `diff-material`).
- sync: R67(b) in `docs/specs/plan-sdlc.md` lists the field.
```

### Docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` Gate B section, last paragraph: the verdict line shows at Step 7 only when the scorecard holds a verdict label.
- names: section `### Gate B — Verification Scorecard (R40 — Fixes #445)`.
- mirror: the paragraph style at `docs/skills/plan-sdlc.md:539`.
- decisions: one added clause; no new section.
- sync: `site/src/content-source/skills/plan-sdlc.md` byte copy.
```

### OpenSpec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY `R41`, `R37`, `R36`, `R67(b)`, `R75`, `E9` in `docs/specs/plan-sdlc.md`; no new ids.
- names: `R36`, `R37`, `R41`, `R67`, `R75`, `E9`.
- mirror: requirement bullet style at `docs/specs/plan-sdlc.md:76-79`.
- decisions: modify in place; ids stay stable.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.
```

## Tasks

### Task 1: Spec clauses for the four fixes

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R36, R37, R41, R67(b), R75 and E9 clauses
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec (refresh with `cp`)
- Modify: `site/src/data/skills-meta.ts` — no change expected; listed for the copy rule (checked: `:42` and `:47` describe the re-check and the scorecard, not the changed lines)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — no change expected; listed for the copy rule (checked: no pointer, `diff-material` or lens text)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — no change expected; listed for the copy rule (checked: section list only)

**Notes:** Spec first: the later tasks cite these clauses. All edits modify existing ids in place; no id is added, renumbered or reused. Findings: F-gate-b-scorecard-pointer-condition-3, F-diffmaterial-after-route-dispatch-6, F-single-reviewer-fallback-dispatch-5, F-single-reviewer-fallback-dispatch-6, F-r37-skip-list-lightweight-route-1, F-r37-skip-list-lightweight-route-2.

**Acceptance criteria:**
- [ ] R41 says the Step 7 pointer shows only when `## Verification Scorecard` holds one of the three verdict labels, and is omitted on a `Not applicable` body.
- [ ] R37 names `the --lightweight route (A5)` in its skip list.
- [ ] R36 and R75 say a non-material later round dispatches `diff-material` `review.lenses`, and a non-zero `diff-material` exit dispatches every lane plus lens `all` when `DISPATCH` names `all`, otherwise every `lensReviewers[]` entry.
- [ ] R67(b) lists `review` in the `diff-material` return shape and says what it holds.
- [ ] E9 names the non-zero-exit dispatch set by pointing to R36.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `git diff --stat` shows no change to `site/src/data/skills-meta.ts`, `state-format.md` or `plan-template-default.md`.

**Contract:**
- shape (openspec): MODIFY these clauses in `docs/specs/plan-sdlc.md` (before → after):

  ```diff
  R37:
  - When the orchestrator path is skipped (lightweight scope ≤3 files or error fallback per R28), inline exploration
  + When the orchestrator path is skipped (lightweight scope ≤3 files, the `--lightweight` route (A5), or error fallback per R28), inline exploration

  R41:
  - At Step 7 (Handoff), surface the verdict line and a pointer to `## Verification Scorecard` above the existing workflow continuation menu.
  + At Step 7 (Handoff), surface the verdict line and a pointer to `## Verification Scorecard` above the existing workflow continuation menu, only when that section holds one of the three verdict labels; on a `Not applicable` body (a Lightweight plan, R53) omit the pointer.

  R36:
  - later iterations use `diff-material` `dispatch.lenses` (R67).
  + later iterations use `diff-material` `dispatch.lenses` after a material fix and its `review.lenses` after a non-material one (R67); on a non-zero `diff-material` exit they dispatch every lane plus lens `all` when the round's `DISPATCH` names `all`, otherwise every `lensReviewers[]` entry (E9).

  R67(b):
  - → `{ material, triggers, details, affectedGates, affectedLanes, rerun, dispatch: { lanes, lenses }, recheckLanes }`,
  + → `{ material, triggers, details, affectedGates, affectedLanes, rerun, dispatch: { lanes, lenses }, recheckLanes, review }`,
    ... and, after the `dispatch` sentence, add: `review` is `{ route, lenses }` of the after plan (R36), the same shape as `tier`'s `review`; a non-material Step 5 round dispatches its `lenses`.

  R75:
  - (Step 3: every lane; R74: `recheckLanes`; Step 5: `tier.review.lenses`, or `diff-material` `dispatch` after a fix)
  + (Step 3: every lane; R74: `recheckLanes`; Step 5: `tier.review.lenses`, then `diff-material` `dispatch` after a material fix or its `review.lenses` after a non-material one)

  E9:
  - a non-zero `plan.js diff-material` exit counts as a material change with `affectedLanes: ["*"]` (R64).
  + a non-zero `plan.js diff-material` exit counts as a material change with `affectedLanes: ["*"]` (R64) and dispatches the set R36 names for it.
  ```

- names: `R36`, `R37`, `R41`, `R67`, `R75`, `E9`; field `review`.
- mirror: R24 wording of the `--lightweight` route at `docs/specs/plan-sdlc.md:76`; the `tier` `review` field in R73.
- decisions: modify in place (ids are stable anchors, AGENTS.md); R36 carries the lens rule and E9 points to it, so the rule is stated once.
- sync: `site/src/content-source/specs/plan-sdlc.md` must be a byte copy (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`; never run `site/scripts/copy-docs.mjs`).

### Task 2: Return the review route from diff-material

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — add `review: afterRoute` to the `diffMaterial` return and its JSDoc

**Notes:** `afterRoute` is already computed for the `reviewRoute` trigger, so this is a one-field change. The test case for it is added in Task 5, which owns the dataset file. `plan.js` prints the return verbatim and needs no change. Findings: F-diffmaterial-after-route-dispatch-1, F-diffmaterial-after-route-dispatch-2, F-diffmaterial-after-route-dispatch-3, F-diffmaterial-after-route-dispatch-9.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/skill/plan.js diff-material --before tests/promptfoo/fixtures-fs/plan-diff-material/after-route-flip.md --after tests/promptfoo/fixtures-fs/plan-diff-material/after-route-flip.md` prints JSON with `material: false` and `review` equal to `{"route":"fan-out","lenses":["architecture","requirements","risk"]}`.
- [ ] Every existing `plan-diff:` case still passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-diff:"`.

**Contract:**
- shape (code): the last line of `diffMaterial` in `plugins/sdlc-utilities/scripts/lib/plan-critique.js` changes:

  ```diff
    const material = triggers.length > 0;
  - return { material, triggers, details, ...sets, rerun, dispatch, recheckLanes: material ? dispatch.lanes : [] };
  + return { material, triggers, details, ...sets, rerun, dispatch, recheckLanes: material ? dispatch.lanes : [], review: afterRoute };
  ```

  The JSDoc line above `function diffMaterial`:

  ```diff
  - /** Compare two plan texts: { material, triggers, details, affectedGates, affectedLanes, rerun, dispatch, recheckLanes }. */
  + /** Compare two plan texts: { material, triggers, details, affectedGates, affectedLanes, rerun, dispatch, recheckLanes, review }. */
  ```

  `review` is `{ route: 'fan-out', lenses: ['architecture', 'requirements', 'risk'] }` or `{ route: 'single', lenses: ['all'] }` (the `reviewRoute` value of the after plan). No other output field changes; exit codes stay 0/1/2.
- names: `review`, `afterRoute`, `diffMaterial`.
- mirror: `tierCheck` returns `review` from the same `reviewRoute` helper at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:139-150`.
- decisions: reuse `afterRoute` (Key Decisions: return the route from `diff-material`).
- sync: R67(b) (Task 1) names the field; the orchestrator and `review-loop.md` (Task 3) read it.

### Task 3: Orchestrator and review loop read review.lenses

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — Step 2 `material: false` and non-zero-exit lines, and the `DISPATCH` input line
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — line 24 lens source and the fallback rule at line 130

**Notes:** Implements R36, R67(b), R75 and E9 (Task 1). The non-zero-exit rule keeps `DISPATCH` as the route signal because the failed script gives none; the accepted gap is in Deviations. The `lightweight-sentinels` case needs `dispatch.lenses` in `review-loop.md`, so keep that text. Findings: F-diffmaterial-after-route-dispatch-4, F-diffmaterial-after-route-dispatch-5, F-single-reviewer-fallback-dispatch-1, F-single-reviewer-fallback-dispatch-2, F-single-reviewer-fallback-dispatch-4, F-single-reviewer-fallback-dispatch-8.

**Acceptance criteria:**
- [ ] The orchestrator's Step 2 holds the two new lines of the Contract verbatim, and no longer holds "dispatch the lenses of `DISPATCH` only" or the old non-zero-exit line.
- [ ] `review-loop.md` holds the new line-24 sentence and the new fallback clause verbatim.
- [ ] The existing sentinel cases still pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/"`.

**Contract:**
- shape (docs): before → after edits.

  `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`, Step 2:

  ```diff
  - - `material: false`: dispatch the lenses of `DISPATCH` only.
  - - Non-zero exit: count it as material and dispatch every lane of `lanes[]` and every `lensReviewers[]` entry, and pass no `--carry` (E9).
  + - `material: false`: dispatch the lenses of its `review.lenses` only (the review route of the plan as it is now, R36).
  + - Non-zero exit: count it as material and dispatch every lane of `lanes[]`, plus lens `all` when `DISPATCH` names `all`, otherwise every `lensReviewers[]` entry, and pass no `--carry` (E9).
  ```

  Same file, the `DISPATCH` input line under the inputs list:

  ```diff
  - - **DISPATCH**: JSON `{ "lanes": [<lane names>], "lenses": [<lens names, or "all">] }`: what this round dispatches (Step 3: every lane; R74: `recheckLanes`; Step 5: `tier` `review.lenses`)
  + - **DISPATCH**: JSON `{ "lanes": [<lane names>], "lenses": [<lens names, or "all">] }`: what this round dispatches (Step 3: every lane; R74: `recheckLanes`; Step 5: `tier` `review.lenses`, used as is only when no `diff-material` runs, see Step 2)
  ```

  `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md:24`:

  ```diff
  - Later iterations take the lenses from `diff-material`'s `dispatch.lenses` when the Step 6 fixes were material (the orchestrator runs `diff-material`; on the fallback path you run it in Step 6).
  + Later iterations take the lenses from `diff-material`'s `dispatch.lenses` when the Step 6 fixes were material, and from its `review.lenses` when they were not, so a review-route flip takes effect in every later round (the orchestrator runs `diff-material`; on the fallback path you run it in Step 6).
  ```

  `review-loop.md:130`, the fallback rule:

  ```diff
  - Set `materialChangeDetected` to its `material` value and keep its `dispatch` and `affectedLanes` for the merged re-dispatch; on a non-zero exit set `materialChangeDetected` to `true`, `affectedLanes` to `["*"]`, `dispatch.lanes` to every Step 3 lane and `dispatch.lenses` to every `lensReviewers[]` entry (E9).
  + Set `materialChangeDetected` to its `material` value and keep its `dispatch`, `affectedLanes` and `review` for the next round (`review.lenses` are the lenses of a non-material round); on a non-zero exit set `materialChangeDetected` to `true`, `affectedLanes` to `["*"]`, `dispatch.lanes` to every Step 3 lane and `dispatch.lenses` to `["all"]` when this iteration dispatched lens `all`, otherwise every `lensReviewers[]` entry (E9).
  ```

- names: `review.lenses`, `DISPATCH`, `lensReviewers[]`, lens `all`, `materialChangeDetected`.
- mirror: the existing Step 2 bullet list at `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:46-48`.
- decisions: Key Decisions "Keep `DISPATCH` as the first-round input" and "On a non-zero exit, read the route from `DISPATCH`".
- sync: the two sentences "dispatch the lenses of its `review.lenses` only" and "plus lens `all` when `DISPATCH` names `all`" are counted by the Task 5 case; SKILL.md needs no change (it points to `review-loop.md` for Steps 5–6; checked); `docs/skills/plan-sdlc.md:89` describes material re-dispatch only and needs no change (checked).

### Task 4: Step 7 pointer only on a verdict label

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 7 Gate B pointer condition and the Step 1 inline-path line (R37)
- Modify: `docs/skills/plan-sdlc.md` — Gate B paragraph, Step 7 sentence
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy of the user doc (refresh with `cp`)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — no change expected; listed for the copy rule (checked: its `verdict` lines are Gate A, not Step 7)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — no change expected; listed for the copy rule (checked: `:47` and `:536` describe the scorecard, not the Step 7 pointer)

**Notes:** Implements R41 and R37 (Task 1); conditioning on the label, not the route, keeps the pointer for an escalated Lightweight run. Findings: F-gate-b-scorecard-pointer-condition-1, F-gate-b-scorecard-pointer-condition-2, F-r37-skip-list-lightweight-route-5, F-r37-skip-list-lightweight-route-6.

**Acceptance criteria:**
- [ ] SKILL.md Step 7 holds the sentence `Show this line only when the section holds one of the three verdict labels below; on a \`Not applicable\` body (a Lightweight plan) omit it.` exactly once.
- [ ] `docs/skills/plan-sdlc.md` says the verdict line is surfaced only when the scorecard holds a verdict label.
- [ ] SKILL.md Step 1 says `On the inline path (lightweight scope, the \`--lightweight\` route or error fallback)`.
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` prints nothing.
- [ ] `git diff --stat` shows no change to `openspec-flow.md` or `plan-format-reference.md`.

**Contract:**
- shape (code): SKILL.md Step 7, `**Gate B scorecard pointer:**` paragraph:

  ```diff
  - **Gate B scorecard pointer:** Before the plan-mode or normal-mode branch below, when a `## Verification Scorecard` section exists in the plan file (i.e., Gate B ran during Step 5), surface a one-line verdict reference above the `ship` / `execute` / `done` menu: <!-- implements R41 -->
  + **Gate B scorecard pointer:** Before the plan-mode or normal-mode branch below, when a `## Verification Scorecard` section exists in the plan file (i.e., Gate B ran during Step 5), surface a one-line verdict reference above the `ship` / `execute` / `done` menu. Show this line only when the section holds one of the three verdict labels below; on a `Not applicable` body (a Lightweight plan) omit it. <!-- implements R41 -->
  ```

  SKILL.md Step 1, the R37 line:

  ```diff
  - On the inline path (lightweight scope or error fallback), issue Read, Glob and Grep calls that do not depend on each other in one message. <!-- implements R37 -->
  + On the inline path (lightweight scope, the `--lightweight` route or error fallback), issue Read, Glob and Grep calls that do not depend on each other in one message. <!-- implements R37 -->
  ```

  `docs/skills/plan-sdlc.md:539`: `At Step 7 Handoff, the verdict line is surfaced above the \`ship\` / \`execute\` / \`done\` menu.` → `At Step 7 Handoff, the verdict line is surfaced above the \`ship\` / \`execute\` / \`done\` menu when the scorecard holds a verdict label; a Lightweight plan's \`Not applicable\` scorecard shows no pointer.`
- names: `**Gate B scorecard pointer:**`, `Not applicable`.
- mirror: the existing "When no scorecard is present ... omit this line entirely." sentence at `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md:546`.
- decisions: condition on the label (Key Decisions).
- sync: `site/src/content-source/skills/plan-sdlc.md` byte copy (`cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`); `site/src/data/skills-meta.ts:47` describes the scorecard only and needs no change (checked); `docs/skills/plan-sdlc.md:69` already names the `--lightweight` route (checked).

### Task 5: Exec test cases for the fixes

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 3, Task 4
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add one `plan-diff:` case and one skill-text case

**Notes:** One task owns the dataset so the first execute wave has no shared file. Findings: F-gate-b-scorecard-pointer-condition-5, F-diffmaterial-after-route-dispatch-7, F-diffmaterial-after-route-dispatch-8, F-single-reviewer-fallback-dispatch-7. No count or floor check reads this dataset (Research Findings), so no count changes; the dataset grows from 112 to 114 cases.

**Acceptance criteria:**
- [ ] The two cases below are in the dataset: the `plan-diff:` case after `plan-diff: (route) fan-out plan keeps per-lens rerun`, the skill-text case after `plan-sdlc/critique-rounds`.
- [ ] Both pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-diff: \(route\)|plan-sdlc/audit-w33"`.

**Contract:**
- shape (code): two YAML cases.

  ```yaml
  - description: "plan-diff: (route) non-material round returns the after plan's review route (R36, R67 (b), #9436)"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
      project_root: "file://fixtures-fs/plan-diff-material"
      script_args: "diff-material --before {{project_root}}/after-route-flip.md --after {{project_root}}/after-route-flip.md"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output); r.material === false && r.review.route === 'fan-out' && JSON.stringify(r.review.lenses) === JSON.stringify(['architecture', 'requirements', 'risk'])"

  - description: "plan-sdlc/audit-w33: Step 7 pointer condition, review.lenses and the non-zero-exit lens rule (R41, R36, E9, #9435, #9437)"
    vars:
      script_path: "-e"
      script_args: '((r)=>((s,o,l)=>((c)=>console.log(JSON.stringify({pointer:c(s,"Show\x20this\x20line\x20only\x20when\x20the\x20section\x20holds\x20one\x20of\x20the\x20three\x20verdict\x20labels\x20below"),nonMaterial:c(o,"dispatch\x20the\x20lenses\x20of\x20its\x20\x60review.lenses\x60\x20only"),nonZero:c(o,"plus\x20lens\x20\x60all\x60\x20when\x20\x60DISPATCH\x60\x20names\x20\x60all\x60"),loopReview:c(l,"and\x20from\x20its\x20\x60review.lenses\x60\x20when\x20they\x20were\x20not"),loopAll:c(l,"\x60dispatch.lenses\x60\x20to\x20\x60[\x22all\x22]\x60\x20when\x20this\x20iteration\x20dispatched\x20lens\x20\x60all\x60"),old:c(o,"dispatch\x20the\x20lenses\x20of\x20\x60DISPATCH\x60\x20only")})))((t,x)=>t.split(x).length-1))(r("{{repo_root}}/plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md","utf8"),r("{{repo_root}}/plugins/sdlc-utilities/agents/plan-critique-orchestrator.md","utf8"),r("{{repo_root}}/plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md","utf8")))(require("fs").readFileSync)'
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          if (o.pointer === 1 && o.nonMaterial === 1 && o.nonZero === 1 && o.loopReview === 1 && o.loopAll === 1 && o.old === 0) return true;
          return { pass: false, score: 0, reason: output };
  ```

  The script was run at HEAD `e4e431c` (with the absolute repo path for `{{repo_root}}`) and printed `{"pointer":0,"nonMaterial":0,"nonZero":0,"loopReview":0,"loopAll":0,"old":1}`, so it fails before Tasks 3 and 4 and passes after. It counts: `pointer` in SKILL.md; `nonMaterial`, `nonZero` and the removed line `old` in the orchestrator; `loopReview` and `loopAll` in `review-loop.md`. It encodes spaces as `\x20`, backticks as `\x60` and double quotes as `\x22`, as the `tasks-heading` case does.
- names: case descriptions `plan-diff: (route) non-material round returns the after plan's review route (R36, R67 (b), #9436)` and `plan-sdlc/audit-w33: ...`.
- mirror: `plan-diff: (route) fan-out plan keeps per-lens rerun` at `tests/promptfoo/datasets/plan-prepare-exec.yaml:803-810`; `plan-sdlc/tasks-heading` at `:1236-1245`.
- decisions: the filter `plan-diff: \(route\)|plan-sdlc/audit-w33` selects the new cases plus the two existing route cases; the regex escapes the parentheses and its alternation `|` is a regex operator, not a literal.
- sync: the counted strings must match Tasks 3 and 4 byte for byte.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 5 adds exec cases covering Tasks 2-4. Existing plan-diff and sentinel cases are re-run, and the sentinel check does not read the rewritten lines. |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled. Task 1 runs validate-spec-shape with --strict. |
| no-auto-eval | error | PASS | Verification uses exec-only config (promptfooconfig-exec.yaml) with targeted filters and no retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to #9435, #9436, #9437 or the R37 deferred low. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable. Spec, script, agent and loop docs, skill and user doc, and tests are split out. |
| scripts-over-llm-logic | error | PASS | The route is computed in the diffMaterial script and read by the orchestrator, which removes the stale-DISPATCH LLM fallback. |
| yagni | warning | PASS | The only new field is `review`, which a consumer needs now. |
| cross-skill-consistency | error | PASS | The change touches plan-sdlc only. The orchestrator, review-loop, spec, user doc and site copies are all synced. |
| pr-link-github-issue | error | PASS | The commit header and Source reference #9443, #9435, #9436 and #9437. |
| dry | warning | PASS | `review` reuses the existing afterRoute value. The rule is stated once in R36, and E9 points to it. |
| kiss | warning | PASS | A one-field return change plus text edits. |
| spec-first | error | PASS | Task 1 updates the spec clauses and is listed before the SKILL.md, agent and review-loop edits that implement them. |
| project-agnostic | error | PASS | All changes are in plugin code and docs. |
| flag-coherence-cross-skill | error | PASS | No flag gating is added. The Step 7 pointer conditions on a verdict label. |
| no-opposite-logical-vectors | error | PASS | The pointer and inline-path conditions are each stated once per concept. |
| flag-resolution-single-source | warning | PASS | No flag is re-derived. The route comes from the script's `review` field. |
| state-premise | error | PASS | The Context section states the problem: four audited faults at HEAD e4e431c. |
| smallest-viable-cut | warning | PASS | The plan is already minimal at five tasks. Deviations justifies the extra spec, doc and site-copy edits. |
| failure-audience | warning | PASS | Context "Who is affected if this goes wrong?" names plan authors, ship runs and reviewers. |
| explicit-non-goals | warning | PASS | Context lists the non-goals. |
| ambiguity-stops-and-asks | error | PASS | Key Decisions records the choices between the viable patterns (script `review` field vs re-running `tier`, verdict label vs route) with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | Dispatch lenses come from script output (`review.lenses`, `dispatch.lenses`, `DISPATCH`). |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added. |
| workspace-mode-compatibility | error | PASS | No state, config, path or git logic is touched. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 changes `plugins/sdlc-utilities/scripts/lib/plan-critique.js` so `diffMaterial` returns a new `review: afterRoute` field, which changes the CLI JSON output contract that the orchestrator consumes.

**Severity hint:** high

**Patch:** Check that the `plan.js diff-material` JSON output adds `review: { route, lenses }` and that spec R67(b) and its consumers stay in sync.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the `plan.js diff-material` JSON output adds `review: { route, lenses }` and that spec R67(b) and its consumers stay in sync.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** The plan edits several markdown files (for example Task 1's `docs/specs/plan-sdlc.md` and Task 3's `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`), which the script flags as outside code-quality's current triggers.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: security-review (U5)

**Why:** Task 3 modifies `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`, which changes its dispatch fallback rule and sits outside the current `plugins/**/scripts/**/*.js` trigger.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9435: Step 7 Gate B pointer only on a verdict label; R41 spec and site copy; skill-text exec case | Task 1, Task 4, Task 5 | covered |
| 2 #9436: diffMaterial returns review: afterRoute; orchestrator and review-loop use review.lenses; R67(b); plan-diff exec case | Task 1, Task 2, Task 3, Task 5 | covered |
| 3 #9437: non-zero diff-material exit dispatches every lane plus lens all or every lensReviewers[] entry; skill-text count | Task 1, Task 3, Task 5 | covered |
| 4 R37 skip list adds the --lightweight route (A5), spec and site copy | Task 1, Task 4 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all five tasks are done:

- `plan.js diff-material` prints a `review` field with the route and lenses of the plan after the fix.

- On a Step 5 round with no material change, the critique orchestrator reviews with `review.lenses`. A route flip now holds for every later round.

- When `diff-material` fails on the single-reviewer route, the orchestrator dispatches the single reviewer (lens `all`), not three lenses.

- At Step 7, a Lightweight plan shows no scorecard pointer. A plan with a real verdict still shows it.

- The spec (R36, R37, R41, R67(b), R75, E9), its site copy, the user doc and its site copy match the new behaviour.

- Two new exec cases guard the change.

## OpenSpec Appendix

Not applicable — no OpenSpec change
