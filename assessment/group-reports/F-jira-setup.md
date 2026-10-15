# Group F audit — jira-sdlc and setup-sdlc

Audit date: 2026-10-15. Plugin: sdlc-utilities v0.21.29.
Scope: `plugins/sdlc-utilities/skills/jira-sdlc/**` and `plugins/sdlc-utilities/skills/setup-sdlc/**`.
Target model: both skills pin `model: sonnet` → Claude Sonnet 5.5 (effort default `high`; follows tool-use discouragement literally; mid-turn text after a tool result read as possible injection). Supporting files inherit the skill's pin.
Method: prompt-audit (Groups 1–4, keep list), Anthropic "Prompting best practices" (2026-10-15), Sonnet 5.5 behavioral deltas.
Provenance was taken with `git log -S` (the working tree has ~1,100 uncommitted modifications, so `git blame` reports "Not Committed Yet" on every line).

Verification of volatile specifics was done against `scripts/` (flags grepped from each script, exports from `lib/config.js`, section ids from `lib/setup-sections.js`). Nothing was run except read-only greps and `git log`.

---

## plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md

**Summary.** User-invocable skill (640 lines, ~5,800 words, ~8k tokens) that drives every Jira operation through the Atlassian MCP: cache init (6 phases of MCP discovery), operation classification, critique → approval → link-verification gates, dispatch, post-op cache update, error-recovery ladders with MCP-failure telemetry. Loads in full on every `/jira-sdlc` trigger; read by Sonnet 5.5. Reference files (`REFERENCE.md`, `operations-reference.md`, `EXAMPLES.md`) are loaded on demand — `operations-reference.md` always (Step 3 says read it after classification), `REFERENCE.md` only "Section 2" on edit errors, `EXAMPLES.md` never referenced from SKILL.md.

