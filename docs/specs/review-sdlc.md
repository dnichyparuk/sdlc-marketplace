# review-sdlc Specification

> Thin dispatcher that runs the review prepare script, then delegates multi-dimension code review to the review-orchestrator agent.

**User-invocable:** yes
**Prepare script:** `skill/review.js`

## Inputs and flags

### Flags

- A1: `--base <branch>` — base branch for diff comparison (default: auto-detected)
- A2: `--committed` — review only committed changes (default: false)
- A3: `--staged` — review only staged changes (default: false)
- A4: `--working` — review only working tree changes (default: false)
- A5: `--worktree` — review changes in the current worktree (default: false)
- A6: `--set-default` — persist the selected scope as default (default: false)
- A7: `--dimensions <name,...>` — limit review to specific dimensions (default: all configured)
- A8: `--dry-run` — show review plan without dispatching subagents (default: false)
- A9: `--auto` — run with no prompt: Step 4 takes the post decision from `post_decision` (P12) and Step 5 makes no self-fix offer (default: false)
- A10: `--post yes|save|none` — the post decision: `yes` posts to the branch's PR (after R14), `save` writes the review to `save_path` (R-reviews-path), `none` keeps it in the terminal only. When given, Step 4 asks nothing (default: unset)
- A11: `--plan <path>` — the plan the reviewed change implements; its recorded decisions are intent, not defects (default: none)
- R2: Scope flags (`--committed`, `--staged`, `--working`, `--worktree`) are mutually exclusive
- R3: When `--dry-run` is passed, read the manifest, display the review plan in the specified format, clean up, and stop
- R-on-demand-force-active: When a dimension is named in the `--dimensions` filter AND its `triggers` match zero changed files, the dimension MUST be forced to status `ACTIVE` with `matched_files` set to all changed files in scope. When the dimension is NOT in the `--dimensions` filter, the existing trigger-only matching applies (no change to current behavior). This enables on-demand role-based dimensions (e.g., QA-only) that stay dormant during default `/review` but activate fully when explicitly requested via `--dimensions`. The force-active path uses all changed files (equivalent to `effectiveMatched = changedFiles`); the existing `max-files` truncation cap applies if `changedFiles.length > max-files`. A dimension is force-skipped (status `SKIPPED`) only when there are literally no changed files at all — an empty diff.

### Configuration

- R-config-version: The prepare script `skill/review.js` MUST call `verifyAndMigrate(projectRoot, 'project')` (and `'local'` if it reads local config) at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R-dimensions-path: Review dimensions are read from `.sdlc/review-dimensions/` first, with a one-time stderr deprecation fallback to `.claude/review-dimensions/` for two minor versions. Implementation: `lib/dimensions.js`. The CI validator (`scripts/ci/validate-dimensions.js`) honors the same fallback in read-only mode (it never invokes `verifyAndMigrate`).
- R15: Each `.sdlc/review-dimensions/<name>.md` MAY declare an optional `model:` (string) frontmatter field. When set, the review orchestrator MUST dispatch that dimension's subagent with the declared model, overriding `manifest.subagent_model`. When absent, dispatch falls back to `manifest.subagent_model`. The field is Claude-Code-only; the Copilot transform in `setup-sdlc` MUST omit it. A `model:` value other than a Claude alias (`haiku`, `sonnet`, `opus`, `fable`) or a `claude-*` model id fails dimension validation (D13 error), and `skill/review.js` names the dropped dimension on stderr; `review-summary.json` records the model each dispatched dimension ran on as `dimensions[].model`. A dimension MAY also declare an optional `effort:` (`low|medium|high|xhigh|max`); the orchestrator dispatches with `dimension.effort || manifest.subagent_effort`. A value outside the list is a D14 warning and is carried as null. The Copilot transform omits it.
- R-common-prompt: When `.sdlc/review-dimensions/_common.md` exists, its markdown content is prepended to every dispatched dimension's slice `body` field under a `## Common Review Instructions` heading. The file has no YAML frontmatter and is excluded from dimension validation (D1–D9). Absent file = no injection, byte-identical slices. For Copilot mirrors, common text is injected into every per-dimension `.instructions.md` mirror so each reviewer context has full instructions.
  - Acceptance: `validateAll()` skips `_common.md`; slice JSON `body` starts with common content when file present; each per-dimension Copilot mirror includes common text.

