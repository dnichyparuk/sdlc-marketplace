# sdlc-utilities plugin — assessment against Claude 5.x guidance

Audit date: 2026-10-15 · Plugin: `sdlc` (`plugins/sdlc-utilities`) v0.21.29 · Repository HEAD `3480d74`
Audited by Claude Fable 5.1 (lead) with seven Fable 5.1 reviewer forks (one per file group) and one documentation agent.

No repository file was modified. This directory is the only addition.

## Package contents

| Path | What it is |
|---|---|
| `README.md` | This consolidated report: overall assessment, plugin structure, cross-cutting findings, per-file summary, prioritized action plan, text-reduction summary with expected effect |
| `../02-design-review/design-review.md` | Architecture review by an isolated Fable 5.1 agent (2026-10-18): control-plane placement, context/memory layering, dispatch topology, config, quality loop, safety, and design recommendations beyond the four-phase plan |
| `group-reports/A-plan-sdlc.md` | plan-sdlc SKILL.md + 13 prompt/reference files + plan-explore-orchestrator (42 findings) |
| `group-reports/B-execute-plan-sdlc.md` | execute-plan-sdlc SKILL.md + 5 supporting files (48 findings) |
| `group-reports/C-ship-verify-harden.md` | ship-sdlc + 4 companions, verify-pipeline-sdlc, harden-sdlc, harden-orchestrator (42 findings) |
| `group-reports/D-review-received-review.md` | review-sdlc + REFERENCE/EXAMPLES, review-orchestrator, received-review-sdlc, per-dimension routing (35 findings) |
| `group-reports/E-commit-pr-version-error-report.md` | commit-sdlc, pr-sdlc, version-sdlc, error-report-sdlc + two orchestrators (39 findings) |
| `group-reports/F-jira-setup.md` | jira-sdlc + REFERENCE/EXAMPLES/operations/templates, setup-sdlc + 9 sub-flows (47 findings) |
| `group-reports/G-hooks-crosscutting.md` | manifests, hooks.json, 8 hook scripts, cost-tier scripts, plus plugin-wide greps (34 findings) |
| `../reference/00-reviewer-brief.md` | The brief every reviewer worked from (targets, output contract, keep list) |
| `../reference/01-prompt-audit-method.md` | The audit methodology (pattern groups 1a–1f, 2, 3, 4; keep list; report shape) |
| `../reference/02-anthropic-prompting-best-practices-2026-10-15.md` | Anthropic "Prompting best practices" page, fetched 2026-10-15 (the user's starting point) |
| `../reference/03-claude-code-authoring-reference.md` | Current Claude Code docs digest: skill/agent frontmatter, hooks contract, effort, model aliases, limits, sources |

Every finding in the group reports carries `file:line`, quoted evidence, the pattern it matches, why it matters on the target model, a confidence level, and a proposed action. This README summarizes; the group reports are the evidence.

---

## 1. Overall assessment

**Rating: NEEDS-TUNING overall. Architecture is ahead of the guidance; the instruction text lags it by one model generation.**

The plugin's design already matches what the 2026 guidance recommends for agentic systems: deterministic work in prepare scripts, thin skills that dispatch bounded orchestrator agents on cheaper models, harness-side hooks instead of prose for "keep going" and "don't ask in auto mode", state files plus PreCompact/SessionStart recovery for long runs, and progressive disclosure for failure and resume material. review-sdlc, commit-orchestrator, verify-pipeline-sdlc, the two guardrails sub-flows and the hook scripts are the shapes to copy.

What has not kept pace is the text around that design. The skills were written and patched between March and September 2026 against the Claude 4.x generation, and the audit found the same four problems in nearly every file:

1. **Stale facts the repository contradicts (High confidence, ~90 findings).** A context-advisory feature whose producer hook never shipped; a removed Jira enforcement subsystem the skill still operates; removed `workspace`/`hooks` setup sections still documented at length; Agent-tool parameters that no longer exist; `/pr` and `/version` commands, `pr.md`, `util/worktree-create.js`, `schemas/sdlc-config.schema.json` that do not exist; a cost-tier "source of truth" that disagrees with frontmatter while its CI guard silently passes.
2. **Model routing calibrated for 4.x prices and behavior, with no effort axis.** Three-tier haiku/sonnet/opus ladders, "omitting `model:` defaults to opus" stated as the reason in six places, a 200K-context wave budget, and Haiku on long agentic worker prompts. On the 5.5 generation Opus 5.5 is $4/$20, Sonnet 5.5 at `medium` beats Sonnet 5 at `high`, Haiku 5.5 is documented to stop early and skip verification in long agent prompts, and `effort` (now a supported frontmatter field on skills and subagents, and a parameter on Agent dispatch) is the first cost lever within a tier. Nothing in the plugin sets effort anywhere.
3. **Deterministic work executed by the model.** File-existence and dependency-cycle checks run as LLM lanes while `validate-plan-format.js` already checks them; glob-matching and ranking engines written as prose (G17, PR label rules, project scan with ~50 Globs); scorecard tallying, manifest assembly, verdict thresholds, template substitution and branch-name derivation done by hand in the most expensive context. Each is a prepare-script subcommand away from being free.
4. **Repetition, pressure language and archaeology.** The same rule stated 3–6 times with escalating caps (`model:` REQUIRED ×5, Edit-tool-only ×6, await-barrier ×5), 213 GitHub issue references and 599 spec references in model-facing text, the `<PLUGIN_ROOT>` substitution blockquote repeated ~97 times, "purely additive / status quo preserved / no longer" change-log phrasing, and banned-phrase lists written against older models' habits. Current models follow a plain statement once; the repetition costs tokens and the register bleeds into output.

Two things the plugin needs to **add**, not remove: the documented Sonnet 5.5 / Haiku 5.5 "run a real check before reporting done" line in every worker prompt that edits code, and the Fable 5.1 autonomy + progress-recap lines in the two long-running unattended skills (ship, execute-plan) and in ship's sub-agent brief.

### Findings by confidence

| Group | High | Medium | Low | Total |
|---|---|---|---|---|
| A plan-sdlc | 14 | 17 | 11 | 42 |
| B execute-plan-sdlc | 18 | 22 | 6 | 46 (+6 keep) |
| C ship / verify-pipeline / harden | 10 | 19 | 13 | 42 |
| D review / received-review | 8 | 18 | 9 | 35 |
| E commit / pr / version / error-report | 14 | 15 | 10 | 39 |
| F jira / setup | 19 | 18 | 10 | 47 |
| G hooks / manifests / cross-cutting | 9 | 14 | 11 | 34 |
| **Total** | **92** | **123** | **70** | **285** |

High = contradicted by the repository itself or documented model behavior; Medium = consistent widely-observed behavior; Low = heuristic, flag only.

### Expected effect of the action plan (section 6)

| Lever | Effect |
|---|---|
| Add `effort` to every dispatch site and orchestrator agent; collapse worker tiers to Sonnet 5.5 / Opus 5.5 | Largest cost lever. Sonnet dimensions and sub-skills currently run at Sonnet 5.5's implicit `high`; commit/error-report/harden orchestrators at Haiku's `medium` where `low` suffices; review/pr/version at `high` where `medium`/`low` is the documented start. |
| Move deterministic lanes/steps into scripts (A, B, C, D, E, F lists) | Removes 2–4 LLM dispatches per plan run, ~50 tool calls per setup run, 2 Node spawns per Jira write, the branch/archive/rebase `node -e` choreography in ship, and the biggest transcription-error surfaces. |
| Delete dead/stale prose and reconcile contradictions | ~6–8k tokens per load across the three largest skills; removes reconciliation work on every run and several outright failure paths (wrong paths, phantom flags, unreachable steps). |
| Fix `dispatch-budget.js` (200K → 1M) | Up to 5× larger waves in execute-plan; fewer wave-runner dispatches per plan. |
| Fix hook timeouts (seconds, not ms) and fire `pipeline-continue` once per step | Removes an unbounded hang risk on WSL `/mnt/c`; removes ~35 tokens of harness text after every Bash call in a pipeline (hundreds per execute step) and the Sonnet/Haiku 5.5 injection-hesitation trigger. |
| Shorten the 5 longest skill descriptions to intent categories | ~500 always-on tokens saved per request in every session of every project where the plugin is installed. |

---

## 2. Method and targets

- **Method:** `../reference/01-prompt-audit-method.md` (pattern groups: 1a pressure language, 1b scaffolds replaced by API features, 1c over-specification, 1d fossils, 1e prohibition clusters, 1f output choreography; 2 brittle skill files / contradictions / volatile specifics; 3 tool descriptions; 4 request config and architecture) with its keep list applied strictly. "Shorter" was not a goal; "every token earns its place" was.
- **Best-practices source:** `../reference/02-anthropic-prompting-best-practices-2026-10-15.md` plus the per-model prompting deltas for Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5 from the bundled claude-api skill's migration guide.
- **Claude Code facts:** `../reference/03-claude-code-authoring-reference.md`. The audit-relevant ones:
  - `model` and `effort` are documented frontmatter fields on both skills and subagents; `effort` is also an Agent-dispatch parameter. Defaults: `high`, except Opus 5.5, Sonnet 5.5 and Haiku 5.5 default to `medium`.
  - On the Anthropic API, `opus` → Opus 5.5, `sonnet` → Sonnet 5.5, `haiku` → Haiku 5.5, `fable` → Fable 5.1; on Bedrock/Vertex `sonnet`/`haiku` still resolve to 4.5 models, so a pin is not the same model everywhere.
  - A skill's `model:` applies to the whole current turn with full conversation context (the plugin's own `docs/skill-best-practices.md` describes the same effect as routing into a transcript-inheriting subagent). Either way, a skill-level `model: haiku` puts an unbounded transcript on Haiku.
  - Hook `timeout` is in **seconds** (default 600 for command hooks). Hook-injected text is capped at 10,000 characters; exit 0 stdout becomes context only on SessionStart/UserPromptSubmit/PostModelSwitch; exit 2 blocks and feeds stderr to the model.
  - Docs recommend SKILL.md under 500 lines. On compaction only the **first 5,000 tokens of each skill** are re-attached (25,000 combined) — critical instructions must sit near the top.
  - Skill descriptions sit in context every session; the `/` listing budget is ~1% of the context window; `disable-model-invocation: true` removes a description from context.
