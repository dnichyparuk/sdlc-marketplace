# Lean w9b: execute cost and plan review Implementation Plan

**Commit:** `fix(#9359): execute - blocking wave wait, lens runtime checks`
**Goal:**
- Stop the execute orchestrator and the wave-runner from spinning hundreds of turns while they wait for a wave.
- Give the plan risk lens and the single plan reviewer a runtime-semantics checklist, and give the planner the matching "every copy" rule.
- Drop four review dimensions of this repository that found almost nothing.
**Architecture:** The root problem is that execute-plan-sdlc tells a subagent to wait for its workers with `Monitor`, but `Monitor` returns at once, so the agent loops on `Monitor` calls and leaves hundreds of timers that wake it again after it has handed back. The fix adds one blocking verb, `state/execute.js wave-progress --wait`, that a foreground Bash call runs for up to 9 minutes, and makes it the only way the orchestrator and the wave-runner wait (spec R92, R86, R91 and R-WAVE-DEADLINE reworded). The plan-review part is prose in the lens agents and the planner (plan-sdlc R71), and the dimension part deletes four project config files.
**Source:** conversation context (lean ledger findings F-54, F-43, F-52, F-6, F-35, F-42, F-44, F-49, F-51; tracking id #9359)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- In wave lean-w9a the execute step cost $34.34 of a $51.86 ship.
- The execute orchestrator made 823 model turns. 497 of its tool calls were `Monitor` calls such as `sleep 1500; echo tick`, and 121 more were `git status --short` polls.
- `Monitor` starts a background watch and returns at once. So the agent never really waited. It looped about once per second for 35 minutes.
- Every one of those 487 timers fired later. After its report, the agent was woken 42 times by timer events and 85 times by "report not delivered" nudges, and it re-sent its report 13 times.
- The four wave-runners had the same pattern on a smaller scale (16 to 44 `Monitor` calls each).
- Plan review lenses also let five plan defects through. Each one was a runtime-semantics defect: a Write without a Read (F-49), a `not-regex` with a bare pipe (F-44), a quote-blind command rule (F-51), a missed copy of a changed pattern (F-42), and a missed companion file (F-35).

**What prompted this change now?**

- Ledger finding F-54 (high): 955 turns and $34 in one execute step.
- The findings-distribution analysis for F-52: lens-risk had 0 blocking findings in 12 runs, and four review dimensions found 0 or 1 high findings in 3 to 11 runs.

**What does success look like?**

- The orchestrator and the wave-runner wait in one blocking call per wait, not one turn per second.
- They start no timers, so nothing wakes them after the hand-back.
- The risk lens and the single reviewer check tool contracts, regex escaping, quote handling, every copy of a changed value, and environment assumptions.
- The review run of this repository no longer runs `script-resolution`, `hook-readiness`, `release-consistency` or `type-safety-review`.

## Research Findings

**Execute wait loop (F-54, F-43).**

- The orchestrator transcript of w9a (`subagents/agent-a239bb6de2f8d39ca.jsonl`, agent type `sdlc:ship-step-execute`) has 823 assistant messages. Its tool calls are `Monitor` 497, `Bash` 180, `SubagentHandback` 23, `Agent` 6. 487 of the `Monitor` commands are `sleep 1500; echo tick`.
- Calls per 10 minutes: 88 (21:0x), 227 (21:1x), 220 (21:2x), 96 (21:3x), 82 (21:4x). The run handed back at 21:45:38. The late notifications were the agent's own timers ("leftover wait for wave 3 runner timer events").
- The skill tells it to do this. `skills/execute-plan-sdlc/SKILL.md` "No hand-back mid-wave (R86)" says "Wait with the `Monitor` poll of the wave deadline below". Step 2 of "Wave deadline" says "Poll with `Monitor`, using an interval of `waveInterval` seconds" (F-execute-orchestrator-turn-cost-1, F-execute-orchestrator-turn-cost-6).
- `skills/execute-plan-sdlc/wave-runner-template.md` §2b has the same text: "keep polling with Monitor until every worker has returned".
- The wave-runner transcripts show the same loop: wave 2 runner 44 `Monitor` calls, wave 4 runner 20, wave 1 runner 16.
- The `Monitor` tool contract says a monitor "streams events … you keep working and notifications arrive", and a deadline above 1800000 ms is capped to 1800000 ms. The skill text "`Monitor.timeout_ms` caps at 3600000" is wrong.
- A foreground Bash call is the only primitive that blocks inside one turn. Its `timeout` parameter allows up to 600000 ms.
- Workers already write progress markers through `state/execute.js wave-progress --wave <n> --run-id <id> --task <id> --phase <phase>`. The phases are `started`, `reading`, `editing`, `verifying`, `reporting` (`scripts/lib/wave-progress.js`, `VALID_PHASES`). `cmdWaveProgress` in `scripts/state/execute.js` has a write mode and a `--read` mode only.
- R91 (stale hand-backs) is already in the spec at HEAD. It cannot prevent a turn per notification, because the harness wakes the agent for each one (F-execute-orchestrator-turn-cost-3). The plugin can only remove the source, which is its own timers.
- No orchestrator turn metric exists (F-execute-orchestrator-turn-cost-5). The plugin cannot observe its own model turns; the ledger measures them from transcripts.
- `ship-sdlc/SKILL.md` runs `wave-watch` under `Monitor` in ship's main thread (R92 of the ship spec). That is a real event stream in a context that ends its turn while it waits, so it stays as is (F-execute-orchestrator-turn-cost-2).

**Plan review lenses (F-52, F-35, F-42, F-44, F-49, F-51).**

- `agents/plan-lens-risk.md` focus areas are File paths, Verification strategy, Scope discipline and Guardrail compliance. None of them names tool contracts, regex escaping, quote handling or copies of a changed value (F-plan-lens-runtime-semantics-checklist-2).
- `agents/plan-reviewer.md` (used for plans with fewer than 5 tasks) has its own category table and no `LENS_FOCUS` input, so it needs the same row (F-plan-lens-runtime-semantics-checklist-3).
- `scripts/skill/plan.js` `LENS_DEFS` needs no change if the checklist is folded into the existing risk categories (F-plan-lens-runtime-semantics-checklist-1).
- `skills/plan-sdlc/SKILL.md` Step 2 already has the R70 rule "Every file a task creates … is listed under its **Files:**". It has no rule for copies of a changed pattern or for skill companions (F-35, F-42).
- The next free id in `docs/specs/plan-sdlc.md` is R71. The next free id in `docs/specs/execute-plan-sdlc.md` is R92.

**Review dimensions (F-52).**

- `scripts/lib/dimensions.js` loads every `*.md` file in `.sdlc/review-dimensions/` by a directory scan. No code, test, spec or site file names the four dimensions (F-review-dimensions-load-and-drop-1, F-review-dimensions-load-and-drop-6).
- Copilot mirrors exist in `.github/instructions/` for `script-resolution` and `type-safety-review`. `scripts/ci/validate-copilot-mirror.js` does not report an orphan mirror, so the mirrors must be deleted with their sources (F-review-dimensions-load-and-drop-5).
- CI already covers two of the dropped concerns. `.github/workflows/check-changelog.yml` and `check-version-bump.yml` check release consistency. `.claude/skills/validate-plugin-consistency/check-consistency.js` checks the `<PLUGIN_ROOT>` script-resolution form.

**Plan cost (F-6).**

- The explore step is already skipped for 3 or fewer scope-hint files (R24). The 3 to 5 dimension range is contract in R25 (F-plan-sdlc-planner-cost-cut-1, F-plan-sdlc-planner-cost-cut-3).
- A 3 to 4 cap saves about 20 to 40 percent of the explore spend, which is itself about 10 percent of the plan stage. The Opus planner's own reading and writing is the main cost, and neither knob touches it (F-plan-sdlc-planner-cost-cut-5, F-plan-sdlc-planner-cost-cut-6).
- The review-loop cap of 3 is a bound, not a spend (F-plan-sdlc-planner-cost-cut-4).

**Re-verification at HEAD 420e3c3.**

| Item | Reproduces at HEAD | Evidence | Plan |
|---|---|---|---|
| F-54 | yes | SKILL.md "No hand-back mid-wave (R86)" and "Wave deadline" step 2 still say "Poll with `Monitor`"; wave-runner-template.md §2b the same | Tasks 1 to 3 |
| F-43 | partly | orchestrator share comes from the same wait loop; execute step already on sonnet (`agents/ship-step-execute.md` `model: sonnet`); the estimate model is ledger-side | Tasks 1 to 3; estimate part dropped |
| F-52 (lenses) | yes | `plan-lens-risk.md` focus areas name no runtime-semantics check | Task 4 |
| F-52 (dimensions) | yes | the four files exist in `.sdlc/review-dimensions/` | Tasks 5 and 6 |
| F-6 | yes, no safe cut | see "Plan cost" above | dropped |
| F-35 | yes | plan-sdlc SKILL.md Step 2 has no companion-file rule | Task 4 (R71 d) |
| F-42 | yes | no "every copy" rule in plan-sdlc SKILL.md or the lenses | Task 4 (R71 d) |
| F-44 | yes | no regex-escaping check in any lens | Task 4 (R71 b) |
| F-49 | yes | no tool-contract check in any lens | Task 4 (R71 a) |
| F-51 | yes | no quote-handling check in any lens | Task 4 (R71 c) |

**Test patterns.**

- Exec cases for `state/execute.js` live in `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml`. They copy `tests/promptfoo/fixtures-fs/execute-state-mid-wave` and set `SDLC_STATE_DIR_OVERRIDE`. Run `20250101T000000` has markers for waves 1 (T1 `editing`, T2 `verifying`) and 2 only; wave 3 is free.
- Sentinel checks are small Node scripts in `tests/promptfoo/scripts/` (for example `check-handback-sentinels.js`) called from an exec dataset.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Orchestrator turn count in state (F-54 proposal) | no | not added | the plugin cannot count its own model turns; the ledger already counts them from transcripts |
| F-43 estimate model (step overhead plus per-wave cost) | no | not changed in the plugin | the estimate lives in the lean ledger skill, not in the plugin |
| F-6 explore cap (3 to 4 dimensions) | no | dropped, recorded in Key Decisions | saves about 2 to 4 percent of the plan stage; needs a contract change to R25 and a behavioural rubric edit only an owner run can check |
| Stale notifications "without a turn" (F-54) | no | removes their source (own timers) and makes the reply tool-free | the harness wakes the agent for every notification; the plugin cannot stop that |
| `script-resolution` merged into `runtime-contract` | no | dropped, not merged | `check-consistency.js` already checks the resolution form; a merge grows the `runtime-contract` mirror, which is already over the Copilot limit |
| `type-safety-review` | no | dropped, not merged into `ui-review` | 0 findings in 3 runs; a merge widens a haiku dimension for no measured gain |
| Repo-local dimension files edited | no | deletes 4 files in `.sdlc/review-dimensions/` and 2 mirrors | the brief scopes this to this repository's project config; the plugin itself is unchanged |
| `waveInterval` meaning | no | kept as the poll interval, now of `wave-progress --wait` | no config or flag semantic changes |
| PR issue link (`pr-link-github-issue`) | no | the PR body names #9359 with no `Fixes`/`Closes` keyword | #9359 is an internal register id, not a GitHub issue |
| New flags `--wait`, `--tasks`, `--grace` | no | added to `state/execute.js` only | a state helper script, outside `flag-semantic-consistency-cross-skill`; no user-invoked prepare script defines them |

### Decisions taken without the owner

- Wait primitive: a blocking foreground Bash call to a new `wave-progress --wait` mode, not `Monitor` and not `wave-watch` in the execute subagent. See Key Decisions.
- No turn counter in state; no change to the F-43 estimate model; F-6 dropped.
- All four low-yield dimensions dropped, none merged.
- The runtime-semantics checklist goes into the existing risk categories and the single reviewer; no new lens and no `plan.js` change.

## Key Decisions

- **A blocking Bash wait over `Monitor`.** `Monitor` returns at once and only sends notifications later. A subagent that must not end its turn then has nothing to block on, so it loops. A foreground Bash call blocks for up to 600000 ms. One call of up to 540 seconds turns about 540 turns into one. `wave-watch` under `Monitor` was the alternative (F-execute-orchestrator-turn-cost-2). It has the same non-blocking problem inside a subagent, and it reports only after the orchestrator itself writes `wave-done`.

- **A `--wait` mode on `wave-progress` over a new verb.** The markers it reads are `wave-progress` markers, and `--read` already exists there. One verb keeps the marker logic in one place (DRY).

- **A grace period after all tasks report.** A worker writes `reporting` a few seconds before its Agent return reaches the orchestrator. Without a grace period, a second `--wait` call would return at once and the loop would come back. With `--grace` (default 30 seconds), every call blocks at least that long, so a repeat costs one turn per 30 seconds at most.

- **Timers forbidden, and cleanup before the return.** The late wake-ups came only from the agent's own 487 timers. The rule "never start `Monitor`, a background `sleep` or any other timer to wait; `TaskStop` every background task you started before you return" removes them. This is prose, because the harness gives the plugin no hook on `Monitor` in a subagent.

- **Runtime-semantics checks in lens-risk, not a new lens.** lens-risk had 0 blocking findings in 12 runs, so it has room. A new lens adds a dispatch per iteration. The checklist goes under the existing "Verification strategy" and "Scope discipline" categories, so `LENS_FOCUS`, `plan.js` and the fixtures stay unchanged (F-plan-lens-runtime-semantics-checklist-1).

- **Prose, not a script, for the "every copy" rule.** A script cannot know which literal a task changes before the task is written. The planner rule (R71) and the lens check are the cheapest guard. The `scripts-over-llm-logic` guardrail allows prose where no deterministic signal exists.

- **Drop F-6.** The Opus planner's own reading and authoring is the main plan cost. The explore cap touches a small part of it, and the change can only be checked by an owner-run behavioural test. No safe cut with a measurable gain exists in this wave.

- **Drop four dimensions, keep the opus ones.** `script-resolution` 0 of 10, `hook-readiness` 1 of 11, `release-consistency` 0 of 7, `type-safety-review` 0 of 3 high findings. The opus dimensions `runtime-contract`, `spec-compliance` and `skill-architecture` found 12 of 15 highs, so they stay.

- **Workspace modes.** `--wait` reads markers through `resolveStateDir()` like `--read`, so it finds the main worktree's `.sdlc/execution` under both `ship.workspace=branch` and `ship.workspace=worktree`. It writes nothing. The dimension deletions are git-tracked files and behave the same in both modes.

- **Smallest viable cut.** Tasks 1 to 3 (spec, script, wait rules) are the minimum for F-54, the high finding. Task 4 is the cheapest fix for five escaped plan defects. Tasks 5 and 6 are file deletions with measured zero yield. Task 7 keeps the user docs true. Tasks 8 and 9 remove the wrong `Monitor` cap claim from its other copies, as R71 (d) requires.

- **Who fails if this ships wrong.** If `--wait` never returns early, a wave waits up to 9 minutes per call before the next check, which slows every ship but fails none. If the timer ban is ignored, cost returns to today's level. A wrong lens checklist only adds false advisory findings. A wrong dimension drop removes coverage only for this repository.

- **ship-sdlc's `wave-watch` monitor stays as is.** `ship-sdlc/SKILL.md` starts it with `timeout_ms` 3600000, which the tool caps at 1800000. That only shortens the progress watch in ship's main thread, which ends its turn while it waits, so it causes no loop. Changing it is out of scope.

- **Suggested Review Dimensions are deferred.** The G17 proposals below are advisory input for a later wave. No task applies them, because the `runtime-contract` mirror is already over the Copilot size limit and the requirement asks only to drop low-yield dimensions.

- **Non-goals.** No change to ship-step-review or received-review waiting (they made 22 and fewer `Monitor` calls, a small cost). No change to the plan explore cap, the review-loop cap, the planner model, the worker agents, `wave-watch`, or the medium review findings of waves M1 to M4.

## Contract Examples

**code**

```markdown
**Contract:**
- shape (code): `wave-progress --wave <n> --run-id <id> --wait --tasks <csv> [--interval <s>] [--timeout <s>] [--grace <s>]`; prints one JSON line; exit 0 on done or timeout, exit 2 on a bad argument.
- names: `--wait`, `--tasks`, `--grace`, `cmdWaveProgress`.
- mirror: `cmdWaveWatch` poll loop in `plugins/sdlc-utilities/scripts/state/execute.js`.
- decisions: one verb with a mode (Key Decisions).
- sync: `docs/specs/execute-plan-sdlc.md` R92 text.
```

**docs**

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/execute-plan-sdlc.md` flag and config rows for `waveInterval`; audience end users.
- names: rows `--wave-interval <seconds>` and `waveInterval`.
- mirror: the existing Flags table rows.
- decisions: wording only; defaults unchanged.
- sync: `site/src/content-source/skills/execute-plan-sdlc.md` byte copy.
```

**openspec**

```markdown
**Contract:**
- shape (openspec): ADD `R92` to `docs/specs/execute-plan-sdlc.md` after R91; MODIFY R86, R91 and R-WAVE-DEADLINE; history row `| R92 | blocking wave wait (ledger F-54, F-43), #9359 |`.
- names: `R92` (new); `R86`, `R91`, `R-WAVE-DEADLINE` (modified).
- mirror: R88 to R91 block style.
- decisions: ids stable, next free number.
- sync: SKILL.md and wave-runner-template.md cite R92.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 2, 3 and 4 change code or agent prose and each carries exec cases or sentinel checks; Tasks 5 and 6 only delete config |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config, single run, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a stated finding (F-54, F-52 and related); F-6 explicitly dropped |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (spec, script, wait rules, lens checklist, two dimension drops, docs) |
| scripts-over-llm-logic | error | PASS | Wait logic moved into the deterministic wave-progress --wait script; the R71 checklist is prose only where no deterministic signal exists, justified in Key Decisions |
| yagni | warning | PASS | New flags are each needed (grace prevents the loop returning at once); turn counter and explore cap rejected |
| cross-skill-consistency | error | PASS | Covers SKILL.md, wave-runner-template, ship-step-execute agent, plan-reviewer and lens; ship wave-watch reviewed and kept |
| pr-link-github-issue | error | PASS | #9359 is stated to be an internal register id, not a GitHub issue; the commit message cites it |
| dry | warning | PASS | One verb with a mode reuses readProgress; the shared wait text is cross-referenced to R92 |
| kiss | warning | PASS | Smallest mechanism (blocking Bash call plus one mode); no new lens or gate |
| spec-first | error | PASS | Task 1 (specs R92, R71) precedes Tasks 2 to 4, which depend on it |
| project-agnostic | error | PASS | Behaviour changes ship in plugin code; the dimension deletions are intentionally this-repo config, recorded in Deviations |
| flag-coherence-cross-skill | error | PASS | Consumers cite the single resolved waveInterval and the script output (inFlight); no raw argument inspection |
| no-opposite-logical-vectors | error | PASS | SKILL.md and wave-runner-template use the same wait procedure and gate wording |
| flag-resolution-single-source | warning | PASS | The flags are resolved once in the script; consumers reference the output |
| state-premise | error | PASS | Architecture states the root problem: Monitor returns at once so the agent loops |
| smallest-viable-cut | warning | PASS | Key Decisions identifies Tasks 1 to 3 as minimum and justifies the rest |
| failure-audience | warning | PASS | Key Decisions names who fails if shipped wrong |
| explicit-non-goals | warning | PASS | Non-goals listed in Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (Monitor, wave-watch, merge dimensions, new lens) recorded with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No dispatch model, isolation or args are changed or overridden |
| flag-semantic-consistency-cross-skill | error | PASS | New flags are only in the state/execute.js helper, which is out of scope; no user-invoked prepare script is touched |
| workspace-mode-compatibility | error | PASS | Key Decisions states behaviour for both modes; reads go through resolveStateDir |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B3)

