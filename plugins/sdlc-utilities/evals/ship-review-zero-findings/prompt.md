---
description: "#9129 - a ship run whose review finds nothing at or above high leaves a fresh review summary with zero such findings, so the gate skips received-review (inferred, not observed)"
tags: [smoke, ship]
max_turns: 100
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

/sdlc:ship-sdlc --auto --plan docs/plans/eval-plan.md --steps execute,commit,review --rebase skip --quality minimal
