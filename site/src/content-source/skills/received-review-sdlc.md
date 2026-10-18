# `/received-review-sdlc` — Respond to Code Review Feedback

## Overview

Guides Claude through responding to code review feedback with technical rigor. Analyzes each item against the full codebase context — not just the change diff — using internal self-critique gates to prevent performative agreement and blind implementation. Presents a complete action plan with drafted responses for user approval before making any changes. Can be invoked manually or launched automatically from `/review-sdlc` when actionable findings exist.

---

## Usage

```text
/received-review-sdlc
```

Provide review feedback in one of three ways:
- Paste the review comments into the conversation
- Provide a PR number — Claude will fetch comments via `gh`
- Launch from `/review-sdlc` — findings are passed automatically via context

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--pr <number>` | PR number to fetch review threads from. Enables thread-aware mode: pre-computes thread resolution state, filters to outstanding comments only on re-run. | Auto-detected from current branch |
| `--auto` | Skip consent gates at Step 10 and Step 12. Auto-implement all "will fix" items (subject to `alwaysFixSeverities`, see Configuration below) and auto-post in-thread replies (resolving only "agree, will fix" threads matching the severity allowlist). Critique gates still run. "Disagree" and "won't fix" items are displayed but not auto-implemented; their threads are replied to but left open. | Off |
| `--always-harden-from-review` | Mirror of `.sdlc/local.json` `receivedReview.alwaysHardenFromReview`. When `true`, skip the Step 11.6 consent gate and auto-dispatch `harden-sdlc` per cluster (subject to `flags.auto` matrix R25). | Off (`false`) |

---

## Configuration

### `receivedReview.alwaysFixSeverities` (issue #233)

Per-user, per-project allowlist of finding severities whose **"agree, will fix"** verdicts bypass
the per-finding consent gate at Step 10 (PRESENT) and Step 12 (REPLY & RESOLVE) — see spec
requirements R18 and R19.

| Aspect | Value |
|---|---|
| Location | `.sdlc/local.json` under `receivedReview.alwaysFixSeverities` (gitignored, per-user) |
| Type | `string[]` |
| Allowed values | `low`, `medium`, `high`, `critical` |
| Default | `[]` (preserves consent-on-every-finding behavior) |
| Scope | Applies to in-band review findings AND ultrareview-driven findings uniformly |

**Local-only contract (R19):** This field MUST NEVER be set in `.sdlc/config.json`. The prepare
script emits a stderr warning and ignores the value if encountered there.

**Bypass rule (R18):** A finding is auto-applied (no consent prompt; one-line `fixed: ...` log)
when ALL of the following hold:

1. Verdict is `agree, will fix`
2. Severity was successfully parsed from the comment body (`severity !== null`)
3. Parsed severity ∈ `alwaysFixSeverities`

**`--auto` interaction:** Under `--auto`, only "will fix" findings satisfying the bypass rule
are implemented in Step 11; remaining "will fix" findings are collected into a follow-up
summary appended to the response output. In Step 12, only resolved threads are those matching
R18 — others are replied to but left open.

**Example (`.sdlc/local.json`):**

```json
{
  "receivedReview": {
    "alwaysFixSeverities": ["critical", "high"]
  }
}
```

**Correlation with `ship.reviewThreshold`:** `alwaysFixSeverities` only takes effect when `received-review-sdlc` is actually invoked. In the ship pipeline, the dispatch gate is `ship.reviewThreshold` — if a finding's severity is below that threshold, `received-review-sdlc` never runs and `alwaysFixSeverities` is never evaluated. Keep `reviewThreshold` ≤ the lowest severity in `alwaysFixSeverities`. Example: `alwaysFixSeverities: ["critical","high","medium","low"]` requires `reviewThreshold: "low"`.

To configure interactively, run `/setup-sdlc --only received-review`.

### `receivedReview.alwaysHardenFromReview` (issue #429)

Per-user flag controlling whether Step 11.6 (META-ANALYZE) auto-dispatches `harden-sdlc` per
cluster without asking for consent — see spec requirements R24 and R25.

| Aspect | Value |
|---|---|
| Location | `.sdlc/local.json` under `receivedReview.alwaysHardenFromReview` (gitignored, per-user) |
| Type | `boolean` |
| Default | `false` (each cluster requires consent unless `--auto` is also set) |
| Scope | Applies uniformly to all Step 11.6 cluster dispatches |

**Local-only contract (R24):** This field MUST NEVER be set in `.sdlc/config.json`. The prepare
script emits a stderr warning and ignores the value if encountered there.

**Auto-mode matrix (R25 — authoritative):**

| `--auto` | `alwaysHardenFromReview` | Step 11.6 behavior |
|---|---|---|
| off | `false` | Present consent gate per cluster → dispatch approved clusters only. |
| off | `true`  | Skip consent gate → dispatch every cluster (up to `hardenClusterCap`). |
| on  | `false` | Skip consent gate AND skip dispatch entirely → write deferred-action entry to `.sdlc/learnings/log.md`. |
| on  | `true`  | Skip consent gate → dispatch every cluster (capped), propagating `--auto` to each dispatch. |

**Harden dispatch failure:** A non-zero exit from `harden-sdlc` is logged and ignored — it never
aborts Step 11.7 (LINK VERIFICATION) or Step 12 (REPLY & RESOLVE).

**Deferred-action log format (R26 — applies when `--auto` is on and `alwaysHardenFromReview=false`):**
```
## YYYY-MM-DD — received-review-sdlc: deferred meta-analysis clusters
PR: <pr.number>
Clusters (<count>):
- surface=<surface> targetFile=<targetFile> findings=<count> verdict-mix=<csv> failure-text-preview="<first 100 chars>"
```
A follow-up interactive run replays deferred clusters by reading these lines.

**Example (`.sdlc/local.json`):**

```json
{
  "receivedReview": {
    "alwaysHardenFromReview": true,
    "hardenClusterCap": 5
  }
}
```

**Cross-link:** Dispatched `harden-sdlc` runs surface their own learning-log entries per
[`/harden-sdlc`](harden-sdlc.md) R18.

### `receivedReview.hardenClusterCap` (issue #429)

Maximum number of harden-sdlc clusters dispatched per Step 11.6 run.

| Aspect | Value |
|---|---|
| Location | `.sdlc/local.json` under `receivedReview.hardenClusterCap` |
| Type | `integer` |
| Default | `5` |
| Range | `[1, 50]` — clamped silently |

Excess clusters beyond the cap are suppressed and logged as `suppressed: N additional clusters`
in the deferred-action entry or per-dispatch learning-log record.

---

## Examples

### Process review feedback from context

After `/review-sdlc` reports findings, confirm `fix` when prompted:

```text
Would you like to address these findings? (fix / no)
> fix
```

Claude launches `received-review-sdlc` with the findings already in context.

### Process feedback manually by pasting

```text
/received-review-sdlc

