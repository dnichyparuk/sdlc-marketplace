# Failure Context — harden-sdlc invocation (duplicate plan guardrail)

## Failure Details
Calling skill:  plan-sdlc
Step:           Step 3 — CRITIQUE
Operation:      error-severity guardrail evaluation
Failure text:   Plan task 3 modifies `scripts/lib/foo.js` to add a new resolver. Its implementation snippet reads `const root = process.cwd()` at line 47 instead of calling `resolveSdlcRoot()`. The task description does not repeat the cwd-safety rule, so the bare `process.cwd()` call reached an approved plan.
Exit code:      —
Error type:     —
User intent:    Author an implementation plan for a new project-root resolver

## Loaded Surfaces (preview from harden-prepare.js)
plan.guardrails:
  - no-bare-cwd (error): "Avoid bare `process.cwd()` in scripts — always route through `resolveSdlcRoot()`."
  - test-coverage-required (error): "Every task that creates or modifies source code must include corresponding promptfoo test cases."
  - spec-first (error): "Any task that modifies a skill's behavior must first update the corresponding spec in docs/specs/<skill-name>.md."
execute.guardrails: 10 entries
review.dimensions: 13 entries (script-resolution, runtime-contract, ...)
copilot.instructions: 6 entries
error-report-skill: resolved

## Hardening Signal
The failure is the class of bug that the existing plan guardrail `no-bare-cwd` already targets: a bare `process.cwd()` call in a script. The proposed plan-guardrails change overlaps `no-bare-cwd` by id and by description. Per R15, an overlapping proposal uses the `consolidate` action and cites `no-bare-cwd` in its patch: it tightens the existing description (for example, the rule also covers implementation snippets inside plan tasks) and keeps severity `error`. It does not create a second guardrail id for the same rule (strengthen-only, R8/C9).
