# Ship per-step agent files (W4.3) Implementation Plan

**Goal:**
- Every ship sub-skill step dispatches through its own agent file, `agents/ship-step-<name>.md`, which pins `model`, `effort` and the preloaded skill.
- `ship.js` reads `model`/`effort` from those files, so the pipeline table and `validate-cost-tiers.js` keep one source.
- Consent and execute questions move to main-context `llm_decision` steps that `ship.js` emits: `confirm_<step>`, `execute_tier`, `execute_state`, `execute_gate` and `execute_handoff`. Forked sub-skills run with `--auto` after a `yes`, because a forked agent cannot ask the user (S1 = NO).

**Architecture:** Six agent files (frontmatter `name, description, model, effort, skills`; body = the "follow the preloaded skill" line, then the corrected C16 brief, then the return contract (arbiter ruling m9)). `computeSteps` spreads `stepAgent('<file>')` (`{agent, model, effort}`, read once per process with `parseSimpleYaml(extractFrontmatter(…))`) into the seven agent steps. The step emitter (`STEP_ORDER`, `DECISION_STEPS`, `pickNextStep`, `runAfter`) gains the new decision ids and the `output.pendingQuestion` convention. SKILL.md Step 5 dispatches with `subagent_type: step.data.agent` only. The ledger shape is unchanged: answers live in `history[].data`, the tier in `flags.quality`, a stop in the existing `paused`.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4/wave-2-plan-source.md (item W4.3; readings 1–10; pre-flight W2-P1…P8; rulings w2-preplan, w2-pending, w2-handoff)

**Verification:** Task 9 runs W4.3's Verification and Done-when: `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root "$PWD" --strict` (exit 0, 11 agent rows), `claude plugin validate plugins/sdlc-utilities` (exit 0), and the targeted exec run `--filter-pattern "ship-prepare|ship-step|validate-cost-tiers"` (all pass). Env prefix and command form are in Task 9.

---

## Context

**What problem does this change solve?**

- Ship tells each sub-agent its model in a dispatch parameter, and no ship dispatch sets `effort` at all. The audit's largest cost lever (README §1) is effort on every ship dispatch: review, pr and version off Sonnet's implicit `high`, commit on Haiku `low`.
- The dispatch goes through a generic `general-purpose` agent that then loads the skill with the Skill tool. That is one wrapper hop more than needed.
- Spike S1 showed that a forked sub-agent cannot ask the user (`AskUserQuestion` is not available in subagents). So every approval a sub-skill shows today cannot work inside a forked agent. The questions must be asked in the main context before dispatch.

**What prompted this change now?**

- Milestone M4, wave 2. W4.2 (the step emitter) is merged, so `ship.js` now owns sequencing and can emit decision steps.
- S1 has reported (reading 3: S1 = NO). The owner closed Q15 ("ship asks" for the tier).
- The arbiter settled the open design points in three rulings (w2-preplan, w2-pending, w2-handoff).

**What does success look like?**

- Six `agents/ship-step-*.md` files exist with `model:` and `effort:`.
- `grep -n "model: '" ship.js` shows literals only on the inline steps (three `archive-openspec` branches, `learnings-commit`, `cleanup`).
- `grep -c "effort" ship-sdlc/SKILL.md` is 0.
- The strict cost-tier validator passes with 11 agent rows.
- In interactive runs the user is asked in the main context before commit, commit-fixes, version and pr, and before received-review unless `review_gate` already asked. The user is also asked for the tier when `--quality` is absent, and about an existing execute state file.
- A question that execute cannot ask comes back as `output.pendingQuestion`. Ship either carries a `yes` back for the high-risk gate (`--resume --auto`) or stops with the state kept and prints how to continue.

## Research Findings

Line numbers are at base `31bc4c8`; every anchor is re-located by content (reading 6, W2-P1). Discovery ids `F-<dim>-<n>` refer to `discovery-brief.md` of this run.

