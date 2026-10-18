# `/plan-sdlc` — Implementation Plan Writer

## Overview

Writes an implementation plan from requirements, a spec, or a user description. Operates primarily in Plan Mode — the plan file is the single source of truth, built incrementally: a skeleton header is written at the start, then filled with requirements, tasks, and critique fixes as the pipeline progresses. Produces plans in the format consumed by `execute-plan-sdlc` — with per-task complexity, risk, dependency, and `Contract:` (decided-shape) metadata embedded. Follows a PCIDCI pipeline: analyzes requirements and codebase, decomposes into classified tasks, self-critiques, presents for user approval, and runs a cross-model plan review loop.

---

## Usage

```text
/plan-sdlc
```

Provide requirements in one of three ways:
- Describe what you want to implement in the conversation (free form, bullet points, or detailed spec)
- Provide a path to a requirements or spec file
- Invoke with nothing — the skill will ask for requirements

### Auto-resolution in plan mode

When Claude Code's plan mode is active, this skill activates automatically — no explicit `/plan-sdlc` invocation needed. Describe what you want to implement and the skill loads itself.

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--spec` | Include OpenSpec artifacts (proposal, delta specs, design, tasks) in planning context. Without this flag, OpenSpec presence is detected but artifacts are not read. | Off |
| `--from-openspec <change-name>` | Direct bridge from OpenSpec to planning. Validates the named change, loads all artifacts, and uses `tasks.md` as the primary decomposition skeleton. Bypasses the gate check entirely. | Off |

Providing an explicit `openspec/changes/<name>/` path as the spec-file-path argument implicitly enables spec context loading — `--spec` is not needed in that case.

---

## Complexity Routing

Not every request needs a full planning pipeline:

| Scope Signal | Normal Mode | Plan Mode |
|---|---|---|
| 1 file, clear change | Stop — just do the work | Lightweight plan (user explicitly chose to plan) |
| 2–3 files, clear scope | Lightweight: skip exploration and review loop | Lightweight |
| 4+ files or unclear scope | Full pipeline (Steps 1–7) | Full pipeline |
| Multiple independent subsystems | Flags the split, suggests one plan per subsystem | Same |

For plans with 5+ tasks, the skill also writes a `## Key Decisions` section — placed between the plan header and the first task — capturing architecture choices with rationale so executing agents understand *why* an approach was chosen, not just what to do.

Every plan also carries a required **`## Deviations & assumptions`** section near the top (a table with `Item | asked | does | why` columns) recording where the plan diverges from what was asked and any assumptions made — so a reviewer can triage the plan in one pass. Its presence is enforced deterministically by the `validate-plan-format.js` PF6 check, not by an LLM gate. PF7 — Contract presence: every artifact-touching task (≥1 Create/Modify/Test Files entry) has a `**Contract:**` block (default check set). PF9 — Scorecard presence: `## Verification Scorecard` section present (under `--final` only; full-pipeline plans).

Each task block carries `Complexity`, `Risk`, `Depends on`, `Verify`, `Files`, and `Acceptance criteria` metadata plus a `Contract:` (decided-shape) block. The free-prose **`Notes:`** field is **optional** and rationale-only (≤5 non-blank lines) — the executable "what" lives in `Files:` + `Contract:` + `Acceptance criteria:`. (Plans written before this convention used a mandatory `Description:` field; it is renamed `Notes:` and demoted to optional.)

---

## Dynamic-Dimension Discovery (R24–R28)

For 4+ file scopes, plan-sdlc dispatches a parallel dynamic-dimension orchestrator before decomposing tasks. The orchestrator produces a `discovery-brief.md` with stable `F-<DIM>-<n>` finding IDs that every Standard/Complex task must cite.

**Step 0 — Prepare.** `plan.js` runs as today, but now also spawns `plan-explore.js`. That script walks git changes, parses backtick paths from any active OpenSpec proposal, tokenizes the user prompt, and `git grep`s for top non-stopword tokens to build a scope-hint file set (capped 30 files). It computes `webResearchSignal` from a regex over best-practice phrases plus a fixed external-tech vocab (oauth, jwt, kafka, redis, kubernetes, terraform, react, vue, angular, postgres, mongodb, graphql, grpc, websocket, oauth2, openid, saml). It writes everything to `manifest.json` inside `os.tmpdir()/sdlc-explore-<branchSlug>-XXXX/`. Output back to plan.js: `explorePack = { manifestPath, outDir, scopeHintCount, webResearchSignal, error }`.

**Step 1 — Routing.** Three branches:
- **≤3 files (lightweight):** orchestrator skipped. Inline exploration as today. No brief.
- **4+ files AND `explorePack.manifestPath != null`:** install EXIT/INT/TERM trap to wipe the tempdir, then dispatch `sdlc:plan-explore-orchestrator` exactly once with `MANIFEST_FILE`, `PROJECT_ROOT`, `USER_PROMPT`, `OPENSPEC_CONTEXT`.
- **`explorePack.error` non-null:** append a one-line note to `.sdlc/learnings/log.md`, fall back to inline exploration. Plan still produced.

**Orchestrator (the new agent).** Four steps, mirroring review-orchestrator but with a load-bearing inversion:
1. **SCOPE.** LLM-derives 3–7 kebab-case task-specific dimensions as JSON `{ name, description, files[], mode, model }`. Names are task-shaped (`auth-middleware-integration`), not generic axes. Must include ≥1 `web`/`hybrid` dimension when `webResearchSignal: true`; must include zero web/hybrid when the prompt is a pure rename/move/dead-code refactor.
2. **FAN-OUT.** All dimensions dispatched in a **single message** as parallel `general-purpose` Agent calls. Per-mode tool restriction + budget:
   - `code` → `Read, Glob, Grep`
   - `web` → `WebSearch, WebFetch`, ≤5 searches + ≤8 fetches, source-quality steer (OWASP/RFC/MDN/vendor)
   - `hybrid` → both, ≤3 + ≤5, findings tagged `[web-only | verified-in-codebase | conflicts-with-codebase]`
