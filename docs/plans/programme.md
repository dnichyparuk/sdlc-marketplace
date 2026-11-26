# sdlc-marketplace programme

The waves after lean-w37, in order: H2, B, D1, D2, F, the six END fix waves E1 to E6 (keys `W-E1` to `W-E6`), then the END gate. Each `##` section is the brief of one wave (unit) of `docs/plans/register.json`.

| Kind of status | Lives in |
| --- | --- |
| Waves: order, dependencies, status, PR | `docs/plans/register.json`, shown in `docs/plans/README.md` (generated) |
| Work items | `docs/tickets/`; their state is computed by `node scripts/plan-register.mjs tickets status` |
| Scope and schedule of a wave | its section below |
| Progress | the boxes of the wave's registered executable plan |
| Decisions | `docs/plans/decisions.md` |
| Deferred review lows | `docs/TODO/lows-<wave>.md`, homed to the fix wave that holds the rows, or to `W-END` when a note spans waves (PD-1, PD-2) |
| History of lean-w1 to lean-w38 | the lean ledger |

## W-H2: Suite speed infrastructure, pre-push tier and per-round review findings

Scope (wave order, 2026-11-19): "H2: #9425 + pre-push tier + #9462 (per-round review findings in review-summary) (default -j 1; -j 4 trial owner-only). If the pre-push tier is Complex and H2 would reach 3 Complex, move it to F."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-001, TK-002, TK-003 | `2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier` | default -j 1; -j 4 trial owner-only |

## W-B: Suite false passes and the guardrail table re-splice

Scope (wave order, 2026-11-19): "B: #9424+#9440+#9441 + #9453 (~11 tasks / 0 Complex; lean-w34 lows moved to END, owner 2026-11-19). After H2."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-004, TK-005, TK-006, TK-007 | `2026-11-19-w-b-suite-false-passes-and-the-guardrail` | ~11 tasks, 0 Complex |

## W-D1: Suite reduction

Scope (wave order, 2026-11-19): "D1: #9426 reduction (~8 tasks; lean-w35 lows moved to END). After B."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-008 | `2026-11-19-w-d1-suite-reduction` | ~8 tasks |

## W-D2: Ship, execute and plan follow-ups

Scope (wave order, 2026-11-19): "D2: #9445, #9446, #9449, #9451, #9452 (+#9456 doc-only), #9454, #9455, #9458 (+ship-sdlc state-location sentence), #9450 (exact-name match in lib/state.js :176/:260 + branch check on read; slug format unchanged) (~10 tasks / <=2 Complex; lean-w36 lows moved to END). After D1."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-009, TK-010, TK-011, TK-012, TK-013, TK-014 | `2026-11-20-w-d2-ship-execute-and-plan-follow-ups` | ~10 tasks, at most 2 Complex (M1 and M2 together) |
| M2 | TK-015, TK-016, TK-017, TK-018 | `2026-11-20-w-d2-ship-execute-and-plan-follow-ups` | same wave as M1 |

## W-F: Suite coverage gaps, tiers and structure

Scope (wave order, 2026-11-19): "F: #9428 + #9427 without the pre-push tier; the ship-prepare-exec.yaml split last. After D2." #9463 (no wave named in the todo) is scheduled here (wave L planner, 2026-11-19).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-019, TK-020, TK-021 | `2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure` | ship-prepare-exec.yaml split last |

## W-E1: Plugin contract and script fixes

Scope (END audit result, owner delegation 2026-11-21; 6 tasks, one Complex). Key `W-E1` stands for the fix wave "END1": the key pattern of the register allows one letter and one digit. After W-F.