- **Target models (Step 0):** `model: haiku` → Claude Haiku 5.5; `model: sonnet` → Claude Sonnet 5.5; `model: opus` → Claude Opus 5.5; unpinned surfaces and hook-injected text → the session model, assumed Claude Fable 5.1. Subagent prompt files were audited against the model the dispatch pins (verified in `plan.js`, `ship.js`, `review.js`, `classifying-and-waving-tasks.md`).
- **Verification:** every referenced script, flag, export and path was checked against `plugins/sdlc-utilities/scripts/` with file tools; `git log -S` was used for provenance where a line looked like an incident patch. No `promptfoo` run, no repository edit.
- **Environment caveat:** this working tree is a CRLF checkout (1,171 modified files in `git status`, all line-ending changes). `scripts/lib/yaml.js` and `hooks/session-start.js` match frontmatter with an LF-only regex, so on this checkout `validate-cost-tiers.js` reports every surface INHERITED and exits 0, `session-start.js` reports "0 skills loaded", and `review.js` cannot parse dimension frontmatter. HEAD is LF and parses. Findings that depend on line endings are labelled in the group reports.

---

## 3. Plugin structure

### 3.1 Layout

```
.claude-plugin/marketplace.json          one plugin entry: sdlc → ./plugins/sdlc-utilities
plugins/sdlc-utilities/
  .claude-plugin/plugin.json             name "sdlc", v0.21.29
  skills/<13 skills>/SKILL.md            + 45 supporting .md (prompts, references, templates, sub-flows)
  agents/<5 orchestrators>.md            commit, error-report, harden (haiku, Read-only); review, plan-explore (sonnet)
  hooks/hooks.json + 8 Node hooks        SessionStart, PreToolUse(AskUserQuestion), PostToolUse(Edit|Write, Bash|TodoWrite), PreCompact, 3× Stop
  scripts/  skill/ (23 prepare/step scripts)  state/ (execute, ship)  lib/ (29 modules)  ci/ (8 validators)  util/ (5)
docs/specs/<13>.md                       behavioral contracts (spec-first; SKILL.md must cite R-numbers)
docs/skills/<13>.md, docs/cost-tiers.md, docs/architecture.md, docs/skill-best-practices.md
tests/promptfoo/                         behavioral (LLM) + exec (script) suites; 79 datasets
```

Size: 16,991 lines / 133,700 words of Markdown (≈180k tokens, of which ≈76k in supporting/reference files) and 28,500 lines of JavaScript. 215 commits since 2026-03-04.

### 3.2 Runtime pattern

Every skill follows `prepare script → SKILL.md body → (orchestrator Agent) → main-context approval → exact git/gh/MCP commands`. ship-sdlc is a state machine (`scripts/skill/ship.js` computes steps and per-step `model`; `scripts/state/ship.js` records transitions) that dispatches execute, commit, review, received-review, version and pr as Agents. execute-plan-sdlc classifies tasks, builds waves, and dispatches one wave-runner Agent per wave, which dispatches per-task workers. plan-sdlc dispatches a discovery orchestrator (3–7 subagents), five critique lanes, and three review lenses. review-sdlc dispatches an orchestrator that fans out one subagent per review dimension.

### 3.3 Model routing today (frontmatter + dispatch sites)

| Surface | Pinned | Dispatch-time routing | Effort set? |
|---|---|---|---|
| plan-sdlc | opus | lanes: haiku ×2, sonnet ×3; lenses: sonnet ("opposite of author"); discovery agents: orchestrator's choice incl. opus | no |
| execute-plan-sdlc | sonnet | workers: Trivial→haiku, Standard→sonnet, Complex→opus; wave-runner = highest model in wave (can be haiku); spec reviewer sonnet | no |
| ship-sdlc | sonnet | execute→opus, commit/commit-fixes/archive→haiku, review/received-review/version/pr→sonnet | no |
| review-sdlc | sonnet | orchestrator sonnet (doc says opus); dimensions per their own `model:` (project: haiku ×5, sonnet ×6, opus ×3) | no |
| received-review-sdlc | opus | — | no |
| commit-sdlc, version-sdlc | **haiku** (skill level) | commit-orchestrator haiku | no |
| pr-sdlc, error-report-sdlc, jira-sdlc, setup-sdlc, harden-sdlc, verify-pipeline-sdlc | sonnet | error-report / harden orchestrators haiku | no |

`docs/cost-tiers.md` is declared the single source of truth and CI-validated, but it says review-orchestrator runs opus (frontmatter: sonnet), omits verify-pipeline-sdlc and plan-explore-orchestrator, cites a `scripts/skill/execute.js` that does not exist, and never mentions `effort`.

