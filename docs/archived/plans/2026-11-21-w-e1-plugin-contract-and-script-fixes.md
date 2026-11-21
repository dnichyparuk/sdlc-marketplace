# W-E1 Plugin Contract and Script Fixes Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #129, bb344de

**Commit:** `fix(W-E1): plugin - plan critique, step agents and wave wait fixes`
**Goal:**
- Make the plan-sdlc Step 5 no-agent-tool fallback follow R76: a rerun lane that still blocks blocks the iteration, and the E9 path carries nothing.
- Make `plan.js splice --critique-dir` reject an unreadable directory also under `--no-guardrails` (R67 (f)).
- Remove the plugin-root contradiction between three ship step agents and their skills, and give received-review a deferred count line that the ship step agent can report.
- Stop the execute wave wait from reporting a false FAILED/TIMEOUT for a worker that returned (F-177): lock the progress-marker write and wait only on workers that have not returned.
- Fix two lint-level defects: a missing space in `ship.js` and two bare placeholders in pr-sdlc SKILL.md.
**Architecture:** Ten tasks in three execute waves. Spec first: each changed skill gets its spec task in wave 1 (Tasks 1, 4, 6), and the tasks that change prose or code follow in waves 2 and 3. One task owns each shared file per wave: `plan-prepare-exec.yaml` goes to Task 2 then Task 3, and `check-handback-sentinels.js` goes to Task 5 then Task 8. The only Complex task (Task 7) is the marker lock in `lib/wave-progress.js`, a script fix with its own exec case. No register, ticket or TODO file is edited.
**Source:** docs/plans/programme.md#W-E1
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The END audit left six defects in plugin contracts and scripts (unit W-E1 of the plan register). Each one makes a skill, an agent or a script say or do something its spec does not.
- The underlying problem in one sentence: several plugin texts and two scripts drifted from their specs, so an agent or a wave can take the wrong decision (approve a blocked plan iteration, use the wrong plugin root, or mark a finished worker as timed out).

**What prompted this change now?**

- W-F is Done, and the register marks W-E1 Ready (owner delegation of 2026-11-21).
- F-177 (lean-w43) showed a real cost: a false TIMEOUT can trigger needless retries of a finished task.

**What does success look like?**

- Each of the six scope items is fixed or explicitly dropped with evidence.
- Every behaviour change cites a spec id and is pinned by an exec case (a promptfoo test that runs a script, no LLM).
- The six main-session validators stay green.

**Scope items re-verified at HEAD (d36b94b):**

- (a) Confirmed. `review-loop.md:105` hard-codes `--lanes ""` and always passes `--carry`; `:108` and `:110` read only `lens`, so a rerun lane that still blocks cannot block the iteration. `docs/specs/plan-sdlc.md:86` (R75) does not name the rerun lanes. `plan-critique-orchestrator.md:41` is an inline command and `:104` has two overlapping `--lanes` descriptions.
- (b) Confirmed for the plugin-root rule: the three agents (line 11) say "never derive the plugin root from the skill's base directory", while their skills (`review-sdlc/SKILL.md:20`, `received-review-sdlc/SKILL.md:132`, `version-sdlc/SKILL.md:39`) fall back to "the directory two levels above this SKILL.md" and tell the model to ignore other occurrences of the line. Confirmed for the deferred count: `ship-step-received-review.md:21` asks for a deferred count, but no summary of `received-review-sdlc/SKILL.md` (Step 12, `:551-557` and `:608-614`) has a deferred line. Not reproduced: "titles never recorded" at `SKILL.md:612` (the line is the pushback count; the agent asks for no titles). Dropped, see Deviations.
- (c) Confirmed. `plan.js:489` calls `latestGuardrailMerged` only without `--no-guardrails`, so `splice --critique-dir <missing> --no-guardrails` exits 0. The appendix row `docs/specs/plan-sdlc.md:413` omits E9.
- (d) Investigated (not reproducible: the lean-w43 wave-4 transcript is not in the repository). Two code-level causes were found, see Research Findings.
- (e) Confirmed at `ship.js:526` only. `:524` is `}` and `:535` is a comment line; both are stale reports.
- (f) Confirmed. `pr-sdlc/SKILL.md:456` has `pr.footer` and `<BODY_FILE>` outside code spans.

## Research Findings

Discovery brief: `/tmp/sdlc-explore-main-Nqzn7N/discovery-brief.md` (5 code dimensions, 20 findings).

- **plan-sdlc critique (item a):** the orchestrator path already works. `merge-lanes --compact` counts every blocking issue when `--lanes` is non-empty and only lens issues on a lens-only merge (`scripts/skill/plan.js:441`, `scripts/lib/plan-critique.js:826-830`). The fallback path does its own merge and reads only `lens` (F-r76-rerun-lanes-coherence-1). Using the same `--compact` merge in the fallback gives one decision rule for both paths.
- **splice (item c):** the readable-directory check lives inside `latestGuardrailMerged` (`plan-critique.js:918-924`), which `--no-guardrails` skips (F-plan-critique-dir-guardrail-check-1). The exec case `plan-splice: (e)` (`plan-prepare-exec.yaml:1527-1548`) already has a `usage()` helper for this error (F-plan-critique-dir-guardrail-check-2).
- **Step agents (item b):** the task message line comes from ship-sdlc R-subagent-brief (`docs/specs/ship-sdlc.md:405`). No exec case pins the plugin-root sentence; `tests/promptfoo/scripts/check-handback-sentinels.js` already pins other sentences of the six ship step agents (F-ship-agent-plugin-root-rule-1). Ship R106 already stores a `deferred` count per review round (`ship-stepper-flows-exec.yaml:412`, `:433`), so the agent's request is real; the skill just never prints the count (F-ship-agent-plugin-root-rule-2).
- **Wave wait (item d, F-177):** the wave-runner is an LLM prompt (`wave-runner-template.md` §2b); direct mode repeats the same steps in `execute-plan-sdlc/SKILL.md:388-395` (F-wave-runner-false-failed-timeout-2).
  - Cause 1, a lost update: `writeProgress` (`scripts/lib/wave-progress.js:91-118`) reads the marker, adds one task and renames a temp file over it, with no lock. Two workers of one wave that write at the same time can drop each other's `reporting` entry (F-wave-runner-false-failed-timeout-4). `wave-progress --wait` then lists that task in `inFlight` (`scripts/state/execute.js:1353-1385`).
  - Cause 2, ambiguous prose: step 3 says "a returned task ID is in flight while any plan task ID it covers is in `inFlight`". "Returned task ID" means the ID a background dispatch gives back, but it reads like "a task that returned", which contradicts the next sentence ("a returned worker is never a TaskStop or TIMEOUT target"). The wait also lists every plan task of the wave, also those whose worker has already returned (F-wave-runner-false-failed-timeout-3).
  - Lock precedent: `scripts/lib/config-version.js:120-160` (exclusive create with `wx`, `Atomics.wait` sleep, bounded retries).
