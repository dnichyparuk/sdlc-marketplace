# received-review-sdlc Specification

> Process code review feedback with technical verification against the full codebase, dual self-critique gates, and incremental PR thread processing. Prevents performative agreement and ensures pushback where warranted.

**User-invocable:** yes
**Model:** sonnet
**Prepare script:** `skill/received-review.js`

## Arguments

- A1: `--pr <number>` — PR number to process review comments from (default: none, falls back to manual gathering)
- A2: `--auto` — auto-implement "will fix" items without Step 10 consent; also auto-runs Step 12 (post in-thread replies and resolve "agree, will fix" threads) without consent. "disagree"/"needs discussion"/"won't fix" items are displayed but never auto-implemented; their threads are replied to but not resolved (default: false)

## Core Requirements

- R1: 13-step workflow: READ → UNDERSTAND → VERIFY → EVALUATE → CRITIQUE #1 → IMPROVE #1 → RESPOND → CRITIQUE #2 → IMPROVE #2 → PRESENT → IMPLEMENT → META-ANALYZE (Step 11.6) → LINK VERIFICATION (Step 11.7) → REPLY & RESOLVE
- R2: Dual self-critique gates: first gate reviews evaluation quality (Step 5-6), second gate reviews response quality (Step 8-9)
- R3: Critique gate output is internal only — never displayed to the user
- R4: Every feedback item verified against the full codebase (not just the change diff) before evaluation
- R5: Five verification statuses: confirmed, confirmed but suggestion incomplete, incorrect, partially correct, cannot verify
- R6: Four evaluation outcomes: agree will fix, agree won't fix, disagree, needs discussion
- R7: Unclear items block all implementation — clarify ALL unclear items at once before proceeding
- R8: Incremental PR thread processing: prepare script identifies outstanding vs resolved/self-replied/stale threads; only outstanding threads are processed
- R9: Step 10 consent gate is mandatory unless `--auto` is explicitly passed — pipeline context does not override
- R10: Auto mode only auto-implements "will fix" items; "disagree", "needs discussion", and "won't fix" are never auto-actioned. When `flags.alwaysFixSeverities` is non-empty, the auto-apply set is restricted by R18: only "will fix" findings whose severity ∈ `flags.alwaysFixSeverities` are implemented; remaining "will fix" findings (severity not in the list, or `severity: null`) are collected into a follow-up summary written to the response output. When `flags.alwaysFixSeverities` is empty (the default), `--auto` falls back to the original behavior: all "will fix" findings are auto-applied regardless of severity, preserving backward compatibility for users who have not configured the field.
- R11: PR thread replies use in-thread comment replies (REST API), not top-level PR comments
- R12: Thread resolution uses GraphQL `resolveReviewThread` mutation — only for "agree, will fix" items; pushback and won't-fix threads are left open
- R13: Forbidden openers: no performative language ("Great catch!", "You're right!", "Thanks!")
- R14: YAGNI check for feature requests: grep codebase for actual usage before accepting
- R15: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R16: Under `--auto`, Step 12 posts in-thread replies for all action-plan items and resolves only "agree, will fix" threads without an AskUserQuestion gate; pushback and "won't fix" threads are replied to but left open for the reviewer. When `flags.alwaysFixSeverities` is non-empty (R18), only "agree, will fix" threads whose severity is in the list are resolved; "agree, will fix" threads with severity outside the list are replied to but not resolved (they remain in the follow-up summary). When `flags.alwaysFixSeverities` is empty (the default), all "agree, will fix" threads are resolved, preserving backward compatibility.
- R17: Link verification (issue #198) — every URL embedded in any reply or response body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` (CLI: `node scripts/lib/links.js --json`) before posting. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts the reply with non-zero exit and a structured violation list — no soft-warning mode; body is never posted.
- R-config-version (issue #232): The prepare script `skill/received-review.js` MUST call `verifyAndMigrate(projectRoot, 'project')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R18 (issue #233): When `flags.alwaysFixSeverities` is non-empty, findings whose verdict is "agree, will fix" AND whose parsed severity is in the list bypass the Step 10 / Step 12 per-finding consent gate. Bypassed findings are auto-applied and emit a one-line `fixed: ...` log entry instead of a consent prompt. Findings with verdict "agree, will fix" but severity NOT in the list, findings with any other verdict, and findings whose severity could not be parsed (`severity: null`) all continue to require explicit user approval per R9. The default value when `alwaysFixSeverities` is unset is `[]`, which preserves the original R9 behavior across all findings. The setting applies uniformly to in-band review findings and ultrareview-driven findings.
- R19 (issue #233): The `alwaysFixSeverities` field is read EXCLUSIVELY from `.sdlc/local.json` (the per-user, gitignored config). The prepare script MUST NOT consume the field from `.sdlc/config.json`. If the field is encountered in `.sdlc/config.json`, the prepare script emits exactly one warning line to stderr and ignores the value (treating it as if absent). The single resolution site for the field is the prepare script; SKILL.md decision sites cite `flags.alwaysFixSeverities` only and never re-read configuration.
- R20 (issue #363): Every reply body posted by this skill MUST end with `_via \`received-review-sdlc\` v{plugin_version}_` on its own line, separated from the preceding body by a blank line. The footer is composed by the prepare script (`skill/received-review.js`) using `getPluginVersion()` and emitted as `manifest.reply_footer`; SKILL.md instructs verbatim append — the LLM MUST NOT compose, reformat, or modify the footer string. Falls back to `'unknown'` when `plugin.json` is unreadable. Applies to all four reply sites: Step 7 generic reply, Step 12 agree+fix reply, Step 12 pushback reply, and Step 12 won't-fix reply.

- R21 — Meta-analysis step (Step 11.6): After Step 11 (IMPLEMENT) completes and before Step 11.7 (LINK VERIFICATION), cluster evaluated findings by `(hardenSurfaceHint, hardenTargetFileHint)` and dispatch `Skill(harden-sdlc)` per approved cluster. The step is best-effort: failure does NOT propagate a non-zero exit code from this skill and does NOT abort Step 11.7 or Step 12.
- R22 — Clustering rules: Verdict→action mapping per issue #429 table. Cluster key = `(hardenSurfaceHint, hardenTargetFileHint)`. Singleton `disagree` findings are skipped (require ≥2 same target-file). Cluster cap = `flags.hardenClusterCap` (default 5). Pruning order when cap is exceeded: top-by-highest-severity-in-cluster → ties by finding count → alphabetic on `(surface, targetFile)`. Excess clusters logged as `suppressed: N additional clusters` in the deferred-action log entry.
- R23 — Harden dispatch contract: Per approved cluster, dispatch `Skill(harden-sdlc)` with `--failure-text "<synthesized cluster text>"`, `--skill received-review-sdlc`, `--step "Step 11.6 — meta-analysis"`, `--operation "review-feedback-driven hardening"`. When `flags.auto === true` AND `flags.alwaysHardenFromReview === true` (R25 cell 4), propagate `--auto` to every dispatched `Skill(harden-sdlc)` invocation.
- R24 — `flags.alwaysHardenFromReview` semantics: Resolved exclusively from `.sdlc/local.json` `receivedReview.alwaysHardenFromReview` (boolean, default `false`). If encountered in `.sdlc/config.json`, prepare script emits stderr warning and ignores the value (mirrors R19 / C15). Single resolution site = `skill/received-review.js`; SKILL.md cites `flags.alwaysHardenFromReview` only.
- R25 — Auto-mode decision matrix (4 cells): Authoritative table for Step 11.6 behavior:

  | `flags.auto` | `flags.alwaysHardenFromReview` | Behavior |
  |---|---|---|
  | `false` | `false` | Meta-analyze → cluster → present consent gate → dispatch only approved clusters. |
  | `false` | `true`  | Meta-analyze → cluster → SKIP consent gate → dispatch every cluster (capped). |
  | `true`  | `false` | Meta-analyze → cluster → SKIP consent gate AND SKIP dispatch entirely. Append deferred-action entry to `.sdlc/learnings/log.md` per R26 format. |
  | `true`  | `true`  | Meta-analyze → cluster → SKIP consent gate → dispatch every cluster (capped), propagating `--auto` to every dispatched `Skill(harden-sdlc)` invocation. |

  Three hard rules: (a) NEVER call `AskUserQuestion` in Step 11.6 when `flags.auto === true`; (b) MUST propagate `--auto` to harden dispatch when `flags.auto === true`; (c) harden dispatch failure (exit ≠ 0) is logged-and-ignored, never aborts Step 11.7 or Step 12.
- R26 — Deferred-action log entry format (for R25 cell 3 — `auto=true, alwaysHardenFromReview=false`):
  ```
  ## YYYY-MM-DD — received-review-sdlc: deferred meta-analysis clusters
  PR: <pr.number>
  Clusters (<count>):
  - surface=<hardenSurfaceHint> targetFile=<hardenTargetFileHint> findings=<count> verdict-mix=<csv> failure-text-preview="<first 100 chars>"
  - ...
  Suppressed: <N> additional clusters beyond cap=<cap>
  ```
  Machine-parseable: regex on `^- surface=` lines. A follow-up interactive run can replay deferred clusters using these lines.

## Workflow Phases

1. READ — gather review feedback via prepare script (PR threads) or manual input
   - **Script:** `skill/received-review.js`
   - **Params:** A1-A2 forwarded (`--pr <number>`, `--auto`); internal params: `--owner <owner>`, `--repo <repo>`, `--project-root <path>`
   - **Output:** JSON → P1-P7 (threads with status classification, comment chains, auto flag, PR number/owner/repo)
2. UNDERSTAND — categorize items; flag and block on unclear items
3. VERIFY — check each item against full codebase context (callers, dependents, architecture)
4. EVALUATE — determine verdict per item (agree fix / agree won't fix / disagree / needs discussion)
5. CRITIQUE #1 (internal) — self-review evaluation against 5 gates
6. IMPROVE #1 (internal) — fix evaluation issues
7. RESPOND — draft responses per item (substance-first, no performative language)
8. CRITIQUE #2 (internal) — self-review responses against 7 gates
9. IMPROVE #2 (internal) — fix response issues
10. PRESENT — show analysis table, action plan, drafted responses; consent gate
11. IMPLEMENT — post responses, apply code changes (blocking → simple → complex order)
11.6. META-ANALYZE — cluster evaluated findings by `(hardenSurfaceHint, hardenTargetFileHint)`, dispatch `Skill(harden-sdlc)` per approved cluster (R21–R26); best-effort, does NOT abort Step 11.7 or Step 12 on failure
    - **Output → step-emitter:** `meta-analyze-findings { clusterCount, surfaces[] }` (started → completed); `present-harden-clusters { consent-granted | consent-skipped }` per cluster; `dispatch-harden { surface, targetFile, hardenExitCode }` per cluster
11.7. LINK VERIFICATION — validate all URLs embedded in drafted reply bodies before posting (R17); renumbered from Step 11.5
12. REPLY & RESOLVE — post PR thread replies and resolve addressed threads

## Quality Gates

Critique #1 (evaluation):
- G1: Verification completeness — every item verified against actual code
- G2: No blind agreement — disagreements exist where technically warranted
- G3: YAGNI applied — feature suggestions checked for real vs hypothetical need
- G4: Unclear items resolved — all unclear items clarified before proceeding
- G5: Technical grounding — every agree/disagree decision cites code or behavior

Critique #2 (responses):
- G6: No performative language — zero forbidden openers or gratuitous praise
- G7: Technically grounded — every response references specific code, behavior, or constraint
- G8: Pushback is technical — disagreements cite code, performance data, or design constraints
- G9: Thread-level replies — each response targets its specific comment thread
- G10: Implementation plan clear — for accepted items, response states what will change
- G11: No blind agreement — factual errors corrected, not accommodated
- G12: Proportional effort — simple fixes get short responses; complex items get detailed ones

## Prepare Script Contract

- P1: `threads` (array) — review threads with `{ id, databaseId, path, line, body, author, status }` per thread
- P2: `threads[].status` (string) — "outstanding" | "resolved" | "self-replied" | "stale"
- P3: `threads[].comments` (array) — comment chain within the thread
- P4: `flags.auto` (boolean) — whether `--auto` was passed
- P5: `pr.number` (number) — PR number
- P6: `pr.owner` (string) — repository owner
- P7: `pr.repo` (string) — repository name
- P8 (issue #233): `flags.alwaysFixSeverities` (string[]) — severities whose "will fix" findings bypass the per-finding consent gate. Resolved exclusively from `.sdlc/local.json` `receivedReview.alwaysFixSeverities`. Allowed values: `low | medium | high | critical`. Default `[]`. The script MUST emit a stderr warning and ignore the field if it appears in `.sdlc/config.json` (R19).
- P9 (issue #233): `threads[].severity` (string|null) — per-thread severity parsed from the comment body using the review-sdlc severity tag format. `null` when absent or unparseable; such threads NEVER bypass the consent gate per R18.
- P10 (issue #363): `plugin_version` (string) — sdlc-utilities plugin version resolved via `getPluginVersion()`. Falls back to `'unknown'`.
- P11 (issue #363): `reply_footer` (string) — pre-composed footer string for verbatim append to all reply bodies. Format: `'\n\n_via \`received-review-sdlc\` v{plugin_version}_'`.
- P12 (issue #429): `threads[].hardenSurfaceHint` (string | null) — per-thread harden-surface inference. Allowed values: `review-dimensions | plan-guardrails | execute-guardrails | copilot-instructions | null`. Resolved via rule-based heuristic in `skill/received-review.js` (see C17 / KD6 in implementation notes).
- P13 (issue #429): `threads[].hardenTargetFileHint` (string | null) — per-thread absolute-path inference. First matched file mention resolved via `fs.existsSync`; `null` when no mention resolves to an existing file.
- P14 (issue #429): `flags.alwaysHardenFromReview` (boolean) — resolved from `.sdlc/local.json` `receivedReview.alwaysHardenFromReview` per R24. Default `false`.
- P15 (issue #429): `flags.hardenClusterCap` (integer) — resolved from `.sdlc/local.json` `receivedReview.hardenClusterCap`. Default 5. Clamped to `[1, 50]`.

## Error Handling

- E1: `skill/received-review.js` exit 1 → no PR found, fall back to manual feedback gathering
- E2: `skill/received-review.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: `gh api` fails fetching PR comments → check auth, show error, ask user to supply feedback directly
- E4: Comment references file/line that no longer exists → verify against current HEAD
- E5: Cannot verify reviewer's claim → state limitation, ask user for direction
- E6: `gh api` 5xx posting reply → retry once; invoke error-report-sdlc on second failure
- E7: GraphQL resolve mutation fails → retry once; invoke error-report-sdlc on second failure

## Constraints

- C1: Must not use performative openers (gratitude, praise, "great catch")
- C2: Must not agree with factually incorrect claims to avoid conflict
- C3: Must not implement unclear feedback — clarify all unclear items first
- C4: Must not implement feature requests without YAGNI check
- C5: Must not reply top-level when comment is in a review thread
- C6: Must not skip self-critique steps even when evaluation seems obvious
- C7: Must not batch implement without testing each change individually
- C8: Must not display output from internal critique steps (Steps 5-6, 8-9) to user
- C9: Must not skip Step 10 consent gate without explicit `--auto` flag
- C10: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C11: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C12: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C13: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C14: Must not present Step 12 consent gate when `flags.auto` is true — the reply/resolve step auto-executes under the same policy as manual `yes`
- C15 (issue #233): Must not read `receivedReview.alwaysFixSeverities` from `.sdlc/config.json`. The single source of truth is `.sdlc/local.json`. Misplaced values must produce a stderr warning and be ignored (R19).
- C16 (issue #233): SKILL.md decision sites that gate on the configurable auto-apply MUST cite `flags.alwaysFixSeverities` (the prepare-script-resolved field). Direct reads of `$ARGUMENTS`, raw CLI strings, or configuration files at decision sites are forbidden (single resolution site).
- C17 (issue #429): `AskUserQuestion` MUST NOT be called in Step 11.6 when `flags.auto === true`. The R25 matrix governs all Step 11.6 behavior; decision sites MUST cite `flags.auto` and `flags.alwaysHardenFromReview` (resolved fields) — never raw `$ARGUMENTS` or direct config reads.
- C18 (issue #429): Step 11.6 clusters ONLY findings whose verdict is one of the four R6 outcomes (`agree-will-fix | agree-won't-fix | disagree | needs-discussion`). Threads at pre-Step-4 status (`cannot-verify`, ungraded) MUST NOT enter clusters.

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

- I1: `skill/received-review.js` — pre-computes PR thread state with incremental processing
- I2: `gh` CLI / GitHub API — used for fetching comments, posting replies, resolving threads
- I3: `review-sdlc` — source of findings this skill may respond to
- I4: `commit-sdlc` — common follow-up to commit fixes
- I5: `error-report-sdlc` — invoked on script crashes and persistent API failures
- I6: `ship-sdlc` — may invoke this skill as part of the shipping pipeline
