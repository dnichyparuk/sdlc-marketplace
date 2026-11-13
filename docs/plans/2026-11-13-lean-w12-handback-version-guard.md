# Step-agent hand-back and version guard Implementation Plan

**Commit:** `fix(#9372): ship, review - no wake timers, guard version step`
**Goal:** Stop finished ship step agents from handing back again (ledger F-48), and stop ship from releasing while a received-review decision is open or after later commits (ledger F-53).
**Architecture:** F-48: review-sdlc gets a blocking `review.js --wait-summary` call, the same shape as execute's `wave-progress --wait`, and the review step agents may not start wake timers. F-53: received-review stops on open decisions under `--auto`, and `skill/ship.js` stops on any pending question, on an open earlier step, and on commits after the release commit. Specs first; exec cases for every script change.
**Source:** conversation context (lean wave brief w12, ledger F-48 and F-53, tracking id 9372)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- F-48: a ship step agent finishes and hands back its report. Then it wakes up again and hands back the same report, many times. Each copy costs the ship session a turn.
- F-53: ship ran the version step (it makes and pushes the release commit) while received-review still had two open high-severity questions for the owner. The owner's fix then landed after the release commit. It was never reviewed by ship.

**What prompted this change now?**

- F-48 recurred in six waves (lean-w8b to lean-w11). The existing rules (ship R98, execute R91) only make the parent ignore the copies.
- F-53 happened in lean-w9a after a usage-limit stop.

**What does success look like?**

- A review step agent waits for its orchestrator with one blocking call and leaves no timer behind. Nothing wakes it after its report.
- Ship never emits the version step while a pending question or an earlier step is open.
- Ship stops with a named reason (`commitsAfterRelease`) when commits sit on top of the release commit, at the version result and on resume.

## Research Findings

**F-48 root cause, re-verified at HEAD with transcript evidence.**

- The lean-w11 ship session (`375c05ce…`) has one round-1 review step agent, `agent-a3ac626e407cb08aa` (type `sdlc:ship-step-review`). It dispatched the review orchestrator. The harness ran that orchestrator in the background, so the Agent call returned at once.
- The agent then started about 56 `Monitor` tools with `sleep 600`, `sleep 590`, … `sleep 120` to wait (transcript lines 31-175). It finally waited with a foreground `until … sleep 10` loop and handed back at 08:33:24.
- Each later timer expiry was a task notification ("Monitor "wait" ended without producing output"). Each one woke the finished agent. The harness then sent `[handback-send-enforce] Your report has not been delivered`, and the agent called `SubagentHandback` again. The counts match: 14 notifications, 15 hand-backs. The round-2 review agent shows the same pattern (8 Monitor calls, 2 hand-backs).
- `handback-send-enforce` is not in the plugin (grep of the repo and the plugin cache finds nothing). The plugin Stop hooks (`hooks/hooks.json`) are `Stop`, not `SubagentStop`. So no plugin hook makes the agent continue.
- The plugin cause is the prose. `skills/review-sdlc/SKILL.md` Step 2 says only "Wait for the orchestrator to return its summary." `agents/ship-step-review.md` and `agents/ship-step-received-review.md` say "Never end your turn while a subagent you dispatched is still running; wait for its result (ship-sdlc R97)". No blocking wait exists, so the agent improvises timers (F-ship-step-agent-wait-prose-1, F-ship-step-agent-wait-prose-3).
- A survey of all stored transcripts: `ship-step-review` started Monitor in 25 of 52 runs, `ship-step-execute` in 14 of 41 (before execute R92), `ship-step-received-review` in 2 of 30, `plan-explore-orchestrator` in 1 of 36.
- execute-plan-sdlc already fixed this class: `state/execute.js wave-progress --wait` blocks, and the rule is "never Monitor or background sleep; TaskStop every background task before returning" (execute R86, R92; F-review-wait-summary-blocking-poll-1, F-review-wait-summary-blocking-poll-7, F-ship-step-agent-wait-prose-4).

**F-53 root cause, re-verified at HEAD with transcript evidence.**

- lean-w9a ship session `f22192c6…`: the received-review agent returned `(1) status: success` with two high findings (F3, F4) as "needs discussion" because their fixes were outside the plan files (received-review R28). Its (4) said "Two owner decisions are open … Options: widen, defer" (transcript line 2282).
- After the usage-limit stop, the ship session recorded `--after dispatch_received_review` with `success: true` and no `pendingQuestion` (line 2582). `ship.js` emitted `dispatch_version` (line 2589). The release commit `a8fab24` was pushed; the owner's fix `77cec2c` landed on top. `--after dispatch_version` then failed with "release commit is not HEAD".
- At HEAD, `skill/ship.js` computes the pending question only when `!success` (F-ship-stepper-pending-stop-and-release-guard-1). Nothing in received-review turns an open "needs discussion" item into a pending question under `--auto` (F-ship-step-agent-wait-prose-6). ship SKILL.md Step 5 maps a question only "When (1) is failure" (`skills/ship-sdlc/SKILL.md:273`).
- `--after dispatch_version` checks only `checkHeadCommit(sha).landed` under `--no-tag`; it does not tell "ancestor of HEAD" from "unrelated" (F-ship-stepper-pending-stop-and-release-guard-5). The R80 re-run guard on resume asks record/skip with two shas only (F-ship-stepper-pending-stop-and-release-guard-4).
- `validPendingQuestion` strips every field except `prompt` and `options`, so new ship-made questions are built directly, like `rerunGuard` (F-ship-stepper-pending-stop-and-release-guard-2).

**Patterns and commands.**

