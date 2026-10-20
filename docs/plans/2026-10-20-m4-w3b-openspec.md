# OpenSpec Step Script (W4.4) Implementation Plan

**Goal:** Consolidate the OpenSpec work of ship, execute, pr and plan into one script, `scripts/skill/openspec-step.js`, plus one on-demand reference file, `ship-sdlc/openspec-steps.md` (item W4.4).
**Architecture:** A zero-dependency CommonJS script wraps `lib/openspec.js` behind four subcommands (`detect`, `flip`, `validate`, `archive`) that print one JSON line. `ship.js` emits the script's commands for `verify_openspec`/`archive_openspec`, computes the archive prompt when it emits the step, and records the script's `resultText`. Execute, pr and plan replace their `node -e` blocks and Glob steps with one script call (or, for pr, one prepare field). The six `node -e` heredocs in `reference.md` are deleted.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-3b-plan-source.md (item W4.4; judge readings W44-1…W44-11, W44-R1…R10, C7; ruling w3b-preplan; M4 readings 6–7; plan §0), /workspace/sdlc-marketplace/.sdlc/orchestration/m4/preflight-wave-3b.md, discovery brief /tmp/sdlc-explore-m4-w3b-openspec-6r2zlw/discovery-brief.md (finding ids `F-<dim>-<n>` below)
**Verification:** before Task 1, capture `node .claude/skills/validate-plugin-consistency/check-consistency.js > "$TMPDIR/w44-cc.before"; node .claude/skills/validate-skill-docs/check-docs-consistency.js > "$TMPDIR/w44-dc.before"`; after the last task, write `.after` files the same way and `diff` each pair (expect empty). Exec runs: `mkdir -p /tmp/claude-1000/pf-tmp-exec-m4 && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m4 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "<pattern>" --no-cache` for the patterns `openspec-step`, `ship-step` and `pr-prepare` (each targeted, exec-only); then `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout.

---

## Context

**What problem does this change solve?**

- OpenSpec handling is written five times, as prose and inline code:
  - ship's two steps in `reference.md`: six `node -e` heredocs (inline Node one-liners run through Bash) and a hand-written commit;
  - execute's task flip: a seventh `node -e` block;
  - pr's and plan's detection: Glob calls the model runs itself.
- Each copy costs tokens on every run, and each shell-quoting site is a place where a change name or task title can break the command.
- The design review (#8) asks for one script and one on-demand reference file.

**What prompted this change now?**

- W4.2 (the ship step-emitter) has landed.
- `ship.js` emits `verify_openspec`/`archive_openspec` with empty `commands` and sends the model to `reference.md` (`ship.js:1646-1654`, `:1731-1732`).
- `SKILL.md:274` already says "archive_openspec prompts: texts in W4.4".
- The spec consequences landed in the previous commit (plan `2026-10-20-m4-w3b-openspec-specs.md`).

**What does success look like?**

- `reference.md` has no OpenSpec section and no `node -e`. `openspec-steps.md` holds both archive prompt texts.
- `ship.js` emits real `openspec-step.js` commands. It asks the archive question through `llm_decision` and records the script's result string.
- Execute, pr and plan call the script (or read pr's new prepare field) instead of `node -e` or Glob.
- The new exec dataset and the `ship-step`/`pr-prepare` exec cases pass.

## Research Findings

- **ship.js** (`F-ship-js-openspec-step-emission-1…10`):
  - Both openspec steps share one `case` with `commands: []` (:1646-1654).
  - ACTIONS sends the model to `reference.md` (:1731-1732).
  - `HALTING_INLINE_STEPS = ['archive_openspec', 'verify_pipeline']` (:1222).
  - Script paths are absolute, double-quoted constants (:1230-1237).
  - `llm_decision` objects are `{ type: 'choice'|'confirm', prompt, options[] }`, and the answer comes back as `output.answer`.
  - `runAfter` records `output.summary` through `completeStepCore` (:1912).
  - `pickNextStep` can return `{ error }`, and the caller turns it into `status: "error"` (:2060-2061).
  - The next step is started when it is emitted (:2068-2071), so an emitted `archive_openspec` is already `in_progress`.
  - `confirm_*` `cancel` returns `done` with `ext.reason: 'cancel'` and keeps the ledger (:2022-2023).
  - ship.js reads OpenSpec content from the active worktree (`contentRoot = resolveActiveWorktreeSafe()`, :2120-2123, issue-457 comment).
- **lib/openspec.js** (`F-openspec-lib-contracts-1…13`):
  - Exports `detectActiveChanges`, `isArchived`, `getTaskCounts`, `syncIncompleteTasks`, `validateChangeStrict`, `runArchive`, `markTaskDone` and more. `isValidChangeName` is not exported.
  - `markTaskDone(change, ref, opts, env)` takes the project root as `env.projectRoot` (4th argument), else `process.cwd()`. It returns `{ changed, reason: null|'already-done'|'not-found'|'io-error', line }`.
  - `validateChangeStrict`/`runArchive` spawn the `openspec` CLI in argv form. A missing CLI returns `cliAvailable: false`.
  - `detectActiveChanges` returns `{ present, specsCount, activeChanges: object[], branchMatch: string|null }`. Its `activeChanges` entries are objects with a `name` key (pre-flight R7 note).
- **lib/git.js `exec` takes a shell string**, not argv (`F-openspec-lib-contracts-11`). `lib/git.js` itself passes names to git in argv form through `child_process.spawnSync('git', [...])` (`fetchBaseRef`, `lib/git.js:196`).
- **`reference.md`** (`F-ship-skill-reference-openspec-prose-3…7`):
  - `## verify_openspec` starts at :82 and `## archive_openspec` at :117. The OpenSpec prose ends at :211, and :213 is `## verify_pipeline — conditional, opt-in`.
  - The six `node -e` heredocs are at :101, :133, :141, :164, :175 and :197. The two prompts are at :154-156 and :187-189.
- **The three result strings** exist only in `state-format.md:174-176` (W44-4). That file stays unchanged.
- **execute 5d-bis**: the header is at :651, the `node -e` block at :665-676, and the result bullets at :677-681 (`F-openspec-wiring-sites-skills-pr-2`). The behavioural case `execute-plan-sdlc.yaml:477` quotes the old `{ changed: false, … }` result.
- **pr-sdlc** (`F-openspec-wiring-sites-skills-pr-4…7`):
  - `SKILL.md:179` is the hook fast-path, :181-185 are Glob steps 1–3, :186 is step 4 (the `**OpenSpec:**` line) and :188 is the rationale paragraph.
  - `pr.js` has no openspec code. Its `result` object is built in `main()` (:532-567, last key `branchGuard`), where `activeRoot` (:170) is in scope.
- **plan-sdlc** (`F-openspec-wiring-sites-skills-pr-8`): `SKILL.md:24` is the fast-path, :26 is Glob step 1, :32 is the step 2c Glob and :46 is the step 4 Glob. The gate options :33-43 and the multi-change prompt :47-48 stay.
- **Tests** (`F-promptfoo-exec-openspec-fixtures-1…9`):
  - Exec datasets are listed in `promptfooconfig-exec.yaml` `tests:`.
  - Fixtures are copied to a temp dir and run `setup.sh`, the only git-init mechanism.
  - `script_stub_bin` resolves against `script_cwd` and prepends to `PATH`.
  - `script_args` are split on whitespace.
  - No existing case asserts `git log`, so a wrapper prints it.
  - `run-ship-stepper.js` has no openspec scenario.
  - `project-ship-openspec-ready` has all 3 tasks done. The `openspec` CLI is not installed in this environment (`which openspec` is empty).
- **Docs and tests that name the companions**: `docs/skills/ship-sdlc.md:866-869` (file table), `tests/promptfoo/datasets/ship-sdlc.yaml:1103-1110` (R-progressive-disclosure rubric "two companions") and `scripts/README.md:36` (ship-sdlc scripts row) (`F-scripts-readme-consistency-rules-2,3`).
- **Consistency checks** (`F-scripts-readme-consistency-rules-4,5`):
  - `check-consistency.js` maps one prepare script per skill, so a second `skill/*.js` is not checked by rules 2–5.
  - Rule 11 forbids `trap … EXIT` in any skill `.md` fence.
  - A lowercase companion file name is not checked by PD12.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Files beyond the item's list | no | also edits `ship.js`, `reference.md`, `SKILL.md:269`, `run-ship-stepper.js`, `ship-prepare-exec.yaml`, `docs/skills/ship-sdlc.md`, `ship-sdlc.yaml` rubric, `execute-plan-sdlc.yaml` case text | ruling W44-R1 (ship.js, reference.md, :269); the rest are mirrors of the moved text and tests whose wording becomes stale (`test-coverage-required`) |
| Archive commit form | no | `spawnSync('git', ['commit', '-m', \`chore(openspec): archive ${name}\`])` in argv form, not `lib/git.js exec` | `exec` only takes a shell string (`F-openspec-lib-contracts-11`); the item's own guardrail ("argv elements, never inside a shell string") wins; `lib/git.js:196` uses the same form |
| Script project root | no | `--project-root`, else `resolveActiveWorktreeSafe()` | OpenSpec content lives in the active worktree (ship.js :2120-2123); `resolveSdlcRoot()` returns the main worktree and would archive the wrong checkout in worktree mode |
| 5d-bis env assignments | no | separate assignment lines, then the `node` command | W44-6's one-line form `VAR='x' node … "$VAR"` expands `$VAR` before the prefix assignment applies, so every argument would be empty (checked: `Y=val echo "[$Y]"` prints `[]`) |
| 5d-bis non-zero exit or non-JSON output → `io-error` | no | adds the result bullet "A non-zero exit or output that is not this JSON (for example a usage error, exit 2) is handled like `io-error`." (Task 5) | defensive error handling the new script needs: `flip` exits 2 on a usage error, and the old `node -e` block had no such path; mapping it to `io-error` keeps 5d-bis non-blocking (R39/E14) |
| `flip --line ""` | no | an empty `--line` means "no line" | lets 5d-bis keep one command form instead of omitting the flag (W44-6 "omit `--line` when the block has none" has the same effect) |
| `archive --decision cancel` position | no | checked after `isArchived` and `getTaskCounts`, before any write | the item fixes the result (`cancelled`, exit 1), not the position; no write happens before it |
| `--auto` warning | no | the script prints it on stderr; `openspec-steps.md` tells the model to repeat it | `scripts-over-llm-logic`; the item places the rule in `openspec-steps.md`, which still states it |
| pr `changeName` rule | no | branch match, else the only active change, else null | the old `pr-sdlc/SKILL.md:182` rule; `detected` = OpenSpec present, as W44-R7 defines it for `detect` |
| pr.js requires `lib/openspec` directly | no | as the item says; the 3-line "branch, else single active" rule also lives in `openspec-step.js` | item Change 4 and W44-9; noted under Key Decisions |
| Spec lines left as follow-ups | no | ship R22, R-verify-openspec-3, I12, R27, R-projectroot-ship wording, R-archive-sync-3 'exit 1' wording (ship returns `done`/`cancel` per W44-R3); `docs/openspec-integration.md` (principles 3–4 and "How Detection Works" already describe Glob-only, CLI-free detection) | C7; the doc was already stale before this item (ship calls the CLI) and commit-sdlc still uses Glob |
| `R-projectroot-ship` (ship spec: ship scripts resolve the project root via `resolveSdlcRoot()`) | no | the script reads no `.sdlc/` state or config, so it has no project root in that sense; its OpenSpec content root is `--project-root`, else `resolveActiveWorktreeSafe()` — the same `contentRoot` ship.js already uses for OpenSpec (ship.js:2120-2123: "OpenSpec content scans live on the active branch in the active worktree — route detectActiveChanges/isArchived through contentRoot, NOT projectRoot"); `archiveDecision` uses the same root; execute's flip moves from bare `process.cwd()` to this root. The spec text naming only `resolveSdlcRoot()` is listed as a follow-up for the orchestrator to confirm | `resolveSdlcRoot()` returns the main worktree and would read and archive the wrong checkout in worktree mode (`workspace-mode-compatibility`); the code precedent wins (plan §0 rule 8) |
| `reference.md` skip line | no | the line "If the step has `status: \"skipped\"`, print the skip reason from `step.reason`." goes with the deleted sections and is not copied to `openspec-steps.md` | skipped steps are never emitted (`ship.js` records the skip itself, P-TRANS-1 footnote), so the line has no reader |
| pr step 4 condition | no | the `**OpenSpec:**` line is added only when `openspec.changeName` is non-null | the old step 4 ran only "if an active change is found"; W44-R8 keeps the line and swaps in `changeName` |
| Name regex and `<decision>` token | no | kept as ruled (`^[A-Za-z0-9._-]+$`, bare `<decision>`); a leading `-` in a change name reaching the CLI as an option is listed as a follow-up | W44-R6 and W44-R2 fix both; the name reaches the CLI in argv form, so no shell injection is possible |
| `isValidChangeName` export | no | not added | W44-R6: the shell-safety regex lives in `ship.js`; the lib already guards `getTaskCounts`/`markTaskDone`/`syncIncompleteTasks`, and `validate`/`archive` pass the name to the CLI in argv form |

