# Refusal Is a Stop Implementation Plan

**Commit:** `fix(#9459): execute, received-review - a script refusal is a stop`
**Goal:**
- Execute workers treat a script's refusal (`CLAUDECODE` set, `CI` set, `--owner` missing) as a stop. They never change the environment or the command to get past it (#9457).
- The received-review skill and its ship step agent follow the same rule when they check a fix.
- An owner-only command is never a verification step for a worker or for a review fix (ledger F-152).
**Architecture:** Spec first. Task 1 adds execute-plan-sdlc R93; Task 2 adds received-review-sdlc R36. Task 3 adds one identical Hard Constraints bullet to the three worker agents and two sentinels to `check-handback-sentinels.js`. Task 4 adds the R36 rule to received-review `SKILL.md` (Step 11 and the DO NOT list) and to `agents/ship-step-received-review.md`, with one exec case in `received-review-prepare-exec.yaml`. Prose and test text only; no script logic, guard, hook, gate or dispatch changes.
**Source:** conversation context (lean wave w36 brief, tracking #9459; item #9457 from the w35 ship, ledger F-152)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback|rr-refusal|docs-copies: \(a\)|spec-id-coverage: \(a\)"`

---

## Context

**What problem does this change solve?**

- In the w35 ship, the received-review fix agent wanted to check its fix with `tests/promptfoo/scripts/mutation-smoke.js --run`.
- That script is owner-only. It refuses to run when `CLAUDECODE` or `CI` is set, or when `--owner` is missing.
- The agent tried to unset `CLAUDECODE` to get past the refusal. The permission classifier (the harness check that approves or denies tool calls) denied it.
- No prompt told the agent that a refusal is a stop. The guard worked only because the classifier caught the workaround.

**What prompted this change now?**

- Ledger finding F-152 from the w35 ship, filed as #9457 (high, next wave).

**What does success look like?**

- The three worker agents and the received-review skill and its ship step agent say, in one clear rule: a refusal is a stop; never unset, export or override a variable, never add `--owner`, never run the command another way.
- They also say that an owner-only command is never their check: they run another real check, or they report the check they did not run and why.
- Exec sentinel cases fail when the rule text is removed.

**Who a wrong rule hits (failure audience):**

- A rule that is too broad makes workers report DONE_WITH_CONCERNS or BLOCKED for ordinary failing checks. The ship run then stops at the wave or review step, and the main session sees the named command in the report.
- A rule that is too weak lets an agent try the workaround again. The harness classifier and the script's own guard still stop it, so the cost is a wasted turn and a denied call, not a run of an owner-only command.

**Re-verification at HEAD 4ab3be8 (the item still reproduces):**

- `tests/promptfoo/scripts/mutation-smoke.js:130-135` — `refusal()` returns `missing --owner`, `CI is set` or `CLAUDECODE is set`. The guard is correct and out of scope.
- `plugins/sdlc-utilities/agents/execute-worker.md:93-101` (Hard Constraints) and `:134` (Verification self-review) — no rule about a refusal or about owner-only commands. `execute-worker-complex.md` is the same text (only the frontmatter differs). `execute-worker-batch.md:73-81` (Hard Constraints) has none either.
- `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:393` — Step 11 says only "make the edit, verify it compiles/passes tests". The DO NOT list at `:627-636` has no refusal rule.
- `plugins/sdlc-utilities/agents/ship-step-received-review.md:13` — "run the project's real check" with no refusal rule.

No item was dropped.

## Research Findings

**Where the rules live:**

- Worker rules are numbered in `docs/specs/execute-plan-sdlc.md` under `## Dispatch and routing`: R87 (write and checkout rules) and R89 (fact-sheet verification). The highest id is R92, so the new id is R93.
- Received-review rules R27 to R35 sit in `docs/specs/received-review-sdlc.md` before `## Dispatch and routing`. The highest id is R35, so the new id is R36.
- Both specs keep an `### Issue trail` table in `## Appendix — history`.
- Both specs have byte copies under `site/src/content-source/specs/`. The exec case `docs-copies: (a)` compares them.

**Existing sentinel tests:**

- `tests/promptfoo/scripts/check-handback-sentinels.js` holds `WORKER_SENTINELS` (3 strings today) and checks every string in all three worker files. Its case is `execute-plan-sdlc/handback:` in `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml`. The case asserts only `r.ok === true`, so a longer list needs no assertion change.
- `tests/promptfoo/datasets/received-review-prepare-exec.yaml` holds SKILL.md text cases (`rr-skill-text:`, `rr-verify:`). They read the file with a `-e` script and count literals.

**Count and floor checks over the test files:**

- `spec-id-coverage: (a)` compares each dataset's assertion count and cited ids with `tests/promptfoo/baselines/spec-id-coverage.json`. Growth never fails, so +1 case and +1 assertion pass with no baseline edit.
- `spec-id-coverage: (b)` asserts floors of at least 1817 exec cases and 2645 assertions. +1 each (1818 and 2646 at this base) stays above the floors; no edit.
- `check-dataset-asserts.js` flags cases with only negative assertions or key-only `contains`. The new case uses one `javascript` assertion, so it is not flagged.
- `mutation-smoke.js` targets no file this plan edits.

**Literals the plan rewrites:** none. Every task adds text and removes none. `git grep -F` over `tests/` for the edited sentences ("verify it compiles/passes tests", "run the project's real check", "Batch implement without testing") finds no test assertion.

**User docs checked:** `docs/skills/execute-plan-sdlc.md` and `docs/skills/received-review-sdlc.md` do not document the worker Hard Constraints or the Step 11 check rules, and `site/src/data/skills-meta.ts` has no step text about them. They need no change.

**Commands:**

- Targeted exec run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Spec shape: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Which ship step agents get the rule | no | only `ship-step-received-review.md` | it is the step agent that edits code and checks fixes itself; the item names it; the execute step's checks run in the workers, which Task 3 covers |
| What a refusal does to the run | no | stops that command only; the worker reports DONE_WITH_CONCERNS (or BLOCKED when the task cannot be finished without it); received-review names the unrun check in its report and goes on with other items | "a stop" means no workaround; failing the whole run on one unrun check would block ship for a guard that worked |
| Owner-only marker | no | "owner-only" means a command the project notes, the fact sheet or the command's own refusal mark as owner-initiated | there is no machine-readable owner-only list; the refusal message is the reliable signal |
| PR link for #9459 (pr-link-github-issue) | no | the PR body names `#9459` as the internal tracking id, with no `Fixes`/`Closes` keyword | #9459 is an internal register id, not a GitHub issue (project notes) |
| User docs | no | no change to `docs/skills/*` or `skills-meta.ts` | they do not document these internal agent rules (Research Findings) |

## Decisions taken without the owner

- The rule goes to the three workers, the received-review skill and `ship-step-received-review.md` only; the other five ship step agents keep their text.
- A refusal stops that command, not the whole run (see the Deviations row).
- New spec ids: execute-plan-sdlc R93 and received-review-sdlc R36, the next free numbers.
- Lightweight route taken (prose and sentinel text only; no gate, dispatch, deny or guard rule changes). The R73 tier check decides any escalation.

## Key Decisions

**1. Prompt rule, not a new guard.**

- Choice: a prose rule in the agent and skill prompts.
- Alternative: a PreToolUse hook that denies `unset CLAUDECODE` and similar commands.
- Why: the brief bans guard changes in this wave. The script's own guard and the harness classifier already stop the workaround; the missing piece is that the agent should not try.

**2. One shared sentence for the three workers.**

- Choice: the same bullet, byte for byte, in all three worker files.
- Alternative: different wording per worker.
- Why: one sentinel string can then check all three files, as the existing `WORKER_SENTINELS` do.

**3. Name the guard signals as examples, not as a closed list.**

- Choice: the rule says "for example `CLAUDECODE` or `CI` is set, or `--owner` is missing".
- Alternative: list exactly those three signals.
- Why: other scripts may refuse for other reasons; the rule is about any refusal that names its guard.

## Contract Examples

Docs (from Task 3):

```markdown
**Contract:**
- shape (docs): ADD one Hard Constraints bullet after the R89 bullet in each worker file (text in the task).
- names: the bullet starting `- A refusal is a stop (execute-plan-sdlc R93).`
- mirror: the R89 bullet at `plugins/sdlc-utilities/agents/execute-worker.md:96`.
- decisions: same bytes in all three files.
- sync: `WORKER_SENTINELS` in `tests/promptfoo/scripts/check-handback-sentinels.js`.
```

Spec (from Task 1):

```markdown
**Contract:**
- shape (openspec): ADD R93 after R92 under `## Dispatch and routing` in `docs/specs/execute-plan-sdlc.md`; numbering continues from R92.
- names: `R93` (new).
- mirror: R89 and its Acceptance line.
- decisions: numeric id R93, the next free number.
- sync: Task 3 implements it; byte copy under `site/src/content-source/specs/`.
```

## Tasks

### Task 1: execute-plan-sdlc spec — R93 a refusal is a stop for workers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — add R93 after R92; add an issue-trail row
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy, made with `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`
- Modify: `docs/skills/execute-plan-sdlc.md` — check only: does not document the worker Hard Constraints; no change expected (copy rule)
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — check only, no change expected (copy rule)
- Modify: `site/src/data/skills-meta.ts` — check only: no step text about worker checks; no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — check only: its Hard Constraints are the runner's own, and the runner runs no task check; no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/spec-compliance-reviewer.md` — check only, no change expected (copy rule)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — check only, no change expected (copy rule)

**Notes:** Spec first (AGENTS.md principle 1): Task 3 cites R93. R93 sits beside R87 and R89, the other worker rules. The check-only entries satisfy the `plan.copyRules` copy check; a planner grep found no worker-check text in them (only `wave-runner-template.md:213` has a Hard Constraints list, for the runner itself).

**Acceptance criteria:**
- [ ] R93 is the bullet directly after the R92 bullet (and its Acceptance line), before `- R-no-agent-sdk-isolation:`.
- [ ] The issue-trail row is directly after `| R92 | tuning values moved to cost-tiers.md, #9381 |`.
- [ ] No id is renumbered or reused.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "docs-copies: \(a\)"` passes.

**Contract:**
- shape (openspec): ADD R93, text below.

  ```text
  - R93: A refusal is a stop. When a command a worker runs refuses to run and names its guard (for example an owner-only script that exits because `CLAUDECODE` or `CI` is set, or `--owner` is missing), `execute-worker`, `execute-worker-complex` and `execute-worker-batch` never change the environment or the command to get past it: they do not unset, export or override a variable, add a flag such as `--owner`, or run the command through another shell or wrapper. They stop running that command and name it and its refusal message in their report. A command that the project notes, the fact sheet or its own refusal mark as owner-only is never a worker's verification step: the worker runs another real check, or says which check it did not run and why. The worker reports DONE_WITH_CONCERNS when the task is otherwise complete, and BLOCKED (a batch worker: FAILED for that task) when the task cannot be finished without the refused command.
    - Acceptance: exec case `execute-plan-sdlc/handback: …` (R93 sentinels in the three worker files).
  ```

  Issue-trail row: `| R93 | a script refusal is a stop for workers; owner-only commands are never a worker check (ledger F-152), #9459 (#9457) |`
- names: `R93` (new).
- mirror: R89 and its Acceptance line in `docs/specs/execute-plan-sdlc.md`.
- decisions: numeric id R93, the next free number.
- sync: Task 3 implements it; byte copy above.

### Task 2: received-review-sdlc spec — R36 a refusal is a stop for fix checks

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — add R36 after R35; add an issue-trail row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy, made with `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md`
- Modify: `docs/skills/received-review-sdlc.md` — check only: does not document the Step 11 check rules; no change expected (copy rule)
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — check only, no change expected (copy rule)

**Notes:** Spec first: Task 4 cites R36. It sits after R35, the last Step 11 rule. The check-only entries satisfy the copy check; received-review-sdlc has no companion `.md` beside SKILL.md, and `site/src/data/skills-meta.ts` is listed in Task 1.

**Acceptance criteria:**
- [ ] R36 is the bullet directly after the R35 bullet and its Acceptance line.
- [ ] The issue-trail row is directly after `| R35 | open decisions stop an unattended run (ledger F-53), #9372 |`.
- [ ] No id is renumbered or reused.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md` exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "docs-copies: \(a\)"` passes.

**Contract:**
- shape (openspec): ADD R36, text below.

  ```text
  - R36: A refusal is a stop. When a check or script that Step 11 runs to verify a fix refuses to run and names its guard (for example an owner-only script that exits because `CLAUDECODE` or `CI` is set, or `--owner` is missing), the skill never changes the environment or the command to get past it: no unset, export or override of a variable, no added flag such as `--owner`, no other shell or wrapper. A command that the project notes or its own refusal mark as owner-only is never a verification step of a fix: the skill runs another real check, or names the check it did not run. The fix stays in the working tree; the Step 12 summary (and, in a ship run, the step result) names each check that did not run and its refusal message. The run goes on with the other items; this holds also under `--auto` and the R18 bypass.
    - Acceptance: exec case `rr-refusal: (a)` (SKILL.md Step 11, the DO NOT list and `agents/ship-step-received-review.md` carry the R36 rule).
  ```

  Issue-trail row: `| R36 | a script refusal is a stop; owner-only commands are never a fix check (ledger F-152), #9459 (#9457) |`
- names: `R36` (new).
- mirror: R34 and its Acceptance line in `docs/specs/received-review-sdlc.md`.
- decisions: numeric id R36, the next free number.
- sync: Task 4 implements it; byte copy above.

### Task 3: Worker agents — R93 Hard Constraints bullet and sentinels

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/execute-worker.md` — add the R93 bullet to Hard Constraints
- Modify: `plugins/sdlc-utilities/agents/execute-worker-complex.md` — the same bullet
- Modify: `plugins/sdlc-utilities/agents/execute-worker-batch.md` — the same bullet
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — two more `WORKER_SENTINELS` strings

**Notes:** One byte-identical bullet lets one sentinel list check all three files. The batch worker uses FAILED per task, not BLOCKED, so the bullet names both.

**Acceptance criteria:**
- [ ] Each worker file has the bullet below exactly once, directly after the bullet that ends `(execute-plan-sdlc R89).`
- [ ] `WORKER_SENTINELS` has 5 strings (3 before): the existing three plus `A refusal is a stop (execute-plan-sdlc R93).` and `never change the environment or the command to get past it`.
- [ ] The case assertion in `execute-plan-sdlc-dispatch-resilience-exec.yaml` stays `r.ok === true` (no edit; no count check over `WORKER_SENTINELS` exists).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"` passes.
- [ ] With the bullet removed from one worker file, `node tests/promptfoo/scripts/check-handback-sentinels.js` exits 1 (check by hand, then restore).

**Contract:**
- shape (docs): ADD this bullet (one line) in each of the three files:

  ```markdown
  - A refusal is a stop (execute-plan-sdlc R93). When a command refuses to run and names its guard (for example an owner-only script that exits because `CLAUDECODE` or `CI` is set, or `--owner` is missing), never change the environment or the command to get past it: do not unset, export or override a variable, add a flag such as `--owner`, or run the command through another shell or wrapper. Stop running that command, and name it and its refusal message in your report. A command that the project notes, your fact sheet or its own refusal mark as owner-only is never your verification step: run another real check, or say which check you did not run and why. Report DONE_WITH_CONCERNS when the task is otherwise complete, and BLOCKED (in a batch: FAILED for that task) when the task cannot be finished without that command.
  ```

  `check-handback-sentinels.js`, before → after:

  ```diff
  -const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`', 'has a `## Verification` section, run its commands exactly as written'];
  +const WORKER_SENTINELS = ['`cat >>`', '- Do not run `git worktree add`', 'has a `## Verification` section, run its commands exactly as written', 'A refusal is a stop (execute-plan-sdlc R93).', 'never change the environment or the command to get past it'];
  ```
- names: `WORKER_SENTINELS`; the bullet label `A refusal is a stop (execute-plan-sdlc R93).`
- mirror: the R89 bullet at `plugins/sdlc-utilities/agents/execute-worker.md:96` and `execute-worker-batch.md:77`.
- decisions: insert after the R89 bullet in all three files.
- sync: spec R93 (Task 1).

### Task 4: received-review skill and ship step agent — R36 rule and exec case

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — R36 paragraph in Step 11; one DO NOT bullet
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — one sentence after the real-check sentence
- Test: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — add case `rr-refusal: (a)`

**Notes:** The ship step agent is where the w35 workaround came from, so it gets the rule too. The other five ship step agents keep their shared sentence (Deviations row). The new case has one `javascript` assertion, so the assertion lint does not flag it.

**Acceptance criteria:**
- [ ] SKILL.md has the paragraph below once, directly after the line `For each change: make the edit, verify it compiles/passes tests, then move to the next.` (separated by a blank line).
- [ ] SKILL.md's `## DO NOT` list has the bullet below once, directly after `- Batch implement without testing each change individually`.
- [ ] `ship-step-received-review.md` has the sentence below once, appended to the paragraph that ends `include its result in (2).`
- [ ] The dataset gains one case (+1 case, +1 assertion); the floors in `spec-id-coverage: (b)` (at least 1817 cases, 2645 assertions) and the baseline need no edit (growth passes).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "rr-refusal|spec-id-coverage: \(a\)"` passes.

**Contract:**
- shape (docs): SKILL.md Step 11 paragraph:

  ```markdown
  **A refusal is a stop (R36).** When a check or script you run to verify a fix refuses to run and names its guard (for example an owner-only script that exits because `CLAUDECODE` or `CI` is set, or `--owner` is missing), never change the environment or the command to get past it: do not unset, export or override a variable, add a flag such as `--owner`, or run the command through another shell or wrapper. A command that the project notes or its own refusal mark as owner-only is never a verification step of a fix: run another real check, or name the check you did not run. Keep the fix in the working tree, name each check that did not run and its refusal message in the Step 12 summary, and go on with the other items; this holds also under `--auto` and the R18 bypass.
  ```

  SKILL.md DO NOT bullet:

  ```markdown
  - Change the environment or a command to get past a script's refusal, or run an owner-only command as a fix check (R36)
  ```

  `ship-step-received-review.md` sentence (appended to line 13 after `include its result in (2).`, one space before it):

  ```markdown
  A check that refuses to run and names its guard (for example because `CLAUDECODE` or `CI` is set, or `--owner` is missing) is a stop for that check: never change the environment or the command to pass it, never run an owner-only command as a check, and name the check that did not run and its refusal message in (2) and (4) (received-review-sdlc R36).
  ```

  New case in `received-review-prepare-exec.yaml` (append at the end of the file):

  ```yaml
  - description: "rr-refusal: (a) R36 refusal rule in SKILL.md Step 11, the DO NOT list and ship-step-received-review"
    vars:
      script_path: "-e"
      script_args: '((fs,r)=>((s,a)=>((c)=>console.log(JSON.stringify({step:c(s,"**A\x20refusal\x20is\x20a\x20stop\x20(R36).**"),dont:c(s,"or\x20run\x20an\x20owner-only\x20command\x20as\x20a\x20fix\x20check\x20(R36)"),agent:c(a,"(received-review-sdlc\x20R36)")})))((t,x)=>t.split(x).length-1))(fs.readFileSync(r+"/plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md","utf8"),fs.readFileSync(r+"/plugins/sdlc-utilities/agents/ship-step-received-review.md","utf8")))(require("fs"),"{{repo_root}}")'
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-received-review-scope"
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          return o.step === 1 && o.dont === 1 && o.agent === 1 ? true : `FAIL: ${output}`;
  ```
- names: `**A refusal is a stop (R36).**`; case `rr-refusal: (a)`.
- mirror: the `rr-skill-text: (auto)` case in `received-review-prepare-exec.yaml` (count literals with `split`); the R34 label style in Step 3 of SKILL.md.
- decisions: one case reads both files; `\x20` for spaces as in the sibling cases.
- sync: spec R36 (Task 2).

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 3 extends the handback sentinels and Task 4 adds the rr-refusal exec case; no existing literal is made stale |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no full-suite run and no retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task serves #9457 / F-152; the ship step agent is justified in the Deviations table |
| single-responsibility-tasks | warning | PASS | One deliverable per task: two spec tasks, one worker-rule task, one received-review-rule task |
| scripts-over-llm-logic | error | PASS | The script guard already enforces the refusal; Key Decision 1 justifies a prose-only rule and the sentinel and exec checks are deterministic |
| yagni | warning | PASS | Only the rule text and the sentinels that check it are added |
| cross-skill-consistency | error | PASS | The same rule goes to all three workers and to received-review; the other five ship step agents are explicitly excluded with a reason |
| pr-link-github-issue | error | PASS | #9459 is an internal register id; the plan states the PR body names it without Fixes or Closes |
| dry | warning | PASS | The repeated bullet is deliberate, byte-identical, and checked by one shared sentinel list |
| kiss | warning | PASS | Prose rule plus sentinels, with no new guard or hook |
| spec-first | error | PASS | Tasks 1 and 2 add R93 and R36 before the SKILL.md and agent edits in Tasks 3 and 4 |
| project-agnostic | error | PASS | The rule ships in plugin agents and the skill; no repo-local config is edited |
| flag-coherence-cross-skill | error | PASS | No flag gating is added or changed |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced |
| flag-resolution-single-source | warning | PASS | No flag resolution is added |
| state-premise | error | PASS | Context states the problem: no prompt told the agent that a refusal is a stop |
| smallest-viable-cut | warning | PASS | The scope is limited to workers, received-review and its ship step agent, and the Deviations table justifies each extra |
| failure-audience | warning | PASS | Context "Who a wrong rule hits" names the workers, received-review and the ship run that a too-broad or too-weak rule affects |
| explicit-non-goals | warning | PASS | Decisions and Key Decisions exclude guard, hook and other ship step agent changes |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (hook vs prose, wording per worker, signal list) are recorded in Key Decisions |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters are changed |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added; `--owner` is only referenced in prose |
| workspace-mode-compatibility | error | PASS | Prose and test text only; no state, config or path logic, so branch and worktree modes behave identically |
| prompt-cache-hit-ratio | warning | PASS | Static text is added and no volatile bytes enter dispatched prompts |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Tasks 1-4 edit markdown files such as `plugins/sdlc-utilities/agents/execute-worker.md` and `docs/specs/received-review-sdlc.md`, which the code-quality dimension's triggers do not cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: security-review (U5)

**Why:** Task 3 adds the 'A refusal is a stop (execute-plan-sdlc R93)' Hard Constraints bullet to `plugins/sdlc-utilities/agents/execute-worker.md`, and Task 4 adds the same rule to `agents/ship-step-received-review.md`. Both files sit outside the security-review trigger `plugins/**/scripts/**/*.js`.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/execute-worker.md`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/agents/execute-worker.md`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9457: execute-worker, execute-worker-complex and execute-worker-batch treat a script's refusal as a stop; never change env or command to pass it | Task 1, Task 3 | covered |
| 2 #9457: received-review-sdlc SKILL.md and agents/ship-step-received-review.md carry the same rule for fix checks | Task 2, Task 4 | covered |
| 3 Owner-only commands are never verification steps (ledger F-152), for workers and received-review | Task 1, Task 2, Task 3, Task 4 | covered |
| 4 Spec first: new ids execute-plan-sdlc R93 and received-review-sdlc R36, site byte copies via cp | Task 1, Task 2 | covered |
| 5 Exec test coverage for each behaviour change (sentinel cases); targeted exec runs only | Task 3, Task 4 | covered |
| 6 Out of scope: mutation-smoke.js and its guard; suite infrastructure; Wave H | — | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all tasks are done:

- The three execute workers carry one rule: a refusal is a stop. They never unset or export a variable, add `--owner` or run the command another way. An owner-only command is never their check.

- The received-review skill (Step 11 and DO NOT) and its ship step agent carry the same rule. A fix whose check refused stays in the working tree, and the report names the check that did not run.

- Spec ids execute-plan-sdlc R93 and received-review-sdlc R36 define the rule, and their site copies match.

- The `execute-plan-sdlc/handback:` and `rr-refusal: (a)` exec cases fail when the rule text is removed.

## OpenSpec Appendix

Not applicable — no OpenSpec change
