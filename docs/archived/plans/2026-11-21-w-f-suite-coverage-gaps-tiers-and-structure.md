# W-F Suite Coverage Gaps, Tiers and Structure Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #125, bb03139

**Commit:** `test(W-F): tests - suite coverage gaps, wrappers and ship split`
**Goal:**
- Close the three W-F tickets of the sdlc-utilities test suite: TK-019 (coverage gaps), TK-020 (structure, without the pre-push tier) and TK-021 (wave-split exits instead of printing).
- Add an exec case for every real coverage gap of TK-019.
- Move the inline `node -e` programs of `ship-prepare-exec.yaml` into wrapper scripts, fix stale dataset headers, then split `ship-prepare-exec.yaml` into four datasets as the last step, with no case or assertion lost.
**Architecture:** Eleven tasks in three execute waves. Wave 1 holds eight independent tasks: the TK-021 code fix, six TK-019 test tasks and one header task; each dataset belongs to one task. Wave 2 is one Complex task that converts the 48 `-e` programs of `ship-prepare-exec.yaml` into three table-driven wrapper scripts. Wave 3 is the Complex split task and one small reference task. Only Task 1 changes plugin code (`state/execute.js`); every other task changes test files, fixtures, baselines, one spec's acceptance file names and its site copy.
**Source:** docs/plans/programme.md#W-F
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The exec suite (the promptfoo tests that run plugin scripts directly, with no LLM) has holes. Several script subcommands and flags have no test at all. Examples: `state/execute.js wave-fail` and `task-fail`, `state/ship.js skip`, `fail`, `decide` and `defer`, and the review scope flags.
- `tests/promptfoo/datasets/ship-prepare-exec.yaml` is one file of 6,178 lines with 320 cases. It is hard to read and to review.
- 48 of its cases run an inline program: `script_path: "-e"` with a one-line JavaScript program in `script_args`. These one-liners use escapes such as `\x20` for spaces, so a reviewer cannot read them.
- Some dataset headers name scripts that no longer exist (for example `commit-prepare.js`, `pr-prepare.js`, and `tests/unit/`, which is gone).
- `state/execute.js wave-split` exits with code 2 when it is run without `--state-file` outside a git repository. The split result is never printed, although the state write is meant to be best-effort.

**What prompted this change now?**

- The architect's suite audit (2026-11-18) listed these items as waves W6 and W7 (#9427, #9428). The lean-w37 temp-cwd change exposed #9463.
- The plan register schedules them as unit W-F, after W-D2 (done).

**What does success look like?**

- Every real TK-019 gap has an exec case whose assertion checks the exact persisted value, exit code or message, so the case fails when that behaviour breaks.
- `ship-prepare-exec.yaml` has no `script_path: "-e"` case. Its programs live in three wrapper scripts with readable code.
- `ship-prepare-exec.yaml` is split into four datasets. The total case count, the total assertion count and the set of cited ids are unchanged, and the coverage gate (`check-spec-id-coverage.js`) passes after one reviewed `--update`.
- `wave-split` without `--state-file` outside a git repository prints its result and exits 0.
- The exec suite passes. Each task runs its own targeted exec cases. The full exec runs (`promptfooconfig-exec.yaml` and `promptfooconfig-exec-hooks.yaml`) are run by the main session at PR validation, never inside a task (project notes; TK-019 A2).

**Who is hurt if this ships wrong?**

- Task 1 is the only plugin-code change. A wrong fix would hit execute-plan-sdlc runs that call `wave-split` during a context-overflow recovery.
- The other tasks change only the test suite. A lost case or a wrong baseline would hide future regressions from the maintainers and from the pre-push gate (the fast tier runs `spec-id-coverage-exec.yaml` and `dataset-asserts-exec.yaml`).

## Research Findings

**Where things are (verified at HEAD 80548d8):**

- TK-021: `plugins/sdlc-utilities/scripts/state/execute.js:1143` calls `resolveBranchOrExit` (`:196-203`, which calls `process.exit(2)`) inside the best-effort `try` of `cmdWaveSplit` (`:1077`). A `catch` cannot stop `process.exit`. `resolveBranch` (from `lib/state.js:474`, which throws instead of exiting) is already imported at `execute.js:43`. No other caller of `resolveBranchOrExit` sits inside a best-effort `try` (F-wave-split-resolve-branch-no-exit-1, -2, -9).
- The script-runner provider (`tests/promptfoo/providers/script-runner.js`) runs a case without `script_cwd` in a fresh temp directory that is not a git repository. So the TK-021 case needs no fixture (F-wave-split-resolve-branch-no-exit-7).
- TK-019 gaps, checked one by one (F-exec-coverage-gap-inventory-1 to -9):

  | Gap from the ticket | State at HEAD | Plan |
  |---|---|---|
  | `state/execute.js wave-fail`, `task-fail` | no exec case (`execute.js:542-564`, `:762-812`) | Task 2 |
  | `state/ship.js decide`, `defer`, `skip`, `fail` | no exec case (`ship.js:409-515`) | Task 2 |
  | `review.js` scope flags | only `--committed` is covered (`review-prepare-exec.yaml:91-177`) | Task 3 |
  | `jira.js` cache flags | `--load`, `--clear`, `--cache-dir`, `--save-field`, `--init-templates`, `--copy-template` have no case | Task 4 |
  | `setup --migrate --only --scan-prs` | `setup.js` does not parse `--migrate` or `--only` (`setup.js:497-551`); `--scan-prs` has no case | Task 5 (`--scan-prs` only) |
  | `version.js` errors | many error paths have no case (`version.js:142-243`, `:664-779`) | Task 6 |
  | `execute --commit-waves --from-wave` | `--from-wave` is covered (`execute-prepare-exec.yaml:595-660`); the CLI `--commit-waves` is not | Task 7 (`--commit-waves` only) |
  | `ship --await-review` | the rejection (`ship.js:199-202`) has no case | Task 7 |
  | `commit` type/scope rejects | covered (`commit-prepare-exec.yaml:141-163`), but by substrings only, with no exit code | Task 7 (tighten) |

