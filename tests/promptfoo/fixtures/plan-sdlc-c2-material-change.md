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
    { "name": "static-structural", "agent": "sdlc:plan-lane-static", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-static.md", "model": "haiku", "effort": "low", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_SUMMARY","ACTIVE_GUARDRAILS"], "presetInputs": { "ACTIVE_GUARDRAILS": "[]" }, "gateIds": ["G1","G2","G7"] },
    { "name": "content-coverage", "agent": "sdlc:plan-lane-content", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-content.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_SUMMARY","OPENSPEC_TASKS","ACTIVE_GUARDRAILS","BRIEF_FINDING_IDS","FORMAT_REFERENCE_PATH","PLAN_TEMPLATE_PATH"], "presetInputs": { "OPENSPEC_TASKS": "null", "ACTIVE_GUARDRAILS": "[]", "FORMAT_REFERENCE_PATH": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/plan-format-reference.md" }, "gateIds": ["G5","G6","G8","G9","G11","G13","G15","G16"] },
    { "name": "guardrail-compliance", "agent": "sdlc:plan-lane-guardrail", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-guardrail.md", "model": "sonnet", "effort": "low", "inputNames": ["PLAN_FILE_PATH","ACTIVE_GUARDRAILS"], "presetInputs": { "ACTIVE_GUARDRAILS": "[]" }, "gateIds": ["G14"] },
    { "name": "dimension-coverage", "agent": "sdlc:plan-lane-g17", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-g17.md", "model": "sonnet", "effort": "low", "inputNames": ["PLAN_FILE_PATH","FIRED_CRITERIA_JSON"], "presetInputs": {}, "gateIds": ["G17"] }
  ],
  "lensReviewers": [
    { "lens": "architecture", "agent": "sdlc:plan-lens-architecture", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lens-architecture.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_CHECKLIST","LENS","LENS_FOCUS","BRIEF_FILE","GUARDRAILS","REQUIREMENTS_JSON"], "presetInputs": { "LENS": "architecture", "LENS_FOCUS": "- Buildability\n- Task descriptions\n- Decision documentation\n- Dependency accuracy", "GUARDRAILS": "none configured", "REQUIREMENTS_JSON": "null" }, "focusCategories": ["Buildability","Task descriptions","Decision documentation","Dependency accuracy"], "dispatchModel": null, "dispatchEffort": null },
    { "lens": "requirements", "agent": "sdlc:plan-lens-requirements", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lens-requirements.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_CHECKLIST","LENS","LENS_FOCUS","BRIEF_FILE","GUARDRAILS","REQUIREMENTS_JSON","OPENSPEC_TASKS"], "presetInputs": { "LENS": "requirements", "LENS_FOCUS": "- Requirements coverage\n- Metadata completeness\n- Plan completeness\n- OpenSpec G16\n- Exploration provenance\n- Best-practice traceability", "GUARDRAILS": "none configured", "REQUIREMENTS_JSON": "null", "OPENSPEC_TASKS": "none — plan not from OpenSpec" }, "focusCategories": ["Requirements coverage","Metadata completeness","Plan completeness","OpenSpec G16","Exploration provenance","Best-practice traceability"], "dispatchModel": null, "dispatchEffort": null },
    { "lens": "risk", "agent": "sdlc:plan-lens-risk", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lens-risk.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_CHECKLIST","LENS","LENS_FOCUS","BRIEF_FILE","GUARDRAILS","REQUIREMENTS_JSON"], "presetInputs": { "LENS": "risk", "LENS_FOCUS": "- File paths\n- Verification strategy\n- Scope discipline\n- Guardrail compliance", "GUARDRAILS": "none configured", "REQUIREMENTS_JSON": "null" }, "focusCategories": ["File paths","Verification strategy","Scope discipline","Guardrail compliance"], "dispatchModel": null, "dispatchEffort": null }
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
- the Step 3 lanes of `lanes[]` except guardrail-compliance (no guardrails are configured): static-structural, content-coverage,
  dimension-coverage — the SAME lanes Step 3 uses, re-run against the
  updated 5-task plan
- all 3 entries of `lensReviewers[]` (architecture, requirements, risk)

This is 6 total dispatched agents, awaited as one barrier (N = 3 lanes + 3 lenses = 6) before any
consolidation. This merged fan-out counts as exactly ONE iteration of the Step 5 review loop (the
counter goes from 1 to 2, not to 3), and `materialChangeDetected` is cleared back to `false` once
the merged issue set is assembled.
