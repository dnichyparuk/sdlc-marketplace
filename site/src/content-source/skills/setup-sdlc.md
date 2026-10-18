# `/setup-sdlc` — Unified Project Setup

## Overview

Configures the SDLC plugin for a project. On invocation, `/setup-sdlc` shows a numbered list of sections printed directly to chat — version tracking, ship pipeline preferences, Jira, review scope, commit/PR patterns, review dimensions, PR template, plan and execution guardrails, and openspec enrichment. Each row shows a state badge (`set`, `not-set`, or `legacy`). Reply with the numbers to configure (or `all` / `not-set` / `none`) to select which sections to configure. For every selected section, the skill prints a verbose header before any prompt — purpose, files modified, consuming skills, and a per-option description block — so you know exactly what each toggle controls before you answer.

Creates `.sdlc/config.json` (project-level config), `.sdlc/local.json` (user-local preferences), and content artifacts (`.sdlc/review-dimensions/*.yaml`, `.sdlc/pr-template.md`, `openspec/config.yaml` managed block).

---

## Usage

```text
/setup-sdlc
```

Renders the selective-section menu. All sections are pre-checked by default; `legacy` (migration-required) sections are locked and auto-checked. Confirm with no rows selected to exit without changes. Use `--unset-only` to restore the legacy behavior of pre-checking only `not-set` sections.

```text
/setup-sdlc --only jira,review
```

Skip the menu, configure only `jira` and `review`. Useful for scripted runs or follow-up tweaks. Valid ids: `version`, `ship`, `jira`, `review`, `commit`, `pr`, `pr-labels`, `review-dimensions`, `pr-template`, `plan-guardrails`, `execution-guardrails`, `openspec-block`, `workspace`.

```text
/setup-sdlc --force
```