- Spec ids: review-sdlc next is R21, received-review-sdlc next is R35, ship-sdlc R100 to R102 are free (F-spec-and-doc-id-allocation-1, -2, -3). Spec body text may not contain `#<digits>`; the issue number goes in the Issue trail (F-spec-and-doc-id-allocation-8). A SKILL.md or agent may cite an id only after the spec defines it (F-spec-and-doc-id-allocation-9).
- Every edited spec and doc has a byte copy under `site/src/content-source/`, copied with `cp` (F-spec-and-doc-id-allocation-14).
- Exec tests: `tests/promptfoo/datasets/ship-prepare-exec.yaml` drives `tests/promptfoo/scripts/run-ship-stepper.js` against `fixtures-fs/project-ship-stepper` (results come from `setup.sh`) (F-ship-stepper-pending-stop-and-release-guard-9, -10, -11). `review-prepare-exec.yaml` holds review.js cases (F-review-wait-summary-blocking-poll-6).
- The summary file is written last and not atomically (`review-consolidate.js`), so the poller treats a parse error as "not ready" (F-review-wait-summary-blocking-poll-5).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Harness re-delivery | no | keeps ship R98 and execute R91; removes the plugin's timer cause only | `handback-send-enforce` is harness code; the plugin can only make sure nothing wakes a finished agent |
| plan-explore-orchestrator | no | no change | 1 of 36 runs used Monitor; no transcript evidence of a re-delivery from it; out of the evidence scope |
| received-review open-decision options | no | options `fix`, `defer` | the w9a agent offered widen/defer; `fix` covers widen and other fixes |
| Version bump and CHANGELOG | no | not plan tasks | ship's version step bumps `plugin.json` and writes the CHANGELOG |
| Delayed-writer test wrapper for `--wait-summary` | no | not added | ready and timeout cases with static fixtures cover both exits; the poll loop is a copy of `wave-progress --wait` |

## Decisions taken without the owner

- **Fix the cause in prose plus one blocking call, not in a hook.** No plugin hook re-wakes agents; a hook cannot see harness timers. The execute R92 pattern already works there.
- **R101 checks only the dispatched steps before version** (execute, commit, review, received-review, commit-fixes). Inline steps never stay `in_progress` across a stop.
- **R102 on resume takes the oldest commit after `dispatchHead` as the release commit** when no `--after dispatch_version` recorded one. A version step makes exactly one commit first; anything after it is not part of the release.
- **R35 applies only under `--auto` with `--min-severity`** (the ship call shape, ship R82). Standalone interactive runs keep asking.

## Key Decisions

- **A blocking script call over a prose-only ban.** Prose that says "wait" with no tool made the agent invent timers. A blocking call gives it a tool that leaves nothing behind. The alternative, "end your turn and wait for the notification", makes the harness ask for an early hand-back (ledger F-38).

- **`review.js --wait-summary` over a new script.** The manifest and the summary paths already belong to review.js. A mode flag that dispatches before the git and config work keeps one entry point (F-review-wait-summary-blocking-poll-3).

- **Freshness by `commentPath`, not by file time.** A summary from an earlier review on the same branch stays at `summary_copy_path`. Its `commentPath` names an old diff directory, so comparing it with this run's `diff_dir` is exact (review spec P11).

- **A pending question wins over `success` (R100).** In w9a the agent's report carried open decisions under a success status. The script now stops on any pending question; the prose mapping in ship Step 5 makes sure the question is passed on.

- **Stop, do not repair, on commits after the release (R102).** Ship cannot safely reorder pushed commits. It names the release commit and the later commits and lets the owner decide with the existing R80 commands.

- **Smallest viable cut.** The minimum for F-48 is the blocking call plus the two agent rules (Tasks 2, 4, 6). The minimum for F-53 is R100 plus the received-review stop (Tasks 1, 5, 7). R101 and R102 are the two extra guards the brief asks for ("must not dispatch version while … a hard stop of an earlier step is unresolved"; "on --resume … detect commits after the release commit"). Task 3 is the user-doc obligation of every behaviour change.

- **Flag names do not clash.** `grep -l -- "--wait-summary" plugins/sdlc-utilities/scripts/skill/*.js` finds nothing. `--manifest` already exists in `commit.js`, `received-review.js` and `review-consolidate.js`, each time as "path of the manifest file written by the prepare step", the same meaning as here.

- **Workspace modes.** `--wait-summary` reads only the absolute paths the manifest holds (`summary_copy_path` comes from `resolveStateDir()`), so it behaves the same under `ship.workspace=branch` and `worktree`. The ship.js guards run git in `resolveActiveWorktreeSafe()`, like `rerunGuard`, and read the ledger through the existing state path.

## Non-goals and blast radius

- Not built: a change to the harness hand-back delivery; removal of ship R98 or execute R91; a guard in `plan-explore-orchestrator` or `review-orchestrator`; automatic reordering of commits after a release; any change to interactive received-review runs.

- Who fails if this ships wrong: the ship session and its owner. A wrong R100-R102 check would stop a healthy ship run (a false stop; the printed commands recover it). A wrong `--wait-summary` would make a review step wait up to its timeout per call before the orchestrator's return arrives. No consumer project data is touched.

- The tracking id 9372 is an internal register id, not a GitHub issue, so the PR names it without a `Fixes`/`Closes` keyword (guardrail `pr-link-github-issue` does not apply).

## Contract Examples

**code**

```markdown
**Contract:**
- shape (code): `node review.js --wait-summary --manifest <m> [--interval <s>] [--timeout <s>] [--grace <s>]` prints one JSON line and exits 0; bad input exits 2.
- names: `waitForSummary`, `WAIT_MAX_TIMEOUT_SECONDS`, `WAIT_MAX_GRACE_SECONDS`.
- mirror: `plugins/sdlc-utilities/scripts/state/execute.js:1294-1336` (wave-progress --wait).
- decisions: parse errors count as not ready.
- sync: review-sdlc SKILL.md Step 2 calls it with these flags.
```