**Assessment: NEEDS-REWORK.** The skill carries a complete enforcement subsystem (payload hash, critique artifact, approval token, PreToolUse hook, hook-block telemetry class) that the spec (R21, G13) and git history (commit 4013a96, #452) say was deleted — SKILL.md still instructs the model to run it, then contradicts itself in the DO-NOT list. That is the single most expensive finding in the group: every write op pays for two `node -e require(...)` ceremonies that nothing consumes, plus the hash-mismatch diagnostics prose. Beyond that, the tool-contract material is excellent and must stay (Keep-list 4), the cache protocol is well reasoned, and the step scripts for fragile operations (bash traps, exact MCP shapes) are the right degree of freedom. The remaining findings are classic Group 1/2: a 23-line DO-NOT wall, several pressure-language lines without a "because", a stale example surface, and R-number archaeology.

| Location | Evidence | Pattern | Why it matters on Sonnet 5.5 | Conf. | Action |
|---|---|---|---|---|---|
| SKILL.md:346-352, 365-369 | "Compute `payload_hash` and write the critique artifact … `writeCritique(hash, …)`"; "write the approval token: `writeApprovalToken(hash)`" | 2 contradiction (spec) / 1d unenforced instruction | `docs/specs/jira-sdlc.md` R21: "There is no `payload_hash`, no `critique-<hash>.json` / `approval-<hash>.token` artifact handshake … `lib/payload-hash.js` and `lib/artifact-store.js` lose their hook consumer." No code path reads these artifacts (grep: only `artifact-store.js` itself mentions the hook). The model spends two Node invocations per write op producing files nobody checks, and the `require('./lib/…')` relative path is ambiguous from a Bash cwd. | High | **remove** steps 2.5.3 and 2.6.3; keep the critique *display* (2.5.4) and the AskUserQuestion gate (2.6.1-2). Also remove lines 559, 581 (DO/DO NOT artifact rules). |
| SKILL.md:424 | "The PreToolUse hook (`hooks/pre-tool-jira-write-guard.js`) re-derives the hash … and BLOCKS dispatch otherwise (R21)." | 2 volatile specifics / 2 contradiction | File does not exist (`hooks/` listing), not registered in `hooks.json`, deleted in 4013a96. Line 582 of the same file says it "was intentionally removed". Model must reconcile two opposite statements about its own enforcement boundary. | High | **rewrite**: "Precondition for any write: Step 2.6 returned `approve` and Step 2.7 passed. There is no harness-side guard — the approval prompt is the only gate." |
| SKILL.md:426-441 | "MCP failure telemetry on hook deny (R27/R28 — R21 path): When the PreToolUse hook blocks…" (whole block incl. `HOOK_HASH`, `--class hook-block`, `--record-occurrence`) | 1d fossil / 4 dead path | Unreachable: no hook exists to deny. 16 lines of bash the model may try to execute on an imagined deny. | High | **remove** block. |
| SKILL.md:547, 549 | G13 "No write MCP call dispatched without the PreToolUse hook successfully verifying R21 artifacts"; G15 "blocked deterministically by `hooks/pre-tool-jira-write-guard.js` (R25.2)" | 2 contradiction (spec G13 says the opposite) | Quality-gate table claims deterministic enforcement that does not exist; spec G13 says "validation is LLM-prose-only". | High | **rewrite** G13 → "No write MCP call without an `approve` answer (Step 2.6) and a surfaced critique (Step 2.5)"; G15 → "Acceptance-Criteria checklist shape is checked in the Step 2.5 critique (R25.2)". |
| operations-reference.md:21, 27, 76-77, 111, 160, 192, 219, 263 | "The PreToolUse hook … verifies the artifacts … and BLOCKS dispatch"; "Diagnosing hash mismatches: … `${TMPDIR}/jira-sdlc-debug/<hookHashPrefix>.json`"; "On hook block (R21): surface permissionDecisionReason verbatim" ×6 | 2 contradiction | Same dead subsystem restated in the always-loaded operations file; the hash-mismatch diagnostic paragraph describes a dump no code writes. | High | **remove** the "Diagnosing hash mismatches" paragraph and every "On hook block" line; **rewrite** canonical steps 5-6 to "critique → surface block" and "AskUserQuestion approve/change/cancel". |
| REFERENCE.md:547-552 vs templates/*.md + SKILL.md:345, 560, 584 | REFERENCE §4 (scope: "all content (descriptions and comments)"): "Task lists `- [ ]` — Broken or Unsupported — Avoid … renders as literal `[ ]`". R25 (SKILL.md:345): "`## Acceptance Criteria` section body is exclusively `- [ ] …` checklist items"; 6 of 9 templates contain `- [ ]`. | 2 contradiction | Two files loaded in the same operation rule oppositely on the same syntax. R25 is newer (d679e48, #412) than §4 (original skill). Jira Cloud's markdown→ADF path renders task items, so the §4 claim is most likely stale for descriptions; for comments `markdown-to-adf.js` owns the question. | High | **rewrite** REFERENCE §4 row: scope the task-list warning to *comments* ("`markdown-to-adf.js` does not emit taskList nodes") and state that descriptions use `- [ ]` for Acceptance Criteria per R25. (Proposed only — direction is an assumption; confirm renderer behavior.) |
| EXAMPLES.md:150-166, 608-650 | Create examples use `description: "## Objective\n…## Approach\n…## Done Criteria"`; bulk example same | 1c example over-indexing / 2 contradiction | R18 (SKILL.md:578, 544): free-form descriptions are prohibited; every description must come from a template whose headings are `Objective / Details / Acceptance Criteria / Development Plan / How to Test / Release Notes`. The only gold outputs in the skill freeze the pre-R18 shape; if the model opens EXAMPLES.md it will match them. | High | **rewrite** the three create/bulk examples to a template-shaped description. |
| EXAMPLES.md:610 | "Progress pattern for creating multiple issues in sequence." | 2 contradiction with operations-reference.md:285 "Execute independent operations in parallel" | Sonnet 5.5 runs independent tool calls in parallel by default; the example teaches serial dispatch with a progress line after each. | Med | **rewrite** to "independent creates go out in one parallel batch; report after the batch". |
| SKILL.md:562-585 | DO NOT list: 23 lines | 1c prohibition list / 1e provenance | Many lines restate contract already in Gotchas/REFERENCE (duplication the model must reconcile); several have no stated reason ("Retry a failed operation more than once without diagnosing", "Generate unstructured descriptions when a template is available"). Keep the ones with a business reason (ADF for comments, never fabricate enum values, approval before write). | Med | **rewrite** into ≤8 positively-stated constraints with reasons; drop restatements of Gotchas/REFERENCE. |
| SKILL.md:582 | "…the Step 2.6 `AskUserQuestion` prompt is now the sole enforcement boundary … Never skip it, even when invoked from another skill or pipeline context" | 1d migration-relative phrasing ("is now") | Diff-against-previous-version wording; keep the rule, drop the history. | Med | **rewrite**: "The Step 2.6 approval prompt is the only gate before a write. It applies when another skill or pipeline invokes jira-sdlc too, because `--auto` is not a jira-sdlc flag." |
| SKILL.md:372, 374, 386-388 | "HARD GATE"; "the skill MUST NOT construct ctx JSON"; "Do NOT dispatch … Do NOT retry. Do NOT edit URLs … Do not bypass." | 1a pressure language | The gate is legitimate (script-enforced, reasoned). The caps/stacked negatives add nothing on Sonnet 5.5, which follows the plain rule; the register bleeds into cautious behaviour elsewhere. | Med | **rewrite** to plain voice: "On non-zero exit, show the violation list and stop; the payload is not sent. Fixing URLs needs user input." |
| SKILL.md:391-402 + 416, 441, 463, 521, 614 | "Telemetry helper conventions… `ANALYZE_JSON` … is NOT an object. To use `.proposal.title` … parse explicitly:" + node one-liner, then "Read `ANALYZE_JSON.proposal.title`… present verbatim with prompt 'Y (file issue) / edit / skip'" ×5 | 4 LLM executor for deterministic plan / 1c padding | Five near-identical bash+prose blocks (~70 lines) implement one deterministic routine: telemetry → analyze → present → dispatch error-report-sdlc. The repetition costs tokens on every load and invites drift (the five blocks already differ in `--step` strings). | Med | **move**: define "MCP-failure gate(class, tool, rPath, step)" once and reference it at the five sites. Better: let `mcp-failure.js --analyze` print the ready-to-show proposal text and the `error-report-sdlc` arg string so the model only relays. |
| SKILL.md:17-27 | "## When to Use This Skill (implements R16)" … "When the user asks anything Jira-related" | 2 trigger text duplicated in body | Routing lives in the frontmatter description (already ~25 triggers). Body copy is dead weight at load time. | Low | **remove** section (trigger text stays in frontmatter). |
| SKILL.md:15 | "**Announce at start:** 'I'm using jira-sdlc (sdlc v{sdlc_version}).'" | plugin-wide convention | Cross-cutting; see hooks group. | Low | flag (group G) |
| SKILL.md:353, 394-395 | "(R21.1)… `trimEnd` inside `canonicalize()`"; "Cross-step session counting … `SDLC_SESSION_ID` … marker file" | 2 history narrative | R-number references are project convention (AGENTS.md) — keep. R21.1 is a removed requirement; the session-id implementation aside is archaeology. | Low | **remove** line 353; keep R refs. |

**Efficiency & cost.**
- Load cost ~8k tokens for SKILL.md + ~2.4k for operations-reference.md on every invocation; a read-only `view` pays for the entire write-gate machinery it never uses. Consider splitting: keep classification + read ops in SKILL.md, move the write pipeline (2.5–2.7, error ladders, telemetry) to `write-ops.md` loaded only for write classes — Sonnet 5.5 follows "read X when Y" reliably.
- Removing the dead artifact handshake saves 2 Node spawns + ~30 lines of model output per write op.
- Cache init (Step 1) is 6 phases of MCP calls the model orchestrates and then assembles into JSON by hand; Phase 4-5 are N parallel calls whose outputs it must merge. The *field-type mapping* and *cache assembly* are deterministic → could be `jira.js --assemble` taking raw MCP JSON on stdin. Keep the LLM only for the MCP calls themselves.
- Model/effort: Sonnet 5.5 is appropriate (judgment in template filling, JQL authoring). No `effort` is set; the skill is form-filling plus one critique — `medium` would hold quality and cut thinking on every AskUserQuestion round-trip.
- Caching hazard: none intrinsic; `$ARGUMENTS` and the version-announce line are the only volatile tokens near the top.

---

## plugins/sdlc-utilities/skills/jira-sdlc/REFERENCE.md

**Summary.** 596 lines / ~4k words: cache schema, exact MCP parameter tables for 16 tools, field-shape table, JQL cookbook, markdown safety rules, HTTP error table. Loaded on demand (SKILL.md: "Read `./REFERENCE.md` Section 2 only" on edit 400s; setup-dimensions.md also globs for it). Sonnet 5.5.

**Assessment: GOOD (NEEDS-TUNING on two rows).** This is the man page the Group 3 rubric asks for — parameter semantics, shapes, failure modes, what each call returns. It should stay this size or grow. Issues: the "Universal Rules" block duplicates SKILL.md's DO-NOT in caps; §4's task-list row contradicts R25; the transition rule contradicts the skill's cache-first design.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| REFERENCE.md:547-552 | task-list row | 2 contradiction | see SKILL.md table | High | rewrite (as above) |
| REFERENCE.md:285-288, 346-348 vs SKILL.md:540 + operations-reference.md:145-162 | "Do not rely on cached transition IDs … call this fresh when transitioning" / "Always call `getTransitionsForJiraIssue` first" vs Quality Gate "Transition `id` from cache *or* fresh" and Transition step 4 (cache first, live on miss) | 2 contradiction | Reference says always-live; skill says cache-first with auto-refresh on 400. The model will pick whichever it read last. Cache-first (R14 unsampled markers) is the newer, intended design. | Med | **rewrite** REFERENCE 285-288/346-348 to the cache-first rule with the live fallback. |
| REFERENCE.md:196-209 | "ALWAYS: … NEVER: …" block | 1a caps + working redundancy | Content is correct and reasoned elsewhere; this is a third copy in shout-case. | Low | **rewrite** to sentence case. |

**Efficiency.** Right-sized; the 16-tool table is exactly what prevents 400s. Add a 4-line index at the top ("create/edit → §1 CRUD + §2; search → §3; comment → §4; errors → §5") so the model loads only the section it needs.

---

## plugins/sdlc-utilities/skills/jira-sdlc/operations-reference.md

**Summary.** 288 lines / ~1.8k words. Per-operation 8-step procedures (create, edit, search, transition, comment, link, assign, worklog, view, bulk). Loaded after Step 2 classification on every invocation. Sonnet 5.5.

**Assessment: NEEDS-TUNING.** Good degree of freedom for the fragile parts (payload shapes, link direction semantics, ADF conversion command). Carries the dead hook/hash machinery (High, logged under SKILL.md) and repeats the R17/R20 steps verbatim in all six write procedures.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| operations-reference.md:14-27, 61-69, 105-108, 153-157, 186-189, 213-216, 257-260 | canonical 8-step block, then steps 5-6 ("Critique … writeCritique(hash…)" / "Approval gate … writeApprovalToken(hash)") restated in each of six operations | 1c padding (repetition) + 2 contradiction (hash) | The header already defines the canonical sequence; restating steps 5-7 six times is the duplicated-rule pattern. With the hash removed, each restatement collapses to one line. | Med | **rewrite**: per-op sections keep only op-specific steps (1-4, 7-8) and say "then canonical steps 5-6". |
| operations-reference.md:51 | "NEVER leave raw {placeholder} or [bracketed prose]" | 1a | Rule is reasoned in SKILL.md:46-47 and REFERENCE §4; caps copy here. | Low | rewrite plain or remove. |
| operations-reference.md:285 vs EXAMPLES.md:610 | parallel vs in-sequence bulk | 2 contradiction | logged above | Med | fix EXAMPLES. |

---

## plugins/sdlc-utilities/skills/jira-sdlc/EXAMPLES.md

**Summary.** 655 lines / ~2.7k words of copy-paste MCP call examples for every operation incl. the 6-phase init. Not referenced from SKILL.md or operations-reference.md (only from setup-dimensions "see also"); effectively dead unless the model discovers it. Sonnet 5.5.

**Assessment: NEEDS-REWORK.** Examples are the strongest steering signal in a prompt, and these encode pre-R18 free-form descriptions and sequential bulk creation. Either bring them to the current contract or delete the file — a stale example surface is worse than none.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| 150-166, 168-192, 194-214, 608-650 | free-form `description:` strings with non-template headings | 2 contradiction / 1c example over-indexing | logged above | High | rewrite |
| 610 | "in sequence" | 2 contradiction | logged above | Med | rewrite |
| whole file | no inbound reference from SKILL.md | 2 dead content | If meant as progressive disclosure, SKILL.md needs "for an exact call shape see EXAMPLES.md §N"; otherwise 2.7k words nobody loads. | Med | **add** an index line in SKILL.md Step 3, or **remove** the file. |

---

## plugins/sdlc-utilities/skills/jira-sdlc/templates/*.md (9 files, 352 lines)

**Summary.** Description templates (Bug, Epic, Spike, Story, Sub-task, Task, Test Case, Test Plan) plus `McpFailure.md` (error-report body for R28). Loaded one at a time on create/edit, or copied to `.sdlc/jira-templates/`. Filled by Sonnet 5.5.

**Assessment: GOOD.** Format-pinning on a genuinely format-sensitive output (Keep-list 7); bracketed instructions are explicit and short; R25's terse-bullet shape is baked in; the one carve-out (`Release Notes`) carries its reason inline. No findings. (They are the newer, authoritative side of the REFERENCE §4 conflict.)

`lib/artifact-store.js`, `lib/payload-hash.js`, `lib/placeholder-detect.js`, `lib/template-fingerprint.js`: deterministic helpers; the first two have lost their consumer per spec R21 (dead code once the SKILL.md steps are removed).

---

## plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md

**Summary.** User-invocable wizard (734 lines, ~5,550 words, ~7.5k tokens): pre-flight via `setup.js`, numbered-menu section selection, legacy migration, per-section dispatch (generic field loop, inline commit/PR builders, delegated sub-flows), diff preview, write via `setup-init.js`, validation, summary. Loaded in full on every `/setup-sdlc` trigger. Sonnet 5.5.

**Assessment: NEEDS-REWORK.** The manifest-driven design (all labels/fields from `setup-sections.js`, `menuInputContract` parsed as data) is exactly right and the fragile-op scripts (migration, diff preview, write) are correctly exact. But ~125 lines describe two sections (`workspace`, `hooks`) that `setup-sections.js` explicitly says were removed; the file contradicts itself on whether to use AskUserQuestion for the menu; it references scripts that do not exist; and step numbering/legacy tables narrate history. The scan phase (§3.S + scan-patterns.md) is the clearest "LLM executing a deterministic plan" in the group: ~50 Glob calls plus file reads orchestrated by the model on every dimensions/PR-template run.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| SKILL.md:417-522 (§3.workspace) | "fields from `scripts/lib/workspace-fields.js::WORKSPACE_FIELDS`"; "`scripts/skill/setup.js` → `scripts/lib/workspace-context.js`"; `layoutField.help(…)`, `templateField.preview(…)` | 2 volatile specifics (contradicted by repo) | Neither file exists. `setup-sections.js:56-57, 290-291`: "workspace-fields removed (issue #378, #379): workspace is auto-detected — no placement wizard / workspace section … the workspace placement section [is] gone". No `workspace` id in the section list. 106 lines the model can only fail on. | High | **remove** §3.workspace and the "3g workspace" row at 578. |
| SKILL.md:524-539 (§3.hooks) | "The `hooks` section … `agentIsolationGuard.enabled` … Block Agent SDK `isolation: "worktree"` parameter?" | 2 volatile specifics | `setup-sections.js:517`: "`hooks` section removed (issue #370, #372) … all 3 PreToolUse guards deleted". No `hooks` id. | High | **remove** §3.hooks and row 579. |
| SKILL.md:150-161 vs 695 | Step 1 Phase 3: "Ask via plain chat (NOT `AskUserQuestion`) … Do NOT wrap this in `AskUserQuestion`" vs DO NOT: "Skip AskUserQuestion for any user interaction -- do not print questions and wait for freeform input" | 2 contradiction (same file) | Opposite rules on the same point, 540 lines apart. Step 1 is newer (8ebec6a, #337) and carries its reason; the DO-NOT line dates from b0dec68 (#86). The DO-NOT wall is at the end, where recency weighs. | High | **rewrite** 695: "Use AskUserQuestion for every answer *except* the Step 1 menu reply, which is a plain chat prompt (#337)." |
| SKILL.md:617 | "ask the user to confirm the diff via AskUserQuestion (suppressed when `--auto` is set; auto mode proceeds to write)" | 2 volatile specifics | setup-sdlc has no `--auto` flag (argument table 21-35; `setup.js` flags: `--force --list --migrate --only --skip --sort --steps --unset-only`). Phantom branch. | High | **remove** the parenthetical. |
| SKILL.md:91, 615, 639, 651; setup-openspec.md:46 | "Steps 1 → 2 → 3 → 5"; "Step 3b validation"; "Return to the parent skill (Step 5 summary)" | 2 stale cross-refs | Summary is Step 4; there is no Step 5. The model is told to route to a step that does not exist. | Med | **rewrite** to current numbers (or renumber: 0 pre-flight, 1 menu, 2 migrate, 3 dispatch, 4 write+validate, 5 summary). |
| SKILL.md:566-580 | "#### Legacy section reference — The historical step labels map onto the dispatcher above for anyone updating tests or docs: 3a…3h" | 2 history narrative | Written for maintainers, loaded by the model every run. Two of the eight rows point at removed sections. | Med | **move** to `docs/skills/setup-sdlc.md` (or delete). |
| SKILL.md:284, 26, 24 | "For sections with `delegatedTo: null` (`version`, `ship`, `jira`, `review`):"; `--only` valid ids; `--skip` valid values | 2 volatile | `received-review` also has `delegatedTo: null` (setup-sections.js:355-364) and is missing from all three lists. | Med | **rewrite** to include `received-review`. |
| SKILL.md:541-564 (§3.S) + scan-patterns.md | "Use Glob for `package.json`, `requirements.txt`, …" (13 bullets, ~25 globs) + "Run these in parallel using the Glob tool" (~50 patterns) + "Read each found file" + 4 Bash calls | 4 LLM executor for a deterministic plan | Every input is a filename test; the output is a signal bag. `guardrails.js` already does this scan in Node for the guardrails sub-flow (setup-guardrails.md Gotchas: "skill/guardrails.js is the source of truth for scanning. Do not duplicate its Glob/Read logic") — the plugin has both designs and the dimensions path uses the expensive one. On Sonnet 5.5 this is 50+ tool round-trips, each a thinking step at `high` effort, before any judgment happens. | High | **move** the scan into `setup.js` (or a `scan-project.js` sharing `guardrails.js`'s detector) and emit `signals` in the prepare output; §3.S becomes "signals come from `prepare.scan`". Keep the LLM for the PLAN step. |
| SKILL.md:545-547 | "Shell safety: Use the Glob tool … Do NOT use Bash `ls` with glob patterns — zsh (macOS default) errors on unmatched globs." | 1d recency-trap workaround | A session stumble encoded as a rule; disappears with the finding above. | Med | remove with §3.S. |
| SKILL.md:689 (also setup-guardrails.md:107, setup-execution-guardrails.md:82) | "Run full-suite or wide-subset `promptfoo eval` automatically — single targeted test scoped to the change is allowed…" | 2 misplaced rule | The marketplace repo's AGENTS.md development policy copied into an end-user skill. End users' projects have no promptfoo; the line costs tokens and muddles the quality bar. | Med | **remove** from all three files. |
| SKILL.md:140, 254, 329 | "All strings MUST come from the manifest … do NOT hardcode"; "Do NOT rewrite, paraphrase, or omit any of these four lines"; "You MUST issue exactly one AskUserQuestion per … — the manifest owns the list." | 1a pressure language (with reason) | These guard a tested rendering contract and carry their "because" — the right place for emphasis. Flag for register only. | Low | flag; optionally lowercase. |
| SKILL.md:66, 96, 107, 184, 307, 419, 526, 582 | `<!-- Implements R-menu-1, R-menu-4. Fixes #337. -->`, "(R-SCRIPT-VERSIONS, #424)", "(issue #235)" | 2 history narrative | R-ids are project convention (keep). Issue numbers are archaeology. | Low | strip `#NNN` from prose, keep R refs. |

**Efficiency & cost.**
- ~7.5k tokens per load; removing §3.workspace, §3.hooks, the legacy table and the scan choreography takes out ~190 lines (~1.9k tokens) of dead or movable content.
- The scan phase is the big runtime cost (50+ tool calls × Sonnet 5.5 thinking at default `high`). Moving it into the prepare script removes it and makes the result reusable across sub-flows for free.
- Model/effort: Sonnet 5.5 fits the judgment steps (dimension/guardrail proposals). The wizard loop itself (≈26 AskUserQuestion sites) would be cheaper at `effort: medium`; nothing here needs `high`.
- Caching: `$ARGUMENTS` is interpolated into the Step 0 bash block near the top; harmless for Claude Code's prefix caching (skill body injected once), noted for completeness.

---

## plugins/sdlc-utilities/skills/setup-sdlc/setup-dimensions.md

**Summary.** 2.1k words. Sub-flow for `--only review-dimensions`: discover existing dimensions, propose from `dimension-catalog.md` against scan evidence, critique/improve, present, write files, validate with `validate-dimensions.js`, optionally generate Copilot mirrors via `dimension-to-instructions.js`. Loaded only when that section is selected. Sonnet 5.5.

**Assessment: NEEDS-TUNING.** PLAN→CRITIQUE→IMPROVE→DO is the plugin's house style and the critique gates are concrete (trigger specificity, overlap, evidence). Three fossils, one resolution rule that contradicts the plugin convention, and a "CRITICAL" banner aimed at an eval harness.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| setup-dimensions.md:7-10 | "> **CRITICAL — Inline output only.** … Never write 'the simulated output is complete above' … If no files can be written (simulation context), still emit the full proposed dimension YAML/Markdown inline." | 1c grader vocabulary / 1d fossil | Describes the promptfoo simulation harness to the production model. Sonnet 5.5 reads "simulation context" as a real mode and may dump YAML inline in real runs. | High | **remove** (put the requirement in the promptfoo test rubric). |
| setup-dimensions.md:154 | "Invoke error-report-sdlc — Glob `**/error-report-sdlc/REFERENCE.md`, follow with skill=review-init-sdlc" | 2 volatile | `review-init-sdlc` no longer exists (SKILL.md:691 lists it as removed); Glob-for-REFERENCE contradicts the `<PLUGIN_ROOT>` convention. | High | **rewrite**: "dispatch `error-report-sdlc` with `--skill setup-sdlc --step 'dimensions: Step 7'`". |
| setup-dimensions.md:17-20 | "Locate them using Glob with `path: ~/.claude` and pattern `**/review-sdlc/REFERENCE.md`. If not found, retry Glob with the default path (cwd)." | 2 contradiction with plugin convention | Every other file says "Substitute `<PLUGIN_ROOT>` … Do not run `find`". A home-directory glob can match other plugin versions' copies. | High | **rewrite** to `<PLUGIN_ROOT>/skills/review-sdlc/REFERENCE.md`. |
| setup-dimensions.md:33, 182, 186 | "provided … in Step 4"; "Step 1 in parent"; "Step 1 GitHub hosting detection in parent" | 2 stale cross-refs | Parent's scan is §3.S; there is no Step 1 scan or Step 4 in the parent. | Med | rewrite to "parent §3.S". |
| setup-dimensions.md:226-229 | Gotcha: "Glob pattern count explosion. Step 1 runs ~35 glob patterns … if Glob returns >500 paths, sample the first 20." | 4 LLM executor | Evidence for moving the scan to code. | High | goes away with the scan move. |
| setup-dimensions.md:201-212 | "Field mapping reference (for understanding the transformation)" table | 1c padding | Explains what `dimension-to-instructions.js` does; the model only invokes it. | Low | **move** to docs. |
| setup-dimensions.md:233 vs 160-163 | Gotcha "Check `gh auth status` at the start of Step 8" — not in Step 8's text | 2 unenforced | Contract lives in a gotcha, not the step. | Low | **add** the check to Step 8. |

---

## plugins/sdlc-utilities/skills/setup-sdlc/setup-guardrails.md and setup-execution-guardrails.md

**Summary.** 740 / 595 words. Near-identical sub-flows: run `guardrails.js` (`--mode init|add`; `--target execute` for the second), let the LLM review/filter proposals, present, collect customs, write via `writeSection`, validate with `validate-guardrails.js`. Loaded on section selection. Sonnet 5.5.

**Assessment: GOOD.** The right split: the script scans and proposes, the model "reviews and filters, not generating from scratch". Flags verified (`--mode --target --project-root --json`; `writeSection`; `--section execute`). One roster-level finding.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| both files (whole) | same 4-step flow differing only in `--target execute`, `writeSection(…,'execute',…)`, `--section execute`, and the custom-guardrail prompt shape (Stage A/B vs `custom` option) | 4 redundant specialist definitions | Two files for one flow with one parameter; they have already drifted (Stage B "always-on" and the `[category]` tag rule exist only in the plan variant). | Med | **move**: one `setup-guardrails.md` taking `target ∈ {plan, execute}`; parent passes it. |
| setup-guardrails.md:107 / setup-execution-guardrails.md:82 | promptfoo rule | 2 misplaced | see SKILL.md:689 | Med | remove |

---

## plugins/sdlc-utilities/skills/setup-sdlc/setup-pr-labels.md

**Summary.** 1.6k words. Configures `pr.labels` (off / rules / llm): `gh label list`, idempotency check, mode prompt, rules loop with five signal types, merge-write via `readSection`/`writeSection`, confirm. Loaded on selection. Sonnet 5.5.

**Assessment: GOOD.** Prescriptive where it should be (merge-write to avoid clobbering siblings, label must exist in repo, no write on cancel), each rule with its reason. The five symptom/root-cause/mitigation Gotchas are well-written context (Keep-list 1).

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| setup-pr-labels.md:197, 267 | "The written JSON validates against `schemas/sdlc-config.schema.json`"; See Also `schemas/sdlc-config.schema.json#$defs/prLabelsSection — schema source of truth` | 2 volatile specifics | No such file anywhere in the repo. The quality gate cannot be performed. | High | **remove** both references (or point at the real schema if one exists). |
| setup-pr-labels.md:94-98 | "When `repoLabels.length > 10`, paginate the options and add a **search** option…" | wrong degrees of freedom (mild) | AskUserQuestion takes 2-4 options; the model must invent pagination UI. | Low | optional add: "3 labels + *more…* per page". |

---

## plugins/sdlc-utilities/skills/setup-sdlc/setup-pr-template.md

**Summary.** 1.45k words. Drafts `.sdlc/pr-template.md` from scan signals, critique/improve, present/edit loop, write, validate via `validate-pr-template.js`. Loaded on selection. Sonnet 5.5.

**Assessment: NEEDS-TUNING.** Judgment task with good adaptation rules and a concrete critique list. One stale command, several stale cross-references, and Gotchas that prescribe behavior for the *parent* that the parent does not implement.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| setup-pr-template.md:112-116 | "Create the `.claude/` directory … `mkdir -p .claude` … Write the accepted template to `.sdlc/pr-template.md`." | 2 volatile / fossil | Creates the wrong directory; `.sdlc/` is the target (setup.js:146-148: ".claude/pr-template.md … deprecated"). Left over from the pre-#260 location. | High | **rewrite** `mkdir -p .sdlc`. |
| setup-pr-template.md:170-178 | Gotchas 1-2: "*Mitigation:* Parent should also check for `.github/PULL_REQUEST_TEMPLATE/` as a directory…"; "the parent asks the user for the project key explicitly before invoking this sub-flow" | 2 contradiction (parent does neither; §3.S lists only the two single-file paths) | Prescribes parent behavior that is not in SKILL.md; the sub-flow model cannot act on it and the parent never reads it. | Med | **move** the directory check into the parent scan (or the scan script); delete or implement the Jira-key mitigation. |
| setup-pr-template.md:150-153 vs 184-187 | Error table "`validate-pr-template.js` not found → stop → error-report: Yes" vs Gotcha 3 "If the script is not found, skip validation and warn the user … rather than blocking" | 2 contradiction (same file) | Two opposite recoveries for the same error. | Med | pick one, delete the other. |
| setup-pr-template.md:235 | "`scripts/validate-pr-template.js`" | 2 volatile | Path is `scripts/ci/validate-pr-template.js`. | Low | rewrite |

---

## plugins/sdlc-utilities/skills/setup-sdlc/setup-openspec.md, setup-plan-template.md

**Summary.** 238 / 390 words. Thin wrappers: run `openspec-enrich.js` and report `action`; copy `plan-template-default.md` to `.sdlc/plan-template.md` with a replace-consent prompt and summary. Loaded on selection. Sonnet 5.5.

**Assessment: GOOD.** Exact scripts for exact operations; consent before overwrite; reasons given ("so the shipped default is reproduced byte-for-byte"). `openspec-enrich.js` flags (`--output-file --remove --project-root`) verified.

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| setup-openspec.md:46 | "Return to the parent skill (Step 5 summary)." | 2 stale cross-ref | Parent summary is Step 4. | Low | rewrite |

---

## plugins/sdlc-utilities/skills/setup-sdlc/dimension-catalog.md, scan-patterns.md

**Summary.** 527 / 248 words. Evidence→dimension lookup table (32 rows); 50 glob→signal patterns. Loaded by the dimensions sub-flow / the parent scan. Sonnet 5.5.

**Assessment: GOOD / NEEDS-TUNING.** The catalog is reference data in the right shape (table, one place). `scan-patterns.md` is an instruction to run 50 Globs — data that belongs in the scan script's pattern list (Group 1b: data in files or tool results; logic in code).

| Location | Evidence | Pattern | Why | Conf. | Action |
|---|---|---|---|---|---|
| scan-patterns.md:3 | "Run these in parallel using the Glob tool. Do NOT read file contents" | 4 LLM executor | see SKILL.md §3.S | High | **move** patterns into the scan script; delete the file or keep as its data source. |
| dimension-catalog.md | — | — | clean | — | — |

---

## Group summary

**Highest-impact findings (in order):**

1. **jira-sdlc instructs the model to operate a deleted enforcement subsystem.** SKILL.md and operations-reference.md still direct hash computation, critique/approval artifact writes, PreToolUse-hook deny handling, and hash-mismatch diagnostics; the spec (R21, G13) and commit 4013a96 say all of it was removed, and SKILL.md:582 admits so. Every write op pays two dead Node invocations and ~70 lines of unreachable procedure, and the model must reconcile a file that contradicts itself about its own safety boundary. Remove the artifact steps and the hook-block telemetry path; rewrite G13/G15 and operations-reference steps 5-7. `lib/artifact-store.js` / `lib/payload-hash.js` then have no consumer.
2. **setup-sdlc describes two sections that no longer exist (~125 lines).** §3.workspace references `workspace-fields.js` / `workspace-context.js` (deleted, #378/#379) and §3.hooks the `agentIsolationGuard` section (deleted, #370/#372); `setup-sections.js` has neither id. Plus a phantom `--auto` branch, a same-file AskUserQuestion contradiction (Step 1 vs DO NOT), and stale step numbers. Delete the dead sections and reconcile the DO-NOT line to the newer Step 1 rule.
3. **The project scan is an LLM executing a deterministic plan.** §3.S plus scan-patterns.md have Sonnet 5.5 issue ~50 Glob calls, read manifests, and run four Bash commands to build a signal bag, while `guardrails.js` already does the same scan in Node for the guardrails sub-flow. Move the scan into the prepare script (`prepare.scan`); the model keeps the proposal/critique judgment only. This is the largest runtime cost in the group.
4. **Stale example and reference content contradicts the current contract.** EXAMPLES.md's create/bulk examples use free-form descriptions that R18 forbids and serial creation that operations-reference says to parallelize; REFERENCE.md §4 bans `- [ ]` task lists while R25 and six templates require them; REFERENCE.md says "always call getTransitionsForJiraIssue first" while the skill is cache-first. Examples are the strongest signal in a prompt — fix or delete.
5. **Setup sub-flows carry fossils:** `mkdir -p .claude` before writing to `.sdlc/`, a nonexistent `schemas/sdlc-config.schema.json` quality gate, `review-init-sdlc` as an error-report skill name, a home-directory Glob for REFERENCE.md against the `<PLUGIN_ROOT>` convention, a "CRITICAL — simulation context" banner written for the promptfoo harness, and the marketplace's own promptfoo policy copied into three end-user files.

**Counts by confidence:** High 19 · Medium 18 · Low 10 (47 findings across 16 instruction-bearing files). Clean or near-clean: `dimension-catalog.md`, `setup-plan-template.md`, `setup-openspec.md`, `setup-pr-labels.md` (one stale path), the nine Jira templates, both guardrails sub-flows (one roster merge suggested).

**Overall rating: NEEDS-REWORK** for jira-sdlc SKILL.md / operations-reference.md / EXAMPLES.md and setup-sdlc SKILL.md; NEEDS-TUNING for REFERENCE.md, setup-dimensions.md and setup-pr-template.md; GOOD for the rest.

**Model/effort/cost notes for the group.** `model: sonnet` (Sonnet 5.5) is right for both skills — template filling, JQL, dimension/guardrail proposals need judgment, and Haiku 5.5 would under-deliver on the critique gates. Neither skill sets `effort`; both are mostly form-filling around AskUserQuestion round-trips, so `medium` is the natural starting point once Claude Code honors effort in skill frontmatter (confirm with the claude-code-guide findings). Per-load token cost: jira-sdlc ≈ 8k + 2.4k (ops ref) always, up to +5k (REFERENCE) on errors; setup-sdlc ≈ 7.5k + 0.5–3k per selected sub-flow. The removals above cut ≈ 2k tokens from each SKILL.md and, more importantly, eliminate 2 Node spawns per Jira write and ~50 tool calls per dimensions/PR-template setup.