Pre-check every row in the menu and skip the per-field `keep` prompt — all configured values are reconfirmed rather than accepted with one keystroke.

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--migrate` | Run schema migration via `scripts/skill/migrate-config.js`: relocates legacy `.claude/sdlc.json` to `.sdlc/config.json`, walks the schema-version migration registry (`lib/config-migrations.js`) to bring both project + local configs to `schemaVersion: 3`, and consolidates legacy per-file configs (`.claude/version.json`, `.sdlc/ship-config.json`, etc.) via `lib/config.js::consolidateLegacyFiles`. Idempotent. Backups: legacy relocation writes to `.sdlc/sdlc.json.bak` (single, no timestamp); other in-place migrations write to `.sdlc/<file>.bak.<safe-iso>`. Setup sweeps to retain 3 newest per role. | — |
| `--skip <section>` | Skip a config section during setup (version, ship, jira, review, commit, pr) | — |
| `--force` | Skip the per-field `keep` prompt for every field — all values are reconfirmed rather than accepted with one keystroke. Does not change which rows are pre-checked (all rows are pre-checked by default). | — |
| `--unset-only` | Pre-check only sections in `not-set` state. Legacy fast-path before #235 — the default flow now pre-checks all rows. | — |
| `--only <ids>` | Comma-separated section ids to configure non-interactively (skips the menu). Valid: `version`, `ship`, `jira`, `review`, `commit`, `pr`, `pr-labels`, `review-dimensions`, `pr-template`, `plan-template`, `plan-guardrails`, `execution-guardrails`, `openspec-block`, `workspace` | — |
| `--dimensions` | Jump directly to review dimensions sub-flow (alias for `--only review-dimensions`) | — |
| `--pr-template` | Jump directly to PR template sub-flow (skip config builder) | — |
| `--plan-template` | Jump directly to plan template sub-flow (skip config builder). Scaffolds the project-owned `.sdlc/plan-template.md` override consumed by `/plan-sdlc` and by `validate-plan-format.js` PF10. | — |
| `--guardrails` | Jump directly to plan guardrails sub-flow (skip config builder) | — |
| `--execution-guardrails` | Jump directly to execution guardrails sub-flow (skip config builder) | — |
| `--openspec-enrich` | Jump directly to openspec config enrichment sub-flow | — |
| `--remove-openspec` | Remove the managed block from `openspec/config.yaml` (with `--openspec-enrich`) | — |
| `--add` | Expansion mode with `--dimensions` or `--guardrails` (propose only new items) | — |
| `--no-copilot` | Skip GitHub Copilot instructions with `--dimensions` | — |

> **Outdated CI scripts:** When setup-sdlc runs, it checks whether the project's installed pipeline-script files (managed by `scaffold-ci.js`) are at-or-above the version shipped by the running plugin. When any file is outdated, setup prints a warning listing the affected files and instructs you to run `/setup-sdlc --migrate` or `/version-sdlc --init` to update them. No auto-fix is applied — setup only reports state. (Implements #424 / R-SCRIPT-VERSIONS.)

---

## Examples

### First-time setup

```text
/setup-sdlc
```

Detects missing config, walks through version/ship/jira/review/commit/pr setup, then offers to create review dimensions and PR template.

### Migrate from legacy config files

```text
/setup-sdlc --migrate
```

Reads `.claude/version.json`, `.sdlc/ship-config.json`, `.sdlc/review.json`, and `.sdlc/jira-config.json`, merges them into `.sdlc/config.json` and `.sdlc/local.json`, and optionally deletes the legacy files.

### Migration cleanup

When `migrate-config.js` successfully relocates `.claude/sdlc.json` → `.sdlc/config.json` and copies `.claude/review-dimensions/` → `.sdlc/review-dimensions/`, it removes the following legacy artifacts in the same run:

- `.claude/sdlc.json` — removed after successful relocation
- `.claude/sdlc.json.bak` — removed (stale backup from pre-0.19 runs)
- `.claude/review-dimensions/` — removed after successful copy to `.sdlc/`

Cleanup is idempotent (safe to re-run) and is skipped when `--dry-run` is active.

Backup of the original project config is written to `.sdlc/sdlc.json.bak` before migration.

### Skip specific sections

```text
/setup-sdlc --skip jira --skip commit --skip pr
```

Configures version, ship, and review sections, skipping Jira, commit, and PR title setup.

### Configure commit and PR patterns

```text
/setup-sdlc --skip version --skip jira --skip ship
```

Focuses on review, commit, and PR pattern setup for code style enforcement.

### Review dimensions setup

```text
/setup-sdlc --dimensions
```

Jump directly to review dimensions configuration, skipping the config builder. Scans project tech stack and proposes review dimensions (e.g., security, performance, type safety).

### Expand existing review dimensions

```text
/setup-sdlc --dimensions --add
```

Expansion mode: proposes only dimensions not already installed, leaving existing dimensions unchanged.

### PR template setup

```text
/setup-sdlc --pr-template
```

Jump directly to PR template creation, skipping the config builder. Analyzes project conventions and guides you through creating a custom PR description template.

### Plan guardrails setup

```text
/setup-sdlc --guardrails
```

Jump directly to plan guardrails configuration, skipping the config builder. Configures custom rules evaluated by `/plan-sdlc` during critique phases.

### Configure worktree location (layout: sibling)

```text
/setup-sdlc --only workspace
```

Opens the worktree layout wizard. Selecting `sibling` places future worktrees next to the repo directory (e.g., `/path/to/myapp-feat-login`). Example prompts:

```
Where should sdlc create git worktrees?
  1. inside    /path/to/myapp/.claude/worktrees/example-feature
  2. sibling   /path/to/myapp-example-feature       ← selected
  3. central   ~/.sdlc/worktrees/myapp/example-feature
  4. template  Custom path with placeholders (advanced)

→ Next worktree will land at: /path/to/myapp-<branch-slug>
Write to .sdlc/local.json? [Y/n]
```

Resulting `.sdlc/local.json` entry:
```json
{ "workspace": { "worktree": { "layout": "sibling" } } }
```

### Configure worktree location (layout: template)

```text
/setup-sdlc --only workspace
```

Selecting `template` with `~/dev/wt/{repo}/{slug}`:

```
Template: ~/dev/wt/{repo}/{slug}
Live preview with your input:
  ~/dev/wt/myapp/example-feature  → /Users/you/dev/wt/myapp/example-feature