**Why:** Task 2 adds the CLI flags `--wait`, `--tasks` and `--grace` to `state/execute.js` (B1), and Task 3 replaces the non-blocking `Monitor` poll with "blocking `wave-progress --wait` call" (B3).

**Severity hint:** critical

**Patch:** Check that the blocking `wave-progress --wait` call (new `--wait`, `--tasks` and `--grace` flags) is consistent across `state/execute.js`, SKILL.md and wave-runner-template.md, and that no timer or `Monitor` wait path survives.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the blocking `wave-progress --wait` call (new `--wait`, `--tasks` and `--grace` flags) is consistent across `state/execute.js`, SKILL.md and wave-runner-template.md, and that no timer or `Monitor` wait path survives.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: docs-skill-sync (B1)

**Why:** Task 3 rewrites the `--wave-interval` flag row in `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` from a "`Monitor` poll interval" to the `wave-progress --wait` interval, so Task 7's user docs must stay in sync.

**Severity hint:** high

**Patch:** Check that the reworded `--wave-interval` and `waveInterval` rows and the wave-deadline paragraph match between SKILL.md, `docs/skills/execute-plan-sdlc.md` and the site copy.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the reworded `--wave-interval` and `waveInterval` rows and the wave-deadline paragraph match between SKILL.md, `docs/skills/execute-plan-sdlc.md` and the site copy.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 to Task 7 touch many markdown files (for example `docs/specs/execute-plan-sdlc.md` and the agent files in Task 3 and Task 4) that the script found outside the dimension's triggers, so the trigger `**/*.md` is proposed.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Tasks

