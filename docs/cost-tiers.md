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
| execute-plan-sdlc | sonnet | Per-task dispatch decides per-tier (haiku/sonnet/opus) |
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

## 5. Dispatch-Site Overrides

Files where per-call `model:` is computed at runtime and **wins over frontmatter**:

- `plugins/sdlc-utilities/scripts/skill/ship.js` — passes per-step `model:` for each pipeline phase.
- `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — per-task `model:` is chosen from task complexity (Trivial → haiku, Standard → sonnet, Complex → opus) by the executor. A prepare-script subcommand may replace this later (W5.2); update this line when it exists.
- `plugins/sdlc-utilities/scripts/skill/review.js` — passes per-dimension `model:` resolved from each dimension file's own frontmatter.
- `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — cross-model plan-reviewer rule (sonnet reviews opus-authored plans, and vice versa) at 5+ tasks.

When ship-sdlc invokes a sub-skill, the sub-skill's frontmatter `model:` is shadowed by the per-step value computed in `ship.js`. Consumers should not assume frontmatter applies inside a pipeline.

### Execute quality presets

`execute-plan-sdlc` maps task complexity to a model per quality preset. The preset names are contract (`docs/specs/execute-plan-sdlc.md` A2, R2); the models are tuning. Implemented in `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` Step 2 (CLASSIFY) and Step 4 (IMPROVE).

| Preset | Trivial | Standard | Complex |
|---|---|---|---|
| `full` (Speed) | haiku | haiku | sonnet |
| `balanced` (Balanced, default) | haiku | sonnet | opus |
| `minimal` (Quality) | sonnet | opus | opus |

Two or more trivial tasks in a wave run as one batch agent at the Trivial model. On failure a task escalates one tier per retry — haiku → sonnet → opus → user — within a budget of 2 retries (R13).

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
| Execute presets (Agent dispatch `effort` param) | First rung of the escalation ladder before a tier change |

Effort is set in agent frontmatter; the validator does not check it.

| Surface | Config A | Config B | Artifacts (n) | Tokens in/out (A, B) | Cost per completed task (A, B) | Completed (A, B) | Decision | Date |
|---|---|---|---|---|---|---|---|---|
| baseline (all surfaces) | installed sdlc 0.21.29 | - | 0 | unavailable | unavailable | unavailable | baseline: unavailable; installed sdlc 0.21.29 predates --usage (W1.1) | 2026-10-19 |

**Spike S1 (2026-10-19, Claude Code v2.1.303).** A throwaway plugin skill with `context: fork`, and the same plugin agent dispatched by `subagent_type`, were run in a session in `default` permission mode:

- Permission mode is inherited from the session. Read-only commands ran without a dialog; a write raised the normal permission dialog in the main session, naming the agent. Nothing was auto-denied.
- `AskUserQuestion` is not available inside subagents, even when it is listed in the agent's `tools:`. A forked sub-skill cannot ask the user, so consent prompts are asked in the main context before dispatch.
- Agent frontmatter `effort:` is honoured: `effort: low` reached the API while the session ran at `medium`.