### 3.4 Token footprint (words × 1.35)

| Surface | Tokens per load | Loads when |
|---|---|---|
| execute-plan-sdlc/SKILL.md | ~17.9k (+6k classifying.md always; +4k wave-runner template per wave; +2.3k per worker) | `/execute-plan-sdlc`, plan acceptance, ship step |
| plan-sdlc/SKILL.md | ~14.5k (+6.5k plan-format-reference, read twice per iteration) | `/plan-sdlc`, plan mode |
| ship-sdlc/SKILL.md | ~12.9k (+2.6k reference.md on failure) | `/ship-sdlc` |
| jira-sdlc/SKILL.md | ~7.8k (+2.4k operations-reference always; +5k REFERENCE on error) | `/jira-sdlc` |
| setup-sdlc/SKILL.md | ~7.5k (+0.5–3k per selected sub-flow) | `/setup-sdlc` |
| pr-sdlc, version-sdlc, received-review-sdlc | ~6.6–6.9k each | on trigger |
| commit-sdlc, harden-sdlc | ~4k each | on trigger |
| review-sdlc, error-report-sdlc, verify-pipeline-sdlc | 0.9–2.1k | on trigger |
| 5 agents | 1.1–2.3k each | on dispatch |
| **Always on, every session:** session-start banner + 13 skill descriptions | ~40–150 + ~1.4k | every request |

A plan → execute → ship sequence run inline loads ~45k tokens of instruction before any code is read. Three skills exceed the 500-line recommendation by 1.5–2×, and on compaction only their first ~5k tokens survive re-attachment.

---

## 4. Cross-cutting findings

Numbered for reference from the action plan. Evidence and line numbers are in `group-reports/G-hooks-crosscutting.md` unless another report is named.

**X1 — Dead feature: the context-heaviness advisory (High).** `scripts/lib/context-advisory.js`, `ship.js:1520`, `plan-handoff-advisory.js`, and paragraphs in plan-sdlc:700, execute-plan-sdlc:88 and ship-sdlc:89 describe a sidecar "written by the `UserPromptSubmit` hook `hooks/context-stats.js`". The file does not exist and `hooks.json` registers no such hook, so the `/compact` advisory can never fire. Remove the consumers (manual `/compact` steering is a pre-1M-context pattern; Claude Code auto-compacts and the plugin already has PreCompact/SessionStart recovery).

**X2 — Cost-tier doc drift and an inert CI guard (High).** See 3.3. Fix the doc rows, add the two missing rows, make `extractFrontmatter` and `session-start.js` tolerate `\r\n`, and rewrite the §1 rationale ("inherits … typically Opus") for 5.x prices and effort.

**X3 — Hook timeouts in the wrong unit (High).** `hooks.json` uses 3000/5000/10000; the hooks reference documents `timeout` in seconds. A stalled `git` on a WSL `/mnt/c` mount can block a turn for 50–170 minutes. Change to 3/5/10.

**X4 — No effort anywhere; tiers calibrated for 4.x (High, all groups).** No skill, agent or dispatch site sets `effort`. The guidance for every 5.5 model is "set effort explicitly and re-run the sweep; lower effort before switching model; judge cost per completed task". Concretely: `ship.js` should emit `effort` beside `model` per step; execute-plan presets should become Sonnet 5.5 (low/medium) / Opus 5.5 with Haiku only for batched trivials; review dimensions should accept an optional `effort:`; the three Haiku orchestrators are `low`-effort tasks; the first escalation rung in execute-plan recovery should be "same model, higher effort" (keeps the cache namespace). `dispatch-budget.js` still hardcodes "Claude 4 family: 200K" (all 5.x models have 1M context).

**X5 — Skill-level `model:` pins on commit-sdlc and version-sdlc (haiku), pr-sdlc and error-report-sdlc (sonnet) contradict the plugin's own rule** (`docs/skill-best-practices.md` "Why frontmatter `model:` is the wrong context-isolation knob", issue #202; error-report SKILL.md:182 forbids exactly what its frontmatter does). The pin puts the whole transcript on the pinned model; on Haiku 5.5 that stacks documented early-stopping and skipped-verification onto the two skills whose safety depends on verification gates (version one-line diff, stash/pop, tag conflict). The orchestrator pattern already provides cheap-model routing for the judgment step. (Group E.)

**X6 — Deterministic work executed by the model (High, all groups).** Plan: file-existence lane (G4/G10 = `existsSync` + set logic), static lane's G3/G12 (duplicates `validate-plan-format.js` PF4), guardrail lane dispatched when output is a constant, G17 glob-match/rank engine, material-change diff over 7 structures, lane-JSON merge, scorecard tallying. Execute: manifest assembly, `expectedFiles` union, workspace derivation, post-compact discriminator, guardrail pre-check per wave. Ship: branch derivation + state patch via `node -e`, archive-openspec (six `node -e` heredocs), rebase mechanics, review-gate text scan. Review: plan table, counts, verdict thresholds, template fill. Commit/PR/Version: PR label rules mode (globs/prefixes/ints), bump-precedence re-derivation, `NEW_TAG` pseudo-JS, OpenSpec discovery, error-report template substitution. Setup: project scan (~50 Globs + reads + 4 Bash) while `guardrails.js` already scans in Node. Jira: cache assembly from 6 MCP phases, five near-identical MCP-failure telemetry blocks. Each has its inputs in a prepare script already.

**X7 — Repetition and archaeology in the model's path (Medium).** 599 `R`-refs + 213 `#issue` refs (~2k tokens); the `<PLUGIN_ROOT>` substitution blockquote ~97× (~5k tokens; 31 in jira, 28 in ship); "omitting `model:` defaults to opus" as the stated reason in six places (wrong premise: the inherited model is the session model, often Fable 5.1 at 2.5× Opus 5.5's price); identical rules pasted 3–6× (nested-dispatch, `model:` REQUIRED, no `isolation`, Edit-tool-only, await-barrier). Keep `R<n>` traceability (AGENTS.md convention) but move it out of the semantic path (HTML comment at paragraph end); drop `#<n>`; state each rule once with its reason.

**X8 — Pressure language is moderate overall (≈1.3 caps-words per 1k words) but concentrated** in intake-verify-prompt, plan-explore-orchestrator, review-sdlc, error-report-sdlc and wave-runner-template, and in self-labelled blocks ("This is non-negotiable", "descriptive, not a competing imperative", "no authority to override") that duplicate hook-enforced behavior. The best-practices page's instruction is explicit: dial "CRITICAL: You MUST" back to "Use … when".

**X9 — Always-on description cost (Medium).** The 13 frontmatter descriptions total ~1,069 words (~1.4k tokens) in every request of every session. The five longest (version 139 words, jira 106, ship 103, execute-plan 101, pr 90) carry 20+-phrase trigger synonym lists — the "trigger-case enumeration" pattern. Rewrite to intent categories + argument list, ≤60 words each. ship-sdlc's description also disagrees with its own `argument-hint`; review-sdlc's and version-sdlc's hints under-advertise real flags.

**X10 — Per-Bash-call re-injected "continue" reminder (Medium).** `pipeline-continue.js` appends "do not end the response turn" after every Bash/TodoWrite result while a pipeline runs. That is the cadence reminder the 5.x guides say to send less often (Sonnet/Haiku 5.5 read per-step harness text after tool results as possible injection), and `stop-pipeline-continue.js` already enforces turn-end deterministically. Fire once per step transition with factual state only. `stop-plan-integrity.js` has the opposite problem: it warns on stderr with exit 0 from a Stop hook, which reaches neither the model nor a non-verbose terminal.

