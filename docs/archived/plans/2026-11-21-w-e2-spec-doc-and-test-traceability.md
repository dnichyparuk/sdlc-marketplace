# W-E2 Spec, Doc and Test Traceability Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #131, 25c3ffc

**Commit:** `fix(W-E2): traceability - spec, doc and test case gaps`
**Goal:** Make every spec acceptance line, test-script header and user doc of the W-E2 scope point at cases and behaviour that exist, and close five exec-test gaps.
**Architecture:** Spec and doc edits are text fixes with byte copies under `site/src/content-source/`. Test gaps are closed with repo:// cases: new `--case` or `--scenario` entries in existing wrapper scripts, one new fixture, and one stronger assertion on an existing fixture. No plugin script code changes.
**Source:** docs/plans/programme.md#W-E2
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

- Some spec acceptance lines name test cases that do not exist as cases. The checks exist, but only as `# from:` comments inside other cases. A `# from:` comment marks an assertion that was merged into another case.
- Two test-script headers name the wrong or an incomplete set of datasets.
- Five behaviours have no test, or a test that cannot fail.
- Three specs, one test README, one skill doc and one SKILL.md sentence say something that does not match the code.

**What prompted this change now?**

The END audit (owner delegation 2026-11-21) listed these items as unit W-E2 of the plan register. W-F, which it depends on, is done.

**What does success look like?**

- Every acceptance line in the scope names a case description, or a `# from:` assertion inside a named case, that a reader can find with one `grep`.
- The new and changed exec cases pass, and each one fails when the behaviour it checks breaks.
- The spec, doc and README text matches the code it describes, and every site copy is byte-identical to its source.

## Research Findings

The discovery brief (`F-<dimension>-<n>` ids below) re-verified every item against HEAD `01c987b`. Line numbers are at that HEAD. The ship branch starts from the same commit, so they hold, but tasks anchor every change on quoted text, not on a line number.

**Spec acceptance lines (item D3, R78, D10).**

- `docs/specs/received-review-sdlc.md` R33 names cases `rr-plan:`. Those checks are `# from: rr-plan: (a)` and `(b)` assertions inside cases `rr-scope: (a)` and `rr-scope: (b)` of `received-review-prepare-exec.yaml` (F-spec-acceptance-vs-dataset-cases-1).
- `docs/specs/ship-sdlc.md` R81 names `ship-nostash:`. The check is a `# from:` assertion inside `ship-threshold: (c)` of `ship-prepare-exec.yaml` (F-spec-acceptance-vs-dataset-cases-2).
- R107 names `ship-fix-scope: (a)` and `(b)`. Case (a) exists. Case (b) is a `# from:` assertion inside `ship-fix-subject: (a)` (F-spec-acceptance-vs-dataset-cases-3).
- `docs/specs/commit-sdlc.md` R-subject-verbatim names `commit-subject: (a)` to `(d)`. Case (d) is a `# from:` assertion inside `commit-prepare: default flags with no args` (F-spec-acceptance-vs-dataset-cases-4).
- R78 names `ship-summary-commits: (a)` and `(b)` in `ship-stepper-flows-exec.yaml`. Case (b) is there, and so is case (c), which the spec does not name. Case (a) is a `# from:` assertion inside `ship-step: (cf8)` of a different dataset, `ship-stepper-exec.yaml` (F-spec-acceptance-vs-dataset-cases-5).
- The header of `run-ship-prepare-summary.js` names `ship-prepare-exec.yaml`, which never calls it. Its callers are `ship-stepper-exec.yaml` and `ship-stepper-flows-exec.yaml`. The header of `run-ship-prepare-plan-fields.js` names only `ship-prepare-exec.yaml`, but `ship-stepper-flows-exec.yaml` also calls it (F-spec-acceptance-vs-dataset-cases-6, -7).

**Exec-test gaps (items D4, D5, D8).**

- The jira `--cache-dir` case cannot fail. Its HOME is a copy of the same fixture, so jira.js finds the same cache file through the home-cache scan even without the flag (F-exec-test-gaps-jira-r77-r37-r109-1). `run-jira-cache.js` already runs ordered jira.js calls in a temp copy, which is the right host.
- R77 (`plan.js splice --critique-dir` writes only the guardrail table) has no data that would show a leak. `fixtures-fs/plan-splice-latest/iter-1/merged.json` has no `g17Findings`, so case `plan-splice: (d)` cannot see a Suggested Review Dimensions section written by mistake (F-exec-test-gaps-jira-r77-r37-r109-2). Cases (e) and (f) also read that fixture. Their outcomes do not depend on `g17Findings`: (e) `noG` passes `--no-guardrails`, so with `only` = Guardrail Compliance nothing is written; (f) asserts only exit codes and the `source` path.
- R37 (received-review reads config, dimensions and guardrails from the worktree, and `local.json` from the main checkout) has only an inline `parseArgs` check. Nothing checks the values that reach the manifest (F-exec-test-gaps-jira-r77-r37-r109-3).
- R109 says ship.js writes `ship-summary-<slug>.json` also when it stops with `final-check-open` (`finalCheckStop` in `skill/ship.js`). No case checks that write (F-exec-test-gaps-jira-r77-r37-r109-4).
- `review-sdlc` P11 says `findings` is `[]` when there are none. Case `review-consolidate: no findings gives APPROVED and 0 total` checks only stdout (F-review-consolidate-findings-empty-and-sort-1).

**Wording (items D8 P11, R110, R106, D6, D7, R38, execute-plan-sdlc).**

