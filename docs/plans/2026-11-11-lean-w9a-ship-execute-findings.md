# Lean w9a Ship and Execute Findings Implementation Plan

**Commit:** `fix(#9358): ship - final fix review, plan bump, worker guards`
**Goal:**
- Close eight lean-ledger findings from waves w1 to w8b in ship-sdlc, execute-plan-sdlc and plan-sdlc: F-50, F-38, F-37, F-46, F-11/F-40, F-45, F-30 and F-48 (owner-approved scope addition, 2026-11-11).
- Drop F-29 and F-39 with evidence: they no longer reproduce as plugin defects at HEAD f4862bb.
- Every behaviour change is written into the spec first (ship R95 to R98, execute R88 amended, R89 to R91, plan-sdlc R70) and gets exec test cases.
**Architecture:** The root problem is that some ship and execute contracts hold only as prose, or not at all, so an unattended run breaks them without any signal: the last fix commit of a review loop reaches the PR unreviewed, a feat wave is released as a patch, a step agent commits its own fix, and workers pick their own tool versions and write files through the shell. The fix moves each contract into a deterministic place: `skill/ship.js` (one review of the final fix commit, the bump from the plan's commit type, adoption of a self-made fix commit), `state/execute.js` (task ids in the wave-watch line, a `## Verification` section in each fact sheet taken from the plan file), a new PreToolUse hook that denies shell file writes to execute workers, and the agent, ship, execute and plan-sdlc text where only prose can act (dropping stale hand-backs, F-48).
**Source:** lean w9a brief (session scratchpad `w9a-plan-brief.md`) and owner-approved F-48 addition; ledger `.sdlc/orchestration/lean/findings.jsonl`; discovery brief (session temp `discovery-brief.md`)
**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js && node .claude/skills/validate-skill-docs/check-docs-consistency.js && node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict && node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js && node plugins/sdlc-utilities/scripts/ci/validate-discovery.js`, then the targeted exec run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "<pattern>"` with the pattern each task names (Task 6 uses `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- With review rounds, the fix commit of the last round is never reviewed. In PR #76 that commit (263a3f3) broke spec P7 and repeated ledger finding F-49 (F-50).
- Under ship, the received-review step agent once committed its fix by itself. Ship then skipped commit-fixes. The round-2 review agent handed back an interim summary instead of its result (F-38).
- When `--bump` is not given, ship always releases a patch. PR #71 was a `feat` wave and was released as v0.49.1 (F-37).
- The wave monitor line says `5/5 tasks done` but not which tasks. The main session cannot map progress to plan tasks (F-46).
- Execute workers still edit files with `sed -i`, node scripts and `cp`, although their agent text bans it (F-11, F-40).
- Workers ran promptfoo 0.125.1 instead of the 0.123.1 pin. The pin was only in the plan header, which never reaches a worker (F-45).
- `--strict-files` failed a fixture a task needed, because the plan did not list it under that task's Files; the worker wrote a weaker test (F-30).
- Finished execute agents, wave runners and step agents re-deliver stale hand-back reports to the ship session, sometimes long after their result was recorded; each one costs a turn (F-48, lean-w8b and lean-w4). The delivery itself is Claude Code harness behaviour, reported upstream; the plugin can only make its sessions ignore such reports.

**What prompted this change now?**

- These findings were recorded in the lean ledger while waves w1 to w8b ran with ship-sdlc and execute-plan-sdlc. Several recurred (F-46 three times, F-40 twice).
- The owner added F-48 to this wave on 2026-11-11 ("yes, add it to 9a"), as about one task.

**What does success look like?**

- A ship run whose final review round made a fix commit reviews that commit once more, with no further fix loop, and the summary shows the verdict.
- A plan with a `feat` commit subject is released as a minor version when `--bump` is absent.
- A received-review commit made by the step agent is adopted as the commit-fixes commit, with a warning.
- The wave-watch line names the task ids of the wave.
- Each fact sheet carries the plan's verification commands verbatim.
- An execute worker that tries `sed -i` or a heredoc redirect is denied by a hook.
- plan-sdlc lists every file a task creates, fixtures included, under that task's Files.
- A stale hand-back for a step or wave already recorded is dropped in one line, with no dispatch, record or re-run.

**Re-verification at HEAD f4862bb.**

| Item | Status | Evidence |
|---|---|---|
| F-50 | reproduces | `plugins/sdlc-utilities/scripts/skill/ship.js:2654-2672`: the loop restarts only while `round < flags.reviewRounds`; after the last commit-fixes, `pickNextStep` goes to version/pr. Spec R84 (`docs/specs/ship-sdlc.md:207`) is silent on it (F-ship-review-loop-and-step-agent-rules-1, -2). |
| F-38 | reproduces | `plugins/sdlc-utilities/agents/ship-step-received-review.md:11-13` and `ship-step-review.md:11-13` have no hand-back rule and no commit ban; only `ship-step-execute.md:13` has one (-4, -5). `ship.js:1876-1880` skips commit-fixes on a clean tree, so a self-commit ends the loop (-3). |
| F-37 | reproduces | `ship.js:648-651` builds `--bump ${flags.bump \|\| 'patch'}`; `planSubject` is already parsed at `ship.js:3142` (F-ship-js-bump-learnings-progress-1, -4). |
| F-46 | reproduces | `plugins/sdlc-utilities/scripts/state/execute.js:1385-1387` prints only counts (F-ship-js-bump-learnings-progress-12). |
| F-11 / F-40 | reproduces | The R87 ban is in all three worker agents since bbd3e85 (2026-11-05), yet w1, w6 and w7 broke it. No hook inspects Bash commands (F-execute-worker-write-and-factsheet-1, -4). |
| F-45 | reproduces | `plugins/sdlc-utilities/scripts/lib/task-factsheet.js:31-114` renders no verification; the w8a plan had the pin only in its header `**Verification:**` (`docs/plans/2026-11-11-lean-w8a-validators-test-hygiene.md:12`) (-5, -6). |
| F-30 | reproduces | ship always forwards `--strict-files` (R83); plan-sdlc has no rule that a created fixture is listed under Files (-7, -8). |
| F-48 | mitigated | No ship or execute text says what to do with a hand-back for a step already recorded: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:262-278` (Step 5 loop) and `skills/execute-plan-sdlc/SKILL.md:383` / `wave-runner-template.md:84` (R86) cover only waiting, not late reports. Root cause is harness delivery (out of the plugin's reach); the plan adds the drop rule. |
| F-29 | dropped | Fixed by #9347/#9349: execute R86 (`agents/ship-step-execute.md:13`, "Return only once, at a terminal point") and ship R93 (`docs/specs/ship-sdlc.md:372`, mid-wave hand-back stops through the pending-question path). The ledger has no recurrence after lean-w2. The rest is harness behaviour: a background subagent returns when its turn ends (F-ship-review-loop-and-step-agent-rules-6). |
| F-39 | dropped | learnings-commit is skipped by design: spec R36 (`docs/specs/ship-sdlc.md:223`, `ship.js:2139-2147`) skips it when `.sdlc/learnings/log.md` is git-ignored, and this repo ignores it (`.sdlc/.gitignore:3`, `*`). The Stop-hook noise is bounded by `STOP_BLOCK_CAP = 3` per step (`plugins/sdlc-utilities/hooks/stop-pipeline-continue.js:59`); the blocks come from the harness ending the main turn while a background step agent runs, which the plugin cannot change (F-ship-js-bump-learnings-progress-8). |

**PR body.** The `## Github Issue` section names tracking id #9358 and the ledger ids. #9358 is an internal tracker id, not a GitHub issue, so the body uses no `Fixes`/`Closes` keyword (same rule as PR #75).

## Research Findings

- **Ship stepper.** `skill/ship.js` is a step emitter: prepare writes a ledger, and every `--after <step> --result-file <f>` call records one step and emits the next. The review loop lives in the `--after` handler (`ship.js:2654-2672`). The next step is picked by `pickNextStep`. Steps are recomputed on every call with `computeSteps(flags, flags.sources, ctx)` (`ship.js:2381-2387`).
- **Bump.** `mergeFlags` resolves `bump` CLI > config `ship.bump` > default (`ship.js:290-301`). R63 then lets `version.preRelease` override a non-CLI value (`ship.js:2852-2864`). The plan's `**Commit:**` subject is read by `readPlanCommitSubject` in prepare (`ship.js:3142`) and in `--after` (`ship.js:2357`).
- **Review scope.** `review.js` accepts `--committed --base <ref>`; the committed scope diffs `git diff <base>...HEAD` (`plugins/sdlc-utilities/scripts/lib/git.js:236-240`). A base equal to the commit before the fixes reviews only the fix commit.
- **Wave watch.** `cmdWaveWatch` reads `data.waves[].tasks[]` with `{ id, status }` (`state/execute.js:1356-1393`). Its exec cases are in `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml:98-129`.
- **Fact sheets.** `wave-start --tasks-json` writes one fact sheet per task (`state/execute.js:381-415`). The state file records `planPath` at `init` (`state/execute.js:284`). `lib/plan-parse.js` `parsePlan` already extracts the header `verification` (`plan-parse.js:204`) and each task's `verify` field (`plan-parse.js:160`).
- **Hooks.** `hooks/hooks.json` has a PreToolUse entry for `AskUserQuestion` only. `block-askuserquestion-auto.js` shows the deny output shape (`permissionDecision: "deny"`). Hook exec cases run through `tests/promptfoo/promptfooconfig-exec-hooks.yaml` with the `hook-runner` provider.
- **Sentinels.** `tests/promptfoo/scripts/check-handback-sentinels.js` checks agent and skill text for required sentences; its case is `execute-plan-sdlc/handback:` in `execute-plan-sdlc-dispatch-resilience-exec.yaml:13`.
- **Site copies.** `site/src/content-source/specs/*.md` and `site/src/content-source/skills/*.md` are byte copies of `docs/specs/*.md` and `docs/skills/*.md` (`cmp` exit 0 today).
- **Free spec ids.** ship: R95 onward (highest R94). execute-plan-sdlc: R89 onward (highest R88). plan-sdlc: R70 onward (highest R69). No withdrawn id in that range.
- **Commands.** Validators and the exec command are in the header `**Verification:**`. Exec tests need no LLM.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| F-29 dropped | no | no change | Fixed by R86/R93 in #9347/#9349; no recurrence; the residue is harness behaviour (Context table). |
| F-39 dropped | no | no change | The skip is spec R36; the Stop-hook blocks are bounded by the cap and caused by background agents (Context table). |
| F-50 also covers one review round | no | the final check runs after the last commit-fixes for any `--review-rounds` value, 1 included | With the default of one round, round-1 fixes are just as unreviewed; the finding's root is "the last fix commit", not "round 2". |
| Hook needs `agent_type` | no | the hook denies only when the PreToolUse input carries an `agent_type` that names an execute worker; without it the hook is silent | Claude Code reports `agent_type` for tool calls inside a subagent. If a harness version omits it, the hook is inert, never wrong. |
| Hook test config | no | Task 6 runs `promptfooconfig-exec-hooks.yaml`, not `promptfooconfig-exec.yaml` | Hook cases need the stdin `hook-runner` provider, which only the hooks config wires. Same command shape otherwise. |
| Prose-only tasks | no | Tasks 1, 2 and 7 run validators only: their targeted command is the validator named in their Verification line, not the exec command | No exec dataset reads plan-sdlc prose or spec text; the spec-shape and consistency validators are the check. |
| F-48 is prose only | no | ship R98 and execute R91 are skill text plus sentinel checks; no script decides "already recorded" | The ship session already holds the ledger status from its last envelope, and the execute session holds the wave status from its state calls; a new state query would add a tool call per stale report, which is the cost F-48 wants to remove. |
| `sed -i`/`cp` heuristics | no | the hook denies a fixed pattern list; `cp`, `mv` and script files run by path are not caught | A wider net would deny legitimate reads and scratch writes; see Key Decisions 6. |

## Decisions taken without the owner

1. **F-50: review the final fix commit once, no fix loop** (recommended over "stop and report unreviewed"). A review catches the regression the finding names; reporting only moves the work to the main session. Findings of that review do not start another fix round; they appear in the summary.
2. **F-50 applies to every rounds value**, including the default 1 (Deviations row 3).
3. **F-38: adopt a self-made fix commit** instead of failing the step. When HEAD moved during received-review and the tree is clean, ship records that commit as the commit-fixes commit and warns. Failing would halt an unattended run for a recoverable case.
4. **F-37: the bump comes from the plan's commit type in ship, not in version-sdlc.** version-sdlc keeps `--bump` authoritative (R-bump-flag) and its commit suggestion informational (R-bump-promote); ship already parses the plan subject. Map: `!` before `:` → major, `feat` → minor, anything else → patch.
5. **F-45: the fact sheet carries the plan header's `**Verification:**` text verbatim**, plus the task's `**Verify:**` category. No new plan field and no repo-specific pin: the plan author already writes the exact command in the header (plan-format-reference: "execute-plan-sdlc uses Verification as the default test command").
6. **F-11/F-40: a PreToolUse deny hook for worker agents**, not a PostToolUse warning. A warning arrives after the file is already written; a deny makes the worker use Edit. Scoped by `agent_type`, so the main session and other agents are never affected.
7. **F-30: a plan-sdlc authoring rule (R70), no new validator check.** A deterministic check could only guess fixture names from prose; lens checks belong to wave 9b.
8. **F-48: drop by text, check by sentinel** (Deviations row on F-48). The ship rule keys on the ledger status the session already has; the execute rule keys on the wave status in execute state.
9. **wave-watch prints ids only, no failed-id suffix.** The finding asks for task ids; the status per task is not requested (KISS).

## Key Decisions

1. **One final review instead of another round.**
   - Choice: after the last commit-fixes, emit `dispatch_review` once more with `--base <commit before the fixes>`, then skip straight to the step after commit-fixes.
   - Alternative: let `--review-rounds` loop once more. That would fix again and leave the new fix unreviewed, the same hole one level down.
   - Why: a review of a small diff is cheap; a further fix loop is not bounded.

2. **The final review is scoped to the fix commit.**
   - Choice: `--committed --base <sha>`, where `<sha>` is HEAD when received-review was dispatched (stored as `fixBaseHead` on the received-review ledger entry).
   - Alternative: review the whole branch again. That re-reviews code already reviewed and costs more.
   - Why: the finding is about the fix diff only.

3. **`fixBaseHead`, not `dispatchHead`.** The re-run guard (R80) reads `dispatchHead` and would ask a "HEAD moved" question on resume. A separate field keeps R80 unchanged.

4. **Bump precedence.** CLI `--bump` > config `ship.bump` > `version.preRelease` (R63) > plan commit type (R96) > `patch`. The plan rule fills only the gap that is `default` today, so no existing source changes meaning.

5. **Fact sheet reads the plan file itself.** `wave-start` reads `data.planPath` and parses it with the existing `parsePlan`. The LLM never copies a command into JSON, so quotes and versions cannot drift.

6. **Hook pattern list is fixed and conservative.** It denies `sed -i`/`--in-place`, `perl -i`, `awk -i inplace`, `tee` into a path, `cat >`/`>>`, heredoc redirects into a path, `python -c` with `open(`/`write_text`, and `node -e`/`--eval` with `writeFileSync`/`appendFileSync`. A redirect target under `$TMPDIR`, `/tmp/` or `/dev/` is allowed, because workers may write scratch files there.

7. **Smallest viable cut.** Each kept finding gets one deterministic fix plus its spec text. The extra pieces are justified: the ship SKILL/docs task (Task 11) is needed because the pipeline table and the summary change. The self-commit adoption (inside Task 8) serves requirement 3 directly: the commit ban in Task 4 is prose, which F-11/F-40 show agents break, and without the backstop a self-commit makes commit-fixes skip (`ship.js:1876-1880`), which also skips the new final review.

8. **Failure audience.** If this ships wrong, the user of an unattended ship run is hit: a wrong release version (Task 3), a PR with an extra or missing review (Task 8), or a worker that cannot edit a file (Task 6). Each is covered by exec cases on its own surface.

9. **Workspace modes.** No change reads or writes state outside `resolveStateDir()`. Git calls run in `resolveActiveWorktreeSafe()` as today. The hook reads only its stdin. So branch and worktree modes behave the same.

10. **Non-goals.**
    - No change to the Stop hook or to learnings-commit (F-39).
    - No change to cost tiers, models or plan-sdlc lens checks (wave 9b).
    - No PostToolUse warning hook; no enforcement of `cp`/`mv` or script files.
    - No headless, behavioural or `claude -p` run.
    - No new `**Verify command:**` plan field.
    - No script or hook that filters stale hand-backs (F-48); no change to how the harness delivers them.

## Contract Examples

### code

```markdown
**Contract:**
- shape (code): `bumpFromPlanSubject(subject: string|null): 'major'|'minor'|'patch'|null`; null for a null or unparsable subject.
- names: `bumpFromPlanSubject`, source label `plan (Commit type)`.
- mirror: the R63 override block at `plugins/sdlc-utilities/scripts/skill/ship.js:2852-2864`.
- decisions: Key Decisions 4.
- sync: spec R96 (Task 1).
- example: `bumpFromPlanSubject('feat(#1): x - y')` → `'minor'`.
```

### docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md`. `## Review rounds` gains a paragraph on the final check; the `--bump` flag row default names the plan commit type.
- names: section `## Review rounds`.
- mirror: the existing `## Review rounds` paragraph at `docs/skills/ship-sdlc.md:254`.
- decisions: user-facing prose only.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

### openspec / spec

```markdown
**Contract:**
- shape (openspec): ADD `R95` to `docs/specs/ship-sdlc.md` under `## Step composition`, after R84; numbering continues from R94.
- names: `R95` (new).
- mirror: requirement style of R84 at `docs/specs/ship-sdlc.md:207-208`.
- decisions: numeric id, next free.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy; Task 8 implements it.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks (3,4,5,6,8,9,10) carry promptfoo exec cases or sentinels and update stale cases (ship-rounds d/f, wave-watch --once); prose-only tasks are validator-checked and declared as such |
| no-ci-bypass | error | PASS | No step skips or disables CI; all validators are run |
| no-auto-eval | error | PASS | Only targeted --filter-pattern exec-config runs, no LLM provider, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Each task maps to a named ledger finding; F-29 and F-39 are dropped with evidence |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (spec set, bump, agent rules, wave-watch, hook, plan rule, final review, fact sheet, worker line, ship docs) |
| scripts-over-llm-logic | error | PASS | Logic goes into ship.js, execute.js, task-factsheet.js and a hook; plan-sdlc prose only in Task 7, where Decision 7 explains why a check is not deterministic |
| yagni | warning | PASS | No speculative parameters; exports added only if a case needs them |
| cross-skill-consistency | error | PASS | ship, execute-plan and plan-sdlc are changed together; version-sdlc --bump authority is explicitly preserved (Decision 4) |
| pr-link-github-issue | error | PASS | PR body names #9358 and documents it as an internal tracker id, so no Fixes/Closes keyword |
| dry | warning | PASS | R84 block extracted into afterFixesCommitted shared by two paths; fact sheet reuses parsePlan; worker line is a deliberate byte-identical shared sentence |
| kiss | warning | PASS | One final review, no extra fix loop; fixed conservative hook pattern list |
| spec-first | error | PASS | Tasks 1 and 2 (specs) precede every SKILL.md and behaviour task through Depends on (Task 7 -> 2, Task 11 -> 8 -> 3 -> 1) |
| project-agnostic | error | PASS | Changes ship in plugin code (scripts, hooks, agents, skills); no consumer-repo file edits |
| flag-coherence-cross-skill | error | PASS | Bump resolved in the ship prepare script and read from the frozen ledger; SKILL.md cites ext.summary.finalCheck from script output |
| no-opposite-logical-vectors | error | PASS | The 3b row gates only on ext.summary.finalCheck non-null; the bump gate is single (flagSources.bump === 'default') |
| flag-resolution-single-source | warning | PASS | bump is resolved only in prepare (CLI, config, R63, R96); downstream reads the resolved field |
| state-premise | error | PASS | Architecture states the root problem: contracts hold only as prose, so unattended runs break them silently |
| smallest-viable-cut | warning | PASS | Key Decisions 7 justifies the extra pieces; two findings are dropped |
| failure-audience | warning | PASS | Key Decisions 8 names the unattended ship user and the affected surfaces |
| explicit-non-goals | warning | PASS | Key Decisions 10 lists the non-goals |
| ambiguity-stops-and-asks | error | PASS | Decisions taken without the owner 1-7 and Key Decisions record choices with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified (Task 8 changes review-loop ledger transitions); advisory: a resume or re-run case for finalCheck and adoption would strengthen it |
| agent-dispatch-script-driven | error | PASS | Review args and invocation are emitted by ship.js; the LLM adds nothing |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag is introduced |
| workspace-mode-compatibility | error | PASS | Key Decisions 9: state via resolveStateDir(), git in the active worktree, hook reads only stdin, plan path resolved against the main worktree root |
| prompt-cache-hit-ratio | warning | PASS | New agent lines are static text; volatile values (base sha) go only in the step invocation args, not in the stable prefix |

Note for F-48 (added after the lane ran): Tasks 1, 2, 11 and 12 add prose rules R98/R91 with sentinel cases (test-coverage-required), specs first (spec-first).

## Suggested Review Dimensions

### UPDATE: hook-readiness (B1)

**Why:** Task 6 creates `plugins/sdlc-utilities/hooks/worker-write-guard.js` and adds a `Bash` matcher to `plugins/sdlc-utilities/hooks/hooks.json`, a new hook contract.

**Severity hint:** high

**Patch:** Checklist: a new PreToolUse Bash hook (`worker-write-guard.js`) must exit 0 and stay silent on every error path, scope itself by `agent_type`, and register in `hooks.json` with a short timeout.

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — Checklist: a new PreToolUse Bash hook (`worker-write-guard.js`) must exit 0 and stay silent on every error path, scope itself by `agent_type`, and register in `hooks.json` with a short timeout.

### UPDATE: runtime-contract (B1)

**Why:** Task 3 changes the `--bump` default in `plugins/sdlc-utilities/scripts/skill/ship.js` ("`feat` → minor"), and Task 5 changes the wave-watch line printed by `state/execute.js`.

**Severity hint:** high

**Patch:** Checklist: when a CLI flag default or a machine-read output line changes (`--bump` source precedence, the wave-watch `(tasks <ids>)` format), confirm the consumers (ship SKILL, exec assertions, docs) were updated.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Checklist: when a CLI flag default or a machine-read output line changes (`--bump` source precedence, the wave-watch `(tasks <ids>)` format), confirm the consumers (ship SKILL, exec assertions, docs) were updated.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (U5, U1)

**Why:** Tasks 4 and 10 edit agent prompts such as `plugins/sdlc-utilities/agents/ship-step-review.md` and the three `execute-worker*.md` files, which the current `plugins/**/scripts/**/*.js` trigger does not match.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/ship-step-review.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/ship-step-review.md`

_4 additional candidates suppressed_

## Tasks

### Task 1: Ship spec R95, R96, R97, R98

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R95, R96, R97, R98; amend A4 default and R84; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Spec first for F-50, F-37, F-38 and F-48 (F-ship-review-loop-and-step-agent-rules-1, -2, -4, -5; F-ship-js-bump-learnings-progress-1, -3, -4). It precedes Tasks 3, 4, 8, 11 and 12.

**Acceptance criteria:**
- [ ] R95, R96, R97 and R98 read as in the Contract, under `## Step composition` after R84; A4 and R84 carry the amended text.
- [ ] Appendix history table has rows `| R95 | final fix review (ledger F-50), #9358 |`, `| R96 | bump from plan commit type (ledger F-37), #9358 |`, `| R97 | review step agent rules (ledger F-38), #9358 |`, `| R98 | stale hand-backs dropped (ledger F-48), #9358 |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exit 0; `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exit 0.

**Contract:**
- shape (openspec): ADD R95, R96, R97 after R84; MODIFY A4 and R84:
  ```diff
  -- A4: … (default: from config or patch)
  +- A4: … (default: from config, else `version.preRelease` (R63), else the plan's commit type (R96), else patch)
  ```
  ```diff
  - … The next emitted step is `dispatch_review`. A round whose commit-fixes is `skipped` ends the loop.
  + … The next emitted step is `dispatch_review`. A round whose commit-fixes is `skipped` ends the loop. After the last round's commit-fixes, R95 applies.
  ```
  New text:
  ```text
  - R95: Final fix review. When commit-fixes is recorded `completed` in the last round (round k = flags.reviewRounds, any value 1–3), ship.js appends that round to `ledger.rounds[]` as R84 does, sets `ledger.finalCheck = { base, commit, status: "pending", verdict: null }`, resets review to `pending`, sets received-review and commit-fixes to fresh `skipped` entries with the reason `final check (R95): no further fix round`, and emits `dispatch_review` with args `--committed --base <base>` plus `--auto` and `--plan "<planFile>"` as R88 gives them. `base` is the received-review entry's `fixBaseHead` (HEAD when received-review was dispatched); `commit` is the commit-fixes artifact sha, else HEAD. On `--after dispatch_review` while `finalCheck.status` is `pending`, ship.js sets `status: "completed"` and `verdict` from `artifacts.verdict` (null when absent), emits no review_gate, received-review, stage_fixes or commit-fixes, and continues with the step after commit-fixes. When `fixBaseHead` is missing, ship.js sets no finalCheck, adds the warning `final fix review skipped: no fix base recorded`, and continues as before. The Step 6 summary (`ext.summary`) carries `finalCheck` (the ledger object, or null). A round whose commit-fixes is skipped sets no finalCheck.
    - Acceptance: exec cases whose descriptions start with `ship-final-check:`; the `ship-rounds:` cases (d) and (f) expect the final dispatch_review before dispatch_version.
  - R96: Bump from the plan commit type. When `flagSources.bump` is `default` after R63 and the plan has a `**Commit:**` subject, prepare sets `flags.bump` from the subject's type and `flagSources.bump = "plan (Commit type)"`: a `!` before the `:` gives `major`, type `feat` gives `minor`, any other type gives `patch`. A subject that does not start with `<type>[(<scope>)][!]:` leaves the default. CLI `--bump`, config `ship.bump` and `version.preRelease` keep precedence. The `--plan-mode-blocked` init (R64) runs before the plan is read and keeps the default; the resumed run's prepare recomputes the bump (R11), so the plan rule applies there.
    - Acceptance: exec cases whose descriptions start with `ship-bump:`.
  - R97: Review step agents. `ship-step-review` and `ship-step-received-review` return only once, at a terminal point, and never end their turn while a subagent they dispatched still runs. `ship-step-received-review` never runs `git commit`; it leaves the fixes in the working tree for commit-fixes. Backstop: at `--after dispatch_received_review` with `success: true`, when HEAD differs from the entry's `fixBaseHead` and `git status --porcelain` is empty, ship.js records commit-fixes `completed` with `artifacts.commit = HEAD` and the reason `adopted: received-review committed its fixes`, adds a warning naming the sha, emits no stage_fixes or dispatch_commit_fixes, and applies R84 or R95 as after a completed commit-fixes.
    - Acceptance: `execute-plan-sdlc/handback:` sentinel case; exec cases whose descriptions start with `ship-self-commit:`.
  - R98: Stale hand-backs. A hand-back report or task notification that arrives for a step whose ledger entry is already `completed`, `skipped` or `failed`, or from an agent of a step that is not the current `dispatch_*` step, is stale: the ship session prints one line `ignored stale hand-back for <step>` and makes no Agent call, no `--after` call and no re-run for it. Stale reports come from harness delivery, which the plugin does not control.
    - Acceptance: `execute-plan-sdlc/handback:` sentinel case (ship SKILL.md carries the rule).
  ```
- names: `R95`, `R96`, `R97`, `R98`, `ledger.finalCheck`, `fixBaseHead`, `plan (Commit type)`.
- mirror: R84 at `docs/specs/ship-sdlc.md:207-208`; appendix table at the end of the file.
- decisions: Decisions taken without the owner 1–4; Key Decisions 1–4.
- sync: site copy; Tasks 3, 4, 8, 11, 12 implement it.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exit 0; `cmp` exit 0. This validator is the targeted check; no exec dataset reads spec text (Deviations, prose-only row).

### Task 2: Execute and plan-sdlc spec R88, R89, R90, R91, R70

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — amend R88; add R89, R90, R91; appendix rows
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy
- Modify: `docs/specs/plan-sdlc.md` — add R70; appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy

**Notes:** Spec first for F-46, F-45, F-11/F-40, F-30 and F-48 (F-ship-js-bump-learnings-progress-12; F-execute-worker-write-and-factsheet-1, -4, -5, -6, -8; F-ship-review-loop-and-step-agent-rules-5). It precedes Tasks 5, 6, 7, 9, 10 and 12.

**Acceptance criteria:**
- [ ] R88, R89, R90, R91 and R70 read as in the Contract; appendix rows `| R88 | task ids in wave-watch (ledger F-46), #9358 |`, `| R89 | fact-sheet verification (ledger F-45), #9358 |`, `| R90 | worker write guard hook (ledger F-11, F-40), #9358 |`, `| R91 | stale hand-backs dropped (ledger F-48), #9358 |` in the execute spec and `| R70 | created files under Files (ledger F-30), #9358 |` in the plan-sdlc spec.
- [ ] `validate-spec-shape.js --root . --strict` exit 0; both `cmp` exit 0.

**Contract:**
- shape (openspec): MODIFY R88 line format; ADD R89, R90 and R91 after R88 in `## Dispatch and routing` (where R86/R87 sit); ADD R70 to `docs/specs/plan-sdlc.md` after R69 under `## Invariants and constraints`.
  ```diff
  -… prints one line per wave … : `execute wave <n>: <status>, <done>/<total> tasks done`. `<done>` counts tasks with `status: completed`. …
  +… prints one line per wave … : `execute wave <n>: <status>, <done>/<total> tasks done (tasks <ids>)`. `<done>` counts tasks with `status: completed`; `<ids>` lists the wave's task ids in state order, comma-separated; a wave with no tasks prints `(tasks none)`. …
  ```
  ```text
  - R89: Fact-sheet verification. `wave-start --tasks-json` reads the plan named by the state's `planPath` (relative paths resolve against the main worktree root) with `parsePlan`. Each fact sheet gains a `## Verification` section after `## Files` when the plan header has a `**Verification:**` value or the task has a `**Verify:**` value: a `Task check: <verify>` line when the task has one, then `Plan verification (run these commands exactly as written: same versions, same directory):` followed by the header value verbatim. A missing, unreadable or unparsable plan omits the section and never fails `wave-start`. Workers run the section's commands as written and never substitute another tool version.
    - Acceptance: `execute-plan-sdlc/context-producer/wave-start:` verification cases; worker sentinel in `execute-plan-sdlc/handback:`.
  - R90: Worker write guard. A PreToolUse hook on `Bash` (`hooks/worker-write-guard.js`) denies the command, with `permissionDecision: "deny"` and a reason naming R87 and the Edit/Write tools, when the input's `agent_type` ends with `execute-worker`, `execute-worker-complex` or `execute-worker-batch` (with or without a `<plugin>:` prefix) and the command matches one of these write patterns: `sed -i`/`--in-place`, `perl -i`, `awk -i inplace`, `tee` into a path, `cat >`/`>>`, a heredoc redirect into a path, `python -c` with `open(` or `write_text`, `node -e`/`--eval` with `writeFileSync` or `appendFileSync`. A redirect or `tee` target under `$TMPDIR`, `/tmp/` or `/dev/` is allowed. Any other agent, a missing `agent_type`, a parse error or a load failure exits 0 with no output.
    - Acceptance: exec cases whose descriptions start with `worker-write-guard:`.
  - R91: Stale hand-backs. A worker or wave-runner hand-back that arrives for a wave whose execute state already records it `completed`, `partial` or `failed`, or for a task already recorded by `task-done`/`task-fail`, is stale: execute-plan-sdlc and the wave-runner print one line `ignored stale hand-back for wave <n> task <id>` and make no dispatch, no state write and no re-run for it. Stale reports come from harness delivery, which the plugin does not control.
    - Acceptance: `execute-plan-sdlc/handback:` sentinel case (execute SKILL.md and wave-runner-template.md carry the rule).
  ```
  ```text
  - R70 (created files are listed): Every file a task creates, fixtures and test data included, MUST appear under that task's `**Files:**` as `Create:` or `Test:`, because ship runs execute with `--strict-files` (execute A10) and an unlisted path fails the wave. A task whose Acceptance or Contract names a new fixture path lists that path.
  ```
- names: `R88` (modified), `R89`, `R90`, `R91`, `R70`, `## Verification`, `hooks/worker-write-guard.js`.
- mirror: R86/R87 at `docs/specs/execute-plan-sdlc.md:195-197`; R69 at `docs/specs/plan-sdlc.md:289`.
- decisions: Decisions taken without the owner 5–7; Key Decisions 5–6.
- sync: both site copies; Tasks 5, 6, 7, 9, 10, 12 implement it.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exit 0; both `cmp` exit 0. This validator is the targeted check; no exec dataset reads spec text (Deviations, prose-only row).

### Task 3: Ship bump from the plan commit type

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — add `bumpFromPlanSubject` and apply it in prepare after R63
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add `ship-bump:` cases (a)–(e)

**Notes:** Implements R96 (F-37; F-ship-js-bump-learnings-progress-1 to -4). The `--after` path reads the frozen `ledger.flags.bump`, so the value set in prepare carries through; the worker confirms that and changes nothing there if so.

**Acceptance criteria:**
- [ ] Cases (a)–(e) pass; the existing case "no version.preRelease in config — behaviour unchanged, --bump patch default (#394)" still passes (it has no plan).
- [ ] Case (e): a second prepare run with the same plan resolves the same bump and source (no drift on re-run).

**Contract:**
- shape (code):
  ```js
  /** R96: bump implied by a conventional subject; null when the subject is null or not conventional. */
  function bumpFromPlanSubject(subject) {
    const m = typeof subject === 'string' ? /^([a-z]+)(\([^)]*\))?(!)?:/.exec(subject) : null;
    if (!m) return null;
    return m[3] ? 'major' : m[1] === 'feat' ? 'minor' : 'patch';
  }
  ```
  In `main()`, directly after `const planCommit = readPlanCommitSubject(planFile, commitSubjectPattern);` (`ship.js:3142`) and before `computeSteps`:
  ```js
  // R96: the plan's commit type fills only the default bump (after R63).
  if (flagSources.bump === 'default') {
    const b = bumpFromPlanSubject(planCommit.subject);
    if (b) { flags.bump = b; flagSources.bump = 'plan (Commit type)'; }
  }
  ```
  Insert exactly there. The `--plan-mode-blocked` branch (`ship.js:2884`) returns earlier and keeps the default bump; do not move the block before it (spec R96: the resumed run recomputes the bump, R11).
  Test cases, mirroring the mkdtemp one-liner of `ship-prepare (R-plan-commit-subject): header field forwards --subject` (`ship-prepare-exec.yaml:4479`), each writing a plan whose header `**Commit:**` is the subject below and running `--has-plan --plan <d>/plan.md` plus the extra args:

  | Case | Subject | Extra args / config | Expect version args | Expect `flags.sources.bump` |
  |---|---|---|---|---|
  | `ship-bump: (a) feat plan gives minor` | `feat(#1): x - y` | none | `--bump minor` | `plan (Commit type)` |
  | `ship-bump: (b) fix plan gives patch` | `fix(#1): x - y` | none | `--bump patch` | `plan (Commit type)` |
  | `ship-bump: (c) breaking plan gives major` | `feat(x)!: y` (fixture without `commit.subjectPattern`) | none | `--bump major` | `plan (Commit type)` |
  | `ship-bump: (d) CLI bump wins` | `feat(#1): x - y` | `--bump patch` | `--bump patch` | `cli` |
  | `ship-bump: (e) a re-run resolves the same bump` | `feat(#1): x - y` | run prepare twice on the same plan | both outputs `--bump minor` | `plan (Commit type)` both times |
- names: `bumpFromPlanSubject`, `plan (Commit type)`, case prefix `ship-bump:`.
- mirror: the R63 block at `ship.js:2852-2864`; test style at `ship-prepare-exec.yaml:4479-4496`.
- decisions: Key Decisions 4; `module.exports` gains `bumpFromPlanSubject` only if a case needs it (none does).
- sync: spec R96 (Task 1); SKILL/docs (Task 11).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-bump:|preRelease"` → all pass.

### Task 4: Review step agents return once; received-review never commits

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-review.md` — add the terminal-return rule
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — add the terminal-return rule and the commit ban
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — check both sentences

**Notes:** Implements the prose half of R97 (F-38; F-ship-review-loop-and-step-agent-rules-4, -5). The body is shared prefix text for prompt caching; the new lines carry no per-dispatch value.

**Acceptance criteria:**
- [ ] Both agents carry the sentences of the Contract after the "The arguments above decide…" paragraph.
- [ ] The sentinel script reports `shipStepReview: true` and `shipStepReceivedReview: true`, and fails when either sentence is removed.

**Contract:**
- shape (code): insert in both agents, as its own paragraph:
  ```text
  Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Never end your turn while a subagent you dispatched is still running; wait for its result (ship-sdlc R97).
  ```
  and in `ship-step-received-review.md` only, as the next paragraph:
  ```text
  Do not run `git commit`, `git commit --amend` or `git stash`. Leave your fixes in the working tree; the pipeline's commit-fixes step commits them (ship-sdlc R97).
  ```
  Sentinel script additions:
  ```js
  const STEP_RETURN = 'Never end your turn while a subagent you dispatched is still running';
  const shipStepReview = has('agents/ship-step-review.md', [STEP_RETURN]);
  const shipStepReceivedReview = has('agents/ship-step-received-review.md', [STEP_RETURN, 'Do not run `git commit`']);
  ```
  Both join `ok` and the printed JSON.
- names: `STEP_RETURN`, `shipStepReview`, `shipStepReceivedReview`.
- mirror: `agents/ship-step-execute.md:13`; `check-handback-sentinels.js:35-37`.
- decisions: Decisions taken without the owner 3 (the ship.js backstop is Task 8).
- sync: spec R97.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"` → pass.

### Task 5: Wave-watch line names task ids

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `cmdWaveWatch` line format
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — update the `--once` assertion

**Notes:** Implements amended R88 (F-46; F-ship-js-bump-learnings-progress-12, -19). The ship SKILL prints the monitor line as is, so no ship change is needed for the ids to reach the main session.

**Acceptance criteria:**
- [ ] The `--once` case expects `execute wave 1: completed, 2/2 tasks done (tasks <id1>, <id2>)` with the fixture's ids.
- [ ] The baseline and bad-`--interval` cases pass unchanged.

**Contract:**
- shape (code):
  ```diff
  -      const done = tasks.filter(t => t && t.status === 'completed').length;
  -      process.stdout.write(`execute wave ${wave.number}: ${wave.status}, ${done}/${tasks.length} tasks done\n`);
  +      const done = tasks.filter(t => t && t.status === 'completed').length;
  +      const ids = tasks.filter(Boolean).map(t => t.id);
  +      const list = ids.length > 0 ? ids.join(', ') : 'none';
  +      process.stdout.write(`execute wave ${wave.number}: ${wave.status}, ${done}/${tasks.length} tasks done (tasks ${list})\n`);
  ```
  The JSDoc of `cmdWaveWatch` names R88's new format.
- names: line format of R88.
- mirror: `state/execute.js:1377-1388`.
- decisions: ids in state order, no sorting; no failed-id suffix (Decisions taken without the owner 9).
- sync: spec R88 (Task 2).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "liveness/wave-watch"` → all pass.

### Task 6: Worker write guard hook

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/hooks/worker-write-guard.js`
- Modify: `plugins/sdlc-utilities/hooks/hooks.json` — PreToolUse entry for `Bash`
- Modify: `plugins/sdlc-utilities/hooks/README.md` — one section on the guard
- Create: `tests/promptfoo/datasets/worker-write-guard-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec-hooks.yaml` — add the dataset

**Notes:** Implements R90 (F-11, F-40; F-execute-worker-write-and-factsheet-1, -4). Deny, not warn (Decisions taken without the owner 6). The `redirect`, `tee` and `-i` rules must ignore characters inside single- or double-quoted strings, so a read-only command such as `grep -n 'a > b' src/x.js` or `node t.js "x>y"` is not denied; add case `(i) quoted > in a read-only command allowed` (`sdlc:execute-worker`, `grep -n 'a > b' src/x.js`, silent) to the table below. The stdin payload is the only input, so the hook needs no state read and behaves the same in branch and worktree mode.

**Acceptance criteria:**
- [ ] Every case in the table passes; the hook never writes stdout outside a deny and always exits 0.
- [ ] `node plugins/sdlc-utilities/hooks/worker-write-guard.js < /dev/null` exits 0 with no output.

**Contract:**
- shape (code): CommonJS, Node built-ins only.
  ```js
  // hooks/worker-write-guard.js — PreToolUse(Bash), implements execute-plan-sdlc R90.
  const WORKER_RE = /(^|:)execute-worker(-complex|-batch)?$/;
  /** @returns {{ deny: boolean, rule: string|null }} */
  function classifyCommand(cmd) { /* first matching rule name, else { deny: false, rule: null } */ }
  module.exports = { classifyCommand, WORKER_RE };
  // main (only when require.main === module): read stdin JSON; when WORKER_RE.test(payload.agent_type)
  // and tool_name === 'Bash' and classifyCommand(tool_input.command).deny → print the deny JSON; exit 0 on every path.
  ```
  Rules (name → pattern idea): `sed-in-place` (`sed` with `-i`, `-i.bak`, `--in-place`), `perl-in-place` (`perl` with `-i` in its flags), `awk-in-place` (`-i inplace`), `tee` (a `tee` whose path argument is not allowed), `redirect` (`>` or `>>`, not `2>`/`&>`/`>&`, into a target that is not allowed; covers `cat >`, `echo >` and heredocs), `python-write` (`python`/`python3` with `-c` and `open(` or `write_text`), `node-write` (`node -e`/`--eval` with `writeFileSync` or `appendFileSync`). Allowed targets: starting with `/dev/`, `/tmp/`, `$TMPDIR`, `"$TMPDIR`, `${TMPDIR}`.
  Deny output:
  ```json
  {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"execute-plan-sdlc R87/R90: workers change repository files only with the Edit and Write tools. Blocked rule: <rule>. Use Edit or Write instead."}}
  ```
  `hooks.json` gains, inside `PreToolUse`:
  ```json
  { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/worker-write-guard.js\"", "timeout": 3 } ] }
  ```
  Cases (prefix `worker-write-guard:`), stdin `{"tool_name":"Bash","agent_type":<a>,"tool_input":{"command":<c>}}`:

  | Case | agent_type | command | Expect |
  |---|---|---|---|
  | (a) sed -i denied | `sdlc:execute-worker` | `sed -i 's/a/b/' src/x.js` | deny, rule `sed-in-place` |
  | (b) heredoc into repo denied | `execute-worker-complex` | `cat > src/x.js <<'EOF'` + newline + `x` + newline + `EOF` | deny, rule `redirect` |
  | (c) node write denied | `sdlc:execute-worker-batch` | `node -e "require('fs').writeFileSync('a.md','x')"` | deny, rule `node-write` |
  | (d) scratch redirect allowed | `sdlc:execute-worker` | `node t.js > "$TMPDIR/out.txt" 2>&1` | silent |
  | (e) read-only command allowed | `sdlc:execute-worker` | `grep -n foo src/x.js` | silent |
  | (f) main session not affected | absent | `sed -i 's/a/b/' src/x.js` | silent |
  | (g) other agent not affected | `sdlc:ship-step-commit` | `sed -i 's/a/b/' src/x.js` | silent |
  | (h) bad stdin | — | stdin `not json` | silent, exit 0 |
- names: `worker-write-guard.js`, `classifyCommand`, `WORKER_RE`, rule names above.
- mirror: `hooks/block-askuserquestion-auto.js` (stdin read, deny JSON, exit-0 degradation); `datasets/ship-hooks-exec.yaml` case shape.
- decisions: Key Decisions 6; Deviations rows 4 and 7.
- sync: spec R90; README lists the hook.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "worker-write-guard:"` → 8 passed.

### Task 7: plan-sdlc lists created fixtures under Files

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — one bullet in Step 2 "Task decomposition rules"
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — one sentence under the Per-Task Block

**Notes:** Implements R70 (F-30; F-execute-worker-write-and-factsheet-7, -8). Authoring rule only; no validator change (Decisions taken without the owner 7).

**Acceptance criteria:**
- [ ] The bullet and the sentence read as in the Contract.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (code): SKILL.md, after the bullet "Each task touches 1–5 files (more than 5 → split)":
  ```text
  - Every file a task creates, fixtures and test data included, is listed under its **Files:** as `Create:` or `Test:`. Ship runs execute with `--strict-files`, so an unlisted path fails the wave (implements R70).
  ```
  plan-format-reference.md, after the Per-Task Block code fence:
  ```text
  List every file the task creates under **Files:**, fixtures and test data included (plan-sdlc R70): execute's `--strict-files` check fails a wave that writes an unlisted path.
  ```
- names: `R70`.
- mirror: the decomposition bullets in `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` Step 2.
- decisions: Key Decisions 10 (no validator check).
- sync: spec R70 (Task 2).

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0. These validators are the targeted check; no exec dataset reads plan-sdlc prose (Deviations, prose-only row).

### Task 8: Ship final fix review and self-commit adoption

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `fixBaseHead`, `ledger.finalCheck`, review args, adoption, summary field
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — final-check and self-commit scenarios
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — canned result files for the new scenarios, only if the stepper cannot write them itself
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — update `ship-rounds:` (d) and (f); add `ship-final-check:` and `ship-self-commit:` cases

**Notes:** Implements R95 and the ship.js half of R97 (F-50, F-38; F-ship-review-loop-and-step-agent-rules-1 to -3, -7). Highest-risk task: it changes the default pipeline after any fix round. Every stepper case that walks past `dispatch_commit_fixes` must be re-checked; `grep -n "dispatch_commit_fixes" tests/promptfoo/datasets/*.yaml` lists them. The spec text of R84, R95 and R97 is in Task 1's Contract.

**Acceptance criteria:**
- [ ] `ship-rounds:` (d) and (f) now expect the final-check `dispatch_review` before `dispatch_version`; `ship-rounds:` (c), (e), (g) and `ship-summary-commits:` still pass (update an assertion only where the new summary field or the extra review breaks an exact match, and say which).
- [ ] Every case in the case table below passes.
- [ ] `ext.summary.finalCheck` is the ledger object on the done envelope, null when no final check ran.

**Contract:**
- shape (code): state transitions, rendered:

  | Event | Ledger change | Next emitted step |
  |---|---|---|
  | emit `dispatch_received_review` | received-review entry `fixBaseHead = git rev-parse HEAD` (active worktree) | — |
  | `--after dispatch_commit_fixes` completed, round < reviewRounds | R84 as today | `dispatch_review` |
  | `--after dispatch_commit_fixes` completed, round = reviewRounds, `fixBaseHead` set | push round to `rounds[]`; `finalCheck = { base: fixBaseHead, commit: artifacts.commit \|\| HEAD, status: 'pending', verdict: null }`; review → `{ name, status: 'pending' }`; received-review, commit-fixes → `{ name, status: 'skipped', reason: 'final check (R95): no further fix round' }` | `dispatch_review` |
  | same, `fixBaseHead` missing | warning `final fix review skipped: no fix base recorded` | step after commit-fixes |
  | `--after dispatch_review`, `finalCheck.status === 'pending'` | `finalCheck.status = 'completed'`, `finalCheck.verdict = artifacts.verdict ?? null` | step after commit-fixes (no review_gate, received-review, stage_fixes, commit-fixes) |
  | `--after dispatch_received_review` success, HEAD ≠ `fixBaseHead`, porcelain empty | commit-fixes → `completed`, `artifacts.commit = HEAD`, reason `adopted: received-review committed its fixes`; warning `received-review committed <sha> itself; adopted as the commit-fixes commit (R97)` | as after a completed commit-fixes (R84 row or R95 row) |

  Current R84 block (`ship.js:2654-2672`) and its replacement:
  ```diff
     // R84: commit-fixes completed in round k < reviewRounds starts round k + 1 at dispatch_review.
     const round = ledger.round || 1;
  -  if (after === 'dispatch_commit_fixes' && recorded.has('commit-fixes') && round < (flags.reviewRounds || 1)) {
  -    const entryOf = (n) => ledger.steps.find(s => s.name === n);
  -    if (!Array.isArray(ledger.rounds)) ledger.rounds = [];
  -    ledger.rounds.push({
  -      round,
  -      review: { ...entryOf('review') },
  -      receivedReview: { ...entryOf('received-review') },
  -      commitFixes: { ...entryOf('commit-fixes'), commitSha: (output.artifacts && output.artifacts.commit) || null },
  -    });
  -    ledger.round = round + 1;
  -    for (const n of ['review', 'received-review', 'commit-fixes']) {
  -      const i = ledger.steps.findIndex(s => s.name === n);
  -      if (i < 0) continue;
  -      const fresh = { name: n, status: 'pending' };
  -      if (ledger.steps[i].condition) fresh.condition = ledger.steps[i].condition;
  -      ledger.steps[i] = fresh;
  -    }
  -    from = 'dispatch_commit';
  -  }
  +  // R84/R95/R97: one transition for a completed commit-fixes, reached from commit-fixes or from adoption.
  +  if ((after === 'dispatch_commit_fixes' && recorded.has('commit-fixes')) || adopted) {
  +    from = afterFixesCommitted(ledger, { sha: (output.artifacts && output.artifacts.commit) || adopted, round, flags, warnings }) || from;
  +  }
  ```
  `afterFixesCommitted` keeps the removed body for `round < reviewRounds` (returns `'dispatch_commit'`), and for `round === reviewRounds` applies the R95 row of the table (also returns `'dispatch_commit'`, so `pickNextStep` emits the pending review), or returns null with the warning when `fixBaseHead` is missing. `adopted` is the HEAD sha set by the adoption check earlier in the same `--after dispatch_received_review` call, else null.
  Current emit block (`ship.js:2689-2691`) and its extension:
  ```diff
       if (next.step.id === 'dispatch_version' || next.step.id === 'dispatch_execute') {
         const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
         if (head) res.step.dispatchHead = head; // R80: the fact rerunGuard compares against
  @@
  +    if (next.step.id === 'dispatch_received_review') {
  +      const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
  +      if (head) res.step.fixBaseHead = head; // R95/R97: base of the fix diff; never read by rerunGuard
  +    }
  ```
  Review args while `finalCheck.status === 'pending'`: `computeSteps` ctx gains `finalCheckBase`; the review step args become `['--committed', `--base ${finalCheckBase}`, flags.auto ? '--auto' : '', planFile ? `--plan "${planFile}"` : ''].filter(Boolean).join(' ')`. Both `computeSteps` calls pass `finalCheckBase: (ledger.finalCheck && ledger.finalCheck.status === 'pending') ? ledger.finalCheck.base : null` (prepare passes null).
  Refactor: the R84 block becomes `afterFixesCommitted(ledger, { sha, round, flags, warnings })` (the only signature) returning the new `from` value or null, called from the commit-fixes path and the adoption path, so the two cannot drift.
  Adoption check, placed in the `--after` handler right before the `// R84:` comment, so `adopted` is known when the transition runs:
  ```js
  // R97: received-review committed its fixes itself; adopt that commit as commit-fixes.
  let adopted = null;
  if (after === 'dispatch_received_review' && result.success === true) {
    const rr = ledger.steps.find(s => s.name === 'received-review');
    const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
    if (rr && rr.fixBaseHead && head && head !== rr.fixBaseHead && !exec('git status --porcelain', { cwd: resolveActiveWorktreeSafe() })) {
      const cf = ledger.steps.find(s => s.name === 'commit-fixes');
      if (cf) Object.assign(cf, { status: 'completed', reason: 'adopted: received-review committed its fixes', artifacts: { commit: head } });
      warnings.push(`received-review committed ${head} itself; adopted as the commit-fixes commit (R97)`);
      adopted = head;
    }
  }
  ```
  `buildSummary(ledger)` adds `finalCheck: ledger.finalCheck || null`.
  Stepper scenarios (`--rounds <n>` already exists). Canned result files are written by the stepper itself where it can; otherwise `setup.sh` (listed under Files) writes them.

  | Scenario | `--after` call order (canned result) | Fixture action before the call |
  |---|---|---|
  | `rounds-final-check` | `review_gate` → `dispatch_received_review` (success) → `stage_fixes` → `dispatch_commit_fixes` (commit sha) → `dispatch_review` (verdict `APPROVED`) | write a changed file before `stage_fixes`; commit before `dispatch_commit_fixes` |
  | `rounds-final-check --again` | as above, then `dispatch_review` once more with the same result | none |
  | `rounds-self-commit` | `review_gate` → `dispatch_received_review` (success) → `dispatch_review` (verdict `APPROVED`) | commit a changed file before `dispatch_received_review`, so HEAD moved and the tree is clean |

  Case table (prefixes `ship-final-check:` and `ship-self-commit:`, file `tests/promptfoo/datasets/ship-prepare-exec.yaml`):

  | Case | Scenario / args | Expect |
  |---|---|---|
  | `ship-final-check: (a) one round with fixes reviews the fix commit` | `rounds-final-check`, default rounds | the envelope after `dispatch_commit_fixes` is `dispatch_review` whose invocation contains `--committed --base <40-hex sha>`; the envelope after it is `dispatch_version`; `received-review` and `commit-fixes` are `skipped` with reason `final check (R95): no further fix round`; `finalCheck.status === 'completed'`, `finalCheck.verdict === 'APPROVED'` |
  | `ship-final-check: (b) two rounds review three times` | `rounds-final-check --rounds 2` (two fix rounds) | three `dispatch_review` envelopes; `rounds.length === 2` |
  | `ship-final-check: (c) no fixes means no final check` | `rounds-2-no-fixes --rounds 2` | ids as in `ship-rounds: (e)`; `finalCheck` absent |
  | `ship-final-check: (d) a repeated final review result does not re-run the check` | `rounds-final-check --again` | the second `--after dispatch_review` emits no further `dispatch_review`, `finalCheck` unchanged (idempotency) |
  | `ship-self-commit: (a) a commit made by received-review is adopted` | `rounds-self-commit` | no `stage_fixes` or `dispatch_commit_fixes` envelope; `commit-fixes` `completed` with `artifacts.commit` equal to the fixture HEAD; a warning contains `adopted as the commit-fixes commit`; the next envelope is the final-check `dispatch_review` |
- names: `fixBaseHead`, `ledger.finalCheck`, `finalCheckBase`, `afterFixesCommitted`, scenarios `rounds-final-check`, `rounds-self-commit`, case prefixes `ship-final-check:`, `ship-self-commit:`.
- mirror: the R84 block at `ship.js:2654-2672`; `dispatchHead` capture at `ship.js:2688-2693`; `ship-rounds:` cases at `ship-prepare-exec.yaml:5528-5600`.
- decisions: Decisions taken without the owner 1–3; Key Decisions 1–3. `fixBaseHead` is never read by the R80 re-run guard.
- sync: spec R95, R97 (Task 1); ship SKILL/state-format/docs (Task 11).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-"` → all pass (exec-only, so the wide ship filter is allowed; it covers every dataset whose cases walk past `dispatch_commit_fixes`).

### Task 9: Fact sheet carries the plan verification

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/task-factsheet.js` — `renderFactSheet` renders `## Verification`
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `wave-start` reads the plan and passes the values
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-context-producer-exec.yaml` — add two cases
- Create: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/execute-fix-verify-sheet-20250105T000000Z.json`
- Create: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/docs/plans/verify-sheet.md`

**Notes:** Implements R89 (F-45; F-execute-worker-write-and-factsheet-5, -6). The plan is parsed by the existing `parsePlan`, so no LLM transcription of commands. Both fixture files are listed here because of R70.

**Acceptance criteria:**
- [ ] Case `execute-plan-sdlc/context-producer/wave-start: the fact sheet carries the plan verification verbatim (R89)`: `wave-start --wave 1 --branch fix/verify-sheet --run-id 20250105T000000 --tasks-json [{"id":"1","name":"Alpha"}]` writes a fact sheet whose `## Verification` section contains `Task check: tests` and the fixture header value `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml` byte for byte.
- [ ] Case `… wave-start: a missing plan omits the verification section (R89)` on the existing `fix/ctx-alpha` state (no `planPath`): no `## Verification` heading, exit 0.
- [ ] Existing context-producer cases pass.

**Contract:**
- shape (code):
  ```diff
  - * @param {{ id: string, name: string, description: string, acceptanceCriteria: string[], files: string[], contract?: string }} task
  + * @param {{ id: string, name: string, description: string, acceptanceCriteria: string[], files: string[], contract?: string, verify?: string, planVerification?: string }} task
  ```
  After the `## Files` block in `renderFactSheet`:
  ```js
  // R89: the plan's verification commands, verbatim; omitted when neither value is present.
  const verify = typeof task.verify === 'string' ? task.verify.trim() : '';
  const planVerification = typeof task.planVerification === 'string' ? task.planVerification.trim() : '';
  if (verify || planVerification) {
    lines.push('## Verification', '');
    if (verify) lines.push(`Task check: ${verify}`, '');
    if (planVerification) lines.push('Plan verification (run these commands exactly as written: same versions, same directory):', '', planVerification, '');
  }
  ```
  In `wave-start`, before the fact-sheet loop: read `data.planPath` (resolve a relative path against the main worktree root from `lib/state.js`), `parsePlan(content)` inside try/catch; on any failure both values stay empty. Per task, `verify` = the parsed task with the same normalized id (`normalizeTaskId`), `planVerification` = parsed header `verification`. A value already present on the `--tasks-json` object wins.
  Fixture state: copy of `execute-fix-ctx-alpha-20250101T000000Z.json` with `branch: "fix/verify-sheet"`, `planPath: "docs/plans/verify-sheet.md"`, no waves. Fixture plan: header with `**Verification:** \`cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml\``, one `### Task 1: Alpha` block with `**Verify:** tests`.
- names: `## Verification`, `Task check:`, `planVerification`, `verify`.
- mirror: the `## Scratch directory` block at `task-factsheet.js:98-106`; wave-start case at `execute-plan-sdlc-context-producer-exec.yaml:158-172`.
- decisions: Key Decisions 5.
- sync: spec R89 (Task 2); worker agents (Task 10).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/"` → all pass (the wide execute filter also covers cases that list state files in the shared `execute-state-mid-wave` fixture, which gains a second state file).

### Task 10: Worker agents run the fact-sheet verification as written

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/execute-worker.md` — one Hard Constraint line
- Modify: `plugins/sdlc-utilities/agents/execute-worker-complex.md` — same line
- Modify: `plugins/sdlc-utilities/agents/execute-worker-batch.md` — same line
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — add the line to `WORKER_SENTINELS`

**Notes:** Implements the worker half of R89 (F-45; F-execute-worker-write-and-factsheet-3, -6). Depends on Task 4 only because both edit the sentinel script.

**Acceptance criteria:**
- [ ] The three agents carry the same line under `## Hard Constraints`, after the Edit/Write rule.
- [ ] The sentinel case passes; it fails when the line is removed from any worker.

**Contract:**
- shape (code): the line, byte-identical in the three files:
  ```text
  - When your fact sheet has a `## Verification` section, run its commands exactly as written: the same tool versions, the same working directory. Never replace a pinned version (for example `npx --yes promptfoo@<version>`) with an unpinned or newer one (execute-plan-sdlc R89).
  ```
  ```diff
  -const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`'];
  +const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`', 'has a `## Verification` section, run its commands exactly as written'];
  ```
- names: `WORKER_SENTINELS`.
- mirror: the Hard Constraints list at `agents/execute-worker.md:93-99`.
- decisions: one shared line, no per-worker variant.
- sync: spec R89; Task 9 renders the section.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"` → pass.

### Task 11: Ship skill, state format and user docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 8
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 2 round paragraph, Step 1d example, Step 5 stale hand-back rule, Step 6 row
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `finalCheck`, `fixBaseHead`
- Modify: `docs/skills/ship-sdlc.md` — `--bump` default, `## Review rounds` final check
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy

**Notes:** Implements the user-facing text of R95, R96 and R97 and the ship rule of R98 (F-50, F-37, F-38, F-48; F-ship-review-loop-and-step-agent-rules-1, -2; F-ship-js-bump-learnings-progress-6, -11, -13). Depends on Task 8 for the final field names; Task 3's names are fixed by Task 1.

**Acceptance criteria:**
- [ ] SKILL.md Step 2: after "A round whose commit-fixes is skipped ends the loop.", the sentence "After the last round's commit-fixes, `ship.js` emits `dispatch_review` once more on the fix commit only (`--committed --base <sha>`, R95); its findings start no new round and appear in the summary as `finalCheck`. A fix commit made by received-review itself is adopted as the commit-fixes commit (R97)." Step 1d example line `bump:    minor (source: plan (Commit type))`. Step 6 table gains row `3b    review-sdlc (final)   [done] <verdict> on <short sha>` and the sentence "Print the 3b row only when `ext.summary.finalCheck` is non-null."
- [ ] SKILL.md Step 5 gains, after item 6, the paragraph: "**Stale hand-backs (R98).** A hand-back or task notification for a step whose ledger entry is already `completed`, `skipped` or `failed`, or from an agent of a step that is not the current `dispatch_*` step, is stale. Print one line `ignored stale hand-back for <step>` and do nothing else for it: no Agent call, no `--after` call, no re-run. Take the step status from the last envelope; do not read the ledger for it."
- [ ] state-format.md documents `finalCheck { base, commit, status, verdict }` on the ledger and `fixBaseHead` on the received-review entry.
- [ ] docs: the `--bump` row default reads `` `patch`, or `version.preRelease` (R63), or the plan's commit type: `feat` → minor, `!` → major, others → patch (R96) ``; `## Review rounds` gains the final-check paragraph.
- [ ] `check-consistency.js`, `check-docs-consistency.js` exit 0; `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exit 0.

**Contract:**
- shape (docs): MODIFY the four files as in the Acceptance criteria; audience: ship users (docs) and the ship orchestrator (SKILL.md, state-format.md); cross-link `docs/specs/ship-sdlc.md` R95–R97.
- names: `finalCheck`, `fixBaseHead`, row `3b`, paragraph `**Stale hand-backs (R98).**`.
- mirror: `docs/skills/ship-sdlc.md:254` (`## Review rounds`); SKILL.md Step 2 paragraph at line 205; Step 6 table at lines 318-330.
- decisions: the Step 6 row is conditional on `ext.summary.finalCheck`.
- sync: site copy; Tasks 3 and 8 behaviour.

**Verification:** validators exit 0; `cmp` exit 0; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"` → pass (the ship SKILL `wave-watch` sentinel).

### Task 12: Execute drops stale hand-backs; sentinels for R98 and R91

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 10, Task 11
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — stale hand-back paragraph after the R86 paragraph
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — same rule for worker hand-backs
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — check R98 in ship SKILL.md and R91 in both execute files
- Create: `docs/plans/2026-11-11-lean-w9a-ship-execute-findings.md`

**Notes:** Implements R91 and the sentinel half of R98 (F-48; F-ship-review-loop-and-step-agent-rules-5). Prose only (Decisions taken without the owner 8). Depends on Task 10 because both edit the sentinel script, and on Task 11 because the sentinel reads the ship SKILL.md paragraph Task 11 writes.

**Acceptance criteria:**
- [ ] `skills/execute-plan-sdlc/SKILL.md` carries, directly after the `**No hand-back mid-wave (R86).**` paragraph (line 383), the paragraph in the Contract; `wave-runner-template.md` carries its variant after its R86 paragraph (line 84).
- [ ] The sentinel script reports `shipStale: true`, `executeStale: true`, `waveRunnerStale: true` and fails when any sentence is removed.

**Contract:**
- shape (code): execute SKILL.md paragraph:
  ```text
  **Stale hand-backs (R91).** A worker or wave-runner hand-back for a wave that execute state already records `completed`, `partial` or `failed`, or for a task already recorded with `task-done` or `task-fail`, is stale. Print one line `ignored stale hand-back for wave <n> task <id>` and do nothing else for it: no dispatch, no state write, no re-run.
  ```
  wave-runner-template.md paragraph:
  ```text
  **Stale hand-backs (R91).** A worker hand-back for a task you already recorded, or that arrives after you returned the wave, is stale. Print one line `ignored stale hand-back for wave <n> task <id>` and do nothing else for it.
  ```
  Sentinel script additions:
  ```js
  const shipStale = has('skills/ship-sdlc/SKILL.md', ['**Stale hand-backs (R98).**']);
  const executeStale = has('skills/execute-plan-sdlc/SKILL.md', ['**Stale hand-backs (R91).**']);
  const waveRunnerStale = has('skills/execute-plan-sdlc/wave-runner-template.md', ['**Stale hand-backs (R91).**']);
  ```
  All three join `ok` and the printed JSON.
- names: `**Stale hand-backs (R91).**`, `shipStale`, `executeStale`, `waveRunnerStale`.
- mirror: the R86 paragraphs at `skills/execute-plan-sdlc/SKILL.md:383` and `wave-runner-template.md:84`; `check-handback-sentinels.js:31-37`.
- decisions: Decisions taken without the owner 8.
- sync: spec R91 (Task 2), R98 (Task 1); ship paragraph (Task 11).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"` → pass.

## Final Shape

- A ship run that fixed review findings reviews the last fix commit once. The summary shows that verdict. No further fix loop runs.
- If received-review commits by itself, ship adopts the commit and warns, so the final review still runs.
- Without `--bump`, a `feat` plan ships a minor release, a `!` plan a major one, any other plan a patch.
- The main session sees lines like `execute wave 2: completed, 3/3 tasks done (tasks 4, 5, 6)`.
- A late hand-back for a step or wave already recorded costs one printed line and nothing else.
- Each worker fact sheet ends with a `## Verification` section that holds the plan's commands verbatim, and workers run them as written.
- An execute worker that tries `sed -i` or a heredoc into a repository file gets a deny and uses Edit instead.
- plan-sdlc lists every created fixture under the task's Files, so `--strict-files` no longer fails a planned fixture.
- Specs ship R95–R98, execute R88–R91 and plan-sdlc R70 describe all of it; the site copies match.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 4 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Re-verify each ledger item against HEAD f4862bb with evidence; drop F-29, F-39 | Context re-verification table | covered |
| 2 F-50: last review round's fix commit must not reach PR unreviewed | Task 1, Task 8, Task 11 | covered |
| 3 F-38: received-review agent must not commit; step agents must not hand back mid-work | Task 1, Task 4, Task 8 | covered |
| 4 F-37: default bump from plan Commit type | Task 1, Task 3, Task 11 | covered |
| 5 F-46: wave-watch line names task ids | Task 2, Task 5 | covered |
| 6 F-11/F-40: enforce worker write ban beyond prose | Task 2, Task 6 | covered |
| 7 F-45: workers run plan's pinned verification command | Task 2, Task 9, Task 10 | covered |
| 8 F-30: plan-sdlc lists every created fixture under Files | Task 2, Task 7 | covered |
| 9 Spec first with spec ids and exec test cases | Task 1, Task 2, Task 3, Task 5, Task 6, Task 8, Task 9 | covered |
| 10 Out of scope items | Key Decisions 10 | covered |
| 11 Plan file Create under last task; exact exec command per task; no sed -i | Task 12, Task 3, Task 4, Task 5, Task 6, Task 8, Task 9, Task 10, Task 11 | partial |
| 12 F-48: stale hand-backs dropped by ship and execute | Task 1, Task 2, Task 11, Task 12 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
