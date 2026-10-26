# OpenSpec tasks (execute-plan-sdlc)

Read on demand from SKILL.md, only when the prepare output carries OpenSpec context (R-progressive-disclosure). Each section below is moved from SKILL.md; the SKILL.md step that points here says when to follow it. The archive-suggestion section validates through `openspec-step.js validate`; everything else is unchanged.

## OpenSpec context loading (Step 1)

**OpenSpec context loading (optional):** Read every file listed in `openspec.specFiles` (P8 — the delta specs under `openspec/changes/<name>/specs/`, resolved by the prepare script from the plan's `**Source:**` field) and store the contents as `openspecSpecs` for use in Step 5c-bis. If `openspec.specFiles` is empty, proceed without OpenSpec context — this is not a blocking error.

## OpenSpec task-flip map (Step 1)

**OpenSpec task-flip map (implements R37 — Fixes #414):** Take `openspecTaskMap` from `openspec.taskMap` (P8: one `{ taskId, change, ref, line, title }` entry per task that carries an `openspec-task:` block) and `refToTaskIds` from `openspec.refToTaskIds` (P8: an object mapping each `ref` to its task-ID array) — never rebuild either from the plan text (C16). Seed an empty `flippedRefs: Set<ref>` (refs already flipped this run — prevents redundant calls and powers idempotent `--resume`). When the plan has no `openspec-task` blocks, all three structures are empty and Step 5d's new behavior is a no-op. The change name is consistent across blocks (it is the same OpenSpec change); the `change` field on each block is what is passed to `markTaskDone`.

## 5d-bis — OpenSpec task flip

**5d-bis — OpenSpec task flip (implements R37, R39, I13, E14 — Fixes #414).** After `task-done` state writes for this wave, before the `wave-done` state write, flip OpenSpec checkboxes for refs whose plan-task siblings have all reached DONE / DONE_WITH_CONCERNS. This step runs in execute-plan-sdlc main context ONLY — never from inside the wave-runner Agent or per-task sub-agents (cite R37). When `refToTaskIds` is empty (plan has no `openspec-task` blocks), skip this step entirely (zero new behavior).

Algorithm:

1. Build `completedOpenspecTaskIds`: the cumulative set of plan-task IDs (across all waves so far) whose `status` in the state file is `completed`. Source this from `state/execute.js read` output so it survives `--resume` — do NOT cache in conversation memory only.
2. For each `(ref, siblings)` in `refToTaskIds`:
   - Skip if `ref` ∈ `flippedRefs` (already attempted this run — idempotent).
   - Skip if `siblings` is NOT a subset of `completedOpenspecTaskIds` (at least one sibling is still pending, failed, or blocked — leaves the OpenSpec checkbox `- [ ]` per R37).
   - Otherwise, look up the `openspec-task` block for any one sibling (all siblings share `change`/`ref`/`line`/`title`) and call `markTaskDone(change, ref, { line, title })` through `openspec-step.js flip` (leave `<line>` empty when the block has none; inside each single-quoted value write every `'` as `'\''`):

     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     # Assign each value to a shell variable on its own line, single-quoted, then pass the variables
     # as double-quoted arguments: this avoids shell injection from LLM-generated task titles
     # (titles may contain ", `, $(...), or newlines that would break inline interpolation).
     OPENSPEC_CHANGE='<change>'
     OPENSPEC_REF='<ref>'
     OPENSPEC_LINE='<line>'
     OPENSPEC_TITLE='<title>'
     node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" flip --change "$OPENSPEC_CHANGE" --ref "$OPENSPEC_REF" --line "$OPENSPEC_LINE" --title "$OPENSPEC_TITLE"
     ```
   - Add `ref` to `flippedRefs` regardless of the outcome (single-fire per run; idempotency in `markTaskDone` handles a future `--resume`).
   - Interpret the JSON result `{ flipped, ref, reason }`:
     - `{ flipped: true, reason: 'ok' }` — no action.
     - `{ flipped: false, reason: 'already-done' }` — no action; OpenSpec already showed it as done (e.g., resumed run, user manual edit).
     - `{ flipped: false, reason: 'not-found' }` or `{ flipped: false, reason: 'io-error' }` — append to `.sdlc/learnings/log.md` (one line: `## <YYYY-MM-DD> — execute-plan-sdlc markTaskDone failed: change=<change> ref=<ref> reason=<reason>`) and add `{ change, ref, reason }` to an in-memory `openspecSyncWarnings` array surfaced by Step 9 REPORT. Pipeline continues — this is non-blocking per R39/E14.
     - A non-zero exit or output that is not this JSON (for example a usage error, exit 2) is handled like `io-error`.

Wave abort on `markTaskDone` failure is FORBIDDEN.

## OpenSpec sync warnings (Step 9)

**OpenSpec sync warnings (implements R39 — Fixes #414):** When `openspecSyncWarnings` (populated by Step 5d's `markTaskDone` failure handler) is non-empty, append:
```
OpenSpec sync warnings:
  - change=<change> ref=<ref> reason=<not-found|io-error>
  - ...
```
When the array is empty (the happy path), omit the section entirely.

## Archive suggestion (Step 9, What's Next)

If `openspecSpecs` was loaded in Step 1 (the plan was OpenSpec-sourced), also suggest archive-related next steps — but gate on validation first:

1. Extract the change name from the plan header's `**Source:**` field (the `openspec/changes/<name>/` path).
2. Call `openspec-step.js validate` (it wraps `lib/openspec.js::validateChangeStrict`) via Bash; inside the single-quoted value write every `'` as `'\''`:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   OPENSPEC_CHANGE='<name>'
   node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" validate --change "$OPENSPEC_CHANGE"
   ```
   It prints one JSON line `{ ok, cliAvailable, stderr }` and exits 0 when `ok` is true or the CLI is missing, 1 otherwise. A usage error (exit 2) or output that is not this JSON is handled like `ok === false`, with the output as `<stderr output>`.
3. **If `cliAvailable === false`:** emit the existing static advisory (no fabricated validation claim):
   - `openspec validate --strict <change>` — validate change spec files structurally
   - `openspec archive <change> --yes` — archive the OpenSpec change and merge delta specs after validation passes
4. **If `ok === true`:** apply the tasks.md coverage gate (implements R38 — Fixes #414) before emitting the suggestion:
   - Re-parse `openspec/changes/<name>/tasks.md` via `lib/openspec.js::parseTasks` using the `<PLUGIN_ROOT>` path and the env-var contract below:

     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     # TODO(#9165): openspec-step.js has no tasks/coverage subcommand yet; replace this node -e with it when it lands.
     OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \
     OPENSPEC_TASKS_PATH="openspec/changes/<name>/tasks.md" \
     node -e "
     const fs = require('fs');
     const { parseTasks } = require(process.env.OPENSPEC_LIB);
     const content = fs.readFileSync(process.env.OPENSPEC_TASKS_PATH, 'utf8');
     console.log(JSON.stringify(parseTasks(content)));
     "
     ```

     Build `unflippedTitles` from entries where `done === false`.
   - Parse the plan file's `## Out-of-scope OpenSpec tasks` section (a flat bullet list of `- <title> — <rationale>` items) into `outOfScopeTitles: Set<string>` (case-sensitive title match).
   - Compute `undocumentedUnflipped = unflippedTitles.filter(t => !outOfScopeTitles.has(t))`.
   - If `undocumentedUnflipped.length === 0`: emit the validated suggestion as before:
     ```
     OpenSpec validation passed for change "<name>".
     → Run `openspec archive <name> --yes` to archive, or use `/ship-sdlc` which handles archival as a pipeline step.
     ```
   - If `undocumentedUnflipped.length > 0`: SUPPRESS the archive suggestion (R38) and emit the diagnostic listing — derived from `refToTaskIds` (built in Step 1):
     ```
     OpenSpec tasks incomplete — archive suggestion suppressed.
     Unflipped tasks (not in `## Out-of-scope OpenSpec tasks`):
       line <N>: <title> — expected from plan task(s) <id>...
       ...
     Fix the underlying plan-task failures or add these titles to `## Out-of-scope OpenSpec tasks` and re-run.
     ```
     When a title's `ref` is not in `refToTaskIds` at all, render `(no plan task carries this ref)` in place of the plan-task ID list. This skill MUST NOT call `lib/openspec.js::runArchive` — archival is deferred (preserves R23 "execute only" boundary).
5. **If `ok === false`:** emit the validation errors and suppress the archive suggestion:
   ```
   OpenSpec validation failed for change "<name>":
   <stderr output>
   Fix validation issues before archiving.
   ```