- P11 says the findings are "sorted as in the comment". The code sorts the summary list once across all dimensions with `compareFindings` (severity from critical down, then file, then start line, then the line string). The comment sorts within each dimension section (F-review-consolidate-findings-empty-and-sort-2, -3).
- R110 "Accepted gaps" does not name the race in `hooks/subagent-track.js`. Its read, change and rename of the marker file take no lock (F-spec-acceptance-vs-dataset-cases-8, -9).
- R106 does not state which entries `summaryFindings` in `skill/ship.js` keeps (F-spec-acceptance-vs-dataset-cases-11).
- `tests/promptfoo/README.md` says both exec configs run through `script-runner.js`, and that every case gets a HOME copy. The hooks config uses `providers/hook-runner.js`, which sets HOME without a copy (F-readme-skilldoc-skillmd-wording-1, -2).
- `docs/skills/received-review-sdlc.md` and its site copy do not mention R38 (F-readme-skilldoc-skillmd-wording-3).
- `execute-plan-sdlc` SKILL.md Step 8-bis refers to "the per-wave few-waves rule below", but the rule it points to carries no such label (F-readme-skilldoc-skillmd-wording-4).

**Copy rules and site copies.**

- `.sdlc/config.json` `plan.copyRules` requires that, for each edited `docs/specs/<skill>.md` or skill `SKILL.md`, the plan lists the skill doc, its site copy, `site/src/data/skills-meta.ts` and each companion `skills/<skill>/*.md` (SKILL.md itself excluded). The check is plan-wide: a path listed once in any task counts (`requiredCopies` in `lib/plan-parse.js`). So this plan lists each such path once, marked `check only, no change expected`.
- `docs/specs/*.md` and `docs/skills/*.md` have byte copies under `site/src/content-source/`. Today they are identical (`cmp` clean) for the four specs and the skill doc this plan edits. `tests/promptfoo/README.md` has no site copy.
- Suite guards (`tests/promptfoo/README.md` "Suite guards"): `check-spec-id-coverage.js` fails only when a dataset, assertion count, cited id or parsed flag drops below `baselines/spec-id-coverage.json`. Growth never fails. One change of this plan is a drop: flag keys are `<basename of script_path> <flag>` (`caseFlags`, `check-spec-id-coverage.js:47-63`), the baseline has `"jira.js --cache-dir": 1` (`spec-id-coverage.json:932`), and its only source is the case at `jira-sdlc-exec.yaml:621` (script_path `jira.js`). Task 6 moves that case to `run-jira-cache.js`, so the key disappears and `check-spec-id-coverage.js:131-132` reports a flag drop. Task 6 therefore refreshes the baseline; the same case also carried `--check` and `--project`, so `"jira.js --check"` and `"jira.js --project"` each go down by 1 and stay above 0 (no drop). Every other change only adds. `fixture-refs: (a)` has floors `refs >= 300` and `datasets >= 19`, which this plan does not lower. `fixture-guard: (a)` requires the guard line in every git-init `setup.sh`.

**Literal-text scan (F-55, F-180).** `git grep -F` over `tests/`, `.claude/skills` and the `check-*.js` scripts finds no assertion for any reworded text: "few-waves", "few~waves", "as in the comment", "as~in~the~comment", "HOME copy", "HOME~copy", "fixture copy and HOME copy", "no LLM involved" (only in dataset comments), `rr-plan`, `ship-nostash`, "Accepted gaps: an agent that dies" and "keeps today". The only hits are `tests/promptfoo/README.md` itself and unrelated dataset comments.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Optional item 9 (plan-sdlc SKILL.md hint) | no | dropped (a choice) | The item still applies at HEAD: `plan-sdlc` SKILL.md:225 does not tell the planner to list the required copies as `check only, no change expected` Files entries, and its wording conflicts ("or its Notes name the ones it checked that need no change", then "a Notes mention does not count"). It comes from `docs/TODO/lows-lean-w43.md:15` (F-176, planner cost). It is an optional low, and the edit would pull in the plan-sdlc spec, its user doc, the site copy and every plan-sdlc companion file, so this wave leaves it out. |
| D3 merged cases | no | spec acceptance lines name the host case and its `# from:` assertion | The cases were merged on purpose. Splitting them would rewrite inline `-e` programs, which is W-E4 and W-E5 scope. |
| R38 doc text | no | adds R38 only, not R39 | The scope names R38. The discovery brief notes R39 as a side note, so it stays out of scope. |
| Spec-id baseline | no | refreshed in Task 6 | Task 6 moves the only `jira.js --cache-dir` case to `run-jira-cache.js`, which drops the baseline flag key `jira.js --cache-dir`. Task 6 runs `--update` so the key moves; the new wrapper case still fails when `--cache-dir` breaks. A kept direct `jira.js --cache-dir` case would be a case that cannot fail, which is the D4 defect. |
| `docs/TODO/lows-lean-w42.md` few-waves entry | no | left unchanged | No task edits TODO notes. The main session closes the note when it closes the unit. |

## Key Decisions

- **Name the host case, do not split it.** A spec acceptance line can name an assertion inside a case. For example: "the `# from: rr-plan: (a)` assertion of exec case `rr-scope: (a)`". The other option is to split each merged case back into its own case. Splitting reverses an earlier merge, adds run time and changes inline `-e` programs. Naming the host keeps the tests and makes the spec findable. Cites F-spec-acceptance-vs-dataset-cases-1 to -5.

- **Reuse the wrappers that exist.** The jira gap gets a new `--scenario cache-dir` in `run-jira-cache.js`. The R109 gap gets a new `--case` in `run-ship-prepare-summary.js`. A new wrapper would copy the temp-dir and spawn code these files already have (guardrail `dry`).

- **R77: give the fixture the data, not a new case.** Case `plan-splice: (d)` already asserts that `written` is only `["Guardrail Compliance"]`. It cannot fail only because its fixture has no `g17Findings`. Adding a non-empty `g17Findings` to `plan-splice-latest/iter-1/merged.json`, plus one condition in (d), turns it into a real R77 check. Cases (e) and (f) keep passing (see Research Findings).

- **R37: a new fixture with a direct repo:// case.** The case runs `skill/received-review.js` from a linked worktree, as `commit-prepare (R21):` does for commit.js. A new fixture keeps `project-linked-worktree-config` unchanged for the commit cases that use it.

