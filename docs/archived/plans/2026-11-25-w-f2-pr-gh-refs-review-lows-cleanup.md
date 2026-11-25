# W-F2 pr-gh-refs Review Lows Cleanup Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #156, 3bd572d

**Commit:** `fix(W-F2): pr-sdlc - sentinel arg branch and update-mode quoting`
**Goal:** Close the two low review findings that W-F1 (PR #153) left open: remove an empty if-branch from the pr-gh-refs sentinel script (BG-001) and remove a stale `baseBranch` name from the pr-sdlc update-mode quoting sentence (TK-032).
**Architecture:** Two independent one-file edits with no behaviour change. Task 1 restructures the argument check of `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js`; Task 2 edits one sentence of `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md`. Both run in one execute wave and are verified by the two `pr-gh-refs:` exec cases.
**Source:** docs/plans/programme.md#W-F2
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern pr-gh-refs:`

---

## Context

**What problem does this change solve?**

- The sentinel script has an `if` branch that holds only a comment. It adds control flow and does nothing.
- The pr-sdlc update-mode instruction tells the model to quote `baseBranch`. The only command in that mode has no `<baseBranch>` placeholder, so the instruction names a value that is never used.

**What prompted this change now?**

- The W-F1 review (PR #153) reported both as low findings. They were kept in the TODO note `docs/TODO/archive/pr-gh-refs-review-lows.md` and promoted to tickets BG-001 and TK-032.
- The owner scheduled them as the light wave W-F2 (decision PD-10, `docs/plans/decisions.md:69`).

**What does success look like?**

- The script argument check has no empty branch and behaves exactly as before.
- The update-mode sentence names only the title, each label and `currentBranch`.
- The two `pr-gh-refs:` exec cases still pass, 2 of 2, with no change to the dataset.

## Research Findings

Both items were re-verified at HEAD `46b085e` (the wave ships on `main` from this base, so line numbers are exact).

- **BG-001 reproduces.** `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js:10-19` holds:

  ```js
  const args = process.argv.slice(2);
  let file = DEFAULT_FILE;
  if (args.length === 0) {
    // default file
  } else if (args.length === 2 && args[0] === '--file') {
    file = args[1];
  } else {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  ```

  Lines 12-13 are the empty branch. The usage error already exits 2 with the usage text on stderr and no JSON on stdout (rule F-151), so that part stays.

- **TK-032 reproduces.** `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:531` (update mode) reads "Substitute the title, each label, `baseBranch` and `currentBranch` as a single-quoted literal …". The only command of that mode (`SKILL.md:534`) is `gh pr edit '<currentBranch>' --title '<title>' --body-file '<BODY_FILE>' [--add-label '<l1>,<l2>']`. It has no `<baseBranch>`.

- **Fragment grep for the reworded sentence (F-180, F-192).** Commands run over the whole repository:
  - `git grep -n -F 'each label, `baseBranch`'` — hits `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:500` (create mode, where `gh pr create` does use `<baseBranch>`; it stays) and `:531` (the target).
  - `git grep -n -e "as a single-quoted literal" -e "each label" -e "Substitute the title"` — beyond pr-sdlc SKILL.md, hits only unrelated sentences in `error-report-sdlc`, `harden-sdlc` and `jira-sdlc` SKILL.md files, the archived TODO note, the TK-032 ticket and historical plans. None is a copy of the update-mode sentence.
  - `git grep -n -e 'label~' -e 'single-quoted~' -e 'single-quoted\\x20' -- tests` — no hits.
  - `git grep -n -e "each label" -e "single-quoted literal" -- tests` — no hits. No test asserts the old sentence.
  - `docs/specs/pr-sdlc.md:73` (R-gh-explicit-refs) does not hold the sentence; no spec change is needed.
  - The fixture `tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md` does not hold the sentence.

- **Tests.** `tests/promptfoo/datasets/pr-prepare-exec.yaml:644` and `:655` are the two `pr-gh-refs:` exec cases. The first runs the script with no arguments over pr-sdlc SKILL.md and expects `ok: true` with counts 1/1/1/1/1. The second runs `--file tests/promptfoo/fixtures-fs/pr-gh-refs-missing/SKILL.md` and expects `ok: false` and exit 1. Together they cover the no-argument and the `--file` paths. The sentinel counts `gh pr create` and `gh pr edit` command lines, not prose, so the sentence edit does not change its counts. No dataset case is added, moved or removed, so no count check and no `tests/promptfoo/baselines/spec-id-coverage.json` refresh applies.

- **Exec-only verification.** The command in the header is the targeted exec run from the project notes. It uses no LLM provider.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Usage error exit code (third item of the TODO note) | no | not changed; exit 2 stays | Dropped by scope: exit 2 is a documented convention (W-E3 plan lines 78 and 98; rule F-151). |
| Create-mode sentence at `SKILL.md:500` | no | not changed | It also names `baseBranch`, but `gh pr create` there uses `--base '<baseBranch>'`, so the name is correct. TK-032 limits the edit to the update-mode sentence. |
| No new test case | no | relies on the two existing `pr-gh-refs:` exec cases | BG-001 A2 requires them unchanged; TK-032 is a prose fix that no test asserts. |

## Key Decisions

- **Invert the check instead of keeping three branches.** The script tests the `--file` form first and exits 2 for any other non-empty argument list. The alternative, keeping `if (args.length === 0)` with a no-op, is the defect itself. The chosen form is the one the ticket's fix direction names.

- **Two tasks, one wave.** The edits touch different files and share no output. Running them in parallel keeps the wave to one execute step.

- **No spec or docs change.** The pr-sdlc behaviour does not change: the update command was always `gh pr edit '<currentBranch>' …`. The spec R-gh-explicit-refs already states this, and no user doc holds the sentence.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): argument check of `check-pr-gh-ref-sentinels.js`: `--file <path>` (exactly two arguments) sets `file`; no arguments keep `DEFAULT_FILE`; anything else writes `USAGE` to stderr and exits 2.
- names: `args`, `file`, `DEFAULT_FILE`, `USAGE`.
- mirror: the existing check at `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js:10-19`.
- decisions: test the `--file` form first, then `args.length !== 0` (ticket fix direction).
- sync: `tests/promptfoo/datasets/pr-prepare-exec.yaml` cases `pr-gh-refs:` stay unchanged.
- example: `node check-pr-gh-ref-sentinels.js --bogus` → usage on stderr, exit 2, empty stdout.
```

## Tasks

### Task 1: Remove the empty branch from the sentinel argument check
**Ticket:** BG-001 @b64957fa

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` — restructure the argument check, no behaviour change

**Notes:** Source row: `docs/TODO/archive/pr-gh-refs-review-lows.md`, first finding (empty if-branch; its line 42 citation is stale, the branch is at lines 12-13).

**Acceptance criteria:**
- [x] The argument check of `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` has no empty branch and no `// default file` comment (BG-001 A1).
- [x] `node tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js --bogus` exits 2, prints the usage line on stderr and prints nothing on stdout.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern pr-gh-refs:` passes 2 of 2, with `tests/promptfoo/datasets/pr-prepare-exec.yaml` unchanged (BG-001 A2).

**Contract:**
- shape (code): replace lines 12-19 of the script. Before → after:

  ```diff
   const args = process.argv.slice(2);
   let file = DEFAULT_FILE;
  -if (args.length === 0) {
  -  // default file
  -} else if (args.length === 2 && args[0] === '--file') {
  +if (args.length === 2 && args[0] === '--file') {
     file = args[1];
  -} else {
  +} else if (args.length !== 0) {
     process.stderr.write(USAGE);
     process.exit(2);
   }
  ```

  Exit codes and output stay as now: no arguments → default file; `--file <path>` → that path; any other argument list (a flag without its value, an unknown flag, extra arguments) → `USAGE` on stderr, exit 2, no JSON on stdout (F-151).
- names: `args`, `file`, `DEFAULT_FILE`, `USAGE`.
- mirror: the current check at `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js:10-19`.
- decisions: test the `--file` form first (ticket fix direction); no other line of the script changes.
- sync: the `pr-gh-refs:` cases at `tests/promptfoo/datasets/pr-prepare-exec.yaml:644` and `:655` stay unchanged.

### Task 2: Remove baseBranch from the update-mode quoting sentence
**Ticket:** TK-032 @3b6457a0

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — drop `baseBranch` from the update-mode sentence at line 531 only
- Modify: `docs/skills/pr-sdlc.md` — check only, no change expected (grep for `each label`, `single-quoted` and `baseBranch` gives no hit)
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy of `docs/skills/pr-sdlc.md`; check only, no change expected (`cmp` shows it is identical)
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (the same grep gives no hit)

**Notes:** Source row: `docs/TODO/archive/pr-gh-refs-review-lows.md`, third finding (update-mode quoting rule names `baseBranch`); the create-mode sentence at line 500 is correct and stays.

**Acceptance criteria:**
- [x] The update-mode sentence (the line after `**Update mode:**`) in `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` no longer names `baseBranch` (TK-032 A1).
- [x] `git grep -n -F 'each label, `baseBranch`' -- plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` gives exactly one hit, the create-mode line (was 2).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern pr-gh-refs:` passes 2 of 2.

**Contract:**
- shape (code): one sentence edit at `SKILL.md:531`. Before → after:

  ```diff
  -Run each command below as its own plain Bash call, in this order. Substitute the title, each label, `baseBranch` and `currentBranch` as a single-quoted literal (write any `'` inside it as `'\''`; never put it inside double quotes). Substitute `currentBranch` from pr-context (implements R-gh-explicit-refs).
  +Run each command below as its own plain Bash call, in this order. Substitute the title, each label and `currentBranch` as a single-quoted literal (write any `'` inside it as `'\''`; never put it inside double quotes). Substitute `currentBranch` from pr-context (implements R-gh-explicit-refs).
  ```

- names: `currentBranch`, `R-gh-explicit-refs`.
- mirror: the create-mode quoting sentence at `SKILL.md:500`.
- decisions: no other line changes; fragment grep (Research Findings) found no test, spec, doc or site copy of this sentence, so no other file is listed.
- sync: none to edit — `docs/specs/pr-sdlc.md:73`, `docs/skills/pr-sdlc.md`, its site copy and `site/src/data/skills-meta.ts` do not hold the sentence; the worker confirms with the same grep and leaves them unchanged.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The two existing pr-gh-refs exec cases cover both edits, and no test asserts the old sentence. |
| no-ci-bypass | error | PASS | No CI step is skipped or disabled. |
| no-auto-eval | error | PASS | Only a targeted exec-only run with --filter-pattern pr-gh-refs: is used. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Only BG-001 and TK-032 are addressed. The exit-code item and the create-mode sentence are explicitly excluded. |
| single-responsibility-tasks | warning | PASS | Each task has exactly one deliverable. |
| scripts-over-llm-logic | error | PASS | The edit removes a stale name from prose and adds no LLM logic. |
| yagni | warning | PASS | Nothing speculative is added. |
| cross-skill-consistency | error | PASS | The edit touches one pr-sdlc sentence, and the repo-wide fragment grep found no copies in other skills. |
| pr-link-github-issue | error | PASS | BG-001, TK-032 and W-F2 are internal register ids, so the rule does not apply. |
| dry | warning | PASS | No duplicated logic is introduced. |
| kiss | warning | PASS | The change is a minimal restructure of one conditional and a one-word prose removal. |
| spec-first | error | PASS | This is a prose fix with no behaviour change, and the plan records why no spec task is needed. |
| project-agnostic | error | PASS | The edit is to the plugin SKILL.md and a test helper, with no repo-local config. |
| flag-coherence-cross-skill | error | PASS | No flags are involved. |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced or changed. |
| flag-resolution-single-source | warning | PASS | No flags are involved. |
| state-premise | error | PASS | The Context section states the problem for both defects. |
| smallest-viable-cut | warning | PASS | The plan is two trivial tasks, which is already the minimum. |
| failure-audience | warning | FAIL | The plan does not name who or what fails if it ships incorrectly. |
| explicit-non-goals | warning | PASS | The Deviations table lists the exit-code item and the create-mode sentence as excluded. |
| ambiguity-stops-and-asks | error | PASS | Key Decisions records the branch-inversion choice. |
| state-machine-idempotency | error | PASS | No migration, initialization or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added, and the existing --file argument is unchanged. |
| workspace-mode-compatibility | error | PASS | No state, config or path logic is touched, so behaviour is identical under branch and worktree. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Task 2 edits `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` (the update-mode sentence naming `baseBranch`), a markdown path that the `code-quality` dimension's triggers do not yet match.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Final Shape

- `tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js` checks its arguments with two branches: the `--file` form, then a usage error for any other non-empty list. Its behaviour is unchanged.

- The pr-sdlc update-mode instruction asks to quote only the values its command uses: the title, each label and `currentBranch`.

- The two `pr-gh-refs:` exec cases pass 2 of 2. No dataset, spec, doc or register file changes.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
