# Ship Step Agent Arguments (M4a0) Implementation Plan

**Commit:** `fix(#9366): ship - step agents pass task args (R99)`
**Goal:** Fix the ship step agents that lose their arguments (ledger F-63): each of the six `agents/ship-step-*.md` preloads its skill without arguments, so every `$ARGUMENTS` in the skill text is empty and the step prepare scripts run without the step's args.
**Architecture:** Spec first: ship R99 (new) is written into the ship spec before the agents change. The fix is one sentence per step agent, byte-identical in all six files, and it is proven by a sentinel check in `check-handback-sentinels.js`.
**Source:** conversation context (owner request 2026-11-12: ship the F-63 fix from wave M4a as its own small wave, tracking id #9366)
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

A ship step agent preloads its skill without arguments. So every `$ARGUMENTS` in the skill text is empty. The R95 final check therefore reviewed all changes, with `--auto` off and no plan (ledger F-63).

**What prompted this change now?**

Item 1 (F-63) of wave M4a was seen in a live ship run (subagent `agent-a190b6ab38df268ab`). The owner asked on 2026-11-12 to ship it earlier, as its own small wave (#9366) before the rest of M4a (#9364). The M4a plan assumes this wave has merged.

**What does success look like?**

- A dispatched review step runs `review.js` with the dispatched args.
- All six step agent files carry the same R99 sentence, and the sentinel case fails when any one of them lacks it.

**Who fails if this ships wrong (blast radius):** every consumer project that runs `/ship-sdlc`: each of the six step agents (commit, review, received-review, version, pr, execute) reads its args through this sentence.

## Research Findings

All items were re-verified at HEAD 4c7fff3 for wave M4a. Exploration ran through the discovery brief (`/tmp/sdlc-explore-main-24Yl2e/discovery-brief.md`, findings `F-<dimension>-<n>`) plus inline reads.

- **Step agents (item 1).** All six `agents/ship-step-*.md` have `skills: [sdlc:<skill>]` and line 9 "Follow the preloaded … skill, using the arguments given in the task message." Nothing says how `$ARGUMENTS` gets its value (F-ship-step-agent-args-and-handback-sentinels-1). The skills use `$ARGUMENTS` in their prepare commands: `review-sdlc/SKILL.md:23`, `commit-sdlc:42`, `version-sdlc:42`, `pr-sdlc:104`, `execute-plan-sdlc:50`, `received-review-sdlc:133`. Ship's highest id is R98, so R99 is free (F-…-2).
- **Sentinel checker.** `tests/promptfoo/scripts/check-handback-sentinels.js` has only a presence helper `has()`. Its single case is `execute-plan-sdlc/handback:` in `execute-plan-sdlc-dispatch-resilience-exec.yaml` (F-…-7).
- **Site mirrors.** `site/src/content-source/specs/*.md` are byte copies. All are currently identical to `docs/`.
- **Build and test commands.** Exec-only promptfoo: `promptfooconfig-exec.yaml` (script-runner), `-j 1`. Validators: check-consistency.js, check-docs-consistency.js, validate-spec-shape.js `--strict`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Split from M4a | yes | ships M4a item 1 (ship R99, the six agent sentences, the R99 sentinel) as wave #9366; the rest stays in M4a (#9364) | owner request 2026-11-12 |
| PR linking | no | names #9366 in the PR body with no `Fixes`/`Closes` keyword | tracking ids are internal register ids, not GitHub issues (project notes); this overrides the `pr-link-github-issue` guardrail |

### Decisions taken without the owner

- **Spec mirror:** the ship spec is copied to `site/src/content-source/specs/ship-sdlc.md` with `cp` by the task that edits it (Task 1).

## Key Decisions

- **Fix the step agents with one sentence, not a new dispatch format.** The preloaded skill cannot receive arguments. The agent already gets the args in its task message. One sentence telling it to substitute them is the smallest fix. Changing ship.js to inline the skill text was rejected as larger and riskier.

- **One owner for the sentinel checker.** Task 4 owns `check-handback-sentinels.js` and runs after the agent tasks. It adds only the R99 args sentinel; the R98-key and wait-prose sentinels stay in M4a.

- **Smallest viable cut.** Every task maps to the one brief item. There are no extra tasks. The spec task (1) is required by the spec-first rule.

**Non-goals (intentionally not built):**

- everything else in wave M4a (#9364): ship R98 and R90, execute R90 and R92, the git specs, lib/git.js, ship.js, the write guard, the wait prose, the fixtures, and the R98-key and no-`--read`-poll sentinels;
- any behavioural or headless run.

## Contract Examples

**openspec / spec** (Task 1):

```markdown
**Contract:**
- shape (openspec): ADD `R99` to `docs/specs/ship-sdlc.md` after R98; append an appendix row for R99.
- names: `R99` (new).
- mirror: R97/R98 block style at `docs/specs/ship-sdlc.md:213-216`.
- decisions: next free id R99; ids never renumbered.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy.
```

**code** (Task 4):

```markdown
**Contract:**
- shape (code): new constant `ARGS` and object `stepArgs` (six booleans) in `check-handback-sentinels.js`; `ok` ANDs them.
- names: `ARGS`, `stepArgs`.
- mirror: the `workers` loop at `check-handback-sentinels.js:48-51`.
- decisions: presence checks only; no new script.
- sync: Tasks 2/3 sentence text.
```

## Tasks

### Task 1: Ship spec — R99 new

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R99, add an appendix row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec

**Notes:**
Brief item 1 (F-ship-step-agent-args-and-handback-sentinels-2). Spec first: Tasks 2 and 3 implement this id.

**Acceptance criteria:**
- [ ] R99 sits directly after R98 (before line 217's R85 block) with an Acceptance sub-bullet, and the appendix issue-trail table has `| R99 | step agents substitute task args for $ARGUMENTS (ledger F-63), #9366 |` after the R98 row.
- [ ] R98 and every other id are unchanged.
- [ ] `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` was run after the last edit; `diff -q` of the two files prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD R99 as rendered below; numbering continues from R98.
- names: `R99` (new).
- mirror: R97/R98 style at `docs/specs/ship-sdlc.md:213-216`.
- decisions: one sentence per agent, not a dispatch change (Key Decisions).
- sync: Tasks 2/3 (agents) cite this id.

New R99 (after R98's Acceptance line):

```markdown
- R99: Step agent arguments. Each `agents/ship-step-<step>.md` (commit, review, received-review, version, pr, execute) preloads its skill with `skills: [sdlc:<skill>]` and no arguments, so the preloaded skill text shows `$ARGUMENTS` as an empty string. Each of the six agent files tells the agent to put the args string from the task message (the `step.data.invocation` ship sends) verbatim wherever the skill's commands or rules use `$ARGUMENTS`. Example: the R95 final check runs `review.js --output-file --committed --base <sha> --auto --plan "<planFile>" --json`, not `review.js --output-file  --json`.
  - Acceptance: `execute-plan-sdlc/handback:` sentinel case (all six agent files carry the sentence).
```

### Task 2: Step agents part 1 — args substitution (commit, review, received-review)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-commit.md` — add the R99 sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-review.md` — add the R99 sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — add the R99 sentence

**Notes:**
Implements ship R99 (F-ship-step-agent-args-and-handback-sentinels-1). Task 4 adds the sentinel that checks it.

**Acceptance criteria:**
- [ ] Each file has the sentence below as a new paragraph right after line 9 ("Follow the preloaded …"), before "The arguments above decide …".
- [ ] The sentence text is byte-identical in the three files (and in Task 3's three files).

**Contract:**
- shape (code): insert one paragraph; no other change.
- names: sentinel substring `put the args string from the task message there verbatim (ship-sdlc R99)`.
- mirror: the `(ship-sdlc R97)` citation style in `ship-step-review.md:13`.
- decisions: one sentence, not a dispatch change (Key Decisions).
- sync: Task 3 uses the same text.

```markdown
The preloaded skill text shows `$ARGUMENTS` as an empty string, because the skill is preloaded without arguments. Wherever a command or rule of the skill uses `$ARGUMENTS`, put the args string from the task message there verbatim (ship-sdlc R99).
```

### Task 3: Step agents part 2 — args substitution (version, pr, execute)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-version.md` — add the R99 sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-pr.md` — add the R99 sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-execute.md` — add the R99 sentence

**Notes:**
Same sentence as Task 2; split only to keep each task at most five files.

**Acceptance criteria:**
- [ ] Each file has Task 2's paragraph, byte-identical, right after line 9.
- [ ] No other line changes; frontmatter stays as is.

**Contract:**
- shape (code): insert this paragraph (byte-identical to Task 2's):
  ```markdown
  The preloaded skill text shows `$ARGUMENTS` as an empty string, because the skill is preloaded without arguments. Wherever a command or rule of the skill uses `$ARGUMENTS`, put the args string from the task message there verbatim (ship-sdlc R99).
  ```
- names: sentinel substring `put the args string from the task message there verbatim (ship-sdlc R99)`.
- mirror: line 9 placement in `agents/ship-step-version.md` (same as Task 2).
- decisions: as Task 2.
- sync: Task 2.

### Task 4: Sentinel checker — R99 args

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 3
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — add the R99 args sentinel
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml` — rename the handback case description to name R99
- Create: `docs/plans/2026-11-12-lean-m4a0-step-agent-args.md`

**Notes:**
The single owner of the checker (Key Decisions; F-ship-step-agent-args-and-handback-sentinels-6, -7). The checker reads files by plain substring, so quoting rules (F-51) do not apply. The plan file is listed here only so ship stages it (project notes: ship stages only files named in the plan); no task edits it. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"`

**Acceptance criteria:**
- [ ] The case `execute-plan-sdlc/handback:` passes at the end of this task.
- [ ] Removing the R99 sentence from any one agent file makes `ok` false (checked by reading the code, not by editing the files).
- [ ] The JSON output adds the key `stepArgs` (object of six booleans).

**Contract:**
- shape (code): new constants and checks:
  ```js
  const ARGS = 'put the args string from the task message there verbatim (ship-sdlc R99)';
  const stepArgs = {};
  for (const s of ['commit', 'review', 'received-review', 'version', 'pr', 'execute']) stepArgs[s] = has(`agents/ship-step-${s}.md`, [ARGS]);
  ```
  `ok` ANDs `Object.values(stepArgs).every(Boolean)`; the output JSON adds `stepArgs`.
- names: `ARGS`, `stepArgs`.
- mirror: the `workers` loop at `check-handback-sentinels.js:48-51`.
- decisions: presence checks only; no new script.
- sync: case description becomes `execute-plan-sdlc/handback: R86/R87/R92/R99 sentinels present in skill, wave-runner, the ship step agents, ship-sdlc and the three workers`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The prose change has a sentinel check (Task 4) |
| no-ci-bypass | error | PASS | No CI skipping |
| no-auto-eval | error | PASS | Only the exec-only config with a filtered pattern; no full-suite or retry loops |
| skill-docs-required | error | PASS | No new SKILL.md created |
| no-scope-creep | warning | PASS | Every task maps to the one brief item |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | The single prose fix (R99 args sentence) has the script alternative rejected in Key Decisions |
| yagni | warning | PASS | No speculative abstractions |
| cross-skill-consistency | error | PASS | The same sentence goes into all six step agents |
| pr-link-github-issue | error | PASS | #9366 is an internal tracking id, not a GitHub issue; recorded and named in the PR body |
| dry | warning | PASS | Repeated sentence across six agent files is required byte-identical and sentinel-checked |
| kiss | warning | PASS | Smallest local fix chosen |
| spec-first | error | PASS | Spec Task 1 precedes the dependent agent tasks |
| project-agnostic | error | PASS | Changes are in plugin code; repo-local edits are test scripts only |
| flag-coherence-cross-skill | error | PASS | No new cross-skill flag gating in SKILL.md |
| no-opposite-logical-vectors | error | PASS | One sentence, identical in all six agents |
| flag-resolution-single-source | warning | PASS | No flag re-derivation |
| state-premise | error | PASS | Root problem stated in Context |
| smallest-viable-cut | warning | PASS | Key Decisions states no extra tasks |
| failure-audience | warning | PASS | Blast radius named |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration/init/preflight logic changed |
| agent-dispatch-script-driven | error | PASS | Agents use args from step.data.invocation; no dispatch parameters added |
| flag-semantic-consistency-cross-skill | error | PASS | No flags added |
| workspace-mode-compatibility | error | PASS | No git or workspace logic changed |
| prompt-cache-hit-ratio | warning | PASS | Only a static sentence added to agent files; no volatile bytes |

## Final Shape

When all tasks are done:

- **Step agents.** Each of the six ship step agents tells the model to put the dispatched args where the skill says `$ARGUMENTS` (ship R99). The R95 final review runs with `--committed --base <sha> --auto --plan`.

- **Tests.** The sentinel checker fails when any one step agent lacks the R99 sentence.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Six ship-step agents: args sentence; ship spec R99; sentinel check | Task 1, Task 2, Task 3, Task 4 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