## Key Decisions

**Problem in one sentence:** OpenSpec handling is copied as prose and inline shell code across four skills, which costs tokens and opens shell-quoting holes, so it moves into one tested script.

- **One script, four subcommands, JSON out.** Each subcommand wraps existing `lib/openspec.js` functions and adds no new logic beyond ordering and result strings. The alternative, a script per skill, would repeat the same wrapping. The shape copies `verify-pipeline.js`: a header comment, `writeJsonLine` and exit codes.

- **ship.js decides the archive prompt when it emits the step** (ruling W44-R2 (a)). The command is fixed before the user answers, so it carries a `<decision>` token that the model fills from a fixed mapping. The alternative, a keyed `commandsByAnswer` field, needs a SKILL.md loop change the item does not ask for.

- **Abort runs no command** (W44-R3 (b)). ship.js keeps the step `in_progress`, returns `done` with `ext.reason: "cancel"` and keeps the ledger. This matches the `confirm_*` cancel. Running `archive --decision cancel` instead would record the step `failed`, which breaks R-archive-sync-3.

- **ship.js records `resultText`** (W44-R4 (b)). This is deterministic, with no relay through the model.

- **Validation runs when the archive step is emitted, on purpose.** For an interactive change with every task done, `archiveDecision` spawns the `openspec` CLI once per emission (including after `--resume`), because the prompt says "passed validation" (ruling w3b-preplan R2: it writes nothing).

- **verify_openspec stays non-blocking through SKILL.md text** (W44-R5 (a)). ship.js keeps its recording rule unchanged.

- **The shell-safety regex `^[A-Za-z0-9._-]+$` sits in ship.js** (W44-R6 (b)). ship.js is the only place that builds a shell string with the name. The script itself receives argv.

- **`detect` adds `activeChanges: string[]`** (W44-R7 (a), names via `.map(c => c.name)`), so plan's multi-change prompt needs no Glob.

- **Workspace modes.** Every content path resolves from the active worktree, so branch mode and worktree mode both act on the checkout that holds the change. No state file is written by the script.

- **Flag names are free or mean the same thing** (`flag-semantic-consistency-cross-skill`). Grep at 10c0978 over `plugins/*/scripts/skill/*.js`:
  - `--change`, `--ref`, `--line`, `--title` and `--decision` are parsed by no other script. `ship.js` only emits `--change <name>` inside step `args` strings (:633, :688), with the same meaning.
  - `--project-root` is defined by `review.js:101`, `received-review.js:250`, `guardrails.js:45` and `pr-recover-gh-account.js`. In each it means "operate on this project root" (`path.resolve`d), and it means the same here. Only the fallback differs: here it is the active worktree, because OpenSpec content lives there (Deviations "Script project root").
  - `--auto` is defined by `commit.js`, `pr.js`, `received-review.js`, `ship.js` and `version.js` as "the run is unattended; ask nothing". Here it means the same: ship passes it only under its own `--auto`, and it selects the warn-and-proceed path (R-archive-sync-4). The script never prompts in either case.

- **Duplication accepted.** The "branch, else single active" rule appears in `openspec-step.js` and in `pr.js`. The item makes pr.js require the library directly, and the rule is 3 lines.

- **Non-goals:**
  - no change to `lib/openspec.js`, the session-start banner, R-archive-sync semantics, the commit message or `openspec-lib-exec.yaml`;
  - no move of execute's post-run archive suggestion (:942-990);
  - no edit to `state-format.md`;
  - no hand edit of `site/src/content-source/**` (copy-docs runs after this run and is committed separately).
  - W5.4 (moving 5d-bis into `openspec-tasks.md`) and W6c.4 (the same pr change) find this work already done and record that.

- **One commit.** The ship run (`--steps execute,commit`) makes exactly one commit with the subject `feat(#9006): ship-sdlc - openspec-step.js and openspec-steps.md (W4.4)`. Its body names the Plan readings (the Deviations rows) and the follow-ups. copy-docs is not a task here; the executor commits it separately after this run.

- **Failure audience.** Users running `/ship-sdlc` on an OpenSpec project. A wrong command or prompt would archive the wrong way or block the pipeline. Execute users would lose task flips silently, and pr/plan users would lose enrichment. The exec cases cover each path.

## Contract Examples

**code** (taken from Task 1):

```markdown
**Contract:**
- shape (code): `node openspec-step.js <detect|flip|validate|archive> [flags]` → one JSON line on stdout; exit codes per subcommand table.
- names: `openspec-step.js`, subcommands `detect`, `flip`, `validate`, `archive`.
- mirror: `scripts/skill/verify-pipeline.js:1-35` (header, requires, `writeJsonLine`).
- decisions: argv-only git calls; project root from `--project-root` or `resolveActiveWorktreeSafe()`.
- sync: `ship.js` emitted commands (Task 4), execute 5d-bis (Task 5), plan Step 0 (Task 7).
```

**docs** (taken from Task 3):

```markdown
**Contract:**
- shape (docs): CREATE `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` with sections `## verify_openspec`, `## archive_openspec` (`### Prompts`, `### Answer → --decision`, `### --auto`, `### Running and recording`); audience: the ship model at the matching step.
- names: the two prompt texts, verbatim from `reference.md:154-156` and `:187-189`.
- mirror: `reference.md` section style (`## <step_id> — <kind>`).
- decisions: no `node -e`; no direct `lib/openspec.js` call.
- sync: `ship.js` prompt strings (Task 4 asserts equality).
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The new script has 18 exec cases, including failure paths (validate failure, archive halt, missing CLI, unknown ref, usage error). ship.js has 10 `ship-step` cases and the pr.js field 2 `pr-prepare` cases. The stale execute-plan-sdlc case text and the ship-sdlc rubric are updated. |
| no-ci-bypass | error | PASS | No step skips or disables CI. The consistency and spec-shape validators are run and compared. |
| no-auto-eval | error | PASS | Only targeted exec-only filters (`promptfooconfig-exec.yaml`) are run. The behavioural rubric edit is not run, and there is no tight-loop retry. |
| skill-docs-required | error | PASS | No task creates a new SKILL.md. Docs and the scripts README row are updated for the changed ones. |
| no-scope-creep | warning | PASS | Extra files are mirrors of moved text and stale tests, listed in Deviations. The non-goals are explicit. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable: the script, its tests, the ship companion docs, ship.js wiring, execute, pr, plan. |
| scripts-over-llm-logic | error | PASS | OpenSpec logic moves out of `node -e` blocks, Glob steps and prose into one deterministic script and a prepare field. |
| yagni | warning | PASS | No `isValidChangeName` export. The only addition is `activeChanges`, which plan's multi-change prompt needs. |
| cross-skill-consistency | error | PASS | Ship, execute, pr and plan change together. The `state-format.md` result strings and the dataset text stay consistent. |
| pr-link-github-issue | error | PASS | Tracking is local todo #9006 with no GitHub issue, so no issue link applies. |
| dry | warning | PASS | The 3-line "branch, else single active" rule appears in `pr.js` and in the script. Key Decisions records why: the item requires `pr.js` to use the library directly. |
| kiss | warning | PASS | One script with four subcommands wraps the existing library. A per-skill script and a `commandsByAnswer` field were rejected. |
| spec-first | error | PASS | The spec-consequence plan ships as its own commit first. Tasks 1, 4, 5, 6 and 7 STOP if their spec line is missing. |
| project-agnostic | error | PASS | All behaviour lives in plugin scripts and skills. The repo files touched are the plugin's own tests and docs. |
| flag-coherence-cross-skill | error | PASS | ship.js gates on the resolved `flags.auto` and `flags.openspecChange`; pr-sdlc reads the resolved `PR_CONTEXT_JSON.openspec`. |
| no-opposite-logical-vectors | error | PASS | `archiveDecision` is the single gate for the archive prompt. The verify_openspec non-blocking rule is stated in SKILL.md and repeated, identically, in openspec-steps.md. |
| flag-resolution-single-source | warning | PASS | The archive decision is resolved once in `archiveDecision`. The model only fills `<decision>` from a fixed mapping. |
| state-premise | error | PASS | Key Decisions has a one-sentence problem statement. |
| smallest-viable-cut | warning | PASS | Extra files are justified in Deviations. The W5.4 and W6c.4 overlaps are recorded as done once. |
| failure-audience | warning | PASS | Key Decisions names ship, execute, pr and plan users on OpenSpec projects. |
| explicit-non-goals | warning | PASS | The non-goals list is explicit. |
| ambiguity-stops-and-asks | error | PASS | Each viable alternative is recorded with its ruling (W44-R1–R7) in Deviations and Key Decisions. |
| state-machine-idempotency | error | PASS | `flip` twice (case 6), `archive` twice (case 7), and abort keeps the step `in_progress` for `--resume` (ship-step case 6). |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameter is added or overridden. Commands come from ship.js output. |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence is in Key Decisions and in a Task 1 acceptance check. `--ref`, `--line`, `--title` and `--decision` are used nowhere else; no other script parses `--change` (ship.js only emits it in step args, with the same meaning). `--project-root` and `--auto` keep their meaning across scripts; only the root fallback differs, for the documented reason. |
| workspace-mode-compatibility | error | PASS | Content paths resolve from the active worktree in both branch and worktree mode. The script writes no state file. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. The change name appears only in `llm_decision` and commands, in the dynamic tail. |

## Suggested Review Dimensions

Advisory (G17). Not applied by this plan; the owner decides.

### UPDATE: runtime-contract (U2, B1)

**Why**: The plan creates `plugins/sdlc-utilities/scripts/skill/openspec-step.js` and changes the `ship.js` and `pr.js` result contracts (the new `openspec` result field, the `verify_openspec`/`archive_openspec` emission). The trigger `**/scripts/*.js` does not match files in the `scripts/skill/` subdirectory.

**Severity hint**: high

**Patch**: Add `**/scripts/**/*.js` (or `**/scripts/skill/*.js`) to the triggers so scripts under `scripts/skill/` are reviewed.

**Action (dimension)**: edit `.sdlc/review-dimensions/runtime-contract.md` frontmatter triggers: add `"**/scripts/**/*.js"` (or run `/review-sdlc --dimensions` to update)

**Action (Copilot mirror, X1)**: regenerate `.github/instructions/runtime-contract.instructions.md` per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: hook-readiness (U2)

