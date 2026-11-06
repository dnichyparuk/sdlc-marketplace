---
name: unknown-model-review
description: "A test dimension with a non-Claude model id to trigger a D13 error"
severity: medium
model: gpt-4
triggers:
  - "**/*.ts"
---

# Unknown Model Test

This dimension declares `model: gpt-4` in its frontmatter. The validator must
emit a D13 error because the value is neither a Claude alias nor a claude-* id.
