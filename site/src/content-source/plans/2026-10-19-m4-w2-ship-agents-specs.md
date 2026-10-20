# Ship Per-Step Agents — Spec Consequences Implementation Plan

**Goal:** Amend the ship and execute specs first, so they state the per-step dispatch (W4.3) before the feat plan implements it: agent files, main-context consent and execute decisions, pending questions, the `execute_handoff` completeness scope, and "ship asks" for the tier.
**Architecture:** One edit pass on `docs/specs/ship-sdlc.md` and `docs/specs/execute-plan-sdlc.md`. Requirement ids and positions do not change; only bullet text and P-TRANS-1 table rows change. It ships as its own commit BEFORE the feature plan `docs/plans/2026-10-19-m4-w2-ship-agents.md` (ruling w2-specfirst); copy-docs runs after the feat run.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-2-plan-source.md (Commits rule; reading 9 / owner Q15; rulings w2-preplan items 1-2, w2-pending item 3, w2-handoff item 1)
**Verification:** for each of the two spec files `S`: `RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | command grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show HEAD:$S | ids) <(ids < $S) && echo SAME` prints `SAME`; then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.

---

## Context

**What problem does this change solve?**

W4.3 changes behaviour that several spec lines state differently today. The spec is the source of truth, so these lines are amended first (ruling w2-specfirst), and the feature plan then implements them:

- A3 and R-tier-prompt-invariant say the tier prompt fires inside execute. Execute now runs in a forked agent that cannot ask, so ship asks instead (owner Q15).
- R7 says `--auto` is forwarded only in `--auto` runs. It is now always forwarded to the four consent sub-skills, after a main-context consent step.
- R-subagent-brief, P7 and C16 describe a dispatch prompt that carries the brief and a per-call `model`. Both moved into the agent file.
- P-TRANS-1 has no rows for the new decision steps or the pending-question stop.
- R-INVARIANT-COMPLETENESS does not say what happens when execute was finished outside the pipeline.

**What prompted this change now?**

The rulings name these consequence edits. The source's Commits rule (line 15) puts them in a separate ship run, so the commit names exactly what changed; ruling w2-specfirst puts that run first.

**What does success look like?**

- The amended bullets read as the Contract below.
- The id sets of both specs are identical to HEAD (`SAME`).
- `validate-spec-shape.js --root .` prints nothing on stdout.

## Research Findings

- Discovery (`F-ship-docs-spec-skill-dispatch-text-6`): in `docs/specs/ship-sdlc.md`, only A3 (:14) states the tier rule. The Phases "Params" sentence (:150) repeats it ("`--quality` is forwarded to execute-plan-sdlc only when explicitly passed"). Pre-flight's :191/:208/:335 are SKILL.md lines (edited by the feature plan, Task 7).
- `docs/specs/execute-plan-sdlc.md` R-tier-prompt-invariant (:164) is the execute line (`F-ship-docs-spec-skill-dispatch-text-7`). The execute spec is contract-shaped, so rule 9 (W3.5) is not triggered (W2-P6).
- P-TRANS-1 is the table under `- P-TRANS-1:` in `### Step-emitter contract` (:263), `| from | to | when |`, 22 rows (`F-ship-docs-spec-skill-dispatch-text-6`).
- R7 (:305), R-subagent-brief (:306), P7 (:313), R-INVARIANT-COMPLETENESS (:334) and C16 (:393) are single bullets. Line numbers are base-dated; the executor locates each bullet by its leading `- <id>:`, exactly once.
- `validate-spec-shape.js` rejects body lines that contain `#<digits>`, `(removed`, `**Model:**` or a `## ` heading, and flags duplicate ids (`F-ship-docs-spec-skill-dispatch-text-9`). New table rows must not start with `- <id>:`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Tier lines amended | no | A3 and the Phases "Params" sentence in the ship spec; R-tier-prompt-invariant in the execute spec | ruling w2-preplan item 1: "amend only those that state the tier rule"; discovery shows :191/:208/:335 of the ship spec do not |
| R7, R-subagent-brief, P7, C16 | no | amended | source Commits rule: every spec consequence of the feature goes in this commit; without them the spec contradicts SKILL.md Step 5 |
| Wordings | no | drafted from the rulings' texts; R-INVARIANT-COMPLETENESS scope sentence follows ruling w2-handoff item 1 | no ruling gives exact spec text |
| Spec order vs `spec-first` | no | this specs commit goes FIRST; the feat plan's ship run follows, then copy-docs | ruling w2-specfirst (spec-consequence commits go first; satisfies `spec-first`); source line 15 keeps the two-run split |

