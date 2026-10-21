---
description: commit-sdlc --auto commits the staged change with a subject that matches commit.subjectPattern
tags: [smoke]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Agent]
---

/sdlc:commit-sdlc --auto
