# `/jira-sdlc` — Jira Issue Management

## Overview

Manages Jira issues via the Atlassian MCP with a project metadata cache that eliminates repeated discovery calls. Caches custom fields, workflow graphs, transition requirements, and user mappings on first use — keeping most operations to a single MCP call. Supports per-issue-type description templates (customizable per project) for consistent, well-structured issue content.

---

## Usage

```text
/jira-sdlc [--project <KEY>] [--force-refresh] [--init-templates] [--site <host>] [--skip-workflow-discovery]
```

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--project <KEY>` | Jira project key to use (e.g., `PROJ`). Auto-detected from git branch or `.sdlc/config.json` → `jira.defaultProject`. When `jira.projects` is set (≥2 entries), values outside the list are rejected. | Auto |
| `--force-refresh` | Rebuild the project cache from scratch (cache is permanent by default; use when project metadata has changed) | — |
| `--init-templates` | Copy the skill's default issue type templates to `.sdlc/jira-templates/` for customization | — |
| `--site <host>` | Sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`). Disambiguates `--check`/`--load` when the same project key is cached under multiple site subdirectories. | Unset |
| `--skip-workflow-discovery` | Bypass Phase 5; cache marks each non-subtask issue type `{ unsampled: true }`. Transitions fall back to a live `getTransitionsForJiraIssue` per issue. Use in CI and other pre-seeded environments. | false |

---

## Examples

### Create a bug

```text
/jira-sdlc
Create a bug for the login page redirect issue on Firefox with SSO users. High priority, assign to Jane.
```

Creates PROJ-147 with a structured description using the Bug template.

### Transition an issue

```text
/jira-sdlc
Move PROJ-147 to Done
```

Transitions the issue using the cached transition ID, automatically including required fields (e.g., resolution).

### Search for open issues

```text
/jira-sdlc
Find all open high-priority bugs assigned to me in project PROJ
```

Returns a table of matching issues.

### Add a comment

```text
/jira-sdlc
Add a comment to PROJ-147 with the root cause analysis
```

Converts the markdown to Atlassian Document Format (ADF) via `markdown-to-adf.js` and posts the comment. When the tool input declares `contentFormat='adf'`, placeholder detection (C13) walks the parsed ADF tree and applies the regex only to `text` node values — bracket characters in JSON-serialized ADF (e.g., `[null,...]` from a stringified array) never trip the bracket-form regex.

### Edit issue fields

```text
/jira-sdlc
Set PROJ-147 story points to 5 and add the label "backend"
```

Updates both fields in a single `editJiraIssue` call.

### Initialize cache for a project

```text
/jira-sdlc --project PROJ --force-refresh
```

Runs the 5-phase initialization, reports N issue types and M workflow states mapped.

### Customize issue templates

```text
/jira-sdlc --project PROJ --init-templates
```

Copies default templates for each issue type to `.sdlc/jira-templates/`. Edit them to match your team's conventions.

### Create with a specific project

```text
/jira-sdlc --project BACKEND
Create a story for the token refresh feature
```

Creates the story in the BACKEND project using the Story template.

---

## Custom Issue Templates

Default templates ship in `plugins/sdlc-utilities/skills/jira-sdlc/templates/` — one file per issue type:

- `Bug.md`
- `Story.md`
- `Task.md`
- `Epic.md`
- `Sub-task.md`
- `Spike.md`
- `Test Case.md`
- `Test Plan.md`

Project-level overrides live at `.sdlc/jira-templates/<IssueTypeName>.md`. File names must match Jira issue type names exactly (case-sensitive).

### Migration from `.claude/jira-templates/`

