# execute-plan-sdlc Flat Worker Topology Spec (W5.3 Spec Commit) Implementation Plan

**Goal:** Make `docs/specs/execute-plan-sdlc.md` describe the W5.3 topology before any code changes: R2 and R8 verbatim from W5.3 Change 10, R-WAVE-BACKGROUND-DISPATCH reworded per ruling Q3 with the default-permission-mode sentence of ruling Q1, and minimal consequence edits to every other spec sentence W5.3 makes untrue.
**Architecture:** 40 text replacements in one spec file, grouped by contract section into two tasks. No id is added, renamed or reused; G10 moves from the Gates body to the appendix's `### Withdrawn` with its id kept (docs/spec-template.md:34-35), so the P-5 id-set check prints `SAME`. The executor applies the edits directly (not through ship or execute) and commits them through the orchestrator's commit wrapper as the second commit of wave 2, after the rule-13 commit and before the plans+site commit.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5/wave-2-plan-source.md (plan 2; W5.3 Change 10; rulings w2-preflight Q1, Q3, Q7; readings R-D1/D2, R-W5.2-contract, R-interactive-budget-tier; plan §0), /workspace/sdlc-marketplace/.sdlc/orchestration/m5/preflight-wave-2.md (SCOPE bullets), discovery brief /tmp/sdlc-explore-m5-w2-9014-execute-topology-590qEP/discovery-brief.md (F-spec-and-cost-tiers-doc-sync-1…3, -7; F-execute-skill-md-anchor-rewrite-9; F-wave-runner-recovery-bypass-removal-27)
**Verification:** in ONE Bash call from the repository root: `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w2/spec; mkdir -p "$TMPDIR"; RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show HEAD:docs/specs/execute-plan-sdlc.md | ids) <(ids < docs/specs/execute-plan-sdlc.md) && echo "SAME execute-plan-sdlc"; node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . > "$TMPDIR/vss.out" 2>&1; echo "exit=$?"; command grep -c 'execute-plan-sdlc' "$TMPDIR/vss.out"` prints `SAME execute-plan-sdlc`, `exit=0` and `0`.

---

## Context

**What problem does this change solve?**

- W5.3 changes how execute-plan-sdlc dispatches its workers:
  - plans smaller than `execute.waveRunnerMinPlanTasks` dispatch workers straight from execute's main context; larger plans keep the wave-runner;
  - workers are three agent files routed by an (agent, effort) table instead of a per-task `model:`;
  - the pre-wave guardrail pass goes away;
  - the spec reviewer runs once per run by default;
  - retries raise effort first, then the agent tier.
- The spec still describes the old shape in many places. The repository rule is spec first (AGENTS.md "Spec-driven development"), so the spec must change before SKILL.md does.
- Ruling Q1 also removes the `bypassPermissions` dispatch instruction from execute (security, R-9160 option (a)). The spec has no `bypassPermissions` text, so it gains one sentence instead: execute dispatches every subagent in the default permission mode.

**What prompted this change now?**

- W5.3 is M5 wave 2. This is its spec-consequence commit (plan source, plan 2).

**What does success look like?**

- R2 and R8 read exactly as W5.3 Change 10 states.
- R-WAVE-BACKGROUND-DISPATCH states the harness fact (no `run_in_background` parameter; workers notify; the dispatcher awaits all N) and points its Acceptance at the rewritten dataset case.
- No spec sentence still names the pre-wave pass as live, the per-task `model:` mapping, the inlined templates, the one-tier-per-retry ladder, or the Speed-tier spec-review skip.
- P-5 prints `SAME`, and `validate-spec-shape.js` reports nothing for this spec.

## Research Findings

- The spec is LF (`grep -c $'\r'` prints `0` at b801aed).
- Every Old text below occurs exactly once at b801aed. Both tasks give an anchor loop over each edit's first line, and every count is `1` (checked at plan time).
- The 40 edits were applied to a scratch copy of b801aed (`git archive HEAD`) at plan time. On that copy, P-5 printed `SAME`, `validate-spec-shape.js --root .` exited 0 with no `execute-plan-sdlc` line, and each New text occurs once.
- `validate-spec-shape.js` rules that matter here (F-spec-and-cost-tiers-doc-sync-7):
  - no `#NNN` in the body (the new text has none);
  - no `(removed` in the body;
  - no `**Model:**` header.
  - Model names in a body sentence are not flagged. R2's verbatim "Haiku" is therefore allowed.
- The spec has no `bypassPermissions` text (pre-flight §3). Ruling Q1's sentence is added to R-WAVE-BACKGROUND-DISPATCH, the dispatch-parameter requirement.
- Sentences W5.3 makes untrue, by topic (pre-flight SCOPE bullets; F-spec-and-cost-tiers-doc-sync-3; F-execute-skill-md-anchor-rewrite-9):

  | Topic | Spec sites | Edits |
  |---|---|---|
  | worker routing replaces per-task model (Changes 1–3) | A2, Phases 2, R2, R6, C7, C12, I4, I6 | S1, S2, S10, S4, S32, S33, S34, S35 |
  | direct dispatch / runner opt-in (Change 4, 8) | R8, R33, R-nested-dispatch-resilient, R-wave-runner-contract, R-FACT-SHEET-DISPATCH, R-BOUNDED-RETURN, R-WAVE-DEADLINE, R-wave-abort-resume, R-no-agent-sdk-isolation, P9 | S11, S6, S12, S13, S15, S16, S29, S30, S28, S36, S24 |
  | no `run_in_background` (ruling Q3, Q7) and default permission mode (ruling Q1) | R-WAVE-BACKGROUND-DISPATCH | S17 |
  | no pre-wave guardrail pass (Change 5) | Phases 6, R-main-context-steps, R33, G10 (withdrawn to the appendix), R18, R28 | S3, S5, S7, S19 + S38, S21, S31 |
  | direct path executes the wave; reviewer cadence (review m2) | R-wave-runner-contract opening, I5 | S39, S40 |
  | spec reviewer cadence (Change 6, D2) | G9, R11, P1 | S18, S20, S22 |
  | escalation (Change 7) | R13, E1, E2, R-wave-runner-contract | S27, S25, S26, S14 |
  | interactive budget tier (R-interactive-budget-tier) | P4 | S23 |
  | script-driven worker routing (ruling w2-plan Q1) | P4 field list and sentence, R-wave-runner-contract `agentFiles`, R13 retries | S37, S23, S13, S27 |
  | sibling-test rule names the templates that move (Change 1) | R42 | S8, S9 |

