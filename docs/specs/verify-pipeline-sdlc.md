# verify-pipeline-sdlc Specification

> Analyze a failed CI run on a PR, classify the root cause, and either apply a minimal fix or emit a proposal — invoked from ship-sdlc's `verify-pipeline` step under `--auto`, or standalone for any PR.

**User-invocable:** yes
**Prepare script:** none (uses inline classifier helper at `plugins/sdlc-utilities/scripts/skill/verify-pipeline-sdlc-classify.js`)

## Inputs and flags

- A1: `--pr <number>` — PR number (required when invoked standalone; supplied by parent dispatcher when invoked as subagent)
- A2: `--logs <path-or-string>` — failed-check log excerpts. When omitted, the skill resolves logs internally via `lib/git.js::fetchFailedCheckLogs` for the failed run on the PR.
- A3: `--auto` — non-interactive; required when dispatched as a subagent under `flags.auto` from ship-sdlc.
- R1: MUST accept inputs `--pr <N>` and `--logs <path-or-string>`, plus optional `--auto`.
- R6: MUST be user-invocable as `/verify-pipeline-sdlc --pr <N>` for standalone use; in this mode the skill resolves logs internally via `fetchFailedCheckLogs` when `--logs` is not provided.

## State model

None.

## Step composition

### Phases

1. CONSUME — parse arguments, load logs (from `--logs` or via `fetchFailedCheckLogs`).
2. CLASSIFY — invoke the deterministic classifier helper.
   - **Script:** `verify-pipeline-sdlc-classify.js`
   - **Params:** logs text on stdin or `--logs-file <path>`
   - **Output:** JSON → `{category, signals: [...]}`
3. PROPOSE OR APPLY — Edit the minimal fix (R3) or emit a proposal (R4).
4. VERDICT — emit a single JSON line on stdout (R5).

### Requirements

- R2: MUST classify failed-check log excerpts into exactly one of: `lint`, `test-failure`, `type-error`, `build-error`, `dependency`, `infra`, `unknown`.
- R3: When classification is actionable AND a minimal fix is obvious (e.g. lint, single failing assertion, missing import), MUST apply the fix in-place via the `Edit` tool.
- R4: When classification is non-trivial (`build-error`, `dependency`, `infra`) OR when running interactively (no `--auto`), MUST summarise findings and propose a patch but MUST NOT auto-apply.
- R5: MUST emit a single JSON line on stdout matching one of:
  - `{"status":"fix-applied","filesChanged":[...],"summary":"..."}`
  - `{"status":"proposal","summary":"...","suggestedPatch":"..."}`
  - `{"status":"abort","reason":"..."}`

## Dispatch and routing

None.

## Gates

- G1: Single JSON line on stdout — pass when stdout has exactly one valid JSON object matching one of the verdict shapes (R5).
- G2: No file edits outside the working tree — pass when all `Edit` calls target paths inside the project root (R8).
- G3: No commit/push side effects — pass when `git status` shows the same staged/committed state before and after invocation (R7).

## Prepare script contract

None.

## Failure handling and resume

- E1: `--pr` missing AND `--logs` missing → emit `{"status":"abort","reason":"--pr or --logs required"}`, exit 0.
- E2: `gh` unauthenticated → emit `{"status":"abort","reason":"gh not authenticated"}`, exit 0.
- E3: classifier returns `unknown` → fall through to `proposal` verdict with the raw log excerpt as `summary`.

## Invariants and constraints

- R7: MUST NOT commit or push — that responsibility belongs to ship-sdlc's commit-sdlc dispatch (or the user).
- R8: MUST NOT modify files outside the working tree.
- R9: When dispatched as a subagent under `flags.auto`, MUST run non-interactively (no `AskUserQuestion`).
- R10: SKILL.md prose MUST cite this spec's R-numbers inline next to behavioural sites.
- C1: MUST NOT execute `git commit`, `git push`, or any state-changing git command.
- C2: MUST NOT modify files outside the project root.
- C3: MUST NOT prompt the user when `--auto` is set.
- C4: MUST NOT bypass classification — the deterministic classifier output is the source of truth for category routing.

## Integration

- I1: ship-sdlc — dispatched from the `verify-pipeline` post-PR step on CI failure when `flags.auto` is true.
- I2: commit-sdlc — ship-sdlc invokes commit-sdlc separately after this skill returns `fix-applied`; this skill does NOT call commit-sdlc directly.
- I3: lib/git.js — uses `fetchFailedCheckLogs` to resolve logs when `--logs` is omitted (R6).
