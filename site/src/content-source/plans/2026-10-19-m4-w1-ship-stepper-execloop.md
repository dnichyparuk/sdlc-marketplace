# W4.2 Supplement — Execution-Loop Behaviours in ship.js Implementation Plan

**Goal:** Move five behaviours that the deleted SKILL.md `### Execution loop` carried into `ship.js`, and fix the stale pointers the step-emitter left behind.
**Architecture:** Task 1 adds the execute-step invariants to `skill/ship.js` (`pickNextStep` and `runAfter`), with no new step id and no spec change. Task 2 adds the two LLM-side clauses to SKILL.md and re-points seven stale lines. It runs on top of the uncommitted feat-plan tree and ships in the same feat commit.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/arch2-wave-1-execloop.md (§2 wording, §3 triage), ruling-w1-execloop.md, wave-1-readings.md L21–L25, `docs/specs/ship-sdlc.md` R-INVARIANT-COMPLETENESS, R-todowrite-visibility (clauses 4 and 5), R-SHIPTODOS-FAILLOUD, R11, R-implicit-resume, R-agent-isolation-script-driven
**Verification:** `mkdir -p /tmp/claude-1000/pf-tmp-exec-m4; cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m4 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-step|ship-prepare|ship-todos|ship begin-step|ship complete-step|pipelineAdvancing|verify-side-effect" --no-cache` (exec-only, targeted; run in the background with one bounded wait)

---

## Context

**What problem does this change solve?**
Ship run 1 executed the feat plan, whose Task 5 deleted SKILL.md `### Execution loop`. That section held behaviours with no replacement in `ship.js` or SKILL.md: the completeness gate that halts the pipeline before commit (a MUST in the spec), `--resume` forwarding to execute, per-task execute todos, `isolation` pass-through, and the instruction to report token usage. Failure todos are also never applied, and seven pointers in SKILL.md, reference.md and the skill doc now cite deleted text.

**What prompted this change now?**
The executor of run 1 stopped before commit and reported the loss; the design judge (arch2) verified it and the arbiter ruled option (a): `ship.js` takes over the deterministic parts (ruling w1-execloop 1).

**What does success look like?**
- `--after dispatch_execute` runs `state/execute.js verify-completeness`; any non-zero exit records execute `failed` and returns `status:"error"` with no `stage_changes` step.
- `dispatch_execute` carries `--resume` exactly when the ledger's execute step is `in_progress` and an execute state file exists.
- The `dispatch_execute` envelope carries one todo per plan task.
- SKILL.md has the `ext.todos`, `isolation` and `usage` clauses; the seven stale lines are re-pointed.

## Research Findings

Line numbers are working-tree dated (run-1 tree on `7de2012`); every anchor is located by content, exactly once.

- **Spec text to port (HEAD `docs/specs/ship-sdlc.md` lines 307–308, now lines 334–335).** "ship-sdlc MUST run `state/execute.js verify-completeness` as a blocking invariant check. If the script exits non-zero (exit 65 = missing task IDs; exit 2 = `plannedTaskIds` absent from state or script not found), ship-sdlc MUST mark the execute step `failed`, halt the pipeline, and NOT advance to commit or any subsequent step." Acceptance: "when the script cannot be located, ship-sdlc exits 2 with the error \"Cannot locate execute.js — completeness gate cannot run\"; when all tasks are accounted the pipeline advances normally."
- **HEAD SKILL.md lines 534–552 (the gate to port).**
  ```bash
  EXECUTE_STATE_SCRIPT="<PLUGIN_ROOT>/scripts/state/execute.js"
  [ -f "$EXECUTE_STATE_SCRIPT" ] || { echo "ERROR: Cannot locate execute.js — completeness gate cannot run." >&2; exit 2; }
  node "$EXECUTE_STATE_SCRIPT" verify-completeness
  COMPLETENESS_EXIT=$?
  if [ "$COMPLETENESS_EXIT" -ne 0 ]; then
    echo "ERROR: execute-plan-sdlc returned but planned tasks are unaccounted. Pipeline halted." >&2
    node "$SHIP_TODOS" --state-file "$STATE_FILE" --plan "$PLAN_FILE" --event execute --fail-step execute
    exit "$COMPLETENESS_EXIT"
  fi
  ```
  Ruling L23: port exactly. Any non-zero exit, including 1, halts. Exit 1 is not reinterpreted as "no state to verify". The missing-script message and the `--fail-step execute` render stay.
