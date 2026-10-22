---
description: review-sdlc --dry-run prints its plan and writes nothing outside .sdlc/
tags: [smoke]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

/sdlc:review-sdlc --dry-run --staged
