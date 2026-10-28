# Ship Pipeline — Reference

On-demand companion for `ship-sdlc/SKILL.md` (implements R-progressive-disclosure). Reference material consulted only when the relevant situation arises (a failure, an unexpected behavior, end-of-pipeline learning capture). Read the relevant section on its trigger; never preemptively.

## Error Recovery (R-progressive-disclosure)

> **Flow**: detect → diagnose → auto-recover (retry once if transient) → escalate to user for persistent failures.

| Error | Recovery | Invoke error-report-sdlc? |
|-------|----------|---------------------------|
| Sub-skill fails (script crash) | Show error from sub-skill, stop pipeline, save state for `--resume` | Delegated — sub-skill handles its own error reporting |
| `gh auth status` fails | Stop at validation (Step 3). Tell user to run `gh auth login` | No — user setup |
| `git add -A -- ':!.sdlc/'` fails | Show error, stop pipeline | No — user action needed |
| Network error (gh API) | Auto-retry via `retryExec` (3 attempts with exponential backoff). If exhausted, record failure + print resume instruction (see below) | No — transient |
| State file write fails | Warn and continue — state persistence is best-effort | No |
| Resume state file corrupt | Warn, start fresh | No |
| Review summary missing or malformed | `ship.js` dispatches received-review-sdlc and adds a `warnings` line (`review_gate`) | No |
| Sub-skill times out | Stop pipeline, save state, inform user to `--resume` | No — transient |

**Resume instruction format** (printed on step failure after retries exhausted or on any unrecoverable step error):
```
Step <N> (<name>) failed: <error summary>
State saved to: <state file path>
To resume: /ship-sdlc --resume
```

Each sub-skill has its own error recovery. ship-sdlc does not duplicate their recovery logic — it catches pipeline-level failures (sequencing, state, context) and delegates skill-level failures to the skill itself.

## DO NOT (R-progressive-disclosure)

