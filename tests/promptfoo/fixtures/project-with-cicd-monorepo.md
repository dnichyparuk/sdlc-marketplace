# Simulated Project Context: Monorepo with CI/CD and Multiple Workspaces

## Project Structure

TypeScript monorepo using pnpm workspaces with GitHub Actions CI/CD.

```
packages/
  api/            ← Backend Express API package
  web/            ← React frontend package
  shared/         ← Shared utilities and types
apps/
  dashboard/      ← Internal dashboard app
.github/
  workflows/
    ci.yml        ← Build, test, lint on PRs
    release.yml   ← Release automation
.circleci/
  config.yml      ← Additional CI pipeline
pnpm-workspace.yaml
package.json      ← Root workspace config
tsconfig.json     ← Base TypeScript config
```

## Key Dependencies (root package.json)

```json
{
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "devDependencies": {
    "typescript": "5.4.2",
    "eslint": "8.57.0",
    "turbo": "2.1.0",
    "changesets": "2.27.0"
  }
}
```

## Workspace Config (pnpm-workspace.yaml)

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

## Signals for Dimension Proposals

| Signal | Evidence | Proposed Dimension |
|--------|----------|--------------------|
| pnpm-workspace.yaml + packages/ + apps/ | Monorepo workspace config | monorepo-governance-review |
| .github/workflows/ + .circleci/ | CI/CD pipeline files | ci-cd-pipeline-review |
| TypeScript strict mode | tsconfig.json present | code-quality-review (baseline) |
| No auth/ORM/migration files | No auth or DB signals | no security/data-integrity |

### prepare.scan

```json
{
  "signals": {
    "languages": ["typescript"],
    "frameworks": ["express", "react"],
    "hasDatabase": false,
    "dbType": null,
    "hasApi": true,
    "apiFormat": "rest",
    "hasTests": false,
    "testFramework": null,
    "hasCi": true,
    "ciPlatform": "github-actions",
    "hasMonorepo": true,
    "hasOpenSpec": false,
    "directories": ["packages/", "apps/", ".github/", ".circleci/"],
    "reviewDimensions": [],
    "claudeMdRules": [],
    "structure": {
      "packages/**": { "label": "Workspace packages", "count": 3, "samples": ["packages/api/", "packages/web/", "packages/shared/"], "truncated": false },
      "apps/**": { "label": "Workspace apps", "count": 1, "samples": ["apps/dashboard/"], "truncated": false },
      ".github/workflows/**": { "label": "GitHub Actions workflows", "count": 2, "samples": [".github/workflows/ci.yml", ".github/workflows/release.yml"], "truncated": false }
    }
  },
  "files": {
    "package.json": {
      "content": "{\"private\":true,\"workspaces\":[\"packages/*\",\"apps/*\"],\"devDependencies\":{\"typescript\":\"5.4.2\",\"eslint\":\"8.57.0\",\"turbo\":\"2.1.0\",\"changesets\":\"2.27.0\"}}",
      "truncated": false
    },
    "pnpm-workspace.yaml": {
      "content": "packages:\n  - \"packages/*\"\n  - \"apps/*\"\n",
      "truncated": false
    }
  },
  "hosting": { "github": true, "via": "remote" },
  "ciFiles": [".github/workflows/ci.yml", ".github/workflows/release.yml", ".circleci/config.yml"],
  "git": { "branch": "main", "recentCommits": [] },
  "jiraEvidence": { "keys": {}, "ambiguous": true },
  "recentPrs": []
}
```
