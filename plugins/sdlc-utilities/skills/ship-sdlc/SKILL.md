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

The `execute.commitWaves` field (Fixes #392 / R35) controls per-wave WIP commits during the execute step. Default `false`. When set to `true` in ship config, `--commit-waves` is appended to the execute step's invocation; the execute-plan-sdlc skill then runs `git add -A && git commit -m "wip(execute): wave N — <titles>"` after each wave's G9 + G11 pass. The subsequent commit step (commit-sdlc) detects the `wip(execute):` commits since fork-point and squashes them via soft-reset into the final feature commit, so the user-facing PR history is unchanged. Resolution is centralized in `scripts/skill/ship.js` (per `scripts-over-llm-logic` and `flag-coherence-cross-skill` guardrails) — SKILL.md cites `step.invocation`, never raw `config.execute.commitWaves`.
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

**Context-heaviness advisory (implements R35):** If the parsed output's top-level `contextAdvisory` field is a non-empty string, print it verbatim before continuing. The advisory recommends `/compact` and notes that pipeline state is preserved across compaction (PreCompact + SessionStart hooks). Sourced from `$TMPDIR/sdlc-context-stats.json`, written by the `UserPromptSubmit` hook (`hooks/context-stats.js`); helper at `scripts/lib/context-advisory.js`. When `contextAdvisory` is `null`, emit nothing.

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

Note: the banner check gates on `flags.implicitResume`, NOT `flags.resume`. The prepare script auto-sets `flags.resume = true` when `flags.implicitResume === true` so the rest of the pipeline (e.g. Step 5's execute resume forwarding) sees a unified `flags.resume` regardless of whether the user typed `--resume` or the hook triggered it.

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
| 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` if user passed `--quality` to ship | no |
| 2 | commit-sdlc | will_run | `--auto` | no |
| 3 | review-sdlc | will_run | `--committed` | no |
| 4 | received-review-sdlc | conditional | (if crit/high) | YES |
| 5 | commit-sdlc (fixes) | conditional | `--auto` | no |
| 6 | version-sdlc | skipped | — | — |
| 7 | pr-sdlc | will_run | `--auto --draft` | no |
| 7a | verify-pipeline (inline, opt-in) | conditional on `'verify-pipeline' ∈ flags.steps` | `--timeout <N> --interval <N>` | YES on failure (interactive) |
| 7b | await-remote-review (inline, opt-in) | conditional on `'await-remote-review' ∈ flags.steps` | `--timeout <N> --interval <N> --reviewers <csv>` | no |
| 8 | learnings-commit | will_run | (none — inline shell, see "After pr — learnings-commit" below) | no |

### --auto Mode Audit

Not all sub-skills support `--auto`. This table is the source of truth:

| Sub-skill | --auto support | Behavior when ship runs with --auto |
|-----------|---------------|--------------------------------------|
| execute-plan-sdlc | No | Forwards `--quality <X>` only when the user explicitly passed `--quality` to ship; otherwise no quality flag is forwarded and execute-plan-sdlc applies its own selection logic. (Renamed from `--preset` in #190 to disambiguate from ship's step-selection semantics.) |
| commit-sdlc | Yes | `--auto` forwarded. Skips commit approval prompt. |
| review-sdlc | No | No interactive prompts to skip — runs fully automatically already. |
| received-review-sdlc | Yes | `--auto` forwarded. Skips Step 10 consent prompt and Step 12 reply/resolve prompt. Critique gates and verification still run. Only "will fix" items auto-implemented; threads for "will fix" items auto-resolved. |
| version-sdlc | Yes | `--auto` forwarded. Skips release plan approval prompt. Pre-condition checks and critique gates still run. |
| pr-sdlc | Yes | `--auto` forwarded. Skips PR approval prompt. |

### Review verdict conditional logic

After review-sdlc completes, parse the conversation for a `Verdict:` line. The verdict label (`CHANGES REQUESTED` / `APPROVED WITH NOTES` / `APPROVED`) is **display-only** — it is included in the run banner but does NOT gate dispatch. Dispatch is gated exclusively by `flags.reviewThreshold` (resolved by `scripts/skill/ship.js`):

| `flags.reviewThreshold` | Dispatch received-review-sdlc when findings include …            |
|-------------------------|-------------------------------------------------------------------|
| `critical`              | any critical                                                      |
| `high`                  | any critical OR high                                              |
| `medium`                | any critical OR high OR medium                                    |
| `low`                   | any finding except `info`                                         |

If the threshold is met → invoke received-review-sdlc (forward `"--auto"` when `flags.auto`).
Otherwise → collect findings and defer to the pipeline summary report.

Example run-banner line (display-only — do NOT control dispatch):
```
Review verdict: CHANGES REQUESTED (1 critical, 2 high)
```

In `--auto` mode, dispatch is automatic and `received-review-sdlc --auto` is forwarded — no interactive pause.

In `--auto` mode NEVER call `AskUserQuestion` at this boundary — auto-dispatch `received-review-sdlc --auto` on the documented default. This is enforced deterministically by the `block-askuserquestion-auto.js` PreToolUse hook (R71) — the mid-turn sibling of the R67/R68 turn-end continuation hooks.

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

Display the pipeline table, then:

Use AskUserQuestion to ask:
> Run this pipeline?

Options:
- **yes** — execute as shown
- **edit** — change steps, flags, or other config
- **cancel** — stop here

On **edit**: ask what to change, update flags, rebuild the pipeline table, and re-present. Loop until `yes` or `cancel`.

---

## Step 5 (EXECUTE): Run Pipeline Steps Sequentially

### Pre-step validation

Before dispatching each step, read its `status` from the skill/ship.js output:
1. `"will_run"` → dispatch via Agent tool. Inline-executed steps (`skill === null`, `dispatchMode: null`) are not dispatched via a tool — they are handled directly in main context (either as Bash commands or as conditional logic such as parsing a JSON verdict, as specified per-step). This is non-negotiable.
2. `"conditional"` → evaluate the runtime condition (e.g., review verdict). If condition met → dispatch via Agent tool. If not → print why with the specific condition that was not met.
3. `"skipped"` → print "skipped" with the `reason` and `skipSource` from the script output.

A step with `status: "will_run"` MUST be dispatched per its `dispatchMode`. The LLM does not have authority to override `dispatchMode` or skip a `will_run` step. Printing a skip message for a "will_run" step is a pipeline violation.

### Context budget — dispatch isolation

All sub-skills are Agent-dispatched for context isolation: each Agent loads its SKILL.md in its own context and returns only a structured result (5–10 lines). The ship pipeline's context receives structured data, not sub-skill definitions.

`execute-plan-sdlc` is the orchestrator and returns a Step-9-formatted result (waves completed, files modified, state file path) for ship's main-context loop to consume. Agent dispatch restores pipeline continuity by returning control to ship-sdlc after execute completes, enabling R37 branch migration, the staging window, and remaining steps. (Fixes #366.)

### Dispatch protocol

**Invocation source:** Each step in the skill/ship.js output includes an `invocation` field containing the skill name and computed args. Use `step.invocation` verbatim — do not construct invocations from the examples below.

For each step that will run, apply the dispatch protocol based on `step.dispatchMode`:

---

#### When `step.dispatchMode === 'agent'` — Agent-tool dispatch (all sub-skills)

1. **Print verbose progress header** to user:
   ```
   ━━━ Ship Pipeline — Step 2/7: Commit ━━━
     Skill: commit-sdlc
     Args: --auto
     Reason: --auto forwarded from ship --auto mode
   ```

2. **Record step start** via `state/ship.js begin-step` (R70) — see the per-step transition block in "Main-thread TodoWrite orchestration" below; `begin-step` records `in_progress` and renders the task-tray todos in one call.

   > **Do NOT end the response turn here (R70/#454).** Once `begin-step` has marked the step `in_progress`, the turn MUST continue directly into the Agent dispatch in step 3 — recording the step start and dispatching its Agent are a single uninterrupted sequence. A turn that ends after `begin-step` but before the Agent dispatch leaves the step stranded `in_progress` and requires a user message to resume (the recurrence of #452 / #454 that the `stop-pipeline-continue.js` Stop hook now guards against mode-independently). Immediately proceed to step 3.

3. **Dispatch Agent** with: skill name, args from `step.invocation`, model from `step.model`, and brief pipeline context (branch, previous step results needed for this step). Pass `model: step.model` to the Agent tool on every dispatch. When `step.isolation` is non-null, additionally pass `isolation: step.isolation`; when `step.isolation` is null, omit the `isolation` parameter entirely (the Agent tool schema does not accept `null` for `isolation`). The LLM must not add, remove, or change the `isolation` parameter from what `ship.js` computed (implements R-agent-isolation-script-driven, C15). Agent prompt template:
   ```
   You are executing the <skill-name> skill. Invoke `/<skill-name> <args>` using the Skill tool — this loads the SKILL.md automatically. Return a structured result:
   (1) status — success or failure
   (2) result summary — 2-3 lines
   (3) artifacts — commit hash, tag, PR URL, verdict, etc.
   (4) any warnings or issues encountered
   ```

4. **Receive agent result.** Print result to user:
   ```
     [done] Step 2 complete: a1b2c3d feat(auth): add OAuth2 PKCE flow
     State saved to .sdlc/execution/ship-<branch>-<timestamp>.json
   ```

5. **Record step completion/failure** via `state/ship.js complete-step` (R70) — see the per-step completion block in "Main-thread TodoWrite orchestration" below; `complete-step` records `completed` and renders the task-tray todos in one call. Failures still use `state/ship.js fail` + the ship-todos `--fail-step` render.

6. **Use result to determine next step** (e.g., review verdict → received-review decision) — flow decisions read the agent's *result*, and step *completion status* is recorded via the same channel: the dispatched agent's reported outcome is forwarded to `complete-step --outcome` (R-b2). For most steps this IS the agent's self-report, taken as given. The `version` step is the exception — completion there is objectively verified against the actual release-tag side-effect via `verify-side-effect` before the reported outcome is trusted (R-b3, F-ship-step-status-integrity-guard-8) — see the per-step completion block below. Print decision reasoning:
   ```
     Review verdict: APPROVED WITH NOTES (2 medium)
     Decision: CONTINUING — no critical/high issues found
   ```

> **`--auto` continuation (R67/R68/R70 — descriptive, not a competing imperative):** In `--auto` mode the pipeline advances to the next step's `begin-step` within the same response turn. This is reinforced by two hooks consuming the shared `pipelineAdvancing` predicate (`lib/state.js`): the `pipeline-continue.js` PostToolUse hook (R67) emits forward `additionalContext` between steps, and the `stop-pipeline-continue.js` Stop hook (R68) returns `decision: "block"` so the turn does not end mid-pipeline. Both are `flags.auto`-gated for the between-steps case — interactive (non-`auto`) review between steps is preserved. The `begin-step` → `complete-step` sequence (R70) is unchanged.

> **`--auto` mid-turn no-pause (R71 — descriptive, not a competing imperative; mid-turn sibling of R67/R68 — #477):** In `--auto` mode (`flags.auto === true`) the pipeline must auto-dispatch the fix at the review→fix boundary and MUST NOT call `AskUserQuestion`. This is enforced deterministically by the `block-askuserquestion-auto.js` PreToolUse hook, which returns `permissionDecision: "deny"` while an active ship pipeline is advancing with `flags.auto === true`. Where the `stop-pipeline-continue.js` Stop hook (R68) guards the turn-*ending* hole, this guards the mid-turn *pause-for-input* hole. Interactive (non-`auto`) review pauses are preserved.

---

Ship-sdlc retains full control of: pipeline table display, validation output, step progress headers, result formatting, state persistence messages, verdict-based flow decisions, and the final summary report. Sub-skills only execute their skill and return structured data — they do not print pipeline-level output.

### Main-thread TodoWrite orchestration (R-todowrite-visibility, #427)

ship-sdlc surfaces live pipeline progress in the Claude Code task tray via main-thread `TodoWrite` calls. All derivation logic lives in `scripts/lib/ship-todos.js` (R-todowrite-visibility clause 11). The MAIN thread invokes the helper via Bash and passes the returned `todos[]` array to the `TodoWrite` tool. The helper's `marker` field is echoed verbatim to stdout (audit trail when the tray is hidden).

**Helper resolution (run once at Step 5 entry):**

```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
SHIP_TODOS="<PLUGIN_ROOT>/scripts/lib/ship-todos.js"
STATE_SCRIPT="<PLUGIN_ROOT>/scripts/state/ship.js"
```

**Setup (one-time, BEFORE the Step 5 dispatch loop, only when `flags.steps.length >= 2`):**

1. Run: `node "$SHIP_TODOS" --state-file "$STATE_FILE" --event init` (where `$STATE_FILE` is the resolved ship state file path from Step 1c output).
2. Parse JSON from stdout. Call `TodoWrite` with `todos` array.
3. Echo `marker` verbatim to stdout.

For ultra-short runs (`flags.steps.length < 2`), skip TodoWrite entirely.

**Per-step transition + start (called at start of EACH Step 5 iteration, BEFORE the verbose progress header) — R69/R70:**

`begin-step` atomically marks the step `in_progress` (the former `state/ship.js start`) AND renders the task-tray todos (the former `ship-todos --event step`) in a single call, replacing the two prior separate invocations.

1. Run: `node "$STATE_SCRIPT" begin-step --step <stepName> --state-file "$STATE_FILE"`.
2. Parse JSON from stdout → call `TodoWrite` with the `todos` array, echo `marker`.

**Per-step completion (called AFTER the Agent return and result print) — R69/R70:**

`complete-step` atomically marks the step `completed` (the former `state/ship.js complete`) AND renders the task-tray todos (the former `ship-todos --event step --mark-completed`) in a single call. Persisting completion and rendering happen in-process, so the ordering constraint that previously required two separate ordered calls is now internal to the subcommand.

Completion status is recorded via `--outcome` (R-b2/R-b3, docs/specs/ship-sdlc.md). For the `version` step, the recorded status is objectively verified against what actually happened (R-b3) rather than trusted from the agent's self-report; for other dispatched steps, the recorded status IS the agent's reported outcome, forwarded as-is (R-b2):

1. Derive `OUTCOME` for the dispatched agent step from the Agent return (Step 4): `success` when the agent reported success, `failure` otherwise (R-b2). Inline steps (`skill: null`, e.g. `verify-openspec`, `learnings-commit`) have no agent report — omit `--outcome` and let `complete-step` record `completed`.
   - **Version-step side-effect gate (R-b3, issue #478):** For the `version` step ONLY, do NOT trust the self-report. FIRST capture `NEW_TAG` from the version-sdlc agent return (the release tag is a declared artifact of the Step 4 result; empty when version-sdlc produced no tag) — this is the single capture point for `NEW_TAG`, reused unchanged by the "After version" ancestry gate below. THEN run the objective check and force `OUTCOME=failure` when the release tag did not land:
     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     # NEW_TAG MUST already be captured from the version-sdlc return before this line.
     SIDE_EFFECT=$(node "<PLUGIN_ROOT>/scripts/skill/ship.js" verify-side-effect --step version --expected "$NEW_TAG")
     # SIDE_EFFECT is JSON: { step, sideEffect: "tag", landed: true|false, expected }.
     # landed:false (exit 1) ⇒ no release tag was produced (NEW_TAG empty, or the
     # tag is absent from the active worktree's tag list) ⇒ OUTCOME=failure, so
     # complete-step routes version to `failed` and never `completed`.
     ```
   - **Extension point (pr / commit):** the same `verify-side-effect` pattern applies to other steps with objective side-effects (`pr` → PR URL, `commit` → HEAD commit), but only `version` has a defined side-effect in `ship.js` (`STEP_SIDE_EFFECTS`) today — not wired.
2. Run: `node "$STATE_SCRIPT" complete-step --step <stepName> --state-file "$STATE_FILE" --result "<summary>"` — append `--outcome "$OUTCOME"` for dispatched agent steps. For dispatched agent steps also pass `--usage '<json>'` with the token counts the Agent return reports for that dispatch (`{"inputTokens":N,"outputTokens":N,"cacheReadTokens":N,"cacheWriteTokens":N,"model":"…","effort":"…"}`). If the harness does not expose usage in the Agent return, pass `--usage '{"source":"unavailable"}'`. Never estimate token counts: an unmeasured figure makes every before/after comparison misleading.
3. Parse JSON from stdout → call `TodoWrite` with the `todos` array, echo `marker`.

**Per-step failure (called when `state/ship.js fail` records a failure):**

1. Run: `node "$SHIP_TODOS" --state-file "$STATE_FILE" --event step --current-step <stepName> --fail-step <stepName>`.
2. Parse JSON, call `TodoWrite`, echo `marker`.
3. No todo lingers in_progress (helper enforces — AC4).

**Resume reconstruction (called inside the existing implicit-resume banner block, BEFORE the pipeline table prints, when `flags.resume === true`):**

1. Run: `node "$SHIP_TODOS" --state-file "$STATE_FILE" --event resume --current-step <resume.nextPendingStep>`.
2. Parse JSON, call `TodoWrite`, echo `marker`.

`flags.resume === true` is the single gate (the prepare script unifies explicit `--resume` and `flags.implicitResume`; this matches the existing implicit-resume banner condition and satisfies `no-opposite-logical-vectors`).

**Cross-skill note:** `execute-plan-sdlc`'s internal per-wave `TodoWrite` calls remain (Agent-context bookkeeping). They are NOT parent-visible — see `execute-plan-sdlc/SKILL.md` Progress signal section and `R-todowrite-visibility`, issue #427.

### Pre-execute workspace auto-detection (R60, R37 — fixes #378, #379)

Workspace is **auto-detected**, not selected — there is no flag and no prompt. The prepare script (`ship.js`) emits the derived value as `flags.workspace` (R60; the `context` object carries no `workspace` field — reading `context.workspace` was the #451 regression):

- **`branch`** — cwd is the main worktree AND HEAD is the default branch. ship-sdlc auto-creates a feature branch before dispatching execute.
- **`continue`** — a linked worktree, OR the main worktree already on a feature branch. ship-sdlc runs the pipeline in place; no branch is created.

The default-branch warning emitted by the prepare script is **advisory** (a preflight warning, not a halt): on the default branch the derive returns `branch` and a feature branch is auto-created, so the warning never strands a run.

**Skip when resuming** (`flags.resume === true`) — the resume block already handled the workspace.

When not resuming, consume the derived workspace and act:

```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
SDLC_LIB="<PLUGIN_ROOT>/scripts/lib"

# Read the derived workspace from flags.workspace (R60, #451) — NOT context.workspace (no such field).
WORKSPACE=$(F="$PREPARE_OUTPUT_FILE" node -e "const d=JSON.parse(require('fs').readFileSync(process.env.F,'utf8'));process.stdout.write((d.flags&&d.flags.workspace)||'continue')")

if [ "$WORKSPACE" = "branch" ]; then
  # Step 1: Derive branch name from plan title via lib/branch-name.js (config-driven).
  EXECUTE_BRANCH=$(node -e "
    const {resolveBranchName}=require('$SDLC_LIB/branch-name');
    const {readSection,resolveSdlcRoot}=require('$SDLC_LIB/config');
    const cfg=(readSection(resolveSdlcRoot(),'workspace')||{}).branch||{};
    // Logical type and slug derived from plan title (feature/bugfix/chore/docs/refactor).
    // typeMap in config maps logical → branch prefix (defaults: feat/fix/chore/docs/refactor).
    process.stdout.write(resolveBranchName({type:'<logical-type>',slug:'<derived-slug>',config:cfg}));
  ")

  # Step 2: Pre-execute ship state migration (R37) — runs in the main worktree cwd,
  # BEFORE branch creation, so `state/ship.js read` still resolves the OLD slug filename.
  # state/ship.js is referenced by its <PLUGIN_ROOT> injected-path form below.
  STATE_BRANCH=$(node "<PLUGIN_ROOT>/scripts/state/ship.js" read 2>/dev/null | node -e "process.stdin.on('data',d=>{try{process.stdout.write(JSON.parse(d).branch||'')}catch(_){}})")
  if [ -n "$STATE_BRANCH" ] && [ "$EXECUTE_BRANCH" != "$STATE_BRANCH" ]; then
    FROM_SLUG=$(echo "$STATE_BRANCH" | sed 's|[^a-zA-Z0-9-]|-|g')
    result=$(node "<PLUGIN_ROOT>/scripts/state/ship.js" migrate --from "$FROM_SLUG" --to "$EXECUTE_BRANCH" 2>&1)
    echo "State migrated: $FROM_SLUG → $EXECUTE_BRANCH"
  fi

  # Step 3: Create the feature branch (HEAD shared with main worktree).
  git checkout -b "$EXECUTE_BRANCH"

  # Step 4 (R-expected-branch-branch-derive, fixes #526): the prepare step computed
  # --expected-branch from the PRE-CHECKOUT branch (it ran before EXECUTE_BRANCH existed —
  # ship.js cannot predict a plan-title-derived branch name ahead of time). Patch the
  # already-written prepare-output file in place so every later re-read (commit,
  # commit-fixes, version, pr all re-read step.args/step.invocation from this same file,
  # same pattern as the context.planFile read below) sees the real feature branch instead
  # of the stale one. This is a one-time file patch, not a per-dispatch substitution, and
  # not a live `git branch --show-current` re-query (that would make the guard tautological
  # and defeat the branch-drift protection from #347/#348/#349).
  node -e "
    const fs = require('fs');
    const f = process.env.F, branch = process.env.B;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const pattern = /--expected-branch \S+/g;
    for (const step of d.steps || []) {
      if (typeof step.args === 'string') step.args = step.args.replace(pattern, '--expected-branch ' + branch);
      if (typeof step.invocation === 'string') step.invocation = step.invocation.replace(pattern, '--expected-branch ' + branch);
    }
    if (d.context) d.context.expectedBranch = branch;
    fs.writeFileSync(f, JSON.stringify(d, null, 2));
  " F="$PREPARE_OUTPUT_FILE" B="$EXECUTE_BRANCH"
fi
# When WORKSPACE = continue: EXECUTE_BRANCH stays unset, no migration, no checkout, no
# --expected-branch patch — prepare's pre-checkout value is already correct (no branch change).
```

After `git checkout -b` the cwd is the main worktree on the new feature branch, so all subsequent Bash invocations and Agent-tool dispatches run in the current cwd trivially. There is **no `--branch` forward to execute** — by the time execute is dispatched, cwd is on the feature branch, so execute-plan-sdlc's own derive yields `continue` (run in place) and no value crosses the boundary. `EXECUTE_BRANCH` is still used by the post-version ancestry gate (see "Execute step" / version section); under `continue` it is unset and that gate is a no-op.

**Display vs. dispatch (R-expected-branch-branch-derive):** Step 2's pipeline table is printed before this patch runs and may show the stale pre-checkout `--expected-branch` value for `commit`/`commit-fixes`/`version`/`pr` — that is expected and display-only. Step 5 dispatch for those steps MUST use the patched file (re-read `step.args`/`step.invocation` fresh rather than reusing what was printed in Step 2), so the actual dispatched value is always the real feature branch.

The `migrate` subcommand renames `ship-<oldSlug>-<ts>.json` → `ship-<newSlug>-<ts>.json` and updates `data.branch`. On `migrated: false` (e.g. no state file yet, slug already correct), warn and continue — do not abort; the orphaned file (if any) will be cleaned by the terminal `cleanup` step or by `--gc`.

### Execution loop

**Execute step resume:** When the pipeline is resuming (gate on `flags.resume === true` from the prepare output — this is `true` whether the user typed `--resume` or the hook triggered implicit resume; do NOT re-parse `$ARGUMENTS`) and the execute step's status in the ship state file is `in_progress`:
1. Check for `<main-worktree>/.sdlc/execution/execute-<branch>-*.json` (an execute-plan-sdlc state file for the current branch). Resolve `<main-worktree>` via `git worktree list --porcelain` (first `worktree` line).
2. If found, dispatch execute-plan-sdlc via the Agent tool with args from `step.invocation` plus `--resume` (e.g. `"--plan \"<path>\" --quality <X> --resume"` if the user passed `--quality` to ship; `"--plan \"<path>\" --resume"` otherwise — `<path>` is `context.planFile`, R-PLANFILE; `step.invocation` already carries it, so it is never omitted from a resume dispatch). Wave progress and gates run inside the Agent's sub-context; the structured return value drives the next step. (Implements R-implicit-resume — `flags.resume` is the single resume signal regardless of source.)
3. If not found, dispatch via Agent tool normally using `step.invocation` (execute restarts from scratch)

ship-sdlc does not manage execute-plan-sdlc's state file — execute-plan-sdlc handles its own creation, updates, and cleanup.

**Worktree re-entry on resume:** Check `context.worktree.inLinkedWorktree` from the skill/ship.js output. If true, already in the worktree — proceed normally.

If false (resuming from the main worktree but the pipeline originally ran in a worktree), find the worktree for the resume branch:
```bash
git worktree list --porcelain
```
Match the branch from the ship state file against worktree entries. If found and directory exists, `cd <path>` before continuing. If the worktree directory is gone, warn and fall back to running on the current branch.

**Execute-step todo mirroring (R-todowrite-visibility clause 4):**

Assign `PLAN_FILE` from the prepare output's `context.planFile` field (R-PLANFILE). Resolution is explicit-only (implements R72): `skill/ship.js` resolves the plan solely from the CLI `--plan <path>` flag — there is no config-driven or directory-scan fallback. A missing, nonexistent, or non-markdown `--plan` is rejected in Step 1c (`missingPlanFile` / `planFileNotFound` / `planFileNotMarkdown`) before this point is ever reached. Do not re-derive the path here — use `context.planFile` verbatim:

```bash
PLAN_FILE=$(node -e "const d=require('fs').readFileSync(process.env.F,'utf8'); process.stdout.write(JSON.parse(d).context.planFile||'')" F="$PREPARE_OUTPUT_FILE")
PLAN_FILE_EXIT=$?
if [ "$PLAN_FILE_EXIT" -ne 0 ]; then
  echo "ERROR: failed to read context.planFile from prepare output ($PREPARE_OUTPUT_FILE)." >&2
  exit "$PLAN_FILE_EXIT"
fi
```

Where `$PREPARE_OUTPUT_FILE` is the path to the temp file holding the `skill/ship.js` JSON output (same file used to read `flags`, `steps`, etc. — set in Step 1c). When `context.planFile` is null or empty, `PLAN_FILE` will be empty and the `ship-todos.js` execute event will exit 2 with a clear error — surface that error before dispatching.

Before dispatching `execute-plan-sdlc`, run:

```bash
node "$SHIP_TODOS" --state-file "$STATE_FILE" --plan "$PLAN_FILE" --event execute --current-step execute
```

`$PLAN_FILE` is sourced from `context.planFile` in the prepare output (R-PLANFILE). The helper expands the `execute` step's placeholder substep to one substep per plan task (one `### Task N:` heading per substep). Parse JSON, call `TodoWrite`, echo `marker`.

Then dispatch `execute-plan-sdlc` as below. On Agent return (success), run the post-execution completeness invariant **before** marking the step complete (R-INVARIANT-COMPLETENESS, #432):

```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
EXECUTE_STATE_SCRIPT="<PLUGIN_ROOT>/scripts/state/execute.js"
[ -f "$EXECUTE_STATE_SCRIPT" ] || { echo "ERROR: Cannot locate execute.js — completeness gate cannot run." >&2; exit 2; }
node "$EXECUTE_STATE_SCRIPT" verify-completeness
COMPLETENESS_EXIT=$?
if [ "$COMPLETENESS_EXIT" -ne 0 ]; then
  echo "ERROR: execute-plan-sdlc returned but planned tasks are unaccounted. Pipeline halted." >&2
  # Mark execute step failed and halt — do NOT advance to commit/review/version/pr
  node "$SHIP_TODOS" --state-file "$STATE_FILE" --plan "$PLAN_FILE" --event execute --fail-step execute
  exit "$COMPLETENESS_EXIT"
fi
```

If `verify-completeness` exits 65, the pipeline MUST halt before commit. The missing task IDs appear on stderr as JSON `{missingIds, totalPlanned, totalAccounted}`. Do NOT advance to the commit step.

Then run per-step-completion: `--mark-completed execute`. The parent does NOT receive per-task completion signals from the Agent; per-task todos all transition to `completed` atomically on return.

Example dispatch sequence (use `step.invocation` for actual args):
- Agent: execute-plan-sdlc, args: from `step.invocation` verbatim, which already includes `--plan "<path>"` (`<path>` = `context.planFile`, R-PLANFILE — `step.invocation` is computed by `skill/ship.js`, not assembled by hand here). **No `--branch` forward** (R60, fixes #378, #379): when the derive was `branch`, ship already ran `git checkout -b` before this dispatch, so cwd is on the feature branch and execute-plan-sdlc's own derive yields `continue` (run in place). When the derive was `continue`, ship never created a branch — execute also runs in place. Either way no workspace value crosses the boundary. Example: `"--plan \"docs/plans/foo.md\" --quality balanced --rebase auto"`.
- Agent: commit-sdlc, args: `"--auto"`
- Agent: review-sdlc, args: `"--committed"`
- Agent: received-review-sdlc, args: `"--auto"` (when `flags.auto`; otherwise no args)
- Agent: version-sdlc, args: `"patch"`
- Agent: pr-sdlc, args: `"--auto --draft"`

### Post-execute note (R37 migration moved pre-execute)

Branch migration (R37) now runs **before** the execute dispatch — inside the pre-execute workspace isolation block (see "Pre-execute workspace isolation" section above). The old post-execute migration block has been removed (fixes #379 — it ran after cwd changed, so `git branch --show-current` always returned the wrong value).

Subsequent state operations (`start`, `complete`, `read`) automatically pick up the renamed file because `state/ship.js` resolves by current branch.

### Between execute and commit

execute-plan-sdlc does not stage files. Run `git add -A -- ':!.sdlc/'` with verbose output:
```
Staging changes from execution:
  A  src/middleware/auth.ts
  A  src/middleware/auth.test.ts
  M  src/routes/index.ts
  Total: 14 files staged
  Reason: execute-plan-sdlc creates files but does not stage them. .sdlc/ excluded to prevent committing runtime state.
```

### Between review and received-review

Evaluate the verdict (see Step 2 conditional logic). Print the decision tree. If received-review-sdlc triggers and makes changes, check `git status`:
```
Review fixes applied: 3 files modified
  M  src/middleware/auth.ts
  M  src/routes/index.ts
  M  tests/auth.test.ts
  → Running commit step for review fixes
```
Then invoke commit-sdlc (step 5) for the fix commit.

### After version — post-version ancestry HARD GATE (R-post-version-ancestry, fixes #349)

Reuse `NEW_TAG` — the tag already captured at version-step completion from the version-sdlc return (see the per-step completion block's version-step side-effect gate; it is the single capture point). When `NEW_TAG` is set (non-empty) AND `EXECUTE_BRANCH` is set (non-empty), run the ancestry check:

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

`NEW_TAG` is the tag string emitted by version-sdlc (e.g. `v1.2.3`). `EXECUTE_BRANCH` is the feature branch variable set during pre-execute workspace auto-detection when the derive was `branch` (already available in the pipeline shell context; unset when the derive was `continue`). This gate is a **no-op when `NEW_TAG` is unset** (version step not in `flags.steps`) **or when `EXECUTE_BRANCH` is unset** (`continue` — run in place). Version always runs when in `steps[]` regardless of checkout (tags are repo-global).

### Between version and archive-openspec — verify-openspec (inline, opt-in)

If `step.status === 'will_run'` for the `verify-openspec` step (sourced from prepare output — NOT from `$ARGUMENTS`; implements R-verify-openspec-1..5):

1. Extract the change name from `step.args` by stripping the `--change ` prefix (the value after `--change` is the first whitespace-delimited token following it):
   ```bash
   CHANGE_NAME="${step.args#--change }"
   CHANGE_NAME="${CHANGE_NAME%% *}"
   ```
   (`step.args` is sourced from the prepare output, e.g. `--change my-feature` or `--change my-feature --auto`.)

2. Locate the openspec library:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js"
   ```

3. Run structural validation (synchronous call — no `.then`). Pass values via environment to avoid shell injection; keep stdout clean (no `2>&1`):
   ```bash
   RESULT=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     const r = lib.validateChangeStrict(process.cwd(), process.env.CHANGE_NAME);
     process.stdout.write(JSON.stringify({ok:r.ok,cliAvailable:r.cliAvailable,stderr:r.stderr||""}));
   ')
   NODE_EXIT=$?
   [ "$NODE_EXIT" -ne 0 ] && { echo "ERROR: openspec validation script exited $NODE_EXIT" >&2; }
   ```

4. Parse the JSON result from `$RESULT` and branch on verdict:
   - `cliAvailable: false` → log `openspec CLI not available, skipping validate` → proceed to archive-openspec (non-blocking).
   - `ok: true` → log `openspec validate --strict: passed` → proceed to archive-openspec.
   - `ok: false` AND `cliAvailable: true` → log `stderr` → note structural issues → proceed to archive-openspec (non-blocking per KD2).

When `step.status !== 'will_run'` (skipped — not in steps[] or no matched change), skip this entire section.

### Between version and pr — archive-openspec (conditional)

If the `archive-openspec` step has `status: "conditional"` in the pipeline plan, execute it inline (no Agent dispatch — this is a deterministic shell/script operation):

1. **Extract the change name** from `step.args` (`--change <name>`), same extraction pattern as `verify-openspec` above:
   ```bash
   CHANGE_NAME="${step.args#--change }"
   CHANGE_NAME="${CHANGE_NAME%% *}"
   ```
2. **Locate the openspec library:**
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js"
   ```
3. **Idempotence check — before any I/O, prompting, or mutation.** If `isArchived(projectRoot, "$CHANGE_NAME")` already returns `true`, stop here and record the result with reason "already archived"; do NOT proceed to the task-completeness read below.
   ```bash
   IS_ARCHIVED=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     process.stdout.write(String(lib.isArchived(process.cwd(), process.env.CHANGE_NAME)));
   ')
   [ $? -eq 0 ] || { echo "archive-openspec: isArchived check failed" >&2; exit 1; }
   ```
4. **Fresh task-completeness read (R-archive-sync-2).** Do NOT reuse `openspecContext.tasksDone`/`tasksTotal` from the prepare output — those are a prepare-time snapshot and can be stale by the time this step runs (e.g. `execute` marks tasks done after prepare ran). Call the guarded `getTaskCounts(projectRoot, changeName)` helper in `lib/openspec.js` — it validates `changeName` against path traversal and distinguishes a missing `tasks.md` (`error: null`, zero counts) from a real read/parse failure (`error: <code>`). Pass values through environment variables — never interpolate them into the script string:
   ```bash
   TASKS_JSON=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     const r = lib.getTaskCounts(process.cwd(), process.env.CHANGE_NAME);
     process.stdout.write(JSON.stringify(r));
   ')
   [ $? -eq 0 ] && [ -n "$TASKS_JSON" ] || { echo "archive-openspec: task-completeness read failed" >&2; exit 1; }
   ```
   Parse `$TASKS_JSON` → `tasksDone`, `tasksTotal`, `error`. If `error` is non-null (invalid change name, or a real I/O/parse failure on an existing `tasks.md`), halt the pipeline with that error and preserve state for `--resume` — do NOT treat it as "all done." Only a `null` error (including the ENOENT case, where both counts are `0`) feeds the branch below.

5. **Branch on completeness:**
   - **All done** (`tasksDone === tasksTotal`, including the no-`tasks.md`/zero-task case) — proceed directly to the **validate** step below. No sync prompt here; a separate post-validation approval prompt still applies for this path — see the **archive** step.
   - **Incomplete AND `flags.auto === true`** (R-archive-sync-4) — do NOT call `AskUserQuestion` (per R71). Log a warning naming the incomplete count, e.g. `archive-openspec: 2 task(s) incomplete — proceeding without sync (--auto)`. Proceed to the **validate** step with `tasks.md` unmodified.
   - **Incomplete AND `flags.auto === false`** (R-archive-sync-3) — use `AskUserQuestion`:
     > OpenSpec change "`<name>`" has `<tasksTotal - tasksDone>` incomplete task(s) (`<tasksDone>`/`<tasksTotal>` done).
     >
     > Options: **sync-and-archive** (Recommended) | **archive-anyway** | **abort**
     - **sync-and-archive** → run the **sync** step below, then proceed to the **validate** step.
     - **archive-anyway** → proceed to the **validate** step without modifying `tasks.md`.
     - **abort** → halt the pipeline (exit 1). Do NOT call `complete-step` or `fail` for this step — leave it `in_progress` in the ship state file so `--resume` re-enters `archive-openspec` (R-archive-sync-3; same "state preserved for --resume" semantics as the R45 abort).
     This prompt is the consent gate for the incomplete-task path — the **archive** step's post-validation approval prompt does not fire again for whichever option was chosen here.

6. **Sync (`sync-and-archive` only).** Mark every incomplete task done via `syncIncompleteTasks`, same env-var pattern:
   ```bash
   SYNC_JSON=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     const r = lib.syncIncompleteTasks(process.cwd(), process.env.CHANGE_NAME);
     process.stdout.write(JSON.stringify(r));
   ')
   [ $? -eq 0 ] && [ -n "$SYNC_JSON" ] || { echo "archive-openspec: sync failed" >&2; exit 1; }
   ```
   Parse `$SYNC_JSON` → `{ synced, alreadyDone, failed }`. Log `archive-openspec: synced <synced> task(s) (<alreadyDone> already done)`, plus a warning line naming any `failed` refs. A non-empty `failed` is non-fatal — proceed to the **validate** step regardless (a task ref `syncIncompleteTasks` cannot resolve is a `tasks.md` data issue, not a reason to block the archive).

7. **Validate.** Call `lib/openspec.js::validateChangeStrict(projectRoot, name)` via Bash, same env-var pattern:
   ```bash
   VALIDATE_JSON=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     const r = lib.validateChangeStrict(process.cwd(), process.env.CHANGE_NAME);
     process.stdout.write(JSON.stringify(r));
   ')
   [ $? -eq 0 ] && [ -n "$VALIDATE_JSON" ] || { echo "archive-openspec: validate failed to run" >&2; exit 1; }
   ```
   - **If `ok === false`:** halt the pipeline. Print the validation errors (`stderr`) and save state for `--resume`.
   - **If `ok === true`:** proceed to the **archive** step.

8. **Archive.**
   - **All-done path (from the branch above) AND `flags.auto === false`:** this is the point R25 requires a consent gate — the sync prompt did not fire for this path, so the user has not yet approved the archive. Use `AskUserQuestion`:
     > OpenSpec change "`<name>`" passed validation with all `<tasksTotal>` task(s) already complete. Archive now?
     >
     > Options: **archive** (Recommended) | **abort**
     - **archive** → run the archive below.
     - **abort** → halt the pipeline (exit 1). Leave the step `in_progress` so `--resume` re-enters `archive-openspec`, matching the R-archive-sync-3 abort semantics.
   - **All-done path AND `flags.auto === true`:** no prompt (R71) — proceed directly.
   - **Incomplete path** (`sync-and-archive`, `archive-anyway`, or the `--auto` warn-only case): the earlier prompt (or `--auto` warning) already served as approval — proceed directly, no second prompt.

   Run the archive:
   ```bash
   ARCHIVE_JSON=$(OPENSPEC_LIB="$OPENSPEC_LIB" CHANGE_NAME="$CHANGE_NAME" node -e '
     const lib = require(process.env.OPENSPEC_LIB);
     const r = lib.runArchive(process.cwd(), process.env.CHANGE_NAME);
     process.stdout.write(JSON.stringify(r));
   ')
   [ $? -eq 0 ] && [ -n "$ARCHIVE_JSON" ] || { echo "archive-openspec: archive failed to run" >&2; exit 1; }
   ```

9. **Commit and record.** If archive succeeds, commit — reference `$CHANGE_NAME` in double quotes; do NOT interpolate the change name into a bare `<name>` placeholder (same env-var discipline as the steps above):
   ```bash
   git add openspec/
   git commit -m "chore(openspec): archive $CHANGE_NAME"
   ```
   Record the result via `complete-step --result` using the sync-aware summary matching the path taken (documented in `state-format.md`): `"archived $CHANGE_NAME"` (all tasks were already done), `"archived $CHANGE_NAME (synced N tasks)"` (`sync-and-archive`), or `"archived $CHANGE_NAME, N task(s) left incomplete"` (`archive-anyway`, interactive or `--auto` warn-only).

If the step has `status: "skipped"`, print the skip reason from `step.reason`.

### After pr — verify-pipeline (conditional, opt-in)

If the `verify-pipeline` step has `status: "will_run"` (gated by step membership in `flags.steps` — cite `step.status === "will_run"` from the prepare output, not `$ARGUMENTS`; per `flag-coherence-cross-skill`), execute it inline (no Agent dispatch — this is a deterministic polling script). Implements R41–R49.

1. Resolve the script path:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   VP_SCRIPT="<PLUGIN_ROOT>/scripts/skill/verify-pipeline.js"
   ```
2. Run the script with the args from `step.args` plus `--state-file <ship-state-path>`:
   ```bash
   node "$VP_SCRIPT" $STEP_ARGS --state-file "$SHIP_STATE_PATH"
   ```
3. Parse the single JSON line on stdout. Branch on `status`:

   **`status === "green"`** — log `verify-pipeline: CI green for PR #N` and proceed to `await-remote-review`. Cites R43.

   **`status === "failed"`** AND `flags.auto === false` — interactive (R45). Use `AskUserQuestion`:
   > Wave verify-pipeline failed for PR #N. <X> failed checks: <names>.
   >
   > Options: **analyze** (Recommended) | **skip** | **abort**
   - **analyze**: dispatch `verify-pipeline-sdlc` subagent (Agent tool, model sonnet) with `--pr <N>` and `--logs <inline-log-excerpt-from-failedChecks>`. On verdict `fix-applied`, dispatch `commit-sdlc` (Agent tool, model haiku, `--auto`) directly to commit and push. Then re-run verify-pipeline (loop). Iteration cap = `flags.verifyPipelineMaxIterations` (default 3, R47); after cap, log warning and proceed to `await-remote-review`. The pre-existing `commit-fixes` step entry (already visited before `pr`) is NOT involved — this dispatch is direct via the Agent tool.
   - **skip**: log warning, proceed to `await-remote-review`.
   - **abort**: write `verifyPipelineExhausted: true` to the ship state file, exit pipeline 1.

   **`status === "failed"`** AND `flags.auto === true` — non-interactive (R46). Directly dispatch `verify-pipeline-sdlc` subagent (Agent tool, model sonnet) with `--pr <N> --logs <excerpt> --auto`. On `fix-applied`, dispatch `commit-sdlc --auto` directly. Loop with the same iteration cap (`flags.verifyPipelineMaxIterations`, R47). On cap exhaustion, log warning and proceed.

   **`status === "timeout"`** — log warning `verify-pipeline: timeout after Ns`. The script has already written `verifyPipelineExhausted: true` to the state file. Proceed to `await-remote-review`. Cites R48, R49.

   **`status === "skipped"`** (resume short-circuit) — log info `verify-pipeline: skipped (resumed from prior exhaustion)`. Proceed. Cites R49.

   **`status === "error"`** — log warning `verify-pipeline: error — <reason>`. Proceed.

Do NOT replicate polling, log fetching, or fix-application logic in this prose — those live in `verify-pipeline.js` and the `verify-pipeline-sdlc` skill (per `scripts-over-llm-logic`).

If the step has `status: "skipped"`, print the skip reason from `step.reason` and do nothing.

### After verify-pipeline — await-remote-review (conditional, opt-in)

If the `await-remote-review` step has `status: "will_run"` (gated by step membership in `flags.steps` — cite `step.status === "will_run"` from the prepare output, not `$ARGUMENTS`), execute it inline. Implements R50–R56.

1. Resolve the script path:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   AR_SCRIPT="<PLUGIN_ROOT>/scripts/skill/await-remote-review.js"
   ```
2. Run the script with the args from `step.args` plus `--state-file <ship-state-path>`:
   ```bash
   node "$AR_SCRIPT" $STEP_ARGS --state-file "$SHIP_STATE_PATH"
   ```
3. Parse the single JSON line on stdout. Branch on `status`:

   **`status === "actionable"`** — directly dispatch `received-review-sdlc` (Agent tool, model sonnet) with `--pr <verdict.prNumber>` (and `--auto` when `flags.auto === true`). After the subagent completes, run `git status --porcelain` in the main context; if there are working-tree changes, directly dispatch `commit-sdlc` (Agent tool, model haiku, `--auto`) to commit and push. The pre-existing `received-review` and `commit-fixes` step entries (already visited before `pr`) are NOT involved — these dispatches are direct via the Agent tool. Cites R52.

   **`status === "approved-clean"`** — log `await-remote-review: APPROVED by <reviewer>` and proceed. Do NOT dispatch received-review-sdlc. Cites R53.

   **`status === "timeout"`** — log warning `await-remote-review: timeout after Ns waiting for <reviewers>`. The script has already written `awaitRemoteReviewExhausted: true` to the state file. Proceed. Cites R54, R55.

   **`status === "skipped"`** (resume short-circuit) — log info and proceed. Cites R55.

   **`status === "error"`** — log warning and proceed.

If the step has `status: "skipped"`, print the skip reason from `step.reason` and do nothing.

### After pr — learnings-commit (final step)

Pipeline-level learnings cannot land in the feature commit (issue #208) — review/version/pr/archive all run *after* the feature commit. The `learnings-commit` step exists to capture them in a trailing chore commit so post-pipeline `git status` is clean.

If the `learnings-commit` step has `status: "will_run"`, execute it inline (no Agent dispatch — deterministic shell):

1. Run the ship-level Learning Capture (see the `## Learning Capture` section below) — append any new entries to `.sdlc/learnings/log.md`.
2. Check whether anything actually changed:
   ```bash
   git diff --quiet -- .sdlc/learnings/log.md
   ```
   - Exit `0` (no diff) → skip the commit and report `learnings-commit: no-op (no new learnings)`.
3. If there is a diff:
   ```bash
   git add .sdlc/learnings/log.md
   git commit -m "chore(ship-sdlc): capture pipeline learnings"
   git push
   ```
   On push failure (offline, auth), report the error but do **not** halt the pipeline — the local commit still lands and a follow-up `git push` will deliver it.
4. After the step, `git status --porcelain` MUST be empty.

If the step has `status: "skipped"` (omitted from `--steps` or `ship.steps[]`), print the skip reason from `step.reason` and do not perform any of the above. The execute-plan-sdlc-level Learning Capture (`R27` in `docs/specs/execute-plan-sdlc.md`) still runs and lands in the feature commit; only the ship-level append is conditional on this step.

### Between last commit and version — rebase on default branch

After all commits are done (feature commit + optional review-fix commit + optional archive commit), rebase onto the latest default branch to ensure a clean merge:

```bash
git fetch origin <defaultBranch>
```

Check if rebase is needed:
```bash
git merge-base --is-ancestor origin/<defaultBranch> HEAD
```
If main is already an ancestor of HEAD, no rebase needed — print "Already up to date with `<defaultBranch>`" and skip.

Otherwise, attempt rebase:
```bash
git rebase origin/<defaultBranch>
```

**If rebase succeeds:** Print summary and continue.
```
Rebase: clean — <N> commits replayed on origin/<defaultBranch>
```

**If rebase fails (conflicts):** Abort and handle:
```bash
git rebase --abort
```
List conflicting files from the failed output. Then:

**Auto mode:** Stop pipeline, save state for `--resume`. Print:
```
Rebase: CONFLICTS detected with origin/<defaultBranch>
  Conflicting files:
    - src/foo.ts
    - src/bar.ts
  Pipeline paused. Resolve conflicts manually, then --resume.
```

**Interactive mode:** Use AskUserQuestion:
> Rebase onto `<defaultBranch>` has conflicts in <N> files:
> - `src/foo.ts`
> - `src/bar.ts`
>
> 1. **Pause pipeline** — resolve manually, then `--resume`
> 2. **Skip rebase** — create PR with conflicts (GitHub will show merge conflicts)
> 3. **Merge instead** — try `git merge origin/<defaultBranch>` (creates merge commit)

Option 3 fallback: run `git merge origin/<defaultBranch>`. If that also conflicts, abort and fall back to option 1.

Note: in a worktree, all of this is safe — main working tree is untouched.

### State persistence

After each step, update pipeline state via `state/ship.js`. Locate the script:
```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
SCRIPT="<PLUGIN_ROOT>/scripts/state/ship.js"
```

At pipeline start (after Step 1 completes), initialize the state file:
```bash
node "$SCRIPT" init --branch <branch> --flags '<flags JSON>'
```

Before each step: `node "$SCRIPT" start --step <name>`
After each step: `node "$SCRIPT" complete --step <name> --result "<summary>"` (or `skip --step <name> --reason "<reason>"` or `fail --step <name> --error "<error>"`)
Record decisions: `node "$SCRIPT" decide --step <name> --text "<decision>"`
Defer findings: `node "$SCRIPT" defer --severity <s> --file <f> --title "<t>"`

### Terminal cleanup step (R38, issue #223)

The prepare-script output (`steps[]` array) ends with a synthetic step named `cleanup` (`status: "will_run"`, `skill: null`, `reserved: true`). It is appended unconditionally by `skill/ship.js::computeSteps` and is NOT user-configurable — listing `cleanup` in `--steps` or `ship.steps[]` produces a validation error in Step 1c.

Dispatch the cleanup step **as a direct Bash call**, not as an Agent. Each `cleanup` step entry has an `invocation` object with two precomputed command variants:

```json
{
  "method": "bash",
  "normal": "node \"$SCRIPT\" cleanup-pipeline",
  "forced": "node \"$SCRIPT\" cleanup-pipeline --force"
}
```

**Cleanup-step todo (R-todowrite-visibility clause 2):**

Before invoking the cleanup Bash command, run:

```bash
node "$SHIP_TODOS" --state-file "$STATE_FILE" --event cleanup --current-step cleanup
```

Call `TodoWrite`, echo `marker`. After the cleanup command returns (success or contract violation), run per-step-completion with `--mark-completed cleanup`.

Selection rule: walk `steps[]` and check whether any prior step's recorded status (from the live state file, not the prepare snapshot) is `failed`. If so, dispatch with `step.invocation.forced`; otherwise dispatch with `step.invocation.normal`. `$SCRIPT` is the same `state/ship.js` path resolved in the state-persistence section above.

Behavior:
- **Normal:** validates pipeline contract (no `pending`/`in_progress` steps), deletes the current run's state file, then sweeps stale ship- and execute- state files older than `state.gc.ttlDays` (default 7 days) whose branch is no longer in `git branch --list`.
- **Forced:** preserves the current run's state file (so `--resume` works after a failure), skips the contract check, and runs only the GC sweep.

If `--ttl-days <N>` was passed to ship-sdlc, append it to whichever variant you select.

The script prints a JSON report to stdout. Surface it verbatim:

```
Terminal cleanup:
  Current run: deleted ship-<branch>-<ts>.json
  GC swept: 1 ship-* file, 0 execute-* files (1 deleted, kept 1 ttl-fresh)
```

If `currentRun.valid === false` (contract violation on the normal path), print:

```
PIPELINE CONTRACT VIOLATION
The following steps were not resolved:
  - <step>: status "<status>" (expected: completed, skipped, or failed)

State file preserved for debugging: <path>
This is a pipeline bug — all will_run steps must be dispatched.
```

Do NOT proceed to the success summary. The pipeline did not complete correctly.

The cleanup step ALWAYS runs, even on failure paths — orphaned state files from interrupted runs are pruned regardless of whether the current pipeline succeeded.

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
  - Steps resolved: [execute, commit, review, archive-openspec, pr] (from config default; --quality not forwarded to execute-plan-sdlc — user did not pass --quality)
  - Version step skipped (from config default, bump type: patch)
  - Review found 2 medium issues — below threshold, deferred
  - PR created as draft (from --draft flag)

Deferred review findings (2 medium):
  1. [medium] src/middleware/auth.ts:42 — Consider extracting token validation
  2. [medium] src/routes/index.ts:15 — Missing rate limit on new endpoint
  → Run /received-review-sdlc to address these

State file cleaned up: .sdlc/execution/ship-<branch>-<epoch>.json deleted
```

If OpenSpec was detected in Step 1f and the `verify-openspec` step ran, append the verdict result:
  `→ OpenSpec verify: <satisfied|unsatisfied> — <summary>`
  (When unsatisfied and gaps were opened-as-finding or recorded, note: `N gap(s) recorded as pipeline findings.`)

If OpenSpec was detected but `verify-openspec` is NOT in `flags.steps` (step was not configured), append:
  `→ Run openspec validate --strict <change> to validate implementation completeness against the spec`

If OpenSpec was detected in Step 1f and the archive-openspec step ran successfully, append:
  `→ OpenSpec change "<name>" archived and committed.`

If OpenSpec was detected but `archive-openspec` is NOT in `flags.steps`, append:
  `→ Run openspec archive <change> --yes to archive the OpenSpec change and sync delta specs`

### Worktree cleanup

(removed — ship-sdlc never creates a git worktree. Workspace is auto-detected `branch`/`continue`; there is nothing to clean up. R60, fixes #378, #379.)

### Post-pipeline advisory (when version was auto-skipped)

If the version step status is `skipped` and the reason contains "worktree", print a next-step hint after the summary table:

```
Note: Version step was skipped (worktree mode — tags are repo-global).
After merging this PR, run on main:
  /version-sdlc <patch|minor|major>
This will tag the release and generate the changelog from all merged commits.
```

---

## Reference — Error Recovery, DO NOT, Gotchas, Learning Capture

Reference material lives in `./reference.md` (implements R-progressive-disclosure). Read the relevant section on its trigger; do not read preemptively:

- **On any pipeline-level failure** → Read `./reference.md` (Error Recovery section) for the detect → diagnose → recover → escalate flow and the resume-instruction format.
- **Before completing the pipeline (Learning Capture)** → Read `./reference.md` (Learning Capture section) to append pipeline learnings to `.sdlc/learnings/log.md`. This is triggered by the `learnings-commit` step (see "After pr — learnings-commit" above).
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