- A case cannot see a file it changed after the run, because each case gets a fresh fixture copy. So write-then-read checks need a wrapper script (F-exec-coverage-gap-inventory-14). The pattern is `tests/promptfoo/scripts/run-*.js` with a header listing Args and Output (`run-execute-wave-done-usage.js:1-18`, `run-ship-begin-complete.js:1-30`) (F-exec-suite-split-and-wrappers-5).
- `state/*.js` commands find their state file through `SDLC_STATE_DIR_OVERRIDE` (`lib/state.js:84`) and take `--branch`, so a wrapper can run them with no git repository.
- `ship-prepare-exec.yaml`: 320 `- description:` cases, 445 assertions in the coverage baseline, 48 `-e` cases. Its description families map cleanly onto four files (see Task 10) (F-exec-suite-split-and-wrappers-1, -4).
- Files that name `ship-prepare-exec.yaml` and need a change after the split: `promptfooconfig-exec.yaml:31`, `baselines/spec-id-coverage.json:606`, `baselines/dataset-asserts-allow.json` (one entry for `verify-side-effect: commit with the HEAD sha → landed:true`), `docs/specs/ship-sdlc.md` (16 lines) and its site copy, `scripts/pipeline-advancing-test.js:4`, `fixtures-fs/stub-bin-gh/bin/gh:4` (F-exec-suite-split-and-wrappers-3). Plans, archives, the CHANGELOG and `docs/TODO/` are history and stay unchanged.
- Count and floor checks over the test files (F-exec-coverage-gap-inventory-10, -11; F-exec-suite-split-and-wrappers-7):
  - `check-spec-id-coverage.js` fails when a dataset, an assertion count, a cited id or a parsed flag key drops below `baselines/spec-id-coverage.json`. Growth never fails. A moved case needs a deliberate `--update`.
  - `spec-id-coverage-exec.yaml` case (b): `configs === 2`, `datasets >= 77`, `cases >= 1641`, `asserts >= 2645`.
  - `dataset-asserts-exec.yaml` case (a): `findings 0`, `datasets >= 77`, `cases >= 1641`. The rules reject empty-matching regexes, negative-only cases and key-only contains, outside the allowlist.
  - `fixture-guard-exec.yaml`: every `fixtures-fs/*/setup.sh` that runs `git init` must start with the guard line that refuses to run inside a git work tree (example `fixtures-fs/project-execute-commit-waves/setup.sh:4`).
  - `mutation-smoke.js:35-124` pins some description filters (`wave-committed`, `commit-trailers: (G10+)`, `setup-prepare: shipFields.steps has exactly 10`). New descriptions must not contain `wave-committed` (F-exec-coverage-gap-inventory-13).
- Stale headers, checked against the files (F-exec-suite-split-and-wrappers-6): `commit-prepare-exec.yaml:1-3`, `pr-prepare-exec.yaml:1-3`, `guardrails-prepare-exec.yaml:1-2`, `plan-prepare-exec.yaml:1-3`, `config-load-exec.yaml:1-3`, `migrate-config-exec.yaml:1-3`, and `ship-prepare-exec.yaml:1-4`. Two suspects are not stale: `sdlc-plugin-discovery-exec.yaml` says "16 checks", and `lib/discovery.js` has PD1 to PD16; `ship-sdlc-exec.yaml` correctly says it tests `lib/ship-todos.js`.
- Build and test commands: exec runs only, through the Verification command above, with `-j 1`. The coverage gate runs as `node tests/promptfoo/scripts/check-spec-id-coverage.js` (add `--update` to rewrite the baseline).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| `-e` programs in scope | no | moves the 48 `-e` programs of `ship-prepare-exec.yaml` only; the other 179 in 18 datasets stay | A1 of TK-020 names `ship-prepare-exec.yaml`; the audit sized all of W6 at 5 tasks; converting all 227 would be about 15 more tasks; see Decisions taken without the owner |
| `setup --migrate --only` | no | adds no case for them | `setup.js` does not parse them (`setup.js:497-499`); they are SKILL.md-level, and behavioural cases are out of scope |
| `execute --from-wave` | no | adds no case | already covered (`execute-prepare-exec.yaml:595-660`) |
| commit type/scope rejects | no | adds assertions to the two existing cases instead of new cases | the cases exist (`commit-prepare-exec.yaml:141-163`) but check substrings only |
| Header audit scope | no | fixes the seven headers found stale; no rewrite of case descriptions | no stale description was found; the two other suspects were checked and are correct |
| Split task file count | no | Task 10 touches 9 files (above the 5-file guide) | the split, the config line, the baselines and the floors must change in one commit, or the coverage gate fails between commits |
| Ticket size | no | one plan of 11 tasks, not two plans | under the 14-task bound, and at most one Complex task per wave |
| Spec ids for TK-021 | no | cites R-CONTEXT_OVERFLOW; no spec change | the fix restores the best-effort contract already in the `cmdWaveSplit` doc comment; no spec text states the exit |

## Key Decisions

- **Only the `-e` programs of `ship-prepare-exec.yaml` move, not all 227.** The alternative is to convert every `-e` program in the suite. That is about 15 extra tasks and many execute waves. TK-020 A1 reads "ship-prepare-exec.yaml is split and the -e programs are wrapper scripts", and the audit sized the whole of W6 at five tasks. The file being split is the one where unreadable programs hurt most (48 programs, 832 lines). The other 179 programs are listed for the owner below.

- **Three table-driven wrappers, not one file per program.** The alternative is 48 small scripts. A wrapper per family (`--case <name>` picks the program) keeps related programs together and keeps the task within five files. It mirrors `run-ship-stepper.js --scenario <name>`.

- **Wrappers print exactly what the `-e` program printed.** The alternative is to also rewrite the assertions. Keeping the output byte-compatible means every assertion block stays unchanged. A passing targeted run then proves the move lost nothing.

- **The split keeps `ship-prepare-exec.yaml` for the prepare cases.** The alternative is four brand-new names. Keeping the name keeps most spec references and the stub comment valid, so fewer files change.

- **Split by description family, not by line ranges.** Line numbers shift after Tasks 7 and 9. Description families (the text before the first colon) do not shift, and the coverage gate's `--filter-pattern` users already filter by them.

- **One generic state-command wrapper for both state scripts.** The alternative is two wrappers. `state/execute.js` and `state/ship.js` share the same seed, run and read-back steps (`SDLC_STATE_DIR_OVERRIDE` plus `--branch`), so one wrapper with `--script execute|ship` covers both, with no git repository.

- **New TK-019 cases use wrappers or plain `script_args`, never `-e`.** This avoids adding the debt that TK-020 removes. Plain `script_args` also give the coverage gate real flag keys.

- **The coverage baseline is updated by Task 9 and Task 10 only.** Wave 1 tasks add cases, which is growth and never fails the gate. Task 9 may drop `-e` flag keys; Task 10 moves datasets. Each runs `--update` once, and the baseline diff is reviewed in the PR.

### Decisions taken without the owner