### Derived inputs

- R-branch-contrib-diff: For the `committed` and `all` (default) scopes — both of which represent "what the branch contributed" — the changed-files set (reflected in `git.changed_files_count` and the per-dimension `.diff` file content) MUST reflect only commits between the merge-base of `base_branch` and `HEAD` and `HEAD` itself. Files that landed on `base_branch` after divergence MUST NOT appear. Implementation uses git's three-dot range form (`<base>...HEAD`) in the diff helpers in `lib/git.js` and the `fetchAndSplitDiff` helper in `skill/review.js`. The `worktree` scope is exempt by design — its semantics are "full working tree vs. base" (symmetric `git diff <base>`) and it MUST continue to use the bare base ref form.
  - Acceptance: in a non-rebased branch where `base_branch` has commits added since divergence (e.g., another developer merged to `main`), running `skill/review.js` produces a manifest whose `git.changed_files_count` and per-dimension `.diff` content reflect only the files modified by the feature branch's own commits — not files modified solely by the post-divergence base commits.
- R-base-ref-fetch: Before computing branch-contribution diffs, `skill/review.js` MUST attempt a best-effort `git fetch origin <base>:<base>` to fast-forward the local copy of the base branch. The fetch failure (offline, no remote configured, auth denied, non-fast-forward) is non-fatal — the skill proceeds with whatever the local ref reports. The fetch is implemented as a single `lib/git.js::fetchBaseRef(base, projectRoot)` helper modelled on the existing fetch pattern in `getRemoteState`.
  - Acceptance: with `origin` unreachable or absent, `skill/review.js` still exits successfully and produces a manifest; with a stale local base ref behind `origin/<base>`, the local ref is refreshed before the diff is computed.
- R19: A sha base skips the base fetch. When `--base` matches `^[0-9a-f]{7,40}$` and no local branch `refs/heads/<base>` exists, `lib/git.js::fetchBaseRef` runs no fetch, so no `refs/heads/<sha>` branch is created; the diff uses the commit as given.
  - Acceptance: exec case `git-lib: fetchBaseRef with a sha base creates no branch`.

## State model

- R11: The orchestrator, through `review-consolidate.js` (R-consolidate), writes the consolidated comment body to `${manifest.diff_dir}/review-comment.md` and returns its absolute path plus `pr.*` metadata in its summary; the skill acts on the summary without reading the manifest
- R-manifest-index-slices: The manifest division contract that bounds the `review-orchestrator` agent's context by dimension **count**, not dimension **content**.
  - `skill/review.js` MUST emit a **thin dimension index**: each `dimensions[]` entry carries only `name`, `description`, `severity`, `model`, `effort`, `status`, `requires_full_diff`, `truncated`, `matched_count`, `diff_file`, `slice_file`, and `batch` (R-dimension-cap). It MUST NOT inline `body`, `matched_files`, `file_context`, or `warnings`.
  - For each dispatched dimension (`status` ACTIVE/TRUNCATED), `review.js` MUST write a per-dimension **slice file** in `diff_dir` containing `{ body, matched_files, file_context, warnings }` and store its path in `slice_file` (mirroring the existing `.diff` file pattern governed by R-branch-contrib-diff). Non-dispatched dimensions (SKIPPED) keep `slice_file: null` and `batch: null`.
  - The top-level manifest MUST NOT contain `git.commit_log` or `dirty_files` (dead fields with zero non-writer consumers), and `git.changed_files` (array) is replaced by a `git.changed_files_count` integer.
  - The `review-orchestrator` MUST read only the thin index; it MUST forward `slice_file` and `diff_file` **paths** into each dispatch prompt and MUST NOT read slice/diff content into its own context. Each dispatched subagent reads its own slice and diff. The orchestrator's context therefore scales with dimension **count**, not content.
  - Acceptance: the manifest's `dimensions[]` entries contain no `body`/`matched_files`/`file_context`/`warnings`; each dispatched dimension has a `slice_file` path whose JSON contains those four fields; the top-level manifest has no `git.commit_log`, no `dirty_files`, and a numeric `git.changed_files_count`.
