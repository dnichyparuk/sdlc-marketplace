# Group C audit — ship-sdlc, verify-pipeline-sdlc, harden-sdlc, harden-orchestrator

Audit date 2026-10-15. Targets: `model: sonnet` → Claude Sonnet 5.5 (ship, verify-pipeline, harden); `model: haiku` → Claude Haiku 5.5 (harden-orchestrator). Ship's companion files load on demand into the ship context, so they are audited against Sonnet 5.5. Keep-list applied: exact shell for git/gh/state ops, tool contracts, reasoned prohibitions, frontmatter trigger text, and working redundancy are not findings.

---

## plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md

**Summary.** Pipeline state machine: runs `scripts/skill/ship.js` to pre-compute flags/steps, dispatches sub-skills as Agents (`execute`, `commit`, `review`, `received-review`, `commit-fixes`, `version`, `pr`), runs other steps inline via Bash (`verify-openspec`, `archive-openspec`, `verify-pipeline`, `await-remote-review`, `learnings-commit`, `cleanup`), records state via `scripts/state/ship.js`. Loads on `/ship-sdlc` or "ship it". 1,053 lines / 9,569 words (~13–14K tokens), read by Sonnet 5.5 in main context on every ship run. Largest instruction file in the plugin.

**Assessment — NEEDS-TUNING.** Architecturally close to the recommended shape: flag merging, step composition, skip provenance, todo rendering, state transitions, tag verification and GC all live in scripts, and the prose repeatedly says "the LLM does not compute this." Problems: (1) incident-archaeology and pressure language accreted over ~19 issues that Sonnet 5.5 reads as literal signal; (2) per-step model routing pinned at alias level (`opus`/`sonnet`/`haiku`) with no `effort`, so the costliest step (`execute` on Opus 5.5) runs at the harness default while cheap steps also carry none; (3) stale references (`hooks/context-stats.js`, `util/worktree-create.js`, removed `worktree` mode, legacy `start`/`complete` subcommands) contradicting current scripts; (4) ~35–40% of the file is conditional-path choreography (archive-openspec, verify-pipeline, await-remote-review, rebase, learnings-commit, plan-mode-blocked) paid for on every load although the file already uses progressive disclosure for `reference.md`/`entry-modes.md`.

### Findings

