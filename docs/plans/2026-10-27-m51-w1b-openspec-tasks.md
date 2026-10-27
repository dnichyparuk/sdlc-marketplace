# openspec-step.js `tasks` Subcommand (W8.28, M5.1 wave 1b) Implementation Plan

**Commit:** `fix(#9018): execute-plan-sdlc - openspec tasks subcommand (W8.28)`
**Goal:**
- Add a `tasks` subcommand to `plugins/sdlc-utilities/scripts/skill/openspec-step.js`. It takes `--change <name>`, rejects a name that fails `^[A-Za-z0-9._-]+$` or is `.` or `..` (usage error, exit 2), reads `<root>/openspec/changes/<name>/tasks.md` and prints the `parseTasks` entries as one JSON line.
- Replace the last OpenSpec `node -e` in execute-plan-sdlc (`openspec-tasks.md`, the R38 re-parse) with a call to that subcommand. The call uses the validate block's argv form, so the plan-derived name never enters a shell string.
- Add five `openspec-step: tasks` exec cases through a new `tasks` scenario of the test runner.

**Architecture:** Three tasks. Task 1 changes the script. Task 2 changes the skill companion file. Task 3 changes the runner and the dataset, and depends on Task 1. The plan runs in ONE ship run, `/sdlc:ship-sdlc --auto --plan <frozen feat plan> --steps execute,commit --rebase skip --quality balanced` (rulings w1-oneship, w1-shipauto). That run makes exactly one in-ship commit with the `**Commit:**` subject above, which is 65 characters and matches `commit.subjectPattern`; `re.search` and the length were checked. The commit's files are exactly the four files below. The spec text this plan implements landed first, as C1 of `docs/plans/2026-10-27-m51-w1b-direct.md` (execute R38, execute I13, ship I13).
**Ship precondition (ruling w1b-plan Q1):** the commit order is C1 → C2 → `node site/scripts/copy-docs.mjs` → C-docs (the two plans plus the copy-docs mirrors; direct plan Task 4) → this ship run. Before the ship run, `git status --porcelain` prints nothing, and the executor records that in its done-file. Reason: ship stages with `git add -A -- ':!.sdlc/'` (`ship.js:1179`), so any leftover file would enter the in-ship commit. After the ship, if C3 changes a mirror (none expected: C3 touches no `docs/` file), a further direct docs commit is allowed under the same path rule.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-1b-plan-source.md (plan 2: C3; design points D1–D6, D8), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/item-W8.27-W8.28-da723b7.md (W8.28 Changes 2–4), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/preflight-wave-1b.md
**Verification:** run from the repository root, in this order:

```bash
grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md; grep -rn OPENSPEC_TASKS_PATH plugins/sdlc-utilities; grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md
```

