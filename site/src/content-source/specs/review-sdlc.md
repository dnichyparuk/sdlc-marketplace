# review-sdlc Specification

> Thin dispatcher that runs the review prepare script, then delegates multi-dimension code review to the review-orchestrator agent.

**User-invocable:** yes
**Model:** sonnet
**Prepare script:** `skill/review.js`

## Arguments

- A1: `--base <branch>` — base branch for diff comparison (default: auto-detected)
- A2: `--committed` — review only committed changes (default: false)
- A3: `--staged` — review only staged changes (default: false)
- A4: `--working` — review only working tree changes (default: false)
- A5: `--worktree` — review changes in the current worktree (default: false)
- A6: `--set-default` — persist the selected scope as default (default: false)
- A7: `--dimensions <name,...>` — limit review to specific dimensions (default: all configured)
- A8: `--dry-run` — show review plan without dispatching subagents (default: false)

## Core Requirements

> **Requirement ID convention:** Sequential requirements use `R<N>` (R1, R2, …). Issue-linked requirements added post-launch use name-based IDs (`R-<slug>`) to avoid renumbering. Both forms are normative.

- R1: Run `skill/review.js` to produce a manifest file; do NOT read the manifest into main context
- R2: Scope flags (`--committed`, `--staged`, `--working`, `--worktree`) are mutually exclusive
- R3: When `--dry-run` is passed, read the manifest, display the review plan in the specified format, clean up, and stop
- R4: Delegate to the `review-orchestrator` agent (via Agent tool, NOT Skill tool) with the manifest file path and project root
- R5: On orchestrator failure, re-dispatch once with the same inputs; on second failure, invoke error-report-sdlc
- R6: After orchestrator returns, offer self-fix via `received-review-sdlc` when verdict is CHANGES REQUESTED or APPROVED WITH NOTES
- R7: When verdict is APPROVED, skip the self-fix offer
- R8: Clean up the manifest temp file after completion
- R9: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R10: Post-confirmation (`yes` / `save` / `cancel`) is issued by the skill in the main context, not by the orchestrator
- R11: Orchestrator writes the consolidated comment body to `${manifest.diff_dir}/review-comment.md` and returns its absolute path plus `pr.*` metadata in its summary; the skill acts on the summary without reading the manifest
- R12: When the user confirms `yes`, the skill posts via `gh api … -F body=@<path>` — no further Agent dispatch is made to complete posting
- R13: After the orchestrator returns, the skill MUST read `${diff_dir}/review-comment.md` and display its full contents verbatim in the main context before any posting prompt — the orchestrator summary alone is insufficient because it contains only severity counts, not per-finding detail
- R14: Link verification (issue #198) — every URL embedded in the consolidated review comment body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` (CLI: `node scripts/lib/links.js --json`) before `gh api … /comments`. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts posting with non-zero exit and a structured violation list — no soft-warning mode.
- R15: Each `.sdlc/review-dimensions/<name>.md` MAY declare an optional `model:` (string) frontmatter field. When set, the review orchestrator MUST dispatch that dimension's subagent with the declared model, overriding `manifest.subagent_model`. When absent, dispatch falls back to `manifest.subagent_model`. The field is Claude-Code-only; the Copilot transform in `setup-sdlc` MUST omit it.
- R-on-demand-force-active (issue #362): When a dimension is named in the `--dimensions` filter AND its `triggers` match zero changed files, the dimension MUST be forced to status `ACTIVE` with `matched_files` set to all changed files in scope. When the dimension is NOT in the `--dimensions` filter, the existing trigger-only matching applies (no change to current behavior). This enables on-demand role-based dimensions (e.g., QA-only) that stay dormant during default `/review` but activate fully when explicitly requested via `--dimensions`. The force-active path uses all changed files (equivalent to `effectiveMatched = changedFiles`); the existing `max-files` truncation cap applies if `changedFiles.length > max-files`. A dimension is force-skipped (status `SKIPPED`) only when there are literally no changed files at all — an empty diff. See issue #362.
- R-security-owasp (issue #272): The marketplace ships a canonical `security-review` dimension whose body enumerates the OWASP Top 10 (A01 broken access control, A02 cryptographic failures, A03 injection, A04 insecure design, A05 security misconfiguration, A06 vulnerable & outdated components, A07 identification & authentication failures, A08 software & data integrity failures, A09 logging & monitoring failures, A10 SSRF) and instructs the review subagent to tag each finding with the matching category code. The finding output format MAY include an optional `**OWASP:**` field carrying that code (`A01`–`A10`). The field is rendered verbatim in the consolidated PR comment when present and omitted otherwise. The field is opt-in per dimension — only dimensions whose body instructs OWASP tagging populate it. Default severities follow OWASP impact: `critical` for A01, A02, A03, A07; `high` for A04, A05, A06, A08, A10; `medium` for A09.
  - Acceptance: `EXAMPLES.md` ships an OWASP-mapped `security-review` template; `REFERENCE.md` §2 finding template and §3 consolidated comment template both reference the optional `**OWASP:**` slot; promptfoo dataset covers all ten categories.
- R16: At Step 5 self-fix offer, when verdict is CHANGES REQUESTED with at least one dimension blocker, the skill MUST present an opt-in menu option that dispatches `Skill(harden-sdlc)` with `--failure-text <full failure text>`, `--skill review-sdlc`, `--step <step-id>`, `--operation <operation-name>`. The option is offered alongside the existing `received-review-sdlc` self-fix option. Selection is user-initiated only — the skill MUST NOT auto-dispatch and MUST NOT write any hardening surface silently. Menu wording is canonical and identical across all caller skills (`plan-sdlc`, `execute-plan-sdlc`, `review-sdlc`, `commit-sdlc`) and is suppressed when `--auto` is set. (Fixes #221.)
- R-config-version (issue #232): The prepare script `skill/review.js` MUST call `verifyAndMigrate(projectRoot, 'project')` (and `'local'` if it reads local config) at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R-dimensions-path (issue #231): Review dimensions are read from `.sdlc/review-dimensions/` first, with a one-time stderr deprecation fallback to `.claude/review-dimensions/` for two minor versions. Implementation: `lib/dimensions.js`. The CI validator (`scripts/ci/validate-dimensions.js`) honors the same fallback in read-only mode (it never invokes `verifyAndMigrate`).
- R-reviews-path (issue #466): The save post-confirmation action writes the saved review markdown to `.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` (branch slashes replaced with `-`), making reviews a sibling of other `.sdlc/` artifacts. The directory is auto-gitignored by the existing `.sdlc/.gitignore` managed block.
- R-branch-contrib-diff (issue #239): For the `committed` and `all` (default) scopes — both of which represent "what the branch contributed" — the changed-files set (reflected in `git.changed_files_count` and the per-dimension `.diff` file content) MUST reflect only commits between the merge-base of `base_branch` and `HEAD` and `HEAD` itself. Files that landed on `base_branch` after divergence MUST NOT appear. Implementation uses git's three-dot range form (`<base>...HEAD`) in the diff helpers in `lib/git.js` and the `fetchAndSplitDiff` helper in `skill/review.js`. The `worktree` scope is exempt by design — its semantics are "full working tree vs. base" (symmetric `git diff <base>`) and it MUST continue to use the bare base ref form.
  - Acceptance: in a non-rebased branch where `base_branch` has commits added since divergence (e.g., another developer merged to `main`), running `skill/review.js` produces a manifest whose `git.changed_files_count` and per-dimension `.diff` content reflect only the files modified by the feature branch's own commits — not files modified solely by the post-divergence base commits.
- R17 (issue #363): The consolidated PR comment MUST include the sdlc-utilities plugin version in the attribution line, rendered as `v{plugin_version}` adjacent to the skill name (format: `> Automated review by \`review-sdlc\` v{plugin_version} · {date}`). Version is resolved in the prepare script (`skill/review.js`) via `getPluginVersion()` and emitted as `manifest.plugin_version`; the review-orchestrator reads it verbatim — it MUST NOT re-derive the version independently. Falls back to `'unknown'` when `plugin.json` is unreadable.
- R-common-prompt (issue #519): When `.sdlc/review-dimensions/_common.md` exists, its markdown content is prepended to every dispatched dimension's slice `body` field under a `## Common Review Instructions` heading. The file has no YAML frontmatter and is excluded from dimension validation (D1–D9). Absent file = no injection, byte-identical slices. For Copilot mirrors, common text is injected into every per-dimension `.instructions.md` mirror so each reviewer context has full instructions.
  - Acceptance: `validateAll()` skips `_common.md`; slice JSON `body` starts with common content when file present; each per-dimension Copilot mirror includes common text.
- R-base-ref-fetch (issue #239): Before computing branch-contribution diffs, `skill/review.js` MUST attempt a best-effort `git fetch origin <base>:<base>` to fast-forward the local copy of the base branch. The fetch failure (offline, no remote configured, auth denied, non-fast-forward) is non-fatal — the skill proceeds with whatever the local ref reports. The fetch is implemented as a single `lib/git.js::fetchBaseRef(base, projectRoot)` helper modelled on the existing fetch pattern in `getRemoteState`.
  - Acceptance: with `origin` unreachable or absent, `skill/review.js` still exits successfully and produces a manifest; with a stale local base ref behind `origin/<base>`, the local ref is refreshed before the diff is computed.
- R-manifest-index-slices (issue #447): The manifest division contract that bounds the `review-orchestrator` agent's context by dimension **count**, not dimension **content**.
  - `skill/review.js` MUST emit a **thin dimension index**: each `dimensions[]` entry carries only `name`, `description`, `severity`, `model`, `status`, `requires_full_diff`, `truncated`, `matched_count`, `diff_file`, and `slice_file`. It MUST NOT inline `body`, `matched_files`, `file_context`, or `warnings`.
  - For each dispatched dimension (`status` ACTIVE/TRUNCATED), `review.js` MUST write a per-dimension **slice file** in `diff_dir` containing `{ body, matched_files, file_context, warnings }` and store its path in `slice_file` (mirroring the existing `.diff` file pattern governed by R-branch-contrib-diff). Non-dispatched dimensions (SKIPPED/QUEUED) keep `slice_file: null`.
  - The top-level manifest MUST NOT contain `git.commit_log` or `dirty_files` (dead fields with zero non-writer consumers), and `git.changed_files` (array) is replaced by a `git.changed_files_count` integer.
  - The `review-orchestrator` MUST read only the thin index; it MUST forward `slice_file` and `diff_file` **paths** into each dispatch prompt and MUST NOT read slice/diff content into its own context. Each dispatched subagent reads its own slice and diff. The orchestrator's context therefore scales with dimension **count**, not content.
  - Acceptance: the manifest's `dimensions[]` entries contain no `body`/`matched_files`/`file_context`/`warnings`; each dispatched dimension has a `slice_file` path whose JSON contains those four fields; the top-level manifest has no `git.commit_log`, no `dirty_files`, and a numeric `git.changed_files_count`.
- R-orchestrator-await (issue #487): The `review-orchestrator` agent MUST block until every dispatched dimension subagent returns before consolidating. (a) Every Step 2 dispatch uses `run_in_background: false`; (b) the turn is not complete and the orchestrator MUST NOT enter Step 3 (critique) or Step 5 (persist `review-comment.md`) until it has collected exactly one result per dispatched dimension — N = count of dimensions with status ACTIVE or TRUNCATED; (c) if the runtime backgrounds a dispatch and re-invokes via task-completion notifications, it keeps awaiting across notifications until the collected count equals N. Consolidating on partial or zero results is forbidden.

## Workflow Phases

1. CONSUME — run prepare script to produce manifest file
   - **Script:** `skill/review.js`
   - **Params:** A1-A7 forwarded (`--base <branch>`, `--committed`, `--staged`, `--working`, `--worktree`, `--set-default`, `--dimensions <list>`)
   - **Output:** manifest file path → P1-P10 (base branch, changed-files count, dimension counts/thin-index entries, plan critique); also writes per-dimension `.diff` files and `.slice.json` slice files to tmpdir. Skill must NOT read manifest into main context
2. DO — dispatch review-orchestrator agent (or display dry-run plan)
3. REPORT — display orchestrator summary and full consolidated comment body
4. POST — skill handles PR posting decision in main context (`yes` / `save` / `cancel` or no-PR options), then cleans up manifest and diff dir
5. OFFER — conditionally offer self-fix based on review verdict

## Quality Gates

- G1: Manifest file produced — `skill/review.js` exits successfully and produces a valid file path
- G2: Orchestrator dispatched — agent is spawned (not via Skill tool) with manifest path and project root
- G3: Manifest file and `diff_dir` cleaned up by the skill after the terminal branch (including failures)
- G4: Exactly one `review-orchestrator` Agent dispatch per `/review-sdlc` invocation (a retry on failure counts as the same attempt; user confirmation never triggers a new dispatch)
- G5: Full comment body displayed — Step 3 emits the verbatim contents of `${diff_dir}/review-comment.md` in the main context before the posting prompt is shown
- G6: Await barrier — the orchestrator collects one result per dispatched dimension (count == N, ACTIVE+TRUNCATED) before any consolidation, and never computes a verdict or writes `review-comment.md` on partial or zero results (R-orchestrator-await)

## Prepare Script Contract

- P1: `base_branch` (string) — base branch used for diff
- P2: `git.changed_files_count` (integer) — count of changed file paths (the full `git.changed_files` array is no longer emitted; only its length is carried, per R-manifest-index-slices)
- P3: `summary.active_dimensions` (number) — count of active review dimensions
- P4: `summary.skipped_dimensions` (number) — count of skipped dimensions
- P5: `dimensions` (array) — **thin index** entries (per R-manifest-index-slices). Each entry carries only `name`, `description`, `severity`, `model`, `status`, `requires_full_diff`, `truncated`, `matched_count`, `diff_file`, and `slice_file`. Heavy fields (`body`, `matched_files`, `file_context`, `warnings`) are NOT inlined — they live in the per-dimension slice file (see P10). Each entry's `status` field takes one of four values: `ACTIVE` (triggers matched changed files, or forced via `--dimensions` force-active per R-on-demand-force-active), `SKIPPED` (triggers matched zero files and dimension not named in `--dimensions` filter, or named but diff is empty), `TRUNCATED` (triggers matched but file count exceeded `max-files`), or `ERROR` (dimension file unreadable/malformed). `ACTIVE` may originate from either a trigger match or a `--dimensions` force-active override.
- P6: `plan_critique.uncovered_files` (string[]) — files not covered by any dimension
- P7: `plan_critique.over_broad_dimensions` (string[]) — dimensions reviewing too many files
- P8: `plan_critique.uncovered_suggestions` (array) — suggested additional dimensions
- P9: `subagent_model` (string) — model for dimension subagent dispatch (default: `"sonnet"`)
- P10: `dimensions[].slice_file` (string|null) — per-dimension slice file path (per R-manifest-index-slices). For each dispatched dimension (`status` ACTIVE/TRUNCATED), `review.js` writes `${diff_dir}/${name}.slice.json` containing `{ body, matched_files, file_context, warnings }` and sets `slice_file` to its absolute path. Non-dispatched dimensions (SKIPPED/QUEUED) have `slice_file: null`. The slice file is the sole carrier of the heavy per-dimension fields that the thin index (P5) omits — the orchestrator forwards this path to each subagent rather than reading the contents into its own context.

## Error Handling

- E1: `skill/review.js` exit 1 → show stderr message, stop (no error report)
- E2: `skill/review.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: Orchestrator fails once → re-dispatch with same inputs
- E4: Orchestrator fails twice → invoke error-report-sdlc

## Constraints

- C1: Must not read the manifest JSON into main context (orchestrator reads it)
- C2: Must not read REFERENCE.md in main context (orchestrator resolves it)
- C3: Must not invoke the orchestrator via the Skill tool — must use Agent tool
- C4: Must not invoke error-report-sdlc for user errors — only for script crashes (exit 2) and repeated orchestrator failures
- C5: Orchestrator MUST pass `manifest.subagent_model` to each dimension subagent Agent dispatch via the `model:` parameter
- C6: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C7: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C8: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C9: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C10: Orchestrator MUST NOT call `gh api` or prompt the user for PR-posting confirmation
- C11: Orchestrator MUST NOT delete `manifest.diff_dir` — the skill owns cleanup of both the manifest file and the diff dir
- C12: Skill MUST NOT re-dispatch the orchestrator to complete a posting flow already computed — `comment_file` from the orchestrator summary is authoritative

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

- I1: `skill/review.js` — produces the review manifest with all git data
- I2: `review-orchestrator` agent — performs the actual multi-dimension review
- I3: `received-review-sdlc` — invoked to address review findings when verdict warrants
- I4: `setup-sdlc --dimensions` — creates the review dimension configuration
- I5: `commit-sdlc` — common follow-up after review approval
- I6: `error-report-sdlc` — invoked on script crashes and repeated orchestrator failures