- **Existing code to reuse.** `pickNextStep`'s `default: // dispatch_*` case builds `data` from `cs.*` (`ship.js:1433-1434`). `runAfter` step 4 has the W4.6 side-effect check for `version` (`ship.js:1551-1557`), the usage parse (`:1563-1565`), and a failure row that records `failed` and returns `status:"error"` for `dispatch_*` (`:1602-1604`). Step 6 renders `stepTransition(ledger, nextName)` (`:1636`). `renderTodos(ledger, {event:'execute', planTasks})` and `parsePlanTasks` exist in `lib/ship-todos.js` (exported at about line 444; `lib/ship-todos.js` is Must-not-touch). `readState('execute', slug)` and `slugifyBranch` are already imported in `ship.js` (line 44).
- **Resume signal.** `ledger.flags.resume` keeps its init value and L6 forbids a new field, so the signal is ledger state: `ensureLedger` adopts an existing ledger only under `--resume`, and `init` prunes otherwise, so an execute entry still `in_progress` when `pickNextStep` runs means a resumed run. HEAD's condition was `flags.resume` and execute `in_progress` and the file found (`HEAD:SKILL.md:504-511`). `failed` execute restarts fresh, as at HEAD; that is a PR follow-up.
- **verify-completeness exit 1 (no state).** `state/execute.js` exits 1 when no execute state exists. execute-plan deletes its state on success (R14), so a clean world can hit this. HEAD and installed 0.21.29 behave the same way, so the port is no regression. Follow-up todo #9123 (M5, W5.2/W5.3) names it; this plan does not resolve it.
- **Usage.** `HEAD:SKILL.md:410` told the model to pass `--usage '<json>'` (`{"source":"unavailable"}` when none, never estimate). The new result envelope has `output.usage` but no sentence asks for it, so every step logs "usage absent". Inline steps had no usage at HEAD.
- **Failure todos.** `ext.todos` on `status:"error"` is never applied because loop item 2 stops first, so a failed step's todo lingers `in_progress` (R-todowrite-visibility clause 5).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| New step id `verify_execute` | no | none; the check runs inside `--after dispatch_execute` | a new id would change P-TRANS-1; recording already happens inside `--after dispatch_<s>` |
| Live read of the execute state file | no | `readState('execute', slug)` in `pickNextStep` | resume detection, not a composition input (ruling w1-execloop 2); L6/L8 hold, `computeSteps` is untouched |
| `--branch <ledger.branch>` on `verify-completeness` | no | passed explicitly | HEAD relied on the current branch; `ledger.branch` is the same value and does not depend on cwd. The executor confirms `state/execute.js` accepts `--branch` for this verb (it does for `read`/`cleanup`; `parseArgs` is shared) and otherwise drops the flag |
| Error exit code (ruling L27) | no | on a completeness failure `ship.js --after` keeps `status:"error"` but exits with the completeness script's code: 65 (missing ids), 2 (`plannedTaskIds` absent), 2 ("Cannot locate execute.js", message text kept), 1 when the script itself exits 1 (no state); a spawn error exits 2 | the spec acceptance is specific ("exits 65 / exits 2") and the spec is the source of truth; W4.2 Change 1's "exit 1 for error envelopes" stays the general rule, this is its spec-defined exception; no spec edit |
| Case (x) | optional | included; dropped if it cannot be made non-trivial | `isolation` is null for every step today |
| 6 FOLLOW-UPs, 2 NOT-A-DEFECTs of arch2 §3 | no | none touched | they go in the PR (ruling w1-execloop 1) |

## Key Decisions

**Problem in one sentence:** deleting the execution-loop prose also deleted behaviours that a script can do deterministically, so the script must take them over.

- **Script-side placement (ruling 1).** The spec says "ship-sdlc MUST run"; `ship.js` running it satisfies that. No spec change, so the L17 specs plan is unaffected.
- **Port exactly (L23).** Any non-zero exit halts. The exit-2 message "Cannot locate execute.js — completeness gate cannot run" is kept, and the failure render is HEAD's `--event execute --plan --fail-step execute` render (one todo per plan task), built with `renderTodos` options.
- **`--resume` only (L22).** Only `--resume` is appended to the execute args, and only when execute is `in_progress` and the state file exists.
- **Usage for `dispatch_*` only (HEAD parity).** Inline steps get no usage and no warning.
- **Non-goals.** No change to `computeSteps`, `lib/ship-todos.js`, `state/ship.js` verbs, `state/execute.js`, hooks, or the spec. No new flag, field or step id.
- **Who fails if wrong.** Every `/ship-sdlc` user: a skipped gate lets an incomplete execute reach commit; a missing `--resume` restarts all waves after compaction.

