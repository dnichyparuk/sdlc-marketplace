# Cheap Planning (part 1): Lightweight Route, Compact Trivial Blocks, Review Routing Implementation Plan

**Commit:** `feat(#9413): plan - lightweight route, compact trivial blocks, routing`
**Goal:**
- Let a caller force a cheap planning route with `plan-sdlc --lightweight` (A5), with a script bounds check (R73) and one cheap second critique (R74).
- Let Trivial tasks use one-line `**Contract:**` and `**Notes:**` blocks, so plans get shorter (R45/R46 amendment, PF7).
- Make plan.js, not the model, choose the Step 5 reviewer set from the plan's shape (R36 amendment), and expose that choice and the R74 lane choice as script output fields.
- Keep the full plan format on every route: every plan passes `validate-plan-format.js --final --template` with no PF9/PF10 waiver, and lift-planning still reads the plans.
**Architecture:** Two shared functions in `scripts/lib/plan-critique.js` (`planShape`, `reviewRoute`) feed a new `plan.js tier --plan` subcommand and the existing `diff-material`, so one rule decides the tier, the reviewer set and the lanes to re-run. `validate-plan-format.js` gains the compact-Contract rule in PF7 and an exact fix line in PF10. SKILL.md and review-loop.md read the script fields instead of counting tasks in prose.
**Source:** conversation context (wave w30 brief, tracking #9413; items #9411, #9412, #9414, #9417, #9420, #9415, #9416)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (each task names its pattern)

---

## Context

**What problem does this change solve?**

- Planning is the costliest step of a small wave. Each plan pays for an Opus author, an exploration fan-out, four critique lanes and a three-lens review loop.
- Small, well-scoped waves do not need all of that. There is no way for a caller to ask for a cheaper route and still get a plan in the full format.
- The Step 5 reviewer choice ("one reviewer under 5 tasks, three lenses at 5 or more") is written as prose in `review-loop.md`. The model applies it, and the count ignores risk (a Complex task) and OpenSpec work.
- Planners still leave out the literal `## Tasks` heading on the first `--final` run (ledger F-115, w29). The format gate says only "Missing required section(s): Tasks".

**What prompted this change now?**

- The owner accepted joint planning for w30 and w31 on 2026-11-18. The architect's O2 (strong) and O4a reports name these cuts. The owner accepted the routing rule of #9417.

**What does success look like?**

- `plan-sdlc --lightweight` writes a plan with no exploration fan-out and no Step 5, unless a script bounds check says the plan is too big. Then it runs Steps 5–6 as today.
- A plan with compact Trivial blocks and a `--lightweight` plan both pass `validate-plan-format.js --final --template`. plan-parse, execute and ship read them unchanged.
- `plan.js tier` prints the tier, the bounds that broke and the reviewer route. `diff-material` prints the lanes and lenses to re-dispatch. Part 2's critique orchestrator reads these fields.

## Research Findings

The exploration brief (four code dimensions) and direct reads at HEAD `2b5a4da` found these facts. Each item was re-verified with file and line evidence.

- **#9411 reproduces.** plan-sdlc has flags A1–A4 only (`docs/specs/plan-sdlc.md:10-13`, F-lightweight-flag-and-tier-bounds-check-1). The highest requirement id is R72 and the highest P-id is P25 (F-lightweight-flag-and-tier-bounds-check-2). `plan.js` has three subcommands and no `tier` (`scripts/skill/plan.js:339-346`, F-lightweight-flag-and-tier-bounds-check-3).
- **#9412 reproduces.** PF7 checks only that a `**Contract:**` label line exists (`scripts/ci/validate-plan-format.js:413-421`, F-trivial-compact-contract-and-tasks-heading-gate-1). No text allows a compact form, and R45 requires the full key list (`docs/specs/plan-sdlc.md:271`).
- **#9414 reproduces.** PF10's failure message is `Missing required section(s): <names>` with no fix (`validate-plan-format.js:465`, F-trivial-compact-contract-and-tasks-heading-gate-6). SKILL.md names the heading only at fill time (`SKILL.md:286`, F-trivial-compact-contract-and-tasks-heading-gate-10).
- **#9417 and #9420 reproduce.** The route is prose in `review-loop.md:24` and `:54`. `diff-material` hard-codes `afterTaskCount < 5` at `lib/plan-critique.js:126` and `:190` (F-step5-reviewer-routing-in-plan-js-5). Prepare runs before the plan exists, so a plan-reading subcommand must compute the route (F-step5-reviewer-routing-in-plan-js-1).
- **#9415 reproduces.** The Lightweight branch of Step 6.6 runs the validator without `--final` and says "PF9 and PF10 do not apply" (`SKILL.md:427-431`, F-trivial-compact-contract-and-tasks-heading-gate-9). R53 states the same waiver (`docs/specs/plan-sdlc.md:134`).
- **#9416 holds as a constraint.** The parsers already read a label line's own text: `labelBlock` keeps the rest of the label line (`lib/plan-parse.js:95-115`). `parseTask` reads `contract` and `notes` with it (`:161-162`), and the execute fact sheet prints them (`lib/task-factsheet.js:45-55`). So compact blocks need no parser change.
- **Test layout.** Script cases live in `tests/promptfoo/datasets/plan-prepare-exec.yaml` (`plan-diff:`, `plan-merge:`, `plan-prepare:` prefixes) and `plan-format-exec.yaml` (`plan-format:` prefixes). Four `plan-prepare:` cases compare `flags` by exact JSON (`plan-prepare-exec.yaml:395`, `:413`, `:445`, `:461`), so a new flags key changes them. Two `plan-diff:` cases use the 5-task, no-Complex fixtures `before-5.md` and `after-contract.md` and expect fan-out lenses (`:699`, `:708`). Under the new rule those plans get the single reviewer.
- **Copy rule.** `.sdlc/config.json` `plan.copyRules` requires `docs/skills/plan-sdlc.md`, its site copy, `site/src/data/skills-meta.ts` and every `plugins/sdlc-utilities/skills/plan-sdlc/*.md` when SKILL.md or the spec changes.
- **Build and test commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. The spec site copy is a byte copy (`cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` is equal at HEAD).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Lightweight scorecard | no | A Lightweight-route plan keeps the `## Verification Scorecard` heading with the body `Not applicable — lightweight plan`, and Step 6.6 runs `--final --template` on every route | PF9 and PF10 check heading presence only. This keeps the full format with no waiver (#9415) and needs no lane-based scorecard renderer. |
| R73/R74 scope | no | R73 and R74 apply to every Lightweight-route run, whether `--lightweight` forced it or Step 0 routing chose it | One gate for one route (`no-opposite-logical-vectors`); the Step 0 route already has 3 files or fewer. |
| Blocking issues after the R74 re-check | no | The author fixes them in place once; no third critique round | The brief says "once". Step 6.6 still guards the structure. |
| Route change between Step 5 iterations | no | A new `diff-material` trigger `reviewRoute` re-dispatches everything | A flip between one reviewer and three lenses would otherwise carry a result of the wrong lens set. |
| #9414 fix | no | Both: SKILL.md tells the author to keep the skeleton heading, and PF10 prints the exact fix | The brief allows either; the validator text is the deterministic half. |
| Tracking ids | no | The PR body names #9413 and items #9411–#9420 with no `Fixes`/`Closes` keyword | They are internal register ids, not GitHub issues (the repository's own numbers are near #106, HEAD `2b5a4da`), and the project notes forbid a closing keyword for them. `pr-link-github-issue` applies only to a GitHub issue, so it is not applicable here. |
| Step 6.6 edit | no | Task 6 changes Step 6.6 to one `--final --template` block | The brief says gates 6.5/6.6 stay unchanged, but #9415 forbids the Lightweight PF9/PF10 waiver that lives in Step 6.6; the gate gets stricter, not weaker. |

## Key Decisions

- **One shape rule in one place.** `planShape(text)` counts tasks, Complex tasks, distinct `**Files:**` paths and the OpenSpec signal. `reviewRoute(shape)` turns that into `single` or `fan-out`. `tier`, `diff-material` and its `rerun` list all call them. The alternative was a second subcommand (`route-review`, contradiction 1 in the brief). One subcommand wins because the tier check and the route read the same counts (DRY).
- **The OpenSpec signal comes from the plan text.** `tier` gets only `--plan`. The plan is OpenSpec work when its `**Source:**` line names `openspec/changes/`, its `## OpenSpec Appendix` body does not start with `Not applicable`, or a task has an `**openspec-task:**` block. The alternative, an `--openspec` flag set by the skill, would let the model re-derive a fact (`flag-resolution-single-source`).
- **Compact form is checked by PF7, not by a new PF id.** A Contract block is compact when it has no `- ` list line. PF7 then requires `**Complexity:** Trivial` and the words `shape` and `names:` on the label line. Folding it into PF7 keeps the check totals (`"total": 13` in `plan-format-exec.yaml:352`) and the PF numbering unchanged.
- **Every route runs `--final`.** Step 6.6 keeps one block. A second block for Lightweight plans was the old waiver that #9415 forbids.
- **`merge-lanes` gets a checks-only mode.** With `--plan` and no `--lanes`, `--lenses` or `--carry`, it merges only the validator report and the copy check. R74's "not material" path needs exactly that, and today's merge-lanes refuses an empty lane list.
- **The R74 lane choice is a field, not prose.** `diff-material` prints `recheckLanes` (the lanes of `dispatch.lanes` when `material` is true, else `[]`). `dispatch.lanes` and `dispatch.lenses` resolve `affectedLanes` (including `*`) into agent names. Part 2's orchestrator reads them (#9420).
- **Smallest viable cut.** Tasks 2–4 carry the script behaviour. Task 1 is the spec-first gate, Tasks 5–7 carry the prose and user docs the copy rule requires. No task is optional.
- **Explicit non-goals.** No change to lane or lens prompts, to any G1–G21 gate definition, to the brief and output path arguments, to the `### Task N:` heading or the `**Source:**` line. No Sonnet planner. No orchestration-skill edit (the lean skill passes `--lightweight` later). No critique orchestrator (part 2).
- **Failure audience.** A wrong route or tier hurts plan authors and the ship pipeline: a plan that skips review it needed, or a valid plan that fails the format gate. A compact-block parser break would hurt execute workers and lift-planning.

## Decisions taken without the owner

No owner was available (`--auto` planning run). Each item took the recommended or most conservative option:

- **Scorecard on the Lightweight route:** keep the `## Verification Scorecard` heading with `Not applicable — lightweight plan` and run `--final --template` everywhere (Deviations row "Lightweight scorecard").
- **R73/R74 scope:** both apply to every Lightweight-route run, forced or chosen by Step 0 routing.
- **After the R74 re-check:** the author fixes blocking issues once; no third round.
- **Route flips between Step 5 iterations:** a new `reviewRoute` trigger re-dispatches everything.
- **#9414:** do both halves (skeleton rule and PF10 fix text).
- **`pr-link-github-issue`:** treated as not applicable; the tracking ids are internal register ids, and the project notes forbid a closing keyword.
- **Step 6.6:** changed despite "gates 6.5/6.6 unchanged" in the brief, because #9415 removes the Lightweight waiver that lives there.
- **Review loop cap:** iteration 3 still flagged G19 (render the R73/R74 call order) and G21 (two prose-only test edits) on Task 6. The recommended max-iterations option, fix and proceed, was taken: both were fixed in place (call-order table, two diffs) without a fourth round.

## Contract Examples

```markdown
**Contract:**
- shape (code): `signToken(payload: object, expiresIn: string): string` and
  `verifyToken(token: string): object`; throws `JwtExpiredError` | `JwtInvalidError` on failure;
  import `jsonwebtoken`; secret from `process.env.JWT_SECRET`.
- names: `signToken`, `verifyToken`, `JwtExpiredError`, `JwtInvalidError`.
- mirror: existing util module style at `src/utils/hash.ts:1-40`.
- decisions: typed errors over boolean returns (callers branch on error class).
- sync: `src/middleware/auth.ts` imports `verifyToken` — signature must match.
- example: `signToken({ id: 'u_1' }, '1h')` → `"eyJhbGciOi..."`.
```

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/auth.md`. Add a `## Token Lifecycle` section (audience: end
  users) after `## Usage`; bullet list of the 3 token states; cross-link to `/version-sdlc`.
- names: section heading `## Token Lifecycle`.
- mirror: the `## Usage` / `## Flags` section style at `docs/skills/auth.md:10-40`.
- decisions: user-facing prose only — no internal API references.
- sync: must match the field names introduced in the format reference (`Contract:` keys).
- example: `## Token Lifecycle` appears in the doc's TOC between `## Usage` and `## Flags`.
```

```markdown
**Contract:**
- shape (openspec): ADD R-AUTH-3 "Token expiry": tokens expire after the configured TTL;
  MODIFY R-AUTH-1 to reference expiry; numbering continues from R-AUTH-2.
- names: R-AUTH-3, R-AUTH-1.
- mirror: requirement style of `openspec/specs/auth/spec.md:12-30`.
- decisions: expiry is configured, not hard-coded.
- sync: `docs/skills/auth.md` Token Lifecycle section names the same TTL setting.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 2, 3, 4 and 6 add or update promptfoo exec cases, including the stale plan-diff and plan-prepare expectations; Task 6 updates the stale behavioural P2-fanout and contract-change cases |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only exec-only configs with targeted --filter-pattern runs, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task traces to items #9411-#9420 |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Tier, route and lane choice move into plan.js and plan-critique.js; SKILL.md reads the script fields |
| yagni | warning | PASS | Non-goals exclude speculative work |
| cross-skill-consistency | error | PASS | lift-planning, plan-parse and execute compatibility are covered by the compact-block invariant and Task 4 fixtures |
| pr-link-github-issue | error | N/A | No GitHub issue is fixed: #9413 and #9411–#9420 are internal register ids (Deviations row "Tracking ids"); the project notes forbid a closing keyword for them |
| dry | warning | PASS | One shared planShape/reviewRoute rule; labelBlock is reused |
| kiss | warning | PASS | Compact form is folded into PF7 with no new PF id |
| spec-first | error | PASS | Task 1 (spec) is ordered before the SKILL.md task (Task 6) |
| project-agnostic | error | PASS | Changes are in plugin scripts, skills and docs |
| flag-coherence-cross-skill | error | PASS | SKILL.md gates on flags.lightweight === true and the tier/review fields |
| no-opposite-logical-vectors | error | PASS | One gate for the Lightweight route and one --final block for every route |
| flag-resolution-single-source | warning | PASS | --lightweight resolves once in plan.js |
| state-premise | error | PASS | Context states the problem |
| smallest-viable-cut | warning | PASS | Key Decisions justify the task set |
| failure-audience | warning | PASS | Key Decisions names who is affected |
| explicit-non-goals | warning | PASS | Non-goals are listed |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions and Deviations |
| state-machine-idempotency | error | PASS | No migration, init or preflight-state logic is modified |
| agent-dispatch-script-driven | error | PASS | Dispatch uses the recheckLanes, dispatch and review script fields |
| flag-semantic-consistency-cross-skill | error | PASS | Task 3 records grep evidence that --lightweight is unused elsewhere |
| workspace-mode-compatibility | error | PASS | Task 6 notes that calls take literal plan and critiqueDir paths, so both modes behave the same |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 6 changes the SKILL.md `argument-hint` to add `[--lightweight]`, and Task 7 adds the matching Flags row in `docs/skills/plan-sdlc.md` and `site/src/data/skills-meta.ts`.

**Severity hint:** high

**Patch:** Check that the new `--lightweight` flag shows up in the SKILL.md `argument-hint`, the `docs/skills/plan-sdlc.md` Flags table, and `skills-meta.ts`.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the new `--lightweight` flag shows up in the SKILL.md `argument-hint`, the `docs/skills/plan-sdlc.md` Flags table, and `skills-meta.ts`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 3 adds the `--lightweight` CLI flag and `tier` subcommand to `plugins/sdlc-utilities/scripts/skill/plan.js`, and Task 6 changes the SKILL.md `argument-hint`.

**Severity hint:** high

**Patch:** Check the new `--lightweight` flag, the `plan.js tier` subcommand, and the `flags` and `diff-material` output shape changes (`flags.lightweight`, `dispatch`, `recheckLanes`).

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new `--lightweight` flag, the `plan.js tier` subcommand, and the `flags` and `diff-material` output shape changes (`flags.lightweight`, `dispatch`, `recheckLanes`).

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: spec-compliance (B1)

**Why:** Task 1 adds the new flag A5 and the requirements R73 and R74 to `docs/specs/plan-sdlc.md`, and Task 6 implements them in SKILL.md.

**Severity hint:** high

**Patch:** Check that A5, R73 and R74 are in the spec before SKILL.md cites them, and that the site copy of the spec is an exact byte copy.

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — Check that A5, R73 and R74 are in the spec before SKILL.md cites them, and that the site copy of the spec is an exact byte copy.

_2 additional candidates suppressed_

## Tasks

### Task 1: Spec — A5, R73, R74, review routing, compact Trivial blocks, format gate

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — add A5, R73, R74; amend R1, R8, R36, R45, R46, R53, R64, R67, P17, P24, P25, I5, PF7, PF9, PF10; add history rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`)

**Notes:** Spec first (AGENTS.md principle 1, `spec-first` guardrail): every later task cites these ids. New ids take the next free numbers (A5, R73, R74; brief F-lightweight-flag-and-tier-bounds-check-2). R73 and R74 go under `## Dispatch and routing`, after R72. `validate-spec-shape.js --strict` must stay green.

**Acceptance criteria:**
- [ ] A5, R73 and R74 exist with the text in the Contract, each with an `Acceptance:` sub-bullet naming its exec cases.
- [ ] R8, R36, P17, P25 and I5 state the shape rule (fan-out when any Complex task, 8 or more tasks, or OpenSpec work; else the single reviewer), and no sentence in the spec still routes on "5 tasks".
- [ ] R45 and R46 carry the compact-Trivial amendment and the lift-planning invariant; PF7, PF9, PF10 and R53 carry the amended text; R53 no longer waives PF9 for Lightweight plans.
- [ ] R67 says four subcommands and documents `tier`, the new `diff-material` fields and trigger, and merge-lanes checks-only mode.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0 and `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` reports no difference.

**Contract:**
- shape (openspec): ADD A5, R73, R74; MODIFY R1, R8, R36, R45, R46, R53, R64, R67, P17, P24, P25, I5, PF7, PF9, PF10. Delta text (wording may be tightened; the decided content may not change):

  | Id | Kind | Delta |
  |---|---|---|
  | A5 | ADD | `--lightweight` — the caller forces the Lightweight route: inline exploration only (no explore orchestrator), no Step 5; resolved by `plan.js` into `flags.lightweight` (P24); with `--quality` given on the CLI, `plan.js` prints one stderr line `Warning: --quality <v> applies only if the plan escalates to the review loop (--lightweight).` (default: off) |
  | R73 | ADD | Tier bounds check: on the Lightweight route, after Step 2, the skill runs `plan.js tier --plan <path>`. Bounds: tasks ≤ 6, Complex tasks 0, distinct `**Files:**` paths ≤ 8, no OpenSpec work. `tier` is `full` when any bound breaks; the run then escalates: Steps 3–4 run, then Steps 5–6 (R36) instead of R74. Exploration is not re-run. Acceptance: exec cases `plan-tier:`. |
  | R74 | ADD | Cheap second critique: on the Lightweight route without escalation, Step 4 copies the plan to `<critiqueDir>/iter-0/plan-before.md` before its fixes, then runs `plan.js diff-material --before … --after <plan> --prev-dir <critiqueDir>/iter-0`. In `iter-1` it runs the Step 3 deterministic block; it dispatches the lanes of `recheckLanes` once (Step 3 dispatch and skip rules) and merges with `--carry <critiqueDir>/iter-0 --plan`; when `recheckLanes` is empty it runs merge-lanes checks-only (`--plan`, no lanes). The author fixes the blocking issues once; no further critique round. `guardrailsEvaluated` and `critiqueRan` are not re-written. Acceptance: exec cases `plan-diff:` (recheckLanes) and `plan-merge: (checks-only)`. |
  | R36 | MODIFY | Review routing by plan shape: one reviewer (`reviewerDispatch`, lens `all`) when the plan has no Complex task AND fewer than 8 tasks AND is not OpenSpec work; the 3-lens fan-out when any Complex task, 8 or more tasks, or OpenSpec work. `plan.js tier` (`review`) decides it at the first Step 5 iteration; later iterations use `diff-material` `dispatch.lenses`. The prose never counts tasks. |
  | R8, P17, P25, I5 | MODIFY | Replace "plans with 5+ tasks" / "fewer than 5 tasks" with "the fan-out route" / "the single-reviewer route (R36)". |
  | R45, R46 | MODIFY | Compact Trivial blocks: a Trivial task MAY write `**Contract:**` as one label line holding `shape (<type>): …; names: …` (plus `sync: …` when a copy must stay byte-consistent) and `**Notes:**` as one label line. Invariant (lift-planning): compaction applies only to `**Contract:**` and `**Notes:**`; every task keeps its own `### Task N:` heading (integer, colon, level 3) and its own `**Acceptance criteria:**` `- [ ]` list; tasks are never batched under one heading; compact blocks add no list checkboxes. |
  | R53, PF9, PF10 | MODIFY | Step 6.6 runs `--final --template` on every route. A Lightweight-route plan keeps the `## Verification Scorecard` heading with the body `Not applicable — lightweight plan`. PF10's failure adds the fix line (Task 4). |
  | PF7 | MODIFY | A Contract block with no `- ` list line is compact; a compact Contract passes only on a `**Complexity:** Trivial` task whose label line holds `shape` and `names:`. |
  | R64, R67 | MODIFY | Four subcommands. (d) `tier --plan <path>` → output shape of Task 3. (b) `diff-material` adds trigger `reviewRoute` (everything, `*`), fields `dispatch: { lanes, lenses }` and `recheckLanes`; the `lens:all` mapping follows the after plan's route, not "fewer than 5 tasks". (a) `merge-lanes --dir <d> --plan <p>` with no `--lanes`, `--lenses` or `--carry` is checks-only: validator and copy issues, `coverage: null`, `g17Findings: null`, `lens: null`. |
  | R1 | MODIFY | Add: `--lightweight` (A5) forces the Lightweight route whatever the file count. |
  | P24 | MODIFY | `flags` is `{ quality, lightweight: boolean, sources: { quality, lightweight: "cli"\|"default" } }`. |
- names: A5, R73, R74 (new); history rows `A5, R73, R74 | #9411`, `R36, R8, P17, P25, R67 | review routing, #9417, #9420`, `R45, R46, PF7 | compact Trivial blocks, #9412, #9416`, `R53, PF9, PF10 | no Lightweight waiver, #9414, #9415`.
- mirror: A4 text and its `Acceptance:` sub-bullet at `docs/specs/plan-sdlc.md:13-14`; R72 layout at `:79-81`; the history table at `:316` onward.
- decisions: Key Decisions "One shape rule", "Every route runs `--final`", "checks-only mode".
- sync: the site copy is a byte copy; Tasks 2–7 cite these ids.

### Task 2: plan-critique.js — shape rule, routed diff-material, checks-only merge

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — add `planShape`, `reviewRoute`, `tierCheck`; route `affectedSets` and `rerunFrom`; new trigger and fields in `diffMaterial`; checks-only `mergeLanes`
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/after-route-flip.md` — `after-contract.md` with Task 1 set to `**Complexity:** Complex`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — update two `plan-diff:` cases; add `plan-diff:` and `plan-merge: (checks-only)` cases

**Notes:** One rule for the tier, the route and the re-dispatch set (Key Decision "One shape rule"; brief F-step5-reviewer-routing-in-plan-js-5, F-lightweight-flag-and-tier-bounds-check-16). Reuse the fence-aware `extractTasksRaw`, `taskSection`, `parseFilesEntries`, `extractField` and `sectionBody` from `lib/plan-parse.js`; no new parser. The two updated cases keep their fixtures; only the expected lens names change, because a 5-task plan with no Complex task now gets the single reviewer.

**Acceptance criteria:**
- [ ] `planShape`, `reviewRoute` and `tierCheck` are exported and follow the Contract; `affectedSets` and `rerunFrom` no longer compare a task count with 5.
- [ ] `diff-material --before before-5.md --after after-contract.md` gives `affectedLanes` `["content-coverage","guardrail-compliance","lens:all"]`, `dispatch.lenses` `["all"]` and `recheckLanes` `["content-coverage","guardrail-compliance"]` (updated case); with `--prev-dir prev-blocking` the `rerun` list is `["lens:all","static-structural"]` (updated case).
- [ ] `diff-material --before before-5.md --after after-route-flip.md` fires `["contracts","reviewRoute"]` with `affectedLanes` `["*"]`, `dispatch.lanes` all four lane names in lane-table order and `dispatch.lenses` `["architecture","requirements","risk"]` (new case `plan-diff: (route) route flip re-dispatches everything`).
- [ ] `diff-material --before after-route-flip.md --after after-route-flip.md --prev-dir prev-blocking` keeps `material: false`, `recheckLanes: []` and `rerun` `["lens:requirements","static-structural"]` (new case `plan-diff: (route) fan-out plan keeps per-lens rerun`).
- [ ] `merge-lanes --dir plan-merge-lanes --plan plan-merge-lanes/copy-plan.md` exits 0 with the G3 and G12 validator issues, `coverage: null`, `lens: null` and `g17Findings: null`; with neither `--plan` nor lanes it still exits 1 (new case `plan-merge: (checks-only)`).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-diff:|plan-merge:"` passes.

**Contract:**
- shape (code): in `lib/plan-critique.js`:

  ```js
  // tasks: extractTasksRaw count; complex: tasks whose Complexity field is "Complex";
  // files: distinct parseFilesEntries paths over all tasks;
  // openspec: Source names openspec/changes/, OR the "## OpenSpec Appendix" body
  //           (trimmed) is non-empty and does not start with "Not applicable",
  //           OR any task has an **openspec-task:** label line.
  function planShape(text) /* -> { tasks, complex, files, openspec } */
  function reviewRoute(shape) /* -> { route: 'single'|'fan-out', lenses: ['all'] | ['architecture','requirements','risk'] } */
  //   fan-out iff shape.complex > 0 || shape.tasks >= 8 || shape.openspec
  const TIER_BOUNDS = { tasks: 6, complex: 0, files: 8 };
  function tierCheck(text) /* -> { tier, counts: { tasks, complex, files }, openspec, breaches, review } */
  //   breaches, in this order: { bound: 'tasks'|'complex'|'files', value, max } when value > max;
  //   { bound: 'openspec', value: true, max: false } when openspec. tier = breaches.length ? 'full' : 'lightweight'.
  ```

  `diffMaterial` output, before → after:

  ```diff
   { material, triggers, details, affectedGates, affectedLanes, rerun,
  +  dispatch: { lanes: string[], lenses: string[] },
  +  recheckLanes: string[] }
  ```

  - `affectedSets(triggers, afterRoute, full)` and `rerunFrom(prevDir, afterRoute)` map a lens to `lens:all` when `afterRoute.route === 'single'` (was `afterTaskCount < 5`).
  - Trigger `reviewRoute` fires last in `triggers` when `reviewRoute(planShape(before)).route !== reviewRoute(planShape(after)).route`; `details.reviewRoute = { before, after }`; it gives every gate and `affectedLanes: ["*"]`, like `taskCount`.
  - `dispatch.lanes`: for `["*"]`, every name of `LANE_DEFS` then `dimension-coverage`; else the non-`lens:` entries of `affectedLanes` in that same table order. `dispatch.lenses`: for `["*"]`, `reviewRoute(after).lenses`; else the `lens:` entries without the prefix, sorted.
  - `recheckLanes = material ? dispatch.lanes : []`.
  - `mergeLanes`: `checksOnly = !lanes.length && !lenses.length && carryDir === null && copyCheck !== null`. The usage error `--lanes or --lenses is required` fires only when not `checksOnly`. In checks-only mode the validator report is read as today, the missing-gates coverage step is skipped (`coverage: null`), `g17Findings: null`, `lens: null`, `scorecard: null`.
- names: `planShape`, `reviewRoute`, `tierCheck`, `TIER_BOUNDS`, trigger `reviewRoute`, fields `dispatch`, `recheckLanes`; case names `plan-diff: (route) route flip re-dispatches everything`, `plan-diff: (route) fan-out plan keeps per-lens rerun`, `plan-merge: (checks-only) --plan alone merges validator and copy issues`.
- mirror: `affectedSets` and `rerunFrom` at `lib/plan-critique.js:120-131` and `:172-195`; the existing `plan-diff:` cases at `tests/promptfoo/datasets/plan-prepare-exec.yaml:692-715`; the `plan-copy:` case at `:1028` for a `--plan` call.
- decisions: Key Decisions "One shape rule", "OpenSpec signal from the plan text", "checks-only mode", "R74 lane choice is a field"; Deviations row "Route change between Step 5 iterations".
- sync: R36, R64, R67 text (Task 1); `review-loop.md` reads `dispatch` (Task 6). Count checks over the changed dataset: none assert a case count in `plan-prepare-exec.yaml` (it grows from 89 to 92 cases).

### Task 3: plan.js — `tier` subcommand and `--lightweight` flag

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `tier` in `SUBCOMMANDS`/`SUBCOMMAND_FLAGS`; `--lightweight` in `parseArgs`; `flags.lightweight`; the `--quality` warning; usage comment lines 8–17
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add `plan-tier:` cases and a `plan-prepare: (lightweight)` case; update the four exact `flags` checks (diff in the Contract)
- Create: `tests/promptfoo/fixtures-fs/plan-tier/light.md` — 5 tasks (Trivial and Standard), 8 distinct paths, OpenSpec Appendix `Not applicable — no OpenSpec change`
- Create: `tests/promptfoo/fixtures-fs/plan-tier/eight.md` — 8 Standard tasks, 9 distinct paths, no OpenSpec
- Create: `tests/promptfoo/fixtures-fs/plan-tier/openspec.md` — 3 Standard tasks, `**Source:** openspec/changes/add-x/proposal.md`

**Notes:** Each `plan-tier/*.md` fixture is a valid plan in the `plan-format-reference.md` per-task shape (header, `## Tasks`, `### Task N:` blocks with Complexity and Files), so `planShape` counts it. The flag resolves once, in prepare (`flag-resolution-single-source`); SKILL.md reads `flags.lightweight === true` only. No other skill prepare script defines `--lightweight`, so `flag-semantic-consistency-cross-skill` adds no obligation (grep of `plugins/*/scripts` at HEAD finds none). The Complex branch reuses Task 2's `after-route-flip.md`. Brief F-lightweight-flag-and-tier-bounds-check-3, -5, -6.

**Acceptance criteria:**
- [ ] `node plan.js tier --plan plan-tier/light.md` prints `tier: "lightweight"`, `breaches: []`, `review.route: "single"` (case `plan-tier: (a) small plan stays lightweight with one reviewer`).
- [ ] `tier --plan plan-diff-material/after-route-flip.md` prints `tier: "full"`, a `complex` breach and `review.route: "fan-out"` (case `plan-tier: (b) a Complex task escalates and fans out`).
- [ ] `tier --plan plan-tier/eight.md` prints `tasks` and `files` breaches and `review.route: "fan-out"` with `counts.complex: 0` (case `plan-tier: (c) eight tasks fan out`).
- [ ] `tier --plan plan-tier/openspec.md` prints an `openspec` breach and `review.route: "fan-out"` (case `plan-tier: (d) OpenSpec work fans out`).
- [ ] `tier` with no `--plan`, or an unknown flag, exits 1 (case `plan-tier: (e) usage errors exit 1`).
- [ ] `plan.js --lightweight --quality speed` gives `flags` `{"quality":"full","lightweight":true,"sources":{"quality":"cli","lightweight":"cli"}}` and exactly one stderr line starting `Warning: --quality speed applies only` (case `plan-prepare: (lightweight) flag resolves and warns about --quality`); the four updated `plan-prepare:` cases expect `"lightweight":false` and `"lightweight":"default"`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-tier:|plan-prepare:"` passes.

**Contract:**
- shape (code): CLI and output:

  ```text
  node plan.js tier --plan <path>        exit 0 JSON | 1 usage | 2 crash
  node plan.js [--output-file] [--lightweight] [--quality <preset>] [--from-openspec <name>]
  ```

  ```json
  {
    "tier": "full",
    "counts": { "tasks": 8, "complex": 0, "files": 9 },
    "openspec": false,
    "breaches": [ { "bound": "tasks", "value": 8, "max": 6 }, { "bound": "files", "value": 9, "max": 8 } ],
    "review": { "route": "fan-out", "lenses": ["architecture", "requirements", "risk"] }
  }
  ```

  `runTier(flags)` = `tierCheck(readPlanFile(requireFlag(flags, 'plan')))`. `SUBCOMMAND_FLAGS.tier = ['plan']`. `parseArgs` returns `lightweight: true` for `--lightweight` (value-less). `flags` before → after:

  ```diff
  -{ quality, sources: { quality } }
  +{ quality, lightweight, sources: { quality, lightweight } }
  ```

  Usage comment at the top of `plan.js`:

  ```diff
  - *   node plan-prepare.js [--from-openspec <change-name>] [--output-file] [--quality speed|balanced|quality]
  + *   node plan-prepare.js [--from-openspec <change-name>] [--output-file] [--quality speed|balanced|quality] [--lightweight]
  + *   node plan.js tier --plan <path>
  ```

  The four exact `flags` checks in `plan-prepare-exec.yaml` (default, `--quality quality`, `--quality speed`, `--quality quality` cases; same pattern each):

  ```diff
         const data = JSON.parse(output);
  -      if (JSON.stringify(data.flags) !== JSON.stringify({ quality: 'balanced', sources: { quality: 'default' } })) return `flags: ${JSON.stringify(data.flags)}`;
  +      if (JSON.stringify(data.flags) !== JSON.stringify({ quality: 'balanced', lightweight: false, sources: { quality: 'default', lightweight: 'default' } })) return `flags: ${JSON.stringify(data.flags)}`;
         for (const e of [...data.lensReviewers, data.reviewerDispatch]) {
  ```

  (the `minimal`/`cli` and `full`/`cli` cases get the same `lightweight: false` and `lightweight: 'default'` keys in the same places).

  Warning, printed after the quality resolution when both `--lightweight` and `--quality` came from the CLI: `Warning: --quality <v> applies only if the plan escalates to the review loop (--lightweight).` (`<v>` is the value as typed).
- names: subcommand `tier`, flag `--lightweight`, `flags.lightweight`, `flags.sources.lightweight`, fixtures `plan-tier/light.md`, `plan-tier/eight.md`, `plan-tier/openspec.md`.
- mirror: `runDiffMaterial` and the subcommand tables at `scripts/skill/plan.js:339-372`; the `--quality` resolution at `:479-487`; the `plan-prepare: (quality-alias)` cases at `plan-prepare-exec.yaml:435-485`.
- decisions: Key Decision "One shape rule"; Deviations row "R73/R74 scope".
- sync: A5, P24, R67(d) (Task 1); SKILL.md calls `tier` (Task 6).

### Task 4: validate-plan-format.js — compact Contract in PF7, exact fix in PF10

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — PF7 compact rule; PF10 fix line; header comment PF7 line
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-parse.js` — export `labelBlock`
- Test: `tests/promptfoo/datasets/plan-format-exec.yaml` — add `plan-format-compact:` cases; add the two fixtures to the fixture comment block
- Create: `tests/promptfoo/fixtures-fs/project-plan-compact-lightweight/plans/plan.md` — lift-planning-shaped Lightweight plan with compact Trivial tasks
- Create: `tests/promptfoo/fixtures-fs/project-plan-compact-standard/plans/plan.md` — a Standard task with a compact Contract

**Notes:** PF7 stays one id so the check totals and PF numbering hold (Key Decision "Compact form is checked by PF7"). `labelBlock` is already fence-aware and keeps the label line's text, so PF7 reuses it instead of a new regex (DRY). The fixture proves #9415 and #9416(c) at once. Brief F-trivial-compact-contract-and-tasks-heading-gate-1, -4, -6, -25.

**Acceptance criteria:**
- [ ] `project-plan-compact-lightweight/plans/plan.md` passes `validate-plan-format.js --file … --final --template <repo>/plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --json` with `"passed": true` and `"total": 13` (case `plan-format-compact: (a) lift-planning-shaped lightweight plan passes --final`).
- [ ] `parsePlan` of the same fixture returns task ids `[1,2,3]`, a non-null `contract` and `notes` for each compact task, and the same task numbers `extractTasks` finds (case `plan-format-compact: (b) plan-parse sees every task`, script `-e`).
- [ ] `project-plan-compact-standard/plans/plan.md` fails PF7 with `Task 1: compact **Contract:** is allowed only for Trivial tasks` (case `plan-format-compact: (c) compact Contract on a Standard task fails PF7`).
- [ ] `project-valid-plan` under `--final --template` fails PF10 with a message that contains `Fix: add a "## <name>" heading for each` and `put "## Tasks" directly above the first "### Task" heading` (case `plan-format-compact: (d) PF10 prints the exact fix`); the existing PF10 cases at `plan-format-exec.yaml:242-298` still pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-format"` passes.

**Contract:**
- shape (code): PF7, before → after:

  ```diff
   function checkPF7(tasks) {
  -  const offenders = tasks
  -    .filter(t => /^[-*]\s+(Create|Modify|Test):/m.test(t.body)
  -              && !/^\*\*Contract:\*\*/m.test(t.body))
  -    .map(t => `Task ${t.number}`);
  +  // missing: artifact-touching task with no **Contract:** label (message unchanged)
  +  // compact: labelBlock(t.body, 'Contract') has no line matching /^\s*[-*]\s+\S/
  +  //   -> fail unless extractField(t.body, 'Complexity') === 'Trivial'
  +  //      and the block text holds /\bshape\b/ and /\bnames:/
  ```

  Messages: `Missing **Contract:** block: Task 2` (unchanged), `Task 1: compact **Contract:** is allowed only for Trivial tasks`, `Task 3: compact **Contract:** needs shape and names`; joined with `; `. PF10 failure message:

  ```text
  Missing required section(s): Context, Tasks. Fix: add a "## <name>" heading for each; put "## Tasks" directly above the first "### Task" heading.
  ```

  (the `put "## Tasks" …` clause only when `Tasks` is missing). Fixture `project-plan-compact-lightweight/plans/plan.md`, header and one task:

  ```markdown
  # Compact Lightweight Fixture Implementation Plan

  **Commit:** `docs(#1): fixture - compact lightweight plan`
  **Goal:** Prove compact Trivial blocks keep the full format.
  **Ticket:** TK-001 @deadbeef
  **Architecture:** Three small tasks.
  **Source:** docs/x.md#U-1
  **Verification:** manual

  ---
  … every default-template section in Section Order; ## Verification Scorecard body "Not applicable — lightweight plan" …
  ### Task 2: Fix the usage line

  **Complexity:** Trivial
  **Risk:** Low
  **Depends on:** Task 1
  **Verify:** manual
  **Ticket:** TK-001 @deadbeef

  **Files:**
  - Modify: `docs/usage.md` — fix the flag name

  **Notes:** The flag was renamed; only this line kept the old name.

  **Acceptance criteria:**
  - [ ] `docs/usage.md` names `--lightweight`

  **Contract:** shape (docs): one-line edit in Usage; names: `--lightweight`; sync: none
  ```

  The fixture holds every section of `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` `## Required Sections`, in the `plan-format-reference.md` Section Order. Task 1 is Standard with a full Contract; Tasks 2 and 3 are Trivial and compact. `project-plan-compact-standard` is `project-valid-plan/plans/test-plan.md` with Task 1's Contract replaced by one compact line.
- names: case prefix `plan-format-compact:`; export `labelBlock`; fixture dirs `project-plan-compact-lightweight`, `project-plan-compact-standard`.
- mirror: `checkPF7` at `validate-plan-format.js:413-421`, `checkPF10` at `:440-468`; the `plan-format-lean:` JSON-parse assertions at `plan-format-exec.yaml:577-611`; the `-e` script case pattern at `plan-prepare-exec.yaml:1091-1100`.
- decisions: Key Decision "Compact form is checked by PF7"; Deviations row "#9414 fix".
- sync: PF7 and PF10 text (Task 1); compact form text in `plan-format-reference.md` (Task 5). Count checks: the `"total": 13` assertion at `plan-format-exec.yaml:352` is unchanged (no new PF id).

### Task 5: plan-format-reference.md — compact Trivial form and stable fields

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — new `### Compact Trivial blocks` subsection under `## The \`Contract:\` block`; new `## Stable fields (downstream tools)` section after `## Document Header`; one line in `### Size Cap and Anti-Bloat`
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only, do not edit: `openspec-flow.md`, `plan-template-default.md` and `state-format.md` say nothing about Contract form, routing or the format gate; no change expected (copy rule; this entry gives the directory one owner)

**Notes:** The content-coverage lane reads this file before judging G18 (R54), so the compact form must be shown here, with a worked example, for the lane to accept it. Keep the three strings that `plan-sdlc/tasks-heading` counts exactly once each (`plan-prepare-exec.yaml:1094`): the Section Order item 8 line, the Per-Task Block intro line and the `## Tasks` / `### Task 1: JWT utility module` example lines. Brief F-trivial-compact-contract-and-tasks-heading-gate-22.

**Acceptance criteria:**
- [ ] The compact subsection shows one full Trivial task in compact form and states the R45/R46 invariant word for word as the spec states it.
- [ ] The stable-fields section names: column-0 `**Goal:**` and `**Source:**` header lines; `**Source:**` may be rewritten by downstream tools such as lift-planning `add-plan`; the header keeps its `**Field:**` lines after `**Goal:**`; non-task sections add no list checkboxes.
- [ ] The `plan-sdlc/tasks-heading` case still finds each of its four strings once: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/tasks-heading"` passes.

**Contract:**
- shape (docs): MODIFY the reference (audience: plan authors and the content-coverage lane). New subsection text, in order: (1) when allowed: Trivial tasks only, `**Contract:**` and `**Notes:**` only; (2) the compact Contract line form `**Contract:** shape (<code|docs|openspec>): …; names: …[; sync: …]` with `mirror`, `decisions` and `example` left out; (3) the compact Notes line `**Notes:** <one sentence of rationale>`; (4) the invariant (own `### Task N:` heading, own `**Acceptance criteria:**` `- [ ]` list, no batching, no checkboxes in compact blocks); (5) PF7 enforces the Trivial-only rule; (6) worked example = the Task 2 block from Task 4's fixture.
- names: headings `### Compact Trivial blocks`, `## Stable fields (downstream tools)`.
- mirror: the worked examples at `plan-format-reference.md:232-262`; the Document Header section at `:7-27`.
- decisions: Key Decision "Compact form is checked by PF7".
- sync: R45/R46 invariant text (Task 1); fixture task (Task 4).

### Task 6: SKILL.md and review-loop.md — Lightweight route, R73, R74, routing, one format gate

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1, Task 3, Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — argument-hint; Step 0 flag and routing; skeleton Tasks rule; Step 2 compact blocks and R73; Step 4 R74; Step 5 pointer; Step 6.6 one block
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — route from `tier` and `dispatch`, not task counts
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add case `plan-sdlc/lightweight-sentinels:`
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — behavioural cases `P2-fanout` (line 57), the R64 material-change case (line 1374) and the R64 contract-change case (line 1399) follow the new routing; verified by review only (never run)
- Modify: `tests/promptfoo/fixtures/plan-sdlc-c2-contract-change.md` — the plan under review gets one Complex task, and the shown `diff-material` output gains `dispatch` and `recheckLanes`

**Notes:** The skill reads script fields only: `flags.lightweight`, `tier`, `review`, `dispatch`, `recheckLanes` (`scripts-over-llm-logic`, `flag-resolution-single-source`). R74 reuses Step 3's dispatch rule and run-time table, so no dispatch parameter is added (`agent-dispatch-script-driven`). Workspace modes: every new call takes the literal plan path and `critiqueDir`, so branch and worktree modes behave the same. Prose follows R71: one shell per Bash call, `cp` before the edit, no shell variable across calls. Do not touch the "5+ tasks" Key Decisions rule (`plan-reviewer.md:53`; brief F-step5-reviewer-routing-in-plan-js-21).

**Acceptance criteria:**
- [ ] SKILL.md frontmatter `argument-hint` reads `"[--spec] [--from-openspec <change-name>] [--quality speed|balanced|quality] [--lightweight] [spec-file-path]"`; Step 0 passes `--lightweight` to plan.js and routes on `flags.lightweight === true`.
- [ ] Step 0 skeleton text says the `## Tasks` heading is written verbatim and Step 2 keeps it and inserts the task blocks under it; the existing string `the literal \`## Tasks\` heading (PF10 checks it)` stays once.
- [ ] Step 2 allows compact `**Contract:**`/`**Notes:**` on Trivial tasks (pointer to the reference subsection) and ends with the R73 block; Step 4 holds the R74 block; both follow the Contract.
- [ ] Step 6.6 has one validator block with `--final --template`; the text "PF9 and PF10 do not apply" is gone from SKILL.md.
- [ ] The material-change case states that Task 2 is Complex (so its rubric's three lenses still hold).
- [ ] The `P2-fanout` behavioural case states a 7-task plan with one Complex task and `review.route: "fan-out"`; the contract-change case and its fixture show `dispatch.lanes` `["content-coverage","guardrail-compliance"]` and `dispatch.lenses` `["architecture","risk"]`, and its rubric names `dispatch` instead of `affectedLanes` (`test-coverage-required`: the old cases assert the task-count route).
- [ ] review-loop.md routes by `review.route` (first iteration) and `dispatch.lenses`/`dispatch.lanes` (merged re-dispatch); it no longer contains `≥5 tasks` or `<5 tasks`.
- [ ] Case `plan-sdlc/lightweight-sentinels:` asserts the strings above (counts: `plan.js" tier --plan` ≥ 1 in SKILL.md, `--final --template` exactly 1 in SKILL.md, `PF9 and PF10 do not apply` 0, `recheckLanes` ≥ 1, review-loop.md `≥5 tasks` 0 and `dispatch.lenses` ≥ 1), and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/"` passes.

**Contract:**
- shape (code): SKILL.md blocks to add (each fenced command is one plain Bash call):

  Call order on the Lightweight route (Steps 2–6.6), after this task:

  | # | Step | Action | Branch |
  |---|---|---|---|
  | 1 | end of Step 2 | `plan.js tier --plan` (R73) | `tier: "full"` → print the breach line, go to 2 and later run Steps 5–6 instead of 4–7 here |
  | 2 | Step 3 | today's Step 3 in `<critiqueDir>/iter-0` | — |
  | 3 | Step 4, before fixes | `cp` the plan to `<critiqueDir>/iter-0/plan-before.md` | escalated runs skip 3–7 |
  | 4 | Step 4 | apply the Step 3 fixes | — |
  | 5 | Step 4, after fixes | `plan.js diff-material … --prev-dir <critiqueDir>/iter-0` | non-zero exit → `recheckLanes` = every lane |
  | 6 | Step 4 | Step 3 deterministic block in `iter-1`; then `recheckLanes` non-empty → dispatch them and `merge-lanes --lanes … --carry iter-0 --plan`; empty → `merge-lanes --plan` (checks-only) | — |
  | 7 | Step 4 | fix the blocking issues once; no further round; markers not re-written | — |
  | 8 | Step 6.5, 6.6 | links, then the one `--final --template` validator block | — |

  R73, at the end of Step 2, only on the Lightweight route:

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" tier --plan "<PLAN_PATH>"
  ```

  Read `tier`. `lightweight`: continue; Step 4 runs R74. `full`: print `--lightweight bounds exceeded: <bound value>max, …` and continue as a full-pipeline run from Step 3 (Steps 5–6 run; R74 does not; exploration is not re-run).

  R74, in Step 4, Lightweight route without escalation. Before the fixes: `cp "<PLAN_PATH>" "<critiqueDir>/iter-0/plan-before.md"`. After the fixes:

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<critiqueDir>/iter-0/plan-before.md" --after "<PLAN_PATH>" --prev-dir "<critiqueDir>/iter-0"
  ```

  Then, with `<ITER_DIR>` = `<critiqueDir>/iter-1`: run the Step 3 deterministic block (its `mkdir -p "<ITER_DIR>"` creates `iter-1`; `iter-0` exists from Step 3); when `recheckLanes` is non-empty, dispatch those lanes in one message (Step 3 rule, skip rules and run-time table), write their JSON, and run `merge-lanes --dir "<ITER_DIR>" --lanes "<recheckLanes>" --carry "<critiqueDir>/iter-0" --plan "<PLAN_PATH>" [--no-guardrails]`; when it is empty, run `merge-lanes --dir "<ITER_DIR>" --plan "<PLAN_PATH>"` (checks-only). Fix the blocking issues once; no further round; markers are not re-written. A non-zero `diff-material` exit counts as material with `recheckLanes` = every lane (E9 rule).

  Step 5 entry (first iteration), all full-pipeline runs: run `plan.js tier --plan "<PLAN_PATH>"` and dispatch `review.lenses` (`all` → `reviewerDispatch`, else the named `lensReviewers[]` entries). Step 6.6, one block:

  ```bash
  node "<PLUGIN_ROOT>/scripts/ci/validate-plan-format.js" --markdown --file "<PLAN_PATH>" --final --template "<activeTemplatePath>" --root "$PWD"
  ```

  review-loop.md and plan-reviewer.md, before → after:

  ```diff
  -**For plans with ≥5 tasks — Multi-lens fan-out:** Dispatch ALL lens reviewers from `lensReviewers[]` (P17) in a SINGLE message as parallel Agent tool calls. Do not dispatch them sequentially. <!-- R-orchestrator-await -->
  +**When `review.route` is `fan-out` — Multi-lens fan-out:** Dispatch the `lensReviewers[]` entries (P17) named in `review.lenses` (first iteration, from `plan.js tier`) in a SINGLE message as parallel Agent tool calls. Do not dispatch them sequentially. <!-- R-orchestrator-await, R36 -->
  ```

  ```diff
  -For plans with <5 tasks, dispatch one reviewer, `reviewerDispatch` (P25), by the same rule, including the R8 author rule (`description: "plan review"`).
  +When `review.route` is `single`, dispatch one reviewer, `reviewerDispatch` (P25), by the same rule, including the R8 author rule (`description: "plan review"`).
  ```

  ```diff
  -- **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>` (the PF checks always re-run), then dispatch in one message the lanes and lenses named in `diff-material`'s `affectedLanes` from Step 6 (same skip rules; `lens:<name>` is that `lensReviewers[]` entry, `lens:all` the single reviewer); when `affectedLanes` is `["*"]` (a `taskCount` change), all Step 3 lanes and all `lensReviewers[]` (P17, or the single reviewer for <5-task plans). …
  +- **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>` (the PF checks always re-run), then dispatch in one message the lanes in `diff-material`'s `dispatch.lanes` and the lenses in its `dispatch.lenses` from Step 6 (same skip rules; `all` is the single reviewer). `dispatch` already resolves `["*"]` (a `taskCount` or `reviewRoute` change) to every lane and the after plan's lens set. …
  ```

  Behavioural dataset `plan-sdlc.yaml`, P2-fanout case:

  ```diff
  -      Run /plan-sdlc. The plan has 7 tasks (>=5) and is written by sonnet.
  +      Run /plan-sdlc. The plan has 7 tasks, one of them Complex, and is written by sonnet; plan.js tier returned review.route "fan-out".
  ```

  Its description `for >=5-task plans` becomes `for fan-out-route plans`, and the rubric's `for a >=5-task plan` becomes `for a fan-out-route plan`. Material-change case (a 5-task plan that would now get the single reviewer):

  ```diff
         Run /plan-sdlc. Step 5 iteration 1 returned Issues Found. Step 6 IMPROVE just added a new
  -      Task 5 to resolve the findings (taskCountBefore=4, taskCountAfter=5 — see context). Evaluate
  +      Task 5 to resolve the findings (taskCountBefore=4, taskCountAfter=5 — see context); Task 2 is Complex, so the review route is fan-out. Evaluate
  ```
 Contract-change case (line 1399):

  ```diff
     assert:
       - type: icontains
  -      value: "affectedLanes"
  +      value: "dispatch"
       - type: icontains
         value: "--carry"
       - type: llm-rubric
         value: >
           The response sets `materialChangeDetected` to true from the `contracts` trigger and uses
  -        `affectedLanes` to choose the agents. In ONE message it dispatches only the content-coverage
  +        `dispatch.lanes` and `dispatch.lenses` to choose the agents. In ONE message it dispatches only the content-coverage
  ``` Fixture `plan-sdlc-c2-contract-change.md` line 49, before → after:

  ```diff
  -{ "material": true, "triggers": ["contracts"], "details": { "contracts": ["Task 3"] }, "affectedGates": ["G14", "G18", "G19", "G20", "G21"], "affectedLanes": ["content-coverage", "guardrail-compliance", "lens:architecture", "lens:risk"] }
  +{ "material": true, "triggers": ["contracts"], "details": { "contracts": ["Task 3"] }, "affectedGates": ["G14", "G18", "G19", "G20", "G21"], "affectedLanes": ["content-coverage", "guardrail-compliance", "lens:architecture", "lens:risk"], "rerun": [], "dispatch": { "lanes": ["content-coverage", "guardrail-compliance"], "lenses": ["architecture", "risk"] }, "recheckLanes": ["content-coverage", "guardrail-compliance"] }
  ```

  and its plan description (lines 27–29):

  ```diff
   ## Plan under review: "Catalog price-sync" (5 tasks)
   
  -The plan has 5 tasks, and the task count is unchanged by Step 6.
  +The plan has 5 tasks, one of them (Task 2) Complex, so its review route is fan-out; the task count is unchanged by Step 6.
  ```
- names: `flags.lightweight`, `tier`, `review.route`, `review.lenses`, `dispatch.lanes`, `dispatch.lenses`, `recheckLanes`, `<critiqueDir>/iter-0/plan-before.md`, `<critiqueDir>/iter-1`, case `plan-sdlc/lightweight-sentinels: SKILL.md and review-loop.md read the routing fields (A5, R73, R74, R36)`.
- mirror: the Step 3 deterministic block and dispatch rule at `SKILL.md:310-340`; the material-change block at `review-loop.md:78-92`; the `plan-sdlc/tasks-heading` `-e` case at `plan-prepare-exec.yaml:1091-1100`.
- decisions: Key Decisions "Every route runs `--final`", "R74 lane choice is a field"; Deviations rows "Lightweight scorecard", "R73/R74 scope", "Blocking issues after the R74 re-check".
- sync: A5, R36, R73, R74, R53 (Task 1); `tier` and `dispatch` fields (Tasks 2–3); user docs (Task 7).

### Task 7: User docs — plan-sdlc reference, site copy, skills metadata

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — `--lightweight` row in `## Flags`; Complexity Routing note; Step 5 routing rule; compact Trivial blocks; PF7, PF9, PF10 lines in `## Format Validation`
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`)
- Modify: `site/src/data/skills-meta.ts` — plan-sdlc `plan-review` step description names the shape rule; `explore` step names `--lightweight`
- Modify: `plugins/sdlc-utilities/agents/plan-reviewer.md` — frontmatter `description` only (diff in the Contract)
- Modify: `README.md` — check only: the plan-sdlc row (line 50) lists no flags; no change expected

**Notes:** The copy rule requires these files whenever SKILL.md or the spec changes (brief F-lightweight-flag-and-tier-bounds-check-15, F-step5-reviewer-routing-in-plan-js-24). `docs/cost-tiers.md` has no task-count routing text (grep at HEAD), so it is not touched here; part 2 adds its agent row.

**Acceptance criteria:**
- [ ] The Flags table has a `--lightweight` row (description: forces the Lightweight route; bounds check R73; one cheap re-check R74; `--quality` applies only after escalation; default Off).
- [ ] `agents/plan-reviewer.md` frontmatter no longer says "fewer than 5 tasks".
- [ ] The doc states the R36 shape rule and that `plan.js tier` decides it; PF9 and PF10 lines say they run on every route; PF7 names the compact Trivial rule.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0; `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` reports no difference.

**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` (audience: plugin users). Flags table row:

  | Flag | Description | Default |
  |---|---|---|
  | `--lightweight` | Force the Lightweight route: no exploration fan-out, no review loop. After decomposition `plan.js tier` checks the bounds (6 tasks, 0 Complex, 8 files, no OpenSpec); a breach runs the review loop. One cheap re-check of the changed lanes follows the Step 4 fixes. `--quality` applies only after a breach. | Off |

  `agents/plan-reviewer.md` line 3:

  ```diff
  -description: Single plan reviewer for plan-sdlc Step 5 on plans with fewer than 5 tasks that checks every review category (lens all) and returns the lens JSON block.
  +description: Single plan reviewer for plan-sdlc Step 5 on the single-reviewer route (R36) that checks every review category (lens all) and returns the lens JSON block.
  ```

  Leave the "5+ tasks" Key Decisions rule at `plan-reviewer.md:53` alone (brief F-step5-reviewer-routing-in-plan-js-21). In `skills-meta.ts`, the `plan-review` description gains: `one reviewer, or three lenses when the plan has a Complex task, 8+ tasks or OpenSpec work (plan.js tier)`.
- names: flag `--lightweight`; ids A5, R36, R73, R74, PF7, PF9, PF10.
- mirror: the `--quality` Flags row at `docs/skills/plan-sdlc.md:32`; the `## Format Validation` bullets at `:556-563`.
- decisions: user-facing prose only; no script field names beyond `plan.js tier`.
- sync: SKILL.md (Task 6); spec (Task 1).

## Final Shape

When all seven tasks are done:

- `plan-sdlc --lightweight` writes a full-format plan without the exploration fan-out. A script bounds check decides whether the plan is small enough to skip the review loop. One cheap re-check follows the Step 4 fixes.
- `plan.js tier --plan <path>` prints the tier, the broken bounds and the reviewer route. `diff-material` prints the lanes and lenses to re-dispatch and the R74 lane list.
- Step 5 runs one reviewer for small, low-risk plans and three lenses for plans with a Complex task, 8 or more tasks, or OpenSpec work. The skill reads the choice from the script.
- Trivial tasks may use one-line Contract and Notes blocks. PF7 allows them on Trivial tasks only.
- Every plan, on every route, passes `validate-plan-format.js --final --template`. A missing `## Tasks` heading gets an exact fix line.
- lift-planning still reads every plan: own task headings, own checkbox lists, column-0 Goal and Source lines.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9411 --lightweight flag (A5) | Task 1, Task 3, Task 6, Task 7 | covered |
| 2 #9411 R73 tier bounds check | Task 1, Task 2, Task 3, Task 6 | covered |
| 3 #9411 R74 cheap second critique | Task 1, Task 2, Task 6 | covered |
| 4 #9412 compact Trivial blocks | Task 1, Task 4, Task 5 | covered |
| 5 #9414 ## Tasks heading | Task 4, Task 6 | covered |
| 6 #9417 R36 routing by plan shape | Task 1, Task 2, Task 3, Task 6, Task 7 | covered |
| 7 #9420 routing and R74 lane choice as plan.js fields | Task 2, Task 3 | covered |
| 8 #9415 full format, --final, no waiver | Task 1, Task 4, Task 6 | covered |
| 9 #9416 lift-planning compatibility | Task 1, Task 4, Task 5 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
