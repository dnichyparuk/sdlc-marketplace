# W-E5 -e programs to wrappers, batch B Implementation Plan

**Commit:** `test(W-E5): tests - batch B -e programs to wrapper scripts`
**Goal:** Move the last 80 inline `script_path: "-e"` programs of the exec suite (14 datasets) into readable wrapper scripts, with byte-identical output and unchanged assertions, so that no dataset keeps a `-e` case.
**Architecture:** One table-driven wrapper per dataset under `tests/promptfoo/scripts/`, in the shape of the batch A wrapper `run-commit-prepare-case.js` (`--case <name>`, usage errors exit 2). Each converted case changes only `script_path` and `script_args` (fixture-guard also drops its `script_env` program). Ten independent dataset tasks run in one execute wave; a last task refreshes the coverage baseline.
**Source:** docs/plans/programme.md#W-E5
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- 80 exec test cases still run an inline program: `script_path: "-e"` (node runs the text in `script_args` as code).

- The test runner splits `script_args` on whitespace. So each program is one long line with no spaces. It uses escapes such as `\x20` for a space, or hides the code in an environment variable and runs it with `eval`.

- A reviewer cannot read these programs, and a small edit is easy to get wrong.

**What prompted this change now?**

- The owner decided on 2026-11-21 to convert every remaining `-e` program (`docs/TODO/end-e-programs-to-wrappers.md`).

