# Behavioural Test Fixes (w24) Implementation Plan

**Commit:** `fix(#9393): tests - behavioural assertions, archive hint`
**Goal:**
- Make the 27 failing cases of the behavioural rerun eval-odZ-2026-11-14T21:09:28 test the skill, not the model's wording.
- Fix negative assertions that match the model's own explanation, assertions that contradict their rubric, and stale fixtures and rubrics.
- Make one skill rule explicit (S1): a failed OpenSpec validation prints no `openspec archive` text at all.
- Align the review-sdlc spec R8 and phase 4 with gate G3 (the manifest file is kept).
- Give the headless github cases that reach `--check-payload` the `live` gh stub data (#9392).
**Architecture:** Test-data and docs wave. Each task owns a disjoint set of dataset, fixture or spec files, so all ten tasks run in one execute wave. Negative checks are rewritten to match only the forbidden artifact (a line-anchored rendered line or a command at line start), or deleted where the llm-rubric already states the same rule. The only behaviour text change is one rule in `execute-plan-sdlc/openspec-tasks.md`, citing spec R24, which already forbids the suggestion.
**Source:** conversation context
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` plus a YAML parse check per changed dataset: `npx --yes js-yaml@4.1.0 <dataset> > /dev/null`

---

## Context

**What problem does this change solve?**

- The behavioural rerun eval-odZ-2026-11-14T21:09:28 failed 27 of 44 cases.
- An isolated classifier read every case. Its per-case dumps are in the session scratchpad (`cases/00.txt` to `cases/26.txt`).
- Most failures are test defects, not skill defects. A negative check such as `not-icontains "Labels:"` also matches the model's sentence "the skill does not print 'Labels: none'".
- Some checks can never pass. For example, the beta-to-rc case forbids the word `beta`, but the model must print the current version `1.2.4-beta.3`.
- Some fixtures and rubrics are stale. They ask for files and menus the skills no longer use.
- One case (S1) shows a real skill gap: the model printed `openspec archive` as a later, conditional step after validation failed.

**What prompted this change now?**

- The rerun gave fresh, per-case evidence. The wave scope is tracked as #9393 (a register id, not a GitHub issue).

**What does success look like?**

- Every listed case asserts only what the skill must produce or must not produce as an artifact.
- No negative check can match an explanation sentence.
- The exec checks `dataset-regex` (every regex compiles in JavaScript) and `fixture-refs` (every fixture reference resolves) pass.
- Every changed dataset parses as YAML.
- No behavioural or headless run happens in ship (AGENTS.md: owner-initiated only). The owner may run one targeted behavioural case later.

**Re-verification at HEAD 2e9a00a (all twelve items reproduce; none dropped):**

| Item | Evidence at HEAD |
|---|---|
| T1 | `tests/promptfoo/datasets/pr-sdlc.yaml:184` regex `^(feat\|...)` has no line anchor; dumps 00/01 print `PR Title: feat(api): ...` at lines 89/77, not at output start |
| T2 | pr-sdlc.yaml:288-294, :347-348, :419-424; review-sdlc.yaml:241-242, :261-265, :286-288, :346-347, :387-388, :462-463; version-sdlc.yaml:301-304, :335-336; setup-sdlc.yaml:374-378; setup-sdlc-dimensions.yaml:180-181, :199-200. Each dump shows the match inside an explanation sentence (for example dump 06 line 33: "`gh api repos/...` is not called") |
| T3 | version-sdlc.yaml:365-366 (`beta`), :476-479 (`rc`, `preRelease`), :520-521 (`Write tool`, which its rubric at :531 requires); setup-sdlc.yaml:598-603 (`confirm`; setup-sdlc SKILL.md:443 asks the user to confirm the diff) |
| T4 | fixtures `review-post-confirm-cancel.md:44` and `review-post-confirm-save.md:45` say "clean up both the manifest file and the diff dir"; rubrics review-sdlc.yaml:250 and :306 say the same; review-sdlc SKILL.md:160 "Do NOT delete the manifest file here"; spec G3 (`docs/specs/review-sdlc.md:110`) "The manifest file persists" |
| T5 | review-sdlc.yaml:595-596 cites "the transform table that groups model with max-files and requires-full-diff in the Omit row"; no such table exists (grep of setup-sdlc and review-sdlc companions); the authority is `plugins/sdlc-utilities/scripts/lib/dimension-to-instructions.js:16-24` |
| T6 | version-sdlc.yaml:47-49 asserts `.claude/version.json`; `skills/version-sdlc/init-workflow.md:11,26,37` writes the `version` section of `.sdlc/config.json`; fixture `project-no-version-config.md:16` still says `.claude/version.json` |
| T7 | `fixtures/setup-clean-project.md` has 11 sections, `.claude/sdlc.json` paths, `fields: []`, no `preReleaseCompat`; a clean run of `scripts/skill/setup.js` gives 14 sections, `.sdlc/config.json`, jira `fields[defaultProject]`, `preReleaseCompat`; jira `consumedBy` is `["jira-sdlc","commit-sdlc","pr-sdlc"]` (no slash), so `icontains "/jira-sdlc"` (setup-sdlc.yaml:153) only passes on paraphrase |
| T8 | setup-sdlc.yaml:291-317 context names a fixtures-fs directory but gives no prepare `sections[]` row; dump 19: "could not run the script and the wording is a stand-in" |
| T9 | execute-plan-sdlc SKILL.md:815-821, setup-dimensions.md:245-249, commit-sdlc SKILL.md:366-371, jira-sdlc SKILL.md:446-450, received-review-sdlc SKILL.md:695-698 list follow-ups; no "done" option. Cases execute-plan-sdlc.yaml:6, setup-sdlc-dimensions.yaml:95, commit-sdlc.yaml:4, jira-sdlc.yaml:12, received-review-sdlc.yaml:40 still assert `done` and an interactive menu. setup-sdlc-pr-template.yaml:54 asserts a menu that `setup-pr-template.md` never defines |
| S1 | `skills/execute-plan-sdlc/openspec-tasks.md:98-102` says only "suppress the archive suggestion"; dump 26 shows `openspec archive add-auth --yes` as a later step |
| R8 | `docs/specs/review-sdlc.md:55` "R8: Clean up the manifest temp file after completion" and :67 "then cleans up manifest and diff dir" contradict G3 at :110 |
| #9392 | `tests/promptfoo/datasets/headless-github.yaml:41,69,99,129,165` set only `SDLC_LINKS_OFFLINE`; these cases reach `--check-payload` or `--apply`; the exec precedent `github-sdlc-exec.yaml:1440` sets `"GH_STUB_DATA": "live"` for every `--check-payload` case |

**Facts in the brief that differ from HEAD (not blocking):**

- setup-sdlc #338 case starts at :589 but its assertion block is at :598.
- setup-sdlc-dimensions "minimal" and "--no-copilot" negatives are at :180 and :199 (brief: ~:168, ~:191).
- `Proceed with preRelease` (setup-sdlc.yaml:603) does not match the real prompt text, which is ``Proceed with `preRelease: <value>` for `<fileType>`?`` (setup-sdlc SKILL.md:316).
- T4: the yes fixture does not ask for manifest deletion; only the cancel and save fixtures and the yes/save rubrics do.

### Decisions taken without the owner

1. Sweep scope: the sweep fixes only the candidates listed by the discovery brief (F-assertion-setup-sweep-3, -4, -6, -9, -14 to -26). Each candidate is fixed only when its value can appear in an explanation sentence. Others are kept and reported. This bounds the work.
2. setup-sdlc-pr-template continuation case: the sub-flow defines no follow-up list, so the case drops `done` and `/commit-sdlc` and keeps `/pr-sdlc` (its See Also link). It does not add a follow-up list to the skill (out of scope: skill changes other than S1).
3. plan-sdlc continuation case (plan-sdlc.yaml:100): the Step 7 menu is still live (ship / execute / done), so `done` stays. Its `/commit-sdlc` check is not in the plan-sdlc menu; it is replaced by `/ship-sdlc`.
4. setup-clean-project.md keeps `"shipFields": []`. The #292 cases give the shipFields in the user request; a real list with `skip: false` would contradict those requests.
5. S1 changes no spec. R24 (`docs/specs/execute-plan-sdlc.md:143`) already says the suggestion is not emitted when validation fails; a conditional later-step hint is such a suggestion. The companion rule cites R24. This also keeps the execute-plan-sdlc copy rule (all its docs and companions) from firing for a sentence the spec already states.
6. `docs/skills/execute-plan-sdlc.md:382` already says "If validation fails, surfaces errors instead". It is not changed.

## Research Findings

**Regex semantics in promptfoo.** promptfoo builds `new RegExp(value)` with no flags. So `^` matches only the start of the whole output. A line anchor needs `(^|\n)`. Inline flags such as `(?m)` do not compile in JavaScript. The exec check `tests/promptfoo/scripts/check-dataset-regex.js` (dataset-regex cases) reports any regex that does not compile. It reads the value from the first non-comment line after `type:`, so every regex value stays on one line.

**Fixture references.** `tests/promptfoo/scripts/check-fixture-refs.js` (fixture-refs cases) checks that every `file://fixtures/...` reference in the behavioural and headless datasets resolves. This plan renames no fixture.

**Real prepare output for T7.** A clean scratch project (git init, `package.json` with a version) and one run of `node <repo>/plugins/sdlc-utilities/scripts/skill/setup.js` from that directory gives a manifest path on stdout. Its JSON has keys `projectConfig`, `localConfig`, `legacy`, `content`, `detected`, `openspecConfig`, `shipFields`, `preReleaseCompat`, `pluginVersion`, `scriptVersions`, `needsMigration`, `localIsV1`, `copyRules`, `sections`, `flags`, `defaultSelectionMode`, `menuInputContract`. The 14 section ids are `version, ship, jira, review, received-review, commit, pr, pr-labels, review-dimensions, pr-template, plan-template, plan-guardrails, execution-guardrails, openspec-block`. The script must not run inside the repository: it resolves the main worktree root, so it would read this repository's own config.

**pr-labels summary for T8.** `summarizePrLabels` (`scripts/lib/setup-sections.js:237-248`) returns `rules: 1 rule` for one rule. The row it builds (fields stripped) is rendered in Task 4.

**Rendered forms the skills print (the only text a negative check may target):**

| Skill | Rendered form | Source |
|---|---|---|
| pr-sdlc | `PR Title: <title>` and `Labels: <a> (forced), <b> (rule)` at line start | pr-sdlc SKILL.md:374-375, :393 |
| review-sdlc | `Post this review comment to PR #<n>? (yes / save / cancel)` | review-sdlc SKILL.md:184 |
| review-sdlc | `> The review found actionable items. Address them now?` | review-sdlc SKILL.md:254 |
| setup-sdlc | `[set]      <id>            <summary>` status row | setup-sdlc SKILL.md:128 |
| setup-sdlc | ``Proceed with `preRelease: <value>` for `<fileType>`?`` | setup-sdlc SKILL.md:316 |

**Commands.** YAML parse: `npx --yes js-yaml@4.1.0 <file> > /dev/null` (tested on pr-sdlc.yaml at HEAD, exit 0). Exec check: the command in the header **Verification:** line. Spec shape: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`.

**Brief.** The discovery brief (`/tmp/sdlc-explore-main-tPHBXq/discovery-brief.md`, 48 findings, 3 code dimensions, no web findings) is cited per task by `F-<DIM>-<n>`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Sweep bounded to brief candidates | no | fixes only listed candidates that can match an explanation | an open-ended sweep of 20+ datasets has no stop rule; see Decision 1 |
| received-review-sdlc and setup-sdlc-pr-template continuation cases | no | added to T9 | same retired-menu staleness the brief asks to check; see Decision 2 |
| plan-sdlc.yaml:100 `/commit-sdlc` check | no | replaced with `/ship-sdlc` | the case is a continuation-menu case that contradicts the live plan-sdlc menu; see Decision 3 |
| S1 spec text | no | no spec change; the companion cites R24 | R24 already owns "suggestion is NOT emitted"; see Decision 5 |
| No behavioural run in ship | no | verification is exec checks, YAML parse and review | AGENTS.md policy and the brief |

## Key Decisions

- **Narrow or delete a negative check.** A negative check stays only when it can match the forbidden artifact alone. The artifact is a rendered line (anchored with `(^|\n)[ \t]*`) or a command at line start. When the artifact has no fixed form, the check is deleted, because the llm-rubric already states the same rule. The alternative, a `javascript` assertion with a multiline regex, adds code to datasets; a one-line `regex` keeps them uniform and is covered by the dataset-regex exec check.
- **One task per dataset.** Each dataset and its fixtures belong to one task. So all ten tasks are independent and run in one wave (ledger F-43). The alternative, one task per item (T1 to T9), would put pr-sdlc.yaml or version-sdlc.yaml into several tasks and force a chain.
- **T4 follows the skill, not the fixture.** The skill keeps the manifest (SKILL.md:160) and gate G3 says it persists. So the rubrics and fixtures change, and spec R8 changes its wording. The alternative, deleting the manifest in the skill, is a behaviour change out of scope.
- **Line anchor form.** `(^|\n)[ \t]*` and not `(^|\n)\s*`: `\s` also matches a newline, which is harmless, but `[ \t]*` makes the intent clear. A leading `>` or `-` is not allowed, so a quoted or bulleted explanation does not match.
- **Root problem.** The behavioural cases test the model's wording, not the skill's output, so they fail on correct runs and hide real gaps.
- **Who fails if this ships wrong.** The owner, who reads the behavioural eval: a too-loose check passes a broken skill, a too-tight one keeps failing correct runs. No plugin user is affected, because no script or provider changes and the only skill-text change (S1) narrows output.
- **Smallest viable cut.** Tasks 1-4, 8 and 10 fix the failing cases and the S1 gap. Tasks 5-6 fix failing continuation and dimension cases plus their same-pattern siblings. Task 7 (sweep without a failure) and Task 9 (#9392) are in the brief's scope; Task 7 is the first to drop if the wave must shrink.
- **Spec first for S1.** The S1 rule lives in a skill companion (`openspec-tasks.md`), not SKILL.md, and spec R24 already states it, so the spec-first order holds without a spec edit (Decision 5).
- **Two spec-related tasks.** Task 8 (S1 companion rule) and Task 10 (review-sdlc R8 wording) are separate deliverables for different skills, so each has its own task (single-responsibility guardrail).
- **Tracking ids.** #9393 and #9392 are internal register ids, not GitHub issues. The PR names them without `Fixes`/`Closes` (project note), so the pr-link-github-issue guardrail does not apply.
- **Workspace mode.** No task touches state files, config readers or git operations in plugin code. The setup.js scratch run uses its own temporary git repository, so branch and worktree modes give the same fixture.

**Non-goals (explicitly out of scope):**
- #9390 (plugin-wide `$ARGUMENTS` rule, jira `--force-refresh`).
- Any skill behaviour change other than S1, including adding a "What's Next" list to setup-pr-template.md.
- Any change to provider or harness code (`tests/promptfoo/providers/`, `scripts/run-*.js`).
- Running the behavioural or headless suites.
- Fixing the legacy `.claude/sdlc.json` paths inside `tests/promptfoo/fixtures-fs/setup-pr-labels-menu-*` (they do not cause a failure in this rerun).
- A version bump beyond the patch that ship gives a test/docs change.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): in `tests/promptfoo/datasets/pr-sdlc.yaml`, replace `regex '^(feat|fix|chore|refactor|docs)(\([a-z-]+\))?:'`
  with `regex '(^|\n)PR Title: (feat|fix|chore|refactor|docs)(\([a-z-]+\))?:'`.
- names: case "pr-sdlc: enforces title type constraint from config".
- mirror: rendered form `PR Title: <title>` at pr-sdlc SKILL.md:374.
- decisions: one-line regex, no inline flags (Key Decisions: line anchor form).
- sync: none.
- example: output line `PR Title: feat(api): add caching` matches; a table cell `| feat |` does not.
```

### Worked example — docs

```markdown
**Contract:**
- shape (docs): MODIFY `tests/promptfoo/fixtures/review-post-confirm-cancel.md` last paragraph:
  "must still clean up both the manifest file and the diff dir" becomes "must still remove the diff dir
  at `/tmp/review-diff-def456`; the manifest file is kept".
- names: fixture section `## User interaction`.
- mirror: review-sdlc SKILL.md:160 "Do NOT delete the manifest file here".
- decisions: the skill is the authority (Key Decisions: T4 follows the skill).
- sync: rubric of the cancel case in `review-sdlc.yaml`.
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY `R8` in `docs/specs/review-sdlc.md` (text only, id kept); no new ids.
- names: `R8` (modified), phase 4 bullet (modified).
- mirror: G3 wording at `docs/specs/review-sdlc.md:110`.
- decisions: no renumbering; history row in `## Appendix — history`.
- sync: byte copy `site/src/content-source/specs/review-sdlc.md`.
- example: `R8` reads "Remove `diff_dir` after the terminal branch (Step 6); the manifest file is kept (G3)".
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | All tasks edit promptfoo datasets and fixtures; the Task 8 skill-text change is covered by the existing case execute-plan-sdlc.yaml:138 |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Verification uses only the exec-only config; behavioural and headless runs are explicitly excluded |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Task 7 sweep goes beyond failing cases but is bounded by Decision 1 and justified in Key Decisions |
| single-responsibility-tasks | warning | PASS | Lane finding fixed: the S1 rule (Task 8) and the review-sdlc R8 wording (Task 10) are now separate tasks |
| scripts-over-llm-logic | error | PASS | The one skill text change (S1) is an output-suppression rule with no script-implementable logic; the rest are test data and docs |
| yagni | warning | PASS | No new abstractions or parameters |
| cross-skill-consistency | error | PASS | Continuation cases aligned across skills; plan-sdlc live menu preserved (Decision 3) |
| pr-link-github-issue | error | PASS | #9393 and #9392 are register ids, not GitHub issues; the plan records this in Key Decisions |
| dry | warning | PASS | Shared rule and rubric wording is applied consistently; no duplicated logic |
| kiss | warning | PASS | One-line regex edits and deletions chosen over javascript assertions |
| spec-first | error | PASS | S1 edits a companion whose rule spec R24 already states (Decision 5); Task 10 edits only the spec |
| project-agnostic | error | PASS | Changes are tests, docs and a shipped skill companion; no repo-local config edits |
| flag-coherence-cross-skill | error | PASS | No flag gating changes |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate conditions introduced |
| flag-resolution-single-source | warning | PASS | No flag resolution changes |
| state-premise | error | PASS | Root problem stated in Context and Key Decisions: cases test the model's wording, not the skill's output |
| smallest-viable-cut | warning | PASS | Smallest cut identified, with Task 7 named as the first to drop |
| failure-audience | warning | PASS | Names the owner reading the eval as the party affected |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions and the Decisions section with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch described |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag added |
| workspace-mode-compatibility | error | PASS | Plan states no state, config or git operations are touched and the scratch setup.js run is mode-neutral |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes introduced into dispatched prompts |

## Tasks

### Task 1: pr-sdlc dataset — title anchors, label negatives, sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/pr-sdlc.yaml` — T1 title regexes, T2 label negatives, sweep of the remaining negatives

**Notes:**
Findings F-assertion-anchoring-pr-review-version-1 to -5 and F-assertion-setup-sweep-20. The brief's "legacy" label case is the case "labels: pr.labels absent (legacy project)" at :410. The title regex failed because the title is not the first line of the output (dumps 00, 01). The label negatives failed on explanation sentences (dumps 02-04).

**Acceptance criteria:**
- [ ] Both title cases anchor on the `PR Title: ` line; no regex in the file starts with a bare `^` meant as a line anchor.
- [ ] The three label cases forbid only a rendered `Labels:` line or a rendered tagged label inside it.
- [ ] Sweep candidates from F-assertion-setup-sweep-20 that can match an explanation are narrowed or deleted; the task report lists each kept candidate with a one-line reason.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/pr-sdlc.yaml > /dev/null` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): assertion edits, before → after:

  ```yaml
  # case "pr-sdlc: enforces title type constraint from config" (pr-sdlc.yaml:183-188)
  - type: regex
    value: '^(feat|fix|chore|refactor|docs)(\([a-z-]+\))?:'        # before
    value: '(^|\n)PR Title: (feat|fix|chore|refactor|docs)(\([a-z-]+\))?:'   # after
  - type: not-regex
    value: '^(perf|style|test|ci)(\([a-z-]+\))?:'                  # before
    value: '(^|\n)PR Title: (perf|style|test|ci)(\(|:)'             # after

  # case "pr-sdlc: validates title against pattern from config" (pr-sdlc.yaml:207-211)
  - type: regex
    value: '^(feat|fix|chore|refactor|docs)(\([a-z-]+\))?:'        # before
    value: '(^|\n)PR Title: (feat|fix|chore|refactor|docs)\((api|auth|db)\):'  # after
  # the separate '\((api|auth|db)\):' regex is deleted (now part of the anchored one)

  # cases "labels: mode=off + no forced labels" (:288-294) and "labels: pr.labels absent" (:419-424)
  - type: not-icontains
    value: "Labels:"                                               # before
  - type: not-regex
    value: '(^|\n)[ \t]*Labels:'                                    # after
  # not-icontains "(rule)" and not-icontains "(llm)" are deleted in both cases
  # rubric of the mode=off case: "does NOT mention \"(llm)\" or \"(rule)\" provenance tags"
  #   becomes "does NOT show any label with an (llm) or (rule) provenance tag"

  # case "labels: mode=rules + forced label appears first" (:347-348)
  - type: not-icontains
    value: "bug (rule)"                                            # before
  - type: not-regex
    value: '(^|\n)[ \t]*Labels:[^\n]*bug \(rule\)'                  # after
  - type: regex                                                    # added
    value: '(^|\n)[ \t]*Labels: bug \(forced\), needs-review \(forced\), small-change \(rule\)'
  ```
- names: the five case descriptions quoted above; rendered forms `PR Title: ` and `Labels: ` (pr-sdlc SKILL.md:374-375).
- mirror: rendered-form table in `## Research Findings`.
- decisions: Key Decisions "Narrow or delete a negative check" and "Line anchor form"; a regex value stays on one line (dataset-regex scan rule); `|` here is alternation, not a literal (F-44 does not apply).
- sync: none.

### Task 2: review-sdlc dataset and post-confirm fixtures — negatives, manifest, Omit table, sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — T2 post negatives, T4 rubrics, T5 rubric, sweep
- Modify: `tests/promptfoo/fixtures/review-post-confirm-cancel.md` — T4 cleanup sentence
- Modify: `tests/promptfoo/fixtures/review-post-confirm-save.md` — T4 cleanup sentence and expected path
- Modify: `tests/promptfoo/fixtures/review-post-confirm-yes.md` — T4 cleanup question

**Notes:**
Findings F-assertion-anchoring-pr-review-version-6 to -11 and -18, F-fixtures-specs-headless-1 to -6, F-assertion-setup-sweep-19. The skill keeps the manifest (SKILL.md:160, G3). The save case gets its file name from the summary's `Save path:` line, not from today's date (dump 07).

**Acceptance criteria:**
- [ ] No rubric or fixture in these four files asks for the manifest file to be deleted; the yes, cancel and save rubrics say the diff dir is removed and the manifest file is kept.
- [ ] The save case expects `.sdlc/reviews/feat-search-api-2026-11-05.md`, the fixture's `Save path:` value.
- [ ] The Copilot transform rubric no longer cites an Omit table.
- [ ] The negatives listed in the contract are narrowed or deleted as rendered; sweep candidates of F-assertion-setup-sweep-19 are handled by the same rule and reported.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/review-sdlc.yaml > /dev/null` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): assertion edits, before → after:

  ```yaml
  # "post-confirmation yes ... (issue #167)" (review-sdlc.yaml:241-242)
  - type: not-regex
    value: "(dispatch.*orchestrator|spawn.*Agent|Agent tool|subagent_type)"   # deleted (rubric covers)
  # its rubric: "After posting, both the manifest file and the diff dir (`/tmp/review-diff-abc123`) are cleaned up."
  #   becomes "After posting, the diff dir (`/tmp/review-diff-abc123`) is removed; the manifest file is kept (it persists under .sdlc/execution/out/)."

  # "post-confirmation cancel" (:261-265)
  - type: not-regex
    value: "gh api"                                                # before
    value: '(^|\n)[ \t]*gh api '                                    # after
  - type: not-regex
    value: '\.sdlc/reviews/[^"\s]*\.md'                            # deleted (rubric covers)

  # "post-confirmation save" (:286-306)
  - type: not-regex
    value: "gh api"                                                # before
    value: '(^|\n)[ \t]*gh api '                                    # after
  - type: regex
    value: '\.sdlc/reviews/feat-search-api-\d{4}-\d{2}-\d{2}\.md|\.sdlc/reviews/[^"\s]*search-api[^"\s]*\.md'  # before
    value: '\.sdlc/reviews/feat-search-api-2026-11-05\.md'          # after
  # its rubric: "named `<branch>-<YYYY-MM-DD>.md` ... and the date is today" becomes
  #   "at the `Save path:` value from the summary, `.sdlc/reviews/feat-search-api-2026-11-05.md`, used as given";
  #   "both the manifest file and the diff dir ... are cleaned up" becomes the yes-case sentence above with ghi789.

  # "review-sdlc-post: save decision ..." (:346-347) and "yes decision ..." (:387-388)
  - type: not-contains
    value: "Post this review comment"                              # before
  - type: not-regex
    value: '(^|\n)[ \t]*Post this review comment to PR #12\?'        # after

  # "review-sdlc-post: auto skips the self-fix offer" (:462-463)
  - type: not-contains
    value: "Address them now?"                                     # before
  - type: not-regex
    value: '(^|\n)[ \t]*>?[ \t]*The review found actionable items\. Address them now\?'   # after

  # "Copilot transform omits per-dimension model field (R15, #199)" (:584-597)
  - type: not-icontains
    value: "model: claude-haiku"                                   # deleted: the explanation quotes the source frontmatter
  # the not-regex '(?:^|[\n\r  ])[Mm][Oo][Dd][Ee][Ll]:\s' stays
  # rubric sentence "The explanation references the transform table that groups model with max-files
  #   and requires-full-diff in the Omit row." is deleted
  ```

  Fixture text, before → after:

  ```diff
  # review-post-confirm-cancel.md:43-45
  -file under `.sdlc/reviews/`, and must still clean up both the manifest file and the
  -diff dir at `/tmp/review-diff-def456`.
  +file under `.sdlc/reviews/`, and must still remove the diff dir at
  +`/tmp/review-diff-def456`. The manifest file is kept.
  # review-post-confirm-save.md:43-46
  -comment to `.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` by copying the `Comment file`
  -path from the summary. After saving, both the manifest file and the diff dir at
  -`/tmp/review-diff-ghi789` must be cleaned up.
  +comment to the `Save path:` value from the summary
  +(`.sdlc/reviews/feat-search-api-2026-11-05.md`), using the `Comment file` content.
  +After saving, the diff dir at `/tmp/review-diff-ghi789` is removed. The manifest file is kept.
  # review-post-confirm-yes.md:47-49 (last line of the request)
  -orchestrator. State how cleanup proceeds.
  +orchestrator. State how cleanup proceeds (the diff dir is removed; the manifest file is kept).
  ```
- names: case descriptions quoted above; prompts `Post this review comment to PR #<n>? (yes / save / cancel)` (SKILL.md:184) and `The review found actionable items. Address them now?` (SKILL.md:254).
- mirror: review-sdlc SKILL.md:160; spec G3 at `docs/specs/review-sdlc.md:110`; `scripts/lib/dimension-to-instructions.js:16-24` for the Copilot field mapping.
- decisions: Key Decisions "T4 follows the skill" and "Narrow or delete a negative check"; `-f body="` negative stays (it can only match the command form).
- sync: spec R8 wording in Task 10 says the same (diff dir removed, manifest kept).

### Task 3: version-sdlc dataset and init fixture — negatives, contradictions, init path, sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/version-sdlc.yaml` — T2, T3, T6 assertions and rubric, sweep
- Modify: `tests/promptfoo/fixtures/project-no-version-config.md` — T6 current-state line

**Notes:**
Findings F-assertion-anchoring-pr-review-version-12 to -17, F-assertion-setup-sweep-14 and -24. The init workflow writes the `version` section of `.sdlc/config.json` (init-workflow.md:11, :26, :37).

**Acceptance criteria:**
- [ ] No case forbids a word that its own context or rubric requires (`beta`, `rc`, `preRelease`, `Write tool`).
- [ ] The init case asserts `.sdlc/config.json` and its rubric and fixture name the `version` section of `.sdlc/config.json`; no `.claude/version.json` remains in this case or fixture.
- [ ] Sweep candidates of F-assertion-setup-sweep-14 and -24 are handled by the rule and reported.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/version-sdlc.yaml > /dev/null` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): assertion edits, before → after:

  ```yaml
  # "init flow detects package.json and proposes config" (version-sdlc.yaml:47-57)
  - type: icontains
    value: ".claude/version.json"                                  # before
    value: ".sdlc/config.json"                                     # after
  # rubric "the suggested .claude/version.json content" becomes
  #   "the suggested `version` section for .sdlc/config.json"

  # "--bump rc from clean 1.2.3 ..." (:301-304)
  - not-icontains "breaking change"                                # deleted (rubric covers)
  - not-regex '[Ss][Uu][Gg][Gg][Ee][Ss][Tt].*[Mm][Aa][Jj][Oo][Rr]' # deleted (rubric covers)
  - type: icontains                                                # added
    value: "v1.2.4-rc.1"

  # "--bump rc from existing 1.2.4-rc.1 ..." (:335-336)
  - not-icontains "1.2.5"                                          # deleted (rubric covers)

  # "--bump rc from 1.2.4-beta.3 ..." (:365-366)
  - not-icontains "beta"                                           # deleted (contradicts context)
  - type: icontains                                                # added
    value: "v1.2.4-rc.1"

  # "explicit --bump major overrides config.preRelease and graduates" (:476-479)
  - not-icontains "rc"                                             # deleted
  - not-icontains "preRelease"                                     # deleted
  - type: not-regex                                                # added: a suffix on the graduated version
    value: '2\.0\.0-[a-z]'
  - type: icontains                                                # added
    value: "v2.0.0"

  # "plugin.json edit uses targeted Edit + post-edit diff hard gate (#211)" (:520-527)
  - not-icontains "Write tool"                                     # deleted (rubric requires the phrase)
  - not-regex '([Rr][Ee][Ww][Rr][Ii][Tt][Ee]|...).*([Dd][Ee][Ss][Cc][Rr][Ii][Pp][Tt][Ii][Oo][Nn]|...)'  # deleted (rubric covers)
  ```

  ```diff
  # fixtures/project-no-version-config.md:16
  -- **No `.claude/version.json`** — versioning not yet initialized
  +- **No `version` section in `.sdlc/config.json`** — versioning not yet initialized
  ```
- names: case descriptions quoted above.
- mirror: `plugins/sdlc-utilities/skills/version-sdlc/init-workflow.md:11-37`.
- decisions: Key Decisions "Narrow or delete a negative check"; tag forms come from the case contexts (`tagPrefix: "v"`).
- sync: none.

### Task 4: setup-sdlc dataset and clean-project fixture — negatives, compat, fixture regen, pr-labels row

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/setup-sdlc.yaml` — T2 #292, T3 #338, T7 jira checks, T8 row, sweep
- Modify: `tests/promptfoo/fixtures/setup-clean-project.md` — T7 regenerate from setup.js output

**Notes:**
Findings F-assertion-setup-sweep-1 to -5 and T7a-f. Medium risk: the fixture feeds eight cases (#292, #338, verbose header); regenerating it changes their context. The scratch run keeps setup.js out of this repository's own config (see Research Findings).

**Acceptance criteria:**
- [ ] `setup-clean-project.md` JSON equals the setup.js output for a clean `package.json` project, except `shipFields` stays `[]` and the run-specific keys `pluginVersion` and `scriptVersions` are left out; it has 14 `sections[]` rows with `.sdlc/config.json` paths, jira `fields[]` with `defaultProject`, and `preReleaseCompat`.
- [ ] The prose above the JSON block says `.sdlc/config.json`, not `.claude/sdlc.json`.
- [ ] The verbose-header case checks `jira-sdlc` (the consumedBy text), and its rubric names `.sdlc/config.json`.
- [ ] The pr-labels rules case context carries the rendered `sections[]` row.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/setup-sdlc.yaml > /dev/null` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): fixture regeneration, one Bash call (each Bash call is its own shell; no variable crosses calls):

  ```bash
  R=$(git rev-parse --show-toplevel) && D=$(mktemp -d) && cd "$D" && git init -q -b main && printf '{"name":"t","version":"0.1.0"}\n' > package.json && node "$R/plugins/sdlc-utilities/scripts/skill/setup.js"
  ```

  The command prints the manifest path; Read that JSON and copy its keys into the fixture's fenced `json` block in this order: `projectConfig, localConfig, legacy, content, detected, openspecConfig, shipFields ([]), preReleaseCompat, needsMigration, localIsV1, copyRules, sections, flags, defaultSelectionMode, menuInputContract`. `R` is the repository root, read with `git rev-parse --show-toplevel` from the task's working directory in the same call. Writing the fixture: it exists, so Read it before Write (F-49).

  Assertion edits, before → after:

  ```yaml
  # "verbose header sourced from manifest precedes any prompt" (setup-sdlc.yaml:149-166)
  - "/jira-sdlc"                       # before (icontains-all item)
  - "jira-sdlc"                        # after
  # rubric "a Files modified line listing .claude/sdlc.json, a Consumed by line listing /jira-sdlc, /commit-sdlc, /pr-sdlc"
  #   becomes "a Files modified line listing .sdlc/config.json, a Consumed by line listing jira-sdlc, commit-sdlc, pr-sdlc"

  # "#292: skip:true fields ... not prompted" (:374-378)
  - not-icontains-any [verifyPipelineTimeout, verifyPipelineInterval, verifyPipelineMaxIterations]   # deleted (rubric covers)

  # "#338: prerelease-compatible-silent" (:598-603)
  - type: not-icontains-any
    value: ["incompatible", "partial", "confirm", "Proceed with preRelease"]   # before
  - type: not-regex
    value: '(^|\n)[ \t]*"?Proceed with .?preRelease'                # after (compat prompt, SKILL.md:316)

  # pr-labels menu cases "not configured" negatives (:280, :310, :335) — sweep F-assertion-setup-sweep-3
  - type: not-icontains
    value: "not configured"                                        # before
  - type: not-regex
    value: '\[(set|not set)\][ \t]+pr-labels[ \t]+not configured'   # after
  ```

  T8 context addition, appended to the `project_context` of "Step 1 menu: pr.labels mode=rules with 1 rule ..." (:293-298):

  ```text
  The setup.js prepare output contains this pr-labels row in sections[] (fields omitted):
  {"id":"pr-labels","label":"pr-labels","state":"set","summary":"rules: 1 rule","locked":false,"configFile":".sdlc/config.json","configPath":"pr.labels","consumedBy":["pr-sdlc"],"filesModified":[".sdlc/config.json"],"optional":true,"delegatedTo":"setup-pr-labels","confirmDetected":false}
  ```
- names: fixture `setup-clean-project.md`; case descriptions quoted above.
- mirror: `plugins/sdlc-utilities/scripts/lib/setup-sections.js:237-248` (summarizePrLabels) and :327-339 (jira row); setup-sdlc SKILL.md:128 (status row) and :245-252 (verbose header).
- decisions: Decision 4 (shipFields stays `[]`); sweep candidate -4 (`"rules":`) is kept unless it can match prose, and reported.
- sync: none.

### Task 5: setup-sdlc-dimensions and pr-template datasets — negatives, retired menus, sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/setup-sdlc-dimensions.yaml` — T2 minimal and --no-copilot negatives, T9 continuation case, sweep
- Modify: `tests/promptfoo/datasets/setup-sdlc-pr-template.yaml` — T9 continuation case

**Notes:**
Findings F-assertion-setup-sweep-6 to -10. setup-dimensions.md:245-249 lists `/review-sdlc` and `/commit-sdlc` as follow-ups. setup-pr-template.md has no follow-up list (Decision 2).

**Acceptance criteria:**
- [ ] No case in these two files asserts `done` or an interactive selection menu.
- [ ] The minimal-project and --no-copilot negatives match only a written file path.
- [ ] Sweep candidates -6 and -9 are handled by the rule and reported.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/setup-sdlc-dimensions.yaml > /dev/null` and the same for `setup-sdlc-pr-template.yaml` exit 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): assertion edits, before → after:

  ```yaml
  # "--dimensions: shows workflow continuation menu after dimension setup" (setup-sdlc-dimensions.yaml:95-119)
  description: "setup-sdlc --dimensions: lists follow-up skills after dimension setup"   # renamed
  - icontains "done"                                               # deleted
  # /review-sdlc and /commit-sdlc icontains stay
  # rubric becomes: "After review dimension setup, the response lists follow-up skills, at minimum
  #   /review-sdlc and /commit-sdlc. It does not need to ask the user to pick one."

  # "--dimensions: minimal project still gets baseline dimension proposal" (:180-181)
  - type: not-regex
    value: "(security-review|api-review|data-integrity|test-coverage|monorepo|ci-cd)"   # before
    value: 'review-dimensions/(security-review|api-review|data-integrity|test-coverage|monorepo|ci-cd)[a-z-]*\.(md|ya?ml)'  # after
  - type: icontains                                                # added
    value: "code-quality-review"

  # "--dimensions: --no-copilot skips GitHub Copilot instructions step" (:199-200)
  - type: not-regex
    value: '(copilot instruction|\.github/instructions|instructions\.md)'   # before
    value: '\.github/instructions/[a-z0-9-]+\.instructions\.md'             # after

  # "--pr-template: shows workflow continuation menu after template customization" (setup-sdlc-pr-template.yaml:54-78)
  description: "setup-sdlc --pr-template: finishes with a summary after template customization"   # renamed
  - icontains "done"                                               # deleted
  - icontains "/commit-sdlc"                                       # deleted
  # /pr-sdlc icontains stays
  # rubric becomes: "After template customization, the response confirms the template was saved
  #   and validated and points to /pr-sdlc, which uses the template. It does not need to ask the user
  #   to pick a next action."
  ```
- names: case descriptions quoted above.
- mirror: `plugins/sdlc-utilities/skills/setup-sdlc/setup-dimensions.md:245-249` (What's Next).
- decisions: Decision 2; Key Decisions "Narrow or delete a negative check".
- sync: Task 6 uses the same rubric wording for the other follow-up cases.

### Task 6: execute-plan, commit, jira and received-review datasets — retired menus, sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — T9 continuation case, header comment
- Modify: `tests/promptfoo/datasets/commit-sdlc.yaml` — T9 continuation case, header comment, sweep
- Modify: `tests/promptfoo/datasets/jira-sdlc.yaml` — T9 continuation case, header comment, sweep
- Modify: `tests/promptfoo/datasets/received-review-sdlc.yaml` — T9 continuation case, header comment, sweep

**Notes:**
Findings F-assertion-setup-sweep-11 to -13, -16, -18, -23. Commit 1758f9f replaced the menus with "What's Next" lists. The S1 case (execute-plan-sdlc.yaml:138) is not edited: its `not-icontains "openspec archive"` becomes correct with Task 8.

**Acceptance criteria:**
- [ ] The four continuation cases assert the follow-up skills each SKILL.md lists and no `done` option.
- [ ] Every sweep row in the contract table is applied as written; each "delete" row whose rubric lacks the rule adds one rubric sentence; the task report shows each change as a before/after diff.
- [ ] `npx --yes js-yaml@4.1.0 <file> > /dev/null` exits 0 for each of the four datasets.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): continuation cases, before → after:

  ```yaml
  # execute-plan-sdlc.yaml:6-34
  - description: "execute-plan-sdlc: shows workflow continuation menu after plan execution"   # before
  - description: "execute-plan-sdlc: lists follow-up skills after plan execution"             # after
      # icontains /commit-sdlc, /pr-sdlc, /version-sdlc stay; add:
      - type: icontains
        value: "/review-sdlc"
      # deleted:
      - type: icontains
        value: "done"
      # rubric after:
      - type: llm-rubric
        value: >
          After plan execution, the response lists follow-up skills, at minimum /commit-sdlc,
          /review-sdlc, /version-sdlc and /pr-sdlc. It does not need to ask the user to pick one.

  # commit-sdlc.yaml:4-30
  - description: "commit-sdlc: shows workflow continuation menu after commit"     # before
  - description: "commit-sdlc: lists follow-up skills after commit"               # after
      # icontains /pr-sdlc, /version-sdlc, /review-sdlc stay; icontains "done" deleted
      # rubric after: "After committing, the response lists follow-up skills, at minimum
      #   /review-sdlc, /version-sdlc and /pr-sdlc. It does not need to ask the user to pick one."

  # jira-sdlc.yaml:12-33
  - description: "jira-sdlc: shows workflow continuation menu after Jira ticket created"   # before
  - description: "jira-sdlc: lists follow-up skills after Jira ticket created"             # after
      # icontains /plan-sdlc stays; icontains "done" deleted; add icontains "/execute-plan-sdlc"
      # rubric after: "After the ticket is created, the response lists follow-up skills, at minimum
      #   /plan-sdlc and /execute-plan-sdlc. It does not need to ask the user to pick one."

  # received-review-sdlc.yaml:40-61
  - description: "received-review-sdlc: shows workflow continuation menu after implementing fixes"   # before
  - description: "received-review-sdlc: lists follow-up skills after implementing fixes"             # after
      # icontains /commit-sdlc stays; icontains "done" deleted
      # rubric after: "After implementing review fixes, the response lists follow-up skills, at minimum
      #   /commit-sdlc. It does not need to ask the user to pick one."
  ```

  Header comments: `-- CORRECT: simulates ..., triggers workflow continuation` becomes `-- CORRECT: simulates ..., triggers the What's Next list` in all four files.

  Sweep rows (value at the line after `type:`; "delete" means delete the assertion and, when the case rubric does not state the same rule, add one rubric sentence that does):

  | File:line | Type | Value | Action |
  |---|---|---|---|
  | jira-sdlc.yaml:57 | not-regex | `(guess\|fabricat\|invent\|assume)` | delete |
  | jira-sdlc.yaml:193 | not-regex | `(PROJ\|BAZ\|QUUX\|TEAM)` | delete |
  | jira-sdlc.yaml:226 | not-regex | `transition:\s*"Done"` | keep (payload form) |
  | jira-sdlc.yaml:229 | not-regex | `(cache incomplete\|...\|--force-refresh)` | delete |
  | received-review-sdlc.yaml:134 | not-regex | `(implement.*fix\|applying.*change\|modifying\|editing.*file)` | delete |
  | received-review-sdlc.yaml:153 | not-regex | `(processing.*comment\|analyzing.*feedback\|implementing.*fix)` | delete |
  | received-review-sdlc.yaml:205 | not-regex | `(How to proceed\|implement.*edit.*skip\|Select.*option)` | delete |
  | received-review-sdlc.yaml:260 | not-regex | `(yes.*skip.*selective\|Should I reply\|How to proceed)` | delete |
  | received-review-sdlc.yaml:446 | not-regex | `fixed:` | narrow to `(^\|\n)[ \t]*fixed: ` (log line form) |
  | received-review-sdlc.yaml:508, :531 | not-regex | `Skill.*harden-sdlc` | delete |
  | received-review-sdlc.yaml:534, :570 | not-regex | `AskUserQuestion` | delete |
  | commit-sdlc.yaml:179 | not-icontains | `trap 'rm -f` | keep (command form) |
  | commit-sdlc.yaml:210 | not-icontains | `--no-verify` | narrow to not-regex `git commit[^\n]*--no-verify` |
  | commit-sdlc.yaml:231 | not-icontains | `git reset --soft` | narrow to not-regex `(^\|\n)[ \t]*git reset --soft` |
  | commit-sdlc.yaml:274 | not-icontains | `git commit -F` | narrow to not-regex `(^\|\n)[ \t]*git commit -F` |

  (`\|` in this table is a markdown escape; the YAML value uses a plain `|` as alternation.) Match each row by its value and case, not by line number (lines are HEAD 2e9a00a positions of the `type:` line).
- names: the four case descriptions above.
- mirror: Task 5 dimensions case wording; follow-up lists at execute-plan-sdlc SKILL.md:817-821, commit-sdlc SKILL.md:368-371, jira-sdlc SKILL.md:448-450, received-review-sdlc SKILL.md:697-698.
- decisions: Key Decisions "One task per dataset" and "Narrow or delete a negative check".
- sync: Task 5 rubric wording.

### Task 7: plan, harden, ship, verify-pipeline and error-report datasets — negative sweep

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — sweep, continuation `/commit-sdlc` check
- Modify: `tests/promptfoo/datasets/harden-sdlc.yaml` — sweep
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — sweep
- Modify: `tests/promptfoo/datasets/verify-pipeline-sdlc.yaml` — sweep
- Modify: `tests/promptfoo/datasets/error-report-sdlc.yaml` — sweep
- Modify: `tests/promptfoo/datasets/dataset-regex-exec.yaml` — case (a) floor `checked >= 320` lowered to `checked >= 300`, because this plan's assertion deletions leave 312 scanned regexes (added by the main session during ship, 2026-11-15)

**Notes:**
Findings F-assertion-setup-sweep-15, -17, -21, -22, -25, -26. These cases did not fail in this rerun; each row is a value that can appear in a sentence about what the skill does not do. Decision 3 covers plan-sdlc.yaml:100. This is the first task to drop if the wave must shrink.

**Acceptance criteria:**
- [ ] Every row in the contract table is applied as written; each "delete" row whose rubric lacks the rule adds one rubric sentence; the task report shows each change as a before/after diff.
- [ ] plan-sdlc.yaml:100 case asserts `/ship-sdlc` instead of `/commit-sdlc`; its rubric names ship, execute and done.
- [ ] `npx --yes js-yaml@4.1.0 <file> > /dev/null` exits 0 for each of the five datasets.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code): sweep rows (value at the line after `type:`; "delete" as in Task 6):

  | File:line | Type | Value | Action |
  |---|---|---|---|
  | plan-sdlc.yaml:146 | not-icontains | `Start OpenSpec flow` | narrow to not-regex `(^\|\n)[ \t]*(\d+\.\|-)?[ \t]*\**Start OpenSpec flow` (menu option form) |
  | plan-sdlc.yaml:206 | not-icontains | `Initialize OpenSpec` | narrow the same way |
  | plan-sdlc.yaml:313, :315 | not-icontains | `Found existing plan draft`, `Resume from critique` | narrow the same way |
  | plan-sdlc.yaml:318, :320 | not-icontains | `Requirements-to-task mapping`, `Approval loop is unbounded` | narrow the same way |
  | plan-sdlc.yaml:393, :395 | not-icontains | `architecture`, `security` | delete |
  | plan-sdlc.yaml:413 | not-icontains | `using fallback inline exploration` | delete |
  | plan-sdlc.yaml:450 | not-icontains | `web-only` | delete |
  | plan-sdlc.yaml:467 | not-icontains | `plan-explore-orchestrator` | delete |
  | plan-sdlc.yaml:1370 | not-icontains | `- change:` | keep (block line form) |
  | plan-sdlc.yaml:1485 | not-regex | `model\W{0,5}[Oo]pus` | delete |
  | harden-sdlc.yaml:32 | not-regex | `(silently writ\|auto.appl\|without.*approval\|skipped.*approval)` | delete |
  | harden-sdlc.yaml:137 | not-regex | `(plan-guardrails proposal\|review-dimensions proposal\|copilot-instructions proposal\|apply.*proposal)` | delete |
  | harden-sdlc.yaml:192 | not-regex | `(dispatch error-report-sdlc\|file.*GitHub issue\|upstream.report.offer\|plugin defect)` | delete |
  | harden-sdlc.yaml:211 | not-regex | `(dispatch.*orchestrator\|run.*prepare\|propose.*hardening)` | delete |
  | harden-sdlc.yaml:224 | not-regex | `(dispatch.*orchestrator\|run.*prepare\|propose.*hardening)` | delete |
  | harden-sdlc.yaml:239 | not-regex | `(crash\|abort.*missing.*config\|fatal.*sdlc\\.json)` | delete |
  | harden-sdlc.yaml:254 | not-regex | `(write.*\\.claude/sdlc\\.json\|edit.*review-dimensions\|append.*to.*sdlc\\.json)` | delete |
  | harden-sdlc.yaml:269 | not-regex | `(both.*written\|all.*proposals.*applied\|skip.*also.*written)` | delete |
  | harden-sdlc.yaml:287 | not-regex | `(accum.*both\|batch.*write\|collect.*then.*write\|write.*together.*end\|all.*at.*once)` | delete |
  | harden-sdlc.yaml:313 | not-regex | `(relax.*to.*warning\|downgrade.*severity\|remove.*guardrail\|weaken.*description)` | delete |
  | harden-sdlc.yaml:332 | not-regex | `(silently.*write\|skip.*validation\|ignore.*validator)` | delete |
  | harden-sdlc.yaml:382 | not-regex | `(action.*add.*scope\|new.*scope.*guardrail)` | delete |
  | verify-pipeline-sdlc.yaml:20 | not-regex | `(git commit\|git push)` | narrow to `(^\|\n)[ \t]*git (commit\|push)\b` |
  | verify-pipeline-sdlc.yaml:35 | not-regex | `(apply.*fix.*automatically\|auto.*apply.*Edit)` | delete |
  | verify-pipeline-sdlc.yaml:48 | not-regex | `(auto.apply\|fix-applied)` | narrow to `"status":\s*"fix-applied"` |
  | verify-pipeline-sdlc.yaml:103 | not-regex | `"status":\s*"fix-applied"` | keep (JSON form) |
  | ship-sdlc.yaml:151, :666 | not-regex | `(AskUserQuestion)` | delete |
  | ship-sdlc.yaml:303 | not-regex | `\|[^\n\|]*pr-sdlc[^\n]*--draft` | keep (table row form) |
  | ship-sdlc.yaml:487 | not-icontains | `1foo` | keep (not in the case context) |
  | ship-sdlc.yaml:512 | not-icontains | `Pipeline:` | narrow to not-regex `(^\|\n)[ \t]*Pipeline:` |
  | ship-sdlc.yaml:693 | not-icontains | `Skill tool` | delete |
  | ship-sdlc.yaml:1021 | not-icontains | `→ Run openspec validate --strict` | narrow to not-regex `(^\|\n)[ \t]*→ Run openspec validate --strict` |
  | ship-sdlc.yaml:1095 | not-icontains | `ship-init.js` | delete |
  | error-report-sdlc.yaml:49 | not-regex | `(propose.*issue\|create.*GitHub issue\|draft.*issue\|assemble.*issue)` | delete (contradicts the :53 positive) |

  (`\|` in this table is a markdown escape; the YAML value uses a plain `|` as alternation; a literal `|` inside a value is escaped as `\|`, F-44.)

  Match each row by its value and case, not by line number: an earlier deletion in the same file shifts later lines. The line numbers are HEAD 2e9a00a positions of the `type:` line.

  ```yaml
  # plan-sdlc.yaml:113-122 ("Step 7 handoff" continuation case)
  - icontains "/commit-sdlc"                                       # before
  - icontains "/ship-sdlc"                                         # after
  # rubric "execute (/execute-plan-sdlc), commit (/commit-sdlc), and done" becomes
  #   "ship (/ship-sdlc), execute (/execute-plan-sdlc), and done"
  ```
- names: the files and lines above.
- mirror: plan-sdlc SKILL.md "Workflow Continuation" (ship / execute / done).
- decisions: Decision 1 (bounded sweep), Decision 3; a regex that scans commands must not match text inside quotes (F-51), so command forms anchor at line start.
- sync: none.

### Task 8: execute-plan-sdlc archive rule (S1)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — S1 rule after the `ok === false` block

**Notes:**
Findings F-fixtures-specs-headless-8, -9, -11. Spec R24 (`docs/specs/execute-plan-sdlc.md:143`) already says "the suggestion is NOT emitted" when validation fails; a conditional later-step hint is a suggestion, so the spec needs no change (Decision 5) and the copy rule for the spec does not fire. The test is the existing case at execute-plan-sdlc.yaml:138 (`not-icontains "openspec archive"`). `docs/skills/execute-plan-sdlc.md:382` was checked and needs no change (Decision 6).

**Acceptance criteria:**
- [ ] openspec-tasks.md says no `openspec archive` command is printed anywhere in the run's output when validation fails, including a later or conditional step, and cites R24.
- [ ] No other line of openspec-tasks.md changes.
- [ ] Review check: the existing case "execute-plan-sdlc: suppresses archive suggestion when validation fails" (execute-plan-sdlc.yaml:138) still asserts `not-icontains "openspec archive"`; it is the owner-run behavioural check for this rule (no behavioural run in ship).

**Contract:**
- shape (code):

  ```diff
  # plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md:98-103
   5. **If `ok === false`:** emit the validation errors and suppress the archive suggestion:
      ```
      OpenSpec validation failed for change "<name>":
      <stderr output>
      Fix validation issues before archiving.
      ```
  +   Print no `openspec archive` command anywhere in this run's output, not even as a later or conditional step ("when it passes, run ..."). The line `Fix validation issues before archiving.` is the only archive wording. <!-- implements R24 -->
  ```
- names: rule sentence above; spec id `R24`.
- mirror: the `<!-- implements ... -->` comment style used across SKILL.md files.
- decisions: Decision 5 (no spec change).
- sync: none.

### Task 9: headless-github cases — live gh stub data (#9392)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `tests/promptfoo/datasets/headless-github.yaml` — `GH_STUB_DATA` in five `script_env` lines

**Notes:**
Finding F-fixtures-specs-headless-12 (ledger F-101). The `--check-payload` step runs the R37 live reads, which only the `live` stub scenario routes. The view case at :13 never reaches `--check-payload` and stays as is. The headless runner is owner-only, so the change is checked by parse and review only.

**Acceptance criteria:**
- [ ] The cases at :41, :69, :99, :129 and :165 set `"GH_STUB_DATA": "live"`; the case at :13 is unchanged.
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/headless-github.yaml > /dev/null` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex|fixture-refs"` passes.

**Contract:**
- shape (code):

  ```diff
  -    script_env: '{"SDLC_LINKS_OFFLINE": "1"}'
  +    script_env: '{"SDLC_LINKS_OFFLINE": "1", "GH_STUB_DATA": "live"}'
  ```
  at the five lines named above (cases github-create, github-approval, github-auto-comment, github-auto-create, github-content-as-data).
- names: `GH_STUB_DATA` (read by `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin/gh:179` from the environment).
- mirror: `tests/promptfoo/datasets/github-sdlc-exec.yaml:1440-1448`.
- decisions: no `GH_TOKEN` added (the headless session needs real credentials, header comment :1-3).
- sync: none.

### Task 10: review-sdlc spec R8 and phase 4 wording

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — R8 and phase 4 wording, history row
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy
- Modify: `docs/skills/review-sdlc.md` — check only; change only a sentence that says the manifest is deleted (none found at HEAD)
- Modify: `site/src/content-source/skills/review-sdlc.md` — check only, byte copy of the doc if it changes
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — check only (copy rule)
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — check only (copy rule)
- Modify: `site/src/data/skills-meta.ts` — check only (copy rule)

**Notes:**
Findings F-fixtures-specs-headless-3 to -5, -7. The project copy rule (`.sdlc/config.json` plan.copyRules) requires every user doc and companion of review-sdlc to be listed when its spec changes. A grep at HEAD for manifest clean-up wording in the five check-only files found none, so they are expected to stay unchanged; they are listed so a needed edit is allowed. The seven entries exceed the 5-file guide only by check-only files.

**Acceptance criteria:**
- [ ] R8 and phase 4 match G3 (diff dir removed, manifest kept); no id is renumbered or added.
- [ ] `cmp docs/specs/review-sdlc.md site/src/content-source/specs/review-sdlc.md` exits 0 (copy with `cp`, never `site/scripts/copy-docs.mjs`); the same for the skill doc if it changed.
- [ ] `grep -n -i "manifest" <file>` on each check-only file shows no sentence that says the manifest file is deleted after the review.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): text edits, before → after:

  ```diff
  # docs/specs/review-sdlc.md:55
  -- R8: Clean up the manifest temp file after completion
  +- R8: Remove `diff_dir` after the terminal branch (Step 6); the manifest file is kept (G3)
  # docs/specs/review-sdlc.md:67
  -4. POST — skill handles PR posting decision in main context (`yes` / `save` / `cancel` or no-PR options), then cleans up manifest and diff dir
  +4. POST — skill handles PR posting decision in main context (`yes` / `save` / `cancel` or no-PR options); Step 6 then removes the diff dir and keeps the manifest file (G3)
  ```

  History row appended to the `### Issue trail` table: `| R8 | wording aligned with G3, manifest kept, #9393 |`.