- **P11 empty findings: one more assertion on the existing case.** The existing case already runs `review-consolidate.js` on `findings-empty` and writes `summary.json`. A JavaScript assertion that reads that file is the cheapest real check.

- **One task per shared file.** Each spec, dataset and wrapper belongs to exactly one task. The copy-rule paths are each listed once. So all ten tasks run in one execute wave with no `Depends on` links (F-43).

- **No behaviour change, so no new spec ids.** Every spec edit documents what the code already does, or fixes an acceptance pointer. The `execute-plan-sdlc` SKILL.md edit renames a reference only. So the spec-first guardrail needs no spec task for it.

## Decisions taken without the owner

- Item 9 dropped by choice: it still applies, but it is an optional low with a wide copy set (see Deviations).
- D3 fixed by naming host cases in the specs, not by splitting cases.
- R39 left out of the received-review doc edit.
- The spec-id coverage baseline is refreshed in Task 6 with `--update`, not kept by a duplicate direct `jira.js --cache-dir` case.

## Contract Examples

Code (Task 6):

```markdown
**Contract:**
- shape (code): new `--scenario cache-dir` in `run-jira-cache.js`; two jira.js calls; same stdout line `{"scenario","calls","files"}`; usage errors unchanged (exit 2, stderr, no stdout).
- names: scenario `cache-dir`.
- mirror: the `clear` scenario in `tests/promptfoo/scripts/run-jira-cache.js`.
- decisions: move the cache out of HOME instead of adding a fixture.
- sync: `SCENARIOS` list and the header Usage line.
```

Docs (Task 2):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/received-review-sdlc.md`; add `### Removed phrases` after `### Doc-versus-spec findings` (audience: end users); one paragraph; cites R38.
- names: heading `### Removed phrases`.
- mirror: the `### Doc-versus-spec findings` paragraph style.
- decisions: no R39 text.
- sync: byte copy `site/src/content-source/skills/received-review-sdlc.md`.
```

Spec (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY R110 Accepted gaps (append one clause); MODIFY R106 (add the filter sentence); MODIFY the acceptance lines of R78, R81 and R107; no new ids.
- names: R78, R81, R106, R107, R110.
- mirror: the existing "Acceptance: exec case ... in `tests/promptfoo/datasets/...`" wording.
- decisions: name host cases (Key Decisions).
- sync: byte copy `site/src/content-source/specs/ship-sdlc.md`.
```

## Tasks

### Task 1: ship-sdlc spec acceptance lines, R106 filter and R110 race

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R81, R78 and R107 acceptance lines; R106 filter sentence; R110 accepted-gap clause
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`)
- Modify: `docs/skills/ship-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (no skill gains a flag, connection or description change in this plan)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected

**Notes:** The R106 and R110 text documents code that exists (`summaryFindings` and `subagent-track.js`), so no new id or test is needed. The R110 clause is the wording that decision PD-2 fixes. The check-only entries satisfy `plan.copyRules`. Findings: F-spec-acceptance-vs-dataset-cases-2, -3, -5, -8, -9, -10, -11.

**Acceptance criteria:**
- [x] The R81, R78 and R107 acceptance lines name only case descriptions or `# from:` assertions that `grep -F` finds in the named dataset.
- [x] R106 states the entry filter of `summaryFindings`, and R110 "Accepted gaps" ends with the marker-race clause.
- [x] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` is silent, and `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): five in-place edits, no new ids, rendered below.

  R81 acceptance (the line after `- R81: The commit and commit-fixes steps' args carry --no-stash after --auto.`):

  ```diff
  -  - Acceptance: exec cases whose descriptions start with `ship-nostash:`.
  +  - Acceptance: the `# from: ship-nostash:` assertion of exec case `ship-threshold: (c)` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`.
  ```

  R78 acceptance:

  ```diff
  -  - Acceptance: exec cases `ship-summary-commits: (a)` and `ship-summary-commits: (b)` in `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml`.
  +  - Acceptance: exec cases `ship-summary-commits: (b)` and `ship-summary-commits: (c)` in `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml`, and the `# from: ship-summary-commits: (a)` assertion of exec case `ship-step: (cf8)` in `tests/promptfoo/datasets/ship-stepper-exec.yaml`.
  ```

  R107 acceptance:

  ```diff
  -  - Acceptance: exec cases `ship-fix-scope: (a)` and `(b)` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`.
  +  - Acceptance: exec case `ship-fix-scope: (a)` and the `# from: ship-fix-scope: (b)` assertion of exec case `ship-fix-subject: (a)` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`.
  ```

  R106, in the sentence that starts `` `findings` is the `findings` array of the review summary that round's gate read ``:

  ```diff
  -… each entry `{ severity, dimension, path, line, title }`, or null when the summary is missing, stale, malformed or has no `findings` array.
  +… each entry `{ severity, dimension, path, line, title }`, or null when the summary is missing, stale, malformed or has no `findings` array. Only entries that are objects with a `severity` of `critical`, `high`, `medium`, `low` or `info` and a string `path` and `title` are kept; `dimension` is null when it is not a string, and `line` is null when it is absent.
  ```

  R110, end of the requirement paragraph:

  ```diff
  -… Accepted gaps: an agent that dies without SubagentStop keeps the hook quiet for up to 2 hours; a harness without SubagentStart events keeps today's behaviour.
  +… Accepted gaps: an agent that dies without SubagentStop keeps the hook quiet for up to 2 hours; a harness without SubagentStart events keeps today's behaviour; the marker read-modify-write of `subagent-track.js` takes no lock, so two step agents that start or stop at the same moment can lose an update (a lost stop keeps the hook quiet for up to the 2-hour limit; a lost start gives the behaviour from before R110), and this race is accepted.
  ```
- names: R78, R81, R106, R107, R110.
- mirror: the acceptance wording of R109 (``exec cases `ship-summary-file:` in `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml` ``).
- decisions: host-case naming (Key Decisions); the R106 sentence mirrors the `.filter` and `.map` of `summaryFindings` in `plugins/sdlc-utilities/scripts/skill/ship.js`.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy via `cp`.

### Task 2: received-review spec R33 acceptance and R38 in the skill doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — R33 acceptance line
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy (`cp`)
- Modify: `docs/skills/received-review-sdlc.md` — add `### Removed phrases` (R38)
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — byte copy (`cp`)

