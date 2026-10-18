# `/ship-sdlc` — Full Pipeline Orchestrator

## Overview

Chains six sub-skills into a single end-to-end shipping pipeline: execute the plan, commit, review, fix critical issues, version, and open a PR. Evaluates review findings against a configurable severity threshold and conditionally triggers a fix loop, keeping feature work and review fixes as separate commits. Persists pipeline state after each step so a crashed run can be resumed from where it left off.

---

## Who Should Use This

This skill is for **expert users working on projects with established quality guardrails**. It trusts your project's automated gates — review dimensions, test suites, commit conventions — to make decisions on your behalf. Weak guardrails produce weak automated reviews, and issues slip through silently.

**Before using `/ship-sdlc`, your project should have:**

- **Review dimensions configured** via `/setup-sdlc --dimensions` — these drive the automated review step. Without dimensions, `/review-sdlc` has nothing to evaluate against.
- **A passing test suite** — the pipeline does not run tests itself. It assumes your CI or pre-commit hooks catch regressions.
- **Commit conventions** — `/commit-sdlc` detects and follows your project's commit style. If you have no conventions, it still works, but the generated messages will be generic.

**If your project isn't there yet:**

- No review dimensions? Start with `/setup-sdlc --dimensions` to scaffold them.
- No commit conventions? `/commit-sdlc` works standalone and will establish a style from your existing history.
- Want to ship a single step? Each sub-skill (`/commit-sdlc`, `/pr-sdlc`, etc.) works independently. `/ship-sdlc` is the orchestrator, not a prerequisite.

**The philosophy:** this skill automates the sequencing and decision-making between steps. It does not replace the quality of each step. A pipeline is only as strong as the review dimensions, test coverage, and conventions behind it.

---

## Usage