## Key Decisions

**Problem in one sentence:** W4.3 makes eight spec statements false, and the spec is the source of truth, so they are amended before the code that implements them.

- **Ids unchanged.** Only text and table rows change; P-5 must print SAME for both specs.
- **Non-goals.** No other requirement, no SKILL.md, no code, no tests. Reading 8 spec gaps stay follow-ups.
- **Failure audience.** Spec readers and the spec validators. A wrong edit fails `validate-spec-shape.js` or the id-set check.

## Final Shape

Both specs carry the amended text, have the same id sets as HEAD, and pass `validate-spec-shape.js`. One commit holds the change: `docs(#9003): specs - ship and execute consequences of per-step dispatch (W4.3)`.

## Tasks

### Task 1: Spec consequences of per-step dispatch

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — A3, the Phases "Params" sentence, R7, R-subagent-brief, P7, R-INVARIANT-COMPLETENESS, C16, P-TRANS-1 rows.
- Modify: `docs/specs/execute-plan-sdlc.md` — R-tier-prompt-invariant.

**Notes:** Locate each bullet by its leading `- <id>:` with `command grep -nF -- '- <id>:' <file> | wc -l` = 1. Locate the Params sentence and each replaced table row by the quoted text, also exactly once. If anything is missing or occurs more than once, STOP. Keep each bullet's other sentences unless the Contract replaces them. No text may contain `#` followed by digits. copy-docs is not run after this plan; the executor runs `node site/scripts/copy-docs.mjs` once after the feat plan's ship run (ruling w2-specfirst). List each amended block, before and after, in the report for the PR's Plan readings.

