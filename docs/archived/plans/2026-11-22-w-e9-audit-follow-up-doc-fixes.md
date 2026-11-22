# W-E9 Audit Follow-up Doc and Spec Fixes Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #150, 57f9dd9

**Commit:** `fix(W-E9): ship-sdlc - audit follow-up doc and spec fixes`
**Goal:** Close three post-merge audit lows with doc and spec text only:
- the ship-sdlc user doc states the deferred-Monitor rule as the spec and SKILL.md do (TK-026, F-196);
- the ship-sdlc spec names its tests on R92 and P-STEP-2, and SKILL.md cites P-STEP-2 on the mktemp step (TK-028, F-197);
- `docs/cost-tiers.md` lists the 60 s `--timeout` of the wave wait (TK-027, F-198).
**Architecture:** Three independent tasks in one execute wave. No two tasks share a file. Each edited `docs/` file is copied byte for byte to its site copy with `cp` in the same task. No script, test or behaviour changes.
**Source:** docs/plans/programme.md#W-E9
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern ship-sdlc/tool-handling`

---

## Context

**What problem does this change solve?**

- The ship-sdlc user doc says ship loads Monitor and TaskStop "when Monitor is a deferred tool". The spec (R92) and SKILL.md say "when `Monitor` or `TaskStop` is listed as a deferred tool". The two rules differ when only TaskStop is deferred.
- The ship-sdlc spec does not name the exec cases that test R92 and P-STEP-2. The SKILL.md mktemp step cites no spec id.
- The cost-tiers table of execute wave wait values has no row for the `--timeout` of at most 60 s that the skill passes once some workers have returned.

**What prompted this change now?**

- The post-merge audit of W-E8 found these three lows. The owner scheduled them as one doc fix wave (decision PD-8, unit W-E9, tickets TK-026, TK-027, TK-028).

**What does success look like?**

- Each ticket's acceptance items hold (see the tasks).
- Every edited `docs/` file is byte-equal to its site copy (`cmp` exits 0).
- The exec cases `ship-sdlc/tool-handling` still pass, and the validators stay green.

**Non-goals.**

- No behaviour change in any skill or script.
- The TODO note `pr-step-gh-in-main-checkout.md` and every other register unit are out of scope.
- No edit of the register, ticket files or TODO notes (the main session closes them).

## Research Findings

All items were re-verified at HEAD `6e49bc4` (branch `main`). Every item still reproduces, so none is dropped.

- **TK-026 reproduces.** `docs/skills/ship-sdlc.md:229` reads "When Monitor is a deferred tool, ship first loads Monitor and TaskStop with ToolSearch." The spec `docs/specs/ship-sdlc.md:408` (R92) and `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:274` read "When `Monitor` or `TaskStop` is listed as a deferred tool". The ticket cites SKILL.md:276; the sentence is at line 274 at HEAD.
- **TK-028 reproduces.** `docs/specs/ship-sdlc.md:409` (R92 Acceptance) reads "exec case `execute-plan-sdlc/liveness/wave-watch:`; sentinel `execute-plan-sdlc/handback:` (ship SKILL.md names `wave-watch`)." It does not name the `ship-sdlc/tool-handling:` cases. `docs/specs/ship-sdlc.md:347` (P-STEP-2) has no Acceptance line. `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:278` (Step 5 item 6, the mktemp step) cites no spec id.
- **The tool-handling exec cases.** `tests/promptfoo/datasets/ship-sdlc-exec.yaml:62` is "ship-sdlc/tool-handling: mktemp result file is read once before the Write (P-STEP-2, plan-sdlc R71(a))". Line 72 is "ship-sdlc/tool-handling: TodoWrite is guarded and a deferred Monitor is loaded with ToolSearch (R-todowrite-visibility, R92)". Both run `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js`.
- **Sentinel needles in SKILL.md.** The probe counts exact substrings of SKILL.md. The mktemp needle is `Read that empty file once (the Write tool refuses a file that was not read)` (count 1). The old-text needle is `note the printed path; write` (count 0). A citation must not split the first needle. Run at HEAD: `node tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` prints `{"ok":true,"counts":{"mktempRead":1,"mktempOld":0,"todoGuard":2,"todoOld":0,"deferredLoad":1}}` and exits 0. So the case is a declared pin, not a red test.
- **TK-027 reproduces.** The table `### execute-plan-sdlc wave wait tuning` in `docs/cost-tiers.md` (rows at lines 143-153) has no `--timeout` row for the skill's value. `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:390` and `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md:104` say "pass `--timeout` of at most 60". `docs/specs/execute-plan-sdlc.md:206` (R92) says these tuning values are listed in `docs/cost-tiers.md` §5.
- **Byte copies.** `cmp` shows `site/src/content-source/skills/ship-sdlc.md`, `site/src/content-source/specs/ship-sdlc.md` and `site/src/content-source/cost-tiers.md` byte-equal to their sources at HEAD.
- **Old-literal grep (F-55, F-180, F-192).** Task 2 rewrites one sentence. Fragments were grepped over the repository (`git grep -nF -e "Monitor is a deferred" -e "first loads Monitor" -e "loads Monitor and TaskStop" -e "is a deferred tool"`, and `git grep -nF -e "first loads" -e "is a deferred tool" -e "Monitor~is" -- tests .claude plugins`). Hits: `docs/skills/ship-sdlc.md:229` and its site copy `site/src/content-source/skills/ship-sdlc.md:229` (edited by Task 2); history files that keep the old text on purpose (`docs/TODO/archive/ship-doc-deferred-monitor-wording.md:5`, `docs/archived/plans/2026-11-22-w-e8-ship-skill-tool-handling-and-copy.md:185`, `docs/tickets/TK-026-ship-doc-monitor-wording/ticket.md:13`, `docs/tickets/TK-026-ship-doc-monitor-wording/ticket.md:17`). No test, check script or plugin file holds the old text.
- **Cost-tiers validator.** `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js:136-211` parses only the Skill and Agent tables (§3, §4). A new row in the §5 wave wait table is not checked by it.
- **Count checks.** No dataset case is added, moved or removed, so no count check and no `tests/promptfoo/baselines/spec-id-coverage.json` refresh is needed.
- **Copy rules (`.sdlc/config.json` `plan.copyRules`).** A change to ship-sdlc's SKILL.md or spec requires `docs/skills/ship-sdlc.md`, its site copy, `site/src/data/skills-meta.ts` and the companion files `plugins/sdlc-utilities/skills/ship-sdlc/*.md`. Task 2 edits the doc and its site copy. Task 1 lists `skills-meta.ts` and the five companions as check only. The companions and `skills-meta.ts` do not mention mktemp, P-STEP-2 or the R92 Acceptance cases.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| SKILL.md line | no | cites P-STEP-2 at Step 5 item 6, which is line 278 at HEAD | the ticket names line 278; the line still holds the mktemp step |
| Citation place | no | puts `(P-STEP-2)` after "note the printed path", before the sentinel needle | the sentinel probe counts the needle `Read that empty file once (…)`; a citation inside it would fail the case |
| Issue trail | no | adds no row to the spec's `### Issue trail` table | Acceptance lines and a citation change no behaviour; the trail records behaviour changes |
| Plan route | no | plans on the Lightweight route | the scope changes no gate or dispatch and adds no deny or guard rule |

