# Simulated Project Context: Project Without PR Template

## Project Structure

Node.js/Express API project without a custom PR template.

```
.github/
  PULL_REQUEST_TEMPLATE.md ← GitHub template (2 sections)
src/
  routes/
  middleware/
  models/
package.json
```

## GitHub PR Template (.github/PULL_REQUEST_TEMPLATE.md)

```markdown
## What Changed

Describe what was changed.

## Testing Steps

How to test this PR.
```

## Status

**No `.claude/pr-template.md`** — the custom template has not been created yet.

## Recent PR Patterns (via gh pr list)

Recent PRs consistently use:
- `## Summary` section
- `## Testing` section
- Some include a `## PROJ-789` JIRA reference section (about 60% of PRs)

Branch names: `feat/PROJ-789-search`, `fix/PROJ-790-auth`, suggesting active JIRA usage.

## Project Signals

- `package.json` dependencies: express 4.18, jsonwebtoken 9.0, jest 29
- No Cargo.toml, go.mod, or other language manifests
- Has `.github/PULL_REQUEST_TEMPLATE.md` with 2 sections

### prepare.scan

```json
{
  "signals": {
    "languages": ["javascript"],
    "frameworks": ["express"],
    "hasDatabase": false,
    "dbType": null,
    "hasApi": true,
    "apiFormat": "rest",
    "hasTests": true,
    "testFramework": "jest",
    "hasCi": false,
    "ciPlatform": null,
    "hasMonorepo": false,
    "hasOpenSpec": false,
    "directories": [".github/", "src/"],
    "reviewDimensions": [],
    "claudeMdRules": [],
    "structure": {
      "**/routes/**": { "label": "API routes", "count": 0, "samples": ["src/routes/"], "truncated": false },
      "**/middleware/**": { "label": "Middleware", "count": 0, "samples": ["src/middleware/"], "truncated": false },
      "**/models/**": { "label": "Data models", "count": 0, "samples": ["src/models/"], "truncated": false }
    }
  },
  "files": {
    "package.json": {
      "content": "{\"dependencies\":{\"express\":\"4.18\",\"jsonwebtoken\":\"9.0\"},\"devDependencies\":{\"jest\":\"29\"}}",
      "truncated": false
    },
    ".github/PULL_REQUEST_TEMPLATE.md": {
      "content": "## What Changed\n\nDescribe what was changed.\n\n## Testing Steps\n\nHow to test this PR.\n",
      "truncated": false
    }
  },
  "hosting": { "github": true, "via": "remote" },
  "ciFiles": [],
  "git": {
    "branch": "feat/PROJ-789-search",
    "recentCommits": ["a1b2c3d feat(PROJ-789): search", "e4f5a6b fix(PROJ-790): auth"]
  },
  "jiraEvidence": { "keys": { "PROJ": 4 }, "ambiguous": false },
  "recentPrs": [
    { "title": "feat(PROJ-789): search", "headings": ["## Summary", "## Testing", "## PROJ-789"] },
    { "title": "fix(PROJ-790): auth", "headings": ["## Summary", "## Testing"] }
  ]
}
```
