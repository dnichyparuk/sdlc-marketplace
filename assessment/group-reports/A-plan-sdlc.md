# Group A — plan-sdlc audit report

Scope: `plugins/sdlc-utilities/skills/plan-sdlc/*` (15 files) + `agents/plan-explore-orchestrator.md`.
Targets: SKILL.md pins `model: opus` → Claude Opus 5.5. Lane dispatch models come from `scripts/skill/plan.js` (verified): static-structural **haiku**, content-coverage **sonnet**, file-existence **haiku**, guardrail-compliance **sonnet**, G17 **sonnet**, Gate A **sonnet**, all three lenses **sonnet** (overridden to the "opposite of author" = sonnet when author is opus). Orchestrator pins **sonnet**; its discovery subagents are haiku/sonnet/opus by orchestrator choice. Reference docs (plan-format-reference, state-format, template) are read by whichever model Reads them (opus author, sonnet content lane).

Verified facts used below: `scripts/skill/plan.js`, `plan-handoff-advisory.js`, `lib/links.js`, `ci/validate-plan-format.js`, `hooks/stop-plan-integrity.js` exist with the flags SKILL.md uses. `hooks/context-stats.js` does **not** exist, `hooks.json` has no `UserPromptSubmit` entry, and nothing in the plugin writes `sdlc-context-stats.json`. The Agent tool schema available in this Claude Code build has parameters `description, prompt, subagent_type, model, effort, isolation` — no `mode`, no `run_in_background`. `TodoWrite` and `LSP` are not in this build's tool list. `validate-plan-format.js` PF4 already checks dependency validity + cycles deterministically.

**Model-call sites per full-pipeline plan run** (counted from SKILL.md + orchestrator): 1 main (opus) + 1 orchestrator (sonnet) + 3–7 discovery subagents + 0–1 Gate A + 5 lanes + 3 lenses per review iteration (×1–3) + 5 lanes again on material-change re-dispatch. Typical: **15–20 LLM dispatches; worst case ~30.** At least 4 of those (file-existence lane, G3/G12 in static lane, most of G17, scorecard tallying in main) do deterministic work.

---

## plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md

**Summary.** The plan-authoring procedure: 797 lines / 10,727 words, loads on `/plan-sdlc` or plan mode, read by Opus 5.5. Steps 0–7 cover OpenSpec gating, prepare-script call, template-driven skeleton, exploration (orchestrator or inline), Gate A, decomposition rules (G18–G21 definitions), 5-lane critique, improve, 3-lens review loop with Gate B scorecard, link + format hard gates, handoff.

**Assessment: NEEDS-REWORK (structure), content largely load-bearing.** Most of the volume is tool contract and fragile-operation scripting (bash blocks, template variable lists, merge rules) which the keep list protects. The problems are: (a) several deterministic algorithms are assigned to the Opus model instead of code (material-change diff, G1–G21 coverage union, scorecard tallying, lane JSON merge); (b) stale facts — a hook that doesn't exist, Agent-tool parameters that don't exist, tool names (`TodoWrite`, `LSP`) not in the current build; (c) change-log phrasing ("purely additive", "status quo preserved", "update the existing … text", issue numbers) that reads as a diff against an earlier version the model never saw; (d) three copies of the parallel-dispatch nudge and a meta-instruction about "canonical wording". Pressure-language density is moderate (33 MUST/NEVER/DO NOT in 797 lines) and mostly attached to reasons, so 1a is not the main issue. No anti-narration or anti-formatting rules — good for Opus 5.5.

