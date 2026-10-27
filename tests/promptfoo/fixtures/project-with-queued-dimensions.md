# Simulated Project Context: Project with Batched Dimensions (cap applied)

## Project Structure

Full rewrite touching many files across the project. 10 review dimensions are configured and all 10 match changed files. The dispatch batch size is 8, so the dimensions run in two batches: 8 in batch 1 and 2 in batch 2. No dimension is dropped.

```
src/
  api/            ← API endpoints
  services/       ← Business services
  models/         ← Data models
  middleware/     ← Express middleware
  utils/          ← Utility helpers
  types/          ← TypeScript type definitions
  __tests__/      ← Test files
docs/
  i18n/           ← Internationalization docs
  a11y/           ← Accessibility docs
.claude/
  review-dimensions/
    security-review.md
    code-quality-review.md
    api-review.md
    test-coverage.md
    type-safety.md
    performance.md
    error-handling.md
    documentation-quality.md
    accessibility.md
    internationalization.md
package.json
```

## Installed Review Dimensions

Ten dimensions installed, all ACTIVE. In priority order (severity descending, then matched files ascending) the first 8 form batch 1; accessibility and documentation-quality form batch 2.

## review-prepare.js Output (JSON manifest)

```json
{
  "scope": "all",
  "base_branch": "main",
  "current_branch": "feat/full-rewrite",
  "git": {
    "commit_count": 15,
    "commit_log": "aaa0001 feat: rewrite user service\naaa0002 feat: rewrite auth service\naaa0003 feat: new API routes\naaa0004 feat: updated models\naaa0005 test: comprehensive test suite",
    "changed_files": [
      "src/api/users.ts",
      "src/api/orders.ts",
      "src/api/products.ts",
      "src/services/user.ts",
      "src/services/auth.ts",
      "src/services/order.ts",
      "src/models/user.ts",
      "src/models/order.ts",
      "src/middleware/auth.ts",
      "src/middleware/validation.ts",
      "src/utils/errors.ts",
      "src/utils/helpers.ts",
      "src/types/api.ts",
      "src/__tests__/user.test.ts",
      "src/__tests__/order.test.ts",
      "docs/i18n/strings.md",
      "docs/a11y/guidelines.md"
    ]
  },
  "dimensions": [
    { "name": "security-review", "status": "ACTIVE", "severity": "high", "matched_count": 8, "batch": 1 },
    { "name": "code-quality-review", "status": "ACTIVE", "severity": "medium", "matched_count": 25, "batch": 1 },
    { "name": "api-review", "status": "ACTIVE", "severity": "high", "matched_count": 6, "batch": 1 },
    { "name": "test-coverage", "status": "ACTIVE", "severity": "medium", "matched_count": 12, "batch": 1 },
    { "name": "type-safety", "status": "ACTIVE", "severity": "medium", "matched_count": 20, "batch": 1 },
    { "name": "performance", "status": "ACTIVE", "severity": "medium", "matched_count": 10, "batch": 1 },
    { "name": "error-handling", "status": "ACTIVE", "severity": "medium", "matched_count": 15, "batch": 1 },
    { "name": "documentation-quality", "status": "ACTIVE", "severity": "low", "matched_count": 5, "batch": 2 },
    { "name": "accessibility", "status": "ACTIVE", "severity": "low", "matched_count": 3, "batch": 2 },
    { "name": "internationalization", "status": "ACTIVE", "severity": "low", "matched_count": 2, "batch": 1 }
  ],
  "plan_critique": {
    "uncovered_files": [],
    "uncovered_suggestions": [],
    "over_broad_dimensions": [],
    "overlapping_pairs": [],
    "dimension_cap_applied": true,
    "queued_dimensions": []
  },
  "summary": {
    "total_dimensions": 10,
    "active_dimensions": 10,
    "skipped_dimensions": 0,
    "queued_dimensions": 0,
    "total_changed_files": 45,
    "uncovered_file_count": 0
  }
}
```