**Contract:**
- shape (openspec): MODIFY these bullets; no ids added or removed.
  - `A3` — replace the text after `` `--quality full|balanced|minimal` — ``:
    "execution quality (model tier) for execute-plan-sdlc. When it is passed, ship forwards it. When it is absent in an interactive run, ship asks for the tier in its main context (`execute_tier`, options full|balanced|minimal), stores the answer in the ledger's `flags.quality` and forwards it; ship never picks a tier itself. Under `--auto` nothing is asked and `--quality` stays required (default: not set)."
  - Phases "Params" sentence — "`--quality` is forwarded to execute-plan-sdlc only when explicitly passed;" → "`--quality` is forwarded to execute-plan-sdlc when explicitly passed or chosen at `execute_tier`;". The rest of the sentence is unchanged.
  - `R7` — whole text after `- R7: `: "`--auto` forwarding audit: forwarded to execute-plan-sdlc only when ship runs with `--auto`; always forwarded to commit-sdlc, received-review-sdlc, version-sdlc and pr-sdlc, whose consent ship asks in its main context first in interactive runs (`confirm_<step>`; `review_gate` for received-review); not forwarded to review-sdlc, which has no prompts to skip."
  - `R-subagent-brief` — whole text: "R-subagent-brief: Every dispatched sub-skill runs in its agent file `agents/ship-step-<step>.md`, which preloads the skill and states that `--auto` in the arguments governs prompting; without `--auto` the sub-skill's approval prompts are kept, and an agent that cannot reach the user returns `failure` with the pending question in its warnings. A step that edited source files reports the result of a real project check. The Agent prompt carries only the arguments, the branch and the prior results. SKILL.md Step 5 records a pending question as `output.pendingQuestion {prompt, options}`."
  - `P7` — whole text: "P7: `steps[].agent`, `steps[].model` and `steps[].effort` (strings) — the step's agent (`sdlc:ship-step-<step>`; commit-fixes uses `sdlc:ship-step-commit`) and the model and effort `skill/ship.js` reads from that agent file; inline steps keep a render-only `model`. Dispatch passes `agent` only (C16); the values are tuning, see `docs/cost-tiers.md` §4–§5."
  - `R-INVARIANT-COMPLETENESS` — append one sentence after the first paragraph's last sentence (before `- Acceptance:`): "Scope: the check covers an execute run that ship dispatched and that returned to ship. After a pending-question stop, when the user answers `finished` at `execute_handoff`, ship runs the check if an execute state file exists (halting on any non-zero exit); if none exists, ship records execute completed with `source: "user-attested"` in the ledger history and names it in the summary."
  - `C16` — replace "If `'agent'`, invoke via Agent tool with `model: step.model` and `isolation: step.isolation`." with "If `'agent'`, invoke via Agent tool with `subagent_type: step.data.agent` and, when non-null, `isolation: step.data.isolation`; never pass `model` or `effort` — the agent file pins them."; the other sentences are unchanged.
  - P-TRANS-1 rows (`F-ship-confirm-step-stepper-transitions-2`). Replace these existing rows:

    ```diff
    - | `branch_prepare` | `dispatch_execute` | execute `will_run`; else next `will_run` step |
    + | `branch_prepare` | `execute_handoff` | interactive only, not emitted under `--auto`; execute `in_progress`; the latest `dispatch_execute` history entry has `pendingQuestion`; no execute state file; `llm_decision {options:["finished","not finished"]}` |
    + | `execute_handoff` | `stage_changes` | `finished`: if an execute state file exists, `verify-completeness` runs (non-zero → `status:"error"`); otherwise execute is recorded completed with `source:"user-attested"` (history and summary); `not finished` → `done` with `ext.reason:"pending-question"` |
    + | `branch_prepare` | `execute_state` | interactive only, not emitted under `--auto`; execute not `in_progress`; an execute state file exists; options `resume`/`restart`; `restart` deletes that file only |
    + | `branch_prepare` or `execute_state` | `execute_tier` | interactive only, not emitted under `--auto`; `flags.quality` unset; options `full`/`balanced`/`minimal`; the answer is stored in `ledger.flags.quality` |
    + | `branch_prepare` or an `execute_*` decision | `dispatch_execute` | execute `will_run`; args add `--resume` (state file and execute `in_progress`, or answer `resume`) and `--resume --auto` after `execute_gate` `yes`; else next `will_run` step |
    + | `dispatch_execute` with `success:false` and a high-risk `output.pendingQuestion {prompt, options}` (options include `yes` and `skip`), interactive, `flags.quality` set | `execute_gate` | interactive only, not emitted under `--auto` (under `--auto` the stop path applies); options "yes — approve this and all remaining high-risk tasks in this run" / "stop — continue in execute-plan-sdlc directly"; `yes` → `dispatch_execute`; `stop` → `done` with `ext.reason:"pending-question"` |
    - | `stage_changes` | `dispatch_commit` | commit `will_run` |
    + | `stage_changes` | `confirm_commit` | interactive only, not emitted under `--auto`; commit `will_run` (under `--auto`: `dispatch_commit`) |
    + | `confirm_<s>` (`confirm_commit`, `confirm_received_review`, `confirm_commit_fixes`, `confirm_version`, `confirm_pr`) | `dispatch_<s>` | interactive only, not emitted under `--auto`; the prompt names the step and its args; `yes` → dispatch (the sub-skill runs with `--auto`); `skip` → step skipped (skipping pr also skips verify-pipeline and await-remote-review), next row; `cancel` → `done` with `ext.reason:"cancel"`, ledger kept; asked again on `--resume` |
    - | `review_gate` | `dispatch_received_review` | `dispatchReceivedReview: true` |
    + | `review_gate` | `dispatch_received_review` | `dispatchReceivedReview: true`; the interactive prompt names received-review and its args, and its `yes` is the consent; `confirm_received_review` is emitted first only when `review_gate` did not ask (interactive only, not emitted under `--auto`) |
    - | any `dispatch_<s>` with `success:false` | `status:"error"` | `error`: "<step> failed: <summary>. State preserved; re-run with --resume." |
    + | any `dispatch_<s>` with `success:false` and an `output.pendingQuestion {prompt, options}` not handled by `execute_gate` | `done` | `ext.reason:"pending-question"`, `ext.pendingQuestion`, `ext.commands` (`/sdlc:execute-plan-sdlc --plan <p> --resume` for execute, then `/sdlc:ship-sdlc --resume`); the step stays `in_progress`; `paused` set |
    + | any `dispatch_<s>` with `success:false` and no `output.pendingQuestion {prompt, options}` | `status:"error"` | `error`: "<step> failed: <summary>. State preserved; re-run with --resume." |
    ```

    Rows `dispatch_received_review → dispatch_commit_fixes`, `rebase → dispatch_version` and `archive_openspec → dispatch_pr` keep their text; append to each `when` cell: "(interactive: via `confirm_commit_fixes` / `confirm_version` / `confirm_pr`)", respectively.
  - `execute-plan-sdlc.md` `R-tier-prompt-invariant` — whole text: "R-tier-prompt-invariant: The tier is the user's choice, never invented. Step 4 tier-selection AskUserQuestion fires in execute-plan-sdlc's invocation context when it runs on its own. Under ship-sdlc, execute runs in a forked agent that cannot ask, so ship asks for the tier in its main context (`execute_tier`) when the user did not pass `--quality` to ship, and forwards the answer as `--quality`. ship-sdlc MUST NOT synthesize a default `--quality` value. Under `--auto` nothing is asked and `--quality` stays required."
