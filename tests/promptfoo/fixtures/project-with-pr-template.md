# Simulated Project Context: Project with Existing PR Template

## Project Structure

Full-stack web application with existing PR template customizations.

```
.claude/
  pr-template.md          ← existing custom template (5 sections)
.github/
  PULL_REQUEST_TEMPLATE.md ← GitHub template (2 sections: "What Changed", "Testing Steps")
src/
package.json
```

## Existing .claude/pr-template.md

```markdown
## Summary

Describe what this PR does in 2-3 sentences. Focus on user-facing or business impact.

## Technical Design

Explain the approach taken, key architectural decisions, and any trade-offs considered.

## Testing

Describe how the changes were tested: unit tests, integration tests, manual verification.

## Deployment

List any deployment steps, environment variable changes, database migrations, or infrastructure changes required.

## Rollback

Describe how to roll back these changes if issues arise in production.
```

## Recent PR Patterns (via gh pr list)

Recent PRs consistently use the 5-section format above. All PRs include "Deployment" and "Rollback" sections because the project deploys to production frequently.

## JIRA Evidence

Branch names in recent PRs: `feat/PROJ-123-add-payment`, `fix/PROJ-456-auth-bug`.
JIRA project: PROJ.

### prepare.scan

```json
{
  "signals": {
    "languages": [],
    "frameworks": [],
    "hasDatabase": false,
    "dbType": null,
    "hasApi": false,
    "apiFormat": null,
    "hasTests": false,
    "testFramework": null,
    "hasCi": false,
    "ciPlatform": null,
    "hasMonorepo": false,
    "hasOpenSpec": false,
    "directories": [".claude/", ".github/", "src/"],
    "reviewDimensions": [],
    "claudeMdRules": [],
    "structure": {
      "src/**": { "label": "Source", "count": 0, "samples": [], "truncated": false }
    }
  },
  "files": {
    ".claude/pr-template.md": {
      "content": "## Summary\n\n## Technical Design\n\n## Testing\n\n## Deployment\n\n## Rollback\n",
      "truncated": false
    },
    ".github/PULL_REQUEST_TEMPLATE.md": {
      "content": "## What Changed\n\n## Testing Steps\n",
      "truncated": false
    }
  },
  "hosting": { "github": true, "via": "remote" },
  "ciFiles": [],
  "git": {
    "branch": "feat/PROJ-123-add-payment",
    "recentCommits": ["a1b2c3d feat(PROJ-123): add payment", "e4f5a6b fix(PROJ-456): auth bug"]
  },
  "jiraEvidence": { "keys": { "PROJ": 4 }, "ambiguous": false },
  "recentPrs": [
    { "title": "feat(PROJ-123): add payment", "headings": ["## Summary", "## Technical Design", "## Testing", "## Deployment", "## Rollback"] },
    { "title": "fix(PROJ-456): auth bug", "headings": ["## Summary", "## Technical Design", "## Testing", "## Deployment", "## Rollback"] }
  ]
}
```
