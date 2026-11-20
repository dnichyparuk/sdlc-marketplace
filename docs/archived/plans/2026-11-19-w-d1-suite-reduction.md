# W-D1 Suite Reduction Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #121, 2018b10

**Commit:** `test(W-D1): tests - merge duplicate exec cases, drop orphan fixtures`
**Goal:**
- Merge the 229 exec cases that repeat another case's exact inputs into that case, so every assertion still runs once per input.
- Keep every cited spec id, parsed flag and dataset, and pass the coverage baseline after one reviewed update.
- Delete the 15 orphan `fixtures-fs` directories and the 2 orphan fixture files.
**Architecture:** Test-data change only, no script code. Nine dataset tasks each merge the duplicate-input groups of their own datasets: the survivor case keeps its vars and gets the other members' assertions, each block headed by a `# from: <old description>` comment; exact duplicate assertions are dropped. One task deletes the orphan fixtures. One last task lowers the case floors, re-keys the assertion-lint allowlist and refreshes the coverage baseline with `--update`, reviewed by diff.
**Source:** docs/plans/programme.md#W-D1
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` per task (patterns in each task; hook cases use `-c promptfooconfig-exec-hooks.yaml`); the main session runs the full exec and exec-hooks suites at PR validation.

---

## Context

**What problem does this change solve?**

- The exec suite (the script tests: no model is called) has 1,870 cases in 82 datasets.
- 230 of these cases run exactly the same command as another case in the same dataset. They only check a different detail of the same output.
- Each repeat costs a fixture copy and a script run, and makes the suite slower and harder to read.
- 15 fixture directories and 2 fixture files are used by no test at all.

**What prompted this change now?**

- The exec-suite audit of 2026-11-18 (#9426, audit wave W5) planned this reduction.
- The audit asked for a safety net first. It shipped in lean-w35 (PR #112): a coverage baseline, an assertion lint and a mutation smoke script.
- W-B, the unit this one depends on, is done.

**What does success look like?**

- About 229 fewer exec cases, and the same set of distinct assertions on the same inputs.
- `check-spec-id-coverage.js` reports no lost dataset, id or flag. Only the per-dataset assertion counts fall, and only by the 25 exact duplicate assertions removed.
- The 17 orphan fixture paths are gone, and the fixture guards stay green.

**Re-verification at HEAD a489572 (each item still reproduces):**

- Duplicate inputs: a planner scan (YAML parse of every dataset in `promptfooconfig-exec.yaml` and `promptfooconfig-exec-hooks.yaml`, key = the whole case minus `description` and `assert`) finds 102 groups with identical vars, 230 extra cases. Cases have only the keys `description`, `vars` and `assert`.
- Coverage checker now: `node tests/promptfoo/scripts/check-spec-id-coverage.js` prints `{"ok":true,"configs":2,"datasets":82,"cases":1870,"asserts":2713,"ids":386,"flags":553,"drops":[]}`.
- Orphans: the 15 directories and 2 files listed in Task 10 are named by no file outside their own directory (`git grep -F <name>`, excluding `docs/plans`, `docs/archived` and `.sdlc`). Each of the 15 directories holds only a `setup.sh` that runs `git init`.
- Floors: `datasets/spec-id-coverage-exec.yaml:15` asserts `r.cases >= 1817 && r.asserts >= 2645`; `datasets/dataset-asserts-exec.yaml:8` asserts `r.cases >= 1817`; `datasets/fixture-guard-exec.yaml:10` asserts `r.scanned >= 150` (now 167).

Dropped item: one of the 102 groups (the two `spec-id-coverage` guard cases (a) and (b)) stays unmerged; see Key Decisions. No other item was dropped.

## Research Findings

**Discovery brief:** `/tmp/sdlc-explore-main-MOVmAS/discovery-brief.md` (3 code dimensions, 27 findings; temporary, the facts it adds are copied below). Tasks cite its `F-<DIM>-<n>` ids. It confirms the planner counts (F-suite-guard-merge-impact-12) and adds: three members differ from their survivor only in key order or quote style (F-same-vars-merge-hazards-3); comment lines above or inside removed members hold ids that must stay (F-suite-guard-merge-impact-1); `# from:` lines must sit at assert-item indent, outside block scalars (F-suite-guard-merge-impact-4); the github-sdlc anchor cases at lines 212 and 2146 are in no group and must stay (F-same-vars-merge-hazards-8); the provider reads only `script_*` vars and keeps no state between cases, so one run serves every member (F-same-vars-merge-hazards-1, -2); the assertion floor needs no change (F-suite-guard-merge-impact-7); the coverage guard cases fail between the first merge and Task 11, so no merge task uses them as a gate (F-suite-guard-merge-impact-11).

**How the suite guards react to a merge** (read in `tests/promptfoo/scripts/`):

