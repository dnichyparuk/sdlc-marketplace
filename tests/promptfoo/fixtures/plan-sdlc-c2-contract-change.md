# Plan Contract Change Re-dispatch (R64)

This fixture exercises the Step 6 diff-material detector for a Contract-only edit. When Step 6 IMPROVE changes one task's Contract and leaves the task count unchanged, the NEXT Step 5 iteration must re-dispatch only the lanes and lenses named in `affectedLanes` and carry the other results forward with `merge-lanes --carry`.

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

## Plan under review: "Catalog price-sync" (5 tasks)

The plan has 5 tasks, and the task count is unchanged by Step 6.

## Step 5 iteration 1 result (before Step 6)

Status: **Issues Found**. The `architecture` lens flagged that Task 3's Contract does not render its error shape.

`<critiqueDir>/iter-1/` holds `lens-architecture.json`, `lens-requirements.json`, `lens-risk.json`, and the forwarded `static-structural.json`, `content-coverage.json`, `dimension-coverage.json`.

## Step 6 IMPROVE — fixes applied

Only Task 3's `**Contract:**` shape line changes. No task is added or removed, and Files and Depends on are unchanged.

```diff
-- shape (api): PUT /catalog/prices accepts a price batch and returns the stored batch
+- shape (api): PUT /catalog/prices accepts a price batch and returns the stored batch; on a malformed vendor payload it returns 422 with `{ "error": "invalid_payload", "details": [...] }`
```

## diff-material output

```json
{ "material": true, "triggers": ["contracts"], "details": { "contracts": ["Task 3"] }, "affectedGates": ["G14", "G18", "G19", "G20", "G21"], "affectedLanes": ["content-coverage", "guardrail-compliance", "lens:architecture", "lens:risk"] }
```
