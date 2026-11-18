# U3 Rename Candidate Implementation Plan

**Commit:** `fix(#9408): plan - U3 rename candidate only on real renames`
**Goal:**
- Stop the G17 rule U3 from proposing "update triggers naming X after the rename" when the plan renames nothing (#9407, ledger F-117).
- Make U3 fire only when a task line really moves a path out of a dimension trigger's directory: the directory itself is renamed or moved, or files leave it.
- Guard both directions with two new exec cases: the w27 false positive (must not fire) and a real directory rename (must fire).

**Architecture:** The root problem is that U3 treats any task line holding the word "rename" or "move" plus the trigger directory as a plain substring as proof of a rename. Two independent tasks in one execute wave. Task 1 rewords the U3 row in the plan-sdlc user doc and its site copy. Task 2 replaces the U3 condition in `plan-critique.js` with a token-based check and adds one fixture directory and two exec cases. No file is shared between the tasks.
**Source:** conversation context (wave brief #9408, item #9407)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-g17:"`

---

## Context

**What problem does this change solve?**

G17 is the advisory plan-sdlc gate that suggests updates to review dimensions. A review dimension is a review checklist with trigger globs (path patterns such as `plugins/**/scripts/**/*.js`).

Rule U3 is meant to say: "this plan renames a directory that a trigger names, so the trigger will go stale".

At HEAD the rule fires far too often. It fires when any task line holds the word "rename" or "move" and contains the trigger's directory as a plain substring (F-u3-rename-trigger-firing-logic-2).

**What prompted this change now?**

In the merged w27 plan, U3 fired three false high-severity candidates: for `plugins`, `docs` and `tests/promptfoo/fixtures` (F-u3-rename-trigger-firing-logic-3). The lines were "move the Flags paragraph" and a `git mv` of a config file inside a directory that keeps its name. Nothing was renamed.

**Re-verification at HEAD (1a3a573):**

- The cause is still at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:289-291`. The item reproduces.
- Running `g17-prepare` at HEAD on the w27 plan with the repository's own dimensions gives `security-review:U3+U5`, `spec-compliance:U3`, `test-quality:U3`, `code-quality:U1`.
- With the condition proposed in Task 2 (prototyped in a scratch copy, not in the tree), the same run gives `code-quality:U1`, `security-review:U5`. All three U3 false positives go; the other rules are unchanged.
- HEAD also misses a real rename written as `git mv src/old src/new`, because the word `mv` is not in its verb list. The prototype fires U3 for it.
- No item was dropped.

**What does success look like?**

- U3 does not fire for prose "move", for a file rename that keeps its parent directory, or for a directory whose name is only a substring of another (`tests/promptfoo/fixtures` versus `tests/promptfoo/fixtures-fs`).
- U3 fires, high severity, when a task moves a triggered directory or its files to a new location that a plan path uses.
- The other G17 rules give the same output as before.

## Research Findings

- **Code site.** `updateFirings(dim, planPaths, taskLines)` at `plan-critique.js:274` evaluates U1 to U6 for each plan path `p` that the dimension does not cover. For each trigger it derives `dir` at `:287-288`: the trigger's dirname, or the text before the last `/` ahead of the first glob character (F-u3-rename-trigger-firing-logic-1). Its single call site is `:403`, guarded by `!planPaths.every(isDocPath)` (F-g17-exec-test-cases-10).

- **Inputs available.** `taskLines` is every line of every task section (`:380`). There is no helper that extracts a rename source and target (F-u3-rename-trigger-firing-logic-4).

- **Contract text.** The spec names the U rules only as "U1–U6" in R31 (`docs/specs/plan-sdlc.md:82`) and does not define U3 (F-u3-spec-and-docs-contract-1). The definition lives in the user doc table at `docs/skills/plan-sdlc.md:326`: "Plan renames/moves a directory explicitly named in a dimension trigger" (F-u3-spec-and-docs-contract-2). The spec does not state the loose rule, so the spec does not change.

- **Original intent.** The design table in `docs/plans/2026-11-05-m7-w2-plan-scripts.md:563-564` confirms U3 was meant for a real rename (F-u3-spec-and-docs-contract-9). The behavioural fixture `tests/promptfoo/fixtures/plan-g17-update-rename-drift.md` uses the shapes "Modify: core/auth.js (moved from lib/auth.js)" and "move all files from lib/ to core/". The new rule must fire for both shapes, so it must not depend on token order.

- **Tests.** `tests/promptfoo/datasets/plan-prepare-exec.yaml:744-799` holds the `plan-g17:` exec cases. None covers U3 (F-g17-exec-test-cases-4). Their fixture `fixtures-fs/plan-g17-prepare` has one dimension with trigger `src/**/*.js` and no rename text (F-g17-exec-test-cases-5, -6), and its existing case asserts `candidates.length === 2`. So the new cases get their own fixture directory.

- **Floors.** `fixture-guard-exec.yaml:41` checks `datasets >= 19` and `refs >= 316` over the behavioural and headless datasets only, and `:9` checks `scanned >= 150` over fixture `setup.sh` files. Exec datasets and a fixture with no `setup.sh` do not change them. No count check covers `plan-prepare-exec.yaml`.

- **Out of scope, checked.** plan-sdlc `SKILL.md` and `plan-lane-g17.md` have no U3 wording (F-u3-spec-and-docs-contract-5, -6). Historical plans that repeat the old patch text stay as they are (F-u3-spec-and-docs-contract-8).

- **Commands.** Targeted exec run: the Verification header command. The main session runs the full exec suites and the six validators.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Spec unchanged | no | no edit to `docs/specs/plan-sdlc.md`; the fix cites R31 and R67(c) | R31 lists U1–U6 by name only and does not state the loose rule; the brief asks for a spec edit only if it does. A spec edit would also pull in every `plan.copyRules` copy of plan-sdlc |
| User doc row reworded | no | Task 1 rewords the U3 row in `docs/skills/plan-sdlc.md` and its site copy | the row says "a directory", but the brief's expected behaviour also covers files that leave the directory |
| Patch text unchanged | no | keeps "update triggers naming `X` after the rename" | the text is right once U3 fires only on a real rename (F-u3-spec-and-docs-contract-4 left as is) |
| Verb list widened | no | adds `mv` and the inflected forms (`renamed`, `moves`, `moving`, ...) | `git mv` is how this repository renames files; without `mv` the positive case does not fire at HEAD |
| New fixture directory | no | `fixtures-fs/plan-g17-u3`, not new files in `plan-g17-prepare` | a second dimension in the shared fixture would change the existing `candidates.length === 2` case |

## Decisions taken without the owner

These decisions were taken by the planner because no owner was available. Each takes the narrowest option that meets the brief.

1. No spec change. R31 is the cited id; the U-criteria definitions live in the user doc table, which Task 1 updates.
2. The new U3 test is order-free: source and target tokens may appear in either order in one line. This keeps the behavioural fixture's "core/x.js (moved from lib/x.js)" shape firing.
3. The U3 firing path `p` must be at or under the target token. This ties the candidate to the new location and stops a "move" line from firing for unrelated plan paths.
4. Keep the patch text and the severity (high) as they are.
5. Leave the G17 lane agent, the other G17 rules and `.sdlc/review-dimensions/` unchanged, as the brief says.

## Key Decisions

- **Token check, not substring check.** The new rule splits a task line into path-like tokens. It fires only when the line has a rename verb, one token at or under the trigger directory, and another token outside it that holds the plan path `p`. The alternative was to keep the substring test and add an exclusion list for prose. That would keep firing on new prose shapes. The token check states what a rename is.

- **Segment-bounded "inside".** A path is inside `dir` only when it equals `dir` or starts with `dir/`. This is what stops `tests/promptfoo/fixtures-fs/...` from counting as inside `tests/promptfoo/fixtures`.

- **A same-directory file rename never fires.** Both tokens are inside the trigger directory, so the "outside" token is missing. That matches the brief: the trigger still matches the new location.

- **Threat model and accepted gaps (F-73).** U3 is a best-effort text scan and stays advisory. It catches a task line that names a source inside the trigger directory and a new location that a plan path uses. Accepted gaps: a rename split over two lines is not seen; a new location that no task lists under **Files:** is not seen; a line that moves content (not a path) from a triggered file into a new plan file still fires; a word that equals the trigger directory (for example `docs`) in a move line counts as a source. Reviewers should report only gaps outside this list.

- **Smallest viable cut.** Task 2 alone fixes #9407. Task 1 is two copies of one table row, kept because the row would otherwise describe a narrower rule than the code.

- **Who fails if this ships wrong.** Plan authors and the main session that reads G17 candidates. A too-strict rule hides a stale trigger after a real rename; a too-loose one keeps the noise. G17 is advisory, so no plan is blocked either way. Plugin users get the fix in their own plans.

- **No workspace-mode impact.** The change is a pure function over plan text. It reads no state file or config and runs no git command, so branch and worktree mode behave the same.

- **Tracking ids are internal register ids, not GitHub issues.** The PR body names `#9407` and `#9408` with no `Fixes` or `Closes` keyword.

- **Non-goals.** No change to U1, U2, U4 to U6 or C1 to C6. No change to the U3 patch text or severity. No change to `plan-lane-g17.md`, plan-sdlc `SKILL.md`, the spec, `.sdlc/review-dimensions/` or historical plans. No behavioural or headless runs; the behavioural fixture `plan-g17-update-rename-drift.md` is not edited.

## Contract Examples

Code (Task 2):

```markdown
**Contract:**
- shape (code): replace the U3 condition in `updateFirings` with `movesOut(l, dir, p)`; add `RENAME_VERB`, `within`, `pathTokens`, `movesOut` above `updateFirings`.
- names: `RENAME_VERB`, `within`, `pathTokens`, `movesOut`.
- mirror: the private helpers above `createFirings` in the same file.
- decisions: Key Decisions "Token check, not substring check", "Segment-bounded inside", "A same-directory file rename never fires" and the threat model.
- sync: the U3 row in `docs/skills/plan-sdlc.md` (Task 1) describes the same rule.
```

Docs (Task 1):

```markdown
**Contract:**
- shape (docs): MODIFY one table row in `docs/skills/plan-sdlc.md`; copy the file byte for byte to its site copy (audience: plan-sdlc users).
- names: U3, UPDATE-path proposals table.
- mirror: the neighbouring U rows.
- decisions: severity stays high.
- sync: `site/src/content-source/skills/plan-sdlc.md` equals `docs/skills/plan-sdlc.md`.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds two plan-g17 exec cases and a fixture for the code change. |
| no-ci-bypass | error | PASS | No CI checks are skipped or disabled. |
| no-auto-eval | error | PASS | Only a targeted exec-config run filtered to "plan-g17:" is used, with no retry loop. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Both tasks address #9407 only. The widened verb list is justified in the deviations table. |
| single-responsibility-tasks | warning | PASS | Task 1 is one doc row. Task 2 is the U3 condition plus its tests. |
| scripts-over-llm-logic | error | PASS | The change is deterministic script logic in plan-critique.js. |
| yagni | warning | PASS | Four small helpers, each used by the U3 check. |
| cross-skill-consistency | error | PASS | Only plan-sdlc G17 is touched, and other rules and skills are unchanged. |
| pr-link-github-issue | error | PASS | The ids are internal register ids, not GitHub issues, so omitting a Fixes keyword is stated and justified. |
| dry | warning | PASS | The site doc copy is a required byte copy, with no duplicated logic. |
| kiss | warning | PASS | A token check replaces the substring test, and the plan justifies it in Key Decisions. |
| spec-first | error | PASS | No SKILL.md changes; the spec does not define U3, and the plan justifies no spec edit and updates the user-doc definition. |
| project-agnostic | error | PASS | The change is made in plugin code, which ships to every consumer. |
| flag-coherence-cross-skill | error | PASS | No flag or SKILL.md gating is involved. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are changed. |
| flag-resolution-single-source | warning | PASS | No flags are introduced. |
| state-premise | error | PASS | The Architecture and Context sections state the root problem: U3 treats any rename or move word plus a directory substring as a rename. |
| smallest-viable-cut | warning | PASS | Key Decisions names Task 2 as the minimum and justifies Task 1. |
| failure-audience | warning | PASS | Key Decisions has a "Who fails if this ships wrong" entry. |
| explicit-non-goals | warning | PASS | A Non-goals entry is present. |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions and in Decisions taken without the owner. |
| state-machine-idempotency | error | PASS | No migration, init, or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is added. |
| workspace-mode-compatibility | error | PASS | A Key Decisions entry says it is a pure function over plan text, so branch and worktree modes behave the same. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: security-review (U3)

**Why:** Task 1 edits `docs/skills/plan-sdlc.md` and its site copy, and the plan quotes the old U3 rule 'update triggers naming `X` after the rename', so this dimension's triggers may need a path check.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/fixtures-fs` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — update triggers naming `tests/promptfoo/fixtures-fs` after the rename

### UPDATE: test-quality (U3)

**Why:** Task 2 touches `plugins/sdlc-utilities/scripts/lib/plan-critique.js` and adds fixtures under `tests/promptfoo/fixtures-fs/plan-g17-u3`, so triggers naming `tests/promptfoo/fixtures` should be rechecked.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/fixtures` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/fixtures` after the rename

### UPDATE: code-quality (U1)

**Why:** Task 2 rewrites the U3 condition and adds helpers (`RENAME_VERB`, `within`, `pathTokens`, `movesOut`) in `plan-critique.js`, and Task 1 changes the docs; the script proposes the `**/*.md` trigger for the new `plans/*.md` fixture and doc paths.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_1 additional candidates suppressed_

Note: the three U3 candidates above are themselves the #9407 false positive, produced by the HEAD rule from the prose of this plan. The `tests/promptfoo/fixtures-fs` and `tests/promptfoo/fixtures` directories are not renamed. With Task 2 in place they do not fire.

## Tasks

### Task 1: Reword the U3 row in the plan-sdlc user doc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — U3 row of the UPDATE-path proposals table (`:326`)
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy, made with `cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`

**Notes:** Findings F-u3-spec-and-docs-contract-2, F-g17-exec-test-cases-12. Traces to requirements 1 and 2: the row is the user-facing definition of the U3 rule that Task 2 changes. Trivial: one table row plus a `cp`. The table is where the U rules are defined for users; R31 only names them. A user-doc change does not match a `plan.copyRules` `when` glob, so only the site copy is required.

**Acceptance criteria:**
- [ ] The U3 row reads exactly as in the diff below; no other line changes.
- [ ] `cmp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): one table-row edit, rendered below.
- names: U3.
- mirror: the U1, U2, U4 to U6 rows (`:325-329`).
- decisions: severity stays `high`.
- sync: the site copy is byte-identical.

```diff
-| U3 | Plan renames/moves a directory explicitly named in a dimension trigger | high |
+| U3 | A task line renames or moves a path from inside a directory named in a dimension trigger to a new location outside it that a plan path uses (`git mv`, rename, move); prose "move" and a rename that keeps the directory do not fire | high |
```

### Task 2: Fire U3 only on a real rename out of the trigger directory

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — U3 condition in `updateFirings` (`:289`) and four helpers above it
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — header fixture list (`:10-11`) and two `plan-g17: U3` cases after the `plan-g17: a non-numeric --window` case
- Create: `tests/promptfoo/fixtures-fs/plan-g17-u3/.sdlc/review-dimensions/fixture.md`
- Create: `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/no-dir-rename.md`
- Create: `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/dir-rename.md`

**Notes:** Implements R31 (U3 is one of its U1–U6 criteria) with R67(c) acceptance cases. Findings F-u3-rename-trigger-firing-logic-1, -2, -5, F-g17-exec-test-cases-4, -9, -10. The fixture has no `.github/instructions` or learnings file: `g17-prepare` treats both as absent (no mirror, no deferral). The fixture bodies are in `## Task 2 Fixture Files`; copy them byte for byte. Write the two cases first and see both fail at HEAD, then change the code. Floors: none over `plan-prepare-exec.yaml`; `fixture-guard-exec.yaml` floors are unchanged (no `setup.sh`, exec dataset).

**Acceptance criteria:**
- [ ] Before the code change, the case `plan-g17: U3 does not fire` fails and `plan-g17: U3 fires` fails (HEAD has no `mv` verb).
- [ ] After it, the targeted run passes all seven `plan-g17:` cases: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-g17:"`.
- [ ] The diff in `plan-critique.js` touches only the U3 condition and the four new helpers.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): the diff below. `movesOut(line, dir, p)` is true when the line matches `RENAME_VERB`, some token `s` has `within(s, dir)`, and some token `d` has `!within(d, dir) && within(p, d)`. Token order does not matter.
- names: `RENAME_VERB`, `within`, `pathTokens`, `movesOut`; exec cases `plan-g17: U3 does not fire for prose move, same-directory rename or a substring directory (#9407)` and `plan-g17: U3 fires when a triggered directory is renamed (#9407)`.
- mirror: the existing `plan-g17:` cases at `plan-prepare-exec.yaml:746-766` (vars and `javascript` assertions).
- decisions: Key Decisions "Token check, not substring check", "Segment-bounded inside", "A same-directory file rename never fires" and "Threat model and accepted gaps"; Decisions taken without the owner 2 to 4 (order-free tokens, `p` under the target, patch text and severity unchanged).
- sync: the U3 row from Task 1.

```diff
# plugins/sdlc-utilities/scripts/lib/plan-critique.js — new helpers, directly above the "/** U1–U6 firings" comment
+// U3: a rename verb, then path-like tokens of one task line. Best-effort text scan (advisory gate); accepted gaps
+// are listed in the w28 plan Key Decisions: a rename split over lines, a new location in no Files entry, a content
+// move into a new plan file, and a word equal to the trigger directory.
+const RENAME_VERB = /\b(?:renam(?:e|es|ed|ing)|mov(?:e|es|ed|ing)|mv)\b/i;
+const within = (x, d) => x === d || x.startsWith(`${d}/`);
+function pathTokens(line) {
+  return line.split(/[\s`'"(),;]+/).map(w => w.replace(/[.:]+$/, '').replace(/\/+$/, '')).filter(Boolean);
+}
+/** True when the line moves a path from inside `dir` to a location outside it that holds plan path `p`. */
+function movesOut(line, dir, p) {
+  if (!RENAME_VERB.test(line)) return false;
+  const tokens = pathTokens(line);
+  return tokens.some(s => within(s, dir)) && tokens.some(d => !within(d, dir) && within(p, d));
+}
+
 /** U1–U6 firings for one covered dimension. */
 function updateFirings(dim, planPaths, taskLines) {

# inside updateFirings
       const dir = (glob === -1 ? path.posix.dirname(t) : t.slice(0, t.lastIndexOf('/', glob) + 1)).replace(/\/$/, '');
-      if (dir && dir !== '.' && taskLines.some(l => /\b(rename|move)\b/i.test(l) && l.includes(dir))) {
+      if (dir && dir !== '.' && taskLines.some(l => movesOut(l, dir, p))) {
         fire('U3', p, 'high', `update triggers naming \`${dir}\` after the rename`);
       }
```

The three fixture files are rendered in `## Task 2 Fixture Files` below the task list. They sit outside the task block on purpose: their `- Modify:` lines would otherwise be read as this task's **Files:** entries.

Exec cases, inserted after the `plan-g17: a non-numeric --window is a usage error` case; the header fixture list gains `fixtures-fs/plan-g17-u3 - one dimension and two plans (no rename, directory rename) for the plan-g17: U3 cases`:

```yaml
- description: "plan-g17: U3 does not fire for prose move, same-directory rename or a substring directory (#9407)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-g17-u3"
    script_args: "g17-prepare --plan {{project_root}}/plans/no-dir-rename.md --dimensions-dir {{project_root}}/.sdlc/review-dimensions --instructions-dir {{project_root}}/.github/instructions --learnings {{project_root}}/.sdlc/learnings/log.md --window 14 --github-hosting false --root {{project_root}} --today 2026-11-18"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        const covered = r.coveredDims.some(d => d.name === 'fixture-review');
        const u3 = r.firedCriteria.filter(f => f.id === 'U3');
        if (covered && u3.length === 0 && !r.candidates.some(c => (c.criteria || []).includes('U3'))) return true;
        return { pass: false, score: 0, reason: JSON.stringify({ covered, u3 }) };

- description: "plan-g17: U3 fires when a triggered directory is renamed (#9407)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-g17-u3"
    script_args: "g17-prepare --plan {{project_root}}/plans/dir-rename.md --dimensions-dir {{project_root}}/.sdlc/review-dimensions --instructions-dir {{project_root}}/.github/instructions --learnings {{project_root}}/.sdlc/learnings/log.md --window 14 --github-hosting false --root {{project_root}} --today 2026-11-18"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        const u = r.candidates.find(c => c.kind === 'UPDATE-path' && c.dimension === 'fixture-review');
        if (u && u.criteria.includes('U3') && u.severity === 'high' && JSON.stringify(u.paths) === JSON.stringify(['src/new/a.js']) && u.patch === 'update triggers naming `src/old` after the rename') return true;
        return { pass: false, score: 0, reason: JSON.stringify(u || r.candidates) };
```

## Task 2 Fixture Files

Byte content of the three files Task 2 creates. Each file ends with one newline.

Fixture `tests/promptfoo/fixtures-fs/plan-g17-u3/.sdlc/review-dimensions/fixture.md`:

```markdown
---
name: fixture-review
description: U3 fixture dimension
severity: medium
triggers:
  - "plugins/**/scripts/**/*.js"
  - "tests/promptfoo/fixtures/*.md"
  - "src/old/**"
---

# Fixture review
```

Fixture `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/no-dir-rename.md` (the w27 shapes):

```markdown
# U3 negative fixture

### Task 1: Reorder a paragraph

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `plugins/demo/scripts/a.js` — move the "Flags" paragraph (`:132`) above the condition line (`:128`)

### Task 2: Move a fixture config

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/demo/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/demo/.sdlc/config.json`

**Acceptance criteria:**
- [ ] `git mv tests/promptfoo/fixtures-fs/demo/.claude/sdlc.json tests/promptfoo/fixtures-fs/demo/.sdlc/config.json` shows a 100% rename.
- [ ] Rename `plugins/demo/scripts/old.js` to `plugins/demo/scripts/new.js` in the same directory.
```

Fixture `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/dir-rename.md`:

```markdown
# U3 positive fixture

### Task 1: Rename the old source directory

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `src/old/a.js` — delete (moved with `git mv`)
- Create: `src/new/a.js`

**Acceptance criteria:**
- [ ] `git mv src/old src/new` renames the directory.
```

## Final Shape

When both tasks are done:

- U3 fires only when a task line moves a path from inside a trigger's directory to a new location outside it, and a plan path sits at that new location.

- `git mv`, "rename" and "move" in any tense count as rename verbs. A same-directory rename, prose "move" and a directory that only shares a name prefix do not fire U3.

- The w27 plan gives no U3 candidate. A plan that renames `src/old` to `src/new` gives one high U3 candidate for `src/new/a.js`.

- The plan-sdlc user doc and its site copy describe this rule in the U3 row.

- Every other G17 rule, the patch text, the spec and the G17 lane agent are unchanged.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 U3 fires only when a task really renames or moves a path out of a dimension trigger's directory | Task 1, Task 2 | covered |
| 2 Prose move, same-parent file rename and substring-only directory names must not fire U3 | Task 2 | covered |
| 3 Update the spec text only if it states the loose rule; cite the spec id | Task 1 | covered |
| 4 Add one negative exec case reproducing the w27 false positive | Task 2 | covered |
| 5 Add one positive exec case where a triggered directory is renamed | Task 2 | covered |
| 6 No change to U1, U2, U4-U6, C1-C6, the G17 lane agent prompt, or .sdlc/review-dimensions/ | Task 2 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