- **ship.js and pr-sdlc (items e, f):** only the definition line is wrong; call sites are fine. The pr-sdlc spec R21 (`docs/specs/pr-sdlc.md:113`) already uses code spans (F-shipjs-spacing-and-pr-placeholders-1, -3, -4).
- **Test patterns:** exec cases live in `tests/promptfoo/datasets/*-exec.yaml`; a case runs a script (`script_path: repo://...`) and asserts its JSON. Inline `script_path: "-e"` programs are being moved to wrapper scripts by W-E4/W-E5, so this plan adds no new `-e` case and changes no `-e` program count.
- **Copy rule:** `.sdlc/config.json` `plan.copyRules` requires, for each edited `docs/specs/<skill>.md` or skill SKILL.md, the skill doc, its site copy, `site/src/data/skills-meta.ts` and every `skills/<skill>/*.md` companion to be listed. They are listed once each, as `check only, no change expected`, in the spec task of that skill.
- **Commands:** exec runs use the Verification line command with `--filter-pattern`. Specs and docs have byte copies under `site/src/content-source/`; copy with `cp`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| (b) "titles never recorded" row | no | dropped | Not reproduced at HEAD: `received-review-sdlc/SKILL.md:612` is the pushback count line, and the agent asks for counts only, no titles (F-ship-agent-plugin-root-rule-3) |
| (e) `ship.js:524` and `:535` | no | dropped | Stale line reports: `:524` is `}` and `:535` is a comment line; only `:526` is fixed |
| (d) F-177 | no | fixes the two code-level causes found, without a reproduction | The lean-w43 transcript is not in the repository; both causes are real defects on their own |
| (c) new plan-splice case | no | extends case `plan-splice: (e)` with one more run instead of a new case | A new case would add one inline `-e` program to `plan-prepare-exec.yaml`, which W-E5 counts (21) |
| (b) other ship step agents | no | changes only the three named agents | The commit, pr and execute skills have no absent-line fallback; narrowest scope that fixes the reported contradiction |
| Companion files | no | each listed once as `check only, no change expected` | `plan.copyRules` requires every companion to be named; none states a changed rule |

## Key Decisions

1. **The fallback lens merge uses `--compact`.** The choice: run the same `merge-lanes --compact` as the orchestrator and decide the iteration by `lensStatus` and `blockingCount`. The alternative was new prose that reads `issues` from `merged.json`. One rule for both paths wins: it is computed by the script, and it keeps the gate phrasing identical (`no-opposite-logical-vectors`).
2. **The splice check is a shared helper.** `readCritiqueDir(dir)` moves the directory read out of `latestGuardrailMerged` into its own exported function, and `runSplice` calls it before the `--no-guardrails` short-cut. The alternative was a second copy of the error message in `plan.js`. One helper keeps one message (`dry`).
3. **Lock, not per-task files.** The marker write takes an exclusive lock file beside the marker. The alternative was one marker file per task, which changes the R-WAVE-LIVENESS path contract, the readers and the GC fixtures. The lock keeps every reader unchanged.
4. **The lock follows the marker in both workspace modes.** The lock file sits beside the marker, whose path comes from the caller's `stateDir` (`resolveStateDir()`), not from the working directory. Under `ship.workspace` `branch` and `worktree` alike, all workers of a wave share one marker and so one lock. The alternative, a lock per worktree, would not serialise writers from different checkouts.
5. **A stale lock is broken after the lock wait.** A writer that waited `LOCK_WAIT_MS` (2000 ms) removes the lock and takes it. The alternative was to fail the write. The heartbeat is advisory to the worker, so a write that never fails is better; the accepted gap is stated in the spec (F-73).
6. **The wait lists only unreturned workers.** Each `wave-progress --wait` call passes in `--tasks` only the plan task ids whose worker has not returned. The script then never puts a returned worker in `inFlight`. The alternative was more prose telling the model to subtract returned workers; the script-side rule is deterministic (`scripts-over-llm-logic`).
7. **The plugin-root sentence overrides the skill's fallback.** The fix goes into the three agents, not the skills. The skills keep their fallback for a standalone run, where the SessionStart line can be missing.
8. **The deferred count goes into the Step 12 summary.** Item 1 of Step 12 is always shown (also under `--auto` and with no PR), so the count is always in the report the agent reads.

## Decisions taken without the owner

