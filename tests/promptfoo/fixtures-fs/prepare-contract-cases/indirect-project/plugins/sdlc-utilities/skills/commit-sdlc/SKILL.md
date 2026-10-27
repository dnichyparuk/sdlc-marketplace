---
name: commit-sdlc
description: "Fixture skill that honours the prepare-script contract."
user-invocable: true
---

# Commit (fixture)

```bash
SCRIPT="<PLUGIN_ROOT>/scripts/skill/commit.js"
MANIFEST_FILE=$(node "$SCRIPT" --output-file $ARGUMENTS)
EXIT_CODE=$?
echo "MANIFEST_FILE=$MANIFEST_FILE"
echo "EXIT_CODE=$EXIT_CODE"
```

Read and parse `MANIFEST_FILE`. On non-zero `EXIT_CODE`, show the error and stop.
