---
name: bad-effort-dimension
description: "Dimension with an invalid effort field to trigger D14"
effort: turbo
triggers: ["**/*.ts"]
---

# Bad Effort Test

This dimension declares `effort: turbo`, which is not a valid effort value.
The validator must emit a D14 warning.
