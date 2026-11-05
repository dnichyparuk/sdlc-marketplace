# M7 Wave 2 — plan-sdlc Deterministic Critique Work Into Scripts: Merge, Material Diff, G17 Prep, PF12/PF13, Four Lanes, Lens JSON (#9257) Implementation Plan

**Commit:** `feat(#9257): plan-sdlc - lane merge, material diff, G17 prep in scripts`
**Goal:**
- The root problem: plan-sdlc asks the Opus author to do work a script does better. Today the model:
  - merges five lane results by hand (union, gate coverage, lane failures, dedup);
  - snapshots seven plan values before and after every fix to decide whether a change is "material";
  - lets a sonnet subagent re-implement glob matching, ranking and capping for G17 (dimension coverage);
  - counts lens findings and picks the scorecard verdict from prose tags;
  - runs a whole haiku lane (file-existence) for two mechanical checks (G4, G10), and the guardrail lane even when no guardrail is configured.
- After this wave, scripts do that work and the model keeps only the judgment:
  - `validate-plan-format.js` owns G3/G12 (PF4, now with per-task `details`), G4 (NEW PF12) and G10 (NEW PF13, under `--root`);
  - `plan.js` gets three subcommands, `merge-lanes`, `diff-material` and `g17-prepare`, with the logic in NEW `scripts/lib/plan-critique.js`;
  - the prepare output has four lanes, a `critiqueDir` (P22) and the project's `commit` config (P23);
  - lens reviewers return one JSON block, and `merge-lanes` builds the scorecard and the G17 section.
- Joined follow-ups (ruling item 4): #9244 (one `**Commit:**` header rule set in `lib/plan-parse.js` for PF11 and ship), #9245 (P23), #9249 and #9250 (two SKILL.md text contradictions), #9255 (spec R56(a)).
- Who fails if this ships wrong: every plan-sdlc full run. A wrong merge drops a blocking issue or blocks a valid plan; a wrong material diff skips a needed re-validation; a wrong PF12 blocks plans mid-authoring (the post-tool hook runs the default check set on every plan write); a wrong ship reader stops every ship run that carries a `**Commit:**` line.

**Architecture:** Three phases on branch `m7-w2-9257-plan-scripts`.

1. Direct commits D1–D2 (section `## Direct commits`), in order, before the ship run. They carry only spec text (spec-first, AGENTS.md §1).
2. ONE ship run: `/sdlc:ship-sdlc --plan docs/plans/2026-11-05-m7-w2-plan-scripts.md --steps execute,commit --rebase skip --quality balanced --auto`. execute-plan-sdlc runs Tasks 1–11; the commit step makes exactly one commit with the `**Commit:**` subject above (71 characters).
3. Mirror commit M after the ship run (not a task; `## Executor notes`).

