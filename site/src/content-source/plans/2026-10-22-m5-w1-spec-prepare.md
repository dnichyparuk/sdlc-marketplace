# execute-plan-sdlc Prepare Script Contract — Spec Commit S2 Implementation Plan

**Goal:** Give the execute spec its prepare-script contract (`skill/execute.js`, P1–P9, C13–C16) and reword every spec sentence that W5.2's code change makes untrue, before any code lands (W5.2 Change 7 and Fold-in (a)(3)).
**Architecture:** Two spec files, exact text edits only. The execute spec gets a new header value, a new `## Prepare script contract` section, four new C-items, a new R41 Acceptance line and minimal rewords of R-config-version, R35, R-WAVE-DEADLINE and the LOAD and DO phase entries. The ship spec gets a minimal reword of R57. The P-5 id-set check shows the execute spec's existing ids unchanged plus exactly P1–P9 and C13–C16, and prints `SAME` for the ship spec. The executor applies the edits directly and commits them through commit-sdlc as the second commit of wave 1, after S1. This plan is not run through ship or execute (ruling w1-oneship).
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5/wave-1-plan-source.md (plan 2; item W5.2 Changes 2, 3, 5, 7 and Fold-in (a); readings R-legacy-config, R-preflight; ruling w1-plan Q1 (a), Q2 (b) and the four accepted readings), /workspace/sdlc-marketplace/.sdlc/orchestration/m5/ruling-w1-plan.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5/preflight-wave-1.md, discovery brief F-spec-anchors-and-shape-validator-1, -7…9, -11…16
**Verification:** in ONE Bash call, from the repository root, after this plan's edits and with S1 already committed (HEAD = the S1 commit): `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1; mkdir -p "$TMPDIR"; RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; diff <(git show HEAD:docs/specs/execute-plan-sdlc.md | ids) <(ids < docs/specs/execute-plan-sdlc.md) | command grep -E '^[<>]' | tr '\n' ' '; echo; diff <(git show HEAD:docs/specs/ship-sdlc.md | ids) <(ids < docs/specs/ship-sdlc.md) && echo "SAME ship-sdlc"; node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . > "$TMPDIR/s2-vss.out" 2>&1; echo "exit=$?"; command grep -cE 'execute-plan-sdlc|ship-sdlc' "$TMPDIR/s2-vss.out"` prints exactly the 13 lines `> C13 > C14 > C15 > C16 > P1 > P2 > P3 > P4 > P5 > P6 > P7 > P8 > P9` (no `<` line), then `SAME ship-sdlc`, `exit=0` and `0`.

---

## Context

**What problem does this change solve?**

- W5.2 adds a prepare script, `scripts/skill/execute.js`. The execute spec still says `**Prepare script:** none` and has no contract for the script's output.
- After W5.2, five spec sentences become untrue:
  - **R-config-version** says the config-version check sits in a Step 1 inline node block. W5.2 deletes that block, and the block never made the call anyway.
  - **R35** says ship resolves `execute.commitWaves` and forwards `--commit-waves`.
  - **R-WAVE-DEADLINE** says execute has no prepare script and ship forwards `--wave-timeout`.
  - **The LOAD phase entry** names `lib/config.js → readSection()` via inline Node.js as its script.
  - **Ship R57** says the forwarded flags are "the only resolution path".
- R41's Acceptance names two `--resume …` behavioral tests that were never written.

**What prompted this change now?**

- W5.2 is wave 1 of M5. The repository rule is spec first, so this spec commit lands before the feat commit (AGENTS.md "Spec-driven development").
- The arbiter settled the open points on 2026-10-22 (ruling w1-plan):
  - Q1 (a): `execute.js` runs the config-version check.
  - Q2 (b): a keyword map on the plan's H1 title picks the branch type.
  - The planner's four readings were accepted.

**What does success look like?**

- The execute spec has `**Prepare script:** \`skill/execute.js\``, a `## Prepare script contract` section with P1–P9 and the C13–C16 items.
- Every sentence above reads true for the code W5.2 writes.
- R41 Acceptance names the two new exec cases.
- P-5 shows exactly the 13 new ids for execute and `SAME` for ship.
- `validate-spec-shape.js` reports nothing for either spec.

## Research Findings

