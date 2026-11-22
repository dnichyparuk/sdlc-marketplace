---
id: TK-024
type: task
title: Ship guards TodoWrite and loads a deferred Monitor (F-194)
created: 2026-11-22
resolution: done
closed: 2026-11-22
by: [2026-11-22-w-e8-ship-skill-tool-handling-and-copy#1, 2026-11-22-w-e8-ship-skill-tool-handling-and-copy#3]
---

# TK-024: Ship guards TodoWrite and loads a deferred Monitor (F-194)

## Why

plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:269-270 call TodoWrite with no availability guard. SKILL.md:274 says when Monitor is available, but Monitor and TaskStop are deferred tools in current sessions, so the wave-watch never starts.

## What

SKILL.md:269-270 call TodoWrite when available, else skip it and still print the marker. SKILL.md:274 loads Monitor and TaskStop with ToolSearch `select:Monitor,TaskStop` when they are listed as deferred, then starts the wave-watch. One clause in R-todowrite-visibility (docs/specs/ship-sdlc.md, with its site byte copy and the R71(d) companions) says that with no TodoWrite tool the marker is still printed and no todo is emitted.

## Acceptance

- A1: SKILL.md:269-270 guard TodoWrite and still print the marker when it is missing.
- A2: SKILL.md:274 loads Monitor and TaskStop through ToolSearch when they are deferred, then starts the wave-watch.
- A3: R-todowrite-visibility carries the clause, with its site byte copy and the R71(d) companions updated; exec text-probe cases cover A1 and A2.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