- Deviate from `step.dispatchMode`. Every sub-skill step has `dispatchMode: 'agent'`; inline-Bash steps have `dispatchMode: null`. The LLM must not synthesize a `'skill'` value or invoke any step via the Skill tool from Step 5. Use Agent tool for all sub-skill steps, including `execute-plan-sdlc`.
- Skip the critique step (Step 3) even when all checks seem obvious
- Forward `--auto` to sub-skills that do not support it (see audit table)
- Run pipeline steps in parallel — the pipeline is strictly sequential
- Delete the state file on failure — it is needed for `--resume`
- Proceed past a failed sub-skill — stop, save state, inform user
- Copy example args from this document when dispatching sub-skill Agents — use the `invocation` field from the skill/ship.js output, which contains the exact computed args
- Add `--steps` flags not present in the user's original invocation. Pipeline composition derives from CLI `--steps` > config `ship.steps[]` > built-in defaults. Legacy `--preset` and `--skip` are hard-removed (#190); passing them produces an error.
- Dispatch pipeline step Agents with any other `subagent_type`, or with `model`/`effort` parameters. Dispatch with `subagent_type: step.data.agent`; the agent file pins model and effort.
- Add, remove, or change the `isolation` parameter on Agent dispatches — isolation comes verbatim from `step.data.isolation`. Adding `isolation: "worktree"` when `step.data.isolation` is null causes hidden Agent SDK worktrees that conflict with `--workspace branch` (issue #350).
- Ignore cleanup validation failures — if `state/ship.js cleanup` exits with code 1, the pipeline contract was violated. Surface the violation and preserve state.
- Skip the post-version ancestry HARD GATE. The check is the only safeguard against tags landing on orphaned commits (issue #349). The gate is a no-op when `NEW_TAG` is unset — do not pre-empt it by skipping it when you believe the version step succeeded on the right branch.
- Exit the plan-mode-blocked path (Step 0, steps 3–7) without running `rm -f "$PLAN_MODE_OUTPUT_FILE"` — the temp prepare output file is separate from the persistent state file in `.sdlc/execution/` and must be cleaned up on every exit branch.
- Do not end the turn between pipeline steps or treat a tool result as a stopping point; the continuation hooks block such turns and state the next action.

## Gotchas (R-progressive-disclosure)

**Staging gap after execute.** execute-plan-sdlc creates and modifies files but does not stage them. ship-sdlc must run `git add -A -- ':!.sdlc/'` between execute and commit. Missing this produces an empty commit.

**Review gate reads `review-summary.json`.** `ship.js` decides the `review_gate` from the review summary file that the review orchestrator writes to `.sdlc/execution/`; a missing, stale or malformed file makes `review_gate` dispatch received-review-sdlc with a warning.

**received-review-sdlc supports `--auto`.** When `--auto` is forwarded, both the Step 10 consent prompt and the Step 12 reply/resolve prompt are skipped. "Will fix" items are auto-implemented and their threads are auto-resolved via in-thread replies. "Disagree" and "won't fix" items are displayed but not auto-implemented; their threads are replied to but left open for the reviewer. Critique gates and verification still run. Without `--auto`, the pipeline pauses for human approval at both gates.

**Double commit is intentional.** Feature commit (step 2) and review fix commit (step 5) are separate. This keeps feature work and review fixes distinct in git history. Do not squash them.

**Version consent gate.** version-sdlc supports `--auto`. When forwarded, the release plan approval prompt is skipped but the plan is still displayed. Pre-condition checks (Steps 6–7) and critique gates (Steps 3–4) still run.

**Config file is optional.** The pipeline runs with built-in defaults when no ship config exists in `.sdlc/local.json`. Do not error on missing config.

**Step set validation matters.** Unrecognized values in `--steps` (e.g., `--steps reviw`) produce an error from `skill/ship.js parseArgs` and abort the run. The single source of truth for step composition is `ship.steps[]` in `.sdlc/local.json`; CLI `--steps` is a one-shot override. The legacy `--preset` and `--skip` flags are hard-removed (#190) and rejected with a migration-pointer error.

**.sdlc/ must be gitignored.** The `.sdlc/` directory contains developer-local config (`local.json`) and ephemeral pipeline state (`execution/`). `--init-config` creates `.sdlc/.gitignore` automatically via `ship-init.js`. If `.sdlc/` is not gitignored, the staging command (`git add -A -- ':!.sdlc/'`) provides a fallback exclusion, but the gitignore is the primary defense.

**Pipeline plan is binding.** The pipeline table displayed in Step 4 and confirmed by the user is a contract. Step statuses (`will_run`, `skipped`, `conditional`) are computed by `skill/ship.js` — the LLM follows them, it does not override them. Steps with `status: "will_run"` must be dispatched as Agents. This was added after an incident where the review step was skipped because the LLM judged the changes to be "just docs/config" (issue #68). The pipeline's value is precisely in catching cases where the developer thinks changes are low-risk but the review disagrees.

**State files are script-managed.** Use state/ship.js / state/execute.js for all state operations. Don't hand-write JSON to `.sdlc/execution/`.

**Rebase happens after all commits, before version.** This ensures the tag is placed on a commit that can merge cleanly. If rebase conflicts, the pipeline pauses — the user resolves the conflicts and resumes.

**Rebase is skipped when main is already an ancestor.** `git merge-base --is-ancestor` is a fast check. No fetch + rebase overhead when the branch is already up to date.

**Auto mode does not auto-resume without --resume.** When `--auto` is set but `--resume` is not, the pipeline starts fresh even if a state file exists for the current branch. This prevents accidental continuation from stale state. The state file is preserved (not deleted) so the user can explicitly `--resume` later.

**Sub-skill loading and agent isolation.** All sub-skills (including `execute-plan-sdlc`) are Agent-dispatched so each loads SKILL.md in its own context and returns only a structured result (5–10 lines). The ship pipeline's context receives structured data, not sub-skill definitions. `execute-plan-sdlc` bounds its own context impact by dispatching one wave-runner Agent per wave rather than per task — its structured Step-9 result is what ship-sdlc consumes to continue the pipeline.

**skipSource tracks provenance.** Each step's `skipSource` field records why a step was skipped: `"none"` (not skipped), `"cli"` (step omitted from CLI `--steps`), `"quick"` (step is canonical but absent from `ship.quick` under an active `--quick` run — R-quick-4), `"config"` (omitted from `ship.steps[]` in `.sdlc/local.json`), `"auto"` (auto-skipped by `computeSteps` logic), `"condition"` (conditional step not triggered), `"default"` (built-in defaults excluded the step). The per-step `skipSource` makes the exclusion provenance auditable per step.

**`--auto` continuation hooks (R67/R68).** The `pipeline-continue.js` PostToolUse hook and the `stop-pipeline-continue.js` Stop hook keep an `--auto` run advancing between steps.

**`--auto` no-pause hook (R71).** The `block-askuserquestion-auto.js` PreToolUse hook denies `AskUserQuestion` while an `--auto` pipeline is advancing.

## verify_pipeline — conditional, opt-in

If the `verify-pipeline` step has `status: "will_run"` (gated by step membership in `flags.steps` — cite `step.status === "will_run"` from the prepare output, not `$ARGUMENTS`; per `flag-coherence-cross-skill`), execute it inline (no Agent dispatch — this is a deterministic polling script). Implements R41–R49.

1. Resolve the script path:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   VP_SCRIPT="<PLUGIN_ROOT>/scripts/skill/verify-pipeline.js"
   ```
2. Run the script with the args from `step.args` plus `--state-file <ship-state-path>`:
   ```bash
   node "$VP_SCRIPT" $STEP_ARGS --state-file "$SHIP_STATE_PATH"
   ```
3. Parse the single JSON line on stdout. Branch on `status`:

   **`status === "green"`** — log `verify-pipeline: CI green for PR #N` and proceed to `await-remote-review`. Cites R43.

   **`status === "failed"`** AND `flags.auto === false` — interactive (R45). Use `AskUserQuestion`:
   > Wave verify-pipeline failed for PR #N. <X> failed checks: <names>.
   >
   > Options: **analyze** (Recommended) | **skip** | **abort**
   - **analyze**: dispatch `verify-pipeline-sdlc` subagent (Agent tool, model sonnet) with `--pr <N>` and `--logs <inline-log-excerpt-from-failedChecks>`. On verdict `fix-applied`, dispatch `commit-sdlc` (Agent tool, model haiku, `--auto`) directly to commit and push. Then re-run verify-pipeline (loop). Iteration cap = `flags.verifyPipelineMaxIterations` (default 3, R47); after cap, log warning and proceed to `await-remote-review`. The pre-existing `commit-fixes` step entry (already visited before `pr`) is NOT involved — this dispatch is direct via the Agent tool.
   - **skip**: log warning, proceed to `await-remote-review`.
   - **abort**: write `verifyPipelineExhausted: true` to the ship state file, exit pipeline 1.

   **`status === "failed"`** AND `flags.auto === true` — non-interactive (R46). Directly dispatch `verify-pipeline-sdlc` subagent (Agent tool, model sonnet) with `--pr <N> --logs <excerpt> --auto`. On `fix-applied`, dispatch `commit-sdlc --auto` directly. Loop with the same iteration cap (`flags.verifyPipelineMaxIterations`, R47). On cap exhaustion, log warning and proceed.

   **`status === "timeout"`** — log warning `verify-pipeline: timeout after Ns`. The script has already written `verifyPipelineExhausted: true` to the state file. Proceed to `await-remote-review`. Cites R48, R49.

   **`status === "skipped"`** (resume short-circuit) — log info `verify-pipeline: skipped (resumed from prior exhaustion)`. Proceed. Cites R49.

   **`status === "error"`** — log warning `verify-pipeline: error — <reason>`. Proceed.

Do NOT replicate polling, log fetching, or fix-application logic in this prose — those live in `verify-pipeline.js` and the `verify-pipeline-sdlc` skill (per `scripts-over-llm-logic`).

If the step has `status: "skipped"`, print the skip reason from `step.reason` and do nothing.

## await_remote_review — conditional, opt-in

If the `await-remote-review` step has `status: "will_run"` (gated by step membership in `flags.steps` — cite `step.status === "will_run"` from the prepare output, not `$ARGUMENTS`), execute it inline. Implements R50–R56.

1. Resolve the script path:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   AR_SCRIPT="<PLUGIN_ROOT>/scripts/skill/await-remote-review.js"
   ```
2. Run the script with the args from `step.args` plus `--state-file <ship-state-path>`:
   ```bash
   node "$AR_SCRIPT" $STEP_ARGS --state-file "$SHIP_STATE_PATH"
   ```
3. Parse the single JSON line on stdout. Branch on `status`:

   **`status === "actionable"`** — directly dispatch `received-review-sdlc` (Agent tool, model sonnet) with `--pr <verdict.prNumber>` (and `--auto` when `flags.auto === true`). After the subagent completes, run `git status --porcelain` in the main context; if there are working-tree changes, directly dispatch `commit-sdlc` (Agent tool, model haiku, `--auto`) to commit and push. The pre-existing `received-review` and `commit-fixes` step entries (already visited before `pr`) are NOT involved — these dispatches are direct via the Agent tool. Cites R52.

   **`status === "approved-clean"`** — log `await-remote-review: APPROVED by <reviewer>` and proceed. Do NOT dispatch received-review-sdlc. Cites R53.

   **`status === "timeout"`** — log warning `await-remote-review: timeout after Ns waiting for <reviewers>`. The script has already written `awaitRemoteReviewExhausted: true` to the state file. Proceed. Cites R54, R55.

   **`status === "skipped"`** (resume short-circuit) — log info and proceed. Cites R55.

   **`status === "error"`** — log warning and proceed.

If the step has `status: "skipped"`, print the skip reason from `step.reason` and do nothing.

## learnings_commit — final step

Pipeline-level learnings cannot land in the feature commit (issue #208) — review/version/pr/archive all run *after* the feature commit. The `learnings-commit` step exists to capture them in a trailing chore commit so post-pipeline `git status` is clean.

If the `learnings-commit` step has `status: "will_run"`, execute it inline (no Agent dispatch — deterministic shell):

1. Run the ship-level Learning Capture (see the `## Learning Capture` section below) — append any new entries to `.sdlc/learnings/log.md`.
2. Check whether anything actually changed:
   ```bash
   git diff --quiet -- .sdlc/learnings/log.md
   ```
   - Exit `0` (no diff) → skip the commit and report `learnings-commit: no-op (no new learnings)`.
3. If there is a diff:
   ```bash
   git add .sdlc/learnings/log.md
   git commit -m "chore(ship-sdlc): capture pipeline learnings"
   git push
   ```
   On push failure (offline, auth), report the error but do **not** halt the pipeline — the local commit still lands and a follow-up `git push` will deliver it.
4. After the step, `git status --porcelain` MUST be empty.

If the step has `status: "skipped"` (omitted from `--steps` or `ship.steps[]`), print the skip reason from `step.reason` and do not perform any of the above. The execute-plan-sdlc-level Learning Capture (`R27` in `docs/specs/execute-plan-sdlc.md`) still runs and lands in the feature commit; only the ship-level append is conditional on this step.

## Learning Capture (R-progressive-disclosure)

After completing the pipeline, append to `.sdlc/learnings/log.md`:

- Review verdicts that surprised (threshold too aggressive or too lenient)
- Sub-skills that failed in unexpected ways during chaining
- Config combinations that produced unintended pipeline shapes
- Projects where the default `steps[]` behavior was wrong, or migrations from legacy v1 configs (`ship.preset`/`ship.skip`) that produced unexpected `steps[]` after auto-migration. CLI `--preset`/`--skip` are no longer accepted (#190 hard-remove); ship-sdlc emits a migration-pointer error if either is passed.

Format:
```
## YYYY-MM-DD — ship-sdlc: <brief summary>
<what was learned>
```