### Task 1: Execute and plan-sdlc spec changes

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — add R92; reword R86, R91, R-WAVE-DEADLINE; history row
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy of the spec
- Modify: `docs/specs/plan-sdlc.md` — add R71; one clause in R36; history row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec

**Notes:** Spec first for every behaviour change in Tasks 2 to 4 (`spec-first` guardrail). Implements F-execute-orchestrator-turn-cost-1, -3, -6 and F-plan-lens-runtime-semantics-checklist-6. Copy each edited spec to its site path with `cp`, never with `site/scripts/copy-docs.mjs`.

**Acceptance criteria:**
- [ ] R92 is the next id after R91 in `docs/specs/execute-plan-sdlc.md`, under "Dispatch and routing" next to R86, with the text in the Contract.
- [ ] R86, R91 and R-WAVE-DEADLINE read as in the Contract; no other requirement text changes; no id is renumbered.
- [ ] R71 follows R70 in `docs/specs/plan-sdlc.md` "Plan document invariants"; R36 gains the one clause in the Contract.
- [ ] History rows `| R92 | blocking wave wait (ledger F-54, F-43), #9359 |` and `| R71 | runtime-semantics review and every-copy rule (ledger F-35, F-42, F-44, F-49, F-51, F-52), #9359 |` are in the issue-trail tables.
- [ ] `cmp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md` and the same for `plan-sdlc.md` print nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD R92 and MODIFY R86, R91, R-WAVE-DEADLINE in the execute spec; ADD R71 and MODIFY R36 in the plan-sdlc spec. Delta text:

```diff
- R86: … It waits for the R-WAVE-BACKGROUND-DISPATCH barrier with the `Monitor` poll of R-WAVE-DEADLINE. It returns once: …
+ R86: … It waits for the R-WAVE-BACKGROUND-DISPATCH barrier only with the blocking `wave-progress --wait` call of R92. It returns once: …

- R91: … print one line `ignored stale hand-back for wave <n> task <id>` and make no dispatch, no state write and no re-run for it. …
+ R91: … print one line `ignored stale hand-back for wave <n> task <id>` and make no tool call for it: no dispatch, no state write, no re-run and no new report. …

R-WAVE-DEADLINE (only this phrase changes):
- workers run in the background, and it polls
-   with `Monitor`, terminating overrun workers with `TaskStop`.
+ workers run in the background, and it waits with repeated `wave-progress --wait`
+   calls (R92), each bounded by the remaining budget, terminating overrun workers with `TaskStop`.
```

```text
- R92: Blocking wave wait. `state/execute.js wave-progress --wave <n> --run-id <id> --wait --tasks <id,id> [--interval <s>] [--timeout <s>] [--grace <s>]` reads the wave's progress marker every `--interval` seconds (default 5) and returns when every listed task has phase `reporting`, after `--grace` more seconds (default 30; a larger value is clamped to 30), or at `--timeout` (default 300; a larger value is clamped to 540). It prints one line `{"wave":<n>,"reported":[<ids>],"inFlight":[<ids>],"timedOut":<bool>}` (ids in `--tasks` order) and exits 0 in both cases; a missing `--tasks` or a bad number exits 2. The dispatching context (main context in direct mode, the wave-runner in runner mode) waits for a wave only with this call, as one foreground Bash call with the Bash `timeout` parameter 600000, passing `--interval <waveInterval>` and a `--timeout` no greater than the remaining wave budget. It repeats the call until all N returns of the R-WAVE-BACKGROUND-DISPATCH barrier have arrived or the deadline has passed. It never starts `Monitor`, a background `sleep` or any other timer to wait, and it stops with `TaskStop` every background task it started before it returns. The defaults are tuning values.
  - Acceptance: exec cases `execute-plan-sdlc/liveness/wave-progress: --wait …`; sentinel case `execute-plan-sdlc/handback:` (SKILL.md, wave-runner-template.md and `agents/ship-step-execute.md` name `wave-progress --wait`).
```

