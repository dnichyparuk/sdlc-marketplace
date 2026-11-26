---
id: BG-002
type: defect
title: post-tool-validate validates non-plan files under plans/
created: 2026-11-26
links: [todo:post-tool-validate-non-plan-files]
resolution: done
closed: 2026-11-26
by: [2026-11-26-w-f3-post-tool-validate-false-reports-on#1]
---

# BG-002: post-tool-validate validates non-plan files under plans/

## Observed

`plugins/sdlc-utilities/hooks/post-tool-validate.js:66` (`PLAN_RE = /[/\\]plans[/\\][^/\\]+\.md$/`) sends every Markdown file directly under a `plans/` directory to `validate-plan-format.js`. A programme README, a decision log, a brief or the plan guidelines has no `### Task N:` heading, so PF1, PF2 ("No tasks found") and PF6 fail, and the hook exits 2 after each Edit or Write. The edit is applied; the report is noise. Repro: edit `docs/plans/README.md` in this repository. Source: TODO note post-tool-validate-non-plan-files (finding F-5 of lift-fixed-price, 2026-11-26).

## Expected

The hook validates only files that hold a task heading. A file under `plans/` that neither task parser of `lib/plan-parse.js` sees a `### Task N:` heading in exits 0 with no output. A file with a task heading is validated as today, so a plan with a missing header field or a hidden (fenced) task still exits 2. The validator without the new flag behaves as today, so the plan-sdlc Step 6.6 gate still fails a plan with no tasks (PF2).

## Acceptance

- A1: `validate-plan-format.js` takes a flag `--if-plan`; with it, a file in which `extractTasks` and `extractTasksRaw` both find no task exits 0 with no output; any other file is checked as without the flag.
- A2: `post-tool-validate.js` passes `--if-plan` for a `plans/*.md` path; the dimension and PR-template paths are unchanged.
- A3: new exec cases in `tests/promptfoo/datasets/post-tool-validate-exec.yaml` (config `promptfooconfig-exec-hooks.yaml`): a `plans/README.md` fixture with no task heading exits 0; a `plans/` file whose only `### Task 1:` line is inside a code fence exits 0; a plan with tasks but no `**Goal:**` exits 2 with PF1 in stderr. The existing case still passes.
- A4: a validator exec case shows that without `--if-plan` a file with no task still fails PF2 (exit 1).
- A5: the flag is documented in the validator usage text, the hook header comment and the CI validation contract of docs/specs/plan-sdlc.md (one sentence; no PF id changes).
- A6: re-run evidence: `docs/plans/README.md`, `decisions.md`, `programme.md` and `PLAN_GUIDELINES.md` of this repository give exit 0 through the hook.

## Evidence

This repository at f68086c: the 4 non-plan files of `docs/plans` fail through the hook (exit 2); none has a `### Task N:` heading. lift-fixed-price: 8 of 9 `docs/plans/*.md` fail; the only pass is the executable plan; 3 of the failures (two briefs and `PLAN_GUIDELINES.md`) carry a `**Goal:**` line, so a `**Goal:**` test would leave them noisy.

## Fix direction

Gate on the task heading, not on `**Goal:**` and not on a config glob list (decision PD-11). The test lives in the validator, behind `--if-plan`, so it uses the same fence-aware parsers as PF2 and PF15 and the hook stays a thin path matcher. Skip only when both parsers see no task, so a plan whose tasks only one parser sees still reaches PF15. A `plan.validateIgnore` glob list is not added: the heading test removes every false report measured with no new config key; it stays an option if a file with task headings must be skipped.
