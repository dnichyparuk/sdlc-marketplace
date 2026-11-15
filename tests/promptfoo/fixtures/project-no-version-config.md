# Simulated Project Context: Project Without Version Config (Init Flow)

## Project Structure

Node.js package without versioning configured yet.

```
package.json         ← version: "0.3.1"
src/
README.md
```

## Current State

- `package.json` version: **0.3.1**
- **No `version` section in `.sdlc/config.json`** — versioning not yet initialized
- Tags exist: `v0.3.1`, `v0.2.0`, `v0.1.0`

## version-prepare.js Output (JSON) — Init Mode

```json
{
  "flow": "init",
  "detectedVersionFile": "package.json",
  "currentVersion": "0.3.1",
  "detectedTagPrefix": "v",
  "detectedTagConvention": "v{version}",
  "existingTags": ["v0.3.1", "v0.2.0", "v0.1.0"],
  "suggestedConfig": {
    "mode": "file",
    "versionFile": "package.json",
    "tagPrefix": "v",
    "changelog": false
  },
  "warnings": [],
  "errors": []
}
```
