# plan-sdlc — review loop (Steps 5–6)

Read by SKILL.md after Step 4 for full-pipeline plans; lightweight plans skip this file. Steps 3, 4, 6.5, 6.6 and 7 stay in SKILL.md, so "the Step 3 dispatch rule" and "the run-time table in Step 3" below refer to SKILL.md.

## Step 5 (CRITIQUE): Plan Review Loop — Multi-Lens Fan-Out <!-- R36 -->

Skip for lightweight plans (2–3 file scope from Step 0 routing).

**Material change detection and merged re-dispatch:** <!-- implements R64 -->

When `materialChangeDetected` is true (set by the Step 6 IMPROVE pass — see below), dispatch Step 3 lanes AND Step 5 lens reviewers in a SINGLE message as parallel Agent tool calls. This merged dispatch counts as **one** iteration of the existing review loop — the iteration counter increments by 1, not 2, and the max-3 cap fires normally. <!-- R8, R-c1 -->

- **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>` (the PF checks always re-run), then dispatch in one message the lanes and lenses named in `diff-material`'s `affectedLanes` from Step 6 (same skip rules; `lens:<name>` is that `lensReviewers[]` entry, `lens:all` the single reviewer); when `affectedLanes` is `["*"]` (a `taskCount` change), all Step 3 lanes and all `lensReviewers[]` (P17, or the single reviewer for <5-task plans). Each agent uses the dispatch parameters, template variables and model rules of Step 3 (lanes) and Step 5 (lenses).
- **Await barrier:** do not consolidate or advance until exactly N = (lanes dispatched + M lenses) results are collected; if a dispatch is backgrounded, keep awaiting across completion notifications. Never consolidate on partial or zero returns. <!-- R-orchestrator-await, R-c1 -->
- **Merge:** write each lane's JSON to `<ITER_DIR>/<lane name>.json` and each lens's to `<ITER_DIR>/lens-<lens>.json`, then run `merge-lanes` once on that directory with `--lanes` set to the re-dispatched lanes and `--lenses` to the re-dispatched lenses (either may be `""`), `--no-guardrails` exactly as in Step 3, `--carry "<critiqueDir>/iter-<k-1>"` unless `affectedLanes` is `["*"]` (everything is re-dispatched, so nothing is carried) so the results of the lanes and lenses not re-dispatched carry over (R67), plus `--inventory`, `--gate-a` and `--g17-not-run` as in the lens merge below. `issues` in `merged.json` is the unified blocking-issue set (lane, lens and cross-source dedup are done by the script).
- **G17 on re-dispatch (advisory only):** `g17Findings` from the re-dispatch are not re-spliced into the plan (Step 4 has already run); keep them for scorecard reference only.
- **Guardrail-block gate preservation:** guardrail-compliance (G14) issues in the re-dispatch's `merged.json` are scanned the same way Step 4 scans them. If any error-severity guardrail violation is present in the re-dispatch merge, do NOT route it silently into Step 6's blocking-issue set — surface the same guardrail-block harden offer described in Step 4 (offer **harden** alongside the user-revision options; dispatch `Skill(harden-sdlc)` with `--failure-text "Plan blocked by error-severity guardrail <id>: <description> — <rationale>"`, `--skill plan-sdlc`, `--step "Step 5 — merged re-dispatch"`, `--operation "error-severity guardrail block"` only if the user selects harden, suppressed when `--auto` is set) before proceeding with Step 6 fixes. This preserves R19 across the merged re-dispatch path. <!-- R19 -->
- **`guardrailsEvaluated` / `critiqueRan`:** NOT re-written (once-per-run checkpoints — see Step 3).
- **Clear flag:** set `materialChangeDetected = false` after the merged issue set is assembled.

When `materialChangeDetected` is false (or unset), dispatch only the Step 5 lens reviewers as below (normal path).

<!-- fan-out-dispatch: await-barrier-required -->
**For plans with ≥5 tasks — Multi-lens fan-out:** Dispatch ALL lens reviewers from `lensReviewers[]` (P17) in a SINGLE message as parallel Agent tool calls. Do not dispatch them sequentially. <!-- R-orchestrator-await -->

**Await barrier:** collect exactly N lens results (N = lenses dispatched) before consolidating or advancing; if a dispatch is backgrounded, keep awaiting across completion notifications. Never consolidate on partial or zero returns. <!-- R-orchestrator-await, R-c1 -->

For each `lensReviewers[]` entry, dispatch by the Step 3 dispatch rule: `subagent_type: entry.agent`, `description: "plan lens <entry.lens>"`, `prompt`: one `NAME: value` line per name in `entry.inputNames`, the value from `entry.presetInputs` when present (`LENS` and `LENS_FOCUS` are preset), otherwise from the run-time table in Step 3. Pass `model: entry.dispatchModel` and `effort: entry.dispatchEffort` only when non-null; per-invocation parameters override the agent file. When `entry.dispatchModel` is null (the `balanced` preset), pass `model: opus` only when the plan author ran on sonnet (R8). <!-- R36, R8, P17 -->

**Plan quality presets** (`--quality`, A4; values are tuning, `docs/cost-tiers.md` §5):

| Preset | Lanes | Lens / reviewer model | Lens / reviewer effort |
|---|---|---|---|
| `full` (Speed) | agent-file defaults | `sonnet` | `low` |
| `balanced` (default) | agent-file defaults | opposite of the plan author's model (R8: `opus` when the author ran on sonnet, else the agent file's `sonnet`) | agent-file default |
| `minimal` (Quality) | agent-file defaults | `opus` | `high` |

`full` and `minimal` pass a fixed model whatever the plan author ran on, so they waive the R8 opposite-model rule; only `balanced` keeps it.

When `entry.agentPath` is null, skip that lens and log to `.sdlc/learnings/log.md`: `## YYYY-MM-DD — plan-sdlc: lens "<name>" skipped — agent file not found`. Continue with remaining lenses.

