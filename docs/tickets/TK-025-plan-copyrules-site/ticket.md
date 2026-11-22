---
id: TK-025
type: task
title: Plan copy rules require the site byte copies (F-179)
created: 2026-11-22
---

# TK-025: Plan copy rules require the site byte copies (F-179)

## Why

`.sdlc/config.json` plan.copyRules does not require the site byte copies of docs/*.md, docs/specs/*.md and docs/skills/*.md, so a plan that forgets one is caught only by the PR byte compare (F-179).

## What

Add three plan.copyRules entries: docs/{doc}.md -> site/src/content-source/{doc}.md; docs/specs/{s}.md -> site/src/content-source/specs/{s}.md; docs/skills/{s}.md -> site/src/content-source/skills/{s}.md (captures match one path segment, plan-parse.js:332). Cite R71(d); no spec change.

## Acceptance

- A1: `validateCopyRules` reports no error on the config.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
