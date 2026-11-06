# M8 wave 1 — review-sdlc family Implementation Plan

**Commit:** `feat(#9286): review-sdlc - review family wave 1 (M8 wave 1)`
**Goal:** Land M8 wave 1 for the review-sdlc family: spec commits first, then the review-sdlc prompt fixes (W6b.1–W6b.3), the deterministic `review-consolidate.js` (W6b.4), `--auto`/`--post` for review-sdlc with ship forwarding (W8.36, #9282), the review-sdlc part of W6c.10, and the wave-1 todos (#9194, #9197, #9200, #9201, #9203, #9206, #9207, #9230+#9247, #9240, #9263, #9283; #9256 as release-note text).
**Architecture:** Spec changes land first, one commit per spec consequence. A new script `scripts/skill/review-consolidate.js` takes over the review orchestrator's deterministic work (plan text, dedupe, counts, verdict, comment, `review-summary.json`, summary block) and keeps the P11 summary contract. `skill/review.js` resolves `--auto`/`--post` once (P12), and the orchestrator relays the decision to the skill through new summary-block lines, so the skill still never reads the manifest (C1).
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m8/wave-1-source.md (with preflight-w1-facts.md and arbiter ruling m8-w1-A2-1.md)
**Verification:** node .claude/skills/validate-plugin-consistency/check-consistency.js && cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-" -j 2 --no-cache -o /tmp/pf-m8w1-final.json

---

## Context

**What problem does this change solve?**

- The review-sdlc prompts carry stale text: a short `argument-hint`, a repeated "await barrier" rule (stated five times), a wrong reason ("defaults to opus"), and a block of DO-NOT bullets that restate one rule.
- The review orchestrator (the agent that runs the dimension reviewers and builds the comment) does counting and verdict work by hand. A model can miscount, so the verdict may not match the findings.
- Under `ship-sdlc --auto`, review-sdlc still asks "Post this review comment?". The forked ship step cannot ask, so the ship run stops (#9282).
- Several small defects stay open: a stop path leaves a temp dir behind (#9197), cleanup uses a Bash `rm -rf` that headless runs deny (#9203), the save step uses Bash `mkdir`/`cp` (#9201), brace globs like `*.{js,ts}` match nothing (#9206), an unknown dimension `model:` passes validation (#9207), two review dimensions miss nested scripts (#9230, #9247), and an eval grader can never pass (#9194).

**What prompted this change now?**

- The owner placed these items in M8 wave 1 (consolidated plan §6 Q26 and Q28; owner decision for #9283 dated 2026-11-05).
- The arbiter ruling m8-w1-A2-1 fixed the open questions: keep the P11 summary contract, list already-done sub-items as done, pin promptfoo to `0.123.1`, and plan #9263 and #9283 in this wave.

**What does success look like?**

- Each spec consequence is its own commit, before any code.
- A ship `--auto` run's review step asks nothing and saves the review when there is no PR.
- `review-consolidate.js` exists, its exec cases pass, and the orchestrator only runs it plus a judgment pass.
- `check-consistency.js` passes, and every new targeted exec case passes.

## Research Findings

The base is `e0d1031`. Plan line numbers in the source are stale (about +20 in `SKILL.md`, +3 in `REFERENCE.md`, +11 in the orchestrator), so every edit below quotes the text it changes. All quoted anchors were re-checked with `grep -n` and occur once unless stated.

**Already done at the base (no task):**

- W6b.1 item 3: `SKILL.md:34` already reads `Read \`<PLUGIN_ROOT>/skills/error-report-sdlc/SKILL.md\`` (F-review-skill-steps-and-cleanup-6).
- W6b.1 item 2 and W1.9: `grep -c trap SKILL.md` is 0.
- W6b.3 changes 1–3: the Step 2 prompt already passes `REFERENCE_MD_PATH` (`SKILL.md:77`), and the orchestrator Inputs and Step 0 already use it (`review-orchestrator.md:16,22`) (F-review-skill-steps-and-cleanup-22).
- W4.5: the summary schema exists at `schemas/review-summary.schema.json` (repo root). P11 has the orchestrator write it straight to `summary_copy_path`, so no `TODO(W4.5)` is needed (F-review-consolidate-script-design-2).
- #9202: the "copied" wording is gone; `ship.js` says "review-summary copy", which matches the spec term `summary_copy_path`. Closed by ruling, not planned.

**Review summary contract (P11).** The live orchestrator summary block has two lines the W6b.4 source text lacks: `Summary file:` and `Summary copy path:`, both `manifest.summary_copy_path` (`review-orchestrator.md:177-178`). The skill's stale-file guard reads `Summary copy path:` and checks that the file's `commentPath` equals the `Comment file:` line (`SKILL.md:91-107`). The script must print the block with both lines in that order (F-review-consolidate-script-design-1).

**Manifest and test harness.** `review.js` builds the manifest at `review.js:628-664`. It has no `flags` object on success; only the config-error path writes `flags: { skipConfigCheck }` (F-review-auto-post-flag-resolution-2). The exec runner (`tests/promptfoo/providers/script-runner.js`) copies a `file://fixtures-fs/<dir>` fixture to a temp dir and substitutes `{{project_root}}` only in `script_args`/`script_cwd`/`script_env`. A static fixture manifest therefore cannot point `summary_copy_path` into the copy, so the script needs a `--summary-path` override for tests (F-review-consolidate-script-design-7). `script_args` is split on whitespace, so inline `-e` code must contain no spaces; longer probes use a helper under `tests/promptfoo/scripts/` (the `run-review-*.js` pattern).

**Flags.** `review.js` parses only `--project-root --base --dimensions --committed --staged --working --worktree --set-default` (`review.js:99-109`) and ignores unknown flags. `--dry-run` is handled by `SKILL.md` Step 1. `ship.js:502` passes review `args: '--committed'`; the execute step builds its args as `[…, flags.auto ? '--auto' : '', …].filter(Boolean).join(' ')` (`ship.js:452-470`) (F-review-auto-post-flag-resolution-5). Ship spec R7 (`docs/specs/ship-sdlc.md:329`) says review-sdlc "has no prompts to skip", which is false.

**Temp dirs.** `writeDimensionDiffs` makes `os.tmpdir()/sdlc-review-XXXXXX` (`review.js:263`). The existing `gcTempdirs` (`lib/state.js:755`) needs a branch slug in the name, so it keeps every `sdlc-review-*` dir as `unparseable-name` (F-review-skill-steps-and-cleanup-13). A left-behind `/tmp/sdlc-review-aHPbhe` from an earlier run exists on this machine, which shows #9203 in practice.

**`--dry-run` side effects (#9194).** A scratch run of `review.js --committed --base main --dry-run` on a copy of `fixtures-fs/worktree-linked-ahead` exited 0 and created both `<root>/.gitignore` and `<root>/.sdlc/.gitignore` (managed blocks from `ensureConfigVersion` → `ensureSdlcInfrastructure`) (F-review-auto-post-flag-resolution-3). The eval grader `nothing-at-top-level` (`path: "*"`, `exists: false`) also matches the scaffold's own `README.md`, so it can never pass (F-review-auto-post-flag-resolution-4).

**Dimension validation.** `globToRegex` escapes `{}` (`review.js:161`), and `plan-critique.js` reuses it (F-dimension-validation-and-glob-matching-1). D13 only warns on a non-string `model` (`lib/dimensions.js:210-214`). A dimension whose validation fails is dropped silently at `review.js:458` (`if (result.status === 'FAIL') continue;`) (F-dimension-validation-and-glob-matching-3). The existing D13 exec case asserts a warning for a non-string model, so that case must keep passing.

**Validators.** `check-consistency.js` passes at the base. Rule 13 needs one barrier token in an agent that lists `Agent` in `tools` (`await barrier`, `never consolidate on partial` or `R-orchestrator-await`; `check-consistency.js:296-302`). `check-docs-consistency.js` has pre-existing findings for other skills only. Rule 1b requires the brace form `{PLUGIN_ROOT}` in `agents/*.md`.

**Test conventions.** promptfoo only. Exec config `tests/promptfoo/promptfooconfig-exec.yaml` (dataset list at `:21-62`). `maxConcurrency: 2`. Targeted runs use the profile form `npx --yes promptfoo@0.123.1 eval -c <config> --filter-pattern "<p>" -j 2 --no-cache -o <export>`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Already-done sub-items | no | W6b.1 items 2–3, W6b.3 changes 1–3 and W4.5 are listed as done, not planned | arbiter ruling Q2; verified at `e0d1031` |
| W6b.4 summary location | no | the script writes `review-summary.json` to `summary_copy_path`, not "beside review-comment.md"; block keeps `Summary file:` and `Summary copy path:` | arbiter ruling Q1 (P11 contract) |
| `--assessment` and single-file `--findings` (W6b.4 change 1) | no | left out; the assessment sentence is fixed | no caller passes them (yagni) |
| `--plan` switch of the new script (W6b.4 change 1) | no | named `--render-plan` | `--plan <path>` already means a plan file in `execute.js` and `ship.js` (Key Decisions, new flag names) |
| Interactive ship and the post question (follow-up, no task) | no | not changed in this wave | without `--auto`, ship still forks review-sdlc, which can ask the post question and stop with a pending question (`ship.js` pendingStop); outside the W8.36 text, logged as a follow-up |
| `--summary-path` flag on the new script | no | adds a test-only override of `manifest.summary_copy_path` | fixture manifests cannot hold the per-case temp path (F-review-consolidate-script-design-7) |
| Post decision relay | no | `review.js` resolves `post_decision`; the script prints it as `Post decision:`, `Auto:` and `Save path:` lines after `Diff dir:` | the skill must not read the manifest (C1); existing lines keep their names and order |
| `--post` without `--auto` | no | a given `--post` skips the Step 4 prompt; `--auto` without `--post` uses the default | narrowest reading of A10 "the post decision comes from `--post`"; no flag keeps today's prompts |
| `--post yes` without a PR | no | resolves to `save` with a stderr warning | never posts without a PR; ship runs review before its pr step |
| `--auto` and Step 5 | no | under `--auto` the self-fix offer is skipped (one line printed) | the offer is a prompt; ship drives received-review itself |
| #9203 cleanup | no | keeps Step 6 `rm -rf`, adds a TTL-only sweep (24 h) of `sdlc-review-*` dirs at the start of `review.js` | narrowest fix that keeps the G3 "removed by the skill" contract and the three cleanup dataset cases |
| #9197 stops | no | G3 names the kept stops (summary-missing, link-gate, second orchestrator failure, `REFERENCE.md not found`) instead of adding cleanup on them; `REFERENCE.md not found` goes straight to error-report-sdlc | the link-gate stop keeps `review-comment.md` for the user on purpose; the sweep covers the rest |
| #9197/#9203 spec commit | no | one G3/R5 spec commit carries both | both change the same G3 sentence |
| #9207 D13 severity | no | an unknown string `model` is a D13 error; a non-string stays a D13 warning; `review.js` names the dropped dimension on stderr | the todo asks for an error; the existing warning case stays green; the stderr line removes the silent drop |
| #9207 alias list | no | accepts `haiku`, `sonnet`, `opus`, `fable` and `claude-*` ids (optional `[1m]` suffix) | the Agent tool's `model` enum in the planning session lists exactly `sonnet`, `opus`, `haiku`, `fable`; repo dimensions use the first three; full ids cover the rest. Executor: if the installed Claude Code docs list a different alias set, stop and report rather than guess |
| #9207 "summary names the model" | no | `review-summary.json` `dimensions[].model` (optional schema property) | the schema's dimension items allow extra properties; no block or comment change |
| #9263 wording | no | clause (a) reads "all dimension dispatches of a batch are sent in one message (R-dimension-cap)" | the ruling's text "sent in one message" would contradict R-dimension-cap batches |
| R-orchestrator-await (b) step names | no | left unchanged (it still names "Step 3 (critique) or Step 5") | ruling: rewrite only clause (a); recorded as a follow-up |
| `--dry-run` leaves `diff_dir` | no | not fixed; G3 says the sweep removes it | R3 change is out of wave 1 (#9194 ruling); follow-up |
| #9240 placement | no | edits only the project dimension `.sdlc/review-dimensions/security.md` (A07 bullet) | the todo names this repo's security-review checklist; the shipped catalog stays project-agnostic |
| Behavioral promptfoo checks | no | listed as optional, owner-run only; the executor runs exec configs only | the behavioral config starts Claude sessions (SAFE-2) |
| #9256 | no | no task; the CHANGELOG correction line is in `## Release notes` | ruling Q6: a line in the wave-1 release entry; the release is a manual step after ship |
| #9202, #9266, wave-2 items | no | not planned | ruling Q6; #9266 glob part is covered by Task 21 |

## Key Decisions

- **A script for the deterministic work, the model for judgment.** The orchestrator keeps only the judgment pass (meaning-level duplicates, contradictions, severity fixes). Counting, verdict and rendering move to `review-consolidate.js`. The alternative, a tighter prompt, still lets a model miscount. A script gives the same output for the same input (`scripts-over-llm-logic`).

- **Relay flags through the summary block, not the manifest.** The skill must not read the manifest (C1). The orchestrator already returns a parsed block, so three new lines carry the decision. They go after `Diff dir:`, so no existing line moves.

- **One resolution site for the post decision.** `review.js` resolves `post_decision` once (P12). The skill reads `Post decision:` and never re-parses `$ARGUMENTS` (`flag-coherence-cross-skill`, `flag-resolution-single-source`).

- **Keep Step 6 and add a sweep.** Removing Step 6 would change G3 and three dataset cases. The sweep only catches what a stop or a denied `rm -rf` left behind. A 24-hour TTL (time to live — the age after which a dir counts as stale) is far longer than any review run, so a live run's dir is never swept.

- **The sweep is time-driven, so its test injects `now`.** The helper takes `now` and `tmpdir`, like `gcTempdirs`. The test passes a `now` 25 hours ahead instead of waiting (GATE-9).

- **Spec first, one commit per consequence.** Tasks 1–7 are spec-only. Every later task depends on Task 6 and Task 7, directly or through another task, so the spec commits come first. Tasks that edit the same file are chained by `Depends on` (PF12).

- **promptfoo `0.123.1`, exec configs only.** Every verification command uses `npx --yes promptfoo@0.123.1 … -j 2 --no-cache -o <export>`. Each new case description starts with its `--filter-pattern` string followed by `: `.

- **Root problem in one sentence.** review-sdlc decides by prompt text what code should decide (counts, verdict, posting), and its prompts repeat or misstate their own rules, so runs drift and headless runs stop.

- **Smallest viable cut.** The minimum is the spec commits plus W6b.1–W6b.4 and W8.36, which the owner placed in this wave. Each todo task (16–18, 21–23) is an S item the owner or arbiter placed here, so none is optional extra scope.

- **Who fails if this ships wrong.** Ship users first: a wrong post decision posts to a PR without consent, or stops ship again. Review users next: a wrong verdict or a broken summary block stops the P11 guard and the ship review gate. The guards are the R14 link gate (still the only way to post) and Task 13's exec cases for the block.

- **Non-goals.** No change to `--dry-run` cleanup (R3), to R-orchestrator-await (b), to the shipped dimension catalog, to other skills' `<PLUGIN_ROOT>` text, to `scripts/README.md` sub-items 4–5 of W6c.10, or to received-review-sdlc. No wave-2 item (W6b.5, W6b.6, W8.37, W8.39, W8.41, W8.43). No paid eval run and no release task.

- **Workspace modes (branch and worktree).** `summary_copy_path` keeps its `resolveStateDir()` main-worktree path, so ship finds it from a linked worktree. `save_path` uses the active worktree, as the current `.sdlc/reviews` relative save does. The temp sweep scans `os.tmpdir()` only, so it behaves the same in both modes. `review-consolidate.js` never computes a path itself; it takes them from the manifest.

- **New flag names.** `grep -ln "'--post'" plugins/sdlc-utilities/scripts/skill/*.js` finds nothing, so `--post` is new. `--auto` already means "skip prompts" in `commit.js`, `execute.js`, `pr.js`, `received-review.js`, `version.js` and `ship.js`, and review-sdlc uses it the same way. The consolidate script's switch is `--render-plan`, not `--plan`, because `--plan <path>` means a plan file in `execute.js` and `ship.js`. `grep -ln -- "'--manifest'\|'--findings'\|'--output-dir'\|'--summary-path'" plugins/sdlc-utilities/scripts/skill/*.js` also finds nothing, so the script's other flags are new and cannot clash.

- **Issue links.** `#9286` is the wave's tracking id. The PR body says `Refs #9286` and lists the todo ids it closes. Those todo ids are entries in `.sdlc/orchestration/todos.md`, not GitHub issues, so no `Fixes #…` line is written for them. The PR body also carries this closure line for #9153 (W8.36 Done-when): `#9153 closed: with --auto or --post, review-sdlc never asks the post question (A9, A10, P12); without them it asks it in every run that reaches Step 4.`

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): `gcAgedTempdirs({ prefix, ttlHours = 24, now, tmpdir } = {})` →
  `{ deleted: string[], kept: string[] }`; deletes directories under `tmpdir || os.tmpdir()`
  whose name starts with `prefix` and whose mtime is older than `ttlHours`; never throws.
- names: `gcAgedTempdirs` (new export of `lib/state.js`).
- mirror: `gcTempdirs` at `plugins/sdlc-utilities/scripts/lib/state.js:755` (doc comment from `:730`).
- decisions: TTL-only (no branch slug) — `sdlc-review-XXXXXX` names carry no slug.
- sync: `skill/review.js` calls it with `prefix: 'sdlc-review-'`.
```

### Worked example — docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/review-sdlc.md` `## Flags` table: add rows `--auto` and
  `--post yes|save|none` after `--dry-run`; audience: end users.
- names: rows `--auto`, `--post yes|save|none`.
- mirror: the existing Flags table rows at `docs/skills/review-sdlc.md:19-30`.
- decisions: defaults read "off" and "ask (or `yes` with a PR / `save` under `--auto`)".
- sync: `SKILL.md` `argument-hint` and spec A9/A10.
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): ADD `A9`, `A10` under `### Flags` of `docs/specs/review-sdlc.md` after A8;
  ADD `P12` after P11; MODIFY the CONSUME `Params` line and R10. Delta text pinned in the task.
- names: `A9`, `A10`, `P12` (new); `R10` (modified).
- mirror: flag line style at `docs/specs/review-sdlc.md:12-19`.
- decisions: ids continue from A8 and P11; no renumbering.
- sync: `skill/review.js` (Task 11) and `SKILL.md` Step 4 (Task 19) implement them.
```

## Guardrail Compliance

Statuses after the Step 4 fixes. "Fixed" means the Step 3 lane flagged the item and the plan was revised.

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS (fixed) | Task 19 adds four `review-sdlc-post: …` cases and Task 14 one `review-orchestrator-consolidate: …` case (behavioral, owner-run); every script task has exec cases |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted `--filter-pattern` runs on the exec config; behavioral cases are owner-run only |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a listed wave-1 item; Deviations justify the extras |
| single-responsibility-tasks | warning | WARN (accepted) | Tasks 16, 21 and 22 each hold one owner-placed item group whose parts share one spec sentence or one file set; splitting them would add same-file chains with no separate deliverable |
| scripts-over-llm-logic | error | PASS | Counting, verdict, rendering and the post decision move into scripts |
| yagni | warning | PASS (fixed) | `--assessment` and the single-file `--findings` form were removed from Task 12 |
| cross-skill-consistency | error | PASS | Ship spec, `ship.js`, ship SKILL.md and docs are updated for `--auto` forwarding |
| pr-link-github-issue | error | PASS | Commits cite #9286 and the PR body says `Refs #9286`; todo ids are not GitHub issues (Key Decisions) |
| dry | warning | PASS | `globToRegex` is reused by plan-critique; `renderPlan` is moved, not copied |
| kiss | warning | PASS | Simplest options chosen (TTL sweep, kept stops, in-place glob edit) |
| spec-first | error | PASS | Spec Tasks 1–7 come before every SKILL.md task through `Depends on`; Task 24 is text cleanup with no behaviour change |
| project-agnostic | error | PASS | Behaviour changes are in plugin code; the repo dimension edits are this project's own dogfooding content |
| flag-coherence-cross-skill | error | PASS (fixed) | Step 5 and its harden bullet both gate on the relayed `auto` field |
| no-opposite-logical-vectors | error | PASS (fixed) | Both Step 5 sites use the same gate: `auto` is `true` |
| flag-resolution-single-source | warning | PASS | `review.js` resolves `post_decision` once (P12); the skill reads the relayed lines |
| state-premise | error | PASS | The root problem is stated in one sentence in Key Decisions |
| smallest-viable-cut | warning | PASS | The minimum cut is named and the extra tasks are justified |
| failure-audience | warning | PASS | Key Decisions name ship users and review users |
| explicit-non-goals | warning | PASS | Key Decisions list the non-goals |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Deviations and Key Decisions with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic changes; the sweep test covers kept and deleted dirs |
| agent-dispatch-script-driven | error | PASS | The dispatch model comes from `dimension.model` or `manifest.subagent_model`; no extra parameters |
| flag-semantic-consistency-cross-skill | error | PASS (fixed) | Grep evidence for `--post`, `--render-plan`, `--manifest`, `--findings`, `--output-dir` and `--summary-path` is in Key Decisions |
| workspace-mode-compatibility | error | PASS | Key Decisions state the branch and worktree behaviour; paths come from `resolveStateDir` and the manifest |
| prompt-cache-hit-ratio | warning | PASS | The REFERENCE template is static-first, with per-run values in the `## This run` tail |

## Suggested Review Dimensions

### UPDATE: code-quality (B1, B4)

**Why:** Task 11 adds `--auto` and `--post` to `plugins/sdlc-utilities/scripts/skill/review.js`, Task 12 creates a new CLI script, and Task 16 adds a new `gcAgedTempdirs` import into `review.js`.

**Severity hint:** high

**Patch:** Add checklist items: new CLI flags (`--auto`, `--post`, `--render-plan`, `--summary-path`) are parsed and validated in one place, and a new import such as `gcAgedTempdirs` is exported, used and covered by an exec case.

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — Add checklist items: new CLI flags (`--auto`, `--post`, `--render-plan`, `--summary-path`) are parsed and validated in one place, and a new import such as `gcAgedTempdirs` is exported, used and covered by an exec case.

### UPDATE: docs-skill-sync (B1)

**Why:** Task 19 adds `--auto` and `--post yes|save|none` to the `argument-hint` and description of `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` and the `docs/skills/review-sdlc.md` Flags table.

**Severity hint:** high

**Patch:** Check that a flag or `argument-hint` change in SKILL.md frontmatter is mirrored in `docs/skills/<skill>.md` Flags table and in the `description` flag list.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that a flag or `argument-hint` change in SKILL.md frontmatter is mirrored in `docs/skills/<skill>.md` Flags table and in the `description` flag list.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 20 changes `ship.js` review `args` to `--committed --auto`, which must be parsed by `review.js` (Task 11), and Task 19 changes the SKILL.md Step 4 defaults.

**Severity hint:** high

**Patch:** Check that a flag forwarded via `$ARGUMENTS` or a step's `args` is parsed by the receiving script and that its default changes at all decision sites together.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that a flag forwarded via `$ARGUMENTS` or a step's `args` is parsed by the receiving script and that its default changes at all decision sites together.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_10 additional candidates suppressed_

These suggestions are advisory and are not plan tasks. The runtime-contract one is already covered by Task 21's new checklist bullet.

## Tasks

### Task 1: review spec — A9 `--auto`, A10 `--post`, P12

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — add A9, A10 after A8; add P12 after P11; amend the CONSUME `Params` line and R10

**Must-not-touch:** A1–A8 text; P1–P11; every other requirement id.

**Commit:** `docs(#9286): review-sdlc spec - A9 --auto, A10 --post, P12 decision`

**Notes:** W8.36 change (1) and #9282 (F-review-auto-post-flag-resolution-7). Spec commits come first (brief order). The relay through summary lines is stated here once, so Tasks 12 and 19 implement it rather than re-derive it.

**Acceptance criteria:**
- [ ] A9 and A10 appear once each, directly after A8, with the text below.
- [ ] P12 appears once, directly after P11, with the text below.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js` reports no finding for `docs/specs/review-sdlc.md`.

**Test proof:** `grep -c '^- A9: `--auto`' docs/specs/review-sdlc.md` = 1, `grep -c '^- A10: `--post' docs/specs/review-sdlc.md` = 1, `grep -c '^- P12:' docs/specs/review-sdlc.md` = 1; validate-spec-shape exits 0 for the file.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`; the three greps above.

**Contract:**
- shape (openspec): ADD after the A8 line:
  ```markdown
  - A9: `--auto` — run with no prompt: Step 4 takes the post decision from `post_decision` (P12) and Step 5 makes no self-fix offer (default: false)
  - A10: `--post yes|save|none` — the post decision: `yes` posts to the branch's PR (after R14), `save` writes the review to `save_path` (R-reviews-path), `none` keeps it in the terminal only. When given, Step 4 asks nothing (default: unset)
  ```
  ADD after the P11 line:
  ```markdown
  - P12: `flags` `{ auto, post, skipConfigCheck }`, `post_decision` and `save_path`, resolved once by `skill/review.js`. `flags.post` is the validated `--post` value or null. `post_decision`: the `--post` value when given, except that `yes` resolves to `save` (with a stderr warning) when `pr.exists` is false; under `--auto` without `--post`, `yes` when `pr.exists`, else `save`; otherwise null, and Step 4 prompts as before. `save_path` is the absolute path `<active worktree>/.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` (characters outside `[A-Za-z0-9_-]` in the branch become `-`; local date). An invalid `--post` value is a prepare error (exit 1, `errors[]` entry `--post must be yes, save or none (got: <value>)`). The skill does not read the manifest (C1), so the orchestrator relays these values as the `Post decision:` (`yes`, `save`, `none` or `ask` for null), `Auto:` and `Save path:` lines of its summary.
  ```
  MODIFY (CONSUME phase):
  ```diff
  -   - **Params:** A1-A7 forwarded (`--base <branch>`, `--committed`, `--staged`, `--working`, `--worktree`, `--set-default`, `--dimensions <list>`)
  +   - **Params:** A1-A7, A9 and A10 forwarded (`--base <branch>`, `--committed`, `--staged`, `--working`, `--worktree`, `--set-default`, `--dimensions <list>`, `--auto`, `--post <value>`)
  ```
  MODIFY R10:
  ```diff
  - - R10: Post-confirmation (`yes` / `save` / `cancel`) is issued by the skill in the main context, not by the orchestrator
  + - R10: Post-confirmation (`yes` / `save` / `cancel`) is issued by the skill in the main context, not by the orchestrator; when `post_decision` (P12) is set, the skill acts on it without a prompt
  ```
- names: `A9`, `A10`, `P12`; modified `R10`, CONSUME `Params`.
- mirror: flag lines `docs/specs/review-sdlc.md:12-19`; P-line style `:112-121`.
- decisions: see `## Key Decisions` (relay, single resolution site); `--post yes` without a PR degrades to `save` (Deviations).
- sync: Task 11 (`review.js`), Task 12 (summary lines), Task 19 (`SKILL.md` Step 4/5), Task 20 (ship forwarding).

### Task 2: review spec — R-consolidate

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — add R-consolidate after R-orchestrator-await; name the script as the writer in P11, R11, R17 and G6

**Must-not-touch:** the P11 guard rules (`commentPath` equality, `summary_copy_path` resolution, no Bash copy); G3; R-orchestrator-await.

**Commit:** `docs(#9286): review-sdlc spec - R-consolidate script owns verdict`

**Notes:** W6b.4 change 8, re-planned by ruling Q1: the script must not weaken P11 or G3 (INV-10). R-consolidate and its writer names are one consequence, so one commit (F-review-consolidate-script-design-12).

**Acceptance criteria:**
- [ ] `R-consolidate` appears once, on the line after `R-orchestrator-await`, with its acceptance sub-bullet.
- [ ] P11, R11, R17 and G6 name `review-consolidate.js` as shown; every other word of P11 is unchanged.
- [ ] validate-spec-shape reports no finding for the file.

**Test proof:** `grep -c 'R-consolidate' docs/specs/review-sdlc.md` = 3 (definition, R11, P11); `grep -c 'review-consolidate.js' docs/specs/review-sdlc.md` ≥ 5 (adds R17 and G6); `grep -c 'written by the review-orchestrator with its Write tool' docs/specs/review-sdlc.md` = 0; validate-spec-shape exits 0.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`; the greps above.

**Contract:**
- shape (openspec): ADD after the `R-orchestrator-await` line:
  ```markdown
  - R-consolidate: Verdict, counts, the consolidated comment, `review-summary.json` and the orchestrator summary block are produced by `scripts/skill/review-consolidate.js` from per-dimension findings JSON (`<diff_dir>/<dimension>.findings.json`, written by each dimension subagent). The orchestrator's role is the judgment pass (semantic dedupe, contradictions, severity recalibration) over that JSON before consolidation. The script writes `review-summary.json` in one write to `summary_copy_path` (P11; `--summary-path` overrides the path for tests only), prints the summary block including the `Summary file:` and `Summary copy path:` lines, and on a malformed findings file exits 1 and writes nothing. A missing findings file of a dispatched dimension counts as a failed dimension (`Dimensions failed:`), not an error.
    - Acceptance: with the same manifest and findings input (same day) the script produces byte-identical `review-comment.md`, `review-summary.json` and stdout.
  ```
  MODIFY:
  ```diff
  - - R11: Orchestrator writes the consolidated comment body to `${manifest.diff_dir}/review-comment.md` and returns …
  + - R11: The orchestrator, through `review-consolidate.js` (R-consolidate), writes the consolidated comment body to `${manifest.diff_dir}/review-comment.md` and returns …
  ```
  R17:
  ```diff
  - … emitted as `manifest.plugin_version`; the review-orchestrator reads it verbatim — it MUST NOT re-derive …
  + … emitted as `manifest.plugin_version`; `review-consolidate.js` reads it verbatim — it MUST NOT re-derive …
  ```
  G6:
  ```diff
  - … and never computes a verdict or writes `review-comment.md` on partial or zero results (R-orchestrator-await)
  + … and never runs `review-consolidate.js` on partial or zero results (R-orchestrator-await)
  ```
  ```diff
  - - P11: `review-summary.json` `{schemaVersion, verdict, counts, dimensions, commentPath, branch}` written by the review-orchestrator with its Write tool, in one Write straight to `summary_copy_path` (… `verdict` per the orchestrator's verdict thresholds; …
  + - P11: `review-summary.json` `{schemaVersion, verdict, counts, dimensions, commentPath, branch}` written by `review-consolidate.js` (R-consolidate), which the review-orchestrator runs, in one write straight to `summary_copy_path` (… `verdict` per the REFERENCE.md §3 verdict thresholds; …
  ```
  (`…` = unchanged text.)
- names: `R-consolidate` (new); `R11`, `R17`, `G6`, `P11` (modified).
- mirror: `R-` requirement style with acceptance sub-bullet at `docs/specs/review-sdlc.md:30-31` (R-common-prompt).
- decisions: id `R-consolidate` (free; ruling Q4).
- sync: Tasks 12–14 implement it.

### Task 3: review spec — P11 not-JSON case (#9200)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — P11 stop list gains "not JSON"

**Must-not-touch:** the rest of P11.

**Commit:** `docs(#9286): review-sdlc spec - P11 names the not-JSON summary stop`

**Notes:** `SKILL.md:101` already stops on "not JSON"; the spec lagged (F-review-skill-steps-and-cleanup-11).

**Acceptance criteria:**
- [ ] P11 reads `When the file is missing, unreadable, not JSON or stale`.
- [ ] validate-spec-shape reports no finding.

**Test proof:** `grep -c 'missing, unreadable, not JSON or stale' docs/specs/review-sdlc.md` = 1.

**Verification:** the grep; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

**Contract:**
- shape (openspec): MODIFY P11:
  ```diff
  - … When the file is missing, unreadable or stale, the skill reports `Review summary missing: <summary_copy_path>` …
  + … When the file is missing, unreadable, not JSON or stale, the skill reports `Review summary missing: <summary_copy_path>` …
  ```
- names: `P11`.
- mirror: `SKILL.md:101` wording.
- decisions: none beyond the todo.
- sync: `SKILL.md` Step 2 (unchanged).

### Task 4: review spec — G3 kept stops, R5 routing, temp sweep (#9197, #9203)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — rewrite G3; amend R5 and E3

**Must-not-touch:** G1, G2, G4–G6; C11.

**Commit:** `docs(#9286): review-sdlc spec - G3 kept stops, R5 REFERENCE routing`

**Notes:** #9197 lets the spec either name the kept stops or add cleanup; naming them is narrower and keeps `review-comment.md` for the user after a link-gate stop. #9203's sweep is the backstop for every kept dir, so it is stated in the same sentence (F-review-skill-steps-and-cleanup-7, -8, -9, -13).

**Acceptance criteria:**
- [ ] G3, R5 and E3 read as below.
- [ ] validate-spec-shape reports no finding.

**Test proof:** `grep -c 'older than 24 hours' docs/specs/review-sdlc.md` = 1; `grep -c 'REFERENCE.md not found' docs/specs/review-sdlc.md` ≥ 2.

**Verification:** the greps; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

**Contract:**
- shape (openspec): MODIFY:
  ```diff
  - - G3: `diff_dir` removed by the skill after the terminal branch (including failures), except on the P11 summary-missing stop, which keeps it so `review-comment.md` stays readable; the manifest file persists under `.sdlc/execution/out/` and is pruned by `writeOutput` and the session-start sweep
  + - G3: `diff_dir` is removed by the skill in Step 6 after the terminal branch. Four stops keep it: the P11 summary-missing stop and the Step 4 link-verification stop (both so `review-comment.md` stays readable), the second orchestrator failure and the `Review failed: REFERENCE.md not found` return (R5; error-report-sdlc runs instead of Step 6 on both). A `diff_dir` left by these stops or by a denied removal is deleted by the next `skill/review.js` run once it is older than 24 hours (`sdlc-review-*` dirs under the OS temp dir); the same sweep removes the one a `--dry-run` run leaves today (aligning R3's clean-up with that is a follow-up). The manifest file persists under `.sdlc/execution/out/` and is pruned by `writeOutput` and the session-start sweep
  ```
  ```diff
  - - E3: Orchestrator fails once → re-dispatch with same inputs
  + - E3: Orchestrator fails once → re-dispatch with same inputs (a `Review failed: REFERENCE.md not found` return → error-report-sdlc at once, R5)
  ```
  ```diff
  - - R5: On orchestrator failure, re-dispatch once with the same inputs; on second failure, invoke error-report-sdlc
  + - R5: On orchestrator failure, re-dispatch once with the same inputs; on second failure, invoke error-report-sdlc. A `Review failed: REFERENCE.md not found` return goes to error-report-sdlc at once: a re-dispatch with the same inputs fails the same way
  ```
- names: `G3`, `R5`, `E3`.
- mirror: G-line style `docs/specs/review-sdlc.md:101-106`.
- decisions: kept stops over cleanup-on-stop; 24 h TTL (Key Decisions).
- sync: Task 16 implements the routing sentence, the sweep and the Step 6 note.

### Task 5: review spec — R15 model validation sentence (#9207)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 4
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — append one sentence to R15

**Must-not-touch:** the existing R15 sentences; C5.

**Commit:** `docs(#9286): review-sdlc spec - R15 rejects unknown dimension models`

**Notes:** One sentence, as the todo asks (F-dimension-validation-and-glob-matching-5).

**Acceptance criteria:**
- [ ] R15 ends with the sentence below.
- [ ] validate-spec-shape reports no finding.

**Test proof:** `grep -c 'fails dimension validation (D13 error)' docs/specs/review-sdlc.md` = 1.

**Verification:** the grep; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

**Contract:**
- shape (openspec): MODIFY R15 — append after `… the Copilot transform in \`setup-sdlc\` MUST omit it.`:
  ```markdown
   A `model:` value other than a Claude alias (`haiku`, `sonnet`, `opus`, `fable`) or a `claude-*` model id fails dimension validation (D13 error), and `skill/review.js` names the dropped dimension on stderr; `review-summary.json` records the model each dispatched dimension ran on as `dimensions[].model`.
  ```
- names: `R15`.
- mirror: R15 at `docs/specs/review-sdlc.md:29`.
- decisions: alias list and error-for-strings (Deviations).
- sync: Task 18 (D13), Task 12 (`dimensions[].model`).

### Task 6: review spec — R-orchestrator-await clause (a), C2 (#9263, W6b.3)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 5
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — rewrite clause (a) of R-orchestrator-await; reword C2

**Must-not-touch:** R-orchestrator-await clauses (b) and (c) and its id; G6.

**Commit:** `docs(#9286): review-sdlc spec - await clause (a) drops background flag`

**Notes:** Ruling Q4: rewrite only clause (a), keep the id and the barrier. "of a batch" keeps it consistent with R-dimension-cap (Deviations). C2 follows the W6b.3 change to `SKILL.md` (F-review-skill-steps-and-cleanup-22, -25).

**Acceptance criteria:**
- [ ] `grep -c 'run_in_background' docs/specs/review-sdlc.md` = 0.
- [ ] C2 reads as below; validate-spec-shape reports no finding.

**Test proof:** the grep above; `grep -c 'orchestrator resolves it' docs/specs/review-sdlc.md` = 0.

**Verification:** the greps; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

**Contract:**
- shape (openspec): MODIFY:
  ```diff
  - … before consolidating. (a) Every Step 2 dispatch uses `run_in_background: false`; (b) the turn is not complete …
  + … before consolidating. (a) all dimension dispatches of a batch are sent in one message (R-dimension-cap); (b) the turn is not complete …
  ```
  ```diff
  - - C2: Must not read REFERENCE.md in main context (orchestrator resolves it)
  + - C2: Must not read REFERENCE.md in main context (the orchestrator reads it from `REFERENCE_MD_PATH`, C13)
  ```
- names: `R-orchestrator-await`, `C2`.
- mirror: the existing clause list.
- decisions: "of a batch" wording (Deviations).
- sync: Task 10 (orchestrator text), `SKILL.md:271` (Task 10).

### Task 7: ship spec — R7 forwards `--auto` to review-sdlc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — rewrite R7

**Must-not-touch:** every other ship requirement.

**Commit:** `docs(#9286): ship-sdlc spec - R7 forwards --auto to review-sdlc`

**Notes:** W8.36 change (1); R7 is at `docs/specs/ship-sdlc.md:329` (ruling Q4; F-review-auto-post-flag-resolution-6).

**Acceptance criteria:**
- [ ] R7 reads as below; `grep -c 'has no prompts to skip' docs/specs/ship-sdlc.md` = 0.
- [ ] validate-spec-shape reports no finding for the ship spec.

**Test proof:** the grep above.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`.

**Contract:**
- shape (openspec): MODIFY:
  ```diff
  - - R7: `--auto` forwarding audit: forwarded to execute-plan-sdlc only when ship runs with `--auto`; always forwarded to commit-sdlc, received-review-sdlc, version-sdlc and pr-sdlc, whose consent ship asks in its main context first in interactive runs (`confirm_<step>`; `review_gate` for received-review); not forwarded to review-sdlc, which has no prompts to skip.
  + - R7: `--auto` forwarding audit: forwarded to execute-plan-sdlc and review-sdlc only when ship runs with `--auto` (review-sdlc then takes its post decision from its own default, `yes` with a PR and `save` without one, review-sdlc P12); always forwarded to commit-sdlc, received-review-sdlc, version-sdlc and pr-sdlc, whose consent ship asks in its main context first in interactive runs (`confirm_<step>`; `review_gate` for received-review).
  ```
- names: `R7`.
- mirror: current R7 line.
- decisions: forward only under `--auto` (mirrors execute-plan-sdlc).
- sync: Task 20 (`ship.js`, ship SKILL.md, docs).

### Task 8: review-sdlc SKILL.md — W6b.1 (rest)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 7
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — argument-hint, retry sentence, Step 3 DO-NOT block, Step 4 opening, last DO-NOT bullet

**Must-not-touch:** the Step 0 bash block and the `gh api` / `links.js` / save blocks; the R13/G5/R14/R16 anchors; `SKILL.md:36` (`Do NOT read the manifest file contents`), the `Do NOT delete the manifest file here.` line, the other DO-NOT bullets of `## DO NOT`; the `--output-file` text.

**Commit:** `fix(#9286): review-sdlc - argument-hint, single-rule prose (W6b.1)`

**Notes:** Items 2 and 3 of W6b.1 are done at the base (Research Findings). Each rule is stated once with its reason (F-review-skill-steps-and-cleanup-1 to -5). `--auto`/`--post` are added later by Task 19, after the flags exist.

**Acceptance criteria:**
- [ ] `argument-hint` lists the 8 flags of the description.
- [ ] `### DO NOT (Step 3 display)` is gone and the reason sentence follows `posting prompt is shown.`
- [ ] The retry sentence, the Step 4 opening and the last DO-NOT bullet read as below.
- [ ] `check-consistency.js` passes.

**Test proof:** `grep -c 'DO NOT (Step 3 display)' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0; `grep -c 'the user must see every finding before being asked to post it' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 1; `grep -c 'Do NOT re-dispatch the orchestrator to post' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0; `grep -ni trap plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` empty.

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js`; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` (no new review-sdlc finding); the greps. Optional owner-run behavioral check: `--filter-pattern "step-3-full-body-display"` on `promptfooconfig.yaml` (assertions unchanged).

**Contract:**
- shape (code): edits, bottom-up:
  ```diff
   - Do NOT invoke error-report-sdlc for user errors — only for script crashes (exit 2)
  -- Do NOT re-dispatch the orchestrator to post the comment — use the `comment_file` from its summary
  ```
  ```diff
  -This step runs entirely in the main context. It MUST NOT dispatch a new Agent, and
  -MUST NOT re-invoke the orchestrator. The comment body at `comment_file` is authoritative.
  +This step runs entirely in the main context and must not dispatch a new Agent or re-invoke the orchestrator — a second review costs a full fan-out and can return different findings, so `comment_file` is authoritative.
  ```
  ```diff
      placeholders. The full body must be visible in the terminal before Step 4's
  -   posting prompt is shown.
  -
  -   ### DO NOT (Step 3 display)
  -
  -   - Do NOT summarize or paraphrase findings — emit the file contents byte-for-byte
  -   … (the block through `"complete" — the summary is metadata only`)
  +   posting prompt is shown. The orchestrator summary carries only counts; the user must see every finding before being asked to post it.
  
   Do NOT delete the manifest file here.
  ```
  ```diff
  -step=Step 2 — orchestrator dispatch, error=agent error output. A failure retry counts
  -as the same attempt for quality-gate G4 — user confirmation in Step 4 MUST NOT trigger
  -a new orchestrator dispatch.
  +step=Step 2 — orchestrator dispatch, error=agent error output. The retry counts as the same attempt (quality gate G4).
  ```
  ```diff
  -argument-hint: "[--base <branch>] [--committed] [--staged] [--dimensions <name,...>]"
  +argument-hint: "[--base <branch>] [--committed] [--staged] [--working] [--worktree] [--set-default] [--dimensions <name,...>] [--dry-run]"
  ```
- names: `argument-hint`; Step 2 failure paragraph; Step 3 item 3; Step 4 opening; `## DO NOT`.
- mirror: description flag list at `SKILL.md:3`.
- decisions: source W6b.1 items 1, 4–7 verbatim.
- sync: `docs/skills/review-sdlc.md` flags table already lists the 8 flags.

### Task 9: REFERENCE.md §2 template and EXAMPLES.md bullets (W6b.2)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6, Task 7
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — replace the §2 fenced template
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — drop two bullets, replace one

**Must-not-touch:** the `**Diff scoping:**` paragraph; REFERENCE §0, §1, §3 (template, verdict, dedupe, contradiction rules); the `**OWASP**` field name; `## Severity Baseline` in EXAMPLES; `_common.md` injection code and R-common-prompt; `tests/promptfoo/fixtures-fs/project-with-dimensions/.sdlc/review-dimensions/_common.md`.

**Commit:** `refactor(#9286): review-sdlc - static-first subagent template (W6b.2)`

**Notes:** Static-first keeps the prompt prefix identical across the N dispatches, so it can be cached; only `## This run` varies. Output stays markdown here; Task 14 switches it to JSON (F-review-skill-steps-and-cleanup-14, -15).

**Acceptance criteria:**
- [ ] The §2 fence holds exactly the skeleton below; the paragraph before the fence and `**Diff scoping:**` after it are unchanged.
- [ ] `grep -n "do not read other files\|Maximum 20\|fabricate\|How to Use Them\|MUST read" plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` is empty.
- [ ] `grep -n "flag it rather\|Scan recent git history\|Search the entire changeset" plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` is empty.

**Test proof:** the two greps; `grep -c '^## This run' plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` = 1; `grep -c '\*\*OWASP\*\*' plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` = 1 (the §2 `**OWASP**` field; the §3 rule reads `**OWASP:**`, which this pattern does not match).

**Verification:** the greps; `node .claude/skills/validate-plugin-consistency/check-consistency.js`. Optional owner-run behavioral check: the OWASP A01 case (`--filter-pattern "OWASP A01"`; assertions still match the markdown fields).

**Contract:**
- shape (docs): REPLACE the fenced block from `# Code Review: {dimension.name}` through `- Maximum 20 findings (prioritize by severity if more exist)` with this skeleton, verbatim:
  ```text
  # Code Review

  ## Your Role
  You are a code reviewer. Your dimension, default severity and input files are listed under "This run" at the end of this prompt.

  ## Input
  Read both files first. `body` in the slice file is your review brief, `matched_files` your scope, `file_context` the author's intent (empty `commits` arrays mean there is no commit context, e.g. staged or working changes), and `warnings` prepare-time caveats to surface. The diff file holds the pre-filtered hunks for your matched files.

  ## Scope and Verification
  Report findings only in `matched_files`. Read other files in the repository when you need them to confirm a finding (callers, tests, config) — a finding you could not confirm is reported as such, not omitted. Stay within the concerns of the review brief.

  ## What to Report
  Report a finding only when you can name the concrete input or state under which the code misbehaves, or the specific rule in the review brief it violates, and point at the line. Do not pad with style preferences the brief does not ask for; an empty list is a valid result. If more than ~20 qualify, report the most severe and say how many were omitted.

  ## Output Format
  Return your findings as a structured list. Each finding must follow this exact format:

  ### Finding N
  - **File**: {relative file path}
  - **Line**: {line number or range, e.g., 42 or 42-48}
  - **Severity**: {critical|high|medium|low|info}
  - **OWASP**: {A01–A10, OPTIONAL — populate ONLY when the review brief instructs OWASP tagging; omit this line entirely otherwise}
  - **Title**: {one-line summary, max 80 chars}
  - **Description**: {what is wrong and why it matters, 1-3 sentences}
  - **Suggestion**: {how to fix it, 1-3 sentences — "N/A" if no clear fix}

  If you find zero issues, state: "No findings for this dimension." Each finding must reference a specific file and line number. If you left out qualifying findings, end with `Omitted: N`.

  ## This run
  - Dimension: {dimension.name} — {dimension.description}
  - Default severity (unless the review brief says otherwise): {dimension.severity}
  - Slice file (JSON): `{dimension.slice_file}`
  - Diff file: `{dimension.diff_file}`
  ```
  EXAMPLES.md:
  ```diff
  -- Search the entire changeset, not just modified lines
   - Check both implementation and test files
   - Review the project's dependency list if the issue relates to external packages
  -- Scan recent git history if the pattern seems too obvious to be missing
  -- When in doubt, flag it rather than skip it — false positives are cheaper than false negatives
  +- Report what you can confirm; where you are unsure, say what you checked and what remains unverified rather than dropping it or asserting it.
  ```
- names: headings `## Your Role`, `## Input`, `## Scope and Verification`, `## What to Report`, `## Output Format`, `## This run`.
- mirror: source W6b.2 skeleton (wave-1-source.md:95-127).
- decisions: copy verbatim; markdown output until Task 14.
- sync: orchestrator Step 2 (Task 10 fills `## This run`).

### Task 10: review-orchestrator.md and SKILL.md — W6b.3 (rest)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 8, Task 9
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — description, Step 2 tail, dispatch line, await barrier once, zero-findings, quality gate, DO-NOT bullets
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — `## DO NOT` REFERENCE bullet

**Must-not-touch:** the R-manifest-index-slices guidance (Step 0 and Step 2 item 1); the `**Dispatch each batch in a SINGLE message**` paragraph; Step 5/6 text (Task 14 replaces it); frontmatter `model: sonnet`; `docs/cost-tiers.md`.

**Commit:** `fix(#9286): review-sdlc - await barrier once, model reason (W6b.3)`

**Notes:** The Agent tool has no `run_in_background` parameter here, so the token goes; rule 13 needs only the one remaining `R-orchestrator-await` line (ruling Q7). The `#447` refs in untouched lines wait for Task 24 (F-review-skill-steps-and-cleanup-16 to -21).

**Acceptance criteria:**
- [ ] `grep -n "~/.claude\|defaults to opus\|Await guard\|#487\|run_in_background" plugins/sdlc-utilities/agents/review-orchestrator.md` is empty.
- [ ] `grep -c "R-orchestrator-await" plugins/sdlc-utilities/agents/review-orchestrator.md` = 1.
- [ ] `check-consistency.js` passes (rule 13 included).

**Test proof:** the two greps; `check-consistency.js` exit 0.

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js`; `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --strict`; the greps.

**Contract:**
- shape (code): orchestrator edits, bottom-up:
  ```diff
  -- Dispatch dimension subagents without `model:` — omitting the parameter defaults to opus. Use `dimension.model || manifest.subagent_model` (per-dimension override wins; manifest is the fallback)
  -- Consolidate, compute a verdict, or write `review-comment.md` before collecting one result per dispatched dimension (count == N), or end your turn with any subagent still outstanding (R-orchestrator-await, #487)
  +- Dispatch dimension subagents without `model:` — omitting it inherits this orchestrator's model instead of the dimension's chosen tier. Use `dimension.model || manifest.subagent_model` (per-dimension override wins; manifest is the fallback)
  ```
  ```diff
  -- Await barrier satisfied — all dimensions (ACTIVE or TRUNCATED) were dispatched with `run_in_background: false`, and exactly N results collected before consolidation (R-orchestrator-await, #487)
   - Deduplication pass completed
  ```
  ```diff
  -- **Zero findings credibility**: dimension returned "No findings" — does the diff
  -  for that dimension actually contain potential issues?
  +- **Zero findings**: a dimension with many matched files returned none — say so in the comment ("no findings; N files in scope") rather than re-reviewing.
  ```
  ```diff
  -**Await guard (R-orchestrator-await, #487):** Before critiquing, confirm the collected-result count equals N … on partial or zero results.
  -
   After all subagents return:
  ```
  ```diff
  -**Await barrier (R-orchestrator-await, #487):** Your turn is NOT complete until you have collected exactly one result per dispatched dimension — … Never consolidate on partial or zero results.
  +**Await barrier (R-orchestrator-await):** Consolidate only after one result per dispatched dimension has arrived (N = dimensions with status ACTIVE or TRUNCATED); if the harness returns before they do, wait for the task notifications.
  ```
  ```diff
  -3. Dispatch via Agent tool (subagent_type: general-purpose, model: dimension.model || manifest.subagent_model, run_in_background: false)
  -   - **`run_in_background: false` is mandatory on every dispatch** (R-orchestrator-await, #487). Agent dispatch defaults to background; …
  +3. Dispatch via Agent tool (subagent_type: general-purpose, model: dimension.model || manifest.subagent_model)
      - Per-dimension precedence: …
  ```
  ```diff
  -   - `{dimension.slice_file}` and `{dimension.diff_file}` → the path strings (the subagent reads them). Put these per-run paths in the **dynamic tail** of the prompt (after the static REFERENCE template prefix) for cache stability.
  +   - `{dimension.slice_file}` and `{dimension.diff_file}` → the path strings (the subagent reads them). Fill the `## This run` block at the end of the template with them; everything above it is the static prefix.
  ```
  ```diff
  -description: Orchestrates multi-dimension code review. Reads manifest from a temp file, resolves REFERENCE.md, dispatches …
  +description: Orchestrates multi-dimension code review. Reads manifest from a temp file, reads REFERENCE.md, dispatches …
  ```
  SKILL.md:
  ```diff
  -- Do NOT read REFERENCE.md in main context (the orchestrator resolves it)
  +- Do NOT read REFERENCE.md in main context (the orchestrator reads it from REFERENCE_MD_PATH)
  ```
- names: `**Await barrier (R-orchestrator-await):**` (the single barrier line).
- mirror: source W6b.3 changes 4–8.
- decisions: barrier text verbatim from source change 5.
- sync: spec R-orchestrator-await (a) (Task 6); validator rule 13.

### Task 11: review.js — resolve `--auto`, `--post`, `post_decision`, `save_path` (W8.36, #9282)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — `parseArgs`, `main()` resolution and manifest fields
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — new cases `review-prepare-post: …`

**Must-not-touch:** `fetchPrMetadata` use; dimension matching; `summary_copy_path`; slice/diff writing.

**Commit:** `feat(#9286): review-sdlc - prepare resolves --auto and --post (W8.36)`

**Notes:** P12 is the single resolution site (Task 1). `--post` validation happens before any git work, so a bad value fails fast with exit 1 (F-review-auto-post-flag-resolution-1, -2, -9).

**Acceptance criteria:**
- [ ] The manifest carries `flags`, `post_decision` and `save_path` per the table below.
- [ ] `--post bogus` exits 1 with the P12 error text and writes no `diff_dir`.
- [ ] The five new exec cases pass.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-prepare-post" -j 2 --no-cache -o /tmp/pf-m8w1-t11.json` — 5 of 5 pass (the four below plus the missing-value case in the Contract; cases: default → `flags.auto` false, `post_decision` null; `--auto` → `save` (the fixture has no remote, so `pr.exists` is false); `--auto --post none` → `none`; `--post bogus` → output contains `--post must be yes, save or none (got: bogus)`). Each case runs `review.js --committed --base main …` on `file://fixtures-fs/worktree-linked-ahead` with `script_cwd: "{{project_root}}/worktrees/wt1"` (the summary_copy_path case's setup). The `pr.exists: true` rows of the table need a gh stub and are left to the owner-run behavioral cases of Task 19.

**Verification:** the targeted run above; `node .claude/skills/validate-plugin-consistency/check-consistency.js`.

**Contract:**
- shape (code): `parseArgs` gains two branches and returns `auto`, `post`:
  ```diff
       else if (a === '--set-default') setDefault = true;
  +    else if (a === '--auto')        auto = true;
  +    else if (a === '--post')        post = (i + 1 < args.length) ? args[++i] : '';
     }
  -  return { projectRoot, baseBranch, dimensionFilter, scope, setDefault };
  +  return { projectRoot, baseBranch, dimensionFilter, scope, setDefault, auto, post };
  ```
  Manifest field-diff (after `pr` is known):
  ```diff
    { "version": 1, …,
      "pr": { … },
  +   "flags": { "auto": false, "post": null, "skipConfigCheck": false },
  +   "post_decision": null,
  +   "save_path": "/abs/worktree/.sdlc/reviews/feature-cwd-test-2026-11-05.md",
      "diff_dir": "…", "summary_copy_path": "…" }
  ```
  Resolution table:

  | `--post` | `--auto` | `pr.exists` | `post_decision` | stderr |
  |---|---|---|---|---|
  | unset | no | any | `null` | — |
  | unset | yes | true | `yes` | — |
  | unset | yes | false | `save` | — |
  | `yes` | any | true | `yes` | — |
  | `yes` | any | false | `save` | `Warning: --post yes needs an open PR; saving the review instead.` |
  | `save` / `none` | any | any | that value | — |
  | other, or `--post` as the last argument (empty value) | any | any | — (exit 1, `errors: ["--post must be yes, save or none (got: <v>)"]`; `<v>` is empty for a missing value) | the same error text, one line |

  `save_path` = `path.join(activeRoot, '.sdlc', 'reviews', \`${branch.replace(/[^a-zA-Z0-9_-]/g, '-')}-${YYYY-MM-DD local}.md\`)`, branch = `gitState.currentBranch || 'nobranch'`. The `--post` check runs right after `parseArgs`, before `ensureConfigVersion`: it writes the error line to stderr (SKILL Step 0 shows stderr on exit 1, and `writeOutput` prints only the file path, `lib/output.js:47-51`), then calls `writeOutput({ errors, warnings: [], flags }, 'review-manifest', 1)`. A fifth exec case covers the missing value: `review-prepare-post: --post with no value is an error` (`script_args` ends with `--post`) asserts the output contains `--post must be yes, save or none (got: )`.
- names: `auto`, `post`, `flags`, `post_decision`, `save_path`.
- mirror: `pr.js` `--auto` parsing (`scripts/skill/pr.js:83`); the config-error `writeOutput(…, 'review-manifest', 1)` call at `review.js:520-525`.
- decisions: degrade `yes`→`save` without a PR (Deviations).
- sync: spec P12 (Task 1); Task 12 relays the fields.

### Task 12: review-consolidate.js, schema `model`, scripts README (W6b.4 part 1)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 2, Task 5, Task 11
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/skill/review-consolidate.js`
- Modify: `schemas/review-summary.schema.json` — optional `model` on dimension items
- Modify: `plugins/sdlc-utilities/scripts/README.md` — review-sdlc row lists the new script

**Must-not-touch:** the REFERENCE §3 template text and verdict thresholds (copied exactly); the required schema properties; `lib/output.js`.

**Commit:** `feat(#9286): review-sdlc - review-consolidate.js renders verdict (W6b.4)`

**Notes:** Rendering moves verbatim from orchestrator Step 1 and REFERENCE §3, so the comment a user sees does not change shape. The script is the only writer of the summary, which keeps P11 (ruling Q1). The verdict counts after dedupe, as REFERENCE §3 implies (F-review-consolidate-script-design-1 to -5, -13).

**Contract:**
- shape (code): CLI

  | Invocation | Effect |
  |---|---|
  | `--render-plan --manifest <p>` | prints the Step 1 plan text (`renderPlan(manifest)`, implemented from the `review-orchestrator.md` Step 1 text and keeping its layout and wording: plan table, scope labels, plan_critique warnings incl. batches, suggestions block, still-uncovered block, uncommitted-change warnings); exit 0 |
  | `--manifest <p> --findings <dir> --output-dir <dir> [--summary-path <p>]` | consolidates; writes `<output-dir>/review-comment.md` and the summary file; prints the summary block; exit 0 |

  `--findings <dir>` reads `<dir>/<name>.findings.json` for each dimension with status ACTIVE or TRUNCATED. `--output-dir` is created when missing. `--summary-path` defaults to `manifest.summary_copy_path` (its parent dir is created with `fs.mkdirSync(…, { recursive: true })`). The assessment sentence is fixed: `{C} critical, {H} high, {M} medium finding(s) across {N} dimension(s).` (The source item's `--assessment` override and single-file `--findings` form are left out: no caller uses them.)

  Findings file (written by subagents):
  ```json
  { "dimension": "<name>", "status": "ok|no-findings|error",
    "findings": [ { "file": "src/a.ts", "line": 42, "severity": "critical|high|medium|low|info",
                    "title": "...", "description": "...", "suggestion": "...",
                    "owasp": "A01", "alsoFlaggedBy": ["name"], "note": "..." } ],
    "omittedCount": 0, "error": "<only when status=error>" }
  ```
  `line` is an integer or a range string (`"42-48"`); `owasp`, `alsoFlaggedBy`, `note` optional. Valid file: parses as JSON, `dimension` equals the filename stem, `status` in the enum, each finding has string `file`/`title`/`description`/`suggestion`, a valid `severity` and `line`.

  Exit codes:

  | Condition | Exit | Output |
  |---|---|---|
  | success | 0 | summary block on stdout (`emitText`) |
  | missing/unreadable `--manifest`, missing required arg, a findings file failing validation | 1 | stderr `review-consolidate: <file>: <reason>`; nothing written |
  | missing findings file of a dispatched dimension | 0 | rendered as failed (`_Dimension failed: no findings file returned._`), counted in `Dimensions failed:` |
  | unexpected crash | 2 | stderr message |

  Call order (consolidate mode):

  1. `main` → `readManifest(--manifest)` → manifest, or exit 1.
  2. `main` → `dispatched = manifest.dimensions.filter(status ∈ {ACTIVE, TRUNCATED})`.
  3. `main` → `loadFindings(dir, dispatched)` → per-dimension results; any invalid file → exit 1 before any write; a missing file → `{ status: "error", error: "no findings file returned" }`.
  4. `main` → `dedupe(results, manifest)` → findings sharing `file:line` across dimensions keep the one from the dimension with higher `manifest.dimensions[].severity` (tie: higher finding severity, then dimension name A→Z); the others are named in `alsoFlaggedBy`.
  5. `main` → `count(results)` → per-dimension and total severity counts, after dedupe.
  6. `main` → `verdict(counts)` → `CHANGES REQUESTED` (any critical or ≥3 high) | `APPROVED WITH NOTES` (any high or ≥5 medium) | `APPROVED`.
  7. `main` → `renderComment(…)` → `<output-dir>/review-comment.md` per the comment layout below.
  8. `main` → `writeSummary(--summary-path)` → summary JSON (field-diff below).
  9. `main` → `emitText(renderBlock(…))` → stdout block below, exit 0.

  Comment layout (REFERENCE §3 template, filled):

  | Part | Rendered as |
  |---|---|
  | header | `## Code Review — {N} dimension(s), {M} finding(s)` (N = dispatched, M = total after dedupe) |
  | attribution | `> Automated review by \`review-sdlc\` v{manifest.plugin_version} · {YYYY-MM-DD}` |
  | summary | the §3 table, one row per dispatched dimension, then the `**Total**` row |
  | verdict | `### Verdict: {VERDICT}`, then the assessment sentence |
  | per dimension (manifest order) | `### {name} — {n} finding(s)`, `<details>` with the counts summary, then per finding `#### [{SEVERITY}] {title}` / `**File:** \`{file}:{line}\`` (+ ` · OWASP {code}` when set) / description / `**Suggestion:** …` / `Also flagged by: …` / `Note: …` |
  | finding order | severity desc, then file, then line |
  | zero findings | `No findings; {matched_count} files in scope.` |
  | failed dimension | `_Dimension failed: {error}._` |
  | omitted | `_{omittedCount} additional finding(s) omitted by the reviewer._` when `omittedCount > 0` |

  Summary JSON field-diff vs today:
  ```diff
    { "schemaVersion": 1, "verdict": "…", "counts": { … },
      "dimensions": [ { "name": "security-review", "status": "ACTIVE", "findings": 2,
  +                     "model": "sonnet" },            # dispatched only: dimension.model || manifest.subagent_model
                      { "name": "docs", "status": "SKIPPED", "findings": 0 } ],
      "commentPath": "<abs review-comment.md>", "branch": "<manifest.current_branch>" }
  ```
  (`dimensions[]` lists manifest entries with status ACTIVE, TRUNCATED or SKIPPED.)

  Stdout block (existing lines byte-identical to `review-orchestrator.md` Step 6; three new lines appended):
  ```text
  Review complete
    Dimensions run:  {active} ({skipped} skipped — no matching files)
    Dimensions failed: {K}            ← only when K > 0
    Total findings:  {total}
      critical: {C} | high: {H} | medium: {M} | low: {L} | info: {I}
    Verdict:         {VERDICT}
    Scope:           {scope label}
    Branch:          {manifest.current_branch}
    Comment file:    {abs <output-dir>/review-comment.md}
    Summary file:    {summary path}
    Summary copy path: {summary path}
    PR exists:       {true|false}
    PR owner:        {manifest.pr.owner or "—"}
    PR repo:         {manifest.pr.repo or "—"}
    PR number:       {manifest.pr.number or "—"}
    Diff dir:        {manifest.diff_dir}
    Post decision:   {manifest.post_decision or "ask"}
    Auto:            {manifest.flags.auto === true}
    Save path:       {manifest.save_path}
  ```
  Schema edit: in `dimensions.items.properties` add `"model": { "type": "string" }` (not required), and in the same edit change the top-level `description` from `… written by the review-orchestrator to summary_copy_path …` to `… written by scripts/skill/review-consolidate.js to summary_copy_path …`. README: `| review-sdlc | \`skill/review.js\`, \`skill/review-consolidate.js\` |`.
- names: `review-consolidate.js`, `renderPlan`, `--render-plan`, `--manifest`, `--findings`, `--output-dir`, `--summary-path`.
- mirror: arg parsing and entry guard of `scripts/skill/review.js:91-112,669-676`; `emitText` (`scripts/lib/output.js:131`).
- decisions: Key Decisions (script vs model; relay lines); `--summary-path` (Deviations).
- sync: REFERENCE §3 (template source); `SKILL.md` Step 2/3 parsing; `ship.js` review-gate reads the same summary file.

**Acceptance criteria:**
- [ ] The CLI, exit codes, findings schema, algorithm and stdout block follow the Contract exactly.
- [ ] `review-summary.json` validates against the schema, and its `commentPath` equals the printed `Comment file:` value.
- [ ] Two runs on the same input on the same day give byte-identical outputs.
- [ ] Task 13's exec cases pass (verified there).

**Test proof:** covered by Task 13's targeted run (`--filter-pattern "review-consolidate"`); Tasks 12 and 13 run back-to-back in the same wave order. Here: `node plugins/sdlc-utilities/scripts/skill/review-consolidate.js` with no args exits 1 with a usage line on stderr.

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js`; `node -e "JSON.parse(require('fs').readFileSync('schemas/review-summary.schema.json','utf8'))"`.

### Task 13: review-consolidate exec dataset and fixtures (W6b.4 part 2)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 12
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/datasets/review-consolidate-exec.yaml`
- Create: `tests/promptfoo/scripts/run-review-consolidate-twice.js` — byte-identical probe helper
- Create: `tests/promptfoo/fixtures-fs/review-consolidate/` — `manifest.json` (3 dimensions: 2 ACTIVE, 1 SKIPPED; `plugin_version` `"0.20.7"`; `post_decision` `"save"`; `flags.auto` true) and dirs `findings-1critical`, `findings-3high`, `findings-1high`, `findings-5medium`, `findings-4medium`, `findings-mixed`, `findings-empty`, `findings-malformed`, `findings-missing`, each holding `<dimension>.findings.json` files
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register the dataset after `review-prepare-exec.yaml`

**Must-not-touch:** other datasets; `fixtures-fs/review-summaries/`.

**Commit:** `test(#9286): review-sdlc - review-consolidate exec cases (W6b.4)`

**Notes:** Each case uses its own fixture copy and `--summary-path {{project_root}}/summary.json`, so cases never share a path under exec concurrency (F-review-consolidate-script-design-6 to -9). The plugin_version assertion moves here from `review-sdlc.yaml` (Task 15).

**Acceptance criteria:**
- [ ] Every case description starts with `review-consolidate: `.
- [ ] The cases in the table pass.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-consolidate" -j 2 --no-cache -o /tmp/pf-m8w1-t13.json` — all cases pass.

**Verification:** the targeted run above.

**Contract:**
- shape (code): cases (all `script_path: "repo://plugins/sdlc-utilities/scripts/skill/review-consolidate.js"`, `project_root: "file://fixtures-fs/review-consolidate"`, `script_args: "--manifest {{project_root}}/manifest.json --findings {{project_root}}/<dir> --output-dir {{project_root}}/out --summary-path {{project_root}}/summary.json"`):

  | Description | Findings dir | Asserts |
  |---|---|---|
  | `review-consolidate: 1 critical gives CHANGES REQUESTED` | findings-1critical | `Verdict:         CHANGES REQUESTED` |
  | `review-consolidate: 3 high give CHANGES REQUESTED` | findings-3high | same |
  | `review-consolidate: 1 high gives APPROVED WITH NOTES` | findings-1high | `Verdict:         APPROVED WITH NOTES` |
  | `review-consolidate: 5 medium give APPROVED WITH NOTES` | findings-5medium | same |
  | `review-consolidate: 4 medium give APPROVED` | findings-4medium | `Verdict:         APPROVED` |
  | `review-consolidate: no findings gives APPROVED and 0 total` | findings-empty | `Total findings:  0`, `Verdict:         APPROVED` |
  | `review-consolidate: malformed findings file exits 1 and names it` | findings-malformed | icontains `review-consolidate: ` and the fixture filename; not-contains `Review complete` |
  | `review-consolidate: missing findings file counts a failed dimension` | findings-missing | `Dimensions failed: 1` |
  | `review-consolidate: comment carries attribution, dedupe and OWASP` | findings-mixed | javascript: reads the `Comment file:` path, checks `(?m)^> Automated review by \`review-sdlc\` v0\.20\.7 · \d{4}-\d{2}-\d{2}$`, one `### Verdict:` line, `Also flagged by:`, `· OWASP A01`, `_2 additional finding(s) omitted by the reviewer._` |
  | `review-consolidate: summary JSON matches block and schema fields` | findings-mixed | javascript: reads `summary.json`; `commentPath` equals the `Comment file:` value; `counts` keys are exactly the five severities; dispatched entries carry `model` |
  | `review-consolidate: block relays post decision lines` | findings-1high | contains `Post decision:   save`, `Auto:            true`, `Save path:` |
  | `review-consolidate: --render-plan prints the review plan` | — (`script_args: "--render-plan --manifest {{project_root}}/manifest.json"`) | contains `Review Plan`, the scope label line, `Changed files:`, the `active, … skipped` counts line and the SKIPPED dimension row |
  | `review-consolidate: same input gives byte-identical output` | findings-mixed | helper `tests/promptfoo/scripts/run-review-consolidate-twice.js` (`script_path: "repo://tests/promptfoo/scripts/run-review-consolidate-twice.js"`) that runs the script twice into two out dirs and prints whether both comment files and stdouts are equal after replacing each out-dir path with `<out>` and each `\d{4}-\d{2}-\d{2}` date with `<date>` (so a run across midnight cannot differ); asserts `true` |
- names: dataset `review-consolidate-exec.yaml`; fixture dir `fixtures-fs/review-consolidate/`.
- mirror: `tests/promptfoo/datasets/review-prepare-exec.yaml:1-30` (vars and javascript asserts).
- decisions: per-case fixture copy plus `--summary-path` (Deviations).
- sync: Task 12 CLI.

### Task 14: orchestrator runs the script; REFERENCE asks for JSON (W6b.4 part 3)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 10, Task 12
**Verify:** lint, tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — Steps 1–6 and Quality Gates replaced by the new step list; Inputs gain `PLUGIN_ROOT`
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — §2 `## Output Format` asks for a findings JSON file; `## This run` gains `Findings file:`; §3 gains one note line
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — Step 2 prompt adds `PLUGIN_ROOT:`
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — one `review-orchestrator-consolidate: …` case

**Must-not-touch:** Step 0 of the orchestrator (thin-index guidance, REFERENCE_MD_PATH rule), except its `Read REFERENCE.md — you need sections 2 …` line; the Step 2 dispatch, batch and await text from Task 10; `## DO NOT` (Task 10 bullets); REFERENCE §1, the §3 template, thresholds and rules; the skill's Step 3/4 parsing and posting logic; R14.

**Commit:** `refactor(#9286): review-sdlc - orchestrator runs the script (W6b.4)`

**Notes:** Rule 1b rejects a literal `<PLUGIN_ROOT>/scripts/` in `agents/*.md`, which is why the agent text uses the brace form. One writer for the summary (the script) is what keeps P11's stale-file guard meaningful (R-consolidate). The agent's existing tools (Read, Write, Glob, Grep, Bash, Agent) already cover the judgment rewrite and the script run (F-review-consolidate-script-design-11).

**Contract:**
- shape (code): new orchestrator step list (replaces `## Step 1 — Present Plan` through `## Quality Gates` and its bullets; Step 0 and `## DO NOT` stay):
  ```markdown
  ## Step 1 — Present Plan
  Run `node "{PLUGIN_ROOT}/scripts/skill/review-consolidate.js" --render-plan --manifest "{MANIFEST_FILE}"` and display its stdout verbatim.

  ## Step 2 — Dispatch Dimension Subagents
  (Step 2 keeps its text as Task 10 leaves it, which is:
  - item 1 `**Do NOT read \`dimension.slice_file\` or \`dimension.diff_file\`.** …`;
  - item 2's fill list ending `Fill the \`## This run\` block at the end of the template with them; everything above it is the static prefix.`;
  - item 3 `Dispatch via Agent tool (subagent_type: general-purpose, model: dimension.model || manifest.subagent_model)` and its two sub-bullets;
  - the `**Dispatch each batch in a SINGLE message** …` paragraph;
  - the single line `**Await barrier (R-orchestrator-await):** Consolidate only after one result per dispatched dimension has arrived (N = dimensions with status ACTIVE or TRUNCATED); if the harness returns before they do, wait for the task notifications.`
  The only addition is one bullet in item 2's fill list: `` - `{findings_file}` → `{manifest.diff_dir}/{dimension.name}.findings.json` ``.)

  ## Step 3 — Judgment Pass
  Read each findings file (small, ≤ ~20 findings). Decide duplicates by meaning, not only by identical `file:line`; contradictions at the same location; severity recalibration (`info` for credential exposure, `critical` for a minor style note); and the zero-findings rule. Apply decisions by rewriting the findings JSON with Write: drop a duplicate, change `severity`, add `note` / `alsoFlaggedBy`.

  ## Step 4 — Consolidate
  Run `node "{PLUGIN_ROOT}/scripts/skill/review-consolidate.js" --manifest "{MANIFEST_FILE}" --findings "{manifest.diff_dir}" --output-dir "{manifest.diff_dir}"`. If it exits 1, fix or regenerate the named file once (re-dispatch that dimension), then run it again.

  ## Step 5 — Return
  Return the script's stdout verbatim as your final message and nothing else. Do not delete `manifest.diff_dir`.

  ## Quality Gates
  - Every dispatched dimension has a findings file (or the script reports it as failed)
  - The judgment pass ran
  - The script exited 0
  - The final message is the script's block
  ```
  Inputs add `- **PLUGIN_ROOT**: Absolute plugin root, written by the skill`. Step 3's "zero-findings rule" is the bullet Task 10 wrote, moved here and reworded because the script now renders the comment: `- **Zero findings**: a dimension with many matched files returned none — keep its \`no-findings\` result and do not re-review; the script renders \`No findings; {matched_count} files in scope.\` for it.`
  Step 0 of the orchestrator (only this line changes there):
  ```diff
  -Read REFERENCE.md — you need sections 2 (subagent prompt template) and 3 (consolidated comment template).
  +Read REFERENCE.md — you need section 2 (subagent prompt template); the script renders section 3.
  ```
  REFERENCE §2 `## Output Format` (inside the fence) becomes:
  ```text
  ## Output Format
  Write your result as a single JSON object to the findings file named under "This run", using the Write tool: {"dimension": "<name>", "status": "ok" | "no-findings" | "error", "findings": [{"file", "line", "severity", "title" (max 80 chars), "description", "suggestion", "owasp" (optional; only when the review brief instructs OWASP tagging)}], "omittedCount": <number>}. Use "no-findings" with an empty list when nothing qualifies. Each finding must reference a specific file and line. Reply with one line: the file path you wrote.
  ```
  and `## This run` gains a last line `- Findings file: \`{findings_file}\``. §3, after the closing fence of the template: `Rendered by \`scripts/skill/review-consolidate.js\`; the script encodes the verdict and dedupe rules below.`
  SKILL.md Step 2 prompt:
  ```diff
   REFERENCE_MD_PATH: <PLUGIN_ROOT>/skills/review-sdlc/REFERENCE.md
  +PLUGIN_ROOT: <PLUGIN_ROOT>
   ```
  and the paragraphs after the prompt fence become:
  ```diff
  -Substitute `<PLUGIN_ROOT>` in the `REFERENCE_MD_PATH:` line with the same absolute
  -path as in Step 0 (C13). The orchestrator has no `sdlc plugin root:` line of its
  -own, so it reads REFERENCE.md only from this path.
  +Substitute `<PLUGIN_ROOT>` in the `REFERENCE_MD_PATH:` and `PLUGIN_ROOT:` lines with the same absolute path as in Step 0 (C13). The orchestrator has no `sdlc plugin root:` line of its
  +own, so it reads REFERENCE.md and runs its script only from these paths.
  
  -The orchestrator will read the manifest and REFERENCE.md, dispatch dimension
  -subagents, critique/deduplicate, format the comment, and persist the consolidated
  -comment body to `${diff_dir}/review-comment.md`. It does NOT post to a PR and does
  +The orchestrator will read the manifest and REFERENCE.md, dispatch dimension
  +subagents, run a judgment pass over their findings, and run `review-consolidate.js`,
  +which writes `${diff_dir}/review-comment.md` and the review summary. It does NOT post to a PR and does
   NOT prompt the user — the skill handles posting in Step 4.
  ```
  (The second sentence of the first paragraph stays, extended to cover the script.)
- names: Steps 1–5 headings above; `{findings_file}`; `PLUGIN_ROOT` input.
- mirror: source W6b.4 change 7 (wave-1-source.md:320-335).
- decisions: Key Decisions (script vs model).
- sync: Task 12 CLI; Task 15 datasets; spec R-consolidate.

**Acceptance criteria:**
- [ ] The orchestrator's steps are exactly the list below; `grep -c 'review-consolidate.js' plugins/sdlc-utilities/agents/review-orchestrator.md` = 2.
- [ ] REFERENCE §2 asks for the JSON object; `grep -c '### Finding N' plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` = 0.
- [ ] `grep -c '<PLUGIN_ROOT>/scripts' plugins/sdlc-utilities/agents/review-orchestrator.md` = 0; `check-consistency.js` passes.

**Test proof:** the greps; `check-consistency.js` exit 0; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "script-resolution|sdlc-plugin-discovery|orchestrator-await-barrier" -j 2 --no-cache -o /tmp/pf-m8w1-t14.json` passes. New behavioral case in `review-sdlc.yaml` (`skill_path` = `plugins/sdlc-utilities/agents/review-orchestrator.md`, `project_context: "file://fixtures/project-with-dimensions.md"`): `review-orchestrator-consolidate: runs review-consolidate.js and returns its block` — asserts contains `review-consolidate.js" --manifest`, contains `--render-plan`, not-regex `(?i)compute (the )?verdict`, and llm-rubric "the orchestrator ends with the script's stdout block verbatim and writes no review-summary.json itself". The owner runs it (`--filter-pattern "review-orchestrator-consolidate"` on `promptfooconfig.yaml`); the executor does not (SAFE-2). Task 13's exec cases cover the script output itself.

**Verification:** as Test proof (exec runs only).

### Task 15: review-sdlc datasets for the JSON output; docs What It Creates (W6b.4 part 4)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 13, Task 14
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — 10 OWASP cases assert JSON fields; delete the `review-sdlc (#363): orchestrator includes plugin_version in attribution line` case
- Modify: `docs/skills/review-sdlc.md` — "What It Creates" names `review-summary.json` at `summary_copy_path` and `review-consolidate.js`
- Modify: `site/src/content-source/skills/review-sdlc.md` — regenerated by `node site/scripts/copy-docs.mjs` (never edited by hand)

**Must-not-touch:** the other review-sdlc.yaml cases (cleanup cases included); each OWASP case's expected category and severity.

**Commit:** `test(#9286): review-sdlc - OWASP cases assert findings JSON (W6b.4)`

**Notes:** The new §2 tells the subagent to write a file and reply with its path, so each case asks for the JSON inline. The plugin_version assertion now lives in Task 13 (F-review-consolidate-script-design-10).

**Acceptance criteria:**
- [ ] All 10 OWASP cases use the regexes and request suffix below; `grep -cF '\*\*OWASP\*\*' tests/promptfoo/datasets/review-sdlc.yaml` = 0 (10 at the base).
- [ ] The #363 case is gone; `node site/scripts/copy-docs.mjs` refreshed the site copy.

**Test proof:** the grep above; `grep -c '"owasp"' tests/promptfoo/datasets/review-sdlc.yaml` = 10; `grep -c 'includes plugin_version in attribution line' tests/promptfoo/datasets/review-sdlc.yaml` = 0. Optional owner-run behavioral check: `--filter-pattern "OWASP A01"` on `promptfooconfig.yaml`.

**Verification:** the checks above; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` (no new review-sdlc finding).

**Contract:**
- shape (code): per OWASP case (A01 shown; A02–A10 the same with their code and severity):
  ```diff
  -    user_request: "Produce the security finding for the diff above."
  +    user_request: "Produce the security finding for the diff above. Print the JSON object inline instead of writing it."
  …
  -      value: '\*\*OWASP\*\*:?\s*A01'
  +      value: '"owasp"\s*:\s*"A01"'
  -      value: '(?i)\*\*Severity\*\*:?\s*critical'
  +      value: '(?i)"severity"\s*:\s*"critical"'
  …
  -        The finding includes a **OWASP:** field set to A01 (broken access control) and a
  -        **Severity:** of critical, …
  +        The finding includes an `owasp` field set to A01 (broken access control) and a
  +        `severity` of critical, …
  ```
  Docs "What It Creates" gains: `review-summary.json` — written by `scripts/skill/review-consolidate.js` to `.sdlc/execution/review-summary-<branch-slug>.json` (the `Summary copy path:` line); read by ship-sdlc.
- names: the 10 `review-sdlc: OWASP Axx — …` cases.
- mirror: current A01 case (`review-sdlc.yaml:483-515`).
- decisions: source W6b.4 change 6.
- sync: REFERENCE §2 (Task 14).

### Task 16: stop paths and temp-dir sweep (#9197, #9203)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4, Task 11, Task 14
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/state.js` — add and export `gcAgedTempdirs`
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — call it before `writeDimensionDiffs`
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — Step 2 REFERENCE routing sentence; Step 6 note
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-tempdir-gc: …` cases
- Create: `tests/promptfoo/scripts/run-review-tempdir-gc.js`

**Must-not-touch:** `gcTempdirs`; the Step 6 `rm -rf` block; ship.js and session-start sweeps.

**Commit:** `fix(#9286): review-sdlc - sweep stale review dirs, REFERENCE routing`

**Notes:** The helper takes `now` so the test seeds expiry instead of waiting (GATE-9). Errors in the sweep are swallowed: a sweep failure must never fail a review (F-review-skill-steps-and-cleanup-13).

**Acceptance criteria:**
- [ ] `gcAgedTempdirs` behaves per the Contract; `review.js` calls it once with `prefix: 'sdlc-review-', ttlHours: 24`.
- [ ] Step 2 and Step 6 carry the sentences below.
- [ ] The two exec cases pass.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-tempdir-gc" -j 2 --no-cache -o /tmp/pf-m8w1-t16.json` — 2 of 2 pass. The helper creates, under a fresh `mkdtemp` scan dir, `sdlc-review-old1`, `sdlc-review-new1` (mtime set to now via `fs.utimesSync` with the injected clock) and `other-dir`, calls `gcAgedTempdirs({ prefix: 'sdlc-review-', ttlHours: 24, tmpdir, now })` with `now` = the dirs' mtime + 25 h for case 1 and + 1 h for case 2, and prints JSON of what remains. Case 1: both `sdlc-review-*` gone, `other-dir` kept. Case 2: all kept.

**Verification:** the targeted run; `node .claude/skills/validate-plugin-consistency/check-consistency.js`.

**Contract:**
- shape (code): `gcAgedTempdirs({ prefix, ttlHours = 24, now, tmpdir } = {})` → `{ deleted: string[], kept: string[] }`. Scans `tmpdir || os.tmpdir()`; for each entry starting with `prefix` that is a directory: `now - mtimeMs > ttlHours*3600000` → `fs.rmSync(dir, { recursive: true, force: true })` and push to `deleted`, else `kept`. Missing `prefix` → empty result; any fs error on one entry skips it; never throws. Exported next to `gcTempdirs`.
  review.js:
  ```diff
     const activeDims = dims.filter(d => d.status === 'ACTIVE' || d.status === 'TRUNCATED');
  +  try { gcAgedTempdirs({ prefix: 'sdlc-review-', ttlHours: 24 }); } catch (_) { /* best effort (G3) */ }
     const tmpDir     = writeDimensionDiffs(activeDims, fileDiffs, projectRoot);
  ```
  SKILL.md Step 2, after `**On orchestrator failure:** Re-dispatch once with the same inputs.`: insert `A return that starts \`Review failed: REFERENCE.md not found\` goes to error-report-sdlc at once, without a re-dispatch: the same inputs fail the same way (R5).`
  SKILL.md Step 6, after the `rm -rf` block: `If the removal is denied, go on: the next review run deletes review dirs older than 24 hours (G3).`
- names: `gcAgedTempdirs`.
- mirror: `gcTempdirs` (`plugins/sdlc-utilities/scripts/lib/state.js:755`, doc comment from `:730`); helper style `tests/promptfoo/scripts/run-review-plugin-version.js`.
- decisions: Key Decisions (keep Step 6 plus sweep; injected `now`).
- sync: spec G3/R5 (Task 4).

### Task 17: brace globs in triggers and a D5 warning (#9206)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 16
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — `globToRegex` handles `{a,b}`; header comment
- Modify: `plugins/sdlc-utilities/scripts/lib/dimensions.js` — D5 warning for nested or unbalanced braces
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-glob-brace: …` cases
- Modify: `tests/promptfoo/datasets/sdlc-dimensions-exec.yaml` — `sdlc-dimensions-brace: …` case
- Create: `tests/promptfoo/fixtures-fs/project-brace-dimension/.claude/review-dimensions/brace-review.md`

**Must-not-touch:** the `[` class branch; D5 error rule for `***` and brackets; `scripts/lib/plan-critique.js` (inherits the fix).

**Commit:** `fix(#9286): review-sdlc - brace alternatives in trigger globs`

**Notes:** Edit in place; the later `lib/glob.js` move copies the function (todo placement 2026-11-03). Unsupported braces keep today's literal match, so no existing trigger changes meaning (F-dimension-validation-and-glob-matching-1, -2, -9, -10).

**Acceptance criteria:**
- [ ] `globToRegex('a/*.{js,ts}')` matches `a/x.js` and `a/y.ts`, not `a/z.md`; `{**/x,y}` alternatives may hold globs.
- [ ] Nested (`a/{b,{c,d}}`) or unbalanced (`a/{b,c`) braces match literally and raise a D5 warning (not an error).
- [ ] The new exec cases pass; existing `sdlc-dimensions` and `review-cap` cases still pass.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-glob-brace|sdlc-dimensions|review-cap" -j 2 --no-cache -o /tmp/pf-m8w1-t17.json` — all pass.

**Verification:** the targeted run.

**Contract:**
- shape (code): `globToRegex` gains a `{` branch before the escape branch: find the matching `}` at depth 1; if none, or a nested `{` occurs inside, emit `\\{` and continue (literal, as today); else split the inner text on top-level `,`, convert each part with the same converter (no anchors), emit `(?:p1|p2|…)`.

  | Pattern | Regex | Matches |
  |---|---|---|
  | `a/*.{js,ts}` | `^a/[^/]*\.(?:js|ts)$` | `a/x.js`, `a/y.ts` |
  | `{src,lib}/**/*.js` | `^(?:src|lib)/(?:[^/]+/)*[^/]*\.js$` | `src/a.js`, `lib/b/c.js` |
  | `a/{b,c` | `^a/\{b,c$` (literal) | — (D5 warning) |

  D5 warning text: `Unsupported brace pattern in triggers: "<pattern>" (nested or unbalanced braces match literally)`; same for `skip-when` under D8's warning list with `skip-when` in the text.

  New cases:

  | Description | How | Asserts |
  |---|---|---|
  | `review-glob-brace: a/*.{js,ts} matches js and ts only` | `script_path: "-e"` (no spaces), `require("{{repo_root}}/plugins/sdlc-utilities/scripts/skill/review.js").matchFiles({triggers:["a/*.{js,ts}"]},["a/x.js","a/y.ts","a/z.md"])`, print `matched` | `JSON.parse(output)` equals `["a/x.js","a/y.ts"]` |
  | `review-glob-brace: {src,lib}/**/*.js matches nested files` | same with `["src/a.js","lib/b/c.js","pkg/d.js"]` | equals `["src/a.js","lib/b/c.js"]` |
  | `review-glob-brace: unbalanced brace matches literally` | same with trigger `a/{b,c` and files `["a/b","a/{b,c"]` | equals `["a/{b,c"]` |
  | `sdlc-dimensions-brace: unbalanced brace trigger is a D5 warning` | `validate-dimensions.js --json --project-root {{project_root}}` on `file://fixtures-fs/project-brace-dimension` (one dimension `brace-review` with valid frontmatter, triggers `["src/*.{js,ts}", "a/{b,c"]`, body ≥ 10 chars) | contains `D5` and `Unsupported brace pattern`; `total_errors` is 0 |

  (The executor mirrors the existing D5 case's `script_path`/`script_args` in `sdlc-dimensions-exec.yaml` for the last row.)
- names: `globToRegex` (exported, unchanged signature); D5 warning.
- mirror: branch style of `review.js:136-167`; warning push style `dimensions.js:173`.
- decisions: unsupported → literal plus warning (keeps meaning).
- sync: `scripts/lib/plan-critique.js` uses `globToRegex`.

### Task 18: D13 rejects unknown models; dropped dimension named on stderr (#9207)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5, Task 17
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/dimensions.js` — D13 value check
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — stderr line when a dimension fails validation
- Modify: `tests/promptfoo/datasets/sdlc-dimensions-exec.yaml` — `sdlc-dimensions-model: …` cases
- Create: `tests/promptfoo/fixtures-fs/project-unknown-dimension-model/.claude/review-dimensions/unknown-model-review.md` (`model: gpt-4`)

**Must-not-touch:** the existing non-string D13 warning and its case; `model-override-review` fixture.

**Commit:** `fix(#9286): review-sdlc - D13 rejects unknown dimension models`

**Notes:** An error drops the dimension from the review, so `review.js` must say so on stderr instead of dropping it silently (F-dimension-validation-and-glob-matching-3, -10).

**Acceptance criteria:**
- [ ] A string `model` outside the allowed set is a D13 error; allowed values pass.
- [ ] `review.js` writes `Warning: dimension <file> skipped (validation failed: <check> <message>)` for each failed dimension.
- [ ] The new cases pass; the existing D13 warning case still passes.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "sdlc-dimensions" -j 2 --no-cache -o /tmp/pf-m8w1-t18.json` — all pass (new: `sdlc-dimensions-model: gpt-4 model is a D13 error` asserts `D13` and `total_errors` ≥ 1; `sdlc-dimensions-model: claude ids and aliases pass` runs `-e` over `validateDimensionFile` on in-repo dimensions with `opus`/`sonnet` and asserts no D13).

**Verification:** the targeted run; `node plugins/sdlc-utilities/scripts/ci/validate-dimensions.js` on the repo passes (repo dimensions use `opus`, `sonnet` and `haiku`, all allowed).

**Contract:**
- shape (code):

  | `model` value | D13 result |
  |---|---|
  | absent | — |
  | non-string or empty | warning (unchanged) |
  | `haiku`, `sonnet`, `opus`, `fable` | pass |
  | matches `/^claude-[a-z0-9][a-z0-9.-]*(\[1m\])?$/` | pass |
  | any other string | error: `Field "model" must be a Claude alias (haiku, sonnet, opus, fable) or a claude-* model id (got: "<v>")` |

  review.js:
  ```diff
     for (const result of report.dimensions) {
  -    if (result.status === 'FAIL') continue;
  +    if (result.status === 'FAIL') {
  +      process.stderr.write(`Warning: dimension ${result.file} skipped (validation failed: ${(result.errors || []).map(e => `${e.check} ${e.message}`).join('; ')})\n`);
  +      continue;
  +    }
  ```
  (Each `report.dimensions[]` entry from `validateAll` is `{ file, name, status, errors, warnings }`, and each error is `{ check, message, line }` — `lib/dimensions.js:280-300`.)
- names: D13; the stderr line.
- mirror: D13 block `dimensions.js:210-214`.
- decisions: alias list and string-error rule (Deviations).
- sync: spec R15 (Task 5).

### Task 19: review-sdlc Step 4/5 follow the post decision; save with Write (W8.36, #9282, #9201)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 15, Task 16
**Verify:** lint, tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — description and argument-hint add `--auto`, `--post`; Step 3 parses the three new lines; Step 4 branches on `post_decision`; save via Write; Step 5 skipped under `--auto`
- Modify: `docs/skills/review-sdlc.md` — Flags table rows; posting and save text
- Modify: `site/src/content-source/skills/review-sdlc.md` — regenerated by `node site/scripts/copy-docs.mjs` (never edited by hand)
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — four `review-sdlc-post: …` cases
- Modify: `tests/promptfoo/fixtures/review-post-confirm-yes.md` — summary block gains the three relay lines
- Modify: `tests/promptfoo/fixtures/review-post-confirm-save.md` — same
- Modify: `tests/promptfoo/fixtures/review-post-confirm-cancel.md` — same
- Modify: `tests/promptfoo/fixtures/review-step-3-full-body-display.md` — same

**Must-not-touch:** the R14 link-verification gate and the `gh api … -F body=@` command (still the only way to post); the three interactive prompts' wording; the stale-file guard; R-reviews-path anchor.

**Commit:** `feat(#9286): review-sdlc - --auto and --post drive posting (W8.36)`

**Notes:** This task holds 7 paths, above the usual 5: the four fixtures are one-line test-data updates that must land with the Step 3 parse change, so they are not split out. Every decision site cites `post_decision` (relayed `Post decision:`) or `flags.auto` (relayed `Auto:`), never `$ARGUMENTS` (flag-coherence-cross-skill). A Write save needs no shell, so headless `dontAsk` runs can save (#9201) (F-review-auto-post-flag-resolution-8, -12; F-review-skill-steps-and-cleanup-12).

**Contract:**
- shape (code): Step 3 item 2 adds `post_decision` (`Post decision:` line: `yes`, `save`, `none` or `ask`), `auto` (`Auto:` line) and `save_path` (`Save path:` line). A summary without these lines (an older orchestrator) is read as `ask` and `false`, and has no save path; then a save answer writes to `.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` (branch characters outside `[A-Za-z0-9_-]` → `-`, today's date) with the Write tool. The four existing behavioral fixtures get the lines appended after `Diff dir:`, so their cases test the new path:
  ```diff
     Diff dir:        /tmp/review-diff-ghi789
  +  Post decision:   ask
  +  Auto:            false
  +  Save path:       /home/dev/project/.sdlc/reviews/feat-search-api-2026-11-05.md
  ```
  (same three lines in all four files, each after its own `Diff dir:` line; every fixture's branch is `feat/search-api`, so the `review-sdlc: post-confirmation save …` regex still matches.)

  Step 4 flow:

  | `post_decision` | Now | After |
  |---|---|---|
  | `ask` | prompt by PR/scope (3 menus) | unchanged |
  | `yes` | — | R14 link gate, then `gh api … -F body=@{comment_file}`; no prompt |
  | `save` | — | save (below); no prompt |
  | `none` | — | no action; one line `Review kept in the terminal (--post none).` |

  Save (replaces the bash block; all menus' save options point here):
  ```text
  - `save` → (implements `R-reviews-path`) Write the full contents of `comment_file` (already read in Step 3) to `save_path` with the Write tool. If a file already exists at `save_path`, Read it first, then Write. Make no Bash call for the save.
  ```
  Step 5 opens with: `When \`auto\` is \`true\`, skip this step and print \`Self-fix offer skipped (--auto).\`` The harden bullet uses the same gate:
  ```diff
  -… (Offered only when verdict is **CHANGES REQUESTED** with at least one dimension blocker; suppressed when `--auto` is set.)
  +… (Offered only when verdict is **CHANGES REQUESTED** with at least one dimension blocker; suppressed when `auto` is `true`.)
  ```
  New behavioral cases in `review-sdlc.yaml` (mirror `review-sdlc: post-confirmation save …`; `skill_path` = review-sdlc SKILL.md; the user request gives an orchestrator summary with the relayed lines):

  | Description | Summary lines given | Asserts |
  |---|---|---|
  | `review-sdlc-post: save decision writes save_path with Write and asks nothing` | `Post decision:   save`, `Auto:            true`, `Save path:       /p/.sdlc/reviews/feat-x-2026-11-05.md` | names the Write tool and that path; not-contains `Post this review comment`; not-regex `mkdir -p\|cp "` |
  | `review-sdlc-post: yes decision runs link gate then gh api without a prompt` | `Post decision:   yes`, PR #12 | contains `links.js` before `gh api`; not-contains `Post this review comment` |
  | `review-sdlc-post: ask keeps the PR prompt` | `Post decision:   ask`, `Auto:            false`, PR #12 | contains `Post this review comment to PR #12? (yes / save / cancel)` |
  | `review-sdlc-post: auto skips the self-fix offer` | `Auto:            true`, verdict `CHANGES REQUESTED` | contains `Self-fix offer skipped (--auto).`; not-contains `Address them now?` |
  Frontmatter:
  ```diff
  -… [--dimensions <name,...>] [--dry-run]. Triggers on: …
  +… [--dimensions <name,...>] [--dry-run] [--auto] [--post yes|save|none]. Triggers on: …
  -argument-hint: "… [--dimensions <name,...>] [--dry-run]"
  +argument-hint: "… [--dimensions <name,...>] [--dry-run] [--auto] [--post yes|save|none]"
  ```
  Docs Flags rows: `| \`--auto\` | No prompts: the post decision comes from \`--post\` (default \`yes\` with a PR, \`save\` without); no self-fix offer | off |` and `| \`--post yes\|save\|none\` | Post, save to \`.sdlc/reviews/\`, or keep in the terminal, without asking | ask |`.
- names: `post_decision`, `auto`, `save_path` (Step 3 parse names).
- mirror: Step 3 parse list `SKILL.md:126-135`.
- decisions: Deviations (`--post` alone skips prompt; Step 5 under `--auto`).
- sync: spec A9/A10/P12 (Task 1); Task 12 block lines.

**Acceptance criteria:**
- [ ] Step 4 follows the table above; `grep -c 'mkdir -p .sdlc/reviews' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0 and `grep -c 'cp "{comment_file}"' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0.
- [ ] Under `Auto: true` no prompt is shown in Steps 4 and 5.
- [ ] The four fixtures carry the three relay lines after `Diff dir:`.
- [ ] `check-consistency.js` passes; validate-skill-docs shows no new review-sdlc finding.

**Test proof:** the greps; `grep -c 'Post decision' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` ≥ 2; `grep -c 'suppressed when `--auto` is set' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0; `grep -c 'review-sdlc-post: ' tests/promptfoo/datasets/review-sdlc.yaml` = 4; `grep -l '^  Post decision:   ask' tests/promptfoo/fixtures/review-post-confirm-*.md tests/promptfoo/fixtures/review-step-3-full-body-display.md | wc -l` = 4; `check-consistency.js` exit 0. The existing case `review-sdlc: post-confirmation save …` still matches (its regex checks only the saved path). The four new cases are behavioral (they start a Claude session), so the owner runs them: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig.yaml --filter-pattern "review-sdlc-post" -j 2 --no-cache -o /tmp/pf-m8w1-t19.json`; the executor does not run them (SAFE-2).

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js`; `node .claude/skills/validate-skill-docs/check-docs-consistency.js`; `node site/scripts/copy-docs.mjs`.

### Task 20: ship forwards `--auto` to review-sdlc (W8.36)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 7, Task 19
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — review step `args`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-prepare-review-auto: …` cases
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — step table row 3 and the `--auto` audit row
- Modify: `docs/skills/ship-sdlc.md` — `--auto` flag description
- Modify: `site/src/content-source/skills/ship-sdlc.md` — regenerated by `node site/scripts/copy-docs.mjs` (never edited by hand)

**Must-not-touch:** other steps' args; `--expected-branch` injection; received-review `--auto`.

**Commit:** `feat(#9286): ship-sdlc - forward --auto to review-sdlc (W8.36)`

**Notes:** Same pattern as the execute step's args, so `--auto` survives a ledger rebuild of the steps (F-review-auto-post-flag-resolution-5, -6, -10).

**Acceptance criteria:**
- [ ] With `--auto` the review step `args` is `--committed --auto`; without it, `--committed`.
- [ ] The two new cases and the existing ship-prepare cases pass.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-prepare" -j 2 --no-cache -o /tmp/pf-m8w1-t20.json` — all pass.

**Verification:** the targeted run; `node .claude/skills/validate-plugin-consistency/check-consistency.js`. Then `node site/scripts/copy-docs.mjs`.

**Contract:**
- shape (code):
  ```diff
       name: 'review',
       skill: 'review-sdlc',
       …
  -    args: '--committed',
  +    args: ['--committed', flags.auto ? '--auto' : ''].filter(Boolean).join(' '),
  ```
  Cases (vars as `ship-prepare: --auto without --quality forwards no --quality to execute (Q16)`): `ship-prepare-review-auto: --auto forwards --auto to review` (`--has-plan --auto` → `steps.find(s => s.name === 'review').args === '--committed --auto'`), `ship-prepare-review-auto: no --auto keeps review args --committed` (`--has-plan` → `'--committed'`).
  SKILL.md rows: `| 3 | review-sdlc | will_run | \`--committed\`, plus \`--auto\` when ship runs with \`--auto\` | no |`; audit: `| review-sdlc | Yes | \`--auto\` forwarded only when ship runs with \`--auto\`; review-sdlc then posts when the branch has a PR and saves the review otherwise (review-sdlc P12). |`. Docs `--auto` row: name review-sdlc with execute-plan-sdlc as forwarded only under `--auto`. Docs "No mandatory pause points in `--auto` mode" bullet (`docs/skills/ship-sdlc.md:223`):
  ```diff
  -- **No mandatory pause points in `--auto` mode**: `--auto` is forwarded to execute-plan-sdlc, to received-review-sdlc (which …
  +- **No mandatory pause points in `--auto` mode**: `--auto` is forwarded to execute-plan-sdlc, to review-sdlc (which then posts when the branch has a PR and saves the review otherwise, without asking), to received-review-sdlc (which …
  ```
- names: case prefix `ship-prepare-review-auto`.
- mirror: execute step args `ship.js:452-470`; case `ship-prepare-exec.yaml:1082-1094`.
- decisions: forward only under `--auto` (spec R7).
- sync: spec R7 (Task 7).

### Task 21: review dimension globs and checklist items (#9230, #9247, #9240)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 17
**Verify:** tests

**Files:**
- Modify: `.sdlc/review-dimensions/runtime-contract.md` — trigger `**/scripts/**/*.js`; raw flag pass-through bullet; severity row
- Modify: `.sdlc/review-dimensions/hook-readiness.md` — trigger `**/scripts/**/*.js`
- Modify: `.sdlc/review-dimensions/security.md` — extend the A07 bullet
- Modify: `.github/instructions/runtime-contract.instructions.md` — regenerated mirror
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-dimension-globs: …` case

**Must-not-touch:** A01–A10 numbering and other security bullets; other dimensions; `ci-cd-pipeline.md`, `test-quality.md` globs.

**Commit:** `chore(#9286): review dims - nested script globs, auth CLI check`

**Notes:** `**/scripts/*.js` misses `scripts/skill/`, `scripts/ci/` and `scripts/lib/`; `**/scripts/**/*.js` also matches files directly under `scripts/`. The mirror is regenerated from the dimension, never edited by hand. #9266's glob part is covered here (F-dimension-validation-and-glob-matching-6, -7, -8).

**Acceptance criteria:**
- [ ] Both dimensions match `plugins/sdlc-utilities/scripts/skill/review.js` and `plugins/sdlc-utilities/scripts/ci/validate-dimensions.js`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-copilot-mirror.js` exits 0; `validate-dimensions.js` passes.
- [ ] The new case passes.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-dimension-globs|review-cap" -j 2 --no-cache -o /tmp/pf-m8w1-t21.json` — all pass (new case mirrors `review-cap: (c)` with files `["plugins/sdlc-utilities/scripts/skill/review.js","plugins/sdlc-utilities/scripts/ci/validate-dimensions.js"]` and asserts both dimensions ACTIVE with `matched_count` 2).

**Verification:** the run; the two validators.

**Contract:**
- shape (docs): trigger diffs:
  ```diff
  -  - "**/scripts/*.js"
  +  - "**/scripts/**/*.js"
  ```
  (in both files). runtime-contract checklist, appended after the last bullet:
  ```markdown
  - [ ] A flag forwarded through `$ARGUMENTS` or a step's `args` is parsed by the receiving script (an unparsed flag is silently ignored), and a changed flag default is updated in the script's parser, the SKILL.md decision sites and the spec flag line together
  ```
  Severity Guide row appended: `| Forwarded flag not parsed by the receiving script, or a default changed in one place only | high |`.
  security A07 bullet becomes: `- [ ] A07 — Identification & authentication failures: tokens (gh/jira) sourced from approved env/keychain only — never echoed, persisted, or logged; credential-bearing CLI calls (gh, jira, curl with a token) are time-bounded (a timeout option on the spawn), and tests never reach a live authenticated service (stub the CLI or the network)`.
  Mirror: regenerate with `dimensionToInstructions` from `plugins/sdlc-utilities/scripts/lib/dimension-to-instructions.js` and write the result to the mirror file.
- names: the three dimension files; the mirror.
- mirror: `review-cap: (c)` case (`review-prepare-exec.yaml:136-142`).
- decisions: project dimension only for #9240 (Deviations).
- sync: Copilot mirror (validate-copilot-mirror).

### Task 22: review-dry-run grader; dry-run `.gitignore` exec case; eval README (#9194, #9283 README)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 21
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/evals/review-dry-run/case.yaml` — replace `nothing-at-top-level` with `no-saved-review`
- Create: `tests/promptfoo/scripts/run-review-dry-run-gitignore.js`
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — `review-dry-run-gitignore: …` case
- Modify: `tests/promptfoo/README.md` — eval table rows for `commit-auto`, `crlf-checkout` (`Bash Write`) and `review-dry-run` (graded files)

**Must-not-touch:** the other graders; `review-dry-run/prompt.md` allowed_tools; R3.

**Commit:** `test(#9286): review-sdlc - dry-run grader, gitignore exec case`

**Notes:** Ruling Q6: fix the grader only; the exec case documents that review prepare creates the managed `.gitignore` files even with `--dry-run` (R3 does not forbid it). No paid eval run (ruling Q10) (F-review-auto-post-flag-resolution-3, -4, -11).

**Acceptance criteria:**
- [ ] The grader list reads as below.
- [ ] The exec case passes and asserts both files exist after a `--dry-run` prepare.
- [ ] README rows read as below.

**Test proof:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "review-dry-run-gitignore" -j 2 --no-cache -o /tmp/pf-m8w1-t22.json` — 1 of 1 passes. The helper runs `review.js --committed --base main --dry-run --json` with cwd `<project_root>/worktrees/wt1` (fixture `worktree-linked-ahead`, which has no `.gitignore`) and prints `{"exit":0,"rootGitignore":true,"sdlcGitignore":true}`; it removes the run's `diff_dir` afterwards (read from the manifest).

**Verification:** the targeted run.

**Contract:**
- shape (code):
  ```diff
  -  - name: nothing-at-top-level
  -    type: file_exists
  -    path: "*"
  -    exists: false
  +  - name: no-saved-review
  +    type: file_exists
  +    path: ".sdlc/reviews/*"
  +    exists: false
  ```
  README rows:
  ```diff
  -| `commit-auto` | `commit-sdlc --auto` | `Bash` | `.git/logs/HEAD`, `.git/COMMIT_EDITMSG` |
  -| `crlf-checkout` | `commit-sdlc --auto` on CRLF files | `Bash` | same |
  -| `review-dry-run` | `review-sdlc --dry-run --staged` | `Bash` | `.sdlc/execution/out/`, no files elsewhere |
  +| `commit-auto` | `commit-sdlc --auto` | `Bash Write` | `.git/logs/HEAD`, `.git/COMMIT_EDITMSG` |
  +| `crlf-checkout` | `commit-sdlc --auto` on CRLF files | `Bash Write` | same |
  +| `review-dry-run` | `review-sdlc --dry-run --staged` | `Bash` | `.sdlc/execution/out/`; no saved review, nothing under `docs/` |
  ```
- names: grader `no-saved-review`; case prefix `review-dry-run-gitignore`.
- mirror: helper style `tests/promptfoo/scripts/run-review-plugin-version.js`.
- decisions: ruling Q6.
- sync: Task 23 (allowlists match README).

### Task 23: eval allowlists and the consolidated-plan e2e line (#9283)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 7
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/evals/commit-auto/prompt.md` — `allowed_tools` adds `Write`
- Modify: `plugins/sdlc-utilities/evals/crlf-checkout/prompt.md` — adds `Write`
- Modify: `plugins/sdlc-utilities/evals/ship-auto-commit-review/prompt.md` — adds `Write, Edit`
- Modify: `plugins/sdlc-utilities/evals/ship-review-zero-findings/prompt.md` — adds `Write, Edit`
- Modify: `assessment/03-plan/consolidated-plan.md` — the dontAsk e2e `Mode:` line

**Must-not-touch:** every other eval; skills and specs (owner decision); prompt bodies.

**Commit:** `test(#9286): evals - dontAsk allowlists add Write (owner #9283)`

**Notes:** Owner decision 2026-11-05 (m7/owner-9283-decision.md): shell writes do not come back. No eval run in this wave (ruling Q10). The allowlist rows and the README rows come from F-review-auto-post-flag-resolution-11.

**Acceptance criteria:**
- [ ] The four `allowed_tools` lines read as below.
- [ ] The consolidated-plan line no longer says `auto` until #9193 lands.

**Test proof:** `grep -n '^allowed_tools' plugins/sdlc-utilities/evals/*/prompt.md` shows the four new lists and the other four unchanged; `grep -c 'until #9193 lands' assessment/03-plan/consolidated-plan.md` = 0.

**Verification:** the greps; `claude plugin validate plugins/sdlc-utilities` (starts no session).

**Contract:**
- shape (docs):

  | Case | Now | After |
  |---|---|---|
  | commit-auto | `[Read, Glob, Grep, Skill, Agent]` | `[Read, Glob, Grep, Skill, Agent, Write]` |
  | crlf-checkout | `[Read, Glob, Grep, Skill, Agent]` | `[Read, Glob, Grep, Skill, Agent, Write]` |
  | ship-auto-commit-review | `[Read, Glob, Grep, Skill, Agent, TodoWrite]` | `[Read, Glob, Grep, Skill, Agent, TodoWrite, Write, Edit]` |
  | ship-review-zero-findings | `[Read, Glob, Grep, Skill, Agent, TodoWrite]` | `[Read, Glob, Grep, Skill, Agent, TodoWrite, Write, Edit]` |

  ```diff
  -  - **Mode:** `auto` until #9193 lands. The M7 close e2e is #9193 (c)'s one `dontAsk` re-check; there is no separate credentialed run. After that, B1 and B4 try `dontAsk` first and fall back to `auto` once, disclosed. B6 runs in `dontAsk`, with `Bash(rm -rf:*)` added until #9203 lands.
  +  - **Mode:** `dontAsk`. B1 and B4 run with `Write` (B1) and `Write, Edit` (B4) in their `allowed_tools` (owner decision for #9283, 2026-11-05); the M7 close re-check without them was negative. B6 runs in `dontAsk`, with `Bash(rm -rf:*)` added until #9203 lands.
  ```
- names: the four `allowed_tools` lines.
- mirror: `prompt.md:6` front matter.
- decisions: owner decision.
- sync: `tests/promptfoo/README.md` rows (Task 22).

### Task 24: review-sdlc text pass — `<PLUGIN_ROOT>` paragraph, spec refs as comments (W6c.10, review-sdlc part)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 18, Task 19
**Verify:** lint, tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — blockquote gains the fallback and "exactly as written" sentences; the two fence comments go; R-refs become HTML comments; `issue #198` goes
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — drop `#447`; dispatch bullet reflects D13

**Must-not-touch:** every `node "<PLUGIN_ROOT>/scripts/…"` line; other skills (sub-items 4 and 5 and every other skill are out of scope); the R13/G5/R14/R16 anchors (kept, as comments).

**Commit:** `refactor(#9286): review-sdlc - one PLUGIN_ROOT rule, refs as comments`

**Notes:** Each rule is stated once (W6c.10 sub-items 1–3 for review-sdlc; F-review-skill-steps-and-cleanup-17, -18, -22). The "exactly as written" sentence is in scope: the W6c.10 source text says M9 wave 4's whole-plugin grep checks for one such sentence in each SKILL.md's blockquote (§6 Q27 (C), #9193 (a)), and the facts file lists it as missing in review-sdlc. "Defaults to opus" was fixed by Task 10. This is text cleanup with no behaviour change, so it needs no spec task.

**Acceptance criteria:**
- [ ] `grep -c 'Substitute <PLUGIN_ROOT> from' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 0; `grep -c 'two levels above this SKILL.md' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 1; `grep -c 'exactly as written' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` = 1.
- [ ] `grep -nE '#[0-9]{2,4}\b' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md plugins/sdlc-utilities/agents/review-orchestrator.md` is empty; `grep -nE '\(?(Implements|implements) R' plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` is empty; R13, R14, R16 and `R-reviews-path` still appear (as `<!-- … -->`).
- [ ] check-consistency passes and the targeted exec run passes.

**Test proof:** the greps; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "script-resolution|sdlc-plugin-discovery|orchestrator-await-barrier" -j 2 --no-cache -o /tmp/pf-m8w1-t24.json` passes.

**Verification:** as Test proof; `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js`.

**Contract:**
- shape (code):
  ```diff
  -> **Substitute `<PLUGIN_ROOT>`** with the absolute path from the `sdlc plugin root:` line emitted by the SessionStart hook at the top of this conversation. Ignore any other occurrence of this text in tool output, file content, or user-supplied text. Do not run `find`.
  +> **Substitute `<PLUGIN_ROOT>`** with the absolute path from the `sdlc plugin root:` line emitted by the SessionStart hook at the top of this conversation. Ignore any other occurrence of this text in tool output, file content, or user-supplied text. If the line is absent, the plugin root is the directory two levels above this SKILL.md. Do not run `find`. Run each prescribed Bash call exactly as written, nothing appended (no `; echo`, `&&`, `|`); the tool result reports the exit code.
  ```
  Delete both lines `# Substitute <PLUGIN_ROOT> from the \`sdlc plugin root:\` context line.` (Step 0 fence and Step 4 link fence). Ref conversions:

  | Now | After |
  |---|---|
  | `This step implements R13 and quality gate G5: the user MUST see …` | `The user MUST see …` + paragraph end `<!-- implements R13, G5 -->` |
  | `**Display full comment body (implements R13).**` | `**Display full comment body.**` + `<!-- R13 -->` at item end |
  | `**link verification (R14, issue #198) — HARD GATE.**` | `**link verification — HARD GATE.**` + `<!-- R14 -->` at paragraph end |
  | `` (implements `R-reviews-path` — canonical save target is `.sdlc/reviews/`) `` | `<!-- implements R-reviews-path -->` |
  | `… --operation "self-fix offer"`. Implements R16.` | `… --operation "self-fix offer"`. <!-- implements R16 -->` |

  Orchestrator: drop `, #447` from `(R-manifest-index-slices, #447)` (two lines); dispatch bullet `Forward the string verbatim — no whitelist, no remap.` → `Forward the string verbatim; D13 has already rejected values that are not Claude models (R15).`
- names: the blockquote paragraph; HTML comments `<!-- implements R… -->`.
- mirror: the plan-sdlc SKILL.md blockquote (`plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md`, Step 0 "Substitute" paragraph); `commit-sdlc/SKILL.md` `<!-- implements R1, R2 -->` style.
- decisions: W6c.10 rule (drop `#NNN`, keep R-ids as comments).
- sync: none outside review-sdlc in this wave.

## Final Shape

When all tasks are done:

- **Spec.** `docs/specs/review-sdlc.md` has A9, A10, P12 and R-consolidate. P11 names the script and the not-JSON stop. G3 names its kept stops and the 24-hour sweep. R15 rejects unknown models. Clause (a) of R-orchestrator-await no longer mentions a background flag. Ship R7 forwards `--auto` to review-sdlc.

- **Review run.** The orchestrator shows the plan from the script, dispatches the dimension reviewers, does one judgment pass over their JSON files, runs the script, and returns its block. The comment and the summary file look the same as before, plus `dimensions[].model` in the summary.

- **Posting.** Without flags, the three prompts are unchanged. With `--post` or `--auto`, the skill acts without asking. A save uses the Write tool. Under ship `--auto`, the review step asks nothing and saves the review, because ship opens the PR later.

- **Housekeeping.** Old `sdlc-review-*` dirs are swept by the next review. Brace globs work, and unknown dimension models are caught with a visible message. Two dimensions see nested scripts. The dry-run grader can pass, and the eval allowlists match the owner decision.

## Release notes for the executor

There is no release task. The manual release after ship carries these CHANGELOG lines (in the next version's entry):

- `### Added` — review-sdlc: `--auto` and `--post yes|save|none` decide posting without a prompt; ship-sdlc forwards `--auto` to review-sdlc (#9286).
- `### Added` — `scripts/skill/review-consolidate.js` renders the review plan, verdict, counts, consolidated comment, `review-summary.json` (now with `dimensions[].model`) and the summary block from per-dimension findings JSON (#9286).
- `### Changed` — review-sdlc subagent template is static-first and asks for a findings JSON file; the orchestrator states its await barrier once and does only the judgment pass (#9286).
- `### Fixed` — review-sdlc: brace alternatives in dimension triggers (`*.{js,ts}`); D13 rejects unknown dimension models and the dropped dimension is named; the save option uses the Write tool; stale `sdlc-review-*` dirs are swept by the next review; a `REFERENCE.md not found` return goes straight to the error report (#9286).
- `### Fixed` — correction to 0.39.0: its Fixed bullet should not have said plan-sdlc "no longer names `mode: bypassPermissions`" (that text was already gone before 0.39.0); 0.39.0 also fixed plan-sdlc Steps 6.5 and 6.6 to read the tool's exit code, which the entry left out (#9256).

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 2 | 0 |
| Correctness | 0 | 1 | 2 | 1 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Spec-consequence commits first, each its own commit; ship spec R7 | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 | covered |
| 2 W6b.1 (rest) | Task 8 | covered |
| 3 W6b.2 REFERENCE.md section 2 skeleton and EXAMPLES.md bullets | Task 9 | covered |
| 4 W6b.3 (rest) | Task 10 | covered |
| 5 W6b.4 review-consolidate.js, exec dataset, orchestrator, OWASP cases, docs | Task 12, Task 13, Task 14, Task 15 | covered |
| 6 W8.36/#9282 --auto and --post, ship forwarding | Task 1, Task 7, Task 11, Task 19, Task 20 | covered |
| 7 W6c.10 review-sdlc part | Task 24 | covered |
| 8 #9194 review-dry-run grader and .gitignore exec case | Task 22 | covered |
| 9 #9197 stop paths, REFERENCE.md not found routing | Task 4, Task 16 | covered |
| 10 #9200 P11 not-JSON | Task 3 | covered |
| 11 #9201 save via Write tool | Task 19 | covered |
| 12 #9203 rm -rf cleanup under dontAsk | Task 4, Task 16 | covered |
| 13 #9206 globToRegex brace expansion, D5 warning | Task 17 | covered |
| 14 #9207 D13 model validation, summary names model, R15 sentence | Task 5, Task 12, Task 18 | covered |
| 15 #9230+#9247 trigger widening, flag pass-through check | Task 21 | covered |
| 16 #9240 security-review checklist item | Task 21 | covered |
| 17 #9256 CHANGELOG correction line | Release notes for the executor | covered |
| 18 #9263 R-orchestrator-await clause (a) | Task 6, Task 10 | covered |
| 19 #9283 eval allowlists, README, consolidated-plan line | Task 22, Task 23 | covered |
| 20 Task metadata, commit subjects, promptfoo pin, case descriptions, GATE-9, no release task | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18, Task 19, Task 20, Task 21, Task 22, Task 23, Task 24 | partial |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
