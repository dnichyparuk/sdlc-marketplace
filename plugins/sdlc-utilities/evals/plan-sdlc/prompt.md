---
description: plan-sdlc --auto writes a full-pipeline plan that passes the --final format gate
tags: [smoke]
max_turns: 120
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

/sdlc:plan-sdlc --auto --quality full Add a notes/ folder with four files (notes/alpha.md, notes/beta.md, notes/gamma.md, notes/delta.md), each holding one heading line, and list the four files in README.md under a new "## Notes" heading. Write the plan to docs/plans/eval-plan-sdlc.md. At the Workflow Continuation menu, select done.