**X11 — Missing 5.x additions (Medium, keep-list item 11).** No worker/sub-agent prompt carries the documented Sonnet 5.5 / Haiku 5.5 verification line ("run a real check that exercises the change before reporting it done … a syntax-only check does not count"); the per-task template also says "do not go looking for it" (tool-use discouragement Sonnet 5.5 follows literally) and invites BLOCKED on mere uncertainty (amplifies Haiku 5.5 early stopping; each BLOCKED costs a higher-tier re-dispatch). ship-sdlc's sub-agent brief (SKILL.md:334–339) is the entire context a fresh agent gets and lacks the Fable 5.1 autonomy line. Nothing asks the two long-running skills for a standing progress recap.

**X12 — What is clean plugin-wide.** No "think step by step"/`<thinking>`/`<scratchpad>` scaffolds; no reasoning-reproduction fields (the four `rationale` fields ask for a short justification, which is the permitted form); no numeric output caps beyond format contracts (72-char subjects etc.); no anti-formatting or anti-narration rules in main-context skills; no hard-coded model IDs; fragile operations (git stash/commit/tag/push, `gh pr create`, GraphQL resolve, MCP payload shapes, deadline enforcement) are kept as exact scripts; skill descriptions are calibrated trigger text and were left alone; the Stop/PreCompact/SessionStart recovery design and `block-askuserquestion-auto.js` enforce in code what older plugins shouted in prose.

---

## 5. Per-file summary

Rating scale: **GOOD** (clean or minor) · **NEEDS-TUNING** (fit issues, no structural change) · **NEEDS-REWORK** (structural: dead/contradictory content or LLM doing deterministic work). "Model" is the model that reads the file. Full evidence in the named group report.

### plan-sdlc (report A)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/plan-sdlc/SKILL.md (797 l) | every plan | Opus 5.5 | NEEDS-REWORK | Material-change diff, lane merge, G1–G21 coverage union and scorecard tallying done by Opus; non-existent `run_in_background`/`mode` Agent params, `hooks/context-stats.js`, `TodoWrite`, `LSP`; change-log phrasing ("purely additive", "status quo preserved"); 34 issue refs; 13-item DO-NOT; lightweight plans pay the full 14k load |
| agents/plan-explore-orchestrator.md | full pipeline | Sonnet 5.5 | NEEDS-TUNING | Non-existent `mode: bypassPermissions`/`run_in_background`; "inherits opus" stale; invites opus discovery agents; 11-item Quality Gates restate the steps |
| lane-static-structural-prompt.md | Step 3 | Haiku 5.5 | NEEDS-TUNING | G3/G12 duplicate `validate-plan-format.js` PF4 |
| lane-file-existence-prompt.md | Step 3 | Haiku 5.5 | NEEDS-REWORK | Entire lane is `existsSync` + set intersection → script (PF11/PF12) |
| lane-content-coverage-prompt.md | Step 3 | Sonnet 5.5 | GOOD | Judgment lane; script could pre-count files/task and %Trivial |
| lane-guardrail-compliance-prompt.md | Step 3 | Sonnet 5.5 | GOOD | Dispatched even when no guardrails configured (constant output) — skip in SKILL.md |
| g17-dimension-coverage-prompt.md | Step 3 | Sonnet 5.5 | NEEDS-REWORK | Glob-match/criteria/rank/log-parse engine in prose; one real judgment step (B1–B4) stays; stale "Task tool … mode:" |
| lens-architecture / -requirements / -risk-prompt.md | Step 5 | Sonnet 5.5 | NEEDS-TUNING | Good calibration; return markdown with bracket tags while lanes return JSON (main agent regex-parses both); duplicate PF1–PF3 checks |
| plan-reviewer-prompt.md | <5-task plans | Sonnet 5.5 | NEEDS-TUNING | Stale `Task tool … mode:`; "Approved → Step 7" skips hard gates 6.5/6.6 |
| intake-verify-prompt.md | Gate A | Sonnet 5.5 | GOOD | Clean; cache-stable layout (highest caps density in plugin, but reasoned) |
| plan-format-reference.md (703 l) | author + content lane | Opus/Sonnet | GOOD | Format-pinning reference (keep); one "Superpowers" fossil bullet |
| plan-template-default.md, state-format.md | data / resume | — | GOOD | — |

### execute-plan-sdlc (report B)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/execute-plan-sdlc/SKILL.md (1,020 l) | every execution | Sonnet 5.5 | NEEDS-REWORK | ~60 spec/issue citations; same rule ×3–5 (nested dispatch, `model:` REQUIRED, no isolation); "paste the full task text" contradicts fact-sheet design; `--run-id` forbidden vs "passed"; `parseWaveSummary` bash shipped as admitted pseudocode; dead context-advisory; "compact between waves" fossil; manifest/`expectedFiles`/workspace assembly by hand; pre-wave guardrail LLM pass per wave |
| classifying-and-waving-tasks.md (458 l) | Step 2 + inlined per worker | Sonnet / workers | NEEDS-TUNING | Presets put Haiku 5.5 on Standard tasks; no verification line in either worker template; "do not go looking for it"; "feel uncertain → BLOCKED"; Edit-tool-only ×6; cache-stability HTML comment inlined into every worker prompt |
| wave-runner-template.md (251 l) | per wave | highest model in wave (can be Haiku) | NEEDS-TUNING | `attempts[]` both required and banned; non-existent `--workspace worktree`/`worktree-create.js`; 8+10 prohibition bullets about steps the runner has no tools for; runner floor should be Sonnet 5.5 |
| spec-compliance-reviewer.md | per wave + final | Sonnet 5.5 | NEEDS-TUNING | "CRITICAL: Do Not Trust Agent Reports" ×3; stale "Task tool" |
| recovering-from-failures.md | on failure | Sonnet 5.5 | GOOD | Escalation ladder lacks "same model, higher effort"; error-report lookup globs `~/.claude/plugins` (may hit another installed version) |
| state-format.md | on resume | Sonnet 5.5 | GOOD | `--run-id` contradiction; schema path is repo-root-relative |

### ship-sdlc, verify-pipeline-sdlc, harden-sdlc (report C)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/ship-sdlc/SKILL.md (1,053 l) | every ship | Sonnet 5.5 | NEEDS-TUNING | Per-step `model` without `effort`; dead context-advisory; legacy `start`/`complete` beside `begin-step`/`complete-step`; "removed" section stubs; branch-derive/archive-openspec/rebase as `node -e` choreography (~2,500 words, conditional paths loaded every run); review gate scans conversation text and approves on loss; "non-negotiable / no authority" ×4 duplicating hooks; sub-agent brief lacks autonomy + verification lines; "sub-skills are 200–550 lines" (false) |
| reference.md | on failure | Sonnet 5.5 | NEEDS-TUNING | Five Gotchas document the removed worktree mode; "received-review is always interactive" vs `--auto`; 18-item DO-NOT |
| config-format.md | on config edit | Sonnet 5.5 | NEEDS-TUNING | Documents `--preset`/`--skip` as accepted (script rejects); removed `workspace` field; three different default-step lists |
| state-format.md | on resume | Sonnet 5.5 | GOOD | Examples show rejected `skip`/`preset` flags |
| entry-modes.md | `--init-config`/`--gc`/`--dry-run` | Sonnet 5.5 | GOOD | `--workspace prompt` likely rejected |
| skills/verify-pipeline-sdlc/SKILL.md (92 l) | CI failure | Sonnet 5.5 | GOOD | Add "run the failing check before emitting fix-applied" |
| skills/harden-sdlc/SKILL.md (420 l) | after failure | Sonnet 5.5 | NEEDS-TUNING | Copilot-mirror 40-line deterministic sequence; rule stated ×3 in bold; repo-wide Glob for a path the manifest already carries |
| agents/harden-orchestrator.md | dispatch | Haiku 5.5 | GOOD | "no chain-of-thought" dead on thinking-on model; explicit 2-iteration self-critique loop |