## Contract Examples

**code** (taken from Task 1):

```markdown
**Contract:**
- shape (code): in `pickNextStep` `default:` case add `isolation`, the `--resume` rewrite and `planTasks`; in `runAfter` add the `verify-completeness` check beside the tag side-effect check.
- names: `EXECUTE_STATE_SCRIPT`, `parsePlanTasks`, `planTasks`, `verify-completeness exit`.
- mirror: the W4.6 `STEP_SIDE_EFFECTS` block in `runAfter` step 4.
- decisions: Key Decisions "Script-side placement", "Port exactly".
- sync: SKILL.md loop item 5 (Task 2).
```

**docs** (taken from Task 2):

```markdown
**Contract:**
- shape (docs): MODIFY `SKILL.md`, `reference.md`, `docs/skills/ship-sdlc.md` — two loop clauses and seven re-pointed lines.
- names: `ext.todos`, `step.data.isolation`, `output.usage`, `step.data.NEW_TAG`, `step.data.EXECUTE_BRANCH`.
- mirror: the existing `effort` clause in the `dispatch_*` rule.
- decisions: one clause per LLM-side instruction; no `begin-step`/`complete-step` text.
- sync: Task 1 envelope fields.
```

## Final Shape

- `ship.js` records execute `failed` and halts when `verify-completeness` exits non-zero or the script is missing; emits `--resume` and per-task todos on `dispatch_execute`; passes `isolation` when set; records usage for `dispatch_*` only.
- SKILL.md loop item 2 applies `ext.todos`; the `dispatch_*` rule asks for `isolation` and `output.usage`; seven stale lines are re-pointed.
- The exec dataset gains 7 more `ship-step: ` cases (t)–(x) with (v) split in three.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 1 adds seven exec cases |
| no-auto-eval | error | PASS | exec configs only, targeted; no behavioural run in this plan |
| scripts-over-llm-logic | error | PASS | the gate, resume forwarding and todos move into `ship.js` |
| spec-first | error | PASS | no spec change; the spec already states the MUSTs (ruling 1) |
| cross-skill-consistency | error | PASS | `state/execute.js` and `state/ship.js` unchanged |
| skill-docs-required | error | PASS | Task 2 updates `docs/skills/ship-sdlc.md` |
| flag-coherence-cross-skill | error | PASS | no new flag; `--resume` and `--branch` are existing flags of their scripts |
| agent-dispatch-script-driven | error | PASS | `isolation` comes from the envelope |
| no-scope-creep, smallest-viable-cut, single-responsibility-tasks | warning | PASS | only the five behaviours, seven pointers and two clauses |
| pr-link-github-issue | error | PASS | PR body links the tracking todo (Phase B) |

## Execution rules

- Locate every anchor with `command grep -nF`; it must occur exactly once. Missing or duplicated → STOP (reading 6). A shifted line number alone is a note.
- If the code contradicts a task, STOP (plan §0 rule 8). Do not adapt.
- Multi-site edits are applied bottom-up. Every grep in Verification is written `command grep`.
- Do not commit, do not run `node site/scripts/copy-docs.mjs` in this plan.
- Test seeding passes `--plan` and never seeds a ledger under a `.sdlc/.gitignore` that ignores its own directory (reading 5).

## Tasks

### Task 1: ship.js executes the execute-step invariants

**Complexity:** Complex
**Risk:** High
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — import, constant, `pickNextStep` default case, `runAfter` steps 4 and 6.
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenarios for the new cases.
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — seeds `seed/execute-complete.json`, `seed/execute-missing.json` (execute state files with `plannedTaskIds`), `seed/execute-noplanned.json` (no `plannedTaskIds`), and a ledger with execute `in_progress`; the fixture `plan.md` gets a second heading `### Task 2: …` (so it has at least two `### Task N:` headings and a per-task render differs from the one-todo placeholder).
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add cases (t)–(x).

**Notes:** High risk: this is the pipeline's completeness gate. Must not touch: `computeSteps`, `lib/ship-todos.js`, `state/ship.js` verbs, `state/execute.js`. Execute state files must be seeded where `readState('execute', slug)` resolves them (`resolveStateDir`), named `execute-<slug>-<ts>.json`.

