# Fence-aware Task and Files Parsing Implementation Plan

**Commit:** `fix(#9410): plan, ship - fence-aware task and files parsing`
**Goal:**
- Make ship's task list skip `### Task N:` lines inside fenced code blocks (#9409).
- Make `parseFilesEntries` skip `- Create|Modify|Test:` lines inside fenced code blocks (#9409).
- Prove each fix with an exec test case that fails at HEAD.
**Architecture:** Both parsers reuse plan-parse's existing fence walk (`walkLines`, through `extractTasksRaw` for task headings). No new fence regex. Underlying problem: two plan-text scanners read raw plan text, so sample plans shown inside code fences look like real tasks and real Files entries.
**Source:** conversation context (todo item #9409, ledger F-118)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "#9409"`

---

## Context

**What problem does this change solve?**

Plans often show a sample plan inside a code fence (a block between triple backticks). Two parsers ignore fences:

- `parsePlanTasks` in `plugins/sdlc-utilities/scripts/lib/ship-todos.js` builds ship's todo list. It reads every `### Task N:` line, fenced or not.
- `parseFilesEntries` in `plugins/sdlc-utilities/scripts/lib/plan-parse.js` reads every `- Create:`, `- Modify:` or `- Test:` line in a task body, fenced or not.

So ship shows phantom tasks, and plan checks see phantom file paths.

**What prompted this change now?**

The w28 plan (`docs/plans/2026-11-18-lean-w28-u3-rename-candidate.md`) shows fixture plans in fences. Checked at HEAD 0004980:

- `parsePlanTasks` returns tasks `[1, 2, 1, 2, 1]` (5 tasks). `extractTasks`, `extractTasksRaw` and `parsePlan` all return `[1, 2]`. Ship's todo list shows 3 phantom tasks. Item 1 reproduces.
- The w28 planner had to move fenced fixture plans out of the task block because their `- Modify:` lines were read as Files entries. Item 2 reproduces on a scratch plan: g17-prepare's `planPaths` (via `extractTasksRaw`, fences kept) lists a column-0 fenced `- Modify:` path. The validator's PF13 lists an indented fenced `- Modify:` path, because `stripFences` only removes fences that start at column 0.

**What does success look like?**

- Ship's todo list for the w28 plan has exactly 2 tasks.
- A fenced `- Modify:` line never reaches PF12, PF13, the G17 plan paths, the copy-rule check, ship's stage scope or plan-critique's Files key.
- Three new exec cases pass. Each one fails at HEAD.

**Non-goals (intentionally not built):**

- No change to plan-format rules (PF ids) or G17 rules beyond the fence handling.
- No `~~~` (tilde) fence support: no parser handles it today, and plans use backtick fences.
- No change to `checkPF7` or to `stripFences` (validator rules stay as they are).
- No orchestration-skill change, no spec or skill-doc edit, no behavioural or headless promptfoo run.

**Who fails if this ships wrong?** Ship runs (wrong todo list, wrong `verify-completeness` task set via `ship.js` `readPlanTasks`), and plan-sdlc critique (wrong PF13 and G17 results). The blast radius is plugin users who write plans with fenced samples.

## Research Findings

Exploration used the discovery brief (3 dimensions, 24 findings) plus direct runs at HEAD.

**Task headings.**

- `parsePlanTasks` (`ship-todos.js:56-63`) runs `/^### Task (\d+): (.+)$/gm` over raw text (F-ship-todos-task-heading-fence-skip-1).
- Its callers are `ship-todos.js:387` and `:409` (the `--event execute` CLI path) and `skill/ship.js:1810` (`readPlanTasks`).
- `extractTasksRaw` (`plan-parse.js:215-228`) is exported, already fence-aware through `walkLines`, and normalises CRLF line ends (F-ship-todos-task-heading-fence-skip-2).
- `walkLines` handles indented fences. `stripFences` handles only column-0 fences (F-ship-todos-task-heading-fence-skip-3).
- `ship-todos.js` requires only `fs` and `path`. `plan-parse.js` has no top-level requires, so `require('./plan-parse')` adds no cycle (F-ship-todos-task-heading-fence-skip-4).

**Files entries.**

- `parseFilesEntries` (`plan-parse.js:241-251`) is one multiline regex with no fence check (F-plan-files-entries-fence-callers-1).
- Callers that pass raw text (fences kept): `plan-critique.js:101` (`filesKey`) and `:391` (G17 plan paths) (F-plan-files-entries-fence-callers-3).
- Callers that pass `extractTasks` bodies (column-0 fences already stripped): `validate-plan-format.js:514-516` (PF12, PF13), `planFilesPaths` (`plan-parse.js:313`, used by copy rules and `received-review.js:294`), and `ship.js:1455` and `:1478` (F-plan-files-entries-fence-callers-2, -5).
- The brief says a validator case cannot fail at HEAD (F-plan-files-entries-fence-callers-4). A scratch run disproves that for indented fences: an indented fenced `- Modify: \`missing/indented.js\`` fails PF13 at HEAD. Task 1's validator case uses an indented fence for that reason.

**Other scanners checked.**

- `parsePlan`, `extractTasksRaw`, `taskSection`, `sectionBody` and `labelBlock` already use `walkLines`.
- `checkPF7` (`validate-plan-format.js:413-419`) tests `^[-*]\s+(Create|Modify|Test):` on stripped bodies. It only decides whether a task needs a Contract. It is a PF rule, so it stays as is (out of scope).
- `plan-critique.js` `labelLines` has its own fence tracking.

**Tests.**

- Exec datasets `ship-todos-exec.yaml`, `plan-format-exec.yaml` and `plan-prepare-exec.yaml` are all registered in `tests/promptfoo/promptfooconfig-exec.yaml` (F-fence-exec-promptfoo-case-patterns-9).
- Case shape precedents: `ship-todos-exec.yaml:7-31`, `plan-format-exec.yaml:575-582`, `plan-prepare-exec.yaml:799-811` (F-fence-exec-promptfoo-case-patterns-1, -4, -7).
- No test counts dataset cases, so no count or floor check changes (F-104 checked).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Spec text | no | no spec edit; tasks cite the existing ids R-SHIPTODOS-FAILLOUD (ship-sdlc), PF12, PF13, PF15, R31 and R71(d) (plan-sdlc) | A line inside a code fence is not a heading or a Files entry, so the existing contract already covers this. A spec edit would also trigger the copy rule for every companion `.md` of the skill. |
| Validator test fence | no | Task 1's validator case uses an indented fence | The validator strips column-0 fences before `parseFilesEntries` runs, so only an indented fence fails at HEAD. |
| Shared fixture | no | One fixture plan serves both Task 1 cases | It holds both fence kinds and an existing-path-free real task, so one file covers the validator and g17-prepare. |
| PR issue link | no | the PR body names #9409 and #9410 without a `Fixes`/`Closes` keyword | They are internal register ids, not GitHub issues (project notes). |
| Workspace modes | no | no state, config or path handling changes | Both functions are pure text parsers with no I/O, so `ship.workspace=branch` and `worktree` behave the same. |
| Routing | no | full pipeline, one reviewer | 7 files touched (4+ files rule); fewer than 5 tasks, so one reviewer (R36). |

## Key Decisions

- **Reuse `walkLines` over a new regex.** `parseFilesEntries` will split the body into lines, walk them with `walkLines` and match only lines outside a fence. The alternative is to call `stripFences` first. `stripFences` misses indented fences, which is exactly the case PF13 hits. `walkLines` is what `parsePlan` and `taskSection` use, so all parsers then agree.
- **`parsePlanTasks` maps `extractTasksRaw`.** It keeps its `{ n, title }` return shape, so callers do not change. The alternative is to export `walkLines` and repeat the heading loop. That duplicates `extractTasksRaw`. One small side effect: `### Task 3:Title` (no space after the colon) now counts as a task, matching every other parser.
- **Fix the shared helper once.** Fixing `parseFilesEntries` itself covers all six callers. The alternative is to fix only the raw-text callers in `plan-critique.js`. That leaves the indented-fence gap in PF13 and in ship's stage scope.
- **No spec edit.** See the Deviations table.

## Decisions taken without the owner

- No spec text change; the fix conforms to the existing ids (see Deviations).
- The validator exec case uses an indented fence, because a column-0 fence cannot fail at HEAD there.
- `checkPF7`'s own Files regex is left unchanged (PF rule, out of scope; it reads stripped bodies).
- One fixture plan under `plan-g17-u3` serves both Task 1 cases.

## Contract Examples

Code (Task 1):

```markdown
**Contract:**
- shape (code): `parseFilesEntries(body: string): Array<{ kind: 'Create'|'Modify'|'Test', path: string }>`; same return as today; lines inside a fence (per `walkLines`) are skipped.
- names: `parseFilesEntries`, `walkLines`.
- mirror: `taskSection` at `plugins/sdlc-utilities/scripts/lib/plan-parse.js:231-238`.
- decisions: walk lines; no `stripFences`; split on `/\r?\n/` so CRLF plans still match `(.+)$` without the `m` flag.
- sync: callers in `validate-plan-format.js`, `plan-critique.js`, `ship.js` and `planFilesPaths` keep their call shape.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Both source-changing tasks add exec cases that fail at HEAD; the existing ship-todos cases are re-run. |
| no-ci-bypass | error | PASS | No step skips or disables CI checks. |
| no-auto-eval | error | PASS | Only exec-only configs with targeted `--filter-pattern` runs; no behavioural or headless run, and no retry loops. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Both tasks map to #9409, and the non-goals list is explicit. |
| single-responsibility-tasks | warning | PASS | Task 1 delivers fence-aware parseFilesEntries; Task 2 delivers fence-aware parsePlanTasks. |
| scripts-over-llm-logic | error | PASS | The change is deterministic script parsing and adds no LLM instructions. |
| yagni | warning | PASS | Reuses the existing walkLines; no new abstraction, and no tilde-fence support. |
| cross-skill-consistency | error | PASS | The fix covers all callers in plan-sdlc, ship-sdlc and received-review, and the plan states this. |
| pr-link-github-issue | error | PASS | #9409 and #9410 are documented as internal register ids, not GitHub issues, so no closing keyword applies. |
| dry | warning | PASS | Reuses walkLines and extractTasksRaw instead of duplicating fence logic. |
| kiss | warning | PASS | Two small function-body edits. |
| spec-first | error | PASS | No SKILL.md or behaviour change; the existing spec ids already cover this and are cited. |
| project-agnostic | error | PASS | Changes are in plugin scripts, not repo-local files. |
| flag-coherence-cross-skill | error | PASS | No flags are involved. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites are touched. |
| flag-resolution-single-source | warning | PASS | No flags are involved. |
| state-premise | error | PASS | The root problem is stated in Architecture and Context. |
| smallest-viable-cut | warning | PASS | Two small tasks, and the unneeded spec, doc and PF7 changes are excluded. |
| failure-audience | warning | PASS | A 'Who fails' paragraph names ship runs and plan-sdlc critique. |
| explicit-non-goals | warning | PASS | The Non-goals section is present. |
| ambiguity-stops-and-asks | error | PASS | The walkLines-vs-stripFences choice is recorded in Key Decisions with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flags are added. |
| workspace-mode-compatibility | error | PASS | The parsers are pure text with no I/O, and the Deviations table states branch and worktree behave identically. |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts or volatile bytes are introduced. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Task 1 creates `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/fenced-files.md` and Task 2 creates `tests/promptfoo/fixtures-fs/ship-todos/plan-fenced-task.md`, both `.md` fixtures that the code-quality dimension's current triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: code-quality (B4)

**Why:** Task 2 adds `const { extractTasksRaw } = require('./plan-parse');` to `plugins/sdlc-utilities/scripts/lib/ship-todos.js`, which changes that module's dependency surface.

**Severity hint:** medium

**Patch:** Add a checklist item to confirm the new `require('./plan-parse')` in ship-todos.js adds no import cycle and no unintended coupling.

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — Add a checklist item to confirm the new `require('./plan-parse')` in ship-todos.js adds no import cycle and no unintended coupling.

### UPDATE: runtime-contract (B4)

**Why:** Task 2 makes `ship-todos.js`, which previously required only `fs` and `path`, depend on `./plan-parse`, and the change also reaches `skill/ship.js` `readPlanTasks`.

**Severity hint:** medium

**Patch:** Add a checklist item to confirm that a new intra-lib require in ship-todos.js keeps the script's runtime module surface compatible, including the `ship.js` `readPlanTasks` caller.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add a checklist item to confirm that a new intra-lib require in ship-todos.js keeps the script's runtime module surface compatible, including the `ship.js` `readPlanTasks` caller.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Tasks

### Task 1: Fence-aware parseFilesEntries

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-parse.js` — `parseFilesEntries` skips lines inside fences via `walkLines`
- Test: `tests/promptfoo/datasets/plan-format-exec.yaml`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml`
- Create: `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/fenced-files.md`

**Notes:** Findings F-plan-files-entries-fence-callers-1..5, F-fence-exec-promptfoo-case-patterns-4, -7. Implements PF12/PF13 (Files entries of the task), R31 (G17 plan paths) and R71(d) (copy check paths) in `docs/specs/plan-sdlc.md`: a line in a code fence is sample text, not a Files entry. The validator case needs an indented fence because `extractTasks` already strips column-0 fences. The g17-prepare case uses a column-0 fence because `extractTasksRaw` keeps it. Checked, no change needed: `docs/skills/plan-sdlc.md` and its site copy (no user-facing behaviour described), `checkPF7` (PF rule, out of scope).

**Acceptance criteria:**
- [ ] `parseFilesEntries` returns no entry for a `- Create|Modify|Test:` line inside a backtick fence, at column 0 or indented.
- [ ] Scanner review (requirement 3) holds: `grep -rn "Create|Modify\|### Task" plugins/sdlc-utilities/scripts --include=*.js` shows no Files-entry or task-heading parser outside `plan-parse.js` and `ship-todos.js` other than `checkPF7` (out of scope, see Research Findings).
- [ ] Return shape and path normalisation (backtick path, `:N-M` suffix removal) are unchanged for lines outside fences.
- [ ] Case "plan-format-lean: (d) PF13 ignores fenced Files entries (#9409)" passes, and fails at HEAD (PF13 names `missing/indented.js`).
- [ ] Case "plan-g17: planPaths ignore fenced Files entries (#9409)" passes, and fails at HEAD (`planPaths` holds `missing/fenced.js`).
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fenced Files entries"`
- [ ] Regression run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-format|plan-g17|plan-copy|plan-merge"`

**Contract:**
- shape (code): `parseFilesEntries(body)` keeps its signature and `[{ kind, path }]` return. Body before → after:

  ```diff
   function parseFilesEntries(body) {
     const entries = [];
  -  const re = /^\s*[-*]\s+(Create|Modify|Test):\s+(.+)$/gm;
  -  let m;
  -  while ((m = re.exec(body)) !== null) {
  +  walkLines(String(body).split(/\r?\n/), (line, _i, inFence) => {
  +    if (inFence) return;
  +    const m = line.match(/^\s*[-*]\s+(Create|Modify|Test):\s+(.+)$/);
  +    if (!m) return;
       const tick = m[2].match(/`([^`]+)`/);
       const raw = tick ? tick[1] : m[2].trim().split(/\s+/)[0];
       entries.push({ kind: m[1], path: raw.replace(/:\d+(-\d+)?$/, '') });
  -  }
  +  });
     return entries;
   }
  ```
- names: `parseFilesEntries` (changed), `walkLines` (reused, stays unexported). Fixture `tests/promptfoo/fixtures-fs/plan-g17-u3/plans/fenced-files.md`. Case descriptions `plan-format-lean: (d) PF13 ignores fenced Files entries (#9409)` and `plan-g17: planPaths ignore fenced Files entries (#9409)`.
- mirror: `taskSection` at `plan-parse.js:231-238`; validator case shape at `plan-format-exec.yaml:575-582`; g17 case shape at `plan-prepare-exec.yaml:799-811`.
- decisions: one fixture holds both fence kinds; each case asserts only the check it targets; the body is split on `/\r?\n/` (reviewer note: a plain `'\n'` split would drop Files lines in CRLF plans, because `.` does not match `\r`).
- sync: header comments of both datasets name the new fixture.

  `tests/promptfoo/datasets/plan-prepare-exec.yaml`, fixture list:

  ```diff
  -#   fixtures-fs/plan-g17-u3          - one dimension and two plans (no rename, directory rename) for the plan-g17: U3 cases
  +#   fixtures-fs/plan-g17-u3          - one dimension and three plans (no rename, directory rename, fenced-files) for the
  +#                                      plan-g17: U3 cases and the fenced Files entries case (#9409)
  ```

  `tests/promptfoo/datasets/plan-format-exec.yaml`, end of the fixture list:

  ```diff
   #   project-plan-checkbox-outside-ac          -- CORRECT: Acceptance block is prose; the only checkbox sits in the
   #                                                 Contract -> PF5 fail (a checkbox outside the block does not count)
  +#   plan-g17-u3 (plans/fenced-files.md)       -- CORRECT: Files lines inside a column-0 and an indented fence
  +#                                                 -> PF13 pass and PF15 pass (fenced lines are not Files entries, #9409)
  ```
- example: fixture `fenced-files.md`, line by line. It is rendered as a table, not a fence, because at HEAD this plan's own fenced lines would be read as Task 1's Files entries (the bug). `•` stands for a list-item dash, and `«»` stands for backticks.

  | # | Line (2-space indent written as `␣␣`) |
  |---|---|
  | 1 | `# Fenced files fixture` |
  | 2 | blank, then `**Goal:** g`, `**Architecture:** a`, `**Source:** s`, `**Verification:** v`, blank, `---`, blank |
  | 3 | `### Task 1: Real task`, blank, `**Complexity:** Standard`, `**Risk:** Low`, `**Depends on:** none`, `**Verify:** tests`, blank |
  | 4 | `**Files:**` then `• Create: «src/new/b.js»`, blank |
  | 5 | `**Notes:** samples follow.`, blank |
  | 6 | column-0 fence open «««markdown |
  | 7 | `### Task 7: Sample task`, blank, `**Files:**`, `• Modify: «missing/fenced.js» — sample` |
  | 8 | column-0 fence close «««, blank |
  | 9 | `␣␣` + fence open «««markdown |
  | 10 | `␣␣• Modify: «missing/indented.js» — sample` |
  | 11 | `␣␣` + fence close «««, blank |
  | 12 | `**Acceptance criteria:**`, `• [ ] ok`, blank, `**Contract:**`, `• shape (code): x` |

  Case asserts:

  | Case | script_args | Pass when |
  |---|---|---|
  | `plan-format-lean: (d) …` | `--project-root {{project_root}} --file {{project_root}}/plans/fenced-files.md --json --root {{project_root}}` with `project_root: "file://fixtures-fs/plan-g17-u3"` | parsed JSON (slice to last `}` as in line 582) has PF13 `pass` and PF15 `pass` |
  | `plan-g17: planPaths …` | `g17-prepare --plan {{project_root}}/plans/fenced-files.md` plus the same remaining flags as line 803 | `JSON.stringify(r.planPaths) === '["src/new/b.js"]'` |

### Task 2: Fence-aware parsePlanTasks

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/ship-todos.js` — `parsePlanTasks` maps `extractTasksRaw`; doc comment updated
- Test: `tests/promptfoo/datasets/ship-todos-exec.yaml`
- Create: `tests/promptfoo/fixtures-fs/ship-todos/plan-fenced-task.md`

**Notes:** Findings F-ship-todos-task-heading-fence-skip-1..5, F-fence-exec-promptfoo-case-patterns-1. Implements R-SHIPTODOS-FAILLOUD in `docs/specs/ship-sdlc.md` ("`### Task N:` headings"): a fenced line is not a heading. `extractTasksRaw` already skips fences and is what execute's parser agrees with (PF15), so ship's todo list and execute's task set now match. Also fixes `ship.js` `readPlanTasks` (line 1810), which calls the same function. Checked, no change needed: `docs/skills/ship-sdlc.md`, its site copy and `site/src/data/skills-meta.ts` (none describe the parse).

**Acceptance criteria:**
- [ ] `parsePlanTasks` returns `{ n, title }` only for `### Task N:` headings outside fences.
- [ ] On `docs/plans/2026-11-18-lean-w28-u3-rename-candidate.md` it returns tasks 1 and 2 only.
- [ ] Case "ship-todos: --event execute skips a fenced task heading (#9409)" passes, and fails at HEAD (phantom `Task 3: Phantom` substep).
- [ ] The three existing `ship-todos-exec.yaml` cases still pass.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fenced task heading"`
- [ ] Regression run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-todos"`

**Contract:**
- shape (code): signature and return unchanged. Body before → after:

  ```diff
  +const { extractTasksRaw } = require('./plan-parse');
   …
   function parsePlanTasks(markdown) {
  -  const re = /^### Task (\d+): (.+)$/gm;
  -  const tasks = [];
  -  let m;
  -  while ((m = re.exec(markdown)) !== null) {
  -    tasks.push({ n: Number(m[1]), title: m[2].trim() });
  -  }
  -  return tasks;
  +  return extractTasksRaw(markdown).map(t => ({ n: t.number, title: t.title }));
   }
  ```
  Doc comment above it:

  ```diff
   /**
    * Parse plan markdown and extract task titles.
  - * Pattern: /^### Task (\d+): (.+)$/m (global)
  + * Headings inside fenced code blocks are skipped (plan-parse extractTasksRaw).
    * Returns array of { n, title } objects.
    */
  ```
- names: `parsePlanTasks`, `extractTasksRaw`. Fixture `tests/promptfoo/fixtures-fs/ship-todos/plan-fenced-task.md`. Case description `ship-todos: --event execute skips a fenced task heading (#9409)`.
- mirror: case (a) at `ship-todos-exec.yaml:7-31` (same `script_path`, `state-pre-execute.json`, `--event execute --current-step execute --plan`).
- decisions: reuse `extractTasksRaw` (see Key Decisions).
- sync: header "Covers" list of `tests/promptfoo/datasets/ship-todos-exec.yaml`:

  ```diff
   #         (c) --event commit without --plan succeeds (regression guard).
  +#         (d) --event execute skips a task heading inside a fenced code block (#9409).
  ```
- sync: `skill/ship.js:48` imports `parsePlanTasks`; its call shape is unchanged.
- example: fixture `plan-fenced-task.md`, line by line (a table, not a fence, so this plan's own parsers at HEAD do not read the sample heading; `«»` stands for backticks):

  | # | Line |
  |---|---|
  | 1 | `# Fenced task fixture`, blank, `**Goal:** Fixture for the fenced-heading case.`, blank, `---`, blank |
  | 2 | `### Task 1: Foo`, blank, `**Complexity:** Trivial`, `**Risk:** Low`, blank, `Description of task foo.`, blank |
  | 3 | column-0 fence open «««markdown |
  | 4 | `### Task 3: Phantom` |
  | 5 | column-0 fence close «««, blank |
  | 6 | `### Task 2: Bar`, blank, `**Complexity:** Trivial`, `**Risk:** Low`, blank, `Description of task bar.` |

  Assert (javascript, `JSON.parse(output)` as in case (a)):

  | Check | Pass when |
  |---|---|
  | task substeps | exactly 2 todos whose `content` matches `/Task \d+:/`: `Task 1: Foo` and `Task 2: Bar` |
  | phantom | no todo `content` includes `Phantom` |

## Final Shape

- `plan-parse.js` has one fence rule for task headings and Files entries: `walkLines`.
- Ship's todo list, execute's task set and the validator agree on which tasks a plan has.
- PF12, PF13, the G17 plan paths, the copy-rule check, ship's stage scope and plan-critique's Files key all ignore fenced sample lines, at column 0 or indented.
- Three new exec cases, tagged `#9409`, guard both fixes.
- No change to PF or G17 rules, specs, skills or docs.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 1 | 0 | 0 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 ship-todos.js parsePlanTasks skips fenced `### Task N:` headings, reusing plan-parse's fence handling | Task 2 | covered |
| 2 plan-parse.js parseFilesEntries skips fenced Files lines, reusing walkLines | Task 1 | covered |
| 3 Check planFilesPaths and other plan-text scanners; fix only those that read task headings or Files entries | Task 1 | covered |
| 4 Exec promptfoo case for ship-todos with a fenced sample task; must fail at HEAD | Task 2 | covered |
| 5 Exec promptfoo case for parseFilesEntries through validate-plan-format or plan.js with a fenced `- Modify:` line; must fail at HEAD | Task 1 | covered |
| 6 Out of scope: PF/G17 rule changes beyond fence handling; orchestration-skill changes; behavioural/headless runs | — | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