- Both specs are LF (`grep -c $'\r'` prints `0` at d551d87).
- The execute spec headings are Inputs and flags `:8`, State model `:30`, Step composition `:78`, Dispatch and routing `:152`, Gates `:194`, Failure handling and resume `:218`, Invariants and constraints `:276`, Integration `:294` and Appendix `:310`. `## Prepare script contract` goes between Gates and Failure handling (spec-template order A, G, P, E, C, I) (F-spec-anchors-and-shape-validator-1, -11).
- `validate-spec-shape.js` requires the Prepare section once the header is not `none`. It does not check the P- or C-items themselves. It fails on any `#NNN` in the body (F-spec-anchors-and-shape-validator-14).
- The execute spec's C-items run C1–C12, so the next free ids are C13–C16. No `P<n>` id exists in it yet (F-spec-anchors-and-shape-validator-9).
- The other prepare-script specs write the header with backticks, e.g. `**Prepare script:** \`skill/ship.js\``. They place the four mandatory C-items directly after their existing C-items (ship `:397-400`, plan `:212-215`, commit `:123-126`).
- Every other prepare script runs the config-version check through `lib/config-version-prepare.js` (`resolveSkipConfigCheck`, `ensureConfigVersion`; e.g. `skill/commit.js:188-189`). The execute SKILL.md guardrail block (`:72-81`) does not call `verifyAndMigrate` (F-spec-anchors-and-shape-validator-8).
- R41's Acceptance (`:24`) names four behavioral cases. Only two exist (`execute-plan-sdlc.yaml:549`, `:573`).
- R-WAVE-DEADLINE is hard-wrapped over several lines (`:252-269`). Its anchors below are single lines.
- `ship.js` reads `execute.commitWaves` from the `ship` section of `.sdlc/local.json` (`readSection(projectRoot, 'ship')` at `ship.js:179`; `cfg.execute.commitWaves` at `:398`). So the legacy path is `ship.execute.commitWaves`, as the item says.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| R-config-version call site | yes | names `skill/execute.js` and `lib/config-version-prepare.js`, with `--skip-config-check` and `SDLC_SKIP_CONFIG_CHECK=1` | ruling w1-plan Q1 (a); planner STOP question Q1 |
| Branch type and slug rule in P6 | yes | fixed keyword map on the H1 title; slug = H1 minus " Implementation Plan" | ruling w1-plan Q2 (b) |
| Extra spec rewords (R35, R-WAVE-DEADLINE, LOAD and DO phase entries, ship R57) | yes | minimal rewords, ids unchanged; `docs/specs/ship-sdlc.md` joins S2's files | ruling w1-plan, accepted reading 1 |
| Mandatory template R-item | yes | not added; only C13–C16 and P1–P9 are new | the source requires "exactly the new P/C ids"; ruling w1-plan accepted reading 2 |
| Header backticks | yes | `**Prepare script:** \`skill/execute.js\`` | repository convention; ruling w1-plan accepted reading 3 |
| Issue numbers | yes | none in the spec body | `validate-spec-shape.js` ISSUE_REF; ruling w1-plan accepted reading 4 |
| DO phase `wave-start` params | no | adds `--tasks-json --manifest-json` and one Output clause naming P9 | P9 is printed by that verb; without the clause the phase entry hides the new output |
| Fold-in (a) count check | no | counts occurrences with `grep -o … \| wc -l` (expects `2`) instead of the item's `grep -c` (expects `2`) | the new Acceptance line holds both names, and `grep -c` counts lines, so the item's literal check could only print `1` |
| P4 Step 3 carve-out | yes | P4 states that Step 3 may move a task later only with a stated reason, and never merges waves or drops a task | planreview M4, orchestrator decision: without it C14–C16 forbid what SKILL.md Step 3 does today |
| `errors[]`, `warnings[]`, `migration` | no | described in one paragraph after P9, not as new ids | the source fixes the id set at P1–P9; these fields still need a written contract |

## Key Decisions

**Problem in one sentence:** the execute spec has no contract for the prepare script W5.2 adds, and five of its sentences (plus ship R57) describe the wiring W5.2 removes.

- **P-ids follow the item's output shape exactly.** P1–P9 are the nine top-level fields of W5.2 Change 2 plus `wave-start.manifest` from Change 3. The resolution order and provenance values live in P1. A later W5.3 change then edits one id, not many.

- **Tuning values stay out of the spec.** The spec names each knob (`execute.waveTimeout`, `execute.waveRunnerMinPlanTasks`, …) and its resolution order, never its default value (spec-template tuning rule). The defaults live in `skill/execute.js` and `schemas/sdlc-config.schema.json`.

- **Rewords keep each sentence's shape.** Each reworded requirement keeps its id, its MUST, and its testable assertion. Only the "who resolves / who forwards" clause changes.

- **Non-goals.**
  - No code, SKILL.md, schema, test or docs-page change. These are the W5.2 feat plan (`2026-10-22-m5-w1-execute-prepare.md`) and W5.5.
  - No new A-ids for the new config keys. The source fixes the new id set at P1–P9 and C13–C16, so P1 carries the keys.
  - No edit to R41's rule text or its Resume-exemption paragraph (Fold-in (a) Must not touch).
  - No edit to the Appendix issue trail.
  - No `site/` refresh.

- **Failure audience.** The W5.2 feat plan's executor and every reader of the execute spec. A wrong P-field name would make `execute.js` and SKILL.md disagree with the contract. The feat plan's exec cases assert these names.

## Contract Examples

**openspec / spec** (taken from Task 2):

