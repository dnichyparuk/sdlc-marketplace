# post-tool-validate reports false PF failures on files that are not executable plans

Status: Promoted (BG-002, BG-003). The `plan.validateIgnore` glob list of the proposal is not promoted: the task-heading test removes every false report measured, with no new config key (decision PD-11).

Plugin defect (finding F-5 of the lift-fixed-price lean ledger, wave lean-w2, 2026-11-26; owner request 2026-11-26 "create tickets and put them into the plan"). Re-verified at f68086c in this repository and in lift-fixed-price.

## Every Markdown file under a `plans/` directory is validated as a plan

`plugins/sdlc-utilities/hooks/post-tool-validate.js:66` matches `PLAN_RE = /[/\\]plans[/\\][^/\\]+\.md$/`. Every Edit or Write of such a file runs `validate-plan-format.js`; on failure the hook exits 2 and Claude gets the report as feedback. The edit is applied, but the report is noise: a programme README, a decision log, a brief or the plan guidelines has no `### Task N:` heading, so PF1, PF2 and PF6 always fail (PF2: "No tasks found").

Evidence (validator run on each file, exit 1 = fail):

- this repository: `docs/plans/README.md`, `decisions.md`, `programme.md`, `PLAN_GUIDELINES.md` fail; none of them has a `### Task N:` heading.
- lift-fixed-price: 8 of the 9 `docs/plans/*.md` fail; the only pass is the one executable plan. The 8 failures have no `### Task N:` heading, but 3 of them (`2026-10-12-pg1-brief.md`, `2026-11-26-w5-brief.md`, `PLAN_GUIDELINES.md`) do have a `**Goal:**` line, so a `**Goal:**` test alone would not remove the noise.
- the finding reports about 8 repeated false reports in one wave, after each Edit of the programme README.

## Executed and archived plans fail PF5 because ticked checkboxes do not count

`validate-plan-format.js:367` (`checkPF5`) counts only `- [ ]`. A task whose acceptance items are all ticked (`- [x]`) fails with "has no checkbox items". The spec (docs/specs/plan-sdlc.md:173, PF5) asks for "≥1 checkbox", and a ticked item is a checkbox.

Evidence: this repository, 16 of 16 `docs/archived/plans/*.md` fail with PF5 only; a simulation with the ticks removed passes all 16. The two task-heading files of `docs/plans` that fail are real findings, not in scope: `2026-10-22-m5-w1-execute-prepare.md` (Task 1 has no checkbox at all, PF5) and `m9-wRb1-ship-chain-part2.md` (PF15). lift-fixed-price: 28 of 29 archived plans fail, 22 of them have task headings and PF5 is in every one (older plans also fail PF3, PF4, PF6, PF7, PF12; they predate the current format). Every Edit of a plan after its tasks are ticked, or of an archived plan, gives a false report.

## Proposal in the finding

Exit 0 unless the file has the plan header (`**Goal:**`) or a `### Task N:` heading, or add a `plan.validateIgnore` glob list to the project config.
