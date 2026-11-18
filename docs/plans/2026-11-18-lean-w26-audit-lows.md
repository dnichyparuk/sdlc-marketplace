# Audit 97-101 Defects and Deferred Lows Implementation Plan

**Commit:** `fix(#9404): tests, docs - audit 97-101 defects, deferred lows`
**Goal:**
- Fix nine small defects that the audit of PRs #97 to #101 found (#9396 to #9403, plus deferred lows D1, D2, D3, D6 and D7).
- The root problem: text in tests, test scripts and docs no longer matches what the code and the specs do, so readers and reviewers are told something false.
- Change no skill behaviour.

**Architecture:** Seven independent tasks, one per file group, all in one execute wave. Four tasks are one-line text fixes. Two tasks change a test script and the exec case that checks it in the same task. One task adds one accepted gap to the R90 text of the execute-plan-sdlc spec and of the hooks README.
**Source:** conversation context (wave brief #9404, items 1 to 9, architect-accepted batch)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

Some text in the repository says something that is no longer true.

- An agent file says the skill deletes the review manifest. The spec says the manifest is kept.
- Two behavioural test cases name the old config path `.claude/sdlc.json`. The skills now write `.sdlc/config.json`.
- A skill cites the wrong spec rule id.
- Two small test scripts (lint checks for the test datasets) have a header comment that claims more than the code does, or report a wrong error text.
- One test wrapper script ignores a failed child-process start.
- The worker write guard (a hook that stops execute workers from writing files through the shell) has one bypass that its docs do not list.

**What prompted this change now?**

An isolated Opus architect audited PRs #97 to #101 at f798895. It found these items and validated them as one batch. The owner delegated acceptance to the architect (2026-11-10).

**What does success look like?**

- Every item's text matches the code and the spec it describes.
- The two changed test scripts have exec cases that prove the new behaviour.
- The exec suite and the five project validators stay green.

**Items dropped:** none. Each item was re-checked at HEAD c7e76ec (see Research Findings). The discovery brief marked items 6 (#9401) and 7 (#9402) as not reproduced. Both were re-checked by hand and are kept (Key Decisions 1 and 2).

## Research Findings

Each item was re-verified at HEAD c7e76ec. The evidence is below.

**Item 1, #9396.** `plugins/sdlc-utilities/agents/review-orchestrator.md:78` reads "Delete `manifest.diff_dir` or the manifest file — the skill cleans both up". The spec says the opposite. `docs/specs/review-sdlc.md:55` (R8) says "the manifest file is kept (G3)", and `:110` (G3) says the manifest persists under `.sdlc/execution/out/` (F-review-orchestrator-manifest-wording-1). No other file holds this wording, and the spec needs no change (F-review-orchestrator-manifest-wording-2, -6).

**Item 2, #9397.** `tests/promptfoo/datasets/setup-sdlc.yaml:295-296` says the fixture has "an existing .claude/sdlc.json". The injected prepare row at `:300` says `"configFile":".sdlc/config.json"` (F-sdlc-config-path-dataset-renames-1, -2). The fixture file is `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.claude/sdlc.json`. It is tracked, not ignored, and `setup.sh` uses `git add -A`, so a move does not break it (F-sdlc-config-path-dataset-renames-3, -4). `:295` is the only reference to this fixture (F-sdlc-config-path-dataset-renames-5).

**Item 3, #9398.** `plugins/sdlc-utilities/hooks/worker-write-guard.js:378` is `if (args.includes('--dry-run')) continue;`. Any `--dry-run` word allows the command, also after a bare `--` or as the value of an option (F-worker-write-guard-dry-run-gap-docs-1). The R90 text moved by one line after PR #102: it is now at `docs/specs/execute-plan-sdlc.md:202`, not `:201`. Its accepted-gaps sentence ends with "and an ANSI-C `$'...'` quoted word before the subcommand." (F-worker-write-guard-dry-run-gap-docs-2). `plugins/sdlc-utilities/hooks/README.md:7` has the same sentence (F-worker-write-guard-dry-run-gap-docs-3). The latest R90 appendix row is `:443` (#9387) (F-worker-write-guard-dry-run-gap-docs-4). `site/src/content-source/specs/execute-plan-sdlc.md` is byte-identical to the spec today; the README has no site copy (F-worker-write-guard-dry-run-gap-docs-5). The only dry-run test is case (l13) in `worker-write-guard-exec.yaml`, and a docs-only fix needs no test change (F-worker-write-guard-dry-run-gap-docs-8).

**Item 4, #9399.** `tests/promptfoo/datasets/harden-sdlc.yaml:228` reads "Suppose the project has no .claude/sdlc.json". `:255` reads ".claude/sdlc.json nor the review-dimensions files are changed." (F-sdlc-config-path-dataset-renames-7, -8). harden-sdlc writes `<MAIN_ROOT>/.sdlc/config.json` (`plugins/sdlc-utilities/skills/harden-sdlc/SKILL.md:219`; F-sdlc-config-path-dataset-renames-11).

**Item 5, #9400 with D2 and D3.** In `tests/promptfoo/scripts/check-fixture-refs.js`:

- `:24` claims "--probe-missing proves that the scan reports a missing fixture and a missing dataset". But `probeMissing()` (`:65-72`) writes both datasets, so no dataset is missing (F-fixture-guard-scripts-hardening-1).
- The config loop (`:36-42`) has no comment-line skip. The dataset loop has one at `:50` (F-fixture-guard-scripts-hardening-2).
- `:40` writes `{ dataset: config, ... }`: the key says "dataset" for a config file name (F-fixture-guard-scripts-hardening-3).
- The only consumer of that record is case (b) of `tests/promptfoo/datasets/fixture-guard-exec.yaml:43-49`. Its `missing` join uses `m.dataset` and an exact expected string (F-fixture-guard-scripts-hardening-4).
- Case (a) floors (`configs === 2`, `datasets >= 19`, `refs >= 316`, `:41`) do not change: no real config has a commented dataset line (grep at HEAD).
- Today `--probe-missing` prints `{"ok":false,"configs":2,"datasets":2,"refs":3,"missing":[{"dataset":"datasets/a.yaml","line":3,"ref":"fixtures/absent.md"},{"dataset":"datasets/b.yaml","line":2,"ref":"fixtures-fs/absent-dir"}]}`.

**Item 6, #9401.** `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md:35` ends its "Every other token is the request" sentence with "never put it in a Bash call (C14)". That rule is C21 (`docs/specs/github-sdlc.md:266`: "Must not put `$ARGUMENTS` or request text into a Bash call"). C14 (`:252`) is the rule about issue bodies in shell arguments. The same line starts with "**Flags (A14, C21).**", which is correct; the brief's F-review-orchestrator-manifest-wording-4 read only that start.

**Item 7, #9402.** `tests/promptfoo/datasets/review-sdlc.yaml:240` is "# Must NOT re-dispatch any agent to post the comment". In this file, each "# Must NOT ..." comment sits directly above the assertion that enforces it. `:240` sits above another comment (`:241`, "# Behavioral: one gh api call, zero agent re-dispatch, ...") and the `llm-rubric` at `:242`. The assertion it once labelled was deleted, and `:241` already states the rule (F-review-orchestrator-manifest-wording-5).

**Item 8, #9403 with D6 and D7.** In `tests/promptfoo/scripts/check-dataset-regex.js`:

- `:21` says "(all 320 are)". This is a count that goes stale; the floor lives in `dataset-regex-exec.yaml:8` as `checked >= 300` (F-fixture-guard-scripts-hardening-5).
- `:33` tests `/^([|>][-+0-9]*)?$/`, which also matches an empty string. So an empty `value:` is reported as "block scalar not supported" (F-fixture-guard-scripts-hardening-6).
- `:61` skips a missing dataset with no report and no header note (F-fixture-guard-scripts-hardening-7).
- Case (b) at `dataset-regex-exec.yaml:16` asserts `checked === 4` and the join `'datasets/a.yaml:3,datasets/b.yaml:3'`.

**Item 9, D1.** `tests/promptfoo/scripts/run-plan-explore-check-brief.js:30-35` calls `spawnSync` and prints `r.status`, `r.stdout` and `r.stderr` without a check of `r.error`. A failed start prints `{"status":null,...}` and exits 0 (F-fixture-guard-scripts-hardening-8). The four cases that use the wrapper (`plan-prepare-exec.yaml:1131-1177`) test the success shape only. A spawn-error case would need a node-override hook (F-fixture-guard-scripts-hardening-9).

**Copy rule.** `.sdlc/config.json` `plan.copyRules` fires when a plan changes `docs/specs/<skill>.md` or `plugins/sdlc-utilities/skills/<skill>/SKILL.md`. It then needs the skill's user doc, its site copy, `site/src/data/skills-meta.ts` and the skill's companion `.md` files to be listed in some task's **Files:** (F-worker-write-guard-dry-run-gap-docs-6). Tasks 3 and 5 trigger it. They list those files as "check only", like the w24 and w25 plans.

**Commands.**

- Exec run: the command in the header **Verification:** line, with a `--filter-pattern` per task.
- Spec shape: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`.
- Byte copy: `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`. Never run `site/scripts/copy-docs.mjs`: it copies the whole tree, including this untracked plan file.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item 6 (#9401) kept | no | changes the final `(C14)` on SKILL.md:35 to `(C21)` | the discovery brief said not reproduced, but it read only the line's start; the end of the line still cites C14 |
| Item 7 (#9402) kept | no | deletes review-sdlc.yaml:240 | the brief called it redundant, not orphan; the architect's fix stands, because `:241` already states the rule |
| R90 line number | no | edits the R90 text at spec `:202` | the brief named `:201`; PR #102 shifted it by one line |
| Test case for item 8 | no | adds an empty `value:` to the `--probe-invalid` tree and updates case (b) | the test-coverage-required guardrail needs a test for the new `empty value` report; the brief named no test |
| No test case for item 9 | no | adds no case | the brief forbids a new case in plan-prepare-exec.yaml; a spawn-error case would need a node-override hook |
| Check-only copy entries | no | Tasks 3 and 5 list user docs, site copies, skills-meta.ts and skill directories with no edit expected | `plan.copyRules` requires them once a spec or SKILL.md changes |

## Decisions taken without the owner

These are the decisions the planner took because no owner was available. Each one took the recommended or narrowest option.

1. Keep item 6 (#9401). The brief's "not reproduced" is a misread (see Research Findings).
2. Keep item 7 (#9402). The architect's fix is safe and the line is redundant.
3. Add an `empty value` probe entry to `check-dataset-regex.js` and update case (b). Without it, the new report has no test.
4. Leave the other stale `.claude/sdlc.json` phrases in `setup-sdlc.yaml` (`:179`, `:184`, `:201`, `:212`, `:235`, `:267`, `:326`) and the regex alternative at `harden-sdlc.yaml:268`. The brief names only items 2 and 4 and says to leave `:267` and `:326` alone.
5. Leave the config loop of `check-dataset-regex.js` (`:51-55`) without a comment-line skip. The brief scopes D3 to `check-fixture-refs.js` only.
6. Item 8 states the missing-dataset skip as an accepted gap. It does not add a report, as the brief decided.

## Key Decisions

- **Docs-only fix for #9398, not a code fix.** The guard is a best-effort filter, and the `expectedFiles` cross-check (R44) is the backstop. A code fix needs new parse rules and tests. The architect decided docs only, so the gap goes into the accepted-gaps list.

- **Smallest viable cut.** Each task fixes one audit item group and nothing more. No extra task is added beyond the nine items.

- **`config` key for a missing config reference, `dataset` key for a missing fixture reference.** A record keeps one key that names its file kind. The alternative was one generic `file` key. That would change the record shape for every consumer. The only consumer is case (b), which joins with `(m.config || m.dataset)`.

- **The comment-line probe goes into `promptfooconfig.yaml` of the temp tree.** The absent dataset goes into `promptfooconfig-headless.yaml`. So one probe run proves both the skip (`datasets === 3`, not 4) and the report (`promptfooconfig-headless.yaml:3:datasets/c.yaml`).

- **`Script error:` on stderr and exit 2 in the wrapper.** The wrapper's marker guard (`:16-18`) uses that form for a script error. `run-gitignore-hook-and-read.js:37-38` prints JSON and exits 1 instead, but exit 1 is a valid check result in these cases.

- **Who fails if this ships wrong.** Dataset authors and reviewers. A wrong probe or case string makes the exec suite fail in the main-session PR validation. No skill behaviour changes, so users of the plugin are not affected.

- **Task 2 groups three dataset items.** Items 2, 4 and 7 are one-line text fixes in behavioural datasets. The architect's grouping puts them in one task with one deliverable: the behavioural datasets agree with the current config path and carry no stray comment. Three separate tasks would cost three worker dispatches for about five changed lines.

- **Tracking ids are internal register ids, not GitHub issues.** `#9396` to `#9404` live in the project's register. The PR body names them with no `Fixes` or `Closes` keyword, so the pr-link-github-issue guardrail has no GitHub issue to link.

- **No workspace-mode impact.** The tasks change test scripts, test data and docs. They touch no state file, config reader or git operation, so branch and worktree mode behave the same.

- **Non-goals.** No code fix for #9398. No change to the floors in `fixture-guard-exec.yaml` (deferred low D5, dropped: the floors are intentional). Not the three lost w24 lows. No skill behaviour change. No behavioural or headless run. Not the out-of-scope stale phrases in Decisions 4 and 5.

## Contract Examples

Code (Task 4):

```markdown
**Contract:**
- shape (code): `scanRefs(root)` config loop skips a line whose `trimStart()` starts with `#`; a missing config reference is `{ config, line, ref }`.
- names: `scanRefs`, `probeMissing`, record key `config`.
- mirror: dataset-loop skip at `tests/promptfoo/scripts/check-fixture-refs.js:50`.
- decisions: Key Decision 3.
- sync: `tests/promptfoo/datasets/fixture-guard-exec.yaml` case (b) joins with `(m.config || m.dataset)`.
- example: probe output gains `{"config":"promptfooconfig-headless.yaml","line":3,"ref":"datasets/c.yaml"}` first.
```

Docs (Task 1):

```markdown
**Contract:**
- shape (docs): MODIFY `plugins/sdlc-utilities/agents/review-orchestrator.md` line 78 of its DO-NOT list (audience: the orchestrator agent).
- names: the DO-NOT bullet about `manifest.diff_dir`.
- mirror: R8 at `docs/specs/review-sdlc.md:55`.
- decisions: cite R8 and G3 by id.
- sync: none; no other file holds the wording.
```

Openspec / spec (Task 3):

```markdown
**Contract:**
- shape (openspec): MODIFY `R90` in `docs/specs/execute-plan-sdlc.md` (accepted-gaps sentence gains one item); ADD one appendix row; no new id.
- names: `R90` (modified).
- mirror: the accepted-gaps sentence at `docs/specs/execute-plan-sdlc.md:202` and appendix row `:443`.
- decisions: issue number only in the appendix (spec-shape rule).
- sync: `site/src/content-source/specs/execute-plan-sdlc.md` byte copy; `plugins/sdlc-utilities/hooks/README.md:7`.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 4 and 6 update exec cases; Task 7 is a test helper whose success shape is covered by 4 existing cases (no new case, reason stated) |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the nine audit items; the empty-value probe is justified in Decisions 3 |
| single-responsibility-tasks | warning | FAIL | Task 2 bundles three items (#9397, #9399, #9402) across three datasets and a fixture rename |
| scripts-over-llm-logic | error | PASS | Changes are deterministic text and script fixes; no new LLM logic |
| yagni | warning | PASS | No speculative abstractions; the gap is documented, not coded |
| cross-skill-consistency | error | PASS | Spec, README and site copy are synced; the github-sdlc citation matches its spec |
| pr-link-github-issue | error | PASS | Plan states the #93xx ids are internal register ids, not GitHub issues |
| dry | warning | PASS | No duplicated logic; the README mirrors the spec sentence by design |
| kiss | warning | PASS | Smallest edits (one-line fixes, small script tweaks) |
| spec-first | error | PASS | Task 3 updates the spec; Task 5 is a citation fix, not a behaviour change |
| project-agnostic | error | PASS | Edits are to the plugin's own tests, docs and hooks README; no consumer-facing repo-local config |
| flag-coherence-cross-skill | error | PASS | No flag gating changes |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate phrasing is introduced |
| flag-resolution-single-source | warning | PASS | No flag resolution is touched |
| state-premise | error | PASS | Context and Goal state the root problem: text no longer matches code and specs |
| smallest-viable-cut | warning | PASS | Key Decisions states the smallest cut; each task maps to an audit item |
| failure-audience | warning | PASS | Key Decisions names dataset authors, reviewers and PR validation |
| explicit-non-goals | warning | PASS | Non-goals listed in Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described |
| flag-semantic-consistency-cross-skill | error | PASS | No new prepare-script flag is added (only probe flags already existing) |
| workspace-mode-compatibility | error | PASS | Plan states there is no state, config or git impact, so both modes behave the same |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompt content is changed |

## Suggested Review Dimensions

### UPDATE: security-review (U3, U5, U1)

**Why:** Task 2 moves `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.claude/sdlc.json` to `.sdlc/config.json`, and Task 3 edits the worker write guard accepted gaps in `plugins/sdlc-utilities/hooks/README.md`, so security-review triggers may need a path check.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/fixtures-fs` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — update triggers naming `tests/promptfoo/fixtures-fs` after the rename

### UPDATE: spec-compliance (U3)

**Why:** Task 3 edits R90 in `docs/specs/execute-plan-sdlc.md` and Task 5 changes the rule citation on `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` line 35 from (C14) to (C21), so spec-compliance triggers for those paths should be checked.

**Severity hint:** high

**Patch:** update triggers naming `docs` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — update triggers naming `docs` after the rename

### UPDATE: test-quality (U3)

**Why:** Tasks 4 and 6 change the `--probe-missing` and `--probe-invalid` outputs and the exec cases in `fixture-guard-exec.yaml` and `dataset-regex-exec.yaml`, so test-quality triggers should cover these doc and skill paths as well.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/fixtures` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/fixtures` after the rename

_3 additional candidates suppressed_

## Tasks

### Task 1: Review orchestrator manifest wording (#9396)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — line 78 says the manifest file is kept

**Notes:** Findings F-review-orchestrator-manifest-wording-1, -2, -6. The skill already keeps the manifest (R8, G3, review-sdlc SKILL.md:160); only the agent's DO-NOT text is wrong.

**Acceptance criteria:**
- [ ] Line 78 reads exactly as the "after" line below.
- [ ] `grep -n "cleans both up" plugins/sdlc-utilities/agents/review-orchestrator.md` prints nothing.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): one-line replace in the DO-NOT list, as rendered below.
- names: DO-NOT bullet for `manifest.diff_dir`.
- mirror: R8 at `docs/specs/review-sdlc.md:55`; G3 at `:110`.
- decisions: keep "Delete" as the forbidden action; state what the skill does.
- sync: none.

```diff
 - Invoke the `pr-sdlc` skill
-- Delete `manifest.diff_dir` or the manifest file — the skill cleans both up
+- Delete `manifest.diff_dir` or the manifest file — the skill removes `diff_dir`; the manifest file is kept (R8, G3)
 - Dispatch dimension subagents without `model:` or `effort:` — ...
```

### Task 2: Config path and orphan comment in behavioural datasets (#9397, #9399, #9402)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/setup-sdlc.yaml` — line 296 names `.sdlc/config.json`
- Modify: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.sdlc/config.json`
- Modify: `tests/promptfoo/datasets/harden-sdlc.yaml` — lines 228 and 255 name `.sdlc/config.json`
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — delete line 240

**Notes:** Findings F-sdlc-config-path-dataset-renames-1 to -5, -7, -8, -11 and F-review-orchestrator-manifest-wording-5. These are behavioural datasets: verify by review and by the exec lint checks only; never run the behavioural suite. The `.claude` directory is empty after the move, and git does not track empty directories. Leave `setup-sdlc.yaml:267` and `:326`, the other stale phrases and `harden-sdlc.yaml:238` and `:268` unchanged (Decision 4).

**Acceptance criteria:**
- [ ] `git mv tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.claude/sdlc.json tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.sdlc/config.json` was used (run `mkdir -p tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/.sdlc` first in its own call); the file bytes are unchanged (`git diff -M --stat` shows a 100% rename).
- [ ] The three dataset edits match the diffs below; no other line changes.
- [ ] `node tests/promptfoo/scripts/check-fixture-refs.js` exits 0 and `node tests/promptfoo/scripts/check-dataset-regex.js` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs: \(a\)|dataset-regex: \(a\)"` passes.

**Contract:**
- shape (docs): text edits in three YAML datasets and one fixture rename, as rendered below.
- names: case "setup-sdlc Step 1 menu: pr.labels mode=rules with 1 rule ..."; harden-sdlc cases at `:228` and `:255`; review-sdlc post case at `:240`.
- mirror: the prepare row at `setup-sdlc.yaml:300` (`"configFile":".sdlc/config.json"`).
- decisions: Decisions 2 and 4 of Decisions taken without the owner.
- sync: the fixture path in the `project_context` text matches the moved file.

```diff
# tests/promptfoo/datasets/setup-sdlc.yaml
       Project at tests/promptfoo/fixtures-fs/setup-pr-labels-menu-rules/ with an existing
-      .claude/sdlc.json containing
+      .sdlc/config.json containing

# tests/promptfoo/datasets/harden-sdlc.yaml
-      Suppose the project has no .claude/sdlc.json, no review-dimensions/, and no
+      Suppose the project has no .sdlc/config.json, no review-dimensions/, and no
 ...
-        .claude/sdlc.json nor the review-dimensions files are changed.
+        .sdlc/config.json nor the review-dimensions files are changed.

# tests/promptfoo/datasets/review-sdlc.yaml
       value: '-f body="'
-    # Must NOT re-dispatch any agent to post the comment
     # Behavioral: one gh api call, zero agent re-dispatch, cleanup happens after
```

### Task 3: R90 accepted gap for patch --dry-run (#9398)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — R90 accepted gaps gain one item; one appendix row after line 443
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy of the spec
- Modify: `plugins/sdlc-utilities/hooks/README.md` — line 7 accepted gaps gain the same item
- Modify: `docs/skills/execute-plan-sdlc.md` — check only: names no R90 accepted gap, no change expected (copy rule)
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — check only, no change expected (copy rule)
- Modify: `site/src/data/skills-meta.ts` — check only for execute-plan-sdlc and github-sdlc, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc` — check only: its companion `.md` files hold no R90 gap list, no change expected (copy rule)

**Notes:** Findings F-worker-write-guard-dry-run-gap-docs-1 to -8. The guard is a best-effort filter; its threat model and gap list are already in R90, so this task adds the missed gap there (ledger F-73). No code changes, so no test changes (Key Decision 1). The issue number goes only into the appendix row (spec-shape rule). The seven entries exceed the 5-file guide only by check-only files.

**Acceptance criteria:**
- [ ] The spec and README sentences end as rendered below; the rest of each line is unchanged.
- [ ] The appendix row below sits directly after the `#9387` R90 row.
- [ ] `cmp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md` exits 0 (copy made with `cp`, never `copy-docs.mjs`).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (openspec): MODIFY R90's accepted-gaps sentence; ADD one appendix row; no new id; README mirrors the sentence.
- names: `R90`.
- mirror: accepted-gaps sentence at `docs/specs/execute-plan-sdlc.md:202` and `plugins/sdlc-utilities/hooks/README.md:7`; appendix row style at `docs/specs/execute-plan-sdlc.md:443`.
- decisions: docs only (Key Decision 1).
- sync: site spec copy byte-identical; README gap list states the same item.

Spec R90 and README line 7, the end of the accepted-gaps sentence (same text in both):

```diff
-... a git alias defined with `-c alias.*` that hides the `apply` subcommand, and an ANSI-C `$'...'` quoted word before the subcommand.
+... a git alias defined with `-c alias.*` that hides the `apply` subcommand, an ANSI-C `$'...'` quoted word before the subcommand, and a `patch` `--dry-run` word after a bare `--` or as the value of an option (`patch -- --dry-run`, `patch -i --dry-run`), which still allows the command.
```

Appendix row, inserted after `| R90 | git apply options read only before a bare --, bundled -3 short options, patch --output abbreviations, #9387 |`:

```markdown
| R90 | a patch --dry-run word after a bare -- or as an option value recorded as an accepted gap, #9398 |
```

### Task 4: check-fixture-refs missing-dataset probe, comment skip, record key (#9400, D2, D3)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-fixture-refs.js` — config-loop comment skip, `config` record key, probe gains an absent and a commented dataset
- Test: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — case (b) description and assertion

**Notes:** Findings F-fixture-guard-scripts-hardening-1 to -4. Case (b) is the only consumer of the record shape, so the key rename breaks nothing else. The case (a) floors stay valid because no real config has a commented dataset line.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-fixture-refs.js --probe-missing` prints exactly `{"ok":false,"configs":2,"datasets":3,"refs":3,"missing":[{"config":"promptfooconfig-headless.yaml","line":3,"ref":"datasets/c.yaml"},{"dataset":"datasets/a.yaml","line":3,"ref":"fixtures/absent.md"},{"dataset":"datasets/b.yaml","line":2,"ref":"fixtures-fs/absent-dir"}]}` and exits 0.
- [ ] `node tests/promptfoo/scripts/check-fixture-refs.js` still prints `"ok":true` and exits 0.
- [ ] Count checks over these files (ledger F-104): case (a) keeps `configs === 2`, `datasets >= 19`, `refs >= 316` unchanged; case (b) asserts `datasets === 3` (new) and `refs === 3` (unchanged).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs"` passes both cases.

**Contract:**
- shape (code): CLI and exit codes unchanged; `scanRefs(root)` config loop gains the comment skip; missing config record becomes `{ config, line, ref }`; `probeMissing()` temp tree as rendered.
- names: `scanRefs`, `probeMissing`, key `config`, temp file `datasets/c.yaml` (never written), `datasets/commented.yaml` (commented line).
- mirror: dataset-loop skip at `tests/promptfoo/scripts/check-fixture-refs.js:50`.
- decisions: Key Decisions 3 and 4.
- sync: `fixture-guard-exec.yaml` case (b) expected string; header comments `:24` and `:60-61`.

```diff
# check-fixture-refs.js, scanRefs config loop
     lines.forEach((line, i) => {
+      if (line.trimStart().startsWith('#')) return;
       for (const m of line.matchAll(DATASET_RE)) {
         if (!datasets.includes(m[1])) datasets.push(m[1]);
         if (!fs.existsSync(path.join(root, m[1]))) {
-          missing.push({ dataset: config, line: i + 1, ref: m[1] });
+          missing.push({ config, line: i + 1, ref: m[1] });

# check-fixture-refs.js, header and probeMissing
-//  - a reference inside a block scalar or after a # on the same line is checked (fails safe).
+//  - a reference inside a block scalar or after a # on the same line is checked (fails safe);
+//    a whole-line # comment is skipped in configs and datasets.
 ...
-// Negative self-test: build a temp tree with a missing fixture and a missing fixture dir, outside tests/promptfoo,
+// Negative self-test: build a temp tree with a missing dataset, a missing fixture, a missing fixture dir and
+// commented references, outside tests/promptfoo,
 ...
-      'promptfooconfig.yaml': ['tests:', '  - file://datasets/a.yaml', ''],
-      'promptfooconfig-headless.yaml': ['tests:', '  - file://datasets/b.yaml', ''],
+      'promptfooconfig.yaml': ['tests:', '  - file://datasets/a.yaml', '#  - file://datasets/commented.yaml', ''],
+      'promptfooconfig-headless.yaml': ['tests:', '  - file://datasets/b.yaml', '  - file://datasets/c.yaml', ''],
```

```diff
# fixture-guard-exec.yaml case (b)
-- description: "fixture-refs: (b) a missing fixture and a missing fixtures-fs reference are reported; a commented reference is skipped"
+- description: "fixture-refs: (b) a missing dataset, a missing fixture and a missing fixtures-fs reference are reported; commented references are skipped"
 ...
-      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.refs === 3 && r.missing.map(m => m.dataset + ':' + m.line + ':' + m.ref).join(',') === 'datasets/a.yaml:3:fixtures/absent.md,datasets/b.yaml:2:fixtures-fs/absent-dir'"
+      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.datasets === 3 && r.refs === 3 && r.missing.map(m => (m.config || m.dataset) + ':' + m.line + ':' + m.ref).join(',') === 'promptfooconfig-headless.yaml:3:datasets/c.yaml,datasets/a.yaml:3:fixtures/absent.md,datasets/b.yaml:2:fixtures-fs/absent-dir'"
```

### Task 5: github-sdlc rule citation (#9401)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` — line 35 final `(C14)` becomes `(C21)`
- Modify: `docs/skills/github-sdlc.md` — check only: the user doc cites no C-id for this rule, no change expected (copy rule)
- Modify: `site/src/content-source/skills/github-sdlc.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/github-sdlc` — check only: `write-ops.md` and `operations-reference.md` cite C14 for bodies, which is correct, no change expected (copy rule)

**Notes:** Decision 1 of Decisions taken without the owner. This is a citation fix, not a behaviour change, so the spec does not change (spec-first does not apply). `site/src/data/skills-meta.ts` is listed in Task 3, which satisfies the copy rule for this skill too; listing it here as well would give one file to two tasks in one wave (ledger F-43). The C14 citations at `SKILL.md:150`, `:154` and `:161` are about request content in files and stay.

**Acceptance criteria:**
- [ ] Line 35 matches the diff below; no other line changes.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): one-token replace in line 35, as rendered below.
- names: spec rule id `C21` (`docs/specs/github-sdlc.md:266`).
- mirror: the same line's "**Flags (A14, C21).**" lead.
- decisions: C21 is the request-text rule; C14 is the bodies rule.
- sync: none.

```diff
-... Every other token is the request: keep it in the conversation and never put it in a Bash call (C14). For each `--` token ...
+... Every other token is the request: keep it in the conversation and never put it in a Bash call (C21). For each `--` token ...
```

### Task 6: check-dataset-regex comment, empty value report, missing-dataset gap (#9403, D6, D7)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-dataset-regex.js` — header text, `decode` empty-value check, probe gains an empty value
- Test: `tests/promptfoo/datasets/dataset-regex-exec.yaml` — case (b) description and assertion

**Notes:** Findings F-fixture-guard-scripts-hardening-5 to -7. The missing-dataset skip stays and becomes a stated gap, because `check-fixture-refs.js` already reports a missing dataset (Decision 6); a second report would duplicate it. The empty-value check comes before the block-scalar test because that regex also matches an empty string.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-dataset-regex.js --probe-invalid` exits 0 and prints `"checked":5` with `invalid` entries at `datasets/a.yaml:3`, `datasets/b.yaml:3` and `datasets/b.yaml:7`, the last with `"value":""` and `"error":"empty value"`.
- [ ] `node tests/promptfoo/scripts/check-dataset-regex.js` still prints `"ok":true` and exits 0.
- [ ] `grep -n "320" tests/promptfoo/scripts/check-dataset-regex.js` prints nothing.
- [ ] Count checks over these files (ledger F-104): case (a) keeps `checked >= 300` and `datasets >= 19` unchanged (no real value is empty); case (b) `checked` goes from 4 to 5.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex"` passes both cases.

**Contract:**
- shape (code): CLI and exit codes unchanged; `decode(raw)` returns `{ error: 'empty value' }` for an empty text before the block-scalar test; header comments as rendered; `probeInvalid()` `datasets/b.yaml` gains two lines.
- names: `decode`, `probeInvalid`, error text `empty value`.
- mirror: existing `decode` error returns at `tests/promptfoo/scripts/check-dataset-regex.js:33-39`.
- decisions: Decisions 3, 5 and 6.
- sync: `dataset-regex-exec.yaml` case (b) expected string and `checked` value.

```diff
# check-dataset-regex.js header
-//  - the value must be on the first non-comment line after its type: line (all 320 are);
+//  - the value must be on the first non-comment line after its type: line (every current value is);
 //  - a value with {{...}} is compiled as written, before promptfoo renders it;
 //  - an assertion in a config file (not a dataset) or under defaultTest is not seen;
+//  - a dataset file that a config names but that does not exist is skipped (check-fixture-refs.js reports it);
 //  - a JSON-incompatible YAML escape (\x, \ ) is reported as undecodable (fails safe).
-// --probe-invalid proves that the scan reports an invalid regex and an invalid not-regex.
+// --probe-invalid proves that the scan reports an invalid regex, an invalid not-regex and an empty value.

# decode
   const text = raw.trim();
+  if (text === '') return { error: 'empty value' };
   if (/^([|>][-+0-9]*)?$/.test(text)) return { error: 'block scalar not supported' };

# probeInvalid
       'datasets/b.yaml': ['- assert:', '    - type: not-regex', '      value: "(?s)x.*y"',
-        '    - type: not-regex', '      value: "x\\\\.y"', ''],
+        '    - type: not-regex', '      value: "x\\\\.y"', '    - type: regex', '      value:', ''],
```

```diff
# dataset-regex-exec.yaml case (b)
-- description: "dataset-regex: (b) an inline-flag regex and an inline-flag not-regex are reported; valid values are not"
+- description: "dataset-regex: (b) an inline-flag regex, an inline-flag not-regex and an empty value are reported; valid values are not"
 ...
-      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.checked === 4 && r.invalid.map(i => i.dataset + ':' + i.line).join(',') === 'datasets/a.yaml:3,datasets/b.yaml:3'"
+      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.checked === 5 && r.invalid.map(i => i.dataset + ':' + i.line).join(',') === 'datasets/a.yaml:3,datasets/b.yaml:3,datasets/b.yaml:7' && r.invalid[2].error === 'empty value'"
```

### Task 7: check-brief wrapper spawn error (D1)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-plan-explore-check-brief.js` — exit 2 on `r.error` before the JSON line

**Notes:** Findings F-fixture-guard-scripts-hardening-8, -9. No new case (Deviations row "No test case for item 9"); the four existing cases re-run and prove the success shape is unchanged. Exit 2 and `Script error:` follow the file's own marker guard (Key Decision 5).

**Acceptance criteria:**
- [ ] The code matches the diff below.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-explore --check-brief"` passes every case.

**Contract:**
- shape (code): after `spawnSync`, when `r.error` is set, write `Script error: <r.error.message>` and a newline to stderr and exit 2; otherwise print the same JSON line as today.
- names: `r.error`.
- mirror: marker guard at `tests/promptfoo/scripts/run-plan-explore-check-brief.js:16-18`.
- decisions: Key Decision 5.
- sync: none; stdout shape unchanged for the cases at `plan-prepare-exec.yaml:1131-1177`.

```diff
   { encoding: 'utf8' },
 );
+if (r.error) {
+  process.stderr.write(`Script error: ${r.error.message}\n`);
+  process.exit(2);
+}
 console.log(JSON.stringify({ status: r.status, out: r.stdout, err: r.stderr }));
```

## Final Shape

When all seven tasks are done:

- The review orchestrator's DO-NOT list says the manifest file is kept, like the spec.
- The pr-labels rules fixture holds `.sdlc/config.json`, and its test case says so.
- Two harden-sdlc cases name `.sdlc/config.json`.
- The review-sdlc post case has no stray comment.
- R90 and the hooks README list the `patch --dry-run` bypass as an accepted gap. The site copy of the spec matches it byte for byte.
- `check-fixture-refs.js` skips commented config lines, reports a missing config reference with a `config` key, and its probe proves a missing dataset is reported.
- `check-dataset-regex.js` reports an empty value as `empty value`, states the missing-dataset gap, and has no stale count.
- github-sdlc cites C21 for the request-text rule.
- The check-brief wrapper fails with exit 2 when node cannot start.

No skill behaviour changes.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9396 review-orchestrator.md:78 manifest wording | Task 1 | covered |
| 2 #9397 setup-sdlc.yaml:296 and fixture git mv to .sdlc/config.json | Task 2 | covered |
| 3 #9398 R90 accepted gap docs, README, appendix row, site copy | Task 3 | covered |
| 4 #9399 harden-sdlc.yaml:228 and :255 | Task 2 | covered |
| 5 #9400 + D2 + D3 check-fixture-refs.js and fixture-guard-exec case (b) | Task 4 | covered |
| 6 #9401 github-sdlc SKILL.md:35 C14 to C21 | Task 5 | covered |
| 7 #9402 review-sdlc.yaml:240 orphan comment | Task 2 | covered |
| 8 #9403 + D6 + D7 check-dataset-regex.js | Task 6 | covered |
| 9 D1 run-plan-explore-check-brief.js spawn error exit 2 | Task 7 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
