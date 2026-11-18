# Tasks Heading and Deferred Lows Implementation Plan

**Commit:** `fix(#9406): plan, tests - tasks heading, deferred lows`
**Goal:**
- Make the plan-sdlc docs name the literal `## Tasks` heading that the PF10 format check requires (#9405).
- Close four deferred lows: two dead constants in `execute.js`, one misaligned `let` line in `jira.js`, a paragraph order in received-review-sdlc, and stale `.claude/sdlc.json` config paths in behavioural test datasets.
- Change no skill behaviour and no validator logic.

**Architecture:** Six independent tasks in one execute wave. Each file belongs to exactly one task. Task 1 edits two plan-sdlc docs and adds one exec test case that checks the new text. Tasks 2 and 3 are small code and doc edits. Tasks 4 to 6 fix config paths in behavioural datasets and move three fixture files with `git mv`.
**Source:** conversation context (wave brief #9406, items 1 to 5)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

Some docs and test text no longer match what the code does.

- PF10 is a check in `validate-plan-format.js`. It makes sure that a final plan has a `## <name>` heading for every section the plan template lists. The template lists `Tasks`, so a final plan needs a `## Tasks` heading. The plan-sdlc docs never say this. The example plan in the format reference has no `## Tasks` heading at all. A planner that copies the example writes a plan that fails PF10.
- `execute.js` still declares two constants (`VALID_QUALITY`, `LEGACY_QUALITY`) that nothing reads since the quality presets moved to `lib/quality.js`.
- One `let` line in `jira.js` has one space less than its neighbours.
- In received-review-sdlc, Step 1a uses `<FLAGS>` four lines before the paragraph that defines it.
- Some behavioural test cases still say the config lives in `.claude/sdlc.json`. The skills now write `.sdlc/config.json` (`lib/config.js:178`, `:378`). Three setup fixtures still hold their config at the old path.

**What prompted this change now?**

Issue #9405 came from a plan that failed PF10. The other items are lows that waves 25 and 26 deferred.

**What does success look like?**

- The format reference and SKILL.md both name the literal `## Tasks` heading, and the example plan has it.
- A new exec case checks this text.
- The dead constants are gone. The `let` block lines up. `<FLAGS>` is defined before its first use.
- The listed datasets name `.sdlc/config.json`, and the three fixtures hold `.sdlc/config.json`.
- The deliberate legacy and migration cases are unchanged.

## Research Findings

All five items still reproduce at HEAD `98d5502`. No item was dropped.

- **Item 1 (#9405).** The default template requires `- Tasks` (F-plan-tasks-heading-docs-1). PF10 (`validate-plan-format.js:440-466`) builds the regex `^##\s+Tasks(?=\s|$)` from that entry. The Example Plan goes from `## Deviations & assumptions` straight to `### Task 1` (F-plan-tasks-heading-docs-2). Section Order item 8 names no heading (F-plan-tasks-heading-docs-3). The Per-Task Block shows only `### Task N` (F-plan-tasks-heading-docs-4). The Step 2 write list in SKILL.md (`:277-288`) has a "Task blocks" bullet at `:286` with no heading (F-plan-tasks-heading-docs-6). The skeleton step already writes `## Tasks`, because it writes every template entry, so Step 2 is the right edit site. No test checks this text (F-plan-tasks-heading-docs-11). The format reference has no site copy (F-plan-tasks-heading-docs-13).
- **Item 2.** `VALID_QUALITY` and `LEGACY_QUALITY` at `execute.js:56-57` are not exported and not referenced anywhere in code (F-dead-constants-and-flags-paragraph-1). The w25 plan said they "stay", but the code that read them is gone.
- **Item 3.** `jira.js:209` `let bodyFile` has 14 spaces before `=`; its neighbours have 15 (F-dead-constants-and-flags-paragraph-2).
- **Item 4.** received-review-sdlc `SKILL.md:128` uses `<FLAGS>`; the definition is at `:132` (F-dead-constants-and-flags-paragraph-3). The exec case at `received-review-prepare-exec.yaml:371-379` only counts occurrences, so moving the paragraph keeps it green (F-dead-constants-and-flags-paragraph-4).
- **Item 5.** All listed lines still hold `.claude/sdlc.json` (F-sdlc-config-path-fixtures-1 to -4). The precedent move for `setup-pr-labels-menu-rules` is in the tree (F-sdlc-config-path-fixtures-5, -11). The three target fixture directories hold only `.claude/sdlc.json`, `setup.sh` and `src/` (F-sdlc-config-path-fixtures-6). The `$schema` path in the moved file stays correct, because `.sdlc/` is at the same depth as `.claude/`. The dataset references name the directories, which keep their names (F-sdlc-config-path-fixtures-7). `check-fixture-refs.js` checks only that paths exist (F-sdlc-config-path-fixtures-8).
- **Count and floor checks (F-104).** `fixture-guard-exec.yaml:9` asserts `scanned >= 150` (the number of `setup.sh` files, unchanged). `fixture-guard-exec.yaml:41` asserts `datasets >= 19 && refs >= 316` (the dataset count and directory references, unchanged). Both are `>=` floors. Adding one exec case changes neither. No other count check covers `plan-prepare-exec.yaml` (F-sdlc-config-path-fixtures-9).
- **Exec-case argument style.** Inline `-e` cases write spaces as `\x20` and backticks as `\x60` inside `script_args`, as in `received-review-prepare-exec.yaml:374`.
- **Build and test commands.** Targeted exec runs use the Verification header command. The main session runs the full exec suites and the validators listed in the brief.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Test for item 1 | no | adds one exec case to `plan-prepare-exec.yaml`, not an assertion in `plan-sdlc.yaml` | the brief makes the behavioural assertion optional; an exec case can actually run (behavioural runs are owner-only) |
| SKILL.md edit site | no | edits the Step 2 write list (`:286`), not the skeleton step | the skeleton already writes `## Tasks` from the template entry; Step 2 is where task blocks are placed |
| Spec unchanged | no | no change to `docs/specs/plan-sdlc.md` | R61 and PF10 already require the heading; this is a docs fix, not a behaviour change |
| Check-only copy entries | no | Tasks 1 and 3 list user docs, site copies and `skills-meta.ts` with no edit expected | `plan.copyRules` requires them when a SKILL.md changes |
| Line numbers | no | uses the brief's numbers; all verified at HEAD | none moved |

## Decisions taken without the owner

These decisions were taken by the planner because no owner was available. Each takes the recommended or narrowest option.

1. Add an exec case for item 1 instead of the optional behavioural assertion. It can be run, and it guards the exact text.
2. Edit the Step 2 write list in SKILL.md, not the skeleton step. The brief allows either one.
3. Do not fix the other gaps the brief found: R61 and the user doc not naming `## Tasks` (F-plan-tasks-heading-docs-7, -8), the broken link in `docs/skills/plan-sdlc.md` (F-plan-tasks-heading-docs-10), the Key Decisions optional-vs-required mismatch (F-plan-tasks-heading-docs-5), and the out-of-scope legacy paths (F-sdlc-config-path-fixtures-10). They are outside the wave scope.

## Key Decisions

- **Docs fix, not a validator fix.** PF10 stays as it is (R61). The alternative was to make PF10 accept plans without `## Tasks`. That would weaken a check that the template already declares. The docs are what is wrong.

- **One exec case guards all four text edits of item 1.** It counts each new sentence once. The alternative was one case per file. One case is enough, because the four edits make one fix.

- **received-review: move, do not reword.** The paragraph moves above the condition line, with its wording unchanged. The existing exec case counts occurrences, so it stays green.

- **Fixture moves use `git mv`.** This keeps the file bytes and shows as a 100% rename. This is the same as the w26 precedent for `setup-pr-labels-menu-rules`.

- **Smallest viable cut.** The smallest cut that closes #9405 is Task 1 alone. The wave also carries the four deferred lows because the owner's todo list puts them in this wave, and each one is a few lines. Each task maps to one brief item group, and no task goes beyond its item. Splitting the lows into a later wave would cost a second ship run for about 30 changed lines.

- **Task 2 groups two one-line script edits.** Deleting the constants and aligning one `let` line are two unrelated deliverables. They stay in one Trivial task because each is a single edit with no behaviour change, and a second worker dispatch would cost more than the edits. Task 6 is Standard, because it edits nine lines in five files.

- **Who fails if this ships wrong.** Planners (people and agents) who read the format reference, and dataset authors. A wrong exec sentinel fails the main-session PR validation. No skill behaviour changes, so plugin users are not affected.

- **Tracking ids are internal register ids, not GitHub issues.** The PR body names `#9405` and `#9406` with no `Fixes` or `Closes` keyword.

- **No workspace-mode impact.** The tasks change docs, test data and two script lines. They touch no state file, config reader or git operation at run time, so branch and worktree mode behave the same.

- **Non-goals.** No PF10 or other validator change. No spec change. No move of any other fixtures-fs directory. The version-sdlc edits are prompt text only. The legacy and migration cases stay as they are (`project-config-legacy-*`, `project-config-needs-relocation`, `project-needs-migration.md`, `setup-legacy-migration.md`, `config-load-exec`, `migrate-config-exec`, `commit-prepare-exec`, and `setup-sdlc.yaml:347-356`). No orchestration-skill change.

## Contract Examples

Code (Task 2):

```markdown
**Contract:**
- shape (code): delete two unused top-level constants in `execute.js`; add one space in `jira.js:209`.
- names: `VALID_QUALITY`, `LEGACY_QUALITY`, `let bodyFile`.
- mirror: `jira.js:199` alignment (15 spaces before `=`).
- decisions: no behaviour change; the existing exec cases are the regression check.
- sync: none.
```

Docs (Task 1):

```markdown
**Contract:**
- shape (docs): MODIFY Section Order item 8, the Per-Task Block intro and the Example Plan in `plan-format-reference.md`; MODIFY the Step 2 write-list bullet in plan-sdlc `SKILL.md` (audience: the planner).
- names: `## Tasks`, `### Task N`, PF10.
- mirror: `tests/promptfoo/fixtures/plan-written.md:7` already carries `## Tasks`.
- decisions: docs only; PF10 unchanged (R61).
- sync: the exec sentinel in `plan-prepare-exec.yaml` holds the same text.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 1 adds an exec case; Task 2 source edits are behaviour-neutral and covered by existing exec cases |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted exec-only runs with --filter-pattern; behavioural suite never run |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | All tasks map to the brief's items 1 to 5; extra gaps are explicitly excluded |
| single-responsibility-tasks | warning | ACCEPTED | Task 2 combines two one-line edits (execute.js constants and jira.js alignment); rationale in Key Decisions |
| scripts-over-llm-logic | error | PASS | No new LLM-driven logic is added |
| yagni | warning | PASS | Nothing speculative is added |
| cross-skill-consistency | error | PASS | Sibling fixture precedent and copy-rule files are checked |
| pr-link-github-issue | error | PASS | Plan explicitly records that #9405 and #9406 are internal register ids, so no Fixes/Closes keyword; decision documented |
| dry | warning | PASS | No duplicated logic |
| kiss | warning | PASS | Minimal text edits, moves and one exec case |
| spec-first | error | PASS | SKILL.md edits are docs/order fixes, not behaviour changes; R61 already requires the heading |
| project-agnostic | error | PASS | Changes are in plugin docs and scripts and in test data |
| flag-coherence-cross-skill | error | PASS | No flag gating is changed |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced |
| flag-resolution-single-source | warning | PASS | No flag resolution is touched |
| state-premise | error | PASS | Context states the problem: docs and tests no longer match what the code does |
| smallest-viable-cut | warning | PASS | Key Decisions names the smallest cut (Task 1) and why the four lows ride along (revised after Step 3) |
| failure-audience | warning | PASS | Key Decisions names who fails if this ships wrong |
| explicit-non-goals | warning | PASS | Non-goals are listed |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described |
| flag-semantic-consistency-cross-skill | error | PASS | No new flags are added |
| workspace-mode-compatibility | error | PASS | Plan states there is no workspace-mode impact |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced |

## Suggested Review Dimensions

### UPDATE: security-review (U3)

**Why:** Tasks 4 to 6 move fixture configs and rewrite `.claude/sdlc.json` to `.sdlc/config.json` in the setup-sdlc, execute-plan-sdlc, version-sdlc and jira-sdlc datasets, so the security-review triggers must still match those paths.

**Severity hint:** high

**Patch:** update triggers naming `plugins` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — update triggers naming `plugins` after the rename

### UPDATE: spec-compliance (U3)

**Why:** Task 1 edits `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` and cites R61 and PF10, while Tasks 4 to 6 touch fixtures and datasets, so the spec-compliance triggers need to cover these paths.

**Severity hint:** high

**Patch:** update triggers naming `docs` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — update triggers naming `docs` after the rename

### UPDATE: test-quality (U3)

**Why:** Task 1 adds the exec case `plan-sdlc/tasks-heading` to `plan-prepare-exec.yaml`, and Tasks 4 to 6 edit the behavioural datasets and fixtures under `tests/promptfoo/`, so the test-quality triggers should cover them.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/fixtures` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/fixtures` after the rename

_1 additional candidates suppressed_

## Tasks

### Task 1: Name the literal `## Tasks` heading in plan-sdlc docs (#9405)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — Section Order item 8, Per-Task Block intro, Example Plan heading
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 2 write-list bullet for task blocks (`:286`)
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — add case `plan-sdlc/tasks-heading`
- Modify: `docs/skills/plan-sdlc.md` — check only: `:161` lists example headings and does not claim a full list; no change expected (copy rule)
- Modify: `site/src/content-source/skills/plan-sdlc.md` — check only, no change expected (copy rule)

**Notes:** Findings F-plan-tasks-heading-docs-1 to -4, -6, -11, -13. Implements the docs side of R61: PF10 already requires the heading, so the spec does not change (spec-first does not apply). The format reference is the runtime companion that plan-sdlc and the content lane read, and it has no site copy. `site/src/data/skills-meta.ts` is listed in Task 3, which meets the copy rule for this skill too; listing it twice would give one file to two tasks in one wave (F-43). Floors: `fixture-guard-exec.yaml:9` (`scanned >= 150`) and `:41` (`datasets >= 19`, `refs >= 316`) are unchanged by one new exec case; no count check covers `plan-prepare-exec.yaml`.

**Acceptance criteria:**
- [ ] The three edits in `plan-format-reference.md` and the one edit in `SKILL.md` match the diffs below; no other line changes.
- [ ] The new exec case passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/tasks-heading"`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): text edits as rendered below; the exec case as rendered below, inserted directly after the `plan-sdlc/explore-sentinels` case (before the `# --- plan-explore.js --check-brief (R72) ---` comment).
- names: Section Order item 8; `## Per-Task Block (required for every task)`; Example Plan `### Task 1: JWT utility module`; SKILL.md Step 2 bullet "Task blocks"; exec case `plan-sdlc/tasks-heading`.
- mirror: inline `-e` style of `received-review-prepare-exec.yaml:371-379` (spaces as `\x20`, backticks as `\x60`); fixture `tests/promptfoo/fixtures/plan-written.md:7`.
- decisions: Key Decisions 1 and 2.
- sync: each sentinel string in the exec case equals the new doc text byte for byte.

```diff
# plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md — Section Order
-8. **Task 1…N** — per-task blocks (required)
+8. **Tasks** — the literal `## Tasks` heading, then the `### Task N` blocks (required; PF10 checks the heading)

# Per-Task Block — new line between the heading and the opening fence
 ## Per-Task Block (required for every task)
 
+Every `### Task N` block goes under the literal `## Tasks` heading; PF10 checks the heading.
+
 ```markdown
 ### Task N: [Component Name]

# Example Plan — inside the fenced example
 ---
 
+## Tasks
+
 ### Task 1: JWT utility module

# plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md — Step 2 write list
-- Task blocks — all `### Task N:` blocks with per-task metadata
+- `## Tasks` — the literal `## Tasks` heading (PF10 checks it), then all `### Task N:` blocks with per-task metadata under it
```

```yaml
- description: "plan-sdlc/tasks-heading: plan-format-reference.md and SKILL.md name the literal ## Tasks heading that PF10 checks (R61, #9405)"
  vars:
    script_path: "-e"
    script_args: '((r)=>((f,s)=>((c)=>console.log(JSON.stringify({order:c(f,"8.\x20**Tasks**\x20—\x20the\x20literal\x20\x60##\x20Tasks\x60\x20heading,\x20then\x20the\x20\x60###\x20Task\x20N\x60\x20blocks\x20(required;\x20PF10\x20checks\x20the\x20heading)"),perTask:c(f,"Every\x20\x60###\x20Task\x20N\x60\x20block\x20goes\x20under\x20the\x20literal\x20\x60##\x20Tasks\x60\x20heading;\x20PF10\x20checks\x20the\x20heading."),example:c(f,"\n##\x20Tasks\n\n###\x20Task\x201:\x20JWT\x20utility\x20module"),skill:c(s,"the\x20literal\x20\x60##\x20Tasks\x60\x20heading\x20(PF10\x20checks\x20it)")})))((t,x)=>t.split(x).length-1))(r("{{repo_root}}/plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md","utf8"),r("{{repo_root}}/plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md","utf8")))(require("fs").readFileSync)'
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.order === 1 && o.perTask === 1 && o.example === 1 && o.skill === 1) return true;
        return { pass: false, score: 0, reason: output };
```

### Task 2: Remove dead quality constants and align the jira.js let block (w25 lows)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` — delete lines 56-57
- Modify: `plugins/sdlc-utilities/scripts/skill/jira.js` — line 209 gets one more space before `=`

**Notes:** Findings F-dead-constants-and-flags-paragraph-1 and -2. Neither change alters behaviour, so the existing exec cases are the regression check and no case is added. The w25 plan text that says the constants "stay" is a closed plan and is not edited.

**Acceptance criteria:**
- [ ] `grep -rn "VALID_QUALITY\|LEGACY_QUALITY" plugins/sdlc-utilities/scripts` prints nothing.
- [ ] `sed -n 199,212p plugins/sdlc-utilities/scripts/skill/jira.js` shows every `=` in the same column.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-prepare:|jira.js --validate-body"` passes.

**Contract:**
- shape (code): two deletions and one whitespace change, as rendered below.
- names: `VALID_QUALITY`, `LEGACY_QUALITY`, `let bodyFile`.
- mirror: `jira.js:199` (`let projectKey             = null;`, 15 spaces after the 11-character name column).
- decisions: no behaviour change.
- sync: none.

```diff
# plugins/sdlc-utilities/scripts/skill/execute.js
   specReviewer: 'once',
 };
 
-const VALID_QUALITY = ['full', 'balanced', 'minimal'];
-const LEGACY_QUALITY = { A: 'full', B: 'balanced', C: 'minimal' };
 const VALID_REBASE = ['auto', 'skip', 'prompt'];

# plugins/sdlc-utilities/scripts/skill/jira.js
   let forceRefresh           = false;
-  let bodyFile              = null;   // for --validate-body
+  let bodyFile               = null;   // for --validate-body
   let wantJson               = false;  // for --validate-body output format
```

### Task 3: Define `<FLAGS>` before Step 1a uses it in received-review-sdlc (w25 low)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — move the "**Flags (A7, C20).**" paragraph (`:132`) above the Step 1a condition line (`:128`)
- Modify: `docs/skills/received-review-sdlc.md` — check only: its `## Flags` section does not depend on SKILL.md paragraph order; no change expected (copy rule)
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — check only, no change expected (copy rule)
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (copy rule for plan-sdlc and received-review-sdlc)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only, do not edit (plan-sdlc copy rule; it sits here so each file has one owner): `openspec-flow.md`, `plan-template-default.md`, `review-loop.md` and `state-format.md` say nothing about where task blocks go; no change expected (copy rule for plan-sdlc)

**Notes:** Findings F-dead-constants-and-flags-paragraph-3 and -4. The paragraph moves with its wording unchanged, so this is an order fix, not a behaviour change (spec-first does not apply). The received-review skill directory holds only `SKILL.md`, which meets the `skills/{skill}/*.md` copy rule. The plan-sdlc copy entries sit here so that each file belongs to one task and Task 1 stays at five files (F-43).

**Acceptance criteria:**
- [ ] Step 1a reads, in order: the `### Step 1a` heading, the Flags paragraph, the "When `<FLAGS>` (A7) holds ..." line, the `<PLUGIN_ROOT>` blockquote, the fenced prepare call.
- [ ] `git diff --stat` shows the same number of added and removed lines for this file, and the paragraph text is byte-identical.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "skill-text A7 C20"` passes.

**Contract:**
- shape (docs): a block move, as rendered below (paragraph shortened with `…`; move it whole).
- names: `### Step 1a — Run skill/received-review.js (when PR number available)`; "**Flags (A7, C20).**".
- mirror: the Flags paragraph placement before its first use in github-sdlc `SKILL.md:35`.
- decisions: Key Decision 3 (move, do not reword).
- sync: the exec case `received-review-prepare/skill-text A7 C20` counts the paragraph once.

```diff
 ### Step 1a — Run skill/received-review.js (when PR number available)
 
+**Flags (A7, C20).** Before the first Bash call, take from `$ARGUMENTS` only these flags: … read it as request text.
+
 When `<FLAGS>` (A7) holds `--pr` or `--comment-file`, run the prepare script (R27):
 
 > **Substitute `<PLUGIN_ROOT>`** with the absolute path …
 
-**Flags (A7, C20).** Before the first Bash call, take from `$ARGUMENTS` only these flags: … read it as request text.
-
 ```bash
 node "<PLUGIN_ROOT>/scripts/skill/received-review.js" --output-file <FLAGS>
```

### Task 4: setup-sdlc config paths and the setup-pr-labels-clean fixture

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/setup-sdlc.yaml` — lines 179, 184, 201, 212, 235, 267, 326 name `.sdlc/config.json`
- Modify: `tests/promptfoo/fixtures-fs/setup-pr-labels-clean/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/setup-pr-labels-clean/.sdlc/config.json`

**Notes:** Findings F-sdlc-config-path-fixtures-1, -5 to -8, -12. This is a behavioural dataset: verify by review and the exec lint checks only; never run the behavioural suite. Lines 347, 350 and 356 (the migration case) keep the legacy path on purpose. Run `mkdir -p` and `git mv` as separate Bash calls.

**Acceptance criteria:**
- [ ] `mkdir -p tests/promptfoo/fixtures-fs/setup-pr-labels-clean/.sdlc` then `git mv tests/promptfoo/fixtures-fs/setup-pr-labels-clean/.claude/sdlc.json tests/promptfoo/fixtures-fs/setup-pr-labels-clean/.sdlc/config.json`; `git diff --cached -M --stat` shows a 100% rename.
- [ ] `grep -n "sdlc.json" tests/promptfoo/datasets/setup-sdlc.yaml` prints only lines 347, 350 and 356.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs: \(a\)|fixture-guard: \(a\)|dataset-regex: \(a\)"` passes.

**Contract:**
- shape (docs): seven one-token replacements and one rename, as rendered below (all seven sites shown).
- names: the four pr-labels cases at `setup-sdlc.yaml:176-240` and the menu cases at `:264` and `:323`.
- mirror: `setup-sdlc.yaml:296` (`.sdlc/config.json containing`) and the `setup-pr-labels-menu-rules` move.
- decisions: Key Decision 4.
- sync: Task 5 moves the files that `:267` and `:326` describe.

```diff
# tests/promptfoo/datasets/setup-sdlc.yaml:178-179
       Project at tests/promptfoo/fixtures-fs/setup-pr-labels-clean/ with an existing
-      .claude/sdlc.json that already has `pr.titlePattern` and `pr.allowedTypes`. The user
+      .sdlc/config.json that already has `pr.titlePattern` and `pr.allowedTypes`. The user

# :183-184
       Walk through setup-pr-labels.md Steps 1-6 for this project and pick "off" at the
-      mode prompt. Show the exact JSON written into .claude/sdlc.json `pr` section,
+      mode prompt. Show the exact JSON written into .sdlc/config.json `pr` section,

# :200-201
         No `rules` array is written. The user is shown a one-line summary like
-        "Wrote pr.labels: mode=off to .claude/sdlc.json".
+        "Wrote pr.labels: mode=off to .sdlc/config.json".

# :211-212
       Walk through setup-pr-labels.md and pick "llm" at the mode prompt. Show the JSON
-      block written to .claude/sdlc.json `pr.labels` and explain why this is opt-in.
+      block written to .sdlc/config.json `pr.labels` and explain why this is opt-in.

# :234-235
       Walk through setup-pr-labels.md Step 4 with the inputs above. Show the final JSON
-      block written to .claude/sdlc.json `pr.labels` and identify which schema keys it
+      block written to .sdlc/config.json `pr.labels` and identify which schema keys it

# :266-267
       Project at tests/promptfoo/fixtures-fs/setup-pr-labels-menu-off/ with an existing
-      .claude/sdlc.json containing `pr.labels: { mode: "off" }`. The user runs
+      .sdlc/config.json containing `pr.labels: { mode: "off" }`. The user runs

# :325-326
       Project at tests/promptfoo/fixtures-fs/setup-pr-labels-menu-unset/ with an existing
-      .claude/sdlc.json that has a `pr` block (titlePattern, allowedTypes) but NO
+      .sdlc/config.json that has a `pr` block (titlePattern, allowedTypes) but NO
```

### Task 5: Move the setup-pr-labels-menu-off and -menu-unset fixture configs

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-off/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-off/.sdlc/config.json`
- Modify: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-unset/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-unset/.sdlc/config.json`

**Notes:** Finding F-sdlc-config-path-fixtures-6. The `$schema` relative path stays right, because `.sdlc/` is at the same depth as `.claude/`. The empty `.claude/` directory disappears, because git does not track empty directories. Run each `mkdir -p` and `git mv` as its own Bash call.

**Acceptance criteria:**
- [ ] For each of `setup-pr-labels-menu-off` and `setup-pr-labels-menu-unset`: `mkdir -p tests/promptfoo/fixtures-fs/<dir>/.sdlc`, then `git mv tests/promptfoo/fixtures-fs/<dir>/.claude/sdlc.json tests/promptfoo/fixtures-fs/<dir>/.sdlc/config.json`.
- [ ] `git diff --cached -M --stat` shows two 100% renames.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs: \(a\)|fixture-guard: \(a\)"` passes.

**Contract:**
- shape (docs): two file renames, no content change.

| Before | After |
|---|---|
| `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-off/.claude/sdlc.json` | `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-off/.sdlc/config.json` |
| `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-unset/.claude/sdlc.json` | `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-unset/.sdlc/config.json` |

- names: fixture directories `setup-pr-labels-menu-off`, `setup-pr-labels-menu-unset` (names unchanged).
- mirror: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.sdlc/config.json`.
- decisions: Key Decision 4.
- sync: `setup-sdlc.yaml:267` and `:326` (Task 4) describe these files.

### Task 6: Config path in execute, version and jira prompt text

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — lines 58 and 68
- Modify: `tests/promptfoo/fixtures/plan-execution-with-guardrails.md` — line 23 heading
- Modify: `tests/promptfoo/datasets/version-sdlc.yaml` — lines 425, 455 and 532
- Modify: `tests/promptfoo/datasets/jira-sdlc.yaml` — line 177
- Modify: `tests/promptfoo/fixtures/jira-multi-project-closed-list.md` — line 3 heading

**Notes:** Findings F-sdlc-config-path-fixtures-2 to -4. Prompt text only: no fixtures-fs directory moves, and the version-sdlc-* directories stay as they are. These are behavioural datasets: verify by review and the exec lint checks only.

**Acceptance criteria:**
- [ ] `grep -n "\.claude/sdlc\.json" <each of the five files>` prints nothing.
- [ ] Each edit replaces only the token `.claude/sdlc.json` with `.sdlc/config.json`; no other text changes.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs: \(a\)|dataset-regex: \(a\)"` passes.

**Contract:**
- shape (docs): one-token replacement on each of the nine listed lines, as rendered below (all nine sites shown).
- names: the files and lines listed under Files.
- mirror: `setup-sdlc.yaml:296`.
- decisions: Key Decision 4; version-sdlc stays prompt-text only.
- sync: the fixture headings match the dataset prompt text.

```diff
# tests/promptfoo/datasets/execute-plan-sdlc.yaml:57-58
       Run /execute-plan-sdlc --quality balanced. A plan with 4 tasks has been loaded and validated.
-      The project has execution guardrails configured in .claude/sdlc.json under execute.guardrails.
+      The project has execution guardrails configured in .sdlc/config.json under execute.guardrails.

# tests/promptfoo/datasets/execute-plan-sdlc.yaml:67-68
         The response acknowledges that execution guardrails are configured and loaded from the
-        execute section of .claude/sdlc.json (not the plan section). It describes or references
+        execute section of .sdlc/config.json (not the plan section). It describes or references

# tests/promptfoo/datasets/version-sdlc.yaml:424-425
     project_context: >
-      The user has set `version.preRelease: "rc"` in .claude/sdlc.json. Running
+      The user has set `version.preRelease: "rc"` in .sdlc/config.json. Running

# tests/promptfoo/datasets/version-sdlc.yaml:454-455
     project_context: >
-      The user has `version.preRelease: "rc"` in .claude/sdlc.json but is graduating
+      The user has `version.preRelease: "rc"` in .sdlc/config.json but is graduating

# tests/promptfoo/datasets/version-sdlc.yaml:531-532
     project_context: >
-      The user has `version.changelog: true` in .claude/sdlc.json but did NOT pass --changelog
+      The user has `version.changelog: true` in .sdlc/config.json but did NOT pass --changelog

# tests/promptfoo/datasets/jira-sdlc.yaml:176-177
       Run /jira-sdlc. No --project argument. Current branch is "main" (no
-      [A-Z]{2,10}-\d+ pattern). .claude/sdlc.json has jira.projects: ["FOO","BAR"]
+      [A-Z]{2,10}-\d+ pattern). .sdlc/config.json has jira.projects: ["FOO","BAR"]

# tests/promptfoo/fixtures/plan-execution-with-guardrails.md
-## Project Config (.claude/sdlc.json)
+## Project Config (.sdlc/config.json)

# tests/promptfoo/fixtures/jira-multi-project-closed-list.md
-## Project Config (`.claude/sdlc.json`)
+## Project Config (`.sdlc/config.json`)
```

## Final Shape

When all six tasks are done:

- `plan-format-reference.md` says that task blocks go under a literal `## Tasks` heading, in Section Order, in the Per-Task Block and in the Example Plan.

- plan-sdlc SKILL.md Step 2 says the same.

- One new exec case fails if that text drifts.

- `execute.js` has no unused quality constants. The `jira.js` `let` block lines up.

- received-review-sdlc defines `<FLAGS>` before it uses it.

- The listed behavioural datasets and fixtures name `.sdlc/config.json`. The three setup-pr-labels fixtures hold their config at `.sdlc/config.json`, like the menu-rules precedent.

- PF10, the spec and every legacy or migration case are unchanged.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9405: name literal `## Tasks` heading in plan-format-reference.md and plan-sdlc SKILL.md; PF10 unchanged; optional test | Task 1 | covered |
| 2 Delete dead constants VALID_QUALITY and LEGACY_QUALITY in execute.js | Task 2 | covered |
| 3 Align `let bodyFile` in jira.js:209 | Task 2 | covered |
| 4 received-review-sdlc: move Flags paragraph above Step 1a condition | Task 3 | covered |
| 5 Replace stale .claude/sdlc.json paths with .sdlc/config.json; git mv three fixtures | Task 4, Task 5, Task 6 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