```text
R36 (one sentence appended after "(c) **risk** → File paths, Verification strategy, Scope discipline, Guardrail compliance;"):
  the risk lens applies the R71 runtime-semantics checks under Verification strategy and Scope discipline;

- R71 (runtime semantics and every copy): The planner, the risk lens (`agents/plan-lens-risk.md`) and the single reviewer (`agents/plan-reviewer.md`) check every procedure, command, regex and test assertion a task writes into skill prose, agent prose or a dataset for: (a) tool contracts: the Write tool refuses an existing file it has not read, so a procedure that writes after `mktemp` or onto an existing file reads it first; each Bash call is its own shell, so no variable, `cd` or trap crosses calls; (b) regex escaping: a literal `|` in a `regex`, `not-regex` or alternation is escaped; (c) quote handling: a rule that scans command text ignores text inside quotes; (d) every copy: a task that changes a pattern, name, flag, constant or value lists under **Files:** every file that holds its literal text, including specs, skill companions such as `reference.md`, docs, site copies and tests; a task that changes a dispatch or model rule lists every companion of that skill that states the rule; (e) environment: a value read from an environment variable, the working directory or a path is named with where it comes from. A check that finds a step that would fail at run time, or a copy left contradicting the change, is blocking. No new gate, lens or category is added.
  - Acceptance: exec case `plan-sdlc/lens-sentinels:` (lens-risk, plan-reviewer and plan-sdlc SKILL.md carry the R71 text).
```

- names: `R92`, `R71` (new); `R86`, `R91`, `R-WAVE-DEADLINE`, `R36` (modified).
- mirror: requirement blocks R88 to R91 in `docs/specs/execute-plan-sdlc.md` and R70 in `docs/specs/plan-sdlc.md`; issue-trail row format `| R91 | stale hand-backs dropped (ledger F-48), #9358 |`.
- decisions: one verb with a `--wait` mode; prose-only R71 (Key Decisions).
- sync: Tasks 2, 3, 4 and 7 implement these ids; site spec copies byte-identical.

### Task 2: Blocking `wave-progress --wait` in the execute state script

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `--wait` mode in `cmdWaveProgress`; parse `--wait`, `--tasks`, `--grace`; usage header line
- Modify: `schemas/sdlc-config.schema.json` — `execute.waveInterval` description only
- Create: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/20250101T000000/progress-wave-3.json` — wave 3 marker, T5 and T6 at `reporting`
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — four `--wait` cases

**Notes:** Implements R92 (F-execute-orchestrator-turn-cost-1). The 540-second timeout clamp plus the 30-second grace clamp (570 s worst case) stays under the 600-second Bash limit; do not raise either without checking that margin. Reuse `readProgress` from `scripts/lib/wave-progress.js`; do not read the marker file directly. Use `setTimeout`, never a child `sleep`. Wave 3 is unused by every other case of run `20250101T000000`. Verification: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/liveness/wave-progress"`.

**Acceptance criteria:**
- [ ] `wave-progress --wave 3 --run-id 20250101T000000 --wait --tasks T5,T6 --grace 1` prints `{"wave":3,"reported":["T5","T6"],"inFlight":[],"timedOut":false}` after about one second.
- [ ] `wave-progress --wave 1 --run-id 20250101T000000 --wait --tasks T1,T2 --interval 1 --timeout 2` prints `{"wave":1,"reported":[],"inFlight":["T1","T2"],"timedOut":true}`.
- [ ] `--wait` without `--tasks` exits 2 with `Error: --wait requires --tasks`.
- [ ] `--grace abc` exits 2 with `Error: --grace requires an integer >= 0`.
- [ ] Existing `--read` and write-mode cases are unchanged and pass.
- [ ] The `execute.waveInterval` schema description reads `Poll interval in seconds of the blocking wave-progress --wait call (R92).`; type, minimum and default are unchanged.
- [ ] The targeted exec run above passes.

**Contract:**
- shape (code): new mode of the existing verb; all other modes unchanged.

| Op | Flag | Type | Default | Notes |
|---|---|---|---|---|
| add | `--wait` | boolean | off | selects the blocking mode |
| add | `--tasks` | csv of task ids | none | required with `--wait`; order kept in the output |
| add | `--grace` | integer >= 0 | 30, clamped to 30 | seconds to keep blocking after all tasks report |
| replace | `--interval` | integer >= 1 | 5 in `--wait` mode | wave-watch keeps its own default 30 |
| replace | `--timeout` | integer >= 1 | 300 in `--wait` mode, clamped to 540 | wave-watch keeps its own default 3600 |

```text
stdout (one line, exit 0):
{"wave":3,"reported":["T5","T6"],"inFlight":[],"timedOut":false}
{"wave":1,"reported":[],"inFlight":["T1","T2"],"timedOut":true}
```

| Condition | Exit | Output |
|---|---|---|
| `--wait` without `--tasks` (or empty list) | 2 | stderr `Error: --wait requires --tasks` |
| `--grace` not an integer >= 0 | 2 | stderr `Error: --grace requires an integer >= 0` |
| missing `--wave` or `--run-id` | 2 | existing errors |
| no marker file yet | 0 | every task counts as in flight until timeout |

```json
{ "tasks": { "T5": { "phase": "reporting", "updatedAt": "2025-01-01T00:09:00Z" }, "T6": { "phase": "reporting", "updatedAt": "2025-01-01T00:10:00Z" } } }
```

- names: `--wait`, `--tasks`, `--grace`; output keys `wave`, `reported`, `inFlight`, `timedOut`.
- mirror: the poll loop of `cmdWaveWatch` (the `tick` function with `setTimeout`) in `plugins/sdlc-utilities/scripts/state/execute.js`; case shape of `execute-plan-sdlc/liveness/wave-progress: --read returns a marker holding one entry per task in the wave` in the liveness dataset.
- decisions: a task with no marker is in flight; `--grace` runs once after the last task reports, also when all were reported at the first read.
- sync: R92 text (Task 1); the command form in Task 3.

