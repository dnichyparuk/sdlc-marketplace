# execute-plan-sdlc On-Demand Reference Files Spec (W5.4 Spec Commit) Implementation Plan

**Goal:**
- Add `R-progressive-disclosure` (a new id) to `docs/specs/execute-plan-sdlc.md` before any W5.4 code change. It lists exactly the seven companion files and states ship's two-part contract, adapted to execute.
- Make the three spec sentences that W5.4 makes untrue true again, with minimal wording:
  - R35 (`git commit -m` → `git commit -F`, owner Q19d);
  - R36 (the resolved `execute-resume:` banner line);
  - R38 (the archive suggestion now lives in `openspec-tasks.md`).

**Architecture:** Four text replacements in one spec file, in two tasks. The executor applies them directly (not through ship or execute). The commit goes through the orchestrator's commit wrapper as the FIRST commit of wave 3, before the plans commit and the ship run. Subject: `docs(#9015): execute-plan-sdlc - spec R-progressive-disclosure (W5.4)` (69 characters). Files: `docs/specs/execute-plan-sdlc.md` only. The site mirror is refreshed in the plans commit, which runs `node site/scripts/copy-docs.mjs`.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5/wave-3-plan-source.md (plan 1; item W5.4 Change "Spec"; ruling w3-preflight Q2, Q4, Q6; owner Q19d), /workspace/sdlc-marketplace/.sdlc/orchestration/m5/preflight-wave-3.md §5, discovery brief /tmp/sdlc-explore-m5-w3-9015-execute-ondemand-docs-xmh8Kx/discovery-brief.md (F-spec-progressive-disclosure-placement-1…11)

**Verification:** run in ONE Bash call from the repository root:

```bash
RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show 710c438:docs/specs/execute-plan-sdlc.md | ids) <(ids < docs/specs/execute-plan-sdlc.md) | grep '^[<>]'; node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . > /tmp/vss-m5w3.out 2>&1; echo "exit=$?"; grep -c 'execute-plan-sdlc' /tmp/vss-m5w3.out
```

Expected output, exactly three lines: `> R-progressive-disclosure`, `exit=0`, `0`. (The P-5 id-set check prints one added id and no removed one. `validate-spec-shape.js` needs `--root .`: without it, it reads the main checkout; pre-flight hazard "validators/root".)

---

## Context

**What problem does this change solve?**

- W5.4 moves rarely-used blocks out of `execute-plan-sdlc/SKILL.md` into two new companion files:
  - `openspec-tasks.md` holds the OpenSpec work;
  - `commit-waves.md` holds the `--commit-waves` per-wave commit.
- A "companion file" is a markdown file next to SKILL.md that the model reads only at the step that needs it.
- The repository rule is spec first (AGENTS.md, "Spec-driven development"). The spec must therefore name the contract before SKILL.md changes.
- ship-sdlc already has this contract: `R-progressive-disclosure` at `docs/specs/ship-sdlc.md:382`. Execute has no such requirement (pre-flight §5).

**What prompted this change now?**

- W5.4 is M5 wave 3. This is its spec commit (plan source, plan 1).

**What does success look like?**

- The spec has a new `R-progressive-disclosure` bullet under "Invariants and constraints". It names exactly the seven files and says why the three worker agent files are not in the list.
- R35, R36 and R38 describe what W5.4 ships.
- The P-5 id-set check prints exactly `> R-progressive-disclosure`, and `validate-spec-shape.js --root .` reports nothing for this spec.

## Research Findings

- **Line endings.** The spec is LF: `grep -c $'\r' docs/specs/execute-plan-sdlc.md` prints `0` at 710c438.
- **Placement** (F-spec-progressive-disclosure-placement-1, -2):
  - "Invariants and constraints" is at `:292`.
  - It holds R20 (`:294`), R-CONTRACT (`:295`), then a blank line and C1–C16 (`:297-312`).
  - Ship puts its R-progressive-disclosure in the same section (`docs/specs/ship-sdlc.md:376`, bullet `:382`).
  - The new bullet goes directly after the R-CONTRACT line.
- **Shape rules** (F-spec-progressive-disclosure-placement-9, -10). `validate-spec-shape.js`:
  - accepts `- R-progressive-disclosure:` as an id line;
  - flags `#NNN` and `(removed` in the body (the new text has neither);
  - flags duplicate ids;
  - checks that every cited R-id exists in this spec. The new text cites only `R-progressive-disclosure`; G9 and G11 exist.