| Location | Evidence | Pattern | Why it matters on Opus 5.5 | Conf. | Action |
|---|---|---|---|---|---|
| SKILL.md:700 | "written by the `UserPromptSubmit` hook `hooks/context-stats.js`" | 2 volatile specifics (stale fact) | No such hook file, no UserPromptSubmit entry in hooks.json, nothing writes the sidecar → the Step 7 `/compact` advisory can never fire; the model is told a mechanism exists that doesn't. | High | rewrite: either ship the hook or delete lines 693–700 and the `plan-handoff-advisory.js` call (dead path). |
| SKILL.md:525, :538 | "`run_in_background: false` on each" | 2 volatile specifics (tool contract) | Current Agent tool has no `run_in_background` parameter (schema: description/prompt/subagent_type/model/effort/isolation). Subagents run in the background and notify on completion; the await-barrier *behavior* is still right, the parameter is not. The model will either emit an invalid arg or spend effort reconciling. | High | rewrite: drop the parameter; keep "collect exactly N results before consolidating; if a dispatch is backgrounded, keep awaiting across completion notifications". |
| SKILL.md:65, :741 | "Create TodoWrite items for Steps 1–7" / "Use TodoWrite for lightweight plans" | 2 volatile specifics | `TodoWrite` is not in the current tool list (hooks.json still matches on it too). | Med | rewrite to "track Steps 1–7 with the harness's task list if one is available"; coordinate with hooks group (pipeline-continue matcher). |
| SKILL.md:236 | "(Glob, Grep, Read, LSP)" | 2 volatile specifics | No `LSP` tool in this build. | Low | rewrite: "Glob, Grep, Read". |
| SKILL.md:605–632 | Material change detection: snapshot 7 maps (taskCount, deviations rows, files set per task, contracts verbatim, dependsOn, keyDecisions, openspec mapping) before/after and diff them | 4 LLM executor for deterministic plan; 1b arithmetic rubric | Inputs fully determine the output; asking Opus to hold 7 structures verbatim across a rewrite is error-prone and burns thinking tokens on bookkeeping. `validate-plan-format.js` already parses tasks/metadata. | High | move: add `plan.js --diff-material <before> <after>` (or a `lib/plan-diff.js`) that emits `{material: bool, triggers: [...]}`; SKILL.md keeps only "run it; if material, merged re-dispatch". |
| SKILL.md:446–452 | Merge algorithm: union, coverageCheck `{G1..G21}` exact-equality, synthetic blocking issues, dedup by `(gateId, taskRef, message-normalized-prefix)` | 4 LLM executor | Pure set arithmetic over JSON the lanes already return. | High | move: `plan.js --merge-lanes <files…>`; lanes write JSON to the manifest tempdir, script merges and prints the issue list. |
| SKILL.md:575–588 | Scorecard assembly: "Aggregate CRITICAL/WARNING/SUGGESTION/PASS counts by dimension … Three rows" + traceability matrix + verdict derivation | 4 LLM executor; 1b point system | Counting tags and deriving a verdict from max severity is tallying; the lens outputs are free-text with inline `[SEVERITY:…]` tags that the model must regex. | High | move: have lenses emit the same JSON envelope as lanes (see lens findings) and let the merge script build the scorecard table; model writes only the narrative. |
| SKILL.md:220, :225, :242 | "Issue all Glob/Grep/Read calls … in a SINGLE message (parallel dispatch). (implements R37, Fixes #418)" ×3; :242 adds "mirror the in-skill precedent at the OpenSpec artifact reads" | 1c padding / repetition; 1d migration-relative | Current models parallelize independent reads by default; the nudge is reasonable once, three copies plus a self-referential "mirror the precedent" are noise. | Med | rewrite: one sentence in Step 1 ("Read, Glob and Grep calls that don't depend on each other go in one message."), delete the other two. |
| SKILL.md:538 | "Reuse canonical fan-out wording: 'Dispatch ALL … in a SINGLE message as parallel Agent tool calls.'" | 1d (author-facing meta note in model-facing text) | This instructs the *skill author*, not the model; the model reads it as a rule about its own output. | Med | remove. |
| SKILL.md:570 | "This is purely additive — it MUST NOT remove or alter any existing gate evaluation … G1–G18 unchanged; G19 severity promoted (R46 mod); G20 additive (R48); G21 additive (R51)." | 1d migration-relative phrasing | A diff against a prior SKILL.md version; implies phantom alternatives. The model has nothing to "not remove". | Med | rewrite: "Assemble the `## Verification Scorecard` section (regenerated each iteration)." |
| SKILL.md:149–150 | "update the existing gate check Option 3 text:" | 1d migration-relative | Same — describes an edit to the prompt rather than the rule. | Med | rewrite: state Option 3's text conditionally in the gate-check block itself. |
| SKILL.md:566 | "Single reviewer (status quo): … Status quo behavior preserved." | 1d migration-relative | Same. | Med | rewrite: "For plans with <5 tasks, dispatch one reviewer with `{LENS}=all`." |
| SKILL.md:463, :471, :517 | "This extends the existing G17 join semantics to every lane." / "re-marking would reset the timestamp without adding information" / "The user does NOT see the plan at Step 4" | 1d migration-relative; 1c strategy coaching | Commentary on why the design changed; not an instruction. | Low | remove the sentences; keep the rules. |
| SKILL.md (34 sites) | "(implements R39 — Fixes #445)", "issue #285", "#487", "(forbidden per issues #370/#372)" | 2 history narratives | AGENTS.md requires `R<n>` references (project override — keep those). GitHub issue numbers add nothing the model can act on and date the file. | Med | rewrite: keep `implements R<n>`, drop `Fixes #<n>` / `issue #<n>` (move to CHANGELOG/git history). |
| SKILL.md:435, :558 | "No `isolation: "worktree"` on any lane dispatch (forbidden per issues #370/#372)." | 1e prohibition without stated reason | The reason is an issue number, not a reason. Opus 5.5 would not add `isolation` unprompted; the rule is a recency-trap patch. | Low | rewrite with the actual reason (lanes read the plan file by absolute path; a worktree copy would read a stale/absent file) or remove. |
| SKILL.md:259, :410 | "Re-anchor: … re-read the plan file … counters attention drift after many exploration calls." / "The file — not your memory of it — is the source of truth." | 1d fossil (retention crutch) | Written for models that lost track over long sessions; Opus 5.5 retains context. The Step 3 re-read is cheap and harmless (lanes read the file anyway); Step 1's is an extra Read. | Low | flag — keep Step 3 wording (it is a true statement about the source of truth), drop the "attention drift" justification. |
| SKILL.md:730–743 | `## DO NOT` — 13 unconditional items | 1e prohibition cluster | Mixed: items with real constraints (plan file path in plan mode, no execution in same turn, no `$TMPDIR`) stay. "Put plans in plugin-branded directories (no `docs/superpowers/plans/`)" and "Skip the plan review loop" are incident patches / already covered by the step logic. | Med | rewrite: keep 6–7 reasoned items inline where the rule applies; delete the recency-trap items. |
| SKILL.md:13 | "**Announce at start:** 'I'm using plan-sdlc (sdlc v{sdlc_version}).' — extract the version from the `sdlc:` line…" | 2 (cross-cutting; see hooks/cross-cutting group) | Fine as a one-liner; noted here only because every skill repeats the extraction instructions. | Low | flag (cross-cutting). |
| SKILL.md:544 | "override with the opposite-of-plan-author model … plan written by opus → dispatch reviewer as sonnet" | 4 model/effort routing | With author=opus this *downgrades* every lens reviewer to Sonnet 5.5. Sonnet 5.5 is strong at review, so this is a legitimate cost lever, but the stated rationale ("cross-model catches blind spots") is folk heuristic. Reviewer quality is the thing that gates execution. | Med | rewrite: state it as a cost choice ("lenses run on sonnet; raise to opus with `--quality full`") rather than a blind-spot claim; measure on promptfoo. |
| SKILL.md:6 (frontmatter) | `model: opus`, no effort setting | 4 model/effort routing | Opus 5.5 defaults to `medium` effort. The author step is quality-sensitive (plan errors propagate to execute-plan), so opus is defensible; but 80% of this skill is orchestration (bash, dispatch, parsing) that Sonnet 5.5 does equally well at ⅕ the price. | Med | flag: if Claude Code supports `effort` in skill frontmatter, pin `high` for the author; otherwise consider sonnet for orchestration-heavy runs via a `--quality` flag like ship-sdlc. Needs measurement. |
| SKILL.md:367–377 | G18, G19, G20, G21 defined in full prose in Step 2, again in lane-content-coverage-prompt.md, again in plan-format-reference.md | 2 duplicated info across SKILL.md and reference files | The three copies currently agree (checked G19 exemptions, G21 pointer rule). Working redundancy — not a finding under keep-list 8 — but three places to drift. | Low | flag: single home in plan-format-reference.md; SKILL.md and lane prompt cite it. |
| SKILL.md:397–404 | R62 plain-language rules + "Goal structured as a multi-line bullet list, not a dense text blob" | — | Style context for the plan artifact; this is the author's quality bar. Keep. | — | keep |
| SKILL.md:86–97, 171–175, 457–469, 640–644, 667–681 | bash blocks with `<PLUGIN_ROOT>` substitution, trap cleanup, `--mark` markers | — | Fragile-operation scripts; exact text is correct and verified against scripts. Keep. | — | keep |

