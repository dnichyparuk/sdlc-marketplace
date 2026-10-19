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
| Review verdict unparseable | Treat as APPROVED WITH NOTES, warn user, defer all findings | No |
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
- Skip pipeline steps that were marked "will run" in the pipeline plan. The pipeline plan is a contract with the user. If a step was planned to run and the user confirmed the pipeline, it MUST run. The LLM does not have authority to skip planned steps based on its own assessment of change complexity or risk. Only the skip set and auto-skip rules (computed by skill/ship.js) control which steps run.
- Copy example args from this document when dispatching sub-skill Agents — use the `invocation` field from the skill/ship.js output, which contains the exact computed args
- Add `--steps` flags not present in the user's original invocation. Pipeline composition derives from CLI `--steps` > config `ship.steps[]` > built-in defaults. Legacy `--preset` and `--skip` are hard-removed (#190); passing them produces an error.
- Dispatch pipeline step Agents without `model: step.model` — the model field is computed by skill/ship.js from each skill's spec. Omitting it defaults all steps to opus.
- Add, remove, or change the `isolation` parameter on Agent dispatches — isolation comes verbatim from `step.isolation`. Adding `isolation: "worktree"` when `step.isolation` is null causes hidden Agent SDK worktrees that conflict with `--workspace branch` (issue #350).
- Ignore cleanup validation failures — if `state/ship.js cleanup` exits with code 1, the pipeline contract was violated. Surface the violation and preserve state.
- Skip the post-version ancestry HARD GATE. The check is the only safeguard against tags landing on orphaned commits (issue #349). The gate is a no-op when `NEW_TAG` is unset — do not pre-empt it by skipping it when you believe the version step succeeded on the right branch.
- Exit the plan-mode-blocked path (Step 0, steps 3–7) without running `rm -f "$PLAN_MODE_OUTPUT_FILE"` — the temp prepare output file is separate from the persistent state file in `.sdlc/execution/` and must be cleaned up on every exit branch.
- End your response turn between pipeline steps. Each step is part of a single dispatch loop. After every tool call result, check whether the current step is complete and proceed to the next action. Do not wait for a user message to continue.
- Interpret tool call result processing as a natural stopping point. Processing a Bash or TodoWrite result is not the end of the pipeline — it is one action in a multi-action step. Continue to the next action immediately.
- Treat the PostToolUse `hookSpecificOutput.additionalContext` reminder as optional or advisory. When a step is `in_progress` the hook emits the mandatory continuation signal `Ship pipeline: step N of M (<step>) is in_progress. Continue executing this step — do not end the response turn. Next action: record the step result and advance to the next step.` — this is a directive you MUST act on, not an FYI. Complete the stated next action (dispatch the step's Agent / record its result) before ending your response turn. The `stop-pipeline-continue.js` Stop hook enforces this for `in_progress` steps regardless of `--auto` (R-stop-inprogress-mode-independent, #454).

## Gotchas (R-progressive-disclosure)

**Staging gap after execute.** execute-plan-sdlc creates and modifies files but does not stage them. ship-sdlc must run `git add -A -- ':!.sdlc/'` between execute and commit. Missing this produces an empty commit.

**Verdict detection is text-based.** Parse the conversation for a line matching `Verdict: <VERDICT>`. The review-sdlc orchestrator always emits this. If the conversation is compacted between review and verdict parsing, the verdict may be lost — treat missing verdict as APPROVED WITH NOTES and warn the user.

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