### Task 3: Execute skill, wave-runner and execute step agent wait rules

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — R86, R91, wave deadline steps 2 to 4, `--wave-interval` row
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — §2b R86, R91, steps 2 to 4; `waveInterval` input line
- Modify: `plugins/sdlc-utilities/agents/ship-step-execute.md` — wait line and after-report line
- Test: `tests/promptfoo/scripts/check-handback-sentinels.js` — add the R92 sentinels
- Test: `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — update the stale behavioural case `execute-plan-sdlc (R-WAVE-DEADLINE, #506): the dispatching context polls with Monitor and terminates with TaskStop`

**Notes:** Implements R86, R91, R92 and R-WAVE-DEADLINE (F-execute-orchestrator-turn-cost-1, -3, -6). The transcript shows the agent followed "poll with Monitor" literally, so the text must name the one allowed wait and ban timers. Keep the sentinel `No hand-back mid-wave (R86)`, `**Stale hand-backs (R91).**` and `Never end your turn while a worker or wave-runner you dispatched is still running` byte-identical. The behavioural dataset is never run here (owner-initiated only); it is checked by review. Verification: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"`.

**Acceptance criteria:**
- [ ] `grep -n "Monitor" plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md plugins/sdlc-utilities/agents/ship-step-execute.md` prints only lines that forbid `Monitor`.
- [ ] Both wait procedures read as in the Contract (now → after table), with the command `wave-progress --wave <N> --run-id <runId> --wait --tasks <ids> --interval <waveInterval> --timeout <s>` and the Bash `timeout` 600000.
- [ ] `check-handback-sentinels.js` also requires `wave-progress --wait` in SKILL.md, wave-runner-template.md and `agents/ship-step-execute.md`, and `--wait --tasks` and ``Never start `Monitor` `` in SKILL.md and wave-runner-template.md; it prints the new keys `waitSkill`, `waitWaveRunner`, `waitShipStepExecute` in its JSON.
- [ ] The behavioural case in `tests/promptfoo/datasets/execute-plan-sdlc.yaml` reads as in the Contract: new description, `icontains` values `wave-progress --wait` and `TaskStop`, new rubric.
- [ ] The targeted exec run above passes.

**Contract:**
- shape (code): prose change of the wait procedure in two places (SKILL.md "Wave deadline (direct mode)", wave-runner-template.md §2b), same steps in both.

| Now | After |
|---|---|
| R86: "Wait with the `Monitor` poll of the wave deadline below until all N results are in." | "Wait only with the blocking `wave-progress --wait` call below (R92) until all N results are in. Never start `Monitor`, a background `sleep` or any other timer to wait, and never poll with `git status` or `wave-progress --read` between waits. Before you return, call `TaskStop` on every background task you started that is still running." |
| R91: "Print one line … and do nothing else for it: no dispatch, no state write, no re-run." | "Print one line … and make no tool call for it: no dispatch, no state write, no re-run, no new report." |
| Step 2: "Poll with `Monitor`, using an interval of `waveInterval` seconds and a `timeout_ms` no greater than the remaining budget. `Monitor.timeout_ms` caps at 3600000 …" | "Wait with one foreground Bash call (Bash `timeout` parameter 600000): `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-progress --wave <N> --run-id <runId> --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --timeout <min(540, remaining budget in seconds)>`. Repeat the call while fewer than N returns have arrived and the deadline has not passed." (the wave-runner uses `node {STATE_SCRIPT} …` with `{WAVE}` and `{RUN_ID}`) |
| Step 3: "On each poll, read the progress markers … `wave-progress --read` …" | "Use the call's `inFlight` list as the termination target in step 4; a returned task ID is in flight while any plan task ID it covers is in `inFlight`." |
| Step 4: "call `TaskStop` on every returned task ID still in flight per step 3" | unchanged wording, pointing at `inFlight` |
| `--wave-interval` row: "`Monitor` poll interval while waiting on background workers." | "Poll interval of the blocking `wave-progress --wait` call while waiting on background workers." |

```text
agents/ship-step-execute.md, line "Return only once …" after the change:
… Never end your turn while a worker or wave-runner you dispatched is still running; wait for it only with the skill's blocking `wave-progress --wait` call (execute-plan-sdlc R86, R92), never with `Monitor` or a background `sleep`. After your final report, answer any later notification with one short line, no tool call and no new report.
```

```diff
 tests/promptfoo/datasets/execute-plan-sdlc.yaml (case at the R-WAVE-DEADLINE entry; vars unchanged)
- - description: "execute-plan-sdlc (R-WAVE-DEADLINE, #506): the dispatching context polls with Monitor and terminates with TaskStop"
+ - description: "execute-plan-sdlc (R-WAVE-DEADLINE, R92): the dispatching context waits with wave-progress --wait and terminates with TaskStop"
   assert:
     - type: icontains
-      value: "Monitor"
+      value: "wave-progress --wait"
     - type: icontains
       value: "TaskStop"
     - type: llm-rubric
       value: >
         In direct mode main context enforces the deadline; in runner mode the wave-runner
         enforces it inside its own context, by the same procedure. The dispatching context
-        polls with `Monitor` on a non-blocking loop using the manifest's poll interval and a
-        `timeout_ms` no greater than the remaining budget. On each poll it re-reads the
-        progress markers (`wave-progress ... --read`) to learn which tasks are still in
-        flight — a task whose marker phase is not yet `reporting` — rather than relying on its
-        own memory of the dispatch list. When the deadline expires it calls `TaskStop` on ONLY
+        waits with a blocking foreground `wave-progress --wait` call, repeated while results
+        are missing, each bounded by the remaining budget and using the manifest's poll
+        interval. It takes the in-flight tasks from that call's `inFlight` list (a task whose
+        marker phase is not yet `reporting`) rather than its own memory of the dispatch list,
+        and it starts no `Monitor` or background timer. When the deadline expires it calls `TaskStop` on ONLY
         those still-in-flight tasks; workers that already reported are left alone. The
-        response must NOT describe spawning a separate watchdog Agent or a blocking sleep. It
+        response must NOT describe spawning a separate watchdog Agent, a `Monitor` loop or a background sleep. It
         must not restate a numeric default for the timeout — the value arrives in the
         manifest.
```

- names: sentinels `wave-progress --wait`, `--wait --tasks`, ``Never start `Monitor` ``, existing R86/R91 headings.
- mirror: the current "Wave deadline (direct mode; R-WAVE-DEADLINE)" numbered list in `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` and §2b of `wave-runner-template.md`; `has()` calls in `tests/promptfoo/scripts/check-handback-sentinels.js`.
- decisions: blocking Bash over `Monitor`; timers banned (Key Decisions). Each Bash call is its own shell, so the command carries literal values, no shell variables.
- sync: command form must match Task 2's flags; R92 text (Task 1); docs rows in Task 7.

### Task 4: Runtime-semantics checklist for the risk lens, the single reviewer and the planner

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/plan-lens-risk.md` — "Runtime semantics" paragraph and two Calibration bullets
- Modify: `plugins/sdlc-utilities/agents/plan-reviewer.md` — one table row and one Calibration bullet
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — one Step 2 rule after the R70 bullet
- Create: `tests/promptfoo/scripts/check-plan-lens-sentinels.js` — sentinel check
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — one case `plan-sdlc/lens-sentinels: …`

**Notes:** Implements R71 and the R36 clause (F-plan-lens-runtime-semantics-checklist-2, -3, -5, -9). The frontmatter, the focus-category line and `LENS_FOCUS` stay unchanged, so `plan.js` and its fixtures stay valid. Verification: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/lens-sentinels"`.

**Acceptance criteria:**
- [ ] `plan-lens-risk.md` has the paragraph in the Contract after "Guardrail compliance" in "Focus Areas", and the two Calibration bullets.
- [ ] `plan-reviewer.md` has the `Runtime semantics` row after the `Scope discipline` row, and the Calibration bullet.
- [ ] plan-sdlc SKILL.md Step 2 has the R71 bullet directly after the R70 bullet.
- [ ] `check-plan-lens-sentinels.js` prints `{"ok":true,"risk":true,"reviewer":true,"skill":true}` and exits 0; any missing sentinel gives `ok:false` and exit 1; a read error exits 2.
- [ ] The new case asserts `ok === true`, and the targeted exec run above passes.

**Contract:**
- shape (code): prose additions plus one sentinel script.

```text
plan-lens-risk.md, Focus Areas, new paragraph:
**Runtime semantics (R71, under Verification strategy and Scope discipline):** For every procedure, command, regex and test assertion a task writes into skill prose, agent prose or a dataset, check: (a) tool contracts: the Write tool refuses an existing file it has not read, so a write after `mktemp` or onto an existing file reads it first; each Bash call is its own shell, so no variable, `cd` or trap crosses calls; (b) regex escaping: a literal `|` in a `regex`, `not-regex` or alternation is escaped; (c) quote handling: a rule that scans command text ignores text inside quotes; (d) every copy: a task that changes a pattern, name, flag, constant or value lists every file that holds its literal text (Grep for it: specs, skill companions such as `reference.md`, docs, `site/src/content-source/` copies, tests), and a task that changes a dispatch or model rule lists every companion of that skill that states it; (e) environment: a value read from an environment variable, the working directory or a path says where it comes from. A step that would fail at run time, or a copy left contradicting the change, is blocking.

Calibration, two new bullets:
- A procedure that writes with the Write tool onto an existing or `mktemp` file without a Read first, or a `not-regex` with a bare `|` → flag as blocking
- A changed literal whose other copies (Grep hits) are not under Files → flag as blocking

plan-reviewer.md, table row after Scope discipline:
| Runtime semantics | The R71 checks: Write needs a prior Read; one shell per Bash call; escaped `|` in regex assertions; quote-aware command rules; every copy of a changed literal under Files; environment sources named |

plan-reviewer.md, Calibration bullet:
- A step that would fail at run time (Write without Read, bare `|` in a not-regex) or a missed copy of a changed literal → flag it

plan-sdlc SKILL.md Step 2, bullet after the R70 bullet:
- A task that changes a pattern, name, flag, constant or value lists every file holding its literal text (Grep the repository: specs, skill companions such as `reference.md`, docs, site copies, tests); prose it writes follows the tool contracts of R71: Read before Write on an existing file, one shell per Bash call, escaped `|` in regex assertions, quote-aware command rules (implements R71).
```

- names: sentinels `Runtime semantics (R71` (lens-risk), `| Runtime semantics |` (plan-reviewer), `(implements R71)` (SKILL.md); script output keys `ok`, `risk`, `reviewer`, `skill`.
- mirror: `tests/promptfoo/scripts/check-handback-sentinels.js` (marker-file guard, `has()` helper, exit codes); case shape of the `execute-plan-sdlc/handback:` case in `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml`.
- decisions: fold into the existing risk categories, no new lens (Key Decisions).
- sync: R71 text (Task 1); docs line in Task 7.

### Task 5: Drop the script-resolution and type-safety-review dimensions

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `.sdlc/review-dimensions/script-resolution.md` — delete
- Modify: `.github/instructions/script-resolution.instructions.md` — delete
- Modify: `.sdlc/review-dimensions/type-safety-review.md` — delete
- Modify: `.github/instructions/type-safety-review.instructions.md` — delete

**Notes:** F-52 (F-review-dimensions-load-and-drop-1, -5). Delete with `git rm`; no other file names these dimensions. The mirror validator does not report orphans, so each mirror goes with its source.

**Acceptance criteria:**
- [ ] The four files are gone from the working tree and staged as deletions.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-copilot-mirror.js` prints `checked 4 mirror(s), 0 drift`.

**Contract:**
- shape (code): `git rm` of four paths; no content change elsewhere.
- names: dimensions `script-resolution`, `type-safety-review`.
- mirror: none.
- decisions: drop, not merge (Deviations).
- sync: none.

### Task 6: Drop the hook-readiness and release-consistency dimensions

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `.sdlc/review-dimensions/hook-readiness.md` — delete
- Modify: `.sdlc/review-dimensions/release-consistency.md` — delete

**Notes:** F-52. Neither has a Copilot mirror. Release consistency stays covered by `check-changelog.yml` and `check-version-bump.yml`.

**Acceptance criteria:**
- [ ] Both files are gone from the working tree and staged as deletions.
- [ ] `ls .sdlc/review-dimensions` lists 10 dimension files.

**Contract:**
- shape (code): `git rm` of two paths.
- names: dimensions `hook-readiness`, `release-consistency`.
- mirror: none.
- decisions: drop (Key Decisions).
- sync: none.

### Task 7: User docs for the wait and the risk lens

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 3, Task 4
**Verify:** manual

**Files:**
- Modify: `docs/skills/execute-plan-sdlc.md` — `--wave-interval` and `waveInterval` rows; the wave-deadline paragraph
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — byte copy
- Modify: `docs/skills/plan-sdlc.md` — one sentence on the risk lens runtime checks
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy

**Notes:** Docs follow R92 and R71 (F-execute-orchestrator-turn-cost-1, F-plan-lens-runtime-semantics-checklist-8). Copy each edited doc to its site path with `cp`.

**Acceptance criteria:**
- [ ] `docs/skills/execute-plan-sdlc.md` no longer calls `waveInterval` a `Monitor` interval; the deadline paragraph says the enforcing layer waits with `wave-progress --wait` and starts no timers.
- [ ] `docs/skills/plan-sdlc.md` says, where the review lenses are described, that the risk lens and the single reviewer check tool contracts, regex escaping, quote handling, every copy of a changed value and environment sources (R71).
- [ ] `cmp` of each doc against its site copy prints nothing.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY two skill reference docs (audience: end users); no new sections; defaults unchanged.

| Doc | Now | After |
|---|---|---|
| execute `--wave-interval` row | "`Monitor` poll interval the enforcing layer … uses to check in-flight tasks" | "Poll interval of the blocking `wave-progress --wait` call the enforcing layer … uses to check in-flight tasks" |
| execute `waveInterval` config row | "`Monitor` poll interval in seconds (minimum 10)" | "Poll interval in seconds of `wave-progress --wait` (minimum 10)" |
| execute wave-deadline paragraph | polls with `Monitor` | waits with blocking `wave-progress --wait` calls (R92) and starts no timers |
| plan-sdlc review lenses | risk lens: file paths, verification, scope, guardrails | adds one sentence on the R71 runtime-semantics checks |

- names: rows `--wave-interval <seconds>`, `waveInterval`.
- mirror: existing Flags and Configuration tables in `docs/skills/execute-plan-sdlc.md`.
- decisions: wording only.
- sync: site copies byte-identical; R92 and R71 (Task 1).

### Task 8: Remove the wrong Monitor cap claim from the wave-timeout code comment, schema and ship config reference

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/ship-fields.js` — comment on `MAX_WAVE_TIMEOUT_SECONDS` only
- Modify: `schemas/sdlc-local.schema.json` — `executeWaveTimeout` description only
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — `executeWaveTimeout` row only

**Notes:** Follows from F-execute-orchestrator-turn-cost-1 and R71 (d) applied to this plan: the claim "`Monitor.timeout_ms` caps at 3600000 ms" is wrong (the tool caps at 1800000 ms) and Task 3 removes it from the execute skill, so every other copy goes too (risk lens finding). The 3600-second ceiling stays; only its stated reason changes. No value, type or default changes, so no test changes.

**Acceptance criteria:**
- [ ] `grep -rn "3600000" plugins/sdlc-utilities/scripts/lib/ship-fields.js schemas/sdlc-local.schema.json plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` prints nothing.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('schemas/sdlc-local.schema.json','utf8'))"` exits 0.
- [ ] `MAX_WAVE_TIMEOUT_SECONDS` is still `3600`.