- Sentences left as they are, because they stay true:
  - C11 ("warnings are post-wave only"; nothing is evaluated pre-wave);
  - R-PRIORWAVE (still the runner-path key name);
  - R-small-plan-inline and R5 (Step 2b is unchanged);
  - R-CONTEXT_OVERFLOW;
  - R-INVARIANT-COMPLETENESS and R14 (R-W8.22);
  - E3;
  - R-tier-prompt-invariant;
  - the summary line under the title.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Edits beyond R2/R8 | no | 38 consequence edits (Research Findings table) | the source asks for every sentence W5.3 makes untrue, with minimal wording; the item's Files list names only R2 and R8 |
| Q1 sentence placement | no | appends the default-permission-mode sentence to R-WAVE-BACKGROUND-DISPATCH | that requirement governs Agent-dispatch parameters, and the spec has no permission text to edit |
| Q3 Acceptance | no | adds an `Acceptance:` sub-bullet naming the rewritten dataset case by its new description | ruling Q3: "The Acceptance points at the rewritten dataset case"; a sub-bullet adds no id |
| G10 | no | deletes the Gates line and adds `- G10 — withdrawn in 0.33.0 (see CHANGELOG 0.33.0): …` under `### Withdrawn` (S19 + S38); id kept | docs/spec-template.md:34-35 and AGENTS.md: withdrawn ids appear only in the appendix (plan review m1); the release number 0.33.0 is a prediction (a feat after 0.32.0 is a minor bump) — the release step corrects it if the bump differs |
| Speed-tier spec-review skip | no | removes it from G9 and R11 | W5.3 Change 6's 5c-bis text drops "Skip if the Speed quality tier"; the cadence is `flags.specReviewer` only |
| `--quality minimal` forces `per-wave` | no | states it in P1 with `sources.specReviewer: quality` | reading R-D1/D2 leaves the place to the plan; the feat plan puts it in `execute.js` (single resolution site) |
| Interactive budget tier | no | states it in P4 (balanced sizing before the prompt, then a second prepare run with the selected tier) | R-interactive-budget-tier requires the feat plan to decide; this is the spec half of that decision (feat plan Key Decision) |
| `waves[].dispatch` (P4) | yes | adds the field to P4's list and one P4 sentence naming it; R-wave-runner-contract's `agentFiles` is that list verbatim | ruling w2-plan Q1: the guardrail `agent-dispatch-script-driven` binds, and the P4 sentence is a consequence of W5.3 Changes 2/3 under it |
| "model escalation" wording in Phase 7, E9, E12 and the summary line | no | left unchanged | each stays true: the second retry still moves to a stronger agent's model; minimal wording |
| `dispatch` entry fields `model` and `retries`; the R13 ladder | yes | P4's sentence names them; R13 states the ladder, including the high-effort and complex/medium rows, the partial-batch retry, and that `model` is never passed to the Agent tool | ruling w2-planreview Q1 (fields) and Q2 (ladder) |
| Full critique for a 1-file plan | no | ran the full plan-sdlc critique and review | the requester asked for the full critique and review |

## Key Decisions

**Problem in one sentence:** the spec describes a dispatch topology that W5.3 replaces, so SKILL.md would contradict its own contract the moment the feat commit lands.

- **Verbatim where the item gives text; minimal wording elsewhere.** R2 and R8 are copied from Change 10. Every other edit changes the smallest clause that is untrue and keeps the rest of the sentence.
- **"Dispatching context" names who acts on each path.** Several requirements said "the wave-runner MUST …". On the direct path main context does the same work. The edits say "the dispatching context (main context, or the wave-runner on the R8 runner path)" rather than duplicating each rule.
- **G10 is withdrawn, not reworded.** The Gates line leaves the body and moves to `### Withdrawn` with its id, per docs/spec-template.md:34-35 (plan review m1). P-5 still prints `SAME`: the id regex matches `- G10 — withdrawn`.
- **The default permission mode is stated as inheritance.** The sentence says execute passes no `mode` parameter, so each subagent inherits the session's permission mode. That is what the harness does (`docs/cost-tiers.md` §7, Spike S1).
- **Worker routing is prepare-script output (ruling w2-plan Q1).** P4 names `dispatch`, and R-wave-runner-contract's `agentFiles` is that list, so every worker dispatch parameter comes from the prepare script.
- **Non-goals.**
  - No SKILL.md, agent, script, test or docs/skills change. Those are the feat plan.
  - No change to R14, R-INVARIANT-COMPLETENESS or the ship spec (reading R-W8.22).
  - No new id. The source requires P-5 to print `SAME`.
  - No `site/` refresh in this commit. `node site/scripts/copy-docs.mjs` runs for the plans+site commit after this one.
- **Failure audience.** The feat plan's executor and every reader of the spec. A wrong sentence here makes the W5.3 SKILL.md either violate its spec or re-implement the old topology.

## Contract Examples