**Contract:**
- shape (code):
  1. Import: `const { stepTransition, markCompleted, renderTodos } = require(path.join(LIB, 'ship-todos'));` gains `parsePlanTasks`. After the line `const STATE_SHIP_SCRIPT      = path.join(__dirname, '..', 'state', 'ship.js');` add `const EXECUTE_STATE_SCRIPT   = path.join(__dirname, '..', 'state', 'execute.js');`.
  2. `pickNextStep`, line `default: // dispatch_*` and its `data = { skill: cs.skill, … }` line:
     - add `...(cs.isolation ? { isolation: cs.isolation } : {})` to `data`;
     - when the step id is `dispatch_execute`: (i) if the ledger's `execute` entry has status `in_progress` and `readState('execute', slugifyBranch(ledger.branch))` is non-null, set `data.args = \`${cs.args} --resume\`` and `data.invocation = \`skill: "${cs.skill}", args: "${data.args}"\`` (only `--resume` is appended, L22); (ii) read `flags.planFile` and call `parsePlanTasks`; when the read fails or yields zero tasks return `{ error: 'dispatch_execute: the plan must contain at least one "### Task N:" heading (R-SHIPTODOS-FAILLOUD): <planFile>' }` (the caller turns it into `status:"error"`); otherwise return the tasks on the result as `planTasks`, beside `step`, never inside `data`.
  3. `runAfter` step 6, the line `const rendered = stepTransition(ledger, nextName);`: when `nextName === 'execute'` use `renderTodos(ledger, { event: 'execute', currentStep: 'execute', planTasks: next.planTasks })`, otherwise `stepTransition(ledger, nextName)`; the `marker` of the execute render is `step.data.marker`.
  4. `runAfter` step 4, directly after the `if (name && STEP_SIDE_EFFECTS[name] === 'tag' && success) { … }` block: when `name === 'execute' && success`, run the completeness gate exactly as HEAD SKILL.md lines 534–552 do (L23):
     - if `!fs.existsSync(EXECUTE_STATE_SCRIPT)` → `success = false; failureText = 'Cannot locate execute.js — completeness gate cannot run (exit 2).'`;
     - otherwise `const r = spawnSync('node', [EXECUTE_STATE_SCRIPT, 'verify-completeness', '--branch', ledger.branch], { encoding: 'utf8', timeout: 10000 })`; if `r.error || r.status !== 0` (ANY non-zero exit, including 1) → `success = false; failureText = \`execute-plan-sdlc returned but planned tasks are unaccounted. Pipeline halted (verify-completeness exit ${r.error ? 'error' : r.status}): ${(r.stderr || '').trim()}\``.
     The process exit code of that error envelope is the completeness code (ruling L27): thread an optional exit code through the `failStep`/`emit` path (`emit` currently uses `envelope.status === 'error' ? 1 : 0`, `ship.js:1473`) and pass `r.status` (65, 2 or 1), or 2 for the missing script and for a spawn error; all other errors keep exit 1. The error envelope itself is unchanged.
     The existing failure row for `dispatch_*` then records execute `failed` and returns `status:"error"` before any `stage_changes` step. For `name === 'execute' && !success` the failure todos reproduce HEAD's `ship-todos --event execute --plan $PLAN_FILE --fail-step execute`: set `ext.todos = renderTodos(ledger, { event: 'execute', currentStep: 'execute', failStep: 'execute', planTasks: parsePlanTasks(<text of flags.planFile>) })`, one todo per plan task; only when the plan yields no tasks fall back to the existing collapsed render `renderTodos(ledger, { event: 'step', currentStep: name, failStep: name })`. This applies to the failure of any cause (completeness gate, or the agent's own `success:false`). `lib/ship-todos.js` is not changed.
  5. Usage parse (the `parseUsage(JSON.stringify(output.usage))` lines): parse and warn only when `after.startsWith('dispatch_')`; other named steps pass `usage = undefined` with no warning.
