# Lean wave 18: remaining low findings Implementation Plan

**Commit:** `fix(#9384): plan, guard, tests - R72 reason field, regex names, docs`
**Goal:** Close the low findings that waves 16 and 17 left open, plus followup F-83 (todo #9383):
- spec R72 names the fields of the brief check's JSON, and its acceptance line names the real case prefix;
- the R72 exec case for a file as outDir asserts the reason code;
- plan-sdlc SKILL.md names the brief check by its current name, and the user doc's routing table matches SKILL.md;
- the ship-sdlc user doc gives the full condition for a null `counts`;
- the worker write guard names the regexes around `argWords`;
- the fixture guard scan ignores shell comments, with a new exec case.
**Architecture:** Five independent tasks in one execute wave; no two tasks share a file. Spec first: R72 is amended in place (no new id) with an appendix row for #9384. The guard change is a pure refactor (named constants, same behaviour), proved by the existing hook exec cases. The fixture guard gets a quote-aware comment strip and a `--dir <path>` option so the new case scans its own fixture tree.
**Source:** conversation context (wave 18 brief; lean ledger deferred backlog of PR #93 and PR #94; todo #9383, ledger F-83)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- Reviews of PR #93 and PR #94 left low findings open. They are small drifts between spec, skill text, user docs, tests and code.
- The fixture guard check (a test script that makes sure fixture `setup.sh` files refuse to run inside a git work tree) reads shell comments as commands. A `setup.sh` that only mentions `git init` in a comment must carry the guard line, or the check fails.

**What prompted this change now?**

The owner asked on 2026-11-13 for one more wave to clean up the remaining lows.

**What does success look like?**

- Each item below is fixed or dropped with evidence.
- The targeted exec cases pass, and the main-session validators stay green.

### Re-verification at HEAD 461eed5

| Item | Still reproduces | Evidence |
|---|---|---|
| 1 guard regex names | yes | `plugins/sdlc-utilities/hooks/worker-write-guard.js:301` `/\S+/g`, `:307` `/\$(?=["'])/g`, `/["']/g`, `/\\|\$['"]/`, `:314` `/\\/g`, `:343` the same unsafe regex again, `:263` `/^["']/` and `/["']$/`, `:292` `/^["']/`, `:283` and `:292` `/\s+/`, `:175` `/\\/g`. Only `WORKER_RE` (`:31`) and `ALLOWED_TARGET_RE` (`:33`) are named. |
| 2 exit 2 without JSON | **no — dropped** | R72(d) (`docs/specs/plan-sdlc.md:78`) says "Exit 2 is an input error and prints no JSON". The script matches (`plan-explore.js:455-460`: one stderr line, exit 2). SKILL.md already handles it (`SKILL.md:155`: "any other non-zero exit (2 is an input error and prints no JSON): use the **Error fallback** with reason `check-brief failed (exit <n>): <first stderr line>`"). R28 (`docs/specs/plan-sdlc.md:221`) lists that reason. The option that matches R72 (no JSON on exit 2, stderr line as reason) is already in place. |
| 3 "validation passed" | yes | `SKILL.md:157` "**Brief consumption (when brief is present AND validation passed):**"; the step is "**Brief check (R72):**" (`SKILL.md:151`). |
| 4 `reason` field | yes, partly | R72(d) says the check "prints its JSON with one reason code" but never names the field or the JSON shape. The script prints `{ ok, reason, dimensions, missingResults, findingIds }` (+ `error` for `check-error`) (`plan-explore.js:413`, `:465`). SKILL.md:155 reads `reason`. Fix: define the field in the spec; SKILL.md keeps reading it. |
| 5 counts-null condition | yes | `docs/skills/ship-sdlc.md:261` "(null when the review summary was missing or unreadable)". R106 (`docs/specs/ship-sdlc.md:241`) says "missing, stale or malformed". Code: `ship.js:1835` returns `missing` for a summary older than the review step (stale), `:1840-1843` for invalid verdict or counts; `reviewRoundRecord` (`ship.js:1923`) sets `counts` to null when `parseable` is false. |
| 6 scope table | yes | `docs/skills/plan-sdlc.md:44-47` vs `SKILL.md:28-31`: four cells differ (row 1 Normal, row 2 Scope, row 3 Scope, row 4 Normal and Plan). |
| 7 file-as-outDir case | yes | `tests/promptfoo/datasets/plan-prepare-exec.yaml:1064-1073` asserts `typeof r.reason === 'string' && r.reason.length > 0`. Run at HEAD: the script prints `{"ok":false,"reason":"brief-missing",...}` and exits 1. |
| 8 R104 re-check lows | one found | R72's acceptance line (`docs/specs/plan-sdlc.md:79`) names cases "whose descriptions start with `plan-explore: (r72)`", but all six cases start with `plan-explore --check-brief:` (`plan-prepare-exec.yaml:1008-1064`). No other drift: R106, `reviewRoundRecord` and the R106 acceptance prefix `ship-summary-rounds:` (2 cases) agree. The second low's title was not kept; no further drift was found, so none is invented. |
| 9 fixture guard comments | yes | `tests/promptfoo/scripts/check-fixture-guard.js:50` decides scope with a raw `content.includes('git init')`, comments included; `:40-43` `isGitLine` skips only full-line comments, so `echo x # git init` counts as a git line. A `setup.sh` whose only mention is a comment, with no guard line, is reported unguarded. `fixtures-fs/worktree-non-git-cwd/setup.sh:2-6` carries the guard only for this reason. |

## Research Findings

All finding ids below come from the discovery brief (`F-<dimension>-<n>`).

**Brief check (F-check-brief-exit2-reason-contract-1 to -6).** `checkBrief` builds `res = { ok: false, reason: null, dimensions: [], missingResults: [], findingIds: 0 }` (`plan-explore.js:413`). A thrown error gives `reason: 'check-error'` with an `error` text (`:465`). A file given as outDir makes `readFileSync` fail with ENOTDIR, which gives `brief-missing` (`:416-419`). The sibling case at `plan-prepare-exec.yaml:1053-1062` is the assertion template. Spec and user doc have byte copies under `site/src/content-source/`; SKILL.md has none.

**Review rounds (F-review-rounds-null-condition-drift-1 to -4).** The only drift is the parenthetical at `docs/skills/ship-sdlc.md:261`. Its site copy `site/src/content-source/skills/ship-sdlc.md:261` is byte-identical. The spec needs no change.

**Scope table (F-plan-sdlc-scope-table-doc-alignment-1, -3, -4).** No spec id covers the routing table wording, so SKILL.md is the source. `site/src/data/skills-meta.ts:36` describes the explore step and does not quote the table.

**Guard regexes (F-worker-write-guard-regex-constants-1 to -9).** Named constants in this file use SCREAMING_SNAKE with a trailing `//` comment (`MAX_ESCAPED_WORD`, `NO_COMMAND`, `:105-108`). Regex constants use the `_RE` suffix (`:31`, `:33`). `argWords` uses `/\S+/g` with `exec` in a loop, so a shared constant must not be used directly: its `lastIndex` would carry over between calls. `String.prototype.replace`, `split` and a non-global `test` do not have this problem. The hook has 100 exec cases in `tests/promptfoo/datasets/worker-write-guard-exec.yaml`, run by `promptfooconfig-exec-hooks.yaml:23`; every description starts with `worker-write-guard:`.

**Fixture guard (F-fixture-guard-setup-sh-matching-1 to -9).** Case (a) (`fixture-guard-exec.yaml:3-8`) scans the whole `fixtures-fs` tree and needs `scanned >= 150`. A simulation of the new rule over the 165 scanned files today gives 164: only `worktree-non-git-cwd` leaves the scope, and it keeps its guard line. Skipping full-line comments must stay (163 of 165 files have a guard comment). The exec runner copies a `project_root` fixture to a temp directory and runs only a top-level `setup.sh` there (`tests/promptfoo/scripts/extract-skill-content.js:48-67`). A fixture directory with `setup.sh` files only in subdirectories is copied, not run.

**Copy rules.** `.sdlc/config.json` `plan.copyRules`: a task that lists `docs/specs/plan-sdlc.md` or `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` needs `docs/skills/plan-sdlc.md`, its site copy, `site/src/data/skills-meta.ts` and the skill's companion `.md` files listed in some task. Task 2 lists them.

**Commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`; hook cases use `-c promptfooconfig-exec-hooks.yaml`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item 2 | no | dropped; no change | Already fixed at HEAD: R72(d), `plan-explore.js:455-460` and `SKILL.md:155` agree (see the re-verification table) |
| Item 8 | no | fixes one drift: the R72 acceptance prefix | The only spec/SKILL/doc/code drift found with evidence; the brief says do not invent issues |
| R72 acceptance fix direction | no | changes the spec line, not the six case descriptions | One line instead of six; the case names already describe the check well |
| Guard regex scope | no | names the regex literals from `isAllowedTarget` to `gitApplyDenied` (`:262-345`) plus the backslash copy at `:175` | The brief says "argWords (and nearby helpers)". `tokenize`, `isAssignment`, `isDuration` and the commented `redirectDenied` regex are further away and stay as they are (smallest cut) |
| Fixture guard `--dir` option | no | adds `--dir <path>` to `check-fixture-guard.js` | The new case needs to scan only its own fixture tree, so it can assert an exact `scanned` count |
| No new guard test case | no | Task 4 adds no case | A pure refactor; the 100 existing hook cases are the regression proof |
| Plan file under Task 5 | no | Task 5 lists `Create: docs/plans/2026-11-13-lean-w18-remaining-lows.md` | Ship stages only files named in the plan; the project notes put the plan file under the last task |
| pr-link-github-issue guardrail | no | the PR names #9384 and #9383 without `Fixes` or `Closes` | They are internal register ids, not GitHub issues (project notes) |

## Decisions taken without the owner

- **Item 4: define the field in the spec, not stop reading it.** SKILL.md needs the code for the R28 log line, and the script already prints it. Alternative: drop `reason` from SKILL.md. That would lose the reason in the learnings log.
- **Item 2 dropped.** The R72-matching option (exit 2 prints no JSON; SKILL.md uses the stderr line) is already the code and the text at HEAD.
- **Item 8: fix the spec acceptance prefix.** It is the one remaining drift with evidence.

## Key Decisions

- **Spec text over test renames (item 8).** The R72 acceptance line names a prefix no case uses. Changing the spec line is one edit. Renaming six case descriptions is six edits and churns the dataset.

- **Fresh regex per call in `argWords`.** A regex with the `g` flag remembers where its last match ended (`lastIndex`). A shared constant used with `exec` in a loop could start in the middle of the next string. So `argWords` builds `new RegExp(SHELL_WORD_RE)` per call. The other constants are used with `replace`, `split` or a non-global `test`, which do not keep that state.

- **Comment strip is quote-aware, scope check uses it too.** A shell comment starts at a `#` that begins a word outside quotes. `a#b` and `"x # y"` are not comments. The scope check (does this file run git at all?) and the order check (guard before the first git line) both use the stripped line, so a comment never puts a file in scope.

- **A quoted mention still counts.** `echo "git init"` stays a git line. This fails safe: the file must carry the guard. Telling a quoted string from a command would need a shell parser, which a fixture lint does not need.

- **Root problem.** Each item is a place where two sources of truth (spec, skill text, user doc, test, code) say different things, or a check reads text that the shell never runs.

- **Who fails if this ships wrong.** Execute workers, if the guard refactor changes a verdict (the 100 hook cases catch this). Fixture authors, if the fixture check stops seeing a real `git init` (cases (a) and (c) catch this). Readers of the user docs, if a copy drifts from its site copy (`cmp` catches this).

- **Smallest cut.** Five independent tasks, one per surface; every task is one listed item, so no task is extra.

- **Non-goals.** No change to `plan-explore.js` or `ship.js`. No new write-guard deny rule or bypass class (R90 accepted gaps stay). No regex naming in `tokenize`, `isAssignment`, `isDuration` or `redirectDenied`. No rename of the six R72 case descriptions other than the file-as-outDir case. No shell parser for the fixture check. No change to the lean orchestration skill. `--dir` is added to a test script, not to a skill prepare script, so no cross-skill flag check applies.

## Contract Examples

**code**

```markdown
**Contract:**
- shape (code): `function stripComment(line: string): string` returns the text before the first `#` that starts a word outside quotes.
- names: `stripComment`, `isGitLine`.
- mirror: helper style at `tests/promptfoo/scripts/check-fixture-guard.js:40-43`.
- decisions: quoted mentions still count (fail safe).
- sync: case (a) in `fixture-guard-exec.yaml` keeps `scanned >= 150`.
```

**docs**

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `### Review rounds` paragraph 3: the counts-null parenthetical.
- names: `reviewRounds`, `counts`.
- mirror: R106 wording at `docs/specs/ship-sdlc.md:241`.
- decisions: user-facing words, same three cases as the spec.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

**openspec**

```markdown
**Contract:**
- shape (openspec): MODIFY `R72` (d) in `docs/specs/plan-sdlc.md` to name the JSON fields; MODIFY its acceptance line; ADD an appendix row. No new id.
- names: `R72`.
- mirror: requirement style at `docs/specs/plan-sdlc.md:78`.
- decisions: amend in place; ids are never renumbered.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.
```

## Tasks

### Task 1: plan-sdlc spec R72 fields and acceptance prefix, file-as-outDir case

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R72(d) names the check's JSON fields; R72 acceptance prefix; appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec (`cp` then `cmp`)
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — the file-as-outDir case asserts `brief-missing`

**Notes:** Implements items 4, 7 and 8 (F-check-brief-exit2-reason-contract-2, -4, -5). The spec states what the script already prints (`plan-explore.js:413`, `:465`), so no script change is needed. SKILL.md, the user doc and `skills-meta.ts` are listed in Task 2 for the copy rule; none of them states the JSON shape.

**Acceptance criteria:**
- [ ] R72(d) names the JSON object, its fields and when `reason` is null, as in the Contract.
- [ ] The R72 acceptance line names the prefix `plan-explore --check-brief:`; `grep -c 'description: "plan-explore --check-brief:' tests/promptfoo/datasets/plan-prepare-exec.yaml` prints 6.
- [ ] The appendix table has the new row; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-explore --check-brief"` passes all 6 cases.

**Contract:**
- shape (openspec): MODIFY `R72` (d), MODIFY the R72 acceptance line, ADD one appendix row. Delta:

  ```diff
  - Otherwise it exits 1 and always prints its JSON with one reason code: `brief-missing`, `no-dimensions`, `missing-dimension-results`, `no-finding-ids` or `check-error` (an unexpected error inside the check). Exit 2 is an input error and prints no JSON.
  + Otherwise it exits 1. On exit 0 and exit 1 it prints one JSON object on stdout: `{ ok, reason, dimensions, missingResults, findingIds }`, plus `error` (the error text) when `reason` is `check-error`. `reason` is null on exit 0; on exit 1 it is one code: `brief-missing`, `no-dimensions`, `missing-dimension-results`, `no-finding-ids` or `check-error` (an unexpected error inside the check). Exit 2 is an input error (no `<outDir>` value): it prints no JSON, only one `plan-explore.js:` error line on stderr.
  ```

  ```diff
  -  - Acceptance: exec cases whose descriptions start with `plan-explore: (r72)` in `tests/promptfoo/datasets/plan-prepare-exec.yaml`.
  +  - Acceptance: exec cases whose descriptions start with `plan-explore --check-brief:` in `tests/promptfoo/datasets/plan-prepare-exec.yaml`.
  ```

  Appendix row, appended after the last table row of `## Appendix — history` (after the row that ends `#9376 |`, or the table's last row):

  ```markdown
  | R72 | check-brief JSON fields named, acceptance prefix corrected, #9384 |
  ```

  Dataset case at `plan-prepare-exec.yaml:1064-1073`:

  ```diff
  - - description: "plan-explore --check-brief: outDir that is a file still prints JSON with a reason (R72)"
  + - description: "plan-explore --check-brief: outDir that is a file yields brief-missing (R72)"
  ...
  -         return r.ok === false && typeof r.reason === 'string' && r.reason.length > 0;
  +         return r.ok === false && r.reason === 'brief-missing' && r.findingIds === 0;
  ```
- names: `R72`; fields `ok`, `reason`, `dimensions`, `missingResults`, `findingIds`, `error`.
- mirror: R72 at `docs/specs/plan-sdlc.md:78-79`; the appendix row style at the `R72, R28, E6` row; the sibling case at `plan-prepare-exec.yaml:1053-1062`.
- decisions: amend in place, no new id (spec ids are stable); `cp` for the site copy, never `site/scripts/copy-docs.mjs`.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.

### Task 2: plan-sdlc SKILL.md gate name and user doc routing table

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — the brief-consumption gate names the brief check
- Modify: `docs/skills/plan-sdlc.md` — `## Complexity Routing` table cells match SKILL.md
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy of the user doc (`cp` then `cmp`)
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only: companion `.md` files need no change (copy rule)

**Notes:** Implements items 3 and 6 (F-check-brief-exit2-reason-contract-3, F-plan-sdlc-scope-table-doc-alignment-1, -4). No behaviour changes: a label and a doc table. `skills-meta.ts:36` and the companions (`openspec-flow.md`, `review-loop.md`, `plan-format-reference.md`, `plan-template-default.md`) were checked: none says "validation passed" or quotes the routing table. Behavioural datasets are not touched.

**Acceptance criteria:**
- [ ] `grep -n "validation passed" plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` finds nothing; the gate reads as in the Contract.
- [ ] The four doc table rows equal `SKILL.md:28-31` cell for cell.
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (docs): two edits.

  `SKILL.md:157`:

  ```diff
  -  **Brief consumption (when brief is present AND validation passed):**
  +  **Brief consumption (when brief is present AND the brief check passed):**
  ```

  `docs/skills/plan-sdlc.md:44-47` (header and separator rows unchanged):

  ```diff
  - | 1 file, clear change | Stop — just do the work | Lightweight plan (user explicitly chose to plan) |
  - | Small, clear scope (about 2–3 files) | Lightweight: inline exploration only, no review loop | Lightweight |
  - | Larger or unclear scope (about 4+ files) | Full pipeline (Steps 1–7) | Full pipeline |
  - | Multiple independent subsystems | Flags the split, suggests one plan per subsystem | Same |
  + | 1 file, clear change | Stop — no plan needed. Tell the user. | Lightweight plan (user explicitly chose to plan) |
  + | 2–3 files, clear scope | Lightweight: inline exploration only, no review loop | Lightweight |
  + | 4+ files or unclear scope | Full pipeline (Steps 1–7) | Full pipeline |
  + | Multiple independent subsystems | Decompose into separate plans | Decompose |
  ```
- names: heading text `Brief consumption`; doc section `## Complexity Routing`.
- mirror: `SKILL.md:26-31` routing table; `SKILL.md:151` "**Brief check (R72):**".
- decisions: SKILL.md is the source for the table (no spec id covers its wording).
- sync: `site/src/content-source/skills/plan-sdlc.md` byte copy.

### Task 3: ship-sdlc user doc counts-null condition

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — `### Review rounds` paragraph 3, counts-null parenthetical
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp` then `cmp`)

**Notes:** Implements item 5 (F-review-rounds-null-condition-drift-1 to -3). The spec (R106) and `reviewRoundRecord` already agree; only the user doc lags.

**Acceptance criteria:**
- [ ] `grep -n "missing or unreadable" docs/skills/ship-sdlc.md` finds nothing; line 261 has the Contract text.
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.

**Contract:**
- shape (docs): one phrase in `docs/skills/ship-sdlc.md:261`:

  ```diff
  - (null when the review summary was missing or unreadable)
  + (null when the review summary was missing, stale or malformed)
  ```
- names: `reviewRounds`, `counts`.
- mirror: R106 at `docs/specs/ship-sdlc.md:241` ("null when the summary is missing, stale or malformed").
- decisions: same three words as the spec, no extra detail.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.

### Task 4: worker-write-guard named regex constants

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/worker-write-guard.js` — eight named regex constants replace the literals at `:175` and `:262-345`

**Notes:** Implements item 1 (F-worker-write-guard-regex-constants-1 to -3, -6 to -9). A pure refactor: no deny or allow verdict changes, so no spec change (R90 describes behaviour, not names) and no new case; the 100 hook cases are the proof. The hook adds no deny rule (F-71 does not apply). R90's accepted gaps stay as they are.

**Acceptance criteria:**
- [ ] The eight constants exist once each, as in the Contract table, each with a one-line `//` comment, placed after `ALLOWED_TARGET_RE` (`:33`).
- [ ] No regex literal from the Contract table remains in `isAllowedTarget`, `teeDenied`, `ddDenied`, `argWords`, `shellWord`, `gitApplyDenied` or the backslash removal in `scanPrefix`.
- [ ] `argWords` builds a fresh regex per call (`new RegExp(SHELL_WORD_RE)`).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "worker-write-guard"` passes all 100 cases.

**Contract:**
- shape (code): eight module constants (no exports change):

  | Constant | Value | One-line comment | Replaces the literal at |
  |---|---|---|---|
  | `SHELL_WORD_RE` | `/\S+/g` | one word of the masked text (a run of non-space characters); copy it per use, the `g` flag keeps `lastIndex` | `argWords` `:301` (`const re = new RegExp(SHELL_WORD_RE);`) |
  | `WHITESPACE_RE` | `/\s+/` | a run of whitespace between words | `teeDenied` `:283`, `ddDenied` `:292` (`split`) |
  | `DOLLAR_BEFORE_QUOTE_RE` | `/\$(?=["'])/g` | the `$` of a `$'..'` or `$".."` quote | `argWords` `:307` |
  | `QUOTE_CHAR_RE` | `/["']/g` | any quote character, removed as the shell does | `argWords` `:307` |
  | `UNSAFE_WORD_RE` | `/\\\|\$['"]/` (source `\\|\$['"]`) | a backslash or `$'`/`$"` quote: the shell word can differ from its text | `argWords` `:307`, `gitApplyDenied` `:343` |
  | `BACKSLASH_RE` | `/\\/g` | a backslash the shell removes from an unquoted word | `scanPrefix` `:175`, `shellWord` `:314` |
  | `LEADING_QUOTE_RE` | `/^["']/` | one quote at the start of a target | `isAllowedTarget` `:263`, `ddDenied` `:292` |
  | `TRAILING_QUOTE_RE` | `/["']$/` | one quote at the end of a target | `isAllowedTarget` `:263` |

  The `UNSAFE_WORD_RE` literal in code is `/\\|\$['"]/` (the `\|` in the table cell is Markdown escaping only).
- names: the eight constants above.
- mirror: `MAX_ESCAPED_WORD = 64; // ...` comment style at `worker-write-guard.js:106`; `_RE` suffix at `:31`, `:33`.
- decisions: fresh copy of the one `g` regex used with `exec` (Key Decisions); constants used with `replace`, `split` or a non-global `test` are shared.
- sync: none (no copy of the hook exists; `hooks/README.md` and R90 name no regex).

### Task 5: fixture guard ignores shell comments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-fixture-guard.js` — quote-aware comment strip used by the scope and order checks; `--dir <path>` option
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — new case (c)
- Create: `tests/promptfoo/fixtures-fs/fixture-guard-comments/comment-only/setup.sh` — mentions git only in comments, no guard line
- Create: `tests/promptfoo/fixtures-fs/fixture-guard-comments/guarded-git/setup.sh` — guard line, then a real `git init` with a trailing comment
- Create: `tests/promptfoo/fixtures-fs/fixture-guard-comments/quoted-hash/setup.sh` — guard line, then `echo "a # b" && git init` (review F1, owner 2026-11-13: quoted-# fixture only; the unguarded negative case is deferred to todo #9385)
- Create: `docs/plans/2026-11-13-lean-w18-remaining-lows.md`

**Notes:** Implements item 9 (F-fixture-guard-setup-sh-matching-1 to -9; todo #9383, ledger F-83). Threat model: a best-effort lint for fixture authors; it catches a `setup.sh` that runs `git init` or `git config` before the guard line. Accepted gaps: a quoted mention (`echo "git init"`) still counts as a git line (fails safe), git run through a variable or alias (`$G init`) or with options between `git` and the subcommand (`git -C x init`) is not seen, and heredoc bodies are read as command lines. The new fixture directory has no top-level `setup.sh`, so the exec runner only copies it (`extract-skill-content.js:48-67`).

**Acceptance criteria:**
- [ ] Case (c) passes after the change: `--dir` on `fixture-guard-comments` gives `ok: true`, `scanned: 1`, `unguarded: []`.
- [ ] Before the change, the `comment-only` fixture would be reported unguarded (it has no guard line and its comments mention `git init`).
- [ ] Cases (a) and (b) still pass; (a) scans 165 files (164 existing + `guarded-git`).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-guard"` passes all 3 cases.

**Contract:**
- shape (code):

  ```js
  /** Text of `line` before its shell comment: a `#` at the line start or after whitespace, outside single and double quotes; a backslash outside single quotes escapes the next character. */
  function stripComment(line) { /* char scan, returns line.slice(0, i) or line */ }

  function isGitLine(line) {
    const code = stripComment(line);
    return code.includes('git init') || code.includes('git config');
  }
  ```

  `scanGuards(dir)` takes the directory to scan (default `FIXTURES_DIR`). Its scope check becomes `if (!lines.some(isGitLine)) continue;` (the split moves above it); the `content.includes` test at `:50` goes. `unguarded` paths stay relative to the scanned directory.

  CLI delta:

  | Op | Flag | Value | Behaviour |
  |---|---|---|---|
  | add | `--dir <path>` | a directory; relative paths resolve from the working directory | scan that tree instead of `tests/promptfoo/fixtures-fs` |
  | error | `--dir` with no value, or a path that is not a directory | — | `Script error: --dir needs an existing directory` on stderr, exit 2 |

  `stripComment` examples:

  | Line | Result |
  |---|---|
  | `# git init` | `` (empty) |
  | `echo ok # git init` | `echo ok ` |
  | `echo "a # git init"` | unchanged (quoted) |
  | `a#b git init` | unchanged (`#` inside a word) |

  Fixture `comment-only/setup.sh`:

  ```bash
  #!/bin/bash
  # This fixture runs no git init and no git config; it only names them in comments.
  echo "fixture without a repository" # git init is not needed here
  mkdir -p data # no git config either
  ```

  Fixture `guarded-git/setup.sh` (line 2 is `GUARD_LINE` from `check-fixture-guard.js:22`, byte for byte):

  ```bash
  #!/bin/bash
  if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
  git init -q # the only real git command
  ```

  Case (c), appended after case (b):

  ```yaml
  - description: "fixture-guard: (c) a setup.sh that names git init only in comments is not in scope; a guarded one is"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-fixture-guard.js"
      script_args: "--dir {{project_root}}"
      project_root: "file://fixtures-fs/fixture-guard-comments"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output); r.ok === true && r.scanned === 1 && r.unguarded.length === 0"
  ```
- names: `stripComment`, `isGitLine`, `scanGuards(dir)`, `--dir`, case `fixture-guard: (c)`.
- mirror: `isGitLine` at `check-fixture-guard.js:40-43`; argument handling at `:82-89`; case (a) at `fixture-guard-exec.yaml:3-8`.
- decisions: quote-aware strip, quoted mentions still count (Key Decisions); full-line comments stay skipped.
- sync: case (a) keeps `scanned >= 150`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 1 updates the exec case; Task 5 adds case (c); Task 4 is a pure refactor covered by the 100 existing hook cases |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted exec-config runs with --filter-pattern, no full-suite or retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a listed item; item 2 is dropped with evidence |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable on one surface |
| scripts-over-llm-logic | error | PASS | Changes are deterministic scripts, tests and docs; no new LLM-side logic |
| yagni | warning | PASS | The --dir option is justified by the new case needing an isolated tree |
| cross-skill-consistency | error | PASS | Spec, SKILL.md, user doc and site copies are aligned; the copy rules are applied |
| pr-link-github-issue | error | PASS | #9384 and #9383 are recorded as internal register ids, not GitHub issues |
| dry | warning | PASS | Task 4 removes duplicated regex literals; the strip helper is shared by the scope and order checks |
| kiss | warning | PASS | Smallest cuts; no shell parser; quoted mentions fail safe |
| spec-first | error | PASS | The R72 spec amendment is in Task 1; the SKILL.md change in Task 2 is a wording-only label with no behaviour change |
| project-agnostic | error | PASS | Changes are in plugin hook, spec and docs and in the repo's own test tooling; no consumer-facing repo-local edits |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill flag dispatch is introduced |
| no-opposite-logical-vectors | error | PASS | No new SKILL.md gate; the label rename keeps one gate phrasing |
| flag-resolution-single-source | warning | PASS | No contractual flag is resolved in more than one place |
| state-premise | error | PASS | Goal and Context name the root problem: sources of truth drift apart, and the check reads comments as commands |
| smallest-viable-cut | warning | PASS | Key Decisions has an explicit smallest-cut entry |
| failure-audience | warning | PASS | Key Decisions names who fails: execute workers, fixture authors and doc readers |
| explicit-non-goals | warning | PASS | The Non-goals list is explicit |
| ambiguity-stops-and-asks | error | PASS | Choices (spec versus tests, define versus drop the field, fresh regex) are recorded with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is changed |
| flag-semantic-consistency-cross-skill | error | PASS | --dir is added to a test script, not a skill prepare script, and the plan says so |
| workspace-mode-compatibility | error | PASS | No state, config or cwd-dependent skill behaviour is changed |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced into dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 5 adds a `--dir <path>` option to tests/promptfoo/scripts/check-fixture-guard.js, with a new exit 2 error path, which is a CLI flag contract change.

**Severity hint:** high

**Patch:** Check that the new --dir <path> flag of check-fixture-guard.js has defined behaviour: a relative path resolves from the working directory, and a missing or non-directory value gives exit 2 with a 'Script error: --dir needs an existing directory' message on stderr.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the new --dir <path> flag of check-fixture-guard.js has defined behaviour: a relative path resolves from the working directory, and a missing or non-directory value gives exit 2 with a 'Script error: --dir needs an existing directory' message on stderr.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 (docs/specs/plan-sdlc.md), Task 2 (docs/skills/plan-sdlc.md) and Task 3 (docs/skills/ship-sdlc.md) change markdown files that the code-quality dimension does not trigger on.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Tasks 1 to 3 edit the site copies, such as site/src/content-source/skills/ship-sdlc.md, and the plan-sdlc skill docs. No dimension covers documentation quality for these paths.

**Severity hint:** medium

**Triggers:** `site/**`, `plugins/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `plugins/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Final Shape

- Spec R72 states the brief check's JSON fields and names the real exec case prefix; the file-as-outDir case checks `brief-missing`.
- plan-sdlc SKILL.md says "the brief check passed"; the user doc's routing table matches SKILL.md; site copies match byte for byte.
- The ship-sdlc user doc says `counts` is null when the summary was missing, stale or malformed.
- The worker write guard reads its regexes from eight named constants, with the same verdicts.
- The fixture guard check ignores shell comments, takes `--dir`, and has case (c).
- Item 2 is recorded as already fixed.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 worker-write-guard.js: regexes in argWords and nearby helpers get named constants with a one-line comment each. | Task 4 | covered |
| 2 plan-explore.js --check-brief exit 2 without JSON vs SKILL.md reason: pick the option matching R72 (re-verify; drop if already fixed). | — | covered |
| 3 plan-sdlc SKILL.md brief-consumption gate says "validation passed"; use the brief check's current name. | Task 2 | covered |
| 4 SKILL.md reads a `reason` JSON field R72 does not define: define it in the spec or stop reading it. | Task 1 | covered |
| 5 docs/skills/ship-sdlc.md reviewRounds counts-null condition must include the stale case. | Task 3 | covered |
| 6 docs/skills/plan-sdlc.md scope table aligned with SKILL.md scope table. | Task 2 | covered |
| 7 plan-prepare-exec.yaml file-as-outDir r72 case asserts the reason code. | Task 1 | covered |
| 8 Re-check remaining drift between R72, R106, SKILL.md Step 1, user docs and ship.js reviewRoundRecord; fix only with evidence. | Task 1 | covered |
| 9 check-fixture-guard.js matches only command lines; add exec case with comment-only setup.sh; keep existing guard cases. | Task 5 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
