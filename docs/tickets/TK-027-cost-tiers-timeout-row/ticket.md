---
id: TK-027
type: task
title: Cost tiers wave wait table gets the 60 s timeout row (F-198)
created: 2026-11-22
links: [todo:cost-tiers-wave-wait-60s-timeout-row]
---

# TK-027: Cost tiers wave wait table gets the 60 s timeout row (F-198)

## Why

The table "execute-plan-sdlc wave wait tuning" in docs/cost-tiers.md (lines ~143-153) has no row for the --timeout of at most 60 that plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:390 and wave-runner-template.md:104 pass once some workers have returned. R92 of docs/specs/execute-plan-sdlc.md says these values live there. Source: TODO note cost-tiers-wave-wait-60s-timeout-row (F-198).

## What

Add a row to the table: --timeout passed by the skill after a worker returned, at most 60 s, defined in skills/execute-plan-sdlc/SKILL.md and wave-runner-template.md. Copy docs/cost-tiers.md to site/src/content-source/cost-tiers.md with cp.

## Acceptance

- A1: the wave wait tuning table in docs/cost-tiers.md has the row for the 60 s --timeout after a worker returned.
- A2: site/src/content-source/cost-tiers.md is a byte copy of docs/cost-tiers.md.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