- **D1: scope of "-e programs to wrappers".** Taken: the 48 programs of `ship-prepare-exec.yaml`. Not taken: all 227. Follow-up for the owner (not added to any TODO note by this plan): the remaining `-e` programs are in `github-sdlc-exec.yaml` (29), `ship-hooks-exec.yaml` (24), `commit-prepare-exec.yaml` (23), `received-review-prepare-exec.yaml` (23), `plan-prepare-exec.yaml` (21), `plan-format-exec.yaml` (17), `review-prepare-exec.yaml` (9), `state-gc-migrate-exec.yaml` (7), `pr-prepare-exec.yaml` (6) and nine datasets with 1 to 4 each.
- **D2: `setup --migrate --only`.** Dropped from TK-019: the script ignores both flags, so no exec case can fail when they break.
- **D3: `--from-wave` and commit type/scope rejects.** Stale gaps: `--from-wave` is dropped; the commit cases are tightened, not duplicated.
- **D4: TK-021 output shape.** Taken: the existing `catch` swallows the branch error and the split result prints with exit 0 (A1 allows "its result or a JSON error"). Not taken: a new JSON error shape, which no caller reads.
- **D5: split file names.** `ship-prepare-exec.yaml` (kept), `ship-state-exec.yaml`, `ship-stepper-exec.yaml`, `ship-stepper-flows-exec.yaml`.

## Contract Examples

**Code** (Task 1):

```markdown
**Contract:**
- shape (code): in `cmdWaveSplit`, the branch lookup inside the best-effort `try` calls `resolveBranch(opts.branch)` (throws) instead of `resolveBranchOrExit(opts.branch)` (exits 2); the existing `catch (_)` swallows the error and the result prints with exit 0.
- names: `cmdWaveSplit`, `resolveBranch`, `resolveBranchOrExit`.
- mirror: the `opts.stateFile` branch of the same `try` at `state/execute.js:1134-1141`.
- decisions: D4 — no JSON error shape.
- sync: the doc comment above `cmdWaveSplit` (`:1063-1076`).
```

**Docs** (Task 8):

```markdown
**Contract:**
- shape (docs): MODIFY the leading `#` comment block of five exec datasets so each names the script its cases run and the topics they cover; audience: suite maintainers.
- names: `skill/pr.js`, `skill/guardrails.js`, `skill/plan.js`, `runners/config-load-runner.js`.
- mirror: the header style of `review-consolidate-exec.yaml:1-4`.
- decisions: comments only; every id token in the old header stays.
- sync: none.
```

**Openspec / spec** (Task 11):

```markdown
**Contract:**
- shape (openspec): MODIFY acceptance file names only in `docs/specs/ship-sdlc.md` (no requirement ADD/REMOVE, no numbering change); each moved family names its new dataset.
- names: `ship-state-exec.yaml`, `ship-stepper-flows-exec.yaml`.
- mirror: the acceptance line style at `docs/specs/ship-sdlc.md:34`.
- decisions: ids and requirement text unchanged.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy.
```

## Tasks

### Task 1: wave-split prints its result without a branch
**Ticket:** TK-021 @2e862b58

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `cmdWaveSplit` calls `resolveBranch` in its best-effort `try`; doc comment
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — one case after the depth-ceiling `wave-split-cmd` case (about `:350-356`)

**Notes:** Implements R-CONTEXT_OVERFLOW (the split is persisted best-effort). Cites F-wave-split-resolve-branch-no-exit-1, -2, -5, -7. The spec (`docs/specs/execute-plan-sdlc.md:323`), `SKILL.md:433-441` and `docs/skills/execute-plan-sdlc.md` were checked at planning and do not state the exit, so they need no change. The other 14 `resolveBranchOrExit` callers exit on purpose; `state/ship.js:105` is out of scope.

**Acceptance criteria:**
- [x] The change at `state/execute.js:1142-1146` is exactly:
  ```diff
       } else {
  -      const branch = resolveBranchOrExit(opts.branch);
  +      const branch = resolveBranch(opts.branch);
         const slug = slugifyBranch(branch);
         found = readState('execute', slug);
       }
  ```
- [x] The doc comment of `cmdWaveSplit` says that without `--state-file` a branch-resolution failure skips persistence and the result still prints (exit 0).
- [x] New case `execute-plan-sdlc/wave-runner-overflow/wave-split-cmd: without --state-file outside a git repo prints halves and exits 0 (TK-021)`: no `script_cwd`, no `project_root`, `script_show_exit: true`, `script_args: "wave-split --wave 1 --dispatched [\"T1\",\"T2\",\"T3\",\"T4\"] --missing-ids [\"T3\",\"T4\"] --split-depth 0 --max-split-depth 3"`; one `javascript` assertion that parses the output without its last line and checks `halves.length === 2`, and checks that the last line is `[exit 0]`.
- [x] The new case fails against the old line (checked by reasoning: the old code exits 2 with no stdout).
- [x] The existing `wave-split-cmd` case descriptions are unchanged (`mutation-smoke.js:101-106` filters them).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern wave-split-cmd` passes.

**Contract:**
- shape (code): see the diff above; no signature change; exit codes of `wave-split`: 0 success (with or without persistence), 2 argument error or `MaxSplitDepthExceededError` (unchanged).
- names: `cmdWaveSplit`, `resolveBranch`.
- mirror: the `opts.stateFile` path of the same `try` (`state/execute.js:1134-1141`), which already falls through on error.
- decisions: D4; the description token `TK-021` is safe for the id scan (no `A1`-style token in the case block).
- sync: baseline growth only (`spec-id-coverage.json` counts for this dataset rise; no `--update` needed).

### Task 2: state command cases for execute and ship
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-state-command.js` — seeds a state file, runs one `state/execute.js` or `state/ship.js` command, prints the result and the state read back
- Create: `tests/promptfoo/datasets/state-commands-exec.yaml` — the cases below
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — add `- file://datasets/state-commands-exec.yaml` after `state-gc-migrate-exec.yaml`

**Notes:** Cites F-exec-coverage-gap-inventory-1, -2, -10, -14. The success path of these commands prints nothing, so only a read-back proves the write. `SDLC_STATE_DIR_OVERRIDE` plus `--branch` removes the need for a git fixture.

