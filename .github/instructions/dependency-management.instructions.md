---
applyTo: "site/package.json,site/pnpm-lock.yaml"
---
# dependency-management — Review Instructions

Reviews dependency changes in site/package.json and pnpm lockfile for version pinning, lockfile consistency, and unintended bumps

Default severity: medium

## Checklist

- Lockfile (`pnpm-lock.yaml`) is updated consistently with `package.json` changes — no divergence
- New dependencies use a narrow version range (`^` or `~`), not `*` or `latest`
- Major version bumps are intentional — check if Astro or Tailwind CSS migration notes apply
- Dev dependencies are not in the production `dependencies` list
- No duplicate packages solving the same problem added alongside existing deps
- `pnpm.onlyBuiltDependencies` allowlist is updated if a new native dependency is added (currently: esbuild, sharp)
- Transitive dependency changes in lockfile are reviewed for unexpected major bumps
- New dependencies are compatible with the project's license (MIT)
- Astro plugin dependencies (`@astrojs/*`) are version-compatible with the installed Astro version

## Severity Guide

| Finding | Severity |
|---------|----------|
| Lockfile diverges from package.json | high |
| Package with known critical CVE added | critical |
| Unintended major version bump in lockfile | medium |
| `*` or `latest` version specifier | medium |
| Dev dependency in production list | medium |
| Duplicate dependency solving same problem | low |
| Missing `onlyBuiltDependencies` entry for native dep | low |

## Note

In Claude Code reviews, files matching these patterns are excluded: **/node_modules/**.
Copilot path-specific instructions do not support exclusion patterns — use judgment when findings apply to these files.