- (1) Expected after Task 2: `0`, then nothing from the second grep, then `1`. Current output at da723b7: `2`, then two lines (`…/openspec-tasks.md:77:     OPENSPEC_TASKS_PATH="openspec/changes/<name>/tasks.md" \` and `…/openspec-tasks.md:81:     const content = fs.readFileSync(process.env.OPENSPEC_TASKS_PATH, 'utf8');`), then `1`.
- (2) `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . 2>/dev/null; echo "exit=$?"` prints only `exit=0`, so no stdout line names execute or ship (current: `exit=0`). This holds after C1. This plan changes no spec, so P-5 is C1's check (direct plan header).
- (3) With `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>`: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "openspec-step"` passes: 23 cases (18 existing + 5 new), 0 failures, 0 errors. At da723b7, 18 descriptions across the exec config's datasets match `openspec-step`.
- (4) `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 (current: exit 0).
- (5) Behavioural case: none (D8).

---

## Context

**What problem does this change solve?**

- execute-plan-sdlc's archive gate (R38) re-reads `openspec/changes/<name>/tasks.md` before it suggests `openspec archive`. Today it does this with an inline `node -e` script (`openspec-tasks.md:73-84`).
- The model writes the plan-derived change name into a double-quoted shell assignment: `OPENSPEC_TASKS_PATH="openspec/changes/<name>/tasks.md"`. Inside double quotes, `$(...)`, backticks and `"` still expand. A name like `a$(touch PWNED)` would run a command, and `../x` would read outside `openspec/changes/` (PR #39 review F3, MEDIUM, security).
- The fix is a script subcommand, `openspec-step.js tasks --change <name>`. It receives the name as an argv element (a separate process argument, never shell text) and checks it with the W4.4 pattern. It also rejects `.` and `..` (arbiter ruling pr40), because `.` would read `openspec/changes/tasks.md` and `..` would read `openspec/tasks.md`.

**What prompted this change now?**

- Ruling w3-review F3 folded the fix into #9165, upgraded it to SECURITY and placed it in M5.1 before the fork install. The owner placed it in wave 1b.

**What does success look like?**

- `openspec-tasks.md` has no `node -e` and no `OPENSPEC_TASKS_PATH`.
- The five new `openspec-step: tasks` cases and the 18 existing `openspec-step` cases pass.
- `check-consistency.js` exits 0.

---

## Research Findings

All line numbers below are at da723b7 (the pre-flight's "Current line numbers to use"). Each one was re-read for this plan.

- **Script structure** (`plugins/sdlc-utilities/scripts/skill/openspec-step.js`, 286 lines):
  - usage header `:9-28` (Usage `:9-13`, root note `:15-16`, stdout contract `:18-28`);
  - `lib/openspec.js` import `:40-48`, whose last entry is `  markTaskDone,` at `:47`;
  - `SUBCOMMANDS` `:52`, `VALUE_FLAGS` `:54` (it already contains `--change`), `parseArgs` `:60-68`, `usageError` `:70-82`;
  - the `--change` presence check `:76`: `if (opts.sub !== 'detect' && !opts.change) return \`${opts.sub}: --change <name> is required\`;`;
  - `archive` ends at `:267`, followed by the `// Main` banner `:269-271`;
  - `main` `:273-284`, with the root at `:281`: `const root = opts['project-root'] ? path.resolve(opts['project-root']) : resolveActiveWorktreeSafe();`, and `handlers` at `:282`.
  - `fs` and `path` are already imported (`:35-36`). `writeJsonLine(obj, { exitCode })` (`lib/output.js:113-123`) writes `JSON.stringify(obj)` plus a newline and calls `process.exit`.
- **parseTasks** (`plugins/sdlc-utilities/scripts/lib/openspec.js:513-530`, exported at `:739`) returns `Array<{ ref, line, title, indent, done }>`. It never throws on content.
- **The W4.4 pattern** is at `plugins/sdlc-utilities/scripts/skill/ship.js:1177-1178`: `// W44-R6: the change name is quoted inside an emitted shell command, so only these characters pass.` / `const OPENSPEC_CHANGE_RE     = /^[A-Za-z0-9._-]+$/;`. It is used at `:1663`. It admits `.` and `..`.
- **openspec-tasks.md.**
  - The validate block (`:60-66`) writes `OPENSPEC_CHANGE='<name>'` (`:63`) and `node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" validate --change "$OPENSPEC_CHANGE"` (`:64`).
  - Its failure rule (`:66`) reads: "A usage error (exit 2) or output that is not this JSON is handled like `ok === false`, with the output as `<stderr output>`."
  - The re-parse is the sub-bullet at `:71` plus the fence `:73-84`. The fence holds the TODO (`:75`), `OPENSPEC_LIB` (`:76`), `OPENSPEC_TASKS_PATH` (`:77`) and the `node -e` (`:78-83`).
  - `:86` reads "Build `unflippedTitles` from entries where `done === false`."
  - The validate fence is indented 3 spaces; the re-parse fence is indented 5 spaces (it sits under a sub-bullet).
- **Test runner** (`tests/promptfoo/scripts/run-openspec-step.js`, 161 lines):
  - header `:12-27`, scenario list `:14`;
  - flag loop `:47-57`; `run(argv)` (`:107-115`) spawns the script with `cwd: projectRoot` and appends `--project-root <root>`;
  - switch `:117-143` (`detect-two` ends `:139`, `default` `:140-142`); final JSON `:155-161`.
  - It has no fixture-copy helper (D6 correction). The copy is made by the promptfoo `transformVars` hook, `tests/promptfoo/scripts/extract-skill-content.js:50-69`. It runs `fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'))` (`:53`), so the copy goes under `$TMPDIR`, then copies the fixture and runs its `setup.sh`. The afterAll hook `tests/promptfoo/scripts/fixture-copies-cleanup.js:10-11` deletes "Only our own copies: directly under os.tmpdir(), named promptfoo-fixture-*".
- **Provider.** `tests/promptfoo/providers/script-runner.js:90` splits `script_args` on whitespace with no shell. So a name with a space, such as `a$(touch PWNED)`, cannot travel through `script_args`. That is why the runner gets a fixed preset flag (D6).
- **Fixture** `tests/promptfoo/fixtures-fs/project-openspec-step-archive/setup.sh`:
  - it git-inits the temp copy and writes `openspec/changes/add-auth/tasks.md` (`:13`) with three done tasks, on lines 3–5;
  - the first is `Implement OAuth2 provider`;
  - no `<!-- ref: -->` comments;
  - the fixture already exists, so no new fixture or `setup.sh` is needed.
- **Dataset.** `tests/promptfoo/datasets/openspec-step-exec.yaml` has 284 lines and 18 cases. Its last case ends at `:284`. No description starts `openspec-step: tasks` (pre-flight section 4).
- **Consumers** (addendum C9; excluding `docs/plans/**` and the site plan mirrors):
  - `OPENSPEC_TASKS_PATH`: only `openspec-tasks.md`.
  - `SUBCOMMANDS`: only `openspec-step.js`.
  - The list `detect|flip|validate|archive`: `docs/specs/ship-sdlc.md:422` and its site mirror. C1 changed both; the mirror is refreshed by copy-docs.
  - `parseTasks`: `lib/openspec.js`, `skill/plan.js`, `skills/ship-sdlc/state-format.md`, `docs/specs/ship-sdlc.md` (and its mirror), `tests/promptfoo/scripts/openspec-lib-test.js`, `tests/promptfoo/datasets/openspec-lib-exec.yaml` and `openspec-tasks.md`. None depends on the replaced text.
  - `bypassPermissions`: `tests/promptfoo/datasets/execute-plan-sdlc.yaml:370` only, an absence assertion that is unaffected.
  - No dataset asserts the replaced `openspec-tasks.md` text or the subcommand error text. The existing case "openspec-step: usage error prints an error line" uses `icontains '"error"'` and stays true.
  - Exec cases to re-run: the `openspec-step` filter (Verification 3). The parseTasks consumers are not edited, so `openspec-lib` is not re-run.
- **Behavioural candidate.** The only behavioural archive-gate case is `tests/promptfoo/datasets/execute-plan-sdlc.yaml:541` ("archive suggestion suppressed when undocumented - [ ] tasks remain (R38, #414)"). Its prompt hands the re-parse result to the model ("Re-parsing tasks.md shows one - [ ] line …"), so it does not exercise the `tasks` call (D8).
- **Exploration.** The orchestrator's brief (`/tmp/sdlc-explore-m51-w1b-9018-security-dispatch-BvNJJf/discovery-brief.md`) writes its finding ids in lowercase. plan-sdlc's validation grep `F-[A-Z0-9_-]+-[0-9]+` therefore finds none, so this plan uses the inline-exploration fallback. The brief agrees with the facts above, including the D6 correction and the cwd note.

---

## Plan readings

- **Spec-first** (plan Execution conventions; arbiter 2026-10-20): spec-consequence commits go FIRST; never record a waiver nobody gave. → The spec text is C1 of the direct plan, committed before this ship run.
- **One ship run per wave branch**: "one ship run per branch (owner 2026-10-20, ruling w1-oneship)"; spec and S commits go direct; a second planned run would use `/sdlc:execute-plan-sdlc` directly. → This plan is the wave's only ship run.
- **Ship line** (ruling w1-shipauto): `/sdlc:ship-sdlc --auto --plan <frozen feat plan> --steps execute,commit --rebase skip --quality balanced`.
- **Direct commits** (ruling commit-wrapper item 1; in force for ALL of M5.1, because W8.24 is merged but not installed until the owner's swap): one call `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "<exact subject>" <body-file> <files…>`; the body file has NO `Co-Authored-By` line (ruling w3-trailers); the subject is passed literally (ruling stop-3). → Not used by this plan, which has one in-ship commit.
- **In-ship commit** (ruling w1-run1commit item 2; ruling w1-plancheck m1; STANDING remedy ruling stop-1 item 2): accepted when its files equal the plan's files; a subject that differs from the `**Commit:**` subject and/or a missing or wrong trailer is fixed by a message-only reword amend, disclosed, with no STOP; any other difference is a STOP. → The plan's files are the four files listed under Architecture.
- **`**Commit:**` by hand** (ruling w1-plan R3). → The header field above was added by hand. plan-sdlc does not emit it (follow-up #9176).
- **Repo files by Write/Edit only** (ruling stop-4 item 1): "Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed." → Repeated in every task.
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → 65 characters.
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1). → No new fixture. The existing `project-openspec-step-archive` copy runs only through promptfoo's hook, under `$TMPDIR`. No `setup.sh` is run by hand.
- **Classifier refusals** (ruling w4-curl): the plan's task text tells execute's workers to stop and report on a classifier refusal and never switch tools; public docs only via WebFetch. → Repeated in every task.
- **Worker temp files** (ruling stop-w3-2): a worker's ephemeral temp file is created under `$TMPDIR` and removed in its own run; none is left behind. → Repeated in every task. The `tasks` scenario creates no temp directory of its own.
- **No adapted verification** (ruling w2-judge row 52): every command in the plan runs exactly as written; test each grep against the current text before you write it, and give its current output. → Each command gives its output at da723b7. Outputs that need the new code are marked "prediction".
- **`.`/`..` rejection** ("arbiter ruling pr40"). → D3, Task 1, case (e).
- **Files extensions:** any file outside the items' Files lists is a QUESTION, never assumed. → None. D2 chose the script-local constant, so `skill/ship.js` and `lib/` stay out.
- **Issue link (guardrail pr-link-github-issue):** #9018 is a local todo id (plan source, "Tracking: local todo **#9018**"), not a GitHub issue of this repository. The ship line runs only `execute,commit`, and the orchestrator writes the wave PR body outside this plan. → No `Fixes #9018`/`Closes #9018` is planned, because such a keyword would close an unrelated GitHub issue with that number.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| D6 "reuse the runner's existing copy helper" | no | cites the promptfoo `transformVars` copy (`extract-skill-content.js:53`) and the afterAll cleanup instead | The runner has no copy helper (Research Findings). The fixture copy already lives under `$TMPDIR` and is removed by the hook. |
| Case (c) "no PWNED in the fixture copy AND in the cwd" | no | the case sets no `script_cwd`, so the runner's cwd is promptfoo's (`tests/promptfoo`); the runner reports `pwned.fixture` (`<project-root>/PWNED`) and `pwned.cwd` (`<runner cwd>/PWNED`) | The script's child cwd IS the fixture copy. Without a separate cwd, the two checks would test the same directory. |
| Runner gets two flags beyond `--scenario tasks`: `--changes <a,b>` and `--inject` | no | `--changes` makes one call per comma-separated name; `--inject` uses the fixed name `a$(touch PWNED)` | Case (e) needs two calls in one case (the item counts five cases), and `script_args` cannot carry a space (D6). The pattern forbids commas, so a comma list cannot hide a valid name. |
| Error JSON byte form | no | prints `{"error":"tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or .."}` (no space after the colon) | `writeJsonLine` uses `JSON.stringify` with no indent. The item's `{"error": "…"}` is the same JSON value. The cases compare the parsed `error` string. |
| `openspec-tasks.md:71` (the "Re-parse … env-var contract below:" sentence) is reworded | no | the sentence now names `openspec-step.js tasks` | It is inside the item's replace range `:71-84`. Left as it is, it would describe the removed env-var contract. |
| The plan-sdlc pipeline's learnings-log append is not written | no | skips it | The planner brief allows writes only under `docs/plans/`. |

---

## Key Decisions

1. **D1 — the subcommand is named `tasks`.**
   - Alternative: `coverage`.
   - Why: it reads and returns the task list; coverage is what the caller computes from it. The item proposes `tasks`, and the Verification filters and case prefixes assume it.
2. **D2 — the pattern lives in `openspec-step.js` only.**
   - Choice: a script-local constant, `CHANGE_NAME_RE = /^[A-Za-z0-9._-]+$/`, whose comment names its twin, ship.js's `OPENSPEC_CHANGE_RE`.
   - Alternative: a shared `lib/` constant that `skill/ship.js` also imports.
   - Why: a shared constant would put `ship.js` and a `lib/` file in Files. That is a Files extension, which needs a ruling, and the item's Must not touch keeps both unchanged. The duplication is one regex literal.
3. **D3 — the name check lives in `usageError`.**
   - Choice: right after the `--change` presence check (`:76`), a `tasks` call whose name fails the pattern, or equals `.` or `..`, returns `tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..`. `main` then prints it as `{"error":…}` with exit 2 (`:275-278`).
   - Alternative: the check in the handler.
   - Why: the item says `usageError`. A rejected name never reaches root resolution or any file read.
4. **D4 — output and exit contract.**
   - Success is `{"ok":true,"tasks":[…]}` with exit 0. The entries are `parseTasks` output unchanged.
   - Failure is `{"ok":false,"error":"not-found"}` when `readFileSync` throws with `err.code === 'ENOENT'` (a missing change directory or a missing `tasks.md`). Any other read error gives `"io-error"`, for example `EACCES`, or `ENOTDIR` when `openspec/changes/<name>` is a file. Both exit 1.
   - The path is `path.join(root, 'openspec', 'changes', opts.change, 'tasks.md')`. `root` comes from the script's existing rule at `:281`: `--project-root <p>`, else `resolveActiveWorktreeSafe()`.
   - Why: this mirrors `flip`'s `not-found`/`io-error` reason words. The pattern plus the `.`/`..` rejection keep the path one directory below `openspec/changes/`.
5. **D5 — the `openspec-tasks.md` block.** It is the validate block's argv form, with the validate block's failure rule pointed at step 5 (`ok === false`: the archive suggestion is suppressed and the output is shown). The `unflippedTitles` logic (`:86` onward) is unchanged.
6. **D6 — the runner presets.**
   - Choice: `--inject` sets the name to the constant `INJECTION_CHANGE = 'a$(touch PWNED)'`, and `--changes` takes a comma list.
   - Alternative: a base64 argument, or direct-script cases.
   - Why: direct-script cases cannot see the exit code, because the provider returns only stdout and stderr. A named preset is the smallest way to pass a name that contains a space.
7. **D8 — no behavioural case.** The only archive-gate case (`execute-plan-sdlc.yaml:541`) supplies the re-parse result in its prompt, so it does not exercise `tasks --change`. The arbiter may still choose to run it.

**Non-goals:**
- No name check for `detect`, `flip`, `validate` or `archive`. #9165 names only the new subcommand; those four accept any `--change` today (noticed, not itemised).
- No change to `skill/ship.js`, `lib/openspec.js`, the R38 diagnostic text, or the flip, validate and archive blocks of `openspec-tasks.md`.
- No edit to the runner's line `:4` or the dataset's `:1` subcommand comments. Runner `:4` is a description line not needed by the cases (kept as is), and so is the dataset's `:1`.
- No `docs/skills/` change: `tasks` is an internal script subcommand, not a user flag.
- No new step-5 wording. A `tasks` read or usage failure appears under step 5's existing heading "OpenSpec validation failed for change", which is slightly loose for a read error. The item says to handle it "as the validate block handles a failure", and the R38 diagnostic text is Must not touch.

**Failure audience:**
- If the check is too strict, a valid OpenSpec change name with other characters gets exit 2. execute then suppresses the archive suggestion and shows the error. That affects only users of OpenSpec-sourced plans, and ship already enforces the same pattern.
- If the check is too loose, the security hole (F3) stays open.

---

## Contract Examples

```markdown
**Contract:**
- shape (code): `node openspec-step.js tasks --change <n> [--project-root <p>]` → stdout one JSON line; exit 0 `{"ok":true,"tasks":[{ref,line,title,indent,done}…]}`, exit 1 `{"ok":false,"error":"not-found"|"io-error"}`, exit 2 `{"error":"tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or .."}`.
- names: `tasks` (subcommand and handler), `CHANGE_NAME_RE`, `parseTasks` (import).
- mirror: `validate` handler `openspec-step.js:166-172`; flip's reason words `:22`.
- decisions: D1–D4.
- sync: `openspec-tasks.md` call (Task 2); exec cases (Task 3); execute R38/I13 and ship I13 (C1).
- example: `tasks --change ..` → `{"error":"tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or .."}`, exit 2.
```

```markdown
**Contract:**
- shape (docs): MODIFY `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` `:71-84` only (the re-parse sub-bullet and fence); audience: the execute-plan-sdlc model at Step 9.
- names: `OPENSPEC_CHANGE`, `openspec-step.js … tasks --change "$OPENSPEC_CHANGE"`.
- mirror: the validate block `openspec-tasks.md:60-66`.
- decisions: D5.
- sync: execute R38 (C1).
```

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| spec-first | error | PASS | The spec text is C1, committed before this run (direct plan). |
| test-coverage-required | error | PASS | Five new exec cases cover success, the three rejection classes and not-found. |
| scripts-over-llm-logic | error | PASS | The name check and the parse move from model-built shell text into a script. |
| no-auto-eval | error | PASS | Exec config only, with a targeted filter; no behavioural run. |
| cross-skill-consistency | error | PASS | The pattern equals ship.js's `OPENSPEC_CHANGE_RE`, and ship I13 lists `tasks` (C1). |
| no-scope-creep | warning | PASS | The other subcommands are untouched (Non-goals). |
| state-premise | error | PASS | Context states the root problem (PR #39 F3): a plan-derived change name sits inside a double-quoted shell assignment, so `$(...)`, backticks and `../` reach the shell and the file system. |
| workspace-mode-compatibility | error | PASS | The `node -e` read `openspec/changes/<name>/tasks.md` relative to the cwd. `tasks` reads from the script's existing root (`--project-root`, else `resolveActiveWorktreeSafe()`: the cwd's `git rev-parse --show-toplevel`, falling back to the cwd). Under `ship.workspace=branch` and `ship.workspace=worktree` alike, that is the session's own checkout, the same as the validate block. The subcommand is read-only and writes no state. |
| ambiguity-stops-and-asks | error | PASS | D2 took the reading that needs no Files extension; no open question. |
| dry | warning | PASS (noted) | The regex literal is duplicated on purpose (D2); a shared constant would need a Files extension. |
| project-agnostic | error | PASS | No project-specific paths; `<PLUGIN_ROOT>` placeholder kept. |
| skill-docs-required | error | PASS | No user-facing flag; `docs/skills/` is unaffected. |
| pr-link-github-issue | error | N/A | #9018 is a local todo, not a GitHub issue. The ship run opens no PR; the orchestrator writes the PR body (Plan readings, "Issue link"). |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, U2)

**Why:** The openspec-tasks plan adds a `tasks --change <n>` subcommand to `plugins/sdlc-utilities/scripts/skill/openspec-step.js` (new CLI contract: exit 2 on a bad name, JSON `{ok,tasks}` or `{ok:false,error}` with exit 1), but runtime-contract triggers `**/scripts/*.js` do not match the nested `scripts/skill/` path.

**Severity hint:** high

**Patch:** Add trigger `**/scripts/**/*.js` (covers scripts/skill/*.js) and a checklist item that new prepare-script subcommands keep exit-code and JSON-shape agreement with the calling skill's markdown (e.g. openspec-tasks.md).

**Action (dimension):** edit .sdlc/review-dimensions/runtime-contract.md: add `- "**/scripts/**/*.js"` to `triggers:` and one checklist item for subcommand exit-code/JSON-shape agreement with the calling skill markdown (strengthen-only)

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

*(Advisory G17 output. It is NOT a task of this plan: `.sdlc/review-dimensions/` and `.github/instructions/` are outside the item's Files. It is left for the orchestrator to decide.)*

---

## Tasks

### Task 1: `openspec-step.js` — the `tasks` subcommand

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/openspec-step.js` — usage header, `parseTasks` import, `SUBCOMMANDS`, a new `CHANGE_NAME_RE`, `usageError`, a new `tasks` handler, `handlers`.

**Notes:** D2–D4. The name never enters a shell. It is used only in `path.join`, after `usageError` has accepted it.

**Acceptance criteria:**
- [ ] `grep -c "'tasks'" plugins/sdlc-utilities/scripts/skill/openspec-step.js` prints `2`: the `SUBCOMMANDS` entry and the `opts.sub === 'tasks'` check (current: `0`).
- [ ] `grep -c 'parseTasks' plugins/sdlc-utilities/scripts/skill/openspec-step.js` prints `3`: import, handler call, header text (current: `0`).
- [ ] `grep -cF 'const CHANGE_NAME_RE = /^[A-Za-z0-9._-]+$/;' plugins/sdlc-utilities/scripts/skill/openspec-step.js` prints `1` (current: `0`; the command was checked against a scratch file holding the new line, where it prints `1`).
- [ ] `git diff -- plugins/sdlc-utilities/scripts/skill/openspec-step.js` shows no change inside the `detect`, `flip`, `validate`, `archive` or `runGit` function bodies.
- [ ] The behaviour is proven by Task 3's cases (a)–(e).

**Contract:**
- shape (code): see the before→after renders below. Handler signature `function tasks(root, opts)`, the same `(root, opts)` shape as the other handlers. Errors: usage → exit 2 (via `main`), `ENOENT` → `not-found` exit 1, any other read error → `io-error` exit 1.
- names: `tasks`, `CHANGE_NAME_RE`, `parseTasks`.
- mirror: the `validate` handler `:166-172` (one `writeJsonLine` per outcome with `exitCode`); the `usageError` message style `:76-79`.
- decisions: D1–D4.
- sync: Task 2 (`openspec-tasks.md` reads `{ ok, tasks }`); Task 3 cases; C1 spec text.

Edit A — usage header (`:13` and `:15-16`, `:27-28`), applied bottom-up (§0 rule 2):

```diff
@@ :27-28
  *            exit 0 archived, 1 halted or cancelled
+ *   tasks    {"ok":true,"tasks":[{"ref":S,"line":N,"title":S,"indent":N,"done":B}]}   exit 0
+ *            {"ok":false,"error":"not-found"|"io-error"}   exit 1
  *   usage    {"error":"<message>"}                    exit 2
@@ :15-17
  * The project root is `--project-root <p>`, else the active worktree
  * (`resolveActiveWorktreeSafe()`), where OpenSpec content lives.
+ *
+ * `tasks` reads <root>/openspec/changes/<n>/tasks.md through `parseTasks`. Its --change
+ * must match ^[A-Za-z0-9._-]+$ and not be . or .. (else the usage error, exit 2).
  *
@@ :13-14
  *   node openspec-step.js archive  --change <n> --decision sync|anyway|cancel [--auto] [--project-root <p>]
+ *   node openspec-step.js tasks    --change <n> [--project-root <p>]
  *
```

Edit B — import (`:47-48`):

```diff
   markTaskDone,
+  parseTasks,
 } = require(path.join(LIB, 'openspec'));
```

Edit C — constants (`:52-54`):

```diff
-const SUBCOMMANDS = ['detect', 'flip', 'validate', 'archive'];
+const SUBCOMMANDS = ['detect', 'flip', 'validate', 'archive', 'tasks'];
 const DECISIONS = ['sync', 'anyway', 'cancel'];
 const VALUE_FLAGS = ['--change', '--ref', '--line', '--title', '--decision', '--project-root'];
+// The W44-R6 pattern (skill/ship.js OPENSPEC_CHANGE_RE). `tasks` also rejects `.` and `..`,
+// which would read openspec/changes/tasks.md and openspec/tasks.md.
+const CHANGE_NAME_RE = /^[A-Za-z0-9._-]+$/;
```

Edit D — `usageError` (`:76-77`):

```diff
   if (opts.sub !== 'detect' && !opts.change) return `${opts.sub}: --change <name> is required`;
+  if (opts.sub === 'tasks' && (!CHANGE_NAME_RE.test(opts.change) || opts.change === '.' || opts.change === '..')) {
+    return 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..';
+  }
   if (opts.sub === 'flip' && !opts.ref) return 'flip: --ref <ref> is required';
```

Edit E — new handler, inserted after `archive`'s closing `}` (`:267`) and before the `// Main` banner (`:269`):

```js
function tasks(root, opts) {
  const file = path.join(root, 'openspec', 'changes', opts.change, 'tasks.md');
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (err) {
    writeJsonLine({ ok: false, error: err.code === 'ENOENT' ? 'not-found' : 'io-error' }, { exitCode: 1 });
    return;
  }
  writeJsonLine({ ok: true, tasks: parseTasks(content) });
}
```

Edit F — `handlers` (`:282`):

```diff
-  const handlers = { detect, flip, validate, archive };
+  const handlers = { detect, flip, validate, archive, tasks };
```

**Must not touch:** the behaviour of `detect`, `flip`, `validate` and `archive`; `parseArgs`; `lib/openspec.js`; `skill/ship.js`.

**Guardrails:** Never interpolate the change name into a shell string; pass it only as an argv element. Do not add the check to `detect`, `flip`, `validate` or `archive`. The pattern admits `.` and `..`, and `tasks` rejects both (arbiter ruling pr40).

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. A worker's temp file is created under `$TMPDIR` and removed in its own run.

### Task 2: `openspec-tasks.md` — call `openspec-step.js tasks` instead of the `node -e`

**Complexity:** Trivial
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — replace `:71-84` (the re-parse sub-bullet, its fence and the TODO).

**Notes:** D5. The text keeps the 5-space fence indent of the sub-bullet. Single quotes plus the `'\''` rule mean the name is never expanded by the shell, and `"$OPENSPEC_CHANGE"` passes it as one argv element.

**Acceptance criteria:**
- [ ] From the repository root, `grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md; grep -rn OPENSPEC_TASKS_PATH plugins/sdlc-utilities; grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `0`, then nothing, then `1` (current: `2`, two lines, `1`).
- [ ] `grep -cF 'openspec-step.js" tasks --change "$OPENSPEC_CHANGE"' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `1` (current: `0`; checked against a scratch file holding the new line, where it prints `1`).
- [ ] `grep -c "OPENSPEC_CHANGE='<name>'" plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `2` (current: `1`).
- [ ] `grep -c 'OPENSPEC_LIB' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `0` (current: `2`: the `OPENSPEC_LIB=` line :76 and `process.env.OPENSPEC_LIB` :80).
- [ ] `grep -c 'Build `unflippedTitles` from entries where `done === false`.' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` still prints `1`.

**Contract:**
- shape (docs): REPLACE lines `:71-84` with the block below; lines `:1-70` and `:85` onward stay byte-identical.
- names: `OPENSPEC_CHANGE`, `tasks[]`, `{ ok, tasks }`, `{ ok: false, error }`.
- mirror: the validate block `:60-66`.
- decisions: D5; the failure rule is the one at `:66`, pointed at step 5.
- sync: Task 1's output contract; execute R38 (C1).

Before (`:71-84`):

````markdown
   - Re-parse `openspec/changes/<name>/tasks.md` via `lib/openspec.js::parseTasks` using the `<PLUGIN_ROOT>` path and the env-var contract below:

     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     # TODO(#9165): openspec-step.js has no tasks/coverage subcommand yet; replace this node -e with it when it lands.
     OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \
     OPENSPEC_TASKS_PATH="openspec/changes/<name>/tasks.md" \
     node -e "
     const fs = require('fs');
     const { parseTasks } = require(process.env.OPENSPEC_LIB);
     const content = fs.readFileSync(process.env.OPENSPEC_TASKS_PATH, 'utf8');
     console.log(JSON.stringify(parseTasks(content)));
     "
     ```
````

After:

````markdown
   - Re-parse `openspec/changes/<name>/tasks.md` with `openspec-step.js tasks` (it wraps `lib/openspec.js::parseTasks`); inside the single-quoted value write every `'` as `'\''`:

     ```bash
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     OPENSPEC_CHANGE='<name>'
     node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" tasks --change "$OPENSPEC_CHANGE"
     ```

     It prints one JSON line `{ ok, tasks }` and exits 0; each `tasks[]` entry is `{ ref, line, title, indent, done }`. A missing or unreadable `tasks.md` gives `{ ok: false, error }` with exit 1. A usage error (exit 2: the name fails `^[A-Za-z0-9._-]+$` or is `.` or `..`), exit 1 or output that is not this JSON is handled like `ok === false` in step 5, with the output as `<stderr output>`.
````

**Must not touch:** the flip, validate and archive blocks of `openspec-tasks.md`; the `unflippedTitles` logic and the R38 diagnostic text (`:86` onward).

**Guardrails:** Never interpolate the change name into a shell string; pass it only as an argv element. Do not add the check to `detect`, `flip`, `validate` or `archive`. The pattern admits `.` and `..`, and `tasks` rejects both (arbiter ruling pr40).

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. A worker's temp file is created under `$TMPDIR` and removed in its own run.

### Task 3: runner scenario `tasks` and five `openspec-step: tasks` cases

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-openspec-step.js` — header `:12-27`, two flags, the `tasks` scenario, a `pwned` output field.
- Test: `tests/promptfoo/datasets/openspec-step-exec.yaml` — five cases appended after `:284`.

**Notes:** The provider splits `script_args` on whitespace, so `a$(touch PWNED)` (it has a space) needs the `--inject` preset. Case (e) needs two calls in one case, hence `--changes`. The fixture copy comes from promptfoo's hook under `$TMPDIR` and is removed by the afterAll hook. The `tasks` scenario creates no temp directory. Case (c) omits `script_cwd`, so the runner's own cwd differs from the fixture copy.

**Acceptance criteria:**
- [ ] `grep -c '^- description: "openspec-step: tasks' tests/promptfoo/datasets/openspec-step-exec.yaml` prints `5` (current: `0`). `grep -c '^- description:' tests/promptfoo/datasets/openspec-step-exec.yaml` prints `23` (current: `18`).
- [ ] `grep -c "case 'tasks':" tests/promptfoo/scripts/run-openspec-step.js` prints `1` (current: `0`).
- [ ] With `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>` set: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "openspec-step"` passes: 23 cases, 0 failures, 0 errors.
- [ ] After the run, no `PWNED` file exists: `ls tests/promptfoo/PWNED PWNED 2>&1 | grep -c 'No such file'` prints `2`, run from the repository root (current: `2`).

**Contract:**
- shape (code): runner CLI additions `--changes <a,b,…>` (tasks only: one `tasks` call per comma-separated name) and `--inject` (tasks only: the name is `INJECTION_CHANGE = 'a$(touch PWNED)'`). The output JSON gains `pwned: { fixture: B, cwd: B }`, where `fixture` checks `<project-root>/PWNED` and `cwd` checks `<process.cwd()>/PWNED`. It is present for every scenario. Existing assertions check named keys only, so an extra key breaks none. This is an output-only extension; no existing scenario's calls or flags change (Must not touch).
- names: `changes`, `inject`, `INJECTION_CHANGE`, scenario `tasks`, output key `pwned`.
- mirror: scenario `validate` `:129-131`; flag loop `:47-57`; case shape `openspec-step-exec.yaml:192-206` (runner + `calls[0]`).
- decisions: D6; each case's `description` starts `openspec-step: tasks` (§0 rule 5).
- sync: Task 1's exact error string `tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..`.

Runner edits (bottom-up):

```diff
@@ :155-161 final JSON
   archived,
+  pwned: {
+    fixture: fs.existsSync(path.join(projectRoot, 'PWNED')),
+    cwd: fs.existsSync(path.join(process.cwd(), 'PWNED')),
+  },
 }));
