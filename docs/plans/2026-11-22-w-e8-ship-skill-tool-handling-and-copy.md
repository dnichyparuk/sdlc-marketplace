# W-E8 Ship Skill Tool-Handling and Copy Rules Implementation Plan

**Commit:** `fix(W-E8): ship-sdlc - tool-handling guards and plan copy rules`
**Goal:** Make ship-sdlc's Step 5 loop follow the harness tool contracts (Read before Write, optional TodoWrite, deferred Monitor) and make plan-sdlc's copy check require the site byte copies of docs.
**Architecture:** Four small tasks in three execute waves. Spec first: Task 1 writes the spec and doc sentences, in wave 1 with the copy rules config (Task 4). Wave 2 holds the mktemp Read fix with its new text-probe script (Task 2). Wave 3 holds the TodoWrite guard and deferred Monitor load (Task 3), which shares SKILL.md and the probe files with Task 2.
**Source:** docs/plans/programme.md#W-E8
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern ship-sdlc/tool-handling`

---

## Context

**What problem does this change solve?**

- Ship's Step 5 loop runs `mktemp` and then writes the result file with the Write tool. The Write tool refuses an existing file that it has not read. One measured ship run had 4 refusals and 9 extra Reads (ledger F-193).
- Ship calls `TodoWrite` with no check that the tool exists. A session without TodoWrite has no defined path (ledger F-194).
- Ship starts the per-wave monitor only "when the `Monitor` tool is available". In current sessions `Monitor` and `TaskStop` are deferred tools: their names are listed, but their schemas must be loaded with `ToolSearch` before a call. So the wave-watch never starts (ledger F-194).
- The project's `plan.copyRules` (the rules that plan-sdlc's copy check reads) do not require the site byte copies of `docs/*.md`, `docs/specs/*.md` and `docs/skills/*.md`. A plan that forgets a site copy is caught only by the PR byte compare (ledger F-179).

**What prompted this change now?**

- The owner accepted one more fix wave for the ledger findings still present (decision PD-7, unit W-E8, tickets TK-023, TK-024, TK-025).

**What does success look like?**

- Step 5 item 6 tells the agent to Read the empty `mktemp` file once before the Write.
- Step 5 items 2 and 3 call TodoWrite only when it exists, and print the `[task-tray]` marker either way.
- The execute dispatch loads a deferred `Monitor` and `TaskStop` with one `ToolSearch` call, then starts the wave-watch.
- The spec R-todowrite-visibility and R92 state both rules; the user doc says the same.
- `validateCopyRules` reports no error on the project config with the three new rules.
- One exec text-probe case per SKILL.md ticket passes.

**Who notices a failure, and how far it reaches?**

- A wrong SKILL.md sentence affects every ship run (the main session that drives ship). The text probe catches a missing or doubled sentence before the PR.
- A wrong copy rule affects only plan-sdlc's copy check in this repository. An invalid rule is skipped and reported as a non-blocking issue (plan-sdlc R71(d)), so it cannot stop a plan.

**Non-goals.**

- No change to `ship.js`, `ship-todos.js` or any other script behaviour.
- No change to the step agents (`ship-step-*`), which never use Monitor (R97).
- No planner-recall work and no `plan.js` recall step (out of scope, PD-7).
- No behavioural test cases and no run of the behavioural suite.

## Research Findings

All items were re-verified at HEAD `cf24e62` (branch `main`). Every item still reproduces, so none is dropped.

- **TK-023 reproduces.** `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:278` reads "Run `mktemp` and note the printed path; write `{step_id, success, output, error}` to that path with the Write tool". No Read is named. The sibling skills already name it: `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:456` reads "Read `<BODY_FILE>` once (it is empty; the Write tool refuses a file that was not read), then write …".
- **TK-024 reproduces.** `SKILL.md:269` ("call `TodoWrite` with `ext.todos.todos` and echo `ext.todos.marker`") and `SKILL.md:270` ("call `TodoWrite` with it and echo `step.data.marker`") have no availability guard. `SKILL.md:274` reads "when the `Monitor` tool is available, start it …" and names no `ToolSearch` load. No skill or agent prose in the plugin mentions `ToolSearch` today (`git grep -n ToolSearch -- plugins` gives no hit).
- **Spec text.** `docs/specs/ship-sdlc.md:153-166` holds R-todowrite-visibility with an 11-item contract; item 8 defines the `[task-tray]` marker. `docs/specs/ship-sdlc.md:408` holds R92 ("under `Monitor` when that tool is available"). The spec's appendix `### Issue trail` table records each change per id (for example `| R92 | per-wave execute progress, #9349 |`).
- **User doc.** `docs/skills/ship-sdlc.md:229` says ship prints per-wave lines "when the Monitor tool is available". `docs/skills/ship-sdlc.md:291-296` describes the `[task-tray]` marker as a stdout audit trail.
- **Byte copies.** `cmp` shows `site/src/content-source/specs/ship-sdlc.md` and `site/src/content-source/skills/ship-sdlc.md` are byte-equal to their sources today.
- **Ship companions.** The five companion files beside SKILL.md (`config-format.md`, `entry-modes.md`, `openspec-steps.md`, `reference.md`, `state-format.md`) and `site/src/data/skills-meta.ts` do not mention TodoWrite, Monitor, TaskStop or mktemp (`git grep -nE "TodoWrite|Monitor|TaskStop|mktemp" -- plugins/sdlc-utilities/skills/ship-sdlc/ site/src/data/skills-meta.ts` hits only SKILL.md). They need no change.
- **TK-025 reproduces.** `.sdlc/config.json:148-161` holds one copy rule only (a skill's SKILL.md or spec requires its doc, the doc's site copy, `skills-meta.ts` and the skill's companion `.md` files). No rule requires `site/src/content-source/<name>.md` or `site/src/content-source/specs/<name>.md`. A `{name}` capture matches one path segment (`plugins/sdlc-utilities/scripts/lib/plan-parse.js:330-340`, `compileCaptureGlob`). A dry run of `validateCopyRules` on the current rule plus the three new rules returned `{"errors":[],"warnings":[]}`.
- **Test patterns.** Text-probe checks live in `tests/promptfoo/scripts/check-*-sentinels.js` (for example `check-handback-sentinels.js`: a `REPO_ROOT` marker guard, a read helper that exits 2 on a read error, one JSON line on stdout, exit 1 when a check fails). Datasets call them with `script_path: "repo://tests/promptfoo/scripts/<name>.js"` (for example `tests/promptfoo/datasets/plan-prepare-exec.yaml:1169-1174`). `tests/promptfoo/datasets/ship-sdlc-exec.yaml` holds the ship exec cases (5 cases today: `grep -c '^- description:' tests/promptfoo/datasets/ship-sdlc-exec.yaml`).
- **Old-literal grep (F-55, F-180, F-192).** Fragments of the sentences that change were grepped over plugins, tests, docs, `.claude` and `site/src/data` (`git grep -nF '<fragment>'`): "call `TodoWrite`", "TodoWrite` with", "ext.todos.marker", "Monitor` tool is available", "when the `Monitor`", "Run `mktemp`", "note the printed path", "no shell quoting of agent text", "stop that monitor", "timeout_ms". Hits outside SKILL.md: `step.data.marker` in `plugins/sdlc-utilities/scripts/skill/ship.js:3031`, `tests/promptfoo/datasets/ship-sdlc.yaml:992` and `tests/promptfoo/datasets/ship-stepper-exec.yaml:553` (all keep the literal, which this plan does not remove); "tool is available" in `docs/skills/ship-sdlc.md:229` and `docs/specs/ship-sdlc.md:408` (both edited by Task 1). The one test that reads SKILL.md for this area, `tests/promptfoo/scripts/check-handback-sentinels.js:50`, asserts only `wave-watch`, which stays.
- **Count checks.** No script counts the cases of `ship-sdlc-exec.yaml` (`git grep -n ship-sdlc-exec -- tests/promptfoo/scripts plugins .claude` gives no hit). `tests/promptfoo/scripts/check-spec-id-coverage.js:19` fails only on a drop, never on growth, so added cases need no baseline refresh.
- **Commands.** Exec targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. Spec shape: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| R92 sentence | no | adds one sentence to R92 in `docs/specs/ship-sdlc.md`, beside the R-todowrite-visibility clause the ticket names | the deferred-Monitor load is a behaviour of R92; the spec-first guardrail wants the spec to state it before SKILL.md does |
| User doc lines | no | edits `docs/skills/ship-sdlc.md` (two sentences) and its site byte copy | R71(d): a skill behaviour change updates the skill's reference doc; the doc's R92 line would otherwise stay incomplete |
| TK-023 spec text | no | adds one sentence to P-STEP-2 for the mktemp Read (Task 1), although the ticket says "no spec text change" | the plan critique flagged the error-severity spec-first guardrail on a SKILL.md change with no spec task; one sentence is the smallest fix |
| Capture names | no | names the captures `{doc}`, `{spec}` and `{skill}` instead of the ticket's `{s}` | any `[a-z][a-z0-9]*` name works (setup-sdlc R28); descriptive names read better and match the existing `{skill}` rule |
| TK-025 test | no | verifies the config with a `validateCopyRules` command, adds no exec case | the change is project config, not script code; the setup-sdlc exec cases already cover `validateCopyRules` itself |
| Plan route | no | plans on the Lightweight route | the scope changes no gate or dispatch and adds no deny or guard rule (an availability check on a tool is not a deny rule) |

## Key Decisions

- **One text-probe script for both SKILL.md tickets, created by Task 2 and extended by Task 3.** The alternative is two scripts. One script keeps the read helper and the marker guard in one place (DRY). The order of Task 2 then Task 3 gives each shared file to one task per wave (F-43).

- **Count the new sentence, and count the old one as zero.** The probe counts each sentinel with an exact expected number (1 or 2). It also requires the old wording to be gone. A plain `includes` check would pass if a worker left the old sentence beside the new one.

- **Load the deferred tools with one `ToolSearch` call, `select:Monitor,TaskStop`.** The alternative is two calls, or loading only `Monitor`. One call loads both. `TaskStop` is needed to stop the monitor when the execute Agent returns, so loading only `Monitor` would leave the stop step broken.

- **TodoWrite guard as "skip the call, still print the marker".** The alternative is to fail the step. The tray is a UI projection only (R-todowrite-visibility item 9 and item 10), so a missing tray must not change the pipeline. The marker stays the audit trail (item 8).

- **Three separate copy rules, one per docs folder.** The alternative is one rule with three `when` globs. A rule fills only the captures of the matched `when` glob, and its `require` globs would then name all three site folders at once. Separate rules keep each trigger tied to exactly one site copy.

## Contract Examples

Code (Task 2):

```markdown
**Contract:**
- shape (code): `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js`, no arguments; prints one JSON line `{ ok, counts: { mktempRead, mktempOld } }`; exit 0 when ok, 1 when a count is wrong, 2 on a read error or any argument.
- names: `check-ship-tool-handling-sentinels.js`, `count(rel, needle)`, `mktempRead`, `mktempOld`.
- mirror: `tests/promptfoo/scripts/check-handback-sentinels.js:1-40`.
- decisions: exact counts, not `includes`.
- sync: the dataset case in `tests/promptfoo/datasets/ship-sdlc-exec.yaml` asserts the same fields.
```

Docs (Task 1):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md`: one clause on the R92 bullet, one sentence in `### Task tray`.
- names: `ToolSearch`, `[task-tray]`.
- mirror: the bullet style at `docs/skills/ship-sdlc.md:227-230`.
- decisions: user-facing prose only.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

Openspec / spec (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY P-STEP-2, R-todowrite-visibility item 8 and R92 in `docs/specs/ship-sdlc.md`; ADD one row to `### Issue trail`; no new id.
- names: `P-STEP-2`, `R-todowrite-visibility`, `R92`.
- mirror: the issue-trail row style at `docs/specs/ship-sdlc.md:624`.
- decisions: no new requirement id; each rule extends the id that owns the behaviour.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy; SKILL.md items 2, 3 and the `dispatch_execute` bullet (Task 3).
```

## Tasks

### Task 1: Spec and user doc state the mktemp Read, the TodoWrite guard and the deferred Monitor load

**Ticket:** TK-024 @4508f71a

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint, manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — one sentence each on P-STEP-2, R-todowrite-visibility item 8 and R92, one issue-trail row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec (`cp`)
- Modify: `docs/skills/ship-sdlc.md` — one clause on the R92 bullet, one sentence in `### Task tray`
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy of the doc (`cp`)
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — check only, no change expected

**Notes:** Spec first: Tasks 2 and 3 implement these sentences in SKILL.md. The companions and `skills-meta.ts` are listed for the copy rule only; the Research Findings grep shows none of them states the rule.

**Acceptance criteria:**
- [ ] R-todowrite-visibility item 8 in `docs/specs/ship-sdlc.md` ends with the sentence "When the session has no TodoWrite tool, the main thread skips the call, still prints the marker and emits no todo."
- [ ] R92 in `docs/specs/ship-sdlc.md` carries the sentence that names `ToolSearch` and `select:Monitor,TaskStop`.
- [ ] P-STEP-2 in `docs/specs/ship-sdlc.md` carries the sentence on reading the empty `mktemp` file once before the Write.
- [ ] The `### Issue trail` table ends with the new row.
- [ ] `docs/skills/ship-sdlc.md` carries both new sentences.
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` and `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exit 0.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (openspec): MODIFY three requirements and ADD one appendix row in `docs/specs/ship-sdlc.md`; no new id, no renumbering. The edits:

  ```diff
  - - P-STEP-2: Script accepts `--after <step_id> --result-file <path> --state <state_file>` for subsequent invocations after the initial call
  + - P-STEP-2: Script accepts `--after <step_id> --result-file <path> --state <state_file>` for subsequent invocations after the initial call. The skill creates the result file with `mktemp`, reads the empty file once, then writes the result to it with the Write tool (the Write tool refuses an existing file it has not read).
  ```

  ```diff
    8. The MAIN thread MUST print a deterministic stdout marker alongside each TodoWrite call in the form: `[task-tray] <event>: pending=<n>, in_progress=<n>, completed=<n>`. This marker is the assertion surface for promptfoo tests and a stdout audit trail when the tray is hidden.
  + When the session has no TodoWrite tool, the main thread skips the call, still prints the marker and emits no todo.
  ```

  (the added sentence goes at the end of the item 8 line, on the same line, after "when the tray is hidden.")

  ```diff
  - … under `Monitor` when that tool is available, and prints each line it emits — one line per finished execute wave. It stops the monitor when the execute Agent returns. …
  + … under `Monitor` when that tool is available, and prints each line it emits — one line per finished execute wave. When `Monitor` or `TaskStop` is listed as a deferred tool, the main thread first loads both with one `ToolSearch` call (query `select:Monitor,TaskStop`), so a deferred `Monitor` counts as available. It stops the monitor when the execute Agent returns. …
  ```

  Appendix row, appended as the last row of the `### Issue trail` table:

  ```markdown
  | P-STEP-2, R-todowrite-visibility, R92 | mktemp result file read before the Write (F-193); no TodoWrite tool still prints the marker; deferred Monitor and TaskStop loaded with ToolSearch (F-194), W-E8 (TK-023, TK-024) |
  ```

  `docs/skills/ship-sdlc.md` edits:

  ```diff
  - - **Per-wave progress (R92)**: during the execute step, ship prints one line per finished execute wave when the Monitor tool is available.
  + - **Per-wave progress (R92)**: during the execute step, ship prints one line per finished execute wave when the Monitor tool is available. When Monitor is a deferred tool, ship first loads Monitor and TaskStop with ToolSearch.
  ```

  ```diff
    This marker is a stdout audit trail when the tray is collapsed or running
  - non-interactively. On `--resume`, the tray is reconstructed from the
  + non-interactively. When the session has no TodoWrite tool, ship skips the
  + tray update and still prints the marker. On `--resume`, the tray is reconstructed from the
  ```

  Then `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` and `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` (never `site/scripts/copy-docs.mjs`).
- names: `P-STEP-2` (modified), `R-todowrite-visibility` (item 8 modified), `R92` (modified); headings `### Task tray`, `### Issue trail`.
- mirror: issue-trail row style at `docs/specs/ship-sdlc.md:624` (`| R92 | per-wave execute progress, #9349 |`); multi-id row precedent in `docs/specs/plan-sdlc.md` (`| R64, R67, R74, R76, R77 | … W-E7 (TK-022) |`).
- decisions: ledger and ticket ids appear only in the appendix row (spec shape rule); see Key Decisions for the ToolSearch and TodoWrite choices.
- sync: both site byte copies; SKILL.md item 6 (Task 2), items 2, 3 and the `dispatch_execute` bullet (Task 3) must say the same.

### Task 2: Ship reads the empty mktemp file before Write, with a text probe

**Ticket:** TK-023 @9840f1fb

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 5 item 6 names the Read before the Write
- Create: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` — text probe that counts the SKILL.md sentinels
- Modify: `tests/promptfoo/datasets/ship-sdlc-exec.yaml` — add case `ship-sdlc/tool-handling: mktemp …`

**Notes:** The wording mirrors pr-sdlc (`plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:456`) so the rule reads the same across skills. It depends on Task 1, which states the rule in P-STEP-2 first (spec-first guardrail).

**Acceptance criteria:**
- [ ] SKILL.md Step 5 item 6 contains "Read that empty file once (the Write tool refuses a file that was not read)" exactly once and no longer contains "note the printed path; write".
- [ ] `node tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` prints `{"ok":true,"counts":{"mktempRead":1,"mktempOld":0}}` and exits 0.
- [ ] `node tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js --x` writes a usage line to stderr, prints nothing on stdout and exits 2.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern ship-sdlc/tool-handling` passes (1 case).
- [ ] `ship-sdlc-exec.yaml` has 6 cases (`grep -c '^- description:' tests/promptfoo/datasets/ship-sdlc-exec.yaml`, was 5).

**Contract:**
- shape (code): SKILL.md edit, at the start of Step 5 item 6:

  ```diff
  - 6. Run `mktemp` and note the printed path; write `{step_id, success, output, error}` to that path with the Write tool (no shell quoting of agent text), then run `node "<PLUGIN_ROOT>/scripts/skill/ship.js" --after <step.id> …
  + 6. Run `mktemp` and note the printed path; Read that empty file once (the Write tool refuses a file that was not read), then write `{step_id, success, output, error}` to it with the Write tool (no shell quoting of agent text), then run `node "<PLUGIN_ROOT>/scripts/skill/ship.js" --after <step.id> …
  ```

  The rest of item 6 is unchanged. New script (CommonJS, `'use strict'`, no dependencies):

  ```js
  // usage: node tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js   (no arguments)
  const REPO_ROOT = path.resolve(__dirname, '../../..');   // marker guard: CLAUDE.md must exist, else stderr + exit 2
  const SKILL = 'plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md';
  function count(rel, needle) { /* readFileSync(REPO_ROOT/rel); read error → stderr + exit 2; return content.split(needle).length - 1 */ }
  const counts = {
    mktempRead: count(SKILL, 'Read that empty file once (the Write tool refuses a file that was not read)'),  // expect 1
    mktempOld:  count(SKILL, 'note the printed path; write'),                                                 // expect 0
  };
  const ok = counts.mktempRead === 1 && counts.mktempOld === 0;
  // stdout: JSON.stringify({ ok, counts }) + '\n'; exit 0 when ok, 1 otherwise
  ```

  | Input | stdout | stderr | exit |
  |---|---|---|---|
  | no arguments, sentinels right | `{"ok":true,"counts":{…}}` | — | 0 |
  | no arguments, a count wrong | `{"ok":false,"counts":{…}}` | — | 1 |
  | any argument | nothing | `Usage: check-ship-tool-handling-sentinels.js (no arguments)` | 2 |
  | SKILL.md unreadable or CLAUDE.md marker missing | nothing | `Script error …` | 2 |

  Dataset case, appended at the end of `tests/promptfoo/datasets/ship-sdlc-exec.yaml`:

  ```yaml
  - description: "ship-sdlc/tool-handling: mktemp result file is read once before the Write (P-STEP-2, plan-sdlc R71(a))"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          if (r.counts.mktempRead === 1 && r.counts.mktempOld === 0) return true;
          return { pass: false, score: 0, reason: output };
  ```
- names: `check-ship-tool-handling-sentinels.js`, `count`, `counts.mktempRead`, `counts.mktempOld`; case prefix `ship-sdlc/tool-handling:`.
- mirror: `tests/promptfoo/scripts/check-handback-sentinels.js:1-40` (marker guard, read helper, JSON line, exit codes); case shape at `tests/promptfoo/datasets/plan-prepare-exec.yaml:1169-1174`.
- decisions: exact counts (Key Decisions); the case asserts the counts, not only `ok`, so Task 3's added fields do not change this case.
- sync: Task 3 extends the same script and adds a second case with the same prefix.

### Task 3: Ship guards TodoWrite and loads a deferred Monitor, with a text probe

**Ticket:** TK-024 @4508f71a

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 5 items 2 and 3 guard TodoWrite; the `dispatch_execute` bullet loads deferred Monitor and TaskStop
- Modify: `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` — add three counts
- Modify: `tests/promptfoo/datasets/ship-sdlc-exec.yaml` — add case `ship-sdlc/tool-handling: TodoWrite …`

**Notes:** It depends on Task 1 (spec first) and on Task 2, which edits the same three files. The availability check is not a deny or block rule: it removes no command a worker runs. Its gap, accepted: the main thread decides from its own tool list whether a tool is present or deferred; no script checks this.

**Acceptance criteria:**
- [ ] SKILL.md items 2 and 3 each contain "when that tool is available (skip the call when it is not)" (2 hits) and say the marker is echoed either way.
- [ ] SKILL.md no longer contains "call `TodoWrite` with it and echo" (0 hits).
- [ ] SKILL.md's `dispatch_execute` bullet contains "`select:Monitor,TaskStop`" exactly once, before "start it before the Agent call".
- [ ] `node tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` prints `{"ok":true,"counts":{"mktempRead":1,"mktempOld":0,"todoGuard":2,"todoOld":0,"deferredLoad":1}}` and exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern ship-sdlc/tool-handling` passes (2 cases).
- [ ] `ship-sdlc-exec.yaml` has 7 cases (`grep -c '^- description:' tests/promptfoo/datasets/ship-sdlc-exec.yaml`, was 6 after Task 2).
- [ ] `node tests/promptfoo/scripts/check-handback-sentinels.js` still exits 0 (`wave-watch` stays in SKILL.md).