- **Sentences W5.4 makes untrue:**

  | Spec site | Why it becomes untrue | Edit |
  |---|---|---|
  | R35 (`:21`) | It names `git commit -m "wip(execute): …"`. W5.4 commits from a message file (owner Q19d, ruling Q4). | S2 |
  | R36 (`:252`) | Step 0 now branches on the hook's resolved `execute-resume:` line (ruling Q6). | S3a, S3b |
  | R38 (`:131`) | It says the archive suggestion is "currently described at the end of What's Next". W5.4 moves it to `openspec-tasks.md` (ruling Q3). | S4 |

  (F-spec-progressive-disclosure-placement-4, -5, -6.)
- **Sentences that stay true:**
  - R37 and I13: the flip still goes through `openspec-step.js flip`, which wraps `markTaskDone`.
  - I12: `openspec-step.js validate` wraps `validateChangeStrict`.
  - R39: it names the warning text, not the SKILL.md position.
  - R-main-context-steps: moving text into a companion file does not move it into an Agent (F-spec-progressive-disclosure-placement-8).
  - I5–I7: they name single companions and do not claim a full set (F-spec-progressive-disclosure-placement-7).
- **Plan-time probe.** All four edits were applied with the Edit-tool semantics (Old once → New) to a scratch clone at 710c438, outside every work tree. The header Verification command, run there, printed `> R-progressive-disclosure`, `exit=0` and `0`.
- **Anchor counts.** `grep -cF` of each Old text below prints `1` at 710c438. Each task gives its own anchor loop.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| R36 wording | no | names the `execute-resume:` line, when the hook emits it (compact matcher, execute state present), and its three values | ruling Q6 puts the hook line in scope; R36 is the requirement that defines the banner contract. The value mapping is plan 2's Key Decision, which the arbiter reviews |
| R38 wording | no | "(described in `openspec-tasks.md`, which the end of "What's Next" points to)" | after the move, "currently described at the end of What's Next" is untrue (ruling Q3) |
| I12 | no | unchanged | `openspec-step.js validate` wraps `validateChangeStrict`, so the integration line stays true |
| Agent files sentence | no | one sentence: the three `agents/execute-worker*.md` files are agents, not skill-directory companions, so they are not listed | plan source; pre-flight §5 |
| Site mirror | no | not in this commit | precedent of the wave-2 spec plan: the plans commit runs `copy-docs.mjs` and carries the mirror |
| Full critique for a one-file plan | no | ran the full plan-sdlc critique and review | the requester asked for the full critique and review |

## Key Decisions

**Problem in one sentence:** W5.4 moves SKILL.md text into on-demand files, and the spec must first say which files exist, when they are read, and that common runs never read the two new ones.

- **Ship's contract, adapted to execute.**
  - Part 1 says gated branches live in companions behind ≤2-line pointers, and uses the item's commit-waves pointer as the example.
  - Part 2 says the common path is unchanged:
    - a run with no OpenSpec context and `flags.commitWaves` false reads neither new file;
    - the once-per-run spec review (Step 8-bis, ruling Q2) and the post-compact discriminator stay inline;
    - no silent re-inlining;
    - adding a companion requires amending the requirement.
  - The alternative was to copy ship's text with execute's file names. It loses execute's specific facts, such as 8-bis staying inline.
- **The seven files carry a one-phrase role each.** A reader learns from the requirement alone what each file holds, as in ship's version.
- **Minimal wording for R35, R36 and R38.** Each edit changes only the clause that W5.4 makes untrue.
- **Non-goals:**
  - No SKILL.md, hook, test or docs/skills change: plans 2 and 3 do those.
  - No change to R14, R-INVARIANT-COMPLETENESS or ship's spec (reading R-W8.22).
  - No id is renumbered or reused.
- **Failure audience:** the plan-2 executor and every reader of the spec. Without this requirement, a future edit could re-inline the moved blocks, and nothing would say that is wrong.

## Contract Examples

**openspec / spec** (from Task 1):