**openspec / spec** (taken from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY 18 requirement sentences (S1–S17, S36); delta text pinned in the task's Old/New blocks; no ids added or removed.
- names: `A2`, `R2`, `R6`, `R8`, `R33`, `R42`, `R-main-context-steps`, `R-nested-dispatch-resilient`, `R-wave-runner-contract`, `R-FACT-SHEET-DISPATCH`, `R-BOUNDED-RETURN`, `R-WAVE-BACKGROUND-DISPATCH`, `R-no-agent-sdk-isolation`; field `agentFiles`.
- mirror: W5.3 Change 10 (R2, R8 verbatim); ruling w2-preflight Q3 (R-WAVE-BACKGROUND-DISPATCH).
- decisions: "dispatching context" wording; Q1 sentence in R-WAVE-BACKGROUND-DISPATCH.
- sync: the feat plan's SKILL.md Step 5b and dataset case description.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source code changes; the feat plan carries the code and its tests |
| no-ci-bypass | error | PASS | No check is skipped |
| no-auto-eval | error | PASS | No promptfoo run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Each edit fixes a sentence W5.3 makes untrue (Research Findings table) |
| single-responsibility-tasks | warning | PASS | Task 1: inputs, state, steps, dispatch; Task 2: gates, prepare contract, failure, invariants, integration, plus the checks |
| scripts-over-llm-logic | error | PASS | P1 and P4 put the new resolution (minimal → per-wave; the tier's budget) in the prepare script |
| yagni | warning | PASS | No new ids or fields beyond `agentFiles`, which Change 8 names |
| cross-skill-consistency | error | PASS | Ship's spec is unaffected: ship still forwards only `--plan`, `--auto`, `--quality` |
| pr-link-github-issue | error | PASS | Tracking is local todo #9014; no GitHub issue to link |
| dry | warning | PASS | "Dispatching context" states each rule once for both paths |
| kiss | warning | PASS | In-place sentence edits |
| spec-first | error | PASS | This is the spec commit; it lands before the feat commit |
| project-agnostic | error | PASS | Plugin spec only |
| flag-coherence-cross-skill | error | PASS | The spec names `flags.specReviewer` and `flags.quality` as the resolved fields |
| no-opposite-logical-vectors | error | PASS | G9 and R11 state the same cadence rule |
| flag-resolution-single-source | warning | PASS | P1 names `execute.js` as the one resolution site for the forced `per-wave` |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | Minimal clauses; the Research Findings table justifies each |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | Each choice the source leaves open is in the Deviations table and Key Decisions; none changes a W5.3 decision |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic |
| agent-dispatch-script-driven | error | PASS | No dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag |
| workspace-mode-compatibility | error | PASS | Docs-only edit of a tracked file |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompt changes in this commit |

## Tasks

### Task 1: Rewrite the inputs, steps and dispatch requirements

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — edits S1–S17 and S36 (A2, Phases 2 and 6, R6, R-main-context-steps, R33, R42, R2, R8, R-nested-dispatch-resilient, R-wave-runner-contract, R-FACT-SHEET-DISPATCH, R-BOUNDED-RETURN, R-WAVE-BACKGROUND-DISPATCH, R-no-agent-sdk-isolation).

**Notes:** Implements W5.3 Change 10 and the consequence edits in the Research Findings table (F-spec-and-cost-tiers-doc-sync-1…3, F-wave-runner-recovery-bypass-removal-27). Each Old text is a literal substring of the spec, and the New text replaces it exactly (Edit tool, one replacement per edit). Every Old text is unique and no two overlap, so the edits can be applied in any order. Old and New blocks are fenced as `text`; a block spanning several lines keeps the spec's two-space continuation indent.

**Anchors (run before editing; each must print `1`):**

```bash
S=docs/specs/execute-plan-sdlc.md
for a in \
  'selects the model assignment mapping for dispatched agents and skips the interactive selection prompt' \
  '2. CLASSIFY — classify each task (complexity, risk, model); build dependency DAG and wave structure' \
  '6. DO — execute waves sequentially: pre-wave guardrail check → high-risk gate → dispatch agents' \
  '- R6: Single trivial task in a wave executed inline; 2+ trivials batched into one agent at the Trivial-tier model (R2)' \
  'Step 5 pre-wave trivial batch, Step 5a-pre (pre-wave guardrail check), Step 5a (high-risk gate)' \
  'The wave-runner Agent MUST inline these as a "## Project Guardrails" section into every per-task Agent prompt AND every batched-trivial Agent prompt it dispatches, including retry dispatches at any tier.' \
  'G10 (pre-wave) and G11 (post-wave) main-context guardrail checks remain in force as defense-in-depth' \
  '- R42 (per-task sibling test convention checking): Per-task and batched-trivial' \
  'Testable assertion: "The per-task template and' \
  '- R2: Each quality preset maps task complexity (Trivial/Standard/Complex) to a model for dispatched agents. The preset names `full|balanced|minimal` (A2) are contract; the model/effort assignment per preset is a tuning value defined in `docs/cost-tiers.md` §5 (Execute quality presets).' \
  '- R8: Step 5b dispatches one wave-runner Agent per wave when the wave contains 1+ Standard or Complex task, OR a Trivial in-wave batch. The wave-runner Agent receives the wave manifest, prior-wave context, and reuses the per-task and batched-trivial prompt templates internally to fan out per-task sub-agents within its own context. Two-level isolation: execute-main → wave-runner Agent → per-task sub-agent. Every per-task agent prompt still includes full task text (never a reference to the plan file), exact file list, expected deliverable, and prior-wave context.' \
  'prose disambiguation at SKILL.md Step 5b and wave-runner-template.md is the enforcement mechanism.' \
  'decisionsFromPriorWaves }, perTaskTemplate, batchedTrivialTemplate }`. The `description` (Notes) field is OPTIONAL — a task whose executable shape lives in `files` + Contract + acceptanceCriteria passes without it. The `perTaskTemplate` and `batchedTrivialTemplate` fields carry the full inline content of the respective templates from `classifying-and-waving-tasks.md`, pasted by main context at dispatch time (not a path reference — wave-runner Agents must not need to Read files at the project root).' \
  'Per-task retries (one tier up per retry per R13, budget 2) remain wave-runner'"'"'s responsibility' \
  '- R-FACT-SHEET-DISPATCH: Per-task Agent prompts dispatched by wave-runner MUST reference a fact-sheet file path (`{FACT_SHEET_PATH}`) rather than inlining the full task body.' \
  '- R-BOUNDED-RETURN: The `WAVE_SUMMARY` JSON returned by wave-runner MUST be validated against a bounded schema;' \
  '- R-WAVE-BACKGROUND-DISPATCH: Every Agent dispatch in execute-plan-sdlc MUST set' \
  '- R-no-agent-sdk-isolation: Wave-runner Agent dispatches (Step 5b) and per-task sub-agent dispatches inside wave-runner-template.md MUST NOT include an `isolation` parameter.'; do
  printf '%s  %.70s\n' "$(command grep -cF -- "$a" "$S")" "$a"
done
```

If any count is not `1`, STOP and report; do not search for an alternative anchor.

**Must not touch:** every id line not listed in this task; every other sentence of the edited requirements; the Appendix. Every other file.

**Contract:**
- shape (openspec): MODIFY only; no id added, removed or renumbered. The Old/New blocks below are the delta text.
- names: `A2`, `R2`, `R6`, `R8`, `R33`, `R42`, `R-main-context-steps`, `R-nested-dispatch-resilient`, `R-wave-runner-contract`, `R-FACT-SHEET-DISPATCH`, `R-BOUNDED-RETURN`, `R-WAVE-BACKGROUND-DISPATCH`, `R-no-agent-sdk-isolation`; input field `agentFiles`; prompt key `FACT_SHEET`; dataset case `execute-plan-sdlc (R-WAVE-BACKGROUND-DISPATCH): no run_in_background parameter; the direct or runner branch awaits every worker`.
- mirror: W5.3 Change 10 (R2, R8); ruling w2-preflight Q3 (R-WAVE-BACKGROUND-DISPATCH) and Q1 (default permission mode).
- decisions: Key Decisions ("dispatching context"; Q1 placement).
- sync: the feat plan's dataset case description (S17's Acceptance) and SKILL.md Step 5 text.

#### S1 — A2

Old (must occur once):

````text
selects the model assignment mapping for dispatched agents and skips the interactive selection prompt
````

New:

````text
selects the worker routing (agent and effort, R2) for dispatched workers and skips the interactive selection prompt
````

#### S2 — Phases 2 CLASSIFY

Old (must occur once):

````text
2. CLASSIFY — classify each task (complexity, risk, model); build dependency DAG and wave structure
````

New:

````text
2. CLASSIFY — classify each task (complexity, risk, worker routing); build dependency DAG and wave structure
````

#### S3 — Phases 6 DO

Old (must occur once):

````text
6. DO — execute waves sequentially: pre-wave guardrail check → high-risk gate → dispatch agents
````

New:

````text
6. DO — execute waves sequentially: high-risk gate → dispatch agents
````

#### S4 — R6

Old (must occur once):

````text
- R6: Single trivial task in a wave executed inline; 2+ trivials batched into one agent at the Trivial-tier model (R2)
````

New:

````text
- R6: A single pre-wave trivial task is executed inline; a single trivial task inside a wave is dispatched as one worker; 2+ trivials in the pre-wave or in a wave are batched into one worker (R2)
````

#### S5 — R-main-context-steps

Old (must occur once):

````text
Step 5 pre-wave trivial batch, Step 5a-pre (pre-wave guardrail check), Step 5a (high-risk gate)
````

New:

````text
Step 5 pre-wave trivial batch, Step 5a (high-risk gate)
````

#### S6 — R33 inline sentence

Old (must occur once):

````text
The wave-runner Agent MUST inline these as a "## Project Guardrails" section into every per-task Agent prompt AND every batched-trivial Agent prompt it dispatches, including retry dispatches at any tier.
````

New:

````text
The dispatching context (execute's main context, or the wave-runner Agent on the R8 runner path) MUST inline these as a "## Project Guardrails" section at the top of every worker prompt it dispatches, single-task and batched, including retry dispatches at any tier.
````

#### S7 — R33 defense sentence

Old (must occur once):

````text
G10 (pre-wave) and G11 (post-wave) main-context guardrail checks remain in force as defense-in-depth
````

New:

````text
The G11 post-wave main-context guardrail check remains in force as defense-in-depth
````

#### S8 — R42 subject

Old (must occur once):

````text
- R42 (per-task sibling test convention checking): Per-task and batched-trivial
  agent prompt templates MUST include
````

New:

````text
- R42 (per-task sibling test convention checking): The single-task and batched
  worker agent bodies (`agents/execute-worker*.md`) MUST include
````

#### S9 — R42 assertion

Old (must occur once):

````text
Testable assertion: "The per-task template and
  batched-trivial template each contain
````

New:

````text
Testable assertion: "The single-task and
  batched worker agent bodies each contain
````

#### S10 — R2

Old (must occur once):

````text
- R2: Each quality preset maps task complexity (Trivial/Standard/Complex) to a model for dispatched agents. The preset names `full|balanced|minimal` (A2) are contract; the model/effort assignment per preset is a tuning value defined in `docs/cost-tiers.md` §5 (Execute quality presets).
````

New:

````text
- R2: Model assignment per quality tier is a (worker agent, effort) pair from the routing table in classifying-and-waving-tasks.md; Haiku is used only for batched trivials.
````

#### S11 — R8

Old (must occur once):

````text
- R8: Step 5b dispatches one wave-runner Agent per wave when the wave contains 1+ Standard or Complex task, OR a Trivial in-wave batch. The wave-runner Agent receives the wave manifest, prior-wave context, and reuses the per-task and batched-trivial prompt templates internally to fan out per-task sub-agents within its own context. Two-level isolation: execute-main → wave-runner Agent → per-task sub-agent. Every per-task agent prompt still includes full task text (never a reference to the plan file), exact file list, expected deliverable, and prior-wave context.
````

New:

````text
- R8: Step 5b dispatches one worker Agent per Standard/Complex task and one batch Agent per 2+ Trivial group directly from execute's main context (depth 1 under execute). A wave-runner Agent (two-level isolation, wave-runner-template.md) is used only when the plan's task count reaches `execute.waveRunnerMinPlanTasks` (default 9). Every worker prompt points at its fact sheet, lists the allowed files, and carries the prior-wave summary.
````

#### S12 — R-nested-dispatch-resilient

Old (must occur once):

````text
prose disambiguation at SKILL.md Step 5b and wave-runner-template.md is the enforcement mechanism.
````

New:

````text
prose disambiguation at the top of SKILL.md Step 5 is the enforcement mechanism.
````

#### S13 — R-wave-runner-contract input

Old (must occur once):

````text
decisionsFromPriorWaves }, perTaskTemplate, batchedTrivialTemplate }`. The `description` (Notes) field is OPTIONAL — a task whose executable shape lives in `files` + Contract + acceptanceCriteria passes without it. The `perTaskTemplate` and `batchedTrivialTemplate` fields carry the full inline content of the respective templates from `classifying-and-waving-tasks.md`, pasted by main context at dispatch time (not a path reference — wave-runner Agents must not need to Read files at the project root).
````

New:

````text
decisionsFromPriorWaves }, agentFiles }`. The `description` (Notes) field is OPTIONAL — a task whose executable shape lives in `files` + Contract + acceptanceCriteria passes without it. The `agentFiles` field is the wave's `dispatch` list from the prepare output (P4), passed verbatim; the runner dispatches those entries and reads no prompt template.
````

#### S14 — R-wave-runner-contract retries

Old (must occur once):

````text
Per-task retries (one tier up per retry per R13, budget 2) remain wave-runner's responsibility
````

New:

````text
Per-task retries (per R13, budget 2) remain wave-runner's responsibility
````

#### S15 — R-FACT-SHEET-DISPATCH

Old (must occur once):

````text
- R-FACT-SHEET-DISPATCH: Per-task Agent prompts dispatched by wave-runner MUST reference a fact-sheet file path (`{FACT_SHEET_PATH}`) rather than inlining the full task body.
````

New:

````text
- R-FACT-SHEET-DISPATCH: Worker Agent prompts (dispatched by main context, or by the wave-runner on the R8 runner path) MUST reference a fact-sheet file path (`FACT_SHEET`) rather than inlining the full task body.
````

#### S16 — R-BOUNDED-RETURN

Old (must occur once):

````text
- R-BOUNDED-RETURN: The `WAVE_SUMMARY` JSON returned by wave-runner MUST be validated against a bounded schema;
````

New:

````text
- R-BOUNDED-RETURN: The `WAVE_SUMMARY` JSON (returned by the wave-runner, or composed by main context from the workers' `COMPLETE:` returns on the direct path) MUST be validated against a bounded schema;
````

#### S17 — R-WAVE-BACKGROUND-DISPATCH

Old (must occur once):

````text
- R-WAVE-BACKGROUND-DISPATCH: Every Agent dispatch in execute-plan-sdlc MUST set
  `run_in_background` explicitly. Subagents run in the background by default, so an unstated
  assumption of foreground blocking is silently false. The wave-runner dispatch from main context
  MUST set `run_in_background: false` (main context requires the result before continuing);
  per-task dispatches from the wave-runner MUST set `run_in_background: true` so the runner can
  poll and terminate them under `R-WAVE-DEADLINE`. Background subagents retain `Edit`, `Write`,
  `Bash`, `Monitor`, `TaskStop`, and `SendMessage`, so backgrounding does not reduce worker
  capability. Testable assertion: "Every Agent-dispatch instruction in SKILL.md and
  wave-runner-template.md names `run_in_background` with an explicit boolean."
````

New:

````text
- R-WAVE-BACKGROUND-DISPATCH: The Agent tool has no `run_in_background` parameter, and no
  dispatch in execute-plan-sdlc passes one. Subagents run in the background and notify the
  dispatching context when they complete. The dispatching context (execute's main context, or the
  wave-runner on the R8 runner path) dispatches a wave's N workers in one message and awaits all N
  results across those completion notifications before it consolidates; that wait is the barrier,
  and it never consolidates on a partial or absent set. Main context awaits a wave-runner's single
  return the same way. Background subagents retain `Edit`, `Write`, `Bash`, `Monitor`, `TaskStop`,
  and `SendMessage`, so backgrounding does not reduce worker capability. execute-plan-sdlc
  dispatches every subagent in the default permission mode: it passes no `mode` parameter, so each
  subagent inherits the session's permission mode.
  - Acceptance: behavioral coverage in `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — `execute-plan-sdlc (R-WAVE-BACKGROUND-DISPATCH): no run_in_background parameter; the direct or runner branch awaits every worker`.