```markdown
**Contract:**
- shape (openspec): ADD section `## Prepare script contract` (P1–P9 plus one paragraph) between `## Gates` and `## Failure handling and resume`; ADD C13–C16 after C12; delta text pinned in the task's block.
- names: `P1` `flags` … `P9` `wave-start.manifest`; `C13`–`C16`.
- mirror: `docs/specs/commit-sdlc.md` `## Prepare script contract` (`- P1: \`currentBranch\` (string) — …`) and `docs/specs/ship-sdlc.md:397-400` (the four C-items).
- decisions: P-ids follow W5.2's output shape; no template R-item (Deviations table).
- sync: the W5.2 feat plan's `execute.js` output and its `execute-prepare-exec.yaml` cases.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | No source code changes; the cases named in R41 Acceptance and P1–P9 land in the W5.2 feat plan |
| no-ci-bypass | error | PASS | No check is skipped |
| no-auto-eval | error | PASS | No promptfoo run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Only Change 7, Fold-in (a)(3) and the ruled consequence rewords |
| single-responsibility-tasks | warning | PASS | Task 1: rewords and Acceptance; Task 2: the new contract section and C-items; Task 3: ship R57 and the S2 checks |
| scripts-over-llm-logic | error | PASS | The contract moves config, wave and workspace derivation into the prepare script |
| yagni | warning | PASS | Ids only for the item's fields |
| cross-skill-consistency | error | PASS | Ship R57 and execute R35/R-WAVE-DEADLINE are reworded in the same commit |
| pr-link-github-issue | error | PASS | Local todo #9013 only |
| dry | warning | PASS | The resolution order is stated once (P1); R35, R-WAVE-DEADLINE and ship R57 point to the prepare script |
| kiss | warning | PASS | In-place rewords plus one appended section |
| spec-first | error | PASS | This spec commit lands before the SKILL.md and code commit |
| project-agnostic | error | PASS | Plugin spec only |
| flag-coherence-cross-skill | error | PASS | P1 names the resolved `flags.*` fields that SKILL.md sites must cite |
| no-opposite-logical-vectors | error | PASS | One resolution order for every tunable |
| flag-resolution-single-source | warning | PASS | The prepare script is the single resolution site (P1, C13–C16) |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | The extra rewords are ruled consequences (Deviations table) |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | The two design questions were asked (STOP) and ruled |
| state-machine-idempotency | error | PASS | No migration logic is written here; the code plan tests the config-version check |
| agent-dispatch-script-driven | error | PASS | P9 is passed verbatim |
| flag-semantic-consistency-cross-skill | error | PASS | `--skip-config-check` keeps its meaning from the other prepare scripts |
| workspace-mode-compatibility | error | PASS | P6/P7 name `deriveWorkspace` and `findStateFile` (state under `resolveStateDir()`, the main worktree), the same in both modes |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompt changes |

## Tasks

### Task 1: Header, phase entries, R-config-version, R35, R41 Acceptance and R-WAVE-DEADLINE

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — the header line, LOAD and DO phase entries, R-config-version and its Acceptance, two clauses of R35, R41 Acceptance, and two places in R-WAVE-DEADLINE.

**Notes:** Implements F-spec-anchors-and-shape-validator-1, -7, -8, -9 under rulings w1-plan Q1 (a) and accepted reading 1. S1 (`2026-10-22-m5-w1-spec-q16.md`) must already be committed: `command grep -cF -- 'A resume never re-tiers a run.' docs/specs/execute-plan-sdlc.md` prints `1`, else STOP. Locate every site by content. Each anchor must print `1`; otherwise STOP and report (plan §0 rule 2). Apply the edits bottom-up. The diff lines below are indented two spaces inside the Contract list; the spec lines start at column 0.

**Anchors (run before editing; each must print `1`):**

```bash
e=docs/specs/execute-plan-sdlc.md
for a in '**Prepare script:** none' \
  'MUST be parsed in Step 0 alongside `--auto`/`--resume`/`--branch`' \
  'Cross-skill wiring: `ship-sdlc` config field `execute.commitWaves: boolean` (default `false`) is resolved in `scripts/skill/ship.js` and forwarded as `--commit-waves` to the execute step invocation.' \
  '  - Acceptance: behavioral coverage in `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — `execute-plan-sdlc (R41): standalone invocation with neither' \
  '- R-config-version: execute-plan-sdlc has no dedicated prepare script (the skill orchestrates plan execution directly)' \
  '  - Acceptance: when invoked from ship-sdlc (which has already run verifyAndMigrate and exported `SDLC_SKIP_CONFIG_CHECK=1`), the inline block does not re-run migration' \
  '   - **Script:** `lib/config.js` → `readSection()` via inline Node.js' \
  '   - **Params:** project root, section `execute.guardrails`' \
  '   - **Output:** JSON guardrails array (or empty array if unconfigured)' \
  '`wave-start --wave N`' \
  '   - **Output:** JSON state object persisted to `.sdlc/execution/execute-<branch>-<timestamp>.json` after each wave' \
  '  `ship.executeWaveTimeout` (seconds, `.sdlc/local.json`, R57 convention). execute-plan-sdlc has' \
  '  no prepare script of its own to resolve this value: ship-sdlc resolves `ship.executeWaveTimeout`' \
  '  and forwards it as `--wave-timeout` to the execute step invocation (same cross-skill wiring' \
  '  pattern as R35). The harness provides no per-Agent wall-clock deadline — `maxTurns` is a turn' \
  '  `executeWaveTimeout`, WAVE_SUMMARY reports that task with `errorCode: TIMEOUT` and wave'; do
  printf '%s  %s\n' "$(tr -d '\r' < "$e" | command grep -F -- "$a" | wc -l)" "$a"
done
```