**Efficiency & cost.** ~14k tokens loaded on every plan invocation, including lightweight plans that use <30% of it (OpenSpec block, lane/lens variable tables, scorecard, material-change rules are full-pipeline-only). Progressive disclosure: move Step 3–6 dispatch contracts (variable lists, merge rules, scorecard) into a `critique-dispatch.md` loaded only on the full-pipeline branch; move the OpenSpec gate/appendix rules into `openspec-flow.md` loaded only when `openspec/config.yaml` exists. That would cut the lightweight-path load to roughly a third. Caching: the SKILL body is static (good); the `Announce` line and the `<PLUGIN_ROOT>` substitution are fine. No per-turn reminders.

---

## plugins/sdlc-utilities/agents/plan-explore-orchestrator.md

**Summary.** Subagent definition (292 lines / 1,684 words, `model: sonnet`, tools incl. Agent/WebSearch). Derives 3–7 task-specific discovery dimensions, fans out code/web/hybrid subagents, dedups/critiques, writes `discovery-brief.md`, returns a parsable summary. Loaded on dispatch from plan-sdlc Step 1 (full pipeline only).

**Assessment: NEEDS-TUNING.** Well-structured, output contract precise, honest-zero rule good. Issues: stale Agent-tool parameters, an incorrect claim about model inheritance, a model-tier menu that invites opus-tier discovery agents, and a Quality-Gates checklist that restates the steps.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :98–99 | "`mode: bypassPermissions`" / "`run_in_background: false` — **mandatory** (R56, #487): Agent dispatch defaults to background; a backgrounded call returns control before the subagent finishes" | 2 volatile specifics (tool contract) | Neither parameter exists on the current Agent tool. The behavior note is partly right (subagents run in background, completion arrives as a notification) — the await-barrier text at :168 already handles that correctly. | High | rewrite: delete both parameter lines; keep :168's "collect exactly N results across notifications". |
| :288 | "Omit `model:` on any Agent dispatch — omitting it silently inherits the parent model (opus)" | 2 stale fact | This agent's own model is sonnet; an unpinned child inherits the parent (sonnet) unless a default subagent model is configured. The "(opus)" claim is wrong and the rule's reason is stale. | Med | rewrite: "Always pass `model:`; an unpinned dispatch inherits this agent's model." |
| :69–72 | Model assignment: "`opus` — complex architectural analysis, deep integration tracing" | 4 model/effort routing | Discovery subagents read code and list findings; Sonnet 5.5 is the documented sweet spot for multistep code work, and Opus 5.5 at ~2× Sonnet's price rarely pays off for file:line enumeration. Opus discovery agents inside a sonnet orchestrator inside an opus author triples the top-tier spend. | Med | rewrite: cap at sonnet ("haiku: enumeration/pattern grep; sonnet: cross-file reasoning"); drop the opus row. Optionally pass `effort: low` on haiku dimensions. |
| :266–278 | "## Quality Gates (before returning)" — 11 checkbox items restating Steps 1–5 | 1c padding (repetition as reinforcement) | Every item duplicates a rule stated above; the model reconciles two wordings. A single end-of-prompt recap of 2–3 key constraints is fine (keep-list 10), eleven is scattered duplication. | Med | rewrite: keep 3 items (N results collected; brief at outDir with F-ids; summary fields) and delete the rest. |
| :282–292 | `## DO NOT` 9 items incl. "Pass `isolation: "worktree"` … (see issues #370 #372)", "Run CRITIQUE … before collecting (count == N) (R56, #487)" | 1e prohibition cluster / 2 history | Budget and write-location rules carry reasons (keep). The isolation and await lines are third restatements with issue numbers as rationale. | Low | rewrite: drop the two duplicated lines; keep budgets, outDir, no-user-prompt, honest-zero. |
| :131–134 | web prompt: "Budget: ≤5 WebSearch calls + ≤8 WebFetch calls … Down-weight sources older than 3 years" | — | Genuine cost/quality constraints with numbers the subagent can't infer. Keep. | — | keep |
| :12 | "**Critical difference from review-orchestrator:** You DERIVE the dispatch contract via LLM…" | 1c context | This is useful "why", not shouting; the bold "Critical" is harmless. | — | keep |