3. **CRITIQUE.** Dedupe by file:line / url, keep highest severity, flag contradictions, flag zero-finding dimensions, flag web-vs-codebase conflicts.
4. **CONSOLIDATE.** Write `discovery-brief.md` to `manifest.outDir` with stable IDs: `F-<DIM>-<n>: file:line — observation` (code) or `F-<DIM>-<n>: <url> — observation (recency, source-type)` (web). When web/hybrid ran, append a `## Best-Practice Synthesis` section.

**Step 2 — Decompose.** Same as today, but each Standard/Complex task must cite ≥1 `F-<DIM>-<n>` ID or be marked "out-of-scope addition" with rationale. Trivial tasks exempt. When web/hybrid ran, Key Decisions explicitly **ADOPTS**, **REJECTS-with-rationale**, or marks **NOT-APPLICABLE** each web finding by ID.

**Step 3 — Critique (5-lane parallelized).** All 21 quality gates (G1–G21) are partitioned across five lanes and dispatched in a single message as parallel Agent calls — one subagent per lane. The lanes run concurrently; Step 3 completes only after **all five lanes have returned** (JOIN barrier). Notable gates: G15 (brief-citation coverage — error severity when brief was produced, not-applicable when fallback ran), G18 (contract concreteness — error severity, blocks approval), G19 (render-don't-narrate — error severity, blocks approval; render options: fenced block / table / diff / Mermaid), G20 (Notes rationale-only — error severity), G21 (self-contained code refs — error severity). Lane 3 is the guardrail-compliance lane — `guardrailsEvaluated` fires when lane 3 returns. `critiqueRan` fires after all five lanes join.

**Step 5 — Reviewer.** plan-reviewer-prompt gains a `{BRIEF_FILE}` input plus two gate rows: *exploration provenance* (uncited Standard/Complex tasks blocking) and *best-practice traceability* (silent omission of a web finding blocking). The reviewer also uses the multi-lens fan-out (R36): review dimensions are dispatched in parallel across the same five-lane structure, with each lane receiving `{REQUIREMENTS_SUMMARY}` (the numbered requirements list captured from the Step 1 CONSUME pass) so independent lenses can check requirement coverage without repeating work. Every lane dispatch in this fan-out is issued with `run_in_background: false` and Step 5 completes only after **all five lanes have returned** (await barrier, R-c1, fixes #487/#495) — the consolidation logic increments per completed fan-out dispatch, not per lens, so results from a lane that returns fewer lenses than expected are never silently treated as a full join.

**Gate re-validation on material change (R64).** After Step 6 (IMPROVE) applies reviewer fixes, the skill snapshots seven values before and after, per task where noted: task count; each task's `Files:` path set (added or removed paths, not just additions); each task's `Contract:` block; each task's `Depends on:` value; the `## Key Decisions` entry set; each task's OpenSpec task-mapping ref (R29/R30); and the `## Deviations & assumptions` row set. A fix is **material** — `materialChangeDetected` is set — when any of: a task is added or removed; a task is re-scoped (its Files, Contract, or Depends on changed); a Key Decision is reversed or introduced; the OpenSpec task mapping changed; or a Deviations row is added or changed (R64's conservative superset — a deviations-table edit usually co-occurs with a scope or approach change worth re-validating). On the next pass through Step 5, a material change re-dispatches all five Step 3 gate lanes (G1–G21) together with the Step 5 lens reviewers in a single merged message, rather than trusting the earlier gate results to still hold — this path also preserves the error-severity guardrail-block gate (R19). This merged dispatch counts as **one** iteration of the existing review loop (increments the counter by 1, not 2), so the 3-iteration cap still applies normally. Wording-only, formatting-only, or metadata-only fixes that leave all seven snapshotted values unchanged are not material and do not trigger this re-dispatch.

**Cleanup.** Tempdir wiped by the EXIT/INT/TERM trap installed in Step 1. Orphans from crashed runs swept by `ship-sdlc --gc`, which now globs `sdlc-explore-*` alongside the existing four state-file buckets and removes by mtime + branch-liveness.

**Three modes for dimensions:**
| Mode | Tools | Budget | Output tag |
|---|---|---|---|
| `code` | Read, Glob, Grep | unlimited | `F-<DIM>-<n>: file:line — observation` |
| `web` | WebSearch, WebFetch | ≤5 searches + ≤8 fetches | `F-<DIM>-<n>: <url> — observation (recency, source-type)` |
| `hybrid` | Read, Glob, Grep, WebSearch, WebFetch | ≤3 searches + ≤5 fetches | tagged `[web-only \| verified-in-codebase \| conflicts-with-codebase]` |

**`webResearchSignal` triggers** — set to `true` when the user prompt matches any of:
- Regex (case-insensitive): `best practice`, `recommended`, `industry standard`, `state of the art`, `compare alternatives`, `alternatives to`
- External-tech vocab token (any occurrence): `oauth`, `jwt`, `kafka`, `redis`, `kubernetes`, `terraform`, `react`, `vue`, `angular`, `postgres`, `mongodb`, `graphql`, `grpc`, `websocket`, `oauth2`, `openid`, `saml`

**Lightweight-skip rule.** When complexity routing lands at ≤3 files, the orchestrator is skipped entirely. No brief, no tempdir, `explorePack.manifestPath = null`. Inline exploration is used as today.

**Fallback path.** When `plan-explore.js` fails or `sdlc:plan-explore-orchestrator` exits non-zero, plan-sdlc appends a one-line note to `.sdlc/learnings/log.md` and falls back to inline exploration. The plan is still produced — brief absence is not a plan failure.

**Brief example** (3 dimensions, one web, one hybrid):
```
## F-auth-middleware-integration
F-auth-middleware-integration-1: src/middleware/auth.ts:42 — JWT validation only checks expiry, not issuer
F-auth-middleware-integration-2: src/routes/user.ts:88 — route applies auth middleware but missing RBAC check

## F-oauth2-best-practices
F-oauth2-best-practices-1: https://www.rfc-editor.org/rfc/rfc6749 — authorization code flow requires PKCE for SPAs (2023-06, RFC)
F-oauth2-best-practices-2: https://owasp.org/www-project-top-ten/... — token storage in memory preferred over localStorage (2023-01, OWASP) [web-only]

## Best-Practice Synthesis
- ADOPT F-oauth2-best-practices-1 — PKCE is the current standard and applies to the planned OAuth2 flow
- REJECT F-oauth2-best-practices-2 — app is server-rendered; localStorage concern does not apply
```

**Contrast with review-sdlc.** review-sdlc reads a STATIC dimension registry (`lib/dimensions.js`) — same axes every run (security, performance, docs, …). plan-sdlc DERIVES dimensions per task in the orchestrator's SCOPE step. The prepare script supplies raw materials + `webResearchSignal`; the dimension JSON itself is LLM-produced because planning dimensions are unknowable at script-write time (`auth-middleware-integration` ≠ `cli-flag-parser-refactor`).

---

## Plan Mode

When Claude Code's [plan mode](https://docs.anthropic.com/en/docs/claude-code/plan-mode) is active, the skill adapts automatically:

- **Incremental plan file building:** The plan evolves in the designated file across the pipeline. Step 0 writes a skeleton header immediately and loads plan guardrails from project config. Step 1 fills in the header fields and appends a Requirements section. Step 2 appends tasks. Steps 4 and 6 rewrite the file with critique fixes applied.
- **Session recovery (autonomous default):** If a draft plan file already exists when the skill starts, it is overwritten — pre-existing drafts are discarded. Save a copy before invoking if you want to preserve it. (Fixes #388 — Step 0 is autonomous; the single user touchpoint for the finalized plan is Step 7 Handoff.)
- **User interactions (genuine decision gates only):** `AskUserQuestion` is used for requirements gathering when the spec is missing/ambiguous, scope-split prompts, OpenSpec routing, the Step 6 reviewer-loop max-iterations escalation, the Step 4 error-severity guardrail-block harden offer, and the Step 7 handoff menu. The Step 0 session-recovery prompt and Step 4 plan-approval prompt have been removed — those steps now run autonomously.
- **TodoWrite for progress tracking:** In full-pipeline runs, `TodoWrite` items are created for Steps 1–7 so you can see planning progress.
- **Handoff:** The skill calls `ExitPlanMode` at the end — Claude Code presents the plan for your review. No manual exit needed.
- **After approval:** Once you approve the plan in Claude Code's review UI, invoke `/ship-sdlc` for the full pipeline (execute, commit, review, version, PR), or `/execute-plan-sdlc` for execution only.

---

## Plan Sections

Every plan contains the following sections:

- **Context** — problem/trigger/success motivational section establishing why this plan exists and what defines successful delivery
- **Research Findings** — captures exploration output, architecture/tech considerations, and key learnings from Steps 1–2 discovery
- **Final Shape** — aggregated end-state after all tasks complete, enabling fast review of overall outcome
- **OpenSpec Appendix** — the `## OpenSpec Appendix` heading appears on every plan (PF10 checks it unconditionally); its body follows a three-way conditional: (a) when `--from-openspec <name>` supplied the structured requirement/task data (`fromOpenspecDirect`), the body holds a requirement inventory table plus verbatim delta-spec fragments reproduced from the on-disk OpenSpec change; (b) when the OpenSpec gate check's option 2 was selected (`openspecInlineGenerate`), the body instead holds authored artifacts — a Proposal Summary, Delta Specs, and Tasks List drafted from exploration and decomposition data at Step 4, each fragment wrapped in a `<!-- openspec-target: <path> -->` annotation (e.g. `<!-- openspec-target: proposal.md -->`, `<!-- openspec-target: specs/<feature-name>.md -->`, `<!-- openspec-target: tasks.md -->`) marking the on-disk path it corresponds to once handed off to `openspec create`; (c) when neither applies — `--spec` alone (interactive OpenSpec loading without `--from-openspec`) or no OpenSpec at all — the body reads `Not applicable — no OpenSpec change`
- **Contract `example:` key** — optional field in per-task Contract blocks showing input/output examples demonstrating how the decided shape is used

See also: [`docs/plan-format-reference.md`](../plan-format-reference.md) for detailed section specifications.

---

## Plan Template

A `.sdlc/plan-template.md` file replaces the default plan template entirely, allowing your team to standardize plan structure and discovery process.

**Setup:** Use `/setup-sdlc --plan-template` to scaffold your first template. The command generates a starting template with sections, questions, and verification patterns for your project.

**Format:**

A plan template contains three parts:

1. **Required Sections** — list of markdown section headings (##) that every plan must contain (e.g., Context, Research Findings, Final Shape). The skill validates this list at Step 4 (PF10 check).
2. **Discovery Questions** — open-ended prompts (2–3 sentences each) shown during requirements gathering when scope is unclear. Questions shape the plan header and focus decomposition.
3. **Verification Patterns** — optional checklist templates and prose blocks for testing and verification, embedded as reference material during task acceptance-criteria writing.

**Narrative lane exemptions:** Sections marked with an HTML comment `<!-- narrative: true -->` are exempted from render-don't-narrate gates (G19). Use sparingly for sections carrying only rationale (e.g., Architecture Decision Record) where narration is the intent.

For template authoring and examples, see [`docs/plan-format-reference.md`](../plan-format-reference.md).

---

## Examples

### From conversation context

Describe what you want in the conversation, then invoke:

```text
/plan-sdlc

I want to add a JWT authentication layer. Users should be able to log in with email/password,
receive a token, and include that token in subsequent API requests. The middleware should
attach the decoded user to req.user and reject invalid or expired tokens with 401.
```

The skill explores the codebase and presents a requirements checklist with task mappings, followed by the full plan for approval:

```
Requirements:
  - [ ] JWT login endpoint (email + password) → Task 1, Task 2
  - [ ] Token validation middleware             → Task 3
  - [ ] Attach decoded user to req.user         → Task 3
  - [ ] Reject invalid/expired tokens with 401  → Task 3, Task 4

Approve this plan, or describe changes?
```

### Plan with OpenSpec context

```text
/plan-sdlc --spec
```

Reads OpenSpec artifacts from the active change and uses them as authoritative requirements for the plan.

### Direct bridge from OpenSpec change

```text
/plan-sdlc --from-openspec add-resource-indicators
```

Validates the named change (`openspec/changes/add-resource-indicators/`), loads all artifacts (proposal, design, delta specs, tasks), and uses `tasks.md` as the primary decomposition skeleton. Skips the gate check and structured discovery — the OpenSpec artifacts provide scope, integration, and success criteria directly. This is the recommended path when session-start reports a change at stage `ready-for-plan`.

### OpenSpec flow proposal for functional changes

When OpenSpec is detected and you describe a functional change without `--spec`:

```text
/plan-sdlc

Add a webhook notification system for order events
```

Response:

```
This looks like a functional change. This project uses OpenSpec for spec-driven development.

Options:
  1. Start OpenSpec flow — use the openspec CLI to author a change first (for non-trivial features requiring full spec workflow)
  2. Generate OpenSpec artifacts as plan appendix — plan generates proposal, spec deltas, and tasks as inline appendix content (recommended default)
  3. Use existing spec — if you already have an OpenSpec change for this
```

Option 2 is now the recommended default — selecting it sets `openspecInlineGenerate = true` and proceeds with standard planning without further prompts (single-touchpoint); artifact authoring is deferred to Step 4, where exploration and decomposition data are available (see the OpenSpec Appendix entry under "Plan Sections" below). Option 1 is no longer the recommended path — it is demoted to non-trivial features that warrant the full OpenSpec CLI workflow before planning begins.

### From a requirements file

```text
/plan-sdlc

docs/specs/auth-redesign.md
```

The skill reads the file, parses requirements into a numbered checklist, explores relevant code, and proceeds through the full pipeline.

### Vague requirements — structured discovery

When requirements are under-specified, the skill asks 2–3 targeted questions before proceeding:

```text
/plan-sdlc

Add search to the app
```

Response:

```
Before I decompose this, I need to clarify three things:

1. Scope — what entities are searchable (users, products, posts)? Full-text or filtered?
2. Integration — is there an existing search index, or does this need a new one?
3. Success — what does a passing test look like?
```

**Expanded ambiguity detection.** Structured discovery now also fires when requirements are otherwise clear but a non-trivial aspect has multiple materially different approaches — concretely: (a) exploration surfaces two or more viable architecture patterns for the same aspect, (b) an ambiguous scope boundary exists where including vs. excluding a component would materially change the plan, or (c) the codebase sends conflicting signals — two existing patterns either of which could reasonably be followed. Any of these triggers the same targeted-question flow, even when the original request was not a single vague sentence.

**`--auto` suppression.** When `--auto` is set, the clarifying `AskUserQuestion` above is suppressed. The skill instead picks the most conservative approach autonomously: for approach-pattern ambiguities (triggers a/c), matching existing codebase patterns is used only as a tiebreaker between equally-conservative choices; for scope-boundary or vague-requirement ambiguities (trigger b, or an underspecified goal), the skill defaults to the narrowest scope that still satisfies the stated requirement. Either way, it records the choice with rationale in `## Key Decisions`, and adds a `## Deviations & assumptions` row with `asked=no`.

### Completing the wave preview after approval

After you approve the plan, the skill saves it and hands off:

```
Plan written to ~/.claude/plans/2026-03-19-auth-layer.md

To execute: /execute-plan-sdlc
```

### Using plan-sdlc inside plan mode

Invoke `/plan-sdlc` while Claude Code plan mode is active:

1. The skill detects plan mode and writes a skeleton header to the designated plan file immediately — the file is initialized before any exploration begins
2. After requirements discovery and codebase exploration, the plan file is updated: header fields (Goal, Architecture, Verification) are filled in and a Requirements section is appended
3. After task decomposition, task blocks (and a Key Decisions section, if applicable) are appended to the plan file
4. After self-critique (Step 3) — which includes a guardrail compliance gate checking every task against the loaded guardrails — the plan file is rewritten with all fixes applied autonomously in Step 4; a `## Guardrail Compliance` section is appended listing each guardrail and its pass/fail status. Step 4 does NOT prompt for plan approval (Fixes #388); the user sees the plan only at the Step 7 handoff. The Step 4 error-severity guardrail-block harden offer remains the only user touchpoint at this stage
5. The skill calls `ExitPlanMode` — Claude Code presents the finalized plan for your review; the cross-model reviewer also receives the guardrails as a `{GUARDRAILS}` template variable so the second model can verify compliance independently
6. After you approve, execution begins automatically — `/execute-plan-sdlc` is auto-invoked with the plan already in context

The plan format is identical regardless of mode, so `/execute-plan-sdlc` loads it without any adjustments.

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| `<plansDirectory>/YYYY-MM-DD-<feature-name>.md` | The written plan document (normal mode). Starts as a skeleton header at Step 0 and grows incrementally: header fields and Requirements section added at Step 1, task blocks at Step 2, critique fixes applied at Steps 4 and 6. Artifact-touching tasks include rendered concrete artifacts — fenced payload blocks, before→after diffs, table schemas — embedded in the task body where the render-don't-narrate gate (G19) applies. Path resolved from: user-specified → project `.claude/settings.json` `plansDirectory` → global `~/.claude/settings.json` `plansDirectory` → `~/.claude/plans/` fallback. |
| Plan mode designated file | When Claude Code plan mode is active, the plan is written to the system-designated file path instead of the above. Same incremental build process applies. The path appears in the plan mode system banner. |
| `.sdlc/learnings/log.md` | Planning learnings appended after writing: scope decisions, clarification patterns, decomposition issues. |
| `os.tmpdir()/sdlc-explore-<branchSlug>-XXXX/discovery-brief.md` | Dynamic-dimension discovery brief produced by `plan-explore-orchestrator` for 4+ file scopes. Contains per-dimension findings with stable `F-<DIM>-<n>` IDs, a contradictions section, and (when web/hybrid dimensions ran) a `## Best-Practice Synthesis` section. Wiped by EXIT/INT/TERM trap after Step 1 completes. Orphans swept by `ship-sdlc --gc`. |

### Suggested Review Dimensions advisory (G17)

When G17 finds coverage gaps in the dimension catalog or Copilot mirror, Step 4 splices a `## Suggested Review Dimensions` advisory block into the plan file. This section is **non-blocking** — absent proposals do not prevent plan finalization.

**CREATE proposals** (new dimension needed): fired when plan files land in uncovered territory.

| Criterion | Condition | Default severity |
|-----------|-----------|-----------------|
| C1 | New top-level technology directory (e.g., `terraform/`, `k8s/`, `mobile/`) | medium |
| C2 | 3+ new files share a common path prefix not covered by any dimension | medium |
| C3 | Security-sensitive path pattern (`**/auth/**`, `**/secret*`, `**/cred*`, `**/iam/**`, `**/crypto/**`, `**/pii/**`) | high |
| C4 | Infrastructure/deployment pattern (`**/infra/**`, `**/*.tf`, `**/k8s/**`, `**/helm/**`, `**/docker*`, `**/Dockerfile*`) | critical |
| C5 | 5+ files across multiple uncovered directories | medium |
| C6 | Single file, not matching C3/C4 (suppressed for single-file diffs) | low |

**UPDATE-path proposals** (existing dimension trigger globs may be stale):

| Criterion | Condition | Default severity |
|-----------|-----------|-----------------|
| U1 | Plan files use a different extension than the dimension's trigger globs | medium |
| U2 | Plan files land in a subdirectory not matched by existing trigger globs | medium |
| U3 | Plan renames/moves a directory explicitly named in a dimension trigger | high |
| U4 | Plan adds a new file extension to a path family the dimension covers | low |
| U5 | Trigger glob uses `**` but new files fall outside its wildcard scope | medium |
| U6 | 3+ files added to a path family where the trigger is a specific filename, not a glob | medium |

**UPDATE-behavior proposals** (dimension checklist may miss new concerns):

| Criterion | Condition | Default severity |
|-----------|-----------|-----------------|
| B1 | Plan describes a public API, CLI flag, env var, webhook, hook, or frontmatter contract change | high |
| B2 | Plan references auth, cryptography, PII, IAM, secrets, or session management and a `security`-type dimension exists | high |
| B3 | Plan describes an invariant flip (sync↔async, idempotent↔non-idempotent, atomic↔multi-step) | critical |
| B4 | Plan adds/removes a runtime dependency that changes the module surface | medium |

**Suppression rules:**
- C6 is never fired for single-file diffs.
- UPDATE proposals are suppressed for doc-only diffs (all paths match `docs/**`, `README*`, or `*.md` outside skills).
- B-criteria are suppressed when the description indicates rename-only, formatting, type-narrowing, or dead-code removal.
- Surviving proposals are ranked by `severity_rank DESC, criteria_count DESC, dimension_name ASC` and capped at 3. Additional candidates appear as `_N additional candidates suppressed_`.
- Within an active PR window, any dimension already recorded by a recent `harden-sdlc` run (via the `Dimensions:` line in `.sdlc/learnings/log.md`) is deferred — prevents duplicate proposals.

**X1 Copilot-mirror clause:** When the repo is hosted on GitHub (detected via `P14 githubHosting`), CREATE proposals always include an action to generate a new `.github/instructions/<name>.instructions.md` mirror. UPDATE proposals include this action only when the dimension already has a mirror. On non-GitHub remotes, X1 is omitted entirely.

**Worked example** (plan adds `packages/auth-service/**/*.ts` where no dimension covers `auth-service`):

```
## Suggested Review Dimensions

### CREATE: auth-service-security
**Why:** Plan adds 4 files under `packages/auth-service/` — no dimension covers this path. C3 fired (matches `**/auth/**`).
**Severity hint:** high
**Triggers:** `packages/auth-service/**`
**Action (dimension):** `/harden-sdlc --surface review-dimensions --dimension auth-service-security`
**Action (Copilot mirror, X1):** regenerate `.github/instructions/auth-service-security.instructions.md` per `setup-sdlc/setup-dimensions.md` Step 8 transform
```

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R31–R34, G17.

## Plan Integrity

When `plan-sdlc` runs, it writes a per-branch plan integrity state file at `.sdlc/execution/plan-<branchSlug>-<ts>.json`. The state file records four checkpoint markers as ISO timestamps:

| Marker | Written when |
|---|---|
| `skillInvoked` | Step 0 prepare — plan-sdlc was invoked |
| `planFile` | After Step 0 path resolution — plan file path resolved and recorded |
| `guardrailsEvaluated` | End of Step 3, lane 3 (guardrail-compliance) — fires when lane 3 returns its result, before the 5-lane JOIN barrier completes |
| `critiqueRan` | After Step 3 JOIN barrier — fires only when all five critique lanes have returned and results are merged |

A sibling field `planFilePath` stores the absolute path to the plan file so the hook can stat it for non-empty content.

The `stop-plan-integrity.js` Stop hook reads this state file at session end and warns when any checkpoint is missing or when the recorded plan file is absent or empty. If no state file exists but the transcript shows plan mode was active, the hook warns that `plan-sdlc` was not invoked. The hook is advisory-only and always exits 0. See [`hooks/stop-plan-integrity.js`](../../plugins/sdlc-utilities/hooks/stop-plan-integrity.js) and [issue #285](https://github.com/rnagrodzki/sdlc-marketplace/issues/285).

## State Format

For the full state file schema — field definitions, lifecycle rules (prune-on-write, consume-then-delete, GC sweep), and worked examples — see [`plugins/sdlc-utilities/skills/plan-sdlc/state-format.md`](../../plugins/sdlc-utilities/skills/plan-sdlc/state-format.md).

---

## Prerequisites

- **A git repository** — codebase exploration reads the project tree to map affected files and detect patterns
- **Requirements or a description** — at minimum a sentence describing what to build; a spec file is accepted but not required

No external tools, credentials, or config files are needed.

### Harness Configuration

| Field | Value |
|---|---|
| Plan mode | Native support (writes to plan file, calls `ExitPlanMode`) |

## OpenSpec Integration

When the project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec/), this skill reads the active change's artifacts as requirements input.

- **Reads:** `proposal.md` (goal/scope), `specs/*.md` (delta specs as requirements), `design.md` (architecture), `tasks.md` (coarse decomposition reference)
- **Behavior change:** Skips structured discovery questions when OpenSpec artifacts provide sufficient scope. Maps every ADDED/MODIFIED delta spec requirement to at least one task.
- **Plan header:** Sets `**Source:**` to `openspec/changes/<name>/` instead of "conversation context"
- **Direct bridge (`--from-openspec <name>`):** Validates the named change, loads all artifacts, and uses `tasks.md` as the primary decomposition skeleton. Bypasses the gate check entirely. This is the recommended path when `session-start.js` reports a change at stage `ready-for-plan`.
- **Functional change routing:** When OpenSpec is detected but neither `--spec` nor `--from-openspec` is passed, the skill classifies the user's request. For functional changes (new features, behavior modifications, API changes), it checks for a matching active OpenSpec change — if found, it auto-loads the spec context. If no match exists, it proposes three options: (1) start the OpenSpec flow — use the openspec CLI to author a change first, now scoped to non-trivial features requiring the full spec workflow; (2) generate OpenSpec artifacts as a plan appendix — the recommended default, authoring proposal/spec-deltas/tasks content inline at Step 4 with no further prompts; or (3) re-invoke with `/plan-sdlc --from-openspec <name>` when a change already exists. Non-functional changes (refactoring, config, docs) receive a passive hint only.

### OpenSpec task annotation and checkbox tracking

When `--from-openspec <name>` is active and `tasks.md` is present, `plan-sdlc` enriches the plan with per-task back-pointers:

- **`openspec-task` block** — each plan task derived from an OpenSpec task carries an `openspec-task: { change, ref, line, title }` block beneath its acceptance criteria. `ref` is a stable identifier: kebab-slug of the title plus a 6-char sha256 suffix. N:1 mapping is allowed (multiple plan tasks → same OpenSpec task).
- **HTML-comment ref injection** — `plan-sdlc` writes `<!-- ref:<ref> -->` to source `tasks.md` lines (write-once, additive). The annotation is rendered-invisible in Markdown. A second invocation on the same file is a no-op.
- **`## Out-of-scope OpenSpec tasks`** — when a plan task has no OpenSpec source, the uncovered OpenSpec task title must appear in this optional section with a one-line rationale. Satisfies the G16 coverage gate.
- **G16 coverage gate** — Step 3 critique blocks plan approval when any `tasks.md` entry is neither covered by a plan task's `openspec-task.ref` nor documented as out-of-scope.

At execute time, `execute-plan-sdlc` reads the `openspec-task` blocks and flips the corresponding `tasks.md` checkboxes from `- [ ]` to `- [x]` as each wave completes. See [`/execute-plan-sdlc` docs](execute-plan-sdlc.md) for details.

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R29, R30, G16.

### Per-task `Contract:` block and the G18 settlement gate (R45, G18 — Fixes #459)

Every artifact-touching task carries a **`Contract:`** block — the decided shape that execution renders verbatim instead of redesigning (or stalling BLOCKED) on a decision planning already closed. It sits beneath the acceptance criteria and uses an indented `- key: value` list:

| Key | What it pins |
|---|---|
| `shape` | The type-aware decided shape (see below). |
| `names` | Exact symbols / IDs / headings / fields the deliverable introduces or touches. |
| `mirror` | The existing artifact this mirrors, with line anchors — the source of truth to copy structure from. |
| `decisions` | Per-task decided choices bound to this deliverable (distinct from ambient `## Key Decisions`). |
| `sync` | Sibling artifacts that must stay byte-consistent with this deliverable. |

`shape` is **type-aware** — the plan type is derived from the task's `Files:` paths, and the decided shape follows that type's column:

| Plan type | `Files:` signal | `shape` pins |
|---|---|---|
| code | source files (`.js`/`.ts`/etc.), `SKILL.md` | signatures / types / flags / error-cases / import-paths |
| docs | `docs/**`, reference `*.md` | template + section list + audience + cross-links |
| openspec / spec | `docs/specs/**`, `openspec/**` | requirement IDs ADD/MODIFY/REMOVE + delta text + numbering + downstream obligations |

A mixed-artifact task is judged against its dominant artifact's column.

**G18 — Settlement / contract concreteness.** A new **error-severity** gate owned by the **content-coverage** lane. It flags any artifact-touching task whose `Contract:` is absent or merely restates "update X to do Y" without a concrete type-appropriate shape. The gate derives the task's plan type from its `Files:` paths (no explicit `kind:` discriminator). Because it is error-severity, an unsettled task blocks plan approval until its Contract pins the decided shape.

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R45, G18.

### Render-don't-narrate concrete artifacts (G19)

G19 is **error-severity** (blocking — it prevents plan approval): it flags a task
that touches a render-trigger surface but narrates instead of rendering. The author
renders the artifact as plain-markdown text — fenced block / table / before→after
diff — or, for flow / call-order / state surfaces, a Mermaid fenced block
(`flowchart` / `sequenceDiagram` / `stateDiagram`). No MDX.

**Render-trigger surfaces** — G19 fires when the task touches any of:

| Surface | Example signal in task body |
|---|---|
| REST / RPC endpoint | `PUT /orgs/{id}`, `POST /tokens`, `GET /items` |
| CLI flag or config key | `--dry-run`, `SDLC_LINKS_OFFLINE=1` |
| Structured schema / model | database table, JSON schema, event envelope |
| State / flow / enum | status transitions, lifecycle states, permission levels |
| Frontmatter / manifest contract | `plugin.json` fields, `Contract:` block keys |
| Error taxonomy | error codes, HTTP status map |

**Each render-trigger surface must be rendered.** When a task touches multiple
surfaces (e.g., REST endpoint AND CLI flag), each distinct surface must have its
own render — rendering one surface does not excuse prose narration of another.

**Cap: one example per distinct contract shape.** Within a surface, when a task
touches multiple distinct event/endpoint/operation shapes, each distinct shape
renders its own record — one illustrative, elided (`…`) example per distinct
contract shape (not an exhaustive dump, and not one example per surface category).

**Anti-bloat carve-out:** G19 is **not-applicable** for trivial tasks (Trivial complexity, or tasks whose only files match `docs/**`, `*.md` outside skills, or pure rename/move). These tasks have no render-trigger surface worth flagging.

A task adding `PUT /orgs/{id}` renders the payload instead of describing it:

    Request  PUT /orgs/{id}   { "name": "Acme", "status": "active" }
    Response 204 (no body)  |  400 { "code": "INVALID_STATUS", "message": … }

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R46, R49, R50, G19.

### Notes rationale-only (G20)

G20 is **error-severity** (blocking): it flags a per-task `Notes:` block that
restates the task's `Contract:` or `Acceptance criteria:` instead of carrying only
rationale. The `Notes:` field is **optional** and rationale-only (≤5 non-blank
lines, deterministically enforced) — the executable "what" lives in `Files:` +
`Contract:` + `Acceptance criteria:`. G20 is not-flagged when `Notes:` is absent or
genuinely a "why" rationale.

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R48, G20.

### Self-contained code references (G21)

G21 is **error-severity** (blocking): it flags a bare `file:line` *change*
reference that is not anchored with the surrounding lines (or the full function
body) plus an inline `-`/`+` diff — a reviewer cannot act on `login.go:200` without
the code memorized. A `file:line` used as a *pointer* (in prose, or as a
`Contract.mirror` precedent anchor) is exempt and passes.

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R51, G21.

### Gate A — Intake Audit (R39 — Fixes #445)

When `--from-openspec` is active and the delta-spec requirement inventory is available (see "Requirement Inventory" below), plan-sdlc dispatches a **Gate A intake audit** before task decomposition. Gate A audits the SOURCE change artifacts — not the plan — across three dimensions:

| Dimension | What is checked |
|---|---|
| Completeness | Proposal↔delta-specs↔tasks.md alignment: every delta spec has a `tasks.md` entry; no orphan tasks without a spec |
| Correctness | Each requirement is unambiguous and testable; no proposal-vs-delta contradiction |
| Coherence | Design decisions consistent with proposal and delta specs; scope clear to a developer reading only tasks.md |

Severity is assigned **per check** (not per dimension), matching the opsx:verify model verbatim:
- Incomplete checkbox or unimplemented requirement → **CRITICAL**
- Divergence from a requirement or uncovered scenario → **WARNING**
- Design decision deviation or code-pattern note → **SUGGESTION**

**CRITICAL findings block decomposition.** The user is presented with two options: (1) fix the source change artifacts and re-run, or (2) override and proceed with findings recorded as `## Intake Audit Caveats` in the plan. WARNING/SUGGESTION findings are recorded as caveats and execution continues.

**Graceful degradation:** Gate A is skipped entirely for non-OpenSpec plans (no `openspecContext`). When individual artifacts are missing (proposal, delta specs, tasks.md), checks that depend on them are skipped and listed in the `skipped[]` audit response array. Gate A dispatch parameters (`model`, `subagentType`, `promptTemplatePath`) are sourced from `intakeAuditDispatch` (P20) in the prepare output — never hardcoded.

### Gate B — Verification Scorecard (R40 — Fixes #445)

At Step 5 (after the lens merge), plan-sdlc assembles a **`## Verification Scorecard`** section in the plan file. This is purely additive — the gate definitions, `buildLanes`, and the `{G1..G21}` union assertion are unchanged by the scorecard layer itself (R42). The scorecard contains:

1. **Dimension table** — CRITICAL/WARNING/SUGGESTION/PASS counts by dimension (Completeness / Correctness / Coherence), aggregated from lens findings that carry severity tags.
2. **Traceability matrix** — one row per requirement from the inventory (`openspecContext.requirements[]`), showing covering task(s) and status (covered / partial / uncovered). When the inventory is null (CLI absent), falls back to the Step 1 requirements checklist with a noted downgrade.
3. **Go/no-go verdict** using the verbatim opsx:verify labels:
   - Any CRITICAL → *"…Fix before archiving."*
   - Warnings only → *"…Ready for archive (with noted improvements)."*
   - Clean → *"All checks passed. Ready for archive."*

The scorecard is **regenerated** (not appended) on each Step 5 iteration (R44). A CRITICAL verdict injects findings into the existing `Issues Found` loop (bounded by the 3-iteration cap) — no new loop. WARNING-only proceeds; caveats are preserved in the plan. At Step 7 Handoff, the verdict line is surfaced above the `ship` / `execute` / `done` menu.

### Requirement Inventory (R38 — Fixes #445)

When `--from-openspec` is active, `plan.js` calls `getRequirementInventory(projectRoot, changeName)` (in `scripts/lib/openspec.js`) to populate `openspecContext.requirements[]`. Each entry has `{ reqId, capability, type (ADDED/MODIFIED/REMOVED/RENAMED), name, scenarioCount }`, sourced from `openspec show <name> --json --deltas-only` (verb-first form). When the CLI is absent or the command fails, `requirements` is `null` and `requirementsError` describes the reason — both Gate A and Gate B degrade gracefully in this case.

For spec definitions: [docs/specs/plan-sdlc.md](../specs/plan-sdlc.md) — R38–R44.

See [OpenSpec Integration Guide](../openspec-integration.md) for the full workflow.

---

## Link Verification (issue #198)

Before declaring the plan ready (Step 7 handoff), the skill pipes the finalized plan file through `scripts/lib/links.js` as a hard gate. The validator auto-derives `expectedRepo` from `git remote origin` and `jiraSite` from `~/.sdlc-cache/jira/` — the skill never constructs the validator context. URL classes checked: GitHub issues/PRs (owner/repo identity + existence), Atlassian `*.atlassian.net/browse/<KEY>` (host match), and any other `http(s)://` URL (HEAD reachability, 5s timeout). Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) are reported as `skipped`, not violations. Set `SDLC_LINKS_OFFLINE=1` to skip generic reachability while keeping context-aware checks. On non-zero exit, Step 7 is **not** entered and the violation list is surfaced verbatim. No flag toggles this gate — it is hard.

## Format Validation (issue #483)

Immediately after Link Verification passes (Step 6.6), the skill runs the finalized plan file through `scripts/ci/validate-plan-format.js` as a second hard gate before Step 7 handoff. This enforces the *structural presence* of the review surfaces deterministically, so a plan can no longer be finalized missing them because an LLM critique lane silently did not run.

Checks applied at this gate:

- **PF6** — `## Deviations & assumptions` section present.
- **PF7** — every artifact-touching task (≥1 `Create:`/`Modify:`/`Test:` Files entry) carries a `**Contract:**` block. This is the deterministic floor for the G18 settlement gate.
- **PF9** — `## Verification Scorecard` section present. This is the deterministic floor for Gate B. PF9 is applied **only when `--final` is passed**, which the skill does only for full-pipeline plans (those that ran the Step 5 multi-lens review). Lightweight plans that skip Step 5 are not expected to carry a scorecard, so PF9 is omitted for them. The `--final` decision is driven by the Step 0 routing branch, never by scorecard presence (that would make the check circular).
- **PF10** — template-driven section checks: every plan includes a `## <name>` heading for every entry in the active template's `## Required Sections` list. The active template is the project's `.sdlc/plan-template.md` override when present, or the plugin's shipped default template otherwise (R61) — so PF10 always runs against SOME template, not only when a project override exists. Heading presence is checked unconditionally, even for sections marked `<!-- conditional: ... -->` in the template — the condition only controls what a conditional section's body says (e.g. "Not applicable — no OpenSpec change"), never whether the heading itself is required (R59). Only runs on full-pipeline plans (`--final`); skipped for lightweight plans alongside PF9. This is the deterministic floor for template-validation gates; concreteness and section-content quality remain the job of LLM gates G1–G21.

These are *presence* checks only — concreteness and content quality remain the job of the LLM gates G18/G19/G20/G21 (the calibrated ceiling above this floor). On non-zero exit, Step 7 is **not** entered and the violation report is surfaced verbatim. No flag toggles this gate — it is hard. G19 (render-don't-narrate) and G21 (self-contained code refs) have no deterministic floor by design: both require semantic judgment that a regex proxy would mis-fire on (see PF8-reserved in the spec).

---

## Related Skills

- [`/execute-plan-sdlc`](execute-plan-sdlc.md) — executes the plans this skill produces
- [`/review-sdlc`](review-sdlc.md) — review changes after plan execution
- [Guardrails authoring best practices](plan-guardrails-best-practices.md) — how to write evaluable plan guardrails
