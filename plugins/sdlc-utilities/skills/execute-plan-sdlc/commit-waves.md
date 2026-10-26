# Per-wave WIP commits (`--commit-waves`)

Read on demand from SKILL.md, only when `flags.commitWaves` is true (R-progressive-disclosure). Both sections are moved from SKILL.md; the 5c-quater commit runs from a message file (`git commit -F`), everything else is unchanged.

## Flag sources and help

**Parse `--commit-waves` (R35):** Set `commitWaves = flags.commitWaves` (CLI `--commit-waves`, else `execute.commitWaves`, else the legacy `ship.execute.commitWaves`, else `false`). Default `false`. When set, Step 5d gates a per-wave WIP commit after G9+G11 pass (see "5d (per-wave commit)" below). The small-plan direct-execution path (R5, Step 2b) NEVER triggers per-wave commits regardless of this flag. Inline help summary:

| Flag | Description | Default |
|---|---|---|
| `--commit-waves` | Commit each completed wave as `wip(execute): wave N — <titles>` after G9 + G11 pass. Skipped for small-plan path (R5). | false |

## 5c-quater — per-wave WIP commit

**5c-quater. Per-wave WIP commit (Fixes #392 / R35) — gated on `commitWaves === true`.** This sub-step fires ONLY after BOTH G9 (mechanical/filesystem verify) AND G11 (post-wave guardrail check) PASS for the current wave AND the current wave is NOT the small-plan direct-execution path (R5, Step 2b). The small-plan path NEVER triggers per-wave commits regardless of the flag.

When `commitWaves === false` (default): skip this sub-step entirely — proceed to 5d.

When `commitWaves === true`:

1. Compose the subject deterministically: `wip(execute): wave {N} — {comma-separated task titles}`. Truncate the full subject (including the `wip(execute): wave N — ` prefix) to 72 characters; when truncation happens, append `…` as the 72nd character (so the line is exactly 72 chars including the ellipsis).

2. Run from main context (NOT from inside the wave-runner Agent):
   ```bash
   git add -A
   MSG_FILE=$(mktemp)
   # Quoted heredoc: the subject is never shell-expanded. Keep the <subject> and EOF lines in column 1; an indented EOF never closes the heredoc.
   cat > "$MSG_FILE" <<'EOF'
<subject>
EOF
   git commit -F "$MSG_FILE"
   COMMIT_EXIT=$?
   rm -f "$MSG_FILE"
   ```

   **Hooks always run.** Do NOT pass `--no-verify`. A pre-commit hook failure is a hard wave-level failure — treat it as failed verification and trigger the existing escalation flow (Step 6 RECOVER); do NOT bypass.

3. Soft-success path — empty diff (nothing to commit, e.g., wave was a no-op or every produced change was reverted by a hook):
   - `git commit` returns non-zero with "nothing to commit" stderr → treat as soft success.
   - Surface a one-line notice: `Wave N produced no diff — no WIP commit recorded.`
   - Persist `committedSha: null` via the state write below.

4. Success path — commit landed:
   - Capture `committedSha`:
     ```bash
     committedSha=$(git rev-parse HEAD)
     ```
   - Persist via the new state subcommand:
     ```bash
     node "$STATE_SCRIPT" wave-committed --branch <slug> --wave <N> --sha "$committedSha"
     ```
   - For the soft-success path above, omit `--sha` (or pass `--sha ""`): the subcommand persists `committedSha: null`.

5. Workspace compatibility: state writes route through `resolveStateDir()` (already the case in `state/execute.js`); the `git commit` runs in the active checkout (current cwd). When invoked from a manual git worktree (derived `continue`), both the diff and the commit land in that worktree, while `.sdlc/` state stays anchored to the main worktree via `resolveStateDir()`.
