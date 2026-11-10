# Lean Wave 2 Lean-Mode Fixes Implementation Plan

**Commit:** `fix(#9339): ship - lean mode stage, hook and review fixes`
**Goal:** Fix the plugin defects that lean wave 1 (#9338) found when sdlc ran in lean mode (plan-sdlc in a subagent, ship-sdlc in a separate headless `claude -p` session), tracked as #9339:
- a ship run resumed after a stage-scope stop stages before it commits (F-13);
- ship's stage scope allows the plan file itself (F-8);
- the plan-integrity Stop hook leaves another session's plan marker alone (F-4; the subagent case stays a known residual);
- the ship hook ownership rule for subagent and headless runs is written down (F-15);
- review dimensions and received-review treat recorded plan decisions as intent (F-24);
- the plan-format validator catches a task that the execute parser cannot see, and has `--help` (F-9, F-7);
- the PR Testing section gets execute's verification summary (F-20);
- ship skips learnings-commit when the learnings log is git-ignored (F-21);
- two exec cases stop depending on the global git default branch (F-16).
**Architecture:** Specs first (ship-sdlc, pr-sdlc, plan-sdlc, review-sdlc, received-review-sdlc), then the scripts with promptfoo exec cases (`skill/ship.js`, `hooks/stop-plan-integrity.js`, `ci/validate-plan-format.js`, `skill/review.js`, `skill/received-review.js`, `skill/pr.js`), then skill text and reference docs, then the CHANGELOG. The root problem: several lean-mode paths decide from a signal that is too weak for a run that spans sessions — a per-call set instead of the ledger, a branch-keyed marker instead of its owner, a review that cannot see the plan it reviews.
**Source:** conversation context (lean wave 2 brief; findings F-4, F-7 to F-10, F-13, F-15, F-16, F-20, F-21, F-24 in `.sdlc/orchestration/lean/findings.jsonl`); discovery brief findings `F-<dimension>-<n>` cited per task
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-lean:|ship-strict:|plan-format-lean:|review-prepare-plan:|rr-plan:|pr-prepare-testing:|expected-branch matching current branch" -j 2 --no-cache -o /tmp/pf-lean-w2.json`, then `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml --filter-pattern "stop-plan-integrity|mismatched session_id" -j 2 --no-cache -o /tmp/pf-lean-w2-hooks.json`, then `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`

---

## Context

**What problem does this change solve?**

- After a `stageOutsideFiles` stop, a resumed ship run skips staging. The commit step then finds an empty index and fails with "No staged changes" (F-13).

- The plan file that plan-sdlc just wrote is in no task's Files list. Ship's stage scope (the rule that only plan Files paths may be staged) therefore stops the run on the plan file itself (F-8).

- The plan-integrity Stop hook (a hook that runs when a session ends its turn) finds the plan marker by branch only. In lean wave 1 the main session's hook warned about, and deleted, the marker of a plan-sdlc run that a background subagent still owned (F-4).

- The ship continuation hooks nudged the main session for a ship run that ran inside a subagent (F-15).

- Review dimensions cannot see the plan. A dimension twice raised a HIGH finding against a deliberate plan decision, and received-review once applied it, undoing the decision (F-24).

- The plan-format validator passed a plan in which a nested code fence hid a task from execute's parser (F-9). It also has no `--help` (F-7).

- The PR body said "no test results" although execute had run its verification (F-20).

- The learnings-commit step does nothing where `.sdlc/` is git-ignored, as in this repo (F-21).

- Two exec cases fail unless the global git setting `init.defaultBranch` is `main` (F-16).

**What prompted this change now?** Lean wave 1 (2026-11-10) recorded these findings while it ran sdlc in lean mode. The owner opened lean wave 2 (#9339) to fix them.

**What does success look like?**

- Each fixed behaviour has an exec case that fails before the change and passes after it.

- Each behaviour change has a spec id. No id is renumbered or reused.

- The validators exit 0, and the targeted exec runs pass.

## Research Findings

**Re-verification at HEAD 3daf7d3** (0.48.0). Each item was checked against the code before planning.

| Item | Reproduces? | Evidence |
|---|---|---|
| F-13 | yes | `ship.js:1988` skips `stage_changes` unless `recorded.has('execute')`; `recorded` is a new set per `--after` call (`ship.js:2376`, filled at `:2398` and `:2413`). The resumed run starts at `--after confirm_pipeline`, so the set is empty and the next step is `dispatch_commit`. A pending stop writes no `stage_changes` history row (F-ship-resume-stage-ledger-gating-1) |
| F-8 | yes | `stageScope` (`ship.js:1414-1431`) builds `allowed` only from task Files. Spec R83 (`docs/specs/ship-sdlc.md:201`) says "an uncommitted plan file is reported as outside like any other path", and exec case `ship-strict: (e)` (`ship-prepare-exec.yaml:5312`) asserts it (F-ship-resume-stage-ledger-gating-2) |
| F-4 | yes | `hooks/stop-plan-integrity.js:40` calls `resolveHookContext(null)` and reads no stdin; `:64` finds the marker by branch (`findStateFile('plan', branchSlug)`); `:115` deletes it whatever the outcome. `initState` stamps `sessionId` from `CLAUDE_CODE_SESSION_ID` (`lib/state.js:383`), and nothing reads it for plan markers (F-stop-hook-session-ownership-1 to -4) |
| F-15 | partly | The ship hooks already gate on R73 `hookEnforcementAllowed` (`lib/state.js:1048-1058`; `stop-pipeline-continue.js:135`). A headless `claude -p` child sets its own `CLAUDE_CODE_SESSION_ID` for its tool commands (the CLI's child-env builder sets `CLAUDE_CODE_SESSION_ID: e.sessionId`), so its ledger carries a different id and the main session's hooks stay silent; exec case `stop-pipeline-continue (R73, #505): mismatched session_id does not block a foreign session` (`ship-hooks-exec.yaml:598`) covers that. The lean-wave-1 nudge came from a ship run in a subagent, which shares its parent's session id (this planner's own Bash env shows the parent id) (F-stop-hook-session-ownership-7 to -9). See Deviations |
| F-24 | yes | ship's review args are only `--committed [--auto]` (`ship.js:544`); `review.js` `parseArgs` (`:91-113`) has no plan flag; the manifest (`:681-712`) has no plan field; received-review gets `--plan` (`ship.js:556-559`) but uses it only for `allowedFiles` (F-review-plan-decision-propagation-1 to -4) |
| F-9 | yes | The validator counts tasks with `extractTasks` (`validate-plan-format.js:603`), which strips only column-0 fences (`plan-parse.js:35-37`). Execute uses `parsePlan`, whose fence walk (`walkLines`, `plan-parse.js:75-92`) also closes on an indented fence. Re-creating the lean-wave-1 Task 7 shape (3-backtick outer fence, indented inner fence) gives `extractTasks` 9 tasks and `parsePlan` 8 (F-plan-validator-fence-and-fixture-fixes-1 to -3) |
| F-7 | yes | `validate-plan-format.js:52-82` has no `--help` branch; without `--file` it exits 2 (F-plan-validator-fence-and-fixture-fixes-6) |
| F-20 | yes | ship's pr args are `--auto [--draft] [--expected-branch]` (`ship.js:717-721`); `pr.js` `parseArgs` (`:66-93`) has no testing input; pr-sdlc SKILL.md:194 infers Testing from the diff (F-ship-resume-stage-ledger-gating-4) |
| F-21 | yes | `case 'learnings_commit'` (`ship.js:2055-2057`) always emits `LEARNINGS_COMMIT_COMMAND` (`:1441`), whose `git diff --quiet` sees no change when the log is ignored; this repo's `.sdlc/.gitignore` holds `*` (F-ship-resume-stage-ledger-gating-3) |
| F-16 | yes | a targeted exec run here gave 1 pass, 2 fails (global `init.defaultBranch` unset). The two fixtures run a bare `git init -q`: `fixtures-fs/project-commit-config/setup.sh:4`, `fixtures-fs/version-sdlc-config-changelog/setup.sh:5` (F-plan-validator-fence-and-fixture-fixes-7, -8) |
| F-10 | no — dropped | see Deviations (F-wave-runner-agent-tool-depth-1 to -6) |

**Patterns found:**

- Ship exec cases drive `skill/ship.js` through `tests/promptfoo/scripts/run-ship-stepper.js` on the fixture `fixtures-fs/project-ship-stepper`. The stage-scope cases use the scenario `stage-outside-files` with `--plan-files`, `--write`, `--edit-plan` and `--fixes` (stepper `:581-592`).

- The plan-integrity hook is tested through `tests/promptfoo/scripts/run-stop-plan-integrity.js`, which builds the hook's stdin payload (`:118-124`) and runs the hook with `SDLC_STATE_DIR_OVERRIDE`. Its dataset runs under `promptfooconfig-exec-hooks.yaml`.

- Prepare-script cases call the script with `script_path` and assert the JSON with `regex` or `javascript` asserts (for example `review-prepare-post:` cases, `review-prepare-exec.yaml:122-170`; `rr-scope: (a)`, `received-review-prepare-exec.yaml:201`).

- `--plan <path>` means "plan file path" in every skill prepare script that defines it (`execute.js:82`, `received-review.js:272`, `ship.js`). `--testing-file` is used by no script (`grep -rn "testing-file" plugins/sdlc-utilities/scripts` is empty).

- Site copies under `site/src/content-source/` are byte copies of `docs/specs/` and `docs/skills/`.

- Highest spec ids today: ship-sdlc R86; plan-sdlc R68 and PF14; review-sdlc A10, P13, R17; received-review-sdlc R32; pr-sdlc A6, P19, R17.

- Existing plans and the new check: `extractTasks` and `extractTasksRaw` agree on every plan in `docs/plans/` except `m9-wRb1-ship-chain-part2.md` (14 against 12; it has unclosed fences). The validator is not run on old plans in CI, so that plan changes nothing here.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| F-10 dropped | no | no task | Verified: no wave-runner agent definition exists; the runner is the prompt template `skills/execute-plan-sdlc/wave-runner-template.md`, dispatched as a general Agent with all tools (`execute-plan-sdlc/SKILL.md:398`); `agents/ship-step-execute.md` has no `tools:` line, so it keeps Agent. With ship at depth 0 the chain is ship (0) → ship-step-execute (1) → wave-runner (2) → workers (3); the runner at depth 2 has the Agent tool, and the workers need none (`execute-worker*.md:4` lists Read, Edit, Write, Bash, Glob, Grep). The lean-wave-1 failure was the depth-3 limit with ship inside a subagent (F-17), not a defect in the plugin (F-wave-runner-agent-tool-depth-1 to -6) |
| F-15 scope | no | spec text only (R73 ownership note); no hook code change | The headless case already works (Research Findings row F-15). A subagent cannot be told apart from its parent by session id, and ship cannot run in a subagent anyway (its review needs depth, F-17). So the plan documents ownership instead of adding code |
| F-9 check form | no | compares `extractTasks` with `extractTasksRaw` (execute's fence walk), not a raw `### Task` line count | A raw count fails a correct plan: `2026-10-25-m5-w2-execute-topology.md` shows `### Task 1:` to `### Task 3:` inside a fenced example (12 raw lines, 8 tasks). The two-parser comparison catches exactly the lean-wave-1 shape |
| F-8 spec reversal | no | R83's "uncommitted plan file is reported as outside" sentence is replaced; exec case `ship-strict: (e)` is rewritten | the brief's proposal; the old rule made every lean wave stop once |
| F-13 scope | no | fixes `stage_changes` only; `review_gate` (`ship.js:1996`) and `verify_version_tag` (`:2022`) keep their `recorded` gates | the same per-call pattern exists there, but no run has failed on it; listed under Non-goals |
| F-16 scope | no | two fixtures only | about 98 fixture `setup.sh` files lack `-b main`, but only these two assert a literal branch name (F-plan-validator-fence-and-fixture-fixes-9) |
| Plan path in last task | no | the last task lists this plan under Files | the brief requires it; after Task 4 the plan file is allowed anyway |
| Out of scope | no | no jira-sdlc, setup-sdlc, version bump, plan-sdlc critique gate or cost-tier change | the wave brief excludes them |

## Decisions taken without the owner

No user was available. Each choice below is the recommended or narrowest option.

1. **F-13 condition:** `stage_changes` is emitted when the execute ledger entry is `completed`, commit is not done, and no successful `stage_changes` row follows the latest `dispatch_execute` row. The per-call `recorded` set is no longer read for this step.
2. **F-8:** the plan file is always an allowed stage path. An edited plan file is staged with the wave, like any planned file.
3. **F-4 ownership:** the plan-integrity hook skips a marker when the marker's `sessionId` and the hook's `session_id` are both set and differ. A skipped marker is neither reported nor deleted. A marker with no `sessionId` keeps today's behaviour.
4. **F-4 subagent case: option (B), no subagent coverage.** The hook checks only the session id (Decision 3). `skill/plan.js` is not changed, and no marker field records a subagent run. The subagent case is a known residual (Non-goals). Measured on 2026-11-10: no environment variable tells a subagent's tool commands apart from the main session's (`AI_AGENT=claude-code_2-1-317_agent`, `CLAUDECODE=1`, `CLAUDE_CODE_CHILD_SESSION=1`, `CLAUDE_CODE_SESSION_ID=<parent id>` and `CLAUDE_PID` are the same in both). Rejected: option (A), transcript ownership (the hook owns a marker only if its own `payload.transcript_path` records the plan-sdlc run after `skillInvoked`). Reasons, from evidence: (i) no hook or test in this repo reads the transcript content; `transcript_path` appears only in `run-stop-plan-integrity.js:121`, and `stop-plan-integrity.js` reads no stdin at all; (ii) the main transcript is large (up to 294 MB in `~/.claude/projects/-workspace-sdlc-marketplace/` today), so a cheap read needs a reverse JSONL scan bounded by `skillInvoked`; (iii) a text match is not deterministic: the main transcript of the session that started this revision contains `plan.js --output-file` three times (twice in a tool result that showed this plan, once in an Agent prompt) and never as its own Bash call, so only a structured parse of Bash `tool_use` entries can tell them apart; (iv) that parse depends on the transcript JSONL format, which the hook contract does not define. (A) is therefore not simple, cheap and deterministic.
5. **F-15:** ownership is the session. A ship run inside a subagent belongs to the parent session. A headless session owns its own run. No code change.
6. **F-24 review:** ship passes `--plan "<planFile>"` to review-sdlc. `review.js` puts the absolute path in `manifest.plan_file`. Each dimension prompt names the plan file, and the shared reviewer text says a recorded plan decision is intent. An unreadable `--plan` gives a stderr warning and `plan_file: null`; the review still runs.
7. **F-24 received-review:** a finding whose fix would reverse a recorded plan decision gets the verdict "disagree", citing the decision, and is never fixed, also under `--auto`.
8. **F-20:** ship writes the summary of the latest successful execute dispatch to a file in the state directory and passes `--testing-file "<path>"` to pr-sdlc. `pr.js` puts the text in `testingSummary` (capped at 4000 characters). An unreadable file gives a warning and `testingSummary: null`.
9. **F-21:** ship records learnings-commit `skipped` with the reason `learnings log is git-ignored` when `git check-ignore -q -- .sdlc/learnings/log.md` exits 0. The step stays in the default step list.
10. **F-9:** a new check PF15 compares the two parsers. **F-7:** `--help` and `-h` print the usage and exit 0.
11. **F-10:** dropped with evidence (Deviations).

## Key Decisions

- **Ledger, not the per-call set, decides staging (F-13).** The per-call set `recorded` only knows what the current `--after` call recorded. A resumed run starts a new call, so it forgets that execute finished. The ledger keeps the full history, so it is the right source. The alternative, writing a fake `stage_changes` row at the stop, would claim work that never ran.

- **The plan file is always allowed (F-8).** plan-sdlc writes the plan, and ship commits it with the wave. Allowing it in the stage scope is simpler than asking every plan to list itself. The alternative, keeping R83 and relying on the self-listing rule, keeps one avoidable stop per wave when a planner forgets.

- **Plan marker ownership: session id only (F-4).** The hook leaves a marker alone when the marker's `sessionId` and the payload's `session_id` differ. This covers another interactive session and a headless `claude -p` session, which stamps its own id. It does not cover the case that failed in lean wave 1: a subagent shares its parent's session id, and no environment variable tells its tool commands apart from the main session's (Decision 4). So the main session's hook can still warn about, and delete, the marker of a plan-sdlc run in a subagent of the same session. This is a known residual (Non-goals); the lean orchestration skill already tells the main session not to follow that hook. Rejected: transcript ownership, option (A) — the hook would have to parse the main transcript JSONL, which can be hundreds of MB and has no format contract, and a text match also hits tool results and Agent prompts (Decision 4). Also rejected: an "in progress" timeout, which guesses and can still delete a live marker.

- **Fail direction of the plan hook.** A marker without `sessionId`, or a payload without `session_id`, keeps today's warn-and-delete behaviour. This keeps the existing exec cases valid and keeps the warning for single-session runs. This differs on purpose from R73's fail-silent rule for ship: the plan hook is advisory and never blocks a turn.

- **F-15 stays documentation (F-15).** The headless case is already silent through R73. The subagent case cannot be fixed with session ids or with an environment value (Decision 4), and ship must not run in a subagent (F-17). So the spec records the ownership rule.

- **Plan decisions reach review through the plan path (F-24).** The orchestrator gets the path, not the decisions text. Each dimension reviewer reads the plan only when it needs to. This keeps the static prompt prefix unchanged, so the prompt cache still hits (the "This run" block is already the dynamic tail). The alternative, pasting the decisions into every prompt, costs tokens per dimension and breaks the shared prefix.

- **Two-parser check for hidden tasks (F-9).** Execute reads tasks with the fence walk of `parsePlan`; the validator used `extractTasks`. A task that only one parser sees is exactly the lean-wave-1 defect. `extractTasksRaw` uses the same fence walk as `parsePlan` and gives task numbers, so PF15 compares its numbers with `extractTasks`.

- **Testing evidence travels as a file (F-20).** The execute summary can hold quotes and newlines that do not fit safely in an args string. A file in the state directory avoids quoting problems. `pr.js` reads it into the manifest, so pr-sdlc reads a resolved field, not a raw argument.

- **Workspace mode (branch or worktree).** Ship can run in the main checkout (`ship.workspace=branch`) or in a linked git worktree. New git calls (`git check-ignore` in Task 4) run in `resolveActiveWorktreeSafe()`, the active worktree. The testing summary file (Task 10) is written under `resolveStateDir()`, which routes to the main worktree's `.sdlc/execution/`, the same place as the ship ledger. `stageScope` compares the plan path relative to the active worktree root. The plan hook (Task 5) reads markers through `findStateFile`, which already uses `resolveStateDir()`; it adds no path logic.

- **Tracking id, not a GitHub issue.** `#9339` is the wave's id in the project's todo list, not a GitHub issue, like `#9338` in lean wave 1. The PR body names `#9339` as the tracking id in its summary. It has no `Fixes #9339` or `Closes #9339` line, because that would link to an unrelated or missing GitHub issue.

- **Smallest viable cut.** The minimum is Tasks 1, 4 and 13 (F-13 and F-8: they stop every lean wave). The other tasks are named in the owner's wave scope. No task is added beyond them.

- **Failure audience.** If this ships wrong: ship-sdlc users could commit without staging, or stage a file outside the plan (Task 4); a plan-sdlc user could lose the plan-integrity warning (Task 5); a reviewer could ignore a real defect that a plan claims as intent (Tasks 7, 8); a plan with a hidden task could fail validation it passed before (Task 6).

- **Non-goals.** No change to `review_gate` or `verify_version_tag` gates. No change to the ship hooks' code or to `hookEnforcementAllowed`. No `claimSession` change. No change to the other ~96 fixtures. No pr-sdlc diff-inference change. No removal of learnings-commit from the default steps. No fix of the old plan `m9-wRb1-ship-chain-part2.md`. No subagent coverage in the plan-integrity hook: the main session's hook can still warn about, and delete, the marker of a plan-sdlc run in a subagent of the same session (known residual, Decision 4; the lean orchestration skill tells the main session not to follow that hook). No transcript reading in any hook.

## Contract Examples

**code** (Task 6):

````markdown
**Contract:**
- shape (code): `checkPF15(content: string): { id: 'PF15', status: 'pass'|'fail', message: string }` in `scripts/ci/validate-plan-format.js`.
- names: `checkPF15`, check id `PF15`.
- mirror: `checkPF2` at `validate-plan-format.js:178-216` (returns `{ id, status, message }`).
- decisions: Decision 10; Key Decisions "Two-parser check for hidden tasks".
- sync: PF15 text in `docs/specs/plan-sdlc.md` (Task 2).
````

**docs** (Task 11):

````markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/review-sdlc.md`; add a `--plan <path>` row to the Flags table; audience: end users.
- names: flag `--plan`.
- mirror: the `--post` row in the same table.
- decisions: Decision 6.
- sync: `site/src/content-source/skills/review-sdlc.md` byte-identical.
````

**openspec / spec** (Task 3):

````markdown
**Contract:**
- shape (openspec): ADD `A11`, `P14`, `R18` to `docs/specs/review-sdlc.md`; numbering continues from A10, P13, R17.
- names: `A11`, `P14`, `R18`.
- mirror: requirement style of `A10` and `P13` in the same file.
- decisions: numeric ids, never renumbered.
- sync: `skill/review.js` (Task 7) cites A11 and P14.
````

## Tasks

Thirteen tasks. Tasks 4 and 10 run in order because both change `ship.js`, the stepper and `ship-prepare-exec.yaml`. Specs (Tasks 1 to 3) come before the code that implements them.

### Task 1: ship-sdlc and pr-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend R36, R73, R83; add R87, R88, R89; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy
- Modify: `docs/specs/pr-sdlc.md` — add A7, P20, R18; appendix row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy

**Notes:** Spec first (`spec-first` guardrail). Contract for Tasks 4, 9 and 10. Cites F-ship-resume-stage-ledger-gating-1 to -4, F-stop-hook-session-ownership-7 to -9, F-review-plan-decision-propagation-1, -5.

**Acceptance criteria:**
- [ ] The texts read as rendered in the Contract; no id is renumbered or removed.
- [ ] The ship-sdlc issue-trail table has rows `| R36 | ignored learnings log, #9339 |`, `| R73 | subagent and headless ownership, #9339 |`, `| R83 | plan file allowed, #9339 |`, `| R87 | stage after resume, #9339 |`, `| R88 | review --plan, #9339 |`, `| R89 | PR testing summary, #9339 |`; the pr-sdlc trail has `| A7, P20, R18 | testing summary, #9339 |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] The headless case of F-15 is verified, not assumed: the existing hooks cases `stop-pipeline-continue (R73, #505): mismatched session_id does not block a foreign session` and `pipeline-continue (R73, #505): mismatched session_id does not hijack the session` (`ship-hooks-exec.yaml:582`, `:598`) pass in the targeted hooks run (Verification line).
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` and `cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md` exit 0.

**Contract:**
- shape (openspec): MODIFY R36, R73, R83 in `docs/specs/ship-sdlc.md`; ADD R87 (State model → Resume, after R86), R88 and R89 (Pipeline steps, after R85). Deltas:

```diff
-... The plan file itself must be committed before ship runs; an uncommitted plan file is reported as outside like any other path.
+... The plan file (`flags.planFile`, compared as a path relative to the active worktree root) is always an allowed path, so a new or edited plan file is staged with the wave.
```

```diff
 - R36: ... When `git diff --quiet -- .sdlc/learnings/log.md` reports no change, the step is a no-op (no empty chore commit). ...
+  When `git check-ignore -q -- .sdlc/learnings/log.md` exits 0 in the active worktree, ship emits no `learnings_commit` step: it records `learnings-commit` `skipped` with the reason `learnings log is git-ignored` and goes to the next step.
+  - Acceptance: exec cases whose descriptions start with `ship-lean: (learnings)`.
```

```diff
 - R73: ... it is intentional and permanent.
+  Ownership: a subagent shares its parent's session id (`CLAUDE_CODE_SESSION_ID` and the hook `session_id`), so a ship run inside a subagent is owned by the parent session, and the parent's hooks enforce it. A separate `claude -p` session stamps its own id, so the hooks of the session that launched it stay silent for its run. ship-sdlc must run at depth 0 (the main session or a headless session), because its review and execute steps dispatch two more agent layers.
```

```text
- R87: `stage_changes` is emitted when the `execute` ledger entry is `completed`, the `commit` entry is neither `completed` nor `skipped`, and no `stage_changes` history row with result `success` follows the latest `dispatch_execute` row. The per-call set of steps recorded by the current `--after` call is not consulted, so a run resumed after a `stageOutsideFiles` stop (R83) stages before it commits.
  - Acceptance: exec cases whose descriptions start with `ship-lean: (resume)`.
- R88: The review step's `args` are `--committed`, then `--auto` when `flags.auto`, then `--plan "<planFile>"` when a plan is set (review-sdlc A11).
  - Acceptance: exec cases whose descriptions start with `ship-lean: (review args)`.
- R89: When ship emits `dispatch_pr` and the latest `dispatch_execute` history row with result `success` has a non-empty `data.summary`, ship writes that text to `<stateDir>/pr-testing-<branchSlug>.md` (`resolveStateDir()`) and appends `--testing-file "<path>"` to the pr `args` and `invocation` (pr-sdlc A7). With no such row the args are unchanged.
  - Acceptance: exec cases whose descriptions start with `ship-lean: (pr testing)`.
```

  pr-sdlc deltas (ADD, numbering continues from A6, P19, R17):

```text
- A7: `--testing-file <path>` — a text file with the verification summary for the Testing section (ship-sdlc R89) (default: none)
- P20: `testingSummary` — the trimmed text of the `--testing-file` file, cut to 4000 characters; null when the flag is absent; null with a `warnings` entry when the file cannot be read.
- R18: When `testingSummary` is non-null, the Testing section reports that text and does not say that no test results exist; it may add coverage seen in the diff. When it is null, the Testing section is inferred from the diff as before.
  - Acceptance: exec cases whose descriptions start with `pr-prepare-testing:`.
```

- names: `R87`, `R88`, `R89`, `A7`, `P20`, `R18`, file `pr-testing-<branchSlug>.md`, flag `--testing-file`, field `testingSummary`.
- mirror: R82 wording (`docs/specs/ship-sdlc.md:199`) for R88; R85 placement for R88/R89.
- decisions: Decisions 1, 2, 5, 8, 9.
- sync: Tasks 4, 9, 10 cite these ids.

### Task 2: plan-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — amend R20, R21; add PF15 and R69; appendix rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy

**Notes:** Spec first. Contract for Tasks 5 and 6. Cites F-stop-hook-session-ownership-4 to -6, F-plan-validator-fence-and-fixture-fixes-1 to -6.

**Acceptance criteria:**
- [ ] The texts read as rendered in the Contract; no id is renumbered.
- [ ] The issue trail has rows `| R20, R21 | marker ownership, #9339 |`, `| PF15 | parser agreement, #9339 |`, `| R69 | validator --help, #9339 |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.

**Contract:**
- shape (openspec): MODIFY R20 (add an ownership clause after the schema sentence and amend lifecycle (b)), MODIFY R21; ADD PF15 after PF14 and R69 after R68. Deltas:

```diff
 ... The `planFilePath` sibling field stores the absolute path to the written plan file, ...
+ The state file also carries `sessionId` (stamped by `initState`, `lib/state.js`, from `CLAUDE_CODE_SESSION_ID`). A subagent's run stamps its parent's id, so the marker cannot tell it apart from the parent's own run.
-(b) **Consume-then-delete** — `hooks/stop-plan-integrity.js` MUST capture the marker file path from `findStateFile` before reading, evaluate all integrity checks, then call `deleteState(path)` regardless of integrity outcome (single-shot semantics).
+(b) **Consume-then-delete** — for a marker the hook owns (R21), `hooks/stop-plan-integrity.js` MUST capture the marker file path from `findStateFile` before reading, evaluate all integrity checks, then call `deleteState(path)` regardless of integrity outcome (single-shot semantics). A marker the hook does not own is left in place; prune-on-write (a) and the GC sweep (c) remove it.
```

```diff
-... With no plan state file the hook exits 0 silently and reads no stdin. ...
+... With no plan state file the hook exits 0 silently and reads no stdin. When a marker exists, the hook reads its stdin payload and owns the marker unless the marker's `sessionId` and the payload's `session_id` are both non-empty and differ. For a marker it does not own, the hook exits 0 silently and does not delete it. A marker without `sessionId`, or a payload without `session_id`, is owned (pre-0.49 behaviour). ...
+  - Acceptance: exec cases whose descriptions start with `stop-plan-integrity: owner`.
```

```text
- PF15: Parser agreement — the task headings that `extractTasks` finds (column-0 fences stripped) equal, by number and order, the headings that `extractTasksRaw` finds (the fence walk that execute's `parsePlan` uses). A mismatch fails and names each `Task N` that only one parser sees. Runs in the default check set.
- R69 (validator usage): `scripts/ci/validate-plan-format.js --help` (or `-h`) prints a usage text to stdout that names `--file`, `--final`, `--template`, `--markdown`, `--json`, `--root` and `--project-root` and the exit codes 0, 1 and 2, then exits 0 before any other check runs.
  - Acceptance: exec cases whose descriptions start with `plan-format-lean:`.
```

- names: `sessionId`, `session_id`, `PF15`, `R69`.
- mirror: PF12/PF13 wording (`docs/specs/plan-sdlc.md:162-163`); R67 placement for R69.
- decisions: Decisions 3, 4, 10; Key Decisions "Fail direction of the plan hook".
- sync: Tasks 5 and 6 cite these ids.

### Task 3: review-sdlc and received-review-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — add A11, P14, R18; appendix row
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy
- Modify: `docs/specs/received-review-sdlc.md` — add R33 and the `planFile` manifest field P21; appendix row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy

**Notes:** Spec first. Contract for Tasks 7 and 8. Cites F-review-plan-decision-propagation-2 to -5.

**Acceptance criteria:**
- [ ] The texts read as rendered in the Contract; numbering continues from A10, P13, R17 (review) and R32, P20 (received-review).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] Both `cmp` checks against the site copies exit 0.

**Contract:**
- shape (openspec): ADD in `docs/specs/review-sdlc.md`:

```text
- A11: `--plan <path>` — the plan the reviewed change implements; its recorded decisions are intent, not defects (default: none)
- P14: `plan_file` — the absolute `--plan` path when the file is readable; null when the flag is absent; null with a warning line on stderr when the file cannot be read (the review still runs).
- R18: When `plan_file` is non-null, the orchestrator adds the line `- Plan file (recorded decisions are intent): <plan_file>` to the "This run" block of every dimension prompt. A dimension reviewer that would report a change which the plan's `## Key Decisions`, `## Decisions taken without the owner` or `## Deviations & assumptions` section records on purpose does not report it; it reports a finding only where the code does not match the recorded decision.
  - Acceptance: exec cases whose descriptions start with `review-prepare-plan:`.
```

  ADD in `docs/specs/received-review-sdlc.md`:

```text
- P21: `planFile` — the absolute `--plan` path, or null; present in every manifest the prepare script writes.
- R33: When `planFile` is non-null, a finding whose fix would reverse a decision recorded in the plan's `## Key Decisions`, `## Decisions taken without the owner` or `## Deviations & assumptions` section gets the verdict "disagree", with the decision cited in the reply, and is never fixed, also under `--auto` and the R18 bypass.
  - Acceptance: exec cases whose descriptions start with `rr-plan:`.
```

- names: `A11`, `P14`, `R18` (review-sdlc), `P21`, `R33` (received-review-sdlc), `plan_file`, `planFile`.
- mirror: A10 and P13 style in `docs/specs/review-sdlc.md`; R28/R29 style in `docs/specs/received-review-sdlc.md:90-91`.
- decisions: Decisions 6, 7.
- sync: Tasks 7, 8, 11.

### Task 4: ship stages after a resume, allows the plan file, skips an ignored learnings log

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `pickNextStep` stage_changes condition (R87); `stageScope` allows the plan file (R83); `learnings_commit` skip (R36)
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — flags `--resume-after-fix`, `--untrack-plan`, `--ignore-sdlc`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new `ship-lean: (resume)`, `ship-lean: (learnings)` cases; rewrite `ship-strict: (e)`; add `ship-strict: (f)`

**Notes:** One task because the three changes share `pickNextStep` and the stepper; splitting them would make three tasks edit the same function in sequence. Complex because it changes the ship step state machine that every run walks. Cites F-ship-resume-stage-ledger-gating-1 to -3. The idempotency case ((resume) b) satisfies the `state-machine-idempotency` guardrail.

**Acceptance criteria:**
- [ ] `ship-lean: (resume) a`: stage-outside-files with `--write in.txt,out.txt --resume-after-fix` (out.txt deleted after the stop, then `--after confirm_pipeline` with `results/yes.json`) emits `stage_changes` with `commands` `["git add -A -- ':!.sdlc/'"]`.
- [ ] `ship-lean: (resume) b`: the same, then `--after stage_changes` (generic-ok) and a second `--after confirm_pipeline`: the last envelope is not `stage_changes`.
- [ ] `ship-strict: (e)` (renamed "an edited plan file is staged, not outside"): `--edit-plan` emits `stage_changes`, no pending question.
- [ ] `ship-strict: (f) an untracked plan file is staged, not outside`: `--untrack-plan` emits `stage_changes`.
- [ ] `ship-lean: (learnings) a`: `after-pr` with `--ignore-sdlc` and the `--gh-pr-url` value of the existing `after-pr` case (`ship-prepare-exec.yaml:2558`): no envelope has step id `learnings_commit`; `ledger.stepStatuses['learnings-commit'] === 'skipped'`.
- [ ] `ship-lean: (learnings) b`: same without `--ignore-sdlc`: the next envelope after `dispatch_pr` is `learnings_commit`.
- [ ] Existing `ship-strict: (b)`, `(c)`, `(d)` and `ship-step: (e)`, `(rf5)` cases pass unchanged.

**Contract:**
- shape (code): three edits in `skill/ship.js`.

```diff
     } else if (id === 'stage_fixes' || id === 'review_gate') {
       // R84: these repeat per review round, so only rows after the latest dispatch_review count.
       const h = historyAfter(ledger, id, 'dispatch_review');
       if (h && h.result === 'success') continue;
+    } else if (id === 'stage_changes') {
+      // R87: decided from the ledger, so a resumed run stages too.
+      const h = historyAfter(ledger, id, 'dispatch_execute');
+      if (h && h.result === 'success') continue;
     } else if (historySuccess(ledger, id)) {
       continue;
     }
@@
       case 'stage_changes':
       case 'stage_fixes': {
-        if (id === 'stage_changes' ? !recorded.has('execute') : unmetCondition('commit-fixes', ledger) !== null) continue;
+        if (id === 'stage_changes'
+          ? !(entryOf('execute') && entryOf('execute').status === 'completed' && !isDone('commit'))
+          : unmetCondition('commit-fixes', ledger) !== null) continue;
```

```diff
 function stageScope(planFile, cwd) {
@@
   for (const t of extractTasks(text)) {
     for (const e of parseFilesEntries(taskSection(t.body))) allowed.add(e.path.replace(/^\.\//, '').replace(/\/$/, ''));
   }
+  // R83: the plan file itself is always allowed.
+  const rel = path.relative(cwd, path.resolve(cwd, planFile)).split(path.sep).join('/');
+  if (rel && !rel.startsWith('..')) allowed.add(rel);
```

```diff
       case 'learnings_commit':
+        // R36: a git-ignored learnings log can never be committed.
+        if (spawnSync('git', ['check-ignore', '-q', '--', '.sdlc/learnings/log.md'], { cwd: resolveActiveWorktreeSafe(), timeout: 8000 }).status === 0) {
+          skipEntry(ledger, 'learnings-commit', 'learnings log is git-ignored');
+          skipped.push('learnings-commit');
+          continue;
+        }
         data = { commands: [LEARNINGS_COMMIT_COMMAND] };
         break;
```

  Stepper flags (scenario `stage-outside-files` unless noted):

| Flag | Effect |
|---|---|
| `--resume-after-fix` | after the stop: delete every `--write` path not in `--plan-files`, run `after('confirm_pipeline', 'results/yes.json')`; with `--again` also run `after('stage_changes', 'results/generic-ok.json')` then `after('confirm_pipeline', 'results/yes.json')` |
| `--untrack-plan` | before the `--after` call: `git rm -q --cached plan.md && git commit -q -m "fixture: untrack plan"` |
| `--ignore-sdlc` | scenario `after-pr`: write `.sdlc/.gitignore` holding `*` before the first call |

- names: `R87`, flags `--resume-after-fix`, `--untrack-plan`, `--ignore-sdlc`; skip reason `learnings log is git-ignored`.
- mirror: the R84 `historyAfter` branch (`ship.js:1971-1974`); `git check-ignore` call in `stageCommands` (`ship.js:1403`); `skipEntry` (`ship.js:1641`).
- decisions: Decisions 1, 2, 9; Key Decisions "Ledger, not the per-call set", "The plan file is always allowed", "Workspace mode".
- sync: R36, R83, R87 (Task 1).

### Task 5: plan-integrity hook acts only on a marker it owns

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/stop-plan-integrity.js` — read stdin after a marker is found; ownership check before evaluation (R21)
- Modify: `tests/promptfoo/scripts/run-stop-plan-integrity.js` — flags `--session-id <id>`, `--marker-session <id>`
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — document `sessionId` and the ownership rule, including the subagent residual
- Test: `tests/promptfoo/datasets/hook-stop-plan-integrity-exec.yaml` — three `stop-plan-integrity: owner` cases

**Notes:** Cites F-stop-hook-session-ownership-1 to -6. The hook reads stdin only after it found a marker, so the no-marker path stays stdin-free as R21 says. The existing seven cases have no `sessionId` in the marker and no `session_id` in the payload, so they keep today's result.

**Acceptance criteria:**
- [ ] `stop-plan-integrity: owner (a) foreign session marker is kept`: fixture `plan-integrity-partial`, `--marker-session other-sid --session-id main-sid` → inner exit 0, no `[plan-integrity]` text, `--report-state-files` shows the marker still present.
- [ ] `stop-plan-integrity: owner (b) same session warns and consumes`: `--marker-session main-sid --session-id main-sid` → exit 2, warning names `guardrailsEvaluated`, marker gone.
- [ ] `stop-plan-integrity: owner (c) marker without sessionId keeps old behaviour`: `--session-id main-sid` only → exit 2, marker gone.
- [ ] `git diff --quiet HEAD -- plugins/sdlc-utilities/scripts/skill/plan.js` exits 0 (no subagent field is written; Decision 4).
- [ ] The seven existing hook cases pass unchanged.

**Contract:**
- shape (code):

```diff
   if (found) {
     const markerPath = found.fullPath;
     const stateResult = readState('plan', branchSlug);
@@
     const data = stateResult.data;
+    // R21: act only on a marker this session owns.
+    let payload = {};
+    try { const raw = fs.readFileSync(0, 'utf8'); payload = raw ? JSON.parse(raw) : {}; } catch (_) { payload = {}; }
+    const hookSid = typeof payload.session_id === 'string' && payload.session_id ? payload.session_id : null;
+    const markerSid = typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : null;
+    if (hookSid && markerSid && hookSid !== markerSid) process.exit(0);
```

  State file shape (unchanged; `skill/plan.js` is not modified):

```json
{ "planIntegrity": { "skillInvoked": "<ISO>" }, "planFilePath": null, "sessionId": "<sid or null>" }
```

  Wrapper flags: `--session-id <id>` sets `payload.session_id`; `--marker-session <id>` patches `sessionId` into the fixture's plan state file before the hook runs (same patch path as `--fix-planfile-path`).

- names: `hookSid`, `markerSid`, wrapper flags above.
- mirror: stdin read in `hooks/stop-pipeline-continue.js:66-72`; `--fix-planfile-path` handling in `run-stop-plan-integrity.js:44`.
- decisions: Decisions 3, 4; Key Decisions "Plan marker ownership", "Fail direction of the plan hook".
- sync: R20, R21 (Task 2).

### Task 6: plan-format validator checks parser agreement and has --help

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — `checkPF15`; `--help`/`-h`; header comment lists PF15
- Create: `tests/promptfoo/fixtures-fs/project-plan-fence-divergence/plans/plan.md` — a plan whose Task 1 Contract has a 3-backtick `diff` fence holding an indented 3-backtick fence, followed by Task 2
- Test: `tests/promptfoo/datasets/plan-format-exec.yaml` — `plan-format-lean:` cases

**Notes:** Cites F-plan-validator-fence-and-fixture-fixes-1 to -6. The fixture reproduces the lean-wave-1 Task 7 shape; `extractTasks` sees both tasks and `extractTasksRaw` sees one.

**Acceptance criteria:**
- [ ] `plan-format-lean: (a) PF15 fails a plan whose fence hides a task`: `--file {{project_root}}/plans/plan.md --json` on the new fixture → `passed: false`, a `PF15` check with `status: fail` whose message names `Task 2`.
- [ ] `plan-format-lean: (b) PF15 passes a clean plan`: the existing `plans/test-plan.md` fixture case shape → `PF15` `status: pass`.
- [ ] `plan-format-lean: (c) --help prints usage and exits 0`: output contains `--file`, `--final`, `--template`, `--markdown`, `--root`; exit 0.
- [ ] Running the validator on this plan file passes PF15.

**Contract:**
- shape (code):

```js
// PF15 (#9339): a task only one parser sees is dropped by execute or by the checks.
function checkPF15(content) {
  const a = extractTasks(content).map(t => t.number);
  const b = extractTasksRaw(content).map(t => t.number);
  const onlyA = a.filter(n => !b.includes(n));
  const onlyB = b.filter(n => !a.includes(n));
  if (onlyA.length || onlyB.length || a.join(',') !== b.join(',')) {
    const names = [...onlyA, ...onlyB].map(n => `Task ${n}`).join(', ') || 'task order';
    return { id: 'PF15', status: 'fail', message: `Task headings differ between parsers (a nested or indented code fence?): ${names}` };
  }
  return { id: 'PF15', status: 'pass', message: `${a.length} task(s) seen by both parsers` };
}
```

```diff
   for (let i = 0; i < args.length; i++) {
     const a = args[i];
-    if (a === '--project-root' && args[i + 1]) {
+    if (a === '--help' || a === '-h') {
+      process.stdout.write(USAGE);
+      process.exit(0);
+    } else if (a === '--project-root' && args[i + 1]) {
```

  `USAGE` is the file's header comment block from `Usage:` to the `Exit codes` line, as a constant string; it lists `--project-root`, `--file`, `--json`, `--markdown`, `--final`, `--template` and `--root` and the exit codes 0, 1 and 2, as R69 requires. `checkPF15(content)` is pushed after `checkPF7(tasks)`; `extractTasksRaw` is added to the `plan-parse` import; `checkPF15` is added to `module.exports`.

- names: `checkPF15`, `USAGE`, check id `PF15`.
- mirror: `checkPF2` (`validate-plan-format.js:178-216`); `--help` in `scripts/ci/session-map.js:76-79`.
- decisions: Decision 10; Key Decisions "Two-parser check for hidden tasks".
- sync: PF15, R69 (Task 2).

### Task 7: review-sdlc takes the plan and passes it to the dimensions

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — `--plan <path>` in `parseArgs`; `plan_file` in the manifest; stderr warning on an unreadable path
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — Step 2 adds the plan-file line to each dimension prompt when `manifest.plan_file` is non-null
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — "What to Report" sentence; `## This run` plan-file line (conditional)
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — `--plan <path>` in description and `argument-hint`
- Test: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-prepare-plan:` cases

**Notes:** Cites F-review-plan-decision-propagation-2, -3, -6, -7. The plan path goes into the dynamic "This run" block, after the static prefix, so the shared prompt prefix stays byte-identical (`prompt-cache-hit-ratio` guardrail). review-sdlc SKILL.md already passes `$ARGUMENTS` through to `review.js` (SKILL.md:26).

**Acceptance criteria:**
- [ ] `review-prepare-plan: (a) --plan sets plan_file`: fixture `worktree-linked-ahead`, `--committed --base main --plan plan.md` with a `plan.md` present → manifest `plan_file` is the absolute path.
- [ ] `review-prepare-plan: (b) no --plan gives null`: `plan_file: null`.
- [ ] `review-prepare-plan: (c) unreadable --plan warns`: `--plan missing.md` → `plan_file: null`, exit 0, and stderr names `missing.md`.
- [ ] REFERENCE.md "What to Report" holds the sentence in the Contract; `grep -c "Plan file (recorded decisions are intent)" plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md plugins/sdlc-utilities/agents/review-orchestrator.md` gives 1 for each file.

**Contract:**
- shape (code):

```diff
-  let post = null;
+  let post = null;
+  let plan = null;
@@
     else if (a === '--post')        post = (i + 1 < args.length) ? args[++i] : '';
+    else if (a === '--plan' && args[i + 1]) plan = path.resolve(args[++i]);
   }
-  return { projectRoot, baseBranch, dimensionFilter, scope, setDefault, auto, post };
+  return { projectRoot, baseBranch, dimensionFilter, scope, setDefault, auto, post, plan };
```

  Manifest field (after `save_path`): `plan_file: <absolute path when fs.statSync(plan).isFile(), else null>`; an unreadable path writes `review.js warning: --plan <path> is not a readable file; plan decisions are not passed to the reviewers.` to stderr (the script's warning channel, `review.js:20`).

  REFERENCE.md "What to Report", appended sentence:

```text
When "This run" names a plan file, a change that the plan's Key Decisions, Decisions taken without the owner, or Deviations & assumptions section records on purpose is intent, not a finding. Read the plan when a finding may touch such a decision; report it only where the code does not match the recorded decision.
```

  `## This run` block, last line, written only when `plan_file` is non-null: `- Plan file (recorded decisions are intent): \`{plan_file}\``.

- names: `--plan`, `plan_file`.
- mirror: `--post` parsing (`review.js:111`); `save_path` manifest field (`review.js:697`); `## This run` lines (`REFERENCE.md:191-196`).
- decisions: Decision 6; Key Decisions "Plan decisions reach review through the plan path".
- sync: A11, P14, R18 (Task 3); review-sdlc doc (Task 11).

### Task 8: received-review declines a finding that reverses a plan decision

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/received-review.js` — `planFile` (absolute or null) in every manifest it writes (P21)
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — plan-decision rule next to "Fix scope (R28, R29)" (R33)
- Modify: `docs/skills/received-review-sdlc.md` — the rule in the verdict section
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — byte copy
- Test: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — `rr-plan:` cases

**Notes:** Cites F-review-plan-decision-propagation-4. The verdict is the model's judgment; the script only resolves `planFile` so the SKILL.md rule cites a resolved field (`flag-coherence-cross-skill` guardrail).

**Acceptance criteria:**
- [ ] `rr-plan: (a) --plan writes planFile`: the `rr-scope: (a)` invocation → `manifest.planFile` ends with `/plan.md`.
- [ ] `rr-plan: (b) no --plan gives null planFile`: the `rr-scope: (b)` invocation → `manifest.planFile === null`.
- [ ] SKILL.md holds the rule text of the Contract once (`grep -c "reverse a decision recorded in the plan" plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` gives 1).
- [ ] `cmp docs/skills/received-review-sdlc.md site/src/content-source/skills/received-review-sdlc.md` exits 0.

**Contract:**
- shape (code + docs): manifest literal gains `planFile: planFile || null,` after `allowedFiles` in each manifest object. SKILL.md, new paragraph after "Fix scope (R28, R29)":

```text
**Plan decisions (R33):** When `manifest.planFile` is non-null, read its Key Decisions, Decisions taken without the owner, and Deviations & assumptions sections. A finding whose fix would reverse a decision recorded in the plan gets the verdict "disagree"; the reply cites the decision. It is never fixed, also under `--auto` or the R18 bypass.
```

- names: `planFile`, `R33`, `P21`.
- mirror: `allowedFiles` manifest field at both manifest sites (`received-review.js:495` comment-file, `:616` PR); "Fix scope" paragraph (`SKILL.md:227-230`).
- decisions: Decision 7.
- sync: P21, R33 (Task 3).

### Task 9: pr-sdlc reads a testing summary file

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/pr.js` — `--testing-file <path>` in `parseArgs`; `testingSummary` in the output; warning on an unreadable file
- Modify: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` — Testing rule uses `testingSummary` (R18); flag in description and `argument-hint`
- Modify: `docs/skills/pr-sdlc.md` — Flags row and Testing note
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy
- Test: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — `pr-prepare-testing:` cases

**Notes:** Cites F-ship-resume-stage-ledger-gating-4. `--testing-file` is a new flag name in every skill prepare script (grep evidence in Research Findings), so it has one meaning (`flag-semantic-consistency-cross-skill` guardrail).

**Acceptance criteria:**
- [ ] `pr-prepare-testing: (a) --testing-file fills testingSummary`: a fixture file `testing.md` holding `25/25 exec cases passed` → output `testingSummary` equals that text.
- [ ] `pr-prepare-testing: (b) no flag gives null`.
- [ ] `pr-prepare-testing: (c) unreadable file warns`: `--testing-file missing.md` → `testingSummary: null` and a `warnings` entry naming `missing.md`.
- [ ] `pr-prepare-testing: (d) long text is cut to 4000 characters`.
- [ ] `cmp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md` exits 0.

**Contract:**
- shape (code + docs):

```diff
     } else if (a === '--expected-branch' && args[i + 1]) {
       expectedBranch = args[++i];
+    } else if (a === '--testing-file' && args[i + 1]) {
+      testingFile = path.resolve(args[++i]);
     }
```

  Output field: `testingSummary: string | null` (file text, trimmed, `.slice(0, 4000)`). SKILL.md line 194 becomes:

```diff
-- **Testing**: Summarize test coverage from diff; if none, say so explicitly
+- **Testing**: When `testingSummary` is non-null, report it (R18) and add coverage seen in the diff; never say that no test results exist. Otherwise summarize test coverage from the diff; if none, say so explicitly
```

- names: `--testing-file`, `testingSummary`.
- mirror: `--expected-branch` parsing (`pr.js:87`); `warnings` handling in `pr.js` result.
- decisions: Decision 8; Key Decisions "Testing evidence travels as a file".
- sync: A7, P20, R18 (Task 1); Task 10 writes the file.

### Task 10: ship passes the plan to review and the testing summary to pr

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4, Task 7, Task 9
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — review args `--plan` (R88); `dispatch_pr` testing file (R89)
- Modify: `docs/skills/ship-sdlc.md` — stage-scope plan file, learnings skip, review `--plan`, PR testing summary
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-lean: (review args)`, `ship-lean: (pr testing)` cases

**Notes:** Cites F-review-plan-decision-propagation-1, F-ship-resume-stage-ledger-gating-4. Depends on Task 4 because both edit `ship.js` and `ship-prepare-exec.yaml`.

**Acceptance criteria:**
- [ ] `ship-lean: (review args) a`: `ship.js --has-plan --plan <fixture plan>` → the `review` step `args` equal `--committed --plan "<plan>"`.
- [ ] `ship-lean: (review args) b`: with `--auto` → `--committed --auto --plan "<plan>"`.
- [ ] `ship-lean: (pr testing) a`: a stepper walk whose `--after dispatch_execute` result file is `{"success": true, "output": {"summary": "25/25 exec cases passed"}}` (the ledger stores `output` as the history row's `data`) reaches `dispatch_pr` with `data.args` ending `--testing-file "<stateDir>/pr-testing-feat-ship.md"`, and that file holds the summary.
- [ ] `ship-lean: (pr testing) b`: an execute result file without `output.summary` → pr `data.args` has no `--testing-file`.
- [ ] Existing cases that assert review or pr args still pass (update any that compare the full review args string).
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.

**Contract:**
- shape (code):

```diff
-      args: ['--committed', flags.auto ? '--auto' : ''].filter(Boolean).join(' '),
+      // R88: the plan's recorded decisions are review intent.
+      args: ['--committed', flags.auto ? '--auto' : '', planFile ? `--plan "${planFile}"` : ''].filter(Boolean).join(' '),
```

```diff
         if (id === 'dispatch_received_review') {
@@
         }
+        if (id === 'dispatch_pr') {
+          const input = prTestingInput(ledger); // R89
+          if (input) {
+            data.args = `${cs.args} ${input}`;
+            data.invocation = `skill: "${cs.skill}", args: "${data.args}"`;
+          }
+        }
```

```js
/** R89: `--testing-file "<path>"` with the latest successful execute summary, or null. */
function prTestingInput(ledger) {
  let row = null;
  for (let i = ledger.history.length - 1; i >= 0 && !row; i--) {
    const h = ledger.history[i];
    if (h.step === 'dispatch_execute' && h.result === 'success') row = h;
  }
  const text = row && row.data && typeof row.data.summary === 'string' ? row.data.summary.trim() : '';
  if (!text) return null;
  const file = path.join(resolveStateDir(), `pr-testing-${slugifyBranch(ledger.branch)}.md`);
  try { fs.writeFileSync(file, text + '\n'); } catch { return null; }
  return `--testing-file "${file}"`;
}
```

- names: `prTestingInput`, R88, R89.
- mirror: `receivedReviewInput` call site (`ship.js:2129-2134`); received-review `--plan` args (`ship.js:556-559`).
- decisions: Decisions 6, 8; Key Decisions "Workspace mode".
- sync: R88, R89 (Task 1); review `--plan` (Task 7); pr `--testing-file` (Task 9).

### Task 11: review-sdlc reference doc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 7
**Verify:** manual

**Files:**
- Modify: `docs/skills/review-sdlc.md` — Flags row for `--plan <path>`; one sentence on plan decisions
- Modify: `site/src/content-source/skills/review-sdlc.md` — byte copy

**Notes:** Cites F-review-plan-decision-propagation-6. Separate from Task 7 to keep that task at five files.

**Acceptance criteria:**
- [ ] The Flags table has a `--plan <path>` row with default `none`.
- [ ] `cmp docs/skills/review-sdlc.md site/src/content-source/skills/review-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY `docs/skills/review-sdlc.md`; Flags row:

| Flag | Description | Default |
|---|---|---|
| `--plan <path>` | The plan this change implements. Reviewers treat its recorded decisions as intent, not defects (ship-sdlc passes it). | none |

- names: `--plan`.
- mirror: the `--post` row in the same table.
- decisions: Decision 6.
- sync: site copy byte-identical.

### Task 12: two exec fixtures use an explicit main branch

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/project-commit-config/setup.sh` — `git init -q -b main`
- Modify: `tests/promptfoo/fixtures-fs/version-sdlc-config-changelog/setup.sh` — `git init -q -b main`

**Notes:** Test-only change; no spec. Cites F-plan-validator-fence-and-fixture-fixes-7, -8.

**Acceptance criteria:**
- [ ] `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "expected-branch matching current branch"` passes 3 of 3 with the global `init.defaultBranch` unset.

**Contract:**
- shape (code):

```diff
-git init -q
+git init -q -b main
```

- names: none.
- mirror: fixtures that already use `git init -q -b main` (about 40 under `tests/promptfoo/fixtures-fs/`).
- decisions: Deviations row "F-16 scope".
- sync: none.

### Task 13: CHANGELOG entries and this plan

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 4, Task 5, Task 6, Task 8, Task 10, Task 12
**Verify:** manual

**Files:**
- Modify: `CHANGELOG.md` — `[Unreleased]` entries
- Create: `docs/plans/2026-11-10-lean-w2-lean-mode-fixes.md` — this plan, committed with the wave (ship stage scope)

**Notes:** No version bump; the release is a separate ship step. The PR body names `#9339` as the tracking id and carries no `Fixes` line (Key Decisions "Tracking id, not a GitHub issue").

**Acceptance criteria:**
- [ ] `[Unreleased]` holds the entries of the Contract and nothing under `[0.48.0]` changes.
- [ ] The validator passes on this plan.

**Contract:**
- shape (docs):

```text
## [Unreleased]

### Added
- review-sdlc: `--plan <path>`; reviewers treat the plan's recorded decisions as intent (#9339).
- pr-sdlc: `--testing-file <path>`; the Testing section reports the verification summary (#9339).
- plan-sdlc: validator check PF15 (execute parser agreement) and `validate-plan-format.js --help` (#9339).

### Changed
- ship-sdlc: a run resumed after a stage-scope stop stages before it commits (#9339).
- ship-sdlc: the plan file is always inside the stage scope (#9339).
- ship-sdlc: passes the plan to review-sdlc and execute's summary to pr-sdlc; skips learnings-commit when the learnings log is git-ignored (#9339).
- plan-sdlc: the plan-integrity Stop hook leaves a marker of another session alone (#9339).
- received-review-sdlc: a finding that would reverse a recorded plan decision is declined (#9339).

### Fixed
- tests: two `--expected-branch` exec fixtures no longer depend on the global git default branch (#9339).
```

- names: none.
- mirror: the `[0.48.0]` entry style (`CHANGELOG.md:10-20`).
- decisions: none.
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code task has promptfoo exec cases, and existing case ship-strict: (e) is rewritten to match the new rule |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on exec-only configs, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the listed findings; F-10 dropped and F-15 kept to spec text |
| single-responsibility-tasks | warning | PASS | Task 4 holds three small changes to one function (`pickNextStep`), justified in its Notes; Task 13 is the wave-close task (CHANGELOG plus this plan, as the brief requires) |
| scripts-over-llm-logic | error | PASS | Logic goes into scripts (ship.js, review.js, pr.js, hook); only the plan-decision verdict is left to model judgment, with a script-resolved planFile |
| yagni | warning | PASS | No speculative abstractions; the review_gate and verify_version_tag gates are left unchanged |
| cross-skill-consistency | error | PASS | Ship, review, received-review, pr and plan are changed together with matching specs |
| pr-link-github-issue | error | PASS | #9339 is a todo tracking id, not a GitHub issue; Key Decisions "Tracking id, not a GitHub issue" and Task 13 state that the PR names it without a Fixes line |
| dry | warning | PASS | Existing helpers (historyAfter, skipEntry, the stdin-read pattern) are reused |
| kiss | warning | PASS | The simplest option was chosen for each fix, and the alternatives are rejected in Key Decisions |
| spec-first | error | PASS | Specs (Tasks 1-3) are ordered before every SKILL.md and script change |
| project-agnostic | error | PASS | Changes are in plugin code; only test fixtures are edited in-repo |
| flag-coherence-cross-skill | error | PASS | SKILL.md rules cite resolved fields (testingSummary, planFile, plan_file) |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings are introduced |
| flag-resolution-single-source | warning | PASS | Flags are resolved in the prepare scripts only |
| state-premise | error | PASS | The root problem is stated in Architecture: signals too weak for a run that spans sessions |
| smallest-viable-cut | warning | PASS | Tasks 1, 4 and 13 are named as the minimum cut, with the rest justified |
| failure-audience | warning | PASS | A Failure audience bullet is present |
| explicit-non-goals | warning | PASS | A Non-goals bullet is present |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Decisions taken without the owner and in Key Decisions |
| state-machine-idempotency | error | PASS | Case (resume) b runs the check twice and verifies no re-trigger |
| agent-dispatch-script-driven | error | PASS | Dispatch args come from ship.js output; no LLM-added parameters |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence that --testing-file is unused is given, and --plan keeps its plan-path meaning |
| workspace-mode-compatibility | error | PASS | Key Decisions has a Workspace mode entry (resolveStateDir, active-worktree git calls) |
| prompt-cache-hit-ratio | warning | PASS | The plan path goes only in the dynamic This run block, so the static prefix is unchanged |

## Suggested Review Dimensions

### UPDATE: hook-readiness (B1)

**Why:** Task 5 changes the `hooks/stop-plan-integrity.js` contract (it now reads stdin after it finds a marker and skips a marker with a different `sessionId`).

**Severity hint:** high

**Patch:** Check the plan-integrity Stop hook ownership contract: stdin `session_id` against the marker `sessionId`, the stdin read only after a marker is found, and the fail-open direction when either id is missing.

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — Check the plan-integrity Stop hook ownership contract: stdin `session_id` against the marker `sessionId`, the stdin read only after a marker is found, and the fail-open direction when either id is missing.

### UPDATE: runtime-contract (B1)

**Why:** Task 7 adds `--plan <path>` to `review.js`, Task 9 adds `--testing-file <path>` to `pr.js`, Task 10 changes ship's review and pr `args` (`--committed --plan "<plan>"`), and Task 6 adds `--help` to the validator.

**Severity hint:** high

**Patch:** Check the new CLI flags `--plan` (review.js), `--testing-file` (pr.js) and `--help`/`-h` (validate-plan-format.js), the `plan_file` and `testingSummary` manifest fields, and ship's changed review and pr args strings.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new CLI flags `--plan` (review.js), `--testing-file` (pr.js) and `--help`/`-h` (validate-plan-format.js), the `plan_file` and `testingSummary` manifest fields, and ship's changed review and pr args strings.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Task 5 makes marker deletion depend on session management, comparing `data.sessionId` with the hook's `session_id`, in `plugins/sdlc-utilities/hooks/stop-plan-integrity.js`.

**Severity hint:** high

**Patch:** Check the session-ownership logic: the marker is kept when the ids differ and the hook still deletes a marker without `sessionId`. Also confirm that a crafted stdin `session_id` or marker `sessionId` can only make the hook skip a marker (advisory, never block), never delete a marker of another session.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Check the session-ownership logic: the marker is kept when the ids differ and the hook still deletes a marker without `sessionId`. Also confirm that a crafted stdin `session_id` or marker `sessionId` can only make the hook skip a marker (advisory, never block), never delete a marker of another session.

_3 additional candidates suppressed_

## Final Shape

- A ship run that stopped on the stage scope and is resumed stages the work, then commits it.

- Ship stages the plan file with the wave, whether it is new or edited.

- The main session's plan-integrity Stop hook leaves alone the plan marker of another session (interactive or headless). A single-session plan run is checked as before. A plan-sdlc run in a subagent of the same session is not protected (known residual).

- The ship-sdlc spec states who owns a ship run that runs in a subagent or in a headless session.

- review-sdlc gets the plan from ship. Each dimension sees the plan path and treats recorded decisions as intent. received-review declines a finding that would reverse a plan decision.

- The plan-format validator fails a plan whose fences hide a task from execute, and prints its usage with `--help`.

- The PR's Testing section shows execute's verification summary.

- Ship skips learnings-commit, with a reason, when the learnings log is git-ignored.

- The two `--expected-branch` exec cases pass on any machine.

- Specs: ship-sdlc R36, R73, R83 amended and R87 to R89 added; pr-sdlc A7, P20, R18 added; plan-sdlc R20, R21 amended and PF15, R69 added; review-sdlc A11, P14, R18 added; received-review-sdlc P21, R33 added.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 F-13 ship resume after stageOutsideFiles stop stages before commit (ledger condition); exec case | Task 1, Task 4 | covered |
| 2 F-8 ship stageScope allows flags.planFile (amend spec R83) | Task 1, Task 4 | covered |
| 3 F-4 stop-plan-integrity acts only on a marker owned by the hook's session | Task 2, Task 5 | covered |
| 4 F-15 stop-pipeline-continue ownership for other-session/subagent runs; headless verified | Task 1 | covered |
| 5 F-24 ship passes plan path into review; dimensions treat decisions as intent; received-review declines | Task 3, Task 7, Task 8, Task 10, Task 11 | covered |
| 6 F-9 validate-plan-format.js fails a plan whose fence hides a task | Task 2, Task 6 | covered |
| 7 F-7 validate-plan-format.js --help | Task 2, Task 6 | covered |
| 8 F-20 ship passes execute verification summary into pr-sdlc Testing section | Task 1, Task 9, Task 10 | covered |
| 9 F-21 ship skips learnings-commit when learnings log is git-ignored | Task 1, Task 4 | covered |
| 10 F-16 two exec fixtures use git init -b main | Task 12 | covered |
| 11 F-10 verify wave-runner Agent tool at depth; drop with evidence if fine | — | covered |
| 12 Specs first with ids; exec tests; docs/site sync; CHANGELOG; plan path under last task; out-of-scope respected | Task 1, Task 2, Task 3, Task 13 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