**Must not touch:** R41's rule line and its Resume-exemption paragraph; every other sentence of R35 and R-WAVE-DEADLINE; the Appendix issue trail (including the R35 row); every other line of the spec. Every other file.

**Contract:**
- shape (openspec): MODIFY edits only, no ids added or removed in this task. `…` marks unchanged text inside the same line.

  Header (`:6`):

  ```diff
  -**Prepare script:** none
  +**Prepare script:** `skill/execute.js`
  ```

  R35 (`:21`), two clauses of the same line:

  ```diff
  -… (default `false`) MUST be parsed in Step 0 alongside `--auto`/`--resume`/`--branch`. …
  +… (default `false`) MUST be parsed by the prepare script `skill/execute.js` alongside `--auto`/`--resume`/`--branch` (P1). …
  -… Cross-skill wiring: `ship-sdlc` config field `execute.commitWaves: boolean` (default `false`) is resolved in `scripts/skill/ship.js` and forwarded as `--commit-waves` to the execute step invocation. `commit-sdlc` gains …
  +… Config: `execute.commitWaves: boolean` (default `false`) in `.sdlc/config.json` is resolved by `skill/execute.js` (CLI `--commit-waves`, then config, then the legacy `.sdlc/local.json` `ship.execute.commitWaves`, P1); ship-sdlc does not forward it. `commit-sdlc` gains …
  ```

  R41 Acceptance (`:24`), the whole line:

  ```diff
  -  - Acceptance: behavioral coverage in `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — `execute-plan-sdlc (R41): standalone invocation with neither a positional plan path nor --plan halts before Step 1 LOAD with what/how/why remediation text`, `execute-plan-sdlc (R41): standalone invocation does not prompt or fall back to conversation-context plan text`, `execute-plan-sdlc (R41): --resume with a state file whose planPath is non-null does not halt and sources the plan from planPath`, `execute-plan-sdlc (R41): --resume with a state file whose planPath is null halts with the same remediation text as the no-resume case`.
  +  - Acceptance: behavioral coverage in `tests/promptfoo/datasets/execute-plan-sdlc.yaml` — `execute-plan-sdlc (R41): standalone invocation with neither a positional plan path nor --plan halts before Step 1 LOAD with what/how/why remediation text`, `execute-plan-sdlc (R41): standalone invocation does not prompt or fall back to conversation-context plan text`; exec coverage in `tests/promptfoo/datasets/execute-prepare-exec.yaml` — `execute-prepare: --resume with state planPath non-null does not report missingPlanFile`, `execute-prepare: --resume with state planPath null reports missingPlanFile`.
  ```

  R-config-version (`:27`) and its Acceptance (`:28`), both whole lines:

  ```diff
  -- R-config-version: execute-plan-sdlc has no dedicated prepare script (the skill orchestrates plan execution directly), so the verifyAndMigrate call sits in the inline node block at Step 1 (LOAD) "Guardrail loading". That node block MUST also call `verifyAndMigrate(projectRoot, 'project')` and `verifyAndMigrate(projectRoot, 'local')` UNLESS `process.env.SDLC_SKIP_CONFIG_CHECK === '1'` OR the CLI `--skip-config-check` flag was passed. Both gates resolve to the same skip behavior. On migration failure the skill MUST halt with the failing step name surfaced before any wave is dispatched.
  -  - Acceptance: when invoked from ship-sdlc (which has already run verifyAndMigrate and exported `SDLC_SKIP_CONFIG_CHECK=1`), the inline block does not re-run migration; when invoked standalone, the block runs migration before guardrail loading.
  +- R-config-version: The prepare script `skill/execute.js` MUST call `verifyAndMigrate(projectRoot, 'project')` and `verifyAndMigrate(projectRoot, 'local')` through `lib/config-version-prepare.js`, as every other prepare script does, before it reads any config section, UNLESS `process.env.SDLC_SKIP_CONFIG_CHECK === '1'` OR the CLI `--skip-config-check` flag was passed. Both gates resolve to the same skip behavior, reported as `flags.skipConfigCheck` (P1). On migration failure the script exits 1 with the failing step in `errors[]` (id `configVersion`), and the skill MUST halt with that step name surfaced before any wave is dispatched.
  +  - Acceptance: when invoked from ship-sdlc (which has already run verifyAndMigrate and exported `SDLC_SKIP_CONFIG_CHECK=1`), `skill/execute.js` does not re-run migration and reports `migration: null`; when invoked standalone, it runs migration before it reads the `execute` section.
  ```

  LOAD phase entry (`:86-88`), three whole lines:

  ```diff
  -   - **Script:** `lib/config.js` → `readSection()` via inline Node.js
  -   - **Params:** project root, section `execute.guardrails`
  -   - **Output:** JSON guardrails array (or empty array if unconfigured)
  +   - **Script:** `skill/execute.js` (prepare script; runs once per invocation, before any other phase)
  +   - **Params:** A1–A7 forwarded, plus `--commit-waves`, `--wave-timeout`, `--wave-interval`, `--skip-config-check`, `--project-root`, `--output-file`
  +   - **Output:** JSON → P1–P8 (flags, plan, classification floor, waves, guardrails, workspace, resume, openspec)
  ```

  DO phase entry (`:95-96`), inside the **Params:** line and the **Output:** line:

  ```diff
  -… `wave-start --wave N`, …
  +… `wave-start --wave N --tasks-json --manifest-json`, …
  -   - **Output:** JSON state object persisted to `.sdlc/execution/execute-<branch>-<timestamp>.json` after each wave
  +   - **Output:** JSON state object persisted to `.sdlc/execution/execute-<branch>-<timestamp>.json` after each wave; `wave-start --manifest-json` also prints the wave manifest (P9)
  ```

  R-WAVE-DEADLINE (`:253-256` and `:268`), whole wrapped lines:

  ```diff
  -  `ship.executeWaveTimeout` (seconds, `.sdlc/local.json`, R57 convention). execute-plan-sdlc has
  -  no prepare script of its own to resolve this value: ship-sdlc resolves `ship.executeWaveTimeout`
  -  and forwards it as `--wave-timeout` to the execute step invocation (same cross-skill wiring
  -  pattern as R35). The harness provides no per-Agent wall-clock deadline — `maxTurns` is a turn
  +  `execute.waveTimeout` (seconds, `.sdlc/config.json`). The prepare script `skill/execute.js`
  +  resolves it (CLI `--wave-timeout`, then config, then the legacy `.sdlc/local.json`
  +  `ship.executeWaveTimeout`, P1) and the value reaches the wave-runner through the `wave-start`
  +  manifest (P9); ship-sdlc does not forward it. The harness provides no per-Agent wall-clock deadline — `maxTurns` is a turn
  -  `executeWaveTimeout`, WAVE_SUMMARY reports that task with `errorCode: TIMEOUT` and wave
  +  `waveTimeout`, WAVE_SUMMARY reports that task with `errorCode: TIMEOUT` and wave
  ```

- names: header `**Prepare script:**`; `R35`, `R41` (Acceptance only), `R-config-version` (+ Acceptance), LOAD and DO phase entries, `R-WAVE-DEADLINE`; config keys `execute.commitWaves`, `execute.waveTimeout`; legacy keys `ship.execute.commitWaves`, `ship.executeWaveTimeout`; field `flags.skipConfigCheck`; the two exec case descriptions.
- mirror: `docs/specs/ship-sdlc.md` R-config-version (`:55`) for the prepare-script wording; `docs/specs/commit-sdlc.md` header line style.
- decisions: ruling w1-plan Q1 (a) and accepted reading 1; Key Decisions "Rewords keep each sentence's shape".
- sync: Task 2 defines P1, P7 and P9, which these lines cite; Task 3 rewords ship R57 to match.

**Acceptance criteria:**
- [ ] Before editing, all 16 anchors print `1`, and the S1 check prints `1`.
- [ ] After editing, each new text prints `1` in the execute spec: `command grep -cF -- '**Prepare script:** `skill/execute.js`'`; `command grep -cF -- 'MUST be parsed by the prepare script `skill/execute.js` alongside'`; `command grep -cF -- 'then the legacy `.sdlc/local.json` `ship.execute.commitWaves`, P1); ship-sdlc does not forward it.'`; `command grep -cF -- '- R-config-version: The prepare script `skill/execute.js` MUST call'`; `command grep -cF -- '`skill/execute.js` does not re-run migration and reports `migration: null`'`; `command grep -cF -- '   - **Script:** `skill/execute.js` (prepare script; runs once per invocation, before any other phase)'`; `command grep -cF -- '`wave-start --wave N --tasks-json --manifest-json`'`; `command grep -cF -- 'also prints the wave manifest (P9)'`; `command grep -cF -- 'manifest (P9); ship-sdlc does not forward it.'`; `command grep -cF -- '  `waveTimeout`, WAVE_SUMMARY reports'`.
- [ ] Fold-in (a) Verification: `command grep -c "planPath is non-null does not halt" docs/specs/execute-plan-sdlc.md` prints `0`; `command grep -o "execute-prepare: --resume with state planPath" docs/specs/execute-plan-sdlc.md | wc -l` prints `2` (both names sit on the one Acceptance line, so `grep -c` would print `1`).
- [ ] The old texts print `0` in the execute spec: `inline Node.js`, `no prepare script of its own`, `the inline block does not re-run migration`, `is resolved in \`scripts/skill/ship.js\` and forwarded as \`--commit-waves\``.

