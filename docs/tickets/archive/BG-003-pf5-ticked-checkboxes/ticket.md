---
id: BG-003
type: defect
title: PF5 does not count ticked acceptance checkboxes
created: 2026-11-26
links: [todo:post-tool-validate-non-plan-files]
resolution: done
closed: 2026-11-26
by: [2026-11-26-w-f3-post-tool-validate-false-reports-on#2]
---

# BG-003: PF5 does not count ticked acceptance checkboxes

## Observed

`checkPF5` in `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:367` counts only `- [ ]`. When every acceptance item of a task is ticked (`- [x]`), PF5 fails with "has no checkbox items". So every executed or archived plan fails, and the post-tool-validate hook reports it after each Edit of such a plan (for example when a plan is ticked during execution or archived). Second cause: the label match at `:363` has no line anchor, so a line that ends with `**Acceptance criteria:**` inside a Contract fence starts the block early and PF5 fails a valid task. Source: TODO note post-tool-validate-non-plan-files, second and fourth sections.

## Expected

PF5 accepts a ticked item as a checkbox, as the spec says (docs/specs/plan-sdlc.md:173: "`Acceptance criteria` present with ≥1 checkbox"). A task with no checkbox item at all still fails.

## Acceptance

- A1: PF5 counts `- [ ]`, `- [x]` and `- [X]` items in the Acceptance criteria block; the failure message is unchanged for a block with no checkbox.
- A2: exec cases in the validator dataset: a plan whose acceptance items are all `- [x]` passes PF5; a plan with an acceptance block of plain `- ` items still fails PF5.
- A3: the archived plans of this repository at f68086c (16 of 16 fail with PF5 only) pass the validator after the change (a simulation with the ticks removed passes 16 of 16); the two plans of `docs/plans` that failed PF5 and PF15 were fixed on 2026-11-26 and still pass.
- A4: the PF5 line of docs/specs/plan-sdlc.md says "unticked or ticked" (wording only; no new id).
- A5: PF5 reads the Acceptance criteria block only from a label at column 0 (`(?:^|\n)\*\*Acceptance criteria:\*\*`); an exec case where a line ends with `**Acceptance criteria:**` mid-text before the real block passes PF5 (the case of `2026-10-22-m5-w1-execute-prepare.md` Task 1 before its 2026-11-26 rewording).

## Evidence

This repository at f68086c: 16 of 16 `docs/archived/plans/*.md` fail with PF5 only, and pass when the ticks are removed. lift-fixed-price: 28 of 29 archived plans fail, PF5 in each of the 22 with task headings (the older ones also fail PF3, PF4, PF6, PF7 or PF12; they predate the current format and stay failing).

## Fix direction

Anchor the label match at column 0 (A5) and widen the count to `/- \[[ xX]\]/g`. No hook change. Old-format archived plans of other projects still fail other checks; skipping archived plans in the hook is not part of this defect (open owner question in PD-11).