**Contract:**
- shape (code): SKILL.md edits in Step 5:

  ```diff
  - 2. Parse `ENVELOPE_FILE` (the literal path). If `ext.todos` is present, call `TodoWrite` with `ext.todos.todos` and echo `ext.todos.marker`. Then: If `status === "done"`: …
  + 2. Parse `ENVELOPE_FILE` (the literal path). If `ext.todos` is present, call `TodoWrite` with `ext.todos.todos` when that tool is available (skip the call when it is not) and echo `ext.todos.marker` either way (R-todowrite-visibility). Then: If `status === "done"`: …
  ```

  ```diff
  - 3. Print `step.action`. If `step.data.todos` is present, call `TodoWrite` with it and echo `step.data.marker`.
  + 3. Print `step.action`. If `step.data.todos` is present, call `TodoWrite` with it when that tool is available (skip the call when it is not) and echo `step.data.marker` either way.
  ```

  ```diff
  -    - `dispatch_execute` also: when the `Monitor` tool is available, start it before the Agent call on `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-watch --interval 30` …
  +    - `dispatch_execute` also: when `Monitor` or `TaskStop` is listed as a deferred tool, first load both with one `ToolSearch` call, query `select:Monitor,TaskStop` (R92); then, when the `Monitor` tool is available, start it before the Agent call on `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-watch --interval 30` …
  ```

  The rest of each line is unchanged. Script additions to `counts` and `ok`:

  ```js
  todoGuard:    count(SKILL, 'when that tool is available (skip the call when it is not)'),  // expect 2
  todoOld:      count(SKILL, 'call `TodoWrite` with it and echo'),                           // expect 0
  deferredLoad: count(SKILL, 'first load both with one `ToolSearch` call, query `select:Monitor,TaskStop`'), // expect 1
  // ok also requires todoGuard === 2 && todoOld === 0 && deferredLoad === 1
  ```

  Dataset case, appended after the Task 2 case:

  ```yaml
  - description: "ship-sdlc/tool-handling: TodoWrite is guarded and a deferred Monitor is loaded with ToolSearch (R-todowrite-visibility, R92)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          if (r.ok === true && r.counts.todoGuard === 2 && r.counts.todoOld === 0 && r.counts.deferredLoad === 1) return true;
          return { pass: false, score: 0, reason: output };
  ```