```markdown
**Contract:**
- shape (openspec): ADD one requirement `R-progressive-disclosure` under "Invariants and constraints", after R-CONTRACT; text pinned in S1's New block; no other id added, removed or renumbered.
- names: `R-progressive-disclosure`; files `classifying-and-waving-tasks.md`, `wave-runner-template.md`, `recovering-from-failures.md`, `spec-compliance-reviewer.md`, `state-format.md`, `openspec-tasks.md`, `commit-waves.md`.
- mirror: `docs/specs/ship-sdlc.md:382` (two-part contract, Acceptance sub-bullet).
- decisions: Key Decisions ("Ship's contract, adapted to execute").
- sync: plan 2's pointer texts and companion file names.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source code change; plan 2 carries the code and its test |
| no-ci-bypass | error | PASS | No check is skipped |
| no-auto-eval | error | PASS | No promptfoo run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Each edit is the new id or a sentence W5.4 makes untrue (Research Findings table) |
| single-responsibility-tasks | warning | PASS | Task 1 adds the requirement; Task 2 makes the consequence edits and runs the checks |
| scripts-over-llm-logic | error | PASS | The `execute-resume:` value is computed by the hook script (R36), not by the model |
| yagni | warning | PASS | One new id, which the item names |
| cross-skill-consistency | error | PASS | Mirrors ship's R-progressive-disclosure contract shape |
| pr-link-github-issue | error | PASS | Tracking is local todo #9015; there is no GitHub issue to link |
| dry | warning | PASS | Each rule is stated once |
| kiss | warning | PASS | In-place sentence edits |
| spec-first | error | PASS | This is the spec commit; it lands before the ship run |
| project-agnostic | error | PASS | Plugin spec only |
| flag-coherence-cross-skill | error | PASS | Uses `flags.commitWaves`, the resolved prepare field |
| no-opposite-logical-vectors | error | PASS | Part 2 states the gate once ("no OpenSpec context and `flags.commitWaves` false") |
| flag-resolution-single-source | warning | PASS | No new flag |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | Minimal clauses |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | The R36 value mapping is plan 2's Key Decision (a), ruled accepted (ruling w3-planreview) |
| state-machine-idempotency | error | PASS | No migration or init logic |
| agent-dispatch-script-driven | error | PASS | No dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag |
| workspace-mode-compatibility | error | PASS | Docs-only edit of a tracked file |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompt changes |

## Tasks

### Task 1: Add R-progressive-disclosure under Invariants and constraints

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — edit S1 (insert after the R-CONTRACT line).

**Notes:** Implements W5.4 Change "Spec" and the plan source's plan-1 bullets (F-spec-progressive-disclosure-placement-1, -3). The Old text is a literal line of the spec; New replaces it with the same line plus the new requirement (Edit tool, one replacement).

**Anchors (run before editing; must print `1`):**

```bash
grep -cF -- '- R-CONTRACT: When a task carries a `Contract:` block, execution consumes the decided shape verbatim' docs/specs/execute-plan-sdlc.md
```

If the count is not `1`, STOP and report; do not search for another anchor.

**Must not touch:** R20, R-CONTRACT's text, C1–C16, every other section. Every other file.

**Acceptance criteria:**
- [ ] `grep -c '^- R-progressive-disclosure:' docs/specs/execute-plan-sdlc.md` prints `1`.
- [ ] The new bullet sits between R-CONTRACT and the blank line before C1.

**Contract:**
- shape (openspec): ADD `R-progressive-disclosure` (Invariants and constraints); New text below, verbatim.
- names: the seven files; the three agent files `agents/execute-worker.md`, `agents/execute-worker-batch.md`, `agents/execute-worker-complex.md`.
- mirror: `docs/specs/ship-sdlc.md:382`.
- decisions: Key Decisions.
- sync: plan 2 Task 1 pointer texts.

#### S1 — R-progressive-disclosure (after R-CONTRACT)

Old (must occur once):

````text
- R-CONTRACT: When a task carries a `Contract:` block, execution consumes the decided shape verbatim and MUST NOT re-derive any design decision it pins. The Contract is surfaced to the per-task agent via the fact sheet. The BLOCKED-on-architectural-decision path (classifying-and-waving-tasks.md) MUST NOT fire for a decision already settled in the Contract.
````

New:

````text
- R-CONTRACT: When a task carries a `Contract:` block, execution consumes the decided shape verbatim and MUST NOT re-derive any design decision it pins. The Contract is surfaced to the per-task agent via the fact sheet. The BLOCKED-on-architectural-decision path (classifying-and-waving-tasks.md) MUST NOT fire for a decision already settled in the Contract.
- R-progressive-disclosure: To bound the resident context footprint of `execute-plan-sdlc/SKILL.md`, reference material and rarely-hit branches MUST live in on-demand companion docs that SKILL.md instructs the LLM to Read only at the step that needs them — never preemptively. The canonical companion file set under `plugins/sdlc-utilities/skills/execute-plan-sdlc/` is exactly seven files: `classifying-and-waving-tasks.md` (classification heuristics, worker routing table, wave algorithm), `wave-runner-template.md` (the wave-runner prompt, runner mode only), `recovering-from-failures.md` (the error recovery playbook, read on failure only), `spec-compliance-reviewer.md` (the spec review template), `state-format.md` (the state file schema, read on resume), `openspec-tasks.md` (OpenSpec context loading, the task-flip map, the Step 5d-bis task flip, the OpenSpec sync warnings and the Step 9 archive suggestion) and `commit-waves.md` (the `--commit-waves` flag sources and the Step 5c-quater per-wave WIP commit). Adding another requires amending this requirement. The worker agents `agents/execute-worker.md`, `agents/execute-worker-batch.md` and `agents/execute-worker-complex.md` are agent files, not skill-directory companions, so they are not part of this set. The contract has two parts:
  1. **Gated branches** — the OpenSpec work (only when the prepare output carries OpenSpec context) and the per-wave WIP commit (only when `flags.commitWaves` is true) — live in `openspec-tasks.md` and `commit-waves.md`. SKILL.md replaces each moved block with a ≤2-line gated pointer ("When `flags.commitWaves` is true → Read `./commit-waves.md` and follow it after G9 + G11 pass.").
  2. **Common-path behavior is unchanged.** Extraction relocates instructions; it does not alter the executed flow. A run of a plan with no OpenSpec context and with `flags.commitWaves` false MUST NOT instruct reading `openspec-tasks.md` or `commit-waves.md`. The once-per-run spec review (Step 8-bis) and the post-compact discriminator stay inline. Future edits MUST NOT silently re-inline the moved blocks into SKILL.md.
  - Acceptance: the seven companion files exist under `plugins/sdlc-utilities/skills/execute-plan-sdlc/`; each moved block is a ≤2-line gated Read pointer in SKILL.md; a plan with no OpenSpec context and `flags.commitWaves` false reads neither `openspec-tasks.md` nor `commit-waves.md`.
````

### Task 2: Make R35, R36 and R38 true for W5.4 and run the checks

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — edits S2 (R35), S3a and S3b (R36), S4 (R38).

**Notes:** Each edit is a consequence of W5.4's Change and the ruling: Q4 and owner Q19d for S2, Q6 for S3, Q3 for S4 (F-spec-progressive-disclosure-placement-4, -5, -6). The Old texts are unique and do not overlap, so the order of the edits does not matter.

**Anchors (run before editing; each must print `1`):**

```bash
S=docs/specs/execute-plan-sdlc.md
for a in \
  'MUST run `git add -A` followed by `git commit -m "wip(execute): wave {N} — {comma-separated task titles}"`.' \
  '(prompt-cache protection). Step 0 of this skill MUST scan the SessionStart system-reminder context: when the literal `Active execution (post-compact):` is present AND `Active pipeline: ship-sdlc` is ABSENT in the same context, set `implicitResume = true`' \
  'When BOTH signals are present, this skill MUST NOT self-resume' \
  '(currently described at the end of "What'"'"'s Next")'; do
  printf '%s  %.70s\n' "$(grep -cF -- "$a" "$S")" "$a"
