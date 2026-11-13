# Explore fan-out check and ship round counts Implementation Plan

**Commit:** `fix(#9382): plan, ship - explore fan-out check, round counts`
**Goal:**
- Make the plan-sdlc exploration fan-out detectable and its fallback explicit (F-70, todo #9376).
- Give ship's summary one structured record per review round and for the final check (todo #9378).

**Architecture:** Item 1 adds a script check (`plan-explore.js --check-brief <outDir>`) that plan-sdlc runs after the explore orchestrator returns, a mandatory fan-out rule in the orchestrator prompt, and a per-dimension result file the check can see. Item 2 adds one helper in `skill/ship.js` that builds a review round record, stores it when a round ends and when the final check completes, and lists all records as `reviewRounds` in `buildSummary` (which feeds both `ext.summary` and the summary sidecar).
**Source:** conversation context (wave 17 brief; todo #9376 / ledger F-70; todo #9378)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

There are two problems.

1. In waves 13, 14 and 15 the explore orchestrator (`sdlc:plan-explore-orchestrator`, the agent that splits plan exploration into parallel "dimension" subagents) sometimes did not dispatch its subagents. It explored by itself and returned findings inline. The planners then fell back to inline exploration. Nothing in plan-sdlc can tell a real fan-out from a skipped one: the only check greps the brief for `F-` ids, and one skipped run wrote a brief with ids anyway.
2. Ship deletes its state file (the ledger) at cleanup. Its `rounds[]` keep only free-text step results. So a caller such as the lean ledger cannot see, after the run, how many findings each review round had or what received-review fixed.

**Root cause of item 1, with evidence (re-verified at HEAD 053da92).**

- The plugin definition did not change. `plugins/sdlc-utilities/agents/plan-explore-orchestrator.md:4` declares `tools: Read, Write, Glob, Grep, Bash, Agent, WebSearch, WebFetch`; the last change to the file is b529982 (2026-11-05, before wave 12), which only added `effort: medium`.
- The harness gave the Agent tool every time. All 24 orchestrator transcripts of the main session 101d243d (2026-11-10 to 2026-11-13) have the same request shape hash `5193ef08`, and each tool list holds `Agent`. All 24 ran at `spawnDepth: 2` with `requestShape: background`. So depth and background mode are the same for the runs that fanned out and the runs that did not.
- 20 of 24 runs dispatched dimension subagents. 4 did not: `aa790420` (11-12 21:29, M4b), `ab8a6a1e` (11-13 10:56), `ab827710` (11-13 12:40) and `aca34fcb` (11-13 13:24, w15). Their hand-backs say: "The manifest had no scope hints … so I did not run the fan-out"; "I did not dispatch the three subagents … the task was narrow, so I grepped the code directly" (this one still wrote a brief with F- ids); "The Agent tool is not in my function list" (false: the tool list of that run holds Agent); "I did not run the fan-out or write discovery-brief.md".
- Every one of the 24 manifests had `scopeHintCount: 0`, so the empty scope-hint list does not separate the groups either. The wave-16 planner run and this wave's run (11-13 18:53 and 19:58) fanned out normally.
- Conclusion: the cause is in the plugin, in the prompt and in the gate. The Sonnet orchestrator (medium effort) sometimes chooses to skip Step 2. Its prompt never says that the fan-out is mandatory or what to do when a dispatch fails. plan-sdlc's brief check (SKILL.md Step 1, item 3) only greps for finding ids, so a self-written brief passes. It is not a harness cause, so no depth workaround is needed.

**What prompted this change now?** The lean ledger recorded the skipped fan-outs as F-70. The lean ledger also needs per-round review counts (#9378) and cannot read them after ship deletes its ledger.

**What does success look like?**

- A skipped fan-out always lands in the explicit R28 fallback with a logged reason, decided by a script and not by the planner's reading.
- The orchestrator prompt states that Step 2 is mandatory and what to return when a dispatch fails.
- `ext.summary.reviewRounds` lists each review round and the final check with its counts, threshold and received-review outcome, and exec cases prove it for a two-round run with a final check.

## Research Findings

Exploration ran through the explore orchestrator (it fanned out 4 code dimensions this time). Brief: `/tmp/sdlc-explore-main-MMatku/discovery-brief.md`. The planner also sampled the transcripts directly (see Context).

**Item 1 — explore orchestrator.**

- The agent definition is clean: Agent is in its tools line, unchanged since #408 (F-explore-orchestrator-agent-definition-1). `review-orchestrator` has the same tool shape and fans out fine (F-explore-orchestrator-agent-definition-2).
- The orchestrator brief proposed a depth-limit cause (F-explore-orchestrator-agent-definition-3, F-plan-sdlc-explore-dispatch-fallback-2). The transcripts refute it: failing and passing runs share depth 2 and the same tool list. That finding is rejected.
- No spec, SKILL.md or agent text says what the orchestrator does when an Agent call fails (F-explore-orchestrator-agent-definition-4).
- SKILL.md Step 1 names no `subagent_type` for the dispatch (F-plan-sdlc-explore-dispatch-fallback-1).
- The fallback fires on three triggers only: `explorePack.error`, a non-zero return, or zero F- ids. A missing `Brief file:` line or an unreadable brief is not named (F-plan-sdlc-explore-dispatch-fallback-3, F-plan-sdlc-explore-dispatch-fallback-4).
- Brief validation is prose only. `plan-explore.js` writes only `manifest.json` and has no check mode (F-plan-sdlc-explore-dispatch-fallback-5, F-plan-sdlc-explore-dispatch-fallback-6).
- The exec tests of `plan-explore.js` are in `tests/promptfoo/datasets/plan-prepare-exec.yaml:119-237`. There is no case for a missing brief or a skipped fan-out (F-plan-sdlc-explore-dispatch-fallback-7).
- The user doc `docs/skills/plan-sdlc.md:67-68,100-102` lists only two fallback triggers (F-plan-sdlc-explore-dispatch-fallback-8).
- Extra finding by the planner: SKILL.md Step 1 routes "Lightweight scope" on `explorePack.scopeHintCount ≤ 3`. `scopeHintCount` was 0 in all 24 runs (plan.js gives `plan-explore.js` no prompt on stdin), so read literally the orchestrator would never run. Spec R24 routes on the Step 0 complexity routing instead. The planners followed R24.
- The highest plan-sdlc spec id is R71, so the next free id is R72. The orchestrator ids are R24 to R28 and R56.

**Item 2 — ship summary.**

- `buildSummary(ledger)` at `plugins/sdlc-utilities/scripts/skill/ship.js:1971-2002` is the only summary builder. It feeds the cleanup step's `data.summary`, the sidecar `.summary-<ledger>` and the `ext.summary` of the done envelope (F-ship-round-summary-ext-1, F-ship-round-summary-ext-6, F-ship-round-summary-ext-7).
- `afterFixesCommitted` at `ship.js:2466-2497` is the only writer of `ledger.rounds[]`. It runs before the next round overwrites the review summary file (F-ship-round-summary-ext-2).
- `reviewGateDecision(ledger)` at `ship.js:1883-1892` returns `counts` and `threshold` from the review summary file (F-ship-round-summary-ext-3).
- The final check completes at `ship.js:2924-2931` (F-ship-round-summary-ext-4).
- A round whose gate was not met, or whose commit-fixes was skipped, never reaches `afterFixesCommitted`. Such a round is still the live round at cleanup.
- Received-review outcome counts are recorded nowhere. Only the free-text `result` and the history entry's `data.artifacts` exist (F-ship-round-summary-ext-5). The ship step agent's return item (3) names only commit, tag, PR URL and verdict (`plugins/sdlc-utilities/agents/ship-step-received-review.md:21`). Received-review's own Step 12 report already counts "K resolved (fixed) / M pushback / J skip" (`plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:603-608`).
- The highest ship spec id is R105, so the next free id is R106 (F-ship-spec-and-exec-test-surface-1). Related ids: R78 (summary fields), R84 (rounds) and R95 (final check).
- Tests: `tests/promptfoo/scripts/run-ship-stepper.js` drives the `rounds-*` scenarios (`:738-790`) and has a `walk()` helper (`:311-322`) that answers steps up to `done`. Fixture result files come from `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh:176-196`.
- Docs that describe the summary: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:318-350` (Step 6), `skills/ship-sdlc/state-format.md:49` (finalCheck row, no rounds row), `docs/skills/ship-sdlc.md:255-261` (Review rounds) and its site copy (F-ship-round-summary-ext-10).

**Build and test commands.**

- Exec targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Validators: `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`, `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`, `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js`.
- Site copies of edited docs and specs are refreshed with `cp` (byte copies under `site/src/content-source/`).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| F-70 cause | no | Treats the cause as a plugin cause (prompt and gate), not a harness cause | Transcript evidence: the same tool list (with Agent), the same depth and the same background mode in passing and failing runs |
| Deterministic check | no | Adds `plan-explore.js --check-brief` over the brief and per-dimension result files, not only a frontmatter check | The frontmatter was never wrong; the check must catch the failure that actually happened |
| Received-review counts | no | Ship reads `fixed` / `declined` / `deferred` from the received-review step's artifacts; the ship step agent's return item (3) asks for the Step 12 counts the skill already reports | The brief allows reading what received-review already reports; received-review's own output format stays unchanged |
| SKILL.md routing wording | no | Aligns the plan-sdlc Step 1 "Lightweight scope" condition with R24 (complexity routing), dropping `scopeHintCount ≤ 3` | `scopeHintCount` is always 0, so the literal rule contradicts R24 and the observed dispatch |

## Decisions taken without the owner

- The F-70 cause is in the plugin, so the plan fixes the prompt and the gate. It does not add a retry or change the dispatch depth.
- Received-review counts come from the step artifacts when the return reports them, else `null`. Received-review-sdlc itself is not changed.
- The final check appears in `reviewRounds` as an entry with `final: true`. The existing `finalCheck` object stays as it is and gains a `record` field, so its current readers keep working.
- A skipped fan-out is not retried. The cheap R28 inline fallback runs with a logged reason.

## Key Decisions

1. **Script check over prose grep (item 1).**
   - Choice: plan-sdlc runs `plan-explore.js --check-brief <outDir>` after the orchestrator returns.
   - Alternative: keep the prose grep and only strengthen the prompt.
   - Why: a prompt rule alone failed 4 times in 24. A script check is deterministic and matches the project's "scripts over LLM logic" rule. It lives in `plan-explore.js` because that script owns the explore tempdir and its manifest.
2. **Per-dimension result files as fan-out evidence.**
   - Choice: the orchestrator writes each subagent's returned text to `<outDir>/dim-<name>.md`, and the check requires one file per dimension in the brief's table.
   - Alternative: trust a "Dispatched: N" line in the brief.
   - Why: all 4 failures were honest skips that wrote no subagent results. A file per dimension makes such a skip visible to a script. Accepted gap: an orchestrator that invents the files itself is not detected (stated in R72).
3. **No depth workaround.** The transcripts show the Agent tool at depth 2 in every run. The orchestrator brief's depth theory is rejected (F-explore-orchestrator-agent-definition-3).
4. **One record helper for item 2.**
   - Choice: one function `reviewRoundRecord(ledger, round, final)` builds every record.
   - It is called when a round ends (stored on `rounds[k].record`), when the final check completes (stored on `finalCheck.record`), and in `buildSummary` for a live last round that never reached `afterFixesCommitted`.
   - Why: counts must be read before the next round overwrites the review summary file. One helper keeps the three sites identical (DRY).
5. **Smallest viable cut.** Item 2 changes no step agent contract except the received-review return item (3). Without that change the three outcome counts would always be `null`, and #9378 asks for them. Step 6's printed report is not changed: the caller (the lean ledger) reads `ext.summary`, so a printed line is not needed.
6. **Workspace modes.** Nothing new is written. The explore outDir stays under `os.tmpdir()`; ship's review summary is read through `reviewSummaryPath()`, which uses `resolveStateDir()` (the main worktree) in both `ship.workspace=branch` and `worktree`; the ledger, sidecar and learnings-log paths are unchanged.

Failure audience: planners (a hidden skipped fan-out produces plans without exploration provenance) and the lean ledger owner (ship summaries without round counts). Non-goals: no change to the dispatch depth, the lean orchestration skill, received-review-sdlc's own output, the worker write guard, review-sdlc (R21 included), or execute-plan-sdlc R90/R92 and docs/cost-tiers.md (wave 16).

## Contract Examples

```markdown
**Contract:**
- shape (code): `node plan-explore.js --check-brief <outDir>` prints one JSON object
  `{ ok, reason, dimensions, missingResults, findingIds }` and exits 0 (ok) or 1 (not ok).
- names: `checkBrief(outDir)`, reason codes `brief-missing`, `no-dimensions`, `no-finding-ids`, `missing-dimension-results`.
- mirror: CLI parse style at `plugins/sdlc-utilities/scripts/skill/plan-explore.js:79-90`.
- decisions: stdout JSON, no output file (the result is small and read once).
- sync: plan-sdlc SKILL.md Step 1 calls it with these exact flags.
- example: an outDir with a brief naming two dimensions and one `dim-*.md` file → `{"ok":false,"reason":"missing-dimension-results",...}`, exit 1.
```

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `### Review rounds`; add one paragraph on `reviewRounds` (audience: end users and callers of ship).
- names: field `reviewRounds`.
- mirror: the finalCheck paragraph at `docs/skills/ship-sdlc.md:259`.
- decisions: user-facing prose; cites R106.
- sync: byte copy at `site/src/content-source/skills/ship-sdlc.md`.
```

```markdown
**Contract:**
- shape (openspec): ADD requirement `R72` to `docs/specs/plan-sdlc.md` under `## Dispatch and routing`; MODIFY `R28` and `E6` to name the new fallback triggers; numbering continues from `R71`.
- names: `R72` (new), `R28`, `E6` (modified).
- mirror: requirement style of `R56` at `docs/specs/plan-sdlc.md:77`.
- decisions: numeric id, next free number.
- sync: SKILL.md Step 1 and the orchestrator agent cite R72.
```

## Tasks

### Task 1: plan-sdlc spec — R72 explore fan-out evidence, R28 and E6 triggers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — add R72 after R56 in `## Dispatch and routing`; amend R28 and E6; add an appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only (plan.copyRules companion): change nothing unless a grep for `orchestrator|discovery-brief|scopeHintCount` finds a stale sentence
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, same grep
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, same grep
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — check only, same grep
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, same grep

**Notes:** Spec first (spec-first guardrail). The planner's grep at HEAD found none of the five companions describing the explore step, so they are expected to stay unchanged. Cites F-plan-sdlc-explore-dispatch-fallback-3, F-plan-sdlc-explore-dispatch-fallback-4 and F-explore-orchestrator-agent-definition-4. The evidence summary goes only in the appendix row; withdrawn ids and issue numbers stay in the appendix (spec shape rule).

**Acceptance criteria:**
- [ ] R72 holds parts (a) to (e) below, word for word in meaning.
- [ ] R28 and E6 name every trigger listed below.
- [ ] The appendix row is added; no id is renumbered.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD `R72`; MODIFY `R28`, `E6`; numbering continues from `R71`. Delta text:

```text
- R72 (Explore fan-out evidence): (a) Every `sdlc:plan-explore-orchestrator` run performs the Step 2 fan-out. An empty scope-hint list, `webResearchSignal: false` or a narrow task never allows inline exploration in its place. (b) When an Agent call returns an error, the orchestrator writes no brief and returns `Brief file: none` and `Error: <the tool error text>`. (c) The orchestrator writes each dimension subagent's returned text, verbatim, to `<outDir>/dim-<name>.md` before CRITIQUE. (d) plan-sdlc Step 1 dispatches the orchestrator with `subagent_type: sdlc:plan-explore-orchestrator` and no `model`, `effort`, `isolation` or `run_in_background` parameter. After it returns, Step 1 runs `node <PLUGIN_ROOT>/scripts/skill/plan-explore.js --check-brief <explorePack.outDir>`. The check passes (exit 0) only when `discovery-brief.md` exists, its `## Dimensions` table names at least one dimension, every named dimension has a non-empty `dim-<name>.md`, and the brief holds at least one `F-<DIM>-<n>` id. Otherwise it exits 1 with one reason code: `brief-missing`, `no-dimensions`, `missing-dimension-results` or `no-finding-ids`. (e) Threat model: the check catches an orchestrator that skips the fan-out or returns no brief. Accepted gap: an orchestrator that writes the `dim-*.md` files itself with invented content is not detected.
  - Acceptance: exec cases whose descriptions start with `plan-explore: (r72)` in `tests/promptfoo/datasets/plan-prepare-exec.yaml`.
```

```text
- R28 (Orchestrator-failure fallback): Step 1 falls back to inline exploration without the brief when any of these holds: `explorePack.error` is non-null; the orchestrator returns an error; its return has no `Brief file:` line or says `Brief file: none`; or the R72 brief check exits non-zero. Plan is still produced. The failure is logged to `.sdlc/learnings/log.md` with its reason (the error text or the R72 reason code).
```

  E6 gets the same trigger list and the log line `## YYYY-MM-DD — plan-sdlc orchestrator skipped: <reason>`. Appendix row: `| R72, R28, E6 | explore fan-out evidence and brief check; 4 of 24 runs skipped the fan-out with Agent in the tool list (F-70), #9376 |`.
- names: `R72`, `R28`, `E6`, reason codes `brief-missing`, `no-dimensions`, `missing-dimension-results`, `no-finding-ids`.
- mirror: `R56` at `docs/specs/plan-sdlc.md:77`; appendix rows at `docs/specs/plan-sdlc.md:377`.
- decisions: Key Decisions 1–3.
- sync: Task 2 (script), Task 3 (agent) and Task 4 (SKILL.md) use these exact names.

### Task 2: plan-explore.js --check-brief with exec cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan-explore.js` — `--check-brief <outDir>` mode and exported `checkBrief(outDir)`
- Create: `tests/promptfoo/fixtures-fs/plan-explore-brief-check/setup.sh` — writes the subdirectories `ok/`, `skipped/`, `no-ids/` and `no-dims/`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — five cases named `plan-explore: (r72) …`

**Notes:** Implements R72 (d); closes F-plan-sdlc-explore-dispatch-fallback-5, -6 and -7. Flag name: a grep of `plugins/*/scripts` at HEAD finds no `--check-brief`, so the name is new and conflicts with no prepare script. The fixture is generated by `setup.sh` (as in `project-ship-stepper`), so one listed file creates all brief variants; no `git init`, so the fixture guard does not apply. Workspace modes: the outDir is under `os.tmpdir()` in both `branch` and `worktree` mode; the check reads only that directory.

**Acceptance criteria:**
- [ ] `--check-brief` returns `ok: true` (exit 0) for `ok/`.
- [ ] It returns `missing-dimension-results` (exit 1) for `skipped/`: the brief names 3 dimensions and there are no `dim-*.md` files.
- [ ] It returns `no-finding-ids` for `no-ids/`, `no-dimensions` for `no-dims/`, and `brief-missing` for a path with no brief.
- [ ] The manifest mode without `--check-brief` is unchanged (the existing `plan-explore:` cases pass).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-explore"` passes.

**Contract:**
- shape (code): CLI and output:

```text
node plan-explore.js --check-brief <outDir>
stdout: {"ok":true|false,"reason":null|"brief-missing"|"no-dimensions"|"missing-dimension-results"|"no-finding-ids","dimensions":["<name>",...],"missingResults":["<name>",...],"findingIds":<int>}
exit:   0 ok | 1 not ok | 2 usage error (no <outDir> value)
```

  Checks, in order; the first failing one sets `reason`:

| Order | Condition that fails | `reason` | Exit |
|---|---|---|---|
| 1 | `<outDir>/discovery-brief.md` missing or unreadable | `brief-missing` | 1 |
| 2 | no data row in the table under `## Dimensions` (first cell of each row after the separator row) | `no-dimensions` | 1 |
| 3 | a named dimension has no non-empty `<outDir>/dim-<name>.md` (listed in `missingResults`) | `missing-dimension-results` | 1 |
| 4 | zero matches of `/\bF-[A-Za-z0-9_.-]+-[0-9]+\b/g` in the brief | `no-finding-ids` | 1 |
| — | all pass | `null` (`ok: true`) | 0 |
| — | `--check-brief` given no value | usage error on stderr | 2 |

  `dimensions` and `findingIds` are always filled from what was read (`[]` and `0` when the brief is missing); `missingResults` is `[]` unless reason 3. `checkBrief(outDir)` returns the same object and never throws.
- names: `checkBrief`, `--check-brief`, `module.exports.checkBrief`.
- mirror: `parseArgs` at `plan-explore.js:79-90`; the `require.main` guard at `:408`; the exec case style at `plan-prepare-exec.yaml:121-136`.
- decisions: stdout JSON (no `writeOutput` file) because plan-sdlc reads it once from the tool result; exit code carries the verdict. The dimension name is the first table cell, trimmed and with backticks removed (R25 makes it kebab-case); a name holding `/` or `..` counts as missing, so the file name rule is exactly `dim-<name>.md`, the same string Task 3's prompt writes.
- sync: the reason codes are identical to R72 (Task 1) and SKILL.md (Task 4).
- example: `skipped/` → `{"ok":false,"reason":"missing-dimension-results","dimensions":["a-dim","b-dim","c-dim"],"missingResults":["a-dim","b-dim","c-dim"],"findingIds":4}`, exit 1.

### Task 3: plan-explore-orchestrator — mandatory fan-out and result files

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/agents/plan-explore-orchestrator.md` — Step 2 rule, result files, error return, quality gate

**Notes:** Implements R72 (a)–(c); closes F-explore-orchestrator-agent-definition-4. This addresses the 4 observed skips (Context). Keep the frontmatter as it is: it is correct. Keep the verbatim-guard wording that `check-consistency.js:284` matches. The prose follows the tool contracts: Write a new file only (each `dim-<name>.md` is new in a fresh outDir).

**Acceptance criteria:**
- [ ] Step 2 opens with the mandatory rule below.
- [ ] The await barrier paragraph is followed by the result-file rule.
- [ ] Step 5 documents the error return; the Quality Gates list the result files.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): insert these texts:

```text
Step 2 opening (before "Dispatch ALL dimensions"):
**Fan-out is mandatory (R72).** The Agent tool is in your tool list. Run this step on every run. An empty `scopeHintFiles`, `webResearchSignal: false` or a narrow task is never a reason to skip it, and you never explore inline in its place. If an Agent call returns an error, write no brief and return the Step 5 summary with `Brief file: none` and `Error: <the tool error text>`.

After the await barrier:
**Result files (R72).** As each dimension result arrives, write its returned text verbatim to `<outDir>/dim-<dimension.name>.md` with the Write tool. plan-sdlc checks one such file per row of the brief's `## Dimensions` table.

Step 5, after the summary block:
On an Agent error (Step 2), return `Brief file: none`, `Error: <text>` and the other fields with `0` / `none`.

Quality Gates, new item:
- [ ] One `dim-<name>.md` per dispatched dimension in `manifest.outDir`
```
- names: `Brief file: none`, `Error:`, `dim-<dimension.name>.md`.
- mirror: the await barrier paragraph at `plan-explore-orchestrator.md:167`.
- decisions: Key Decision 2.
- sync: the file name pattern matches Task 2's check.

### Task 4: plan-sdlc SKILL.md Step 1 dispatch, check and fallback; user doc

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 1 orchestrator dispatch, brief check, routing and fallback triggers
- Modify: `docs/skills/plan-sdlc.md` — routing and fallback paragraphs (`:63-68`, `:100-102`)
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md`)
- Modify: `site/src/data/skills-meta.ts` — plan-sdlc `explore` node description (line 36)

**Notes:** Implements R72 (d) and the amended R28; closes F-plan-sdlc-explore-dispatch-fallback-1, -3, -4 and -8. The grep validation (item 3) becomes the script call, so the planner does not judge the brief itself. The routing fix aligns the text with R24 (Deviations row 4). The R26/G15 id grep for `BRIEF_FINDING_IDS` stays. Workspace modes: the learnings-log append is the existing R28 line at the same path; nothing new is written. Behavioural fixtures checked and still valid: `tests/promptfoo/fixtures/plan-orchestrator-fallback.md` (`explorePack.error` non-null) and `plan-lightweight-skip.md` (`manifestPath` null), with their `plan-sdlc.yaml` cases; behavioural runs stay owner-initiated.

**Acceptance criteria:**
- [ ] Item 1 of the full-pipeline branch names `subagent_type: sdlc:plan-explore-orchestrator` and no model, effort, isolation or background parameter.
- [ ] Item 3 runs the check command below as one plain Bash call and reads its JSON.
- [ ] The Error fallback branch lists the four triggers and the log line with `<reason>`.
- [ ] The Lightweight branch reads "complexity routing (Step 0) chose the lightweight branch, or `explorePack.manifestPath` is null"; `scopeHintCount ≤ 3` is gone.
- [ ] The user doc lists the same triggers; the site copy is byte-equal.
- [ ] The `explore` node description in `skills-meta.ts` reads: `Dispatches dynamic-dimension orchestrator; produces discovery-brief.md with F-DIM-N finding IDs (R24–R28); a script brief check (R72) confirms the fan-out; falls back to inline exploration for ≤3-file scopes, on error, or when the check fails`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (code): Step 1 text:

```text
3. **Brief check (R72):** run
   node "<PLUGIN_ROOT>/scripts/skill/plan-explore.js" --check-brief "<explorePack.outDir>"
   as one plain Bash call. Exit 0: Read the brief at `<explorePack.outDir>/discovery-brief.md`. Non-zero: take `reason` from the JSON and use the Error fallback.

- **Error fallback** — any of: `explorePack.error` is non-null; the orchestrator returned an error; its return has no `Brief file:` line or says `Brief file: none`; the brief check exited non-zero.
  - Append `## <YYYY-MM-DD> — plan-sdlc orchestrator skipped: <reason>` to `.sdlc/learnings/log.md` (reason: the error text, `no brief file`, or the check's `reason`).
  - Use inline exploration below. Plan still produced. <!-- implements R28, R72 -->
```
  User doc, `docs/skills/plan-sdlc.md` (Step 1 routing list and the Fallback path paragraph):

```diff
 **Step 1 — Routing.** Three branches:
 - **≤3 files (lightweight):** orchestrator skipped. Inline exploration as today. No brief.
 - **4+ files AND `explorePack.manifestPath != null`:** dispatch `sdlc:plan-explore-orchestrator` exactly once with `MANIFEST_FILE`, `PROJECT_ROOT`, `USER_PROMPT`, `OPENSPEC_CONTEXT`.
+  After it returns, plan-sdlc runs `plan-explore.js --check-brief <outDir>` (R72): the brief must exist, name at least one dimension, hold one `dim-<name>.md` result file per dimension and at least one `F-<DIM>-<n>` id.
-- **`explorePack.error` non-null:** append a one-line note to `.sdlc/learnings/log.md`, fall back to inline exploration. Plan still produced.
+- **Fallback:** `explorePack.error` non-null, an orchestrator error, no `Brief file:` line (or `Brief file: none`), or a failed brief check: append `## <date> — plan-sdlc orchestrator skipped: <reason>` to `.sdlc/learnings/log.md` and fall back to inline exploration. Plan still produced.
```

```diff
-**Fallback path.** When `plan-explore.js` fails or `sdlc:plan-explore-orchestrator` exits non-zero, plan-sdlc appends a one-line note to `.sdlc/learnings/log.md` and falls back to inline exploration. The plan is still produced — brief absence is not a plan failure.
+**Fallback path.** When `plan-explore.js` fails, `sdlc:plan-explore-orchestrator` returns an error or no brief file, or the R72 brief check fails (`brief-missing`, `no-dimensions`, `missing-dimension-results`, `no-finding-ids`), plan-sdlc appends a one-line note with the reason to `.sdlc/learnings/log.md` and falls back to inline exploration. The plan is still produced — brief absence is not a plan failure.
```
- names: `--check-brief`, `explorePack.outDir`, `subagent_type: sdlc:plan-explore-orchestrator`.
- mirror: the lane dispatch rule at `SKILL.md` Step 3 ("`subagent_type: lane.agent` … Do not pass `model` or `effort`").
- decisions: Key Decision 1; Deviations row 4.
- sync: the reason codes match Task 2; the doc copy must be byte-equal.

### Task 5: ship spec — R106 review round records

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R106 after R105; append an appendix row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only (plan.copyRules companion): change nothing unless a grep for `reviewRounds|finalCheck|ext.summary` finds a stale sentence
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only, same grep
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only, same grep
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only, same grep

**Notes:** Spec first. The planner's grep at HEAD found no summary-field text in these four companions. A new id rather than an amended R78 keeps R78's acceptance cases unchanged. Cites F-ship-round-summary-ext-1 to F-ship-round-summary-ext-5.

**Acceptance criteria:**
- [ ] R106 holds the text below; the appendix row is `| R106 | per-round review records in the summary, #9378 |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; the site copy is byte-equal.

**Contract:**
- shape (openspec): ADD `R106`; numbering continues from `R105`. Delta text:

```text
- R106: Review round records. The Step 6 summary (`ext.summary`, also written to the summary sidecar) carries `reviewRounds`: one record per review that ran, in order, `{ round, final, counts, threshold, receivedReview, fixed, declined, deferred }`. `round` is the ledger round (the final check: the last round + 1). `final` is true only for the R95 final check. `counts` is `{ critical, high, medium, low }` from the review summary that round's gate read (R6), or null when the summary is missing, stale or malformed. `threshold` is `flags.reviewThreshold` (the built-in default when unset). `receivedReview` is true when that round's received-review step is `completed`. `fixed`, `declined` and `deferred` are the non-negative integers of the same names in that round's `dispatch_received_review` result `output.artifacts`, else null (always null when `receivedReview` is false). ship.js builds the record when a round ends (R84, R95: stored as `rounds[k].record`) and when the final check completes (stored as `finalCheck.record`). A last round that did not end that way (gate not met, or commit-fixes skipped) gets its record when the summary is built. With no completed review, `reviewRounds` is `[]`.
  - Acceptance: exec cases whose descriptions start with `ship-summary-rounds:` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`.
```
- names: `R106`, `reviewRounds`, `rounds[k].record`, `finalCheck.record`.
- mirror: R78 at `docs/specs/ship-sdlc.md:239-240`.
- decisions: Decisions taken without the owner, items 2 and 3.
- sync: Tasks 6, 7 and 8 use these field names.

### Task 6: ship.js round records with exec cases

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `reviewRoundRecord`, calls in `afterFixesCommitted` and the final-check completion, `reviewRounds` in `buildSummary`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--walk` and `--received-result <rel>` for the `rounds-*` scenarios
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — add `results/received-review-counts.json`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — cases `ship-summary-rounds: (a)` and `(b)`

**Notes:** Implements R106. Counts must be read in `afterFixesCommitted`, before the next round rewrites the review summary file (F-ship-round-summary-ext-2, F-ship-round-summary-ext-3, F-ship-round-summary-ext-4). The received-review history entry is read only when that round's received-review step is `completed`, so an earlier round's artifacts are never reused (F-ship-round-summary-ext-5). Complex because it changes ship's state machine at three sites and the test driver together. Workspace modes: no new path; the summary file is read through `reviewSummaryPath()` (which uses `resolveStateDir()`, the main worktree, in both `branch` and `worktree` mode), and the ledger and sidecar paths are unchanged.

**Acceptance criteria:**
- [ ] (a) `--scenario rounds-final-check --seed frozen --summary high-1.json --rounds 2 --received-result results/received-review-counts.json --walk`: the cleanup step's `data.summary.reviewRounds` and the last envelope's `ext.summary.reviewRounds` equal the three records rendered below.
- [ ] (b) `--scenario rounds-2-no-fixes --seed frozen --summary high-1.json --rounds 2 --walk`: `reviewRounds` is one record `{round:1, final:false, counts:{critical:0,high:1,medium:0,low:0}, threshold:"high", receivedReview:true, fixed:null, declined:null, deferred:null}`.
- [ ] The existing `ship-rounds`, `ship-final-check` and `ship-summary-commits` cases still pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-summary|ship-final-check|ship-rounds"` passes.

**Contract:**
- shape (code): new function and summary field:

```js
/** R106: one review round record; never throws. */
function reviewRoundRecord(ledger, round, final) {
  // d = reviewGateDecision(ledger); counts = d.parseable ? pick(d.counts, SEVERITIES) : null
  // rr = ledger.steps entry 'received-review'; ran = !final && rr && rr.status === 'completed'
  // h = ran ? lastHistory(ledger, 'dispatch_received_review') : null; a = h && h.data && h.data.artifacts
  // int(k) = Number.isInteger(a && a[k]) && a[k] >= 0 ? a[k] : null
  return { round, final: !!final, counts, threshold: d.threshold, receivedReview: !!ran,
           fixed: ran ? int('fixed') : null, declined: ran ? int('declined') : null, deferred: ran ? int('deferred') : null };
}
```

  Call site 1, `afterFixesCommitted` (the record is built before the steps reset):

```diff
   if (!Array.isArray(ledger.rounds)) ledger.rounds = [];
   ledger.rounds.push({
     round,
     review: { ...entryOf('review') },
     receivedReview: { ...entryOf('received-review') },
     commitFixes: { ...entryOf('commit-fixes'), commitSha: sha || null },
+    record: reviewRoundRecord(ledger, round, false), // R106
   });
```

  Call site 2, the final-check completion in `runAfter`:

```diff
     if (ledger.finalCheck.status === 'pending') {
       ledger.finalCheck.status = 'completed';
       ledger.finalCheck.verdict = (output.artifacts && output.artifacts.verdict) ?? null;
       ledger.finalCheck.open = finalCheckOpen(ledger); // R95
       ledger.finalCheck.threshold = SEVERITIES.includes(ledger.flags.reviewThreshold) ? ledger.flags.reviewThreshold : BUILT_IN_DEFAULTS.reviewThreshold; // R95
+      ledger.finalCheck.record = reviewRoundRecord(ledger, (ledger.round || 1) + 1, true); // R106
       if (flags.auto && ledger.finalCheck.open.length > 0) return finalCheckStop(); // R95: hand off to the caller
```

  Call site 3, `buildSummary`:

```diff
   const summaryFile = review && review.status === 'completed' && fs.existsSync(summaryFileCandidate) ? summaryFileCandidate : null;
+  // R106: closed rounds, then the final check, else a live last round that never reached afterFixesCommitted.
+  const reviewRounds = (ledger.rounds || []).map(r => r.record).filter(Boolean);
+  const liveRound = ledger.round || 1;
+  if (ledger.finalCheck && ledger.finalCheck.record) reviewRounds.push(ledger.finalCheck.record);
+  else if (!ledger.finalCheck && review && review.status === 'completed' && !reviewRounds.some(x => x.round === liveRound)) reviewRounds.push(reviewRoundRecord(ledger, liveRound, false));
   return {
     ...
     finalCheck: ledger.finalCheck || null, // R95
+    reviewRounds, // R106
   };
```

  Expected (a), with `results/received-review-counts.json` = `{"success":true,"output":{"summary":"fixed 2, declined 1","artifacts":{"fixed":2,"declined":1,"deferred":0},"usage":{"inputTokens":10,"outputTokens":5,"model":"haiku"}}}`:

| round | final | counts (c/h/m/l) | threshold | receivedReview | fixed | declined | deferred |
|---|---|---|---|---|---|---|---|
| 1 | false | 0/1/0/0 | high | true | 2 | 1 | 0 |
| 2 | false | 0/1/0/0 | high | true | 2 | 1 | 0 |
| 3 | true | 0/0/0/0 | high | false | null | null | null |

  Stepper: `--received-result <rel>` replaces `results/generic-ok.json` in `reviewRound`'s `after('dispatch_received_review', …)` (default unchanged); `--walk` on a `rounds-*` scenario calls `walk(calls[calls.length - 1].envelope)` after the round loop.
- names: `reviewRoundRecord`, `reviewRounds`, `record`, `--received-result`, `results/received-review-counts.json`.
- mirror: `buildSummary` at `ship.js:1971-2002`; the `walk` call of the `handoff` scenario at `run-ship-stepper.js:812`; result file lines at `setup.sh:187-189`; case style of `ship-summary-commits: (a)`.
- decisions: Key Decision 4; `finalCheck` keeps all its current fields. A pending final check (no `record` yet) adds no entry: its round is already recorded in `rounds[]` by call site 1, because a final check only starts after that round's commit-fixes.
- sync: field names identical to R106 (Task 5) and state-format.md (Task 7).

### Task 7: ship SKILL.md, step agent and state format

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — artifacts mapping in the `dispatch_*` rule
- Modify: `plugins/sdlc-utilities/agents/ship-step-received-review.md` — return item (3)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `rounds` row and `finalCheck.record`

**Notes:** Implements R106; closes F-ship-round-summary-ext-5 and F-ship-round-summary-ext-10. The agent change only asks for the counts received-review already prints in its Step 12 report (Decisions taken without the owner, item 2). Step 6's printed report is not changed (Key Decision 5): the caller reads `ext.summary`.

**Acceptance criteria:**
- [ ] The dispatch rule's artifact keys read: `commit` (sha), `tag`, `prUrl`, `verdict`, and for received-review `fixed`, `declined`, `deferred` (integers) when (3) names them.
- [ ] Agent item (3) reads: "artifacts — commit hash, tag, PR URL, verdict, and the counts of fixed, declined (pushback or won't fix) and deferred items from the skill's report, when it gives them".
- [ ] state-format.md has a `rounds` row naming `{ round, review, receivedReview, commitFixes, record }`, and the finalCheck row names `record` (R106).
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): before → after of the artifacts clause in the `dispatch_*` rule (`skills/ship-sdlc/SKILL.md:273`):

```diff
- (put (3) artifacts into `output.artifacts` with the keys `commit` (sha), `tag`, `prUrl`, `verdict`)
+ (put (3) artifacts into `output.artifacts` with the keys `commit` (sha), `tag`, `prUrl`, `verdict`, and for received-review `fixed`, `declined`, `deferred` as integers when (3) names them (R106))
```

  state-format.md new row: `| rounds | array | One entry per closed review round (R84): { round, review, receivedReview, commitFixes, record }; record is the R106 round record { round, final, counts, threshold, receivedReview, fixed, declined, deferred }. |`; the finalCheck row adds `record` (R106, set when the check completes).
- names: `reviewRounds`, `fixed`, `declined`, `deferred`, `record`.
- mirror: the artifacts clause at `skills/ship-sdlc/SKILL.md:273`; the finalCheck row at `state-format.md:49`.
- decisions: no Step 6 print change (smallest viable cut).
- sync: field names identical to Task 5 and Task 6.

### Task 8: ship user doc — review round records

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — one paragraph in `### Review rounds`
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`)
- Create: `docs/plans/2026-11-13-lean-w17-explore-round-counts.md`

**Notes:** Closes the user-doc part of F-ship-round-summary-ext-10. `site/src/data/skills-meta.ts` needs no ship change (Task 4 owns that file for plan-sdlc): its `report` step description ("Prints results, decisions log, deferred findings, cleanup") does not list summary fields.

**Acceptance criteria:**
- [ ] The paragraph names `reviewRounds`, its fields, and that it survives cleanup in `ext.summary` (R106).
- [ ] The site copy is byte-equal; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `### Review rounds`: append one paragraph after the finalCheck paragraph (audience: users and callers of ship) that describes `reviewRounds` and cites `docs/specs/ship-sdlc.md` R106.
- names: `reviewRounds`.
- mirror: the paragraph at `docs/skills/ship-sdlc.md:259`.
- decisions: user-facing prose only.
- sync: byte copy at `site/src/content-source/skills/ship-sdlc.md`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Script tasks (2, 6) add or update promptfoo exec cases and the stepper; prompt/doc-only tasks need none |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Routing-wording fix is disclosed and justified in Deviations row 4 |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Brief validation and round records are script-driven |
| yagni | warning | PASS | Only the requested checks and fields are added |
| cross-skill-consistency | error | PASS | Received-review return item and state-format are aligned; its own output is unchanged |
| pr-link-github-issue | error | PASS | Commit carries fix(#9382); issue is linked via the commit and PR convention |
| dry | warning | PASS | One reviewRoundRecord helper serves all three call sites |
| kiss | warning | PASS | Simple script check and one helper |
| spec-first | error | PASS | Task 1 precedes Tasks 3 and 4; Task 5 precedes Task 7 |
| project-agnostic | error | PASS | All changes are in plugin code, with no repo-local edits |
| flag-coherence-cross-skill | error | PASS | SKILL.md consumes the script's JSON reason field |
| no-opposite-logical-vectors | error | PASS | Reason codes and trigger list are stated identically across R72, R28, E6 and SKILL.md |
| flag-resolution-single-source | warning | PASS | Single check site in plan-explore.js |
| state-premise | error | PASS | Context states the problem |
| smallest-viable-cut | warning | PASS | Key Decision 5 and per-task justification |
| failure-audience | warning | PASS | Planners and lean ledger owner are named |
| explicit-non-goals | warning | PASS | Non-goals are listed |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | Dispatch passes only subagent_type, with no model, effort or isolation override |
| flag-semantic-consistency-cross-skill | error | PASS | Task 2 Notes: a grep of plugins/*/scripts at HEAD finds no --check-brief; the flag is new and unique |
| workspace-mode-compatibility | error | PASS | Key Decision 6 and Task 2/4/6 Notes: no new paths; review summary via resolveStateDir(); outDir under os.tmpdir() in both modes |
| prompt-cache-hit-ratio | warning | PASS | Only static prompt text is added; no volatile bytes |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 adds the CLI flag `--check-brief` to `plugins/sdlc-utilities/scripts/skill/plan-explore.js`, and Task 6 adds `reviewRounds` to the `ship.js` `buildSummary` output that callers read.

**Severity hint:** high

**Patch:** Check the new `plan-explore.js --check-brief <outDir>` flag (JSON stdout, exit codes 0/1/2) and the new `reviewRounds` field in the ship `ext.summary` and summary sidecar.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new `plan-explore.js --check-brief <outDir>` flag (JSON stdout, exit codes 0/1/2) and the new `reviewRounds` field in the ship `ext.summary` and summary sidecar.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 to Task 8 edit many `.md` files, such as `docs/specs/plan-sdlc.md` and `plugins/sdlc-utilities/agents/plan-explore-orchestrator.md`, which the code-quality triggers do not match, so the script proposes adding `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Task 8 edits `docs/skills/ship-sdlc.md` and its `site/src/content-source/` copy, and Task 1 edits the site spec copies, so no existing dimension reviews docs or site content.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 F-70 (#9376): find the root cause of the skipped plan-explore-orchestrator fan-out with evidence; decide plugin vs harness | Task 1, Task 3 | covered |
| 2 If plugin cause: fix it spec first with a deterministic check (exec case) | Task 1, Task 2, Task 3, Task 4 | covered |
| 3 If harness cause: explicit cheap fallback, keep brief contract; no depth workaround | Task 1, Task 4 | covered |
| 4 #9378: ship summary carries per-round and final-check counts, threshold, received-review data | Task 6, Task 7 | covered |
| 5 #9378 spec first in docs/specs/ship-sdlc.md (new id, never renumber) | Task 5 | covered |
| 6 #9378 exec case in ship-prepare-exec.yaml for a two-round run and final check | Task 6 | covered |
| 7 Project rules: site cp copies, targeted exec runs, files per task, plan file Create in last task, out-of-scope list | Task 1, Task 4, Task 5, Task 8 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all tasks are done:

- The explore orchestrator must fan out on every run. It writes one result file per dimension, and on a failed dispatch it returns `Brief file: none` with the error.
- plan-sdlc runs one script check after the orchestrator. Any skipped fan-out, missing brief or brief without ids sends the run to the inline fallback, and the reason is logged. The routing text matches spec R24.
- Ship's summary carries `reviewRounds`. Each review round and the final check has a record with its round number, severity counts, threshold, whether received-review ran, and received-review's fixed / declined / deferred counts (or null). The record survives the ledger's deletion because it travels in `ext.summary` and the sidecar.
- Specs R72 and R106 describe this, with exec cases for both items.


## OpenSpec Appendix

Not applicable — no OpenSpec change