- R-reviews-path: The save post-confirmation action writes the saved review markdown to `.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` (branch slashes replaced with `-`), making reviews a sibling of other `.sdlc/` artifacts. The directory is auto-gitignored by the existing `.sdlc/.gitignore` managed block.
- R8: Clean up the manifest temp file after completion

## Step composition

### Phases

1. CONSUME — run prepare script to produce manifest file
   - **Script:** `skill/review.js`
   - **Params:** A1-A7, A9 and A10 forwarded (`--base <branch>`, `--committed`, `--staged`, `--working`, `--worktree`, `--set-default`, `--dimensions <list>`, `--auto`, `--post <value>`)
   - **Output:** manifest file path → P1-P10 (base branch, changed-files count, dimension counts/thin-index entries, plan critique); also writes per-dimension `.diff` files and `.slice.json` slice files to tmpdir. Skill must NOT read manifest into main context
2. DO — dispatch review-orchestrator agent (or display dry-run plan)
3. REPORT — display orchestrator summary and full consolidated comment body
4. POST — skill handles PR posting decision in main context (`yes` / `save` / `cancel` or no-PR options), then cleans up manifest and diff dir
5. OFFER — conditionally offer self-fix based on review verdict

### Pipeline steps

- R1: Run `skill/review.js` to produce a manifest file; do NOT read the manifest into main context
- R10: Post-confirmation (`yes` / `save` / `cancel`) is issued by the skill in the main context, not by the orchestrator; when `post_decision` (P12) is set, the skill acts on it without a prompt
- R12: When the user confirms `yes`, the skill posts via `gh api … -F body=@<path>` — no further Agent dispatch is made to complete posting
- R13: After the orchestrator returns, the skill MUST read `${diff_dir}/review-comment.md` and display its full contents verbatim in the main context before any posting prompt — the orchestrator summary alone is insufficient because it contains only severity counts, not per-finding detail
- R17: The consolidated PR comment MUST include the sdlc-utilities plugin version in the attribution line, rendered as `v{plugin_version}` adjacent to the skill name (format: `> Automated review by \`review-sdlc\` v{plugin_version} · {date}`). Version is resolved in the prepare script (`skill/review.js`) via `getPluginVersion()` and emitted as `manifest.plugin_version`; `review-consolidate.js` reads it verbatim — it MUST NOT re-derive the version independently. Falls back to `'unknown'` when `plugin.json` is unreadable.
- R18: When `plan_file` (P14) is non-null, the orchestrator adds the line `- Plan file (recorded decisions are intent): <plan_file>` to the "This run" block of every dimension prompt. A dimension reviewer that would report a change which the plan's `## Key Decisions`, `## Decisions taken without the owner` or `## Deviations & assumptions` section records on purpose does not report it; it reports a finding only where the code does not match the recorded decision.
  - Acceptance: exec cases whose descriptions start with `review-prepare-plan:`.
- R-security-owasp: The marketplace ships a canonical `security-review` dimension whose body enumerates the OWASP Top 10 (A01 broken access control, A02 cryptographic failures, A03 injection, A04 insecure design, A05 security misconfiguration, A06 vulnerable & outdated components, A07 identification & authentication failures, A08 software & data integrity failures, A09 logging & monitoring failures, A10 SSRF) and instructs the review subagent to tag each finding with the matching category code. Each finding in the dimension's findings JSON MAY carry an optional `owasp` key holding that code (`A01`–`A10`); the consolidated comment renders it as a ` · OWASP <code>` suffix on the finding's File line when present and omits it otherwise. The field is opt-in per dimension — only dimensions whose body instructs OWASP tagging populate it. Default severities follow OWASP impact: `critical` for A01, A02, A03, A07; `high` for A04, A05, A06, A08, A10; `medium` for A09.
  - Acceptance: `EXAMPLES.md` ships an OWASP-mapped `security-review` template; `REFERENCE.md` §2 findings-file schema names the optional `owasp` key and §3 renders the ` · OWASP {code}` suffix; promptfoo dataset covers all ten categories.

