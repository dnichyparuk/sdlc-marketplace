# Lean Wave 3 Ship Models and Setup Implementation Plan

**Commit:** `feat(#9351): ship - step models config, setup cleanup, PR fixes`
**Goal:**
- Run ship's execute step on sonnet/high by default (#9340).
- Let a project override the model and effort of each ship step from `.sdlc/local.json` (#9341).
- Close the PR #70 leftovers in pr-sdlc and ship-sdlc (#9342).
- Remove the cause of the headless EISDIR exec failure (#9343, ledger F-27).
- Clean up setup-sdlc: W6a.6, W6a.7 (rest), W6a.8, W6a.9, the #9190 setup part and the W6c.10 setup Done-when.
**Architecture:** Specs first (ship R90, pr P20, setup R9/R10/R14/R-walk-3/I6/P-scan), then scripts with exec cases, then SKILL.md and docs. The ship override is resolved in `ship.js` next to `stepAgentCache` and reaches the Agent call as `dispatchModel`/`dispatchEffort`; the setup scan moves from model-run Glob calls into `scripts/lib/project-scan.js` behind `setup.js --scan`.
**Source:** conversation context (wave brief for #9351; `assessment/03-plan/consolidated-plan.md` sections W6a.6 to W6a.9 and W6c.10)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-prepare: computeSteps includes model|ship-step-models:|ship-step: \(m\)|pr-prepare-testing:|review-prepare-plan:|setup-prepare|guardrails-prepare" -j 2 --no-cache`, then `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`, `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`

---

## Context

**What problem does this change solve?**

- Ship's execute step runs on opus. The owner wants sonnet/high as the default ("set default to sonet/high").
- A project cannot change the model or effort of one ship step without editing the plugin's agent files.
- PR #70 left four review findings open: an unrestricted `--testing-file` read, a missing field row, a stale step-argument table and weak tests.
- In a headless `claude -p` ship session the promptfoo exec suite failed with EISDIR (a "this path is a directory" read error). The main session passed. So headless workers had no real test evidence.
- setup-sdlc still carries dead sections, stale step numbers, two near-identical guardrails sub-flows, a model-run scan of about 50 Glob calls, and shell variables used across separate Bash calls (each Bash call is its own shell, so such a variable is empty).

**What prompted this change now?**

- Lean wave 3 (#9351) groups the owner's 2026-11-10 asks (#9340, #9341), the PR #70 leftovers (#9342), F-27 (#9343) and the setup part of the M9 assessment plan.

**What does success look like?**

- `ship.js --has-plan` shows `ship-step-execute` with `model: sonnet`, `effort: high`.
- A `ship.stepModels` entry in `.sdlc/local.json` changes that step's dispatch model and effort; an invalid entry stops prepare with a clear error.
- The targeted exec cases pass in a headless session too.
- setup-sdlc matches the Done-when lines of W6a.6 to W6a.9 and W6c.10 (setup part).

## Research Findings

Every item was re-checked at HEAD `5a44a90` (discovery brief findings `F-<dim>-<n>`). All items reproduce. Two facts in the wave brief were wrong:

- The ship spec does not pin opus. P7 (`docs/specs/ship-sdlc.md:372`) and C16 (`:457`) say the model comes from the agent file, and C16 says dispatch never passes `model` or `effort` (F-ship-step-model-default-and-override-4). So #9340 needs no spec edit. #9341 does need C16 and P7 amended, because the override must reach the Agent call.
- Ship config lives in `.sdlc/local.json`, not `.sdlc/config.json`. `readSection(root, 'ship')` reads the local file (`scripts/lib/config.js:329-332`), and a `ship` key in `.sdlc/config.json` counts as a misplaced section that triggers migration (`PROJECT_SECTIONS` at `config.js:315`, `setup.js:194`) (F-ship-step-model-default-and-override-9).

Item by item:

- **#9340.** `agents/ship-step-execute.md:4-5` pins `model: opus`, `effort: high`. `docs/cost-tiers.md:59` has the matching row; `validate-cost-tiers.js` compares the two. Workers (`execute-worker-complex` opus) and retry escalation do not read this agent (F-ship-step-model-default-and-override-1, -2, -6). Two exec cases assert opus: `ship-prepare-exec.yaml` "computeSteps includes model field per step" and "ship-step: (m)" (F-ship-step-model-default-and-override-5).
- **#9341.** `stepAgent(file)` at `ship.js:450-457` caches `{ agent, model, effort }` from the agent file; seven call sites spread it into `steps[]`. `commit` and `commit-fixes` share one agent file, so override keys must be step names (F-ship-step-model-default-and-override-7). The stepper copies `model`/`effort` into `step.data` at `ship.js:2167`. Model and effort validators already exist in `scripts/lib/dimensions.js` (`MODEL_ALIASES`, `MODEL_ID_RE` at :110-111, `VALID_EFFORTS` at :75; only `VALID_EFFORTS` is exported) (F-ship-step-model-default-and-override-11). `shipSection` in `schemas/sdlc-local.schema.json` has `additionalProperties: false`, so the new key must be added there. The next free ship spec id is R90 (F-ship-step-model-default-and-override-12). plan-sdlc already uses the same pattern: pass `model`/`effort` on the Agent call only when the prepare entry carries a non-null value (`skills/plan-sdlc/review-loop.md:28`).
- **#9342.** (a) `pr.js:91-92` resolves any path and `pr.js:564-572` reads it into `testingSummary`, which lands in the public PR body. The only producer, ship, writes `<stateDir>/pr-testing-<slug>.md` (`ship.js:1795-1815`) (F-pr-testing-file-and-test-leftovers-1). (b) The key-fields table in `pr-sdlc/SKILL.md:150-169` has no `testingSummary` row; the spec says "P1-P18" though P19 and P20 exist (-2). (c) `ship-sdlc/SKILL.md` table rows 3 and 7 omit `--plan` and `--testing-file` (-3). (d) The testing cases read `setup.sh` and `pr.js` as testing files, and the `--plan` case uses `linked-file.txt` (-4).
- **#9343 (F-27).** The debug log of the failing run shows promptfoo loading `script_cwd` as a file right before EISDIR. The datasets set `project_root: "file://fixtures-fs/<dir>"` and `script_cwd: "{{project_root}}"`. promptfoo 0.125.1 renders that template and then reads the `file://` directory itself, before our `transformVars` runs. The failing runs used the npx cache of 0.125.1; the passing ones used 0.123.1. Nothing in the repo pins the version: `tests/promptfoo/README.md` says `npm install -g promptfoo`, and `Taskfile.yml` and `lefthook.yml` call bare `promptfoo` (F-promptfoo-exec-eisdir-headless-1, -2). The headless probe at the pinned 0.123.1 (see Key Decisions) showed no EISDIR. Instead it showed a second headless-only failure: the `pr-prepare-testing` cases call the real `gh`, which is not logged in there. `pr-prepare-exec.yaml` has no `script_stub_bin` line at all.
- **setup-sdlc.** W6a.6: dead `3.workspace` and `3.hooks` sections (`SKILL.md:416-539`), the legacy table (`:565-579`), the phantom `--auto` (`:616`), `Steps 1 → 2 → 3 → 5` (`:90`), `Steps 3a–3f` (`:583`, `:625`), and `received-review` missing from three id lists (`:24`, `:26`, `:283`) (F-setup-sdlc-w6a-w6c-plan-items-1 to -4). W6a.7: the open sub-items in four sub-flows; the two Glob sub-items were done in M5.1 wave 7 (-5, -6). W6a.8: two guardrails sub-flows, 130 and 105 lines (-7). W6a.9: no `project-scan.js`, no `--scan`, `scan-patterns.md` with 52 patterns (-8). W6c.10: 15 `# Substitute <PLUGIN_ROOT> from` fence comments in setup files, and the SKILL.md blockquote lacks the fallback sentence (-9).
- **#9190 setup part.** `SKILL.md:640` redirects into `"$PREPARE_OUTPUT_FILE"`, a variable set in an earlier Bash call, so it is empty (F-setup-sdlc-cross-call-var-literals-1). `SKILL.md:63`, `:631` and `setup-openspec.md:35` name the path as `$VAR` in prose (-2, -3, -4). The diff-preview block (`SKILL.md:585-603`) prints `"$BEFORE_JSON"` and `"$AFTER_JSON"`, which no call sets, and captures `DIFF_JSON=$(… node -e …)`. Planning also found `setup-dimensions.md:58-62`: one block sets `SCRIPT=…` and the next line runs `node "$SCRIPT"` as a separate call. The fix template is the plain-call pattern: run one plain Bash call, take the printed path as a literal, and clean up with a separate `rm` (`ship-sdlc/SKILL.md:79-83`).
- **Release.** `CHANGELOG.md:8` `[Unreleased]` is empty and `plugin.json` is at 0.49.0. Ship's version step bumps the minor version to 0.50.0.

Test and build commands: exec cases in `tests/promptfoo/datasets/*-exec.yaml` run through `providers/script-runner.js`. Fixtures under `tests/promptfoo/fixtures-fs/` are copied to a temp directory, and their `setup.sh` runs first. Site copies under `site/src/content-source/` are byte copies of `docs/` files (`node site/scripts/copy-docs.mjs`).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| #9341 config file | no | `ship.stepModels` lives in `.sdlc/local.json` (the `ship` section), not `.sdlc/config.json` | A `ship` key in `.sdlc/config.json` is a misplaced section that triggers migration; every ship setting already lives in the local file |
| #9340 spec edit | no | No spec edit for #9340; C16 and P7 change only for #9341 | The spec never pinned opus (P7/C16 defer to the agent file) |
| #9342 (a) | no | Restricts `--testing-file` to a regular file inside the current git worktree or the ship state directory; anything else is ignored with a warning | Keeps the standalone flag useful for files in the repo and closes reads of arbitrary paths into a public PR body |
| #9343 fix | no | Pins `promptfoo@0.123.1` in `Taskfile.yml`, `lefthook.yml` and `tests/promptfoo/README.md`; adds `script_stub_bin` to the `pr-prepare-testing` cases | The EISDIR comes from the unpinned version; the gh-auth failure is a second headless-only gap; rewriting about 1,200 `script_cwd` values is out of proportion |
| #9343 AGENTS.md | no | Does not edit `AGENTS.md` | Project-instruction files are a permission-sensitive surface for a headless executor; the README and task runners carry the pin |
| W6c.10 scope | no | Only the setup-sdlc part: fence comments, the blockquote fallback sentence, R-refs as HTML comments, `#NNN` dropped in setup files | Wave brief item 7; other skills are owned by other waves |
| W6a.6 optional | no | Removes the stale `workspace` sections from `docs/skills/setup-sdlc.md` | Spec R24 already withdraws the section |
| Extra #9190 site | no | Also fixes `setup-dimensions.md` `$SCRIPT` and the diff-preview `$BEFORE_JSON`/`$AFTER_JSON` | Same defect class; found while re-verifying |
| Setup wizard for stepModels | no | No new setup questionnaire field; documented as a hand-edited key | The field loop has no object-of-objects field type; adding one is a new feature |

## Decisions taken without the owner

No owner was available. Each choice below took the recommended, most conservative option.

1. **Where `ship.stepModels` lives.** In `.sdlc/local.json` under `ship`, read through the existing `loadConfig`. The brief said `.sdlc/config.json`, but there a `ship` key is a misplaced section that triggers migration.
2. **Invalid override.** A bad step key, model or effort is a prepare `errors[]` entry, so prepare exits 1 and ship refuses to start. This matches how ship treats bad `--bump` or `--review-rounds` values.
3. **Accepted models and efforts.** Models: `haiku`, `sonnet`, `opus`, `fable` or a `claude-*` id (the `dimensions.js` rule, reused, not copied). Efforts: `low`, `medium`, `high`, `xhigh`, `max`.
4. **`--testing-file` restriction.** Allow a regular file inside the current git worktree or the state directory (`resolveStateDir()`); otherwise warn and leave `testingSummary` null.
5. **F-27.** Pin promptfoo 0.123.1 in the runners and the README. The datasets stay as they are. The lean skill (outside the repo) is not edited.
6. **W6a.8 prompt drift.** Keep both prompt shapes (plan: Stage A and B; execute: one prompt with `custom`), as W6a.8 says. Unifying them stays maintainer open point 5.

## Key Decisions

- **Override travels as `dispatchModel`/`dispatchEffort`, not by rewriting `agent`.** The Agent tool takes `model` and `effort` per call, and a per-call value overrides the agent file. plan-sdlc already does this (`review-loop.md:28`). A step with no override carries no `dispatchModel`, so today's dispatch stays byte-identical.

- **`steps[].model`/`effort` show the effective value.** With an override, the rendered pipeline table and `step.data.model` show what will run, not the file default. A new `steps[].modelSource` (`agent` | `config`) says where it came from.

- **Keys are step names, not agent files.** `commit` and `commit-fixes` share `ship-step-commit.md`. Step names let a project tune the fix commit apart from the main commit.

- **Validators are exported from `dimensions.js`, not duplicated.** `MODEL_ALIASES` and `MODEL_ID_RE` already define the accepted models for review dimensions. One definition keeps the two config surfaces consistent.

- **`--testing-file` is restricted, not only documented.** Documenting alone leaves a prompt-injected path able to publish a secret file. The worktree-or-state-dir rule keeps both real uses (ship's state file and a user's repo file) working.

- **Pin the promptfoo version rather than rewrite datasets.** About 1,200 cases use `script_cwd: "{{project_root}}"`. Pinning removes the trigger in four lines. A later version bump can then be a deliberate change with its own test run.

- **Scan extraction is verbatim first.** `project-scan.js` takes the guardrails helpers unchanged, and `guardrails-prepare-exec.yaml` stays unchanged as the regression. New behaviour (structure walk, hosting, git, jira evidence) is added only in `scanProject`.

- **W6c.10 is applied inside each setup task.** The fence-comment removal touches the same files as W6a.6 to W6a.8. Doing it in those tasks avoids a seventh file in one task and a second pass over each file.

- **Task bundles.** Tasks 8, 10, 12 and 16 each carry more than one small edit on purpose. Each bundle edits one file set once: Task 8 is the pr testing-file change plus its sibling review-prepare test leftover (both #9342 (d)); Task 10 is every edit to setup SKILL.md before the guardrail merge; Task 12 adds one `ship.stepModels` sentence because it is the task that edits `docs/skills/setup-sdlc.md` after Task 10; Task 16 is the release task the wave brief asks for. Splitting them would edit the same file twice in a row.

- **Root problem.** Model choice, test tooling and setup instructions each sit in a place the user or a headless worker cannot control or trust: a pinned agent file, an unpinned test runner, and setup text that tells the model to use values that do not survive between Bash calls.

- **Who fails if this ships wrong.** Every ship user: a bad override could dispatch the wrong model or stop prepare. pr-sdlc users who pass a testing file from outside the repo. Every setup-sdlc user: the scan and the guardrails sub-flows are on the first-use path. Lean headless workers lose their test evidence if the pin is wrong.

- **Smallest viable cut and why the rest stays.** The smallest cut is #9340, #9341 and #9342 (Tasks 1-8). The owner put F-27 (Task 9) and the setup items (Tasks 10-15) into this wave explicitly; they are in the wave brief, not added by this plan.

- **Non-goals.**
  - No jira-sdlc changes (W6a.1-W6a.5, #9189, the #9190 jira part).
  - No `LINK_EXIT=$?` fixes in review, version, received-review or jira SKILL.md (same class, other skills).
  - No setup wizard question for `ship.stepModels`; no override for inline steps or for execute's workers.
  - No unifying of the plan and execute guardrail prompts.
  - No rewrite of the about 1,200 `script_cwd: "{{project_root}}"` dataset values.
  - No edit to the lean orchestration skill (outside the repo).
  - W6c.10 sub-items 3-5 (other skills, `scripts/README.md`, manifests) stay with the M9 sweep.

- **Workspace modes.** `ship.stepModels` is read through `readSection(root, 'ship')`, which resolves `.sdlc/local.json` in the main worktree (`resolveSdlcRoot`), so branch and worktree mode read the same file. `pr.js` takes the state directory from `resolveStateDir()` and the worktree root from its active worktree, so ship's own testing file passes in both modes. `scanProject` reads content from the active worktree and review dimensions from the main worktree.

- **New flags.** `--scan` and `--scan-prs` are new to `setup.js`. `grep -l "'--scan'" plugins/sdlc-utilities/scripts/skill/*.js` finds no other prepare script that defines them. `--testing-file` keeps its one meaning (pr.js only).

- **Repo-local edits.** `Taskfile.yml`, `lefthook.yml` and `tests/promptfoo/README.md` are this repo's own test tooling (dogfooding). No consumer project runs them, so the project-agnostic rule does not apply.

- **PR links.** The PR body names `Closes #9340`, `Closes #9341`, `Closes #9342`, `Closes #9343` and `Refs #9190, #9351`.

## Contract Examples

**code** (Task 5):

```markdown
**Contract:**
- shape (code): `resolveStepModels(cfg) -> { overrides: { [step]: { model?, effort? } }, errors: string[] }` in `scripts/skill/ship.js`; `applyStepModel(base, step, overrides) -> { agent, model, effort, modelSource, dispatchModel?, dispatchEffort? }`.
- names: `resolveStepModels`, `applyStepModel`, `STEP_MODEL_KEYS`, `modelSource`, `dispatchModel`, `dispatchEffort`.
- mirror: `stepAgent` at `plugins/sdlc-utilities/scripts/skill/ship.js:440-457`.
- decisions: errors go to prepare `errors[]` (Decisions 2); the cache is never mutated.
- sync: `skills/ship-sdlc/SKILL.md` Step 5 item 5 passes `dispatchModel`/`dispatchEffort` (Task 7).
```

**docs** (Task 7):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md`. Add a `### Step models` subsection (audience: end users) after the agent paragraph in `## How the Pipeline Works`; one JSON example; cross-link to `docs/cost-tiers.md` §5.
- names: heading `### Step models`.
- mirror: the agent paragraph at `docs/skills/ship-sdlc.md:104`.
- decisions: user-facing prose only.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

**openspec** (Task 2):

```markdown
**Contract:**
- shape (openspec): ADD `R90` to `docs/specs/ship-sdlc.md` under `## Dispatch and routing`; MODIFY `C16` and `P7`; numbering continues from `R89`.
- names: `R90` (new), `C16`, `P7` (modified).
- mirror: requirement style of `R88`/`R89` at `docs/specs/ship-sdlc.md:209-211`.
- decisions: numeric id (R58 stays unused, never reused).
- sync: Task 5 implements R90; Task 7 cites it in SKILL.md.
```

## Tasks

### Task 1: ship-step-execute defaults to sonnet/high

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests, lint

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-execute.md` — frontmatter `model: opus` → `model: sonnet`
- Modify: `docs/cost-tiers.md` — §4 row and rationale; §5 ship.js bullet names `ship.stepModels`
- Modify: `site/src/content-source/cost-tiers.md` — byte copy
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — two cases that assert opus

**Notes:** Implements #9340 (F-ship-step-model-default-and-override-1, -2, -5). The dependency on Task 2 is ordering only: the §5 sentence cites R90. Workers and retry escalation do not read this agent (-6), so the change ends here. The §5 sentence documents Task 5's override in the same edit, so `cost-tiers.md` is touched once.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js` exits 0.
- [ ] `ship.js --has-plan` on `project-sdlc-gitignore-inner` shows the execute step with `"model": "sonnet"` and `"effort": "high"`.
- [ ] No exec case asserts `"model": "opus"` for a ship step.
- [ ] `cmp docs/cost-tiers.md site/src/content-source/cost-tiers.md` exits 0.

**Contract:**
- shape (docs): frontmatter and table edits below.

  ```diff
   name: ship-step-execute
  -model: opus
  +model: sonnet
   effort: high
  ```

  | Op | Where | Value |
  |---|---|---|
  | replace | `docs/cost-tiers.md` §4 row `ship-step-execute` | `\| ship-step-execute \| sonnet \| high \| Runs execute-plan-sdlc for ship; the orchestration is script-driven and the workers carry their own tiers (complex tasks run on execute-worker-complex, opus) \|` |
  | replace | §5 bullet `ship.js` | `` `plugins/sdlc-utilities/scripts/skill/ship.js` — reads `model`/`effort` from `agents/ship-step-*.md`; a `ship.stepModels.<step>` entry in `.sdlc/local.json` overrides them per step and is passed on the Agent call (ship-sdlc R90). `` |

  Test edits in `ship-prepare-exec.yaml`:

  ```diff
   - description: "ship-prepare: computeSteps includes model field per step"
   ...
  -    - type: icontains
  -      value: '"model": "opus"'
  +    - type: javascript
  +      value: |
  +        const o = JSON.parse(output);
  +        const e = o.steps.find(s => s.name === 'execute');
  +        return e && e.model === 'sonnet' && e.effort === 'high' ? true : `FAIL: ${JSON.stringify(e)}`;
  ```

  ```diff
  -        if (e.step.data.skill !== 'execute-plan-sdlc' || e.step.data.model !== 'opus') return `FAIL: data ${JSON.stringify(e.step.data)}`;
  +        if (e.step.data.skill !== 'execute-plan-sdlc' || e.step.data.model !== 'sonnet') return `FAIL: data ${JSON.stringify(e.step.data)}`;
  ```
- names: `ship-step-execute`; cases "ship-prepare: computeSteps includes model field per step", "ship-step: (m) worktree/continue ledger skips branch_prepare after confirm_pipeline".
- mirror: the `ship-step-review` row at `docs/cost-tiers.md:61`.
- decisions: effort stays `high`; workers unchanged.
- sync: `site/src/content-source/cost-tiers.md` byte copy; `validate-cost-tiers.js` compares §4 with the frontmatter.

### Task 2: ship-sdlc spec R90, C16 and P7 for step model overrides

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R90; amend C16 and P7
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Spec first, per AGENTS.md principle 1 (F-ship-step-model-default-and-override-4, -8, -12). R90 goes next to R88 and R89, which also describe step arguments and dispatch.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] R90 appears once, after R89, with an Acceptance line naming the `ship-step-models:` exec cases.
- [ ] C16 no longer says "never pass `model` or `effort`" without the R90 exception.
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD R90 after R89; MODIFY P7 and C16 as rendered.

  ```text
  - R90: `ship.stepModels` in `.sdlc/local.json` is an optional object keyed by step name (`execute`, `commit`, `review`, `received-review`, `commit-fixes`, `version`, `pr`). Each value is `{ model?, effort? }` with at least one key; `model` is `haiku`, `sonnet`, `opus`, `fable` or a `claude-*` id, `effort` is `low`, `medium`, `high`, `xhigh` or `max`. For a step with an entry, `steps[].model`/`steps[].effort` hold the entry's value (the agent file's value for a key the entry omits), `steps[].modelSource` is `config`, and `steps[].dispatchModel`/`steps[].dispatchEffort` carry the entry's values; `step.data` of the dispatch step carries the same two keys. Steps without an entry have `modelSource: agent` and no dispatch keys. An unknown step key, a non-object value or an invalid model or effort is a prepare `errors[]` entry naming the key and the value.
    - Acceptance: exec cases whose descriptions start with `ship-step-models:`.
  ```

  ```diff
  -- P7: `steps[].agent`, `steps[].model` and `steps[].effort` (strings) — the step's agent (`sdlc:ship-step-<step>`; commit-fixes uses `sdlc:ship-step-commit`) and the model and effort `skill/ship.js` reads from that agent file; inline steps keep a render-only `model`. Dispatch passes `agent` only (C16); the values are tuning, see `docs/cost-tiers.md` §4–§5.
  +- P7: `steps[].agent`, `steps[].model` and `steps[].effort` (strings) — the step's agent (`sdlc:ship-step-<step>`; commit-fixes uses `sdlc:ship-step-commit`) and the model and effort that run it: the agent file's values, or the `ship.stepModels` entry's values (R90); `steps[].modelSource` (`agent` | `config`) and, for `config`, `steps[].dispatchModel`/`steps[].dispatchEffort`. Inline steps keep a render-only `model`. The values are tuning, see `docs/cost-tiers.md` §4–§5.
  ```

  ```diff
  -- C16: … invoke via Agent tool with `subagent_type: step.data.agent` and, when non-null, `isolation: step.data.isolation`; never pass `model` or `effort` — the agent file pins them. …
  +- C16: … invoke via Agent tool with `subagent_type: step.data.agent` and, when non-null, `isolation: step.data.isolation`; pass `model: step.data.dispatchModel` and `effort: step.data.dispatchEffort` only when present (R90); otherwise pass neither — the agent file pins them. …
  ```
- names: `R90`, `P7`, `C16`, `modelSource`, `dispatchModel`, `dispatchEffort`.
- mirror: R88/R89 at `docs/specs/ship-sdlc.md:209-211`.
- decisions: Decisions 1-3; keys are step names (Key Decisions).
- sync: Task 5 implements; Task 7 SKILL.md cites R90; site byte copy.

### Task 3: pr-sdlc spec P20 restriction, field row and reference doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — amend A7 and P20; fix the "P1-P18" range text
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy
- Modify: `docs/skills/pr-sdlc.md` — argument hint and flag row for `--testing-file`
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — add the `testingSummary` key-field row

**Notes:** #9342 (a) and (b) (F-pr-testing-file-and-test-leftovers-1, -2). The spec states the restriction before Task 8 codes it.

**Acceptance criteria:**
- [ ] P20 states the worktree-or-state-dir rule and the warning text.
- [ ] The pr-sdlc key-field table has a `testingSummary` row after `forcedLabels`.
- [ ] `docs/skills/pr-sdlc.md` lists `--testing-file <path>` in the usage line and the flags table.
- [ ] `validate-spec-shape.js --root .` and `check-docs-consistency.js` exit 0; both site copies `cmp` equal.

**Contract:**
- shape (openspec): MODIFY A7 and P20 in `docs/specs/pr-sdlc.md`.

  ```diff
  -- P20: `testingSummary` — the trimmed text of the `--testing-file` file, cut to 4000 characters; null when the flag is absent; null with a `warnings` entry when the file cannot be read.
  +- P20: `testingSummary` — the trimmed text of the `--testing-file` file, cut to 4000 characters; null when the flag is absent; null with a `warnings` entry when the file cannot be read, is not a regular file, or resolves (after symlinks) outside both the current git worktree and the ship state directory (`resolveStateDir()`). Warning for the last case: `Testing file <path> is outside the worktree and the state directory; ignored`.
  ```

  A7 gains: "The file must be inside the current git worktree or the ship state directory (P20); its text is published in the PR body."
  The prose that says "P1-P18" becomes "P1-P20".

  SKILL.md row (after the `forcedLabels` row):

  ```text
  | `testingSummary` | Verification summary text from `--testing-file` (cut to 4000 characters), or `null`; drives the Testing section (R18) |
  ```
- names: `A7`, `P20`, `testingSummary`.
- mirror: row style at `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:150-169`; flag rows in `docs/skills/pr-sdlc.md`.
- decisions: Decisions 4.
- sync: Task 8 implements P20 in `pr.js`; site byte copies.

### Task 4: setup-sdlc spec for W6a.6, W6a.8 and W6a.9

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/setup-sdlc.md` — R-walk-3, R9, R-guardrail-custom-prompt, I6, R10, R14; add P-scan
- Modify: `site/src/content-source/specs/setup-sdlc.md` — byte copy

**Notes:** Collects the spec deltas of three items in one place so each later task cites a settled id (F-setup-sdlc-w6a-w6c-plan-items-4, -7, -8). Wording is from consolidated-plan W6a.6, W6a.8 and W6a.9.

**Acceptance criteria:**
- [ ] R-walk-3 no longer mentions `--auto`.
- [ ] R9, I6 and R-guardrail-custom-prompt describe one `setup-guardrails.md` with `target`.
- [ ] R10 and R14 describe the script scan; `P-scan` exists under `## Prepare script contract`.
- [ ] `validate-spec-shape.js --root .` exits 0; the site copy `cmp` equals.

**Contract:**
- shape (openspec): MODIFY six requirements; ADD `P-scan`.

  | Op | Id | New text (or change) |
  |---|---|---|
  | replace | R-walk-3 | delete `(suppressed under `--auto`)` |
  | replace | R9 | `plan guardrails (`setup-guardrails.md`), execution guardrails (`setup-execution-guardrails.md`)` → `plan and execution guardrails (`setup-guardrails.md`, `target` = `plan`\|`execute`)` |
  | replace | R-guardrail-custom-prompt | prefix "For `target=plan`," and append "`target=execute` keeps the single `all / select / custom / cancel` prompt (maintainer decision pending)." |
  | replace | I6 | `- I6: `setup-guardrails.md` with `target=execute` — execution guardrail configuration` |
  | replace | R10 | `- R10: Project scan phase: `skill/setup.js --scan` emits `prepare.scan` (signals, files, hosting, ciFiles, git, jiraEvidence, recentPrs) before content sub-flows` |
  | replace | R14 | `- R14: The scan is implemented in `scripts/lib/project-scan.js` (Node `fs` and non-shell git/gh calls); the model does not run Glob or shell globs for it` |
  | add | P-scan | see below |

  ```text
  - P-scan: `scan` (object, present only with `--scan`) — `{ signals: { languages, frameworks, hasDatabase, dbType, hasApi, apiFormat, hasTests, testFramework, hasCi, ciPlatform, hasMonorepo, hasOpenSpec, directories, reviewDimensions, claudeMdRules, structure: { "<glob>": { label, count, samples, truncated } } }, files: { "<rel path>": { content, truncated } }, hosting: { github, via }, ciFiles: [], git: { branch, recentCommits }, jiraEvidence: { keys, ambiguous }, recentPrs: [] }`; `recentPrs` is filled only with `--scan-prs` and GitHub hosting. `signals.reviewDimensions` reads the main worktree; every other field reads the active worktree.
  ```
- names: `R-walk-3`, `R9`, `R-guardrail-custom-prompt`, `I6`, `R10`, `R14`, `P-scan`.
- mirror: named-id style of `P-sections` at `docs/specs/setup-sdlc.md:158`.
- decisions: named id `P-scan` (as W6a.9 names it); Decisions 6.
- sync: Tasks 10, 12, 13 and 14 cite these ids; site byte copy.

### Task 5: ship.js validates ship.stepModels

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/dimensions.js` — export `MODEL_ALIASES` and `MODEL_ID_RE`
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `resolveStepModels`; `flags.stepModels`; prepare errors
- Create: `tests/promptfoo/fixtures-fs/project-ship-step-models-invalid/.sdlc/local.json`
- Create: `tests/promptfoo/fixtures-fs/project-ship-step-models-invalid/setup.sh`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — cases `ship-step-models: (d)` to `(f)`

**Notes:** First half of R90 (F-ship-step-model-default-and-override-9, -11, -13). The resolved map goes into the merged flags, so the ledger freezes it and the stepper's second `computeSteps` call (the `execute_tier` recompute) sees the same overrides as prepare. The fixture `setup.sh` is a copy of `project-ship-quick-defined/setup.sh`.

**Acceptance criteria:**
- [ ] On the invalid fixture, prepare exits 1 and `errors[]` holds the unknown-key and the bad-effort texts from the table, each once.
- [ ] Without `stepModels`, `flags.stepModels` is `{}` and `flags.sources.stepModels` is `default`; prepare output is otherwise unchanged.
- [ ] `dimensions.js` exports both names; `validate-dimensions.js` behaviour is unchanged.

**Contract:**
- shape (code):
  - `dimensions.js`: add `MODEL_ALIASES` and `MODEL_ID_RE` to `module.exports`; no other change.
  - `ship.js`: `const STEP_MODEL_KEYS = ['execute','commit','review','received-review','commit-fixes','version','pr'];` and `resolveStepModels(raw) -> { overrides: { [step]: { model?, effort? } }, errors: string[] }` (returns `{ overrides: {}, errors: [] }` when `raw` is undefined).
  - In prepare, after the config load:

    ```diff
       // Load config
       const { config: fileConfig, source: configSource } = loadConfig(projectRoot);

       // Merge flags
       const { merged: flags, sources: flagSources } = mergeFlags(cli, fileConfig);
    +  // R90: per-step model/effort overrides; invalid entries refuse the run like a bad flag.
    +  const stepModels = resolveStepModels((fileConfig || {}).stepModels);
    +  flags.stepModels = stepModels.overrides;
    +  flagSources.stepModels = (fileConfig && fileConfig.stepModels !== undefined) ? 'config' : 'default';
    +  errors.push(...stepModels.errors);
    ```

  - Errors:

    | Condition | `errors[]` text | Exit |
    |---|---|---|
    | `stepModels` not an object | `ship.stepModels must be an object keyed by step name.` | 1 |
    | unknown key `k` | `ship.stepModels.<k>: unknown step; expected one of execute, commit, review, received-review, commit-fixes, version, pr.` | 1 |
    | value not an object, or empty | `ship.stepModels.<k> must be an object with model and/or effort.` | 1 |
    | bad model `m` | `ship.stepModels.<k>.model "<m>" must be haiku, sonnet, opus, fable or a claude-* id.` | 1 |
    | bad effort `e` | `ship.stepModels.<k>.effort "<e>" must be one of low, medium, high, xhigh, max.` | 1 |

  - Invalid fixture `local.json`:

    ```json
    { "schemaVersion": 4,
      "ship": { "steps": ["execute","commit","review","pr"],
                "stepModels": { "deploy": { "model": "opus" },
                                "review": { "effort": "huge" } } } }
    ```

  - Cases (`script_stub_bin` stub-bin-gh, `script_args: "--has-plan --plan {{repo_root}}/tests/promptfoo/fixtures-fs/ship-todos/plan-3-tasks.md"`, `script_cwd: "{{project_root}}"`): `(d) unknown step key is an error` and `(e) invalid effort is an error` on `project-ship-step-models-invalid`; `(f) no stepModels gives an empty map` on `project-ship-quick-defined`.
- names: `STEP_MODEL_KEYS`, `resolveStepModels`, `flags.stepModels`, `MODEL_ALIASES`, `MODEL_ID_RE`.
- mirror: flag error style at `ship.js:150-157`; model rule at `dimensions.js:230-242`.
- decisions: Decisions 1-3.
- sync: Task 6 applies `flags.stepModels`; Task 7 schema mirrors the same values.

### Task 6: ship.js applies step model overrides to steps and dispatch

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `applyStepModel`; seven call sites; stepper `data`
- Create: `tests/promptfoo/fixtures-fs/project-ship-step-models/.sdlc/local.json`
- Create: `tests/promptfoo/fixtures-fs/project-ship-step-models/setup.sh`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — cases `ship-step-models: (a)` to `(c)`

**Notes:** Second half of R90 (F-ship-step-model-default-and-override-7, -13). The cache stays the agent-file truth; each call site applies the override to a copy. `commit-fixes` looks up its own key although it shares the commit agent file. `stepModels` is not in `FROZEN_FLAG_KEYS` (`ship.js:1377`), so the R11 refresh rewrites it on `--resume`, and a value changed in `.sdlc/local.json` applies to the steps dispatched after the resume.

**Acceptance criteria:**
- [ ] On the fixture, `steps[]` shows `execute` with `model: opus`, `effort: xhigh`, `modelSource: config`, `dispatchModel: opus`, `dispatchEffort: xhigh`, and `review` with `model: sonnet`, `effort: high`, `dispatchEffort: high` and no `dispatchModel`.
- [ ] Steps without an entry have `modelSource: agent` and no `dispatchModel`/`dispatchEffort` keys.
- [ ] Case "ship-step: (m)" (seeded ledger without overrides) also asserts `!('dispatchModel' in e.step.data) && !('dispatchEffort' in e.step.data)`, so the stepper adds the keys only when the ledger step has them.
- [ ] The Task 1 cases and the existing `ship-prepare` and `ship-step` cases still pass.

**Contract:**
- shape (code): `applyStepModel(base, stepName, overrides = {}) -> { agent, model, effort, modelSource, dispatchModel?, dispatchEffort? }`; it never mutates `base`.

  ```diff
     {
       name: 'commit',
       skill: 'commit-sdlc',
  -    ...stepAgent('commit'),
  +    ...applyStepModel(stepAgent('commit'), 'commit', flags.stepModels),
       status: isIn('commit') ? 'will_run' : 'skipped',
  ```

  The same change applies at the other six spreads: `stepAgent('execute')` → key `execute`, `stepAgent('review')` → `review`, `stepAgent('received-review')` → `received-review`, the second `stepAgent('commit')` (the commit-fixes step) → `commit-fixes`, `stepAgent('version')` → `version`, `stepAgent('pr')` → `pr`.

  Stepper dispatch data:

  ```diff
  -        data = { skill: cs.skill, args: cs.args, invocation: cs.invocation, agent: cs.agent, model: cs.model, ...(cs.effort ? { effort: cs.effort } : {}), ...(cs.isolation ? { isolation: cs.isolation } : {}) };
  +        data = { skill: cs.skill, args: cs.args, invocation: cs.invocation, agent: cs.agent, model: cs.model, ...(cs.effort ? { effort: cs.effort } : {}), ...(cs.dispatchModel ? { dispatchModel: cs.dispatchModel } : {}), ...(cs.dispatchEffort ? { dispatchEffort: cs.dispatchEffort } : {}), ...(cs.isolation ? { isolation: cs.isolation } : {}) };
           if (id === 'dispatch_received_review') {
  ```

  Fixture `local.json`:

  ```json
  { "schemaVersion": 4,
    "ship": { "steps": ["execute","commit","review","pr"],
              "stepModels": { "execute": { "model": "opus", "effort": "xhigh" },
                              "review":  { "effort": "high" } } } }
  ```

  Step record, before → after (execute):

  ```text
  Before: { "name": "execute", "agent": "sdlc:ship-step-execute", "model": "sonnet", "effort": "high", … }
  After:  { "name": "execute", "agent": "sdlc:ship-step-execute", "model": "opus", "effort": "xhigh", "modelSource": "config", "dispatchModel": "opus", "dispatchEffort": "xhigh", … }
  ```

  Cases: `ship-step-models: (a) execute override sets model, effort and dispatch keys`, `(b) effort-only override keeps the agent model`, `(c) steps without an entry have modelSource agent` (prepare, same vars as Task 5); plus the extra assertion in "ship-step: (m)" (seeded ledgers come from `project-ship-stepper/seed/` and carry no override).
- names: `applyStepModel`, `modelSource`, `dispatchModel`, `dispatchEffort`.
- mirror: `stepAgent` at `ship.js:440-457`; case "ship-step: (m)" in `ship-prepare-exec.yaml`.
- decisions: Key Decisions (dispatch keys, step-name keys).
- sync: Task 7 SKILL.md dispatch reads `step.data.dispatchModel`/`dispatchEffort`.

### Task 7: ship-sdlc dispatch, schema and docs for step models; step-argument table

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 6
**Verify:** lint, manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 5 item 5 passes dispatch keys; table rows 3 and 7
- Modify: `schemas/sdlc-local.schema.json` — `shipSection.properties.stepModels`
- Modify: `docs/skills/ship-sdlc.md` — `### Step models` subsection
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy

**Notes:** R90 in SKILL.md and docs, plus #9342 (c) (F-pr-testing-file-and-test-leftovers-3). The schema must change because `shipSection` has `additionalProperties: false`.

**Acceptance criteria:**
- [ ] Step 5 item 5 `dispatch_*` passes `model`/`effort` only when `step.data.dispatchModel`/`dispatchEffort` are present, with `<!-- R90 -->`.
- [ ] Table row 3 shows `--plan "<planFile>"` (R88) and row 7 shows `--testing-file "<stateDir>/pr-testing-<branchSlug>.md"` (R89).
- [ ] The schema parses (`node -e "JSON.parse(require('fs').readFileSync('schemas/sdlc-local.schema.json','utf8'))"`) and accepts the Task 5 fixture's `ship` object.
- [ ] `check-consistency.js` and `check-docs-consistency.js` exit 0; the site copy `cmp` equals.

**Contract:**
- shape (code): SKILL.md dispatch line.

  ```diff
  -   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present (R-agent-isolation-script-driven). The agent file preloads the skill, pins its model, …
  +   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present (R-agent-isolation-script-driven), and `model: step.data.dispatchModel` / `effort: step.data.dispatchEffort` only when present (a `ship.stepModels` override, R90). The agent file preloads the skill, pins its default model, …
  ```

  Table rows:

  ```diff
  -| 3 | review-sdlc | will_run | `--committed`, plus `--auto` when ship runs with `--auto` | no |
  +| 3 | review-sdlc | will_run | `--committed`, plus `--auto` when ship runs with `--auto`, plus `--plan "<planFile>"` when a plan is set (R88) | no |
  -| 7 | pr-sdlc | will_run | `--auto --draft` | no |
  +| 7 | pr-sdlc | will_run | `--auto --draft`, plus `--testing-file "<stateDir>/pr-testing-<branchSlug>.md"` when execute returned a summary (R89) | no |
  ```

  Schema addition:

  ```diff
     "executeWaveInterval": { … },
  +  "stepModels": {
  +    "type": "object",
  +    "description": "Per-step model/effort override for ship dispatch (ship-sdlc R90).",
  +    "propertyNames": { "enum": ["execute","commit","review","received-review","commit-fixes","version","pr"] },
  +    "additionalProperties": {
  +      "type": "object", "minProperties": 1, "additionalProperties": false,
  +      "properties": {
  +        "model":  { "type": "string", "pattern": "^(haiku|sonnet|opus|fable|claude-[a-z0-9][a-z0-9.-]*(\\[1m\\])?)$" },
  +        "effort": { "enum": ["low","medium","high","xhigh","max"] } } } }
  ```

  Docs subsection `### Step models`: one paragraph (the key lives in `.sdlc/local.json`, keyed by step name, values `{ model?, effort? }`, invalid values stop prepare), the JSON example from Task 5, and a link to `docs/cost-tiers.md` §5.
- names: `stepModels`, `dispatchModel`, `dispatchEffort`, heading `### Step models`.
- mirror: plan-sdlc lens dispatch rule at `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md:28`; schema style of `executeWaveTimeout`.
- decisions: Key Decisions (dispatch keys).
- sync: values match `STEP_MODEL_KEYS`, `MODEL_ALIASES`, `MODEL_ID_RE`, `VALID_EFFORTS` (Task 5); site byte copy.

### Task 8: pr.js restricts --testing-file; stronger testing and plan cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/pr.js` — P20 containment and regular-file checks
- Create: `tests/promptfoo/fixtures-fs/project-openspec-detect-diff/testing.md` — a real verification summary (about 300 characters)
- Create: `tests/promptfoo/fixtures-fs/project-openspec-detect-diff/testing-long.md` — more than 4500 characters
- Test: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — rewrite (a), (d); add (e), (f); stub gh in all `pr-prepare-testing:` cases
- Test: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-prepare-plan: (a)` uses a real plan file

**Notes:** #9342 (a) and (d) (F-pr-testing-file-and-test-leftovers-1, -4). The gh stub closes the headless gh-auth gap found by the F-27 probe. The fixture's `setup.sh` runs `git add -A` on main, so the two new files are tracked and inside the worktree; the openspec cases on that fixture look only at `openspec/`.

**Acceptance criteria:**
- [ ] `pr-prepare-testing: (a)` asserts `testingSummary` equals the trimmed `testing.md` text exactly.
- [ ] `(d)` reads `testing-long.md` and asserts a length of 4000.
- [ ] `(e)` passes `{{repo_root}}/plugins/sdlc-utilities/scripts/skill/pr.js` (outside the fixture worktree) and asserts `testingSummary: null` plus the P20 warning.
- [ ] `(f)` passes a file under `SDLC_STATE_DIR_OVERRIDE` (set with `script_env` to `{{project_root}}/state`, created by the case) and asserts it is read.
- [ ] Every `pr-prepare-testing:` case has `script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin"`.
- [ ] `review-prepare-plan: (a)` passes `--plan {{repo_root}}/tests/promptfoo/fixtures-fs/ship-todos/plan-3-tasks.md` and asserts `plan_file` equals that absolute path and stderr has no "is not a readable file".

**Contract:**
- shape (code): in `pr.js`, replace the read block at `pr.js:564-572`.

  ```diff
     let testingSummary = null;
     if (testingFile) {
       try {
  -      testingSummary = fs.readFileSync(testingFile, 'utf8').trim().slice(0, 4000);
  +      const real = fs.realpathSync(testingFile);
  +      if (!fs.statSync(real).isFile()) throw new Error('not a regular file');
  +      const roots = [activeRoot, resolveStateDir()].filter(Boolean).map(r => { try { return fs.realpathSync(r); } catch { return null; } }).filter(Boolean);
  +      if (!roots.some(r => real === r || real.startsWith(r + path.sep))) {
  +        warnings.push(`Testing file ${testingFile} is outside the worktree and the state directory; ignored`);
  +      } else {
  +        testingSummary = fs.readFileSync(real, 'utf8').trim().slice(0, 4000);
  +      }
       } catch (err) {
         warnings.push(`Could not read testing file ${testingFile}: ${err.message}`);
       }
     }
  ```

  `resolveStateDir` comes from `require(path.join(LIB, 'state'))`; `activeRoot` is the active worktree `pr.js` already uses for `prOpenspec(activeRoot)`.

  | Condition | `testingSummary` | `warnings[]` |
  |---|---|---|
  | flag absent | null | — |
  | missing file | null | `Could not read testing file <p>: ENOENT…` (case c, unchanged) |
  | directory | null | `Could not read testing file <p>: not a regular file` |
  | outside worktree and state dir | null | `Testing file <p> is outside the worktree and the state directory; ignored` |
  | inside either root | text, cut to 4000 | — |
- names: cases `pr-prepare-testing: (a)`…`(f)`, `review-prepare-plan: (a) --plan sets plan_file`.
- mirror: existing cases at `tests/promptfoo/datasets/pr-prepare-exec.yaml:491-537`; `script_env` use in `ship-prepare-exec.yaml`.
- decisions: Decisions 4.
- sync: P20 text from Task 3; ship's producer path (`ship.js:1795-1815`) stays inside the state dir.

### Task 9: pin promptfoo 0.123.1 for exec runs (F-27)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 8
**Verify:** tests

**Files:**
- Modify: `Taskfile.yml` — `promptfoo` → `npx --yes promptfoo@0.123.1` in the four eval/view commands
- Modify: `lefthook.yml` — the two pre-push commands
- Modify: `tests/promptfoo/README.md` — Requirements and "Run tests"; one sentence on why the version is pinned

**Notes:** #9343 (F-promptfoo-exec-eisdir-headless-1, -2). 0.125.1 reads the templated `file://` `script_cwd` var as a file before `transformVars` runs. Not editing `AGENTS.md`: see Deviations.

**Acceptance criteria:**
- [ ] `grep -nE '(^|[^@/])promptfoo (eval|view)' Taskfile.yml lefthook.yml` prints nothing.
- [ ] The README names `promptfoo@0.123.1` and states the EISDIR reason in one sentence.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "pr-prepare-testing:" -j 2 --no-cache` passes.

**Contract:**
- shape (docs): config delta.

  | Op | File | Before | After |
  |---|---|---|---|
  | replace | `Taskfile.yml` (4 cmds) | `promptfoo eval …` / `promptfoo view …` | `npx --yes promptfoo@0.123.1 eval …` / `npx --yes promptfoo@0.123.1 view …` |
  | replace | `lefthook.yml` (2 cmds) | `promptfoo eval --config …` | `npx --yes promptfoo@0.123.1 eval --config …` |
  | replace | README Requirements | `promptfoo installed globally: npm install -g promptfoo` | `promptfoo 0.123.1, run through npx --yes promptfoo@0.123.1 (later versions read the templated file:// script_cwd var as a file and fail with EISDIR)` |
- names: `promptfoo@0.123.1`.
- mirror: the pinned command in this plan's **Verification** header.
- decisions: Decisions 5.
- sync: none.

### Task 10: setup-sdlc SKILL.md cleanup (W6a.6, #9190, W6c.10)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** lint, manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — W6a.6 deletions and fixes; #9190 literal paths; W6c.10
- Modify: `docs/skills/setup-sdlc.md` — W6a.6 doc fixes; drop the stale `workspace` sections
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-plan-template.md` — W6c.10 fence comment
- Test: `tests/promptfoo/datasets/setup-sdlc.yaml` — rubric "Step 5" → "Step 4"

**Notes:** Locate every edit by content; consolidated-plan line numbers are old (F-setup-sdlc-w6a-w6c-plan-items-1 to -4, -9; F-setup-sdlc-cross-call-var-literals-1 to -3). Must not touch: the Step 1 menu text, the 3.G/3.commit/3.pr bodies, the pre-release compat block, the `setup-init.js` write command, `R-menu-*`/`R-walk-3` anchors, the `Step 3b` heading.

**Acceptance criteria:**
- [ ] `grep -nE "workspace|3\.hooks|--auto|Step 5|promptfoo|3a–3f|#[0-9]{3}" plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` prints nothing.
- [ ] `received-review` is in the `--skip` values, the `--only` ids (after `review`) and the 3.G list.
- [ ] No Bash block or prose in SKILL.md uses `$PREPARE_OUTPUT_FILE`, `$INIT_OUTPUT_FILE`, `$BEFORE_JSON`, `$AFTER_JSON` or `DIFF_JSON=$(`.
- [ ] `grep -c 'Substitute <PLUGIN_ROOT> from' SKILL.md setup-plan-template.md` is 0 for both; the blockquote carries the fallback sentence.
- [ ] `check-consistency.js` and `check-docs-consistency.js` exit 0; the site copy `cmp` equals.

**Contract:**
- shape (code):
  - **W6a.6 deletes:** the `#### 3.workspace` and `#### 3.hooks` sections (heading to the line before `#### 3.S`); the `#### Legacy section reference` table and the blank lines after it; the sentence `The `workspace` section uses this dispatcher …` in the `null` dispatcher row; the DO NOT line `- Run full-suite or wide-subset `promptfoo eval` automatically …`.
  - **W6a.6 rewrites:**

    | Now | After |
    |---|---|
    | `(Steps 1 → 2 → 3 → 5)` | `(Steps 1 → 2 → 3 → 3b → 4)` |
    | `accumulated answers from Steps 3a–3f` / `assembled from Steps 3a–3f` | `… from Step 3` |
    | `… — same conditional logic as legacy Step 3e, gated by the verbose header above` | `Inline commit-pattern builder (3.commit below)` |
    | `… — same conditional logic as legacy Step 3f` | `Inline PR-pattern builder (3.pr below)` |
    | `ask the user to confirm the diff via AskUserQuestion (suppressed when `--auto` is set; auto mode proceeds to write). On rejection, …` | `ask the user to confirm the diff via AskUserQuestion. On rejection, …` |
    | DO NOT `- Skip AskUserQuestion for any user interaction -- do not print questions and wait for freeform input` | `- Use AskUserQuestion for every answer *except* the Step 1 menu reply, which is a plain chat prompt.` |
    | `--skip` values `…, `review`, `commit`, `pr`` | `…, `review`, `received-review`, `commit`, `pr`` |
    | `--only` ids `…, `review`, `commit`, …` | `…, `review`, `received-review`, `commit`, …` |
    | `(`version`, `ship`, `jira`, `review`):` | `(`version`, `ship`, `jira`, `review`, `received-review`):` |

  - **W6c.10 and issue numbers:** delete every `# Substitute <PLUGIN_ROOT> from …` fence line (W6c.10 item 1 sed); add `If the line is absent, the plugin root is the directory two levels above this SKILL.md.` before `Do not run `find`.` in the blockquote; `(R-SCRIPT-VERSIONS, #424)` becomes a trailing `<!-- implements R-SCRIPT-VERSIONS -->`; drop `#423`, `#337`, `#338`, `#235`, `issue #209`, keeping R ids; heading becomes `#### Diff preview`.
  - **#9190 literal paths:**

    | Site | After |
    |---|---|
    | Step 0 `Parse the JSON output from `$PREPARE_OUTPUT_FILE`.` | `Read the JSON at the literal `PREPARE_OUTPUT_FILE` path.` |
    | Writing config files `Parse the output JSON from `$INIT_OUTPUT_FILE`.` | `Read the JSON at the literal `INIT_OUTPUT_FILE` path.` |
    | Step 3b `node "<PLUGIN_ROOT>/scripts/skill/setup.js" > "$PREPARE_OUTPUT_FILE"` | `node "<PLUGIN_ROOT>/scripts/skill/setup.js" --output-file`, then: "Run this as one plain Bash call. Take the path it prints as the new `PREPARE_OUTPUT_FILE` and read that literal path." |

    Diff preview, now → after:

    | Now | After |
    |---|---|
    | one block: `mktemp` ×2, `printf "$BEFORE_JSON"`, `printf "$AFTER_JSON"`, `DIFF_JSON=$(… node -e …)`, `rm -f` | 1. `mktemp -d`; note the directory `<DIFF_DIR>`. 2. Write `before.json` (Step 0 snapshot) and `after.json` (answers) there with the Write tool. 3. One plain call: `node -e` that requires `process.argv[1]` (`<PLUGIN_ROOT>/scripts/lib/config.js`), reads the two literal file paths and prints `computeConfigDiff(before, after)`; read it from the tool result. 4. `rm -rf "<DIFF_DIR>"` as its own call. `DIFF_JSON.changed[]` becomes "the diff's `changed[]`". |
  - **docs/skills/setup-sdlc.md:** delete `In `--auto` mode the confirmation is suppressed and the write proceeds automatically.`; `### Step 5: Summary` → `### Step 4: Summary`; `### Step 4: Content Setup` → `### Content Setup (Step 3 sub-flows)`; add `received-review` after `review` in the two section-id lists; delete the stale `workspace` sections.
- names: headings `#### 3.S`, `#### Diff preview`, `### Step 3b -- Validate Written Config`; `PREPARE_OUTPUT_FILE`, `INIT_OUTPUT_FILE`, `<DIFF_DIR>`.
- mirror: plain-call pattern at `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:79-83`; Write-then-run pattern in ship SKILL.md Step 5 item 6.
- decisions: W6a.6 as written; Key Decisions (W6c.10 inside each task).
- sync: Task 12 then edits the dispatch rows; Task 14 rewrites §3.S; site byte copy.

### Task 11: setup sub-flow fossils (W6a.7, #9190, W6c.10)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint, manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-dimensions.md` — banner, step refs, field table, gh-auth check, `$SCRIPT`, fence comments
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-pr-labels.md` — schema references, fence comment
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-pr-template.md` — `.sdlc/` dir, recovery, gotchas, script path, fence comment
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-openspec.md` — Step 4 summary, literal path, fence comment
- Test: `tests/promptfoo/datasets/setup-sdlc-dimensions.yaml` — rubric sentence for inline output

**Notes:** W6a.7 sub-items not done in M5.1 wave 7 (F-setup-sdlc-w6a-w6c-plan-items-5, -6; F-setup-sdlc-cross-call-var-literals-4). Locate by quoted text. W6a.9 (Task 14) rewrites the Scan Input sections afterwards.

**Acceptance criteria:**
- [ ] `grep -nE "CRITICAL — Inline|simulation context|skill=review-init-sdlc|mkdir -p .claude|Step 5 summary|scripts/validate-pr-template|\\\$SCRIPT|\\\$PREPARE_OUTPUT_FILE|Substitute <PLUGIN_ROOT> from" plugins/sdlc-utilities/skills/setup-sdlc/setup-{dimensions,pr-labels,pr-template,openspec}.md` prints nothing.
- [ ] The Step 7 exit-2 line dispatches `error-report-sdlc` with `--skill setup-sdlc`.
- [ ] Gotcha 3 and the error table in `setup-pr-template.md` both say stop and report.
- [ ] `check-docs-consistency.js` exits 0.

**Contract:**
- shape (code): edits per file.

  | File | Now | After |
  |---|---|---|
  | dimensions | banner `> **CRITICAL — Inline output only.** …` (4 lines) | deleted; rubric gains `The proposed dimensions, their evidence and trigger patterns appear inline in the reply and are not deferred to earlier output.` |
  | dimensions | `SCRIPT="<PLUGIN_ROOT>/scripts/ci/validate-dimensions.js"` block + `Run: node "$SCRIPT" --project-root . --json` | one block: `node "<PLUGIN_ROOT>/scripts/ci/validate-dimensions.js" --project-root . --json` |
  | dimensions | `…scan results in Step 4:` / `(determined during Step 1 GitHub hosting detection in parent)` / `(Step 1 in parent)` | `…scan results from the parent's scan phase (§3.S):` / `(determined by the parent's scan, §3.S)` / `(the parent's scan, §3.S)` |
  | dimensions | exit-2 line (re-check it: it may already read the error-report SKILL.md) | `- Exit code **2**: Show `Script error — see output above` and stop. Dispatch `error-report-sdlc` with `--skill setup-sdlc --step "dimensions: Step 7"`, `--operation validate-dimensions.js` and the stderr as `--error-text`.` |
  | dimensions | field-mapping table; gotcha `**Copilot step gated on gh auth.** …` | table deleted; Step 8 starts with `Check `gh auth status` first; if unauthenticated, skip this step with a one-line notice.`; gotcha deleted |
  | pr-labels | `- The written JSON validates against `schemas/sdlc-config.schema.json`` | deleted |
  | pr-labels | `- `schemas/sdlc-config.schema.json#$defs/prLabelsSection` — schema source of truth` | `- `<repo-root>/schemas/sdlc-config.schema.json#$defs/prLabelsSection` — schema source of truth (repository file, not shipped with the plugin; a maintainer reference, not an executor step)` |
  | pr-template | `1. Create the `.claude/` directory …` + `mkdir -p .claude` | `1. Create the `.sdlc/` directory if it does not exist:` + `mkdir -p .sdlc` |
  | pr-template | Gotcha 3 `*Mitigation:* If the script is not found, skip validation …` | `*Mitigation:* Stop and invoke `error-report-sdlc` as in the Error Recovery table; do not skip validation.` |
  | pr-template | Gotchas 1, 2 mitigations | the two W6a.7 sentences (AskUserQuestion for the baseline file; for the Jira key) |
  | pr-template | `- `scripts/validate-pr-template.js` — …` | `- `scripts/ci/validate-pr-template.js` — validates the template format` |
  | openspec | `Return to the parent skill (Step 5 summary).` | `Return to the parent skill (Step 4 summary).` |
  | openspec | `Parse the JSON output from `$PREPARE_OUTPUT_FILE`.` | `Read the JSON at the literal `PREPARE_OUTPUT_FILE` path.` |
  | all four | `# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line.` fence lines | deleted |
- names: `§3.S`, `error-report-sdlc`, `PREPARE_OUTPUT_FILE`.
- mirror: consolidated-plan W6a.7 "Change" list; plain-call pattern at `ship-sdlc/SKILL.md:79-83`.
- decisions: W6a.7 as written (recovery resolves to stop and report).
- sync: Task 14 replaces the §3.S references with `prepare.scan`.

### Task 12: one guardrails sub-flow with a target (W6a.8)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 4, Task 10
**Verify:** tests, lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-guardrails.md` — `## Target` table; both prompt shapes; fence comments; DO NOT promptfoo line removed
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-execution-guardrails.md` — delete this file (`git rm`)
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — two dispatch rows pass `target`
- Modify: `docs/skills/setup-sdlc.md` — Plan Guardrails sentence; one `ship.stepModels` sentence under `#### ship`
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy

**Notes:** Implements R9, I6 and R-guardrail-custom-prompt from Task 4 (F-setup-sdlc-w6a-w6c-plan-items-7). The `delegatedTo` ids in `lib/setup-sections.js` stay as they are. The `ship.stepModels` sentence (R90) goes here because this task already edits the doc after Task 10.

**Acceptance criteria:**
- [ ] `test ! -e plugins/sdlc-utilities/skills/setup-sdlc/setup-execution-guardrails.md`; `grep -rn "setup-execution-guardrails.md" plugins docs` prints nothing.
- [ ] `setup-guardrails.md` has the Target table; Step 0 uses `--target <target>`; Step 3 writes `'<target>'`; Step 4 passes `--section <target>`; `target=execute` keeps the `all / select / custom / cancel` prompt verbatim.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "guardrails-prepare" -j 2 --no-cache` passes.
- [ ] `check-consistency.js` and `check-docs-consistency.js` exit 0; the site copy `cmp` equals.

**Contract:**
- shape (code): new section at the top of `setup-guardrails.md`.

  ```text
  ## Target
  The parent passes `target` = `plan` (plan guardrails, section `plan`) or `execute` (execution guardrails, section `execute`). All commands below use these target-specific values:
  | | `plan` | `execute` |
  |---|---|---|
  | `guardrails.js` flag | `--target plan` | `--target execute` |
  | write section | `'plan'` | `'execute'` |
  | `validate-guardrails.js` flag | (default) | `--section execute` |
  | custom guardrails | Stage B prompt (below) | `custom` option in the selection prompt |
  ```

  SKILL.md rows:

  ```diff
  -| `'setup-guardrails'` | Read and follow `@setup-guardrails.md` (it runs its own scan internally). Pass through `--add` if present. |
  -| `'setup-execution-guardrails'` | Read and follow `@setup-execution-guardrails.md`. Pass through `--add` if present. |
  +| `'setup-guardrails'` | Read and follow `@setup-guardrails.md` with `target=plan`. Pass through `--add` if present. <!-- R9 --> |
  +| `'setup-execution-guardrails'` | Read and follow `@setup-guardrails.md` with `target=execute`. Pass through `--add` if present. <!-- R9, I6 --> |
  ```

  Docs sentences: under "Plan Guardrails": `The same sub-flow file (`setup-guardrails.md`) serves `/setup-sdlc --execution-guardrails` with `target=execute`.` Under `#### ship`: `` `ship.stepModels` (per-step model and effort, ship-sdlc R90) is not asked by the wizard; edit `.sdlc/local.json` by hand (see the ship-sdlc reference). ``
- names: `## Target`, `target=plan`, `target=execute`.
- mirror: consolidated-plan W6a.8 Change list; execute wording from `setup-execution-guardrails.md` (its Step 2 prompt).
- decisions: Decisions 6.
- sync: `lib/setup-sections.js` ids unchanged; Task 14 edits SKILL.md after this task; site byte copy.

### Task 13: project-scan.js and setup.js --scan (W6a.9, script part)

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/lib/project-scan.js` — helpers and detectors moved from guardrails.js, `createSignals`, `SCAN_PATTERNS`, `scanProject`
- Modify: `plugins/sdlc-utilities/scripts/skill/guardrails.js` — require the moved functions; output unchanged
- Modify: `plugins/sdlc-utilities/scripts/skill/setup.js` — `--scan`, `--scan-prs`
- Create: `tests/promptfoo/fixtures-fs/project-setup-scan-branch/setup.sh` — git repo on `feat/scan-root`
- Test: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — three `setup-prepare:` scan cases

**Notes:** Implements R10, R14 and P-scan (F-setup-sdlc-w6a-w6c-plan-items-8). Move the functions verbatim before adding anything. `guardrails-prepare-exec.yaml` stays unchanged as the regression. If the 52 patterns in `scan-patterns.md` differ from the constant, stop and report. Task 14 deletes `scan-patterns.md` after this task reads it.

**Acceptance criteria:**
- [ ] `guardrails-prepare` exec cases pass with no dataset change.
- [ ] `setup-prepare: --scan emits scan.signals for a project with package.json` passes on `project-mongodb-express`: `languages` has `typescript`, `frameworks` has `express`, `hasDatabase === true`, `dbType === 'mongodb'`, `files['package.json'].content` is non-empty, `typeof hosting.github === 'boolean'`, `Array.isArray(ciFiles)`.
- [ ] `setup-prepare: no --scan omits the scan key` passes on `project-setup-empty`.
- [ ] `setup-prepare: --scan reports the active branch` asserts `scan.git.branch === 'feat/scan-root'`.
- [ ] `SCAN_PATTERNS.length === 52`; no git or gh call uses a shell.

**Contract:**
- shape (code):
  - `project-scan.js` exports `{ scanProject, createSignals, detectLanguagesAndFrameworks, detectStructure, detectReviewDimensions, extractClaudeMdRules, SCAN_PATTERNS }`.
  - `scanProject(contentRoot, { projectRoot, prs = false } = {})` returns the P-scan object (Task 4). `signals.reviewDimensions` reads `projectRoot`; everything else reads `contentRoot`.
  - Limits and sources:

    | Part | Rule |
    |---|---|
    | structure walk | one walk; depth ≤ 6; skip `node_modules`, `.git`, `dist`, `build`, `vendor`, `.venv`, `target`; stop at 20000 entries; each `SCAN_PATTERNS` glob becomes a regex; `count` ≤ 500 (`truncated: true` when capped); `samples` ≤ 3 |
    | files | read when present, 8 KB cap with `truncated`: `package.json`, `requirements.txt`, `Pipfile`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Gemfile`, `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/pull_request_template.md`, `.sdlc/pr-template.md`; `.github/PULL_REQUEST_TEMPLATE/` as a newline list of names |
    | ciFiles | `.github/workflows/*.yml` and `*.yaml`, `Jenkinsfile`, `.circleci/config.yml`, `.gitlab-ci.yml` |
    | git | `git rev-parse --abbrev-ref HEAD`; `git log --oneline -20` |
    | jiraEvidence | `[A-Z]{2,10}-\d+` over the branch and the recent subjects; `keys` counts per prefix; `ambiguous` when fewer than 2 matches or more than one prefix |
    | failures | any git/gh failure gives empty values, never an exception; every call uses `execFileSync`/`spawnSync` argument arrays (no shell) |

  - Hosting cascade (first match wins):

    | # | Check | Result |
    |---|---|---|
    | 1 | `git remote get-url origin` contains `github.com` | `{ github: true, via: "remote" }` |
    | 2 | `gh repo view --json url` exits 0 (10 s timeout) | `{ github: true, via: "gh" }` |
    | 3 | `.github/` directory exists | `{ github: true, via: "dir" }` |
    | 4 | none of the above | `{ github: false, via: null }` |

  - Sources for the implementer: the return shape is the P-scan text in Task 4 (copy it into the JSDoc); the 52 `{ glob, label }` pairs are the `glob → label` lines inside the `text` fence of `plugins/sdlc-utilities/skills/setup-sdlc/scan-patterns.md` (for example `**/middleware/**      → auth / request pipeline` becomes `{ glob: '**/middleware/**', label: 'auth / request pipeline' }`), read before Task 14 deletes it.
  - `setup.js`: add `const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));` and `require(path.join(LIB, 'project-scan'))`; `--scan` sets `result.scan = scanProject(resolveActiveWorktreeSafe(), { projectRoot })`; `--scan-prs` also fills `recentPrs`; no `scan` key without `--scan`. Update the header and the `parseArgs` doc comment.

  Flag delta:

  | Op | Flag | Type | Effect |
  |---|---|---|---|
  | add | `--scan` | boolean | adds `scan` (P-scan) |
  | add | `--scan-prs` | boolean | with `--scan`: fills `scan.recentPrs` (≤ 5 PR titles and `## ` headings) |
- names: `scanProject`, `createSignals`, `SCAN_PATTERNS`, `--scan`, `--scan-prs`.
- mirror: detectors at `plugins/sdlc-utilities/scripts/skill/guardrails.js:96-500`; signal bag in `guardrails.js` `main`; `resolveActiveWorktreeSafe` use in `scripts/skill/plan.js`.
- decisions: Key Decisions (verbatim extraction first); W6a.9 decision: patterns become a constant and `scan-patterns.md` is deleted.
- sync: Task 14 SKILL.md and sub-flows read `prepare.scan`; Task 15 fixtures use the P-scan shape.

### Task 14: setup reads prepare.scan (W6a.9, model part)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 11, Task 12, Task 13
**Verify:** lint, manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — §3.S becomes the W6a.9 heading and paragraph
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/scan-patterns.md` — delete this file (`git rm`)
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-dimensions.md` — Scan Input names `prepare.scan` fields; delete the Glob-count gotcha
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/setup-pr-template.md` — Scan Input names `prepare.scan` fields

**Notes:** Implements R10, R14 and P-scan in the model-facing text (F-setup-sdlc-w6a-w6c-plan-items-8). Do not add `# Substitute` fence comments back (W6c.10).

**Acceptance criteria:**
- [ ] §3.S is exactly the heading and paragraph below; the Shell-safety lines and the 14 Glob bullets are gone.
- [ ] `test ! -e plugins/sdlc-utilities/skills/setup-sdlc/scan-patterns.md`; `grep -rn "scan-patterns" plugins docs` prints nothing.
- [ ] `grep -n "§3.S\|Step 1 in parent\|Glob pattern count" setup-dimensions.md setup-pr-template.md` prints nothing.
- [ ] `check-consistency.js` and `check-docs-consistency.js` exit 0.

**Contract:**
- shape (code): §3.S text.

  ```text
  #### 3.S. Scan phase (delegated content sections only)
  Before `setup-dimensions` or `setup-pr-template`, make sure the prepare output carries a scan. If `prepare.scan` is absent, re-run Step 0's command once with `--scan` (add `--scan-prs` for `setup-pr-template`) and read `.scan` from the new output file. The signals come from `prepare.scan` (`signals`, `files`, `hosting`, `ciFiles`, `git`, `jiraEvidence`, `recentPrs`); do not re-scan with Glob or Bash. Pass `prepare.scan` to the sub-flow as "Scan Input" and reuse it for every delegated section in the same run. <!-- R10, R14, P-scan -->
  ```

  Sub-flow Scan Input fields: dimensions → `signals.frameworks`/`languages` plus `files` manifests, `signals.structure`, `ciFiles`, `signals.hasDatabase`/`hasTests`, `signals.reviewDimensions`, `hosting.github`; pr-template → `files[".github/PULL_REQUEST_TEMPLATE.md"]`, `files[".sdlc/pr-template.md"]`, `files[".github/PULL_REQUEST_TEMPLATE/"]`, `recentPrs`, `jiraEvidence`. "§3.S" references become `the scan in `prepare.scan``.
- names: `prepare.scan`, `Scan Input`.
- mirror: consolidated-plan W6a.9 "SKILL.md §3.S becomes" and "Sub-flows".
- decisions: W6a.9 as written.
- sync: field names match P-scan (Task 4) and `scanProject` (Task 13).

### Task 15: setup behavioural fixtures carry a prepare.scan block

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 13
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/fixtures/project-with-tech-stack.md` — add a `prepare.scan` JSON block
- Modify: `tests/promptfoo/fixtures/project-no-dimensions.md` — same
- Modify: `tests/promptfoo/fixtures/project-with-cicd-monorepo.md` — same
- Modify: `tests/promptfoo/fixtures/project-with-pr-template.md` — same
- Modify: `tests/promptfoo/fixtures/project-no-pr-template.md` — same

**Notes:** Keeps the behavioural rubrics fed after Task 14 (W6a.9 Datasets; F-setup-sdlc-w6a-w6c-plan-items-8 names these five fixtures). The behavioural suite is not run (AGENTS.md policy).

**Acceptance criteria:**
- [ ] Each fixture has one fenced `json` block whose top-level keys are the P-scan keys and whose values restate the fixture's existing facts.
- [ ] Each block parses with `JSON.parse`; no existing fixture fact is removed.

**Contract:**
- shape (docs): append to each fixture, after its existing scan text:

  ````markdown
  ### prepare.scan
  ```json
  { "signals": { "languages": ["typescript"], "frameworks": ["react"], "hasTests": true, …, "structure": { "**/components/**": { "label": "UI components", "count": 41, "samples": ["src/components/App.tsx"], "truncated": false } } },
    "files": { "package.json": { "content": "…", "truncated": false } },
    "hosting": { "github": true, "via": "remote" }, "ciFiles": [".github/workflows/ci.yml"],
    "git": { "branch": "main", "recentCommits": ["…"] }, "jiraEvidence": { "keys": {}, "ambiguous": true }, "recentPrs": [] }
  ```
  ````
- names: heading `### prepare.scan`.
- mirror: P-scan shape (Task 4).
- decisions: values come from each fixture's own text.
- sync: `scanProject` output keys (Task 13).

### Task 16: CHANGELOG entries, site copies check and this plan

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15
**Verify:** lint

**Files:**
- Modify: `CHANGELOG.md` — `[Unreleased]` entries
- Create: `docs/plans/2026-11-11-lean-w3-ship-models-setup.md`

**Notes:** Release and W6c.10 close-out (F-setup-sdlc-w6a-w6c-plan-items-9 for the Done-when check; the brief's CHANGELOG/version line for `[Unreleased]` and 0.49.0). Ship's version step (`--bump minor`) turns `[Unreleased]` into `[0.50.0]`; this task does not edit `plugin.json`. The plan file is listed so ship's stage scope includes it.

**Acceptance criteria:**
- [ ] `[Unreleased]` holds the entries below.
- [ ] W6c.10 setup Done-when: `grep -rc 'Substitute <PLUGIN_ROOT> from' plugins/sdlc-utilities/skills/setup-sdlc/` is 0 for every file; SKILL.md has one blockquote with the fallback sentence.
- [ ] `node site/scripts/copy-docs.mjs` leaves `git status --short site/` with no change beyond the copies already committed by Tasks 1-4, 7, 10 and 12.
- [ ] The **Verification** header commands pass.

**Contract:**
- shape (docs):

  ```markdown
  ## [Unreleased]

  ### Added
  - ship-sdlc: `ship.stepModels` in `.sdlc/local.json` overrides the model and effort of each ship step; invalid values stop prepare (#9341).
  - setup-sdlc: `setup.js --scan` and `--scan-prs`; the project scan runs in `scripts/lib/project-scan.js` (#9351).

  ### Changed
  - ship-sdlc: the execute step runs on sonnet/high by default (was opus/high) (#9340).
  - pr-sdlc: `--testing-file` reads only a regular file inside the worktree or the ship state directory (#9342).
  - setup-sdlc: one guardrails sub-flow serves plan and execution guardrails (#9351).
  - tests: exec runs pin promptfoo 0.123.1 (#9343).

  ### Fixed
  - setup-sdlc: dead workspace and hooks sections, stale step numbers, the phantom `--auto` and shell variables used across Bash calls removed; `received-review` added to the section lists (#9190, #9351).
  - ship-sdlc, pr-sdlc: the step-argument table and the pr field table name `--plan`, `--testing-file` and `testingSummary` (#9342).
  - tests: `pr-prepare-testing` cases stub gh and read real fixture files; the review `--plan` case reads a real plan (#9342, #9343).

  ### Removed
  - setup-sdlc: `setup-execution-guardrails.md` and `scan-patterns.md` (#9351).
  ```
- names: `## [Unreleased]`.
- mirror: `## [0.49.0]` block at `CHANGELOG.md:10-30`.
- decisions: release is a minor bump (wave brief item 8).
- sync: `check-changelog.yml` CI reads `[Unreleased]`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1, 5, 8 and 13 update or add exec cases; stale opus assertions are corrected |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only filtered exec-only promptfoo runs; behavioural suite explicitly not run |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks trace to the wave brief; extra #9190 sites are listed in Deviations |
| single-responsibility-tasks | warning | PASS (justified) | Tasks 8, 10, 12 and 16 bundle edits to one shared file set; see Key Decisions "Task bundles" |
| scripts-over-llm-logic | error | PASS | Override resolution and the project scan move into ship.js and project-scan.js |
| yagni | warning | PASS | No wizard field, no worker or inline-step overrides; additions are brief-driven |
| cross-skill-consistency | error | PASS | ship, pr and setup changes are aligned; pr and ship tables are synchronised |
| pr-link-github-issue | error | PASS | PR body names Closes #9340-#9343 and Refs #9190, #9351 |
| dry | warning | PASS | Validators are exported from dimensions.js and scan helpers are moved, not copied |
| kiss | warning | PASS | Plain override map, pin instead of dataset rewrite |
| spec-first | error | PASS | Spec tasks 2, 3 and 4 precede the SKILL.md and implementation tasks 6, 7, 9, 11, 12 and 13 |
| project-agnostic | error | PASS | Plugin behaviour ships in plugin code; repo-local edits are justified as dogfooding test tooling |
| flag-coherence-cross-skill | error | PASS | SKILL.md sites cite step.data.dispatchModel/dispatchEffort and prepare.scan from prepare output |
| no-opposite-logical-vectors | error | PASS | Dispatch keys are gated identically; one scan gate |
| flag-resolution-single-source | warning | PASS | ship.js resolves overrides and setup.js resolves --scan; consumers read resolved fields |
| state-premise | error | PASS | Root problem stated in Key Decisions |
| smallest-viable-cut | warning | PASS | Smallest cut named (Tasks 1-8); extras justified |
| failure-audience | warning | PASS | Who fails if shipped wrong is stated |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Decisions taken without the owner and Key Decisions |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified |
| agent-dispatch-script-driven | error | PASS | model/effort come verbatim from prepare output (dispatchModel/dispatchEffort); LLM adds nothing |
| flag-semantic-consistency-cross-skill | error | PASS | Plan states grep evidence that --scan and --scan-prs are unused elsewhere; --testing-file keeps one meaning |
| workspace-mode-compatibility | error | PASS | Plan states behaviour in branch and worktree modes via resolveSdlcRoot and resolveStateDir |
| prompt-cache-hit-ratio | warning | PASS | model/effort are Agent call params; no volatile bytes added to prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Tasks 5 and 6 add a `ship.stepModels` config contract and Task 7 changes the dispatch rule ("`model: step.data.dispatchModel` / `effort: step.data.dispatchEffort` only when present"), while Tasks 8 and 13 change the `--testing-file` behaviour and add `--scan`/`--scan-prs` in `pr.js` and `setup.js`.

**Severity hint:** high

**Patch:** Check that new config keys (`ship.stepModels`), step output fields (`modelSource`, `dispatchModel`, `dispatchEffort`), CLI flags (`--scan`, `--scan-prs`, the restricted `--testing-file`) and the Agent-call model/effort dispatch contract are specified and stay consistent across scripts, SKILL.md and schema.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that new config keys (`ship.stepModels`), step output fields (`modelSource`, `dispatchModel`, `dispatchEffort`), CLI flags (`--scan`, `--scan-prs`, the restricted `--testing-file`) and the Agent-call model/effort dispatch contract are specified and stay consistent across scripts, SKILL.md and schema.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Task 8 changes `plugins/sdlc-utilities/scripts/skill/pr.js` so `--testing-file` cannot read an arbitrary path into the public PR body, and the plan's own reasoning is that a prompt-injected path could otherwise publish a secret file.

**Severity hint:** high

**Patch:** Check that file-read containment for user-supplied paths that reach public output (realpath, regular-file check, worktree and state-dir allowlist) is reviewed.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Check that file-read containment for user-supplied paths that reach public output (realpath, regular-file check, worktree and state-dir allowlist) is reviewed.

### UPDATE: docs-skill-sync (U6, U2)

**Why:** Task 9 edits `Taskfile.yml` and `lefthook.yml`, Task 9 and Task 16 edit `tests/promptfoo/README.md` and `CHANGELOG.md`, and none of these paths are covered by the dimension's current triggers.

**Severity hint:** medium

**Patch:** replace trigger `README.md` with `./**`

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — replace trigger `README.md` with `./**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_4 additional candidates suppressed_

## Final Shape

- **Ship models.** `ship-step-execute` runs on sonnet/high. A project can put `ship.stepModels` in `.sdlc/local.json`, for example `{ "execute": { "model": "opus", "effort": "xhigh" } }`. `ship.js` checks every entry and stops prepare on a bad one. A valid entry shows in `steps[]` (`modelSource: config`) and reaches the Agent call as `model`/`effort`. Steps without an entry run exactly as before.

- **pr-sdlc.** `--testing-file` reads only a regular file inside the worktree or the ship state directory. The key-field table names `testingSummary`. The ship step-argument table names `--plan` and `--testing-file`.

- **Tests.** Exec runs use promptfoo 0.123.1 everywhere the repo starts them. The `pr-prepare-testing` cases stub `gh` and read real fixture files, so they pass in a headless session. The review `--plan` case reads a real plan.

- **setup-sdlc.** SKILL.md has no dead sections, no legacy table, no phantom `--auto` and no cross-call shell variables. One `setup-guardrails.md` serves both targets. The scan is one `setup.js --scan` call backed by `scripts/lib/project-scan.js`; `scan-patterns.md` and `setup-execution-guardrails.md` are gone. No setup file carries a `# Substitute <PLUGIN_ROOT> from` fence comment.

- **Release.** `CHANGELOG.md` `[Unreleased]` lists the changes; ship's version step turns it into 0.50.0.

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
| 1 #9340: ship-step-execute default model opus/high -> sonnet/high | Task 1 | covered |
| 2 #9341: per-step ship model/effort override (ship.stepModels), spec id, schema, docs, exec cases, validation | Task 2, Task 5, Task 6, Task 7, Task 12 | covered |
| 3 #9342: pr --testing-file restriction, testingSummary row, ship step-arg table, stronger tests | Task 3, Task 7, Task 8 | covered |
| 4 #9343 (F-27): promptfoo exec EISDIR headless, find cause and fix | Task 8, Task 9 | covered |
| 5 setup-sdlc W6a.6, W6a.7 (rest), W6a.8, W6a.9 | Task 4, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15 | covered |
| 6 #9190 setup part: cross-call $VAR uses become literals | Task 10, Task 11 | covered |
| 7 W6c.10 Done-when for setup-sdlc only | Task 10, Task 11, Task 12, Task 16 | covered |
| 8 Release: CHANGELOG [Unreleased] entries; ship version step bumps minor (0.50.0) | Task 16 | covered |
| 9 Last task lists the plan file as Create | Task 16 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