````

#### S36 — R-no-agent-sdk-isolation

Old (must occur once):

````text
- R-no-agent-sdk-isolation: Wave-runner Agent dispatches (Step 5b) and per-task sub-agent dispatches inside wave-runner-template.md MUST NOT include an `isolation` parameter.
````

New:

````text
- R-no-agent-sdk-isolation: Worker and wave-runner Agent dispatches (Step 5b) and the runner's worker dispatches inside wave-runner-template.md MUST NOT include an `isolation` parameter.
````


**Acceptance criteria:**
- [ ] Before editing, every anchor prints `1`.
- [ ] After editing, each New text occurs once: `command grep -cF -- 'Haiku is used only for batched trivials.' docs/specs/execute-plan-sdlc.md`, `command grep -cF -- 'used only when the plan'"'"'s task count reaches `execute.waveRunnerMinPlanTasks` (default 9).' docs/specs/execute-plan-sdlc.md`, `command grep -cF -- 'it passes no `mode` parameter, so each' docs/specs/execute-plan-sdlc.md` and `command grep -cF -- 'no run_in_background parameter; the direct or runner branch awaits every worker' docs/specs/execute-plan-sdlc.md` each print `1`.
- [ ] `command grep -cE 'run_in_background: (true|false)|perTaskTemplate|batchedTrivialTemplate' docs/specs/execute-plan-sdlc.md` prints `0`.