**docs**

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/review-sdlc.md`; add `### Waiting for the orchestrator` at the end of `## PR Posting Flow`; audience: users of ship and review.
- names: heading `### Waiting for the orchestrator`.
- mirror: `docs/skills/review-sdlc.md` `## PR Posting Flow` section style.
- decisions: user-facing behaviour only.
- sync: byte copy under `site/src/content-source/skills/`.
```

**openspec**

```markdown
**Contract:**
- shape (openspec): ADD `R21` to `docs/specs/review-sdlc.md` under `## Dispatch and routing`; numbering continues from R20.
- names: `R21`.
- mirror: execute-plan-sdlc R92 wording.
- decisions: defaults are tuning values.
- sync: SKILL.md Step 2 cites R21.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Script tasks 4 and 5 add exec cases and re-run existing cases; tasks 6 and 7 are prose-only, verified by review |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only exec-only config with --filter-pattern targeted runs |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task traces to F-48/F-53 |
| single-responsibility-tasks | warning | PASS | Old Task 7 split into Task 7 (ship) and Task 8 (received-review); Task 5 keeps the ship.js guards together because they share one file and one dataset (one task per shared file per wave) |
| scripts-over-llm-logic | error | PASS | Guards and the wait live in ship.js and review.js |
| yagni | warning | PASS | No speculative parameters |
| cross-skill-consistency | error | PASS | Aligns with execute R92/R91, ship R98, received-review R28/R30 |
| pr-link-github-issue | error | PASS | 9372 is an internal register id |
| dry | warning | PASS | versionGuardCommands shared with rerunGuard |
| kiss | warning | PASS | One blocking call mirrors wave-progress --wait |
| spec-first | error | PASS | Spec tasks 1 and 2 precede SKILL.md tasks 6 and 7 |
| project-agnostic | error | PASS | Plugin-only changes |
| flag-coherence-cross-skill | error | PASS | R35 gates on flags.auto and flags.minSeverity |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings |
| flag-resolution-single-source | warning | PASS | Flags resolved in prepare scripts |
| state-premise | error | PASS | Context names both root problems |
| smallest-viable-cut | warning | PASS | Key Decisions states the minimum |
| failure-audience | warning | PASS | Blast radius names ship session and owner |
| explicit-non-goals | warning | PASS | Non-goals listed |
| ambiguity-stops-and-asks | error | PASS | Choices recorded |
| state-machine-idempotency | error | PASS | Case 6 tests repeated resume idempotency |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters added |
| flag-semantic-consistency-cross-skill | error | PASS | grep evidence given |
| workspace-mode-compatibility | error | PASS | Both modes stated |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 4 adds the CLI flag --wait-summary --manifest to review.js. Task 5 adds new stop reasons and question ids to ship.js.

**Severity hint:** high

**Patch:** Check the new review.js --wait-summary CLI contract (flags, JSON output, exit codes) and the new ship.js pending-question ids earlierStepOpen and commitsAfterRelease.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new review.js --wait-summary CLI contract (flags, JSON output, exit codes) and the new ship.js pending-question ids earlierStepOpen and commitsAfterRelease.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** The plan edits Markdown specs, docs, agents and SKILL.md files, none of which the dimension's current triggers cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Tasks 1-3 edit docs and site content, and no existing dimension reviews documentation quality.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Tasks

