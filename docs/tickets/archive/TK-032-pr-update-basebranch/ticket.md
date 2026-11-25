---
id: TK-032
type: task
title: pr-sdlc update mode drops baseBranch from quoting rule
created: 2026-11-25
resolution: done
closed: 2026-11-25
by: [2026-11-25-w-f2-pr-gh-refs-review-lows-cleanup#2]
---

# TK-032: pr-sdlc update mode drops baseBranch from quoting rule

## Why

plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:531 (update mode) says to substitute `baseBranch` as a single-quoted literal, but the only command there, `gh pr edit '<currentBranch>' ...` (:534), has no `<baseBranch>` placeholder. Source: TODO note pr-gh-refs-review-lows, third finding.

## What

Remove `baseBranch` from that sentence only. No test asserts it; byte copies and docs change only if a grep shows the sentence elsewhere.

## Acceptance

- A1: the update-mode sentence at SKILL.md:531 no longer names `baseBranch`.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
