# M7 Wave 0 — Plan Mode Keeps Unfinished Runs, Execute Task and Wave Selection, Ship Rebase Defaults to Skip (#9225) Implementation Plan

**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip`
**Goal:**
- The root problem: three gaps in ship and execute force workarounds on every orchestrated run.
  - Plan mode (`/ship-sdlc` while plan mode is active, `--plan-mode-blocked`) prunes an unfinished ship ledger of the branch whenever that ledger records no plan, so an interrupted run's state is lost (owner Q22a: ship never auto-discards).
  - execute-plan-sdlc can only run a whole plan, so every work unit needs its own plan file (the WHOLEPLAN workaround).
  - ship's own rebase step defaults to `auto` and rewrites pushed commits, so the later push needs `--force`.
- W8.34 (#9186): under `--plan-mode-blocked`, prepare never prunes an unfinished ledger of the branch. It adopts plan mode's own ledger (or a ledger of the same plan) and stops on every other unfinished or unparseable ledger.
- #9208: execute-plan-sdlc gets `--tasks <ids>` and `--from-wave <n>`; ship forwards both, raw, to the execute step only.
- W8.35 (#9212): ship's `--rebase` defaults to `skip`, like execute.
- Spec-consequence commits come first (four direct commits), then ONE ship run makes the code, case, SKILL.md and docs commit.
- Who fails if this ships wrong: users and orchestrators of ship runs (a lost ledger, or a plan-mode entry that refuses a run it should adopt), every ship run that reaches version or pr (rebase now skipped by default), and execute's completeness gate (exit 65 at cleanup when the recorded planned ids do not match the tasks that ran).

**Architecture:** Two phases on branch `m7-w0-9225-ship-selection`.

1. Direct commits D1–D4 (section `## Direct commits`), each made with `/sdlc:commit-sdlc --auto --subject "<subject>"` before the ship run, in order. They carry only spec text.
2. ONE ship run: `/sdlc:ship-sdlc --plan docs/plans/2026-11-04-m7-w0-ship-selection.md --steps execute,commit --rebase skip --quality balanced` (orchestrator brief step 4). execute-plan-sdlc runs Tasks 1–13; the commit step makes exactly one commit with the `**Commit:**` subject above (72 characters; matches `commit.subjectPattern`; no `"`, backtick, `$` or `\`).

| Commit | Kind | Subject (exact; length) |
|---|---|---|
| D1 | direct, spec | `docs(#9225): ship-sdlc - spec plan mode never prunes unfinished ledgers` (71) |
| D2 | direct, spec | `docs(#9225): execute-plan-sdlc - spec --tasks and --from-wave selection` (71) |
| D3 | direct, spec | `docs(#9225): ship-sdlc - spec forwards --tasks, --from-wave to execute` (70) |
| D4 | direct, spec | `docs(#9225): ship-sdlc - spec --rebase defaults to skip` (55) |
| S | ship commit (Tasks 1–13) | `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (72) |

Every subject was checked against `.sdlc/config.json#commit.subjectPattern` (`^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`) with node `RegExp.test` and `length` before this plan was written: all five `true`, all at most 72. #9225 is a local todo, not a GitHub issue, so the PR links no issue (see Guardrail Compliance, `pr-link-github-issue`).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-0-plan-source.md (items W8.34, #9208, W8.35; plan section 0; execution conventions), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-0-planner-brief.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m7/planner-answers-2.md (binding answers 1–11), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w0-plan-1.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m7/judge/m7-m0-1.md (sections 1 and 4), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w0-preflight.md (item 1: promptfoo pin 0.123.1)

**Verification:**

Every command runs exactly as written. PF-ENV: each promptfoo command runs in ONE Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`. `<export>` is a fresh JSON path under that `TMPDIR`. Baselines below were produced at 533ab55 by the planner (same commands, same env).

- (V1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "ship-prepare" -o <export>`: 115 passed, 0 failed (104 at 533ab55; this plan adds 11).
- (V2) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "execute-prepare" -o <export>`: 65 passed, 0 failed (53 at 533ab55; this plan adds 12).
- (V3) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "plan-mode-blocked" -o <export>`: 12 passed, 0 failed (7 at 533ab55; this plan adds 5; the rewritten `:1266` case keeps the string).
- (V4) Consumers of `skill/ship.js` (stepper and resume cases): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "ship-step|ship-resume-plan|review-gate" -o <export>`: 108 passed, 0 failed (108 at 533ab55).
- (V5) Consumers of `state/execute.js`: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "execute-plan-sdlc/" -o <export>`: 57 passed, 0 failed (57 at 533ab55).
- (V6) `node --check` on `plugins/sdlc-utilities/scripts/skill/ship.js`, `plugins/sdlc-utilities/scripts/skill/execute.js` and `plugins/sdlc-utilities/scripts/state/execute.js` exits 0; `node .claude/skills/validate-plugin-consistency/check-consistency.js --project-root .` prints `✓ All consistency checks passed.` and exits 0 (same at 533ab55).
- (V7) `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints only the two LEGACY_SHAPE lines (received-review-sdlc, version-sdlc) and exits 0; it does not list ship-sdlc or execute-plan-sdlc (same at 533ab55).
- (V8) `grep -Pzo "merged\.rebase\s*=\s*'skip';\s*sources\.rebase\s*=\s*'default'" plugins/sdlc-utilities/scripts/skill/ship.js` matches (W8.35).
- (V9) Static case counts (one Bash call from the worktree root): `grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml tests/promptfoo/datasets/execute-prepare-exec.yaml` prints `…ship-prepare-exec.yaml:241` and `…execute-prepare-exec.yaml:65` (230 and 53 at 533ab55). Exec total over `promptfooconfig-exec.yaml`'s datasets: 1007 (984 at 533ab55).
- (V10) No behavioural run (`promptfooconfig.yaml`) and no `claude plugin eval`.

---

## Context

**What problem does this change solve?**

- Plan mode can delete an interrupted ship run. A ship ledger (the JSON state file a ship run keeps under `.sdlc/execution/`) that records no plan is pruned when the user enters plan mode. The owner ruled that ship never discards a run on its own (Q22a).
- execute-plan-sdlc always runs every task of a plan. An orchestrator that wants one work unit at a time must split the work into one plan file per unit.
- ship's rebase step defaults to `auto`. On a second run, or a resume after a push, it rewrites commits that are already pushed, and the next push needs `--force`.

**What prompted this change now?** The owner placed all three items in M7 wave 0 on 2026-11-04, before the M7 start. They share the ship spec and `skill/ship.js`, so they ship in one PR.

**What does success look like?**

- Entering plan mode twice keeps the same ledger, byte for byte. Plan mode stops, and writes nothing, when it finds an unfinished ledger it cannot match, an unreadable ledger file, or two unfinished ledgers.
- `/execute-plan-sdlc --tasks 3,4` runs only tasks 3 and 4; `--from-wave 2` runs from wave 2 on; ship forwards both flags to the execute step only.
- A ship run with no `--rebase` and no config records the rebase step as skipped.
- Every new and existing exec case of the touched scripts passes (V1–V5).

## Research Findings

**Plan mode never records a plan in its ledger.** The plan-mode block in `skill/ship.js` (`if (flags.planModeBlocked) {`) spawns `state/ship.js init --flags JSON.stringify(flags)`. `flags` is `mergeFlags`' `merged`, which has no `planFile` key; only `ensureLedger` (the normal path) adds one. A planner probe on a scratch repo confirmed it: `--plan-mode-blocked --has-plan --plan <file>` writes a ledger whose flags have no `planFile` key but do have `planModeBlocked: true` (judge m7-m0-1 §1 a1–a4).

**So the item's "same plan" test cannot work for plan mode's own ledger.** The ruling (w0-plan-1 note 1) picks the marker instead: a key-less ledger with `flags.planModeBlocked === true` is plan mode's own and is adopted. This is a recorded deviation from W8.34's (i) wording (Deviations row 1).

**Today's guard skips the cases that matter.** `checkPlanMismatch` skips a ledger whose `flags` has no `planFile` key (`if (!led.flags || !('planFile' in led.flags)) continue;`). `branchLedgers` skips an unparseable file with a stderr line (`branchLedgers: ledger unreadable, skipped (…)`). Both are then pruned by `cmdInit`'s `pruneStateFiles('ship', branchSlug)`.

**The plan-mode fixture holds an unfinished key-less ledger.** `tests/promptfoo/fixtures-fs/project-ship-plan-mode-blocked/.sdlc/execution/ship-feat-test-plan-mode-20240101T000000Z.json` has `"flags": { "bump": "minor", "steps": [...] }`, every step `pending`, no `planModeBlocked`. Five ship-prepare cases use the fixture; the `--gc` case returns before the plan-mode block and is unaffected. Under the new rule the seed is exactly the "stop" fixture, so it stays unchanged. The two cases that need a fresh ledger (`--bump patch` writes, `--steps csv`) point `SDLC_STATE_DIR_OVERRIDE` at an empty directory instead (judge §1 b4). `lib/state.js initState` creates that directory (`fs.mkdirSync(stateDir, { recursive: true })`).

**Execute already parses plans and builds waves.** `lib/plan-parse.js` yields integer task ids (`/^### Task (\d+):\s*(.+)$/`, `parseInt`). `buildWaves(tasks, { quality, guardrails, dispatchBudget })` in `skill/execute.js` sorts tasks topologically (Kahn's algorithm, a queue of tasks whose dependencies are done), keeps two tasks that share a file apart, then splits by the weighted cap, one High-risk task per wave and the byte budget. Two facts matter:

- `topoOrder` counts every `dependsOn` entry. A task whose dependency is not in its input never becomes ready, so passing a subset with outside dependencies would drop tasks silently (judge §1 c2).
- Wave numbers depend on the quality tier, the guardrails and the dispatch budget, so `--from-wave n` names the waves prepare prints for those values (judge §1 c3).

**Execute's completeness gate needs the selected ids.** `state/execute.js init` records `plannedTaskIds` and `totalTasks` (SKILL.md passes every task id, as strings: `'["1","2","3"]'`). `verify-completeness` and the verifying `cleanup` exit 65 when a planned id is unaccounted. Its id comparison strips a leading `T` from strings but does not convert numbers, so the planned ids must stay strings like today.

**Ship dispatches execute from the ledger, not from the CLI.** The `--after` step emitter recomputes the steps with `computeSteps(flags, …)` where `flags` is the ledger's `flags`; `dispatch_execute` sends `cs.args` (plus `--resume` on a resumed run). `ensureLedger` adopts a resumed ledger without refreshing its flags, except the `FROZEN_FLAG_KEYS` (`planFile`, `openspecContext`, `sources`) when absent. So `--tasks` and `--from-wave` must be written to the ledger to reach the execute dispatch at all. To keep them out of a resume (answer 8, owner Q22b), `ensureLedger` replaces them with this run's CLI values every time (Key Decisions KD-4).

**Rebase today.** `mergeFlags` ends the rebase branch with `merged.rebase  = 'auto'; sources.rebase = 'default';` under the comment `// Default is true → 'auto'`. The emitter's `case 'rebase'` runs `if (flags.rebase === 'skip') { skipped.push('rebase'); continue; }`. The existing case `ship-step: (q) review_gate below-threshold findings …` already asserts that a `skip` ledger records `rebase` in `progress.skipped`. execute already defaults to `skip` (`EXECUTE_DEFAULTS.rebase`; execute spec A5).

**Exec test patterns.** Fixtures are copied to a temp dir and their `setup.sh` runs per case (`tests/promptfoo/scripts/extract-skill-content.js`). Multi-step cases use `script_path: "-e"` with a whitespace-free one-line `script_args` program that seeds files in its cwd, spawns the script and prints one JSON line (mirror: the two `ship-prepare (R64)` cases). Every new case's description starts with its filter string (`ship-prepare`, `execute-prepare`).

**Spec ids at 533ab55** (re-checked with `grep -oE '^- [AR][0-9]+'`): ship A11 / R74 highest, execute A7 / R42 highest; A12–A14, R75, R76, execute A8, A9 and R43 are free. The P-5 id set at 533ab55: ship-sdlc 202 ids, execute-plan-sdlc 147 ids.

**Planner probe (scratch copy of the plugin, never the repo).** Task 1's, Task 6's and Task 11's edits were applied by script to a scratch copy of `plugins/sdlc-utilities` and run against a scratch git repo with `SDLC_STATE_DIR_OVERRIDE`. Results: plan mode twice → exit 0 both times, same `stateFile`, identical sha256, one file (R1); a second unfinished plan-mode ledger → exit 1 `(records no plan)` for the copy and both named (R5); an unparseable file → exit 1 `(cannot be parsed)` (R4); a key-less unmarked ledger → exit 1 `(records no plan)` (R3); a finished ledger → exit 0 with a new file, old one pruned (R6); a same-plan `planFile` ledger → exit 0, adopted (R2); `--has-plan --quality balanced --tasks 3,4 --from-wave 2` → execute `args` `--quality balanced --tasks 3,4 --from-wave 2`, commit/review/received-review args unchanged (S1); `--has-plan --tasks` → `--tasks requires a value.` (S2). Task 3 (execute) was not probed; its cases are specified from the code.

**Not changed: `schemas/execute-state.schema.json`.** It declares `additionalProperties: false` at the top level and already lacks `plannedTaskIds`, which `init` writes today; no test validates state files against it. The new `selection` field follows `plannedTaskIds` (Follow-up 3).

## Plan readings

Quoted from the binding sources:

- Brief: "Three items, kept separate (never joined into one task), in this order, all in ONE plan file and ONE PR". → Tasks 1–2 (W8.34), 3–10 (#9208), 11–13 (W8.35).
- Brief: "Spec-consequence commits go first … the executor makes these through `/sdlc:commit-sdlc` before the ship run." → D1–D4.
- Answers-2 item 11: "Spec-consequence commits first, in this order: ship R64 (and the R-implicit-resume sentence) for W8.34; then the execute spec (A8, A9, R43); then the ship spec A13, A14, R76; then W8.35's ship spec A12, R75, R9, G8. Each one P-5 `SAME`." → D1–D4; the P-5 reading is Deviations row 5.
- Answers-2 item 5 (W8.34 mechanism, judge A1 option b) and item 6 (tests). → Task 1, Task 2.
- Answers-2 items 7–9 (#9208 semantics, ship side, Files). → Tasks 3–10.
- Ruling w0-plan-1 note 1: "The PR body names the deviation and cites this ruling." → Deviations row 1; the executor's PR body.
- Ruling w0-preflight item 1: every promptfoo run uses `npx --yes promptfoo@0.123.1`.
- Plan section 0 rule 2: locate every quoted line by content with `grep -n`, exactly once; a quote not found that way is a STOP. Rule 3: apply only the Change. Rule 8: a Change that contradicts the code is a STOP.
- GATE-9: no test depends on a timer. Every wait in this plan is a `spawnSync` call that returns when its child exits (bounded by the existing 30 s script-runner limit, which no case relies on).

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| W8.34 "same plan" for plan mode's own ledger | yes | adopts a key-less unfinished ledger with `flags.planModeBlocked === true` instead of comparing `planFile` | plan-mode ledgers never record `planFile` (judge m7-m0-1 §1 a1–a4), so (i)'s "both resolve equal" cannot hold; ruling w0-plan-1 note 1 (judge A1 option b). The PR body names this deviation and cites ruling-w0-plan-1.md |
| W8.34 cases `:1216` and `:1236` | yes | change only `script_env` to an empty state dir; the seed fixture and every assertion script stay unchanged | the seed is now the "stop" fixture; answers-2 item 6 (judge A2) |
| Discovery fan-out | yes | inline exploration; no plan-explore-orchestrator | brief PLAN-4 turns discovery fan-out off; the binding reading overrode only critique and lens review (answers-2 item 1) |
| Learning Capture | yes | not written to `.sdlc/learnings/log.md` | the plan file is the only file the planner writes (answers-2 item 2) |
| P-5 for D2–D4 | no | expects `removed=[]` and `added=` exactly the planned new ids (D1: none; D2: A8 A9 R43; D3: A13 A14 R76; D4: A12 R75) | answers-2 item 11 says "P-5 `SAME`", but D2–D4 add ids by design; read as "no id removed, renamed or renumbered" |
| W8.35 "default → rebase in `progress.skipped`" case | no (raised to the controller in done-file m7/w0/plan/3) | proven by two cases instead of one new end-to-end case: the BUILT_IN_DEFAULTS case now asserts `"rebase": "skip"` (prepare side), and the existing `ship-step: (q) … below-threshold …` case asserts `skip` → `progress.skipped` includes `rebase` (emitter side) | an end-to-end case needs a real initial call that reaches the rebase step (version or pr runnable: gh stub, base-branch detection, a commit result with HEAD sha); the only driver for that is `tests/promptfoo/scripts/run-ship-stepper.js`, whose seeds hard-code `rebase: skip`, and it is outside W8.35's Files. Planner probe: the `auto-walk` scenario (`--steps commit,review`) never reaches the rebase step. Arbiter ruling `ruling-w0-plan-2.md` Q1 (a)+B3: accepted, plus case B3 (Task 13); a recorded deviation from W8.35 Change 4's case list |
| `--tasks`/`--from-wave` in the ship ledger | no | written to the ledger's `flags` when given (needed: `dispatch_execute` builds its args from the ledger), and replaced by this run's CLI values in `ensureLedger` on every run, so a `--resume` never restores them | answers-2 item 8 / owner Q22b: "not restored from the ship ledger"; KD-4 |
| W8.34 extra case: two unfinished plan-mode ledgers | no | adds one case beyond answer 6's list (stop, both named, both unchanged) | answers-2 item 5 (A3) states the rule; `state-machine-idempotency` asks for the case |
| Execute small-plan and runner-mode predicates under a selection | no | keep counting `plan.tasks.length`; the small-plan path runs only `flags.selection.taskIds` | narrowest change; the predicates measure plan size (SKILL.md Step 5b), not run size |
| Interactive "resume? yes" under a selection | no | re-runs prepare with `--resume` before resuming when `flags.selection` or `resume.selection` is non-null | the recorded selection must win on every resume (answers-2 item 7); only the prepare script applies it |
| `schemas/execute-state.schema.json` | no | not changed | not in Files (answers-2 item 9); it already lacks `plannedTaskIds` and nothing validates against it (Follow-up 3) |

## Key Decisions

- **KD-1 Plan mode runs a second check after the plan check.** The existing `checkPlanMismatch` call stays first, with its messages, for ledgers that record a `planFile`. A new `planModeLedgerCheck` then reads every same-branch ledger file, unparseable ones included, and decides: adopt, stop, or init. Alternative: fold everything into `checkPlanMismatch`. Rejected: the normal path shares that function and must not change.

- **KD-2 Adopt only when exactly one ledger is open.** "Open" means unfinished or unparseable. Adopt when the only open ledger is plan mode's own (no `planFile` key, `planModeBlocked: true`) or records the same plan. Anything else stops and names every open ledger. Alternative: adopt the newest. Rejected by ruling note 2 (judge A3): with two, ship would have to guess.

- **KD-3 `branchLedgers` gets an opt-in `withUnparseable` option.** With it, an unparseable file is returned as `{ fullPath, flags: null, finished: false, unparseable: true }` and a missing state directory (ENOENT) returns `[]` silently. Without it, behaviour and stderr text are byte-identical. Alternative: a second directory scan. Rejected (`dry`).

- **KD-4 Ship keeps the selection flags in the ledger, but never across a resume.** `dispatch_execute` takes its args from the ledger, so the flags must be stored there. `ensureLedger` then sets `ledger.flags.tasks` / `ledger.flags.fromWave` from this run's CLI on every run and deletes them when the CLI has none. Alternative: never store them. Rejected: the execute step would never receive them. A plan-mode entry with `--tasks` writes them into its ledger and the adopt path leaves them; the next normal run's `ensureLedger` replaces them, so this is harmless.

- **KD-5 The selected-task ids reach the state file through prepare, not the model.** Prepare emits `flags.selection = { tasks, fromWave, taskIds }`; SKILL.md passes it verbatim to `init --selection` and turns `taskIds` into the string id list for `--planned-task-ids` (`scripts-over-llm-logic`).

- **KD-6 An outside dependency is dropped from a copy of the task, not from the plan.** For the wave build only, each selected task's `dependsOn` loses the ids outside the selection, and prepare warns once per (task, dependency) pair. `plan.tasks` (P2) keeps the whole plan. `buildWaves` itself is untouched.

- **KD-7 The two flag names mean the same thing in both prepare scripts.** `grep -ln -- "'--tasks'\|'--from-wave'\|\"--tasks\"\|--from-wave" plugins/*/scripts/skill/*.js` printed nothing at 533ab55 (exit 1): no user-invoked prepare script defines either name today. After this plan, `skill/execute.js` defines them (run only these tasks / from this wave) and `skill/ship.js` defines them as the same selection, passed through to execute (`flag-semantic-consistency-cross-skill`).

- **KD-8 No new path; both workspace modes behave alike.** Every ledger and state-file read or write in this plan goes through the existing resolvers: `branchLedgers` uses `resolveStateDir()` (the main worktree's `.sdlc/execution/`), `state/execute.js init` uses `lib/state.js initState` (same resolver), and config reads use `readSection(resolveSdlcRoot(), …)`. Ship's workspace is derived (`branch` or `continue`, ship R60; there is no worktree mode any more), and the derive runs after the plan-mode block, so plan mode behaves the same in both. A run from a linked worktree reads the same main-worktree state dir; the existing execute cases `(l8)`/`(l9)` (linked worktree) and the R64 cases (main worktree) keep both paths covered (`workspace-mode-compatibility`).

---

## Contract Examples

**code** (Task 1):

```markdown
**Contract:**
- shape (code): `planModeLedgerCheck(branch: string, planFile: string|null): { error?: {id:'resumePlanMismatch', message}, adopt?: string }`; `branchLedgers(branch, { withUnparseable = false } = {})`.
- names: `planModeLedgerCheck`, `withUnparseable`, `unparseable`, `planModePlan`.
- mirror: `checkPlanMismatch` (`skill/ship.js`, the function after `branchLedgers`).
- decisions: KD-1, KD-2, KD-3.
- sync: ship spec R64 (D1); Task 2 cases.
```

**docs** (Task 8):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/execute-plan-sdlc.md` `## Flags` (two rows after `--plan <path>`) and `## State Persistence and Resume` (one paragraph); MODIFY `docs/skills/ship-sdlc.md` `## Flags` (two rows after `--plan <path>`). Audience: end users.
- names: rows `--tasks <ids>`, `--from-wave <n>`.
- mirror: the `--plan <path>` rows of both pages.
- decisions: KD-5.
- sync: execute spec A8, A9, R43; ship spec A13, A14, R76.
```

**openspec / spec** (D2):

```markdown
**Contract:**
- shape (openspec): ADD `A8`, `A9`, `R43` to `docs/specs/execute-plan-sdlc.md` `## Inputs and flags`; MODIFY `P1` and `P7` (one field each); numbering continues from A7 / R42.
- names: `A8`, `A9`, `R43`, `P1`, `P7`.
- mirror: `A7` and `R-PLANFILE` in the same section.
- decisions: KD-5, KD-6.
- sync: Tasks 3, 4, 5, 9 implement it.
```

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code Tasks 1, 3, 4, 6 and 11 have exec cases in Tasks 2, 5, 7 and 13; the existing cases whose behaviour changes (`:1216`, `:1236`, the `:1266` idempotency case, the BUILT_IN_DEFAULTS rebase assertion) are updated |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | V1–V5 use the exec-only config, targeted, each once; V10 forbids behavioural runs and `claude plugin eval` |
| skill-docs-required | error | PASS | No new SKILL.md; two existing ones are edited with their specs and docs pages |
| no-scope-creep | warning | PASS | Every task maps to W8.34, #9208 or W8.35; the extra two-ledger case is Deviations row 8 |
| single-responsibility-tasks | warning | PASS | One deliverable per task; Tasks 4 and 8 pair a script or page with its closest companion |
| scripts-over-llm-logic | error | PASS | Adoption, selection and the rebase default are resolved in prepare scripts (KD-5); SKILL.md only reads `flags.selection` |
| yagni | warning | PASS | `withUnparseable` is opt-in and used; nothing speculative |
| cross-skill-consistency | error | PASS | Ship forwards to execute; both specs, SKILL.md files and docs pages change together (D2, D3, Tasks 8–10) |
| pr-link-github-issue | error | PASS | #9225 is a local todo, not a GitHub issue; subjects carry `(#9225)`; the PR links no issue |
| dry | warning | PASS | `planModeLedgerCheck` reuses `branchLedgers` via an option (KD-3) |
| kiss | warning | PASS | An opt-in option, a raw pass-through and a one-line default |
| spec-first | error | PASS | D1–D4 precede the ship run; Tasks 9 and 10 cite D2 and D3 ids |
| project-agnostic | error | PASS | Changes are in plugin scripts, SKILL.md files and plugin docs; no repo-local config |
| flag-coherence-cross-skill | error | PASS | Task 9's sites read `flags.selection` / `resume.selection` from prepare output, never `$ARGUMENTS` |
| no-opposite-logical-vectors | error | PASS | Every site gates on `flags.selection` null vs non-null; the resume site adds `resume.selection` for the recorded value |
| flag-resolution-single-source | warning | PASS | Selection resolves only in `skill/execute.js`; ship's rebase default has one site |
| state-premise | error | PASS | Goal opens with the root problem |
| smallest-viable-cut | warning | PASS | The three owner-placed items only |
| failure-audience | warning | PASS | Goal names who fails (fixed after Step 3) |
| explicit-non-goals | warning | PASS | Must-not-touch list, declined rebase variant, unchanged schema, Follow-ups |
| ambiguity-stops-and-asks | error | PASS | Open design points were asked and ruled (answers-2, ruling w0-plan-1); the rest are KD-1–KD-8 |
| state-machine-idempotency | error | PASS | R1 runs plan mode twice and asserts the same `stateFile` with unchanged bytes; R2 and R6 cover adopt and replace |
| agent-dispatch-script-driven | error | PASS | Execute args come from `computeSteps` over the ledger flags; the model adds nothing |
| flag-semantic-consistency-cross-skill | error | PASS | KD-7: no prepare script defines either name at 533ab55 (grep evidence); execute and ship give them one meaning (fixed after Step 3) |
| workspace-mode-compatibility | error | PASS | KD-8: all paths via `resolveStateDir()` / `resolveSdlcRoot()`; behaviour is the same in both derived workspaces (fixed after Step 3) |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes in dispatched prompts; selection values only extend the execute args tail |

---

## Direct commits (before the ship run)

These four commits are NOT plan tasks: ship and execute never run them (the plan's `### Task N:` headings are Tasks 1–13 only). The executor makes each one alone, in order D1 → D4, with the Edit tool (no shell writes to repo files), then `/sdlc:commit-sdlc --auto --subject "<subject>"` with only that commit's file staged. Locate every old line by content with `grep -n`; each must occur exactly once (plan section 0 rule 2), else STOP.

P-5 block (the NEW regex, standing rule; run in ONE Bash call before D1 and after each of D1–D4):

```bash
export LC_ALL=C; for s in ship-sdlc execute-plan-sdlc; do b=$(git show 533ab55:docs/specs/$s.md | grep -oE '^(#{2,4} |- (\*\*)?)([A-Z]{1,3}[0-9]+[a-z]?|[A-Z]{1,3}-[A-Za-z0-9][A-Za-z0-9-]*)(\*\*)?([ :(.]|$)' | sed -E 's/^(#{2,4} |- (\*\*)?)//; s/(\*\*)?([ :(.])?$//' | sort -u); h=$(grep -oE '^(#{2,4} |- (\*\*)?)([A-Z]{1,3}[0-9]+[a-z]?|[A-Z]{1,3}-[A-Za-z0-9][A-Za-z0-9-]*)(\*\*)?([ :(.]|$)' docs/specs/$s.md | sed -E 's/^(#{2,4} |- (\*\*)?)//; s/(\*\*)?([ :(.])?$//' | sort -u); echo "$s base=$(echo "$b" | wc -l) head=$(echo "$h" | wc -l) added=[$(comm -13 <(echo "$b") <(echo "$h") | tr '\n' ' ')] removed=[$(comm -23 <(echo "$b") <(echo "$h") | tr '\n' ' ')]"; done
```

Expected output after each commit (`removed=[]` always; Deviations row 5):

| After | ship-sdlc | execute-plan-sdlc |
|---|---|---|
| 533ab55 | `base=202 head=202 added=[] removed=[]` | `base=147 head=147 added=[] removed=[]` |
| D1 | `head=202 added=[]` | `head=147 added=[]` |
| D2 | `head=202 added=[]` | `head=150 added=[A8 A9 R43 ]` |
| D3 | `head=205 added=[A13 A14 R76 ]` | `head=150 added=[A8 A9 R43 ]` |
| D4 | `head=207 added=[A12 A13 A14 R75 R76 ]` | `head=150 added=[A8 A9 R43 ]` |

After each commit also: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints only the two LEGACY_SHAPE lines and exits 0; `git status --porcelain` is empty.

### D1: ship spec — R64 plan mode never prunes an unfinished ledger; R-implicit-resume narrowed (W8.34)

- Subject: `docs(#9225): ship-sdlc - spec plan mode never prunes unfinished ledgers`
- File: `docs/specs/ship-sdlc.md` only.
- Edit 1 (R64, the line starting `- R64: When \`/ship-sdlc\` is invoked while plan mode is active`): replace its LAST sentence, exactly:

  old: ``A ledger whose `flags` has no `planFile` key, or one of the same plan, is replaced by the init as before; without `--plan`, so is a ledger whose `planFile` is `null`.``

  new: ``Plan mode never prunes an unfinished ledger of the branch (owner Q22a). After that plan check, prepare reads every same-branch ledger file, parseable or not; a missing state directory means there is none. A ledger is open when it is unfinished or cannot be parsed. When exactly one ledger is open and it is plan mode's own ledger (its `flags` has no `planFile` key and has `planModeBlocked: true`) or a ledger of the same plan (`--plan` and its `flags.planFile` resolve to the same file, or `--plan` is absent and the ledger's `flags.planFile` is `null`), prepare adopts it: no init, no prune, no write; the output keeps its shape, with `stateFile` set to that ledger and `prunedOrphans: []`, so entering plan mode again is idempotent. Every other case with an open ledger stops with the same `resumePlanMismatch` error, mirrored to stderr, with no state write: an unfinished ledger whose `flags` has no `planFile` key and no `planModeBlocked: true`, a ledger file that cannot be parsed, or more than one open ledger. The message names every open ledger and the ways out: continue the run with `--resume`, or discard it with ship's own verbs (`state/ship.js skip` on each leftover step, then `state/ship.js cleanup-pipeline`); a file that cannot be parsed can only be removed by hand. Finished ledgers are replaced by the init as before (R-ship-init-prune).``

- Edit 2: directly after the R64 line, insert one new line:

  ``  - Acceptance: exec cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-prepare (R64): --plan-mode-blocked twice adopts its own ledger`, `… adopts an unfinished ledger of the same plan`, `… stops on an unfinished ledger that records no plan`, `… stops on a ledger file that cannot be parsed`, `… stops on two unfinished plan-mode ledgers`, `… replaces a finished ledger by init as before`.``

- Edit 3 (R-implicit-resume, the line starting `- R-implicit-resume: After context compaction`), exactly:

  old: ``A ledger file that cannot be parsed is not compared; init replaces it as before.``

  new: ``On the normal (non-plan-mode) path a ledger file that cannot be parsed is not compared, and init replaces it as before; plan mode stops on it instead (R64).``

- Not changed: R-ship-init-prune, every other line.
- Check: `grep -c 'Plan mode never prunes an unfinished ledger of the branch' docs/specs/ship-sdlc.md` → `1`; `grep -c 'is replaced by the init as before; without' docs/specs/ship-sdlc.md` → `0`; `grep -c 'On the normal (non-plan-mode) path a ledger file that cannot be parsed' docs/specs/ship-sdlc.md` → `1`.

### D2: execute spec — A8, A9, R43; P1 and P7 (#9208)

- Subject: `docs(#9225): execute-plan-sdlc - spec --tasks and --from-wave selection`
- File: `docs/specs/execute-plan-sdlc.md` only.
- Edit 1: after the line starting `- A7: \`--plan <path>\``, insert two lines:

  ``- A8: `--tasks <ids>` — run only the listed plan tasks: a comma-separated list of the integer task ids `lib/plan-parse.js` yields from the `### Task N:` headings (for example `--tasks 3,4`); duplicates are ignored and no `T` prefix is accepted. Mutually exclusive with `--from-wave` (R43) (default: unset, every task runs)``

  ``- A9: `--from-wave <n>` — run the plan from wave `n` on: an integer `>= 1` naming one of the `waves` (P4) that prepare prints for the resolved quality tier, guardrails and dispatch budget; earlier waves are dropped and the remaining waves keep their numbers. Mutually exclusive with `--tasks` (R43) (default: unset, every wave runs)``

- Edit 2: after the line starting `- R-PLANFILE: A plan file MUST be supplied` (the last line before the blank line and `- R-config-version:`), insert:

  ```markdown
  - R43: Task and wave selection. The prepare script `skill/execute.js` resolves `--tasks` (A8) and `--from-wave` (A9) into `flags.selection` (P1) and builds `waves` (P4) for the selected tasks only. Without either flag `flags.selection` is `null` and the run is unchanged.
    - `--tasks`: the waves are built from the selected tasks alone and numbered `1..k`. A selected task whose dependency is not selected still runs: the dependency counts as done for the wave build, and prepare adds a warning naming the task and the dependency. A value that is not a comma-separated list of integers, or an id the plan does not have, is an `invalidFlag` error (exit 1) naming the value or the ids.
    - `--from-wave n`: the waves of the whole plan are built as without the flag; waves numbered below `n` are dropped and the rest keep their numbers. A selected task whose dependency lies in a dropped wave gets the same warning. A value that is not an integer `>= 1`, or an `n` greater than the number of waves, is an `invalidFlag` error. Wave numbers depend on the resolved quality tier, guardrails and dispatch budget, so `n` names the waves prepare prints for those values.
    - Passing both flags is an `invalidFlag` error.
    - State: `state/execute.js init --selection '<json>'` records the selection as the state file's `selection` field (`null` without a selection), and `--planned-task-ids` / `--total-tasks` carry only the selected task ids, so the R14 completeness check covers exactly the tasks that run.
    - Resume (`--resume`, including the implicit resume of R36): the selection recorded in the state file wins. A run without `--tasks` and `--from-wave` uses it; a CLI selection that differs from it is an `invalidFlag` error and nothing is written. A state file without a `selection` field counts as `null`.
    - Acceptance: exec cases in `tests/promptfoo/datasets/execute-prepare-exec.yaml` whose descriptions start with `execute-prepare: (sel`.
  ```

- Edit 3 (P1): in the line starting `- P1: \`flags\` (object:`, exactly:

  old: ``specReviewer, skipConfigCheck, sources }`)``

  new: ``specReviewer, skipConfigCheck, selection, sources }`)``

  and at the END of the same line, after ``never `$ARGUMENTS` or raw config.``, append: `` `selection` is `null` or `{ tasks, fromWave, taskIds }` (R43): `tasks` is the sorted id list of `--tasks` or `null`, `fromWave` the `--from-wave` number or `null`, `taskIds` the ids that run; `sources.selection` is `cli`, `state` or `null`.``

- Edit 4 (P7), exactly:

  old: ``- P7: `resume` (object: `{ found, stateFile, planPath, planHash, completedWaves }`)``

  new: ``- P7: `resume` (object: `{ found, stateFile, planPath, planHash, completedWaves, selection }`)``

  and at the END of the P7 line append: `` `selection` is the state file's recorded selection (R43), `null` when absent.``

- Check: `grep -cE '^- (A8|A9|R43):' docs/specs/execute-plan-sdlc.md` → `3`; `grep -c 'skipConfigCheck, selection, sources' docs/specs/execute-plan-sdlc.md` → `1`.

### D3: ship spec — A13, A14, R76 (#9208)

- Subject: `docs(#9225): ship-sdlc - spec forwards --tasks, --from-wave to execute`
- File: `docs/specs/ship-sdlc.md` only.
- Edit 1: after the line starting `- A11: \`--plan <path>\``, insert:

  ``- A13: `--tasks <ids>` — forwarded unchanged to execute-plan-sdlc as `--tasks <ids>` (execute A8); ship checks only that a value follows the flag (R76) (default: unset)``

  ``- A14: `--from-wave <n>` — forwarded unchanged to execute-plan-sdlc as `--from-wave <n>` (execute A9); ship checks only that a value follows the flag (R76) (default: unset)``

- Edit 2: after the `  - Acceptance:` line that follows `- R-plan-commit-subject:` (the last line before the blank line and `### Configuration`), insert:

  ```markdown
  - R76: Execute selection pass-through. `skill/ship.js` forwards `--tasks <ids>` (A13) and `--from-wave <n>` (A14) with their raw values, unchanged, in the `execute` step's `args` only, after `--quality`; no other step gets them. Ship does not validate the values (execute R43 does), but a flag with no value (last argument, or followed by another `--` flag) is a prepare error. The ledger's `flags` holds this run's values, because the step emitter builds `dispatch_execute`'s args from the ledger; every run replaces them with its own CLI values (absent when not given), so `--resume` never restores them (R11 restores only the plan and the steps). execute's state file keeps the selection across its own resume (execute R43). `dispatch_execute`'s task check and the failed-task listing keep reading the whole plan.
    - Acceptance: exec cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml` whose descriptions start with `ship-prepare (R76)`.
  ```

- Edit 3 (Phases, the `   - **Params:** A1-A7, A9-A11 forwarded` line), exactly:

  old: ``A1-A7, A9-A11 forwarded (`--auto`, `--steps <csv>`, `--quality`, `--bump`, `--draft`, `--resume`, `--init-config`, `--openspec-change`, `--plan <path>`)``

  new: ``A1-A7, A9-A11, A13, A14 forwarded (`--auto`, `--steps <csv>`, `--quality`, `--bump`, `--draft`, `--resume`, `--init-config`, `--openspec-change`, `--plan <path>`, `--tasks <ids>`, `--from-wave <n>`)``

- Check: `grep -cE '^- (A13|A14|R76):' docs/specs/ship-sdlc.md` → `3`.

### D4: ship spec — A12, R75, R9, G8 (W8.35)

- Subject: `docs(#9225): ship-sdlc - spec --rebase defaults to skip`
- File: `docs/specs/ship-sdlc.md` only.
- Edit 1: after the line starting `- A11: \`--plan <path>\`` (so before A13), insert:

  ``- A12: `--rebase auto|skip|prompt` — rebase strategy for ship's own `rebase` step (R9, R75) (default: `skip`)``

- Edit 2: directly before the line starting `- R76: Execute selection pass-through.`, insert:

  ```markdown
  - R75: Without `--rebase` and without `ship.rebase` in `.sdlc/local.json`, the rebase strategy is `skip`. `ship.rebase` maps `true` → `auto`, `false` → `skip` and `"prompt"` → `prompt`; the CLI `--rebase` wins over config. `skill/ship.js` records the source in `flags.sources.rebase` (`cli`, `config` or `default`).
    - Acceptance: the case `ship-prepare: BUILT_IN_DEFAULTS resolve to balanced steps (no version) when no config exists` resolves `"rebase": "skip"`; the `ship-prepare (R75)` cases resolve config `true` to `auto` with source `config`, and `--rebase auto` to `auto` with source `cli`; the `ship-prepare (R75)` default-ledger case records `flags.rebase: "skip"`; and `ship-step: (q) review_gate below-threshold findings …` records `rebase` in `progress.skipped` for `skip`.
  ```

- Edit 3 (R9), exactly: old ``- R9: Rebase onto default branch after all commits, before version step; abort and pause on conflict`` → new ``- R9: When `--rebase auto` (or `prompt`), rebase onto default branch after all commits, before version step; abort and pause on conflict``
- Edit 4 (G8), exactly: old ``- G8: Rebase attempted — rebase ran after commits, before version (when applicable)`` → new ``- G8: Rebase attempted when `--rebase auto` (or `prompt`) — rebase ran after commits, before version (when applicable)``
- Not changed: E8, the step table row `| \`rebase\` | \`dispatch_version\` | …`, the rebase step's commands.
- Check: `grep -cE '^- (A12|R75):' docs/specs/ship-sdlc.md` → `2`; `grep -c 'When `--rebase auto` (or `prompt`), rebase onto' docs/specs/ship-sdlc.md` → `1`.

---

## Tasks

The ship run executes Tasks 1–13. They land in the single ship commit `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip`. Every edit is made with the Edit tool; every quoted line is located by content with `grep -n` and must occur exactly once; multi-site edits in one file go bottom-up. Must-not-touch for the whole run: R-ship-init-prune and `cmdInit`'s prune; the `resumePlanMismatch` messages of `checkPlanMismatch`; GC; the `buildWaves` algorithm; `FROZEN_FLAG_KEYS`; the args of every ship step other than `execute`; execute behaviour without `--tasks`/`--from-wave`; the rebase step's commands and its conflict path; execute's rebase; `tests/promptfoo/assertions/**`; every fixture under `tests/promptfoo/fixtures-fs/`.

### Task 1: ship.js — plan mode adopts its own ledger and stops on every other open ledger (W8.34)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `branchLedgers` gains `withUnparseable`; new `planModeLedgerCheck` after `checkPlanMismatch`; the plan-mode block calls it before the init spawn.

**Notes:** Implements ship spec R64 (D1), KD-1–KD-3. The normal path keeps calling `branchLedgers(branch)` with no options, so its behaviour and stderr text do not change (Must-not-touch). Edit bottom-up: Edit 3, then Edit 2, then Edit 1.

**Acceptance criteria:**
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0.
- [ ] `grep -c 'function planModeLedgerCheck' plugins/sdlc-utilities/scripts/skill/ship.js` → `1`; `grep -c 'planModeLedgerCheck(' …ship.js` → `2`; `grep -c 'withUnparseable' …ship.js` → `5` (doc-comment line, signature, ENOENT branch, parse branch, the call in `planModeLedgerCheck`; planner probe on the scratch copy without the doc line: 4).
- [ ] `grep -c "ship-sdlc will not discard an unfinished run in plan mode" …ship.js` → `1`; `grep -c "ship-sdlc will not resume or discard a run of a different plan" …ship.js` → `1` (unchanged).
- [ ] Task 2's cases pass (run there).

**Contract:**
- shape (code): see Contract Examples (code); the three edits below.
- names: `planModeLedgerCheck`, `withUnparseable`, `unparseable`, `planModePlan`, `planModeCheck`.
- mirror: `checkPlanMismatch` (message style, `STATE_SHIP_SCRIPT` verbs); the plan-mode block's error exit (`errors.push(planModeError); writeFatalErrors(errors); writeOutput({ errors, warnings }, 'ship-prepare', 1); return;`).
- decisions: KD-1, KD-2, KD-3.
- sync: ship spec R64 (D1); Task 2.

Edit 1 — `branchLedgers` (anchor: `function branchLedgers(branch) {` through its closing `}` before the `checkPlanMismatch` doc comment):

```diff
-function branchLedgers(branch) {
+function branchLedgers(branch, { withUnparseable = false } = {}) {
   const slug = slugifyBranch(branch);
   let dir;
   let names = [];
   try { dir = resolveStateDir(); names = fs.readdirSync(dir).sort(); } catch (e) {
+    if (withUnparseable && e.code === 'ENOENT') return [];
     process.stderr.write(`branchLedgers: state dir unreadable, plan-mismatch guard skipped: ${e.message}\n`);
     return [];
   }
   …
     try { data = JSON.parse(fs.readFileSync(fullPath, 'utf8')); } catch (e) {
+      if (withUnparseable) { out.push({ fullPath, flags: null, finished: false, unparseable: true }); continue; }
       process.stderr.write(`branchLedgers: ledger unreadable, skipped (${name}): ${e.message}\n`);
       continue;
     }
```

Also add one doc-comment line under the existing `branchLedgers` comment: ` * withUnparseable (R64, plan mode only): an unparseable file is returned with unparseable: true, and a missing state dir is no ledgers.`

Edit 2 — insert after the closing `}` of `checkPlanMismatch` (anchor: the line `  return { error: null, finishedOtherPlan };`, unique, then its `}`), before the `// ----` line that precedes `// verify-side-effect subcommand (R-b3, issue #478 — F-ship-step-status-integrity-guard-8)`:

```js
/**
 * R64 (owner Q22a; ruling w0-plan-1): plan mode never prunes an unfinished ledger of the branch.
 * Runs after checkPlanMismatch. A ledger is open when it is unfinished or cannot be parsed.
 * Returns { adopt: <path> } for the single open ledger that is plan mode's own (no planFile key,
 * planModeBlocked true) or of the same plan; { error } for any other open set; {} when none is open.
 */
function planModeLedgerCheck(branch, planFile) {
  const open = branchLedgers(branch, { withUnparseable: true }).filter(l => l.unparseable || !l.finished);
  if (open.length === 0) return {};
  const ownOrSame = (l) => !l.unparseable && !!l.flags && ('planFile' in l.flags
    ? (planFile === null ? l.flags.planFile == null : samePlanPath(planFile, l.flags.planFile))
    : l.flags.planModeBlocked === true);
  if (open.length === 1 && ownOrSame(open[0])) return { adopt: open[0].fullPath };
  const why = (l) => (l.unparseable ? 'cannot be parsed'
    : !l.flags || !('planFile' in l.flags) ? 'records no plan'
      : `plan ${l.flags.planFile || '(none recorded)'}`);
  return {
    error: {
      id: 'resumePlanMismatch',
      message:
        'ship-sdlc will not discard an unfinished run in plan mode. ' +
        `Open ship ledgers on this branch: ${open.map(l => `${l.fullPath} (${why(l)})`).join(', ')}. ` +
        `Fix: continue the run with --resume, or discard it yourself with ship's own verbs: node "${STATE_SHIP_SCRIPT}" skip --step <name> --reason <text> for each leftover step, then node "${STATE_SHIP_SCRIPT}" cleanup-pipeline; a ledger file that cannot be parsed can only be removed by hand. ` +
        'Ship never discards the earlier ledger itself.',
    },
  };
}
```

Edit 3 — the plan-mode block (anchor: `    const { error: planModeError } = checkPlanMismatch(gitState.currentBranch, cli.planFile ? path.resolve(cli.planFile) : null, { explicitResume: cli.resume });` through `    const stateShipPath = path.join(__dirname, '..', 'state', 'ship.js');`):

```diff
-    const { error: planModeError } = checkPlanMismatch(gitState.currentBranch, cli.planFile ? path.resolve(cli.planFile) : null, { explicitResume: cli.resume });
+    const planModePlan = cli.planFile ? path.resolve(cli.planFile) : null;
+    const { error: planModeError } = checkPlanMismatch(gitState.currentBranch, planModePlan, { explicitResume: cli.resume });
     if (planModeError) {
       errors.push(planModeError);
       writeFatalErrors(errors);
       writeOutput({ errors, warnings }, 'ship-prepare', 1);
       return;
     }
+    // R64 (Q22a): adopt plan mode's own ledger or one of the same plan; stop on any other open ledger.
+    const planModeCheck = planModeLedgerCheck(gitState.currentBranch, planModePlan);
+    if (planModeCheck.error) {
+      errors.push(planModeCheck.error);
+      writeFatalErrors(errors);
+      writeOutput({ errors, warnings }, 'ship-prepare', 1);
+      return;
+    }
+    if (planModeCheck.adopt) {
+      writeOutput({ flags: { ...flags, planModeBlocked: true }, stateFile: planModeCheck.adopt, prunedOrphans: [], planModeBlocked: true }, 'ship-prepare', 0);
+      return;
+    }
     const stateShipPath = path.join(__dirname, '..', 'state', 'ship.js');
```

Decision table (R64), for the reviewer:

| Open ledgers of the branch | `--plan` | Result |
|---|---|---|
| none (missing dir, or only finished) | any | init as today (finished ones pruned) |
| one, no `planFile` key, `planModeBlocked: true` | any | adopt |
| one, `planFile` equal to `--plan` (or no `--plan` and `planFile: null`) | any | adopt |
| one, `planFile` different / string without `--plan` | any | `checkPlanMismatch` refusal (unchanged message) |
| one, no `planFile` key, no `planModeBlocked: true` | any | stop, `(records no plan)` |
| one unparseable file | any | stop, `(cannot be parsed)` |
| two or more | any | stop, every one named |

**Test proof:** Impact grep (whole repository, tests included): `grep -rn "branchLedgers\|checkPlanMismatch\|plan-mode-blocked\|planModeBlocked" --include=*.js --include=*.yaml --include=*.md plugins tests` → hits in `skill/ship.js`, `ship-sdlc/SKILL.md` (Step 0 invocation, unchanged), `tests/promptfoo/datasets/ship-prepare-exec.yaml` and `tests/promptfoo/assertions/ship-plan-mode-*.js`; the tests they hit run in Task 2 (V1, V3) and V4. No mutation proof. No environment scrub (no database, no ports). No wait beyond `spawnSync` returning when the child exits.

### Task 2: ship-prepare cases — plan-mode adoption and stops (W8.34)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — two `script_env` edits, one rewritten case, five new cases.

**Notes:** Answers-2 item 6 (judge A2). The seed fixture and every assertion script stay unchanged. `-e` programs must contain no whitespace (the provider splits `script_args` on spaces); use `"\x20"` inside strings, as the two `ship-prepare (R64)` cases do. Locate each case by its description with `grep -n`. The acceptance list is the last block of this task (after the case table and Test proof).

**Contract:**
- shape (code): YAML cases with `description`, `vars.script_path` (`"-e"`), `vars.script_args` (one whitespace-free program), `vars.script_cwd` (`"{{project_root}}"`), `vars.project_root`, `assert` (`javascript`; R1 also keeps `file://assertions/ship-plan-mode-idempotent.js`). Each program prints ONE JSON line `{status, out, stderr, unchanged, files, …}` where `out` is the prepare JSON read from the path ship.js prints on stdout, `unchanged` compares the seeded file's bytes before and after, and `files` lists `ship-*` files in the state dir.
- names / behaviour (description → seed → run → assertions):

| Id | Description | Fixture, state dir | Seed | Run (args to ship.js) | Assertions |
|---|---|---|---|---|---|
| R1 | `ship-prepare (R64): --plan-mode-blocked twice adopts its own ledger — same stateFile, bytes unchanged, one file` | `project-ship-plan-mode-blocked`; env `SDLC_STATE_DIR_OVERRIDE=<cwd>/.sdlc/execution-empty` for both runs | none | `--plan-mode-blocked --bump patch --has-plan`, twice | both exit 0; 2nd `stateFile` === 1st; file bytes after run 2 === after run 1; printed `stateFile` (2nd) so `ship-plan-mode-idempotent.js` sees exactly 1 `ship-feat-test-plan-mode-*.json` |
| R2 | `ship-prepare (R64): --plan-mode-blocked adopts an unfinished ledger of the same plan and leaves it unchanged` | `project-sdlc-gitignore-inner`; `<cwd>/.sdlc/execution` (no override; mirror the R64 cases) | `plan-a.md`; ledger `ship-<slug>-20261027T120000Z.json` with `flags:{planFile:<abs plan-a.md>,openspecContext:null,sources:{}}`, steps execute/commit `pending` | `--plan-mode-blocked --has-plan --plan <abs plan-a.md>` | exit 0; `out.stateFile` === seeded path; `out.planModeBlocked === true`; `out.prunedOrphans` is `[]`; `unchanged`; `files.length === 1` |
| R3 | `ship-prepare (R64): --plan-mode-blocked stops on an unfinished ledger that records no plan and leaves it unchanged` | `project-ship-plan-mode-blocked`; env `SDLC_STATE_DIR_OVERRIDE=<cwd>/.sdlc/execution` | the fixture's own seed (no extra seed) | `--plan-mode-blocked --bump patch --has-plan` | exit 1; `out.errors` has `resumePlanMismatch` whose message contains `ship-feat-test-plan-mode-20240101T000000Z.json (records no plan)` and `--resume`; no `out.planModeBlocked`; `unchanged`; `files.length === 1`; `stderr` contains `will not discard an unfinished run in plan mode` |
| R4 | `ship-prepare (R64): --plan-mode-blocked stops on a ledger file that cannot be parsed and leaves it unchanged` | `project-sdlc-gitignore-inner`; `<cwd>/.sdlc/execution` | ledger path as R2 with content `{not-json` | `--plan-mode-blocked --has-plan` | exit 1; `resumePlanMismatch` message contains `(cannot be parsed)` and `removed by hand`; `unchanged`; `files.length === 1` |
| R5 | `ship-prepare (R64): --plan-mode-blocked stops on two unfinished plan-mode ledgers and names both` | `project-sdlc-gitignore-inner`; `<cwd>/.sdlc/execution` | two ledgers `…-20261027T120000Z.json` and `…-20261027T130000Z.json`, each `flags:{planModeBlocked:true}`, steps execute/commit `pending` | `--plan-mode-blocked --has-plan` | exit 1; message contains both file names; both `unchanged`; `files.length === 2` |
| R6 | `ship-prepare (R64): --plan-mode-blocked replaces a finished ledger by init as before` | `project-sdlc-gitignore-inner`; `<cwd>/.sdlc/execution` | ledger path as R2, `flags:{planModeBlocked:true}`, steps execute/commit `completed` | `--plan-mode-blocked --has-plan` | exit 0; `out.stateFile` !== seeded path; seeded file gone; `files.length === 1` |

- mirror: `ship-prepare (R64): --plan-mode-blocked with a different plan on an unfinished ledger is refused and the ledger is unchanged` (the `-e` program shape, `{{repo_root}}` script path, branch from `git branch --show-current`, slug `br.replace(/[^a-zA-Z0-9-]/g,"-")`).
- decisions: KD-2; Deviations rows 1, 2, 8.
- sync: ship spec R64 Acceptance line (D1) names R1–R6 by their descriptions (prefix match).

**Test proof:** Impact grep: `grep -rn "project-ship-plan-mode-blocked\|ship-plan-mode-" tests` → only `ship-prepare-exec.yaml` and the four assertion scripts (unchanged). Targeted runs: V3 then V1 then V4, each once (no rerun loop). No mutation proof. No environment scrub. Waits: each `-e` program's `spawnSync` returns when ship.js exits; no timer.

**Acceptance criteria:**
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml` → `235` after this task (230 at 533ab55).
- [ ] The two cases `ship-prepare: --plan-mode-blocked --bump patch writes ship state file with resolved flags (#400)` and `ship-prepare: --plan-mode-blocked --steps csv → state file flags.steps preserved (#400)` change only `script_env` to `'{"SDLC_STATE_DIR_OVERRIDE": "{{project_root}}/.sdlc/execution-empty"}'`.
- [ ] The case `ship-prepare: --plan-mode-blocked is idempotent — prune-on-write, only one state file per branch (#400)` is replaced in place by case R1; the cases `ship-prepare: state file from plan-mode-blocked is found by resume detection on next invocation (#400)`, `ship-prepare: --gc wins when combined with --plan-mode-blocked …` and both `ship-prepare (R64): …` cases are byte-identical.
- [ ] Cases R2–R6 are inserted directly after the case `ship-prepare (R64): --plan-mode-blocked without --plan on an unfinished planned ledger is refused and the ledger is unchanged`, in order, before `- description: "ship-prepare: --gc orphan sweep includes commit bucket …"`.
- [ ] V3 (`plan-mode-blocked`) → 12 passed, 0 failed; V1 (`ship-prepare`) → 109 passed after this task (104 + 5); V4 → 108 passed.

### Task 3: execute.js — `--tasks` and `--from-wave` selection (#9208)

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` — parse both flags; resolve the selection (CLI or recorded state); build the waves for the selected tasks; emit `flags.selection`, `flags.sources.selection` and `resume.selection`.

**Notes:** Implements execute A8, A9, R43 and the P1/P7 fields (D2); KD-5, KD-6. `buildWaves` is called unchanged and only its input changes, so the wave algorithm stays the single source of wave shape (Must-not-touch). Complex although it is one file: three resolution paths (CLI, recorded state, wave filter) interact with resume and the completeness gate, and a slip drops tasks silently.

**Acceptance criteria:**
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/execute.js` exits 0.
- [ ] `grep -c "'--tasks', '--from-wave'" plugins/sdlc-utilities/scripts/skill/execute.js` → `1` (in `VALUE_FLAGS`).
- [ ] `grep -cE 'function (parseSelection|resolveSelection|selectTasks)\(' …execute.js` → `3`; all three are exported.
- [ ] Task 5's cases pass (run there); V2 existing 53 cases stay green.

**Contract:**
- shape (code):
  - `VALUE_FLAGS` gains `'--tasks', '--from-wave'` (appended, in that order); `parseArgs` returns `tasks` (raw string or `null`) and `fromWave` (raw string or `null`).
  - `parseSelection(cli, errors) → { tasks: number[]|null, fromWave: number|null } | null` — `null` when neither flag; pushes `invalidFlag` and returns `null` on a bad value or both flags.
  - `resolveSelection(requested, resumeFound, resumeRecorded, cli, stateFile, errors) → { selection: {tasks, fromWave}|null, source: 'cli'|'state'|null }` — `requested` is `parseSelection`'s result, `resumeRecorded` is `stateData.selection` (`undefined` → `null`), `stateFile` is `resume.stateFile` (for the message); with `cli.resume && resumeFound`: the recorded selection wins (no CLI → recorded, source `state` when non-null; equal CLI → recorded; different CLI → `invalidFlag`, nothing written).
  - `selectTasks(parsedTasks, selection, buildAll, warnings, errors) → { waves, taskIds, floorTasks }` — `--tasks`: unknown ids → `invalidFlag`; build from copies of the selected tasks whose `dependsOn` lost the outside ids; `--from-wave`: `buildAll()` then keep `w.n >= n`; `n` past the last wave → `invalidFlag`. In both modes `taskIds` = the ids of the kept waves (ascending), `floorTasks` = those tasks (they feed `classificationFloor`), and the outside-dependency warning is emitted here, once per (task, dependency) pair where the dependency is not in `taskIds`.
  - Output: `flags.selection = selection ? { tasks, fromWave, taskIds } : null`; `flags.sources.selection = source`; `resume.selection = <recorded or null>` (from `stateData.selection`, `undefined` → `null`); `classificationFloor` lists the selected tasks only; `plan` (P2) keeps the whole plan.
- error and warning taxonomy (all errors `{ id: 'invalidFlag', flag, value, message }`):

| Condition | flag | message |
|---|---|---|
| `--tasks` not `^\d+(,\d+)*$` | `--tasks` | ``--tasks must be a comma-separated list of task numbers, got "<v>".`` |
| `--tasks` id not in the plan | `--tasks` | ``--tasks names task(s) the plan does not have: <ids, comma-separated>.`` |
| `--from-wave` not `^\d+$` or `< 1` | `--from-wave` | ``--from-wave must be an integer >= 1, got "<v>".`` |
| `--from-wave n` > wave count `k` | `--from-wave` | ``--from-wave <n> is past the last wave (<k> waves for this quality tier, guardrails and dispatch budget).`` |
| both flags | `--tasks` | ``--tasks and --from-wave cannot be combined; pass one of them.`` |
| resume, CLI ≠ recorded | the given flag | ``This run's selection <cli JSON> differs from the selection recorded in <stateFile> (<recorded JSON>). Fix: resume without --tasks/--from-wave to keep the recorded selection, or start a new run without --resume.`` |
| warning: dependency outside the selection | — | ``Task <t> depends on Task <d>, which is outside the selection; Task <t> runs as if Task <d> is done.`` |

- names: `parseSelection`, `resolveSelection`, `selectTasks`, `flags.selection`, `flags.sources.selection`, `resume.selection`.
- mirror: the `--rebase`/`--wave-timeout` `invalidFlag` errors in `resolveFlags`; `lookupResume`'s returned shape.
- decisions: KD-5, KD-6; normalized `tasks` = unique ids ascending; equality = `JSON.stringify({tasks, fromWave})` of both sides.
- sync: execute spec A8, A9, R43, P1, P7 (D2); Tasks 4, 5, 9.
- example: plan of fixture `project-execute-prepare` (waves `1,4` and `2,3`; Task 3 depends on Task 1):

| CLI | `waves` (n: taskIds) | `flags.selection` | warnings |
|---|---|---|---|
| (none) | `1: 1,4`; `2: 2,3` | `null` | — |
| `--tasks 2,3` | `1: 2,3` | `{tasks:[2,3], fromWave:null, taskIds:[2,3]}` | Task 3 → Task 1 |
| `--from-wave 2` | `2: 2,3` | `{tasks:null, fromWave:2, taskIds:[2,3]}` | Task 3 → Task 1 |

**Test proof:** Impact grep: `grep -rn "skill/execute.js\|VALUE_FLAGS\|buildWaves\|classificationFloor" --include=*.js --include=*.yaml --include=*.md plugins tests` → `skill/execute.js`, execute SKILL.md, `classifying-and-waving-tasks.md`, `tests/promptfoo/datasets/execute-prepare-exec.yaml`, `tests/promptfoo/scripts/check-worker-routing-table.js` (requires `routeWave`/`WORKER_ROUTING`, untouched). Tests hit: V2 (Task 5). No mutation proof. No environment scrub. No wait.

### Task 4: state/execute.js — `init --selection`; state-format.md documents `selection` (#9208)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `parseArgs` reads `--selection <json>`; `cmdInit` records `selection`.
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — one table row after `totalTasks`.

**Notes:** Implements execute R43's state clause (D2). `state/execute.js` stays a pure recorder: it checks that the value parses to an object or `null`, nothing more (mirror `--planned-task-ids`).

**Acceptance criteria:**
- [ ] `node --check plugins/sdlc-utilities/scripts/state/execute.js` exits 0.
- [ ] `init … --selection '{"tasks":[2,3],"fromWave":null,"taskIds":[2,3]}'` writes `"selection": {…}` verbatim; `init` without `--selection` writes `"selection": null`; `--selection 'x'` or `--selection '[1]'` exits 2 with `Error: --selection must be a JSON object or null: …` and writes no state file.
- [ ] The usage comment's `init` line gains `[--selection <json>]`.
- [ ] V5 → 57 passed (unchanged); Task 5's (sel11) passes.

**Contract:**
- shape (code): in `parseArgs`, beside `--planned-task-ids`:

```diff
     } else if (a === '--planned-task-ids' && args[i + 1]) {
       result.plannedTaskIds = args[++i];
+    } else if (a === '--selection' && args[i + 1]) {
+      result.selection = args[++i];
```

  In `cmdInit`, after the `plannedTaskIds` parse block: parse `opts.selection` when set (`JSON.parse`; reject unless the result is `null` or a non-array object; on failure `process.stderr.write(\`Error: --selection must be a JSON object or null: ${e.message}\n\`); process.exit(2);`), else `null`; the `data` object gains `selection` directly after `plannedTaskIds`:

```diff
     plannedTaskIds: plannedTaskIds,
+    selection: selection,
     waves: [],
```

  state-format.md row, inserted after the `| \`totalTasks\` | number | …` row:

  ``| `selection` | object \| null | The run's task or wave selection (execute R43): `{ tasks, fromWave, taskIds }` as the prepare script emits it in `flags.selection`, recorded by `init --selection`; `null` when the run has none. On resume the recorded selection wins over the CLI. |``
- names: `--selection`, `selection`.
- mirror: `--planned-task-ids` (parse) and `plannedTaskIds` (record).
- decisions: KD-5.
- sync: execute spec R43 (D2); SKILL.md init call (Task 9).

**Test proof:** Impact grep: `grep -rn "plannedTaskIds\|state/execute.js init\|cmdInit" --include=*.js --include=*.yaml --include=*.md plugins tests` → `state/execute.js`, execute SKILL.md, `state-format.md`, `execute-plan-sdlc-overflow-exec.yaml` and the liveness/context-producer datasets (all in V5). Targeted: V5 once. No mutation proof. No environment scrub. No wait.

### Task 5: execute-prepare cases — selection, errors, resume, state init (#9208)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3, Task 4
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Test: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — 12 new cases under a new banner `# Task and wave selection (R43)` at the end of the file.

**Notes:** No new fixture (answers-2 item 9): resume cases seed `selection` into the existing state file of `project-execute-prepare-resume-planpath` with an `-e` program before spawning `skill/execute.js`. Plain cases use `script_path: "repo://plugins/sdlc-utilities/scripts/skill/execute.js"` like case (a).

**Acceptance criteria:**
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/execute-prepare-exec.yaml` → `65`.
- [ ] V2 → 65 passed, 0 failed.

**Contract:**
- shape (code): YAML cases; plain cases assert one `javascript` expression over `JSON.parse(output)`; `-e` cases print one JSON line `{status, out, before, after}`.
- names / behaviour (fixture `P` = `project-execute-prepare`, `R` = `project-execute-prepare-resume-planpath`; plain args always end with `--project-root {{project_root}}`):

| Id | Description (prefix `execute-prepare: `) | Fixture | Args | Assertions |
|---|---|---|---|---|
| sel1 | `(sel1) --tasks 2,3 builds waves from the selected tasks only and warns about the outside dependency` | P | `--plan plan.md --tasks 2,3` | `errors` empty; `waves` = one wave `n:1`, taskIds `2,3`; `flags.selection` deep-equals `{tasks:[2,3],fromWave:null,taskIds:[2,3]}`; `flags.sources.selection==='cli'`; a warning contains `Task 3 depends on Task 1`; `plan.tasks.length===4`; `classificationFloor` ids `2,3` |
| sel2 | `(sel2) --tasks ignores duplicates and sorts the ids` | P | `--plan plan.md --tasks 3,2,3` | `flags.selection.tasks` = `[2,3]` |
| sel3 | `(sel3) --tasks with an id the plan does not have reports invalidFlag` | P | `--plan plan.md --tasks 2,9` | an error `invalidFlag`, `flag==='--tasks'`, message contains `9` |
| sel4 | `(sel4) --tasks with a T prefix reports invalidFlag` | P | `--plan plan.md --tasks T3` | `invalidFlag` on `--tasks` |
| sel5 | `(sel5) --from-wave 2 keeps wave 2 with its number and warns about the outside dependency` | P | `--plan plan.md --from-wave 2` | `waves.length===1`, `waves[0].n===2`, taskIds `2,3`; selection `{tasks:null,fromWave:2,taskIds:[2,3]}`; warning `Task 3 depends on Task 1` |
| sel6 | `(sel6) --from-wave past the last wave reports invalidFlag` | P | `--plan plan.md --from-wave 3` | `invalidFlag` on `--from-wave`, message contains `past the last wave` |
| sel7 | `(sel7) --from-wave 0 reports invalidFlag` | P | `--plan plan.md --from-wave 0` | `invalidFlag` on `--from-wave` |
| sel8 | `(sel8) --tasks with --from-wave reports invalidFlag` | P | `--plan plan.md --tasks 2 --from-wave 1` | an `invalidFlag` message contains `cannot be combined` |
| sel9 | `(sel9) --auto --resume uses the selection recorded in the state file` | R, `-e` | seed `selection:{tasks:[2,3],fromWave:null,taskIds:[2,3]}` into `.sdlc/execution/execute-feat-resume-20260101T000000Z.json`, then `--auto --resume` | status 0; selection tasks `[2,3]`; `sources.selection==='state'`; `resume.selection.tasks` `[2,3]`; waves taskIds `2,3` |
| sel10 | `(sel10) --resume with a different --tasks reports invalidFlag and leaves the state file unchanged` | R, `-e` | same seed, then `--resume --tasks 4` | status 1; `invalidFlag` message contains `differs from the selection recorded`; `before===after` |
| sel11 | `(sel11) state init records --selection, records null without it, and rejects a non-object` | P, `-e` | three `state/execute.js init --branch main --quality balanced --total-tasks 2 --planned-task-ids ["2","3"]` runs (one with `--selection {"tasks":[2,3],"fromWave":null,"taskIds":[2,3]}`, one without, one with `--selection [1]`), reading the written file after each and removing it before the next | first file `selection.tasks` `[2,3]`; second `selection===null`; third exits 2 and writes no file |
| sel12 | `(sel12) a run without selection flags emits a null selection and a null recorded selection` | R | `--plan plan.md` | `flags.selection===null`; `flags.sources.selection===null`; `resume.selection===null`; `waves.map(w=>w.taskIds.join()).join(';')==='1,4;2,3'` (R's plan, written by its `setup.sh`, has the same four tasks, files and dependency as P's `plan.md`: Task 1 creates `src/a.js` + `tests/a.test.js`, Task 2 modifies `src/a.js`, Task 3 depends on Task 1, Task 4 creates `src/d.js`; read by the planner) |

- mirror: case `(c)` (R fixture), case `(a)` (P fixture), case `(j4)` (`invalidFlag` assertion), the `-e` shape of the `ship-prepare (R64)` cases.
- decisions: KD-5, KD-6.
- sync: execute spec R43 Acceptance (D2) matches the `(sel` prefix.

**Test proof:** Impact grep: `grep -rn "project-execute-prepare\b\|project-execute-prepare-resume-planpath" tests` → only `execute-prepare-exec.yaml` (fixtures unchanged). Targeted: V2 once. Before writing sel12's waves assertion the worker confirms the R fixture's plan builds `1,4;2,3` (case `(a)`'s plan text is the same four tasks); a different value is a STOP. No mutation proof. No environment scrub. Waits: `spawnSync` returns on child exit.

### Task 6: ship.js — forward `--tasks` and `--from-wave` to the execute step only (#9208)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `parseArgs`, `mergeFlags` pass-through, `computeSteps` execute `args`, `ensureLedger` refresh.

**Notes:** Implements ship A13, A14, R76 (D3); KD-4. Depends on Task 1 only because both edit `ship.js` (order inside the commit). The raw value is forwarded unquoted, like `--quality`; execute validates it.

**Acceptance criteria:**
- [ ] `node --check …ship.js` exits 0.
- [ ] `--has-plan --quality balanced --tasks 3,4 --from-wave 2` gives execute `args === '--quality balanced --tasks 3,4 --from-wave 2'` and no other step's `args` contains `--tasks` or `--from-wave`.
- [ ] `--tasks` as the last argument, or followed by `--auto`, adds the error `--tasks requires a value.` (same for `--from-wave`).
- [ ] Without the flags, `flags` has no `tasks`/`fromWave` key and every step's `args` is unchanged (the W5.2 case `execute step args carry only --plan, --auto and --quality` stays green).
- [ ] Task 7's cases pass.

**Contract:**
- shape (code): four edits, bottom-up.

```diff
 // parseArgs: declarations beside `let planFile = null;`
+  let tasks = null;     // R76: raw, forwarded to execute-plan-sdlc
+  let fromWave = null;  // R76: raw, forwarded to execute-plan-sdlc
 …
+    } else if (a === '--tasks' || a === '--from-wave') {
+      // R76: ship checks only that a value follows; execute-plan-sdlc validates it (execute R43).
+      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) errors.push(`${a} requires a value.`);
+      else if (a === '--tasks') tasks = args[++i];
+      else fromWave = args[++i];
     } else if (a === '--hook-active-pipeline') {
 …
-  return { hasPlan, …, planModeBlocked, planFile, errors };
+  return { hasPlan, …, planModeBlocked, planFile, tasks, fromWave, errors };
```

```diff
 // mergeFlags: after `merged.planModeBlocked  = cli.planModeBlocked === true;`
+  // R76: present only when given (mirrors quality); never from config.
+  if (cli.tasks)    merged.tasks    = cli.tasks;
+  if (cli.fromWave) merged.fromWave = cli.fromWave;
```

```diff
 // computeSteps, execute step args, after the --quality entry:
         flags.quality ? `--quality ${flags.quality}` : '',
+        // R76: execute selection, raw; only the execute step gets it.
+        flags.tasks ? `--tasks ${flags.tasks}` : '',
+        flags.fromWave ? `--from-wave ${flags.fromWave}` : '',
       ].filter(Boolean).join(' '),
```

```diff
 // ensureLedger, after the FROZEN_FLAG_KEYS loop:
+  // R76 (owner Q22b): dispatch_execute reads the ledger's flags, so the selection lives there,
+  // but every run replaces it with its own CLI values; --resume never restores it.
+  for (const key of ['tasks', 'fromWave']) {
+    if (flags[key]) ledger.flags[key] = flags[key]; else delete ledger.flags[key];
+  }
```

- names: `tasks`, `fromWave`, `flags.tasks`, `flags.fromWave`.
- mirror: `--rebase` parse; `merged.quality` "intentionally absent" pattern; the `--quality` args entry.
- decisions: KD-4.
- sync: ship spec R76 (D3); execute A8/A9 (D2); Task 7; ship SKILL.md (Task 10).

**Test proof:** Impact grep: `grep -rn "computeSteps\|ensureLedger\|mergeFlags\|FROZEN_FLAG_KEYS" --include=*.js --include=*.yaml plugins tests` → `skill/ship.js`, `tests/promptfoo/scripts/run-ship-stepper.js` (drives ship.js; unchanged), `ship-prepare-exec.yaml`. Targeted: Task 7's V1, then V4 once. No mutation proof. No environment scrub. No wait.

### Task 7: ship-prepare cases — selection pass-through (#9208)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 2
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — three new cases after the case `ship-prepare: execute step args carry only --plan, --auto and --quality (W5.2)`.

**Notes:** Depends on Task 2 only because both edit this dataset. S3 seeds a ledger with `-e` (mirror the R64 cases) because only a resumed ledger shows that the flag is not restored.

**Acceptance criteria:**
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml` → `238`.
- [ ] V1 → 112 passed after this task (109 + 3); V4 → 108.

**Contract:**
- shape (code): YAML cases.

| Id | Description | Fixture | Run | Assertions |
|---|---|---|---|---|
| S1 | `ship-prepare (R76): --tasks and --from-wave are forwarded raw to the execute step args only` | `project-sdlc-gitignore-inner` | `--has-plan --quality balanced --tasks 3,4 --from-wave 2` | execute `args === '--quality balanced --tasks 3,4 --from-wave 2'`; every other step's `args` (when a string) contains neither `--tasks` nor `--from-wave` |
| S2 | `ship-prepare (R76): --tasks without a value is a prepare error` | `project-sdlc-gitignore-inner` | `--has-plan --tasks` | output (`icontains`) `--tasks requires a value.` |
| S3 | `ship-prepare (R76): --resume does not restore --tasks from the ledger` | `project-sdlc-gitignore-inner`, `-e` | seed `plan-a.md` and an unfinished ledger with `flags:{planFile:<abs plan-a.md>,openspecContext:null,sources:{},steps:["execute","commit"],tasks:"3,4"}`, steps execute/commit `pending`; run `--resume --has-plan --steps execute,commit` | status 0; execute step `args` does not contain `--tasks`; the ledger file's `flags` has no `tasks` key afterwards |

- mirror: `ship-prepare: --quality balanced is forwarded to execute step args`; the `-e` shape of the R64 cases.
- decisions: KD-4.
- sync: ship spec R76 Acceptance (D3) matches the `ship-prepare (R76)` prefix.

**Test proof:** Impact grep: `grep -rn "requires a value" plugins/sdlc-utilities/scripts/skill/ship.js tests/promptfoo/datasets` → the new parse branch and S2 only. Targeted: V1 once, V4 once. No mutation proof. No environment scrub. Waits: `spawnSync` returns on child exit.

### Task 8: docs pages — `--tasks` and `--from-wave` rows (#9208)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3, Task 6
**Verify:** manual
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `docs/skills/execute-plan-sdlc.md` — two `## Flags` rows after the `--plan <path>` row; one paragraph at the end of `## State Persistence and Resume`.
- Modify: `docs/skills/ship-sdlc.md` — two `## Flags` rows after the `--plan <path>` row; the sentence "It passes execute-plan-sdlc only ..." after the configuration table.

**Notes:** User-facing text only; no issue numbers.

**Acceptance criteria:**
- [ ] `grep -c '^| `--tasks <ids>`' docs/skills/execute-plan-sdlc.md docs/skills/ship-sdlc.md` → `1` each; same for `^| \`--from-wave <n>\``.
- [ ] V6 consistency check passes.
- [ ] `grep -c 'plus `--tasks` and `--from-wave` when given' docs/skills/ship-sdlc.md` → `1`.

**Contract:**
- shape (docs): rows (3 columns: flag, description, default):
  - execute `--tasks <ids>`: ``Run only these plan tasks: comma-separated task numbers from the `### Task N:` headings (for example `--tasks 3,4`). The waves are built from them alone; a selected task whose dependency is not selected still runs, with a warning. Cannot be combined with `--from-wave`. On `--resume` the selection recorded at the start of the run is used; a different one stops the run.`` | ``Every task``
  - execute `--from-wave <n>`: ``Start at wave `n` of the waves the run prints for its quality tier and config; earlier waves are skipped and wave numbers stay the same. Cannot be combined with `--tasks`.`` | ``Every wave``
  - ship `--tasks <ids>`: ``Forwarded unchanged to execute-plan-sdlc as `--tasks <ids>` (run only these plan tasks). Not restored by `--resume`; execute-plan-sdlc keeps its own recorded selection.`` | ``Unset``
  - ship `--from-wave <n>`: ``Forwarded unchanged to execute-plan-sdlc as `--from-wave <n>` (start at wave `n`). Not restored by `--resume`.`` | ``Unset``
  - ship page, exactly: old ``It passes execute-plan-sdlc only `--plan`, `--auto` and `--quality`.`` → new ``It passes execute-plan-sdlc only `--plan`, `--auto` and `--quality`, plus `--tasks` and `--from-wave` when given.``
  - execute State Persistence paragraph: ``**Selection:** a run started with `--tasks` or `--from-wave` records the selection in the state file (`selection`), and only the selected tasks count toward the completeness check. A resume reuses the recorded selection.``
- names: the four rows; the `**Selection:**` paragraph.
- mirror: the `--plan <path>` rows of both pages.
- decisions: KD-5.
- sync: execute A8, A9, R43; ship A13, A14, R76; Tasks 9, 10.

**Test proof:** Impact grep: `grep -rn -- "--from-wave" docs plugins site` → the two pages, both SKILL.md files (Tasks 9, 10), specs (D2, D3), `skill/execute.js`, `skill/ship.js`. Check: V6 once. No mutation proof. No environment scrub. No wait.

### Task 9: execute-plan-sdlc SKILL.md — read `flags.selection`; init records it (#9208)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3, Task 4
**Verify:** lint
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — frontmatter `description` and `argument-hint`; one Step 0 paragraph; the interactive resume "yes" branch; the state `init` call and its explanation.

**Notes:** Cites spec ids ("implements A8, A9, R43"). Every decision reads `flags.selection` / `resume.selection` from the prepare output (`flag-coherence-cross-skill`); nothing re-parses `$ARGUMENTS`.

**Acceptance criteria:**
- [ ] Both frontmatter lines gain `[--tasks <ids>] [--from-wave <n>]` directly after `[--plan <path>]`.
- [ ] `grep -c 'implements A8, A9, R43' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` → `1`; `grep -c -- "--selection '" …SKILL.md` → `1`.
- [ ] V6 consistency check passes.

**Contract:**
- shape (code): four edits.
  1. Frontmatter: in `description`, `[--plan <path>] [--wave-timeout <s>]` → `[--plan <path>] [--tasks <ids>] [--from-wave <n>] [--wave-timeout <s>]`; in `argument-hint`, `[--plan <path>] [--wave-timeout <seconds>]` → `[--plan <path>] [--tasks <ids>] [--from-wave <n>] [--wave-timeout <seconds>]`.
  2. After the paragraph starting `**Parse \`--commit-waves\` (R35):**`, insert:
     ``**Parse `--tasks <ids>` / `--from-wave <n>` (implements A8, A9, R43):** Read `flags.selection`. When it is `null`, nothing changes. When it is set, `waves` and `classificationFloor` already hold only the selected tasks (`flags.selection.taskIds`): run only those, and print `Selection: tasks <taskIds, comma-separated> (from <flags.sources.selection>)` once. Print each `warnings[]` entry. Plan-size predicates (Step 2b's small-plan check and Step 5b's runner-mode check) keep counting `plan.tasks.length`; the Step 2b small-plan path runs only `flags.selection.taskIds`.``
  3. In the resume detection branch `If "yes", follow the resume flow above (steps 2-9).`, append: `` When `flags.selection` or `resume.selection` is non-null, first re-run the prepare command of Step 1 with `--resume` appended and use its output, so the recorded selection wins (R43).``
  4. The init call becomes:
     ``node "$STATE_SCRIPT" init --branch <branch> --quality <X> --total-tasks <N> --planned-task-ids '<json-array-of-planned-task-ids>' --plan-path "$PLAN_FILE" --plan-hash "<plan.hash>" [--selection '<flags.selection as JSON>']``
     and the sentence after it: ``Where `<json-array-of-planned-task-ids>` is a JSON array of task IDs as strings (e.g. `'["1","2","3"]'`): every task ID from the plan when `flags.selection` is `null`, else `flags.selection.taskIds`; `<N>` is that array's length. Pass `--selection` only when `flags.selection` is non-null, with its JSON verbatim (implements R43). This seeds `plannedTaskIds` in the state file so the `verify-completeness` gate (Step 5f) can cross-check all planned IDs against accounted task records.``
- names: `flags.selection`, `resume.selection`, `--selection`.
- mirror: the `**Parse \`--commit-waves\` (R35):**` paragraph.
- decisions: KD-5; Deviations rows 9, 10.
- sync: execute spec A8, A9, R43; Task 3 output fields; Task 4 `--selection`.

**Test proof:** Impact grep: `grep -rn "json-array-of-all-task-ids\|planned-task-ids" plugins docs tests` → execute SKILL.md (this task), `state/execute.js` usage comment, overflow dataset (state-level, V5). Checks: V6 once. No behavioural run (V10). No mutation proof. No environment scrub. No wait.

### Task 10: ship-sdlc SKILL.md — document the pass-through (#9208)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 6
**Verify:** lint
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — frontmatter `description` and `argument-hint`; the execute row of the pipeline table.

**Notes:** Cites spec ids ("implements A13, A14, R76").

**Acceptance criteria:**
- [ ] Both frontmatter lines gain `[--tasks <ids>] [--from-wave <n>]` directly after `[--plan <path>]`.
- [ ] `grep -c 'implements A13, A14, R76' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` → `1`.
- [ ] V6 passes.

**Contract:**
- shape (code): the execute table row, exactly:

```diff
-| 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` from `--quality` or, in interactive runs, the `execute_tier` answer | no |
+| 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` from `--quality` or, in interactive runs, the `execute_tier` answer, plus `--tasks <ids>` / `--from-wave <n>` when given (implements A13, A14, R76) | no |
```

- names: `--tasks <ids>`, `--from-wave <n>`.
- mirror: the same row's `--quality` clause.
- decisions: KD-4.
- sync: ship spec A13, A14, R76; Task 6.

**Test proof:** Impact grep: `grep -rn "argument-hint" plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md .claude/skills/validate-plugin-consistency/check-consistency.js` → the frontmatter and the consistency checker. Check: V6 once. No mutation proof. No environment scrub. No wait.

### Task 11: ship.js — `--rebase` defaults to `skip` (W8.35)

**Complexity:** Trivial
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — the default branch of the rebase merge and its two comments.

**Notes:** Implements ship A12, R75 (D4). Risk Medium: the default changes for every ship run that reaches version or pr (owner accepted). Config and CLI mapping unchanged; the rebase step is untouched.

**Acceptance criteria:**
- [ ] V8 matches.
- [ ] `grep -c "merged.rebase  = 'auto';" …ship.js` → `0`; `grep -c "Default is true → 'auto'" …ship.js` → `0`.

**Contract:**
- shape (code):

```diff
-  // rebase: CLI non-null string wins; otherwise map config boolean/string to
-  // 'auto' | 'skip' | 'prompt'; otherwise default (true → 'auto').
+  // rebase: CLI non-null string wins; otherwise map config boolean/string to
+  // 'auto' | 'skip' | 'prompt'; otherwise default 'skip' (R75, like execute).
 …
   } else {
-    // Default is true → 'auto'
-    merged.rebase  = 'auto';
-    sources.rebase = 'default';
+    // R75: no CLI flag and no config → skip (a rebase would rewrite pushed commits).
+    merged.rebase = 'skip'; sources.rebase = 'default';
   }
```

- names: `merged.rebase`, `sources.rebase`.
- mirror: `EXECUTE_DEFAULTS.rebase` (`skill/execute.js`).
- decisions: the item's declined variant ("auto only when nothing is pushed yet") stays declined.
- sync: ship spec A12, R75 (D4); Task 12 docs row; Task 13 cases.

**Test proof:** Impact grep: `grep -rn '"rebase": "auto"\|rebase.*auto' tests/promptfoo/datasets plugins/sdlc-utilities/scripts/skill/ship.js` → the BUILT_IN_DEFAULTS assertion (Task 13), the stepper's `rebase-emit` scenario (patches `auto` into its seed; unaffected), the W5.2 regex. Targeted: V1, V4 in Task 13. No mutation proof. No environment scrub. No wait.

### Task 12: ship docs page — `rebase` config row defaults to `false` (W8.35)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 8
**Verify:** manual
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — the `rebase` row of the configuration table.

**Notes:** Depends on Task 8 only because both edit this page.

**Acceptance criteria:**
- [ ] The row reads exactly as below; `grep -c '^| `rebase` |' docs/skills/ship-sdlc.md` → `1`.
- [ ] V6 passes.

**Contract:**
- shape (docs):

```diff
-| `rebase` | `true` \| `false` \| `"prompt"` | `true` | Rebase strategy before execution and versioning. |
+| `rebase` | `true` \| `false` \| `"prompt"` | `false` | Rebase strategy before execution and versioning. `true` rebases onto the default branch before version and pr. |
```

- names: the `rebase` row.
- mirror: the neighbouring `draft` row.
- decisions: none beyond R75.
- sync: ship spec R75.

**Test proof:** Impact grep: `grep -rn '| `rebase` |' docs` → this row only. Check: V6 once. No mutation proof. No environment scrub. No wait.

### Task 13: ship-prepare cases — rebase default and its mapping (W8.35)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 11, Task 7
**Verify:** tests
**Commit:** `feat(#9225): ship-sdlc - plan-mode adopt, execute selection, rebase skip` (the single ship commit)

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — one changed assertion; two new cases after the BUILT_IN_DEFAULTS case.

**Notes:** Depends on Task 7 only because both edit this dataset. The emitter side of "default → skipped" is the existing `ship-step: (q) review_gate below-threshold findings …` case (Deviations row 6).

**Acceptance criteria:**
- [ ] In the case `ship-prepare: BUILT_IN_DEFAULTS resolve to balanced steps (no version) when no config exists`, `value: '"rebase": "auto"'` becomes `value: '"rebase": "skip"'` (nothing else changes).
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/ship-prepare-exec.yaml` → `241`.
- [ ] V1 → 115 passed, 0 failed; V4 → 108; V3 → 12; V8 matches.

**Contract:**
- shape (code): YAML cases.

| Id | Description | Fixture | Run | Assertions |
|---|---|---|---|---|
| B1 | `ship-prepare (R75): config ship.rebase true resolves auto with source config` | `project-sdlc-gitignore-inner`, `-e` | write `.sdlc/local.json` = `{"ship":{"rebase":true}}`, then `ship.js --has-plan` | `out.flags.rebase==='auto'` and `out.flags.sources.rebase==='config'` |
| B2 | `ship-prepare (R75): --rebase auto resolves auto with source cli` | `project-sdlc-gitignore-inner` | `--has-plan --rebase auto` | `flags.rebase==='auto'` and `flags.sources.rebase==='cli'` |
| B3 | `ship-prepare (R75): the default rebase skip is written into the ledger the step emitter reads` | `project-sdlc-gitignore-inner`, `-e` | `ship.js --has-plan` (no `--rebase`, no config) | exit 0; `out.flags.sources.rebase==='default'`; `JSON.parse(fs.readFileSync(out.state_file)).flags.rebase==='skip'` (the prepare envelope's key is `state_file`, from `lib/stepper.js` `state_file: options.stateFile`) |

- mirror: the BUILT_IN_DEFAULTS case; `project-ship-reviewthreshold-low/.sdlc/local.json` (`{ "ship": { "reviewThreshold": "low" } }`) for the config shape.
- decisions: Deviations row 6.
- sync: ship spec R75 Acceptance (D4).

**Test proof:** Impact grep: `grep -rn '"rebase"' tests/promptfoo/fixtures-fs/*/.sdlc/local.json tests/promptfoo/fixtures-fs/*/setup.sh` → `setup-fully-configured` (`"rebase": "auto"`, explicit, unaffected) and the stepper seeds (`skip`, explicit). Targeted: V1, V3, V4 once each. No mutation proof. No environment scrub. Waits: `spawnSync` returns on child exit.

---

## Final Shape

- **Plan mode keeps unfinished runs.** Entering plan mode twice leaves one ledger, byte for byte. Plan mode adopts its own ledger or a ledger of the same plan. It stops, with the `resumePlanMismatch` id and nothing written, on any other unfinished ledger, an unreadable ledger file, or two open ledgers. Finished ledgers are still replaced. The normal path is unchanged.

- **Execute runs part of a plan on request.** `--tasks 3,4` builds waves from tasks 3 and 4 only. `--from-wave 2` drops wave 1 and keeps the numbers. A task whose dependency is outside the selection still runs, with a warning. The state file records the selection, and a resume reuses it.

- **Ship forwards the selection.** `--tasks` and `--from-wave` reach the execute step exactly as typed, and no other step. A ship `--resume` never brings them back from the ledger.

- **Ship no longer rebases by default.** Without `--rebase` and without config, the rebase step is skipped. `ship.rebase: true` or `--rebase auto` still rebases.

- **The specs say all of this first.** Four spec commits precede the code commit.

## Follow-ups

1. **New todo (W8.34 open point, not this wave):** on the normal path, R-implicit-resume's unparseable-ledger sentence (as narrowed by D1) still lets R-ship-init-prune delete a ledger file that cannot be parsed, against owner Q22a "never auto-discards". Fix shape: the normal path stops on an unparseable same-branch ledger the same way plan mode now does.
2. The ledger's non-frozen flags are not refreshed from the CLI on `--resume` (only `tasks`/`fromWave` are, by KD-4), while Q22b says "all other flags come from the CLI or config". Worth a check in the M9 wave 4 sweep.
3. `schemas/execute-state.schema.json` lacks `plannedTaskIds` and now `selection` while declaring `additionalProperties: false`; no test validates against it.

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

Review: two iterations. Iteration 1: five lanes plus three lenses (architecture, requirements, risk; sonnet, opposite of the opus author). Iteration 2 was a merged re-dispatch, because Task 3's Contract text changed. After iteration 2 every lane is `ok` with no blocking issue, and all three lenses are `Approved`.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 2 | 2 |
| Correctness | 0 | 0 | 1 | 3 |
| Coherence | 0 | 0 | 4 | 3 |

The WARNING is Deviations row 6: the W8.35 default → `progress.skipped` proof comes from two cases (prepare side and emitter side), not one new end-to-end case. It is raised to the controller in done-file m7/w0/plan/3. Fixed during review:

- the Task 1 `withUnparseable` count (iteration 1, requirements lens);
- G20 in the Task 3 Notes, the G6 classifications, and the G14 findings `flag-semantic-consistency-cross-skill` (KD-7), `workspace-mode-compatibility` (KD-8) and `failure-audience` (Step 3).

| # | Requirement | Covered by | Status |
|---|---|---|---|
| 1 | W8.34 spec R64 + R-implicit-resume narrowing | D1 | covered |
| 2 | W8.34 mechanism (adopt own / same plan; stop otherwise) | Task 1 | covered |
| 3 | W8.34 tests (seed unchanged, env-only edits, R1 rewrite, new cases) | Task 2 | covered |
| 4 | #9208 execute spec A8, A9, R43 (+P1, P7) | D2 | covered |
| 5 | #9208 execute semantics, state, resume | Tasks 3, 4, 5, 9 | covered |
| 6 | #9208 ship spec A13, A14, R76 | D3 | covered |
| 7 | #9208 ship pass-through, not restored on resume | Tasks 6, 7, 10 | covered |
| 8 | #9208 Files / Must-not-touch | Tasks 3–10 Files; Tasks preamble | covered |
| 9 | W8.35 spec A12, R75, R9, G8 | D4 | covered |
| 10 | W8.35 default, docs row, cases | Tasks 11, 12, 13 | partial (Deviations row 6) |
| 11 | Order: D1–D4, then the M7 row order; one plan, one PR | Architecture; Tasks 1–13 | covered |
| 12 | Plan conventions (Notes, Commit, Test proof, promptfoo pin, grep -n, open point, fan-out row) | every task; Follow-up 1; Deviations row 3 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
