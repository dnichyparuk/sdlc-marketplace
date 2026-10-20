# ship-sdlc — OpenSpec steps

Read this file only when `verify_openspec` or `archive_openspec` is the current step (R-progressive-disclosure). `ship.js` emits both with `step.data.change` and `step.data.commands`; run the commands with Bash as Step 5 item 5 says.

## verify_openspec — inline, opt-in

Implements R-verify-openspec-1..5. Run `step.data.commands[0]` (`openspec-step.js validate --change "<name>"`); it prints `{ ok, cliAvailable, stderr }`. Report `success: true` whatever the command exits, with its JSON in `output` (non-blocking, R-verify-openspec-4):
- `cliAvailable: false` → log `openspec CLI not available, skipping validate`.
- `ok: true` → log `openspec validate --strict: passed`.
- `ok: false` and `cliAvailable: true` → log `stderr` as a warning.

## archive_openspec — conditional

Implements R22–R27 and R-archive-sync-1..6. `ship.js` read `isArchived` and the task counts fresh when it emitted the step (R-archive-sync-2) and, for an interactive change with every task done, ran the validation. It sets `llm_decision` only on the two interactive paths below.

### Prompts

Incomplete tasks, interactive (R-archive-sync-3) — the consent gate for this path; no second prompt follows:

> OpenSpec change "`<name>`" has `<tasksTotal - tasksDone>` incomplete task(s) (`<tasksDone>`/`<tasksTotal>` done).
>
> Options: **sync-and-archive** (Recommended) | **archive-anyway** | **abort**

All tasks done and validation passed, interactive (R25):

> OpenSpec change "`<name>`" passed validation with all `<tasksTotal>` task(s) already complete. Archive now?
>
> Options: **archive** (Recommended) | **abort**

`ship.js` puts the first line of each, with the values filled in and the backticks removed, in `llm_decision.prompt`.

### Answer → `--decision`

| Answer | Action |
|---|---|
| `sync-and-archive` | replace `<decision>` in the command with `sync` |
| `archive-anyway` | replace `<decision>` with `anyway` |
| `archive` | replace `<decision>` with `anyway` |
| `abort` | run no command; report `success: true` with `output.answer: "abort"`; `ship.js` leaves the step `in_progress` for `--resume` (R-archive-sync-3) |

### `--auto`

No prompt (R71, R-archive-sync-4): `ship.js` writes `--decision anyway --auto` itself. With incomplete tasks the script prints `archive-openspec: N task(s) incomplete — proceeding without sync (--auto)` on stderr; repeat that line to the user.

### Running and recording

Run the command. It validates, archives and commits `chore(openspec): archive <name>` itself, and prints `{ status, taskCounts, validation, commitMade, resultText }`. Put the JSON in `output`; `ship.js` records `resultText` via complete-step (`state-format.md`).
- Exit 0 → `success: true`. If `taskCounts.failed` is non-empty, warn with the refs (non-fatal).
- Exit 1 (`status: "halted"`) → `success: false`, with `output.summary` one line naming the status and the first line of `validation.stderr` (or of the command's stderr). `ship.js` halts the pipeline and keeps the state for `--resume`.