**Efficiency & cost.** Fan-out of 3–7 subagents each re-reading scope files is the single biggest variable cost in a plan run; the orchestrator should pass `effort: low` to haiku dimensions and default to sonnet, not opus. The per-mode prompt suffixes are static (cache-friendly). The dimension JSON "DIMENSION_CONTRACT" block is printed then re-used verbatim — good (no LLM mutation between derive and dispatch).

---

## skills/plan-sdlc/lane-static-structural-prompt.md (haiku)

**Summary.** 73 lines / 450 words; Step 3 lane for G1, G2, G3, G7, G12 on Haiku 5.5; returns JSON.

**Assessment: NEEDS-TUNING.** Clean prompt for Haiku; the problem is what it is asked to do.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :29, :35 | G3 "No circular dependencies… points to a task that appears before it", G12 "Every `Depends on: Task N` reference names a task that actually exists" | 4 LLM executor for deterministic plan (duplicates existing code) | `validate-plan-format.js` PF4 already checks "valid refs, no cycles" deterministically, and runs at Step 6.6. Paying a Haiku dispatch to re-derive it (and giving it blocking authority) is redundant and less reliable than the script. | High | move: drop G3/G12 from this lane; run PF4 (or a `--check deps` subset) at Step 3 time and inject its failures into `allIssues`. Lane keeps G1/G2/G7 (judgment). |
| :25–26 | "Every stated requirement … has at least one task" (G1) / "Every task traces back to a stated requirement" (G2) | — | Judgment over prose; appropriate for haiku. Keep. | — | keep |