**Notes:** received-review-sdlc has no companion `*.md` besides SKILL.md, and `skills-meta.ts` is listed in Task 1, so the copy rule is met. The new paragraph restates the R38 rule of SKILL.md Step 11 for users. It is not a new rule. Findings: F-spec-acceptance-vs-dataset-cases-1, F-readme-skilldoc-skillmd-wording-3.

**Acceptance criteria:**
- [x] The R33 acceptance line names the `# from: rr-plan:` assertions of cases `rr-scope: (a)` and `rr-scope: (b)` in `received-review-prepare-exec.yaml`.
- [x] `docs/skills/received-review-sdlc.md` has a `### Removed phrases` section that cites R38, placed between `### Doc-versus-spec findings` and `## Configuration`.
- [x] `cmp` of each edited file against its site copy is silent.

**Contract:**
- shape (openspec + docs): spec edit:

  ```diff
  -  - Acceptance: exec cases whose descriptions start with `rr-plan:`.
  +  - Acceptance: the `# from: rr-plan: (a)` and `# from: rr-plan: (b)` assertions of exec cases `rr-scope: (a)` and `rr-scope: (b)` in `tests/promptfoo/datasets/received-review-prepare-exec.yaml`.
  ```

  Doc edit, inserted after the `### Doc-versus-spec findings` paragraph (the one ending `When the code matches the spec, the doc is fixed.`) and before the `---` line that precedes `## Configuration`:

  ```markdown
  ### Removed phrases

  When the project has `tests/promptfoo/datasets`, a fix that removes or rewords a sentence, phrase, name or count first greps those datasets for the old text (R38). Every case that counts or asserts the old text is updated in the same change set, and the Step 12 summary names those cases.
  ```
- names: R33, R38; heading `### Removed phrases`.
- mirror: `### Doc-versus-spec findings` in `docs/skills/received-review-sdlc.md`; the R38 bullet of `docs/specs/received-review-sdlc.md`.
- decisions: no R39 text (Deviations).
- sync: both site copies via `cp`.

### Task 3: commit-sdlc spec commit-subject acceptance

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/commit-sdlc.md` — R-subject-verbatim acceptance line
- Modify: `site/src/content-source/specs/commit-sdlc.md` — byte copy (`cp`)
- Modify: `docs/skills/commit-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/commit-sdlc.md` — check only, no change expected

**Notes:** Case (d) lives as a `# from:` assertion in `commit-prepare: default flags with no args` of `commit-prepare-exec.yaml` (F-spec-acceptance-vs-dataset-cases-4).

**Acceptance criteria:**
- [x] The acceptance line reads: ``Acceptance: exec cases `commit-subject: (a)` to `commit-subject: (c)` and the `# from: commit-subject: (d)` assertion of exec case `commit-prepare: default flags with no args` show `flags.subject` set, rejected or null; exec case `commit-subject: expected-subject gate` shows the gate's exit 3 path.``
- [x] `cmp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md` is silent.

**Contract:** shape (openspec): one acceptance line under R-subject-verbatim, replacing ``exec cases `commit-subject: (a)` to `commit-subject: (d)` show`` with the text in the first criterion; names: R-subject-verbatim; sync: site spec copy via `cp`

### Task 4: review-sdlc P11 sort wording and the empty-findings assertion

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/review-sdlc.md` — P11 sort wording
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy (`cp`)
- Modify: `tests/promptfoo/datasets/review-consolidate-exec.yaml` — one more assertion on case `review-consolidate: no findings gives APPROVED and 0 total`
- Modify: `docs/skills/review-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/review-sdlc.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — check only, no change expected

**Notes:** The case already writes `{{project_root}}/summary.json`. The assertion reads it the way the `findings-mixed` summary assertions in the same dataset do. With `-j 1` no other case writes that path between the run and the assertion. Findings: F-review-consolidate-findings-empty-and-sort-1, -2, -3.

**Acceptance criteria:**
- [x] P11 states the `compareFindings` order across all dimensions, and that the comment uses the same order within each dimension section.
- [x] The case gains a JavaScript assertion that `summary.json` `findings` is an array of length 0 and `counts` sum to 0. Assertion count in `review-consolidate-exec.yaml`: +1 (spec-id coverage baseline: growth only, no update needed).
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "review-consolidate: no findings"`: it passes.

**Contract:**
- shape (openspec + code): spec edit in P11:

  ```diff
  -`findings` is the list of consolidated findings after dedupe, sorted as in the comment, one `{ severity, dimension, path, line, title }` per finding
  +`findings` is the list of consolidated findings after dedupe, sorted across all dimensions by severity (critical first), then file path, then starting line, then the full line string (the comment uses the same order within each dimension section), one `{ severity, dimension, path, line, title }` per finding
  ```

  New assertion, appended to the case's `assert:` list:

  ```yaml
      # P11: no findings gives an empty findings array in the summary
      - type: javascript
        value: |
          const s = JSON.parse(process.getBuiltinModule('fs').readFileSync(context.vars.project_root + '/summary.json', 'utf8'));
          const total = Object.values(s.counts).reduce((a, b) => a + b, 0);
          return Array.isArray(s.findings) && s.findings.length === 0 && total === 0 ? true : `FAIL: findings ${JSON.stringify(s.findings)} counts ${JSON.stringify(s.counts)}`;
  ```
- names: P11; case `review-consolidate: no findings gives APPROVED and 0 total`.
- mirror: the `# from: review-consolidate: summary findings list ...` assertion in the same dataset.
- decisions: assertion on the existing repo:// case (Key Decisions).
- sync: site spec copy via `cp`.

