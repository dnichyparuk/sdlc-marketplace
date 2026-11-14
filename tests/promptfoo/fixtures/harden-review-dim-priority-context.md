# Failure Context — harden-sdlc invocation (review-dimension priority)

## Failure Details
Calling skill:  review-sdlc
Step:           Step 5 — actionable findings
Operation:      post-merge regression analysis
Failure text:   Review passed with no blockers, but a regression appeared after merge in `infrastructure/db-config.yaml`. The file was changed, and no review dimension covers YAML config files, so nobody reviewed it. The plan guardrail `spec-first` is also too vague: it does not say that the spec lives in docs/specs/ or that it must cite the issue number, so the plan shipped the config change without a spec update. Both gaps contributed to the regression.
Exit code:      —
Error type:     —
User intent:    Review the database configuration change before release

## Loaded Surfaces (preview from harden-prepare.js)
plan.guardrails:
  - spec-first (error): "Changes must have a spec before code."
  - test-coverage-required (error): "Every task that creates or modifies source code must include corresponding promptfoo test cases."
execute.guardrails: 10 entries
review.dimensions:
  - script-resolution (high): "Reviews find-based script resolution and Glob-based reference lookup patterns in commands and skills."
  - runtime-contract (high)
  - skill-architecture (medium)
  (none of the existing dimensions have triggers matching `**/*.yaml`)
copilot.instructions: 6 entries (one per existing dimension)
error-report-skill: resolved

## Hardening Signal
Two surfaces need a proposal: a new review dimension for YAML config files (for example `yaml-config-coverage`, triggers `**/*.yaml`) on the review-dimensions surface, and a tighter `spec-first` description on the plan-guardrails surface. Per R14, the orchestrator orders `proposals[]` by surface: every review-dimensions proposal first, then plan-guardrails, then execute-guardrails, then copilot-instructions. So the YAML dimension proposal comes before the `spec-first` proposal, even though the `spec-first` signal names a guardrail by id.