### Task 2: Prepare script contract section and C13–C16

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** build

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — insert `## Prepare script contract` before `## Failure handling and resume`; insert C13–C16 after C12.

**Notes:** Implements W5.2 Change 7 (F-spec-anchors-and-shape-validator-11, -12, -13) and P6's branch rule from ruling w1-plan Q2 (b). Both insertion anchors are whole lines that occur once. The C-item texts are copied verbatim from `docs/spec-template.md:114-117` (the same text as `docs/specs/ship-sdlc.md:397-400`). Insert C13–C16 first (higher line), then the section. The blocks below are indented two spaces inside the Contract list; insert them at column 0.

**Anchors (each must print `1`):**

```bash
e=docs/specs/execute-plan-sdlc.md
for a in '## Failure handling and resume' '## Gates'; do
  printf '%s  %s\n' "$(tr -d '\r' < "$e" | command grep -cxF -- "$a")" "$a"   # whole-line match
done
printf '%s  C12\n' "$(tr -d '\r' < "$e" | command grep -cF -- '- C12: Every Agent dispatch MUST include the `model:` parameter per the preset mapping (R2).')"
printf '%s  (must be 0)\n' "$(tr -d '\r' < "$e" | command grep -c '^## Prepare script contract$')"
```

**Must not touch:** C1–C12, R-IDNORM, every existing section. Every other file.