Write to .sdlc/local.json? [Y/n]
```

Resulting `.sdlc/local.json` entry:
```json
{ "workspace": { "worktree": { "layout": "template", "template": "~/dev/wt/{repo}/{slug}" } } }
```

### Expand guardrails

```text
/setup-sdlc --guardrails --add
```

Expansion mode: proposes only guardrails not already configured.

---

## Prerequisites

- Must be inside a git repository
- Node.js >= 16 (for `setup-prepare.js`)

---

## Sections

Every section the menu can configure. The label, purpose, files modified, and consumed-by columns mirror `scripts/lib/setup-sections.js` — the single source of truth that drives both the menu and the per-prompt help text.

| Section id | Purpose | Files modified | Consumed by |
|---|---|---|---|
| `version` | Tells `/version-sdlc` and `/ship-sdlc` where the canonical version lives (file or git tags) and how releases are tagged. | `.sdlc/config.json` | `/version-sdlc`, `/ship-sdlc` |
| `ship` | Developer-local pipeline preferences for `/ship-sdlc`: steps, default bump, draft PRs, auto-approve, workspace, rebase policy, review threshold. Stored in gitignored `.sdlc/local.json`. | `.sdlc/local.json` | `/ship-sdlc` |
| `jira` | Default Jira project key used by `/jira-sdlc`, `/commit-sdlc`, and `/pr-sdlc` when extracting or assigning ticket IDs. | `.sdlc/config.json` | `/jira-sdlc`, `/commit-sdlc`, `/pr-sdlc` |
| `review` | Default scope for `/review-sdlc` (committed/staged/working/worktree/all). Local to each developer. | `.sdlc/local.json` | `/review-sdlc` |
| `commit` | Commit message validation rules used by `/commit-sdlc` (subject regex, allowed types/scopes, required trailers). | `.sdlc/config.json` | `/commit-sdlc` |
| `pr` | PR title validation rules used by `/pr-sdlc` (title regex, allowed types/scopes, required trailers) plus `defaultBranch` — the target merge branch, auto-detected from the remote default and overridable for `develop`/`release/*` repos (issue #339). | `.sdlc/config.json` | `/pr-sdlc` |
| `pr-labels` | PR label assignment policy under `pr.labels`. Mode `off` (default) adds no automatic labels — `--label` overrides still work. Mode `rules` evaluates user-defined deterministic rules (branch prefix, commit type, path glob, JIRA type, diff size). Mode `llm` opts into the legacy fuzzy match. Configured via `--only pr-labels`. | `.sdlc/config.json` | `/pr-sdlc` |
| `review-dimensions` | Review dimensions installed under `.sdlc/review-dimensions/*.yaml`. Each dimension is a focused check set used by `/review-sdlc`. | `.sdlc/review-dimensions/*.yaml` | `/review-sdlc` |
| `pr-template` | PR description template at `.sdlc/pr-template.md`, used by `/pr-sdlc` when drafting PRs. | `.sdlc/pr-template.md` | `/pr-sdlc` |
| `plan-template` | Project-owned plan template at `.sdlc/plan-template.md`, used by `/plan-sdlc` to build the plan skeleton (Required Sections, Discovery Questions, Verification Patterns) and by `validate-plan-format.js` PF10 to check required-section presence. Without it, `/plan-sdlc` falls back to the shipped default template. | `.sdlc/plan-template.md` | `/plan-sdlc` |
| `plan-guardrails` | Custom rules at `.sdlc/config.json#plan.guardrails` evaluated by `/plan-sdlc` during critique phases. | `.sdlc/config.json` | `/plan-sdlc` |
| `execution-guardrails` | Runtime guardrails at `.sdlc/config.json#execute.guardrails` evaluated by `/execute-plan-sdlc` and `/ship-sdlc` before/after each wave. | `.sdlc/config.json` | `/execute-plan-sdlc`, `/ship-sdlc` |
| `openspec-block` | Managed block in `openspec/config.yaml` providing sdlc-utilities workflow guidance to OpenSpec-aware skills. Idempotent across plugin versions. | `openspec/config.yaml` | `/plan-sdlc`, `/execute-plan-sdlc`, `/ship-sdlc` |

### Field reference (selected sections)

For each non-delegated section, these are the fields the verbose header reveals before any prompt. Descriptions are the same strings shown at runtime.

#### `version`

| Field | Default | Description |
|---|---|---|
| `mode` | `file` | Tells `/version-sdlc` and `/ship-sdlc` whether the canonical version lives in a file or only in git tags. The default `file` mode requires a versionFile path; pick `tag` for projects that derive every release from `git describe`. |
| `versionFile` | `package.json` | Path to the file that holds the canonical version string. `/version-sdlc` reads and rewrites this file on each bump; setup auto-detects common paths. Ignored when mode is `tag`. |
| `fileType` | `package.json` | Format used by `/version-sdlc` to parse and rewrite the version file. The default `package.json` reads the top-level `version` key; `version-file` is a plain-text file containing only the version string. |
| `tagPrefix` | `v` | Prefix prepended to the version when `/version-sdlc` creates a release tag (e.g., prefix `v` produces `v1.2.3`). Empty string is allowed. |
| `changelog` | `false` | When true, `/version-sdlc` and `/ship-sdlc` append a release entry to `changelogFile` on every bump. |
| `changelogFile` | `CHANGELOG.md` | Path to the changelog file appended by `/version-sdlc` when changelog is enabled. |
| `preRelease` | (empty) | When set (e.g., `rc`, `beta`), `/version-sdlc` and `/ship-sdlc` default to a pre-release bump on every default invocation until an explicit `major\|minor\|patch` graduates the release. Must match `^[a-z][a-z0-9]*$`. When set, setup-sdlc validates compatibility with the configured `fileType` before writing: `pubspec.yaml` blocks with a clear/proceed prompt; `pyproject.toml` and `version-file` require explicit confirmation; other types proceed silently. |

#### `jira`

| Field | Default | Description |
|---|---|---|
| `defaultProject` | (empty) | Project key (2–10 uppercase letters, e.g., `PROJ`) used by `/jira-sdlc` when no explicit project is supplied. `/commit-sdlc` and `/pr-sdlc` also use it when extracting ticket IDs from branch names. |

#### `review`

| Field | Default | Description |
|---|---|---|
| `scope` | `committed` | Default scope for `/review-sdlc` when no `--committed`/`--staged`/`--working`/`--worktree` flag is passed. `committed` reviews commits on the current branch vs the default branch; `working` reviews staged + unstaged; `all` includes untracked. |

#### `ship`

The 15 `ship` fields are imported verbatim from `scripts/lib/ship-fields.js` (single source of truth for both `/ship-sdlc` and `/setup-sdlc`). Eight of the 15 are R57 tunables (`verifyPipelineTimeout`, `verifyPipelineInterval`, `verifyPipelineMaxIterations`, `awaitRemoteReviewTimeout`, `awaitRemoteReviewInterval`, `awaitRemoteReviewers`, `executeWaveTimeout`, `executeWaveInterval`) prompted only when the gating step (`verify-pipeline`, `await-remote-review`, or `execute`) is in the selected `ship.steps[]` — the prepare script applies these `when.stepInActiveSteps` gates per issue #292 / R15. The `executeWaveTimeout` ceiling is `3600` seconds, restating `MAX_WAVE_TIMEOUT_SECONDS` in `scripts/lib/ship-fields.js` — the single enforcement point (`Monitor.timeout_ms` caps at 3600000 ms). Run `/setup-sdlc --only ship` to see each field's default and description in the verbose header before answering.

#### `workspace`

| Field | Default | Description |
|---|---|---|
| `worktree.layout` | `inside` | Worktree placement strategy. `inside` creates under `.claude/worktrees/` (standard Claude Code convention). `sibling` creates next to the repo directory. `central` creates under `~/.sdlc/worktrees/<repoName>/`. `template` uses a custom path template with placeholders. |
| `worktree.base` | (layout default) | Override base directory for `inside`/`sibling`/`central` layouts. Accepts absolute paths and `~/paths`. Relative paths and `..` traversal are rejected. |
| `worktree.template` | (required for `template` layout) | Path template string. Must contain at least one of `{slug}` or `{branch}`. Available placeholders: `{repo}` (repo dirname), `{slug}` (branch slugified), `{branch}` (raw branch, `/` → `-`). |
| `worktree.ensureGitignore` | `true` | Auto-add `.claude/worktrees/` to root `.gitignore` managed block. Only effective for `inside` layout. |
| `worktree.nameTemplate` | `{slug}` | Final directory-name pattern (separate from placement). Placeholders: `{slug}`, `{branch}`, `{date}` (YYYY-MM-DD local tz), `{issue}` (first digit-run in branch; throws if branch has no digits). |

---

## Setup Flow

### Step 3: Configuration Sections

After version, ship, and Jira setup, `/setup-sdlc` guides you through code style enforcement for commits and pull requests:

#### Step 3e: Commit Message Patterns

Choose a commit message convention:

- **conventional** — Enforce type(scope): description format (e.g., `feat(auth): add OAuth2`)
  - Prompts for allowed types and scopes (or accepts defaults)
  - Writes `commit.allowedTypes`, `commit.allowedScopes`, `commit.subjectPattern`, `commit.subjectPatternError` to `.sdlc/config.json`

- **ticket-prefix** — Enforce ticket ID prefix (e.g., `PROJ-123: description`)
  - Prompts for ticket prefix pattern
  - Writes `commit.subjectPattern` and `commit.subjectPatternError`

- **custom** — Provide your own regex pattern
  - Prompts for `subjectPattern` and `subjectPatternError`
  - Writes custom pattern to `.sdlc/config.json`

- **skip** — No commit pattern validation
  - Skips this step; subsequent `/commit-sdlc` calls use auto-detected style

#### Step 3f: PR Title Patterns

Choose whether PR titles should match a specific pattern:

- **conventional** — Enforce type[(scope)]: description format for PR titles
  - Accepts same allowed types and scopes as commit setup (or different ones if preferred)
  - Writes `pr.allowedTypes`, `pr.allowedScopes`, `pr.titlePattern`, `pr.titlePatternError`

- **ticket-prefix** — Enforce ticket ID prefix in PR titles
  - Prompts for ticket prefix pattern
  - Writes `pr.titlePattern` and `pr.titlePatternError`

- **custom** — Provide your own regex pattern
  - Prompts for `titlePattern` and `titlePatternError`
  - Writes custom pattern to `.sdlc/config.json`

- **same-as-commit** — Use the same pattern as commit setup
  - Copies commit pattern fields to `pr` section if commit setup was not skipped
  - Available only if commit step was completed (not skipped)

- **skip** — No PR title pattern validation
  - Skips this step; subsequent `/pr-sdlc` calls generate titles without pattern enforcement

After selection, the skill writes the configuration to `.sdlc/config.json` and stores local preferences in `.sdlc/local.json`.

### Step 4: Content Setup

After configuration sections are complete, `/setup-sdlc` offers to set up content assets using built-in sub-flows:

#### Review Dimensions

Scans your project's tech stack, dependencies, and directory structure to propose review dimensions (e.g., security, performance, type safety, documentation). Each dimension defines a set of review checks to apply during `/review-sdlc`. Dimensions are stored in `.sdlc/review-dimensions/*.yaml`.

**Direct entry:** `/setup-sdlc --dimensions` or `/setup-sdlc --dimensions --add` (expansion mode)

#### PR Template

Analyzes project conventions (existing GitHub PR templates, recent PR patterns, JIRA usage) to propose a tailored PR description template. The result is saved to `.sdlc/pr-template.md` and used automatically by `/pr-sdlc`.

**Direct entry:** `/setup-sdlc --pr-template`

#### Plan Guardrails

Scans the project's codebase structure, dependencies, and architecture to propose and configure plan guardrails in `.sdlc/config.json`. Each guardrail defines a constraint that `/plan-sdlc` evaluates during its critique phases.

Proposals are displayed with their `[category]` tag (e.g. `[framework]`, `[scope]`, `[planning-discipline]`) so you can see at a glance which signal triggered each rule. Framework-specific proposals (Svelte/Astro island pattern, Prisma migration enforcement) are emitted automatically when the corresponding signal is detected (issue #336).

Selection is a two-stage flow:

- **Stage A** — Standard catalog: choose `all`, `select <numbers>`, or `cancel`. The `custom` option has moved to Stage B.
- **Stage B** (always-on unless Stage A cancelled) — "Add custom project-specific guardrails?" Entering `yes` opens a per-guardrail ID/description/severity loop; `no` proceeds directly to write.

**Direct entry:** `/setup-sdlc --guardrails` or `/setup-sdlc --guardrails --add` (expansion mode)

#### OpenSpec Enrichment

When `openspec/config.yaml` is detected during setup, offers to add a managed block with sdlc-utilities workflow guidance. The block uses string delimiters (`# BEGIN MANAGED BY sdlc-utilities (vN)` / `# END MANAGED BY sdlc-utilities (vN)`) and is idempotent — re-running at the same version is a no-op.

**Direct entry:** `/setup-sdlc --openspec-enrich` or `/setup-sdlc --openspec-enrich --remove-openspec` (removal)

Each option can be individually skipped or accessed later via the `--dimensions`, `--pr-template`, `--guardrails`, or `--openspec-enrich` flags.

### Diff Preview and Confirmation

Before writing any config files, `/setup-sdlc` renders a diff preview comparing the configuration as it was at startup against the values accumulated during the session:

```
| path                  | before    | after       |
|-----------------------|-----------|-------------|
| pr.defaultBranch      | (unset)   | develop     |
| pr.expectedAccount    | (unset)   | rnagrodzki  |
| version.tagPrefix     | v         | release/    |
```

When no fields changed, the preview is replaced with `No changes — nothing to write.` and the write step is skipped.

Otherwise, you are prompted to confirm before the write proceeds. Reject to discard all accumulated answers without touching the config files. In `--auto` mode the confirmation is suppressed and the write proceeds automatically.

### Step 5: Summary

After all steps complete, `/setup-sdlc` prints a summary of what was configured:

```
Version tracking   — [detected from package.json | configured]
Ship pipeline      — [configured | skipped]
Jira integration   — [configured | skipped]
Review dimensions  — [N dimensions created via dimensions sub-flow | skipped]
PR template        — [created via PR template sub-flow | skipped]
Plan guardrails    — [N configured via guardrails sub-flow | skipped]
```

---

## What It Creates or Modifies

| File | Purpose |
|------|---------|
| `.sdlc/config.json` | Unified project config with `version`, `jira`, `commit`, `pr` sections, and optional `plan.guardrails`. Carries top-level `schemaVersion: 3` (issue #232). The `version` section may include an optional `preRelease` field (lowercase label matching `^[a-z][a-z0-9]*$`) — when set, `version-sdlc` and `ship-sdlc` produce a pre-release version (e.g. `1.2.4-rc.1`) on every default bump until an explicit `major\|minor\|patch` graduates the release. Configured interactively via the customize path of Step 3a (version section). The `version.preRelease` field is gated by a fileType-compatibility check at setup time (see spec R-version-prerelease-compat). |
| `.sdlc/local.json` | User-local config with `review` scope preferences, `ship` settings, and (when configured) `workspace.worktree` layout. Carries top-level `schemaVersion: 3`. Gitignored (selective `.sdlc/.gitignore` block). |
| `.sdlc/.gitignore` | Selective managed block (issue #231) — committed: `config.json`, `review-dimensions/`. Ignored: `local.json`, `cache/`, `*.bak.*`, `.migration.lock`. Replaces the historical blanket `*\n` content. |
| `.sdlc/review-dimensions/*.yaml` | Review dimensions created during dimensions sub-flow (via `--dimensions`). Committed to the repo. |
| `.sdlc/pr-template.md` | PR template created during PR template sub-flow (via `--pr-template`). Legacy `.claude/pr-template.md` is read as a fallback during the deprecation window — issue #260. |
| `openspec/config.yaml` | Managed block added/updated by openspec enrichment sub-flow (via `--openspec-enrich`). Only the managed block is modified; user-authored content is preserved. |
| `.gitignore` (project root) | Managed v2 block (issue #231) listing transient skill artifact patterns (`*-context-*.json`, `*-manifest-*.json`, `*-prepare-*.json`) plus `.sdlc/` runtime patterns (`.sdlc/local.json`, `.sdlc/cache/`, `.sdlc/*.bak.*`, `.sdlc/.migration.lock`). Idempotent — re-running setup-sdlc replaces the block in place; v1 blocks are upgraded to v2. Existing user content is preserved. |
| `.sdlc/sdlc.json.bak` | Single one-time backup of the legacy project-config file when migration relocates it to `.sdlc/config.json` (issue #231 acceptance criterion). |

---

## Related Skills

- [`/review-sdlc`](review-sdlc.md) — multi-dimension code review (requires review dimensions)
- [`/pr-sdlc`](pr-sdlc.md) — pull request creation (uses PR template and patterns)
- [`/plan-sdlc`](plan-sdlc.md) — implementation planning (uses guardrails and commit patterns)
- [`/version-sdlc`](version-sdlc.md) — version management (reads config from `.sdlc/config.json`)
- [`/ship-sdlc`](ship-sdlc.md) — shipping pipeline (reads config from `.sdlc/local.json`)
- [`/jira-sdlc`](jira-sdlc.md) — Jira integration (reads config from `.sdlc/config.json`)
