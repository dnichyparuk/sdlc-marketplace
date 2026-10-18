# sdlc-utilities plugin — assessment and rework package

Plugin `sdlc` (`plugins/sdlc-utilities`) v0.21.29 · Branch `docs/plugin-assessment-claude-5` · Package assembled 2026-10-15 to 2026-10-18.

This directory is documentation only. It assesses the `sdlc-utilities` Claude Code plugin against the Claude 5.x prompting guidance and the current Claude Code authoring contract, reviews its architecture, and turns both into one executable rework plan. No plugin file was changed by the assessment.

**The single executable artifact is [`03-plan/consolidated-plan.md`](03-plan/consolidated-plan.md).** The two analyses are its evidence; their own action plans (prompt audit §6–§7, design review §H and "Sequencing") are superseded by it and carry a banner saying so.

## Reading order

1. [`03-plan/consolidated-plan.md`](03-plan/consolidated-plan.md) §0–§3 — how to execute, ground rules, workstreams, milestones. Read §4 (disposition) to see where every original recommendation went.
2. [`03-plan/plan-review.md`](03-plan/plan-review.md) — independent review of the plan: verdict, every correction applied, the sampling behind it, residual questions.
3. [`01-prompt-audit/README.md`](01-prompt-audit/README.md) §1–§5 — what is wrong in the instruction text, by file group (285 findings).
4. [`02-design-review/design-review.md`](02-design-review/design-review.md) §A–§G — what is wrong in the architecture, and the maintainer decisions at the end.
5. The group reports and `reference/` when an item cites them.

## The three parts

| Part | Path | What it is |
|---|---|---|
| 1. Prompt-fit audit | [`01-prompt-audit/README.md`](01-prompt-audit/README.md) | Consolidated report: overall assessment, plugin structure, cross-cutting findings, per-file summary, the original four-phase plan (§6) and text-reduction summary (§7) — both superseded by the plan |
| | [`01-prompt-audit/group-reports/`](01-prompt-audit/group-reports/) | Per-group evidence with `file:line` findings: [A plan-sdlc](01-prompt-audit/group-reports/A-plan-sdlc.md), [B execute-plan-sdlc](01-prompt-audit/group-reports/B-execute-plan-sdlc.md), [C ship / verify-pipeline / harden](01-prompt-audit/group-reports/C-ship-verify-harden.md), [D review / received-review](01-prompt-audit/group-reports/D-review-received-review.md), [E commit / pr / version / error-report](01-prompt-audit/group-reports/E-commit-pr-version-error-report.md), [F jira / setup](01-prompt-audit/group-reports/F-jira-setup.md), [G hooks / cross-cutting](01-prompt-audit/group-reports/G-hooks-crosscutting.md) |
| 2. Architecture review | [`02-design-review/design-review.md`](02-design-review/design-review.md) | Control plane, context/memory layering, dispatch topology, configuration, quality loop, safety; prioritised recommendations #1–#10 (§H, superseded by the plan); maintainer decisions D1–D4 |
| 3. Plan | [`03-plan/consolidated-plan.md`](03-plan/consolidated-plan.md) | 68 items in workstreams W1–W7 (incl. W1.9–W1.11 from the plan review), all open questions closed (Appendix A), milestones M1–M5, disposition of every original item, risks/spikes, open questions — written for one-item-at-a-time execution |
| | [`03-plan/plan-review.md`](03-plan/plan-review.md) | Review of the plan and the corrections applied to it |
| Shared sources | [`reference/`](reference/) | [00 reviewer brief](reference/00-reviewer-brief.md) — **historical**: the brief the seven audit reviewers worked from on 2026-10-15; not maintained · [01 audit method](reference/01-prompt-audit-method.md) · [02 Anthropic prompting best practices (2026-10-15)](reference/02-anthropic-prompting-best-practices-2026-10-15.md) · [03 Claude Code authoring reference](reference/03-claude-code-authoring-reference.md) |

## Maintainer decisions

Recorded 2026-10-18 at the end of [`02-design-review/design-review.md`](02-design-review/design-review.md#maintainer-decisions-recorded-2026-10-18); all four are binding on the plan.

| | Decision | Status | Where the plan applies it |
|---|---|---|---|
| D1 | Control plane is interactive-first: `context: fork` skills with per-step agent files plus the step-emitter (`scripts/lib/stepper.js`). A separate `claude -p` driver for `--auto` is declined. | Decided | W4.2, W4.3, W7.4; spike S1 |
| D2 | The wave-runner is an implementation detail: workers are dispatched from execute's main context by default; the wave-runner is an opt-in for large or complex plans, threshold set by measurement. | Decided; plan-size threshold `execute.waveRunnerMinPlanTasks` default 9, S3 may move it | W5.2, W5.3 |
| D3 | `claude plugin eval` runs locally only. CI on PR runs the validators and the exec promptfoo suites, with no LLM. | Decided | W1.5, W1.7 |
| D4 | Specs are restructured as behavioural contracts (R-ids kept as anchors, history to an appendix, tuning values out of the spec); ship, execute and plan specs first and before the step-emitter / declarative-dispatch work; `AGENTS.md` §1 and `docs/spec-template.md` change together. | Decided | W3.1–W3.6 (milestone M3, before M4/M5) |