### Task 5: R109 final-check-open summary file case and the wrapper headers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-ship-prepare-summary.js` — new `--case summary-file-final-check-open`; header names the right datasets
- Modify: `tests/promptfoo/scripts/run-ship-prepare-plan-fields.js` — header also names `ship-stepper-flows-exec.yaml`
- Modify: `tests/promptfoo/datasets/ship-stepper-flows-exec.yaml` — new case `ship-summary-file: (c)` after `ship-summary-unwritable: (b)`

**Notes:** The description starts `ship-summary-file:`, so the R109 acceptance line covers it without a spec edit. The case removes any old summary file first, so a file left by case (a) cannot make it pass. Findings: F-exec-test-gaps-jira-r77-r37-r109-4, F-spec-acceptance-vs-dataset-cases-6, -7.

**Acceptance criteria:**
- [x] `node tests/promptfoo/scripts/run-ship-prepare-summary.js --case summary-file-final-check-open` prints one JSON line `{ o, file }`. The new case asserts that the last `dispatch_review` envelope has `ext.reason === 'final-check-open'` and that `file.finalCheck.open`, `file.steps` and `file.branch` match the envelope's summary.
- [x] The `run-ship-prepare-summary.js` header names `datasets/ship-stepper-exec.yaml` and `datasets/ship-stepper-flows-exec.yaml`, not `ship-prepare-exec.yaml`, and its `Cases` list gains the new name. The `run-ship-prepare-plan-fields.js` header names both `datasets/ship-prepare-exec.yaml` and `datasets/ship-stepper-flows-exec.yaml`.
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-summary-file"`: all matching cases pass. Case count in `ship-stepper-flows-exec.yaml`: +1, assertions +1 (baseline growth only).

**Contract:**
- shape (code): new entry in `CASES`:

  ```js
  'summary-file-final-check-open'() {
    fs.rmSync(executionFile('ship-summary-feat-ship.json'), { recursive: true, force: true });
    const r = cp.spawnSync('node', [
      STEPPER, '--project-root', process.cwd(), '--scenario', 'rounds-final-check', '--seed', 'frozen',
      '--summary', 'high-1.json', '--final-summary', 'medium-1.json', '--review-threshold', 'medium',
    ], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 26 });
    print({ o: JSON.parse(r.stdout), file: JSON.parse(readText(executionFile('ship-summary-feat-ship.json'))) });
  },
  ```

  Headers, before → after:

  ```diff
  - * Test wrapper for the ship summary, step-text and lean cases of datasets/ship-prepare-exec.yaml
  + * Test wrapper for the ship summary, step-text and lean cases of datasets/ship-stepper-exec.yaml and
  + * datasets/ship-stepper-flows-exec.yaml
  ```

  ```diff
  - * Test wrapper for the ship-prepare plan-field and forwarded-flag cases of datasets/ship-prepare-exec.yaml
  + * Test wrapper for the ship-prepare plan-field and forwarded-flag cases of datasets/ship-prepare-exec.yaml
  + * and datasets/ship-stepper-flows-exec.yaml
  ```

  New dataset case (vars mirror `ship-summary-file: (a)`):

  ```yaml
  - description: "ship-summary-file: (c) a final-check-open stop writes ship-summary-<slug>.json with the open findings"
    vars:
      script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin"
      script_path: "repo://tests/promptfoo/scripts/run-ship-prepare-summary.js"
      script_args: "--case summary-file-final-check-open"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-ship-stepper"
    assert:
      - type: javascript
        value: |
          const { o, file } = JSON.parse(output);
          const reviews = o.calls.filter(c => c.args[1] === 'dispatch_review');
          const e = reviews.length ? reviews[reviews.length - 1].envelope : null;
          if (!e || !e.ext || e.ext.reason !== 'final-check-open') return `FAIL: no final-check-open stop`;
          const s = e.ext.summary;
          if (file.schemaVersion !== 1 || file.branch !== 'feat/ship') return `FAIL: header ${JSON.stringify(file).slice(0, 200)}`;
          if (JSON.stringify(file.steps) !== JSON.stringify(s.steps)) return 'FAIL: steps';
          return file.finalCheck && JSON.stringify(file.finalCheck.open) === JSON.stringify(s.finalCheck.open) && file.finalCheck.open.length > 0 ? true : `FAIL: finalCheck ${JSON.stringify(file.finalCheck)}`;
  ```

  Usage errors stay as they are: no `--case`, an unknown name or an unknown flag exits 2 with the message on stderr and nothing on stdout.
- names: `summary-file-final-check-open`; case `ship-summary-file: (c) ...`.
- mirror: `'summary-file-equal'` in `run-ship-prepare-summary.js`; the `run-ship-stepper.js` arguments of case `ship-final-check: (f)`.
- decisions: the old file is removed before the run (Notes).
- sync: the header `Cases` list in `run-ship-prepare-summary.js`.

### Task 6: jira --cache-dir case that can fail

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-jira-cache.js` — new `--scenario cache-dir`
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — rewrite case `jira-cache: --cache-dir finds the cache in the given dir` to use the wrapper; update the section comment above the `jira-cache:` cases
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — refresh with `node tests/promptfoo/scripts/check-spec-id-coverage.js --update`

**Notes:** The section comment above the `jira-cache:` cases (`# jira.js cache flags (--load, --cache-dir plain; --clear, ...` and its next line) says `--cache-dir` runs plain; after the rewrite it runs through `run-jira-cache.js`, so the comment reads `--load plain; --cache-dir, --clear, --save-field, --init-templates, --copy-template via run-jira-cache.js`. The rewrite drops the baseline flag key `jira.js --cache-dir` (its only case was this one) and adds growth to `run-jira-cache.js --scenario`, `--home` and `--project`. After the dataset edit, run `node tests/promptfoo/scripts/check-spec-id-coverage.js --update`, then `git diff tests/promptfoo/baselines/spec-id-coverage.json`: the removed or lowered lines must be only `"jira.js --cache-dir": 1` (removed) and `"jira.js --check"` and `"jira.js --project"` (each down by 1); every other change is growth (a count up or a new key, possibly from other tasks of the same wave or an already stale count at HEAD). `--update` rewrites the whole baseline from the current scan, so run it after the wave's other dataset edits are done. The wrapper moves the copied `.sdlc-cache` out of the temp HOME into a sibling temp dir. So the cache is outside HOME and outside the cwd: the home scan cannot find it, and `getCachePath` writes no `.gitignore` into it. The header names the scenarios in two places (the description and the Usage line); both gain `cache-dir`. Finding: F-exec-test-gaps-jira-r77-r37-r109-1.