### Task 2: Rewrite the gates, prepare contract, failure, invariant and integration sentences; run the checks

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — edits S18–S35 and S37–S40 (G9, G10 withdrawn to the appendix, R11, R18, P1, P4, P9, E1, E2, R13, R-wave-abort-resume, R-WAVE-DEADLINE, R28, C7, C12, I4, I5, I6, R-wave-runner-contract opening).

**Notes:** F-spec-and-cost-tiers-doc-sync-3, -7; F-execute-skill-md-anchor-rewrite-9. Each Old text is a literal substring of the spec; replace it with its New text exactly (Edit tool, one replacement per edit); the edits do not overlap, so their order does not matter; a New text of nothing deletes the Old line with its line break. The plan header's Verification is this task's final check, because it needs both tasks' edits. Run `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w2/spec; mkdir -p "$TMPDIR";` in the same Bash call as every command that uses `$TMPDIR`.

**Anchors (run before editing; each must print `1`):**

```bash
S=docs/specs/execute-plan-sdlc.md
for a in \
  '- G9: Spec compliance reviewed — non-trivial waves pass spec review (unless Speed quality tier `--quality full`)' \
  '- G10: Pre-wave guardrail check — error-severity guardrails pass or user overrides' \
  '- R11: Spec compliance review after each wave for non-trivial tasks (skip for Speed quality tier — `--quality full`)' \
  '- R18: Execution guardrails: pre-wave (error-severity only) and post-wave (all severities); error violations block, warning violations report only' \
  '`waveRunnerMinPlanTasks` is the task count at which a plan dispatches through the wave-runner; `specReviewer` (`once` | `per-wave`) sets how often the spec-compliance review runs.' \
  '`expectedFiles` is the union of every task'"'"'s Create/Modify/Test paths; `verificationHint` is the shared `**Verify:**` value when every task in the wave has the same one, else `null`.' \
  'The skill passes it to the wave-runner verbatim.' \
  '- E1: Agent error on a lowest-tier task → re-dispatch once with failure context, escalate one tier (R13)' \
  '- E2: Agent error on a middle-tier task → re-dispatch once with failure context, escalate one tier (R13)' \
  '- R13: Maximum 2 retries per task; on each failure the task'"'"'s model escalates one tier, and a failure at the top tier escalates to the user (tier ladder in `docs/cost-tiers.md` §5)' \
  'Mid-wave abort is not supported (wave-runner runs to wave completion or wave failure).' \
  '`ship.executeWaveTimeout`, P1) and the value reaches the wave-runner through the `wave-start`' \
  'On expiry the runner MUST emit `errorCode: TIMEOUT` for each terminated task' \
  '- R28: At Step 5a-pre and Step 5c-ter guardrail FAIL menus,' \
  '- C7: Must not dispatch a separate agent per trivial task — inline 1, batch 2+' \
  '- C12: Every Agent dispatch MUST include the `model:` parameter per the preset mapping (R2). Omitting `model:` causes the agent to inherit the parent model, violating cost targets.' \
  '- I4: Agent tool — dispatches task agents with per-task model assignment' \
  '- I6: `classifying-and-waving-tasks.md` — agent prompt template, batch template, wave algorithm' \
  '- P4: `waves` (array of `{ n, taskIds, cap, budget, expectedFiles, verificationHint }`)' \
  '### Withdrawn' \
  '- R-wave-runner-contract: The wave-runner Agent is the sole executor within a wave. Its contract is:' \
  '- I5: `spec-compliance-reviewer.md` — post-wave spec review template'; do
  printf '%s  %.70s\n' "$(command grep -cF -- "$a" "$S")" "$a"
done
```

