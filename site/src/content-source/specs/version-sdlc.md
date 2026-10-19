# version-sdlc Specification

> Execute a semantic release workflow: version bump, annotated git tag, optional CHANGELOG entry, release commit, and push to origin. Also supports one-time init setup and standalone changelog updates.

**User-invocable:** yes
**Model:** sonnet
**Prepare script:** `skill/version.js`

## Arguments

- A1: `major|minor|patch|<label>` — explicit bump type, where `<label>` is any pre-release label matching `^[a-z][a-z0-9]*$` (e.g., `rc`, `beta`, `alpha`, `mycorp`); a label-form value is syntactic sugar for `--bump patch --pre <label>` (default: auto-detected from conventional commits)
- A2: `--pre <label>` — create or increment a pre-release version with the given label (must match `^[a-z][a-z0-9]*$`; e.g., beta, rc) (default: none)
- A3: `--changelog` — generate or update a CHANGELOG entry; without a bump type, enters changelog-update workflow (default: from config)
- A4: `--hotfix` — mark release as a hotfix for DORA metrics tracking (default: false)
- A5: `--auto` — skip interactive approval prompts; critique gates still run (default: false)
- A6: `--init` — run one-time init workflow to scaffold versioning infrastructure (default: false)
- A7: `--no-push` — skip pushing to remote after release (default: false)
- A8: `--retag` — delete the existing tag for the current resolved version (local and remote), recreate it as an annotated tag pointing at HEAD, and push. Incompatible with bump types (`major`/`minor`/`patch`), `--init`, `--changelog`, and `--hotfix`. User-initiated retag; orthogonal to the CI-automated `retag-release.yml` workflow (I5). (Implements #424.)

## Core Requirements

- R1: Three distinct workflow branches determined by `flow` field: init, release, changelog-update
- R2: Determine bump type from explicit argument, or auto-detect from conventional commit summary; inform user of auto-selection rationale
- R-bump-flag: `--bump` is sometimes forwarded from ship-sdlc without being honored — the flag value must be the authoritative source. version-sdlc MUST parse `--bump <major|minor|patch|<label>>`; when present, the flag value is authoritative over the positional argument and over `conventionalSummary.suggestedBump`. The resolved bump is recorded in `flags.bump` in the prepare output.
  - Acceptance: passing `--bump minor` to `skill/version.js` when `suggestedBump` is `patch` yields `requestedBump: "minor"` in the output and the skill selects `minor` without warning the user; positional arg is ignored when `--bump` is also present.
- R-bump-promote: Users passing a lower-ranked bump than the auto-detected `suggestedBump` may silently get a weaker release — this must surface as a warning rather than a silent override. The prepare output MUST set `bumpPromotionDetected: true` when `requestedBump` (from `--bump` or positional) is lower-ranked than `conventionalSummary.suggestedBump` (e.g., `patch` requested when `suggestedBump` is `minor`); SKILL.md MUST surface this as a visible warning ("Requested bump X is lower than suggested Y — proceeding with X") and MUST NOT auto-upgrade the bump to the higher rank.
  - Acceptance: `bumpPromotionDetected` is `true` when `requestedBump=patch` and `suggestedBump=minor`; `false` when `requestedBump=minor` and `suggestedBump=patch`; `false` when `requestedBump` is `null` (auto mode). SKILL.md displays the warning when the field is `true`; it does not change the bump type.
- R3: When `hasBreakingChanges` is true and chosen bump is not major, warn the user and suggest major bump — UNLESS the resolved bump is a pre-release from any source (`--pre <label>`, label-form `--bump <label>`, or `config.preRelease`); pre-release trains skip the warning to avoid nagging on every RC iteration
- R4: Pre-release handling: `--pre` with bump type computes from base version; `--pre` alone increments existing pre-release counter
- R5: CHANGELOG entry uses Keep a Changelog format with today's date, mapping commit types to sections (feat→Added, fix→Fixed, refactor/perf→Changed)
- R6: Skip non-user-facing commit types in CHANGELOG (chore, docs, test, ci, build, style) unless clearly user-facing
- R7: When `config.ticketPrefix` is set, append extracted ticket IDs to changelog entries
- R8: Version file update uses targeted Edit (single-string replacement, NOT full rewrite) for ALL supported formats (package.json, plugin.json, Cargo.toml, pyproject.toml, TOML/YAML, etc.). Skill must verify post-edit that exactly one line of `<versionFile>` differs in `git diff`; if not, abort the release and restore the file with `git checkout -- <versionFile>`.
- R9: Annotated tag includes hotfix type annotation when `flags.hotfix` is true
- R10: Release commit message includes `[hotfix]` suffix when `flags.hotfix` is true
- R11: Push requires both `git push` and `git push --tags` (two separate commands)
- R12: When `--auto` is set, skip AskUserQuestion prompts but display the release plan and run all critique gates
- R13: Verify pre-conditions before execution: version file exists (file mode), tag does not conflict, no uncommitted changes, git identity configured
- R14: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- R15: When `remoteState.hasUpstream === false`, the push step uses `git push --set-upstream origin <currentBranch>` instead of bare `git push`; the subsequent `git push --tags` is unchanged. This avoids first-push failures on fresh feature branches.
- R16: Pre-release source precedence (top wins): (1) explicit base bump `major|minor|patch` (with optional `--pre <label>`); (2) explicit label-form `--bump <label>` OR explicit `--pre <label>`; (3) `config.preRelease` from `.sdlc/config.json`; (4) auto-detection from conventional commits. When `config.preRelease` is set and the user passes neither an explicit base bump nor `--pre` nor a label-form `--bump`, the resolved bump is `patch + --pre <config.preRelease>`. An explicit base bump always graduates the release out of the pre-release train regardless of `config.preRelease`. Label values from any source must match `^[a-z][a-z0-9]*$`.
  - *Non-normative note:* When invoked from ship-sdlc, callers are expected to forward the label form (`--bump <label>`) rather than `--bump patch` when `config.preRelease` is set — see ship-sdlc R63. version-sdlc's R16 precedence is unchanged.
- R17: Link verification (issue #198) — every URL embedded in changelog or release-notes body MUST be validated by `plugins/sdlc-utilities/scripts/lib/links.js` (CLI: `node scripts/lib/links.js --json`) before any commit/tag operation that publishes the body. Three URL classes are checked: (1) `github.com/<owner>/<repo>/(issues|pull)/<n>` — owner/repo identity must match the current remote, and the issue/PR number must exist on that repo; (2) `*.atlassian.net/browse/<KEY-N>` — host must match the configured Jira site; (3) any other `http(s)://` URL — generic reachability via HEAD (fall back to GET on 405), 5s timeout. Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) and any `ctx.skipHosts` entries are reported as `skipped`, not violations. `SDLC_LINKS_OFFLINE=1` skips network checks but keeps structural context-aware checks (GitHub identity match, Atlassian host match). Any violation aborts publication with non-zero exit and a structured violation list — no soft-warning mode.
- R-RETAG: When `--retag` is passed, version-sdlc retags the current resolved version by: (1) deleting the local tag (`git tag -d <tag>`), (2) deleting the remote tag (`git push origin :refs/tags/<tag>`), (3) recreating an annotated tag at HEAD (`git tag -a <tag> -m "Retag <tag>"`), and (4) pushing the new tag (`git push origin <tag>`). Exclusivity: `--retag` is incompatible with bump types (`major`/`minor`/`patch`), `--init`, `--changelog`, and `--hotfix`; all conflicts must be reported together (not short-circuited). Tag-existence pre-check: the candidate tag (derived from `v<currentVersion>`) must already exist (`git rev-parse refs/tags/<candidate>`); if not, the prepare script emits an error. This flag is orthogonal to the CI-automated `retag-release.yml` workflow — do not conflate. The prepare script emits `mode: "retag"`, `currentTag`, `oldSha`, and `head` SHA in its JSON output so SKILL.md can render the retag plan without re-parsing argv. (Implements #424.)
- R18: `flags.changelog` in `skill/version.js` output reflects the resolved value (`config.changelog === true` OR `--changelog` CLI flag passed). After Step 1 (CONSUME), `flags.changelog` is the **only authoritative gate** for every per-release changelog decision in SKILL.md. Specifically:
  - **Step 2 (PLAN — draft CHANGELOG entry):** gated on `flags.changelog === true`
  - **Step 8.2 (DO — write CHANGELOG entry to file):** gated on `flags.changelog === true` (must use the same gate phrasing as Step 2 — divergent phrasing is a violation)
  - **Step 5 (release plan display — "Changelog: yes/no" row):** rendered from `flags.changelog` (no hardcoded value)

  At these three sites the skill **must not** consult raw `$ARGUMENTS`, the original CLI string, or `config.changelog` — re-deriving the value defeats the script-resolution contract.

  **Carve-out:** Step 7.5 CI-scaffold installation (`check-changelog.cjs` and related persistent setup) legitimately reads `config.changelog === true`. Rationale: Step 7.5 concerns persistent project setup (whether the repo opts into changelog enforcement at all), not the current release. This site is the **only** acceptable post-CONSUME reference to `config.changelog` and must include an inline rationale comment so future contributors do not "fix" it.

- R-config-version (issue #232): The prepare script `skill/version.js` MUST call `verifyAndMigrate(projectRoot, 'project')` and `verifyAndMigrate(projectRoot, 'local')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R19: When the release flow is active (not `--retag`) and the HEAD commit already carries a semver release tag (i.e., a prior version-sdlc run already committed and tagged a release at the current HEAD), the bump MUST be a non-destructive skip — not a second increment — on both the `major`/`minor`/`patch` axis and the `-<label>.N` pre-release axis. The prepare script detects this by comparing HEAD SHA against all existing release-tag SHAs; if any release tag resolves to HEAD, `idempotency.alreadyBumped` is set to `true` and the script exits 0 without computing a new version. The guard MUST NOT fire under `--retag` (R-RETAG remains the authority for that flow). The guard MUST NOT over-block legitimate progression: a new commit since the last release moves HEAD off the tagged commit, making the guard inactive and allowing the bump to proceed normally.
- R20: Pre-release counter continuation. When resolving a pre-release bump (`--pre <label>`,
  label-form `--bump <label>`, or `config.preRelease`), the counter MUST continue past the
  highest existing `v<base>-<label>.N` git tag for the resolved base version — emitting `.N+1` —
  even when the train is tracked only via git tags and the version source carries no pre-release
  suffix. The resolved counter is `max(counter-from-version-source, highest-tag-counter + 1)`.
  Counter comparison MUST be numeric (not lexical tag sort). This requirement augments the bump
  computation and the G3 collision check only; the R19 idempotency guard and `getTagsAtHead`
  pre-release exclusion are unchanged.

## Workflow Phases

1. CONSUME — read pre-computed context from `skill/version.js` output (current version, commits, config, flags, bump options)
   - **Script:** `skill/version.js`
   - **Params:** A1 positional bump type (`major|minor|patch`), A2-A7 forwarded (`--pre <label>`, `--changelog`, `--hotfix`, `--auto`, `--init`, `--no-push`)
   - **Output:** JSON → P1-P14 (version source, config mode/changelog/ticket prefix, requested bump, conventional summary with suggested bump and breaking changes, bump options, latest tag, commits, flags, tag conflicts, remote state, current branch)
2. PLAN — determine bump type, compute new version, draft CHANGELOG entry if enabled
3. CRITIQUE — self-review against all 7 quality gates
4. IMPROVE — fix failing gates (max 2 iterations per gate)
5. DO — present release plan, obtain approval (or auto-approve), verify pre-conditions, execute release sequence (version file update, changelog, stage, commit, tag, push)
6. CRITIQUE — verify release completed (commit exists, tag exists, push succeeded)

## Quality Gates

- G1: Semver correctness — new version is valid semver (`major.minor.patch[-pre]`, no leading zeros)
- G2: Breaking change bump — if `hasBreakingChanges`, bump is major or is a pre-release (warn otherwise)
- G3: Tag conflict — the resolved next tag does not already exist. For base bumps this is
  `conflictsWithNext[bumpType] === false`; for a pre-release bump it is
  `conflictsWithNext.preRelease === false`, checked against ALL semver tags (including `-<label>.N`).
- G4: Changelog completeness — all user-facing commits (feat/fix) are represented (when changelog enabled)
- G5: No fabricated entries — every CHANGELOG entry traces to a real commit (when changelog enabled)
- G6: Commit count — there are commits to release (`commits.length > 0`), or this is a pre-release
- G7: Version file writable — file type is in the known supported list
- G8: Retag exclusivity — when `--retag` is passed, all incompatible flags (`major`/`minor`/`patch`/`--init`/`--changelog`/`--hotfix`) must be validated and reported together by the prepare script; SKILL.md must not proceed when `errors[]` is non-empty

## Prepare Script Contract

- P1: `versionSource.currentVersion` (string) — current version string
- P2: `config.mode` (string: "file" | "tag") — version storage mode
- P3: `config.changelog` (boolean) — whether changelog is enabled by default
- P4: `config.ticketPrefix` (string | null) — Jira/project key prefix for ticket ID extraction
- P5: `requestedBump` (string | null: "major" | "minor" | "patch" | label matching `^[a-z][a-z0-9]*$`) — explicitly requested bump type; a label-form value indicates the user passed `--bump <label>` (sugar for patch + `--pre <label>`), and the script-resolved `flags.preLabel` will reflect this
- P-bumpPromotionDetected: `bumpPromotionDetected` (boolean) — `true` when `requestedBump` is lower-ranked than `conventionalSummary.suggestedBump`; `false` otherwise (including when `requestedBump` is `null`). See R-bump-promote.
- P6: `conventionalSummary.suggestedBump` (string) — auto-detected bump type from commits
- P7: `conventionalSummary.hasBreakingChanges` (boolean) — whether any commit is a breaking change
- P8: `bumpOptions` (object: `{ major, minor, patch, preRelease }`) — pre-computed next versions
- P9: `tags.latest` (string) — most recent tag
- P10: `commits` (array) — commits since last tag, each with optional `ticketIds`
- P11: `flags` (object: `{ preLabel, noPush, changelog, hotfix, auto }`) — parsed CLI flags
- P12: `conflictsWithNext` (object: `{ major, minor, patch, preRelease }`) — whether each candidate
  tag already exists. `preRelease` is checked against the full semver tag list (incl. pre-release);
  the base axes remain checked against base-release tags only.
- P-idempotency: `idempotency` (object: `{ alreadyBumped: boolean, headReleaseTags: string[], reason: string | null }`) — emitted on the release flow; `alreadyBumped` is `true` when the HEAD commit already carries one or more semver release tags (see R19); `headReleaseTags` lists those tag names; `reason` is a human-readable explanation string when `alreadyBumped` is `true`, otherwise `null`. When `alreadyBumped` is `true` the prepare script exits 0 without computing a new version, and SKILL.md MUST skip the bump and inform the user that the release was already performed at HEAD.
- P13: `remoteState` (object: `{ hasUpstream, remoteBranch }`) — upstream tracking state for current branch; `hasUpstream` is false when no upstream is configured
- P14: `currentBranch` (string) — name of the currently checked-out branch

## Error Handling

- E1: `skill/version.js` exit 1 → show `errors[]`, stop (no error report)
- E2: `skill/version.js` exit 2 (crash) → show stderr, invoke error-report-sdlc
- E3: Tag already exists → suggest next available version, let user choose (no error report)
- E4: `git commit` fails → show error, invoke error-report-sdlc if non-hook failure
- E5: `git tag` fails → show error, invoke error-report-sdlc if non-duplicate failure
- E6: `git push --tags` fails → show error, invoke error-report-sdlc if non-auth failure
- E7: Uncommitted changes warning → use AskUserQuestion (proceed / commit first / cancel)

## Constraints

- C1: Must not execute any git command before explicit approval or auto-mode implicit approval
- C2: Must not fabricate commit descriptions or changelog entries not backed by real commits
- C3: Must not skip the critique step
- C4: Must not push to remote when `--no-push` is set
- C5: Must not modify the version file when `config.mode === "tag"` (version lives in git only)
- R-projectroot: Scripts that run relative to `process.cwd()` can silently operate on the wrong project root when invoked from a sub-directory, a git worktree, or by a parent skill with a different CWD. `skill/version.js` MUST resolve `projectRoot` via `resolveSdlcRoot()` (from `lib/config.js`); `process.cwd()` is forbidden as a project-root source.
  - Acceptance: `resolveSdlcRoot` is called at the top of `skill/version.js`; no bare `process.cwd()` usage appears in any path that contributes to `projectRoot`; calling the script from a subdirectory of the repo yields the same `projectRoot` as calling it from the repo root.
- R-expected-branch (issues #347, #348, #349): When `--expected-branch <name>` flag is present, `skill/version.js` MUST compare `git branch --show-current` to `<name>` via `lib/branch-guard.js::validateExpectedBranch`. The result MUST be attached as `branchGuard` field in version-context output alongside the existing `currentBranch` field, with shape `{ ok: boolean, currentBranch: string, expectedBranch: string | null, active: boolean, message: string | null }`. On mismatch (`branchGuard.ok === false`), the prepare script MUST exit non-zero and emit `branchGuard.message` on stderr; the JSON output channel MUST NOT be corrupted. SKILL.md MUST abort before Step 3 (commit/tag) when `branchGuard.active === true` AND `branchGuard.ok === false`, surfacing `branchGuard.message` verbatim. When `--expected-branch` is absent, `branchGuard.active === false` and behaviour is byte-identical to current (excluding the new field).
  - Acceptance: `skill/version.js` parses `--expected-branch`; prepare output includes `branchGuard.ok`, `branchGuard.currentBranch`, `branchGuard.expectedBranch`, `branchGuard.active`, `branchGuard.message`; mismatch exits 3 with stderr; match exits 0 with `ok: true`; absent flag exits 0 with `active: false`; SKILL.md cites `branchGuard.ok === false` at Step 2.5 without re-deriving current branch.
- C6: Must not omit pre-condition verification before execution
- C7: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C8: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C9: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C10: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior

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

- I1: `skill/version.js` — provides all pre-computed version context
- I2: `error-report-sdlc` — invoked on script crashes and persistent git failures
- I3: `commit-sdlc` — can be invoked when uncommitted changes need committing first
- I4: `jira-sdlc` — common follow-up to update ticket status after release
- I5: `retag-release.yml` — CI workflow scaffolded during init to handle squash-merge tag relocation
- I6: `ci/check-changelog.cjs` — CI script scaffolded during init to validate changelog presence
