# W-F3 post-tool-validate False Reports Implementation Plan

**Commit:** `fix(W-F3): plan-sdlc - quiet post-tool-validate on non-plan files`
**Goal:** Stop the post-tool-validate hook from reporting false plan-format failures: skip files under `plans/` that hold no task heading (BG-002), count ticked acceptance checkboxes in PF5 and read its label only at column 0 (BG-003), and skip plans under an `archive` or `archived` directory below the project root (BG-004).
**Architecture:** `validate-plan-format.js` gets a `--if-plan` flag (exit 0, no output, when neither task parser sees a task) and a fixed PF5 regex. `hooks/post-tool-validate.js` passes `--if-plan` for a `plans/*.md` path and exits 0 before the validator for a path with an archive segment below `process.cwd()`. Tests are exec-only: new cases of the wrapper `run-plan-format-case.js` in the validator dataset and a new hook wrapper `run-post-tool-validate-plans.js` in the hook dataset.
**Source:** docs/plans/programme.md#W-F3
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-format` and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern post-tool-validate`

---

## Context

**What problem does this change solve?**

- The post-tool-validate hook is a PostToolUse hook: it runs after each Edit or Write and checks the edited file.
- It treats every Markdown file directly under a `plans/` directory as a plan. A README, a decision log or a guideline file has no task, so the validator reports PF1, PF2 and PF6 and the hook exits 2 after every edit. The edit is applied; the report is noise (BG-002).
- PF5 counts only unticked checkboxes (`- [ ]`). An executed plan has ticked items (`- [x]`), so every executed or archived plan fails PF5. A line that ends with the text `**Acceptance criteria:**` before the real label also starts the block too early (BG-003).
- Archived plans are closed records. Old-format ones still fail other checks, so each edit of an archived plan (for example adding the archive banner) gives a report that nobody can use (BG-004).

**What prompted this change now?**

- Finding F-5 of the lift-fixed-price lean ledger, recorded in the TODO note `docs/TODO/archive/post-tool-validate-non-plan-files.md`, promoted to tickets BG-002, BG-003 and BG-004.
- The owner scheduled them as the light wave W-F3 (decision PD-11, `docs/plans/decisions.md:76`).

**What does success look like?**

- An edit of `docs/plans/README.md`, `decisions.md`, `programme.md` or `PLAN_GUIDELINES.md` gives exit 0 through the hook.
- A real plan with a missing header field still gives exit 2 with the finding.
- All 16 archived plans of `docs/archived/plans` pass the validator.
- The validator without `--if-plan` behaves as today, so the plan-sdlc Step 6.6 gate still fails a plan with no tasks (PF2).

**Who is hit if this ships wrong?**

- Plan authors and ship workers: a hook that skips too much hides a real plan-format error until the plan-sdlc Step 6.6 gate or execute reads the plan.
- Every plugin user: a PF5 regex that is too loose lets a task with no real checkbox through the Step 6.6 gate.

**Non-goals**

- No change to `PLAN_RE`: a file below a subdirectory of `plans/` stays unmatched, as today.
- No change to the dimension and PR-template paths of the hook.
- No change to any PF id, to R69, or to the register, ticket and TODO files.

## Research Findings

All three items were re-verified at HEAD `ff121f9`, the base this wave ships on, so line numbers are exact.