## Key Decisions

- **Three tasks, one wave.** The alternative is one task for both ship-sdlc tickets. Each ticket keeps its own task and its own `**Ticket:**` line. No two tasks share a file, so all three run in parallel (F-43).

- **The mktemp citation goes before the sentinel text.** The alternative is to append it at the end of item 6. The chosen place keeps the citation next to the mktemp words it explains, and it leaves every sentinel needle whole.

- **The new cost-tiers row sits right after the `--grace passed by the skill` row.** Both rows are values that the skill passes, defined in the same two files. Keeping them together makes the table easy to scan.

## Contract Examples

Openspec / spec (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY the Acceptance line of R92; ADD an Acceptance line under P-STEP-2 in `docs/specs/ship-sdlc.md`; no new id.
- names: `R92`, `P-STEP-2`.
- mirror: the Acceptance sub-bullet style at `docs/specs/ship-sdlc.md:409`.
- decisions: no new requirement id; no issue-trail row.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy; SKILL.md item 6 cites `P-STEP-2`.
```

Docs (Task 2):

```markdown
**Contract:** shape (docs): one sentence on the R92 bullet of `docs/skills/ship-sdlc.md`; names: `Monitor`, `TaskStop`, `ToolSearch`; sync: `site/src/content-source/skills/ship-sdlc.md` byte copy
```

## Tasks

### Task 1: Ship spec Acceptance lines for R92 and P-STEP-2, SKILL.md cites P-STEP-2
**Ticket:** TK-028 @d7c4195e

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests, manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — extend the R92 Acceptance line, add a P-STEP-2 Acceptance line
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec (`cp`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — cite `P-STEP-2` in Step 5 item 6
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected
- Test: `tests/promptfoo/datasets/ship-sdlc-exec.yaml` — check only, no change expected (declared pin: the two `ship-sdlc/tool-handling:` cases)
- Test: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` — check only, no change expected (its needles keep their counts)

**Notes:** Text only; the two exec cases already exist and pass at HEAD, so they are declared pins. Copy the spec with `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`; never run `site/scripts/copy-docs.mjs`.

**Acceptance criteria:**
- [x] The R92 Acceptance line in `docs/specs/ship-sdlc.md` names the exec cases `ship-sdlc/tool-handling:` (TK-028 A1).
- [x] P-STEP-2 has an Acceptance sub-bullet that names the case `ship-sdlc/tool-handling: mktemp result file is read once` (TK-028 A2).
- [x] Step 5 item 6 of `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` cites `P-STEP-2` (TK-028 A3).
- [x] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0 (TK-028 A4).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern ship-sdlc/tool-handling` passes both cases.
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY two lines of `docs/specs/ship-sdlc.md` and one clause of SKILL.md; no new id. Before → after:

  ```diff
  # docs/specs/ship-sdlc.md, under P-STEP-2 (line 347), new sub-bullet
  +  - Acceptance: exec case `ship-sdlc/tool-handling: mktemp result file is read once` (`tests/promptfoo/datasets/ship-sdlc-exec.yaml`).
  # docs/specs/ship-sdlc.md, R92 Acceptance (line 409)
  -  - Acceptance: exec case `execute-plan-sdlc/liveness/wave-watch:`; sentinel `execute-plan-sdlc/handback:` (ship SKILL.md names `wave-watch`).
  +  - Acceptance: exec case `execute-plan-sdlc/liveness/wave-watch:`; sentinel `execute-plan-sdlc/handback:` (ship SKILL.md names `wave-watch`); exec cases `ship-sdlc/tool-handling:` (`tests/promptfoo/datasets/ship-sdlc-exec.yaml`).
  # plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md, Step 5 item 6 (line 278)
  - 6. Run `mktemp` and note the printed path; Read that empty file once (the Write tool refuses a file that was not read), then write …
  + 6. Run `mktemp` and note the printed path (P-STEP-2); Read that empty file once (the Write tool refuses a file that was not read), then write …
  ```

- names: `R92`, `P-STEP-2`, `ship-sdlc/tool-handling:`.
- mirror: the Acceptance sub-bullet at `docs/specs/ship-sdlc.md:409` (two spaces, `- Acceptance:`).
- decisions: the rest of item 6 stays byte-identical; the needles `Read that empty file once (the Write tool refuses a file that was not read)` (count 1) and `note the printed path; write` (count 0) of `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` keep their counts.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy (`cp`).

### Task 2: Ship doc words the deferred Monitor rule like the spec
**Ticket:** TK-026 @3d668b14

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — reword one sentence of the R92 bullet (line 229)
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy of the doc (`cp`)

**Notes:** The doc must state the same condition as R92 and SKILL.md:274; no test asserts the old sentence (see Research Findings).

**Acceptance criteria:**
- [x] `docs/skills/ship-sdlc.md:229` reads "When Monitor or TaskStop is a deferred tool, ship first loads Monitor and TaskStop with ToolSearch." (TK-026 A1).
- [x] `git grep -nF "When Monitor is a deferred tool" -- docs/skills site/src/content-source/skills` gives no hit.
- [x] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0 (TK-026 A2).

**Contract:** shape (docs): in `docs/skills/ship-sdlc.md:229` replace `When Monitor is a deferred tool, ship first loads` with `When Monitor or TaskStop is a deferred tool, ship first loads`, then `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`; names: `Monitor`, `TaskStop`, `ToolSearch`; sync: `site/src/content-source/skills/ship-sdlc.md` byte copy

### Task 3: Cost tiers wave wait table gets the 60 s timeout row
**Ticket:** TK-027 @f1808cfa

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint, manual

**Files:**
- Modify: `docs/cost-tiers.md` — add one row to `### execute-plan-sdlc wave wait tuning`
- Modify: `site/src/content-source/cost-tiers.md` — byte copy of the doc (`cp`)

**Notes:** R92 of `docs/specs/execute-plan-sdlc.md` says the skill's wave wait values live in this table; the 60 s value was missing.

**Acceptance criteria:**
- [x] The wave wait tuning table in `docs/cost-tiers.md` has the row below, right after the `--grace` passed by the skill row (TK-027 A1).
- [x] `cmp docs/cost-tiers.md site/src/content-source/cost-tiers.md` exits 0 (TK-027 A2).
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js` exits 0.

**Contract:** shape (docs): insert after the row `` | `--grace` passed by the skill | 10 s | `skills/execute-plan-sdlc/SKILL.md`, `wave-runner-template.md` | `` the row `` | `--timeout` passed by the skill after a worker returned | at most 60 s | `skills/execute-plan-sdlc/SKILL.md`, `wave-runner-template.md` | ``, then `cp docs/cost-tiers.md site/src/content-source/cost-tiers.md`; names: `--timeout`; sync: `site/src/content-source/cost-tiers.md` byte copy

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source behaviour changes. The SKILL.md edit is a citation, and the existing `ship-sdlc/tool-handling` exec cases are declared pins whose sentinel needles stay intact. |
| no-ci-bypass | error | PASS | No step skips or disables a CI check. The validators stay in the acceptance criteria. |
| no-auto-eval | error | PASS | The only promptfoo run is a single exec-only case filter (`promptfooconfig-exec.yaml`, `--filter-pattern`), which is allowed. There are no retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | The three tasks map one-to-one to tickets TK-026, TK-027 and TK-028. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable, with its byte copy listed as a sync step. |
| scripts-over-llm-logic | error | PASS | No skill logic is added or changed. The edit is a citation only. |
| yagni | warning | PASS | Nothing speculative is added. |
| cross-skill-consistency | error | PASS | The doc, spec and SKILL.md are aligned on the deferred-tool rule. The cost-tiers row matches the execute-plan-sdlc SKILL.md and wave-runner-template values. |
| pr-link-github-issue | error | PASS | The ids (W-E9, TK-*, PD-8) are internal register ids, so the rule does not apply. |
| dry | warning | PASS | The site copies are made with `cp`, and no logic is duplicated. |
| kiss | warning | PASS | The edits are minimal text changes. |
| spec-first | error | PASS | The SKILL.md change is a citation, not a behaviour change. Task 1 also updates the spec in the same task. |
| project-agnostic | error | PASS | The edits are to plugin docs, specs and SKILL.md, not to repo-local config. |
| flag-coherence-cross-skill | error | PASS | No flag decision sites are touched. |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced. The change aligns the wording of the Monitor/TaskStop rule across doc, spec and SKILL.md. |
| flag-resolution-single-source | warning | PASS | No flag resolution is touched. |
| state-premise | error | PASS | The Context section states the problem: doc, spec and cost-tiers text diverge from the shipped rules. |
| smallest-viable-cut | warning | PASS | The plan has three independent minimal tasks, each tied to a ticket. |
| failure-audience | warning | PASS | The Context section and Final Shape name the readers who would act on stale docs. |
| explicit-non-goals | warning | PASS | A Non-goals list is present. |
| ambiguity-stops-and-asks | error | PASS | Key Decisions records the viable choices (task split, citation placement, row placement) with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is touched. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described. |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added. The `--timeout` row only documents an existing value. |
| workspace-mode-compatibility | error | PASS | Doc text only. No state, config reads or cwd-dependent logic changes. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced into dispatched prompts. The static citation edit is prefix-stable. |

## Final Shape

- The ship-sdlc user doc, spec and SKILL.md state the same deferred-tool rule: ship loads Monitor and TaskStop when either one is deferred.

- The ship-sdlc spec names the exec cases that test R92 and P-STEP-2. A reader of SKILL.md item 6 sees which spec id the mktemp step implements.

- The cost-tiers wave wait table lists every value the skill passes to the wave wait, including the 60 s `--timeout` after a worker returned.

- Every edited `docs/` file is byte-equal to its site copy. No script, test or behaviour changed.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
