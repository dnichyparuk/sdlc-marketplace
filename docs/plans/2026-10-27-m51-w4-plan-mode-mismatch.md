# M5.1 Waves 4+5 — Plan-Mode Run Never Discards Another Plan (#9182) Implementation Plan

**Commit:** `fix(#9020): ship-sdlc - plan-mode run never discards another plan`
**Goal:**
- Make `skill/ship.js --plan-mode-blocked` run the same plan check as the main path BEFORE it spawns `state/ship.js init`. That init prunes the branch's ledgers.
- With `--plan`, refuse on a mismatch (an unfinished ledger of the branch recorded a different plan).
- Without `--plan`, refuse when any unfinished ledger of the branch recorded a `planFile` (ruling w4-planreview Q1 (b)).
- Both refusals use the same `resumePlanMismatch` id and write no state: no init, no prune (owner Q22a, "never auto-discards").
- Use one helper for both call sites, so the message text and the rules are shared.
- Prove it with two exec cases, one with `--plan` and one without. Keep every existing `ship-prepare`, `ship-resume-plan` and `ship-step` case green.

**Architecture:** This is the feat plan for the ONE ship run of the branch: `/sdlc:ship-sdlc --auto --plan docs/plans/2026-10-27-m51-w4-plan-mode-mismatch.md --steps execute,commit --rebase skip --quality balanced` (ruling w1-shipauto). It makes exactly ONE in-ship commit with the `**Commit:**` subject above (65 characters; matches `commit.subjectPattern`; no `"`, backtick, `$` or `\`). Its files are exactly `plugins/sdlc-utilities/scripts/skill/ship.js` and `tests/promptfoo/datasets/ship-prepare-exec.yaml`. The stepper wrapper is NOT changed (KD3).

Pre-ship precondition: `git status --porcelain` prints nothing (the C-docs commit, Task 17 of `docs/plans/2026-10-27-m51-w4-direct-a.md`, is done). The spec sentence (R64) is direct-a Task 12, already committed (spec-first).

After this run, the executor applies `docs/plans/2026-10-27-m51-w4-direct-b.md` (#9180 (ii), the same file, re-located after this change).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-4-plan-source.md (plan 3, design point D-9182; Amendments), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w4-preflight.md Q4, /workspace/sdlc-marketplace/.sdlc/orchestration/owner-q22.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w2-planok.md (m1), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/arb-plancheck-wave-2.md (m1)

**Verification:** with PF-ENV (one Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`):