**Must not touch:** E3–E14, C1–C11 and C13–C16, R14, R-INVARIANT-COMPLETENESS (reading R-W8.22), every other P-field sentence, the Appendix except the new G10 line under `### Withdrawn`. Every other file.

**Contract:**
- shape (openspec): MODIFY only; no id added, removed or renumbered. The Old/New blocks below are the delta text.
- names: `G9`, `G10` (withdrawn), `R11`, `I5`, `R-wave-runner-contract`, `R18`, `P1`, `P4`, `P9`, `E1`, `E2`, `R13`, `R-wave-abort-resume`, `R-WAVE-DEADLINE`, `R28`, `C7`, `C12`, `I4`, `I6`; fields `flags.specReviewer`, `sources.specReviewer` value `quality`, `flags.quality`, `waves[].budget`, `waves[].dispatch`.
- mirror: W5.3 Changes 5–7; reading R-D1/D2 (D2); R-interactive-budget-tier.
- decisions: G10 withdrawn to the appendix (plan review m1); the retry ladder per ruling w2-planreview Q2; the Speed-tier skip removed (Deviations table); the forced `per-wave` lives in `execute.js` (P1); `dispatch` in P4 (ruling w2-plan Q1).
- sync: the feat plan's `execute.js` cases for `specReviewer` and the budget tier; SKILL.md 5c-bis/8-bis and Step 4.

#### S18 — G9

Old (must occur once):

````text
- G9: Spec compliance reviewed — non-trivial waves pass spec review (unless Speed quality tier `--quality full`)
````

New:

````text
- G9: Spec compliance reviewed — non-trivial tasks pass spec review at the cadence `flags.specReviewer` sets (R11)
````

#### S19 — G10 leaves the Gates body (withdrawn; see S38)

Old (must occur once):

````text
- G10: Pre-wave guardrail check — error-severity guardrails pass or user overrides
````

New: nothing — delete the Old line, including its line break.

#### S20 — R11

Old (must occur once):

````text
- R11: Spec compliance review after each wave for non-trivial tasks (skip for Speed quality tier — `--quality full`)
````

