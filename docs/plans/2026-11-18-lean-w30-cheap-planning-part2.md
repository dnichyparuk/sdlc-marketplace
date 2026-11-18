# Cheap Planning (part 2): Critique Orchestrator and Critique Scripts Implementation Plan

**Commit:** `feat(#9421): plan - critique orchestrator and scripts`
**Goal:**
- Move the mechanics of each plan critique round out of the Opus author's context: three new script entry points (`critique-prep`, `splice`, `merge-lanes --compact`) and one Sonnet agent, `plan-critique-orchestrator`.
- The author keeps the creative work (decomposition, fixes, menus) and reads only a short, script-rendered blocking list per round.
- Expected effect: Opus cost per plan from about $3.6 to $2.2–2.4.
**Architecture:** Stage 1 adds the scripts in `scripts/lib/plan-critique.js` and `scripts/skill/plan.js`. Stage 2 adds `agents/plan-critique-orchestrator.md` (new R75, new P26 `critiqueDispatch`) and rewires SKILL.md and review-loop.md: one orchestrator call per critique round (Step 3, the R74 re-check, each Step 5 iteration), with the in-skill dispatch kept as the fallback. The orchestrator reads part 1's routing fields (`tier.review`, `diff-material.dispatch`, `recheckLanes`).
**Source:** conversation context (wave w31 brief, tracking #9421; items #9418, #9419; builds on part 1 `docs/plans/2026-11-18-lean-w30-cheap-planning.md`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (each task names its pattern)

---

## Context

**What problem does this change solve?**

- Each critique round makes the Opus author run five or more Bash calls, dispatch four to seven agents, read their raw JSON, write it to files, and read `merged.json`. All of that sits in the most expensive context of the run.
- None of it is creative. Scripts already decide the merge, the gates and the routing. A Sonnet agent can carry the dispatch and the file handling.

**What prompted this change now?**

- The architect report "split creative and orchestration" (strong) recommends this split, staged: scripts first (b), then the agent (a). The owner accepted joint planning with part 1 on 2026-11-18.

**What does success look like?**

- The author calls the orchestrator once per round and reads back a short blocking list. It never reads raw lane JSON or `merged.json`.
- The orchestrator never asks the user. It returns `guardrail-block` or `max-iterations`, and the author shows the menus (R19, R22).
- When plan-sdlc runs too deep to have an Agent tool for the orchestrator's lanes, the orchestrator returns `no-agent-tool` and the author uses today's in-skill dispatch.

## Research Findings

Facts at HEAD `aeb1e47` (part 1 merged as PR #107, v0.55.0), re-verified with file and line evidence.

- `plan.js` registers subcommands in three places: `SUBCOMMANDS`, `SUBCOMMAND_FLAGS` and `BOOLEAN_FLAGS` (`scripts/skill/plan.js:342-353`; brief F-critique-round-scripts-and-orchestrator-agent-1). Today: four subcommands (`diff-material`, `g17-prepare`, `merge-lanes`, `tier`); `BOOLEAN_FLAGS` holds `--no-guardrails`, `--full`, `--g17-not-run`. Usage errors exit 1, crashes exit 2, JSON goes to stdout (`runSubcommand`, `:433-457`, F-critique-round-scripts-and-orchestrator-agent-2).
- The merge logic lives in `scripts/lib/plan-critique.js:497-813` (`mergeLanes` `:661-813`, its return object `:800-812`); exports at `:815-818` (`diffMaterial`, `planShape`, `reviewRoute`, `tierCheck`, `mergeLanes`, `renderG17`, `renderScorecard` and others); `merged.json` is large (F-critique-round-scripts-and-orchestrator-agent-3).
- Part 1 routing fields: `tierCheck` returns `review: { route, lenses }` from `reviewRoute(planShape(text))` (`lib/plan-critique.js:114-147`); `diffMaterial` returns `dispatch: { lanes, lenses }` and `recheckLanes` (`dispatch.lanes` when material, else `[]`) (`:172-216`); `mergeLanes` has a checks-only mode: no lanes, lenses or carry, with `--plan` (`:663-665`).
- The Step 3 mechanics are mkdir, validator, g17-prepare, lane dispatch, lane JSON writes, merge-lanes and two markers (`SKILL.md:314-381`, F-critique-round-scripts-and-orchestrator-agent-5). Step 4 splices Guardrail Compliance and Suggested Review Dimensions (`SKILL.md:393-412`), then runs the R74 cheap second critique: author-run `diff-material`, then `iter-1` deterministic block, `recheckLanes` dispatch and a `--carry iter-0 --plan` merge, or the checks-only merge when `recheckLanes` is empty (`SKILL.md:416-440`). Step 5 replaces the Verification Scorecard (`review-loop.md:65-67`, F-critique-round-scripts-and-orchestrator-agent-7).
- `--g17-not-run` after part 1's fix commits: a g17-prepare failure passes it to every Step 4 (R74) and Step 5 `merge-lanes` call of the run (`SKILL.md:336`, `:431`; spec R31 `docs/specs/plan-sdlc.md:88`, R74 `:86`). The checks-only call at `SKILL.md:436` does not show the flag yet.
- R8 author rule: when a lens entry's `dispatchModel` is null (`balanced`), `model: opus` is passed only when the plan author ran on sonnet (`review-loop.md:49`). The lens-only Step 5 merge reads only `lens` from `merged.json` (`review-loop.md:58`); its carried lane issues are not the iteration's issue list.
- Agent dispatch values come from prepare output in the agent-dispatch shape (P15) via `INPUT_NAMES` (`plan.js:176-186`), `buildDispatch` (`:221-226`) and `buildDispatchSet` (`:241-256`); the null-`agentPath` warning loop is at `:665-667`, the prepare output object at `:680-697` (F-critique-round-scripts-and-orchestrator-agent-10). The highest spec ids are R74 (`docs/specs/plan-sdlc.md:86`) and P25 (`:205`), so R75 and P26 are free.
- `plan-explore-orchestrator.md` shows the orchestrator frontmatter and the await barrier pattern (R56) (`agents/plan-explore-orchestrator.md:1-7`, F-critique-round-scripts-and-orchestrator-agent-8).
- `validate-cost-tiers.js` requires one agent-table row per agent file (`scanAgents` `scripts/ci/validate-cost-tiers.js:106-128`, `MISSING_DOC` at `:235`, F-critique-round-scripts-and-orchestrator-agent-16).
- The guardrail lane returns `guardrailCompliancePayload` as the full markdown table (`agents/plan-lane-guardrail.md:60-71`); merge-lanes returns `g17Findings.rendering` (`lib/plan-critique.js:616`).
- Exec cases for plan.js live in `tests/promptfoo/datasets/plan-prepare-exec.yaml` (100 cases at HEAD; `plan-format-exec.yaml` has 55 and is not changed). Count checks over files this plan changes: `plan-sdlc/lightweight-sentinels` (`plan-prepare-exec.yaml:1214`, counts in SKILL.md and review-loop.md) and `plan-sdlc/tasks-heading` (`:1203`, SKILL.md). Runner scripts live in `tests/promptfoo/scripts/` (for example `run-plan-explore-check-brief.js`).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Who runs `splice` | no | The author runs `plan.js splice` (one Bash call) after the orchestrator returns; the orchestrator never writes the plan file | The brief requires one writer of the plan file and an orchestrator that writes only under `critiqueDir`. A script call made by the author keeps both. |
| `--compact` output | no | `merge-lanes --compact` writes the full result to `<dir>/merged.json` itself and prints only the summary | `splice` and the next round still need the full result; nobody has to read it into an LLM context. |
| Orchestrator scope per round | no | One call covers one round: deterministic checks, dispatch, merge, summary; for a Step 5 iteration after a fix it also runs `diff-material` | The routing decision stays in script fields (part 1); the author only copies the plan before its fixes. |
| Markers | no | `guardrailsEvaluated` and `critiqueRan` stay with the author, written after the Step 3 orchestrator returns `ok` | R20 markers prove the author's run; a subagent writing them could not be told apart from the parent (R20 note). |
| Flag name `--compact` | no | merge-lanes gets `--compact`, not the `--summary` the brief named | `ship.js review-gate` already takes `--summary <path>` with another meaning (`scripts/skill/ship.js:1868`); `flag-semantic-consistency-cross-skill` forbids one name with two meanings. |
| Tracking ids | no | The PR body names #9421, #9418, #9419 with no `Fixes`/`Closes` keyword | Internal register ids, not GitHub issues; overrides `pr-link-github-issue`. |
| `G17_NOT_RUN` input, `g17NotRun` return | no | P26 gains input `G17_NOT_RUN`; the return block gains `g17NotRun`; the author passes `G17_NOT_RUN: true` to every round after one returned `g17NotRun: true`, and logs the R31 line | Part 1 as merged: R31 and R74 pass `--g17-not-run` to every Step 4 (R74) and Step 5 merge; one orchestrator call cannot see an earlier round's g17-prepare failure. |
| `AUTHOR_MODEL` input | no | P26 gains input `AUTHOR_MODEL` (`opus` or `sonnet`); for a lens or reviewer with null `dispatchModel` the orchestrator passes `model: opus` only when it is `sonnet` | Part 1 as merged: the R8 author rule (`review-loop.md:49`); the Sonnet orchestrator cannot know the author's model. |
| Lens-only `--compact` summary | no | When `--lanes` is absent or empty and `--lenses` is set, `blockingCount` and `summary` count only blocking `lens.issues` | Part 1 as merged: the lens-only Step 5 merge reads only `lens` (`review-loop.md:58`); carried lane issues were already fixed. |
| Checks-only `--g17-not-run` | no | The SKILL.md checks-only fallback call (`SKILL.md:436`) gains `[--g17-not-run]`, and the orchestrator passes it there too | Part 1 as merged: R31 names every Step 4 (R74) merge; the flag is harmless in checks-only mode (`lib/plan-critique.js:661-813`). |

## Key Decisions

- **Scripts first, then the agent.** Tasks 2–3 give every mechanical step a single script call. Task 4 adds the agent that strings the calls together. If the agent is unavailable, the author strings the same calls together itself. The alternative (agent only) would put the mechanics into agent prose, against `scripts-over-llm-logic`.
- **`critique-prep` reports, it does not stop.** A g17-prepare failure becomes `g17NotRun: true` (R31). A validator exit 2 makes `critique-prep` exit 2, so E9 holds.
- **`splice` decides sections from `merged.json`, not from flags.** It writes `## Guardrail Compliance` when `guardrailCompliancePayload` is non-null and `--no-guardrails` is absent, `## Suggested Review Dimensions` when `g17Findings.findings` is non-empty, and `## Verification Scorecard` when `scorecard` is non-null. A section that already exists is replaced in place (R44). One rule set, no per-step flags.
- **Sonnet for the orchestrator.** It runs scripts and dispatches agents, the same job as `plan-explore-orchestrator` (sonnet/medium, `docs/cost-tiers.md:49`). Opus would undo the saving.
- **The orchestrator never asks.** It returns a status. The Opus author owns every AskUserQuestion and the harden offer (R19, R22).
- **No-agent-tool fallback.** The orchestrator checks for the Agent tool first. Without it, it returns `status: no-agent-tool` and does nothing else; the author runs the part 1 in-skill dispatch. This keeps plan-sdlc working at depth 2 or more.
- **Smallest viable cut.** All six tasks are needed for the cost cut; docs are required by the copy rule and `validate-cost-tiers.js`.
- **Explicit non-goals.** No change to lane or lens prompts or to any gate definition; no change to how the brief path and output path reach plan-sdlc; no Sonnet planner; no orchestration-skill edit.
- **Failure audience.** A wrong orchestrator return would hide blocking issues from the author: the plan ships under-reviewed and execute workers pay for it. The await barrier and the script-rendered summary limit that risk.

## Decisions taken without the owner

No owner was available (`--auto` planning run). Each item took the recommended or most conservative option:

- **`splice` runs in the author, not the orchestrator:** this keeps one writer of the plan file (Deviations row "Who runs splice").
- **`--compact` instead of `--summary`:** `ship.js review-gate` already uses `--summary <path>` with another meaning.
- **Markers stay with the author:** they are written after the Step 3 round returns.
- **Cost-tiers row stays in Task 6:** it ships in the same PR as the agent, so the validators are green at PR time.
- **Review loop cap:** iteration 3 still flagged G21 (two prose-only rubric edits) on Task 5. The recommended max-iterations option, fix and proceed, was taken: both edits now carry diffs, with no fourth round.

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
| test-coverage-required | error | PASS | Tasks 2-5 add promptfoo exec cases; Task 5 updates the stale behavioural plan-sdlc.yaml cases; Tasks 1 and 6 change only specs and docs |
| no-ci-bypass | error | PASS | No step skips or disables CI; validators are run |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the stated cheap-planning requirements; non-goals listed |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Mechanics moved into critique-prep, splice and merge-lanes --compact |
| yagni | warning | PASS | No speculative abstractions; every task serves the cost cut |
| cross-skill-consistency | error | PASS | Orchestrator mirrors plan-explore-orchestrator; fallback keeps depth-2 behaviour |
| pr-link-github-issue | error | N/A | #9421, #9418, #9419 are internal register ids, not GitHub issues; the project notes forbid a closing keyword |
| dry | warning | PASS | critique-prep and splice are shared by the orchestrator and the fallback |
| kiss | warning | PASS | Scripts first, then one agent |
| spec-first | error | PASS | Task 1 updates the spec before the SKILL.md task (Task 5) |
| project-agnostic | error | PASS | All changes are in plugin scripts, agents and skills |
| flag-coherence-cross-skill | error | PASS | The orchestrator consumes resolved prepare and script fields (tier.review, recheckLanes, skipDimensionCoverage) |
| no-opposite-logical-vectors | error | PASS | Gate phrasings are single-sourced via script output |
| flag-resolution-single-source | warning | PASS | Section selection is resolved once in splice from merged.json |
| state-premise | error | PASS | Context names the root problem: mechanical critique work sits in the Opus context |
| smallest-viable-cut | warning | PASS | Key Decisions justify all six tasks |
| failure-audience | warning | PASS | Names the under-reviewed plan and the execute workers who pay for it |
| explicit-non-goals | warning | PASS | Non-goals listed in Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are decided in Key Decisions |
| state-machine-idempotency | error | PASS | splice idempotency is tested; no migration or preflight logic changes |
| agent-dispatch-script-driven | error | PASS | Dispatch values come verbatim from prepare output (P26, buildDispatch) |
| flag-semantic-consistency-cross-skill | error | PASS | Grep of plugins/*/scripts/skill/*.js at HEAD: --critique-dir, --iter, --merged, --compact are unused; --summary is avoided because ship.js review-gate uses --summary <path> with another meaning |
| workspace-mode-compatibility | error | PASS | Literal plan path and critiqueDir are passed; --root defaults to the active worktree top in both modes |
| prompt-cache-hit-ratio | warning | PASS | Orchestrator prose keeps volatile values out of the prefix |

## Suggested Review Dimensions

### UPDATE: code-quality (B1)

**Why:** Tasks 2-4 change the plan.js command-line contract.

**Severity hint:** high

**Patch:** Check the new CLI surface in plan.js and lib/plan-critique.js and the new runner and sentinel scripts.

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — Check the new CLI surface in plan.js and lib/plan-critique.js and the new runner and sentinel scripts.

### UPDATE: runtime-contract (B1)

**Why:** Task 2 registers critique-prep and --compact in plan.js, Task 3 adds splice, Task 4 adds the five-status return block, and Task 5 rewires SKILL.md around critiqueDispatch.

**Severity hint:** high

**Patch:** Check new plan.js subcommands (critique-prep, splice), the merge-lanes --compact flag, the P26 critiqueDispatch shape and the orchestrator status/return contract for exit codes, output shapes and spec-id sync.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check new plan.js subcommands (critique-prep, splice), the merge-lanes --compact flag, the P26 critiqueDispatch shape and the orchestrator status/return contract for exit codes, output shapes and spec-id sync.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 and Task 6 touch docs/specs/plan-sdlc.md, docs/cost-tiers.md and site/src/data/skills-meta.ts.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_1 additional candidates suppressed_

## Tasks

### Task 1: Spec — R75, P26, critique scripts, orchestrator contract

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — add R75 and P26; amend R20, R35, R36, R64, R67, E9, I-section; history rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`)

**Notes:** Spec first (`spec-first` guardrail). R75 follows R72's shape (contract plus threat model plus accepted gaps) and R56/R-c1's await barrier (brief F-critique-round-scripts-and-orchestrator-agent-14). Part 1 already took A5, R73 and R74.

**Acceptance criteria:**
- [ ] R75 states the orchestrator contract of the Contract, including the await barrier, the five statuses, the write scope and the threat model with its accepted gaps.
- [ ] P26 `critiqueDispatch` is in `## Prepare script contract`; R67 lists `critique-prep`, `splice` and `merge-lanes --compact` with their output shapes.
- [ ] R20, R35, R36 and R64 say who dispatches (the orchestrator, or the author on `no-agent-tool`) and that the markers stay with the author.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; `cmp` of the spec and its site copy reports no difference.

**Contract:**
- shape (openspec): ADD R75, P26; MODIFY R20, R35, R36, R64, R67, E9, I5. Delta text:

  | Id | Kind | Delta |
  |---|---|---|
  | R75 | ADD | Critique orchestrator: `agents/plan-critique-orchestrator.md` (sonnet) runs one critique round per call: Step 3, the R74 re-check, or one Step 5 iteration. It runs `plan.js critique-prep`, dispatches the lanes and lenses named by the round (Step 3: every lane; R74: `recheckLanes`; Step 5: `tier.review.lenses`, or `diff-material` `dispatch` after a fix) in one message, writes each returned JSON block verbatim under `<critiqueDir>/iter-<k>/`, and runs `merge-lanes --compact`, with `--g17-not-run` on every R74 and Step 5 merge when `G17_NOT_RUN` is true or this round's g17-prepare failed (R31). For a lens or reviewer with null `dispatchModel` it passes `model: opus` only when `AUTHOR_MODEL` is `sonnet` (R8). Await barrier: it collects exactly one result per dispatched agent before merging (R56, R-c1). It never asks the user; it returns one fenced JSON block `{ status, iterDir, blockingCount, summary, lensStatus, verdict, guardrailErrors, g17NotRun }` with `status` one of `ok`, `guardrail-block` (an error-severity G14 failure, R19), `max-iterations` (iteration 3 with blocking issues), `no-agent-tool` (no Agent tool; nothing else done), `error` (a script exit 2 or merge failure, E9). It writes only under `critiqueDir`; the author alone writes the plan file and the R20 markers. Threat model: catches a round that merges partial results or hides blocking issues behind prose (the summary is script-rendered). Accepted gap: an orchestrator that writes invented lane JSON is not detected. |
  | P26 | ADD | `critiqueDispatch` (object) — the orchestrator in the agent-dispatch shape (P15); agent `sdlc:plan-critique-orchestrator`; inputs `ROUND`, `ITER`, `CRITIQUE_DIR`, `PLAN_FILE_PATH`, `PREPARE_OUTPUT`, `DISPATCH`, `CARRY`, `BEFORE_PLAN`, `G17_NOT_RUN`, `AUTHOR_MODEL`, `REQUIREMENTS_SUMMARY` (also sent as `REQUIREMENTS_CHECKLIST`), `SOURCE_REQUIREMENTS`, `BRIEF_FILE`, `BRIEF_FINDING_IDS`, `PLAN_TEMPLATE_PATH`; no preset inputs. |
  | R67 | MODIFY | Six subcommands (today four: (a) merge-lanes, (b) diff-material, (c) g17-prepare, (d) tier). (e) `critique-prep --critique-dir <d> --iter <k> --plan <p> [--github-hosting true\|false] [--root <dir>]`; (f) `splice --plan <p> --merged <path> [--no-guardrails]`; (a) `merge-lanes … --compact`. `critique-prep` → `{ iterDir, pf: { exit, failed }, g17NotRun, g17: { candidates, coveredDims }, skipDimensionCoverage }`, exit 2 on a validator exit 2; `splice` → `{ written, replaced }` (section names); `--compact` writes `<dir>/merged.json` and prints `{ blockingCount, lensStatus, verdict, guardrailErrors, summary }`; on a lens-only merge (no `--lanes` values) `blockingCount` and `summary` count only blocking `lens.issues`. |
  | R20, R35, R36, R64 | MODIFY | The dispatch, JSON writes and merges of each round are done by the R75 orchestrator; on `no-agent-tool` the author does them as before. The author writes `guardrailsEvaluated` and `critiqueRan` after the Step 3 round returns `ok`, `guardrail-block` or `max-iterations`. |
  | E9 | MODIFY | Add: an orchestrator `error` status stops plan-sdlc the same way. |
  | I5 | MODIFY | Add: `agents/plan-critique-orchestrator.md` runs the critique rounds (R75). |
- names: R75, P26 `critiqueDispatch`; history row `R75, P26, R20, R35, R36, R64, R67 | critique orchestrator and scripts, #9418, #9419`.
- mirror: R72 at `docs/specs/plan-sdlc.md:81`; R56 at `:80`; P25 at `:205`; R67 at `:208`; E9 at `:226`; I5 at `:315`; last history row at `:402`.
- decisions: Key Decisions "Scripts first", "The orchestrator never asks"; Deviations rows "Who runs splice", "Markers".
- sync: site byte copy; Tasks 2–6 cite these ids.

### Task 2: plan.js — `critique-prep` and `merge-lanes --compact`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — add `critiquePrep`, `renderSummary`; export both
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — register `critique-prep` in `SUBCOMMANDS` and `SUBCOMMAND_FLAGS` (`:342-351`); add `compact` to the `merge-lanes` flag list and `'--compact': 'compact'` to `BOOLEAN_FLAGS` (`:353`)
- Create: `tests/promptfoo/scripts/run-plan-critique-prep.js` — runner: makes a temp dir, runs `critique-prep` on a fixture plan (or, as `run-plan-critique-prep.js merge-lanes <args>`, copies `fixtures-fs/plan-merge-lanes` into the temp dir and runs `merge-lanes` there), prints `{ exit, out, files }`, removes the dir
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add two `plan-critique-prep:` and two `plan-merge: (compact)` cases (100 → 104 cases)

**Notes:** One call replaces three Bash blocks (mkdir, validator, g17-prepare) so the orchestrator and the fallback both use it (DRY). The runner owns its temp dir because a dataset line cannot run `mktemp`. Brief F-critique-round-scripts-and-orchestrator-agent-3, -23.

**Acceptance criteria:**
- [ ] `critique-prep` creates `<d>/iter-<k>/`, writes `pf-report.json` and `g17-prepare.json`, and prints the Contract shape (case `plan-critique-prep: (a) writes both reports`, via the runner, on `fixtures-fs/project-valid-plan/plans/test-plan.md`).
- [ ] A g17-prepare failure gives exit 0 with `g17NotRun: true` and no `g17-prepare.json` (case `plan-critique-prep: (b) g17 failure is reported, not fatal`: the runner passes `--root` a temp dir whose `.sdlc/review-dimensions` is a regular file: `loadCatalog` checks only `existsSync` and then `readdirSync` throws ENOTDIR, `lib/plan-critique.js:281-283`).
- [ ] `merge-lanes --dir plan-merge-lanes --lanes static-structural --lenses architecture,requirements,risk --compact` prints only the summary object and writes the full result to `<dir>/merged.json` (case `plan-merge: (compact) prints the rendered blocking list`; the runner copies the fixture dir to a temp dir first so the fixture stays clean).
- [ ] `merge-lanes --dir <copy>/carry/cur --lenses architecture,risk --carry <copy>/carry/prev --compact` gives `blockingCount` equal to the count of blocking `lens.issues` in the written `merged.json`, and no lane issue in `summary` (case `plan-merge: (compact) lens-only round counts only lens issues`, via the runner).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-critique-prep:|plan-merge:"` passes.

**Contract:**
- shape (code):

  ```text
  node plan.js critique-prep --critique-dir <d> --iter <k> --plan <p> [--github-hosting true|false] [--root <dir>]
    exit 0 JSON | 1 usage | 2 crash or validator exit 2 (E9)
  node plan.js merge-lanes … --compact      writes <dir>/merged.json, prints the summary
  ```

  `critique-prep` output:

  ```json
  { "iterDir": "<d>/iter-1", "pf": { "exit": 1, "failed": ["PF13"] },
    "g17NotRun": false, "g17": { "candidates": 2, "coveredDims": 1 },
    "skipDimensionCoverage": false }
  ```

  The validator runs as `validate-plan-format.js --json --file <p> --root <active worktree top>`; g17-prepare uses the SKILL.md defaults (`.sdlc/review-dimensions`, `.github/instructions`, `.sdlc/learnings/log.md`, `--window 14`), resolved under `--root` (default: the active worktree top, so branch and worktree modes read the plan's own checkout). `skipDimensionCoverage` is true when the candidates and covered dimensions are both empty. `--compact` output:

  ```json
  { "blockingCount": 2, "lensStatus": "Issues Found", "verdict": "…Fix before archiving.",
    "guardrailErrors": 0,
    "summary": "- [G12] Task 3: depends on nonexistent Task 9 (validate-plan-format)\n- …" }
  ```

  `summary` lists only `blocking: true` issues, one line each: `- [<gateId or lane>] <taskRef or plan>: <message> (<lane>)`. On a lens-only merge (`--lanes` absent or `""`, `--lenses` set) `summary` and `blockingCount` take only the blocking `lens.issues`, because the carried lane results are not this iteration's issue list (`review-loop.md:58`); otherwise they take `issues`, the same set as the script's `blockingCount`. `guardrailErrors` counts blocking issues with `gateId` `G14`. `lensStatus` is `lens.status` and `verdict` is `scorecard.verdict`, each null when absent. `critique-prep` passes `--github-hosting` on to g17-prepare.
- names: `critiquePrep`, `renderSummary`, subcommand `critique-prep`, flag `--compact`, runner `run-plan-critique-prep.js`.
- mirror: `runG17Prepare`, `runMergeLanes` and `buildCopyCheck` at `plan.js:382-431`; `mergeLanes` return object at `lib/plan-critique.js:800-812`; runner style of `tests/promptfoo/scripts/run-plan-explore-check-brief.js`.
- decisions: Key Decision "critique-prep reports, it does not stop"; Deviations rows "`--compact` output", "Flag name `--compact`".
- sync: R67 (Task 1); orchestrator prose (Task 4); SKILL.md fallback (Task 5).

### Task 3: plan.js — `splice`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — add pure `splicePlan(text, merged, { noGuardrails })`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — register `splice` in `SUBCOMMANDS` and `SUBCOMMAND_FLAGS` (flags `plan`, `merged`, `no-guardrails`; `--no-guardrails` is already in `BOOLEAN_FLAGS`); it writes the plan file and prints the result
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add three `plan-splice:` cases (104 → 107 cases; via `-e` calling `splicePlan` on fixture text, so no fixture is written)
- Create: `tests/promptfoo/fixtures-fs/plan-splice/plan.md` — plan with tasks, `## Final Shape` and an old `## Verification Scorecard`
- Create: `tests/promptfoo/fixtures-fs/plan-splice/merged.json` — payload, two G17 findings and a scorecard

**Notes:** Placement follows the existing rules exactly (KD6, R44): Guardrail Compliance after the last task block, Suggested Review Dimensions after Guardrail Compliance (else after the last task block), Verification Scorecard after Suggested Review Dimensions, else Guardrail Compliance, else the last task block. Replacement makes re-runs idempotent. Brief F-critique-round-scripts-and-orchestrator-agent-7.

**Acceptance criteria:**
- [ ] `splicePlan` on the fixture writes the three sections in the placement order above and replaces the old scorecard (case `plan-splice: (a) places and replaces sections`).
- [ ] A second `splicePlan` on its own output returns the same text (case `plan-splice: (b) idempotent`).
- [ ] With `noGuardrails: true`, or `g17Findings.findings` empty, or `scorecard: null`, the matching section is not written (case `plan-splice: (c) skips absent data`).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-splice:"` passes.

**Contract:**
- shape (code):

  ```text
  node plan.js splice --plan <p> --merged <merged.json> [--no-guardrails]
    exit 0 → { "written": ["Guardrail Compliance", "Verification Scorecard"], "replaced": ["Verification Scorecard"] }
  ```

  Section bodies: `## Guardrail Compliance` + blank line + `guardrailCompliancePayload`; the `g17Findings.rendering` text verbatim; `scorecard.markdown` verbatim. A section ends at the next `## ` heading outside a fence (use `sectionBody`'s fence-aware walk, `walkLines`; note `sectionBody` also stops at a `### Task N:` line, which never follows these sections).
- names: `splicePlan`, subcommand `splice`, cases `plan-splice:`.
- mirror: Step 4 placement text at `SKILL.md:393-412`; Gate B placement at `review-loop.md:65-67`; `sectionBody` in `lib/plan-parse.js:262-277`.
- decisions: Key Decision "splice decides sections from merged.json"; Deviations row "Who runs splice".
- sync: R67(f) (Task 1); SKILL.md Step 4 and review-loop Gate B (Task 5).

### Task 4: plan-critique-orchestrator agent and `critiqueDispatch`

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — the R75 agent
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `INPUT_NAMES['plan-critique-orchestrator']` (`:176-186`); `critiqueDispatch` in `buildDispatchSet` (`:241-256`), its destructuring at `:664` and the prepare output (`:680-697`); the null-`agentPath` check loop (`:665-667`)
- Create: `tests/promptfoo/scripts/check-plan-critique-orchestrator.js` — sentinel check of the agent text
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add `plan-prepare: (critique-dispatch)` and `plan-sdlc/critique-orchestrator-sentinels:` cases (107 → 109 cases)

**Notes:** The agent runs at depth 2 under a depth-1 author, so its lanes and lenses run at depth 3; they need no Agent tool. It dispatches each entry from the prepare output file verbatim (`agent-dispatch-script-driven`) and passes `model`/`effort` from non-null `dispatchModel`/`dispatchEffort`, plus the R8 author rule through `AUTHOR_MODEL` (`review-loop.md:49`). The invalid-`--quality` case (`plan-prepare-exec.yaml:421`) expects only `errors,flags` keys; that path exits before `buildDispatchSet`, so it stays green. Prose follows R71: one shell per Bash call; Read an empty file once before a Write after `mktemp`. Prompt cache: no dates, cwd or run ids above the inputs (`prompt-cache-hit-ratio`). Brief F-critique-round-scripts-and-orchestrator-agent-6, -8, -22, -25.

**Acceptance criteria:**
- [ ] The agent frontmatter is `name: plan-critique-orchestrator`, `tools: Read, Write, Bash, Agent`, `model: sonnet`, `effort: medium`, with a one-sentence description.
- [ ] The body follows the Contract's step list and return block; the sentinel script finds: the await-barrier sentence, all five statuses, `never ask`, `only under`, `critique-prep`, `merge-lanes`, `--compact`, `diff-material`, `--g17-not-run`, `G17_NOT_RUN`, `AUTHOR_MODEL`, and no `AskUserQuestion` call and no `--mark`.
- [ ] Prepare output has `critiqueDispatch` with `agent: "sdlc:plan-critique-orchestrator"`, a non-null `agentPath`, `model: "sonnet"` and the P26 `inputNames` (case `plan-prepare: (critique-dispatch) entry in the agent-dispatch shape`).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-prepare:|plan-sdlc/critique-orchestrator"` passes.

**Contract:**
- shape (code): agent steps, in order:
  1. If no Agent tool is available, return `{"status":"no-agent-tool"}` and stop.
  2. `ROUND` is `step5` and `BEFORE_PLAN` is set: run `plan.js diff-material --before <BEFORE_PLAN> --after <PLAN_FILE_PATH> --prev-dir <CARRY>`; when `material`, dispatch `dispatch.lanes` and `dispatch.lenses` (merged re-dispatch, R64); else the lenses of `DISPATCH`. A non-zero `diff-material` exit counts as material with every lane and every `lensReviewers[]` entry, and no `--carry` (`review-loop.md:97`, E9).
  3. Run `plan.js critique-prep --critique-dir <CRITIQUE_DIR> --iter <ITER> --plan <PLAN_FILE_PATH> --github-hosting <githubHosting.detected from PREPARE_OUTPUT>`; exit 2 → `error`. `g17NotRun` for this round is `G17_NOT_RUN` or the `g17NotRun` field of this output.
  4. Dispatch every chosen lane and lens in one message from the entries in `PREPARE_OUTPUT` (`subagent_type: entry.agent`; one `NAME: value` line per `inputNames` entry, from `presetInputs` or the run-time inputs; `model`/`effort` from non-null `dispatchModel`/`dispatchEffort`; a lens or reviewer whose `dispatchModel` is null gets `model: opus` only when `AUTHOR_MODEL` is `sonnet`, R8; lanes get no `model` or `effort`). The `inputNames` and `presetInputs` in `PREPARE_OUTPUT` are the single source of each lane's inputs; `FIRED_CRITERIA_JSON` is the content of `<iterDir>/g17-prepare.json` written by `critique-prep`. Skip rules: no guardrail lane when its `ACTIVE_GUARDRAILS` is `[]`; no dimension-coverage lane when `g17NotRun` (left out of `--lanes`) or `skipDimensionCoverage` (write `{"candidates":[]}` instead); no entry whose `agentPath` is null. Await barrier: exactly one result per dispatched agent.
  5. Write each final fenced `json` block verbatim to `<iterDir>/<lane>.json` or `lens-<lens>.json`.
  6. Run `plan.js merge-lanes --dir <iterDir> --compact` with these flags:

     | Flag | When |
     |---|---|
     | `--lanes <csv>` | the lanes dispatched or written by hand (dimension-coverage `{"candidates":[]}` when skipped for no candidates); `""` for a lens-only Step 5 round |
     | `--lenses <csv>` | Step 5: the lenses dispatched (`all` for the single reviewer) |
     | `--no-guardrails` | `ACTIVE_GUARDRAILS` is `[]` in the lane entry (one decision for the whole run, whether or not `guardrail-compliance` is in this round's set; `SKILL.md:431`) |
     | `--g17-not-run` | `ROUND` is `r74` or `step5` and this round's `g17NotRun` (step 3) is true; this includes the R74 checks-only merge (R31, `docs/specs/plan-sdlc.md:88`) |
     | `--carry <CARRY>` | `CARRY` is not `none` and the dispatch set is not everything |
     | `--plan <PLAN_FILE_PATH>` | Step 3, R74 and merged re-dispatch rounds (copy check) |
     | `--inventory`, `--gate-a` | Step 5, when `<CRITIQUE_DIR>/inventory.json` or `gate-a.json` exists |
  7. Return:

  ```json
  { "status": "ok", "iterDir": "/tmp/sdlc-plan-critique-x/iter-1", "blockingCount": 2,
    "summary": "- [G12] Task 3: …", "lensStatus": "Issues Found",
    "verdict": "…Fix before archiving.", "guardrailErrors": 0, "g17NotRun": false }
  ```

  `g17NotRun` is this round's value from step 3; the author passes it on as `G17_NOT_RUN` to every later round.

  `status` decision, first matching row wins:

  | Condition | `status` |
  |---|---|
  | no Agent tool | `no-agent-tool` |
  | a script exit 2, or a non-zero `merge-lanes` exit | `error` |
  | `guardrailErrors > 0` | `guardrail-block` |
  | `ROUND` = `step5` and `ITER` = 3 and `blockingCount > 0` | `max-iterations` |
  | otherwise | `ok` |

  R74 round with an empty `DISPATCH` (part 1 `recheckLanes: []`): skip steps 4–5 and run the checks-only form `plan.js merge-lanes --dir <iterDir> --plan <PLAN_FILE_PATH> [--g17-not-run] --compact` (no `--lanes`, `--lenses` or `--carry`; `lib/plan-critique.js:663-665`). `plan.js` `INPUT_NAMES` entry lists the P26 inputs; `critiqueDispatch = buildDispatch('plan-critique-orchestrator', {})`.
- names: agent `plan-critique-orchestrator`, field `critiqueDispatch`, inputs `G17_NOT_RUN`, `AUTHOR_MODEL`, return field `g17NotRun`, statuses `ok`, `guardrail-block`, `max-iterations`, `no-agent-tool`, `error`; sentinel script `check-plan-critique-orchestrator.js`.
- mirror: `agents/plan-explore-orchestrator.md:1-7` frontmatter and its await-barrier wording; `tests/promptfoo/scripts/check-plan-explore-sentinels.js` for the sentinel script; `buildDispatchSet` at `plan.js:241-256`; R74 merge rules at `SKILL.md:425-439`.
- decisions: Key Decisions "The orchestrator never asks", "No-agent-tool fallback"; Deviations rows "Orchestrator scope per round", "Markers".
- sync: R75, P26 (Task 1); `docs/cost-tiers.md` agent row (Task 6).

### Task 5: SKILL.md and review-loop.md — one orchestrator call per round

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1, Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 3 (`:314-381`) and the R74 re-check (`:416-440`) call `critiqueDispatch`; fallback on `no-agent-tool`; markers after the Step 3 return; Step 4 runs `plan.js splice`; the checks-only fallback call (`:436`) gains `[--g17-not-run]`
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — each iteration is one orchestrator call; Gate B via `plan.js splice`; menus on `guardrail-block` and `max-iterations`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add case `plan-sdlc/critique-rounds:` (109 → 110 cases)
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — behavioural cases `P1-fanout` (line 31), the material-change case and the contract-change case (line 1399) expect one `critiqueDispatch` call per round, with the direct dispatch as the `no-agent-tool` fallback; header comment line 26; verified by review only (never run)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only, do not edit: `openspec-flow.md`, `plan-format-reference.md`, `plan-template-default.md` and `state-format.md` say nothing about who dispatches critique rounds; no change expected (copy rule; this entry gives the directory one owner)

**Notes:** Brief F-critique-round-scripts-and-orchestrator-agent-5, -6, -7, -22, -25. The author still copies the plan to `<critiqueDir>/iter-<k>/plan-before.md` before each Step 6 fix pass (part 1 `review-loop.md:84-90` material-change block); iteration k+1 passes that file as `BEFORE_PLAN`. The author keeps running the Step 4 `diff-material` of R74 (`SKILL.md:416-422`) and passes `recheckLanes` (every lane on a non-zero exit) as `DISPATCH`. It passes `G17_NOT_RUN: true` to every round after a return with `g17NotRun: true` and logs the R31 line `## YYYY-MM-DD — plan-sdlc: G17 not run — g17-prepare exited <code>` itself (the orchestrator writes only under `critiqueDir`); it passes its own model as `AUTHOR_MODEL`. Count checks over the changed files keep their values: `plan-sdlc/lightweight-sentinels` (`plan-prepare-exec.yaml:1214`) stays `tier >= 1`, `final === 1`, `noApply === 0`, `recheck >= 1`, `lightweight >= 1`, `ge5 === 0`, `lt5 === 0`, `lenses >= 1` (so SKILL.md keeps `recheckLanes` and review-loop.md keeps `dispatch.lenses`); `plan-sdlc/tasks-heading` (`:1203`) stays `skill === 1`; the needles of `check-plan-lens-sentinels.js` and `check-plan-explore-sentinels.js` in SKILL.md stay. The part 1 in-skill dispatch text stays as the fallback section, so behaviour at depth 2 or more is unchanged. The author never reads `merged.json`; it uses the orchestrator's `summary` for its fixes and `plan.js splice` for the sections. Workspace modes: every call takes the literal plan path and `critiqueDir`, so branch and worktree modes behave the same.

**Acceptance criteria:**
- [ ] Step 3 dispatches `critiqueDispatch` once with `ROUND: step3`, `ITER: 0`, `G17_NOT_RUN: false` and `AUTHOR_MODEL`; on `no-agent-tool` it runs the fallback dispatch; it writes the two markers after the return; it reads only the returned block; on `g17NotRun: true` it logs the R31 line and passes `G17_NOT_RUN: true` to every later round.
- [ ] The R74 re-check dispatches `critiqueDispatch` once with `ROUND: r74`, `ITER: 1`, `DISPATCH` = `recheckLanes` and `CARRY: <critiqueDir>/iter-0`; the fallback checks-only call reads `merge-lanes --dir "<ITER_DIR>" --plan "<PLAN_PATH>" [--g17-not-run]`.
- [ ] Step 4 runs `plan.js splice --plan "<PLAN_PATH>" --merged "<iterDir>/merged.json"` with `iterDir` from the Step 3 round's return (plus `--no-guardrails` when the guardrail lane was skipped) instead of hand-written sections; Gate B uses the latest Step 5 round's `iterDir` the same way.
- [ ] review-loop.md: each iteration is one orchestrator call (`ROUND: step5`, `BEFORE_PLAN` from iteration 2); `guardrail-block` shows the R19 menu; `max-iterations` shows the max-iterations menu; Gate B runs `plan.js splice`.
- [ ] The three behavioural cases in `plan-sdlc.yaml` describe the orchestrator round (one `critiqueDispatch` Agent call, `ROUND`/`ITER`/`CARRY` inputs, markers written by the author after it returns) and keep the direct dispatch only as the `no-agent-tool` path (`test-coverage-required`: they assert the author runs merge-lanes today).
- [ ] Case `plan-sdlc/critique-rounds:` asserts: `critiqueDispatch` ≥ 2 in SKILL.md and ≥ 1 in review-loop.md, `no-agent-tool` ≥ 1 in each, `plan.js" splice` ≥ 1 in each; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/"` passes.

**Contract:**
- shape (code): SKILL.md Step 3 block, before → after:

  ```diff
  -mkdir -p "<ITER_DIR>"  … validator … g17-prepare … one Agent call per lane … merge-lanes …
  +Dispatch `critiqueDispatch` (P26) once: ROUND: step3, ITER: 0, CRITIQUE_DIR: <critiqueDir>,
  +PLAN_FILE_PATH, PREPARE_OUTPUT: <PLAN_OUTPUT_FILE>, DISPATCH: all, CARRY: none, BEFORE_PLAN: none,
  +G17_NOT_RUN: false, AUTHOR_MODEL: <your model>, and the run-time table values. Read its fenced JSON.
  +status no-agent-tool → "Fallback dispatch" (today's text); error → E9; guardrail-block → Step 4 harden offer;
  +ok → write the markers, fix `summary` issues. g17NotRun true → log the R31 line; G17_NOT_RUN: true from now on.
  ```

  SKILL.md R74 checks-only fallback call (`:436`), before → after:

  ```diff
  -   node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --plan "<PLAN_PATH>" > "<ITER_DIR>/merged.json"
  +   node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --plan "<PLAN_PATH>" [--g17-not-run] > "<ITER_DIR>/merged.json"
  ```

  Behavioural dataset `plan-sdlc.yaml` (review-only edits). Header comment:

  ```diff
  -#   plan-sdlc-c2-contract-change       -- CORRECT: one Contract edit; R64 selective re-dispatch of the affectedLanes, the rest carried with merge-lanes --carry
  +#   plan-sdlc-c2-contract-change       -- CORRECT: one Contract edit; the next critique-orchestrator round re-dispatches only diff-material's dispatch set and carries the rest
  ```

  P1-fanout case, `user_request` and rubric:

  ```diff
         (guardrails is empty). Describe exactly how Step 3 dispatches its gate evaluations.
  +      The orchestrator agent file exists (critiqueDispatch.agentPath is set).
  ```

  ```diff
  -    - type: icontains
  -      value: "merge-lanes"
  +    - type: icontains
  +      value: "critiqueDispatch"
  ```

  Its rubric becomes: the author dispatches `critiqueDispatch` once with `ROUND: step3`; the orchestrator runs `critique-prep`, dispatches static-structural, content-coverage and dimension-coverage in one message (guardrail-compliance skipped), merges with `merge-lanes --compact`; the author writes `guardrailsEvaluated` and `critiqueRan` after the round returns; on `no-agent-tool` the author runs the same steps itself. Material-change and contract-change cases (text as part 1 leaves it):

  ```diff
         Task 5 to resolve the findings (taskCountBefore=4, taskCountAfter=5 — see context); Task 2 is Complex, so the review route is fan-out. Evaluate
  -      the Step 6 material change detector, then describe exactly how the NEXT Step 5 iteration
  -      dispatches its agents.
  +      the Step 6 material change detector, then describe exactly how the NEXT Step 5 critique-orchestrator
  +      round (ROUND: step5, BEFORE_PLAN set) dispatches its agents.
  ```

  ```diff
  -      Contract line in Task 3 (see context, including the diff-material output). Describe exactly
  -      how the NEXT Step 5 iteration dispatches its agents and how it merges the results.
  +      Contract line in Task 3 (see context, including the diff-material output). Describe exactly
  +      how the NEXT Step 5 critique-orchestrator round dispatches its agents and how it merges the results.
  ```

  Both rubrics add one sentence: "The author dispatches `critiqueDispatch` once; the orchestrator runs `diff-material`, the deterministic checks, the dispatch and `merge-lanes --compact`; the author reads only the returned summary." Their agent sets, await barrier, `--carry` and one-iteration counting stay unchanged. The fixture `plan-sdlc-c2-contract-change.md` needs no change (its text stays true when the orchestrator does the work).

  Step 4 and Gate B splice from the latest round's file: `plan.js splice --plan "<PLAN_PATH>" --merged "<iterDir>/merged.json"` with `iterDir` from the orchestrator's return; a section whose data is null in that file is left untouched (Step 5 rounds have no Guardrail Compliance or G17 data, so only the scorecard is replaced).

  Per-round inputs:

  | Round | `ROUND` | `ITER` | `DISPATCH` | `CARRY` | `BEFORE_PLAN` | splice afterwards |
  |---|---|---|---|---|---|---|
  | Step 3 | `step3` | `0` | `all` | `none` | `none` | Step 4: Guardrail Compliance and Suggested Review Dimensions |
  | R74 re-check | `r74` | `1` | `recheckLanes` (may be empty) | `<critiqueDir>/iter-0` | `none` | none |
  | Step 5, k = 1 | `step5` | `1` | `tier` `review.lenses` | `<critiqueDir>/iter-0` | `none` | Verification Scorecard |
  | Step 5, k ≥ 2 | `step5` | `k` | `tier` `review.lenses` (the orchestrator replaces it with `diff-material` `dispatch` when material) | `<critiqueDir>/iter-<k-1>` | `<critiqueDir>/iter-<k-1>/plan-before.md` | Verification Scorecard |

  `splice` leaves a section untouched when its data is null in the given `merged.json`. Every round passes `AUTHOR_MODEL`; every round after Step 3 passes `G17_NOT_RUN: true` once a round returned `g17NotRun: true`, else `false`.
- names: `critiqueDispatch`, rounds `step3`, `r74`, `step5`, inputs `G17_NOT_RUN`, `AUTHOR_MODEL`, section heading `Fallback dispatch (no-agent-tool)`, case `plan-sdlc/critique-rounds:`.
- mirror: the Step 1 orchestrator dispatch at `SKILL.md:143-153`; the part 1 Step 3 (`:314-381`) and R74 (`:416-440`) text.
- decisions: Deviations rows "Who runs splice", "Markers"; Key Decision "No-agent-tool fallback".
- sync: R20, R35, R36, R64, R75 (Task 1); agent (Task 4); docs (Task 6).

### Task 6: Docs — plan-sdlc reference, cost tiers, site copies, skills metadata

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — Step 3 and Step 5 text name the critique orchestrator; marker timing (lines 373–374: markers written by the author after the Step 3 orchestrator round returns); Gate B (line 528: `plan.js splice` writes the scorecard); `## What It Creates or Modifies` adds `iter-<k>/merged.json` written by `--compact`
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy
- Modify: `docs/cost-tiers.md` — agent-table row `plan-critique-orchestrator | sonnet | medium | One critique round: scripts, dispatch and merge; returns a script-rendered blocking list`
- Modify: `site/src/content-source/cost-tiers.md` — byte copy
- Modify: `site/src/data/skills-meta.ts` — plan-sdlc `critique-plan` and `plan-review` descriptions name the orchestrator

**Notes:** `validate-cost-tiers.js` fails without the agent row (brief F-critique-round-scripts-and-orchestrator-agent-16). The copy rule requires the plan-sdlc doc, its site copy and the metadata.

**Acceptance criteria:**
- [ ] The doc says each critique round runs in the Sonnet orchestrator and that the author falls back to direct dispatch when the orchestrator has no Agent tool.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`, `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.
- [ ] `cmp` of each doc and its site copy reports no difference.

**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` (audience: plugin users). Marker table rows and Gate B sentence:

  ```diff
  -| `guardrailsEvaluated` | End of Step 3 — fires once `plan.js merge-lanes` has merged the lane results (with or without the guardrail-compliance lane) |
  -| `critiqueRan` | After Step 3 JOIN barrier — fires when every dispatched lane has returned and `merge-lanes` has produced the merged result |
  +| `guardrailsEvaluated` | End of Step 3 — written by plan-sdlc after the Step 3 critique round returns (its merge-lanes has merged the lane results, with or without the guardrail-compliance lane) |
  +| `critiqueRan` | After the Step 3 critique round returns — every dispatched lane has returned and `merge-lanes` has produced the merged result |
  ```

  ```diff
  -At Step 5 (after the lens merge), `plan.js merge-lanes` builds the **`## Verification Scorecard`** section from the lens JSON results, and plan-sdlc writes it to the plan file verbatim.
  +At Step 5 (after the lens merge), `plan.js merge-lanes` builds the **`## Verification Scorecard`** section from the lens JSON results, and plan-sdlc writes it into the plan file with `plan.js splice`.
  ```

  Step 3 paragraph gains "The lanes run inside one `plan-critique-orchestrator` call (Sonnet); the plan author reads only its blocking list." Step 5 paragraph gains the same for each iteration. MODIFY `docs/cost-tiers.md` §4 with the row above, placed after `plan-explore-orchestrator`.
- names: agent `plan-critique-orchestrator`; ids R75, P26.
- mirror: the `plan-explore-orchestrator` row at `docs/cost-tiers.md:49`; the Step 3 paragraph at `docs/skills/plan-sdlc.md:83` and the Step 5 paragraph at `:85`; the `critique-plan` and `plan-review` entries at `site/src/data/skills-meta.ts:40`, `:45`.
- decisions: user-facing prose only.
- sync: byte copies under `site/src/content-source/`.

## Final Shape

When all six tasks are done:

- Each critique round (Step 3, the R74 re-check, each Step 5 iteration) is one `plan-critique-orchestrator` call on Sonnet. It runs the scripts, dispatches the lanes and lenses, waits for every result and returns a short script-rendered blocking list.
- The Opus author decomposes, fixes, runs `plan.js splice` for the generated sections, writes the markers and shows every menu.
- When the orchestrator has no Agent tool, the author runs the same scripts and dispatches directly, as in part 1.
- `docs/cost-tiers.md` lists the new agent; the validators stay green.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9418 critique-prep | Task 2 | covered |
| 2 #9418 splice | Task 3, Task 5 | covered |
| 3 #9418 compact blocking list | Task 2 | covered |
| 4 #9419 orchestrator agent | Task 4, Task 5 | covered |
| 5 R75, P26, amendments | Task 1, Task 4 | covered |
| 6 Docs | Task 6 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
