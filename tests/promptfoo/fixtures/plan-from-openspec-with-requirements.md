# OpenSpec Context: Ready for Plan with Requirement Inventory

## plan-prepare.js Output (pre-computed)

```json
{
  "openspec": {
    "present": true,
    "activeChanges": [{
      "name": "add-resource-indicators",
      "stage": "ready-for-plan",
      "deltaSpecCount": 2,
      "hasProposal": true,
      "hasDesign": true,
      "hasTasks": true,
      "tasksDone": 0,
      "tasksTotal": 3
    }],
    "branchMatch": "add-resource-indicators"
  },
  "fromOpenspec": {
    "valid": true,
    "changeName": "add-resource-indicators",
    "hasProposal": true,
    "deltaSpecCount": 2,
    "hasDesign": true,
    "hasTasks": true,
    "tasksDone": 0,
    "tasksTotal": 3,
    "stage": "ready-for-plan"
  },
  "openspecContext": {
    "tasks": [
      { "ref": "add-resource-indicator-component-ab12cd", "line": 1, "title": "Add ResourceIndicator component", "indent": 0, "done": false },
      { "ref": "add-getindicators-method-ef34gh", "line": 2, "title": "Add getIndicators() method to ResourceService", "indent": 0, "done": false },
      { "ref": "extend-api-response-ij56kl", "line": 3, "title": "Extend GET /api/resources/:id response", "indent": 0, "done": false }
    ],
    "tasksUpdated": 3,
    "requirements": [
      {
        "reqId": "req-1",
        "capability": "ResourceIndicator UI component",
        "type": "ADDED",
        "name": "ResourceIndicator component with health/capacity/availability variants",
        "scenarioCount": 3
      },
      {
        "reqId": "req-2",
        "capability": "ResourceService.getIndicators()",
        "type": "ADDED",
        "name": "Data service method returning indicator data with 30s cache TTL",
        "scenarioCount": 2
      }
    ],
    "requirementsError": null
  },
  "intakeAuditDispatch": {
    "agent": "sdlc:plan-intake-verify",
    "agentPath": "/path/to/agents/plan-intake-verify.md",
    "model": "sonnet",
    "effort": "medium",
    "inputNames": ["PROPOSAL","DELTA_SPECS","TASKS_MD","DESIGN","REQUIREMENTS_JSON"],
    "presetInputs": { "REQUIREMENTS_JSON": "[{\"reqId\":\"req-1\",\"capability\":\"ResourceIndicator UI component\",\"type\":\"ADDED\",\"name\":\"ResourceIndicator component with health/capacity/availability variants\",\"scenarioCount\":3},{\"reqId\":\"req-2\",\"capability\":\"ResourceService.getIndicators()\",\"type\":\"ADDED\",\"name\":\"Data service method returning indicator data with 30s cache TTL\",\"scenarioCount\":2}]" }
  },
  "guardrails": [
    { "id": "test-coverage-required", "description": "Every task must include test cases", "severity": "error" }
  ],
  "errors": []
}
```

## OpenSpec Artifacts (simulated reads)

### proposal.md
Resource indicators feature — add visual status indicators to resource cards showing availability, health, and capacity.

### design.md
Use a shared ResourceIndicator component with configurable thresholds. Data fetched via existing ResourceService with a new `getIndicators()` method.

### specs/resource-indicator-ui.md
#### ADDED
- ResourceIndicator component with health, capacity, and availability variants
- Color-coded badges using design system tokens

### specs/resource-indicator-data.md
#### ADDED
- ResourceService.getIndicators(resourceId) method returning indicator data
- IndicatorCache with 30-second TTL

### tasks.md
- [ ] Add ResourceIndicator component <!-- ref:add-resource-indicator-component-ab12cd -->
- [ ] Add getIndicators() method to ResourceService <!-- ref:add-getindicators-method-ef34gh -->
- [ ] Extend GET /api/resources/:id response <!-- ref:extend-api-response-ij56kl -->