- names: `counts.todoGuard`, `counts.todoOld`, `counts.deferredLoad`; `ToolSearch`, `select:Monitor,TaskStop`.
- mirror: Task 2's script and case; spec sentences of Task 1.
- decisions: one `ToolSearch` call for both tools (Key Decisions); the marker is echoed whether or not TodoWrite exists.
- sync: `docs/specs/ship-sdlc.md` R-todowrite-visibility item 8 and R92 (Task 1); `docs/skills/ship-sdlc.md` (Task 1).

### Task 4: Plan copy rules require the site byte copies

**Ticket:** TK-025 @976d20fa

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `.sdlc/config.json` — append three rules to `plan.copyRules`

**Notes:** Implements plan-sdlc R71(d) through setup-sdlc R28 config; no spec change. Three rules, not one (Key Decisions).

**Acceptance criteria:**
- [ ] `plan.copyRules` has 4 rules; the first is unchanged.
- [ ] `node -e "const {validateCopyRules}=require('./plugins/sdlc-utilities/scripts/lib/plan-parse');const r=validateCopyRules(require('./.sdlc/config.json').plan.copyRules,process.cwd());console.log(JSON.stringify(r));process.exit(r.errors.length?1:0)"` prints `{"errors":[],"warnings":[]}` and exits 0.
- [ ] `node -e "JSON.parse(require('fs').readFileSync('.sdlc/config.json','utf8'))"` exits 0.