- **BG-002 reproduces.** `plugins/sdlc-utilities/hooks/post-tool-validate.js:66` is `const PLAN_RE = /[/\\]plans[/\\][^/\\]+\.md$/;` and `:98-99` run the validator with `--project-root <cwd> --markdown --file <path>`. Measured: the hook exits 2 for each of `docs/plans/README.md`, `decisions.md`, `programme.md` and `PLAN_GUIDELINES.md` (the validator alone exits 1 for each).
- **The two task parsers.** `plugins/sdlc-utilities/scripts/lib/plan-parse.js:43` `extractTasks` strips column-0 fences, then matches `^### Task (\d+):`; `:215` `extractTasksRaw` walks lines and skips every fence. Both are already imported by the validator (`validate-plan-format.js:46`), and PF15 (`:401`) compares them.
- **BG-003 reproduces.** `validate-plan-format.js:363` is `task.body.match(/\*\*Acceptance criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n### |\n---|\n## |$)/)` (no line anchor) and `:367` counts only `/- \[ \]/g`. Measured on base with variants of `tests/promptfoo/fixtures-fs/project-valid-plan/plans/test-plan.md`: all items ticked → PF5 fail; a prose line ending with `**Acceptance criteria:**` before the real label → PF5 fail for that task; plain `- ` items → PF5 fail (stays a fail: a declared pin). All 16 files of `docs/archived/plans` fail with PF5 only (loop over the validator `--json`, failed ids counted).
- **BG-004 reproduces.** `docs/archived/plans/<name>.md` matches `PLAN_RE`, so its edit runs the validator. `plans/archive/x.md` does not match `PLAN_RE` (the file name must follow `plans/` directly), so that path already exits 0; the new case pins it.
- **Existing test that the change breaks.** `tests/promptfoo/scripts/run-post-tool-validate-argv.js:58` writes `# not a plan\n` into `plans/<name>.md` and its case (`tests/promptfoo/datasets/post-tool-validate-argv-exec.yaml:5`) asserts `exitCode === 2` and non-empty findings. With `--if-plan` that file has no task and exits 0, so the wrapper must write a file with a task heading. Grep for other hook runs: `git grep -ln "post-tool-validate" -- tests plugins` gives only that wrapper, `post-tool-validate-exec.yaml`, the two configs, `hooks.json` (and a fixture copy of it) and the baseline.
- **Test harness.** `tests/promptfoo/scripts/extract-skill-content.js` substitutes `{{project_root}}` in `script_args`, `script_cwd`, `script_home` and `script_env`, not in `script_stdin`, so a hook case cannot name a path inside its fixture copy. A wrapper script that builds its own temp project (the pattern of `run-post-tool-validate-argv.js` and `run-plan-format-case.js`) avoids a change to that shared helper.
- **Counts and floors.** `git grep -c "description:" tests/promptfoo/datasets/plan-format-exec.yaml` gives 45 and `tests/promptfoo/datasets/post-tool-validate-exec.yaml` gives 1. The only check over these files is `tests/promptfoo/scripts/check-spec-id-coverage.js` with its baseline `tests/promptfoo/baselines/spec-id-coverage.json` (entries at `:372` and `:454`); it fails only on a drop, and this wave only adds cases and asserts, so no baseline refresh is needed. No test counts the cases of either dataset (`git grep -n "post-tool-validate-exec\|plan-format-exec" -- tests/promptfoo/scripts` gives only the header comment of `run-plan-format-case.js`).
- **Spec.** `docs/specs/plan-sdlc.md:165-183` is the CI validation contract; `:173` is the PF5 line. The site copy `site/src/content-source/specs/plan-sdlc.md` is byte-identical (`cmp` exit 0). Fragment grep for the PF5 sentence (`git grep -n -e "≥1 checkbox" -e "Task body valid" -e "present with ≥1"`) hits only the spec; no test stores it. The hook has no spec requirement of its own (`git grep -ln post-tool-validate -- docs/specs` gives only pr-sdlc and ship-sdlc, which name the PR-template path).
- **Validator stderr.** The validator prints `[sdlc:config] read …` on stderr when it reads the config. "No output" in this plan means an empty stdout; the hook prints the validator output only on a non-zero exit.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Hook test cases through a wrapper script | no | adds `tests/promptfoo/scripts/run-post-tool-validate-plans.js` instead of fixture directories | The harness does not substitute `{{project_root}}` in `script_stdin`; a wrapper keeps the shared helper unchanged and matches the existing argv wrapper. |
| Validator PF5 and `--if-plan` cases through `run-plan-format-case.js` | no | adds named cases to the existing wrapper instead of new fixture directories | The wrapper already derives plan variants from `project-valid-plan`; this keeps the file count low. |
| Spec sentence names the hook skip rule too | no | one sentence in the CI validation contract covers `--if-plan` and the archive skip | BG-004 asks only for the hook header comment; the spec-first rule asks that the behaviour be written in the spec. No new id. |
| R69 flag list | no | not changed | R69 lists the flags the usage text must name at least; `--if-plan` is added to the usage text, and BG-002 A5 asks for one sentence only. |
| `run-post-tool-validate-argv.js` edit | no | writes a plan with a task heading instead of `# not a plan` | Needed so the existing argv case still sees exit 2 after BG-002; not named by the tickets. |
| Task 1 holds 7 files and stays Standard | no | keeps the validator flag, the hook call and their tests in one task | Splitting would leave a wave where the hook passes a flag the validator ignores, and would add an execute wave; three of the files are small test wrappers. |
| Case-sensitive archive segment | no | matches `archive` and `archived` exactly | The ticket names those two words; `Archive` is an accepted gap (Task 3 design notes). |

