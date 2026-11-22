---
id: TK-026
type: task
title: Ship doc words the deferred Monitor rule like the spec (F-196)
created: 2026-11-22
links: [todo:ship-doc-deferred-monitor-wording]
resolution: done
closed: 2026-11-22
by: [2026-11-22-w-e9-audit-follow-up-doc-fixes#2]
---

# TK-026: Ship doc words the deferred Monitor rule like the spec (F-196)

## Why

docs/skills/ship-sdlc.md:229 says "When Monitor is a deferred tool, ship first loads Monitor and TaskStop". The spec (docs/specs/ship-sdlc.md:408, R92) and ship-sdlc SKILL.md:276 say "When `Monitor` or `TaskStop` is listed as a deferred tool". The conditions differ when only one of the tools is deferred. Source: TODO note ship-doc-deferred-monitor-wording (F-196).

## What

Reword docs/skills/ship-sdlc.md:229 to "When Monitor or TaskStop is a deferred tool" and copy it to site/src/content-source/skills/ship-sdlc.md with cp in the same commit.

## Acceptance

- A1: docs/skills/ship-sdlc.md:229 states the condition as Monitor or TaskStop being a deferred tool.
- A2: site/src/content-source/skills/ship-sdlc.md is a byte copy of docs/skills/ship-sdlc.md.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