- names: `A3`, `R7`, `R-subagent-brief`, `P7`, `R-INVARIANT-COMPLETENESS`, `C16`, `P-TRANS-1`, `R-tier-prompt-invariant`.
- mirror: neighbouring bullets and existing P-TRANS-1 rows (`rebase` row with its `llm_decision` text).
- decisions: ids and positions unchanged; texts follow rulings w2-preplan, w2-pending and w2-handoff.
- sync: feature plan Tasks 4-7 (they implement these lines after this commit).

**Acceptance criteria:**
- [ ] The id-set check in the plan header prints `SAME` for `docs/specs/ship-sdlc.md` and for `docs/specs/execute-plan-sdlc.md`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout and exits 0.
- [ ] `command grep -c 'model: step.model' docs/specs/ship-sdlc.md` prints `0`; `command grep -c 'execute_handoff' docs/specs/ship-sdlc.md` ≥ 2; `command grep -c 'user-attested' docs/specs/ship-sdlc.md` ≥ 2.
- [ ] `command grep -F 'only forward `--quality` if the user explicitly passed it to ship' docs/specs/execute-plan-sdlc.md | wc -l` prints `0`.
- [ ] `git diff --stat` shows only the two spec files.

## Verification Scorecard

Not applicable — lightweight plan (one task); the feature plan's review covered these rows, and the orchestrator's isolated review checks this file.

## OpenSpec Appendix

Not applicable — no OpenSpec change

## Contract Examples

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY `A3`, `R7`, `R-subagent-brief`, `P7`, `R-INVARIANT-COMPLETENESS`, `C16`, `P-TRANS-1` rows, `R-tier-prompt-invariant`; no ids added or removed.
- names: the ids above.
- mirror: neighbouring bullets in the same sections.
- decisions: ids and positions unchanged.
- sync: SKILL.md Step 5 and `ship.js`, changed by the feature plan that follows.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| spec-first | error | PASS | this plan is spec-only and ships FIRST, before the feat plan's SKILL.md change (ruling w2-specfirst) |
| test-coverage-required | error | PASS | no source code; the id-set diff and the spec validator are the checks |
| no-auto-eval | error | PASS | no promptfoo run |
| no-scope-creep | warning | PASS | the eight spec statements the feature falsifies |
| single-responsibility-tasks | warning | PASS | one deliverable |
| pr-link-github-issue | error | PASS | tracking is local todo 9003 (no GitHub issue, W2-P8); the PR names it |