New:

````text
- R11: Spec compliance review of non-trivial tasks at the cadence `flags.specReviewer` sets (P1): once per run after the final wave (`once`), or after each wave that holds a non-trivial task (`per-wave`)
````

#### S21 — R18

Old (must occur once):

````text
- R18: Execution guardrails: pre-wave (error-severity only) and post-wave (all severities); error violations block, warning violations report only
````

New:

````text
- R18: Execution guardrails: evaluated post-wave (all severities); error violations block, warning violations report only
````

#### S22 — P1

Old (must occur once):

````text
`waveRunnerMinPlanTasks` is the task count at which a plan dispatches through the wave-runner; `specReviewer` (`once` | `per-wave`) sets how often the spec-compliance review runs.
````

New:

````text
`waveRunnerMinPlanTasks` is the task count at which a plan dispatches through the wave-runner; `specReviewer` (`once` | `per-wave`) sets how often the spec-compliance review runs, and a resolved `quality` of `minimal` forces `per-wave` (`sources.specReviewer` is then `quality`).
````

#### S23 — P4

Old (must occur once):

````text
`expectedFiles` is the union of every task's Create/Modify/Test paths; `verificationHint` is the shared `**Verify:**` value when every task in the wave has the same one, else `null`.
````

New:

````text
`expectedFiles` is the union of every task's Create/Modify/Test paths; `verificationHint` is the shared `**Verify:**` value when every task in the wave has the same one, else `null`. Each wave's `budget` is sized for the models of the workers the resolved tier routes its tasks to (R2); when `quality` is `null` (an interactive run before the tier prompt) the waves are sized and routed for `balanced`, and Step 4 runs the prepare script again with the selected `--quality` before any wave is dispatched. `dispatch` (array of `{ agent, model, effort, taskIds, retries }`) is the wave's worker routing for the resolved tier, taken from the routing table (R2): one entry per Standard or Complex task and per single Trivial task, one batch entry for 2+ Trivial tasks, each with the agent, model and effort of its retries (R13); the skill dispatches the entries verbatim and re-derives them only for the waves a Step 3 move touches.
````

#### S24 — P9

Old (must occur once):

````text
The skill passes it to the wave-runner verbatim.
````

New:

````text
On the R8 runner path the skill passes it to the wave-runner verbatim; on the direct path the skill dispatches the workers from it.
````

#### S25 — E1

Old (must occur once):

````text
- E1: Agent error on a lowest-tier task → re-dispatch once with failure context, escalate one tier (R13)
````

New:

````text
- E1: Agent error on a lowest-tier task → re-dispatch with failure context, escalating per R13
````

#### S26 — E2

Old (must occur once):

````text
- E2: Agent error on a middle-tier task → re-dispatch once with failure context, escalate one tier (R13)
````

New:

````text
- E2: Agent error on a middle-tier task → re-dispatch with failure context, escalating per R13
````

#### S27 — R13

Old (must occur once):

````text
- R13: Maximum 2 retries per task; on each failure the task's model escalates one tier, and a failure at the top tier escalates to the user (tier ladder in `docs/cost-tiers.md` §5)
````

New:

````text
- R13: Maximum 2 retries per task. The first retry re-dispatches the same worker agent with the failure context and its effort raised one level; the second moves the task to the next worker agent tier. A task already at the top effort below the top agent moves to the next tier for both retries (first at medium, then at high effort). A task on the top worker agent below the top effort gets both retries there at the top effort; a task already on the top agent at the top effort is re-dispatched once with the failure context, then escalated to the user (ladder in `docs/cost-tiers.md` §5). Each retry's agent, model and effort is the task's dispatch entry's `retries` (P4); `model` is recorded for budgets and the manifest and is never passed to the Agent tool, because the agent file pins it; a task extracted from a failed batch is re-dispatched on the batch entry's second retry.
````

#### S28 — R-wave-abort-resume

Old (must occur once):

````text
Mid-wave abort is not supported (wave-runner runs to wave completion or wave failure).
````

New:

````text
Mid-wave abort is not supported (a wave runs to completion or failure).
````

#### S29 — R-WAVE-DEADLINE

Old (must occur once):

````text
`ship.executeWaveTimeout`, P1) and the value reaches the wave-runner through the `wave-start`
  manifest (P9); ship-sdlc does not forward it. The harness provides no per-Agent wall-clock deadline — `maxTurns` is a turn
  budget, not a clock — so the wave-runner MUST enforce the deadline itself by dispatching
  per-task workers in the background and polling
  with `Monitor`, terminating overrun workers with `TaskStop`.
````

New:

````text
`ship.executeWaveTimeout`, P1) and the value reaches the dispatching context through the `wave-start`
  manifest (P9); ship-sdlc does not forward it. The harness provides no per-Agent wall-clock deadline — `maxTurns` is a turn
  budget, not a clock — so the dispatching context (main context on the direct path, the
  wave-runner on the R8 runner path) MUST enforce the deadline itself: workers run in the
  background, and it polls
  with `Monitor`, terminating overrun workers with `TaskStop`.
````

#### S30 — R-WAVE-DEADLINE expiry

Old (must occur once):

````text
On expiry the runner MUST emit `errorCode: TIMEOUT` for each terminated task
````

New:

````text
On expiry the dispatching context MUST report `errorCode: TIMEOUT` for each terminated task
````

#### S31 — R28

Old (must occur once):

````text
- R28: At Step 5a-pre and Step 5c-ter guardrail FAIL menus,
````

New:

````text
- R28: At the Step 5c-ter guardrail FAIL menu,
````

#### S32 — C7

Old (must occur once):

````text
- C7: Must not dispatch a separate agent per trivial task — inline 1, batch 2+
````

New:

````text
- C7: Must not dispatch a separate agent per trivial task when the pre-wave or a wave holds 2+ trivials — batch them (R6)
````

#### S33 — C12

Old (must occur once):

