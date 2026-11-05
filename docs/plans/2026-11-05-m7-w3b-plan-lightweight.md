# M7 Wave 3b — plan-sdlc Lightweight Path, Selective Re-dispatch, Close-e2e Eval Case, #9259 #9260 #9261 (#9273) Implementation Plan

**Commit:** `feat(#9273): plan-sdlc - lightweight path, selective re-dispatch, eval`
**Goal:**
- The root problem, in three parts:
  - every plan-sdlc run loads the full SKILL.md (738 lines, 10206 words), although a lightweight plan never runs Steps 5–6 and a project without OpenSpec never runs any OpenSpec rule;
  - when a review fix changes the plan materially, Step 5 re-dispatches every lane and every lens, even when the change touched one structure (for example one Contract block);
  - three follow-ups from wave 2: the spec has no E entry for the critique-script stop paths (#9259); a `g17-prepare` failure stops the whole run although G17 is advisory (#9260); `readResult` calls a schema-invalid lane result "invalid JSON" (#9261).
- After this wave:
  - SKILL.md keeps the common path; the OpenSpec rules live in `skills/plan-sdlc/openspec-flow.md` and Steps 5–6 in `skills/plan-sdlc/review-loop.md`, each read only on its branch (W7.5);
  - rule 13 of `check-consistency.js` scans every `skills/**/*.md` file for the fan-out marker, so the marker that moves into `review-loop.md` stays checked (W7.5);
  - `plan.js diff-material` prints `affectedGates` and `affectedLanes` from a fixed trigger map (`--full` forces every lane), and `plan.js merge-lanes --carry <prevIterDir>` copies the results of the lanes and lenses that were not re-dispatched (W7.8);
  - a `g17-prepare` failure marks G17 "not run" with a WARNING line in the Gate B scorecard, and the plan continues (#9260); spec E9 names every critique-script stop path (#9259); a schema-invalid result reads `invalid result shape` (#9261);
  - a `claude plugin eval` case `plugins/sdlc-utilities/evals/plan-sdlc/` exists for the M7 close run. It is written, not run.
- Who fails if this ships wrong: every plan-sdlc run. A wrong move drops a rule or its R anchor. A wrong pointer makes the model skip Steps 5–6 or every OpenSpec rule. A wrong carry contract makes a merged re-dispatch report blocking lane failures that are not real. A wrong `--g17-not-run` flag makes `merge-lanes` exit 1, which stops Step 5.

**Architecture:** Three phases on branch `m7-w3b-9273-plan-lightweight` (base origin/main `306268d`, installed plugin 0.41.0).

1. Direct commit D1 (section `## Direct commits`), before the ship run. It carries only spec text (spec-first, AGENTS.md §1): R31, R64, R67, NEW E9.
2. ONE ship run: `/sdlc:ship-sdlc --plan docs/plans/2026-11-05-m7-w3b-plan-lightweight.md --steps execute,commit --rebase skip --quality balanced --auto`. execute-plan-sdlc runs Tasks 1–8 (the whole plan; no `--tasks`, no `--from-wave`). The commit step makes exactly one commit with the `**Commit:**` subject above. ship reads only that header line; the task blocks carry no `**Commit:**` line of their own.
3. Mirror commit M after the ship run (not a task; `## Executor notes`).

| Commit | Kind | Subject (exact; length) |
|---|---|---|
| D1 | direct, spec (#9259, #9260, W7.8) | `docs(#9273): plan-sdlc - spec selective re-dispatch, G17 degrade, E9` (68) |
| S | ship commit (Tasks 1–8) | `feat(#9273): plan-sdlc - lightweight path, selective re-dispatch, eval` (70) |
| M | direct, after ship (copy-docs mirror; not a task) | `docs(#9273): site - mirror plan-sdlc spec and docs` (50) |

The planner checked every subject with node against `.sdlc/config.json#commit.subjectPattern` (`^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`) and for length: all three match, all are at most 72 characters, none holds `"`, backtick, `$` or `\`. #9273 is a local tracking todo, not a GitHub issue. The PR body says "Tracking: todo #9273 (local, no GitHub issue)" and links no issue. #9259, #9260 and #9261 (follow-ups) close with this PR; the PR body names them in the same local form.

Counts (split escape: about 30 entries or 25 commits, mirror excluded):
- **18 entries / 31 raw paths, mirror excluded; 19 / 32 with this plan file** (the ship commit carries it, as in waves 0–3a). Basis: wave 2 (one entry per fixture directory, mirror `site/src/content-source/*` excluded), ruled in ruling-w3-preflight item 1 and ruling-w3b-preflight.
  - W7.5 (7 entries, 7 raw): `skills/plan-sdlc/SKILL.md`, `skills/plan-sdlc/openspec-flow.md` (new), `skills/plan-sdlc/review-loop.md` (new), `docs/skills/plan-sdlc.md`, `.claude/skills/validate-plugin-consistency/check-consistency.js`, `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml`, fixture dir `orchestrator-await-barrier-cases` (1 new file).
  - W7.8 with #9260 and #9261 (8 entries, 19 raw): `scripts/lib/plan-critique.js`, `scripts/skill/plan.js`, `docs/specs/plan-sdlc.md`, `tests/promptfoo/datasets/plan-prepare-exec.yaml`, fixture dir `plan-diff-material` (2 new files), fixture dir `plan-merge-lanes` (11 new files), `tests/promptfoo/datasets/plan-sdlc.yaml`, `tests/promptfoo/fixtures/plan-sdlc-c2-contract-change.md` (new). `review-loop.md`, SKILL.md and `docs/skills/plan-sdlc.md` are counted under W7.5.
  - Eval case (3 entries, 5 raw): `evals/plan-sdlc/` (3 new files), `evals/_fixture/build-fixture-repo.js`, `tests/promptfoo/README.md`.
  - #9259: spec only (counted). M adds 2 mirror files (`site/src/content-source/specs/plan-sdlc.md`, `site/src/content-source/skills/plan-sdlc.md`).
- 8 tasks; 2 commits for the PR's change (D1, S), 3 with M.
- A Files entry beyond these 18 (19 with the plan file) is a STOP. Past 30 entries during execution is a STOP (brief).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-3b-plan-source.md (W7.5 and W7.8 verbatim, plan section 0, execution conventions, todo texts #9259 #9260 #9261 #9273), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-3b-planner-brief.md (binding readings), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/preflight-w3b.md (anchors at 306268d), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w3-preflight.md (items 5–9), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w3b-preflight.md (items 1–8)

**Verification:**

Every command runs exactly as written, from the worktree root unless it starts with `cd`. PF-ENV: each promptfoo command runs in ONE Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`. `<export>` is a fresh JSON path under that `TMPDIR`. The planner produced the baselines at 306268d with the same commands and env.

- (V1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-merge|^plan-diff|^plan-g17|^orchestrator-await-barrier" -o <export>`: 28 passed, 0 failed (21 passed at 306268d: 5 `plan-diff`, 9 `plan-merge`, 5 `plan-g17`, 2 `orchestrator-await-barrier`; this wave adds 2 `plan-diff`, 4 `plan-merge` and 1 `orchestrator-await-barrier` case and tightens 3 `plan-diff` cases).
- (V2) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-prepare" -o <export>`: 29 passed, 0 failed (29 at 306268d; prepare output is unchanged by this wave).
- (V3) `node .claude/skills/validate-plugin-consistency/check-consistency.js --project-root .` prints `✓ All consistency checks passed.` and exits 0 (same at 306268d).
- (V4) `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js --project-root . --markdown > <scratch>/disc.txt` then `diff <scratch>/disc.txt /workspace/sdlc-marketplace/.sdlc/orchestration/m7/pf-logs/discovery-baseline-306268d.txt` prints nothing: no new PD line (exit 1 at 306268d from the pre-existing PD12 `setup-sdlc` line; ruling-w3b-preflight item 1).
- (V5) `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0 (same at 306268d).
- (V6) `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0 (same at 306268d).
- (V7) `node --check` exits 0 for each of `plugins/sdlc-utilities/scripts/skill/plan.js`, `plugins/sdlc-utilities/scripts/lib/plan-critique.js`, `.claude/skills/validate-plugin-consistency/check-consistency.js`, `plugins/sdlc-utilities/evals/_fixture/build-fixture-repo.js` (one Bash call each).
- (V8) After the ship run: `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file docs/plans/2026-11-05-m7-w3b-plan-lightweight.md --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --root . --markdown` exits 0.
- (V9) Behavioural: the new `contract change` case in `plan-sdlc.yaml` is written, NOT run; the W7.5 single behavioural check (`lightweight scope`) is NOT run (brief: behavioural cases are written or updated, not run; ruling-w3-preflight item 8). The eval case is written, NOT run (SAFE-2; ruling-w3-preflight item 6). Record "not run (brief)" for each in the PR body. No behavioural run, no `claude plugin eval`, no paid run.

---

## Plan readings

These readings bind the executor. Each comes from the brief or a ruling file; none is the planner's invention.

| Id | Reading | Source |
|---|---|---|
| RD1 | Count on the wave-2 basis; 18 entries, no split. Over 30 entries during execution is a STOP. | brief; ruling-w3-preflight item 1 |
| RD2 | Gate on "no new PD line" against `pf-logs/discovery-baseline-306268d.txt`, not on exit 0 (V4). | ruling-w3b-preflight item 1 |
| RD3 | Rule 13 may get a companion-file discovery helper in `check-consistency.js` Surface 2, with one fixture and one exec case; the mutation proof shows the case fails at 306268d (Task 1). | ruling-w3b-preflight item 2 |
| RD4 | The OpenSpec block moves after prepare with a Deviation; a one-line pointer stays where it was; Options 1/2/3 and `openspecInlineGenerate` are set before template resolution; the Test proof greps that no step between the two positions reads them (Task 2). | ruling-w3b-preflight item 3 |
| RD5 | `--carry` contract, R67 spec text first (D1, Task 4). | ruling-w3b-preflight item 4; ruling-w3-preflight item 5 |
| RD6 | `after-contract` → `affectedLanes` `["content-coverage","guardrail-compliance","lens:architecture","lens:risk"]`, `affectedGates` gains G14; `guardrail-compliance` joins the `files` and `contracts` sets (Task 3). | ruling-w3b-preflight item 5; ruling-w3-preflight item 5 |
| RD7 | Eval case: verify prerequisites at write time against the installed `claude plugin eval` help (no run); drop a grader that cannot see `os.tmpdir()` (Task 8). | ruling-w3b-preflight item 6; ruling-w3-preflight item 6 |
| RD8 | #9260 joins: G17 degrades to "not run" with a WARNING in the scorecard; spec R31, R67, E9 first; one exec case (D1, Tasks 4, 6). | ruling-w3b-preflight item 7 |
| RD9 | #9261: reason `invalid result shape`, kept out of the spec; the lens message changes to match; one exec case (Task 5). | ruling-w3b-preflight item 8 |
| RD10 | Next free ids at 306268d: R68, A5, E9, P26, G22, I9, C13 (re-checked with grep). This plan uses only E9. | brief; preflight-w3b §6 |
| RD11 | No behavioural promptfoo run; exec-only targeted runs only, promptfoo 0.123.1. | ruling-w3-preflight item 8; brief |
| RD12 | #9267 is closed by 3a; #9262, #9258, #9264–#9266, #9269–#9272 stay in M9-4. | ruling-w3b-preflight intro; brief |

## Context

**What problem does this change solve?**

- plan-sdlc's SKILL.md is long. The model reads all of it on every run.
- Two large parts are needed only on some runs:
  - the OpenSpec rules (OpenSpec is a spec format some projects use; this repository has none);
  - Steps 5 and 6, the review loop, which lightweight plans skip.
- When a review fix changes the plan in a material way (a "material change": a task added, a Contract edited, and so on), Step 5 re-runs all four lanes and all three lenses. A lane is a critique subagent that checks a fixed set of gates; a lens is a reviewer subagent with a fixed focus. Re-running all seven costs time and money even when one Contract block changed.
- Three small faults remain from wave 2: a missing spec entry, a hard stop on an advisory check, and a misleading failure reason.

**What prompted this change now?**

- M7 wave 3b is the M7 close wave. Its items are W7.5 (the lightweight path), W7.8 (selective re-dispatch), the plan-sdlc close-e2e eval case and three joined follow-ups (#9259, #9260, #9261).
- The item texts were written before waves 1b, 2 and 3a. The pre-flight re-located every quote at 306268d, and the arbiter ruled every open point.

**What does success look like?**

- SKILL.md drops to about 7.1k words. The two moved blocks are byte-identical to their old text, proven by `diff`.
- `check-consistency.js` still flags a fan-out marker without a barrier guard when the marker sits in a companion file.
- `diff-material` names the affected gates and lanes; `merge-lanes --carry` keeps gate coverage complete without re-running unaffected lanes.
- A broken `g17-prepare` no longer stops a plan.
- V1–V8 pass. The eval case exists, ready for the paid close run.

## Research Findings

Exploration was inline (brief PLAN-4: discovery fan-out off). No discovery brief was produced, so no task cites `F-<DIM>-<n>` ids.

- **SKILL.md at 306268d** (738 lines, 10206 words; `grep -c openspec` 48, `grep -ci openspec` 74; no CR characters). The OpenSpec blocks sit at :22–53, :132–134, :136–143, :173–176, :229–234, :245–260, :280–297, :305–308, :458 and :479–494. Steps 5–6 are :500–586 (87 lines; Step 6.5 starts at :588). Each block is followed by one blank line. The pointer anchor `Loaded N plan guardrails.` is on :104. Between :55 and :107 no line reads `openspecInlineGenerate`, `fromOpenspecDirect`, `openspecContext` or `openspecDetect`.
- **A planner simulation** (scratch only) applied the Task 2 cut to a copy of SKILL.md. Result: SKILL.md 542 lines / 7114 words, `grep -c openspec` 11, `grep -ci openspec` 18; `openspec-flow.md` 129 lines; `review-loop.md` 91 lines. All ten OpenSpec blocks and the Steps 5–6 block diff clean. On a `git archive` copy of 306268d with the three simulated files, `check-consistency.js` exits 0 (rule 13 does not see `review-loop.md` yet; that is the gap Task 1 closes), `check-docs-consistency.js` exits 0, and `validate-discovery.js` output is byte-identical to the baseline file.
- **Behavioural datasets** load SKILL.md by `skill_path`. `tests/promptfoo/scripts/extract-skill-content.js:23-33` auto-loads every sibling `.md` of the skill directory as `reference_content`, so the two new files reach every plan-sdlc case with no dataset edit. The `plan-sdlc.yaml` case at :728 asserts the Gate A skip note for a non-OpenSpec plan (R39). The c2 case (:1366) loads `plan-sdlc-c2-material-change.md`; its rubric stays (a task-count change maps to `["*"]`).
- **Rule 13** (`check-consistency.js` :723–770): Surface 2 loops over `discoverSkills` (`<skill>/SKILL.md` only, :117–123). `walkForSuffix` (:131) already walks a tree for a suffix. `hasAwaitBarrierTokens` (:292) accepts `await barrier`, `never consolidate on partial` or `R-orchestrator-await`. Exec cases: `sdlc-script-resolution-exec.yaml` :38 (bad-project) and :56 (good-project).
- **`diffMaterial`** (`plan-critique.js` :110–141) returns `{ material, triggers, details }`. `tasksOf` gives the task count. `EXPECTED_GATES` (G1–G21) and `LENS_NAMES` live in the same module. The fixture `plan-diff-material/before.md` has **3** tasks, so the `<5`-task `lens:all` mapping (RD5) applies to every pair built on it.
- **`mergeLanes`** (:544): `laneNames` adds `guardrail-compliance` under `noGuardrails`; the gate-coverage block runs only `if (lanes.length)`; `g17Findings` reads `<dir>/g17-prepare.json`, and a missing or invalid file is already an advisory `laneFailures` entry. `readResult` (:400–413) returns `invalid JSON` for both a parse error and a shape mismatch. The lens fallback message is `Lens ${name} returned no valid JSON` (:625).
- **`plan.js` subcommand parser** (:341–420): `SUBCOMMAND_FLAGS` rejects any other flag (`unknown flag`, exit 1). `--no-guardrails` is the only value-less flag, special-cased by name at :411.
- **Exec runner:** `extract-skill-content.js` copies every `file://fixtures-fs/...` project root to a fresh `os.tmpdir()` dir per case, so `--carry` may copy files without dirtying a fixture.
- **Eval runner** (Claude Code 2.1.317; `command -v claude` → `/usr/local/bin/claude`, linked 2026-11-03 20:40:54): `claude plugin eval --help` has no dry-run, list or schema mode. `claude plugin validate plugins/sdlc-utilities --json` passes (exit 0) and does not read `evals/`. The bundled grader schema has types `regex` (targets `last_message`, `trace`, `files`, `{source: file, path}`), `tool_order`, `tool_used` (`tool`, `input_match` as a RegExp over the tool input, `min`, `max`), `file_exists` (`path` glob, `exists`), `llm` and `baseline`. The bundled guide says `file_exists` checks "the newline-separated list of file paths created during the run" in the workspace. There is no exit-code grader.
- **New flag names** (`flag-semantic-consistency-cross-skill`): `grep -n -- "--full\|'full'\|--carry\|'carry'\|g17-not-run" plugins/sdlc-utilities/scripts/skill/*.js` at 306268d finds no `--full`, `--carry` or `--g17-not-run` flag in any skill prepare script; `full` appears only as a `--quality` value (`execute.js:54`, `plan.js:190`, `ship.js:61`). The three new flags are `plan.js` subcommand flags (`diff-material`, `merge-lanes`), not prepare flags, so they cannot clash with `--quality full`.
- **Workspace modes** (`workspace-mode-compatibility`): nothing in this wave writes state or reads config. The critique dir and the carried files live under `os.tmpdir()` (P22), and the moved text is read from the plugin directory, so `ship.workspace=branch` and `=worktree` behave the same.
- **Build/test commands:** exec promptfoo configs (V1, V2), `check-consistency.js` (V3), `validate-discovery.js` (V4), `check-docs-consistency.js` (V5), `validate-spec-shape.js` (V6). Baseline V1 at 306268d: 21 passed.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| OpenSpec gate-check order (W7.5) | yes (ruling-w3b-preflight item 3) | the Step 0 block :22–53 moves after the prepare call into `openspec-flow.md` Step 0; a one-line pointer stays at :22 | ruled; no step between :55 and :107 reads the options (Task 2 grep) |
| Order inside `openspec-flow.md` Step 0 (W7.5) | no | contradictory-signal override, then `--from-openspec` handling, then the gate check | `--from-openspec` handling says "after prepare output, before gate check"; the file follows that order |
| OpenSpec pointer gate wording (W7.5) | no | gates on `openspec.present: true` or a non-null `fromOpenspec` instead of "`--spec`/`--from-openspec` was passed" | `flag-coherence-cross-skill` (G14 in Step 3); KD-9 |
| Gate A skip note kept in SKILL.md (W7.5) | no | one line at Gate A's old place emits `Gate A skipped — plan is not OpenSpec-sourced.` | R39 and `plan-sdlc.yaml:728` need the note on non-OpenSpec runs, where the pointer skips `openspec-flow.md` |
| `grep -n openspec` expected set (W7.5 Verification) | no | Task 2 lists the 11 exact lines left | the item's list missed `argument-hint`, the `--from-openspec` prepare line and the Contract type labels (preflight §8 point 7) |
| `plan-sdlc.yaml` OpenSpec cases (W7.5 Verification) | no | no dataset edit | the runner auto-loads sibling `.md` files (Research Findings) |
| W7.5 single behavioural check (`lightweight scope`) | yes (ruling-w3-preflight item 8) | not run | ruled: no behavioural runs |
| `after-contract` expected lanes and G14 (W7.8 Verification) | yes (ruling-w3b-preflight item 5; ruling-w3-preflight item 5) | `["content-coverage","guardrail-compliance","lens:architecture","lens:risk"]`; `affectedGates` includes G14 | ruled; `guardrail-compliance` added to the `files` and `contracts` sets |
| `guardrail-compliance` in the `files` set | yes (ruling-w3-preflight item 5) | `files` → also G14 / `guardrail-compliance` | ruled; a stricter superset; the seven trigger computations are unchanged |
| `after-contract.md` pairs with a new 5-task `before-5.md` | no | Task 3 adds `before-5.md` | the `<5`-task mapping inside `diffMaterial` (RD5) turns every lens into `lens:all` for the 3-task `before.md`; the ruled array needs a plan with 5 tasks |
| `<5`-task mapping tested with `after-reversed.md` | no | the existing `reversed` case gains `affectedLanes: ["lens:all"]` | no extra fixture |
| Lens-only Step 5 merges pass `--carry` | no | `review-loop.md`'s lens merge passes `--carry "<critiqueDir>/iter-<k-1>"` | the first merged re-dispatch follows a lens-only iteration with no lane files; forwarding keeps every iteration dir complete (QUESTION 1 in the done-file) |
| `merge-lanes` prints `carried` | no | NEW output field: the copied file names | the item's check "the carried `static-structural.json` is present in the new dir" cannot be seen from the exec runner otherwise |
| #9260 mechanism | no | NEW value-less `merge-lanes --g17-not-run`, passed on every Step 5 merge after a failed g17-prepare | mirrors `--no-guardrails`; the scorecard is rendered only by Step 5 merges |
| `docs/skills/plan-sdlc.md` :83 updated for W7.8 (Files extension of W7.8) | yes (controller answer to planner QUESTION 2: accept) | one sentence replaced (Task 6), unconditionally | the R64 paragraph would otherwise say "re-dispatches the Step 3 gate lanes (G1–G21)"; the file is already in the wave's Files (W7.5), so the count is unchanged |
| `--full` placement (brief point 2 reads "`merge-lanes --carry` and `--full`") | no | `--full` is a `diff-material` flag; `--carry` is a `merge-lanes` flag | W7.8 change 1 puts `--full` with `affectedLanes: ["*"]` (a `diff-material` output); ruling-w3-preflight item 5 says only "`carry` and `full` in `SUBCOMMAND_FLAGS`" (judge review 1 N4) |
| No carry on a full re-dispatch (judge review 1 F1) | no | the merged re-dispatch passes `--carry` unless `affectedLanes` is `["*"]` | when everything is re-dispatched nothing must be carried; a `taskCount` change across the 5-task line would otherwise carry a lens of the other shape (`lens-all.json` into a 3-lens iteration, or the reverse) |
| `plan-sdlc-c2-material-change.md` (W7.8 Files) | no | not edited | the Verification keeps its rubric |
| Eval critique-dir grader | yes (ruling-w3b-preflight item 6) | dropped | `file_exists` sees only workspace paths created during the run; `os.tmpdir()` is outside the workspace |
| Eval `validate-plan-format.js --final` exit-0 grader (ruling-w3-preflight item 6 grader list: plan file exists, `--final` exits 0, critique dir removed) | yes (ruling-w3b-plan-1, option (a)) | three graders: `file_exists` for the plan file, a plan-file regex requiring exactly one scorecard verdict line, and a `tool_used` Bash grader matching the `validate-plan-format.js` call with `--final` (quote-agnostic `input_match`); plus the manual `--keep-temp` exit-code check at the close run as part of the pass criterion (Task 8) | Claude Code 2.1.317's `claude plugin eval` has no exit-code grader; the M7 exit wording stays, and "passes" means the three graders plus the manual check |
| Eval credential-free check | yes (ruling-w3b-preflight item 6) | none exists; Task 8 logs the help text and `claude plugin validate` output | `claude plugin eval` has no dry-run, list or schema mode |
| Discovery fan-out | yes (brief PLAN-4) | off; inline exploration | brief |
| Critique and lens review | yes (brief) | full critique and lens review on | brief "Binding readings" |
| learnings log not written by the planner | yes (brief: edit only the plan file) | plan-sdlc's Learning Capture and fallback log lines skipped | brief |

## Key Decisions

- **KD-1 — One ship commit, not one per task.**
  - Choice: the plan header carries one `**Commit:**` line, and ship makes one commit for Tasks 1–8.
  - Alternative: a commit per task.
  - Why: ship 0.41.0 reads only the header line (`skill/ship.js:1471`); waves 0–3a used the same shape.
- **KD-2 — Byte-identical move with the Write and Edit tools.**
  - Choice: the worker writes the two new files with Write and removes the blocks from SKILL.md with Edit; `diff` against `git show 306268d:` proves each block.
  - Alternative: a script that slices the file.
  - Why: a shell write of a repo file is a SAFE-12 STOP; the diff catches any copy slip.
- **KD-3 — The trigger map is a constant in `plan-critique.js`.**
  - Choice: `TRIGGER_MAP` next to `diffMaterial`; the model never chooses which lanes run.
  - Alternative: prose in `review-loop.md`.
  - Why: `scripts-over-llm-logic` guardrail; the item's guardrail "the trigger→gate map is fixed".
- **KD-4 — Carry forward through lens-only iterations.**
  - Choice: every Step 5 merge passes `--carry` with the previous iteration dir; the carried lanes and lenses are merged with the re-dispatched ones (the union).
  - Alternative: carry only on the merged re-dispatch.
  - Why: the merged re-dispatch always follows a lens-only iteration, whose dir has no lane files; a missing previous file is a normal missing-result failure (ruled), so without forwarding every merged re-dispatch would report blocking lane failures. The lens-only path reads only `lens` from `merged.json`, so the extra lane merge there changes nothing it uses.
- **KD-5 — `--g17-not-run` is a flag, not a file probe.**
  - Choice: Step 3 notes the failed g17-prepare and Step 5 passes the flag, exactly like `--no-guardrails`.
  - Alternative: `merge-lanes` reads `iter-0/g17-prepare.json` by itself.
  - Why: the Step 5 dir has no g17-prepare file; reading a sibling dir would hide a path rule in the script.
- **KD-6 — The Gate A skip note stays in SKILL.md.**
  - Choice: one line at Gate A's old place.
  - Alternative: drop the note on non-OpenSpec runs.
  - Why: R39 requires one note when `openspecContext` is absent.
- **KD-7 — Smallest viable cut.**
  - The minimum is the four ruled items and nothing else: W7.5, W7.8, the eval case, #9259/#9260/#9261.
  - The site mirror commit M is not extra scope: it is the repository's copy-docs convention for every spec or docs change (waves 0–3a).
  - Each piece beyond the item text is needed for one of them: the companion-file helper (W7.5 keeps rule 13 working, RD3); the Gate A skip line (R39); `before-5.md` (the ruled `after-contract` array, RD6); `carried` and the lens-only `--carry` (W7.8's own check and KD-4); `--g17-not-run` (RD8); the docs :83 sentence (QUESTION 2).

- **KD-8 — Task grouping and fixture counting.**
  - Choice: Task 4 carries both `--carry` and `--g17-not-run`. Task 6 carries both the `review-loop.md` wiring and the SKILL.md Step 3 sentence. A fixture directory counts as one Files entry.
  - Alternative: one task per flag, and one task per file.
  - Why: both flags edit the same `mergeLanes` signature, the same return object and the same `plan.js` flag tables. Two tasks would edit the same lines in sequence and could conflict in one execution wave. In Task 6, the SKILL.md sentence and the `review-loop.md` merge commands state one rule ("pass `--g17-not-run` on every Step 5 merge"), so splitting them would let the two halves drift (`no-opposite-logical-vectors`). Counting fixtures by directory is the ruled wave-2 basis (RD1), so G9's raw-file count exceeds 5 for Task 4 by design.
- **KD-9 — The OpenSpec pointer gates on prepare output only.**
  - Choice: `openspec.present: true` or a non-null `fromOpenspec`.
  - Alternative: the item's wording "`--spec`/`--from-openspec` was passed".
  - Why: `flag-coherence-cross-skill`. `plan.js` resolves `--from-openspec` into `fromOpenspec` and has no `--spec` field. Every `--spec` run in a project with `openspec/config.yaml` already has `openspec.present: true`, and the gate check inside the file still reads `--spec` exactly as before (moved text, unchanged).

## Contract Examples

Code (`plan-critique.js`, Task 3):

```markdown
**Contract:**
- shape (code): `diffMaterial(beforeText, afterText, { full = false } = {})` → `{ material, triggers, details, affectedGates: string[], affectedLanes: string[] }`
- names: `TRIGGER_MAP`, `affectedSets`
- mirror: `diffMaterial` return at `plan-critique.js:140`
- decisions: KD-3; RD6
- sync: spec R67 (D1); `review-loop.md` Dispatch contents (Task 6)
```

Docs (`review-loop.md`, Task 2):

```markdown
**Contract:**
- shape (docs): title, one intro paragraph, then SKILL.md :500–586 verbatim
- names: `# plan-sdlc — review loop (Steps 5–6)`
- mirror: `skills/execute-plan-sdlc/wave-runner-template.md` (a companion file read on one branch)
- decisions: KD-2
- sync: SKILL.md pointer (Task 2); rule 13 (Task 1)
```

Spec (D1):

```markdown
**Contract:**
- shape (spec): ADD E9; MODIFY R31, R64, R67
- names: E9 critique-script failure
- mirror: E7/E8 line form
- decisions: reason strings stay out of the spec (RD9)
- sync: Tasks 3–6
```

## Executor notes (carry-ins)

- Ship lines carry `--auto --rebase skip` (Architecture item 2). This wave does not use ship's `--tasks`/`--from-wave`: the ship run executes the whole plan.
- commit-sdlc's missing trailer is pre-answered: for D1 and M, if `/sdlc:commit-sdlc --auto --subject "<subject>"` stops on a missing required trailer, use the disclosed fallback `git commit -F <message file>` with the same subject and the session's attribution line, and name it in the PR body (W8.43 is not installed).
- The PR body has an `## Evidence` section; every evidence line carries `(at <sha7>)`.
- Mirror commit M (not a ship task): after the ship step, run `node site/scripts/copy-docs.mjs`, keep only `site/src/content-source/specs/plan-sdlc.md` and `site/src/content-source/skills/plan-sdlc.md`, revert every other changed or new path (the copy-docs `plans/` mirror included), and commit M with its subject. Check: `git diff --cached --name-only` lists exactly those two paths.
- The installed plugin is 0.41.0. Tasks use `**Notes:**`, not `**Description:**`.
- SAFE-12: execute workers change repo files only with the Edit and Write tools. A shell in-place edit, or a script that writes a repo file, is a STOP.
- Fixture guard: no fixture `setup.sh` is added or edited; workers never run a fixture `setup.sh` by hand.
- Every quoted text is located by content with `grep -nF` and must occur exactly once (plan section 0 rule 2), else STOP; multi-site edits in one file go bottom-up. A backslash-backtick inside a quoted text is a backtick.
- File scope: every file an item edits is named in a task's Files. Editing any other path (spec included, outside D1) is a STOP.
- SAFE-2: no `claude`, `claude -p` or `claude plugin eval`. `claude plugin eval --help` and `claude plugin validate <path>` start no session and are allowed in Task 8, after the Claude Code pre-check (`command -v claude`, the link time of `/usr/local/bin/claude`, `claude --version`).

## Direct commits (before the ship run)

This commit is NOT a plan task: ship and execute never run it (the plan's `### Task N:` headings are Tasks 1–8 only). The executor makes it alone, with the Edit tool, then `/sdlc:commit-sdlc --auto --subject "<subject>"` with only `docs/specs/plan-sdlc.md` staged.

ID check (run in ONE Bash call before and after D1):

```bash
export LC_ALL=C; b=$(git show 306268d:docs/specs/plan-sdlc.md | grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+|I[0-9]+|C[0-9]+)\b' | sort -u); h=$(grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+|I[0-9]+|C[0-9]+)\b' docs/specs/plan-sdlc.md | sort -u); echo "added=[$(comm -13 <(echo "$b") <(echo "$h") | tr '\n' ' ')] removed=[$(comm -23 <(echo "$b") <(echo "$h") | tr '\n' ' ')]"
```

Expected: before D1 `added=[] removed=[]`; after D1 `added=[- E9 ] removed=[]`. After D1 also: V6 holds; `git status --porcelain` shows only this plan file.

### D1: plan spec — selective re-dispatch, carry, G17 not run, E9 (W7.8, #9259, #9260)

- Subject: `docs(#9273): plan-sdlc - spec selective re-dispatch, G17 degrade, E9`
- File: `docs/specs/plan-sdlc.md` only. Edits (listed top-down; apply bottom-up: 4, 3, 2, 1):

1. **R31** (line starting `- R31 (G17 Dimension Coverage gate, advisory):`), replace the substring `Log the failure to \`.sdlc/learnings/log.md\` for visibility.` (n=1 in the file) with:

   ``Log the failure to `.sdlc/learnings/log.md` for visibility. **Prepare-failure fallback:** a non-zero exit of `plan.js g17-prepare` does not stop plan-sdlc (E9): G17 is not run — the dimension-coverage lane is not dispatched and is left out of `--lanes`, the failure is logged to `.sdlc/learnings/log.md`, and every Step 5 `merge-lanes` call of the run passes `--g17-not-run`, so the Gate B scorecard shows G17 as not run with a WARNING (R67).``

2. **R64** (line starting `- R64 (Gate re-validation on material plan change):`), two substring edits (bottom-up: (b) first):
   - (a) replace `The Step 3 four-lane plus PF gate fan-out (G1-G21, R35) is re-dispatched against the current plan content` with `The Step 3 four-lane plus PF gate fan-out (G1-G21, R35) is re-validated against the current plan content`.
   - (b) replace `The skill decides materiality with \`plan.js diff-material\` (R67) on the plan before and after the IMPROVE pass.` with:

     ``The skill decides materiality with `plan.js diff-material` (R67) on the plan before and after the IMPROVE pass. On a material change the skill re-dispatches the lanes and lenses whose gates the change affects (`diff-material` `affectedLanes`, from the fixed trigger map in R67); results of unaffected lanes carry over from the previous iteration (`merge-lanes --carry`, R67); a task-count change re-runs everything. The PF checks (`validate-plan-format.js`) re-run on every re-dispatch.``

3. **R67**, replace the whole line starting `- R67 (critique scripts):` with the line below, followed by the six indented sub-bullet lines below it (no blank line between them):

   ``- R67 (critique scripts): `plan.js` has three subcommands, dispatched before the prepare flow (no stdin read), each printing one JSON object to stdout; exit 0 on success (the JSON carries the decision), 1 on a usage or validation error, 2 on an unexpected crash. Their logic lives in `scripts/lib/plan-critique.js`. (a) `merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run]` → `{ issues, passes, coverage, laneFailures, guardrailCompliancePayload, g17Findings, lens, scorecard, blockingCount, carried }` (R31, R35, R36, R40). `--carry` (R64): the lanes not re-dispatched are every lane of the lane table plus `dimension-coverage`, minus `--lanes`, and minus `guardrail-compliance` under `--no-guardrails`; the lenses not re-dispatched are the `lens-<name>.json` files in `<prevIterDir>` minus `--lenses`. For each, `merge-lanes` copies `<prevIterDir>/<file>` into `--dir` only when `--dir` has no such file (it never overwrites a file of the current iteration) and lists the copied file names in `carried` (`[]` without `--carry`); it then merges the union of the given and the carried lanes and lenses. A carried lane whose previous file is missing is merged as a missing result (a lane failure; advisory for dimension-coverage); a `<prevIterDir>` that is not a readable directory is a usage error. `--g17-not-run` (R31): the scorecard carries the line `**G17:** not run — g17-prepare failed; no review-dimension suggestions this run (WARNING).` before its verdict, and the verdict is at least the warnings label. (b) `diff-material --before <path> --after <path> [--full]` → `{ material, triggers, details, affectedGates, affectedLanes }`, triggers drawn from `taskCount, files, contracts, dependsOn, keyDecisions, openspec, deviations` (R64). `affectedGates` (gate ids sorted by number) and `affectedLanes` (lane names and `lens:<name>` entries, sorted) are the union of the fired triggers' entries in the fixed map below; `taskCount` or `--full` gives every gate G1–G21 and `affectedLanes: ["*"]`; no fired trigger gives `[]` for both; when the after plan has fewer than 5 tasks every `lens:<name>` entry becomes `lens:all` (deduplicated); `--full` changes neither `material` nor `triggers`; `static-structural` is affected only by `taskCount`. (c) `g17-prepare --plan <path> --dimensions-dir <dir> --instructions-dir <dir> --learnings <path> [--window <days>] [--github-hosting true|false] [--root <dir>] [--today YYYY-MM-DD]` → the G17 candidate set (R31). Acceptance: `tests/promptfoo/datasets/plan-prepare-exec.yaml` cases `plan-merge:`, `plan-diff:` and `plan-g17:`.``

   ``  - Trigger map (`diff-material`, trigger → gates; lanes and lenses): `files` → G4, G6, G9, G10, G13, G14, G17; `content-coverage`, `dimension-coverage`, `guardrail-compliance` (G4 and G10 are re-checked by `validate-plan-format.js`, not a lane).``

   ``  - `contracts` → G14, G18, G19, G20, G21; `content-coverage`, `guardrail-compliance`, `lens:architecture`, `lens:risk`.``

   ``  - `dependsOn` → G3, G5, G8, G12; `content-coverage`, `lens:architecture` (G3 and G12 by `validate-plan-format.js`).``

   ``  - `keyDecisions` → no gate; `lens:architecture`.``

   ``  - `openspec` → G16; `content-coverage`, `lens:requirements`.``

   ``  - `deviations` → G11, G15; `content-coverage`, `lens:risk`.``

4. After the line starting `- E8: `, insert:

   ``- E9: Critique-script failure — a `validate-plan-format.js` exit 2 or a non-zero `plan.js merge-lanes` exit at Step 3 or Step 5 stops plan-sdlc: the skill removes `<critiqueDir>` (P22) and invokes `error-report-sdlc`. A non-zero `plan.js g17-prepare` exit does not stop the run (R31 prepare-failure fallback); a non-zero `plan.js diff-material` exit counts as a material change with `affectedLanes: ["*"]` (R64).``

- Check (one Bash call each): `grep -c 'is re-dispatched against the current plan content' docs/specs/plan-sdlc.md` → `0`; `grep -cE '^- E9: |^  - `(contracts|dependsOn|keyDecisions|openspec|deviations)` → |Prepare-failure fallback|--carry <prevIterDir>|affectedLanes' docs/specs/plan-sdlc.md` → `9` (E9 line, 5 map lines, R31, R67 and R64 lines; the `files` map line starts with `  - Trigger map`, so it is not in this count); `grep -c '^  - Trigger map' docs/specs/plan-sdlc.md` → `1`.

---

## Tasks

The ship run executes Tasks 1–8 in dependency order. Every Test proof follows GATE-9: a wait names the producer-side fact it awaits (the spawned process exits; the provider returns), never a timer.

### Task 1: Rule 13 scans companion skill files (W7.5, rule 13 surface)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — Surface 2 scans every `skills/**/*.md`
- Modify: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — one new case
- Create: `tests/promptfoo/fixtures-fs/orchestrator-await-barrier-cases/companion-project/plugins/sdlc-utilities/skills/example-skill/review-loop.md`

**Notes:** Task 2 moves the fan-out marker from SKILL.md into `review-loop.md`. Without this task, rule 13 would stop checking it: the planner's simulation passed `check-consistency.js` with the marker moved. The helper reuses `walkForSuffix`, so no new walker is added (`dry`).

**Acceptance criteria:**
- [ ] At 306268d the new case fails (mutation proof below); after this task it passes.
- [ ] The two existing `orchestrator-await-barrier` cases still pass.

**Contract:**
- shape (code): new helper and the Surface 2 loop, rendered below. `checkOrchestratorAwaitBarrier` drops its unused `skills` parameter. Its one call in `main` changes from `checkOrchestratorAwaitBarrier(skills, projectRoot, findings);` to `checkOrchestratorAwaitBarrier(projectRoot, findings);`.

```js
// Skill markdown files: plugins/sdlc-utilities/skills/**/*.md (SKILL.md and companion files)
function discoverSkillMarkdown(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/skills');
  return walkForSuffix(dir, '.md', []);
}
```

```diff
-function checkOrchestratorAwaitBarrier(skills, projectRoot, findings) {
+function checkOrchestratorAwaitBarrier(projectRoot, findings) {
 ...
-  // Surface 2 — SKILL files carrying the fan-out-dispatch await-barrier-required marker.
+  // Surface 2 — skill markdown files (SKILL.md or a companion file) carrying the
+  // fan-out-dispatch await-barrier-required marker.
   const MARKER = '<!-- fan-out-dispatch: await-barrier-required -->';
-  for (const skill of skills) {
-    const content = readFile(skill.file);
+  for (const file of discoverSkillMarkdown(projectRoot)) {
+    const content = readFile(file);
     if (!content || !content.includes(MARKER)) continue;
     if (hasAwaitBarrierTokens(content)) continue;
     const lines = content.split('\n');
     const markerIdx = lines.findIndex(l => l.includes(MARKER));
     findings.push({
       rule: 'orchestrator-await-barrier',
       severity: 'error',
-      file: path.relative(process.cwd(), skill.file),
+      file: path.relative(process.cwd(), file),
```

- names: `discoverSkillMarkdown` (placed directly after `discoverPromptTemplates`); rule-doc comment line ` *   2. Any SKILL file carrying the \`<!-- fan-out-dispatch: await-barrier-required -->\`` becomes ` *   2. Any skill markdown file (SKILL.md or a companion file) carrying the \`<!-- fan-out-dispatch: await-barrier-required -->\``.
- mirror: `discoverPromptTemplates` (`walkForSuffix` over the skills dir); cases at `sdlc-script-resolution-exec.yaml:38-63`.
- decisions: RD3; the fixture has no SKILL.md, so at 306268d (which scans SKILL.md only) nothing in it is scanned.
- sync: Task 2 (the marker moves into `review-loop.md`).

New fixture file, exact content (4 lines, trailing newline):

```markdown
# Example companion file

<!-- fan-out-dispatch: await-barrier-required -->
Dispatch every reviewer in one message, then merge the results.
```

New case, appended after the case whose description starts `orchestrator-await-barrier: clean when` (it ends at the line `      value: '"rule": "orchestrator-await-barrier"'` that follows `    - type: not-icontains`), with one blank line before it:

```yaml
- description: "orchestrator-await-barrier: flags a fan-out-marked companion file (skills/**/*.md) missing the barrier guard"
  vars:
    script_path: "repo://.claude/skills/validate-plugin-consistency/check-consistency.js"
    script_args: "--project-root {{project_root}} --json"
    project_root: "file://fixtures-fs/orchestrator-await-barrier-cases/companion-project"
  assert:
    - type: icontains
      value: '"rule": "orchestrator-await-barrier"'
    - type: icontains
      value: 'plugins/sdlc-utilities/skills/example-skill/review-loop.md'
```

**Test proof:** Impact grep: `grep -rn 'checkOrchestratorAwaitBarrier\|discoverSkills(' .claude/skills/validate-plugin-consistency/check-consistency.js` → the definition, the `main` call and `discoverSkills` (306268d); no other file calls them. Targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^orchestrator-await-barrier" -o <export>` (PF-ENV) → 3 passed, once, after the edit. Mutation proof (one Bash call): `git show 306268d:.claude/skills/validate-plugin-consistency/check-consistency.js > <scratch>/cc-306268d.js && node <scratch>/cc-306268d.js --project-root tests/promptfoo/fixtures-fs/orchestrator-await-barrier-cases/companion-project --json | grep -c 'example-skill/review-loop.md'` prints `0` (the case's second assertion fails at the base); the same command with the edited script prints `1`. Environment scrub: PF-ENV for the promptfoo call. Waits: each run returns when `check-consistency.js` exits; no timer.

### Task 2: Move the OpenSpec flow and Steps 5–6 out of SKILL.md (W7.5)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md`
- Create: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md`
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — remove the moved blocks; add the pointers and the Gate A skip line
- Modify: `docs/skills/plan-sdlc.md` — one line naming the two files

**Notes:** A pure cut: no moved line changes, so every R anchor stays with its rule (Must not touch). The Step 0 block moves after prepare (RD4). Before :108 (template resolution) the pointer has set Options 1/2/3 and `openspecInlineGenerate`, and the skeleton rule (:126) reads them only after that. Steps 3, 4, 6.5, 6.6 and 7 stay, and so does Step 6.6's `FINAL_FLAG` logic.

**Contract:**
- shape (docs): three files, built from SKILL.md at 306268d (line numbers below are 306268d's; Task 1 does not touch SKILL.md).
- names: headings and pointer lines as rendered below.
- mirror: `skills/execute-plan-sdlc/wave-runner-template.md` (a companion file in a skill dir).
- decisions: RD4; KD-2; KD-6; Deviations rows "Order inside `openspec-flow.md` Step 0" and "Gate A skip note".
- sync: Task 1 (rule 13 scans `review-loop.md`); Task 6 edits `review-loop.md` after this task.

`openspec-flow.md` (129 lines; a blank line is one empty line; the file ends with a newline after line 129):

| Lines | Content |
|---|---|
| 1 | `# plan-sdlc — OpenSpec flow` |
| 2 | blank |
| 3 | ``Read by SKILL.md Step 0 (the **OpenSpec:** pointer) when prepare output shows `openspec.present: true` or a non-null `fromOpenspec`. Each section holds the OpenSpec rules of one SKILL.md step, moved verbatim; apply each rule at the point of that step it names.`` |
| 4 | blank |
| 5 | `## Step 0 — Mode Detection, Routing, and Setup` |
| 6 | blank |
| 7–9 | SKILL.md :132–134 (`**Contradictory-signal override:**` … `Then continue the flow. If the contradictory phrase is absent, emit nothing.`) |
| 10 | blank |
| 11–18 | SKILL.md :136–143 (``**`--from-openspec` handling (after prepare output, before gate check):**`` … ``If `fromOpenspec` is present but `valid` is false and errors exist: display errors and stop.``) |
| 19 | blank |
| 20–51 | SKILL.md :22–53 (`**OpenSpec integration (opt-in — requires \`--spec\` flag or explicit spec path):**` … step 6 `Store these as \`openspecContext\` …`) |
| 52 | blank |
| 53 | `## Step 1 — Requirements Discovery and Exploration` |
| 54 | blank |
| 55–58 | SKILL.md :173–176 (``**`fromOpenspecDirect` enrichment:**`` and its three bullets) |
| 59 | blank |
| 60–65 | SKILL.md :229–234 (``**OpenSpec enrichment (when `openspecContext` is available):**`` and its five bullets) |
| 66 | blank |
| 67–82 | SKILL.md :245–260 (`**Gate A — Intake Audit:** <!-- implements R39 -->` … step 5) |
| 83 | blank |
| 84 | `## Step 2 — Decompose Into Tasks` |
| 85 | blank |
| 86–103 | SKILL.md :280–297 (``**`fromOpenspecDirect` decomposition:**`` … `**Out-of-scope OpenSpec tasks:**` … `<!-- implements R30 -->`) |
| 104 | blank |
| 105–108 | SKILL.md :305–308 (``**OpenSpec-aware decomposition (when `openspecContext` is available):**`` and its three bullets) |
| 109 | blank |
| 110 | `## Step 4 — Revise Plan and Present for Approval` |
| 111 | blank |
| 112 | SKILL.md :458 (`**G16 (OpenSpec tasks.md coverage) failure resolution:**` …) |
| 113 | blank |
| 114–129 | SKILL.md :479–494 (`**OpenSpec Appendix generation:** Three-way conditional: <!-- implements R59, R63 -->` … ``Each fragment MUST be wrapped with `<!-- openspec-target: <path> -->` annotations …``) |

`review-loop.md` (91 lines; ends with a newline after line 91):

| Lines | Content |
|---|---|
| 1 | `# plan-sdlc — review loop (Steps 5–6)` |
| 2 | blank |
| 3 | `Read by SKILL.md after Step 4 for full-pipeline plans; lightweight plans skip this file. Steps 3, 4, 6.5, 6.6 and 7 stay in SKILL.md, so "the Step 3 dispatch rule" and "the run-time table in Step 3" below refer to SKILL.md.` |
| 4 | blank |
| 5–91 | SKILL.md :500–586 (`## Step 5 (CRITIQUE): Plan Review Loop — Multi-Lens Fan-Out <!-- R36 -->` … `If this is the 3rd iteration, use AskUserQuestion to surface remaining issues instead of looping.`), including the `<!-- fan-out-dispatch: await-barrier-required -->` marker |

SKILL.md edits, applied bottom-up (each old text located with `grep -nF` on its first line, exactly once):

```diff
@@ :500–586 (Steps 5–6; :587 blank and :588 Step 6.5 stay) @@
-## Step 5 (CRITIQUE): Plan Review Loop — Multi-Lens Fan-Out <!-- R36 -->
-… (87 lines through `If this is the 3rd iteration, use AskUserQuestion to surface remaining issues instead of looping.`)
+## Steps 5–6 (CRITIQUE / IMPROVE): Review loop — full pipeline only (R36, R40–R44, R64)
+Full-pipeline plans: Read `./review-loop.md` now and follow it for Steps 5–6. Lightweight plans skip Steps 5–6 and continue at Step 6.5.
@@ :479–495, :458–459, :305–309, :280–298, :229–235, :173–177, :136–144, :132–135: delete each block with its following blank line @@
@@ :245–260 (Gate A block; :261 blank stays) @@
-**Gate A — Intake Audit:** <!-- implements R39 -->
-… (16 lines through step 5)
+**Gate A — Intake Audit (R39):** when `openspecContext` is absent, skip Gate A and emit one note: `Gate A skipped — plan is not OpenSpec-sourced.`
@@ after :104 `Extract \`guardrails\` …` and its blank :105, before :106 `Extract \`critiqueDir\` (P22) …` @@
+**OpenSpec:** when prepare output shows `openspec.present: true` or a non-null `fromOpenspec`, Read `./openspec-flow.md` now and apply each rule at the step it names.
+Otherwise `openspecContext`, `fromOpenspecDirect` and `openspecInlineGenerate` stay unset and every OpenSpec rule is skipped.
+
@@ :22–53 (Step 0 OpenSpec block; :54 blank stays) @@
-**OpenSpec integration (opt-in — requires `--spec` flag or explicit spec path):**
-… (32 lines through step 6)
+**OpenSpec integration:** runs after the prepare call; see the **OpenSpec:** pointer after the guardrail summary below.
```

`docs/skills/plan-sdlc.md`: after the line `| Multiple independent subsystems | Flags the split, suggests one plan per subsystem | Same |` (the last row of the Complexity Routing table) and its blank line, insert one line and one blank line:

``The skill loads two companion files only on the branch that needs them: `openspec-flow.md` (the OpenSpec rules, read when the prepare output shows OpenSpec or a `--from-openspec` change) and `review-loop.md` (Steps 5–6, read for full-pipeline plans).``

After this task, `grep -n openspec plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` lists exactly these 11 lines (new numbering): the `argument-hint` (:5), the `--from-openspec` prepare-call line (:60), the prepare-output display line `--from-openspec:` (:69), the two **OpenSpec:** pointer lines (:75–76), the skeleton condition (:98), the Gate A skip line (:192), the Contract shape template (:244), the Contract block rule (:252), the Contract Examples bullet (:276) and Step 4 case (c) (:385).

**Acceptance criteria:**
- [ ] Both pointers are at most 2 lines; SKILL.md has no Step 5/6 body and no Gate A body (one skip-note line only).
- [ ] Each new file is named exactly once in SKILL.md (`grep -c` below).
- [ ] Every moved block diffs clean against 306268d (Test proof).
- [ ] `wc -w` of SKILL.md: 10206 before, 7114 after; `grep -c openspec`: 48 before, 11 after; `grep -ci openspec`: 74 before, 18 after.
- [ ] V3 and V5 exit 0; V4 shows no new line.

**Test proof:** Impact grep: `grep -rln 'plan-sdlc/SKILL.md\|skills/plan-sdlc/' tests/promptfoo/datasets tests/promptfoo/scripts .claude/skills plugins/sdlc-utilities/scripts` → `plan-sdlc.yaml` (behavioural, `skill_path`; siblings auto-load), `check-consistency.js` and `check-docs-consistency.js` (scans), `plan.js` (template and format-reference paths) (306268d); no exec case reads the moved text. Targeted run: the block diffs below and V3, V4, V5 once each (static checks); the `lightweight scope` behavioural case is NOT run (V9). Byte-identical proof (ONE Bash call; `S=plugins/sdlc-utilities/skills/plan-sdlc`; every `diff` prints nothing and the last line prints `11/11`):

```bash
S=plugins/sdlc-utilities/skills/plan-sdlc; git show 306268d:$S/SKILL.md > <scratch>/SKILL-306268d.md; ok=0; for m in 132,134:7,9 136,143:11,18 22,53:20,51 173,176:55,58 229,234:60,65 245,260:67,82 280,297:86,103 305,308:105,108 458,458:112,112 479,494:114,129; do diff <(sed -n "${m%%:*}p" <scratch>/SKILL-306268d.md) <(sed -n "${m##*:}p" $S/openspec-flow.md) && ok=$((ok+1)); done; diff <(sed -n '500,586p' <scratch>/SKILL-306268d.md) <(tail -n 87 $S/review-loop.md) && ok=$((ok+1)); echo "$ok/11"
```

Ordering grep (RD4; one Bash call): `git show 306268d:plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md | sed -n '55,107p' | grep -c 'openspecInlineGenerate\|fromOpenspecDirect\|openspecContext\|openspecDetect'` prints `0`. No step between the old position (:22) and the pointer (after :104) reads the options. Counts (one Bash call each): `wc -l -w` → SKILL.md `542 7114`, `openspec-flow.md` `129`, `review-loop.md` `91`; `grep -c 'openspec-flow.md\|review-loop.md' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `2`; `grep -c '<!-- fan-out-dispatch: await-barrier-required -->' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` → `1`. Run this task's proof before Task 6 edits `review-loop.md`. After Task 6, `diff <(sed -n '500,586p' <scratch>/SKILL-306268d.md) <(sed -n '5,$p' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md)` shows only Task 6's 5 hunks (`9c9`, `11c11`, `43c43`, `45a46,47`, `83c85`). Mutation proof: a changed character in any moved line makes its `diff` print and the count drop below `11/11`; a marker missing its barrier guard in `review-loop.md` makes V3 fail (Task 1). Environment scrub: none needed (read-only checks). Waits: none.

### Task 3: `diff-material` prints `affectedGates` and `affectedLanes`; `--full` (W7.8 change 1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `TRIGGER_MAP`, `affectedSets`, `diffMaterial` options and return
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `full` flag, value-less flag table, usage header
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 2 new `plan-diff` cases, 3 tightened
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/before-5.md`
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/after-contract.md`

**Notes:** The trigger computations stay untouched because W7.8's Must-not-touch protects R64's `material` semantics. A table of value-less flags is used because a second and third name check beside `--no-guardrails` would be three copies of one rule (`dry`).

**Acceptance criteria:**
- [ ] `after-contract.md` vs `before-5.md` → `triggers` `["contracts"]`, `affectedGates` `["G14","G18","G19","G20","G21"]`, `affectedLanes` `["content-coverage","guardrail-compliance","lens:architecture","lens:risk"]` (no `static-structural`).
- [ ] `after-scope.md` → `affectedLanes` `["*"]` and 21 gates; `after-wording.md` → both `[]`; `after-reversed.md` (3 tasks, `keyDecisions`) → `affectedGates` `[]`, `affectedLanes` `["lens:all"]`.
- [ ] `--full` on a wording-only pair → `material: false`, `triggers: []`, `affectedLanes: ["*"]`, 21 gates.
- [ ] The 5 existing `plan-diff` assertions still hold.

**Contract:**
- shape (code): rendered below.

```js
// R64, R67: fixed trigger → gates and lanes/lenses map (taskCount means everything).
const TRIGGER_MAP = {
  files:        { gates: ['G4', 'G6', 'G9', 'G10', 'G13', 'G14', 'G17'], lanes: ['content-coverage', 'dimension-coverage', 'guardrail-compliance'] },
  contracts:    { gates: ['G14', 'G18', 'G19', 'G20', 'G21'], lanes: ['content-coverage', 'guardrail-compliance', 'lens:architecture', 'lens:risk'] },
  dependsOn:    { gates: ['G3', 'G5', 'G8', 'G12'], lanes: ['content-coverage', 'lens:architecture'] },
  keyDecisions: { gates: [], lanes: ['lens:architecture'] },
  openspec:     { gates: ['G16'], lanes: ['content-coverage', 'lens:requirements'] },
  deviations:   { gates: ['G11', 'G15'], lanes: ['content-coverage', 'lens:risk'] },
};

/** { affectedGates, affectedLanes } for the fired triggers (R67). */
function affectedSets(triggers, afterTaskCount, full) {
  if (full || triggers.includes('taskCount')) return { affectedGates: [...EXPECTED_GATES], affectedLanes: ['*'] };
  const gates = new Set();
  const lanes = new Set();
  for (const t of triggers) {
    for (const g of TRIGGER_MAP[t].gates) gates.add(g);
    for (const l of TRIGGER_MAP[t].lanes) lanes.add(afterTaskCount < 5 && l.startsWith('lens:') ? 'lens:all' : l);
  }
  return {
    affectedGates: [...gates].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
    affectedLanes: [...lanes].sort(),
  };
}
```

```diff
-/** Compare two plan texts: { material, triggers, details }. */
-function diffMaterial(beforeText, afterText) {
+/** Compare two plan texts: { material, triggers, details, affectedGates, affectedLanes }. */
+function diffMaterial(beforeText, afterText, { full = false } = {}) {
 ...
-  return { material: triggers.length > 0, triggers, details };
+  return { material: triggers.length > 0, triggers, details, ...affectedSets(triggers, after.size, full) };
 }
```

`TRIGGER_MAP` and `affectedSets` go directly above `/** Compare two plan texts`. `EXPECTED_GATES` (defined further down in the module) is read only when `affectedSets` runs, so the module order works. `module.exports` gains `TRIGGER_MAP`.

`plan.js`:

```diff
- *   node plan.js diff-material --before <path> --after <path>
+ *   node plan.js diff-material --before <path> --after <path> [--full]
...
-  'diff-material': ['before', 'after'],
+  'diff-material': ['before', 'after', 'full'],
...
+// Value-less flags (`--<name>` → flags key); every other flag takes one value.
+const BOOLEAN_FLAGS = { '--no-guardrails': 'noGuardrails', '--full': 'full' };
+
 function usageError(message) {
...
-  return diffMaterial(before, after);
+  return diffMaterial(before, after, { full: flags.full === true });
...
-/** Parse `--<name> <value>` pairs and `--no-guardrails`, run the handler, map outcomes to exit codes. */
+/** Parse `--<name> <value>` pairs and the value-less flags, run the handler, map outcomes to exit codes. */
...
-    if (arg === '--no-guardrails') { flags.noGuardrails = true; continue; }
+    if (Object.prototype.hasOwnProperty.call(BOOLEAN_FLAGS, arg)) { flags[BOOLEAN_FLAGS[arg]] = true; continue; }
```

The `BOOLEAN_FLAGS` constant goes directly after the `SUBCOMMAND_FLAGS` object (`};`). The `allowed.includes(...)` check before it still rejects a flag that a subcommand does not list, so `--full` on `merge-lanes` stays `unknown flag`.

- names: `TRIGGER_MAP`, `affectedSets`, `BOOLEAN_FLAGS`; output keys `affectedGates`, `affectedLanes`.
- mirror: `diffMaterial` (:110–141); `SUBCOMMAND_FLAGS` (:341–345).
- decisions: KD-3, RD6, RD5 (`<5`-task mapping inside `diffMaterial`); Deviations rows `before-5.md` and `after-reversed.md`.
- sync: spec R67 (D1); `review-loop.md` (Task 6).

Fixtures:
- `before-5.md` = `before.md` byte for byte, then the lines below appended after its last line (`- sync: none` of Task 3). Each `+` marks one appended line; drop the `+` when writing (a lone `+` is an empty line). The file ends with a newline after the last line. The block is rendered as a diff so this plan's own Files parsers do not read the fixture's Files lines.

```diff
+
+---
+
+### Task 4: Add a date-format test helper
+
+**Complexity:** Trivial
+**Risk:** Low
+**Depends on:** Task 1
+**Verify:** tests
+
+**Files:**
+- Create: `tests/utils/date-fixtures.js`
+
+**Acceptance criteria:**
+- [ ] Exports three fixed Date values
+
+**Contract:**
+- shape (code): `module.exports = { epoch, leapDay, endOfYear }` — three `Date` objects
+- names: `epoch`, `leapDay`, `endOfYear`
+- mirror: tests/utils/helper.test.js
+- decisions: none
+- sync: none
+
+---
+
+### Task 5: Add a changelog entry
+
+**Complexity:** Trivial
+**Risk:** Low
+**Depends on:** Task 3
+**Verify:** manual
+
+**Files:**
+- Modify: `CHANGELOG.md` — add the dates endpoint entry
+
+**Acceptance criteria:**
+- [ ] CHANGELOG names `/api/dates/now`
+
+**Contract:**
+- shape (prose): one bullet `- Add GET /api/dates/now` under `## Unreleased`
+- names: none
+- mirror: CHANGELOG.md
+- decisions: none
+- sync: none
```

- `after-contract.md` = `before-5.md` with one line changed (Task 2's Contract shape line; nothing else differs):

```diff
-- shape (code): `router.get('/now', handler)` — handler returns `{ date: string }` via `res.json`
+- shape (code): `router.get('/now', handler)` — handler returns `{ date: string, tz: string }` via `res.json`
```

Exec cases (`plan-prepare-exec.yaml`, in the `# --- diff-material (W7.3 change 3) ---` block):
- Tighten three existing `value:` lines (append inside the JS expression, before the closing `"`):
  - Locate each case by its `- description:` line (n=1) and edit the first `value:` line after it. The value text alone is not unique: the wording and reflow cases share it.
  - case `plan-diff: wording-only edit is not material`: append ` && r.affectedGates.length === 0 && r.affectedLanes.length === 0`;
  - case `plan-diff: added task and changed Files are material`: append ` && JSON.stringify(r.affectedLanes) === JSON.stringify(['*']) && r.affectedGates.length === 21`;
  - case `plan-diff: same Key Decision key with a reversed body is material (changed)`: append ` && r.affectedGates.length === 0 && JSON.stringify(r.affectedLanes) === JSON.stringify(['lens:all'])`.
- Insert two cases before the case `plan-diff: missing --after is a usage error`:

```yaml
- description: "plan-diff: one Contract change affects content-coverage, guardrail-compliance and the architecture and risk lenses"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-diff-material"
    script_args: "diff-material --before {{project_root}}/before-5.md --after {{project_root}}/after-contract.md"
  assert:
    - type: javascript
      value: "const r = JSON.parse(output); r.material === true && JSON.stringify(r.triggers) === JSON.stringify(['contracts']) && JSON.stringify(r.affectedGates) === JSON.stringify(['G14', 'G18', 'G19', 'G20', 'G21']) && JSON.stringify(r.affectedLanes) === JSON.stringify(['content-coverage', 'guardrail-compliance', 'lens:architecture', 'lens:risk']) && !r.affectedLanes.includes('static-structural')"

- description: "plan-diff: --full forces every lane without changing material"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-diff-material"
    script_args: "diff-material --before {{project_root}}/before.md --after {{project_root}}/after-wording.md --full"
  assert:
    - type: javascript
      value: "const r = JSON.parse(output); r.material === false && r.triggers.length === 0 && JSON.stringify(r.affectedLanes) === JSON.stringify(['*']) && r.affectedGates.length === 21"
```

**Test proof:** Impact grep: `grep -rn 'diffMaterial\|diff-material' plugins/sdlc-utilities/scripts tests/promptfoo/datasets tests/promptfoo/scripts .claude/skills` → `plan-critique.js` (definition, export), `plan.js` (import, `runDiffMaterial`, usage, `SUBCOMMANDS`, `SUBCOMMAND_FLAGS`), `plan-prepare-exec.yaml` (5 cases) (306268d); no other caller. Targeted run, in order: (1) write the fixtures and cases, run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-diff" -o <export>` (PF-ENV) once → 2 passed, 5 failed (the 3 tightened and 2 new cases: no `affectedLanes`, and `--full` is `unknown flag`). This is the mutation proof at the base code. (2) Apply the code. (3) Run the same command once → 7 passed. No further re-run: a failure at (3) is a STOP with the export attached. Environment scrub: PF-ENV. Waits: each case returns when `plan.js` exits; no timer.

### Task 4: `merge-lanes --carry` and `--g17-not-run` (W7.8 change 2, #9260)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `mergeLanes` carry and union, `carried` output, scorecard G17 line
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `carry`, `g17-not-run` flags, usage header
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 3 new `plan-merge` cases
- Create: `tests/promptfoo/fixtures-fs/plan-merge-lanes/carry/` — `prev/{static-structural,dimension-coverage,lens-requirements}.json`, `cur/{content-coverage,pf-report,dimension-coverage,lens-architecture,lens-risk}.json`, `lens-only/lens-requirements.json` (9 files)

**Notes:** The carry rules are ruled, not chosen here (RD5). Lens-only merges need them too (KD-4). G17 is advisory (R31), so a G17 that did not run may lower the verdict to the warnings label but must never block the plan. KD-8 explains why both flags share one task.

**Acceptance criteria:**
- [ ] `--dir cur --lanes content-coverage --lenses architecture,risk --no-guardrails --carry prev` → `carried` `["static-structural.json","lens-requirements.json"]` (the existing `cur/dimension-coverage.json` is not overwritten) and `coverage.missing` `[]`.
- [ ] `--dir cur --lenses architecture,risk --carry prev` (no `--lanes`) → `carried` as above and `coverage.covered` includes `G1` (carried lanes are merged).
- [ ] `--dir lens-only --lenses requirements --g17-not-run` → `scorecard.verdict` `…Ready for archive (with noted improvements).` and the markdown holds the G17 line; without the flag the same dir gives `All checks passed. Ready for archive.`
- [ ] A `--carry` dir that does not exist → exit 1 with `cannot read --carry`.
- [ ] The 9 existing `plan-merge` cases still pass (`carried` is `[]` without `--carry`).

**Contract:**
- shape (code): rendered below.

```diff
-function mergeLanes({ dir, lanes = [], lenses = [], noGuardrails = false, gateAPath = null, inventoryPath = null }) {
+function mergeLanes({ dir, lanes = [], lenses = [], noGuardrails = false, gateAPath = null, inventoryPath = null, carryDir = null, g17NotRun = false }) {
   const usage = message => Object.assign(new Error(message), { code: 'USAGE' });
   if (!lanes.length && !lenses.length) throw usage('--lanes or --lenses is required');
   ...
   const gateA = readFlagJson('--gate-a', gateAPath);
+  const carried = [];
+  if (carryDir !== null) {
+    let prevFiles;
+    try {
+      prevFiles = fs.readdirSync(carryDir);
+    } catch (err) {
+      throw usage(`cannot read --carry ${carryDir}: ${err.message}`);
+    }
+    const laneCarry = [...LANE_DEFS.map(d => d.name), 'dimension-coverage']
+      .filter(n => !lanes.includes(n) && !(noGuardrails && n === 'guardrail-compliance'));
+    const lensCarry = prevFiles.map(f => f.match(/^lens-(.+)\.json$/)).filter(Boolean).map(m => m[1])
+      .filter(n => LENS_NAMES.includes(n) && !lenses.includes(n)).sort();
+    for (const file of [...laneCarry.map(n => `${n}.json`), ...lensCarry.map(n => `lens-${n}.json`)]) {
+      if (!prevFiles.includes(file) || fs.existsSync(path.join(dir, file))) continue;
+      fs.copyFileSync(path.join(carryDir, file), path.join(dir, file));
+      carried.push(file);
+    }
+    lanes = [...lanes, ...laneCarry];
+    lenses = [...lenses, ...lensCarry];
+  }
   ...
-    scorecard: lenses.length ? renderScorecard(lensResults, isObject(gateA) && Array.isArray(gateA.findings) ? gateA.findings : [], inventory) : null,
+    scorecard: lenses.length ? renderScorecard(lensResults, isObject(gateA) && Array.isArray(gateA.findings) ? gateA.findings : [], inventory, g17NotRun) : null,
     blockingCount: issues.filter(i => i.blocking === true).length,
+    carried,
   };
```

`lanes` and `lenses` are function parameters (destructured with defaults), so reassigning them is allowed. Every later use (`laneNames`, `if (lanes.length)`, `lenses.map`, `g17Findings: lanes.length ? …`) sees the union.

```diff
-function renderScorecard(lensResults, gateAFindings, inventory) {
+function renderScorecard(lensResults, gateAFindings, inventory, g17NotRun = false) {
 ...
-  const severities = [...allIssues.map(i => i.severity), ...gateAFindings.map(f => f && f.severity)];
+  const severities = [...allIssues.map(i => i.severity), ...gateAFindings.map(f => f && f.severity), ...(g17NotRun ? ['WARNING'] : [])];
 ...
-  lines.push('', `**Verdict:** ${verdict}`);
+  if (g17NotRun) lines.push('', '**G17:** not run — g17-prepare failed; no review-dimension suggestions this run (WARNING).');
+  lines.push('', `**Verdict:** ${verdict}`);
```

`plan.js`:

```diff
- *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>]
+ *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run]
...
-  'merge-lanes': ['dir', 'lanes', 'lenses', 'no-guardrails', 'gate-a', 'inventory'],
+  'merge-lanes': ['dir', 'lanes', 'lenses', 'no-guardrails', 'gate-a', 'inventory', 'carry', 'g17-not-run'],
...
-const BOOLEAN_FLAGS = { '--no-guardrails': 'noGuardrails', '--full': 'full' };
+const BOOLEAN_FLAGS = { '--no-guardrails': 'noGuardrails', '--full': 'full', '--g17-not-run': 'g17NotRun' };
...
     inventoryPath: flags.inventory ?? null,
+    carryDir: flags.carry ?? null,
+    g17NotRun: flags.g17NotRun === true,
   });
```

- names: `carryDir`, `g17NotRun`, `carried`; flags `--carry`, `--g17-not-run`.
- mirror: `noGuardrails` handling in `mergeLanes` (:561); `readFlagJson` usage-error form (:416).
- decisions: RD5, RD8, KD-4, KD-5; Deviations rows `carried` and #9260.
- sync: spec R31, R67 (D1); `review-loop.md` Merge bullet and lens merge (Task 6); SKILL.md Step 3 (Task 6).

Fixture files under `tests/promptfoo/fixtures-fs/plan-merge-lanes/carry/` (each a byte copy where "copy of" is named; otherwise the exact one-line JSON plus a newline):

| File | Content |
|---|---|
| `prev/static-structural.json` | copy of `plan-merge-lanes/static-structural.json` |
| `prev/dimension-coverage.json` | copy of `plan-merge-lanes/dimension-coverage.json` |
| `prev/lens-requirements.json` | copy of `plan-merge-lanes/lens-requirements.json` |
| `cur/content-coverage.json` | `{"gateIds":["G5","G6","G8","G9","G11","G13","G15","G16","G18","G19","G20","G21"],"issues":[],"passes":["G5","G6","G8","G9","G11","G13","G15","G16","G18","G19","G20","G21"],"laneStatus":"ok"}` |
| `cur/pf-report.json` | copy of `plan-merge-lanes/pf-report.json` |
| `cur/dimension-coverage.json` | `{"candidates":[]}` |
| `cur/lens-architecture.json` | copy of `plan-merge-lanes/lens-architecture.json` |
| `cur/lens-risk.json` | copy of `plan-merge-lanes/lens-risk.json` |
| `lens-only/lens-requirements.json` | `{"status":"Approved","issues":[],"recommendations":[],"traceability":[]}` |

Exec cases, inserted before the case `plan-merge: unknown lane name is a usage error`:

```yaml
- description: "plan-merge: --carry copies the results of lanes and lenses not re-dispatched and keeps coverage complete"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-merge-lanes"
    script_args: "merge-lanes --dir {{project_root}}/carry/cur --lanes content-coverage --lenses architecture,risk --no-guardrails --carry {{project_root}}/carry/prev"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        return JSON.stringify(r.carried) === JSON.stringify(['static-structural.json', 'lens-requirements.json']) && r.coverage.missing.length === 0

- description: "plan-merge: --carry without --lanes still merges the carried lane results"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-merge-lanes"
    script_args: "merge-lanes --dir {{project_root}}/carry/cur --lenses architecture,risk --carry {{project_root}}/carry/prev"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        return JSON.stringify(r.carried) === JSON.stringify(['static-structural.json', 'lens-requirements.json']) && r.coverage.covered.includes('G1') && r.lens !== null

- description: "plan-merge: --g17-not-run adds the G17 WARNING line and raises a clean verdict to the warnings label"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-merge-lanes"
    script_args: "merge-lanes --dir {{project_root}}/carry/lens-only --lenses requirements --g17-not-run"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        return r.scorecard.verdict === '…Ready for archive (with noted improvements).' && r.scorecard.markdown.includes('**G17:** not run — g17-prepare failed') && r.lens.status === 'Approved'
```

**Test proof:** Impact grep: `grep -rn 'mergeLanes\|merge-lanes\|renderScorecard' plugins/sdlc-utilities/scripts plugins/sdlc-utilities/skills tests/promptfoo/datasets tests/promptfoo/scripts .claude/skills` → `plan-critique.js`, `plan.js`, SKILL.md (Steps 3, 5; `review-loop.md` after Task 2), `plan-prepare-exec.yaml` (9 cases) (306268d). Only the two scripts change behaviour, and the skill text changes in Task 6. Targeted run, in order: (1) write fixtures and cases, run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-merge" -o <export>` (PF-ENV) once → 9 passed, 3 failed (`--carry` and `--g17-not-run` are `unknown flag`; mutation proof). (2) Apply the code. (3) Same command once → 12 passed. Usage check (one Bash call): `node plugins/sdlc-utilities/scripts/skill/plan.js merge-lanes --dir tests/promptfoo/fixtures-fs/plan-merge-lanes/carry/lens-only --lenses requirements --carry <scratch>/no-such-dir` → exit 1, stderr holds `cannot read --carry` (read-only on the fixture: `readdirSync` fails before any copy). A failure at (3) is a STOP with the export attached. Environment scrub: PF-ENV; the exec runner copies each fixture to a fresh temp dir, so `--carry` writes never reach the repo. Check `git status --porcelain tests/promptfoo/fixtures-fs` → only the new files. Waits: each case returns when `plan.js` exits; no timer.

### Task 5: `readResult` reports `invalid result shape` (#9261)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `readResult` reason; lens fallback message
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 1 new `plan-merge` case
- Create: `tests/promptfoo/fixtures-fs/plan-merge-lanes/bad-shape/` — `static-structural.json`, `lens-all.json`

**Notes:** A parse error keeps `invalid JSON`; only a parsed value that fails its shape check changes. The reason strings stay out of the spec (RD9). The lens message takes the lane form `… failed: <reason>`, so both sources read alike.

**Acceptance criteria:**
- [ ] A lane file `{"issues":[]}` gives the issue message `Lane static-structural failed: invalid result shape — gate IDs G1, G2, G7 not evaluated`.
- [ ] A lens file `{"status":"Approved"}` gives the lens issue message `Lens all failed: invalid result shape`.
- [ ] No existing exec case asserts the old strings (impact grep).

**Contract:**
- shape (code):

```diff
     const value = JSON.parse(text);
-    return valid(value) ? { value } : { reason: 'invalid JSON' };
+    return valid(value) ? { value } : { reason: 'invalid result shape' };
   } catch (_) {
     return { reason: 'invalid JSON' };
...
-      return { name, status: 'Issues Found', recommendations: [], traceability: [], issues: [tag({ taskRef: null, message: `Lens ${name} returned no valid JSON`, severity: 'WARNING', dimension: null, blocking: true })] };
+      return { name, status: 'Issues Found', recommendations: [], traceability: [], issues: [tag({ taskRef: null, message: `Lens ${name} failed: ${r.reason}`, severity: 'WARNING', dimension: null, blocking: true })] };
```

- names: reason `invalid result shape`.
- mirror: `laneFailureIssue` message form (`Lane ${lane} failed: ${reason} — …`).
- decisions: RD9.
- sync: none (not in the spec).

Fixture files `tests/promptfoo/fixtures-fs/plan-merge-lanes/bad-shape/static-structural.json` = `{"issues":[]}` and `.../bad-shape/lens-all.json` = `{"status":"Approved"}` (each one line plus a newline).

Exec case, inserted before the case `plan-merge: unknown lane name is a usage error`:

```yaml
- description: "plan-merge: a parsed result with the wrong shape is reported as invalid result shape"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"
    project_root: "file://fixtures-fs/plan-merge-lanes"
    script_args: "merge-lanes --dir {{project_root}}/bad-shape --lanes static-structural --lenses all --no-guardrails"
  assert:
    - type: javascript
      value: |
        const r = JSON.parse(output);
        return r.issues.some(i => i.message === 'Lane static-structural failed: invalid result shape — gate IDs G1, G2, G7 not evaluated') &&
          r.issues.some(i => i.lane === 'lens:all' && i.message === 'Lens all failed: invalid result shape')
```

**Test proof:** Impact grep: `grep -rn "invalid JSON\|no valid JSON" plugins/sdlc-utilities/scripts/lib/plan-critique.js tests/promptfoo/datasets/plan-prepare-exec.yaml tests/promptfoo/datasets/plan-sdlc.yaml docs/specs/plan-sdlc.md docs/skills/plan-sdlc.md` → only `plan-critique.js` :409, :411, :625 (306268d); no case or doc asserts them. Targeted run, in order: (1) add fixture and case, run `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-merge: a parsed result" -o <export>` (PF-ENV) once → 1 failed (reason `invalid JSON`, lens text `returned no valid JSON`; mutation proof). (2) Apply the code. (3) Same command once → 1 passed. A failure at (3) is a STOP. Environment scrub: PF-ENV. Waits: the case returns when `plan.js` exits; no timer.

### Task 6: `review-loop.md` selective re-dispatch, carry wiring; SKILL.md Step 3 G17 degrade (W7.8 change 2, #9260)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — Dispatch contents, Merge bullet, lens merge command, Step 6 diff-material sentence
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 3 exit-code sentence
- Modify: `docs/skills/plan-sdlc.md` — the R64 paragraph's re-dispatch sentence (a Files extension of W7.8, accepted by the controller; check with `grep -c 'only the lanes and lens reviewers whose gates the change affects' docs/skills/plan-sdlc.md` → `1`)

**Notes:** Spec D1 is committed before the ship run, so these text edits follow it (spec-first). The R19 preservation bullet, the G17 advisory bullet and the once-per-run markers stay byte-identical (item change 4; Must not touch). `--g17-not-run` goes only on Step 5 merges, because only they render the scorecard.

**Acceptance criteria:**
- [ ] The `**Dispatch contents:**` line names `affectedLanes` (`grep -c 'affectedLanes' review-loop.md` → `3`: Dispatch contents, Merge (the F1 `unless` clause), Step 6).
- [ ] The Merge bullet carries only when not everything is re-dispatched (`grep -c 'unless .affectedLanes. is' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` → `1`).
- [ ] Both Step 5 merge commands pass `--carry "<critiqueDir>/iter-<k-1>"`, and both name `--g17-not-run`.
- [ ] SKILL.md Step 3 no longer stops on a g17-prepare failure, and it names E9 for the validator exit 2.
- [ ] V3 and V5 exit 0.

**Contract:**
- shape (docs): before → after for each site, listed top-down; apply bottom-up per file.

`review-loop.md` (each old text located with `grep -nF`, exactly once):

```diff
-- **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>`, then dispatch the Step 3 lanes (same skip rules) and all `lensReviewers[]` (P17, or the single reviewer for <5-task plans) in one message. Each agent uses the dispatch parameters, template variables and model rules of Step 3 (lanes) and Step 5 (lenses).
+- **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>` (the PF checks always re-run), then dispatch in one message the lanes and lenses named in `diff-material`'s `affectedLanes` from Step 6 (same skip rules; `lens:<name>` is that `lensReviewers[]` entry, `lens:all` the single reviewer); when `affectedLanes` is `["*"]` (a `taskCount` change), all Step 3 lanes and all `lensReviewers[]` (P17, or the single reviewer for <5-task plans). Each agent uses the dispatch parameters, template variables and model rules of Step 3 (lanes) and Step 5 (lenses).
```

```diff
-- **Merge:** write each lane's JSON to `<ITER_DIR>/<lane name>.json` and each lens's to `<ITER_DIR>/lens-<lens>.json`, then run `merge-lanes` once with both `--lanes` and `--lenses` on that directory (`--lanes` and `--no-guardrails` exactly as in Step 3, plus `--inventory` and `--gate-a` as in the lens merge below). `issues` in `merged.json` is the unified blocking-issue set (lane, lens and cross-source dedup are done by the script).
+- **Merge:** write each lane's JSON to `<ITER_DIR>/<lane name>.json` and each lens's to `<ITER_DIR>/lens-<lens>.json`, then run `merge-lanes` once on that directory with `--lanes` set to the re-dispatched lanes and `--lenses` to the re-dispatched lenses (either may be `""`), `--no-guardrails` exactly as in Step 3, `--carry "<critiqueDir>/iter-<k-1>"` unless `affectedLanes` is `["*"]` (everything is re-dispatched, so nothing is carried) so the results of the lanes and lenses not re-dispatched carry over (R67), plus `--inventory`, `--gate-a` and `--g17-not-run` as in the lens merge below. `issues` in `merged.json` is the unified blocking-issue set (lane, lens and cross-source dedup are done by the script).
```

Lens merge command and the sentence after it:

````diff
 ```bash
-node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" > "<ITER_DIR>/merged.json"
+node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" --carry "<critiqueDir>/iter-<k-1>" [--no-guardrails] [--g17-not-run] > "<ITER_DIR>/merged.json"
 ```
 
+`--carry` copies the previous iteration's lane results (`iter-0` at the first iteration) into this one, so a later merged re-dispatch can carry them (R67); this merge reads only `lens` from `merged.json`. Pass `--no-guardrails` exactly as in Step 3, and `--g17-not-run` when g17-prepare exited non-zero earlier in this run (R31).
+
 Run it as one plain Bash call; a non-zero exit code in the tool result means stop and invoke `error-report-sdlc`. …
````

Step 6 sentence:

```diff
-Set `materialChangeDetected` to its `material` value; on a non-zero exit set it to `true`. The script fires on …
+Set `materialChangeDetected` to its `material` value and keep its `affectedLanes` for the merged re-dispatch; on a non-zero exit set `materialChangeDetected` to `true` and `affectedLanes` to `["*"]` (E9). The script fires on …
```

(only the first sentence changes; the rest of the line from `The script fires on` is unchanged.)

SKILL.md Step 3 (the line starting `Run each block as one plain Bash call and take its exit code from the tool result.`, n=1):

```diff
-Run each block as one plain Bash call and take its exit code from the tool result. Validator 0 or 1 is normal; validator 2, or any non-zero exit from g17-prepare or merge-lanes, means stop and invoke `error-report-sdlc`.
+Run each block as one plain Bash call and take its exit code from the tool result. Validator 0 or 1 is normal; validator 2 means stop and invoke `error-report-sdlc` (E9). A non-zero exit from g17-prepare does not stop the run (R31): G17 is not run, so do not dispatch `dimension-coverage`, leave it out of `--lanes`, log `## YYYY-MM-DD — plan-sdlc: G17 not run — g17-prepare exited <code>` to `.sdlc/learnings/log.md`, and pass `--g17-not-run` to every Step 5 `merge-lanes` call of this run.
```

`docs/skills/plan-sdlc.md` (the line starting `**Gate re-validation on material change (R64).**`, n=1), one substring:

```diff
-On the next pass through Step 5, a material change re-runs the Step 3 deterministic checks and re-dispatches the Step 3 gate lanes (G1–G21) together with the Step 5 lens reviewers in a single merged message, rather than trusting the earlier gate results to still hold
+On the next pass through Step 5, a material change re-runs the Step 3 deterministic checks and re-dispatches, in a single merged message, only the lanes and lens reviewers whose gates the change affects (`diff-material`'s `affectedLanes`; a task-count change re-runs all of them); `merge-lanes --carry` keeps the previous results of the others, so gate coverage stays complete
```

- names: `affectedLanes`, `--carry`, `--g17-not-run`, E9.
- mirror: the Step 3 `[--no-guardrails]` optional-flag form in the Collect-and-merge command.
- decisions: KD-4, KD-5; RD8.
- sync: spec R31, R64, R67, E9 (D1); Tasks 3–4 (the flags exist).

**Test proof:** Impact grep: `grep -rn 'Dispatch contents\|g17-prepare or merge-lanes\|on a non-zero exit set it to' plugins/sdlc-utilities/skills tests/promptfoo/datasets docs/skills` → `review-loop.md` (after Task 2) and SKILL.md :407 (306268d SKILL.md :407, :508, :582); no dataset asserts these strings. Targeted run: the greps below and V3, V5 once each (static checks). Greps (one Bash call each): `grep -c 'affectedLanes' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` → `3` (Dispatch contents, Merge, Step 6); `grep -c 'unless .affectedLanes. is' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` → `1`; `grep -c 'carry "<critiqueDir>/iter-<k-1>"' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` → `2`; `grep -c 'g17-prepare or merge-lanes' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0`; `grep -c 'g17-not-run' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `1`. Diff check: `diff <(git show 306268d:plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md | sed -n '500,586p') <(sed -n '5,$p' plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md)` prints exactly 5 hunks, `9c9`, `11c11`, `43c43`, `45a46,47`, `83c85`: the four sites above (Dispatch contents, Merge, lens merge command plus the new paragraph, Step 6 sentence; the lens-command site gives two hunks). After Task 6 `review-loop.md` has 93 lines, so `tail -n 87` must not be used here; `G17 on re-dispatch (advisory only)` and `Guardrail-block gate preservation` are unchanged. Mutation proof: at 306268d plus Task 2 only, the `affectedLanes` grep prints `0` and the `g17-prepare or merge-lanes` grep prints `1`. Environment scrub: none needed. Waits: none.

### Task 7: Behavioural "contract change" case and fixture (W7.8 Verification)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Create: `tests/promptfoo/fixtures/plan-sdlc-c2-contract-change.md`
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — one new case; one fixture-index comment line

**Notes:** Written, not run (V9; RD11). The fixture mirrors `plan-sdlc-c2-material-change.md`, so the two cases differ only in the change type. The c2 task-count case keeps its rubric (all lanes and all lenses).

**Acceptance criteria:**
- [ ] The new case's description starts with `plan-sdlc: contract change` (selected by `--filter-pattern "contract change"`).
- [ ] The fixture states the `diff-material` output with `triggers: ["contracts"]` and the ruled `affectedLanes`.
- [ ] The static checks in the Test proof print the stated counts (no YAML parser is installed in the repo, so the case shape is checked by count and grep).

**Contract:**
- shape (docs): fixture sections, in order:
  1. `# Plan Contract Change Re-dispatch (R64)` and a two-sentence purpose paragraph;
  2. `## plan-prepare.js Output (pre-computed)` — the fenced JSON block of `plan-sdlc-c2-material-change.md` copied byte for byte (no guardrails, so `guardrail-compliance` is skipped);
  3. `## Plan under review: "Catalog price-sync" (5 tasks)` — one line: 5 tasks, task count unchanged by Step 6;
  4. `## Step 5 iteration 1 result (before Step 6)` — Status **Issues Found**; the `architecture` lens flagged that Task 3's Contract does not render its error shape; `<critiqueDir>/iter-1/` holds `lens-architecture.json`, `lens-requirements.json`, `lens-risk.json`, and the forwarded `static-structural.json`, `content-coverage.json`, `dimension-coverage.json`;
  5. `## Step 6 IMPROVE — fixes applied` — only Task 3's `**Contract:**` shape line changes (render the before → after diff of one line); no task added or removed; Files and Depends on unchanged;
  6. `## diff-material output` — fenced JSON: `{ "material": true, "triggers": ["contracts"], "details": { "contracts": ["Task 3"] }, "affectedGates": ["G14", "G18", "G19", "G20", "G21"], "affectedLanes": ["content-coverage", "guardrail-compliance", "lens:architecture", "lens:risk"] }`.
- names: case description `plan-sdlc: contract change re-dispatches only the affected lanes and lenses and carries the rest (R64)`.
- mirror: the case at `plan-sdlc.yaml:1366` and its fixture.
- decisions: RD6.
- sync: Task 6 (`review-loop.md` text the rubric checks).

New case, inserted directly after the c2 case (whose description starts `plan-sdlc: Step 6 task-count change sets materialChangeDetected`), with one blank line before it:

```yaml
- description: "plan-sdlc: contract change re-dispatches only the affected lanes and lenses and carries the rest (R64)"
  vars:
    skill_path: "plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md"
    project_context: "file://fixtures/plan-sdlc-c2-contract-change.md"
    user_request: >
      Run /plan-sdlc. Step 5 iteration 1 returned Issues Found. Step 6 IMPROVE just changed one
      Contract line in Task 3 (see context, including the diff-material output). Describe exactly
      how the NEXT Step 5 iteration dispatches its agents and how it merges the results.
  assert:
    - type: icontains
      value: "affectedLanes"
    - type: icontains
      value: "--carry"
    - type: llm-rubric
      value: >
        The response sets `materialChangeDetected` to true from the `contracts` trigger and uses
        `affectedLanes` to choose the agents. In ONE message it dispatches only the content-coverage
        lane and the architecture and risk lens reviewers; it skips guardrail-compliance because no
        guardrails are configured. It does NOT re-dispatch static-structural, dimension-coverage or
        the requirements lens. It runs the Step 3 deterministic checks (validate-plan-format and
        g17-prepare) again in the new iteration directory. It runs merge-lanes once with
        `--carry` naming the previous iteration directory (iter-1), so the results of the lanes and
        lenses it did not re-dispatch are copied in and gate coverage stays complete. The merged
        dispatch counts as one iteration of the review loop.
```

Comment line, inserted after the header line that starts `#   plan-sdlc-c2-material-change       --`:

```yaml
#   plan-sdlc-c2-contract-change       -- CORRECT: one Contract edit; R64 selective re-dispatch of the affectedLanes, the rest carried with merge-lanes --carry
```

**Test proof:** Impact grep: `grep -n 'plan-sdlc-c2-' tests/promptfoo/datasets/plan-sdlc.yaml` → the comment at :25 and the case at :1369 (306268d). Targeted run: NOT run (V9); no behavioural invocation of any kind. Static checks (one Bash call each): `grep -c '^- description: ' tests/promptfoo/datasets/plan-sdlc.yaml` → `68` (67 at 306268d); `grep -c 'plan-sdlc-c2-contract-change' tests/promptfoo/datasets/plan-sdlc.yaml` → `2` (comment and case); `grep -c $'\t' tests/promptfoo/datasets/plan-sdlc.yaml` → `0` (no tab indentation). Mutation proof: at 306268d the first count is 67 and the second grep prints `0`. Environment scrub: none needed. Waits: none.

### Task 8: plan-sdlc close-e2e eval case, fixture kind, README row (eval case)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** build

**Files:**
- Create: `plugins/sdlc-utilities/evals/plan-sdlc/case.yaml`
- Create: `plugins/sdlc-utilities/evals/plan-sdlc/prompt.md`
- Create: `plugins/sdlc-utilities/evals/plan-sdlc/scaffold.sh`
- Modify: `plugins/sdlc-utilities/evals/_fixture/build-fixture-repo.js` — new kind `plan`
- Modify: `tests/promptfoo/README.md` — one row in the eval case table

**Notes:** Written, NOT run (SAFE-2; ruling-w3-preflight item 6: one paid run at the M7 close). Each prerequisite was checked at plan time against the installed runner (Research Findings); the worker re-checks them read-only and logs the outputs. The request names five files, so Step 0 routes to the full pipeline and Step 6.6 runs with `--final`. The prompt names the output path (R3 user-specified path) and the Step 7 menu answer, so no human choice is needed.

**Acceptance criteria:**
- [ ] The case layout matches the seven existing cases (`schema_version: "1.1"`, `context.scaffold_script`, graders; `prompt.md` frontmatter; a 3-line `scaffold.sh` body).
- [ ] `node plugins/sdlc-utilities/evals/_fixture/build-fixture-repo.js plan` in an empty scratch dir (outside every work tree) exits 0 and prints `fixture plan: branch eval-plan, 4 tracked files, <n> lines`.
- [ ] The prerequisite log (Test proof) is in the PR body.

**Contract:**
- shape (docs/code): rendered below.

`case.yaml`:

```yaml
schema_version: "1.1"
name: plan-sdlc
context:
  scaffold_script: scaffold.sh
graders:
  - name: plan-file-written
    type: file_exists
    path: docs/plans/eval-plan-sdlc.md
  - name: format-gate-ran-final
    type: tool_used
    tool: Bash
    input_match: 'FINAL_FLAG=[\\"'']*--final[\s\S]*validate-plan-format\.js|validate-plan-format\.js[^\n]*--final'
  - name: scorecard-verdict-in-plan
    type: regex
    target:
      source: file
      path: docs/plans/eval-plan-sdlc.md
    pattern: '\*\*Verdict:\*\* '
    match: "count:1"
```

The `input_match` is a RegExp that the installed runner (2.1.317) tests against one Bash call's input text. It matches only a call that runs `validate-plan-format.js` with `--final`. Two forms count: the Step 6.6 block with `FINAL_FLAG` set to `--final` (any quoting: `"--final"`, `'--final'`, bare or JSON-escaped) before the `validate-plan-format.js` line, or `--final` on the `validate-plan-format.js` line itself. The block with `FINAL_FLAG=""` and a `--json` validator call do not match (planner check with node: `dq`, `sq`, `bare`, `esc`, `inline` true; `empty`, `json-only` false). The verdict regex has no `flags` and no anchor, because the schema evidence shows no `flags` use in any existing case.

**Close-run pass criterion (ruling-w3b-plan-1 item 2; this text is for the M7 close e2e, not for this wave).** The case passes only when all three graders pass AND the manual exit-code check passes. `claude plugin eval --help` (2.1.317) lists `--keep-temp` ("Preserve scaffold dirs for debugging"), so the close run passes `--keep-temp`. The operator then runs, once and without credentials, `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --final --file <kept workspace>/docs/plans/eval-plan-sdlc.md`, and logs the command and its exit code in the close e2e record. A non-zero exit means the case FAILED: report a STOP with the log and never re-run. If the close-run help no longer lists a keep option, record "exit-code check not available"; the case then stands on the three graders alone. The case is written, not run, in 3b (ruling-w3b-plan-1 item 4).

`prompt.md`:

```markdown
---
description: plan-sdlc --auto writes a full-pipeline plan that passes the --final format gate
tags: [smoke]
max_turns: 120
timeout_seconds: 2400
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

/sdlc:plan-sdlc --auto --quality full Add a notes/ folder with four files (notes/alpha.md, notes/beta.md, notes/gamma.md, notes/delta.md), each holding one heading line, and list the four files in README.md under a new "## Notes" heading. Write the plan to docs/plans/eval-plan-sdlc.md. At the Workflow Continuation menu, select done.
```

`scaffold.sh` (after Write, `chmod 755 plugins/sdlc-utilities/evals/plan-sdlc/scaffold.sh`, a mode change, not a content edit; after staging, `git ls-files -s plugins/sdlc-utilities/evals/plan-sdlc/scaffold.sh` shows `100755`, like the other cases):

```bash
#!/usr/bin/env bash
# Builds the plan-sdlc fixture repo in the empty eval workspace.
set -euo pipefail
builder="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/_fixture/build-fixture-repo.js"
exec node "$builder" plan
```

`build-fixture-repo.js`:

```diff
- * Usage: node build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean>
+ * Usage: node build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean|plan>
...
-const USAGE = 'usage: build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean>';
+const USAGE = 'usage: build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean|plan>';
...
+// plan-sdlc writes its plan under plansDirectory when the prompt names no path (R3).
+const CLAUDE_SETTINGS = [
+  '{',
+  '  "plansDirectory": "docs/plans"',
+  '}',
+  '',
+].join('\n');
+
 const BASE_FILES = {
...
+  plan: {
+    branch: 'eval-plan',
+    files: { ...BASE_FILES, '.sdlc/review-dimensions/docs-clarity.md': DIMENSION, '.claude/settings.json': CLAUDE_SETTINGS },
+    staged: false,
+  },
 };
```

`CLAUDE_SETTINGS` goes directly above `const BASE_FILES`; the `plan` entry goes after the `'ship-clean'` entry in `FIXTURES`. The setting is fixture content inside a scratch repo. It is not a settings edit of this repository (SAFE-8).

README row (`tests/promptfoo/README.md`), appended as the last row of the table whose header is `| Case | Skill run | \`--allow-tools\` | Graded files |`:

```markdown
| `plan-sdlc` | `plan-sdlc --auto` on a five-file request (menu answer `done`) | `Bash Write Edit` | `docs/plans/eval-plan-sdlc.md` written; `--final` format-gate call; one scorecard verdict line |
```

- names: case `plan-sdlc`; kind `plan`; branch `eval-plan`; plan path `docs/plans/eval-plan-sdlc.md`.
- mirror: `evals/execute-two-task/` (case, prompt, scaffold); the `execute` kind in `FIXTURES`.
- decisions: RD7; Deviations rows "critique-dir grader", "`--final` exit-0 grader", "credential-free check".
- sync: Task 6 (plan-sdlc text the run will follow); the README table.

**Test proof:** Impact grep: `grep -rn 'build-fixture-repo' plugins/sdlc-utilities/evals tests/promptfoo .github 2>/dev/null` → the seven `scaffold.sh` files and the README (306268d). Adding a kind changes no existing kind. Prerequisite log, read-only, logged verbatim into the PR body (one Bash call each, after the Claude Code pre-check): `claude plugin eval --help` (shows no dry-run/list/schema option: no credential-free eval check exists); `claude plugin validate plugins/sdlc-utilities --json` → `"success": true`, exit 0 (it does not read `evals/`). Build check (one Bash call): `d=<scratch>/eval-plan-fixture && mkdir -p "$d" && cd "$d" && node <worktree>/plugins/sdlc-utilities/evals/_fixture/build-fixture-repo.js plan && git -C "$d" log --oneline | wc -l && test -f "$d/.claude/settings.json"` → exit 0, `1` commit. The scratch dir must not be inside a git work tree; the builder runs `git init` there by design. Mutation proof: at 306268d `node build-fixture-repo.js plan` exits 2 with the usage line. Environment scrub: run the build check with `GIT_CONFIG_NOSYSTEM=1` and the scratch `HOME` unchanged (the builder sets user.name/email locally). Waits: the builder returns when its last `git` call exits; no timer. Not run: the case itself (V9).

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks carry exec cases or fixtures; changed assertions are tightened; behavioural case written, not run |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Exec-only targeted runs; behavioural and eval runs are explicitly not run; no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created; only companion .md files |
| no-scope-creep | warning | PASS | Every extra piece is justified in KD-7 and the Deviations table |
| single-responsibility-tasks | warning | PASS (justified) | Task 4 (`--carry` + `--g17-not-run`) and Task 6 (`review-loop.md` wiring + SKILL.md G17 sentence) share lines or state one rule; grouping justified in KD-8 |
| scripts-over-llm-logic | error | PASS | Trigger map, carry and G17 flag are script-driven (KD-3) |
| yagni | warning | PASS | Additions are tied to named requirements in KD-7 |
| cross-skill-consistency | error | PASS | Non-goals confirm no other skill changes; flag names were grepped across the skill prepare scripts |
| pr-link-github-issue | error | PASS | #9273 and #9259–#9261 are local todos; the PR body names them in local form and links no GitHub issue |
| dry | warning | PASS | Task 1 reuses `walkForSuffix`; `BOOLEAN_FLAGS` is shared |
| kiss | warning | PASS | A pure move plus a constant trigger map |
| spec-first | error | PASS | D1 updates the spec before the ship run; the SKILL.md edits follow it |
| project-agnostic | error | PASS | Changes ship in plugin code; `check-consistency.js` is repo tooling for validation only |
| flag-coherence-cross-skill | error | PASS (fixed) | The OpenSpec pointer now gates on prepare output (`openspec.present`, `fromOpenspec`), not on the raw `--spec` flag (KD-9) |
| no-opposite-logical-vectors | error | PASS | G17-not-run and `affectedLanes` gates are phrased consistently |
| flag-resolution-single-source | warning | PASS | Each new flag is resolved once in `plan.js` and consumed by name |
| state-premise | error | PASS | The root problem is stated in Goal and Context |
| smallest-viable-cut | warning | PASS | KD-7 names the minimum and justifies each extra piece |
| failure-audience | warning | PASS | Goal names who fails if this ships wrong |
| explicit-non-goals | warning | PASS | A Non-goals section is present |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in Key Decisions, readings and Deviations |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is changed |
| agent-dispatch-script-driven | error | PASS | The re-dispatched lanes come from the script's `affectedLanes`; no dispatch parameter is added |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence in Research Findings; the new flags are `plan.js` subcommand flags |
| workspace-mode-compatibility | error | PASS | Both modes addressed in Research Findings; no state writes or config reads |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced into dispatched prompts |

## Suggested Review Dimensions

### UPDATE: code-quality (B1)

**Why:** Task 3 adds `diff-material --full` and Task 4 adds `merge-lanes --carry <prevIterDir>` and `--g17-not-run`, both in `plugins/sdlc-utilities/scripts/skill/plan.js`; Task 8 adds a `plan` kind to `build-fixture-repo.js`.

**Severity hint:** high

**Patch:** Check that the new `plan.js` flags `--full`, `--carry` and `--g17-not-run` go through the BOOLEAN_FLAGS and SUBCOMMAND_FLAGS tables and are rejected on subcommands that do not list them, and that the new `build-fixture-repo.js` kind `plan` is in both the USAGE string and FIXTURES.

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — Check that the new `plan.js` flags `--full`, `--carry` and `--g17-not-run` go through the BOOLEAN_FLAGS and SUBCOMMAND_FLAGS tables and are rejected on subcommands that do not list them, and that the new `build-fixture-repo.js` kind `plan` is in both the USAGE string and FIXTURES.

### UPDATE: docs-skill-sync (B1)

**Why:** Task 6 edits `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` Step 3 to say a non-zero `g17-prepare` exit no longer stops the run and to pass `--g17-not-run`, and it rewrites the R64 sentence in `docs/skills/plan-sdlc.md`.

**Severity hint:** high

**Patch:** Check that `docs/skills/plan-sdlc.md` and SKILL.md document `--carry`, `--g17-not-run`, `affectedLanes` and the G17 not-run fallback, and that the new flag names are consistent in both.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that `docs/skills/plan-sdlc.md` and SKILL.md document `--carry`, `--g17-not-run`, `affectedLanes` and the G17 not-run fallback, and that the new flag names are consistent in both.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: spec-compliance (B1)

**Why:** Task 6 changes the plan-sdlc contract for the `g17-prepare` failure path, citing R31 and E9 in SKILL.md, and wires the new flags `--carry` and `--g17-not-run` into `review-loop.md` per R67.

**Severity hint:** high

**Patch:** Check that SKILL.md and `review-loop.md` cite R31, R64, R67 and E9 for the new flags and the G17 degrade, and match the D1 spec text exactly.

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — Check that SKILL.md and `review-loop.md` cite R31, R64, R67 and E9 for the new flags and the G17 degrade, and match the D1 spec text exactly.

_4 additional candidates suppressed_

## Final Shape

- `plugins/sdlc-utilities/skills/plan-sdlc/` holds SKILL.md (542 lines, about 7.1k words), `openspec-flow.md` (129 lines), `review-loop.md` (91 lines plus Task 6's edits), and the three existing companion files.
- A run without OpenSpec reads no OpenSpec rule, apart from one Gate A skip note. A lightweight run reads no Step 5 or Step 6 text.
- `check-consistency.js` rule 13 checks the fan-out marker in any `skills/**/*.md` file.
- `plan.js diff-material` prints `affectedGates` and `affectedLanes` (and accepts `--full`). `plan.js merge-lanes` accepts `--carry <prevIterDir>` and `--g17-not-run` and prints `carried`. A schema-invalid result reads `invalid result shape`.
- The spec has E9 and the new R31, R64 and R67 text. The user doc names the two companion files and describes selective re-dispatch.
- `plugins/sdlc-utilities/evals/plan-sdlc/` is ready for the paid M7 close run; the README lists it.
- V1 shows 28 targeted exec cases passing.

## Must not touch

Byte-identical through the whole wave (each item's Must-not-touch list, stated once):
- W7.5: the moved text (copied byte for byte, no rewording); every R anchor; Step 6.6's `FINAL_FLAG` logic (PF9 still keys on the Step 0 branch).
- W7.8: R64's `material` boolean semantics; the seven trigger computations in `diffMaterial`; the once-per-run markers `guardrailsEvaluated` and `critiqueRan`; the R19 guardrail-block preservation bullet and the "G17 on re-dispatch (advisory only)" bullet in `review-loop.md`.
- D1: every line of `docs/specs/plan-sdlc.md` except the R31, R64 and R67 lines and the E9 insert (I5 included).
- `tests/promptfoo/fixtures/plan-sdlc-c2-material-change.md`; every ship, execute, commit, pr, review and version file.

## Non-goals

- No change to ship, execute, commit, pr, review or version (brief).
- W7.4 is not redone (merged in 3a); #9267 is closed by 3a.
- #9262, #9258, #9264–#9266 and #9269–#9272 stay in M9-4. #9262 touches the seven trigger computations, which W7.8 must not touch.
- No milestone-level close: the close e2e run itself and both full exec configs belong to the M7 close.
- No rewording of moved text, and no new R id (RD10: only E9 is added).
- No behavioural run and no `claude plugin eval` run (RD11, SAFE-2).
- Steps 3, 4, 6.5, 6.6 and 7 stay in SKILL.md; no other skill gets companion files.

## Follow-ups

- A carried lens or lane keeps the issues it reported in the previous iteration, even when a non-material fix already resolved them. That can cost one extra review iteration. Proposal: carry only results whose status is clean, or re-run any carried result that had blocking issues (done-file FOLLOWUPS 1). A sharper case (judge review 1 N1): through the lens-only iterations, every merged re-dispatch carries the Step 3 (`iter-0`) lane results, which predate the Step 4 fixes. So already-fixed blocking lane issues re-enter `merged.json` `issues` on every merged re-dispatch, not only after a non-material fix. No script blocks wrongly, but Step 6 sees stale issues. Raised as a ruling question for the arbiter or the M9-4 queue.
- After a g17-prepare failure, `dimension-coverage` is still in the `--carry` set (R67 as ruled), so each Step 5 merge adds one advisory "no result file" `laneFailures` entry for a lane that was deliberately not run. Nothing blocks, because the entry is advisory. Proposal: leave `dimension-coverage` out of the carry set under `--g17-not-run` (Step 5 architecture lens; done-file FOLLOWUPS 2).

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 2 | 1 |
| Correctness | 0 | 2 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 W7.5 verbatim move of OpenSpec blocks and Steps 5-6, pointers, Step 0 deviation and grep proof | Task 2 | covered |
| 2 W7.5 rule 13 companion-file marker surface, fixture, exec case, mutation proof | Task 1 | covered |
| 3 W7.5 docs/skills/plan-sdlc.md line naming two new files | Task 2 | covered |
| 4 W7.8 diff-material affectedGates/affectedLanes, --full, trigger map | Task 3 | covered |
| 5 W7.8 merge-lanes --carry and flag tables | Task 4 | covered |
| 6 W7.8 review-loop.md Dispatch contents and merge wiring | Task 6 | covered |
| 7 W7.8 spec R64/R67 first, exec cases, behavioural contract-change case | D1, Task 3, Task 4, Task 7 | covered |
| 8 Eval case files, graders, README row, prerequisites verified | Task 8 | covered |
| 9 #9259 spec E9 | D1 | covered |
| 10 #9260 g17-prepare failure degrades G17 | D1, Task 4, Task 6 | covered |
| 11 #9261 invalid result shape | Task 5 | covered |
| 12 Constraints (one plan/PR, direct commits, count basis, exec-only runs, GATE-9, Notes/Test proof, Commit line) | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
