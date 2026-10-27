---
name: ship-sdlc
description: "Use this skill when shipping a feature end-to-end after plan acceptance: executing, committing, reviewing, fixing critical issues, versioning, and opening a PR in one flow. Dispatches every sub-skill (including execute-plan-sdlc) as an Agent for context isolation, with structured return values driving the pipeline state machine. Arguments: [--auto] [--steps <csv>] [--quick] [--quality full|balanced|minimal] [--bump patch|minor|major|<label>] [--draft] [--dry-run] [--resume] [--plan <path>] [--init-config]. The `<label>` form for --bump (e.g. `--bump rc`) is forwarded to version-sdlc, where it is interpreted as `--bump patch --pre <label>`; labels must match `^[a-z][a-z0-9]*$`. Triggers on: ship it, ship this, full pipeline, execute to PR, ship feature, run the whole thing."
user-invocable: true
argument-hint: "[--auto] [--steps <csv>] [--quick] [--quality full|balanced|minimal] [--bump patch|minor|major|<label>] [--draft] [--dry-run] [--resume] [--plan <path>] [--openspec-change <name>] [--init-config] [--gc] [--ttl-days <N>]"
model: sonnet
---

# Ship Pipeline

End-to-end feature shipping: execute plan, commit, review, fix critical issues, version, and open a PR. Chains six sub-skills sequentially with a conditional review-fix loop.

**Announce at start:** "I'm using ship-sdlc (sdlc v{sdlc_version})." — extract the version from the `sdlc:` line in the session-start system-reminder. If no version is in context, omit the parenthetical.

## Step 0 — Plan Mode Check

If the system context contains "Plan mode is active":