done
```

If any count is not `1`, STOP and report.

**Must not touch:** every other sentence of R35, R36 and R38; every id line; the Appendix. Every other file.

**Acceptance criteria:**
- [ ] `grep -c 'git commit -m' docs/specs/execute-plan-sdlc.md` prints `0`.
- [ ] `grep -c 'execute-resume: implicit|deferred-to-ship|none' docs/specs/execute-plan-sdlc.md` prints `1`.
- [ ] `grep -c 'currently described at the end' docs/specs/execute-plan-sdlc.md` prints `0`.
- [ ] The header Verification command prints exactly `> R-progressive-disclosure`, `exit=0`, `0`.

**Contract:**
- shape (openspec): MODIFY R35, R36, R38; delta text in the Old/New blocks; no id change.
- names: `git commit -F`; `execute-resume: implicit|deferred-to-ship|none`; `openspec-tasks.md`.
- mirror: ruling w3-preflight Q3, Q4, Q6; owner Q19d.
- decisions: minimal wording (Key Decisions).
- sync: plan 2 Task 2 (Q4 lines), Task 3 (hook line), Task 1 (archive section).

#### S2 — R35

Old (must occur once):

````text
MUST run `git add -A` followed by `git commit -m "wip(execute): wave {N} — {comma-separated task titles}"`.
````

New:

````text
MUST run `git add -A` followed by `git commit -F <message-file>`, the message file holding the subject `wip(execute): wave {N} — {comma-separated task titles}` (written through a quoted heredoc, so the task titles are never shell-expanded, and removed after the commit).
````

#### S3a — R36 (the resolved line)

Old (must occur once):

````text
(prompt-cache protection). Step 0 of this skill MUST scan the SessionStart system-reminder context: when the literal `Active execution (post-compact):` is present AND `Active pipeline: ship-sdlc` is ABSENT in the same context, set `implicitResume = true`
````

New:

````text
(prompt-cache protection). On the `compact` matcher, when execute state exists for the current branch, the hook MUST also emit one resolved line `execute-resume: implicit|deferred-to-ship|none`: `implicit` when it emitted the post-compact line and no `Active pipeline: ship-sdlc` line, `deferred-to-ship` when it emitted both, and `none` when it emitted no post-compact line (the state has no waves, or belongs to another worktree). Step 0 of this skill MUST scan the SessionStart system-reminder context for that line: on `execute-resume: implicit`, set `implicitResume = true`
````

#### S3b — R36 (the deferring branch)

Old (must occur once):

````text
When BOTH signals are present, this skill MUST NOT self-resume
````

New:

````text
On `execute-resume: deferred-to-ship`, this skill MUST NOT self-resume
````

#### S4 — R38

Old (must occur once):

````text
(currently described at the end of "What's Next")
````

New:

````text
(described in `openspec-tasks.md`, which the end of "What's Next" points to)
````

## Final Shape

- `docs/specs/execute-plan-sdlc.md` has one more requirement, `R-progressive-disclosure`, under "Invariants and constraints":
  - it lists exactly seven companion files;
  - it says the worker agent files are not companions;
  - it states the two-part contract.
- R35 says the per-wave commit uses `git commit -F` with a message file.
- R36 says the hook emits a resolved `execute-resume:` line, and that Step 0 branches on it.
- R38 says the archive suggestion is described in `openspec-tasks.md`.
- No id is removed or renumbered. `validate-spec-shape.js --root .` is clean for this spec.
- The commit is the first of wave 3, made through the wrapper:
  - subject `docs(#9015): execute-plan-sdlc - spec R-progressive-disclosure (W5.4)` (69 characters);
  - one file, `docs/specs/execute-plan-sdlc.md`.

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

Review round 1 (Step 3 lanes + Step 5 lenses, one set over all three wave-3 plans): 5 lanes, 3 lenses (architecture, requirements, risk; sonnet, opposite of the opus author). All three lenses: Approved. Blocking lane issues fixed in Step 4: G10 ×2 (Modify of files created by Task 1 → annotated), G4 (cross-plan SKILL.md order → plan-3 precondition). Warnings fixed: G15 citations, G6 (plan 3 Task 4 → Standard), G1 (worker rules, consumer grep). Advisory fixes after round 1 (not material): sync-warnings pointer made a Read pointer, Key Decision (b) coupling note, B15/B16 order.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 4 | 3 |
| Correctness | 0 | 1 | 3 | 3 |
| Coherence | 0 | 0 | 7 | 3 |

| Requirement | Covering task(s) | Status |
|---|---|---|
| R1 new id `R-progressive-disclosure`, seven files, two-part contract, agent sentence | Task 1 | covered |
| R2 R35/R36/R38 consequence edits; P-5 one added id; spec-shape clean | Task 2 | covered |
| R18 all-plan rules (anchors, commands run as written, worker rules, validators) | all tasks | covered |

**Verdict:** Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