````text
- C12: Every Agent dispatch MUST include the `model:` parameter per the preset mapping (R2). Omitting `model:` causes the agent to inherit the parent model, violating cost targets.
````

New:

````text
- C12: Every worker dispatch MUST name a worker agent file, which pins its model (R2), and every other Agent dispatch MUST include the `model:` parameter. A dispatch with neither inherits the session model, violating cost targets.
````

#### S34 — I4

Old (must occur once):

````text
- I4: Agent tool — dispatches task agents with per-task model assignment
````

New:

````text
- I4: Agent tool — dispatches the worker agents (`agents/execute-worker*.md`) with the per-task effort from R2
````

#### S35 — I6

Old (must occur once):

````text
- I6: `classifying-and-waving-tasks.md` — agent prompt template, batch template, wave algorithm
````

New:

````text
- I6: `classifying-and-waving-tasks.md` — classification heuristics, worker routing table, wave algorithm
````

#### S37 — P4 field list (ruling w2-plan Q1)

Old (must occur once):

````text
- P4: `waves` (array of `{ n, taskIds, cap, budget, expectedFiles, verificationHint }`)
````

New:

````text
- P4: `waves` (array of `{ n, taskIds, cap, budget, expectedFiles, verificationHint, dispatch }`)
````

#### S38 — Appendix ### Withdrawn: G10 (docs/spec-template.md:34-35; review m1)

Old (must occur once):

````text
### Withdrawn

- R26 — withdrawn in 0.21.0 (see CHANGELOG 0.21.0):
````

New:

````text
### Withdrawn

- G10 — withdrawn in 0.33.0 (see CHANGELOG 0.33.0): the pre-wave guardrail check is removed; error-severity guardrails reach every worker prompt (R33) and are evaluated once after each wave (G11).
- R26 — withdrawn in 0.21.0 (see CHANGELOG 0.21.0):
````

#### S39 — R-wave-runner-contract opening (review m2)

Old (must occur once):

````text
- R-wave-runner-contract: The wave-runner Agent is the sole executor within a wave. Its contract is:
````

New:

````text
- R-wave-runner-contract: On the R8 runner path the wave-runner Agent is the sole executor within a wave. Its contract is:
````

#### S40 — I5 (review m2)

Old (must occur once):

````text
- I5: `spec-compliance-reviewer.md` — post-wave spec review template
````

New:

````text
- I5: `spec-compliance-reviewer.md` — spec review template (per-wave or once per run, R11)
````


**Commit:** subject `docs(#9014): execute-plan-sdlc - flat worker topology spec (W5.3)` (65 characters). Files: `docs/specs/execute-plan-sdlc.md`. Committed through the orchestrator's commit wrapper after this task's checks pass. Body: one line per topic of the Research Findings table, then `Checks: P-5 SAME; validate-spec-shape prints nothing for execute-plan-sdlc.` with the real results, then the session's attribution line.

**Acceptance criteria:**
- [ ] Before editing, every anchor prints `1`.
- [ ] After editing: `command grep -cE '5a-pre|Speed quality tier|escalates one tier|escalate one tier|^- G10:' docs/specs/execute-plan-sdlc.md` prints `0`; `command grep -c '^- G10 — withdrawn in' docs/specs/execute-plan-sdlc.md` prints `1`; `command grep -cF -- '(`sources.specReviewer` is then `quality`)' docs/specs/execute-plan-sdlc.md` prints `1`; `command grep -cF -- 'Step 4 runs the prepare script again with the selected `--quality`' docs/specs/execute-plan-sdlc.md` prints `1`; `command grep -cF -- 'verificationHint, dispatch }`' docs/specs/execute-plan-sdlc.md` and `command grep -cF -- 'the skill dispatches the entries verbatim' docs/specs/execute-plan-sdlc.md` each print `1`.
- [ ] The header Verification prints `SAME execute-plan-sdlc`, `exit=0` and `0`.
- [ ] `git diff --stat` shows only the spec; `git diff | command grep -c $'\r'` prints `0`; `git status --porcelain -uno` shows only the spec before the commit.

## Final Shape

The spec describes the W5.3 topology:

- Workers are three agent files, routed by tier and complexity to an (agent, effort) pair (R2).
- Plans below `execute.waveRunnerMinPlanTasks` dispatch workers from main context; larger plans use the wave-runner (R8). The routing reaches both as prepare output (`waves[].dispatch`, P4).
- No dispatch passes `run_in_background` or `mode`. The dispatcher awaits all N workers, and subagents inherit the session's permission mode (R-WAVE-BACKGROUND-DISPATCH).
- There is no pre-wave guardrail pass (G10 withdrawn). Guardrails are injected into every worker prompt and checked once after each wave.
- The spec reviewer runs at the `flags.specReviewer` cadence; `minimal` forces `per-wave` (P1, R11, G9).
- Retries raise effort, then the agent tier (R13).
- Interactive runs re-size the waves for the selected tier (P4).
- The id set is unchanged.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement (source checklist) | Task(s) | Status |
|---|---|---|
| 2 R2/R8 verbatim, Q3 rewording + Acceptance, Q1 sentence, consequence edits, P-5 SAME | Task 1, Task 2 | covered |
| 15 ruling w2-plan Q1: P4 names `dispatch` | Task 2 (S23, S37) | covered |
| 18–19 ruling w2-planreview Q1–Q2: `model`/`retries`, R13 ladder | Task 2 (S23, S27) | covered |
| 22 m1 G10 withdrawn, m2 two sentences | Task 2 (S19, S38–S40) | covered |

Review rounds: 1–3 before the plan review (Approved); fix round 2 (ruling w2-planreview, review m1/m2): G10 moved to `### Withdrawn`, S39/S40 added, R13 ladder and `model` clause; reviewer Approved (all 40 Old texts occur once, id set unchanged); content-lane notes (R13 names `model`, self-contained Notes) fixed.

Verdict: All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