- names: `R8` (modified text), phase 4 bullet.
- mirror: G3 at `docs/specs/review-sdlc.md:110`; history table in `## Appendix — history`.
- decisions: the issue number appears only in the appendix (AGENTS.md spec shape).
- sync: site byte copy; Task 2 rubric wording for the manifest.

## Final Shape

- All behavioural datasets named in this plan assert artifacts, not wording.
  - A negative check matches only a rendered line or a command at line start.
  - Where no fixed form exists, the llm-rubric carries the rule alone.
- Title and label checks in pr-sdlc anchor on the `PR Title:` and `Labels:` lines.
- review-sdlc rubrics and fixtures say "diff dir removed, manifest kept", matching the skill, G3 and the new R8 wording.
- version-sdlc cases no longer forbid words that their context must print. The init case expects `.sdlc/config.json`.
- `setup-clean-project.md` mirrors the real setup.js output: 14 sections, `.sdlc/config.json` paths, jira fields and `preReleaseCompat`.
- Continuation cases expect the passive "What's Next" lists. plan-sdlc keeps its live menu.
- execute-plan-sdlc prints no `openspec archive` text after a failed validation (openspec-tasks.md, citing R24).
- review-sdlc spec R8 and phase 4 match G3: the diff dir is removed, the manifest file is kept.
- Five headless github cases run with the `live` gh stub scenario.
- No script, provider or harness code changes. Ship gives a patch bump for a test/docs change.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 2 | 2 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 T1 | Task 1 | covered |
| 2 T2 | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 | covered |
| 3 T3 | Task 3, Task 4 | covered |
| 4 T4 | Task 2 | covered |
| 5 T5 | Task 2 | covered |
| 6 T6 | Task 3 | covered |
| 7 T7 | Task 4 | covered |
| 8 T8 | Task 4 | covered |
| 9 T9 | Task 5, Task 6, Task 7 | covered |
| 10 S1 | Task 8 | covered |
| 11 R8 spec | Task 10 | covered |
| 12 #9392 | Task 9 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
