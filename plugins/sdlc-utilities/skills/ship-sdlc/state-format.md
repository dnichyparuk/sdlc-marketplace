# Pipeline State File Format

The `ship-sdlc` skill writes a JSON state file to `.sdlc/execution/` at pipeline start and updates it after each step. This file enables crash recovery via `--resume` and provides a transparent audit trail of every decision made during the run.

---

## File Location

```
.sdlc/execution/ship-<branch>-<timestamp>.json
```

- `<branch>` — current git branch name with `/` replaced by `-`
- `<timestamp>` — ISO 8601 UTC timestamp at pipeline start, compacted to `YYYYMMDDTHHmmssZ`

Example: `.sdlc/execution/ship-feat-my-feature-20260327T143000Z.json`

---

## Top-Level Schema

```json
{
  "version": 1,
  "startedAt": "2026-03-27T14:30:00Z",
  "branch": "feat/ship-sdlc",
  "flags": { ... },
  "steps": [ ... ],
  "decisions": [ ... ],
  "deferredFindings": [ ... ]
}
```

| Field             | Type   | Description                                                  |
|-------------------|--------|--------------------------------------------------------------|
| `version`         | number | Schema version. Always `1` for the current format.           |
| `startedAt`       | string | ISO 8601 UTC timestamp when the pipeline was invoked.        |
| `branch`          | string | Git branch name at pipeline start.                           |
| `flags`           | object | Resolved flags passed to `ship-sdlc` (see below).           |
| `steps`           | array  | Ordered list of pipeline step records (see below).           |
| `decisions`       | array  | Key decisions recorded for transparency (see below).         |
| `deferredFindings`| array  | Review findings deferred to a follow-up (see below).        |
| `worktree`        | string \| absent | Absolute realpath of the active worktree at init. Optional, absent on pre-#501 state files. Does not affect state file location keying — the state directory stays main-worktree-shared regardless of this field's value (R73). When present, it now also gates *implicit* resume eligibility (R-resume-worktree, #503): `skill/ship.js` only sets `flags.implicitResume = true` when this field equals the current worktree's resolved path, preventing a state file created in one worktree from silently reporting progress (e.g. a stale `in_progress` step) as if it belonged to a different worktree the user has since moved to. Absent (legacy) state files skip the comparison and fall back to R-implicit-resume's existing worktree-unaware rule. Explicit `--resume` is never blocked by a mismatch. Also used to scope the session-start banner to the active worktree. |
| `sessionId`       | string \| null | The Claude Code session (`CLAUDE_CODE_SESSION_ID`) currently recognized as driving this pipeline. Stamped by `initState()` at creation and re-stamped by `claimSession()` on every resume (implicit or explicit `--resume`), so it always names the session that most recently claimed the pipeline rather than the one that first created it. Read by `hookEnforcementAllowed()` (R73, #505): the three ship continuation hooks compare this against the hook payload's session id and stay silent on a mismatch, so a stale or abandoned pipeline can no longer inject "continue executing this step" reminders into an unrelated session that happens to share a branch. Not worktree-scoped — see `worktree` above, which the predicate does not read. |
| `nextPendingStep` | string \| null | Derived at read time by `lib/state.js::detectResumeState`. Name of the first step in `steps[]` whose `status` is neither `completed` nor `skipped`, or `null` when every step is resolved. Not written into the on-disk file; recomputed on every read so a resumed run picks the correct re-entry point. Example: `"review"`. |
| `history` | array \| absent | Optional append-only log of stepper transitions. Each entry: `step` (string), `result` (`"success"`, `"failed"` or `"unknown"`), `data` (any, optional), `timestamp` (string). Steps with no `steps[]` record, such as `cleanup`, appear here only. |
| `currentStep` | string \| null \| absent | Optional name of the step the stepper last emitted and has not yet completed, or `null` when none. |

---

## `flags` Object

Captures the effective flags after defaults and config are applied, so a resumed run uses the same configuration.

```json
{
  "auto": false,
  "steps": ["execute", "commit", "review", "archive-openspec", "pr", "learnings-commit"],
  "bump": "patch",
  "draft": false,
  "dryRun": true,
  "resume": false,
  "implicitResume": false,
  "hasPlan": true,
  "workspace": "continue",
  "rebase": "auto",
  "openspecChange": null,
  "verifyPipelineTimeout": 1200,
  "verifyPipelineInterval": 60,
  "verifyPipelineMaxIterations": 3,
  "awaitRemoteReviewTimeout": 600,
  "awaitRemoteReviewInterval": 60,
  "awaitRemoteReviewers": ["copilot"],
  "executeWaveTimeout": 1800,
  "executeWaveInterval": 60,
  "executeCommitWaves": false,
  "planModeBlocked": false,
  "skipConfigCheck": false,
  "sources": {
    "auto": "default",
    "draft": "default",
    "bump": "default",
    "steps": "default",
    "reviewThreshold": "default",
    "rebase": "default",
    "verifyPipelineTimeout": "default",
    "verifyPipelineInterval": "default",
    "verifyPipelineMaxIterations": "default",
    "awaitRemoteReviewTimeout": "default",
    "awaitRemoteReviewInterval": "default",
    "awaitRemoteReviewers": "default",
    "executeWaveTimeout": "default",
    "executeWaveInterval": "default",
    "executeCommitWaves": "default",
    "workspace": "derived"
  }
}
```

| Field    | Type            | Description                                                          |
|----------|-----------------|----------------------------------------------------------------------|
| `auto`   | boolean         | Whether `--auto` (non-interactive) mode was active.                  |
| `steps`  | string[]        | Resolved pipeline step names (from `ship.steps[]`, `--steps` or `--quick`). |
| `sources` | object         | Per-flag provenance: `cli`, `config`, `default`, `quick` or `derived`. |
| `bump`   | string \| null  | Version bump type (`"major"`, `"minor"`, `"patch"`), or `null`.      |
| `draft`  | boolean         | Whether the PR was opened as a draft.                                |
| `planFile` | string \| null | Plan file path frozen at init (or once on resume of a legacy ledger); an input to `computeSteps`, never re-read. Optional. |
| `openspecContext` | object | OpenSpec context frozen at init: `branchMatch`, `isAlreadyArchived` (boolean), `tasksDone` (integer \| null), `tasksTotal` (integer \| null). An input to `computeSteps`, never re-read. Optional. |
| `ttlDays` | integer | Ledger retention in days (`--ttl-days`), minimum 0. Optional. |

---

## `steps` Array

Each element represents one pipeline step in execution order.

```json
[
  { "name": "execute",         "status": "completed",   "result": "8 tasks, 3 waves", "completedAt": "2026-03-27T14:35:00Z" },
  { "name": "commit",          "status": "completed",   "result": "a1b2c3d", "commitSha": "a1b2c3d", "completedAt": "2026-03-27T14:36:00Z" },
  { "name": "review",          "status": "completed",   "result": "APPROVED_WITH_NOTES", "reviewVerdict": "APPROVED_WITH_NOTES", "completedAt": "2026-03-27T14:38:00Z" },
  { "name": "received-review", "status": "pending",     "condition": "if critical/high findings" },
  { "name": "commit-fixes",    "status": "pending",     "condition": "if received-review made changes" },
  { "name": "version",         "status": "completed",   "result": "v1.2.3", "versionTag": "v1.2.3", "completedAt": "2026-03-27T14:39:00Z" },
  { "name": "pr",              "status": "in_progress", "prUrl": "https://github.com/owner/repo/pull/42", "startedAt": "2026-03-27T14:40:00Z" }
]
```

### Step Fields

| Field            | Type   | Present when                                | Description                                                   |
|------------------|--------|---------------------------------------------|---------------------------------------------------------------|
| `name`           | string | always                                      | Step identifier (see step names below).                       |
| `status`         | string | always                                      | Current execution status (see status values below).           |
| `startedAt`      | string | status is `in_progress`                     | ISO 8601 UTC timestamp when the step began.                   |
| `completedAt`    | string | status is `completed` or `skipped`          | ISO 8601 UTC timestamp when the step finished.                |
| `result`         | string | status is `completed`                       | Human-readable summary of what the step produced.             |
| `condition`      | string | step is conditional                         | Natural-language condition that gates this step's execution.  |
| `reason`         | string | status is `skipped`                         | Why the step was skipped.                                     |
| `error`          | string | status is `failed`                          | Error message or description of the failure.                  |
| `failedReason`   | string | optional — status is `failed`               | Machine-readable category of why the step failed, complementing the human-readable `error` message. |
| `reviewVerdict`  | string | optional — set by the `review` step         | Review outcome label (e.g. `"APPROVED"`, `"APPROVED_WITH_NOTES"`, `"CHANGES_REQUESTED"`). Used by post-compact reminders. |
| `prUrl`          | string | optional — set by the `pr` step             | Absolute URL of the created or updated pull request.          |
| `commitSha`      | string | optional — set by the `commit` / `commit-fixes` step | Short SHA (e.g. `"a1b2c3d"`) of the commit produced by the step. |
| `versionTag`     | string | optional — set by the `version` step        | Git tag produced by the version step (e.g. `"v1.2.3"`).      |
| `usage`          | object | optional — `complete-step`/`fail` `--usage` | Token accounting for the step's dispatch: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens` (non-negative integers), `model`, `effort` (`low\|medium\|high\|xhigh\|max`), `source`. `{"source":"unavailable"}` when the harness exposes no usage. A `SubagentStop` hook payload may expose usage; it is unverified (Risk S2) — if confirmed, a plugin hook can write `usage` without SKILL.md prose. `usage.source` records where a value came from. Today the source of record is the agent's self-report (`source` absent or `"self-report"`). Once S2 confirms a `SubagentStop` usage payload, the hook-written value (`source: "subagent-stop"`) is the source of record and the self-report is the fallback: `complete-step`/`fail`/`wave-done --usage` never replace an existing `source: "subagent-stop"` value, and the hook always replaces a self-report. |

### Step Names

The pipeline runs these canonical steps in order (conditional and optional steps noted):

| Name                  | Description                                                                                      |
|-----------------------|--------------------------------------------------------------------------------------------------|
| `execute`             | Run the execution plan (tasks, waves).                                                           |
| `commit`              | Commit all changes produced by `execute`.                                                        |
| `review`              | Run automated code review via `review-sdlc`.                                                     |
| `received-review`     | Conditional: process critical/high review findings and apply fixes.                              |
| `commit-fixes`        | Conditional: commit changes made during `received-review`.                                       |
| `version`             | Bump the version according to `--bump` or interactive selection.                                 |
| `verify-openspec`     | Opt-in, OpenSpec-gated: **inline `openspec validate --strict <change>`** validates change spec files structurally before archiving. (Structural validation only — confirms spec files are well-formed.) Runs only when configured in `steps[]` and a matched OpenSpec change exists. |
| `archive-openspec`    | Opt-in: archive the OpenSpec change and sync delta specs (inline Bash, OpenSpec-gated).          |
| `pr`                  | Open or update a pull request.                                                                   |
| `verify-pipeline`     | Opt-in: poll `gh pr checks` until CI converges after the PR is opened.                          |
| `await-remote-review` | Opt-in: poll for an automated reviewer's (e.g. Copilot) verdict after the PR is opened.         |
| `learnings-commit`    | Persist session learnings captured during the run (no-op when nothing was captured).            |
| `cleanup`             | Always runs last (not user-configurable): deletes the state file on success, prunes stale orphans. |

`received-review` only executes when `review` reports findings at or above the configured `reviewThreshold`.
`commit-fixes` only executes when `received-review` applied code changes.
`verify-openspec` only runs when it is included in `steps[]` AND a matched OpenSpec change exists (`flags.openspecChange` or `openspecContext.branchMatch`).
`archive-openspec` only runs when an OpenSpec change is detected for the current branch.

`archive-openspec`'s `result` field (status `completed`) reflects the task-completeness outcome from the fresh `parseTasks` read taken immediately before validating and archiving (R-archive-sync-2) — NOT the prepare-time `tasksDone`/`tasksTotal` snapshot exposed on `openspecContext`. Three shapes:
- `"archived <name>"` — all tasks were already done; no prompt, no sync.
- `"archived <name> (synced N tasks)"` — the user chose `sync-and-archive` at the interactive prompt and `syncIncompleteTasks` marked `N` tasks done (R-archive-sync-3, R-archive-sync-5).
- `"archived <name>, N task(s) left incomplete"` — tasks were left incomplete on purpose: either the user chose `archive-anyway` at the interactive prompt, or the pipeline was running `--auto` and warned-and-proceeded without prompting (R-archive-sync-4).

If the user instead chooses `abort` at the interactive prompt, the pipeline halts before archiving — the step is left `status: "in_progress"` (no `result` written) so `--resume` re-enters it.

### Status Values

| Status        | Meaning                                                                 |
|---------------|-------------------------------------------------------------------------|
| `pending`     | Not yet started; waiting for preceding steps to complete.               |
| `in_progress` | Currently executing. If the process crashes, this step will be retried. |
| `completed`   | Finished successfully.                                                  |
| `skipped`     | Intentionally bypassed (via `--skip`, a condition not being met, or other logic). |
| `failed`      | Terminated with an error; pipeline halted.                              |

---

## `decisions` Array

Records key choices made during the run for post-run transparency and debugging.

```json
[
  { "step": "execute", "decision": "steps resolved from config ship.steps[]" },
  { "step": "review",  "decision": "verdict: APPROVED WITH NOTES — 2 medium deferred, no critical/high" }
]
```

| Field      | Type   | Description                                      |
|------------|--------|--------------------------------------------------|
| `step`     | string | The step name that produced this decision entry. |
| `decision` | string | Description of what was decided and why.         |

Decisions are appended as each step completes. They are never overwritten.

---

## `deferredFindings` Array

Review findings that were not acted on during the pipeline run. These are captured so they can be turned into follow-up issues.

```json
[
  {
    "severity": "medium",
    "file": "src/auth.ts",
    "line": 42,
    "title": "Extract token validation"
  }
]
```

| Field      | Type           | Description                                                   |
|------------|----------------|---------------------------------------------------------------|
| `severity` | string         | Severity level: `"critical"`, `"high"`, `"medium"`, `"low"`. |
| `file`     | string         | Repository-relative path of the file with the finding.        |
| `line`     | number \| null | Line number, or `null` if the finding is file-level.          |
| `title`    | string         | Short description of the finding.                             |

Only `medium` and `low` findings are deferred. Critical and high findings trigger `received-review` and must be resolved before the pipeline proceeds.

---

## Lifecycle Rules

### Cleanup

The state file is deleted automatically when the pipeline completes successfully (all steps reach `completed` or `skipped` and the PR is opened or updated). This keeps `.sdlc/execution/` clean in the normal case.

If the pipeline fails or is interrupted, the state file is retained so the run can be resumed.

### Resume

Passing `--resume` to `ship-sdlc` causes it to read the most recent state file for the current branch (matched by branch name in the filename). The skill replays the step list and skips any step with status `completed` or `skipped`. Steps with status `in_progress` are retried from the beginning.

If multiple state files exist for the same branch (from multiple failed attempts), the one with the most recent timestamp is used.

---

## Full Example

```json
{
  "version": 1,
  "startedAt": "2026-03-27T14:30:00Z",
  "branch": "feat/ship-sdlc",
  "flags": {
    "auto": false,
    "steps": ["execute", "commit", "review", "archive-openspec", "pr", "learnings-commit"],
    "bump": "patch",
    "draft": false,
    "dryRun": true,
    "resume": false,
    "implicitResume": false,
    "hasPlan": true,
    "workspace": "continue",
    "rebase": "auto",
    "openspecChange": null,
    "verifyPipelineTimeout": 1200,
    "verifyPipelineInterval": 60,
    "verifyPipelineMaxIterations": 3,
    "awaitRemoteReviewTimeout": 600,
    "awaitRemoteReviewInterval": 60,
    "awaitRemoteReviewers": ["copilot"],
    "executeWaveTimeout": 1800,
    "executeWaveInterval": 60,
    "executeCommitWaves": false,
    "planModeBlocked": false,
    "skipConfigCheck": false,
    "sources": {
      "auto": "default",
      "draft": "default",
      "bump": "default",
      "steps": "default",
      "reviewThreshold": "default",
      "rebase": "default",
      "verifyPipelineTimeout": "default",
      "verifyPipelineInterval": "default",
      "verifyPipelineMaxIterations": "default",
      "awaitRemoteReviewTimeout": "default",
      "awaitRemoteReviewInterval": "default",
      "awaitRemoteReviewers": "default",
      "executeWaveTimeout": "default",
      "executeWaveInterval": "default",
      "executeCommitWaves": "default",
      "workspace": "derived"
    }
  },
  "steps": [
    { "name": "execute",         "status": "completed",   "result": "8 tasks, 3 waves",                             "completedAt": "2026-03-27T14:35:00Z" },
    { "name": "commit",          "status": "completed",   "result": "a1b2c3d",                                       "completedAt": "2026-03-27T14:36:00Z" },
    { "name": "review",          "status": "in_progress", "startedAt": "2026-03-27T14:36:05Z" },
    { "name": "received-review", "status": "pending",     "condition": "if critical/high findings" },
    { "name": "commit-fixes",    "status": "pending",     "condition": "if received-review made changes" },
    { "name": "version",         "status": "skipped",     "reason": "in skip set" },
    { "name": "pr",              "status": "pending" }
  ],
  "decisions": [
    { "step": "execute", "decision": "steps resolved from config ship.steps[]" },
    { "step": "review",  "decision": "verdict: APPROVED WITH NOTES — 2 medium deferred, no critical/high" }
  ],
  "deferredFindings": [
    { "severity": "medium", "file": "src/auth.ts", "line": 42, "title": "Extract token validation" }
  ]
}
```

---

## Plan-Mode-Blocked Init

When `/ship-sdlc` is invoked while plan mode is active, Step 0 calls `skill/ship.js --plan-mode-blocked` which invokes `state/ship.js init` to persist an init state file. The state file shape is **byte-identical** to a normal `cmdInit` write — all configured steps with `status: "pending"`, plus `version`, `startedAt`, `branch`, `flags`, `decisions: []`, `deferredFindings: []`.

The `planModeBlocked` flag does NOT appear in the state file — it is an annotation in the prepare output only, telling SKILL.md what happened.

On the user's next `/ship-sdlc` invocation (after exiting plan mode), `detectResumeState` finds the state file by branch slug and sets `flags.implicitResume = true`. The pipeline resumes from the first pending step with the originally-resolved `flags` snapshot (including `bump`, `steps`, etc.). (Fixes #400.)
