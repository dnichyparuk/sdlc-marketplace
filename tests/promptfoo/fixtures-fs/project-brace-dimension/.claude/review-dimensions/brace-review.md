---
name: brace-review
description: "A test dimension with a supported and an unbalanced brace trigger"
triggers:
  - "src/*.{js,ts}"
  - "a/{b,c"
severity: medium
---

# Brace Review Test

This dimension has one valid brace trigger and one unbalanced brace trigger to raise a D5 warning.
