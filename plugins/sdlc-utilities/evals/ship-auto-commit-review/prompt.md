---
description: ship-sdlc --auto runs execute, commit and review to the end and cleans up its ledger
tags: [smoke, ship]
max_turns: 100
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

/sdlc:ship-sdlc --auto --plan docs/plans/eval-plan.md --steps execute,commit,review --rebase skip --quality minimal
