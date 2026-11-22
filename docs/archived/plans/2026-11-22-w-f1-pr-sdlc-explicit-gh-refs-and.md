# W-F1 pr-sdlc explicit gh refs and plan-critique lane constant Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #153, 3edc184

**Commit:** `fix(W-F1): pr-sdlc - explicit gh refs and lane constant`
**Goal:** pr-sdlc names the base and head branch in every gh call; plan-critique.js names its any-issue rerun lane in a constant; ship-sdlc SKILL.md item 3 cites its requirement.
**Architecture:** A new pr-sdlc spec requirement (R-gh-explicit-refs) drives three SKILL.md edits, one doc sentence and their byte copies; a sentinel script and two exec cases pin the edits. A named Set replaces one inline literal in plan-critique.js with no behaviour change. One citation is appended in ship-sdlc SKILL.md.
**Source:** docs/plans/programme.md#W-F1
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- pr-sdlc runs `gh pr create` and `gh pr edit` with no `--base` and no `--head`.
- `gh` then takes the head branch from the current checkout.
- From the main checkout, the head equals the base, and `gh` fails with "head branch main is the same as base branch main".
- A main checkout that sits on another feature branch would open a PR for the wrong branch.
- The prepare script already resolves `baseBranch` and `currentBranch` (pr-context), but SKILL.md never passes them.
- Two small cleanups ride along: an inline lane literal in `plan-critique.js`, and a missing citation in ship-sdlc SKILL.md.

**What prompted this change now?**