### review-sdlc, review-orchestrator, received-review-sdlc (report D)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/review-sdlc/SKILL.md (259 l) | every review | Sonnet 5.5 | GOOD | The thin-dispatcher model to copy; "trap declared at Step 1" (it is Step 0); `argument-hint` under-advertises 4 flags; 4-item DO-NOT restating one rule |
| review-sdlc/REFERENCE.md §2 (subagent template) | every dimension subagent | Haiku/Sonnet/Opus 5.5 | NEEDS-TUNING | "Review ONLY … do not read other files" contradicts shipped `_common.md` ("search the entire changeset, scan git history, flag when in doubt"); no reportability bar, so the 20-finding cap becomes a quota; dynamic paths mid-prefix defeat the orchestrator's own cache-stability rule |
| review-sdlc/EXAMPLES.md | setup / users | — | GOOD | `_common.md` example's "flag when in doubt" is the wrong failure mode for 5.5 reviewers |
| agents/review-orchestrator.md | every review | Sonnet 5.5 | NEEDS-TUNING | Doc says opus; await-barrier stated ×5; "defaults to opus" stale; plan table/counts/verdict/template fill by LLM; "zero findings credibility" asks it to read a diff it is forbidden to read; globs `~/.claude` for REFERENCE |
| skills/received-review-sdlc/SKILL.md (732 l) | on trigger | Opus 5.5 | NEEDS-TUNING | 2026-03-era anti-sycophancy scaffolding (forbidden-opener list, four "process silently" banners, trust tiers, loop counters); ~1,100 words of R18/R25 matrix duplicated; `--output-file` flag not parsed by `received-review.js` (verify); A/B Opus 5.5 `medium` vs Sonnet 5.5 `high` |
| .sdlc/review-dimensions/*.md (project) | per dimension | per `model:` | GOOD | Three opus dimensions unmeasured vs sonnet/high; no `effort:` field in the schema |

### commit, pr, version, error-report (report E)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/commit-sdlc/SKILL.md (352 l) | every commit | **Haiku 5.5 (skill-level pin)** | NEEDS-TUNING | Claims a "load-bearing" post-generation `^wip` regex that `commit.js` does not have; claims a persistent manifest under `.sdlc/execution/` that `lib/output.js` never writes (the stated reason for the missing cleanup trap); DO-NOT "skip Step 3" vs "orchestrator owns Step 3"; branch-guard step unreachable (script exits 3 first, undocumented) |
| agents/commit-orchestrator.md | dispatch | Haiku 5.5 | GOOD | Right shape; `effort: low` candidate; drop "chain-of-thought"/iteration cap wording |
| skills/pr-sdlc/SKILL.md (638 l) | every PR | Sonnet 5.5 | NEEDS-TUNING | Rules-mode label matching by LLM; `/pr` command and `pr.md` do not exist; version-skew gotcha tells the model to override the prepare script; 50 lines of config examples loaded every PR; only skill in group without an orchestrator |
| skills/version-sdlc/SKILL.md (561 l) | every release | **Haiku 5.5 (skill-level pin)** | NEEDS-TUNING | Longest procedure in the group on the model most prone to early stopping; bump-precedence re-derivation and `NEW_TAG` pseudo-JS; `/version` command does not exist; `--init`/`--bump` missing from hint; spec commentary in runtime prose |
| version-sdlc/changelog-workflow.md, init-workflow.md | on demand | Haiku 5.5 | GOOD | init:140 tells the model to call a JS function (`writeSection`) — needs an exact command |
| skills/error-report-sdlc/SKILL.md (193 l) | error path | Sonnet 5.5 (pin forbidden by its own DO-NOT) | NEEDS-TUNING | SKILL.md + REFERENCE.md always both loaded for one linear flow; "trap declared at Step 1" (it is Step 3) |
| error-report-sdlc/REFERENCE.md | with SKILL | Sonnet 5.5 | NEEDS-TUNING | Placeholder table duplicated and drifted vs orchestrator; priority rule lives only here; Glob path the Read-only agent cannot use |
| error-report-sdlc/templates/ToolingError.md | orchestrator | Haiku 5.5 | GOOD | — |
| agents/error-report-orchestrator.md | dispatch | Haiku 5.5 | NEEDS-REWORK | Reads the template from `PROJECT_ROOT` — works only inside this repository; fix by inlining `templateText` in the prepare script |

### jira-sdlc, setup-sdlc (report F)

| File | Loads | Model | Rating | Headline |
|---|---|---|---|---|
| skills/jira-sdlc/SKILL.md (640 l) | every Jira op | Sonnet 5.5 | NEEDS-REWORK | Still operates the deleted payload-hash / critique-artifact / approval-token / PreToolUse-hook subsystem (spec R21, commit 4013a96; line 582 admits removal): two dead Node spawns per write and ~70 unreachable lines; 23-line DO-NOT; five near-identical MCP-failure blocks; read-only ops pay for the whole write pipeline |
| jira-sdlc/operations-reference.md | always | Sonnet 5.5 | NEEDS-TUNING | Same dead hook/hash steps restated in six procedures |
| jira-sdlc/REFERENCE.md (596 l) | on demand | Sonnet 5.5 | GOOD | Man-page quality MCP contract (keep/grow); §4 bans `- [ ]` while R25 + 6 templates require it; always-live transitions vs cache-first skill |
| jira-sdlc/EXAMPLES.md (655 l) | never referenced | — | NEEDS-REWORK | Gold examples use free-form descriptions R18 forbids and serial bulk creation; fix or delete |
| jira-sdlc/templates/*.md (9) | on create/edit | Sonnet 5.5 | GOOD | — |
| skills/setup-sdlc/SKILL.md (734 l) | every setup | Sonnet 5.5 | NEEDS-REWORK | ~125 lines for removed `workspace`/`hooks` sections (scripts deleted #378/#379, #370/#372); phantom `--auto`; Step 1 "plain chat, NOT AskUserQuestion" vs DO-NOT "never skip AskUserQuestion"; stale step numbers; `received-review` missing from id lists; project scan = ~50 Globs by LLM while `guardrails.js` scans in Node |
| setup-dimensions.md | on selection | Sonnet 5.5 | NEEDS-TUNING | "CRITICAL — simulation context" banner written for the promptfoo harness; `review-init-sdlc` (removed) as error-report skill; `~/.claude` Glob vs `<PLUGIN_ROOT>` |
| setup-guardrails.md, setup-execution-guardrails.md | on selection | Sonnet 5.5 | GOOD | Right split (script proposes, model filters); merge into one parameterized file; repo promptfoo policy copied into end-user files |
| setup-pr-labels.md | on selection | Sonnet 5.5 | GOOD | Gate references nonexistent `schemas/sdlc-config.schema.json` |
| setup-pr-template.md | on selection | Sonnet 5.5 | NEEDS-TUNING | `mkdir -p .claude` before writing to `.sdlc/`; Gotchas prescribe parent behavior the parent lacks; two opposite recoveries for one error |
| setup-openspec.md, setup-plan-template.md, dimension-catalog.md | on selection | Sonnet 5.5 | GOOD | — |
| scan-patterns.md | parent scan | Sonnet 5.5 | NEEDS-TUNING | 50 glob patterns as an instruction to run them → data for the scan script |

### hooks, manifests, cost-tier logic (report G)

| File | Fires / loads | Rating | Headline |
|---|---|---|---|
| .claude-plugin/marketplace.json, plugin.json | install | GOOD | Descriptions describe an early version ("pull requests and code reviews", "Skills and commands") |
| hooks/hooks.json | — | NEEDS-TUNING | Timeouts 3000/5000/10000 in a seconds field; PostToolUse on every Bash call; three Stop processes per turn |
| hooks/session-start.js | every session | GOOD | ~40–150 tokens, every line a fact; LF-only frontmatter regex ("0 skills loaded" on CRLF); installed-version skew leaves no plugin-root fallback |
| hooks/block-askuserquestion-auto.js | AskUserQuestion | GOOD | Reason string carries caps + "R71/#477" |
| hooks/post-tool-validate.js | Edit/Write | GOOD | Comment promises a removal not made |
| hooks/pipeline-continue.js | every Bash/TodoWrite in pipeline | NEEDS-TUNING | Per-tool-call reminder; fire once per step transition |
| hooks/pre-compact-save.js, stop-state-save.js | PreCompact / Stop | GOOD | 90 duplicated lines between them |
| hooks/stop-pipeline-continue.js | Stop | GOOD | Correct deterministic backstop; confirm 3-block cap against real Fable 5.1 runs |
| hooks/stop-plan-integrity.js | Stop | NEEDS-TUNING | stderr + exit 0 reaches nobody |
| hooks/README.md, scripts/README.md | developer docs | GOOD / NEEDS-TUNING | scripts/README lists `util/worktree-create.js` (missing) and omits three skills' scripts |
| scripts/lib/context-advisory.js | plan/execute/ship handoff | NEEDS-REWORK | Producer hook does not exist (X1) |
| scripts/lib/dispatch-budget.js | execute waves | NEEDS-TUNING | "Claude 4 family 200K" → 5× under-packed waves |
| scripts/ci/validate-cost-tiers.js + docs/cost-tiers.md | CI | NEEDS-REWORK | Drift, missing rows, CRLF-inert, 4.x rationale, no effort (X2) |

---

## 6. Prioritized action plan

> **Superseded by the consolidated plan** — see [`../03-plan/consolidated-plan.md`](../03-plan/consolidated-plan.md); the disposition of each item below is in its [§4.1 table](../03-plan/consolidated-plan.md#41-readme-6-items-132).

Ordered by impact per unit of work. Finding IDs refer to the group reports (A…, B…, C…, R/F/S/E/V/H/O…, X…). Each phase ends with the effect it is expected to have, drawn from section 7; the dollar and token figures are estimates until Phase 1 item 1 makes them measurable.

### Phase 1 — Make it measurable, then correctness and cost quick wins (hours; one-line to one-paragraph edits)

1. **Add token/usage accounting first**: record per-step usage in ship state (`complete-step --usage`) and per-dispatch usage in execute-plan wave summaries, so every later change in this plan has a before/after (C group summary; the method's last check is "no token accounting → every other issue is invisible").
2. **Hook timeouts to seconds** — `hooks.json` 3000/5000/10000 → 3/5/10 (X3).
3. **Remove the four skill-level `model:` pins** on commit-sdlc, version-sdlc, pr-sdlc, error-report-sdlc (X5; E group summary 1). Keep the pins on the orchestrator agents.
4. **Fix `dispatch-budget.js`** for 1M-context models; cap haiku near 100K for the rate card; keep the 0.75 reserve; move the limits to config so they do not fossilize again (B29, G).
5. **Reconcile `docs/cost-tiers.md`** with frontmatter (review-orchestrator = sonnet; add verify-pipeline-sdlc and plan-explore-orchestrator rows; fix the `scripts/skill/execute.js` reference); make `extractFrontmatter` and `session-start.js` `\r?\n`-tolerant so the CI guard and the session banner work on CRLF checkouts (X2, D).
6. **Delete the dead context-advisory path**: three SKILL.md paragraphs, `getAdvisory` call sites, `plan-handoff-advisory.js` usage (X1; A, B1, C1).
7. **error-report-orchestrator template path**: have `error-report-prepare.js` inline `templateText`; drop the `PROJECT_ROOT` path and the REFERENCE Glob (E group summary 3). Without this the skill fails in every consumer project.
8. **commit-sdlc false claims**: implement the `^wip` subject gate in the Step 5 `node -e` check or delete the paragraph; replace the "persistent manifest" comment with the standard `trap` (E1, E2).
9. **Add the verification line** to both execute-plan worker templates, ship's sub-agent brief and verify-pipeline; rewrite "do not go looking for it" and the "feel uncertain → BLOCKED" trigger; add the Haiku "keep working until every task is done" line to the batched template (B14, B23, B24, B26, C16, V1).
10. **Add `effort` at every dispatch site that already passes `model`**: `ship.js` step objects (start: execute high, review/received-review medium, commit/version/pr low), review dimension schema + `review.js` passthrough (default medium), execute-plan presets, `effort: low` on the three Haiku orchestrators, and "same model, higher effort" as the first rung of the execute-plan escalation ladder before switching tier (X4; C2; D routing; E; B39).
11. **`pipeline-continue.js` once per step transition** with factual state only (persist last-nudged step in the sidecar); `stop-plan-integrity.js` exits 2 (or emits a capped block) instead of stderr + exit 0 (X10).
12. **Shorten the five longest skill descriptions** to intent categories + arguments (≤60 words); align `argument-hint` with real flags on ship, review, version, commit (X9; C19; D; E).

*Expected effect:* removes an unbounded hang risk and two outright failure paths (error-report in consumer projects, CRLF-inert CI); the `effort` and tier changes are the largest cost lever in the audit (Sonnet dimensions and sub-skills off implicit `high`, Haiku orchestrators to `low`); ~500 always-on tokens per request saved; the per-Bash-call reminder (~35 tokens × hundreds of calls per execute step, plus the Sonnet/Haiku 5.5 injection-hesitation trigger) gone; dispatch budget up to 5× more tasks per wave on large plans.

### Phase 2 — Remove stale text, resolve contradictions, restore progressive disclosure (days; proposed diffs in the group reports)

13. **jira-sdlc**: remove the hash/critique-artifact/approval-token steps, the hook-block telemetry block, and rewrite G13/G15 and operations-reference steps 5–7; collapse the five MCP-failure blocks to one gate; split the write pipeline into `write-ops.md` loaded only for write classes; fix REFERENCE §4 task-list row and the transitions rule; rewrite or delete EXAMPLES.md (F summary 1, 4). `lib/artifact-store.js` and `lib/payload-hash.js` then have no consumer.
14. **setup-sdlc**: delete §3.workspace and §3.hooks, the legacy section table, the phantom `--auto`; reconcile the AskUserQuestion rule; fix step numbers and id lists; remove the "simulation context" banner, `review-init-sdlc`, `mkdir -p .claude`, the nonexistent schema gate, the promptfoo policy lines; merge the two guardrails sub-flows into one parameterized file (F summary 2, 5).
15. **ship-sdlc**: fix C1, C11, C12, C15; remove worktree Gotchas (R1), "always interactive" (R2), `--preset`/`--skip`/`workspace` from config-format and state-format examples (F1, F2, S1); collapse the four "non-negotiable" restatements and the hook-describing block-quotes to one sentence each (C3–C6); move archive-openspec, verify-pipeline, await-remote-review, rebase and plan-mode-blocked sections to on-demand files read only when the step is `will_run` (C8, C9, C10).
16. **execute-plan-sdlc**: fix the contradictions (B9/B10 paste-full-text, B15/B31/B46 `--run-id`/`attempts[]`, B17 pseudocode bash, B40 `~/.claude/plugins` glob, B43 "Task tool"); state nested-dispatch, `model:` REQUIRED, no-isolation and Edit-tool-only once each with reasons (B3–B5, B22); drop the "compact between waves" fossil (B7) and the two state-dir paragraphs from the worker templates (B25); runner floor Sonnet 5.5 (B35); move OpenSpec flip/archival, `--commit-waves` and the post-compact discriminator to on-demand files.
17. **plan-sdlc**: remove non-existent Agent params and tool names; rewrite the change-log phrasing (A SKILL.md 149, 566, 570); drop `#<n>` refs and the author-facing "canonical wording" note; trim the DO-NOT list to reasoned items; move the full-pipeline dispatch contracts (lane/lens variable tables, merge rules, scorecard) and the OpenSpec flow to reference files loaded on their branches.
18. **review**: let dimension reviewers read to confirm, report only in scope, add a reportability bar, replace "flag when in doubt"; restructure §2 so per-run paths sit in the tail (cache-stable prefix across N dispatches); state the await barrier once; fix "defaults to opus" and the `~/.claude` glob (D summary 1, 4).
19. **received-review-sdlc**: one "your checks are internal" line instead of four banners; keep the positive reply format and drop the forbidden-opener list and trust tiers; dedupe the R18/R25 matrices to the Configuration section; verify `--output-file` (D summary 5). Update spec C8/R13 wording to match.
20. **pr-sdlc / version-sdlc**: remove `/pr`, `pr.md`, `/version` references and the version-skew gotcha; move the 50-line config-example block and the Limitations section to `docs/skills/`; delete the bump-precedence re-derivation in favour of the script's `requestedBump`; give init-workflow an exact command instead of "call `writeSection`" (E).
21. **Plugin-wide**: state the `<PLUGIN_ROOT>` rule once per skill with a one-sentence fallback for installs that lack the banner line; move `R<n>` references to HTML comments and drop `#<n>`; rewrite the six "defaults to opus" reasons; replace "no chain-of-thought" in the three Haiku orchestrators with "output only the JSON/message"; fix `scripts/README.md` paths and the two manifest descriptions (X7, X8, G).

*Expected effect:* ~25–30k fewer tokens across plugin loads (≈10–12k on the plan → execute → ship stack); common paths of the three largest skills down to ~5–8k, which is what survives the 5,000-token post-compaction re-attach; every High-confidence contradiction and nonexistent path in the report closed, so no run spends thinking on reconciling rules or fails on a command that cannot work; 2 Node spawns and ~30 output lines saved per Jira write; read-only Jira ops stop paying for the write machinery.

### Phase 3 — Move deterministic work into scripts (a sprint; largest reliability and cost gains)

22. **plan.js**: `--merge-lanes`, `--diff-material`, `--g17-prepare` (glob matching, criteria, ranking, learnings-log window); add PF11/PF12 to `validate-plan-format.js` and delete the file-existence lane; drop G3/G12 from the static lane; skip the guardrail lane when no guardrails; lenses return the same JSON envelope as lanes so the scorecard is script-built (A summary 1).
23. **state/execute.js**: `build-waves` / `emit-manifest` (field extraction, manifest assembly, `expectedFiles` union, workspace via `deriveWorkspace`); drop the pre-wave guardrail LLM pass (B13, B18, B20).
24. **ship.js**: `branch-prepare`, `rebase-step`, an `openspec-archive-step.js`, and a `review-gate` that consumes structured counts instead of scanning conversation text (C7–C10, C17).
25. **review**: subagents return findings JSON; `review-consolidate.js` renders plan table, counts, verdict and the §3 template (D orchestrator).
26. **pr.js / version.js / setup.js / jira.js**: rules-mode label matching and OpenSpec discovery in `pr.js`; project scan in `setup.js` sharing `guardrails.js`'s detector (replaces ~50 Globs + 4 Bash per run); `jira.js --assemble` for cache building (E, F).
27. **harden-sdlc**: `dimension-to-instructions.js --write-mirror` (H1).
28. **Hooks housekeeping (optional)**: one Stop entry that reads state once for save + block + plan-integrity; gate `pipeline-continue` on `.sdlc/execution/` existence before spawning `git`; extract the duplicated recovery-object builder into `lib/state.js` (G).

*Expected effect:* 1–2 fewer LLM dispatches per plan run and G17 reduced to a small call (tens of cents per full pipeline); ~50 tool calls removed per setup run (order of $0.5–1 and minutes of wall-clock); 2–3 tool calls per PR; the branch/archive/rebase shell-quoting failure surface and the "verdict not computed from counts" class of bugs eliminated; ~2,500 words off ship's common path and several hundred lines of prose across the plugin, with the model left exactly the judgment calls (task classification, drift critique, dedupe/calibration, PR narrative, changelog draft).

### Phase 4 — Measure and re-tune (ongoing)

29. Run the existing promptfoo suites (user-initiated per AGENTS.md policy) after Phases 1–2; compare the usage figures from item 1 before and after each phase.
30. A/B the contested model choices on 3–5 real artifacts each: received-review Opus 5.5 `medium` vs Sonnet 5.5 `high`; the three opus review dimensions vs sonnet/high; plan lenses sonnet vs opus; plan author opus vs sonnet at `high`; execute-plan Speed preset Sonnet 5.5 `low` vs Haiku 5.5. Judge cost per completed task, not per token.
31. Confirm the 3-block Stop cap against real Fable 5.1 ship runs (count blocks only when the state file is unchanged), and whether the Haiku batched-trivial path still earns its place after item 9.
32. Re-run this audit at each model release; each new migration section in the Claude docs is a removal checklist for the previous generation's workarounds.

---

## 7. Text reduction: what to remove or move, and what it is worth

> **Superseded by the consolidated plan** — see [`../03-plan/consolidated-plan.md`](../03-plan/consolidated-plan.md); the disposition of each item below is in its [§4.1 table](../03-plan/consolidated-plan.md#41-readme-6-items-132).

Consolidates the per-file efficiency notes from the group reports into one view. Three columns distinguish the three kinds of edit the method allows: **delete** (obsolete or repository-contradicted instructions, High confidence), **lighten** (repetition, archaeology, pressure register), **move** (into an on-demand reference file, or into a prepare script). Contract text, exact scripts for fragile operations, reasoned prohibitions and calibrated trigger text are not in this table — the keep list protects them.

| File (tokens per load) | Delete | Lighten | Move to reference file / script | Saving per load |
|---|---|---|---|---|
| execute-plan-sdlc/SKILL.md (~17.9k) | dead context-advisory; "compact between waves" fossil; "paste the full task text" (contradicts fact sheets); `--run-id` contradiction; pseudocode bash block | 6 rules stated ×3–6; ~60 R/# refs; "defaults to opus" | OpenSpec flip/archival (~2.5k), `--commit-waves`, post-compact discriminator; manifest/`expectedFiles`/workspace → `state/execute.js` | ~4–5k + ~1k per wave; wave-runner 4k → 2.5k |
| plan-sdlc/SKILL.md (~14.5k) | nonexistent `run_in_background`/`mode`, `TodoWrite`, `LSP`, context-stats hook | change-log phrasing, 34 issue refs, 3 copies of the parallel nudge, 13-item DO-NOT | lane/lens dispatch contracts and OpenSpec flow → reference files; merge/diff/scorecard → `plan.js` | lightweight plans 14.5k → ~5k (they use <30% today) |
| ship-sdlc/SKILL.md (~13.5k) + reference/config/state | removed worktree mode; `--preset`/`--skip` "accepted"; legacy `start`/`complete`; two "removed" stubs; "200–550 lines" | "non-negotiable / no authority" ×4; hook-describing block-quotes; 19 issue refs | archive-openspec, verify-pipeline, await-remote-review, rebase → on-demand files; branch/archive/rebase `node -e` → `ship.js` subcommands | common path 13.5k → ~7–8k; reference.md 1.9k → 1.4k words |
| jira-sdlc/SKILL.md (~8k) + operations-reference (~2.4k) | the deleted hash/artifact/hook subsystem (~70 lines + telemetry block); G13/G15 claims | 23-line DO-NOT; five near-identical MCP-failure blocks (~70 lines); "When to Use" duplicating the description | write pipeline → `write-ops.md` so read-only ops skip it; cache assembly → `jira.js --assemble` | ~2k + 2 Node spawns and ~30 output lines per write |
| setup-sdlc/SKILL.md (~7.5k) | §3.workspace + §3.hooks (~125 lines); phantom `--auto`; legacy section table | 31 migration-relative phrases | project scan (~50 Globs + 4 Bash) → `setup.js` | ~1.9k + ~50 tool calls per run |
| received-review-sdlc (~6.6k, Opus) | — | four "process silently" banners, forbidden-opener list, trust tiers; R18/R25 matrices duplicated (~1,100 words) | — | ~1.5–1.7k on the most expensive tier |
| pr-sdlc (~6.9k) | `/pr`, `pr.md`, version-skew gotcha | — | 50 lines of config JSON examples → docs; label rules + OpenSpec discovery → `pr.js` | ~1.2k + 2–3 tool calls per PR |
| version-sdlc (~6.9k, Haiku) | `/version`; spec commentary | duplicate retag note | bump-precedence / `NEW_TAG` (already in `version.js`); Limitations section → docs | ~950 |
| Plugin-wide | "defaults to opus" ×6 | `<PLUGIN_ROOT>` block ~97× (~5k total); 599 R + 213 # refs (~2k); "no chain-of-thought" ×3 | — | 0.5–1.6k per large skill |
| 13 skill descriptions (always in context) | — | 20+-phrase trigger synonym lists in the 5 longest | — | ~500 per request, every session |

Total: roughly 25–30k fewer tokens across plugin loads, of which ~10–12k on the plan → execute → ship stack (≈45k today).

### Effect, by class

**1. Token cost of the text itself — modest.** Claude Code injects a skill body once and serves it from the prompt cache afterwards (cache reads: Sonnet 5.5 $0.20/MTok, Fable 5.1 $0.25). Ten thousand surplus tokens carried across 300 turns of a long ship run is ~3M cached tokens, under a dollar. The one place where pure text volume is visible at scale is the always-on description set (~500 tokens × every request × every session in every project with the plugin installed).

**2. Cost and wall-clock of removed dispatches and tool calls — substantial.** This is the real financial effect, and it comes from the *move* column, not from shorter prose:
- plan-sdlc: 1–2 fewer LLM dispatches per run (file-existence lane; guardrail lane when no guardrails are configured), and G17 shrinks from "read every dimension file, Copilot instruction file, the plan and the learnings log" to a small call. Order of tens of cents per full pipeline.
- setup-sdlc: ~50 Glob calls, each a Sonnet 5.5 turn at `high` effort over a growing context — order of $0.5–1 and several minutes per dimensions/PR-template run, replaceable by one script.
- jira-sdlc: two dead Node spawns and ~30 output lines per write operation.
- execute-plan: `dispatch-budget.js` at 200K instead of 1M under-packs waves up to 5×, so more wave-runner dispatches (each ~4k template + 2.3k per worker + code reads). Bounded by the static 4/5/6 cap table, so it bites mostly on plans with large fact sheets.
- `effort` is set nowhere: review dimensions on Sonnet run at an implicit `high` where `medium` is the documented start; the three Haiku orchestrators are `low`-effort tasks. This is the single largest cost lever and costs no text at all.

**3. Behavior — the main gain, and not measured in tokens.** Obsolete instructions here are not dead weight; they actively misdirect:
- Contradictions (jira: "the hook blocks writes" and, in the same file, "the hook was removed"; execute: "paste the full task text" vs "never inline it"; setup: "do not use AskUserQuestion" vs "never skip AskUserQuestion") make Sonnet 5.5, which follows instructions literally, spend thinking on reconciliation and choose unpredictably.
- Nonexistent paths, flags and commands are failed runs: error-report-orchestrator reads its template from `PROJECT_ROOT` and works in no project but this repository; `mkdir -p .claude` before writing to `.sdlc/`; a quality gate on a schema file that does not exist.
- Repeated CAPS rules and the "non-negotiable" register are documented to bleed into output tone and to over-trigger on 4.6+ models.
- The per-Bash-call "do not end the response turn" injection is the documented prompt-injection-suspicion trigger on Sonnet/Haiku 5.5, while the Stop hook already enforces the same thing deterministically.
- The missing "run a real check before reporting done" line in worker prompts is a documented Sonnet/Haiku 5.5 gap at low effort — text to add, not remove.

**4. Robustness under compaction.** After compaction Claude Code re-attaches only the first ~5,000 tokens of each skill. For execute-plan (17.9k), plan (14.5k) and ship (13.5k) that drops exactly the tail — error handling, resume, handoff — in the long runs where it is needed. Bringing the common path down to ~5–8k with conditional branches in reference files is protection against degradation on long tasks, not an optimization.

**Caveat.** None of the dollar figures were measured on this plugin; the repository keeps no token accounting (hence Phase 1 item 1). Sequence: Phase 1 first (twelve targeted edits, starting with usage accounting, then `effort` and the dead paths), measure on the promptfoo suites and 3–5 real runs, then the Phase 2 text clean-up and the Phase 3 script moves.

---

## 8. Notes on confidence and scope

- Findings marked High are grounded either in the repository (a path, flag, script or section that does not exist; two files that rule oppositely on the same point) or in documented behavior of the target model. Medium findings rest on consistently observed behavior described in the Anthropic guidance; Low findings are idiom-dating and were left as flags.
- Two items deserve a maintainer cross-check before acting: the hook `timeout` unit (the Claude Code hooks reference says seconds; the plugin's values read as milliseconds) and whether `received-review.js` ignores `--output-file` as the Group D reviewer observed.
- The per-model behavioral claims (Haiku 5.5 early stopping, Sonnet 5.5 literal tool-use discouragement, Opus 5.5 `medium` default, Fable 5.1 under-narration and whole-file rewrites) are taken from Anthropic's model-specific prompting guidance as bundled in the claude-api skill on 2026-10-15; they are the right starting point but should be confirmed on this plugin's own promptfoo evals before any removal that touches a safety gate.
- Out of scope: the promptfoo test suites themselves, `site/`, `docs/skills/*.md` user docs (except where a skill file points at them), and the JavaScript beyond what the instruction files reference.
