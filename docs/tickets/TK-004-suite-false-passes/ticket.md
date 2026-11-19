---
id: TK-004
type: task
title: Suite false passes (#9424)
created: 2026-11-19
---

# TK-004: Suite false passes (#9424)

## Why

#9424 [suite-B] false passes (audit W2, 10 tasks; ledger F-121): plan-format-exec ~:19, pr-prepare :119/:250/:271, sdlc-dimensions :220, config-resolve :39/:72, harvest :431, review :82 + received-review :49/:61 version regex, state-gc :290/:311, jira :361/:224, compact :64, ship-prepare :399/:456 delete + :1634 | src: audit (touches plan-format-exec: after w30)

## What

Make each exec case named in the todo fail when the behaviour it covers breaks.

## Acceptance

- A1: each listed case fails when the behaviour it covers is broken on purpose.
- A2: the exec suite passes on the fixed code.

## Notes

Moved from .sdlc/orchestration/todos.md (#9424) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