### Step-emitter contract

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

## Dispatch and routing

- R4: Delegate to the `review-orchestrator` agent (via Agent tool, NOT Skill tool) with the manifest file path and project root
- R6: After orchestrator returns, offer self-fix via `received-review-sdlc` when verdict is CHANGES REQUESTED or APPROVED WITH NOTES
- R7: When verdict is APPROVED, skip the self-fix offer
- R16: At Step 5 self-fix offer, when verdict is CHANGES REQUESTED with at least one dimension blocker, the skill MUST present an opt-in menu option that dispatches `Skill(harden-sdlc)` with `--failure-text <full failure text>`, `--skill review-sdlc`, `--step <step-id>`, `--operation <operation-name>`. The option is offered alongside the existing `received-review-sdlc` self-fix option. Selection is user-initiated only — the skill MUST NOT auto-dispatch and MUST NOT write any hardening surface silently. Menu wording is canonical and identical across all caller skills (`plan-sdlc`, `execute-plan-sdlc`, `review-sdlc`, `commit-sdlc`) and is suppressed when `--auto` is set.
- R-dimension-cap: The dispatch cap drops no dimension. `skill/review.js` gives every dispatched dimension (`status` ACTIVE or TRUNCATED) a `batch` index 1..⌈N/8⌉ in priority order (severity descending, then matched-file count ascending), with the dispatch batch size (8) dimensions per batch; it never sets a status `QUEUED`, and `plan_critique.queued_dimensions` stays an empty array (`summary.queued_dimensions` 0). The `review-orchestrator` dispatches each batch in one message, in batch order, and collects every result of a batch before it dispatches the next; the R-orchestrator-await barrier counts every dispatched dimension across all batches. The consolidated comment and the summary cover all of them. `plan_critique.dimension_cap_applied` stays true when more than 8 dimensions are ACTIVE.
  - Acceptance: with 10 matching dimensions the manifest lists 10 dispatched entries, each with a `slice_file` and `batch` 1 (8 entries) or 2 (2 entries), and none `QUEUED`; with 8 or fewer, every dispatched entry has `batch` 1; with 17, the batches hold 8, 8 and 1.
- P9: `subagent_model` (string) — model for dimension subagent dispatch, forwarded verbatim (C5); the value is tuning, see `docs/cost-tiers.md` §5.

## Gates

