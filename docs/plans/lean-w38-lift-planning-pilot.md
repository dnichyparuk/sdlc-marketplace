# Lift-planning pilot: connect sdlc-marketplace to the plan register Implementation Plan

**Commit:** `chore(#9461): planning - connect lift-planning register`
**Goal:**
- Connect this repository to the lift-planning plugin 0.2.2: a delivery-unit register, a vendored copy of its CLI and schema, a generated status region, the Planning conventions and one decision log.
- Register the remaining waves (H2, B, D1, D2, F) as delivery units and the END audit as a gate unit that depends on F.
- Turn the deferred review lows of lean-w34, lean-w35 and lean-w36 into one TODO note per wave, homed to the END gate.
- Move every open #94xx todo into a lift-planning ticket, scheduled in the brief of its unit.
- Guard all of it with one promptfoo exec case that runs the register check.
**Architecture:** Docs and configuration only, plus one exec test case. Every register and ticket change goes through the vendored CLI `node scripts/plan-register.mjs` (`add-unit`, `home-todo`, `add-plan`, `tickets new`, `write`, `check`); only the register `config`, the briefs and the ticket bodies are written by hand. No file under `plugins/sdlc-utilities` changes.
**Source:** .sdlc/orchestration/todos.md at 19f54bc (wave L, tracking #9461; owner decisions 2026-11-19) and the frozen copy of .sdlc/orchestration/programme-lows.md (sha256 d0b8b598918fb82d4a0dc62a76ed6d5d7d77041769bc4a4e765d9f9840bcdc26)
**Verification:** `node scripts/plan-register.mjs check`; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-register|spec-id-coverage|dataset-asserts|fixture-refs"`

---

## Context

**What problem does this change solve?**

- The programme of this repository lives in one gitignored file, `.sdlc/orchestration/todos.md`. It exists only in the main checkout. A pull request cannot change it, and no check reads it.
- The wave order, the open follow-ups and the deferred review lows are free text there. Nothing checks that each follow-up has a wave, or that the order has no gaps.
- lift-planning (a planning plugin the owner already uses in trade-robot-alpha) keeps the same facts in tracked files, checked by a CLI: a register of units (waves), tickets (work items) and TODO notes (work without a plan).

**What prompted it now?**

- The owner inserted wave L (tracking #9461) on 2026-11-19: "connect sdlc-marketplace to lift-planning", after lean-w37 and before H2.
- The owner also decided that deferred review lows go only to one TODO note per wave, homed to an END gate unit (this programme only).
- After this wave merges, another session switches the lean skill profile to read the wave order from the register. This wave does not touch the lean skill.

**What does success look like?**

- `node scripts/plan-register.mjs check` exits 0 and prints `plan-register: register valid; 1 region(s) current` and `plan-register: tickets valid; 21 ticket(s), 0 archived; 1 region(s) current`.
- `docs/plans/README.md` shows six waves in order, `W-H2` → `W-B` → `W-D1` → `W-D2` → `W-F` → `W-END`, and three lows notes homed to `W-END`.
- `node scripts/plan-register.mjs tickets status` shows 21 scheduled tickets and 0 in backlog.
- The new exec case passes, and fails when the register or a generated region is stale.

**Who is hurt if this ships wrong?**

- Every later wave: the new exec case runs in the pre-push hook, so a register that is broken at merge blocks every push until someone runs `write`.
- The main session after the merge: it trims `todos.md` against the tickets, so a missing or misnumbered ticket loses a follow-up.
- The END audit: a lows note with an edited row would hide a low from the re-check.

## Research Findings

All facts below were measured at `19f54bc`. A dry run of every command of Tasks 1 to 6 on a scratch copy (`git archive HEAD`) confirmed each quoted result.

**The plugin and its CLI.**

- lift-planning 0.2.2 is installed at `~/.claude/plugins/cache/lift-planning/lift-planning/0.2.2/`. Its skills (`planning-setup`, `ticket-new`, `todo-home`) are recipes over one CLI, `dist/plan-register.mjs`. Ship workers cannot call skills, so every task below names the exact CLI commands (F-lift-planning-cli-rules-and-layout-1, F-lift-planning-cli-rules-and-layout-2).
- `vendor`, run from the plugin, writes `scripts/plan-register.mjs` (line 1 starts `// plan-register 0.2.2 · schema plan-register/1 · vendored from lift-planning@v0.2.2`) and `scripts/plan-register-1.schema.json`, and prints `scripts/plan-register.mjs: none → 0.2.2` and `scripts/plan-register-1.schema.json: updated` (dry run).
- The change commands (`add-unit`, `add-plan`, `home-todo`, `tickets new`) check the register before and after, and refuse a change that adds a problem (plugin `docs/cli.md`, "set" and "tickets").
- A brief schedules tickets through a `Milestones` table with a `Tickets` column (plugin `docs/tickets.md`, "The Milestones table of a brief"). A ticket may be scheduled by one open unit only (rule TV7).

**Single-letter keys collide with old plans.**

- Rule V11(b): an active plan in `docs/plans/` whose `**Source:**` line names a unit key as a separate token must be registered for that unit.
- Old plans name `D1`, `D2` and `F` on their source lines. The dry run with keys `D1`, `D2`, `F` was refused: `[V11] docs/plans/2026-10-25-m5-w2-execute-topology.md: **Source:** names "D1" but the plan is not registered for it` (4 plans name `D1`, 3 name `D2`, 3 name `F`).
- With keys `W-H2` … `W-F`, `W-END` and the letters as aliases, every `add-unit` passed and `check` exited 0. Rule V11 matches keys only, not aliases (plugin `docs/schema.md`, V11).

**Briefs as sections of one programme document.**

- One file may be registered for several units by distinct `section` values; a section must match exactly one heading.
- Dry run: `docs/plans/programme.md` with `## W-H2: …` and `## W-B: …` sections, each with its own `### Milestones` table, registered with `add-plan <key> docs/plans/programme.md --section <key> --role brief`, then `write` and `check`: exit 0, and `tickets status` showed each ticket `scheduled` in its unit (`W-H2 M1`, `W-B M1`).
- `add-plan` changes the scheduling, so the tickets index region turns stale until the top-level `write` (which writes both the register region and the tickets region) runs (dry run).

**The test wrapper must be a promptfoo exec case.**

- `planning-setup` installs a `node:test` wrapper (no root `package.json` here, so it would pick the pytest template). AGENTS.md forbids both: "Do not introduce `node:test`, Jest, Mocha, or other unit test frameworks."
- The exec provider `tests/promptfoo/providers/script-runner.js` runs `node <script_path> <script_args>` in a fresh temp dir. `scripts/extract-skill-content.js` resolves `repo://` in `script_path` and `{{repo_root}}` in `script_args` (`:71-80`). So `check --root {{repo_root}}` runs the check on the worktree under test (F-exec-suite-guards-for-new-dataset-4, F-exec-suite-guards-for-new-dataset-13).
- From a temp cwd, `node <repo>/scripts/plan-register.mjs check --root <repo>` printed both valid lines and exited 0 in 0.8 s (dry run). `check` only reads files.
- The suite guards: `check-spec-id-coverage.js` fails only on a drop below `baselines/spec-id-coverage.json`, never on growth; its floors in `datasets/spec-id-coverage-exec.yaml` are `>=` checks (at least 77 datasets). `check-dataset-asserts.js` flags empty regexes, negative-only cases and key-only `contains` (F-exec-suite-guards-for-new-dataset-6, F-exec-suite-guards-for-new-dataset-7, F-exec-suite-guards-for-new-dataset-9).

**No other surface reacts to the new files.**

- The site reads only `docs/skills/**` and `docs/*.md` (`site/src/content.config.ts`). `check-docs-copies.js` compares only `docs/skills` and `docs/specs` (`DIRS`, `:23`). So `docs/plans/`, `docs/TODO/` and `docs/tickets/` need no site copy (F-repo-surfaces-reacting-to-new-files-2, F-repo-surfaces-reacting-to-new-files-5).
- Review dimensions trigger on `**/*.js` and `**/scripts/**/*.js`; the vendored `scripts/plan-register.mjs` is `.mjs` and the schema is not under `schemas/`, so no review dimension reads the 5,000-line bundle. The new dataset triggers `test-quality` (F-repo-surfaces-reacting-to-new-files-6).
- None of `plugins/sdlc-utilities/scripts` or hooks reads `docs/plans/` (grep).

**Item check at HEAD.**

- #9422 shipped in lean-w35 (PR #112, `4ab3be8`: `check-docs-copies.js`, `check-spec-id-coverage.js` and `mutation-smoke.js` exist). #9423 shipped in lean-w37 (PR #114, `19f54bc`: the provider runs each case in a `promptfoo-cwd-*` temp dir). Both are dropped: no ticket.
- #9461 is the tracking line of this wave; tracking lines stay in `todos.md`, so it gets no ticket.
- The other 20 open todos (#9424 … #9463) are open at HEAD; they become 21 tickets (#9427 is split, see Key Decisions).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Unit keys | no | keys `W-H2`, `W-B`, `W-D1`, `W-D2`, `W-F`, gate `W-END`; the wave letters are aliases | bare letters collide with the source lines of old plans (V11, measured) |
| Test wrapper | no | one promptfoo exec case runs `check`; no `node:test` or pytest wrapper | AGENTS.md allows only promptfoo tests |
| Wave L itself | no | not registered as a unit; this plan stays unregistered | L is the wave in flight; history up to lean-w37 stays in the ledger, and L closes into that history |
| #9422, #9423 | no | no ticket | shipped (PR #112, PR #114) |
| #9461 | no | no ticket | tracking line; `todos.md` keeps tracking lines |
| #9427 | no | split into two tickets: pre-push tier (W-H2) and the rest (W-F) | the wave order splits it; one ticket has one open home (TV7) |
| #9463 | no | scheduled in W-F | the todo names no wave ("later wave"); W-F already holds the execute-coverage work |
| #9440, #9441 | no | `task` tickets, not `defect` | a `defect` ticket needs a promoted TODO note; no new TODO notes for single items |
| Ticket acceptance | no | the planner drafted the acceptance items | the todos have none; the owner approves them at the merge of this PR |
| Tickets index region | no | enabled in `docs/tickets/README.md` | this repository has no Markdown link checker, so the region's `archive/` link (no directory yet) breaks nothing |
| Rules file | no | the Planning conventions go into a new `docs/plans/PLAN_GUIDELINES.md` (the plugin default `guidelinesFile`), not into AGENTS.md | AGENTS.md is the owner's file of repository rules; the conventions are planning rules, and the default keeps later `planning-setup --doctor` runs quiet |
| TK-005, TK-006 | no | tickets for #9440 and #9441 although they say "low" | they are audit #102 findings scheduled in wave B by the wave order, not deferred review lows of lean-w34 to lean-w36; the no-ticket rule covers only the lows ledger |
| Task 4 class | no | Standard, not Complex, despite 23 files | 21 files are CLI-generated skeletons; the hand-written part is 21 short bodies copied from the task's table |
| Trimming `todos.md` | no | not a task | `todos.md` is gitignored; the main session trims it after the merge |

## Key Decisions

- **Prefixed keys (`W-H2`) over bare wave letters (`H2`).** Bare letters `D1`, `D2`, `F` (and `A`, `C`, `P`) already appear as tokens on the source lines of old plans, so the check refuses them (ADOPT F-lift-planning-cli-rules-and-layout-5, F-lift-planning-cli-rules-and-layout-6). The prefix keeps the keys unique. The letters stay usable: they are aliases, and every command accepts an alias.

- **A promptfoo exec case over the plugin's test wrapper.** The plugin ships a `node:test` file. This project allows only promptfoo tests. One exec case runs the same command (`check`) and expects exit 0, so the guard is the same (ADOPT F-exec-suite-guards-for-new-dataset-11).

- **`--root {{repo_root}}` over a fixtures-fs copy of the repository.** The discovery brief suggested a fixture copy as `project_root` (REJECT F-exec-suite-guards-for-new-dataset-13). A copy would check a frozen snapshot, not the register of the branch under test. `check` only reads files, and the dry run passed from a temp cwd with `--root`.

- **One programme document with a section per wave, over one brief file per wave.** Six small files would repeat the same header. One file `docs/plans/programme.md` keeps the order readable top to bottom. Each section is registered as the brief of its unit, which the CLI supports (`--section`).

- **A merged `docs/**` change triggers a Pages deploy (F-repo-surfaces-reacting-to-new-files-4, F-repo-surfaces-reacting-to-new-files-3).** NOT-APPLICABLE as a risk: the site collections ignore the new directories, so the deploy builds the same pages.

- **Flat `task` tickets over epics and stories.** The todos are independent follow-ups. A parent ticket would add a level nobody plans against. Each ticket names its todo id in the title, so the link back to `todos.md` stays visible.

- **A strict chain of tasks over parallel tasks.** The register, the tickets and the regions are shared files, and each CLI command reads the state the previous one wrote. Only the two tasks that touch none of them (the lows notes and the conventions) run in parallel. Ticket ids are handed out in creation order, so the ticket task creates them one by one in a fixed order.

- **The ticket task creates 23 files.** The 5-file bound is meant for hand-written work. Here the CLI writes 21 ticket skeletons from one template; the worker only fills their bodies from the table in the task. Splitting the task would race the id counter.

## Contract Examples

**docs** (Tasks 1 to 5):

```markdown
**Contract:**
- shape (docs): CREATE `docs/TODO/lows-lean-w34.md`: title heading, purpose line, Impact line, source line, format line, then the frozen rows verbatim.
- names: heading `# Deferred lows: lean-w34 (PR #111)`.
- mirror: the frozen copy `.sdlc/orchestration/programme-lows.md`, section `## lean-w34 (PR #111)`.
- decisions: rows copied byte for byte, the `text lost` row included.
- sync: homed to `W-END` by Task 3 (`home-todo`).
```

**code** (Task 6):

```markdown
**Contract:**
- shape (code): one exec case; `script_path: "repo://scripts/plan-register.mjs"`, `script_args: "check --root {{repo_root}}"`, `script_show_exit: true`; three `icontains` assertions.
- names: dataset `datasets/plan-register-exec.yaml`.
- mirror: `datasets/validate-cost-tiers-exec.yaml:5-17`.
- decisions: positive assertions only, so `check-dataset-asserts.js` passes without an allowlist entry.
- sync: listed once in `promptfooconfig-exec.yaml`; baseline entry added by `check-spec-id-coverage.js --update`.
```

## Tasks

### Task 1: Lows TODO notes for lean-w34, lean-w35 and lean-w36

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `docs/TODO/lows-lean-w34.md`
- Create: `docs/TODO/lows-lean-w35.md`
- Create: `docs/TODO/lows-lean-w36.md`

**Notes:** The source file is untracked and lives only in the main checkout, so its frozen rows are copied into this task (F-lift-planning-cli-rules-and-layout-12); lean-w37 had 0 lows, so it gets no note.

**Acceptance criteria:**
- [ ] The three files exist with the layout below, and their rows equal the rows below byte for byte (6, 10 and 2 rows), the `text lost` rows included.
- [ ] No other file under `docs/TODO/` is created (no README, no per-low note).

**Contract:**
- shape (docs): three new files, each in this layout (shown for lean-w34; for the others replace the wave, PR and rows):

  ```markdown
  # Deferred lows: lean-w34 (PR #111)

  Deferred review lows of lean-w34, homed to the END gate `W-END` (decision PD-1 in `docs/plans/decisions.md`). This programme only.

  Impact: the END audit re-checks every row on HEAD (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap.

  Source: `.sdlc/orchestration/programme-lows.md`, written by lean-sdlc-w37-main on 2026-11-19 (frozen copy sha256 d0b8b598918fb82d4a0dc62a76ed6d5d7d77041769bc4a4e765d9f9840bcdc26), section `## lean-w34 (PR #111)`, rows copied verbatim.

  Format: severity | path:line | title | one-line text | wave/PR. No line number where the source had none.

  <rows>
  ```

- names: `docs/TODO/lows-lean-w34.md` (`# Deferred lows: lean-w34 (PR #111)`), `docs/TODO/lows-lean-w35.md` (`# Deferred lows: lean-w35 (PR #112)`), `docs/TODO/lows-lean-w36.md` (`# Deferred lows: lean-w36 (PR #113)`).
- mirror: the frozen rows below are the only source.
- decisions: no row is edited, merged or dropped; the `note` rows stay.
- sync: Task 3 homes the three notes to `W-END`; Task 5's `W-END` section names them.
- example: the rows, verbatim. lean-w34:

  ```text
  - low | plugins/sdlc-utilities/scripts/skill/ship.js:526 | Missing space in computeSteps signature | `(flags,flagSources)` lacks a space after the comma | lean-w34 / #111
  - low | plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:41 | Iteration-1 diff-material command is inline | the sibling rule uses a bash block | lean-w34 / #111
  - low | plugins/sdlc-utilities/agents/plan-critique-orchestrator.md:104 | --lanes row holds two overlapping descriptions | lens-only `""` dropped | lean-w34 / #111
  - low | plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md:456 | Footer added after Step 5 approval | placeholders not in code spans | lean-w34 / #111
  - low | docs/specs/plan-sdlc.md (R75) | R75 Step 5 dispatch rule not updated for new R76 rerun lanes | spec R75 rerun lanes | lean-w34 / #111
  - low | (unknown) | 4 lows, text lost (counts-only) | — | lean-w34 / #111
  ```

  lean-w35:

  ```text
  - low | tests/promptfoo/scripts/mutation-smoke.js | --only without a value silently runs every mutation | — | lean-w35 / #112
  - low | tests/promptfoo/scripts/mutation-smoke.js | --run does not verify the mutation applied before running promptfoo | — | lean-w35 / #112
  - low | tests/promptfoo/scripts/mutation-smoke.js | Mutation expected to survive makes --run always report ok:false | — | lean-w35 / #112
  - low | tests/promptfoo/scripts/check-dataset-asserts.js:175 | Allowlist JSON parse error lacks file context | inconsistent with the baseline reader | lean-w35 / #112
  - low | tests/promptfoo/scripts/check-spec-id-coverage.js:73 | Missing exec config throws ENOENT | the sibling lint skips a missing config | lean-w35 / #112
  - low | tests/promptfoo/scripts/mutation-smoke.js | Temp path built by string concatenation | — | lean-w35 / #112
  - low | tests/promptfoo/scripts/mutation-smoke.js | A mutation that does not apply is reported as a survivor, not an error | — | lean-w35 / #112
  - low | tests/promptfoo/scripts/mutation-smoke.js | One mutation is declared to survive, so --run can never report ok | — | lean-w35 / #112
  - low | (unknown) | 1 low, text lost (counts-only) | — | lean-w35 / #112
  - note | tests/promptfoo/scripts/mutation-smoke.js:164,165,172,187 | END-line file:line list for the mutation-smoke lows above (mapping per line not recorded) | — | lean-w35 / #112
  ```

  lean-w36:

  ```text
  - low | (unknown) | 2 lows, text lost (counts-only) | — | lean-w36 / #113
  - note | plugins/sdlc-utilities/agents/ship-step-received-review.md:21; plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:612 | END-line file:line list for the lean-w36 lows (titles not recorded) | — | lean-w36 / #113
  ```

### Task 2: Planning conventions in the rules file

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `docs/plans/PLAN_GUIDELINES.md`

**Notes:** `planning-setup` inserts the plugin's conventions once into `config.guidelinesFile`, and AGENTS.md is owner-curated, so the default `docs/plans/PLAN_GUIDELINES.md` is used (F-lift-planning-cli-rules-and-layout-11, F-repo-surfaces-reacting-to-new-files-12); the appendix records this repository's choices.

**Acceptance criteria:**
- [ ] `docs/plans/PLAN_GUIDELINES.md` starts with `# Plan guidelines`, a blank line, then the 66 lines of `templates/planning-conventions.md` byte for byte (`## Planning conventions` appears once).
- [ ] The file ends with the `## Project appendix (sdlc-marketplace)` section below, and has no line that starts with `**Source:**` or `**Ticket:**`.

**Contract:**
- shape (docs): CREATE the file with one command, then append the appendix with an edit:

  ```bash
  { printf '# Plan guidelines\n\n'; cat "$HOME/.claude/plugins/cache/lift-planning/lift-planning/0.2.2/templates/planning-conventions.md"; } > docs/plans/PLAN_GUIDELINES.md
  ```

  Appendix (audience: maintainers and planning agents of this repository):

  ```markdown
  ## Project appendix (sdlc-marketplace)

  - **Unit name:** `wave`. Delivery keys match `^W-(?:[A-Z][0-9]?)$` (for example `W-H2`); the gate key is `W-END`. The wave letter of the lean wave order is the alias (`H2`, `END`). Bare letters are not keys: they collide with tokens on the source lines of older plans (rule V11).
  - **Programme document:** `docs/plans/programme.md`, one `## <key>: <title>` section per unit, registered as that unit's brief. Each section schedules its tickets in a `### Milestones` table.
  - **Generated region:** `docs/plans/README.md`, marker `plan-register`, views `units`, `order`, `todos`. The tickets index is the `tickets-index` region of `docs/tickets/README.md`.
  - **Plan directories:** `docs/plans` and `docs/archived/plans` (not recursive). The archive is `docs/archived/plans`, banner `ARCHIVED / {outcome} — {closedBy}`.
  - **TODO notes:** `docs/TODO` (open) and `docs/TODO/archive` (closed). Deferred review lows of waves H1 to F go only to one note per wave, `docs/TODO/lows-<wave>.md`, homed to `W-END` (PD-1); never to a ticket or a note per low.
  - **Decision log:** `docs/plans/decisions.md`, ids `PD-<n>`.
  - **Tickets:** `docs/tickets/`, schema `tickets/1`, plugin defaults.
  - **Test:** the exec case `plan-register` in `tests/promptfoo/datasets/plan-register-exec.yaml` runs `node scripts/plan-register.mjs check` (this project allows only promptfoo tests). Fix a failure with `node scripts/plan-register.mjs write`.
  - **History:** waves lean-w1 to lean-w38 are not in the register; their record is the lean ledger.
  ```

- names: `# Plan guidelines`, `## Planning conventions` (from the template), `## Project appendix (sdlc-marketplace)`.
- mirror: plugin `skills/planning-setup/SKILL.md` step 10.
- decisions: the template text is not edited.
- sync: the key pattern, region and paths equal Task 3's `config`; the dataset path equals Task 6.

### Task 3: Register, vendored CLI, decision log, units and lows homes

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** build

**Files:**
- Create: `docs/plans/register.json`
- Create: `docs/plans/README.md`
- Create: `docs/plans/decisions.md`
- Create: `scripts/plan-register.mjs`
- Create: `scripts/plan-register-1.schema.json`

**Notes:** `vendor` must run from the plugin copy, and a register must exist first so `vendor` finds the repository root; units and homes go through the CLI so the register stays canonical (F-lift-planning-cli-rules-and-layout-1, F-lift-planning-cli-rules-and-layout-2). Run every command from the repository root.

**Acceptance criteria:**
- [ ] Line 1 of `scripts/plan-register.mjs` starts with `// plan-register 0.2.2 · schema plan-register/1 · vendored from lift-planning@v0.2.2`, and `scripts/plan-register-1.schema.json` is byte-identical to the plugin's `schema/plan-register-1.schema.json`.
- [ ] `node scripts/plan-register.mjs check` exits 0 and prints `plan-register: register valid; 1 region(s) current`.
- [ ] `node scripts/plan-register.mjs status --json` lists the six units of the table below with their aliases, kinds, titles and `dependsOn`, and `unhomedTodos` is empty.
- [ ] `docs/plans/README.md` lists `lows-lean-w34`, `lows-lean-w35` and `lows-lean-w36` under `**Open TODO notes**` with wave `W-END`.
- [ ] `node scripts/plan-register.mjs doctor` prints `plan-register doctor: ok`.

**Contract:**
- shape (docs): the register `config` (written by hand before the first CLI call; `phases` and `units` empty):

  ```json
  {
    "$schema": "../../scripts/plan-register-1.schema.json",
    "schema": "plan-register/1",
    "config": {
      "unitName": "wave",
      "keyPatterns": { "delivery": "^W-(?:[A-Z][0-9]?)$", "gate": "^W-END$" },
      "planDirs": [
        { "path": "docs/plans", "recursive": false },
        { "path": "docs/archived/plans", "recursive": false }
      ],
      "regions": [
        { "file": "docs/plans/README.md", "marker": "plan-register", "views": ["units", "order", "todos"] }
      ],
      "todos": { "dir": "docs/TODO", "archiveDir": "docs/TODO/archive", "unhomed": {} },
      "decisionLogs": [ { "path": "docs/plans/decisions.md", "idPattern": "^PD-\\d+$" } ],
      "skipReasonMin": 15,
      "archive": { "dir": "docs/archived/plans", "banner": "ARCHIVED / {outcome} — {closedBy}", "closedBy": "PR #{pr}, {sha}" },
      "guidelinesFile": "docs/plans/PLAN_GUIDELINES.md"
    },
    "phases": [],
    "units": []
  }
  ```

  `docs/plans/README.md` before the first `write`:

  ```markdown
  # Plans

  Executable plans of this repository and the generated programme status. The register is `docs/plans/register.json`; the programme document is `docs/plans/programme.md`. Do not edit the region below by hand: run `node scripts/plan-register.mjs write`.

  <!-- plan-register:start -->
  <!-- plan-register:end -->
  ```

  `docs/plans/decisions.md`:

  ```markdown
  # Programme decisions

  Append-only. The log wins over the text of a plan.

  ## PD-1: Deferred lows of waves H1 to F go to the END gate

  - **Date and owner:** 2026-11-19, owner (lows ledger by the architect, strong, accepted).
  - **Decision:** this programme only, not a skill rule. Every deferred review low of waves H1 to F goes to one TODO note per wave, `docs/TODO/lows-<wave>.md` (severity, path:line, title, one-line text, wave/PR), homed to the gate unit `W-END`. No per-wave low batches. The END audit gets every note as context and re-checks each row on HEAD (STILL PRESENT / FIXED / NOT A DEFECT, with file:line), outside its 15-defect cap. No post-merge audit and no backlog clearing before END.
  - **Rejected options:** per-wave low batches (overridden for H1 to F); one file `docs/plans/programme-lows.md`; a ticket or a TODO note per low.
  - **Made obsolete:** the per-wave backlog batching for waves H1 to F; the untracked `.sdlc/orchestration/programme-lows.md` once wave L merges (its rows are in `docs/TODO/lows-lean-w34.md`, `lows-lean-w35.md` and `lows-lean-w36.md`).
  ```

  Units (one `add-unit` each, in this order, without `--write`):

  | Key | Alias | Kind | Title | dependsOn | Other flags |
  |---|---|---|---|---|---|
  | `W-H2` | `H2` | delivery | Suite speed infrastructure, pre-push tier and per-round review findings | none | |
  | `W-B` | `B` | delivery | Suite false passes and the guardrail table re-splice | `W-H2` | |
  | `W-D1` | `D1` | delivery | Suite reduction | `W-B` | |
  | `W-D2` | `D2` | delivery | Ship, execute and plan follow-ups | `W-D1` | |
  | `W-F` | `F` | delivery | Suite coverage gaps, tiers and structure | `W-D2` | |
  | `W-END` | `END` | gate | Programme post-merge audit | `W-F` | `--owner owner --decision PD-1` |

  Call order:

  ```text
  1. Write docs/plans/register.json, docs/plans/README.md, docs/plans/decisions.md (above)
  2. node "$HOME/.claude/plugins/cache/lift-planning/lift-planning/0.2.2/dist/plan-register.mjs" vendor
     → scripts/plan-register.mjs: none → 0.2.2 / scripts/plan-register-1.schema.json: updated
  3. node scripts/plan-register.mjs add-unit W-H2 --alias H2 --title "Suite speed infrastructure, pre-push tier and per-round review findings"
     node scripts/plan-register.mjs add-unit W-B --alias B --title "Suite false passes and the guardrail table re-splice" --depends-on W-H2
     … (one call per row; W-END adds --kind gate --owner owner --decision PD-1 --depends-on W-F)
  4. node scripts/plan-register.mjs home-todo docs/TODO/lows-lean-w34.md W-END   (then lows-lean-w35.md, lows-lean-w36.md)
  5. node scripts/plan-register.mjs write
  6. node scripts/plan-register.mjs check   → exit 0
  ```

- names: units `W-H2`, `W-B`, `W-D1`, `W-D2`, `W-F`, `W-END`; decision `PD-1`; marker `plan-register`.
- mirror: plugin `templates/register.json` (only `config` changes) and `skills/planning-setup/SKILL.md` steps 5 to 7, 11, 12; `skills/todo-home/SKILL.md` step 4.
- decisions: never edit the register by hand after step 3; a refused command (exit 1) is a stop, not a retry with other values.
- sync: Task 2's appendix, Task 5's section headings and Task 6's case read these keys and paths.

### Task 4: Tickets config and one ticket per open todo

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** build

**Files:**
- Create: `docs/tickets/config.json`
- Create: `docs/tickets/README.md`
- Create: `docs/tickets/TK-001-suite-speed-infra/ticket.md`
- Create: `docs/tickets/TK-002-review-round-findings/ticket.md`
- Create: `docs/tickets/TK-003-prepush-exec-tier/ticket.md`
- Create: `docs/tickets/TK-004-suite-false-passes/ticket.md`
- Create: `docs/tickets/TK-005-jira-p10-force-refresh/ticket.md`
- Create: `docs/tickets/TK-006-rr-e10-stop-text/ticket.md`
- Create: `docs/tickets/TK-007-guardrail-table-resplice/ticket.md`
- Create: `docs/tickets/TK-008-suite-reduction/ticket.md`
- Create: `docs/tickets/TK-009-removed-phrase-cases/ticket.md`
- Create: `docs/tickets/TK-010-commit-waits-drafter/ticket.md`
- Create: `docs/tickets/TK-011-r74-rerun-lanes/ticket.md`
- Create: `docs/tickets/TK-012-spec-review-step/ticket.md`
- Create: `docs/tickets/TK-013-ship-step-plugin-root/ticket.md`
- Create: `docs/tickets/TK-014-installed-plugin-doc/ticket.md`
- Create: `docs/tickets/TK-015-ship-summary-file/ticket.md`
- Create: `docs/tickets/TK-016-stop-hook-step-agent/ticket.md`
- Create: `docs/tickets/TK-017-worktree-config-reads/ticket.md`
- Create: `docs/tickets/TK-018-state-exact-branch/ticket.md`
- Create: `docs/tickets/TK-019-suite-coverage-gaps/ticket.md`
- Create: `docs/tickets/TK-020-suite-tiers-structure/ticket.md`
- Create: `docs/tickets/TK-021-wave-split-no-exit/ticket.md`

**Notes:** The CLI hands out ids in creation order, so the order of the table is the contract (F-lift-planning-cli-rules-and-layout-13, F-lift-planning-cli-rules-and-layout-14); `todos.md` is not in the worktree, so its lines are quoted in this task. See Key Decisions on the file count.

**Acceptance criteria:**
- [ ] `docs/tickets/config.json` and `docs/tickets/README.md` are byte copies of the plugin's `templates/tickets/config.json` and `templates/tickets/README.md`, except the generated region of `README.md`.
- [ ] Each `tickets new` call printed `created docs/tickets/<ID>-<slug>/ticket.md (<ID>)` with the id and slug of its table row; the 21 directories are exactly the paths under **Files:**.
- [ ] Each `ticket.md` keeps the front matter and the `# <ID>: <title>` heading the CLI wrote; `## Why` holds its todo line from the list below, `## What` its What text, `## Acceptance` its items as `- A1: …`, `- A2: …`, `## Notes` the notes line; `## Files in this ticket` keeps its placeholder.
- [ ] No ticket body has a `- [ ]` box or a line that starts with `status`, `state` or `progress`.
- [ ] `node scripts/plan-register.mjs tickets write`, then `node scripts/plan-register.mjs tickets check` exits 0 with `21 ticket(s)`.

**Contract:**
- shape (docs): call order, from the repository root:

  ```text
  1. cp "$HOME/.claude/plugins/cache/lift-planning/lift-planning/0.2.2/templates/tickets/config.json" docs/tickets/config.json
     cp "$HOME/.claude/plugins/cache/lift-planning/lift-planning/0.2.2/templates/tickets/README.md" docs/tickets/README.md
  2. For each row, in id order, one call; compare the printed id with the row; on a mismatch stop (BLOCKED):
     node scripts/plan-register.mjs tickets new --type task --title "<Title>" --slug <slug>
  3. Fill each ticket.md body (replace the placeholders of ## Why, ## What, ## Acceptance, ## Notes).
  4. node scripts/plan-register.mjs tickets write
  5. node scripts/plan-register.mjs tickets check   → exit 0
  ```

  Tickets (Why = the todo line with that id from the list after the table; the Notes line of every ticket is `Moved from .sdlc/orchestration/todos.md (<todo id>) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.`):

  | ID | slug | Title | Todo | What | Acceptance |
  |---|---|---|---|---|---|
  | TK-001 | suite-speed-infra | Suite speed infrastructure (#9425) | #9425 | Memoised fixture build per run, drop the wasted project_root, an in-process gh stub for the github cases and the C16 loop. Parallel runs are supported; the default stays one thread. | A1: each fixture is built once per run and the github cases use an in-process gh stub. A2: an owner trial run at -j 4 passes, while maxConcurrency, the docs, the Taskfile, the pre-push hook and CI keep -j 1 as the default. |
  | TK-002 | review-round-findings | Per-round review findings in review-summary (#9462) | #9462 | Write the findings array (severity, path, line, title) of every review round into review-summary-<slug>.json, or let ship keep a per-round copy. | A1: after a ship run, the findings of every review round are on disk, including rounds below the received-review threshold. A2: the lean ledger can record finding text for such rounds instead of counts only. |
  | TK-003 | prepush-exec-tier | Fast pre-push exec tier (#9427, part) | #9427 | The fast pre-push tier only. The rest of #9427 is TK-020. If this tier is Complex and W-H2 would reach 3 Complex tasks, move the ticket to W-F. | A1: the pre-push hook runs a fast exec tier, whose content the owner decided, instead of both full exec configs. A2: the full exec configs still run on demand. |
  | TK-004 | suite-false-passes | Suite false passes (#9424) | #9424 | Make each exec case named in the todo fail when the behaviour it covers breaks. | A1: each listed case fails when the behaviour it covers is broken on purpose. A2: the exec suite passes on the fixed code. |
  | TK-005 | jira-p10-force-refresh | Jira P10 forceRefresh false without the flag (#9440) | #9440 | Cover jira P10: forceRefresh is false when the flag is absent. | A1: an exec case in jira-sdlc-exec.yaml asserts forceRefresh false when no flag is passed. A2: the case fails when forceRefresh turns true without the flag. |
  | TK-006 | rr-e10-stop-text | Received-review E10 stop text check (#9441) | #9441 | Assert the stop text of the received-review E10 invalid-value case. | A1: the E10 case in received-review-prepare-exec.yaml asserts the stop text. A2: the case fails when the stop text changes. |
  | TK-007 | guardrail-table-resplice | Re-splice Guardrail Compliance after fixes (#9453) | #9453 | Re-splice the Guardrail Compliance table from the newest merged.json with a guardrail lane after the R74 re-check and after the last Step 5 iteration. | A1: a plan whose guardrail finding was fixed during critique shows no stale FAIL row. A2: the re-splice also runs after the R74 re-check. |
  | TK-008 | suite-reduction | Suite reduction (#9426) | #9426 | About 230 merges or removals by dataset family; delete 15 orphan fixtures-fs dirs and 2 orphan fixtures. | A1: the merged and removed cases keep every cited spec id and pass the coverage baseline after a reviewed update. A2: the orphan fixtures-fs dirs and fixtures are deleted. |
  | TK-009 | removed-phrase-cases | Update exec cases of removed phrases (#9445) | #9445 | The received-review fix step greps the datasets for each phrase it removes and updates those cases in the same commit. | A1: a fix that removes a phrase also updates every exec case that counted it, in the same commit. A2: no exec case counts a phrase that the fix removed. |
  | TK-010 | commit-waits-drafter | Commit step waits for its message drafter (#9446) | #9446 | ship-step-commit waits for its message drafter before it returns. | A1: ship-step-commit returns only after its message drafter has finished. A2: the commit carries the drafted message. |
  | TK-011 | r74-rerun-lanes | R74 re-check keeps the rerun lanes (#9449) | #9449 | recheckLanes keeps the rerun lanes on a non-material fix. | A1: the R74 re-check dispatches the rerun lanes after a non-material fix. A2: an exec case covers it. |
  | TK-012 | spec-review-step | Final spec-compliance review runs or records a skip (#9451) | #9451 | execute-plan-sdlc runs Step 8-bis or records an explicit skip that verify-completeness checks. | A1: every execute run either runs the final spec-compliance reviewer or records an explicit skip. A2: verify-completeness fails a run that has neither. |
  | TK-013 | ship-step-plugin-root | Ship-step prompts pass PLUGIN_ROOT (#9452) | #9452 | Pass PLUGIN_ROOT explicitly in the ship-step dispatch prompts. | A1: every ship-step dispatch prompt carries the plugin root line. A2: the pr step resolves its scripts from that root, not from the skill base dir. |
  | TK-014 | installed-plugin-doc | Ship of the plugin uses the installed plugin (#9456) | #9456 | Doc-only, with TK-013: document that ship uses the installed plugin while a wave ships a feature of that same plugin, or let ship steps use the worktree scripts. | A1: the ship docs state which plugin copy ship steps use when a wave ships the plugin itself. A2: they say what to do for a feature the wave ships. |
  | TK-015 | ship-summary-file | Persisted ship summary file (#9454) | #9454 | Write the final summary (finalCheck, head, steps) to .sdlc/execution/ship-summary-<branch slug>.json. | A1: after the final report, the summary file exists with finalCheck, head and steps. A2: finalCheck.commit can be read from the file without the pane. |
  | TK-016 | stop-hook-step-agent | Ship Stop hook quiet while a step agent runs (#9455) | #9455 | Suppress the ship Stop hook while a dispatched step agent is live. | A1: the Stop hook stays quiet while a dispatched step agent is live. A2: it still fires when a step is in progress and no step agent runs. |
  | TK-017 | worktree-config-reads | Config and plan reads from the worktree (#9458) | #9458 | commit-sdlc and received-review prepare read config and plan from the worktree toplevel; state files stay in the main checkout (#9444). Also one sentence in docs/skills/ship-sdlc.md: state, execution and learnings files go to the main checkout's .sdlc/ even from a linked worktree; saved review reports go to the active worktree. | A1: in a linked worktree, commit-sdlc and received-review prepare read config and plan from the worktree toplevel. A2: docs/skills/ship-sdlc.md states where state, execution, learnings and review-report files go. |
  | TK-018 | state-exact-branch | State files match the exact branch name (#9450) | #9450 | Exact-name match in lib/state.js and a branch check on read; the slug format stays unchanged. | A1: two branches whose slugs are equal (fix/a and fix-a) never read each other's state files. A2: the slug format of state file names is unchanged. |
  | TK-019 | suite-coverage-gaps | Suite coverage gaps (#9428) | #9428 | Exec cases for each gap listed in the todo. | A1: each listed gap has an exec case that fails when the covered behaviour breaks. A2: the exec suite passes. |
  | TK-020 | suite-tiers-structure | Suite tiers and structure (#9427) | #9427 | #9427 without the pre-push tier (that part is TK-003): split ship-prepare-exec.yaml (last step of the wave), move -e programs to wrappers, fix stale headers and descriptions. | A1: ship-prepare-exec.yaml is split and the -e programs are wrapper scripts, with no case or assertion lost against the coverage baseline. A2: dataset headers and descriptions match their cases. |
  | TK-021 | wave-split-no-exit | Wave split returns an error instead of exiting (#9463) | #9463 | cmdWaveSplit returns an error instead of calling process.exit inside its best-effort try. | A1: without --state-file and outside a git repo, the wave split prints its result or a JSON error and does not exit with code 2. A2: an exec case covers it. |

  Todo lines (the `## Why` text, verbatim from `.sdlc/orchestration/todos.md` at 19f54bc, the box left out):

  ```text
  #9424 [suite-B] false passes (audit W2, 10 tasks; ledger F-121): plan-format-exec ~:19, pr-prepare :119/:250/:271, sdlc-dimensions :220, config-resolve :39/:72, harvest :431, review :82 + received-review :49/:61 version regex, state-gc :290/:311, jira :361/:224, compact :64, ship-prepare :399/:456 delete + :1634 | src: audit (touches plan-format-exec: after w30)
  #9425 [suite-C] speed infrastructure (audit W4, 6 tasks, 2 Complex): memoised fixture build per run, drop wasted project_root, in-process github gh stub, C16 loop; parallel runs SUPPORTED (safe at -j N: per-case temp cwd, no shared writes, an owner -j 4 trial run) but the DEFAULT stays one thread (-j 1 in config maxConcurrency, docs, Taskfile, pre-push and CI) | src: audit; owner 2026-11-18 "paralel runs should be supported, but by default suite is to be executed in one thread"
  #9426 [suite-D] reduction (audit W5, 8 tasks): ~230 merges/removals by dataset family, gated by #9422; delete 15 orphan fixtures-fs dirs and 2 orphan fixtures | src: audit (after #9422)
  #9427 [suite-E] tiers and structure (audit W6, 5 tasks, 1 Complex): fast pre-push tier, split ship-prepare-exec.yaml (6,578 lines), -e programs to wrappers, stale headers/descriptions | src: audit (owner decision for pre-push tier)
  #9428 [suite-F] coverage gaps (audit W7, 8-10 tasks): state/execute wave-fail task-fail, state/ship decide defer skip fail, review.js scope flags, jira.js cache flags, setup --migrate --only --scan-prs, version.js errors, execute --commit-waves --from-wave, ship --await-review, commit type/scope rejects | src: audit
  #9440 [type:defect] low: jira P10 forceRefresh false (no flag) untested (jira-sdlc-exec.yaml:314) | src: audit #102
  #9441 [type:defect] low: received-review E10 invalid-value stop text unchecked (received-review-prepare-exec.yaml:364) | src: audit #102
  #9445 [type:followup] [later wave] received-review fix step leaves exec cases counting a phrase it removed; grep datasets for removed phrases and update them in the same commit (ledger F-143) | src: w33 ship
  #9446 [type:followup] [later wave] ship-step-commit (haiku) returns before its message drafter finishes; wait for the drafter (ledger F-144) | src: w33 ship
  #9449 [type:followup] [later wave] R74 re-check: recheckLanes drops the rerun lanes on a non-material fix (plan-critique.js:219); found by the w34 planner | src: w34 plan
  #9450 [type:followup] [low, wave D2] slugifyBranch (lib/state.js:68-70) is lossy: fix/a and fix-a share state files when run at the same time (architect 2026-11-19; negligible risk) | src: #9444 review
  #9451 [type:followup] [medium, wave Q candidate] execute-plan-sdlc skipped the final spec-compliance reviewer (Step 8-bis) in w34 and checked criteria itself; the step must run or record an explicit skip that verify-completeness checks | src: F-146 (lean-w34)
  #9452 [type:followup] [low] ship-step pr agent had no `sdlc plugin root:` line and used the skill base dir; pass PLUGIN_ROOT explicitly in ship-step dispatch prompts | src: F-147 (lean-w34)
  #9453 [type:followup] [low, wave B candidate] plan-sdlc leaves stale Guardrail Compliance rows (FAIL) after the planner fixes the finding in Context; recompute the table after fixes (ledger F-141; recurred lean-w36 after #9432 shipped: R74 re-check runs without a splice, SKILL.md:471,491 — re-splice the table from the newest merged.json with a guardrail lane after R74 and the last Step 5 iteration; architect 2026-11-19) | src: steward 2026-11-19
  #9454 [type:followup] [medium, wave D candidate] ship has no persisted final summary file: finalCheck.commit and the final report live only in the pane; write the summary (finalCheck, head, steps) to .sdlc/execution/ship-summary-<branch slug>.json | src: steward 2026-11-19
  #9455 [type:followup] [low, wave D candidate] ship Stop hook fires repeatedly while step subagents run ("step N is in_progress"); suppress it while a dispatched step agent is live | src: steward 2026-11-19 (w34 ship report)
  #9456 [type:followup] [low, wave D2, doc-only with #9452] ship uses the installed plugin while it ships a feature of that same plugin (w34 pr.footer added by hand); document or let ship steps use the worktree scripts for features shipped in the wave | src: steward 2026-11-19 (w34 ship report)
  #9458 [type:followup] [later wave] commit-sdlc and received-review prepare first ran against the main checkout instead of the ship worktree (config and manifests); state files there are intended (#9444), but config/plan reads must come from the worktree toplevel (ledger F-153) | src: w35 ship
  #9462 [type:followup] [medium, wave H2] review: write the findings array (severity, path, line, title) of EVERY review round into review-summary-<slug>.json (or ship keeps a per-round copy), so rounds below the received-review threshold no longer lose finding text (counts-only rounds; ship.js:1854 skips received-review there; ledger.js:318/:324/:342 then store counts only) | src: skill architect 2026-11-19, owner yes
  #9463 [type:followup] [low, later wave] execute.js cmdWaveSplit calls resolveBranchOrExit (process.exit 2) inside its best-effort try when --state-file is absent, so the split result is never printed outside a git repo; return an error instead of exiting (architect 2026-11-19, found by the lean-w37 temp-cwd change) | src: w37 ship
  ```

- names: ids `TK-001` to `TK-021`, type `task`, all top-level.
- mirror: plugin `skills/ticket-new/SKILL.md` steps 4, 6 and 7; body sections from plugin `templates/tickets/body-task.md`.
- decisions: no `--write` on `tickets new` (step 4 writes the index once); acceptance items stay at column 0 as `- A<n>: …`; a refused call (exit 1) is a stop.
- sync: Task 5 schedules exactly these ids; titles keep the todo id so the main session can trim `todos.md` after the merge.
- example: the body of TK-005 after step 3:

  ```markdown
  ## Why

  #9440 [type:defect] low: jira P10 forceRefresh false (no flag) untested (jira-sdlc-exec.yaml:314) | src: audit #102

  ## What

  Cover jira P10: forceRefresh is false when the flag is absent.

  ## Acceptance

  - A1: an exec case in jira-sdlc-exec.yaml asserts forceRefresh false when no flag is passed.
  - A2: the case fails when forceRefresh turns true without the flag.

  ## Notes

  Moved from .sdlc/orchestration/todos.md (#9440) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.
  ```

### Task 5: Programme document with one brief per wave

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3, Task 4
**Verify:** build

**Files:**
- Create: `docs/plans/programme.md`
- Modify: `docs/plans/register.json` — register `docs/plans/programme.md` as the brief of each unit (six `add-plan` calls)
- Modify: `docs/plans/README.md` — generated region rewritten by `write`
- Modify: `docs/tickets/README.md` — tickets index rewritten by `write` (21 tickets scheduled)

**Notes:** A section must match exactly one heading as a token, so the key appears only in its own `## <key>: <title>` heading and the milestone heading carries no key (F-lift-planning-cli-rules-and-layout-4, F-lift-planning-cli-rules-and-layout-15). The scope lines are quoted from the wave order, which is the owner-accepted text.

**Acceptance criteria:**
- [ ] `docs/plans/programme.md` has the layout below: a status table, then one `## <key>: <title>` section per unit in register order, each with its scope quote and (except `W-END`) one `### Milestones` table with the rows below.
- [ ] `node scripts/plan-register.mjs show W-H2 --json` lists the plan `docs/plans/programme.md` with section `W-H2` and role `brief`; the same holds for the other five units.
- [ ] `node scripts/plan-register.mjs check` exits 0 and prints `plan-register: register valid; 1 region(s) current` and `plan-register: tickets valid; 21 ticket(s), 0 archived; 1 region(s) current`.
- [ ] `node scripts/plan-register.mjs tickets status` prints `Counts: 0 backlog, 21 scheduled, 0 planned, 0 in progress, 0 closed`.

**Contract:**
- shape (docs): CREATE `docs/plans/programme.md` (audience: the owner, the main session and planning agents):

  ```markdown
  # sdlc-marketplace programme

  The waves after lean-w37, in order. Each `##` section is the brief of one wave (unit) of `docs/plans/register.json`.

  | Kind of status | Lives in |
  | --- | --- |
  | Waves: order, dependencies, status, PR | `docs/plans/register.json`, shown in `docs/plans/README.md` (generated) |
  | Work items | `docs/tickets/`; their state is computed by `node scripts/plan-register.mjs tickets status` |
  | Scope and schedule of a wave | its section below |
  | Progress | the boxes of the wave's registered executable plan |
  | Decisions | `docs/plans/decisions.md` |
  | Deferred review lows | `docs/TODO/lows-<wave>.md`, homed to `W-END` (PD-1) |
  | History of lean-w1 to lean-w38 | the lean ledger |

  ## W-H2: Suite speed infrastructure, pre-push tier and per-round review findings

  Scope (wave order, 2026-11-19): "H2: #9425 + pre-push tier + #9462 (per-round review findings in review-summary) (default -j 1; -j 4 trial owner-only). If the pre-push tier is Complex and H2 would reach 3 Complex, move it to F."

  ### Milestones

  | Milestone | Tickets | Plan(s) | Estimate |
  | --- | --- | --- | --- |
  | M1 | TK-001, TK-002, TK-003 | none | default -j 1; -j 4 trial owner-only |

  ## W-B: …
  ```

  Section headings, scope quotes and Milestones rows:

  | Section heading | Scope quote (from the wave order) | Milestones rows (Milestone / Tickets / Plan(s) / Estimate) |
  |---|---|---|
  | `## W-H2: Suite speed infrastructure, pre-push tier and per-round review findings` | as above | M1 / TK-001, TK-002, TK-003 / none / default -j 1; -j 4 trial owner-only |
  | `## W-B: Suite false passes and the guardrail table re-splice` | "B: #9424+#9440+#9441 + #9453 (~11 tasks / 0 Complex; lean-w34 lows moved to END, owner 2026-11-19). After H2." | M1 / TK-004, TK-005, TK-006, TK-007 / none / ~11 tasks, 0 Complex |
  | `## W-D1: Suite reduction` | "D1: #9426 reduction (~8 tasks; lean-w35 lows moved to END). After B." | M1 / TK-008 / none / ~8 tasks |
  | `## W-D2: Ship, execute and plan follow-ups` | "D2: #9445, #9446, #9449, #9451, #9452 (+#9456 doc-only), #9454, #9455, #9458 (+ship-sdlc state-location sentence), #9450 (exact-name match in lib/state.js :176/:260 + branch check on read; slug format unchanged) (~10 tasks / <=2 Complex; lean-w36 lows moved to END). After D1." | M1 / TK-009, TK-010, TK-011, TK-012, TK-013, TK-014 / none / ~10 tasks, at most 2 Complex (M1 and M2 together); M2 / TK-015, TK-016, TK-017, TK-018 / none / same wave as M1 |
  | `## W-F: Suite coverage gaps, tiers and structure` | "F: #9428 + #9427 without the pre-push tier; the ship-prepare-exec.yaml split last. After D2." Plus one sentence: "#9463 (no wave named in the todo) is scheduled here (wave L planner, 2026-11-19)." | M1 / TK-019, TK-020, TK-021 / none / ship-prepare-exec.yaml split last |
  | `## W-END: Programme post-merge audit` | the END line of the wave order verbatim (below), then the END brief rule (below), then one line naming the homed notes `docs/TODO/lows-lean-w34.md`, `docs/TODO/lows-lean-w35.md`, `docs/TODO/lows-lean-w36.md` and decision PD-1 | no Milestones table |

  END line and END brief rule (quote both verbatim as two block quotes):

  ```text
  END (owner 2026-11-19, 'accepted with optimisations'): after F, ONE post-merge audit of the programme; its brief carries, as context, every deferred low of every wave (`ledger.js backlog` + review-archive texts, incl. the placement architect's file:line list for lean-w34/w35/w36: plan-critique-orchestrator.md :41/:104, spec R75 rerun lanes, ship.js:526, pr-sdlc SKILL.md:456; mutation-smoke.js :164/:165/:172/:187, check-dataset-asserts.js:175, check-spec-id-coverage.js:73; ship-step-received-review.md:21, received-review SKILL.md:612) plus #9450's wider prefix-match note. Confirmed defects and still-present lows then go to final fix wave(s) sized by the usual bounds. No low becomes a wave before END; new lows from H1..F also accumulate in the backlog.

  END brief: brief.js audit --prs 110-<F PR> (with --context-file from `plan-register show END --brief` once skill PR A is installed), launch prompt adds 're-check every entry of the END gate's homed lows notes on HEAD: STILL PRESENT / FIXED / NOT A DEFECT with file:line, outside the 15-defect cap'.
  ```

  Call order:

  ```text
  1. Write docs/plans/programme.md
  2. node scripts/plan-register.mjs add-plan W-H2 docs/plans/programme.md --section W-H2 --role brief
     … the same for W-B, W-D1, W-D2, W-F, W-END
  3. node scripts/plan-register.mjs write   → docs/plans/README.md (plan-register) and docs/tickets/README.md (tickets-index) updated
  4. node scripts/plan-register.mjs check   → exit 0
  ```

- names: file `docs/plans/programme.md`; section ids `W-H2`, `W-B`, `W-D1`, `W-D2`, `W-F`, `W-END`; milestones `M1`, `M2`.
- mirror: plugin `docs/tickets.md`, "The Milestones table of a brief"; trade-robot-alpha `docs/plans/batch4-consolidation/plan.md` as a programme document.
- decisions: no `**Source:**` line and no box in `programme.md`; a key appears in no other heading of the file; the `Plan(s)` cell stays `none` until a wave's plan is registered.
- sync: the ids equal Task 4; the keys equal Task 3.

### Task 6: Exec case for the register check

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/datasets/plan-register-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — add `- file://datasets/plan-register-exec.yaml` after `- file://datasets/mutation-smoke-exec.yaml`
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — add the new dataset entry (`check-spec-id-coverage.js --update`)

**Notes:** This case stands in for the plugin's `node:test` wrapper (AGENTS.md: promptfoo only). It fails whenever a later change leaves the register, a ticket or a generated region stale, which is the point of the guard (F-exec-suite-guards-for-new-dataset-2, F-exec-suite-guards-for-new-dataset-4, F-exec-suite-guards-for-new-dataset-9).

**Acceptance criteria:**
- [ ] The targeted run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-register|spec-id-coverage|dataset-asserts|fixture-refs"` passes every selected case.
- [ ] Negative check: after `node scripts/plan-register.mjs set W-H2 --title "x"` (without `--write`, so the region turns stale), a run with `--filter-pattern "plan-register:"` fails; after `node scripts/plan-register.mjs set W-H2 --title "Suite speed infrastructure, pre-push tier and per-round review findings"` (again without `--write`) it passes, and `docs/plans/register.json` and `docs/plans/README.md` equal their state before the check.
- [ ] `git diff tests/promptfoo/baselines/spec-id-coverage.json` adds only the entry `datasets/plan-register-exec.yaml` (asserts 3, ids []), and changes no other entry.
- [ ] The floors of `datasets/spec-id-coverage-exec.yaml` case (b) (at least 77 datasets, 1817 cases, 2645 assertions) and of `datasets/fixture-guard-exec.yaml` stay as they are: the counts only grow (+1 dataset, +1 case, +3 assertions).

**Contract:**
- shape (code): CREATE the dataset:

  ```yaml
  # Script execution test for the vendored lift-planning CLI scripts/plan-register.mjs (#9461).
  # It stands in for the plugin's node:test wrapper: this project allows only promptfoo tests.
  # Fix a failure with: node scripts/plan-register.mjs write   (details: node scripts/plan-register.mjs check)

  - description: "plan-register: the register and the tickets are valid and their generated regions are current"
    vars:
      script_path: "repo://scripts/plan-register.mjs"
      script_args: "check --root {{repo_root}}"
      script_show_exit: true
    assert:
      - type: icontains
        value: "plan-register: register valid"
      - type: icontains
        value: "plan-register: tickets valid"
      - type: icontains
        value: "[exit 0]"
  ```

  Then run `node tests/promptfoo/scripts/check-spec-id-coverage.js --update` from the repository root and review the baseline diff.
- names: dataset `datasets/plan-register-exec.yaml`; case description prefix `plan-register:`.
- mirror: `tests/promptfoo/datasets/validate-cost-tiers-exec.yaml:5-17` (a validator run with positive assertions).
- decisions: the case writes nothing (`check` only reads); it runs in the provider's temp cwd with `--root`, so it is hermetic in the sense of #9423. Threat model of the guard: it catches a stale region, a broken register or ticket rule; it does not catch a wrong but valid schedule (accepted gap, reviewed by hand).
- sync: `promptfooconfig-exec.yaml` lists the dataset once; `baselines/spec-id-coverage.json` gains its entry; Task 2's appendix names the dataset path.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source code changes; Task 6 adds the promptfoo exec case and updates the baseline |
| no-ci-bypass | error | PASS | No step skips or disables CI; the new case joins the exec suite and the pre-push hook |
| no-auto-eval | error | PASS | Only a targeted, exec-only config run is used for verification; no run-fix-rerun loop |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Every task traces to the owner decisions of 2026-11-19; extras are listed in Deviations |
| single-responsibility-tasks | warning | FAIL | Task 3 bundles register config, vendored CLI, decision log, six units and three lows homes |
| scripts-over-llm-logic | error | PASS | No skill is edited; all register and ticket changes go through the vendored CLI |
| yagni | warning | PASS | No speculative functionality; no new abstractions |
| cross-skill-consistency | error | PASS | Lean skill and plugin are explicitly untouched; the later profile switch is declared a separate session |
| pr-link-github-issue | error | PASS | #9461 is an internal register id, so the rule does not apply |
| dry | warning | PASS | Plugin templates and CLI are reused; copied rows are data, not logic |
| kiss | warning | PASS | One programme document, flat tickets and one exec case |
| spec-first | error | PASS | No SKILL.md changes |
| project-agnostic | error | PASS | The change is this repository's own planning data and a dogfooding test; no plugin behaviour changes |
| flag-coherence-cross-skill | error | PASS | No skill dispatch or flag gating involved |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites |
| flag-resolution-single-source | warning | PASS | No contractual flags added |
| state-premise | error | PASS | Context states that the programme lives in one gitignored file that no check reads |
| smallest-viable-cut | warning | PASS | Extra scope (the 21 tickets, the conventions) is justified in Key Decisions and Deviations |
| failure-audience | warning | FAIL | The plan does not name who or what fails if it ships incorrectly |
| explicit-non-goals | warning | PASS | Exclusions are stated: no lean skill or plugin changes, no todos.md trim, no node:test wrapper, no per-low notes |
| ambiguity-stops-and-asks | error | PASS | Key choices are recorded in Key Decisions with rationale (keys, wrapper, brief layout) |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is described |
| flag-semantic-consistency-cross-skill | error | PASS | No new flags in skill prepare scripts |
| workspace-mode-compatibility | error | PASS | Docs only; the exec case uses --root {{repo_root}} so it checks the worktree under test; no state or config reader changes |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md, prepare script or orchestrator changes; no dispatched prompts |

## Suggested Review Dimensions

### CREATE: documentation-quality-review

**Why:** Tasks 1, 2, 4 and 5 create many Markdown and JSON files under `docs/TODO/`, `docs/plans/` and `docs/tickets/` (for example `docs/plans/programme.md` and the 21 `docs/tickets/TK-0NN-*/ticket.md` files), and no existing dimension reviews docs prose.

**Severity hint:** medium

**Triggers:** `docs/TODO/**`, `docs/plans/**`, `docs/**`, `scripts/**`, `tests/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `docs/TODO/**`, `docs/plans/**`, `docs/**`, `scripts/**`, `tests/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### CREATE: scripts-review

**Why:** Task 3 vendors `scripts/plan-register.mjs` and `scripts/plan-register-1.schema.json`, which match the `scripts/**` trigger and have no scripts dimension covering them.

**Severity hint:** medium

**Triggers:** `scripts/**`

**Action (dimension):** /setup-sdlc --dimensions — add `scripts-review` with triggers `scripts/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/scripts-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: test-quality (U4)

**Why:** Task 6 adds a `tests/promptfoo/datasets/plan-register-exec.yaml` case whose `script_path` is `repo://scripts/plan-register.mjs`, so the test-quality dimension should also trigger on `tests/promptfoo/scripts/*.mjs`.

**Severity hint:** low

**Patch:** add trigger `tests/promptfoo/scripts/*.mjs`

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — add trigger `tests/promptfoo/scripts/*.mjs`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 0 |
| Correctness | 0 | 0 | 1 | 0 |
| Coherence | 0 | 1 | 0 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Connect the repository to lift-planning 0.2.2 (register, vendored scripts, test wrapper as promptfoo exec case, Planning conventions, generated regions) | Task 2, Task 3, Task 6 | covered |
| 2 Register the gate unit END (dependsOn F) | Task 3 | covered |
| 3 One TODO note per wave (lows-lean-w34/w35/w36), verbatim including 'text lost' rows, homed to END with home-todo | Task 1, Task 3 | covered |
| 4 Decision-log entry recording that deferred lows go to END | Task 3 | covered |
| 5 No ticket or TODO note for any single deferred low | Task 1, Task 4 | covered |
| 6 Register remaining waves H2, B, D1, D2, F as delivery units | Task 3, Task 5 | covered |
| 7 Move every open #94xx todo into a ticket, scheduled in its unit; drop shipped items and the tracking line | Task 4, Task 5 | covered |
| 8 Out of scope: lean skill and profiles, lift-planning plugin, any #94xx fix, history migration, plugins/sdlc-utilities, trimming todos.md | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

The repository now carries its own programme, checked by a test.

- `docs/plans/register.json` holds six waves: `W-H2`, `W-B`, `W-D1`, `W-D2`, `W-F`, and the gate `W-END`, each depending on the one before. The wave letters still work as aliases.

- `docs/plans/README.md` shows the waves, their order and the TODO notes. The CLI generates it; nobody edits it by hand.

- `docs/plans/programme.md` has one section per wave: its scope, quoted from the wave order, and a Milestones table that schedules its tickets.

- `docs/tickets/` holds 21 tickets, one per open follow-up (#9427 split in two). Each is scheduled in exactly one wave.

- `docs/TODO/` holds three notes of deferred review lows, homed to `W-END`. `docs/plans/decisions.md` records why (PD-1).

- `docs/plans/PLAN_GUIDELINES.md` holds the shared Planning conventions and this repository's choices.

- `scripts/plan-register.mjs` and its schema are the vendored CLI 0.2.2. One exec case runs its `check` in the normal exec suite and the pre-push hook.

The lean skill, its profile and `plugins/sdlc-utilities` are unchanged. After the merge, the main session trims `todos.md` to tracking lines; a later session switches the lean profile to the register.

## OpenSpec Appendix

Not applicable — no OpenSpec change