- (a) R76 rerun-lanes coherence: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md:76` against `:105`, `:108` and `:110` (the no-agent-tool fallback merge hard-codes `--lanes ""` and always passes `--carry`; a re-run lane that still blocks must block the iteration); `docs/specs/plan-sdlc.md` R75 (`:86`) does not name the R76 rerun lanes; `agents/plan-critique-orchestrator.md:41` (inline command, the sibling uses a bash block) and `:104` (two overlapping `--lanes` descriptions).
- (b) D1: the agents `ship-step-review.md`, `ship-step-received-review.md` and `ship-step-version.md` (line 11 of each) contradict `skills/review-sdlc/SKILL.md:20`, `skills/received-review-sdlc/SKILL.md:132` and `skills/version-sdlc/SKILL.md:39` on the plugin-root rule. Also the w36 rows: `agents/ship-step-received-review.md:21` and `skills/received-review-sdlc/SKILL.md:612` (titles never recorded). Probable defect: the agent file asks for a deferred count but the Step report at `SKILL.md:608-614` has no deferred line. Conditional: the row is NOT RECOVERED if the defect is not confirmed at plan time.
- (c) `plugins/sdlc-utilities/scripts/skill/plan.js:489`: `--no-guardrails` skips the R67(f) readable-directory check for `--critique-dir` (also `plan.js:490`, `docs/specs/plan-sdlc.md:215`; the appendix row at `:413` omits E9); add a plan-splice case.
- (d) F-177: the execute wave-runner reports a false FAILED or TIMEOUT (investigation; Complex).
- (e) `ship.js:526` `computeSteps(flags,flagSources, {` spacing (also reported at `:524` and `:535`; re-check at plan time).
- (f) `skills/pr-sdlc/SKILL.md:456`: the placeholders `pr.footer` and `<BODY_FILE>` are not in code spans.

## W-E2: Spec, doc and test traceability

Scope (END audit result, owner delegation 2026-11-21; 9 tasks, mostly trivial). Key `W-E2` stands for the fix wave "END2". After W-F. New cases are written as `repo://` scripts, not as `-e` programs.

- D3, R78 and D10: spec acceptance lines name cases that exist only as `# from:` comments (`docs/specs/received-review-sdlc.md:99` `rr-plan:`, `ship-sdlc.md:206` `ship-nostash:`, `ship-sdlc.md:250` R107 `ship-fix-scope: (b)`, `commit-sdlc.md:65` `commit-subject: (d)`, `ship-sdlc.md:246` R78 case (a)); the header of `tests/promptfoo/scripts/run-ship-prepare-summary.js:4` names the wrong dataset (the cases are in `ship-stepper-exec.yaml` and `ship-stepper-flows-exec.yaml`; the header of `run-ship-prepare-plan-fields.js:4` is only incomplete).
- D4: `jira-sdlc-exec.yaml:615-621`: the `--cache-dir` case cannot fail (use a cache dir outside HOME and assert `cachePath`).
- D5: R77 has no g17Findings test (`fixtures-fs/plan-splice-latest/iter-1/merged.json`); the R37 case checks only the parseArgs roots (`received-review-prepare-exec.yaml:188-197`); the R109 write at final-check-open has no case (`ship.js:2823`).
- D8 and P11: `docs/specs/review-sdlc.md:134` `findings: []` is untested (`review-consolidate-exec.yaml:58-67`); the wording "sorted as in the comment" against `review-consolidate.js:436` and `:398`.
- R110 (decision PD-2): add one sentence to the "Accepted gaps" of `docs/specs/ship-sdlc.md` R110: the marker read-modify-write of `subagent-track.js` has no lock, two step agents that start or stop at the same moment can lose an update (a lost stop keeps the hook quiet up to the 2-hour limit; a lost start gives the behaviour from before R110); this race is accepted. Copy the spec to its site copy.
- R106: the filter text is missing from `docs/specs/ship-sdlc.md:247` (`ship.js:1863-1868`).
- D6 and D7: `tests/promptfoo/README.md:63` (the hooks config uses `providers/hook-runner.js`) and `:73` (`hook-runner.js` does not copy HOME).
- R38 is missing from `docs/skills/received-review-sdlc.md`; `execute-plan-sdlc` `SKILL.md:649` "few-waves" label against `:658`.
- Optional low item: planner hint at `plan-sdlc` `SKILL.md:225` (a task that edits `docs/specs/{skill}.md` lists the four copies as check-only Files).

## W-E3: Test-tooling hygiene

Scope (END audit result, owner delegation 2026-11-21; 6 tasks). Key `W-E3` stands for the fix wave "END3". After W-F.

- `mutation-smoke.js`: verify the mutation applied (`:176`); expected-survivor semantics (`:62`, `:190`) so `--run` can report ok; `path.join` temp path (`:165`); the unknown `--only` path is unreachable (`:164` against `:210-212`).
- Temp-dir hygiene: `run-ship-prepare-plan-fields.js:109-114` `inTempDir` leak; `run-jira-cache.js:54-99`.
- Lint error handling: `check-dataset-asserts.js:175` bare `JSON.parse`; `check-spec-id-coverage.js:73` `readFileSync` without a guard.
- `tests/promptfoo/scripts/gh-inprocess.js` (`spawnSync(cmd, options)` form `:44`, `answer()` throw `:47`) and `run-fixture-memo.js` (`:59` `Promise.all` against `allSettled`; cleanup `:178`).
- A shared plugin.json version read in `run-review-plugin-version.js:34-36` and `run-received-review-manifest-fields.js:63-64`, with a guarded parse.
- Trivial batch: `run-ship-prepare-ledger.js:63` exit 2; `fixtures-fs/version-no-tags/setup.sh:10` and `version-invalid-semver/setup.sh:10` write the deprecated `.claude/sdlc.json` (move to `.sdlc/config.json`).

## W-E4: `-e` programs to wrappers, batch A

Scope (owner decision 2026-11-21): convert 99 inline `script_path: "-e"` programs to wrapper scripts: github-sdlc 29, ship-hooks 24, commit-prepare 23, received-review-prepare 23. Key `W-E4` stands for the fix wave "END4". After W-E2 and W-E3 (the wrappers may share helpers). Details and acceptance: `docs/TODO/end-e-programs-to-wrappers.md`.

## W-E5: `-e` programs to wrappers, batch B

Scope (owner decision 2026-11-21): convert 80 inline `script_path: "-e"` programs: plan-prepare 21, plan-format 17, review-prepare 9, state-gc 7, pr-prepare 6 and the nine small datasets (20). Key `W-E5` stands for the fix wave "END5". After W-E4. Details and acceptance: `docs/TODO/end-e-programs-to-wrappers.md`.

## W-E6: Final lows fix wave

Scope (owner 2026-11-22, "dispatch one more low-fi wave to clean up them"; architect report section 4, items A1 to A4; decision PD-4): fix the seven still-present lows. Light wave, no spec edit. Key `W-E6` stands for the fix wave "END6". After W-E5.

- A1 (lean-w45:11): in `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md:103-105` and `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:390` keep the 60 s `--timeout` cap and replace the stale reason with the same text in both places (the call returns soon when a listed worker returns during the call without writing its `reporting` phase); remove "a marker a returned worker never wrote". Implements R92, no behaviour change.
- A2 (lean-w45:8): in `docs/skills/received-review-sdlc.md:250-253` and `site/src/content-source/skills/received-review-sdlc.md` (same lines, files stay byte-identical) add the K and D lines so the example matches `received-review-sdlc/SKILL.md:553-558`. Docs only.
- A3 (lean-w45:10): in `plugins/sdlc-utilities/scripts/skill/plan.js:489-490` read the critique dir once (the `--no-guardrails` branch keeps the R67(f) usage-error behaviour).
- A4 (lean-w45:12, lean-w48:8, :9, :10), tests only: (a) `tests/promptfoo/scripts/run-script-resolution-case.js` and `datasets/sdlc-script-resolution-exec.yaml:196-205`: count the phrase "use that path wherever the skill substitutes `<PLUGIN_ROOT>`" in the six step agents and assert `c=[1,1,1,1,1,1]`; (b) `tests/promptfoo/scripts/run-commit-prepare-case.js:98-100` `prepare()`: when `r.error` is set or stdout is empty, throw with stderr and status; (c) `tests/promptfoo/scripts/run-ship-hooks-case.js:348-354`: remove the `nogit-` temp dir in a try/finally; (d) `tests/promptfoo/datasets/ship-hooks-exec.yaml:558-565`: reword the stale comment (the write and the spawn happen inside `claimCase`; do not move the write out of it).

Verification is exec-only. Release: a patch bump. Details: PD-4 and `docs/TODO/lows-lean-w45.md`, `docs/TODO/lows-lean-w48.md`.

## W-E7: Guardrail table re-run fix

Scope (owner 2026-11-22, "run one more plugin fix wave"; decision PD-6): fix F-141 only, ticket TK-022. Light wave, patch bump, exec-only verification. Key `W-E7` stands for the fix wave "END7". After W-END (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-022 | `2026-11-22-w-e7-guardrail-table-re-run-fix` | 1 light wave, about 3 tasks |

## W-E8: Ship skill tool-handling and copy rules fix

Scope (owner 2026-11-22, "define one more fix wave to address remaining findings and defects", then "accepted"; decision PD-7): three tickets. Ship reads the empty mktemp file before Write (F-193); ship guards TodoWrite and loads a deferred Monitor (F-194); the plan copy rules require the site byte copies (F-179). Light wave, patch bump, exec-only verification. Key `W-E8` stands for the fix wave "END8". After W-E7 (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-023, TK-024, TK-025 | `2026-11-22-w-e8-ship-skill-tool-handling-and-copy` | 1 light wave, about 3 tasks |

## W-E9: Audit follow-up doc fixes

Scope (owner 2026-11-22; decision PD-8): three doc and spec fixes from the post-merge audit lows. The ship-sdlc doc words the deferred Monitor rule like the spec and SKILL.md (F-196); the ship-sdlc spec gets the R92 and P-STEP-2 Acceptance lines and SKILL.md:278 cites P-STEP-2 (F-197); `docs/cost-tiers.md` gets the 60 s `--timeout` row of the wave wait tuning table (F-198). Doc and spec text only, no behaviour change. Light wave, patch bump, exec-only verification. Key `W-E9` stands for the fix wave "END9". After W-E8 (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-026, TK-027, TK-028 | `2026-11-22-w-e9-audit-follow-up-doc-fixes` | 1 light wave, about 3 tasks |

## W-F1: pr-sdlc explicit gh refs and plan-critique lane constant

Scope (owner 2026-11-22, "collect proposed items into a wave and dispatch"; decision PD-9): three small plugin fixes. pr-sdlc passes the resolved base branch and the current branch explicitly to `gh pr create` and `gh pr edit`, so a run from the main checkout neither fails with head equal to base nor opens a PR for the wrong branch (F-195; new requirement in `docs/specs/pr-sdlc.md`, sentinel script and exec cases); `plan-critique.js` names the `guardrail-compliance` rerun lane in a constant, no behaviour change (deferred low of lean-w51); ship-sdlc SKILL.md item 3 of the TodoWrite guard cites `R-todowrite-visibility` (optional low of W-E8). F-183 is left out (owner decision pending; its own later wave). Light wave, patch bump, exec-only verification. Key `W-F1` stands for the fix wave "F1". After W-E9 (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-029, TK-030, TK-031 | `2026-11-22-w-f1-pr-sdlc-explicit-gh-refs-and` | 1 light wave, about 3 tasks |

## W-F2: pr-gh-refs review lows cleanup

Scope (owner 2026-11-25, "wrap remaining lows onto a wave and kick it off"; decision PD-10): two lows left open by the W-F1 review, both from the TODO note `pr-gh-refs-review-lows` (archived, promoted). BG-001: the sentinel script `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` (lines 12-13) has an empty if-branch; restructure the argument handling with no behaviour change, the `pr-gh-refs:` exec cases still pass 2 of 2. TK-032: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:531` names `baseBranch` in the update-mode quoting rule, but the only command there has no such placeholder; remove it from that sentence. The note's third item (usage error exits 2, not 1) is dropped: exit 2 is a documented convention (W-E3 plan lines 78 and 98; rule F-151). Light wave, patch bump, exec-only verification. After W-F1 (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | BG-001, TK-032 | `2026-11-25-w-f2-pr-gh-refs-review-lows-cleanup` | 1 light wave, about 2 tasks |

## W-F3: post-tool-validate false reports on non-plan files

Scope (owner 2026-11-26, "create tickets and put them into the plan"; decision PD-11): finding F-5 of the lift-fixed-price lean ledger, from the TODO note `post-tool-validate-non-plan-files` (archived, promoted). BG-002: `hooks/post-tool-validate.js:66` validates every `plans/*.md` as a plan, so the programme README, decision logs, briefs and guidelines report PF1, PF2 and PF6 after each Edit; the validator gets `--if-plan` (exit 0 with no output when neither task parser sees a `### Task N:` heading) and the hook passes it. BG-003: PF5 (`validate-plan-format.js:367`) counts only `- [ ]`, so every executed or archived plan fails; count ticked items too. Exec cases in `post-tool-validate-exec.yaml` and the validator dataset; spec wording in docs/specs/plan-sdlc.md (CI validation contract). Light wave, patch bump, exec-only verification. After W-F2 (Done).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | BG-002, BG-003 | | 1 light wave, about 2 tasks |

## W-END: Programme post-merge audit

> END (owner 2026-11-19, 'accepted with optimisations'): after F, ONE post-merge audit of the programme; its brief carries, as context, every deferred low of every wave (`ledger.js backlog` + review-archive texts, incl. the placement architect's file:line list for lean-w34/w35/w36: plan-critique-orchestrator.md :41/:104, spec R75 rerun lanes, ship.js:526, pr-sdlc SKILL.md:456; mutation-smoke.js :164/:165/:172/:187, check-dataset-asserts.js:175, check-spec-id-coverage.js:73; ship-step-received-review.md:21, received-review SKILL.md:612) plus #9450's wider prefix-match note. Confirmed defects and still-present lows go to the fix waves W-E1 to W-E5 (END audit result, 2026-11-21); the gate then re-checks them and closes the programme. No low becomes a wave before END; new lows from H1..F also accumulate in the backlog.

> END brief: brief.js audit --prs 110-<F PR> (with --context-file from `plan-register show END --brief` once skill PR A is installed), launch prompt adds 're-check the unmarked rows of the END gate's homed lows notes in full on HEAD: STILL PRESENT / FIXED / NOT A DEFECT with file:line, outside the 15-defect cap; marked rows (PD-3): mechanical check (cited SHA is an ancestor of HEAD, `git show --stat <sha> -- <path>` not empty) plus a spot check of 3 marked rows from different waves, and if one fails re-check every marked row of that wave; NOT A DEFECT marks get the full re-check'.

Homed notes: see the register. The gate depends on W-E1 to W-E6 (W-END depends on W-E6 as well) and closes the programme once they are merged. Decisions PD-1, PD-2, PD-3 and PD-4.
