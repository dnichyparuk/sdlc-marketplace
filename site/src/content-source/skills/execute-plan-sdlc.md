# `/execute-plan-sdlc` — Plan Execution Orchestrator

## Overview

Orchestrates implementation plan execution with adaptive task classification, wave-based parallel dispatch, PCIDCI critique loops, spec compliance review, and automatic error recovery. Classifies each task by complexity and risk, assigns a default model (haiku/sonnet/opus), presents 3 execution presets for user selection, dispatches agents in parallel, verifies results after each wave, and recovers from failures with automatic model escalation on retries. After each wave, verifies agent output against the filesystem using `git diff` and targeted symbol checks — agent self-reports are never trusted alone. When agents complete tasks, they fill a structured completion checklist (COMPLETE:/VERIFY:/STATUS:) that the orchestrator parses — agent self-reports are never trusted alone. After mechanical verification, a spec compliance reviewer checks non-trivial tasks against their specifications. Plans with 3 or fewer simple tasks execute directly without wave orchestration. Self-contained — no external sub-skills required. When a phase contains 2 or more trivial tasks, they are batched into a single haiku agent rather than executed inline or dispatched separately.

---

## Usage

```text
/execute-plan-sdlc <path-to-plan.md>
/execute-plan-sdlc --plan <path-to-plan.md>
/execute-plan-sdlc --plan <path-to-plan.md> --quality balanced
/execute-plan-sdlc --resume
```