[paste review comments here]
```

Claude analyzes each item against the full codebase context, presents findings and a proposed action plan, then implements only after explicit user consent.

### Process feedback from a PR

```text
/received-review-sdlc

PR #142
```

Claude fetches review comments via `gh pr view 142 --comments`, analyzes them against the full codebase, and presents a proposed action plan.

### What the output looks like

After analysis, Claude presents findings and asks for approval:

```text
| # | File        | Line | Type      | Verdict         | Reasoning                            |
|---|-------------|------|-----------|-----------------|--------------------------------------|
| 1 | search.ts   | 45   | bug       | agree, will fix | `if (query)` passes for empty string |
| 2 | search.ts   | 12   | style     | agree, will fix | `res` → `searchResults` improves clarity |
| 3 | tokenizer.ts| 8    | incorrect | disagree        | Function is imported in 2 files      |

Will fix:
  #1 — Change null check to handle empty strings correctly
  #2 — Rename `res` to `searchResults`

Will push back:
  #3 — tokenize() is used in search.ts and indexer.ts

No changes have been made yet.

How to proceed? (implement / edit / skip)
  implement — post responses to PR and apply code changes
  edit      — modify the plan before proceeding
  skip      — discard, make no changes
```

### Auto-implement from ship pipeline

When invoked from `/ship-sdlc` with `--auto`, the consent gate is skipped and "will fix" items are implemented automatically:

```text
/received-review-sdlc --pr 42 --auto
```

Claude runs the full analysis pipeline (Steps 2–9), displays the action plan for visibility, then proceeds directly to implement "will fix" items. Items with "disagree" or "won't fix" verdicts are displayed but not auto-actioned. Critique gates still run. Step 12 also runs automatically: Claude posts in-thread replies and resolves "agree, will fix" threads without a second consent prompt.

### Re-run on a partially addressed PR

```text
/received-review-sdlc --pr 42
```

On re-run, the prepare script detects already-addressed threads:

```text
Found 3 outstanding comments (2 resolved, 1 already replied — skipped).
Processing only the 3 outstanding comments.
```

Only the outstanding comments proceed through the analysis pipeline.

### Reply to review threads after fixing

After implementing fixes, the skill presents a mandatory reply step:

```text
Review feedback processing complete:
- 2 comments addressed (code changes implemented)
- 1 comment pushed back (with technical reasoning)