```text
/ship-sdlc [--auto] [--steps <csv>] [--quality full|balanced|minimal] [--plan <path>] [--bump patch|minor|major|<label>] [--draft] [--dry-run] [--resume] [--init-config] [--gc] [--ttl-days <N>]
```

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--auto` | Non-interactive mode. Forwards `--auto` to all sub-skills that support it (commit-sdlc, received-review-sdlc, version-sdlc, pr-sdlc). No pause points — received-review-sdlc auto-dispatches fixes (R71) and version-sdlc skips the release approval prompt (R20). | Off |
| `--steps <csv>` | Comma-separated list of steps to run, fully replacing the resolved step list. Valid values: `execute`, `commit`, `review`, `version`, `verify-openspec` (opt-in, OpenSpec-gated), `archive-openspec`, `pr`, `verify-pipeline` (opt-in), `await-remote-review` (opt-in), `learnings-commit`. The single source of truth for pipeline composition is `ship.steps[]` in `.sdlc/local.json`; CLI `--steps` is a one-shot override. | From config or built-in defaults |
| `--quick` | Run the project's quick step profile (`ship.quick` in `.sdlc/local.json`) instead of `ship.steps[]`. Useful for fast local iterations (e.g. execute+commit+pr without review or versioning). Mutually exclusive with `--steps` (R-quick-5). Requires `ship.quick` to be configured (R-quick-6). | Off |
| `--quality <full\|balanced\|minimal>` | Forwarded to execute-plan-sdlc as `--quality` (model tier). Only forwarded when the user explicitly passes `--quality` to ship; otherwise execute-plan-sdlc applies its own selection. (Renamed from `--preset` in #190 to disambiguate from `--steps`.) | Not forwarded |
| `--bump patch\|minor\|major\|<label>` | Version bump type forwarded to version-sdlc. The `<label>` form (e.g. `--bump rc`, `--bump beta`) is forwarded verbatim and interpreted by version-sdlc as `--bump patch --pre <label>`. Labels must match `^[a-z][a-z0-9]*$` (lowercase, start with a letter, alphanumeric). Example: `ship-sdlc --bump rc` produces a `1.2.4-rc.1` style release. | `patch` (or `version.preRelease` from `.sdlc/config.json` when set and no CLI `--bump` is passed — see R63) |
| `--draft` | Create the PR as a draft. | Off |
| `--dry-run` | Display the full pipeline plan and stop. No steps are executed. | Off |
| `--resume` | Resume from the most recent state file for the current branch. Completed steps are skipped; in-progress steps are retried. | Off |
| `--init-config` | Launch interactive config creation for `.sdlc/local.json`, then stop. No pipeline execution. | Off |
| `--openspec-change <name>` | Override auto-detected change. Auto-detection matches by branch name or git diff; use this flag when multiple active changes exist or detection fails. | — |
| `--gc` | Prune stale ship- and execute- state files from `.sdlc/execution/`, then stop without running the pipeline. A file is pruned only when it is older than the TTL AND its branch is no longer in `git branch --list`. Fixes orphan accumulation from interrupted runs (issue #223). | Off |
| `--ttl-days <N>` | TTL in days used by `--gc` and the terminal cleanup step. Files newer than this are kept regardless of branch existence (in-flight pipelines on detached HEAD or freshly-deleted branches must not be wiped). Configurable via `state.gc.ttlDays` in `.sdlc/config.json`; CLI overrides config. | `7` (or `state.gc.ttlDays`) |
| `--plan <path>` | Explicit path to the active plan markdown (the old autodiscovery flag was renamed in #505 — no back-compat alias for the previous name). Forwarded to execute-plan-sdlc as `--plan <path>`. Required whenever the `execute` step will run; plan autodiscovery was removed (see note below). | Required when `execute` runs; unset otherwise |

To enable post-PR CI verification, add `verify-pipeline` to `ship.steps` in `.sdlc/local.json` (or pass it via `--steps`). To await an automated reviewer's verdict, add `await-remote-review`. See R41 / R50 in `docs/specs/ship-sdlc.md`. To validate implementation completeness against the spec before archiving, add `verify-openspec` between `version` and `archive-openspec` — requires a matched OpenSpec change (`flags.openspecChange`, or auto-detection by branch name or git diff); the step is skipped with a clear reason when neither is present.


**Workspace is auto-detected (#378, #379):** There is no workspace flag. ship-sdlc derives the workspace from your cwd and current branch — on the **main worktree on the default branch** it auto-creates a feature branch (`git checkout -b`); on a **feature branch or inside a manual git worktree** it runs in place. The removed flags `--workspace`, `--branch`, and `--tree` are rejected with a clear error. The version step always runs when in `steps[]` (tags are repo-global, writable from any checkout) — there is no worktree-mode version skip or `skip-version-check` PR label.

**Removed (#190 hard-remove):** `--preset` and `--skip` are no longer accepted. Passing either produces an error pointing at `--steps <csv>` (for step composition) and `--quality <full|balanced|minimal>` (for the execute-plan-sdlc model tier). Legacy on-disk v1 configs (`ship.preset`/`ship.skip`) are still auto-migrated to v2 by `lib/config.js`.

**Removed: plan autodiscovery (#505):** ship-sdlc no longer scans `plansDirectory` (or any directory) for a recently-modified plan file. When a plan is present in the conversation and the `execute` step is not skipped, `--plan <path>` is now required — pass the plan document explicitly (see [Prerequisites](#prerequisites) and [`/plan-sdlc`](plan-sdlc.md), which writes the plan files this flag points at). Without it, ship-sdlc halts before invoking execute-plan-sdlc:

```
ship-sdlc cannot run the "execute" step without a plan document. Fix: re-run with --plan <path-to-plan.md>. Why: plan autodiscovery was removed (#505). It picked the most recently modified *.md in ~/.claude/plans/, which is shared across repositories — it could hand this repo a plan written for a different one and implement it here. If you did not mean to run execute, drop --has-plan (or omit execute from --steps) and the pipeline will skip it.
```

`--has-plan` in the message above is set internally by ship-sdlc's own step-eligibility signal (whether the `execute` step is eligible to run) — it is not a flag you pass directly.

An invalid `--plan` path produces one of:

```
--plan "<path>" does not exist. Resolved to: <resolved-path>. Fix: check the path, or run /plan-sdlc first to produce one.
```

```
--plan must point at a .md plan document. Got: <resolved-path>. Fix: pass the plan markdown itself, not its directory or a state file.
```

To omit the `archive-openspec` step from a single run: `--steps <csv>` listing the desired steps without `archive-openspec`. Or omit it from `ship.steps[]` in `.sdlc/local.json` for a persistent change.

---

## How the Pipeline Works

The pipeline runs up to 10 canonical steps sequentially (depending on which opt-in steps are configured). Two steps are conditional on the review verdict. In interactive mode (no `--auto`), received-review-sdlc and version-sdlc pause for human sign-off; in `--auto` mode both proceed without pausing (R20, R71). The final step (`learnings-commit`) is a no-op when no learnings were captured this run.

```
                          /ship-sdlc
                              |
                    Step 1: Load Config
                    Parse Flags, Detect Context
                              |
                    Step 2: Build Pipeline Plan
                    (auto-skip logic applied)
                              |
                    Step 3: Validate Pipeline
                    (gh auth, branch checks)
                              |
                    Step 4: Confirm
                    (dry-run stops here)
                              |
               +--------------+--------------+
               |              |              |
           [skipped?]    [skipped?]     [always]
               |              |              |
   +-----------+    +---------+    +---------+
   |                |              |
   v                v              v
Step 5a:       Step 5b:       Step 5c:
execute-       commit-sdlc    review-sdlc
plan-sdlc      (--auto if     (--committed)
(--quality X    auto mode)          |
 if forwarded)                      |
   |                |              |
   | git add -A     |    +---------+---------+
   +------->--------+    |                   |
                         v                   v
                   [critical/high       [medium/low/info
                    findings?]           or no findings]
                         |                   |
                         v                   |
                    Step 5d:                 |
                    received-review-sdlc     |
                    (pauses in interactive;  |
                     auto-proceeds w/ R71)   |
                         |                   |
                    [changes made?]          |
                    yes  |  no               |
                         v                   |
                    Step 5e:                 |
                    commit-sdlc              |
                    (fix commit)             |
                         |                   |
                         +----->-----+<------+
                                     |
                                     v
                   [skipped?]   Step 5f:
                        +-----> version-sdlc
                        |       (pauses in interactive;
                        |        skips approval w/ --auto)
                        |            |
                        +-----<------+
                                     |
                       [verify-openspec ∈ steps[]      (opt-in, OpenSpec-gated)
                        AND matched change exists?]
                                     |
                                     v
                                Step 5f-i:
                                verify-openspec
                                (Agent: /opsx:verify
                                 --change <name>;
                                 verdict: satisfied /
                                 unsatisfied / error;
                                 unsatisfied → AskUser
                                 or warn+record under
                                 --auto)
                                     |
                       [archive-openspec ∈ steps[]?]   (opt-in, OpenSpec-gated)
                                     |
                                     v
                                Step 5f-ii:
                                archive-openspec
                                (inline Bash;
                                 /opsx:archive)
                                     |
                                     v
                                Step 5g:
                                pr-sdlc
                                (--auto, --draft
                                 if applicable)
                                     |
                       [verify-pipeline ∈ steps[]?]
                                     |
                                     v
                                Step 5g-i:    (opt-in, R41-R49)
                                verify-pipeline
                                (poll gh pr checks;
                                 on failure: AskUserQuestion
                                 or dispatch
                                 verify-pipeline-sdlc
                                 under --auto)
                                     |
                       [await-remote-review ∈ steps[]?]
                                     |
                                     v
                                Step 5g-ii:   (opt-in, R50-R56)
                                await-remote-review
                                (poll for Copilot/etc
                                 review; on actionable
                                 dispatch
                                 received-review-sdlc)
                                     |
                                     v
                                Step 5h:
                                learnings-commit
                                (inline shell —
                                 no-op if log unchanged)
                                     |
                                     v
                              Step 6: Summary
                              (decisions log,
                               deferred findings,
                               state file cleanup)
```

**Key points:**

- **Double-commit pattern**: The feature commit (step 5b) and the review fix commit (step 5e) are separate. This keeps feature work and review fixes distinct in git history.
- **No mandatory pause points in `--auto` mode**: `--auto` is forwarded to received-review-sdlc (which auto-dispatches fixes without sign-off, enforced by the `block-askuserquestion-auto.js` PreToolUse hook — R71) and to version-sdlc (which skips the release approval prompt). In interactive mode (no `--auto`), received-review-sdlc pauses for human sign-off and version-sdlc pauses for release approval.
- **Workspace auto-detection (R60, fixes #378, #379)**: ship-sdlc derives the workspace from cwd + current branch via `lib/git.js::deriveWorkspace` — there is no flag and no prompt. Two outcomes:
  - **`branch`** (cwd is the main worktree AND HEAD is the default branch): ship auto-creates a feature branch before dispatching execute. Lifecycle: (1) derive branch name from the plan title via `lib/branch-name.js` driven by `workspace.branch` config; (2) run ship state migration (`state/ship.js migrate --from <oldSlug> --to <newName>`) **before** creating the branch — critical because `state/ship.js read` must still resolve the OLD slug filename at migration time (load-bearing ordering); (3) `git checkout -b <name>`. After step (3), cwd is the main worktree on the new feature branch, so execute-plan-sdlc's own derive yields `continue` — ship does **not** forward a `--branch` value.
  - **`continue`** (a linked git worktree, OR the main worktree already on a feature branch): ship runs the pipeline in place on the current branch — no branch creation, no state migration. This covers the manual "create worktree → write plan → ship" workflow with zero flags. The version step runs normally (tags are repo-global).
  The default-branch warning is advisory (a preflight warning, not a halt): on the default branch in the main worktree the derive returns `branch` and a feature branch is auto-created, so the warning never strands a run.
- **Staging gap**: execute-plan-sdlc creates files but does not stage them. The pipeline runs `git add -A -- ':!.sdlc/'` between execute and commit, excluding the `.sdlc/` runtime directory.
- **archive-openspec checks task completion**: An idempotence check runs first — if the change is already archived, the step exits immediately with no further I/O or prompting. Otherwise the step re-reads the matched change's `tasks.md` (a fresh read, independent of the earlier pipeline-plan snapshot). If incomplete tasks remain: in interactive mode it prompts to `sync-and-archive` (mark all pending tasks done, then archive), `archive-anyway` (archive with tasks left incomplete), or `abort`; in `--auto` mode it skips the prompt, logs a warning, and archives anyway. If all tasks are already complete, interactive mode still shows a post-validation approval prompt before archiving (`archive` or `abort`) — the sync/archive-anyway prompt above never fires on this path, so this second gate is the only consent point for the all-done case; `--auto` mode proceeds directly to archiving.
- **Pipeline plan is binding**: Steps marked "will run" in the pipeline table must execute. Step statuses are computed by `ship-prepare.js` — the LLM follows them mechanically and cannot unilaterally skip planned steps.
- **Per-step dispatch mode**: Each step's `dispatchMode` field (emitted by `ship.js`) controls how it is dispatched. All sub-skills — including `execute-plan-sdlc` — use `dispatchMode: 'agent'` (per spec requirement `R-execute-agent-dispatch`): each is dispatched as an Agent so it loads its SKILL.md in its own context and returns only a structured result (status, summary, artifacts) to ship's main-context loop. `execute-plan-sdlc` returns a Step-9-formatted result (waves completed, files modified, state file path) so ship can drive R37 branch migration, the staging window, and remaining steps after execute completes. Inline-Bash steps (`archive-openspec`, `learnings-commit`, `cleanup`) use `dispatchMode: null` and run directly in main context. This architecture maintains context isolation for every leaf sub-skill while preserving pipeline continuity in ship's orchestrator (fixes #366; reverts the #353 dispatch exception).
- **Skip provenance (`skipSource`)**: Each step in the `ship-prepare.js` output includes a `skipSource` field tracking why it was skipped: `"none"` (not skipped), `"cli"` (omitted from CLI `--steps`), `"config"` (omitted from `ship.steps[]` in `.sdlc/local.json`), `"auto"` (workspace rule), `"condition"` (precondition unmet), or `"default"` (excluded by built-in defaults).
- **Review threshold**: The severity that triggers the fix loop is configurable via `reviewThreshold` in config (default: `high`). Allowed values: `critical`, `high`, `medium`, `low`. Mapping:
  - `critical` → trigger on any critical finding
  - `high` → trigger on any critical OR high finding
  - `medium` → trigger on any critical, high, OR medium finding
  - `low` → trigger on any finding except `info`

  Findings below the threshold are deferred to the pipeline summary.

  **Correlation with `receivedReview.alwaysFixSeverities`:** These two settings must be aligned. `reviewThreshold` gates whether `received-review-sdlc` is dispatched at all; `alwaysFixSeverities` controls what gets auto-implemented once it is running. Setting `alwaysFixSeverities: ["critical","high","medium","low"]` while keeping `reviewThreshold: "high"` has no effect on medium/low findings — the fix loop never starts. Set `reviewThreshold` to the lowest severity in your `alwaysFixSeverities` list (e.g. `"low"`) so the two values are consistent.

---

## What Gets Printed

### Task tray (Claude Code progress UI)

ship-sdlc surfaces live pipeline progress in the Claude Code task tray by
issuing TodoWrite calls from the MAIN thread of `SKILL.md`. You'll see one
todo per substep, transitioning `pending → in_progress → completed` as the
pipeline advances. Step 5 uses the atomic `state/ship.js begin-step` and
`state/ship.js complete-step` subcommands (R69, R70) — each call atomically
records the state transition and renders the TodoWrite payload in a single
operation. `complete-step` takes an `--outcome` flag reporting what the
dispatched agent returned; for the `version` step this is cross-checked
against the actual repository state via `verify-side-effect` before the
step is recorded as completed (R-b3), so a step cannot be marked done on
a false self-report. Other steps record the agent's reported outcome
without an independent side-effect check (R-b2):

- **commit** — stash unstaged, generate message, commit, restore stash
- **review** — dispatch review dimensions, collect verdicts
- **execute** — one todo per plan task (mirrors the plan you accepted)
- **pr** — push branch, draft body, `gh pr create`, apply labels
- (other steps emit their own substep todos; see `R-todowrite-visibility` in `docs/specs/ship-sdlc.md`)

Each TodoWrite call is also paired with a stdout marker in the form:

```
[task-tray] step commit: pending=12, in_progress=1, completed=4
```

This marker is a stdout audit trail when the tray is collapsed or running
non-interactively. On `--resume`, the tray is reconstructed from the
persistent state file — completed steps appear `completed`, the resume target
appears `in_progress`/`pending`. On step failure, in_progress todos for the
failed step are closed with an `" (failed)"` `activeForm` suffix (no todo
lingers in_progress).

The existing verbose progress headers (`━━━ Ship Pipeline — Step 2/7: Commit ━━━`),
the pipeline table, and the final summary are **unchanged** — the tray is
additive.

The pipeline prints every decision and state change. Here is a realistic full output for a run with `--auto --quality balanced`:

```
I'm using the ship-sdlc skill.

Ship config loaded from .sdlc/local.json (schema v2)
  steps: [execute, commit, review, archive-openspec, pr], draft: false, bump: patch
  reviewThreshold: high

Flag resolution (CLI overrides config):
  auto:    true  (from CLI --auto)
  steps:   [execute, commit, review, archive-openspec, pr]  (from config)
  preset:  balanced  (CLI legacy sugar; expanded to steps before resolution)
  bump:    patch (from config default)
  draft:   false (from built-in default)

Context detection:
  Plan in context:     yes (from conversation)
  Uncommitted changes: 0 files modified
  Current branch:      feat/user-auth
  Default branch:      main
  gh CLI:              authenticated as myuser
  OpenSpec:            not detected

Auto-skip decisions:
  execute: WILL RUN — in steps[]
  commit:  WILL RUN — in steps[] (will check pending after execute)
  review:  WILL RUN — in steps[]
  version: SKIPPED — not in steps[] (from config)
  pr:      WILL RUN — in steps[]

Pipeline validation:
  [pass] gh CLI authenticated
  [pass] Not on default branch (feat/user-auth)
  [pass] 4 of 7 steps will run
  [pass] All skip values recognized
  [warn] If review finds critical/high issues, received-review-sdlc will auto-dispatch fixes (--auto forwarded, R71)

Ship Pipeline
--------------------------------------------------------------------
Step  Skill                 Status       Args           Pause?
--------------------------------------------------------------------
1     execute-plan-sdlc     will run     --quality balanced no
2     commit-sdlc           will run     --auto         no
3     review-sdlc           will run     --committed    no
4     received-review-sdlc  conditional  (if crit/high) no
5     commit-sdlc (fixes)   conditional  --auto         no
6     version-sdlc          skipped      ---            ---
7     pr-sdlc               will run     --auto         no
--------------------------------------------------------------------
Review threshold: high (any critical OR high finding triggers fix loop)
Interactive pauses: none (--auto mode)

Auto mode — proceeding without confirmation.

━━━ Ship Pipeline — Step 1/7: Execute ━━━
  Invoking: /execute-plan-sdlc --quality balanced
  Reason: plan detected in context, preset balanced from config
  Expectation: execute all plan tasks in waves

  [done] Step 1 complete: 6 tasks, 2 waves completed
  State saved to .sdlc/execution/ship-feat-user-auth-20260327T143000Z.json

Staging changes from execution:
  A  src/auth/oauth.ts
  A  src/auth/oauth.test.ts
  A  src/middleware/session.ts
  M  src/routes/index.ts
  M  src/config.ts
  M  package.json
  Total: 6 files staged
  Reason: execute-plan-sdlc creates files but does not stage them

━━━ Ship Pipeline — Step 2/7: Commit ━━━
  Invoking: /commit-sdlc --auto
  Reason: --auto forwarded from ship --auto mode
  Expectation: stage all changes, generate commit message, commit without approval prompt

  [done] Step 2 complete: a1b2c3d feat(auth): add OAuth2 PKCE flow
  State saved to .sdlc/execution/ship-feat-user-auth-20260327T143000Z.json

━━━ Ship Pipeline — Step 3/7: Review ━━━
  Invoking: /review-sdlc --committed
  Reason: reviewing committed changes on branch
  Expectation: load review dimensions, dispatch review agents, produce verdict

  [done] Step 3 complete: APPROVED WITH NOTES (2 medium, 1 low)
  State saved to .sdlc/execution/ship-feat-user-auth-20260327T143000Z.json

Review verdict: APPROVED WITH NOTES (2 medium, 1 low)
  Decision: CONTINUING — no critical/high issues found
  Deferred findings (2 medium, 1 low) will be shown in pipeline summary

━━━ Ship Pipeline — Step 4/7: Received Review ━━━
  Status: not triggered (no critical/high findings)

━━━ Ship Pipeline — Step 5/7: Commit Fixes ━━━
  Status: not triggered (no review fixes applied)

━━━ Ship Pipeline — Step 6/7: Version ━━━
  Status: skipped (not in steps[] from config)

━━━ Ship Pipeline — Step 7/7: PR ━━━
  Invoking: /pr-sdlc --auto
  Reason: --auto forwarded from ship --auto mode
  Expectation: generate PR description, create PR without approval prompt

  [done] Step 7 complete: https://github.com/myuser/myrepo/pull/42
  State saved to .sdlc/execution/ship-feat-user-auth-20260327T143000Z.json

Ship Pipeline Complete
================================================================
Step  Skill                 Result
================================================================
1     execute-plan-sdlc     [done] 6 tasks, 2 waves completed
2     commit-sdlc           [done] a1b2c3d feat(auth): add OAuth2 PKCE
3     review-sdlc           [done] APPROVED WITH NOTES (2 medium, 1 low)
4     received-review-sdlc  --- not triggered (no critical/high)
5     commit-sdlc (fixes)   --- not triggered
6     version-sdlc          --- skipped (config default)
7     pr-sdlc               [done] https://github.com/myuser/myrepo/pull/42
================================================================

Decisions log:
  - Steps resolved: [execute, commit, review, archive-openspec, pr] (from config; --quality balanced forwarded to execute-plan-sdlc because user passed --quality)
  - Version step skipped (from config default, bump type: patch)
  - Review found 2 medium, 1 low issues — below threshold, deferred
  - PR created (from --auto flag)

Deferred review findings (2 medium, 1 low):
  1. [medium] src/auth/oauth.ts:42 — Consider extracting token validation to a shared utility
  2. [medium] src/middleware/session.ts:18 — Missing rate limit on new session endpoint
  3. [low] src/config.ts:7 — Magic number for token expiry; extract to named constant
  -> Run /received-review-sdlc to address these

State file cleaned up: .sdlc/execution/ship-feat-user-auth-20260327T143000Z.json deleted
```

---

## Examples

### Basic usage (interactive)

```text
/ship-sdlc --plan .claude/plans/my-feature-plan.md
```

Loads config (if present), detects context, presents the pipeline plan, and asks for confirmation before each major step. `--plan <path>` is required whenever the `execute` step will run (see the **Flags** table's `--plan <path>` row, and "Removed: plan autodiscovery" below it, above) — omit it only when `execute` is not in the resolved step list.

### Full auto mode with preset

```text
/ship-sdlc --auto --quality minimal --plan .claude/plans/my-feature-plan.md
```

Runs the quality preset with no confirmation prompts. `--auto` is forwarded to all sub-skills — received-review-sdlc auto-dispatches fixes without pausing (R71) and version-sdlc skips the release approval prompt (R20).

### Dry run to preview the pipeline

```text
/ship-sdlc --dry-run --steps execute,commit,review,archive-openspec,pr --plan .claude/plans/my-feature-plan.md
```

Displays the full pipeline table showing which steps will run, which are skipped, and which flags are forwarded. No steps are executed.

### Skip execute and version

```text
/ship-sdlc --steps commit,review,archive-openspec,pr
```

Useful when you've already implemented the changes manually and want to commit, review, and open a PR.

### Draft PR with auto mode

```text
/ship-sdlc --auto --draft --plan .claude/plans/my-feature-plan.md
```

Ships end-to-end and opens the PR as a draft for team review.

### Resume after a failure

```text
/ship-sdlc --resume
```

Finds the most recent state file for the current branch, skips completed steps, and retries from the point of failure.

### Post-PR CI verification + Copilot review (interactive)

```text
/ship-sdlc --steps execute,commit,review,archive-openspec,pr,verify-pipeline,await-remote-review,learnings-commit --plan .claude/plans/my-feature-plan.md
```

After the PR is opened, ship-sdlc polls `gh pr checks` until CI converges. On failure, it prompts via `AskUserQuestion` (analyze | skip | abort). Once CI is green (or skipped), it polls for a Copilot review and dispatches `received-review-sdlc` on actionable verdicts. The two opt-in steps can also be set persistently in `ship.steps[]` in `.sdlc/local.json`. (R41–R56)

### Post-PR full automation

```text
/ship-sdlc --auto --steps execute,commit,review,archive-openspec,pr,verify-pipeline,await-remote-review,learnings-commit --plan .claude/plans/my-feature-plan.md
```

Same flow as above, but on CI failure ship-sdlc dispatches `verify-pipeline-sdlc` (subagent) directly with the failed-check log excerpts; on `fix-applied` verdict, ship-sdlc commits and pushes the fix and re-polls (capped at `verifyPipelineMaxIterations`, default 3). On a Copilot review, ship-sdlc dispatches `received-review-sdlc --auto`. (R46, R47, R52)

### Set up project config

```text
/ship-sdlc --init-config
```

Walks through an interactive questionnaire and writes `.sdlc/local.json`. Does not run the pipeline.

### Run the project's quick profile (R-quick-1, R-quick-2)

First, define a quick profile in `.sdlc/local.json` (or via `--init-config`):

```json
{
  "ship": {
    "steps": ["execute", "commit", "review", "version", "archive-openspec", "pr", "learnings-commit"],
    "quick": ["execute", "commit", "pr"]
  }
}
```

Then invoke:

```text
/ship-sdlc --quick --plan .claude/plans/my-feature-plan.md                # runs execute → commit → pr (the quick profile)
/ship-sdlc --quick --dry-run --plan .claude/plans/my-feature-plan.md      # preview which steps would run
```

Combining `--quick` with `--steps` is a hard error (R-quick-5):

```text
/ship-sdlc --quick --steps execute,commit   # error: use --quick or --steps, not both
```

If `ship.quick` is absent from config (R-quick-6):

```text
/ship-sdlc --quick   # error: No quick profile defined. Run `ship-sdlc --init-config` to set one.
```

### Prune stale state files (issue #223)

```text
/ship-sdlc --gc
```

Prunes orphaned `ship-*.json` and `execute-*.json` state files in `.sdlc/execution/` whose branches no longer exist (older than 7 days by default). Skips the pipeline entirely. Useful after interrupted runs leave stale state behind.

```text
/ship-sdlc --gc --ttl-days 0
```

Prunes every state file whose branch is absent from `git branch --list`, regardless of age. Files for currently-existing branches are always kept.

---

## Post-execute completeness gate

After `execute-plan-sdlc` returns and before ship-sdlc advances to the commit step, ship-sdlc runs a blocking invariant check: `state/execute.js verify-completeness`. This gate ensures that every task the execute agent was asked to complete is accounted for in the state file before the pipeline moves on.

**What triggers it:**

The gate runs automatically after every successful `execute-plan-sdlc` dispatch. It cannot be skipped.

**Exit outcomes:**

| Exit code | Meaning | Pipeline action |
|-----------|---------|-----------------|
| 0 | All planned task IDs accounted | Pipeline advances to commit |
| 65 | One or more task IDs missing from state | Execute step marked `failed`; pipeline halts |
| 2 | `plannedTaskIds` absent from state (pre-#432 state file or corrupted init), OR `execute.js` script not found | Pipeline halts with structural error |

**What exit 65 looks like:**

```
ERROR: execute-plan-sdlc returned but planned tasks are unaccounted. Pipeline halted.
{"missingIds":["T3","T7"],"totalPlanned":8,"totalAccounted":6}
```

The JSON on stderr names the exact task IDs that did not complete. The execute step is marked `failed` in the pipeline state file.

**What to do:**

- **Exit 65 (missing task IDs):** The execute agent completed but some tasks were not confirmed. Run `/ship-sdlc --resume` — ship resumes from the execute step, and execute-plan-sdlc will retry the unaccounted tasks.
- **Exit 2 (plannedTaskIds missing):** The state file predates issue #432 (or init was interrupted). Start a fresh run without `--resume`; the new init will record `plannedTaskIds` correctly.
- **Exit 2 (script not found):** The plugin installation is incomplete. Reinstall the plugin.

---

## Terminal cleanup

Every ship pipeline run ends with a deterministic `cleanup` step (after `pr`, `archive-openspec`, and `learnings-commit`). The step is added by `skill/ship.js`, is not user-configurable, and runs as a direct Bash invocation of `state/ship.js cleanup-pipeline` (not as an Agent). Behavior:

- **Success path:** validates the pipeline contract (no `pending`/`in_progress` steps), deletes the current run's state file, then sweeps stale ship- and execute- state files older than the TTL whose branch is no longer present.
- **Failure path:** when an earlier step ended in `failed`, the skill invokes the same script with `--force` — the contract check is skipped and the current run's state file is preserved (so `--resume` works), but stale orphans are still pruned.

Listing `cleanup` in `--steps` or `ship.steps[]` produces a validation error. See issue #223 for the rationale.

---

## Configuration

Pipeline behavior is configured via `.sdlc/local.json`. Create it manually or run `/ship-sdlc --init-config` for guided setup.

### Schema versioning

The local config carries a top-level integer `schemaVersion` field. The current schema version is **`4`**. Files lacking `schemaVersion` (or with an older schema version) are auto-migrated by the loader (`lib/config.js::readLocalConfig`) on the next read. Migration:

- Expands legacy `ship.preset` to `ship.steps[]` (full → all six, balanced → all except `version`, minimal → `[execute, commit, pr]`).
- Subtracts legacy `ship.skip[]` members from the expanded steps.
- Drops `ship.preset` and `ship.skip`; writes `schemaVersion: 4` at the top level.
- Emits a single stderr deprecation notice on first migration; subsequent reads are silent.

To migrate explicitly, run `/setup-sdlc --migrate`.

### Config fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `schemaVersion` (top-level) | `4` | `4` | Schema version literal. New configs MUST include `schemaVersion: 4`. Legacy configs are auto-migrated on read. |
| `steps` | `string[]` | `["execute","commit","review","version","archive-openspec","pr","learnings-commit"]` | Pipeline steps to run. Allowed values: `execute`, `commit`, `review`, `version`, `verify-openspec` (opt-in, OpenSpec-gated), `archive-openspec`, `pr`, `verify-pipeline` (opt-in), `await-remote-review` (opt-in), `learnings-commit`. Replaces legacy `preset` / `skip`. |
| `quick` | `string[]` | unset | Optional shortened step list activated by `--quick`. Same allowed values as `steps`. Unset means `--quick` is unavailable (R-quick-1). |
| `bump` | `"patch"` \| `"minor"` \| `"major"` | `"patch"` | Default version bump type. |
| `draft` | `boolean` | `false` | Create PRs as drafts by default. |
| `auto` | `boolean` | `false` | Run in non-interactive mode by default. |
| `reviewThreshold` | `"critical"` \| `"high"` \| `"medium"` \| `"low"` | `"high"` | Minimum severity that triggers the fix loop. `low` triggers on any finding except `info`. |
| `rebase` | `true` \| `false` \| `"prompt"` | `true` | Rebase strategy before execution and versioning. |
| `verifyPipelineTimeout` | `integer` (≥30) | `1200` | Maximum seconds verify-pipeline polls before giving up with a warning. (R57) |
| `verifyPipelineInterval` | `integer` (≥10) | `60` | Seconds between verify-pipeline poll attempts. (R57) |
| `verifyPipelineMaxIterations` | `integer` (1–10) | `3` | Maximum analyze-fix-recheck iterations before verify-pipeline emits a warning and proceeds. (R47, R57) |
| `awaitRemoteReviewTimeout` | `integer` (≥30) | `600` | Maximum seconds await-remote-review polls before giving up with a warning. (R57) |
| `awaitRemoteReviewInterval` | `integer` (≥10) | `60` | Seconds between await-remote-review poll attempts. (R57) |
| `awaitRemoteReviewers` | `string[]` (minItems 1) | `["copilot"]` | Logins (case-insensitive) whose reviews satisfy await-remote-review. When the login is `copilot`, the reviewer must also be a Bot. (R56, R57) |
| `execute.commitWaves` | `boolean` | `false` | Forwards `--commit-waves` to the execute step. When `true`, execute-plan-sdlc commits each wave as `wip(execute): wave N — <titles>` after G9+G11 pass; commit-sdlc then squashes those WIP commits via soft-reset into the final feature commit. User-facing pipeline behavior is unchanged — WIPs accumulate, then squash. (Fixes #392 / R35.) |

### `version.preRelease` implicit `--bump` override (R63)

`version.preRelease` lives in `.sdlc/config.json` (the project-shared `version` section, NOT in `.sdlc/local.json`'s `ship` section). When set to a valid label (e.g. `"rc"`, `"beta"`, matching `^[a-z][a-z0-9]*$`) and the user does NOT pass `--bump` on the CLI, ship-sdlc forwards it as `--bump <label>` to version-sdlc — equivalent to `--bump patch --pre <label>`. An explicit CLI `--bump` (any value, including `patch`) wins over the config value, allowing graduation out of the pre-release train (version-sdlc R16). See `docs/specs/ship-sdlc.md` R63 for the full rule.

### `execute.commitWaves` Forwarding

When `execute.commitWaves: true` in `.sdlc/local.json` → `ship` section, `scripts/skill/ship.js` appends `--commit-waves` to the execute step's `step.invocation`. Resolution is centralized in the prepare script (per `scripts-over-llm-logic` and `flag-coherence-cross-skill` guardrails); SKILL.md cites `step.invocation` verbatim and never reads `config.execute.commitWaves` directly. The execute step then commits per-wave WIPs; the subsequent commit step (commit-sdlc) auto-detects them and squashes via soft-reset to fork-point — the final PR history shows a single feature commit, not the per-wave WIPs.

To opt out for a single run without editing config, the user can omit the field (or set it to `false`). There is no CLI override for ship-sdlc; the user-facing knob is `execute.commitWaves` in `.sdlc/local.json`.

### Branch-verification guard

Ship-sdlc defends against a class of silent failure (#347, #348, #349) where a sub-skill's Agent — through LLM contract violation, hook bypass, or environment drift — lands its git operations on a different branch than the feature branch ship created. Without a guard, release tags can silently land on orphaned commits that never merge to main; the user discovers the problem only after the PR merges and finds main has no version bump.

**How it works:**

`scripts/skill/ship.js` resolves the feature branch at prepare time (from `state.data.branch` in the ship state file, falling back to `git branch --show-current`) and appends `--expected-branch <featureBranch>` to the invocation of every mutating sub-skill step: `commit`, `commit-fixes`, `version`, and `pr`. The resolved branch is also surfaced as `context.expectedBranch` in the prepare output.

Each sub-skill's prepare script (`skill/commit.js`, `skill/version.js`, `skill/pr.js`) validates the flag via `lib/branch-guard.js::validateExpectedBranch` immediately after resolving git state. On mismatch, the script exits non-zero and the sub-skill halts with:

```
Branch mismatch: expected 'feat/my-feature' but current is 'main'. The pipeline is
configured to operate on 'feat/my-feature'. Refusing to proceed to avoid orphaning
commits on the wrong branch (issues #347, #348, #349).
```

This flag is **internal — set by ship-sdlc** and does not appear in the user-facing invocation. When sub-skills are invoked standalone (outside ship-sdlc), the flag is absent and the guard is inactive.

**Post-version ancestry check:**

After the version step produces a tag, ship-sdlc additionally verifies the tag is an ancestor of the feature branch via `scripts/util/verify-tag-ancestry.js`. On failure:

```
Pipeline halted: tag v1.2.3 is not an ancestor of feat/my-feature.
Remediation: delete the tag (git push origin :refs/tags/v1.2.3; git tag -d v1.2.3)
and re-run version step on the correct branch.
```

This check is a no-op when the version step was skipped (e.g., excluded from `--steps`).

### Migrating legacy configs

If your `.sdlc/local.json` was created before the current schema (used `preset:` and `skip:`), the loader will auto-migrate on the next ship run and emit a one-line deprecation notice. The mapping is:

- `full` (or legacy `A`) → `[execute, commit, review, version, archive-openspec, pr]`
- `balanced` (or legacy `B`) → `[execute, commit, review, archive-openspec, pr]` (omits `version`)
- `minimal` (or legacy `C`) → `[execute, commit, pr]`

Any legacy `skip[]` entries are subtracted from the expanded set. To trigger the migration explicitly, run `/setup-sdlc --migrate`.

### Merge precedence

```
CLI --steps  >  .sdlc/local.json (ship.steps)  >  built-in defaults

(Legacy CLI sugar `--preset` and `--skip` are hard-removed in #190; passing them produces an error.)
```

### Team-specific examples

**Solo developer — move fast:**

Skip version management, auto-commit, only pause on critical findings.

```json
{
  "$schema": "sdlc-local.schema.json",
  "schemaVersion": 4,
  "ship": {
    "steps": ["execute", "commit", "review", "archive-openspec", "pr"],
    "auto": true,
    "bump": "patch",
    "draft": false,
    "reviewThreshold": "critical"
  }
}
```

**Team with guardrails — balanced review:**

Full pipeline with high-severity review threshold. PRs open as drafts for team review. Version step runs with manual approval.

```json
{
  "$schema": "sdlc-local.schema.json",
  "schemaVersion": 4,
  "ship": {
    "steps": ["execute", "commit", "review", "version", "archive-openspec", "pr"],
    "auto": false,
    "bump": "minor",
    "draft": true,
    "reviewThreshold": "high"
  }
}
```

**CI-adjacent — maximum confidence:**

Smallest step set with widest review threshold. Suitable for regulated environments or release branches.

```json
{
  "$schema": "sdlc-local.schema.json",
  "schemaVersion": 4,
  "ship": {
    "steps": ["execute", "commit", "pr"],
    "auto": false,
    "bump": "patch",
    "draft": false,
    "reviewThreshold": "medium"
  }
}
```

**Quick iteration — skip execute and review:**

For when you've already implemented and reviewed manually, and just need to commit, version, and open a PR.

```json
{
  "$schema": "sdlc-local.schema.json",
  "schemaVersion": 4,
  "ship": {
    "steps": ["commit", "version", "pr"],
    "auto": true,
    "bump": "patch",
    "draft": true,
    "reviewThreshold": "high"
  }
}
```

**Strict review — surface every finding except `info`:**

For high-stakes branches where any low/medium/high/critical finding should trigger the fix loop.

```json
{
  "$schema": "sdlc-local.schema.json",
  "schemaVersion": 4,
  "ship": {
    "steps": ["execute", "commit", "review", "version", "pr"],
    "auto": false,
    "bump": "patch",
    "draft": false,
    "reviewThreshold": "low"
  }
}
```

---

## Resuming After Failure

When the pipeline fails or is interrupted, the state file is preserved at:

```
.sdlc/execution/ship-<branch>-<timestamp>.json
```

To resume:

```text
/ship-sdlc --resume
```

**What happens on resume:**

1. The skill finds the most recent state file for the current branch (matched by branch name in the filename).
2. Steps with status `completed` or `skipped` are skipped.
3. Steps with status `in_progress` are retried from the beginning.
4. Steps with status `pending` run normally.
5. The same flags from the original run are restored from the state file.

**If multiple state files exist** for the same branch (from multiple failed attempts), the one with the most recent timestamp is used.

### Auto-resume after `/compact`

When a Claude Code `/compact` occurs mid-pipeline, the `SessionStart` hook emits an **Active pipeline:** reminder. On the next invocation of `/ship-sdlc`, the prepare script detects this reminder and automatically resumes from the last completed step — no `--resume` flag required.

A banner is shown before the pipeline table:
```
Resuming after compaction from step <step-name>.
Completed: <list>.
Pending:   <list>.
```

If the pipeline state file is missing or expired (older than 1 hour), you are prompted to start fresh or provide a state path.

**Manual cleanup:** If a state file is corrupt or you want to start fresh, delete it manually:

```bash
rm .sdlc/execution/ship-<branch>-<timestamp>.json
```

Or delete all state files:

```bash
rm -rf .sdlc/execution/
```

Then run `/ship-sdlc` without `--resume` to start a new pipeline.

### After plan-mode block

When `/ship-sdlc` was invoked in plan mode, a `ship-<slug>-<ts>.json` state file is written with all steps pending and the originally-resolved flags preserved. After exiting plan mode, re-invoke `/ship-sdlc` (no arguments needed). The implicit-resume mechanism (`detectResumeState` → `flags.implicitResume`) picks up the saved state file and resumes from the first pending step, preserving `--bump`, `--steps`, and other flags from the original invocation. (Fixes #400.)

ship-sdlc also removes the intermediate prepare output file (`$PLAN_MODE_OUTPUT_FILE`) after confirming the state file was written — the temp output file is distinct from the persistent state file in `.sdlc/execution/`.

---

## Prerequisites

- **`gh` CLI** — required for PR creation. Must be authenticated (`gh auth login`). The pipeline validates this before execution and stops with a clear error if authentication fails.
- **git** — must be run inside a git repository on a feature branch (not the default branch).
- **Review dimensions** — `.sdlc/review-dimensions/` must contain at least one dimension file for the review step. Run `/setup-sdlc --dimensions` to create them. If review is in the skip set, this is not required.
- **Plan in context** — for the execute step, a plan must be present in the conversation. If no plan is found and execute is not skipped, the step is auto-skipped.
- **`--plan <path>` (#505)** — when a plan is present in context and the execute step is not skipped, the plan document must also be passed explicitly via `--plan <path>`; plan autodiscovery (the old `plansDirectory` scan) was removed and there is no fallback. Use [`/plan-sdlc`](plan-sdlc.md) to write the plan document, then pass its path.
- **Workspace is auto-detected** — there is no workspace mode and no cwd assertion. ship-sdlc derives the workspace from cwd + current branch (R60): on the main worktree on the default branch it auto-creates a feature branch; inside a linked worktree or on a feature branch it runs in place. Invoking from inside a manual git worktree is fully supported (`.sdlc/` stays anchored to the main worktree).

### Harness Configuration

| Field | Value |
|---|---|
| `argument-hint` | `[--auto] [--steps <csv>] [--quality full\|balanced\|minimal] [--draft] [--dry-run]` |
| Plan mode | Graceful refusal at Step 0; pipeline state saved for auto-resume on next invocation (Fixes #400). |

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| `.sdlc/local.json` | Developer-local config. Gitignored by `.sdlc/.gitignore` (created by `--init-config` via `ship-init.js`). |
| `.sdlc/.gitignore` | Internal gitignore that prevents `.sdlc/` contents from being committed. Created by `--init-config` via `ship-init.js`. |
| `.sdlc/execution/ship-*.json` | Pipeline state file. Created at start, deleted on successful completion, retained on failure for `--resume`. |
| Git commits | Feature commit (step 2) and optionally a review fix commit (step 5). |
| Git tag | Created by version-sdlc if the version step runs. |
| GitHub PR | Opened or updated by pr-sdlc as the final step. |
| `hooks/pipeline-continue.js` (PostToolUse, R67) | Fires after every `Bash` or `TodoWrite` tool call. When a ship state file for the current branch has any step with status `in_progress`, emits `hookSpecificOutput.additionalContext` reminding the model which step is in progress and that the response turn must continue. Silent (no stdout) when no state file exists, no step is `in_progress`, or git/state resolution fails. Fires regardless of `flags.auto`. |
| `hooks/stop-pipeline-continue.js` (Stop, R68) | Fires on every Stop event. Returns `decision: "block"` when all four conditions hold: a ship state file exists for the current branch, any step is `in_progress`, `flags.auto === true` in the state file, and `stop_hook_active !== true` on stdin. Silent in all other cases (non-auto, no state file, all resolved, `stop_hook_active === true`). Read-only — never mutates state. |

---

## Skill File Structure

To keep the resident context footprint of the loaded skill small, `ship-sdlc/SKILL.md` follows the progressive-disclosure pattern (spec `R-progressive-disclosure`): rarely-hit and reference branches live in on-demand companion docs that SKILL.md instructs the model to Read only at the point the branch is entered. A no-flag `ship it` run in branch mode (the common path) reads none of these.

| Companion file | Read when | Contents |
|----------------|-----------|----------|
| `entry-modes.md` | `--init-config`, `--gc`, or `--dry-run` passed | The three entry-mode handlers, each of which short-circuits the pipeline. |
| `reference.md` | A pipeline-level failure, the Learning Capture step, or an edge-case lookup | Error Recovery, DO NOT, Gotchas, and Learning Capture reference material. |
| `config-format.md` | `--init-config` walkthrough | Config schema and walkthrough questions. |
| `state-format.md` | Resume from a saved state file | Ship state-file schema. |

The post-version ancestry HARD GATE stays inline in SKILL.md (it must not be gated behind an on-demand Read). There is no cwd-assertion diagnostic — workspace is auto-detected (R60), so running from any cwd or branch is valid.

---

## Related Skills

- [`/execute-plan-sdlc`](execute-plan-sdlc.md) — plan execution with wave-based parallel dispatch
- [`/commit-sdlc`](commit-sdlc.md) — smart commit with style detection
- [`/review-sdlc`](review-sdlc.md) — multi-dimension code review
- [`/received-review-sdlc`](received-review-sdlc.md) — process and fix review findings
- [`/version-sdlc`](version-sdlc.md) — semantic versioning and release tags
- [`/pr-sdlc`](pr-sdlc.md) — pull request creation
- [`/setup-sdlc`](setup-sdlc.md) — configure review dimensions via `--dimensions` flag

<!--
NOTE: This section is for GitHub markdown browsing only.
On the site (rnagrodzki.github.io/sdlc-marketplace), Related Skills are rendered
as styled SkillCard tiles auto-generated from `site/src/data/skills-meta.ts` connections.
The remark-strip-related-skills plugin removes this section before site rendering.
To add/update related skills on the site, edit the `connections` array in skills-meta.ts.
-->