**Why**: The plan's new `openspec-step.js` and its edits to `ship.js` and `pr.js` live under `scripts/skill/`, which the trigger `**/scripts/*.js` does not match.

**Severity hint**: medium

**Patch**: Widen the `**/scripts/*.js` trigger to `**/scripts/**/*.js`.

**Action (dimension)**: edit `.sdlc/review-dimensions/hook-readiness.md` frontmatter triggers: replace `"**/scripts/*.js"` with `"**/scripts/**/*.js"`

### UPDATE: skill-architecture (U2, U4)

**Why**: The plan creates `skills/ship-sdlc/openspec-steps.md` and edits the lowercase companion `reference.md`. The triggers only name `SKILL.md`, `REFERENCE.md` and `EXAMPLES.md`, so these progressive-disclosure companion files are not reviewed for architecture.

**Severity hint**: medium

**Patch**: Add `**/skills/**/*.md` (companion files) to the triggers.

**Action (dimension)**: edit `.sdlc/review-dimensions/skill-architecture.md` frontmatter triggers: add `"**/skills/**/*.md"`

## Tasks

### Task 1: openspec-step.js script

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/skill/openspec-step.js`
- Modify: `plugins/sdlc-utilities/scripts/README.md` — append `` `skill/openspec-step.js` `` to the ship-sdlc row.

**Notes:** First, the spec check below must print `1` six times. If any count differs, the spec-consequence commit has not landed: STOP and report. Use only functions `lib/openspec.js` already exports. If one you need is missing, STOP and report; do not re-implement it (item guardrail). Brief: `F-openspec-lib-contracts-1…13`, `F-scripts-readme-consistency-rules-2,6`.

```bash
for x in 'docs/specs/ship-sdlc.md|exactly five files' 'docs/specs/ship-sdlc.md|`scripts/skill/openspec-step.js` (wraps `lib/openspec.js`)' 'docs/specs/ship-sdlc.md|| `archive_openspec` with answer `abort` | `done` |' 'docs/specs/execute-plan-sdlc.md|openspec-step.js flip' 'docs/specs/pr-sdlc.md|proposalPath' 'docs/specs/plan-sdlc.md|openspec-step.js detect'; do f=${x%%|*}; s=${x#*|}; tr -d '\r' < "$f" | command grep -cF -- "$s"; done
```

**Anchors (each must print `1`):** `command grep -cF -- '| ship-sdlc | `util/ship-init.js`, `skill/ship.js`, `state/ship.js` |' plugins/sdlc-utilities/scripts/README.md`; `test -e plugins/sdlc-utilities/scripts/skill/openspec-step.js || echo 1` prints `1` (the file does not exist yet).

**Must not touch:** `plugins/sdlc-utilities/scripts/lib/openspec.js`, `lib/git.js`, `lib/output.js`, `lib/worktree.js`; every other row of `scripts/README.md`.

**Contract:**
- shape (code): CommonJS, `'use strict'`, zero dependencies. It requires `../lib/openspec` (`detectActiveChanges, isArchived, getTaskCounts, syncIncompleteTasks, validateChangeStrict, runArchive, markTaskDone`), `../lib/output` (`writeJsonLine`), `../lib/worktree` (`resolveActiveWorktreeSafe`) and `node:child_process` (`spawnSync`), plus `node:fs`/`node:path`. Stdout is exactly one JSON line. Progress or warnings go to stderr. Usage errors (exit 2) are detected before the project root is resolved. The project root is `--project-root <p>` (any subcommand), else `resolveActiveWorktreeSafe()`.

  | Subcommand | Flags | Wraps | Exit |
  |---|---|---|---|
  | `detect` | `[--change <n>] [--project-root <p>]` | `detectActiveChanges`, `isArchived`, `getTaskCounts` | 0 always |
  | `flip` | `--change <n> --ref <r> [--line <n>] [--title <t>]` | `markTaskDone(change, ref, { line, title }, { projectRoot })` | 0 always (R39/E14) |
  | `validate` | `--change <n>` | `validateChangeStrict` | 0 when `ok` or `!cliAvailable`; 1 when `ok === false && cliAvailable` |
  | `archive` | `--change <n> --decision sync\|anyway\|cancel [--auto]` | `isArchived`, `getTaskCounts`, `syncIncompleteTasks`, `validateChangeStrict`, `runArchive`, git | 0 archived; 1 halted or cancelled |
  | (usage error) | missing/unknown subcommand, missing `--change` (flip/validate/archive), missing `--ref` (flip), missing/unknown `--decision` (archive) | — | 2, stdout `{"error":"<message>"}` |

  `detect` output. Keys appear in this order. `activeChanges` is last and additive (W44-R7):

  ```json
  {"detected":true,"changeName":"add-auth","isArchived":false,"tasksDone":3,"tasksTotal":3,"matchedBy":"single-active","proposalPath":"/abs/openspec/changes/add-auth/proposal.md","designPath":null,"specPaths":["/abs/openspec/changes/add-auth/specs/auth-spec.md"],"activeChanges":["add-auth"]}
  ```

  - `detected` = `detectActiveChanges(root).present`.
  - `changeName`/`matchedBy`: `--change` given → that name, `"flag"`; else `branchMatch` non-null → it, `"branch"`; else exactly one active change → its name, `"single-active"`; else `null`, `null`.
  - `isArchived` = `changeName ? isArchived(root, changeName) : false`.
  - `tasksDone`/`tasksTotal` come from `getTaskCounts(root, changeName)` (`0`/`0` when `changeName` is null or the read reports an error).
  - `proposalPath`/`designPath` are the absolute paths of `openspec/changes/<changeName>/proposal.md` and `design.md` when the file exists, else `null`.
  - `specPaths` lists the absolute paths of every `.md` file under `openspec/changes/<changeName>/specs/`, recursively and sorted (`[]` when there are none).
  - `activeChanges` = `detectActiveChanges(root).activeChanges.map(c => c.name)`.
  - With `detected: false`, the output is `{"detected":false,"changeName":null,"isArchived":false,"tasksDone":0,"tasksTotal":0,"matchedBy":null,"proposalPath":null,"designPath":null,"specPaths":[],"activeChanges":[]}`, unless `--change` was given, in which case `changeName`/`matchedBy` follow the flag.

  `flip` output: `{"flipped":true,"ref":"alpha-custom","reason":"ok"}`. `flipped` = `r.changed`, and `reason` = `r.reason === null ? "ok" : r.reason` (`ok|already-done|not-found|io-error`). `--line` is converted with `Number()`; an empty or absent value passes `undefined`.

  `validate` output: `{"ok":true,"cliAvailable":true,"stderr":""}` (`stderr: r.stderr || ""`).

  `archive` runs in this order, and each row shows where it stops:

  | Step | Condition | `status` | `resultText` | Exit |
  |---|---|---|---|---|
  | 1 `isArchived` | true | `archived` (plus `"reason":"already archived"`; no other I/O; `taskCounts` `{done:0,total:0,synced:0,failed:[]}`, `validation: null`, `commitMade: false`) | `archived <n>` | 0 |
  | 2 `getTaskCounts` | `error` non-null | `halted` | `null` | 1 |
  | 3 decision | `cancel` | `cancelled` | `null` | 1 |
  | 4 `--auto` and incomplete | — | stderr `archive-openspec: <total-done> task(s) incomplete — proceeding without sync (--auto)` | — | — |
  | 5 sync | `--decision sync` | `syncIncompleteTasks` → `taskCounts.synced`, `taskCounts.failed` = the failed refs (non-fatal) | — | — |
  | 6 `validateChangeStrict` | `!ok` — this includes `cliAvailable:false`, so a missing CLI halts here (unlike the `validate` subcommand, which treats a missing CLI as non-failing) | `halted` (`validation` filled) | `null` | 1 |
  | 7 `runArchive` | `!ok` (a missing CLI already halted at step 6; the item's "`runArchive` `cliAvailable:false` → halted" is kept as a guard) | `halted` | `null` | 1 |
  | 8 git | `spawnSync('git', ['add', 'openspec/'])`, then `spawnSync('git', ['commit', '-m', 'chore(openspec): archive ' + name])`, cwd = root; non-zero → `halted`, `commitMade:false`, git stderr to stderr | `halted` | `null` | 1 |
  | 9 done | `sync` → `synced-and-archived` with `archived <n> (synced N tasks)`, N = `synced`; else `archived` with `archived <n>` when all tasks were done, else `archived <n>, N task(s) left incomplete`, N = total − done | | | 0 |

  `archive` output shape (`validation` is `null` when step 6 did not run; `taskCounts.done`/`total` are built from `getTaskCounts`'s `tasksDone`/`tasksTotal`):

  ```json
  {"status":"archived","taskCounts":{"done":1,"total":3,"synced":0,"failed":[]},"validation":{"ok":true,"cliAvailable":true,"stderr":""},"commitMade":true,"resultText":"archived add-auth, 2 task(s) left incomplete"}
  ```

  The three `resultText` forms are byte-for-byte those of `state-format.md:174-176`, with `<name>` and `N` filled in.
- names: `openspec-step.js`; subcommands `detect`, `flip`, `validate`, `archive`; output keys as above.
- mirror: `plugins/sdlc-utilities/scripts/skill/verify-pipeline.js:1-35` (shebang, header doc comment listing usage and stdout shapes, `LIB` constant, `writeJsonLine`).
- decisions:
  - git runs through `spawnSync` argv, because `lib/git.js exec` takes only a shell string.
  - The root is `--project-root`, else the active worktree, where OpenSpec content lives.
  - An empty `--line` means no line.
  - `cancel` is checked before any write.
  - The `--auto` warning goes to stderr.
  - No new `lib/openspec.js` export. (Deviations table rows of the same names.)
- sync: commands emitted by `ship.js` (Task 4), the 5d-bis call (Task 5), the plan Step 0 call (Task 7); `state-format.md:174-176` strings.

  `scripts/README.md`:

  ```diff
  -| ship-sdlc | `util/ship-init.js`, `skill/ship.js`, `state/ship.js` |
  +| ship-sdlc | `util/ship-init.js`, `skill/ship.js`, `state/ship.js`, `skill/openspec-step.js` |
  ```

**Acceptance criteria:**
- [ ] The spec check prints `1` six times.
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/openspec-step.js` exits 0; `node plugins/sdlc-utilities/scripts/skill/openspec-step.js` (no subcommand) exits 2 and prints a JSON line with `error`.
- [ ] Smoke check, outside the repository: `d=$(mktemp -d) && cp -r tests/promptfoo/fixtures-fs/project-openspec-active/. "$d"/ && node plugins/sdlc-utilities/scripts/skill/openspec-step.js detect --project-root "$d"` prints `"detected":true`, `"changeName":"add-auth"`, `"matchedBy":"single-active"` and `"activeChanges":["add-auth"]`, and exits 0. The exec cases in Task 2 are the real test.
- [ ] `command grep -c 'exec(' plugins/sdlc-utilities/scripts/skill/openspec-step.js` prints `0` (git runs through `spawnSync` argv only).
- [ ] `command grep -c 'openspec-step.js' plugins/sdlc-utilities/scripts/README.md` prints `1`.
- [ ] Flag check (`flag-semantic-consistency-cross-skill`): `for f in --change --ref --line --title --decision; do command grep -lE -- "['\"]$f['\"]" plugins/*/scripts/skill/*.js; done` lists only `openspec-step.js`, and the `--project-root`/`--auto` definitions elsewhere are still the ones named in Key Decisions (same meaning).

### Task 2: openspec-step exec tests

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/datasets/openspec-step-exec.yaml`
- Create: `tests/promptfoo/scripts/run-openspec-step.js`
- Create: `tests/promptfoo/fixtures-fs/project-openspec-step-archive/setup.sh`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register the dataset.

**Anchors (each must print `1`):** `command grep -cF -- '  - file://datasets/openspec-enrich-exec.yaml' tests/promptfoo/promptfooconfig-exec.yaml`; the three created paths do not exist yet (`ls` fails for each).

**Must not touch:** every existing dataset, fixture and wrapper (including `openspec-lib-exec.yaml`, `project-ship-openspec-ready/`, `openspec-marktaskdone/`); every other line of `promptfooconfig-exec.yaml`.

**Notes:** A wrapper is needed for two things: two calls in one case (flip twice, archive twice) and reading `git log` after the archive (`F-promptfoo-exec-openspec-fixtures-5`). The `openspec` stub must live inside the fixture copy, because `script_stub_bin` resolves against `script_cwd` (W44-10). Every case description starts with `openspec-step: ` (rule 5). No timing-dependent assertion.

**Contract:**
- shape (code):
  - **Fixture `project-openspec-step-archive/setup.sh`.** `#!/bin/bash`, `set -e`; `git init -q -b main`; `git config user.email "test@test.com"`, `user.name "Test"`, `commit.gpgsign false`. It then writes the OpenSpec tree with the text of `fixtures-fs/project-ship-openspec-ready` byte-for-byte: `openspec/config.yaml`, `openspec/specs/core.md`, `openspec/changes/add-auth/{proposal.md,tasks.md,specs/auth-spec.md}` (3/3 tasks done). It writes the stub `bin/openspec` (mode 755), then runs `git add openspec && git commit -q -m init` (`bin/` stays untracked):

    ```sh
    #!/bin/sh
    case "$1" in
      validate) exit 0 ;;
      archive) mkdir -p openspec/changes/archive && mv "openspec/changes/$2" "openspec/changes/archive/2026-01-01-$2" ;;
      *) exit 1 ;;
    esac
    ```

  - **Wrapper `run-openspec-step.js`.** It locates the repo root the way `run-ship-stepper.js:57-70` does. It spawns `node <repo>/plugins/sdlc-utilities/scripts/skill/openspec-step.js <subcommand> … --project-root <projectRoot>` with `cwd = projectRoot` and the inherited env (so `script_stub_bin` applies). The explicit `--project-root` keeps a non-git fixture from resolving to an enclosing repository. The wrapper always exits 0. Each script exit code and stderr go into `calls[]`, so the provider never appends stderr to the JSON line.

    | Op | Option | Type | Default | Effect |
    |---|---|---|---|---|
    | add | `--project-root <p>` | path | required | fixture copy; cwd and `--project-root` of every script call |
    | add | `--scenario flip-twice` | enum | required (one of the five) | `flip --change <n> --ref <r>` twice |
    | add | `--scenario flip-empty-line` | enum | — | one call, argv array `['flip','--change','feat-x','--ref','alpha-custom','--line','','--title','Alpha task']` |
    | add | `--scenario archive` | enum | — | `archive --change <n> --decision <d>`; a second identical call with `--twice` |
    | add | `--scenario validate` | enum | — | `validate --change <n>` |
    | add | `--scenario detect-two` | enum | — | copy `openspec/changes/add-auth` to `openspec/changes/second`, then `detect` |
    | add | `--change <n>` | string | `add-auth` | change name for flip/archive/validate |
    | add | `--ref <r>` | string | `alpha-custom` | task ref for `flip-twice` |
    | add | `--decision <d>` | string | `anyway` | `--decision` for `archive` |
    | add | `--uncheck <k>` | integer | `0` | before the first call, turn the last `k` `- [x]` lines of `openspec/changes/<n>/tasks.md` into `- [ ]` |
    | add | `--twice` | boolean | off | repeat the `archive` call |
    | add | `--stub-validate fail` | string | unset | before the first call, rewrite `bin/openspec` so `validate` exits 1 with `stub validation failed` on stderr (`archive` unchanged) |
    | add | `--no-cli` | boolean | off | run the script as `process.execPath <script> …` with `PATH` = a new empty temp dir (no `openspec`, no git) |

    It prints one line:

    ```json
    {"scenario":"archive","calls":[{"args":["archive","--change","add-auth","--decision","anyway"],"exitCode":0,"json":{…},"stderr":"…"}],"lastSubject":"chore(openspec): archive add-auth","commitCount":2,"archived":["2026-01-01-add-auth"]}
    ```

    `lastSubject` = `git log -1 --format=%s`; `commitCount` = `git rev-list --count HEAD`; `archived` = entries of `openspec/changes/archive/` (`[]` when absent).
  - **Cases** in `openspec-step-exec.yaml`. Each assertion is a `javascript` check with `JSON.parse(output)` that returns `true` or ``` `FAIL: …` ``` (case 12 uses `icontains`, because the provider appends stderr on a non-zero exit). "script" means a direct call with this `vars` block, shown for case 1; wrapper cases use `script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"` and `script_args: "--project-root {{project_root}} <options>"`:

    Wrapper cases carry the same `script_cwd: "{{project_root}}"` and `project_root: "file://fixtures-fs/<fixture>"` keys as case 1, plus `script_stub_bin: "bin"` where the table says so.

    ```yaml
    - description: "openspec-step: detect on an active change reports it (single-active)"
      vars:
        script_path: "repo://plugins/sdlc-utilities/scripts/skill/openspec-step.js"
        script_args: "detect --project-root {{project_root}}"
        script_cwd: "{{project_root}}"
        project_root: "file://fixtures-fs/project-openspec-active"
      assert:
        - type: javascript
          value: |
            const o = JSON.parse(output);
            if (o.detected !== true || o.changeName !== 'add-auth' || o.matchedBy !== 'single-active') return `FAIL: ${output}`;
            …
            return true;
    ```


    | # | description (prefix `openspec-step: `) | fixture | call | asserts |
    |---|---|---|---|---|
    | 1 | `detect on an active change reports it (single-active)` | `project-openspec-active` | script, `detect --project-root {{project_root}}` | `detected === true`, `changeName === 'add-auth'`, `matchedBy === 'single-active'`, `activeChanges` = `['add-auth']`, `proposalPath` ends `openspec/changes/add-auth/proposal.md`, `designPath === null`, `specPaths.length === 1` |
    | 2 | `detect output keys are the item's keys plus activeChanges (W44-R7)` | same | same | `Object.keys(o)` equals `['detected','changeName','isArchived','tasksDone','tasksTotal','matchedBy','proposalPath','designPath','specPaths','activeChanges']` |
    | 3 | `detect --change on an archived change reports isArchived` | `project-openspec-archived-change` | script, `detect --change add-auth --project-root {{project_root}}` | `isArchived === true`, `matchedBy === 'flag'` |
    | 4 | `detect matches the change through the branch diff` | `project-openspec-detect-diff` | script, `detect --project-root {{project_root}}` | `changeName === 'my-change'`, `matchedBy === 'branch'` |
    | 5 | `detect without OpenSpec reports detected false` | `project-pr-no-config` | script, `detect --project-root {{project_root}}` | `detected === false`, `changeName === null`, `activeChanges.length === 0` |
    | 6 | `flip flips a task, then reports already-done` | `openspec-marktaskdone/with-ref` | wrapper `--scenario flip-twice --change feat-x --ref alpha-custom` | `calls[0].json` = `{flipped:true, ref:'alpha-custom', reason:'ok'}`; `calls[1].json.flipped === false`, `reason === 'already-done'`; both exit 0 |
    | 7 | `archive --decision anyway archives and commits` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario archive --change add-auth --decision anyway --uncheck 2 --twice` | `calls[0]`: exit 0, `status === 'archived'`, `commitMade === true`, `resultText === 'archived add-auth, 2 task(s) left incomplete'`; `lastSubject === 'chore(openspec): archive add-auth'`; `archived` = `['2026-01-01-add-auth']`; `calls[1]`: `status === 'archived'`, `reason === 'already archived'`, `commitMade === false`, `resultText === 'archived add-auth'`; `commitCount === 2` |
    | 8 | `archive --decision sync syncs then archives` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario archive --change add-auth --decision sync --uncheck 2` | `status === 'synced-and-archived'`, `taskCounts.synced === 2`, `resultText === 'archived add-auth (synced 2 tasks)'`, `commitMade === true` |
    | 9 | `archive --decision cancel exits 1 without archiving` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario archive --change add-auth --decision cancel` | exit 1, `status === 'cancelled'`, `commitMade === false`, `commitCount === 1`, `archived.length === 0` |
    | 10 | `archive with all tasks done records the plain result` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario archive --change add-auth --decision anyway` | `status === 'archived'`, `resultText === 'archived add-auth'`, `validation.ok === true` |
    | 11 | `validate reports ok through the CLI` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | script, `validate --change add-auth --project-root {{project_root}}` | `ok === true`, `cliAvailable === true` |
    | 12 | `usage error prints an error line` | `project-openspec-active` | script, `script_args: "bogus"` (no `--project-root`: the script exits 2 before resolving a root) | `icontains '"error"'` |
    | 13 | `validate exits 1 when the CLI reports failure` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario validate --change add-auth --stub-validate fail` | `calls[0].exitCode === 1`, `json.ok === false`, `json.cliAvailable === true` |
    | 14 | `archive halts when validation fails` | `project-openspec-step-archive`, `script_stub_bin: "bin"` | wrapper `--scenario archive --change add-auth --decision anyway --stub-validate fail` | exit 1, `status === 'halted'`, `validation.ok === false`, `commitMade === false`, `archived.length === 0`, `commitCount === 1` |
    | 15 | `archive halts without the openspec CLI` | `project-openspec-step-archive` | wrapper `--scenario archive --change add-auth --decision anyway --no-cli` | exit 1, `status === 'halted'`, `validation.cliAvailable === false`, `commitMade === false` |
    | 16 | `flip with an empty --line and a title flips the task` | `openspec-marktaskdone/with-ref` | wrapper `--scenario flip-empty-line` | `calls[0].json` = `{flipped:true, ref:'alpha-custom', reason:'ok'}`, exit 0 |
    | 17 | `flip on an unknown ref reports not-found and exits 0` | `openspec-marktaskdone/with-ref` | wrapper `--scenario flip-twice --change feat-x --ref nope` | `calls[0].json.flipped === false`, `reason === 'not-found'`, exit 0 |
    | 18 | `detect with two active changes leaves changeName null` | `project-openspec-active` | wrapper `--scenario detect-two` | `changeName === null`, `matchedBy === null`, `activeChanges` sorted = `['add-auth','second']` |

  - **`promptfooconfig-exec.yaml`**: add `  - file://datasets/openspec-step-exec.yaml` directly after the `openspec-enrich-exec.yaml` line (:43).
- names: dataset `openspec-step-exec.yaml`; wrapper `run-openspec-step.js`; fixture `project-openspec-step-archive`.
- mirror: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml:10-19` (`script_stub_bin`), `tests/promptfoo/scripts/run-ship-stepper.js:1-47` (wrapper header, one JSON line), `tests/promptfoo/datasets/openspec-lib-exec.yaml:8-17` (fixture refs).
- decisions: a new fixture rather than editing `project-ship-openspec-ready` (its five `ship-prepare-exec` cases stay untouched); cases 1–5 and 11 call the script directly.
- sync: subcommand outputs of Task 1.

**Acceptance criteria:**
- [ ] `command grep -c 'openspec-step-exec.yaml' tests/promptfoo/promptfooconfig-exec.yaml` prints `1`.
- [ ] `command grep -c '^- description: "openspec-step: ' tests/promptfoo/datasets/openspec-step-exec.yaml` prints `18`.
- [ ] The targeted run with pattern `openspec-step` (header command) reports 18 passed, 0 failed. Run it in the background if it may exceed 5 minutes.

### Task 3: openspec-steps.md, reference.md and SKILL.md pointers

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Create: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md`
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — delete `## verify_openspec` and `## archive_openspec` (W44-1).
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the Step 5 inline-steps bullet (W44-R5) and the judgment-sections line (W44-2).
- Modify: `docs/skills/ship-sdlc.md` — one row in the Skill File Structure table.
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — the R-progressive-disclosure no-flag rubric names the third on-demand companion.

**Notes:** Spec check first: `command grep -c 'exactly five files' docs/specs/ship-sdlc.md` must print `1` (R-progressive-disclosure lists `openspec-steps.md`); otherwise STOP. Locate every quoted line by content, exactly once. If any is missing or occurs twice, STOP and report. Copy the two prompt texts from `reference.md` before deleting the sections (W44-5). The rubric edit changes only the companion list; this plan does not run that behavioural case. Brief: `F-ship-skill-reference-openspec-prose-1…7`, `F-scripts-readme-consistency-rules-3`.

**Anchors (each must print `1`):**

```bash
c() { printf '%s  %s\n' "$(tr -d '\r' < "$1" | command grep -cF -- "$2")" "$2"; }
R=plugins/sdlc-utilities/skills/ship-sdlc/reference.md; K=plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md
c $R '## verify_openspec — inline, opt-in'
c $R '## archive_openspec — conditional'
c $R '## verify_pipeline — conditional, opt-in'
c $R 'has `<tasksTotal - tasksDone>` incomplete task(s) (`<tasksDone>`/`<tasksTotal>` done).'
c $R 'passed validation with all `<tasksTotal>` task(s) already complete. Archive now?'
c $K 'For `verify_openspec` and `archive_openspec` (empty `commands`) the reference.md section is the procedure'
c $K '`verify_openspec`, `archive_openspec`, `verify_pipeline`, `await_remote_review`, `learnings_commit`: read the matching section of `./reference.md` (archive_openspec prompts: texts in W4.4).'
c docs/skills/ship-sdlc.md '| `state-format.md` | Resume from a saved state file | Ship state-file schema. |'
c tests/promptfoo/datasets/ship-sdlc.yaml 'two companions entry-modes.md or reference.md. Those are on-demand'
```

**Must not touch:** `reference.md` before `## verify_openspec` (:1-81, including the `--auto` hook paragraphs :78/:80) and from `## verify_pipeline` on (:213-end); every other SKILL.md line, including the post-version ancestry HARD GATE and the `:351-352` verify report line; `state-format.md`; `config-format.md`; `entry-modes.md`.

**Contract:**
- shape (docs):
  - **`openspec-steps.md`** (new). Audience: the ship model while one of the two steps is current. It contains no `node -e`, no `lib/openspec.js` call and no `trap`. Content:

    ````markdown
    # ship-sdlc — OpenSpec steps

    Read this file only when `verify_openspec` or `archive_openspec` is the current step (R-progressive-disclosure). `ship.js` emits both with `step.data.change` and `step.data.commands`; run the commands with Bash as Step 5 item 5 says.

    ## verify_openspec — inline, opt-in

    Implements R-verify-openspec-1..5. Run `step.data.commands[0]` (`openspec-step.js validate --change "<name>"`); it prints `{ ok, cliAvailable, stderr }`. Report `success: true` whatever the command exits, with its JSON in `output` (non-blocking, R-verify-openspec-4):
    - `cliAvailable: false` → log `openspec CLI not available, skipping validate`.
    - `ok: true` → log `openspec validate --strict: passed`.
    - `ok: false` and `cliAvailable: true` → log `stderr` as a warning.

    ## archive_openspec — conditional

    Implements R22–R27 and R-archive-sync-1..6. `ship.js` read `isArchived` and the task counts fresh when it emitted the step (R-archive-sync-2) and, for an interactive change with every task done, ran the validation. It sets `llm_decision` only on the two interactive paths below.

    ### Prompts

    Incomplete tasks, interactive (R-archive-sync-3) — the consent gate for this path; no second prompt follows:

    > OpenSpec change "`<name>`" has `<tasksTotal - tasksDone>` incomplete task(s) (`<tasksDone>`/`<tasksTotal>` done).
    >
    > Options: **sync-and-archive** (Recommended) | **archive-anyway** | **abort**

    All tasks done and validation passed, interactive (R25):

    > OpenSpec change "`<name>`" passed validation with all `<tasksTotal>` task(s) already complete. Archive now?
    >
    > Options: **archive** (Recommended) | **abort**

    `ship.js` puts the first line of each, with the values filled in and the backticks removed, in `llm_decision.prompt`.

    ### Answer → `--decision`

    | Answer | Action |
    |---|---|
    | `sync-and-archive` | replace `<decision>` in the command with `sync` |
    | `archive-anyway` | replace `<decision>` with `anyway` |
    | `archive` | replace `<decision>` with `anyway` |
    | `abort` | run no command; report `success: true` with `output.answer: "abort"`; `ship.js` leaves the step `in_progress` for `--resume` (R-archive-sync-3) |

    ### `--auto`

    No prompt (R71, R-archive-sync-4): `ship.js` writes `--decision anyway --auto` itself. With incomplete tasks the script prints `archive-openspec: N task(s) incomplete — proceeding without sync (--auto)` on stderr; repeat that line to the user.

    ### Running and recording

    Run the command. It validates, archives and commits `chore(openspec): archive <name>` itself, and prints `{ status, taskCounts, validation, commitMade, resultText }`. Put the JSON in `output`; `ship.js` records `resultText` via complete-step (`state-format.md`).
    - Exit 0 → `success: true`. If `taskCounts.failed` is non-empty, warn with the refs (non-fatal).
    - Exit 1 (`status: "halted"`) → `success: false`, with `output.summary` one line naming the status and the first line of `validation.stderr` (or of the command's stderr). `ship.js` halts the pipeline and keeps the state for `--resume`.
    ````

    The two `>` prompt lines must be byte-identical to `reference.md:154` and `:187` without their leading indentation.
  - **`reference.md`**: delete from the line `## verify_openspec — inline, opt-in` up to (not including) `## verify_pipeline — conditional, opt-in`. The blank line before `## verify_pipeline` stays, so there is exactly one blank line between the preceding paragraph and that heading.
  - **`SKILL.md`** — the Step 5 bullet (W44-R5; the archive abort clause goes, per W44-R3):

    ```diff
    -   - `stage_changes`, … `cleanup`: run each command in `step.data.commands` with Bash, in order; `success` = every command exited 0; capture the command's JSON stdout into `output`. For `verify_openspec` and `archive_openspec` (empty `commands`) the reference.md section is the procedure: run it and report its outcome as `success`/`output`. Report `success: false` when the procedure halts the pipeline (`archive_openspec` validation failure or abort, `verify_pipeline` abort): `ship.js` then returns `status: "error"`; `learnings_commit`, `verify_openspec` and `await_remote_review` never halt.
    +   - `stage_changes`, … `cleanup`: run each command in `step.data.commands` with Bash, in order; `success` = every command exited 0; capture the command's JSON stdout into `output`. For `verify_openspec` and `archive_openspec` follow `./openspec-steps.md`. `verify_openspec` reports `success: true` whatever `validate` exits (non-blocking, R-verify-openspec-1..5). Report `success: false` when the procedure halts the pipeline (`archive_openspec` validation failure, `verify_pipeline` abort): `ship.js` then returns `status: "error"`; `learnings_commit`, `verify_openspec` and `await_remote_review` never halt.
    ```

    (`…` = the unchanged step-id list.) The judgment-sections line (W44-2):

    ```diff
    -… merge → run `git merge origin/<default>`, on conflict abort and pause); `verify_openspec`, `archive_openspec`, `verify_pipeline`, `await_remote_review`, `learnings_commit`: read the matching section of `./reference.md` (archive_openspec prompts: texts in W4.4).
    +… merge → run `git merge origin/<default>`, on conflict abort and pause); `verify_pipeline`, `await_remote_review`, `learnings_commit`: read the matching section of `./reference.md`. When `verify_openspec`/`archive_openspec` is the current step → Read `./openspec-steps.md` and follow it. Do not read preemptively.
    ```

  - **`docs/skills/ship-sdlc.md`**: add a row directly after the `state-format.md` row:

    ```diff
     | `state-format.md` | Resume from a saved state file | Ship state-file schema. |
    +| `openspec-steps.md` | `verify_openspec` or `archive_openspec` is the current step | The two OpenSpec step procedures: the `openspec-step.js` commands, the archive prompts and the answer-to-decision mapping. |
    ```

  - **`ship-sdlc.yaml`** rubric (no-flag walkthrough case):

    ```diff
    -        two companions entry-modes.md or reference.md. Those are on-demand
    -        companions gated on --gc/--init-config/dry-run or a failure/edge case —
    +        companions entry-modes.md, reference.md or openspec-steps.md. Those are on-demand
    +        companions gated on --gc/--init-config/dry-run, a failure/edge case or an OpenSpec step —
    ```

- names: `openspec-steps.md`; headings `## verify_openspec — inline, opt-in`, `## archive_openspec — conditional`.
- mirror: `reference.md:82`/`:117` heading style; `SKILL.md:47` gated-pointer wording ("… → Read `./entry-modes.md` … Do not read preemptively.").
- decisions: W44-1, W44-2, W44-5, W44-R3, W44-R5.
- sync: prompt strings in `ship.js` (Task 4); the result strings in `state-format.md:174-176`; spec R-progressive-disclosure (five files).

**Acceptance criteria:**
- [ ] Every anchor printed `1` before editing.
- [ ] `command grep -cE 'isArchived|getTaskCounts|syncIncompleteTasks|runArchive|validateChangeStrict' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md plugins/sdlc-utilities/skills/ship-sdlc/reference.md` prints `0` for each file (W44-3).
- [ ] `command grep -c 'node -e' plugins/sdlc-utilities/skills/ship-sdlc/reference.md plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` prints `0` for each file.
- [ ] `command grep -cF '> OpenSpec change "`<name>`" has `<tasksTotal - tasksDone>` incomplete task(s) (`<tasksDone>`/`<tasksTotal>` done).' plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` prints `1`, and the same for `> OpenSpec change "`<name>`" passed validation with all `<tasksTotal>` task(s) already complete. Archive now?`.
- [ ] `command grep -c 'openspec' plugins/sdlc-utilities/skills/ship-sdlc/reference.md` prints `0`; `command grep -c 'texts in W4.4' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`; `command grep -c 'openspec-steps.md' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `2`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout (the consistency diff runs once after the last task; see the header).

### Task 4: ship.js wiring for the OpenSpec steps

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1, Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — require line, two constants, the `verify_openspec`/`archive_openspec` emission, ACTIONS, `runAfter` abort and result recording.
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — an `openspec` scenario and a `stepResults` output field.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — ten `ship-step: openspec …` cases.

**Notes:** Line numbers date from 10c0978. Locate each quoted line by content, exactly once; a missing or repeated quote is a STOP, a shifted line number alone is only a note (M4 reading 6). This task changes no other ship.js behaviour: `state/ship.js`, the ledger schema, `HALTING_INLINE_STEPS`, `DECISION_STEPS`, `STEP_ORDER` and `computeSteps` stay as they are (W44-R1). The spec lines implemented are ship P-TRANS-1's three openspec rows, added by the spec-consequence commit (plan `2026-10-20-m4-w3b-openspec-specs.md`); if `command grep -cF '| `archive_openspec` with answer `abort` | `done` |' docs/specs/ship-sdlc.md` is not `1`, STOP. Brief: `F-ship-js-openspec-step-emission-1…10`, `F-promptfoo-exec-openspec-fixtures-7`.

**Must not touch:** `state/ship.js`; `schemas/ship-state.schema.json`; `HALTING_INLINE_STEPS`, `DECISION_STEPS`, `STEP_ORDER`, `computeSteps` and every other `case` of `pickNextStep`; every existing scenario of `run-ship-stepper.js` and every existing case of `ship-prepare-exec.yaml`.

**Anchors (each must print `1`):** in `ship.js`: `const { detectActiveChanges, isArchived } = require(path.join(LIB, 'openspec'));`; `const AWAIT_REVIEW_SCRIPT    = path.join(__dirname, 'await-remote-review.js');`; `      case 'verify_openspec':`; `      verify_openspec: 'Run the verify-openspec judgment section of reference.md for data.change and report its outcome.',`; `    const res = shipState.completeStepCore(ledger, name, success ? output.summary : failureText, success ? 'success' : 'failure', usage);`; `  if (after === 'rebase_conflict' && answer === 'pause') {`.

**Contract:**
- shape (code):

  ```diff
  -const { detectActiveChanges, isArchived } = require(path.join(LIB, 'openspec'));
  +const { detectActiveChanges, isArchived, getTaskCounts, validateChangeStrict } = require(path.join(LIB, 'openspec'));
   …
   const AWAIT_REVIEW_SCRIPT    = path.join(__dirname, 'await-remote-review.js');
  +const OPENSPEC_STEP_SCRIPT   = path.join(__dirname, 'openspec-step.js');
  +// W44-R6: the change name is quoted inside an emitted shell command, so only these characters pass.
  +const OPENSPEC_CHANGE_RE     = /^[A-Za-z0-9._-]+$/;
  ```

  Emission inside `pickNextStep` (replaces the shared `case` that sets `commands: []`):

  ```js
        case 'verify_openspec':
        case 'archive_openspec': {
          const change = flags.openspecChange || (flags.openspecContext && flags.openspecContext.branchMatch) || null;
          if (!change || !OPENSPEC_CHANGE_RE.test(change)) {
            return { error: `${id}: openspec change name not shell-safe: ${JSON.stringify(change)}` };
          }
          data = { change, args: cs.args, commands: [] };
          if (id === 'verify_openspec') {
            data.commands = [`node "${OPENSPEC_STEP_SCRIPT}" validate --change "${change}"`];
            break;
          }
          const a = archiveDecision(change, flags.auto);
          data.commands = [`node "${OPENSPEC_STEP_SCRIPT}" archive --change "${change}" --decision ${a.decision}${flags.auto ? ' --auto' : ''}`];
          llmDecision = a.llmDecision;
          break;
        }
  ```

  New module-level helper `archiveDecision(change, auto) → { decision, llmDecision }` (W44-R2 (a)); `root = resolveActiveWorktreeSafe()`; the counts come from `const { tasksDone: done, tasksTotal: total, error } = getTaskCounts(root, change)` (the library's key names are `tasksDone`/`tasksTotal`, not `done`/`total`). Evaluated top to bottom:

  | Condition | `decision` | `llmDecision` |
  |---|---|---|
  | `auto` | `'anyway'` | `null` |
  | `isArchived(root, change)` | `'anyway'` | `null` |
  | `getTaskCounts(root, change).error` non-null | `'anyway'` | `null` (the script halts on its own read) |
  | `tasksDone < tasksTotal` | `'<decision>'` | `{ type: 'choice', prompt: \`OpenSpec change "${change}" has ${total - done} incomplete task(s) (${done}/${total} done).\`, options: ['sync-and-archive', 'archive-anyway', 'abort'] }` |
  | `!validateChangeStrict(root, change).ok` | `'anyway'` | `null` (the script halts on its own validation) |
  | otherwise | `'<decision>'` | `{ type: 'choice', prompt: \`OpenSpec change "${change}" passed validation with all ${total} task(s) already complete. Archive now?\`, options: ['archive', 'abort'] }` |

  ACTIONS:

  ```diff
  -      verify_openspec: 'Run the verify-openspec judgment section of reference.md for data.change and report its outcome.',
  -      archive_openspec: 'Run the archive-openspec judgment section of reference.md for data.change and report its outcome.',
  +      verify_openspec: 'Run data.commands and report success:true with its JSON verdict (non-blocking; see openspec-steps.md).',
  +      archive_openspec: 'Resolve llm_decision when set, then run data.commands per openspec-steps.md (no command on abort) and report the result.',
  ```

  `runAfter` (W44-R3, W44-R4):

  ```diff
     // 4. Record the finished step.
     const name = STEP_ID_TO_LEDGER_NAME[after];
  +  // W44-R3: abort leaves archive-openspec in_progress so --resume re-emits it (R-archive-sync-3).
  +  const archiveAbort = after === 'archive_openspec' && answer === 'abort';
   …
  -  if (name && !pq) {
  +  if (name && !pq && !archiveAbort) {
   …
  -    const res = shipState.completeStepCore(ledger, name, success ? output.summary : failureText, success ? 'success' : 'failure', usage);
  +    // W44-R4: archive_openspec records the script's resultText.
  +    const okText = after === 'archive_openspec' && typeof output.resultText === 'string' ? output.resultText : output.summary;
  +    const res = shipState.completeStepCore(ledger, name, success ? okText : failureText, success ? 'success' : 'failure', usage);
   …
  +  if (archiveAbort) {
  +    return finish(createEnvelope('done', null, { ext: { ...ext, reason: 'cancel' }, stateFile: ledgerPath, progress: progress() }));
  +  }
     if (after === 'rebase_conflict' && answer === 'pause') {
  ```

  | From | Event | To |
  |---|---|---|
  | `verify_version_tag` (or `verify_openspec`) | next step `archive_openspec`, interactive, tasks incomplete | step `archive_openspec`, `llm_decision` 3 options, command with `<decision>` |
  | `archive_openspec` | answer `abort`, `success:true` | `done`, `ext.reason:"cancel"`, `archive-openspec` `in_progress`, ledger kept |
  | `archive_openspec` | `success:true`, `output.resultText` string | step `completed`, result = `resultText`, next step |
  | `archive_openspec` | `success:false` | `status:"error"` (unchanged, `HALTING_INLINE_STEPS`) |
  | any → openspec step | change name fails `OPENSPEC_CHANGE_RE` | `status:"error"`, "openspec change name not shell-safe" |

  - **`run-ship-stepper.js`** — new scenario `openspec`. Add the options to the header comment (:13-41) and the arg parser:

    | Op | Option | Type | Default | Effect |
    |---|---|---|---|---|
    | add | `--os-change <n>` | string | `add-auth` | change name written to `flags.openspecChange` |
    | add | `--os-tasks <done>/<total>` | string | `1/3` | `tasks.md` gets `<done>` lines `- [x] Task i`, the rest `- [ ] Task i` |
    | add | `--os-validate ok\|fail` | string | `ok` | stub `openspec validate` exits 0 or 1 |
    | add | `--os-archived` | boolean | off | write the change under `openspec/changes/archive/2026-01-01-<n>/` instead of `openspec/changes/<n>/` |
    | add | `--os-verify` | boolean | off | also make `verify-openspec` runnable |
    | add | `--os-answer abort\|result` | string | none | second call `--after archive_openspec` with the matching result file |
    | add | `--os-resume` | boolean | off | after the abort call: `after('confirm_pipeline', 'results/yes.json')` (the `--resume` path, as the `resume-twice` scenario does), then, while the envelope is a step other than `archive_openspec` and at most 8 times, answer it as `walk()` does (decisions `results/yes.json`, others `results/generic-ok.json`); stop at the first `archive_openspec` envelope without answering it |

    Seed patch (with `--seed frozen`), before → after:

    ```diff
       "flags": {
    -    "openspecChange": null, "steps": [ … ],
    +    "openspecChange": "<n>", "steps": [ …, "archive-openspec" (, "verify-openspec" with --os-verify) ],
       …
       "steps": [
    -    { "name": "execute", "status": "pending" }, … commit, review, version: "pending",
    +    { "name": "execute", "status": "completed" }, … commit, review, version: "completed",   (as the confirm-pr seed patch, :195-199)
    -    { "name": "received-review", "status": "pending" }, { "name": "commit-fixes", "status": "pending" },
    +    { "name": "received-review", "status": "skipped", "reason": "fixture" }, { "name": "commit-fixes", "status": "skipped", "reason": "fixture" },
    -    { "name": "archive-openspec", "status": "skipped", "reason": "not in steps[]" },
    +    { "name": "archive-openspec", "status": "pending" },   (verify-openspec likewise with --os-verify)
    ```

    Call order:

    1. Unless `<n>` fails `^[A-Za-z0-9._-]+$`, the wrapper writes `openspec/config.yaml` and the change files (`proposal.md`, `tasks.md`) under `<projectRoot>`. It also writes `<projectRoot>/results/os-abort.json` = `{"success":true,"output":{"answer":"abort","summary":"aborted"}}` and `<projectRoot>/results/os-result.json` = `{"success":true,"output":{"status":"synced-and-archived","resultText":"archived add-auth (synced 2 tasks)","summary":"ignored"}}`. The files sit under `results/` because `after()` joins its path to `projectRoot`.
    2. It writes `stubDir/openspec` (mode 755): `validate` exits 0 (`ok`) or 1 (`fail`). `stubDir` is already first on the `PATH` of every `ship.js` call the wrapper makes (`env`, run-ship-stepper.js:103), so `archiveDecision`'s validation spawn finds the stub.
    3. wrapper → `after('verify_version_tag', 'results/generic-ok.json')` → `ship.js` emits `verify_openspec` (with `--os-verify`) or `archive_openspec`.
    4. With `--os-answer abort`: wrapper → `after('archive_openspec', 'results/os-abort.json')`. With `--os-answer result`: wrapper → `after('archive_openspec', 'results/os-result.json')`.

    Output fields (additive):

    ```diff
       ledger = { stepStatuses, history, stepReasons, currentStep, flagsKeys, flags, paused,
    +            stepResults }   // name → step.result, for ledger steps that have a result
       { scenario, calls, ledger, …, commandScripts, stopCapExists,
    +  mdPrompts: { incomplete, allDone } }   // the two "> OpenSpec change" lines of <repo>/plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md, without the leading "> "
    ```
  - **`ship-prepare-exec.yaml`**: ten cases with `script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"`, `project_root: "file://fixtures-fs/project-ship-stepper"`, `script_args: "--project-root {{project_root}} --scenario openspec --seed frozen <options>"`. `fill(md, v)` replaces `` `<name>` ``, `` `<tasksTotal - tasksDone>` ``, `` `<tasksDone>` `` and `` `<tasksTotal>` `` with the values, without backticks.

    | # | description (prefix `ship-step: openspec `) | options | asserts on the last call |
    |---|---|---|---|
    | 1 | `archive interactive incomplete emits the sync prompt of the OpenSpec steps file (W44-R2)` | `--os-tasks 1/3` | `step.id === 'archive_openspec'`; `llm_decision.options` = `['sync-and-archive','archive-anyway','abort']`; `llm_decision.prompt === fill(mdPrompts.incomplete, …)`; `commands[0]` matches `/^node "[^"]+\/openspec-step\.js" archive --change "add-auth" --decision <decision>$/`; `commandScripts` values all `true` |
    | 2 | `archive interactive all-done emits the archive prompt of the OpenSpec steps file (W44-R2)` | `--os-tasks 3/3 --os-validate ok` | options `['archive','abort']`; prompt `=== fill(mdPrompts.allDone, …)` |
    | 3 | `archive all-done with failed validation emits no prompt` | `--os-tasks 3/3 --os-validate fail` | `llm_decision === null`; command ends `--decision anyway` |
    | 4 | `archive under --auto emits no prompt and --decision anyway --auto (R-archive-sync-4)` | `--os-tasks 1/3 --auto-seed` | `llm_decision === null`; command ends `--decision anyway --auto` |
    | 5 | `archive on an already-archived change emits no prompt` | `--os-archived` | `llm_decision === null`; command ends `--decision anyway` |
    | 6 | `abort leaves archive-openspec in_progress and resume re-emits it (W44-R3)` | `--os-tasks 1/3 --os-answer abort --os-resume` | `calls[1]`: `status === 'done'`, `ext.reason === 'cancel'`, exit 0; the last call's `envelope.step.id === 'archive_openspec'` and no call after `calls[1]` has `args` starting `--after archive_openspec`; `ledgerExists === true`; final `ledger.stepStatuses['archive-openspec'] === 'in_progress'` |
    | 7 | `archive records resultText as the step result (W44-R4)` | `--os-tasks 1/3 --os-answer result` | `ledger.stepStatuses['archive-openspec'] === 'completed'`, `ledger.stepResults['archive-openspec'] === 'archived add-auth (synced 2 tasks)'` |
    | 8 | `verify_openspec emits the quoted validate command (W44-R6)` | `--os-verify --os-tasks 1/3` | `step.id === 'verify_openspec'`; `commands[0]` matches `/^node "[^"]+\/openspec-step\.js" validate --change "add-auth"$/`; `llm_decision === null` |
    | 9 | `invalid change name returns status error (W44-R6)` | `--os-change ../x` | `status === 'error'`, `error` contains `not shell-safe`, exit 1 |
    | 10 | `change name with shell metacharacters returns status error (W44-R6)` | `--os-change a;b` | same as 9 |

- names: `OPENSPEC_STEP_SCRIPT`, `OPENSPEC_CHANGE_RE`, `archiveDecision`, `archiveAbort`, `okText`; scenario `openspec`; output fields `stepResults`, `mdPrompts`.
- mirror: `ship.js:1230-1237` (script constants), `ship.js:1655-1657` (`verify_pipeline` command form), `ship.js:1700-1701` (`confirm_*` `llm_decision`), `ship.js:2022-2023` (`cancel` → `done`); `run-ship-stepper.js` `confirm-pr` scenario (:195-199, :380-383).
- decisions: Key Decisions. Rulings, in one line each:
  - W44-R1: ship.js, reference.md and SKILL.md:269 are in scope.
  - W44-R2: ship.js computes the prompt at emission and the command carries `<decision>`.
  - W44-R3: abort runs no command; the step stays `in_progress` and the run ends `done`/`cancel`.
  - W44-R4: ship.js records `output.resultText`.
  - W44-R5: verify_openspec never halts, through SKILL.md text.
  - W44-R6: names must match `^[A-Za-z0-9._-]+$`, else `status:"error"`.
- sync: `openspec-steps.md` prompt lines (Task 3, asserted by cases 1–2); the `openspec-step.js` CLI (Task 1); spec P-TRANS-1 rows (plan 2).

**Acceptance criteria:**
- [ ] Every anchor printed `1` before editing; `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0.
- [ ] `command grep -c 'OPENSPEC_STEP_SCRIPT' plugins/sdlc-utilities/scripts/skill/ship.js` prints `3` (the constant and the two commands); `command grep -c "commands: \[\]," plugins/sdlc-utilities/scripts/skill/ship.js` prints `0` (it is `1` at 10c0978, the openspec `case`).
- [ ] `command grep -c 'judgment section of reference.md' plugins/sdlc-utilities/scripts/skill/ship.js` prints `0`.
- [ ] The targeted run with pattern `ship-step` reports 0 failed (the ten new cases pass, and every existing `ship-step:` case, including the `confirm-pr` and `inline-fail-archive-openspec` ones, still passes). Run it in the background.

### Task 5: execute-plan-sdlc 5d-bis through openspec-step.js flip

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — the 5d-bis call block and result bullets.
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — the non-blocking case's prompt names the new result shape.

**Notes:** W44-6: W5.4 has not landed (`openspec-tasks.md` absent), so the edit goes into SKILL.md. Keep `markTaskDone` named in the prose, because the behavioural cases at `execute-plan-sdlc.yaml:434-470` assert the word. The spec line implemented is execute I13; if `command grep -c 'openspec-step.js flip' docs/specs/execute-plan-sdlc.md` is not `1`, STOP. Brief: `F-openspec-wiring-sites-skills-pr-2`.

**Anchors (each must print `1`):** in the SKILL.md: `call `markTaskDone(change, ref, { line, title })` via inline Node.js:`; `OPENSPEC_CHANGE='<change>' \` (the 5d-bis block; the other `OPENSPEC_LIB=` line at the post-run suggestion stays); `     - `{ changed: true }` — no action.`; `     - `{ changed: false, reason: 'already-done' }` — no action;`; `     - `{ changed: false, reason: 'not-found' }` or `{ changed: false, reason: 'io-error' }` — append`; `Wave abort on `markTaskDone` failure is FORBIDDEN.`. In the dataset: `markTaskDone returns { changed: false, reason: 'not-found', line: null }. What happens?`.

**Must not touch:** 5d-bis steps 1–2 (the `completedOpenspecTaskIds` and subset rules), the `flippedRefs` bullet, the learnings line format, "Wave abort on `markTaskDone` failure is FORBIDDEN.", `:64`, the post-run archive suggestion (:942-990), and every other dataset case.

**Contract:**
- shape (code):

  ````diff
  -   - Otherwise, look up the `openspec-task` block for any one sibling (all siblings share `change`/`ref`/`line`/`title`) and call `markTaskDone(change, ref, { line, title })` via inline Node.js:
  +   - Otherwise, look up the `openspec-task` block for any one sibling (all siblings share `change`/`ref`/`line`/`title`) and call `markTaskDone(change, ref, { line, title })` through `openspec-step.js flip` (leave `<line>` empty when the block has none; inside each single-quoted value write every `'` as `'\''`):

        ```bash
        # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
  -     # Pass arguments as env vars to avoid shell injection from LLM-generated task titles
  -     # (titles may contain ", `, $(...), or newlines that would break inline interpolation).
  +     # Assign each value to a shell variable on its own line, single-quoted, then pass the variables
  +     # as double-quoted arguments: this avoids shell injection from LLM-generated task titles
  +     # (titles may contain ", `, $(...), or newlines that would break inline interpolation).
  -     OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \
  -     OPENSPEC_CHANGE='<change>' \
  -     OPENSPEC_REF='<ref>' \
  -     OPENSPEC_LINE='<line>' \
  -     OPENSPEC_TITLE='<title>' \
  -     node -e "
  -     const { markTaskDone } = require(process.env.OPENSPEC_LIB);
  -     const line = process.env.OPENSPEC_LINE ? Number(process.env.OPENSPEC_LINE) : undefined;
  -     const r = markTaskDone(process.env.OPENSPEC_CHANGE, process.env.OPENSPEC_REF, { line, title: process.env.OPENSPEC_TITLE });
  -     console.log(JSON.stringify(r));
  -     "
  +     OPENSPEC_CHANGE='<change>'
  +     OPENSPEC_REF='<ref>'
  +     OPENSPEC_LINE='<line>'
  +     OPENSPEC_TITLE='<title>'
  +     node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" flip --change "$OPENSPEC_CHANGE" --ref "$OPENSPEC_REF" --line "$OPENSPEC_LINE" --title "$OPENSPEC_TITLE"
        ```
     - Add `ref` to `flippedRefs` regardless of the outcome (…unchanged…).
  -  - Interpret the result:
  -    - `{ changed: true }` — no action.
  -    - `{ changed: false, reason: 'already-done' }` — no action; …
  -    - `{ changed: false, reason: 'not-found' }` or `{ changed: false, reason: 'io-error' }` — append …
  +  - Interpret the JSON result `{ flipped, ref, reason }`:
  +    - `{ flipped: true, reason: 'ok' }` — no action.
  +    - `{ flipped: false, reason: 'already-done' }` — no action; …(unchanged text)…
  +    - `{ flipped: false, reason: 'not-found' }` or `{ flipped: false, reason: 'io-error' }` — append …(unchanged text)…
  +    - A non-zero exit or output that is not this JSON (for example a usage error, exit 2) is handled like `io-error`.
  ````

  Keep the leading spaces of the fenced block exactly as in the source.

  Dataset:

  ```diff
  -      markTaskDone returns { changed: false, reason: 'not-found', line: null }. What happens?
  +      The openspec-step.js flip call (markTaskDone) returns { flipped: false, ref: 'create-resourceindicator-component-ab12cd', reason: 'not-found' }. What happens?
  ```

- names: `openspec-step.js flip`; result keys `flipped`, `ref`, `reason`.
- mirror: the existing env-var comment lines of the same block (kept verbatim).
- decisions: Deviations rows "5d-bis env assignments" and "`flip --line ""`".
- sync: Task 1 `flip` output; spec execute I13 (plan 2).

**Acceptance criteria:**
- [ ] `command grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `5` (it is `6` at 10c0978); `command grep -c 'openspec-step.js" flip' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `1`.
- [ ] `sed -n '/5d-bis — OpenSpec task flip/,/Wave abort on/p' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md | command grep -c 'changed: '` prints `0`, and the same range piped to `command grep -c 'markTaskDone'` prints at least `1`.
- [ ] Manual check: with `d=$(mktemp -d); cp -r tests/promptfoo/fixtures-fs/openspec-marktaskdone/with-ref/. "$d"/; cd "$d"`, running the new block's lines with `<change>`=`feat-x`, `<ref>`=`alpha-custom`, `<line>` empty and `<title>`=`Alpha task` (with `<PLUGIN_ROOT>` = the repo's `plugins/sdlc-utilities`) prints `{"flipped":true,"ref":"alpha-custom","reason":"ok"}`.

### Task 6: pr.js openspec field and pr-sdlc enrichment

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/pr.js` — require `detectActiveChanges`; add the `openspec` result field.
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — the OpenSpec enrichment block.
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — two cases.

**Notes:** W6c.4 lists the same change; whichever lands later records it as already done (ruling w3b-preplan). The spec line implemented is pr R13; if `command grep -c 'proposalPath' docs/specs/pr-sdlc.md` is not `1`, STOP. The new case's description starts with `pr-prepare: ` (rule 5). The filter `pr-prepare` matches 23 of the file's 35 cases after this task (21 at 10c0978 plus the two new ones; pre-flight §4); that is expected (W44-10). Brief: `F-openspec-wiring-sites-skills-pr-4…7`.

**Anchors (each must print `1`):** in `pr.js`: `const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));`; the line `    branchGuard,` (exact, `command grep -c '^    branchGuard,$'`). In the SKILL.md: `**Hook context fast-path:** If the session-start system-reminder contains an `OpenSpec active:` line`; `1. Glob for `openspec/config.yaml`. If absent, skip this block entirely.`; `4. Add to the PR description, below the title: `**OpenSpec:** openspec/changes/<name>/``; `When OpenSpec context provides business rationale, use it directly instead of asking the user.`.

Dataset anchor: `command grep -cF -- '- description: "pr-prepare: default flags with no args"' tests/promptfoo/datasets/pr-prepare-exec.yaml` prints `1`.

**Must not touch:** the `**OpenSpec enrichment (automatic when detected):**` heading line, the "When OpenSpec context provides business rationale…" paragraph, the Gotcha at :611, the post-PR suggestions :626-628, and every other `result` key and its order.

**Contract:**
- shape (code):

  ```diff
   const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
  +const { detectActiveChanges } = require(path.join(LIB, 'openspec'));
   …
  +  // R13: OpenSpec context for enrichment; never blocks PR creation.
  +  const openspec = prOpenspec(activeRoot);
     const result = {
       …
       branchGuard,
  +    openspec,
     };
  ```

  New function `prOpenspec(root)` → `{ detected, changeName, proposalPath, designPath }`:
  - `det = detectActiveChanges(root)`; `detected = det.present`.
  - `changeName = det.branchMatch || (det.activeChanges.length === 1 ? det.activeChanges[0].name : null)`.
  - Each path is the absolute path of `openspec/changes/<changeName>/proposal.md` or `design.md` when `changeName` is non-null and the file exists, else `null`.
  - Any throw gives `{ detected: false, changeName: null, proposalPath: null, designPath: null }`.

  ```diff
     "branchGuard": { … },
  +  "openspec": { "detected": false, "changeName": null, "proposalPath": null, "designPath": null }
  ```

  SKILL.md (W44-R8 keeps step 4 and the rationale paragraph):

  ```diff
   **OpenSpec enrichment (automatic when detected):**

  -**Hook context fast-path:** If the session-start system-reminder contains an `OpenSpec active:` line, … treat it as a hint, not as authoritative.
  -
  -1. Glob for `openspec/config.yaml`. If absent, skip this block entirely.
  -2. Identify the active change: Glob `openspec/changes/*/proposal.md` (exclude `archive/`). … If ambiguous, skip — do not ask during PR creation.
  -3. If an active change is found, Read in parallel:
  -   - `proposal.md` — use intent and scope to pre-fill **Business Context** and **Business Benefits** (reduces need for AskUserQuestion clarification)
  -   - `design.md` (if exists) — use architectural approach for **Technical Design** section
  -4. Add to the PR description, below the title: `**OpenSpec:** openspec/changes/<name>/`
  +If `PR_CONTEXT_JSON.openspec.detected`, Read `proposalPath` and `designPath` (when non-null) in parallel and use them to pre-fill Business Context/Benefits and Technical Design.
  +When `PR_CONTEXT_JSON.openspec.changeName` is non-null, add to the PR description, below the title: `**OpenSpec:** openspec/changes/<PR_CONTEXT_JSON.openspec.changeName>/`

   When OpenSpec context provides business rationale, use it directly instead of asking the user. …
  ```

  Dataset case:

  ```yaml
  - description: "pr-prepare: openspec field reports no OpenSpec in a plain project (W4.4)"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/pr.js"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-pr-no-config"
    assert:
      - type: icontains
        value: '"openspec": {'
      - type: javascript
        value: |
          const m = /"openspec": \{[^}]*\}/.exec(output);
          if (!m) return 'FAIL: no openspec block';
          return /"detected": false/.test(m[0]) && /"changeName": null/.test(m[0]) ? true : `FAIL: ${m[0]}`;
  ```

  Second case, the positive path, on `file://fixtures-fs/project-openspec-detect-diff` (git, branch `feat/issue-42-rework`, change `my-change` with `proposal.md` and no `design.md`):

  ```yaml
  - description: "pr-prepare: openspec field names the branch-matched change and its proposal (W4.4)"
    vars: { same keys as above, project_root: "file://fixtures-fs/project-openspec-detect-diff" }
    assert:
      - type: javascript
        value: |
          const m = /"openspec": \{[^}]*\}/.exec(output);
          if (!m) return 'FAIL: no openspec block';
          const ok = /"changeName": "my-change"/.test(m[0])
            && /"proposalPath": "[^"]*openspec\/changes\/my-change\/proposal\.md"/.test(m[0])
            && /"designPath": null/.test(m[0]);
          return ok ? true : `FAIL: ${m[0]}`;
  ```

  If `pr.js` exits non-zero on that fixture for a reason unrelated to OpenSpec, STOP and report; do not change the fixture.

  (Copy the `vars` of the existing case "pr-prepare: default flags with no args" at `pr-prepare-exec.yaml:22-31`. If that case carries more vars than shown, copy them all.)
- names: `prOpenspec`, result key `openspec`.
- mirror: `pr.js:528-529` (`customTemplate` computed before `result`), `pr-prepare-exec.yaml:22-31`.
- decisions: Deviations rows "pr `changeName` rule" and "pr.js requires `lib/openspec` directly".
- sync: spec pr R13 (plan 2); the pr-sdlc Gotcha :611 (OpenSpec never blocks) stays true.

**Acceptance criteria:**
- [ ] `command grep -c 'Glob' plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` prints `3` (it is `6` at 10c0978; the fast-path paragraph and steps 1–2 held the other three); `command grep -c 'PR_CONTEXT_JSON.openspec' plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` prints `2`.
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/pr.js` exits 0.
- [ ] The targeted run with pattern `pr-prepare` reports 0 failed, including the new case.

### Task 7: plan-sdlc detection through openspec-step.js detect

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 0 OpenSpec block: the fast-path paragraph, step 1, step 2c and step 4.

**Notes:** The `detect` output this task consumes is covered by exec cases 1–5 and 18 of Task 2; no `plan-sdlc.yaml` case quotes the removed Glob wording. Detection only (W44-7): the gate options (:33-43), the step 2c AskUserQuestion text and the multi-change prompt (:47-48) stay byte-identical. W7 owns any further plan-side rewrite. The spec line implemented is plan I4; if `command grep -c 'openspec-step.js detect' docs/specs/plan-sdlc.md` is not `1`, STOP. Brief: `F-openspec-wiring-sites-skills-pr-8,9`.

**Anchors (each must print `1`):** `**Hook context fast-path:** If the session-start system-reminder contains an `OpenSpec active:` line, use its data (change name, branch match status, delta spec count) to skip the initial `Glob for openspec/config.yaml``; `1. Glob for `openspec/config.yaml`. If absent, skip this entire block — no OpenSpec in this project.`; `Check whether an active OpenSpec change already covers this work — Glob `openspec/changes/*/proposal.md` (exclude `archive/`), and if any exist, try matching against the current git branch name. If a match is found,`; `4. Otherwise, Glob `openspec/changes/*/proposal.md` (exclude `archive/`). If exactly one non-archived change exists, use it. If multiple, try matching change directory names against the current git branch name. If still ambiguous, use AskUserQuestion:`.

**Must not touch:** :33-43, :47-48, steps 3, 5 and 6, everything after step 6.

**Contract:**
- shape (code):

  ```diff
  -**Hook context fast-path:** If the session-start system-reminder contains an `OpenSpec active:` line, … treat it as a hint, not as authoritative.
  -
  -1. Glob for `openspec/config.yaml`. If absent, skip this entire block — no OpenSpec in this project.
  +1. Run `node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" detect` (substitute `<PLUGIN_ROOT>` from the `sdlc plugin root:` context line) and keep its JSON as `openspecDetect`. If `openspecDetect.detected` is false, skip this entire block — no OpenSpec in this project.
   …
  -   c. **Functional changes:** Check whether an active OpenSpec change already covers this work — Glob `openspec/changes/*/proposal.md` (exclude `archive/`), and if any exist, try matching against the current git branch name. If a match is found, treat it as if …
  +   c. **Functional changes:** Check whether an active OpenSpec change already covers this work — a match is `openspecDetect.matchedBy === "branch"` (the change is `openspecDetect.changeName`). If a match is found, treat it as if …
   …
  -4. Otherwise, Glob `openspec/changes/*/proposal.md` (exclude `archive/`). If exactly one non-archived change exists, use it. If multiple, try matching change directory names against the current git branch name. If still ambiguous, use AskUserQuestion:
  +4. Otherwise, use `openspecDetect.changeName` when it is non-null (`matchedBy` `branch` or `single-active`). If it is null and `openspecDetect.activeChanges` has more than one entry, use AskUserQuestion:
      > Multiple active OpenSpec changes found. Which one are you working on?
      List the change names as options.
  ```

  (`…` = unchanged text on the same line or the unchanged lines between.) The list in the prompt is `openspecDetect.activeChanges`.
- names: `openspecDetect`; fields `detected`, `changeName`, `matchedBy`, `activeChanges`.
- mirror: the `<PLUGIN_ROOT>` substitution sentence used at `plan-sdlc/SKILL.md` Step 0 ("Substitute `<PLUGIN_ROOT>` with the absolute path from the `sdlc plugin root:` line…").
- decisions: W44-R7 (a); only branch matches count in step 2c, as before.
- sync: Task 1 `detect` output; spec plan I4 (plan 2).

**Acceptance criteria:**
- [ ] `command grep -c 'Glob `openspec/' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` prints `0`; `command grep -c 'openspec-step.js" detect' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` prints `1`.
- [ ] The gate options and the multi-change prompt are unchanged: `git diff -U0 plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md | command grep -cE '^[-+].*(Start OpenSpec flow|Generate OpenSpec artifacts as plan appendix|Use existing spec|Multiple active OpenSpec changes found)'` prints `0`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints nothing on stdout (the consistency diff runs once after the last task; see the header).

## Final Shape

- **One script.** `scripts/skill/openspec-step.js` owns every OpenSpec action of the pipeline: detection, the task flip, validation and the archive with its commit. Each action prints one JSON line.
- **ship.** It emits real commands for both OpenSpec steps and asks the archive question through `llm_decision`. Abort leaves the step resumable, and the script's result string is what the ledger records. The model reads the procedure from the small `openspec-steps.md` only when one of these steps is current; `reference.md` no longer carries OpenSpec text.
- **execute.** It flips OpenSpec checkboxes through the script, with the same non-blocking rules.
- **pr.** It gets OpenSpec paths from its prepare output and makes no Glob calls.
- **plan.** It reads detection from the script, keeping the same gate and prompts.
- **What is gone.** The seven `node -e` blocks and the four Glob sites. The new exec dataset and the ship-step cases pin the behaviour.

## Verification Scorecard

Built from the requirements checklist (`/workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-3b-plan-source.md`, item W4.4 and its readings).
*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 3 |
| Correctness | 0 | 1 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 3 |

Counts are the final (round 3) lens findings. The Correctness warning (the `getTaskCounts` key names) is fixed in Task 4 and Task 1. Earlier rounds' findings are resolved: round 1 had 0/7/12, round 2 had 1 CRITICAL (Task 4 case 6 resume), fixed and re-simulated in round 3.

| Requirement | Task(s) | Status |
|---|---|---|
| 1. `openspec-step.js` `detect`/`flip`/`validate`/`archive` (Change 1, W44-R7) | Task 1, Task 2 | covered |
| 2. `openspec-steps.md`; `reference.md` sections removed; SKILL.md :269/:274 (Change 2, W44-1/2/3/5, W44-R5) | Task 3 | covered |
| 3. ship.js wiring (W44-R1…R6, W44-11) | Task 4 | covered |
| 4. execute 5d-bis → `flip` (Change 3, W44-6) | Task 5 | covered |
| 5. pr.js `openspec` field and pr-sdlc enrichment (Change 4, W44-R8) | Task 6 | covered |
| 6. plan-sdlc detection → `detect` (Change 5, W44-7) | Task 7 | covered |
| 7. Exec tests: `openspec-step-exec.yaml`, `pr-prepare`, `ship-step` cases (Verification, R6, R7) | Tasks 2, 4, 6 | covered |
| 8. Must-not-touch (lib/openspec.js, banner, R-archive-sync, commit message, openspec-lib-exec.yaml) and guardrails (argv, three `resultText` strings, no `--auto` prompt) | Tasks 1, 3, 4 | covered |
| 9. Spec lines cited as present, STOP if absent; one commit with the given subject | Tasks 1, 3–7; Key Decisions "One commit" | covered |
| 10. Anchors once, Must-not-touch, verification per task; Done-when (W44-3) | all tasks | covered |
| 11. Unsettled design questions → STOP | Deviations (each row ruling- or code-backed); none open | covered |

Verdict: *"…Ready for archive (with noted improvements)."*

## OpenSpec Appendix

Not applicable — no OpenSpec change
