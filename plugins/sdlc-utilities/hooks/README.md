# sdlc-utilities Hooks

This directory contains the lifecycle hooks shipped by the `sdlc-utilities` plugin. Hooks are not user-invocable — they are wired by `hooks/hooks.json` and dispatched automatically by Claude Code.

## Recovery After Compaction

There is no compaction hook and no recovery file. A pipeline interrupted by context compaction or by Claude Code stopping mid-pipeline is resumed from the ledger (`<mainWorktree>/.sdlc/execution/ship-<branchSlug>-*.json`, `execute-<branchSlug>-*.json`) plus the SessionStart banner (`Active pipeline: ship-sdlc on <branch> (...)`, `Active execution (post-compact): ...`) that `session-start.js` derives from it.

### Legacy Sidecar

Earlier plugin versions wrote `.compact-recovery-<branchSlug>.json` (and, before #256, `.compact-recovery.json`). Nothing writes or reads them any more; `session-start.js` only removes them: per-branch files older than 24 hours in its stale sweep, and the unsuffixed legacy file when older than the 1-hour freshness gate.

### Hooks Are Worktree-Blind, and Deliberately So

None of the enforcement or recovery hooks compare the active git worktree's identity as part of gating a read or write. Session ownership is decided by `hookEnforcementAllowed(data, payload)` on `sessionId`/`session_id` alone — never by comparing `cwd`, worktree path, or worktree identity. This is intentional, not an oversight: linked worktrees share the main worktree's state directory (`resolveStateDir()` always resolves to the *main* worktree, per `lib/state.js`), so a pipeline step dispatched with `isolation: "worktree"` must keep being recognized as the same in-flight pipeline by hooks running from inside that linked worktree. Reintroducing a worktree-identity check into the session/enforcement gate would break that case. (`session-start.js` does run a separate, diagnostic-only worktree comparison against a state file's recorded `worktree` field to decide whether to print a same-branch/different-worktree banner — that check never changes where state files are read from or gates any write; it is not part of `hookEnforcementAllowed`.)

### Sidecar: `.stop-block-count-<branchSlug>.json`

A per-branch sidecar lives in `resolveStateDir()`: `.stop-block-count-<branchSlug>.json`, written by `stop-pipeline-continue.js`.

- **Purpose:** `stop-pipeline-continue.js` blocks Claude Code's Stop event to keep an in-progress pipeline step running. Without a cap, an unchanged step that keeps re-triggering the same block would hold the session open forever. This sidecar counts consecutive blocks on the same step.
- **Shape:** `{ "stepName": "<step name or id>", "count": <number> }`.
- **Behavior:** each consecutive Stop-hook block on the *same* `stepName` increments `count`. A `stepName` change (the pipeline advanced) resets the counter to `{ stepName: <new step>, count: 0 }`. Once `count` reaches `STOP_BLOCK_CAP` (3), `stop-pipeline-continue.js` stops blocking and lets the Stop event proceed, logging a diagnostic to stderr.
- **Gating:** writes to this sidecar go through the same `hookEnforcementAllowed(data, payload)` predicate as the other enforcement hooks — a foreign or session-less state never gets its block counter written or incremented.
- **Cleanup:** swept by `session-start.js`'s 24-hour stale-sweep pass (`/^\.(?:compact-recovery|stop-block-count|pipeline-nudge|stop-cap-exhausted)-.+\.json$/`).

This sidecar is owned by `stop-pipeline-continue.js`; this README only documents its filename and contract for readers of this directory.

### Sidecar: `.stop-cap-exhausted-<branchSlug>.json`

Written by `stop-pipeline-continue.js` when the block cap above is reached: `{ "stepName": "<step>", "count": <n>, "at": "<ISO>" }`. While it names the current step the hook stays silent; `skill/ship.js` prepare surfaces it as a warning and `resume.capExhausted`. The hook never modifies the ledger. `state/ship.js begin-step` removes it; a sidecar for a different step is stale and ignored.

### The Nudge Sidecar: `.pipeline-nudge-<branchSlug>.json`

`pipeline-continue.js` (PostToolUse, matcher `Bash`) records the last nudge it emitted in `<stateDir>/.pipeline-nudge-<branchSlug>.json` as `{ "stepName": "<name>", "status": "<in_progress|pending>" }` and stays silent while the current step and status are unchanged, so the nudge fires once per step transition. It is written only on a path that emits, and swept by the same 24-hour stale-sweep pass.
