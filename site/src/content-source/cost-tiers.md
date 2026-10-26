# Cost Tiers — Skill and Agent Model Assignments

Single source of truth for the model that runs each skill and orchestrator agent in the SDLC plugin.

## 1. Overview

Per-skill and per-agent `model:` frontmatter lets the plugin trade cost against quality on a surface-by-surface basis. Pinning `model:` is one lever. `effort` is the first lever on the same model and keeps the prompt cache, so tune effort before changing tier. A surface with no `model:` inherits the session model, which may be the most expensive tier. Mechanical, deterministic work belongs on the cheap tier; reasoning-heavy work on stronger models.

This document is the canonical record. The `validate-cost-tiers.js` CI script diffs this table against actual frontmatter on every change and fails when they disagree.

## 2. Resolution Precedence

When the runtime needs to decide which model to run a surface on, it evaluates these in order (most → least specific):

1. **Per-call `model:` parameter** on `Agent` / `Skill` / `SendMessage` dispatch sites. Examples: `ship.js` per-step, `execute.js` per-task, `review.js` per-dimension. These are computed at dispatch time and override everything below.
2. **Frontmatter `model:`** on the skill or agent definition file (the tables in §3 and §4).
3. **Caller's inherited model** — only when neither of the above is set. Avoid relying on inheritance; pin explicitly. A skill whose §3 row says `inherit` carries `model: inherit` in its frontmatter: it runs on the session model.

## 3. Skill Table

One row per skill in `plugins/sdlc-utilities/skills/`.

| Skill | Model | Rationale |
|---|---|---|
| commit-sdlc | inherit | Runs on the session model; message drafting is routed to commit-orchestrator (haiku). A skill pin would move the whole transcript onto the pinned model. |
| error-report-sdlc | inherit | Runs on the session model; consent gates and gh stay in main context; drafting is routed to error-report-orchestrator (haiku). |
| execute-plan-sdlc | sonnet | Orchestrator; workers routed by the agent × effort table |
| harden-sdlc | sonnet | Existing — unchanged |
| jira-sdlc | sonnet | Read/write Jira; light reasoning |
| plan-sdlc | opus | Plan decomposition needs stronger reasoning; user-directed |
| pr-sdlc | inherit | Runs on the session model; the PR description is the judgment deliverable. Inside ship-sdlc the per-step model from ship.js wins. |
| received-review-sdlc | opus | Review-comment triage benefits from stronger reasoning |
| review-sdlc | sonnet | Orchestrator agent also runs sonnet; dimension subagents resolve from each dimension file's own frontmatter |
| setup-sdlc | sonnet | Wizard / config writes |
| ship-sdlc | sonnet | Pipeline coordinator; per-step model overrides win |
| verify-pipeline-sdlc | sonnet | CI-failure analysis; minimal fix or proposal |
| version-sdlc | inherit | Runs on the session model; exact git sequence needs verification gates. Changelog draft stays on the session model. |

## 4. Agent Table

One row per agent in `plugins/sdlc-utilities/agents/`.

| Agent | Model | Effort | Rationale |
|---|---|---|---|
| commit-orchestrator | haiku | low | Manifest → message; deterministic shape |
| error-report-orchestrator | haiku | low | Template → JSON |
| harden-orchestrator | haiku | low | Manifest → JSON |
| plan-explore-orchestrator | sonnet | - | Fans out discovery subagents and critiques findings |
| review-orchestrator | sonnet | - | Cross-dimension critique + dedup reasoning; dimension subagents use per-dimension `model:` |
| ship-step-execute | opus | high | Runs execute-plan-sdlc for ship; plan execution and recovery need the strongest tier |
| ship-step-commit | haiku | low | Runs commit-sdlc for ship (also commit-fixes); mechanical, message drafting goes to commit-orchestrator |
| ship-step-review | sonnet | medium | Runs review-sdlc for ship; dimension agents carry their own models |
| ship-step-received-review | sonnet | medium | Runs received-review-sdlc for ship; triage and fixes at today's ship tier |
| ship-step-version | sonnet | low | Runs version-sdlc for ship; scripted release steps with verification gates |
| ship-step-pr | sonnet | low | Runs pr-sdlc for ship; description drafting from a prepared context |
| execute-worker | sonnet | medium | One plan task from its fact sheet (Standard, single in-wave Trivial); effort per the routing table |
| execute-worker-batch | haiku | medium | 2+ trivial tasks in one dispatch; the only Haiku worker |
| execute-worker-complex | opus | high | Complex tasks (Standard too at the Quality tier); same body as execute-worker |

## 5. Dispatch-Site Overrides