**No `isolation` parameter on lens reviewer dispatches:** lenses read the plan file by absolute path, and a worktree copy would read a stale or absent file.

**Merge lens reviewer results (per iteration):** Write each lens's final fenced `json` block verbatim to `<ITER_DIR>/lens-<lens>.json` with the Write tool (`lens-all.json` for the single reviewer). Write `JSON.stringify(openspecContext.requirements)` once to `<critiqueDir>/inventory.json` when it is non-null, and Gate A's JSON to `<critiqueDir>/gate-a.json` when Gate A ran. Then run (omit an option whose file was not written):

```bash
node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" --carry "<critiqueDir>/iter-<k-1>" [--no-guardrails] [--g17-not-run] > "<ITER_DIR>/merged.json"
```

`--carry` copies the previous iteration's lane results (`iter-0` at the first iteration) into this one, so a later merged re-dispatch can carry them (R67); this merge reads only `lens` from `merged.json`. Pass `--no-guardrails` exactly as in Step 3, and `--g17-not-run` when g17-prepare exited non-zero earlier in this run (R31).

Run it as one plain Bash call; a non-zero exit code in the tool result means stop and invoke `error-report-sdlc`. Use `lens` from `merged.json`: `lens.status` is the iteration status (`Approved` iff every lens is Approved), `lens.issues` the issues, `lens.recommendations` the recommendations. Increment the iteration counter by 1 only after the await barrier above is satisfied (exactly N lens results collected); never on partial or zero returns. <!-- R36, R-orchestrator-await, R-c1 -->

For plans with <5 tasks, dispatch one reviewer, `reviewerDispatch` (P25), by the same rule, including the R8 author rule (`description: "plan review"`). Its JSON goes to `<ITER_DIR>/lens-all.json` and merge-lanes runs with `--lenses all`.
When `reviewerDispatch.agentPath` is null, do not dispatch it; log it as for a lens and still run merge-lanes with `--lenses all`, which reports the missing result as a blocking lens failure (P25).

**Gate B — Verification Scorecard:** <!-- implements R40, R42, R44 -->