## Key Decisions

- **The flag sits in the validator, the choice in the hook.** The validator decides whether a file holds a task, because it already has both task parsers. The hook decides when to ask (`--if-plan` only for `plans/*.md`). The alternative, a task-heading regex in the hook, would be a third parser that can drift from the other two.

- **Skip only when both parsers see no task.** A file where one parser sees a task is a plan with a hidden task. It must still fail PF15, so the skip needs agreement on "no task".

- **Archive skip in the hook only.** The validator stays the same for archived plans, so a person who runs it by hand still gets the full report. The hook skips because nobody executes an archived plan.

- **Segments count only below the project root.** The hook uses `path.relative(process.cwd(), file)`. A checkout under a directory named `archive` must still be validated. A path outside the root keeps today's behaviour, because the hook cannot tell what is archived there.

- **Order: BG-002 first.** Task 1 changes both the validator and the hook. Task 2 (validator) and Task 3 (hook) then run in parallel, each with its own file. Task 4 (spec) is independent. That gives two execute waves.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): `validate-plan-format.js --if-plan` — after the file and template checks, when `extractTasks(content)` and `extractTasksRaw(content)` both return `[]`, exit 0 with empty stdout; otherwise run every check as without the flag.
- names: `--if-plan`, `ifPlan`.
- mirror: the `--final` boolean flag at `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:92-93`.
- decisions: the flag never changes a check result; it only skips a file with no task.
- sync: `plugins/sdlc-utilities/hooks/post-tool-validate.js` passes it.
- example: `node validate-plan-format.js --file docs/plans/README.md --if-plan` → exit 0, empty stdout.
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY the PF5 line of `docs/specs/plan-sdlc.md` (CI validation contract) to say the checkbox is unticked or ticked and the label starts a line; ADD one sentence after the PF15 line for `--if-plan` and the hook skip rule; no new id.
- names: `PF5`, `--if-plan`.
- mirror: the PF lines at `docs/specs/plan-sdlc.md:168-182`.
- decisions: wording only; no PF id added or renumbered.
- sync: `site/src/content-source/specs/plan-sdlc.md` is a byte copy (`cp`).
```

## Tasks

### Task 1: Add --if-plan to the validator and pass it from the hook
**Ticket:** BG-002 @2d35d531

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — add `--if-plan` (parse, usage text, header comment, early exit)
- Modify: `plugins/sdlc-utilities/hooks/post-tool-validate.js` — pass `--if-plan` for a plan path; header comment
- Modify: `tests/promptfoo/scripts/run-plan-format-case.js` — add cases `if-plan-no-task` and `if-plan-plan`
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — add 2 cases
- Create: `tests/promptfoo/scripts/run-post-tool-validate-plans.js` — hook wrapper with cases `readme-no-task`, `fenced-task-only`, `plan-no-goal`
- Modify: `tests/promptfoo/datasets/post-tool-validate-exec.yaml` — add 3 cases
- Modify: `tests/promptfoo/scripts/run-post-tool-validate-argv.js` — write a plan with a task heading instead of `# not a plan`