**Acceptance criteria:**
- [x] Every case below exists with the description prefix `state-commands:` and passes; each `javascript` assertion checks the exact field, value and exit code in the table.
- [x] No case uses `script_path: "-e"`; no description contains `wave-committed`.
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports no drop (growth only), and `node tests/promptfoo/scripts/check-dataset-asserts.js` reports no finding.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern state-commands:` passes.

**Contract:**
- shape (code): wrapper CLI and output:
  ```text
  node tests/promptfoo/scripts/run-state-command.js --script execute|ship --seed mid-run|none --branch <name> -- <subcommand> [args...]
  stdout (one JSON line): {"exitCode":<n>,"stdout":"<text>","stderr":"<text>","state":<object|null>}
  usage errors (no --script, a bad --script or --seed value, no "--" or no subcommand, unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  Behaviour: make a temp state dir; for `--seed mid-run` write a seed state file named as `lib/state.js` names it for `<execute|ship>` and the slug of `--branch`; run `node plugins/sdlc-utilities/scripts/state/<script>.js <subcommand> [args...] --branch <name>` with `SDLC_STATE_DIR_OVERRIDE` set to the dir; read the state back with `readState`; print; remove the dir; exit 0 whatever the child exit.
  Seeds: execute `mid-run` = wave 1 `completed`, wave 2 `in_progress` with task `1` `in_progress`; ship `mid-run` = steps `execute` `completed`, `commit`, `review`, `version`, `pr` `pending`. Copy the field shape from `fixtures-fs/execute-state-mid-wave` and `fixtures-fs/ship-state-begin-complete`.
- names: cases (letter, script, args after `--`, expected):

  | Case | Script | Args | Expected |
  |---|---|---|---|
  | (a) | execute | `wave-fail --wave 2` | exit 0; wave 2 `status === 'failed'` and `completedAt` set |
  | (b) | execute | `wave-fail` | exit 2; stderr names `--wave`; wave 2 still `in_progress` |
  | (c) | execute | `task-fail --wave 2 --task 3 --error boom` | exit 0; task `3` `status 'failed'`, `error 'boom'`, `filesChanged` `[]` |
  | (d) | execute | `task-fail --wave 2 --task 3 --skipped-dependency` | exit 0; task `3` `status 'skipped-dependency'` |
  | (e) | execute | `task-fail --wave 2 --task 1 --error x` | exit 0; wave 2 holds one task `1`, now `failed` (replaced, not added) |
  | (f) | execute | `task-fail --wave 2` | exit 2; stderr names `--task` |
  | (g) | execute, `--seed none` | `wave-fail --wave 2` | exit 1; `state === null` |
  | (h) | ship | `skip --step version --reason r` | exit 0; step `version` `status 'skipped'`, `reason 'r'` |
  | (i) | ship | `fail --step review --error e` | exit 0; step `review` `status 'failed'`, `error 'e'` |
  | (j) | ship | `decide --step review --text t` | exit 0; `decisions` ends with `{step:'review',decision:'t'}` |
  | (k) | ship | `defer --severity high --file a.js --title T` | exit 0; `deferredFindings` ends with `{severity:'high',file:'a.js',line:null,title:'T'}` |
  | (l) | ship | `defer --severity high --file a.js` | exit 2; stderr names `--title`; no `deferredFindings` entry |
  | (m) | ship | `skip --step nosuch` | exit 1; stderr names `nosuch` |
- mirror: `tests/promptfoo/scripts/run-execute-wave-done-usage.js:1-60` (repo-root search, spawnSync, JSON output).
- decisions: one wrapper for both scripts (Key Decisions); the flag names (`--error`, `--skipped-dependency`, `--text`, `--reason`) are read from `parseArgs` of each script before writing the cases, and a case is adapted if a name differs.
- sync: `promptfooconfig-exec.yaml` gets one line; Task 10 later edits the same file (wave 3).

### Task 3: review scope flag cases
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/project-review-scopes/setup.sh` — git repo: `main`, branch `feat/scopes` with one committed file, one staged file, one unstaged change; one `.sdlc/review-dimensions/*.md`
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — the cases below, after the `--committed` cases (about `:91-177`)

**Notes:** Cites F-exec-coverage-gap-inventory-3, -11. A new fixture keeps the three change kinds apart, so each scope's file list is distinct and a wrong diff command fails the case.

**Acceptance criteria:**
- [x] `setup.sh` starts with the guard line of `fixtures-fs/project-execute-commit-waves/setup.sh:4` before any `git init`, and `fixture-guard-exec.yaml` still passes.
- [x] Each case below exists with the description prefix `review-scope:` and passes; file-list assertions are `javascript` checks over the manifest JSON.
- [x] `node tests/promptfoo/scripts/check-dataset-asserts.js` reports no finding.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern review-scope:` passes.

**Contract:**
- shape (code): cases (all `script_path: "repo://plugins/sdlc-utilities/scripts/skill/review.js"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/project-review-scopes"`):

  | Case | `script_args` | Expected |
  |---|---|---|
  | (a) | `--staged` | manifest scope `staged`; files = the staged file only |
  | (b) | `--working` | scope `working`; files = staged file and unstaged file (`git diff HEAD`) |
  | (c) | `--worktree --base main` | scope `worktree`; files = committed, staged and unstaged files |
  | (d) | `--staged --base main` | exit 2; output contains `--staged and --base are mutually exclusive` |
  | (e) | `--set-default --staged` with `script_capture_stderr: true` | stderr line `Saved default scope "staged" to .sdlc/review.json`; manifest scope `staged` |
- names: description prefix `review-scope:`; fixture `project-review-scopes`.
- mirror: the `--committed` case at `review-prepare-exec.yaml:88-100` (manifest read, fixture vars).
- decisions: no "no changed files" case: it needs a fourth fixture state and the message path (`review.js:685-695`) is shared with `--committed`.
- sync: none.

### Task 4: jira cache flag cases
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-jira-cache.js` — runs a short sequence of `jira.js` calls with one HOME and prints each result plus cache file facts
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — one case per flag below, after the `--force-refresh` case (about `:326-335`)

**Notes:** Cites F-exec-coverage-gap-inventory-4. `--clear`, `--save-field` and `--init-templates` change files, so their effect is only visible to a second call in the same HOME; a wrapper runs both calls.

**Acceptance criteria:**
- [x] Each case below exists with the description prefix `jira-cache:` and passes.
- [x] Every assertion checks a value from the table (a field value, a file that exists or is gone, an exit code), not a key name alone.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern jira-cache:` passes.

**Contract:**
- shape (code): wrapper CLI:
  ```text
  node tests/promptfoo/scripts/run-jira-cache.js --scenario clear|save-field|init-templates|copy-template --home <dir> --project <KEY>
  stdout (one JSON line): {"scenario":"<name>","calls":[{"args":[...],"exitCode":<n>,"stdout":"<text>"}],"files":{"<relative path>":true|false}}
  usage errors (missing or unknown --scenario, missing --home or --project, unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  Cases (`script_home: "{{project_root}}"`, `project_root: "file://fixtures-fs/jira-save-roundtrip"`, project `SAVETEST`):

  | Case | Runs | Expected |
  |---|---|---|
  | `--load` | `jira.js --project SAVETEST --load` (plain case) | exit 0; output holds the cached project key `SAVETEST` |
  | `--cache-dir` | `jira.js --project SAVETEST --check --cache-dir <fixture cache dir>` (plain case) | `exists` true for the given dir |
  | `--clear` | wrapper `clear`: `--clear`, then `--check` | second call reports the cache does not exist; cache file gone |
  | `--save-field` | wrapper `save-field`: `--save-field <name> --input <file>`, then `--load` | loaded cache holds the saved field value |
  | `--init-templates` | wrapper `init-templates` | exit 0; the templates directory holds at least one template file |
  | `--copy-template` | wrapper `copy-template`: `--copy-template --type <t> --from <f>` | exit 0; the target template file exists |
- names: description prefix `jira-cache:`; wrapper scenarios as above.
- mirror: `jira-sdlc-exec.yaml:362-372` (fixture vars, `script_home`); wrapper style `run-ship-begin-complete.js:1-40`.
- decisions: exact arguments of `--save-field`, `--copy-template` and their outputs are taken from `jira.js:955-1098` before the cases are written; the wrapper never touches the real HOME.
- sync: none.

### Task 5: setup --scan-prs case
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-prs/bin/gh` — stub `gh` (mode 755) that answers `pr list --state all --limit 5 --json title,body` with two PRs and `repo view` as the generic stub does
- Modify: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — two cases after the `recentPrs` case (about `:330`)

**Notes:** Cites F-exec-coverage-gap-inventory-5. A new stub directory keeps the shared `stub-bin-gh` unchanged, so ship, pr and stub-bin cases are not affected. D2 drops `--migrate` and `--only`.

**Acceptance criteria:**
- [x] The stub file is executable in git (`git ls-files -s` shows mode `100755`).
- [x] Case `setup-scan-prs: (a) --scan --scan-prs fills recentPrs from gh pr list` passes: `recentPrs` has the two stub titles.
- [x] Case `setup-scan-prs: (b) --scan without --scan-prs never calls gh pr list` passes: `recentPrs` is `[]` with the same stub.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern setup-scan-prs:` passes.

**Contract:**
- shape (code): stub behaviour:
  ```text
  gh pr list --state all --limit 5 --json title,body  -> stdout [{"title":"feat: one","body":"b1"},{"title":"fix: two","body":"b2"}], exit 0
  gh repo view ...                                     -> same output as fixtures-fs/stub-bin-gh/bin/gh
  anything else                                        -> stdout STUB-GH-INVOKED, exit 0
  ```
  Cases use `script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh-prs/bin"`, `script_cwd: "{{project_root}}"` and `project_root: "file://fixtures-fs/plan-prepare-github-remote"` (its `setup.sh:8` sets an `origin` on github.com, so `lib/project-scan.js:706-707` reports `hosting.github` via `remote`).
- names: description prefix `setup-scan-prs:`; dir `stub-bin-gh-prs`.
- mirror: `fixtures-fs/stub-bin-gh/bin/gh:1-30`; `lib/project-scan.js:742-797`.
- decisions: D2.
- sync: none.

### Task 6: version error path cases
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/version-prepare-exec.yaml` — the cases below, after the `--subject` case (about `:308`)
- Create: `tests/promptfoo/fixtures-fs/version-no-config/setup.sh` — git repo with no version config
- Create: `tests/promptfoo/fixtures-fs/version-no-tags/setup.sh` — git repo with a tag-mode version config and no tags
- Create: `tests/promptfoo/fixtures-fs/version-invalid-semver/setup.sh` — git repo with a file-mode config whose `package.json` version is `1.2`

**Notes:** Cites F-exec-coverage-gap-inventory-6. The parse errors run against the existing `version-sdlc-config-changelog` fixture; the three config errors need their own repo state.

**Acceptance criteria:**
- [x] Each `setup.sh` starts with the guard line before any `git init`; `fixture-guard-exec.yaml` still passes.
- [x] Each case below exists with the description prefix `version-errors:` and passes; each checks the `errors` entry text and `flow === 'release'` with a `javascript` assertion.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern version-errors:` passes.

**Contract:**
- shape (code): cases (`script_path: "repo://plugins/sdlc-utilities/scripts/skill/version.js"`, `script_cwd: "{{project_root}}"`):

  | Case | Fixture | `script_args` | Expected `errors` entry |
  |---|---|---|---|
  | (a) | `version-sdlc-config-changelog` | `--bump Bad1` | starts `Invalid --bump value 'Bad1'` |
  | (b) | `version-sdlc-config-changelog` | `--bump patch --bump minor` | `{id:'bumpFlagConflict'}`, message `--bump specified more than once` |
  | (c) | `version-sdlc-config-changelog` | `--pre 1bad` | starts `Invalid --pre label '1bad'` |
  | (d) | `version-sdlc-config-changelog` | `Foo` | starts `Unrecognized argument 'Foo'` |
  | (e) | `version-no-config` | (none) | starts `No version config found` |
  | (f) | `version-no-tags` | (none) | starts `No version tags found` |
  | (g) | `version-invalid-semver` | (none) | `Current version '1.2' is not valid semver.` |
- names: description prefix `version-errors:`; the three fixture names.
- mirror: `version-prepare-exec.yaml:96-110` (the positional and `--bump` conflict case); config shape from `fixtures-fs/version-sdlc-config-changelog`.
- decisions: (a) uses `Bad1` because a lowercase word is a valid pre-release label (`version.js:130-140`).
- sync: none.

### Task 7: the three residual TK-019 flag gaps
**Ticket:** TK-019 @195a5ddb

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — two cases after (j3) (about `:170-178`)
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — add assertions to the two reject cases (`:141-163`); fix the header (`:1-3`, a TK-020 A2 item)
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — one case after the `--verify-pipeline` case (about `:910-920`)

**Notes:** One deliverable: the small flag gaps of TK-019 (CLI `--commit-waves`, the `--await-review` rejection, the commit reject exit), each one case or a few assertions; bundled so that no task is one line. Cites F-exec-coverage-gap-inventory-7, -8, -9 and F-exec-suite-split-and-wrappers-6. The `commit-prepare-exec.yaml` header fix is a TK-020 A2 item; it sits here because this task owns that file in wave 1.

**Acceptance criteria:**
- [x] `execute-prepare: (k1) commit-waves-cli --commit-waves with no config gives true with source cli` passes (fixture `project-execute-prepare`): `flags.commitWaves === true && flags.sources.commitWaves === 'cli'`.
- [x] `execute-prepare: (k2) commit-waves-cli --commit-waves wins over a legacy false` passes (fixture `project-ship-commit-waves-off`): same check.
- [x] `ship-prepare: --await-review is rejected with the steps hint` passes, as a twin of the `--verify-pipeline` case: `--has-plan --await-review`; output contains `--await-review is no longer accepted`.
- [x] The cases `commit-prepare: --type chore violates allowedTypes` and `commit-prepare: --scope ui violates allowedScopes` keep their two `icontains` assertions and change as below (the `--scope ui` case is the same with `ui` and `Commit scope`); the exit 1 comes from `commit.js:465` (`process.exit(result.errors && result.errors.length > 0 ? 1 : 0)`):
  ```diff
   - description: "commit-prepare: --type chore violates allowedTypes"
     vars:
       script_path: "repo://plugins/sdlc-utilities/scripts/skill/commit.js"
       script_args: "--type chore"
       script_cwd: "{{project_root}}"
       project_root: "file://fixtures-fs/project-commit-config"
  +    script_show_exit: true
     assert:
       - type: icontains
         value: "not allowed"
       - type: icontains
         value: "Allowed types"
  +    - type: javascript
  +      value: |
  +        const lines = output.trimEnd().split('\n');
  +        const o = JSON.parse(lines.slice(0, -1).join('\n'));
  +        return lines[lines.length - 1] === '[exit 1]' && o.errors.some(e => String(e).includes('"chore"'));
  ```
  The output is the manifest JSON (the provider reads the temp file whose path `commit.js` prints) followed by the `[exit N]` line.
- [x] The header reads: `# Script execution tests for skill/commit.js (commit-sdlc prepare).` / `# These tests run commit.js directly against fixture directories (no LLM).`; the `Ported from tests/unit/...` line is gone.
- [x] No assertion is removed; `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports no drop.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "commit-waves-cli|violates allowed|await-review is rejected"` passes.

**Contract:**
- shape (code): new and changed case vars:
  ```yaml
  # k1 / k2
  script_path: "repo://plugins/sdlc-utilities/scripts/skill/execute.js"
  script_args: "--plan {{repo_root}}/tests/promptfoo/fixtures-fs/project-execute-prepare/plan.md --commit-waves --project-root {{project_root}}"
  # await-review
  script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin"
  script_path: "repo://plugins/sdlc-utilities/scripts/skill/ship.js"
  script_args: "--has-plan --await-review"
  ```
- names: descriptions as in the criteria; `commit-waves-cli` is the shared filter token.
- mirror: (j1)-(j3) at `execute-prepare-exec.yaml:150-178`; the `--verify-pipeline` case at `ship-prepare-exec.yaml:910-920`.
- decisions: D3.
- sync: Task 9 edits `ship-prepare-exec.yaml` next (wave 2).

### Task 8: stale dataset headers
**Ticket:** TK-020 @2999c108

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — header `:1-3`
- Modify: `tests/promptfoo/datasets/guardrails-prepare-exec.yaml` — header `:1-2`
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — header `:1-3`
- Modify: `tests/promptfoo/datasets/config-load-exec.yaml` — header `:1-3`
- Modify: `tests/promptfoo/datasets/migrate-config-exec.yaml` — header `:1-3`

**Notes:** Cites F-exec-suite-split-and-wrappers-6; comment lines only, so no case or assertion changes.

**Acceptance criteria:**
- [x] The header lines change as follows (other header lines stay):

  | File | Old text | New text |
  |---|---|---|
  | `pr-prepare-exec.yaml` | `pr-prepare.js` (lines 1-2); line 3 `Ported from tests/unit/pr-prepare.test.js.` | `skill/pr.js` / `pr.js`; line 3 removed |
  | `guardrails-prepare-exec.yaml` | `guardrails-prepare.js` (lines 1-2) | `skill/guardrails.js` / `guardrails.js` |
  | `plan-prepare-exec.yaml` | `plan-prepare.js (plan.js)`; `Covers: OpenSpec authoritative output (issue #164).` | `skill/plan.js`; `Covers: prepare output, OpenSpec context (issue #164), and the plan.js subcommands (tier, diff-material, merge-lanes, splice, critique-prep, mark).` (list the subcommands the cases actually run) |
  | `config-load-exec.yaml` | `Uses a tiny inline runner script invoked` / `with different fixture directories.` | `Runs runners/config-load-runner.js against different fixture directories.` |
  | `migrate-config-exec.yaml` | `Manual verification only — never run from CI.` | `Part of the exec suite (promptfooconfig-exec.yaml).` |
- [x] Every id token (`/\b[A-Z]{1,3}\d{1,4}\b/`) of the old headers is still present; `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports no drop.
- [x] `git grep -F` of each removed phrase over `tests/` finds no assertion that reads it.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern spec-id-coverage:` passes.

**Contract:**
- shape (docs): MODIFY the leading `#` comment block of the five datasets per the table above; audience: suite maintainers; no case lines change.
- names: `skill/pr.js`, `skill/guardrails.js`, `skill/plan.js`, `runners/config-load-runner.js`.
- mirror: the header style of `review-consolidate-exec.yaml:1-4`.
- decisions: comments only; every id token of the old header stays (the coverage gate counts ids in comments).
- sync: none.

### Task 9: ship-prepare -e programs to wrapper scripts
**Ticket:** TK-020 @2999c108

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-ship-prepare-ledger.js` — 20 programs: ledger, resume and dry-run cases
- Create: `tests/promptfoo/scripts/run-ship-prepare-plan-fields.js` — 18 programs: commit subject, fix subject and scope, stage-sdlc, release forwarding, bump
- Create: `tests/promptfoo/scripts/run-ship-prepare-summary.js` — 10 programs: summary, final check, step text, lean testing-file
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — the 48 `-e` cases point at the wrappers; assertion blocks unchanged
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — `--update` only if the check reports a flag-key drop caused by the move

**Notes:** Cites F-exec-suite-split-and-wrappers-4, -5, -7, -8. Byte-compatible output keeps every assertion unchanged, so a green targeted run proves the move. The wrappers resolve the repo root from `__dirname`, which replaces every `{{repo_root}}` inside a program; `{{project_root}}` is the case's `script_cwd`, so a wrapper uses `process.cwd()`.

**Acceptance criteria:**
- [x] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/ship-prepare-exec.yaml` prints `0`.
- [x] The `- description:` count and the count of assertion lines (`/^\s*-\s*type:/` outside comments) of the dataset are unchanged by this task, and no description text changes.
- [x] For each moved case only `script_path` and `script_args` change; `script_cwd`, `script_stub_bin`, `script_env`, `project_root` and the assertion block stay byte-equal.
- [x] Each wrapper's program for a case is the old program reformatted into readable code (named helpers, real string literals instead of `\x20` escapes), with the same steps and the same stdout.
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` is ok, after one `--update` if and only if it reported drops limited to flag keys of `-e` cases of this dataset; the baseline diff shows only those keys.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(ship-prepare \((R75|R76|R15|R64|R-plan-commit-subject|R-implicit-resume)\)|ship-(fix-subject|fix-scope|summary|stage-sdlc|fwd|final-check|resume-flags|step-text|lean|bump))"` passes.

**Contract:**
- shape (code): each wrapper:
  ```text
  node tests/promptfoo/scripts/run-ship-prepare-<family>.js --case <name>
  stdout: exactly what the old -e program printed; exit code: exactly the old program's exit code
  usage errors (no --case, a --case name not in the table, an unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  The header lists every case name with the description of the case that uses it. Case vars after the move:
  ```diff
  -    script_path: "-e"
  -    script_args: '((cp,fs,os,js)=>((d)=>…)(require("child_process"),require("fs"),require("os"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/ship.js")'
  +    script_path: "repo://tests/promptfoo/scripts/run-ship-prepare-plan-fields.js"
  +    script_args: "--case bump-feat-minor"
  ```
- names: case-to-wrapper map (the 48 `-e` descriptions at HEAD, in file order):

  | Wrapper | Description families (count) |
  |---|---|
  | `run-ship-prepare-ledger.js` | `ship-prepare (R75)` (2), `ship-prepare (R76)` (2), `ship-prepare (R15)` (3), `ship-prepare (R64)` (8), `ship-prepare (R-implicit-resume)` (2), `ship-resume-flags` (3) |
  | `run-ship-prepare-plan-fields.js` | `ship-prepare (R-plan-commit-subject)` (5), `ship-fix-subject` (2), `ship-fix-scope` (1), `ship-stage-sdlc` (1), `ship-fwd` (3), `ship-bump` (6) |
  | `run-ship-prepare-summary.js` | `ship-summary-commits` (2), `ship-summary-rounds` (1), `ship-summary-file` (1), `ship-summary-unwritable` (1), `ship-final-check` (1), `ship-step-text` (2), `ship-lean` (2) |

  Case names are kebab-case: family plus a short tag (for example `r64-adopt-twice`, `bump-feat-minor`, `summary-file-equal`).
- mirror: `tests/promptfoo/scripts/run-ship-stepper.js:1-90` (header, `--scenario` dispatch, repo-root resolution).
- decisions: Key Decisions (three wrappers, byte-compatible output); a program whose text is read from a SKILL.md or companion (for example `ship-step-text`) keeps reading the same file at run time.
- sync: Task 10 moves these cases into the split files (wave 3).

### Task 10: split ship-prepare-exec.yaml into four datasets
**Ticket:** TK-020 @2999c108

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 2, Task 9
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — keeps the prepare families; new header
- Create: `tests/promptfoo/datasets/ship-state-exec.yaml` — state step and side-effect families
- Create: `tests/promptfoo/datasets/ship-stepper-exec.yaml` — `ship-step:` and `ship-step-text:` families
- Create: `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml` — the other stepper families
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — the `ship-prepare-exec.yaml` line becomes four lines
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — one `--update`
- Modify: `tests/promptfoo/baselines/dataset-asserts-allow.json` — the `verify-side-effect: commit with the HEAD sha → landed:true` entry names `datasets/ship-state-exec.yaml`
- Modify: `tests/promptfoo/datasets/spec-id-coverage-exec.yaml` — case (b) datasets floor `>= 77` becomes `>= 81` (+4: one dataset from Task 2, three from the split), description text too
- Modify: `tests/promptfoo/datasets/dataset-asserts-exec.yaml` — case (a) datasets floor `>= 77` becomes `>= 81` (+4)

**Notes:** Cites F-exec-suite-split-and-wrappers-1, -2, -3, -7, -8. The owner asked for the split as the last step; it runs after every other task that edits this file. Moving whole cases with their comments keeps the ids in comments with their cases.

**Acceptance criteria:**
- [x] The families go to the files in this table; within each file the cases keep their order from the old file:

  | File | Description families (text before the first `:`, ignoring a ` (Rnn)` suffix) |
  |---|---|
  | `ship-prepare-exec.yaml` | `ship-prepare`, `ship-state`, `ship-threshold`, `ship-step-models`, `ship-bump`, `ship-resume-flags`, `ship-fix-subject`, `ship-fix-scope`, `ship-stage-sdlc`, `ship-rr-scope` |
  | `ship-state-exec.yaml` | `pipelineAdvancing`, `ship begin-step`, `ship complete-step`, `ship verify-side-effect`, `verify-side-effect` |
  | `ship-stepper-exec.yaml` | `ship-step`, `ship-step-text` |
  | `ship-stepper-flows-exec.yaml` | `ship-lean`, `ship-resume-plan`, `ship-rr-input`, `ship-summary-commits`, `ship-summary-rounds`, `ship-summary-file`, `ship-summary-unwritable`, `ship-fwd`, `ship-rerun`, `ship-guard`, `ship-stage-fixes`, `ship-strict`, `ship-scope-keep`, `ship-rounds`, `ship-final-check`, `ship-self-commit` |

  A case of a family not in the table (for example one added after planning) stays in `ship-prepare-exec.yaml`.
- [x] Each file starts with a header naming the scripts its cases run and the topics they cover; the old `ship-prepare-exec.yaml:1-4` header (it names `ship-prepare.js`) is replaced.
- [x] No-loss check, run before `--update` and recorded in the task report: the sum of `- description:` counts of the four files equals the old count; the sorted description lists are equal; the sum of assertion lines equals the old count; the sorted union of id tokens over the four files equals the old file's set.
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js --update` is run once; the baseline diff only splits the old `ship-prepare-exec.yaml` entry into four entries whose asserts sum to the old value, and the check then reports ok.
- [x] `node tests/promptfoo/scripts/check-dataset-asserts.js` reports no finding and no stale allowlist entry.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(ship|pipelineAdvancing|verify-side-effect|spec-id-coverage|dataset-asserts)"` passes.

**Contract:**
- shape (code): config change:
  ```diff
  -  - file://datasets/ship-prepare-exec.yaml
  +  - file://datasets/ship-prepare-exec.yaml
  +  - file://datasets/ship-state-exec.yaml
  +  - file://datasets/ship-stepper-exec.yaml
  +  - file://datasets/ship-stepper-flows-exec.yaml
  ```
  Floors after the task (F-104): `spec-id-coverage-exec.yaml` (b) `configs === 2 && datasets >= 81 && cases >= 1641 && asserts >= 2645`; `dataset-asserts-exec.yaml` (a) `datasets >= 81 && cases >= 1641`. The datasets floor counts the exec and hook configs together: 82 at the planning base, 86 after this wave; 81 is the base floor 77 plus the 4 new datasets. Case and assertion floors stay (totals only grow).
- names: D5 file names; description of case (b) becomes `spec-id-coverage: (b) exec floors: 2 configs, at least 81 datasets, 1641 cases and 2645 assertions`.
- mirror: header style of `ship-review-gate-exec.yaml:1-4`.
- decisions: split by family (Key Decisions); keep the old name for the prepare families (Key Decisions).
- sync: Task 11 updates the spec, the site copy and the two comments that name the moved families.

### Task 11: references to the split datasets
**Ticket:** TK-020 @2999c108

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 9
**Verify:** tests

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — acceptance lines of moved families name their new dataset
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy
- Modify: `tests/promptfoo/scripts/pipeline-advancing-test.js` — header comment `:4` names `datasets/ship-state-exec.yaml`
- Modify: `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh` — comment `:4` names the `ship-*-exec.yaml` datasets
- Modify: `docs/skills/ship-sdlc.md` — check only, no change expected (names no dataset)
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (no dataset names)

**Notes:** Cites F-exec-suite-split-and-wrappers-3 (the files that name the dataset) and -7. Uses the family map of Task 10, so it can run beside it; families that stay keep `ship-prepare-exec.yaml`. The eight `check only` paths stay under Files because the spec's copy rule (`plan.copyRules`) requires them; the executor only greps them. At planning, `git grep ship-prepare-exec` found no hit in the user doc, its site copy or the ship-sdlc companions; they are listed only because the spec's copy rule names them.

**Acceptance criteria:**
- [x] In `docs/specs/ship-sdlc.md`, the acceptance lines for `ship begin-step (R69)` / `ship complete-step (R69)` and `pipelineAdvancing` name `tests/promptfoo/datasets/ship-state-exec.yaml`; those for `ship-summary-file`, `ship-summary-commits`, `ship-summary-rounds` (two lines) and `ship-rr-input` name `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml`; every other `ship-prepare-exec.yaml` line is unchanged.
- [x] No requirement id, requirement text or numbering changes; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` passes.
- [x] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` reports no difference (copied with `cp`).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "docs-copies|pipelineAdvancing"` passes.

**Contract:**
- shape (openspec): MODIFY acceptance file names only in `docs/specs/ship-sdlc.md`; no requirement ADD/REMOVE, no numbering change. Example for the R69 line (`:108`):
  ```diff
  -  - Acceptance: exec tests in `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship begin-step (R69): marks execute step in_progress and prints todos JSON`, …
  +  - Acceptance: exec tests in `tests/promptfoo/datasets/ship-state-exec.yaml` — `ship begin-step (R69): marks execute step in_progress and prints todos JSON`, …
  ```
- names: `ship-state-exec.yaml`, `ship-stepper-flows-exec.yaml`.
- mirror: the acceptance line style at `docs/specs/ship-sdlc.md:34`.
- decisions: ids and requirement text unchanged; the two comments name files, not line numbers.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy (`cp`).

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 1, the only plugin-code change, adds a promptfoo case. Tasks 2-7 add or tighten exec cases, and Tasks 9-10 move cases with no assertion lost. |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled; the baseline changes only through a reviewed --update. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs of exec-only configs; full runs are left to the main session; no retry loops. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Tasks map to TK-019, TK-020 and TK-021; exclusions are recorded in Deviations and D1-D5. |
| single-responsibility-tasks | warning | FAIL | Task 7 bundles --commit-waves cases, an --await-review case, commit reject assertions and a header fix across three datasets. |
| scripts-over-llm-logic | error | PASS | Test wrappers and a script fix only; no LLM logic is added to any skill. |
| yagni | warning | PASS | New wrappers cover only the identified cases; the other 179 inline -e programs are explicitly not converted. |
| cross-skill-consistency | error | PASS | Only one of the 15 resolveBranchOrExit callers changes (the others exit on purpose); ship.js:105 is noted as out of scope. |
| pr-link-github-issue | error | PASS | TK and W-F ids are internal register ids, not GitHub issues. |
| dry | warning | PASS | Table-driven wrappers and one shared state-command wrapper avoid duplicated programs. |
| kiss | warning | PASS | Three wrappers and a split by description family are simple. |
| spec-first | error | PASS | No SKILL.md behaviour change; the Task 11 spec edit changes acceptance file names only. |
| project-agnostic | error | PASS | The one plugin fix is generic; the rest are test files of this repo's own suite. |
| flag-coherence-cross-skill | error | PASS | No SKILL.md flag gating is introduced. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate conditions are introduced. |
| flag-resolution-single-source | warning | PASS | No new flag resolution logic. |
| state-premise | error | PASS | The problem is stated in Context: suite gaps, an unreadable 6,178-line dataset with inline -e programs, and wave-split exiting 2. |
| smallest-viable-cut | warning | PASS | Scope cuts are justified in Deviations and Key Decisions D1-D3. |
| failure-audience | warning | PASS | Context 'Who is hurt if this ships wrong?' names execute-plan-sdlc runs using wave-split and the suite maintainers and pre-push gate. |
| explicit-non-goals | warning | PASS | Deviations and D1-D3 list the excluded items: the other -e programs, --migrate --only, --from-wave. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded with rationale in Key Decisions and D1-D5. |
| state-machine-idempotency | error | PASS | No migration, initialization or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is changed. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added to a skill prepare script; wrapper flags (--case, --script, --scenario) are test-only. |
| workspace-mode-compatibility | error | PASS | Task 1 only swaps the branch-resolution call inside an existing best-effort try; test wrappers use SDLC_STATE_DIR_OVERRIDE with temp dirs. |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts or SKILL.md bodies are changed. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 changes plugins/sdlc-utilities/scripts/state/execute.js so `wave-split` without --state-file outside a git repo exits 0 with its result instead of exiting 2.

**Severity hint:** high

**Patch:** Check that the wave-split CLI exit-code contract is exit 0 with the result printed when no branch resolves and --state-file is absent, with exit 2 kept for argument errors.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the wave-split CLI exit-code contract is exit 0 with the result printed when no branch resolves and --state-file is absent, with exit 2 kept for argument errors.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 10 creates and splits datasets such as tests/promptfoo/datasets/ship-state-exec.yaml, and the plan's many .yaml dataset paths match no code-quality trigger (patch: add trigger `**/*.yaml`).

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 1 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 4 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 TK-019 A1: each real coverage gap has an exec case that fails when the behaviour breaks | Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 | covered |
| 2 TK-019 A2: the exec suite passes | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 10 | covered |
| 3 TK-020 A1: ship-prepare-exec.yaml split last, -e programs to wrappers, nothing lost | Task 9, Task 10, Task 11 | covered |
| 4 TK-020 A2: dataset headers and descriptions match their cases | Task 7, Task 8, Task 10 | covered |
| 5 TK-021 A1: wave-split without --state-file outside a git repo does not exit 2 | Task 1 | covered |
| 6 TK-021 A2: an exec case covers it | Task 1 | covered |
| 7 Plan rules (Ticket lines, Source, commit header, no register edits, no behavioural runs, verbatim exec command, floors, exit 2 usage errors) | Task 1, Task 2, Task 4, Task 9, Task 10 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

- `state/execute.js wave-split` prints its split even when no branch can be found, and an exec case proves it.

- The exec suite has new cases for:
  - the state commands `wave-fail`, `task-fail`, `skip`, `fail`, `decide` and `defer`, through one new wrapper and one new dataset;
  - the review scopes `--staged`, `--working`, `--worktree` and `--set-default`, and the `--base` conflict;
  - six jira cache flags;
  - `setup --scan-prs`;
  - seven version error paths;
  - `execute --commit-waves` from the CLI and the `ship --await-review` rejection.

- The commit type and scope reject cases also check the exit code and the rejected value.

- `ship-prepare-exec.yaml` is now four datasets (prepare, state, stepper, stepper flows). None of them uses an inline `-e` program. The programs live in three readable wrapper scripts.

- Seven stale dataset headers name the real scripts.

- The coverage baseline, the allowlist, the floors, the config, the ship spec and its site copy all name the new files. The coverage gate passes.

## OpenSpec Appendix

Not applicable — no OpenSpec change
