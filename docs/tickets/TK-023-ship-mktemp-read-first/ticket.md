---
id: TK-023
type: task
title: Ship reads the empty mktemp file before Write (F-193)
created: 2026-11-22
---

# TK-023: Ship reads the empty mktemp file before Write (F-193)

## Why

plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:278 says to run mktemp and then write with the Write tool. The Write tool refuses an existing file that has not been read (measured: 4 refusals and 9 extra Reads in one ship run, about 13 extra tool calls). Sibling skills read the empty file once first: pr-sdlc SKILL.md:456, jira-sdlc:256, setup-sdlc:424.

## What

SKILL.md:278 reads the empty file once, then writes.

## Acceptance

- A1: the instruction at SKILL.md:278 names the Read before the Write.
- A2: an exec text-probe case counts the sentence (spec docs/specs/ship-sdlc.md P-STEP-2, no spec text change).

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