Files where per-call `model:` is computed at runtime and **wins over frontmatter**:

- `plugins/sdlc-utilities/scripts/skill/ship.js` — reads `model`/`effort` from `agents/ship-step-*.md`.
- `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — the worker routing table maps quality tier × complexity to a worker agent (whose frontmatter pins the model) and an Agent-dispatch `effort`; execute passes no per-task `model:`. `plugins/sdlc-utilities/scripts/skill/execute.js` emits the classification floor and the wave structure, applies the table to each wave, and emits the routing as `waves[].dispatch` (`WORKER_ROUTING`, `AGENT_MODELS`), which SKILL.md dispatches verbatim.
- `plugins/sdlc-utilities/scripts/skill/review.js` — passes per-dimension `model:` resolved from each dimension file's own frontmatter.
- `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — cross-model plan-reviewer rule (sonnet reviews opus-authored plans, and vice versa) at 5+ tasks.

When ship-sdlc dispatches a sub-skill, the sub-skill runs inside its `ship-step-*` agent: the agent file's `model:` and `effort:` apply, not the sub-skill's frontmatter. Consumers should not assume the sub-skill's frontmatter applies inside a pipeline.

### Ship per-step dispatch

Spike S1 (§7) answered NO: a forked sub-skill cannot ask the user. So ship asks in the main context before each dispatch, and the forked sub-skill runs with `--auto`. Content previews (commit message, changelog draft, PR body, received-review plan) are not shown in interactive mode under S1 = NO.

| Step | Agent | Main-context decision before dispatch (interactive only) | Arguments ship adds |
|---|---|---|---|
| execute | ship-step-execute | `execute_handoff` (resume after a stop), `execute_state` (state file found), `execute_tier` (no `--quality`); `execute_gate` after a high-risk pending question | `--quality <tier>`; `--resume`; `--resume --auto` after `execute_gate` yes |
| commit | ship-step-commit | `confirm_commit` | `--auto` |
| review | ship-step-review | none | `--committed` |
| received-review | ship-step-received-review | `review_gate` (`confirm_received_review` when `review_gate` did not ask) | `--auto` |
| commit-fixes | ship-step-commit | `confirm_commit_fixes` | `--auto` |
| version | ship-step-version | `confirm_version` | `--bump <type> --auto` |
| pr | ship-step-pr | `confirm_pr` | `--auto` |

A question a sub-skill still cannot ask comes back as `output.pendingQuestion`. Ship carries a high-risk `yes` back to execute; for any other answer it stops with the state kept and prints the commands to continue.

### Execute worker routing

`execute-plan-sdlc` routes each task to a worker agent and an Agent-dispatch `effort` by quality tier and complexity. The tier names are contract (`docs/specs/execute-plan-sdlc.md` A2, R2); the agents and efforts are tuning. Defined in `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` ("Worker routing"), dispatched in `SKILL.md` Step 5b; `scripts/skill/execute.js` holds the same table as `WORKER_ROUTING` and emits it per wave; the classifying table is the copy an exec case checks against the code, and this one is a summary.

| Complexity | Speed (`--quality full`) | Balanced (default) | Quality (`--quality minimal`) |
|---|---|---|---|
| Trivial (single, in-wave) | execute-worker / low | execute-worker / low | execute-worker / medium |
| Trivial (2+ batched) | execute-worker-batch / medium | execute-worker-batch / medium | execute-worker / medium |
| Standard | execute-worker / low | execute-worker / medium | execute-worker-complex / medium |
| Complex | execute-worker / high | execute-worker-complex / high | execute-worker-complex / high |

Haiku runs only the batched-trivial agent. On failure a task retries at most twice (R13), on the `retries` the prepare script puts in its dispatch entry:

| Entry | First retry | Second retry |
|---|---|---|
| execute-worker-batch or execute-worker at low or medium | same agent, effort one level up | next agent tier, medium |
| execute-worker-batch or execute-worker at high | next agent tier, medium | next agent tier, high |
| execute-worker-complex at medium | execute-worker-complex, high | execute-worker-complex, high |
| execute-worker-complex at high | execute-worker-complex, high | — (then the user) |

The agent tiers are execute-worker-batch → execute-worker → execute-worker-complex. A task extracted from a failed batch is re-dispatched on the batch entry's second retry.

## 6. Why tuning changes do not require spec updates

Specs (`docs/specs/<skill>.md`) are behavioural contracts: inputs, state, step order, dispatch targets, gates, failure handling and invariants. A spec names each tuning knob and says where it is defined; it never states the value. The values live outside the spec:

- `model:` and `effort:` — skill frontmatter and `plugins/sdlc-utilities/agents/<name>.md` frontmatter (§3–§5 of this document).
- Timeouts, intervals and retry counts — `.sdlc/config.json` / `.sdlc/local.json` keys, with defaults in `schemas/*.schema.json`.
- Caps and limits — constants in `plugins/sdlc-utilities/scripts/lib/*` (for example the static wave-size cap table in `dispatch-budget.js`).

The `spec-first` planning guardrail (`.sdlc/config.json`) applies to contract changes only. Changing a tuning value is not a behavioural change — inputs, outputs, side effects and user-visible behaviour stay the same — so it needs no spec edit. Update this document instead; `validate-cost-tiers.js` keeps frontmatter and the tables above in sync.

If a tuning change later degrades output below the contract's bar (e.g., commit messages stop matching project style), that is a behavioural regression and triggers a normal spec-driven change: revert the value, or update the spec to state the new quality envelope.

## 7. Effort

`effort` tunes how much reasoning a dispatch spends on the same model, so it is the first lever to pull before moving a surface to a higher tier. Accepted values are `low|medium|high|xhigh|max`; Opus 5.5, Sonnet 5.5 and Haiku 5.5 default to `medium`. The `CLAUDE_CODE_EFFORT_LEVEL` environment variable overrides every field and parameter below. On Bedrock, Vertex and Foundry, `sonnet` and `haiku` resolve to 4.5-generation models.

| Where effort is set | Status |
|---|---|
| Agent frontmatter `effort:` | The three Haiku orchestrators set `effort: low` |
| Review-dimension frontmatter `effort:` | Not read today; W6b.5 adds the schema field and the `review.js` pass-through |
| Execute worker routing (Agent dispatch `effort` param) | Set per task by the routing table (§5); the first retry raises it one level before the agent tier changes |

Effort is set in agent frontmatter; the validator does not check it.

| Surface | Config A | Config B | Artifacts (n) | Tokens in/out (A, B) | Cost per completed task (A, B) | Completed (A, B) | Decision | Date |
|---|---|---|---|---|---|---|---|---|
| baseline (all surfaces) | installed sdlc 0.21.29 | - | 0 | unavailable | unavailable | unavailable | baseline: unavailable; installed sdlc 0.21.29 predates --usage (W1.1) | 2026-10-19 |
| execute dispatch topology (S3, 12-task 3-wave plan; tokens = execute main context) | direct (waveRunnerMinPlanTasks 13) | runner (waveRunnerMinPlanTasks 1) | 2 | 1924325/9960, 1534705/9126 | $0.078, $0.103 (priced incl. subagents, information) | 12/12, 12/12 | rule (i) fired; owner kept 9 pending a realistic re-measurement (#9164) | 2026-10-26 |

**Spike S1 (2026-10-19, Claude Code v2.1.303).** A throwaway plugin skill with `context: fork`, and the same plugin agent dispatched by `subagent_type`, were run in a session in `default` permission mode:

- Permission mode is inherited from the session. Read-only commands ran without a dialog; a write raised the normal permission dialog in the main session, naming the agent. Nothing was auto-denied.
- `AskUserQuestion` is not available inside subagents, even when it is listed in the agent's `tools:`. A forked sub-skill cannot ask the user, so consent prompts are asked in the main context before dispatch.
- Agent frontmatter `effort:` is honoured: `effort: low` reached the API while the session ran at `medium`.

**Spike S3 (2026-10-26, Claude Code v2.1.310).** One 12-task, 3-wave plan (all Standard, one-line files) ran once per mode through the branch plugin (`--plugin-dir` only, `--max-budget-usd 4.89 / 4.90, --permission-mode auto (ruling w2-s3-perm)`), A = direct, B = runner. A first direct attempt under --permission-mode dontAsk stopped at its first Bash call (permission denial, $0.21) and was re-run. Metric (ruling w2-planreview Q4): execute main-context tokens MC (session-cost.js on each main transcript alone) and wall-clock W: MC A 1924325, B 1534705 (ratio A/B 1.25); W A 175s, B 355s (ratio 0.49). Rule: raise is an owner question if MC(A) ≤ 1.5 × MC(B) and W(A) ≤ 1.10 × W(B); lower is an owner question if A shows compaction or a context-limit warning (A: compaction 0, context-limit 0; B: compaction 0, context-limit 0); else 9 stays. Outcome: rule (i) fired (direct MC 1.25×, wall-clock 0.49× of runner); owner kept 9 pending a realistic re-measurement (#9164). Priced totals incl. subagents (information): A $0.94, B $1.24. Budget hit: A no, B no. Exit: A 0, B 0. Output tokens are a floor.
