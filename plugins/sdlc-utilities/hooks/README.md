# sdlc-utilities Hooks

This directory contains the lifecycle hooks shipped by the `sdlc-utilities` plugin. Hooks are not user-invocable — they are wired by `hooks/hooks.json` and dispatched automatically by Claude Code.

## Compaction Recovery Filename Contract (issue #256, gating per #505/R74)

The compaction-recovery file is the cross-session handoff used to resume an SDLC pipeline that was interrupted by context compaction or by Claude Code stopping mid-pipeline.

**Location:** `<mainWorktree>/.sdlc/execution/.compact-recovery-<branchSlug>.json`

- `<mainWorktree>` is the path of the main git worktree (NOT the current worktree). Resolution lives in `lib/state.js` and is shared with the per-pipeline state files (`ship-<branchSlug>-*.json`, `execute-<branchSlug>-*.json`).
- `<branchSlug>` is the current branch name with `/` replaced by `-` (the same slugifier used by `lib/state.js::slugifyBranch`).

### Producers

- `pre-compact-save.js` — writes the recovery file when Claude Code is about to compact the conversation.
- `stop-state-save.js` — writes the recovery file when Claude Code stops with an active pipeline state.

Both producers parse `session_id` from stdin and gate the write on `hookEnforcementAllowed(data, payload)` (`lib/state.js`) — the same session-ownership predicate the other enforcement hooks use (`pipeline-continue.js`, `stop-pipeline-continue.js`, `block-askuserquestion-auto.js`). If the winning state file's `sessionId` is absent, the stdin payload's `session_id` is absent, or the two don't match, the write is skipped entirely — no file is created, and an existing sidecar is left byte-for-byte untouched. Neither producer ever exits non-zero on a denied write; denial is silent (stderr diagnostic only).

When the gate allows the write, `savedAt` is sourced from the winning state file's own filesystem mtime (`fs.statSync(stateFilePath).mtimeMs`, formatted as an ISO string) — **not** `Date.now()` at hook-invocation time. Before this fix, every Stop/PreCompact that found live state refreshed `savedAt` to "now," which meant the consumer's freshness gate (below) could never expire a pipeline that had simply gone quiet: a long-dead session kept re-stamping the file as fresh on every subsequent Stop. Sourcing `savedAt` from mtime means the sidecar's age tracks how long ago the state actually last changed, not how recently a hook happened to run.

Both producers compute their own `branchSlug` and call `resolveStateDir()` from `lib/state.js` to obtain `<mainWorktree>/.sdlc/execution/`. The filename is `.compact-recovery-${branchSlug}.json`. Aside from the `savedAt` source, the recovery payload's other keys are unchanged (same shape for both the ship-state and execute-state-fallback cases).

### Consumer

- `session-start.js` — on session start, computes the current branch's `branchSlug`, reads `.compact-recovery-${branchSlug}.json` from `resolveStateDir()`, surfaces a recovery prompt if the file is fresher than the freshness gate (default 1 hour), and unlinks the file after consumption.

The consumer reads ONLY the file matching its own branchSlug — it does not scan the directory for other branches' recovery files. This makes per-branch sessions completely isolated: a recovery written by branch A never trips a session opened on branch B.

### Legacy Filename

Pre-fix, the file was named `.compact-recovery.json` (no branch suffix). On session-start, if a legacy `.compact-recovery.json` (no suffix) is encountered alongside the per-branch file, it is unlinked silently only when its mtime is older than the 1-hour freshness gate. This avoids destroying a fresh file that an even-older plugin version might have written in a concurrent session — an edge case that is itself out of scope per the issue's YAGNI note.

### Why Per-Branch?

Before this fix, two parallel sessions on different branches shared one filename and either overwrote each other's recovery state or read the wrong session's state on resume. Disambiguating by `branchSlug` is the minimal-change fix because each hook already computes `branchSlug` for the per-branch state-file convention. Same-branch concurrent sessions remain a theoretical edge case explicitly out of scope (one branch is expected to host one active pipeline at a time).

### Hooks Are Worktree-Blind, and Deliberately So

None of the enforcement or recovery hooks compare the active git worktree's identity as part of gating a read or write. Session ownership is decided by `hookEnforcementAllowed(data, payload)` on `sessionId`/`session_id` alone — never by comparing `cwd`, worktree path, or worktree identity. This is intentional, not an oversight: linked worktrees share the main worktree's state directory (`resolveStateDir()` always resolves to the *main* worktree, per `lib/state.js`), so a pipeline step dispatched with `isolation: "worktree"` must keep being recognized as the same in-flight pipeline by hooks running from inside that linked worktree. Reintroducing a worktree-identity check into the session/enforcement gate would break that case. (`session-start.js` does run a separate, diagnostic-only worktree comparison against a state file's recorded `worktree` field to decide whether to print a same-branch/different-worktree banner — that check never changes where state files are read from or gates any write; it is not part of `hookEnforcementAllowed`.)

### The Second Sidecar: `.stop-block-count-<branchSlug>.json`

A second per-branch sidecar lives alongside `.compact-recovery-<branchSlug>.json` in `resolveStateDir()`: `.stop-block-count-<branchSlug>.json`, written by `stop-pipeline-continue.js`.

- **Purpose:** `stop-pipeline-continue.js` blocks Claude Code's Stop event to keep an in-progress pipeline step running. Without a cap, an unchanged step that keeps re-triggering the same block would hold the session open forever. This sidecar counts consecutive blocks on the same step.
- **Shape:** `{ "stepName": "<step name or id>", "count": <number> }`.
- **Behavior:** each consecutive Stop-hook block on the *same* `stepName` increments `count`. A `stepName` change (the pipeline advanced) resets the counter to `{ stepName: <new step>, count: 0 }`. Once `count` reaches `STOP_BLOCK_CAP` (3), `stop-pipeline-continue.js` stops blocking and lets the Stop event proceed, logging a diagnostic to stderr.
- **Gating:** writes to this sidecar go through the same `hookEnforcementAllowed(data, payload)` predicate as the recovery sidecar — a foreign or session-less state never gets its block counter written or incremented.
- **Cleanup:** swept by `session-start.js`'s 24-hour stale-sweep pass (`/^\.(?:compact-recovery|stop-block-count|pipeline-nudge|stop-cap-exhausted)-.+\.json$/`), the same pass that clears abandoned `.compact-recovery-*.json` files.

### The Nudge Sidecar: `.pipeline-nudge-<branchSlug>.json`

`pipeline-continue.js` (PostToolUse, matcher `Bash`) records the last nudge it emitted in `<stateDir>/.pipeline-nudge-<branchSlug>.json` as `{ "stepName": "<name>", "status": "<in_progress|pending>" }` and stays silent while the current step and status are unchanged, so the nudge fires once per step transition. It is written only on a path that emits, and swept by the same 24-hour stale-sweep pass.

This sidecar is owned by `stop-pipeline-continue.js`; this README only documents its filename and contract for readers of this directory.
