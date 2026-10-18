# `/pr-sdlc` — Pull Request Creation

## Overview

Analyzes all commits and the diff on the current branch, generates a structured PR description, and opens the PR via the GitHub CLI. Presents the generated description for review before creating. Supports custom per-project templates.

The diff stat and diff content used by the description reflect only the branch's contribution — they use git's three-dot range form (`<base>...HEAD`) so files that landed on the base branch after divergence do not inflate the stats (issue #239). Before computing the diff, the prepare script attempts a best-effort `git fetch origin <base>:<base>` to fast-forward the local base ref; failure (offline, no remote, auth denied) is non-fatal.

---

## Usage

```text
/pr-sdlc
```

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--draft` | Create the PR as a draft | — |
| `--update` | Update the description of an existing PR on this branch | — |
| `--base <branch>` | Target branch for the PR | repo default |
| `--auto` | Skip interactive approval — create/update the PR immediately after generation | — |
| `--label <name>` | Force a label onto the PR (repeatable). Created automatically if it doesn't exist in the repo | — |
| `--expected-branch <name>` | **Internal — set by ship-sdlc.** Validates that the current branch matches `<name>` before any `gh pr create` / `gh pr edit` invocation. Exits non-zero if the branches differ. Cross-link: see [ship-sdlc branch-verification guard](ship-sdlc.md#branch-verification-guard). | inactive |

---

## Examples

### Create a PR

```text
/pr-sdlc
```

Generates and displays a structured description, then prompts:

```text
PR Title: feat: add webhook retry with idempotency keys
Labels: enhancement, api

PR Description:
─────────────────────────────────────────────
## Summary
Added idempotency key validation to the webhook retry handler to prevent
duplicate payment processing on retried events.

## Business Context
Retried webhook events were being processed multiple times, causing duplicate
charges for customers at checkout.

## Technical Design
Use Stripe's event ID as an idempotency key, stored in a `processed_events`
table with a TTL index to bound storage growth.

## Changes Overview
- Webhook handler validates event ID before processing and records it after success
- New migration adds `processed_events` table with TTL index
- Retry deduplication test coverage added

## Testing
4 new unit tests covering duplicate event detection, first-time processing,
expired TTL, and concurrent retry scenarios.
─────────────────────────────────────────────

Create this PR? (yes / edit / cancel)
```

### Create a draft PR targeting a specific branch

```text
/pr-sdlc --draft --base release/2
```

### Update an existing PR description

```text
/pr-sdlc --update
```

### Force a label onto the PR

```text
/pr-sdlc --label skip-version-check
```

Multiple labels can be forced: `/pr-sdlc --label bug --label urgent`. Forced labels are always included regardless of auto-labeling signals and are created in the repository if they don't already exist.

### Create a PR without interactive approval

```text
/pr-sdlc --auto
```

Generates the description, runs critique/improve internally, and creates the PR without prompting for confirmation. Combine with `--draft` for a safety net: `/pr-sdlc --auto --draft`.

---

## Custom PR Templates

By default, `/pr-sdlc` uses an 8-section template (Summary, JIRA Ticket, Business Context, Business Benefits, Technical Design, Technical Impact, Changes Overview, Testing). Replace it with a project-specific template by creating `.sdlc/pr-template.md`. (Legacy `.claude/pr-template.md` is read as a fallback for two minor versions and emits a one-time deprecation warning — issue #260.)

A template is a plain markdown file with `## Section` headings. The text under each heading is a fill instruction for the LLM:

```markdown
## Summary
[1-3 sentence plain-language overview of the change]

## What Changed
[Describe what was changed, grouped by logical concern. No file paths.]

## Why
[Business or technical reason for this change]

## Testing
[How was this verified? Manual steps, automated tests, edge cases.]
```

Run `/setup-sdlc --pr-template` to create or edit the template interactively.

---

## Auto-Labeling

Label assignment is **mode-driven** via the `pr.labels` block in `.sdlc/config.json` ([issue #197](https://github.com/rnagrodzki/sdlc-marketplace/issues/197)). Three modes are supported; the default is `off`.

| Mode | What it does |
|---|---|
| `off` (default) | No automatic labels. Only forced labels from `--label` apply. |
| `rules` | Evaluates user-defined `{ label, when }` rules deterministically. Each rule maps one signal (branch prefix, commit type, changed-path glob, JIRA issue type, or diff size) to one repo label. |
| `llm` | Legacy fuzzy matching by the model — opt-in only. Preserves the pre-#197 behavior for projects that explicitly want it. |

Configure a project's mode by running:

```bash
/setup-sdlc --only pr-labels
```

The sub-flow scans `gh label list`, prompts for a mode, and (for `rules`) walks you through rule entry. See [setup-sdlc](setup-sdlc.md) for details.

**Provenance tags** appear in the Step 5 Labels line so it is always clear how a label was selected:

- `(forced)` — applied via `--label` or by `/ship-sdlc` (e.g. `skip-version-check`)
- `(rule)` — matched a deterministic rule under `pr.labels.rules`
- `(llm)` — fuzzy-matched by the model (mode `llm` only)

### Example: `mode = "off"` (default)

```json
{
  "pr": {
    "labels": { "mode": "off" }
  }
}
```

No labels are suggested. Forced labels still work. `/pr-sdlc --label bug` adds `bug` regardless of mode.

### Example: `mode = "rules"`

```json
{
  "pr": {
    "labels": {
      "mode": "rules",
      "rules": [
        { "label": "bug",           "when": { "branchPrefix": ["fix/", "bugfix/"] } },
        { "label": "feature",       "when": { "commitType":   ["feat"] } },
        { "label": "documentation", "when": { "pathGlob":     ["**/*.md"] } },
        { "label": "small-change",  "when": { "diffSizeUnder": 50 } }
      ]
    }
  }
}
```

Each rule names exactly one target label and one signal in `when`:

| Signal | Match condition |
|---|---|
| `branchPrefix: string[]` | Current branch starts with any listed prefix |
| `commitType: string[]` | Any commit subject begins with `<type>:` or `<type>(scope):` |
| `pathGlob: string[]` | **Every** changed file matches at least one glob (all-changed-files semantics) |
| `jiraType: string[]` | Detected JIRA ticket type is in the list |
| `diffSizeUnder: integer` | Total lines changed is strictly less than the threshold |

Multiple rules may target the same label — they OR together. Rules whose `label` is not in `repoLabels` are stripped at validation time with a warning (no fabrication).

### Example: `mode = "llm"` (opt-in only)

```json
{
  "pr": {
    "labels": { "mode": "llm" }
  }
}
```

The legacy fuzzy heuristic runs: branch prefixes, commit types, file paths, and diff size are fuzzy-matched against `repoLabels`. Used only when explicitly chosen during setup.

### Forced labels

The `--label` flag bypasses `pr.labels.mode` entirely. Forced labels apply in all three modes (including `off`). If a forced label doesn't exist in the repository, it is created automatically before the PR is opened. `/ship-sdlc` uses this to auto-apply `skip-version-check` on worktree PRs.

### Update mode

Existing labels on the PR are preserved. Only new labels are added — the skill never removes labels.

### When labeling is skipped

If the repository has no labels defined or `gh` is unavailable, the inferred labeling step is skipped. Forced labels (via `--label`) still work — they are created in the repo if needed.

---

## GitHub Multi-Account Support

When multiple `gh` CLI accounts are authenticated, the skill automatically detects the correct account for the current repository and switches to it before creating or updating the PR.

Detection is two-phase:

1. **Owner match** (fast): If an account login matches the repository owner name, the skill switches to that account.
2. **API access test** (fallback): If no login matches the owner (e.g., org repos), each authenticated account is tested for API access to the repository. The first account with access is selected.

If a switch occurs, the skill notifies you: `GitHub account switched: now using "work-account" (was "personal-account")`. The switch persists for subsequent `gh` commands. If no matching account is found, the skill continues with the currently active account and displays a warning.

To override manually: `gh auth switch --user <login>` before running the skill.

### Account auto-recovery (post-failure retry)

If `gh pr create` still fails with a `does not have the correct permissions to execute CreatePullRequest` error after pre-flight detection (for example, the wrong account was active for a personal repo), the skill auto-recovers once. It parses the repo owner from `git remote`, looks for a local `gh` account whose login matches, switches to it, and retries `gh pr create` exactly once.

You see a single concise recovery line:

```
Switched gh account to <login> due to repo-permission mismatch — retrying
Pull request created: <url>
```

If no local account matches the owner, the skill surfaces the original error plus an actionable hint:

```
gh: ... does not have the correct permissions to execute `CreatePullRequest` ...
Run `gh auth login --hostname github.com` to authenticate the account that owns this repo.
```

This recovery is one-shot per pipeline invocation — a second consecutive permission failure is terminal. Tracked in spec requirement E7 ([issue #184](https://github.com/rnagrodzki/sdlc-marketplace/issues/184)).

---

## Prerequisites

- **`gh` CLI** — required to open or update the PR (`gh auth login`). Falls back to printing the description for manual use if unavailable. Multiple authenticated accounts are handled automatically.
- **Active branch with commits** — the skill diffs against the target base branch.

### Harness Configuration

| Field | Value |
|---|---|
| `argument-hint` | `[--draft] [--update] [--base <branch>] [--auto] [--label <name>]` |
| Plan mode | Graceful refusal (Step 0) |

---

## Configuration

PR title validation is configured in `.sdlc/config.json` under the `pr` key. All fields are optional; if absent, the skill uses auto-generated titles and does not enforce pattern validation.

### Full Configuration Example

```json
{
  "pr": {
    "titlePattern": "^(feat|fix|breaking|docs|refactor)(?:\\([a-z0-9-]+\\))?: .+$",
    "titlePatternError": "PR title must match: type[(scope)]: description (e.g., feat: add auth)",
    "allowedTypes": ["feat", "fix", "breaking", "docs", "refactor", "chore"],
    "allowedScopes": ["auth", "api", "ui", "db"]
  }
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `titlePattern` | string (regex) | Regex pattern the PR title must match. Enforced as a quality gate before PR creation. |
| `titlePatternError` | string | Human-readable error message displayed when `titlePattern` validation fails. |
| `allowedTypes` | array of strings | Allowed PR title type prefixes (e.g., `feat`, `fix`, `breaking`). Absence allows any type. Used for title generation hints only; validation uses `titlePattern`. |
| `allowedScopes` | array of strings | Allowed PR title scopes (the parenthetical in `feat(scope)`). Absence allows any scope. Used for title generation hints only; validation uses `titlePattern`. |
| `defaultBranch` | string | Target branch PRs are merged into (issue #339). When set, `/pr-sdlc` uses this value without runtime git detection. Override for repos using `develop`, `release/*`, etc. Configured by `/setup-sdlc` pr section (auto-detected default). |
| `expectedAccount` | string | Expected GitHub login that should be active when `/pr-sdlc` runs (issue #234). When set, the prepare script halts hard if the active `gh` account differs, preventing wrong-account PRs in multi-account setups. When **unset**, the script probes repo access instead — see Preflight below (fixes #380). |

### Base Branch Resolution (issue #339)

`skill/pr.js` resolves the target base branch via a three-step cascade:

1. **`--base <branch>` CLI flag** — explicit override, highest priority. Verified against `origin/<branch>`; errors if not found on the remote.
2. **`config.pr.defaultBranch`** — value from `.sdlc/config.json` under `pr.defaultBranch`. Verified against `origin/<value>`; surfaces a precise error naming the config path if the branch does not exist on the remote.
3. **Git auto-detection** — falls back to `git symbolic-ref refs/remotes/origin/HEAD` → `main` → `master` (the existing `detectBaseBranch` behavior).

Configure `pr.defaultBranch` via `/setup-sdlc` (pr section) for repos where the default branch is `develop`, `release/*`, or any non-standard name — this prevents the git auto-detect from resolving to the wrong base on every PR.

### Preflight (issue #234, fixes #380)

Before any GitHub API call, `skill/pr.js` runs a gh-auth + active-account preflight:

1. Verifies `gh auth status --hostname github.com` succeeds — halts on no-auth or expired token.
2. Resolves the account gate via **two modes**:
   - **Identity mode** (`pr.expectedAccount` is set): compare the configured value against `gh api user --jq .login`. Mismatch halts with the canonical 3-line message (see below). This is the opt-in gate for teams that want strict login enforcement.
   - **Access mode** (`pr.expectedAccount` is unset): call `lib/git.js::probeRepoAccess({ owner, repo, host })` against the origin remote. A `200` response clears the gate. A `404` or `403` response halts with `formatAccessDenied` — naming the active account and listing local `gh` accounts to switch to. A network failure warns and proceeds (non-blocking). When the origin remote is absent, skip the probe and proceed with a warning.

**Identity-mode halt message** (canonical 3-line block):

```text
Expected gh account: <expected>
Active gh account:   <actual>
Run: gh auth switch --user <expected>
```

**Access-mode halt message** (`formatAccessDenied`, emitted when probe returns 404/403):

```text
Active gh account: <active>
Cannot access: <owner>/<repo>
Try: gh auth switch --user <candidate>   (one line per local account)
```

The shared probe `lib/git.js::probeGhAuth` is also consumed by `ship-sdlc`'s pipeline preflight — both gates produce byte-identical halt messages via the same `lib/git.js` helpers. The access probe (`probeRepoAccess`) is also shared with `ship.js` for identical behavior.

The post-creation reactive recovery (issue #184, `gh pr create` permission failure → automatic switch + retry) remains as a fallback for cases the preflight cannot anticipate.

#### Migration Note

If you ran `/setup-sdlc` before this fix and accepted the default that stored the origin remote owner in `pr.expectedAccount`, clear that value from `.sdlc/config.json` unless you actually want strict identity enforcement. With it set to an org name (e.g. `"Cleeng"`), the identity check can never pass — no personal login equals an org slug. Remove or leave the field unset to let the access probe handle authorization automatically.

### Note on Type/Scope Flags

Unlike `/commit-sdlc`, `/pr-sdlc` does not accept `--type` or `--scope` flags; PR titles are generated contextually from commit analysis and branch information. The configuration fields `allowedTypes` and `allowedScopes` are advisory only — they guide title generation but do not restrict what titles are accepted, only the `titlePattern` does that.

### Pattern Examples

#### 1. Conventional PR Titles

Type and scope optional; matches squash-merge commit format.

```json
{
  "titlePattern": "^(feat|fix|refactor|docs|chore)(?:\\([a-z0-9-]+\\))?: .+$",
  "titlePatternError": "Title must match: type[(scope)]: description",
  "allowedTypes": ["feat", "fix", "refactor", "docs", "chore"],
  "allowedScopes": ["auth", "api", "ui", "db"]
}
```

Matching titles:
```
feat(auth): add OAuth2 PKCE flow
fix: correct login retry logic
docs: update API documentation
```

#### 2. Ticket Prefix Only

Ticket ID required, no type system.

```json
{
  "titlePattern": "^[A-Z]+-\\d+: .+$",
  "titlePatternError": "Title must match: PROJ-123: description"
}
```

Matching title:
```
PROJ-456: Implement webhook retry with idempotency
```

#### 3. Ticket Prefix + Conventional

Ticket ID and conventional type.

```json
{
  "titlePattern": "^[A-Z]+-\\d+ (feat|fix|refactor|docs): .+$",
  "titlePatternError": "Title must match: PROJ-123 type: description",
  "allowedTypes": ["feat", "fix", "refactor", "docs"]
}
```

Matching title:
```
PROJ-456 feat: add webhook retry with idempotency
```

#### 4. Semantic PR Titles

Explicit keyword categories (no parenthetical scope).

```json
{
  "titlePattern": "^(feat|fix|breaking|refactor|docs): .+$",
  "titlePatternError": "Title must start with: feat: fix: breaking: refactor: or docs:",
  "allowedTypes": ["feat", "fix", "breaking", "refactor", "docs"]
}
```

Matching titles:
```
feat: add webhook retry with idempotency
breaking: remove deprecated auth endpoint
fix: correct login session expiration
```

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| GitHub PR | Opens a new PR or updates the description of an existing one |

## Link Verification (issue #198)

Before any `gh pr create` or `gh pr edit` call, the skill pipes the finalized PR body through the shared validator (`scripts/skill/pr.js --validate-body`, which delegates to `scripts/lib/links.js`). Validation runs deterministically — the skill never constructs the validator context.

URL classes checked:

| Class | Check | Failure code |
|-------|-------|--------------|
| GitHub `github.com/<owner>/<repo>/(issues\|pull)/<n>` | Owner/repo identity matches the current `git remote origin`; issue/PR number exists on that repo | `github-context-mismatch`, `github-not-found` |
| Atlassian `*.atlassian.net/browse/<KEY-N>` | Host matches the configured/cached Jira site | `atlassian-site-mismatch`, `atlassian-site-ambiguous` |
| Generic `http(s)://...` | HEAD reachable (falls back to GET on 405), 5s timeout | `url-not-found`, `url-server-error`, `url-unreachable` |

Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) are reported as `skipped`, not violations. Set `SDLC_LINKS_OFFLINE=1` to skip generic reachability checks while keeping context-aware checks (GitHub identity, Atlassian host) — useful in sandboxed CI runs. On non-zero exit, the PR is **not** created/edited; the violation list (URL, line, reason, observed/expected) is surfaced verbatim. No flag toggles this gate — it is hard.

## OpenSpec Integration

When the project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec/), this skill pre-fills PR sections from the active change's proposal.

- **Business Context / Benefits:** Pre-filled from `proposal.md` intent and scope, reducing clarification questions
- **Technical Design:** References `design.md` architectural approach when available
- **Header line:** Adds `**OpenSpec:** openspec/changes/<name>/` to the PR description

See [OpenSpec Integration Guide](../openspec-integration.md) for the full workflow.

---

## Related Skills

- [`/commit-sdlc`](commit-sdlc.md) — commit changes before creating a PR
- [`/review-sdlc`](review-sdlc.md) — review the branch before or after creating a PR
- [`/setup-sdlc --pr-template`](setup-sdlc.md) — create a custom PR description template
- [`/version-sdlc`](version-sdlc.md) — tag a release after the PR is merged