| Commit | Kind | Subject (exact; length) |
|---|---|---|
| D1 | direct, spec (W7.3) | `docs(#9257): plan-sdlc - spec four lanes, PF12/PF13, critique scripts` (69) |
| D2 | direct, spec (follow-ups #9245, #9255) | `docs(#9257): plan-sdlc - spec commit config field, explore await clause` (71) |
| S | ship commit (Tasks 1–11) | `feat(#9257): plan-sdlc - lane merge, material diff, G17 prep in scripts` (71) |
| M | direct, after ship (copy-docs mirror; not a task) | `docs(#9257): site - mirror plan-sdlc spec and docs page` (55) |

Every subject was checked with node against `.sdlc/config.json#commit.subjectPattern` (`^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`) and for length before this plan was written: all four match, all are at most 72 characters, none holds `"`, backtick, `$` or `\`. #9257 is a local todo, not a GitHub issue: the PR body says "Tracking: todo #9257 (local, no GitHub issue)" and links no issue.

Counts (split escape: about 30 files or 25 commits, mirror excluded):
- Count basis (ruling-w2-plan-1 item 1): **26 entries / 40 raw paths, mirror excluded**; the split escape is measured in entries (one entry per new fixture directory). The plan is frozen with no split. If execution grows the count past 30 entries, that is a STOP.
- 11 tasks; 3 commits for the PR's change (D1, D2, S), 4 with M.
- Files, counting each NEW fixture directory as one entry (the item's own Files list does: "New fs fixtures, listed under Verification"): 26 — 25 repository paths in the tasks and direct commits plus this plan file (the ship commit carries it, as in waves 0, 1a and 1b). Raw changed paths, counting every fixture file: 40 (the five fixture directories hold 19 files). M adds 2 mirror files.
- Without the five follow-ups: 25 entries / 39 raw (only `skill/ship.js` leaves; the other follow-ups edit files W7.3 already edits).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-2-plan-source.md (W7.3 verbatim, plan section 0, execution conventions, todo texts #9244 #9245 #9249 #9250 #9255), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-2-planner-brief.md (binding readings), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/preflight-w2.md (anchors at b529982), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w2-preflight.md (rulings 1–4)

**Verification:**

Every command runs exactly as written, from the worktree root unless it starts with `cd`. PF-ENV: each promptfoo command runs in ONE Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`. `<export>` is a fresh JSON path under that `TMPDIR`. Baselines were produced at b529982 by the planner with the same commands and env (one run of `^plan-format|^plan-prepare|R-plan-commit-subject`: 62 passed, 0 failed = 34 + 22 + 6).

- (V1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-format" -o <export>`: 41 passed, 0 failed (34 at b529982; Task 2 adds 7 cases and changes 3 assertions).
- (V2) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-prepare|^plan-merge|^plan-diff|^plan-g17" -o <export>`: 40 passed, 0 failed (22 at b529982; Task 3 adds 3 and rewrites T4a, Task 4 adds 3, Task 5 adds 4, Task 6 adds 8).
- (V3) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "R-plan-commit-subject" -o <export>`: 6 passed, 0 failed (6 at b529982; unchanged behaviour, #9244).
- (V4) `node .claude/skills/validate-plugin-consistency/check-consistency.js --project-root .` prints `✓ All consistency checks passed.` and exits 0 (same at b529982).
- (V5) `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints only the two LEGACY_SHAPE lines (received-review-sdlc, version-sdlc) and exits 0 (same at b529982).
- (V6) `node --check` exits 0 for each of `plugins/sdlc-utilities/scripts/lib/plan-parse.js`, `plugins/sdlc-utilities/scripts/lib/plan-critique.js`, `plugins/sdlc-utilities/scripts/skill/plan.js`, `plugins/sdlc-utilities/scripts/skill/ship.js`, `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` (one Bash call each).
- (V7) After the ship run: `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --project-root . --file docs/plans/2026-11-05-m7-w2-plan-scripts.md --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --markdown` exits 0, and its table has `| PF12 | PASS |` and `| PF11 | PASS |` rows (no `--root`: Task 3 deletes a path this plan lists as Modify).
- (V8) SKILL.md counts, one Bash call each: `grep -c 'lanes\[[0-9]\]' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0` (10 at b529982); `grep -ciE 'five|5-lane|5 lanes|5 \+ M|0\.\.4|lane [34]\b|lanes 0' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0` (12 at b529982, all inside the E9/E10 ranges); `grep -c 'critiqueDir' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → at least `5` (0); `test ! -e plugins/sdlc-utilities/skills/plan-sdlc/lane-file-existence-prompt.md` exits 0.
- (V9) `grep -rn 'file-existence' plugins/sdlc-utilities/ tests/promptfoo/datasets/ tests/promptfoo/fixtures/ docs/skills/ docs/specs/plan-sdlc.md` prints nothing (hits at b529982 in plan.js, the deleted prompt, the plan spec R35/P16, the two md fixtures and `plan-sdlc.yaml`).
- (V10) Behavioural: the changed `P1-fanout` and c2 material-change cases in `plan-sdlc.yaml` are written, NOT run (brief). Record "not run (brief: written, not run)" in the PR body. No behavioural run, no `claude plugin eval`.

---

## Plan readings

Quoted from the binding sources:

- Brief: "ONE plan file and ONE PR. It is an L item and is never joined with other work." Ruling item 4: "#9244, #9245, #9249, #9250 and #9255 (the plan-sdlc spec R56(a) part) join W7.3." → Tasks 1 (#9244), 3 (#9245), 11 (#9249, #9250, #9245 text); D2 (#9245 spec, #9255).
- Ruling item 1: "W7.3's new checks get the next free ids, PF12 (shared Modify path, G4) and PF13 (Modify path exists, G10) … with `total` going from 10 to 11." → D1, Task 2, Task 7 (static-lane text), Task 9, Task 10.
- Ruling item 2: "Do not create `lib/plan-doc.js`. Put the genuinely new helpers in `lib/plan-parse.js`." → Task 1.
- Ruling item 3: "`plan.js` `lanes.slice(0,4)` becomes `slice(0,3)` … the six 'five lane' SKILL.md lines, including the `5-Lane` heading … the site mirrors … one extra commit". → Task 3, Task 9 and V8 (widened grep), commit M.
- Ruling item 4 ids: "#9245's new id is P23 and critiqueDir's is P22. The other next free ids are R67, A4 and E9." → P22, P23 and R67 are used; A4 and E9 are not needed (no new flag of plan-sdlc, no new failure mode).
- Brief: "Spec-consequence commits go first … a 'Direct commits' section lists every spec commit in order, each with exact subject, exact files and exact text." → `## Direct commits`.
- Brief: "Every verification command uses `npx --yes promptfoo@0.123.1` … Exec-only configs only … behavioural cases … are written, not run." → V1–V3, V10. The item's "Single behavioral check: `--filter-pattern "P1-fanout"`" is not run (brief overrides).
- Plan section 0 rule 2: locate every quoted line by content, exactly once, else STOP; multi-site edits bottom-up. Rule 3: only the Change. Rule 8: a Change that contradicts the code is a STOP.
- GATE-9: no test depends on a timer. Every exec case waits for one child process (the provider's spawn returning); no assertion relies on the provider's existing time limit. `--today` makes the learnings window deterministic (seeded date, no clock).

---

## Context

**What problem does this change solve?**

- plan-sdlc's critique steps carry mechanical work in the model's context. The model merges lane results, counts gates, snapshots seven values to decide materiality, tallies scorecard counts and picks the verdict.
- Mechanical work done by a model drifts. The audit (report A) found the verdict "not computed from counts" class of bug, and a guardrail lane that is dispatched although its prompt has a constant answer when no guardrail exists.
- Two gates (G4 "two tasks modifying the same file are in dependency order", G10 "every Modify path exists") are pure file checks, but a haiku lane judges them.

**What prompted this change now?**

- The M7 roadmap places W7.3 in wave 2, alone, as an L item. Wave 1b (merged at b529982) cleaned plan-sdlc's text and added PF11, so W7.3 now edits a settled file set.
- Five small follow-ups were placed "in W7.3 if it touches plan.js"; it does.

**What does success look like?**

- `lane-file-existence-prompt.md` is gone; the prepare output lists four lanes.
- `plan.js merge-lanes`, `diff-material` and `g17-prepare` answer on new fixtures exactly as the cases state.
- PF12 and PF13 pass and fail on the new cases; PF1–PF11 output is unchanged (every existing case still passes).
- SKILL.md has no `lanes[N]` reference and no "five lane" text.

## Research Findings

Inline exploration (the discovery orchestrator returned a brief without `F-<DIM>-<n>` finding IDs, so plan-sdlc fell back to inline exploration; G15 is not applicable). Anchors are content-located at b529982.

- **`scripts/lib/plan-parse.js`** (210 lines, no I/O) exports `extractField`, `stripFences`, `extractTasks`, `parsePlan`. It already has a fence-aware `walkLines(lines, visit)` and `labelBlock`. Its users: `skill/execute.js` (parsePlan) and `ci/validate-plan-format.js` (the other three). `ship.js` does not import it.
- **`ci/validate-plan-format.js`** (544 lines): `parseArgs` knows `--project-root` (defaults to the main worktree's `.sdlc` root), `--file`, `--json`, `--markdown`, `--final`, `--template`. `checkPF4(tasks)` returns `{ id, status, message }`. `checkPF11(content, subjectPattern)` is the shipped `**Commit:**` check. The entry point is a bare `try {` at module scope with no `require.main` guard and no exports. The default check list is PF1–PF7, then PF11; PF9 and PF10 follow under `--final`. JSON report: `{ passed, checks, summary: { total, passed, failed } }`.
- **`skill/ship.js` `readPlanCommitSubject(planFile, subjectPattern)`** applies the same header cut, regex, 72-character limit, character set and pattern test as `checkPF11`; only the messages differ (ship says `is <n> characters long` and `does not match commit.subjectPattern <pattern>`, plus a Fix/Why tail; PF11 says `(at most 72)` and never prints the pattern). Callers: two, in `ship.js`.
- **`skill/plan.js`** (657 lines): `parseArgs` knows `--from-openspec`, `--mark`, `--path`; `main()` reads stdin first when stdin is not a TTY; `buildLanes(g17Dispatch)` defines four lane objects and pushes `dimension-coverage`; a warn loop `lanes.slice(0, 4).forEach` (non-G17 lanes); the output object has 12 keys and goes through `writeOutput`; `readSection` is already imported; `require.main` guard at the end, `module.exports = { main }`.
- **`skill/review.js`** exports `globToRegex` and `UNCOVERED_PATTERN_CATALOG` (12 entries `{ test, dimension, label }`) and guards its CLI with `require.main === module`, so requiring it has no side effect. Probe: `globToRegex('**/infra/**')` matches `infra/terraform/main.tf`; `globToRegex('src/**/*.ts')` matches `src/a.ts`.
- **`lib/yaml.js`** exports `extractFrontmatter`, `extractBody`, `parseSimpleYaml`.
- **Tests.** `tests/promptfoo/providers/script-runner.js` splits `script_args` on whitespace (an empty-string argument cannot be passed; spaces inside one argument are written as `\x20`), ends stdin at once, and reads the output file when stdout is a single temp path. `scripts/extract-skill-content.js` copies a `file://fixtures-fs/<dir>` fixture to a fresh temp dir and substitutes `{{project_root}}` and `{{repo_root}}`. Case counts at b529982: `^plan-format` 34, `^plan-prepare` 22, `R-plan-commit-subject` 6 (all pass).
- **Consumers of the validator.** `hooks/post-tool-validate.js` runs it with `--project-root <cwd> --markdown --file <plan>` on every write of a `plans/*.md` file; it never passes `--final`, `--template` or `--root`. So PF12 (default set) reaches the hook; PF13 (`--root` only) does not. Probe at b529982: no plan under `docs/plans/` and no plan fixture has a shared Modify path without a dependency link, so no existing case or plan starts failing.
- **Other references.** `file-existence` appears in plan.js, the prompt to delete, the plan spec (R35, P16), `plan-sdlc.yaml`, the two md fixtures and the site mirror `site/src/content-source/specs/plan-sdlc.md`. `docs/cost-tiers.md` names no plan lane. `site/scripts/copy-docs.mjs` copies all of `docs/` into `site/src/content-source/`.
- **Build/test commands:** `node --check`, the exec config `tests/promptfoo/promptfooconfig-exec.yaml`, `check-consistency.js`, `validate-spec-shape.js`.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item text PF11 → PF12, PF12 → PF13 | no (ruled: ruling-w2-preflight item 1) | the item's "NEW checkPF11" (shared Modify, G4) is **PF12**; its "NEW checkPF12" (Modify path exists, G10) is **PF13**, in the validator, the merge-lanes mapping table, the static-lane text, the spec, the docs page and the exec cases; `total` goes 10 → 11 (the item's "9 → 10" was already done by #9176) | PF11 is the shipped `**Commit:**` check (R66); ids are never reused |
| `lib/plan-doc.js` | no (ruled: item 2) | not created; `extractTasksRaw`, `taskSection`, `parseFilesEntries`, `parseDependsOn`, `sectionBody` (and #9244's `parsePlanCommit`) go into `lib/plan-parse.js`; the item's "move extractField/stripFences/extractTasks out of the validator" is already done (they live in plan-parse.js) | one parser module; a second one would duplicate it |
| Four-lane consequences | no (ruled: item 3) | `plan.js` warn loop `slice(0, 4)` → `slice(0, 3)` and the "Five entries" comment; every "five lane" SKILL.md form incl. the `5-Lane` heading, `i = 0..4`, `Lanes 0–3`, `lane 3`/`lane 4` (V8 widens the item's grep); the site mirrors in commit M | the item's own lane change makes them wrong |
| Follow-ups joined | no (ruled: item 4) | #9244 (Task 1), #9245 (D2, Tasks 3 and 11), #9249 and #9250 (Task 11), #9255 (D2, plan spec R56(a) only); the review-sdlc `R-orchestrator-await` (a) clause is a done-file FOLLOWUP | W7.3 touches plan.js; the guard (split escape) is not reached |
| Spec G3/G4/G10/G12 text | no | the owner suffix is APPENDED to each gate line; the item's G3 replacement text ("no circular deps (PF4 …)") would drop "every named dependency exists" | Must-not-touch "Gate definition wording G1–G21 (R42); change 9 only appends the owner suffix" |
| Line numbers | no | every anchor is located by content (SKILL.md drifted about −20 lines since the item was written, the validator about −43) | plan section 0 rule 2 |
| `lanes[N]` in SKILL.md G20/G21 paragraphs | no | the `(lanes[1])` parentheticals are dropped from the SKILL.md G20/G21 paragraphs (the lane name already stands there) | item: "Replace all 10 `lanes[N]` references"; the spec gate lines are not touched |
| Lane gate table in one place | no | the non-G17 lane table (name, model, template, gateIds) moves from `buildLanes` into `plan-critique.js` as `LANE_DEFS`; `buildLanes` maps it | `merge-lanes` needs each lane's gate ids for the lane-failure message and coverage; one table, no copy (`dry`) |
| File I/O in `plan-critique.js` | no | the library reads its input files itself (node `fs` only); `plan.js` only parses argv, calls it and prints | the item: "Logic lives in NEW `scripts/lib/plan-critique.js`"; plan-parse.js stays I/O-free |
| `--lanes` absent | no | `merge-lanes` treats an absent `--lanes` like `--lanes ""`; at least one of a non-empty `--lanes` or `--lenses` is required | the exec provider cannot pass an empty argument; SKILL.md still writes `--lanes ""` |
| `merge-lanes` edge cases the item leaves open | no | missing `pf-report.json` (with lanes) → blocking failure of lane `validate-plan-format`; missing `g17-prepare.json` → advisory `laneFailures` entry, no G17 base; `coverage.missing` excludes G17 (advisory); an unknown lane name → exit 1; an unparseable lens file gives severity `WARNING` | the item defines the lane and lens cases only; these keep "never silently skipped" (R35) and "G17 advisory" (R31) |
| `mirrorMap` values | no | `mirrorMap[name]` holds the matching mirror basename `x` (a truthy string) instead of `true` | the UPDATE mirror action names `.github/instructions/<x>.instructions.md`; with `true` the dimension name (`code-review`) would give a wrong path (`code.instructions.md` exists) |
| g17-prepare fixture | no | the fixture plan also modifies `src/b.js`, so `code-review` (trigger `src/**/*.js`) is a covered dimension | the item's predicate: "U1–U6 over covered dimensions' unmatched plan paths"; without a covered path U1 cannot fire, but the item asserts it does |
| PF13 exemption for created paths | no (ruled: ruling-w2-plan-1 item 2) | a `Modify:` path is exempt only when a task in the transitive closure of the checked task's `Depends on` lists the same path as `Create:`; a path created by a non-ancestor task still fails; two exec cases pin both sides | the item's predicate fails every plan where Task N creates a file and a later task extends it (this plan: `plan-critique.js`, Tasks 3–6; Step 3's file-existence lane flagged exactly that) |
| Acceptance criteria after Contract | no | in every task of this plan, `**Acceptance criteria:**` follows `**Contract:**` (the format reference shows it before) | validator PF5 looks at most 5000 characters past the Acceptance label for the next heading; Tasks 2, 5, 6, 7 and 9 have longer Contracts. Order is a convention, not a parsed rule (`parsePlan` uses `labelBlock`) |
| Fence-aware cuts | no | `extractTasksRaw`, `taskSection` and `sectionBody` reuse `walkLines` (fence lines may be indented, as plan-parse.js already accepts) | a `## ` or `### Task` line inside a fenced example must not cut a task (the injection fixture class) |
| `diff-material` per-task comparison | no | `files`, `contracts`, `dependsOn` and `openspec` compare only task numbers present in both versions | an added or removed task is the `taskCount` trigger; comparing it again would fire every trigger for one change |
| item's `echo …_EXIT` lines | no | dropped; the deterministic block is split into one-call blocks and every exit code is read from the tool result | SKILL.md `<PLUGIN_ROOT>` run-as-written rule (#9193 (a)) |
| Prescribed block comment line | no | SKILL.md's new bash blocks carry no `# Substitute <PLUGIN_ROOT> …` comment line | wave 1b (W6c.10) replaced fence comments with one `<PLUGIN_ROOT>` paragraph |
| Critique tempdir sweep | no | not added to the session-start `gcTempdirs` sweep; SKILL.md removes `critiqueDir` at Step 7 and in Error Recovery | hooks are outside the item's Files; done-file FOLLOWUP |
| Discovery brief | no | the orchestrator's brief had no `F-<DIM>-<n>` ids; inline exploration was used; the learnings line SKILL.md asks for was not written | the brief allows only this plan file to be written |
| Learning Capture | no | not written to `.sdlc/learnings/log.md` | same |
| One ship commit for Tasks 1–11 | no | Tasks 1–11 land in ONE ship commit (the header subject); D1, D2 and M stay separate | ship's commit step makes one commit per run from the plan header (R66); waves 0, 1a and 1b shipped the same way |
| Behavioural check | no | the item's single behavioural run (`P1-fanout`) is not run | brief: behavioural cases are written, not run |
| Files beyond the item's Files list | no (pre-approved: ruling items 3 and 4; QUESTION-free) | `scripts/lib/plan-parse.js` (ruling 2), `scripts/skill/ship.js` (#9244), the site mirrors (commit M) | rulings; no other file is added |

## Key Decisions

- **KD-1 Scripts compute, the model judges.** Lane and lens results go to files under `critiqueDir`. `merge-lanes` does the union, coverage, dedup, ranking, capping, scorecard counts and verdict. The model only writes each agent's JSON block to a file and reads `merged.json`. Alternative: keep the merge in SKILL.md prose. Rejected (`scripts-over-llm-logic`; the verdict-from-counts bug class).

- **KD-2 PF12 and PF13 are validator checks, not a lane.** They need the task list and the file system only. PF12 runs in the default set (also from the post-tool hook, so a conflicting Modify pair is caught while the plan is written). PF13 runs only with `--root`, because the hook and CI do not know the active worktree, and `--project-root` points at the main worktree. Alternative: keep a haiku lane. Rejected (cost, drift).

- **KD-3 One `**Commit:**` rule set (#9244).** `parsePlanCommit(content, subjectPattern)` in `plan-parse.js` returns a failure code; PF11 and ship keep their own message wording, so every existing message stays byte-identical. Alternative: one shared message. Rejected: ship's message carries Fix/Why text and the pattern; PF11's markdown table must not print the pattern (it holds `|`).

- **KD-4 The lane table lives in `plan-critique.js`.** `LANE_DEFS` (static-structural, content-coverage, guardrail-compliance) feeds both `buildLanes` and `merge-lanes`. `dimension-coverage` still mirrors `g17Dispatch` verbatim (P16).

- **KD-5 Subcommands print to stdout, before stdin is read.** `main()` dispatches `merge-lanes`, `diff-material` and `g17-prepare` before the stdin read, so a caller redirects with `>` and never blocks. They do not use `writeOutput` (no temp file to clean). Exit codes follow the existing header: 0 success, 1 usage or validation error, 2 crash.

- **KD-6 Material change is a file diff.** SKILL.md copies the plan to `<ITER_DIR>/plan-before.md`, applies the fixes, then runs `diff-material`. A non-zero exit sets `materialChangeDetected = true` (fail toward re-validation).

- **KD-7 G17 is a script plus a small call.** `g17-prepare` evaluates C1–C6 and U1–U6, the suppression and the harden-sdlc deferral; the model judges B1–B4 and writes one `why` per candidate; `merge-lanes` ranks (severity, criteria count, name), caps at 3 and renders. The model call is skipped when there are no candidates and no covered dimensions.

- **KD-8 Lens output is JSON.** Each lens returns `{ status, issues[{taskRef, message, severity, dimension, blocking}], recommendations, traceability }`. Any CRITICAL issue is forced blocking (R41). The requirements lens (and the `all` reviewer) fills `traceability`.

- **KD-9 `critiqueDir` is one fresh temp dir per run.** `fs.mkdtempSync(os.tmpdir()/sdlc-plan-critique-)` in the prepare run; `iter-0` for Step 3, `iter-<k>` for Step 5 iteration k. Removed at Step 7 and in Error Recovery. It sits outside the repository, so it behaves the same in `ship.workspace=branch` and `worktree` mode; PF13's `--root "$PWD"` is the active worktree in both (`workspace-mode-compatibility`). The Step 3 `g17-prepare` call reads `.sdlc/review-dimensions`, `.github/instructions` and `.sdlc/learnings/log.md` relative to the cwd — exactly the paths Step 3 passes to the G17 lane today (`{DIMENSIONS_DIR}`, `{COPILOT_DIR}`, `{LEARNINGS_LOG_PATH}`), so each mode reads the same files as before: the cwd's tracked dimension and instruction files (identical in a worktree, which checks out the same tree), and the cwd's learnings log (a missing log means no deferral, as today). The validator's `--project-root` default (main worktree `.sdlc`, via `resolveSdlcRoot`) is unchanged.

- **KD-11 A new fixture directory is one Files entry.** The item lists "New fs fixtures" as one Files item, and the fixtures' files are data the task's own cases read. Step 3 (G9, warning) noted that Tasks 4–6 pass five files when each fixture file is counted. Kept: splitting a fixture from the cases that read it would leave a task whose test proof lives in another task. The raw count is reported in Architecture.

- **KD-12 Flag names and the lens model.** Grep evidence (`grep -l -- "'<flag>'" plugins/sdlc-utilities/scripts/skill/*.js` at b529982): `--dir`, `--lanes`, `--lenses`, `--no-guardrails`, `--gate-a`, `--inventory`, `--before`, `--after`, `--dimensions-dir`, `--instructions-dir`, `--learnings`, `--window`, `--github-hosting`, `--root`, `--today` are unused by every skill prepare script; `--plan` is used by `execute.js` and `ship.js` with the same meaning (a plan file path). The validator's `--root` is a CI script flag (out of the guardrail's scope) and is distinct from its `--project-root`. The lens model override (Task 11, E7) is the dispatch-time override P17 sanctions; the prepare script cannot know the author's model.

- **KD-10 Smallest viable cut.** The item is one L unit; its parts depend on each other (SKILL.md calls all three subcommands and both new checks). The five follow-ups are each S and edit files this item already edits, except #9244's `ship.js` call site (two lines). Nothing else is added.

---

## Contract Examples

**code** (Task 2):

```markdown
**Contract:**
- shape (code): `function checkPF12(tasks)` → `{ id: 'PF12', status, message, details: [{ taskRef, message, gateId: 'G4' }] }`; in the default check set after PF11.
- names: `checkPF12`, id `PF12`, pass message `No shared Modify paths without a dependency link`.
- mirror: `checkPF3`'s issue join (`issues.join('; ')`).
- decisions: KD-2.
- sync: plan spec PF12 (D1); `merge-lanes` PF mapping (Task 6).
```

**docs** (Task 10):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` — Step 3 paragraph, Step 5 paragraph, material-change paragraph, marker table rows, Gate B paragraph, two PF bullets. Audience: end users.
- names: bullets `**PF12**`, `**PF13**`.
- mirror: the PF11 bullet as it stands.
- decisions: KD-1, KD-2, KD-6.
- sync: plan spec (D1, D2).
```

**openspec / spec** (D1):

```markdown
**Contract:**
- shape (openspec): MODIFY G3, G4, G10, G12 (append owner suffix), R31, R35, R36, R40, R64, P16, PF4; ADD P22, PF12, PF13, R67; nothing renumbered or removed.
- names: `P22`, `PF12`, `PF13`, `R67`.
- mirror: `PF11`'s sentence form; `R38`'s placement under `## Prepare script contract`.
- decisions: KD-1, KD-2, KD-5.
- sync: Tasks 1–11 implement it.
```

---

## Executor notes (carry-ins)

- Ship lines carry `--auto --rebase skip` (Architecture item 2). This wave does not use ship's `--tasks`/`--from-wave`: the ship run executes the whole plan.
- commit-sdlc's missing trailer is pre-answered: for D1, D2 and M, if `/sdlc:commit-sdlc --auto --subject "<subject>"` stops on a missing required trailer, use the disclosed fallback `git commit -F <message file>` with the same subject and the session's attribution line, and name it in the PR body (W8.43 is not installed).
- The PR body has an `## Evidence` section; every evidence line carries `(at <sha7>)`.
- Mirror commit M (not a ship task): after the ship step, run `node site/scripts/copy-docs.mjs`, keep only `site/src/content-source/specs/plan-sdlc.md` and `site/src/content-source/skills/plan-sdlc.md`, revert every other changed or new path (the copy-docs `plans/` mirror included), and commit M with its subject. `docs/cost-tiers.md` is not touched, so its mirror is not in M.
- The installed plugin is 0.39.0: this plan's `**Commit:**` header line was written by hand, and its tasks use `**Notes:**`.
- SAFE-12: execute workers change repo files only with the Edit and Write tools (Task 3 deletes one file with `git rm`, named in its Files).
- Fixture guard: no new fixture has a `setup.sh`; workers never run a fixture `setup.sh` by hand.
- Task 1: `ship.js` builds its lib requires as `path.join(LIB, '<name>')` (`const LIB = path.join(__dirname, '..', 'lib')`); require plan-parse the same way, `path.join(LIB, 'plan-parse')` (same path as the Contract's form).
- Task 9 Block LM's `--lanes ""` is the normal (lens-only) path; on a merged re-dispatch Block RD applies and `--lanes` lists the dispatched lanes.

## Direct commits (before the ship run)

These two commits are NOT plan tasks: ship and execute never run them (the plan's `### Task N:` headings are Tasks 1–11 only). The executor makes each one alone, in order D1 → D2, with the Edit tool, then `/sdlc:commit-sdlc --auto --subject "<subject>"` with only `docs/specs/plan-sdlc.md` staged. Locate every old text by content with `grep -nF`; each must occur exactly once (plan section 0 rule 2), else STOP. Edits inside one commit go bottom-up.

ID check (run in ONE Bash call before D1 and after each of D1, D2):

```bash
export LC_ALL=C; b=$(git show b529982:docs/specs/plan-sdlc.md | grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+)\b' | sort -u); h=$(grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+)\b' docs/specs/plan-sdlc.md | sort -u); echo "added=[$(comm -13 <(echo "$b") <(echo "$h") | tr '\n' ' ')] removed=[$(comm -23 <(echo "$b") <(echo "$h") | tr '\n' ' ')]"
```

Expected: before D1 `added=[] removed=[]`; after D1 `added=[- P22 - PF12 - PF13 - R67 ] removed=[]`; after D2 `added=[- P22 - P23 - PF12 - PF13 - R67 ] removed=[]`. After each commit also: V5 holds; `git status --porcelain` shows only this plan file.

### D1: plan spec — four lanes, PF12/PF13, critique scripts (W7.3)

- Subject: `docs(#9257): plan-sdlc - spec four lanes, PF12/PF13, critique scripts`
- File: `docs/specs/plan-sdlc.md` only. Edits (listed top-down; apply bottom-up):

1. **R31** (line starting `- R31 (G17 Dimension Coverage gate, advisory):`), replace the substring that starts `At Step 3, plan-sdlc dispatches a dedicated Agent subagent` and ends `each tagged with severity hint, criteria-triggered list, and dimension name.` with:

   ``At Step 3, `plan.js g17-prepare` (R67) reads the plan file, all `.sdlc/review-dimensions/*.md` and `.github/instructions/*.instructions.md`, matches the plan's Create and Modify paths against the trigger globs, evaluates the CREATE criteria (C1–C6) and the path/structure UPDATE criteria (U1–U6), and applies the suppression rules and the learnings deferral below. plan-sdlc then dispatches a dedicated Agent subagent in parallel with the other lanes, loaded from `plugins/sdlc-utilities/skills/plan-sdlc/g17-dimension-coverage-prompt.md`, unless the script found no candidate and no covered dimension; the subagent evaluates the behavior-modification UPDATE criteria (B1–B4) and writes one `why` sentence per candidate. `plan.js merge-lanes` (R67) ranks, caps and renders the findings, each tagged with severity hint, criteria-triggered list, and dimension name.``

2. **R35** (line starting `- R35 (Step 3 lane fan-out):`), replace the whole line with:

   ``- R35 (Step 3 lane fan-out): Step 3 (CRITIQUE) dispatches four lane subagents IN PARALLEL in a SINGLE message at the start of Step 3. Lanes own disjoint gate subsets per KD1: (a) **static-structural** → G1, G2, G7; (b) **content-coverage** → G5, G6, G8, G9, G11, G13, G15, G16, G18, G19, G20, G21; (c) **guardrail-compliance** → G14; (d) **dimension-coverage** → G17 (R31). `validate-plan-format.js`, run before the dispatch, owns G3 and G12 (PF4), G4 (PF12) and G10 (PF13). The guardrail-compliance lane is not dispatched when `guardrails` (P7) is empty; `plan.js merge-lanes --no-guardrails` then supplies its constant result `{ gateIds: ["G14"], issues: [], passes: ["G14"], laneStatus: "ok", guardrailCompliancePayload: "No active guardrails configured." }`. Each lane returns the normalized schema `{ gateIds: string[], issues: [{ gateId, severity, taskRef, message, blocking }], passes: string[], laneStatus: "ok"|"failed"|"timeout" }` (the dimension-coverage lane returns `{ candidates: [...] }`, R31). The skill writes each lane's JSON to `<critiqueDir>/iter-<k>/<lane name>.json` (P22), and `plan.js merge-lanes` (R67) merges the lane results with the validator report: gate coverage union {G1..G21}, lane-failure issues, dedup. Dispatch parameters (`subagent_type`, `model`, `prompt_template_path`) MUST be sourced verbatim from `lanes[]` (P16) per `agent-dispatch-script-driven` guardrail. The `guardrailsEvaluated` and `critiqueRan` markers are written after `merge-lanes` returns, never before every dispatched lane has returned. Lane dispatch failure / timeout / malformed output / missing result file surfaces as a blocking issue — never silently skipped. G17 (dimension-coverage) failure remains advisory per R31 dispatch-failure fallback.``

3. **R36** (line starting `- R36 (Step 5 multi-reviewer fan-out):`), replace `Recommendations = string-prefix dedup.` with:

   ``Recommendations = string-prefix dedup. Each lens returns one fenced JSON block `{ status, issues: [{ taskRef, message, severity, dimension, blocking }], recommendations, traceability }`; the skill writes it to `<critiqueDir>/iter-<k>/lens-<lens>.json` (P22) and `plan.js merge-lanes --lenses` (R67) applies this merge.``

4. **G3** line `- G3: Dependency integrity — no circular deps; every named dependency exists` → append ` (PF4 via validate-plan-format.js)`.
5. **G4** line `- G4: File conflict potential — two tasks modifying the same file are in dependency order` → append ` (PF12 via validate-plan-format.js)`.
6. **G10** line `- G10: File existence — every "Modify:" path exists in the codebase` → append ` (PF13 via validate-plan-format.js --root)`.
7. **G12** line `- G12: Dependency target existence — every "Depends on: Task N" references a task that exists` → append ` (PF4 via validate-plan-format.js)`.

8. **R40** (line starting `- R40 (Gate B plan audit / Verification Scorecard):`), append at the end of the line:

   `` The dimension table, the traceability matrix and the verdict are computed by `plan.js merge-lanes --lenses` (R67) from the lens JSON (R36), `--inventory` and `--gate-a`; the skill writes the resulting markdown verbatim.``

9. **R64**, replace `The Step 3 five-lane gate fan-out (G1-G21, R35)` with `The Step 3 four-lane plus PF gate fan-out (G1-G21, R35)`, and replace `Wording, formatting, and metadata-only fixes are not material and do not trigger re-validation.` with `Wording, formatting, and metadata-only fixes are not material and do not trigger re-validation. The skill decides materiality with `plan.js diff-material` (R67) on the plan before and after the IMPROVE pass.`

10. **PF4** line `- PF4: Dependency references valid (no cycles, all targets exist)` → append `; the result carries `details: [{ taskRef, message, gateId }]` — `gateId` `G12` for a nonexistent target, `G3` for a cycle (taskRef = the first task of the cycle)`.

11. After the line starting `- PF11: `, insert two lines:

    ``- PF12: Shared Modify paths in dependency order — for every path that two tasks list as `Modify:` (Files entries of the task, before the next `## ` heading), one of the two tasks reaches the other through `Depends on` links, directly or transitively. A failure carries `details: [{ taskRef: "Task j", message, gateId: "G4" }]` (Task j is the later task). Runs in the default check set (deterministic owner of G4, R35).``

    ``- PF13: Modify path existence — only under `--root <dir>`: every `Modify:` path that holds no `*` exists under `<dir>`, the active worktree (distinct from `--project-root`, which locates the config). `Create:` and `Test:` paths are exempt. A `Modify:` path is exempt only when a task in the transitive closure of the checked task's `Depends on` lists the same path as `Create:`; a path created by a task that is not an ancestor still fails. A failure carries `details: [{ taskRef, message, gateId: "G10" }]`. Deterministic owner of G10 (R35); plan-sdlc Step 3 and Step 6.6 pass `--root`.``

12. **P16**, three substring edits on the line starting `- P16: `: `five entries per R35 KD1` → `four entries per R35 KD1`; `[0] static-structural (G1,G2,G3,G7,G12)` → `[0] static-structural (G1,G2,G7)`; `[2] file-existence (G4,G10), [3] guardrail-compliance (G14), [4] dimension-coverage` → `[2] guardrail-compliance (G14), [3] dimension-coverage`.

13. After the line starting `- P21: `, insert:

    ``- P22: `critiqueDir` (string | null) — absolute path of a fresh directory created by `fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-plan-critique-'))` on every prepare run (not in `--mark` mode); null (with an `errors[]` entry) when it cannot be created. Step 3 and Step 5 write the validator report, the g17-prepare result and the lane and lens JSON under `<critiqueDir>/iter-<k>/` (k = 0 at Step 3, the iteration number at Step 5); `plan.js merge-lanes` reads them. SKILL.md removes the directory at Step 7 and in Error Recovery.``

14. After the line starting `- R38 (Delta-spec requirement inventory):`, insert:

    ``- R67 (critique scripts): `plan.js` has three subcommands, dispatched before the prepare flow (no stdin read), each printing one JSON object to stdout; exit 0 on success (the JSON carries the decision), 1 on a usage or validation error, 2 on an unexpected crash. Their logic lives in `scripts/lib/plan-critique.js`. (a) `merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>]` → `{ issues, passes, coverage, laneFailures, guardrailCompliancePayload, g17Findings, lens, scorecard, blockingCount }` (R31, R35, R36, R40); (b) `diff-material --before <path> --after <path>` → `{ material, triggers, details }`, triggers drawn from `taskCount, files, contracts, dependsOn, keyDecisions, openspec, deviations` (R64); (c) `g17-prepare --plan <path> --dimensions-dir <dir> --instructions-dir <dir> --learnings <path> [--window <days>] [--github-hosting true|false] [--root <dir>] [--today YYYY-MM-DD]` → the G17 candidate set (R31). Acceptance: `tests/promptfoo/datasets/plan-prepare-exec.yaml` cases `plan-merge:`, `plan-diff:` and `plan-g17:`.``

15. **R42** (line starting `- R42 (Additivity invariant):`; in the file it sits between the R40 line (edit 8) and the R64 line (edit 9); bottom-up, apply it after edit 9 and before edit 8; it is located by content, so the order does not change the result), append at the end of the line:

    `` The W7.3 critique scripts (R35, R67) are a sanctioned exception: G3, G4, G10 and G12 move from the lanes to `validate-plan-format.js` (PF4, PF12, PF13), the G4/G10 lane is removed, the union bound `{G1..G21}` holds over the lane gate ids plus those four PF-owned gates, and the four gate lines gain only an owner suffix.``

- Check (one Bash call each): `grep -c 'file-existence' docs/specs/plan-sdlc.md` → `0`; `grep -cE '^- (PF12|PF13|P22|R67)[: ]' docs/specs/plan-sdlc.md` → `4`; `grep -c 'five' docs/specs/plan-sdlc.md` → `0`.

### D2: plan spec — commit config field (#9245), explore await clause (#9255)

- Subject: `docs(#9257): plan-sdlc - spec commit config field, explore await clause`
- File: `docs/specs/plan-sdlc.md` only. Edits (apply bottom-up):

1. **R66**, replace `from the request, the branch and the project's \`commit\` config` with `from the request, the branch and the prepare output's \`commit\` field (P23)`. (Backslash-backtick is a backtick inside the quote, plan section 0 rule 2.)
2. After the line starting `- P22: ` (added by D1), insert:

   ``- P23: `commit` (object) — `{ subjectPattern: string | null, subjectPatternError: string | null, allowedTypes: string[] | null }`, read from the project config's `commit` section (`readSection(projectRoot, 'commit')`); a key is null when the section or the key is absent. Always present. plan-sdlc forms the `**Commit:**` header subject (R66) from it.``

3. **R56**, replace `(a) Every Step 2 dispatch uses \`run_in_background: false\`;` with `(a) no Step 2 dispatch passes a \`run_in_background\` parameter (the Agent tool has none); subagents run in the background and notify the orchestrator when they complete, and awaiting those notifications is the barrier;`. Keep (b) and (c) byte-identical.

- Check: `grep -c 'run_in_background: false' docs/specs/plan-sdlc.md` → `0`; `grep -c '^- P23: ' docs/specs/plan-sdlc.md` → `1`; `grep -c "prepare output's \`commit\` field (P23)" docs/specs/plan-sdlc.md` → `1`.

---

## Tasks

The ship run executes Tasks 1–11. They land in the single ship commit `feat(#9257): plan-sdlc - lane merge, material diff, G17 prep in scripts`. Every edit is made with the Edit or Write tool (Task 3's delete with `git rm`); every quoted text is located by content with `grep -nF` and must occur exactly once (plan section 0 rule 2); multi-site edits in one file go bottom-up. Must-not-touch for the whole run: the spec (D1/D2 own it); `skill/review.js` (import only); `hooks/**`; `check-consistency.js`; `promptfooconfig*.yaml`; every existing fixture under `tests/promptfoo/fixtures-fs/` (add new ones only); the SKILL.md `--mark` bash blocks; the `guardrailsEvaluated`/`critiqueRan` once-per-run semantics; the Step 4 harden offer (R19); the R41 single-path injection; gate definition wording G1–G21; every other skill.

### Task 1: plan-parse.js — new parser helpers and one `**Commit:**` rule set (W7.3 change 1, #9244)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-parse.js` — add six exported helpers
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `readPlanCommitSubject` uses `parsePlanCommit`

**Notes:**
The helpers are pure (no I/O) like the rest of the module. Ship and PF11 keep their own wording (KD-3), so every existing message and case stays unchanged; V3 proves the ship side, Task 2's PF11 cases the validator side.

**Contract:**
- shape (code): new functions in `plugins/sdlc-utilities/scripts/lib/plan-parse.js`, placed after `extractTasks` (parser helpers) and before `module.exports`:

  | Function | Returns | Rule |
  |---|---|---|
  | `extractTasksRaw(content)` | `[{ number, title, body }]` | CRLF → LF; walk lines with `walkLines`; a line matching `/^### Task (\d+):\s*(.+)$/` outside a fence starts a task; its body runs to the next such line outside a fence, or EOF; fences stay in the body |
  | `taskSection(body)` | string | `body` cut before the first line starting `## ` outside a fence (walkLines); whole body when none |
  | `parseFilesEntries(body)` | `[{ kind: 'Create'|'Modify'|'Test', path }]` | every line matching `/^\s*[-*]\s+(Create|Modify|Test):\s+(.+)$/gm`; `path` = the first backticked token (`/`([^`]+)`/`), else the first whitespace-delimited token; a trailing `:\d+(-\d+)?` is stripped |
  | `parseDependsOn(body)` | `number[]` | `extractField(body, 'Depends on')`; `[]` when absent or when the value lower-cased is `none`, `—` or `-`; else the numbers of `/Task\s+(\d+)/gi` in order |
  | `sectionBody(content, headingRegex)` | string \| null | the first line (outside a fence) matching `headingRegex` starts the section; its text runs from the next line to the next line outside a fence that starts `## ` or matches `/^### Task \d+:/`; null when no line matches |
  | `parsePlanCommit(content, subjectPattern)` | `{ subject, failure }` | header = lines before the first line that is `---` or starts `## ` or `### ` (CRLF-aware, as today); fields = header lines starting `**Commit:**`; none → `{ subject: null, failure: null }`; then in this order: >1 → `failure: { code: 'duplicate' }`; no match of `/^\*\*Commit:\*\* \`([^\`]+)\`\s*$/` → `{ code: 'format' }`; length > 72 → `{ code: 'length', length }`; `/["$\\]/` → `{ code: 'chars' }`; `subjectPattern` set and `new RegExp` throws → `{ code: 'pattern-invalid', error: err.message }`; no match → `{ code: 'pattern-mismatch' }`; else `{ subject, failure: null }` |

  `readPlanCommitSubject` in `ship.js` keeps its signature, its file read (ENOENT → `{ subject: null, error: null }`, other errors → the existing error text) and its `fail(why)` helper, and maps codes to its existing `why` texts: `duplicate` → `appears more than once`; `format` → `is not one backticked subject`; `length` → `` `is ${length} characters long` ``; `chars` → `contains ", $ or \\`; `pattern-invalid` → `` `cannot be checked: commit.subjectPattern is not a valid regex (${error})` ``; `pattern-mismatch` → `` `does not match commit.subjectPattern ${subjectPattern}` ``. It requires `parsePlanCommit` with `require(path.join(__dirname, '..', 'lib', 'plan-parse'))`, matching the other `lib/` requires in ship.js.
- names: `extractTasksRaw`, `taskSection`, `parseFilesEntries`, `parseDependsOn`, `sectionBody`, `parsePlanCommit`; codes `duplicate`, `format`, `length`, `chars`, `pattern-invalid`, `pattern-mismatch`.
- mirror: `parsePlan`'s use of `walkLines` (same module); the two existing rule bodies (`checkPF11` in the validator, `readPlanCommitSubject` in ship.js).
- decisions: KD-3; Deviations rows "lib/plan-doc.js", "Fence-aware cuts".
- sync: Task 2 (PF11 uses `parsePlanCommit`; PF12/PF13 use `taskSection` and `parseFilesEntries`); Tasks 4–6 (`plan-critique.js`).

**Acceptance criteria:**
- [ ] `plan-parse.js` exports `{ extractField, stripFences, extractTasks, parsePlan, extractTasksRaw, taskSection, parseFilesEntries, parseDependsOn, sectionBody, parsePlanCommit }`; the four existing functions are byte-identical.
- [ ] On `tests/promptfoo/fixtures-fs/project-valid-plan/plans/test-plan.md`, `sectionBody(content, /^## Key Decisions\s*$/)` holds only the `- **Standalone module…**` bullet (plus blank and `---` lines), not the task blocks that follow.
- [ ] `readPlanCommitSubject` returns byte-identical `{ subject, error }` values for every input (same messages, same ENOENT and read-error handling).
- [ ] V3: 6 passed, 0 failed. V6 holds for both files.

**Test proof:** Impact grep: `grep -rln 'plan-parse\|readPlanCommitSubject' plugins/sdlc-utilities/hooks plugins/sdlc-utilities/scripts tests/promptfoo/datasets` → `skill/ship.js`, `skill/execute.js` (uses only `parsePlan`, unchanged), `lib/plan-parse.js`, `ci/validate-plan-format.js` (b529982). Targeted run: V3, once (6 ship cases), plus Task 2's 11 existing `plan-format PF11` cases in V1, which pin each failure code: `duplicate` (`two header fields fail`), `format` (`a field without backticks fails`, `a subject with an inner backtick fails`), `length` (`a 73-character subject fails`), `chars` (`$`, double quote, backslash cases), `pattern-mismatch` (`a subject outside commit.subjectPattern fails`); `pattern-invalid` has no case at b529982 and its text is unchanged. Mutation proof: a changed message text in `readPlanCommitSubject` fails the `malformed header field` V3 case, a changed rule fails the matching PF11 case. Environment scrub: PF-ENV. Waits: each case's spawn returns when the script exits; no timer.

### Task 2: validate-plan-format.js — `--root`, PF4 details, PF12, PF13, exports (W7.3 change 2, #9244)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/ci/validate-plan-format.js` — flag, checks, exports, PF11 via `parsePlanCommit`
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — 3 assertions, 7 cases, header comment
- Create: `tests/promptfoo/fixtures-fs/project-plan-shared-modify/` — `plans/test-plan.md`
- Create: `tests/promptfoo/fixtures-fs/project-plan-shared-modify-ordered/` — `plans/test-plan.md`

**Notes:**
PF12 joins the default set, so the post-tool hook reports it while a plan is written (KD-2); the planner probe found no existing plan or fixture that it would newly fail. PF13 exempts a path a dependency creates, because "Task 3 creates a module, Task 4 extends it" is a normal plan shape (this plan has it; the Step 3 file-existence lane flagged it).

**Contract:**
- shape (code):

  | Site | Before | After |
  |---|---|---|
  | CLI | no `--root` | `--root <dir>` → `rootDir = path.resolve(dir)`, default `null`; parsed with `args[i + 1]` like `--template`; usage header gets `  --root <dir>            Active worktree root; enables PF13 (Modify paths exist)` |
  | header check list | PF1–PF11 | adds `PF12 — Shared Modify paths in dependency order` and `PF13 — Modify path existence (under --root only)` |
  | `checkPF4(tasks)` | `{ id, status, message }` | `{ id, status, message, details }`; each nonexistent target pushes `{ taskRef: 'Task N', message: 'Task N: depends on nonexistent Task M', gateId: 'G12' }`; the cycle pushes `{ taskRef: 'Task a', message: 'Circular dependency: …', gateId: 'G3' }` (a = first task of the cycle); `details: []` on pass; `message` and `status` unchanged |
  | `checkPF11(content, subjectPattern)` | own rule body | `parsePlanCommit(content, subjectPattern)`; codes map to the existing PF11 texts: `length` → `` `is ${length} characters long (at most 72)` ``, `pattern-mismatch` → `does not match commit.subjectPattern`, the rest as in Task 1; pass and absent messages unchanged |
  | NEW `checkPF12(tasks)` | — | per task: `Modify` paths of `parseFilesEntries(taskSection(task.body))`, deps of `parseDependsOn(taskSection(task.body))`; for each path shared by Task i < Task j (by position in `tasks`), fail unless i reaches j or j reaches i through deps (transitive, cycle-safe visited set); detail `` { taskRef: 'Task j', message: '`<path>` is modified by Task i and Task j with no Depends on link between them', gateId: 'G4' } ``, one per (path, i, j); fail `message` = detail messages joined `'; '`; pass `message` = `No shared Modify paths without a dependency link`; `details: []` on pass |
  | NEW `checkPF13(tasks, rootDir)` | — | per task, per `Modify` path not containing `*`; the path is exempt only when a task in the transitive closure of this task's `Depends on` (its ancestors; same reachability walk as PF12) lists the same path as `Create`, so a path created by a non-ancestor task still fails; otherwise fail when `!fs.existsSync(path.resolve(rootDir, p))`; detail `` { taskRef: 'Task N', message: 'Modify path `<p>` does not exist under <rootDir>', gateId: 'G10' } ``; pass `message` = `All Modify paths exist under <rootDir>` |
  | check list | `PF1..PF7, PF11, [PF9], [PF10]` | `PF1..PF7, PF11, PF12, [PF13 when rootDir], [PF9], [PF10]` |
  | entry point | bare `try { … }` at module scope | the whole entry block inside `if (require.main === module) { … }`; then `module.exports = { checkPF4, checkPF11, checkPF12, checkPF13 };` |

  The markdown formatter is unchanged (it prints id, status, message; `details` is JSON-only).
- names: `--root`, `rootDir`, `checkPF12`, `checkPF13`, ids `PF12`, `PF13`, gate ids `G3`, `G4`, `G10`, `G12`.
- mirror: `checkPF3` (issue join), the `--template` branch of `parseArgs`, the `require.main` guard at the end of `skill/plan.js`.
- decisions: KD-2, KD-3; Deviations row "Item text PF11 → PF12, PF12 → PF13".
- sync: plan spec PF4, PF12, PF13 (D1); merge-lanes PF mapping (Task 6); SKILL.md Step 3 and Step 6.6 (Task 9); docs page (Task 10).
- dataset (`tests/promptfoo/datasets/plan-format-exec.yaml`): the three `'"total":\s*10'` assertions become `'"total":\s*11'`; the header comment says `PF1-PF13` and lists the two new fixtures; seven new cases appended at the end, each with `script_path: "repo://plugins/sdlc-utilities/scripts/ci/validate-plan-format.js"`:

  | description | project_root | script_args | assertions |
  |---|---|---|---|
  | `plan-format: PF12 flags shared Modify path without Depends on link` | `file://fixtures-fs/project-plan-shared-modify` | `--project-root {{project_root}} --file {{project_root}}/plans/test-plan.md --json` | javascript: the `PF12` check has `status === 'fail'`, `details[0].gateId === 'G4'`, `details[0].taskRef === 'Task 3'`, and its message contains `` `src/routes/index.js` `` |
  | `plan-format: PF12 passes when sharing tasks are transitively dependent` | `file://fixtures-fs/project-plan-shared-modify-ordered` | same | javascript: `PF12` `status === 'pass'` and `passed === true` |
  | `plan-format: PF13 flags missing Modify path under --root` | `file://fixtures-fs/project-valid-plan` | `--project-root {{project_root}} --file {{project_root}}/plans/test-plan.md --json --root {{project_root}}` | icontains `PF13`, icontains `src/routes/index.js`, regex `"gateId":\s*"G10"` |
  | `plan-format: PF13 not run without --root` | `file://fixtures-fs/project-valid-plan` | `--project-root {{project_root}} --file {{project_root}}/plans/test-plan.md --json` | not-icontains `PF13` |
  | `plan-format: PF4 details map missing target to G12` | `file://fixtures-fs/project-invalid-plan` | `--project-root {{project_root}} --file {{project_root}}/plans/bad-plan.md --json` | regex `"gateId":\s*"G12"` |
  | `plan-format: PF13 fails a Modify path created by a task outside the Depends on chain` | `file://fixtures-fs/project-plan-shared-modify` | `--project-root {{project_root}} --file {{project_root}}/plans/test-plan.md --json --root {{project_root}}` | javascript: the `PF13` check has `status === 'fail'` and a detail with `taskRef === 'Task 3'` whose message contains `` `src/utils/helper.js` `` (Task 1 creates it, but Task 3 has no `Depends on` edge to Task 1) |
  | `plan-format: PF13 skips a Modify path that a dependency creates` | `file://fixtures-fs/project-plan-shared-modify-ordered` | `--project-root {{project_root}} --file {{project_root}}/plans/test-plan.md --json --root {{project_root}}` | javascript: the `PF13` check has `status === 'fail'` (README.md and src/routes/index.js are absent), a detail mentioning `README.md`, and no detail message containing `src/utils/helper.js` |

- fixtures: `project-plan-shared-modify/plans/test-plan.md` = a byte copy of `project-valid-plan/plans/test-plan.md` with two lines changed in Task 3: `**Depends on:** Task 2` → `**Depends on:** none` and `` - Modify: `README.md` — add API endpoint documentation `` → `` - Modify: `src/routes/index.js` — add API endpoint documentation link ``, plus one line inserted directly after that Modify line: `` - Modify: `src/utils/helper.js` — export the format name `` (Task 1 creates that path; Task 3 has no `Depends on` edge to it, so PF13's exemption must not apply — the negative case). `project-plan-shared-modify-ordered/plans/test-plan.md` = a byte copy with one line inserted in Task 1's Files directly after `` - Test: `tests/utils/helper.test.js` ``: `` - Modify: `README.md` — mention the helper `` (Task 3 also modifies `README.md` and reaches Task 1 through Task 2), and one line inserted in Task 3's Files directly after its `README.md` Modify line: `` - Modify: `src/utils/helper.js` — export the format name `` (Task 1 creates that path; PF13's exemption). Both copies keep every other line, so PF1–PF11 pass on them.

**Acceptance criteria:**
- [ ] PF1–PF3, PF5–PF7, PF9–PF11 JSON entries are byte-identical for every existing case; PF4 differs only by the added `details` array.
- [ ] `node -e "const v=require('./plugins/sdlc-utilities/scripts/ci/validate-plan-format.js'); console.log(Object.keys(v).join(','))"` prints `checkPF4,checkPF11,checkPF12,checkPF13` and exits 0 without printing a report.
- [ ] V1: 41 passed, 0 failed (34 at b529982).

**Test proof:** Impact grep: `grep -rln 'validate-plan-format' plugins/sdlc-utilities/hooks plugins/sdlc-utilities/scripts tests/promptfoo/datasets` → `hooks/post-tool-validate.js` (no `--root`: gets PF12, not PF13), `ci/validate-plan-format.js`, `lib/plan-parse.js` (comment), `lib/setup-sections.js` (PF10 text only), `plan-format-exec.yaml` (b529982). Targeted run: V1, once (41 = 34 existing + 7 new). Mutation proof: at b529982 the 7 new cases fail (no PF12/PF13/`details`) and the 3 `total 11` assertions fail (10). Environment scrub: PF-ENV. Waits: each case's spawn returns when the validator exits; no timer.

### Task 3: plan.js prepare — four lanes from `LANE_DEFS`, `critiqueDir` (P22), `commit` (P23); delete the file-existence lane (W7.3 change 4, #9245)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — module skeleton with `LANE_DEFS`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `buildLanes`, warn loop, output fields
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/lane-file-existence-prompt.md` — delete the file (`git rm`)
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — T4a rewritten, 3 new cases

**Notes:**
The lane table moves to `plan-critique.js` so `merge-lanes` (Task 6) uses the same gate ids (KD-4). `critiqueDir` is created on every prepare run (with or without `--output-file`), never in `--mark` mode. The prompt file is listed as `Modify:` because a Files entry has no Delete kind; the change is a `git rm`.

**Contract:**
- shape (code):

  ```js
  // plugins/sdlc-utilities/scripts/lib/plan-critique.js (new; 'use strict'; node built-ins and ../lib, ./plan-parse only)
  const LANE_DEFS = [
    { name: 'static-structural',    model: 'haiku',  templateName: 'lane-static-structural-prompt.md',    gateIds: ['G1', 'G2', 'G7'] },
    { name: 'content-coverage',     model: 'sonnet', templateName: 'lane-content-coverage-prompt.md',     gateIds: ['G5', 'G6', 'G8', 'G9', 'G11', 'G13', 'G15', 'G16', 'G18', 'G19', 'G20', 'G21'] },
    { name: 'guardrail-compliance', model: 'sonnet', templateName: 'lane-guardrail-compliance-prompt.md', gateIds: ['G14'] },
  ];
  module.exports = { LANE_DEFS };   // Tasks 4–6 add their exports here
  ```

  | Site in `plan.js` | Before | After |
  |---|---|---|
  | requires | — | `const os = require('node:os');` and `const { LANE_DEFS } = require(path.join(LIB, 'plan-critique'));` |
  | `buildLanes` doc comment | `Five entries per KD1 lane partitioning. Entry [4] mirrors g17Dispatch verbatim.` | `Four entries per KD1 lane partitioning (G3, G4, G10, G12 are validator checks). Entry [3] mirrors g17Dispatch verbatim.` |
  | `buildLanes` body | local `laneDefs` array (4 objects incl. `file-existence`) | `LANE_DEFS.map(def => ({ … }))` with the same entry shape; the push comment `// Entry [4]: …` → `// Entry [3]: …` |
  | warn loop | `lanes.slice(0, 4).forEach(` | `lanes.slice(0, 3).forEach(` |
  | output | 12 keys | adds, after `lensReviewers`: `critiqueDir` (P22: `fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-plan-critique-'))`; on throw `null` plus `errors.push('Failed to create critiqueDir: <message>')`) and `commit` (P23: from `readSection(projectRoot, 'commit')` in a `try`; `{ subjectPattern: c.subjectPattern ?? null, subjectPatternError: c.subjectPatternError ?? null, allowedTypes: Array.isArray(c.allowedTypes) ? c.allowedTypes : null }`, all null when absent or unreadable) |

- names: `LANE_DEFS`, `critiqueDir`, `commit`, prefix `sdlc-plan-critique-`.
- mirror: `planTemplate` (P21, always-present object); the `readSection(projectRoot, 'plan')` try/catch in `main()`.
- decisions: KD-4, KD-9.
- sync: plan spec P16, P22 (D1), P23 (D2); SKILL.md Step 1, 3, 7 (Task 9).
- dataset (`tests/promptfoo/datasets/plan-prepare-exec.yaml`):
  - T4a (description starts `plan-prepare T4a:`) → description `plan-prepare T4a: lanes[] has exactly 4 entries with disjoint gateIds covering G1-G21 minus the validator gates (R35)`; its javascript asserts `data.lanes.length === 4`, names in order `static-structural,content-coverage,guardrail-compliance,dimension-coverage`, every entry's fields as today, disjoint gateIds, and the union equal to G1..G21 minus {G3, G4, G10, G12}.
  - NEW `plan-prepare T4d: critiqueDir is an absolute sdlc-plan-critique- temp directory (P22)` — fixture `plan-prepare-github-remote`, `script_cwd: "{{project_root}}"`; javascript: `path.isAbsolute(data.critiqueDir)` and `path.basename(data.critiqueDir).startsWith('sdlc-plan-critique-')`.
  - NEW `plan-prepare T4e: commit fields are null without a commit config (P23)` — same fixture; javascript: `data.commit` deep-equals `{ subjectPattern: null, subjectPatternError: null, allowedTypes: null }`.
  - NEW `plan-prepare T4f: commit carries the project commit config (P23)` — same fixture; an inline-JS `script_args` (pattern: the `plan-format PF11` cases and `commit-prepare-exec.yaml`'s `{{repo_root}}` spawn cases; spaces as `\x20`) writes `.sdlc/config.json` `{"commit":{"subjectPattern":"^fix: .+$","allowedTypes":["fix"]}}` in the cwd, spawns `node {{repo_root}}/plugins/sdlc-utilities/scripts/skill/plan.js --output-file` there, and prints the manifest JSON; javascript: `commit.subjectPattern === '^fix: .+$'`, `commit.allowedTypes` equals `['fix']`, `commit.subjectPatternError === null`. If the config loader requires more keys for that file (for example a config version), the case writes them too; it never edits an existing fixture.

**Acceptance criteria:**
- [ ] The prepare output's `lanes` has 4 entries named `static-structural,content-coverage,guardrail-compliance,dimension-coverage`, static gateIds `["G1","G2","G7"]`, no `file-existence`.
- [ ] The prepare output has `critiqueDir` (absolute, basename starting `sdlc-plan-critique-`) and `commit` with keys `subjectPattern`, `subjectPatternError`, `allowedTypes`.
- [ ] `lane-file-existence-prompt.md` no longer exists; `grep -c 'file-existence' plugins/sdlc-utilities/scripts/skill/plan.js` → `0`.
- [ ] `^plan-prepare` cases: 25 passed, 0 failed (22 at b529982).

**Test proof:** Impact grep: `grep -rln 'buildLanes\|lane-file-existence\|skill/plan.js' plugins/sdlc-utilities/hooks plugins/sdlc-utilities/scripts tests/promptfoo/datasets .claude/skills` → `skill/plan.js`, `scripts/README.md` (script table only), `plan-prepare-exec.yaml`, `plan-state-cleanup-exec.yaml` (comment), `check-consistency.js` (script map only) (b529982). Targeted run: V2 subset `^plan-prepare`, once (25 = T4a rewritten, T4d, T4e, T4f new, 21 others unchanged). Mutation proof: at b529982 T4a fails (5 lanes) and T4d/T4e/T4f fail (no `critiqueDir`/`commit`). Environment scrub: PF-ENV. Waits: each case's spawn returns when `plan.js` exits; no timer.

### Task 4: `plan.js diff-material` — material change by script (W7.3 change 3, diff-material)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `diffMaterial`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — subcommand dispatch, `diff-material`
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 3 `plan-diff:` cases
- Create: `tests/promptfoo/fixtures-fs/plan-diff-material/` — `before.md`, `after-wording.md`, `after-scope.md`

**Notes:**
This task adds the shared subcommand dispatch; Tasks 5 and 6 add one table entry each. Per-task comparisons skip added or removed tasks because `taskCount` already reports them (Deviations row).

**Contract:**
- shape (code): dispatch at the very top of `main()`, before `parseArgs` and the stdin read:

  ```js
  const SUBCOMMANDS = { 'diff-material': runDiffMaterial };   // Task 5 adds 'g17-prepare', Task 6 'merge-lanes'
  const sub = process.argv[2];
  if (Object.prototype.hasOwnProperty.call(SUBCOMMANDS, sub)) { runSubcommand(sub, process.argv.slice(3)); return; }
  ```

  `runSubcommand(sub, args)` parses `--<name> <value>` pairs (a value is taken when `i + 1 < args.length`, so `''` is accepted) and the boolean `--no-guardrails`, calls `SUBCOMMANDS[sub](flags)` and maps outcomes:

  | Condition | stdout | stderr | exit |
  |---|---|---|---|
  | handler returns `result` | `JSON.stringify(result, null, 2) + '\n'` | — | 0 |
  | unknown flag | — | `plan.js <sub> error: unknown flag <flag>` | 1 |
  | value flag last, with no value | — | `plan.js <sub> error: <flag> needs a value` | 1 |
  | required flag absent (checked by the handler) | — | `plan.js <sub> error: <flag> is required` | 1 |
  | handler throws an error with `code === 'USAGE'` (unreadable input, unknown lane/lens) | — | `plan.js <sub> error: <message>` | 1 |
  | any other throw | — | `plan.js <sub> error: <message>` | 2 |

  The usage header gains:

  ```
   *   node plan.js diff-material --before <path> --after <path>
   *   node plan.js g17-prepare --plan <path> --dimensions-dir <dir> --instructions-dir <dir> --learnings <path> [--window <days>] [--github-hosting true|false] [--root <dir>] [--today YYYY-MM-DD]
   *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>]
  ```

  `diffMaterial(beforeText, afterText)` → `{ material, triggers, details }`; an unreadable `--before`/`--after` file → usage error (exit 1). Each side is parsed with `extractTasksRaw`; per task `sec = taskSection(body)`; keys `'Task N'`. Triggers in this fixed order; one fires when its value differs:

  | Trigger | Value compared |
  |---|---|
  | `taskCount` | number of tasks |
  | `files` | per task (in both): sorted unique `"<kind>:<path>"` list of `parseFilesEntries(sec)` |
  | `contracts` | per task (in both): lines from the `**Contract:**` line to the line before the next line outside a fence that starts `**` or `#` or is `---` (walkLines), joined, trailing whitespace trimmed; null when absent |
  | `dependsOn` | per task (in both): `extractField(sec, 'Depends on')` |
  | `keyDecisions` | key set of `sectionBody(content, /^## Key Decisions\s*$/)`: table rows' first cell (header row and `|---` rows skipped), a bullet's bold lead `**…**` text, else its first 60 characters, and `### ` heading texts |
  | `openspec` | per task (in both): the `- ref:` value inside the `**openspec-task:**` block (`labelBlock`-style), or null |
  | `deviations` | first-cell set of the `## Deviations & assumptions` table (`sectionBody`), header row and `|---` rows skipped |

  `material` = `triggers.length > 0`. `details` has one key per fired trigger: `taskCount: { before, after }`; `files`/`contracts`/`dependsOn`/`openspec`: sorted `taskRef` list; `keyDecisions`/`deviations`: `{ added: [], removed: [] }`.
- names: `SUBCOMMANDS`, `runSubcommand`, `runDiffMaterial`, `diffMaterial`, flags `--before`, `--after`.
- mirror: the header usage block and exit-code line of `plan.js`; `plan-parse.js` `labelBlock`.
- decisions: KD-5, KD-6.
- sync: plan spec R64, R67 (D1); SKILL.md Step 6 (Task 9).
- dataset: three cases appended, `script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"`, `project_root: "file://fixtures-fs/plan-diff-material"`:

  | description | script_args | assertions |
  |---|---|---|
  | `plan-diff: wording-only edit is not material` | `diff-material --before {{project_root}}/before.md --after {{project_root}}/after-wording.md` | javascript: `material === false` and `triggers.length === 0` |
  | `plan-diff: added task and changed Files are material` | `diff-material --before {{project_root}}/before.md --after {{project_root}}/after-scope.md` | javascript: `material === true` and `triggers` deep-equals `['taskCount', 'files']` and `details.files` deep-equals `['Task 2']` |
  | `plan-diff: missing --after is a usage error` | `diff-material --before {{project_root}}/before.md` | icontains `--after` |

- fixtures: `before.md` = byte copy of `tests/promptfoo/fixtures-fs/project-valid-plan/plans/test-plan.md`. `after-wording.md` = `before.md` with one word added in Task 1's description sentence (`Create a utility module that exports` → `Create a small utility module that exports`). `after-scope.md` = `before.md` with Task 2's `` - Create: `src/routes/dates.js` `` → `` - Create: `src/routes/time.js` ``, and, after Task 3, an appended `---` line, a blank line and a `### Task 4: Add changelog entry` block (so the case exercises the separator) that copies Task 3's block with its title changed, `**Depends on:** Task 3` and its Modify line `` - Modify: `CHANGELOG.md` — add the endpoint ``.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/skill/plan.js diff-material --before X --after X` on any one plan prints `"material": false` and `"triggers": []` and exits 0 without reading stdin.
- [ ] The three `plan-diff:` cases pass.

**Test proof:** Impact grep: `grep -rn "process.argv\[2\]\|diff-material" plugins/sdlc-utilities/scripts/skill/plan.js` → no subcommand dispatch at b529982 (new surface; the prepare and `--mark` paths keep their argv). Targeted run: V2 subset `^plan-diff`, once (3 new). Mutation proof: at b529982 all 3 fail (`diff-material` is not a subcommand); dropping the `---` cut makes `added task and changed Files` report `contracts` too. Environment scrub: PF-ENV. Waits: each case's spawn returns when `plan.js` exits; no timer.

### Task 5: `plan.js g17-prepare` — G17 candidates by script (W7.3 change 3, g17-prepare)

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `g17Prepare`, `mirrorPath`, `rankCandidates`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `'g17-prepare'` subcommand entry
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 4 `plan-g17:` cases
- Create: `tests/promptfoo/fixtures-fs/plan-g17-prepare/` — `.sdlc/review-dimensions/code.md`, `.github/instructions/code.instructions.md`, `.sdlc/learnings/log.md`, `plans/plan.md`

**Notes:**
The criteria are ported literally from `g17-dimension-coverage-prompt.md` (C1–C6, U1–U6, Step H, Step I) as the item's predicates state them; `review.js` is only required, never edited. `--today` seeds the date so the deferral window needs no clock (GATE-9).

**Contract:**
- shape (code): `g17Prepare(opts)` with `opts = { planPath, dimensionsDir, instructionsDir, learningsPath, windowDays = 14, githubHosting = false, rootDir = process.cwd(), today = <current UTC date YYYY-MM-DD> }`; `--github-hosting` is `true` only for the string `true`; an unreadable `--plan` → usage error. Required flags are checked in the order `--plan`, `--dimensions-dir`, `--instructions-dir`, `--learnings`; the first missing one is reported. Requires `globToRegex` and `UNCOVERED_PATTERN_CATALOG` via `require(path.join(__dirname, '..', 'skill', 'review'))`, `extractFrontmatter`/`parseSimpleYaml` from `./yaml`. Steps:

  | Step | Rule |
  |---|---|
  | A | plan path set = Create + Modify paths (`parseFilesEntries(taskSection(body))`) of `extractTasksRaw(content)` tasks, content cut before `## OpenSpec Appendix`; unique, in order |
  | B | catalog = every `*.md` in `dimensionsDir` not starting `_`: `{ name, file: <basename>, triggers[], skipWhen[] (skip-when), severity }`; missing dir → empty |
  | C | `mirrorMap[name] = x` when `<instructionsDir>/<x>.instructions.md` exists for `x` ∈ {file basename without `.md`, `name`, `name` without a trailing `-review`} (first hit) |
  | D | path p covered by dimension d when any trigger matches (`globToRegex`) and no skip-when matches; `coveredDims` = `[{ name, file, paths }]` for dims with ≥1 path; `uncoveredPaths` = paths no dim covers |
  | C1 | for each first segment s of uncovered paths with ≥2 such paths and `s` not an existing directory under `rootDir`: fire on those paths, severity medium |
  | C2 | ≥3 uncovered Create paths share a `dirname`: medium |
  | C3 | uncovered path matches one of `**/auth/**`, `**/secret*`, `**/cred*`, `**/iam/**`, `**/crypto/**`, `**/pii/**`: high |
  | C4 | uncovered path matches one of `**/infra/**`, `**/terraform/**`, `**/*.tf`, `**/k8s/**`, `**/helm/**`, `**/docker*`, `**/Dockerfile*`: critical |
  | C5 | ≥5 uncovered paths across ≥2 first segments: medium |
  | C6 | exactly one uncovered path, not C3/C4, and plan path set size ≥2: low |
  | CREATE naming | the `dimension` of the first `UNCOVERED_PATTERN_CATALOG` entry whose `test` accepts any of the criterion's paths; else `<segment>-review` kebab-cased; triggers: `<topdir>/**` (C1, C5), `<dirname>/**` (C2), the first matching glob of the list in table order (C3, C4), the exact path (C6) |
  | U (per covered dim d, per plan path p that d does not cover, per trigger t) | U4: p's extension is a same-family variant of t's (`.js`↔`.mjs`/`.cjs`, `.ts`↔`.mts`/`.cts`/`.tsx`, `.yml`↔`.yaml`), low, wins over U1; U1: t with its extension swapped to p's matches p, medium; U2: `**/` + t matches p, medium; U3: t's literal directory prefix appears on a task line matching `/\b(rename|move)\b/i`, high; U5: t contains `**`, p starts with t's literal prefix (text before the first `*`), and neither U1 nor U4 fired for p, medium; U6: t has no glob character and ≥3 plan paths sit in `dirname(t)` without matching, medium. Doc-only suppression: no U fires when every plan path matches `docs/**`, `README*` or `*.md` outside `plugins/sdlc-utilities/skills/` |
  | patch | U1/U4 `` add trigger `<t with p's extension>` ``; U2 `` add trigger `**/<t>` ``; U3 `` update triggers naming `<dir>` after the rename ``; U5 `` widen trigger `<t>` to cover `<p>` ``; U6 `` replace trigger `<t>` with `<dirname(t)>/**` `` (first fired criterion's text) |
  | H | drop CREATE candidates when the plan path set has one path, unless C3 or C4 fired; group by `(kind, dimension)`: criteria union, paths union, severity = max |
  | I | read the last 100 lines of `learningsPath` (missing → none); headers `/^## (\d{4}-\d{2}-\d{2}) — harden-sdlc:/` dated within `windowDays` days before or on `today`; on the next 3 lines a `^Dimensions:\s*(.+)$` line split on commas, trimmed → `deferred`; a candidate whose dimension equals a deferred name, or equals it with or without `-review`, moves to `suppressed` `{ dimension, reason: 'deferred: harden-sdlc <date>' }` |
  | order | candidates ranked by `rankCandidates`: severity rank (`{critical:4, high:3, medium:2, low:1, info:0}`) DESC, `criteria.length` DESC, `dimension` ASC |

  Output:

  ```json
  { "planPaths": [], "coveredDims": [{ "name": "", "file": "", "paths": [] }], "uncoveredPaths": [],
    "firedCriteria": [{ "id": "C4", "kind": "CREATE", "dimension": "", "paths": [], "severity": "" }],
    "candidates": [{ "kind": "CREATE|UPDATE-path", "dimension": "", "criteria": [], "severity": "", "paths": [], "triggers": [], "patch": "", "copilotMirror": null }],
    "mirrorMap": {}, "deferred": [], "suppressed": [{ "dimension": "", "reason": "" }], "githubHosting": false }
  ```

  `triggers` only on CREATE, `patch` only on UPDATE-path. `copilotMirror = mirrorPath(kind, dimension, mirrorMap, githubHosting)`: null unless `githubHosting`; CREATE → `.github/instructions/<dimension>.instructions.md`; UPDATE → `.github/instructions/<mirrorMap[dimension]>.instructions.md` when mapped, else null.
- names: `g17Prepare`, `mirrorPath`, `rankCandidates`, `SEVERITY_RANK`.
- mirror: `analyzeUncoveredFiles` in `skill/review.js` (catalog use); the criteria text of `g17-dimension-coverage-prompt.md` Steps E, F, H, I at b529982.
- decisions: KD-7; Deviations rows "mirrorMap values", "g17-prepare fixture".
- sync: plan spec R31, R67 (D1); `merge-lanes` G17 (Task 6); G17 prompt (Task 7); SKILL.md Step 3 (Task 9).
- dataset: four cases appended, `script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"`, `project_root: "file://fixtures-fs/plan-g17-prepare"`, common args `G = g17-prepare --plan {{project_root}}/plans/plan.md --dimensions-dir {{project_root}}/.sdlc/review-dimensions --instructions-dir {{project_root}}/.github/instructions --learnings {{project_root}}/.sdlc/learnings/log.md --window 14 --github-hosting true --root {{project_root}} --today 2026-11-05`:

  | description | script_args | assertions (javascript on the JSON) |
  |---|---|---|
  | `plan-g17: C4 candidate ranked first with severity critical` | `G` | `candidates[0]` has `kind 'CREATE'`, `dimension 'infrastructure-review'`, `criteria` including `C4`, `severity 'critical'`, `triggers` deep-equal `['**/infra/**']` |
  | `plan-g17: U1 fires for the .ts path of a covered dimension` | `G` | a candidate `{ kind 'UPDATE-path', dimension 'code-review', criteria ['U1'], paths ['src/a.ts'], patch 'add trigger `src/**/*.ts`', copilotMirror '.github/instructions/code.instructions.md' }`; `mirrorMap['code-review'] === 'code'` |
  | `plan-g17: harden-sdlc deferral suppresses database-migrations-review` | `G` | `deferred` includes `database-migrations-review`; `suppressed[0].dimension === 'database-migrations-review'`; `candidates.length === 2` |
  | `plan-g17: missing --plan is a usage error` | `g17-prepare --dimensions-dir {{project_root}}/.sdlc/review-dimensions` | icontains `--plan` |

- fixture `plan-g17-prepare/`: `.sdlc/review-dimensions/code.md` = frontmatter `name: code-review`, `description: Code checks`, `severity: medium`, `triggers:` list with one item `"src/**/*.js"`, then a `# Code review` body line; `.github/instructions/code.instructions.md` = frontmatter `applyTo: "src/**/*.js"` and one body line; `.sdlc/learnings/log.md` = `## 2026-11-01 — harden-sdlc: database migrations` followed by the line `Dimensions: database-migrations-review`; `plans/plan.md` = a minimal plan whose tasks list, inside `**Files:**` blocks: Task 1 `` - Create: `infra/terraform/main.tf` ``; Task 2 `` - Create: `db/migrations/001.sql` `` and `` - Create: `db/migrations/002.sql` ``; Task 3 `` - Modify: `src/a.ts` `` and `` - Modify: `src/b.js` ``. No `infra/`, `db/` or `src/` directory exists in the fixture.

**Acceptance criteria:**
- [ ] On the fixture, `candidates` is `[CREATE infrastructure-review (C4, critical), UPDATE-path code-review (U1, medium)]` in that order, and `database-migrations-review` is in `deferred` and `suppressed`.
- [ ] The four `plan-g17:` cases pass.

**Test proof:** Impact grep: `grep -rln 'globToRegex\|UNCOVERED_PATTERN_CATALOG' plugins/sdlc-utilities/scripts` → `skill/review.js` (definition; required only, not edited). Targeted run: V2 subset `^plan-g17`, once (4 new). Mutation proof: at b529982 all 4 fail (no `g17-prepare`); without the deferral step the third case finds 3 candidates. Environment scrub: PF-ENV. Waits: each case's spawn returns when `plan.js` exits; the date comes from `--today` (seeded, no clock).

### Task 6: `plan.js merge-lanes` — lane, PF, lens and G17 merge; scorecard (W7.3 change 3, merge-lanes)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 2, Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `mergeLanes`, `renderScorecard`, `renderG17`
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `'merge-lanes'` subcommand entry
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — 8 `plan-merge:` cases
- Create: `tests/promptfoo/fixtures-fs/plan-merge-lanes/` — 8 JSON files plus `no-g17/` with 2

**Notes:**
The fixture leaves `content-coverage.json` out on purpose (the missing-lane case), and `no-g17/` holds the same static and PF files without `dimension-coverage.json` and `g17-prepare.json`, so two runs with the same arguments show that a missing G17 lane leaves `blockingCount` unchanged. G10 counts as covered only when the report holds PF13, so a caller that runs the validator without `--root` gets a "Gate G10 not evaluated" blocker by design (SKILL.md always passes `--root`).

**Contract:**
- shape (code): `mergeLanes({ dir, lanes = [], lenses = [], noGuardrails = false, gateAPath = null, inventoryPath = null })`. `--lanes`/`--lenses` are comma lists, empty entries dropped; `--lenses all` means `['all']`. Usage errors (Task 4's `runSubcommand` table; all exit 1, nothing on stdout):

  | Condition | stderr after `plan.js merge-lanes error: ` |
  |---|---|
  | no `--dir` | `--dir is required` |
  | `--lanes` and `--lenses` both empty or absent | `--lanes or --lenses is required` |
  | a lane name not in `LANE_DEFS` and not `dimension-coverage` | `unknown lane <name>` |
  | a lens name not in `architecture`, `requirements`, `risk`, `all` | `unknown lens <name>` |
  | `--inventory` or `--gate-a` given but unreadable or not JSON | `cannot read <flag> <path>` |

  | Part | Rule |
  |---|---|
  | lane files | `<dir>/<lane>.json`; valid = object with arrays `gateIds` and `issues` (dimension-coverage: array `candidates`); missing → reason `no result file`, unparseable or invalid → `invalid JSON`; a failure → `laneFailures` `{ lane, reason, advisory: false }` and a blocking issue `{ gateId: 'lane-failure', taskRef: null, severity: 'error', message: 'Lane <lane> failed: <reason> — gate IDs <ids joined ", "> not evaluated', blocking: true, lane }` (ids from `LANE_DEFS`); a parsed lane with `laneStatus !== 'ok'` → the same issue with reason `laneStatus <value>`; dimension-coverage failures are `advisory: true` with no issue |
  | lane issues | each lane issue gets `lane: <name>`; `passes` = union of lane `passes` |
  | `--no-guardrails` | adds lane `guardrail-compliance` = `{ gateIds: ['G14'], issues: [], passes: ['G14'], laneStatus: 'ok', guardrailCompliancePayload: 'No active guardrails configured.' }`; `guardrailCompliancePayload` = that lane's payload, else null |
  | PF (only when lanes non-empty) | `<dir>/pf-report.json`; missing/invalid → `laneFailures` `{ lane: 'validate-plan-format', reason, advisory: false }` and a blocking `lane-failure` issue naming `G3, G4, G10, G12`; per check in `PF_GATES = { PF4: ['G3','G12'], PF12: ['G4'], PF13: ['G10'] }` present in `checks`: its gates are covered; status `fail` → one issue per `details` item `{ gateId: d.gateId, taskRef: d.taskRef, message: d.message, severity: 'error', blocking: true, lane: 'validate-plan-format' }` (no `details` → one issue with the first gate, `taskRef: null`, the check message); status `pass` → its gates join `passes`. Other PF ids are ignored |
  | coverage (only when lanes non-empty; else `null`) | `expected` G1..G21; `covered` = union of parsed lane `gateIds`, G17 when `dimension-coverage.json` parsed, the PF gates; `missing` = expected − covered − {G17}; each missing gate → `{ gateId: <G>, taskRef: null, severity: 'error', message: 'Gate <G> not evaluated by any lane', blocking: true, lane: 'merge-lanes' }` |
  | lenses | `<dir>/lens-<name>.json`; valid = object with `status` ∈ {`Approved`, `Issues Found`} and array `issues`; invalid/missing → that lens `status: 'Issues Found'` plus one issue `{ taskRef: null, message: 'Lens <name> returned no valid JSON', severity: 'WARNING', dimension: null, blocking: true }`; every lens issue gets `gateId: null, lane: 'lens:<name>'`; `severity === 'CRITICAL'` → `blocking: true` (R41); `lens` = `{ status: 'Approved' iff every lens Approved, issues: <lens issues deduped>, recommendations: <union deduped by first 60 characters> }`, `null` when no lenses |
  | dedup | `prefix(m)` = `m.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)`; lane + PF + coverage issues by `(gateId, taskRef, prefix)`; lens issues by `(taskRef, prefix)`; then the union by `(taskRef, prefix)`; first occurrence wins; order: lane-file order of `--lanes`, PF, coverage, lenses in `--lenses` order |
  | G17 (only when lanes non-empty) | base = `<dir>/g17-prepare.json` `candidates` (missing/invalid → `[]` and `laneFailures` `{ lane: 'g17-prepare', reason, advisory: true }`); attach `why` from `dimension-coverage.json` candidates by `(kind, dimension)` (else `''`); add its `UPDATE-behavior` candidates whose `(kind, dimension)` is new and whose dimension is not in `deferred`; rank with `rankCandidates`; keep 3; `suppressed_count` = `suppressed.length` + the overflow; finding = `{ kind, dimension, criteria, severity_hint, why, triggers (CREATE), patch (UPDATE-*), actions: { dimension, copilot_mirror } }`: CREATE `` /setup-sdlc --dimensions — add `<dimension>` with triggers <triggers as `g` joined ", "> ``, UPDATE `` edit `.sdlc/review-dimensions/<file>` — <patch> `` (file from `coveredDims` by name, else `<dimension>.md`); `copilot_mirror` = `regenerate <mirrorPath(…)> per setup-sdlc/setup-dimensions.md Step 8 transform` when `mirrorPath` is non-null, else null; `g17Findings` = `{ findings, suppressed_count, rendering: renderG17(findings, suppressed_count) }`; when lanes are empty `g17Findings` is null |
  | `blockingCount` | count of `issues` with `blocking: true` (dimension-coverage never adds one) |
  | scorecard (only when lenses non-empty; else `null`) | `renderScorecard(lensResults, gateAFindings, inventory)` → `{ counts, traceability, verdict, markdown }` |

  `renderG17(findings, n)`: `''` when `findings` is empty; else `## Suggested Review Dimensions`, then per finding a block — heading `### CREATE: <dimension>` or `### UPDATE: <dimension> (<criteria joined ", ">)`, then the lines `**Why:** …`, `**Severity hint:** …`, `**Triggers:** …` (CREATE only, globs backticked, joined `, `), `**Patch:** …` (UPDATE only), `**Action (dimension):** …`, `**Action (Copilot mirror, X1):** …` (only when non-null) — every heading and line separated by one blank line; then `_<n> additional candidates suppressed_` when n > 0.

  `renderScorecard`: `counts` per dimension `Completeness`, `Correctness`, `Coherence` = `{ CRITICAL, WARNING, SUGGESTION, PASS }`, severities counted over lens issues with that `dimension`; `PASS` = number of lenses with status `Approved` and no issue in that dimension. `traceability`: with `--inventory` (JSON array of `{ reqId, name }`), one row per entry, `status`/`taskRefs` from the `traceability` entry of the `requirements` (or `all`) lens whose `requirement === reqId`, absent → `uncovered`, `[]`; without it, the lens rows as given. Verdict: any `CRITICAL` among lens issues and `--gate-a` `findings[].severity` → `…Fix before archiving.`; else any `WARNING` → `…Ready for archive (with noted improvements).`; else `All checks passed. Ready for archive.` `markdown`:

  ```markdown
  ## Verification Scorecard

  | Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
  |---|---|---|---|---|
  | Completeness | 0 | 1 | 0 | 1 |
  | Correctness | 1 | 0 | 0 | 2 |
  | Coherence | 0 | 0 | 0 | 2 |

  ### Traceability

  | Requirement | Covering task(s) | Status |
  |---|---|---|
  | REQ-3 Prepare G17 | — | uncovered |

  **Verdict:** …Fix before archiving.
  ```

  Without `--inventory` the line `*(Matrix built from requirements checklist — requirement inventory unavailable)*` and a blank line precede the traceability table. A row's first cell is `<requirement> <name>`; its second the `taskRefs` joined `, `, or `—` when empty.
- names: `mergeLanes`, `renderScorecard`, `renderG17`, `PF_GATES`, `EXPECTED_GATES`, flags `--dir`, `--lanes`, `--lenses`, `--no-guardrails`, `--gate-a`, `--inventory`.
- mirror: the SKILL.md Step 3 merge algorithm, Step 5 lens merge and Gate B assembly at b529982 (the rules being moved); `renderG17` follows the G17 prompt's rendering field rules at b529982.
- decisions: KD-1, KD-7, KD-8; Deviations rows "--lanes absent", "merge-lanes edge cases".
- sync: plan spec R35, R36, R40, R67 (D1); SKILL.md Steps 3–6 (Task 9).
- fixture `plan-merge-lanes/` (JSON, one object per file):
  - `static-structural.json`: `{"gateIds":["G1","G2","G7"],"issues":[],"passes":["G1","G2","G7"],"laneStatus":"ok"}`
  - `pf-report.json`: `checks` = PF4 `fail` with `details` `[{"taskRef":"Task 3","message":"Task 3: depends on nonexistent Task 9","gateId":"G12"},{"taskRef":"Task 1","message":"Circular dependency: Task 1 -> Task 2 -> Task 1","gateId":"G3"}]`, PF12 `pass` (`details: []`), PF13 `pass` (`details: []`), plus `passed:false` and a `summary`
  - `g17-prepare.json`: `githubHosting: true`, `mirrorMap: {"code-review":"code"}`, `coveredDims: [{"name":"code-review","file":"code.md","paths":["src/b.js"]}]`, `deferred: []`, `suppressed: [{"dimension":"database-migrations-review","reason":"deferred: harden-sdlc 2026-11-01"}]`, `candidates`: CREATE `infrastructure-review` (`["C4"]`, critical, `triggers ["**/infra/**"]`), CREATE `auth-review` (`["C3"]`, high, `triggers ["**/auth/**"]`), UPDATE-path `code-review` (`["U1"]`, medium, `patch "add trigger `src/**/*.ts`"`), CREATE `notes-review` (`["C6"]`, low, `triggers ["notes/x.txt"]`)
  - `dimension-coverage.json`: `{"candidates":[{"kind":"CREATE","dimension":"infrastructure-review","why":"Task 1 creates `infra/terraform/main.tf`, which no dimension covers."},{"kind":"UPDATE-behavior","dimension":"code-review","criteria":["B1"],"severity":"high","taskRefs":["Task 3"],"patch":"add a checklist item for CLI flag changes","why":"Task 3 adds a CLI flag in `src/b.js`."}]}`
  - `lens-architecture.json`: `{"status":"Approved","issues":[],"recommendations":["Name the merge helper after its lane."],"traceability":[]}`
  - `lens-requirements.json`: `{"status":"Approved","issues":[{"taskRef":"Task 2","message":"Acceptance does not name the 72-character limit — the executor may skip it","severity":"WARNING","dimension":"Completeness","blocking":false}],"recommendations":[],"traceability":[{"requirement":"REQ-1","name":"Merge lanes","status":"covered","taskRefs":["Task 1"]},{"requirement":"REQ-2","name":"Diff plans","status":"partial","taskRefs":["Task 2"]}]}`
  - `lens-risk.json`: `{"status":"Issues Found","issues":[{"taskRef":"Task 3","message":"Modify path is wrong — the worker edits a file that does not exist","severity":"CRITICAL","dimension":"Correctness","blocking":false}],"recommendations":[],"traceability":[]}`
  - `inventory.json`: `[{"reqId":"REQ-1","name":"Merge lanes"},{"reqId":"REQ-2","name":"Diff plans"},{"reqId":"REQ-3","name":"Prepare G17"}]`
  - `no-g17/static-structural.json` and `no-g17/pf-report.json`: byte copies of the two files above.
  - No `content-coverage.json`, `guardrail-compliance.json` or `gate-a.json` anywhere.
- dataset: eight cases appended, `script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"`, `project_root: "file://fixtures-fs/plan-merge-lanes"`; `D = {{project_root}}`:

  | description | script_args | assertions (javascript on the JSON unless noted) |
  |---|---|---|
  | `plan-merge: PF4 failures become blocking G3 and G12 issues` | `merge-lanes --dir D --lanes static-structural` | issues include `{gateId:'G12', taskRef:'Task 3', lane:'validate-plan-format', blocking:true}` and `{gateId:'G3', taskRef:'Task 1', …}`; `passes` includes `G4` and `G10` |
  | `plan-merge: missing content-coverage file gives lane-failure and 12 missing gates` | `merge-lanes --dir D --lanes static-structural,content-coverage --no-guardrails` | an issue `gateId 'lane-failure'`, `lane 'content-coverage'`, message starting `Lane content-coverage failed: no result file`; `coverage.missing` (sorted) equals `G5,G6,G8,G9,G11,G13,G15,G16,G18,G19,G20,G21` sorted the same way |
  | `plan-merge: missing dimension-coverage file is advisory` | `merge-lanes --dir D/no-g17 --lanes static-structural,dimension-coverage --no-guardrails` | `blockingCount === 14`; `laneFailures` has `{lane:'dimension-coverage', advisory:true}` and `{lane:'g17-prepare', advisory:true}`; no issue has `lane 'dimension-coverage'` |
  | `plan-merge: present dimension-coverage file keeps blockingCount 14` | `merge-lanes --dir D --lanes static-structural,dimension-coverage --no-guardrails` | `blockingCount === 14`; no `laneFailures` entry for `dimension-coverage` |
  | `plan-merge: --no-guardrails synthesizes the guardrail payload` | `merge-lanes --dir D --lanes static-structural --no-guardrails` | `guardrailCompliancePayload === 'No active guardrails configured.'`; `passes` includes `G14` |
  | `plan-merge: lens CRITICAL gives the Fix before archiving verdict` | `merge-lanes --dir D --lenses architecture,requirements,risk --inventory D/inventory.json` | `scorecard.verdict === '…Fix before archiving.'`; `scorecard.markdown` includes `| Completeness | 0 | 1 | 0 | 1 |`, `| Correctness | 1 | 0 | 0 | 2 |` and `| REQ-3 Prepare G17 | — | uncovered |`; `lens.status === 'Issues Found'`; `blockingCount === 1`; `coverage === null` |
  | `plan-merge: G17 findings ranked, capped and rendered` | `merge-lanes --dir D --lanes static-structural,dimension-coverage --no-guardrails` | `g17Findings.findings.map(f => f.dimension)` equals `['infrastructure-review','auth-review','code-review']`; `findings[0].why` starts `Task 1 creates`; `findings[2].kind === 'UPDATE-behavior'`; `suppressed_count === 3`; `rendering` includes `### UPDATE: code-review (B1)`, `regenerate .github/instructions/code.instructions.md` and `_3 additional candidates suppressed_` |
  | `plan-merge: unknown lane name is a usage error` | `merge-lanes --dir D --lanes nope` | (icontains) `unknown lane nope` |

  `blockingCount` 14 = 12 missing content-coverage gates + the 2 PF4 issues (G1, G2, G7 from the static lane; G14 synthesized; G3, G4, G10, G12 from PF; G17 excluded).

**Acceptance criteria:**
- [ ] `mergeLanes` output has exactly the keys `issues, passes, coverage, laneFailures, guardrailCompliancePayload, g17Findings, lens, scorecard, blockingCount`.
- [ ] The scorecard verdict labels are the three SKILL.md strings, byte for byte (`…Fix before archiving.` with U+2026).
- [ ] The eight `plan-merge:` cases pass; V2 total 40 passed.
- [ ] `node -e "console.log(Object.keys(require('./plugins/sdlc-utilities/scripts/lib/plan-critique.js')).sort().join(','))"` prints `EXPECTED_GATES,LANE_DEFS,PF_GATES,SEVERITY_RANK,diffMaterial,g17Prepare,mergeLanes,mirrorPath,rankCandidates,renderG17,renderScorecard`.

**Test proof:** Impact grep: `grep -rn 'merge-lanes' plugins/sdlc-utilities tests/promptfoo/datasets` → no hit at b529982 (new surface; SKILL.md callers come in Task 9). Targeted run: V2 subset `^plan-merge`, once (8 new); V2 in full (40) after this task. Mutation proof: at b529982 all 8 fail (no `merge-lanes`); counting G17 as blocking moves the advisory case off 14. Environment scrub: PF-ENV. Waits: each case's spawn returns when `plan.js` exits; no timer.

### Task 7: Static-lane and G17 prompts — G3/G12 out, G17 reduced to B1–B4 plus `why` (W7.3 changes 5–6)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/lane-static-structural-prompt.md` — gates G1, G2, G7
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/g17-dimension-coverage-prompt.md` — new prompt body, handling, variable table

**Notes:**
Deterministic G17 work moved to `g17-prepare` and `merge-lanes` (KD-7); leaving it in the prompt would let the model re-rank or re-render and disagree with the script.

**Contract:**
- shape (docs/prompt), `lane-static-structural-prompt.md`:

  | Line (by content) | After |
  |---|---|
  | `**Gates owned:** G1, G2, G3, G7, G12` | `**Gates owned:** G1, G2, G7` |
  | `These are pure dependency/coverage graph checks` | `These are requirement-coverage and scope checks` |
  | `**G3 — Dependency integrity:** …` (whole line and the blank line after it) | deleted |
  | `**G12 — Dependency target existence:** …` (whole line and the blank line before it) | deleted |
  | `"gateIds": ["G1", "G2", "G3", "G7", "G12"],` | `"gateIds": ["G1", "G2", "G7"],` |
  | `"passes": ["G2", "G3", "G7", "G12"],` | `"passes": ["G2", "G7"],` |
  | ``- G3, G12: always `"error"` (blocking) — circular or missing dependencies cannot be resolved autonomously`` (whole line) | deleted |
  | `**Do not evaluate G4, G5, G6, G8–G11, G13–G21 — those belong to other lanes.**` | `**Do not evaluate G3–G6 or G8–G21 — G3, G4, G10 and G12 are checked by \`validate-plan-format.js\` (PF4, PF12, PF13); the rest belong to other lanes.**` |

  `g17-dimension-coverage-prompt.md`: lines 1–13 and the `Agent tool:` / `subagent_type` / `description` / `model` / `prompt: |` lines stay; the **Purpose** line becomes `**Purpose:** Judge the behaviour criteria (B1–B4) and write one \`why\` sentence per review-dimension candidate. \`plan.js g17-prepare\` has already done the deterministic part, and \`plan.js merge-lanes\` ranks, caps and renders the result as the \`## Suggested Review Dimensions\` advisory block.` The prompt body (everything indented under `prompt: |`, up to the closing fence) becomes, indented by 4 spaces as now:

  ````text
  You are the Dimension Coverage subagent (G17). A script has already parsed the
  catalog, matched plan paths against trigger globs, evaluated C1–C6 and U1–U6,
  applied suppression and the learnings deferral. Your job is the part that needs
  judgment.

  **This gate is advisory (non-blocking).** Never fail or halt plan finalization.
  If you cannot complete a step, return `{"candidates":[]}`.

  ## Inputs

  - Plan file path: {PLAN_FILE_PATH}
  - Script result (g17-prepare): {FIRED_CRITERIA_JSON}
    Fields used here: `coveredDims` (`[{name, file, paths}]`), `candidates`
    (`[{kind, dimension, criteria, severity, paths, triggers?, patch?}]`), `deferred`.

  Skip `## OpenSpec Appendix` content.

  ## Step 1 — Behaviour criteria (B1–B4)

  Read `{PLAN_FILE_PATH}`. For each task whose Files paths appear in
  `coveredDims[i].paths`, apply these criteria to that task's text, against
  dimension `coveredDims[i].name`. Skip dimensions listed in `deferred`.

  <the four lines `- **B1**: …` to `- **B4**: …` of b529982, verbatim>

  <the line `**Pure-refactor suppression**: …` of b529982, verbatim>

  Each fired criterion yields
  `{"kind":"UPDATE-behavior","dimension":"<name>","criteria":["B1"],"severity":"<severity>","taskRefs":["Task 3"],"patch":"<one-line patch description>"}`.
  Merge it into an UPDATE-behavior candidate of the same dimension when one exists
  (union of criteria and taskRefs, the higher severity).

  ## Step 2 — Why

  For every script candidate and every Step 1 candidate, write one sentence `why`
  that cites a task number and a path or a quoted phrase from the plan.

  ## Output

  Return one fenced `json` block as the last content of your response:

  ```json
  {
    "candidates": [
      { "kind": "CREATE", "dimension": "<script candidate's dimension>", "why": "<one sentence>" },
      { "kind": "UPDATE-behavior", "dimension": "<name>", "criteria": ["B1"], "severity": "high", "taskRefs": ["Task 3"], "patch": "<one line>", "why": "<one sentence>" }
    ]
  }
  ```

  Script candidates carry only `kind`, `dimension` and `why`; do not change their
  criteria, severity, triggers or patch.

  ## DO NOT

  - Propose REMOVING any checklist item from an existing dimension (strengthen-only invariant).
  - Emit absolute GitHub blob URLs (use relative paths or slash commands only).
  ````

  `## Handling G17 Subagent Output` becomes three items: (1) write the fenced `json` block verbatim to `<ITER_DIR>/dimension-coverage.json` with the Write tool; (2) `plan.js merge-lanes` attaches each `why`, adds the UPDATE-behavior candidates, ranks, caps at 3 and renders — read `g17Findings` from `merged.json`; (3) on dispatch failure, timeout or no JSON, write nothing: merge-lanes records an advisory lane failure and builds the findings from the script candidates alone; log `## YYYY-MM-DD — plan-sdlc: G17 dispatch failed — <error summary>` to `.sdlc/learnings/log.md`; never block plan finalization (R31). `## Template Variable Reference` keeps two rows: `{PLAN_FILE_PATH}` (as now) and `{FIRED_CRITERIA_JSON}` | contents of `<ITER_DIR>/g17-prepare.json` | JSON object, verbatim.
- names: `{FIRED_CRITERIA_JSON}`, `UPDATE-behavior`, `why`.
- mirror: the b529982 text of both files; Task 5's output fields.
- decisions: KD-7.
- sync: SKILL.md Step 3 variable list (Task 9); plan spec R31 (D1).

**Acceptance criteria:**
- [ ] Static prompt: `grep -cE 'G3|G12' lane-static-structural-prompt.md` → `1` (only the closing "Do not evaluate" line).
- [ ] G17 prompt: `grep -c '{FIRED_CRITERIA_JSON}'` ≥ 2; `grep -cE 'Step [A-J] —|Self-check|minimatch|DIMENSIONS_DIR|COPILOT_DIR|LEARNINGS_LOG_PATH|PR_COMMIT_WINDOW|rendering'` → `0`; the four B lines and the suppression line are byte-identical to b529982.

**Test proof:** Impact grep: `grep -rln 'lane-static-structural-prompt\|g17-dimension-coverage-prompt' plugins tests/promptfoo/datasets .claude/skills docs/specs` → `skill/plan.js` (template names), `plan-sdlc.yaml`, `plan-prepare-exec.yaml` (path assertions), the plan spec (b529982); no case asserts the prompts' body text. Targeted run: the two acceptance greps and V4, once each (static checks; no exec case covers prompt text). Mutation proof: at b529982 `grep -cE 'G3|G12'` on the static prompt gives 6 and the G17 removal grep gives more than 0. Environment scrub: none needed (read-only greps). Waits: none; the behavioural `P1-fanout` case is written in Task 9, not run (brief).

### Task 8: Lens and reviewer prompts — one JSON output block (W7.3 change 7)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/lens-architecture-prompt.md` — Output section
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/lens-requirements-prompt.md` — Traceability and Output sections
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/lens-risk-prompt.md` — Output section
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-reviewer-prompt.md` — Output section, Handling Reviewer Output

**Notes:**
The Output text is identical in all four files (indented 4 spaces in the reviewer prompt's `prompt: |` block) so `merge-lanes` reads one shape (KD-8). The requirements lens has no "findings typically map" sentence, so it gets no Severity guidance line.

**Contract:**
- shape (docs/prompt): in `lens-architecture-prompt.md` and `lens-risk-prompt.md`, replace from the line `## Per-Check Severity Classification (for scorecard, Gate B)` to the end of the file with: one line `Severity guidance: <that file's sentence starting "Architecture findings typically map" / "Risk findings typically map", verbatim>`, a blank line, then the Output text below. In `lens-requirements-prompt.md`, under `## Traceability Output (for scorecard aggregation — Gate B, R40)` replace the lines from ``When `{REQUIREMENTS_JSON}` is NOT `"null"`, emit a `## Traceability Rows` block`` through `When \`{REQUIREMENTS_JSON}\` is \`"null"\`, omit the Traceability Rows block entirely.` (incl. the fenced `TRACEABILITY:` example) with the single paragraph:

  `Fill \`traceability\` with one entry per requirement: when \`{REQUIREMENTS_JSON}\` is not \`"null"\`, one per \`reqId\` — \`{ "requirement": "<reqId>", "name": "<name>", "status": "covered|partial|uncovered", "taskRefs": ["Task 2"] }\`; when it is \`"null"\`, one per numbered item in \`{REQUIREMENTS_CHECKLIST}\` with \`"requirement"\` = the item number as a string and \`"name"\` = the item text. \`taskRefs\` is \`[]\` when uncovered.`

  and replace from the line `Per-check severity classification (for scorecard dimension table):` to the end of the file with the Output text. In `plan-reviewer-prompt.md`, replace the lines from `    ## Output` to the recommendations bullet `    - [optional suggestions that improve the plan but are not blocking]` with the Output text indented by 4 spaces (it says: since `{LENS}=all`, fill `traceability` by the requirements-lens rule — append that sentence as the last field-rule bullet in this file only); in `## Handling Reviewer Output` replace `Main agent merges lens results:` with `\`plan.js merge-lanes --lenses\` merges lens results (SKILL.md Step 5):`. Output text:

  ````markdown
  ## Output

  Return one fenced `json` block as the last content of your response, with no prose after it:

  ```json
  {
    "status": "Approved",
    "issues": [
      { "taskRef": "Task 3", "message": "<specific issue> — <why it would cause execution failure>", "severity": "WARNING", "dimension": "Correctness", "blocking": false }
    ],
    "recommendations": ["<optional advisory suggestion within your focus areas>"],
    "traceability": []
  }
  ```

  Field rules:
  - `status` — `"Approved"` when no issue has `blocking: true`; otherwise `"Issues Found"`.
  - `issues[].taskRef` — `"Task N"`, or `null` for a plan-level issue.
  - `issues[].severity` — `CRITICAL`, `WARNING` or `SUGGESTION`; `issues[].dimension` — `Completeness`, `Correctness` or `Coherence`.
  - `issues[].blocking` — `true` only for execution blockers in your focus areas.
  - `recommendations` — advisory strings; `[]` when none.
  - `traceability` — filled only by the requirements lens (see Traceability Output); every other lens returns `[]`.
  ````
- names: `status`, `issues`, `recommendations`, `traceability`, `Severity guidance:`.
- mirror: the item's Output text (W7.3 change 7) verbatim.
- decisions: KD-8.
- sync: Task 6 lens parsing; SKILL.md Step 5 (Task 9); plan spec R36 (D1).

**Acceptance criteria:**
- [ ] `grep -c 'SEVERITY: CRITICAL|WARNING|SUGGESTION' <file>` → `0` and `grep -c '"traceability"' <file>` → `1` for each of the four files.
- [ ] `grep -c 'TRACEABILITY:' lens-requirements-prompt.md` → `0`.
- [ ] `grep -c '^Severity guidance: ' <file>` → `1` in lens-architecture and lens-risk, `0` in lens-requirements.

**Test proof:** Impact grep: `grep -rln 'lens-architecture-prompt\|lens-requirements-prompt\|lens-risk-prompt\|plan-reviewer-prompt' plugins tests/promptfoo/datasets .claude/skills docs/specs` → `skill/plan.js` (template names) and plan-sdlc `SKILL.md` (b529982); no case asserts the prompts' output text. Targeted run: the acceptance greps, once each (static checks); `plan-merge: lens CRITICAL …` (Task 6) pins the JSON shape merge-lanes reads. Mutation proof: at b529982 `SEVERITY: CRITICAL|WARNING|SUGGESTION` occurs in each lens file and `TRACEABILITY:` in the requirements lens. Environment scrub: none needed (read-only greps). Waits: none.

### Task 9: plan-sdlc SKILL.md — scripts in Steps 3, 5, 6, 6.6, 7; four lanes; behavioural fixtures and cases

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 2, Task 3, Task 4, Task 6, Task 7, Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — edits E1–E6, E8–E11
- Modify: `tests/promptfoo/fixtures/plan-orchestrator-dispatch.md` — lanes array
- Modify: `tests/promptfoo/fixtures/plan-sdlc-c2-material-change.md` — lanes array, expected dispatch prose
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — `P1-fanout` and c2 cases

**Notes:**
Edits go bottom-up (E1 first). Every R-anchor comment stays. The guardrail lane is skipped when `activeGuardrails` is empty (P7 resolved by the prepare script, `flag-resolution-single-source`); both fixtures have `"guardrails": []`, so the behavioural rubrics expect three lanes.

**Contract:**
- shape (docs/skill): edits to `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md`, anchors by content:

  | Edit | Anchor (exactly once) | Change |
  |---|---|---|
  | E1 | the `## Error Recovery` table row `| User approves but output path fails | …` | insert after it the row `| The run ends before Step 7 (error, stop or cancel) | Remove the critique directory: \`rm -rf "<critiqueDir>"\` (P22) |` |
  | E2 | `## Step 7: Handoff` heading | insert below it a paragraph `Remove the critique directory (P22) once, before the menu below; the plan file now holds every result:` and the block ```` ```bash ```` / `rm -rf "<critiqueDir>"` / ```` ``` ```` |
  | E3 | `[ -n "$TEMPLATE_PATH" ] && ARGS+=(--template "$TEMPLATE_PATH")` | insert the next line `ARGS+=(--root "$PWD")`; in the paragraph that starts `After link verification passes, run the deterministic plan format validator.` append the sentence `PF12 (shared Modify paths in dependency order) always runs; PF13 (Modify paths exist) runs because the block passes \`--root\`, the active worktree.` |
  | E4 | from the line `**Material change detection:** <!-- implements R64 -->` to the line starting `Wording-only, formatting-only, and metadata-only fixes` (incl.) | replaced by block MC below |
  | E5 | from the line `**Gate B — Verification Scorecard:** <!-- implements R40, R42, R44 -->` to the line starting `4. **Write the scorecard section**` (incl.) | replaced by block GB below |
  | E6 | from `**Merge lens reviewer results (per iteration):**` to the line starting `4. **Iteration counter**` (incl.) | replaced by block LM below |
  | E8 | `For each \`lensReviewers[i]\` entry (i = 0..2):` | `For each \`lensReviewers[]\` entry:`; and `For plans with <5 tasks, dispatch one reviewer with \`{LENS}=all\` using \`./plan-reviewer-prompt.md\`.` → append ` Its JSON goes to \`<ITER_DIR>/lens-all.json\` and merge-lanes runs with \`--lenses all\`.` |
  | E9 | the five Step 5 bullets starting `- **Dispatch contents:**`, `- **Await barrier:**`, `- **Merge:**`, `- **G17 on re-dispatch (advisory only):**`, and in `- **Guardrail-block gate preservation:**` the text `lanes[3] (guardrail-compliance) findings from the re-dispatch are scanned` | replaced by block RD below (four bullets) and the text `guardrail-compliance (G14) issues in the re-dispatch's \`merged.json\` are scanned` |
  | E10 | from the heading `## Step 3 (CRITIQUE): Self-Review Plan — 5-Lane Parallel Gate Evaluation <!-- R35 -->` to the line before `**Once-per-run checkpoints:**` | replaced by block S3 below |
  | E11 | in the G20 and G21 paragraphs, `Owned by the content-coverage lane (lanes[1]).` (2 hits; replace both) | `Owned by the content-coverage lane.` |

  (E7, E12 and E13 are Task 11.)

  Block S3 (E10):

  ````markdown
  ## Step 3 (CRITIQUE): Self-Review Plan — Four Lanes Plus Deterministic Checks <!-- R35 -->

  **Re-anchor:** Re-read the plan file before dispatching lanes. The file — not your memory of it — is the source of truth.

  G1–G21 are partitioned: the four lanes own the judgment gates (G20 and G21 in content-coverage); `validate-plan-format.js` owns G3 and G12 (PF4), G4 (PF12) and G10 (PF13). <!-- R35 -->

  **Iteration directory:** `<ITER_DIR>` is `<critiqueDir>/iter-0` at Step 3 and `<critiqueDir>/iter-<k>` at Step 5 iteration k (`critiqueDir` is P22). Do not add an EXIT trap: each Bash tool call is its own shell.

  **Deterministic checks (before the lane dispatch):**

  ```bash
  mkdir -p "<ITER_DIR>"
  ```

  ```bash
  node "<PLUGIN_ROOT>/scripts/ci/validate-plan-format.js" --json --file "<PLAN_PATH>" --root "$PWD" > "<ITER_DIR>/pf-report.json"
  ```

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" g17-prepare --plan "<PLAN_PATH>" --dimensions-dir .sdlc/review-dimensions --instructions-dir .github/instructions --learnings .sdlc/learnings/log.md --window 14 --github-hosting <githubHosting.detected> > "<ITER_DIR>/g17-prepare.json"
  ```

  Run each block as one plain Bash call and take its exit code from the tool result. Validator 0 or 1 is normal; validator 2, or any non-zero exit from g17-prepare or merge-lanes, means stop and invoke `error-report-sdlc`.

  **Fan-out dispatch:** Dispatch the Step 3 lanes from `lanes[]` (P16) in a SINGLE message as parallel Agent tool calls; skip `guardrail-compliance` when `activeGuardrails` is empty (merge-lanes synthesizes its constant result via `--no-guardrails`). Skip `dimension-coverage` when `g17-prepare.json` has empty `candidates` and empty `coveredDims`; write `{"candidates":[]}` to `<ITER_DIR>/dimension-coverage.json` with the Write tool instead. For each dispatched lane, `subagent_type`, `model` and the prompt body (read from `promptTemplatePath`) come verbatim from its `lanes[]` entry (`agent-dispatch-script-driven` guardrail). Template variables:
  - All lanes: `{PLAN_FILE_PATH}` (absolute path to the plan file), `{PROJECT_ROOT}` (cwd).
  - static-structural, content-coverage and guardrail-compliance: `{REQUIREMENTS_SUMMARY}` (the numbered requirements list from Step 1 CONSUME — same content as `{REQUIREMENTS_CHECKLIST}` in Step 5), `{ACTIVE_GUARDRAILS}` (from `guardrails[]` P7), `{OPENSPEC_TASKS}` (from `openspecContext.tasks` P13, null when not OpenSpec-sourced), `{BRIEF_FINDING_IDS}` (from the discovery brief, null when no brief).
  - content-coverage additionally: `{FORMAT_REFERENCE_PATH}` — `plan-format-reference.md` in the directory of that lane's `promptTemplatePath`; `{PLAN_TEMPLATE_PATH}` — `activeTemplatePath` from Step 0.
  - dimension-coverage: `{PLAN_FILE_PATH}`, `{FIRED_CRITERIA_JSON}` (contents of `<ITER_DIR>/g17-prepare.json`).

  **Null `promptTemplatePath`:** skip that lane's dispatch and write nothing for it; merge-lanes reports the missing result as a blocking lane failure (dimension-coverage: advisory, R31). For dimension-coverage also log `## YYYY-MM-DD — plan-sdlc: G17 skipped — promptTemplatePath null (template not found at prepare time)` to `.sdlc/learnings/log.md`.

  **No `isolation` parameter on lane dispatches:** lanes read the plan file by absolute path, and a worktree copy would read a stale or absent file.

  **Collect and merge:** Write each lane's final fenced `json` block verbatim to `<ITER_DIR>/<lane name>.json` with the Write tool (write nothing for a lane that returned nothing). Then run, listing every lane that was dispatched plus `dimension-coverage` when its file was written by hand:

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "<lane names, comma-separated>" [--no-guardrails] > "<ITER_DIR>/merged.json"
  ```

  Pass `--no-guardrails` exactly when `guardrail-compliance` was skipped. Run it as one plain Bash call; a non-zero exit code in the tool result means stop and invoke `error-report-sdlc`. Read `merged.json`: `issues` is the Step 3 issue list (blocking ones carry `blocking: true`); `guardrailCompliancePayload` feeds Step 4's `## Guardrail Compliance`; `g17Findings` feeds Step 4's `## Suggested Review Dimensions`. Do NOT write to the plan file in this step.

  **JOIN barrier — `guardrailsEvaluated`:** After `merge-lanes` has returned (with the guardrail-compliance result or its synthesized constant), record the checkpoint. <!-- implements R20, R35 -->

  ```bash
  # writes planIntegrity marker consumed by stop-plan-integrity Stop hook
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" --mark guardrailsEvaluated 2>/dev/null || true
  ```

  **JOIN barrier — `critiqueRan`:** After every dispatched lane has returned and `merged.json` has been read, record the checkpoint. **Do NOT write this marker before then.** <!-- implements R20, R35 -->

  ```bash
  # writes planIntegrity marker consumed by stop-plan-integrity Stop hook
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" --mark critiqueRan 2>/dev/null || true
  ```
  ````

  (The two `--mark` blocks are byte-identical to b529982.)

  Block RD (E9, the first four bullets):

  ````markdown
  - **Dispatch contents:** run the Step 3 deterministic-check block in this iteration's `<ITER_DIR>`, then dispatch the Step 3 lanes (same skip rules) and all `lensReviewers[]` (P17, or the single reviewer for <5-task plans) in one message. Each agent uses the dispatch parameters, template variables and model rules of Step 3 (lanes) and Step 5 (lenses).
  - **Await barrier:** do not consolidate or advance until exactly N = (lanes dispatched + M lenses) results are collected; if a dispatch is backgrounded, keep awaiting across completion notifications. Never consolidate on partial or zero returns. <!-- R-orchestrator-await, R-c1 -->
  - **Merge:** write each lane's JSON to `<ITER_DIR>/<lane name>.json` and each lens's to `<ITER_DIR>/lens-<lens>.json`, then run `merge-lanes` once with both `--lanes` and `--lenses` on that directory (plus `--inventory` and `--gate-a` as in the lens merge below). `issues` in `merged.json` is the unified blocking-issue set (lane, lens and cross-source dedup are done by the script).
  - **G17 on re-dispatch (advisory only):** `g17Findings` from the re-dispatch are not re-spliced into the plan (Step 4 has already run); keep them for scorecard reference only.
  ````

  Block LM (E6):

  ````markdown
  **Merge lens reviewer results (per iteration):** Write each lens's final fenced `json` block verbatim to `<ITER_DIR>/lens-<lens>.json` with the Write tool (`lens-all.json` for the single reviewer). Write `JSON.stringify(openspecContext.requirements)` once to `<critiqueDir>/inventory.json` when it is non-null, and Gate A's JSON to `<critiqueDir>/gate-a.json` when Gate A ran. Then run (omit an option whose file was not written):

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "" --lenses "<lens names dispatched, comma-separated, or all>" --inventory "<critiqueDir>/inventory.json" --gate-a "<critiqueDir>/gate-a.json" > "<ITER_DIR>/merged.json"
  ```

  Run it as one plain Bash call; a non-zero exit code in the tool result means stop and invoke `error-report-sdlc`. Use `lens` from `merged.json`: `lens.status` is the iteration status (`Approved` iff every lens is Approved), `lens.issues` the issues, `lens.recommendations` the recommendations. Increment the iteration counter by 1 only after the await barrier above is satisfied (exactly N lens results collected); never on partial or zero returns. <!-- R36, R-orchestrator-await, R-c1 -->
  ````

  Block GB (E5):

  ````markdown
  **Gate B — Verification Scorecard:** <!-- implements R40, R42, R44 -->

  Write `scorecard.markdown` from `merged.json` verbatim to the plan file, replacing any previous `## Verification Scorecard` section (regenerated each iteration, R44). Placement: immediately after the last Task block, or after `## Suggested Review Dimensions` when that section exists, or after `## Guardrail Compliance` if no Suggested Review Dimensions. The script builds the dimension table from the lens issues' `severity` and `dimension`, the traceability matrix (inventory rows with `--inventory`; otherwise the lens rows under the note *(Matrix built from requirements checklist — requirement inventory unavailable)*), and the verdict from lens and Gate A severities with the verbatim labels: any CRITICAL → *"…Fix before archiving."*; no CRITICAL, any WARNING → *"…Ready for archive (with noted improvements)."*; otherwise *"All checks passed. Ready for archive."* <!-- R40, R48, R51 -->
  ````

  Block MC (E4):

  ````markdown
  **Material change detection:** <!-- implements R64 -->

  Before rewriting the plan file, copy it:

  ```bash
  cp "<PLAN_PATH>" "<ITER_DIR>/plan-before.md"
  ```

  After the plan file is rewritten with the Step 6 fixes, run:

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" diff-material --before "<ITER_DIR>/plan-before.md" --after "<PLAN_PATH>"
  ```

  Set `materialChangeDetected` to its `material` value; on a non-zero exit set it to `true`. The script fires on a task added or removed, a task's Files, Contract or Depends on changed, a Key Decision added, removed or changed, an OpenSpec task mapping changed, or a Deviations row added or removed (R64's conservative superset). Wording, formatting and metadata-only fixes produce `material: false`. <!-- R64 -->
  ````
- names: `<ITER_DIR>`, `critiqueDir`, `merged.json`, `pf-report.json`, `g17-prepare.json`, `plan-before.md`, `{FIRED_CRITERIA_JSON}`.
- mirror: the W7.3 item's SKILL.md text (change 8) verbatim where it gives text; the b529982 SKILL.md for every kept sentence.
- decisions: KD-1, KD-5, KD-6, KD-9; Deviations rows "Prescribed block comment line", "lanes[N] in SKILL.md G20/G21 paragraphs".
- sync: plan spec R35, R36, R40, R56, R64, R66, P22, P23 (D1, D2); docs page (Task 10).
- fixtures and behavioural cases (written, not run):
  - `plan-orchestrator-dispatch.md` and `plan-sdlc-c2-material-change.md` `lanes` arrays: delete the `file-existence` row; static-structural `"gateIds": ["G1","G2","G7"]`.
  - `plan-sdlc-c2-material-change.md` expected-dispatch prose: `all 5 entries of \`lanes[]\` (static-structural, content-coverage, file-existence,` / `guardrail-compliance, dimension-coverage)` → `the Step 3 lanes of \`lanes[]\` except guardrail-compliance (no guardrails are configured): static-structural, content-coverage,` / `dimension-coverage`; `This is 8 total dispatched agents, awaited as one barrier (N = 5 lanes + 3 lenses = 8)` → `This is 6 total dispatched agents, awaited as one barrier (N = 3 lanes + 3 lenses = 6)`.
  - `plan-sdlc.yaml` `P1-fanout`: description `plan-sdlc: P1-fanout — Step 3 runs validate-plan-format.js and g17-prepare, then dispatches 3 lane Agents in a single message using lanes[]`; `user_request` lists the 4 lanes (no file-existence) and states the prepare output has no guardrails; rubric: "dispatches static-structural, content-coverage and dimension-coverage in one message, skips guardrail-compliance (no guardrails), after running validate-plan-format.js and g17-prepare; parameters come verbatim from lanes[]; merge-lanes merges the results; guardrailsEvaluated is written after merge-lanes returns and critiqueRan after every dispatched lane has returned; G3, G4, G10 and G12 are validator checks (PF4, PF12, PF13) and the lanes plus the validator cover G1–G21".
  - c2 case rubric: `ALL FIVE Step 3 \`lanes[]\` entries` → `the Step 3 \`lanes[]\` entries except guardrail-compliance (no guardrails)`; `all 8 results (5 lanes + 3 lenses)` → `all 6 results (3 lanes + 3 lenses)`.

**Acceptance criteria:**
- [ ] V8 counts hold.
- [ ] `grep -c 'plan.js" merge-lanes' SKILL.md` ≥ 2, `grep -c 'plan.js" diff-material' SKILL.md` → `1`, `grep -c 'plan.js" g17-prepare' SKILL.md` → `1`, `grep -c -- '--root "\$PWD"' SKILL.md` → `2`.
- [ ] V4 exits 0; `grep -c 'file-existence' tests/promptfoo/datasets/plan-sdlc.yaml tests/promptfoo/fixtures/plan-orchestrator-dispatch.md tests/promptfoo/fixtures/plan-sdlc-c2-material-change.md` → `0` for each.

**Test proof:** Impact grep: `grep -rln 'plan-sdlc/SKILL.md' tests/promptfoo/datasets .claude/skills` → `plan-sdlc.yaml` (behavioural, the two changed cases) and `execute-plan-sdlc.yaml` (unrelated path prefix) (b529982). Targeted run: V4, V8 and the acceptance greps, once each (static checks); the two behavioural cases are written, not run (V10). Mutation proof: the b529982 counts in V8 (10 `lanes[N]` lines, 12 five-form lines, 0 `critiqueDir`). Environment scrub: none needed (read-only greps and the offline consistency script). Waits: none.

### Task 10: docs/skills/plan-sdlc.md — four lanes, scripts, PF12/PF13 (W7.3 change 10)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 9
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — Step 3, Step 5, material change, markers, Gate B, PF list

**Notes:**
User-facing text follows the spec (D1, D2) and SKILL.md (Task 9); no new section.

**Contract:**
- shape (docs): substring replacements in `docs/skills/plan-sdlc.md`, each old text found exactly once (planner check at b529982):

  | Old | New |
  |---|---|
  | `**Step 3 — Critique (5-lane parallelized).**` | `**Step 3 — Critique (four lanes plus deterministic checks).**` |
  | `partitioned across five lanes and dispatched in a single message as parallel Agent calls — one subagent per lane. The lanes run concurrently; Step 3 completes only after **all five lanes have returned** (JOIN barrier).` | `partitioned: \`validate-plan-format.js\` checks G3 and G12 (PF4), G4 (PF12) and G10 (PF13), and \`plan.js g17-prepare\` pre-computes the G17 candidates; the four lanes (static-structural, content-coverage, guardrail-compliance, dimension-coverage) judge the rest and are dispatched in a single message as parallel Agent calls — one subagent per lane. The guardrail-compliance lane is skipped when no guardrails are configured. Step 3 completes only after **every dispatched lane has returned** (JOIN barrier), and \`plan.js merge-lanes\` merges the results.` |
  | `review dimensions are dispatched in parallel across the same five-lane structure, with each lane receiving` | `the lens reviewers are dispatched in parallel, with each lens receiving` |
  | `Step 5 completes only after **all five lanes have returned**` | `Step 5 completes only after **every dispatched lens has returned**` |
  | `the skill snapshots seven values before and after, per task where noted:` | `the skill copies the plan before the fix and runs \`plan.js diff-material\` on the two versions, which compares seven values, per task where noted:` |
  | the row starting `| \`guardrailsEvaluated\` |` | `| \`guardrailsEvaluated\` | End of Step 3 — fires once \`plan.js merge-lanes\` has merged the lane results (with or without the guardrail-compliance lane) |` |
  | the row starting `| \`critiqueRan\` |` | `| \`critiqueRan\` | After Step 3 JOIN barrier — fires when every dispatched lane has returned and \`merge-lanes\` has produced the merged result |` |
  | `At Step 5 (after the lens merge), plan-sdlc assembles a **\`## Verification Scorecard\`** section in the plan file.` | `At Step 5 (after the lens merge), \`plan.js merge-lanes\` builds the **\`## Verification Scorecard\`** section from the lens JSON results, and plan-sdlc writes it to the plan file verbatim.` |
  | `aggregated from lens findings that carry severity tags.` | `counted from the \`severity\` and \`dimension\` fields of each lens issue.` |
  | ``Lane 3 is the guardrail-compliance lane — `guardrailsEvaluated` fires when lane 3 returns. `critiqueRan` fires after all five lanes join.`` | `` `guardrailsEvaluated` fires once `plan.js merge-lanes` has merged the lane results; `critiqueRan` fires after every dispatched lane has returned. `` |
  | `re-dispatches all five Step 3 gate lanes (G1–G21)` | `re-runs the Step 3 deterministic checks and re-dispatches the Step 3 gate lanes (G1–G21)` |
  | ``the gate definitions, `buildLanes`, and the `{G1..G21}` union assertion are unchanged by the scorecard layer itself (R42)`` (F3) | ``the gate definitions, the lane union (plus the four PF-owned gates, R42), and the `{G1..G21}` union assertion are unchanged by the scorecard layer itself (R42)`` |

  After the `- **PF11** — …` bullet insert:

  ``- **PF12** — no two tasks modify the same path unless one depends on the other (directly or through other tasks). Runs on every plan; it replaces the former G4 lane check.``

  ``- **PF13** — every `Modify:` path exists in the active worktree, unless a task it depends on creates it. Runs only when the validator gets `--root`, which plan-sdlc passes at Step 3 and Step 6.6; it replaces the former G10 lane check.``
- names: bullets `**PF12**`, `**PF13**`.
- mirror: the PF11 bullet as it stands.
- decisions: KD-1, KD-2, KD-6.
- sync: plan spec (D1, D2); SKILL.md (Task 9); mirror commit M.

**Acceptance criteria:**
- [ ] `grep -ciE 'five|5-lane' docs/skills/plan-sdlc.md` → `0` (5 lines at b529982).
- [ ] `grep -cE '^- \*\*PF1[23]\*\*' docs/skills/plan-sdlc.md` → `2`; V4 exits 0.

**Test proof:** Impact grep: `grep -rln 'docs/skills/plan-sdlc' .claude/skills site/src/data` → no hit at b529982 (the page is mirrored only by commit M). Targeted run: the two acceptance greps and V4, once each (static checks), and V9. Mutation proof: at b529982 `grep -ciE 'five|5-lane'` gives 5 and the PF12/PF13 bullet grep gives 0. Environment scrub: none needed (read-only greps). Waits: none.

### Task 11: plan-sdlc SKILL.md — follow-up text: commit field, exploration heading, lens model (#9245, #9249, #9250)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 9
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — edits E7, E12, E13

**Notes:**
Three S follow-ups placed in W7.3 by rulings (they touch the same file). E7 keeps P17's sanctioned dispatch-time override ("main agent overrides at dispatch time for ≥5-task plans to enforce cross-model property"); plan.js cannot know the author's model, so the override stays in SKILL.md.

**Contract:**
- shape (docs/skill): edits to `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md`, anchors by content, applied bottom-up (E7, E12, E13):

  | Edit | Anchor (exactly once) | Change |
  |---|---|---|
  | E7 (#9250) | the line starting ``- `model`: `lensReviewers[i].model` (sonnet).`` | ``- `model`: `lensReviewers[i].model`, unless it equals the plan author's model; then dispatch the lens with the opposite model (opus ↔ sonnet), the dispatch-time override P17 allows, so every lens runs on the model opposite to the plan author. <!-- R36, R8, P17 -->`` |
  | E12 (#9245) | in the Step 1 `**Commit:**` bullet: `Form it from the request, the branch and \`.sdlc/config.json#commit\`:` and `matching \`commit.subjectPattern\` when set` | `Form it from the request, the branch and the prepare output's \`commit\` field (P23):` and `matching \`commit.subjectPattern\` when it is non-null` |
  | E13 (#9249) | `**Codebase exploration (skip for lightweight):** Use read-only tools (Glob, Grep, Read):` and `- Inline exploration (lightweight scope and error fallback included): Read, Glob and Grep calls that don't depend on each other go in one message. <!-- implements R37 -->` | `**Codebase exploration:** Use read-only tools (Glob, Grep, Read):` and `- Read, Glob and Grep calls that don't depend on each other go in one message (lightweight scope and error fallback included). <!-- implements R37 -->` |
- names: P23 `commit`; R36, R37.
- mirror: the b529982 lines named above.
- decisions: KD-12.
- sync: plan spec P17, R36, R66, P23 (D2).

**Acceptance criteria:**
- [ ] `grep -c 'skip for lightweight' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0`; `grep -c '(sonnet)' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0`; `grep -c "prepare output's \`commit\` field (P23)" plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `1`.
- [ ] V4 exits 0.

**Test proof:** Impact grep: `grep -rn 'skip for lightweight\|(sonnet)\|config.json#commit' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → the three lines E13, E7, E12 replace (b529982). Targeted run: the acceptance greps and V4, once each (static checks). Mutation proof: at b529982 the three greps give 1, 1 and 0. Environment scrub: none needed (read-only greps). Waits: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 1–6 carry exec cases (7 + 3 + 3 + 4 + 8 new; T4a and three `total` assertions updated); prompt and doc tasks carry grep proofs; behavioural rubrics updated (written, not run) |
| no-ci-bypass | error | PASS | No step skips or disables a check |
| no-auto-eval | error | PASS | Exec-only configs, targeted, each run once; no behavioural run (V10) |
| skill-docs-required | error | PASS | No new SKILL.md |
| no-scope-creep | warning | PASS | Follow-ups joined by ruling (Deviations row 4); `## Non-goals` lists what is left out |
| single-responsibility-tasks | warning | PASS | Step 3 flagged Task 9 for bundling three follow-up text fixes; they are now Task 11 |
| scripts-over-llm-logic | error | PASS | The wave moves merge, diff, G17 and scorecard logic into scripts (KD-1) |
| yagni | warning | PASS | Each new flag has a caller in SKILL.md or a test (`--today`) |
| cross-skill-consistency | error | PASS | PF11 and ship share one rule set (KD-3); execute's `parsePlan` is unchanged |
| pr-link-github-issue | error | PASS | #9257 and the follow-up ids are local todos; the PR body says so and links no issue |
| dry | warning | PASS | One lane table (KD-4), one `**Commit:**` rule set (KD-3), one `mirrorPath` helper |
| kiss | warning | PASS | Three subcommands in one module; no new dependency |
| spec-first | error | PASS | D1 and D2 precede the ship run |
| project-agnostic | error | PASS | All behaviour lives in plugin scripts, prompts and SKILL.md; repo-local edits are tests, docs and spec |
| flag-coherence-cross-skill | error | PASS | The commit subject comes from the prepare field P23; the guardrail skip from `activeGuardrails` (P7); `--github-hosting` from `githubHosting.detected` (P14) |
| no-opposite-logical-vectors | error | PASS | The lane skip rules are stated once in Step 3; the Step 5 re-dispatch refers to them ("same skip rules") |
| flag-resolution-single-source | warning | PASS | Same as flag-coherence |
| state-premise | error | PASS | Goal opens with the root problem |
| smallest-viable-cut | warning | PASS | KD-10 |
| failure-audience | warning | PASS | Goal names who fails |
| explicit-non-goals | warning | PASS | Step 3 flagged no non-goals list; `## Non-goals` added |
| ambiguity-stops-and-asks | error | PASS | Open choices are Key Decisions and Deviations rows |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic changes; `critiqueDir` is a fresh dir per run |
| agent-dispatch-script-driven | error | PASS | Lane and lens parameters come from `lanes[]`/`lensReviewers[]`. Step 3 flagged E7 (lens model override): kept, because P17 sanctions the dispatch-time override for the cross-model property and the prepare script cannot know the author's model (Task 11 Notes, KD-12) |
| flag-semantic-consistency-cross-skill | error | PASS | Step 3 flagged missing grep evidence; added as KD-12: of the 16 subcommand flags only `--plan` exists in another skill prepare script (`execute.js`, `ship.js`), with the same meaning (a plan file path) |
| workspace-mode-compatibility | error | PASS | Step 3 flagged the cwd-relative G17 reads; KD-9 now states the behaviour per mode |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to prompt bodies; `critiqueDir` and iteration paths stay out of dispatched prompts |

## Suggested Review Dimensions

Advisory (G17); not a task of this plan, and no dimension file is edited by it.

### UPDATE: runtime-contract (B1, B4)

**Why:** Tasks 2, 4, 5 and 6 add the validator's `--root` flag, PF12 and PF13, three `plan.js` subcommands and the prepare keys `critiqueDir` and `commit`, and a new `lib/plan-critique.js` that `plan.js` requires, so CLI and prepare-output contracts change.

**Severity hint:** high

**Patch:** add checklist items: new subcommands and flags keep the 0/1/2 exit codes and print to stdout; added prepare keys are documented in the spec; new `lib/` requires resolve through `path.join(__dirname, …)`

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — append the checklist items above (strengthen-only)

**Action (Copilot mirror, X1):** regenerate `.github/instructions/runtime-contract.instructions.md` per `setup-sdlc/setup-dimensions.md` Step 8 transform

### UPDATE: runtime-contract (U2, U5)

**Why:** the plan changes `scripts/lib/plan-critique.js`, `scripts/lib/plan-parse.js`, `scripts/skill/plan.js`, `scripts/skill/ship.js` and `scripts/ci/validate-plan-format.js`; the trigger `**/scripts/*.js` matches only direct children of `scripts/`.

**Severity hint:** medium

**Patch:** add trigger `**/scripts/**/*.js`

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — add the trigger above

**Action (Copilot mirror, X1):** regenerate `.github/instructions/runtime-contract.instructions.md` per `setup-sdlc/setup-dimensions.md` Step 8 transform

### UPDATE: hook-readiness (U2, U5)

**Why:** Task 2 changes `scripts/ci/validate-plan-format.js`, which the post-tool hook runs on every plan write (PF12 joins the default set); the trigger `**/scripts/*.js` does not match it.

**Severity hint:** medium

**Patch:** add trigger `**/scripts/**/*.js`

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — add the trigger above

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

Review: Step 3 ran five lanes (the installed 0.39.0 prepare output) and Step 4 fixed every blocking issue: G19 Tasks 4 and 6 (error tables rendered), G20 Tasks 2 and 7 (Notes rationale-only), G10 Tasks 4–6 (PF13 dependency-create exemption, a design fix), and G14 agent-dispatch / flag-semantic / workspace-mode (KD-9, KD-12, Task 11). Step 5 iteration 1: architecture, requirements and risk lenses (sonnet, the opposite of the opus author) all **Approved**; their advisory points were applied outside the Contracts (V8 baseline, Task 1 test-proof mapping, Task 3/6 Notes, Task 6 export check, executor notes), so no material change and no re-dispatch.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 1 | 2 | 1 |

### Traceability

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Parser helpers in lib/plan-parse.js | Task 1 | covered |
| 2 Validator --root, PF4 details, PF12, PF13, exports, total 11 | Task 2 | covered |
| 3 plan.js subcommands with logic in lib/plan-critique.js | Task 4, Task 5, Task 6 | covered |
| 4 Four lanes, prompt deleted, critiqueDir, slice(0,3) | Task 3 | covered |
| 5 Static lane prompt drops G3/G12 | Task 7 | covered |
| 6 G17 prompt B1–B4 plus why | Task 7 | covered |
| 7 Lens and reviewer prompts emit JSON | Task 8 | covered |
| 8 SKILL.md Steps 3, 5, 6, 6.6, 7; no lanes[N]; no five-lane text | Task 9 | covered |
| 9 Spec edits first | D1, D2 | covered |
| 10 docs/skills/plan-sdlc.md | Task 10 | covered |
| 11 Exec cases, fixtures, behavioural rubrics | Task 2, Task 3, Task 4, Task 5, Task 6, Task 9 | covered |
| 12 #9244 shared Commit-header rules | Task 1, Task 2 | covered |
| 13 #9245 P23 commit config | D2, Task 3, Task 11 | covered |
| 14 #9249 / #9250 SKILL.md text | Task 11 | covered |
| 15 #9255 spec R56(a) | D2 | covered |
| 16 Site mirror; Deviations rows for rulings 1–4 | commit M; Deviations | covered |

**Verdict:** …Ready for archive (with noted improvements).

---

## Final Shape

When the ship run and commit M are done:

- `validate-plan-format.js` checks PF1–PF13 (PF8 reserved). PF4 explains each failure per task with a gate id. PF12 runs on every plan. PF13 runs when plan-sdlc passes `--root`.
- `plan.js` prepares four lanes, a fresh `critiqueDir` and the project's commit config. It also answers three subcommands: `merge-lanes`, `diff-material` and `g17-prepare`.
- plan-sdlc's Step 3 runs two scripts, dispatches three or four lanes, writes their JSON to files and reads one merged result. Step 5 does the same for the lenses and writes the scorecard the script built. Step 6 decides "material" with a diff. Step 7 removes the critique directory.
- The G17 subagent runs only when there is something to judge, and judges only B1–B4 and the `why` text.
- The `**Commit:**` header rules live once, in `lib/plan-parse.js`; PF11 and ship read them from there.
- The spec, the docs page and the site mirror describe all of this.

## Follow-ups

1. review-sdlc spec `R-orchestrator-await` (a) has the same stale `run_in_background: false` clause as R56(a) (#9255's second half). New follow-up todo; place it in M8 wave 1 if that wave edits review-sdlc's spec, else M9-4 (ruling item 4).
2. Add the `sdlc-plan-critique-` prefix to the session-start `gcTempdirs` sweep, so a run that dies before Step 7 leaves no directory behind (hooks are outside W7.3's Files).
3. The three Suggested Review Dimensions above (dimension files are project config, outside this wave).

## Non-goals

These are intentionally NOT built in this wave:

- No change to execute, ship (beyond #9244's two-line call site), commit, pr, review or version skills.
- No W7.4, W7.5 or W7.8 work (wave 3).
- No plan-sdlc lightweight-path change, no change to the discovery orchestrator, no new lens.
- No temp-dir sweep in the session-start hook (Follow-up 2); no review-dimension edits (Follow-up 3).
- No behavioural or `claude plugin eval` run; no milestone close e2e.
- No change to gate definitions G1–G21 beyond the owner suffix; no PF id renumbering.

## OpenSpec Appendix

Not applicable — no OpenSpec change