Standalone invocation (not dispatched by ship-sdlc) requires the plan document explicitly — as a positional path argument or via `--plan <path>`. Plan autodiscovery from conversation context was removed (#505): the skill no longer infers which plan to run from what was discussed earlier in the session. The only exception is `--resume` when an execution state file already exists for the current branch — resume sources the plan path from the persisted state instead. Without one of these, the skill halts before Step 1 (LOAD):

> execute-plan-sdlc cannot run without an explicit plan document.
> Fix: re-run with a positional plan path (`/execute-plan-sdlc <path-to-plan.md>`) or `--plan <path-to-plan.md>`.
> Why: plan-file resolution is explicit-only (R41, #505). This skill MUST NOT guess which plan to execute by scanning conversation context or by prompting interactively for a path — a silently-assumed or misremembered plan could execute the wrong work against this repository.

Use [`/plan-sdlc`](plan-sdlc.md) to write the plan document, then pass its path here.

**Auto-trigger after plan mode:** When `/plan-sdlc` completes in plan mode, it proposes execution before calling ExitPlanMode. If you accept the plan, `/execute-plan-sdlc` is invoked automatically with the plan path — no manual invocation needed. You can still invoke it standalone (with an explicit path) for plans created outside plan mode.

The plan must contain at least 2 tasks with clear deliverables (files to create or modify, behavior to implement).

---

## Flags

| Flag | Description | Default |
|---|---|---|
| `--quality <full\|balanced\|minimal>` | Auto-select the model quality tier, skipping the interactive selection prompt. `full` = Speed, `balanced` = Balanced, `minimal` = Quality. Invalid values fall back to interactive selection. (Renamed from `--preset` in #190 to disambiguate from ship-sdlc's `--steps` step-selection flag.) When invoked from ship-sdlc, `--quality` is forwarded only when the user explicitly passed `--quality` to ship. | Interactive prompt |
| `--auto` | Suppress interactive prompts: auto-resume if state exists, auto-approve high-risk gates, use `--quality` value (required when `--auto` is set). | Off |
| `--resume` | Resume from the most recent execution state file for the current branch. Completed waves are skipped; in-progress waves are retried. If the plan has changed since execution started, you are prompted to resume or restart. | Off |
| `--rebase <auto\|skip\|prompt>` | Rebase onto the default branch before execution. `auto` rebases silently (aborts on conflict), `skip` skips, `prompt` asks. | Skip |
| `--branch <name>` | **INTERNAL** — reserved for explicit caller override; not used by ship-sdlc since auto-detection was introduced. ship-sdlc establishes the feature branch via `git checkout -b` before dispatching execute, so execute's own workspace derivation yields `continue` (run in place). Do not pass this directly. (Implements R30, fixes #378, #379.) | unset |
| `--commit-waves` | After each wave passes G9 (mechanical/filesystem verify) and G11 (post-wave guardrail check), commit the wave as `wip(execute): wave N — <task titles>` (subject truncated to 72 chars). Hooks always run — `--no-verify` is never passed. The small-plan direct-execution path (R5) NEVER triggers per-wave commits regardless of this flag. Pairs with commit-sdlc's WIP-squash path so the final feature commit subsumes WIP commits via soft-reset. (Fixes #392 / R35.) | Off |
| `--plan <path>` | Explicit path to the active plan markdown (the old autodiscovery flag was renamed in #505 — no back-compat alias for the previous name). Step 1 (LOAD) reads from this file directly — the compaction-stable plan source. Forwarded automatically by ship-sdlc from `context.planFile`. Required for standalone invocation (positionally or via this flag) unless `--resume` finds existing state for the branch — see Usage and Prerequisites. (Implements R-PLANFILE, R41.) | Required for standalone invocation; unset otherwise |
| `--wave-timeout <seconds>` | Wall-clock deadline for a single wave (R-WAVE-DEADLINE). Once the deadline elapses, the wave-runner terminates any task still in flight and reports it with `errorCode: TIMEOUT` — see [Wave Timeout and Liveness](#wave-timeout-and-liveness-506) below. Sourced from `ship.executeWaveTimeout` in `.sdlc/local.json` when invoked via ship-sdlc (which resolves the config key and forwards this flag on the command line); a standalone invocation that omits the flag falls back to the same built-in default. Unit: seconds. | `BUILT_IN_DEFAULTS` in `scripts/lib/ship-fields.js` |
| `--wave-interval <seconds>` | Poll interval the wave-runner uses (via `Monitor`) to check in-flight task liveness while enforcing `--wave-timeout` (R-WAVE-LIVENESS). Sourced from `ship.executeWaveInterval` in `.sdlc/local.json` the same way as `--wave-timeout`; same standalone fallback. Unit: seconds. | `BUILT_IN_DEFAULTS` in `scripts/lib/ship-fields.js` |

---

## Per-Wave WIP Commits (`--commit-waves`)

When `--commit-waves` is set (CLI flag, or ship config `execute.commitWaves: true`), execute-plan-sdlc runs `git add -A && git commit -m "wip(execute): wave N — <titles>"` after each wave passes both G9 and G11. The commit subject is deterministic and truncated to 72 characters (with `…` appended on truncation). Hooks always run — `--no-verify` is never passed; a pre-commit hook failure escalates as a hard wave-level failure via Step 6 RECOVER.

**Soft-success path:** when a wave produces no diff (every change was reverted by a hook, or the wave was a no-op), `git commit` returns "nothing to commit" — execute persists `committedSha: null` in the state file and surfaces a single notice `Wave N produced no diff — no WIP commit recorded.` Execution continues to the next wave.

**Small-plan exception:** the small-plan direct-execution path (`Step 2b`, ≤3 tasks, all Trivial/Standard, no high-risk) NEVER triggers per-wave commits regardless of `--commit-waves`. Small plans complete inline in a single context and have no per-wave commit boundary.

**Resume idempotency:** on `--resume`, execute iterates `waves[].committedSha`. Reachable shas (via `git merge-base --is-ancestor <sha> HEAD`) advance the resume pointer past the wave (skip reapply) and surface `Wave N already committed (<short-sha>) — skipping reapply.` Unreachable shas (force-pushed/branch reset) WARN with an explicit state-mismatch message and stop — there is no auto-recovery; the user resolves manually.

The expected workflow with ship-sdlc: `execute.commitWaves: true` produces multiple `wip(execute):` commits across the branch, then commit-sdlc detects them at fork-point and squashes them into a single conventional-commit message via soft-reset. The final PR history shows one feature commit, not the per-wave WIPs.

---

## Post-Compact Implicit Resume

`hooks/session-start.js` emits a distinct `Active execution (post-compact): execute-plan-sdlc on <branch> (wave N of M complete)` line into the SessionStart system-reminder context when the matcher source is `compact` AND execute state exists for the current branch. The legacy `Active execution:` line is preserved byte-stable for `startup`/`clear` matchers (prompt-cache protection).

Step 0 of execute-plan-sdlc scans the system-reminder for this signal:

| Signal combination | Behavior |
|---|---|
| `Active execution (post-compact):` present AND `Active pipeline: ship-sdlc` absent | Implicit `--resume`. Under `--auto`: silent resume. Interactive: one-line confirmation `Resuming execution from wave N — continue? (yes / no)` |
| `Active execution (post-compact):` present AND `Active pipeline: ship-sdlc` ALSO present | Do NOT self-resume. Print `ship-sdlc owns recovery for this session; deferring.` and stop. ship-sdlc's own implicit-resume logic re-dispatches execute with `--resume`. |
| Neither signal present and no `--resume` on CLI | Step 0 routing unchanged. |

Implementation: `hooks/session-start.js` is layer-agnostic (it surfaces facts); the discriminator above is the consumer-side decision in `execute-plan-sdlc/SKILL.md` Step 0. (Fixes #392 / R36.)

---

## Guardrail Injection (per-task Agent prompts)

Execution guardrails loaded in Step 1 (LOAD) from `.sdlc/config.json` → `execute.guardrails` are propagated through the wave manifest into every per-task and batched-trivial Agent prompt the wave-runner constructs. The injected block:

```
## Project Guardrails

You MUST respect these constraints while implementing. Violations will fail post-wave verification.

- **<id>** (<severity>): <description>
- ...
```

When `activeGuardrails` is empty (`[]`), the entire `## Project Guardrails` section is omitted from agent prompts — no header, no stub. The manifest still carries the empty array for shape stability.

The block is byte-stable within a single execute-plan-sdlc invocation (`activeGuardrails` is loaded once and treated as immutable) — this preserves the prompt-cache prefix across sibling per-task dispatches and survives retry dispatches at every escalation tier (haiku → sonnet → opus). Wave-runner MUST NOT add, remove, or modify entries in the manifest's `guardrails` array.

Defense-in-depth: the existing pre-wave (G10) and post-wave (G11) guardrail checks in main context remain in force — guardrail injection into agent prompts is additive, not a replacement. (Fixes #392 / R33.)

---

## Expected-Files Cross-Check (Step 5c sub-step 1a)

Each wave manifest carries `expectedFiles: string[]` — the deterministic union of every `Files: Create:` / `Files: Modify:` / `Files: Test:` path declared across the wave's tasks (computed by main context at wave build time; no LLM inference). After the wave-runner Agent returns, Step 5c's filesystem verification runs an additional cross-check at sub-step 1a:

| Diff vs `expectedFiles` | Verdict | Action |
|---|---|---|
| `expectedFiles ≠ ∅` AND `diffFiles ∩ expectedFiles === ∅` | **HARD FAILURE** (wave-level phantom success — agent reported done but touched zero expected files) | Trigger existing failure flow (escalation budget / retry / Step 6 RECOVER / user surface) |
| `diffFiles \ expectedFiles ≠ ∅` (diff touches files outside expected) | **SOFT WARNING** | Surface `Wave N touched files outside expectedFiles: <list>` and continue to step 2 |
| `expectedFiles === ∅` (rare — wave tasks lack `Files:` declarations) | Skip sub-step 1a entirely | Existing per-task `filesChanged` check still runs |

The 1a check augments — never replaces — the existing per-task `filesChanged` check. They guard different invariants: step 1 catches per-task agent drift; step 1a catches wave-level scope drift. (Fixes #392 / R34.)

---

## Workspace (Auto-Detected)

Workspace is **auto-detected** — there is no flag and no prompt. Step 1 (LOAD) derives the workspace from your cwd and current branch via `lib/git.js::deriveWorkspace`, with two outcomes:

- **`branch`** — cwd is the **main** worktree AND HEAD is the **default** branch (typically `main`). The skill derives a feature-branch name from the plan title and runs `git checkout -b <name>`, then executes on the new branch.
- **`continue`** — every other case: you are inside a manual (linked) git worktree, OR already on a feature branch in the main worktree. The skill runs in place on the current branch — no branch creation, no worktree creation.

**Branch name derivation (for the `branch` outcome):** The type prefix is determined from the plan's nature:

| Plan nature | Prefix |
|---|---|
| New feature / capability | `feat/` |
| Bug fix | `fix/` |
| Refactor, cleanup, tooling, config | `chore/` |
| Documentation | `docs/` |

The slug is derived from the plan title (lowercase, hyphenated, max 50 characters). The prefix/slug rules are configurable via `workspace.branch` in `.sdlc/local.json`.

**Note:** Branch detection always runs `git branch --show-current` at execution time. It does not use the session-level `gitStatus` snapshot, which may be stale if you switched branches after starting the conversation.

**Note on Agent SDK `isolation` parameter:** execute-plan-sdlc never creates a git worktree (workspace is auto-detected). Agent dispatches must **not** pass the Agent SDK `isolation: "worktree"` parameter — it creates ephemeral `.claude/worktrees/agent-<id>` paths that break `.sdlc/` anchoring and cause commits to land in the wrong location. This is enforced by skill-prose Hard Constraints in the per-task and wave-runner templates (the former `pre-tool-agent-isolation-guard.js` harness hook has been removed). See issues #370, #372.

---

## Model Selection

Each task is assigned a model based on its complexity class. Before executing, the skill presents 3 presets:

| Preset | Trivial | Standard | Complex | Best when |
|---|---|---|---|---|
| **Speed** | haiku | haiku | sonnet | Plan is well-specified, changes are mechanical — mechanical verification only, spec compliance review skipped |
| **Balanced** | haiku | sonnet | opus | Default — matches complexity to capability |
| **Quality** | sonnet | opus | opus | Codebase is unfamiliar, tasks are ambiguous |

Select a preset by name (full/balanced/minimal) or choose `custom` to edit individual task assignments. On retry after failure, the model is automatically escalated one step (haiku → sonnet → opus) and counts toward the 2-retry budget.

---

## Wave-Runner Agent Model

For each wave, execute-plan-sdlc dispatches **one wave-runner Agent** (not one per task). The wave-runner Agent receives the full wave manifest — all task descriptions, file lists, assigned models, and prior-wave context — and fans out per-task sub-agents internally within its own context. This keeps the execute-plan-sdlc main context bounded to wave-level events rather than per-task output. (Fixes #353.)

**Two-level isolation:** execute-main → wave-runner Agent → per-task sub-agents. Per-task retries (haiku → sonnet → opus, budget 2) happen inside the wave-runner. The wave-runner returns a structured `WAVE_SUMMARY` token as its final line, which the main context parses for filesystem verification, state writes, and recovery decisions.

**In-wave trivial batch:** When a wave has 2+ Trivial tasks, the wave-runner dispatches them as a single batch-haiku Agent internally. The main context does not directly dispatch per-task or batch agents during waves.

**Wave-runner does not handle:** state writes, inter-wave critique, high-risk gates, guardrail checks, or spec compliance review — those remain in main context (visible to the user when execute is run from ship-sdlc via Skill tool).

### Per-task completion protocol

Each per-task sub-agent (dispatched inside the wave-runner) fills a structured completion checklist:

```
COMPLETE: files_created=[...] files_modified=[...] tests_added=[yes|no|n/a] tests_pass=[yes|no|n/a] build_pass=[yes|no|n/a]
VERIFY: <symbol_name> in <file_path>
STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

This checklist is parsed by the wave-runner Agent (not main context) for each of its sub-agents, and the wave-runner then aggregates the results into a single `WAVE_SUMMARY` JSON token — main context only ever sees that wave-level summary. The wave-runner aggregates these into a `WAVE_SUMMARY` JSON object that main context verifies. The VERIFY token is grepped in the filesystem to confirm changes persisted. If the checklist is missing or malformed, the wave-runner re-dispatches the task once with a format reminder.

---

## Spec Compliance Review

After mechanical verification passes for each wave (git diff + canary checks), a spec compliance reviewer (sonnet) checks that each non-trivial task's implementation matches its specification. The reviewer reads actual code — it does not trust agent completion reports.

**Skipped when:** the wave contains only Trivial tasks, or the Speed preset was selected.

If the reviewer finds issues:
- 1–2 minor issues → fixed inline in the main context
- Major spec gaps → original agent re-dispatched with specific fix instructions (counts toward retry budget)

---

## Small-Plan Routing

Plans with **3 or fewer tasks** that are all Trivial or Standard complexity and have no high-risk tasks are executed directly in the main context — no agent dispatch, no wave orchestration. Verification still runs after each task.

Plans with 4 or more tasks use standard wave execution with state persistence after every wave.

---

## State Persistence and Resume

After each wave completes, execution state is written to `.sdlc/execution/execute-<branch>-<timestamp>.json` in the main working tree. This JSON file records completed waves, task status, file changes, and contextual information (interfaces created, decisions made) needed to resume in a fresh session. When execution runs in a worktree, state is written to the main repo root so it survives worktree cleanup.

**Resuming:** Pass `--resume` to pick up from the last completed wave. The state file contains enough context for a new session to continue without prior conversation history. The plan's resolved path and a SHA-256 content hash are recorded when execution starts (`--plan-path`/`--plan-hash`, passed internally to `state/execute.js init`); if the plan file has changed since (hash mismatch on resume), you are prompted to resume with the old structure or restart.

**Inter-wave abort:** Pressing Ctrl-C between waves (after a wave-runner Agent has returned and before the next wave starts) leaves the state file populated with completed waves. The next invocation with `--resume` picks up at the first non-completed wave. Mid-wave abort is not supported — waves run to completion or failure before control returns to main context.

**Abort/resume from ship-sdlc:** When execute-plan-sdlc is invoked via Agent tool from ship-sdlc (fixes #366), inter-wave gates and wave reports run in execute's sub-context and a structured result is returned to ship's main context. Ctrl-C between waves stops the ship pipeline; `/ship-sdlc --resume` or `/execute-plan-sdlc --resume` resumes from the first pending wave.

**Automatic detection:** Even without `--resume`, if a state file exists for the current branch, the skill offers to resume in interactive mode. In `--auto` mode, it starts a fresh run instead (pass `--resume` explicitly to auto-resume).

**Cleanup:** The state file is deleted on successful completion and preserved on failure or interruption.

Plans with 3 or fewer simple tasks (small-plan direct execution) do not write state files.

**Step 9 structured output (R31, fixes #378, #379):** When a new branch was created during execution (derived `branch` outcome, or `--branch <name>` passed by ship-sdlc), Step 9's summary report includes a `Branch:` line for downstream consumers (e.g., ship-sdlc):

```
Branch:   feat/my-feature
```

There is no `Worktree:` line — execute-plan-sdlc never creates a worktree. The `Branch:` line is omitted when the derive yielded `continue` (run in place — a linked worktree, or an existing feature branch).

---

## Examples

### Execute a plan

After writing a plan (e.g. via `/plan-sdlc`), pass its path explicitly:

```text
/execute-plan-sdlc .claude/plans/my-feature-plan.md
```

Claude presents the classified wave structure and waits for confirmation before executing:

```
Execution Plan
────────────────────────────────────────────
Pre-wave (1 batch agent, 2 trivial tasks):
  - Task 1: "add environment variable"     [Trivial → haiku]
  - Task 2: "update config key name"       [Trivial → haiku]
Wave 1 (3 tasks, parallel):
  - Task 3: "Create UserService module"    [Standard → sonnet]
  - Task 4: "Add API route handlers"       [Standard → sonnet]
  - Task 5: "Write unit tests for models"  [Standard → sonnet]
Wave 2 (2 tasks, parallel):
  - Task 6: "Integrate auth middleware"    [Complex  → opus]
  - Task 7: "Add E2E test coverage"        [Standard → sonnet]
Wave 3 (1 task — HIGH RISK, will pause):
  - Task 8: "Update database migration"    [Complex  → opus]
────────────────────────────────────────────
Total: 8 tasks across 3 waves + pre-wave

Model Presets:
  full) Speed:       6 × haiku, 2 × sonnet                 — fast, low cost
  balanced) Balanced:  2 × haiku, 4 × sonnet, 2 × opus    — default ✓
  minimal) Quality:    2 × sonnet, 6 × opus                — max correctness

Select preset (full/balanced/minimal), "custom" to edit individual tasks, or "cancel":
```

### Execute a plan via `--plan`

```text
/execute-plan-sdlc --plan .claude/plans/my-feature-plan.md
```

Claude loads the plan from the specified file, validates it, classifies tasks, and presents the wave structure for confirmation.

### Skip quality-tier selection

```text
/execute-plan-sdlc --plan .claude/plans/my-feature-plan.md --quality balanced
```

Claude applies the Balanced quality tier automatically and proceeds to execution after showing the wave structure — no interactive prompt.

### Resume after interruption

```text
/execute-plan-sdlc --resume
```

Claude finds the most recent state file for the current branch, loads the execution context, and resumes from the last completed wave:

```
Found execution state from 2026-03-27T14:30:00Z
  Completed: Wave 1 (3 tasks), Wave 2 (2 tasks)
  Resuming from: Wave 3 (1 task)
  Plan hash: verified (unchanged)

Proceeding to Wave 3...
```

### High-risk task gate

When a wave contains high-risk tasks (breaking changes, credential handling, irreversible operations), Claude pauses before executing:

```
Wave 3 contains high-risk task(s):
  - Task 7: "Update database schema migration" [HIGH RISK: database change]
Approve? (yes / skip / cancel)
```

### Completion summary

After all waves complete:

```
Plan Execution Complete
────────────────────────────────────────────
Tasks completed:  8/8
Waves executed:   3 + pre-wave
Retries needed:   1
Verification:     tests ✓  build ✓  lint ✓

Files changed:    12 files (4 added, 8 modified, 0 deleted)
Guardrails:       3/3 passed (1 warning, 0 overridden)
────────────────────────────────────────────
```

**Learning Capture timing.** The append to `.sdlc/learnings/log.md` runs as part of Step 8-ter, immediately before the summary above is emitted. This ordering is intentional: `ship-sdlc` stages the working tree (`git add -A -- ':!.sdlc/'`) between the `execute` and `commit` pipeline steps, so the learnings entry only lands inside the feature commit if the log file is already modified when execute-plan-sdlc returns control. A pre-Step-9 capture keeps the post-pipeline working tree clean and folds learnings into the same commit as the feature work.

---

## Prerequisites

- **Permission mode** — the skill always dispatches agents with `bypassPermissions`. The runtime caps child agent permissions to the parent session's level — if your session is not in bypassPermissions, agents will surface permission prompts to you automatically. The mode lock prevents any mode changes during execution based on plan content.
- **An explicit plan document** — pass it positionally or via `--plan <path>` (see Usage). Plan autodiscovery from conversation context was removed (#505); a standalone invocation without one halts before Step 1 unless `--resume` finds existing state for the branch. The plan must have at least 2 tasks; single-task plans don't need orchestration. Use [`/plan-sdlc`](plan-sdlc.md) to write one.

### Harness Configuration

| Field | Value |
|---|---|
| Plan mode | Graceful refusal (Plan Mode Check) |

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| Source code files | Files created or modified as specified by plan tasks |
| `.sdlc/learnings/log.md` | Execution learnings appended after completion (classification accuracy, wave conflicts, recovery outcomes) |
| `.sdlc/execution/execute-<branch>-<timestamp>.json` | Execution state file written after each wave; enables cross-session resume via `--resume`. Records the resolved plan path and a SHA-256 hash of the plan file's contents, so a resume against a since-edited plan is detected — see State Persistence and Resume. Deleted on success, preserved on failure. |
| Per-task fact sheets (`task-<id>.md`) | Written by `state/execute.js wave-start` before wave dispatch. When a plan task carries a `**Contract:**` block, the fact sheet includes a `## Contract` section with the verbatim contract content. Per-task agents consume this section as a closed set of decided design constraints (signatures, types, flags, error-cases, import paths) — they MUST NOT re-derive or reopen anything pinned there. |

Does not create commits, branches, or push to any remote. The user decides what to do with the changes after execution completes.

## OpenSpec Integration

When executing a plan whose `**Source:**` header points to an OpenSpec change path, this skill loads the delta specs for enhanced compliance checking.

- **Spec compliance reviewer** additionally checks implementations against OpenSpec delta spec requirements — not just task acceptance criteria
- **Inter-wave critique** checks for contradictions between implementations and delta spec requirements not captured in task descriptions
- **Post-pipeline archive suggestion** — after all waves complete, if the plan was OpenSpec-sourced and `openspec validate <name> --strict` passes, emits a suggestion to archive via `openspec archive <name> --yes` or `/ship-sdlc`. If validation fails, surfaces errors instead. If the CLI is not available, falls back to the existing advisory. The suggestion is never auto-executed.

### Per-task checkbox flipping

When executing a plan produced by `plan-sdlc --from-openspec <name>`, this skill tracks OpenSpec checkbox state in real time:

- **Per-task flipping** — after each wave's `WAVE_SUMMARY` is parsed, every completed task (DONE or DONE_WITH_CONCERNS) whose plan entry carries an `openspec-task` block triggers a `markTaskDone` call. The corresponding `- [ ]` line in `openspec/changes/<name>/tasks.md` flips to `- [x]` immediately.
- **N:1 last-sibling semantics** — when multiple plan tasks share the same `openspec-task.ref`, the flip fires only after the LAST sibling reaches a success status. A FAILED or BLOCKED sibling leaves the checkbox `- [ ]`, preserving honest intermediate state.
- **`markTaskDone` is non-blocking** — if the ref is missing or the file is unreadable, the pipeline continues. The failure is logged to `.sdlc/learnings/log.md` and surfaced in the Step 9 REPORT under `OpenSpec sync warnings:`.
- **Archive suggestion gate** — after all waves complete, if any `- [ ]` task in `tasks.md` is NOT documented in the plan's `## Out-of-scope OpenSpec tasks` section, the archive suggestion is suppressed. A diagnostic lists each unflipped task with the expected plan-task ID(s). When all unflipped entries are documented as out-of-scope (or none remain), the suggestion fires as usual.
- **`--resume` safe** — `markTaskDone` is idempotent; replaying against an already-flipped line is a no-op.

For spec definitions: [docs/specs/execute-plan-sdlc.md](../specs/execute-plan-sdlc.md) — R37, R38, R39.

See [OpenSpec Integration Guide](../openspec-integration.md) for the full workflow.

## Guardrail Enforcement

When execution guardrails are configured in `.sdlc/config.json` under `execute.guardrails[]`, this skill enforces them at runtime to prevent drift between plan acceptance and execution. Execution guardrails are separate from plan guardrails (`plan.guardrails[]`) — they use the same item format (`id`, `description`, `severity`) but are configured independently and evaluated at different stages.

**Loading:** Guardrails are loaded in Step 1 using `readSection(root, 'execute')`. If no execution guardrails are configured, all guardrail checks are skipped — backward compatible with existing projects.

**Pre-wave check (Step 5a-pre):** Before each wave, error-severity guardrails are evaluated against the wave's task descriptions. Violations prompt the user to override or cancel. In `--auto` mode, error violations are blocking — the pipeline stops.

**Post-wave check (Step 5c-ter):** After each wave's verification and spec compliance review, all guardrails (error and warning) are evaluated against the actual `git diff` output. Error violations offer fix/override/cancel; warnings are reported but non-blocking.

**Small plans:** Plans with 3 or fewer tasks run a single guardrail evaluation after all tasks complete.

**Report:** The final summary includes a guardrail pass/warn/override breakdown when guardrails are configured.

Configure execution guardrails via `/setup-sdlc --execution-guardrails`. See [plan-sdlc](plan-sdlc.md) for how plan guardrails are evaluated during planning. For authoring guidance — when to use execute vs plan guardrails, how `git diff --stat` constrains phrasing, and worked examples — see [Execute Guardrails Best Practices](execute-guardrails-best-practices.md).

---

## Context-Overflow Handling

When a wave-runner Agent's context is exhausted before it can report all dispatched tasks, the returned `WAVE_SUMMARY` will be missing one or more task IDs. This is **CONTEXT_OVERFLOW** — a failure mode that previously caused silent success (the pipeline advanced as if all tasks completed).

### Detection

After each wave-runner returns, main context calls `lib/wave-summary.js parseWaveSummary(text, dispatchedIds)`. If `missingIds.length > 0` — IDs dispatched but absent from the `WAVE_SUMMARY` — the wave is classified as CONTEXT_OVERFLOW. Git diff is **not** used as a substitute: even if files changed, absent IDs mean the wave-runner did not confirm those tasks.

### Auto-split-and-retry

On CONTEXT_OVERFLOW, `lib/wave-split.js splitWave()` partitions the **full original dispatched set** (not just the missing IDs) into two roughly-equal halves. Each half is re-dispatched as an independent wave-runner with a freshly computed byte budget. Splitting the full set guards against re-overflow when in-wave task dependencies require co-presence.

Split depth increments on each recursive split. After 3 splits (`maxSplitDepth: 3`), the pipeline escalates to the user with a structured list of unresolved task IDs via `AskUserQuestion`.

The split decision is persisted to the execute state file (`wave-split` subcommand of `state/execute.js`) so a resume-after-crash replays the identical partition tree.

### Bounded WAVE_SUMMARY schema

Wave-runner Agents must emit a bounded `WAVE_SUMMARY` token as their final line. Per-task entries carry only `{id, status, sha, filesTouched[], errorCode?}` — verbose fields like `name`, `complexity`, `attempts[]` are dropped to keep the return small. The `errorCode` field is a bounded enum (`OVERFLOW | TIMEOUT | FAILED_TESTS | FAILED_BUILD | BLOCKED | NEEDS_CONTEXT`); free-text error strings are rejected by the parser.

### Post-execution completeness invariant

After all waves complete, `state/execute.js verify-completeness` checks that every planned task ID appears in state with status `completed`, `failed`, or `skipped-dependency`. If any task is unaccounted, the command exits 65 with structured JSON on stderr:

```json
{"missingIds": ["T5"], "totalPlanned": 8, "totalAccounted": 7}
```

The pipeline **halts before the commit step** on exit 65 — it does not silently advance. This gate is also wired into `ship-sdlc`'s execute-step finalization.

---

## Wave Timeout and Liveness (#506)

Each wave is bounded by a wall-clock deadline, resolved from the `--wave-timeout` / `--wave-interval` flags (see Flags above). The harness provides no per-Agent wall-clock deadline of its own (`maxTurns` is a turn budget, not a clock), so the wave-runner Agent enforces the deadline itself: it dispatches per-task workers in the background, polls their liveness with `Monitor`, and terminates any overrun worker with `TaskStop`. There is no separate watchdog subagent — the per-task layer already sits at the documented spawn-depth limit.

### In-flight progress markers

While a task is in flight, its worker records its current phase:

```bash
node state/execute.js wave-progress --wave <N> --run-id <run-id> --task <id> --phase <started|reading|editing|verifying|reporting>
```

- **Phase enum** is exactly `started | reading | editing | verifying | reporting` — any other value is rejected.
- **Exit codes:** `0` on a successful write; `2` when `--wave`, `--run-id`, or `--task` is missing, or `--phase` is not one of the five values above.
- **Read mode** (used by the wave-runner to observe a running wave from outside): `node state/execute.js wave-progress --wave <N> --run-id <run-id> --read` prints the marker JSON to stdout and exits `0`; an absent marker is not an error — it prints `{"tasks":{}}`.
- **Location:** `<stateDir>/<runId>/progress-wave-<N>.json`, where `stateDir` is `resolveStateDir()`'s return value (already ends in `.sdlc/execution` — there is no extra `execution/` segment). The marker sits directly in the per-run directory, alongside that run's per-task fact sheets (`task-<id>.md`). See [`plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md`](../../plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md) for the full marker JSON shape.

### TIMEOUT verdict

When a task is still in flight at the deadline, the wave-runner terminates it and reports it in `WAVE_SUMMARY` with `status: "FAILED"` and `errorCode: "TIMEOUT"`. The wave itself is reported `status: "partial"` (not `failed` — other tasks in the same wave may have completed normally). The wave-runner Agent never calls `state/execute.js` itself — all state writes are a main-context responsibility. On seeing `WAVE_SUMMARY.status === "partial"`, execute-plan-sdlc's main context runs `wave-done --status partial --timed-out`, which sets `wave.timedOut: true` on the wave row so a subsequent `--resume` does not re-wait on it.

What this looks like from the outside:

- Each terminated task is recorded by main context via `task-fail --error TIMEOUT` — the task is accounted, not missing, so the post-execution completeness gate (exit 65) stays meaningful.
- One warning line is surfaced: `Wave N exceeded executeWaveTimeout (<n>s) — <k> task(s) terminated.`
- **The pipeline does not halt.** Timeout is a verdict, not a crash — the same treatment `await-remote-review` and `verify-pipeline` give their own timeouts — and execution proceeds to Step 6 (RECOVER) with the terminated tasks.

**`--commit-waves` interaction.** `--commit-waves` (see Per-Wave WIP Commits above) only commits a wave once it has passed G9 and G11 with `wave.status === 'completed'`. A timed-out wave is `status: "partial"`, not `completed` — **it is not committable.** Its work stays uncommitted until the tasks recovered in Step 6 finish and the wave reaches `completed`; only then does the deferred WIP commit for that wave fire. This is the correct behavior (committing a half-executed wave would be worse), but it means `--commit-waves` does not give you a checkpoint for a wave that timed out until recovery completes.

### Resuming safely (`resume-reset`)

Before computing the resume pointer, `--resume` runs:

```bash
node state/execute.js resume-reset [--branch <name>]
```

- Clears `tasks` (and `completedAt`) on any wave whose status is `in_progress` — those rows were written mid-wave by main context and are untrusted (see state-format.md).
- Leaves `completed`, `failed`, and `partial` waves untouched. A `partial` (timed-out) wave's rows are a deliberate record, not untrusted data — its unfinished task IDs are carried into the next wave's dispatch set instead of re-running the full `executeWaveTimeout` deadline from scratch.
- **Exit code:** always `0` — a no-op (no state file, or nothing to reset) is success, not an error.
- **Output:** `{"resetWaves": [...], "clearedTaskIds": [...]}` on stdout.
- **Idempotent:** running it twice against the same state returns `{"resetWaves":[],"clearedTaskIds":[]}` on the second call and leaves the file byte-identical.

---

## Related Skills

- [`/plan-sdlc`](plan-sdlc.md) — writes the plans this skill executes
- [`/commit-sdlc`](commit-sdlc.md) — commit changes after plan execution
- [`/pr-sdlc`](pr-sdlc.md) — create a pull request after plan execution
- [`/review-sdlc`](review-sdlc.md) — review changes after plan execution
- [`/version-sdlc`](version-sdlc.md) — tag a release after plan execution
