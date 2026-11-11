# Lean wave 8a: validators and test hygiene Implementation Plan

**Commit:** `fix(#9350): validators - schema truth, test hygiene, review scope`
**Goal:**
- Make the main-session validators tell the truth: `validate-discovery.js` stops warning about the six ship-step agents, and the check-consistency rule 1 message stops giving outdated advice.
- Make two JSON schemas match the code that writes or reads the data (`execute-state`, `review-dimension`).
- Remove false failures and side effects from the test suites (three behavioural assertions, a dead config key, an exec case that writes into the real `.sdlc/execution/out`).
- Fix four small text drifts (site text, two user docs, one JSDoc).
- Stop ship from asking twice about one out-of-scope review fix, and stop `wave-watch` from reprinting finished waves on resume.
**Architecture:** Each item is a small, local edit next to the code it describes. The one behaviour change in ship is a new ledger field, `approvedScope`, written by `skill/ship.js` when received-review stops on its scope question, and read by the same file's `stage_fixes` guard. The one behaviour change in execute is a start-of-watch baseline inside `cmdWaveWatch`. Both get a spec id change first (ship R94 new, execute R88 amended) and exec test cases.
**Source:** conversation context (lean wave 8a brief, tracking id #9350; items #9243, #9128, #9229, #9300, #9125, #9191, #9252, #9234, #9322, #9313, #9353, #9354)
**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js && node .claude/skills/validate-skill-docs/check-docs-consistency.js && node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . && node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js && node plugins/sdlc-utilities/scripts/ci/validate-discovery.js`, then the targeted exec run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "sdlc-plugin-discovery|script-resolution|schema-truth|error-report-prepare|wave-watch|ship-scope-keep|ship-strict|ship-stage-fixes" -j 2 --no-cache`

---

## Context

**What problem does this change solve?**

- The validators that the main session runs after every wave give wrong signals.
  - `validate-discovery.js` reports a PD16 warning for six agents that are correct.
  - A warning that is always there hides a real new warning.
  - The check-consistency rule 1 message tells authors to use a `find ~/.claude/plugins` lookup. The same tool's rule 1b forbids that lookup.
- Two JSON schemas describe data that the code no longer writes or accepts.
- Some tests fail when the skill behaves correctly, and one test writes files into the real repository state directory.
- In lean wave 3, ship asked the owner twice about the same out-of-scope review fix (ledger F-36).

**What prompted this change now?**

- These are the open small follow-ups placed in lean wave 8 by the 2026-11-11 triage, plus two add-ons from the owner (#9353, #9354).

**What does success look like?**

- All five main-session validators exit 0, and `validate-discovery.js` reports 16 of 16 checks pass.
- The targeted exec cases pass.
- A resumed ship run after a "keep" answer stages the kept file without asking again.

## Research Findings

Each item was re-checked against HEAD `fa7a61b`. The discovery brief (`F-<dim>-<n>` ids below) holds the full evidence.

- **#9243 (PD16).** `checkPD16` in `plugins/sdlc-utilities/scripts/lib/discovery.js:559-585` pushes `frontmatter missing "tools"` when `tools` is absent. The six `agents/ship-step-*.md` files leave `tools` out on purpose, so they inherit every tool (plan `docs/plans/2026-10-19-m4-w2-ship-agents.md:133`). The PD12 half of the item no longer reproduces: a run at HEAD shows 15 of 16 checks pass, only PD16 fails (F-pd16-tools-check-and-consistency-message-1, -2). Neither marketplace fixture has an `agents/` directory, so PD16 has no test (-3).
- **#9128.** `.claude/skills/validate-plugin-consistency/check-consistency.js:328` says `find ~/.claude/plugins first`. Rule 1b at :363 forbids exactly that and prescribes the injected `<PLUGIN_ROOT>` form (-4). No fixture triggers rule 1 today: `resolution-validator-cases/bad-project` fires only rule 1b.
- **#9229.** `schemas/execute-state.schema.json` has top-level `additionalProperties: false`, but `state/execute.js` init (:278-292) also writes `worktree`, `quality`, `plannedTaskIds` and `selection`. `planHash` is typed as a string but the writer may write `null` (F-schema-vs-writer-drift-1, -2). Nothing loads the schema (-4).
- **#9300.** `schemas/review-dimension.schema.json:43-46` allows `model` in `[haiku, sonnet, opus]`. `lib/dimensions.js:110-111` accepts `fable` too, and any id matching `^claude-[a-z0-9][a-z0-9.-]*(\[1m\])?$`; spec review-sdlc R15 agrees with the code (-5, -6).
- **#9125, #9191, #9252.** The three behavioural assertions reproduce at `tests/promptfoo/datasets/ship-sdlc.yaml:302-304`, `pr-sdlc.yaml:237-238` and `:243-244`, and `plan-sdlc.yaml:1485-1486` (F-promptfoo-dataset-fragility-1 to -3).
- **#9234.** `tests/promptfoo/promptfooconfig.yaml:3-4` holds `evaluateOptions.concurrency: 8`. promptfoo reads `maxConcurrency`, so the key does nothing (-4).
- **#9322.** Only the `--output-file` case at `tests/promptfoo/datasets/error-report-prepare-exec.yaml:32-44` writes. It has no `script_env`, so `lib/output.js` writes into the repository's `.sdlc/execution/out`. The regex at :41 accepts that path and hides the write (-5). `SDLC_STATE_DIR_OVERRIDE` (`lib/state.js:82-84`) moves the state directory; `file://fixtures-fs/` project roots are copied to a temp directory (`tests/promptfoo/scripts/extract-skill-content.js:48-55`).
- **#9313.** `site/src/data/skills-meta.ts:202` and `:212` describe version-sdlc as always tagging; `--no-tag` (spec version-sdlc A9) is missing (F-docs-and-site-text-drift-1).
- **#9354.** Four parts, all reproduce:
  - `docs/skills/pr-sdlc.md` never mentions the `gh pr create warnings:` output (spec pr-sdlc E9, SKILL.md step 2) (-2).
  - The `docs/skills/ship-sdlc.md:116` diagram says `(gh auth, branch checks)`, but R91 asks for gh only when a gh step runs (-3).
  - `probeGhAuth` returns `timedOut` but its JSDoc (`lib/git.js:654-662`) omits it (-4).
  - `cmdWaveWatch` (`state/execute.js:1356-1385`) keeps only an in-memory `printed` set, so a watcher started on resume prints every finished wave again (F-schema-vs-writer-drift-7).
- **#9353.** `stageScope` (`skill/ship.js:1461-1481`) allows only plan Files paths, the plan file and `.sdlc/`. When received-review stops on its scope question (options `keep`, `revert`, received-review R30), ship stops through `pendingStop` (:2532) and records nothing. After the resume, `stage_fixes` refuses the same file again (`stageOutsideFiles`) (F-ship-out-of-scope-fix-approval-1 to -4). Received-review needs no change (-5).
- **Site copies.** `site/src/content-source/` holds byte copies of `docs/` (made by `site/scripts/copy-docs.mjs`). At HEAD the copies of the four changed docs are identical to their sources, so every task that edits one of them also copies it.
- **Tests.** Exec cases run through `tests/promptfoo/providers/script-runner.js` (`script_path`, `script_args`, `script_cwd`, `script_env`). Ship stepper cases use `tests/promptfoo/scripts/run-ship-stepper.js` with results files written by `fixtures-fs/project-ship-stepper/setup.sh`. Schema checks follow `tests/promptfoo/scripts/run-schema-rejection-receivedreview.js`: a structural check, no `ajv`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| #9243 PD12 half | no | dropped | PD12 passes at HEAD; it checks sibling `.md` refs in skills and never reads `agents/` (F-pd16-tools-check-and-consistency-message-2) |
| #9243 PD16 fix | no | makes `tools` optional in PD16 instead of adding `tools:` to the six agents | the agents omit `tools` by design to inherit every tool; Claude Code accepts an agent without `tools` |
| #9229 scope | no | adds four fields (`worktree`, `quality`, `plannedTaskIds`, `selection`) and makes `planHash` nullable, not only the two named fields | the writer writes all four and may write a null `planHash` (F-schema-vs-writer-drift-1, -2) |
| #9234 value | no | removes the dead key; does not add `maxConcurrency: 8` | the key never worked, so the effective concurrency stays the promptfoo default; raising it would change behavioural runs that only the owner starts |
| #9353 keep signal | no | treats "resumed without reverting the named paths" as the keep answer | under `--auto` ship asks nothing (R85) and the answer never reaches `ship.js`; a revert removes the paths from `git status`, so only kept paths remain |
| #9354 retry message | no | documents only the `gh pr create warnings:` output | the account-recovery retry message is already documented at `docs/skills/pr-sdlc.md:233-252` |
| ship-state schema `round`/`rounds` | no | not added | out of #9353 scope; recorded as a follow-up |
| PR issue links | no | the PR body names the tracking ids as text, with no `Fixes #N` | #9350 and the item ids are internal tracking ids, not GitHub issues (`gh issue view 9350` → "Could not resolve to an issue"); a closing keyword would point at nothing, so `pr-link-github-issue` does not apply |

### Decisions taken without the owner

No owner was available. Each choice below took the recommended option.

1. PD16 makes `tools` optional for every agent, instead of exempting `ship-step-*` by name or requiring `skills:`.
2. The #9353 keep answer comes from the resume itself, with no new flag and no new decision step.
3. `approvedScope` lasts one review round and covers only paths that the scope question named.
4. The concurrency key is removed, not converted to `maxConcurrency: 8`.
5. `wave-watch` sets its baseline on the first pass only, and keys printed waves by number and status. `--once` keeps its current output.
6. The two schema fixes are checked by one new structural harness, `tests/promptfoo/scripts/run-schema-truth.js`, not by a JSON Schema library.

## Key Decisions

- **`tools` optional in PD16, not `tools:` added to the agents.**
  - The six ship-step agents must keep every tool, because they run whole sub-skills.
  - Listing every tool by hand would drift as Claude Code adds tools.
  - So the validator rule is wrong, not the agents. PD16 keeps checking `name` and `description`.
- **Keep = resume without revert (#9353).**
  - The alternative is a new `scope_gate` decision step, or a new `--approve-scope` flag.
  - A decision step is not emitted under `--auto` (R85), and F-36 happened under `--auto`. A flag adds a new resolution site.
  - Recording the asked paths at the stop is deterministic: a path that the user reverted is no longer in `git status`, so only kept paths reach `stage_fixes`.
- **Approval is narrow.**
  - Only paths that the question's prompt text names, and only when the question offers `keep`, are recorded.
  - Only `stage_fixes` in the same review round reads them; `stage_changes` never does.
  - A file that appears later is still refused (R83 stays the default).
- **`wave-watch` baseline on the first pass (#9354).**
  - Baselining on the first pass that finds the file would drop a wave that finished before that pass on a fresh run.
  - On a fresh run the state file is absent or empty at the first pass, so the baseline is empty.
  - On resume, the finished waves are in the baseline and are not printed again.
  - Keying by `number:status` also prints a failed wave again when its re-run completes.
- **Workspace modes (branch and worktree).**
  - The new ledger field is written by the existing ledger write, whose path comes from `resolveStateDir()`, the state directory shared by all worktrees.
  - The paths it holds come from `stageScope` in the active worktree (`resolveActiveWorktreeSafe()`): the main worktree under `ship.workspace=branch`, the linked worktree under `=worktree`. They are relative to that root, the same root that reads them back.
  - `wave-watch` keeps its `readState` read through `resolveStateDir()`. Nothing new writes to the current directory.
- **Structural schema harness, not `ajv`.** The project has no JSON Schema library at runtime. The existing `run-schema-rejection-receivedreview.js` sets the precedent of a structural check.
- **Smallest cut.** Every task is the minimum fix for its item. The one extra file per schema (the harness) exists because the guardrail `test-coverage-required` asks for a test, and nothing loads these schemas today.
- **Who fails if this ships wrong.**
  - Plugin maintainers: a wrong PD16 or message change misleads the main-session validation.
  - `/ship-sdlc` users: a wrong `approvedScope` could stage an unreviewed file, or still ask twice.
  - `/ship-sdlc` users watching execute progress: a wrong baseline could hide a wave line.
- **Non-goals.**
  - No change to received-review, its SKILL.md or its agent.
  - No new ship decision step or flag.
  - No `round`/`rounds` in `ship-state.schema.json`.
  - No retirement of check-consistency rule 1.
  - No cleanup of files already in `.sdlc/execution/out`.
  - No behavioural promptfoo runs; nothing under `plugins/sdlc-utilities/evals/` and no change to `plugin.json`.

## Contract Examples

```markdown
**Contract:**
- shape (code): `stageScope(planFile: string, cwd: string, approved: string[] = []): { outside: string[] }`; approved paths are normalised like plan Files paths and added to `allowed`.
- names: `stageScope`, `ledger.approvedScope`.
- mirror: `skill/ship.js:1461-1481`.
- decisions: Key Decisions "Approval is narrow".
- sync: `schemas/ship-state.schema.json` `approvedScope`; spec ship-sdlc R94.
```

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/pr-sdlc.md`. Add `### gh pr create warnings` (audience: end users) after `### Account auto-recovery (post-failure retry)`; one paragraph and one fenced example; cites spec E9.
- names: heading `### gh pr create warnings`.
- mirror: `docs/skills/pr-sdlc.md:233-252`.
- decisions: user-facing prose only.
- sync: byte copy `site/src/content-source/skills/pr-sdlc.md`.
```

```markdown
**Contract:**
- shape (openspec): ADD `R94` to `docs/specs/ship-sdlc.md` under `## Step composition`, directly after the R83 block; ADD the appendix row `| R94 | review scope keep, #9353 |`; numbering continues from R93.
- names: `R94`.
- mirror: R83 block at `docs/specs/ship-sdlc.md:203-204`.
- decisions: no renumbering; R82, R83 and E10 text unchanged.
- sync: byte copy `site/src/content-source/specs/ship-sdlc.md`.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks (1, 2, 3, 4, 6, 9, 11) add or update exec cases; Task 8 is a comment-only change and Task 5 edits tests themselves |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only a targeted run of the exec-only config (no LLM provider); no tight-loop retries; behavioural suites are not run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Each task maps to a named item; the extra schema fields are justified in Deviations |
| single-responsibility-tasks | warning | FAIL (advisory) | Tasks 7, 12 and 13 were split in Step 4. Task 5 still bundles four one-line assertion and config fixes (#9125, #9191, #9252, #9234) of the same kind in the behavioural suite; kept together on purpose |
| scripts-over-llm-logic | error | PASS | All behaviour changes are in scripts (ship.js, execute.js, discovery.js) |
| yagni | warning | PASS | No speculative flags or abstractions; the new stepper flags are used by the new cases |
| cross-skill-consistency | error | PASS | The execute wave-watch change is checked against ship R92; ship docs and spec are kept in sync |
| pr-link-github-issue | error | PASS (not applicable) | #9350 and the item ids are internal tracking ids, not GitHub issues (`gh issue view 9350` fails); the PR body names them as text (Deviations row "PR issue links") |
| dry | warning | PASS | One shared schema harness for both surfaces; no copy-pasted logic |
| kiss | warning | PASS | Smallest local edits; a structural harness is used instead of ajv |
| spec-first | error | PASS | Task 10 (spec R94) precedes Task 11; Task 9 amends the R88 spec before the code in the same task; no SKILL.md changes |
| project-agnostic | error | PASS | Behaviour changes ship in plugin scripts; repo-local edits are the repo's own validators, tests and site (dogfooding) |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag gating is added |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites are changed |
| flag-resolution-single-source | warning | PASS | The keep answer is derived in ship.js only; no new flag |
| state-premise | error | PASS | Context states the problem: validators give wrong signals and tests give false failures |
| smallest-viable-cut | warning | PASS | The Smallest cut decision is recorded and each extra file is justified |
| failure-audience | warning | PASS | Key Decisions names who fails if this ships wrong (maintainers, ship users, execute watchers) |
| explicit-non-goals | warning | PASS | A Non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded with rationale in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified; the resume behaviour is tested |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are added or overridden |
| flag-semantic-consistency-cross-skill | error | PASS | The new flags exist only in a test stepper, not in a user-invoked prepare script |
| workspace-mode-compatibility | error | PASS | Key Decisions "Workspace modes" and the Task 9 and Task 11 notes: ledger write via resolveStateDir(); paths from resolveActiveWorktreeSafe() in both modes; wave-watch read unchanged |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 changes the agent frontmatter contract in `plugins/sdlc-utilities/scripts/lib/discovery.js` ("PD16 no longer requires `tools`"), and Task 11 adds `ledger.approvedScope` read by `stage_fixes` in `plugins/sdlc-utilities/scripts/skill/ship.js`.

**Severity hint:** high

**Patch:** Add checklist items for the agent frontmatter contract (`tools` optional, absent means all tools, PD16 checks name and description only) and the new `ledger.approvedScope` field and R94 stage_fixes behaviour in `skill/ship.js`.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add checklist items for the agent frontmatter contract (`tools` optional, absent means all tools, PD16 checks name and description only) and the new `ledger.approvedScope` field and R94 stage_fixes behaviour in `skill/ship.js`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-11 touch many .md, .yaml, .json and .sh files (e.g. `docs/specs/ship-sdlc.md`, `schemas/ship-state.schema.json`) that the dimension's current triggers do not match, so the script proposes adding `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Task 7 edits `site/src/content-source/skills/pr-sdlc.md` and Tasks 9 and 10 edit the site spec copies under `site/src/content-source/specs/`, with no existing dimension covering them.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Tasks

### Task 1: PD16 accepts agents without `tools` (#9243)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/discovery.js` — PD16 no longer requires `tools`; header comment and pass message updated
- Create: `tests/promptfoo/fixtures-fs/healthy-marketplace/plugins/sdlc-utilities/agents/step-runner.md`
- Create: `tests/promptfoo/fixtures-fs/broken-marketplace/plugins/sdlc-utilities/agents/no-description.md`
- Test: `tests/promptfoo/datasets/sdlc-plugin-discovery-exec.yaml`

**Notes:**
Evidence: F-pd16-tools-check-and-consistency-message-1, -2, -3. Claude Code gives an agent without `tools` every tool, and the six ship-step agents rely on that. PD16's job is discoverability, which needs `name` and `description` only. The healthy fixture gets an agent without `tools` so PD16 is exercised, not vacuous.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js` reports `"pass": 16`, `"fail": 0`.
- [ ] An agent with no `description` still fails PD16 (severity warning).
- [ ] Targeted exec run `--filter-pattern "sdlc-plugin-discovery"` passes.

**Contract:**
- shape (code): in `checkPD16(plugins)` remove the `tools` line; keep the `name` and `description` lines. Text changes:

```diff
- *   PD16 agents-discoverable            — agents have frontmatter with name+description+tools
+ *   PD16 agents-discoverable            — agents have frontmatter with name+description (tools optional: absent = all tools)
-      if (!fm.tools)       details.push(`${entry.name}/agents/${f}: frontmatter missing "tools"`);
-    'All agent files have frontmatter with name, description, and tools');
+    'All agent files have frontmatter with name and description');
```

  Fixture `step-runner.md`: frontmatter `name: step-runner`, `description: Runs one step.`, `skills: [pr-sdlc]` (the healthy fixture's only skill), no `tools`; body one line. Fixture `no-description.md`: frontmatter `name: no-description` and `tools: Read` only.
- names: `checkPD16`, `step-runner.md`, `no-description.md`.
- mirror: frontmatter shape of `plugins/sdlc-utilities/agents/ship-step-commit.md:1-7`; dataset case shape at `sdlc-plugin-discovery-exec.yaml:29-49`.
- decisions: Key Decisions "`tools` optional in PD16".
- sync: dataset header comment (`:5-8`) names PD16 in the broken list.

Dataset changes:

| Case | Change |
|---|---|
| `healthy marketplace passes all 16 checks` | unchanged; now covers an agent without `tools` |
| `broken marketplace reports errors` | add `- type: icontains` `value: 'no-description.md: frontmatter missing \"description\"'` |
| new `sdlc-plugin-discovery: PD16 passes an agent without tools` | healthy fixture, `--json`; javascript: the `PD16` check has `status` `pass` |

### Task 2: Check-consistency rule 1 message names the injected path (#9128)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — rule 1 docblock and message
- Create: `tests/promptfoo/fixtures-fs/resolution-validator-cases/cwd-first-project/plugins/sdlc-utilities/skills/example-skill/SKILL.md`
- Test: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml`

**Notes:**
Evidence: F-pd16-tools-check-and-consistency-message-4. Rule 1 fires only when a CWD `find` comes before a `~/.claude/plugins` `find`. No fixture triggers it, so the message has no test. The new fixture triggers it.

**Acceptance criteria:**
- [ ] The rule 1 message contains `<PLUGIN_ROOT>` and does not contain `find ~/.claude/plugins first`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 on the repository.
- [ ] Targeted exec run `--filter-pattern "script-resolution"` passes.

**Contract:**
- shape (code):

```diff
  /**
   * Rule 1 — script-resolution-order
-  * All find patterns in skill files must use plugins-first order.
+  * A skill must not search CWD before ~/.claude/plugins; scripts are invoked by the injected path.
   */
...
-        message: 'Script resolution uses CWD-first order. Use plugins-first: find ~/.claude/plugins first, then fall back to find .',
+        message: 'Script resolution searches CWD before ~/.claude/plugins. Do not use find: invoke the script as node "<PLUGIN_ROOT>/scripts/…", substituting <PLUGIN_ROOT> from the \'sdlc plugin root:\' line in session context.',
```

  Fixture SKILL.md: frontmatter `name: example-skill`, `description: Example.`, then a bash fence with `find . -name "example.js"` on one line and `find ~/.claude/plugins -name "example.js"` on a later line.
  New case `script-resolution: rule 1 message names the injected <PLUGIN_ROOT> path`: `--project-root {{project_root}} --json`, project root `file://fixtures-fs/resolution-validator-cases/cwd-first-project`; asserts with one javascript check that the finding whose `rule` is `script-resolution-order` exists and its `message` includes `<PLUGIN_ROOT>` (rule 1b, also fired by this fixture, already names `<PLUGIN_ROOT>`, so a whole-output `icontains` would prove nothing), plus `not-icontains 'find ~/.claude/plugins first'`.
- names: rule `script-resolution-order`, fixture `cwd-first-project`.
- mirror: message style of rule 1b at `check-consistency.js:363`; case shape at `sdlc-script-resolution-exec.yaml:9-22`.
- decisions: message-only; rule 1 logic unchanged (Non-goals).
- sync: none.

### Task 3: Execute-state schema matches its writer, plus the schema harness (#9229)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `schemas/execute-state.schema.json` — four properties added; `planHash` nullable
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — the `planHash` row stops claiming a non-null schema type
- Create: `tests/promptfoo/scripts/run-schema-truth.js`
- Test: `tests/promptfoo/datasets/execute-prepare-exec.yaml`

**Notes:**
Evidence: F-schema-vs-writer-drift-1, -2, -4. Nothing validates this schema, so the drift was silent. The harness runs the real writer and compares its keys with the schema, so the next new field fails a test. Both schema surfaces live in one harness (Task 4 uses the second surface) to avoid two near-identical scripts.

**Acceptance criteria:**
- [ ] Every top-level key that `state/execute.js init` writes is in the schema `properties`.
- [ ] `planHash` accepts `null`; it stays in `required`.
- [ ] Targeted exec run `--filter-pattern "schema-truth"` passes the execute-state case.

**Contract:**
- shape (code): schema field diff (top-level `properties`):

```diff
  "planHash": {
-   "type": "string"
+   "oneOf": [{ "type": "string" }, { "type": "null" }]
  },
+ "worktree": { "type": "string" },
+ "quality": { "type": "string" },
+ "plannedTaskIds": { "oneOf": [{ "type": "array", "items": { "type": "string" } }, { "type": "null" }] },
+ "selection": { "oneOf": [{ "type": "object" }, { "type": "null" }] },
  …
```

  `REPO_ROOT = path.resolve(__dirname, '..', '..', '..')`, as in the mirrored harness. Harness CLI (new script, no flags beyond this one):

| Op | Flag | Type | Values | Default |
|---|---|---|---|---|
| add | `--surface` | string | `execute-state` \| `review-dimension` | none (required) |

  Output: one JSON line on stdout.

```json
{"surface":"execute-state","extraKeys":[],"planHashNullable":true}
{"surface":"review-dimension","rejectedValid":[],"acceptedInvalid":[]}
```

| Condition | Exit | Output |
|---|---|---|
| `--surface` missing or not one of the two values | 2 | `Usage: node run-schema-truth.js --surface execute-state\|review-dimension` on stderr |
| `state/execute.js init` exits non-zero, or writes no `execute-*.json` | 2 | `init failed: <stderr>` on stderr |
| any comparison result (empty or not) | 0 | the JSON line above |

  `execute-state` call order:
  1. harness → `fs.mkdtempSync(path.join(os.tmpdir(), 'schema-truth-'))` → temp state dir `T`.
  2. harness → `spawnSync('node', ['plugins/sdlc-utilities/scripts/state/execute.js', 'init', '--branch', 'schema-truth', '--quality', 'balanced', '--total-tasks', '1', '--planned-task-ids', '["1"]', '--selection', '{"tasks":"1","fromWave":null,"taskIds":["1"]}'], { cwd: REPO_ROOT, env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: T } })` → writes `T/execute-schema-truth-*.json`.
  3. harness → reads that file and `schemas/execute-state.schema.json` → `extraKeys` = file keys not in `schema.properties`; `planHashNullable` = `schema.properties.planHash` allows `{ "type": "null" }`.
  4. harness → `fs.rmSync(T, { recursive: true, force: true })` (also on the exit 2 path).

  `review-dimension`: evaluate `schema.properties.model` (keywords `type`, `enum`, `pattern`, `anyOf` only) against the valid values `haiku, sonnet, opus, fable, claude-opus-4-1, claude-sonnet-4-5[1m]` (`rejectedValid` = those it rejects) and the invalid values `gpt-4, Claude-opus, ""` (`acceptedInvalid` = those it accepts).
  New case `schema-truth: execute-state schema covers every key the writer writes`: `script_path: "repo://tests/promptfoo/scripts/run-schema-truth.js"`, `script_args: "--surface execute-state"`; javascript asserts `extraKeys.length === 0 && planHashNullable === true`.
  `state-format.md:77` `planHash` row: replace "Populated whenever `planPath` is populated, per the schema (`schemas/execute-state.schema.json`), which types this field as a required non-null string." with "Populated whenever `planPath` is populated; `null` when `init` gets no `--plan-hash` (the schema allows `null`)."
- names: `run-schema-truth.js`, `--surface`, `extraKeys`, `planHashNullable`, `rejectedValid`, `acceptedInvalid`.
- mirror: `tests/promptfoo/scripts/run-schema-rejection-receivedreview.js:1-60`; field types from the writer at `state/execute.js:245-292` (`quality` is a required string the writer does not check against a list; `plannedTaskIds` holds strings, execute-plan-sdlc SKILL.md:543).
- decisions: Decisions taken without the owner, item 6.
- sync: Task 4 adds the review-dimension case for the same harness.

### Task 4: Review-dimension schema accepts every model the validator accepts (#9300)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `schemas/review-dimension.schema.json` — `model` accepts the aliases and `claude-*` ids
- Test: `tests/promptfoo/datasets/sdlc-dimensions-exec.yaml`

**Notes:**
Evidence: F-schema-vs-writer-drift-5, -6. The new case runs Task 3's harness with `--surface review-dimension`: it checks `schema.properties.model` against fixed valid values (the four aliases and two `claude-*` ids) and invalid values (`gpt-4`, `Claude-opus`, `""`) and prints `rejectedValid` and `acceptedInvalid`. No script loads this schema, so the stale enum blocks nothing at runtime; it misleads IDE and external validators.

**Acceptance criteria:**
- [ ] The schema accepts `fable` and `claude-sonnet-4-5[1m]` and rejects `gpt-4`.
- [ ] Targeted exec run `--filter-pattern "schema-truth"` passes both cases.

**Contract:**
- shape (code):

```diff
  "model": {
    "type": "string",
-   "enum": ["haiku", "sonnet", "opus"]
+   "anyOf": [
+     { "enum": ["haiku", "sonnet", "opus", "fable"] },
+     { "pattern": "^claude-[a-z0-9][a-z0-9.-]*(\\[1m\\])?$" }
+   ]
  },
```

  New case `schema-truth: review-dimension model matches D13`: `script_args: "--surface review-dimension"`; javascript asserts `rejectedValid.length === 0 && acceptedInvalid.length === 0`.
- names: schema property `model`.
- mirror: `MODEL_ALIASES` and `MODEL_ID_RE` at `plugins/sdlc-utilities/scripts/lib/dimensions.js:110-111`.
- decisions: aliases and pattern copied from the code, which spec review-sdlc R15 confirms. Evidence: F-schema-vs-writer-drift-5, -6.
- sync: `lib/dimensions.js:110-111`.

### Task 5: Behavioural assertions and config stop failing correct answers (#9125, #9191, #9252, #9234)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — the `--auto --draft` literal check becomes a table-row check
- Modify: `tests/promptfoo/datasets/pr-sdlc.yaml` — retry regex widened; rubric names the injected path
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — `opus` check anchored on a `model` value
- Modify: `tests/promptfoo/promptfooconfig.yaml` — dead `concurrency` key removed

**Notes:**
Evidence: F-promptfoo-dataset-fragility-1 to -4. Behavioural suites are not run in this wave (owner-initiated only). Verification is a YAML parse and review. Four one-line edits of the same kind, so one Trivial task.

**Acceptance criteria:**
- [ ] For each of the four files, `npx --yes js-yaml@4.1.0 <file> > /dev/null` exits 0 (the repository has no local YAML parser).
- [ ] No `concurrency:` key remains in `promptfooconfig.yaml`.

**Contract:**
- shape (code): before → after per site.

| File and site | Before | After |
|---|---|---|
| `ship-sdlc.yaml:302-304` | `type: not-icontains`, `value: "--auto --draft"` | comment `# The pr-sdlc table row must not carry --draft (issue #97); quoting the SKILL.md example in prose is fine`; `type: not-regex`, `value: '\|[^\n|]*pr-sdlc[^\n]*--draft'` |
| `pr-sdlc.yaml:237-238` | `value: "(retry\|retried\|re-run\|rerun).{0,40}(once\|exactly one\|single)"` | `value: "(retry\|retries\|retried\|retrying\|re-run\|re-runs\|rerun\|reruns)[\\s\\S]{0,60}(once\|exactly one\|single)"` |
| `pr-sdlc.yaml:243-244` | "using the standard installed-first-then-local script lookup pattern (find under ~/.claude/plugins, fallback to plugins/sdlc-utilities/scripts/skill/)." | "resolving the helper path from the injected `<PLUGIN_ROOT>` (the `sdlc plugin root:` context line), with no `find` lookup." |
| `plan-sdlc.yaml:1485-1486` | `type: not-icontains`, `value: "opus"` | `type: not-regex`, `value: 'model\W{0,5}[Oo]pus'` |
| `promptfooconfig.yaml:3-4` | `evaluateOptions:` / `  concurrency: 8` | both lines removed |

  (In the table `\|` is the Markdown escape for `|`. In the `pr-sdlc.yaml` regex the `|` are alternations, so the YAML holds a plain `|`. In the `ship-sdlc.yaml` regex the leading `\|` matches a literal table pipe, so the YAML keeps the backslash: `'\|[^\n|]*pr-sdlc[^\n]*--draft'`. A leading bare `|` would match the empty string and fail every run.)
- names: the four sites above.
- mirror: `not-regex` use elsewhere in `tests/promptfoo/datasets/*.yaml`.
- decisions: Deviations row "#9234 value".
- sync: none.

### Task 6: error-report-prepare exec case writes to a temp state directory (#9322)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Test: `tests/promptfoo/datasets/error-report-prepare-exec.yaml`

**Acceptance criteria:**
- [ ] The `--output-file` case writes under a `promptfoo-fixture-*` temp copy, not under the repository's `.sdlc/execution/out`.
- [ ] The regex no longer accepts the repository path.
- [ ] Targeted exec run `--filter-pattern "error-report-prepare"` passes.

**Contract:**
- shape (code): case diff at `:32-44`:

```diff
  - description: "error-report-prepare: --output-file writes a manifest and prints its absolute path"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/error-report-prepare.js"
      script_args: "--skill pr-sdlc --step Step-2 --operation gh-pr-create --error-text 401-Bad-credentials --output-file"
      script_passthrough: true
+     project_root: "file://fixtures-fs/project-setup-empty"
+     script_env: '{"SDLC_STATE_DIR_OVERRIDE": "{{project_root}}/.sdlc/execution"}'
    assert:
      - type: regex
-       value: '^(?:/(?:tmp|var|private)/.+/|.+/\.sdlc/execution/out/)sdlc-error-report-(?:[A-Za-z0-9-]+-\d{8}T\d{6}Z-[0-9a-f]{4}|[0-9a-f]{8})\.json\s*$'
+       value: '^/.+/promptfoo-fixture-[^/]+/\.sdlc/execution/out/sdlc-error-report-[A-Za-z0-9-]+-\d{8}T\d{6}Z-[0-9a-f]{4}\.json\s*$'
```

  The comment above the regex is updated to name the override directory. `script_cwd` stays unset, so git and branch detection run as before.
- names: `SDLC_STATE_DIR_OVERRIDE`.
- mirror: `script_env` use at `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml:98-106`.
- decisions: no cleanup of existing files in `.sdlc/execution/out` (Non-goals).
- sync: none.

### Task 7: pr-sdlc user doc names the `gh pr create` warnings (#9354 part 1)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/pr-sdlc.md` — new `### gh pr create warnings` subsection
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy

**Notes:**
Evidence: F-docs-and-site-text-drift-2.

**Acceptance criteria:**
- [ ] `cmp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY `docs/skills/pr-sdlc.md`. After the `### Account auto-recovery (post-failure retry)` block (before its `---`), add (audience: end users):

```markdown
### gh pr create warnings

When `gh pr create` succeeds but writes to stderr (for example a notice about an unpushed commit or a deprecated flag), the skill prints that text after the line `gh pr create warnings:`. Nothing is printed when stderr is empty. Tracked in spec requirement E9.
```

  Then `cp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md`.
- names: heading `### gh pr create warnings`.
- mirror: `docs/skills/pr-sdlc.md:233-252`.
- decisions: Deviations row "#9354 retry message".
- sync: spec pr-sdlc E9; pr-sdlc SKILL.md create-mode step 2.

### Task 8: `probeGhAuth` JSDoc lists `timedOut` (#9354 part 3)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/git.js` — JSDoc of `probeGhAuth`

**Acceptance criteria:**
- [ ] The JSDoc `Returns:` list and `@returns` type both name `timedOut`.
- [ ] `node -e "require('./plugins/sdlc-utilities/scripts/lib/git.js')"` exits 0.

**Contract:**
- shape (code): comment-only diff:

```diff
   *   - errorMessage: human-readable summary when authenticated === false
+  *   - timedOut: true when `gh auth status` did not answer before the probe timeout (spec ship-sdlc R91)
...
-  * @returns {{ authenticated: boolean, activeAccount: string|null, expired: boolean, errorMessage: string|null }}
+  * @returns {{ authenticated: boolean, activeAccount: string|null, expired: boolean, errorMessage: string|null, timedOut: boolean }}
```

- names: `probeGhAuth`, `timedOut`.
- mirror: `lib/git.js:648-662`.
- decisions: no code change.
- sync: the return statements at `lib/git.js:677-725`.

### Task 9: `wave-watch` does not reprint waves finished before it started (#9354 part 4)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — R88 amended; appendix row
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `cmdWaveWatch` baseline and `number:status` keys
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml`

**Notes:**
Evidence: F-schema-vs-writer-drift-7. Ship starts the watcher before every execute dispatch, resume included (ship-sdlc SKILL.md:274). Workspace modes: the watcher reads the state file through `readState('execute', slug)`, which resolves `resolveStateDir()` (main-worktree-shared), so `ship.workspace=branch` and `=worktree` behave the same; this task does not touch that read. On resume the state file already holds finished waves, so they were printed again. `--once` is a one-shot status read and keeps printing every finished wave.

**Acceptance criteria:**
- [ ] Without `--once`, a wave already finished at the first pass is not printed.
- [ ] A wave whose status changes later (for example `failed` then `completed`) is printed once per status.
- [ ] `--once` output is unchanged (existing case passes).
- [ ] Targeted exec run `--filter-pattern "wave-watch"` passes.

**Contract:**
- shape (openspec + code): R88 text (MODIFY, appended sentence, id unchanged):

  > Without `--once`, the waves already finished at the first poll (the state file may be absent then) are a baseline and are not printed; a wave is printed once for each later `status` it reaches. `--once` prints every finished wave.

  Appendix row added under the existing R88 row: `| R88 | resume baseline (#9354) |`.
  Code change in `cmdWaveWatch`:

```diff
-  const printed = new Set();
+  const printed = new Set(); // keys `${number}:${status}`
+  let first = !opts.once;
   ...
-    if (!found) return false;
+    if (!found) { first = false; return false; }
     ...
-      if (!wave || printed.has(wave.number)) continue;
-      if (!['completed', 'partial', 'failed'].includes(wave.status)) continue;
+      if (!wave || !['completed', 'partial', 'failed'].includes(wave.status)) continue;
+      const key = `${wave.number}:${wave.status}`;
+      if (printed.has(key)) continue;
+      printed.add(key);
+      if (first) continue; // R88: baseline at the first poll
       …print line…
-      printed.add(wave.number);
     }
+    first = false;
```

  Docblock: "each wave once" → "each wave once per status, waves finished before the first poll excluded (without --once)".
  New case `execute-plan-sdlc/liveness/wave-watch: a watch started after wave 1 finished prints nothing (R88 baseline)`: fixture `file://fixtures-fs/execute-state-mid-wave`, `script_args: "wave-watch --branch fix/resume-idem --interval 1 --timeout 1"`, same `script_cwd` and `script_env` as the `--once` case; javascript asserts `output.trim() === ''`.
- names: `cmdWaveWatch`, R88.
- mirror: `--once` case at `execute-plan-sdlc-liveness-exec.yaml:98-107`; R88 at `docs/specs/execute-plan-sdlc.md:88`.
- decisions: Key Decisions "`wave-watch` baseline on the first pass".
- sync: `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`; ship-sdlc R92 wording stays true.

### Task 10: Ship spec and state contract for the review-scope keep (#9353)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R94 added after R83; appendix row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy
- Modify: `schemas/ship-state.schema.json` — `approvedScope` property
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `approvedScope` row in the top-level table

**Notes:**
Evidence: F-ship-out-of-scope-fix-approval-4, -6. A new id (R94), not an edit of R82/R83, keeps the existing acceptance prefixes stable; ids are never renumbered.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('schemas/ship-state.schema.json','utf8'))"` exits 0.

**Contract:**
- shape (openspec): ADD after the R83 block (`docs/specs/ship-sdlc.md:203-204`):

  > - R94: Review-scope keep. When `--after dispatch_received_review` stops with a pending question whose options include `keep` (a received-review R30 scope failure, R82), `skill/ship.js` records `ledger.approvedScope = { round, paths }`: `round` is `ledger.round` (1 when unset), `paths` the changed paths outside the plan Files (the R83 rule) that the question's prompt names. Resuming without reverting them is the keep answer: in the same review round, `stage_fixes` treats those paths as allowed, so the run does not stop with `stageOutsideFiles` for them. A path the prompt did not name, a path changed later, and every path in a later round are still refused (R83). `stage_changes` ignores `approvedScope`. Ship asks nothing new, under `--auto` included (R85).
  >   - Acceptance: exec cases whose descriptions start with `ship-scope-keep:`.

  Appendix row after `| R93 | mid-wave execute hand-back, #9349 |`: `| R94 | review scope keep (ledger F-36), #9353 |`.
  Schema field diff (top-level `properties`):

```diff
+ "approvedScope": {
+   "type": "object",
+   "properties": {
+     "round": { "type": "integer", "minimum": 1 },
+     "paths": { "type": "array", "items": { "type": "string" } }
+   },
+   "required": ["round", "paths"],
+   "additionalProperties": false
+ },
```

  `state-format.md` row after `currentStep`: `| \`approvedScope\` | object \| absent | \`{ round, paths }\`: outside-plan paths that received-review's scope question named, kept by resuming without reverting them (spec R94). Read only by \`stage_fixes\` in the same review round. |`
- names: `R94`, `approvedScope`, `round`, `paths`.
- mirror: R83 block at `docs/specs/ship-sdlc.md:203-204`; `deferredFindings` schema block at `schemas/ship-state.schema.json:102`.
- decisions: Key Decisions "Keep = resume without revert" and "Approval is narrow".
- sync: `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`; Task 11 implements R94; Task 12 adds the user doc bullet.

### Task 11: Ship records and honours the review-scope keep (#9353)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 10
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `stageScope` takes approved paths; received-review pending stop records `approvedScope`; `stage_fixes` passes it
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--scope-asked` and `--write-after` in `stage-outside-files`; `approvedScope` in `snap()`
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — `results/received-review-scope.json`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml`

**Notes:**
Evidence: F-ship-out-of-scope-fix-approval-1 to -5, -7. The stage guard and the stop path both live in `skill/ship.js`, so the fix needs no change in received-review or in ship SKILL.md. The paths are recomputed with `stageScope` at the stop, so they are the exact R83 set, and they are cut to the ones the prompt names, so a non-scope question approves nothing.
Workspace modes: the ledger is written by the existing `finish()` → `writeState(ledgerPath)`, and `ledgerPath` comes from `resolveStateDir()` (main-worktree-shared), so no new state path. Both `stageScope` calls use `resolveActiveWorktreeSafe()`: under `ship.workspace=branch` that is the main worktree, under `=worktree` the linked worktree. The recorded paths are relative to that root, like plan Files paths, so the same tree reads them back in both modes.

**Acceptance criteria:**
- [ ] After a received-review scope stop naming `out.txt`, the ledger holds `approvedScope: { round: 1, paths: ["out.txt"] }`.
- [ ] The next `--after dispatch_received_review` success emits `stage_fixes` with no `stageOutsideFiles` question.
- [ ] A path written after the stop (`new.txt`) still stops with `stageOutsideFiles` listing only `new.txt`.
- [ ] Existing `ship-strict:` and `ship-stage-fixes:` cases pass unchanged.
- [ ] Targeted exec run `--filter-pattern "ship-scope-keep|ship-strict|ship-stage-fixes"` passes.

**Contract:**
- shape (code):

```diff
-function stageScope(planFile, cwd) {
+function stageScope(planFile, cwd, approved = []) {
   …
   if (rel && !rel.startsWith('..')) allowed.add(rel);
+  // R94: outside paths the user kept at received-review's scope question.
+  for (const p of approved) if (typeof p === 'string' && p) allowed.add(p.replace(/^\.\//, '').replace(/\/$/, ''));
```

```diff
       case 'stage_fixes': {
         …
         const wt = resolveActiveWorktreeSafe();
-        const { outside } = stageScope(flags.planFile, wt);
+        // stage_changes shares this case block; R94: only stage_fixes reads approvedScope.
+        const as = id === 'stage_fixes' ? ledger.approvedScope : null;
+        const approved = as && as.round === (ledger.round || 1) && Array.isArray(as.paths) ? as.paths : [];
+        const { outside } = stageScope(flags.planFile, wt, approved);
```

```diff
   // Failure rows.
   if (pq) {
+    // R94: record the outside paths received-review's scope question named.
+    if (after === 'dispatch_received_review' && pq.options.includes('keep')) {
+      const { outside } = stageScope(flags.planFile, resolveActiveWorktreeSafe());
+      // Whole-token match: `a.txt` must not match a prompt that names `data.txt`.
+      const tokens = new Set(pq.prompt.split(/[\s"'`,:\[\]{}()]+/));
+      const named = outside.filter(p => tokens.has(p));
+      if (named.length) ledger.approvedScope = { round: ledger.round || 1, paths: named };
+    }
     if (after === 'dispatch_execute' && …
```

  Ledger end-state after the stop:

```
Before:  { "round": undefined, "paused": undefined, … }
After:   { "approvedScope": { "round": 1, "paths": ["out.txt"] }, "paused": { "reason": "pending question", … }, … }
```

  Flow now → after (same tree: plan Files `in.txt`; received-review wrote `in.txt`, `out.txt`):

| Step | Now | After |
|---|---|---|
| received-review scope stop | pending question keep/revert | same, plus `approvedScope` recorded |
| resume, received-review success | `stage_fixes` stops: `stageOutsideFiles` `[out.txt]` | `stage_fixes` emits `git add` commands |

  `setup.sh` line (next to the other results): `echo '{"success":false,"output":{"summary":"scope check failed","pendingQuestion":{"prompt":"{\"ok\":false,\"outOfScope\":[\"out.txt\"]} Revert or keep the listed changes?","options":["keep","revert"]}}}' > results/received-review-scope.json`.
  Stepper flag delta (scenario `stage-outside-files` only; both get a usage header line):

| Op | Flag | Type | Value | Notes |
|---|---|---|---|---|
| add | `--scope-asked` | boolean | absent = off | first `--after dispatch_received_review` returns `results/received-review-scope.json` |
| add | `--write-after` | csv of paths | absent = none | written after the scope stop, with the `--write` writer |

  Stepper call order with `--fixes --scope-asked` (replaces the single `after(...)` call for that case only):
  1. stepper → `after('dispatch_received_review', 'results/received-review-scope.json')` → ship stops (`pending-question`), ledger gets `approvedScope`.
  2. stepper → `snapshots.push(snap())`.
  3. stepper → writes each `--write-after` path.
  4. stepper → `after('dispatch_received_review', 'results/generic-ok.json')` (the existing call) → `stage_fixes` or `stageOutsideFiles`.

  `snap()` field diff:

```diff
    rounds: d.rounds === undefined ? null : d.rounds,
+   approvedScope: d.approvedScope === undefined ? null : d.approvedScope,
    stepStatuses: …,
```
  New cases (after `ship-strict: (f)`):
  - `ship-scope-keep: (a) a kept outside path is staged without a second question`: `--scenario stage-outside-files --seed frozen --fixes --plan-files in.txt --write in.txt,out.txt --scope-asked`; asserts `calls[0]` is `done`/`pending-question`, `snapshots[0].approvedScope` deep-equals `{round:1,paths:['out.txt']}`, `calls[1]` is `step` with id `stage_fixes`.
  - `ship-scope-keep: (b) a path written after the question is still refused`: same plus `--write-after new.txt`; asserts `calls[1]` is `pending-question` with `id` `stageOutsideFiles` and `paths` `['new.txt']`.
- names: `stageScope(planFile, cwd, approved)`, `ledger.approvedScope`, `--scope-asked`, `--write-after`, `results/received-review-scope.json`.
- mirror: `stage-outside-files` scenario at `run-ship-stepper.js:587-609`; case `ship-strict: (d)` at `ship-prepare-exec.yaml:5370-5384`; `pendingStop` at `ship.js:2532-2545`.
- decisions: Key Decisions "Keep = resume without revert", "Approval is narrow".
- sync: spec R94 (Task 10); `schemas/ship-state.schema.json` (Task 10).

### Task 12: ship-sdlc user doc: gh preflight diagram and review-scope keep (#9354 part 2, #9353)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 10
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — diagram line; one bullet on the review-scope keep
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy

**Notes:**
Evidence: F-docs-and-site-text-drift-3, F-ship-out-of-scope-fix-approval-6. Depends on Task 10 so the bullet cites an id that exists.

**Acceptance criteria:**
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` (audience: end users).
  - Diagram `:116`: `(gh auth, branch checks)` → `(gh auth only when a gh step runs; branch checks)`, keeping the column alignment.
  - After the `**Plan file in the stage scope (R83)**` bullet (`:230`), add: `- **Review-scope keep (R94)**: when received-review stops to ask whether to keep or revert fixes outside the plan's Files, resuming ship without reverting them is the keep answer. In the same review round, commit-fixes stages those files without asking again; any other outside file is still refused.`
  - Then `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`.
- names: bullet `**Review-scope keep (R94)**`.
- mirror: `docs/skills/ship-sdlc.md:230`; R91 text at `docs/skills/ship-sdlc.md:871`.
- decisions: Key Decisions "Keep = resume without revert".
- sync: spec ship-sdlc R91 and R94.

### Task 13: Site text names the version-sdlc `--no-tag` path (#9313)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `site/src/data/skills-meta.ts` — version-sdlc tagline and `execute-release` step text
- Create: `docs/plans/2026-11-11-lean-w8a-validators-test-hygiene.md`

**Notes:**
Evidence: F-docs-and-site-text-drift-1. The item names the pipeline text ("commit, tag, push", the `execute-release` step at `:212`); the tagline at `:202` makes the same always-tags claim, so both change. The plan file is listed here because ship stages only files named in the plan.

**Acceptance criteria:**
- [ ] Both strings mention `--no-tag`.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): string replacements in the `version-sdlc` entry.

| Site | Before | After |
|---|---|---|
| `skills-meta.ts:202` `tagline` | `'Manages the full semantic release workflow: version bump, annotated git tag, optional CHANGELOG entry, and push.'` | `'Manages the full semantic release workflow: version bump, annotated git tag, optional CHANGELOG entry, and push; --no-tag makes the release commit without a tag.'` |
| `skills-meta.ts:212` `execute-release.description` | `'Atomically: bump version, changelog, commit, tag, push'` | `'Atomically: bump version, changelog, commit, tag, push (with --no-tag: no tag and no git push --tags)'` |

- names: `tagline`, step id `execute-release`.
- mirror: `skills-meta.ts:198-212`.
- decisions: user-facing text only.
- sync: spec version-sdlc A9; `docs/skills/version-sdlc.md:26`.

## Final Shape

When all tasks are done:

- `validate-discovery.js` reports 16 of 16 checks pass on the repository. Agents without `tools` are valid, and the fixtures now test PD16.
- The check-consistency rule 1 message points to the injected `<PLUGIN_ROOT>` path, and a fixture tests it.
- `execute-state.schema.json` lists every field the writer writes. `review-dimension.schema.json` accepts the same models as the D13 check. One harness test guards both.
- Behavioural cases no longer fail on correct wording, and the behavioural config has no dead key.
- The error-report exec case writes into a temp copy only.
- The site text, the pr-sdlc and ship-sdlc user docs and the `probeGhAuth` JSDoc match the code.
- In ship, a "keep" at received-review's scope question is asked once. The resume stages the kept files in the same round.
- In execute, a `wave-watch` started on resume prints only new wave results.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9243 validate-discovery green | Task 1 | covered |
| 2 #9128 check-consistency message | Task 2 | covered |
| 3 #9229 execute-state schema | Task 3 | covered |
| 4 #9300 review-dimension schema | Task 4 | covered |
| 5 #9125 ship-sdlc.yaml assertion | Task 5 | covered |
| 6 #9191 pr-sdlc.yaml rubric and regex | Task 5 | covered |
| 7 #9252 plan-sdlc.yaml opus | Task 5 | covered |
| 8 #9234 concurrency key | Task 5 | covered |
| 9 #9322 error-report exec isolation | Task 6 | covered |
| 10 #9313 skills-meta --no-tag | Task 13 | covered |
| 11 #9353 review scope keep | Task 10, Task 11, Task 12 | covered |
| 12 #9354 four drifts | Task 7, Task 12, Task 8, Task 9 | covered |
| 13 constraints | Task 9, Task 10, Task 13 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
