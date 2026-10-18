---
name: commit-sdlc
description: "Fixture skill that breaks the prepare-script contract."
user-invocable: true
---

# Commit (fixture)

```bash
MANIFEST_FILE=$(mktemp)
node "<PLUGIN_ROOT>/scripts/skill/commit.js" > "$MANIFEST_FILE"
trap 'rm -f "$MANIFEST_FILE"' EXIT INT TERM
```

Read and parse `MANIFEST_FILE`.
