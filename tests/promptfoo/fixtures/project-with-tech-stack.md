# Simulated Project Context: React/TypeScript Frontend Project

## Project Structure

React/TypeScript frontend application.

```
src/
  components/     ← 47 React component files
  pages/          ← 12 page-level components
  hooks/          ← 18 custom React hooks
  __tests__/      ← 63 test files (jest + testing-library)
  api/            ← API client and types
docs/             ← 8 markdown documentation files
.storybook/       ← Storybook config
package.json
tsconfig.json
```

## Key Dependencies (package.json)

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-router-dom": "6.22.0",
    "axios": "1.6.7"
  },
  "devDependencies": {
    "typescript": "5.4.2",
    "@testing-library/react": "14.2.1",
    "@testing-library/jest-dom": "6.4.2",
    "@testing-library/user-event": "14.5.2",
    "jest": "29.7.0",
    "@storybook/react": "8.0.4"
  }
}
```

## Review Dimensions State

`.claude/review-dimensions/` directory does **not exist** — no dimensions installed yet.

## Signals for Dimension Proposals

| Signal | Evidence | Proposed Dimension |
|--------|----------|-------------------|
| TypeScript | tsconfig.json, *.ts/*.tsx files | code-quality-review (baseline) |
| testing-library + jest | devDependencies, __tests__/ dir (63 files) | test-coverage |
| React components + pages | 47 components, 12 pages | ui-review |
| docs/ directory (8 files) | 8 markdown docs | documentation |
| No backend, no DB, no auth deps | No express/fastapi/sqlalchemy | no api/security/data-integrity |

### prepare.scan

```json
{
  "signals": {
    "languages": ["typescript"],
    "frameworks": ["react"],
    "hasDatabase": false,
    "dbType": null,
    "hasApi": false,
    "apiFormat": null,
    "hasTests": true,
    "testFramework": "jest",
    "hasCi": false,
    "ciPlatform": null,
    "hasMonorepo": false,
    "hasOpenSpec": false,
    "directories": ["src/", "docs/", ".storybook/"],
    "reviewDimensions": [],
    "claudeMdRules": [],
    "structure": {
      "**/components/**": { "label": "UI components", "count": 47, "samples": ["src/components/"], "truncated": false },
      "**/__tests__/**": { "label": "Test files", "count": 63, "samples": ["src/__tests__/"], "truncated": false },
      "docs/**": { "label": "Documentation", "count": 8, "samples": ["docs/"], "truncated": false }
    }
  },
  "files": {
    "package.json": {
      "content": "{\"dependencies\":{\"react\":\"18.2.0\",\"react-dom\":\"18.2.0\",\"react-router-dom\":\"6.22.0\",\"axios\":\"1.6.7\"},\"devDependencies\":{\"typescript\":\"5.4.2\",\"@testing-library/react\":\"14.2.1\",\"@testing-library/jest-dom\":\"6.4.2\",\"@testing-library/user-event\":\"14.5.2\",\"jest\":\"29.7.0\",\"@storybook/react\":\"8.0.4\"}}",
      "truncated": false
    }
  },
  "hosting": { "github": true, "via": "remote" },
  "ciFiles": [],
  "git": { "branch": "main", "recentCommits": [] },
  "jiraEvidence": { "keys": {}, "ambiguous": true },
  "recentPrs": []
}
```
