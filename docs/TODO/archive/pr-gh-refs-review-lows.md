# Deferred LOW review findings of PR #153 (W-F1, lean-w55)

Status: Promoted (BG-001, TK-032). The usage-error item (exit 2, not 1) is not promoted: exit 2 for usage errors is a documented convention (W-E3 plan docs/archived/plans/2026-11-21-w-e3-test-tooling-hygiene.md:78,98; plan-brief rule F-151).

Plugin and test defects (lean-w55, unit W-F1, PR #153, merge 3edc184). Three LOW findings of the review were deferred. None blocks the merged change.

## Empty if-branch in the sentinel script (tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js:42)

`if (args.length === 0) { // default file }` is an empty branch that only expresses intent. It adds control flow and no behaviour. Restructure it as a positive condition, for example `if (args.length === 2 && args[0] === '--file') { ... }`, and let the default case fall through.

## Usage error exits 2, not 1 (tests/promptfoo/scripts/check-pr-gh-ref-sentinels.js:47)

The review convention says exit 1 is a user error and exit 2 is a script error. An unknown flag or a missing `--file` value is a user error, but the script exits 2. The plan records exit 2 for usage errors, and sibling scripts such as `openspec-step.js` do the same. Decide the convention first, then change the script, its exec cases and the plan acceptance together, or document exit 2 as the rule.

## Update-mode quoting rule names baseBranch, but the edit command has no such placeholder (plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:531)

The update-mode instruction says to substitute `baseBranch` as a single-quoted literal. The only command in that block, `gh pr edit '<currentBranch>' ...` at line 534, has no `baseBranch` placeholder. Remove `baseBranch` from the rule in update mode, or add the placeholder to the command if the base must be named there.