If you previously had custom templates at the legacy location `.claude/jira-templates/`, they are moved automatically to `.sdlc/jira-templates/` on the first jira-sdlc invocation that needs the templates directory. The migration is a one-time atomic rename — no data is lost. You can also trigger it explicitly with `/setup-sdlc --migrate`. If both directories exist (e.g., you already had content in `.sdlc/jira-templates/`), the legacy directory is left in place with a warning and you can clean it up manually. (Fixes #423.)

Resolution order:

1. **Project custom** — `.sdlc/jira-templates/<IssueTypeName>.md`
2. **Skill default** — `plugins/sdlc-utilities/skills/jira-sdlc/templates/<IssueTypeName>.md`
3. **Subtask fallback** — when none of the above exist, the prepare script consults a fallback map for subtask variants (see below).
4. **No template** — when no fallback applies, the skill emits a warning and aborts the operation.

Run `/jira-sdlc --init-templates` to export the skill defaults to `.sdlc/jira-templates/` as a starting point, then edit them to match your team's conventions.

#### Subtask fallback (spec R18)

When an issue type lacks both a custom and a shipped template, the prepare script consults a closed fallback map before resolving to `none`:

| Issue type | Falls back to |
|---|---|
| `Sub-bug` | `Bug` |
| `Sub-task` | `Task` |
| `Subtask` | `Task` |

When a fallback is applied the skill prints a one-line notice:
`Using <Parent> template for <Type> — override at .sdlc/jira-templates/<Type>.md`.
Override the fallback by creating a custom template at the path shown.

When no fallback applies (e.g., a fictional `Whim` type with no shipped template) the skill prints a warning and stops:
`No template for <Type>. Run /jira-sdlc --init-templates or create .sdlc/jira-templates/<Type>.md`.

> **Tip:** On non-English Jira instances, `--init-templates` detects unmapped issue types and interactively asks which default template to use for each.

### Non-English Jira Locales

When Jira uses a non-English language, issue type names are localized (e.g., "Zadanie" for Task in Polish). Running `--init-templates` detects unmapped types and interactively asks which default template to use for each, with suggestions based on the Jira hierarchy level (Epic for top-level types, Task for standard types).

After interactive setup, template files are created with your locale's names (e.g., `.sdlc/jira-templates/Zadanie.md`) containing the selected template content as a starting point. Edit them to match your team's conventions.

**Example custom Bug template** (`.sdlc/jira-templates/Bug.md`):

```markdown
## Summary
[One sentence: what is broken and where]

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- Browser / OS:
- Version / build:

## Root Cause (if known)
[Leave blank if unknown]
```

---

## How the Cache Works

The cache is stored at `~/.sdlc-cache/jira/<sanitizedSiteHost>/<PROJECT_KEY>.json` and is permanent by default — it does not expire on a timer. `sanitizedSiteHost` is the site URL host lowercased with `.` replaced by `_` (e.g., `acme.atlassian.net` → `acme_atlassian_net`). The cache lives outside the working tree so it is never committed, survives repo clones, and supports repos that map to multiple Jira tenants (one subdirectory per site). Refreshed when `--force-refresh` is passed or when an operation fails due to stale cached data (e.g., invalid transition IDs or changed field schemas), triggering an automatic rebuild and retry.

The cache contains:

- `cloudId` — Atlassian cloud instance identifier
- `siteUrl` — canonical form is the full origin URL (e.g., `https://acme.atlassian.net`); the prepare script also accepts a bare host (e.g., `acme.atlassian.net`) and will strip any trailing path. The `sanitizedSiteHost` subdirectory is always derived from the host portion only.
- Issue types and their field schemas (including custom fields)
- Workflow graphs with transition IDs and per-transition required fields (or `{ unsampled: true }` when Phase 5 was skipped)
- Available issue link types
- User account ID mappings (display name → accountId)

After initialization, most operations require a single MCP call instead of 4–8 discovery calls, significantly reducing latency and token usage.

### Cache refresh on cloudId auth errors

When an Atlassian MCP call returns a cloudId authorization error (response text matches `isn't explicitly granted` or HTTP 401/403 with the cloudId in the message), the skill follows this ladder once (spec R23):

1. Call `getAccessibleAtlassianResources` exactly once.
2. Compare the returned cloudId(s) against the cached value at `~/.sdlc-cache/jira/<site>/<KEY>.json`.
3. If different, run `/jira-sdlc --force-refresh` and reload the cache.
4. Retry the original MCP call exactly once. If it still fails with the same error, the skill surfaces the error and stops — it does not loop.

### Legacy Cache Migration

Earlier versions of this skill stored the cache in-repo at `.sdlc/jira-cache/<KEY>.json` (and before that, `.claude/jira-cache/<KEY>.json`). On the next `--check`, the prepare script detects either legacy location, copies the file to the home layout using the `siteUrl` embedded in the JSON, and emits a warning. The legacy file is left in place for the user to clean up once confident. Migration is idempotent: subsequent runs find the home cache first and skip the legacy probe entirely.

### Multiple Projects

Repos that map to multiple Jira projects can enumerate the allowed keys in `.sdlc/config.json`:

```json
{
  "jira": {
    "defaultProject": "FOO",
    "projects": ["FOO", "BAR", "BAZ"]
  }
}
```

When `jira.projects` is set with two or more entries:

- `--project <KEY>` arguments are validated against the list. Values outside the list are rejected (prepare script exits 1).
- When branch parsing, `defaultProject`, and `--project` all fail to resolve a key, the skill presents a closed-list AskUserQuestion restricted to the configured projects — no free-form input.
- Single-project repos (no `jira.projects`, or only one entry) retain the prior four-step fallback with a free-form prompt as the final step.

### CI Usage

Phase 5 workflow discovery fires an MCP call per non-subtask issue type (and several per type for transition sampling). In pre-seeded CI environments where the cache is bootstrapped ahead of time, or on cold runs where end-to-end latency matters more than transition coverage, pass `--skip-workflow-discovery`:

```bash
/jira-sdlc --project PROJ --force-refresh --skip-workflow-discovery
```

The resulting cache stores `workflows: { "<Type>": { "unsampled": true } }` for every non-subtask issue type. At runtime, any transition operation that encounters an `unsampled` marker routes through a live `getTransitionsForJiraIssue` per issue — the same auto-refresh path used when a cached transition ID stales out. Other cache sections (issue types, field schemas, link types, user mappings) are still populated normally.

---

## Prerequisites

- **Atlassian MCP** — must be configured and connected (`mcp__atlassian__*` tools available in your Claude Code session)
- **Jira project access** — the authenticated user must have read/write permission on the target project
- No additional CLI tools required

### Multiple Atlassian MCP namespaces

When both `mcp__atlassian__` and `mcp__claude_ai_Atlassian__` are registered in the deferred-tools list, the skill auto-falls-back from the primary `mcp__atlassian__` namespace to `mcp__claude_ai_Atlassian__` once when the primary returns a cloudId authorization error. The working namespace is persisted for the rest of the session — no per-call probing (spec R23).

### Harness Configuration

| Field | Value |
|---|---|
| `argument-hint` | `[--project <KEY>] [--force-refresh] [--init-templates] [--site <host>] [--skip-workflow-discovery]` |
| Plan mode | Not adapted (writes to Jira) |

---

## Write Operation Safeguards

Every write operation (`create`, `edit`, `transition`, `comment`, `link`, `assign`, `worklog`, `bulk`) passes through a two-step gate before any MCP call is dispatched. Read operations (`search`, `view`) skip this gate entirely.

### Critique pass (R20)

Before presenting a proposal, the skill runs an internal critique against the assembled payload:

- **Template completeness** — every `## ` heading in `description` must come from the resolved template; no invented sections.
- **Placeholder resolution** — `[bracketed prose]` and `{name}` markers flagged as `low`-confidence must be resolved via `AskUserQuestion` before the payload is shown (R19). High-confidence auto-fills are surfaced as findings but do not block.
- **Field validity** — required fields for the selected transition are present; field values are within cache-validated enumerations.

The findings are surfaced as a three-line block before the approval prompt:

```
Initial: <one-line summary of the initial draft>
Critique: <findings, or "none">
Final: <one-line summary of the revised payload>
```

The critique artifact is written to `$TMPDIR/jira-sdlc/critique-<hash>.json`.

### Approval gate (R17)

After the critique block, the full final payload (the exact bytes the MCP call will dispatch) is printed. The user must respond with one of:

- **approve** — proceed to dispatch
- **change `<what>`** — describe the desired change; the skill loops back through the critique pass with a revised draft and new artifacts
- **cancel** — abort without dispatching

On `approve`, the skill proceeds to dispatch the write MCP call. Approval is the explicit `AskUserQuestion` gate — there is no token-file handshake.

### Validation (R21 — LLM-prose only)

The former `pre-tool-jira-write-guard.js` PreToolUse hook has been removed (along with all PreToolUse guards). Jira-write validation is now **LLM-prose-only** as a second line of defense, performed by the skill at author time:

- Zero unfilled template placeholders remain in payload string fields and ADF text nodes (C13 check).
- For `createJiraIssue` / `editJiraIssue` with a description, payload `## ` headings stay a subset of the resolved template's heading set.
- Explicit `AskUserQuestion` approval is obtained before dispatching any write MCP call.

There is no payload-hash / critique-token / approval-token artifact handshake and no deterministic dispatch block — the skill's Plan→Critique→Improve→Present→Approve flow is the enforcement.

### Terse ticket content (R25)

Every `createJiraIssue` and `editJiraIssue` that touches `description` is required to produce scannable, structured content — no prose paragraphs:

- **Descriptions are bullet-formatted.** Every `## ` section body uses bullet lists (`- `), numbered lists (`1. `), or sub-headings. No paragraph text of two or more consecutive non-list non-heading lines is allowed in any section.
- **Acceptance criteria are `- [ ]` checklists.** Every line under `## Acceptance Criteria` must be a GitHub-flavored checklist item (`- [ ] <criterion>`). Prose introductions, sentence-form criteria, and prose summaries after the list are all blocked.
- **Summary is imperative and filler-free.** The `summary` field must be an imperative phrase ≤ 100 characters. Filler tokens (`This task covers`, `The goal of`, `We need to make sure`) are not allowed.
- **No filler transitions.** Sentences such as `This ticket covers…`, `In summary…`, or `The purpose of this issue is…` between sections are omitted.
- **Release Notes exception (R25.5).** The `## Release Notes` section (Bug, Story templates) may be a single sentence — release notes are changelog-bound and bullet form is awkward in that context. Two or more sentences in this section fail the constraint.

**Enforcement (LLM-prose only):**
- The Step 2.5 critique pass checks descriptions for prose paragraphs, filler tokens, and non-checklist acceptance criteria — findings appear in the `Critique:` block before the approval prompt. This is the sole enforcement: the former deterministic `pre-tool-jira-write-guard.js` checklist gate has been removed.

### Diagnostics

When `SDLC_DEBUG_DUMP=1` is set, the hook writes the received `tool_input` and the canonical-JSON byte-string to `$TMPDIR/jira-sdlc-debug/<hook-hash-prefix>.json`. Use this to diff against the skill artifact (`$TMPDIR/jira-sdlc/critique-<hash>.json`) byte-for-byte when a hash mismatch denial occurs. The dump is diagnostic only — it does not change the deny decision.

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| `~/.sdlc-cache/jira/<site>/<KEY>.json` | Project metadata cache (home-keyed, outside the working tree): cloudId, issue types, field schemas, workflows, user mappings |
| `.sdlc/jira-templates/<Type>.md` | Project-level issue description templates (created only when `--init-templates` is run, or manually) |
| `$TMPDIR/jira-sdlc/critique-<hash>.json` | Per-operation critique artifact (write-ops only); contains initial/findings/final summary; verified by the PreToolUse hook |
| `$TMPDIR/jira-sdlc/approval-<hash>.token` | Per-operation approval token (write-ops only); created on `approve`; verified and deleted by the PreToolUse hook after dispatch |
| Jira issues | Created or updated via the Atlassian MCP |

## Link Verification (issue #198)

Before any `createJiraIssue`, `editJiraIssue`, or `addCommentToJiraIssue` MCP call, the skill pipes the description / comment body through `scripts/skill/jira.js --validate-body` (which delegates to `scripts/lib/links.js`). The Jira site (`jiraSite`) is resolved deterministically from the cached `~/.sdlc-cache/jira/<site>/<KEY>.json` — the skill never constructs the validator context.

URL classes checked:

| Class | Check | Failure code |
|-------|-------|--------------|
| GitHub `github.com/<owner>/<repo>/(issues\|pull)/<n>` | Owner/repo identity matches the current `git remote origin`; issue/PR number exists on that repo | `github-context-mismatch`, `github-not-found` |
| Atlassian `*.atlassian.net/browse/<KEY-N>` | Host matches the cached `siteUrl` for the active project | `atlassian-site-mismatch`, `atlassian-site-ambiguous` |
| Generic `http(s)://...` | HEAD reachable (falls back to GET on 405), 5s timeout | `url-not-found`, `url-server-error`, `url-unreachable` |

Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) are reported as `skipped`, not violations. Set `SDLC_LINKS_OFFLINE=1` to skip generic reachability checks while keeping context-aware checks (GitHub identity, Atlassian host). On non-zero exit, the MCP write call is **not** dispatched and the payload is never sent to Jira. No flag toggles this gate — it is hard.