- (1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-prepare|ship-resume-plan|ship-step"`: 202 passed, 0 failed. 200 cases match at 5d5777a; this plan adds 2.
- (2) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "plan-mode-blocked"`: 7 passed, 0 failed (5 at 5d5777a plus the two new cases).
- (3) Consumer (C9; `ship-review-gate-exec.yaml` also drives ship.js through `run-ship-stepper.js`): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "review-gate"`: 8 passed (8 at 5d5777a).
- (4) `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0; `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 (exit 0 at 5d5777a).
- (5) Exec total after this run: 981 (979 at 5d5777a plus 2; count table in direct-a; ruling w2-a2 Q1: a different count is a STOP).
- (6) No behavioural run.

---

## Context

**What problem does this change solve?**

- When plan mode is active, ship-sdlc's SKILL.md runs `skill/ship.js --plan-mode-blocked`. That path writes a new ledger (the ship state file) at once, so the next `/ship-sdlc` can resume it.
- It writes the ledger by spawning `state/ship.js init`. Init first prunes every ship ledger of the branch.
- The plan check that protects another run's unfinished ledger sits ~200 lines later, on the main path only. So a plan-mode run with a different `--plan` can still delete another plan's unfinished ledger. Owner decision Q22a says ship "never auto-discards".

**What prompted this change now?**

- The arbiter's wave-2 plan check found it (m1) and filed follow-up #9182 for waves 4+5 (ruling w2-planok). Ruling w4-preflight Q4 granted the design and its Files.

**What does success look like?**

- With an unfinished ledger of plan A on the branch, `ship.js --plan-mode-blocked --plan B` exits 1 with `resumePlanMismatch` naming A, B and the ledger. The ledger is byte-identical afterwards, and no new ledger exists.
- Without `--plan`, the same ledger of plan A also refuses: exit 1, `resumePlanMismatch` saying "(no --plan given)" and naming plan A, with the ledger byte-identical.
- With the same plan, or with a ledger whose `flags` has no `planFile` key (or, without `--plan`, a `null` one), plan mode works exactly as today (Known limits). With `--plan`, a ledger whose `planFile` is `null` is compared and refused, as on the main path (R-implicit-resume).

---

## Research Findings

Line numbers at 5d5777a (re-read for this plan; pre-flight "#9182").

- **The order (D-9182 evidence).** `main()` (`skill/ship.js:2201`) parses the CLI at `:2223` (`const cli = parseArgs(process.argv);`) and merges flags at `:2313`. It checks git state at `:2334-2343`; `warnings` and `errors` exist by then (`:2341` writes them).
  - The plan-mode block is `:2348-2373` (comment `:2345-2347`; `spawnSync` `:2352`; `return` `:2372`):

    ```js
      if (flags.planModeBlocked) {
        const stateShipPath = path.join(__dirname, '..', 'state', 'ship.js');
        const flagsJson = JSON.stringify(flags);
        const currentBranch = gitState.currentBranch;
        const result = spawnSync('node', [
          stateShipPath, 'init',
          '--branch', currentBranch,
          '--flags', flagsJson,
        ], { encoding: 'utf8', timeout: 10000 });
        …
        writeOutput({ flags: { ...flags, planModeBlocked: true }, stateFile: filePath, prunedOrphans, planModeBlocked: true }, 'ship-prepare', 0);
        return;
      }
    ```

    `state/ship.js` `cmdInit` (`:118`) calls `pruneStateFiles('ship', branchSlug)` at `:157`, then writes the ledger.
  - The main-path check is `:2552-2572`, guarded by `if (cli.planFile && planFile) {` (`:2554`). `planFile` comes from `resolvePlanFile(planArg, errors)` at `:2544`, defined at `:2502`.
  - So the plan-mode block returns ~180 lines before the check and never reaches it. Putting the call inside the block, before `spawnSync`, is allowed by the code: `cli`, `gitState`, `errors`, `warnings`, `branchLedgers` (`:1033`), `samePlanPath` (`:1011`) and `STATE_SHIP_SCRIPT` (`:1235`) are all in scope there.
- **How plan mode knows the plan.** `parseArgs` stores `--plan` as `cli.planFile` (`:152`, returned at `:166`). `mergeFlags` (`:193`) does not copy it into `flags`, so a plan-mode ledger records no `flags.planFile` key (the init gets `--flags JSON.stringify(flags)`).
  - With `--plan` in `$ARGUMENTS` (ship SKILL.md `:23` forwards them), the plan path is `path.resolve(cli.planFile)`. Plan mode does not validate it today; `resolvePlanFile` (main path only) does.
  - Without `--plan`, there is no plan to compare. Under ruling w4-planreview Q1 (b), plan mode then refuses if any unfinished ledger of the branch recorded a `planFile` (KD2). The helper takes `planFile: null` for this case.
  - The five existing plan-mode cases use fixture `project-ship-plan-mode-blocked`. Its seeded ledger `.sdlc/execution/ship-feat-test-plan-mode-20240101T000000Z.json` has `flags` `{ bump, steps }` and no `planFile` key, so the refusal never applies to them. Planner control probe: a seeded ledger without the key, run with no `--plan`, gives exit 0 and `planModeBlocked: true`.
- **The main-path loop** (`:2555-2571`) skips a ledger with no `flags` or no `planFile` key, or with the same plan (`samePlanPath`, realpath then resolve). It skips a finished ledger unless `--resume`, recording `finishedOtherPlan` when that ledger is the resume candidate. Otherwise it pushes `{ id: 'resumePlanMismatch', message }` and breaks. `planMismatch` and `finishedOtherPlan` are read at `:2652` (the implicit-resume gate).
- **Error output.** `writeFatalErrors(errors)` (`:1171-1175`) mirrors each error message to stderr. `writeOutput({ errors, warnings }, 'ship-prepare', 1)` is the pattern of `:2341`. ship SKILL.md `:28` already handles a non-zero `PLAN_MODE_EXIT` ("show any errors from the output file and stop"), so no SKILL.md change is needed.
- **`claimSession`.** It runs only on the main path (implicit-resume gate `:2652`, after the check) and stays gated as today; the plan-mode block never calls it.
- **Tests.** The plan-mode cases are `ship-prepare-exec.yaml:1216`, `:1236`, `:1247`, `:1266` and `:1277` (5 match `plan-mode-blocked`). They pass no `--plan`, so they keep today's path. The `-e` case style of `:3713-3761` writes its own files in a `mkdtemp` dir or in the fixture copy. Fixture `project-sdlc-gitignore-inner` is a git repo whose `setup.sh` carries the guard (line 3) and whose `.sdlc/` holds only `.gitignore`.
- **Planner probe** (evidence only; scratch copy of 5d5777a and a scratch git repo the planner created with `git init -b main`; no fixture `setup.sh` was run). The case script below, run with `node -e`:
  - at 5d5777a: `status 0`, ledger changed, files `[ship-main-<new ts>.json]`. The seeded ledger was pruned: the defect.
  - with the change below: `status 1`, ledger unchanged, files `[ship-main-20261027T120000Z.json]`, `resumePlanMismatch` naming `plan-a.md` and `plan-b.md`, mirrored to stderr.
  - with the same plan: `status 0`, `planModeBlocked: true` (today's behaviour).
  - case (b), no `--plan` (round r3, after ruling w4-planreview Q1):
    - at 5d5777a: `status 0`, ledger pruned;
    - with the change below: `status 1`, ledger unchanged, 1 ledger file, `resumePlanMismatch` with "(no --plan given)", `plan-a.md` and `--resume`, mirrored to stderr;
    - case (b)'s single-expression assertion evaluates `true`; on case (a)'s output it evaluates `false`.
- **Consumer grep (addendum C9).** `planModeBlocked` → `ship-prepare-exec.yaml`, ship spec, `skill/ship.js`, ship SKILL.md, `state-format.md`. Only `ship.js` changes. `resumePlanMismatch` message text → `ship-resume-plan` cases (b), (h), (j), (k) assert on it; the text is moved, not changed.

---

## Plan readings

Quoted from the plan source's "Readings" and Amendments:

- **Spec-first** (arbiter 2026-10-20): "spec-consequence commits go FIRST; never record a waiver nobody gave." → R64 sentence: direct-a Task 12.
- **One ship run per wave branch**: "one ship run per branch (owner 2026-10-20, ruling w1-oneship)". → This is that run.
- **Ship line** (ruling w1-shipauto): `/sdlc:ship-sdlc --auto --plan <frozen feat plan> --steps execute,commit --rebase skip --quality balanced`.
- **In-ship commit** (ruling w1-run1commit item 2; ruling w1-plancheck m1; STANDING remedy ruling stop-1 item 2):
  - it is accepted when its files equal the plan's files;
  - a subject that differs from the `**Commit:**` subject, and/or a missing or wrong trailer, is fixed by a message-only reword amend, disclosed, with no STOP;
  - any other difference is a STOP.
- **No steering in ship-run dispatches** (ruling stop-6 Q1). The **verbatim hard-rule block goes in every dispatch prompt** (ruling stop-5 Q3, widened by ruling stop-6 Q2, the pkill line by w2-plan, the credential line by w2-e4 and its probe clause by ruling stop-7). → Each task below carries it.
- **Ruling stop-7** (`ruling-stop-7.md`): "The canonical HARD RULES credential clause becomes: 'never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens)'." and "It is a hard rule, so it is allowed under stop-6 Q1. Every new dispatch carries it." → The block in every task below.
- **Ruling w4-planreview** (`ruling-w4-planreview.md`), Q1 (b):
  - "Without `--plan`, the plan-mode block refuses before init, with no state write, when any unfinished ledger on the branch recorded a `planFile`."
  - "It uses the same `resumePlanMismatch` id, and the message says '(no --plan given)'."
  - "The message must name the ledger's plan and the way forward: `--resume`, or `--plan <that plan>`, or the user's own explicit cleanup. It names nothing new."
  - "Residual, disclosed and not in #9182: plan mode still prunes an unfinished ledger with no recorded `planFile`, or one of the SAME plan."

  → KD2, Edit 2, Task 2 case (b), Known limits.
- **`**Commit:**` by hand** (ruling w1-plan R3; plan-sdlc R66; the emitter is follow-up #9176). → The header field above.
- **Repo files by Write/Edit only** (ruling stop-4 item 1): "Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed."
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2).
- **Counts** (ruling w2-a2 Q1): "A count that differs from a plan's prediction is a STOP, even with a verified cause."
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1): no new fixture; the case reuses `project-sdlc-gitignore-inner` (guard at `setup.sh:3`). Workers never run a fixture `setup.sh` by hand.
- **Classifier refusals** (ruling w4-curl; ruling w2-a2 Q3): stop and report on a refusal, never switch tools; an ERROR may be retried once, unchanged; public docs only via WebFetch.
- **Worker temp files** (ruling stop-w3-2): created under `$TMPDIR` and removed in the same run.
- **No adapted verification** (ruling w2-judge row 52): every command runs exactly as written.
- **Bypass-absence checks** (ruling w1b-planok m2): the case asserts the ledger listing has exactly one file, so an empty listing fails.
- **R27 learnings append** (ruling scan-r3-and-r27): execute-plan-sdlc may skip it when the hard rules forbid the write. The skip is disclosed, and the learning text named in the done-file.
- **Q22** (`owner-q22.md`): Q22a option (1), "never auto-discards".
- **Orchestration-placed item:** #9182, ruling w4-preflight Q4 (granted; arbiter plan check covers this plan). The join: "ruling join-4-5".
- **W8.32:** "moved to wave 6 (ruling w4-w832-wave6)". Ruling w4-preflight Q1 and ruling w4-rule9 no longer apply to this wave.
- **Files extensions:** ruling w4-preflight Q4 (`skill/ship.js`, the ship-prepare dataset, the R64 spec sentence). The stepper wrapper is not used (KD3). Any other file is a QUESTION.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Plan mode without `--plan` refuses on an unfinished ledger that recorded a `planFile` | yes (ruling w4-planreview Q1 (b)) | `checkPlanMismatch(…, null)` returns `resumePlanMismatch` "(no --plan given)" before the init | Owner Q22a "never auto-discards" governs. The residual (a ledger with no `planFile`, or the SAME plan) keeps today's prune (Known limits; follow-up #9186). |
| Plan mode compares `path.resolve(cli.planFile)` without `resolvePlanFile`'s existence checks | no | the resolved path goes to `samePlanPath`, which falls back to `path.resolve` for a missing file | Plan mode never validated `--plan` and must not start rejecting new inputs here; `resolvePlanFile` is a main-path inner function that pushes `planFileNotFound`. |
| No stepper-wrapper change | no | the case is a self-contained `node -e` in `project-sdlc-gitignore-inner` | Ruling Q4: add the wrapper "only if the case needs it". The case does not need it (KD3). |
| Case asserts the message names the ledger by its file name only | no | `m.message.includes('-20261027T120000Z.json')` | The fixture copy's absolute path is not known to the assertion. |

---

## Key Decisions

1. **One helper, `checkPlanMismatch(branch, planFile, { explicitResume, resumePath })`.**
   - It holds the loop of `:2555-2571` unchanged.
   - It returns `{ error, finishedOtherPlan }`. `error` is the same `{ id: 'resumePlanMismatch', message }` object, with the same text, or `null`.
   - The main path calls it with `explicitResume: cli.resume, resumePath: resume ? resume.fullPath : null` and sets `planMismatch`/`finishedOtherPlan` from the result, so `:2652` behaves exactly as before.
   - The plan-mode block calls it with `explicitResume: cli.resume` and no `resumePath` (plan mode never resumes).
   - Alternative: copy the loop into the plan-mode block. Rejected: two copies of one rule (DRY; ruling Q4 asks for one helper).
2. **Without `--plan`, plan mode refuses on any unfinished ledger that recorded a `planFile` (ruling w4-planreview Q1 (b)).**
   - The plan-mode block calls `checkPlanMismatch(branch, null, …)`. For `planFile === null`, the helper:
     - skips a ledger with no `planFile` key or a non-string `planFile`;
     - skips a finished ledger;
     - otherwise returns `resumePlanMismatch`.
   - The message starts "ship-sdlc will not discard a run of another plan (no --plan given)." It names the ledger and its plan. It gives the three ways forward: `--resume`, `--plan <that plan>`, or the user's own cleanup with ship's existing verbs (`skip`, `cleanup-pipeline`, the same verbs as the `--plan` message). It names nothing new.
   - The main path never passes `null`: its call stays behind `cli.planFile && planFile`. So its behaviour is unchanged.
   - Why: owner Q22a ("never auto-discards") governs. A guard that only applied with `--plan` would leave the exact #9182 case open (ruling Q1).
3. **No stepper wrapper.**
   - The case seeds its own unfinished ledger (`planFile` = `plan-a.md`) in the fixture copy's `.sdlc/execution/` under the branch slug read from `git branch --show-current`.
   - It runs `ship.js --plan-mode-blocked --has-plan --plan plan-b.md`, and then prints the exit code, the output JSON, the stderr, whether the ledger is byte-identical and the ledger listing.
   - This is the self-contained `-e` style of the R-plan-commit-subject cases (`:3713-3761`).
4. **The error path writes nothing.** On a mismatch the block pushes the error, mirrors it (`writeFatalErrors`) and writes the output with exit 1 (`writeOutput({ errors, warnings }, 'ship-prepare', 1)`). It returns before `spawnSync`, so there is no init, no prune and no ledger write.

**Non-goals:** no change to `cmdInit`, `pruneStateFiles`, R-ship-init-prune, the main path's rules, ship SKILL.md or the stepper wrapper; no `--after` change (that is direct-b).

**Known limits (for the PR's known limits; ruling w4-planreview Q1 residual):** plan mode still prunes an unfinished ledger whose `flags` has no `planFile` key (a plan-mode or legacy ledger), one whose `planFile` is `null` when no `--plan` is given, one of the SAME plan, or one that cannot be parsed (R-implicit-resume: not compared). That is today's behaviour, not a different-plan discard, and is outside #9182. Follow-up #9186 (M7+), citing owner Q22a.

**Failure audience:** ship-sdlc users who run `/ship-sdlc` in plan mode on a branch that already has another plan's unfinished run.

---

## Contract Examples

```markdown
**Contract:**
- shape (code): `function checkPlanMismatch(branch: string, planFile: string|null, { explicitResume?: boolean, resumePath?: string|null }): { error: {id:'resumePlanMismatch', message:string}|null, finishedOtherPlan: boolean }`. `planFile` `null` means plan mode without `--plan`.
- names: `checkPlanMismatch`, `branchLedgers`, `samePlanPath`, `resumePlanMismatch`.
- mirror: the loop at `skill/ship.js:2555-2571`.
- decisions: KD1.
- sync: ship spec R64 (direct-a Task 12) and R-implicit-resume.
```

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| spec-first | error | PASS | R64's sentence is direct-a Task 12, committed before this run. |
| test-coverage-required | error | PASS | Two new exec cases (with and without `--plan`); every existing ship case that touches the moved loop is re-run (Verification 1–3). |
| no-auto-eval | error | PASS | Targeted exec runs only. |
| state-machine-idempotency | error | PASS | The refusal writes nothing, so a repeated refused call gives the same result; the same-plan path is unchanged. |
| dry | warning | PASS | One helper for both sites. |
| no-opposite-logical-vectors | error | PASS | Both sites use the same rule and message. |
| workspace-mode-compatibility | error | PASS | `branchLedgers` uses `resolveStateDir()` (main worktree's `.sdlc/execution/`), so ledgers from every worktree are compared. |
| scripts-over-llm-logic | error | PASS | The check is in the script; SKILL.md only shows the error. |
| ambiguity-stops-and-asks | error | PASS | The no-`--plan` behaviour was ruled (ruling w4-planreview Q1 (b)); the residual is disclosed (Known limits). |
| no-scope-creep | warning | PASS | Two files, both in ruling Q4. |

---

## Review cover (re-w2-review-coverage)

- Changed file types: one JS script (`scripts/skill/ship.js`) and one promptfoo dataset (`tests/promptfoo/datasets/ship-prepare-exec.yaml`).
- Dimensions (triggers read from `.sdlc/review-dimensions/*.md` at 5d5777a):
  - `security` (`plugins/**/scripts/**/*.js`) and `code-quality` (`**/*.js`) see `ship.js`;
  - `runtime-contract` and `hook-readiness` (`**/scripts/*.js`, one level) do not;
  - `test-quality` (`tests/promptfoo/datasets/*.yaml`) sees the dataset.
- Caps: with the whole wave's ~36 files, neither the security cap (50) nor the test-quality cap (100) is reached.

---

## Tasks

The verbatim hard-rule block, which every task and every dispatch prompt carries:

`HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop); never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens); promptfoo only as npx --yes promptfoo@0.123.1 with the brief's PF-ENV.`

### Task 1: `checkPlanMismatch` helper; call it in the plan-mode block before init and at the main-path site

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — add `checkPlanMismatch` after `branchLedgers` (`:1033-1058`); call it at the top of the plan-mode block (`:2348`); replace the loop at `:2554-2572`.

**Notes:** KD1, KD2, KD4. Apply the three edits bottom-up (main-path site first, then the plan-mode block, then the helper). The message text moves verbatim; four `ship-resume-plan` cases assert on it.

**Acceptance criteria:**
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0.
- [ ] `grep -c 'function checkPlanMismatch' plugins/sdlc-utilities/scripts/skill/ship.js` prints `1`; `grep -c 'checkPlanMismatch(' plugins/sdlc-utilities/scripts/skill/ship.js` prints `3` (definition and two calls; current `0`).
- [ ] `grep -c "ship-sdlc will not resume or discard a run of a different plan" plugins/sdlc-utilities/scripts/skill/ship.js` prints `1` (current `1`; the text moved, not copied).
- [ ] `grep -c '(no --plan given)' plugins/sdlc-utilities/scripts/skill/ship.js` prints `1` (current `0`; planner probe on the patched scratch copy: `1`).
- [ ] No test run in this task. Task 2 runs the plan's exec checks (stated in full there) after its case is added.

**Contract:**
- shape (code): see Contract Examples; the three diffs below.
- names: `checkPlanMismatch`, `explicitResume`, `resumePath`, `finishedOtherPlan`, `planMismatch`.
- mirror: the loop at `:2555-2571`; the error-exit pattern at `:2339-2342`.
- decisions: KD1, KD2, KD4.
- sync: R64 / R-implicit-resume (ship spec); `ship-resume-plan` cases (b), (h), (j), (k).

Edit 1 — main-path site, `:2552-2572` (anchor: `  let planMismatch = false;` … the closing `  }` before the blank line and `  // R-plan-commit-subject: a malformed **Commit:** header field …`):

```diff
   let planMismatch = false;
   let finishedOtherPlan = false;
   if (cli.planFile && planFile) {
-    for (const led of branchLedgers(gitState.currentBranch)) {
-      if (!led.flags || !('planFile' in led.flags) || samePlanPath(planFile, led.flags.planFile)) continue;
-      if (led.finished && !cli.resume) {
-        if (resume && resume.fullPath === led.fullPath) finishedOtherPlan = true;
-        continue;
-      }
-      planMismatch = true;
-      errors.push({
-        id: 'resumePlanMismatch',
-        message:
-          'ship-sdlc will not resume or discard a run of a different plan. ' +
-          `The ship ledger ${led.fullPath} on this branch belongs to an unfinished run with plan ${led.flags.planFile || '(none recorded)'}; this run was given --plan ${planFile}. ` +
-          'Fix: continue the earlier run with --resume (and its plan), or discard it with ship\'s own verbs: ' +
-          `node "${STATE_SHIP_SCRIPT}" skip --step <name> --reason <text> for each leftover step, then node "${STATE_SHIP_SCRIPT}" cleanup-pipeline. ` +
-          'Ship never resumes a different plan and never discards the earlier ledger itself.',
-      });
-      break;
-    }
+    const check = checkPlanMismatch(gitState.currentBranch, planFile, { explicitResume: cli.resume, resumePath: resume ? resume.fullPath : null });
+    finishedOtherPlan = check.finishedOtherPlan;
+    if (check.error) {
+      planMismatch = true;
+      errors.push(check.error);
+    }
   }
```

Edit 2 — plan-mode block, `:2348-2349` (anchor: `  if (flags.planModeBlocked) {` occurs once):

```diff
   if (flags.planModeBlocked) {
+    // R64 (Q22a; ruling w4-planreview Q1): the plan check runs before the init spawn, whose
+    // cmdInit prunes the branch's ledgers; on a refusal nothing is written. Without --plan, an
+    // unfinished ledger that recorded a plan refuses too.
+    const { error: planModeError } = checkPlanMismatch(gitState.currentBranch, cli.planFile ? path.resolve(cli.planFile) : null, { explicitResume: cli.resume });
+    if (planModeError) {
+      errors.push(planModeError);
+      writeFatalErrors(errors);
+      writeOutput({ errors, warnings }, 'ship-prepare', 1);
+      return;
+    }
     const stateShipPath = path.join(__dirname, '..', 'state', 'ship.js');
```

Edit 3 — the helper, inserted after `branchLedgers`'s closing `}` (`:1058`) and before the `// ---` banner of `verify-side-effect subcommand`:

```js

/**
 * R-implicit-resume / R64 (Q22a): compare the run's plan with every ledger of the branch before
 * any state write. Returns the resumePlanMismatch error for the first unfinished ledger (or, with
 * an explicit --resume, any ledger) that recorded a different plan, and whether the resume
 * candidate is a finished ledger of another plan. A ledger with no planFile key is not compared.
 * planFile null (plan mode without --plan; ruling w4-planreview Q1): any unfinished ledger that
 * recorded a plan refuses, so plan mode never prunes it.
 */
function checkPlanMismatch(branch, planFile, { explicitResume = false, resumePath = null } = {}) {
  let finishedOtherPlan = false;
  for (const led of branchLedgers(branch)) {
    if (!led.flags || !('planFile' in led.flags)) continue;
    if (planFile === null) {
      if (led.finished || typeof led.flags.planFile !== 'string') continue;
      return {
        error: {
          id: 'resumePlanMismatch',
          message:
            'ship-sdlc will not discard a run of another plan (no --plan given). ' +
            `The ship ledger ${led.fullPath} on this branch belongs to an unfinished run with plan ${led.flags.planFile}. ` +
            `Fix: continue that run with --resume, or re-run with --plan ${led.flags.planFile}, or discard it yourself with ship's own verbs: ` +
            `node "${STATE_SHIP_SCRIPT}" skip --step <name> --reason <text> for each leftover step, then node "${STATE_SHIP_SCRIPT}" cleanup-pipeline. ` +
            'Ship never discards the earlier ledger itself.',
        },
        finishedOtherPlan,
      };
    }
    if (samePlanPath(planFile, led.flags.planFile)) continue;
    if (led.finished && !explicitResume) {
      if (resumePath && resumePath === led.fullPath) finishedOtherPlan = true;
      continue;
    }
    return {
      error: {
        id: 'resumePlanMismatch',
        message:
          'ship-sdlc will not resume or discard a run of a different plan. ' +
          `The ship ledger ${led.fullPath} on this branch belongs to an unfinished run with plan ${led.flags.planFile || '(none recorded)'}; this run was given --plan ${planFile}. ` +
          'Fix: continue the earlier run with --resume (and its plan), or discard it with ship\'s own verbs: ' +
          `node "${STATE_SHIP_SCRIPT}" skip --step <name> --reason <text> for each leftover step, then node "${STATE_SHIP_SCRIPT}" cleanup-pipeline. ` +
          'Ship never resumes a different plan and never discards the earlier ledger itself.',
      },
      finishedOtherPlan,
    };
  }
  return { error: null, finishedOtherPlan };
}
```

**Must not touch:** `branchLedgers`, `ledgerFinished`, `samePlanPath`; `cmdInit` and `state/ship.js`; the implicit-resume gate (`:2652`); `claimSession`; `runAfter` (direct-b); every other line.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools (an ERROR may be retried once, unchanged). Public docs only via WebFetch. Temp files go under `$TMPDIR` and are removed in the same run.

`HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop); never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens); promptfoo only as npx --yes promptfoo@0.123.1 with the brief's PF-ENV.`