### Task 1: ship spec and user doc (R82, R97, R100-R102)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend R82 and R97, add R100-R102, amend the transition-table pending row and E10, add Issue trail rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec (`cp`)
- Modify: `docs/skills/ship-sdlc.md` — two new "Key points" bullets
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy of the doc (`cp`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only; edit only a sentence that restates R80, R82 or R97 (none found at planning time)

**Notes:**
Spec first (F-spec-and-doc-id-allocation-3, -4, -5): Tasks 5, 6 and 7 cite these ids. The R97 text cites review-sdlc R21, which Task 2 adds in the same wave; `validate-spec-shape.js` resolves ids cited in SKILL.md and agent files, not ids cited inside specs, so no dependency on Task 2 is needed, and `validate-spec-shape.js --strict` fails on a cited id the spec lacks (F-spec-and-doc-id-allocation-9). The ledger ids F-48/F-53 and 9372 go only in the Issue trail rows.

**Acceptance criteria:**
- [ ] R97 and R82 keep their ids and gain the text below; R100, R101, R102 are added after R99 under `### Pipeline steps`, each with an `  - Acceptance:` line
- [ ] The transition-table row "any `dispatch_<s>` with `success:false` and an `output.pendingQuestion`" reads "with an `output.pendingQuestion` (whatever `success` says, R100)"; E10 also names `earlierStepOpen` and `commitsAfterRelease`
- [ ] Issue trail rows added: `| R82 | open-decisions resume command (ledger F-53), #9372 |`, `| R97 | no wake timers, TaskStop before the report (ledger F-48), #9372 |`, `| R100 | pending question wins over success (ledger F-53), #9372 |`, `| R101 | no version while an earlier step is open (ledger F-53), #9372 |`, `| R102 | commits after the release commit (ledger F-53), #9372 |`
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0, and `cmp` of each edited file with its site copy is silent

**Contract:**
- shape (openspec): MODIFY R82 (append), MODIFY R97 (append), ADD R100, R101, R102. Text to add, verbatim:
  - R82 append: "A received-review pending question whose options include `defer` (open decisions, received-review R35) also stops before commit-fixes. Its `ext.commands` hold `node "<PLUGIN_ROOT>/scripts/state/ship.js" complete --step received-review --result "open decisions answered by the owner"` before the resume line, so the owner records the answer and the resumed run continues with stage_fixes and commit-fixes."
  - R97 append: "They wait for a subagent they dispatched only with the sub-skill's blocking foreground call (review-sdlc R21), never with `Monitor`, a background Bash command or a `sleep` timer, and they stop with `TaskStop` every background task they started before their final report: a timer that outlives the report wakes the finished agent, and the harness then makes it hand back again. After the final report they answer any later notification with one short line, no tool call and no new report."
  - R100: "Pending question wins over success. At `--after dispatch_<step>`, a valid `output.pendingQuestion {prompt, options}` stops the run through the pending-question path whatever `success` says: the step is not recorded and stays `in_progress`, the ledger is paused, and no later step is emitted. SKILL.md Step 5 sets `output.pendingQuestion` from a step agent report whose (4) names a question, open decisions or answer options, whatever its (1) says." Acceptance: "`--after dispatch_received_review` with `success: true` and a pendingQuestion returns `done` with `ext.reason: "pending-question"`; received-review stays `in_progress`; no `dispatch_version` is emitted."
  - R101: "No version while an earlier step is open. `skill/ship.js` emits no `dispatch_version` while the ledger entry of `execute`, `commit`, `review`, `received-review` or `commit-fixes` is `in_progress`. It stops through the pending-question path with `{id: 'earlierStepOpen', step: <name>, prompt, options: ['resume']}` and only the resume line in `ext.commands`; the version entry is not started and no `dispatchHead` is recorded." Acceptance: "with received-review `in_progress`, the walk that would reach `dispatch_version` returns `earlierStepOpen` naming received-review, and the version entry is still `pending`."
  - R102: "Commits after the release commit. (a) At `--after dispatch_version` with `success: true`, when `output.artifacts.commit` names a commit that is a strict ancestor of HEAD (it is not HEAD and `git merge-base --is-ancestor <sha> HEAD` exits 0), `skill/ship.js` records nothing and stops through the pending-question path with `{id: 'commitsAfterRelease', step: 'version', releaseCommit, head, later, prompt, options: ['record', 'skip']}`: `releaseCommit` is the full sha, `later` the shas of `git rev-list --reverse <releaseCommit>..HEAD`. This check runs before the tag and `--no-tag` checks. (b) When `dispatch_version` would be emitted again for a version entry that is `in_progress` or `failed` with a `dispatchHead` (the R80 case), and either the latest `dispatch_version` history entry names such a commit, or it names none and more than one commit lies in `dispatchHead..HEAD` (the oldest is `releaseCommit`, the rest are `later`), ship stops with the same question instead of `rerunGuard`. Both stops carry the R80 commands for the version step and the resume line. One commit after `dispatchHead` keeps R80." Acceptance: "a release commit followed by one more commit gives `commitsAfterRelease` with `later` of length 1, at `--after dispatch_version` and on the re-emission; a single moved commit still gives `rerunGuard`."
- names: `R82`, `R97` (modified); `R100`, `R101`, `R102` (new); question ids `earlierStepOpen`, `commitsAfterRelease`.
- mirror: requirement style of R80 (`docs/specs/ship-sdlc.md:143`) and R93/R94; Issue trail table at the end of the file.
- decisions: Key Decisions "A pending question wins" and "Stop, do not repair".
- sync: user doc bullets (below); site copies byte-identical.
- example: user doc bullets, added after the "Review-scope keep (R94)" bullet in `docs/skills/ship-sdlc.md`:
  - "**Open questions stop the release (R100, R101)**: a step report that carries a question stops the run, even when the step says it succeeded, and ship never starts the version step while an earlier step is still open. When received-review stops with open decisions, ship prints a `complete --step received-review` command: run it after you answered, then `--resume`."
  - "**Commits after the release commit (R102)**: when commits sit on top of the release commit, ship stops with `commitsAfterRelease`, naming the release commit and the later commits, at the version result and again on `--resume`. Record the release by hand or skip the version step with the printed commands."

### Task 2: review-sdlc and received-review-sdlc specs (R21, R35)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — add R21 under `## Dispatch and routing`, Issue trail row
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy (`cp`)
- Modify: `docs/specs/received-review-sdlc.md` — add R35 after R34, Issue trail row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy (`cp`)

**Notes:**
Ids from F-spec-and-doc-id-allocation-1 and -2; R21 mirrors execute R92 (F-review-wait-summary-blocking-poll-1). R33 gives "disagree", not "needs discussion", so R35 names only R28 scope and C19 as sources; the rule says "for any reason" so a new source is covered too.

**Acceptance criteria:**
- [ ] R21 and R35 are defined with the text below and an `  - Acceptance:` line each; no `#<digits>` in the body
- [ ] Issue trail rows: `| R21 | blocking orchestrator wait (ledger F-48), #9372 |` and `| R35 | open decisions stop an unattended run (ledger F-53), #9372 |`
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; `cmp` with the site copies is silent

**Contract:**
- shape (openspec): ADD R21 (review-sdlc), ADD R35 (received-review-sdlc). Text, verbatim:
  - R21: "Blocking orchestrator wait. When the Agent call for the orchestrator returns before the orchestrator has finished (the harness runs it in the background), the skill waits only with `skill/review.js --wait-summary --manifest <m> [--interval <s>] [--timeout <s>] [--grace <s>]`, run as one foreground Bash call with the Bash `timeout` parameter 600000 and repeated until the orchestrator's return has arrived. The call reads `summary_copy_path` and `diff_dir` from the manifest and checks the summary every `--interval` seconds (default 5). It returns when the file at `summary_copy_path` parses as JSON and its `commentPath` resolves to `<diff_dir>/review-comment.md`, after `--grace` more seconds (default 15; a larger value is clamped to 30), or at `--timeout` (default 300; a larger value is clamped to 540). A file that does not parse counts as not ready. It prints one line `{"ready":<bool>,"summaryPath":"<abs>","commentPath":"<abs>","timedOut":<bool>}` and exits 0 in both cases. A missing `--manifest`, an unreadable manifest, a manifest without `summary_copy_path` or `diff_dir`, or a bad number exits 2 with one `Error:` line on stderr. The skill never starts `Monitor`, a background Bash command, `sleep` or any other timer to wait, and it stops with `TaskStop` every background task it started before it returns. The defaults are tuning values." Acceptance: "a summary whose `commentPath` matches prints `ready: true, timedOut: false`; one that names another directory prints `ready: false, timedOut: true` at `--timeout`; `--interval abc` and a missing manifest exit 2."
  - R35: "Open decisions stop an unattended run. Under `--auto` with `flags.minSeverity` set, when one or more items whose severity ranks at or above `minSeverity` end with the verdict "needs discussion" (for any reason, for example R28 scope or C19), the skill still implements its "will fix" items, runs the R30 scope check and Steps 11.6 to 12, and then stops with a failure and a `pendingQuestion`: prompt `Open decisions: <id> (<one-line point>); … Fix them, or defer them to a follow-up?`, options `["fix", "defer"]`. A scope-check stop (R30) comes first. Without `--auto`, or without `minSeverity`, nothing changes." Acceptance: "behavioural; verified by review: an `--auto --min-severity high` run with one high "needs discussion" item returns failure with options fix and defer."
- names: `R21`, `R35`.
- mirror: execute-plan-sdlc R92 (`docs/specs/execute-plan-sdlc.md:205`); received-review R30 (`docs/specs/received-review-sdlc.md:92`).
- decisions: Key Decisions "A blocking script call", "Freshness by commentPath"; Decisions taken without the owner (R35 scope).
- sync: Task 4 implements R21's CLI; Task 6 cites R21 and R35, Task 8 cites R35; site copies byte-identical.

### Task 3: review-sdlc and received-review-sdlc user docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/review-sdlc.md` — new subsection `### Waiting for the orchestrator` at the end of `## PR Posting Flow`
- Modify: `site/src/content-source/skills/review-sdlc.md` — byte copy (`cp`)
- Modify: `docs/skills/received-review-sdlc.md` — `--auto` flag row sentence
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — byte copy (`cp`)

**Notes:**
Site copies per F-spec-and-doc-id-allocation-14; doc gaps per F-spec-and-doc-id-allocation-11 and -12. `site/src/data/skills-meta.ts` is listed under Task 8 for the copy rule; its review-sdlc and received-review-sdlc entries hold descriptions and connections only, with no wait or `--auto` stop wording, so no change is expected.

**Acceptance criteria:**
- [ ] `docs/skills/review-sdlc.md` gains a `### Waiting for the orchestrator` subsection at the end of `## PR Posting Flow` with the text below
- [ ] `docs/skills/received-review-sdlc.md`'s `--auto` row gains the sentence below
- [ ] `cmp` with both site copies is silent; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0

**Contract:**
- shape (docs): MODIFY two reference docs (audience: users running review or ship).
  - review-sdlc, new subsection `### Waiting for the orchestrator`: "When the review orchestrator runs in the background, review-sdlc waits for it with one blocking call, `node review.js --wait-summary --manifest <manifest>`. The call returns when this run's review summary is written, or after a timeout, and is repeated until the orchestrator returns. The skill starts no timers, so nothing wakes it after it reports (R21)."
  - received-review-sdlc `--auto` row, appended: "With `--min-severity`, a finding at or above that severity with the verdict "needs discussion" stops the run after the fixes, with a question (fix or defer) for you (R35)."
- names: heading `### Waiting for the orchestrator`.
- mirror: `docs/skills/review-sdlc.md` `## PR Posting Flow` section style.
- decisions: user-facing wording only.
- sync: site copies under `site/src/content-source/skills/`.

### Task 4: `review.js --wait-summary` and its exec cases (R21)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — `--wait-summary` mode dispatched at the top of `main()`
- Create: `tests/promptfoo/fixtures-fs/review-wait-summary/manifest.json`
- Create: `tests/promptfoo/fixtures-fs/review-wait-summary/summary.json`
- Create: `tests/promptfoo/fixtures-fs/review-wait-summary/manifest-other.json`
- Test: `tests/promptfoo/datasets/review-prepare-exec.yaml` — five `review-wait-summary:` cases

**Notes:**
Mirrors F-review-wait-summary-blocking-poll-1 to -5. The mode runs before any git or config work, so it is fast and works outside a repository (F-review-wait-summary-blocking-poll-3). Relative manifest paths resolve against the working directory, which lets the fixtures stay relative. Verify with: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern review-wait-summary`

**Acceptance criteria:**
- [ ] The five cases below pass with the command in Notes
- [ ] A summary file that does not parse is treated as not ready (code path present; no crash)
- [ ] The existing `review-prepare` cases still pass: same command with `--filter-pattern review-prepare`

**Contract:**
- shape (code): new function `waitForSummary({ manifestPath, intervalS, timeoutS, graceS })` in `review.js`; constants `WAIT_MAX_TIMEOUT_SECONDS = 540`, `WAIT_MAX_GRACE_SECONDS = 30`; defaults interval 5, timeout 300, grace 15. `--interval`/`--timeout` match `/^\d+$/` and are ≥ 1; `--grace` is an integer ≥ 0.

  | Condition | Exit | Output |
  |---|---|---|
  | summary parses and `path.resolve(commentPath) === path.resolve(diff_dir, 'review-comment.md')` | 0 (after grace) | `{"ready":true,"summaryPath":"<abs>","commentPath":"<abs>","timedOut":false}` |
  | timeout reached first | 0 | `{"ready":false,…,"timedOut":true}` |
  | `--manifest` missing | 2 | stderr `Error: --wait-summary requires --manifest` |
  | manifest unreadable or lacks `summary_copy_path`/`diff_dir` | 2 | stderr `Error: manifest unreadable: <path>` or `Error: manifest lacks summary_copy_path or diff_dir` |
  | bad number | 2 | stderr `Error: --interval requires an integer >= 1` (likewise `--timeout`; `--grace … >= 0`) |

  `commentPath` in the output is `path.resolve(diff_dir, 'review-comment.md')`.
- names: `--wait-summary`, `--manifest`, `waitForSummary`.
- mirror: `plugins/sdlc-utilities/scripts/state/execute.js:1294-1336` (tick loop with `setTimeout`, grace then finish).
- decisions: Key Decisions "`review.js --wait-summary`" and "Freshness by commentPath".
- sync: Task 6 SKILL.md call; R21 text in Task 2.
- example: fixtures — `manifest.json` = `{"summary_copy_path":"summary.json","diff_dir":"diff"}`; `summary.json` = `{"schemaVersion":1,"verdict":"APPROVED","commentPath":"diff/review-comment.md"}`; `manifest-other.json` = `{"summary_copy_path":"summary.json","diff_dir":"other"}`. Cases (vars `script_path: "repo://plugins/sdlc-utilities/scripts/skill/review.js"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/review-wait-summary"`): (1) `--wait-summary --manifest manifest.json --grace 0` → JSON `ready` true, `timedOut` false; (2) `--wait-summary --manifest manifest-other.json --interval 1 --timeout 1` → `ready` false, `timedOut` true; (3) `--wait-summary` → contains `Error: --wait-summary requires --manifest`; (4) `--wait-summary --manifest missing.json` → contains `Error: manifest unreadable`; (5) `--wait-summary --manifest manifest.json --interval abc` → contains `Error: --interval requires an integer >= 1`.

### Task 5: ship.js guards R100, R101, R102 and the R82 command

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — R100 pending rule, R101 guard, R102 helper and both hooks, R82 extra command
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — new scenarios `guard-received-open`, `guard-earlier-open`, `guard-release-ahead`, `guard-release-ahead-resume` (header comment entries)
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — results `received-review-open.json` (success true + pendingQuestion options `["fix","defer"]`) and `received-review-open-fail.json` (same, success false)
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — six `ship-guard:` cases

**Notes:**
Hooks per F-ship-stepper-pending-stop-and-release-guard-1, -2, -3, -4, -5, -7; test shape per -9, -10, -11. This is the riskiest task: ship.js drives every ship run, so the existing rerun and forward cases must stay green. The new checks only add stops; they never change a path that ends in a dispatch today, except R100 (success with a question). Verify with: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-guard|ship-rerun|ship-fwd|ship-step"`

**Acceptance criteria:**
- [ ] The six new cases below pass, and the existing `ship-rerun`, `ship-fwd` and `ship-step` cases still pass, with the command in Notes
- [ ] No existing case is edited unless its old expectation contradicts R100-R102 (none is expected to)
- [ ] `git rev-list`/`merge-base` calls use `spawnSync('git', [...])` with an 8000 ms timeout, like `checkHeadCommit`

**Contract:**
- shape (code): changes in `plugins/sdlc-utilities/scripts/skill/ship.js`:

  ```diff
     const pq = after.startsWith('dispatch_') && !success ? (validPendingQuestion(output.pendingQuestion) || midWave) : null;
  +  // becomes (R100; R102a joins as a ship-made question):
  +  const pq = after.startsWith('dispatch_')
  +    ? (validPendingQuestion(output.pendingQuestion) || (!success ? midWave : null) || releaseAhead)
  +    : null;
  ```

  `releaseAhead` is computed just before, only when `name === 'version' && success`: `commitsAfterRelease(output.artifacts && output.artifacts.commit, resolveActiveWorktreeSafe())`. In the `if (pq)` block: when `pq === releaseAhead` return `pendingStop(pq, false, versionGuardCommands(pq.releaseCommit))`; when `after === 'dispatch_received_review'` and `pq.options.includes('defer')` return `pendingStop(pq, false, [`node "${STATE_SHIP_SCRIPT}" complete --step received-review --result "open decisions answered by the owner"`])` (R82).

  New helper (beside `rerunGuard`):

  ```js
  /** R102: null unless sha is a commit and a strict ancestor of HEAD. */
  function commitsAfterRelease(sha, cwd) // -> null | { id: 'commitsAfterRelease', step: 'version', releaseCommit, head, later: string[], prompt, options: ['record','skip'] }
  ```

  Prompt: `The version step's release commit ${releaseCommit} is not HEAD: ${later.length} commit(s) landed after it (${later short shas joined by ", "}). They are not part of the release, and this run did not review them. Record the release by hand, or skip the version step?`

  `versionGuardCommands(sha)` returns the two R80 strings, with the release sha: `node "${STATE_SHIP_SCRIPT}" complete --step version --result "release commit ${sha} recorded by hand"` and `node "${STATE_SHIP_SCRIPT}" skip --step version --reason "re-run guard: release already made"`; the R80 `rerunGuard` branch reuses it.

  `pickNextStep`, `default:` branch, `id === 'dispatch_version'`, in this order before the existing `rerunGuard` call:

  | Check | Result |
  |---|---|
  | an entry of `execute`, `commit`, `review`, `received-review`, `commit-fixes` is `in_progress` (R101) | `{ pending: { id: 'earlierStepOpen', step, prompt: `The ${step} step is still in progress (an open question or a stop it has not recovered from). Ship does not run the version step before it ends. Resume the run to finish it.`, options: ['resume'] }, commands: [] }` |
  | version entry `in_progress`/`failed` with `dispatchHead`, and `commitsAfterRelease(lastHistory(ledger,'dispatch_version')?.data?.artifacts?.commit)` is non-null (R102b) | `{ pending: <that>, commands: versionGuardCommands(rel) }` |
  | same entry, no recorded commit, `git rev-list --reverse <dispatchHead>..HEAD` has ≥ 2 shas (R102b) | question built from the oldest sha as `releaseCommit`, the rest as `later` |
  | otherwise | existing `rerunGuard` (R80) unchanged |

- names: `commitsAfterRelease`, `versionGuardCommands`, `earlierStepOpen`, scenarios `guard-*`.
- mirror: `rerunGuard` (`ship.js:2011-2037`) and its call site (`ship.js:2225-2236`); stepper scenario `rerun-version-moved` (`run-ship-stepper.js:512-528`); case `ship-rerun: (version) moved HEAD stops with rerunGuard` (`ship-prepare-exec.yaml:5025-5046`).
- decisions: Key Decisions "A pending question wins", "Stop, do not repair"; Decisions taken without the owner (R101 step list, R102 oldest commit).
- sync: R100-R102 and R82 text from Task 1.
- example: the six cases (description prefix `ship-guard:`):
  1. `ship-guard: (R100) received-review success with a pendingQuestion stops before version` — `guard-received-open` reaches `dispatch_received_review` and answers with `results/received-review-open.json`: `status` `done`, `ext.reason` `pending-question`, no `step`, received-review `in_progress`, ledger `paused`.
  2. `ship-guard: (R82) open decisions print the received-review complete command` — same scenario with `--result results/received-review-open-fail.json`: `ext.commands[0]` matches ` complete --step received-review --result "open decisions answered by the owner"$`, last command `/sdlc:ship-sdlc --resume…`.
  3. `ship-guard: (R101) version is not dispatched while received-review is in progress` — `guard-earlier-open` seeds a ledger with received-review `in_progress` and commit-fixes done, then walks from a step before `dispatch_version` (for example `--after stage_fixes`): `ext.pendingQuestion.id` `earlierStepOpen`, `step` `received-review`, version entry still `pending` with no `dispatchHead`.
  4. `ship-guard: (R102) release commit followed by a commit stops at the version result` — `guard-release-ahead` reaches `dispatch_version`, makes commit R then commit F, writes a result with `artifacts.commit` = R, calls `--after dispatch_version`: `id` `commitsAfterRelease`, `releaseCommit` = R, `later` = [F], version `in_progress`, commands length 3.
  5. `ship-guard: (R102) resume after a version step that ran ahead stops with commitsAfterRelease` — `guard-release-ahead-resume`: as `rerun-version-moved` but two commits after dispatch: re-emission gives `commitsAfterRelease` (not `rerunGuard`) with `later` length 1.
  6. `ship-guard: (R102) repeated resume is idempotent` — `guard-release-ahead-resume` emits a third time: same `pendingQuestion` and `commands` as the second call, version entry unchanged, history grows by one (copy `ship-rerun: (version) repeated call is idempotent`).

### Task 6: review-sdlc Step 2 wait and review step agent prose (R21, R97)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — Step 2 wait paragraph
- Modify: `plugins/sdlc-utilities/agents/ship-step-review.md` — line 15 rule
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — line 15 rule and the R35 line
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — check only; edit only a sentence about how the skill waits for the orchestrator
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — check only (same rule)

**Notes:**
Prose only; behavioural, verified by review (no headless or behavioural runs). Root cause: F-ship-step-agent-wait-prose-1, -3, -4; REFERENCE.md and EXAMPLES.md are listed for the project copy rule and held no wait wording at planning time. The final sentence about later notifications copies `agents/ship-step-execute.md:15`, which is the agent-side guard against a second hand-back. The `<PLUGIN_ROOT>` substitution already exists in review-sdlc Step 0, so the new block uses it the same way. Check: `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Acceptance criteria:**
- [ ] review-sdlc SKILL.md Step 2: the line "Wait for the orchestrator to return its summary." is replaced by the block below
- [ ] Both agent files: line 15 is replaced by the text below; ship-step-received-review.md also gains the R35 sentence
- [ ] `grep -rn "wait for its result (ship-sdlc R97)" plugins/` finds nothing

**Contract:**
- shape (code): prose replacements, verbatim.

  ```diff
  - Wait for the orchestrator to return its summary.
  + Wait for the orchestrator to return its summary (R21). When the Agent call returns before the
  + orchestrator has finished, wait only with this call, run as one plain Bash call with the Bash
  + `timeout` parameter 600000:
  +
  + ```bash
  + node "<PLUGIN_ROOT>/scripts/skill/review.js" --wait-summary --manifest "<MANIFEST_FILE>"
  + ```
  +
  + It prints one JSON line. Repeat the call until the orchestrator's return has arrived. Never start
  + `Monitor`, a background Bash command, `sleep` or any other timer to wait. Before you return, stop
  + with `TaskStop` every background task you started that is still running.
  ```

  Agent line 15, both files:

  ```diff
  - Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Never end your turn while a subagent you dispatched is still running; wait for its result (ship-sdlc R97).
  + Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Never end your turn while a subagent you dispatched is still running; wait for it only with the skill's blocking wait call (review-sdlc R21), never with `Monitor`, a background Bash command or a `sleep` timer. Before your final report, stop with `TaskStop` every background task you started. After your final report, answer any later notification with one short line, no tool call and no new report (ship-sdlc R97).
  ```

  ship-step-received-review.md, new paragraph after line 15: "Under `--auto` with `--min-severity`, an item at or above that severity with the verdict "needs discussion" is an open decision: return status failure, with the question and the options `fix` and `defer` in (4) (received-review-sdlc R35)."
- names: R21, R35, R97 citations.
- mirror: `plugins/sdlc-utilities/agents/ship-step-execute.md:15`; `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:383`.
- decisions: Key Decisions "A blocking script call".
- sync: Task 4 CLI flags; Task 1 R97 text; Task 2 R21 text.

### Task 7: ship Step 5 pending-question mapping (R100)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 5 `dispatch_*` mapping sentence
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only; edit only a sentence that restates the Step 5 mapping or R80/R97
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only; edit only a sentence that says a dispatch stops on a question only when it failed
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only (same rule)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only (same rule)

**Notes:**
Prose only; behavioural, verified by review. The four companions are listed because the project copy rule requires every companion of a skill whose spec changes (`.sdlc/config.json` `plan.copyRules`); a grep at planning time found no sentence in them that states the Step 5 mapping, R97 or the version re-run guard, so no edit is expected. Root cause of the mapping gap: F-ship-stepper-pending-stop-and-release-guard-1 and the w9a transcript (Research Findings). Check: `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Acceptance criteria:**
- [ ] ship-sdlc SKILL.md Step 5 sentence is replaced as below
- [ ] `grep -rn "When (1) is failure and (4) names a question" plugins/sdlc-utilities/skills/ship-sdlc/` finds nothing
- [ ] The validator exits 0

**Contract:**
- shape (code): prose, verbatim.

  ```diff
  - When (1) is failure and (4) names a question the sub-skill could not ask, set `output.pendingQuestion` to `{"prompt": "<the question>", "options": ["<option keyword>", …]}` using the option keywords the sub-skill listed.
  + When (4) names a question, open decisions or answer options, set `output.pendingQuestion` to `{"prompt": "<the question>", "options": ["<option keyword>", …]}` using the option keywords the sub-skill listed, whatever (1) says; `ship.js` then stops the run (R100). Never answer such a question yourself.
  ```
- names: R100.
- mirror: the existing Step 5 `dispatch_*` bullet in `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:273`.
- decisions: Key Decisions "A pending question wins over success".
- sync: Task 1 R100, Task 5 R100 code.

### Task 8: received-review open-decision stop (R35)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — new "Open decisions (R35)" paragraph after the Step 11 scope check
- Modify: `site/src/data/skills-meta.ts` — check only; edit only if the received-review-sdlc or review-sdlc entry describes `--auto` as never stopping
- Create: `docs/plans/2026-11-13-lean-w12-handback-version-guard.md` — this plan file; already written, listed so ship stages it (do not edit)

**Notes:**
Prose only; behavioural, verified by review. Nothing in received-review stops on an at-threshold "needs discussion" item today (F-ship-step-agent-wait-prose-6); the stop copies the R30 scope-check pattern. `skills-meta.ts` is listed for the project copy rule; at planning time its entries held descriptions and connections only. Check: `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exit 0.

**Acceptance criteria:**
- [ ] received-review SKILL.md has the paragraph below directly after the "Exit 0: continue. Exit 1 or 2: stop. …" paragraph of the scope check
- [ ] Both validators exit 0

**Contract:**
- shape (code): new paragraph, verbatim: "**Open decisions (R35):** when `flags.auto` is true and `flags.minSeverity` is set, and one or more items at or above `minSeverity` have the verdict "needs discussion", finish Steps 11.6 to 12 as usual (a scope-check stop above comes first). Then stop: return failure with `pendingQuestion` `{"prompt": "Open decisions: <id> (<one-line point>); … Fix them, or defer them to a follow-up?", "options": ["fix", "defer"]}`. Do not implement those items."
- names: R35.
- mirror: the R30 scope-check stop paragraph in `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:408-416`.
- decisions: Decisions taken without the owner (R35 scope, options fix/defer).
- sync: Task 2 R35, Task 5 R82 `defer` detection, Task 6 agent sentence.

## Final Shape

When all tasks are done:

- A review step agent waits for its background orchestrator with one blocking `review.js --wait-summary` call. It starts no `Monitor` or sleep timers and stops any background task before it reports. So nothing wakes it after the report, and the harness has no reason to make it hand back again. Ship R98 and execute R91 stay as the backstop.

- received-review, run by ship, stops with a fix-or-defer question when a finding at the threshold needs the owner. Ship passes that question on even if the step said "success".

- `ship.js` never emits the version step while a pending question or an earlier dispatched step is open.

- When commits sit on top of the release commit, ship stops with `commitsAfterRelease`, at the version result and again on resume, naming the commits. The owner decides with the printed commands.

- Specs, user docs and their site copies describe all of this; exec cases cover every script change.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 1 | 1 |
| Correctness | 0 | 2 | 0 | 2 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 F-48 root cause and plugin fix | Task 1, Task 2, Task 4, Task 6 | covered |
| 2 F-53 no version while a question or earlier step is open | Task 1, Task 5, Task 7, Task 8 | covered |
| 3 F-53 commits after the release commit stop | Task 1, Task 5 | covered |
| 4 docs, specs, site copies, plan file | Task 1, Task 2, Task 3, Task 8 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