- G1: Manifest file produced — `skill/review.js` exits successfully and produces a valid file path
- G2: Orchestrator dispatched — agent is spawned (not via Skill tool) with manifest path, project root and REFERENCE.md path (C13)
- G3: `diff_dir` is removed by the skill in Step 6 after the terminal branch. Four stops keep it: the P11 summary-missing stop and the Step 4 link-verification stop (both so `review-comment.md` stays readable), the second orchestrator failure and the `Review failed: REFERENCE.md not found` return (R5; error-report-sdlc runs instead of Step 6 on both). A `diff_dir` left by these stops or by a denied removal is deleted by the next `skill/review.js` run once it is older than 24 hours (`sdlc-review-*` dirs under the OS temp dir); the same sweep removes the one a `--dry-run` run leaves today (aligning R3's clean-up with that is a follow-up). The manifest file persists under `.sdlc/execution/out/` and is pruned by `writeOutput` and the session-start sweep
- G4: Exactly one `review-orchestrator` Agent dispatch per `/review-sdlc` invocation (a retry on failure counts as the same attempt; user confirmation never triggers a new dispatch)
- G5: Full comment body displayed — Step 3 emits the verbatim contents of `${diff_dir}/review-comment.md` in the main context before the posting prompt is shown
- G6: Await barrier — the orchestrator collects one result per dispatched dimension (count == N, ACTIVE+TRUNCATED) before any consolidation, and never runs `review-consolidate.js` on partial or zero results (R-orchestrator-await)
- R14: Link verification — every URL embedded in the consolidated review comment body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` (CLI: `node scripts/lib/links.js --json`) before `gh api … /comments`. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts posting with non-zero exit and a structured violation list — no soft-warning mode.
- R20: Example URLs are quoted as code — a dimension reviewer writes every URL that a finding quotes as an example or as test data (not as a link for the reader to open) inside an inline code span, and the orchestrator's judgment pass wraps such a URL in a code span when a finding leaves it bare. A URL in a code span is not checked by the R14 link gate (pr-sdlc R20), so a finding that quotes a loopback, private or metadata address does not stop the comment from being posted.
  - Acceptance: `REFERENCE.md` §2 `## Output Format` and `agents/review-orchestrator.md` Step 3 state the rule; review only (behavioural runs are owner-initiated).
- R21: Blocking orchestrator wait. When the Agent call for the orchestrator returns before the orchestrator has finished (the harness runs it in the background), the skill waits only with `skill/review.js --wait-summary --manifest <m> [--interval <s>] [--timeout <s>] [--grace <s>]`, run as one foreground Bash call with the Bash `timeout` parameter 600000 and repeated until the orchestrator's return has arrived. The call reads `summary_copy_path` and `diff_dir` from the manifest and checks the summary every `--interval` seconds (default 5). It returns when the file at `summary_copy_path` parses as JSON and its `commentPath` resolves to `<diff_dir>/review-comment.md`, after `--grace` more seconds (default 15; a larger value is clamped to 30), or at `--timeout` (default 300; a larger value is clamped to 540). A file that does not parse counts as not ready. It prints one line `{"ready":<bool>,"summaryPath":"<abs>","commentPath":"<abs>","timedOut":<bool>}` and exits 0 in both cases. A missing `--manifest`, an unreadable manifest, a manifest without `summary_copy_path` or `diff_dir`, or a bad number exits 2 with one `Error:` line on stderr; on that exit the skill shows the line, does not repeat the call and stops with the failure line `Review failed: <Error line>`, because the orchestrator's summary cannot be located; this exit 2 is an input or manifest error, not a script crash, and is not sent to error-report-sdlc. The skill never starts `Monitor`, a background Bash command, `sleep` or any other timer to wait, and it stops with `TaskStop` every background task it started before it returns. The defaults are tuning values.
  - Acceptance: a summary whose `commentPath` matches prints `ready: true, timedOut: false`; one that names another directory prints `ready: false, timedOut: true` at `--timeout`; `--interval abc` and a missing manifest exit 2.
- R-orchestrator-await: The `review-orchestrator` agent MUST block until every dispatched dimension subagent returns before consolidating. (a) all dimension dispatches of a batch are sent in one message (R-dimension-cap); (b) the turn is not complete and the orchestrator MUST NOT enter Step 3 (critique) or Step 5 (persist `review-comment.md`) until it has collected exactly one result per dispatched dimension — N = count of dimensions with status ACTIVE or TRUNCATED; (c) if the runtime backgrounds a dispatch and re-invokes via task-completion notifications, it keeps awaiting across notifications until the collected count equals N. Consolidating on partial or zero results is forbidden.
- R-consolidate: Verdict, counts, the consolidated comment, `review-summary.json` and the orchestrator summary block are produced by `scripts/skill/review-consolidate.js` from per-dimension findings JSON (`<diff_dir>/<dimension>.findings.json`, written by each dimension subagent). The orchestrator's role is the judgment pass (semantic dedupe, contradictions, severity recalibration) over that JSON before consolidation. The script also writes the comment copy (same bytes as `review-comment.md`) to `commentCopyPath` (P11) before the summary. The script writes `review-summary.json` in one write to `summary_copy_path` (P11; `--summary-path` overrides the path for tests only), prints the summary block including the `Summary file:` and `Summary copy path:` lines, and on a malformed findings file exits 1 and writes nothing. A missing findings file of a dispatched dimension counts as a failed dimension (`Dimensions failed:`), not an error.
    - Acceptance: with the same manifest and findings input (same day) the script produces byte-identical `review-comment.md`, `review-summary.json` and stdout.

## Prepare script contract

- P1: `base_branch` (string) — base branch used for diff
- P2: `git.changed_files_count` (integer) — count of changed file paths (the full `git.changed_files` array is no longer emitted; only its length is carried, per R-manifest-index-slices)
- P3: `summary.active_dimensions` (number) — count of active review dimensions
- P4: `summary.skipped_dimensions` (number) — count of skipped dimensions
- P5: `dimensions` (array) — **thin index** entries (per R-manifest-index-slices). Each entry carries only `name`, `description`, `severity`, `model`, `effort`, `status`, `requires_full_diff`, `truncated`, `matched_count`, `diff_file`, `slice_file`, and `batch` (the dispatch batch index per R-dimension-cap; `null` for a non-dispatched entry). Heavy fields (`body`, `matched_files`, `file_context`, `warnings`) are NOT inlined — they live in the per-dimension slice file (see P10). Each entry's `status` field takes one of four values: `ACTIVE` (triggers matched changed files, or forced via `--dimensions` force-active per R-on-demand-force-active), `SKIPPED` (triggers matched zero files and dimension not named in `--dimensions` filter, or named but diff is empty), `TRUNCATED` (triggers matched but file count exceeded `max-files`), or `ERROR` (dimension file unreadable/malformed). `ACTIVE` may originate from either a trigger match or a `--dimensions` force-active override.
- P6: `plan_critique.uncovered_files` (string[]) — files not covered by any dimension
- P7: `plan_critique.over_broad_dimensions` (string[]) — dimensions reviewing too many files
- P8: `plan_critique.uncovered_suggestions` (array) — suggested additional dimensions
- P10: `dimensions[].slice_file` (string|null) — per-dimension slice file path (per R-manifest-index-slices). For each dispatched dimension (`status` ACTIVE/TRUNCATED), `review.js` writes `${diff_dir}/${name}.slice.json` containing `{ body, matched_files, file_context, warnings }` and sets `slice_file` to its absolute path. Non-dispatched dimensions (SKIPPED) have `slice_file: null`. The slice file is the sole carrier of the heavy per-dimension fields that the thin index (P5) omits — the orchestrator forwards this path to each subagent rather than reading the contents into its own context.
- P11: `review-summary.json` `{schemaVersion, verdict, counts, dimensions, commentPath, branch}` written by `review-consolidate.js` (R-consolidate), which the review-orchestrator runs, in one write straight to `summary_copy_path` (`counts` equals the summary table; `verdict` per the REFERENCE.md §3 verdict thresholds; `commentPath` is the absolute path of `review-comment.md` in `diff_dir`; `commentCopyPath` is the absolute path of a copy of the same comment written beside the summary, `<summary_copy_path without .json>.comment.md`, which outlives the Step 6 removal of `diff_dir` (G3) and is what ship-sdlc reads (R77)). `skill/review.js` emits `summary_copy_path` = `<main worktree>/.sdlc/execution/review-summary-<slug>.json` (`resolveStateDir()`, the resolver `writeOutput` and ship.js use; `<slug>` = `slugifyBranch(current_branch)`) in the manifest; the orchestrator takes it from there and returns it as both the `Summary file:` and the `Summary copy path:` line. No Bash call copies the file or creates its directory (no `cp`, no `mkdir`). Right after a `Review complete` return, before it displays, posts or self-fixes anything, the skill Reads the file with its Read tool and applies the stale-file guard: the file's `commentPath` must equal this run's `Comment file:` line (`diff_dir` is a new temp dir for every run, so a file left by an earlier review on the branch fails the guard). When the file is missing, unreadable, not JSON or stale, the skill reports `Review summary missing: <summary_copy_path>` with the `Comment file:` path and stops, keeping `diff_dir` (G3). ship-sdlc reads the same path after cleanup, also from a linked worktree (ship-sdlc R6).
- P12: `flags` `{ auto, post, skipConfigCheck }`, `post_decision` and `save_path`, resolved once by `skill/review.js`. `flags.post` is the validated `--post` value or null. `post_decision`: the `--post` value when given, except that `yes` resolves to `save` (with a stderr warning) when `pr.exists` is false; under `--auto` without `--post`, `yes` when `pr.exists`, else `save`; otherwise null, and Step 4 prompts as before. `save_path` is the absolute path `<active worktree>/.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` (characters outside `[A-Za-z0-9_-]` in the branch become `-`; local date). An invalid `--post` value is a prepare error (exit 1, `errors[]` entry `--post must be yes, save or none (got: <value>)`). The skill does not read the manifest (C1), so the orchestrator relays these values as the `Post decision:` (`yes`, `save`, `none` or `ask` for null), `Auto:` and `Save path:` lines of its summary.
- P13: `subagent_effort` (string) — effort for dimension subagent dispatch when the dimension sets none, forwarded verbatim like P9; the value is tuning, see `docs/cost-tiers.md` §7.
- P14: `plan_file` — the absolute `--plan` path when the file is readable; null when the flag is absent; null with a warning line on stderr when the file cannot be read (the review still runs).

## Failure handling and resume

- E1: `skill/review.js` exit 1 → show stderr message, stop (no error report)
- E2: `skill/review.js` exit 2 in Step 0 (crash) → show stderr, invoke error-report-sdlc
- E3: Orchestrator fails once → re-dispatch with same inputs (a `Review failed: REFERENCE.md not found` return → error-report-sdlc at once, R5)
- E4: Orchestrator fails twice → invoke error-report-sdlc
- R5: On orchestrator failure, re-dispatch once with the same inputs; on second failure, invoke error-report-sdlc. A `Review failed: REFERENCE.md not found` return goes to error-report-sdlc at once: a re-dispatch with the same inputs fails the same way

## Invariants and constraints

> **Requirement ID convention:** Sequential requirements use `R<N>` (R1, R2, …). Issue-linked requirements added post-launch use name-based IDs (`R-<slug>`) to avoid renumbering. Both forms are normative.

- R9: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- C1: Must not read the manifest JSON into main context (orchestrator reads it)
- C2: Must not read REFERENCE.md in main context (the orchestrator reads it from `REFERENCE_MD_PATH`, C13)
- C3: Must not invoke the orchestrator via the Skill tool — must use Agent tool
- C4: Must not invoke error-report-sdlc for user errors — only for script crashes (exit 2) and repeated orchestrator failures
- C5: Orchestrator MUST pass `manifest.subagent_model` to each dimension subagent Agent dispatch via the `model:` parameter
- C6: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C7: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C8: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C9: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C10: Orchestrator MUST NOT call `gh api` or prompt the user for PR-posting confirmation
- C11: Orchestrator MUST NOT delete `manifest.diff_dir` — the skill owns removal of the diff dir; neither deletes the manifest file (persistent, swept)
- C12: Skill MUST NOT re-dispatch the orchestrator to complete a posting flow already computed — `comment_file` from the orchestrator summary is authoritative
- C13: The orchestrator reads REFERENCE.md only from the path the skill passes in its dispatch (`REFERENCE_MD_PATH` = `skills/review-sdlc/REFERENCE.md` under the plugin root that the session-start hook reports). It never searches the home dir or the project for it; when the line or the file is missing, it fails with an error.

## Integration

- I1: `skill/review.js` — produces the review manifest with all git data
- I2: `review-orchestrator` agent — performs the actual multi-dimension review
- I3: `received-review-sdlc` — invoked to address review findings when verdict warrants
- I4: `setup-sdlc --dimensions` — creates the review dimension configuration
- I5: `commit-sdlc` — common follow-up after review approval
- I6: `error-report-sdlc` — invoked on script crashes and repeated orchestrator failures

## Appendix — history

### Issue trail

| Id | History |
|---|---|
| R14 | (issue #198) |
| R16 | (Fixes #221.) |
| R-config-version | (issue #232) |
| R-dimensions-path | (issue #231) |
| R-reviews-path | (issue #466) |
| R-branch-contrib-diff | (issue #239) |
| R17 | (issue #363) |
| R-common-prompt | (issue #519) |
| R-base-ref-fetch | (issue #239) |
| R19 | sha base skips the base fetch, #9364 |
| R-manifest-index-slices | (issue #447) |
| R-orchestrator-await | (issue #487) |
| R-security-owasp | (issue #272) |
| R-on-demand-force-active | (issue #362) |
| R-on-demand-force-active | See issue #362. |
| P11 | (issue #9198) |
| R20 | example URLs quoted as code, #9371 |
| R21 | blocking orchestrator wait (ledger F-48), #9372 |