1. Locate `skill/ship.js` via the injected plugin root (same form as Step 1c below).
2. Invoke:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   PLAN_MODE_OUTPUT_FILE=$(node "<PLUGIN_ROOT>/scripts/skill/ship.js" --output-file --plan-mode-blocked $ARGUMENTS)
   PLAN_MODE_EXIT=$?
   echo "PLAN_MODE_OUTPUT_FILE=$PLAN_MODE_OUTPUT_FILE"
   echo "PLAN_MODE_EXIT=$PLAN_MODE_EXIT"
   ```
3. If `PLAN_MODE_EXIT` is non-zero: show any errors from the output file and stop.
4. Read the output JSON from `$PLAN_MODE_OUTPUT_FILE`. Confirm `planModeBlocked === true`. Extract `stateFile`, `flags.bump`, `flags.steps`.
5. Announce:
   > Plan mode is active. ship-sdlc requires write operations (git commit, gh pr create, git tag) and cannot run inside plan mode.
   >
   > **Pipeline state saved to `<stateFile>` with resolved flags:** bump=`<flags.bump>`, steps=`<flags.steps>`.
   >
   > Exit plan mode and re-invoke `/ship-sdlc` (no args needed) — the existing implicit-resume mechanism will pick up the saved state and resume from the first pending step with the originally-resolved flags intact.
6. Run `rm -f "$PLAN_MODE_OUTPUT_FILE"` to clean up the temp output file.
7. Stop. Do not proceed to subsequent steps.

All gates in steps 3–5 cite resolved fields from prepare output (`planModeBlocked`, `stateFile`, `flags.bump`, `flags.steps`) — never re-parse `$ARGUMENTS` directly.

---

## Step 1 (CONSUME): Load Config, Parse Flags, Detect Context

### 1a. --init-config handler

If `--init-config` was passed → Read `./entry-modes.md` (--init-config section) and follow it. Do not read preemptively. The handler short-circuits — no pipeline execution.

### 1a-gc. --gc handler (R39, issue #223)

If `--gc` (with optional `--ttl-days <N>`) was passed → Read `./entry-modes.md` (--gc section) and follow it. Do not read preemptively. The handler short-circuits — the pipeline does not run.

### 1b. Load ship config

**Hook context fast-path:** If the session-start system-reminder contains a `Ship config:` line, note it for display. The prepare script (`skill/ship.js`) remains the authoritative source for config values — the hook line is a user-facing heads-up, not a data source.

Check for ship config via skill/ship.js output (reads from `.sdlc/local.json` → `ship` section, with legacy `.sdlc/ship-config.json` fallback). If found, read and merge. Print a single compact summary line, e.g.:
```
Ship config (schema v2): steps=[execute, commit, review, archive-openspec, pr], draft=false, bump=patch, reviewThreshold=high, execute.commitWaves=false
```

The `execute.commitWaves` setting (R35) controls per-wave WIP commits during the execute step. Default `false`. execute-plan-sdlc's own prepare script resolves it (`.sdlc/config.json` `execute.commitWaves`, with the legacy `ship.execute.commitWaves` in `.sdlc/local.json` as a fallback); ship does not forward it. When it is `true`, the execute-plan-sdlc skill runs `git add -A && git commit -m "wip(execute): wave N — <titles>"` after each wave's G9 + G11 pass. The subsequent commit step (commit-sdlc) detects the `wip(execute):` commits since fork-point and squashes them via soft-reset into the final feature commit, so the user-facing PR history is unchanged.
If not found: `No ship config found — using built-in defaults. Run /setup-sdlc to configure.`

**Legacy v1 auto-migration:** If the loader detects a v1 config (no top-level `version`, with `ship.preset` or `ship.skip`), it migrates in place to schema v2 and emits a single stderr deprecation notice. The migrated shape (`ship.steps[]`) is what subsequent steps consume.

### 1c. Prepare pipeline context

Locate and run `skill/ship.js` with all CLI flags to pre-compute flags, context, and step statuses:
```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
PREPARE_OUTPUT_FILE=$(node "<PLUGIN_ROOT>/scripts/skill/ship.js" --output-file --has-plan $ARGUMENTS)
# Hook signal: if the session-start system-reminder contains a line matching
# `/^Active pipeline: ship-sdlc/`, ALSO append `--hook-active-pipeline` to the
# invocation above. When no state file is found, prepare emits
# errors[*].id === "implicitResumeNoState" (handled in Step 1e).
EXIT_CODE=$?
echo "PREPARE_OUTPUT_FILE=$PREPARE_OUTPUT_FILE"
echo "EXIT_CODE=$EXIT_CODE"
```

**`EXIT_CODE` gate:** `skill/ship.js` uses exit code 2 for an uncaught crash (top-level `try/catch` around `main()`) — on that path `writeOutput()` never runs, so `$PREPARE_OUTPUT_FILE` is empty/unset and there is no JSON to parse; print the `ship-prepare.js error: ...` text already on stderr and STOP without attempting to read the file. Exit code 1 means `writeOutput()` ran with a populated `errors[]` — proceed to parse the file; the render-and-stop rule below applies. Exit code 0 means success — proceed normally to 1d.

Parse the output JSON from `$PREPARE_OUTPUT_FILE`. If `errors` is non-empty, render each entry per the rule below, then stop. The parsed output replaces manual computation in subsequent sub-steps (1d–1g).

**Plan-file error rendering (implements R72):** If `errors` contains an entry whose `id` is one of `missingPlanFile`, `planFileNotFound`, or `planFileNotMarkdown`, print that entry's `message` VERBATIM before stopping — do NOT summarize, paraphrase, or collapse it into a generic "prepare failed" line. Each such message already states (1) what failed, (2) how to fix it, and (3) why the rule exists; it is composed by `skill/ship.js` (`runValidation`/`resolvePlanFile`) for direct display, not for further rewriting. `errors[]` entries may be plain strings or `{id, message}` objects — render with `typeof e === 'string' ? e : e.message` for every entry. Then STOP: do not dispatch any step.

**Gitignore warning:** If `context.sdlcGitignored` is `false` in the output, print:
```
⚠ Warning: .sdlc/ is not gitignored. Run --init-config to fix, or manually create .sdlc/.gitignore:
  printf '*\n' > .sdlc/.gitignore