**Notes:** Seven files, but three are test wrappers and two are datasets of the same change. Splitting the validator from the hook would leave a wave where the hook passes a flag that the validator ignores. The argv wrapper must change in this task because its case would otherwise turn red (Research Findings).

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file docs/plans/README.md --if-plan` exits 0 with empty stdout; without `--if-plan` it exits 1 and the JSON shows PF2 fail (BG-002 A1, A4).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --help` names `--if-plan` (BG-002 A5, usage part).
- [ ] The hook passes `--if-plan` only on the plan path; the dimension and PR-template argument lists are unchanged (BG-002 A2).
- [ ] For each of `docs/plans/README.md`, `docs/plans/decisions.md`, `docs/plans/programme.md` and `docs/plans/PLAN_GUIDELINES.md`, the command `echo '{"tool_input":{"file_path":"'"$PWD"'/docs/plans/README.md"}}' | node plugins/sdlc-utilities/hooks/post-tool-validate.js` (file name substituted) exits 0 with empty stderr, run from the repository root (BG-002 A6).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern post-tool-validate` passes 4 of 4 (1 existing + 3 new) (BG-002 A3).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-format` passes every case (46 existing + 2 new), and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern post-tool-validate-argv` passes 1 of 1.

**Contract:**
- shape (code): validator flag table, before → after:

  | Flag | Before | After |
  |---|---|---|
  | `--if-plan` | ignored (unknown flags are skipped) | boolean; sets `ifPlan = true` |

  Validator entry point (`validate-plan-format.js:637-655`), before → after; the `--file`, file-exists and template-exists checks between these lines stay with their exit 2; nothing is written to stdout on the new exit:

  ```diff
  -    const { projectRoot, filePath, outputFormat, requireScorecard, templatePath, rootDir } = parseArgs(process.argv);
  +    const { projectRoot, filePath, outputFormat, requireScorecard, templatePath, rootDir, ifPlan } = parseArgs(process.argv);
  ...
       const content = fs.readFileSync(filePath, 'utf8');
  +    // BG-002: with --if-plan, a file in which neither task parser sees a task is not a plan.
  +    if (ifPlan && extractTasks(content).length === 0 && extractTasksRaw(content).length === 0) process.exit(0);
       const tasks   = extractTasks(content);
  ```

  `parseArgs` (`:69-102`): `let ifPlan = false;`, branch `} else if (a === '--if-plan') { ifPlan = true;`, and `ifPlan` in the returned object. Usage text (`:49-63`) and header comment (`:9-16`) gain, after the `--root` line:

  ```text
    --if-plan               Exit 0 with no output when the file has no task heading
  ```

  Hook (`post-tool-validate.js:15` and `:98-99`), before → after:

  ```diff
  - *   plans/*.md                        → validate-plan-format.js
  + *   plans/*.md                        → validate-plan-format.js --if-plan (a file with no task heading passes)
  ...
     const args = [validatorScript, '--project-root', projectRoot, '--markdown'];
  -  if (isPlan) args.push('--file', filePath);
  +  if (isPlan) args.push('--file', filePath, '--if-plan');
  ```
- names: `--if-plan`, `ifPlan`, `run-post-tool-validate-plans.js`, cases `if-plan-no-task`, `if-plan-plan`, `readme-no-task`, `fenced-task-only`, `plan-no-goal`.
- mirror: `--final` parsing at `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:92-93`; wrapper structure (repo-root walk, `--case` parsing, usage exit 2) of `tests/promptfoo/scripts/run-plan-format-case.js:43-66` and `:162-176`; hook spawn of `tests/promptfoo/scripts/run-post-tool-validate-argv.js:56-70`.
- decisions: `run-plan-format-case.js` gains a helper `runValidate(args)` returning `{ exitCode, stdout }` (spawnSync status and stdout). Case `if-plan-no-task` writes `# Notes\n\nNo task here.\n` to a temp file and prints one JSON line `{ withFlag: { exitCode, stdout }, withoutFlag: { exitCode, pf2 } }` where `pf2` is the PF2 status from the JSON report. Case `if-plan-plan` writes `plans/test-plan.md` of the cwd fixture with its `**Goal:**` line removed to a temp file and prints the validator JSON stdout of `--if-plan --json`. New wrapper `run-post-tool-validate-plans.js --case <name>`: makes a temp dir with `fs.realpathSync(fs.mkdtempSync(...))`, writes the case files, writes a payload file `{ tool_name: 'Write', tool_input: { file_path: <absolute path> } }`, runs `node <hook>` with that cwd and the payload file as stdin fd (as the argv wrapper does), prints one JSON line `{ exitCode, stdout, stderr }`, removes the temp dir. Usage errors (no `--case`, `--case` without a value, an unknown case, an unknown argument): message on stderr, exit 2, nothing on stdout (F-151). Case files: `readme-no-task` → `docs/plans/README.md` = `# Plans\n\nIndex.\n`; `fenced-task-only` → `docs/plans/notes.md` with `### Task 1: x` only inside a column-0 triple-backtick fence; `plan-no-goal` → `docs/plans/p.md` with a `### Task 1:` heading and no `**Goal:**`. Argv wrapper writes `# P\n\n### Task 1: x\n` (PF1 still fails, exit 2 stays). The wrapper keeps the case list in a `CASES` object so Task 3 adds entries without touching the runner.
- sync: dataset rows render as below; the `post-tool-validate-argv-exec.yaml` case is not edited.
- example (dataset rows):

  ```yaml
  - description: "plan-format: --if-plan skips a file with no task; without it PF2 fails"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-plan-format-case.js"
      script_args: "--case if-plan-no-task"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-valid-plan"
    assert:
      - type: javascript
        value: 'const o = JSON.parse(output); o.withFlag.exitCode === 0 && o.withFlag.stdout === "" && o.withoutFlag.exitCode === 1 && o.withoutFlag.pf2 === "fail"'

  - description: "post-tool-validate-plans: a plans/README.md with no task heading exits 0 with no output"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-post-tool-validate-plans.js"
      script_args: "--case readme-no-task"
    assert:
      - type: javascript
        value: 'const o = JSON.parse(JSON.parse(output).stdout); o.exitCode === 0 && o.stdout === "" && o.stderr === ""'
  ```

  The hook dataset runs under `providers/hook-runner.js`, which wraps the wrapper's stdout in its own `{ stdout, stderr, exitCode }` (`tests/promptfoo/providers/hook-runner.js:107-113`), so the assertion parses `JSON.parse(output).stdout`, the wrapper's one JSON line. `if-plan-plan` asserts PF1 fail; `fenced-task-only` asserts exit 0; `plan-no-goal` asserts exit 2 and `PF1` in stderr.

### Task 2: Count ticked checkboxes in PF5 and anchor its label
**Ticket:** BG-003 @fc698d16

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — `checkPF5` regexes
- Modify: `tests/promptfoo/scripts/run-plan-format-case.js` — add cases `pf5-ticked`, `pf5-plain`, `pf5-midline`
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — add 3 cases

**Notes:** Depends on Task 1 only because both edit the validator, the wrapper and the dataset (one owner per file per wave, F-43). The failure message stays word for word, so the existing assertion `has no checkbox items` at `tests/promptfoo/datasets/plan-format-exec.yaml:165` keeps passing.

**Acceptance criteria:**
- [ ] PF5 counts `- [ ]`, `- [x]` and `- [X]` in the Acceptance criteria block; the message for a block with no checkbox is unchanged (BG-003 A1).
- [ ] Case `pf5-ticked` (every item ticked) passes PF5; case `pf5-plain` (plain `- ` items) fails PF5 with `has no checkbox items` (BG-003 A2).
- [ ] Case `pf5-midline` (a prose line ending with `**Acceptance criteria:**` before the real label) passes PF5 (BG-003 A5).
- [ ] Every file of `docs/archived/plans` passes: `for f in docs/archived/plans/*.md; do node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file "$f" --json > /dev/null || echo "FAIL $f"; done` prints nothing; the same loop over `docs/plans/2026-*.md` prints nothing (BG-003 A3).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern plan-format` passes every case (48 after Task 1 + 3 new; each new case description starts with `plan-format:` so that the filter runs it).

**Contract:**
- shape (code): `checkPF5` at `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:363-367`, before → after:

  ```diff
  -    const acMatch = task.body.match(/\*\*Acceptance criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n### |\n---|\n## |$)/);
  +    const acMatch = task.body.match(/(?:^|\n)\*\*Acceptance criteria:\*\*\s*\n([\s\S]*?)(?=\n\*\*[^*\n]+:\*\*|\n### |\n---|\n## |$)/);
  ...
  -      const checkboxCount = (acMatch[1].match(/- \[ \]/g) || []).length;
  +      const checkboxCount = (acMatch[1].match(/- \[[ xX]\]/g) || []).length;
  ```

  The message `has no checkbox items (expected at least one "- [ ]")` and the Notes check stay unchanged.
- names: `checkPF5`, cases `pf5-ticked`, `pf5-plain`, `pf5-midline`.
- mirror: `PF13_CASES` table and `pf13Case` at `tests/promptfoo/scripts/run-plan-format-case.js:92-117` (temp copy of `plans/test-plan.md` with a replacement, validator JSON on stdout).
- decisions: a `PF5_CASES` table maps each name to a transform of `test-plan.md`: `pf5-ticked` replaces every `- [ ]` with `- [x]`; `pf5-plain` replaces every `- [ ] ` with `- `; `pf5-midline` inserts `See the note below for **Acceptance criteria:**\nplain prose line\n\n` before the first `**Acceptance criteria:**` line. The case prints validator `--json` stdout. Base measurement (planner, HEAD `ff121f9`): `pf5-ticked` and `pf5-midline` fail PF5 on base (red); `pf5-plain` fails on base and after (declared pin).
- sync: the header comment of `run-plan-format-case.js` lists the three new case names with descriptions.
- example: dataset assertion for `pf5-ticked`: `JSON.parse(output).checks.some(x => x.id === "PF5" && x.status === "pass")`.

### Task 3: Skip archived plans in the hook
**Ticket:** BG-004 @6f7811d8

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/post-tool-validate.js` — archive-segment skip before the validator runs; header comment
- Modify: `tests/promptfoo/scripts/run-post-tool-validate-plans.js` — add 6 cases
- Modify: `tests/promptfoo/datasets/post-tool-validate-exec.yaml` — add 6 cases

**Notes:** Threat model (F-73): a best-effort filter against noise, not a security check; a false skip only hides a report on a closed record. Accepted gaps: the match is case-sensitive (`Archive` is validated); symlinks are not resolved; a hook run from a subdirectory of the project sees only the segments below that directory; a path outside `process.cwd()` is always validated.

**Acceptance criteria:**
- [ ] The hook exits 0 with empty stdout and stderr for `<root>/docs/archived/plans/x.md` and `<root>/plans/archive/x.md`, each holding a plan that fails PF1 (BG-004 A1).
- [ ] With cwd `<tmp>/x/archive/proj`, the path `<tmp>/x/archive/proj/docs/plans/p.md` holding a failing plan exits 2; with cwd `<tmp>/proj`, the path `<tmp>/archived/plans/p.md` (outside the root) exits 2 (BG-004 A2).
- [ ] `<root>/docs/plans-archived-notes/plans/p.md` and `<root>/archives/plans/p.md` with a failing plan exit 2 (BG-004 A3).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern post-tool-validate` passes 10 of 10 (4 after Task 1 + 6 new) (BG-004 A4).
- [ ] The hook header comment states the skip rule (BG-004 A5).

**Contract:**
- shape (code): in `plugins/sdlc-utilities/hooks/post-tool-validate.js`, move `const projectRoot = process.cwd();` above the validator selection and add, after the `if (!isDimension && !isPrTemplate && !isPlan)` exit:

  ```js
  // BG-004: an archived plan is a closed record; skip it (segments below the project root only).
  const ARCHIVE_SEGMENTS = new Set(['archive', 'archived']);
  if (isPlan) {
    const rel = path.relative(projectRoot, path.resolve(projectRoot, filePath));
    const inside = rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
    if (inside && path.dirname(rel).split(/[/\\]+/).some((s) => ARCHIVE_SEGMENTS.has(s))) process.exit(0);
  }
  ```

  Header comment gains: `A plans/*.md path with a directory segment named exactly "archive" or "archived" below the project root (process.cwd()) exits 0 without running the validator.`
- names: `ARCHIVE_SEGMENTS`, cases `archived-docs`, `archive-plans`, `archive-above-root`, `outside-root`, `archived-substring`, `archives-segment`.
- mirror: the cases added by Task 1 in `tests/promptfoo/scripts/run-post-tool-validate-plans.js` (`CASES` object) and `tests/promptfoo/datasets/post-tool-validate-exec.yaml`.
- decisions: each case may set its own cwd below the temp dir (`archive-above-root`: `x/archive/proj`; `outside-root`: `proj`); the failing plan body is `# P\n\n### Task 1: x\n`. The dimension and PR-template paths are not affected (`isPlan` guard).
- sync: none beyond the two test files.

### Task 4: Spec wording for PF5 and --if-plan
**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — PF5 line wording; one sentence after the PF15 line
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of `docs/specs/plan-sdlc.md` (`cp`)
- Modify: `docs/skills/plan-sdlc.md` — check only, no change expected (states no PF5 rule, `--if-plan` or hook rule)
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy of `docs/skills/plan-sdlc.md`; check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, no change expected (its `- [ ]` lines are format examples, not the PF5 rule)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected

**Notes:** Implements BG-002 A5 (spec part) and BG-003 A4; covers the BG-004 rule so the hook behaviour is in the spec (Deviations table); no Ticket line because it serves three tickets. The copy-rule companions were grepped (`checkbox`, `PF5`, `post-tool-validate`, `archived`) and state none of the changed rules.

**Acceptance criteria:**
- [ ] The PF5 line reads "`Acceptance criteria` present, its label at the start of a line, with ≥1 checkbox, unticked or ticked (`- [ ]`, `- [x]` or `- [X]`)" and keeps the rest of the line (BG-003 A4).
- [ ] One sentence after the PF15 line describes `--if-plan` and the hook skip rule; no PF id is added or renumbered (BG-002 A5).
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0, and `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:** shape (openspec): MODIFY the PF5 line to start `- PF5: Task body valid (\`Acceptance criteria\` present, its label at the start of a line, with ≥1 checkbox, unticked or ticked (\`- [ ]\`, \`- [x]\` or \`- [X]\`); optional \`Notes\` block …` (rest unchanged); ADD after PF15 the line `With \`--if-plan\`, a file in which neither task parser finds a \`### Task N:\` heading exits 0 with no output and no check runs; without the flag every file is checked. The post-tool-validate hook passes \`--if-plan\` for a \`plans/*.md\` path and does not run the validator for a path with a directory segment named \`archive\` or \`archived\` below the project root.`; names: `PF5`, `--if-plan`; sync: `site/src/content-source/specs/plan-sdlc.md` via `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1-3 add promptfoo exec cases and update the argv wrapper whose old behaviour changes; Task 4 is spec only. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted, exec-only configs with filter patterns are run; no retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to BG-002, BG-003 or BG-004; extras are justified in the Deviations table. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; Task 1's combined validator and hook change is justified. |
| scripts-over-llm-logic | error | PASS | Logic lives in deterministic scripts and the hook; no LLM instructions added. |
| yagni | warning | PASS | The flag and the archive skip are both required by the tickets. |
| cross-skill-consistency | error | PASS | The flag is off by default, so the plan-sdlc Step 6.6 gate is preserved, and the spec is updated. |
| pr-link-github-issue | error | PASS | BG tickets and W-F3 are internal ids; the rule does not apply. |
| dry | warning | PASS | Reuses the validator's existing task parsers instead of adding a regex in the hook. |
| kiss | warning | PASS | A small flag and a path check are the simplest approach. |
| spec-first | error | PASS | No SKILL.md changes; the spec task (Task 4) exists anyway. |
| project-agnostic | error | PASS | The change is in plugin code (the hook and the validator). |
| flag-coherence-cross-skill | error | PASS | The flag belongs to a CI script; no skill dispatch is involved. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are touched. |
| flag-resolution-single-source | warning | PASS | --if-plan is resolved once, in the validator's parseArgs. |
| state-premise | error | PASS | Context states the problem: false plan-format reports after each edit. |
| smallest-viable-cut | warning | PASS | Key Decisions justify the task split and ordering. |
| failure-audience | warning | PASS | Context 'Who is hit if this ships wrong?' names plan authors, ship workers and plugin users. |
| explicit-non-goals | warning | PASS | Context 'Non-goals' lists what is excluded (PLAN_RE, dimension and PR-template paths, PF ids, R69, register files). |
| ambiguity-stops-and-asks | error | PASS | Key Decisions record the placement and archive-scope choices. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | The flag is on a CI script, not a skill prepare script, so it is out of scope. |
| workspace-mode-compatibility | error | PASS | Uses process.cwd() and relative-path logic, writes no state, so it behaves the same in branch and worktree modes. |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are changed. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 adds a `--if-plan` CLI flag to plugins/sdlc-utilities/scripts/ci/validate-plan-format.js and has the post-tool-validate hook pass it, which changes the validator's CLI contract.

**Severity hint:** high

**Patch:** Check that the new validate-plan-format.js `--if-plan` CLI flag is documented in usage text and the spec, and that the hook's argument list stays in sync.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the new validate-plan-format.js `--if-plan` CLI flag is documented in usage text and the spec, and that the hook's argument list stays in sync.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 and Task 2 add exec cases to tests/promptfoo/datasets/plan-format-exec.yaml and post-tool-validate-exec.yaml, and Task 4 edits docs/specs/plan-sdlc.md, none of which the code-quality triggers cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

### CREATE: documentation-quality-review

**Why:** Task 4 modifies site/src/content-source/specs/plan-sdlc.md (a byte copy of the spec via `cp`), and no existing dimension covers that path.

**Severity hint:** low

**Triggers:** `site/src/content-source/specs/plan-sdlc.md`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/src/content-source/specs/plan-sdlc.md`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Final Shape

- `validate-plan-format.js` has a `--if-plan` flag. With it, a file with no task heading passes silently. Without it, nothing changes.

- PF5 accepts ticked and unticked checkboxes and reads the Acceptance criteria label only where it starts a line. All archived plans pass the validator.

- The post-tool-validate hook stays quiet for README, decision and guideline files under `plans/`, and for plans below an `archive` or `archived` directory of the project. A real plan with a format error still gives exit 2 with the finding.

- New exec cases cover each rule: 5 in the validator dataset and 9 in the hook dataset. The spec's CI validation contract states the new wording. No register, ticket or TODO file changes.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
