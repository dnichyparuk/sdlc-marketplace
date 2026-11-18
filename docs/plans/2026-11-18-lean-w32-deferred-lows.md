# Lean w32 — Deferred Lows of w30 and w31 Implementation Plan

**Commit:** `fix(#9430): plan - deferred lows of w30 and w31`

**Goal:**
- Close the 16 confirmed low findings left over from lean-w30 (PR #107) and lean-w31 (PR #108).
- Clean up `plan.js` and `plan-critique.js`: one named constant, one usage-line typo, one duplicated default, one pass-through wrapper.
- Reject an unsafe `--iter` value in `plan.js critique-prep` (the only new check).
- Make two exec cases and one behavioural assertion actually test what they claim.
- Bring the spec, SKILL.md, the critique orchestrator agent and the user doc in line with the shipped behaviour.

**Architecture:** Five independent edits grouped by surface: scripts (Task 1), exec tests (Task 2, after Task 1), behavioural test (Task 3), spec plus skill and agent text (Task 4), user docs (Task 5). Each shared file has one owner task.
**Source:** conversation context (wave brief #9430; deferred lows validated at HEAD 4c6e57f). PR: the body names the tracking id `#9430` (an internal register id, not a GitHub issue), with no `Fixes` or `Closes` keyword.
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (each code task names its pattern); `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`

---

## Context

**What problem does this change solve?**

- Two review rounds (lean-w30 and lean-w31) left low-severity findings that were deferred.
- An isolated architect re-validated them at HEAD 4c6e57f. 16 are confirmed.
- They are small: a magic number, a typo, a duplicated default, a path built from an unchecked flag, two weak tests, and wording drift between the spec, the skill and the user doc.

**What prompted this change now?**

- The deferred list is the next item on the lean todo list. The planner re-checked each item at HEAD (see Research Findings). All 16 still reproduce.
- Items D, J and T are already fixed at HEAD. Item F is rejected (the second tier call is intended, R36). They get no task.
- The 3 untitled counts-only entries are cleared without a task.

**What does success look like?**

- `plan.js critique-prep --iter ../x` exits 1 and writes nothing.
- Exec cases pin `skipDimensionCoverage` to `false` and to `true`.
- The spec, SKILL.md, the orchestrator agent and `docs/skills/plan-sdlc.md` say the same thing as the code.
- All six project validators stay green.

**Who fails if this ships wrong?**

- The plan-sdlc critique orchestrator (an agent) fails a round if `critique-prep` rejects a valid `--iter`; it returns `error` and the plan author stops (E9).
- Exec-suite maintainers get a false pass if the new cases assert the wrong value.
- Plugin users reading `docs/skills/plan-sdlc.md` get a wrong picture of `--lightweight` if the doc text is wrong.

## Research Findings

Every item was re-checked at HEAD 4c6e57f. Evidence, by item:

| Item | Evidence at HEAD | Reproduces |
|---|---|---|
| A | `plan-critique.js:129` `shape.tasks >= 8` (bare 8) in `reviewRoute`; `TIER_BOUNDS` at `:134` | yes |
| H | `plan.js:15` reads `node plan.js critique-prep--critique-dir <dir> …` (missing space); no other file holds the typo | yes |
| I | `plan.js:469` `windowDays: 14` duplicates the `g17Prepare` default (`plan-critique.js:420` `windowDays = 14`); `plan.js:498-500` `runCritiquePrep` only calls `critiquePrep`; map at `:347` | yes |
| P | `plan.js:447` `requireFlag(flags, 'iter')`, `:450` `path.join(critiqueDir, \`iter-${iter}\`)` then `mkdirSync` — no check on `iter` | yes |
| O | `run-plan-critique-prep.js:61` `dir[dir.indexOf('--dir') + 1]`: no `--dir` gives index 0, a wrong path, `merged: null`, no error | yes |
| S | `plan-prepare-exec.yaml:1411` `typeof r.skipDimensionCoverage === 'boolean'`; case (a) yields `false` (1 candidate) | yes |
| E | `plan-sdlc.yaml:1413-1414` `icontains "dispatch"`; the prompt itself says "dispatches" | yes |
| B | `docs/skills/plan-sdlc.md:43-48` routing table has no `--lightweight` line | yes |
| C | `docs/skills/plan-sdlc.md:67` and `:102` describe Lightweight as routing-chosen only | yes |
| K | `docs/skills/plan-sdlc.md:288` "a `## Guardrail Compliance` section is appended" | yes |
| L | `docs/skills/plan-sdlc.md:302` critique-dir row says "Created by the prepare script" for everything | yes |
| G | `docs/specs/plan-sdlc.md:76` R24 "Lightweight scope (≤3 files) skips the orchestrator" | yes |
| M | spec `:210` R67 (a) signature lacks `[--compact]`; Acceptance lists `plan-merge:`, `plan-diff:`, `plan-tier:`, `plan-g17:` only | yes |
| N | spec `:87` R74 never names the R75 orchestrator | yes |
| R | spec `:86` R75 has no Acceptance sub-bullet | yes |
| Q | `agents/plan-critique-orchestrator.md:124` "the author passes it on as `G17_NOT_RUN`" ("it" ambiguous) | yes |
| U | `skills/plan-sdlc/SKILL.md:346` "for each lens entry (Step 5)" | yes |

Other facts found:

- **Fixture for the `true` case (S).** Running the runner with root `fixtures-fs/project-no-dimensions` and plan `fixtures-fs/project-plan-compact-lightweight/plans/plan.md` gives `g17: {candidates: 0, coveredDims: 0}` and `skipDimensionCoverage: true`. No new fixture is needed. (`project-no-dimensions` holds only a README, so it has no plan of its own.)
- **Usage-error style.** `plan.js` usage errors throw `usageError(message)` (`:362`); `runSubcommand` maps `code: 'USAGE'` to exit 1 and prints `plan.js <sub> error: <message>` to stderr. The nearest precedent message is `--window must be a non-negative number of days, got <v>` (`plan-critique.js:428`), pinned by the case `plan-g17: a non-numeric --window is a usage error` (`plan-prepare-exec.yaml:893`), which runs `plan.js` directly.
- **Copy rule.** `.sdlc/config.json` `plan.copyRules` (around `:148`): when `skills/plan-sdlc/SKILL.md` or `docs/specs/plan-sdlc.md` changes, the plan must list `docs/skills/plan-sdlc.md`, `site/src/content-source/skills/plan-sdlc.md`, `site/src/data/skills-meta.ts` and every `skills/plan-sdlc/*.md`. A directory entry covers the files under it (`plan-parse.js` `requiredCopies`), as in the w30 plans.
- **Byte copies.** `docs/skills/plan-sdlc.md` and `docs/specs/plan-sdlc.md` are byte-identical to their `site/src/content-source/` copies today.
- **Count checks.** No test asserts how many cases `plan-prepare-exec.yaml` or `plan-sdlc.yaml` holds; only the promptfoo configs reference them. No count floor changes.
- **Commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. Behavioural datasets are verified by review only.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| S fixture | no | reuses `project-no-dimensions` (root) with the plan of `project-plan-compact-lightweight` | `project-no-dimensions` has no plan; this pair yields `skipDimensionCoverage: true` with no new fixture |
| P test | no | the P case runs `plan.js` directly, not through the runner | the runner hard-codes `--iter 1`; the direct form mirrors the `--window` usage-error case |
| O test | no | no new exec case for the runner's `--dir` check | the runner is test harness; the brief asks for cases for P and S only |
| PR link for #9430 | no | the PR body names `#9430` as the tracking id, with no `Fixes` or `Closes` keyword | #9430 is an internal register id, not a GitHub issue (project notes); `pr-link-github-issue` applies only to GitHub issues, so the PR links the id by name |
| D, J, T, F | no | no task | D, J, T already fixed at HEAD; F rejected (second tier call intended, R36) |

## Key Decisions

**1. Code task and spec task run in the same wave.**

- Choice: Task 1 (scripts) and Task 4 (spec) do not depend on each other.
- Alternative: make Task 1 wait for the spec (strict spec-first ordering).
- Why: the only behaviour change is one usage check, and its spec text is fixed in this plan. Both land in the same commit. A chain would add an execute wave for no gain.

**2. The `--iter` check is a usage error, not a path sanitiser.**

- Choice: accept only `^\d+$` (a non-negative integer, for example `0`, `1`, `12`). Anything else exits 1 before any file is written.
- Alternative: resolve the path and check it stays under `--critique-dir`.
- Why: every caller passes a small integer. A strict format check is simpler and closes the `../x` escape fully. Threat model: a mistaken or hostile `--iter` value writing outside the critique dir. Accepted gap: `--critique-dir` itself is trusted (it comes from the prepare output, P22).

**3. Directory entry for the skill companions.**

- Choice: Task 4 lists `plugins/sdlc-utilities/skills/plan-sdlc` as check-only.
- Alternative: list each of the five companion files.
- Why: the copy rule accepts a directory entry, the w30 plans used it, and only SKILL.md changes.

## Contract Examples

Code (Task 1):

```markdown
**Contract:**
- shape (code): `critiquePrep(flags)` throws `usageError('--iter must be a non-negative integer, got <v>')` when `flags.iter` fails `/^\d+$/`, before `mkdirSync`; exit 1 via `runSubcommand`.
- names: `REVIEW_FANOUT_TASKS`, `critiquePrep`, `SUBCOMMANDS`.
- mirror: `--window` check at `plan-critique.js:428`.
- decisions: integer-only format check (Key Decision 2).
- sync: spec R67 (e) notes "`<k>` a non-negative integer" (Task 4).
```

Docs (Task 5):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md`: one line under the Complexity Routing table; three phrase edits; one table cell; byte copy to the site.
- names: `--lightweight`, R73, R74, A5.
- mirror: the table at `docs/skills/plan-sdlc.md:43-48`.
- decisions: user-facing wording; spec ids in parentheses as elsewhere in the doc.
- sync: `site/src/content-source/skills/plan-sdlc.md` byte copy.
```

Spec (Task 4):

```markdown
**Contract:**
- shape (openspec): MODIFY R24, R67, R74, R75 in `docs/specs/plan-sdlc.md`; add one history row; no new id.
- names: R24, R67, R74, R75.
- mirror: Acceptance sub-bullet style at `docs/specs/plan-sdlc.md:14`.
- decisions: wording-only changes plus the R67 (e) `<k>` constraint.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.
```

## Tasks

### Task 1: Scripts — fan-out constant, usage line, critique-prep cleanup, `--iter` check

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — named constant `REVIEW_FANOUT_TASKS` (item A)
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — usage line (H), drop `windowDays` and the wrapper (I), `--iter` check (P)

**Notes:** All four are mechanical except P. P is the only new check in this wave; it closes a path escape (`--iter ../x` makes `iter-../x`, which resolves outside the critique dir). Threat model and accepted gap: Key Decision 2.

**Acceptance criteria:**
- [ ] `plan-critique.js` declares `const REVIEW_FANOUT_TASKS = 8;` next to `TIER_BOUNDS`, and `reviewRoute` uses it; no bare `8` remains in `reviewRoute`
- [ ] `plan.js` usage comment reads `node plan.js critique-prep --critique-dir <dir> --iter <k> …`
- [ ] `critiquePrep` passes no `windowDays` to `g17Prepare`; `runCritiquePrep` is deleted and `SUBCOMMANDS` maps `'critique-prep': critiquePrep`
- [ ] `node plugins/sdlc-utilities/scripts/skill/plan.js critique-prep --critique-dir <tmp> --iter ../x --plan tests/promptfoo/fixtures-fs/project-valid-plan/plans/test-plan.md` exits 1, prints `--iter must be a non-negative integer, got ../x` to stderr, and creates nothing under `<tmp>` (check with `ls`)
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-critique-prep|plan-tier|plan-merge|plan-g17"` passes

**Contract:**
- shape (code): edits, rendered:

  ```diff
  # plan-critique.js (reviewRoute, :127-134)
  +/** Task count at which review fans out to the three lenses (R36). */
  +const REVIEW_FANOUT_TASKS = 8;
  +
   /** Single reviewer or the three-lens fan-out for a plan shape. */
   function reviewRoute(shape) {
  -  return shape.complex > 0 || shape.tasks >= 8 || shape.openspec
  +  return shape.complex > 0 || shape.tasks >= REVIEW_FANOUT_TASKS || shape.openspec
  ```

  ```diff
  # plan.js usage comment (:15)
  - *   node plan.js critique-prep--critique-dir <dir> --iter <k> --plan <path> [--github-hosting true|false] [--root <dir>]
  + *   node plan.js critique-prep --critique-dir <dir> --iter <k> --plan <path> [--github-hosting true|false] [--root <dir>]
  ```

  ```diff
  # plan.js SUBCOMMANDS (:347)
  -const SUBCOMMANDS = { 'critique-prep': runCritiquePrep, 'diff-material': runDiffMaterial, …
  +const SUBCOMMANDS = { 'critique-prep': critiquePrep, 'diff-material': runDiffMaterial, …
  ```

  ```diff
  # plan.js critiquePrep (:445-450)
   function critiquePrep(flags) {
     const critiqueDir = requireFlag(flags, 'critique-dir');
     const iter = requireFlag(flags, 'iter');
  +  if (!/^\d+$/.test(iter)) throw usageError(`--iter must be a non-negative integer, got ${iter}`);
     const plan = requireFlag(flags, 'plan');
  ```

  ```diff
  # plan.js g17Prepare call inside critiquePrep (:464-472)
         learningsPath: path.join(root, '.sdlc/learnings/log.md'),
  -      windowDays: 14,
         githubHosting: flags['github-hosting'] === 'true',
  ```

  ```diff
  # plan.js (:498-500) — delete
  -function runCritiquePrep(flags) {
  -  return critiquePrep(flags);
  -}
  -
  ```

  CLI surface (`critique-prep --iter`):

  | `--iter` value | result |
  |---|---|
  | `0`, `1`, `12` | as today |
  | `../x`, `-1`, `1.5`, `a`, `` | exit 1, stderr `plan.js critique-prep error: --iter must be a non-negative integer, got <v>`, nothing written |
- names: `REVIEW_FANOUT_TASKS`, `critiquePrep`, `SUBCOMMANDS`, `usageError`.
- mirror: `--window` check at `plan-critique.js:428`; `TIER_BOUNDS` placement at `plan-critique.js:134`.
- decisions: check before any file system call; the `g17Prepare` default (`windowDays = 14`, `plan-critique.js:420`) is the single source.
- sync: spec R67 (e) `<k>` note (Task 4); exec case `plan-critique-prep: (c)` (Task 2).

### Task 2: Exec tests — runner `--dir` check, `skipDimensionCoverage` cases, `--iter` case

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-plan-critique-prep.js` — merge mode throws when `--dir` is absent (item O)
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — case (a) asserts `=== false`; new cases (c) for P and (d) for the `true` branch (item S)

**Notes:** The `true` case reuses existing fixtures (see Research Findings), so no fixture is created. No test counts the dataset's cases; the dataset goes from 2 to 4 `plan-critique-prep:` cases and no floor changes.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/run-plan-critique-prep.js merge tests/promptfoo/fixtures-fs/plan-merge-lanes --lanes static-structural` exits 2 with stderr `Script error: merge needs --dir`
- [ ] Case `plan-critique-prep: (a) writes both reports` asserts `r.skipDimensionCoverage === false` (the `typeof … === 'boolean'` check is replaced)
- [ ] New case `plan-critique-prep: (c) a non-integer --iter is a usage error` passes
- [ ] New case `plan-critique-prep: (d) no candidates and no covered dimensions sets skipDimensionCoverage` passes
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-critique-prep|plan-merge"` passes

**Contract:**
- shape (code): runner and dataset edits, rendered:

  ```diff
  # run-plan-critique-prep.js merge mode (:60-62)
       const dir = args.map(a => a.split('@COPY@').join(copy));
  +    if (dir.indexOf('--dir') === -1) throw new Error('merge needs --dir');
       const r = run(['merge-lanes', ...dir, '--compact']);
  ```

  (The existing `catch` prints `Script error: <message>` and exits 2.)

  ```diff
  # plan-prepare-exec.yaml case (a) (:1409-1411)
  -          typeof r.skipDimensionCoverage === 'boolean';
  +          r.skipDimensionCoverage === false;
  ```

  New cases, inserted after case (b) (before `plan-merge: (compact) prints the rendered blocking list`):

  ```yaml
  - description: "plan-critique-prep: (c) a non-integer --iter is a usage error"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
      project_root: "file://fixtures-fs/project-valid-plan"
      script_args: "critique-prep --critique-dir {{project_root}}/critique-iter-escape --iter ../x --plan {{project_root}}/plans/test-plan.md --root {{project_root}}"
    assert:
      - type: icontains
        value: "--iter must be a non-negative integer, got ../x"

  - description: "plan-critique-prep: (d) no candidates and no covered dimensions sets skipDimensionCoverage"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-plan-critique-prep.js"
      project_root: "file://fixtures-fs/project-no-dimensions"
      plan_root: "file://fixtures-fs/project-plan-compact-lightweight"
      script_args: "prep {{project_root}} {{plan_root}}/plans/plan.md"
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          const r = JSON.parse(o.out);
          const ok = o.status === 0 && r.g17NotRun === false && r.g17.candidates === 0 &&
            r.g17.coveredDims === 0 && r.skipDimensionCoverage === true;
          return ok ? true : `FAIL: ${output}`;
  ```
- names: case ids `plan-critique-prep: (c)`, `plan-critique-prep: (d)`; runner message `merge needs --dir`.
- mirror: `plan-g17: a non-numeric --window is a usage error` (`plan-prepare-exec.yaml:893`); case (a) at `:1398`.
- decisions: case (c) checks the message only, like the `--window` case; Task 1's acceptance checks that nothing is written. If the exec provider does not resolve a second `file://` var, the worker sets `plan_root` the same way `project_root` is set in other cases or passes the plan path relative to `project_root` (`{{project_root}}/../project-plan-compact-lightweight/plans/plan.md`).
- sync: spec R67 Acceptance names `plan-critique-prep:` (Task 4).

### Task 3: Behavioural test — the C2 dispatch assertion matches the answer, not the prompt

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — `icontains "dispatch"` (`:1413-1414`) becomes `icontains "content-coverage"`

**Notes:** The prompt says "dispatches", so `dispatch` always matches; `content-coverage` is a lane the answer must name and the prompt does not. Behavioural datasets are owner-run; verify by review only.

**Acceptance criteria:**
- [ ] The case at `plan-sdlc.yaml:1405` asserts `icontains "content-coverage"` in place of `icontains "dispatch"`; its other assertions and the dataset's case count are unchanged
- [ ] `grep -c "content-coverage" tests/promptfoo/datasets/plan-sdlc.yaml` is one higher than before; the case's `user_request` text does not contain `content-coverage`

**Contract:** shape (code): one assertion value in a YAML test case; names: `icontains`, `content-coverage`; sync: none

### Task 4: Spec, SKILL.md and orchestrator agent wording

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R24 (G), R67 (M and the P note), R74 (N), R75 (R), history row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — lens and lane entries of `skipped` defined for every round (U)
- Modify: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — "it" becomes `g17NotRun` (Q)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only, do not edit: `openspec-flow.md`, `plan-format-reference.md`, `plan-template-default.md`, `review-loop.md` and `state-format.md` say nothing about lens or lane entries of `skipped` beyond what `review-loop.md:89` defers to SKILL.md; no change expected (copy rule; this entry gives the directory one owner)

**Notes:** Wording only, except the R67 (e) note that pins Task 1's check. No new id. U fixes a real mis-log: a lane listed in a Step 5 `skipped` would be logged as a lens line and escape the dedupe.

**Acceptance criteria:**
- [ ] R24, R67, R74 and R75 read as rendered below; the history table gains the row below as its last row
- [ ] SKILL.md `:346` reads as rendered below
- [ ] `plan-critique-orchestrator.md:124` reads "the author passes `g17NotRun` on as `G17_NOT_RUN` to every later round"
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0

**Contract:**
- shape (openspec): edits, rendered (`…` = text unchanged):

  ```diff
  # R24 (:76)
  -… Lightweight scope (≤3 files) skips the orchestrator entirely and uses inline exploration as today.
  +… Lightweight scope (≤3 files) or the `--lightweight` route (A5) skips the orchestrator entirely and uses inline exploration as today.
  ```

  ```diff
  # R75 (:86) — new sub-bullet after the R75 line
  +  - Acceptance: exec cases `plan-critique-prep:` and `plan-merge: (compact)`.
  ```

  ```diff
  # R74 (:87) — appended at the end of the line
  -… `guardrailsEvaluated` and `critiqueRan` are not re-written.
  +… `guardrailsEvaluated` and `critiqueRan` are not re-written. The R74 round runs through the R75 orchestrator (`ROUND: r74`); on `no-agent-tool` the author runs it.
  ```

  ```diff
  # R67 (:210)
  -(a) `merge-lanes --dir <iterDir> [--lanes <csv>] … [--g17-not-run] [--plan <path>]` → …
  +(a) `merge-lanes --dir <iterDir> [--lanes <csv>] … [--g17-not-run] [--plan <path>] [--compact]` → …
  -(e) `critique-prep --critique-dir <d> --iter <k> --plan <p> [--github-hosting true|false] [--root <dir>]` → …
  +(e) `critique-prep --critique-dir <d> --iter <k> --plan <p> [--github-hosting true|false] [--root <dir>]` (`<k>` a non-negative integer; any other value is a usage error, exit 1, before any file is written) → …
  -Acceptance: `tests/promptfoo/datasets/plan-prepare-exec.yaml` cases `plan-merge:`, `plan-diff:`, `plan-tier:` and `plan-g17:`.
  +Acceptance: `tests/promptfoo/datasets/plan-prepare-exec.yaml` cases `plan-merge:`, `plan-diff:`, `plan-tier:`, `plan-g17:`, `plan-critique-prep:` and `plan-splice:`.
  ```

  ```diff
  # Appendix — history table, new last row
  +| R24, R67, R74, R75 | deferred lows of w30 and w31, #9430 |
  ```

  ```diff
  # SKILL.md (:346)
  -… For each lane entry of `skipped`, append `## YYYY-MM-DD — plan-sdlc: <entry> skipped — agent file not found` (…); for each lens entry (Step 5), append `## YYYY-MM-DD — plan-sdlc: lens "<name>" skipped — agent file not found`, both to the same log. …
  +… An entry of `skipped` that names a `lensReviewers[]` lens or `all` is a lens entry; any other entry is a lane entry, in every round. For each lane entry of `skipped`, append `## YYYY-MM-DD — plan-sdlc: <entry> skipped — agent file not found` (…); for each lens entry, append `## YYYY-MM-DD — plan-sdlc: lens "<name>" skipped — agent file not found`, both to the same log. …
  ```

  ```diff
  # plan-critique-orchestrator.md (:124)
  -… `skipped` lists the lanes and lenses left out for a null `agentPath` (empty when none); the author passes it on as `G17_NOT_RUN` to every later round.
  +… `skipped` lists the lanes and lenses left out for a null `agentPath` (empty when none); the author passes `g17NotRun` on as `G17_NOT_RUN` to every later round.
  ```
- names: R24, R67, R74, R75 (modified); no new id.
- mirror: Acceptance sub-bullet style at `docs/specs/plan-sdlc.md:14`; history rows at the end of the spec.
- decisions: no new requirement id; the `<k>` constraint lives in R67 (e) because R67 owns the subcommand signatures.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy; Task 1's message text; Task 2's case names.

### Task 5: User doc — `--lightweight` routing, Guardrail Compliance splice, critique-dir writers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — items B, C, K, L
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`)
- Modify: `site/src/data/skills-meta.ts` — check only, do not edit: the plan-sdlc entry (around `:28-51`) states no routing, splice or critique-dir detail; no change expected (copy rule)
- Modify: `README.md` — line 50, /plan-sdlc row: add "unless --lightweight forces the Lightweight route" after "4+ file scopes" (matches skills-meta.ts:32; A5)

**Notes:** The doc drifted from the spec in w30 and w31. All four edits restate behaviour the spec already defines (A5, R73, R74, R67 (f), R75); no new behaviour.

**Acceptance criteria:**
- [ ] The four passages read as rendered below
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0

**Contract:**
- shape (docs): edits, rendered:

  ```diff
  # after the Complexity Routing table (:48), before "The skill loads two companion files…"
   | Multiple independent subsystems | Decompose into separate plans | Decompose |
  +
  +`--lightweight` forces the Lightweight route whatever the scope. `plan.js tier` can still escalate it to Steps 3–6 when the plan exceeds the Lightweight bounds (R73). A run that does not escalate gets one cheap re-check (R74).
  ```

  ```diff
  # :67
  -- **Lightweight (complexity routing in Step 0 chose the lightweight branch):** orchestrator skipped. …
  +- **Lightweight (complexity routing in Step 0 chose the lightweight branch, or `--lightweight` forced it (A5)):** orchestrator skipped. …
  ```

  ```diff
  # :102
  -**Lightweight-skip rule.** When complexity routing chooses the lightweight branch (about ≤3 files), the orchestrator is skipped entirely. …
  +**Lightweight-skip rule.** When complexity routing chooses the lightweight branch (about ≤3 files), or `--lightweight` forced it (A5), the orchestrator is skipped entirely. …
  ```

  ```diff
  # :288
  -… a `## Guardrail Compliance` section is appended listing each guardrail and its pass/fail status. …
  +… a `## Guardrail Compliance` section is spliced in (replaced when present) listing each guardrail and its pass/fail status. …
  ```

  ```diff
  # :302 critique-dir row, second cell
  -| … `merged.json` and the plan copy used for the material-change diff. Created by the prepare script; removed at Step 7, … |
  +| … `merged.json` and the plan copy used for the material-change diff. The prepare script creates the directory; `plan.js critique-prep` creates each `iter-<k>/` with the validator report and the g17-prepare result; the critique orchestrator writes each lane's and lens's JSON; `merge-lanes --compact` writes `merged.json`. Removed at Step 7, … |
  ```
- names: `--lightweight`, A5, R73, R74, `critique-prep`, `merge-lanes --compact`.
- mirror: the Complexity Routing table at `docs/skills/plan-sdlc.md:43-48`; the critique-dir row at `:302`.
- decisions: user-facing wording; spec ids in parentheses as elsewhere in the doc.
- sync: `site/src/content-source/skills/plan-sdlc.md` byte copy.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The new --iter check is covered by exec case (c). skipDimensionCoverage case (a) is updated and case (d) added. The stale C2 assertion is corrected in Task 3. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only exec-only config runs, each filtered to a targeted pattern. Behavioural datasets are verified by review only. No retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a confirmed deferred low. Items D, J, T and F are excluded. |
| single-responsibility-tasks | warning | PASS | Each task delivers one surface: scripts, exec tests, behavioural test, spec and skill wording, user docs. |
| scripts-over-llm-logic | error | PASS | The new --iter check is deterministic script code. |
| yagni | warning | PASS | Only the one needed check is added. The runner --dir check and the constant are minimal. |
| cross-skill-consistency | error | PASS | Spec, SKILL.md, agent, user doc and site copies are all synced. |
| pr-link-github-issue | error | PASS | #9430 is declared an internal register id, not a GitHub issue (Source line and Deviations row). The PR names it as the tracking id. |
| dry | warning | PASS | The duplicated windowDays default and the pass-through wrapper are removed. |
| kiss | warning | PASS | The integer regex is chosen over path resolution (Key Decision 2). |
| spec-first | error | PASS | Spec edits sit in Task 4 ahead of the SKILL.md wording. The only behaviour change, the --iter check, has its spec text fixed in the plan. Key Decision 1 records the same-wave choice. |
| project-agnostic | error | PASS | All changes are in plugin code, spec and docs. |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag gating is introduced. |
| no-opposite-logical-vectors | error | PASS | The one gate site changed, the Lightweight skip, is worded consistently. |
| flag-resolution-single-source | warning | PASS | The G17 window default has a single source (g17Prepare). |
| state-premise | error | PASS | The Context section names the problem: deferred lows from w30 and w31. |
| smallest-viable-cut | warning | PASS | Items are triaged against HEAD and non-reproducing ones are dropped. |
| failure-audience | warning | PASS | Context names who fails: the critique orchestrator, exec-suite maintainers and plugin users reading the doc. |
| explicit-non-goals | warning | PASS | Deviations lists items D, J, T and F as excluded, and the counts-only entries are cleared without a task. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Key Decisions 1 to 3. |
| state-machine-idempotency | error | PASS | No migration, initialization or preflight logic is changed. |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters are changed. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added. --iter already exists and is only validated. |
| workspace-mode-compatibility | error | PASS | No new state paths or cwd logic. The critique-dir comes from the prepare output and only the --iter format is validated. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 (`plugins/sdlc-utilities/scripts/skill/plan.js`) makes `critiquePrep` throw `--iter must be a non-negative integer, got <v>`, which narrows the accepted values of a CLI flag.

**Severity hint:** high

**Patch:** Document and check that `plan.js critique-prep --iter` now accepts only `^\d+$` and exits 1 with a usage error before writing any file.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Document and check that `plan.js critique-prep --iter` now accepts only `^\d+$` and exits 1 with a usage error before writing any file.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 4 and Task 5 touch YAML datasets (`tests/promptfoo/datasets/plan-prepare-exec.yaml`, `plan-sdlc.yaml`) plus spec, SKILL.md and doc markdown, which the code-quality triggers do not currently cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

### UPDATE: security-review (U5)

**Why:** Task 4 edits `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` and checks `plugins/sdlc-utilities/skills/plan-sdlc`, and neither is matched by the `plugins/**/scripts/**/*.js` trigger. Task 1's `--iter` path-escape guard shows the plan-critique surface carries security-relevant behavior.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 1 | 0 |
| Coherence | 0 | 1 | 0 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 (A) plan-critique.js REVIEW_FANOUT_TASKS constant | Task 1 | covered |
| 2 (H) plan.js usage line space | Task 1 | covered |
| 3 (I) drop windowDays, map critiquePrep, delete wrapper | Task 1 | covered |
| 4 (P) --iter usage error, exec case, spec R67(e) note | Task 1, Task 2, Task 4 | covered |
| 5 (O) runner merge mode throws without --dir | Task 2 | covered |
| 6 (S) skipDimensionCoverage false and true cases | Task 2 | covered |
| 7 (E) plan-sdlc.yaml C2 content-coverage assertion | Task 3 | covered |
| 8 (B) doc routing table --lightweight line | Task 5 | covered |
| 9 (C) doc :67 and :102 --lightweight forced it | Task 5 | covered |
| 10 (K) doc :288 spliced in | Task 5 | covered |
| 11 (L) doc :302 critique-dir writers | Task 5 | covered |
| 12 (G) spec R24 --lightweight route | Task 4 | covered |
| 13 (M) spec R67 [--compact] and Acceptance | Task 4 | covered |
| 14 (N) spec R74 names R75 orchestrator | Task 4 | covered |
| 15 (R) spec R75 Acceptance | Task 4 | covered |
| 16 (Q) orchestrator :124 g17NotRun | Task 4 | covered |
| 17 (U) SKILL.md :346 lens vs lane entry | Task 4 | covered |
| 18 Byte copies, copy rules, history row, validate-spec-shape | Task 4, Task 5 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

When all five tasks are done:

- `plan.js critique-prep` refuses an `--iter` that is not a plain number. Nothing is written outside the critique dir.
- `plan-critique.js` names the fan-out threshold. `plan.js` has one source for the G17 window and no wrapper.
- The exec dataset pins both values of `skipDimensionCoverage` and the new usage error. The test runner fails loudly when a case forgets `--dir`.
- The behavioural C2 case checks a word only a correct answer contains.
- The spec, SKILL.md, the orchestrator agent and the user doc describe the same `--lightweight`, R74 and critique-dir behaviour as the code. Site copies match byte for byte.

## OpenSpec Appendix

Not applicable — no OpenSpec change