- Cases (descriptions start `ship-step: `; the item's filter selects them):
  - (t) `ship-step: (t) --after dispatch_execute with every planned task accounted records execute completed and emits stage_changes` (seed `execute-complete.json`).
  - (u) `ship-step: (u) --after dispatch_execute with an unaccounted planned task returns error and records execute failed (R-INVARIANT-COMPLETENESS)` (seed `execute-missing.json`): `status === "error"`, the call's `exitCode === 65`, `error` contains `verify-completeness exit 65`, ledger `execute` is `failed`, no `stage_changes` step, `ext.todos` has no `in_progress` todo and lists one entry per plan task (the count equals the fixture plan's `### Task` count, as HEAD's `--event execute --plan --fail-step execute` render does).
  - (u2) `ship-step: (u2) --after dispatch_execute with no execute state file halts too (any non-zero exit, L23)`: no seed; `status === "error"`, the call's `exitCode === 1` (the script's own code), `error` contains `verify-completeness exit 1`, ledger `execute` is `failed`.
  - (u3) `ship-step: (u3) --after dispatch_execute with an execute state file lacking plannedTaskIds returns error with exit 2`: seed `execute-noplanned.json` (an execute state without `plannedTaskIds`, added to `setup.sh`); `status === "error"`, the call's `exitCode === 2`, `error` contains `verify-completeness exit 2`, ledger `execute` is `failed`.
  - (v) `ship-step: (v) resumed ledger with execute in_progress and an execute state file emits dispatch_execute with --resume` (present).
  - (v2) `ship-step: (v2) execute in_progress and no execute state file emits dispatch_execute without --resume` (absent).
  - (v3) `ship-step: (v3) execute not in_progress emits dispatch_execute without --resume even when an execute state file exists` (execute `pending`).
  - (w) `ship-step: (w) dispatch_execute carries one execute todo per plan task and the execute marker`: the todo count for plan tasks equals the fixture plan's `### Task` count (at least 2, so the single placeholder todo cannot satisfy it) and `step.data.marker` matches `/execute: \d+ plan tasks queued/`.
  - (x) `ship-step: (x) dispatch step data carries isolation only when computeSteps sets it`: assert `'isolation' in data` is false on the fixture; drop this case if it cannot be made non-trivial and say so in the report.
  - (y) `ship-step: (y) dispatch_execute on a plan with zero "### Task N:" headings returns error (R-SHIPTODOS-FAILLOUD)`: a seeded ledger whose `flags.planFile` points to a fixture plan file without any `### Task` heading; `--after confirm_pipeline` (or the preceding step) with `yes.json` → `status === "error"`, `error` contains `the plan must contain at least one "### Task N:" heading`, and no `dispatch_execute` step is emitted.
- names: `EXECUTE_STATE_SCRIPT`, `parsePlanTasks`, `planTasks`, `verify-completeness`, `ledger.branch`, `readState`, `slugifyBranch`.
- mirror: the `STEP_SIDE_EFFECTS` block in `runAfter` step 4; the existing `ship-step: ` cases (a)–(s) and their wrapper scenarios.
- decisions: Key Decisions "Script-side placement", "Port exactly (L23)", "`--resume` only (L22)", "Usage for `dispatch_*` only".
- sync: Task 2 (SKILL.md clauses); spec R-INVARIANT-COMPLETENESS (unchanged).

**Acceptance criteria:**
- [ ] The Verification command passes with every `ship-step` case, including (t), (u), (u2), (u3), (v), (v2), (v3), (w), (x) and (y) (or the report states why (x) was dropped).
- [ ] `command grep -c 'verify-completeness' plugins/sdlc-utilities/scripts/skill/ship.js` is at least 1, and the string `Cannot locate execute.js — completeness gate cannot run` occurs in `ship.js`.
- [ ] `command grep -n "'--resume'\|--resume" plugins/sdlc-utilities/scripts/skill/ship.js` shows `--resume` appended only inside the `dispatch_execute` branch of `pickNextStep`.
- [ ] `git diff -- plugins/sdlc-utilities/scripts/lib/ship-todos.js plugins/sdlc-utilities/scripts/state/` shows no change from this task.

### Task 2: SKILL.md, reference.md and docs carry the LLM-side clauses and re-pointed text

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests, lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md`
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md`
- Modify: `docs/skills/ship-sdlc.md`

**Notes:** SKILL.md must stay at most 450 lines. Locate each line by its content (line numbers are working-tree dated). The post-version ancestry bash block stays byte-identical. No `begin-step`/`complete-step` text may appear in SKILL.md.