**Acceptance criteria:**
- [x] With `--cache-dir`, the call reports `exists: true` and `cachePath` equal to `<cache dir>/SAVETEST.json` exactly. Without the flag, the same HOME reports `exists: false` and `cachePath: null`.
- [x] The rewritten case asserts both calls. Assertions in `jira-sdlc-exec.yaml`: from 1 to 2 for this case (+1). The `dataset-asserts-allow.json` entry for `jira-prepare: --check surfaces templates.fallbacks ...` is not touched.
- [x] The section comment above the `jira-cache:` cases no longer says `--cache-dir plain`.
- [x] `tests/promptfoo/baselines/spec-id-coverage.json` is refreshed with `--update`; its diff removes the `"jira.js --cache-dir"` key; `"jira.js --check"` and `"jira.js --project"` each go down by 1 and stay above 0; every other change is growth.
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "jira-cache"`: every `jira-cache` case passes.
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "spec-id-coverage: \(a\)"`: it passes.

**Contract:**
- shape (code): `SCENARIOS` gains `'cache-dir'`; new switch branch:

  ```js
  case 'cache-dir': {
    // The cache leaves HOME, so only --cache-dir can find it.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cache-dir-'));
    fs.renameSync(path.join(tmp, '.sdlc-cache'), path.join(outside, '.sdlc-cache'));
    const dir = path.join(outside, '.sdlc-cache', 'jira', 'mycompany_atlassian_net');
    run(['--check', '--cache-dir', dir]);
    run(['--check']);
    fs.rmSync(outside, { recursive: true, force: true });
    break;
  }
  ```

  The stdout shape stays `{"scenario","calls","files"}`; `calls[0].args[2]` holds the cache dir that the assertion compares with. The header Usage line lists `clear|save-field|init-templates|copy-template|cache-dir`. Usage errors stay exit 2, message on stderr, nothing on stdout.

  Rewritten case:

  ```yaml
  - description: "jira-cache: --cache-dir finds the cache in the given dir"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-jira-cache.js"
      project_root: "file://fixtures-fs/jira-save-roundtrip"
      script_args: "--scenario cache-dir --home {{project_root}} --project SAVETEST"
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          const c = JSON.parse(o.calls[0].stdout);
          return c.exists === true && c.cachePath === o.calls[0].args[2] + '/SAVETEST.json' ? true : `FAIL: ${output}`;
      - type: javascript
        value: |
          const o = JSON.parse(output);
          const c = JSON.parse(o.calls[1].stdout);
          return c.exists === false && c.cachePath === null ? true : `FAIL: without --cache-dir ${output}`;
  ```
- names: scenario `cache-dir`.
- mirror: the `clear` scenario and the `jira-cache: --clear ...` case.
- decisions: reuse `run-jira-cache.js` (Key Decisions); the existing fixture is enough.
- sync: the header comment of `run-jira-cache.js`; the `jira-cache:` section comment in `jira-sdlc-exec.yaml`; `baselines/spec-id-coverage.json` via `--update`.

### Task 7: R77 fixture data for g17Findings

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/plan-splice-latest/iter-1/merged.json` — add a non-empty `g17Findings`
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — case `plan-splice: (d)` also asserts that no Suggested Review Dimensions section is written

**Notes:** This edits an assertion of an existing inline case. It adds no new case, so the "new cases are repo:// scripts" rule does not apply. Converting the case is W-E4 and W-E5 scope. Finding: F-exec-test-gaps-jira-r77-r37-r109-2.

**Acceptance criteria:**
- [x] `iter-1/merged.json` carries `g17Findings` with one finding and a `rendering` that holds `## Suggested Review Dimensions` and the marker `LEAKED G17 RENDERING`.
- [x] The case (d) expression also requires `!o.text.includes('## Suggested Review Dimensions') && !o.text.includes('LEAKED G17 RENDERING')`. The assertion count is unchanged (one condition is added to the existing expression).
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-splice"`: cases (a) to (f) pass.

**Contract:**
- shape (code): fixture field diff:

  ```diff
    {
      "guardrailCompliancePayload": "| Guardrail | Severity | Status | Rationale |\n|---|---|---|---|\n| no-scope-creep | warning | PASS | Newest table with a payload |",
  +   "g17Findings": {
  +     "findings": [{ "kind": "CREATE", "dimension": "docs" }],
  +     "suppressed_count": 0,
  +     "rendering": "## Suggested Review Dimensions\n\n- CREATE `docs`: LEAKED G17 RENDERING"
  +   },
      "scorecard": { … }
    }
  ```

  Case (d) expression, last two lines:

  ```diff
  -          o.text.includes('OLD SCORECARD BODY') && !o.text.includes('NEW SCORECARD BODY');
  +          o.text.includes('OLD SCORECARD BODY') && !o.text.includes('NEW SCORECARD BODY') &&
  +          // R77: --critique-dir writes only the guardrail table, never the g17 rendering
  +          !o.text.includes('## Suggested Review Dimensions') && !o.text.includes('LEAKED G17 RENDERING');
  ```
- names: `g17Findings`, marker `LEAKED G17 RENDERING`.
- mirror: the `g17Findings` of `tests/promptfoo/fixtures-fs/plan-splice/merged.json`.
- decisions: give the shared fixture the data (Key Decisions). `splicePlan` needs only a non-empty `findings` array and a string `rendering`.
- sync: cases (e) and (f) read the same fixture and keep their outcomes (Research Findings).