**Contract:**
- shape (openspec): ADD one section and four C-items; no other id changes. Insert the block below, followed by one blank line, immediately before the line `## Failure handling and resume`:

  ```markdown
  ## Prepare script contract

  - P1: `flags` (object: `{ plan, quality, resume, rebase, auto, branch, commitWaves, waveTimeout, waveInterval, waveRunnerMinPlanTasks, specReviewer, skipConfigCheck, sources }`) — the resolved flags. Each value resolves CLI flag, then the `execute` section of `.sdlc/config.json`, then (for `waveTimeout`, `waveInterval` and `commitWaves` only) the legacy `.sdlc/local.json` keys `ship.executeWaveTimeout`, `ship.executeWaveInterval` and `ship.execute.commitWaves`, then the built-in default; `sources.<name>` records `cli`, `config`, `legacy-ship` or `default`. `quality` resolves per A6 (`sources.quality` is `cli`, `state` or `default`; both are `null` in an interactive run with no `--quality` and no resumed tier). A resumed tier (`--resume` with a found state file) applies in any run; the `balanced` default applies only under `--auto`. `waveRunnerMinPlanTasks` is the task count at which a plan dispatches through the wave-runner; `specReviewer` (`once` | `per-wave`) sets how often the spec-compliance review runs. Every SKILL.md decision site cites these fields, never `$ARGUMENTS` or raw config.
  - P2: `plan` (object: `{ path, hash, header: { title, goal, architecture, source, verification }, tasks: [...] }`) — the plan parsed by `lib/plan-parse.js::parsePlan`; `hash` is the SHA-256 of the plan file bytes; each task carries `{ id, title, complexity, risk, dependsOn, files: { create, modify, test }, verify, contract, notes, acceptance, openspecTask }`.
  - P3: `classificationFloor` (array of `{ id, complexity, risk, fileCount, reasons }`) — each task's declared `**Complexity:**` and `**Risk:**` plus its file count. The skill may raise a value only with a stated reason, never lower it.
  - P4: `waves` (array of `{ n, taskIds, cap, budget, expectedFiles, verificationHint }`) — the wave structure: topological order over `dependsOn`, the same-file constraint, the static cap and `lib/dispatch-budget.js::computeWaveBudget`. Complex tasks weigh 2 toward the cap; a wave over the cap, or holding more than one High-risk task, is split into a wave inserted directly after it; `cap` is `null` when the static cap is unlimited. Step 3 (CRITIQUE) may move a task to a later wave only with a stated reason (an implicit dependency or a file conflict the plan does not declare); it never merges waves or drops a task. `expectedFiles` is the union of every task's Create/Modify/Test paths; `verificationHint` is the shared `**Verify:**` value when every task in the wave has the same one, else `null`.
  - P5: `guardrails` (array of `{ id, description, severity }`) — `execute.guardrails` from `.sdlc/config.json` (`[]` when none); the skill's `activeGuardrails`.
  - P6: `workspace` (object: `{ decision, currentBranch, defaultBranch, inLinkedWorktree, suggestedBranch }`) — the R16 derivation via `lib/git.js::deriveWorkspace` (`decision` is `branch` or `continue`; with `--branch`, R30, it is `continue`). `suggestedBranch` is set only for `branch`: `lib/branch-name.js::resolveBranchName` with the type taken from a fixed whole-word, case-insensitive keyword map on the plan's H1 title (first match in this order: `fix` or `bug` → `bugfix`, `docs` → `docs`, `refactor` → `refactor`, `chore` → `chore`, otherwise `feature`) and the slug taken from the H1 title minus a trailing " Implementation Plan"; otherwise `null`. A git failure gives `workspace: null` and a warning.
  - P7: `resume` (object: `{ found, stateFile, planPath, planHash, completedWaves }`) — the current branch's execute state file (`lib/state.js::findStateFile` / `readState`); `completedWaves` lists the wave numbers whose status is `completed`. With `--resume` and no plan argument, a non-null `planPath` becomes `plan.path` (R41 resume exemption); an absent state file or a null `planPath` reports `missingPlanFile`.
  - P8: `openspec` (object: `{ specsDir, specFiles, taskMap, refToTaskIds }`) — the change directory named by the plan's `**Source:**` (`openspec/changes/<name>/`) and the tasks' `openspec-task` blocks (R37); empty values when the plan is not OpenSpec-sourced.
  - P9: `wave-start.manifest` (object; the `manifest` field of the `{ runId, factSheets, manifest }` line that `state/execute.js wave-start --tasks-json … --manifest-json …` prints; `--manifest-json` requires `--tasks-json`) — `{ waveNumber, totalWaves, qualityTier, escalationBudget, waveTimeout, waveInterval, runId, stateScript, guardrails, expectedFiles, verificationHint, tasks: [{ id, complexity, risk, factSheetPath, assignedModel, effort, verifyToken }] }`. The skill passes it to the wave-runner verbatim.

  The prepare output also carries `errors[]` (each `{ id, message }`; ids `missingPlanFile`, `planFileNotFound`, `planParseError`, `invalidQuality`, `invalidFlag` and `configVersion`, the last carrying the failing role and step of R-config-version), `warnings[]` and `migration`. The script exits 0 when `errors[]` is empty, 1 when it is not, and 2 on a crash.
  ```

  Insert these four lines immediately after the C12 line:

  ```markdown
  - C13: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
  - C14: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
  - C15: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
  - C16: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
  ```