**Contract:** shape (code): config delta, the three objects appended after the existing rule in `plan.copyRules`, 2-space JSON indent as in the file:

```diff
         ]
-      }
+      },
+      {
+        "when": ["docs/{doc}.md"],
+        "require": ["site/src/content-source/{doc}.md"]
+      },
+      {
+        "when": ["docs/specs/{spec}.md"],
+        "require": ["site/src/content-source/specs/{spec}.md"]
+      },
+      {
+        "when": ["docs/skills/{skill}.md"],
+        "require": ["site/src/content-source/skills/{skill}.md"]
+      }
     ]
```

names: `plan.copyRules[1]`, `plan.copyRules[2]`, `plan.copyRules[3]`, captures `{doc}`, `{spec}`, `{skill}`; sync: none (setup-sdlc R28 validates the key; no doc lists the repo's rules)

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 2 and 3 add a text-probe script and exec cases. The old-literal grep found no stale tests. Tasks 1 and 4 touch only docs and config. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted `--filter-pattern ship-sdlc/tool-handling` runs on the exec-only config. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a ticket (TK-023, TK-024, TK-025). The extra R92 sentence and doc edit are declared in the Deviations table. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable: spec and doc, mktemp Read, TodoWrite and Monitor guards, or copy rules. |
| scripts-over-llm-logic | error | PASS | Tool availability is only known to the main thread, and the plan records this as an accepted gap. Behaviour checks are deterministic count probes. |
| yagni | warning | PASS | One probe script and no speculative parameters. |
| cross-skill-consistency | error | PASS | The mktemp wording mirrors pr-sdlc, and the plan notes the companion files need no change. |
| pr-link-github-issue | error | PASS | Only internal ids (W-E8, TK-0xx, F-ledger ids) are used, so the rule does not apply. |
| dry | warning | PASS | One shared probe script. Task 3 extends it instead of copying it. |
| kiss | warning | PASS | Small sentence-level edits, three simple config rules. |
| spec-first | error | PASS | Task 1 states each SKILL.md rule in the spec (P-STEP-2, R-todowrite-visibility item 8, R92) first; Tasks 2 and 3 depend on Task 1. |
| project-agnostic | error | PASS | `.sdlc/config.json` is the project's own copyRules config, which is the designed place for project rules. The skill changes ship in the plugin. |
| flag-coherence-cross-skill | error | PASS | No flags are introduced or gated. |
| no-opposite-logical-vectors | error | PASS | Both TodoWrite sites use identical guard wording, and the probe asserts a count of 2. |
| flag-resolution-single-source | warning | PASS | No flags are involved. |
| state-premise | error | PASS | Context states the root problems: Write refuses an unread file, TodoWrite is unguarded, Monitor is deferred, and copy rules are incomplete. |
| smallest-viable-cut | warning | PASS | Four small tasks, each tied to a ticket. Key Decisions justify the one-script and three-rule choices. |
| failure-audience | warning | PASS | The Context section 'Who notices a failure, and how far it reaches?' names the affected audience (every ship run, or plan-sdlc's copy check) and the blast radius. |
| explicit-non-goals | warning | PASS | The Context section lists Non-goals: no script changes, no step-agent changes, no planner-recall work, no behavioural tests. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (one or two scripts, one or three rules, ToolSearch scope) are recorded in Key Decisions. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is changed. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters change. ToolSearch only loads tools. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added. |
| workspace-mode-compatibility | error | PASS | The changes are prose, a repo-relative test script and static config, with no state files or cwd logic. The probe uses a REPO_ROOT marker guard. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Task 2 creates `tests/promptfoo/scripts/check-ship-tool-handling-sentinels.js` and Tasks 1, 2 and 3 edit many ship-sdlc .md files, which the script flagged for the `**/*.md` trigger.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Final Shape

Ship's Step 5 loop now follows the harness tool contracts.

- It reads the empty `mktemp` file once before it writes the step result, so the Write tool no longer refuses it.
- It calls TodoWrite only when the session has the tool. It prints the `[task-tray]` marker in every case.
- Before the execute dispatch, it loads a deferred `Monitor` and `TaskStop` with one `ToolSearch` call. The per-wave lines then appear.

The ship spec (P-STEP-2, R-todowrite-visibility item 8 and R92) and the ship user doc state the same rules. Their site copies are byte-equal.

One exec text-probe script checks the new SKILL.md sentences by count, through two cases with the prefix `ship-sdlc/tool-handling:`.

The project's copy rules now also require the site byte copy of every edited `docs/*.md`, `docs/specs/*.md` and `docs/skills/*.md` file. A plan that forgets one fails plan-sdlc's copy check at planning time, not at the PR byte compare.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