- Ledger finding F-195: in lean-w52 the ship `pr` step ran `gh pr create` in the main checkout first and failed (TODO note `docs/TODO/archive/pr-step-gh-in-main-checkout.md`, already archived as promoted to TK-029).
- The deferred low of lean-w51 (PR #144) and the optional low of W-E8.
- Owner decision PD-9 collects these items into the light fix wave W-F1.

**What does success look like?**

- Every `gh pr create` command in pr-sdlc SKILL.md carries `--base '<baseBranch>' --head '<currentBranch>'`, the E7 retry reuses them, and `gh pr edit` names `'<currentBranch>'`.
- A sentinel script fails when a gh call lacks the refs, and two exec cases (`pr-gh-refs:`) pass.
- `plan-critique.js` has a named constant; the 32 `plan-diff:` and `plan-merge:` exec cases still pass.
- ship-sdlc SKILL.md item 3 cites `R-todowrite-visibility`.

## Research Findings

All items were re-verified at HEAD `582325f`.

- **TK-029 reproduces.** `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:497` is `gh pr create --title '<title>' --body-file '<BODY_FILE>' [--draft] [--label '<l1>' --label '<l2>'] 2> '<ERR_FILE>'`; `:511` re-runs it "with the same arguments **exactly once**"; `:534` is `gh pr edit --title '<title>' --body-file '<BODY_FILE>' [--add-label '<l1>,<l2>']`. None names a branch.

- **The values exist.** SKILL.md's prepare-field table already lists `baseBranch` (`:153`) and `currentBranch` (`:154`). `docs/specs/pr-sdlc.md` R-basebranch-config-cascade (`:43`) makes `baseBranch` the single consumption point. pr.js pushes the branch before publication (R19), so `--head` names a branch that exists on origin.

- **gh syntax.** `gh pr create --base <branch> --head <branch>` and `gh pr edit [<number> | <url> | <branch>]` are the documented forms.

- **Mirror for the sentinel.** `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` (REPO_ROOT marker guard, `count()` helper, one JSON line, exit 0/1/2). Its cases in `tests/promptfoo/datasets/ship-sdlc-exec.yaml:64-82` use `javascript` assertions. `tests/promptfoo/baselines/dataset-asserts-allow.json` flags key-only `contains` asserts, so the new cases use `javascript` asserts too.

- **Old literals.** `git grep -n -F "gh pr create --title"` and `git grep -n -F "gh pr edit --title"` hit only SKILL.md and two historical plans (`docs/plans/2026-10-27-m51-w6-direct-b.md` and its site copy), which stay as history. The retry phrase "same arguments **exactly once**" also sits in the behavioural fixture `tests/promptfoo/fixtures/feature-branch-permission-denied.md:65`; the plan keeps that phrase intact, so the fixture needs no change. No test asserts the changed `gh` lines.

- **TK-030 reproduces.** `plugins/sdlc-utilities/scripts/lib/plan-critique.js:238` inlines `name === 'guardrail-compliance'` in the rerun predicate. The same literal also sits at `:11`, `:155`, `:156`, `:687`, `:708`, `:717` and `:734`; those are lane-table data or no-guardrails handling, not the any-issue rule, so they stay. `git grep -n "ANY_ISSUE"` has no hit. The 32 cases `git grep -c -E 'description: "plan-(diff|merge):' tests/promptfoo/datasets/plan-prepare-exec.yaml` cover the predicate.

- **TK-031 reproduces.** `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:270` (item 3) ends "echo `step.data.marker` either way." with no citation; item 2 at `:269` ends "(R-todowrite-visibility)". The sentinel `check-ship-tool-handling-sentinels.js` counts the needle "when that tool is available (skip the call when it is not)" twice; the appended citation does not touch it.

- **Copy rules.** `.sdlc/config.json` `plan.copyRules` require, for a change to `skills/<skill>/SKILL.md` or `docs/specs/<skill>.md`: `docs/skills/<skill>.md`, its site copy, `site/src/data/skills-meta.ts` and the other `.md` files in the skill directory; and the site copy of each changed `docs/specs` and `docs/skills` file. `cmp` shows that the four site copies (`specs/pr-sdlc.md`, `skills/pr-sdlc.md`, `skills/ship-sdlc.md`, `specs/ship-sdlc.md`) are byte-equal to their sources today. pr-sdlc has no companion `.md`; ship-sdlc has five (`config-format.md`, `entry-modes.md`, `openspec-steps.md`, `reference.md`, `state-format.md`).

- **Count checks.** `tests/promptfoo/scripts/check-spec-id-coverage.js` fails only on loss ("Growth never fails", `:19`); adding cases needs no baseline refresh. No other script counts the cases of `pr-prepare-exec.yaml`.

- **Commands.** Exec-only targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| TK-029 "Archive the TODO note (promoted)" | no | dropped | `docs/TODO/archive/pr-step-gh-in-main-checkout.md` is already archived with `Status: Promoted (TK-029)` at HEAD. |
| TK-029 split into three tasks | no | spec, SKILL+docs, and sentinel+cases are Tasks 1–3, each with the TK-029 ticket line | Keeps each task at five files or fewer; the chain Task 1 → Task 2 → Task 3 orders the spec before SKILL.md (spec-first guardrail) and the SKILL.md edit before the sentinel; Tasks 4 and 5 run beside Task 1. |
| `site/src/data/skills-meta.ts` | no | listed once, in Task 2, check only | The copy check is plan-wide; one listing satisfies both the pr-sdlc and ship-sdlc triggers and avoids a shared path across tasks (F-43). Its pr-sdlc entry (`create-pr`, "Runs gh pr create or gh pr edit after approval") stays true. |
| ship-sdlc companions and docs | no | listed in Task 5 as check only | Required by `plan.copyRules`; a citation in SKILL.md changes nothing users read. |
| Fork remotes | no | not handled | The ticket states that origin is assumed to be the base repo. |

## Key Decisions

- **Pass the refs from pr-context, not from `git branch`.** The skill substitutes `baseBranch` and `currentBranch` from the prepare output. The alternative, reading the branch again in the skill, would break R14 (prepare output is the single source of facts).

- **The retry keeps "the same arguments".** The E7 retry sentence gains a short parenthesis that names `--base` and `--head`. Rewriting the sentence would break the behavioural fixture phrase and add churn for no gain.

- **A sentinel script over a dataset `contains` assert.** The script scans every `gh pr create` and `gh pr edit` line inside fenced blocks, so a new gh call without refs also fails. A fixed-string assert would only pin today's lines.

- **A negative fixture proves the sentinel fails.** The second case runs the script on a small fixture that holds the old command shapes. This shows the "fails when a gh call lacks the refs" acceptance item directly.

- **One constant for TK-030.** Only the predicate at `:238` uses the new Set. The other literals are lane-table data or the no-guardrails path; changing them is out of the ticket's scope.

## Contract Examples

Code:

```markdown
**Contract:**
- shape (code): `node tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js [--file <repo-relative path>]` prints one JSON line `{ ok, file, counts }`; exit 0 when ok, 1 when not, 2 on a usage or read error.
- names: `check-pr-gh-ref-sentinels.js`, `counts.createCalls`, `counts.createWithRefs`.
- mirror: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js:1-46`.
- decisions: scan only fenced code lines.
- sync: the `pr-gh-refs:` cases read `ok` and `counts`.
```

Docs:

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/pr-sdlc.md` `### Base Branch Resolution`; append one sentence (audience: end users).
- names: section `### Base Branch Resolution (issue #339)`.
- mirror: the paragraph style at `docs/skills/pr-sdlc.md:302-310`.
- decisions: user-facing prose only.
- sync: `site/src/content-source/skills/pr-sdlc.md` is a byte copy.
```

OpenSpec / spec:

```markdown
**Contract:**
- shape (openspec): ADD requirement `R-gh-explicit-refs` to `docs/specs/pr-sdlc.md` under `### Pipeline steps`, after R13; one Acceptance sub-bullet naming the `pr-gh-refs:` exec cases.
- names: `R-gh-explicit-refs` (new).
- mirror: R-basebranch-config-cascade and its Acceptance sub-bullet at `docs/specs/pr-sdlc.md:43-44`.
- decisions: a named id, matching the file's other `R-<name>` ids.
- sync: SKILL.md cites it; `site/src/content-source/specs/pr-sdlc.md` is a byte copy.
```

## Tasks

### Task 1: pr-sdlc spec requirement R-gh-explicit-refs
**Ticket:** TK-029 @9363d4d7

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — add R-gh-explicit-refs under `### Pipeline steps` and one Issue-trail row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy of `docs/specs/pr-sdlc.md`

**Notes:** The spec comes first (spec-first guardrail); the cases it names are added in Task 3.

**Acceptance criteria:**
- [x] `docs/specs/pr-sdlc.md` holds the R-gh-explicit-refs bullet below R13 with an Acceptance sub-bullet naming the `pr-gh-refs:` cases of `tests/promptfoo/datasets/pr-prepare-exec.yaml`.
- [x] The Issue trail table has the row `| R-gh-explicit-refs | explicit gh base and head refs, F-195 (TK-029) |`.
- [x] `cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md` exits 0 (copied with `cp`).
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD after the R13 bullet in `### Pipeline steps`:

  ```markdown
  - R-gh-explicit-refs: SKILL.md names both branches in every `gh` publish call. `gh pr create` passes `--base '<baseBranch>' --head '<currentBranch>'`, with both values from pr-context (R-basebranch-config-cascade, R14); the E7 retry re-runs it with the same arguments, so with the same refs; `gh pr edit` names the branch as its first argument: `gh pr edit '<currentBranch>' …`. The skill never lets `gh` infer the branch from the working directory, so a run from a checkout on another branch neither fails with head equal to base nor publishes another branch. `origin` is assumed to be the base repository (no fork support).
    - Acceptance: exec cases whose descriptions start with `pr-gh-refs:` in `tests/promptfoo/datasets/pr-prepare-exec.yaml` (sentinel `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js`).
  ```

  ADD the Issue-trail row after the last row (`| R15 | reserved, multicast, … #9375 |`).
- names: `R-gh-explicit-refs`.
- mirror: R-basebranch-config-cascade with its Acceptance sub-bullet at `docs/specs/pr-sdlc.md:43-44`; Issue-trail rows at `:203-225`.
- decisions: new named id; no existing id is renumbered; tracking ids appear only in the appendix row.
- sync: `site/src/content-source/specs/pr-sdlc.md` byte copy; SKILL.md (Task 2) cites the id.

### Task 2: pr-sdlc SKILL.md passes explicit gh refs
**Ticket:** TK-029 @9363d4d7

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — add `--base`/`--head` to `gh pr create`, name the refs in the E7 retry, name the branch in `gh pr edit`
- Modify: `docs/skills/pr-sdlc.md` — one sentence in `### Base Branch Resolution`
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy of `docs/skills/pr-sdlc.md`
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (pr-sdlc `create-pr` step text stays true)

**Notes:** Medium risk because the edited lines are the live publish commands. The values come from pr-context so that R14 (prepare output is the only fact source) holds; Key Decisions explains why the retry sentence only gains a parenthesis.

**Acceptance criteria:**
- [x] The create command in SKILL.md reads exactly as the "after" line below and cites R-gh-explicit-refs in the paragraph that follows it.
- [x] The E7 retry sentence contains `with the same arguments **exactly once** (the same `--base` and `--head`, R-gh-explicit-refs)`.
- [x] The update command reads exactly as the "after" line below.
- [x] `cmp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md` exits 0 (copied with `cp`).
- [x] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (code): three SKILL.md edits.

  Create mode step 2 (fenced block under "2. Create the PR"):

  ```diff
  -   gh pr create --title '<title>' --body-file '<BODY_FILE>' [--draft] [--label '<l1>' --label '<l2>'] 2> '<ERR_FILE>'
  +   gh pr create --base '<baseBranch>' --head '<currentBranch>' --title '<title>' --body-file '<BODY_FILE>' [--draft] [--label '<l1>' --label '<l2>'] 2> '<ERR_FILE>'
  ```

  The paragraph right after it starts with the new sentence: "Substitute `baseBranch` and `currentBranch` from pr-context; never let `gh` take the branch from the working directory (implements R-gh-explicit-refs)." The rest of that paragraph is unchanged.

  E7 retry bullet (`recovered: true` and `switched: true`):

  ```diff
  - Re-run `gh pr create` with the same arguments **exactly once**, without the `2>` redirect, …
  + Re-run `gh pr create` with the same arguments **exactly once** (the same `--base` and `--head`, R-gh-explicit-refs), without the `2>` redirect, …
  ```

  Update mode:

  ```diff
  - gh pr edit --title '<title>' --body-file '<BODY_FILE>' [--add-label '<l1>,<l2>']
  + gh pr edit '<currentBranch>' --title '<title>' --body-file '<BODY_FILE>' [--add-label '<l1>,<l2>']
  ```

  The sentence above the update block gains: "Substitute `currentBranch` from pr-context (implements R-gh-explicit-refs)."

  `docs/skills/pr-sdlc.md`, end of `### Base Branch Resolution (issue #339)` (after the "Configure `pr.defaultBranch` …" paragraph), new paragraph: "The skill passes the resolved base branch and the current branch to `gh` explicitly (`gh pr create --base <base> --head <branch>`, `gh pr edit <branch>`), so running it from a checkout on another branch never opens or edits the wrong PR. The `origin` remote is assumed to be the base repository."
- names: `R-gh-explicit-refs`, `<baseBranch>`, `<currentBranch>`.
- mirror: the single-quoted placeholder style of the existing command at `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:497`; the substitution sentence at `:500`.
- decisions: the branch is a single-quoted literal like the title (same quoting rule as `:500`); no new prepare field.
- sync: the sentinel (Task 3) checks these exact strings: `--base '<baseBranch>' --head '<currentBranch>'`, `gh pr edit '<currentBranch>' `, and `with the same arguments **exactly once** (the same `--base` and `--head``. `tests/promptfoo/fixtures/feature-branch-permission-denied.md:65` keeps its phrase (unchanged fragment). Old-literal greps: `git grep -n -F "gh pr create --title"` and `git grep -n -F "gh pr edit --title"` hit only historical plans outside tests.

### Task 3: Sentinel script and exec cases for the gh refs
**Ticket:** TK-029 @9363d4d7

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js`
- Create: `tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md`
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — append two `pr-gh-refs:` cases

**Notes:** Depends on Task 2 because the positive case scans the edited SKILL.md. The fixture holds the HEAD command shapes, so the negative case shows that the sentinel fails on the old SKILL.md text. No "Red on base" claim is made for the positive case (the script does not exist on base).

**Acceptance criteria:**
- [x] `node tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` exits 0 and prints `"ok":true` with `createCalls` 1, `createWithRefs` 1, `editCalls` 1, `editWithBranch` 1, `retryRefs` 1.
- [x] `node tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js --file tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md` exits 1 and prints `"ok":false`.
- [x] `node tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js --bogus` and `… --file` (no value) exit 2 with a usage line on stderr and nothing on stdout.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'pr-gh-refs:'` passes 2 of 2.
- [x] `git grep -c 'description: "pr-gh-refs:' tests/promptfoo/datasets/pr-prepare-exec.yaml` prints 2 (+2 cases; no count or floor check covers this dataset, and `check-spec-id-coverage.js` fails only on loss).

**Contract:**
- shape (code): CLI and output.

  | Input | Exit | stdout | stderr |
  |---|---|---|---|
  | no args (default file `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md`) | 0 ok / 1 not ok | `{"ok":…,"file":"<rel>","counts":{…}}` | empty |
  | `--file <repo-relative path>` | 0 / 1 | same | empty |
  | `--file` with no value, an unknown arg, or an extra arg | 2 | nothing | `Usage: check-pr-gh-ref-sentinels.js [--file <repo-relative path>]` |
  | unreadable file, or REPO_ROOT marker `CLAUDE.md` missing | 2 | nothing | `Script error …` |

  Scan: lines inside fenced code blocks (a line whose trimmed text starts with three backticks toggles the fence). A fenced line whose trimmed text starts with `gh pr create` counts in `createCalls`; with `--base '<baseBranch>' --head '<currentBranch>'` in it, also in `createWithRefs`. A fenced line whose trimmed text starts with `gh pr edit` counts in `editCalls`; when it starts with `gh pr edit '<currentBranch>' `, also in `editWithBranch`. `retryRefs` counts the needle `with the same arguments **exactly once** (the same `--base` and `--head`` over the whole file.

  ```js
  ok = createCalls >= 1 && createWithRefs === createCalls &&
       editCalls >= 1 && editWithBranch === editCalls && retryRefs === 1
  ```

  Fixture `tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md`: a heading, one fenced `bash` block with `gh pr create --title '<title>' --body-file '<BODY_FILE>' 2> '<ERR_FILE>'`, the sentence "Re-run `gh pr create` with the same arguments **exactly once**.", and one fenced block with `gh pr edit --title '<title>' --body-file '<BODY_FILE>'`.

  Dataset cases, appended at the end of `tests/promptfoo/datasets/pr-prepare-exec.yaml`:

  ```yaml
  - description: "pr-gh-refs: SKILL.md passes --base and --head to gh pr create and names the branch in gh pr edit (R-gh-explicit-refs)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const c = r.counts;
          if (r.ok === true && c.createCalls === 1 && c.createWithRefs === 1 && c.editCalls === 1 && c.editWithBranch === 1 && c.retryRefs === 1) return true;
          return { pass: false, score: 0, reason: output };

  - description: "pr-gh-refs: a gh call without the refs fails the sentinel (R-gh-explicit-refs)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js"
      script_args: "--file tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md"
      script_show_exit: true
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output.split('\n')[0]);
          if (r.ok === false && r.counts.createWithRefs === 0 && r.counts.editWithBranch === 0 && output.includes('[exit 1]')) return true;
          return { pass: false, score: 0, reason: output };
  ```
- names: `check-pr-gh-ref-sentinels.js`, `counts.createCalls`, `counts.createWithRefs`, `counts.editCalls`, `counts.editWithBranch`, `counts.retryRefs`, case prefix `pr-gh-refs:`.
- mirror: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js:1-46` (marker guard, `count()`, JSON line, exit codes); cases at `tests/promptfoo/datasets/ship-sdlc-exec.yaml:64-82`; `script_show_exit` per `tests/promptfoo/providers/script-runner.js:23`.
- decisions: the needles are fixed strings over skill text, not shell command parsing, so quote handling (F-51) does not apply; `--file` resolves against REPO_ROOT; usage errors exit 2 (F-151).
- sync: needles must match Task 2's strings byte for byte; Task 1's Acceptance line names the `pr-gh-refs:` prefix.

### Task 4: plan-critique.js any-issue rerun lane constant
**Ticket:** TK-030 @db2536e0

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — add `ANY_ISSUE_RERUN_LANES` and use it in the rerun predicate

**Notes:** Pure refactor from the lean-w51 deferred low (PR #144); the other `'guardrail-compliance'` literals are lane data, so they stay (Key Decisions).

**Acceptance criteria:**
- [x] `plan-critique.js` defines `const ANY_ISSUE_RERUN_LANES = new Set(['guardrail-compliance']);` directly after the `LANE_DEFS` array, and the rerun predicate uses `ANY_ISSUE_RERUN_LANES.has(name)`.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'plan-(diff|merge):'` passes all 32 cases (`git grep -c -E 'description: "plan-(diff|merge):' tests/promptfoo/datasets/plan-prepare-exec.yaml`).

**Contract:** shape (code): in the rerun loop over `LANE_DEFS`, `- v => v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && (i.blocking === true || name === 'guardrail-compliance')))) out.add(name);` becomes `+ v => v.laneStatus !== 'ok' || v.issues.some(i => isObject(i) && (i.blocking === true || ANY_ISSUE_RERUN_LANES.has(name))))) out.add(name);`, plus a one-line comment above the constant: `// Lanes rerun on any previous issue, not only a blocking one (R67 (b)).`; names: `ANY_ISSUE_RERUN_LANES`; sync: none (not exported)

### Task 5: ship-sdlc SKILL.md item 3 cites R-todowrite-visibility
**Ticket:** TK-031 @c4859619

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — append the citation to item 3 of the Step loop
- Modify: `docs/skills/ship-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected (byte copy of `docs/skills/ship-sdlc.md`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected

**Notes:** The extra paths are the copies `plan.copyRules` requires; a citation changes nothing they state (`site/src/data/skills-meta.ts` is checked in Task 2).

**Acceptance criteria:**
- [x] Item 3 ends with "echo `step.data.marker` either way (R-todowrite-visibility)."
- [x] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'ship-sdlc/tool-handling:'` passes 2 of 2 (the `todoGuard` needle count stays 2).

**Contract:** shape (code): `- … and echo `step.data.marker` either way.` becomes `+ … and echo `step.data.marker` either way (R-todowrite-visibility).` in item 3 ("Print `step.action`. If `step.data.todos` is present, …"); names: `R-todowrite-visibility`; sync: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` needle "when that tool is available (skip the call when it is not)" is untouched

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 3 adds pr-gh-refs exec cases for the pr-sdlc SKILL.md change; Task 4 is a no-behaviour refactor covered by the existing 32 plan-diff/plan-merge cases; Task 5 keeps the ship-sdlc sentinel cases. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | All tasks map to TK-029, TK-030 and TK-031. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable. |
| scripts-over-llm-logic | error | PASS | Branch values come from prepare output, and a deterministic sentinel script pins the edits. |
| yagni | warning | PASS | No speculative abstractions; fork remotes are explicitly not handled. |
| cross-skill-consistency | error | PASS | The ship-sdlc citation and the plan.copyRules copies are covered. |
| pr-link-github-issue | error | PASS | W-F1 and the TK ids are internal ids, not GitHub issues. |
| dry | warning | PASS | The Set replaces one inline literal; no duplicated logic. |
| kiss | warning | PASS | The edits are minimal and the sentinel mirrors an existing script. |
| spec-first | error | PASS | Task 1 updates docs/specs/pr-sdlc.md, and Task 2 (SKILL.md) depends on Task 1, so the spec is ordered first. |
| project-agnostic | error | PASS | The change is in plugin SKILL.md and scripts, which ship to consumers. |
| flag-coherence-cross-skill | error | PASS | No flag gating is added. |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings are introduced. |
| flag-resolution-single-source | warning | PASS | baseBranch and currentBranch are resolved once in pr-context and only referenced. |
| state-premise | error | PASS | Context states the problem: gh infers the head branch from the cwd. |
| smallest-viable-cut | warning | PASS | Each task is justified in Deviations and Key Decisions. |
| failure-audience | warning | PASS | Context names the failure: a main-checkout PR run fails or opens a PR for the wrong branch. |
| explicit-non-goals | warning | PASS | Fork remotes and the other lane literals are explicitly excluded. |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is changed. |
| flag-semantic-consistency-cross-skill | error | PASS | The new --file flag is on a test sentinel script, not a user-invoked skill prepare script. |
| workspace-mode-compatibility | error | PASS | Explicit refs from pr-context are mode-independent; no state or config paths are touched. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 3 creates `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` with a new `--file <repo-relative path>` flag, exit codes 0/1/2 and a `{ ok, file, counts }` JSON line that the `pr-gh-refs:` cases consume.

**Severity hint:** high

**Patch:** Check the new check-pr-gh-ref-sentinels.js CLI contract: the --file flag, exit codes 0/1/2, and the one-line JSON output shape.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new check-pr-gh-ref-sentinels.js CLI contract: the --file flag, exit codes 0/1/2, and the one-line JSON output shape.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-5 touch many markdown paths, such as `docs/specs/pr-sdlc.md` and `plugins/sdlc-utilities/skills/ship-sdlc/reference.md`, that the code-quality triggers do not match, so the script proposes the trigger `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Final Shape

- pr-sdlc publishes only the branch that pr-context names. `gh pr create` carries `--base` and `--head`, the E7 retry repeats them, and `gh pr edit` names the branch. A run from the main checkout no longer fails with head equal to base.

- The pr-sdlc spec holds R-gh-explicit-refs, the user doc says the refs are explicit, and both site copies are byte copies.

- A sentinel script guards every fenced `gh pr` line of pr-sdlc SKILL.md. Two exec cases pin the pass and the fail path.

- `plan-critique.js` names its any-issue rerun lane in `ANY_ISSUE_RERUN_LANES`; behaviour is unchanged.

- ship-sdlc SKILL.md item 3 cites R-todowrite-visibility, like item 2.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