@@ :138-140 switch
     run(['detect']);
     break;
+  case 'tasks':
+    for (const name of inject ? [INJECTION_CHANGE] : (changes || [change])) run(['tasks', '--change', name]);
+    break;
   default:
@@ :45-57 vars and flag loop
 let noCli = false;
+let changes = null;
+let inject = false;
+// A name with a space cannot travel through script_args (the provider splits on whitespace).
+const INJECTION_CHANGE = 'a$(touch PWNED)';
@@
   else if (args[i] === '--no-cli') noCli = true;
+  else if (args[i] === '--changes' && args[i + 1]) changes = args[++i].split(',');
+  else if (args[i] === '--inject') inject = true;
 }
```

```diff
@@ header :14-27
- *   --scenario <name>       flip-twice | flip-empty-line | archive | validate | detect-two
+ *   --scenario <name>       flip-twice | flip-empty-line | archive | validate | detect-two | tasks
  *   --change <n>            Change name (default add-auth)
+ *   --changes <a,b>         tasks: one `tasks` call per comma-separated name (instead of --change)
+ *   --inject                tasks: use the change name a$(touch PWNED) (script_args cannot carry a space)
@@
- *   { scenario, calls: [{ args, exitCode, json, stderr }], lastSubject, commitCount, archived }
+ *   { scenario, calls: [{ args, exitCode, json, stderr }], lastSubject, commitCount, archived,
+ *     pwned: { fixture, cwd } }   pwned: a PWNED file exists in --project-root / in this process's cwd
```

Dataset — append after `openspec-step-exec.yaml:284`, starting with one blank line:

```yaml