### Task 8: R37 end-to-end received-review case in a linked worktree

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/project-received-review-worktree-roots/setup.sh`
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — new case `received-review-prepare (R37): (e2e) ...` after the existing R37 case

**Notes:** The fixture uses `git worktree add`, so the harness builds it per case. The setup writes `local.json` with different values in the main checkout and in the worktree, and a review dimension only in the worktree. So a manifest value read from the wrong root fails an assertion. `setup.sh` creates `worktrees/wt1/.sdlc/review-dimensions/` with `mkdir -p`, since the worktree has no `.sdlc/` of its own beyond the committed `config.json`. Finding: F-exec-test-gaps-jira-r77-r37-r109-3.

**Acceptance criteria:**
- [x] `setup.sh` carries the fixture guard line (`if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi`) before its first `git init` (`fixture-guard: (a)`).
- [x] The case runs `skill/received-review.js --output-file --comment-file review-comment.md` from `worktrees/wt1` with no `--project-root`. It asserts that the manifest path starts with `<project_root>/.sdlc/execution/` (main checkout), that `flags.alwaysFixSeverities` is `["low"]` (main `local.json`, not the worktree's `["critical"]`), and that `findings[0].hardenSurfaceHint` is `"review-dimensions"` (the dimension exists only in the worktree).
- [x] Run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "received-review-prepare \(R37"`: both R37 cases pass. The `fixture-refs: (a)` count `refs` is unchanged (that check scans only the behavioural and headless datasets). `received-review-prepare-exec.yaml`: +1 case, +1 assertion. The spec-id coverage scan gains the new flag keys `received-review.js --output-file` and `received-review.js --comment-file` (growth only, no baseline update needed).

**Contract:**
- shape (code): fixture layout after `setup.sh`:

  ```
  .sdlc/config.json                     {"version":4}  (committed)
  .sdlc/local.json                      {"receivedReview":{"alwaysFixSeverities":["low"]}}  (written after the commit)
  worktrees/wt1/                        git worktree add -q -b feature/rr-roots worktrees/wt1
  worktrees/wt1/.sdlc/local.json        {"receivedReview":{"alwaysFixSeverities":["critical"]}}
  worktrees/wt1/.sdlc/review-dimensions/wtonlydim.md   "# wtonlydim"
  worktrees/wt1/review-comment.md       one finding: "#### [HIGH] Rule gap", "**File:** `src/a.js:3`", body "The wtonlydim rule is not met."
  ```

  The comment file mirrors the heading layout of `fixtures-fs/project-received-review-scope/review-comment.md` (one dimension, one finding). The name `wtonlydim` must not contain the text `review-dimensions`, or the hint would match without the dimension file.

  New case:

  ```yaml
  - description: "received-review-prepare (R37): (e2e) from a linked worktree the manifest takes local.json from the main checkout and dimensions from the worktree"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/received-review.js"
      script_args: "--output-file --comment-file review-comment.md"
      script_cwd: "{{project_root}}/worktrees/wt1"
      script_passthrough: true
      project_root: "file://fixtures-fs/project-received-review-worktree-roots"
    assert:
      - type: javascript
        value: |
          const p = output.trim();
          if (!p.startsWith(context.vars.project_root + '/.sdlc/execution/')) return `FAIL: manifest path ${p}`;
          const m = JSON.parse(process.getBuiltinModule('fs').readFileSync(p, 'utf8'));
          if (JSON.stringify(m.flags.alwaysFixSeverities) !== '["low"]') return `FAIL: alwaysFixSeverities ${JSON.stringify(m.flags)}`;
          return m.findings.length === 1 && m.findings[0].hardenSurfaceHint === 'review-dimensions' ? true : `FAIL: findings ${JSON.stringify(m.findings)}`;
  ```
- names: fixture `project-received-review-worktree-roots`; dimension `wtonlydim`.
- mirror: `fixtures-fs/project-linked-worktree-config/setup.sh` (guard and worktree layout); case `commit-prepare (R21): manifest is written under the main checkout's .sdlc/execution/`.
- decisions: new fixture and a direct repo:// case (Key Decisions). A manifest under `.sdlc/execution/out/` still passes the prefix check.
- sync: none.