### Task 2: two exec cases — `--plan-mode-blocked` with a different plan, and without `--plan`, is refused on an unfinished planned ledger, ledger unchanged

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — insert two cases, (a) then (b), after the `--gc wins when combined with --plan-mode-blocked` case (`:1277-1289`; its last line is `      value: '"planModeBlocked": true'`), before `- description: "ship-prepare: --gc orphan sweep includes commit bucket …"` (`:1291`).

**Notes:** KD2, KD3. The `script_args` strings must have no whitespace, so that the `-e` provider keeps each one as a single argument (checked with `grep -c '[[:space:]]'` on the planner's copies → 0). Case (b) uses the single-expression assertion form: one expression and no `return` (lesson w2-e3).

**Acceptance criteria:**
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml` prints `228` (current `226`).
- [ ] Each of these runs in one Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;` (PF-ENV; never `--env-file`):
  - `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-prepare|ship-resume-plan|ship-step"`: 202 passed, 0 failed (200 at 5d5777a plus these two cases);
  - `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "plan-mode-blocked"`: 7 passed (5 plus these two cases);
  - `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "review-gate"`: 8 passed.
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/ship.js` and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.
- [ ] The exec total is 981 (979 at 5d5777a plus these two cases). A different count is a STOP (ruling w2-a2 Q1).

**Contract:**
- shape (code): two YAML cases. Each has the keys `description`, `vars.script_path` (`"-e"`), `vars.script_args`, `vars.script_cwd`, `vars.project_root` and `assert`.
  - Case (a): one multi-statement `javascript` assertion with `return`s.
  - Case (b): one single-expression `javascript` assertion, with no `return`.
- names:
  - (a) `ship-prepare (R64): --plan-mode-blocked with a different plan on an unfinished ledger is refused and the ledger is unchanged`;
  - (b) `ship-prepare (R64): --plan-mode-blocked without --plan on an unfinished planned ledger is refused and the ledger is unchanged`.
- mirror: `ship-prepare (R-plan-commit-subject): malformed header field …` (`:3731-3746`).
- decisions: KD3.
- sync: R64 (ship spec), Task 1.

Insert exactly (the blank line before it separates it from the previous case):

```yaml

# #9182 / R64 (owner Q22a): the --plan-mode-blocked path runs the plan check before its init,
# so another plan's unfinished ledger is never pruned. The case seeds the ledger itself.
- description: "ship-prepare (R64): --plan-mode-blocked with a different plan on an unfinished ledger is refused and the ledger is unchanged"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,path,js)=>((dir,br)=>((led)=>(fs.mkdirSync(dir,{recursive:true}),fs.writeFileSync(path.join(process.cwd(),"plan-a.md"),"#\x20A\n\n###\x20Task\x201:\x20A\n"),fs.writeFileSync(path.join(process.cwd(),"plan-b.md"),"#\x20B\n\n###\x20Task\x201:\x20B\n"),fs.writeFileSync(led,JSON.stringify({version:1,startedAt:"2026-10-27T12:00:00.000Z",branch:br,flags:{planFile:path.join(process.cwd(),"plan-a.md"),openspecContext:null,sources:{}},steps:[{name:"execute",status:"pending"},{name:"commit",status:"pending"}]})),((before,r)=>console.log(JSON.stringify({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8")),stderr:r.stderr,unchanged:fs.existsSync(led)&&fs.readFileSync(led,"utf8")===before,files:fs.readdirSync(dir).filter(f=>/^ship-/.test(f))})))(fs.readFileSync(led,"utf8"),cp.spawnSync("node",[js,"--plan-mode-blocked","--has-plan","--plan",path.join(process.cwd(),"plan-b.md")],{cwd:process.cwd(),encoding:"utf8"}))))(path.join(dir,"ship-"+br.replace(/[^a-zA-Z0-9-]/g,"-")+"-20261027T120000Z.json")))(path.join(process.cwd(),".sdlc","execution"),cp.execFileSync("git",["branch","--show-current"],{encoding:"utf8"}).trim()))(require("child_process"),require("fs"),require("path"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/ship.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 1) return `FAIL: exit ${o.status}: ${JSON.stringify(o.out).slice(0, 300)}`;
        if (o.out.planModeBlocked) return 'FAIL: plan-mode init ran';
        const m = (o.out.errors || []).find(e => e && e.id === 'resumePlanMismatch');
        if (!m) return `FAIL: no resumePlanMismatch: ${JSON.stringify(o.out.errors)}`;
        if (!/plan-a\.md/.test(m.message) || !/plan-b\.md/.test(m.message)) return `FAIL: message lacks the plans: ${m.message}`;
        if (!m.message.includes('-20261027T120000Z.json')) return `FAIL: message lacks the ledger: ${m.message}`;
        if (o.unchanged !== true) return 'FAIL: the seeded ledger changed or was pruned';
        if (o.files.length !== 1) return `FAIL: ledger files ${o.files.join()}`;
        return o.stderr.includes('resume or discard') ? true : 'FAIL: error not mirrored to stderr';

# #9182 / R64 (ruling w4-planreview Q1 (b)): without --plan, plan mode refuses before its init when
# an unfinished ledger of the branch recorded a planFile. The case seeds the ledger itself.
- description: "ship-prepare (R64): --plan-mode-blocked without --plan on an unfinished planned ledger is refused and the ledger is unchanged"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,path,js)=>((dir,br)=>((led)=>(fs.mkdirSync(dir,{recursive:true}),fs.writeFileSync(path.join(process.cwd(),"plan-a.md"),"#\x20A\n\n###\x20Task\x201:\x20A\n"),fs.writeFileSync(led,JSON.stringify({version:1,startedAt:"2026-10-27T12:00:00.000Z",branch:br,flags:{planFile:path.join(process.cwd(),"plan-a.md"),openspecContext:null,sources:{}},steps:[{name:"execute",status:"pending"},{name:"commit",status:"pending"}]})),((before,r)=>console.log(JSON.stringify({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8")),stderr:r.stderr,unchanged:fs.existsSync(led)&&fs.readFileSync(led,"utf8")===before,files:fs.readdirSync(dir).filter(f=>/^ship-/.test(f))})))(fs.readFileSync(led,"utf8"),cp.spawnSync("node",[js,"--plan-mode-blocked","--has-plan"],{cwd:process.cwd(),encoding:"utf8"}))))(path.join(dir,"ship-"+br.replace(/[^a-zA-Z0-9-]/g,"-")+"-20261027T120000Z.json")))(path.join(process.cwd(),".sdlc","execution"),cp.execFileSync("git",["branch","--show-current"],{encoding:"utf8"}).trim()))(require("child_process"),require("fs"),require("path"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/ship.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"
  assert:
    - type: javascript
      value: |
        ((o) => o.status === 1 && !o.out.planModeBlocked && (o.out.errors || []).some(e => e && e.id === 'resumePlanMismatch' && e.message.includes('(no --plan given)') && /plan-a\.md/.test(e.message) && e.message.includes('--resume')) && o.unchanged === true && o.files.length === 1 && o.stderr.includes('(no --plan given)'))(JSON.parse(output))
```

The case (b) assertion is one expression with no `return`: it checks the id, the "(no --plan given)" text, the named plan `plan-a.md`, `--resume` as the way forward, the byte-unchanged ledger, exactly one ledger file, and the stderr mirror.

**Must not touch:** every existing case; the fixture.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools (an ERROR may be retried once, unchanged). Public docs only via WebFetch. Temp files go under `$TMPDIR` and are removed in the same run. Never run a fixture `setup.sh` by hand.

`HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop); never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens); promptfoo only as npx --yes promptfoo@0.123.1 with the brief's PF-ENV.`

---

## Suggested Review Dimensions

For reviewers only; do not execute it.

The wave's G17 proposals are in `docs/plans/2026-10-27-m51-w4-direct-a.md` ("Suggested Review Dimensions"). One applies here: `runtime-contract` triggers `**/scripts/*.js` only, so it does not see `scripts/skill/ship.js`. The review gate should cover that file through the security and correctness dimensions, or by an explicit dimension list.

---

## Final Shape

- `skill/ship.js` has one `checkPlanMismatch` helper.
- The main path uses it exactly as the old loop worked.
- The `--plan-mode-blocked` path calls it before the init spawn. It exits 1 with `resumePlanMismatch` and leaves every ledger untouched:
  - with `--plan`, when an unfinished ledger of the branch recorded a different plan;
  - without `--plan`, when an unfinished ledger of the branch recorded any `planFile` ("(no --plan given)").
- Two new exec cases prove it. The exec total is 981. The residual (no recorded `planFile`, or the same plan) is in Known limits.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

The reviewer approved in rounds 1 and 2. The orchestrator's Opus review (planreview-wave-4) found M1 (the stop-7 clause) and M2 (no-`--plan` gap). Both were fixed in round r3 per ruling w4-planreview Q1 (b) and ruling stop-7.

| Requirement | Task(s) | Status |
|---|---|---|
| Plan check before the plan-mode init (#9182, Q22a) | 1 | covered |
| One shared helper, same message (ruling Q4) | 1 | covered |
| No state write on a mismatch | 1, 2 | covered |
| Exec case (a): `--plan` B on plan A's ledger, ledger unchanged, `resumePlanMismatch` | 2 | covered |
| No `--plan` refuses on an unfinished planned ledger (ruling w4-planreview Q1 (b)) | 1, 2 (case b) | covered |
| `claimSession` stays gated as today | 1 | covered |

Verdict: *"All checks passed. Ready for archive."*

---

## OpenSpec Appendix

Not applicable — no OpenSpec change.