**Contract:**
- shape (code): text-only deltas.

```diff
- const MAX_WAVE_TIMEOUT_SECONDS = 3600; // Monitor.timeout_ms caps at 3600000 ms
+ const MAX_WAVE_TIMEOUT_SECONDS = 3600; // one wave; the wait repeats wave-progress --wait calls (execute R92)

schemas/sdlc-local.schema.json and config-format.md: delete the parenthetical
- (`Monitor.timeout_ms` caps at 3600000 ms)
  (in the schema the same text without backticks), leaving the rest of the sentence unchanged.
```

- names: `MAX_WAVE_TIMEOUT_SECONDS`, `executeWaveTimeout`.
- mirror: none.
- decisions: keep the 3600 ceiling (it bounds one wave, which may span several waits).
- sync: Task 9 removes the same claim from the ship spec and the setup doc.

### Task 9: Remove the Monitor cap claim from the ship spec and the setup doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R57 parenthetical only
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy
- Modify: `docs/skills/setup-sdlc.md` — `executeWaveTimeout` sentence only
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy
- Create: `docs/plans/2026-11-12-lean-w9b-cost-and-plan-review.md` — stage only: the file exists and holds this plan; never write it

**Notes:** Follows from F-execute-orchestrator-turn-cost-1 (the wait no longer uses `Monitor`) and R71 (d): same reason as Task 8. This is rationale text, not behaviour, so R57 keeps its id and contract. Copy each edited file to its site path with `cp`. The plan file entry is for staging only: the file already exists and holds this plan, so the worker never writes, edits or recreates it.

