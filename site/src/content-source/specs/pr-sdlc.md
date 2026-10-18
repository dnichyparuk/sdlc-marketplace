# pr-sdlc Specification

> Generate and execute an 8-section PR description (or custom template) from pre-computed git context, with auto-labeling, title pattern validation, and create/update mode support.

**User-invocable:** yes
**Model:** sonnet
**Prepare script:** `skill/pr.js`

## Arguments

- A1: `--draft` — create PR as a draft (default: false)
- A2: `--update` — update an existing PR instead of creating a new one (default: false)
- A3: `--base <branch>` — target base branch for the PR (default: auto-detected)
- A4: `--auto` — skip interactive approval; critique gates still run (default: false)
- A5: `--label <name>` — force a label onto the PR; repeatable; creates label if missing in repo (default: none)

## Core Requirements

- R1: Default template has 8 mandatory sections: Summary, JIRA Ticket, Business Context, Business Benefits, Technical Design, Technical Impact, Changes Overview, Testing
- R2: When `customTemplate` is present, parse its `## Heading` sections and use those instead of the default 8 sections
- R3: All sections in the active template must always be present — fill with real content, "N/A", or "Not detected"; never omit or leave empty
- R4: Changes Overview uses logical concepts only — zero file paths in this section
- R5: PR title must be under 72 characters
- R6: When `prConfig.titlePattern` is set, validate title against the regex before executing `gh` CLI (hard gate)
- R7: When `prConfig.allowedTypes` or `allowedScopes` are set, constrain title generation accordingly
- R8: Label assignment is mode-driven via `prConfig.labels.mode` (issue #197). Three modes: `off` (default — no automatic labels), `rules` (deterministic evaluation of `prConfig.labels.rules[]`), `llm` (legacy fuzzy match against `repoLabels` using 5 signal types: branch prefix, commit subjects, changed file paths, diff size, Jira ticket type). When `prConfig.labels` is absent, mode defaults to `off`. The fuzzy-match heuristic that ran unconditionally before #197 now runs only when the user explicitly opts in via `mode: "llm"`.
- R8a: In `rules` mode, every rule is `{ label: string, when: <one signal> }` where the signal is exactly one of `branchPrefix: string[]`, `commitType: string[]`, `pathGlob: string[]`, `jiraType: string[]`, or `diffSizeUnder: integer`. `pathGlob` matches only when **every** changed file matches at least one glob (all-changed-files semantics); `commitType` matches when any commit subject begins with `<type>:` or `<type>(scope):`. Rules whose `label` is not in `repoLabels` are stripped at validation time in `pr.js` with a warning — the skill never receives invalid rules.
- R8b: Each suggested label carries a provenance tag in the Step 5 display: `(forced)`, `(rule)`, or `(llm)`. The Labels line is omitted entirely when the final list is empty (e.g. `mode: "off"` with no forced labels).
- R9: Labels must exist in `repoLabels` — never fabricate labels not in the repository (defense-in-depth gate that applies after rule stripping and to `llm` output)
- R10: Forced labels (`--label`) bypass `prConfig.labels.mode` entirely — they apply in all three modes (including `off`), are always included, dedupe against rule/llm matches with forced winning provenance, and are created via `gh label create` if missing in repo
- R11: In update mode, existing labels are preserved; only new labels are added via `--add-label`
- R12: When `--auto` is set, skip AskUserQuestion approval and apply labels directly; critique gates still run
- R13: OpenSpec enrichment: when an active OpenSpec change is detected, use proposal.md for Business Context/Benefits and design.md for Technical Design
- R14: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R15: Link verification (issue #198) — every URL embedded in the PR body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` before any `gh pr create` / `gh pr edit` invocation. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts publication with non-zero exit and a structured violation list — no soft-warning mode.
- R16: SSH host-alias fallback in post-flight account-switch recovery (issue #311) — when the repo remote uses a non-canonical SSH host alias (e.g. `github-rn`) and no matching gh account is found under that alias, the recovery helper (`recoverGhAccountForRepo`) MUST query `github.com` as a fallback. If a matching account is found under `github.com`, it is switched to and `viaFallback: true` is set on the result. The failure hint MUST advise `gh auth login --hostname github.com` (the canonical host), never the SSH alias hostname. Live `gh auth switch` for fallback accounts MUST include `--hostname github.com`. Implements fix for issue #311.
- R-config-version (issue #232): The prepare script `skill/pr.js` MUST call `verifyAndMigrate(projectRoot, 'project')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R-branch-contrib-diff (issue #239): The PR description's diff stat (`P8: diffStat`) and diff content (`P9: diffContent`) MUST reflect only the branch's contribution — commits between the merge-base of `baseBranch` and `HEAD` and `HEAD` itself. Files that landed on `baseBranch` after divergence MUST NOT inflate the stats or appear in the diff content. Implementation uses git's three-dot range form (`<base>...HEAD`) in the shared `lib/git.js::getDiffStat` and `getDiffContent` helpers, ensuring cross-skill consistency with `review-sdlc`.
  - Acceptance: on a non-rebased branch with post-divergence base commits, `skill/pr.js` produces a `diffStat` and `diffContent` containing only the feature branch's own changes.
- R-base-ref-fetch (issue #239): Before computing the branch-contribution diff stat / content, `skill/pr.js` MUST attempt a best-effort `git fetch origin <base>:<base>` via `lib/git.js::fetchBaseRef(baseBranch, projectRoot)`. The fetch failure is non-fatal — the skill proceeds with whatever the local ref reports.
  - Acceptance: with `origin` unreachable or absent, `skill/pr.js` still exits successfully and produces a complete prepare output.
- R-gh-auth-preflight (issue #234, fixes #380): The prepare script `skill/pr.js` MUST run a gh-auth preflight before any GitHub API call:
  1. Verify `gh auth status --hostname github.com` succeeds. On no-auth or expired-token, halt with the no-auth or expired-token message verbatim.
  2. Resolve `expectedAccount` via the cascade: `prConfig.expectedAccount` → (when unset) skip identity match and instead probe repo access via `lib/git.js::probeRepoAccess` against `parseRemoteOwner(cwd)`. Probe halts on definitive access denial (404/403) with a `formatAccessDenied` message that names the active account and lists local `gh` accounts authenticated for the host (from `getGhAccounts`; the list is name-only — no per-account access probe is performed). Probe network-failure (null result) warns and proceeds. When `remoteForAuth` is null (no origin), skip the probe entirely.
  3. When `expectedAccount` is set (identity-mode): compare it against the active account from `gh api user --jq .login`.
  4. On identity mismatch, halt with the EXACT 3-line message:
     ```
     Expected gh account: <expected>
     Active gh account:   <actual>
     Run: gh auth switch --user <expected>
     ```
  5. When neither `prConfig.expectedAccount` is set nor a probe origin is resolvable, emit a warning and proceed — best-effort cascade, never halt on unresolvable expected account.

  Preflight cases covered: matching account (proceeds), mismatched account (halts with exact message), no auth (halts), expired token (halts), access-probe accessible (proceeds with `repoAccessProbed: true, repoAccessible: true`), access-probe denied (halts with `formatAccessDenied`), access-probe network-failure (warns and proceeds with `repoAccessProbed: true, repoAccessible: null`).

  - Acceptance: prepare output JSON contains `ghAuthenticated`, `activeAccount`, `expectedAccount`, `accountMismatch`, `repoAccessProbed`, `repoAccessible`, `repoAccessStatus` keys; identity mismatch sets exit code 1 and emits the exact halt message; access-probe denial sets exit code 1 and emits `formatAccessDenied`; no-auth sets exit code 1 with a clear no-auth message; unresolvable expected account exits 0 with a `warnings[]` entry, not a halt.
- R-pr-template-path (issues #260, #231, precedent #259): The PR template path follows the same canonical-with-fallback shape used for review dimensions (`R-dimensions-path`). The canonical location is `<project>/.sdlc/pr-template.md`. When the canonical file is absent, the resolver reads the deprecated location `<project>/.claude/pr-template.md` and emits a one-time stderr deprecation warning per process. The deprecation fallback MUST remain for two minor versions following the migration release; removal requires bumping the deprecation window. Resolution lives in a single helper `lib/pr-template.js` exporting `resolvePrTemplatePath(projectRoot)` and `loadPrTemplate(projectRoot)`; every consumer (`skill/pr.js`, `ci/validate-pr-template.js`) routes through it (single-source-of-truth per `flag-resolution-single-source`). The hook `hooks/post-tool-validate.js` is regex-based and matches BOTH `.sdlc/pr-template.md` and `.claude/pr-template.md` paths during the deprecation window.
  - Acceptance: with template at `.sdlc/pr-template.md`, P12 is populated and no warning is emitted; with template only at `.claude/pr-template.md`, P12 is populated AND stderr contains exactly one deprecation warning per process; with both files present, the canonical `.sdlc/` path wins and no warning is emitted; the hook regex matches a Write/Edit to either path and dispatches `validate-pr-template.js`.
- R-basebranch-config-cascade (issue #339): The prepare script `skill/pr.js` MUST resolve `baseBranch` using a priority cascade: (1) CLI `--base <branch>` flag (highest priority); (2) `config.pr.defaultBranch` from the project config (`.sdlc/config.json`); (3) `lib/git.js::detectBaseBranch` runtime git detection (lowest priority / fallback). When `config.pr.defaultBranch` is used, the script MUST verify that `origin/<value>` exists (same check applied to `--base` overrides); if the branch does not exist on origin, `pr.js` MUST exit with non-zero and emit an error naming the config path (`.sdlc/config.json` → `pr.defaultBranch`). The resolved `baseBranch` field in prepare output is the single consumption point — SKILL.md reads it without re-detecting.
  - Acceptance: (a) config `pr.defaultBranch: 'develop'` with no `--base` flag → prepare output `baseBranch === 'develop'`; (b) `--base release/v2` with config `pr.defaultBranch: 'develop'` → `baseBranch === 'release/v2'` (flag wins); (c) no config field and no flag → `detectBaseBranch` fallback (existing behavior preserved); (d) config value `pr.defaultBranch: 'nonexistent'` with that branch absent on origin → prepare exits non-zero with an error message naming `.sdlc/config.json` `pr.defaultBranch`.

## Workflow Phases

1. CONSUME — run prepare script, read PR context JSON (commits, diff, labels, config, custom template)
   - **Script:** `skill/pr.js`
   - **Params:** A1-A5 forwarded (`--draft`, `--update`, `--base <branch>`, `--auto`, `--label <name>`)
   - **Output:** JSON → P1-P18 (mode, branches, draft flag, existing PR, jira ticket, commits, diff stats/content, changed files, repo labels, custom template, PR config, auth, remote state, warnings)
2. PLAN — draft all sections of the active template, draft title, infer labels
3. CRITIQUE — self-review against all 12 quality gates
4. IMPROVE — fix failing gates (max 2 iterations per gate); ask clarifying questions for Business Context/Benefits if needed
5. DO — present title, labels, and description; obtain approval (or auto-approve); validate title pattern; create labels JIT; execute `gh pr create` or `gh pr edit`

## Quality Gates

- G1: All sections present — every section in the active template has content (real, "N/A", or "Not detected")
- G2: Specificity — Summary names a concrete change, not vague ("various improvements")
- G3: Business honesty — Business Context/Benefits are concrete or "N/A"; no invented reasons
- G4: No file paths — Changes Overview uses concepts only (applies only if active template includes this section)
- G5: Title length — title is under 72 characters
- G6: Title pattern match — title matches `prConfig.titlePattern` regex (skip when null)
- G7: No fabrication — all claims traceable to commits, diff, or user input
- G8: JIRA accuracy — JIRA value matches evidence or is "Not detected"
- G9: Audience check — Summary and Business sections readable by non-technical stakeholders
- G10: Documentation sync — structural changes have corresponding docs updates or user confirmation
- G11: Label validity — every label in `suggestedLabels` exists in `repoLabels`
- G12: Forced label inclusion — every label in `forcedLabels` appears in the final label list

## Prepare Script Contract

- P1: `mode` (string: "create" | "update") — whether creating or updating a PR
- P2: `baseBranch` (string) — target base branch
- P3: `currentBranch` (string) — branch being PR'd
- P4: `isDraft` (boolean) — whether to create as draft
- P5: `existingPr` (object | null) — `{ number, title, url, state, labels }` for update mode
- P6: `jiraTicket` (string | null) — detected ticket reference
- P7: `commits` (array) — `[{ hash, subject, body, coAuthors }]`
- P8: `diffStat` (object) — `{ filesChanged, insertions, deletions, summary }`
- P9: `diffContent` (string) — full unified diff text
- P10: `changedFiles` (string[]) — relative file paths changed
- P11: `repoLabels` (array) — `[{ name, description }]` labels defined in the repository
- P12: `customTemplate` (string | null) — content of `.sdlc/pr-template.md` (canonical) or `.claude/pr-template.md` (deprecated fallback) resolved via `lib/pr-template.js::loadPrTemplate`; null when neither file exists. See R-pr-template-path.
- P13: `prConfig` (object | null) — PR title validation config from `.sdlc/config.json`
- P14: `isAuto` (boolean) — whether `--auto` was passed
- P15: `forcedLabels` (string[]) — labels forced via `--label` flag(s)
- P16: `ghAuth` (object | null) — `{ switched, account, previousAccount }` GitHub account switch result
- P17: `remoteState` (object) — `{ pushed, remoteBranch, action }`
- P18: `warnings` (string[]) — non-fatal notes

## Error Handling

- E1: `skill/pr.js` exit 1 → show `errors[]`, stop (no error report)
- E2: `skill/pr.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: `gh pr create` / `gh pr edit` fails with 5xx → show error, offer manual fallback, invoke error-report-sdlc
- E4: `gh` unavailable → show install instructions (no error report)
- E5: `gh` auth failure → show `gh auth login` instructions (no error report)
- E6: Title pattern validation fails → show error message, ask user to edit title
- E7: `gh pr create` fails with a repo-permission error → post-flight account-switch recovery (distinct from pre-flight `ensureGhAccount`): if a local gh account matching the repo owner is found, switch to it automatically and retry `gh pr create` exactly once; the user sees a single concise recovery line and not the raw error. If no matching account exists, surface the original error with a `gh auth login` hint for the correct hostname. A second consecutive permission failure is terminal. Max one retry per pipeline invocation. References issue #184.

## Constraints

- C1: Must not omit any section from the active template
- C2: Must not write generic descriptions ("various improvements", "code cleanup")
- C3: Must not fabricate JIRA ticket, business reason, or technical claim
- C4: Must not include file paths in Changes Overview
- C5: Must not execute `gh pr create/edit` without approval (unless `--auto`)
- C6: Must not skip the critique-improve cycle
- C7: Must not run git or gh bash commands to gather data — all context from `PR_CONTEXT_JSON`
- C8: Must not suggest labels not in `repoLabels`
- C9: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C10: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C11: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C12: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- R-expected-branch (issues #347, #348, #349): When `--expected-branch <name>` flag is present, `skill/pr.js` MUST compare `git branch --show-current` to `<name>` via `lib/branch-guard.js::validateExpectedBranch`. The result MUST be attached as `branchGuard` field in pr-context output alongside the existing `currentBranch` field, with shape `{ ok: boolean, currentBranch: string, expectedBranch: string | null, active: boolean, message: string | null }`. On mismatch (`branchGuard.ok === false`), the prepare script MUST exit non-zero and emit `branchGuard.message` on stderr; the JSON output channel MUST NOT be corrupted. SKILL.md MUST abort before any `gh pr create` / `gh pr edit` invocation when `branchGuard.active === true` AND `branchGuard.ok === false`, surfacing `branchGuard.message` verbatim. When `--expected-branch` is absent, `branchGuard.active === false` and behaviour is byte-identical to current (excluding the new field).
  - Acceptance: `skill/pr.js` parses `--expected-branch`; prepare output includes `branchGuard.ok`, `branchGuard.currentBranch`, `branchGuard.expectedBranch`, `branchGuard.active`, `branchGuard.message`; mismatch exits 3 with stderr; match exits 0 with `ok: true`; absent flag exits 0 with `active: false`; SKILL.md cites `branchGuard.ok === false` immediately after prepare-output read without re-deriving current branch.

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

- I1: `skill/pr.js` — provides all pre-computed PR context
- I2: `gh` CLI — used for PR creation, update, and label creation
- I3: `error-report-sdlc` — invoked on script crashes and persistent gh failures
- I4: OpenSpec — optional enrichment for Business Context/Benefits and Technical Design
- I5: `review-sdlc` — common follow-up after PR creation
- I6: `version-sdlc` — common follow-up after merge
- I7: `setup-sdlc --pr-template` — creates custom PR template
- I8: `commit-sdlc` — commit changes before creating PR
