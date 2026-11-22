---
id: TK-030
type: task
title: plan-critique lane name constant
created: 2026-11-22
resolution: done
closed: 2026-11-22
by: [2026-11-22-w-f1-pr-sdlc-explicit-gh-refs-and#4]
---

# TK-030: plan-critique lane name constant

## Why

plugins/sdlc-utilities/scripts/lib/plan-critique.js:238 inlines 'guardrail-compliance' in a predicate; the same literal appears at :11, :155, :156, :687, :708, :717 and :734. Source: deferred review low of lean-w51 (PR #144).

## What

Introduce a named constant (e.g. ANY_ISSUE_RERUN_LANES = new Set(['guardrail-compliance'])) and use it in the predicate at :238. No behaviour change, no spec change.

## Acceptance

- A1: plan-critique.js defines a named constant for the any-issue rerun lanes and the predicate at :238 uses it.
- A2: behaviour is unchanged: the existing plan-diff: and plan-merge: rerun exec cases pass.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
