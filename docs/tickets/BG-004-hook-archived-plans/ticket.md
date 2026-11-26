---
id: BG-004
type: defect
title: post-tool-validate validates archived plans
created: 2026-11-26
links: [todo:post-tool-validate-non-plan-files]
---

# BG-004: post-tool-validate validates archived plans

## Observed

`plugins/sdlc-utilities/hooks/post-tool-validate.js:66` also matches archived plans (`docs/archived/plans/*.md` in this repository and in lift-fixed-price), so every Edit of an archived plan, for example when the archive banner is added, runs the validator. After BG-003 a current-format archived plan passes, but an old-format one still reports: lift-fixed-price has 22 archived plans with task headings that fail PF3, PF4, PF6, PF7 or PF12. An archived plan is a closed record that nothing executes, so the report has no use. Source: TODO note post-tool-validate-non-plan-files, third section (owner decision 2026-11-26: the hook skips archived plans).

## Expected

The hook exits 0 with no output, and does not run the validator, for a `plans/*.md` path that has a directory segment named `archive` or `archived` in its part relative to the project root (`process.cwd()`). Plans outside such a directory are validated as before (with BG-002 `--if-plan`). The validator itself does not change.

## Acceptance

- A1: `post-tool-validate.js` exits 0 with no output for `<root>/docs/archived/plans/x.md` and `<root>/plans/archive/x.md`, even when the file fails every PF check.
- A2: a segment above the project root does not count: with cwd `/x/archive/proj`, the path `/x/archive/proj/docs/plans/p.md` is still validated (exit 2 on a failing plan). A path outside the project root keeps today's behaviour.
- A3: a segment name that only contains the word does not count (`docs/plans-archived-notes/` and `archives/` are not skipped; the match is the whole segment `archive` or `archived`).
- A4: exec cases for A1 to A3 in `tests/promptfoo/datasets/post-tool-validate-exec.yaml`; the existing cases still pass.
- A5: the hook header comment lists the skip rule.

## Evidence

lift-fixed-price, 2026-11-26: 28 of 29 `docs/archived/plans/*.md` fail the validator; 22 of them have task headings and fail checks besides PF5. This repository: the archived plans are in `docs/archived/plans` (register `config.archive.dir`).

## Fix direction

A path rule in the hook, before the validator runs: take `path.relative(process.cwd(), filePath)` and skip when it does not start with `..` and one of its directory segments equals `archive` or `archived`. Rejected: reading the archive banner (the banner text is project config of the planning register, which the sdlc plugin does not own); reading `archive.dir` from a plan register (a dependency on another plugin's file). Both repositories in view use `docs/archived/plans`, which the segment rule covers.
