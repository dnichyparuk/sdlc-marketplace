# sdlc-utilities — architecture and design review

Date: 2026-10-18 · Plugin `sdlc` v0.21.29 · Branch `docs/plugin-assessment-claude-5` · Reviewer: Claude Fable 5.1 (architecture pass)

Scope: the *design* of the plugin — control plane, context/memory layering, dispatch topology, configuration, quality loop, safety. The prompt-fit audit in `assessment/01-prompt-audit/README.md` (285 findings, four-phase plan) is taken as given; nothing here repeats it. No repository file was modified except this one. No promptfoo run.

**Assumptions.** (1) Target runtime is Claude Code ≥ 2.1.300 on the Anthropic API, so `context: fork`, `agent:`, `effort`, `skills:` preload, `memory:` and the 33 hook events in `assessment/reference/03-claude-code-authoring-reference.md` are available. (2) Dollar figures are not measured; the repository keeps no usage ledger. (3) Line numbers are from LF-normalised reads of the CRLF working tree; HEAD line numbers match. (4) Where the Claude Code docs were only partially fetched (hooks page, Workflows), I say so and mark the claim as *to verify*.

---

## A. Overall design verdict

**What it is.** A pipeline state machine whose *transitions* are computed in Node (`scripts/skill/ship.js` `computeSteps`, 425–850; `scripts/state/ship.js` / `state/execute.js` as the ledger; `lib/state.js` `pipelineAdvancing` 848–879) and whose *executor* is the session model reading ~1,000-line SKILL.md files and dispatching sub-agents from prose. Three hooks (`stop-pipeline-continue.js`, `pipeline-continue.js`, `block-askuserquestion-auto.js`) keep that executor in the loop; two more (`pre-compact-save.js`, `session-start.js`) carry state across compaction. Judgment steps (commit text, review findings, hardening proposals) are delegated to Read-only Haiku/Sonnet agents fed from a manifest file.

**What it gets right** — and should not be churned:

- *Prepare-script → manifest file → bounded orchestrator agent → main-context consent gate.* `review-sdlc/SKILL.md:1–150` plus `agents/review-orchestrator.md` is the template; `commit-`, `error-report-`, `harden-orchestrator.md` are Read-only, model-pinned, manifest-fed. This is the agent-design guidance ("promote to a dedicated, gateable action; keep the harness in charge of side effects") done properly.
- *State on disk under the main worktree, keyed by branch slug, claimed by session* (`lib/state.js` 81–85, 896–947). Resume works from a fresh session; hook enforcement cannot be hijacked by a stale file from another session (#505).
- *Bounded return contracts.* `WAVE_SUMMARY` schema with overflow detection (`wave-runner-template.md:149–195`, `lib/wave-summary.js`), fact sheets instead of inlined task bodies (`lib/task-factsheet.js`), thin review manifest with per-dimension slice files (`review-orchestrator.md:764`).
- *Deterministic side-effect verification* (`ship.js verify-side-effect`, SKILL.md:349–358) and the pipeline-composition rule "`steps[]` is the only source of truth" (`ship.js:426–440`).
- *Review dimensions as markdown-with-frontmatter* plus a script-generated Copilot mirror (`lib/dimension-to-instructions.js`).

**Structural weaknesses the prompt-fit alignment will not fix:**

1. **The control loop lives in prose that the harness cannot see.** `ship-sdlc/SKILL.md` Step 5 (lines 293–965) and `execute-plan-sdlc/SKILL.md` Step 5 (323–727) *are* the scheduler: begin-step → dispatch → parse → verify → record → decide. Everything that enforces the loop (three Stop/PostToolUse hooks, a block-cap sidecar, session claims, `--hook-active-pipeline`) exists because the loop is narrated rather than driven. The fix lineage #452 → #454 → #477 → #505 (R67–R73) is four iterations on one symptom.
2. **The repository already designed the fix and never adopted it.** `lib/stepper.js` (240 lines), `docs/step-emitter-architecture.md` and `docs/adding-skills.md` ("Step-Emitter — recommended for complex skills") describe a script-owned two-call loop. `grep -rl stepper scripts/` returns only the library itself. Zero consumers.
3. **Depth and duplication in the execute topology.** ship → execute → wave-runner → worker is three subagent layers (spec `R-nested-dispatch-resilient` notes it sits exactly at the documented depth limit). The wave-runner's job is fan-out, poll, collect — deterministic work on a Sonnet/Opus context that also receives ~6k tokens of inlined templates per wave (`wave-runner-template.md:29–32`, `classifying-and-waving-tasks.md:386+`).
4. **The quality loop does not exercise the harness.** Behavioral promptfoo runs `claude -p` with a prompt that says "This is a simulation — you cannot execute commands" (`tests/promptfoo/prompts/skill-runner.txt`). It tests prose comprehension. No CI workflow runs the validators or the exec suite (`.github/workflows/` = changelog, version-bump, pages, retag); `lefthook.yml` is opt-in. No `claude plugin eval` suite, no usage ledger.
5. **Specs have become append-only change logs.** 1,375 requirement bullets across 13 specs (ship 196, plan 161, execute 124), many of the form "R26: (removed)…" or "R-b3 (#478)…". They are valuable traceability but no longer a readable contract, and `docs/cost-tiers.md §6` had to carve out an exception just to change a `model:` field.

Verdict: **sound skeleton, misplaced control plane.** The architecture is one refactor (control plane into scripts, dispatch into declarative agents) away from being both cheaper and simpler than what the four-phase plan alone will produce.

---

## B. Control-plane placement

Today: scripts compute transitions, the LLM executes them, hooks police the LLM. Three alternatives, assessed against the five axes the brief asks for.

| Option | Reliability | Cost | Observability | Testability | User interaction |
|---|---|---|---|---|---|
| **(1) Driver script owns the loop; `claude -p` / Agent SDK only for judgment steps** | Highest for `--auto`: no turn-ending, no hook arms race, deterministic retries | Lowest: judgment calls are cold, bounded prompts; no 13k-token skill load per step | Best: the driver can log usage per call | Best: loop testable without an LLM; judgment steps mockable | Worst inside Claude Code: loses AskUserQuestion, task tray, plan mode, permission prompts; becomes a CLI, not a plugin |
| **(2) `context: fork` skills with a custom `agent:` per step** | High: per-step `model`, `effort`, `tools`, `maxTurns`, `background: false` are declared, not narrated; no "Invoke /x via the Skill tool" indirection (`ship-sdlc/SKILL.md:334–339`) | Lower: `skills:` preload puts the sub-skill in the fork at start; drops the general-purpose wrapper hop | Good: `SubagentStart`/`SubagentStop` hooks (reference §4) can log each step; plugin subagents ignore `hooks`/`permissionMode` fields, so logging must be plugin-level hooks | Good: each agent file is a unit; `claude plugin eval` can target one step | Preserved: forks return to the main session where consent gates live |
| **(3) Keep the shape, shrink the prose to a dispatcher** | Same failure modes, fewer tokens | Moderate saving | Unchanged | Unchanged | Unchanged |

**Assessment.** Option (1) is the right answer for the *unattended* path only. Everything the plugin bolts on for `--auto` — Stop-hook blocking with a 3-block cap that marks steps failed (`stop-pipeline-continue.js:163–192`), PostToolUse nudges after every Bash call, AskUserQuestion denial — is an emulation of a driver loop inside an interactive session. A `claude -p`-driven `ship --auto` would delete that machinery. But it should not replace the interactive path, where consent gates, `edit` loops and the task tray are the product.

Option (2) is the right answer for the *interactive* path and most of the fan-outs. Today ship dispatches a general-purpose agent whose prompt says "invoke `/<skill>` using the Skill tool" — one hop to load a 7–18k SKILL.md into a fresh context, then a second hop inside it for the orchestrator. A per-step agent definition (`agents/ship-step-review.md` with `model`, `effort`, `tools`, `skills: [review-sdlc]`, `maxTurns`) makes the dispatch a one-line Skill call and moves model/effort out of `ship.js:449–676` where they are currently hard-coded strings. `docs/skill-best-practices.md` ("Harness Integration Patterns": "The harness does not support frontmatter-driven context forking for skills") is stale; the reference §1 lists `context`, `agent`, `background`.

Option (3) is necessary regardless and is what Phases 2–3 of the existing plan deliver. It is not sufficient: the loop stays in the 5k-token-vulnerable tail of the skill.

**Recommended placement.** Hybrid: (a) move the *sequencing* of ship and execute into `stepper.js`-style envelopes emitted by `ship.js`/a new `skill/execute.js` (the step-emitter design already in the repo); (b) express each dispatch as a custom agent file and, for sub-skills ship calls, as `context: fork` + `agent:`; (c) keep prose only for judgment ("when `step.id == critique_wave`…"). The Stop/PostToolUse hooks then shrink to a single "state says in_progress → block" check, and the `--auto` driver (option 1) becomes a later spike rather than a prerequisite.

*To verify:* whether `context: fork` honours the main session's permission mode for plugin skills (reference §2 says `permissionMode` is ignored for plugin subagents); whether Workflows (a `workflows/` plugin component exists in the manifest reference) can own a loop with user-facing pauses. Both are a one-afternoon spike each.

---

## C. Context and memory architecture

**Current layering.** (i) `.sdlc/execution/{ship,execute}-<slug>-<ts>.json` — the ledger; (ii) per-run fact sheets `.sdlc/execution/<runId>/task-<id>.md`; (iii) prior-wave summary via `summarize-prior-wave-context` (capped lists); (iv) byte budget `lib/dispatch-budget.js`; (v) `.compact-recovery-<slug>.json` written by PreCompact, consumed by SessionStart within 1h; (vi) session-start banner recomputed from the ledger every session; (vii) `.sdlc/learnings/log.md` appended by skills, harvested by a repo-local command.

**Is it the right layering?** Mostly yes; one layer is redundant and one is missing.

- *Redundant:* (v). `session-start.js:604–686` already derives "Active pipeline / Active execution (post-compact)" from the ledger itself, then 695–802 reads the sidecar and prints a second, overlapping block. The sidecar carries nothing the ledger lacks (`pre-compact-save.js:439–482` is a projection of it). With 1M-context models and auto-compaction the "save before compaction" pattern from the best-practices page is satisfied by the ledger, which is written on every transition. Drop PreCompact, keep the banner.
- *Missing:* a per-step usage field. Nothing records tokens; Phase 1 item 1 of the existing plan is the right first move.
- *Fact sheets and wave summaries* are correctly files/contracts, not prose. Keep.
- *Byte budget:* right idea, fossilised constant (`dispatch-budget.js:17–21`, "Claude 4 family 200K"). Make the limit a config value with the model as key, and compute from the actual fact-sheet sizes it already receives.
- *5,000-token re-attach:* the skills put Step 0–2 (announce, plan-mode check, flag parsing) in the first 5k and the loop after it. Reordering prose only partially helps; the structural fix is B(a): once the script emits "next step + what to do", the re-attached prose need only contain the loop skeleton and the per-step judgment sections, each short.
- *Subagent `memory:`* is not needed for the pipeline (state is explicit) and would be wrong for workers (cross-run leakage into code edits). The one defensible use is `memory: project` on `review-orchestrator` for calibration notes ("this repo flags X as noise") — optional, and only after a usage ledger exists to show whether dedupe/calibration is where review spends tokens.

**What should be what:**

| Concern | Today | Should be |
|---|---|---|
| Which step is next, model/effort for it | prose + `ship.js` table | script envelope (file), agent frontmatter |
| "Do not end the turn" | 3 hooks + PostToolUse nudge | one Stop hook reading the ledger; no PostToolUse nudge |
| Resume after compaction/new session | ledger + sidecar + banner | ledger + banner |
| Task body for a worker | fact sheet file | unchanged |
| Guardrails for workers | inlined per prompt (cache-stable prefix) | unchanged; pre/post-wave *LLM* guardrail passes → one post-wave pass over `git diff` |
| Learnings | append-only log, repo-side harvester | unchanged |
| Plan content | file path on the wire (`--plan`) | unchanged |

---

## D. Dispatch topology and cost

Counted from the skills (`plan-sdlc/SKILL.md:265, 412, 525–545`; `execute-plan-sdlc/SKILL.md:323–560`; `review-orchestrator.md:829–846`; `ship-sdlc/SKILL.md:318–360`):

| Stage | Dispatches per run | Depth below main | Where the topology itself wastes |
|---|---|---|---|
| plan (full) | 1 Gate A + 1 explore orchestrator + 3–7 discovery + 5 lanes + 3 lenses, ×≤3 iterations, +5 lanes again on material change ≈ 15–35 | 2 | Two lanes are deterministic (audit); lanes+lenses re-dispatched as a block on every material change; lens model inverted to Opus for Sonnet-authored plans ×3 iterations |
| execute | per wave: 1 wave-runner + N workers (+≤2 retries each) + 1 spec reviewer; + final spec reviewer | 3 under ship | Wave-runner is a relay; spec reviewer runs per wave *and* at the end; 2 LLM guardrail passes per wave in main context (5a-pre, 5c-ter); one Bash call per task for `task-done` |
| review | 1 orchestrator + N dimensions (14 configured in this repo) | 2 | Orchestrator does table/count/verdict rendering (audit); otherwise justified |
| ship | 6–8 sequential general-purpose agents, each loading a full SKILL.md via the Skill tool | 1 (+ nested) | The wrapper hop; `model` without `effort`; haiku `commit` on long diffs |

**Where fan-out is justified.** Review dimensions (independent, parallel, isolated) — yes. Execute workers — yes, that is the product. Plan discovery — yes, but 3–7 agents plus a Sonnet orchestrator for a *plan* is heavy; cap at 3–5 and let the orchestrator skip discovery for lightweight plans (it already routes by scope at Step 0). Plan lanes — only the three judgment lanes. Lenses — yes at ≥5 tasks. **Not justified:** the wave-runner as a permanent layer, and the per-step general-purpose wrapper in ship.

**Wave-runner.** It exists (R8, #353) for context isolation and, later, for deadline enforcement with `Monitor`/`TaskStop` (`wave-runner-template.md:84–110`). Both are achievable from execute's own context: worker returns are bounded by the `COMPLETE:` contract, and `Monitor`/`TaskStop` are main-context tools too. Removing it drops one layer (depth 2 under ship), ~6k tokens of template per wave, and the `perTaskTemplate` inlining rule. Keep it only as an opt-in for waves larger than K or when the spawn-depth limit is hit under ship.

**Effort-first vs tier-first.** The current ladder is tier-first (haiku → sonnet → opus by complexity, escalate by tier on failure). On the 5.5 generation the first lever is effort within Sonnet 5.5 (`low` for Trivial, `medium` Standard, `high` Complex), Opus 5.5 reserved for Complex × High-risk, Haiku only for batched trivials. Escalation becomes "same model, higher effort" first — which keeps the prompt-cache namespace (agent-design.md, "Caching for Agents": switching model invalidates the cache) and avoids Haiku's documented early stopping on agentic prompts. This is Phase 1 item 10 of the existing plan; the topology change here is that the *routing table* moves to the agent files/`skill/execute.js`, not prose.

**Leaner topology (target):**

```
ship (main, script-emitted steps)
 ├─ fork: execute  (main-context waves; workers depth 1; optional runner)
 ├─ fork: commit   (Read-only haiku/sonnet-low drafter)
 ├─ fork: review   (orchestrator → N dimensions)      ← unchanged
 ├─ fork: received-review / version / pr
 └─ inline bash steps (rebase, archive, learnings, cleanup) via ship.js subcommands
plan (main) ─ explore orchestrator (≤5) ─ 3 judgment lanes ─ lenses (≥5 tasks)
```

---

## E. Configuration and extensibility

**Coherent core.** `.sdlc/config.json` (project, versioned `schemaVersion: 3`) vs `.sdlc/local.json` (per-user), migration registry with idempotent, rollback-able steps (`lib/config-migrations.js`), JSON schemas under `schemas/` for config, state and dimensions, review dimensions as markdown+frontmatter with `triggers`/`skip-when`/`model`, a generated Copilot mirror, plan templates with `## Required Sections` markers, Jira templates per issue type, OpenSpec detection in `lib/openspec.js` (744 lines). This is a better config surface than most plugins have.

**Accretion points:**

- *Cross-skill wire coupling.* Ship resolves `executeWaveTimeout`, `executeWaveInterval`, `execute.commitWaves`, `--quality`, `--rebase`, `--plan` and forwards them as CLI flags (`ship.js:449–470`), because execute has no prepare script and reads config through seven `node -e` blocks. Give execute its own `skill/execute.js` (which `docs/cost-tiers.md §5` already cites as if it existed) that reads an `execute` section; ship forwards only `--plan`, `--auto`, `--quality`.
- *OpenSpec spread across five surfaces* — session-start banner, plan gate (`plan-sdlc/SKILL.md:23–58`), execute task flips (5d-bis), ship archive step with six `node -e` heredocs (`ship-sdlc/SKILL.md:639–735`), setup enrichment. One `scripts/skill/openspec-step.js` with `detect | flip | archive` subcommands and one on-demand reference file would replace all five prose sites.
- *Repo-local guardrails as plugin behaviour.* `.sdlc/config.json` in this repo carries 15 plan guardrails (`spec-first`, `no-auto-eval`, `skill-docs-required`…) that are dogfooding policy; they leak into behavioral fixtures and into `setup-guardrails.md` text (audit F). Keep them, but keep them out of shipped defaults.
- *Copilot mirror has no drift check.* `dimension-to-instructions.js` is a generator; nothing in CI asserts `.github/instructions/*.md` matches `.sdlc/review-dimensions/*.md`. A 10-line validator closes it.

**Spec-first process.** The convention (AGENTS.md §1, `spec-first` guardrail) is producing *traceability* — every behaviour has an R-id and an issue — and *accretion*: specs are edited on every change including non-behavioural ones, R-ids are never retired, and "removed" bullets stay (`execute-plan-sdlc.md` R26). The specs are now longer than the skills they govern and are not the artefact a new contributor can read to learn the contract. Recommendation: keep R-ids and the "spec before SKILL.md" rule, restructure each spec into *contract sections* (inputs, state, dispatch, gates, failure handling, invariants) with R-ids as stable anchors, and move the issue-by-issue history into an appendix or the CHANGELOG. Then `docs/cost-tiers.md §6` ("model changes need no spec update") stops being an exception and becomes the norm: tuning fields live in agent frontmatter and config, not in contracts.

---

## F. Quality system

**What exists.** 79 promptfoo datasets / 1,142 cases: 63 exec datasets run real scripts and hooks against fixtures (strong, fast, deterministic); 16 behavioral datasets run `claude -p` in *simulation mode* (the prompt forbids tool use). Eight CI validators under `scripts/ci/`, three repo-local consistency skills under `.claude/skills/`, `lefthook` pre-push (opt-in) for the exec suites. `Taskfile.yml` has a `test:unit` target pointing at a `tests/unit/` directory that does not exist (and AGENTS.md forbids `node:test`).

**Gaps that matter structurally.**

1. *Nothing runs on PR.* The four workflows check changelog/version and deploy pages. Validators and exec suites run only if a contributor installed lefthook.
2. *The behavioral suite cannot see the failure class the plugin actually has.* Turn-ending (#452/#454), hook interplay (#477/#505), nested dispatch self-blocking (#463), CRLF-inert parsers — none are reachable from a tool-less `claude -p` transcript. The suite is a prose-regression check and should be labelled as such.
3. *No per-model-tier evals, no usage ledger, no `claude plugin eval`.* The plugin has 14 model-pinned surfaces and no way to compare Sonnet-medium vs Opus-medium on a real artefact.
4. *CRLF-inert validators* (`lib/yaml.js:24,32`, `session-start.js:75`) — on this checkout `validate-cost-tiers.js` passes trivially. A `\r?\n` fix plus a CI job on Linux makes it irrelevant.

**Minimal high-signal loop (in order):**

1. One GitHub workflow on PR: `node scripts/ci/validate-*.js` + `promptfoo eval --config promptfooconfig-exec.yaml` + `-exec-hooks.yaml`. ~2 minutes, no LLM, catches the deterministic 80%.
2. A `claude plugin eval` suite of 6–8 cases run against a fixture repo in a sandbox: `commit-sdlc --auto` on a staged diff (grader: HEAD commit exists, subject matches `commitConfig`), `review-sdlc --dry-run`, `ship-sdlc --dry-run`, `execute-plan-sdlc` on a 2-task plan (grader: `verify-completeness` exits 0, files exist), `ship --auto --steps commit,review` (grader: ledger reaches `cleanup: completed`, no `block-cap-exhausted`). Graders assert on **state files and git**, not on text. Default `--runs 3` gives the flakiness signal the current suite cannot.
3. Usage ledger: `complete-step --usage '<json>'` in `state/ship.js`; wave summaries carry `escalationsUsed` already — add tokens. If the `SubagentStop` payload exposes usage (*to verify*), a plugin hook can write it without prose involvement.
4. Keep behavioral promptfoo for prose regressions; rename the Task target to `test:prose`.

---

## G. Safety and UX

**Right.** Consent gates run in the main context before every externally visible action (`docs/skill-best-practices.md §6`; `review-sdlc` Step 4, `pr-sdlc` Step 5, `version-sdlc` Step 5). The commit prepare script hard-blocks default-branch commits under `--auto` (exit 3, `commit-sdlc/SKILL.md:52–60`), the expected-branch guard is script-resolved, version completion is side-effect-verified, and `--steps` cannot smuggle in the reserved `cleanup` step. The AskUserQuestion-deny hook is keyed on ledger + session + `flags.auto`, so it cannot fire outside an owned `--auto` run.

**Structurally fragile.**

1. *A hook mutates pipeline state.* `stop-pipeline-continue.js:179–196` marks a step `failed: block-cap-exhausted` after three blocks and tells only stderr. The user sees a silently stopped pipeline; `ship.js` prepare has to discover it on the next run. Hooks should observe, scripts should decide: write a sidecar and let `ship.js` surface it with a remediation line.
2. *`--auto` has no escape hatch.* Once `flags.auto` is set, AskUserQuestion is denied and Stop is blocked for the owning session; the only way to intervene is to delete the ledger. A `node state/ship.js pause` subcommand (sets `paused: true`, honoured by `pipelineAdvancing`) is a five-line fix.
3. *`--auto` semantics are per-skill, not pipeline-wide* (`ship-sdlc/SKILL.md:205–216`): execute has no `--auto` in the same sense, received-review's is further restricted by `alwaysFixSeverities`, `--rebase auto` can rewrite the feature branch before the PR. Acceptable on a feature branch, but the audit table should be a script-emitted matrix, and `--rebase auto` should require `--auto` explicitly rather than config.
4. *Review gate reads the transcript.* Dispatch to received-review is gated by severity counts scraped from the review agent's text (`ship-sdlc/SKILL.md:218–241`); a lost or reformatted summary approves silently. The orchestrator already writes `review-comment.md`; emit a `review-summary.json` beside it and gate on that (Phase 3 item 24 names this).
5. *Workspace model churn.* Eleven commits added, guarded, then removed worktree mode (#78 → #370/#372 → #378/#379), and #490/#503 are still fixing worktree-aware paths. The current model (auto-detect `branch`/`continue`, no worktree creation) is the stable one — keep it, and remove the remaining "worktree re-entry on resume" prose (`ship-sdlc/SKILL.md:513–520`) that describes the removed mode.
6. *Hook timeouts in milliseconds* (`hooks.json:10,21,32,42,54,64,73,82`) — already in Phase 1; it is a safety issue (unbounded hang on `/mnt/c`), not a tuning one.

---

## H. Prioritised design recommendations

> **Superseded by the consolidated plan** — see [`../03-plan/consolidated-plan.md`](../03-plan/consolidated-plan.md); the disposition of each item below is in its [§4.2 table](../03-plan/consolidated-plan.md#42-design-review-h-items-110).

Beyond the four-phase plan. Effort S < 1 day, M = days, L = a sprint.

| # | Change | Why | Expected effect | Effort | Risk | Interaction with existing plan |
|---|---|---|---|---|---|---|
| 1 | **Adopt the step-emitter for ship** (and execute once it has a prepare script): `ship.js` emits `{step, action, data, llm_decision}` envelopes via `lib/stepper.js`; `ship-sdlc/SKILL.md` Step 5 becomes a ~40-line loop plus per-step judgment sections | The loop belongs to the script (`docs/step-emitter-architecture.md`); it is the only fix for the 5k re-attach and for the hook arms race | Reliability (no narrated sequencing), −6–8k tokens per ship load, hooks shrink to one | M | Rewrite of the most-tested skill; mitigated by exec tests on every transition | Supersedes Phase 2 item 15 (prose moves), Phase 3 item 24 (ship.js subcommands become steps). Prerequisite: Phase 1 item 1 (usage) |
| 2 | **Declarative dispatch**: one `agents/<step>.md` per ship step and per plan lane/lens with `model`, `effort`, `tools`, `maxTurns`, `skills:` preload; sub-skills invoked via `context: fork` + `agent:` | Reference §1–2: these fields exist; `ship.js:449–676` hard-codes model strings and no effort; the general-purpose wrapper hop is pure overhead | Cost (effort set everywhere, one hop fewer), observability via SubagentStart/Stop | M | Plugin subagents ignore `permissionMode`/`hooks`; verify fork permission inheritance first (half-day spike) | Supersedes Phase 1 item 10 for ship/plan; keeps it for execute workers and review dimensions |
| 3 | **Collapse continuation enforcement**: one Stop hook; PostToolUse nudge removed (or gated on a `stat` of the state dir before spawning `git`); Stop hook writes a sidecar on cap exhaustion instead of mutating the ledger; add `state/ship.js pause` | Hooks should observe, not decide; three Node+git spawns per turn is the cost of narrated control | Reliability, latency, removes the silent-failure path | S–M | Low; behaviour covered by `ship-hooks-exec.yaml` | Independent; absorbs Phase 1 item 11 and Phase 3 item 28 |
| 4 | **Flatten execute**: workers dispatched from execute main (depth 1 under execute), wave-runner opt-in; effort-first routing on Sonnet 5.5; single post-wave guardrail pass; spec reviewer once per run (not per wave) unless `--quality minimal` | Best-practices "watch for subagent overuse"; agent-design cache guidance (same model, higher effort keeps the cache) | −1 layer, −~6k tokens/wave, −1–2 dispatches/wave | L | Execute main context grows by N bounded worker returns — measure on a 12-task plan first | Depends on Phase 1 items 1, 4, 10; supersedes B35 (runner floor) |
| 5 | **Drop PreCompact/compact-recovery**; keep the ledger-derived banner | `session-start.js` already derives the same lines from state; sidecar is a 1h-TTL projection | −1 hook, −~300 lines, one fewer file class to GC | S | None observed | Independent |
| 6 | **CI on PR + `claude plugin eval` smoke suite**; label behavioral promptfoo as prose-only | Section F: nothing runs on PR; the real failure class is unreachable by the current suite | Catches turn/hook/nesting regressions before merge | M | Eval cost on PRs — run the LLM suite on label only | Prerequisite for safe Phase 2/3 edits |
| 7 | **`skill/execute.js` prepare script** owning plan parse, classification floor, wave build, manifest, guardrail load, config read | Removes seven `node -e` blocks and the ship→execute wire coupling; `cost-tiers.md` already names the file | Reliability, −2–3k tokens/execute load | M | Classification stays LLM; only the deterministic floor moves | Supersedes Phase 3 item 23; enables #1 for execute |
| 8 | **Consolidate OpenSpec** into `scripts/skill/openspec-step.js` + one reference file | Five prose surfaces, six heredocs | −~2.5k tokens on ship's common path | M | Low | Implements Phase 3 item 24's `openspec-archive-step.js`; broader scope |
| 9 | **Restructure specs as contracts** (sections by behaviour, R-ids as anchors, history to appendix) | Section E: specs are change logs; `cost-tiers.md §6` exception shows the friction | Maintainability; new contributors can read the contract | S–M per spec | None; traceability preserved | Independent; do ship/execute/plan first |
| 10 | **Review summary as JSON** (`review-summary.json` beside `review-comment.md`) and gate received-review on it | Section G.4 | Removes transcript-scraping failure mode | S | None | Part of Phase 3 item 25 |

**Do not change** (already right; churn risk): the prepare-script → manifest → Read-only orchestrator pattern and its three Haiku agents; state-file location/keying/session claim; fact sheets and the bounded `WAVE_SUMMARY`; review-dimension file format and the `_common.md` injection; `steps[]` as the sole pipeline-composition source; `verify-side-effect` (extend to `pr`/`commit`, do not remove); consent gates in main context; the exec promptfoo suite and fixture layout; the auto-detected workspace model.

> **Superseded by the consolidated plan** — see [`../03-plan/consolidated-plan.md`](../03-plan/consolidated-plan.md); the disposition of each item below is in its [§4.2 table](../03-plan/consolidated-plan.md#42-design-review-h-items-110).

**Sequencing (updated per maintainer decisions).** Phase 1 of the existing plan (measure, timeouts, effort, dead paths) → #6 as CI-on-PR only (validators + exec promptfoo; `claude plugin eval` stays a local gate) → #3 and #5 (hook simplification, low risk) → #9 for ship, execute and plan specs → #1 + #2 for ship → #7 then #4 for execute (wave-runner opt-in for large plans) → #8 and #10 as capacity allows. The `claude -p` driver spike is dropped. Items #1/#2 should land before the Phase 2 prose rewrite of ship and execute, otherwise that rewrite is done twice.

---

## Decisions for the maintainer

1. Interactive-first (option B.2 + step-emitter) or a separate `claude -p` driver for `--auto`? Recommendation: B.2 now, driver as a later spike.
2. Is the wave-runner a product requirement (deadline enforcement, isolation) or an implementation detail? If the latter, #4 proceeds after measurement.
3. Will `claude plugin eval` be allowed to spend on PRs (label-gated), or only locally? #6 depends on it.
4. Specs: keep append-only R-numbering as the contract style, or restructure (#9)? Either is workable; mixed is not.

## Maintainer decisions (recorded 2026-10-18)

1. **Control plane:** interactive-first (B.2 `context: fork` + step-emitter). A separate `claude -p` driver for `--auto` is **declined** for now; remove it from the sequencing.
2. **Wave-runner:** implementation detail, not a product requirement. The opt-in scheme (workers from execute main by default; wave-runner only for large/complex plans) is **accepted**; proceed with #4 after measurement.
3. **`claude plugin eval` spend:** **local only**. #6 becomes: CI on PR runs validators + exec promptfoo (no LLM); the eval smoke suite is a local/pre-release gate.
4. **Specs:** **restructure as contracts** (#9 accepted). Rules going forward: sections by behaviour (inputs/flags, state model, step composition, dispatch and routing, gates, failure handling and resume, invariants); existing R-ids kept verbatim as stable anchors so SKILL.md citations, promptfoo datasets and validators keep resolving; acceptance criteria stay with their requirement; issue numbers and "(removed)" entries leave the body for an appendix or the CHANGELOG; tuning fields (model, effort, timeouts, limits) live in agent frontmatter and config, not in the spec — `docs/cost-tiers.md` §6 becomes the general rule. Order: ship-sdlc, execute-plan-sdlc, plan-sdlc first, **before** #1/#2 so each step contract is written once; remaining specs on next touch. Update `AGENTS.md` §1 and `docs/spec-template.md` in the same change so the convention is single-sourced.
