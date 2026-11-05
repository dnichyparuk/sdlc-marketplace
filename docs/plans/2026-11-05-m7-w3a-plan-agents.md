# M7 Wave 3a — Declarative Dispatch for plan-sdlc Lanes, Lenses, Reviewer and Gate A: Nine Plan Agents, --quality (#9268) Implementation Plan

**Commit:** `feat(#9268): plan-sdlc - plan agents, declarative dispatch, --quality`
**Goal:**
- The root problem: plan-sdlc's nine critique and review subagents are prompt files that `plan.js` finds at prepare time. The model then reads each file and fills its `{VARIABLES}` by hand. Three things go wrong:
  - model and effort live in `plan.js` constants, not in agent frontmatter, so `docs/cost-tiers.md` has no row for them and no effort is set;
  - when a template is missing next to `plan.js`, `plan.js` runs a `find ~/.claude/plugins` cascade and takes the highest version, which can pick a stale cached copy (#9196);
  - SKILL.md Steps 0, 3 and 5 carry long per-variable dispatch lists that the model must follow exactly.
- After this wave:
  - nine plugin agents under `plugins/sdlc-utilities/agents/` (`plan-lane-static`, `plan-lane-content`, `plan-lane-guardrail`, `plan-lane-g17`, `plan-lens-architecture`, `plan-lens-requirements`, `plan-lens-risk`, `plan-reviewer`, `plan-intake-verify`) carry the bodies, with `model` and `effort` in frontmatter and a row each in `docs/cost-tiers.md` §4;
  - the nine `*-prompt.md` files are deleted;
  - `plan.js` emits one dispatch shape `{ agent, agentPath, model, effort, inputNames, presetInputs }` for every lane, lens, the single reviewer (NEW `reviewerDispatch`, P25) and Gate A; it has no `promptTemplatePath` and no `find` fallback (#9196 closes);
  - SKILL.md dispatches with one rule: `subagent_type: entry.agent`, one `NAME: value` line per input;
  - plan-sdlc gains `--quality full|balanced|minimal` (A4), which sets the reviewer model and effort, emitted as `flags` (P24).
- Who fails if this ships wrong: every plan-sdlc full run. A wrong agent name or a missing agent file means a lane, lens or Gate A is never dispatched (a blocking lane failure, or a silently skipped Gate A); a wrong input list gives a subagent an empty `{NAME}`; a wrong `--quality` check stops every plan-sdlc run at prepare time.

**Architecture:** Three phases on branch `m7-w3a-9268-plan-agents`.

1. Direct commit D1 (section `## Direct commits`), before the ship run. It carries only spec text (spec-first, AGENTS.md §1): A4, R8, R31, R33, R35, R36, R39, P15, P16, P17, P20, NEW P24, NEW P25, I8.
2. ONE ship run: `/sdlc:ship-sdlc --plan docs/plans/2026-11-05-m7-w3a-plan-agents.md --steps execute,commit --rebase skip --quality balanced --auto`. execute-plan-sdlc runs Tasks 1–9; the commit step makes exactly one commit with the `**Commit:**` subject above (69 characters). The nine agent files and their cost-tiers rows are in that one commit.
3. Mirror commit M after the ship run (not a task; `## Executor notes`).

| Commit | Kind | Subject (exact; length) |
|---|---|---|
| D1 | direct, spec (W7.4 changes 4 and 5) | `docs(#9268): plan-sdlc - spec agent dispatch shape and --quality flag` (69) |
| S | ship commit (Tasks 1–9) | `feat(#9268): plan-sdlc - plan agents, declarative dispatch, --quality` (69) |
| M | direct, after ship (copy-docs mirror; not a task) | `docs(#9268): site - mirror plan-sdlc spec, docs, cost tiers, practices` (70) |

Every subject was checked with node against `.sdlc/config.json#commit.subjectPattern` (`^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`) and for length before this plan was written: all three match, all are at most 72 characters, none holds `"`, backtick, `$` or `\`. #9268 is a local tracking todo, not a GitHub issue: the PR body says "Tracking: todo #9268 (local, no GitHub issue)" and links no issue. #9196 (follow-up) closes with this PR; the PR body names it in the same local form.

Counts (split escape: about 30 entries or 25 commits, mirror excluded):
- Count basis: 31 entries / 31 raw paths, mirror excluded, nine prompt deletions counted; ruled by sdlc-arb-r2 ruling-w3-preflight item 1 and retro-ruled in /workspace/sdlc-marketplace/.sdlc/orchestration/m7/arb-note-w3a-count.md (a count above 31 entries during execution is a STOP to the arbiter).
- Count detail: **31 entries / 31 raw paths, mirror excluded; 32 / 32 with this plan file** (the ship commit carries it, as in waves 0–2). No fixture directory is added or edited, so entries equal raw paths. The nine prompt deletions count as entries.
  - 9 agent files (create) + 9 prompt files (delete) = 18;
  - `scripts/skill/plan.js`, `scripts/lib/plan-critique.js`, `skills/plan-sdlc/SKILL.md`, `docs/cost-tiers.md`, `docs/specs/plan-sdlc.md`, `docs/skills/plan-sdlc.md`, `docs/skill-best-practices.md` = 7;
  - `tests/promptfoo/datasets/plan-prepare-exec.yaml`, `tests/promptfoo/datasets/plan-sdlc.yaml`, `tests/promptfoo/scripts/test-plan-requirements-field.js`, and the fixtures `plan-orchestrator-dispatch.md`, `plan-sdlc-c2-material-change.md`, `plan-from-openspec-with-requirements.md` = 6.
  - M adds 4 mirror files (`site/src/content-source/{specs/plan-sdlc.md, skills/plan-sdlc.md, cost-tiers.md, skill-best-practices.md}`).
- 9 tasks; 2 commits for the PR's change (D1, S), 3 with M.
- Any Files entry beyond these 31 (32 with the plan file) is a STOP (orchestrator ruling on QUESTION 1).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-3a-plan-source.md (W7.4 verbatim, plan section 0, execution conventions, todo texts #9196 #9267 #9268), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/wave-3a-planner-brief.md (binding readings), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/preflight-w3.md (anchors at 1e10a02), /workspace/sdlc-marketplace/.sdlc/orchestration/m7/ruling-w3-preflight.md (rulings 1–9)

**Verification:**

Every command runs exactly as written, from the worktree root unless it starts with `cd`. PF-ENV: each promptfoo command runs in ONE Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`. `<export>` is a fresh JSON path under that `TMPDIR`. Baselines were produced at 1e10a02 by the planner with the same commands and env.

- (V1) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-prepare" -o <export>`: 29 passed, 0 failed (25 at 1e10a02; Task 4 rewrites T3d, T4a, T4b and the P20 case and adds 4 cases).
- (V2) `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "^plan-merge|^plan-diff|^plan-g17" -o <export>`: 19 passed, 0 failed (19 at 1e10a02; unchanged behaviour after the `LANE_DEFS` edit).
- (V3) `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --strict` exits 0 and prints no `MISSING_DOC`, `DRIFT` or `STALE_DOC` line (exit 0, no output at 1e10a02).
- (V4) `node .claude/skills/validate-plugin-consistency/check-consistency.js --project-root .` prints `✓ All consistency checks passed.` and exits 0 (same at 1e10a02). Rule 1b: no plugin-script resolver in `agents/*.md`.
- (V5) `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js --project-root . --markdown`: exit code and output identical to 1e10a02 (exit 1; a PD12 block with one line, `setup-sdlc/SKILL.md` → `AGENTS.md`, and a PD16 block with the six `ship-step-*` `frontmatter missing "tools"` lines); no line names `plan-`.
- (V6) `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0 and prints the 1e10a02 summary `0 error(s), 28 warning(s)`; no warning names `docs/skills/plan-sdlc.md`.
- (V7) `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` prints only the two LEGACY_SHAPE lines (received-review-sdlc, version-sdlc) and exits 0 (same at 1e10a02).
- (V8) One Bash call each: `ls plugins/sdlc-utilities/skills/plan-sdlc/*-prompt.md 2>/dev/null | wc -l` → `0` (9 at 1e10a02); `grep -c promptTemplatePath plugins/sdlc-utilities/scripts/skill/plan.js` → `0` (18); `grep -n "claude/plugins" plugins/sdlc-utilities/scripts/skill/plan.js` prints nothing (3 lines: :161, :185, :227); `ls plugins/sdlc-utilities/agents/plan-*.md | wc -l` → `10` (1: `plan-explore-orchestrator.md`).
- (V9) `grep -rnE 'promptTemplatePath|prompt_template_path|subagentType|-prompt\.md' plugins/sdlc-utilities/ tests/promptfoo/datasets/ tests/promptfoo/fixtures/ tests/promptfoo/scripts/ docs/specs/plan-sdlc.md docs/skills/plan-sdlc.md docs/cost-tiers.md docs/skill-best-practices.md` prints nothing (hits at 1e10a02 in plan.js, plan-critique.js, SKILL.md, the nine prompts, the spec, the docs page, skill-best-practices, the three fixtures, two datasets and the requirements-field script).
- (V10) `node --check` exits 0 for each of `plugins/sdlc-utilities/scripts/skill/plan.js`, `plugins/sdlc-utilities/scripts/lib/plan-critique.js`, `tests/promptfoo/scripts/test-plan-requirements-field.js` (one Bash call each).
- (V11) After the ship run: `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --project-root . --file docs/plans/2026-11-05-m7-w3a-plan-agents.md --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --markdown` exits 0 (no `--root`: Task 9 deletes paths this plan lists).
- (V12) Behavioural: the changed `P1-fanout`, `P2-fanout`, G17, Gate A and the three content-lane cases in `plan-sdlc.yaml` are written, NOT run (brief; ruling item 8). Record "not run (brief: written, not run)" in the PR body. No behavioural run, no `claude plugin eval`.

---

## Plan readings

Quoted from the binding sources:

- Brief: "Wave 3a of M7: item **W7.4** … ONE plan file and ONE PR. Also in this plan, as the arbiter ruled: `scripts/lib/plan-critique.js` joins the Files list (in `LANE_DEFS` drop `model` and `templateName`, keep `name` and `gateIds`, take the agent name from the lane entry)." → Task 4.
- Brief: "NOT in this plan: W7.5, W7.8, the close-e2e eval case and the follow-ups #9259, #9260, #9261 … anything on ship, execute, commit, pr, review, version". → no task touches them; see Explicit non-goals in Key Decisions.
- Brief: "Follow-up #9267 … include it as one line if it stays S; record the placement." → Task 7 (one row of `docs/skills/plan-sdlc.md`); placement: M7 wave 3a (was M9-4).
- Ruling item 3 / brief: "`flags: { quality, sources: { quality } }` … an enum check in `main` after `parseArgs` (invalid value goes to `errors[]`, exit 1), the new spec field **P24**, the SKILL.md `argument-hint` and the docs flags table. The P24 spec text goes into the spec direct commit." → D1 (A4, P24), Task 4, Task 5, Task 7.
- Ruling item 4 / brief: "`model` and `effort` are passed only when non-null in the entry; R36's cross-model sentence is edited together with R8. The nine agent files and their cost-tiers rows go in ONE commit." → D1 (R8, R36), Task 5, ship commit S.
- Brief: "`grep -n "claude/plugins" plugins/sdlc-utilities/scripts/skill/plan.js` must print nothing afterwards: the doc comment at about :161 goes too." → Task 4, V8.
- Brief: "The Step 5 text is NOT moved in this wave (that is W7.5). The fixtures and dataset rubrics that name `subagentType`/`promptTemplatePath` change together (pre-flight PROBLEMS 14)." → Task 5 edits Step 5 in place; Task 6.
- Brief: "Spec ids at the base … next free at 1e10a02: R68, A4, P24, I9, E9." Final ids used: **A4** (`--quality`), **P24** (`flags`), **P25** (`reviewerDispatch`; the item's "NEW P-field" without an id, P24 being taken by `flags` per ruling 3). R68, I9 and E9 are not used.
- Brief: "Every verification command uses `npx --yes promptfoo@0.123.1` … Exec-only configs only … the behavioural cases the item asks for in `plan-sdlc.yaml` are written or updated, NOT run." → V1, V2, V12. The item's "Single behavioral check: `--filter-pattern "P1-fanout"`" is not run (brief and ruling 8 override).
- Plan section 0 rule 2: locate every quoted line by content, exactly once, else STOP; multi-site edits bottom-up. Rule 3: only the Change. Rule 8: a Change that contradicts the code is a STOP.
- GATE-9: no test depends on a timer. Every exec case waits for one child process (the provider's spawn, or the case's own `spawnSync`, returning when `plan.js` exits); no assertion relies on a time limit.

---

## Context

**What problem does this change solve?**

plan-sdlc sends nine kinds of subagent: four critique lanes, three review lenses, one single reviewer and the Gate A intake audit. Today each is a prompt file in the skill folder.

- `plan.js` looks up each file at prepare time. If the file is not next to `plan.js`, it searches `~/.claude/plugins` with `find` and takes the highest version. After the fork swap, that search can return an old cached copy (#9196).
- The model (Claude) then reads each prompt file and replaces every `{VARIABLE}` itself. SKILL.md has long lists telling it how.
- The model and effort of each subagent are constants in `plan.js`. `docs/cost-tiers.md` lists no plan subagent, and no effort is set anywhere.

**What prompted this change now?**

W7.4 of the consolidated plan, re-planned on 2026-10-29 into M7 wave 3. Wave 3 was split at the item boundary (ruling-w3-preflight item 1): this is part 3a. Spike S1 (2026-10-19) confirmed that plugin agents dispatched by `subagent_type` run without prompts and honour `effort:` frontmatter.

**What does success look like?**

- Nine agent files exist, each with `model` and `effort`, and `docs/cost-tiers.md` has a row for each.
- No `*-prompt.md` remains under `skills/plan-sdlc/`.
- `plan.js` has no `promptTemplatePath` and no `claude/plugins` text.
- SKILL.md dispatches every plan subagent with one rule, and `--quality` picks the reviewer model and effort.

---

## Research Findings

- **`scripts/skill/plan.js` (747 lines at 1e10a02).** `parseArgs` (:63–80) knows `--from-openspec`, `--mark`, `--path`. The doc comment of `buildG17Dispatch` (:156–166) names `~/.claude/plugins`; `buildG17Dispatch` (:167–210) and `resolveSkillTemplate` (:216–248) each run `spawnSync('find', [HOME/.claude/plugins …])`. `buildIntakeAuditDispatch` (:251–257), `buildLanes(g17Dispatch)` (:265–284), `buildLensReviewers()` (:291–318). In `main`: `const errors = [];` (:518), the config-version early exit writes `{ errors, flags: { skipConfigCheck }, migration }` (:525), `openspecContext = { tasks: null, tasksUpdated: 0 }` gains `requirements` only under `--from-openspec`, `guardrails` from `readSection(projectRoot, 'plan')`, then the dispatch block (:670–697) with two null-template warn loops, then `critiqueDir` (:699–704), `commit` (:706–715) and the output object (:718–733). `spawnSync` stays in use by `runExplorePack` (:353). Every prepare run writes its JSON through `writeOutput` (`lib/output.js`: file under `<state dir>/out/`, path on stdout, then `process.exit(code)`).
- **`scripts/lib/plan-critique.js`.** `LANE_DEFS` (:8–12) carries `name`, `model`, `templateName`, `gateIds`. `mergeLanes` reads only `name` (:548) and `gateIds` (:571). It is exported (:662).
- **`scripts/lib/yaml.js`.** `extractFrontmatter(content)` (:23) returns the raw block or null; `parseSimpleYaml(str)` (:40) throws on null (`.split` at :42). Agent files are LF.
- **The nine prompt files.** Header lines to drop: `**Lane:**`, `**Gates owned:**`, `**Default model:**` (each lane); `**Default model:**` (each lens and `intake-verify`); g17's `**Model:**` and `**Dispatch parameters …**` block. g17 and the reviewer still wrap their prompt in a fence with `  prompt: |` (indented two spaces, body indented four) — the pre-flight's `grep '^prompt: |'` is anchored at column 0 and missed it, so the item's de-indent rule still applies. The reviewer prompt block uses `{LENS}` once (:102) and `{LENS_FOCUS}` once (:44). No prompt uses `{PROJECT_ROOT}` or any `<PLUGIN_ROOT>/scripts/` or `find ~/.claude/plugins` text.
- **Existing agents.** Frontmatter keys `name, description, tools, model, effort` (e.g. `commit-orchestrator.md`). Plugin name `sdlc`, so agents resolve as `sdlc:<name>`. No existing description contains `: `; a plain YAML scalar with `: ` would not parse in Claude Code, so the new descriptions avoid it.
- **`--quality` elsewhere.** `skill/execute.js` (`VALID_QUALITY`, message `Invalid --quality value "<v>"; expected one of full|balanced|minimal.`) and `skill/ship.js` (forwarded to execute only) use the same three values with the same meaning (model tier). `ship.js` has no plan step, so ship does not change.
- **Validators.** `validate-cost-tiers.js --strict` compares every agent file's `model` with its §4 row (MISSING_DOC both ways; effort is not read). `check-consistency.js` rule 1b forbids plugin-script resolvers in `agents/*.md`. `validate-discovery.js` flags agent files missing `tools`.
- **Tests.** `tests/promptfoo/providers/script-runner.js` splits `script_args` on whitespace (spaces inside one argument are written as `\x20`), reads the output file when stdout is a single temp/state path, and does not expose the exit code; T4f in `plan-prepare-exec.yaml` shows the inline `script_path: "-e"` pattern that spawns `plan.js` and prints what it needs. Baselines at 1e10a02: `^plan-prepare` 25 passed; `^plan-merge|^plan-diff|^plan-g17` 19 passed.
- **Docs and mirrors.** `site/src/content-source/` holds tracked mirrors of the spec, the docs page, `cost-tiers.md` and `skill-best-practices.md`; `node site/scripts/copy-docs.mjs` regenerates them (commit M).

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Wave split | no (ruled: ruling-w3-preflight item 1) | this plan is W7.4 plus `plan-critique.js` only; W7.5, W7.8, the close-e2e case and #9259/#9260/#9261 go to wave 3b | split escape; order W7.4 → W7.5 → W7.8 kept |
| `plan-critique.js` in Files | no (ruled: item 2) | `LANE_DEFS` drops `model` and `templateName`, keeps `name` and `gateIds`; the lane's agent name lives on the lane entry plan.js builds (a `LANE_AGENTS` map in plan.js) | model comes from frontmatter; the template no longer exists |
| `--quality` host | no (ruled: item 3) | plan.js gains a `flags: { quality, sources: { quality } }` output (P24); an invalid value writes `{ errors, flags }` and exits 1 before any other work (no `critiqueDir` is made) | the item assumed a `flags`/`sources` object that plan.js does not have (pre-flight PROBLEMS 4) |
| SKILL.md forwards `--quality` to plan.js | no | Step 0 adds one line: include `--quality <v>` in the `plan.js --output-file` call when plan-sdlc was given it | without it the flag never reaches the prepare script (flag-coherence: the resolved field is `flags.quality`) |
| Model/effort passing | no (ruled: item 4) | lanes and Gate A get no `model`/`effort`; lenses and the reviewer get `model: dispatchModel` / `effort: dispatchEffort` only when non-null; under `balanced` (`dispatchModel` null) `model: opus` only when the plan author ran on sonnet (R8) | item Change 2 and Change 5 state both halves |
| `agent-dispatch-script-driven` exception (guardrail `agent-dispatch-script-driven`, G14) | no (ruled: item 4; confirmed in `version-ok-w3a.md`, sdlc-arb-r2: one named site only, a second G14 failure is a STOP; follow-up todo #9269 to M9-4: plan.js takes the author model as an input, e.g. `--author-model`, so P25 carries the opposite-model choice and the exception retires) | under `balanced` the reviewers' `model: opus` (author on sonnet) is decided by SKILL.md, not by the prepare output (KD-7) | the item's Change 5 rule; plan.js cannot know the session model |
| R36 cross-model sentence | no (ruled: item 4) | edited in D1 with R8 | it repeats the fixed opposite-model rule R8 replaces |
| New spec ids | no | A4 `--quality`, P24 `flags`, P25 `reviewerDispatch` | ruling 3 names P24 for `flags`; the item's unnumbered `reviewerDispatch` takes the next free id |
| `prompt: |` wrapper rule | no | applied to g17 and the reviewer as the item says (body = the indented prompt text, de-indented by 4 spaces) | the wrapper exists at `  prompt: |`; the pre-flight's column-0 grep missed it (its MISSING verdict, pre-flight §2 row "body rule", is wrong) |
| Reviewer and g17 bodies get a `# ` title | no | `# Plan Reviewer` and `# G17 Dimension Coverage` head the bodies; the reviewer's `## Inputs` list is built from its `How to Fill` bullets (minus `{LENS}`/`{LENS_FOCUS}`) plus a `{GUARDRAILS}` bullet | the prompt text has no title; the reviewer prompt has no `## Inputs` section for the item's opening sentence |
| Reviewer focus line | no | the two lines `**Focus areas (this lens only):** {LENS_FOCUS}` and its `(When lens is …)` note become `**Focus areas:** all categories below.`; `- Since \`{LENS}=all\`, fill …` becomes `- Since the lens is \`all\`, fill …` | the item: fix `{LENS}` to `all`, remove `{LENS_FOCUS}` |
| `docs/skills/plan-sdlc.md:80` | no | `plan-reviewer-prompt gains` → `the plan-reviewer agent gains` | the prompt file is deleted; V9 would otherwise keep a stale `-prompt` name |
| #9267 joins | no (ruled: item 7; file in the Files list) | one row of `docs/skills/plan-sdlc.md` (critique directory) | S, file already edited |
| Gate A inputs | no | the four artifact inputs (`PROPOSAL`, `DELTA_SPECS`, `TASKS_MD`, `DESIGN`) are listed once, in the Step 3 run-time input table; Gate A points to it | the item puts them in that table; one list (dry) |
| Agent `effort` values | no (ruled: item 4) | from the item's table; tuning, not contract | effort is unchecked by the validator; kept in sync by hand |
| `validate-discovery.js` baseline | no | V5 expects the 1e10a02 output (exit 1, six `ship-step-*` lines) | the item's "no agent wiring issue" means no NEW line (pre-flight baseline note); the pre-flight's "exit 0" was measured through a pipe |
| One ship commit for Tasks 1–9 | no | Tasks 1–9 land in ONE ship commit; D1 and M stay separate | ship's commit step makes one commit per run from the plan header (R66); waves 0–2 shipped the same way |
| Discovery fan-out off | no (brief PLAN-4) | Step 1 explored inline; no discovery brief, so no `F-<DIM>-<n>` citations | PLAN-4 keeps discovery fan-out off; the brief keeps full critique and lens review on |
| Learnings log not appended | no (brief: edit only the plan file) | plan-sdlc's learning-capture append to `.sdlc/learnings/log.md` is skipped | the brief forbids any other edit |

### Review round 1

Isolated plan review `judge/m7-w3a-plan-review-1.md` (2 BLOCKING, 7 FIX, 6 NOTE); planner answers `planner-answers-w3a-2.md` (QUESTION 1: accept 31 entries as ruled; QUESTION 2: accept the R8 `model: opus` as a ruled exception, KD-7).

| Finding | Fixed at |
|---|---|
| B1 | Task 3 Acceptance (cost-tiers grep → `^\| plan-(lane\|lens\|reviewer\|intake)` = 9) |
| B2 | Task 6 table, G17-dispatch row and Gate A row (per-line quotes); Executor notes (folded-YAML line) |
| F1 | Verification V5 (PD12 and PD16 blocks named) |
| F2 | Verification V6 (`0 error(s), 28 warning(s)` baseline) |
| F3 | Architecture counts (STOP line: any entry beyond the 31) |
| F4 | D1 edit 6 (a) (R36 R8-author clause); Task 5 E9 ("including the R8 author rule") |
| F5 | Task 5 (bare-`\|` note under the E table; new E1 acceptance grep) |
| F6 | D1 edit 7 (b) (space-padded new text) |
| F7 | Task 9 Depends on (adds Task 7) |
| N1 | Task 5 Acceptance and Mutation (11 lines); Task 6 Mutation (18); Task 8 Mutation (V9 grep and V1 count) |
| N2 | Task 4 Test proof impact-grep list |
| N3–N6 | no plan edit (follow-ups in the done-file; N4 optional clause not applied) |
| Q1 | Architecture count-basis line (ruled by sdlc-arb-r2 ruling-w3-preflight item 1) |
| Q2 | no change (KD-7 stands as the ruled exception) |

---

## Key Decisions

- **KD-1 Agent name map in plan.js, not in `LANE_DEFS`.** The ruling keeps `LANE_DEFS` to `name` and `gateIds`. plan.js gets `LANE_AGENTS` (`static-structural` → `plan-lane-static`, `content-coverage` → `plan-lane-content`, `guardrail-compliance` → `plan-lane-guardrail`), and the dimension-coverage lane uses `plan-lane-g17`. Alternative: an `agent` key in `LANE_DEFS`. Rejected: the ruling says "take the agent name from the lane entry", and `merge-lanes` never needs the agent name.

- **KD-2 One dispatch builder.** `readAgent(name)` reads one agent file; `buildDispatch(name, preset)` adds `inputNames` (from one `INPUT_NAMES` table) and `presetInputs` (the preset values whose names are in that list). Lanes, lenses, the reviewer, G17 and Gate A all go through it. Alternative: five builders as today. Rejected: the shape is the same everywhere (dry, kiss).

- **KD-3 Invalid `--quality` exits before any other work.** The check runs right after `const errors = [];` and writes `{ errors, flags }` with exit 1. Alternative: push the error and finish the run (then exit 1). Rejected: that would create a `critiqueDir` and run plan-explore for a run that stops anyway.

- **KD-4 Presets live in plan.js as tuning.** `QUALITY_DISPATCH` (`full` → sonnet/low, `balanced` → null/null, `minimal` → opus/high) is a constant with a pointer to `docs/cost-tiers.md` §5; the spec names the table, not the values (AGENTS.md §1: tuning is not contract).

- **KD-5 Missing agent file = null `agentPath`, never a search.** `agentPath` is null when `agents/<name>.md` is absent; `model` and `effort` are then null. SKILL.md does not dispatch such an entry; merge-lanes reports a missing lane result as it does today. This is the #9196 fix: no cascade, no version pick.

- **KD-6 Deletions are their own tasks, last.** The nine `git rm` calls run after plan.js, SKILL.md and the tests stop naming the files (Tasks 8, 9), split 4 + 5 to keep each task at five files or fewer.

- **KD-7 The R8 author rule is a ruled exception to `agent-dispatch-script-driven`.** Under `balanced`, `dispatchModel` is null and SKILL.md passes `model: opus` only when the plan author ran on sonnet. `plan.js` cannot know the session model, so this one value cannot come from the prepare output. The item's Change 5 specifies this ("for `balanced` `dispatchModel` is null and SKILL.md applies the R8 author rule"), and ruling-w3-preflight item 4 accepted it ("`model` and `effort` are passed only when non-null … R36's cross-model sentence is edited together with R8"). The rule is bounded: it reads the prepare field (`dispatchModel === null`), adds only `model: opus`, and only for reviewers; lanes and Gate A never get a model. Alternative: have `plan.js` read plan-sdlc's own `model:` frontmatter and assume that is the author's model. Rejected: a session or ship agent can override the skill model, so the script would guess, and the item and the ruling did not ask for it. The Step 3 G14 lane flagged it (FAIL, error); it is recorded here as sanctioned by the ruling and shown as such in `## Guardrail Compliance`. The orchestrator may still overrule it (done-file QUESTION 2).

- **Smallest viable cut.** The item as ruled, nothing more. Tasks 6 and 7 (tests and docs) exist because the old field names are asserted and documented there (stale tests must change with behaviour); Task 7's #9267 row is one line in a file the item already edits.

- **Explicit non-goals.** No Step 5 move (W7.5); no `affectedLanes`/`--carry` (W7.8); no close-e2e eval case; no #9259/#9260/#9261; no change to `merge-lanes`, `diff-material`, `g17-prepare`, the gate wording G1–G21, `plan-format-reference.md`, `plan-explore-orchestrator.md`, the three Haiku orchestrators or the review-dimension format; no ship forwarding of `--quality`; no `skills-meta.ts` change.

---

## Contract Examples

Code (`plan.js` dispatch builder, Task 4):

```markdown
**Contract:**
- shape (code): `readAgent(name)` → `{ agent: 'sdlc:' + name, agentPath: string | null, model: string | null, effort: string | null }`
- names: `readAgent`, `buildDispatch`, `INPUT_NAMES`, `LANE_AGENTS`, `QUALITY_DISPATCH`, `VALID_QUALITY`
- mirror: `skill/ship.js` reads `model`/`effort` from `agents/ship-step-*.md`
- decisions: KD-2, KD-5
- sync: spec P15 (D1); SKILL.md dispatch rule (Task 5)
```

Docs (agent file, Tasks 1–2):

```markdown
**Contract:**
- shape (docs): frontmatter `name, description, tools, model, effort`; body = the prompt file minus the listed header lines; `## Inputs` opens with the fixed sentence
- names: the nine agent names
- mirror: `agents/commit-orchestrator.md` frontmatter
- decisions: copy bodies verbatim; descriptions without `: `
- sync: `docs/cost-tiers.md` §4 (Task 3)
```

Spec (D1):

```markdown
**Contract:**
- shape (spec): ADD A4, P24, P25; MODIFY R8, R31, R33, R35, R36, R39, P15, P16, P17, P20, I8
- names: A4 `--quality`; P24 `flags`; P25 `reviewerDispatch`
- mirror: P22/P23 line form
- decisions: preset values stay out of the spec (tuning)
- sync: Tasks 4, 5, 7
```

---

## Executor notes (carry-ins)

- Ship lines carry `--auto --rebase skip` (Architecture item 2). This wave does not use ship's `--tasks`/`--from-wave`: the ship run executes the whole plan.
- commit-sdlc's missing trailer is pre-answered: for D1 and M, if `/sdlc:commit-sdlc --auto --subject "<subject>"` stops on a missing required trailer, use the disclosed fallback `git commit -F <message file>` with the same subject and the session's attribution line, and name it in the PR body (W8.43 is not installed).
- The PR body has an `## Evidence` section; every evidence line carries `(at <sha7>)`.
- Mirror commit M (not a ship task): after the ship step, run `node site/scripts/copy-docs.mjs`, keep only `site/src/content-source/specs/plan-sdlc.md`, `site/src/content-source/skills/plan-sdlc.md`, `site/src/content-source/cost-tiers.md` and `site/src/content-source/skill-best-practices.md`, revert every other changed or new path (the copy-docs `plans/` mirror included), and commit M with its subject. Check: `git diff --cached --name-only` lists exactly those four paths.
- The installed plugin is 0.40.0: this plan's `**Commit:**` header line was written by plan-sdlc; tasks use `**Notes:**`.
- SAFE-12: execute workers change repo files only with the Edit and Write tools; Tasks 8 and 9 delete files with `git rm` (named in their Files). A shell in-place edit is a STOP.
- Fixture guard: no fixture `setup.sh` is added or edited; workers never run a fixture `setup.sh` by hand.
- Every quoted text is located by content with `grep -nF` and must occur exactly once (plan section 0 rule 2), else STOP; multi-site edits in one file go bottom-up. A backslash-backtick inside a quoted text is a backtick.
- In folded YAML scalars (`>` blocks in `plan-sdlc.yaml`), quotes are located per line.

## Direct commits (before the ship run)

This commit is NOT a plan task: ship and execute never run it (the plan's `### Task N:` headings are Tasks 1–9 only). The executor makes it alone, with the Edit tool, then `/sdlc:commit-sdlc --auto --subject "<subject>"` with only `docs/specs/plan-sdlc.md` staged.

ID check (run in ONE Bash call before and after D1):

```bash
export LC_ALL=C; b=$(git show 1e10a02:docs/specs/plan-sdlc.md | grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+|I[0-9]+)\b' | sort -u); h=$(grep -oE '^- (R[0-9]+|P[0-9]+|PF[0-9]+|G[0-9]+|A[0-9]+|E[0-9]+|I[0-9]+)\b' docs/specs/plan-sdlc.md | sort -u); echo "added=[$(comm -13 <(echo "$b") <(echo "$h") | tr '\n' ' ')] removed=[$(comm -23 <(echo "$b") <(echo "$h") | tr '\n' ' ')]"
```

Expected: before D1 `added=[] removed=[]`; after D1 `added=[- A4 - P24 - P25 ] removed=[]`. After D1 also: V7 holds; `git status --porcelain` shows only this plan file.

### D1: plan spec — agent dispatch shape, `--quality` (W7.4 changes 4 and 5)

- Subject: `docs(#9268): plan-sdlc - spec agent dispatch shape and --quality flag`
- File: `docs/specs/plan-sdlc.md` only. Edits (listed top-down; apply bottom-up):

1. After the line starting `- A3: `, insert:

   ``- A4: `--quality full|balanced|minimal` — plan-review quality preset: sets the model and effort of the Step 5 lens reviewers and the single reviewer (R8); resolved by `plan.js` into `flags` (P24); an invalid value is an `errors[]` entry and exit 1 (default: `balanced`)``

2. **R8**, replace the whole line starting `- R8: ` with:

   ``- R8: Plan review loop model rule: the Step 5 lens reviewers (plans with 5+ tasks) and the single reviewer (fewer than 5 tasks) run on the model and effort of the `--quality` preset (A4) — the "Plan quality presets" table in `docs/cost-tiers.md` §5 — which `plan.js` applies as `dispatchModel`/`dispatchEffort` on each reviewer entry (P17, P25); a null value means the agent file's own value. Under the default `balanced` preset `dispatchModel` is null and the reviewer runs on the model opposite to the plan author's (`opus` when the author ran on sonnet, otherwise the agent file's model). ≥1 reviewer per iteration; multi-reviewer fan-out within an iteration is permitted; iteration counter counts iterations, not reviewer dispatches; max 3 iterations``

3. **R31**, replace `loaded from \`plugins/sdlc-utilities/skills/plan-sdlc/g17-dimension-coverage-prompt.md\`` with `the plugin agent \`plugins/sdlc-utilities/agents/plan-lane-g17.md\` (dispatched from \`g17Dispatch\`, P15)`.

4. **R33**, replace the whole line starting `- R33 (P15 g17Dispatch metadata):` with:

   ``- R33 (P15 g17Dispatch metadata): `plan.js --output-file` MUST emit `g17Dispatch` in the agent-dispatch shape (P15) for the agent `sdlc:plan-lane-g17`. `agentPath` is the absolute path of `agents/plan-lane-g17.md` next to the running `plan.js` (`<plan.js dir>/../../agents/`), or null when that file is absent; no other location is searched. `model` and `effort` are read from that file's frontmatter. SKILL.md's Step 3 dispatch of the dimension-coverage lane MUST use `subagent_type: <entry>.agent` and build the prompt from `inputNames`/`presetInputs` (`agent-dispatch-script-driven` guardrail).``

5. **R35**, replace `Dispatch parameters (\`subagent_type\`, \`model\`, \`prompt_template_path\`) MUST be sourced verbatim from \`lanes[]\` (P16) per \`agent-dispatch-script-driven\` guardrail.` with:

   ``Each lane is a plugin agent (`agents/plan-lane-static.md`, `plan-lane-content.md`, `plan-lane-guardrail.md`, `plan-lane-g17.md`). The dispatch takes `subagent_type` from `lanes[i].agent` and sends one `NAME: value` line per name in `lanes[i].inputNames`, the value from `lanes[i].presetInputs` when present, otherwise from run-time context (`agent-dispatch-script-driven` guardrail); no `model` or `effort` is passed for a lane (the agent file sets both). A lane whose `agentPath` is null is not dispatched, and `merge-lanes` reports its missing result.``

6. **R36**, two substring edits on the line starting `- R36 (Step 5 multi-reviewer fan-out):` (bottom-up: (b) first):
   - (a) replace `Dispatch parameters (\`subagent_type\`, \`model\`, \`prompt_template_path\`, \`lens\`) MUST be sourced from \`lensReviewers[]\` (P17).` with ``Each lens is a plugin agent (`agents/plan-lens-architecture.md`, `plan-lens-requirements.md`, `plan-lens-risk.md`); `subagent_type` and the prompt inputs come from `lensReviewers[]` (P17) by the R35 rule, and `model`/`effort` are passed only when the entry's `dispatchModel`/`dispatchEffort` is non-null (R8); when `dispatchModel` is null (the `balanced` preset), the R8 author rule may add `model: opus`.``
   - (b) replace `Cross-model strategy: all lens reviewers use the opposite model from plan author. Plans <5 tasks: single same-model reviewer with \`{LENS}=all\` (status quo).` with ``Model strategy: R8. Plans <5 tasks: one reviewer, `reviewerDispatch` (P25, agent `agents/plan-reviewer.md`, lens `all`), dispatched by the same rule.``

7. **R39**, two substring edits on the line starting `- R39 (Gate A intake audit):` (bottom-up: (b) first):
   - (a) replace `dispatch one Gate A audit Agent using \`intake-verify-prompt.md\`.` with `dispatch one Gate A audit Agent, the plugin agent \`agents/plan-intake-verify.md\`.`
   - (b) replace `Agent dispatch parameters (\`subagentType\`, \`model\`) are sourced from \`intakeAuditDispatch\` (P20) — never hardcoded.` with `` `subagent_type` and the prompt inputs are sourced from `intakeAuditDispatch` (P20) — never hardcoded; `model` and `effort` come from the agent file. When `intakeAuditDispatch.agentPath` is null, Gate A is skipped with one note. `` (space-padded; the new text begins with `` `subagent_type` ``)

8. **P15**, replace the whole line starting `- P15: ` with:

   ``- P15: `g17Dispatch` (object) — per R33, in the agent-dispatch shape every dispatch entry uses (P16, P17, P20, P25): `{ agent: string, agentPath: string | null, model: string | null, effort: string | null, inputNames: string[], presetInputs: object }`. `agent` is `sdlc:<agent file name>`. `agentPath` is the absolute path of `agents/<name>.md` next to the running `plan.js`, null when the file is absent (no other location is searched). `model` and `effort` are read from that file's frontmatter, null when the file or its frontmatter is absent; they are kept for one release, and `docs/cost-tiers.md` stays the single source. `inputNames` lists the `NAME: value` lines the dispatch prompt carries. `presetInputs` holds the values `plan.js` computes, for the names in `inputNames` only: `FORMAT_REFERENCE_PATH` (absolute path of `skills/plan-sdlc/plan-format-reference.md`), `ACTIVE_GUARDRAILS` (`JSON.stringify(guardrails)`), `GUARDRAILS` (lines `- [id] (severity): description`, or `none configured`), `OPENSPEC_TASKS` (JSON of `openspecContext.tasks`; when null, `null` for the content lane and `none — plan not from OpenSpec` for lenses and the reviewer), `REQUIREMENTS_JSON` (JSON of `openspecContext.requirements`, or `null`), `LENS` and `LENS_FOCUS` (the focus categories as `- ` bullets). Agent `sdlc:plan-lane-g17`; inputs `PLAN_FILE_PATH`, `FIRED_CRITERIA_JSON`.``

9. **P16**, replace the whole line starting `- P16: ` with:

   ``- P16: `lanes` (array) — four entries per R35 KD1 lane partitioning. Shape per entry: the agent-dispatch shape (P15) plus `name: string` and `gateIds: string[]`. Lane order: [0] static-structural, agent `sdlc:plan-lane-static` (G1,G2,G7); [1] content-coverage, agent `sdlc:plan-lane-content` (G5,G6,G8,G9,G11,G13,G15,G16,G18,G19,G20,G21); [2] guardrail-compliance, agent `sdlc:plan-lane-guardrail` (G14); [3] dimension-coverage (G17 — mirrors `g17Dispatch` verbatim). An entry with a null `agentPath` is well-formed (all other fields populated); SKILL.md does not dispatch it and `merge-lanes` reports the missing result as `laneStatus: "failed"` (dimension-coverage: advisory, R31).``

10. **P17**, replace the whole line starting `- P17: ` with:

    ``- P17: `lensReviewers` (array) — three entries per R36 KD3 lens partitioning. Shape per entry: the agent-dispatch shape (P15) plus `lens: "architecture"|"requirements"|"risk"`, `focusCategories: string[]`, `dispatchModel: string | null` and `dispatchEffort: string | null`. Lens order: [0] architecture, agent `sdlc:plan-lens-architecture` (focusCategories: Buildability, Task descriptions, Decision documentation, Dependency accuracy), [1] requirements, agent `sdlc:plan-lens-requirements` (focusCategories: Requirements coverage, Metadata completeness, Plan completeness, OpenSpec G16, Exploration provenance, Best-practice traceability), [2] risk, agent `sdlc:plan-lens-risk` (focusCategories: File paths, Verification strategy, Scope discipline, Guardrail compliance). `dispatchModel`/`dispatchEffort` come from the `--quality` preset (P24, R8); null means use the agent file's value, and under `balanced` SKILL.md applies the R8 author rule to the model.``

11. **P20**, replace the whole line starting `- P20: ` with:

    ``- P20: `intakeAuditDispatch` (object) — the Gate A intake audit dispatch (R39) in the agent-dispatch shape (P15). Agent `sdlc:plan-intake-verify`; inputs `PROPOSAL`, `DELTA_SPECS`, `TASKS_MD`, `DESIGN`, `REQUIREMENTS_JSON`. SKILL.md's Gate A dispatch MUST use `intakeAuditDispatch.agent` and its inputs verbatim and pass no `model` or `effort` (`agent-dispatch-script-driven` guardrail).``

12. After the line starting `- P23: `, insert two lines:

    ``- P24: `flags` (object) — `{ quality: "full"|"balanced"|"minimal", sources: { quality: "cli"|"default" } }` (A4). `quality` is the `--quality` value, or `balanced` when the flag is absent (`sources.quality` is then `default`). An invalid value is not resolved: the output is `{ errors, flags }` only, `errors` holds one entry `Invalid --quality value "<v>"; expected one of full|balanced|minimal.`, and `plan.js` exits 1 before any other prepare work (no `critiqueDir`).``

    ``- P25: `reviewerDispatch` (object) — the single plan reviewer for plans with fewer than 5 tasks (R36), in the agent-dispatch shape (P15) plus `lens: "all"`, `dispatchModel` and `dispatchEffort` (as P17). Agent `sdlc:plan-reviewer`; inputs `PLAN_FILE_PATH`, `REQUIREMENTS_CHECKLIST`, `SOURCE_REQUIREMENTS`, `BRIEF_FILE`, `OPENSPEC_TASKS`, `REQUIREMENTS_JSON`, `GUARDRAILS`.``

13. **I8**, replace the whole line starting `- I8: ` with:

    ``- I8: `agents/plan-intake-verify.md` — Gate A intake audit agent. Dispatched from `intakeAuditDispatch` (P20). Inputs: `PROPOSAL`, `DELTA_SPECS`, `TASKS_MD`, `DESIGN`, `REQUIREMENTS_JSON`. Output: structured JSON with `findings`, `verdict`, `skipped`.``

- Check (one Bash call each): `grep -cE 'promptTemplatePath|prompt_template_path|subagentType|-prompt\.md|find. cascade' docs/specs/plan-sdlc.md` → `0`; `grep -cE '^- (A4|P24|P25): ' docs/specs/plan-sdlc.md` → `3`; `grep -c 'opposite model from plan author' docs/specs/plan-sdlc.md` → `0`.

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 4 and 6 add 4 exec cases and update T3d, T4a, T4b, the P20 case, the rubrics and the fixtures. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only exec-only configs are run (V1, V2). Behavioural cases are written, not run (V12). No retry loops. |
| skill-docs-required | error | PASS | No SKILL.md is created. The existing plan-sdlc SKILL.md is edited and its docs are updated in Task 7. |
| no-scope-creep | warning | PASS | Every task maps to W7.4 plus the ruled additions (plan-critique.js, #9267). Non-goals are listed. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable. Task 4 spans plan.js, LANE_DEFS and their tests but is one dispatch-shape change. |
| scripts-over-llm-logic | error | PASS | Dispatch metadata, model/effort and the --quality presets moved into plan.js. SKILL.md keeps one short rule. |
| yagni | warning | PASS | Only the needed shape is added. Presets are constants, and no speculative abstraction is introduced. |
| cross-skill-consistency | error | PASS | `--quality` semantics match execute.js and ship.js. Ship is deliberately unchanged, with rationale. |
| pr-link-github-issue | error | PASS | #9268 is a local todo, not a GitHub issue. The plan states the PR body carries a local tracking note and links no issue. |
| dry | warning | PASS | One `buildDispatch` builder and one `INPUT_NAMES` table replace five builders. The run-time input table is written once. |
| kiss | warning | PASS | The simplest shape is used: one builder, an enum check, and constants. |
| spec-first | error | PASS | D1 updates the spec (A4, R8, R31, R33, R35, R36, R39, P15–P17, P20, P24, P25, I8) before the ship run. SKILL.md follows. |
| project-agnostic | error | PASS | Changes are in plugin code (agents, plan.js, SKILL.md) that ships to consumers. Repo docs and mirrors are the plugin's own documentation. |
| flag-coherence-cross-skill | error | PASS | SKILL.md Step 0 forwards `--quality` to plan.js. Downstream sites cite the resolved `flags.quality` and `dispatchModel`/`dispatchEffort`. |
| no-opposite-logical-vectors | error | PASS | The dispatch rule is phrased identically at the Gate A, lane and lens sites (`subagent_type: entry.agent`, NAME: value lines). |
| flag-resolution-single-source | warning | PASS | `--quality` is resolved once in plan.js (P24). Consumers read `flags.quality` and the dispatch fields. |
| state-premise | error | PASS | The root problem is stated in Goal and Context. |
| smallest-viable-cut | warning | PASS | The Key Decisions section names the smallest cut and justifies the extra tasks. |
| failure-audience | warning | PASS | The Goal section says who fails: every plan-sdlc full run. |
| explicit-non-goals | warning | PASS | Key Decisions has an Explicit non-goals list. |
| ambiguity-stops-and-asks | error | PASS | KD-1 to KD-7 record each choice with alternatives and rationale. Wave split, --quality host and model passing are covered by rulings in the Deviations table. |
| state-machine-idempotency | error | PASS | No migration, init or preflight-check logic is modified. The config-version early exit is untouched. |
| agent-dispatch-script-driven | error | PASS (ruled exception, KD-7) | Lanes, Gate A and every non-null preset value come verbatim from the prepare output. The Step 3 lane flagged one site as FAIL: under `balanced`, SKILL.md Block LD passes `model: opus` when `dispatchModel` is null and the plan author ran on sonnet (R8). plan.js cannot know the session model. Item Change 5 specifies this rule and ruling-w3-preflight item 4 accepted it, so it is recorded as a sanctioned exception (done-file QUESTION 2). |
| flag-semantic-consistency-cross-skill | error | PASS | Task 4 includes the `--quality` grep across user-invoked prepare scripts (execute.js, plan.js, ship.js), and all three mean the full\|balanced\|minimal model-tier preset. |
| workspace-mode-compatibility | error | PASS | Agents are resolved via `__dirname`. No state files, cwd or config readers change. The invalid-`--quality` exit creates no critiqueDir. |
| prompt-cache-hit-ratio | warning | PASS | The agent bodies are static. presetInputs hold only stable values, and per-run inputs (plan path, etc.) are NAME: value lines in the prompt tail. |

## Suggested Review Dimensions

### UPDATE: code-quality (B1, B4)

**Why:** Task 4 adds the `--quality` CLI flag and the new `flags`/`reviewerDispatch` output keys to plugins/sdlc-utilities/scripts/skill/plan.js, and adds `require(path.join(LIB, 'yaml'))`.

**Severity hint:** high

**Patch:** check the new --quality flag parse and enum check, the removal of promptTemplatePath, and the new yaml.js require in plan.js

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — check the new --quality flag parse and enum check, the removal of promptTemplatePath, and the new yaml.js require in plan.js

### UPDATE: docs-skill-sync (B1)

**Why:** Task 5 edits the SKILL.md `argument-hint` (E1) to add `--quality full|balanced|minimal`, and Task 7 adds the matching row to docs/skills/plan-sdlc.md.

**Severity hint:** high

**Patch:** check that the new --quality flag appears in the SKILL.md argument-hint and in the docs/skills/plan-sdlc.md flags table

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — check that the new --quality flag appears in the SKILL.md argument-hint and in the docs/skills/plan-sdlc.md flags table

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 4 replaces `promptTemplatePath`/`subagentType` with the `{ agent, agentPath, model, effort, inputNames, presetInputs }` shape that Task 5's SKILL.md dispatch rule consumes.

**Severity hint:** high

**Patch:** check that the prepare-output dispatch shape (agent, agentPath, inputNames, presetInputs) and the SKILL.md dispatch rule agree

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — check that the prepare-output dispatch shape (agent, agentPath, inputNames, presetInputs) and the SKILL.md dispatch rule agree

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_5 additional candidates suppressed_

These are advisory (G17). This plan edits no review dimension; the suggestions go to the orchestrator as follow-ups, not tasks.

---

## Tasks

The ship run executes Tasks 1–9. They land in the single ship commit `feat(#9268): plan-sdlc - plan agents, declarative dispatch, --quality`. Must-not-touch for the whole run: the spec (D1 owns it); `agents/plan-explore-orchestrator.md`; `agents/commit-orchestrator.md`, `agents/error-report-orchestrator.md`, `agents/harden-orchestrator.md`; `.sdlc/review-dimensions/**`; `skills/plan-sdlc/plan-format-reference.md`, `plan-template-default.md`, `state-format.md`; `mergeLanes`, `diffMaterial`, `g17Prepare` and every function of `plan-critique.js` other than the `LANE_DEFS` literal; the `plan.js` subcommand table and `runSubcommand`; the SKILL.md `--mark` blocks, Step 4, Step 6, Steps 6.5–7; gate wording G1–G21; `hooks/**`; `promptfooconfig*.yaml`; every fixture under `tests/promptfoo/fixtures-fs/`; `site/**` (commit M owns the mirrors); every other skill.

### Task 1: Lane agent files — static, content, guardrail, g17 (W7.4 Files, Create)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Create: `plugins/sdlc-utilities/agents/plan-lane-static.md` — from `skills/plan-sdlc/lane-static-structural-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-lane-content.md` — from `skills/plan-sdlc/lane-content-coverage-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-lane-guardrail.md` — from `skills/plan-sdlc/lane-guardrail-compliance-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-lane-g17.md` — from `skills/plan-sdlc/g17-dimension-coverage-prompt.md`

**Notes:**
The bodies are copied, not rewritten: the gate wording is the contract the lanes are judged on, and W7.5/W7.8 diff against it. The fixed `## Inputs` sentence replaces the old "fill the template" step that SKILL.md did for the model.

**Contract:**
- shape (docs): each file is the frontmatter below, a blank line, then the body.

  | File | `name` | `model` | `effort` | `tools` | `description` (one sentence, no `: `) |
  |---|---|---|---|---|---|
  | `plan-lane-static.md` | plan-lane-static | haiku | low | Read | Plan critique lane for plan-sdlc Step 3 that evaluates G1, G2 and G7 (requirements coverage, orphan tasks, scope creep) and returns the lane JSON envelope. |
  | `plan-lane-content.md` | plan-lane-content | sonnet | medium | Read, Grep, Glob | Plan critique lane for plan-sdlc Step 3 that evaluates the content-coverage gates G5, G6, G8, G9, G11, G13, G15, G16 and G18 to G21 and returns the lane JSON envelope. |
  | `plan-lane-guardrail.md` | plan-lane-guardrail | sonnet | low | Read, Grep, Glob | Plan critique lane for plan-sdlc Step 3 that evaluates G14 (guardrail compliance), builds the Guardrail Compliance table and returns the lane JSON envelope. |
  | `plan-lane-g17.md` | plan-lane-g17 | sonnet | low | Read | Plan critique lane for plan-sdlc Step 3 that judges the G17 behaviour criteria B1 to B4 over script-prepared review-dimension candidates and returns the candidates JSON. |

  Rendered frontmatter (static lane; the others follow the table):

  ```yaml
  ---
  name: plan-lane-static
  description: Plan critique lane for plan-sdlc Step 3 that evaluates G1, G2 and G7 (requirements coverage, orphan tasks, scope creep) and returns the lane JSON envelope.
  tools: Read
  model: haiku
  effort: low
  ---
  ```

- body rules (three lane files): the whole source file, with exactly these changes:
  - delete the three header lines starting `**Lane:**`, `**Gates owned:**`, `**Default model:**` (and one of the blank lines around them, so one blank line separates the title from the next paragraph);
  - directly after the `## Inputs` heading line insert a blank line and the sentence ``Your dispatch prompt gives each input below as a `NAME: value` line; wherever this file says `{NAME}`, use that value.`` (the existing blank line and `You receive:` / `- ` bullets follow unchanged).
- body rules (`plan-lane-g17.md`):
  - first line `# G17 Dimension Coverage`, blank line, then the lines of the source fence's `  prompt: |` block (source lines after `  prompt: |` up to the line before the closing fence ```` ``` ````), each with its first 4 spaces removed (blank lines stay blank). Inner fences (e.g. ```` ```json ````) are de-indented the same way.
  - drop everything outside that block: source lines 1–13 (title, `Use this template…`, **Purpose**, `**Model:**`, `**Dispatch parameters …**` and its bullets), the `Agent tool:` / `subagent_type` / `description` / `model` / `prompt: |` lines, the fence lines, `## Handling G17 Subagent Output` and `## Template Variable Reference` with their content.
  - after the de-indented `## Inputs` heading insert the same sentence as above.
- names: agent names as in the table; inputs exactly as in Task 4's `INPUT_NAMES`.
- mirror: `agents/commit-orchestrator.md` (frontmatter keys and order).
- decisions: KD-1; descriptions avoid `: ` and `#` (YAML plain scalars).
- sync: `docs/cost-tiers.md` §4 rows (Task 3); `INPUT_NAMES` (Task 4).

**Acceptance criteria:**
- [ ] The four files exist; each starts with `---`, has exactly the five keys of the table in that order, and `node -e` with `require('./plugins/sdlc-utilities/scripts/lib/yaml.js')` (`parseSimpleYaml(extractFrontmatter(...))`) returns the table's `name`, `model`, `effort` for each.
- [ ] `grep -cE '^\*\*(Lane|Gates owned|Default model|Model|Dispatch parameters)' plugins/sdlc-utilities/agents/plan-lane-*.md` prints `0` for every file.
- [ ] `grep -c 'Your dispatch prompt gives each input below' plugins/sdlc-utilities/agents/plan-lane-*.md` prints `1` for every file.
- [ ] For the three lane files, `diff <(git show 1e10a02:plugins/sdlc-utilities/skills/plan-sdlc/lane-static-structural-prompt.md | grep -vE '^\*\*(Lane|Gates owned|Default model):') <(sed '1,/^---$/d' plugins/sdlc-utilities/agents/plan-lane-static.md)` (the `sed` drops the frontmatter: line 1 through its closing `---`) shows only the inserted sentence, its blank line and blank-line changes around the removed header (same check for content and guardrail).
- [ ] `plan-lane-g17.md` has no line starting with 4 spaces that was inside the prompt block at the source's indentation (`grep -c '^    You are the Dimension Coverage' plugins/sdlc-utilities/agents/plan-lane-g17.md` → `0`; `grep -c '^You are the Dimension Coverage subagent (G17)' …` → `1`), and no `## Handling G17 Subagent Output` / `## Template Variable Reference` heading.

**Test proof:** Impact grep: `grep -rln 'plan-lane-' plugins tests .claude/skills` → no hit at 1e10a02 (new names). Targeted run: the acceptance commands, once each, then V4 (rule 1b) once. Mutation proof: a dropped gate line makes the acceptance `diff` show a `<` line; a description with `: ` breaks the YAML parse check. Environment scrub: none needed (read-only checks). Waits: none.

### Task 2: Review agent files — three lenses, reviewer, Gate A (W7.4 Files, Create)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Create: `plugins/sdlc-utilities/agents/plan-lens-architecture.md` — from `skills/plan-sdlc/lens-architecture-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-lens-requirements.md` — from `skills/plan-sdlc/lens-requirements-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-lens-risk.md` — from `skills/plan-sdlc/lens-risk-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-reviewer.md` — from `skills/plan-sdlc/plan-reviewer-prompt.md`
- Create: `plugins/sdlc-utilities/agents/plan-intake-verify.md` — from `skills/plan-sdlc/intake-verify-prompt.md`

**Notes:**
The reviewer only ever runs as the single reviewer for plans under 5 tasks, so a lens choice has no caller; fixing it removes two inputs nobody can vary. The item's drop list is applied literally, so lines it does not name stay.

**Contract:**
- shape (docs): frontmatter as Task 1, values:

  | File | `name` | `model` | `effort` | `tools` | `description` (one sentence, no `: `) |
  |---|---|---|---|---|---|
  | `plan-lens-architecture.md` | plan-lens-architecture | sonnet | medium | Read, Grep, Glob | Plan review lens for plan-sdlc Step 5 that checks buildability, task descriptions, decision documentation and dependency accuracy and returns the lens JSON block. |
  | `plan-lens-requirements.md` | plan-lens-requirements | sonnet | medium | Read, Grep, Glob | Plan review lens for plan-sdlc Step 5 that checks requirements coverage, metadata and plan completeness, OpenSpec G16, exploration provenance and best-practice traceability and returns the lens JSON block. |
  | `plan-lens-risk.md` | plan-lens-risk | sonnet | medium | Read, Grep, Glob | Plan review lens for plan-sdlc Step 5 that checks file paths, verification strategy, scope discipline and guardrail compliance and returns the lens JSON block. |
  | `plan-reviewer.md` | plan-reviewer | sonnet | medium | Read, Grep, Glob | Single plan reviewer for plan-sdlc Step 5 on plans with fewer than 5 tasks that checks every review category (lens all) and returns the lens JSON block. |
  | `plan-intake-verify.md` | plan-intake-verify | sonnet | medium | Read | Gate A intake audit for plan-sdlc that checks an OpenSpec change for completeness, correctness and coherence before decomposition and returns the findings JSON. |

- frontmatter form: `---`, then `name:`, `description:`, `tools:`, `model:`, `effort:` one per line in that order with the table's values (unquoted), then `---`, a blank line, then the body (same form as `agents/commit-orchestrator.md`).
- the Inputs sentence (exact): ``Your dispatch prompt gives each input below as a `NAME: value` line; wherever this file says `{NAME}`, use that value.`` — inserted as a blank line plus this line directly after the `## Inputs` heading line.
- de-indent rule: the lines of the source fence's `  prompt: |` block (after that line, up to the line before the closing fence ```` ``` ````), each with its first 4 spaces removed; blank lines stay blank; inner fences are de-indented the same way.
- body rules (three lenses): the whole source file; delete the line starting `**Default model:**`; insert the Inputs sentence. `**Lens:**` and `**Focus categories:**` stay.
- body rules (`plan-intake-verify.md`): the whole source file; delete the line starting `**Default model:**`; insert the Inputs sentence after the `## Inputs` heading (source :32). `**Gate:**`, the cache-stability comment and `## Template Variable Contract` stay.
- body rules (`plan-reviewer.md`), in this order:

  ```markdown
  # Plan Reviewer

  ## Inputs

  Your dispatch prompt gives each input below as a `NAME: value` line; wherever this file says `{NAME}`, use that value.

  <source lines 11–16 (the `{PLAN_FILE_PATH}` … `{REQUIREMENTS_JSON}` bullets), verbatim, except that line 16 ends after `(CLI absent or non-OpenSpec plan).` — its sentence `When \`{LENS}=all\` (single-reviewer, <5 tasks), include this for traceability matrix building if present.` is dropped>
  - `{GUARDRAILS}` — active guardrails, one per line (`- [id] (severity): description`), or `"none configured"`

  <the source `  prompt: |` block, by the de-indent rule above, with the edits below>
  ```

  Prompt-block edits (text after de-indent):

  ```diff
  -**Focus areas (this lens only):** {LENS_FOCUS}
  -(When lens is `all`, evaluate all categories below. When lens is `architecture`, `requirements`, or `risk`, evaluate only the categories listed in Focus areas above — skip all other categories.)
  +**Focus areas:** all categories below.
  ...
  -- Since `{LENS}=all`, fill `traceability` by the requirements-lens rule.
  +- Since the lens is `all`, fill `traceability` by the requirements-lens rule.
  ```

  Dropped: source lines 1–8 (title, `Use this template…`, **Purpose**, **Model selection**), `## How to Fill This Template` with its `{LENS}`/`{LENS_FOCUS}` bullets, the `**Lens → category mapping (KD3):**` block, the `Agent tool:` lines and fence, and `## Handling Reviewer Output` with its content.
- names: as in the table.
- mirror: `agents/commit-orchestrator.md` (frontmatter); Task 1 uses the same rules for the lanes (no dependency: both tasks copy from the 1e10a02 prompts).
- decisions: item Change "For `plan-reviewer.md`, fix `{LENS}` to `all` and remove `{LENS_FOCUS}`"; Deviations rows "Reviewer and g17 bodies get a `# ` title" and "Reviewer focus line".
- sync: Task 3, Task 4 `INPUT_NAMES`.

**Acceptance criteria:**
- [ ] The five files exist with the table's frontmatter: for each, `node -e "const y=require('./plugins/sdlc-utilities/scripts/lib/yaml.js');const fs=require('fs');const f=y.parseSimpleYaml(y.extractFrontmatter(fs.readFileSync(process.argv[1],'utf8')));console.log(f.name,f.model,f.effort)" <file>` prints the table's `name`, `model`, `effort`.
- [ ] `grep -c '{LENS' plugins/sdlc-utilities/agents/plan-reviewer.md` → `0`; `grep -c '^## Handling Reviewer Output' plugins/sdlc-utilities/agents/plan-reviewer.md` → `0`; `grep -c '^You are reviewing a plan document for completeness, accuracy, and executability.$' plugins/sdlc-utilities/agents/plan-reviewer.md` → `1` (de-indented); `grep -c '^Agent tool:' plugins/sdlc-utilities/agents/plan-reviewer.md plugins/sdlc-utilities/agents/plan-lane-g17.md` → `0` each.
- [ ] `grep -c '^\*\*Default model:' plugins/sdlc-utilities/agents/plan-lens-*.md plugins/sdlc-utilities/agents/plan-intake-verify.md` → `0` each; `grep -c 'Your dispatch prompt gives each input below' plugins/sdlc-utilities/agents/plan-lens-*.md plugins/sdlc-utilities/agents/plan-reviewer.md plugins/sdlc-utilities/agents/plan-intake-verify.md` → `1` each.
- [ ] For the three lenses and intake, `diff <(git show 1e10a02:plugins/sdlc-utilities/skills/plan-sdlc/lens-architecture-prompt.md | grep -v '^\*\*Default model:') <(sed '1,/^---$/d' plugins/sdlc-utilities/agents/plan-lens-architecture.md)` (same for requirements, risk, and `intake-verify-prompt.md` → `plan-intake-verify.md`) shows only the inserted sentence and blank lines.

**Test proof:** Impact grep: `grep -rln 'plan-lens-\|plan-reviewer\.md\|plan-intake-verify' plugins tests .claude/skills` → no hit at 1e10a02. Targeted run: the acceptance commands once each, then V4 once. Mutation proof: leaving `{LENS_FOCUS}` in the reviewer fails the `{LENS` count; a changed lens gate line shows in the diff. Environment scrub: none needed. Waits: none.

### Task 3: `docs/cost-tiers.md` — nine agent rows, plan-sdlc override line, Plan quality presets (W7.4 change 3)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2
**Verify:** lint

**Files:**
- Modify: `docs/cost-tiers.md` — §4 table, §5 plan-sdlc bullet, new §5 subsection

**Notes:**
`validate-cost-tiers.js --strict` fails on an agent without a row and on a row without an agent, so the rows land with the files (one ship commit, ruling item 4).

**Contract:**
- shape (docs): §4, insert after the row `| plan-explore-orchestrator | sonnet | medium | Fans out discovery subagents and critiques findings |`:

  ```markdown
  | plan-lane-static | haiku | low | Step 3 judgment gates G1, G2, G7 |
  | plan-lane-content | sonnet | medium | Step 3 judgment gates (content coverage, G18–G21) |
  | plan-lane-guardrail | sonnet | low | Step 3 judgment gate G14 |
  | plan-lane-g17 | sonnet | low | B1–B4 classification over script-prepared candidates |
  | plan-lens-architecture | sonnet | medium | Step 5 review; sonnet as a cost choice |
  | plan-lens-requirements | sonnet | medium | Step 5 review; sonnet as a cost choice |
  | plan-lens-risk | sonnet | medium | Step 5 review; sonnet as a cost choice |
  | plan-reviewer | sonnet | medium | Step 5 review; sonnet as a cost choice |
  | plan-intake-verify | sonnet | medium | Gate A audit |
  ```

  §5, replace the line `` - `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — cross-model plan-reviewer rule (sonnet reviews opus-authored plans, and vice versa) at 5+ tasks. `` with `` - `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — passes `model: opus` to lens agents only when the plan author ran on sonnet (R8). ``

  §5, insert before the line `### Ship per-step dispatch` (with one blank line after it):

  ```markdown
  ### Plan quality presets

  `plan-sdlc --quality` (A4) sets the model and effort of the Step 5 lens reviewers and the single reviewer. `scripts/skill/plan.js` (`QUALITY_DISPATCH`) emits them as `dispatchModel`/`dispatchEffort`; `-` means the agent file's value. The values are tuning (§6). Lanes and Gate A always use their agent files.

  | Preset | Lanes | Lens / reviewer model | Lens / reviewer effort |
  |---|---|---|---|
  | `full` (Speed) | agent-file defaults | `sonnet` | `low` |
  | `balanced` (default) | agent-file defaults | opposite of the plan author's model (R8: `opus` when the author ran on sonnet, else the agent file's `sonnet`) | agent-file default |
  | `minimal` (Quality) | agent-file defaults | `opus` | `high` |
  ```
- names: the nine agent names; heading `### Plan quality presets`.
- mirror: existing §4 rows (4 columns, `| Agent | Model | Effort | Rationale |`).
- decisions: item Change 3 rationales; the lane rationale "Step 3 judgment gate(s)" is made specific per lane.
- sync: Tasks 1–2 frontmatter; Task 4 `QUALITY_DISPATCH`; mirror commit M.

**Acceptance criteria:**
- [ ] V3 exits 0 with no `MISSING_DOC`/`DRIFT`/`STALE_DOC` line.
- [ ] `grep -cE '^\| plan-(lane|lens|reviewer|intake)' docs/cost-tiers.md` → `9`; `grep -c 'cross-model plan-reviewer rule' docs/cost-tiers.md` → `0`; `grep -c '^### Plan quality presets$' docs/cost-tiers.md` → `1`.

**Test proof:** Impact grep: `grep -rln 'cost-tiers' plugins/sdlc-utilities/scripts/ci .claude/skills` → `validate-cost-tiers.js` (1e10a02). Targeted run: V3 once after Tasks 1–3. Mutation proof: at 1e10a02 plus Tasks 1–2 only, V3 prints nine `MISSING_DOC` lines; a row whose model differs from its file prints `DRIFT`. Environment scrub: none needed. Waits: none.

### Task 4: `plan.js` — agent dispatch shape, `reviewerDispatch`, `--quality`; `LANE_DEFS`; exec cases (W7.4 changes 1 and 5, #9196)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — dispatch builders, `parseArgs`, `main`, output
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `LANE_DEFS` literal only
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — T3d, T4a, T4b, P20 case; 4 NEW cases
- Modify: `tests/promptfoo/scripts/test-plan-requirements-field.js` — dispatch report keys

**Notes:**
Agents ship with the plugin, so `__dirname` is the only place to look (#9196: the `find` fallback could pick a stale cached version). Model and effort are read from frontmatter so `docs/cost-tiers.md` stays the one place to change them. The invalid-`--quality` exit comes first so a run that stops creates no temp directory.

**Contract:**
- shape (code), `plan-critique.js`:

  ```diff
   const LANE_DEFS = [
  -  { name: 'static-structural',    model: 'haiku',  templateName: 'lane-static-structural-prompt.md',    gateIds: ['G1', 'G2', 'G7'] },
  -  { name: 'content-coverage',     model: 'sonnet', templateName: 'lane-content-coverage-prompt.md',     gateIds: ['G5', 'G6', 'G8', 'G9', 'G11', 'G13', 'G15', 'G16', 'G18', 'G19', 'G20', 'G21'] },
  -  { name: 'guardrail-compliance', model: 'sonnet', templateName: 'lane-guardrail-compliance-prompt.md', gateIds: ['G14'] },
  +  { name: 'static-structural',    gateIds: ['G1', 'G2', 'G7'] },
  +  { name: 'content-coverage',     gateIds: ['G5', 'G6', 'G8', 'G9', 'G11', 'G13', 'G15', 'G16', 'G18', 'G19', 'G20', 'G21'] },
  +  { name: 'guardrail-compliance', gateIds: ['G14'] },
   ];
  ```

- shape (code), `plan.js` — delete, bottom-up: the null-template warn loops in `main` (from `// Warn for any lane with null promptTemplatePath` through the `intakeAuditDispatch.promptTemplatePath === null` block); `buildLensReviewers`, `buildLanes`, `buildIntakeAuditDispatch`, `resolveSkillTemplate`, `buildG17Dispatch` with their doc comments, from the line `/**` above ` * Build P15 g17Dispatch metadata (R33).` through the end of `buildLensReviewers` (keep `buildGithubHosting` and the `// plan-explore.js invocation` section). Add `const { extractFrontmatter, parseSimpleYaml } = require(path.join(LIB, 'yaml'));` after the `plan-critique` require. Insert in their place:

  ```js
  // P15–P17, P20, P25 — agent dispatch (R33, R35, R36, R39). Agents ship with the
  // plugin next to scripts/, so no other location is searched (#9196).
  const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
  const FORMAT_REFERENCE_PATH = path.join(__dirname, '..', '..', 'skills', 'plan-sdlc', 'plan-format-reference.md');

  const LANE_AGENTS = {
    'static-structural':    'plan-lane-static',
    'content-coverage':     'plan-lane-content',
    'guardrail-compliance': 'plan-lane-guardrail',
  };

  const LENS_INPUTS = ['PLAN_FILE_PATH', 'REQUIREMENTS_CHECKLIST', 'LENS', 'LENS_FOCUS', 'BRIEF_FILE', 'GUARDRAILS', 'REQUIREMENTS_JSON'];
  const INPUT_NAMES = {
    'plan-lane-static':       ['PLAN_FILE_PATH', 'REQUIREMENTS_SUMMARY', 'ACTIVE_GUARDRAILS'],
    'plan-lane-content':      ['PLAN_FILE_PATH', 'REQUIREMENTS_SUMMARY', 'OPENSPEC_TASKS', 'ACTIVE_GUARDRAILS', 'BRIEF_FINDING_IDS', 'FORMAT_REFERENCE_PATH', 'PLAN_TEMPLATE_PATH'],
    'plan-lane-guardrail':    ['PLAN_FILE_PATH', 'ACTIVE_GUARDRAILS'],
    'plan-lane-g17':          ['PLAN_FILE_PATH', 'FIRED_CRITERIA_JSON'],
    'plan-lens-architecture': LENS_INPUTS,
    'plan-lens-requirements': [...LENS_INPUTS, 'OPENSPEC_TASKS'],
    'plan-lens-risk':         LENS_INPUTS,
    'plan-reviewer':          ['PLAN_FILE_PATH', 'REQUIREMENTS_CHECKLIST', 'SOURCE_REQUIREMENTS', 'BRIEF_FILE', 'OPENSPEC_TASKS', 'REQUIREMENTS_JSON', 'GUARDRAILS'],
    'plan-intake-verify':     ['PROPOSAL', 'DELTA_SPECS', 'TASKS_MD', 'DESIGN', 'REQUIREMENTS_JSON'],
  };

  const LENS_DEFS = [
    { lens: 'architecture', focusCategories: ['Buildability', 'Task descriptions', 'Decision documentation', 'Dependency accuracy'] },
    { lens: 'requirements', focusCategories: ['Requirements coverage', 'Metadata completeness', 'Plan completeness', 'OpenSpec G16', 'Exploration provenance', 'Best-practice traceability'] },
    { lens: 'risk',         focusCategories: ['File paths', 'Verification strategy', 'Scope discipline', 'Guardrail compliance'] },
  ];

  // A4/P24 — plan quality presets (docs/cost-tiers.md §5 "Plan quality presets"; tuning values).
  const VALID_QUALITY = ['full', 'balanced', 'minimal'];
  const QUALITY_DISPATCH = {
    full:     { dispatchModel: 'sonnet', dispatchEffort: 'low' },
    balanced: { dispatchModel: null,     dispatchEffort: null },
    minimal:  { dispatchModel: 'opus',   dispatchEffort: 'high' },
  };

  /** Read agents/<name>.md; model/effort from frontmatter, all null when absent. */
  function readAgent(name) {
    const p = path.join(AGENTS_DIR, name + '.md');
    const out = { agent: 'sdlc:' + name, agentPath: null, model: null, effort: null };
    if (!fs.existsSync(p)) return out;
    out.agentPath = p;
    const fm = extractFrontmatter(fs.readFileSync(p, 'utf8'));
    if (fm !== null) {
      const y = parseSimpleYaml(fm);
      out.model = y.model ?? null;
      out.effort = y.effort ?? null;
    }
    return out;
  }

  /** Agent-dispatch shape (P15): readAgent + inputNames + the preset values those names use. */
  function buildDispatch(name, preset) {
    const inputNames = INPUT_NAMES[name];
    const presetInputs = {};
    for (const n of inputNames) if (Object.prototype.hasOwnProperty.call(preset, n)) presetInputs[n] = preset[n];
    return { ...readAgent(name), inputNames, presetInputs };
  }

  /** Values plan.js can compute for every dispatch (P15); noTasks is the OPENSPEC_TASKS sentinel. */
  function buildPreset(guardrails, openspecContext, noTasks) {
    const tasks = openspecContext && Array.isArray(openspecContext.tasks) ? openspecContext.tasks : null;
    const reqs = openspecContext && Array.isArray(openspecContext.requirements) ? openspecContext.requirements : null;
    return {
      FORMAT_REFERENCE_PATH,
      ACTIVE_GUARDRAILS: JSON.stringify(guardrails),
      GUARDRAILS: guardrails.length ? guardrails.map(g => `- [${g.id}] (${g.severity}): ${g.description}`).join('\n') : 'none configured',
      OPENSPEC_TASKS: tasks ? JSON.stringify(tasks) : noTasks,
      REQUIREMENTS_JSON: reqs ? JSON.stringify(reqs) : 'null',
    };
  }

  function buildDispatchSet(guardrails, openspecContext, quality) {
    const lanePreset = buildPreset(guardrails, openspecContext, 'null');                          // content lane sentinel
    const preset = buildPreset(guardrails, openspecContext, 'none — plan not from OpenSpec');     // lenses and reviewer
    const q = QUALITY_DISPATCH[quality];
    const g17Dispatch = buildDispatch('plan-lane-g17', lanePreset);
    const lanes = LANE_DEFS.map(def => ({ name: def.name, ...buildDispatch(LANE_AGENTS[def.name], lanePreset), gateIds: def.gateIds }));
    lanes.push({ name: 'dimension-coverage', ...g17Dispatch, gateIds: ['G17'] });
    const lensReviewers = LENS_DEFS.map(def => ({
      lens: def.lens,
      ...buildDispatch('plan-lens-' + def.lens, { ...preset, LENS: def.lens, LENS_FOCUS: def.focusCategories.map(c => '- ' + c).join('\n') }),
      focusCategories: def.focusCategories,
      ...q,
    }));
    const reviewerDispatch = { lens: 'all', ...buildDispatch('plan-reviewer', preset), ...q };
    const intakeAuditDispatch = buildDispatch('plan-intake-verify', lanePreset);
    return { g17Dispatch, lanes, lensReviewers, reviewerDispatch, intakeAuditDispatch };
  }
  ```

  Lanes (and G17, Gate A) use `lanePreset` (`OPENSPEC_TASKS` sentinel `null`, used only by the content lane); lenses and the reviewer use `preset` (sentinel `none — plan not from OpenSpec`). `buildDispatch` copies only the names in the agent's `INPUT_NAMES` list.

- shape (code), `parseArgs` — add `let quality = null;`, the branch `} else if (args[i] === '--quality') { quality = args[i + 1] ?? ''; i++; }` after the `--path` branch, and return `{ fromOpenspec, markName, markPath, quality }`. `main` destructures `quality` too.
- shape (code), `main` — directly after `const errors = [];` insert:

  ```js
    // A4/P24 — --quality (default balanced); an invalid value stops before any other work.
    const flags = { quality: quality === null ? 'balanced' : quality, sources: { quality: quality === null ? 'default' : 'cli' } };
    if (!VALID_QUALITY.includes(flags.quality)) {
      errors.push(`Invalid --quality value "${flags.quality}"; expected one of ${VALID_QUALITY.join('|')}.`);
      writeOutput({ errors, flags }, 'plan-prepare', 1);
      return;
    }
  ```

  Replace the dispatch block (from `const g17Dispatch = buildG17Dispatch();` through the deleted warn loops) with:

  ```js
    const { g17Dispatch, lanes, lensReviewers, reviewerDispatch, intakeAuditDispatch } = buildDispatchSet(guardrails, openspecContext, flags.quality);
    for (const e of [...lanes, ...lensReviewers, reviewerDispatch, intakeAuditDispatch]) {
      if (e.agentPath === null) process.stderr.write(`[plan-prepare] ${e.agent}: agent file not found — not dispatched\n`);
    }
  ```

  (`dimension-coverage` and `g17Dispatch` are the same agent, so it warns once through `lanes`.) Keep `const githubHosting = buildGithubHosting(projectRoot);`. Output object:

  ```diff
  -    g17Dispatch: { subagentType: g17Dispatch.subagentType, model: g17Dispatch.model, promptTemplatePath: g17Dispatch.promptTemplatePath },
  +    g17Dispatch,
       intakeAuditDispatch,
       lanes,
       lensReviewers,
  +    reviewerDispatch,
       critiqueDir,
       commit,
  +    flags,
       errors,
  ```

  The header usage comment gains `[--quality full|balanced|minimal]` on the first `node plan-prepare.js` line and an `Options:` line `--quality <preset>     Plan-review preset (A4): full | balanced (default) | minimal`. The config-version early exit (`flags: { skipConfigCheck }`) is not changed.

- shape (data), one lane entry of the output (static lane, no guardrails, no OpenSpec):

  ```json
  {
    "name": "static-structural",
    "agent": "sdlc:plan-lane-static",
    "agentPath": "<plugin>/agents/plan-lane-static.md",
    "model": "haiku",
    "effort": "low",
    "inputNames": ["PLAN_FILE_PATH", "REQUIREMENTS_SUMMARY", "ACTIVE_GUARDRAILS"],
    "presetInputs": { "ACTIVE_GUARDRAILS": "[]" },
    "gateIds": ["G1", "G2", "G7"]
  }
  ```

  A lens entry adds, after the shape keys, `"focusCategories": [...]`, `"dispatchModel": null`, `"dispatchEffort": null` (`balanced`) and carries `presetInputs.LENS`, `presetInputs.LENS_FOCUS`. `flags` is `{ "quality": "balanced", "sources": { "quality": "default" } }` without the flag.

- shape (tests), `test-plan-requirements-field.js`:

  ```diff
     intakeAuditModel:           iad ? iad.model : null,
  -  intakeAuditSubagentType:    iad ? iad.subagentType : null,
  -  intakeAuditHasTemplatePath: iad ? ('promptTemplatePath' in iad) : false,
  +  intakeAuditAgent:           iad ? iad.agent : null,
  ```

- shape (tests), `plan-prepare-exec.yaml`:
  - T3d (`plan-prepare T3d: g17Dispatch shape present with required keys (R33, Fixes #417)`): asserts become `icontains '"g17Dispatch"'`, `icontains '"agent": "sdlc:plan-lane-g17"'`, `icontains '"model": "sonnet"'`, `icontains '"agentPath"'`, `icontains 'agents/plan-lane-g17.md'`, `not-icontains '"promptTemplatePath"'`. Description keeps its text.
  - T4a: in the per-lane loop replace the `subagentType` and `promptTemplatePath` checks with: `lane.agent` equals `{ 'static-structural': 'sdlc:plan-lane-static', 'content-coverage': 'sdlc:plan-lane-content', 'guardrail-compliance': 'sdlc:plan-lane-guardrail', 'dimension-coverage': 'sdlc:plan-lane-g17' }[lane.name]`; `'agentPath' in lane` and `'effort' in lane`; `Array.isArray(lane.inputNames)`; `typeof lane.presetInputs === 'object'`; `!('subagentType' in lane) && !('promptTemplatePath' in lane)`. The comment `(including null promptTemplatePath entries)` becomes `(including null agentPath entries)`. The gate checks stay.
  - T4b: replace the `subagentType` and `promptTemplatePath` checks with `lr.agent === 'sdlc:plan-lens-' + lr.lens`, `'agentPath' in lr`, `lr.presetInputs.LENS === lr.lens`, `!('subagentType' in lr) && !('promptTemplatePath' in lr)`.
  - P20 case (`plan-prepare: --from-openspec emits intakeAuditDispatch with expected shape (P20)`): `'"intakeAuditSubagentType": "general-purpose"'` → `'"intakeAuditAgent": "sdlc:plan-intake-verify"'`.
  - NEW, after T4b (all four use `script_path: "repo://plugins/sdlc-utilities/scripts/skill/plan.js"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/plan-prepare-github-remote"` unless stated):
    - `plan-prepare: lane model is read from agent frontmatter` — javascript: `lanes[0].agent === 'sdlc:plan-lane-static'`, `lanes[0].model === 'haiku'`, `lanes[0].effort === 'low'`, `lanes[0].agentPath.endsWith('/agents/plan-lane-static.md')`, `intakeAuditDispatch.model === 'sonnet'` and `intakeAuditDispatch.effort === 'medium'`.
    - `plan-prepare: --quality defaults to balanced with null dispatch overrides (P24)` — javascript: `flags` deep-equals `{ quality: 'balanced', sources: { quality: 'default' } }`; every `lensReviewers[i]` and `reviewerDispatch` has `dispatchModel === null` and `dispatchEffort === null`; `reviewerDispatch.agent === 'sdlc:plan-reviewer'` and `reviewerDispatch.lens === 'all'`.
    - `plan-prepare: --quality minimal sets lens dispatchModel opus and dispatchEffort high` — `script_args: "--quality minimal"`; javascript: `flags` deep-equals `{ quality: 'minimal', sources: { quality: 'cli' } }`; every `lensReviewers[i]` and `reviewerDispatch` has `dispatchModel === 'opus'` and `dispatchEffort === 'high'`; `lanes.every(l => !('dispatchModel' in l))`.
    - `plan-prepare: invalid --quality exits 1 with an errors entry` — `script_path: "-e"`, `script_args: '((cp,fs,js)=>((r)=>console.log(JSON.stringify({exitCode:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))})))(cp.spawnSync("node",[js,"--quality","bogus"],{encoding:"utf8"})))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/plan.js")'`; javascript: `exitCode === 1`; `out.errors` deep-equals `['Invalid --quality value "bogus"; expected one of full|balanced|minimal.']`; `Object.keys(out).sort().join(',') === 'errors,flags'` (no `critiqueDir`).
- names: `readAgent`, `buildDispatch`, `buildPreset`, `buildDispatchSet`, `AGENTS_DIR`, `FORMAT_REFERENCE_PATH`, `LANE_AGENTS`, `INPUT_NAMES`, `LENS_DEFS`, `VALID_QUALITY`, `QUALITY_DISPATCH`; output keys `reviewerDispatch`, `flags`.
- mirror: `skill/execute.js` `VALID_QUALITY` and its invalid-value message; T4f (inline `-e` spawn).
- decisions: KD-1 to KD-5.
- sync: spec P15–P17, P20, P24, P25 (D1); SKILL.md (Task 5); `docs/cost-tiers.md` presets (Task 3); fixtures (Task 6).

**Acceptance criteria:**
- [ ] V10 for `plan.js`, `plan-critique.js`, `test-plan-requirements-field.js`.
- [ ] `grep -c promptTemplatePath plugins/sdlc-utilities/scripts/skill/plan.js` → `0`; `grep -n "claude/plugins" plugins/sdlc-utilities/scripts/skill/plan.js` prints nothing; `grep -cE "templateName|model:" plugins/sdlc-utilities/scripts/lib/plan-critique.js` → `0`.
- [ ] V1: 29 passed, 0 failed. V2: 19 passed, 0 failed.
- [ ] `--quality` flag-name grep: `grep -ln -- "'--quality'" plugins/sdlc-utilities/scripts/skill/*.js` → `execute.js`, `plan.js`, `ship.js`; all three mean the model-tier preset `full|balanced|minimal` (flag-semantic-consistency evidence; `execute.js` lists `'--quality'` in `VALUE_FLAGS`, `ship.js` forwards it to execute).

**Test proof:** Impact grep: `grep -rln 'skill/plan.js\|plan-critique' plugins/sdlc-utilities/hooks plugins/sdlc-utilities/scripts tests/promptfoo/datasets tests/promptfoo/scripts .claude/skills` → `skill/plan.js`, `lib/plan-critique.js`, `scripts/README.md` (script table only), `plan-prepare-exec.yaml`, `plan-state-cleanup-exec.yaml` (comment), `run-plan-state.js`, `test-plan-integrity-markers.js`, `test-plan-mark-validation.js`, `test-plan-explore-pack.js` (state, `--mark` and explorePack only), `check-consistency.js` (script map only), `.claude/skills/test-report/SKILL.md` (mention only) (1e10a02); only the first two change behaviour. `test-plan-requirements-field.js` (not hit by the pattern) is edited by this task; V9 over `tests/promptfoo/scripts/` hits only that script. Targeted run: V1 once and V2 once. Mutation proof: at 1e10a02 the four new cases fail (no `flags`, no `reviewerDispatch`, no `agent`; `--quality bogus` exits 0), and the rewritten T3d/T4a/T4b/P20 fail on `subagentType`/`promptTemplatePath`. Environment scrub: PF-ENV. Waits: each case's spawn (the provider's, or the case's own `spawnSync`) returns when `plan.js` exits; no timer.

### Task 5: plan-sdlc SKILL.md — one dispatch rule for lanes, lenses, reviewer and Gate A; `--quality` (W7.4 changes 2 and 5)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 4
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — frontmatter, Step 0, Gate A, Step 3 dispatch, Step 5 lens and reviewer dispatch, See Also

**Notes:**
One rule replaces three per-variable lists, so the model fills nothing by hand; the run-time table holds only what the script cannot know. The lens model rule names the prepare fields (`dispatchModel`), so the guardrail `agent-dispatch-script-driven` holds except for the R8 author rule, which only the session knows. Step 5 is edited in place; W7.5 moves it later.

**Contract:**
- shape (docs), edits E1–E10, located by content (`grep -nF`, exactly once), applied bottom-up:

  | Id | Old text (exact, one occurrence) | New text |
  |---|---|---|
  | E1 | `argument-hint: "[--spec] [--from-openspec <change-name>] [spec-file-path]"` | `argument-hint: "[--spec] [--from-openspec <change-name>] [--quality full\|balanced\|minimal] [spec-file-path]"` |
  | E2 | the line `If \`--from-openspec <name>\` was passed to plan-sdlc, include it in the node command: \`node "<PLUGIN_ROOT>/scripts/skill/plan.js" --output-file --from-openspec <name>\`.` | the same line, then a blank line, then ``If `--quality <preset>` was passed to plan-sdlc, include it the same way (`--quality <preset>`). plan.js resolves it into `flags.quality` (P24) and applies it as `dispatchModel`/`dispatchEffort` on the reviewer entries; no later step reads the raw flag.`` |
  | E3 | Gate A item 1 (the line starting `1. Dispatch one Gate A audit Agent using \`intakeAuditDispatch\` parameters`), the blank line after it and the line `   Read the file at \`intakeAuditDispatch.promptTemplatePath\`; fill the following template variables before dispatching.` | ``1. Dispatch one Gate A audit Agent from `intakeAuditDispatch` (P20) by the Step 3 dispatch rule: `subagent_type: intakeAuditDispatch.agent`, `description: "plan gate A"`, prompt = one `NAME: value` line per name in `intakeAuditDispatch.inputNames` (values from `presetInputs`, else from the run-time input table in Step 3). Do not pass `model` or `effort` (`agent-dispatch-script-driven` guardrail). If `intakeAuditDispatch.agentPath` is null, skip Gate A and emit one note: `Gate A skipped — plan-intake-verify agent file not found.` `` |
  | E4 | Gate A item 2, from the line `2. Fill the prompt template variables:` through the bullet ``   - `{REQUIREMENTS_JSON}` — `JSON.stringify(openspecContext.requirements)` from prepare output, or `"null"` if null`` (6 lines) | the line `2. The artifacts read in Step 0 are the values of \`PROPOSAL\`, \`DELTA_SPECS\`, \`TASKS_MD\` and \`DESIGN\` (see the run-time input table in Step 3); \`REQUIREMENTS_JSON\` is preset.` |
  | E5 | the `**Fan-out dispatch:**` paragraph and its four bullets (from the line starting `**Fan-out dispatch:** Dispatch the Step 3 lanes from` through the line starting ``- dimension-coverage: `{PLAN_FILE_PATH}`, ``) | Block FD below |
  | E6 | the line starting ``**Null `promptTemplatePath`:** skip that lane's dispatch`` | ``**Null `agentPath`:** a lane whose `agentPath` is null is not dispatched and gets no file; merge-lanes reports the missing result as a blocking lane failure (dimension-coverage: advisory, R31). For dimension-coverage also log `## YYYY-MM-DD — plan-sdlc: G17 skipped — plan-lane-g17 agent file not found` to `.sdlc/learnings/log.md`.`` |
  | E7 | ``(a lane skipped for a null `promptTemplatePath` stays in the list,`` | ``(a lane skipped for a null `agentPath` stays in the list,`` |
  | E8 | from the line `For each \`lensReviewers[]\` entry:` through the line starting `When \`lensReviewers[i].promptTemplatePath\` is null, skip that lens` (15 lines) | Block LD below |
  | E9 | the line starting `For plans with <5 tasks, dispatch one reviewer with \`{LENS}=all\` using \`./plan-reviewer-prompt.md\`.` | ``For plans with <5 tasks, dispatch one reviewer, `reviewerDispatch` (P25), by the same rule, including the R8 author rule (`description: "plan review"`). Its JSON goes to `<ITER_DIR>/lens-all.json` and merge-lanes runs with `--lenses all`.`` |
  | E10 | See Also line `` - `./plan-reviewer-prompt.md` — plan review subagent template `` | `` - `agents/plan-*.md` — critique lanes, lenses, reviewer and Gate A `` |

  In E1 the new text has bare `|` characters (`[--quality full|balanced|minimal]`); the backslashes are table escapes.

  Block FD:

  ```markdown
  **Fan-out dispatch:** For each `lane` in `lanes[]` (P16), issue one Agent call — all in one message: `subagent_type: lane.agent`, `description: "plan lane <lane.name>"`, `prompt`: one `NAME: value` line per name in `lane.inputNames`, taking the value from `lane.presetInputs` when present, otherwise from the run-time table below. Do not pass `model` or `effort`; the agent file sets both (`agent-dispatch-script-driven` guardrail). Skip `guardrail-compliance` when `activeGuardrails` is empty (merge-lanes synthesizes its constant result via `--no-guardrails`). Skip `dimension-coverage` when `g17-prepare.json` has empty `candidates` and empty `coveredDims`; write `{"candidates":[]}` to `<ITER_DIR>/dimension-coverage.json` with the Write tool instead. When `lane.agentPath` is null, do not dispatch that lane (see below).

  Run-time input table (values the prepare script cannot know; Step 5 and Gate A use the same table):

  | Input | Value |
  |---|---|
  | `PLAN_FILE_PATH` | absolute path to the plan file |
  | `REQUIREMENTS_SUMMARY`, `REQUIREMENTS_CHECKLIST` | the numbered requirements list from Step 1 (CONSUME) |
  | `SOURCE_REQUIREMENTS` | spec file path or inline text, or `not provided` |
  | `BRIEF_FILE` | absolute path to `discovery-brief.md`, or `none — orchestrator skipped` |
  | `BRIEF_FINDING_IDS` | the `F-<DIM>-<n>` IDs from the discovery brief, or `null` |
  | `PLAN_TEMPLATE_PATH` | `activeTemplatePath` from Step 0 |
  | `FIRED_CRITERIA_JSON` | contents of `<ITER_DIR>/g17-prepare.json` |
  | `PROPOSAL`, `DELTA_SPECS`, `TASKS_MD`, `DESIGN` | the artifacts read in Step 0 (`DELTA_SPECS` concatenated), or `[artifact missing]` |
  ```

  Block LD:

  ```markdown
  For each `lensReviewers[]` entry, dispatch by the Step 3 dispatch rule: `subagent_type: entry.agent`, `description: "plan lens <entry.lens>"`, `prompt` from `entry.inputNames` (`LENS` and `LENS_FOCUS` are preset). Pass `model: entry.dispatchModel` and `effort: entry.dispatchEffort` only when non-null; per-invocation parameters override the agent file. When `entry.dispatchModel` is null (the `balanced` preset), pass `model: opus` only when the plan author ran on sonnet (R8). <!-- R36, R8, P17 -->

  **Plan quality presets** (`--quality`, A4; values are tuning, `docs/cost-tiers.md` §5):

  | Preset | Lanes | Lens / reviewer model | Lens / reviewer effort |
  |---|---|---|---|
  | `full` (Speed) | agent-file defaults | `sonnet` | `low` |
  | `balanced` (default) | agent-file defaults | opposite of the plan author's model (R8: `opus` when the author ran on sonnet, else the agent file's `sonnet`) | agent-file default |
  | `minimal` (Quality) | agent-file defaults | `opus` | `high` |

  When `entry.agentPath` is null, skip that lens and log to `.sdlc/learnings/log.md`: `## YYYY-MM-DD — plan-sdlc: lens "<name>" skipped — agent file not found`. Continue with remaining lenses.
  ```

- names: `lane.agent`, `lane.inputNames`, `lane.presetInputs`, `agentPath`, `dispatchModel`, `dispatchEffort`, `reviewerDispatch` (P25), `flags.quality` (P24).
- mirror: item Change 2 text (Block FD's first sentence is the item's rule verbatim, with the wave-2 skip rules kept).
- decisions: Deviations rows "SKILL.md forwards `--quality`", "Model/effort passing", "Gate A inputs".
- sync: plan.js output (Task 4); spec R8, R35, R36, R39 (D1); fixtures and rubrics (Task 6); docs page (Task 7).

**Acceptance criteria:**
- [ ] `grep -cE 'promptTemplatePath|subagentType|-prompt\.md' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `0` (11 lines at 1e10a02, all at the E1–E10 sites).
- [ ] `grep -cF '[--quality full|balanced|minimal]' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `1` (E1 written with bare `|`).
- [ ] `grep -c 'lane.agent' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → at least `1`; `grep -c 'dispatchModel' …` → at least `2`; `grep -c 'reviewerDispatch' …` → `1`; `grep -c '^\*\*Plan quality presets\*\*' …` → `1`; `grep -c -- '--quality' …` → at least `3`.
- [ ] `grep -c '<!-- fan-out-dispatch: await-barrier-required -->' plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` → `1` (marker untouched); V4 and V6 hold.
- [ ] `git diff 1e10a02 -- plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md | grep '^[-+]' | grep -vE '^(\+\+\+|---)'` touches only the E1–E10 sites (reviewer checks the hunk headers: frontmatter, Step 0, Gate A, Step 3, Step 5, See Also).

**Test proof:** Impact grep: `grep -rln 'plan-sdlc/SKILL.md' tests/promptfoo/datasets .claude/skills` → `plan-sdlc.yaml` (behavioural, skill_path), `check-consistency.js` and `check-docs-consistency.js` (scans) (1e10a02). Targeted run: the acceptance greps, V4 and V6, once each (static checks). Mutation proof: at 1e10a02 the first grep gives 11 and `reviewerDispatch` gives 0; dropping E1 makes V6 miss `--quality` in the docs flags check once Task 7 lands. Environment scrub: none needed. Waits: none.

### Task 6: Behavioural dataset and fixtures — new dispatch shape (W7.4 Verification, PROBLEMS 14)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** lint

**Files:**
- Modify: `tests/promptfoo/datasets/plan-sdlc.yaml` — P1/P2 rubrics, two G17 cases, Gate A case, three `skill_path`s
- Modify: `tests/promptfoo/fixtures/plan-orchestrator-dispatch.md` — prepare JSON
- Modify: `tests/promptfoo/fixtures/plan-sdlc-c2-material-change.md` — prepare JSON
- Modify: `tests/promptfoo/fixtures/plan-from-openspec-with-requirements.md` — `intakeAuditDispatch` JSON

**Notes:**
These cases load SKILL.md with a fixture prepare output; stale field names would make the judged answer follow the old rule (test-coverage-required: stale tests change with behaviour). They are written, not run (brief).

**Contract:**
- shape (data), `plan-orchestrator-dispatch.md`: replace the `"g17Dispatch"`, `"lanes"` and `"lensReviewers"` values (from the line `  "g17Dispatch": {` through the `]` closing `lensReviewers`) with:

  ```json
    "g17Dispatch": { "agent": "sdlc:plan-lane-g17", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-g17.md", "model": "sonnet", "effort": "low", "inputNames": ["PLAN_FILE_PATH","FIRED_CRITERIA_JSON"], "presetInputs": {} },
    "lanes": [
      { "name": "static-structural", "agent": "sdlc:plan-lane-static", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-static.md", "model": "haiku", "effort": "low", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_SUMMARY","ACTIVE_GUARDRAILS"], "presetInputs": { "ACTIVE_GUARDRAILS": "[]" }, "gateIds": ["G1","G2","G7"] },
      { "name": "content-coverage", "agent": "sdlc:plan-lane-content", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-content.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_SUMMARY","OPENSPEC_TASKS","ACTIVE_GUARDRAILS","BRIEF_FINDING_IDS","FORMAT_REFERENCE_PATH","PLAN_TEMPLATE_PATH"], "presetInputs": { "OPENSPEC_TASKS": "null", "ACTIVE_GUARDRAILS": "[]", "FORMAT_REFERENCE_PATH": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/plan-format-reference.md" }, "gateIds": <the existing content-coverage gateIds array, unchanged> },
      { "name": "guardrail-compliance", "agent": "sdlc:plan-lane-guardrail", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-guardrail.md", "model": "sonnet", "effort": "low", "inputNames": ["PLAN_FILE_PATH","ACTIVE_GUARDRAILS"], "presetInputs": { "ACTIVE_GUARDRAILS": "[]" }, "gateIds": ["G14"] },
      { "name": "dimension-coverage", "agent": "sdlc:plan-lane-g17", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lane-g17.md", "model": "sonnet", "effort": "low", "inputNames": ["PLAN_FILE_PATH","FIRED_CRITERIA_JSON"], "presetInputs": {}, "gateIds": ["G17"] }
    ],
    "lensReviewers": [
      { "lens": "architecture", "agent": "sdlc:plan-lens-architecture", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-lens-architecture.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_CHECKLIST","LENS","LENS_FOCUS","BRIEF_FILE","GUARDRAILS","REQUIREMENTS_JSON"], "presetInputs": { "LENS": "architecture", "LENS_FOCUS": "- Buildability\n- Task descriptions\n- Decision documentation\n- Dependency accuracy", "GUARDRAILS": "none configured", "REQUIREMENTS_JSON": "null" }, "focusCategories": <existing array>, "dispatchModel": null, "dispatchEffort": null },
      { "lens": "requirements", … same pattern, agent `sdlc:plan-lens-requirements`, inputNames + "OPENSPEC_TASKS", presetInputs adds "OPENSPEC_TASKS": "none — plan not from OpenSpec" … },
      { "lens": "risk", … same pattern, agent `sdlc:plan-lens-risk` … }
    ],
    "reviewerDispatch": { "lens": "all", "agent": "sdlc:plan-reviewer", "agentPath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/agents/plan-reviewer.md", "model": "sonnet", "effort": "medium", "inputNames": ["PLAN_FILE_PATH","REQUIREMENTS_CHECKLIST","SOURCE_REQUIREMENTS","BRIEF_FILE","OPENSPEC_TASKS","REQUIREMENTS_JSON","GUARDRAILS"], "presetInputs": { "OPENSPEC_TASKS": "none — plan not from OpenSpec", "REQUIREMENTS_JSON": "null", "GUARDRAILS": "none configured" }, "dispatchModel": null, "dispatchEffort": null },
    "flags": { "quality": "balanced", "sources": { "quality": "default" } },
  ```

  The `…` rows are written out in full by the worker following the architecture row; the file stays valid JSON (`node -e` parse of the fenced block passes).
- shape (data), `plan-sdlc-c2-material-change.md`: the `lanes` and `lensReviewers` arrays become exactly the arrays above (the `guardrails: []` and other keys stay).
- shape (data), `plan-from-openspec-with-requirements.md`: the `intakeAuditDispatch` object becomes `{ "agent": "sdlc:plan-intake-verify", "agentPath": "/path/to/agents/plan-intake-verify.md", "model": "sonnet", "effort": "medium", "inputNames": ["PROPOSAL","DELTA_SPECS","TASKS_MD","DESIGN","REQUIREMENTS_JSON"], "presetInputs": { "REQUIREMENTS_JSON": "<the fixture's requirements array, JSON-stringified>" } }`, same indentation as today.
- shape (data), `plan-sdlc.yaml` edits (each located by its `description:` text):

  | Case | Change |
  |---|---|
  | `plan-sdlc: P1-fanout — …` | `user_request`: `each with a promptTemplatePath` → `each with an agent and inputNames`; rubric: `parameters come verbatim from lanes[];` → `subagent_type = lane.agent and the prompt is one NAME: value line per lane.inputNames entry; no model or effort is passed (the agent file sets them);` |
  | `plan-sdlc: P2-fanout — …` | rubric item `(2) dispatch parameters sourced verbatim from lensReviewers[i] — no hardcoded values;` → `(2) subagent_type = lensReviewers[i].agent with the prompt built from its inputNames; model and effort are passed only from non-null dispatchModel/dispatchEffort;`; item (3) `(3) since plan is written by sonnet, all lenses use opus (cross-model strategy);` → `(3) dispatchModel is null (balanced preset) and the plan is written by sonnet, so every lens gets model: opus (R8);` |
  | `plan-sdlc: G17 dispatched in parallel at Step 3 start using g17Dispatch fields (R31, R33, #417)` | `user_request` g17Dispatch → `{ agent: "sdlc:plan-lane-g17", agentPath: "/some/path/agents/plan-lane-g17.md", model: "sonnet", effort: "low", inputNames: ["PLAN_FILE_PATH", "FIRED_CRITERIA_JSON"], presetInputs: {} }`; rubric: the two lines from the line starting `g17Dispatch.subagentType ("general-purpose"), g17Dispatch.model ("sonnet"), and` through the line `g17Dispatch.promptTemplatePath as parameters — it does NOT hardcode these values.` (each 1 hit; the preceding line ends `The dispatch uses` and stays) → the two lines `subagent_type g17Dispatch.agent ("sdlc:plan-lane-g17") with a prompt of NAME: value lines` / `for its inputNames, and passes no model or effort — it does NOT hardcode these values.`, each at the same 8-space indent |
  | `plan-sdlc: G17 skipped when promptTemplatePath is null (R31, #417)` | description → `plan-sdlc: G17 skipped when agentPath is null (R31, #417)`; `user_request` g17Dispatch → `{ agent: "sdlc:plan-lane-g17", agentPath: null, model: null, effort: null, inputNames: ["PLAN_FILE_PATH", "FIRED_CRITERIA_JSON"], presetInputs: {} }`; rubric `because promptTemplatePath is null` → `because agentPath is null`, `with a null template path` → `with a null agent path` |
  | `plan-sdlc: Gate A uses intakeAuditDispatch params from prepare output (agent-dispatch-script-driven)` | `user_request`: the two lines `openspecContext.requirements is present. How does SKILL.md determine which model` and `and subagentType to use when dispatching the Gate A audit agent?` → `openspecContext.requirements is present. How does SKILL.md determine which agent and inputs` / `to use when dispatching the Gate A audit agent?` (same 6-space indent); rubric → `The response explains that subagent_type is intakeAuditDispatch.agent (sdlc:plan-intake-verify) from the prepare output (P20) and the prompt is one NAME: value line per inputNames entry, REQUIREMENTS_JSON preset. SKILL.md does NOT hardcode the agent and passes no model or effort — the agent file sets them (agent-dispatch-script-driven guardrail).` |
  | the three cases with `skill_path: "plugins/sdlc-utilities/skills/plan-sdlc/lane-content-coverage-prompt.md"` | → `skill_path: "plugins/sdlc-utilities/agents/plan-lane-content.md"` |

- names: as above.
- mirror: wave 2 Task 9's fixture edits.
- decisions: PROBLEMS 14 (fixtures and rubrics change together).
- sync: Task 4 output shape; Task 5 SKILL.md rule.

**Acceptance criteria:**
- [ ] `grep -cE 'promptTemplatePath|subagentType|-prompt\.md' tests/promptfoo/datasets/plan-sdlc.yaml tests/promptfoo/fixtures/plan-orchestrator-dispatch.md tests/promptfoo/fixtures/plan-sdlc-c2-material-change.md tests/promptfoo/fixtures/plan-from-openspec-with-requirements.md` → `0` each.
- [ ] The fenced JSON block of each fixture parses (`node -e` extracting the first ```` ```json ```` block and `JSON.parse`).
- [ ] `npx --yes js-yaml@4.1.0 tests/promptfoo/datasets/plan-sdlc.yaml > /dev/null` exits 0 (YAML still parses; exit 0 at 1e10a02), and `grep -c 'agents/plan-lane-content.md' tests/promptfoo/datasets/plan-sdlc.yaml` → `3`.

**Test proof:** Impact grep: `grep -rln 'plan-orchestrator-dispatch\|plan-sdlc-c2-material-change\|plan-from-openspec-with-requirements' tests/promptfoo/datasets` → `plan-sdlc.yaml` only (1e10a02). Targeted run: the acceptance greps and the JSON parse once each; the behavioural cases are written, not run (V12). Mutation proof: at 1e10a02 the first grep gives 18, 9, 7 and 2 lines. Environment scrub: none needed. Waits: none.

### Task 7: `docs/skills/plan-sdlc.md` and `docs/skill-best-practices.md` — `--quality`, Gate A text, #9267 row, tree line (W7.4 changes 5 and 6, #9267)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — flags table row, :80 name, :297 critique row (#9267), :518 Gate A sentence
- Modify: `docs/skill-best-practices.md` — :242 tree line

**Notes:**
#9267: SKILL.md (after wave 2 fix round 2) removes the critique directory on any stop, cancel or exit before Step 7; the docs row still says "before any stop that invokes `error-report-sdlc`".

**Contract:**
- shape (docs), `docs/skills/plan-sdlc.md` (bottom-up):
  - :518, replace `Gate A dispatch parameters (\`model\`, \`subagentType\`, \`promptTemplatePath\`) are sourced from \`intakeAuditDispatch\` (P20) in the prepare output — never hardcoded.` with ``Gate A is the plugin agent `sdlc:plan-intake-verify` (`agents/plan-intake-verify.md`); its agent name and inputs come from `intakeAuditDispatch` (P20) in the prepare output — never hardcoded — and its model and effort from the agent file.``
  - :297, replace `Created by the prepare script; removed at Step 7 and before any stop that invokes \`error-report-sdlc\`.` with `Created by the prepare script; removed at Step 7, and on any stop, cancel or exit before Step 7.`
  - :80, replace `plan-reviewer-prompt gains` with `the plan-reviewer agent gains`.
  - Flags table, insert after the `--from-openspec <change-name>` row:

    ```markdown
    | `--quality full\|balanced\|minimal` | Plan-review preset: the model and effort of the Step 5 lens reviewers and the single reviewer. `full` = sonnet, low effort; `balanced` = the agent files' values, with opus when the plan author ran on sonnet; `minimal` = opus, high effort (`docs/cost-tiers.md` §5). Lanes and Gate A always use their agent files. An invalid value stops plan-sdlc at prepare time. | `balanced` |
    ```
- shape (docs), `docs/skill-best-practices.md`: replace `  plan-reviewer-prompt.md       ← subagent prompt template for plan review` with `  plan-template-default.md      ← shipped default plan template` (same column alignment).
- names: `--quality`, `sdlc:plan-intake-verify`.
- mirror: the existing Flags rows; doc template `docs/skill-doc-template.md`.
- decisions: Deviations rows "#9267 joins", "`docs/skills/plan-sdlc.md:80`".
- sync: SKILL.md `argument-hint` (Task 5); mirror commit M.

**Acceptance criteria:**
- [ ] `grep -cE 'promptTemplatePath|subagentType|-prompt\b' docs/skills/plan-sdlc.md docs/skill-best-practices.md` → `0` each.
- [ ] `grep -c -- '--quality' docs/skills/plan-sdlc.md` → at least `1`; `grep -c 'before any stop that invokes' docs/skills/plan-sdlc.md` → `0`; `grep -c 'plan-template-default.md      ← shipped default plan template' docs/skill-best-practices.md` → `1`.
- [ ] V6 exits 0.

**Test proof:** Impact grep: `grep -rln 'docs/skills/plan-sdlc\|skill-best-practices' .claude/skills site/scripts` → `check-docs-consistency.js` (scan) and `copy-docs.mjs` (mirror) (1e10a02). Targeted run: the acceptance greps and V6, once each. Mutation proof: at 1e10a02 the first grep gives 2 and 1, and the #9267 grep gives 1. Environment scrub: none needed. Waits: none.

### Task 8: Delete the four lane prompt files (W7.4 Files, Delete)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 4, Task 5, Task 6
**Verify:** build

**Files:**
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lane-static-structural-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lane-content-coverage-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lane-guardrail-compliance-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/g17-dimension-coverage-prompt.md`

**Notes:**
Last, so no reader of the files is left when they go (KD-6). The agent files (Task 1) carry the text.

**Contract:**
- shape (code): one Bash call `git rm -q plugins/sdlc-utilities/skills/plan-sdlc/lane-static-structural-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/lane-content-coverage-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/lane-guardrail-compliance-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/g17-dimension-coverage-prompt.md`.
- names: the four paths.
- mirror: wave 2 Task 3's `git rm` of `lane-file-existence-prompt.md`.
- decisions: KD-6.
- sync: Task 9.

**Acceptance criteria:**
- [ ] `ls plugins/sdlc-utilities/skills/plan-sdlc/lane-*-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/g17-*-prompt.md 2>/dev/null | wc -l` → `0`.
- [ ] `grep -rn 'lane-static-structural-prompt\|lane-content-coverage-prompt\|lane-guardrail-compliance-prompt\|g17-dimension-coverage-prompt' plugins tests/promptfoo/datasets tests/promptfoo/fixtures tests/promptfoo/scripts docs/specs docs/skills docs/cost-tiers.md` prints nothing.

**Test proof:** Impact grep: the second acceptance grep at 1e10a02 hits plan.js, plan-critique.js, the spec, `plan-sdlc.yaml`, `plan-prepare-exec.yaml` and the two md fixtures — all edited by D1 and Tasks 4–6 first. Targeted run: the acceptance commands once, then V1 once (prepare no longer reads them). Mutation proof: a deletion made while a reader is left is caught by V9's grep and the V1 count. Environment scrub: PF-ENV for V1. Waits: V1's spawns return when `plan.js` exits.

### Task 9: Delete the five review prompt files (W7.4 Files, Delete)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 4, Task 5, Task 6, Task 7, Task 8
**Verify:** build

**Files:**
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lens-architecture-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lens-requirements-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/lens-risk-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/plan-reviewer-prompt.md`
- Delete: `plugins/sdlc-utilities/skills/plan-sdlc/intake-verify-prompt.md`

**Notes:**
Same reason as Task 8; split from it only to keep each task at five files or fewer.

**Contract:**
- shape (code): one Bash call `git rm -q plugins/sdlc-utilities/skills/plan-sdlc/lens-architecture-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/lens-requirements-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/lens-risk-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/plan-reviewer-prompt.md plugins/sdlc-utilities/skills/plan-sdlc/intake-verify-prompt.md`.
- names: the five paths.
- mirror: Task 8.
- decisions: KD-6.
- sync: V8, V9.

**Acceptance criteria:**
- [ ] V8 (all four checks) and V9 hold.
- [ ] `ls plugins/sdlc-utilities/skills/plan-sdlc/` lists exactly `SKILL.md`, `plan-format-reference.md`, `plan-template-default.md`, `state-format.md`.

**Test proof:** Impact grep: `grep -rn 'lens-architecture-prompt\|lens-requirements-prompt\|lens-risk-prompt\|plan-reviewer-prompt\|intake-verify-prompt' plugins tests/promptfoo docs/specs docs/skills docs/skill-best-practices.md` at 1e10a02 hits plan.js, SKILL.md, the spec, the docs page, skill-best-practices, a fixture and `plan-sdlc.yaml` — all edited first. Targeted run: V8, V9 once each, then V1, V3, V4, V5 once each as the closing gate of the ship run. Mutation proof: a leftover reference makes V9 print a line. Environment scrub: PF-ENV for V1. Waits: V1's spawns return when `plan.js` exits.

## Final Shape

When all tasks are done:

- `plugins/sdlc-utilities/agents/` holds ten `plan-*` agents: the explore orchestrator (unchanged) and the nine new ones. Each carries `model` and `effort`, and `docs/cost-tiers.md` §4 has a row for each.

- `skills/plan-sdlc/` holds only `SKILL.md`, `plan-format-reference.md`, `plan-template-default.md` and `state-format.md`.

- `plan.js` prepare output: every lane, lens, the single reviewer (`reviewerDispatch`), `g17Dispatch` and `intakeAuditDispatch` use one shape — the agent name, its file path (or null), model and effort from the file, the input names and the values the script can compute. A `flags` object reports `--quality` and where it came from. There is no `promptTemplatePath` and no `find` search anywhere in `plan.js`.

- SKILL.md dispatches every plan subagent with one rule: the agent name as `subagent_type`, one `NAME: value` line per input. Only reviewers get a model or effort, and only from the preset (or the R8 author rule under `balanced`).

- The spec (D1) describes the same shape (P15–P17, P20, P24, P25), the flag (A4) and the model rule (R8, R36).

- Tests assert the new shape; behavioural cases and fixtures use it (written, not run).

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 1 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Create nine plugin agents with frontmatter, bodies from the prompt files, the fixed NAME: value Inputs sentence, g17/reviewer de-indent, reviewer {LENS}=all and {LENS_FOCUS} dropped | Task 1, Task 2 | covered |
| 2 Delete the nine skills/plan-sdlc/*-prompt.md files, keep the three non-prompt files | Task 8, Task 9 | covered |
| 3 plan.js: readAgent, one dispatch shape for lanes, lenses, reviewerDispatch, g17Dispatch and intakeAuditDispatch; remove promptTemplatePath and the find cascade (#9196) | Task 4 | covered |
| 4 plan-critique.js LANE_DEFS drops model and templateName | Task 4 | covered |
| 5 --quality flag: parseArgs, enum check, flags with sources, dispatchModel/dispatchEffort per preset | Task 4 | covered |
| 6 SKILL.md: one dispatch rule for Step 3, Step 5 and Gate A, argument-hint, See Also, preset table, model/effort only when non-null, Step 5 not moved | Task 5 | covered |
| 7 docs/cost-tiers.md: nine §4 rows, §5 plan-sdlc line, Plan quality presets, in the same commit as the agent files | Task 3 | covered |
| 8 Spec direct commit before the code commit: A4, R8 with R36, R31, R33, R35, R39, P15, P16, P17, P20, P24, P25, I8 | D1 (Direct commits) | covered |
| 9 docs/skills/plan-sdlc.md flag row and Gate A text; docs/skill-best-practices.md:242 and its site mirror | Task 7, Mirror commit M | covered |
| 10 Tests: plan-prepare-exec cases (T3d, T4a, T4b, P20, new cases), test-plan-requirements-field.js, plan-sdlc.yaml rubrics, G17 cases, Gate A case, skill_paths, three fixtures | Task 4, Task 6 | covered |
| 11 Follow-up #9267: one docs row about the critique directory | Task 7 | covered |
| 12 Verification: cost-tiers, consistency, discovery and docs checks, no prompt files left, promptTemplatePath count 0, exec-only promptfoo with the pinned version, behavioural cases written but not run, no timer-dependent tests | Task 4, Task 8, Task 9, Verification V1-V12 | covered |
| 13 Plan conventions: Direct commits section, one ship run, Commit header, Notes and Test proof per task, entry count with basis, exact Files and Must-not-touch | Direct commits, Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
