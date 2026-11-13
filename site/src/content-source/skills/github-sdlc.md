# `/github-sdlc` — GitHub Issue Management

## Overview

Creates, edits, views, searches, closes, reopens, comments on, links and assigns GitHub issues through the `gh` CLI. Repository metadata (labels, milestones, assignable users, issue templates, issue types, Projects v2 boards) is cached on first use, so most operations need one `gh` call instead of several discovery calls. Every write is shown to you; unless you pass `--auto`, it needs your approval before it runs. Under `--auto`, only the low-risk writes listed under `--auto` run without asking. The script itself refuses a write that does not carry the fingerprint of the payload you approved, so a write cannot run without that approval step, even when the script is called directly.

Specification: docs/specs/github-sdlc.md

---

## Usage

```text
/github-sdlc [--repo <[HOST/]OWNER/REPO>] [--force-refresh] [--init-templates] [--skip-projects] [--auto] [--templates-dir <path>] [--clear]
```

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <[HOST/]OWNER/REPO>` | Repository to work on (for example `acme/widgets`, or `ghe.example.com/acme/widgets` for GitHub Enterprise). When unset, the skill uses `github.defaultRepo`, then the `origin` remote, then asks you to pick from `github.repos`. | Auto |
| `--force-refresh` | Rebuild the repository cache from scratch. Use it when labels, milestones, templates or boards have changed. | — |
| `--init-templates` | Copy the shipped issue templates into the repository's issue template directory for customization. | — |
| `--skip-projects` | Do not read Projects v2 boards when building the cache. Project field operations are then unavailable. | false |
| `--auto` | Run low-risk writes without asking: comments, label-only edits, closing as completed or not planned, reopening, and setting the `Status` field of an issue already on a configured board. Everything else still asks. A comment that mentions someone, holds a `duplicate of` marker or references an issue in another repository still asks, as does a close as duplicate and every write of a run where the script switched the acting account. | false |
| `--clear` | Delete the cached metadata of the target repository and stop. Needs no `gh` and no login. | — |
| `--templates-dir <path>` | Directory that `--init-templates` copies the default templates from (the source, not the target; the target is always `.github/ISSUE_TEMPLATE/`). | the templates shipped with the plugin |

---

## Examples

### Create an issue

```text
/github-sdlc
Create a bug: the export button does nothing on Firefox. Label it bug.
```

Resolves the repository's bug template, fills it from your description, shows the full issue for approval, then creates it.

### Comment on an issue

```text
/github-sdlc
Comment on #42 with the root cause analysis
```

Posts the comment after you approve it.

### Search issues

```text
/github-sdlc
Find open issues labelled bug assigned to me
```

Returns a table of matching issues. Reads never ask for approval.

### Close with a reason

```text
/github-sdlc --auto
Close #42 as not planned
```

Closing as `completed` or `not planned` runs without a question under `--auto`.

### Link issues

```text
/github-sdlc
Make #51 a sub-issue of #42
```

Links always ask for approval, also under `--auto`.

### Refresh the cache

```text
/github-sdlc --repo acme/widgets --force-refresh
```

Rebuilds the cache for `acme/widgets` and reports what it found.

### Customize issue templates

```text
/github-sdlc --init-templates
```

Copies the shipped `bug.md` and `feature.md` templates into `.github/ISSUE_TEMPLATE/`. Edit them to match your team's conventions.

---

## Prerequisites

- **`gh` CLI**, installed and authenticated (`gh auth login`).
- **Token scopes for Projects v2** (only when you use project boards): `read:project` to read board data, `project` to change it. If `project` is missing, the skill stops with the hint `gh auth refresh -s project`. Fine-grained tokens and `GH_TOKEN` / `GITHUB_TOKEN` cannot report scopes; the call runs and a failure is reported.
- **Repository access** — the authenticated account needs read access for reads and triage or write access for writes.
- **Optional `github` keys in `.sdlc/config.json`:**

| Key | Meaning |
|-----|---------|
| `github.defaultRepo` | Repository used when `--repo` is not given |
| `github.repos` | Allowed repositories; two or more entries make the skill ask you to choose when nothing else resolves |
| `github.projects` | Projects v2 boards to cache, as `{ "owner": "...", "number": N }` entries |
| `github.cacheMaxAgeHours` | Refresh the cache when older than this many hours (default `0`: permanent until `--force-refresh`) |

Unknown keys under `github` are rejected.

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| `~/.sdlc-cache/github/<host>/<owner>/<repo>.json` | Repository metadata cache, stored outside the working tree |
| `.github/ISSUE_TEMPLATE/*.md` | Issue templates (created only with `--init-templates`) |
| GitHub issues | Created or updated through `gh` after your approval |

---

## Related Skills

- [`/pr-sdlc`](pr-sdlc.md) — create pull requests (this skill handles issues)
- [`/jira-sdlc`](jira-sdlc.md) — the equivalent skill for Jira issues
- [`/plan-sdlc`](plan-sdlc.md) — write an implementation plan from an issue
- [`/error-report-sdlc`](error-report-sdlc.md) — file plugin defects as GitHub issues
