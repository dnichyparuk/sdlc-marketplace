---
id: BG-001
type: defect
title: sentinel script has an empty if-branch
created: 2026-11-25
links: [todo:pr-gh-refs-review-lows]
resolution: done
closed: 2026-11-25
by: [2026-11-25-w-f2-pr-gh-refs-review-lows-cleanup#1]
---

# BG-001: sentinel script has an empty if-branch

## Observed

tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js lines 12-13 hold an empty if-branch: `if (args.length === 0) { // default file }`. It adds control flow and no behaviour. Source: TODO note pr-gh-refs-review-lows (the note cites line 42, which is stale; re-verified at a3d713b).

## Expected

The argument handling has no empty branch and behaves as before: no arguments use the default file, `--file <path>` uses that path, anything else exits 2.

## Acceptance

- A1: the argument handling of check-pr-gh-ref-sentinels.js has no empty branch.
- A2: the exec cases `pr-gh-refs:` in tests/promptfoo/datasets/pr-prepare-exec.yaml still pass 2 of 2, unchanged.

## Evidence

none

## Fix direction

Test `args.length === 2 && args[0] === '--file'` for the file option, else exit 2 when `args.length !== 0`. No behaviour change. The note's second item (usage error exits 2, not 1) is not in scope: exit 2 is a documented convention (W-E3 plan, lines 78 and 98; rule F-151).
