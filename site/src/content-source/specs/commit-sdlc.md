# commit-sdlc Specification

> Generate and execute a git commit with a message matching the project's existing style, isolating staged changes via stash lifecycle management.

**User-invocable:** yes
**Model:** haiku (pinned on orchestrator agent, not skill frontmatter — see issue #202)
**Prepare script:** `skill/commit.js`

## Arguments

- A1: `--no-stash` — skip stashing unstaged changes before commit (default: false)
- A2: `--scope <scope>` — override inferred commit scope (default: auto-detected)
- A3: `--type <type>` — override inferred commit type (default: auto-detected)
- A4: `--amend` — amend the most recent commit instead of creating a new one (default: false)
- A5: `--auto` — skip interactive approval prompt; critique gates still run (default: false)
- A6: `--force-default-branch` — Allow `--auto` commits on the default branch; ignored when on a non-default branch. Internal-grade override; no config-driven equivalent.

## Core Requirements

- R1: Detect project commit style from the 15 most recent commits (conventional, plain imperative, ticket-prefix, or mixed)
- R2: Generate a commit message that matches the detected project style
- R3: When `commitConfig` is present, constrain type selection to `allowedTypes` and scope selection to `allowedScopes`
- R4: When `commitConfig.requireBodyFor` includes the selected type, the commit body must be non-empty
- R5: When `commitConfig.requiredTrailers` is set, include all listed trailer keys in the commit body
- R6: Validate subject line against `commitConfig.subjectPattern` regex before executing the commit; block on mismatch (hard gate, no override)
- R7: When `--amend` is set and `lastCommitMessage` is available, use it as the starting point and revise based on the current staged diff
- R8: When `--auto` is set, skip AskUserQuestion approval but still display the commit plan and run all critique gates
- R9: OpenSpec scope hint: when `flags.scope` is not set, check for an active OpenSpec change and use its directory name as a candidate scope (style precedence applies)
- R10: OpenSpec change trailer: when an active OpenSpec change is identified and a body is present, append an `OpenSpec-Change: <name>` trailer
- R11: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R12: Link verification (issue #198) — every URL embedded in the commit message body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` (CLI: `node scripts/lib/links.js --json`) before `git commit`. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts the commit with non-zero exit and a structured violation list — no soft-warning mode.
- R13: At Step 5 subject-pattern reject (`commitConfig.subjectPattern` mismatch), the skill MUST present an opt-in menu option that dispatches `Skill(harden-sdlc)` with `--failure-text <full failure text>`, `--skill commit-sdlc`, `--step <step-id>`, `--operation <operation-name>`. The option is distinct from the existing `edit subject` choice — it targets refining the regex or error message in `commitConfig`, not the current subject. Selection is user-initiated only — the skill MUST NOT auto-dispatch and MUST NOT write any hardening surface silently. Menu wording is canonical and identical across all caller skills (`plan-sdlc`, `execute-plan-sdlc`, `review-sdlc`, `commit-sdlc`) and is suppressed when `--auto` is set. (Fixes #221.)
- R14: When `currentBranch === defaultBranch`, the prepare script MUST emit `onDefaultBranch: true` and surface a `default-branch-commit` warning. In `--auto` mode, the prepare script MUST emit a blocking error in `errors[]` unless `--force-default-branch` is set. (Fixes #398.)
- R15: Prepare manifest MUST be written to `<stateDir>/commit-<branchSlug>-<timestamp>.json` via `lib/state.js → resolveStateDir()` so the manifest survives across separate Bash tool invocations in Claude Code. Prune-on-write removes previous `commit-<branchSlug>-*.json` entries for the current branch. The `parseStateFilename` regex MUST include `commit` in its prefix alternation so `pruneStateFiles` and `gcStateFiles` recognize the new prefix. The R12 link-verification gate behavior (#198) and the #209 leak-prevention invariant (no transient context manifests in cwd) MUST remain intact after the manifest path move. (Fixes #399.)
- R-config-version (issue #232): The prepare script `skill/commit.js` MUST call `verifyAndMigrate(projectRoot, 'project')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.

## Workflow Phases

1. CONSUME — read pre-computed context from `skill/commit.js` output (staged diff, recent commits, branch, config, flags)
   - **Script:** `skill/commit.js`
   - **Params:** A1-A5 forwarded (`--no-stash`, `--scope <s>`, `--type <t>`, `--amend`, `--auto`)
   - **Output:** JSON → P1-P13 (branch, flags, staged diff/stat/files, unstaged state, recent commits, last commit message, commit config)
2. PLAN — analyze diff and recent commits to generate commit message (type, scope, subject, body, trailers)
3. CRITIQUE — self-review message against all 10 quality gates
4. IMPROVE — fix failing gates (max 2 iterations per gate)
5. DO — present commit plan, obtain approval (or auto-approve), execute stash-commit-unstash sequence
6. CRITIQUE — verify commit was created and stash was restored

## Quality Gates

- G1: Style match — message follows project's commit style detected from `recentCommits`
- G2: Subject length — subject line is 72 characters or fewer
- G3: Accuracy — every claim in the message is traceable to `staged.diff` or `staged.diffStat`
- G4: Type correctness — commit type matches the nature of the change (feat=new, fix=bug, etc.)
- G5: Imperative mood — subject uses imperative form ("add" not "adds" or "added")
- G6: No fabrication — nothing in the message is invented beyond what the diff shows
- G7: Body relevance — body adds "why" context or is absent; does not restate the subject
- G8: Pattern match — subject matches `commitConfig.subjectPattern` regex (skip when config absent)
- G9: Required body — body present when type is in `commitConfig.requireBodyFor` (skip when config absent)
- G10: Required trailers — all `commitConfig.requiredTrailers` keys present in body (skip when config absent)

## Prepare Script Contract

- P1: `currentBranch` (string) — active git branch name
- P2: `flags` (object: `{ noStash, scope, type, amend, auto }`) — parsed CLI flags
- P3: `staged.files` (string[]) — list of staged file paths
- P4: `staged.fileCount` (number) — count of staged files
- P5: `staged.diff` (string) — full unified diff of staged changes
- P6: `staged.diffStat` (string) — diff stat summary line
- P7: `staged.diffTruncated` (boolean) — true when diff exceeded context budget
- P8: `staged.truncatedFiles` (string[]) — file paths whose full diffs were omitted
- P9: `unstaged.files` (string[]) — modified tracked files not staged
- P10: `unstaged.hasChanges` (boolean) — whether unstaged changes exist
- P11: `recentCommits` (string[]) — last 15 commits in oneline format
- P12: `lastCommitMessage` (string | null) — previous commit message (only when amend is true)
- P13: `commitConfig` (object | null) — commit validation config from `.sdlc/config.json`

## Error Handling

- E1: `skill/commit.js` exit 1 → show `errors[]` array to user, stop (no error report)
- E2: `skill/commit.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: No staged changes → inform user, suggest `git add`, stop (no error report)
- E4: `git stash push` fails → abort commit, show error, invoke error-report-sdlc if non-trivial
- E5: `git commit` fails (pre-commit hook) → show hook output, inform user stash is still in place, provide recovery instructions (no error report)
- E6: `git commit` fails (other) → show error, invoke error-report-sdlc
- E7: `git stash pop` conflict → warn user, suggest manual resolution (no error report)

## Constraints

- C1: Must not execute any git command before explicit user approval (unless `--auto`)
- C2: Must not fabricate changes not present in the staged diff
- C3: Must not skip the critique step
- C4: Must not include file paths in the subject line
- C5: Must not run `git stash` when `--no-stash` is true
- C6: Must not run `git commit --amend` unless `--amend` was explicitly passed
- C7: Must not stash untracked files — only stash modified tracked files (`--keep-index`, no `--include-untracked`)
- C8: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C9: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C10: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C11: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C12: Must not commit on `defaultBranch` in `--auto` mode unless `--force-default-branch` is also set.
- C13: Must not write the manifest to `os.tmpdir()`; the manifest must persist until the orchestrator subagent has finished consuming it.
- R-expected-branch (issues #347, #348, #349): When `--expected-branch <name>` flag is present, `skill/commit.js` MUST compare `git branch --show-current` to `<name>` via `lib/branch-guard.js::validateExpectedBranch`. The result MUST be attached as `branchGuard` field in commit-context output alongside the existing `currentBranch` field, with shape `{ ok: boolean, currentBranch: string, expectedBranch: string | null, active: boolean, message: string | null }`. On mismatch (`branchGuard.ok === false`), the prepare script MUST exit non-zero and emit `branchGuard.message` on stderr; the JSON output channel MUST NOT be corrupted. SKILL.md MUST abort before any `git commit` invocation when `branchGuard.active === true` AND `branchGuard.ok === false`, surfacing `branchGuard.message` verbatim. When `--expected-branch` is absent, `branchGuard.active === false` and behaviour is byte-identical to current (excluding the new field).
  - Acceptance: `skill/commit.js` parses `--expected-branch`; prepare output includes `branchGuard.ok`, `branchGuard.currentBranch`, `branchGuard.expectedBranch`, `branchGuard.active`, `branchGuard.message`; mismatch exits 3 with stderr; match exits 0 with `ok: true`; absent flag exits 0 with `active: false`; SKILL.md cites `branchGuard.ok === false` immediately after prepare-output read without re-deriving current branch.

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

- I1: `skill/commit.js` — provides all pre-computed context (diff, history, config)
- I2: `error-report-sdlc` — invoked on script crashes and persistent git failures
- I3: `review-sdlc` — common follow-up after committing
- I4: `pr-sdlc` — common follow-up after committing
- I5: `version-sdlc` — common follow-up after committing
- I6: OpenSpec — optional scope hint and change trailer when active change exists