- `check-spec-id-coverage.js:85-101` counts a case per line that starts with `- `. It counts an assertion per `- type:` line that is not a comment. It collects ids from description lines and from comment lines (`:99`).
- So a removed member's description, kept as a `# from:` comment, keeps its ids in the baseline.
- `compareCoverage` (`:117-133`) fails on a lost dataset, a lost id, a per-dataset assertion count below the baseline, or a flag key whose count falls to 0. Fewer cases with the same arguments lower a flag count but never to 0.
- `check-dataset-asserts.js:142-154` matches allowlist entries by rule, dataset and description. An unused entry is reported as stale and does not fail.
- So a merged case that keeps a key-only `contains` assertion moves that finding to the survivor's description, and that finding fails until its entry is re-keyed.
- `mutation-smoke.js:43-124` selects cases by description regex. `--check` reports `filter-no-case` when no real `description:` line matches (`:152-155`).
- Two filters match a group member: `setup-prepare: shipFields\.steps has exactly 10` (setup-prepare line 40) and `sdlc-dimensions: valid dimensions pass all checks` (sdlc-dimensions line 10). Both are made the survivor.
- `check-fixture-guard.js` counts git-using `setup.sh` files (167 now, 152 after Task 10, floor 150). `check-fixture-refs.js` scans only the behavioural and headless configs, which name none of the orphans.

**Allowlist entries on merged members** (`tests/promptfoo/baselines/dataset-asserts-allow.json`, 35 entries):

| Rule | Member (dataset:line) | After the merge |
|---|---|---|
| negative-only | guardrails-prepare :276, :285 | stale: the survivor :71 has positive assertions |
| negative-only | plan-format :546 (PF13) | stale: survivor :37 |
| negative-only | dimension-to-instructions :150 | stale: survivor :18 |
| key-only-contains | commit-prepare :331 | moves to survivor :85 `commit-prepare: config present includes commitConfig` |
| key-only-contains | pr-prepare :483 | moves to survivor :25 `pr-prepare: default flags with no args` |
| key-only-contains | version-prepare :19, :172 | moves to survivor :5 `version-prepare: patch bump produces no 'Unknown flag' warnings (#212)` |

**Other facts:**

- No `node_modules` and no YAML library exist in the repository, so workers edit the YAML as text.
- `worker-write-guard-exec.yaml` belongs to `promptfooconfig-exec-hooks.yaml`; all other touched datasets belong to `promptfooconfig-exec.yaml`.
- The fast tier `promptfooconfig-exec-fast.yaml` lists whole datasets and needs no change.
- `tests/promptfoo/README.md:63` says "about 80 datasets": still true, no dataset is removed.
- No script, spec, skill or user doc changes, so no spec id applies.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Size of the reduction | no | merges 229 cases, not "about 230" | the strict scan finds 230; the two guard cases of `spec-id-coverage-exec.yaml` stay separate |
| Merge versus removal | no | merges every group; removes no case outright | a case with the same inputs is a merge with no coverage loss; the audit's two outright removals (`ship-prepare` "VALID_STEPS includes ...") are not identical-input cases and need a coverage judgement, so they stay out of this wave |
| Duplicate assertions | no | drops the 25 exact duplicate assertions | they check the same output twice; A1 expects a reviewed baseline update |
| Files per task | no | Task 10 deletes 17 files in one task | the deletions are one mechanical `git rm`; splitting adds waves for nothing |
| Floor values | no | sets the case floor to 1641; keeps the assertion floor 2645 | the case floor must fall; the assertion count 2688 stays above its floor (F-suite-guard-merge-impact-7) |
| Weak assertions from the audit | no | out of scope | false-pass fixes are other tickets; this wave only merges and deletes |

### Decisions taken without the owner

