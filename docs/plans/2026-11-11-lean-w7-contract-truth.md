# Lean Wave 7 Contract Truth Implementation Plan

**Commit:** `fix(#9349): ship - contract truth, gh preflight, worker rules`
**Goal:**
- Make the ship, execute and pr specs say what the code does (#9127, #9131, #9137).
- Ask for gh authentication only when a selected step needs gh (#9352), and name a gh timeout as a timeout (#9237).
- Give ship one progress line per execute wave and stop a mid-wave hand-back from being recorded as an execute failure (#9347, ledger F-28 and F-29).
- Warn when `--quality minimal` overrides a configured spec reviewer (#9173).
- Show `gh pr create` warnings on success (#9192).
- Remove cross-call shell variables from execute and harden prose (#9235, #9236).
- Forbid `cat >>` appends and undeclared `git worktree add` in the worker prompts (#9320).
**Architecture:** Specs first: ship-sdlc R91 to R93, execute-plan-sdlc R86 to R88 and P1, pr-sdlc E9, plus the text fixes of #9127/#9131/#9137. Then scripts with exec cases: `ship.js` (gh gating, mid-wave guard, change-name regex), `lib/git.js` (`probeGhAuth` timeout), `state/execute.js wave-watch`, `skill/execute.js` (spec-reviewer warning), `openspec-step.js`. Then SKILL.md, agent and doc prose, checked by a deterministic sentinel case.
**Source:** conversation context (lean wave 7 brief, tracking #9349; items quoted from `.sdlc/orchestration/todos.md`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-prepare: gh-gating|ship-prepare: P8 migration|ship-step: \(mw|ship-step: openspec change name with a leading|openspec-step: .*leading|openspec-step: tasks rejects|git-lib: probeGhAuth|git-lib: exec\(\) gives every gh call|execute-plan-sdlc/liveness/wave-watch|execute-prepare: \(s4\)|execute-plan-sdlc/handback|ship-step: \(u\)|ship-step: \(pq6\)" -j 2 --no-cache`, then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`, `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`

---

## Context

**What problem does this change solve?**

- Several spec lines in `docs/specs/ship-sdlc.md` describe behaviour the code no longer has. Examples: P8 says `migration` can be null, but the code always emits an object. R-archive-sync-3 says "abort" exits 1, but the step table of the same spec says it ends the run with `cancel`.
- `ship.js` refuses every run when `gh` (the GitHub command-line tool) is not logged in, even a run that only commits. Wave 3 hit this as a hard stop (ledger F-33).
- When `gh auth status` times out, the user reads "Not logged in", which sends them to the wrong fix.
- In lean mode, ship printed one progress line for the whole execute step instead of one per wave (F-28). In one run the execute subagent returned while its workers were still running, and ship recorded execute as failed (F-29).
- `--quality minimal` silently replaces a configured `execute.specReviewer: once`.
- On a successful `gh pr create`, the command's warnings are deleted unread.
- Some skill prose still passes values between Bash calls in shell variables. Each Bash call is its own shell, so such a variable is empty in the next call.
- The worker prompts do not forbid appends with `cat >>` or creating a git worktree on their own.

**What prompted this change now?**

- Lean wave 7 (#9349) groups the remaining "contract truth" items for ship, execute, pr and harden. It runs after wave 3, which edits the same ship files.

**What does success look like?**

- Every changed spec line matches the code, and `validate-spec-shape.js` passes.
- `ship.js --steps commit` with an unauthenticated `gh` prepares without an error; `--steps commit,pr` still stops with the login message.
- A timed-out `gh auth status` reports a timeout.
- During ship's execute step, one line per finished wave appears; a mid-wave hand-back ends the run with a resume instruction instead of a failed execute.
- The targeted exec cases above pass.

## Research Findings

Every item was re-checked at HEAD `5a44a90` (discovery brief findings `F-<dim>-<n>`). Paths below start at `plugins/sdlc-utilities/` unless they start with `docs/` or `tests/`.

- **#9127 reproduces.** P8 (`docs/specs/ship-sdlc.md`, `## Prepare script contract`) says `migration` is "Null only when both calls were short-circuited". `ship.js` builds `let migrationManifest = { ...(cv.migration || {}), infrastructure: cv.infrastructure }`, which is never null. `lib/config-version-prepare.js::ensureConfigVersion` leaves `migration` null on skip and fills one key per role that did not throw (F-ship-spec-text-truth-1).
- **#9131 reproduces.** R-projectroot-ship says all project-root resolutions go through `resolveSdlcRoot()`. `ship.js` main also computes `contentRoot = resolveActiveWorktreeSafe()` for OpenSpec scans, and `openspec-step.js` uses the active worktree too (F-ship-spec-text-truth-2).
- **#9137 reproduces, sub-item by sub-item.** R22 says "inline via bash", but the step runs `openspec-step.js archive` (F-ship-spec-text-truth-3). R-verify-openspec-3 gives `validateChangeStrict(changeName)` and an `openspec validate --strict` invocation; the real signature is `validateChangeStrict(projectRoot, changeName)` and the emitted command is `node "<abs>/openspec-step.js" validate --change "<n>"` (-4). I12 repeats the old text, and C7 has no exception for the non-blocking `verify-openspec` step (-5). R27 names `projectRoot` where the code uses the active-worktree root (-6). R-archive-sync-3 says abort is "exit 1"; the step table says `done` with `ext.reason: "cancel"` (-7). `CHANGE_NAME_RE` in `openspec-step.js` and `OPENSPEC_CHANGE_RE` in `ship.js` accept a leading `-`, and `lib/openspec.js` passes the name to the `openspec` CLI with no `--`, so `-x` reaches the CLI as an option (-8). `docs/openspec-integration.md` still says the integration is read-only and calls no OpenSpec CLI (-9).
- **#9173 reproduces.** `skill/execute.js` forces `per-wave` under `--quality minimal` and sets `sources.specReviewer = 'quality'` with no warning, also when the config said `once` (F-execute-quality-and-worker-bans-1, -2).
- **#9192 reproduces.** In `skills/pr-sdlc/SKILL.md` Create mode, step 2 goes straight to step 4 (`rm -f '<ERR_FILE>'`) on `GH_EXIT` 0, so success warnings are lost (F-cross-call-shell-variable-fixes-3).
- **#9235 reproduces.** `skills/execute-plan-sdlc/commit-waves.md` runs `node "$STATE_SCRIPT" wave-committed … --sha "$committedSha"` after a separate `committedSha=$(git rev-parse HEAD)` block. `wave-runner-template.md` shows `STATE_SCRIPT="<PLUGIN_ROOT>/…"` as an assignment, and `recovering-from-failures.md` says "same root as `$STATE_SCRIPT`" (-5, -6, -7). SKILL.md 5c-quater carries a workaround sentence for the old form.
- **#9236 does not reproduce as a shell bug.** `skills/harden-sdlc/SKILL.md` writes `$MIRROR` in two prose lines, but the value is model-held output named `MIRROR` a few lines earlier. No Bash call reads a shell variable. The plan keeps a two-line notation fix so the `#9190` class grep finds nothing (-8 to -10).
- **#9237 reproduces.** `lib/git.js::probeGhAuth` maps a null `gh auth status` result to "Not logged in". `exec()` returns null for a timeout, a non-zero exit and a missing `gh` alike (F-execute-quality-and-worker-bans-8, -9). `pr.js` and `ship.js` show `errorMessage` verbatim, so no consumer change is needed (-10).
- **#9320 reproduces.** The three worker agents ban `cat >` but not `cat >>`, and no worker file mentions worktrees (-5, -6).
- **#9347 cause.** No contract gives the parent a per-wave signal: execute's progress is TodoWrite only, and execute SKILL.md says that TodoWrite is not visible to the parent; ship prints one line per step (F-ship-execute-handback-progress-cause-4, -5). No rule says "do not end the turn while dispatched workers run": the await barrier only forbids consolidating early (-2), and `agents/ship-step-execute.md` says nothing about when to return (-1). Ship records any failed or unparseable execute return as a failure; the completeness gate also fails a success return whose tasks are unfinished (-3). The exact harness event that ended the subagent was not seen in the ledger, so the plan adds both the missing contract and a script guard.
- **#9352 reproduces.** `ship.js::runValidation` pushes the gh error whenever `context.ghAuthenticated` is false, whatever `--steps` says. `computeSteps` runs before `runValidation`, so the step list is available there (F-ship-gh-preflight-gating-and-infra-1, -2). Steps that call gh: `pr`, `verify-pipeline`, `await-remote-review` (both auto-skip without `pr`). `review` and `received-review` use gh only to find or read an open PR and work without it (-4). The gh stub always answers "logged in", so a new unauthenticated stub is needed (-5).
- **Spec ids.** ship-sdlc ends at R89; wave 3 adds R90, so this plan uses R91 to R93. execute-plan-sdlc ends at R85, so R86 to R88 are free. pr-sdlc ends at E8, so E9 is free.
- **Overlap with wave 3** (`docs/plans/2026-11-11-lean-w3-ship-models-setup.md`): it edits `ship.js` (step models), ship spec R90/C16/P7, the `dispatch_*` bullet of ship SKILL.md Step 5, the frontmatter of `agents/ship-step-execute.md`, the pr-sdlc key-fields table, `pr.js` and `CHANGELOG.md`. This plan touches none of those regions; it edits by anchor text because line numbers will shift.
- **Tests and tools.** Exec cases run through `providers/script-runner.js`; `setup.sh` in a fixture runs in a fresh temp copy. Site copies under `site/src/content-source/` are byte copies of `docs/` (`site/scripts/copy-docs.mjs`); recent plans have no site copy. `CHANGELOG.md` `[Unreleased]` is empty at HEAD; waves 3 and 6 also append there.

## Decisions taken without the owner

No owner was available. Each choice below took the recommended or narrowest option.

1. **gh-needing steps are `pr`, `verify-pipeline` and `await-remote-review`.** `review` and `received-review` only read or post to an existing PR and degrade without gh, so they get a warning, not an error.
2. **The repo-access and account-mismatch errors follow the same gate.** They describe gh identity, so they block only when a gh step will run; otherwise they become one warning.
3. **#9236 is kept as a notation fix**, not dropped, because the architect kept it and the change is two words.
4. **F-28 fix is script-driven.** Ship's main thread watches the execute state file with a new `state/execute.js wave-watch` subcommand under `Monitor`. The alternative, a `SendMessage` from the execute subagent to its parent, depends on harness behaviour this plan cannot verify.
5. **F-29 gets a contract plus a guard.** The cause could not be pinned to one harness event, so execute and the ship-step-execute agent gain a "never end the turn mid-wave" rule (R86), and `ship.js` turns a failed execute return with a wave still `in_progress` into a resume stop (R93).
6. **The change-name pattern becomes `^[A-Za-z0-9][A-Za-z0-9._-]*$`** in `openspec-step.js` (every subcommand that takes `--change`) and `ship.js`. It also rejects `.` and `..`, so the separate dot check is no longer needed. The three existing `openspec-step:` cases that assert the old message are updated.
7. **Prose-only contracts are checked by a deterministic sentinel case**, after the precedent `check-dispatch-resilience-sentinel.js`. The pr E9 prose gets one behavioural case that is written but not run (behavioural runs are user-initiated).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| #9236 | no | two-word notation fix, not a shell fix | the finding shows no real cross-call variable; see Decision 3 |
| #9347 | no | contract (R86, R92) plus script guard (R93) | cause found as a missing contract; the exact harness event was not seen; see Decisions 4 and 5 |
| #9352 scope | no | gates three gh steps; review/received-review warn only | narrowest gate that keeps an error for every step that needs gh; see Decision 1 |
| P8 exec cases | no | adds two `ship-prepare: P8 migration` cases to the gh-gating task | proof for the spec text; same dataset as Task 6, so one task edits it |
| Behavioural case for pr E9 | no | written, not run | AGENTS.md: behavioural runs are user-initiated |
| Plan site copy | no | none | recent plans (m9, lean) have no site copy |

## Key Decisions

- **Gate on computed steps, not on raw `flags.steps`.** `verify-pipeline` and `await-remote-review` are skipped when `pr` is not selected, even if listed. Reading `steps[].status === 'will_run'` reuses that rule instead of copying it.

- **Keep the gh probes, gate only the errors.** `probeGhAuth` is a local call, and `probeRepoAccess` runs only when gh is logged in. Moving the probes after `computeSteps` would reorder `main()`, which wave 3 also edits. Gating in `runValidation` is a smaller change.

- **Timeout detection lives inside `probeGhAuth`.** The default path calls `exec(…, { throwOnError: true })` and reads the error code. An injected `execFn` keeps its old null contract, so existing callers and tests do not change.

- **Mid-wave hand-back reuses the pending-question stop.** Ship's SKILL.md already prints a pending question and its resume commands and stops. A new envelope reason would need new SKILL.md handling.

- **`wave-watch` prints finished waves only.** One line per finished wave is what F-28 asks for. It exits by itself when the state file goes away (execute cleaned up) or at its timeout, so a forgotten monitor does not run forever.

- **Spec reviewer warning only for a configured value.** The default `once` changing to `per-wave` under `minimal` is documented behaviour (P1); only an explicit config value is surprising.

- **The root problem.** The specs and prompts on the ship path promise behaviour the code does not have, and a few code paths fail for reasons the user cannot act on. Every task either makes a contract true or makes the code match it.

- **Smallest viable cut.** The must-haves are #9352 (it blocked wave 3) and #9347 (it hides real execute progress and misreports failures). The spec-text items are small and touch the same files, so doing them now avoids a second pass. Task 14 (sentinel case) is the only addition beyond the items: it is the cheapest deterministic proof for prose contracts.

- **Who is hurt if this ships wrong.** Ship users: a wrong gh gate either blocks runs again or lets a `pr` step start without gh; a wrong R93 guard could hide a real execute failure behind a resume prompt. The exec cases cover both directions (`gh-gating (a)`/`(b)`, `(mw)` with `(u)`/`(pq6)`).

- **Workspace modes.** Both new state reads (`wave-watch`, the R93 check) go through `readState`, which resolves the main worktree's `.sdlc/execution/` with `resolveStateDir()`. So they work the same in a `branch` run (main worktree) and a `continue` run in a linked worktree. The gh gate reads only the prepare output.

- **Idempotency of the changed preflight.** The gh gate is a pure function of the probe result and `steps[]`; it writes no state, so a second prepare gives the same result. The `(a)`/`(b)` cases fix both outcomes.

- **Pull request.** The ship PR body links the tracking issue and the items: `Closes #9349`, and `Fixes #9127, #9131, #9137, #9173, #9192, #9235, #9236, #9237, #9320, #9347, #9352` where these are GitHub issues; for tracking ids that are not GitHub issues, pr-sdlc names them in the body without a closing keyword.

- **Non-goals.** No change to plan-sdlc (wave 6), to validators, test hygiene or the headless runner (wave 8), to jira (wave 4), to the GitHub issues skill (wave 5), or to anything in the wave 3 plan (step models, `ship-step-execute` frontmatter, the `dispatch_*` bullet, C16/P7, `pr.js`). No move of the gh probes inside `main()`. No `SendMessage`-based progress. No `--` separator in `lib/openspec.js` CLI calls.

## Contract Examples

**Code** (Task 6):

```markdown
**Contract:**
- shape (code): `GH_STEPS = ['pr', 'verify-pipeline', 'await-remote-review']`; `runValidation(flags, flagSources, steps, context, resumeLedger)` pushes the gh problems into `errors` when a `GH_STEPS` step has `status === 'will_run'`, else one line into `warnings`.
- names: `GH_STEPS`, `ghProblems`, `ghStepsToRun`.
- mirror: the existing error pushes in `runValidation` (`ship.js`, block under "gh auth must be true").
- decisions: Key Decisions "Gate on computed steps".
- sync: spec R91 (Task 2); SKILL.md validation text (Task 13).
```

**Docs** (Task 16):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/openspec-integration.md` — Overview sentence, `### Step 6`, Design Principles 1, 3 and 4; audience: plugin users.
- names: headings unchanged.
- mirror: the existing Step 6 block style.
- decisions: describe ship's `verify-openspec` and `archive-openspec` steps as the only writers.
- sync: byte copy at `site/src/content-source/openspec-integration.md`.
```

**OpenSpec / spec** (Task 2):

```markdown
**Contract:**
- shape (openspec): ADD `R91`, `R92`, `R93` to `docs/specs/ship-sdlc.md`; MODIFY `G1`, `E2` and phase 3; numbering continues after wave 3's `R90`.
- names: `R91`, `R92`, `R93` (new); `G1`, `E2` (modified).
- mirror: requirement-with-Acceptance style of R89.
- decisions: ids above R90 so they cannot clash with wave 3.
- sync: Tasks 6, 7, 14 implement them.
```

## Tasks

### Task 1: ship spec text truth (#9127, #9131, #9137)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — P8, R-projectroot-ship, R22, R27, R-archive-sync-3, R-verify-openspec-3, I12, C7, the `verify_version_tag` step-table row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Text-only corrections to match the code at HEAD (F-ship-spec-text-truth-1 to -8). The regex text in the step-table row changes together with the code in Task 8. R90, C16 and P7 belong to wave 3 and are not touched.

**Acceptance criteria:**
- [ ] P8 says `migration` is always an object and names the skip and failure shapes.
- [ ] R-projectroot-ship separates the config/state root (`resolveSdlcRoot()`) from the branch-content root (`resolveActiveWorktreeSafe()`).
- [ ] R-archive-sync-3 no longer says "exit 1"; it matches the `archive_openspec` abort row of the step table.
- [ ] R22, R-verify-openspec-3 and I12 name `openspec-step.js` and the real `validateChangeStrict(projectRoot, changeName)` signature.
- [ ] C7 names the non-blocking `verify-openspec` exception.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` passes; the site copy is byte-identical (`cmp`).

**Contract:**
- shape (openspec): MODIFY only; no new ids. Before → after:

  | Id | Before (excerpt) | After |
  |---|---|---|
  | P8 | `migration` (object \| null) … "Null only when both calls were short-circuited by `SDLC_SKIP_CONFIG_CHECK=1` or `--skip-config-check`. On migration failure, `migration` is null AND `errors[]` carries the failing step identifier." | `migration` (object, never null) — `{ project?, local?, infrastructure? }`. `project` and `local` are the `verifyAndMigrate` results (`{ schemaVersion, migrated, backupPath, stepsApplied }`), one per role that ran without error; both are absent when the check is skipped (`SDLC_SKIP_CONFIG_CHECK=1` or `--skip-config-check`). `infrastructure` is the `.sdlc/` infrastructure result, computed whatever the skip, absent only when it failed. On any failure `errors[]` carries `config-version: <role>: <message>` and prepare exits 1. Acceptance: exec cases `ship-prepare: P8 migration (a)` and `(b)`. |
  | R-projectroot-ship | "All projectRoot resolutions … MUST route through `resolveSdlcRoot()`" | Config, ledger and other `.sdlc/` paths resolve through `resolveSdlcRoot()` (the main worktree). Branch content — OpenSpec changes and `tasks.md`, the archive check, tags and commit subjects — is read from the active worktree root, `resolveActiveWorktreeSafe()` (`lib/git.js`), in `skill/ship.js` and `skill/openspec-step.js`. `process.cwd()` is not a project-root source outside documented bootstrap entry points. Acceptance line keeps its first and last clauses and adds: "OpenSpec detection called from a linked worktree reads that worktree's `openspec/`." |
  | R22 | "dispatched inline via bash (validation + archive + commit)" | "run inline as one script call, `node "<abs>/openspec-step.js" archive --change "<n>" --decision <decision>` (validation, archive and commit)" |
  | R27 | `isArchived(projectRoot, changeName)` | `isArchived(<active worktree root>, changeName)` (R-projectroot-ship) |
  | R-archive-sync-3 | "`abort` (halt the pipeline — exit 1, state preserved for `--resume`, consistent with the `abort` semantics defined at R45)" and Acceptance "`abort` halts the pipeline (exit 1) …" | "`abort` (no command runs; the run ends `done` with `ext.reason: "cancel"`; `archive-openspec` stays `in_progress` and the ledger is kept, so `--resume` emits `archive_openspec` again — see the step table)" and Acceptance "`abort` ends the run with `cancel` and the ledger kept for `--resume`" |
  | R-verify-openspec-3 | "calls `lib/openspec.js::validateChangeStrict(changeName)` inline — a Bash invocation of `openspec validate --strict <changeName>` … `step.invocation` … is `openspec validate --strict <changeName>`" | "runs `data.commands` = `node "<abs>/openspec-step.js" validate --change "<changeName>"`, which calls `lib/openspec.js::validateChangeStrict(projectRoot, changeName)` (the CLI call `openspec validate <changeName> --strict`). No Agent is dispatched." |
  | I12 | "inline Bash; runs `openspec validate --strict <change>`" | "inline script call (`openspec-step.js validate`)"; rest unchanged |
  | C7 | "Must not proceed past a failed sub-skill — stop, save state, inform user" | append: "The inline `verify-openspec` step is the exception: its result never halts the pipeline (R-verify-openspec-4)." |
  | step table `verify_version_tag` row | "must match `^[A-Za-z0-9._-]+$`" | "must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` (no leading `-` or `.`)" |
- names: P8, R-projectroot-ship, R22, R27, R-archive-sync-3, R-verify-openspec-3, I12, C7.
- mirror: the step-table row `archive_openspec` with answer `abort` (same spec, `### Step-emitter contract`).
- decisions: no issue numbers in the body (spec shape rule); none needed here.
- sync: site byte copy; Task 6 adds the P8 exec cases; Task 8 changes the regex in code.

### Task 2: ship spec R91, R92, R93; G1, E2 and phase 3

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R91 under `## Gates`, R92 and R93 under `## Dispatch and routing`; amend G1, E2, phase 3; Issue trail rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Spec first (AGENTS.md principle 1). R91 is #9352 with #9237's message; R92 and R93 are #9347 (F-ship-execute-handback-progress-cause-1 to -5, F-ship-gh-preflight-gating-and-infra-7). Ids start at R91 because wave 3 takes R90.

**Acceptance criteria:**
- [ ] R91, R92, R93 each appear once with an Acceptance line naming their exec cases.
- [ ] G1 and E2 point to R91; phase 3 reads "gh auth when a selected step needs gh (R91)".
- [ ] The Issue trail has one row per new id with `#9349`; the body has no issue numbers.
- [ ] `validate-spec-shape.js --root .` passes; site copy byte-identical.

**Contract:**
- shape (openspec): ADD three ids at the places below; MODIFY G1, E2 and phase 3.
  - R91 under `## Gates`, directly after G9:
    > R91: gh is required only by the steps that call it. `skill/ship.js::runValidation` treats `pr`, `verify-pipeline` and `await-remote-review` as gh steps. When one of them has `status: 'will_run'` in `steps[]`, an unauthenticated or expired gh, an account mismatch and a denied repo-access probe are `errors[]` entries, as before. When none will run, they are not errors: prepare adds one `warnings[]` line that starts `gh is not required by the selected steps` and names the first problem; `review` and `received-review` then cannot read or post to a pull request in this run. `context.ghAuth` still reports the probe result. A `gh auth status` call that timed out is reported as a timeout (`lib/git.js::probeGhAuth` sets `timedOut: true` and an `errorMessage` that starts `gh auth status timed out`), never as "Not logged in".
    > - Acceptance: exec cases `ship-prepare: gh-gating (a)` and `(b)` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`; `git-lib: probeGhAuth` in `tests/promptfoo/datasets/git-lib-exec.yaml`.
  - R92 under `## Dispatch and routing`, after R-step5-prompting:
    > R92: Per-wave progress during execute. While the execute step's Agent runs, ship's main thread runs `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-watch` (execute-plan-sdlc R88) under `Monitor` when that tool is available, and prints each line it emits — one line per finished execute wave. It stops the monitor when the execute Agent returns. TodoWrite from the execute subagent stays invisible to the parent (R-todowrite-visibility).
    > - Acceptance: exec case `execute-plan-sdlc/liveness/wave-watch:`; sentinel `execute-plan-sdlc/handback:` (ship SKILL.md names `wave-watch`).
  - R93 directly after R92:
    > R93: Mid-wave hand-back. When `--after dispatch_execute` reports `success: false` (or the completeness gate fails it) without a `pendingQuestion`, and the branch's execute state file holds a wave with `status: 'in_progress'`, `skill/ship.js` does not record execute as failed. It stops through the pending-question path: `ext.reason: "pending-question"`, a question that names the wave and says its workers may still be running, the options `["resume"]`, the execute and ship resume commands; execute stays `in_progress`. A failure with no wave in flight is still an error with execute `failed`.
    > - Acceptance: exec case `ship-step: (mw) …`; existing `ship-step: (u)` and `(pq6)` keep passing.
  - MODIFY: G1 `gh` CLI authenticated — `gh auth status` succeeds → "G1: `gh` CLI authenticated when a selected step needs gh (R91)". E2 → "E2: `gh auth status` fails and a gh step will run → stop at validation, tell the user to `gh auth login` (R91); a timeout is named as a timeout". Phase 3 line → "3. CRITIQUE — validate pipeline: gh auth when a selected step needs gh (R91), branch safety, skip values, flag coherence".
  - Issue trail rows: `| R91 | gh preflight gated on gh steps, #9349 |`, `| R92 | per-wave execute progress, #9349 |`, `| R93 | mid-wave execute hand-back, #9349 |`.
- names: R91, R92, R93, G1, E2.
- mirror: R89 block (requirement + `  - Acceptance:` line).
- decisions: Decisions 1, 2, 4, 5 in `## Decisions taken without the owner`.
- sync: Task 5 (`probeGhAuth`), Task 6 (gating), Task 7 (R93), Task 9 (`wave-watch`), Task 13 (SKILL.md) implement; site byte copy.

### Task 3: execute-plan-sdlc spec R86, R87, R88 and P1

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — add R86 and R87 under `## Dispatch and routing`, R88 under `## State model`; amend P1; Issue trail rows
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy

**Notes:** R86 is the missing "do not hand back mid-wave" contract (F-ship-execute-handback-progress-cause-2). R87 records the worker write bans that so far lived only in agent files, plus #9320. R88 is the watcher ship uses (ship R92). P1 gains #9173's warning.

**Acceptance criteria:**
- [ ] R86, R87, R88 appear once each, R86 directly after R-WAVE-BACKGROUND-DISPATCH.
- [ ] P1 names the warning for a configured `specReviewer` overridden by `minimal`.
- [ ] `validate-spec-shape.js --root .` passes; site copy byte-identical.

**Contract:**
- shape (openspec): ADD three ids; MODIFY P1.
  - R86 (after R-WAVE-BACKGROUND-DISPATCH):
    > R86: Hand back only at a terminal point. When execute-plan-sdlc runs as a subagent (ship's execute step), and when a wave-runner runs, it MUST NOT end its turn while a worker or wave-runner it dispatched is still in flight: ending the turn returns it to its caller with the wave unfinished. It waits for the R-WAVE-BACKGROUND-DISPATCH barrier with the `Monitor` poll of R-WAVE-DEADLINE. It returns once: after Step 9, or at a stop that records a pending question or a failure.
    > - Acceptance: exec case `execute-plan-sdlc/handback: …` (sentinels in SKILL.md, wave-runner-template.md and `agents/ship-step-execute.md`).
  - R87 (after R86):
    > R87: Worker write and checkout rules. `execute-worker`, `execute-worker-complex` and `execute-worker-batch` create and change repository files only with the Edit and Write tools: no `sed -i`, `awk`, heredoc, `cat >` or `cat >>` redirect, `tee`, or script that writes a file. They do not run `git worktree add`, `git checkout -b`, `git switch -c` or `git branch <name>` unless their fact sheet names that command.
    > - Acceptance: exec case `execute-plan-sdlc/handback: …` (sentinels in the three agent files).
  - R88 (under `## State model`, after R-WAVE-LIVENESS):
    > R88: `state/execute.js wave-watch [--branch <b>] [--interval <s>] [--timeout <s>] [--once]` polls the branch's execute state file and prints one line per wave whose `status` is `completed`, `partial` or `failed`, once per wave: `execute wave <n>: <status>, <done>/<total> tasks done`. `<done>` counts tasks with `status: completed`. It exits 0 when the state file disappears after it was seen, at `--timeout` (default 3600), or after one pass with `--once`; a bad argument exits 2. Defaults: `--interval` 30, branch from `git branch --show-current`. The intervals are tuning values.
    > - Acceptance: exec case `execute-plan-sdlc/liveness/wave-watch: …`.
  - MODIFY P1, the sentence "a resolved `quality` of `minimal` forces `per-wave` (`sources.specReviewer` is then `quality`)" → append "; when `specReviewer` came from the `execute` config as `once`, `warnings[]` gets one line naming the override (exec case `execute-prepare: (s4)`)".
  - Issue trail rows: `| R86 | mid-wave hand-back (ledger F-29), #9347 |`, `| R87 | worker bans, #9320 |`, `| R88 | per-wave progress (ledger F-28), #9347 |`, and add `#9173` to the P1 row (create the row when absent).
- names: R86, R87, R88, P1.
- mirror: R-WAVE-BACKGROUND-DISPATCH and R-WAVE-LIVENESS blocks.
- decisions: Decisions 4, 5; Key Decisions "Spec reviewer warning only for a configured value".
- sync: Tasks 9 to 13 implement; Task 14 checks the prose; site byte copy.

### Task 4: pr-sdlc E9 success stderr (#9192)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint, manual

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — add E9 under `## Failure handling and resume`; Issue trail row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — Create mode step 2 success branch
- Test: `tests/promptfoo/datasets/pr-sdlc.yaml` — one behavioural case `pr-sdlc (E9)` (written, not run)

**Notes:** #9192 (F-cross-call-shell-variable-fixes-3). Wave 3 edits the pr spec A7/P20 and the SKILL.md key-fields table; this task touches the failure list and Create mode only.

**Acceptance criteria:**
- [ ] pr spec E9 exists; SKILL.md cites it.
- [ ] On `GH_EXIT` 0, SKILL.md reads `<ERR_FILE>` and prints non-empty content before step 4 removes it.
- [ ] `validate-spec-shape.js --root .` and `check-consistency.js` pass.

**Contract:**
- shape (code): pr spec ADD `E9: \`gh pr create\` succeeds and wrote to stderr → show the stderr text (warnings) before the temp file is removed; nothing is shown when it is empty.` Issue trail `| E9 | success stderr shown, #9192 |`. SKILL.md Create mode step 2, replace the last sentence:
  ```diff
  - … On `GH_EXIT` 0 the PR is created: go to step 4.
  + … On `GH_EXIT` 0 the PR is created: read `<ERR_FILE>` with the Read tool; when it is not empty, print its text under the line `gh pr create warnings:`; then go to step 4. <!-- E9 -->
  ```
  Behavioural case: description `pr-sdlc (E9): gh pr create success with warnings prints them before the temp file is removed`, mirroring the stderr case near `pr-sdlc.yaml` "The first `gh pr create` call has just failed with stderr containing".
- names: E9, `gh pr create warnings:`.
- mirror: step 3's "read the original stderr from `<ERR_FILE>` (Read tool)" wording.
- decisions: Read tool, not `cat`, so no shell output handling (matches step 3).
- sync: pr spec site copy.

### Task 5: probeGhAuth names a timeout (#9237)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/git.js` — `probeGhAuth` timeout branch, JSDoc return type
- Modify: `tests/promptfoo/scripts/git-lib-test.js` — new op `probeGhAuthTimeout`
- Test: `tests/promptfoo/datasets/git-lib-exec.yaml` — case `git-lib: probeGhAuth reports a timed-out gh auth status as a timeout (R91)`

**Notes:** F-execute-quality-and-worker-bans-8 to -11. Only the default runner learns about timeouts; an injected `execFn` keeps returning string or null (Key Decisions). The message must not read like "not logged in", which `error-report-sdlc` treats as user setup.

**Acceptance criteria:**
- [ ] A `gh auth status` that throws with `code === 'ETIMEDOUT'` (or `killed` with `signal === 'SIGTERM'`) returns `authenticated: false`, `timedOut: true` and the timeout message.
- [ ] A non-zero exit still returns "Not logged in to <host>…" with `timedOut: false`.
- [ ] The new exec case passes; `git-lib: exec() gives every gh call the GH_TIMEOUT_MS timeout` still passes.

**Contract:**
- shape (code): return type gains `timedOut: boolean` on every return (false except the timeout branch).

  | Condition | authenticated | expired | timedOut | errorMessage |
  |---|---|---|---|---|
  | status call throws ETIMEDOUT / killed SIGTERM | false | false | true | `gh auth status timed out after ${GH_TIMEOUT_MS / 1000}s for ${host}. Check the network and gh, then retry.` |
  | status call fails otherwise (null) | false | false | false | `Not logged in to ${host}. Run: gh auth login --hostname ${host}` (unchanged) |
  | output contains "expired" | false | true | false | unchanged |
  | output lacks "logged in" | false | false | false | unchanged ("Not logged in …") |
  | logged in | true | false | false | null (unchanged) |

  ```diff
    function probeGhAuth(opts = {}) {
      const host = opts.host || 'github.com';
      const run = opts.execFn || ((cmd) => exec(cmd, { shell: true }));
  -   const statusRaw = run(`gh auth status --hostname ${host} 2>&1`);
  -   if (statusRaw === null) {
  +   const statusCmd = `gh auth status --hostname ${host} 2>&1`;
  +   let statusRaw = null;
  +   let timedOut = false;
  +   if (opts.execFn) statusRaw = run(statusCmd);
  +   else {
  +     try { statusRaw = exec(statusCmd, { shell: true, throwOnError: true }); }
  +     catch (err) { timedOut = err.code === 'ETIMEDOUT' || (err.killed === true && err.signal === 'SIGTERM'); }
  +   }
  +   if (timedOut) return { authenticated: false, activeAccount: null, expired: false, timedOut: true, errorMessage: `gh auth status timed out after ${GH_TIMEOUT_MS / 1000}s for ${host}. Check the network and gh, then retry.` };
  +   if (statusRaw === null) {
  ```
  `git-lib-test.js` op `probeGhAuthTimeout`: patch `cp.execSync` before a fresh `require` (as in `execGhTimeoutApplied`); first probe throws `Object.assign(new Error('spawnSync /bin/sh ETIMEDOUT'), { code: 'ETIMEDOUT' })` for `gh auth status`, second probe throws `Object.assign(new Error('exit 1'), { status: 1 })`; prints `{ timeout: {authenticated, timedOut, errorMessage}, loggedOut: {authenticated, timedOut, errorMessage} }`.
- names: `probeGhAuth`, `timedOut`, op `probeGhAuthTimeout`.
- mirror: op `execGhTimeoutApplied` in `git-lib-test.js` and its case in `git-lib-exec.yaml`.
- decisions: Key Decisions "Timeout detection lives inside probeGhAuth".
- sync: R91 text (Task 2); `pr.js` and `ship.js` show `errorMessage` verbatim, no change.

### Task 6: ship.js gates the gh preflight on gh steps (#9352)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `GH_STEPS`, `runValidation` gh block, comment above `probeGhAuth()` in `main()`
- Create: `tests/promptfoo/fixtures-fs/project-ship-gh-unauth/setup.sh` — git repo plus an executable `bin/gh` that is not logged in
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — cases `ship-prepare: gh-gating (a)`, `(b)`, `ship-prepare: P8 migration (a)`, `(b)`

**Notes:** F-ship-gh-preflight-gating-and-infra-1 to -6. The stub is written by `setup.sh` (which runs in the temp copy and can `chmod +x`), so no executable bit has to be committed by a worker. The P8 cases prove Task 1's text.

**Acceptance criteria:**
- [ ] Unauthenticated gh with `--steps commit`: no gh entry in `errors[]`, one `warnings[]` line starting `gh is not required by the selected steps`.
- [ ] Unauthenticated gh with `--steps commit,pr`: `errors[]` holds `Not logged in to github.com`.
- [ ] `SDLC_SKIP_CONFIG_CHECK=1`: `migration` is an object without `project`/`local`; without it, both keys are present.
- [ ] All four new cases pass; the existing `ship-prepare:` cases that use `stub-bin-gh` are unchanged.

**Contract:**
- shape (code): module constant `const GH_STEPS = ['pr', 'verify-pipeline', 'await-remote-review'];` next to `OPENSPEC_CHANGE_RE`. In `runValidation`, replace the three blocks under "gh auth must be true", "Active-account preflight" and "Access-mode preflight":
  ```diff
  -  // gh auth must be true (issue #234 — preflight via lib/git.js::probeGhAuth).
  -  if (!context.ghAuthenticated) {
  -    errors.push(
  -      context.ghAuthErrorMessage ||
  -        'GitHub CLI is not authenticated. Run "gh auth login" before using ship-sdlc.'
  -    );
  -  }
  -  // Active-account preflight — …
  -  if (context.accountMismatch && context.accountMismatchMessage) { errors.push(context.accountMismatchMessage); }
  -  // Access-mode preflight — …
  -  if (context.accessDeniedMessage) { errors.push(context.accessDeniedMessage); }
  +  // R91: gh problems block only when a step that calls gh will run.
  +  const ghProblems = [];
  +  if (!context.ghAuthenticated) ghProblems.push(context.ghAuthErrorMessage || 'GitHub CLI is not authenticated. Run "gh auth login" before using ship-sdlc.');
  +  if (context.accountMismatch && context.accountMismatchMessage) ghProblems.push(context.accountMismatchMessage);
  +  if (context.accessDeniedMessage) ghProblems.push(context.accessDeniedMessage);
  +  const ghStepsToRun = (steps || []).filter(s => GH_STEPS.includes(s.name) && s.status === 'will_run');
  +  if (ghStepsToRun.length > 0) errors.push(...ghProblems);
  +  else if (ghProblems.length > 0) warnings.push(`gh is not required by the selected steps (${GH_STEPS.join(', ')} will not run), so this run continues: ${ghProblems[0]} review and received-review cannot read or post to a pull request in this run.`);
  ```

  | gh state | gh step will_run | Result |
  |---|---|---|
  | not logged in / expired / timed out | yes | `errors[]` (unchanged text), exit 1 |
  | not logged in / expired / timed out | no | one `warnings[]` line, run continues |
  | mismatch or access denied | yes | `errors[]` |
  | mismatch or access denied | no | the same warning line |
  | logged in, no problem | either | nothing |

  `setup.sh`: copy of `project-sdlc-gitignore-inner/setup.sh` (fixture guard, `git init -q`, user config, one commit) plus, before the commit, `mkdir -p bin`, a `bin/gh` bash script that prints `You are not logged into any GitHub hosts. To log in, run: gh auth login` to stderr and exits 1 for every call, and `chmod +x bin/gh`.

  Cases (vars: `script_stub_bin: "bin"`, `script_path: "repo://plugins/sdlc-utilities/scripts/skill/ship.js"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/project-ship-gh-unauth"`):
  - `ship-prepare: gh-gating (a) unauthenticated gh with --steps commit is a warning, not an error (R91)` — `script_args: "--steps commit"`; assert JSON: no `errors[]` entry matches `/Not logged in|not authenticated/i`, and one `warnings[]` entry starts `gh is not required by the selected steps`.
  - `ship-prepare: gh-gating (b) unauthenticated gh with --steps commit,pr stays an error (R91)` — `script_args: "--steps commit,pr"`; assert `icontains` `Not logged in to github.com`.
  - `ship-prepare: P8 migration (a) skipped config check gives an object without project or local` — stub `{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin`, `project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"`, `script_args: "--steps commit"`, `script_env: '{"SDLC_SKIP_CONFIG_CHECK": "1"}'`; assert `o.migration` is a non-null object, `!('project' in o.migration)`, `!('local' in o.migration)`.
  - `ship-prepare: P8 migration (b) a run without the skip carries project and local` — same without `script_env`; assert both keys present.
- names: `GH_STEPS`, `ghProblems`, `ghStepsToRun`, fixture `project-ship-gh-unauth`.
- mirror: case `ship-prepare: rejects unrecognized step values in --steps`; `script_stub_bin: "bin"` use in `openspec-step-exec.yaml`; `script_env` use in `execute-plan-sdlc-liveness-exec.yaml`.
- decisions: Key Decisions "Gate on computed steps" and "Keep the gh probes, gate only the errors"; Decisions 1 and 2.
- sync: R91 (Task 2); SKILL.md validation list (Task 13).

### Task 7: ship.js stops on a mid-wave execute hand-back (R93)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `runAfter`: mid-wave question before the `pq` line
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — seed `seed/execute-midwave.json`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — usage comment lists `midwave`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case `ship-step: (mw) …`

**Notes:** F-ship-execute-handback-progress-cause-3. The success return with unfinished tasks fails the completeness gate first, so the check runs after that gate and before the pending-question line. Depends on Task 6 only because both edit `ship.js` and the same dataset.

**Acceptance criteria:**
- [ ] With a wave `in_progress` in the execute state, a failed `dispatch_execute` result ends `done` / `pending-question`; execute stays `in_progress`; `ext.commands[0]` holds `--resume`; the completeness gate's `failExitCode` does not apply, so the call exits 0 (`c.exitCode === 0`).
- [ ] `ship-step: (u)` and `ship-step: (pq6)` still pass (no wave in flight: error, execute `failed`).

**Contract:**
- shape (code): in `runAfter`, replace the `pq` line:
  ```diff
    // ruling w2-pending: a dispatch failure that carries a question is not a step failure.
  - const pq = after.startsWith('dispatch_') && !success ? validPendingQuestion(output.pendingQuestion) : null;
  + // R93: execute returned while one of its waves was still in flight — stop for a resume, not a failure.
  + let midWave = null;
  + if (after === 'dispatch_execute' && !success && !validPendingQuestion(output.pendingQuestion)) {
  +   const st = readState('execute', slugifyBranch(ledger.branch));
  +   const open = st && st.data && Array.isArray(st.data.waves) ? st.data.waves.find(w => w && w.status === 'in_progress') : null;
  +   if (open) midWave = { prompt: `execute-plan-sdlc returned while wave ${open.number} was still in progress; its workers may still be running. Wait until they finish, then resume.`, options: ['resume'] };
  + }
  + const pq = after.startsWith('dispatch_') && !success ? (validPendingQuestion(output.pendingQuestion) || midWave) : null;
  ```

  | From | Event | To |
  |---|---|---|
  | execute `in_progress` | `--after dispatch_execute`, failure, no wave in flight | execute `failed`, envelope `error` (unchanged) |
  | execute `in_progress` | `--after dispatch_execute`, failure, a wave `in_progress` | execute `in_progress`, envelope `done`, `ext.reason: "pending-question"`, `paused` set |

  Seed in `setup.sh`, after the `execute-noplanned.json` line: `seed/execute-midwave.json` = `{ "version": 1, "branch": "feat/ship", "plannedTaskIds": ["1", "2"], "waves": [ { "number": 1, "status": "completed", "tasks": [ { "id": "1", "status": "completed" } ] }, { "number": 2, "status": "in_progress", "tasks": [] } ] }`.
  Case `ship-step: (mw) --after dispatch_execute with a wave still in progress stops with a resume question; execute stays in_progress (R93)`: `script_args: "--project-root {{project_root}} --scenario after-execute --seed frozen-exec --exec-seed midwave --result results/execute-ok.json"`; assert `e.status === 'done'`, `e.ext.reason === 'pending-question'`, `/wave 2/.test(e.ext.pendingQuestion.prompt)`, `o.ledger.stepStatuses.execute === 'in_progress'`, `/--resume/.test(e.ext.commands[0])`.
- names: `midWave`, seed `midwave`, case prefix `ship-step: (mw)`.
- mirror: cases `ship-step: (u)` and `ship-step: (pq3)` in `ship-prepare-exec.yaml`.
- decisions: Key Decisions "Mid-wave hand-back reuses the pending-question stop"; Decision 5.
- sync: R93 (Task 2); SKILL.md dispatch_execute bullet (Task 13).

### Task 8: change names cannot start with a dash (#9137)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/openspec-step.js` — `CHANGE_NAME_RE`, `usageError`, header comment
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `OPENSPEC_CHANGE_RE`
- Test: `tests/promptfoo/datasets/openspec-step-exec.yaml` — update three message assertions; add `openspec-step: validate rejects a change name with a leading dash`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add `ship-step: openspec change name with a leading dash returns status error`

**Notes:** F-ship-spec-text-truth-8. Option injection, not shell injection: the name reaches the `openspec` CLI as an argv entry. Rejecting at the two entry points is enough; `lib/openspec.js` is not changed. Depends on Task 7 for the shared `ship.js` and dataset.

**Acceptance criteria:**
- [ ] `openspec-step.js validate --change -x` exits 2 with `validate: --change must match ^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- [ ] `tasks --change .`, `..`, `../x` and the command-substitution name still exit 2 with the new message.
- [ ] ship's `verify_openspec`/`archive_openspec` emit `status: "error"` for `-x`.

**Contract:**
- shape (code):
  ```diff
  - const CHANGE_NAME_RE = /^[A-Za-z0-9._-]+$/;
  + const CHANGE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  ...
  -   if (opts.sub === 'tasks' && (!CHANGE_NAME_RE.test(opts.change) || opts.change === '.' || opts.change === '..')) {
  -     return 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..';
  -   }
  +   if (opts.sub !== 'detect' && !CHANGE_NAME_RE.test(opts.change)) {
  +     return `${opts.sub}: --change must match ^[A-Za-z0-9][A-Za-z0-9._-]*$`;
  +   }
  ```
  `detect --change <n>` is optional; when given, it is checked too (`opts.change && !CHANGE_NAME_RE.test(opts.change)`). `ship.js`: `const OPENSPEC_CHANGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;`. Header comment of `openspec-step.js` states the new pattern.

  | Input | Before | After |
  |---|---|---|
  | `tasks --change ..` | exit 2, old message | exit 2, `tasks: --change must match ^[A-Za-z0-9][A-Za-z0-9._-]*$` |
  | `validate --change -x` | CLI called with `-x` | exit 2, `validate: --change must match …` |
  | ship `--os-change -x` (stepper) | command emitted | `status: "error"`, `not shell-safe` |

  Updated assertions: the three `a.json.error !== 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..'` comparisons become `!== 'tasks: --change must match ^[A-Za-z0-9][A-Za-z0-9._-]*$'`. New openspec-step case: `script_path: repo://plugins/sdlc-utilities/scripts/skill/openspec-step.js`, `script_args: "validate --change -x"`, `project_root: file://fixtures-fs/project-openspec-active`, assert `icontains` `validate: --change must match`. New ship case: copy of `ship-step: openspec invalid change name returns status error (W44-R6)` with `--os-change -x`.
- names: `CHANGE_NAME_RE`, `OPENSPEC_CHANGE_RE`.
- mirror: `openspec-step: usage error prints an error line`; `ship-step: openspec invalid change name returns status error (W44-R6)`.
- decisions: Decision 6.
- sync: step-table regex text (Task 1).

### Task 9: state/execute.js wave-watch (R88)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `cmdWaveWatch`, `parseArgs` (`--interval`, `--timeout`, `--once`), dispatch `case 'wave-watch'`, usage header
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — case `execute-plan-sdlc/liveness/wave-watch: --once prints one line per finished wave and none for the wave in progress`

**Notes:** Ledger F-28 (F-ship-execute-handback-progress-cause-4, -5; Decision 4). It is the smallest script-driven fix: one read-only subcommand over the state file execute already writes, with no change to execute itself. The existing fixture `execute-state-mid-wave` already holds branch `fix/resume-idem` with wave 1 `completed` (2 tasks) and wave 2 `in_progress`, so no new fixture.

**Acceptance criteria:**
- [ ] `wave-watch --branch fix/resume-idem --once` prints exactly `execute wave 1: completed, 2/2 tasks done` and exits 0.
- [ ] Without `--once`, a wave is printed once; the command exits when the state file is removed after being seen, or at `--timeout`.
- [ ] A non-numeric `--interval` or `--timeout` exits 2 with a usage line.

**Contract:**
- shape (code): CLI

  | Flag | Type | Default | Notes |
  |---|---|---|---|
  | `--branch` | string | `git branch --show-current` | via existing `resolveBranchOrExit` |
  | `--interval` | integer seconds ≥ 1 | 30 | poll period; tuning |
  | `--timeout` | integer seconds ≥ 1 | 3600 | matches the `Monitor` cap |
  | `--once` | switch | off | one pass, then exit 0 |

  Output, one line per finished wave, in wave order, each wave once: `execute wave <n>: <status>, <done>/<total> tasks done` where `<n>` is `wave.number` (the field `wave-start` writes), `<status>` ∈ `completed | partial | failed`. The loop uses `setTimeout` (async), reads with `readState('execute', slug)` each poll, keeps a `Set` of printed wave numbers and a `seen` flag. Exit 0 on: `--once` after one pass; state file absent after `seen`; elapsed ≥ timeout. A missing state file before it is ever seen is not an error (keep polling). Exit 2 on a bad number.
  Case vars: `script_path: repo://plugins/sdlc-utilities/scripts/state/execute.js`, `script_args: "wave-watch --branch fix/resume-idem --once"`, `script_cwd`/`project_root: file://fixtures-fs/execute-state-mid-wave`, `script_env: '{"SDLC_STATE_DIR_OVERRIDE": "{{project_root}}/.sdlc/execution"}'`; assert `output.trim() === 'execute wave 1: completed, 2/2 tasks done'`.
- names: `cmdWaveWatch`, `wave-watch`, opts `interval`, `timeout`, `once`.
- mirror: `cmdRead` and `cmdWaveProgress` in `state/execute.js`; case `execute-plan-sdlc/liveness/read:`.
- decisions: Key Decisions "wave-watch prints finished waves only".
- sync: R88 (Task 3); ship SKILL.md (Task 13) calls it.

### Task 10: execute.js warns when minimal overrides a configured spec reviewer (#9173)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` — warning in the `--quality minimal` override block
- Create: `tests/promptfoo/fixtures-fs/project-execute-prepare-config-once/setup.sh` — config with `execute.specReviewer: "once"`
- Test: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — case `execute-prepare: (s4) …`

**Notes:** F-execute-quality-and-worker-bans-1 to -4. The default `once` is not warned about (Key Decisions).

**Acceptance criteria:**
- [ ] Config `once` + `--quality minimal`: `flags.specReviewer === 'per-wave'`, `sources.specReviewer === 'quality'`, and one `warnings[]` entry contains `execute.specReviewer`.
- [ ] Cases `(s1)`, `(s2)`, `(s3)` still pass, and `(s2)` (default source) has no such warning.

**Contract:**
- shape (code):
  ```diff
    // --quality minimal forces the per-wave spec reviewer (P1).
    if (quality.value === 'minimal' && resolved.specReviewer !== 'per-wave') {
  +   if (sources.specReviewer === 'config') {
  +     warnings.push(`--quality minimal overrides execute.specReviewer "${resolved.specReviewer}" from the config: the spec review runs per-wave.`);
  +   }
      resolved.specReviewer = 'per-wave';
      sources.specReviewer = 'quality';
    }
  ```
  Fixture `setup.sh`: copy of `project-execute-prepare-config/setup.sh` with only `"schemaVersion": 4, "execute": { "specReviewer": "once" }` in `.sdlc/config.json` and no `local.json`.
  Case `execute-prepare: (s4) --quality minimal over a configured once spec reviewer warns and records source quality`: `script_args: "--plan {{repo_root}}/tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md --quality minimal --project-root {{project_root}}"`, `project_root: file://fixtures-fs/project-execute-prepare-config-once`; assert `o.flags.specReviewer==='per-wave' && o.flags.sources.specReviewer==='quality' && o.warnings.some(w=>String(w).includes('execute.specReviewer'))`.
- names: fixture `project-execute-prepare-config-once`, case `(s4)`.
- mirror: case `(s3)` and fixture `project-execute-prepare-config`.
- decisions: Key Decisions "Spec reviewer warning only for a configured value".
- sync: P1 (Task 3); docs flag row (Task 16).

### Task 11: skill prose: R86 and no cross-call variables (#9235, #9236)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — R86 paragraph after the "Await barrier" sentence; remove the 5c-quater workaround sentences
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — literal path and sha
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — `stateScript` description; R86 line in §2b
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — "same root as `$STATE_SCRIPT`"
- Modify: `plugins/sdlc-utilities/skills/harden-sdlc/SKILL.md` — `$MIRROR` → `MIRROR` (two lines)

**Notes:** F-cross-call-shell-variable-fixes-5 to -10 and F-ship-execute-handback-progress-cause-2. The harden edit is notation only (Decision 3): the value is model-held, not a shell variable; it shares this task because it is the same #9190 class. Once `commit-waves.md` uses literal values, the SKILL.md workaround is dead text. `{STATE_SCRIPT}` and `STATE_SCRIPT: {stateScript}` are template placeholders and stay.

**Acceptance criteria:**
- [ ] `grep -n '\$STATE_SCRIPT\|\$committedSha\|STATE_SCRIPT=' plugins/sdlc-utilities/skills/execute-plan-sdlc/*.md` prints nothing.
- [ ] `grep -n '\$MIRROR' plugins/sdlc-utilities/skills/harden-sdlc/SKILL.md` prints nothing.
- [ ] SKILL.md and wave-runner-template.md each contain the sentinel `No hand-back mid-wave (R86)`.
- [ ] `check-consistency.js` passes.

**Contract:**
- shape (code): SKILL.md, after the paragraph that ends "never consolidate on partial or zero returns (R-WAVE-BACKGROUND-DISPATCH, R-orchestrator-await).", add:
  > **No hand-back mid-wave (R86).** When you run as a subagent (ship's execute step), never end your turn while a worker or wave-runner you dispatched is still in flight: ending the turn returns you to ship with the wave unfinished. Wait with the `Monitor` poll of the wave deadline below until all N results are in. Return once: after Step 9, or at a stop that records a pending question or a failure.

  SKILL.md 5c-quater, delete from "Where `./commit-waves.md` still names its state-script variable" to the end of that paragraph (two sentences). commit-waves.md step 4:
  ```diff
  -   - Capture `committedSha`:
  -     ```bash
  -     committedSha=$(git rev-parse HEAD)
  -     ```
  -   - Persist via the new state subcommand:
  -     ```bash
  -     node "$STATE_SCRIPT" wave-committed --branch <slug> --wave <N> --sha "$committedSha"
  -     ```
  +   - Run `git rev-parse HEAD` as its own plain Bash call; the sha it prints is `<SHA>`.
  +   - Persist it, substituting `<PLUGIN_ROOT>` from the `sdlc plugin root:` context line:
  +     ```bash
  +     node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-committed --branch <slug> --wave <N> --sha '<SHA>'
  +     ```
  ```
  wave-runner-template.md: `stateScript — absolute path to state/execute.js` with the parenthetical changed to `(<PLUGIN_ROOT>/scripts/state/execute.js, passed as a literal path)`; in §2b add the line `**No hand-back mid-wave (R86).** You run as a subagent: never end your turn while a worker you dispatched is still in flight; keep polling with Monitor until every worker has returned or the deadline has passed.` recovering-from-failures.md: "(same root as `$STATE_SCRIPT`)" → "(the same `<PLUGIN_ROOT>` as `scripts/state/execute.js`)".
  harden-sdlc SKILL.md, the two lines under "Write or patch the mirror":
  ```diff
  - Write the generator's `$MIRROR` output verbatim …
  + Write the generator's `MIRROR` output verbatim …
  - … tightened `applyTo`/severity from `$MIRROR`; …
  + … tightened `applyTo`/severity from `MIRROR`; …
  ```
- names: sentinel `No hand-back mid-wave (R86)`.
- mirror: literal form at `pr-sdlc/SKILL.md` step 3 (`# Substitute <PLUGIN_ROOT> from the \`sdlc plugin root:\` context line.`).
- decisions: Decision 5.
- sync: sentinel case (Task 14).

### Task 12: ship-step-execute brief and worker rules (#9320, R86, R87)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-execute.md` — return rule paragraph
- Modify: `plugins/sdlc-utilities/agents/execute-worker.md` — Hard Constraints
- Modify: `plugins/sdlc-utilities/agents/execute-worker-complex.md` — Hard Constraints
- Modify: `plugins/sdlc-utilities/agents/execute-worker-batch.md` — constraints list

**Notes:** F-execute-quality-and-worker-bans-5, -6 and F-ship-execute-handback-progress-cause-1. Body text only. Wave 3 changes the `model:` line of `ship-step-execute.md`; this task does not touch the frontmatter, so `validate-cost-tiers.js` is unaffected.

**Acceptance criteria:**
- [ ] `ship-step-execute.md` contains `Never end your turn while a worker or wave-runner you dispatched is still running`.
- [ ] Each worker file contains `` `cat >>` `` in its write-ban line and the line starting `- Do not run \`git worktree add\``.
- [ ] Frontmatter of all four files unchanged.

**Contract:**
- shape (code): ship-step-execute.md, insert after the paragraph that starts "The arguments above decide whether this run is unattended.":
  > Return only once, at a terminal point: after the skill's Step 9, or at a stop that records a pending question or a failure. Never end your turn while a worker or wave-runner you dispatched is still running; wait for it with Monitor as the skill says (execute-plan-sdlc R86).

  Worker files, the line starting "Create and change repository files only with the Edit and Write tools":
  ```diff
  - … no `sed -i`, `awk`, heredoc or `cat >` redirect, `tee`, or python/node script that writes a file. …
  + … no `sed -i`, `awk`, heredoc, `cat >` or `cat >>` redirect, `tee`, or python/node script that writes a file. …
  ```
  and directly after that line:
  > - Do not run `git worktree add`, `git checkout -b`, `git switch -c` or `git branch <name>` unless your fact sheet names that command: work in the checkout you were started in (execute-plan-sdlc R87).
- names: the two sentinel strings above.
- mirror: the existing ban line (byte-identical in the three worker files).
- decisions: Decision 7.
- sync: the three worker lines stay byte-identical; sentinel case (Task 14).

### Task 13: ship-sdlc SKILL.md and docs for R91, R92, R93

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 6, Task 7, Task 9
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 3 validation list; Step 5 item 5 `dispatch_execute` bullet
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — Error Recovery `gh auth status` row
- Modify: `docs/skills/ship-sdlc.md` — Prerequisites `gh` bullet; one progress sentence
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy

**Notes:** F-ship-gh-preflight-gating-and-infra-15, F-ship-execute-handback-progress-cause-3 and -5. Wave 3 rewrites the `dispatch_*` bullet of Step 5 item 5; this task adds a separate bullet after it and leaves that bullet alone. Anchor by text, not line.

**Acceptance criteria:**
- [ ] Step 3's validation list says gh is checked only when `pr`, `verify-pipeline` or `await-remote-review` will run (R91).
- [ ] A new `dispatch_execute` bullet starts and stops the `wave-watch` monitor and cites R92 and R93.
- [ ] `check-consistency.js` and `check-docs-consistency.js` pass; site copy byte-identical.

**Contract:**
- shape (code): SKILL.md Step 3 "Validation checks:" list:
  ```diff
  - - `gh auth status` succeeds
  + - `gh auth status` succeeds when `pr`, `verify-pipeline` or `await-remote-review` will run; otherwise a gh problem is a warning from prepare (R91)
  ```
  Step 5 item 5, new bullet directly after the `dispatch_*` bullet:
  > - `dispatch_execute` also: when the `Monitor` tool is available, start it before the Agent call on `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-watch --interval 30` (description `execute waves`, `timeout_ms` 3600000) and print each line it emits — one line per finished wave (R92). When the execute Agent returns, stop that monitor with `TaskStop`. A return whose (1) is missing or not `success` is reported as `success: false`; `ship.js` decides whether that is a mid-wave stop (R93).

  reference.md row:
  ```diff
  - | `gh auth status` fails | Stop at validation (Step 3). Tell user to run `gh auth login` | No — user setup |
  + | `gh auth status` fails or times out and a gh step will run | Stop at validation (Step 3). Tell user to run `gh auth login`, or to retry after a timeout (R91) | No — user setup |
  ```
  docs/skills/ship-sdlc.md Prerequisites: `**\`gh\` CLI** — required for the \`pr\`, \`verify-pipeline\` and \`await-remote-review\` steps. Must be authenticated (\`gh auth login\`) when one of them runs; the pipeline validates this before execution and stops with a clear error. A run without these steps continues with a warning.` Add after the pipeline-table section one sentence: `During the execute step, ship prints one line per finished execute wave.`
- names: R91, R92, R93 citations; `wave-watch`.
- mirror: the existing Step 5 item 5 bullets.
- decisions: Key Decisions "wave-watch prints finished waves only"; Decision 4.
- sync: site byte copy; sentinel `wave-watch` (Task 14).

### Task 14: handback and worker-rule sentinel case

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 11, Task 12, Task 13
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-handback-sentinels.js`
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml` — case `execute-plan-sdlc/handback: R86/R87/R92 sentinels present in execute, ship and worker prompts`

**Notes:** Out-of-scope addition (justified in Key Decisions "Smallest viable cut"): the cheapest deterministic proof for the prose contracts of F-ship-execute-handback-progress-cause-2 and F-execute-quality-and-worker-bans-6, -7 (Decision 7). The dataset is already registered in `promptfooconfig-exec.yaml`, so no config change.

**Acceptance criteria:**
- [ ] The script prints `{ok, skill, waveRunner, shipStepExecute, shipSkill, workers}` and exits 1 when any sentinel is missing.
- [ ] The case passes after Tasks 11, 12 and 13.

**Contract:**
- shape (code): same structure as `check-dispatch-resilience-sentinel.js` (REPO_ROOT, marker guard, exit 2 on read error).

  | Key | File | Sentinel |
  |---|---|---|
  | `skill` | `skills/execute-plan-sdlc/SKILL.md` | `No hand-back mid-wave (R86)` |
  | `waveRunner` | `skills/execute-plan-sdlc/wave-runner-template.md` | `No hand-back mid-wave (R86)` |
  | `shipStepExecute` | `agents/ship-step-execute.md` | `Never end your turn while a worker or wave-runner you dispatched is still running` |
  | `shipSkill` | `skills/ship-sdlc/SKILL.md` | `wave-watch` |
  | `workers.<name>` (×3) | `agents/execute-worker*.md` | `` `cat >>` `` and ``- Do not run `git worktree add` `` |

  Case assert: `const r = JSON.parse(output); r.ok === true`.
- names: `check-handback-sentinels.js`.
- mirror: `tests/promptfoo/scripts/check-dispatch-resilience-sentinel.js` and its case.
- decisions: Decision 7.
- sync: sentinel strings of Tasks 11, 12, 13.

### Task 15: docs for execute-plan-sdlc warning (#9173)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 10
**Verify:** manual

**Files:**
- Modify: `docs/skills/execute-plan-sdlc.md` — `specReviewer` row and cadence paragraph
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — byte copy

**Notes:** User-facing note for Task 10.

**Acceptance criteria:**
- [ ] Both places say `--quality minimal` forces `per-wave` and warns when the config set `once`.
- [ ] Site copy byte-identical; `check-docs-consistency.js` passes.

**Contract:**
- shape (docs): in the config table row for `specReviewer`, `` `--quality minimal` forces `per-wave`. `` → `` `--quality minimal` forces `per-wave` and warns when the config set `once`. ``; same replacement in the `**Cadence (\`execute.specReviewer\`):**` paragraph. Audience: plugin users.
- names: none new.
- mirror: the existing row wording.
- decisions: none beyond Task 10.
- sync: site byte copy.

### Task 16: openspec-integration doc (#9137)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/openspec-integration.md` — Overview, `### Step 6: Verify and Archive (OpenSpec)`, Design Principles 1, 3, 4
- Modify: `site/src/content-source/openspec-integration.md` — byte copy

**Notes:** F-ship-spec-text-truth-9. The doc predates ship's OpenSpec steps.

**Acceptance criteria:**
- [ ] The doc no longer says the integration never writes `openspec/` or never calls the OpenSpec CLI; it names ship's `verify-openspec` and `archive-openspec` steps as the exception.
- [ ] Site copy byte-identical.

**Contract:**
- shape (docs): MODIFY `docs/openspec-integration.md`; audience plugin users.
  - Overview last sentence → "SDLC skills read OpenSpec artifacts. Only ship-sdlc writes to `openspec/`: its opt-in `verify-openspec` step runs `openspec validate --strict`, and its `archive-openspec` step archives the change and commits it."
  - `### Step 6`: keep the `/opsx:` block and add "Or let `/ship-sdlc` do it: add `verify-openspec` and `archive-openspec` to `ship.steps` (see [ship-sdlc](skills/ship-sdlc.md))."
  - Design Principle 1 → "**Read-only by default** — SDLC skills do not write to `openspec/`; ship-sdlc's `archive-openspec` step is the one writer." Principle 3 → "**Minimal CLI coupling** — only ship-sdlc's `verify-openspec` and `archive-openspec` steps call the `openspec` CLI, through `scripts/skill/openspec-step.js`; other skills read the markdown directly." Principle 4 → "**Script-based detection** — detection runs in `scripts/lib/openspec.js` and `scripts/skill/openspec-step.js`; there is no OpenSpec session-start hook."
- names: headings unchanged.
- mirror: the existing Step 5 block.
- decisions: describe behaviour, not history.
- sync: site byte copy.

### Task 17: CHANGELOG and this plan

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16
**Verify:** manual

**Files:**
- Modify: `CHANGELOG.md` — entries under `## [Unreleased]`
- Create: `docs/plans/2026-11-11-lean-w7-contract-truth.md`

**Notes:** Append, do not replace: waves 3 and 6 also add to `[Unreleased]`, and after wave 3's release the heading may already hold entries. The plan file is listed so ship's stage scope includes it.

**Acceptance criteria:**
- [ ] `[Unreleased]` has `### Changed` and `### Fixed` entries for every item of this wave, each ending `(#9349)`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/check-changelog.cjs` is a CI release check and is not run here; the entries follow the `[0.49.0]` style.

**Contract:**
- shape (docs): under `## [Unreleased]` (create the `###` subheadings when absent):
  ```markdown
  ### Changed
  - ship-sdlc: gh authentication is required only when `pr`, `verify-pipeline` or `await-remote-review` will run; other runs warn (#9349).
  - ship-sdlc: one progress line per finished execute wave (`state/execute.js wave-watch`) (#9349).
  - execute-plan-sdlc: `--quality minimal` warns when it overrides a configured `execute.specReviewer` (#9349).
  - execute-plan-sdlc: workers must not append with `cat >>` or create worktrees or branches on their own (#9349).

  ### Fixed
  - ship-sdlc: an execute step that hands back mid-wave stops with a resume instruction instead of a failed execute (#9349).
  - ship-sdlc, openspec: change names that start with `-` are rejected (#9349).
  - lib/git: a timed-out `gh auth status` is reported as a timeout, not "Not logged in" (#9349).
  - pr-sdlc: warnings from a successful `gh pr create` are shown (#9349).
  - specs and docs: ship P8, R-projectroot-ship, R22, R27, R-archive-sync-3, R-verify-openspec-3, I12, C7 and the OpenSpec integration guide match the code; execute and harden prose use literal paths (#9349).
  ```
- names: none new.
- mirror: `## [0.49.0]` block style in `CHANGELOG.md`.
- decisions: one tracking id per entry, as in 0.49.0.
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 5-10 and 14 carry exec cases; Task 8 updates the three stale openspec-step assertions; prose is covered by the sentinel case and pr E9 has a behavioural case. |
| no-ci-bypass | error | PASS | No step skips or disables CI; the changelog check is left to CI. |
| no-auto-eval | error | PASS | Verification uses only promptfooconfig-exec.yaml with a filter and no retry loop; the behavioural E9 case is written but not run. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a listed issue; the sentinel case and P8 cases are justified in Key Decisions and Deviations. |
| single-responsibility-tasks | warning | FAIL | Task 11 bundles R86 prose, #9235 literal paths and the #9236 harden notation fix; Task 6 adds P8 cases to the gh gating; Task 17 combines CHANGELOG and plan file. |
| scripts-over-llm-logic | error | PASS | gh gating, the mid-wave guard, wave-watch and the spec-reviewer warning all live in scripts; prose changes are contracts and rules only. |
| yagni | warning | PASS | Only needed behaviour is added; SendMessage progress and the `--` separator are excluded. |
| cross-skill-consistency | error | PASS | The plan aligns ship, execute, pr, harden and openspec; worker files stay byte-identical. |
| pr-link-github-issue | error | PASS | The PR body links Closes #9349 and Fixes for the item issues. |
| dry | warning | PASS | Gating reuses steps[].status, wave-watch reuses readState, and the sentinel script mirrors an existing one. |
| kiss | warning | PASS | Small gates; the mid-wave stop reuses the pending-question path instead of a new envelope reason. |
| spec-first | error | PASS | Specs (Tasks 1-4) precede code and SKILL.md (Tasks 5-13) via Depends on; the harden edit is notation only. |
| project-agnostic | error | PASS | Changes are in plugin scripts, skills and agents; repo-local edits are only docs, changelog and fixtures. |
| flag-coherence-cross-skill | error | PASS | Gating reads computed steps[] from prepare output; SKILL.md cites prepare fields. |
| no-opposite-logical-vectors | error | PASS | One gh gate expression; the change-name regex is identical in both scripts. |
| flag-resolution-single-source | warning | PASS | The gh requirement is resolved once in runValidation. |
| state-premise | error | PASS | Context and the Key Decisions root-problem bullet name the premise. |
| smallest-viable-cut | warning | PASS | Must-haves (#9352, #9347) are named and extras are justified. |
| failure-audience | warning | PASS | The Who is hurt if this ships wrong bullet names ship users. |
| explicit-non-goals | warning | PASS | The Non-goals bullet lists the exclusions. |
| ambiguity-stops-and-asks | error | PASS | Seven choices are recorded with rationale under Decisions taken without the owner. |
| state-machine-idempotency | error | PASS | The gh gate is stateless and R93 leaves execute in_progress; (a)/(b)/(mw)/(u)/(pq6) fix outcomes. No explicit run-twice case, so consider adding a resume case. |
| agent-dispatch-script-driven | error | PASS | No Agent dispatch parameters are added or overridden; the Monitor command is not an Agent dispatch. |
| flag-semantic-consistency-cross-skill | error | PASS | New flags --interval, --timeout and --once are only in state/execute.js, which is out of scope for this guardrail. |
| workspace-mode-compatibility | error | PASS | State reads go through readState and resolveStateDir; the gh gate reads only prepare output; both modes are stated. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts; wave-watch text is static. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 9 adds `wave-watch` with new CLI flags in `plugins/sdlc-utilities/scripts/state/execute.js`, and Task 5 adds a `timedOut` field to the `probeGhAuth` return in `scripts/lib/git.js`, so both are public contract changes.

**Severity hint:** high

**Patch:** Document the new `timedOut` field on `probeGhAuth`, the new `state/execute.js wave-watch` subcommand and flags (`--interval`, `--timeout`, `--once`), and the stricter change-name pattern in `openspec-step.js`.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Document the new `timedOut` field on `probeGhAuth`, the new `state/execute.js wave-watch` subcommand and flags (`--interval`, `--timeout`, `--once`), and the stricter change-name pattern in `openspec-step.js`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Task 6 changes how `ship.js` enforces gh authentication ("gh is not required by the selected steps"), Task 5 changes the `gh auth status` result, and Task 8 rejects option injection via `CHANGE_NAME_RE`.

**Severity hint:** high

**Patch:** Add checks for gh authentication gating (errors versus warnings by step), timeout versus not-logged-in reporting, and leading-dash option injection through `--change` names.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Add checks for gh authentication gating (errors versus warnings by step), timeout versus not-logged-in reporting, and leading-dash option injection through `--change` names.

### UPDATE: code-quality (U1)

**Why:** Task 1 (`docs/specs/ship-sdlc.md`) and Task 17 (`CHANGELOG.md`) edit markdown that the dimension's current triggers do not match, so the script proposes adding `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Final Shape

When all tasks are done:

- The ship spec says what `ship.js` does: `migration` is always an object, branch content comes from the active worktree, the OpenSpec steps run `openspec-step.js`, and "abort" ends the run with `cancel`.

- A ship run that does not open a pull request no longer needs a logged-in `gh`. It prints one warning instead. A run with `pr`, `verify-pipeline` or `await-remote-review` still stops with the login message.

- A slow `gh` is reported as a timeout.

- During the execute step, ship prints one line for each finished wave. If the execute subagent returns while a wave is still running, ship stops and prints how to resume; execute is not marked failed.

- execute and its workers carry written rules: no early hand-back, no shell appends, no self-made worktrees. One exec case checks that the rules are present.

- `--quality minimal` tells the user when it overrides their spec-reviewer setting, and `gh pr create` warnings reach the user.

- No skill prose passes a value from one Bash call to the next in a shell variable.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 2 |
| Correctness | 0 | 0 | 2 | 1 |
| Coherence | 0 | 0 | 4 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9127 ship spec P8 | Task 1, Task 6 | covered |
| 2 #9131 R-projectroot-ship | Task 1 | covered |
| 3 #9137 spec follow-ups, doc, leading dash | Task 1, Task 8, Task 16 | covered |
| 4 #9173 minimal overrides specReviewer | Task 3, Task 10, Task 15 | covered |
| 5 #9192 pr-sdlc stderr on success | Task 4 | covered |
| 6 #9235 literal paths | Task 11 | covered |
| 7 #9236 $MIRROR | Task 11 | covered |
| 8 #9237 probeGhAuth timeout | Task 2, Task 5 | covered |
| 9 #9320 worker bans | Task 3, Task 12, Task 14 | covered |
| 10 #9347 F-28/F-29 | Task 2, Task 3, Task 7, Task 9, Task 11, Task 12, Task 13 | covered |
| 11 #9352 gh preflight gating | Task 2, Task 6, Task 13 | covered |
| 12 CHANGELOG, plan path, no w3 overlap, ids above R90 | Task 17, Task 2, Task 3 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
