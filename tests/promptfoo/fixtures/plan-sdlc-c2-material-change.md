# Plan Material Change Re-dispatch (R64)

This fixture exercises the Step 6 material-change detector and the Step 5 merged re-dispatch it
triggers: when Step 6 IMPROVE adds (or removes) a task, the NEXT Step 5 iteration must dispatch
the Step 3 lanes AND the Step 5 lens reviewers together, in a single message, as one combined
review-loop iteration.

## plan-prepare.js Output (pre-computed)

```json
{
  "openspec": { "present": false, "activeChanges": [], "branchMatch": null },
  "fromOpenspec": null,
  "guardrails": [],
  "lanes": [
    { "name": "static-structural", "subagentType": "general-purpose", "model": "haiku", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-static-structural-prompt.md", "gateIds": ["G1","G2","G3","G7","G12"] },
    { "name": "content-coverage", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-content-coverage-prompt.md", "gateIds": ["G5","G6","G8","G9","G11","G13","G15","G16"] },
    { "name": "file-existence", "subagentType": "general-purpose", "model": "haiku", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-file-existence-prompt.md", "gateIds": ["G4","G10"] },
    { "name": "guardrail-compliance", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-guardrail-compliance-prompt.md", "gateIds": ["G14"] },
    { "name": "dimension-coverage", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/g17-dimension-coverage-prompt.md", "gateIds": ["G17"] }
  ],
  "lensReviewers": [
    { "lens": "architecture", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-architecture-prompt.md", "focusCategories": ["Buildability","Task descriptions","Decision documentation","Dependency accuracy"] },
    { "lens": "requirements", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-requirements-prompt.md", "focusCategories": ["Requirements coverage","Metadata completeness","Plan completeness","OpenSpec G16","Exploration provenance","Best-practice traceability"] },
    { "lens": "risk", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-risk-prompt.md", "focusCategories": ["File paths","Verification strategy","Scope discipline","Guardrail compliance"] }
  ],
  "errors": []
}
```

## Plan under review: "Catalog price-sync" (5 tasks after Step 6 fixes)

## Step 5 iteration 1 result (before Step 6)

Status: **Issues Found**. Both the `requirements` and `risk` lens reviewers flagged that the plan
does not cover validating the incoming price-sync payload before it reaches the catalog writer —
no task addresses malformed/partial vendor payloads.

`taskCountBefore` (snapshotted at the start of Step 6) = **4**.

## Step 6 IMPROVE — fixes applied

To resolve the lens findings, the plan author:
- Adds a brand-new **Task 5: "Validate incoming price-sync payload"** (`src/sync/validate-payload.ts`,
  `tests/sync/validate-payload.test.ts`) — this did not exist before.
- Adds a `## Deviations & assumptions` row: `payload validation | (not specified) | rejects
  malformed vendor payloads before write | implied by lens finding on data integrity`.
- Leaves Tasks 1–4 and their `**Files:**` blocks otherwise unchanged.

`taskCountAfter` (recomputed after the rewrite) = **5**.

## Material change detection outcome

`taskCountAfter !== taskCountBefore` (5 ≠ 4) → the task-count-delta trigger fires →
`materialChangeDetected = true`.

## What must happen on the NEXT Step 5 iteration (iteration 2)

Per R64, because `materialChangeDetected` is true, iteration 2 must dispatch, in a single message,
as parallel Agent tool calls:
- all 5 entries of `lanes[]` (static-structural, content-coverage, file-existence,
  guardrail-compliance, dimension-coverage) — the SAME lanes Step 3 uses, re-run against the
  updated 5-task plan
- all 3 entries of `lensReviewers[]` (architecture, requirements, risk)

This is 8 total dispatched agents, awaited as one barrier (N = 5 lanes + 3 lenses = 8) before any
consolidation. This merged fan-out counts as exactly ONE iteration of the Step 5 review loop (the
counter goes from 1 to 2, not to 3), and `materialChangeDetected` is cleared back to `false` once
the merged issue set is assembled.