```

### 1d. Parse flags

Print the `flags` object from the `skill/ship.js` output, including the `sources` map showing where each value came from (CLI, config, or default):
```
Flag resolution (from skill/ship.js):
  auto:    true  (source: cli)
  steps:   [execute, commit, review, archive-openspec, pr]  (source: config)
  preset:  balanced  (source: cli, legacy sugar; expanded to steps)
  bump:    patch (source: default)
  draft:   false (source: default)
```

### 1e. Resume check

**Hook context fast-path:** If the session-start system-reminder contains an `Active pipeline:` line, note the state file path and resume point. When the user does not pass `--resume` explicitly but the hook reported an active pipeline, the Step 1c invocation already appended `--hook-active-pipeline` (see comment above). The prepare script then either sets `flags.implicitResume === true` (state file found and fresh) or returns `errors[*].id === "implicitResumeNoState"` (state file missing). The LLM does NOT scan the filesystem — `skill/ship.js` is authoritative.

Print `resume.found` and `resume.stateFile` from the `skill/ship.js` output. If `resume.found` is `true`, print the state file path and resume point. If `false`, print that no state file was found and the pipeline will start fresh.

**Implicit-resume banner (R-implicit-resume, #359):** When `flags.implicitResume === true` in the prepare output, print the following banner verbatim BEFORE the pipeline table (Step 2). Source `<nextPendingStep>` from `resume.nextPendingStep` (provided by `detectResumeState()` in lib/state.js) and source the step lists from the state file at `resume.stateFile`:

```
Resuming after compaction from step <nextPendingStep>.
Completed: <comma-separated step names where status === "completed">.
Pending:   <comma-separated step names where status !== "completed" && status !== "skipped">.
```

Note: the banner check gates on `flags.implicitResume`, NOT `flags.resume`. The prepare script auto-sets `flags.resume = true` when `flags.implicitResume === true` so the rest of the pipeline (`ship.js` adds `--resume` to the execute dispatch when the ledger's execute step is `in_progress` and an execute state file exists) sees a unified `flags.resume` regardless of whether the user typed `--resume` or the hook triggered it.

**Missing-state prompt (R-implicit-resume):** If the prepare output's `errors` array contains an entry with `id === "implicitResumeNoState"`, use AskUserQuestion:

> Active pipeline reminder found but no state file for current branch. Start fresh, or specify a state path?

Options:
- **fresh** — re-invoke `skill/ship.js` without `--hook-active-pipeline` so the pipeline starts cleanly
- **path** — ask the user for an explicit state file path, then re-invoke with `--state-file <path>`
- **abort** — exit cleanly without dispatching any step

Read `./state-format.md` when resuming from a state file.

### 1f. Context detection

Print the `context` object values from the `skill/ship.js` output:
```
Context detection (from skill/ship.js):
  Plan in context:     yes
  Uncommitted changes: 14 files modified
  Current branch:      feat/ship-sdlc
  Default branch:      main
  gh CLI:              authenticated as <user>
  OpenSpec:            not detected
  .sdlc/ gitignored:   yes
