# setup-sdlc spec and docs truth Implementation Plan

**Commit:** `fix(#9361): setup-sdlc - skip flag, force wording, schema truth`
**Goal:** Make the setup-sdlc spec, SKILL.md and user doc tell the truth about the shipped code, give `--skip` real behaviour, and fix the `--unset-only --force` default token bug.
**Architecture:** Spec first (Task 1), then three independent file owners in parallel: the prepare script with its exec cases (Task 2), SKILL.md (Task 3) and the user doc (Task 4). The last task re-copies the site mirrors and runs the main-session validators (Task 5). `--skip` is parsed and validated by `skill/setup.js` (`flags.skip`); SKILL.md only subtracts that list from `selectedIds`.
**Source:** conversation context: the architect-validated M1 verdict (12 items, 2026-11-11, session scratch file `mediums/M1-verdict.md`), restated in `## Context` and `## Research Findings`
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern setup-prepare`

---

## Context

**What problem does this change solve?**

- The setup-sdlc docs say things the code does not do.
- SKILL.md says `--force` changes which menu rows are pre-checked. It does not. It only skips the per-field `keep` prompt.
- The `--skip <section>` flag is documented in three places, but nothing implements it.
- The spec, the user doc and one test rubric still say the config schema version is 3. The code says 4.
- The spec never names the `received-review` section. The user doc has no row for it.
- The ship section's menu text still offers "workspace isolation". That field was removed long ago (spec R24).
- One real code bug: with `--unset-only --force`, the prepare script says "select all" in one field and "select not-set" in another. SKILL.md reads the wrong one.

**What prompted this change now?**

- An isolated architect review of the setup-sdlc medium findings (batch M1) confirmed all 8 findings at HEAD `f4862bb` and found 4 more (X1, X2, X3, site copies).
- The owner decided on M-3 on 2026-11-11: implement `--skip`, do not remove it.

**What does success look like?**

- Every flag in SKILL.md, the spec and the user doc matches what `skill/setup.js` and `lib/setup-sections.js` do.
- `/setup-sdlc --skip jira` leaves `jira` out of the selection, and an unknown id stops setup with a clear error.
- `--unset-only --force` gives `menuInputContract.defaultToken === 'all'`.
- The targeted exec run (`--filter-pattern setup-prepare`) passes, and the five main-session validators pass.

## Research Findings

All 12 verdict items were re-verified at HEAD `f4862bb` (plan-sdlc discovery brief, a temporary file; its finding ids are cited below). None is dropped. The verdict line numbers still hold.

- **X1 (defaultToken bug).** `plugins/sdlc-utilities/scripts/skill/setup.js:512-514` computes `defaultSelectionMode = force ? 'all' : (unsetOnly ? 'unset-only' : 'all')`. But `setup.js:562-566` builds `defaultToken` from `parsed.flags.unsetOnly`. So `--force` does not win there (F-setup-script-skip-and-defaulttoken-2). The existing exec case at `tests/promptfoo/datasets/setup-prepare-exec.yaml:126-137` asserts `flags.unsetOnly === true` under `--force`, so `flags.unsetOnly` must stay the raw flag.
- **M-3 (`--skip`).** `setup.js:476-478` says `--skip` is "parsed by SKILL.md", but SKILL.md never parses it (F-setup-script-skip-and-defaulttoken-1, F-setup-spec-and-skillmd-drift-4). SKILL.md Step 0 runs `setup.js --output-file $ARGUMENTS` (`SKILL.md:57`), so the script already receives `--skip`. `selectedIds` is resolved in SKILL.md prose: `--only` at `SKILL.md:76-87`, the menu at `SKILL.md:150-170` (F-setup-script-skip-and-defaulttoken-3). Spec A2 (`docs/specs/setup-sdlc.md:13`) lists `content`, which is not a section id, and lacks `received-review` (F-setup-spec-and-skillmd-drift-5).
- **Config section ids.** `SETUP_SECTIONS` has 14 rows. Exactly 7 have no `setup-*` sub-flow in `delegatedTo`: `version`, `ship`, `jira`, `review`, `received-review` (`null`), `commit` (`inline-commit-builder`), `pr` (`inline-pr-builder`). These are the 7 ids SKILL.md:24 and docs:38 already list (F-setup-docs-and-site-copies-6).
- **M-18 (`--force` wording).** `SKILL.md:25` says `--force` pre-checks every row. `SKILL.md:107` lists `--force` as a menu-bypass flag, but the Step 0 routing table (`SKILL.md:78-85`) has no `--force` row. `SKILL.md:511` says configured sections are skipped unless `--force`. Spec A3 (`spec:14`) and R7 (`spec:82`) are right (F-setup-spec-and-skillmd-drift-1, -2, -3, -6).
- **M-19 (`--unset-only`).** Parsed at `setup.js:495`, defined by spec A8a and R-walk-1/2, but absent from SKILL.md frontmatter (`:3`, `:5`) and the arguments table (F-setup-spec-and-skillmd-drift-7, -8).
- **M-8 (schema version).** `plugins/sdlc-utilities/scripts/lib/config-version.js:32` has `CURRENT_SCHEMA_VERSION = 4`. Hard-coded 3: spec `:5`, `:41` (R-layout-2), `:71`, `:203` (I2a); docs `:37`, `:329`, `:330`; rubric `tests/promptfoo/datasets/setup-sdlc.yaml:356` (F-setup-spec-and-skillmd-drift-9, -10, F-setup-docs-and-site-copies-5). Spec `:66` has no number, so it stays.
- **X3 (local `version: 2`).** `setup.js:121-134` marks local config v1 when it has legacy `ship.preset`/`ship.skip` keys, or when both `schemaVersion` and `version` are missing and a `ship` section exists. SKILL.md `:181`, `:190`, spec P6a (`:155`) and R15 (`:86`) still describe a `version: 2` stamp (F-setup-spec-and-skillmd-drift-13).
- **M-4 / X2 (`received-review`).** Defined at `plugins/sdlc-utilities/scripts/lib/setup-sections.js:355-367`. Missing from the spec P-sections id list (`:159`), spec R4 (`:81`) and the docs Sections table (`docs:155-169`) (F-setup-spec-and-skillmd-drift-11, -12, F-setup-docs-and-site-copies-3).
- **M-6 (workspace text).** `setup-sections.js:315` says "workspace isolation". `docs/skills/setup-sdlc.md:158` says "workspace" (the verdict quoted the code string for both; same fix). `plugins/sdlc-utilities/scripts/lib/ship-fields.js:37-144` has 13 fields: steps, quick, bump, draft, auto, rebase, reviewThreshold, three verifyPipeline* and three awaitRemoteReview* (F-setup-script-skip-and-defaulttoken-5, F-setup-docs-and-site-copies-2).
- **M-7, M-17.** docs `:23` omits `plan-template`; docs `:147` names `setup-prepare.js`, which does not exist (F-setup-docs-and-site-copies-1, -4).
- **Site copies.** `site/src/content-source/specs/setup-sdlc.md` and `site/src/content-source/skills/setup-sdlc.md` are byte-identical to their `docs/` sources today (`cmp` checked).
- **Tests.** The exec provider (`tests/promptfoo/providers/script-runner.js:142-168`) reads the JSON file whose path the script prints. On a non-zero exit with no file read, it appends stderr to the output. Baseline: `--filter-pattern setup-prepare` gives 25 passed, 0 failed at HEAD.
- **Build and test commands.** Exec tests: the **Verification:** command above. Validators: `.claude/skills/validate-plugin-consistency/check-consistency.js`, `.claude/skills/validate-skill-docs/check-docs-consistency.js`, `plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`, `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`, `plugins/sdlc-utilities/scripts/ci/validate-discovery.js`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| `--skip` valid set | no | accepts the 7 config section ids, not all 14 `sections[]` ids | the verdict names the config ids; SKILL.md:24 and docs:38 already list these 7; narrowest scope that meets the owner decision |
| `--skip` value form | no | comma-separated and repeatable | mirrors `--only <ids>` and `--steps <csv>` parsing in the same script |
| `--skip` on a locked legacy row | no | the locked row stays selected; one notice line | R-menu-3 says locked rows refuse uncheck; `--skip` is an uncheck |
| Unknown `--skip` id | no | `setup.js` exits 1 with a stderr line naming the id and the valid ids | a typo must not silently configure the section; E1 already says "display error, stop" |
| X1 fix shape | no | derive `defaultToken` from `defaultSelectionMode`; keep `flags.unsetOnly` raw | the existing exec case at setup-prepare-exec.yaml:126 asserts `flags.unsetOnly === true` under `--force` |
| Extra behavioural test case | no | adds one `--skip` case to `setup-sdlc.yaml` as text; it is not run | `test-coverage-required` asks for a case for the SKILL.md behaviour change; the brief forbids behavioural runs |
| Tracking id #9361 | no | the PR body names #9361 | the id is a tracking id in the project's `fix(#N)` style (see #9349, #9350), not confirmed as a GitHub issue |

### Decisions taken without the owner

No user was available. Each row above with `asked=no` is a decision taken without the owner. The two that change behaviour are: the 7-id `--skip` set, and the locked-row rule. Both take the narrowest option.

## Key Decisions

- **`setup.js` parses `--skip`, SKILL.md subtracts.** The alternative is SKILL.md parsing `$ARGUMENTS` itself. The script wins because it already receives `$ARGUMENTS`, can validate ids against `SETUP_SECTIONS` deterministically, and can be tested with exec cases (`scripts-over-llm-logic`, `flag-resolution-single-source`). The script cannot do the subtraction itself, because the menu reply arrives after the script has run.
- **"Config section" means "no `setup-*` sub-flow".** The script computes the valid set from `SETUP_SECTIONS` (`delegatedTo` does not start with `setup-`). A hard-coded list of 7 ids would drift when a section is added (`dry`).
- **`defaultToken` follows `defaultSelectionMode`.** The alternative is to set `flags.unsetOnly = false` under `--force`. That would break an existing assertion and hide the raw flag. Deriving from the single resolved mode keeps one source of truth.
- **Spec text says "CURRENT_SCHEMA_VERSION (4 at the time of writing)".** Writing only "4" would drift again at the next schema bump. Fixtures with `schemaVersion: 3` under `fixtures-fs/` stay: they are valid migration inputs.
- **A3 stays as written, plus one clause.** A3 is already correct. It gains "does not bypass the Step 1 menu" so SKILL.md:107 has a spec anchor.
- **The `--skip` flag name does not conflict across prepare scripts.** Grep evidence: `grep -n "'--skip'" plugins/*/scripts/skill/*.js` finds only `ship.js:126`, where `--skip` is a removed flag that is refused with an error. No other user-invoked prepare script defines it. setup-sdlc's `--skip` was already documented (spec A2, SKILL.md:24); this plan gives it behaviour, it does not add a new flag name.
- **Root problem, in one sentence.** setup-sdlc's written contract (spec, SKILL.md, user doc) drifted from its code, so users and the model follow instructions the code does not honour.
- **Who fails if this ships wrong.** A developer who runs `/setup-sdlc --skip <id>` and gets the section configured anyway, or gets a valid run refused. The model driving setup-sdlc, if SKILL.md and `prepare.flags.skip` disagree. No other skill reads `flags.skip`.
- **Smallest viable cut.** Every task maps to a verdict item. The only addition is the behavioural `--skip` case text in Task 1, which `test-coverage-required` asks for.
- **Non-goals.** Not in this plan: setup-sdlc mediums M-9 to M-14; wave M2 (SKILL.md Step 3.S, the diff preview region, the `project-scan.js` symlink guard); any change to ship-sdlc or execute-plan-sdlc files (wave 9a is in flight there); `skills-meta.ts` (it lists no setup-sdlc flags); `copy-docs.mjs`; any behavioural, headless or `claude -p` run; the `schemaVersion: 3` fixtures under `tests/promptfoo/fixtures-fs/`.
- **Workspace modes and state.** The change adds no file path, state write, cwd use or git call. `setup.js` keeps `resolveSdlcRoot()` for the project root. `--skip` is pure argument parsing, so it behaves the same in a branch or a worktree.
- **Idempotency.** `--skip` changes no stored state, and no migration or preflight check is touched. Running setup twice with the same `--skip` gives the same `flags.skip`. The exec cases check the parse itself, including a repeated id.

## Contract Examples

### code

```markdown
**Contract:**
- shape (code): `parseArgs(argv)` returns `flags.skip: string[]` (deduplicated, argument order); `main` exits 1 with `setup-prepare: --skip: unknown section id(s): <ids>. Valid: <ids>` on stderr for an id outside the config set; `menuInputContract.defaultToken` is `'not-set'` only when `defaultSelectionMode === 'unset-only'`.
- names: `flags.skip`, `skippableSectionIds()` (not exported), `menuInputContract.defaultToken`.
- mirror: `--steps <csv>` parsing at `plugins/sdlc-utilities/scripts/skill/setup.js:502-509`.
- decisions: script validates, SKILL.md subtracts (Key Decisions).
- sync: spec A2 and P-skip (Task 1); SKILL.md Step 0 skip subtraction (Task 3).
```

### docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/setup-sdlc.md` in place; add one Usage example for `--skip`, one Sections row for `received-review`; reword the ship row, the `--skip` row and three schemaVersion mentions.
- names: Sections table row `received-review`.
- mirror: the `review` row at `docs/skills/setup-sdlc.md:160`.
- decisions: user-facing prose only; values match `setup-sections.js` strings.
- sync: `site/src/content-source/skills/setup-sdlc.md` (byte copy, Task 5).
```

### openspec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY A2, A3, R-walk-1, R-layout-2, R4, R15, P6a, P-sections, P-menuInputContract, I2a in place; ADD `P-skip`; no renumbering.
- names: `A2`, `A3`, `R-walk-1`, `P-skip` (new).
- mirror: `P-menuInputContract` entry style at `docs/specs/setup-sdlc.md:175`.
- decisions: named id `P-skip` matches the file's `P-scan` / `P-sections` convention.
- sync: SKILL.md (Task 3) cites A2 and P-skip; setup.js (Task 2) implements them.
```

## Tasks

### Task 1: Spec truth and `--skip` contract, plus test rubric text

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint, manual

**Files:**
- Modify: `docs/specs/setup-sdlc.md` — A2 `--skip` contract, A3 clause, R-walk-1 mode source, schemaVersion lines, received-review in R4 and P-sections, P6a/R15 stamp wording, new P-skip, issue-trail row
- Modify: `tests/promptfoo/datasets/setup-sdlc.yaml` — rubric text at the #231 case; one new `--skip` behavioural case (text only, not run)

**Notes:** Spec first: Tasks 2-4 cite these ids. Edit every id in place; never renumber; withdrawn ids and issue numbers stay in the appendix only (`validate-spec-shape.js --strict`). Implements M-3 (spec half), M-4, M-8 (spec and rubric), X1 (spec half), X3 (spec half). Cites F-setup-spec-and-skillmd-drift-5, -9, -10, -11, -12, -13.

**Acceptance criteria:**
- [ ] Every before→after row below is applied verbatim.
- [ ] `grep -n "schemaVersion: 3\|current value 3\|current value: \`3\`" docs/specs/setup-sdlc.md` prints nothing.
- [ ] `grep -c "received-review" docs/specs/setup-sdlc.md` is at least 3 (A2, R4, P-sections).
- [ ] The new behavioural case uses the same indentation as the #292 case it follows (top-level `- description:` item, 2-space keys). Check it by manual review: no YAML parser is installed locally, and the behavioural config must not be run.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] No behavioural or headless run is started.

**Contract:**
- shape (openspec): MODIFY in place, ADD `P-skip` after `P-menuInputContract`, ADD one issue-trail row. Exact text:

| id | before (excerpt) | after (full replacement of the excerpt) |
|---|---|---|
| header `:5` | `carry a top-level \`schemaVersion\` integer (current value: \`3\`)` | `carry a top-level \`schemaVersion\` integer (the current \`CURRENT_SCHEMA_VERSION\` from \`scripts/lib/config-version.js\`; 4 at the time of writing)` |
| A2 | `` - A2: `--skip <section>` — skip a config section during setup; valid: version, ship, jira, review, commit, pr, content (default: none) `` | `` - A2: `--skip <section>` — skip config sections during setup; comma-separated or repeated. Valid values are the config section ids: the `prepare.sections[]` ids whose `delegatedTo` is not a `setup-*` sub-flow (`version`, `ship`, `jira`, `review`, `received-review`, `commit`, `pr`). `skill/setup.js` validates them and emits them as `flags.skip` (P-skip); an unknown id makes the script exit non-zero (E1). The ids are subtracted from `selectedIds` after the Step 1 menu or `--only` resolves; a locked legacy row (R-menu-3) is not subtracted (default: none) `` |
| A3 | `does not change default row pre-selection (all rows are pre-checked by default) (default: false)` | `does not change default row pre-selection (all rows are pre-checked by default) and does not bypass the Step 1 menu (default: false)` |
| R-walk-1 | `The selection mode resolves into a single \`flags.unsetOnly\` boolean in the prepare output, and SKILL.md cites that field by name (per \`flag-coherence-cross-skill\`).` | `The selection mode resolves into a single \`defaultSelectionMode\` field (\`all\` \| \`unset-only\`) in the prepare output, where \`--force\` wins over \`--unset-only\` (R-walk-2); \`flags.unsetOnly\` keeps the raw flag value. \`menuInputContract.defaultToken\` is derived from \`defaultSelectionMode\`, and SKILL.md cites \`menuInputContract.defaultToken\` by name (per \`flag-coherence-cross-skill\`).` |
| R-layout-2 | whole line | `` - R-layout-2: Initial project-config write stamps `schemaVersion: CURRENT_SCHEMA_VERSION` (exported from `scripts/lib/config-version.js`; 4 at the time of writing). Initial local-config write stamps the same `schemaVersion` (the legacy top-level `version: 2` integer was renamed to `schemaVersion` by the v2→v3 migration step). `` |
| Phases item 4 `:71` | `(each write stamps \`schemaVersion: 3\`)` | `(each write stamps \`schemaVersion: CURRENT_SCHEMA_VERSION\`, R-layout-2)` |
| R4 | `version, ship, jira, review, commit patterns, PR title patterns` | `version, ship, jira, review, received-review (per-user auto-apply severities), commit patterns, PR title patterns` |
| R15 | `and the resulting config write is persisted at top-level schema \`version: 2\`.` | `and the resulting config write carries the top-level \`schemaVersion\` stamp (R-layout-2).` |
| P6a | `or lacks a top-level \`version: 2\` stamp` | `or lacks both a top-level \`schemaVersion\` and a legacy top-level \`version\` stamp while a \`ship\` section exists` |
| P-sections `:159` | `` one of `version`, `ship`, `jira`, `review`, `commit`, `pr`, `` | `` one of `version`, `ship`, `jira`, `review`, `received-review`, `commit`, `pr`, `` |
| P-menuInputContract | `defaultToken: 'all' \| 'not-set' (resolved from flags.unsetOnly) }` | `defaultToken: 'all' \| 'not-set' (resolved from defaultSelectionMode: 'unset-only' gives 'not-set', otherwise 'all') }` |
| P-skip (ADD, after P-menuInputContract) | — | `` - P-skip: `flags.skip` (string[]) — the validated `--skip` ids (A2), deduplicated, in argument order; `[]` when `--skip` is absent. SKILL.md subtracts it from `selectedIds` and never parses `--skip` from its arguments itself. `` |
| I2a | `` `CURRENT_SCHEMA_VERSION` (current value 3) `` | `` `CURRENT_SCHEMA_VERSION` (4 at the time of writing) `` |
| Issue trail (ADD row, after `R-walk-1 … R-walk-3`) | — | `` \| A2, R-walk-1, P-skip \| (#9361) \| `` |

  Rubric edit, `tests/promptfoo/datasets/setup-sdlc.yaml` (#231 case):

```diff
         When a legacy `.claude/sdlc.json` is detected, the skill mentions that
         a migration is needed and that running `/setup-sdlc --migrate` will
-        relocate the file to `.sdlc/config.json` and stamp `schemaVersion: 3`.
+        relocate the file to `.sdlc/config.json` and stamp the current `schemaVersion`.
         The skill MUST NOT silently overwrite either file.
```

  New behavioural case, appended after the issue #292 "skip:false fields ARE prompted" case:

```yaml
- description: "setup-sdlc (#9361): --skip ids from prepare flags.skip are removed from the selection"
  vars:
    skill_path: "plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md"
    project_context: "file://fixtures/setup-clean-project.md"
    user_request: >
      Run /setup-sdlc --only jira,review,commit --skip jira. The prepare script has returned
      flags.skip = ["jira"] and no section is locked. List the section ids you will configure,
      in order, before asking any field question.
  assert:
    - type: llm-rubric
      value: >
        The skill resolves selectedIds from --only (jira, review, commit), then removes the ids
        in prepare.flags.skip, so it configures review and commit only. It MUST NOT ask any
        jira question. It does not parse --skip from the arguments itself (A2, P-skip).
```

- names: `A2`, `A3`, `R-walk-1`, `R-layout-2`, `R4`, `R15`, `P6a`, `P-sections`, `P-menuInputContract`, `P-skip` (new), `I2a`.
- mirror: `P-menuInputContract` entry at `docs/specs/setup-sdlc.md:175`; behavioural case shape at `tests/promptfoo/datasets/setup-sdlc.yaml:362-384`.
- decisions: see `## Key Decisions` (script validates, SKILL.md subtracts; "4 at the time of writing").
- sync: Task 2 (`setup.js`), Task 3 (SKILL.md), Task 5 site copy of the spec.

### Task 2: Prepare script — `--skip` parsing, defaultToken fix, ship purpose text, exec cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/setup.js` — parse and validate `--skip`; derive `defaultToken` from `defaultSelectionMode`; JSDoc update
- Modify: `plugins/sdlc-utilities/scripts/lib/setup-sections.js` — ship `purpose` string names the real fields
- Test: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — 5 new cases after the `#337` cases

**Notes:** Implements A2 and P-skip (M-3 script half), R-walk-1 (X1), and fixes M-6 in the code string first, because users see it in the Step 1 menu. `flags.unsetOnly` stays raw so the existing case at `setup-prepare-exec.yaml:126-137` keeps passing. Cites F-setup-script-skip-and-defaulttoken-1, -2, -5, -6.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/skill/setup.js --unset-only --force` writes JSON whose `menuInputContract.defaultToken` is `all`.
- [ ] `--skip ship,jira --skip ship` gives `flags.skip` equal to `["ship","jira"]`; no `--skip` gives `[]`.
- [ ] `--skip plan-template` exits 1, writes no output file path to stdout, and stderr names `plan-template` and the 7 valid ids.
- [ ] The ship `purpose` contains no `workspace` and names `rebase policy`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern setup-prepare` passes 30 of 30 (25 old + 5 new). Run once; no run-fix-rerun loop.

**Contract:**
- shape (code): CLI surface of `skill/setup.js`:

| flag | type | output field | error |
|---|---|---|---|
| `--skip <ids>` | comma-separated, repeatable | `flags.skip: string[]` (dedup, argument order; `[]` when absent) | id outside `skippableSectionIds()` → stderr `setup-prepare: --skip: unknown section id(s): <a, b>. Valid: <ids>` and exit 1 |
| `--unset-only` + `--force` | booleans | `defaultSelectionMode: 'all'`, `menuInputContract.defaultToken: 'all'` (was `'not-set'`) | — |

  `parseArgs` change (inside the existing loop and return):

```diff
   let scan = false;
   let scanPrs = false;
+  const skip = [];
 
   for (let i = 0; i < args.length; i++) {
     const a = args[i];
     if (a === '--unset-only') {
       unsetOnly = true;
     } else if (a === '--force') {
       force = true;
     } else if (a === '--scan') {
       scan = true;
     } else if (a === '--scan-prs') {
       scanPrs = true;
+    } else if (a === '--skip' && args[i + 1]) {
+      // --skip <ids> — comma-separated config section ids, repeatable (A2, P-skip).
+      for (const id of args[i + 1].split(',').map(s => s.trim()).filter(Boolean)) {
+        if (!skip.includes(id)) skip.push(id);
+      }
+      i++;
     } else if (a === '--steps' && args[i + 1]) {
 ...
   return {
-    flags: { unsetOnly, force, steps, scan, scanPrs },
+    flags: { unsetOnly, force, steps, scan, scanPrs, skip },
     defaultSelectionMode,
   };
```

  New helper next to `applyWhenGates`, and the main-block changes:

```diff
+/**
+ * Config section ids that --skip accepts (A2): rows without a setup-* sub-flow.
+ * @returns {string[]}
+ */
+function skippableSectionIds() {
+  return SETUP_SECTIONS
+    .filter(s => !String(s.delegatedTo || '').startsWith('setup-'))
+    .map(s => s.id);
+}
 ...
     const parsed = parseArgs(process.argv);
+    const validSkip = skippableSectionIds();
+    const unknownSkip = parsed.flags.skip.filter(id => !validSkip.includes(id));
+    if (unknownSkip.length > 0) {
+      process.stderr.write(`setup-prepare: --skip: unknown section id(s): ${unknownSkip.join(', ')}. Valid: ${validSkip.join(', ')}\n`);
+      process.exit(1);
+    }
     result.flags = parsed.flags;
 ...
     result.menuInputContract = {
       ...MENU_INPUT_CONTRACT,
-      defaultToken: parsed.flags.unsetOnly ? 'not-set' : 'all',
+      defaultToken: parsed.defaultSelectionMode === 'unset-only' ? 'not-set' : 'all',
     };
 ...
```

  JSDoc of `parseArgs` (`setup.js:474-483`): replace "`--skip`, `--only`, sub-flow direct-entry flags) is parsed by SKILL.md" with "`--only`, sub-flow direct-entry flags) is parsed by SKILL.md. `--skip <ids>` fills `flags.skip` (A2, P-skip)"; add `skip: string[]` to the `@returns` flags type.

  `setup-sections.js` ship `purpose`:

```diff
-    purpose: 'Developer-local pipeline preferences for /ship-sdlc: which steps run by default, default version bump, draft-PR mode, auto-approve, workspace isolation, rebase policy, and review-failure threshold. Stored in .sdlc/local.json (gitignored) so each developer can tune the pipeline without affecting teammates.',
+    purpose: 'Developer-local pipeline preferences for /ship-sdlc: which steps run by default, quick mode, default version bump, draft-PR mode, auto-approve, rebase policy, review-failure threshold, and the verify-pipeline and await-remote-review timings. Stored in .sdlc/local.json (gitignored) so each developer can tune the pipeline without affecting teammates.',
```

  Exec cases, appended after the `#337` `defaultToken === 'not-set'` case (each uses `script_path: "repo://plugins/sdlc-utilities/scripts/skill/setup.js"`, `script_cwd: "{{project_root}}"`):

| description | project_root | script_args | javascript assert |
|---|---|---|---|
| `setup-prepare (#9361): --unset-only --force → menuInputContract.defaultToken === 'all'` | `file://fixtures-fs/project-setup-empty` | `--unset-only --force` | `out.menuInputContract.defaultToken === 'all' && out.defaultSelectionMode === 'all'` |
| `setup-prepare (#9361): --skip ship,jira --skip ship → flags.skip deduplicated` | `file://fixtures-fs/project-setup-empty` | `--skip ship,jira --skip ship` | `JSON.stringify(out.flags.skip) === '["ship","jira"]'` |
| `setup-prepare (#9361): no --skip → flags.skip is []` | `file://fixtures-fs/project-setup-empty` | (none) | `Array.isArray(out.flags.skip) && out.flags.skip.length === 0` |
| `setup-prepare (#9361): --skip with a sub-flow id exits with an error naming it` | `file://fixtures-fs/project-setup-empty` | `--skip plan-template` | `output.includes('unknown section id(s): plan-template') && output.includes('received-review')` (no `JSON.parse`) |
| `setup-prepare (#9361): ship purpose names real fields, no workspace` | `file://fixtures-fs/project-setup-empty` | (none) | `const p = out.sections.find(s => s.id === 'ship').purpose; return !/workspace/i.test(p) && p.includes('rebase policy')` |

- names: `flags.skip`, `skippableSectionIds` (module-private, not exported; the exec cases run the CLI), `menuInputContract.defaultToken`, `defaultSelectionMode`.
- mirror: `--steps` branch at `plugins/sdlc-utilities/scripts/skill/setup.js:502-509`; exec case shape at `tests/promptfoo/datasets/setup-prepare-exec.yaml:257-267`.
- decisions: see `## Key Decisions` (script validates; config set computed from `SETUP_SECTIONS`; `defaultToken` follows `defaultSelectionMode`).
- sync: spec A2, R-walk-1, P-skip (Task 1); SKILL.md Step 0 and Phase 4 (Task 3); docs ship row (Task 4) uses the same field list.

### Task 3: SKILL.md — flags truth and `--skip` subtraction

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** lint, manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — frontmatter, arguments table, Step 0 skip subtraction, Step 1 bypass line and Phase 4, Step 2 v1 wording, Idempotency

**Notes:** Implements A2/P-skip (M-3 skill half), A3 (M-18), A8a (M-19), P6a (X3). SKILL.md never parses `--skip` itself; it reads `prepare.flags.skip` (C8-C10). Keep the subtraction text in one place (Step 0) and point to it from Phase 4 (`dry`). Step 0's exit handling (`SKILL.md:62`, "Read the JSON … If exit code != 0, display the error and stop") must also cover Task 2's unknown `--skip` exit: on a non-zero exit with no output path on stdout, show the command's stderr verbatim and stop, without reading a JSON file. Cites F-setup-spec-and-skillmd-drift-1, -2, -3, -4, -7, -8, -13.

**Acceptance criteria:**
- [ ] Frontmatter `description` and `argument-hint` both contain `[--unset-only]` directly after `[--force]`.
- [ ] The arguments table has a `--unset-only` row, and the `--force` and `--skip` rows read as below.
- [ ] `grep -n "unless \`--force\`\|version: 2\|v2 format" plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` prints nothing.
- [ ] Step 1's "Direct-entry flag bypass" sentence no longer lists `--force`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` report no new error for setup-sdlc.

**Contract:**
- shape (code): SKILL.md edits, each a full replacement:

| place | before | after |
|---|---|---|
| frontmatter `description` and `argument-hint` | `[--force] [--only <ids>]` | `[--force] [--unset-only] [--only <ids>]` |
| args `--skip` row | `` \| `--skip <section>` \| Skip a config section during setup. Valid values: `version`, `ship`, `jira`, `review`, `received-review`, `commit`, `pr` \| none \| `` | `` \| `--skip <section>` \| Skip config sections (comma-separated or repeated). Valid values: `version`, `ship`, `jira`, `review`, `received-review`, `commit`, `pr`. `skill/setup.js` validates them into `prepare.flags.skip`; Step 0 removes them from the resolved selection. Locked legacy rows are not removed \| none \| `` |
| args `--force` row | `` \| `--force` \| Pre-check every menu row (reconfigure everything) instead of selecting only `not-set` rows \| off \| `` | `` \| `--force` \| Skip the per-field `keep` prompt so every value is reconfirmed. Does not change menu pre-selection and does not skip the menu \| off \| `` |
| args, ADD row after `--force` | — | `` \| `--unset-only` \| Pre-check only `not-set` rows; the default menu reply becomes `not-set` (`prepare.menuInputContract.defaultToken`). `--force` wins when both are passed \| off \| `` |
| Step 1 bypass line `:107` | `` When `--only`, `--force`, `--dimensions`, `` | `` When `--only`, `--dimensions`, `` |
| Step 2 v1 bullet `:181` | `or lacks the top-level \`version: 2\` stamp (\`localIsV1\` from prepare output)` | `or has a \`ship\` section but neither a top-level \`schemaVersion\` nor a legacy \`version\` stamp (\`localIsV1\` from prepare output)` |
| Step 2 prompt `:190` | `uses a v1 schema (missing \`version: 2\`, or has legacy \`preset\`/\`skip\` keys). Migrate to v2 format?` | `uses a v1 schema (no \`schemaVersion\` stamp, or legacy \`preset\`/\`skip\` keys). Migrate to the current schema?` |
| Idempotency `:511` | `Already-configured sections are skipped unless \`--force\` is passed.` | `Every run offers every section again: all rows are pre-checked by default, and \`--unset-only\` pre-checks only \`not-set\` rows. \`--force\` only skips the per-field \`keep\` prompt.` |

  Step 0, ADD paragraph directly after the paragraph that ends "Pass through `--add`, `--no-copilot`, and `--remove-openspec` to the relevant sub-flow when invoked.":

```markdown
**Skip subtraction (implements A2, P-skip):** After `selectedIds` resolves (from `--only` here, or from Step 1 Phase 4), remove every id in `prepare.flags.skip` whose row has `section.locked === false`. For a locked id, print one line: `--skip <id> ignored — section is locked (migration required).` If `selectedIds` is then empty, print `No sections selected — no changes made.` and jump to Step 4. Do not parse `--skip` from the arguments yourself; `prepare.flags.skip` is the only source.
```

  Step 1 Phase 4, the last line:

```diff
-Store the resolved section ids as `selectedIds`. Defer migration and field collection to Step 2 / Step 3.
+Store the resolved section ids as `selectedIds`, then apply the Step 0 skip subtraction. Defer migration and field collection to Step 2 / Step 3.
```

- names: `prepare.flags.skip`, `selectedIds`, `prepare.menuInputContract.defaultToken`, heading text `**Skip subtraction (implements A2, P-skip):**`.
- mirror: the Step 0 flag-routing paragraph at `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md:87-89`.
- decisions: locked rows win over `--skip` (Deviations row); one subtraction rule, referenced from Phase 4.
- sync: spec A2, A3, P-skip (Task 1); `flags.skip` from Task 2; doc rows (Task 4) say the same thing.

### Task 4: User doc truth

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual, lint

**Files:**
- Modify: `docs/skills/setup-sdlc.md` — Usage `--skip` example and id list, Flags rows, Prerequisites script name, Sections table rows, schemaVersion mentions

**Notes:** Implements M-6 (doc half), M-7, M-17, M-8 (doc half), X2, and the user-facing half of M-3. The ship row wording must match the Task 2 `purpose` string field for field; both texts are pinned in this plan, so Task 4 does not wait for Task 2. Cites F-setup-docs-and-site-copies-1 to -6.

**Acceptance criteria:**
- [ ] `grep -n "schemaVersion: 3\|setup-prepare.js\|workspace" docs/skills/setup-sdlc.md` prints nothing.
- [ ] The Sections table has a `received-review` row between `review` and `commit`.
- [ ] The Usage id list at the "Skip the menu" paragraph contains `plan-template`, in the same order as the `--only` flag row.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` reports no new error for setup-sdlc.

**Contract:**
- shape (docs): MODIFY in place; audience: end users; no new sections.

| place | before | after |
|---|---|---|
| Usage id list `:23` | `` `review-dimensions`, `pr-template`, `plan-guardrails`, `` | `` `review-dimensions`, `pr-template`, `plan-template`, `plan-guardrails`, `` |
| Usage, ADD block after the `--force` paragraph (`:29`) | — | a `text` fence holding `/setup-sdlc --skip jira,commit`, then the line: `Show the menu as usual, but leave \`jira\` and \`commit\` out of the selection. Only config section ids are accepted; an unknown id stops setup with an error.` |
| Flags `--migrate` `:37` | `to bring both project + local configs to \`schemaVersion: 3\`` | `to bring both project + local configs to the current \`schemaVersion\` (4 at the time of writing)` |
| Flags `--skip` `:38` | `` \| `--skip <section>` \| Skip a config section during setup (version, ship, jira, review, received-review, commit, pr) \| — \| `` | `` \| `--skip <section>` \| Skip config sections, comma-separated or repeated (version, ship, jira, review, received-review, commit, pr). They are removed from the menu or `--only` selection; locked legacy sections stay. An unknown id stops setup with an error. \| — \| `` |
| Prerequisites `:147` | `` - Node.js >= 16 (for `setup-prepare.js`) `` | `` - Node.js >= 16 (for `scripts/skill/setup.js`) `` |
| Sections `ship` `:158` | `steps, default bump, draft PRs, auto-approve, workspace, rebase policy, review threshold.` | `steps, quick mode, default bump, draft PRs, auto-approve, rebase policy, review threshold, and verify-pipeline / await-remote-review timings.` |
| Sections, ADD row after `review` | — | `` \| `received-review` \| Per-user severity allowlist for `/received-review-sdlc` auto-apply: "agree, will fix" findings at a listed severity skip the per-finding consent gate. Stored in `.sdlc/local.json` under `receivedReview.alwaysFixSeverities`; default `[]`. \| `.sdlc/local.json` \| `/received-review-sdlc` \| `` |
| Created files `:329` | `Carries top-level \`schemaVersion: 3\` (issue #232).` | `Carries the current top-level \`schemaVersion\` (4 at the time of writing; issue #232).` |
| Created files `:330` | `Carries top-level \`schemaVersion: 3\`.` | `Carries the current top-level \`schemaVersion\`.` |

- names: Sections row `received-review`; Usage example `/setup-sdlc --skip jira,commit`.
- mirror: the `review` Sections row at `docs/skills/setup-sdlc.md:160`; the `--only` Usage block at `docs/skills/setup-sdlc.md:19-23`.
- decisions: user-facing prose only; field names match `ship-fields.js` and `setup-sections.js`.
- sync: `site/src/content-source/skills/setup-sdlc.md` (Task 5).

### Task 5: Site copies and main-session validators

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Verify:** lint

**Files:**
- Modify: `site/src/content-source/specs/setup-sdlc.md` — byte copy of `docs/specs/setup-sdlc.md`
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy of `docs/skills/setup-sdlc.md`
- Create: `docs/plans/2026-11-11-lean-M1-setup-spec-docs-truth.md`

**Notes:** Implements verdict item "site copies"; cites F-setup-docs-and-site-copies-1 to -6 (the doc edits these copies mirror) and the brief's copy check. Copy only these two files with `cp`; do not run `copy-docs.mjs`, which copies the whole tree. The plan file is listed because the wave brief requires it under the last task, so ship stages it with the rest. Standard, not Trivial: three files plus the five-validator run.

**Acceptance criteria:**
- [ ] `cmp docs/specs/setup-sdlc.md site/src/content-source/specs/setup-sdlc.md` and `cmp docs/skills/setup-sdlc.md site/src/content-source/skills/setup-sdlc.md` both exit 0.
- [ ] These five commands exit 0: `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`, `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`, `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern setup-prepare` passes 30 of 30 (one run).

**Contract:**
- shape (docs): two byte copies:

```bash
cp docs/specs/setup-sdlc.md site/src/content-source/specs/setup-sdlc.md
cp docs/skills/setup-sdlc.md site/src/content-source/skills/setup-sdlc.md
```

- names: the two site paths above.
- mirror: the current byte-identical state of both pairs at HEAD `f4862bb`.
- decisions: per-file `cp`, not `copy-docs.mjs`.
- sync: `docs/specs/setup-sdlc.md` (Task 1), `docs/skills/setup-sdlc.md` (Task 4).

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds 5 exec cases; Task 1 fixes the stale rubric and adds a --skip behavioural case |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled |
| no-auto-eval | error | PASS | One targeted exec-only run, no retry loop; no behavioural runs |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a verdict item; non-goals are listed |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable: spec, script, SKILL.md, doc, sync |
| scripts-over-llm-logic | error | PASS | --skip is parsed and validated in setup.js; SKILL.md only subtracts |
| yagni | warning | PASS | Only the 7 config ids are accepted; nothing speculative is added |
| cross-skill-consistency | error | PASS | No other skill reads flags.skip; ship-sdlc files are untouched |
| pr-link-github-issue | error | PASS | The PR body names #9361 |
| dry | warning | PASS | The valid id set is computed from SETUP_SECTIONS; the skip rule lives only in Step 0 |
| kiss | warning | PASS | Smallest change: one parse branch, one helper, one derived token |
| spec-first | error | PASS | Task 1 (spec) precedes Tasks 2-4, which depend on it |
| project-agnostic | error | PASS | Changes are in plugin code, SKILL.md and docs, not repo-local config |
| flag-coherence-cross-skill | error | PASS | SKILL.md cites prepare.flags.skip and menuInputContract.defaultToken |
| no-opposite-logical-vectors | error | PASS | One skip-subtraction gate, referenced from Phase 4 |
| flag-resolution-single-source | warning | PASS | setup.js is the only place --skip is resolved |
| state-premise | error | PASS | The root problem is stated in one sentence in Key Decisions |
| smallest-viable-cut | warning | PASS | Plan states that every task maps to a verdict item |
| failure-audience | warning | PASS | Names developers running --skip and the driving model |
| explicit-non-goals | warning | PASS | Non-goals are listed in Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded with rationale in Deviations and Key Decisions |
| state-machine-idempotency | error | PASS | No migration or preflight logic is modified; repeated --skip is tested |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence given: only ship.js:126 uses --skip, as a refused removed flag |
| workspace-mode-compatibility | error | PASS | The plan states there is no path, state or git change, so both modes behave the same |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 3 edits the SKILL.md frontmatter `argument-hint` and arguments table (`--skip`, `--force`, `--unset-only`), and Task 4 mirrors those flag rows in `docs/skills/setup-sdlc.md`.

**Severity hint:** high

**Patch:** Check that the SKILL.md frontmatter, `argument-hint` and arguments table, the `docs/skills/setup-sdlc.md` Flags rows and the site copies all state the same `--skip`, `--force` and `--unset-only` contract.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the SKILL.md frontmatter, `argument-hint` and arguments table, the `docs/skills/setup-sdlc.md` Flags rows and the site copies all state the same `--skip`, `--force` and `--unset-only` contract.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 2 adds the `--skip` flag and the `flags.skip` output field in `plugins/sdlc-utilities/scripts/skill/setup.js`, and changes `menuInputContract.defaultToken` under `--unset-only --force`.

**Severity hint:** high

**Patch:** Check that the new `--skip <ids>` CLI flag, `flags.skip` output field and exit-1 unknown-id error in `skill/setup.js` are covered by the runtime contract and that `defaultToken` follows `defaultSelectionMode`.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the new `--skip <ids>` CLI flag, `flags.skip` output field and exit-1 unknown-id error in `skill/setup.js` are covered by the runtime contract and that `defaultToken` follows `defaultSelectionMode`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: spec-compliance (B1)

**Why:** Task 3 gives `--skip` real behaviour in SKILL.md, and Task 1 changes spec A2 and adds P-skip in `docs/specs/setup-sdlc.md`, so the skill and the spec must stay aligned.

**Severity hint:** high

**Patch:** Check that SKILL.md Step 0 skip subtraction cites spec A2 and P-skip, and that the `--force` and `--unset-only` wording matches A3 and R-walk-1.

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — Check that SKILL.md Step 0 skip subtraction cites spec A2 and P-skip, and that the `--force` and `--unset-only` wording matches A3 and R-walk-1.

_1 additional candidates suppressed_

## Final Shape

The setup-sdlc spec, SKILL.md and user doc now agree with the code.

`/setup-sdlc --skip jira,commit` shows the menu as usual and leaves those two sections out of the selection. The prepare script checks the ids. A typo, or a sub-flow id such as `plan-template`, stops setup before any prompt, with an error that lists the valid ids. A locked legacy section is never skipped.

`--force` is described as what it is: it only skips the per-field `keep` prompt. `--unset-only` is in the SKILL.md frontmatter and arguments table. With both flags, the menu default is `all`, in every field of the prepare output.

The spec names the `received-review` section, describes the local v1 check by `schemaVersion`, and refers to the schema version as `CURRENT_SCHEMA_VERSION` (4 at the time of writing). The ship menu text no longer mentions workspace isolation. The user doc has a `received-review` row, the right script name and the full `--only` id list. The site mirrors are byte copies of the docs. Five new exec cases guard the script changes.

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
| 1 M-18 --force wording | Task 3 | covered |
| 2 M-3 --skip | Task 1, Task 2, Task 3, Task 4 | covered |
| 3 M-8 schema version | Task 1, Task 4 | covered |
| 4 M-4 received-review in spec | Task 1 | covered |
| 5 M-19 --unset-only | Task 3 | covered |
| 6 M-6 ship purpose | Task 2, Task 4 | covered |
| 7 M-7 plan-template id | Task 4 | covered |
| 8 M-17 script name | Task 4 | covered |
| 9 X1 defaultToken | Task 1, Task 2 | covered |
| 10 X2 Sections row | Task 4 | covered |
| 11 X3 version: 2 wording | Task 1, Task 3 | covered |
| 12 Site copies | Task 5 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
