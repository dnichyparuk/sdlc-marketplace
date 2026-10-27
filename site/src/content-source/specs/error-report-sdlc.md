# error-report-sdlc Specification

> Internal procedure invoked by other SDLC skills to create a GitHub issue tracking an actionable error, with full context capture and two-gate user consent.

**User-invocable:** no
**Prepare script:** `skill/error-report-prepare.js`

## Inputs and flags

- R1: Only invoked internally by other SDLC skills — never in direct response to user requests

## State model

None.

## Step composition

### Phases

1. CONSUME — receive error context from calling skill (skill name, step, operation, error details, suggested investigation)
2. CLASSIFY — determine if the error is issue-worthy
3. VERIFY — pre-flight checks (gh CLI, GitHub remote)
4. CONSENT — two-gate user approval (propose, then confirm with assembled content)
5. DO — assemble issue from template and create via `gh issue create`

### Requirements

- R2: Classify errors as issue-worthy or not before proceeding
- R3: Run pre-flight checks: verify `gh` CLI availability and GitHub remote is configured
- R5: Assemble issue from the `ToolingError.md` template with full error context
- R6: Create the GitHub issue using `gh issue create` in the `rnagrodzki/sdlc-marketplace` repository only

## Dispatch and routing

None.

## Gates

- R4: Two-gate consent flow: first gate proposes the issue, second gate confirms after showing the assembled content
- G1: Error classified — error is determined to be issue-worthy before proceeding
- G2: Pre-flight passed — `gh` CLI is available and GitHub remote is accessible
- G3: Both consent gates passed — user approved both the proposal and the final assembled issue
- G4: Issue created — `gh issue create` returns a valid issue URL

## Prepare script contract

- P1: `templateText` (string) — contents of `skills/error-report-sdlc/templates/ToolingError.md`; the orchestrator fills it strictly from manifest fields
- P2: `priority` (`High` | `Medium`) — `High` when `errorType` is `script crash` or `build failure`, or `exitOrHttpCode` is `2`; otherwise `Medium`. Computed by the script, never inferred by the model; display-only (not a label, not passed to `gh`)
- P3: `targetRepo` and `labels` — the fixed target repository (C4) and `["tooling-error", <calling skill>]`

## Failure handling and resume

- E1: `gh` CLI not available → inform calling skill, skip issue creation
- E2: GitHub remote not configured → inform calling skill, skip issue creation
- E3: User declines at either consent gate → stop, do not create issue
- E4: `gh issue create` fails → show error, do not retry

## Invariants and constraints

- R7: Must not block or replace the calling skill's normal error handling
- C1: Must not be invoked directly in response to user requests — internal only
- C2: Must not create a GitHub issue without both consent gates passing
- C3: Must not block or replace the calling skill's normal error handling
- C4: Must not create issues in any repository other than `rnagrodzki/sdlc-marketplace`

## Integration

- I1: Calling SDLC skills — receive 5 required input fields (skill, step, operation, error, suggested investigation)
- I2: `gh` CLI — used for GitHub issue creation
- I3: `ToolingError.md` template — provides issue body structure
- I4: `error-report-orchestrator` returns only `{title, body, priority}` JSON; `priority` is P2 copied verbatim.

## Appendix — history

### Issue trail

| Id | History |
|---|---|
| (header) | pinned on orchestrator agent, not skill frontmatter — see issue #202 |