- names: section `## Prepare script contract`; `P1`–`P9`; `C13`–`C16`; error ids `missingPlanFile`, `planFileNotFound`, `planParseError`, `invalidQuality`, `invalidFlag`, `configVersion`; provenance values `cli`, `config`, `legacy-ship`, `default`, `state`.
- mirror: `docs/specs/commit-sdlc.md` Prepare section (P-line style); `docs/specs/ship-sdlc.md:397-400` and `docs/spec-template.md:114-117` (C-items, verbatim).
- decisions: Key Decisions (P-ids follow the output shape; no tuning values); ruling w1-plan Q2 (b) for P6; no template R-item (Deviations table).
- sync: the W5.2 feat plan's `execute.js` output, `state/execute.js wave-start --manifest-json` and the `execute-prepare-exec.yaml` assertions use exactly these names.

**Acceptance criteria:**
- [ ] Before editing, `## Failure handling and resume`, `## Gates` and the C12 line each print `1`, and `## Prepare script contract` prints `0`.
- [ ] After editing, `## Prepare script contract` occurs once, after `## Gates` and before `## Failure handling and resume`: `tr -d '\r' < docs/specs/execute-plan-sdlc.md | command grep -n '^## ' | tr '\n' ' '` lists `Gates`, `Prepare script contract`, `Failure handling and resume` in that order.
- [ ] `tr -d '\r' < docs/specs/execute-plan-sdlc.md | command grep -cE '^- P[1-9]: '` prints `9`, and `command grep -cE '^- C1[3-6]: '` prints `4`.
- [ ] `command grep -cF -- 'first match in this order: `fix` or `bug` → `bugfix`' docs/specs/execute-plan-sdlc.md` prints `1`.

### Task 3: Ship R57 reword and the S2 checks

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2
**Verify:** build

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R57 (`:54`), two clauses of the same line.

**Notes:** Implements F-spec-anchors-and-shape-validator-9 (ruling w1-plan accepted reading 1). The plan's header Verification is this task's final check. Run `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w1; mkdir -p "$TMPDIR";` in the same Bash call as every command that uses `$TMPDIR`.

**Anchors (each must print `1`):**

```bash
s=docs/specs/ship-sdlc.md
for a in '`awaitRemoteReviewers` (array of strings, minItems 1), `executeWaveTimeout` (integer 60–3600), `executeWaveInterval` (integer ≥10). Defaults are defined in' \
  'All timeout/interval values are in **seconds**. The two `executeWave*` keys are flat inside `ship` (not nested under `ship.execute`), are prompted only when `execute` is in `ship.steps[]`, and are forwarded to execute-plan-sdlc as `--wave-timeout <n> --wave-interval <n>` on the execute step'"'"'s invocation — that forwarded flag is the only resolution path (no environment variable). The `executeWaveTimeout` ceiling of 3600 is enforced by the single runtime constant `MAX_WAVE_TIMEOUT_SECONDS` in `scripts/lib/ship-fields.js` (the'; do
  printf '%s  %s\n' "$(tr -d '\r' < "$s" | command grep -F -- "$a" | wc -l)" "$a"
done
```

**Must not touch:** the other fields R57 lists, its "Defaults are defined in …" sentence and its closing "(R-WAVE-DEADLINE.)"; every other line of the ship spec. Every other file.