Write `scorecard.markdown` from `merged.json` verbatim to the plan file, replacing any previous `## Verification Scorecard` section (regenerated each iteration, R44). Placement: immediately after the last Task block, or after `## Suggested Review Dimensions` when that section exists, or after `## Guardrail Compliance` if no Suggested Review Dimensions. The script builds the dimension table from the lens issues' `severity` and `dimension`, the traceability matrix (inventory rows with `--inventory`; otherwise the lens rows under the note *(Matrix built from requirements checklist — requirement inventory unavailable)*), and the verdict from lens and Gate A severities with the verbatim labels: any CRITICAL → *"…Fix before archiving."*; no CRITICAL, any WARNING → *"…Ready for archive (with noted improvements)."*; otherwise *"All checks passed. Ready for archive."* <!-- R40, R48, R51 -->

**Review loop:**
- Approved → Step 6 is a no-op, proceed to Step 6.5 (hard gates 6.5 and 6.6 run before Step 7)
- Issues found → go to Step 6
- Max 3 iterations → use AskUserQuestion to surface unresolved issues to user. Offer **harden** (run `/harden-sdlc` to analyze why this failed and propose stronger guardrails / dimensions / instructions that would catch it earlier next time — opt-in, no surface is edited without your approval) alongside the existing escalation options. When the user selects **harden** (interactive mode only — suppressed when `--auto` is set), dispatch `Skill(harden-sdlc)` with `--failure-text "Plan reviewer loop did not converge after 3 iterations. Outstanding issues: <union-of-blocking-issues-across-all-lenses>"`, `--skill plan-sdlc`, `--step "Step 5 — review loop"`, `--operation "reviewer-loop max iterations"`. Implements R19.

## Step 6 (IMPROVE): Apply Review Fixes

Fix each blocking issue identified by the reviewer. Rewrite the plan file with fixes applied. If any revision changes the scope or approach from what was originally recorded, update the `## Deviations & assumptions` table accordingly.

**Gate B verdict wiring:** The Gate B Verification Scorecard verdict is treated as an additional blocking-issue source using the same `Issues Found` path. This avoids divergent gate phrasing (`no-opposite-logical-vectors` guardrail) — the CRITICAL verdict does not have a separate code path; it injects findings into the same blocking-issue set that the `Issues Found` path already processes. <!-- implements R41 -->

- When the Gate B verdict is CRITICAL: inject the scorecard CRITICAL findings into the blocking-issue list as if they were additional `Issues Found` findings. The plan enters Step 6 IMPROVE with these injected findings. The iteration counter (max 3) continues normally — Gate B CRITICAL does not create a new loop or counter.
- When the Gate B verdict is WARNING or SUGGESTION: no injection into Step 6. Caveats remain in the plan file. Proceed to Step 6.5 / Step 7 normally.
- When the Gate B verdict is PASS (clean): proceed normally.

**Material change detection:** <!-- implements R64 -->

Before rewriting the plan file, copy it:

```bash
cp "<PLAN_PATH>" "<ITER_DIR>/plan-before.md"
```

After the plan file is rewritten with the Step 6 fixes, run:

```bash
node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<ITER_DIR>/plan-before.md" --after "<PLAN_PATH>" --prev-dir "<ITER_DIR>"
```

Set `materialChangeDetected` to its `material` value and keep its `affectedLanes` for the merged re-dispatch; on a non-zero exit set `materialChangeDetected` to `true` and `affectedLanes` to `["*"]` (E9). The script fires on a task added or removed, a task's Files, Contract or Depends on changed, a Key Decision added, removed or changed (matched by its title or first words; changed means the same key with a different body, whitespace aside), an OpenSpec task mapping changed, or a Deviations row added or removed (R64's conservative superset). Wording, formatting and metadata-only fixes produce `material: false`. <!-- R64 -->

`affectedLanes` already includes the `rerun` entries: each lane or lens whose result in `<ITER_DIR>` held a blocking issue, so a result older than the fix is re-dispatched, not carried (R64, R67).

Re-dispatch the reviewer (back to Step 5 loop). When `materialChangeDetected` is true, the Step 5 merged dispatch path activates — see "Material change detection and merged re-dispatch" in Step 5.

If this is the 3rd iteration, use AskUserQuestion to surface remaining issues instead of looping.
