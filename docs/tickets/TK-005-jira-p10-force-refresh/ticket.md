---
id: TK-005
type: task
title: Jira P10 forceRefresh false without the flag (#9440)
created: 2026-11-19
---

# TK-005: Jira P10 forceRefresh false without the flag (#9440)

## Why

#9440 [type:defect] low: jira P10 forceRefresh false (no flag) untested (jira-sdlc-exec.yaml:314) | src: audit #102

## What

Cover jira P10: forceRefresh is false when the flag is absent.

## Acceptance

- A1: an exec case in jira-sdlc-exec.yaml asserts forceRefresh false when no flag is passed.
- A2: the case fails when forceRefresh turns true without the flag.

## Notes

Moved from .sdlc/orchestration/todos.md (#9440) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