**Cost.** With G3/G12 gone this lane could merge with the file-existence lane's judgment remainder (none — see below) or run at `effort: low`.

## skills/plan-sdlc/lane-file-existence-prompt.md (haiku)

**Summary.** 75 lines / 454 words; G4 (shared Modify paths without dependency) and G10 (Modify paths exist). Haiku 5.5 with Glob/Bash.

**Assessment: NEEDS-REWORK — this lane should be a script.**

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :26–45 (whole lane) | "Extract all `Files: Modify:` paths… Find any path that appears in two or more tasks… verify `Depends on:`" / "For each path, check existence relative to {PROJECT_ROOT}" | 4 LLM executor for deterministic plan | Inputs fully determine outputs; `validate-plan-format.js` already parses task `Files:` blocks. An LLM dispatch + N Glob calls to do `fs.existsSync` is the clearest cost/accuracy loss in the group. | High | move: add PF11 (shared-Modify-without-dep) and PF12 (Modify path exists, given `--root`) to `validate-plan-format.js`; delete the lane; `buildLanes` drops to 4 and the coverage union becomes {G1..G21}\{G4,G10} or PF-sourced entries. |

## skills/plan-sdlc/lane-content-coverage-prompt.md (sonnet)

**Summary.** 137 lines / 1,328 words; 12 judgment gates (G5, G6, G8, G9, G11, G13, G15, G16, G18–G21) on Sonnet 5.5; reads plan, format reference, template.

**Assessment: GOOD.** Judgment-heavy, well-calibrated ("Do NOT flag a task whose Contract pins a concrete shape — only flag genuinely unsettled tasks"), exemptions are template-driven. Two small items.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :47, :51 | G6 "Trivial = single-file, <15 lines…"; G9 "No task touches more than 5 files. No plan has more than 80% Trivial tasks." | 1b arithmetic rubric (partial) | File-count and Trivial-percentage parts are countable from the parsed plan; the classification judgment (does it *really* need a migration?) is not. Mixed; the LLM half is legitimate. | Low | flag: let the script emit counts (files/task, %Trivial) into the prompt so the model judges, not counts. |
| :4–5, :24 | Reads `{FORMAT_REFERENCE_PATH}` (5k words) + template + plan on every dispatch | 4 cost | ~7k tokens of reference per lane call, every iteration. Acceptable for a sonnet judgment lane; it is the calibration standard. | — | keep (note cost). |

## skills/plan-sdlc/lane-guardrail-compliance-prompt.md (sonnet)

**Summary.** 69 lines / 393 words; G14 — evaluate natural-language guardrails against the plan; returns JSON + markdown table payload.

**Assessment: GOOD.** Single judgment gate; when no guardrails are configured the lane is still dispatched to return "No active guardrails configured."

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :60–62 + SKILL.md:412 | "When `{ACTIVE_GUARDRAILS}` is empty: Issues = [], passes = ["G14"] …" but SKILL.md dispatches "ALL FIVE lanes" unconditionally | 4 LLM call with fully determined output | A dispatch whose output is a constant when `guardrails[]` is empty. | High | rewrite (SKILL.md:412): skip this lane when `activeGuardrails` is empty and synthesize the constant result in code/main context. |