**Contract:**
- shape (docs):
  1. Loop item 2 (the line starting `2. Parse \`$ENVELOPE_FILE\`.`): prefix "If `ext.todos` is present, call `TodoWrite` with `ext.todos.todos` and echo `ext.todos.marker`. Then:" before the existing sentence (clause 5, failure todos).
  2. The `dispatch_*` bullet of loop item 5: after "adding `effort: step.data.effort` only when `step.data.effort` is present" add "(likewise `isolation: step.data.isolation`, R-agent-isolation-script-driven)"; after "Take `(1)–(4)` from the return into `output`" add "and the token counts the Agent return reports into `output.usage` (`{\"source\":\"unavailable\"}` when the harness exposes none; never estimate)".
  3. The note line containing `(e.g. Step 5's execute resume forwarding)`: replace that parenthetical with "(`ship.js` adds `--resume` to the execute dispatch when the ledger's execute step is `in_progress` and an execute state file exists)".
  4. The line starting `Reuse \`NEW_TAG\``: replace "(see the per-step completion block's version-step side-effect gate; it is the single capture point)" with "(`ship.js` checks it on `--after dispatch_version` and passes it as `step.data.NEW_TAG`)". The line starting "`NEW_TAG` is the tag string emitted by version-sdlc": replace "`EXECUTE_BRANCH` is the feature branch variable set during pre-execute workspace auto-detection when the derive was `branch` (already available in the pipeline shell context; unset when the derive was `continue`)" with "`EXECUTE_BRANCH` is `step.data.EXECUTE_BRANCH`: the feature branch when `branch_prepare` ran, null under `continue`".
  5. `reference.md`, table row "Review verdict unparseable": the action becomes "`ship.js` dispatches received-review-sdlc and adds a `warnings` line (`review_gate`)". Gotcha "Verdict detection is text-based": replace its last sentence with "a missing or unparseable verdict makes `review_gate` dispatch received-review-sdlc with a warning." (L12). The DO-NOT bullet "Add, remove, or change the `isolation` parameter": both occurrences of `step.isolation` on that line ("comes verbatim from `step.isolation`" and "when `step.isolation` is null") become `step.data.isolation`.
  7. Loop item 6 (the line starting `6. Run \`mktemp\``): after "set `ENVELOPE_FILE` to the path it prints" add " (the path is printed also when the exit code is non-zero; a non-zero exit is handled like `status: \"error\"` in item 2)" (ruling L27: any non-zero exit / error envelope is treated alike; item 2 already stops on `status === "error"`, and the completeness code 65/2 only distinguishes the cause).
  6. `docs/skills/ship-sdlc.md` — the sentence wraps across two lines. Anchor 1 (line 242, must match exactly once with `command grep -nF`): ``records start and completion in the state file. `complete-step` takes an `--outcome` flag reporting what the``. Anchor 2 (the start of line 243, must match exactly once): `dispatched agent returned; for the `version` step this is cross-checked`. Replace across the two lines: line 242 becomes "records start and completion in the state file. The result's `success` reports what the" and line 243 keeps `dispatched agent returned; …` unchanged.
- names: `ext.todos`, `step.data.isolation`, `output.usage`, `step.data.NEW_TAG`, `step.data.EXECUTE_BRANCH`.
- mirror: the existing `effort` clause in the `dispatch_*` rule; the sentence added in the feat plan Task 5 before the ancestry block.
- decisions: one clause per LLM-side instruction; the reference.md edits follow ruling L12.
- sync: Task 1 envelope fields (`planTasks` does not reach the model; `step.data.todos`, `step.data.marker`, `ext.todos`).

**Acceptance criteria:**
- [ ] `wc -l plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` is at most 450.
- [ ] `command grep -cE 'begin-step|complete-step' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` is 0.
- [ ] `command grep -c 'scripts/skill/ship.js" --after' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` is at least 1.
- [ ] `command grep -c 'ext.todos' …/SKILL.md` ≥ 1, `command grep -c 'output.usage' …/SKILL.md` ≥ 1, `command grep -c 'step.data.isolation' …/SKILL.md` ≥ 1.
- [ ] `command grep -cF 'non-zero exit is handled like' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` is 1 (L27).
- [ ] `command grep -cF "per-step completion block" …/SKILL.md` is 0, `command grep -cF "pre-execute workspace auto-detection" …/SKILL.md` is 0, `command grep -cF "Step 5's execute resume forwarding" …/SKILL.md` is 0.
- [ ] `command grep -cF "Treat as APPROVED WITH NOTES" …/reference.md` is 0, `command grep -cF 'step.isolation' …/reference.md` is 0, `command grep -cF "takes an \`--outcome\` flag" docs/skills/ship-sdlc.md` is 0.
- [ ] The ancestry bash block (identified by `verify-tag-ancestry.js" --tag "$NEW_TAG" --branch "$EXECUTE_BRANCH" --remote origin`) is byte-identical to its pre-task text.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0 with only pre-existing warnings.

## Verification Scorecard

Not applicable — the review of this plan is run externally by the orchestrator's isolated Opus subagents (invoking brief).
