# Failure Context — harden-sdlc invocation (duplicate execute guardrail)

## Failure Details
Calling skill:  execute-plan-sdlc
Step:           Step 5c-ter — post-wave guardrail evaluation
Operation:      post-wave guardrail evaluation
Failure text:   Wave 2 completed, but the worker for task 4 added a helper function `extractContextKey()` to `lib/context.js` that the task never mentioned. The task was scoped to the `run()` function only. The out-of-scope helper adds untested code paths during wave execution.
Exit code:      0
Error type:     —
User intent:    Execute an approved plan for the context loader

## Loaded Surfaces (preview from harden-prepare.js)
plan.guardrails: 17 entries
execute.guardrails:
  - no-scope-creep (warning): "Implementation must stay within the task's stated scope — no additional features, refactoring, or cleanup beyond what was specified."
  - test-coverage-required (error): "Every changed source file must keep its promptfoo test cases passing."
review.dimensions: 13 entries (script-resolution, runtime-contract, ...)
copilot.instructions: 6 entries
error-report-skill: resolved

## Hardening Signal
The failure is scope creep, which the existing execute guardrail `no-scope-creep` already covers, but its description does not mention wave execution. The proposed execute-guardrails change overlaps `no-scope-creep` by description. Per R15, an overlapping proposal uses the `consolidate` action and cites `no-scope-creep` in its patch: it tightens the description to name wave execution (a worker must not add helpers, files or functions its task does not name) and may raise severity, never lower it. It does not create a second guardrail with an overlapping rule (strengthen-only, R8/C9).