## skills/plan-sdlc/g17-dimension-coverage-prompt.md (sonnet)

**Summary.** 221 lines / 1,671 words; advisory lane proposing new/updated review dimensions: parse catalog + Copilot mirror, glob-match plan paths, apply C1–C6 / U1–U6 / B1–B4 criteria, rank with numeric severity, cap 3, defer-check against learnings log, attach X1, render markdown. Sonnet 5.5.

**Assessment: NEEDS-REWORK.** This is a scoring engine written as prose: of Steps A–J, only Step G (classifying task descriptions: API change? invariant flip? security-sensitive?) and the "why" sentence need a model. Everything else is file parsing, minimatch, counting, sorting by `{critical:4,…}`, and template rendering.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :48–57, :60–70, :72–82 (Steps A–D) | "parse frontmatter `name`, `triggers[]`…", "match against every dimension's `triggers[]` using minimatch glob semantics" | 4 LLM executor | `scripts/lib/dimensions.js` already parses dimension files; glob matching is code. The model emulating minimatch is both slow and unreliable. | High | move: a `plan.js --g17-prepare` step emits `{coveredDims, uncoveredPaths, mirrorMap}` into the prompt. |
| :84–94, :98–109 (C1–C6, U1–U6) | path-pattern criteria with per-criterion severity, "require ≥2 files", "do NOT fire C6 for single-file diffs" | 1b inline lookup table / 4 deterministic | Every criterion is a path predicate plus a count. | High | move to the same script; model receives fired criteria. |
| :124–132 (Step H) | "Rank … by `severity_rank DESC, criteria_count DESC, dimension_name ASC` where `severity_rank = {critical:4, high:3, …}`. Cap at 3. Record suppressed count." | 1b point system / 4 | Sorting and counting in prose. | High | move to script. |
| :134–143 (Step I) | "Read the last 100 lines of {LEARNINGS_LOG_PATH} … Parse `## YYYY-MM-DD — harden-sdlc:` headers within {PR_COMMIT_WINDOW} … Drop any proposal whose dimension appears" | 4 deterministic | Log parsing with a date window. | High | move to script. |
| :111–121 (Step G, B1–B4) | "Description indicates a public API, CLI flag … change" / "invariant flip: sync↔async…" | — | Genuine semantic classification over task prose — the one model call that stays, plus the rationale sentence. | — | keep (as the surviving LLM step) |
| :196–203 | "## Self-check (before returning) 1–6" | 1c repetition as reinforcement | Six items restating field rules already given; once the rendering is code, most vanish. | Med | remove after the move; otherwise trim to JSON-validity. |
| :1–3, :13–19 | "Use this template in plan-sdlc Step 3 … `Task tool (general-purpose): … mode: bypassPermissions`" | 2 volatile specifics | Same non-existent `mode` parameter; "Task tool" is the old name of the Agent tool. | High | rewrite to match the current dispatch (Agent tool, `model` from `g17Dispatch.model`). |
| :209 | "Parse the `WAVE_SUMMARY`-style JSON from the subagent's response" | 2 stale cross-reference | `WAVE_SUMMARY` is execute-plan-sdlc's envelope, not this prompt's; the model has to guess what "style" means. | Low | rewrite: "parse the fenced `json` block". |

**Cost.** This dispatch reads every dimension file, every Copilot instruction file, the plan and the learnings log on every full-pipeline plan — likely the heaviest single lane after content-coverage, for an advisory output capped at 3 proposals. After the move, the surviving model call is small.

## skills/plan-sdlc/lens-architecture-prompt.md / lens-requirements-prompt.md / lens-risk-prompt.md (sonnet)

**Summary.** 68 / 84 / 69 lines (495 / 690 / 532 words). Step 5 reviewers, one lens each, Sonnet 5.5 (per SKILL.md override). Free-text output "Status / Issues / Recommendations" with inline `[SEVERITY:…] [DIMENSION:…]` tags; requirements lens also emits `TRACEABILITY:` rows.