## MCP Failure Self-Tracking

When an Atlassian MCP call fails and all recovery paths are exhausted, jira-sdlc classifies the failure, records structured telemetry, and optionally dispatches a GitHub issue via `error-report-sdlc`.

### Failure classes (R26)

Every observed MCP failure is assigned exactly one class:

| Class | Trigger |
|-------|---------|
| `transport` | HTTP 5xx, `ECONNREFUSED`, `ETIMEDOUT`, `fetch failed` |
| `auth` | HTTP 401/403 or response contains `cloudId`/`unauthorized` |
| `schema` | HTTP 400 with field/shape error, or hook deny citing R19/C13/R18/R25/G15 |
| `workflow` | HTTP 400 with `transition`/`workflow`/`invalid status` in error message |
| `hook-block` | PreToolUse hook deny citing R20/R21 |
| `link-verification` | R22 link verification abort |
| `unknown` | No deterministic signal matches |

Classification is deterministic — no LLM, no network call.

### Telemetry (R27)

On every classified failure, a 5-line structured block is appended to `.sdlc/learnings/log.md`:

```
## YYYY-MM-DD — jira-sdlc mcp-failure[<class>]: <tool>
tool: <tool name>
site: <Jira site host>
project: <project key>
error: <one-line error, redacted>
recovered: yes:<R-path> | no
```

