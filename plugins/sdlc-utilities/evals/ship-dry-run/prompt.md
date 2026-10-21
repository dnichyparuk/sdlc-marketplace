---
description: ship-sdlc --dry-run lists the pipeline and makes no commit, tag or ledger
tags: [smoke, ship]
max_turns: 25
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite]
---

/sdlc:ship-sdlc --dry-run --plan docs/plans/eval-plan.md --steps execute,commit,review --rebase skip --quality minimal