| # | Location | Evidence | Pattern | Why it matters on Sonnet 5.5 | Conf. | Action |
|---|---|---|---|---|---|---|
| C1 | SKILL.md:89 | "Sourced from `$TMPDIR/sdlc-context-stats.json`, written by the `UserPromptSubmit` hook (`hooks/context-stats.js`)" | 2 volatile specifics | `hooks/context-stats.js` does not exist; `hooks.json` registers no `UserPromptSubmit` hook. The sentence documents an unshipped mechanism. | High | rewrite → "If `contextAdvisory` is a non-empty string, print it verbatim before continuing; when null, emit nothing." |
| C2 | SKILL.md:332; reference.md:41 | "Pass `model: step.model` to the Agent tool on every dispatch." / "Omitting it defaults all steps to opus." | 4 model/effort routing | `ship.js` routes execute→opus, commit/commit-fixes/archive→haiku, review/received-review/version/pr→sonnet, with no `effort`. On 5.5 effort is the primary cost lever and defaults differ per tier (Opus 5.5 and Haiku 5.5 `medium`, Sonnet 5.5 `high`). `review` and `pr` therefore run Sonnet at implicit `high` for work where `medium`/`low` is the documented start. The Agent tool accepts `effort`; `ship.js` already computes `model` per step. | Med | add → emit `effort` beside `model` in `ship.js` step objects (starting points: execute `high`, review `medium`, received-review `medium`, commit/commit-fixes/archive `low`, version `low`, pr `low`); SKILL.md:332 → "Pass `model: step.model` and, when non-null, `effort: step.effort`." Measure before tightening. |
| C3 | SKILL.md:298, 302; reference.md:38, 68 | "This is non-negotiable." / "The LLM does not have authority to override… Printing a skip message for a 'will_run' step is a pipeline violation." | 1a pressure + 1d patch accretion (#68) | Legitimate constraint (review skipped as "just docs", #68) stated four times with escalating register; `cleanup-pipeline` already enforces it in code. Repeated "no authority / violation" framing is the anxious register that bleeds into output. | Med | rewrite → one statement at 298: "Dispatch every `will_run` step as computed by `ship.js`, even when the change looks low-risk — the pipeline's value is catching cases the developer under-estimates (issue #68). `cleanup-pipeline` fails the run if a `will_run` step was not resolved." Remove 302 and reference.md:38; keep reference.md:68 as the Gotcha. |
| C4 | SKILL.md:330 | "**Do NOT end the response turn here (R70/#454).** … the recurrence of #452 / #454 that the `stop-pipeline-continue.js` Stop hook now guards against mode-independently." | 1d patch accretion; enforced in code | Two hooks (`pipeline-continue.js`, `stop-pipeline-continue.js`) enforce this; the prose repeats the hook's job plus incident narrative. | Med | rewrite → "`begin-step` and the Agent dispatch are one uninterrupted sequence; do not end the turn between them (the Stop hook blocks such turns)." |
| C5 | SKILL.md:355–357 | Two block-quotes self-labelled "descriptive, not a competing imperative", naming R67/R68/R70/R71 and #477, describing three hooks | 1d history narrative / 1c padding | The hook text (`pipeline-continue.js:98–108`, `stop-pipeline-continue.js:203`) reaches the model at the right moment. The self-label shows the author sensed the prose competes with the hooks; Sonnet 5.5 reconciles every sentence. | Med | move → one-line pointer in SKILL.md; full hook description to reference.md. |
| C6 | SKILL.md:239 | "In `--auto` mode NEVER call `AskUserQuestion` at this boundary … enforced deterministically by the `block-askuserquestion-auto.js` PreToolUse hook" | 1a pressure; enforced in code | A PreToolUse hook denies the call; caps add nothing; rule repeated at 357. | Med | rewrite → "In `--auto` mode dispatch `received-review-sdlc --auto` directly (the PreToolUse hook denies `AskUserQuestion` while an auto pipeline is advancing)." Remove the 357 duplicate. |
| C7 | SKILL.md:426–500 | `node -e` with literal placeholders `'<logical-type>'`, `'<derived-slug>'`; 12-line `node -e` patching `--expected-branch` into the prepare file; 10-line comment ending "…defeat the branch-drift protection from #347/#348/#349" | 4 LLM executor for deterministic plan (+1d) | Model must infer type/slug from the plan title, splice into JS, then rewrite prepare JSON. Both deterministic given the plan; shell-escaping of titles becomes the model's problem. `lib/branch-name.js` already exists. | Med | move → `ship.js branch-prepare --plan <path>` (derive name, migrate state, checkout, patch `--expected-branch`); SKILL.md keeps one command + two-line rationale (leave `git checkout -b` visible if desired). |
| C8 | SKILL.md:655–750 | archive-openspec: 9 sub-steps, six `node -e` heredocs (`isArchived`, `getTaskCounts`, `syncIncompleteTasks`, `validateChangeStrict`, `runArchive`), env-var discipline restated each time | 4 LLM executor / 1c choreography | Every call is a pure function of `(root, changeName, userChoice)`; the only judgment is the sync/archive prompt. ~1,300 words loaded on every run, executed only when an OpenSpec change matches. All primitives exported by `lib/openspec.js`. | Med | move → one `openspec-archive-step.js --change --auto --decision <sync\|anyway>`; keep trigger condition, the two AskUserQuestion texts, the three `complete-step --result` strings, halt semantics. Minimum: move section to `openspec-steps.md` read only when the step is not skipped. |
| C9 | SKILL.md:752–814 | verify-pipeline / await-remote-review branch tables | 1c (right idea, wrong location) | Correctly delegate to scripts but are opt-in steps loaded on every run. | Low | move → `post-pr-steps.md`, read when either step is `will_run`. |
| C10 | SKILL.md:839–889 | Unconditional rebase choreography; "Note: in a worktree, all of this is safe — main working tree is untouched." | 2 volatile specifics / 1d fossil / 4 | `flags.rebase` ('auto'\|'skip'\|'prompt') is computed by `ship.js:286–290` but never read here — section runs unconditionally. Worktree note is a fossil of removed R60 mode. Mechanics are deterministic. | Med | rewrite → gate on `flags.rebase`; script the mechanical part (`ship.js rebase-step` → `{status, files[]}`); keep the interactive prompt and auto-mode halt message; delete worktree note. |
| C11 | SKILL.md:904–907 | "Before each step: `state/ship.js start` / After each step: `complete …`" | 2 contradiction (internal) | Lines 383–409 say `begin-step`/`complete-step` *replace* `start`/`complete`. Both pairs exist in `state/ship.js`; following 904–905 double-records or skips todo rendering. | High | rewrite → "Step transitions use `begin-step`/`complete-step` (see TodoWrite orchestration). Remaining subcommands: `skip`, `fail`, `decide`, `defer`." |
| C12 | SKILL.md:570–574, 1009–1011 | "### Post-execute note (R37 migration moved pre-execute)… has been removed"; "### Worktree cleanup (removed — …)" | 1d migration-relative phrasing | Headings that exist only to say a section was removed. | High | remove both stubs. |
| C13 | SKILL.md:13 (every SKILL.md) | "**Announce at start:** 'I'm using ship-sdlc (sdlc v{sdlc_version}).'…" | cross-cutting | Ship dispatches six sub-agents that each announce into isolated contexts no user reads. | Low | flag (cross-cutting reviewer): suppress when running inside an Agent dispatch. |
| C14 | 19 distinct `#NNN` refs, ~40 R-IDs | "(R39, issue #223)", "(Fixes #366.)", "(R60, R37 — fixes #378, #379)"… | 2 history narrative | R-IDs are a required spec-traceability convention (AGENTS.md) — keep. "fixes #N"/"issue #N" and surrounding recurrence sentences are archaeology. | Low | rewrite → keep R-IDs, drop issue numbers from SKILL.md. Proposed only (maintainer convention). |
| C15 | SKILL.md:306; reference.md:88 | "Each sub-skill's SKILL.md is 200–550 lines." | 2 volatile specifics | Actual: execute-plan 1,019, received-review 732, pr 638, version 561 lines. | High | rewrite reference.md:88 → drop the number. |
| C16 | SKILL.md:334–339 | Agent prompt template: "You are executing the <skill-name> skill. Invoke `/<skill-name> <args>`… Return a structured result: (1)…(4)" | 3 dispatch contract — under-described | This is the entire brief a fresh sub-agent gets. Missing the 5.5 autonomy line and the coding verification line. `execute-plan-sdlc` takes no `--auto` (table at 211), so that agent can still stop to ask. | Med | add → "You are running unattended inside a pipeline; the user cannot answer questions mid-task. For reversible actions that follow from the skill's arguments, proceed; stop only for destructive actions the skill itself gates. Before reporting success on a code-changing step, run the project's real check (tests/type-check/build) and include its result in (2)." |
| C17 | SKILL.md:220–237; reference.md:54 | "parse the conversation for a `Verdict:` line … If … compacted … treat missing verdict as APPROVED WITH NOTES" | 4 LLM executor for deterministic plan | Review agent returns a structured result, yet the gate scans conversation text and silently *approves* on loss. Threshold comparison is a one-liner in `ship.js`. | Med | rewrite → review agent returns `{verdict, counts:{critical,high,medium,low}}`; `ship.js review-gate --threshold --counts` emits `dispatchReceivedReview`; when counts unknown and not `--auto`, warn and dispatch rather than approve. |
| C18 | SKILL.md:139–168, 343–353, 578–586, 968–994 | Fixed OAuth example with "14 files staged", "a1b2c3d feat(auth)…" | 1c example over-indexing | Single gold output; model may echo template counts rather than `git status`. | Low | flag → label "illustrative values" once; no diff. |
| C19 | frontmatter `description` vs `argument-hint` | description lists `[--auto]…[--init-config]`; hint adds `[--openspec-change] [--gc] [--ttl-days]` | 2 contradiction (minor) + per-session cost | Description rides in every session's skill index. | Low | rewrite → drop the argument list from `description` (hint carries it); ~60 tokens saved per session per user. |

**Efficiency & cost.** ~13.5K tokens per run + ~2.6K reference.md on failure. Common-path load could drop to ~7–8K by moving C8/C9/C10 and plan-mode-blocked behind the existing "Read `./x.md` only when…" idiom. `effort` per step (C2) is the single largest cost lever. Three LLM-executor sites (C7, C8, C10) remove ~2,000 words and the shell-quoting risk. Skill body is static (cache-friendly); hook reminders are append-only PostToolUse `additionalContext` — correct for preserved thinking. Sub-agent brief gap (C16) is the one place to *add* text.

---

## plugins/sdlc-utilities/skills/ship-sdlc/reference.md

**Summary.** On-demand: error-recovery table, 18-item DO-NOT list, 20 Gotcha paragraphs, learning-capture format. 106 lines / 1,903 words. Sonnet 5.5.

**Assessment — NEEDS-TUNING.** Error-recovery table and most Gotchas are keep-list context (why double commits, why `.sdlc/` ignored, `skipSource` meanings). DO-NOT list mixes reasoned constraints with SKILL.md duplicates and hook-enforced behaviours; five Gotchas document the removed worktree mode as live.

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| R1 | reference.md:72–84 | "Worktree lifecycle uses git commands… (via util/worktree-create.js)"; "Version step is auto-skipped in worktree mode… `workspace === 'worktree'`"; "Worktree PRs auto-label `skip-version-check`" | 2 volatile specifics / contradiction | `util/worktree-create.js` missing; `ship.js:125–130` rejects `--workspace`; `deriveWorkspace` returns only `branch`/`continue`; `ship.js:679` "No skip-version-check label… version always runs"; SKILL.md:1011 "never creates a git worktree". | High | remove paragraphs 72–84 except the two rebase Gotchas; fix SKILL.md:1013–1022 advisory (keys on "worktree"). |
| R2 | reference.md:34 | "Automatically resolve review findings — received-review-sdlc is always interactive" | 2 contradiction | reference.md:56, SKILL.md:214/229 say `--auto` supported and auto-dispatched. `git log -S` dates line 34 to c2bda71 (#65), before `--auto` existed. | High | remove. |
| R3 | reference.md:46–48 | Three items restating Stop/PostToolUse hook behaviour, quoting the hook's 60-word text, "a directive you MUST act on, not an FYI" | 1a pressure; enforced in code | Hook text arrives at the right moment; restating adds register. | Med | rewrite → one item: "Do not end the turn between pipeline steps or treat a tool result as a stopping point; the continuation hooks block such turns and state the next action." |
| R4 | reference.md:32 | "Skip the critique step (Step 3) even when all checks seem obvious" | 1c / 4 | Step 3 is a printed checklist fully computed by `ship.js` (display, not judgment). | Low | flag → say in SKILL.md "print the validation block from prepare output"; DO-NOT then redundant. |
| R5 | reference.md:14 | "`retryExec` (3 attempts…)" | verified | `lib/git.js:69` exists. | — | none |
| R6 | reference.md:88 | "200–550 lines" | 2 volatile | See C15. | High | rewrite. |
| R7 | reference.md:29–48 | 18-item DO-NOT | 1c/1e prohibition cluster | Items 31,33,36,37,38,41–45 reasoned/contract — keep; 32,34,35,46,47,48 duplicate or hook-enforced. | Med | rewrite per R2–R4 (→ ~11 items). |

Efficiency: loaded only on trigger — correct. ~1,400 words after fixes.

---

## plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md

**Summary.** `--init-config`, `--gc`, `--dry-run` handlers; loaded only when the flag is passed. 70 lines / 508 words.

**Assessment — GOOD.** Exact-script style appropriate (temp-file cleanup, I/O).

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| E1 | :18 | `ship-init.js … --workspace prompt` | 2 volatile | `workspace` is a top-level schema section, not `ship.workspace`; ship auto-detects. Whether `ship-init.js` still accepts the flag needs maintainer confirmation. | Med | flag → verify `util/ship-init.js`; drop `--workspace prompt` if rejected. |
| E2 | :11 | "…threshold, workspace isolation)" | 2 volatile | Same. | Med | rewrite → drop "workspace isolation". |

---

## plugins/sdlc-utilities/skills/ship-sdlc/config-format.md

**Summary.** User-facing reference for `.sdlc/local.json → ship`: schema version, field table, precedence, init walkthrough, three examples. 213 lines / 1,516 words.

**Assessment — NEEDS-TUNING.** Reference data (keep) but documents two removed fields and says `--preset`/`--skip` are "accepted" while code rejects them.

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| F1 | :95–106 | "Legacy CLI Sugar (deprecated) — accepted for backward compatibility … `--preset` … `--skip`" | 2 contradiction | `ship.js:110` errors on `--preset`; reference.md:40/64 and SKILL.md say hard-removed (#190). | High | rewrite → two lines: flags no longer accepted; `ship.steps[]` (auto-migrated) is the only source. |
| F2 | :45, :74, :136–139 | `"workspace": "prompt"`; row "`workspace` \| branch\|worktree\|prompt … Forwarded to execute-plan-sdlc as a hint"; walkthrough step 5 | 2 volatile / contradiction | Not in `shipSection` of the schema (top-level `workspace` has a different shape); ship auto-detects. | High | remove row, example key, walkthrough step 5; point to top-level `workspace` section. |
| F3 | :75, :141–144 | `rebase` field semantics | 2 volatile (partial) | Field exists and `ship.js` maps it, but SKILL.md never reads `flags.rebase` (C10) — config has no effect today. | Med | flag → fix C10 first. |
| F4 | :68 vs :128 vs SKILL.md:59 | Three different "default steps" lists | 2 contradiction (minor) | Only `computeSteps` knows the truth. | Med | rewrite → state once, quoting `ship.js` defaults. |

---

## plugins/sdlc-utilities/skills/ship-sdlc/state-format.md

**Summary.** Schema of `ship-<branch>-<ts>.json`: fields, step names, statuses, lifecycle, plan-mode-blocked init. Read on resume. 255 lines / 2,110 words.

**Assessment — GOOD with stale examples.** Contract documentation (keep). `worktree` field doc is accurate (realpath for session scoping).

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| S1 | :53–69, :220–226 | `"skip": ["version"], "preset": "balanced"` + table rows "skipped via `--skip`", "preset used" | 2 volatile | Rejected flags; current `flags` carry `steps`, `quick`, `quality`, `reviewThreshold`, `workspace`, `implicitResume`, `rebase`… Example teaches a shape the model will never see. | High | rewrite from a real `init` write. |
| S2 | :157, :237 | `"preset B selected from config default"` | 2 volatile | Legacy vocabulary. | Med | rewrite. |
| S3 | :43–44 | `worktree`/`sessionId` rows ~180 words each with "R73, #505", "pre-#501" | 2 history narrative (mild) | Rules valuable; issue numbers archaeology. | Low | flag. |

---

## plugins/sdlc-utilities/skills/verify-pipeline-sdlc/SKILL.md

**Summary.** Loads failed-CI logs (`--logs` or `lib/git.js::fetchFailedCheckLogs`), runs deterministic `verify-pipeline-sdlc-classify.js`, applies minimal fix (`--auto`, actionable categories) or emits proposal; returns one JSON line. 92 lines / 638 words. Sonnet 5.5. All referenced scripts/exports verified present.

**Assessment — GOOD.** Tight; classification in code; JSON-line contract with reason; C1/C2 prohibitions reasoned.

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| V1 | :60 | "use the `Edit` tool to apply the minimal fix … Do NOT scaffold abstractions or refactor." | keep + missing verification | Scope line matches 5.5 over-eagerness guidance. Missing Sonnet 5.5 "verification on coding tasks": returns `fix-applied` without running the failing check; ship then commits, pushes, re-polls CI — wasted round-trip when wrong. | Med | add → "Before emitting `fix-applied`, run the check that failed (lint/test/type-check for the touched file) when it can run locally; if it still fails, emit `proposal`." |
| V2 | :64 | "ALWAYS emit a proposal … regardless of category" | 1a mild | Caps on an unambiguous rule. | Low | rewrite plainly. |
| V3 | :13 | Announce line vs "anything else on stdout breaks the verdict parser" | cross-cutting | Announce is conversation text, not stdout, so not actually breaking — but reads contradictory to a literal reader. | Low | flag (with C13). |

Efficiency: `sonnet` right; `effort: medium` is the documented start for agentic edits — set via ship dispatch (C2) or frontmatter if honoured.

---

## plugins/sdlc-utilities/skills/harden-sdlc/SKILL.md

**Summary.** After a failure: `harden-prepare.js` → manifest; dispatch `harden-orchestrator` (Haiku); walk proposals through apply/skip/cancel; validate; write; mirror new review dimensions to `.github/instructions/`; append learning line. 420 lines / 2,903 words. Sonnet 5.5. All referenced scripts verified.

**Assessment — NEEDS-TUNING.** Write discipline (re-read, write-before-advance, validate-before-write, halt on partial failure) is fragile-operation territory and correctly prescriptive. Over-explains R-IDs/issue history; Copilot-mirror sub-step is a 40-line deterministic sequence in prose; DO-NOT list repeats point-of-use constraints.

| # | Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|---|
| H1 | :254–284 | Copilot mirror: gate (a)+(b), derive name, "(1) Generate deterministically (NEVER hand-author…)", mkdir, create-vs-strengthen-merge, halt message | 4 LLM executor | Gate, derivation, generator call, mkdir, create/merge decision, halt message are all computable; prose itself says "NEVER hand-author". | Med | move → `dimension-to-instructions.js --write-mirror --content-root …` returning `{written\|merged\|skipped\|error}`; SKILL.md keeps one command + confirmation line. |
| H2 | :384–401 | 9-item DO-NOT; 386/388/395 restate Step 5 contract and Step 1/2 manifest rule verbatim | 1c duplicates | 391, 392, 393, 397, 399, 401 reasoned — keep. | Med | rewrite → drop three duplicates. |
| H3 | :184–189, :213, :245 | Per-iteration contract stated, then "**Re-read … now** (implements rule 1)", "**Write to disk now…** (rule 2)" | 1c repetition as reinforcement | Same rule three times in bold, added for #387 on an earlier model. | Low | rewrite → keep 184–189; reduce 213/245 to bare action. Proposed only. |
| H4 | :124–125 | `model: haiku`, no `effort` | 4 routing (verified) | Haiku 5.5 default `medium` fits classification + structured drafting. | — | none |
| H5 | :156–158 | "If JSON parse fails, stop … (E4 — no retry)" | 4 Haiku 5.5 | Thinking-on, no prefill; "no fences" instructions usually hold but one strict-parse failure aborts the skill. | Low | add → strip surrounding fences / parse outermost `{…}` before treating as unparseable. |
| H6 | :306, :329 | "Glob `**/error-report-sdlc/REFERENCE.md`, follow it" | 2 volatile / tool-contract | Manifest already carries `surfaces.errorReportSkillPath` (orchestrator.md:36); repo-wide glob is a wasted call and may hit a stale copy. | Med | rewrite → read the manifest field. |

Efficiency: ~4K tokens; `sonnet` appropriate; drops to ~2.3K words after H1–H3. Haiku orchestrator keeps the manifest out of main context — good.

---

## plugins/sdlc-utilities/agents/harden-orchestrator.md

**Summary.** Subagent (`tools: Read`, `model: haiku` → Haiku 5.5). Reads manifest, classifies, decides per surface, drafts proposals, self-critiques (max 2 iterations), emits one JSON object. 241 lines / 1,723 words. Loaded on dispatch.

**Assessment — GOOD, Haiku-5.5-specific tuning.** Manifest field table, classification definitions, proposal schema with three worked shapes, hard-constraint list are contract material (keep). JSON-only output is the right prefill replacement.

| # | Location | Evidence | Pattern | Why on Haiku 5.5 | Conf. | Action |
|---|---|---|---|---|---|---|
| O1 | :224–225 | "No preamble, no explanation, no surrounding markdown fences … no chain-of-thought." | 1b thinking-era scaffold | Thinking is on by default and happens in thinking blocks; "no chain-of-thought" cannot act as a control and conflicts with Steps 4/4b ("Note every failing check", "Re-run"). | Med | rewrite → "Output the JSON object only — no preamble, no explanation, no code fences." |
| O2 | :120–145 | 9 checks + "Note every failing check … Re-run all Step 4 checks … max 2 iterations" | 1c scripted deliberation | Checks are valuable invariants (keep); the explicit loop is deliberation the model does natively in thinking and conflicts with O1. | Low | rewrite → "Before emitting, make sure every item below holds; fix the proposal set until it does:" + checks; drop Step 4b. Proposed only — a structured self-check can help a small model. |
| O3 | :3 description | "Returns ONLY the JSON object … Does not call gh/git, does not write any file." | 3 (verified contract) | Contract, not steering. | — | none |
| O4 | :227–240 | "**Do not invoke Bash.** You have no Bash tool…"; "**Do not write any file.** You have no write tools" | 1e enforced at tool boundary | Facts, not rules. | Low | rewrite → one sentence; keep 234–240. |
| O5 | :41 | `pluginRepoUrl` row explains what the *parent* does with a field the orchestrator ignores | 2 coupling noise | Not harmful. | Low | flag. |

Efficiency: ~2.4K tokens on Haiku 5.5 — cheap, correctly isolated; default effort fine.

---

## Group summary

**Overall rating: NEEDS-TUNING.** Architecture already follows the key 5.x recommendations (deterministic work in scripts, per-step model routing in code, hooks not prose for continuation, Haiku for the isolated drafting agent, progressive disclosure for failure material). Findings concern what accreted on top and three places where the model still executes deterministic sequences.

**Top findings:**
1. **Stale/contradictory docs for removed features (C1, C11, R1, R2, F1, F2, S1).** Removed `worktree` mode, non-existent `hooks/context-stats.js` and `util/worktree-create.js`, "accepted" `--preset`/`--skip` that the script rejects, legacy `start`/`complete` beside their replacements, "always interactive" beside "supports --auto". High-confidence Group 2; on Sonnet 5.5 contradictions are reconciliation work every run and wrong commands are failed runs.
2. **No `effort` in step routing (C2).** `ship.js` already emits `model`; adding `effort` is small and is the largest cost lever on 5.5. Execute (Opus 5.5) and review (Sonnet at implicit `high`) are where spend sits.
3. **Deterministic sequences via prose + `node -e` (C7, C8, C10, H1).** Branch derive/state patch, archive-openspec, rebase, Copilot mirror — all pure functions plus one user choice. Moving them to subcommands removes ~2,500 words from the common path and the shell-quoting failure surface.
4. **Pressure language and hook-duplicating prose (C3–C6, R3, H2, H3).** Real constraints are mostly code-enforced; the "non-negotiable / no authority / MUST act / NEVER" register and the self-described "descriptive, not a competing imperative" blocks are the pattern the best-practices page says to dial back.
5. **Sub-agent brief lacks 5.5 autonomy + verification lines (C16, V1).** The one place to *add* text.

**Counts.** High: 10 (C1, C11, C12, C15, R1, R2, R6, F1, F2, S1). Medium: 19. Low: 13. flag-only: 8. Verified-clean: R5, H4, O3.

**Group 4 checks run:** LLM-executor sites — C7, C8, C10, H1, plus review-gate text scan (C17). Redundant sub-agents — none in group. Cache-hostile ordering — none; hook reminders append-only. Token accounting — none exists; recommend `complete-step --usage` logging in ship state before tuning effort (so C2 is measurable).

**Out-of-scope note for the parent:** C13/V3 (announce-at-start inside Agent dispatch) is cross-cutting across all 13 skills.