1. Item (b) "titles never recorded" is dropped as not reproduced (the brief's conditional: NOT RECOVERED when not confirmed).
2. Item (c) extends the existing case `plan-splice: (e)` rather than adding a new inline `-e` case (W-E5 count stays 21).
3. Item (d): fix both code-level causes (marker lock, wait on unreturned workers only) without a reproduction of the lean-w43 event.
4. Item (b) changes the three named agents only; the commit, pr and execute agents keep their sentence.
5. New tuning constants `LOCK_WAIT_MS` (2000 ms) and `LOCK_RETRY_MS` (10 ms) are documented in `docs/cost-tiers.md`.

## Contract Examples

**code** (Task 3):

```markdown
**Contract:**
- shape (code): `readCritiqueDir(critiqueDir) -> string[]`, throws `{ code: 'USAGE' }` with `--critique-dir is not a readable directory: <dir>`; `runSplice` calls it first.
- names: `readCritiqueDir`, `latestGuardrailMerged`, `runSplice`.
- mirror: `scripts/lib/plan-critique.js:918-924`.
- decisions: exit 1 (usage error, R67), no stdout, plan file unchanged.
- sync: `docs/specs/plan-sdlc.md` R67 (f) (Task 1).
```

**docs** (Task 5):

```markdown
**Contract:**
- shape (docs): MODIFY line 11 of three agent files; the plugin-root sentence becomes the R-subagent-brief text below.
- names: `sdlc plugin root:`, `<PLUGIN_ROOT>`.
- mirror: `agents/ship-step-review.md:11`.
- decisions: the agent overrides the skill's absent-line fallback.
- sync: byte-identical sentence in the three agents.
```

**openspec / spec** (Task 6):

```markdown
**Contract:**
- shape (openspec): MODIFY `R-WAVE-LIVENESS` and `R92` in `docs/specs/execute-plan-sdlc.md`; no new id.
- names: `R-WAVE-LIVENESS`, `R92`, `LOCK_WAIT_MS`.
- mirror: threat-model sentence style of `docs/specs/plan-sdlc.md` R75.
- decisions: lock file beside the marker; wait lists only unreturned workers.
- sync: `cp` to `site/src/content-source/specs/execute-plan-sdlc.md`.
```

## Tasks

### Task 1: plan-sdlc spec for the rerun lanes and the splice check

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R75 Step 5 dispatch list, R76 fallback sentence, R67 (f) splice sentence, appendix rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec
- Modify: `docs/skills/plan-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/plan-sdlc.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (no skill gains a flag, connection or description change)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected

**Notes:** Cites F-r76-rerun-lanes-coherence-2 and F-plan-critique-dir-guardrail-check-3. Spec first: Tasks 2 and 3 implement these sentences. The user doc describes the fallback only in one sentence ("the author falls back to dispatching the lanes directly"), which stays true.

**Acceptance criteria:**
- [x] R75 names the R76 rerun lanes in its Step 5 dispatch list (text below).
- [x] R76 states the fallback merge rule (text below).
- [x] R67 (f) states that the readable-directory check holds with or without `--no-guardrails`.
- [x] The appendix row `| R67, R74, R77 | guardrail table re-splice, W-B (#9453) |` names E9, and a W-E1 row is appended.
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [x] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.

**Contract:**
- shape (openspec): MODIFY R75, R76, R67 (f) and the appendix of `docs/specs/plan-sdlc.md`; no new id.
- names: `R75`, `R76`, `R67`, `E9`.
- mirror: the W-D2 appendix row `| R67, R74 | rerun lanes kept on a non-material fix, W-D2 (TK-011) |`.
- decisions: R75 (inside "dispatches the lanes and lenses named by the round (…)"):
  ```diff
  - Step 5: `tier.review.lenses`, then `diff-material` `dispatch` after a material fix or its `review.lenses` after a non-material one)
  + Step 5: `tier.review.lenses` plus, at iteration 1, the R76 rerun lanes (`diff-material` `dispatch.lanes`); from iteration 2, `diff-material` `dispatch` after a material fix, or its `review.lenses` plus its `dispatch.lanes` (the R76 rerun lanes) after a non-material one)
  ```
  R76, last sentence:
  ```diff
  - The no-agent-tool fallback in review-loop.md applies the same rule.
  + The no-agent-tool fallback in review-loop.md applies the same rule: its lens merge passes the dispatched rerun lanes as `--lanes`, omits `--carry` on the E9 path, and runs with `--compact`, so the iteration is Approved only when `lensStatus` is `Approved` and `blockingCount` is 0; a rerun lane that still blocks blocks the iteration, as on the orchestrator path.
  ```
  R67 (f):
  ```diff
  - A `--critique-dir` that is not a readable directory is a usage error.
  + A `--critique-dir` that is not a readable directory is a usage error (exit 1), with or without `--no-guardrails`.
  ```
  Appendix:
  ```diff
  - | R67, R74, R77 | guardrail table re-splice, W-B (#9453) |
  + | R67, R74, R77, E9 | guardrail table re-splice, W-B (#9453) |
    | R67, R74 | rerun lanes kept on a non-material fix, W-D2 (TK-011) |
  + | R67, R75, R76 | splice --critique-dir checked under --no-guardrails, rerun lanes in the R75 list and the fallback merge, W-E1 |
  ```
- sync: `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`.

### Task 2: plan-sdlc fallback merge and orchestrator wording follow R76

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — fallback lens merge command and the two paragraphs after it
- Modify: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — iteration-1 command as a bash block; one `--lanes` description
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — assertion of the case `plan-sdlc/rerun-sentinels:` (program unchanged)

**Notes:** Cites F-r76-rerun-lanes-coherence-1, -3 and -4. Only the assertion of the sentinel case changes, so the W-E5 `-e` count stays the same. The literals removed here are asserted by no test (`git grep -F 'reads only \`lens\`' tests` and `git grep -F 'lanes dispatched or written by hand' tests` find nothing); `check-plan-critique-orchestrator.js` pins only words that stay.

**Acceptance criteria:**
- [x] The fallback lens merge in `review-loop.md` is the command below, and the two paragraphs after it read as below.
- [x] The orchestrator Step 2 iteration-1 command is a fenced `bash` block, and its `--lanes` row has one description.
- [x] The case `plan-sdlc/rerun-sentinels:` asserts the new literals and the absence of the old one.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-sdlc/"` passes.

**Contract:**
- shape (docs): `review-loop.md`, under "Merge lens reviewer results (per iteration)":
  ```diff
  - node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" --carry "<critiqueDir>/iter-<k-1>" [--no-guardrails] [--g17-not-run] > "<ITER_DIR>/merged.json"
  + node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "<lanes dispatched in this iteration, comma-separated, or empty>" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" [--carry "<critiqueDir>/iter-<k-1>"] [--no-guardrails] [--g17-not-run] --compact
  ```
  Paragraph after it, replaced:
  ```text
  `--lanes` names the lanes this iteration dispatched (the rerun lanes of **Rerun lanes (R76)** above; empty when there are none). `--carry` copies the previous iteration's results of the lanes and lenses not re-dispatched (`iter-0` at the first iteration) into this one, so a later merged re-dispatch can carry them (R67); pass it in every iteration except on the E9 path of **Rerun lanes (R76)**, where every Step 3 lane was dispatched. Pass `--no-guardrails` exactly as in Step 3, and `--g17-not-run` when g17-prepare exited non-zero earlier in this run (R31). <!-- R76 -->
  ```
  Next paragraph, replaced up to "the recommendations.":
  ```text
  Run it as one plain Bash call; a non-zero exit code in the tool result means stop and invoke `error-report-sdlc`. `--compact` writes `<ITER_DIR>/merged.json` and prints `{ blockingCount, lensStatus, verdict, guardrailErrors, summary }`. Decide the iteration as for the `ok` status above: `lensStatus` `Approved` with `blockingCount` 0 is Approved, otherwise Issues Found with the lines of `summary` as the issues, so a rerun lane that still blocks blocks the iteration (R76). `lens.recommendations` in `merged.json` holds the recommendations. Increment the iteration counter by 1 only after the await barrier above is satisfied (exactly N results collected, N = lanes plus lenses dispatched); never on partial or zero returns. <!-- R36, R-orchestrator-await, R-c1 -->
  ```
  `plan-critique-orchestrator.md` Step 2, first paragraph:
  ````diff
  - When `ROUND` is `step5`, `BEFORE_PLAN` is `none` and `CARRY` is not `none` (iteration 1), run
  - `node "<PLAN_JS>" diff-material --before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>" --prev-dir "<CARRY>"`
  - and dispatch the lenses `DISPATCH` names plus the lanes of its `dispatch.lanes` (the Step 3 lanes whose result blocked; nothing is material). A non-zero exit: dispatch `DISPATCH` plus every lane of `lanes[]`, and pass no `--carry` (E9). <!-- R76 -->
  + When `ROUND` is `step5`, `BEFORE_PLAN` is `none` and `CARRY` is not `none` (iteration 1), run:
  +
  + ```bash
  + node "<PLAN_JS>" diff-material --before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>" --prev-dir "<CARRY>"
  + ```
  +
  + Then dispatch the lenses `DISPATCH` names plus the lanes of its `dispatch.lanes` (the Step 3 lanes whose result blocked; nothing is material). A non-zero exit: dispatch `DISPATCH` plus every lane of `lanes[]`, and pass no `--carry` (E9). <!-- R76 -->
  ````
  Step 6 table row:
  ```diff
  - | `--lanes <csv>` | the lanes dispatched or written by hand (dimension-coverage `{"candidates":[]}` when skipped for no candidates); the lanes dispatched in this round (the `DISPATCH` lanes, the `dispatch.lanes` of `diff-material`, or every lane on the E9 path) |
  + | `--lanes <csv>` | the lanes dispatched in this round (the `DISPATCH` lanes, the `dispatch.lanes` of `diff-material`, or every lane on the E9 path), plus `dimension-coverage` when its `{"candidates":[]}` file was written by hand; `""` when a Step 5 round dispatched no lane (lens-only merge) |
  ```
- names: `--compact`, `blockingCount`, `lensStatus`, `--carry`.
- mirror: the `ok` status rule of `review-loop.md` Step 5 ("`lensStatus` `Approved` with `blockingCount` 0 is Approved").
- decisions: Key Decision 1.
- sync: R76 sentence of Task 1. New assertion of `plan-sdlc/rerun-sentinels:`:
  ```diff
  -         const ok = r.o.includes('<!-- R76 -->') && r.o.includes('--before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>"') &&
  -           r.l.includes('<!-- R76 -->') && r.l.includes('dispatch.lanes');
  +         const ok = r.o.includes('<!-- R76 -->') && r.o.includes('```bash\nnode "<PLAN_JS>" diff-material --before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>" --prev-dir "<CARRY>"\n```') &&
  +           r.l.includes('<!-- R76 -->') && r.l.includes('dispatch.lanes') &&
  +           r.l.includes('--lanes "<lanes dispatched in this iteration, comma-separated, or empty>"') &&
  +           r.l.includes('[--carry "<critiqueDir>/iter-<k-1>"]') &&
  +           !r.l.includes('this merge reads only `lens`');
  ```

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-sdlc/"`

### Task 3: splice --critique-dir checks the directory under --no-guardrails

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — new exported `readCritiqueDir`; `latestGuardrailMerged` uses it
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `runSplice` calls `readCritiqueDir` before the `--no-guardrails` short-cut
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — case `plan-splice: (e)` gains one run and one assertion

**Notes:** Cites F-plan-critique-dir-guardrail-check-1 and -2. Depends on Task 2 only because both edit `plan-prepare-exec.yaml`. Extending case (e) keeps the number of inline `-e` programs unchanged (Deviations). Run the new assertion against HEAD first; it must fail there (exit 0 today).

**Acceptance criteria:**
- [x] `plan.js splice --plan <p> --critique-dir <missing> --no-guardrails` exits 1, prints nothing on stdout, writes `plan.js splice error: --critique-dir is not a readable directory: <dir>` on stderr and leaves the plan unchanged.
- [x] `--critique-dir <existing> --no-guardrails` still exits 0 with `written: []`.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-splice:"` passes.

**Contract:**
- shape (code):
  ```diff
  +/** Read the entries of a critique directory; a directory that cannot be read is a usage error (R67 (f)). */
  +function readCritiqueDir(critiqueDir) {
  +  try {
  +    return fs.readdirSync(critiqueDir);
  +  } catch (_) {
  +    throw Object.assign(new Error(`--critique-dir is not a readable directory: ${critiqueDir}`), { code: 'USAGE' });
  +  }
  +}
  +
   function latestGuardrailMerged(critiqueDir) {
  -  let names;
  -  try {
  -    names = fs.readdirSync(critiqueDir);
  -  } catch (_) {
  -    throw Object.assign(new Error(`--critique-dir is not a readable directory: ${critiqueDir}`), { code: 'USAGE' });
  -  }
  +  const names = readCritiqueDir(critiqueDir);
  ```
  Exports in `scripts/lib/plan-critique.js` (end of file):
  ```diff
   module.exports = {
  -  splicePlan, latestGuardrailMerged,
  +  splicePlan, latestGuardrailMerged, readCritiqueDir,
  ```
  Import in `scripts/skill/plan.js` (line 48):
  ```diff
  -const { LANE_DEFS, diffMaterial, g17Prepare, mergeLanes, renderSummary, splicePlan, latestGuardrailMerged, tierCheck } = require(path.join(LIB, 'plan-critique'));
  +const { LANE_DEFS, diffMaterial, g17Prepare, mergeLanes, renderSummary, splicePlan, latestGuardrailMerged, readCritiqueDir, tierCheck } = require(path.join(LIB, 'plan-critique'));
  ```
  In `runSplice`:
  ```diff
     if (flags['critique-dir'] !== undefined) {
  +    readCritiqueDir(flags['critique-dir']);
       const latest = flags.noGuardrails === true ? null : latestGuardrailMerged(flags['critique-dir']);
  ```
- names: `readCritiqueDir`, `latestGuardrailMerged`, `runSplice`.
- mirror: `scripts/lib/plan-critique.js:918-924`.
- decisions: Key Decision 2; usage error exit 1 (R67), the existing `runSubcommand` mapping of `code: 'USAGE'`.
- sync: R67 (f) of Task 1. Case `plan-splice: (e)`: in `script_args`, the object passed to the logger gains one run after `noG:run("e",["--critique-dir",d,"--no-guardrails"])`:
  ```diff
  -noG:run("e",["--critique-dir",d,"--no-guardrails"])}
  +noG:run("e",["--critique-dir",d,"--no-guardrails"]),noGMissing:run("f",["--critique-dir",t+"/nope","--no-guardrails"])}
  ```
  and the assertion gains one clause:
  ```diff
  -          o.noG.status === 0 && JSON.stringify(o.noG.out.written) === '[]' && o.noG.same;
  +          o.noG.status === 0 && JSON.stringify(o.noG.out.written) === '[]' && o.noG.same &&
  +          usage(o.noGMissing) && o.noGMissing.err.includes('--critique-dir is not a readable directory');
  ```

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-splice:"`

### Task 4: ship-sdlc and received-review-sdlc spec sentences

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R-subagent-brief sentence and acceptance, appendix row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec
- Modify: `docs/specs/received-review-sdlc.md` — new R39 after R38, appendix row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy of the spec
- Modify: `docs/skills/ship-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected
- Modify: `docs/skills/received-review-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — check only, no change expected

**Notes:** Cites F-ship-agent-plugin-root-rule-1 and -2. R39 is the next free id of the received-review spec (highest is R38). The user docs do not describe the plugin-root sentence; `docs/skills/received-review-sdlc.md:247` shows the Step 12 summary only as an example that already omits the K line, so it needs no change.

**Acceptance criteria:**
- [x] R-subagent-brief states the override sentence and its acceptance (text below).
- [x] `docs/specs/received-review-sdlc.md` has R39 directly after R38, and both specs have their appendix row.
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [x] Both `cmp` checks of spec and site copy exit 0.

**Contract:**
- shape (openspec): MODIFY R-subagent-brief (`docs/specs/ship-sdlc.md`); ADD R39 (`docs/specs/received-review-sdlc.md`, after R38, numbering continues from R38).
- names: `R-subagent-brief`, `R39`.
- mirror: R38 style at `docs/specs/received-review-sdlc.md:108`.
- decisions: R-subagent-brief:
  ```diff
  - each agent file tells the agent to use that line, never the skill's base directory.
  + each agent file tells the agent to use that line, never the skill's base directory. The review, received-review and version agents also state that this line is the `sdlc plugin root:` line their skill names, so the skill's fallback for an absent line (the directory two levels above SKILL.md) does not apply.
  ```
  plus, at the end of R-subagent-brief, the sub-bullet `  - Acceptance: exec case \`execute-plan-sdlc/handback:\` (the \`stepRoot\` sentinels of the review, received-review and version agents).` R39:
  ```text
  - R39 (Deferred count): the Step 12 summary (item 1) carries the line `- D comments deferred (needs discussion or below threshold)`, so the ship step agent can report the deferred count of the round (ship-sdlc R106). Acceptance: exec case `execute-plan-sdlc/handback:` (the `rrDeferred` sentinel).
  ```
  Appendix rows: ship `| R-subagent-brief | plugin root line wins over the skill's absent-line fallback, W-E1 |`; received-review `| R39 | deferred count in the Step 12 summary, W-E1 |`.
- sync: `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` and `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md`.

### Task 5: Step agents use the task-message plugin root; received-review prints the deferred count

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-review.md` — line 11 plugin-root sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — line 11 plugin-root sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-version.md` — line 11 plugin-root sentence
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Step 12 item 1 summary gains the deferred line
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — `stepRoot` and `rrDeferred` sentinels

**Notes:** Cites F-ship-agent-plugin-root-rule-1 and -2. The old sentence is asserted by no test (`git grep -F "never derive the plugin root" tests` finds nothing); the `ARGS` sentinel of the same line stays byte-equal. `ship-step-received-review.md:21` already asks for the deferred count and needs no change.

**Acceptance criteria:**
- [x] The three agents carry the new sentence below, byte-identical, in place of the old one.
- [x] The Step 12 item 1 summary has the four lines below.
- [x] `check-handback-sentinels.js` prints `stepRoot` (three `true` values) and `rrDeferred: true`, and `ok` requires both.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/handback"` passes.

**Contract:**
- shape (docs): line 11 of each agent:
  ```diff
  - The task message carries a `sdlc plugin root: <path>` line: use that path wherever the skill substitutes `<PLUGIN_ROOT>` from the `sdlc plugin root:` line, and never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief).
  + The task message carries a `sdlc plugin root: <path>` line. It is the `sdlc plugin root:` line the skill names, not one of the other occurrences the skill tells you to ignore: use that path wherever the skill substitutes `<PLUGIN_ROOT>`. The skill's fallback for an absent line (the directory two levels above SKILL.md) does not apply, and you never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief).
  ```
  received-review SKILL.md Step 12 item 1:
  ```diff
    Review feedback processing complete:
    - N comments addressed (code changes implemented)
    - M comments pushed back (with technical reasoning)
    - K comments intentionally skipped (agree, won't fix)
  + - D comments deferred (needs discussion or below threshold)
  ```
  `check-handback-sentinels.js`, after the `stepArgs` loop:
  ```js
  const ROOT = 'The skill\'s fallback for an absent line (the directory two levels above SKILL.md) does not apply';
  const stepRoot = {};
  for (const s of ['review', 'received-review', 'version']) {
    stepRoot[s] = has(`agents/ship-step-${s}.md`, [ROOT]);
  }
  const rrDeferred = has('skills/received-review-sdlc/SKILL.md', ['- D comments deferred (needs discussion or below threshold)']);
  ```
  `ok` adds `&& Object.values(stepRoot).every(Boolean) && rrDeferred`; the printed object adds `stepRoot, rrDeferred`.
- names: `stepRoot`, `rrDeferred`, `ROOT`.
- mirror: the `stepArgs` loop of `check-handback-sentinels.js:63-67`.
- decisions: Key Decisions 7 and 8.
- sync: R-subagent-brief and R39 of Task 4.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/handback"`

### Task 6: execute-plan-sdlc spec for the marker lock and the wait target

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — R-WAVE-LIVENESS lock sentences, R92 wait-target sentences, appendix row
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy of the spec
- Modify: `docs/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/spec-compliance-reviewer.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — check only, no change expected

**Notes:** Cites F-wave-runner-false-failed-timeout-1 to -5. Spec first for Tasks 7 and 8. The threat model and accepted gaps go into the spec so reviewers report only gaps outside them (F-73). The user doc (`docs/skills/execute-plan-sdlc.md:452`) describes the wait at a level that stays true.

**Acceptance criteria:**
- [x] R-WAVE-LIVENESS carries the lock sentences, the threat model, the accepted gaps and the acceptance line (text below).
- [x] R92 carries the wait-target sentences (text below).
- [x] An appendix row for W-E1 is appended.
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; `cmp` of spec and site copy exits 0.

**Contract:**
- shape (openspec): MODIFY R-WAVE-LIVENESS and R92 of `docs/specs/execute-plan-sdlc.md`; no new id.
- names: `R-WAVE-LIVENESS`, `R92`, `.progress-wave-<N>.lock`, `LOCK_WAIT_MS`.
- mirror: threat-model style of `docs/specs/plan-sdlc.md` R75.
- decisions: R-WAVE-LIVENESS, after "atomically (tmp + rename), recording `{taskId, phase, updatedAt}`.":
  ```text
  Each write holds the wave's lock file `.progress-wave-<N>.lock` (exclusive create) beside the marker for its read, merge and rename, so parallel workers of one wave never drop each other's entries. A writer that has waited `LOCK_WAIT_MS` for the lock (a tuning value, `docs/cost-tiers.md`) removes it as stale and takes it. Threat model: two or more workers of one wave on one host writing the marker at the same time. Accepted gaps: a lock holder paused for longer than `LOCK_WAIT_MS` can still lose one update; a file system without exclusive create is not protected. Acceptance: exec case `execute-plan-sdlc/liveness/wave-progress: parallel writers keep every entry`.
  ```
  R92, after "It repeats the call until all N returns of the R-WAVE-BACKGROUND-DISPATCH barrier have arrived or the deadline has passed.":
  ```text
  Each call lists in `--tasks` only the plan task ids whose worker has not returned yet. A background task ID (the ID a dispatch call gives back) is in flight while its worker has not returned and a plan task id it covers is in `inFlight`. A worker that has returned is never in flight, never a `TaskStop` target and never reported as `TIMEOUT`, whatever its marker says; its status comes from its return. Acceptance: exec case `execute-plan-sdlc/handback:` (the `waitTarget` sentinels).
  ```
  Appendix row: `| R-WAVE-LIVENESS, R92 | locked marker writes, wait only on unreturned workers, W-E1 (F-177) |`.
- sync: `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`.

### Task 7: Lock the wave progress-marker write

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/wave-progress.js` — `withMarkerLock` around the read-merge-rename of `writeProgress`
- Create: `tests/promptfoo/scripts/run-wave-progress-parallel.js` — wrapper that runs parallel writers and prints the entry count
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — one new case
- Modify: `docs/cost-tiers.md` — two rows in "execute-plan-sdlc wave wait tuning"
- Modify: `site/src/content-source/cost-tiers.md` — byte copy of `docs/cost-tiers.md`

**Notes:** Cites F-wave-runner-false-failed-timeout-4. Complex because it adds concurrency control to a script every worker calls. Readers stay unchanged: the rename is still atomic, so `readProgress` and `--wait` need no lock. Run the new case against HEAD first: it is expected to fail there (lost entries); record the HEAD result in the report. The lock path is derived only from the marker path, which `progressPath` builds from the caller's `stateDir` (`resolveStateDir()` in `state/execute.js`, the main checkout's `.sdlc/execution`), never from the working directory; so `ship.workspace` `branch` and `worktree` behave the same: every worker of a wave, in any checkout, takes the same lock beside the same marker. The GC removes the per-run directory as a whole, so a left lock file needs no GC change. No per-dataset count check covers the liveness dataset (`git grep -n liveness-exec tests/promptfoo/scripts` finds nothing). Two global floors scan every dataset: `dataset-asserts-exec.yaml:8` (`r.cases >= 1641`) and `spec-id-coverage-exec.yaml:15` (`r.cases >= 1641 && r.asserts >= 2645`); they are `>=` floors, so the one added case and its assertion cannot break them and their values stay unchanged.

**Acceptance criteria:**
- [x] Six writer processes that each write 25 distinct task ids into one wave marker leave 150 entries, every child exits 0 and no lock file is left.
- [x] `writeProgress` keeps its signature, return value and phase-enum error.
- [x] The wrapper with any argument exits 2, prints `usage: run-wave-progress-parallel.js (no arguments)` on stderr and nothing on stdout.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/liveness/"` passes.

**Contract:**
- shape (code): in `scripts/lib/wave-progress.js`:
  ```js
  // Tuning values (docs/cost-tiers.md): lock poll and the wait after which a lock counts as stale.
  const LOCK_RETRY_MS = 10;
  const LOCK_WAIT_MS = 2000;

  function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }

  /** Run fn while holding `.progress-wave-<N>.lock` beside the marker (R-WAVE-LIVENESS). */
  function withMarkerLock(filePath, fn) {
    const lockPath = path.join(path.dirname(filePath), `.${path.basename(filePath, '.json')}.lock`);
    let waitStart = Date.now();
    for (;;) {
      try {
        fs.closeSync(fs.openSync(lockPath, 'wx'));
        break;
      } catch (err) {
        if (!err || err.code !== 'EEXIST') throw err;
        if (Date.now() - waitStart >= LOCK_WAIT_MS) {
          fs.rmSync(lockPath, { force: true }); // stale holder (accepted gap, R-WAVE-LIVENESS)
          waitStart = Date.now();
          continue;
        }
        sleepMs(LOCK_RETRY_MS);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(lockPath, { force: true });
    }
  }
  ```
  `writeProgress` keeps the argument checks and `mkdirSync`, then runs the read, merge, temp write and rename inside `withMarkerLock(filePath, () => { … })`. Exports unchanged.
- names: `withMarkerLock`, `LOCK_RETRY_MS`, `LOCK_WAIT_MS`, `run-wave-progress-parallel.js`.
- mirror: `scripts/lib/config-version.js:120-160` (exclusive create, `Atomics.wait` sleep).
- decisions: Key Decisions 3, 4 and 5. Wrapper `tests/promptfoo/scripts/run-wave-progress-parallel.js`:

  | Mode | Trigger | Behaviour | Output | Exit |
  |---|---|---|---|---|
  | parent | no arguments, `WAVE_PROGRESS_CHILD` unset | `fs.mkdtempSync(os.tmpdir() + '/wave-progress-parallel-')`; spawns 6 children (`process.execPath`, this file) with `WAVE_PROGRESS_CHILD=<k>` and `WAVE_PROGRESS_DIR=<tmp>`; waits for all; `readProgress({ runId: 'parallel-run', wave: 1, stateDir: <tmp> })`; removes the temp dir | one line `{"writers":6,"perWriter":25,"expected":150,"found":<n>,"exits":[<codes>],"lockLeft":<bool>}` | 0 |
  | child | `WAVE_PROGRESS_CHILD=<k>` | 25 calls of `writeProgress({ runId: 'parallel-run', wave: 1, stateDir: WAVE_PROGRESS_DIR, taskId: 'W<k>-T<i>', phase: 'reporting' })` | none | 0, or 1 on a thrown error |
  | usage error | any command-line argument | nothing written | stderr `usage: run-wave-progress-parallel.js (no arguments)`, no stdout | 2 |

  The wrapper requires the lib from `path.resolve(__dirname, '../../../plugins/sdlc-utilities/scripts/lib/wave-progress.js')`; `lockLeft` is `fs.existsSync(<tmp>/parallel-run/.progress-wave-1.lock)` before the cleanup.
- sync: R-WAVE-LIVENESS of Task 6. New case, appended after the case `execute-plan-sdlc/liveness/wave-progress: a non-integer --grace is rejected`:
  ```yaml
  - description: "execute-plan-sdlc/liveness/wave-progress: parallel writers keep every entry (R-WAVE-LIVENESS)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-wave-progress-parallel.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          return r.expected === 150 && r.found === r.expected && r.exits.length === 6 && r.exits.every(c => c === 0) && r.lockLeft === false ? true : `FAIL: ${output}`;
  ```
  `docs/cost-tiers.md` rows, then `cp docs/cost-tiers.md site/src/content-source/cost-tiers.md`:
  ```text
  | `LOCK_RETRY_MS` | 10 ms (poll of the progress-marker lock) | `plugins/sdlc-utilities/scripts/lib/wave-progress.js` |
  | `LOCK_WAIT_MS` | 2000 ms (a writer that waited this long removes the lock as stale) | `plugins/sdlc-utilities/scripts/lib/wave-progress.js` |
  ```

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/liveness/"`

### Task 8: Wave wait lists only unreturned workers

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6, Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — §2b steps 1, 2, 3 and 5
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — direct-mode wave deadline steps 1, 2, 3 and 5
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — `waitTarget` sentinels for both files

**Notes:** Cites F-wave-runner-false-failed-timeout-2, -3 and -5. Depends on Task 5 only because both edit `check-handback-sentinels.js`. The two files state the same procedure, so the same sentences go into both (direct mode keeps its map wording of step 1). The literals removed here are asserted by no test (`git grep -F "a returned task ID is in flight" tests` and `git grep -F "plan task ids of the wave" tests` find nothing); the kept sentinels `wave-progress --wait`, `--wait --tasks` and "Never start `Monitor`" stay.

**Acceptance criteria:**
- [x] In both files the `--wait` command lists `--tasks <plan task ids whose worker has not returned, comma-separated>`.
- [x] In both files step 3 uses the "background task ID" wording below, and no text "a returned task ID" is left.
- [x] In both files step 5 reports TIMEOUT only for a task stopped in step 4.
- [x] `check-handback-sentinels.js` prints `waitTarget` with `skill: true` and `waveRunner: true`, and `ok` requires both.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/"` passes.

**Contract:**
- shape (docs): `wave-runner-template.md` §2b (SKILL.md direct mode gets the same edits; its step 2 command uses `"<PLUGIN_ROOT>/scripts/state/execute.js"` and `<N>`/`<runId>`):
  ```diff
  -1. Record the dispatch time. All per-task dispatches from §2 run in the background, so
  -   each returns a task ID immediately rather than blocking.
  +1. Record the dispatch time. All per-task dispatches from §2 run in the background, so
  +   each dispatch call gives back a background task ID at once. Keep a map from each background
  +   task ID to the plan task IDs it covers (a batch covers several). A worker has returned when its
  +   completion notification has arrived.
  ```
  ```diff
  -   `node {STATE_SCRIPT} wave-progress --wave {WAVE} --run-id {RUN_ID} --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --grace 10 --timeout <min(540, remaining budget in seconds)>`.
  -   Repeat the call while fewer than N returns have arrived and the deadline has not passed.
  +   `node {STATE_SCRIPT} wave-progress --wave {WAVE} --run-id {RUN_ID} --wait --tasks <plan task ids whose worker has not returned, comma-separated> --interval <waveInterval> --grace 10 --timeout <min(540, remaining budget in seconds)>`.
  +   Repeat the call while fewer than N returns have arrived and the deadline has not passed; each
  +   call lists only the plan task ids whose worker has not returned yet (R92).
  ```
  ```diff
  -3. Use the call's `inFlight` list as the termination target in step 4; a returned task ID is in
  -   flight while any plan task ID it covers is in `inFlight`. A task whose marker `phase` is not
  -   yet `reporting` is in flight unless its worker has already returned: the heartbeat is advisory,
  -   so a returned worker is never a `TaskStop` or TIMEOUT target, whatever its marker says.
  +3. Use the call's `inFlight` list as the termination target in step 4: a background task ID is in
  +   flight while its worker has not returned and any plan task ID it covers is in `inFlight`. A
  +   worker that has returned is never in flight, never a `TaskStop` target and never reported as
  +   TIMEOUT, whatever its marker says (the heartbeat is advisory, R92).
  ```
  ```diff
  -5. Report each terminated task with `status: "FAILED"` and `errorCode: "TIMEOUT"`, and set the
  +5. Report each task you stopped in step 4 with `status: "FAILED"` and `errorCode: "TIMEOUT"`; a
  +   task whose worker returned takes its status from its return (§3). Set the
     wave `status` to `partial` (not `failed` — completed tasks in the same wave are still valid).
  ```
  The rest of each step (failed-call retry, `--timeout` of at most 60 once some workers returned, "Do not rely on your own memory …") stays.
- names: `background task ID`, `inFlight`, `TIMEOUT`.
- mirror: `wave-runner-template.md:88-120` and `execute-plan-sdlc/SKILL.md:388-395`.
- decisions: Key Decision 6. Sentinels in `check-handback-sentinels.js`:
  ```js
  const WAIT_TARGET = ['--tasks <plan task ids whose worker has not returned, comma-separated>', 'a background task ID is in'];
  const waitTarget = {
    skill: has('skills/execute-plan-sdlc/SKILL.md', WAIT_TARGET) && lacks('skills/execute-plan-sdlc/SKILL.md', ['a returned task ID']),
    waveRunner: has('skills/execute-plan-sdlc/wave-runner-template.md', WAIT_TARGET) && lacks('skills/execute-plan-sdlc/wave-runner-template.md', ['a returned task ID']),
  };
  ```
  `ok` adds `&& waitTarget.skill && waitTarget.waveRunner`; the printed object adds `waitTarget`. In SKILL.md the "a background task ID is in" text may wrap differently; the worker keeps the literal on one line in both files.
- sync: R92 of Task 6.

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^execute-plan-sdlc/"`

### Task 9: Space after the comma in computeSteps

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `computeSteps` signature spacing

**Notes:** Whitespace only (F-shipjs-spacing-and-pr-placeholders-1, -2); the existing `ship-prepare` cases cover the function.

**Acceptance criteria:**
- [x] `git grep -n "flags,flagSources" plugins` finds nothing.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^ship-prepare"` passes.

**Contract:** shape (code): `function computeSteps(flags,flagSources, {` becomes `function computeSteps(flags, flagSources, {` at `scripts/skill/ship.js:526`, rest of the line unchanged; names: `computeSteps`

Verify command: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^ship-prepare"`

### Task 10: Code spans for the pr-sdlc footer placeholders

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — step 2 sentence of the body-file procedure
- Modify: `docs/skills/pr-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/pr-sdlc.md` — check only, no change expected

**Notes:** Formatting only, so no spec task: spec R21 already uses code spans and no test asserts the sentence (F-shipjs-spacing-and-pr-placeholders-3, -4).

**Acceptance criteria:**
- [x] The sentence reads as in the Contract.
- [x] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:** shape (docs): `Do not write the pr.footer text yourself: step 3 appends it to <BODY_FILE> (R21).` → ``Do not write the `pr.footer` text yourself: step 3 appends it to `<BODY_FILE>` (R21).`` in `skills/pr-sdlc/SKILL.md` step 2 (line 456); names: `pr.footer`, `<BODY_FILE>`

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code and prose tasks (2, 3, 5, 7, 8, 9) carry exec cases or sentinels, and the existing case `plan-sdlc/rerun-sentinels:` is updated; spec tasks 1, 4, 6 and the formatting-only Task 10 change no behaviour |
| no-ci-bypass | error | PASS | No step skips or disables a CI check |
| no-auto-eval | error | PASS | Only exec-only configs with a targeted `--filter-pattern`; the HEAD-first run of a new case is a single baseline, not a retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a scope item (a)-(f); unreproduced items are dropped with evidence |
| single-responsibility-tasks | warning | FAIL | Task 5 bundles the plugin-root sentence in three agents with the received-review deferred count line |
| scripts-over-llm-logic | error | PASS | Fallback merge uses the script's `--compact` result, the wait target is a script-side rule, and the marker lock is code |
| yagni | warning | PASS | The lock and the shared `readCritiqueDir` helper address real defects; no speculative parameters |
| cross-skill-consistency | error | PASS | Plan-sdlc fallback is aligned with the orchestrator path, the ship step agents with their skills, and direct mode with the wave-runner |
| pr-link-github-issue | error | PASS | W-E1 and F-177 are internal register and finding ids, not GitHub issues |
| dry | warning | PASS | `readCritiqueDir` is a shared helper; identical text in several files is a required byte-sync by design |
| kiss | warning | PASS | Simple exclusive-create lock; extends an existing case instead of adding one |
| spec-first | error | PASS | Spec tasks 1, 4, 6 precede the prose and code tasks that depend on them; Tasks 9 and 10 are formatting-only |
| project-agnostic | error | PASS | All changes are in plugin code, agents and skills |
| flag-coherence-cross-skill | error | PASS | Decision sites cite resolved `lensStatus` and `blockingCount` from script output |
| no-opposite-logical-vectors | error | PASS | Both plan-sdlc Step 5 paths use one rule (`lensStatus` Approved with `blockingCount` 0) |
| flag-resolution-single-source | warning | PASS | `--compact` and `--tasks` values come from script output; no re-derivation |
| state-premise | error | PASS | Context states the root problem in one sentence |
| smallest-viable-cut | warning | PASS | The Deviations table narrows scope (single extended case, three agents only, dropped items) |
| failure-audience | warning | PASS | Names the agent or wave that takes a wrong decision and the cost of needless retries after a false TIMEOUT |
| explicit-non-goals | warning | PASS | Deviations and dropped items list the excluded adjacent work |
| ambiguity-stops-and-asks | error | PASS | Key Decisions and Decisions-without-owner record each choice with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | Dispatch lists come from `DISPATCH` and `diff-material` output; no LLM-added parameters |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added |
| workspace-mode-compatibility | error | PASS | Task 7 Notes and Key Decision 4 state the lock follows the marker path from `stateDir` (`resolveStateDir()`), identical under branch and worktree modes |
| prompt-cache-hit-ratio | warning | PASS | `Date.now` is used only in the lock wait logic, not in dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 3 (`plugins/sdlc-utilities/scripts/skill/plan.js`) changes the CLI contract of `splice --critique-dir`, so an unreadable directory is rejected "with or without `--no-guardrails`".

**Severity hint:** high

**Patch:** Record that `plan.js splice --critique-dir <missing> --no-guardrails` now exits 1 with a usage error instead of exiting 0.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Record that `plan.js splice --critique-dir <missing> --no-guardrails` now exits 1 with a usage error instead of exiting 0.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-8 edit many `.md` files (for example `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` and `plugins/sdlc-utilities/agents/ship-step-review.md`) that the dimension's current triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Tasks 1, 4 and 6 sync spec byte copies under `site/src/content-source/`, and Task 7 adds rows to `docs/cost-tiers.md`, and no existing dimension covers `site/**` or `docs/**`.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 1 | 3 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 (a) R76 rerun-lanes coherence: fallback merge, spec R75, orchestrator :41 bash block, :104 single --lanes description | Task 1, Task 2 | covered |
| 2 (b) D1: plugin-root contradiction in three ship step agents, received-review deferred count, drop unconfirmed titles row | Task 4, Task 5 | covered |
| 3 (c) plan.js splice --critique-dir under --no-guardrails rejects unreadable dir, appendix row :413 E9, plan-splice exec case | Task 1, Task 3 | covered |
| 4 (d) F-177 execute wave-runner false FAILED/TIMEOUT investigate and fix | Task 6, Task 7, Task 8 | covered |
| 5 (e) ship.js:526 computeSteps(flags,flagSources spacing | Task 9 | covered |
| 6 (f) pr-sdlc SKILL.md:456 pr.footer and <BODY_FILE> code spans | Task 10 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

- plan-sdlc has one iteration rule on both Step 5 paths. The fallback merge passes the rerun lanes, carries nothing on the E9 path and decides by the script's `blockingCount` and `lensStatus`.

- `plan.js splice --critique-dir` rejects a missing directory whatever the guardrail flag.

- The review, received-review and version step agents tell the model plainly which plugin root to use, and received-review prints a deferred count that ship R106 records.

- The wave progress marker keeps every worker's entry under parallel writes, and the wave wait never treats a returned worker as timed out.

- `ship.js` and pr-sdlc SKILL.md carry no lint-level defect from the audit.

- Specs, site copies and exec cases match the new behaviour.

## OpenSpec Appendix

Not applicable — no OpenSpec change