**Contract:**
- shape (openspec): MODIFY two clauses inside R57; no ids added or removed.

  ```diff
  -… `awaitRemoteReviewers` (array of strings, minItems 1), `executeWaveTimeout` (integer 60–3600), `executeWaveInterval` (integer ≥10). Defaults are defined in …
  +… `awaitRemoteReviewers` (array of strings, minItems 1). Defaults are defined in …
  -… All timeout/interval values are in **seconds**. The two `executeWave*` keys are flat inside `ship` (not nested under `ship.execute`), are prompted only when `execute` is in `ship.steps[]`, and are forwarded to execute-plan-sdlc as `--wave-timeout <n> --wave-interval <n>` on the execute step's invocation — that forwarded flag is the only resolution path (no environment variable). The `executeWaveTimeout` ceiling of 3600 is enforced by the single runtime constant `MAX_WAVE_TIMEOUT_SECONDS` in `scripts/lib/ship-fields.js` (the …
  +… All timeout/interval values are in **seconds**. The legacy keys `executeWaveTimeout` (integer 60–3600) and `executeWaveInterval` (integer ≥10) stay in `shipSection`, marked deprecated: ship-sdlc no longer resolves, prompts for or forwards them, and execute-plan-sdlc's prepare script `skill/execute.js` reads them only as a fallback below `execute.waveTimeout` / `execute.waveInterval` in `.sdlc/config.json` (provenance `legacy-ship`, execute P1). The wave-timeout ceiling of 3600 is enforced by the single runtime constant `MAX_WAVE_TIMEOUT_SECONDS` in `scripts/lib/ship-fields.js`, which `skill/execute.js` imports (the …
  ```

- names: ship `R57`; constant `MAX_WAVE_TIMEOUT_SECONDS`; keys `executeWaveTimeout`, `executeWaveInterval`, `execute.waveTimeout`, `execute.waveInterval`.
- mirror: ship R57 itself (the clause order is kept).
- decisions: accepted reading 1; R-legacy-config (legacy keys stay, marked deprecated; no migration).
- sync: execute R-WAVE-DEADLINE and P1 (Tasks 1–2); `schemas/sdlc-local.schema.json` descriptions (W5.2 feat plan).

**Commit:** subject `docs(#9013): execute-plan-sdlc - prepare script contract (W5.2)` (63 characters). The executor commits Tasks 1–3 together through `/sdlc:commit-sdlc` after this task's checks pass. Body: one line per changed id group (header; P1–P9 and C13–C16 added; R-config-version, R35, R41 Acceptance, R-WAVE-DEADLINE, LOAD and DO entries reworded; ship R57 reworded), then `Checks: P-5 execute +P1-P9 +C13-C16 only; ship SAME; validate-spec-shape prints nothing for either spec.` with the real results, then the session's attribution line.

**Acceptance criteria:**
- [ ] Before editing, both anchors print `1`.
- [ ] After editing, `command grep -cF -- 'stay in `shipSection`, marked deprecated: ship-sdlc no longer resolves, prompts for or forwards them' docs/specs/ship-sdlc.md` prints `1`, and `command grep -cF -- 'that forwarded flag is the only resolution path' docs/specs/ship-sdlc.md` prints `0`.
- [ ] The header Verification prints exactly `> C13 > C14 > C15 > C16 > P1 > P2 > P3 > P4 > P5 > P6 > P7 > P8 > P9` with no `<` line, then `SAME ship-sdlc`, `exit=0` and `0`.
- [ ] `git diff --stat` shows only the two spec files, and `git diff | command grep -c $'\r'` prints `0`.
- [ ] `git status --porcelain -uno` shows only the two spec files before the commit (untracked plan files under `docs/plans/` are not part of this commit).

## Final Shape

The execute spec now describes the prepare script W5.2 builds:

- The header names `skill/execute.js`.
- `## Prepare script contract` lists P1–P9 and the error, warning and migration fields.
- C13–C16 forbid the skill from skipping, overriding, inventing or re-deriving the script's output.
- R-config-version, R35, R-WAVE-DEADLINE and the LOAD and DO entries name the script as the resolver. Ship R57 calls its two execute keys deprecated fallbacks.
- R41 Acceptance cites two exec cases that the feat commit adds.
- No existing id changed.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement (source checklist) | Task(s) | Status |
|---|---|---|
| 3 Prepare header, contract section P1–P9, C13–C16 | Task 1, Task 2 | covered |
| 4 R41 Acceptance names the two exec cases | Task 1 | covered |
| 5 Consequence rewords (R-config-version, R35, R-WAVE-DEADLINE, LOAD, ship R57); P-5 | Task 1, Task 3 | covered |
| 6 P6 records the Q2 (b) branch rule | Task 2 | covered |

Review: single reviewer (all lenses). Round 1 Approved with warnings, all fixed (`git status -uno`; S2 also gained the `configVersion` id, the P1 resumed-tier clause, the P4 split rules, the P6 whole-word rule and the P9 wording). Round 2 Approved with no issues. Step 3 lanes clean in round 2.

Fix round 1 (planreview-wave-1 M4, M5): P4 Step 3 carve-out and the P9 `--tasks-json` requirement added; no further review round.

Verdict: All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