Should I reply to all addressed review comments on the PR and resolve the threads?
  yes       — post replies and resolve threads
  skip      — do not post replies (user will handle manually)
  selective — let me choose which threads to reply to
```

Selecting "yes" posts in-thread replies and resolves addressed threads automatically.

---

## Prerequisites

- **`gh` CLI** — recommended for fetching review comments and posting in-thread replies. Falls back to manual copy-paste if unavailable.
- **Active PR with review feedback** — or review findings already in the conversation context from `/review-sdlc`.

### Harness Configuration

| Field | Value |
|---|---|
| Plan mode | Graceful refusal (Step 0) |

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| GitHub PR thread replies | In-thread responses posted to reviewer comment threads via `gh api` |
| Source code changes | Edits implementing accepted review feedback, in priority order |
| Resolved review threads | Threads for addressed comments are resolved via GraphQL mutation |

## Reply Version Footer (issue #363)

Every reply posted by this skill ends with a version footer on its own line:

```
_via `received-review-sdlc` v0.20.7_
```

The footer is composed by the prepare script (`skill/received-review.js`) from `manifest.plugin_version` and emitted as `manifest.reply_footer`. The skill appends it verbatim to every reply body — no modification. This lets reviewers correlate responses with the skill version that produced them. Falls back to `'unknown'` when the plugin version cannot be read.

## Link Verification (issue #198)

Before any `gh api` reply is posted (Step 12), the skill pipes the concatenated reply bodies through `scripts/lib/links.js` as a hard gate (Step 11.7). The validator auto-derives `expectedRepo` from `git remote origin` and `jiraSite` from `~/.sdlc-cache/jira/` — the skill never constructs the validator context. URL classes checked: GitHub issues/PRs (owner/repo identity + existence), Atlassian `*.atlassian.net/browse/<KEY>` (host match), and any other `http(s)://` URL (HEAD reachability, 5s timeout). Hosts in the built-in skip list (`linkedin.com`, `x.com`, `twitter.com`, `medium.com`) are reported as `skipped`, not violations. Set `SDLC_LINKS_OFFLINE=1` to skip generic reachability while keeping context-aware checks. On non-zero exit, no replies are posted and the violation list is surfaced verbatim. No flag toggles this gate — it is hard.

### Process review feedback with auto-harden enabled

When `alwaysHardenFromReview=true` in `.sdlc/local.json` and `--auto` is passed (e.g., from `/ship-sdlc`):

```text
/received-review-sdlc --pr 42 --auto
```

After Step 11 (IMPLEMENT) completes, Step 11.6 (META-ANALYZE) clusters the evaluated findings:

```text
Step 11.6 — meta-analyze-findings: started | clusterCount=2 surfaces=[review-dimensions, plan-guardrails]
Step 11.6 — meta-analyze-findings: completed | dispatched=2 deferred=0 suppressed=0
```

Two `harden-sdlc` dispatches run automatically (with `--auto` propagated). Each writes its own
learning-log entry. Step 11.7 (LINK VERIFICATION) then runs, followed by Step 12 (REPLY & RESOLVE).

When `flags.auto=true` and `alwaysHardenFromReview=false` (the default), dispatch is deferred instead:

```text
Step 11.6 — meta-analyze-findings: completed | dispatched=0 deferred=2 suppressed=0
```

A deferred-action entry is written to `.sdlc/learnings/log.md`. A follow-up interactive run
replays the deferred clusters by reading the `surface=` lines from that entry.

---

## Related Skills

- [`/review-sdlc`](review-sdlc.md) — source of findings this skill responds to
- [`/commit-sdlc`](commit-sdlc.md) — commit the fixes after implementing review feedback
- [`/pr-sdlc`](pr-sdlc.md) — the PR being reviewed
- [`/harden-sdlc`](harden-sdlc.md) — dispatched by Step 11.6 to strengthen guardrails and review dimensions