- **Validator root.** `validate-cost-tiers.js` defaults `--root` to the main worktree, so a bare run from this worktree reports false MISSING_DOC/DRIFT; every command passes `--root "$PWD"` (F-cost-tier-validator-and-exec-fixtures-4). Rows must keep the header's pipe count (F-cost-tier-validator-and-exec-fixtures-2).
- **`claude plugin validate`** checks the manifest only; it accepts any agent frontmatter, including `skills: [sdlc:x]` and unknown keys (F-execute-state-resolver-and-plugin-validate-5, -6). The docs do not settle the `skills:` name form for plugin agents, and an unresolved name is skipped with only a debug-log warning (Claude Code sub-agents docs). RULING stop-1 settles the form: `skills: [sdlc:<skill>]`, backed by the orchestrator's probe (below).
- **`skills:` probe evidence (RULING stop-1; replaces Change 1's `claude plugin validate` guardrail).** Evidence at `/workspace/sdlc-marketplace/.sdlc/orchestration/m4/skills-probe/`, Claude Code 2.1.304: debug line 232 `[Agent: skprobe:probe-bare] Preloaded skill 'probe-skill'` and line 314 `[Agent: skprobe:probe-ns] Preloaded skill 'skprobe:probe-skill'`. Both forms preload; the namespaced form is exact to this plugin and cannot collide with a same-named user or project skill. `claude plugin validate` accepts any value, so it is not the check.
- **Emitter facts.** New decision ids stay out of `STEP_ID_TO_LEDGER_NAME` (F-ship-confirm-step-stepper-transitions-1), go into `STEP_ORDER`/`DECISION_STEPS` (-2, -3), need ACTIONS and the `tool_hints` switch (-10). Steps are recomputed before the answer is read, so the tier answer is written before the recompute (-11). The pending branch must precede `completeStepCore` (-14). `--auto` for execute needs `flags.quality` (-23).

- **ship.js anchors.** `computeSteps` starts at `function computeSteps(flags, flagSources, { openspecContext, expectedBranch, planFile } = {}) {` (:429). Agent-step `model:` literals: execute `model: 'opus',` (:453), commit `model: 'haiku',` (:502), review :517, received-review :529, commit-fixes :541, version :556, pr :680. Inline literals: archive-openspec :632/:646/:667, learnings-commit :792, cleanup :825. The "is unused but kept for table-rendering consistency." comment ends at :790.
- **Emitter anchors.** `STEP_ID_TO_LEDGER_NAME` (:1122), `STEP_ORDER` (:1138), `DECISION_STEPS` (:1147), `pickNextStep` (:1358), the `review_gate` case with prompt `` `Review found ${found}. Dispatch received-review-sdlc now?` `` (:1414), the `default: // dispatch_*` data line (:1471), L22 `--resume` (:1473), `runAfter` (:1520), the failure rows `if (after === 'rebase' || after.startsWith('dispatch_') || !name || HALTING_INLINE_STEPS.includes(after)) {` (:1693).
- **Decision-step precedent.** `review_gate` and `rebase_conflict` are decision steps. Their answer comes back in `output.answer`, and `DECISION_STEPS` keeps a `success:false` from halting. For ids not in `STEP_ID_TO_LEDGER_NAME`, `pickNextStep` skips any id with a `success` history entry (`historySuccess`). That rule is wrong for the new consent steps, because a `cancel` is also recorded as `success` and `--resume` must ask again (ruling w2-handoff item 4). The new decision ids therefore use their own target-step conditions.
- **Frontmatter parse (W2-P3).** `extractFrontmatter` returns the raw string; `parseSimpleYaml` parses it. Probe (run during planning): `parseSimpleYaml(extractFrontmatter("---\nname: a\nmodel: opus\neffort: high\nskills: [execute-plan-sdlc]\n---\n"))` → `{"name":"a","model":"opus","effort":"high","skills":["execute-plan-sdlc"]}`. `ship.js` does not import `lib/yaml.js` today.
- **Plugin name.** `.claude-plugin/plugin.json` has `"name": "sdlc"`, so agents are addressed as `sdlc:ship-step-<name>` (pre-flight C5).
- **Ledger shape.** `schemas/ship-state.schema.json`: `currentStep` is a free string, `history[].step` a free string, `history[].data` untyped, `history[].result` ∈ `success|failed|unknown`, and `paused {at, reason}` exists. Probe output (planning): `{"oneOf":[{"type":"string"},{"type":"null"}]}` for `currentStep`. New ids and answers therefore need no schema or `state-format.md` change (ruling w2-preplan item 2).
- **State helpers.** `lib/state.js` `readState(prefix, branchSlug)` returns `{ data, filePath }` or null. `deleteState(filePath)` unlinks one file. `state/execute.js` resolves its file the same way (`readState('execute', slugifyBranch(branch))`), which is "execute's own resolver" (ruling w2-handoff item 6).
- **Execute prompts (STOP 1 evidence).** High-risk gate options `yes | skip | cancel` (execute SKILL.md:357-370). Guardrail options `override | harden | cancel` (:345-353). Resume prompt `yes | restart` (:120-125). Tier prompt (:303-315). Execute deletes its state file on success (:837).
- **cost-tiers.md.** §4 has 5 rows (Agent | Model | Effort | Rationale). §5 bullet :55 reads "`plugins/sdlc-utilities/scripts/skill/ship.js` — passes per-step `model:` for each pipeline phase.". The sentence at :60 says the sub-skill frontmatter is "shadowed by the per-step value computed in `ship.js`". The S1 record is in §7 (:102-106).
- **Validator.** `validate-cost-tiers.js` scans every `agents/*.md` (name = `fm.name` or the basename), compares `model` only and reports `MISSING_DOC` for an agent absent from §4. The `cost-tiers-clean` fixture §4 table has three columns (Agent | Model | Rationale).
- **Tests.** Stepper cases (`ship-step: …`) live in `ship-prepare-exec.yaml` and run `tests/promptfoo/scripts/run-ship-stepper.js` against `fixtures-fs/project-ship-stepper` (built by its `setup.sh`). Seeds are interactive (`"auto": false`) with no `quality`. The case "ship-prepare: computeSteps includes model field per step" is at :141. The review-gate case asserts the exact prompt `'Review found 1 critical. Dispatch received-review-sdlc now?'`. `walk()` answers only `confirm_pipeline`/`review_gate` with `results/<answer>.json`.
- **Behavioural case.** `ship-sdlc.yaml:290` asserts `not-icontains "--auto --draft"` with `draft: false`. Adding `--auto` to pr args under interactive never forms that string without `--draft`.
- **Build/test commands.** Exec: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "<re>" --no-cache` with the env prefix. Docs copy: `node site/scripts/copy-docs.mjs` (executor, not a task). Spec checks: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Step 5 dispatch line (W2-P2) | no | Change 3 is applied to the live line at SKILL.md:268 (the general-purpose Agent); the quoted `SKILL.md:332` sentence no longer exists | removed by W4.2; reading 6 |
| Interim general-purpose path | no | deleted; `dispatch_*` uses `subagent_type: step.data.agent` only; `grep -c effort` = 0 | ruling w2-preplan item 3 |
| Descriptions of five agents | no | "Runs the `<skill>` step of a ship pipeline with the given arguments and returns a structured result." | the item gives only execute's description; the bodies are identical apart from the skill name |
| C16 text in the agent body | no | reading 1's corrected paragraph verbatim (not the item's original wording) | reading 1 |
| `--auto` on consent steps | no | `computeSteps` puts `--auto` in the args of commit, commit-fixes, received-review, version and pr in every mode | reading 3: "after `yes`, the forked sub-skill is dispatched with `--auto`"; one source for table and dispatch |
| Decision steps under `--auto` | no | `confirm_*` and `execute_*` decisions are not emitted under `--auto` | Change 5 "interactive runs only"; confirmed by arbiter ruling m3 |
| Agent body order | no | "Follow the preloaded `<skill>` skill, …" line first, then the C16 paragraph (verbatim), then the return contract without a "Return: " prefix | arbiter ruling m9: "The arguments above" must resolve to the follow line; the item's stated order (C16 first) is changed by that ruling; the prefix is not in the item (rule 3) |
| Tier options | no | `full`, `balanced`, `minimal` (no `custom`/`cancel`) | Q15 text names exactly these three |
| Tier and resume pending questions | no | carried by the pre-dispatch decisions `execute_tier` and `execute_state`; a tier or resume pending question that still comes back takes the stop path | ruling w2-pending item 1 lists them as flag-carried; asking before dispatch makes them unreachable inside the agent |
| Recognising the high-risk gate | no | a pending question whose options' first words include both `yes` and `skip` | only execute's high-risk gate (SKILL.md:366-370) has that pair; deterministic in `ship.js` |
| Stop envelope | no | `status: "done"`, `ext.reason: "pending-question"`, `ext.pendingQuestion`, `ext.commands`; ledger `paused` set; the dispatched step stays `in_progress` | ruling w2-pending item 2 ("stop with the state preserved"); `in_progress` is the ruling w2-handoff precondition for `execute_handoff` |
| Spec edits | no | none in this plan; every spec consequence (tier lines, R-tier-prompt-invariant, R-INVARIANT-COMPLETENESS scope, R7, R-subagent-brief, P7, C16, P-TRANS-1 rows) is in `docs/plans/2026-10-19-m4-w2-ship-agents-specs.md`, whose ship run goes FIRST; this feat run follows, then copy-docs | ruling w2-specfirst (spec-consequence commits go first; satisfies `spec-first` and AGENTS.md principle 1); the source's one-commit-per-run rule (line 15) still holds — two runs, specs first |
| `skills:` form | no | `skills: [sdlc:<skill>]`; probe evidence recorded instead of the `claude plugin validate` guardrail | RULING stop-1 |
| reference.md :39 bullet | no | the whole bullet is rewritten, not only "Omitting it defaults all steps to opus." | its first half ("without `model: step.model` …") would otherwise be false |
| cost-tiers §5 "shadowed" sentence (:60) | no | rewritten to name the agent file | Change 4 names only the §5 bullet; the sentence would otherwise be false |
| architecture.md sentence | no | Change 6's sentence gets a leading "The " | sentence start; the acceptance grep matches the item's substring |
| Content previews | no | lost in interactive mode; recorded in `docs/cost-tiers.md` §5 and as a PR note | ruling w2-preplan item 4 |
| Stale lines outside the named sections | no | `docs/cost-tiers.md` §2 :15 ("`ship.js` per-step"), §3 :31/:35 and §7 :92 are left; listed as PR follow-ups | rule 3: apply only the Change; the item names §4 and §5 |

## Key Decisions

**Problem in one sentence:** ship's sub-agents run without a pinned effort and through an extra wrapper, and since a forked sub-agent cannot ask the user, every approval they show today must move to the main context.

- **Agent fields come from the agent files, read once (Change 2).** Alternative: keep the literals in `computeSteps` and add `effort` literals. The agent file is what the harness actually applies, so reading it keeps one source. A module-level cache (`stepAgentCache`) makes it "once per run" (one process = one call). A missing file or missing `model`/`effort` throws, and `main()`'s crash handler exits 2: a broken plugin install must not dispatch on a guessed model.
- **`--auto` in the computed args (reading 3).** Alternative: add `--auto` at emission time after `yes`. Putting it in `computeSteps` keeps the pipeline table, the `confirm_<step>` prompt and the dispatch identical.
- **Consent options `yes | skip | cancel` (ruling w2-preplan item 4, w2-handoff item 4).** `skip` marks the target step skipped (reason `skipped by the user at <id>`); skipping `pr` also skips `verify-pipeline` and `await-remote-review`. `cancel` returns `done` with `ext.reason: "cancel"` and keeps the ledger; `--resume` asks again, because the new decision ids never use `historySuccess`.
- **`review_gate` is received-review's consent (ruling w2-handoff item 2).** Its prompt names that received-review runs and with which args. `confirm_received_review` is emitted only when no `review_gate` answer `yes` follows the latest `dispatch_review` (for example, an unparseable verdict, where `review_gate` sets no decision).
- **`confirm_commit_fixes` (ruling w2-handoff item 3).** commit-fixes runs commit-sdlc, which has a consent prompt.
- **Tier frozen in `ledger.flags.quality` (Q15, ruling w2-handoff item 5).** `execute_tier` is emitted only while `flags.quality` is unset, and `--after execute_tier` writes the answer before `computeSteps` reruns. So the tier is asked at most once per ledger and `--quality` reaches execute through the existing args code.
- **Restart deletes one file (ruling w2-handoff item 6).** Only on the answer `restart`, only `readState('execute', slugifyBranch(ledger.branch)).filePath`, nothing else.
- **Pending questions (ruling w2-pending).** The sub-agent's return item (4) is turned into `output.pendingQuestion {prompt, options}` by SKILL.md. `ship.js` treats a `dispatch_*` failure with a valid `pendingQuestion` as a pending question:
  - execute + high-risk + interactive → `execute_gate`;
  - any other → stop path.
  A failure without one is a real failure, unchanged. The step stays `in_progress` (no `completeStepCore` call).
- **Consent sits directly before its dispatch, after `rebase`.** Alternative: ask `confirm_version`/`confirm_pr` before `rebase`. Change 5 says "before each consent-bearing dispatch", and `rebase` is a pipeline step, not a sub-skill consent (F-ship-confirm-step-stepper-transitions-7). A `cancel` after the rebase leaves a rebased branch, which `--resume` continues from.
- **New decisions never use `historySuccess` (F-ship-confirm-step-stepper-transitions-4).** They are emitted whenever their target step is about to run, so a `cancel` — and a `yes` whose dispatch later failed — is asked again on `--resume` (except received-review: an answered `review_gate` yes stays the consent). One rule, stated once.
- **`execute_gate` needs a tier (F-ship-confirm-step-stepper-transitions-23).** execute requires `--quality` under `--auto`; `execute_gate` is emitted only when `flags.quality` is set, else the stop path. In interactive runs `execute_tier` always sets it first.
- **`paused` after a stop.** `pendingStop` sets `ledger.paused`. The next `/ship-sdlc --resume` initial call runs `claimSession`, which clears it when the session id (`CLAUDE_CODE_SESSION_ID`) is set (lib/state.js:961-968); otherwise the next named-step emit clears it (start-on-emit).
- **`execute_gate` wording (ruling w2-pending item 1).** The options are `yes — approve this and all remaining high-risk tasks in this run` and `stop — continue in execute-plan-sdlc directly`; `ship.js` matches the first word, because the long labels are the user-visible text the ruling requires and the first word is the stable key. Never a bare `yes`. `yes` re-emits `dispatch_execute` with `--resume --auto`.
- **`execute_handoff` (ruling w2-handoff item 1).** Emitted, interactive only, when all three hold: `execute` is `in_progress`, the latest `dispatch_execute` history entry has `pendingQuestion`, and no execute state file exists.
  - `finished`: run the existing completeness gate if a state file exists (halt on non-zero). Otherwise record execute completed with `source: "user-attested"` in the history entry and in the Step 6 summary, then `stage_changes`.
  - `not finished`: stop path.
- **DRY.** The L23 completeness spawn is extracted into `runCompletenessGate(branch)` and used by both `--after dispatch_execute` and `--after execute_handoff`.
- **Smallest cut.** Only W4.3 and the three rulings. Not built:
  - `openspec-step.js` (W4.4), the `review-gate` subcommand (W4.5), the `verify-side-effect` extension (W4.6);
  - an `--answer` flag for execute (follow-up todo, ruling w2-pending item 4);
  - content previews before consent.
- **Who fails if this ships wrong.** Every `/ship-sdlc` user:
  - a wrong `stepAgent` read fails every run (exit 2);
  - a wrong transition skips consent or repeats execute;
  - a wrong restart deletes another branch's execute state.
  Exec cases cover each branch.
- **Non-goals.**
  - No edit to any sub-skill SKILL.md or spec, execute-plan-sdlc/SKILL.md, the five existing agent files, `steps[]` composition (which steps run), `verify-side-effect`, `state/ship.js`, `lib/ship-todos.js`, the schema, or any hook.
  - No new prepare-script flag.
- **Workspace modes.** `branch`: `branch_prepare` still precedes the execute decisions; `execute_state`/`execute_handoff` read the execute state through `readState` keyed by `ledger.branch`, which `migrateBranchSlug` already updated. `worktree`/`continue`: no checkout; same reads. State paths go through `resolveStateDir()` (inside `readState`), never cwd.
- **Flag coherence.** Decision sites read the resolved `flags.auto`/`flags.quality` from `ledger.flags`. No new CLI flag. `--quality` keeps its one resolution site (`mergeFlags`), plus the frozen `execute_tier` answer.
- **Prompt cache.** The agent body is static text (no dates, branches or ids). Volatile values (args, branch, prior results) stay in the task message.

### Plan readings (for the PR body)

- Change 3 re-aimed at SKILL.md:268 (W2-P2); the interim path is deleted; effort count 0 (ruling w2-preplan item 3).
- Content previews (commit message, changelog draft, PR body, received-review plan) are not shown in interactive mode under S1 = NO (ruling w2-preplan item 4).
- Pending questions: `yes` on the high-risk gate → `--resume --auto` (approves every later high-risk gate in that execute run); other answers stop with commands. Execute `--answer` is a follow-up todo (ruling w2-pending).
- `execute_handoff` and the R-INVARIANT-COMPLETENESS scope reading (user-attested completion) (ruling w2-handoff item 1).
- `review_gate`'s `yes` is received-review's consent; `confirm_received_review` only on paths without it; state each rule once (ruling w2-handoff item 2).
- L20: the return items (1)–(4) move with C16 into `agents/ship-step-*.md` (W4.3 Change 1); SKILL.md keeps "Take (1)–(4) from the return" and the R-subagent-brief citation.
- PR note: `validate-discovery.js` PD16 (lib/discovery.js:576) warns `frontmatter missing "tools"` for the six ship-step agents; they omit `tools:` by design (W4.3 Change 1).
- Order (ruling w2-specfirst): the specs commit `docs(#9003): specs - ship and execute consequences of per-step dispatch (W4.3)` lands first, then `feat(#9003): ship-sdlc - per-step agent files (W4.3)`, then copy-docs.
- Arbiter rulings m3 and m9: decision steps are not emitted under `--auto` (m3); agent body order is follow line → C16 paragraph → return contract, no "Return: " prefix (m9).
- Tier spec lines: the ship spec states the tier rule in A3 and in the Phases "Params" sentence. Pre-flight's :191/:208/:335 are SKILL.md lines and are edited in Task 7 (ruling w2-preplan item 1).
- Follow-ups (not fixed): ship.js header line :17 ("(only when explicitly passed)") and the comment at ship.js:461-463 ("Forward --quality to execute-plan-sdlc only when the user explicitly passed --quality to ship …"), both false after Task 5 (rule 3 keeps them out of the Change); cost-tiers §2 :15, §3 :31/:35, §5 intro :53 ("Files where per-call `model:` is computed at runtime and **wins over frontmatter**"), §7 :92 and :96; docs/architecture.md:144 "Per-call overrides at dispatch sites (e.g., `ship.js`…) take precedence"; reading 8 spec gaps.

## Final Shape

When all tasks are done:

- `plugins/sdlc-utilities/agents/` holds 11 agent files; the six `ship-step-*` files differ only in name, description, model, effort and skill.
- `ship.js` dispatch steps carry `agent`, `model` and `effort` read from those files. The emitter knows these decision steps:
  - `execute_handoff`, `execute_state`, `execute_tier`, `execute_gate`;
  - `confirm_commit`, `confirm_received_review`, `confirm_commit_fixes`, `confirm_version`, `confirm_pr`.
  It turns a pending question into a carried answer or a clean stop.
- SKILL.md Step 5 dispatches by `subagent_type` only. It maps a pending question into `output.pendingQuestion` and prints the stop commands.
- `docs/cost-tiers.md` lists 11 agents and records the per-step shape under S1 = NO. `docs/architecture.md`, `docs/skill-best-practices.md` and `docs/skills/ship-sdlc.md` describe per-step agents.
- Exec tests cover the agent fields, every new branch, and the updated old cases.
- The specs plan, shipped first, has already amended the ship and execute specs (P-5 SAME); this plan implements them.

## Tasks

Shared rules for every task:

- Anchors are located by content, exactly once: `command grep -F -- '<quoted text>' <file> | wc -l` must print `1`. If not, STOP (reading 6).
- The checkout may be CRLF; compare with `tr -d '\r'`.
- Order (ruling w2-specfirst): the specs plan's ship run goes FIRST (P-5 SAME for both specs), then this feat plan's ship run, then copy-docs. At this plan's start, `docs/specs/ship-sdlc.md` and `docs/specs/execute-plan-sdlc.md` already carry the amended A3, Params sentence, R7, R-subagent-brief, P7, C16, R-INVARIANT-COMPLETENESS scope sentence, P-TRANS-1 rows and R-tier-prompt-invariant; tasks implement those lines and may cite them as present. If they are absent, STOP (the specs run has not shipped).
- Run Task 3's and Task 4's promptfoo commands one after the other (they share `TMPDIR` and the promptfoo results DB), even though the tasks share a wave.
- Exec runs use this prefix, from `tests/promptfoo` (run `mkdir -p /tmp/claude-1000/pf-tmp-exec-m4` once first):
  `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m4 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "<re>" --no-cache`
- Must-not-touch for every task:
  - `agents/commit-orchestrator.md`, `error-report-orchestrator.md`, `harden-orchestrator.md`, `review-orchestrator.md`, `plan-explore-orchestrator.md`;
  - every sub-skill `SKILL.md` (including execute-plan-sdlc);
  - `docs/specs/**`;
  - `verifySideEffect` in ship.js; `state/ship.js`; `schemas/**`; `hooks/**`.

### Task 1: Agent files for execute, commit and review

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** build

**Findings:** F-execute-state-resolver-and-plugin-validate-6, -7; F-ship-computesteps-agent-frontmatter-sourcing-9

**Files:**
- Create: `plugins/sdlc-utilities/agents/ship-step-execute.md`
- Create: `plugins/sdlc-utilities/agents/ship-step-commit.md`
- Create: `plugins/sdlc-utilities/agents/ship-step-review.md`

**Notes:** The `skills:` form is `sdlc:<skill>` (RULING stop-1, never both forms); the probe evidence in Research Findings replaces Change 1's `claude plugin validate` guardrail, which accepts any value. `claude plugin validate` still runs as the item's manifest check. The cost-tier validator is expected to fail on MISSING_DOC until Task 3, so `validate-cost-tiers.js` is not this task's check. Never write the stale "because the sub-skills need `AskUserQuestion`" reason anywhere (reading 4).

**Acceptance criteria:**
- [ ] Each file's frontmatter has exactly the keys `name, description, model, effort, skills`, with the values in the Contract.
- [ ] `claude plugin validate plugins/sdlc-utilities` exits 0.
- [ ] `node -e 'const y=require("./plugins/sdlc-utilities/scripts/lib/yaml.js");for(const n of ["execute","commit","review"]){const f=y.parseSimpleYaml(y.extractFrontmatter(require("fs").readFileSync(`plugins/sdlc-utilities/agents/ship-step-${n}.md`,"utf8")));console.log(n,f.model,f.effort,JSON.stringify(f.skills))}'` prints `execute opus high ["sdlc:execute-plan-sdlc"]`, `commit haiku low ["sdlc:commit-sdlc"]`, `review sonnet medium ["sdlc:review-sdlc"]`.
- [ ] `command grep -l "AskUserQuestion\|tools:" plugins/sdlc-utilities/agents/ship-step-*.md | wc -l` prints `0`.

**Contract:**
- shape (docs): one markdown agent file per step. The template, with `<name>`, `<description>`, `<model>`, `<effort>` and `<skill>` per the names line:

  ```markdown
  ---
  name: ship-step-<name>
  description: <description>
  model: <model>
  effort: <effort>
  skills: [sdlc:<skill>]
  ---

  Follow the preloaded `<skill>` skill, using the arguments given in the task message.

  The arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).

  (1) status — success or failure (2) result summary — 2-3 lines (3) artifacts — commit hash, tag, PR URL, verdict (4) warnings (5) usage — input/output/cache-read tokens if the harness reports them, else `n/a`.
  ```

- names:

  | file | description | model | effort | skill |
  |---|---|---|---|---|
  | ship-step-execute | `Runs the execute-plan-sdlc step of a ship pipeline on the given plan and returns a structured result.` | opus | high | execute-plan-sdlc |
  | ship-step-commit | `Runs the commit-sdlc step of a ship pipeline with the given arguments and returns a structured result.` | haiku | low | commit-sdlc |
  | ship-step-review | `Runs the review-sdlc step of a ship pipeline with the given arguments and returns a structured result.` | sonnet | medium | review-sdlc |

- mirror: frontmatter layout of `plugins/sdlc-utilities/agents/commit-orchestrator.md` (lines 1-7), minus `tools:`.
- decisions: no `tools:` and no `maxTurns:` (item Change 1); `skills:` namespaced, one entry (RULING stop-1); the brief paragraph is reading 1's corrected C16, byte-for-byte, placed directly after the follow line so "The arguments above" resolves to it; no "Return: " prefix (arbiter ruling m9).
- sync: Task 2 files (identical body); Task 3 §4 rows.

### Task 2: Agent files for received-review, version and pr

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** build

**Findings:** F-ship-computesteps-agent-frontmatter-sourcing-9

**Files:**
- Create: `plugins/sdlc-utilities/agents/ship-step-received-review.md`
- Create: `plugins/sdlc-utilities/agents/ship-step-version.md`
- Create: `plugins/sdlc-utilities/agents/ship-step-pr.md`

**Notes:** Same template as Task 1 (`skills: [sdlc:<skill>]`, RULING stop-1), so the six bodies stay identical apart from the skill name.

**Acceptance criteria:**
- [ ] The same parse command over `received-review version pr` prints `received-review sonnet medium ["sdlc:received-review-sdlc"]`, `version sonnet low ["sdlc:version-sdlc"]`, `pr sonnet low ["sdlc:pr-sdlc"]`.
- [ ] `claude plugin validate plugins/sdlc-utilities` exits 0.
- [ ] `for f in plugins/sdlc-utilities/agents/ship-step-*.md; do sed -n '/^---$/,/^---$/!p' "$f" | tr -d '\r' | sed 's/`[a-z-]*-sdlc`/`X`/'; done | sort | uniq -c` shows every non-empty body line with count 6.

**Contract:**
- shape (docs): the same file shape as Task 1:

  ```markdown
  ---
  name: ship-step-<name>
  description: <description>
  model: <model>
  effort: <effort>
  skills: [sdlc:<skill>]
  ---

  Follow the preloaded `<skill>` skill, using the arguments given in the task message.

  The arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).

  (1) status — success or failure (2) result summary — 2-3 lines (3) artifacts — commit hash, tag, PR URL, verdict (4) warnings (5) usage — input/output/cache-read tokens if the harness reports them, else `n/a`.
  ```

- names:

  | file | description | model | effort | skill |
  |---|---|---|---|---|
  | ship-step-received-review | `Runs the received-review-sdlc step of a ship pipeline with the given arguments and returns a structured result.` | sonnet | medium | received-review-sdlc |
  | ship-step-version | `Runs the version-sdlc step of a ship pipeline with the given arguments and returns a structured result.` | sonnet | low | version-sdlc |
  | ship-step-pr | `Runs the pr-sdlc step of a ship pipeline with the given arguments and returns a structured result.` | sonnet | low | pr-sdlc |

- mirror: `agents/ship-step-commit.md` from Task 1.
- decisions: tiers unchanged from today's `ship.js` literals; only effort is added (item guardrail).
- sync: Task 3 §4 rows.

### Task 3: Cost-tier record and validator fixture

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Findings:** F-cost-tier-validator-and-exec-fixtures-1, -2, -4, -5, -6; F-ship-docs-spec-skill-dispatch-text-3

**Files:**
- Modify: `docs/cost-tiers.md` — §4 gains six rows; §5 bullet and the "shadowed" sentence change; §5 gains a "Ship per-step dispatch" subsection.
- Create: `tests/promptfoo/fixtures-fs/cost-tiers-clean/agents/ship-step-example.md`
- Modify: `tests/promptfoo/fixtures-fs/cost-tiers-clean/docs/cost-tiers.md` — one §4 row in the fixture's three-column shape.

**Notes:** The validator reads columns 0-1 only and never `effort` (W2-P4), so the Effort column is documentation. §7 already holds the S1 record; §5 only points to it (reading 3). Must-not-touch: §1-§3, §6, §7 and the Execute quality presets table.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root "$PWD" --strict; echo exit=$?` prints no `DRIFT:`/`MISSING_DOC:`/`STALE_DOC:` line and `exit=0`.
- [ ] `sed -n '/^## 4\./,/^## 5\./p' docs/cost-tiers.md | command grep -c '^| [a-z]'` prints `11`.
- [ ] The exec run with `--filter-pattern "validate-cost-tiers"` passes every case (the clean case now also covers an agent with `effort:`).

**Contract:**
- shape (docs): §4 rows appended after `| review-orchestrator | … |`, in this order:

  ```markdown
  | ship-step-execute | opus | high | Runs execute-plan-sdlc for ship; plan execution and recovery need the strongest tier |
  | ship-step-commit | haiku | low | Runs commit-sdlc for ship (also commit-fixes); mechanical, message drafting goes to commit-orchestrator |
  | ship-step-review | sonnet | medium | Runs review-sdlc for ship; dimension agents carry their own models |
  | ship-step-received-review | sonnet | medium | Runs received-review-sdlc for ship; triage and fixes at today's ship tier |
  | ship-step-version | sonnet | low | Runs version-sdlc for ship; scripted release steps with verification gates |
  | ship-step-pr | sonnet | low | Runs pr-sdlc for ship; description drafting from a prepared context |
  ```

  §5 edits (before → after):

  ```diff
  - - `plugins/sdlc-utilities/scripts/skill/ship.js` — passes per-step `model:` for each pipeline phase.
  + - `plugins/sdlc-utilities/scripts/skill/ship.js` — reads `model`/`effort` from `agents/ship-step-*.md`.
  ```

  ```diff
  - When ship-sdlc invokes a sub-skill, the sub-skill's frontmatter `model:` is shadowed by the per-step value computed in `ship.js`. Consumers should not assume frontmatter applies inside a pipeline.
  + When ship-sdlc dispatches a sub-skill, the sub-skill runs inside its `ship-step-*` agent: the agent file's `model:` and `effort:` apply, not the sub-skill's frontmatter. Consumers should not assume the sub-skill's frontmatter applies inside a pipeline.
  ```

  New subsection inserted right before `### Execute quality presets`:

  ```markdown
  ### Ship per-step dispatch

  Spike S1 (§7) answered NO: a forked sub-skill cannot ask the user. So ship asks in the main context before each dispatch, and the forked sub-skill runs with `--auto`. Content previews (commit message, changelog draft, PR body, received-review plan) are not shown in interactive mode under S1 = NO.

  | Step | Agent | Main-context decision before dispatch (interactive only) | Arguments ship adds |
  |---|---|---|---|
  | execute | ship-step-execute | `execute_handoff` (resume after a stop), `execute_state` (state file found), `execute_tier` (no `--quality`); `execute_gate` after a high-risk pending question | `--quality <tier>`; `--resume`; `--resume --auto` after `execute_gate` yes |
  | commit | ship-step-commit | `confirm_commit` | `--auto` |
  | review | ship-step-review | none | `--committed` |
  | received-review | ship-step-received-review | `review_gate` (`confirm_received_review` when `review_gate` did not ask) | `--auto` |
  | commit-fixes | ship-step-commit | `confirm_commit_fixes` | `--auto` |
  | version | ship-step-version | `confirm_version` | `--bump <type> --auto` |
  | pr | ship-step-pr | `confirm_pr` | `--auto` |

  A question a sub-skill still cannot ask comes back as `output.pendingQuestion`. Ship carries a high-risk `yes` back to execute; for any other answer it stops with the state kept and prints the commands to continue.
  ```

  Fixture agent `agents/ship-step-example.md`:

  ```markdown
  ---
  name: ship-step-example
  description: Fixture ship step agent for validate-cost-tiers tests.
  model: sonnet
  effort: low
  skills: [example-skill]
  ---

  Fixture body — content irrelevant to the validator.
  ```

  Fixture doc row appended after `| example-agent | haiku | Fixture row |`: `| ship-step-example | sonnet | Fixture row |`.
- names: the six agent names of Tasks 1-2; heading `### Ship per-step dispatch`.
- mirror: §4 rows `| commit-orchestrator | haiku | low | … |` (cost-tiers.md:45); fixture row :21.
- decisions: §7 untouched (no S1 duplication, reading 3); the preview-loss sentence is ruling w2-preplan item 4's text.
- sync: Task 5/6 decision ids; `docs/skills/ship-sdlc.md` (Task 8).

### Task 4: computeSteps reads the agent files; dispatch data carries the agent

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Findings:** F-ship-computesteps-agent-frontmatter-sourcing-1, -2, -5, -7, -8, -10, -12; F-cost-tier-validator-and-exec-fixtures-7

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — imports; `stepAgent` loader; seven agent steps in `computeSteps`; consent-step args; the `dispatch_*` data line.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — extend the `computeSteps includes model field per step` case; update any case asserting interactive commit/commit-fixes/received-review/version/pr args without `--auto`.

**Notes:** `effort` reaches `step.data` through the existing `cs.effort` slot (W2-P3, F-ship-computesteps-agent-frontmatter-sourcing-5), so only the new `agent` field is added there. Interactive consent-step args gain `--auto`, so old cases that pin those args as strings become stale (unverified prediction; the run confirms).

**Acceptance criteria:**
- [ ] `command grep -n "model: '" plugins/sdlc-utilities/scripts/skill/ship.js` lists exactly the five inline literals (three archive-openspec branches, learnings-commit, cleanup).
- [ ] The extended case "ship-prepare: computeSteps includes model field per step" passes (it asserts `"agent": "sdlc:ship-step-commit"` and `"effort": "low"` in the prepare output).
- [ ] The exec run with `--filter-pattern "ship-prepare"` passes every case.

**Contract:**
- shape (code):

  ```js
  // imports, after the PRE_RELEASE_LABEL_RE line
  const { extractFrontmatter, parseSimpleYaml } = require(path.join(LIB, 'yaml'));

  // W4.3: agents/ship-step-*.md pin model and effort; validate-cost-tiers.js checks the model against docs/cost-tiers.md §4.
  const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
  const stepAgentCache = {};

  /**
   * `{ agent, model, effort }` of agents/ship-step-<file>.md, read once per process.
   * @throws {Error} when the file is missing or its frontmatter lacks model or effort
   */
  function stepAgent(file) {
    if (!stepAgentCache[file]) {
      const fm = parseSimpleYaml(extractFrontmatter(fs.readFileSync(path.join(AGENTS_DIR, `ship-step-${file}.md`), 'utf8')) || '');
      if (!fm.model || !fm.effort) throw new Error(`agents/ship-step-${file}.md: frontmatter lacks model or effort`);
      stepAgentCache[file] = { agent: `sdlc:ship-step-${file}`, model: fm.model, effort: fm.effort };
    }
    return stepAgentCache[file];
  }
  ```

  Placed directly above `function computeSteps(`. In each of the seven agent step objects, the `model:` literal line is replaced by a spread:

  | step (`name:`) | before (anchor inside that object) | after |
  |---|---|---|
  | execute | `model: 'opus',` | `...stepAgent('execute'),` |
  | commit | `model: 'haiku',` (first object after `name: 'commit',`) | `...stepAgent('commit'),` |
  | review | `model: 'sonnet',` after `name: 'review',` | `...stepAgent('review'),` |
  | received-review | `model: 'sonnet',` after `name: 'received-review',` | `...stepAgent('received-review'),` |
  | commit-fixes | `model: 'haiku',` after `name: 'commit-fixes',` | `...stepAgent('commit'),` |
  | version | `model: 'sonnet',` after `name: 'version',` | `...stepAgent('version'),` |
  | pr | `model: 'sonnet',` after `name: 'pr',` | `...stepAgent('pr'),` |

  The `model:` literals are not unique, so each is located as "the line after `name: '<step>',` / `skill: '<skill>',`". Check: `command grep -n -A2 "name: '<step>'," ship.js` shows it.

  Consent-step args (reading 3). `flags.auto ? '--auto' : '',` occurs 6 times in ship.js (:488 execute, :506, :532 `args:` form, :545, :568, :686). Locate each site as the `flags.auto ? '--auto' : '',` line inside the object shown by `command grep -n -A14 "name: '<step>'," ship.js` (commit, commit-fixes, version, pr; received-review uses the `args:` form); leave execute (:488):

  ```diff
  # commit and commit-fixes args arrays
  -        flags.auto ? '--auto' : '',
  +        '--auto',
  # received-review
  -      args: flags.auto ? '--auto' : '',
  +      args: '--auto',
  # version args array
  -        flags.auto ? '--auto' : '',
  +        '--auto',
  # pr args array
  -        flags.auto ? '--auto' : '',
  +        '--auto',
  ```

  The execute args keep `flags.auto ? '--auto' : '',` (execute is not a consent step; ruling w2-pending carries its questions).

  `dispatch_*` data line (inside `default: // dispatch_*`):

  ```diff
  -        data = { skill: cs.skill, args: cs.args, invocation: cs.invocation, model: cs.model, ...(cs.effort ? { effort: cs.effort } : {}), ...(cs.isolation ? { isolation: cs.isolation } : {}) };
  +        data = { skill: cs.skill, args: cs.args, invocation: cs.invocation, agent: cs.agent, model: cs.model, ...(cs.effort ? { effort: cs.effort } : {}), ...(cs.isolation ? { isolation: cs.isolation } : {}) };
  ```

  Test extension (case at :141, assertions appended):

  ```yaml
      - type: icontains
        value: '"agent": "sdlc:ship-step-commit"'
      - type: icontains
        value: '"effort": "low"'
  ```

- names: `stepAgent`, `stepAgentCache`, `AGENTS_DIR`; step fields `agent`, `effort`.
- mirror: `const { … } = require(path.join(LIB, '…'))` imports at ship.js:43-57; `STATE_SHIP_SCRIPT` path style (`path.join(__dirname, '..', …)`).
- decisions: Key Decisions "Agent fields come from the agent files", "`--auto` in the computed args".
- sync: `validate-cost-tiers.js` (model only); `docs/cost-tiers.md` §4 (Task 3); SKILL.md Step 5 (Task 7).

### Task 5: Consent, tier and execute-state decision steps

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 4
**Verify:** tests

**Findings:** F-ship-confirm-step-stepper-transitions-1 to -13, -22; F-execute-state-resolver-and-plugin-validate-2

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `STEP_ORDER`, `DECISION_STEPS`, new `DECISION_TARGETS`/`CONFIRM_TARGETS`/`historyAfter`/`skipEntry`, `pickNextStep` (decision branch, new cases, `review_gate` prompt, `dispatch_execute` args, `tool_hints`, ACTIONS), `runAfter` (tier freeze before recompute; answer handling).
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `walk()` answers every decision id; new scenarios.
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — result files for the new answers; seeds keep `quality` unset.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new `ship-step: (cf…)`/`(et…)`/`(es…)` cases; updated stale cases.

**Notes:** Ids not in `STEP_ID_TO_LEDGER_NAME` normally skip on any `success` history entry. That would let a cancelled `confirm_<step>` pass on `--resume`, so the new ids are decided only by their target step (ruling w2-handoff item 4). The old stepper cases were written before any interactive decision existed, so the ones that walk an interactive seed past `branch_prepare`, `stage_changes` or `review_gate` go stale. The table under Contract names each one and its update; any further case the first run reports stale is updated the same way, once (no tight loop).

**Contract:**
- shape (code):

  ```js
  // P-TRANS-1 row order. rebase_conflict is emitted only by `--after rebase`, execute_gate only by `--after dispatch_execute`.
  const STEP_ORDER = [
    'confirm_pipeline', 'branch_prepare',
    'execute_handoff', 'execute_state', 'execute_tier', 'dispatch_execute', 'execute_gate', 'stage_changes',
    'confirm_commit', 'dispatch_commit', 'dispatch_review', 'review_gate',
    'confirm_received_review', 'dispatch_received_review',
    'confirm_commit_fixes', 'dispatch_commit_fixes', 'rebase', 'rebase_conflict',
    'confirm_version', 'dispatch_version', 'verify_version_tag', 'verify_openspec', 'archive_openspec',
    'confirm_pr', 'dispatch_pr', 'verify_pipeline', 'await_remote_review', 'learnings_commit', 'cleanup',
  ];

  // Steps whose result carries an answer, not an outcome.
  const DECISION_STEPS = [
    'confirm_pipeline', 'review_gate', 'rebase_conflict',
    'execute_handoff', 'execute_state', 'execute_tier', 'execute_gate',
    'confirm_commit', 'confirm_received_review', 'confirm_commit_fixes', 'confirm_version', 'confirm_pr',
  ];
  // W4.3 consent steps (S1 = NO): the main context asks before the forked sub-skill runs with --auto.
  const CONFIRM_TARGETS = {
    confirm_commit: 'commit', confirm_received_review: 'received-review',
    confirm_commit_fixes: 'commit-fixes', confirm_version: 'version', confirm_pr: 'pr',
  };
  // Interactive-only decisions, emitted when their target step is about to run (never via historySuccess).
  const DECISION_TARGETS = { ...CONFIRM_TARGETS, execute_handoff: 'execute', execute_state: 'execute', execute_tier: 'execute' };
  ```

  Helpers (next to `lastHistory`):

  ```js
  /** Latest `id` history entry recorded after the latest `sinceId` entry, or null. */
  function historyAfter(ledger, id, sinceId) {
    for (let i = ledger.history.length - 1; i >= 0; i--) {
      if (ledger.history[i].step === sinceId) return null;
      if (ledger.history[i].step === id) return ledger.history[i];
    }
    return null;
  }

  /** Mark a ledger step skipped with a reason (no-op when the step is absent). */
  function skipEntry(ledger, name, reason) {
    const e = ledger.steps.find(s => s.name === name);
    if (e) { e.status = 'skipped'; e.completedAt = new Date().toISOString(); e.reason = reason; }
  }
  ```

  `pickNextStep` loop head:

  ```diff
  -    if (id === 'rebase_conflict') continue;
  +    if (id === 'rebase_conflict' || id === 'execute_gate') continue;
       const name = STEP_ID_TO_LEDGER_NAME[id];
  -    const cs = name ? stepOf(name) : null;
  +    const target = DECISION_TARGETS[id];
  +    const cs = name ? stepOf(name) : (target ? stepOf(target) : null);
  ```

  and the branch after `if (name) { … }`:

  ```diff
  -    } else if (historySuccess(ledger, id)) {
  +    } else if (target) {
  +      if (flags.auto || !cs || cs.status === 'skipped' || isDone(target)) continue;
  +      if (cs.status === 'conditional') {
  +        const reason = unmetCondition(target, ledger);
  +        if (reason) { skipEntry(ledger, target, reason); skipped.push(target); continue; }
  +      }
  +    } else if (historySuccess(ledger, id)) {
         continue;
       }
  ```

  New `switch` cases (before `default:`). `execute_handoff` gets a stub here so Task 5 is green on its own; Task 6 replaces the stub with the real case:

  ```js
      case 'execute_handoff':
        continue; // replaced in Task 6
      case 'execute_state': {
        const e = entryOf('execute');
        const found = readState('execute', slugifyBranch(ledger.branch));
        if ((e && e.status === 'in_progress') || !found) continue;
        data = { stateFile: found.filePath };
        llmDecision = { type: 'choice', prompt: 'An execute-plan-sdlc state file exists for this branch. Resume it, or restart from scratch?', options: ['resume', 'restart'] };
        break;
      }
      case 'execute_tier':
        if (flags.quality) continue;
        data = {};
        llmDecision = { type: 'choice', prompt: 'Which quality tier should execute-plan-sdlc use? The answer is forwarded as --quality.', options: ['full', 'balanced', 'minimal'] };
        break;
      case 'confirm_received_review': {
        const gate = historyAfter(ledger, 'review_gate', 'dispatch_review');
        if (gate && gate.data && gate.data.answer === 'yes') continue; // review_gate's yes is the consent (ruling w2-handoff item 2)
      }
      // falls through
      case 'confirm_commit':
      case 'confirm_commit_fixes':
      case 'confirm_version':
      case 'confirm_pr':
        data = { step: cs.name, skill: cs.skill, args: cs.args };
        llmDecision = { type: 'choice', prompt: `Run ${cs.skill} (${cs.name}) now with "${cs.args}"? It runs unattended, without its own approval prompt.`, options: ['yes', 'skip', 'cancel'] };
        break;
  ```

  `review_gate` prompt:

  ```diff
  -          llmDecision = { type: 'choice', prompt: `Review found ${found}. Dispatch received-review-sdlc now?`, options: ['yes', 'defer'] };
  +          llmDecision = { type: 'choice', prompt: `Review found ${found}. Dispatch received-review-sdlc now with "${stepOf('received-review').args}"? It runs unattended and applies the fixes without showing its plan.`, options: ['yes', 'defer'] };
  ```

  `dispatch_execute` args (replaces the L22 block's condition only):

  ```diff
  -          if (exec0 && exec0.status === 'in_progress' && readState('execute', slugifyBranch(ledger.branch))) {
  -            data.args = `${cs.args} --resume`;
  +          const hasState = !!readState('execute', slugifyBranch(ledger.branch));
  +          const st = historyAfter(ledger, 'execute_state', 'dispatch_execute');
  +          const gate = historyAfter(ledger, 'execute_gate', 'dispatch_execute');
  +          const gateYes = !!(gate && gate.data && typeof gate.data.answer === 'string' && gate.data.answer.startsWith('yes'));
  +          const resume = gateYes || (hasState && ((exec0 && exec0.status === 'in_progress') || (st && st.data && st.data.answer === 'resume')));
  +          const extra = [resume ? '--resume' : '', gateYes && !flags.auto ? '--auto' : ''].filter(Boolean);
  +          if (extra.length > 0) {
  +            data.args = `${cs.args} ${extra.join(' ')}`;
               data.invocation = `skill: "${cs.skill}", args: "${data.args}"`;
             }
  ```

  (`execute_gate` is added in Task 6; until then `gateYes` is always false.)

  ACTIONS and hints:

  ```diff
  +      execute_handoff: 'Ask the user with llm_decision, then report the answer.',
  +      execute_state: 'Ask the user with llm_decision, then report the answer.',
  +      execute_tier: 'Ask the user with llm_decision, then report the answer.',
  +      confirm_commit: 'Ask the user with llm_decision, then report the answer.',
  +      confirm_received_review: 'Ask the user with llm_decision, then report the answer.',
  +      confirm_commit_fixes: 'Ask the user with llm_decision, then report the answer.',
  +      confirm_version: 'Ask the user with llm_decision, then report the answer.',
  +      confirm_pr: 'Ask the user with llm_decision, then report the answer.',
  ...
  -        tool_hints: isDispatch ? ['Agent'] : (id === 'review_gate' ? ['AskUserQuestion'] : ['Bash']),
  +        tool_hints: isDispatch ? ['Agent'] : (DECISION_STEPS.includes(id) ? ['AskUserQuestion'] : ['Bash']),
  ```

  `runAfter` — tier freeze, inserted directly before `// 2. Recompute the step plan from the frozen flags.`:

  ```js
    // Q15: the tier answer is frozen in ledger.flags.quality before the steps are recomputed.
    if (after === 'execute_tier') {
      const tier = typeof output.answer === 'string' ? output.answer : null;
      if (!VALID_QUALITY.includes(tier)) return fail(`execute_tier: unknown answer "${tier}" (expected full, balanced or minimal).`);
      flags.quality = tier;
    }
  ```

  `runAfter` — answers, inserted directly after the `rebase_conflict` pause block and before `// 5. Pick the next step.`:

  ```js
    if (CONFIRM_TARGETS[after]) {
      const target = CONFIRM_TARGETS[after];
      if (answer === 'cancel') {
        return finish(createEnvelope('done', null, { ext: { ...ext, reason: 'cancel' }, stateFile: ledgerPath, progress: progress() }));
      }
      if (answer === 'skip') {
        const reason = `skipped by the user at ${after}`;
        skipEntry(ledger, target, reason);
        skipped.push(target);
        if (target === 'pr') {
          for (const dep of ['verify-pipeline', 'await-remote-review']) {
            const e = ledger.steps.find(s => s.name === dep);
            if (e && e.status === 'pending') { skipEntry(ledger, dep, 'pr skipped by the user'); skipped.push(dep); }
          }
        }
      } else if (answer !== 'yes') {
        return failStep(`${after}: unknown answer "${answer}" (expected yes, skip or cancel).`);
      }
    }
    if (after === 'execute_state') {
      if (answer === 'restart') {
        const found = readState('execute', slugifyBranch(ledger.branch));
        if (found) deleteState(found.filePath); // ruling w2-handoff item 6: this branch's execute state file only
      } else if (answer !== 'resume') {
        return failStep(`execute_state: unknown answer "${answer}" (expected resume or restart).`);
      }
    }
  ```

- names: `STEP_ORDER`, `DECISION_STEPS`, `CONFIRM_TARGETS`, `DECISION_TARGETS`, `historyAfter`, `skipEntry`; step ids above; `ext.reason: "cancel"`.
- mirror: the `review_gate` case (llm_decision shape) and the `rebase_conflict` pause block in `runAfter`; wrapper scenarios `review-gate-rows` and `after-confirm` in `run-ship-stepper.js`.
- decisions: Key Decisions "Consent options", "`review_gate` is received-review's consent", "Tier frozen", "Restart deletes one file".
- sync: Task 7 SKILL.md family rule; Task 3 §5 table; the specs plan P-TRANS-1 rows.

  Wrapper changes (render):

  ```diff
  -    envelope = after(id, ['confirm_pipeline', 'review_gate'].includes(id) ? `results/${answer}.json` : 'results/generic-ok.json');
  +    const decision = id === 'confirm_pipeline' || id === 'review_gate' || id.startsWith('confirm_');
  +    envelope = after(id, id === 'execute_tier' ? 'results/tier-balanced.json' : decision ? `results/${answer}.json` : 'results/generic-ok.json');
  ```

  New scenarios (also `resume-again`: rerun `after('confirm_pipeline', 'results/yes.json')` after the scenario's last call, for es3/eh7): `after-stage` (`after('stage_changes', 'results/generic-ok.json')` then, when the emitted id starts with `confirm_`, `after(id, results/<answer>.json)`), `confirm-pr` (seed with `verify-pipeline`/`await-remote-review` in `flags.steps` and `pr` pending; `after('archive_openspec' | 'verify_version_tag', …)` as needed to reach `confirm_pr`), `resume-twice` (`after-confirm`, then `cancel`, then `after('confirm_pipeline', yes)` again), `tier` (`after-confirm` then `after('execute_tier', --result)`), `exec-state` (seed `frozen` + `--exec-seed complete`, `after('confirm_pipeline', yes)`, then `after('execute_state', --result)`). A `--quality <q>` wrapper arg patches `data.flags.quality` into the seed. The output JSON gains `execFiles` (names in `.sdlc/execution/` matching `^execute-`) and `otherFiles`.

  setup.sh additions: `results/skip.json`, `results/tier-balanced.json`, `results/tier-bad.json`, `results/resume.json`, `results/restart.json`, each `{"success":true,"output":{"answer":"<a>","summary":"<a>"}}`.

  Wrapper code (render; `run-ship-stepper.js`):

  ```js
  // args loop
  let quality = null;
  else if (args[i] === '--quality' && args[i + 1]) quality = args[++i];
  // inside seedLedger's patch callback, first line
  if (quality) data.flags.quality = quality;
  // new switch cases
  case 'after-stage': {
    const c = after('stage_changes', 'results/generic-ok.json');
    if (c.status === 'step' && c.step.id.startsWith('confirm_')) after(c.step.id, `results/${answer}.json`);
    break;
  }
  case 'tier': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (c.status === 'step' && c.step.id === 'execute_tier') after('execute_tier', resultRel || 'results/tier-balanced.json');
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    break;
  }
  case 'exec-state': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (c.status === 'step' && c.step.id === 'execute_state') after('execute_state', resultRel);
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    break;
  }
  case 'confirm-pr':
    after('archive_openspec', 'results/generic-ok.json');
    if (calls[calls.length - 1].envelope.step && calls[calls.length - 1].envelope.step.id === 'confirm_pr') after('confirm_pr', `results/${answer}.json`);
    break;
  case 'auto-walk':
    clearLedgers();
    initial(['--steps', 'commit,review', '--auto']);
    walk(after('confirm_pipeline', 'results/yes.json'));
    break;
  case 'resume-twice':
    after('stage_changes', 'results/generic-ok.json');
    after('confirm_commit', 'results/cancel.json');
    after('confirm_pipeline', 'results/yes.json');
    break;
  // output object gains
  execFiles: (() => { try { return fs.readdirSync(execDir).filter(f => /^execute-/.test(f)); } catch (_) { return []; } })(),
  // and inside the `ledger = { … }` summary block:
  //   history: (data.history || []).map(h => ({ step: h.step, result: h.result, source: h.data && h.data.source })),
  //   stepReasons: Object.fromEntries((data.steps || []).filter(s => s.reason).map(s => [s.name, s.reason])),
  ```

  `--again` (es3, et2, eh7) reruns `after('confirm_pipeline', yes)` at the end of the scenario. Patch-callback lines:

  ```js
  if (scenario === 'emit-in-progress') data.flags.auto = true;
  if (scenario === 'confirm-pr') {
    for (const nm of ['verify-pipeline', 'await-remote-review']) {
      if (!data.flags.steps.includes(nm)) data.flags.steps.push(nm);
      const x = data.steps.find(s => s.name === nm); if (x) { x.status = 'pending'; delete x.reason; } else data.steps.push({ name: nm, status: 'pending' });
    }
    for (const nm of ['execute', 'commit', 'review', 'version']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
  }
  ```

  The header comment's `--scenario` list gains `after-stage | tier | exec-state | confirm-pr | resume-twice | auto-walk | pending | handoff`, and the args list gains `--quality <q>` and `--again`.

  Task 5 new-case table:

  | case | seed / exec-seed | args |
  |---|---|---|
  | cf1/cf2 | `frozen` / none | `--scenario after-stage --quality balanced` (cf2: `--answer yes`) |
  | cf3 | `frozen` / none | `--scenario after-stage --answer skip` → `o.ledger.stepReasons.commit === 'skipped by the user at confirm_commit'` |
  | cf4 | `frozen` / none | `--scenario resume-twice`; patch line `if (scenario === 'resume-twice') { const e = data.steps.find(x => x.name === 'execute'); if (e) e.status = 'completed'; }` |
  | cf5 | `frozen` / none | `--scenario confirm-pr --answer skip` |
  | cf6 | `frozen` / none | `--scenario review-gate-rows --seed frozen --result results/review-critical.json` |
  | cf7 | `frozen` / none | `--scenario review-gate-rows --seed frozen --result results/review-unparseable.json --answer generic-ok` |
  | cf8 | none (fresh) | `--scenario auto-walk`: `clearLedgers(); initial(['--steps', 'commit,review', '--auto']); walk(after('confirm_pipeline', 'results/yes.json'));` — assert no emitted id matches `/^(confirm_(?!pipeline)|execute_)/` and the last envelope is `done` |
  | et1/et3 | `frozen` / none | `--scenario tier` (et3: `--result results/tier-bad.json`) |
  | et2 | `frozen` / none | `--scenario tier --again` |
  | es1/es2 | `frozen` / `complete` | `--scenario exec-state --quality balanced --result results/resume.json` (es2: `results/restart.json`) |
  | es3 | `frozen` / `complete` | `--scenario exec-state --quality balanced --result results/resume.json --again` |

  Stale old cases (update the expectation only):

  | case (description prefix) | line | why stale | update |
  |---|---|---|---|
  | `ship-step: (b) --after confirm_pipeline with yes emits branch_prepare or dispatch_execute` | :1885 | interactive seed, no `quality` → `execute_tier` | run with `--quality balanced` |
  | `ship-step: (m) worktree/continue ledger skips branch_prepare after confirm_pipeline` | :1901 | same | `--quality balanced` |
  | `ship-step: (n) branch mode migrates the ledger and patches --expected-branch` | :2214 | after `branch_prepare`, the next step for its interactive `--steps commit,review` seed is `confirm_commit`, not `dispatch_commit` | assert `confirm_commit` and the `--expected-branch` value in `data.args` |
  | `ship-step: (o) emitted dispatch step is in_progress …` | :2234 | `--after stage_changes` now emits `confirm_commit` | wrapper patch callback: `if (scenario === 'emit-in-progress') data.flags.auto = true;` (it tests start-on-emit, not consent) |
  | `ship-step: (q) review_gate threshold row critical …` | :2268 | prompt text | new prompt text (cf6) |
  | `ship-step: (q) review_gate unparseable verdict …` | :2367 | interactive → `confirm_received_review` | add `--answer generic-ok` to its `script_args`; replace `if (next.step.id !== 'dispatch_received_review')` — the only occurrence inside the case `ship-step: (q) review_gate unparseable verdict dispatches received-review with a warnings line` (ship-prepare-exec.yaml:2380; the pattern occurs 5 times in the file) with `if (next.step.id !== 'confirm_received_review')`; keep the `gate.llm_decision !== null` and `warnings` checks (doubles as cf7) |
  | `ship-step: (h) …` | :2172 | its interactive `--steps commit` walk now emits `confirm_commit` | filter decision ids from `emitted`: `.filter(id => !/^(confirm_|execute_)/.test(id) || id === 'confirm_pipeline')` |
  | `ship-step: (r) …` | :2197 | `walk()` must answer decisions | covered by the `walk()` change |
  | `ship-step: (q) review_gate below-threshold …` | :2349 | `confirm_version` now precedes `dispatch_version` | assert `next.step.id === 'confirm_version'` (replace `if (next.step.id !== 'dispatch_version')` at :2362); keep the `progress.skipped` checks |
  | `ship-step: (v)`, `(v2)`, `(w)`, `(y)` | :2487, :2505, :2535, :2571 | `execute_tier` first | `--quality balanced` |
  | `ship-step: (v3) execute not in_progress emits dispatch_execute without --resume even when an execute state file exists` | :2520 | interactive runs now ask `execute_state` first | KEEP (L22): add `--auto-seed` to its `script_args` (description may gain " (--auto)") so `execute_state` is not emitted (m3); assert `dispatch_execute` args have no `--resume` and no emitted step is `execute_state` |

**Acceptance criteria:**
- [ ] `STEP_ORDER` and `DECISION_STEPS` equal the Contract lists.
- [ ] New exec cases pass (each description starts with `ship-step: `):
  - **cf1** `--after stage_changes` emits `confirm_commit` with options `["yes","skip","cancel"]`;
  - **cf2** `yes` → `dispatch_commit` whose `data.args` starts with `--auto`;
  - **cf3** `skip` → commit `skipped` with reason `skipped by the user at confirm_commit`, next is `dispatch_review`;
  - **cf4** `cancel` → `done`, `ext.reason: "cancel"`, ledger kept; then a resumed `--after confirm_pipeline` emits `confirm_commit` again;
  - **cf5** `confirm_pr` `skip` → `pr`, `verify-pipeline` and `await-remote-review` `skipped`;
  - **cf6** `review_gate` `yes` → `dispatch_received_review` directly, and the prompt equals `Review found 1 critical. Dispatch received-review-sdlc now with "--auto"? It runs unattended and applies the fixes without showing its plan.`;
  - **cf7** unparseable verdict, run with `--answer generic-ok` (no `answer` field, as the gate sets no decision) → `review_gate` → `confirm_received_review`;
  - **cf8** a `flags.auto` ledger never emits a `confirm_*` or `execute_*` decision (walk to `cleanup`);
  - **et1** interactive, no `quality` → `execute_tier` (options `full|balanced|minimal`); answer `balanced` → `dispatch_execute` args contain `--quality balanced` and `ledger.flags.quality === "balanced"`;
  - **et2** a second `--after confirm_pipeline` on that ledger does not emit `execute_tier` (idempotent);
  - **et3** answer `fast` → `status: "error"`, nothing recorded;
  - **es1** (run with `--quality balanced`) execute `pending` + execute state file → `execute_state`; `resume` → `dispatch_execute` args end with `--resume` (once);
  - **es2** (run with `--quality balanced`) `restart` → the execute state file is gone, other files in `.sdlc/execution/` are untouched, and `dispatch_execute` args have no `--resume`;
  - **es3** idempotency: after `resume` and the emitted `dispatch_execute` (execute now `in_progress`), a second `--after confirm_pipeline` on the same ledger emits `dispatch_execute` with `--resume` and no `execute_state`.
- [ ] The exec run with `--filter-pattern "ship-step"` passes every case (old and new).

### Task 6: Pending questions, execute_gate and execute_handoff

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 5
**Verify:** tests

**Findings:** F-ship-confirm-step-stepper-transitions-14, -15, -18, -19, -23; F-execute-state-resolver-and-plugin-validate-3, -4

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `validPendingQuestion`, `isHighRiskGate`, `runCompletenessGate`, `pendingStop`; `runAfter` step 4, failure rows and decision answers; `pickNextStep` `execute_handoff` case; `buildSummary`.
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenarios for pending questions and the handoff.
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — result files with `pendingQuestion`.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new `ship-step: (pq…)`/`(eh…)` cases.

**Notes:** The completeness gate is extracted, not rewritten, so the existing cases (t)/(u)/(u2)/(u3) are the regression check and must pass unedited. `in_progress` (not `failed`) is what `execute_handoff` keys on, per ruling w2-handoff (F-ship-confirm-step-stepper-transitions-14, -15). The three parts share `runAfter` and its ledger state, so they stay one task.

**Contract:**
- shape (code):

  ```js
  /** `{prompt, options}` when `v` is a well-formed pending question (SKILL.md Step 5 fills it from return item (4)), else null. */
  function validPendingQuestion(v) {
    if (!v || typeof v !== 'object' || typeof v.prompt !== 'string' || !v.prompt.trim()) return null;
    if (!Array.isArray(v.options) || v.options.length === 0 || !v.options.every(o => typeof o === 'string')) return null;
    return { prompt: v.prompt, options: v.options };
  }

  /** execute-plan-sdlc's high-risk gate is the only question offering both `yes` and `skip` (SKILL.md 5a). */
  function isHighRiskGate(pq) {
    const keys = pq.options.map(o => o.trim().toLowerCase().split(/\s+/)[0]);
    return keys.includes('yes') && keys.includes('skip');
  }

  /**
   * L23 completeness gate, moved unchanged from runAfter step 4.
   * @returns {{ ok: true } | { ok: false, exitCode: number, text: string }}
   */
  function runCompletenessGate(branch) {
    // body: ship.js:1623-1635 moved verbatim (the EXECUTE_STATE_SCRIPT existence check with the exit-2
    // text 'Cannot locate execute.js — completeness gate cannot run (exit 2).', then spawnSync
    // verify-completeness --branch <branch>), returning { ok: false, exitCode, text } where the old code
    // set failExitCode/failureText, and { ok: true } otherwise.
  }
  ```

  Call site (replaces the `if (name === 'execute' && success) { … }` block, ship.js:1621-1636, after `let failExitCode;`):

  ```js
    if (name === 'execute' && success) {
      const g = runCompletenessGate(ledger.branch);
      if (!g.ok) { success = false; failExitCode = g.exitCode; failureText = g.text; }
    }
  ```

  `runAfter` step 4 — pending detection, before `const ext = {};`:

  ```js
    // ruling w2-pending: a dispatch failure that carries a question is not a step failure.
    const pq = after.startsWith('dispatch_') && !success ? validPendingQuestion(output.pendingQuestion) : null;
  ```

  and the recording guard, located by `command grep -n '^  if (name) {' ship.js` (1 hit, ship.js:1640, in `runAfter`; the plain `if (name) {` also matches pickNextStep :1374), directly after `const recorded = new Set();`:

  ```diff
  -  if (name) {
  +  if (name && !pq) {
  ```

  `execute_handoff` finish, inserted after that `if (name && !pq) { … }` block and before `ledger.history.push(`:

  ```js
    // R-INVARIANT-COMPLETENESS scope (ruling w2-handoff): execute finished outside the pipeline.
    let handoffFail = null;
    if (after === 'execute_handoff' && answer === 'finished') {
      const found = readState('execute', slugifyBranch(ledger.branch));
      const gate = found ? runCompletenessGate(ledger.branch) : { ok: true };
      if (!gate.ok) {
        shipState.completeStepCore(ledger, 'execute', gate.text, 'failure');
        handoffFail = gate;
        success = false;
      } else {
        shipState.completeStepCore(ledger, 'execute', 'finished outside the pipeline', 'success');
        if (!found) output.source = 'user-attested';
        ext.todos = markCompleted(ledger, 'execute');
        recorded.add('execute');
      }
    }
  ```

  (`output` is declared with `const`; the property write is allowed. `answer` is already computed in step 3.)

  `pendingStop`, defined inside `runAfter` after `failStep`:

  ```js
    const pendingStop = (question, viaExecute) => {
      ledger.paused = { at: new Date().toISOString(), reason: 'pending question' };
      const commands = [
        ...(viaExecute ? [`/sdlc:execute-plan-sdlc --plan "${flags.planFile}" --resume`] : []),
        '/sdlc:ship-sdlc --resume',
      ];
      return finish(createEnvelope('done', null, {
        ext: { ...ext, reason: 'pending-question', pendingQuestion: question, commands },
        stateFile: ledgerPath, progress: progress(),
      }));
    };
  ```

  Failure rows, inserted first inside `// Failure rows.` (before `if (!success && !DECISION_STEPS.includes(after)) {`):

  ```js
    if (pq) {
      if (after === 'dispatch_execute' && !flags.auto && flags.quality && isHighRiskGate(pq)) {
        ledger.currentStep = 'execute_gate';
        return finish(createEnvelope('step', {
          id: 'execute_gate',
          action: 'Ask the user with llm_decision, then report the answer.',
          tool_hints: ['AskUserQuestion'],
          data: { pendingQuestion: pq },
        }, {
          llmDecision: {
            type: 'choice',
            prompt: `execute-plan-sdlc asks: ${pq.prompt} Ship can only carry "yes" back: execute then re-runs with --resume --auto, which approves this and every later high-risk gate in this run and suppresses its other prompts.`,
            options: ['yes — approve this and all remaining high-risk tasks in this run', 'stop — continue in execute-plan-sdlc directly'],
          },
          stateFile: ledgerPath, progress: progress(), ext,
        }));
      }
      return pendingStop(pq, after === 'dispatch_execute');
    }
    if (handoffFail) {
      return failStep(`execute failed: ${handoffFail.text}. State preserved; re-run with --resume.`, handoffFail.exitCode);
    }
  ```

  Decision answers, inserted directly after the `if (after === 'execute_state') { … }` block (Task 5) and before `// 5. Pick the next step.`; `answer`, `failStep`, `finish`, `lastHistory` are the existing `runAfter` locals/helpers:

  ```js
    let from = after;
    if (after === 'execute_gate') {
      const last = lastHistory(ledger, 'dispatch_execute');
      if (typeof answer === 'string' && answer.startsWith('yes')) from = 'execute_tier';
      else if (typeof answer === 'string' && answer.startsWith('stop')) return pendingStop(last.data.pendingQuestion, true);
      else return failStep(`execute_gate: unknown answer "${answer}" (expected yes or stop).`);
    }
    if (after === 'execute_handoff' && answer !== 'finished') {
      if (answer === 'not finished') return pendingStop(lastHistory(ledger, 'dispatch_execute').data.pendingQuestion, true);
      return failStep(`execute_handoff: unknown answer "${answer}" (expected finished or not finished).`);
    }
  ```

  and `pickNextStep(after, …)` in step 5 becomes `pickNextStep(from, …)`.

  `pickNextStep` case — replaces Task 5's stub (`case 'execute_handoff':` + `continue; // replaced in Task 6`), located by `command grep -F 'continue; // replaced in Task 6' ship.js | wc -l` = 1; `entryOf`, `lastHistory`, `readState`, `slugifyBranch` are in scope there:

  ```js
      case 'execute_handoff': {
        const e = entryOf('execute');
        const last = lastHistory(ledger, 'dispatch_execute');
        const pq = last && last.data ? validPendingQuestion(last.data.pendingQuestion) : null;
        if (!e || e.status !== 'in_progress' || !pq || readState('execute', slugifyBranch(ledger.branch))) continue;
        data = { pendingQuestion: pq };
        llmDecision = { type: 'choice', prompt: 'Did execute-plan-sdlc finish the plan outside the pipeline?', options: ['finished', 'not finished'] };
        break;
      }
  ```

  `buildSummary`:

  ```diff
  +  const handoff = lastHistory(ledger, 'execute_handoff');
  +  const attested = !!(handoff && handoff.data && handoff.data.source === 'user-attested');
     return {
  -    steps: (ledger.steps || []).map(s => ({ name: s.name, status: s.status })),
  +    steps: (ledger.steps || []).map(s => ({ name: s.name, status: s.status, ...(attested && s.name === 'execute' ? { source: 'user-attested' } : {}) })),
  ```

  Stop envelope (rendered):

  ```json
  {
    "status": "done",
    "step": null,
    "ext": {
      "reason": "pending-question",
      "pendingQuestion": { "prompt": "Wave 2 would violate guardrail no-scope-creep …", "options": ["override", "harden", "cancel"] },
      "commands": ["/sdlc:execute-plan-sdlc --plan \"/abs/plan.md\" --resume", "/sdlc:ship-sdlc --resume"]
    }
  }
  ```

- names: `validPendingQuestion`, `isHighRiskGate`, `runCompletenessGate`, `pendingStop`; `ext.reason: "pending-question"`, `ext.pendingQuestion`, `ext.commands`, history `data.source: "user-attested"`.
- mirror: the `rebase_conflict` emission inside `runAfter`'s failure rows (envelope with `llmDecision`); the L23 block for `runCompletenessGate`.
- decisions: Key Decisions "Pending questions", "`execute_gate` wording", "`execute_handoff`", "DRY".
- sync: Task 7 SKILL.md items 2 and 5; the specs plan P-TRANS-1 rows and R-INVARIANT-COMPLETENESS scope sentence.

  Fixture result files (setup.sh):

  ```sh
  echo '{"success":false,"output":{"summary":"stopped before a high-risk wave","pendingQuestion":{"prompt":"Wave 1 contains high-risk task(s): Task 2. Approve execution?","options":["yes","skip","cancel"]}}}' > results/execute-pending-highrisk.json
  echo '{"success":false,"output":{"summary":"guardrail violation","pendingQuestion":{"prompt":"Wave 2 would violate guardrail no-scope-creep. Override?","options":["override","harden","cancel"]}}}' > results/execute-pending-guardrail.json
  echo '{"success":false,"output":{"summary":"needs approval","pendingQuestion":{"prompt":"Approve the commit message?","options":["approve","edit","cancel"]}}}' > results/commit-pending.json
  echo '{"success":true,"output":{"answer":"yes — approve this and all remaining high-risk tasks in this run","summary":"approved"}}' > results/gate-yes.json
  echo '{"success":true,"output":{"answer":"stop — continue in execute-plan-sdlc directly","summary":"stop"}}' > results/gate-stop.json
  echo '{"success":true,"output":{"answer":"finished","summary":"finished"}}' > results/handoff-finished.json
  echo '{"success":true,"output":{"answer":"not finished","summary":"not finished"}}' > results/handoff-not-finished.json
  ```

  A seed `ledger-frozen-pending.json` (built with `frozen_ledger false in_progress pending`, plus a `history` entry `{"step":"dispatch_execute","result":"failed","data":{"pendingQuestion":{…high-risk…}},"timestamp":"2026-10-19T12:00:00.000Z"}`) backs eh1-eh6.

  Wrapper scenarios (render; `run-ship-stepper.js`), with `seedLedger` accepting the new seed name `frozen-pending`:

  ```js
  case 'pending': {
    // --result: the dispatch result; --answer: the execute_gate answer file name, or none
    const c = after(process.argv.includes('--commit') ? 'dispatch_commit' : 'dispatch_execute', resultRel);
    if (c.status === 'step' && c.step.id === 'execute_gate' && answer !== 'none') after('execute_gate', `results/${answer}.json`);
    break;
  }
  case 'handoff': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (c.status === 'step' && c.step.id === 'execute_handoff' && resultRel) after('execute_handoff', resultRel);
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    if (process.argv.includes('--walk')) walk(calls[calls.length - 1].envelope);
    break;
  }
  ```

  | case | seed / exec-seed | args |
  |---|---|---|
  | pq1 | `frozen-exec` / none | `--scenario pending --quality balanced --result results/execute-pending-highrisk.json --answer none` |
  | pq2 | `frozen-exec` / `complete` | `--scenario pending --quality balanced --result results/execute-pending-highrisk.json --answer gate-yes` |
  | pq3 | `frozen-exec` / none | `--scenario pending --quality balanced --result results/execute-pending-highrisk.json --answer gate-stop` |
  | pq4 | `frozen-exec` / none | `--scenario pending --quality balanced --result results/execute-pending-guardrail.json --answer none` |
  | pq5 | `frozen-resumed` (commit set `in_progress` by the patch line below) / none | `--scenario pending --commit --result results/commit-pending.json --answer none` |
  | pq6 | `frozen-exec` / `complete` | `--scenario pending --result results/commit-fail.json --answer none` (a real failure: `dispatch_execute` with no `pendingQuestion`) |
  | eh1 | `frozen-pending` / none | `--scenario handoff` |
  | eh2 | `frozen-pending` / none | `--scenario handoff --result results/handoff-finished.json --walk` |
  | eh3a | `frozen-pending` / `complete` (copied late) | `--scenario handoff --late-exec --result results/handoff-finished.json` → execute `completed`, no `source` |
  | eh3b | `frozen-pending` / `missing` (copied late) | `--scenario handoff --late-exec --result results/handoff-finished.json` → `status: "error"`, execute `failed` |
  | eh4 | `frozen-pending` / none | `--scenario handoff --result results/handoff-not-finished.json` |
  | eh5 | `frozen-pending` / `complete` | `--scenario handoff --quality balanced` |
  | eh6 | `frozen-pending` with `flags.auto = true` (patch line below) / none | `--scenario handoff --auto-seed` |
  | eh7 | `frozen-pending` / none | `--scenario handoff --result results/handoff-finished.json --again` |

  Patch-callback lines for these scenarios:

  ```js
  if (scenario === 'pending' && process.argv.includes('--commit')) { const e = data.steps.find(x => x.name === 'commit'); if (e) e.status = 'in_progress'; }
  if (process.argv.includes('--auto-seed')) data.flags.auto = true; // any scenario (v3, eh6)
  if (scenario === 'handoff' && process.argv.includes('--walk')) { data.flags.steps = ['execute']; for (const s of data.steps) if (s.name !== 'execute' && s.status === 'pending') s.status = 'skipped'; }
  ```

  `--late-exec` code (render):

  ```js
  const late = process.argv.includes('--late-exec');
  // top-level exec-seed copy becomes:
  if (execSeed !== 'none' && !late) { /* existing copy */ }
  // inside case 'handoff', between the first after() and after('execute_handoff'):
  if (late && execSeed !== 'none') {
    fs.mkdirSync(execDir, { recursive: true });
    fs.copyFileSync(path.join(projectRoot, 'seed', `execute-${execSeed}.json`), path.join(execDir, `execute-feat-ship-${SEED_TS}.json`));
  }
  ```

  `frozen-pending` seed (setup.sh), built from the existing heredoc output with `node -e` (no new heredoc):

  ```sh
  frozen_ledger false in_progress pending | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);j.history=[{step:"dispatch_execute",result:"failed",data:{summary:"stopped before a high-risk wave",pendingQuestion:{prompt:"Wave 1 contains high-risk task(s): Task 2. Approve execution?",options:["yes","skip","cancel"]}},timestamp:"2026-10-19T12:00:00.000Z"}];process.stdout.write(JSON.stringify(j,null,2))})' > seed/ledger-frozen-pending.json
  ```

  The wrapper header's args list also gains `--commit`, `--late-exec`, `--auto-seed`, `--walk`, `--again`, `--quality`. `otherFiles` (es2) is `fs.readdirSync(execDir).filter(f => !/^execute-/.test(f))`, next to `execFiles`. `walk()` answers only `confirm_*`, `review_gate` and `execute_tier`; no planned case walks through `execute_state`/`execute_gate`/`execute_handoff`.

  For `--late-exec`, the handoff case copies `seed/execute-<execSeed>.json` after the first call instead of before (the top-level exec-seed copy is skipped when `--late-exec` is present). `--walk` answers the remaining steps through `walk()` up to `cleanup`, so eh2 can read `data.summary`.

**Acceptance criteria:**
- [ ] New exec cases pass:
  - **pq1** (run with `--quality balanced`) `--after dispatch_execute` with `success:false` and `pendingQuestion {prompt:"Wave 1 contains high-risk task(s)…", options:["yes","skip","cancel"]}` on an interactive ledger emits `execute_gate` with the two Contract options; execute stays `in_progress`;
  - **pq2** (`--quality balanced`) `execute_gate` `yes — …` re-emits `dispatch_execute` whose args end with `--resume --auto` (each once);
  - **pq3** (`--quality balanced`) `execute_gate` `stop — …` → `done`, `ext.reason: "pending-question"`, `ext.commands` equals the two Contract commands, `ledger.paused` set;
  - **pq4** a guardrail pending question (`["override","harden","cancel"]`) → the same stop envelope directly (no `execute_gate`);
  - **pq5** a `dispatch_commit` pending question → stop with `ext.commands` equal to `["/sdlc:ship-sdlc --resume"]`;
  - **pq6** `success:false` without `pendingQuestion` → `status: "error"`, step `failed` (unchanged);
  - **eh1** ledger with execute `in_progress`, a `dispatch_execute` history entry with `pendingQuestion` and no execute state file → `--after confirm_pipeline` emits `execute_handoff`;
  - **eh2** `finished` with no state file → execute `completed`, `o.ledger.history.find(h => h.step === 'execute_handoff').source === "user-attested"`, and the next step is `stage_changes`; a later `cleanup` emission's `data.summary.steps` has `{name:"execute", status:"completed", source:"user-attested"}`;
  - **eh3a/eh3b** `finished` with an execute state file (copied after the handoff is emitted) whose planned tasks are all accounted → completed, no `source` (eh3a); with a missing task → `status: "error"`, execute `failed`, and `calls[1].exitCode === 65` (L27; eh3b);
  - **eh4** `not finished` → stop envelope with both commands;
  - **eh5** (`--quality balanced`) the same ledger with an execute state file present → no `execute_handoff`; `dispatch_execute` args end with `--resume`;
  - **eh6** a `flags.auto` ledger never emits `execute_handoff`;
  - **eh7** idempotency: after `finished` (execute `completed`), a second `--after confirm_pipeline` on the same ledger emits neither `execute_handoff` nor `dispatch_execute`.
- [ ] The exec run with `--filter-pattern "ship-step"` passes every case.

### Task 7: SKILL.md Step 5 dispatch and reference.md

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** lint

**Findings:** F-ship-docs-spec-skill-dispatch-text-1, -2; F-ship-confirm-step-stepper-transitions-21

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 2 table execute row, `--auto` audit table, Step 5 items 2 and 5, Step 6 note, example decisions-log line.
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — the "Dispatch pipeline step Agents without `model: step.model`" bullet.
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — update the stale case "ship-sdlc (issue #366): non-execute step with dispatchMode=agent invokes via Agent tool"; add two cases for the pending-question mapping and stop path (dataset edit only; behavioural runs stay owner-initiated).

**Notes:** The spec lines this task implements (R-subagent-brief, C16, P7, P-TRANS-1 rows) are already amended by the specs plan, which ships first (ruling w2-specfirst). Must-not-touch: Steps 1-4 except the two named table rows, the ancestry gate, the cleanup-contract text, and the pr row `` `--auto --draft` `` at :197 (the behavioural case reads that example). After the edit `wc -l SKILL.md` stays within ±15 of 389.

**Contract:**
- shape (docs): Step 5 item 5 `dispatch_*` line, before → after:

  ```diff
  -   - `dispatch_*`: `Agent(subagent_type: "general-purpose", model: step.data.model, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>\nInvoke the skill with the Skill tool and return a structured result:\n(1) status … (2).")`, adding `effort: step.data.effort` only when `step.data.effort` is present (likewise `isolation: step.data.isolation`, R-agent-isolation-script-driven). Take `(1)–(4)` from the return into `output` and the token counts the Agent return reports into `output.usage` (`{"source":"unavailable"}` when the harness exposes none; never estimate). (R-subagent-brief)
  +   - `dispatch_*`: `Agent(subagent_type: step.data.agent, prompt: "<step.data.invocation>\nBranch: <branch>\nPrior results: <one line>")`, adding `isolation: step.data.isolation` only when it is present (R-agent-isolation-script-driven). The agent file preloads the skill, pins its model, and carries the unattended brief and the return items (R-subagent-brief). Take `(1)–(4)` from the return into `output` and the token counts the Agent return reports into `output.usage` (`{"source":"unavailable"}` when the harness exposes none; never estimate). When (1) is failure and (4) names a question the sub-skill could not ask, set `output.pendingQuestion` to `{"prompt": "<the question>", "options": ["<option keyword>", …]}` using the option keywords the sub-skill listed.
  ```

  (The old line is located by `command grep -F '`dispatch_*`: `Agent(subagent_type: "general-purpose"' SKILL.md | wc -l` = 1 and replaced whole.)

  New family line, inserted directly after the `branch_prepare` bullet of item 5:

  ```markdown
     - decision steps (`confirm_*`, `execute_tier`, `execute_state`, `execute_gate`, `execute_handoff`): nothing to run; the answer from item 4 is the result (`success: true`, `output.answer`).
  ```

  Item 2, the `status === "done"` sentence:

  ```diff
  - `cancel`, `paused` or `dry-run` → stop and print the reason;
  + `cancel`, `paused` or `dry-run` → stop and print the reason; `pending-question` → print `ext.pendingQuestion.prompt` with its options, then each line of `ext.commands` in order, and stop;
  ```

  Step 2 table execute row (:191):

  ```diff
  - | 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` if user passed `--quality` to ship | no |
  + | 1 | execute-plan-sdlc | will_run | `--plan "<path>"` (from `context.planFile`, R-PLANFILE), plus `--quality <X>` from `--quality` or, in interactive runs, the `execute_tier` answer | no |
  ```

  `--auto` audit table under `### --auto Mode Audit` (header row `| Sub-skill | --auto support | Behavior when ship runs with --auto |`; each row located by its first cell, exactly once). The header and the review-sdlc row stay:

  ```diff
  - | execute-plan-sdlc | Yes | `--auto` forwarded so the plan-hash mismatch branch is non-interactive. Forwards `--quality <X>` only when the user explicitly passed `--quality` to ship; otherwise no quality flag is forwarded and execute-plan-sdlc applies its own selection logic. (Renamed from `--preset` in #190 to disambiguate from ship's step-selection semantics.) |
  + | execute-plan-sdlc | Yes | `--auto` forwarded only when ship runs with `--auto` (`--quality` then required). In interactive runs ship asks the tier (`execute_tier`) and about an existing execute state file (`execute_state`) before dispatch; a high-risk question comes back as a pending question (`execute_gate`). (Renamed from `--preset` in #190 to disambiguate from ship's step-selection semantics.) |
  - | commit-sdlc | Yes | `--auto` forwarded. Skips commit approval prompt. |
  + | commit-sdlc | Yes | `--auto` always forwarded. Skips commit approval prompt; interactive runs ask `confirm_commit` / `confirm_commit_fixes` first. |
    | review-sdlc | No | No interactive prompts to skip — runs fully automatically already. |
  - | received-review-sdlc | Yes | `--auto` forwarded. Skips Step 10 consent prompt and Step 12 reply/resolve prompt. Critique gates and verification still run. Only "will fix" items auto-implemented; threads for "will fix" items auto-resolved. |
  + | received-review-sdlc | Yes | `--auto` always forwarded. Skips Step 10 consent prompt and Step 12 reply/resolve prompt; interactive consent is `review_gate` (or `confirm_received_review` when `review_gate` did not ask). Critique gates and verification still run. Only "will fix" items auto-implemented; threads for "will fix" items auto-resolved. |
  - | version-sdlc | Yes | `--auto` forwarded. Skips release plan approval prompt. Pre-condition checks and critique gates still run. |
  + | version-sdlc | Yes | `--auto` always forwarded. Skips release plan approval prompt; interactive runs ask `confirm_version` first. Pre-condition checks and critique gates still run. |
  - | pr-sdlc | Yes | `--auto` forwarded. Skips PR approval prompt. |
  + | pr-sdlc | Yes | `--auto` always forwarded. Skips PR approval prompt; interactive runs ask `confirm_pr` first. |
  ```

  The header row stays unchanged; the rows now also state the interactive behaviour.

  Step 6, a sentence after the report block's closing fence: "An `execute` row whose summary entry has `source: "user-attested"` is reported as `[done] finished outside the pipeline (user-attested)`."

  Example decisions-log line (:335):

  ```diff
  -  - Steps resolved: [execute, commit, review, archive-openspec, pr] (from config default; --quality not forwarded to execute-plan-sdlc — user did not pass --quality)
  +  - Steps resolved: [execute, commit, review, archive-openspec, pr] (from config default; --quality balanced forwarded to execute-plan-sdlc — chosen at execute_tier)
  ```

  reference.md :39:

  ```diff
  - - Dispatch pipeline step Agents without `model: step.model` — the model field is computed by skill/ship.js from each skill's spec. Omitting it defaults all steps to opus.
  + - Dispatch pipeline step Agents with any other `subagent_type`, or with `model`/`effort` parameters. Dispatch with `subagent_type: step.data.agent`; the agent file pins model and effort.
  ```

  Behavioural dataset (`ship-sdlc.yaml`), case "ship-sdlc (issue #366): non-execute step with dispatchMode=agent invokes via Agent tool":

  ```diff
  -      The prepare script output includes a `commit-sdlc` step with `dispatchMode: 'agent'`,
  -      `model: 'haiku'`, `isolation: null`, and `status: 'will_run'`. Walk through what
  +      The step envelope is a `dispatch_commit` step whose data has `agent: 'sdlc:ship-step-commit'`,
  +      `model: 'haiku'`, `effort: 'low'`, `isolation: null`, and `status: 'will_run'`. Walk through what
  ...
  -    - type: icontains
  -      value: "model"
  +    - type: icontains
  +      value: "sdlc:ship-step-commit"
  ...
  -        ship-sdlc Step 5 dispatches the commit-sdlc step as an Agent (Agent tool)
  -        with model: step.model ('haiku') and no isolation parameter (since
  -        step.isolation is null). The response cites dispatchMode === 'agent' as
  -        the reason. It does NOT use the Skill tool for this step.
  +        ship-sdlc Step 5 dispatches the commit-sdlc step as an Agent (Agent tool)
  +        with subagent_type: step.data.agent ('sdlc:ship-step-commit'), no model or
  +        effort parameter (the agent file pins them) and no isolation parameter (since
  +        step.data.isolation is null). It does NOT use the Skill tool for this step.
  ```

  New cases, appended after the issue #366 block, mirroring its vars:

  ```yaml
  - description: "ship-sdlc: pending question from a sub-agent is recorded as output.pendingQuestion"
    vars:
      skill_path: "plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md"
      project_context: "file://fixtures/ship-pipeline-ready.md"
      user_request: >
        The dispatch_execute agent returned: (1) failure (4) "Stopped before Wave 2: Wave 2
        contains high-risk task(s). Approve execution? Options: yes | skip | cancel".
        What result does ship-sdlc write for the --after dispatch_execute call?
    assert:
      - type: icontains
        value: "pendingQuestion"
      - type: llm-rubric
        value: >
          The result file has success false and output.pendingQuestion with a prompt and the
          options ["yes","skip","cancel"] (the option keywords). ship-sdlc does not ask the
          user itself here; ship.js decides the next step from the result.

  - description: "ship-sdlc: pending question stop prints the question and both continue commands"
    vars:
      skill_path: "plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md"
      project_context: "file://fixtures/ship-pipeline-ready.md"
      user_request: >
        ship.js returned status "done" with ext.reason "pending-question",
        ext.pendingQuestion {"prompt":"Wave 2 would violate guardrail no-scope-creep. Override?",
        "options":["override","harden","cancel"]} and ext.commands
        ["/sdlc:execute-plan-sdlc --plan \"/abs/plan.md\" --resume", "/sdlc:ship-sdlc --resume"].
        What does ship-sdlc do?
    assert:
      - type: icontains
        value: "/sdlc:execute-plan-sdlc --plan"
      - type: icontains
        value: "/sdlc:ship-sdlc --resume"
      - type: llm-rubric
        value: >
          ship-sdlc prints the pending question with its options, then the two commands in
          order, and stops; it does not answer the question itself and does not dispatch anything.
  ```

- names: `step.data.agent`, `output.pendingQuestion`, `ext.commands`, `pending-question`.
- mirror: existing item 5 family bullets (`stage_changes, …: run each command …`).
- decisions: ruling w2-preplan items 3 and 5 (no Skill-tool re-invoke; prompt = arguments + Branch/Prior results); w2-pending item 3 (SKILL.md fills `pendingQuestion`).
- sync: Task 6 envelope fields; the specs plan (R-subagent-brief, C16, P7).

**Acceptance criteria:**
- [ ] `command grep -c "effort" plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`.
- [ ] `command grep -c 'general-purpose\|Invoke the skill with the Skill tool\|step.data.model' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`.
- [ ] `command grep -c 'R-subagent-brief' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` ≥ 1.
- [ ] `command grep -F 'Omitting it defaults all steps to opus.' plugins/sdlc-utilities/skills/ship-sdlc/reference.md | wc -l` prints `0`, and `command grep -F 'Dispatch with `subagent_type: step.data.agent`; the agent file pins model and effort.' … | wc -l` prints `1`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` reports no new finding for ship-sdlc (compare with a run at base before editing).
- [ ] `command grep -c 'model: step.model' tests/promptfoo/datasets/ship-sdlc.yaml` prints `0`; `command grep -c 'ship-sdlc: pending question' tests/promptfoo/datasets/ship-sdlc.yaml` prints `2`.

### Task 8: Architecture, best-practices and ship user docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7
**Verify:** manual

**Findings:** F-ship-docs-spec-skill-dispatch-text-4, -5, -8, -10

**Files:**
- Modify: `docs/skill-best-practices.md` — the :404 sentence.
- Modify: `docs/architecture.md` — one sentence after the Cost Tiers paragraph.
- Modify: `docs/skills/ship-sdlc.md` — `--auto` and `--quality` flag rows; one paragraph in "How the Pipeline Works".

**Notes:** Audience: users and plugin authors. The executor runs `node site/scripts/copy-docs.mjs` afterwards and commits its output separately (not a task). Must-not-touch: the rest of each file, including the long sample output in `docs/skills/ship-sdlc.md` "What Gets Printed" (an `--auto` run, still accurate).

**Acceptance criteria:**
- [ ] `command grep -F 'The harness does not support frontmatter-driven context forking for skills.' docs/skill-best-practices.md | wc -l` prints `0`, and the replacement sentence occurs once.
- [ ] `command grep -F 'ship pipeline steps dispatch via `agents/ship-step-*.md`, which pin model and effort.' docs/architecture.md | wc -l` prints `1`.
- [ ] `command grep -c 'execute_tier' docs/skills/ship-sdlc.md` ≥ 1; `command grep -c 'confirm_' docs/skills/ship-sdlc.md` ≥ 1.

**Contract:**
- shape (docs):

  ```diff
  - The harness does not support frontmatter-driven context forking for skills. To achieve context isolation (protecting the main conversation from intermediate output), use the `Agent` tool dispatch pattern in the skill body:
  + Skills may run in a forked context via `context: fork` + `agent:` frontmatter; the plugin uses per-step agent files for ship so model, effort and tools are declared, not narrated. To achieve context isolation (protecting the main conversation from intermediate output), use the `Agent` tool dispatch pattern in the skill body:
  ```

  (Only the first sentence is replaced; the rest of the line and the list after it stay.)

  architecture.md — appended as its own line after the paragraph that starts "Each skill and orchestrator agent pins a `model:`":

  ```markdown
  The ship pipeline steps dispatch via `agents/ship-step-*.md`, which pin model and effort.
  ```

  (Item Change 6 text, with a leading "The " for a sentence start; the acceptance grep matches the lower-case substring.)

  docs/skills/ship-sdlc.md flag rows, new text:

  | Flag | Description (new) |
  |---|---|
  | `--auto` | Non-interactive mode. No question is asked: `--auto` is forwarded to execute-plan-sdlc, and commit-sdlc, received-review-sdlc, version-sdlc and pr-sdlc always run with `--auto`. `--quality` is required. (keep the row's existing default cell) |
  | `--quality <full\|balanced\|minimal>` | Forwarded to execute-plan-sdlc as `--quality` (model tier). In interactive runs without `--quality`, ship asks for the tier (`execute_tier`) before execute and forwards the answer; it never picks a tier itself. |

  In the same `--quality` row, the default cell `Not forwarded` becomes `Not set (asked in interactive runs)`.

  New paragraph, after the "A script sequences the pipeline…" paragraph:

  > Each sub-skill runs in its own agent (`agents/ship-step-<step>.md`), which sets its model and effort. A sub-agent cannot ask you anything, so in interactive runs ship asks first, in the main conversation: `confirm_commit`, `confirm_commit_fixes`, `confirm_version` and `confirm_pr` (yes, skip or cancel), and the review gate for received-review. It also asks for the execution tier (`execute_tier`) and about an existing execute state file (`execute_state`). The sub-skill then runs with `--auto`, so its own previews (commit message, changelog draft, PR body, fix plan) are not shown. If execute stops at a question ship cannot answer for it, ship stops, keeps its state, and prints the two commands to continue: `/sdlc:execute-plan-sdlc --plan <plan> --resume`, then `/sdlc:ship-sdlc --resume`. On that resume ship asks whether execute finished outside the pipeline (`execute_handoff`).

- names: decision ids; agent path pattern.
- mirror: existing paragraphs of "How the Pipeline Works" (docs/skills/ship-sdlc.md:86-88).
- decisions: item Change 4 and 6 texts verbatim for the two named sentences.
- sync: `site/src/content-source/**` regenerated by the executor's copy-docs run.

### Task 9: W4.3 verification and Done-when

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3, Task 8
**Verify:** tests

**Findings:** F-cost-tier-validator-and-exec-fixtures-4, -11; F-execute-state-resolver-and-plugin-validate-5

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` (run only)
- Test: `tests/promptfoo/datasets/validate-cost-tiers-exec.yaml` (run only)

**Notes:** Runs W4.3's Verification and Done-when as written, with the S1 = NO branch (effort count 0 satisfies ≤ 1, ruling w2-preplan item 3). The single behavioural case is not run inside this plan. It is the LAST check, after both ship runs and after copy-docs, run once with no rerun: "ship-sdlc: pr step invocation uses computed args from ship-prepare.js, not SKILL.md example args" (ship-sdlc.yaml:290), via `cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m4 npx --yes promptfoo@0.123.1 eval -c promptfooconfig.yaml --filter-pattern "ship-sdlc: pr step invocation uses computed args" --no-cache`. If a check fails, report it; the fix goes back to the task that owns the file (no run-fix-rerun loop).

**Acceptance criteria:**
- [ ] `ls plugins/sdlc-utilities/agents/ship-step-*.md | wc -l` prints `6`, and each has `model:` and `effort:` (`command grep -L '^effort:' plugins/sdlc-utilities/agents/ship-step-*.md | wc -l` prints `0`).
- [ ] `command grep -n "model: '" plugins/sdlc-utilities/scripts/skill/ship.js` shows only inline-step lines (archive-openspec ×3, learnings-commit, cleanup).
- [ ] `command grep -c "effort" plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` prints `0`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root "$PWD" --strict; echo exit=$?` → `exit=0`, no finding lines; §4 has 11 rows.
- [ ] `claude plugin validate plugins/sdlc-utilities; echo exit=$?` → `exit=0`.
- [ ] From `tests/promptfoo`, with the shared env prefix: `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-prepare|ship-step|validate-cost-tiers" --no-cache` → every selected case passes.
- [ ] Consumer sweep: `command grep -rn "step.data.model\|step\.model\|general-purpose" plugins/sdlc-utilities/skills/ship-sdlc docs/skills/ship-sdlc.md` prints nothing.
- [ ] `git status --porcelain` lists only files named in Tasks 1-8 (plus `site/src/content-source/**` after copy-docs).

**Contract:**
- shape (code): no new code; commands and expected results as listed.
- names: filter pattern `ship-prepare|ship-step|validate-cost-tiers`.
- mirror: W4.3 Verification and Done-when (plan source lines 44, 46).
- decisions: S1 = NO Done-when branch.
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 4-6 (ship.js) add exec cases cf1-8, et1-3, es1-3, pq1-6, eh1-7 and update the named stale cases; Task 3 extends the validator fixture; Task 7 updates the stale behavioural case and adds two pending-question cases (dataset edits; runs stay owner-initiated) |
| no-ci-bypass | error | PASS | no CI step skipped; Task 9 runs the strict validator and plugin validate |
| no-auto-eval | error | PASS | exec config only, with `--filter-pattern`; the behavioural case runs once after ship (executor); no run-fix-rerun loop |
| skill-docs-required | error | PASS | no new SKILL.md; the six files are agents |
| no-scope-creep | warning | PASS | every task traces to W4.3 or a binding ruling; W4.4-W4.6 and execute `--answer` are non-goals |
| single-responsibility-tasks | warning | WARN | Task 6 keeps pending detection, `execute_gate` and `execute_handoff` together because they share `runAfter` state; rationale in its Notes |
| scripts-over-llm-logic | error | PASS | agent fields, consent steps, tier freeze, restart, pending routing live in `ship.js`; SKILL.md only dispatches and maps (4) into `output.pendingQuestion` |
| yagni | warning | PASS | every helper has a caller; tier options are the three Q15 names |
| cross-skill-consistency | error | PASS | sub-skill SKILL.md untouched; forked sub-skills get `--auto`, which they support; the specs plan carries spec consequences |
| pr-link-github-issue | error | PASS | local todo 9003, no GitHub issue (W2-P8); commit subject carries it |
| dry | warning | PASS | `runCompletenessGate` shared; one `stepAgent()`; six agent bodies identical by design (Task 2 check) |
| kiss | warning | PASS | no schema change, no new flag; each piece is demanded by a ruling |
| spec-first | error | PASS | the specs plan (`docs/plans/2026-10-19-m4-w2-ship-agents-specs.md`) ships FIRST and carries every spec edit, so the spec precedes the SKILL.md change of Task 7 (ruling w2-specfirst) |
| project-agnostic | error | PASS | behaviour lives in plugin code; repo edits are plugin docs and fixtures |
| flag-coherence-cross-skill | error | PASS | decision sites read `ledger.flags.auto`/`flags.quality`; SKILL.md gates on `step.data.*` |
| no-opposite-logical-vectors | error | PASS | the interactive gate is `!flags.auto` at every new site |
| flag-resolution-single-source | warning | PASS | `--quality` resolves in `mergeFlags`; the `execute_tier` answer is frozen once |
| state-premise | error | PASS | Key Decisions "Problem in one sentence" |
| smallest-viable-cut | warning | PASS | Key Decisions "Smallest cut" |
| failure-audience | warning | PASS | Key Decisions "Who fails if this ships wrong" |
| explicit-non-goals | warning | PASS | Key Decisions "Non-goals" |
| ambiguity-stops-and-asks | error | PASS | alternatives recorded in Key Decisions; open points settled by rulings w2-preplan, w2-pending, w2-handoff, stop-1 |
| state-machine-idempotency | error | PASS | run-twice cases et2, es3, eh7 and cf4 (cancel then resume) |
| agent-dispatch-script-driven | error | PASS | dispatch uses `step.data.agent` (+ `isolation` when present); args come from `ship.js` |
| flag-semantic-consistency-cross-skill | error | PASS | no new prepare-script flag; the wrapper's `--quality` is test tooling |
| workspace-mode-compatibility | error | PASS | Key Decisions "Workspace modes"; state reads via `readState` keyed by `ledger.branch` |
| prompt-cache-hit-ratio | warning | PASS | static agent bodies; volatile values stay in the task message |

## Suggested Review Dimensions

Advisory (G17); not plan tasks — the owner may apply them separately.

### UPDATE: runtime-contract (U2, B1, B4)

**Why:** The plan's largest change is `plugins/sdlc-utilities/scripts/skill/ship.js` (Tasks 4-6), but runtime-contract triggers `**/scripts/*.js`, which does not match the nested `scripts/skill/` path.

**Severity hint:** high

**Patch:** Add the trigger `**/scripts/**/*.js` to `.sdlc/review-dimensions/runtime-contract.md`, and a checklist item on step-emitter decision ids and `pendingQuestion` agreement between ship.js and SKILL.md. Regenerate `.github/instructions/runtime-contract.instructions.md`.

### UPDATE: hook-readiness (U2)

**Why:** `scripts/skill/ship.js` is outside hook-readiness's `**/scripts/*.js` trigger.

**Severity hint:** medium

**Patch:** Widen the trigger to `**/scripts/**/*.js` in `.sdlc/review-dimensions/hook-readiness.md`.

## Verification Scorecard

Iteration 3 of 3 (final review round; merged re-dispatch of 5 critique lanes + 3 lens reviewers, Sonnet reviewing an Opus-authored plan).

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 4 | requirements lens: all 14 covered |
| Correctness | 1 | 1 | 1 | architecture lens: approved |
| Coherence | 0 | 0 | 0 | — |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Task(s) | Status |
|---|---|---|
| 1 six agent files, `skills: [sdlc:<skill>]`, C16 body | 1, 2 | covered |
| 2 computeSteps reads agent files; `agent`/`effort` in dispatch data | 4 | covered |
| 3 SKILL.md Step 5 `subagent_type` only; reference.md :39 | 7 | covered |
| 4 cost-tiers §4/§5, best-practices :404, architecture | 3, 8 | covered |
| 5 `confirm_<step>`, review_gate consent, yes/skip/cancel | 5 | covered |
| 6 `execute_tier` (Q15) | 5 | covered |
| 7 `execute_state` resume/restart | 5 | covered |
| 8 `pendingQuestion`, `execute_gate`, stop path | 6, 7 | covered |
| 9 `execute_handoff` | 6 | covered |
| 10 promptfoo cases and fixtures | 3-7 | covered |
| 11 user docs and SKILL.md tables | 7, 8 | covered |
| 12 spec consequences | companion specs plan | covered |
| 13 must-not-touch | shared rules | covered |
| 14 W4.3 Verification and Done-when | 9 | covered |

Iteration-3 findings and their state:
- CRITICAL (risk lens) — eh5 lacked `--quality balanced`, so `execute_tier` would precede `dispatch_execute`: **fixed after iteration 3 (not re-reviewed; review cap reached)**.
- WARNING (risk lens) — `--late-exec` had no code: fixed after iteration 3 (code rendered).
- WARNING (risk lens) — the unparseable-verdict case's `gate.llm_decision` assertion is stale: fixed after iteration 3 (stale-case row names the replacement).
- `spec-first` (guardrail lane): resolved by order — the specs ship run goes first (ruling w2-specfirst); re-checked by the guardrail lane after the reorder.
- SUGGESTIONs — wrapper header args, `otherFiles` definition, `walk()` scope, `frozen-pending` seed mechanism: addressed after iteration 3.

Verdict (iteration 3, as reviewed): *"…Fix before archiving."* — the one CRITICAL was fixed afterwards but has not been re-reviewed.

## OpenSpec Appendix

Not applicable — no OpenSpec change

## Contract Examples

**code** (taken from Task 4):

```markdown
**Contract:**
- shape (code): `stepAgent(file: string): { agent: string, model: string, effort: string }` in `scripts/skill/ship.js`, cached per process; throws when the agent file or its model/effort is missing; each agent step object spreads `...stepAgent('<file>')` in place of its `model:` literal.
- names: `stepAgent`, `stepAgentCache`, `AGENTS_DIR`; step fields `agent`, `effort`.
- mirror: `require(path.join(LIB, '…'))` imports at ship.js:43-57.
- decisions: Key Decisions "Agent fields come from the agent files".
- sync: `validate-cost-tiers.js`; `docs/cost-tiers.md` §4; SKILL.md Step 5.
```

**docs** (taken from Task 1):

```markdown
**Contract:**
- shape (docs): one agent file per step with frontmatter `name, description, model, effort, skills: [sdlc:<skill>]` and the three-paragraph body (follow line, C16 brief, return contract; arbiter ruling m9).
- names: `ship-step-execute`, `ship-step-commit`, `ship-step-review`.
- mirror: `agents/commit-orchestrator.md` frontmatter, minus `tools:`.
- decisions: RULING stop-1 (namespaced `skills:`); reading 1 (corrected C16).
- sync: Task 2 files; Task 3 §4 rows.
```
