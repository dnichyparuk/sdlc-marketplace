---
description: execute-plan-sdlc runs a two-task plan to completion and cleans up its state
tags: [smoke]
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

/sdlc:execute-plan-sdlc docs/plans/eval-plan.md --auto --quality minimal --rebase skip
