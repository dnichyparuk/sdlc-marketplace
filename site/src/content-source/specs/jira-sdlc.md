# jira-sdlc Specification

> Cache Jira project metadata on first use, then execute any Jira operation (create, edit, search, transition, comment, link, assign, worklog) using only cached values. Eliminates redundant discovery calls after initialization.

**User-invocable:** yes
**Model:** sonnet
**Prepare script:** `skill/jira.js`

## Arguments

- A1: `--project <KEY>` — Jira project key (default: auto-detected via 5-step fallback). When `jira.projects` is set, values outside that list are rejected.
- A2: `--force-refresh` — rebuild cache regardless of current state (default: false)
- A3: `--init-templates` — copy default description templates to `.sdlc/jira-templates/` (default: false)
- A4: `--skip-workflow-discovery` — bypass Phase 5 workflow discovery; per non-subtask issue type, cache `workflows: { <type>: { unsampled: true } }`. Transition operations fall back to a live `getTransitionsForJiraIssue` call per issue when workflow data is marked `unsampled`. Use in CI or pre-seeded environments where Phase 5 MCP calls are too expensive.
- A5: `--site <host>` — disambiguator for `--check`/`--load` when multiple cache files for the same project key exist under different site subdirectories of `~/.sdlc-cache/jira/`. Value is the sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`).

## Core Requirements

- R1: Initialize a deterministic cache at `~/.sdlc-cache/jira/<sanitizedSiteHost>/<PROJECT_KEY>.json` containing cloudId, issue types, field schemas, workflow graphs, link types, and user mappings. `sanitizedSiteHost` is derived from `siteUrl` — the URL host lowercased with `.` replaced by `_` (e.g., `acme.atlassian.net` → `acme_atlassian_net`). The cache lives outside the working tree to avoid repo-local state and to support multi-tenant (site-keyed) installations. When a project-keyed cache file is found at the legacy in-repo locations `.sdlc/jira-cache/<KEY>.json` or `.claude/jira-cache/<KEY>.json`, the prepare script migrates it to the home layout using `sanitizeSiteHost(cache.siteUrl)` and emits a warning; the legacy file is left in place for the user to clean up.
- R2: Cache is permanent by default (no timer-based expiry); rebuilt only on `--force-refresh` or operation failure due to stale data
- R3: After initialization, all operations read exclusively from cache — no discovery endpoint calls
- R4: Project key resolution follows 5-step ordered fallback: (1) `--project` argument, (2) branch name pattern `[A-Z]{2,10}-\d+` — when `jira.projects` is configured, only keys that match a member of `jira.projects` accept this signal, (3) `.sdlc/config.json` → `jira.defaultProject`, (4) when `jira.projects` has ≥2 entries, AskUserQuestion with a closed list matching `jira.projects`, (5) free-form AskUserQuestion. Backward compatible: repos without `jira.projects` behave as before (steps 1/2/3/5).
- R5: Cache initialization runs 6 phases: identity, project metadata, issue types, field schemas (parallel per type), workflow discovery (per non-subtask type), assemble and save
- R6: Classify user intent into one of 10 operation types: create, edit, search, transition, comment, link, assign, worklog, view, bulk
- R7: Per-issue-type description templates are filled from user context before MCP calls; all `{placeholder}` markers must be replaced or the section removed — never send raw placeholders
- R8: Custom templates at `.sdlc/jira-templates/<Type>.md` override default templates when present
- R9: On stale cache errors (invalid transition IDs, changed field schemas), auto-refresh cache and retry once
- R10: When `--init-templates` is passed, initialize templates and stop — do not execute any Jira operation
- R11: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R12: Comments must be converted from markdown to ADF via `scripts/lib/markdown-to-adf.js` before posting to Jira — compose in markdown using REFERENCE.md Section 4 safe syntax, pipe through the conversion script, then call `addCommentToJiraIssue` with `contentFormat: "adf"` and the ADF JSON body
- R13: `jira.projects` (string[]) may be set in `.sdlc/config.json` alongside or instead of `jira.defaultProject`. When set with ≥2 entries, the skill (1) rejects `--project <KEY>` arguments whose value is not a member of `jira.projects` (prepare script exits 1 with a descriptive error), and (2) presents a closed-list AskUserQuestion prompt using only the configured projects when no other signal resolves the project key. Single-project repos (no `jira.projects`, or fewer than 2 entries) retain the prior behavior with `defaultProject`.
- R14: `--skip-workflow-discovery` bypasses Phase 5 entirely. The cache is written with `workflows: { <type>: { unsampled: true } }` for each non-subtask issue type. Transition operations that encounter an `unsampled` marker fall back to a live `getTransitionsForJiraIssue` call per issue (reusing the existing stale-cache auto-refresh path from R9/E10). Cache rows for subtask types and other sections are populated normally.
- R15: When `--check` resolves against the home-cache layout without `--site`, it scans `~/.sdlc-cache/jira/*/<KEY>.json` for all candidates. Zero matches → `{ exists: false }` (treat as fresh install). Exactly one match → use it. Two or more matches → `{ exists: false, candidateSites: [<host>, …] }`; the user must re-run with `--site <host>` to disambiguate or `--force-refresh` to rebuild against a specific site.
- R16: SKILL.md frontmatter `description` must include auto-trigger phrases covering the full operation surface: read/view, comment add, create, edit, search, transition, link, assign, worklog, bulk. Required trigger tokens: `read jira`, `view jira`, `show jira`, `get jira`, `fetch jira`, `jira details`, `add comment`, `comment on jira`, `reply to jira`, `jira ticket`, `jira issue`. Purpose: allow the downstream model to activate the skill automatically on common read-and-comment phrasings without an explicit `/jira-sdlc` invocation. Total frontmatter `description` length must stay within 1024 characters.
- R17 (approval gate): Before `createJiraIssue`, `editJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue`, `addWorklogToJiraIssue`, `createIssueLink`, the skill MUST print the full final payload and call `AskUserQuestion` with `approve` / `change <what>` / `cancel`. Loop on `change`. The MCP write tool is dispatched only after `approve`. Read operations (`searchJiraIssuesUsingJql`, `getJiraIssue`, `getTransitionsForJiraIssue`, etc.) are exempt.
- R18 (template enforcement): Every `createJiraIssue` and every `editJiraIssue` whose payload touches `description` MUST resolve a description template via `.sdlc/jira-templates/<IssueType>.md` (override) then `plugins/sdlc-utilities/skills/jira-sdlc/templates/<IssueType>.md` (shipped). If no template clearly matches the requested issue type, the skill MUST call `AskUserQuestion` with a closed list of available templates. Free-form descriptions are prohibited. Sections may be removed when not applicable, but new sections MUST NOT be invented. When an issue type lacks both a custom and a shipped template, the skill MUST consult a fallback map (`Sub-bug → Bug`, `Sub-task → Task`, `Subtask → Task`) before resolving to `none`. When a fallback is applied, the skill MUST emit a one-line notice (`Using <Parent> template for <Type> — override at .sdlc/jira-templates/<Type>.md`). When no fallback applies and resolution is `none`, the skill MUST emit a one-line warning (`No template for <Type>. Run /jira-sdlc --init-templates or create .sdlc/jira-templates/<Type>.md`).
- R-MIGR (migration shim): On first invocation that needs the templates directory, the skill MUST invoke `scripts/skill/migrate-jira-templates.js`. The shim implements a four-state contract: (1) If legacy `<sdlcRoot>/.claude/jira-templates/` exists AND target `<sdlcRoot>/.sdlc/jira-templates/` does not → move legacy to target via `fs.renameSync` (recreating any necessary parent directory). (2) If both exist → emit one-line stderr warning `migrate-jira-templates: both <legacy> and <target> exist; keeping <target>, leaving <legacy> in place`, prefer new, do not merge or modify either. (3) If only target exists → no-op. (4) If neither exists → no-op. Idempotent — repeated invocations after success produce no further state changes. FS errors during rename → exit 1.
- R-LEGACY-DETECT: setup-sdlc MUST emit a `legacy.jiraTemplates: {exists, path}` row in the prepare JSON when `<projectRoot>/.claude/jira-templates/` exists, mirroring the existing `legacy.config` and `legacy.learningsLog` rows. The migration is dispatched from `/setup-sdlc --migrate` (user-initiated) and on first jira-sdlc invocation that reads or writes the templates directory (auto-trigger, at most once per process). (Implements #423.)
- R19 (no-assume placeholder policy): The skill MUST detect placeholder markers in proposed payloads using the C13 regex (both `{name}` and `[bracketed prose]` forms; ADF documents are traversed recursively over `text` nodes). Each detected marker MUST be classified as `high` confidence (explicit user input or definitive cache value) or `low` confidence (inferred or paraphrased). Every `low`-confidence marker MUST be resolved via `AskUserQuestion` before payload finalization. Inapplicable sections require explicit user consent before removal — silent drops are prohibited.
- R20 (self-critique, surfaced): Before the R17 approval presentation, the skill MUST run a critique pass against (a) template completeness, (b) field correctness (issue type, project key, parent, components, labels), (c) workflow validity (transition target reachable per cached workflow graph), and (d) terminology consistency between summary and description. The skill MUST surface findings to the user as an `Initial:` / `Critique:` / `Final:` block. Critique deltas MUST NOT be applied silently.
- R21 (LLM-prose validation layer — deterministic hook enforcement removed): R17–R20 are enforced by the skill's own Plan→Critique→Improve→Present→Approve flow (the Step 2.5 critique pass + R20 user-approval gate), NOT by a PreToolUse hook. The `pre-tool-jira-write-guard.js` hook has been deleted; jira-write validation is now LLM-prose-only as a second line of defense. There is no `payload_hash`, no `critique-<hash>.json` / `approval-<hash>.token` artifact handshake, and no deterministic dispatch block. The skill MUST still: (a) ensure zero unfilled template placeholders remain in payload string fields and ADF text nodes (C13 regex check, applied by the skill before presenting); (b) for `createJiraIssue` / `editJiraIssue` with a description, keep payload `## ` headings a subset of the resolved template's heading set; (c) obtain explicit `AskUserQuestion` approval before dispatching any write MCP call. These checks are now the skill's responsibility at author time rather than a harness-enforced gate. (R21.1 and R21.2 — the shared `payload-hash.js` canonicalizer/`trimEnd` contract and the deny-path diagnostic dump — are removed along with the hook; `lib/payload-hash.js` and `lib/artifact-store.js` lose their hook consumer.)
- R23 (cloudId auth-error recovery and namespace dispatch):
  - On any Atlassian MCP call returning a cloudId authorization error (text matches `isn't explicitly granted` or HTTP 401/403 with cloudId in message), the skill MUST call `getAccessibleAtlassianResources` exactly once, compare the returned cloudId(s) against the cached value, update `~/.sdlc-cache/jira/<site>/<KEY>.json` if different, and retry the original operation once.
  - When the active MCP namespace (default `mcp__atlassian__`) returns a cloudId authorization error and a sibling namespace (`mcp__claude_ai_Atlassian__`) is registered, the skill MUST retry the operation under the sibling namespace and persist the working namespace in the session.
- R22: Link verification (issue #198) — every URL embedded in a Jira description payload or comment body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` before any `createJiraIssue` / `editJiraIssue` / `addCommentToJiraIssue` MCP call. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the cached `siteUrl`; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts the operation with non-zero exit and a structured violation list — no soft-warning mode; payload is never sent to Jira.
- R24: (reserved) — slot intentionally left empty to preserve historical requirement numbering across the R23 → R25 gap. Do not reuse this identifier for new requirements; allocate the next free Rn instead.
- R-config-version (issue #232): The prepare script `skill/jira.js` MUST call `verifyAndMigrate(projectRoot, 'project')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R25 (terse content format, issue #412): Every `createJiraIssue` and every `editJiraIssue` whose payload touches `description` MUST produce terse, scannable content:
  1. Every `## ` section body MUST be composed of bullet list items (`- ` or `* `), numbered list items (`1. `), or sub-headings — no paragraph text exceeding two consecutive non-empty lines that are not list or heading lines.
  2. The `## Acceptance Criteria` section body MUST consist exclusively of GitHub-flavored checklist items (`- [ ] ` or `- [x] `), with no prose introduction or prose summary before or after the list.
  3. The `summary` field MUST be an imperative phrase ≤ 100 characters, with no filler tokens (`This task covers`, `The goal of`, `We need to make sure`, etc.).
  4. Filler transitional sentences between sections (`This ticket covers…`, `In summary…`, `The purpose of this issue is…`) MUST be omitted.
  5. **Exception (R25.5):** The `## Release Notes` section in Bug.md and Story.md MAY contain a single sentence — release notes are changelog-bound and bullet form is contextually awkward. Two or more sentences in `## Release Notes` fail R25.
  - Acceptance: Spec contains R25 (with R25.5 exception), G15, and C15; R25 cites issue #412; G15 references the LLM-driven critique step (the deterministic hook check is removed); C15 is in the Constraints section.
- R26 (MCP failure classification taxonomy): Every Atlassian MCP failure observed in `jira-sdlc` MUST be assigned exactly one class from the closed set: `transport`, `auth`, `schema`, `workflow`, `hook-block`, `link-verification`, `unknown`. Class assignment derives deterministically from the failure signal (HTTP status, error message keywords, hook deny-reason prefix, R-path identity). The classifier runs in `scripts/lib/mcp-failure.js` and is invoked at every MCP-boundary site (R9/R14/R21/R22/R23) via its CLI entrypoint.
  - Acceptance: a unit test exercising each of the 7 classes produces the expected tag; classifier input is deterministic (no LLM, no network call).
- R27 (Persistent MCP-failure telemetry): On every classified failure, jira-sdlc MUST append a structured 5-line block to `.sdlc/learnings/log.md` with fields: `tool`, `site`, `project`, `error` (one line, redacted of tokens/cloudIds/emails), `recovered` (`yes:<R-path>` | `no`). Append uses canonical path resolution via `resolveLogPath()` from `scripts/lib/config.js` (legacy fallback `.claude/learnings/log.md`). The block is written atomically under a `## YYYY-MM-DD — jira-sdlc mcp-failure[<class>]: <tool>` heading.
  - Acceptance: exec test asserts a synthetic failure produces the exact 5-line block (heading + 5 key-value lines) in `.sdlc/learnings/log.md`; redaction test asserts a `401 cloudId=12345678-...` input produces a masked telemetry line.
- R28 (Analyze-then-confirm dispatch to error-report-sdlc): On exhausted-recovery paths (R23 dual-namespace exhausted, R9 retry-exhausted, R14 unsampled fallback retry-exhausted, R21 same-hash hook-block twice in one invocation, R22 link-verification abort), jira-sdlc MUST: (a) read `docs/specs/jira-sdlc.md` and `SKILL.md`, search `gh issue list --state open --label mcp-failure --search "<toolName>" --json number,title,labels`, search `.sdlc/learnings/log.md`; (b) synthesize a proposal (title + body + dedup analysis) using the `plugins/sdlc-utilities/skills/jira-sdlc/templates/McpFailure.md` template; (c) present the proposal verbatim to the user requiring explicit approval (Y/edit/skip); (d) on approval, dispatch the existing `error-report-sdlc` flow with payload `--error-type mcp-<class>` and labels `mcp-failure`, `class:<x>`; (e) on duplicate found in step (a) (open issue with matching `class:<x>` label and `<toolName>` in title), default to comment-on-existing rather than create-new (still gated by user approval). Synthesized content (error field, issue body) MUST be redacted of bearer tokens, cookies, cloudIds, and email addresses before presentation or persistence.
  - Acceptance: behavioral test per class confirms gate fires once, gate accepts edit, gate accepts skip, duplicate path proposes comment; exec test asserts redacted output on auth-class input.

## Assumptions

- C1 (context): `~/.sdlc-cache/` is writable by the user running the skill. On platforms without a writable `$HOME`, the user may override with `--cache-dir <path>` (preserves existing flag behavior).
- C2 (context): `siteUrl` is always present in cache payloads; `saveCache` enforces this. Cache files migrated from legacy locations carry their original `siteUrl`, which is used to derive the new site subdirectory.

## Workflow Phases

1. CONSUME — parse arguments, resolve project key, run prepare script to check cache status
   - **Script:** `skill/jira.js --check`
   - **Params:** A1 forwarded (`--project <KEY>`)
   - **Output:** JSON → P1-P3 (cache exists, missing sections, freshness)
2. INIT (conditional) — deterministic 6-phase cache initialization when cache is missing, incomplete, or refresh requested
   - **Script:** `skill/jira.js --load`
   - **Params:** `--project <KEY>`
   - **Output:** JSON → P4 (full cache object: cloudId, issue types, field schemas, workflows, link types, user mappings)
3. CLASSIFY — parse user intent into an operation type
4. DO — execute the classified operation using cached metadata
5. UPDATE — incrementally update cache with newly discovered data (user mappings, workflow states)
   - **Script:** `skill/jira.js --save`
   - **Params:** `--project <KEY>`, updated cache data piped via stdin
   - **Output:** JSON confirmation of save

## Quality Gates

- G1: Cache loaded — `cloudId`, `project`, `issueTypes`, `fieldSchemas` all present before any operation
- G2: Content format — comment calls use `contentFormat: "adf"` with ADF body from `scripts/lib/markdown-to-adf.js`; description/create calls use `contentFormat: "markdown"`
- G3: Response format — every content-returning call uses `responseContentFormat: "markdown"`
- G4: No raw placeholders — all `{placeholder}` markers in templates filled or section removed
- G5: Required fields — all required fields per `fieldSchemas` have values before create
- G6: Transition safety — transition `id` from cache or fresh API call, never guessed
- G7: User disambiguation — `lookupJiraAccountId` results always disambiguated if multiple matches
- G8: No fabricated values — all field values derived from cache `allowedValues` or user input
- G9: No write MCP call without an `approve` answer to the R17 approval gate in the same skill turn
- G10: No `description` field built without a resolved template (R18) — override `.sdlc/jira-templates/<Type>.md` or shipped `templates/<Type>.md`
- G11: No `low`-confidence placeholder dispatched without R19 user resolution via `AskUserQuestion`
- G12: No payload presented to the user without a preceding R20 critique block (`Initial:` / `Critique:` / `Final:`)
- G13: No write MCP call dispatched without explicit `AskUserQuestion` approval (R20) and a completed Step 2.5 critique pass. The previous PreToolUse-hook artifact verification (approval token + critique JSON, payload-hash bound) is removed — validation is LLM-prose-only (R21). This is the skill's author-time responsibility, not a harness-enforced gate.
- G15 (terse content): No `createJiraIssue` / `editJiraIssue` dispatch where the description's `## Acceptance Criteria` section contains non-checklist lines (R25.2), and bullet/no-prose enforcement for other description sections (R25.1, R25.3, R25.4) — all LLM-driven via the Step 2.5 critique pass. The previous deterministic `pre-tool-jira-write-guard.js` checklist-only gate is removed; this is now skill-author-time enforcement only.

## Prepare Script Contract

- P1: `exists` (boolean) — whether cache file exists
- P2: `missing` (string[]) — required cache sections that are absent
- P3: `fresh` (boolean) — whether cache is within TTL (when `maxAgeHours > 0`)
- P4: Cache load output (full JSON) — the complete cache object when `--load` is used
- P5: `candidateSites` (string[]) — populated by `--check` when two or more home-cache entries match the project key without `--site` disambiguation. Empty or absent when the candidate count is 0 or 1. Paired with `exists: false` when ≥2 candidates exist.

## Error Handling

- E1: `skill/jira.js` exit 1 → show `errors[]`, stop (no error report)
- E2: `skill/jira.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: HTTP 400 on create/edit → verify field key/shape against cached `fieldSchemas`; auto-refresh and retry once; invoke error-report-sdlc if still failing
- E4: HTTP 400 on transition → check `requiredFields` in cached workflows; auto-refresh and retry once
- E5: HTTP 401 → report auth token expired; cannot recover programmatically
- E6: HTTP 403 → report insufficient permission; cannot fix
- E7: HTTP 404 issue → ask user to verify issue key
- E8: HTTP 404 project → re-run cache check; verify cloudId matches correct site
- E9: HTTP 409 → retry the operation once (concurrent edit conflict)
- E10: Stale transition ID → auto-refresh cache, retry with new IDs

## Constraints

- C1: Must convert markdown to ADF via `scripts/lib/markdown-to-adf.js` for comment posting; must keep `responseContentFormat: "markdown"` for reading
- C2: Must not call discovery endpoints after cache initialization (getAccessibleAtlassianResources, getJiraIssueTypeMetaWithFields, getIssueLinkTypes)
- C3: Must not pass transition name to `transitionJiraIssue` — requires `{ id: "..." }` object
- C4: Must not pass display name as assignee — requires `{ accountId: "..." }`
- C5: Must not guess field IDs, custom field keys, or transition IDs
- C6: Must not use values not in cache `allowedValues` — never fabricate enum values
- C7: Must not retry a failed operation more than once without diagnosing the cause first
- C8: Must not leave raw `{placeholder}` syntax in issue descriptions
- C9: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C10: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C11: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C12: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C13: Placeholder regex — `\{[a-zA-Z_][a-zA-Z0-9_-]*\}|\[(?![{"\d])[^\]\n]{3,}\]`. Both `{name}` and `[bracketed prose ≥ 3 chars]` forms are treated equally as placeholder markers. ADF `text` nodes are traversed recursively; the regex applies to every string-valued field of the payload. Negative lookahead `(?![{"\d])` excludes JSON-array bodies and numeric-led array contents from the bracket arm; this is a false-positive guard only — true-positive prose placeholders (e.g., `[Enter description here]`) remain matched. When `tool_input.contentFormat === 'adf'`, the placeholder check MUST walk the parsed ADF tree (parsing `commentBody` if the MCP harness has stringified it to JSON) and apply C13 only to `text` node values. The bracket-form regex MUST NOT execute against the stringified ADF blob. When `contentFormat` is `markdown` (or unset), the existing whole-payload string walk applies unchanged. The bracket-form arm of the placeholder regex MUST NOT be applied to the `summary` field — Jira `[CATEGORY]` title prefixes (e.g., `[OIDC/SSO]`, `[IDS]`, `[FEAT]`, `[BUG]`) are a common convention and produce false positives; brace-form detection on `summary` is retained.
  - Acceptance: the `summary` bracket-form carve-out is unconditional across content formats. `findPlaceholdersForToolInput({ summary: '[FEAT] X', contentFormat: 'adf', commentBody: JSON.stringify({ type: 'doc', version: 1, content: [] }) })` returns zero results; `findPlaceholdersForToolInput({ summary: '{name} X', contentFormat: 'adf', commentBody: JSON.stringify({ type: 'doc', version: 1, content: [] }) })` returns exactly one result on `summary` with marker `{name}`; the same holds for `contentFormat: 'markdown'` and for an unset `contentFormat`.
- C-projectroot: Scripts that use `process.cwd()` as the project root silently break when invoked from a sub-directory or a git worktree. All projectRoot resolutions in this skill's scripts MUST route through `resolveSdlcRoot()` (lib/config.js); `process.cwd()` is forbidden except in documented bootstrap entry points.
  - Acceptance: `resolveSdlcRoot()` is called to establish `projectRoot` in `skill/jira.js`; no bare `process.cwd()` usage contributes to any path resolved against the project root; invoking the script from a repo sub-directory yields the correct root.
- C15: Must not introduce free prose paragraphs into `## ` section bodies of issue descriptions — bullet lists, numbered lists, or sub-headings only (R25.1). Must not emit `## Acceptance Criteria` content as sentences — every item MUST be a `- [ ] <discrete criterion>` checklist line (R25.2). Must not add filler transitional sentences between sections (`This ticket covers…`, `The goal of…`, `In summary…`) (R25.4). Release Notes MAY be a single sentence (R25.5 exception); two or more sentences in that section fail C15.

## Step-Emitter Contract

> Added as foundation for step-emitter migration. P-TRANS-1 transition map to be defined during script migration.

- P-STEP-1: Script returns universal envelope with `status`, `step`, `llm_decision`, `state_file`, `progress`, and `ext` fields on every invocation
- P-STEP-2: Script accepts `--after <step_id> --result-file <path> --state <state_file>` for subsequent invocations after the initial call
- P-STEP-3: State file is created on first invocation, updated after each step, and cleaned up when status is `"done"`
- P-TRANS-1: Step transition map — TBD (to be defined during script migration)
- P-TRANS-2: Every `step.id` in the transition map has a corresponding `When step.id == X` section in SKILL.md
- C-STEP-1: The LLM MUST NOT skip steps or reorder the sequence — the script controls progression
- C-STEP-2: The LLM MUST NOT read or modify the state file directly — it passes the path back to the script via `--state`
- C-STEP-3: When `llm_decision` is null, the LLM executes the step without asking the user or making judgment calls
- C-STEP-4: When `llm_decision` is non-null, the LLM MUST resolve it (via domain knowledge or user interaction) before proceeding

## Integration

- I1: `skill/jira.js` — manages cache file operations (check, load, save, init-templates)
- I2: Atlassian MCP tools — all Jira API calls go through the MCP tool layer
- I3: `error-report-sdlc` — invoked on script crashes and persistent API failures after auto-refresh. R28 analyze-then-confirm gate runs BEFORE error-report-sdlc's existing two-gate consent flow — first gate (R28 user approval on synthesized proposal); second/third gates remain inside error-report-sdlc unchanged.
- I4: `plan-sdlc` — common follow-up to plan work from a Jira ticket
- I5: `execute-plan-sdlc` — common follow-up to execute a plan