- description: "openspec-step: tasks returns the parsed tasks of the change"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"
    script_args: "--project-root {{project_root}} --scenario tasks --change add-auth"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-openspec-step-archive"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const a = o.calls[0];
        if (!a || o.calls.length !== 1) return `FAIL: ${output}`;
        if (a.exitCode !== 0 || !a.json || a.json.ok !== true || !Array.isArray(a.json.tasks)) return `FAIL call: ${output}`;
        if (a.json.tasks.length !== 3 || !a.json.tasks.every((t) => t.done === true && t.indent === 0)) return `FAIL tasks: ${output}`;
        if (a.json.tasks[0].title !== 'Implement OAuth2 provider' || a.json.tasks[0].line !== 3) return `FAIL first: ${output}`;
        return true;

- description: "openspec-step: tasks rejects --change ../x with a usage error (exit 2)"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"
    script_args: "--project-root {{project_root}} --scenario tasks --change ../x"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-openspec-step-archive"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const a = o.calls[0];
        if (!a) return `FAIL: ${output}`;
        if (a.exitCode !== 2 || !a.json || a.json.error !== 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..') return `FAIL: ${output}`;
        return true;

# No script_cwd: the runner's cwd is then promptfoo's, distinct from the fixture copy
# the script runs in, so pwned.fixture and pwned.cwd check two directories.
- description: "openspec-step: tasks rejects a command-substitution change name and runs nothing"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"
    script_args: "--project-root {{project_root}} --scenario tasks --inject"
    project_root: "file://fixtures-fs/project-openspec-step-archive"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const a = o.calls[0];
        if (!a || a.args[2] !== 'a$(touch PWNED)') return `FAIL args: ${output}`;
        if (a.exitCode !== 2 || !a.json || a.json.error !== 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..') return `FAIL call: ${output}`;
        if (!o.pwned || o.pwned.fixture !== false || o.pwned.cwd !== false) return `FAIL pwned: ${output}`;
        return true;

- description: "openspec-step: tasks on a missing change reports not-found (exit 1)"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"
    script_args: "--project-root {{project_root}} --scenario tasks --change no-such-change"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-openspec-step-archive"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const a = o.calls[0];
        if (!a) return `FAIL: ${output}`;
        if (a.exitCode !== 1 || JSON.stringify(a.json) !== '{"ok":false,"error":"not-found"}') return `FAIL: ${output}`;
        return true;

- description: "openspec-step: tasks rejects --change . and --change .. (exit 2)"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-openspec-step.js"
    script_args: "--project-root {{project_root}} --scenario tasks --changes .,.."
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-openspec-step-archive"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.calls.length !== 2 || o.calls[0].args[2] !== '.' || o.calls[1].args[2] !== '..') return `FAIL args: ${output}`;
        for (const a of o.calls) {
          if (a.exitCode !== 2 || !a.json || a.json.error !== 'tasks: --change must match ^[A-Za-z0-9._-]+$ and not be . or ..') return `FAIL: ${output}`;
        }
        return true;
```

**Must not touch:** the 18 existing cases (`openspec-step-exec.yaml:1-284` byte-identical); the existing scenarios and flags of the runner; runner line `:4`; the fixture `project-openspec-step-archive`; `promptfooconfig-exec.yaml`, which already lists the dataset.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. A worker's temp file is created under `$TMPDIR` and removed in its own run. Run promptfoo only with the exec config and the `openspec-step` filter; never a behavioural run. Never run a fixture `setup.sh` by hand.

---

## Final Shape

- `openspec-step.js` has five subcommands. `tasks --change <n>` rejects a bad name with exit 2 before touching any file, and returns `{"ok":true,"tasks":[…]}` (exit 0) or `{"ok":false,"error":"not-found"|"io-error"}` (exit 1).
- execute-plan-sdlc's archive gate calls `openspec-step.js tasks --change "$OPENSPEC_CHANGE"` with a single-quoted name. execute's OpenSpec instructions contain no `node -e` and no `OPENSPEC_TASKS_PATH`.
- `openspec-step-exec.yaml` holds 23 cases. Five of them pin success, `../x`, command substitution (no `PWNED` anywhere), not-found, and `.`/`..`.
- One in-ship commit: `fix(#9018): execute-plan-sdlc - openspec tasks subcommand (W8.28)`, touching exactly the four files above.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)* There is one Step 5 review round, a single reviewer with lens `all` (the plan has fewer than 5 tasks). Its status was Approved. The reviewer also simulated the cases; under ruling stop-5 Q1 that simulation is planning evidence only and counts for nothing at the gate.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 1 | 1 |
| Correctness | 0 | 1 | 0 | 1 |
| Coherence | 0 | 0 | 2 | 1 |

The findings and their fixes (ruling stop-5 Q2):
- WARNING, Task 2 Guardrails line: added.
- WARNING, workspace-mode-compatibility row: added.
- SUGGESTION, state-premise rationale: rewritten.
- SUGGESTION, KD numbers versus D-ids: every reference now cites the D-id.
- SUGGESTION, the step-5 heading for a read failure: added to Non-goals.

| Requirement (from the plan source) | Task(s) | Status |
|---|---|---|
| D1 `tasks` subcommand; D2 script-local pattern; D3 the `usageError` check and its exact error text, exit 2; D4 the output and exit contract and the root rule | Task 1 | covered |
| D5 the `openspec-tasks.md` `:71-84` replacement in the validate block's form; the failure rule from `:66` | Task 2 | covered |
| D6 runner scenario `tasks` and cases (a)–(e), including PWNED in the fixture copy and in the cwd | Task 3 | covered |
| Verification (1)–(5) with current output; consumer grep | header, Tasks 2–3, Research Findings | covered |
| `**Commit:**` header by hand (R66); Files = the four W8.28 code files | header, Architecture | covered |
| Plan readings, Must not touch, Guardrails, the Write/Edit sentence in every task | all | covered |

**Verdict:** …Ready for archive (with noted improvements).

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