### Task 9: tests/promptfoo/README.md providers and HOME wording

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/README.md` — the providers sentence of "Script execution tests" and the parallel-runs sentence of "Run"

**Notes:** `hook-runner.js` sets HOME to `script_home` without a copy, and gives a temp cwd only when `script_cwd` is unset; the README has no site copy. Findings: F-readme-skilldoc-skillmd-wording-1, -2.

**Acceptance criteria:**
- [x] The first sentence of "Script execution tests" reads: "The exec config `promptfooconfig-exec.yaml` runs the plugin's scripts directly through `providers/script-runner.js`, and `promptfooconfig-exec-hooks.yaml` runs the hooks through `providers/hook-runner.js`, which pipes `script_stdin` to the hook and returns its stdout, stderr and exit code as JSON (no LLM involved), about 80 datasets in total under `datasets/*-exec*.yaml`."
- [x] The parallel-runs sentence reads: ``Parallel runs (`-j N`) are supported: a case without `script_cwd` runs in its own temp cwd, a fixture with a `setup.sh` is copied per case, and `script-runner.js` copies an in-repository `script_home` per case; `hook-runner.js` sets HOME to `script_home` as given and copies nothing.``

**Contract:** shape (docs): two in-place sentence rewrites in `tests/promptfoo/README.md`, text as in the criteria; names: `providers/hook-runner.js`, `script_home`; sync: none (no site copy)

### Task 10: execute-plan-sdlc Step 8-bis per-wave skip wording

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — Step 8-bis sentence and the "Final spec completeness" checklist row
- Modify: `docs/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/spec-compliance-reviewer.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — check only, no change expected

**Notes:** Only the reference to the rule is renamed; the rule is unchanged, so no spec task is needed (Key Decisions). Finding: F-readme-skilldoc-skillmd-wording-4.

**Acceptance criteria:**
- [x] Step 8-bis reads ``…or when `openspecSpecs` is non-empty, except when the per-wave skip below applies (`flags.specReviewer === 'per-wave'`, every per-wave review passed and the plan has 3 or fewer waves).`` and no `few-waves` text is left in the file.
- [x] The "Final spec completeness" row reads ``(when openspecSpecs available, unless the Step 8-bis per-wave skip applied: every per-wave review passed, 3 or fewer waves)``.

**Contract:** shape (code): two phrase replacements in SKILL.md, `except under the per-wave few-waves rule below` → the criterion-1 text and `unless the per-wave few-waves skip of Step 8-bis applied` → the criterion-2 text; names: Step 8-bis; sync: none (no test asserts `few-waves`)

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code and test tasks (4-8) add or strengthen promptfoo cases; Tasks 1-3, 9 and 10 are text-only. |
| no-ci-bypass | error | PASS | No step skips or disables CI checks. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no full-suite or retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a W-E2 item; item 9, R39 and test splitting are explicitly excluded. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; Task 1 groups several spec edits to one file. |
| scripts-over-llm-logic | error | PASS | Changes are tests and text only; no LLM logic is added. |
| yagni | warning | PASS | Nothing speculative is added. |
| cross-skill-consistency | error | PASS | Copy rules, site copies and companion files are checked. |
| pr-link-github-issue | error | PASS | W-E2 is a register id, not a GitHub issue, so the rule does not apply. |
| dry | warning | PASS | Existing wrappers are reused (run-jira-cache.js, run-ship-prepare-summary.js). |
| kiss | warning | PASS | The smallest edits are chosen; a fixture field and one assertion instead of new cases. |
| spec-first | error | PASS | The Task 10 SKILL.md edit renames a reference only, with no behaviour change, and Key Decisions records this. |
| project-agnostic | error | PASS | Edits are plugin specs, docs and the test suite; no repo-local config is changed to fake a plugin feature. |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill flag dispatch is touched. |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced or changed. |
| flag-resolution-single-source | warning | PASS | No flag resolution is changed. |
| state-premise | error | PASS | The Context section states the root problem: acceptance lines, headers and docs that do not match the code or cases. |
| smallest-viable-cut | warning | PASS | Key Decisions justify each choice; all tasks are small and independent. |
| failure-audience | warning | FAIL | The plan does not name who or what is affected if it ships incorrectly. |
| explicit-non-goals | warning | PASS | The Deviations table lists excluded items: item 9, case splitting, R39 and the TODO note, and records the Task 6 baseline refresh. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Key Decisions and Decisions taken without the owner. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described. |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added to a user-invoked prepare script; the test-wrapper --scenario cache-dir is not a skill prepare flag. |
| workspace-mode-compatibility | error | PASS | The change is test and doc only; Task 8 explicitly exercises the linked-worktree root resolution. |
| prompt-cache-hit-ratio | warning | PASS | No dispatched-prompt content is changed. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Tasks 1-4 and 10 edit many `.md` files (for example `docs/specs/ship-sdlc.md` and `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`) that the dimension's current triggers do not cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: docs-skill-sync (U2)

**Why:** Task 9 rewrites two sentences in `tests/promptfoo/README.md`, which is outside the dimension's current triggers.

**Severity hint:** medium

**Patch:** add trigger `**/README.md`

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — add trigger `**/README.md`

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### CREATE: documentation-quality-review

**Why:** Task 9 (`tests/promptfoo/README.md`) and the site copies under `site/src/content-source/` in Tasks 1-4 and 10 are documentation that no existing dimension reviews.

**Severity hint:** medium

**Triggers:** `site/**`, `tests/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `tests/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 2 | 2 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 D3/R78/D10: spec acceptance lines naming # from:-only cases fixed; run-ship-prepare-summary.js and run-ship-prepare-plan-fields.js headers corrected | Task 1, Task 2, Task 3, Task 5 | covered |
| 2 D4: jira-sdlc-exec.yaml --cache-dir case can fail | Task 6 | covered |
| 3 D5: R77 g17Findings test, R37 end-to-end case, R109 final-check-open write case | Task 7, Task 8, Task 5 | covered |
| 4 D8/P11: findings [] tested; sort wording matches review-consolidate.js | Task 4 | covered |
| 5 R110 (PD-2): accepted-gap sentence on subagent-track.js marker race, with site copy | Task 1 | covered |
| 6 R106: summaryFindings filter text in docs/specs/ship-sdlc.md | Task 1 | covered |
| 7 D6/D7: tests/promptfoo/README.md names hook-runner.js and does not claim a HOME copy | Task 9 | covered |
| 8 R38 added to docs/skills/received-review-sdlc.md; execute-plan-sdlc few-waves label fixed | Task 2, Task 10 | covered |
| 9 Optional: plan-sdlc SKILL.md planner hint (may be dropped with reason) | — | uncovered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

Every acceptance line in the W-E2 scope points at something a reader can find with one `grep`: a case description, or a `# from:` assertion inside a named case of a named dataset.

The two ship wrapper headers name the datasets that call them.

Five checks that were missing or could not fail now exist and can fail:

- the jira `--cache-dir` lookup, with the cache outside HOME;
- the R77 guardrail-only splice, with g17 data present;
- the R37 config and `local.json` roots, end to end from a linked worktree;
- the R109 summary file at a `final-check-open` stop;
- the P11 empty `findings` array.

The specs state the R106 entry filter, the R110 marker race and the P11 sort order as the code has them. The test README names both providers and says what each one copies. The received-review doc explains R38, and the execute-plan-sdlc Step 8-bis text names the rule it points to.

No plugin script changes. Every site copy is byte-identical to its source.

## OpenSpec Appendix

Not applicable — no OpenSpec change