- W-E4 (batch A, PR #135) converted the four largest datasets (99 programs). This wave (W-E5, batch B) converts the rest: 80 programs in 14 datasets.

**What does success look like?**

- No dataset under `tests/promptfoo/datasets/` holds a `script_path: "-e"` case.

- Every converted case keeps its description and its assertion block byte for byte.

- The wrappers print the same stdout as the old programs, so the same assertions pass.

- The coverage check (`check-spec-id-coverage.js`) stays ok after one reviewed baseline update, with case and assertion counts unchanged.

**Who is hurt if this goes wrong?**

- A wrong wrapper fails exec cases in the pre-push hook (three of these datasets are in the fast tier) and in the main session's full exec run. Later waves are then blocked.

- Worse, a wrapper that prints the expected shape without running the same steps would let a real plugin regression pass silently. So every wrapper case must keep the old program's steps, not only its output.

## Research Findings

Re-verified at HEAD 6b832b7 (the base of this wave; the plan is not made ahead). Finding ids below refer to the discovery brief of this planning run.

- **Counts.** `grep -c 'script_path: "-e"' tests/promptfoo/datasets/*.yaml` gives plan-prepare-exec 21, plan-format-exec 17, review-prepare-exec 9, state-gc-migrate-exec 7, pr-prepare-exec 6, execute-prepare-exec 4, execute-plan-sdlc-overflow-exec 4, script-runner-stub-bin-exec 3, execute-plan-sdlc-context-producer-exec 2, jira-sdlc-exec 2, sdlc-script-resolution-exec 2, fixture-guard-exec 1, review-consolidate-exec 1, session-map-exec 1: 80 in all, equal to the brief. Every other dataset prints 0. No scope item was dropped.

- **Configs.** All 14 datasets run only under `promptfooconfig-exec.yaml` (provider `providers/script-runner.js`); none runs under the hooks config. `plan-format-exec`, `sdlc-script-resolution-exec` and `fixture-guard-exec` are also in `promptfooconfig-exec-fast.yaml`, the pre-push tier (F-e-case-families-per-dataset-1, -2).

- **How a case runs.** `providers/script-runner.js:98` splits `script_args` on `/\s+/`. Lines 105-107: without `script_cwd` the case runs in a fresh temp dir. `{{repo_root}}` and `{{project_root}}` are replaced as text before the run (promptfoo var templating), so a whitespace-free `script_args` token can still carry `{{project_root}}`.

- **Working directory per case** (F-e-case-families-per-dataset-6..27). Most cases set `script_cwd: "{{project_root}}"`, so the wrapper uses `process.cwd()` as the old program did. Eight cases use `{{project_root}}` inside the program but set no `script_cwd`: the six `plan-splice:` cases (plan-prepare-exec.yaml lines 1451-1560), `verify-completeness: (R94) --final …` (execute-plan-sdlc-overflow-exec.yaml line 223) and `review-consolidate: comment copy beside the summary` (review-consolidate-exec.yaml line 138). The other cases without `script_cwd` (plan-tier, skill-text counters, review-glob-brace, the stub-bin and script_home probes) need no fixture.

- **No case tests `-e` itself** (F-special-e-cases-runner-guards-1..16). The three `script-runner-stub-bin-exec` cases test the runner's `script_stub_bin` and `script_home` handling; a wrapper gives the same stdout if it finds `gh` by PATH and does not change directory. `run-script-runner-exit.js` spawns `-e` as a provider probe; it is not a dataset case and stays. `check-fixture-guard.js` scans fixture `setup.sh` files only.

- **fixture-guard special case.** Its one `-e` case runs `eval(process.env.FAST_TIER_GUARD) -- {{repo_root}}` with the program in `script_env` (fixture-guard-exec.yaml lines 96-130). The program reads the repo root from `process.argv[1]`. The wrapper takes the root from its own path instead, and the `script_env` key goes away.

- **pr-prepare #9205 case.** `pr.js --validate-body: no --file and an open stdin pipe …` (pr-prepare-exec.yaml line 211) spawns `pr.js` asynchronously with its stdin pipe held open and prints when the child exits. The wrapper must keep that async spawn; a `spawnSync` would close stdin and test nothing.

- **Wrapper precedent.** Batch A: `tests/promptfoo/scripts/run-commit-prepare-case.js` (328 lines). Shape: shebang, header that maps each case name to its description, `'use strict'`, `usage()` that exits 2 (lines 51-55), a repo-root walk-up from `__dirname` (lines 57-70), a `CASES` table (line 145) and `parseCase` (lines 315-328). `run-execute-cleanup-verify.js` lines 29-32 are the precedent for a `--fixture <dir>` argument. No shared helper module exists; none is added (F-e-case-families-per-dataset-30). No new wrapper name collides with an existing file in `tests/promptfoo/scripts/`.

- **Count and floor checks** (F-dataset-scanning-checks-baseline-1..10). `node tests/promptfoo/scripts/check-spec-id-coverage.js` prints `{"ok":true,"configs":2,"datasets":86,"cases":1717,"asserts":2775,"ids":400,"flags":594,"drops":[]}` at HEAD. The baseline holds no `-e --<flag>` key any more (W-E4 removed them), so this wave drops none. The new `run-<x>.js --case` and `--fixture` keys are additions, pinned by one `--update`. `check-dataset-asserts.js` keys its allowlist by `[rule, dataset, description]`, so descriptions and `script_capture_stderr` stay unchanged. `check-dataset-regex.js`, `check-fixture-refs.js` and `check-fixture-guard.js` do not scan exec dataset programs. `mutation-smoke.js` matches descriptions only (`wave-committed` in state-gc-migrate). The fast-tier guard needs `fastCount >= 12` (fixture-guard-exec.yaml line 135); no fast-tier case is added or removed.

- **Shared scripts and fixtures (F-160 scan).** No plugin script, provider, transform or existing wrapper changes: every wrapper is a new file. So no dataset outside this batch inherits a change. Fixture directories shared with other datasets (`plan-prepare-github-remote`, `project-plan-compact-lightweight`, `project-valid-plan`, `github-sdlc-home`, `project-commit-no-config`, `execute-state-mid-wave`, `session-cost`) must not be mutated by a wrapper. The old programs write only to temp dirs or to the per-case fixture copy, and the wrappers do the same (F-shared-scripts-and-comment-text-asserts-12, -14). The scan the plan names: after each task, `git grep -l <wrapper file name> -- tests` lists only that task's dataset.

- **Comments that describe the old mechanism** (F-shared-scripts-and-comment-text-asserts-1..3). `pr-prepare-exec.yaml` lines 6-7 ("no child an -e case spawns"), lines 209-210 ("The program keeps the child's stdin open"), and `fixture-guard-exec.yaml` line 96 ("The -e script reads both configs … argv: -- <repo root>"). Also `ship-stepper-flows-exec.yaml` line 1602 ("The -e script seeds a ledger"), already stale: its case runs `run-ship-prepare-summary.js` since W-F. Other comments in these datasets (script-runner-stub-bin-exec 21-24, 45, 130-131, 148; jira-sdlc-exec 94; plan-prepare-exec 1095; context-producer 18-29) describe runner facts that stay true.

- **Fragment grep for the reworded comments.** `git grep -nF` over `tests`, `plugins` and live `docs` for `no child an -e case`, `child an -e`, `an~-e~case`, `an\x20-e\x20case`, `keeps the child`, `child's stdin`, `The -e script`, `reads both configs as text`, `both~configs`, `both\x20configs`, `FAST_TIER_GUARD`, `argv: -- <repo root>` finds them only in the two datasets above, `ship-stepper-flows-exec.yaml` line 1602 and old plans under `docs/plans/`. No test or check script asserts them (F-shared-scripts-and-comment-text-asserts-17).

- **Filter patterns.** Each task's `--filter-pattern` was tested with a script against every description of the full exec config: it matches all `-e` descriptions of its datasets (0 misses over all 80). Some patterns also match a few non-`-e` cases (plan-state-cleanup-exec for Task 1, sdlc-dimensions-exec for Task 3); those cases are unaffected and simply run too.

- **Test commands.** Targeted exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. `-j 1` is required (parallel runs hit EISDIR).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| fixture-guard case vars | no | removes the `FAST_TIER_GUARD` key from `script_env` of its one case, besides `script_path` and `script_args` | the program moves into the wrapper; the env key would be dead text (same as the W-E4 harness keys) |
| Cases that use `{{project_root}}` without `script_cwd` | no | pass the path as a `--fixture {{project_root}}` token in `script_args` | the wrapper sees no templating; the token keeps the exact path the old program used and the case's other vars unchanged |
| Wrapper count | no | one wrapper per dataset (14 new files) | each dataset is one family of one skill; matches W-E4 D1; tasks pair small datasets so each task has at most 5 files |
| Shared helper module | no | none | the wrappers share almost no code (different scripts and fixtures); a module would be a speculative abstraction (yagni, kiss) |
| Stale comment in ship-stepper-flows-exec.yaml line 1602 | no | rewords it in Task 10 | it describes the old `-e` mechanism (F-185); one comment line, no case change |
| Version bump, CHANGELOG | no | not in the plan | ship's version step makes them |
| Byte-identical proof | no | the targeted exec run with unchanged assertions is the proof, as in W-E4 | the old programs depend on runner substitution; an old-versus-new diff tool would be throw-away work |
| TODO note closure, register | no | not in the plan | the main session's planning PR closes `docs/TODO/end-e-programs-to-wrappers.md` and the unit |

## Key Decisions

- **One wrapper per dataset.** Each dataset is one family of one skill. One file per dataset keeps each wrapper small and gives each shared file to one task (F-43). Small datasets are paired two per task, so the ten dataset tasks run in one execute wave with no shared file.

- **`--fixture` token for the eight cases without `script_cwd`.** The alternative is to set `script_cwd` on these cases. That would change another var and the case's working dir, which the rule "only script_path and script_args change" forbids. The token keeps everything else equal.

- **Readable steps, same steps.** Each wrapper case is the old program reformatted into named code with real string literals (no `\x20`/`\x22` escapes). It keeps the same spawns, files and print call (`console.log` versus `process.stdout.write`), so stdout stays byte-identical.

- **Programs that read skill text keep doing so.** The skill-text counters (plan-prepare, execute-prepare #9241, overflow skill-text, jira A6 C16, script-resolution) read the same SKILL.md, agent and companion files at run time; nothing is inlined.

- **The baseline update is its own last task.** All ten dataset tasks add flag keys to the same baseline file. One final task runs the check after them and runs `--update` once.

### Decisions taken without the owner

- **D1: wrapper names** `run-plan-prepare-case.js`, `run-plan-format-case.js`, `run-review-prepare-case.js`, `run-state-gc-migrate-case.js`, `run-pr-prepare-case.js`, `run-execute-prepare-case.js`, `run-execute-context-producer-case.js`, `run-execute-overflow-case.js`, `run-jira-sdlc-case.js`, `run-review-consolidate-case.js`, `run-script-resolution-case.js`, `run-session-map-case.js`, `run-script-runner-case.js`, `run-fast-tier-guard.js` (no collision).
- **D2: no shared helper module** (see Deviations).
- **D3: `--fixture {{project_root}}`** for the eight cases without `script_cwd` (see Key Decisions).
- **D4: the `FAST_TIER_GUARD` env key is removed** (see Deviations).
- **D5: the stale ship-stepper-flows comment is reworded** in Task 10 (see Deviations). ship-hooks-exec.yaml lines 562-565 stay untouched (out of scope).

## Contract Examples

Worked example — code (Task 5 shape):

```markdown
**Contract:**
- shape (code): `node tests/promptfoo/scripts/run-pr-prepare-case.js --case <name>`; stdout equal to the old
  program's stdout; exit code equal; usage errors exit 2 with the message on stderr and nothing on stdout.
- names: `run-pr-prepare-case.js`, `CASES`, `parseCase`, case names such as `validate-body-open-stdin`.
- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75 and 315-328.
- decisions: one wrapper per dataset (Key Decisions).
- sync: `tests/promptfoo/datasets/pr-prepare-exec.yaml` points 6 cases at it.
- example: `--case footer-twice` prints `{"first":{…},"second":{…}}`.
```

## Tasks

Common contract for every wrapper of Tasks 1-10 (each task's Contract refers to it as "the common wrapper contract"):

```text
node tests/promptfoo/scripts/<wrapper>.js --case <name> [--fixture <dir>]
stdout: exactly what the old -e program printed (same console.log / process.stdout.write call)
stderr, exit code: as the old program (the old programs end normally, exit 0, unless they set process.exitCode)
usage errors — no --case, --case without a value, an unknown case name, --fixture without a value,
  an unknown flag: exit 2, the message on stderr, nothing on stdout
repo root: walk up from __dirname to the directory holding .claude-plugin/marketplace.json
  ({{repo_root}} in the old program); {{project_root}} with script_cwd set: process.cwd()
```

Case vars after the move (shape of every converted case):

```diff
 - description: "<unchanged>"
   vars:
-    script_path: "-e"
-    script_args: '((cp,fs,…)=>…)(require("child_process"),…,"{{repo_root}}/plugins/…")'
+    script_path: "repo://tests/promptfoo/scripts/<wrapper>.js"
+    script_args: "--case <name>"
     script_cwd: "{{project_root}}"
     project_root: "file://fixtures-fs/<unchanged>"
   assert:
     <unchanged>
```

Every task's acceptance includes `git grep -l <wrapper file name> -- tests` listing only its dataset (the F-160 scan), no description change, and an unchanged `- description:` count and assertion-line count of each touched dataset.

### Task 1: plan-prepare programs to run-plan-prepare-case.js

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-plan-prepare-case.js` — 21 cases: plan.js flag cases, plan-tier, plan-splice, plan-sdlc skill-text counters
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 21 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-6..12. About 12 300 characters of programs, the largest of the batch, hence Complex. The six splice cases share one `run(name, args)` shape: one helper inside the wrapper is fine (it is one dataset's code, not a shared module).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/plan-prepare-exec.yaml` prints `0`.
- [ ] The `- description:` count (110) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_cwd`, `project_root` and the assertion block stay byte-equal.
- [ ] The six `plan-splice:` cases pass `--fixture {{project_root}}` and the wrapper reads `plan.md` and `merged.json` from that dir; temp dirs are removed as before.
- [ ] `node tests/promptfoo/scripts/run-plan-prepare-case.js` and `node tests/promptfoo/scripts/run-plan-prepare-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `node tests/promptfoo/scripts/run-plan-prepare-case.js --case splice-a` (no `--fixture`) exits 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-plan-prepare-case.js -- tests` lists only `tests/promptfoo/datasets/plan-prepare-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-(prepare|tier|splice|sdlc/(tasks-heading|lightweight-sentinels|critique-rounds|audit-w33|rerun-sentinels))"` passes.

**Contract:**
- shape (code): the common wrapper contract. `--fixture` is required by the `splice-*` cases (`--fixture` absent or without a value exits 2, message on stderr, nothing on stdout); another case given `--fixture` ignores it. Splice case vars:
  ```diff
  -    script_path: "-e"
       project_root: "file://fixtures-fs/plan-splice"
  -    script_args: '((cp,fs,d,js,t)=>…)(require("child_process"),require("fs"),"{{project_root}}",…)'
  +    script_path: "repo://tests/promptfoo/scripts/run-plan-prepare-case.js"
  +    script_args: "--case splice-a --fixture {{project_root}}"
  ```
- names: case-to-family map (the 21 `-e` descriptions at HEAD):

  | Description family | Count | Case names |
  |---|---|---|
  | `plan-prepare:` (invalid --quality, quality-alias, lightweight flag, lightweight no explore pack) | 4 | `quality-invalid`, `quality-alias`, `lightweight-flag`, `lightweight-no-explore` |
  | `plan-prepare T4f:` | 1 | `t4f-commit-config` |
  | `plan-tier: (e)` to `(i)` | 5 | `tier-e` … `tier-i` |
  | `plan-sdlc/` tasks-heading, lightweight-sentinels, critique-rounds, audit-w33, rerun-sentinels | 5 | `tasks-heading`, `lightweight-sentinels`, `critique-rounds`, `audit-w33`, `rerun-sentinels` |
  | `plan-splice: (a)` to `(f)` | 6 | `splice-a` … `splice-f` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75 (header, `usage`, repo-root walk-up), line 145 (`CASES`), lines 315-328 (`parseCase`); `tests/promptfoo/scripts/run-execute-cleanup-verify.js` lines 29-32 (`--fixture` shape only; errors per the common wrapper contract).
- decisions: Key Decisions (one wrapper per dataset; `--fixture` token; skill text read at run time); D1, D3.
- sync: Task 11 pins the new baseline keys.

### Task 2: plan-format programs to run-plan-format-case.js

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-plan-format-case.js` — 17 cases: PF11, PF14, PF13, plan-format-compact (b)
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — 17 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-13..15. The 13 PF11/PF14 programs are one program with three parameters (commit config `o`, header line `H`, tail `T`); the wrapper holds that program once plus a table of the parameter sets, which removes the copy-paste. The dataset is in the fast tier, so a mistake shows in pre-push.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/plan-format-exec.yaml` prints `0`.
- [ ] The `- description:` count (45) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_cwd`, `project_root` and the assertion block stay byte-equal.
- [ ] Each PF11/PF14 parameter set (subject pattern, header lines, tail) equals the old program's literal after unescaping (`\x20` to a space; `"x".repeat(48)` kept as code or expanded to the same string).
- [ ] `node tests/promptfoo/scripts/run-plan-format-case.js` and `node tests/promptfoo/scripts/run-plan-format-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-plan-format-case.js -- tests` lists only `tests/promptfoo/datasets/plan-format-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-format(-compact)?:? "` passes.

**Contract:**
- shape (code): the common wrapper contract. The PF11/PF14 cases write `.sdlc/config.json` (`{commit: o}`) and `plans/c.md` (header line inserted after the title, tail appended) in `process.cwd()`, then `process.stdout.write` the stdout of `validate-plan-format.js --project-root <cwd> --file <cwd>/plans/c.md --json`.
  ```diff
  -    script_path: "-e"
  -    script_args: '((cp,fs,path,o,H,T)=>…)(…,{subjectPattern:"^(feat|…)\\(#\\d+\\):\x20.+\x20-\x20.+$"},"**Commit:**\x20`docs(#9242):\x20plan-sdlc\x20-\x20probe\x20subject`","")'
  +    script_path: "repo://tests/promptfoo/scripts/run-plan-format-case.js"
  +    script_args: "--case pf11-valid"
       script_cwd: "{{project_root}}"
       project_root: "file://fixtures-fs/project-valid-plan"
  ```
- names: case-to-family map (the 17 `-e` descriptions at HEAD):

  | Description family | Count | Case names |
  |---|---|---|
  | `plan-format PF11:` | 10 | `pf11-valid`, `pf11-73-chars`, `pf11-dollar`, `pf11-pattern`, `pf11-two-fields`, `pf11-no-backticks`, `pf11-below-header`, `pf11-inner-backtick`, `pf11-double-quote`, `pf11-backslash` |
  | `plan-format: PF14` | 3 | `pf14-valid`, `pf14-73-chars`, `pf14-duplicate` |
  | `plan-format: PF13` | 3 | `pf13-delete-missing`, `pf13-deleted-final`, `pf13-note-missing` |
  | `plan-format-compact: (b)` | 1 | `compact-parse` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328.
- decisions: Key Decisions (one wrapper per dataset; readable steps, same steps); D1.
- sync: Task 11.

### Task 3: review-prepare programs to run-review-prepare-case.js

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-review-prepare-case.js` — 9 cases: dimension-effort, review-cap, review-dimension-globs, review-glob-brace
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — 9 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-16..18. The review-cap cases build N dimension files in the fixture copy (`script_cwd`); the glob cases call a lib export in-process and need no fixture.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/review-prepare-exec.yaml` prints `0`.
- [ ] The `- description:` count (35) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] `node tests/promptfoo/scripts/run-review-prepare-case.js` and `node tests/promptfoo/scripts/run-review-prepare-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-review-prepare-case.js -- tests` lists only `tests/promptfoo/datasets/review-prepare-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(dimension-effort|review-cap|review-dimension-globs|review-glob-brace):"` passes.

**Contract:**
- shape (code): the common wrapper contract.
  ```diff
  -    script_path: "-e"
  -    script_args: '…'
  +    script_path: "repo://tests/promptfoo/scripts/run-review-prepare-case.js"
  +    script_args: "--case cap-10-dimensions"
  ```
- names: case-to-family map (the 9 `-e` descriptions at HEAD):

  | Description family | Count | Case names |
  |---|---|---|
  | `dimension-effort:` | 1 | `effort-forwarded` |
  | `review-cap:` (a), (b), (b2), (c) | 4 | `cap-10-dimensions`, `cap-8-dimensions`, `cap-17-dimensions`, `cap-code-quality-match` |
  | `review-dimension-globs:` | 1 | `globs-runtime-contract` |
  | `review-glob-brace:` | 3 | `brace-js-ts`, `brace-nested`, `brace-unbalanced` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328.
- decisions: Key Decisions (one wrapper per dataset); D1.
- sync: Task 11.

### Task 4: state-gc-migrate programs to run-state-gc-migrate-case.js

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-state-gc-migrate-case.js` — 7 cases: wave-committed, state-exact-branch
- Modify: `tests/promptfoo/datasets/state-gc-migrate-exec.yaml` — 7 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-19 and F-dataset-scanning-checks-baseline-8. `mutation-smoke.js` selects the `wave-committed` cases by description, so descriptions must not change.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/state-gc-migrate-exec.yaml` prints `0`.
- [ ] The `- description:` count (25) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] `node tests/promptfoo/scripts/run-state-gc-migrate-case.js` and `node tests/promptfoo/scripts/run-state-gc-migrate-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-state-gc-migrate-case.js -- tests` lists only `tests/promptfoo/datasets/state-gc-migrate-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(state/execute\.js wave-committed|state-exact-branch:)"` passes.

**Contract:**
- shape (code): the common wrapper contract; the state files are written under `process.cwd()` (the fixture copy), as before.
  ```diff
  -    script_path: "-e"
  -    script_args: '…'
  +    script_path: "repo://tests/promptfoo/scripts/run-state-gc-migrate-case.js"
  +    script_args: "--case wave-committed-sets-sha"
       script_cwd: "{{project_root}}"
  ```
- names: case-to-family map (the 7 `-e` descriptions at HEAD):

  | Description family | Count | Case names |
  |---|---|---|
  | `state/execute.js wave-committed` | 2 | `wave-committed-sets-sha`, `wave-committed-idempotent` |
  | `state-exact-branch:` | 5 | `exact-read`, `exact-slug`, `exact-read-twice`, `exact-prune-twice`, `exact-gc-sweep` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328; `tests/promptfoo/scripts/run-state-command.js` for requiring the state libs.
- decisions: Key Decisions (one wrapper per dataset); D1.
- sync: Task 11.

### Task 5: pr-prepare programs to run-pr-prepare-case.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-pr-prepare-case.js` — 6 cases: validate-body stdin and file, footer
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — 6 `-e` cases point at the wrapper; the comments at lines 6-7 and 209-210 reworded

**Notes:** Cites F-e-case-families-per-dataset-20 and F-shared-scripts-and-comment-text-asserts-1, -2. Risk is Medium because the #9205 case must keep `spawn` with an open stdin pipe and print only on the child's `exit` event; with `spawnSync` the case would pass without testing the fix. The footer cases make their own temp dir and set `SDLC_LINKS_OFFLINE=1` in the child env; keep both.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/pr-prepare-exec.yaml` prints `0`.
- [ ] The `- description:` count (40) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_stub_bin`, `script_cwd`, `project_root`, `script_env` and the assertion block stay byte-equal.
- [ ] The `validate-body-open-stdin` case spawns `pr.js --validate-body --json` with `stdio: ['pipe','pipe','pipe']`, never writes or ends the child's stdin, prints `{code, stderr}` on the child's `exit` event, then destroys stdin.
- [ ] `git grep -nF -- '-e case' tests/promptfoo/datasets/pr-prepare-exec.yaml` and `git grep -nF 'The program keeps' tests/promptfoo/datasets/pr-prepare-exec.yaml` print nothing.
- [ ] `node tests/promptfoo/scripts/run-pr-prepare-case.js` and `node tests/promptfoo/scripts/run-pr-prepare-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-pr-prepare-case.js -- tests` lists only `tests/promptfoo/datasets/pr-prepare-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^pr\.js --validate-body:"` passes.

**Contract:**
- shape (code): the common wrapper contract. The `gh` stub is found by PATH (`script_stub_bin` prepends it), as before.
  ```diff
  -    script_path: "-e"
       script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin"
  -    script_args: '((cp,js)=>((c,e)=>…)(cp.spawn("node",[js,"--validate-body","--json"],{cwd:process.cwd(),stdio:["pipe","pipe","pipe"]}),[]))(…)'
  +    script_path: "repo://tests/promptfoo/scripts/run-pr-prepare-case.js"
  +    script_args: "--case validate-body-open-stdin"
       script_cwd: "{{project_root}}"
  ```
  The `script_path` line may stay in place or move next to `script_args`; key order in the mapping does not matter to YAML or to any check.
- names: case-to-family map (the 6 `-e` descriptions at HEAD):

  | Description | Case name |
  |---|---|
  | `… no --file and an open stdin pipe exits 2 …` | `validate-body-open-stdin` |
  | `… --file - reads the body from stdin` | `validate-body-file-stdin` |
  | `… a --file path that cannot be read exits 2 …` | `validate-body-unreadable` |
  | `… footer (a) appends the configured footer once` | `footer-once` |
  | `… footer (b) a second run appends nothing` | `footer-twice` |
  | `… footer (c) no footer key leaves the body unchanged` | `footer-none` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328.
- decisions: Key Decisions (readable steps, same steps). Comment edits:
  ```diff
   # Every case sets script_stub_bin to the stub gh (fixtures-fs/stub-bin-gh), so no case,
  -# and no child an -e case spawns, reaches the real gh (`gh auth switch` is global state).
  +# and no child that run-pr-prepare-case.js spawns, reaches the real gh (`gh auth switch` is global state).
  ```
  ```diff
  -# #9205: without --file the validator never waits on stdin. The program keeps the child's stdin
  +# #9205: without --file the validator never waits on stdin. The wrapper case keeps the child's stdin
   # open and prints when the child's exit event fires (the producer-side fact); no timer.
  ```
- sync: Task 11.

### Task 6: execute-prepare and context-producer programs to two wrappers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-execute-prepare-case.js` — 4 cases: sel9, sel10, sel11, #9241 skill text
- Create: `tests/promptfoo/scripts/run-execute-context-producer-case.js` — 2 cases: wave-start verification
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — 4 `-e` cases point at the wrapper
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-context-producer-exec.yaml` — 2 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-21, -22. Both datasets belong to execute-plan-sdlc and are small, so one task owns both. The context-producer cases keep their `script_env` (it configures the producer, not the program).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"'` prints `0` for both datasets.
- [ ] The `- description:` counts (61 and 12) and the assertion-line counts are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_cwd`, `project_root`, `script_env` and the assertion block stay byte-equal.
- [ ] Each wrapper, run with no arguments and with `--case nope`, exits 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l` of each wrapper name over `tests` lists only its own dataset (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-(prepare: \((sel9|sel10|sel11|#9241)\)|plan-sdlc/context-producer/wave-start:)"` passes.

**Contract:**
- shape (code): the common wrapper contract, for both wrappers.
  ```diff
  -    script_path: "-e"
  -    script_args: '…'
  +    script_path: "repo://tests/promptfoo/scripts/run-execute-prepare-case.js"
  +    script_args: "--case sel9-resume-selection"
  ```
- names:

  | Dataset | Description family | Case names |
  |---|---|---|
  | execute-prepare | `execute-prepare: (sel9)`, `(sel10)`, `(sel11)`, `(#9241)` | `sel9-resume-selection`, `sel10-invalid-flag`, `sel11-state-init`, `skill-text-9241` |
  | context-producer | `…/wave-start: the fact sheet carries the plan verification verbatim (R89)`, `… a missing plan omits the verification section (R89)` | `wave-start-verification`, `wave-start-no-plan` |

- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328.
- decisions: Key Decisions (one wrapper per dataset; skill text read at run time); D1.
- sync: Task 11.

### Task 7: execute-plan-sdlc-overflow programs to run-execute-overflow-case.js

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-execute-overflow-case.js` — 4 cases: verify-completeness, spec-review, cleanup-verify, skill-text
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — 4 `-e` cases point at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-23. The verify-completeness case (line 223) uses `{{project_root}}` without `script_cwd`, so it takes `--fixture {{project_root}}` (D3). `mutation-smoke.js` selects `wave-split: depth-ceiling` in this dataset, which is not an `-e` case and stays.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` prints `0`.
- [ ] The `- description:` count (44) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] `node tests/promptfoo/scripts/run-execute-overflow-case.js` and `node tests/promptfoo/scripts/run-execute-overflow-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `node tests/promptfoo/scripts/run-execute-overflow-case.js --case verify-completeness-final` (no `--fixture`) exits 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l run-execute-overflow-case.js -- tests` lists only `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/(wave-runner-overflow/(verify-completeness|spec-review|skill-text)|cleanup-verify): \(R94\)"` passes.

**Contract:**
- shape (code): the common wrapper contract; `--fixture` is required by `verify-completeness-final` only (`--fixture` absent or without a value exits 2, message on stderr, nothing on stdout).
  ```diff
  -    script_path: "-e"
  -    script_args: '…"{{project_root}}"…'
  +    script_path: "repo://tests/promptfoo/scripts/run-execute-overflow-case.js"
  +    script_args: "--case verify-completeness-final --fixture {{project_root}}"
  ```
- names: `verify-completeness-final` (line 223), `spec-review-twice` (line 268), `cleanup-verify-kept` (line 278), `skill-text-step-8-bis` (line 427).
- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328; `tests/promptfoo/scripts/run-execute-cleanup-verify.js` lines 29-32 (`--fixture` shape only; errors per the common wrapper contract).
- decisions: Key Decisions; D1, D3.
- sync: Task 11.

### Task 8: jira-sdlc and review-consolidate programs to two wrappers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-jira-sdlc-case.js` — 2 cases: record-occurrence, skill-text A6 C16
- Create: `tests/promptfoo/scripts/run-review-consolidate-case.js` — 1 case: comment copy beside the summary
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — 2 `-e` cases point at the wrapper
- Modify: `tests/promptfoo/datasets/review-consolidate-exec.yaml` — 1 `-e` case points at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-24, -27 and F-dataset-scanning-checks-baseline-6. The review-consolidate case takes `--fixture {{project_root}}` (D3).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"'` prints `0` for both datasets.
- [ ] The `- description:` counts (47 and 12) and the assertion-line counts are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] Each wrapper, run with no arguments and with `--case nope`, exits 2 with the message on stderr and nothing on stdout.
- [ ] `node tests/promptfoo/scripts/run-review-consolidate-case.js --case comment-copy` (no `--fixture`) exits 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l` of each wrapper name over `tests` lists only its own dataset (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(mcp-failure: record-occurrence|jira-sdlc/skill-text A6 C16|review-consolidate: comment copy)"` passes.

**Contract:**
- shape (code): the common wrapper contract; `--fixture` is required by `comment-copy` (`--fixture` absent or without a value exits 2, message on stderr, nothing on stdout).
  ```diff
  -    script_path: "-e"
  -    script_args: '…"{{project_root}}"…'
  +    script_path: "repo://tests/promptfoo/scripts/run-review-consolidate-case.js"
  +    script_args: "--case comment-copy --fixture {{project_root}}"
  ```
- names: `record-occurrence-first` (jira-sdlc-exec.yaml line 224), `skill-text-a6-c16` (line 587); `comment-copy` (review-consolidate-exec.yaml line 138).
- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328; `tests/promptfoo/scripts/run-review-consolidate-twice.js` for spawning `review-consolidate.js`.
- decisions: Key Decisions; D1, D3.
- sync: Task 11.

### Task 9: script-resolution and session-map programs to two wrappers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-script-resolution-case.js` — 2 cases: args-rule, R-subagent-brief
- Create: `tests/promptfoo/scripts/run-session-map-case.js` — 1 case: --map-out map accepted by session-cost.js
- Modify: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — 2 `-e` cases point at the wrapper
- Modify: `tests/promptfoo/datasets/session-map-exec.yaml` — 1 `-e` case points at the wrapper

**Notes:** Cites F-e-case-families-per-dataset-25, -26 and F-special-e-cases-runner-guards-7 (the args-rule program uses absolute `{{repo_root}}` paths, not the cwd; verify once while porting). sdlc-script-resolution is in the fast tier. The session-map case writes `map.json` into the fixture copy (`script_cwd`), as before.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"'` prints `0` for both datasets.
- [ ] The `- description:` counts (15 and 5) and the assertion-line counts are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] Each wrapper, run with no arguments and with `--case nope`, exits 2 with the message on stderr and nothing on stdout.
- [ ] `git grep -l` of each wrapper name over `tests` lists only its own dataset (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(script-resolution: \((args-rule|R-subagent-brief)\)|session-map: \(e\))"` passes.

**Contract:**
- shape (code): the common wrapper contract.
  ```diff
  -    script_path: "-e"
       script_cwd: "{{project_root}}"
       project_root: "file://fixtures-fs/session-map"
  -    script_args: '((cp,fs,f,r)=>{…})(require("child_process"),require("fs"),process.cwd(),"{{repo_root}}")'
  +    script_path: "repo://tests/promptfoo/scripts/run-session-map-case.js"
  +    script_args: "--case map-out-accepted"
  ```
- names: `args-rule-skills` (sdlc-script-resolution-exec.yaml line 6), `subagent-brief-root-line` (line 196); `map-out-accepted` (session-map-exec.yaml line 57).
- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328.
- decisions: Key Decisions (skill text read at run time); D1.
- sync: Task 11.

### Task 10: script-runner and fast-tier guard programs to two wrappers

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-script-runner-case.js` — 3 cases: stub-bin PATH probe, two script_home probes
- Create: `tests/promptfoo/scripts/run-fast-tier-guard.js` — the fast-tier config guard (one case)
- Modify: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — 3 `-e` cases point at the wrapper
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — the `-e` case points at the wrapper; `FAST_TIER_GUARD` env key removed; comment at line 96 reworded
- Modify: `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml` — the stale comment at line 1602 reworded (comment only)

**Notes:** Cites F-special-e-cases-runner-guards-1..16 and F-shared-scripts-and-comment-text-asserts-3. Risk is Medium because these cases test the runner itself (PATH set from `script_stub_bin`, HOME set from `script_home`, the temp cwd), so a wrapper that bypasses the runner's environment would still print plausible output while testing nothing.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"'` prints `0` for script-runner-stub-bin-exec.yaml and fixture-guard-exec.yaml, and `git grep -n FAST_TIER_GUARD -- tests ':!tests/promptfoo/scripts/run-fast-tier-guard.js'` prints nothing.
- [ ] The `- description:` counts (14 and 12) and the assertion-line counts are unchanged, and no description text changes; ship-stepper-flows-exec.yaml changes in its one comment line only.
- [ ] For each moved case only `script_path` and `script_args` change (fixture-guard: also the removed `script_env` block); `script_stub_bin`, `script_home` and the assertion blocks stay byte-equal.
- [ ] `node tests/promptfoo/scripts/run-script-runner-case.js` and `node tests/promptfoo/scripts/run-script-runner-case.js --case nope` each exit 2, and `node tests/promptfoo/scripts/run-fast-tier-guard.js --bad` exits 2, each with the message on stderr and nothing on stdout.
- [ ] `git grep -l` of each wrapper name over `tests` lists only its own dataset (and the wrapper itself).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(script_stub_bin: a relative path|script-runner: an? |fast-tier: every|ship-lean: \(pr testing\))"` passes.

**Contract:**
- shape (code): `run-script-runner-case.js` follows the common wrapper contract, with these case bodies:

  | Case | Body |
  |---|---|
  | `stub-bin-relative` | `console.log(require('child_process').execSync('gh --version').toString())`; `gh` found by PATH (no absolute path); no `process.chdir` |
  | `home-copied` | `fs.writeFileSync(process.env.HOME + '/probe-home.txt', 'x')`, then `console.log(process.env.HOME)` |
  | `home-outside` | `console.log(process.env.HOME)` |

  `run-fast-tier-guard.js` holds the `FAST_TIER_GUARD` body with one change: `dir = path.join(repoRoot, 'tests', 'promptfoo')`, where `repoRoot` comes from the `__dirname` walk-up instead of `process.argv[1]`. It keeps the text-only config parsing (no YAML parser) and the `fastCount >= 12` check. It takes no flags:
  ```text
  node tests/promptfoo/scripts/run-fast-tier-guard.js
  stdout and exit code: exactly as the old FAST_TIER_GUARD program
  any argument: exit 2, the message on stderr, nothing on stdout
  ```
  ```diff
   - description: "fast-tier: every fast-tier dataset is in the full exec config …"
     vars:
  -    script_path: "-e"
  -    script_args: "eval(process.env.FAST_TIER_GUARD) -- {{repo_root}}"
  -    script_env:
  -      FAST_TIER_GUARD: |
  -        const fs = require('fs');
  -        …
  +    script_path: "repo://tests/promptfoo/scripts/run-fast-tier-guard.js"
  ```
- names: `stub-bin-relative` (script-runner-stub-bin-exec.yaml line 46), `home-copied` (line 132), `home-outside` (line 149).
- mirror: `tests/promptfoo/scripts/run-commit-prepare-case.js` lines 1-75, 145 and 315-328; the `FAST_TIER_GUARD` block at fixture-guard-exec.yaml lines 102-130 is the guard body.
- decisions: D1, D4, D5. Comment edits:
  ```diff
  -# The -e script reads both configs as text (no YAML parser). argv: -- <repo root>.
  +# scripts/run-fast-tier-guard.js reads both configs as text (no YAML parser) and finds the repo root from its own path.
  ```
  ```diff
  -# R89: the latest successful execute summary reaches pr as --testing-file. The -e script seeds a ledger whose
  +# R89: the latest successful execute summary reaches pr as --testing-file. The wrapper case seeds a ledger whose
   # steps before pr are completed, records an execute row, then runs `ship.js --after confirm_pipeline`.
  ```
- sync: Task 11.

### Task 11: coverage baseline after the move

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — one `--update` that pins the new wrapper flag keys

**Notes:** All ten dataset tasks add flag keys to this one file, so one task after them owns it (F-43, F-dataset-scanning-checks-baseline-2, -3). The baseline is in sync with a live scan at HEAD, so the `--update` diff must hold only the new `run-*-case.js --case` and `--fixture` keys (run-fast-tier-guard.js has no `script_args`, so it adds none); an unrelated key change is a stop. Case and assertion totals must stay unchanged.

**Acceptance criteria:**
- [ ] Before the update, `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports no drop (`"drops":[]`); if a drop appears, stop and report it instead of updating.
- [ ] After `node tests/promptfoo/scripts/check-spec-id-coverage.js --update`, the check prints `"ok":true` with `datasets` 86, `cases` 1717 and `asserts` 2775 (unchanged against HEAD 6b832b7), and `git diff tests/promptfoo/baselines/spec-id-coverage.json` shows only added or recounted keys, none removed.
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/*.yaml | awk -F: '{s+=$2} END {print s}'` prints `0`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^spec-id-coverage"` passes.

**Contract:** shape (code): baseline JSON regenerated by `check-spec-id-coverage.js --update`; names: `tests/promptfoo/baselines/spec-id-coverage.json` `flags` keys such as `run-plan-prepare-case.js --case` and `run-plan-prepare-case.js --fixture`; sync: Tasks 1-10

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every task changes promptfoo exec datasets and wrappers; assertions stay unchanged and Task 11 refreshes the coverage baseline. |
| no-ci-bypass | error | PASS | No step skips or disables CI checks. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs of the exec config (no LLM provider, relaxed). No full-suite runs and no retry loops. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Stays within the W-E5 requirement. The one stale-comment reword is recorded in Deviations (D5). |
| single-responsibility-tasks | warning | FAIL | Tasks 6, 8, 9 and 10 each bundle two datasets and wrappers. Task 10 also adds an unrelated comment fix in ship-stepper-flows-exec.yaml. |
| scripts-over-llm-logic | error | PASS | Deterministic wrapper scripts replace inline programs. No skill logic is changed. |
| yagni | warning | PASS | No shared helper module (D2). Each wrapper only holds the cases that exist. |
| cross-skill-consistency | error | PASS | All wrappers follow the batch A precedent. Shared fixtures are not mutated and the F-160 scan is stated. |
| pr-link-github-issue | error | PASS | Only the internal W-E5 id is used. No GitHub issue is involved. |
| dry | warning | PASS | The PF11/PF14 programs are deduplicated into one table-driven program. Per-wrapper boilerplate is a stated trade-off (D2). |
| kiss | warning | PASS | One wrapper per dataset, table-driven, no abstractions. |
| spec-first | error | PASS | No SKILL.md behaviour change, so no spec task is needed. |
| project-agnostic | error | PASS | Changes only this repo's own test tooling. No consumer-facing behaviour or repo-local config. |
| flag-coherence-cross-skill | error | PASS | N/A: no skill dispatch and no SKILL.md flag gates. |
| no-opposite-logical-vectors | error | PASS | N/A: no SKILL.md gates are touched. |
| flag-resolution-single-source | warning | PASS | N/A: no contractual skill flags. |
| state-premise | error | PASS | The Context section states the problem: 80 unreadable inline -e programs. |
| smallest-viable-cut | warning | PASS | Scope is the minimum (every remaining -e case). Extras are justified in Deviations and Key Decisions. |
| failure-audience | warning | PASS | 'Who is hurt' names the pre-push hook, the main session's full exec run, and later waves. |
| explicit-non-goals | warning | PASS | Deviations lists exclusions: helper module, version bump, CHANGELOG, TODO closure, ship-hooks comments. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (script_cwd vs --fixture, helper module, one wrapper per dataset) are recorded in Key Decisions and D1-D5. |
| state-machine-idempotency | error | PASS | No migration or preflight logic changes. The existing idempotency cases (wave-committed-idempotent, exact-read-twice, exact-prune-twice) are preserved. |
| agent-dispatch-script-driven | error | PASS | N/A: no agent dispatch is described. |
| flag-semantic-consistency-cross-skill | error | PASS | The new --case and --fixture flags belong to test wrappers, not to user-invoked skill prepare scripts. |
| workspace-mode-compatibility | error | PASS | Test-only wrappers use cwd or fixture paths as the old programs did. No state-dir or config-reader changes. |
| prompt-cache-hit-ratio | warning | PASS | N/A: no dispatched prompts are touched. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Tasks 1-10 convert 15 exec dataset YAMLs (for example `tests/promptfoo/datasets/plan-prepare-exec.yaml`) and Task 11 updates `tests/promptfoo/baselines/spec-id-coverage.json`, none of which the code-quality dimension's triggers cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

### CREATE: tests-review

**Why:** Task 11 modifies `tests/promptfoo/baselines/spec-id-coverage.json` with a reviewed `--update`, and no existing dimension covers that baseline file.

**Severity hint:** low

**Triggers:** `tests/promptfoo/baselines/spec-id-coverage.json`

**Action (dimension):** /setup-sdlc --dimensions — add `tests-review` with triggers `tests/promptfoo/baselines/spec-id-coverage.json`

**Action (Copilot mirror, X1):** regenerate .github/instructions/tests-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Convert the 21 -e cases of plan-prepare-exec.yaml to a wrapper script | Task 1 | covered |
| 2 Convert the 17 -e cases of plan-format-exec.yaml | Task 2 | covered |
| 3 Convert the 9 -e cases of review-prepare-exec.yaml | Task 3 | covered |
| 4 Convert the 7 -e cases of state-gc-migrate-exec.yaml | Task 4 | covered |
| 5 Convert the 6 -e cases of pr-prepare-exec.yaml | Task 5 | covered |
| 6 Convert the 20 -e cases of the nine small datasets | Task 6, Task 7, Task 8, Task 9, Task 10 | covered |
| 7 Wrappers print byte-identical output; descriptions and assertions unchanged; usage errors exit 2 | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10 | covered |
| 8 Reword comments that describe the old inline-program mechanism (not ship-hooks-exec.yaml) | Task 5, Task 10 | covered |
| 9 No coverage loss against baseline; baseline refresh is its own last task; exec suite passes | Task 11 | covered |
| 10 Out of scope: W-END, ship-hooks-exec.yaml comment, planning PR, behaviour or assertion changes | Task 10 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- Fourteen new wrappers live in `tests/promptfoo/scripts/`, one per dataset of batch B.

- Each wrapper is readable code. Its header maps every case name to the dataset description that uses it. A wrong call exits 2 with a message on stderr.

- No dataset under `tests/promptfoo/datasets/` holds a `script_path: "-e"` case. Each converted case names a wrapper and a case (and, for eight cases, the fixture path). Descriptions, fixtures, env values and assertions are unchanged.

- The fixture-guard dataset no longer carries its guard program in `script_env`.

- The coverage baseline lists the wrappers' flag keys. Case and assertion counts are unchanged.

- The TODO note `docs/TODO/end-e-programs-to-wrappers.md` is ready to be closed by the main session's planning PR.

## OpenSpec Appendix

Not applicable — no OpenSpec change