**Assessment: GOOD content, NEEDS-TUNING contract.** Calibration sections ("Approve unless there are genuine blockers", "stylistic preferences → do NOT flag") are exactly the right register for Sonnet 5.5's literal instruction-following. Two structural items:

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| all three: Output section | "**Status:** Approved \| Issues Found … - Task N: [issue] — [why] [SEVERITY: WARNING] [DIMENSION: Correctness]" vs lanes returning JSON | 4 (inconsistent output contract → LLM parsing in main) | Lanes return a JSON envelope; lenses return markdown with bracket tags and (requirements) a `TRACEABILITY:` line protocol. The opus main agent then regex-parses both to build the scorecard. One envelope for both lets a script merge and tally. | Med | rewrite: lenses return `{status, issues:[{taskRef, message, severity, dimension, blocking}], recommendations:[], traceability:[…]}`; SKILL.md merge/scorecard move to script. |
| lens-requirements:36–37 / lens-risk:33–34 | "Metadata completeness: Every task has all five metadata fields" / "File paths: … no absolute paths"; "Plan completeness: header fields filled, no `[TBD]`, numbering sequential" | 4 duplicates existing deterministic checks | PF1 (header), PF2 (numbering), PF3 (metadata) already run at Step 6.6; absolute-path detection is a regex. The lens spends tokens on checks the script does better, and the plan can't pass 6.6 without them anyway. | Med | rewrite: drop these bullets (or run validate-plan-format before Step 5 and feed its result in). |
| lens-architecture:33 | "Absent Key Decisions for a ≥5-task plan is advisory." (and plan-reviewer: "present for plans with 5+ tasks") vs plan-format-reference "## Key Decisions (optional)" and SKILL.md:390 "note every decision where you chose between valid approaches" | 2 near-contradiction | Three slightly different rules on when Key Decisions is required. They don't conflict hard (advisory vs optional) but the lens threshold "5+ tasks" appears nowhere in the author's instructions. | Low | flag: align wording in one place (format reference). |

## skills/plan-sdlc/plan-reviewer-prompt.md

**Summary.** 100 lines / 1,123 words; the single-reviewer template for <5-task plans (`{LENS}=all`), plus lens→category mapping and output handling.

**Assessment: NEEDS-TUNING.**

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :27–31 | "Task tool (general-purpose): … model: … mode: bypassPermissions" | 2 volatile specifics | Non-existent parameter; old tool name. | High | rewrite to the Agent tool shape (`subagent_type`, `model`, `prompt`). |
| :93–95 | "Approved → Proceed to Step 7 (Handoff)" | 2 contradiction with SKILL.md | SKILL.md Steps 6.5 (link validation) and 6.6 (format validation) sit between review approval and Step 7 and are hard gates. | Med | rewrite: "Approved → Step 6.5". |
| :7 | "Use a different model than the one that wrote the plan … (cross-model review catches blind spots)" | 4 model routing (see SKILL.md:544) | Same folk rationale. | Low | flag / align with SKILL.md fix. |
| :53–68 table + :70–78 calibration | Category table and calibration | — | Good; same register as lenses. | — | keep |

## skills/plan-sdlc/intake-verify-prompt.md (Gate A, sonnet)

**Summary.** 142 lines / 784 words; audits OpenSpec source artifacts (proposal/specs/tasks/design) before decomposition; JSON findings with per-check severity; graceful degradation on missing artifacts. Has an explicit cache-stability comment.

**Assessment: GOOD.** Judgment task, concrete severity rules with reasons, honest "skipped" channel, static prefix before variables. Nothing to change.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| — | clean | — | — | — | — |

## skills/plan-sdlc/plan-format-reference.md

**Summary.** 703 lines / 5,014 words; the plan document spec: section order, per-task block, Contract block with three worked examples, render-don't-narrate catalog (8 surfaces, BAD→GOOD), code-ref anchoring, scorecard, OpenSpec appendix, template contract, communication style, full example plan. Read by the opus author ("Read first") and the content-coverage lane each dispatch.

**Assessment: GOOD.** This is the format-pinning reference the keep list protects (worked examples on a genuinely format-sensitive output). The Communication Style section is positive style guidance (no anti-formatting rules). Minor:

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| :696–699 | "What NOT to include: … Superpowers-specific directives or REQUIRED SUB-SKILL headers" | 1d fossil / recency trap | Refers to another plugin's conventions; no current model would add them. | Low | remove bullet. |
| :694–697 | "EXCEPTION (R46)… See `## Concrete Artifacts`" nested exceptions | 1c | Readable but the exception-of-exception phrasing is a diff artifact. | Low | rewrite as one positive sentence. |
| :601–623 | Communication Style bullets | — | Author's quality bar; keep. | — | keep |