- The two `spec-id-coverage` guard cases (a) and (b) stay separate (recommended: case (b) is the floor case that Task 11 edits, and the two document different guards).
- Exact duplicate assertions are dropped, and the baseline is refreshed by `--update` with a reviewed diff (recommended by A1's wording).
- A merged member's description is kept as a `# from:` comment in the survivor's assert list (recommended: keeps cited ids and the per-fact name, and the checkers read comments).
- The audit's outright removals and other false-pass findings are left out (narrowest scope that meets A1 and A2).

## Key Decisions

- **Merge into one case over a table-driven wrapper script.** The members of a group already run the same command. One case with all their assertions keeps the same checks with no new script code. A wrapper would add code that itself needs tests.

- **Group by byte-identical vars over the audit's five-var key.** The audit compared five vars only. Two cases that differ in another var (for example `script_capture_stderr` or `script_show_exit`) produce different output. The strict key compares all vars, so a merged case always sees the output each member saw.

- **Survivor = first member, except a mutation-smoke target.** The survivor keeps its description, so the mutation-smoke filters still find their case. The setup-prepare survivor is line 40 for this reason.

- **`# from:` comments over a longer description.** A description holding 20 facts would be unreadable. A comment above each moved block names the fact, and `check-spec-id-coverage.js` reads ids from comments.

- **Bottom-up edits over top-down edits.** Workers edit each file from the last group to the first. The line numbers in this plan (at base `a489572`) then stay valid while they work.

- **One guard task after all merges.** The floors, the allowlist and the baseline are shared files. One task changes them once, after every merge, so the dataset tasks run in parallel in one wave.

## Contract Examples

**Contract:**
- shape (code): MODIFY `tests/promptfoo/datasets/session-cost-exec.yaml`: group `7 <- 19, 31, …`; the survivor at line 7 keeps its description and vars; its `assert:` list grows; members are deleted.
- names: survivor description `session-cost: duplicate message ids count once with the largest usage, and synthetic messages are dropped`.
- mirror: the case layout at `tests/promptfoo/datasets/session-cost-exec.yaml:7-17`.
- decisions: merge rule M (Key Decisions); no duplicate assertion in this group (F-same-vars-merge-hazards-1).
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` (Task 11 refreshes it).
- example: see the render under Task 9.

## Tasks

### Task 1: Merge duplicate cases in ship-prepare
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — merge 62 duplicate-input cases into their survivors (379 to 317 cases; 0 duplicate assertions dropped)

**Notes:** Largest file (6,500 lines, 28 groups). Complex because one wrong block boundary breaks the YAML for 379 cases; the stepper cases carry long multi-line javascript asserts.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `ship-prepare-exec.yaml`: `6 <- 151, 188, 327, 342, 443, 634, 667, 779, 861, 886, 1011, 1026, 1111, 1125, 1142, 1159, 1200, 1213, 1308, 1921`; `280 <- 1888, 1904, 4675, 4693, 6318`; `401 <- 417`; `518 <- 550`; `652 <- 1173, 1187, 1389, 5627`; `722 <- 744`; `1430 <- 1444, 1458, 1472, 1493`; `2371 <- 2395`; `2465 <- 2482, 3281`; `2553 <- 3302`; `2607 <- 2641`; `2727 <- 2748`; `2975 <- 3438`; `3044 <- 5610`; `3080 <- 3456`; `3474 <- 4938`; `4585 <- 4641`; `4825 <- 4891`; `4858 <- 4907`; `5158 <- 5188`; `5205 <- 5262`; `5246 <- 5281`; `5394 <- 5413`; `5433 <- 5555`; `5832 <- 5854, 5905, 5922`; `5873 <- 5982`; `6379 <- 6393, 6407`; `6435 <- 6449, 6463`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/ship-prepare-exec.yaml` prints 317 (base 379, minus 62)
- [x] The number of `- type:` lines across this task's files falls by exactly 0 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(ship|verify-side-effect|pipelineAdvancing)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/ship-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 2: Merge duplicate cases in the plan datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — merge 15 duplicate-input cases into their survivors (124 to 109 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — merge 14 duplicate-input cases into their survivors (56 to 42 cases; 4 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/plan-state-cleanup-exec.yaml` — merge 1 duplicate-input cases into their survivors (3 to 2 cases; 2 duplicate assertions dropped)

**Notes:** plan-state-cleanup line 42 claims a second invocation, but its vars equal line 15 and its wrapper runs plan.js once; the merge removes a description that tested nothing extra. plan-format is in the fast tier.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `plan-prepare-exec.yaml`: `246 <- 285, 306, 345, 371, 389, 409, 654, 676, 690, 734`; `808 <- 853`; `891 <- 902, 914`; `1017 <- 1055`; `1171 <- 1210`
- `plan-format-exec.yaml`: `37 <- 365, 474, 546, 591`; `68 <- 81, 92, 103, 114, 555`; `125 <- 184`; `171 <- 195`; `247 <- 262, 659`; `322 <- 335`
- `plan-state-cleanup-exec.yaml`: `15 <- 42`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/plan-prepare-exec.yaml` prints 109 (base 124, minus 15)
- [x] `grep -c '^- ' tests/promptfoo/datasets/plan-format-exec.yaml` prints 42 (base 56, minus 14)
- [x] `grep -c '^- ' tests/promptfoo/datasets/plan-state-cleanup-exec.yaml` prints 2 (base 3, minus 1)
- [x] The number of `- type:` lines across this task's files falls by exactly 6 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(plan-|execute-guardrails|stop-plan-integrity)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/plan-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 3: Merge duplicate cases in the execute datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — merge 18 duplicate-input cases into their survivors (77 to 59 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-context-producer-exec.yaml` — merge 1 duplicate-input cases into their survivors (13 to 12 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — merge 1 duplicate-input cases into their survivors (21 to 20 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/state-gc-migrate-exec.yaml` — merge 1 duplicate-input cases into their survivors (21 to 20 cases; 0 duplicate assertions dropped)

**Notes:** One task for the execute family keeps its datasets with one worker; no file is shared with another task.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `execute-prepare-exec.yaml`: `16 <- 781`; `56 <- 234, 244, 420, 510, 550, 600, 640`; `76 <- 500`; `96 <- 490`; `430 <- 470, 560, 620`; `440 <- 480, 520, 570, 630`; `590 <- 610`
- `execute-plan-sdlc-context-producer-exec.yaml`: `112 <- 128`
- `execute-plan-sdlc-liveness-exec.yaml`: `217 <- 234`
- `state-gc-migrate-exec.yaml`: `248 <- 258`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/execute-prepare-exec.yaml` prints 59 (base 77, minus 18)
- [x] `grep -c '^- ' tests/promptfoo/datasets/execute-plan-sdlc-context-producer-exec.yaml` prints 12 (base 13, minus 1)
- [x] `grep -c '^- ' tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` prints 20 (base 21, minus 1)
- [x] `grep -c '^- ' tests/promptfoo/datasets/state-gc-migrate-exec.yaml` prints 20 (base 21, minus 1)
- [x] The number of `- type:` lines across this task's files falls by exactly 0 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(execute-|schema-truth|state/|skill/ship)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/execute-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 4: Merge duplicate cases in the setup datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — merge 17 duplicate-input cases into their survivors (35 to 18 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/migrate-config-exec.yaml` — merge 1 duplicate-input cases into their survivors (14 to 13 cases; 1 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/guardrails-prepare-exec.yaml` — merge 13 duplicate-input cases into their survivors (26 to 13 cases; 2 duplicate assertions dropped)

**Notes:** The setup-prepare survivor is line 40, not line 6: mutation-smoke.js filters on its description `setup-prepare: shipFields\.steps has exactly 10`.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `setup-prepare-exec.yaml`: `40 <- 6, 17, 29, 52, 63, 139, 185, 256, 278, 325, 347, 364, 376, 438, 475`; `103 <- 151, 165`
- `migrate-config-exec.yaml`: `5 <- 81`
- `guardrails-prepare-exec.yaml`: `15 <- 46, 95`; `26 <- 60, 130`; `71 <- 141, 276, 285, 303`; `82 <- 121`; `180 <- 214, 223, 232`; `243 <- 294`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/setup-prepare-exec.yaml` prints 18 (base 35, minus 17)
- [x] `grep -c '^- ' tests/promptfoo/datasets/migrate-config-exec.yaml` prints 13 (base 14, minus 1)
- [x] `grep -c '^- ' tests/promptfoo/datasets/guardrails-prepare-exec.yaml` prints 13 (base 26, minus 13)
- [x] The number of `- type:` lines across this task's files falls by exactly 3 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(setup-|migrate-config|ensureSdlcGitignore|guardrails-prepare)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/setup-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 5: Merge duplicate cases in the commit, pr and version datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — merge 9 duplicate-input cases into their survivors (61 to 52 cases; 1 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — merge 7 duplicate-input cases into their survivors (47 to 40 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/version-prepare-exec.yaml` — merge 5 duplicate-input cases into their survivors (26 to 21 cases; 3 duplicate assertions dropped)

**Notes:** Three allowlisted key-only members (commit :331, pr :483, version :19 and :172) move into survivors here; Task 11 re-keys their allowlist entries, so this task leaves the allowlist alone.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `commit-prepare-exec.yaml`: `22 <- 96, 173, 508`; `85 <- 297, 331`; `149 <- 162`; `184 <- 211`; `404 <- 429`; `605 <- 621`
- `pr-prepare-exec.yaml`: `25 <- 118, 351, 434, 446, 483, 520`; `535 <- 574`
- `version-prepare-exec.yaml`: `5 <- 19, 135, 172, 214, 256`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/commit-prepare-exec.yaml` prints 52 (base 61, minus 9)
- [x] `grep -c '^- ' tests/promptfoo/datasets/pr-prepare-exec.yaml` prints 40 (base 47, minus 7)
- [x] `grep -c '^- ' tests/promptfoo/datasets/version-prepare-exec.yaml` prints 21 (base 26, minus 5)
- [x] The number of `- type:` lines across this task's files falls by exactly 4 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(commit-|pr-prepare|pr\.js|version)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/commit-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 6: Merge duplicate cases in the review datasets and the provider self-tests
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — merge 4 duplicate-input cases into their survivors (32 to 28 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/review-consolidate-exec.yaml` — merge 3 duplicate-input cases into their survivors (15 to 12 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — merge 2 duplicate-input cases into their survivors (32 to 30 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/harden-prepare-exec.yaml` — merge 2 duplicate-input cases into their survivors (10 to 8 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — merge 3 duplicate-input cases into their survivors (17 to 14 cases; 0 duplicate assertions dropped)

**Notes:** script-runner-stub-bin cases test the provider itself; the members of each group have identical vars (the same `script_show_exit` value), so one run gives every member its output.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `review-prepare-exec.yaml`: `40 <- 60`; `95 <- 111, 122, 147`
- `review-consolidate-exec.yaml`: `24 <- 137`; `84 <- 101, 119`
- `received-review-prepare-exec.yaml`: `203 <- 236`; `220 <- 250`
- `harden-prepare-exec.yaml`: `124 <- 144, 157`
- `script-runner-stub-bin-exec.yaml`: `89 <- 96`; `120 <- 128, 136`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/review-prepare-exec.yaml` prints 28 (base 32, minus 4)
- [x] `grep -c '^- ' tests/promptfoo/datasets/review-consolidate-exec.yaml` prints 12 (base 15, minus 3)
- [x] `grep -c '^- ' tests/promptfoo/datasets/received-review-prepare-exec.yaml` prints 30 (base 32, minus 2)
- [x] `grep -c '^- ' tests/promptfoo/datasets/harden-prepare-exec.yaml` prints 8 (base 10, minus 2)
- [x] `grep -c '^- ' tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` prints 14 (base 17, minus 3)
- [x] The number of `- type:` lines across this task's files falls by exactly 0 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(review-|dimension-effort|rr-|received-review|harden-prepare|corrupt-existing|script-runner|script_stub_bin|claude-cli-provider)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/review-prepare-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 7: Merge duplicate cases in the integration datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — merge 8 duplicate-input cases into their survivors (150 to 142 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — merge 2 duplicate-input cases into their survivors (42 to 40 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/harvest-learnings-exec.yaml` — merge 9 duplicate-input cases into their survivors (26 to 17 cases; 0 duplicate assertions dropped)

**Notes:** github-sdlc groups are bulk payload runs: one run already yields every op the members assert (audit groups G1 to G3).

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `github-sdlc-exec.yaml`: `481 <- 611`; `1884 <- 1901, 1920, 1959`; `1937 <- 1973`; `2013 <- 2030, 2049, 2082`
- `jira-sdlc-exec.yaml`: `236 <- 327, 351`
- `harvest-learnings-exec.yaml`: `22 <- 92`; `106 <- 131, 156, 180, 200`; `246 <- 268, 288, 308, 329`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/github-sdlc-exec.yaml` prints 142 (base 150, minus 8)
- [x] `grep -c '^- ' tests/promptfoo/datasets/jira-sdlc-exec.yaml` prints 40 (base 42, minus 2)
- [x] `grep -c '^- ' tests/promptfoo/datasets/harvest-learnings-exec.yaml` prints 17 (base 26, minus 9)
- [x] The number of `- type:` lines across this task's files falls by exactly 0 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(github-sdlc|jira|mcp-failure|stdin-fd0|harvest-learnings|migrate-learnings-log)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/github-sdlc-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 8: Merge duplicate cases in the library and session-start datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/links-lib-exec.yaml` — merge 5 duplicate-input cases into their survivors (27 to 22 cases; 4 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/openspec-lib-exec.yaml` — merge 3 duplicate-input cases into their survivors (17 to 14 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/openspec-step-exec.yaml` — merge 1 duplicate-input cases into their survivors (24 to 23 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/session-start-exec.yaml` — merge 4 duplicate-input cases into their survivors (21 to 17 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/session-map-exec.yaml` — merge 1 duplicate-input cases into their survivors (6 to 5 cases; 0 duplicate assertions dropped)

**Notes:** links-lib line 121 repeats line 9 (audit: same case twice); session-start line 40 is a subset of line 14.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `links-lib-exec.yaml`: `9 <- 121`; `272 <- 290`; `302 <- 316, 326, 338`
- `openspec-lib-exec.yaml`: `61 <- 81, 161, 175`
- `openspec-step-exec.yaml`: `7 <- 24`
- `session-start-exec.yaml`: `14 <- 40`; `80 <- 136`; `122 <- 150`; `278 <- 287`
- `session-map-exec.yaml`: `5 <- 62`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/links-lib-exec.yaml` prints 22 (base 27, minus 5)
- [x] `grep -c '^- ' tests/promptfoo/datasets/openspec-lib-exec.yaml` prints 14 (base 17, minus 3)
- [x] `grep -c '^- ' tests/promptfoo/datasets/openspec-step-exec.yaml` prints 23 (base 24, minus 1)
- [x] `grep -c '^- ' tests/promptfoo/datasets/session-start-exec.yaml` prints 17 (base 21, minus 4)
- [x] `grep -c '^- ' tests/promptfoo/datasets/session-map-exec.yaml` prints 5 (base 6, minus 1)
- [x] The number of `- type:` lines across this task's files falls by exactly 4 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(links|openspec-|session-start|session-map)'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/links-lib-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 9: Merge duplicate cases in the cost, dimension and hook datasets
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/session-cost-exec.yaml` — merge 8 duplicate-input cases into their survivors (20 to 12 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/sdlc-dimensions-exec.yaml` — merge 3 duplicate-input cases into their survivors (20 to 17 cases; 6 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/dimension-to-instructions-exec.yaml` — merge 3 duplicate-input cases into their survivors (10 to 7 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/sdlc-plugin-discovery-exec.yaml` — merge 1 duplicate-input cases into their survivors (4 to 3 cases; 0 duplicate assertions dropped)
- Modify: `tests/promptfoo/datasets/worker-write-guard-exec.yaml` — merge 2 duplicate-input cases into their survivors (109 to 107 cases; 2 duplicate assertions dropped)

**Notes:** The sdlc-dimensions survivor line 10 is a mutation-smoke target. The session-cost header says each case asserts on its own tag; after the merge one case holds them all, so that sentence changes (diff in the Contract). worker-write-guard runs in the hooks config.

**Merge groups** (survivor `<-` members; each number is the `- description:` line at base `a489572`):

- `session-cost-exec.yaml`: `7 <- 19, 31, 43, 61, 72, 83, 94, 105`
- `sdlc-dimensions-exec.yaml`: `10 <- 139, 186, 209`
- `dimension-to-instructions-exec.yaml`: `18 <- 29, 43, 150`
- `sdlc-plugin-discovery-exec.yaml`: `10 <- 54`
- `worker-write-guard-exec.yaml`: `239 <- 531`; `367 <- 515`

**Acceptance criteria:**
- [x] `grep -c '^- ' tests/promptfoo/datasets/session-cost-exec.yaml` prints 12 (base 20, minus 8)
- [x] `grep -c '^- ' tests/promptfoo/datasets/sdlc-dimensions-exec.yaml` prints 17 (base 20, minus 3)
- [x] `grep -c '^- ' tests/promptfoo/datasets/dimension-to-instructions-exec.yaml` prints 7 (base 10, minus 3)
- [x] `grep -c '^- ' tests/promptfoo/datasets/sdlc-plugin-discovery-exec.yaml` prints 3 (base 4, minus 1)
- [x] `grep -c '^- ' tests/promptfoo/datasets/worker-write-guard-exec.yaml` prints 107 (base 109, minus 2)
- [x] The number of `- type:` lines across this task's files falls by exactly 8 (the dropped duplicates); every other assertion item appears in a survivor
- [x] Every removed member's description appears verbatim in a `# from:` comment line of its survivor, and every comment line of the base file is still in the file (per file, the comment-line count equals the base count plus the added `# from:` lines)
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js` lists no `id`, `flag` or `dataset` drop for this task's datasets; its `asserts` drops for them equal the duplicate counts in **Files:** (drops of other tasks' datasets may show while tasks run in parallel; ignore those)
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(session-cost|wave-metrics|sdlc-dimensions|dimension-|schema-truth|sdlc-plugin-discovery)'` passes with 0 failures
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern '^worker-write-guard'` passes with 0 failures

**Contract:**
- shape (code): merge rule M. For each group, working from the last group in a file to the first: (1) run `git show a489572:tests/promptfoo/datasets/<file>` and confirm that each member's `vars:` block has the same keys and the same values as the survivor's (key order and quote style may differ: pr-prepare 535/574, version-prepare 5/214 and 5/256); leave a member that differs, or one that defines a YAML anchor (`&name`), unmerged and name it in the task report; (2) append to the end of the survivor's `assert:` list, per member in group order, one line `    # from: <member description, verbatim, without the quotes>` at the indent of the assert items (never inside a `value: |` block scalar), then the member's comment lines from inside its block and its assertion items unchanged (keys such as an assert-level `description:` stay), skipping an item whose full text equals an item already in the survivor; (3) delete the member's block: from its `- description:` line up to the line before the next line that starts with `- ` (or before the `#` comment lines directly above that case, or the end of the file), and one blank separator line. Comment lines directly above a member stay in place: they hold ids such as ship-prepare A8, G9, R83 and setup-prepare P7. The survivor's description and vars never change. A dataset header comment is changed only where the merge makes a sentence false.
- names: the survivor descriptions at the listed lines; comment prefix `# from: `.
- mirror: case layout of `tests/promptfoo/datasets/session-cost-exec.yaml` (a `- description:` line, `vars:`, `assert:` with `- type:` items).
- decisions: Key Decisions (strict vars key, survivor choice, `# from:` comments, bottom-up edits); brief F-suite-guard-merge-impact-1, -2, -4, F-same-vars-merge-hazards-1, -4, -6, -8, -10; edit as text, no YAML library exists in the repository; any throwaway helper lives in the worker's scratch directory and is never committed.
- sync: `tests/promptfoo/baselines/spec-id-coverage.json` and `tests/promptfoo/baselines/dataset-asserts-allow.json` change only in Task 11.

```diff
 # tests/promptfoo/datasets/session-cost-exec.yaml (header, lines 1-5)
 # Script execution tests for plugins/sdlc-utilities/scripts/ci/session-cost.js and
 # plugins/sdlc-utilities/scripts/ci/wave-metrics.js (W1.13).
-# Every session-cost case runs the same command against the synthetic fixture in
-# fixtures-fs/session-cost and asserts on its own tag. The wave-metrics cases run
-# against fixtures-fs/wave-metrics. No real transcripts are read.
+# One session-cost case runs the command against the synthetic fixture in
+# fixtures-fs/session-cost and asserts on every tag; a `# from:` comment names each
+# block. The wave-metrics cases run against fixtures-fs/wave-metrics. No real
+# transcripts are read.
```

```yaml
# before (two members with identical vars)
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"

- description: "<member description> (R12)"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "B"

# after
- description: "<survivor description>"
  vars: { <same vars> }
  assert:
    - type: icontains
      value: "A"
    # from: <member description> (R12)
    - type: icontains
      value: "B"
```


### Task 10: Delete the orphan fixtures
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/agent-isolation-guard-malformed/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/agent-isolation-guard-no-config/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/agent-isolation-guard-opt-out/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/gitignore-hook-idempotent/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/gitignore-hook-inside-layout/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/gitignore-hook-no-config/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/setup-hooks-opt-out/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/workspace-setup-existing-worktrees/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-create-default/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-create-inside-config/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-create-sibling-config/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-doctor-clean/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-doctor-layout-mismatch/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-doctor-orphan/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures-fs/worktree-doctor-stale-local/setup.sh` — delete
- Modify: `tests/promptfoo/fixtures/broken-plugin-structure.md` — delete
- Modify: `tests/promptfoo/fixtures/review-sdlc/issue-176-multi-finding-comment.md` — delete

**Notes:** Each orphan directory holds only `setup.sh`, so deleting that file removes the directory, and `fixtures/review-sdlc/` is left empty and is removed too (F-orphan-fixture-deletion-safety-1, -2, -4); the 15 git-using `setup.sh` files leave the fixture guard at 152, above its floor of 150.

**Acceptance criteria:**
- [x] None of the 17 listed paths exists; `git status --short` shows exactly 17 deleted files for this task
- [x] Before deleting, `git grep -F <name>` for each of the 17 names finds no file outside the fixture itself, `docs/plans`, `docs/archived` and `.sdlc`; a name that has a reference is kept and named in the task report
- [x] `node tests/promptfoo/scripts/check-fixture-guard.js` prints `"ok":true` with `"scanned":152`
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^fixture-guard'` passes with 0 failures

**Contract:** shape (code): `git rm` of the 17 listed paths, no other edit; names: the 15 directory names and 2 file names in **Files:**; sync: `check-fixture-refs.js` scans no exec dataset (F-suite-guard-merge-impact-10), so the grep is the safety net; floor `r.scanned >= 150` in `tests/promptfoo/datasets/fixture-guard-exec.yaml:10` stays (152 after)


### Task 11: Lower the floors, re-key the allowlist, refresh the baseline
**Ticket:** TK-008 @ebaf83cc

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/spec-id-coverage-exec.yaml` — case floor 1817 to 1641 in the description and the assertion; the assertion floor 2645 stays
- Modify: `tests/promptfoo/datasets/dataset-asserts-exec.yaml` — case floor 1817 to 1641
- Modify: `tests/promptfoo/baselines/dataset-asserts-allow.json` — remove 4 stale entries, re-key 4 entries to 3 survivor entries (35 to 30 entries)
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — reviewed `--update`: per-dataset assertion counts and flag counts after the merges

**Notes:** The case floor equals the case count after the change, as lean-w35 set it; the assertion count (2688) stays above its floor 2645, so that floor is left alone (F-suite-guard-merge-impact-7); `--update` can hide a drop, so the diff is checked line by line before the update is kept. If the printed case count differs from 1641 (a member was left unmerged in Tasks 1 to 9), use the printed values and say why in the task report.

**Acceptance criteria:**
- [x] Before the update, `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports `"cases":1641` and only drops of kind `asserts`, summing to 25: sdlc-dimensions 6, plan-format 4, links-lib 4, version-prepare 3, plan-state-cleanup 2, guardrails-prepare 2, worker-write-guard 2, commit-prepare 1, migrate-config 1
- [x] After `node tests/promptfoo/scripts/check-spec-id-coverage.js --update`, `git diff -U0 tests/promptfoo/baselines/spec-id-coverage.json` changes only numbers on `"asserts":` lines and on flag-count lines; no key, id or dataset line is added or removed
- [x] `node tests/promptfoo/scripts/check-dataset-asserts.js` prints `"ok":true`, `"findings":[]`, `"stale":[]` and `"allowed":30`
- [x] `node tests/promptfoo/scripts/mutation-smoke.js --check` prints `"ok":true` with `"problems":[]`
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern '^(spec-id-coverage|dataset-asserts|fixture-guard|mutation-smoke|dataset-regex|docs-copies)'` passes with 0 failures

**Contract:**
- shape (code): edit the floors as rendered below; then run `node tests/promptfoo/scripts/check-dataset-asserts.js` and fix the allowlist from its output: delete each `stale` entry, and for each finding add one entry with its rule, dataset and the survivor description; then run the coverage check, compare with the expected drops, run `--update`, and review the diff.
- names: floor `r.cases >= 1641` (assertion floor `r.asserts >= 2645` unchanged); allowlist keys `rule`, `dataset`, `description`.
- mirror: entry shape at `tests/promptfoo/baselines/dataset-asserts-allow.json:3-8`.
- decisions: Key Decisions (one guard task after all merges); `datasets >= 77` stays (no dataset removed); allowlist by hand edit, baseline by `--update` after the plain check (F-suite-guard-merge-impact-6, -11).
- sync: `tests/promptfoo/README.md:97` already says a baseline refresh needs a reviewed diff; no change.

```diff
 # tests/promptfoo/datasets/spec-id-coverage-exec.yaml
-- description: "spec-id-coverage: (b) exec floors: 2 configs, at least 77 datasets, 1817 cases and 2645 assertions"
+- description: "spec-id-coverage: (b) exec floors: 2 configs, at least 77 datasets, 1641 cases and 2645 assertions"
-      value: "... r.datasets >= 77 && r.cases >= 1817 && r.asserts >= 2645"
+      value: "... r.datasets >= 77 && r.cases >= 1641 && r.asserts >= 2645"
 # tests/promptfoo/datasets/dataset-asserts-exec.yaml
-      value: "... r.datasets >= 77 && r.cases >= 1817"
+      value: "... r.datasets >= 77 && r.cases >= 1641"
```

| Op | Allowlist entry (rule, dataset, description) |
|---|---|
| remove | negative-only, guardrails-prepare, `guardrails-prepare #336: non-Svelte/Astro project ...` (member :276) |
| remove | negative-only, guardrails-prepare, `guardrails-prepare #336: non-Prisma project ...` (member :285) |
| remove | negative-only, plan-format, `plan-format: PF13 not run without --root` |
| remove | negative-only, dimension-to-instructions, `dimension-to-instructions (#519): without --common-file, ...` |
| replace | key-only-contains, commit-prepare: `commit-prepare: branchGuard field present in successful output (R-expected-branch, #349)` -> `commit-prepare: config present includes commitConfig` |
| replace | key-only-contains, pr-prepare: `pr-prepare: branchGuard field present in successful output (R-expected-branch, #349)` -> `pr-prepare: default flags with no args` |
| replace | key-only-contains, version-prepare: the `config.changelog=true ...` and `branchGuard field present ...` entries -> one entry `version-prepare: patch bump produces no 'Unknown flag' warnings (#212)` |

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every task edits promptfoo datasets or fixtures; no source code changes; Task 11 updates floors, allowlist and baseline to match the new behaviour |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled; floors are lowered with a reviewed baseline diff and the guards stay active |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on exec-only configs; full suites are left to the main session at PR validation; no run-fix-rerun loops |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks cover only the merge, orphan deletion and guard refresh; audit false-pass fixes are explicitly excluded |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (merge a dataset family, delete orphans, refresh guards) |
| scripts-over-llm-logic | error | PASS | No skill or LLM instruction changes; verification is script-driven |
| yagni | warning | PASS | No new abstractions or helpers; a wrapper script was rejected in Key Decisions |
| cross-skill-consistency | error | PASS | Test-data only; no skill behaviour changes |
| pr-link-github-issue | error | PASS | Only internal ids (W-D1, #9426); the rule excludes them |
| dry | warning | PASS | The merge rule text repeats across Tasks 1-9, but this is plan prose and each task stays self-contained for its worker; no duplicated code |
| kiss | warning | PASS | Plain text merge of cases; no new tooling |
| spec-first | error | PASS | No SKILL.md or skill behaviour change |
| project-agnostic | error | PASS | Edits are to this repo's own test suite, not plugin behaviour or consumer-facing files |
| flag-coherence-cross-skill | error | PASS | No skill dispatch or flag gating involved |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates |
| flag-resolution-single-source | warning | PASS | No flag resolution changes |
| state-premise | error | PASS | Context states the problem: 230 cases repeat another case's exact command, plus 17 unused fixtures |
| smallest-viable-cut | warning | PASS | Deviations and Key Decisions justify scope; outright removals and false-pass fixes are left out as the narrowest cut |
| failure-audience | warning | FAIL | No statement of who or what fails if the merges ship incorrectly |
| explicit-non-goals | warning | PASS | Deviations and Decisions list exclusions (outright removals, weak-assertion fixes, unmerged guard cases) |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (wrapper script, survivor choice, comment style, baseline handling) are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, initialization or preflight logic is modified; the fixture guard and baseline checks are only re-pinned |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added |
| workspace-mode-compatibility | error | PASS | Test-data edits only; no state, config reads or cwd-dependent logic; behaves the same under branch and worktree |
| prompt-cache-hit-ratio | warning | PASS | No prompt, SKILL.md or dispatch changes |

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Merge identical-vars exec cases into one survivor per group, keep every distinct assertion, drop 25 exact duplicates | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9 | covered |
| 2 Keep every cited spec id, parsed flag and dataset; removed descriptions kept as # from: comments; comment lines kept | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9 | covered |
| 3 Pass coverage baseline after reviewed update; lower case floors 1817 to 1641; re-key allowlist 35 to 30 | Task 11 | covered |
| 4 Delete the 15 orphan fixtures-fs dirs and 2 orphan fixtures files | Task 10 | covered |
| 5 Keep mutation-smoke filter targets (setup-prepare:40, sdlc-dimensions:10) as survivors | Task 4, Task 9, Task 11 | covered |
| 6 Targeted exec-only promptfoo runs per task; no behavioural suite or headless runner; no register/ticket/TODO edits | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- The exec suite holds about 1,641 cases in the same 82 datasets.
- Every input that two or more cases used to run is now run by one case. That case carries every distinct assertion the members had.
- Each moved block of assertions starts with a `# from:` comment that holds the member's old description.
- The coverage baseline lists the same datasets, ids and flags. Only assertion counts and flag counts are lower.
- The allowlist has 30 entries. The four stale negative-only entries are gone, and three key-only entries name their survivors.
- The case floors read 1641; the assertion floor stays 2645.
- The 15 orphan fixture directories and the 2 orphan fixture files are gone.

## OpenSpec Appendix

Not applicable — no OpenSpec change
