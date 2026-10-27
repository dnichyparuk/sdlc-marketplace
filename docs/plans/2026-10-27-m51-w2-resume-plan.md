# M5.1 Wave 2 — Ship Resume Honours the Ledger Plan (W8.23) Implementation Plan

**Commit:** `fix(#9019): ship-sdlc - resume honours the ledger plan (W8.23)`
**Goal:**
- Re-verify #9140 first: a fresh ship init with `--steps execute,commit` records `review`, `version` and `pr` as `skipped` (case (a), run against the unchanged `ship.js`).
- Make `skill/ship.js` prepare follow the ship spec as changed by commit S1 (R11, R72, R-PLANFILE, R-implicit-resume):
  - a run whose `--plan` differs from the plan recorded in ANY unfinished ledger of the branch (fresh or stale, this or another worktree) stops with `resumePlanMismatch` and writes no state (#9133, ruling pr40 gap (i), ruling w2-planreview Q1); a finished ledger keeps today's prune;
  - a plain `--resume` restores the plan and the steps from the ledger and nothing else (#9146);
  - a run with neither `--resume` nor `--plan` keeps `missingPlanFile`, and its message names the ledger's plan and `--resume` (gap (ii)).
- Prove it with twelve `ship-resume-plan:` exec cases (a)–(l).

**Architecture:** This is the feat plan for the ONE ship run of the branch: `/sdlc:ship-sdlc --auto --plan docs/plans/2026-10-27-m51-w2-resume-plan.md --steps execute,commit --rebase skip --quality balanced` (ruling w1-shipauto). It makes exactly ONE in-ship commit with the `**Commit:**` subject above (62 characters; matches `commit.subjectPattern`; no `"`, backtick, `$` or `\`; added by hand per plan-sdlc R66 and ruling w1-plan R3). The run's files are exactly W8.23's code Files: `plugins/sdlc-utilities/scripts/skill/ship.js`, `tests/promptfoo/scripts/run-ship-stepper.js`, `tests/promptfoo/datasets/ship-prepare-exec.yaml`. Three tasks: Task 1 (wrapper flags, scenarios and case (a), run at the unchanged `ship.js`) → Task 2 (`ship.js`) → Task 3 (cases (b)–(l) and the full Verification).

After this run, the executor makes one direct docs commit for `docs/skills/ship-sdlc.md` (ruling w2-planreview Q3). It is Task 1 of `docs/plans/2026-10-27-m51-w2-direct-b.md`, not a task of this ship run.

Pre-ship precondition: `git status --porcelain` prints nothing (the C-docs commit of `docs/plans/2026-10-27-m51-w2-direct-a.md` Task 20 is done).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-2-plan-source.md (plan 2; design points D-23a, D-23b, D-23c), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/item-W2W3-bae33fd.md (W8.23 Changes 1, 3, 4), /workspace/sdlc-marketplace/.sdlc/orchestration/owner-q22.md, /workspace/sdlc-marketplace/.sdlc/orchestration/ruling-pr40.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/preflight-wave-2.md

**Verification:** with PF-ENV (one Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`):

- (1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-resume-plan|ship-step|ship-prepare"`: 200 passed, 0 failed. Count: 187 cases match at bae33fd; W8.10's contrast case (direct-a Task 17) makes 188; this plan adds 12.
- (2) Consumer (C9; `ship-review-gate-exec.yaml` also drives `run-ship-stepper.js`): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "review-gate"`: 8 passed (8 at bae33fd).
- (3) `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 (exit 0 at bae33fd).
- (4) No behavioural run (D-beh: none for W8.23).
- The spec part (validate-spec-shape, P-5 `SAME` for ship) was checked by commit S1 in the direct-a plan.

---

## Context

**What problem does this change solve?**

- **#9133.** A second ship run on the same branch, with a different `--plan`, silently resumed the first run's ledger (the ship state file). Its own plan was dropped, so it would have skipped its own execute step. The orchestration had to delete ledgers by hand (D15 deletes).
- **#9146.** A plain `--resume` restored nothing from the ledger. It failed with `missingPlanFile` and fell back to the default step list.
- **#9140.** Ship init seeds a fixed step list. The report said `review`, `version` and `pr` stayed `pending` under `--steps execute,commit`. The item expects the W4.2 reconcile to have fixed this; case (a) proves it.

**What prompted this change now?**

- The owner decided the directions on 2026-10-26 (`owner-q22.md`): Q22a option (1) and Q22b option (1). Arbiter ruling pr40 closed the two gaps Q22 left and ruled that `--quick` wins over the ledger (F1). The spec commit S1 states the rules; this plan implements them.

**What does success look like?**

- Case (a) passes at the unchanged `ship.js` (else STOP, the fix is not in this item).
- Cases (b)–(l) pass, every existing `ship-step:` and `ship-prepare` case still passes, and the in-ship commit has exactly the three files.

---

## Research Findings

Line numbers at bae33fd (pre-flight "Heavy line drift on W8.23"; re-read for this plan).

- **Flag merge.** `mergeFlags` (`skill/ship.js:193-269`) records `sources.steps` as `'cli'` (`:240-242`), `'quick'` (`:249`, and `:258` for an empty profile), `'config'` (`:261`) or `'default'` (`:264`). It is called at `:2249` as `const { merged: flags, sources: flagSources } = mergeFlags(cli, fileConfig);`.
- **Plan resolution.** `resolvePlanFile(cliPlanFile, errors)` (`:2438-2464`) is called at `:2466` with `cli.planFile || null`. It pushes `planFileNotFound`/`planFileNotMarkdown`.
- **Step computation.** `computeSteps` is called at `:2509`. Execute runs only when `flags.hasPlan` is true (`:431`). `ship-sdlc/SKILL.md:72` always passes `--has-plan`.
- **Validation.** `runValidation(flags, flagSources, steps, context)` (`:847`) pushes `missingPlanFile` at `:917-926` when `!context.planFile && executeWillRun`. Its message keeps "(#505)".
- **Resume detection.** `detectResumeState(projectRoot, gitState.currentBranch)` is called at `:2519`, AFTER plan and steps. The wrapper (`:982-988`) returns `{ stateFile, found, fresh, nextPendingStep, fullPath, worktreeMismatch }`.
- **The resume gates.**
  - The implicit gate is `:2543`: `if (resume && resume.found && resume.fresh && !cli.resume && !resume.worktreeMismatch) {`.
  - `claimSession` runs at `:2547` and `:2549`, gated on `errors.length === 0`.
  - The worktree-mismatch warning is `:2551-2557`.
- **The only state write on this path** is `ensureLedger` (`:1254-1282`), called at `:2579`. Its first line is `:1255` `if (errors.length > 0 || flags.dryRun) return null;`.
  - It runs `state/ship.js init` (and so `cmdInit`'s same-branch prune, R-ship-init-prune) only when it does not adopt a resumed ledger.
  - It fills `FROZEN_FLAG_KEYS` (`['planFile', 'openspecContext', 'sources']`, `:1165`) only when a key is absent (`:1275`).
  - So an error pushed before `:2579` means no init, no prune and no ledger write. An error pushed before `:2543` also means no `claimSession`.
- **Plan-mode-blocked path.** `--plan-mode-blocked` (`:2284-2307`) returns early and inits a ledger whose flags hold no `planFile` key. The next run adopts it, and `ensureLedger` freezes the CLI plan into it. The same holds for the legacy seed of case `ship-step: (g)` (`ship-prepare-exec.yaml:1915-1935`).
- **Wrapper.** `tests/promptfoo/scripts/run-ship-stepper.js`:
  - flags are parsed at `:85-99`; `initial()` is at `:159-162` and passes `--has-plan --plan <abs>` only when `--plan` is given;
  - the seed patches are `:208-248`, skipped for `initial`, `initial-dry-run`, `step-list-equal` and `ttl-days`;
  - the scenario `switch` starts at `:281`; `initial-resume-legacy` (`:290-292`) calls `initial()` on the seeded ledger without clearing it, and no case uses it yet;
  - the output JSON is printed at `:504-520`.
- **Fixture.** `project-ship-stepper/setup.sh` seeds:
  - `seed/ledger-frozen.json` with `flags.planFile` `"$PWD/plan.md"`, `flags.steps` the full list, `worktree` `"$PWD"`;
  - `plan.md` (two `### Task N:` headings) and `plan-notasks.md`.
  - It has no `.sdlc/local.json`, so the flag sources are `default`. It checks out `feat/ship`.
  - The wrapper names the seeded ledger `ship-feat-ship-20261019T120000Z.json`.
- **Envelope on error.** `writeOutput` writes the JSON file and prints its path on every exit (`lib/output.js:47-52`), so the wrapper reads the envelope (with `errors[]`) for a prepare that exits 1.
- **Config versions.** `CURRENT_SCHEMA_VERSION` is 4 (`lib/config-version.js:32`). The quick-profile fixture shape is `project-ship-quick-defined/.sdlc/local.json` (`{"schemaVersion": 4, "ship": {..., "quick": [...]}}`).
- **Cases.** The last `ship-step:` case is at `ship-prepare-exec.yaml:3447`. The W8.24 cases follow it, and the file ends at `:3527`. 88 descriptions start with `ship-step:`; none starts with `ship-resume-plan`.
- **State verbs.** `state/ship.js` has `skip --step <name> --reason <text>` (`:14`) and `cleanup-pipeline` (`:20`). `STATE_SHIP_SCRIPT` is defined at `skill/ship.js:1171`.
- **Consumer grep (addendum C9).** At bae33fd:
  - `run-ship-stepper.js` is used by `ship-prepare-exec.yaml` and `ship-review-gate-exec.yaml` (re-run: Verification (1) and (2));
  - `missingPlanFile` appears in the ship and execute specs, `skill/execute.js` (its own, separate error), the two SKILL.md files and the two prepare datasets. The ship message only gains a suffix, so every existing assertion (they match the id) holds;
  - `resumePlanMismatch` appears nowhere yet.
- **Compile probe.** The planner applied Task 2's edits to a scratch copy of `skill/ship.js` (not the repo): `node --check` passed, and the two greps of Task 2's acceptance printed `1` and `1`.
- **Prediction note.** The planner could not run `ship.js` against the stepper fixture (that needs its `setup.sh`, which only the test runner may run). The expected case outputs below are predictions from the code; Task 1's case (a) and Task 3's cases are the proof.

---

## Plan readings

Quoted from the plan source "Readings" list:

- **Spec-first** (arbiter 2026-10-20): "spec-consequence commits go FIRST; never record a waiver nobody gave." → S1 (direct-a Task 1) is on the branch before this run.
- **One ship run per wave branch**: "one ship run per branch (owner 2026-10-20, ruling w1-oneship)". → This plan is that run.
- **Ship line** (ruling w1-shipauto): `/sdlc:ship-sdlc --auto --plan <frozen feat plan> --steps execute,commit --rebase skip --quality balanced`.
- **In-ship commit** (ruling w1-run1commit item 2; ruling w1-plancheck m1; STANDING remedy ruling stop-1 item 2): "accepted when its files equal the plan's files; a subject that differs from the `**Commit:**` subject and/or a missing or wrong trailer is fixed by a message-only reword amend, disclosed, with no STOP; any other difference is a STOP."
- **No steering in ship-run dispatches** (ruling stop-6 Q1) and the **verbatim hard-rule block in every dispatch prompt** (ruling stop-5 Q3, widened by ruling stop-6 Q2). → Ship's dispatches get only this block, copied as one block:
  `HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop).`
- **`**Commit:**` by hand** (ruling w1-plan R3; plan-sdlc R66). → Header.
- **Repo files by Write/Edit only** (ruling stop-4 item 1): "Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed." → Every task.
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → 62.
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1). → No fixture file changes; the wrapper patches the seed, and no worker runs a `setup.sh` by hand.
- **Classifier refusals** (ruling w4-curl): "the task text tells execute's workers to stop and report on a classifier refusal and never switch tools; public docs only via WebFetch." → Every task.
- **Worker temp files** (ruling stop-w3-2): "a worker's ephemeral temp file is created under `$TMPDIR` and removed in its own run; none is left behind." → Every task.
- **No adapted verification** (ruling w2-judge row 52). → The Verification commands run as written; case outputs are marked as predictions.
- **R27 learnings append** (ruling scan-r3-and-r27): execute-plan-sdlc may skip it when the hard rules forbid the write; the skip is disclosed and the learning text named in the done-file.
- **Q22** (`owner-q22.md`): "Q22a, option (1). When a new ship run's `--plan` differs from the plan recorded in an existing ledger on the branch, ship STOPS with a clear `resumePlanMismatch` error and writes no state." "Q22b, option (1). A plain `--resume` restores the PLAN and the STEPS from the ledger. All other flags come from the CLI or config as usual, and anything given on the CLI wins." → Task 2.
- **Ruling pr40** (gaps and F1): an explicit `--resume` with a different `--plan` is `resumePlanMismatch`; a run with neither `--resume` nor `--plan` restores nothing and keeps `missingPlanFile`, with the ledger's plan and the `--resume` command in its message; `--quick` (source `quick`) wins over the ledger's steps. → Task 2; cases (g), (h), (i).
- **Ruling w2-planreview Q1** (M3 (b)): "The check therefore covers EVERY ledger found for the branch, whether stale, from another worktree or resume-eligible. If its plan differs from `--plan`, ship stops with `resumePlanMismatch`, before init and prune, and writes no state." "A ledger whose every step is already done or skipped belongs to a finished run … It keeps today's prune behaviour and does not stop the run." → Task 2; cases (j), (k), (l).
- **Files extensions:** none for this run. The three files are W8.23's code Files. The `docs/skills/ship-sdlc.md` update is a separate direct commit (ruling w2-planreview Q3, direct-b Task 1).
- **Standing rule** (ruling w2-plan): "no pkill/killall; kill only by a PID you started yourself (or TaskStop)."

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| A ledger whose `flags` has no `planFile` key is adopted as before (no plan comparison) | no | compares plans only when the key is present | The R64 plan-mode-blocked ledger and the legacy seed of case `ship-step: (g)` have no such key and are designed to adopt the CLI plan. Recorded in spec S1 (R-implicit-resume). |
| The plan comparison covers every unfinished ledger of the branch (fresh, stale, other worktree) | yes (ruling w2-planreview Q1, M3 (b)) | stops with `resumePlanMismatch` before init and prune; a finished ledger is not compared and keeps today's prune | Owner Q22a wording: "an existing ledger on the branch", "never auto-discards". R-ship-init-prune code stays untouched. |
| "Finished" = every step `completed` or `skipped`, or `pending` with a `condition` (a conditional step whose trigger never fired) | no | mirrors the terminal rule of `validatePipelineContract` (`state/ship.js:536-553`), minus `failed` | A `failed` step is resumable, so its ledger is unfinished. A finished ledger can exist: `cleanup-pipeline --force` keeps the file, and a run can stop after its last step before `cleanup-pipeline` runs (`state/ship.js:589-620`). Case (l) proves the prune. |
| Explicit `--resume` with a different `--plan` stops even on a finished ledger | no | `resumePlanMismatch` | Ruling pr40 gap (i): explicit `--resume` with a different plan is a mismatch. The finished-ledger precision applies to runs without `--resume`. |
| An unreadable ledger file is not compared | no | init replaces it as today | It records no readable plan, and `readState` already treats it as absent. |
| `--no-plan` passes `--has-plan` without `--plan` | no | the wrapper mirrors `ship-sdlc/SKILL.md:72`, which always passes `--has-plan` | Without `--has-plan`, execute is skipped and cases (d) and (i) would pass vacuously. |
| Three scenarios `resume-plan`, `resume-plan-auto`, `resume-plan-quick` | no | the wrapper gains these scenarios instead of more CLI flags | D-23c names only two new wrapper flags (`--steps`, `--no-plan`). |
| `docs/skills/ship-sdlc.md` `:48`, `:53`, `:62-66` | yes (ruling w2-planreview Q3) | updated in one direct docs commit after this run (direct-b Task 1) | Not part of this run's three Files; the doc must quote the shipped `missingPlanFile` text. |
| plan-sdlc learnings-log append | no | not written | The planner brief allows writes only under `docs/plans/`. |

---

## Key Decisions

1. **The ledger is read once, before the plan and the steps (D-23a).**
   - Choice: move the `detectResumeState` call from `:2519` to just before `resolvePlanFile` (`:2466`). Read the ledger's `flags` once, read-only, and reuse `resume` below.
   - Alternative: call it twice.
   - Why: one read, one source of truth. The stop-cap-exhausted block and the resume gates already use the same `resume` object.
2. **The mismatch error comes before any state write.**
   - Choice: push `resumePlanMismatch` right after `resolvePlanFile`.
   - Why that point: `ensureLedger` (`:1255` returns `null` when `errors.length > 0`) is the only writer, and `claimSession` (`:2547`, `:2549`) is gated on `errors.length === 0`. No init, no prune and no session stamp can follow.
   - The implicit gate also gets `&& !planMismatch`, so `flags.implicitResume` stays `false` on the error envelope.
3. **The steps are restored only when `flagSources.steps` is `config` or `default` (D-23b).**
   - Choice: a `cli` or `quick` source wins (ruling pr40 F1). The restored list reports `flagSources.steps = 'ledger'`.
   - Why: owner Q22b; `mergeFlags` sets exactly those four values.
   - `computeSteps`' `skipSource()` maps the new value to `'default'`, as for any unknown source. No consumer checks for `'ledger'`.
4. **Plan comparison (D-23a; ruling w2-planreview Q1).**
   - Scope: every ledger of the branch that `cmdInit`'s prune would remove: `parseStateFilename(name)` gives prefix `ship` and slug `slugifyBranch(branch)` (the same set as `lib/state.js` `pruneStateFiles`, `:582-606`). Fresh or stale, any worktree.
   - Each ledger is compared when it is unfinished, readable and has a `planFile` key in `flags`. A finished ledger is compared only under explicit `--resume`.
   - `samePlanPath(a, b)` compares `fs.realpathSync` of both sides, falling back to `path.resolve` when a path does not exist.
   - A non-string side never matches, so a recorded `planFile: null` differs from any CLI plan.
   - The comparison runs only when the CLI resolved a plan, so an invalid `--plan` gets only `planFileNotFound`.
   - A finished ledger of a different plan that is the resume candidate also disables implicit resume (`finishedOtherPlan`). Init then replaces it, which is today's prune (ruling precision); it is never adopted for another plan.
   - The first mismatching ledger (sorted by file name) is named in the error.
5. **Tests (D-23c).**
   - The wrapper gains `--steps <csv>`, `--no-plan`, the three `resume-plan*` scenarios, one seed patch and a `seedUnchanged` output field. The fixture is unchanged.
   - Cases (b), (c) and (i) use the existing `initial-resume-legacy` scenario (implicit path). Cases (d)–(h) use the `resume-plan*` scenarios (explicit `--resume`). Cases (j)–(l) use three more scenarios, `stale-plan`, `other-worktree-plan` and `finished-plan` (ruling w2-planreview Q1).
6. **Behavioural case (D-beh): none.**
7. **Workspace modes.** The change behaves the same under `ship.workspace` `continue`, `branch` and `worktree`. It reuses the unchanged `detectResumeState` (one state dir per main worktree, `resolveStateDir`) and the unchanged `worktreeMismatch` path (R-resume-worktree), compares plans by realpath, and writes no state on a mismatch.
8. **Task 2 is Complex/High on purpose.** It is one file, but it changes the resume path of every ship run, and a wrong order would let `claimSession` or init touch a ledger on an error path.

**Non-goals:**
- No change to `cmdInit`, its seeded list, `R-ship-init-prune`, `validatePipelineContract`, `FROZEN_FLAG_KEYS`, the never-overwrite rule, `detectResumeState`'s selection rule or `R-resume-worktree`.
- No directory scan or mtime rule for the plan (R72, R-PLANFILE).
- No restore of `auto`, `quality`, `draft`, `bump` or any other flag.
- No change to the `--plan-mode-blocked` path or to `--after` calls.

**Failure audience:** ship users who resume a run (`--resume`, or after compaction) or who start a second run on a branch with a leftover ledger. The orchestration benefits only after the owner's plugin swap.

---

## Contract Examples

```markdown
**Contract:**
- shape (code): `{ id: 'resumePlanMismatch', message }` pushed to `errors` (exit 1, mirrored to stderr by `writeFatalErrors`); no state write.
- names: `resumePlanMismatch`, `samePlanPath`, `readLedgerFlags`, `branchLedgers`, `ledgerFinished`, `planMismatch`, `finishedOtherPlan`.
- mirror: the `missingPlanFile` push at `skill/ship.js:917-926`.
- decisions: KD2, KD4.
- sync: spec S1 R-implicit-resume.
```

---

## Tasks

### Task 1: Wrapper flags and scenarios, and case (a) — re-verify #9140 at the unchanged ship.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case (a) inserted after the last `ship-step:` case. Locate it by content: the last line matching `^- description: "ship-step:` (`grep -n '^- description: "ship-step:' … | tail -1`; `:3447` at bae33fd, shifted down by the lines W8.10 added in direct-a Task 17). Insert before the next `- description:` line that follows it. All `ship-prepare-exec.yaml` line numbers in this plan are at bae33fd.

**Notes:** Item Change 1 and 4 (wrapper part). Case (a) runs BEFORE any `ship.js` edit. If it fails, STOP and report: the #9140 fix is not in this item's Change. All wrapper edits are additive, so every existing scenario keeps its behaviour.

**Acceptance criteria:**
- [ ] With PF-ENV: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-resume-plan"` passes 1 case (case (a)), with `skill/ship.js` still identical to HEAD (`git diff --quiet -- plugins/sdlc-utilities/scripts/skill/ship.js; echo $?` prints `0`). Record the case output in the done-file and the PR body (item W8.23 Change 1); it closes #9140 as fixed in source by W4.2.
- [ ] With PF-ENV: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-step|review-gate"`: 96 passed (88 + 8 at bae33fd; the wrapper edits change no existing scenario).

**Contract:**
- shape (code): new wrapper flags `--steps <csv>` (appended to every initial call as `--steps <csv>`) and `--no-plan` (initial calls pass `--has-plan` and no `--plan`); new scenarios `resume-plan`, `resume-plan-auto`, `resume-plan-quick`, `stale-plan` (seed back-dated 2 h), `other-worktree-plan` (seed `worktree` = the fixture's parent dir), `finished-plan` (seed recorded with `plan-notasks.md`, every non-conditional step `completed`); seed patches for them; new output field `seedUnchanged` (`true`/`false`, or `null` when no seed was written).
- names: `stepsCsv`, `noPlan`, `seedPath`, `seedBytes`, `seedUnchanged`.
- mirror: the existing flag parse (`:85-99`), `initial()` (`:159-162`), `seedLedger()` (`:183-190`), the seed patches (`:208-247`) and the output object (`:504-520`).
- decisions: KD5.
- sync: header comment `Args:`, scenario list and `Output JSON` lines (`:12-62`) list the new flags, scenarios and field.

```diff
 header :23-24
- *                        openspec
+ *                        openspec | resume-plan | resume-plan-auto | resume-plan-quick |
+ *                        stale-plan | other-worktree-plan | finished-plan
  *   --plan <path>        Plan passed to initial calls only (never to --after, L8)
+ *   --steps <csv>        Appended to every initial call as `--steps <csv>`
+ *   --no-plan            Initial calls pass --has-plan without --plan (ship-sdlc/SKILL.md always passes --has-plan)
 header :57-58
  *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], ledger, ledgerExists, ledgerFiles, execFiles, execPreGate, otherFiles,
- *     summarySidecars, commandScripts, stopCapExists, mdPrompts: { incomplete, allDone } }
+ *     summarySidecars, commandScripts, stopCapExists, mdPrompts: { incomplete, allDone }, seedUnchanged }
+ *   seedUnchanged = true when the seeded ledger file is byte-identical at the end; null when no seed was written
 :73-74
 let plan = null;
+let stepsCsv = null;
+let noPlan = false;
+let seedPath = null;
+let seedBytes = null;
 let resultRel = null;
 :97-99 (end of the parse loop)
   else if (args[i] === '--os-answer' && args[i + 1]) osAnswer = args[++i];
+  else if (args[i] === '--steps' && args[i + 1]) stepsCsv = args[++i];
+  else if (args[i] === '--no-plan') noPlan = true;
 }
 :246-248 (last seed patch, end of the patch callback)
     if (scenario === 'plan-no-tasks') data.flags.planFile = path.join(projectRoot, 'plan-notasks.md');
+    if (scenario.startsWith('resume-plan')) { data.flags.steps = ['execute', 'commit']; data.flags.auto = true; data.flags.quality = 'balanced'; }
+    if (scenario === 'other-worktree-plan') data.worktree = path.dirname(projectRoot);
+    if (scenario === 'finished-plan') {
+      data.flags.planFile = path.join(projectRoot, 'plan-notasks.md');
+      for (const s of data.steps) if (s.status === 'pending' && s.condition === undefined) s.status = 'completed';
+    }
   });
 }
 :516 (output object)
   summarySidecars: (() => { … })(),
+  seedUnchanged: seedBytes === null ? null : (fs.existsSync(seedPath) && fs.readFileSync(seedPath, 'utf8') === seedBytes),
```

```js

// :159-162
function initial(extra = []) {
  const planArgs = noPlan ? ['--has-plan'] : plan ? ['--has-plan', '--plan', path.resolve(projectRoot, plan)] : [];
  const stepArgs = stepsCsv ? ['--steps', stepsCsv] : [];
  return ship([...planArgs, ...stepArgs, ...extra]);
}

// seedLedger() (:183-190): after `fs.writeFileSync(statePath, JSON.stringify(data, null, 2));`
  seedPath = statePath;
  seedBytes = JSON.stringify(data, null, 2);

// switch (new cases, inserted before `  default:`)
  case 'resume-plan':
    initial(['--resume']);
    break;
  case 'resume-plan-auto':
    initial(['--resume', '--auto']);
    break;
  case 'resume-plan-quick':
    fs.mkdirSync(path.join(projectRoot, '.sdlc'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.sdlc', 'local.json'), JSON.stringify({ schemaVersion: 4, ship: { quick: ['execute', 'commit', 'pr'] } }));
    initial(['--resume', '--quick']);
    break;
  case 'stale-plan': {
    // Ruling w2-planreview Q1: a ledger older than the resume TTL (1 h) is still checked.
    const old = new Date(Date.now() - 2 * 3600000);
    fs.utimesSync(seedPath, old, old);
    initial();
    break;
  }
  case 'other-worktree-plan':
  case 'finished-plan':
    initial();
    break;
```

Case (a):

```yaml
- description: "ship-resume-plan: (a) a fresh initial call with --steps execute,commit records review, version and pr as skipped"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"
    script_args: "--project-root {{project_root}} --scenario initial --plan plan.md --steps execute,commit"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-ship-stepper"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const c = o.calls[0];
        if (c.exitCode !== 0) return `FAIL: exit ${c.exitCode}: ${JSON.stringify(c.envelope).slice(0, 400)}`;
        if (!o.ledger) return 'FAIL: no ledger';
        for (const n of ['review', 'version', 'pr']) if (o.ledger.stepStatuses[n] !== 'skipped') return `FAIL: ${n} is ${o.ledger.stepStatuses[n]}`;
        for (const n of ['execute', 'commit']) if (o.ledger.stepStatuses[n] !== 'pending') return `FAIL: ${n} is ${o.ledger.stepStatuses[n]}`;
        return true;
```

**Must not touch:** every existing scenario's behaviour; the fixture `project-ship-stepper/`; existing cases.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Any temp file is created under `$TMPDIR` and removed in your own run. Never run a fixture `setup.sh` by hand. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 2: skill/ship.js — read the ledger first, restore plan and steps on `--resume`, stop on a different plan

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — the `lib/state` import (`:44`), `runValidation` signature and the `missingPlanFile` message (`:847`, `:917-926`), four new module-level helpers after `detectResumeState` (`:982-988`), `main` around `resolvePlanFile` (`:2466`), the `runValidation` call (`:2512`), the removed later `detectResumeState` call (`:2519`), the implicit gate (`:2543`).

**Notes:** KD1–KD4; ruling w2-planreview Q1 (every unfinished ledger of the branch). Implement only Q22a (1) and Q22b (1); restore nothing but the plan and the steps. Never prune or rewrite a ledger on a plan mismatch. If a case shows `claimSession` stamping a ledger on an error path, STOP and report. `claimSession` stays gated on `errors.length === 0`.

**Acceptance criteria:**
- [ ] `grep -c "resumePlanMismatch" plugins/sdlc-utilities/scripts/skill/ship.js` prints `1` (the push; current: `0`).
- [ ] `grep -c "detectResumeState(projectRoot, gitState.currentBranch)" plugins/sdlc-utilities/scripts/skill/ship.js` prints `1` (moved, not duplicated; current: `1`).
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0.
- [ ] With PF-ENV: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "ship-step|ship-prepare|review-gate"`: 196 passed, 0 failed (88 `ship-step` + 100 `ship-prepare` after W8.10 + 8 `review-gate`).

**Contract:**
- shape (code): the helpers, the `main` block and the message suffix below. The new code reads the ledger file only; it never writes, renames or deletes it.
- names: `readLedgerFlags(resume)`, `samePlanPath(a, b)`, `ledgerFinished(data)`, `branchLedgers(branch)`, `ledgerFlags`, `planArg`, `planMismatch`, `finishedOtherPlan`, `resumeLedger` (fifth `runValidation` parameter).
- mirror: the `missingPlanFile` push (`:917-926`); `resolvePlanFile` (`:2438-2464`); `lib/state.js` `pruneStateFiles` (`:582-606`) for the ledger set; `state/ship.js` `validatePipelineContract` (`:536-553`) for the terminal rule.
- decisions: KD1–KD4; owner-q22; ruling pr40; ruling w2-planreview Q1.
- sync: spec S1 R11, R72, R-PLANFILE, R-implicit-resume.

```diff
 :44 (one name added to the lib/state import, after slugifyBranch)
-const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, findStateFile, readState, slugifyBranch, claimSession, …
+const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, findStateFile, readState, slugifyBranch, parseStateFilename, claimSession, …
```

New helpers after `detectResumeState` (`:982-988`):

```js
/**
 * R11 / R-implicit-resume (Q22): the resumed ledger's recorded flags, read once and
 * never written here. null when there is no ledger or it cannot be parsed.
 */
function readLedgerFlags(resume) {
  if (!resume || !resume.found || !resume.fullPath) return null;
  try {
    const data = JSON.parse(fs.readFileSync(resume.fullPath, 'utf8'));
    return data && data.flags && typeof data.flags === 'object' ? data.flags : null;
  } catch { return null; }
}

/** Two plan paths name the same file (realpath, else the resolved path); a non-string never matches. */
function samePlanPath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  return real(a) === real(b);
}

/**
 * Ruling w2-planreview Q1: a ledger belongs to a finished run when every step is completed or
 * skipped; a conditional step still pending (its trigger never fired) counts as skipped, as in
 * validatePipelineContract. A failed or pending step means unfinished.
 */
function ledgerFinished(data) {
  const steps = Array.isArray(data && data.steps) ? data.steps : [];
  return steps.length > 0 && steps.every(s => s.status === 'completed' || s.status === 'skipped'
    || (s.status === 'pending' && s.condition !== undefined));
}

/**
 * Q22a / ruling w2-planreview Q1: every readable ship ledger of the branch — the same set
 * cmdInit's prune would remove (lib/state.js pruneStateFiles) — fresh or stale, any worktree.
 * Read only; sorted by file name.
 */
function branchLedgers(branch) {
  const slug = slugifyBranch(branch);
  let dir;
  let names = [];
  try { dir = resolveStateDir(); names = fs.readdirSync(dir).sort(); } catch { return []; }
  const out = [];
  for (const name of names) {
    const parsed = parseStateFilename(name);
    if (!parsed || parsed.prefix !== 'ship' || parsed.slug !== slug) continue;
    const fullPath = path.join(dir, name);
    let data = null;
    try { data = JSON.parse(fs.readFileSync(fullPath, 'utf8')); } catch { continue; }
    out.push({ fullPath, flags: data && data.flags && typeof data.flags === 'object' ? data.flags : null, finished: ledgerFinished(data) });
  }
  return out;
}
```

`main`, replacing `:2466` `const planFile = resolvePlanFile(cli.planFile || null, errors);`:

```js
  // R11 / R-implicit-resume (Q22): read the branch's ledger once, before the plan and the
  // steps are resolved. An explicit --resume restores the plan and the steps and nothing else;
  // --steps / --quick win over the ledger's steps (ruling pr40 F1).
  const resume = detectResumeState(projectRoot, gitState.currentBranch);
  const ledgerFlags = readLedgerFlags(resume);
  let planArg = cli.planFile || null;
  if (cli.resume && ledgerFlags) {
    if (!planArg && typeof ledgerFlags.planFile === 'string') planArg = ledgerFlags.planFile;
    if (Array.isArray(ledgerFlags.steps) && ledgerFlags.steps.length > 0
        && (flagSources.steps === 'config' || flagSources.steps === 'default')) {
      flags.steps = ledgerFlags.steps.slice();
      flagSources.steps = 'ledger';
    }
  }
  const planFile = resolvePlanFile(planArg, errors);

  // R-implicit-resume (Q22a; ruling pr40 gap (i); ruling w2-planreview Q1): no unfinished ledger
  // of the branch — fresh or stale, any worktree — is resumed or discarded for a different plan.
  // Pushed before ensureLedger (the only state write: init and its prune; it returns null on
  // errors) and before claimSession. A ledger with no planFile key (legacy, --plan-mode-blocked)
  // is not compared. A finished ledger does not stop the run; if it is the resume candidate,
  // implicit resume is skipped so init replaces it as before (R-ship-init-prune).
  let planMismatch = false;
  let finishedOtherPlan = false;
  if (cli.planFile && planFile) {
    for (const led of branchLedgers(gitState.currentBranch)) {
      if (!led.flags || !('planFile' in led.flags) || samePlanPath(planFile, led.flags.planFile)) continue;
      if (led.finished && !cli.resume) {
        if (resume && resume.fullPath === led.fullPath) finishedOtherPlan = true;
        continue;
      }
      planMismatch = true;
      errors.push({
        id: 'resumePlanMismatch',
        message:
          'ship-sdlc will not resume or discard a run of a different plan. ' +
          `The ship ledger ${led.fullPath} on this branch belongs to an unfinished run with plan ${led.flags.planFile || '(none recorded)'}; this run was given --plan ${planFile}. ` +
          'Fix: continue the earlier run with --resume (and its plan), or discard it with ship\'s own verbs: ' +
          `node "${STATE_SHIP_SCRIPT}" skip --step <name> --reason <text> for each leftover step, then node "${STATE_SHIP_SCRIPT}" cleanup-pipeline. ` +
          'Ship never resumes a different plan and never discards the earlier ledger itself.',
      });
      break;
    }
  }
```

Later in `main`:

```diff
 :2512
-  const validation = runValidation(flags, flagSources, steps, context);
+  // Ruling pr40 gap (ii): with neither --resume nor --plan, nothing is restored; missingPlanFile
+  // names the ledger. Any ledger on the branch is named; --resume can continue it (R11).
+  const resumeLedger = resume && resume.found && !cli.resume
+    ? { fullPath: resume.fullPath, planFile: ledgerFlags && typeof ledgerFlags.planFile === 'string' ? ledgerFlags.planFile : null }
+    : null;
+  const validation = runValidation(flags, flagSources, steps, context, resumeLedger);
 :2518-2519 (delete; read once above)
-  // Detect resume state
-  const resume = detectResumeState(projectRoot, gitState.currentBranch);
 :2543
-  if (resume && resume.found && resume.fresh && !cli.resume && !resume.worktreeMismatch) {
+  if (resume && resume.found && resume.fresh && !cli.resume && !resume.worktreeMismatch && !planMismatch && !finishedOtherPlan) {
```

`runValidation`:

```diff
 :847
-function runValidation(flags, flagSources, steps, context) {
+function runValidation(flags, flagSources, steps, context, resumeLedger = null) {
 :924 (inside the missingPlanFile push; the existing text is unchanged except that this last piece's trailing `,` becomes ` +`)
-        'If you did not mean to run execute, drop --has-plan (or omit execute from --steps) and the pipeline will skip it.',
+        'If you did not mean to run execute, drop --has-plan (or omit execute from --steps) and the pipeline will skip it.' +
+        (resumeLedger
+          ? ` A ship ledger for this branch exists: ${resumeLedger.fullPath} (recorded plan: ${resumeLedger.planFile || 'none'}). To continue that run with its plan, re-run with --resume.`
+          : ''),
     });
```

The JSDoc above `runValidation` gains one `@param {{fullPath: string, planFile: string|null}|null} [resumeLedger]` line.

**Must not touch:** `cmdInit` and `state/ship.js`; `ensureLedger`, `FROZEN_FLAG_KEYS` and `reconcileSteps`; `mergeFlags`; `resolvePlanFile`; `lib/state.js` `detectResumeState`; the worktree-mismatch warning text (`:2551-2557`); the `--plan-mode-blocked` path; `runAfter` and every `--after` path; the existing `missingPlanFile` text, "(#505)" included.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Any temp file is created under `$TMPDIR` and removed in your own run. Never run a fixture `setup.sh` by hand. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 3: Cases (b)–(l) and the full Verification

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — cases (b)–(l), directly after case (a).

**Notes:** Item Change 4 cases (b)–(i), plus (j)–(l) for ruling w2-planreview Q1, descriptions starting `ship-resume-plan: `. Shared values: `script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/project-ship-stepper"`. The seeded ledger is `ship-feat-ship-20261019T120000Z.json`, recorded with `<fixture>/plan.md`.

**Acceptance criteria:**
- [ ] Verification (1)–(3) of the plan header pass as written: 200 passed for `ship-resume-plan|ship-step|ship-prepare`; 8 for `review-gate`; `check-consistency.js` exits 0.
- [ ] Every existing `ship-step:` case is unchanged (`git diff -U0 -- tests/promptfoo/datasets/ship-prepare-exec.yaml | grep -c '^-[^-]'` prints `0`: only added lines).

**Contract:**
- shape (code): eleven exec cases; each asserts one JSON shape of the wrapper output.
- names: `ship-resume-plan: (b)` … `(l)`.
- mirror: case `ship-step: (g)` (`:1915-1935`) and case (a).
- decisions: KD3, KD5.
- sync: spec S1 acceptance lines.

| Case | `script_args` (after `--project-root {{project_root}}`) | The javascript assertion requires |
|---|---|---|
| (b) different `--plan`, no `--resume` | `--scenario initial-resume-legacy --seed frozen --plan plan-notasks.md` | `calls[0].exitCode === 1`; an `errors[]` entry with `id === 'resumePlanMismatch'` whose message matches `/\/plan\.md\b/`, `/plan-notasks\.md/` and contains `ship-feat-ship-20261019T120000Z.json`; `seedUnchanged === true`; `ledgerFiles.join() === 'ship-feat-ship-20261019T120000Z.json'` |
| (c) same plan, no `--resume` | `--scenario initial-resume-legacy --seed frozen --plan plan.md` | `exitCode === 0`; `envelope.flags.implicitResume === true`; `envelope.state_file` ends `ship-feat-ship-20261019T120000Z.json` |
| (d) `--resume`, no `--plan` | `--scenario resume-plan --seed frozen --no-plan` | `exitCode === 0`; no `missingPlanFile`; `context.planFile` matches `/\/plan\.md$/`; `JSON.stringify(flags.steps) === '["execute","commit"]'`; `flags.sources.steps === 'ledger'`; `flags.auto === false && flags.sources.auto === 'default'`; `!('quality' in flags)` |
| (e) `--resume --steps execute` | `--scenario resume-plan --seed frozen --no-plan --steps execute` | `exitCode === 0`; `JSON.stringify(flags.steps) === '["execute"]'`; `flags.sources.steps === 'cli'`; `context.planFile` matches `/\/plan\.md$/` |
| (f) `--resume --auto` | `--scenario resume-plan-auto --seed frozen --no-plan` | `exitCode === 0`; `flags.auto === true && flags.sources.auto === 'cli'`; `JSON.stringify(flags.steps) === '["execute","commit"]'` |
| (g) `--resume --quick` | `--scenario resume-plan-quick --seed frozen --no-plan` | `exitCode === 0`; `JSON.stringify(flags.steps) === '["execute","commit","pr"]'`; `flags.sources.steps === 'quick'` |
| (h) `--resume` with a different `--plan` | `--scenario resume-plan --seed frozen --plan plan-notasks.md` | as (b): `exitCode === 1`, `resumePlanMismatch` naming both plans and the ledger, `seedUnchanged === true`, one ledger file |
| (i) neither `--resume` nor `--plan` | `--scenario initial-resume-legacy --seed frozen --no-plan` | `exitCode === 1`; a `missingPlanFile` error whose message contains `ship-feat-ship-20261019T120000Z.json`, matches `/\/plan\.md\b/` and contains `--resume`; no `resumePlanMismatch`; `seedUnchanged === true` (no `claimSession` on the error path) |
| (j) stale ledger, different `--plan` | `--scenario stale-plan --seed frozen --plan plan-notasks.md` | as (b): `exitCode === 1`, a `resumePlanMismatch` error naming `/\/plan\.md\b/`, `plan-notasks.md` and `ship-feat-ship-20261019T120000Z.json`, `seedUnchanged === true`, `ledgerFiles.join() === 'ship-feat-ship-20261019T120000Z.json'` (no init, no prune) |
| (k) other-worktree ledger, different `--plan` | `--scenario other-worktree-plan --seed frozen --plan plan-notasks.md` | as (j) |
| (l) finished ledger, different `--plan` | `--scenario finished-plan --seed frozen --plan plan.md` | `exitCode === 0`; no `resumePlanMismatch`; `envelope.flags.implicitResume === false`; `ledgerFiles.length === 1` and `!ledgerFiles.includes('ship-feat-ship-20261019T120000Z.json')` (init pruned the finished ledger and wrote a new one); `seedUnchanged === false` |

Every assertion reads `const o = JSON.parse(output); const c = o.calls[0]; const e = c.envelope;` and returns a `FAIL: …` string naming the first failed check, or `true` (the style of case (a)). Example, case (d):

```yaml
- description: "ship-resume-plan: (d) --resume without --plan restores the ledger's plan and steps and no other flag"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"
    script_args: "--project-root {{project_root}} --scenario resume-plan --seed frozen --no-plan"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-ship-stepper"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const c = o.calls[0];
        const e = c.envelope;
        if (c.exitCode !== 0) return `FAIL: exit ${c.exitCode}: ${JSON.stringify(e.errors)}`;
        if ((e.errors || []).some(x => x && x.id === 'missingPlanFile')) return 'FAIL: missingPlanFile';
        if (!/\/plan\.md$/.test(e.context.planFile || '')) return `FAIL: planFile ${e.context.planFile}`;
        if (JSON.stringify(e.flags.steps) !== '["execute","commit"]') return `FAIL: steps ${JSON.stringify(e.flags.steps)}`;
        if (e.flags.sources.steps !== 'ledger') return `FAIL: steps source ${e.flags.sources.steps}`;
        if (e.flags.auto !== false || e.flags.sources.auto !== 'default') return `FAIL: auto ${e.flags.auto}/${e.flags.sources.auto}`;
        if ('quality' in e.flags) return `FAIL: quality restored ${e.flags.quality}`;
        return true;
```

If case (c) or (i) shows `implicitResume: false` (the seed not picked up as fresh and same-worktree), STOP and report; do not edit the seed or the fixture.

**Must not touch:** every existing case of `ship-prepare-exec.yaml`; the fixture `project-ship-stepper/`.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Any temp file is created under `$TMPDIR` and removed in your own run. Never run a fixture `setup.sh` by hand. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

---

## Final Shape

- `skill/ship.js` reads the branch's ledger once, before the plan and the steps.
  - An explicit `--resume` takes the plan and the steps from the ledger, unless the CLI gives `--steps` or `--quick`. Every other flag comes from the CLI, config or default.
  - A run whose `--plan` differs from the plan of any unfinished ledger of the branch (fresh or stale, any worktree) stops with `resumePlanMismatch` before any state write. A finished ledger of another plan is replaced by init as before.
  - A run with neither `--resume` nor `--plan` keeps `missingPlanFile`, and the message names the ledger's plan and `--resume`.
- `run-ship-stepper.js` has `--steps`, `--no-plan`, six new scenarios and `seedUnchanged`. `ship-prepare-exec.yaml` has twelve `ship-resume-plan:` cases; case (a) closes #9140 with evidence.
- One in-ship commit, `fix(#9019): ship-sdlc - resume honours the ledger plan (W8.23)`, with exactly the three files.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)* Five lanes and three lenses over all four wave plans; iteration 2 (architecture, changed sections) Approved.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 1 |
| Correctness | 1 | 2 | 1 | 1 |
| Coherence | 0 | 1 | 0 | 1 |

What was found and applied:
- The CRITICAL was the `missingPlanFile` diff, which did not compile. It is fixed, and a scratch `node --check` passes.
- Warnings applied: the case-(a) anchor located by content; the STOP note for cases (c)/(i); the per-mode KD7.
- Fix round fix1 (Opus plan review and ruling w2-planreview):
  - M2: `resumeLedger` names any ledger of the branch;
  - Q1 (M3 (b)): every unfinished ledger is checked, with cases (j)–(l);
  - Q3 (M6): the skill-doc commit is in direct-b;
  - m2: the verbatim hard-rule block is quoted;
  - M5: case (a) output goes to the PR body.
  - The scratch `node --check` was re-run on the new Task 2 code.

| Requirement (plan source) | Task(s) | Status |
|---|---|---|
| Case (a) at the unchanged base first (#9140 re-verify) | 1 | covered |
| D-23a read order, mismatch before any state write, `claimSession` gate | 2 | covered |
| D-23b steps restore only for `config`/`default` | 2 | covered |
| D-23c wrapper flags, seed patch, cases (a)–(l) | 1, 3 | covered |
| Ruling w2-planreview Q1: every unfinished ledger; stale and other-worktree cases with byte-identical proof; finished ledger pruned | 2, 3 (cases (j)–(l)) | covered |
| `**Commit:**` header by hand, three Files, pre-ship clean tree | header | covered |

**Verdict:** No critical issues. Ready for archive (with noted improvements).

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
