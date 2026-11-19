# Lean W34 Follow-ups P Implementation Plan

**Commit:** `fix(#9447): plan, pr, ship - follow-ups from w28 to w33`
**Goal:**
- Count only the paths a task really edits in the `--lightweight` tier check, and pin the bounds with boundary cases (#9431, #9442).
- Re-dispatch, not carry, the Step 3 lanes that blocked, in Step 5 iteration 1 and in non-material Step 5 rounds (#9432).
- Make `plan.js --lightweight` skip the explore pack, so the user doc and spec A5 are true (#9438), and name the forced route in the site step text (PR #109 deferred low).
- Add the missing PF7 exec case "compact Contract needs shape and names" (#9439).
- Append a configured PR footer deterministically (#9429) and stop the `pr-link-github-issue` guardrail from firing on internal register ids (#9433).
- Give ship's commit-fixes step the issue scope of the plan **Commit:** subject, so it never has to ask for it under `--auto` (#9434).
**Architecture:** Spec first. Task 1 edits the plan-sdlc spec (R73, A5, P8, new R76). Tasks 2 and 3 change `plan-critique.js`, `plan-parse.js`, `plan.js`, the critique orchestrator and `review-loop.md`, and add exec cases to `plan-prepare-exec.yaml` (Task 3 after Task 2: shared dataset). Task 4 adds a PF7 fixture and case. Task 5 updates the plan-sdlc user doc and `skills-meta.ts`. Task 6 adds pr-sdlc R21 and the `pr.footer` append in `pr.js --validate-body`; Task 7 documents it; Task 8 sets the footer and rewrites the guardrail text in `.sdlc/config.json`. Task 9 adds ship-sdlc R107 and the `--scope` forward in `ship.js`.
**Source:** conversation context (wave P of the consolidated follow-up order, tracking #9447; items #9429, #9431, #9432, #9433, #9434, #9438, #9439, #9442 and the PR #109 deferred low on `site/src/data/skills-meta.ts`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-tier: |plan-prepare: \(lightweight|plan-diff: \(rerun|plan-sdlc/rerun-sentinels|plan-format-compact: |pr.js --validate-body: footer|ship-fix-scope: "`

---

## Context

**What problem does this change solve?**

Waves w28 to w33 left nine small follow-ups. Each one was re-checked at HEAD `9aa85b5`. All nine still reproduce.

- The tier check of `--lightweight` plans counts every `**Files:**` path. That includes check-only entries and site byte copies. So plan-sdlc wording waves always break the 8-file bound (w32: 13 > 8; w33: 14). The count is at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:120` (#9431).
- The tier bounds have no exec case for a files-only breach, or for the 6-task and 7-task boundary (#9442).
- In Step 5 iteration 1 the critique orchestrator runs with `BEFORE_PLAN: none`. So it never computes `rerun`, and `--carry iter-0` copies the Step 3 lane results that blocked. Those results are older than the Step 4 fix (#9432). PR #110 did not change this. Non-material later rounds have the same gap: they dispatch only `review.lenses`.
- `docs/skills/plan-sdlc.md:104` says `--lightweight` creates no explore tempdir. But `plugins/sdlc-utilities/scripts/skill/plan.js:722` always runs `runExplorePack` (#9438).
- The PF7 branch "compact Contract needs shape and names" (`validate-plan-format.js:425-426`) has no exec case (#9439).
- `site/src/data/skills-meta.ts:36` describes inline exploration for "lightweight (complexity-routed) plans" only. It leaves out the `--lightweight` route.
- pr-sdlc writes the PR body with the model. Nothing adds the "Generated with" footer, so ship added it by hand in w31 (#9429).
- The guardrail `pr-link-github-issue` (`.sdlc/config.json:57-60`) asks for `Fixes #N` on internal register ids. These ids are not GitHub issues (#9433).
- Ship's commit-fixes step gets no issue id when the plan has no **Fix commit:** line. Under `--auto` the drafter then has no `#N` for `commit.subjectPattern` (#9434).

**What prompted this change now?**

The consolidation architect ordered these items as wave P (accepted under owner delegation, 2026-11-19).

**What does success look like?**

- A wording wave with byte copies and check-only entries stays on the Lightweight route.
- Step 5 never merges a lane result that was blocking before the last fix.
- The `--lightweight` route makes no explore tempdir.
- A PR body gets the configured footer exactly once, from a script.
- Ship's fix commit carries the plan's issue scope without a question.

## Research Findings

The explore brief (4 dimensions, 32 findings) and direct reads at HEAD found these facts.

**Tier check (F-plan-tier-count-edited-paths-1, -2, -5).**

- `planShape` counts distinct paths from `parseFilesEntries` (`plugins/sdlc-utilities/scripts/lib/plan-parse.js:241-252`). That function returns `{ kind, path }` only. The text after the path is dropped.
- `TIER_BOUNDS` is `{ tasks: 6, complex: 0, files: 8 }` (`plan-critique.js:137`). A breach is `>`. So 6 tasks pass and 7 tasks breach. `REVIEW_FANOUT_TASKS` is 8 (`:128`), so 7 tasks still get one reviewer.
- Recent plans already mark entries with stable words: "check only", "no change expected" and "byte copy" (for example `docs/plans/2026-11-18-lean-w33-audit-fixes-a.md`).
- The existing `plan-tier:` cases (a) to (e) are at `tests/promptfoo/datasets/plan-prepare-exec.yaml:521-557`.

**Rerun after a fix (F-critique-carry-redispatch-after-fix-1, -3).**

- `diffMaterial` already returns `rerun` and adds it to `dispatch.lanes` when `--prev-dir` is given (`plan-critique.js:210-216`).
- The existing case "plan-diff: (route) fan-out plan keeps per-lens rerun" runs it with the same file as before and after. It returns `rerun: ['lens:requirements', 'static-structural']`. So no script change is needed. Only the orchestrator (`plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:40-48`) and the fallback in `review-loop.md` must use it.

**Explore pack (F-plan-tier-count-edited-paths-3, -4).**

- `plan.js` parses `lightweight` (`:76-90`) but `runExplorePack` (`:722`) ignores it.
- Spec P8 (`docs/specs/plan-sdlc.md:190`) says the script always writes a manifest on success. It must change with the fix.

**PR footer (F-pr-footer-config-key-1, -2, -5).**

- The body is written by the model to a `mktemp` file, then checked by `pr.js --validate-body --file <f>` (`plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:448-465`). Then `gh` publishes the same file with `--body-file`.
- `validateBodyMode` (`plugins/sdlc-utilities/scripts/skill/pr.js:639-678`) already resolves `projectRoot`. It is the one script step every body passes through.
- `prSection` in `schemas/sdlc-config.schema.json:222-257` has `additionalProperties: false`. A new key needs a schema entry.
- The next free pr-sdlc id is R21.
- Exec fixtures run in place (`tests/promptfoo/providers/script-runner.js` does not copy them). A test that rewrites a body file must use a temp directory. The `-e` inline style of `ship-fix-subject:` cases (`ship-prepare-exec.yaml:4607`) does this.

**Ship fix commit (F-ship-commit-issue-derivation-and-pf7-1, -2).**

- `computeSteps` already receives `planSubject` at both call sites (`ship.js:2616-2622`, `:3503`).
- The `commit-fixes` step args are at `ship.js:629-641`. Without **Fix commit:** they carry no `--subject`.
- commit-sdlc takes `--scope <scope>` (A2) and the drafter uses it as the conventional scope (`agents/commit-orchestrator.md:69`).
- The next free ship-sdlc id is R107. The next free plan-sdlc id is R76.

**PF7 (F-ship-commit-issue-derivation-and-pf7-7 to -10).**

- The case template is "plan-format-compact: (c)" at `tests/promptfoo/datasets/plan-format-exec.yaml:637-644`. It uses the fixture `project-plan-compact-standard`.

**Count checks over test files (F-104).** A search of `tests/promptfoo/scripts`, `tests/promptfoo/assertions`, `plugins/sdlc-utilities/scripts/ci` and `.claude/skills` found no check that counts cases in the datasets this plan touches.

**Commands.** Exec runs use the **Verification:** command above with a task-specific `--filter-pattern`. Main-session validators are listed in the project notes.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Marker for entries that are not counted | no | An entry is not counted when the text after its path contains `check only`, `no change expected` or `byte copy` (case-insensitive) | Plans already use these words; a path rule such as `site/src/content-source/**` would be project-specific (`project-agnostic` guardrail) |
| R74 `recheckLanes` drops `rerun` on a non-material fix (`plan-critique.js:219`) | no | Not changed | Outside #9432, which names Step 5 only; candidate follow-up |
| `pr.footer` in `/setup-sdlc` | no | No setup prompt is added | The brief asks for a config key; a setup prompt is new scope |
| Footer append place | no | `pr.js --validate-body` appends it, not a new SKILL step | Every body already passes through this script step; a script is deterministic (`scripts-over-llm-logic`) |
| Ship scope source | no | Ship forwards the conventional scope of the plan **Commit:** subject as `--scope`, not a bare issue number | commit-sdlc has `--scope` (A2) and no issue flag; the scope is project-agnostic |
| `commit.allowedScopes` | no | Ship does not check the derived scope against it | Accepted gap in R107: the planned subject already uses that scope; commit.js reports a disallowed scope as its normal error |
| Task file count | no | Tasks 5 and 9 list 7 entries; at most 4 are edits, the rest are copy-rule check-only entries | The copy check needs the copies under some task's Files |
| Directory check-only entry | no | Task 9 lists `plugins/sdlc-utilities/skills/ship-sdlc` once instead of its 6 companion files | The copy check accepts it (Step 3 flagged no ship-sdlc companion); w33 shipped the same pattern; nothing in it is edited, so staging is not affected |

## Decisions taken without the owner

- Not-counted marker words: `check only`, `no change expected`, `byte copy`.
- The footer is appended by `pr.js --validate-body`, idempotently.
- Ship forwards `--scope "<scope of the Commit subject>"` to commit-fixes only when there is no **Fix commit:** line.
- #9432 is fixed in the orchestrator prose and the fallback text; no script change.
- The R74 `recheckLanes` gap is left for a later wave.

## Key Decisions

- **What the tier counts.** The tier now counts edited paths only. The alternative was to raise the bound. That would let real large waves through. Excluding marked entries keeps the bound honest.

- **Where the marker lives.** The marker is plain text after the path in a Files entry. The alternative was a new Files kind (for example `Check:`). A new kind would change the plan format, `--strict-files` and the staging code. Plain text changes one parser field.

- **How Step 5 iteration 1 finds stale lanes.** The orchestrator runs `diff-material` with the plan as both before and after, plus `--prev-dir <CARRY>`. Nothing is material, so the result holds only `rerun`. The alternative was to copy a `plan-before.md` in Step 4 on every route. That would change how iteration 1 picks its lenses. The chosen way reuses a tested script path.

- **Footer in the script.** The footer text belongs to Claude Code, not to the plugin. So it is project config (`pr.footer`, empty by default), never hardcoded. The script appends it, so the model cannot forget it.

- **Ship uses `--scope`.** The fix commit takes the scope of the planned commit, for example `#9447`. The alternative was to build a whole fix subject. That would guess a description and could break `commit.subjectPattern`.

- **Task size and bundling.** Each task is the smallest cut of one item, except two. Task 3 holds #9438 and #9432 because both are small and both add cases to `plan-prepare-exec.yaml`; a separate task would add one more execute wave on the same file (F-43). Task 8 holds two one-line value edits in the same JSON file, which must have one owner.

- **Who is hurt by a wrong ship.** Plan authors: a wrong tier count sends a plan to the wrong route. Plan critique: a wrong rerun rule merges stale lane results. PR readers: a doubled or missing footer. Ship `--auto` runs: a wrong `--scope` gives a fix commit the wrong issue id. Each risk has an exec case in the task that makes it.

## Contract Examples

Code (from Task 2):

```markdown
**Contract:**
- shape (code): `parseFilesEntries(body)` returns `[{ kind, path, note }]`, `note` is the trimmed text after the path ('' when none); `planShape(text).files` counts distinct paths of entries whose `note` does not match `/\b(check only|no change expected|byte copy)\b/i`.
- names: `parseFilesEntries`, `planShape`, `NOT_EDITED_RE`.
- mirror: `planShape` at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:114-125`.
- decisions: plain-text marker, no new Files kind.
- sync: spec R73 wording (Task 1).
```

Docs (from Task 5):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` line 33 ("8 files" → "8 edited files") and line 104 (the lightweight-skip rule); byte copy to the site.
- names: the `--lightweight` flag row; the **Lightweight-skip rule.** paragraph.
- mirror: the current wording at `docs/skills/plan-sdlc.md:33` and `:104`.
- decisions: one added sentence for complexity-routed runs.
- sync: `site/src/content-source/skills/plan-sdlc.md` is a byte copy.
```

Spec (from Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY R73, A5 and P8 in `docs/specs/plan-sdlc.md`; ADD R76 under `## Dispatch and routing`; numbering continues from R75.
- names: `R76` (new); `R73`, `A5`, `P8` (modified).
- mirror: requirement style of R74 at `docs/specs/plan-sdlc.md:88`.
- decisions: numeric id R76, the next free number.
- sync: Tasks 2, 3 and 5 implement and document it.
```

## Tasks

### Task 1: plan-sdlc spec — R73 edited paths, A5 and P8 explore skip, R76 rerun lanes

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R73, A5, P8 edits; new R76; appendix rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy, made with `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`

**Notes:** Spec first (AGENTS.md principle 1): Tasks 2, 3 and 5 cite these ids. Resolves the R73 vs R71(d) conflict (F-plan-tier-count-edited-paths-7): copies stay listed under Files, but a marked copy is not counted.

**Acceptance criteria:**
- [ ] R73 says the files bound counts distinct edited paths and names the three marker phrases.
- [ ] R73 Acceptance names the new `plan-tier:` cases (f) to (i).
- [ ] A5 and P8 say `--lightweight` runs no explore pack; P8 says a complexity-routed Lightweight run still gets a tempdir.
- [ ] R76 exists under `## Dispatch and routing` with its Acceptance line; no id is renumbered or reused.
- [ ] The appendix traceability table has a row `| R73, R76, A5, P8 | #9447 (#9431, #9432, #9438, #9442) |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.

**Contract:**
- shape (openspec): the delta text below.

  R73, before → after (the bounds sentence only):

  ```diff
  - Bounds: tasks ≤ 6, Complex tasks 0, distinct `**Files:**` paths ≤ 8, no OpenSpec work.
  + Bounds: tasks ≤ 6, Complex tasks 0, distinct edited `**Files:**` paths ≤ 8, no OpenSpec work. A Files entry whose text after the path contains `check only`, `no change expected` or `byte copy` (any case) is still listed for the copy check (R71(d)) and for staging, but is not counted.
  ```

  R73 Acceptance, after: `exec cases whose descriptions start with plan-tier:, among them (f) a files-only breach, (g) six tasks stay lightweight, (h) seven tasks breach only the tasks bound and keep one reviewer, (i) marked entries are not counted.`

  A5, after the words "inline exploration only (no explore orchestrator)": insert `; plan.js runs no explore pack (P8)`.

  P8, after: `explorePack.manifestPath (string | null) — absolute path to the manifest JSON written by plan-explore.js inside the per-invocation tempdir, or null when the script failed or --lightweight (A5) was given. Under --lightweight plan.js does not run plan-explore.js: no tempdir is made, and explorePack is { manifestPath: null, outDir: null, scopeHintCount: 0, webResearchSignal: false, error: null }. A Lightweight route chosen by complexity routing happens after plan.js, so that run still gets a tempdir, which ship.js --gc and the session-start sweep remove. Acceptance: exec case plan-prepare: (lightweight) no explore pack.`

  R76, new, after R75:

  ```text
  - R76 (Rerun lanes in Step 5): A Step 5 round never carries a lane result that was blocking before the last fix. At iteration 1 (CARRY is iter-0, BEFORE_PLAN none) the R75 orchestrator runs `plan.js diff-material --before <plan> --after <plan> --prev-dir <CARRY>` and dispatches the lenses DISPATCH names plus every lane in its `dispatch.lanes` (the `rerun` lanes; nothing is material). From iteration 2, a non-material round dispatches `review.lenses` plus `dispatch.lanes`. The merge passes those lanes as `--lanes` and keeps `--carry`, which never overwrites a file of the current iteration. A non-zero `diff-material` exit at iteration 1 dispatches DISPATCH plus every lane of `lanes[]`, with no `--carry` (E9). The no-agent-tool fallback in review-loop.md applies the same rule.
    - Acceptance: exec cases `plan-diff: (rerun)` and `plan-sdlc/rerun-sentinels:` in tests/promptfoo/datasets/plan-prepare-exec.yaml.
  ```
- names: `R76` (new); `R73`, `A5`, `P8` (modified).
- mirror: requirement and Acceptance style of R74 at `docs/specs/plan-sdlc.md:88-89`.
- decisions: numeric id R76 (next free after R75); tracking ids go only in the appendix.
- sync: Task 2 (R73), Task 3 (A5, P8, R76), Task 5 (user doc).

### Task 2: Tier check counts only edited paths; R73 boundary cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-parse.js` — `parseFilesEntries` returns a `note` field
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `planShape` skips marked entries
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — document the not-counted marker under the Per-Task Block Files list
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add `plan-tier:` cases (f) to (i)

**Notes:** Implements R73 (Task 1). Cites F-plan-tier-count-edited-paths-1, -2, -5. `filesKey` (`plan-critique.js:101`) keeps `kind:path` only, so `diff-material` triggers do not change. `ship.js` and `validate-plan-format.js` read only `kind` and `path`, so the extra field is safe. No count check covers this dataset (Research Findings, F-104).

**Acceptance criteria:**
- [ ] `parseFilesEntries` returns `note` for every entry; existing callers are unchanged.
- [ ] `planShape(text).files` leaves out entries whose note matches the marker.
- [ ] Cases (f) to (i) pass and the existing `plan-tier:` cases (a) to (e) still pass.
- [ ] The **Verification:** command with `--filter-pattern "plan-tier: |plan-diff: "` passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-tier: |plan-diff: "`

**Contract:**
- shape (code):

  ```js
  // plan-parse.js
  /** Files entries of a task body: [{ kind, path, note }]. note: trimmed text after the path ('' when none). */
  function parseFilesEntries(body) // note = text after the closing backtick (or after the first word), leading '—', '-' and spaces removed

  // plan-critique.js
  const NOT_EDITED_RE = /\b(check only|no change expected|byte copy)\b/i;
  // planShape: files = new Set(sections.flatMap(sec => parseFilesEntries(sec).filter(e => !NOT_EDITED_RE.test(e.note)).map(e => e.path))).size
  ```

  New exec cases (inline `-e`, no fixtures; each builds a plan text with N `### Task k:` blocks, `**Complexity:** Standard`, and calls `require("{{repo_root}}/plugins/sdlc-utilities/scripts/lib/plan-critique.js").tierCheck(text)`, printing the JSON):

  | Case | Plan | Expected |
  |---|---|---|
  | `plan-tier: (f) files-only breach` | 2 tasks, 9 distinct Modify paths | `tier: 'full'`, `breaches` is exactly `[{ bound: 'files', value: 9, max: 8 }]`, `review.route: 'single'` |
  | `plan-tier: (g) six tasks stay lightweight` | 6 tasks, 6 paths | `tier: 'lightweight'`, `breaches: []`, `review.route: 'single'` |
  | `plan-tier: (h) seven tasks breach only the tasks bound` | 7 tasks, 7 paths | `tier: 'full'`, `breaches` is exactly `[{ bound: 'tasks', value: 7, max: 6 }]`, `review.route: 'single'` |
  | `plan-tier: (i) marked entries are not counted` | 2 tasks, 6 edited paths plus 5 entries noted `— check only, no change expected (copy rule)` or `— byte copy` | `counts.files === 6`, `tier: 'lightweight'` |
- names: `parseFilesEntries`, `planShape`, `NOT_EDITED_RE`, case descriptions as in the table.
- mirror: `-e` style of `ship-fix-subject: (a)` at `tests/promptfoo/datasets/ship-prepare-exec.yaml:4607-4625`; existing `plan-tier:` cases at `tests/promptfoo/datasets/plan-prepare-exec.yaml:521-557`.
- decisions: the regex matches whole phrases only, so "checks" or "copy" alone does not exclude an entry.
- sync: R73 text (Task 1); marker wording in `plan-format-reference.md` must name the same three phrases.

### Task 3: `--lightweight` skips the explore pack; Step 5 re-dispatches rerun lanes

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — skip `runExplorePack` when `flags.lightweight`
- Modify: `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md` — Step 2 rerun rule (R76) and the merge-flag table
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — fallback dispatch applies R76
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add three cases

**Notes:** Implements A5, P8 (#9438) and R76 (#9432). Cites F-plan-tier-count-edited-paths-3 and F-critique-carry-redispatch-after-fix-1, -3. Depends on Task 2 only because both edit the same dataset (F-43). Prose written here follows the tool contracts: one shell per Bash call, every placeholder a literal path. Workspace modes: the change only stops a tempdir under `os.tmpdir()`, which is the same in `ship.workspace=branch` and `=worktree`; the orchestrator reads the plan by absolute path in both.

**Acceptance criteria:**
- [ ] `plan.js --output-file --lightweight` prints a manifest whose `explorePack` is the empty pack, and makes no `sdlc-explore-*` tempdir.
- [ ] Without `--lightweight`, `explorePack.manifestPath` is still a path (existing cases pass).
- [ ] The orchestrator Step 2 holds the iteration-1 rule and the non-material rule of R76, each tagged `<!-- R76 -->`.
- [ ] `review-loop.md` fallback holds the same rule, tagged `<!-- R76 -->`.
- [ ] The three new cases pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-prepare: \(lightweight|plan-diff: \(rerun|plan-sdlc/rerun-sentinels"`

**Contract:**
- shape (code):

  ```diff
  // plan.js, step 4 of the prepare flow (:719-722)
  - const explorePack = runExplorePack(fromOpenspec, userPrompt);
  + // A5/P8: the forced Lightweight route uses inline exploration only, so no explore tempdir is made.
  + const explorePack = lightweight
  +   ? { manifestPath: null, outDir: null, scopeHintCount: 0, webResearchSignal: false, error: null }
  +   : runExplorePack(fromOpenspec, userPrompt);
  ```

  `plugins/sdlc-utilities/agents/plan-critique-orchestrator.md`, `## Step 2 — Step 5 re-dispatch decision`:

  ````diff
  - Only when `ROUND` is `step5` and `BEFORE_PLAN` is not `none`, run:
  + When `ROUND` is `step5`, `BEFORE_PLAN` is `none` and `CARRY` is not `none` (iteration 1), run
  + `node "<PLAN_JS>" diff-material --before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>" --prev-dir "<CARRY>"`
  + and dispatch the lenses `DISPATCH` names plus the lanes of its `dispatch.lanes` (the Step 3 lanes whose result blocked; nothing is material). A non-zero exit: dispatch `DISPATCH` plus every lane of `lanes[]`, and pass no `--carry` (E9). <!-- R76 -->
  +
  + When `ROUND` is `step5` and `BEFORE_PLAN` is not `none`, run:

    ```bash
    node "<PLAN_JS>" diff-material --before "<BEFORE_PLAN>" --after "<PLAN_FILE_PATH>" --prev-dir "<CARRY>"
    ```

    - `material: true`: dispatch `dispatch.lanes` and `dispatch.lenses` from its JSON (merged re-dispatch, R64).
  - - `material: false`: dispatch the lenses of its `review.lenses` only (the review route of the plan as it is now, R36).
  + - `material: false`: dispatch the lenses of its `review.lenses` (the review route of the plan as it is now, R36) plus the lanes of its `dispatch.lanes` (the lanes whose result blocked, R76). <!-- R76 -->
  ````

  `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md`, `### Fallback dispatch (no-agent-tool)`, after its first paragraph ("Used only when a round returned …, then continue at Gate B above."), insert:

  ```markdown
  **Rerun lanes (R76):** at iteration 1, before the dispatch, run `node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<PLAN_PATH>" --after "<PLAN_PATH>" --prev-dir "<critiqueDir>/iter-0"` as one plain Bash call and dispatch the lanes of its `dispatch.lanes` together with the lenses, by the Step 3 dispatch rule; on a non-zero exit dispatch every Step 3 lane and merge without `--carry` (E9). In a later non-material round, dispatch the lanes of the kept `dispatch.lanes` together with the `review.lenses`. Pass the dispatched lanes as `--lanes` to the merge. <!-- R76 -->
  ```

  In the same file, Step 6 fallback paragraph (line 130), only this phrase changes:

  ```diff
  - and keep its `dispatch`, `affectedLanes` and `review` for the next round (`review.lenses` are the lenses of a non-material round);
  + and keep its `dispatch`, `affectedLanes` and `review` for the next round (`review.lenses` are the lenses of a non-material round, and its `dispatch.lanes` are the lanes that round re-dispatches, R76);
  ```

  Merge-flag table row for `--lanes`: the lanes dispatched in this round (the `DISPATCH` lanes, the `dispatch.lanes` of `diff-material`, or every lane on the E9 path).

  New exec cases in `plan-prepare-exec.yaml`:

  | Case | Run | Expected |
  |---|---|---|
  | `plan-prepare: (lightweight) no explore pack (A5, P8)` | `-e` spawn of `plan.js --output-file --lightweight` in `fixtures-fs/plan-prepare-github-remote`, read the manifest | `explorePack` deep-equals the empty pack above |
  | `plan-diff: (rerun) iteration 1 dispatches the blocking lanes (R76)` | `diff-material --before {{project_root}}/before-5.md --after {{project_root}}/before-5.md --prev-dir {{project_root}}/prev-blocking` in `fixtures-fs/plan-diff-material` | `material === false`, `rerun` deep-equals `['lens:all', 'static-structural']` (the blocking lens maps to `all` on the single route), `dispatch.lanes` deep-equals `['static-structural']`, `review.route === 'single'` |
  | `plan-sdlc/rerun-sentinels: orchestrator and review-loop name R76` | `-e` read of both md files | each contains `<!-- R76 -->` and the text `--before "<PLAN_FILE_PATH>" --after "<PLAN_FILE_PATH>"` (orchestrator) or `dispatch.lanes` (review-loop) |
- names: `runExplorePack`, `explorePack`, `diff-material`, `dispatch.lanes`, `rerun`, `R76`.
- mirror: the `plan-prepare: (lightweight)` case at `tests/promptfoo/datasets/plan-prepare-exec.yaml:506-520`; the `plan-diff: (route) fan-out plan keeps per-lens rerun` case at `:803-810`.
- decisions: no script change for #9432; `diffMaterial` already returns the rerun lanes in `dispatch.lanes`.
- sync: spec R76, A5, P8 (Task 1); SKILL.md Step 1 needs no change (it already skips the orchestrator on the Lightweight route).

### Task 4: PF7 exec case for a compact Contract without shape and names

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/project-plan-compact-trivial-noshape/plans/plan.md`
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — add case `plan-format-compact: (e)`

**Notes:** Covers the untested branch at `validate-plan-format.js:425-426` (#9439, F-ship-commit-issue-derivation-and-pf7-7 to -10); no script change.

**Acceptance criteria:**
- [ ] The fixture plan has one `**Complexity:** Trivial` task with a Files entry and a compact Contract line `**Contract:** update the usage line` (no `shape`, no `names:`).
- [ ] The case asserts a PF7 `fail` whose message includes `Task 1: compact **Contract:** needs shape and names`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-format-compact: "` passes.

**Contract:** shape (code): one exec case copying "plan-format-compact: (c)" (`plan-format-exec.yaml:637-644`) with `project_root: "file://fixtures-fs/project-plan-compact-trivial-noshape"` and message `Task 1: compact **Contract:** needs shape and names`; names: `plan-format-compact: (e) compact Contract without shape and names fails PF7`, fixture `project-plan-compact-trivial-noshape`

### Task 5: plan-sdlc user doc and skills-meta wording

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — the `--lightweight` flag row ("8 files" → "8 edited files") and the **Lightweight-skip rule.** paragraph
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy, made with `cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`
- Modify: `site/src/data/skills-meta.ts` — edit the plan-sdlc `explore` step description; the pr-sdlc and ship-sdlc entries were read for the copy rule and stay as they are
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — check only: Step 1 already skips the orchestrator on the Lightweight route; no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only: says nothing about the tier count or the explore pack; no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected (copy rule)

**Notes:** Documents A5, P8 and R73 (Task 1) and closes the PR #109 deferred low. The companions `plan-format-reference.md` and `review-loop.md` are owned by Tasks 2 and 3; the check-only entries are here so each file has one owner (F-43).

**Acceptance criteria:**
- [ ] The three diffs in the Contract are applied exactly.
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): three before → after edits.

  `docs/skills/plan-sdlc.md`, the `--lightweight` flag row (line 33), only this phrase changes:

  ```diff
  - After decomposition `plan.js tier` checks the bounds (6 tasks, 0 Complex, 8 files, no OpenSpec); a breach runs the review loop.
  + After decomposition `plan.js tier` checks the bounds (6 tasks, 0 Complex, 8 edited files, no OpenSpec; entries marked `check only`, `no change expected` or `byte copy` are not counted); a breach runs the review loop.
  ```

  `docs/skills/plan-sdlc.md`, the paragraph under the `webResearchSignal` trigger list (line 104):

  ```diff
  - **Lightweight-skip rule.** When complexity routing chooses the lightweight branch (about ≤3 files), or `--lightweight` forced it (A5), the orchestrator is skipped entirely. No brief, no tempdir, `explorePack.manifestPath = null`. Inline exploration is used as today.
  + **Lightweight-skip rule.** When complexity routing chooses the lightweight branch (about ≤3 files), or `--lightweight` forced it (A5), the orchestrator is skipped entirely and no brief is made. Inline exploration is used as today. Under `--lightweight`, `plan.js` makes no explore tempdir and `explorePack.manifestPath` is null (P8). A complexity-routed run cannot skip the tempdir, because routing happens after `plan.js`; `ship.js --gc` and the session-start hook sweep it.
  ```

  `site/src/data/skills-meta.ts`, the plan-sdlc `explore` step (line 36), only this phrase changes:

  ```diff
  - uses inline exploration for lightweight (complexity-routed) plans,
  + uses inline exploration for lightweight (complexity-routed or --lightweight-forced) plans,
  ```
- names: the `--lightweight` flag row, the **Lightweight-skip rule.** paragraph, the skills-meta `explore` step.
- mirror: the current texts quoted on the `-` lines.
- decisions: one added sentence for complexity-routed runs, as the brief asks.
- sync: `site/src/content-source/skills/plan-sdlc.md` is a byte copy; spec A5, P8, R73 (Task 1).

### Task 6: pr-sdlc R21 — `pr.footer` appended by `pr.js --validate-body`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — add R21 under `## Gates` after R20; appendix row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy, made with `cp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md`
- Modify: `plugins/sdlc-utilities/scripts/skill/pr.js` — `appendFooter` and its call in `validateBodyMode`
- Modify: `schemas/sdlc-config.schema.json` — `prSection.properties.footer`
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — add three `pr.js --validate-body: footer` cases

**Notes:** Implements #9429 (F-pr-footer-config-key-1, -2, -5). The footer is Claude Code's text, so the plugin ships no default. The append runs before the link check, so a URL in the footer is checked like any other. Tests use a temp directory because fixtures run in place; `resolveSdlcRoot()` falls back to the cwd in a non-git temp dir (checked at HEAD; git prints one `fatal: not a git repository` line on stderr, which the cases must not assert against). Workspace modes: the footer is read with `readSection(resolveSdlcRoot(), 'pr')`, so in `ship.workspace=worktree` it comes from the main worktree `.sdlc/config.json`, as in `branch` mode; the only write is the `--file` path the skill made with `mktemp`, so no state file or cwd path is written.

**Acceptance criteria:**
- [ ] R21 text and Acceptance are in the spec; `validate-spec-shape.js --root . --strict` exits 0; `cmp` of spec and site copy exits 0.
- [ ] With `pr.footer` set, `--validate-body --file <f>` rewrites `<f>` with the footer appended once; a second run appends nothing.
- [ ] Without `pr.footer` (absent or empty), the body file is unchanged.
- [ ] `--json` output carries `footerAppended`; existing `pr.js --validate-body:` cases still pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "pr.js --validate-body"` passes.

**Contract:**
- shape (code):

  ```js
  /** R21: body plus the configured footer; unchanged when footer is empty or the trimmed body already ends with it. */
  function appendFooter(body, footer) // -> { body: string, appended: boolean }
  //   appended body = body.replace(/\s+$/, '') + '\n\n' + footer.trim() + '\n'
  // validateBodyMode: footer = (readSection(projectRoot, 'pr') || {}).footer; a non-string is treated as empty.
  //   After the body is read and before validateLinks: apply appendFooter; in file mode, when appended, fs.writeFileSync(fileArg, body).
  //   --json output: { ...result, footerAppended }.
  ```

  Schema delta (`prSection.properties`):

  ```json
  "footer": {
    "type": "string",
    "description": "Text pr-sdlc appends to every PR body (R21), after one blank line. Empty or absent: nothing is appended."
  }
  ```

  R21 (spec, new, after R20):

  ```text
  - R21: PR footer. When `pr.footer` in `.sdlc/config.json` is a non-empty string, `pr.js --validate-body` appends it to the body before the link check (R15): the body without trailing whitespace, one blank line, the trimmed footer, a newline. When the trimmed body already ends with the trimmed footer, nothing is appended, so a re-run or `--update` never doubles it. With `--file <path>` the script rewrites that file, so `gh --body-file` publishes the footer; with `--file -` only the checked body has it. `--json` output adds `footerAppended` (boolean). The plugin ships no footer text: the key is absent by default.
    - Acceptance: exec cases `pr.js --validate-body: footer (a)`, `(b)` and `(c)` in tests/promptfoo/datasets/pr-prepare-exec.yaml.
  ```

  Exec cases (inline `-e`: make a temp dir with `.sdlc/config.json`, write `body.md`, spawn `pr.js --validate-body --file <dir>/body.md --json` with `cwd` the temp dir and env `SDLC_LINKS_OFFLINE=1`, read the file back, remove the dir, print JSON):

  | Case | Config | Expected |
  |---|---|---|
  | `pr.js --validate-body: footer (a) appends the configured footer once` | `{"pr":{"footer":"Made with care"}}`, body `Body text\n` | exit 0, `footerAppended: true`, file is `Body text\n\nMade with care\n` |
  | `pr.js --validate-body: footer (b) a second run appends nothing` | same, run twice | second run `footerAppended: false`, file unchanged |
  | `pr.js --validate-body: footer (c) no footer key leaves the body unchanged` | `{"pr":{}}` | `footerAppended: false`, file is `Body text\n` |
- names: `appendFooter`, `footerAppended`, `pr.footer`, `R21`.
- mirror: `validateBodyMode` at `plugins/sdlc-utilities/scripts/skill/pr.js:639-678`; `-e` temp-dir style of `ship-fix-subject: (a)` at `tests/promptfoo/datasets/ship-prepare-exec.yaml:4607-4625`; schema key style of `expectedAccount` at `schemas/sdlc-config.schema.json:252-255`.
- decisions: idempotent by suffix check; config read from `resolveSdlcRoot()` like the rest of `validateBodyMode`.
- sync: Task 7 documents R21; Task 8 sets the key.

### Task 7: pr-sdlc SKILL.md and user doc for the footer

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — Link verification step 2 and 3: the script appends `pr.footer` (R21)
- Modify: `docs/skills/pr-sdlc.md` — `footer` row in `### Configuration Fields`
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy, made with `cp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md`

**Notes:** Implements R21 on the skill side (F-pr-footer-config-key-1, -4, -6), so the model does not write the footer itself and get it twice; Read before Write on the body file stays as written.

**Acceptance criteria:**
- [ ] SKILL.md step 2 says: do not write the `pr.footer` text into the body; step 3 (`pr.js --validate-body`) appends it (R21) and rewrites `<BODY_FILE>`.
- [ ] The doc table has the row shown below; `cmp` of doc and site copy exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.

**Contract:**
- shape (docs): new table row in `docs/skills/pr-sdlc.md` `### Configuration Fields`, after `defaultBranch`:

  ```markdown
  | `footer` | string | Text appended to every PR body after one blank line (R21), for example a tool attribution line. `pr.js --validate-body` appends it once and never twice. Absent or empty: nothing is appended. |
  ```

  SKILL.md step 2, appended sentence: `Do not write the pr.footer text yourself: step 3 appends it to <BODY_FILE> (R21).`
- names: `footer`, `R21`, `<BODY_FILE>`.
- mirror: the `defaultBranch` row at `docs/skills/pr-sdlc.md:297`.
- decisions: user doc audience; no setup prompt.
- sync: R21 text (Task 6).

### Task 8: `.sdlc/config.json` — footer value and guardrail text

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `.sdlc/config.json` — `pr.footer`; `pr-link-github-issue` description

**Notes:** Implements #9429 for this repo and #9433 (F-pr-footer-config-key-7); depends on Task 6 because the schema must know `pr.footer` first.

**Acceptance criteria:**
- [ ] `pr.footer` is `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] The guardrail description reads: `When a change fixes or addresses a GitHub issue, the plan must include linking the issue in the PR (e.g., Fixes #123 or Closes #123). Internal register or tracking ids (for example the #94xx wave ids of this repository) are not GitHub issues: the PR body names them without Fixes or Closes, and this rule does not apply to them.`
- [ ] `node -e 'JSON.parse(require("fs").readFileSync(".sdlc/config.json","utf8"))'` exits 0 and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): two JSON value edits in `.sdlc/config.json`:

  | Path | Op | Before | After |
  |---|---|---|---|
  | `pr.footer` | add (after `pr.labels`) | absent | `"🤖 Generated with [Claude Code](https://claude.com/claude-code)"` |
  | `plan.guardrails[id=pr-link-github-issue].description` | replace | `"When a change fixes or addresses a GitHub issue, the plan must include linking the issue in the PR (e.g., Fixes #123 or Closes #123)."` | the description text in Acceptance criteria |
- names: `pr.footer`, guardrail `pr-link-github-issue`.
- mirror: the `pr` section and the guardrail entry at `.sdlc/config.json:57-60`.
- decisions: no exemption field; the rule text itself names the exemption.
- sync: schema key from Task 6.

### Task 9: ship-sdlc R107 — commit-fixes gets the scope of the plan Commit subject

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R107; appendix row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy, made with `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `planScope` and the commit-fixes args
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add `ship-fix-scope:` cases (a) and (b)
- Modify: `docs/skills/ship-sdlc.md` — check only: the doc does not describe commit-fixes arguments; no change expected (copy rule)
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc` — check only: the companion `.md` files do not list commit-fixes arguments; no change expected (copy rule)

**Notes:** Implements #9434 (F-ship-commit-issue-derivation-and-pf7-1, -2). The scope is taken from the planned subject, which R66 already limits to safe characters, so the double-quoted value is safe. Accepted gap (stated in R107): ship does not check the scope against `commit.allowedScopes`. Workspace modes: the scope comes from the plan text ship already reads (`readPlanCommitSubject`, the frozen `planFile`), so branch and worktree runs behave the same; nothing new is written.

**Acceptance criteria:**
- [ ] With a **Commit:** subject `docs(#1): x - y` and no **Fix commit:**, commit-fixes args are `--auto --no-stash --scope "#1"` followed by `--expected-branch` when set.
- [ ] With a **Fix commit:** line, commit-fixes gets `--subject` and no `--scope` (existing `ship-fix-subject: (a)` passes).
- [ ] With no **Commit:** line, or a subject with no `(scope)`, commit-fixes gets no `--scope`.
- [ ] The commit step args do not change.
- [ ] `validate-spec-shape.js --root . --strict` exits 0; `cmp` of spec and site copy exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-fix-scope: |ship-fix-subject: |R-plan-commit-subject"` passes.

**Contract:**
- shape (code):

  ```js
  /** R107: the conventional scope of a planned subject, `type(scope): …` or `type(scope)!: …`; null when there is none. */
  function planScope(subject) // -> string|null ; /^[a-z]+\(([^()\s]+)\)!?:/.exec(subject)?.[1] ?? null
  ```

  ```diff
  // computeSteps, commit-fixes args (ship.js:633-638)
     '--auto',
     '--no-stash',
     planFixSubject ? `--subject "${planFixSubject}"` : '',
  +  !planFixSubject && planScope(planSubject) ? `--scope "${planScope(planSubject)}"` : '',
     expectedBranch ? `--expected-branch ${expectedBranch}` : '',
  ```

  R107 (spec, new, after R106):

  ```text
  - R107: Fix-commit scope. When the plan header has a `**Commit:**` subject (R-plan-commit-subject) and no `**Fix commit:**` field, `skill/ship.js` forwards the conventional scope of that subject (the text in the parentheses of `type(scope):`) to the `commit-fixes` step as `--scope "<scope>"` (commit-sdlc A2), after `--no-stash` and before `--expected-branch`. So under `--auto` the drafter has the issue id the subject pattern needs and never asks for it. With a `**Fix commit:**` field only `--subject` is passed; without a scope nothing is added. Accepted gap: the scope is not checked against `commit.allowedScopes`; commit-sdlc reports a disallowed scope as its normal prepare error.
    - Acceptance: exec cases `ship-fix-scope: (a)` and `(b)` in tests/promptfoo/datasets/ship-prepare-exec.yaml.
  ```

  Exec cases (copy the `-e` of `ship-fix-subject: (a)`):

  | Case | Plan header | Expected |
  |---|---|---|
  | `ship-fix-scope: (a) the Commit scope reaches commit-fixes without a Fix commit field` | `**Commit:** \`docs(#1): x - y\`` | commit-fixes args include `--scope "#1"` and no `--subject`; commit args have no `--scope` |
  | `ship-fix-scope: (b) a Fix commit field wins and no scope is added` | Commit plus `**Fix commit:** \`fix(#1): x - review fixes\`` | commit-fixes args include `--subject` and no `--scope` |
- names: `planScope`, `R107`, `ship-fix-scope:`.
- mirror: commit-fixes args at `plugins/sdlc-utilities/scripts/skill/ship.js:629-641`; case `ship-fix-subject: (a)` at `tests/promptfoo/datasets/ship-prepare-exec.yaml:4607-4625`.
- decisions: forward a scope, not a full subject; numeric id R107 (next free after R106).
- sync: commit-sdlc A2 (`--scope`) is unchanged.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 2, 3, 4, 6, 9 add or update exec cases; existing plan-tier and ship-fix-subject cases are re-run; docs, spec and config tasks need none |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only exec-only config with targeted filter patterns, no full-suite eval, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | All tasks map to the listed follow-ups; exclusions are recorded |
| single-responsibility-tasks | warning | FAIL | Task 3 has two deliverables (explore-pack skip and R76 rerun lanes) and Task 8 has two edits; bundling is justified in Key Decisions but remains advisory |
| scripts-over-llm-logic | error | PASS | Footer append, tier count and scope forward are scripts; the orchestrator reuses diff-material output |
| yagni | warning | PASS | No speculative abstractions; no setup prompt added |
| cross-skill-consistency | error | PASS | ship to commit-sdlc --scope (A2); plan, pr and ship specs and docs are aligned |
| pr-link-github-issue | error | PASS | The #94xx ids are treated as internal register ids, not GitHub issues, and Task 8 records this in the guardrail text; reviewer should confirm that reading |
| dry | warning | PASS | Existing diff-material rerun path and case templates are reused; the R76 prose in orchestrator and fallback is an intentional mirror |
| kiss | warning | PASS | Plain-text marker and suffix-check idempotency are the simplest options |
| spec-first | error | PASS | Spec edits (Tasks 1, 6, 9) precede or lead the SKILL.md and code work that cites them |
| project-agnostic | error | PASS | Footer is a plugin feature behind a config key; the .sdlc/config.json edit only dogfoods it |
| flag-coherence-cross-skill | error | PASS | Downstream sites use resolved fields from prepare scripts |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings introduced |
| flag-resolution-single-source | warning | PASS | --lightweight and pr.footer are each resolved in one script |
| state-premise | error | PASS | Context states the root problem: nine re-verified follow-ups from w28 to w33 |
| smallest-viable-cut | warning | PASS | Key Decisions justify the two bundled tasks; every other task is the smallest cut of one item |
| failure-audience | warning | PASS | Key Decisions name who is hurt by a wrong ship |
| explicit-non-goals | warning | PASS | Deviations and Decisions record exclusions (R74 recheckLanes, setup prompt, allowedScopes check) |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Key Decisions with rationale |
| state-machine-idempotency | error | PASS | Footer idempotency is tested by case (b); no migration or preflight logic changes |
| agent-dispatch-script-driven | error | PASS | Dispatch lanes come from DISPATCH and diff-material output |
| flag-semantic-consistency-cross-skill | error | PASS | No new prepare-script flag; the existing commit --scope is forwarded |
| workspace-mode-compatibility | error | PASS | Tasks 3, 6 and 9 state branch and worktree behaviour; config read uses resolveSdlcRoot and no state or cwd write is added |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 7 adds the `footer` row to `docs/skills/pr-sdlc.md` and a `SKILL.md` sentence, and Task 5 rewrites the "Lightweight-skip rule." paragraph in `docs/skills/plan-sdlc.md`, so user-facing docs must follow the changed config key and flag behaviour.

**Severity hint:** high

**Patch:** Check that docs/skills/plan-sdlc.md, docs/skills/pr-sdlc.md, pr-sdlc SKILL.md and skills-meta.ts match the --lightweight explore skip, the edited-files tier count and the pr.footer config contract.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that docs/skills/plan-sdlc.md, docs/skills/pr-sdlc.md, pr-sdlc SKILL.md and skills-meta.ts match the --lightweight explore skip, the edited-files tier count and the pr.footer config contract.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 3 makes `plan.js` skip `runExplorePack` under `--lightweight`, Task 6 adds the `pr.footer` key and a `footerAppended` output field, and Task 9 adds `--scope "<scope>"` to the commit-fixes args in `ship.js`, so each changes a CLI or config contract.

**Severity hint:** high

**Patch:** Check the changed script contracts: planShape/parseFilesEntries note field and the not-counted marker phrases (R73); plan.js --lightweight returns an empty explorePack with manifestPath null (P8); pr.js --validate-body reads the new pr.footer key, rewrites the --file body and adds footerAppended to --json (R21); ship.js commit-fixes gets a new --scope arg (R107).

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the changed script contracts: planShape/parseFilesEntries note field and the not-counted marker phrases (R73); plan.js --lightweight returns an empty explorePack with manifestPath null (P8); pr.js --validate-body reads the new pr.footer key, rewrites the --file body and adds footerAppended to --json (R21); ship.js commit-fixes gets a new --scope arg (R107).

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1 to 9 edit `.md`, `.yaml`, `.json` and `.ts` files such as `docs/specs/plan-sdlc.md` and `.sdlc/config.json` that the dimension's current triggers miss, so the script proposes adding `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9431: plan tier (R73) counts only edited Files paths; leave out byte copies and check-only / no-change-expected entries | Task 1, Task 2 | covered |
| 2 #9442: R73 exec cases: files-only breach; 6 tasks -> lightweight; 7 tasks -> full with only the tasks breach and single review | Task 2 | covered |
| 3 #9432: Step 3 lane results that blocked must be re-dispatched in Step 5 iteration 1 after the fix | Task 1, Task 3 | covered |
| 4 #9438: plan.js skips runExplorePack when --lightweight is forced; user doc wording | Task 1, Task 3, Task 5 | covered |
| 5 #9439: exec case for PF7 compact Contract needs shape and names | Task 4 | covered |
| 6 skills-meta.ts explore step names complexity-routed or --lightweight-forced | Task 5 | covered |
| 7 #9429: pr-sdlc deterministic pr.footer, spec requirement first, set in this repo's config | Task 6, Task 7, Task 8 | covered |
| 8 #9433: pr-link-github-issue guardrail exempts internal register ids | Task 8 | covered |
| 9 #9434: ship commit-fixes derives the issue id from the plan Commit header under --auto | Task 9 | covered |
| 10 Spec first, byte copies with cp, exec test per behaviour change, targeted exec runs only | Task 1, Task 6, Task 9 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all tasks are done:

- A `--lightweight` plan that lists byte copies and check-only entries is judged on the files it really edits. The 6/7-task and files-only boundaries are pinned by exec cases.

- Step 5 re-runs every lane whose last result blocked, in iteration 1 and in non-material rounds. It never merges a stale blocking result.

- `plan.js --lightweight` makes no explore tempdir. The user doc and the site step text say so, and say why a complexity-routed run still makes one.

- PF7's "needs shape and names" message has an exec case.

- `pr.js --validate-body` adds the configured `pr.footer` once. This repo sets the Claude Code footer. The `pr-link-github-issue` guardrail no longer asks for `Fixes` on internal register ids.

- Ship's fix commit gets the scope of the planned commit, for example `#9447`, so `--auto` runs never stop to ask for it.

## OpenSpec Appendix

Not applicable — no OpenSpec change
