---
id: BG-003
type: defect
title: PF5 does not count ticked acceptance checkboxes
created: 2026-11-26
links: [todo:post-tool-validate-non-plan-files]
---

# BG-003: PF5 does not count ticked acceptance checkboxes

## Observed

`checkPF5` in `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:367` counts only `- [ ]`. When every acceptance item of a task is ticked (`- [x]`), PF5 fails with "has no checkbox items". So every executed or archived plan fails, and the post-tool-validate hook reports it after each Edit of such a plan (for example when a plan is ticked during execution or archived). Source: TODO note post-tool-validate-non-plan-files, second section.

## Expected

PF5 accepts a ticked item as a checkbox, as the spec says (docs/specs/plan-sdlc.md:173: "`Acceptance criteria` present with ≥1 checkbox"). A task with no checkbox item at all still fails.

## Acceptance

- A1: PF5 counts `- [ ]`, `- [x]` and `- [X]` items in the Acceptance criteria block; the failure message is unchanged for a block with no checkbox.
- A2: exec cases in the validator dataset: a plan whose acceptance items are all `- [x]` passes PF5; a plan with an acceptance block of plain `- ` items still fails PF5.
- A3: the archived plans of this repository at f68086c (16 of 16 fail with PF5 only) pass the validator after the change (a simulation with the ticks removed passes 16 of 16); `docs/plans/2026-10-22-m5-w1-execute-prepare.md` (Task 1 has no checkbox, PF5) and `docs/plans/m9-wRb1-ship-chain-part2.md` (PF15) still fail: real findings, out of scope.
- A4: the PF5 line of docs/specs/plan-sdlc.md says "unticked or ticked" (wording only; no new id).

## Evidence

This repository at f68086c: 16 of 16 `docs/archived/plans/*.md` fail with PF5 only, and pass when the ticks are removed. lift-fixed-price: 28 of 29 archived plans fail, PF5 in each of the 22 with task headings (the older ones also fail PF3, PF4, PF6, PF7 or PF12; they predate the current format and stay failing).

## Fix direction

Widen the count to `/- \[[ xX]\]/g`. No hook change. Old-format archived plans of other projects still fail other checks; skipping archived plans in the hook is not part of this defect (open owner question in PD-11).
