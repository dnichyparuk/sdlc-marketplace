# Headless Runner Fixes and Explicit Skill Flags Implementation Plan

**Commit:** `fix(#9389): headless, ship, github, jira - snapshot args, flag lists`
**Goal:** Make the owner-run headless suite diagnosable and correct, stop ship's dry run from deleting its prepare output, and keep request text out of the Bash calls of github-sdlc and jira-sdlc.
**Architecture:** The headless provider accepts `snapshot_files` as a JSON string (promptfoo expands array vars) and records short tool-result and final-result text; every headless assertion returns a GradingResult object. The ship dry-run companion gains a keep-the-manifest rule (R15). github-sdlc and jira-sdlc take only an explicit flag allow list from `$ARGUMENTS` into `<FLAGS>` (spec A14/C21 and A6/C16), with static exec cases and a `github.js` tripwire message.
**Source:** conversation context (wave brief for #9389; discovery brief from plan-explore)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- The owner ran the headless suite (eval-SWb-2026-11-14T15:02:33) and 13 of 15 cases failed.
- The headless suite is a set of real `claude -p` sessions that the owner runs by hand against throwaway repositories.
- Most failures come from the test harness, not from the plugin:
  - promptfoo (the test runner) turns any list-valued test variable into one test per list item. So the `snapshot_files` list became single strings, and the provider read nothing back. Every content check then saw empty text.
  - promptfoo 0.123.1 rejects a plain string returned by a failing check. It wants a GradingResult object (`{ pass, score, reason }`).
  - The provider keeps no tool output and no final session text, so a failed run cannot be diagnosed.
- Two plugin problems were found too:
  - ship's dry run deleted its own prepare output. The model copied the plan-mode cleanup step.
  - github-sdlc and jira-sdlc pasted `$ARGUMENTS` (everything the user typed) into Bash calls. Request words such as `show issue 7` then reached the script as arguments.

**What prompted this change now?**

- The failed headless run, analysed by an isolated architect (ledger F-94, F-95, F-96).
- A second isolated architect chose the flag allow-list design for item 5. It was accepted under owner delegation.

**What does success look like?**

- The headless provider reads the files each case names, and the datasets pass them in a form promptfoo does not split.
- Every failing headless check returns a GradingResult object with a readable reason.
- A failing headless run shows the tail of each tool result and the session's final text.
- The ship dry-run text tells the model to keep the prepare output file.
- No Bash call in github-sdlc or jira-sdlc holds `$ARGUMENTS`; only listed flags reach the scripts.

## Research Findings

All five items were checked again at HEAD `cd42bb7`. All five still apply. Paths: P = `plugins/sdlc-utilities`, T = `tests/promptfoo`.

**Item 1 — snapshot_files (F-headless-provider-snapshot-and-stream-1, -5, -6).**

- `T/providers/headless-case.js:142` reads `const snapshotFiles = vars.snapshot_files || [];` raw. Line 192 passes it to `snapshotContents` (`:120-127`), which loops `for (const name of names)`. A string loops over its characters.
- The YAML list form sits in nine places: `T/datasets/headless-cheap.yaml:12, 37, 71, 96, 120` and `T/datasets/headless-costly.yaml:13, 37, 73, 103`. Two of them are `[]` (an empty list). promptfoo may expand an empty list into zero tests, so those two become `'[]'` too.
- `parseScriptEnv` (`:65-72`) is the model: a string is parsed as JSON.
- The stub harness `T/scripts/run-headless-case-stub.js:47-54` calls the provider with `snapshot_files: ['README.md']`, an array. The array form must keep working.

**Item 2 — GradingResult (F-headless-assertion-gradingresult-1 to -5).**

- All four files that match `T/datasets/headless-*.yaml` return plain strings on failure: `headless-cheap.yaml` (15 checks), `headless-costly.yaml` (13), `headless-github.yaml` (16) and `headless-runner-exec.yaml` (11).
- `headless-github.yaml` is not named in items 1 and 3, but it matches the item 2 glob. It is in scope for item 2 only.
- No dataset in the repository returns a GradingResult object yet (`grep "pass: false, score: 0"` finds nothing).

**Item 3 — diagnostics (F-headless-provider-snapshot-and-stream-3, -4, -7, -8).**

- `parseStream` (`headless-case.js:74-103`) keeps only `isError` from a `tool_result` and drops `item.content`. The content is a string or an array of `{ type: 'text', text }` blocks.
- The `result` event is kept whole, but its `result` text is never put in the output document (`:182-194`).
- The stub `claude` in `T/fixtures-fs/stub-bin-claude` emits `"hi"` and `"done"`: too short to test truncation. `tests/promptfoo/fixtures*` is out of scope (wave 21 changes it). So the new exec cases use a stub `claude` that the harness writes itself, as the `provider-env` scenario does (`run-headless-case-stub.js:66-96`).

**Item 4 — ship dry run (F-ship-dry-run-prepare-output-1 to -8).**

- No script and no skill text deletes `PREPARE_OUTPUT_FILE` on a dry run. The deletion is model behaviour: the only prepare-output `rm` in the skill is the plan-mode step `P/skills/ship-sdlc/SKILL.md:36` (`rm -f '<PLAN_MODE_OUTPUT_FILE>'`), and the model copied it.
- The dry-run section `P/skills/ship-sdlc/entry-modes.md:46-64` says nothing about the file. So the fix is a new written rule, not a code fix.
- Spec `docs/specs/ship-sdlc.md:32` (R15) already says "the prepare output file is still written". R15 is amended first. Its acceptance names the `ship-prepare (R15)` exec cases in `T/datasets/ship-prepare-exec.yaml:937, 954`, so the new static case goes there with the same prefix.

**Item 5 — flag allow list (F-github-jira-flag-allowlist-1 to -14).**

- `$ARGUMENTS` appears in Bash calls at `P/skills/github-sdlc/SKILL.md:38, 61, 70` and `P/skills/jira-sdlc/SKILL.md:72`. Rule prose sits at `github-sdlc/SKILL.md:35` and the value-quoting line at `:24`.
- `jira.js` treats `--output-file` as a plain switch (`P/scripts/skill/jira.js:239-240`), so `jira.js --output-file <FLAGS> --check` is safe. `github.js` takes the token after `--output-file` as a path (`P/scripts/skill/github.js:229-233`), so `--output-file` stays last there.
- `github.js --check show issue 7` already exits 1 with `show: unknown flag` (the `default:` arm of `parseArgs`). The new exec case pins this tripwire.
- Next free spec ids: `docs/specs/github-sdlc.md` A14 (A13 is last) and C21 (C20 is last); `docs/specs/jira-sdlc.md` A6 and C16. jira has no C14; that gap is never reused.
- `EXPLICIT_FLAG_SKILLS` (`.claude/skills/validate-plugin-consistency/check-consistency.js:191`) only exempts a skill from the `skill-passes-arguments` warning (`:489-502`). It adds no positive check. The exempt list is also written in `.claude/skills/validate-plugin-consistency/SKILL.md:79`.
- Every case in `T/datasets/github-sdlc-exec.yaml` must set the stub bin, a home and offline links (the C17 dataset check, `:4-7`, `:1008-1018`). The static `-e` cases at `:931-945` show how.
- The static SKILL.md text check pattern is `T/datasets/commit-prepare-exec.yaml:769-776`: `script_path: "-e"` with a node one-liner that counts needles.
- Site copies under `site/src/content-source/` are byte copies of `docs/`; all five touched copies match today (`cmp`).

**Build and test commands.**

- Targeted exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Main-session validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --root . --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.
- The headless config `T/promptfooconfig-headless.yaml` is never run by an agent.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item 2 scope | no | converts `headless-github.yaml` and `headless-runner-exec.yaml` too | both match the `headless-*.yaml` glob the item names (F-headless-assertion-gradingresult-1, -2) |
| Empty `snapshot_files` | no | writes `'[]'` for the two empty lists | an empty list var can also be expanded by promptfoo; one form for all nine sites |
| Item 3 exec stub | no | adds a `provider-stream` scenario that writes its own stub `claude` | the shared stub output is too short to test truncation, and `fixtures*` is out of scope |
| Item 4 premise | no | adds a written keep rule; no script change | no script deletes the file; the deletion is the model copying the plan-mode `rm` (F-ship-dry-run-prepare-output-1, -2) |
| Item 4 test | no | adds a static text case to `ship-prepare-exec.yaml` | R15's acceptance names the `ship-prepare (R15)` cases there |
| Optional `github.js` message | no | takes it (one changed line in the `default:` arm) | the brief allows it when it stays one line |
| jira.js tripwire | no | none | jira.js ignores unknown tokens; its argument parsing is out of scope (followup) |
| Check-only copy entries | no | Tasks 3, 5, 6 and 7 list skill directories, the ship user doc and its site copy, and `skills-meta.ts` with no edit expected | `plan.copyRules` requires them in a task once a skill's spec or SKILL.md changes |
| Headless datasets verification | no | review only | the headless suite is owner-run; a YAML parse via `npx js-yaml` was refused by the sandbox during planning |

## Decisions taken without the owner

No user was available, so plan-sdlc ran with `--auto` and took the recommended option each time:

- `headless-github.yaml` and `headless-runner-exec.yaml` are in item 2's scope (they match its glob).
- The two empty `snapshot_files` lists become `'[]'`.
- A `[`-prefixed `snapshot_files` string must be a JSON array of strings; any other string is one file name (KD1); a bad value is a provider error (KD2).
- Tails of 300 and 1000 characters (KD3).
- Item 3's exec case uses a harness-written stub `claude` (fixtures are out of scope).
- Item 4 is a written keep rule plus an R15 amendment; no script changes.
- The optional `github.js` unexpected-argument message is taken.
- Site copies are made with `cp`, not the generator the discovery brief suggested (KD8).
- Copy-rule entries with no edit expected are listed as check-only.

## Key Decisions

- **KD1 — Plain non-JSON string is a one-item list; a string that starts with `[` must be a JSON array of strings.**
  - Alternative: try `JSON.parse` on every string.
  - Why: a file named `5` or `true` would parse as a number or a boolean. Checking only the `[` start keeps file names safe and still catches broken JSON lists as an error.

- **KD2 — Bad `snapshot_files` returns `{ error: 'headless-case: invalid snapshot_files: ...' }`.**
  - Alternative: ignore it silently.
  - Why: it mirrors the `script_env` error path (`headless-case.js:145-151`), so a broken case is visible.

- **KD3 — Keep the last 300 characters of each tool result and the last 1000 of the final result text.**
  - Alternative: the first characters.
  - Why: errors and conclusions sit at the end of output. `stderrTail` already keeps the tail.

- **KD4 — No environment value enters the output document.**
  - The new fields hold only text the session printed. The new exec case sets a secret-like value in `script_env` and checks that it appears nowhere in the output.

- **KD5 — One `fail` helper per check: `const fail = (reason) => ({ pass: false, score: 0, reason });`.**
  - Alternative: write the object out at each return.
  - Why: each check stays self-contained (the datasets share no helper file), and the verdict logic does not change.

- **KD6 — Flags take the allow-list form the architect chose (ARCHITECT-ACCEPTED).**
  - Alternative: keep forwarding `$ARGUMENTS`.
  - Why: request text then never reaches a command line. Content reaches a script only through a file the Write tool writes (github C14, A13).

- **KD7 — Threat model of the allow-list rule (F-73).**
  - It is a best-effort rule in skill prose that the model follows. It stops request words and quoted bodies from reaching a command line.
  - Accepted gaps: no code checks how the model splits `$ARGUMENTS`; a request word outside quotes that is exactly an allowed flag name is read as that flag; jira.js silently ignores stray tokens. `github.js` rejecting every non-flag token is the only code check. The spec invariants (C21, C16) state these gaps, so reviewers report only gaps outside the list.

- **KD8 — Site copies use `cp`, never `site/scripts/copy-docs.mjs`.**
  - The discovery brief suggested re-running the generator. The project note forbids it because it copies the whole tree.

- **KD9 — Decisions taken without the owner.** No user was available; see `## Decisions taken without the owner`.

- **KD10 — Non-goals, smallest cut and who is hurt by a bad ship.**
  - Not built: the `$ARGUMENTS` rule for other skills, `jira.js` argument parsing (including `--force-refresh`), any change under `tests/promptfoo/fixtures*`, `fixture-guard-exec.yaml` or `check-fixture-refs.js`, and any headless or behavioural run.
  - Smallest cut: Tasks 1 to 6 carry the five items. Task 7 keeps the consistency validator's exempt list true, and Task 8 is the user-doc line the brief asks for; both are one-line edits.
  - Who fails if this ships wrong: the owner's headless suite (wrong verdicts or unreadable failures), ship users on `--dry-run`, and github-sdlc and jira-sdlc users whose flags would be dropped or whose request would reach a command line.

## Contract Examples

**code** (Task 1):

```markdown
**Contract:**
- shape (code): `parseSnapshotFiles(value): string[]`; throws `Error('snapshot_files must be a JSON array of strings')`.
- names: `parseSnapshotFiles`, `RESULT_TAIL`, `RESULT_TEXT`, doc fields `resultText`, `toolUses[].resultTail`.
- mirror: `parseScriptEnv` at `tests/promptfoo/providers/headless-case.js:65-72`.
- decisions: `[`-prefixed strings parse as JSON; other strings are one item.
- sync: `tests/promptfoo/README.md` output-field table.
```

**docs** (Task 8):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/github-sdlc.md` `## Usage`: one line after the usage block.
- names: no new heading.
- mirror: the `## Usage` section at `docs/skills/github-sdlc.md:11-17`.
- decisions: user-facing words only.
- sync: `site/src/content-source/skills/github-sdlc.md` byte copy.
```

**openspec** (Task 4):

```markdown
**Contract:**
- shape (openspec): ADD `A14` after A13 and `C21` after C20 in `docs/specs/github-sdlc.md`.
- names: `A14`, `C21`.
- mirror: `A13` at `docs/specs/github-sdlc.md:34-35`.
- decisions: next free ids; no renumbering.
- sync: `site/src/content-source/specs/github-sdlc.md`.
```

## Tasks

Two execute waves: Tasks 1, 2, 3, 4, 7 and 8 have no dependencies; Tasks 5 and 6 need Task 4.

### Task 1: Headless provider reads snapshot_files strings and records result text

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/headless-case.js` — parse `snapshot_files` strings; record `resultTail` per tool use and `resultText`
- Modify: `tests/promptfoo/scripts/run-headless-case-stub.js` — new `provider-stream` scenario with its own stub `claude`
- Modify: `tests/promptfoo/README.md` — output-field table and the `snapshot_files` forms
- Test: `tests/promptfoo/datasets/headless-runner-exec.yaml` — cases (i) to (l); existing checks return GradingResult objects

**Notes:**
Implements items 1 and 3 (F-headless-provider-snapshot-and-stream-1 to -9) and item 2 for this one dataset (F-headless-assertion-gradingresult-1). The array form stays for direct calls such as the existing `provider` scenario. The new scenario writes its own stub because `tests/promptfoo/fixtures*` is out of scope.

**Acceptance criteria:**
- [ ] `snapshot_files` as `'["README.md",".git/HEAD"]'` reads both files into `contents`; as `'README.md'` reads that one file; as an array still works; as `'[oops'` returns `{ error }` starting `headless-case: invalid snapshot_files`.
- [ ] Each tool use carries `resultTail` (last 300 characters of its result text, `null` until a result arrives); text blocks in an array are joined with `\n`.
- [ ] The document carries `resultText`: the last 1000 characters of the `result` event's `result` string, or `null`.
- [ ] A `script_env` value set by the exec case appears nowhere in the provider output.
- [ ] Every javascript check in `headless-runner-exec.yaml` returns `true` or `{ pass: false, score: 0, reason }`; the verdict expressions are unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'headless-runner'` passes.

**Contract:**
- shape (code): in `headless-case.js`:
  ```js
  const RESULT_TAIL = 300;   // chars kept from each tool result
  const RESULT_TEXT = 1000;  // chars kept from the final result text
  // snapshot_files: array, or a string. A string starting with '[' (after trim) must be a JSON
  // array of strings; any other non-empty string is a one-item list. Throws on bad input.
  function parseSnapshotFiles(value) { … }   // returns string[]
  function toolResultText(content) { … }      // string → itself; array → text blocks joined '\n'; else ''
  ```
  `callApi` change (anchored on the current lines):
  ```diff
  -    const snapshotFiles = vars.snapshot_files || [];
  +    let snapshotFiles = [];
  +    try {
  +      snapshotFiles = parseSnapshotFiles(vars.snapshot_files);
  +    } catch (err) {
  +      return { error: `headless-case: invalid snapshot_files: ${err.message}` };
  +    }
  ```
  `parseStream` change:
  ```diff
  -          toolUses.push({ id: item.id, name: item.name, input: item.input, isError: null });
  +          toolUses.push({ id: item.id, name: item.name, input: item.input, isError: null, resultTail: null });
  ...
  -        if (use) use.isError = item.is_error === true;
  +        if (use) {
  +          use.isError = item.is_error === true;
  +          use.resultTail = toolResultText(item.content).slice(-RESULT_TAIL);
  +        }
  ```
  Output document field diff:
  ```diff
    { "workspace": …, "exitCode": …, "resultSubtype": …,
      "toolUses": [{ "id", "name", "input", "isError",
  +                  "resultTail": "<last 300 chars> | null" }],
  +   "resultText": "<last 1000 chars of result.result> | null",
      "files": […], "contents": {…}, "stderrTail": "…" }
  ```
  Header comment line 13 documents both forms of `snapshot_files`.
- names: `parseSnapshotFiles`, `toolResultText`, `RESULT_TAIL`, `RESULT_TEXT`, `resultTail`, `resultText`; scenario `provider-stream` with `--variant <stream|snap-json|snap-plain|snap-bad>`.
- mirror: `parseScriptEnv` and its error return at `tests/promptfoo/providers/headless-case.js:65-72, 145-151`; scenario `provider-env` at `tests/promptfoo/scripts/run-headless-case-stub.js:64-96`; exec cases (f) to (h) at `tests/promptfoo/datasets/headless-runner-exec.yaml:131-163`.
- decisions: KD1 to KD4 and KD5 (the `fail` helper).
- sync: README table rows `toolUses` and new `resultText`; the usage comment of `run-headless-case-stub.js` (lines 3-5).
- example: `provider-stream` stub output and expected result:

  | Variant | `snapshot_files` var | Expected |
  |---|---|---|
  | `stream` | `'["README.md"]'` | `toolUses[0].resultTail` is 300 chars ending `END1`; `toolUses[1].resultTail === 'short'`; `resultText` is 1000 chars ending `FINAL`; output does not contain `stub-secret-9389` |
  | `snap-json` | `'["README.md",".git/HEAD"]'` | `contents` has both keys |
  | `snap-plain` | `'README.md'` | `contents` has exactly `README.md` |
  | `snap-bad` | `'[oops'` | `error` starts `headless-case: invalid snapshot_files`; stub not run |

  The stub `claude` (written to `D/bin/claude` like `provider-env`) prints, after stdin ends: an assistant `tool_use` t1, a user `tool_result` t1 with `content: [{ type: 'text', text: 'x'.repeat(500) + 'END1' }]`, an assistant `tool_use` t2, a user `tool_result` t2 with `content: 'short'`, and `{ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, result: 'y'.repeat(1500) + 'FINAL' }`. The case passes `script_env: JSON.stringify({ STUB_SECRET: 'stub-secret-9389' })` and `stub_bin: D/bin`; the harness prints `{ error, result }`.

### Task 2: Headless datasets pass snapshot_files as JSON strings and return GradingResult objects

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/headless-cheap.yaml` — five `snapshot_files` to JSON strings; GradingResult failures
- Modify: `tests/promptfoo/datasets/headless-costly.yaml` — four `snapshot_files` to JSON strings; GradingResult failures
- Modify: `tests/promptfoo/datasets/headless-github.yaml` — GradingResult failures

**Notes:**
Implements items 1 and 2 for the owner-run datasets (F-headless-provider-snapshot-and-stream-5, F-headless-assertion-gradingresult-2 to -5). These run only in the credentialed headless suite, so they are verified by review. Task 1 makes the provider accept the string form; the files are disjoint, so the tasks run in the same wave.

**Acceptance criteria:**
- [ ] All nine `snapshot_files` values are single-quoted JSON strings with the same file names in the same order (`'[]'` for the two empty ones); no YAML list form is left (`grep -n "snapshot_files: \[" tests/promptfoo/datasets/headless-*.yaml` finds nothing).
- [ ] Every failing return in a javascript check is `fail(<same text>)`, with `const fail = (reason) => ({ pass: false, score: 0, reason });` as the first line of that check; success returns stay `true`.
- [ ] No condition, regex or message text changes (review the diff: only the return wrappers, the helper line and the nine var lines change).
- [ ] `grep -cE "(return|\?|:) .FAIL" tests/promptfoo/datasets/headless-cheap.yaml tests/promptfoo/datasets/headless-costly.yaml tests/promptfoo/datasets/headless-github.yaml` prints 0 for each file (no bare string failure is left; `.` stands for the opening quote or backtick).

**Contract:**
- shape (code): var line change at each of the nine sites, for example:
  ```diff
  -    snapshot_files: [".git/logs/HEAD", ".git/COMMIT_EDITMSG"]
  +    snapshot_files: '[".git/logs/HEAD", ".git/COMMIT_EDITMSG"]'
  ```
  Check body change, for example `headless-cheap.yaml` commit-auto:
  ```diff
         value: |
  +        const fail = (reason) => ({ pass: false, score: 0, reason });
           const o = JSON.parse(output);
  -        if (o.isError) return `FAIL: run error ${o.resultSubtype} exit ${o.exitCode}`;
  +        if (o.isError) return fail(`FAIL: run error ${o.resultSubtype} exit ${o.exitCode}`);
           const n = …;
  -        return n === 1 ? true : `FAIL: expected exactly one new commit, found ${n}`;
  +        return n === 1 ? true : fail(`FAIL: expected exactly one new commit, found ${n}`);
  ```
  A ternary whose failing arm is first (`cond ? 'FAIL: …' : true`) becomes `cond ? fail('FAIL: …') : true`.
- names: helper `fail`.
- mirror: none in the repository (no dataset returns a GradingResult yet); the shape is promptfoo's GradingResult `{ pass, score, reason }`.
- decisions: KD5; `'[]'` for empty lists (Deviations row 2).
- sync: Task 1 provider string parsing.

### Task 3: Ship dry run keeps its prepare output

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend R15
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — keep rule in the Dry-run section
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — static `ship-prepare (R15)` text case
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc` — check only: the other companions state no cleanup rule, no change expected (copy rule)

**Notes:**
Implements item 4 (F-ship-dry-run-prepare-output-1, -2, -5, -8). Spec first: R15 already covers the dry run. The user doc `docs/skills/ship-sdlc.md:47` already says a dry run writes no ship state; it is silent on the prepare output, which is an internal file, so it needs no change. `site/src/data/skills-meta.ts` and the other ship companions state no cleanup rule (checked).

**Acceptance criteria:**
- [ ] R15 says the prepare output file stays in place and the dry run runs no `rm` on it; its acceptance also names the new static case.
- [ ] The Dry-run section of `entry-modes.md` holds the keep rule once, after the pipeline table.
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'ship-prepare .R15.'` passes (three cases).

**Contract:**
- shape (openspec): MODIFY R15 in `docs/specs/ship-sdlc.md`:
  ```diff
  - … keeps its bytes and its mtime (the prepare output file is still written).
  + … keeps its bytes and its mtime (the prepare output file is still written, and it stays in place: the dry run runs no `rm` on it, because prepare manifests persist).
  -  - Acceptance: exec cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml` whose descriptions start with `ship-prepare (R15)`.
  +  - Acceptance: exec cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml` whose descriptions start with `ship-prepare (R15)`, including the static case that finds the keep rule in `entry-modes.md`.
  ```
  `entry-modes.md`, new paragraph directly after the closing fence of the dry-run table:
  ```markdown
  Leave `PREPARE_OUTPUT_FILE` in place: the dry run runs no `rm` (prepare manifests persist, R15). The `rm` of the plan-mode path in SKILL.md Step 0 is for that path only.
  ```
  Static case (description `ship-prepare (R15): the dry-run section keeps PREPARE_OUTPUT_FILE and runs no rm`): `script_path: "-e"`, a node one-liner that reads `{{repo_root}}/plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md`, takes the text from `## Dry-run mode` to the end, and prints `{ keep, rm }`: the count of `Leave\x20\x60PREPARE_OUTPUT_FILE\x60\x20in\x20place` and the count of `rm\x20-` in that section. Check: `keep === 1 && rm === 0`, failing with `{ pass: false, score: 0, reason: output }`.
- names: R15 (modified); case description prefix `ship-prepare (R15):`.
- mirror: R15 cases at `tests/promptfoo/datasets/ship-prepare-exec.yaml:937-953`; `-e` text cases at `tests/promptfoo/datasets/commit-prepare-exec.yaml:769-776`.
- decisions: Deviations rows 4 and 5.
- sync: site copy of the spec.

### Task 4: Specs for the explicit flag allow list

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/github-sdlc.md` — add A14, C21 and an appendix decision row
- Modify: `site/src/content-source/specs/github-sdlc.md` — byte copy (`cp`)
- Modify: `docs/specs/jira-sdlc.md` — add A6, C16 and an appendix decision row
- Modify: `site/src/content-source/specs/jira-sdlc.md` — byte copy (`cp`)

**Notes:**
Spec first for item 5 (F-github-jira-flag-allowlist-8, -9). Ids are the next free numbers; jira's C14 gap stays unused. The threat model sits in the invariant itself (F-73).

**Acceptance criteria:**
- [ ] `docs/specs/github-sdlc.md` has A14 (after A13's acceptance) and C21 (after C20's acceptance), each with an acceptance line, and a 2026-11-14 decision row citing A14, C21.
- [ ] `docs/specs/jira-sdlc.md` has A6 (after A5) and C16 (after C15), each with an acceptance line, and a decision row citing A6, C16.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp` of both specs with their site copies exits 0.

**Contract:**
- shape (openspec): ADD to `docs/specs/github-sdlc.md` under `## Inputs and flags`:
  ```markdown
  - A14: Arguments — only `--repo <slug>`, `--force-refresh`, `--init-templates`, `--skip-projects`, `--auto`, `--templates-dir <path>` and `--clear` (A1–A6, A9) reach `skill/github.js` from the user's arguments. The skill takes them from `$ARGUMENTS` before its first Bash call: a token is a flag only when it is outside quotes and is exactly one of these names, and the value of `--repo` and `--templates-dir` is the next token. It passes them as `<FLAGS>`, each value a single-quoted literal. Every other token is the request: it stays with the model and never reaches a command line (C21). An unknown `--` token outside quotes is request text, and the skill says so: `Not a github-sdlc flag, read as request text: <token>`. `skill/github.js` reports a token that does not start with `--` as `<token>: unexpected argument (request text never goes on the command line, A14)` and exits 1 (P17).
    - Acceptance: exec — the SKILL.md has no `$ARGUMENTS` inside a bash fence, the three Step 1 calls carry `<FLAGS>`, and the allow-list rule text is present; `github.js --check show issue 7` exits 1 with an `errors[]` entry naming `show`.
  ```
  ADD under `## Invariants and constraints`:
  ```markdown
  - C21: Must not put `$ARGUMENTS` or request text into a Bash call; request content reaches the script only through a file written with the Write tool (C14, A13). Threat model: a best-effort rule in skill prose that keeps request words and quoted bodies off the command line. Accepted gaps: no code checks how the model splits `$ARGUMENTS`; a request word outside quotes that is exactly an allowed flag name is read as that flag; the `github.js` rejection of non-flag tokens (A14) is the only code check.
    - Acceptance: exec — the static SKILL.md case of A14.
  ```
  ADD to `docs/specs/jira-sdlc.md` under `## Inputs and flags`:
  ```markdown
  - A6: Arguments — only `--project <KEY>`, `--force-refresh`, `--init-templates`, `--site <host>` and `--skip-workflow-discovery` (A1–A5) reach `skill/jira.js` from the user's arguments. The skill takes them from `$ARGUMENTS` before its first Bash call: a token is a flag only when it is outside quotes and is exactly one of these names, and the value of `--project` and `--site` is the next token. It passes them as `<FLAGS>`, each value a single-quoted literal. Every other token is the request: it stays with the model and never reaches a command line (C16). An unknown `--` token outside quotes is request text, and the skill says so: `Not a jira-sdlc flag, read as request text: <token>`.
    - Acceptance: exec — the SKILL.md has no `$ARGUMENTS` inside a bash fence, the check call is `jira.js --output-file <FLAGS> --check`, and the allow-list rule text is present.
  ```
  ADD under `## Invariants and constraints`:
  ```markdown
  - C16: Must not put `$ARGUMENTS` or request text into a Bash call; request content reaches a script only through a file written with the Write tool. Threat model: a best-effort rule in skill prose that keeps request words and quoted bodies off the command line. Accepted gaps: no code checks how the model splits `$ARGUMENTS`; a request word outside quotes that is exactly an allowed flag name is read as that flag; `jira.js` ignores stray tokens (its argument parsing is a followup).
    - Acceptance: exec — the static SKILL.md case of A6.
  ```
  Appendix decision rows (github `### Decisions` table; jira gets a `### Decisions` table above `### Issue trail` with the same columns `Date | Source | Decision | Ids`):
  ```markdown
  | 2026-11-14 | architect, owner delegation (#9389, F-95) | Only an explicit flag allow list reaches the prepare script; `$ARGUMENTS` never goes into a Bash call. | A14, C21 |
  | 2026-11-14 | architect, owner delegation (#9389, F-95) | Only an explicit flag allow list reaches the prepare script; `$ARGUMENTS` never goes into a Bash call. | A6, C16 |
  ```
- names: `A14`, `C21` (github); `A6`, `C16` (jira).
- mirror: A13 at `docs/specs/github-sdlc.md:34-35`; C20 at `docs/specs/github-sdlc.md:262-263`; A5 at `docs/specs/jira-sdlc.md:14`; C15 at `docs/specs/jira-sdlc.md:168`.
- decisions: KD6 and KD7.
- sync: Tasks 5 and 6 quote the rule text; both site copies.

### Task 5: github-sdlc passes only the allowed flags

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` — allow-list rule and `<FLAGS>` in the three Step 1 calls
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — one-line message for a non-flag token
- Test: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — static SKILL.md case and the `show issue 7` case
- Modify: `plugins/sdlc-utilities/skills/github-sdlc` — check only: `write-ops.md` and `operations-reference.md` hold no `$ARGUMENTS`, no change expected (copy rule)

**Notes:**
Implements A14 and C21 (F-github-jira-flag-allowlist-1 to -4, -11 to -13). `--output-file` stays last because `github.js` reads the next token as its path. The companions `write-ops.md` and `operations-reference.md` hold no `$ARGUMENTS` (checked). Both new cases set the C17 stub vars.

**Acceptance criteria:**
- [ ] No `$ARGUMENTS` inside any bash fence of the SKILL.md; the Step 1 calls are exactly the three rendered below.
- [ ] The rule paragraph and the `<FLAGS>` exception to the quoting line are present, each once.
- [ ] `github.js --check show issue 7` exits 1 and `errors[]` holds `show: unexpected argument (request text never goes on the command line, A14)`; `--check --bogus` still reports `--bogus: unknown flag`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'github-sdlc/(skill-text|check P17|c17)'` passes.

**Contract:**
- shape (code): SKILL.md quoting line:
  ```diff
  -Every `<…>` value in a Bash call is a single-quoted literal (write a `'` inside it as `'\''`).
  +Every `<…>` value in a Bash call is a single-quoted literal (write a `'` inside it as `'\''`), except `<FLAGS>`: it holds bare flag names, and only the value after `--repo` or `--templates-dir` in it is a single-quoted literal.
  ```
  Step 1 rule, replacing the forwarding sentence:
  ```diff
  -The first Bash call of every run is the check (C9). It forwards `$ARGUMENTS` unchanged: `--init-templates` and `--clear` ride along with `--check` (A3, A6).
  +**Flags (A14, C21).** Before the first Bash call, take from `$ARGUMENTS` only these flags: `--repo <slug>`, `--force-refresh`, `--init-templates`, `--skip-projects`, `--auto`, `--templates-dir <path>`, `--clear`. The value of `--repo` and of `--templates-dir` is the next token. A token is a flag only when it is outside quotes and is exactly one of these names. Write the flags you took as `<FLAGS>`, each value a single-quoted literal (for example `--repo 'acme/widgets' --auto`); `<FLAGS>` is empty when there are none. Every other token is the request: keep it in the conversation and never put it in a Bash call (C14). For each `--` token outside quotes that is not one of these names, say `Not a github-sdlc flag, read as request text: <token>` and read it as request text.
  +
  +The first Bash call of every run is the check (C9). `--init-templates` and `--clear` in `<FLAGS>` ride along with `--check` (A3, A6).
  ```
  The three calls and the item 3 prose:
  ```diff
  -node "<PLUGIN_ROOT>/scripts/skill/github.js" --check $ARGUMENTS --output-file
  +node "<PLUGIN_ROOT>/scripts/skill/github.js" --check <FLAGS> --output-file
  -   node "<PLUGIN_ROOT>/scripts/skill/github.js" $ARGUMENTS --output-file
  +   node "<PLUGIN_ROOT>/scripts/skill/github.js" <FLAGS> --output-file
  -   Run it as one plain Bash call (the forwarded `--init-templates` selects the subcommand; `--templates-dir` (A9) is forwarded with it) …
  +   Run it as one plain Bash call (the `--init-templates` in `<FLAGS>` selects the subcommand; a `--templates-dir` (A9) in `<FLAGS>` comes with it) …
  -     node "<PLUGIN_ROOT>/scripts/skill/github.js" --check --repo '<ANSWER_SLUG>' $ARGUMENTS --output-file
  +     node "<PLUGIN_ROOT>/scripts/skill/github.js" --check --repo '<ANSWER_SLUG>' <FLAGS> --output-file
  ```
  The `<!-- implements … -->` comment of Step 1 adds `A14, C21`.
  `github.js` `parseArgs`, the `default:` arm:
  ```diff
         case '--skip-config-check': break; // read by resolveSkipConfigCheck (CLI > env > default)
  -      default: errors.push(`${a}: unknown flag`);
  +      default: errors.push(a.startsWith('--') ? `${a}: unknown flag` : `${a}: unexpected argument (request text never goes on the command line, A14)`);
       }
  ```
  Exec cases (both with `script_stub_bin: "fixtures-fs/stub-bin-gh-issues/bin"`, `script_home: "fixtures-fs/stub-bin-gh-issues"`, `script_env: '{"SDLC_LINKS_OFFLINE": "1", "GH_TOKEN": ""}'`):

  | Description | Runs | Check |
  |---|---|---|
  | `github-sdlc/skill-text A14 C21: no $ARGUMENTS in a bash fence, <FLAGS> in the Step 1 calls, the allow-list rule present` | `-e` one-liner: reads the SKILL.md, joins the bodies of the fenced blocks opened by a line starting with three backticks and `bash`, prints `{ inFence, flagsCalls, rule, notFlag }`: count of `$ARGUMENTS` in fence text, count of `<FLAGS>\x20--output-file` in the file, count of `**Flags\x20(A14,\x20C21).**`, count of `Not\x20a\x20github-sdlc\x20flag,\x20read\x20as\x20request\x20text:` | `inFence === 0 && flagsCalls === 3 && rule === 1 && notFlag === 1` |
  | `github-sdlc/check P17 A14: request words on the command line exit 1 naming show` | `run-github-case.js`, `script_args: "-- --check --repo acme/widgets show issue 7"` | `exit === 1 && calls.length === 0 && errors.some(e => e.startsWith('show: unexpected argument'))` |

  Both checks fail with `{ pass: false, score: 0, reason: output }`.
- names: `<FLAGS>`; rule heading `**Flags (A14, C21).**`; message `Not a github-sdlc flag, read as request text: <token>`; error text `<token>: unexpected argument (request text never goes on the command line, A14)`.
- mirror: P17 unknown-flag case at `tests/promptfoo/datasets/github-sdlc-exec.yaml:965-976`; `-e` case with stub vars at `tests/promptfoo/datasets/github-sdlc-exec.yaml:931-945`; explicit-flag precedent `plugins/sdlc-utilities/skills/harden-sdlc/SKILL.md:22-34`.
- decisions: KD6 and KD7; the optional script message is taken (Deviations row 6).
- sync: A14 text in Task 4.

### Task 6: jira-sdlc passes only the allowed flags

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md` — allow-list rule and `<FLAGS>` in the Script Resolution Block call
- Test: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — static SKILL.md case
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc` — check only: `REFERENCE.md`, `EXAMPLES.md`, `operations-reference.md` and `write-ops.md` hold no `$ARGUMENTS`, no change expected (copy rule)

**Notes:**
Implements A6 and C16 (F-github-jira-flag-allowlist-5, -9, -14). `jira.js` reads `--output-file` as a plain switch, so `<FLAGS>` may follow it. No jira companion file holds `$ARGUMENTS` (checked).

**Acceptance criteria:**
- [ ] No `$ARGUMENTS` inside any bash fence of the jira SKILL.md; the check call is `node "<PLUGIN_ROOT>/scripts/skill/jira.js" --output-file <FLAGS> --check`.
- [ ] The rule paragraph is present once, directly above that call.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'jira-sdlc/skill-text'` passes.

**Contract:**
- shape (code): Script Resolution Block, after the `<PLUGIN_ROOT>` note:
  New paragraph directly above the bash fence of the call:
  ```diff
  +**Flags (A6, C16).** Before the first Bash call, take from `$ARGUMENTS` only these flags: `--project <KEY>`, `--force-refresh`, `--init-templates`, `--site <host>`, `--skip-workflow-discovery`. The value of `--project` and of `--site` is the next token. A token is a flag only when it is outside quotes and is exactly one of these names. Write the flags you took as `<FLAGS>`, each value a single-quoted literal (for example `--project 'PROJ' --force-refresh`); `<FLAGS>` is empty when there are none. Every other token is the request: keep it in the conversation and never put it in a Bash call. For each `--` token outside quotes that is not one of these names, say `Not a jira-sdlc flag, read as request text: <token>` and read it as request text.
  ```
  The command line inside that fence:
  ```diff
  -node "<PLUGIN_ROOT>/scripts/skill/jira.js" --output-file $ARGUMENTS --check
  +node "<PLUGIN_ROOT>/scripts/skill/jira.js" --output-file <FLAGS> --check
  ```
  Exec case `jira-sdlc/skill-text A6 C16: no $ARGUMENTS in a bash fence, <FLAGS> in the check call, the allow-list rule present`: `script_path: "-e"`, a node one-liner that reads `{{repo_root}}/plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md`, splits it into lines, collects the lines between a line starting with three backticks followed by `bash` and the next line that is exactly three backticks, and prints `{ inFence, call, rule, notFlag }`: the count of `$ARGUMENTS` in the collected fence lines, and in the whole file the counts of `--output-file\x20<FLAGS>\x20--check`, `**Flags\x20(A6,\x20C16).**` and `Not\x20a\x20jira-sdlc\x20flag,\x20read\x20as\x20request\x20text:`. Check `inFence === 0 && call === 1 && rule === 1 && notFlag === 1`, failing with `{ pass: false, score: 0, reason: output }`.
- names: `<FLAGS>`; rule heading `**Flags (A6, C16).**`; message `Not a jira-sdlc flag, read as request text: <token>`.
- mirror: `-e` pattern at `tests/promptfoo/datasets/commit-prepare-exec.yaml:769-776`.
- decisions: KD6 and KD7.
- sync: A6 text in Task 4.

### Task 7: Consistency validator lists github-sdlc and jira-sdlc as explicit-flag skills

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — add both skills to `EXPLICIT_FLAG_SKILLS`
- Modify: `.claude/skills/validate-plugin-consistency/SKILL.md` — name both skills in the exempt list
- Modify: `docs/skills/ship-sdlc.md` — check only: says nothing about the prepare output, no change expected (copy rule)
- Modify: `site/src/content-source/skills/ship-sdlc.md` — check only, no change expected (copy rule)
- Modify: `site/src/data/skills-meta.ts` — check only: no forwarding or cleanup text for ship-sdlc, github-sdlc or jira-sdlc, no change expected (copy rule)

**Notes:**
Trivial: one changed line per edited file. F-github-jira-flag-allowlist-6. The three check-only entries satisfy `plan.copyRules` for the ship, github and jira spec changes (Tasks 3 to 6); each was read during planning and needs no edit. The list only exempts a skill from the `skill-passes-arguments` warning, so the validator stays green whether or not the prose still says `$ARGUMENTS`.

**Acceptance criteria:**
- [ ] `EXPLICIT_FLAG_SKILLS` holds `error-report-sdlc`, `github-sdlc`, `harden-sdlc`, `jira-sdlc`, `plan-sdlc`.
- [ ] The validator SKILL.md exempt sentence names the same five skills.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code):
  ```diff
  -const EXPLICIT_FLAG_SKILLS = ['error-report-sdlc', 'harden-sdlc', 'plan-sdlc'];
  +const EXPLICIT_FLAG_SKILLS = ['error-report-sdlc', 'github-sdlc', 'harden-sdlc', 'jira-sdlc', 'plan-sdlc'];
  ```
  ```diff
  -`error-report-sdlc`, `harden-sdlc` and `plan-sdlc` pass explicit flags instead and are exempt.
  +`error-report-sdlc`, `github-sdlc`, `harden-sdlc`, `jira-sdlc` and `plan-sdlc` pass explicit flags instead and are exempt.
  ```
- names: `EXPLICIT_FLAG_SKILLS`.
- mirror: `.claude/skills/validate-plugin-consistency/check-consistency.js:190-191`.
- decisions: alphabetical order, as the list is now.
- sync: the two lines above.

### Task 8: User docs say only the listed flags reach the script

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/github-sdlc.md` — one line in `## Usage`
- Modify: `site/src/content-source/skills/github-sdlc.md` — byte copy (`cp`)
- Modify: `docs/skills/jira-sdlc.md` — one line in `## Usage`
- Modify: `site/src/content-source/skills/jira-sdlc.md` — byte copy (`cp`)

**Notes:**
Trivial: four one-line edits, two of them `cp`. User-facing side of A14 and A6 (F-github-jira-flag-allowlist-10). The flag tables do not change, so `site/src/data/skills-meta.ts` needs no change (checked: it holds no forwarding text).

**Acceptance criteria:**
- [ ] Each doc has the line below once, directly after the usage code block.
- [ ] `cmp` of both docs with their site copies exits 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY both docs, `## Usage`, after the closing fence of the usage block:
  ```markdown
  Write the request in words after the flags; only the listed flags reach the script.
  ```
- names: no new heading.
- mirror: `## Usage` at `docs/skills/github-sdlc.md:11-17` and `docs/skills/jira-sdlc.md:9-15`.
- decisions: same sentence in both docs.
- sync: both site copies.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 1, 3, 5 and 6 carry promptfoo exec cases; Task 7 is a validator constant verified by running the validator |
| no-ci-bypass | error | PASS | No CI skipping or disabling |
| no-auto-eval | error | PASS | Only targeted exec-only config runs; headless suite stays owner-run |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the five wave items; extras are listed in Deviations |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | The allow-list is a deliberate architect decision with a stated threat model, and github.js adds a code tripwire |
| yagni | warning | PASS | No speculative functionality added |
| cross-skill-consistency | error | PASS | github, jira, ship, validator, docs and site copies are all aligned |
| pr-link-github-issue | error | PASS | The commit title carries #9389 for the PR |
| dry | warning | PASS | The per-check fail helper is a recorded decision because datasets share no helper file |
| kiss | warning | PASS | Simple string parsing and prose rules |
| spec-first | error | PASS | Spec edits (Task 3 R15 first, Task 4) come before the skill changes in Tasks 5 and 6, which depend on Task 4 |
| project-agnostic | error | PASS | Plugin skills and scripts are changed; the .claude validator edit is repo tooling |
| flag-coherence-cross-skill | error | PASS | Both skills gate on the one resolved <FLAGS> |
| no-opposite-logical-vectors | error | PASS | Single consistent gate phrasing per skill |
| flag-resolution-single-source | warning | PASS | One resolution site (the Flags rule) per skill |
| state-premise | error | PASS | The Context section states the root problem |
| smallest-viable-cut | warning | PASS | KD10 states the smallest cut and why Tasks 7 and 8 stay |
| failure-audience | warning | PASS | KD10 names who fails if this ships wrong |
| explicit-non-goals | warning | PASS | KD10 lists the non-goals in one place |
| ambiguity-stops-and-asks | error | PASS | Design choices are recorded in Key Decisions with alternatives |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is changed |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag names are introduced |
| workspace-mode-compatibility | error | PASS | No state, config or path logic is touched |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 5 and Task 6 change which flags the skills accept ("take from `$ARGUMENTS` only these flags"), so the user docs in `docs/skills/` must stay in sync.

**Severity hint:** high

**Patch:** Check that the github-sdlc and jira-sdlc SKILL.md flag allow-list rule matches `docs/skills/github-sdlc.md` and `docs/skills/jira-sdlc.md`.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the github-sdlc and jira-sdlc SKILL.md flag allow-list rule matches `docs/skills/github-sdlc.md` and `docs/skills/jira-sdlc.md`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 5 replaces `$ARGUMENTS` with `<FLAGS>` in `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` and adds a new error message in `github.js`, and Task 6 makes the matching change in jira-sdlc, which changes the CLI flag contract.

**Severity hint:** high

**Patch:** Check that only the allow-listed flags (`<FLAGS>`) reach github.js and jira.js, and that github.js reports a non-flag token as an unexpected argument.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that only the allow-listed flags (`<FLAGS>`) reach github.js and jira.js, and that github.js reports a non-flag token as an unexpected argument.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-8 touch many `.md` files (for example Task 3's `docs/specs/ship-sdlc.md` and `entry-modes.md`, Task 8's `docs/skills/github-sdlc.md`) that the `code-quality` dimension's current triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Final Shape

- The headless provider reads the files each case asks for. The datasets name them as JSON strings, so promptfoo no longer splits one case into many.

- Each headless check that fails returns `{ pass: false, score: 0, reason }`, so promptfoo 0.123.1 shows the reason instead of rejecting the result.

- A headless run's output document shows the last 300 characters of every tool result and the last 1000 characters of the session's final text. It still holds no environment values.

- Ship's dry-run text says to keep the prepare output file. Spec R15 says the same, and a static exec case checks the text.

- github-sdlc and jira-sdlc put only listed flags into their Bash calls, as `<FLAGS>`. Request words stay with the model. `github.js` names a stray request word as an unexpected argument. Specs (A14, C21, A6, C16), static exec cases, the consistency validator and the user docs all match.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Headless provider accepts snapshot_files as a JSON string (plain non-JSON string = one-item list; array still works); both headless datasets write snapshot_files as JSON strings; exec case for the string form in headless-runner-exec.yaml (stub claude). | Task 1, Task 2 | covered |
| 2 Every assertion in tests/promptfoo/datasets/headless-*.yaml that returns a string on failure returns a GradingResult {pass:false, score:0, reason}; verdict logic unchanged. | Task 1, Task 2 | covered |
| 3 headless-case.js parseStream records a short resultTail (~300 chars) per tool use and the session's final result text (truncated) in the output document; never records environment values; exec case with a stub. | Task 1 | covered |
| 4 ship-sdlc entry-modes.md dry-run section: leave PREPARE_OUTPUT_FILE in place and run no rm; spec R15 amended first. | Task 3 | covered |
| 5 github-sdlc and jira-sdlc forward only an explicit flag allow list (<FLAGS>), never $ARGUMENTS, into Bash calls; specs, EXPLICIT_FLAG_SKILLS, user docs, static exec cases, github.js show issue 7 exec case, optional github.js message. | Task 4, Task 5, Task 6, Task 7, Task 8 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