```

**Contradictory-signal override (implements R21):** After printing the context detection block, IF `context.openspecAuthoritative.path` is set AND the current session-start `<system-reminder>` contains a line matching `/openspec.*not initialized|not initialized.*openspec/i`, print exactly one line:
`Ignoring contradictory 'not initialized' signal in session context — openspec/config.yaml exists (authoritative source: SDLC's own check via ship.js prepare output).`
Then continue the flow. If the contradictory phrase is absent, emit nothing.

### 1g. Auto-skip logic

Print each step from the `steps` array in the `skill/ship.js` output with its `status`, `reason`, and `skipSource`:
```
Auto-skip decisions (from skill/ship.js):
  execute: will_run — plan detected in context
  commit:  will_run — uncommitted changes detected
  review:  will_run — not in skip set
  received-review: conditional — depends on review verdict
  commit (fixes): conditional — depends on received-review changes
  version: skipped (auto) — auto-skipped — tags are repo-global
  verify-openspec: skipped (default) — not in steps[]
  archive-openspec: conditional — openspec change ready for archive
  pr:      will_run — not in skip set
```

The parenthetical after `skipped` reflects the step's `skipSource` field:
- `(cli)` — user passed `--steps` on the command line
- `(quick)` — step is canonical but absent from `ship.quick` under an active `--quick` run (R-quick-4); `flags.sources.steps === 'quick'` in the prepare output
- `(config)` — skip set loaded from `.sdlc/local.json`
- `(auto)` — auto-skipped by `computeSteps` logic (e.g., worktree mode)
- `(condition)` — conditional step whose condition was not met

Steps with `skipSource: "none"` are not skipped and show no parenthetical.

The LLM does not compute these statuses — `skill/ship.js` is the source of truth.

---

## Step 2 (PLAN): Build Pipeline Plan

The pipeline table is generated from the `steps` array in the `skill/ship.js` output. Each row maps:
- Step number: array index + 1
- Skill: `step.skill`
- Status: `step.status`
- Args: `step.args`
- Pause: `step.pause ? 'YES' : 'no'`

| Step | Skill | Status | Args | Pause |
|------|-------|--------|------|-------|
| 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` from `--quality` or, in interactive runs, the `execute_tier` answer | no |
| 2 | commit-sdlc | will_run | `--auto` | no |
| 3 | review-sdlc | will_run | `--committed` | no |
| 4 | received-review-sdlc | conditional | (if crit/high) | YES |
| 5 | commit-sdlc (fixes) | conditional | `--auto` | no |
| 6 | version-sdlc | skipped | — | — |
| 7 | pr-sdlc | will_run | `--auto --draft` | no |
| 7a | verify-pipeline (inline, opt-in) | conditional on `'verify-pipeline' ∈ flags.steps` | `--timeout <N> --interval <N>` | YES on failure (interactive) |
| 7b | await-remote-review (inline, opt-in) | conditional on `'await-remote-review' ∈ flags.steps` | `--timeout <N> --interval <N> --reviewers <csv>` | no |
| 8 | learnings-commit | will_run | (none — inline shell, see the `learnings_commit` section of `./reference.md`) | no |

### --auto Mode Audit

Not all sub-skills support `--auto`. This table is the source of truth:

| Sub-skill | --auto support | Behavior when ship runs with --auto |
|-----------|---------------|--------------------------------------|
| execute-plan-sdlc | Yes | `--auto` forwarded only when ship runs with `--auto` (no tier is forwarded unless the user passed `--quality`; execute-plan-sdlc resolves it, `balanced` unless resumed — execute A6). In interactive runs ship asks the tier (`execute_tier`) and about an existing execute state file (`execute_state`) before dispatch; a high-risk question comes back as a pending question (`execute_gate`). (Renamed from `--preset` in #190 to disambiguate from ship's step-selection semantics.) |
| commit-sdlc | Yes | `--auto` always forwarded. Skips commit approval prompt; interactive runs ask `confirm_commit` / `confirm_commit_fixes` first. |
| review-sdlc | No | No interactive prompts to skip — runs fully automatically already. |
| received-review-sdlc | Yes | `--auto` always forwarded. Skips Step 10 consent prompt and Step 12 reply/resolve prompt; interactive consent is `review_gate` (or `confirm_received_review` when `review_gate` did not ask). Critique gates and verification still run. Only "will fix" items auto-implemented; threads for "will fix" items auto-resolved. |
| version-sdlc | Yes | `--auto` always forwarded. Skips release plan approval prompt; interactive runs ask `confirm_version` first. Pre-condition checks and critique gates still run. |
| pr-sdlc | Yes | `--auto` always forwarded. Skips PR approval prompt; interactive runs ask `confirm_pr` first. |

---

## Step 3 (CRITIQUE): Validate Pipeline

Print each validation check:
```
Pipeline validation:
  [pass] gh CLI authenticated
  [pass] Not on default branch (feat/ship-sdlc)
  [pass] 5 of 7 steps will run
  [pass] All skip values recognized
  [pass] Version step supports --auto (release approval prompt skipped in auto mode)
  [warn] If review finds critical/high issues, pipeline will pause for fix approval (interactive only; in --auto mode flags.auto === true → auto-dispatch the fix, no pause — R71)
```

Validation checks:
- `gh auth status` succeeds
- Current branch is not the default branch (warn if it is — do not block)
- All `--steps` values are recognized step names: `execute`, `commit`, `review`, `version`, `verify-openspec`, `archive-openspec`, `pr`, `learnings-commit`
- When `flags.sources.steps === 'quick'` in the prepare output, verify that `flags.steps` is non-empty (R-quick-6 error would have fired if `ship.quick` was missing — non-empty confirms the quick profile resolved correctly). Cite `flags.sources.steps`, NOT raw `--quick` or `$ARGUMENTS`, at all decision sites (R-quick-2, R-quick-3).
- `--quick` and `--steps` are mutually exclusive — R-quick-5 error fires if both are present; surface from `errors[]` in prepare output, not re-checked independently.
- At least one step will run
- Flag combinations are coherent (`--bump` without version step → warn). `--bump` accepts `major|minor|patch` or any pre-release label matching `^[a-z][a-z0-9]*$` (e.g. `--bump rc` ships an RC release; the label is forwarded verbatim to version-sdlc).

---

## Step 4 (DO): Present Pipeline and Confirm

### Dry-run mode

If `--dry-run` was passed → Read `./entry-modes.md` (Dry-run mode section) and follow it. Do not read preemptively. Dry-run displays the full pipeline table and stops without executing.

### Auto mode

Display the pipeline table for visibility, then proceed without prompting.

### Interactive mode

Display the pipeline table. The confirmation is the loop's first step (`confirm_pipeline`). When the loop returns `done` with `ext.reason: "edit"`, ask what to change, re-run the Step 1c invocation with the changed flags and restart at Step 2; `cancel` → stop.

---

## Step 5 (EXECUTE): Run the step loop

Ask the user only when a step's `llm_decision` is non-null (ship.js sets none under `--auto`); before each step print one line saying what runs next; after each step print the one-line result. <!-- R-step5-prompting -->
Dispatch every `will_run` step as computed by `ship.js`, even when the change looks low-risk — the pipeline's value is catching cases the developer under-estimates. `cleanup-pipeline` fails the run if a `will_run` step was not resolved.
Running a step and the `--after` call that records it are one uninterrupted sequence; do not end the turn between them (the Stop hook blocks such turns).

1. `ENVELOPE_FILE` is the prepare output from Step 1 (first call). Loop:
2. Parse `$ENVELOPE_FILE`. If `ext.todos` is present, call `TodoWrite` with `ext.todos.todos` and echo `ext.todos.marker`. Then: If `status === "done"`: `ext.reason` `edit` → the Step 4 edit path (re-run Step 1c; `ship.js` has deleted the ledger when no step had run, otherwise it is kept); `cancel`, `paused` or `dry-run` → stop and print the reason; `pending-question` → print `ext.pendingQuestion.prompt` with its options, then each line of `ext.commands` in order, and stop; anything else → Step 6 with `ext.summary`. If `status === "error"` → print `error`, stop (state is preserved for `--resume`).
3. Print `step.action`. If `step.data.todos` is present, call `TodoWrite` with it and echo `step.data.marker`.
4. If `llm_decision` is non-null: resolve it — ask the user with `AskUserQuestion` using `prompt`/`options` (never in `--auto`; the script sets it to null there) — and put the answer in `output.answer`.
5. Execute by `step.id` family:
   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present (R-agent-isolation-script-driven). The agent file preloads the skill, pins its model, and carries the unattended brief and the return items (R-subagent-brief). Take `(1)–(4)` from the return into `output` (put (3) artifacts into `output.artifacts` with the keys `commit` (sha), `tag`, `prUrl`, `verdict`) and the token counts the Agent return reports into `output.usage` (`{"source":"unavailable"}` when the harness exposes none; never estimate). When (1) is failure and (4) names a question the sub-skill could not ask, set `output.pendingQuestion` to `{"prompt": "<the question>", "options": ["<option keyword>", …]}` using the option keywords the sub-skill listed.
   - `stage_changes`, `rebase`, `verify_version_tag`, `verify_openspec`, `archive_openspec`, `verify_pipeline`, `await_remote_review`, `learnings_commit`, `cleanup`: run each command in `step.data.commands` with Bash, in order; `success` = every command exited 0; capture the command's JSON stdout into `output`. For `verify_openspec` and `archive_openspec` follow `./openspec-steps.md`. `verify_openspec` reports `success: true` whatever `validate` exits (non-blocking, R-verify-openspec-1..5). Report `success: false` when the procedure halts the pipeline (`archive_openspec` validation failure, `verify_pipeline` abort): `ship.js` then returns `status: "error"`; `learnings_commit`, `verify_openspec` and `await_remote_review` never halt.
   - `branch_prepare`: run `step.data.commands`, then continue.
   - decision steps (`confirm_*`, `execute_tier`, `execute_state`, `execute_gate`, `execute_handoff`): nothing to run; the answer from item 4 is the result (`success: true`, `output.answer`).
6. Run `mktemp` and note the printed path; write `{step_id, success, output, error}` to that path with the Write tool (no shell quoting of agent text), then run `node "<PLUGIN_ROOT>/scripts/skill/ship.js" --after <step.id> --result-file <tmp> --state <state_file>`; set `ENVELOPE_FILE` to the path it prints (the path is printed also when the exit code is non-zero; a non-zero exit is handled like `status: "error"` in item 2); `rm -f <tmp>`; go to 2.

Judgment sections (read only when the step id matches): `review_gate` interactive choice (defer = collect findings for the summary); `rebase_conflict` (the `rebase` step already ran `git rebase --abort`; pause → stop with state; skip → continue to version; merge → run `git merge origin/<default>`, on conflict abort and pause); `verify_pipeline`, `await_remote_review`, `learnings_commit`: read the matching section of `./reference.md`. When `verify_openspec`/`archive_openspec` is the current step → Read `./openspec-steps.md` and follow it. Do not read preemptively.

### After version — post-version ancestry HARD GATE (R-post-version-ancestry, fixes #349)

Take `NEW_TAG` and `EXECUTE_BRANCH` from `step.data` of the `verify_version_tag` envelope.

Reuse `NEW_TAG` — the tag already captured at version-step completion from the version-sdlc return (`ship.js` checks it on `--after dispatch_version` and passes it as `step.data.NEW_TAG`). When `NEW_TAG` is set (non-empty) AND `EXECUTE_BRANCH` is set (non-empty), run the ancestry check:

```bash
# Post-version ancestry HARD GATE
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
if [ -n "$NEW_TAG" ] && [ -n "$EXECUTE_BRANCH" ]; then
  node "<PLUGIN_ROOT>/scripts/util/verify-tag-ancestry.js" --tag "$NEW_TAG" --branch "$EXECUTE_BRANCH" --remote origin
  ANCESTRY_EXIT=$?
  if [ "$ANCESTRY_EXIT" -ne 0 ]; then
    echo "Pipeline halted: tag $NEW_TAG is not an ancestor of $EXECUTE_BRANCH." >&2
    echo "Remediation: delete the tag (git push origin :refs/tags/$NEW_TAG; git tag -d $NEW_TAG) and re-run version step on the correct branch." >&2
    exit 1
  fi
fi
```

`NEW_TAG` is the tag string emitted by version-sdlc (e.g. `v1.2.3`). `EXECUTE_BRANCH` is `step.data.EXECUTE_BRANCH`: the feature branch when `branch_prepare` ran, null under `continue`. This gate is a **no-op when `NEW_TAG` is unset** (version step not in `flags.steps`) **or when `EXECUTE_BRANCH` is unset** (`continue` — run in place). Version always runs when in `steps[]` regardless of checkout (tags are repo-global).

### `cleanup` — contract violation (R38)

If the cleanup command's JSON report has `currentRun.valid === false` (contract violation on the normal path), print:

```
PIPELINE CONTRACT VIOLATION
The following steps were not resolved:
  - <step>: status "<status>" (expected: completed, skipped, or failed)

State file preserved for debugging: <path>
This is a pipeline bug — all will_run steps must be dispatched.
```

Do NOT proceed to the success summary. The pipeline did not complete correctly.

### State persistence

State is written by `ship.js` on every `--after` call; manual verbs: `skip`, `fail`, `decide`, `defer`.

---

## Step 6 (REPORT): Pipeline Summary

```
Ship Pipeline Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step  Skill                 Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1     execute-plan-sdlc     [done] 8 tasks, 3 waves completed
2     commit-sdlc           [done] a1b2c3d feat(auth): add OAuth2 PKCE
3     review-sdlc           [done] APPROVED WITH NOTES (2 medium)
4     received-review-sdlc  — not triggered (no critical/high)
5     commit-sdlc (fixes)   — not triggered
6     version-sdlc          — skipped (config default)
7     pr-sdlc               [done] https://github.com/.../pull/42
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Decisions log:
  - Steps resolved: [execute, commit, review, archive-openspec, pr] (from config default; --quality balanced forwarded to execute-plan-sdlc — chosen at execute_tier)
  - Version step skipped (from config default, bump type: patch)
  - Review found 2 medium issues — below threshold, deferred
  - PR created as draft (from --draft flag)

Deferred review findings (2 medium):
  1. [medium] src/middleware/auth.ts:42 — Consider extracting token validation
  2. [medium] src/routes/index.ts:15 — Missing rate limit on new endpoint
  → Run /received-review-sdlc to address these

State file cleaned up: .sdlc/execution/ship-<branch>-<epoch>.json deleted
```

An `execute` row whose summary entry has `source: "user-attested"` is reported as `[done] finished outside the pipeline (user-attested)`.

If OpenSpec was detected in Step 1f and the `verify-openspec` step ran, append the verdict result:
  `→ OpenSpec verify: <satisfied|unsatisfied> — <summary>`
  (When unsatisfied and gaps were opened-as-finding or recorded, note: `N gap(s) recorded as pipeline findings.`)

If OpenSpec was detected but `verify-openspec` is NOT in `flags.steps` (step was not configured), append:
  `→ Run openspec validate --strict <change> to validate implementation completeness against the spec`

If OpenSpec was detected in Step 1f and the archive-openspec step ran successfully, append:
  `→ OpenSpec change "<name>" archived and committed.`

If OpenSpec was detected but `archive-openspec` is NOT in `flags.steps`, append:
  `→ Run openspec archive <change> --yes to archive the OpenSpec change and sync delta specs`

---

## Reference — Error Recovery, DO NOT, Gotchas, Learning Capture

Reference material lives in `./reference.md` (implements R-progressive-disclosure). Read the relevant section on its trigger; do not read preemptively:

- **On any pipeline-level failure** → Read `./reference.md` (Error Recovery section) for the detect → diagnose → recover → escalate flow and the resume-instruction format.
- **Before completing the pipeline (Learning Capture)** → Read `./reference.md` (Learning Capture section) to append pipeline learnings to `.sdlc/learnings/log.md`. This is triggered by the `learnings-commit` step (see the `learnings_commit` section of `./reference.md`).
- **When unsure about a prohibited action or an edge-case behavior** → Read `./reference.md` (DO NOT and Gotchas sections).

---

## What's Next

After the pipeline completes, common follow-ups include:
- `/received-review-sdlc` — address deferred medium/low findings
- `openspec validate --strict <change>` — validate implementation against OpenSpec (only suggest when `verify-openspec ∉ flags.steps`; when the step ran, the result is already in REPORT)
- `openspec archive <change> --yes` — archive the OpenSpec change and sync delta specs (only suggest when `archive-openspec ∉ flags.steps`)

---

## See Also

- [`/execute-plan-sdlc`](../execute-plan-sdlc/SKILL.md) — plan execution with wave-based dispatch
- [`/commit-sdlc`](../commit-sdlc/SKILL.md) — smart commit with style detection
- [`/review-sdlc`](../review-sdlc/SKILL.md) — multi-dimension code review
- [`/received-review-sdlc`](../received-review-sdlc/SKILL.md) — process and fix review findings
- [`/version-sdlc`](../version-sdlc/SKILL.md) — semantic versioning and release tags
- [`/pr-sdlc`](../pr-sdlc/SKILL.md) — pull request creation