**Cost.** ~6.5k tokens, loaded twice per iteration (author + lane). Fine; it earns its place as the calibration standard.

## skills/plan-sdlc/plan-template-default.md

**Summary.** 32 lines / 189 words; data file (required sections with narrative/conditional markers, discovery questions, verification patterns). Read by author and content lane.

**Assessment: GOOD.** Pure configuration; clean.

## skills/plan-sdlc/state-format.md

**Summary.** 124 lines / 591 words; documents the `.sdlc/execution/plan-*.json` integrity marker (schema, lifecycle, GC). Not loaded by the model in the normal flow (SKILL.md summarizes the lifecycle at :164–167).

**Assessment: GOOD.** Reference documentation; matches `plan.js` and `stop-plan-integrity.js`. SKILL.md:164–169 duplicates its lifecycle rules in prose "that callers do NOT need to implement" — that paragraph is explanatory, not instruction; harmless (keep-list 8), could be a one-line pointer.

---

## Group summary

**Highest-impact findings (prose).**

1. **Deterministic work assigned to LLM dispatches (High).** The file-existence lane (G4/G10) is entirely `fs.existsSync` + set intersection; the static lane's G3/G12 duplicate PF4 which already runs in `validate-plan-format.js`; the guardrail lane is dispatched even when its output is a constant; G17 is a glob-matching/ranking engine written as prose with one real judgment step (B1–B4); the main Opus agent is asked to snapshot seven data structures for material-change detection, union/dedup lane JSON, verify `{G1..G21}` coverage and tally scorecard counts. Moving these into `plan.js` / `validate-plan-format.js` removes 1–2 dispatches per run outright, shrinks G17 to a small call, and takes bookkeeping out of the most expensive model in the pipeline. This is the biggest cost and reliability lever in the group.

2. **Stale tool-contract facts (High).** `run_in_background: false` and `mode: bypassPermissions` do not exist on the current Agent tool (SKILL.md, orchestrator, g17 prompt, plan-reviewer prompt); `hooks/context-stats.js` / `UserPromptSubmit` do not exist so the Step 7 `/compact` advisory is dead code; `TodoWrite` and `LSP` are not in the current tool list. These make the model spend effort reconciling instructions with reality or emit invalid arguments.

3. **Change-log phrasing in model-facing text (Medium).** "Purely additive — MUST NOT remove existing gate evaluation", "status quo preserved", "update the existing Option 3 text", "G19 promoted / G20 additive", 34 GitHub issue references, and an author-facing "reuse canonical wording" note. Rewrite as if the current rules are the only rules; keep `R<n>` refs (AGENTS.md convention), drop `#<n>`.

4. **Model routing is top-heavy without an effort dial (Medium).** Opus author + sonnet orchestrator that may spawn opus discovery agents + 5 lanes + 3 lenses = 15–30 dispatches, none with `effort` set. Sonnet 5.5 at medium is the documented sweet spot for code reading and review; cap discovery agents at sonnet, run haiku lanes at low effort, and expose a `--quality` lever (as ship-sdlc does) so the opus author and opus lenses are opt-in. The "opposite model" lens rule is really a cost choice and should be labeled as one.

5. **Lightweight plans pay the full 14k-token SKILL load (Medium).** Split the full-pipeline dispatch contracts and the OpenSpec flow into reference files loaded on their branches.

**Counts.** High: 14 · Medium: 17 · Low: 11. By pattern: Group 4 (LLM-executor / routing) 13, Group 2 (stale facts / contradictions / history) 14, Group 1c/1d (repetition, migration-relative, meta) 12, 1e 3.

**Ratings.** SKILL.md NEEDS-REWORK (structure, not content); plan-explore-orchestrator NEEDS-TUNING; lane-file-existence NEEDS-REWORK (→ script); g17 prompt NEEDS-REWORK (→ script + small LLM step); lane-static NEEDS-TUNING; lenses + plan-reviewer NEEDS-TUNING (contract); lane-content-coverage, lane-guardrail, intake-verify, plan-format-reference, template, state-format GOOD.

**Out of scope, noted for other groups:** `scripts/lib/dispatch-budget.js:17` says "Claude 4 family: all models have 200K token input limit" — Claude 5.x models have 1M context; execute-plan group should re-check budgets. `hooks.json` PostToolUse matcher `Bash|TodoWrite` references the same missing tool.