Sensitive values (bearer tokens, cookies, cloudIds, email addresses) are redacted before writing.

### Analyze-then-confirm dispatch gate (R28)

On exhausted-recovery paths (R23 dual-namespace exhausted, R9 retry-exhausted, R14 unsampled-fallback failure, R21 hook-block twice in one session, R22 link-verification abort), the skill:

1. Searches for duplicate open issues (`gh issue list --state open --label mcp-failure`).
2. Synthesizes a proposal (title + body) using the `McpFailure.md` template.
3. Presents the proposal verbatim — you must explicitly approve (`Y`), edit, or skip.
4. On approval, dispatches `error-report-sdlc` with labels `mcp-failure` and `class:<x>`.
5. When a duplicate is found, proposes commenting on the existing issue rather than creating a new one.

To act on a filed `mcp-failure` issue with hardening proposals, use:

```text
/harden-sdlc --from-issue <issue-number> --skill jira-sdlc
```

See [`/harden-sdlc`](harden-sdlc.md) for the `--from-issue` flag documentation.

---

## Related Skills

- [`/plan-sdlc`](plan-sdlc.md) — write an implementation plan from a Jira ticket
- [`/execute-plan-sdlc`](execute-plan-sdlc.md) — execute an existing plan
- [`/harden-sdlc`](harden-sdlc.md) — consume `mcp-failure`-labeled issues as hardening input via `--from-issue`
- [`/error-report-sdlc`](error-report-sdlc.md) — receives MCP failure dispatches after R28 user approval
