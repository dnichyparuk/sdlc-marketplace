# Plan Execution with Guardrails

## Plan
Feature: Add data export API
Tasks: 4 tasks across 2 waves

### Task 1: Create export service
**Complexity:** Standard | **Risk:** Low | **Depends on:** none | **Verify:** tests
Files: Create `src/services/export.ts`

### Task 2: Add API endpoint
**Complexity:** Standard | **Risk:** Low | **Depends on:** Task 1 | **Verify:** tests
Files: Modify `src/routes/api.ts`

### Task 3: Add rate limiting
**Complexity:** Standard | **Risk:** Medium | **Depends on:** Task 2 | **Verify:** tests
Files: Modify `src/middleware/rateLimit.ts`

### Task 4: Write integration tests
**Complexity:** Standard | **Risk:** Low | **Depends on:** Task 2, Task 3 | **Verify:** tests
Files: Create `tests/export.test.ts`

## Project Config (.sdlc/config.json)
```json
{
  "execute": {
    "guardrails": [
      {
        "id": "no-raw-sql",
        "description": "Code changes must not introduce direct SQL queries outside the repository/data-access layer.",
        "severity": "error"
      },
      {
        "id": "prefer-composition",
        "description": "Prefer composition over class inheritance for new code.",
        "severity": "warning"
      }
    ]
  }
}
```

## Git Status
Branch: feat/data-export
Uncommitted changes: none