**Acceptance criteria:**
- [ ] `grep -n "3600000" docs/specs/ship-sdlc.md docs/skills/setup-sdlc.md` prints nothing.
- [ ] `cmp` of each file against its site copy prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (docs): MODIFY two sentences (audience: maintainers and end users).

```diff
 docs/specs/ship-sdlc.md R57:
- … which `skill/execute.js` imports (the `Monitor.timeout_ms` cap is 3600000 ms); the JSON Schema …
+ … which `skill/execute.js` imports; the JSON Schema …

 docs/skills/setup-sdlc.md:
- … — the single enforcement point (`Monitor.timeout_ms` caps at 3600000 ms).
+ … — the single enforcement point.
```

- names: R57 (unchanged id).
- mirror: none.
- decisions: delete the wrong reason instead of writing a new one (KISS).
- sync: site copies byte-identical; Task 8.

## Final Shape

- The execute orchestrator and the wave-runner wait for a wave with one blocking Bash call of up to 540 seconds. While all tasks are working, that is one turn per call, not one per second.
- They start no `Monitor` or background `sleep` timers, so no event wakes them after they hand back. A stale hand-back gets one short line and no tool call.
- `state/execute.js wave-progress --wait` is tested by four exec cases.
- The risk lens and the single plan reviewer check five runtime-semantics rules. The planner lists every copy of a changed literal under Files.
- This repository runs 10 review dimensions instead of 14. The opus dimensions stay.
- No file states the wrong `Monitor.timeout_ms` cap any more; the 3600-second wave ceiling stays.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 1 | 1 | 1 |
| Coherence | 0 | 0 | 4 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 F-54/F-43: execute orchestrator and wave-runner stop polling; blocking wait, stale notifications without tool calls, turn count only if cheap | Task 1, Task 2, Task 3, Task 7 | covered |
| 2 F-52/F-35/F-42/F-44/F-49/F-51: runtime-semantics checklist in plan lenses (repurpose lens-risk) | Task 1, Task 4, Task 7, Task 8, Task 9 | covered |
| 3 F-52: drop low-yield review dimensions (script-resolution, hook-readiness, release-consistency, type-safety-review) | Task 5, Task 6 | covered |
| 4 F-6: cheapest planner cost cut or record that none is safe | — | covered |
| 5 Re-verify every item at HEAD with evidence; drop non-reproducing or harness items with reasons | — | covered |
| 6 Spec-first, promptfoo exec tests, docs and site byte copies | Task 1, Task 2, Task 3, Task 4, Task 7, Task 9 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
