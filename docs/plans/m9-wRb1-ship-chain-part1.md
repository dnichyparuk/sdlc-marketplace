# M9 wave R-b1 — the ship chain, part 1 of 2 (Tasks 1–17) Implementation Plan

**Commit:** `feat(#9319): ship-sdlc - ship chain part 1 (M9 wave R-b1)`
**Goal:** Part 1 of the ship chain (items 1–8 of the 16 wave items, in their order):
- item 1: spec-first commits for ship, received-review, commit, version (the R-b3 exception), pr (evidence), and execute-plan (touched by items 7, 9 and 15). All six spec commits are in this part;
- items 2–5: ship forwards `--no-tag --no-push` and a release subject to version-sdlc (with the R-b3 exception and the #9318 re-run guard), forwards `--no-stash`, stages before commit-fixes, and takes `--review-threshold`;
- items 6–8: a fix-scope guard in received-review (N1), a plan-scope guard after execute (N1b), and `--review-rounds` as a real loop.
**Architecture:** The root problem: ship today runs execute and commit well, but the orchestrator still does the release commit, the review threshold, the second review round, the fix-scope checks and the trailer checks by hand, and several ship paths ask a question or redo work under `--auto`. The specs change first, one commit per spec. Then every decision lives in a script (`skill/ship.js`, `skill/received-review.js`, `skill/execute.js`), and each SKILL.md only reads the resolved fields. New ship behaviour is opt-in by flag, so a ship run without the new flags behaves as today, except for the always-on guards of this part (`--no-stash`, the stage step before commit-fixes, the re-run guard, `--strict-files`).
**Source:** the wave brief for M9 wave R-b1 (16 items, rulings Q1–Q8) and the planner resume 1 ruling (fixes, then split); split from `docs/plans/m9-wRb1-ship-chain.md`, task numbers kept; every needed fact is embedded in the tasks
**Spec ids added here that part 2 implements:** ship R85 and C20 (part 2 Tasks 1–3), the R11 refresh sentence (part 2 Task 4), R86 and the execute side of R80 (part 2 Task 5), the R77 order (part 2 Task 6); received-review R31, R32 (part 2 Task 7) and C19 (part 2 Task 2); commit R17, R19, P14, E12 and the G10 amendment (part 2 Tasks 8–9), R18 (part 2 Task 11) and the A8 note; version C12 (part 2 Task 2); execute C17 (part 2 Task 1) and the E15 amendment (part 2 Task 12). pr A6, R17, G13, P19, E8, I9 are implemented by the later ship-evidence wave (R-b2).
**Verification:** node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . && node .claude/skills/validate-plugin-consistency/check-consistency.js && node .claude/skills/validate-skill-docs/check-docs-consistency.js && cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache -o /tmp/pf-wRb1-p1-exec.json && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 2 --no-cache -o /tmp/pf-wRb1-p1-hooks.json (exec-only configs, no LLM provider)

---

## Context

**What problem does this change solve?**

- Ship (`/sdlc:ship-sdlc`) is the pipeline that runs execute, commit, review, received-review, commit-fixes, version and pr in one go.
- Today the orchestrator does five of its jobs by hand:
  - the release commit without a tag;
  - the review threshold (MEDIUM, not the default HIGH);
  - the second review round;
  - the check that review fixes stay inside the plan's files;
  - the check that each commit carries exactly one configured trailer (a `Key: Value` line at the end of a commit message).
- Some ship paths still ask a question under `--auto`, or redo work after a resume. In a headless run (no human at the keyboard) both stop or damage the run.

**What prompted this change now?**

- The owner's GO for M9 wave R-b1, the ship chain: items 1–16, in this order.
- The pre-flight rulings Q1–Q8 fix the scope: no pre-split, #9228/#9303/#9272/#9241 are in, #9138/#9139 are read-only, the #9304 worker extras are out, #9312 and #9318 fold into items 1 and 2.
- The plan passed the split escape, so it is split in item order: this part holds items 1–8; part 2 (`docs/plans/m9-wRb1-ship-chain-part2.md`) holds items 9–16.
- Wave R-a (PR #65) gave version-sdlc `--no-tag`, `--no-push` and `--subject`; this wave makes ship use them.

**What does success look like?**

- `ship --auto --no-tag --no-push --release-subject "<subject>" --review-threshold medium --review-rounds 2` forwards every new flag to the right step.
- A review fix outside the plan's Files, or below the threshold, stops the run with a pending question before commit-fixes.
- A resumed run never bumps the version twice.
- The six touched specs pass `validate-spec-shape.js`, the consistency checks exit 0, and both exec configs are green.

## Research Findings

All facts were read at base `d37c57f` (plugin 0.45.0) in this checkout. Paths are under `plugins/sdlc-utilities/` unless they start with `docs/`, `tests/` or `.sdlc/`.

- **Ship flags.** `parseArgs` (`scripts/skill/ship.js:74-180`) knows no `--no-tag`, `--no-push`, `--release-subject`, `--review-threshold` or `--review-rounds`; an unknown flag is silently ignored. `mergeFlags` (`:206-397`) reads `reviewThreshold` from config only (`:295` "reviewThreshold: not a CLI flag, comes from config or default."); the default is `high` (`scripts/lib/ship-fields.js:178`).
- **Step args.** `computeSteps` (`ship.js:420-827`) builds: commit `--auto [--subject] [--expected-branch]` (`:486-490`), received-review `'--auto'` (`:514`), commit-fixes `--auto [--subject] [--expected-branch]` (`:526-530`), version `--bump <b> --auto [--expected-branch]` (`:548-552`). None forwards `--no-stash`, `--no-tag`, `--no-push`, `--subject`, `--plan` or `--min-severity`. At dispatch, `receivedReviewInput` (`:1687-1694`) returns `--pr <N>` for an OPEN PR first, else `--comment-file "<copy>"`.
- **Step order.** `STEP_ORDER` (`ship.js:1298-1306`) holds `stage_changes` once, after `execute_gate`, and nothing between `dispatch_received_review` and `confirm_commit_fixes`. `stageCommands` (`:1344-1359`) returns `git add -A -- ':!.sdlc/'` plus the plan's `.sdlc/` paths. commit.js errors "No staged changes" when nothing is staged (`skill/commit.js:319-325`).
- **Side effects.** `runAfter` fails the version step when `output.artifacts.tag` is not in `git tag --list` (`ship.js:2146-2152`), and checks commit and commit-fixes with `checkHeadCommit` (`:2154-2160`). There is no `--no-tag` exception. Spec R-b3 is at `docs/specs/ship-sdlc.md:111`.
- **Rounds.** Each step runs once: `pickNextStep` `continue`s a completed or skipped named step (`ship.js:1801`). No `reviewRounds` exists.
- **Resume.** `FROZEN_FLAG_KEYS = ['planFile', 'openspecContext', 'sources']` (`ship.js:1327`). `ensureLedger` (`:1435-1469`) adopts the ledger on resume and refreshes only `tasks`/`fromWave`; `runAfter` reads every flag from `ledger.flags` (`:2048`). So CLI flags given on `--resume` never reach the steps (#9228), against spec R11 (`docs/specs/ship-sdlc.md:129`). `dispatch_execute` adds `--resume` only when an execute state file exists (`:1953-1970`); after a finished execute whose `--after` never ran, the state file is gone, so execute runs the plan again (stop-2). Version has no re-run guard either (#9318): a `--no-tag` release leaves no tag at HEAD, so version-sdlc R19 cannot see it.
- **Pending questions.** A dispatch failure with a valid `pendingQuestion` is not recorded as a failure (`ship.js:2180-2184`); `pendingStop` (`:2240-2250`) pauses the ledger and ends with `reason: 'pending-question'` and the resume commands.
- **received-review.** `parseArgs` (`scripts/skill/received-review.js:241-261`) takes `--pr`, `--owner`, `--repo`, `--project-root`, `--auto`, `--comment-file`, `--output-file`; no `--plan`, `--min-severity` or `--check-scope`. The comment-file manifest is written at `:376-389` (`pr: null`, `threads: []`, `findings`). Under `--auto` with an empty `alwaysFixSeverities`, every "will fix" finding is fixed (`skills/received-review-sdlc/SKILL.md:63-67`). Steps 7/8/10 draft thread replies even in comment-file mode (`:282`, `:301`, `:342-344`); Step 11.6 writes `PR: <pr.number>` with no null rule (`:450-455`) and its dedup reads only `surface=`/`targetFile=` (`:418`). review-sdlc posts one top-level PR comment (`skills/review-sdlc/SKILL.md:197`), so the `--pr` input finds no review threads.
- **Plan Files parser.** `parseFilesEntries(body)` (`scripts/lib/plan-parse.js:240-251`) returns `[{kind: 'Create'|'Modify'|'Test', path}]`; `taskSection` (`:231-238`); `extractTasks` is what ship uses (`ship.js:1348-1349`). execute.js uses a stricter parser (`parsePlan` → `parseFiles`, `plan-parse.js:117-123`, backticked paths only) for `expectedFiles` (`skill/execute.js:423-425`, `:558`).
- **Execute scope check.** `skills/execute-plan-sdlc/SKILL.md:453` is a "**SOFT WARNING** … Do not block." for files outside `expectedFiles`. execute.js has `VALUE_FLAGS`/`BOOLEAN_FLAGS` at `:81-82`; an unknown flag is `invalidFlag` (`:114-118`).
- **AskUserQuestion sites without an `--auto` branch** (grep over `skills/**/*.md`): `ship-sdlc/SKILL.md:123` (missing-state prompt), `execute-plan-sdlc/SKILL.md:193` (rebase `prompt`), `execute-plan-sdlc/SKILL.md:432` (`MaxSplitDepthExceededError` escalation), `version-sdlc/SKILL.md:60` (uncommitted changes), `version-sdlc/init-workflow.md:31` (init confirm). Plain "ask the user" sites: `received-review-sdlc/SKILL.md:188` (unclear items), `:210` (cannot verify). The hook `hooks/block-askuserquestion-auto.js` only denies the call inside a ship pipeline (`:100-111`). `.claude/skills/validate-plugin-consistency/check-consistency.js` has Rules 1–13 (`checkNoExitTrap` `:649-669` is the pattern); none covers AskUserQuestion. Its fixtures live in `tests/promptfoo/fixtures-fs/<rule>-cases/{bad,good}-project`, its cases in `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml`.
- **Trailers.** The G10 gate is inline in `skills/commit-sdlc/SKILL.md:205-224`; it splits on `"\n"` (`:208`, `:219`), so a CRLF message fails a valued trailer, and it runs only under `--message-file` (`:215`). It checks presence, not "exactly one". `scripts/lib/commit-message.js` exports `TRAILER_RE`, `MAX_SUBJECT_CHARS`, `resolveTrailers`, `checkGivenSubjects`, `missingTrailers` (`:68`); `missingTrailers` is CRLF-safe (`:62`) and only `skill/version.js` uses it. `ship-step-commit.md:4` and `commit-orchestrator.md:5` are `model: haiku`; no agent or skill file names `Co-Authored-By`. `.sdlc/config.json` `commit` (`:149-160`) has no `requiredTrailers`. Recent branch commits carry `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (70 of the last 78 trailer lines; 7 use the lower-case `Co-authored-by:` form, 1 names Opus).
- **Nested drafter (#9272).** `skills/commit-sdlc/SKILL.md:132-149` dispatches `sdlc:commit-orchestrator` from inside the ship-step agent; `:149` stops when `MESSAGE` is empty, with no fallback when the dispatch returns nothing.
- **PARSE_EXIT (#9241).** `skills/execute-plan-sdlc/SKILL.md:407-417` is one fenced Bash call: the node parse, then `echo "PARSE_EXIT=$?"` (`:415`) and `rm -f "<SUMMARY_FILE>"` (`:416`). Spec E15 is at `docs/specs/execute-plan-sdlc.md:258`.
- **Version spec (#9312).** A8 (`docs/specs/version-sdlc.md:19`) and R-RETAG (`:26`) list the `--retag` conflicts without `--no-tag`; R15 (`:80`) says "the subsequent `git push --tags` is unchanged", against R21 (`:91`). The SKILL.md Quality Gates table (`skills/version-sdlc/SKILL.md:384-394`) has G1–G7 only; the Gotchas `:440-441` lack the `--no-tag` caveat.
- **pr "evidence".** No pr requirement covers verification evidence; R12 (`docs/specs/pr-sdlc.md:18`) is the "Not detected" rule. `.sdlc/pr-template.md` has no `## Evidence` heading.
- **#9316.** commit.js resolves `--message-file` against the cwd (`skill/commit.js:231`); version.js against the active worktree root (`skill/version.js:1000`); version spec A11 (`docs/specs/version-sdlc.md:22`) already states the difference. The commit spec has A1–A9 and no A11.
- **Next free ids at base** (grep `^\s*- <id>[:( ]`, word bound): ship R79, A15, G9, P12, E10, I16, C20; received-review R28, A4, G13, P19, E9, C19, I7; commit R17, A10, G11, P14, E12, C15, I7; version R23, A12, G10, P16, C12, E8, I7; pr R17, A6, G13, P19, E8, I9; execute R44, A10, P10, G13, E16, I14, C17. Withdrawn ship ids R13, R35, R65, C17 are never reused.
- **Tests.** `tests/promptfoo/datasets/ship-prepare-exec.yaml` (266 cases; `ship-prepare:` cases call ship.js, `ship-step:` cases run `tests/promptfoo/scripts/run-ship-stepper.js` with scenarios and seed patches, `:232-273`); `received-review-prepare-exec.yaml` (15 cases; `rr-skill-text:` cases count SKILL.md strings, `:141`, `:196`); `commit-prepare-exec.yaml` (48 cases, prefixes `commit-prepare`, `commit-subject`, `commit-trailers`); `execute-prepare-exec.yaml` (65 cases, all `execute-prepare: `); `ship-review-gate-exec.yaml` (8 `review-gate:` cases). Linked-repo fixtures use a `setup.sh` (`tests/promptfoo/fixtures-fs/worktree-linked-ahead/setup.sh`).
- **Validators at base:** `validate-spec-shape.js --root .` exits 0; `check-consistency.js` exits 0; `check-docs-consistency.js` exits 0 (one warning on `docs/skills/review-init-sdlc.md`, not touched here). `docs/specs/*.md` and `docs/skills/*.md` have tracked copies in `site/src/content-source/`. This plan updates each touched copy with a per-file `cp`, checked with `cmp`, never by hand.
- **#9138 / #9139** (item 16): `skill/commit.js:413-414` writes a per-branch timestamped manifest through `writeManifestState` (`scripts/lib/state.js:402-421`, prune at `:409`) and prints its path; `reconcileSteps` marks steps outside `--steps` skipped (`ship.js:1421-1424`) and `pipelineAdvancing` ignores skipped steps (`scripts/lib/state.js:968-973`).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Discovery fan-out | no | skipped; inline exploration by four read-only explorers | the brief: "Discovery fan-out is not needed; the items name their files" |
| Critique depth | no | Step 3 lanes and Step 5 lenses run at full depth | the brief's wave line ("critique gates and lens review stay ON (full depth)") is more specific than the generic PLAN-4 rule; recorded in the done-file |
| Release subject source | no | new ship flag `--release-subject <text>`, forwarded verbatim as version-sdlc `--subject "<text>"` | version-sdlc uses `--subject` verbatim (version R22) and ship cannot know the new version at prepare; the caller (the orchestrator, which fixes the version) gives the whole subject; no version.js change, so #9315 does not apply |
| `--no-tag` / `--no-push` in ship | no | opt-in ship flags of the same names, forwarded to the version step only | project-agnostic: a normal ship user still tags and pushes; same meaning as version-sdlc A9 and `--no-push` (flag-semantic-consistency) |
| #9318 re-run guard | no | ship records HEAD at each `dispatch_version`/`dispatch_execute` emission; a re-emission with a moved HEAD (or, for execute, a dirty tree and no execute state) stops with a pending question | the narrowest guard that needs no guess about what the earlier run did; the owner of the answer is a human (`state/ship.js` verbs) |
| N1b allowlist | no | the allowlist is the existing R8 rule only: `.sdlc/` paths are never staged by `git add -A` and the plan's own `.sdlc/` Files paths are added; no new config key | the brief names "the allowlist" without a source; a hard-coded project path would break project-agnostic, and a new config key is scope creep; listed in the done-file QUESTIONS |
| N1b ship flag | no | execute gets `--strict-files`; ship always forwards it | "hard under a ship flag" read as "a flag ship passes"; a standalone execute run keeps the soft warning |
| N3 plain "ask the user" sites | no | received-review `:188`/`:210` get an `--auto` branch that marks the item "needs discussion" (never auto-actioned), not a failure | they are not AskUserQuestion sites; "needs discussion" is the skill's own non-action verdict, and N1 already stops the run when a needed fix is outside scope |
| #9312 SKILL.md parts | no | the spec parts go into the version spec commit (Task 4); the SKILL.md parts (Quality Gates G8/G9 rows, the Gotchas caveat) go into the N3 task that already edits `version-sdlc/SKILL.md` (part 2 Task 2); the `version.js:24` header comment stays | Q6: "A fold goes only into files its host item already edits"; item 1 edits specs only; version.js is not touched |
| #9316 | no | no behaviour change; commit spec A8 gets one sentence (relative to the cwd; see version-sdlc A11) | Q6 says "documented in the commit spec A11", but the commit spec has no A11 (A1–A9); version spec A11 already documents it; listed in QUESTIONS |
| pr (evidence) | no | Task 5 adds the pr evidence contract (A6 `--evidence-file`, R17, G13, P19, E8, I9) to the spec only; no pr SKILL.md or script change in this wave | R-b1 item 1 names "pr (evidence)"; the implementation is R-b2's PR evidence template; listed in QUESTIONS (a spec ahead of its code until R-b2) |
| Ledger flag refresh (#9228) | no | on an adopted ledger, ship rewrites the non-frozen flags and their `sources` entries from the merged CLI > config > default values of this run. No non-frozen flag is taken from the ledger. A run that used `--auto` must repeat it on resume. | owner ruling #9228; spec R11 precedence unchanged |
| G10+ check site | no | the trailer check moves from the inline `node -e` gate into `skill/commit.js --check-message`, run for every message (drafted or given) | scripts-over-llm-logic; the inline gate checked only `--message-file` messages |
| #9272 fix | no | commit-sdlc drafts the message in its own context from the manifest when the drafter dispatch returns nothing; manifest `errors[]` still stop | the narrowest fix that keeps the drafter path; the `model: haiku` dispatch parameter stays (not named by #9272) |
| Item 16 | no | one read-only task, no file change | Q4: "it stays in the plan as one read-only task that records this evidence, and nothing else" |
| Size | no | two part files in item order: part 1 Tasks 1–17 (items 1–8, all six spec commits) and part 2 Tasks 1–14 (items 9–16, renumbered from 18–31: old n is n−17) | past the split escape (Q1); the planner resume 1 ruling orders the split |
| Release commit, PR | no | not in this plan | the brief: the executor makes the release commit separately; no draft PR step |
| PR issue link | no | the executor's PR body cites #9319 and the item todos | pr-link-github-issue; the brief forbids a PR step |

## Key Decisions

- **Opt-in flags, always-on guards.**
  - The new ship flags (`--no-tag`, `--no-push`, `--release-subject`, `--review-threshold`, `--review-rounds`) change nothing when absent.
  - The guards that only remove a wrong result are always on: `--no-stash` to commit-sdlc, the stage step before commit-fixes, the re-run guards, the comment-copy preference, `--strict-files` to execute, and the trailer gate.
  - The alternative, a single "headless" switch, would hide five behaviours behind one name.

- **One resolution site per flag.** Each new flag is parsed once in `parseArgs`, merged once in `mergeFlags` with its `sources` entry, and read from `ledger.flags` by the step builder. No SKILL.md re-derives a flag (flag-resolution-single-source).

- **The scope guards stop with a pending question, never with a silent skip.**
  - A pending question (`reason: 'pending-question'`, `ship.js:2240-2250`) pauses the ledger and prints the resume commands.
  - N1 (`received-review.js --check-scope`), N1b (stage scope), the re-run guards and N3 all end this way, so a human or the orchestrator rules, and ship never guesses.

- **received-review owns the fix scope; ship only forwards.** Ship passes `--plan` and `--min-severity`. received-review.js turns the plan into `allowedFiles` with the same `parseFilesEntries` ship uses, and `--check-scope` checks the result after Step 11. Below-threshold findings are listed, never fixed, under `--min-severity`, even when `alwaysFixSeverities` names them. `--min-severity` is the stricter rule and wins.

- **Review rounds reuse the existing steps.** At the end of a round whose commit-fixes committed, ship.js archives the round's results into `ledger.rounds[]` and resets review, received-review and commit-fixes to `pending`. The same step ids run again. The loop ends at `flags.reviewRounds`, or as soon as a round's commit-fixes is skipped (no fixes, nothing new to review).

- **The re-run guard records a fact, not a guess.** At each `dispatch_version` and `dispatch_execute` emission, ship stores `dispatchHead` (HEAD) in that step's ledger entry. A later emission of the same step while its entry is `in_progress` or `failed` and `dispatchHead` is set compares HEAD and the tree. If anything moved, a commit or file changes happened after the dispatch, so ship stops and asks instead of running the step again. One helper serves both steps (dry).

- **Resume flag refresh (#9228).** Non-frozen flags keep CLI > config > default and are never taken from the ship ledger. "Refresh" means rewriting the ledger's non-frozen flags and their `sources` from the merged values of the run, because the step emitter reads `ledger.flags`. Spec R11 precedence is unchanged; only the refresh sentence is added. A run that used `--auto` repeats it: `/sdlc:ship-sdlc --resume --auto`.

- **G10+ as one shared check.** `checkTrailers(text, trailers)` in `scripts/lib/commit-message.js` splits on `/\r?\n/`. For each valued entry, exactly one line has that key (compared case-insensitively), and it equals `Key: Value`. A key-only entry needs exactly one `Key:` line. `skill/commit.js --check-message <file> --manifest <path>` runs it and exits 4 on a violation. `missingTrailers` and version.js stay as they are.

- **Workspace modes.** Ship derives the workspace as `branch` or `continue` (spec R60); there is no worktree switch.
  - Every new git read (`dispatchHead`, HEAD, `git status`, `git diff`) runs in the active worktree: `resolveActiveWorktreeSafe()` in ship.js, and the cwd of the received-review step in `--check-scope`.
  - Ship state and the execute state file are read through `lib/state.js` (`resolveStateDir()`, the main worktree's `.sdlc/execution/`), so a linked worktree and the main worktree see one ledger.
  - Config (`.sdlc/config.json`, `commit.requiredTrailers`) is read through `resolveSdlcRoot()`, the main worktree's `.sdlc/`.
  - In `branch` mode the active and main worktrees are the same directory, so nothing differs. In `continue` mode from a linked worktree, git reads hit the linked checkout and state and config hit the main one, as every existing step does.

- **Flag names checked across skills** (grep of `'--<flag>'` over `plugins/*/scripts/skill/*.js` at base):
  - `--no-tag` and `--no-push` exist only in `version.js`, with the meaning ship forwards.
  - `--plan` exists in `execute.js` and `ship.js` with the same meaning ("the plan markdown path"), which received-review now shares.
  - `--manifest` exists in `review-consolidate.js` (`:65`) as "path to a prepare manifest", the meaning `commit.js --check-message` and `received-review.js --check-scope` use.
  - `--release-subject`, `--review-threshold`, `--review-rounds`, `--strict-files`, `--min-severity`, `--check-scope`, `--check-message` and `--fixed` appear in no script.
  - So no flag gets a second meaning (flag-semantic-consistency-cross-skill).

- **Smallest viable cut.** Every task is one of the 16 GO items or a ruled fold (#9312, #9318, #9316). Within an item, the cut is the named behaviour plus its exec cases and doc rows.

- **Failure audience.** If this ships wrong, the next headless ship runs (the R-b2 work and the trial) stop on false pending questions, bump the version twice, or commit review fixes outside the plan. Human users of `/ship-sdlc` see a stage step before commit-fixes, `--no-stash`, and a stricter trailer gate. Every new behaviour has exec cases on the script that decides it.

### Non-goals

- R-b2 work: the `--summary-out` summary, the final-check step, the pr `--evidence-file` implementation, `--dry-run --json`, the verify-pipeline P9 fix.
- The #9304 worker extras (execute-worker `cat >>` appends, an undeclared `git worktree add`), now #9320.
- A change of `--message-file` resolution in either skill (#9316 kept).
- #9315 (version.js is not touched), the #9239 WIP-squash fallback (wave 4), the `model: haiku` parameter on the drafter dispatch.
- A config key for a stage allowlist; a ship `--strict-files` opt-out.
- No `plugin.json` bump, no CHANGELOG entry, no PR step.

## Contract Examples

### code

```markdown
**Contract:**
- shape (code): `checkTrailers(text: string, trailers: {key: string, value: string|null}[]): string[]`
  — CommonJS export from `scripts/lib/commit-message.js`; returns `missing trailer: <K[: V]>`,
  `duplicate trailer: <K>` or `wrong trailer: <line>` strings; `[]` when the message passes.
- names: `checkTrailers`; CLI `skill/commit.js --check-message <file> --manifest <path>` (exit 0 | 4 | 2).
- mirror: `missingTrailers` at `scripts/lib/commit-message.js:61-66`.
- decisions: keys compared case-insensitively; values byte-exact after trimming `\r`.
- sync: `skills/commit-sdlc/SKILL.md` Step 5 calls the CLI; `commit-trailers:` cases.
```

### docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `## Flags` table: rows after `--from-wave <n>`
  for `--no-tag`, `--no-push`, `--release-subject <text>`; audience: end users and pipeline authors.
- names: the three flag rows.
- mirror: the `--from-wave <n>` row at `docs/skills/ship-sdlc.md:56`.
- decisions: user-facing wording; name the version-sdlc flag each one forwards to.
- sync: ship spec A15–A17 and the SKILL.md `argument-hint`.
```

### openspec

```markdown
**Contract:**
- shape (openspec): ADD `A15`–`A19`, `R79`–`R86`, `G9`, `P12`, `E10`, `I16`, `C20` to
  `docs/specs/ship-sdlc.md`; MODIFY `R-b3`, `R8`, `R11`, `R40`, `R77`; delta text pinned in Task 1.
- names: as listed; numbering continues from A14, R78, G8, P11, E9, I15, C19 (C17 withdrawn, not reused).
- mirror: requirement blocks at `docs/specs/ship-sdlc.md:22-25` (A11–A14) and `:39-40` (R76).
- decisions: numeric ids, matching the file's convention; acceptance lines name exec-case prefixes.
- sync: SKILL.md and script comments cite the new ids.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Source-changing tasks carry promptfoo exec cases and existing assertions are updated; SKILL.md-only tasks use text-count cases |
| no-ci-bypass | error | PASS | No step skips or disables CI; the final task runs all validators and both exec configs |
| no-auto-eval | error | PASS | Only exec-only configs with targeted filters; no tight-loop retries |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the 16 wave items and ruled folds; extras justified in Deviations and Non-goals |
| single-responsibility-tasks | warning | PASS | Each task has one stated deliverable |
| scripts-over-llm-logic | error | PASS | Scope, threshold, rounds, re-run guard and trailer decisions live in scripts; SKILL.md reads resolved fields |
| yagni | warning | PASS | No speculative code; the pr evidence spec is brief-mandated and spec-only |
| cross-skill-consistency | error | PASS | Specs and SKILL.md for ship, received-review, commit, version and execute change together with ids cross-cited |
| pr-link-github-issue | error | PASS | Every commit cites #9319 and the PR body is stated to cite it |
| dry | warning | PASS | One rerunGuard helper, one checkTrailers, shared parseFilesEntries and stageCommands |
| kiss | warning | PASS | Reuses existing steps and checks; no extra abstractions |
| spec-first | error | PASS | Tasks 1-6 update specs before any SKILL.md or script task (Tasks 7-17 and part 2 Tasks 1-12) |
| project-agnostic | error | PASS | Behaviour ships in plugin code; repo-local edits (part 2 Tasks 3, 10) are dogfooding only |
| flag-coherence-cross-skill | error | PASS | Auto branches gate on resolved fields (flags.auto, manifest.flags.auto) |
| no-opposite-logical-vectors | error | PASS | Each concept's gate is stated once per skill; Rule 14 normalises auto-branch phrasing |
| flag-resolution-single-source | warning | PASS | Each new flag is parsed in parseArgs, merged once in mergeFlags and read from ledger.flags |
| state-premise | error | PASS | Architecture and Context state the root problem |
| smallest-viable-cut | warning | PASS | Key Decisions states the minimum cut and justifies each fold |
| failure-audience | warning | PASS | Key Decisions names headless ship runs and interactive users |
| explicit-non-goals | warning | PASS | A Non-goals section is present |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Deviations and Key Decisions with rationale |
| state-machine-idempotency | error | PASS | Repeat-call cases exist for the re-run guard, resume flags and execute re-run |
| agent-dispatch-script-driven | error | PASS | Dispatch args come from ship.js step output; the drafter fallback changes no dispatch parameters |
| flag-semantic-consistency-cross-skill | error | PASS | Key Decisions holds grep evidence that no flag gets a second meaning |
| workspace-mode-compatibility | error | PASS | Key Decisions states branch and continue behaviour via resolveActiveWorktreeSafe, resolveStateDir and resolveSdlcRoot |
| prompt-cache-hit-ratio | warning | PASS | dispatchHead lives in the ledger, not the prompt prefix; dynamic args stay in the invocation tail |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B3, B4)

**Why:** Task 17 turns run-once steps into a loop ("`--review-rounds` ... a real loop"). part 2 Task 4 adds the R11 refresh: on `--resume` the merged CLI > config > default flags are written back into the ledger in `plugins/sdlc-utilities/scripts/skill/ship.js`. Task 7 adds public flags to ship.js, and Task 12 has received-review.js reuse `parseFilesEntries` (a possible new import).

**Severity hint:** critical

**Patch:** Check that new flags (--no-tag, --no-push, --release-subject, --review-threshold, --review-rounds, --plan, --min-severity, --check-scope, --strict-files, --check-message) resolve once in the script and are forwarded unchanged; that the review-rounds loop and the merged-flag refresh on --resume keep the ledger and resume contract; and that new cross-module requires resolve.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that new flags (--no-tag, --no-push, --release-subject, --review-threshold, --review-rounds, --plan, --min-severity, --check-scope, --strict-files, --check-message) resolve once in the script and are forwarded unchanged; that the review-rounds loop and the merged-flag refresh on --resume keep the ledger and resume contract; and that new cross-module requires resolve.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: docs-skill-sync (B1)

**Why:** Task 7 adds `[--no-tag] [--no-push] [--release-subject <text>]` to the `argument-hint` of `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` and to `docs/skills/ship-sdlc.md`. Tasks 11, 13, 15 and 17 add `--review-threshold`, `--plan`/`--min-severity`, `--strict-files` and `--review-rounds` in the same way.

**Severity hint:** high

**Patch:** Check that every new flag appears in the SKILL.md argument-hint and the docs/skills Flags table for ship, received-review and execute-plan.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that every new flag appears in the SKILL.md argument-hint and the docs/skills Flags table for ship, received-review and execute-plan.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: hook-readiness (B1)

**Why:** part 2 Task 1 adds a line starting `**Under \`--auto\`:**` to `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` and `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`. part 2 Task 2 does the same for version-sdlc and received-review, so the headless pending-question contract changes.

**Severity hint:** high

**Patch:** Check that every AskUserQuestion site on the ship path stops with a failure and a pendingQuestion under --auto, consistent with the block-askuserquestion-auto hook.

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — Check that every AskUserQuestion site on the ship path stops with a failure and a pendingQuestion under --auto, consistent with the block-askuserquestion-auto hook.

_3 additional candidates suppressed_

## Tasks

### Task 1: ship spec — the ship chain contract (item 1)

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add A15–A19, R79–R86, G9, P12, E10, I16, C20; amend R-b3, R8, R11, R40, R77 and the P-TRANS-1 rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — copied by `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): ship-sdlc - spec for the ship chain`

**Notes:** Spec-first: every later ship task cites these ids. One commit, with no code. Placing each block in its contract section keeps `validate-spec-shape.js` green.

**Contract:**
- shape (openspec): ADD under `### Flags` after A14:
  - `A15: --no-tag` — forwarded to the version step as `--no-tag` (version A9) (R79) (default: false)
  - `A16: --no-push` — forwarded to the version step as `--no-push` (R79) (default: false)
  - `A17: --release-subject <text>` — forwarded to the version step as `--subject "<text>"` (version A10) (R79) (default: unset)
  - `A18: --review-threshold critical|high|medium|low` — CLI > config `ship.reviewThreshold` > default `high` (R40) (default: from config or high)
  - `A19: --review-rounds <n>` — integer 1–3; the number of review → received-review → commit-fixes rounds (R84) (default: 1)

  ADD under `### Pipeline steps` (R79, R81–R84) and `### Resume` (R80, R86), each with an `  - Acceptance:` line that names its exec-case prefix:
  - `R79`: The version step's `args` are `--bump <b> --auto [--no-tag] [--no-push] [--subject "<text>"] [--expected-branch <br>]`, in this order. `--release-subject` is checked in prepare: it must not contain `"`, a backtick, `$`, `\` or a newline, it must be at most 72 characters, and it must match `commit.subjectPattern` when one is set. A bad value is a prepare error `{ id: 'releaseSubjectInvalid', message }`, mirrored to stderr, before any state write. Acceptance: `ship-fwd:`.
  - `R80` (#9318): When ship emits `dispatch_version` or `dispatch_execute`, it records `dispatchHead` (the HEAD sha) in that step's ledger entry. When the step is emitted again while its entry is `in_progress` or `failed` and `dispatchHead` is set, and HEAD differs from `dispatchHead`, ship emits no dispatch. It ends with a pending question instead (`id: 'rerunGuard'`, naming the step and both shas), with the commands `node "<PLUGIN_ROOT>/scripts/state/ship.js" complete --step <step> --result "<text>"`, `node "<PLUGIN_ROOT>/scripts/state/ship.js" skip --step <step> --reason "<text>"` and `/sdlc:ship-sdlc --resume` (with `--auto` when the run used it). version-sdlc R19 cannot see an untagged release, so ship owns this guard. Acceptance: `ship-rerun:`.
  - `R81` (#9310): The commit and commit-fixes steps' `args` carry `--no-stash` after `--auto`. Acceptance: `ship-nostash:`.
  - `R82` (N1): The received-review step's `args` are `--auto --plan "<planFile>" --min-severity <reviewThreshold>`, then the R77 input. A received-review result with a `pendingQuestion` (its `--check-scope` failed, received-review R30) stops the run before commit-fixes, through the existing pending-question path. Acceptance: `ship-rr-scope:`.
  - `R83` (N1b): The execute step's `args` carry `--strict-files` (execute A10). `stage_changes` and `stage_fixes` refuse to stage a changed path (from `git status --porcelain`, untracked included, `.sdlc/` excluded) that is not a plan Files path (`parseFilesEntries`, every kind). A refusal is a pending question (`id: 'stageOutsideFiles'`, listing the paths); no `git add` runs. The plan file itself must be committed before ship runs; an uncommitted plan file is reported as outside like any other path. Acceptance: `ship-strict:`.
  - `R84` (#9308): With `flags.reviewRounds` n > 1, when commit-fixes is recorded `completed` in round k < n, ship.js appends `{ round: k, review, receivedReview, commitFixes }` (the step records) to `ledger.rounds[]`, sets `ledger.round = k + 1`, and resets review, received-review and commit-fixes to `pending`. The next emitted step is `dispatch_review`. A round whose commit-fixes is `skipped` ends the loop. Acceptance: `ship-rounds:`.
  - `R85` (N3): Under `--auto` ship asks nothing. Every AskUserQuestion site in ship and its sub-skills has an `--auto` branch that stops with a failure and a `pendingQuestion`, which ship maps to `pending-question`. Acceptance: the C20 rule and `ask-auto-branch:`.
  - `R86` (stop-2): When `dispatch_execute` would be emitted while execute is `in_progress`, no execute state file exists and the tree has changes outside `.sdlc/` (or HEAD differs from `dispatchHead`), ship applies the R80 stop, not a fresh dispatch. Acceptance: `ship-rerun: (execute)`.

  MODIFY:
  - `R-b3`: append "Exception: with `flags.noTag` true (A15), the version step is checked as `head-commit`, so the reported `artifacts.commit` must exist and be HEAD, and no tag is looked up; `verify_version_tag` emits no command." Acceptance gains `ship-fwd: (R-b3)`.
  - `R8`: append "The same staging runs as `stage_fixes` after received-review and before `confirm_commit_fixes`/`dispatch_commit_fixes`, when received-review is recorded `completed` and the tree has changes (#9307)." Add P-TRANS-1 rows `dispatch_received_review → stage_fixes` and `stage_fixes → confirm_commit_fixes`.
  - `R11`: keep the precedence sentence unchanged ("every other flag … — CLI > config > default, never taken from the ledger"). Append: "On an adopted ledger, these merged values and their `sources` entries are rewritten into `ledger.flags` on every run (#9228); `planFile`, `openspecContext`, `steps`, `tasks` and `fromWave` keep their own rules." Keep its acceptance; add `ship-resume-flags:`.
  - `R40`: "Resolution: CLI `--review-threshold` > config > default; `flags.sources.reviewThreshold` is `cli`, `config` or `default`."
  - `R77`: the input order becomes: the review copy (`commentCopyPath`, else `commentPath`) of this run's review, when it exists → `--comment-file "<path>"`; else an OPEN PR → `--pr <N>`; else nothing (#9302).

  ADD: `G9` (under `## Gates`): "Scope gate — `stage_*` stages only plan Files paths (R83); received-review's `--check-scope` passed (R82)". `P12` (`## Prepare script contract`): "`flags` gains `noTag`, `noPush`, `releaseSubject`, `reviewRounds`, with `sources` entries". `E10` (`## Failure handling and resume`): "`releaseSubjectInvalid`, `rerunGuard`, `stageOutsideFiles` and a received-review scope failure end the run with an error or a pending question; nothing is staged or dispatched after them". `I16` (`## Integration`): "version-sdlc A9/A10 and `--no-push`; received-review A4/A5; execute A10; commit A1". `C20` (`## Invariants and constraints`): "No skill on the ship path (ship-sdlc, execute-plan-sdlc, commit-sdlc, review-sdlc, received-review-sdlc, version-sdlc, pr-sdlc) calls AskUserQuestion without an `--auto` branch in the same section; `check-consistency.js` Rule 14 `ask-auto-branch` enforces it".
- names: A15–A19, R79–R86, G9, P12, E10, I16, C20; modified R-b3, R8, R11, R40, R77, P-TRANS-1.
- mirror: `docs/specs/ship-sdlc.md:22-25` (A11–A14), `:39-40` (R76 with acceptance), `:111` (R-b3).
- decisions: Key Decisions "opt-in flags", "pending question", "re-run guard".
- sync: Tasks 7–17 and part 2 Tasks 1–7 cite these ids in code comments and SKILL.md text; every cited id must exist in the spec.

**Acceptance criteria:**
- [ ] Every id above exists exactly once as a `- <id>` bullet in the named section, and no existing id is renumbered or reused.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] The site copy equals the source: `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md && cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; `for id in A15 A16 A17 A18 A19 R79 R80 R81 R82 R83 R84 R85 R86 G9 P12 E10 I16 C20; do printf '%s %s\n' "$id" "$(grep -cE "^\s*- $id[:( ]" docs/specs/ship-sdlc.md)"; done` prints `1` for each; `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md && cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`.

---

### Task 2: received-review spec — fix scope, threshold, comment-file mode (item 1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — add A4–A6, R28–R32, G13, P19, P20, E9, C19, I7
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — copied by `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): received-review-sdlc - spec for fix scope and comment-file mode`

**Notes:** N1's guard is a received-review contract; ship only forwards (ship R82). The comment-file fixes (#9302) amend R27's mode without changing its id.

**Acceptance criteria:**
- [ ] Each new id exists once in its section; R27 is unchanged in id.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0; `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md && cmp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD under `### Flags`:
  - `A4: --plan <path>` — the plan whose Files bound the fixes (R28) (default: unset)
  - `A5: --min-severity critical|high|medium|low` — the lowest severity that may be fixed (R29) (default: unset)
  - `A6: --check-scope --manifest <path> --fixed <ids>` — the post-Step-11 check mode (R30) (default: off)

  ADD requirements:
  - `R28`: With `--plan`, the manifest's `allowedFiles` is the sorted, unique list of the plan's Files paths (`parseFilesEntries` over every task, every kind). A finding whose fix needs a path outside `allowedFiles` gets the verdict "needs discussion" and is never auto-actioned. Without `--plan`, `allowedFiles` is null and nothing changes.
  - `R29`: With `--min-severity`, a finding whose severity ranks below it, or is null, is listed as "below threshold" and is never fixed, even under `--auto` or `alwaysFixSeverities` (R18).
  - `R30`: After Step 11, SKILL.md runs `received-review.js --check-scope --manifest <m> --fixed <ids>`. Exit 0 prints `{"ok":true,…}`. Exit 1 prints `{"ok":false,"outOfScope":[…],"belowThreshold":[…]}` when a changed path (`git diff --name-only HEAD` plus untracked files, `.sdlc/` excluded) is not in `allowedFiles`, or a fixed id's severity ranks below `minSeverity`. Exit 2 is a script error. On exit 1 or 2 the skill stops with a failure and a `pendingQuestion` that names the paths and ids; it never reverts.
  - `R31` (#9302): When `manifest.source` is `comment-file`, Steps 7, 8 and 10 draft no thread reply. Step 7 keeps one decision line per finding, Step 8's thread-level row is not applied, and Step 10 shows no "Drafted PR responses" block.
  - `R32` (#9302): When `manifest.pr` is null, Step 11.6 writes `PR: none (comment-file <basename of manifest.comment_file>)`, and its dedup matches prior entries by `surface=`, `targetFile=` and that same `PR:` line.

  ADD: `G13` "Fix scope — `--check-scope` exit 0 before Step 12 (R30)"; `P19` "`allowedFiles: string[] | null`"; `P20` "`flags.minSeverity: string | null`"; `E9` "`--check-scope` exit 1 or 2 → failure with `pendingQuestion`, Step 12 skipped"; `C19` "Under `--auto` no AskUserQuestion: the unclear-item (Step 2) and cannot-verify (Step 3) cases get the verdict "needs discussion" (ship R85)"; `I7` "ship-sdlc R82 forwards `--plan` and `--min-severity`".
- names: A4–A6, R28–R32, G13, P19, P20, E9, C19, I7.
- mirror: R27 block at `docs/specs/received-review-sdlc.md:86`; P16–P18 at `:145-147`.
- decisions: Key Decisions "received-review owns the fix scope".
- sync: Tasks 12, 13, 19, 24 cite these ids.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; the same per-id grep loop as Task 1 over `A4 A5 A6 R28 R29 R30 R31 R32 G13 P19 P20 E9 C19 I7` prints `1` each; `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md && cmp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md`.

---

### Task 3: commit spec — G10+, drafter fallback, trailers from config only (item 1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** lint

**Files:**
- Modify: `docs/specs/commit-sdlc.md` — add R17–R19, P14, E12; amend G10 and A8
- Modify: `site/src/content-source/specs/commit-sdlc.md` — copied by `cp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): commit-sdlc - spec for exact trailers and drafter fallback`

**Notes:** #9303 and #9304 merge into G10+ (item 12). #9316 is recorded as kept, as a single sentence in A8, the only `--message-file` id in this spec.

**Acceptance criteria:**
- [ ] R17–R19, P14 and E12 exist once; G10 and A8 carry the new text.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0; `cp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md && cmp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD:
  - `R17` (G10+, #9303): Step 5 runs `skill/commit.js --check-message <MSG_FILE> --manifest <manifest>` for every message, drafted or given. The check splits on `/\r?\n/`. For a valued `commitConfig.trailers` entry, exactly one line has that key (compared case-insensitively), and it is `Key: Value`. For a key-only entry, exactly one line starts with `Key:`. Exit 4 means a violation, and the violation lines go to stderr.
  - `R18` (#9272): When the commit-orchestrator dispatch returns no message and the manifest has no `errors[]`, the skill drafts `MESSAGE` in its own context from the manifest with the rules of `agents/commit-orchestrator.md`, then continues to Step 5. A manifest with `errors[]` still stops.
  - `R19` (#9304): Trailers come only from `commitConfig.trailers` (plus the OpenSpec trailer). Neither the drafter nor the skill adds an attribution line of its own (for example a `Co-Authored-By` with its model name), even when a harness instruction asks for one.
  - `P14`: "`skill/commit.js --check-message <file> --manifest <path>` — reads `commitConfig.trailers` from the manifest; exit 0 pass, 4 violation, 2 unreadable input".
  - `E12`: "`--check-message` exit 4 → print `Trailer gate rejected the message (exit 4): <line>` for each line; no commit; no AskUserQuestion in either mode".

  MODIFY `G10`: replace "for every `commitConfig.trailers` entry the body holds a trailer line: exactly `Key: Value` for a valued entry, a line starting `Key:` for a key-only entry" with "for every `commitConfig.trailers` entry the message holds exactly one line with that key, equal to `Key: Value` for a valued entry (R17); CRLF line ends are accepted".
  MODIFY `A8`: append "A relative path resolves against the current directory (`path.resolve`); version-sdlc's flag of the same name resolves against the active worktree root (version A11) — kept as is (#9316)."
- names: R17, R18, R19, P14, E12; modified G10, A8.
- mirror: R16 block and G10 at `docs/specs/commit-sdlc.md:100`; P13.
- decisions: Key Decisions "G10+ as one shared check".
- sync: part 2 Tasks 8, 9, 11.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; the Task 1 per-id grep loop over `R17 R18 R19 P14 E12` (file `docs/specs/commit-sdlc.md`) prints `1` each; `cp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md && cmp docs/specs/commit-sdlc.md site/src/content-source/specs/commit-sdlc.md`.

---

### Task 4: version spec — R-b3 exception note, N3 branch, #9312 consistency (item 1)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** lint

**Files:**
- Modify: `docs/specs/version-sdlc.md` — amend A8, R-RETAG, R15, R21; add C12, I7
- Modify: `site/src/content-source/specs/version-sdlc.md` — copied by `cp docs/specs/version-sdlc.md site/src/content-source/specs/version-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): version-sdlc - spec for the no-tag caller guard and auto stops`

**Notes:** #9312 folds here (spec parts only, ruling Q6). #9318's guard is ship-side (ship R80); this spec only points to it.

**Acceptance criteria:**
- [ ] A8 and R-RETAG list `--no-tag` among the `--retag` conflicts; R15 no longer contradicts R21.
- [ ] C12 and I7 exist once; `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] `cp docs/specs/version-sdlc.md site/src/content-source/specs/version-sdlc.md && cmp docs/specs/version-sdlc.md site/src/content-source/specs/version-sdlc.md` exits 0.

**Contract:**
- shape (openspec):
  ```diff
  - A8 … Incompatible with bump types (`major`/`minor`/`patch`), `--init`, `--changelog`, and `--hotfix`.
  + A8 … Incompatible with bump types (`major`/`minor`/`patch`), `--init`, `--changelog`, `--hotfix` and `--no-tag`.
  - R15 … the subsequent `git push --tags` is unchanged.
  + R15 … the subsequent `git push --tags` is unchanged, except that it is skipped when `flags.noTag` is true (R21).
  ```
  R-RETAG: the same `--no-tag` addition in its Exclusivity sentence. R21: append "R19 cannot detect an untagged release; a caller that re-runs the release flow owns the re-run guard (ship-sdlc R80)."
  ADD `C12`: "Under `--auto` no AskUserQuestion: the uncommitted-changes warning (SKILL.md Step 1) and the init confirm (`init-workflow.md` Step 3) stop with a failure and a `pendingQuestion` that holds the question and its options (ship R85)." ADD `I7`: "ship-sdlc forwards `--no-tag`, `--no-push` and `--subject` (ship R79) and checks a `--no-tag` release by its commit (ship R-b3 exception)."
- names: modified A8, R-RETAG, R15, R21; new C12, I7.
- mirror: `docs/specs/version-sdlc.md:19`, `:26`, `:80`, `:91`; C11 at `:175`.
- decisions: Deviations "#9312 SKILL.md parts".
- sync: part 2 Task 2 (version SKILL.md C12 branch, Quality Gates rows).

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; `grep -c -- '--no-tag' docs/specs/version-sdlc.md` rises by at least 4; the Task 1 per-id grep loop over `C12 I7` (file `docs/specs/version-sdlc.md`) prints `1` each; `cp docs/specs/version-sdlc.md site/src/content-source/specs/version-sdlc.md && cmp docs/specs/version-sdlc.md site/src/content-source/specs/version-sdlc.md`.

---

### Task 5: pr spec — the evidence contract (item 1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** lint

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — add A6, R17, G13, P19, E8, I9
- Modify: `site/src/content-source/specs/pr-sdlc.md` — copied by `cp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): pr-sdlc - spec for the PR evidence section`

**Notes:** Item 1 names "pr (evidence)". The new ids A6, R17, G13, P19, E8 and I9 are the contract that the later ship-evidence wave (R-b2) implements: pr.js, SKILL.md, the template heading and ship forwarding. This commit only fixes that contract. One appendix history line says so.

**Acceptance criteria:**
- [ ] A6, R17, G13, P19, E8 and I9 exist once in their sections.
- [ ] `## Appendix — history` holds one added line naming the six ids as the contract the ship-evidence wave implements.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0; `cp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md && cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD:
  - `A6: --evidence-file <path>` — lines for the PR body's `## Evidence` section (R17) (default: unset)
  - `R17`: With `--evidence-file`, the PR body holds a `## Evidence` section with the file's non-empty lines verbatim, in order. Every line must end with `(at <sha7>)`, where `<sha7>` is the first seven hex characters of a commit on the branch. Without the flag, an `## Evidence` heading in the template is filled with "Not detected" (R12).
  - `G13`: "Evidence stamps — every Evidence line ends with `(at <sha7>)` of a branch commit".
  - `P19`: "`evidence: { file, lines[] } | null`".
  - `E8`: "an unreadable file, an empty file or an unstamped line is an `errors[]` entry and exit 1, before any `gh` call".
  - `I9`: "ship-sdlc forwards `--evidence-file` (R-b2)".

  ADD one line under `## Appendix — history` (`### Issue trail`):
  ```markdown
  - A6, R17, G13, P19, E8, I9 — contract added in M9 wave R-b1 (#9319); implemented by the later ship-evidence wave (R-b2, PR evidence template).
  ```
- names: A6, R17, G13, P19, E8, I9.
- mirror: R12 at `docs/specs/pr-sdlc.md:18`; P18; G12.
- decisions: Deviations "pr (evidence)".
- sync: none in this wave.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; the Task 1 per-id grep loop over `A6 R17 G13 P19 E8 I9` (file `docs/specs/pr-sdlc.md`) prints `1` each; `cp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md && cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md`.

---

### Task 6: execute-plan spec — strict files, auto stops, parse call split (item 1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — add A10, R44, P10, G13, E16, I14, C17; amend E15
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — copied by `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`, never edited by hand

**Commit:** `docs(#9319): execute-plan-sdlc - spec for strict files and auto stops`

**Notes:** Items 7, 9 and 15 touch execute-plan-sdlc. The ids are the ones ruled in Q8.

**Acceptance criteria:**
- [ ] A10, R44, P10, G13, E16, I14 and C17 exist once; E15 names two separate Bash calls.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0; `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md && cmp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD:
  - `A10: --strict-files` — a wave that touches a file outside its `expectedFiles` fails (R44) (default: false)
  - `R44` (N1b): With `flags.strictFiles` true, the Step 5c `expectedFiles` cross-check is hard. A non-empty `diffFiles \ expectedSet` marks every task of the wave not done and stops the run with E16. There is no Step 6 retry. An empty `expectedSet` still skips the check.
  - `P10`: "`flags.strictFiles: boolean`, source `cli` or `default`".
  - `G13`: "Strict files — under `flags.strictFiles`, no wave diff path outside `expectedFiles`".
  - `E16`: "strict-files violation → print `Wave N touched files outside expectedFiles: <paths>`, return failure; no retry, no revert".
  - `I14`: "ship-sdlc R83 always forwards `--strict-files`".
  - `C17`: "Under `--auto` no AskUserQuestion: the `flags.rebase: prompt` choice and the `MaxSplitDepthExceededError` escalation stop with a failure and a `pendingQuestion` (ship R85)".

  MODIFY `E15`: "The Step 5c parse runs as one Bash call whose exit code is read from the tool result; the summary file is removed by a second, separate `rm -f` call (#9241). No JSON line, or a non-zero exit, → no task of the wave is marked done …" (rest unchanged).
- names: A10, R44, P10, G13, E16, I14, C17; modified E15.
- mirror: E15 at `docs/specs/execute-plan-sdlc.md:258`; A9 at `:18`; R43 at `:28`.
- decisions: Deviations "N1b ship flag".
- sync: Tasks 15, 18, 29.

**Verification:** `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`; the Task 1 per-id grep loop over `A10 R44 P10 G13 E16 I14 C17` (file `docs/specs/execute-plan-sdlc.md`) prints `1` each; `cp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md && cmp docs/specs/execute-plan-sdlc.md site/src/content-source/specs/execute-plan-sdlc.md`.

---

### Task 7: ship — forward `--no-tag`, `--no-push`, `--release-subject`; R-b3 exception (item 2)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — parse A15–A17, merge them, add them to the version args, check `releaseSubject`, apply the R-b3 exception in `runAfter`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — a seed patch `noTag` (ledger `flags.noTag: true`)
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-fwd:` cases
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — `argument-hint` and description Arguments list gain `[--no-tag] [--no-push] [--release-subject <text>]`
- Modify: `docs/skills/ship-sdlc.md` — three `## Flags` rows

**Commit:** `feat(#9319): ship-sdlc - forward release flags to version-sdlc`

**Notes:** version-sdlc already has these flags (R-a). The R-b3 exception reuses the existing `head-commit` check, so no new git logic is added.

**Acceptance criteria:**
- [ ] `--no-tag --no-push --release-subject "chore(#1): release - v1.2.3"` gives version args `--bump patch --auto --no-tag --no-push --subject "chore(#1): release - v1.2.3"` (then `--expected-branch` when set); without the flags the args are byte-identical to today.
- [ ] A `--release-subject` holding `$`, longer than 72 characters, or failing `commit.subjectPattern` is a `releaseSubjectInvalid` prepare error, exit 1, with no ledger written.
- [ ] `--after dispatch_version` on a `noTag` ledger records version `completed` when `artifacts.commit` is HEAD and no tag exists, and `failed` when the commit is not HEAD.

**Contract:**
- shape (code):

  | Op | Key | Type | Value | Notes |
  |---|---|---|---|---|
  | add | `flags.noTag` | boolean | `false` | `--no-tag`; source `cli`/`default` |
  | add | `flags.noPush` | boolean | `false` | `--no-push` |
  | add | `flags.releaseSubject` | string\|null | `null` | `--release-subject <text>`; missing value → `--release-subject requires a value.` |

  ```diff
        args: [
          `--bump ${flags.bump || 'patch'}`,
          '--auto',
  +       flags.noTag ? '--no-tag' : '',
  +       flags.noPush ? '--no-push' : '',
  +       flags.releaseSubject ? `--subject "${flags.releaseSubject}"` : '',
          expectedBranch ? `--expected-branch ${expectedBranch}` : '',
        ].filter(Boolean).join(' '),
  ```
  ```diff
  -   if (name && STEP_SIDE_EFFECTS[name] === 'tag' && success) {
  +   if (name && STEP_SIDE_EFFECTS[name] === 'tag' && success && !flags.noTag) {
  ```
  and, directly after that block, a new branch for the untagged release:
  ```diff
      if (name && STEP_SIDE_EFFECTS[name] === 'tag' && success && !flags.noTag) {
        …
      }
  +   // R-b3 exception (A15): an untagged release is checked by its commit.
  +   if (name === 'version' && success && flags.noTag) {
  +     const sha = output.artifacts && output.artifacts.commit;
  +     if (!checkHeadCommit(sha, resolveActiveWorktreeSafe()).landed) {
  +       success = false;
  +       failureText = `release commit "${sha || ''}" is not HEAD`;
  +     }
  +   }
      // W4.6: commit/commit-fixes and pr are cross-checked like version (git HEAD; gh pr view).
  ```

  | `flags.noTag` | `artifacts.tag` | `artifacts.commit` | Result |
  |---|---|---|---|
  | false | in `git tag --list` | any | `completed` (unchanged) |
  | false | missing | any | `failed`: `version tag "<t>" was not found in the git tag list` (unchanged) |
  | true | ignored | HEAD | `completed` |
  | true | ignored | not HEAD or absent | `failed`: `release commit "<sha>" is not HEAD` |

  `verify_version_tag` emits no command for an untagged release:
  ```diff
          commands: NEW_TAG && EXECUTE_BRANCH
  +         && !flags.noTag
              ? [`node "${VERIFY_TAG_SCRIPT}" --tag "${NEW_TAG}" --branch "${EXECUTE_BRANCH}" --remote origin`]
              : [],
  ```
  so `commands: NEW_TAG && EXECUTE_BRANCH && !flags.noTag ? [<existing command>] : []`.

  | Condition | Result |
  |---|---|
  | `--release-subject` contains `"` `` ` `` `$` `\` or a newline | `{ id: 'releaseSubjectInvalid', message }`, exit 1, stderr mirror |
  | longer than 72 characters, or fails `commit.subjectPattern` | same id, message names the rule |
- names: `noTag`, `noPush`, `releaseSubject`, `releaseSubjectInvalid`; R79, R-b3.
- mirror: the `planCommitSubjectInvalid` check (R-plan-commit-subject) in ship.js; the R76 `--tasks` parse at `ship.js:156-165`.
- decisions: Deviations "Release subject source", "`--no-tag` / `--no-push` in ship".
- sync: `docs/skills/ship-sdlc.md` rows; SKILL.md `argument-hint`; spec A15–A17.

**Test proof:** new cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml`: `ship-fwd: (a) release flags reach the version args in order`, `ship-fwd: (b) no release flags leave the version args unchanged`, `ship-fwd: (c) release subject with $ is releaseSubjectInvalid`, `ship-fwd: (d) release subject failing subjectPattern is releaseSubjectInvalid`, `ship-fwd: (R-b3) no-tag version completes on a HEAD release commit without a tag`, `ship-fwd: (R-b3) no-tag version fails when the release commit is not HEAD`, `ship-fwd: (R-b3) no-tag ledger emits verify_version_tag with no command`. All assert on JSON output; none waits.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-fwd:|ship-step: \(l\)|ship-prepare \(R-plan-commit-subject\)" -j 2 --no-cache -o /tmp/pf-wRb1-t7.json`

---

### Task 8: ship — the re-run guard for version and execute (item 2, #9318 fold; reused by item 10)

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — record `dispatchHead` on `dispatch_version` emission only (the `dispatch_execute` recording is part 2 Task 5); `rerunGuard(entry, cwd)`; a pending-question return from `pickNextStep`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenarios `rerun-version-moved`, `rerun-version-same`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-rerun:` cases

**Commit:** `fix(#9319): ship-sdlc - stop instead of re-running a dispatched version step`

**Notes:** Required by Q6. Without it, a `--no-tag` re-run bumps twice. This task builds the guard for version. part 2 Task 5 adds the execute condition (R86) to the same helper, so the guard logic exists once.

**Acceptance criteria:**
- [ ] Emitting `dispatch_version` stores `steps[version].dispatchHead` = HEAD sha.
- [ ] A second emission with the version entry `in_progress` or `failed`, `dispatchHead` set, and HEAD ≠ `dispatchHead` returns a `done` envelope with `reason: 'pending-question'`, `pendingQuestion.id: 'rerunGuard'`, the ledger `paused`, and no dispatch.
- [ ] A second emission with HEAD = `dispatchHead` dispatches again (a crashed run that made no commit).
- [ ] Idempotency: a repeated call gives the same envelope (`reason`, `pendingQuestion`, `commands`); the ledger differs only in `paused.at` and the history row appended by that `--after` call; `steps[version]` and its `dispatchHead` are unchanged.

**Contract:**
- shape (code): `function rerunGuard(entry: object, cwd: string): null | { prompt: string, options: ['record', 'rerun'], id: 'rerunGuard', step: string, dispatchHead: string, head: string }` (no `question` key, no `commands` key). `pickNextStep` may return `{ pending: <that object>, commands: <extraCommands> }`, and the caller maps that to `pendingStop(question, viaExecute, extraCommands)`:
  ```diff
  - const pendingStop = (question, viaExecute) => {
  + const pendingStop = (question, viaExecute, extraCommands = []) => {
      ledger.paused = { at: new Date().toISOString(), reason: 'pending question' };
      const commands = [
        ...(viaExecute ? [`/sdlc:execute-plan-sdlc --plan "${flags.planFile}" --resume`] : []),
  +     ...extraCommands,
        '/sdlc:ship-sdlc --resume',
      ];
  ```
  so `ext.commands = [...viaExecuteLine, ...extraCommands, '/sdlc:ship-sdlc --resume']`.

  | From | Event | To |
  |---|---|---|
  | version `pending` | emit `dispatch_version` | `in_progress`, `dispatchHead` = HEAD |
  | entry `in_progress` or `failed`, `dispatchHead` set, HEAD = `dispatchHead` | emit again | dispatch again |
  | entry `in_progress` or `failed`, `dispatchHead` set, HEAD ≠ `dispatchHead` | emit again | pending question `rerunGuard`, ledger `paused` |

  `extraCommands` for version: `node "<PLUGIN_ROOT>/scripts/state/ship.js" complete --step version --result "release commit <head> recorded by hand"`, `node "<PLUGIN_ROOT>/scripts/state/ship.js" skip --step version --reason "re-run guard: release already made"`; the envelope ends with `/sdlc:ship-sdlc --resume` (with `--auto` when the run used it, R80).
- names: `dispatchHead`, `rerunGuard`, scenarios `rerun-version-moved`, `rerun-version-same`; R80.
- mirror: `pendingStop` at `ship.js:2240-2250`; `checkHeadCommit` usage at `:2154-2160`.
- decisions: Key Decisions "re-run guard records a fact".
- sync: part 2 Task 5 extends `rerunGuard` to execute (R86).

**Test proof:** `ship-rerun: (version) moved HEAD stops with rerunGuard`, `ship-rerun: (version) same HEAD dispatches again`, `ship-rerun: (version) repeated call is idempotent`, `ship-rerun: (version) dispatchHead is recorded on emission`, `ship-rerun: (version) failed entry with moved HEAD stops with rerunGuard`. The stepper seeds HEAD through its fixture repo; no case waits on time.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rerun:|ship-step:" -j 2 --no-cache -o /tmp/pf-wRb1-t8.json`

---

### Task 9: ship — forward `--no-stash` to commit and commit-fixes (item 3, #9310)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `--no-stash` after `--auto` in the commit and commit-fixes args
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-nostash:` case; update every existing exact-args assertion on the two steps
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the `--auto` audit row for commit-sdlc names `--no-stash`

**Commit:** `fix(#9319): ship-sdlc - forward --no-stash to the commit steps`

**Notes:** Stash is forbidden in pipeline runs (INV-7). The git stash stack is shared across worktrees, and commit-sdlc's bare `git stash pop` can pop another session's entry.

**Acceptance criteria:**
- [ ] The commit args are `--auto --no-stash [--subject "…"] [--expected-branch …]`; commit-fixes the same.
- [ ] R-expected-branch-injection's "ending with" acceptance still holds (`--expected-branch` stays last).

**Contract:**
- shape (code):
  ```diff
        args: [
          '--auto',
  +       '--no-stash',
          planSubject ? `--subject "${planSubject}"` : '',
          expectedBranch ? `--expected-branch ${expectedBranch}` : '',
  ```
  (same edit in the commit-fixes block with `planFixSubject`).
- names: R81.
- mirror: `ship.js:486-490`, `:526-530`.
- decisions: always on (Key Decisions "opt-in flags, always-on guards").
- sync: `ship-prepare (R-plan-commit-subject)` and `ship-fix-subject` cases that assert exact args.

**Test proof:** `ship-nostash: commit and commit-fixes args carry --no-stash after --auto`; the edited `ship-prepare (R-plan-commit-subject)` and `ship-fix-subject: (a)` cases stay green.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-nostash:|ship-fix-subject|R-plan-commit-subject|R-expected-branch" -j 2 --no-cache -o /tmp/pf-wRb1-t9.json`

---

### Task 10: ship — the `stage_fixes` step before commit-fixes (item 4, #9307)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 9
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `stage_fixes` in `STEP_ORDER` after `dispatch_received_review`; its `pickNextStep` case; its step description
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenario `after-received-review-changes`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-stage-fixes:` cases
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — the commit-fixes paragraph names the stage step
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — add `stage_fixes` to the inline-step list at :270 (`` `stage_changes`, `rebase`, … `` → `` `stage_changes`, `stage_fixes`, `rebase`, … ``)

**Commit:** `fix(#9319): ship-sdlc - stage review fixes before commit-fixes`

**Notes:** commit-sdlc commits only staged files and errors "No staged changes" otherwise, so the agent improvised `git add` (P4). `stage_fixes` reuses `stageCommands` unchanged, and Task 16 adds the scope check to both stage steps at once.

**Acceptance criteria:**
- [ ] After received-review is recorded `completed` with a dirty tree, the next emitted step is `stage_fixes` with `data.commands` equal to `stageCommands(planFile, cwd)`, then `confirm_commit_fixes`/`dispatch_commit_fixes`.
- [ ] With received-review skipped or a clean tree, `stage_fixes` is not emitted.
- [ ] `stage_fixes` is not a ledger step (absent from `STEP_ID_TO_LEDGER_NAME`), like `stage_changes`.

**Contract:**
- shape (code):

  | Now | After |
  |---|---|
  | `… dispatch_received_review, confirm_commit_fixes, dispatch_commit_fixes …` | `… dispatch_received_review, stage_fixes, confirm_commit_fixes, dispatch_commit_fixes …` |

  ```diff
        case 'stage_changes':
          if (!recorded.has('execute')) continue;
          data = { commands: stageCommands(flags.planFile, resolveActiveWorktreeSafe()) };
          break;
  +     case 'stage_fixes':
  +       if (unmetCondition('commit-fixes', ledger) !== null) continue;
  +       data = { commands: stageCommands(flags.planFile, resolveActiveWorktreeSafe()) };
  +       break;
  ```
- names: `stage_fixes`; R8 (amended).
- mirror: `stage_changes` at `ship.js:1835-1838`, its description at `:1975`.
- decisions: Key Decisions; Deviations none.
- sync: P-TRANS-1 rows in the spec (Task 1).

**Test proof:** `ship-stage-fixes: (a) dirty tree after received-review emits stage_fixes`, `ship-stage-fixes: (b) clean tree skips stage_fixes`, `ship-stage-fixes: (c) skipped received-review skips stage_fixes`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-stage-fixes:|ship-stage-sdlc|ship-step:" -j 2 --no-cache -o /tmp/pf-wRb1-t10.json`

---

### Task 11: ship — `--review-threshold` (item 5, #9309)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 10
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — parse `--review-threshold`, merge CLI > config > default
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-threshold:` cases
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — `argument-hint` and Arguments list
- Modify: `docs/skills/ship-sdlc.md` — `--review-threshold` row

**Commit:** `feat(#9319): ship-sdlc - add --review-threshold`

**Notes:** This replaces the dropped `ship.reviewThreshold` config edit: a headless `--setting-sources project,local` run would not read a main-checkout `local.json`.

**Acceptance criteria:**
- [ ] `--review-threshold medium` gives `flags.reviewThreshold: "medium"` with source `cli`; config and default behave as today.
- [ ] A value outside `critical|high|medium|low`, or a missing value, is an `errors[]` entry naming the flag.

**Contract:**
- shape (code):
  ```diff
  -  // reviewThreshold: not a CLI flag, comes from config or default.
  -  if (cfg.reviewThreshold !== undefined) {
  +  // reviewThreshold (R40, A18): CLI > config > default.
  +  if (cli.reviewThreshold) {
  +    merged.reviewThreshold  = cli.reviewThreshold;
  +    sources.reviewThreshold = 'cli';
  +  } else if (cfg.reviewThreshold !== undefined) {
  ```
  Error: `--review-threshold must be one of critical, high, medium, low, got "<v>".`
- names: `cli.reviewThreshold`; A18, R40.
- mirror: the `--rebase` CLI/config merge at `ship.js:306-322`; `SEVERITIES` at `:1330`.
- decisions: Key Decisions "one resolution site per flag".
- sync: `docs/skills/ship-sdlc.md` row; `ship-review-gate-exec.yaml` stays unchanged.

**Test proof:** `ship-threshold: (a) --review-threshold medium resolves with source cli`, `ship-threshold: (b) invalid value is an error`, `ship-threshold: (c) no flag keeps the default high`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-threshold:|review-gate:" -j 2 --no-cache -o /tmp/pf-wRb1-t11.json`

---

### Task 12: received-review.js — `--plan`, `--min-severity`, `allowedFiles`, `--check-scope` (item 6, N1)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 11
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/received-review.js` — parse A4–A6; manifest `allowedFiles`, `flags.minSeverity`; `checkScope()` mode
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — `rr-scope:` cases
- Create: `tests/promptfoo/fixtures-fs/project-received-review-scope/` — `plan.md` (a two-task plan with Files), `review-comment.md` (three findings: HIGH, MEDIUM, LOW) and `setup.sh` (builds a git repo, commits, then changes only allowed paths)
- Create: `tests/promptfoo/fixtures-fs/project-received-review-scope-outside/` — the same `plan.md` and `review-comment.md`, and a `setup.sh` that changes one allowed path and one outside path
- Each `setup.sh` starts with `set -e`, then `if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi`, before any git command (the existing `fixture-guard:` cases check it)

**Commit:** `feat(#9319): received-review-sdlc - fix-scope guard with --check-scope`

**Notes:** The decision is in the script (scripts-over-llm-logic). It uses the same `parseFilesEntries` that ship's stage step uses, so the two scope sets cannot drift. `--check-scope` reads the manifest it was given, never a fresh `gh` call.

**Acceptance criteria:**
- [ ] `--comment-file review-comment.md --plan plan.md --min-severity medium` writes `allowedFiles` (sorted, unique) and `flags.minSeverity: "medium"`; without `--plan`, `allowedFiles: null`.
- [ ] An invalid `--min-severity`, or an unreadable `--plan`, is an error with exit 1 (no manifest change).
- [ ] `--check-scope` exits 0 with `{"ok":true}` when only allowed paths changed and every fixed id ranks at or above `minSeverity`; exits 1 with `outOfScope` or `belowThreshold` filled otherwise; exits 2 on an unreadable manifest.

**Contract:**
- shape (code):
  ```diff
    return { prNumber, owner, repo, projectRoot, auto, commentFile,
  +          planFile, minSeverity, checkScope, manifestPath, fixedIds };
  ```
  `function allowedFilesFromPlan(planFile: string): string[]` (`extractTasks` + `parseFilesEntries(taskSection(body))`, all kinds, `Set` → sorted);
  `function checkScope({ manifestPath, fixedIds, cwd }): { ok: boolean, outOfScope: string[], belowThreshold: string[] }`.

  ```diff
    { version: 1, source: 'comment-file', comment_file, pr: null, …,
  +   allowedFiles: ["docs/a.md", "src/b.js"] | null,
      flags: { auto, alwaysFixSeverities, …,
  +            minSeverity: "medium" | null },
      findings, … }
  ```

  | Condition | Exit | Output |
  |---|---|---|
  | all changed paths in `allowedFiles`, all fixed ids ≥ `minSeverity` | 0 | `{"ok":true,"outOfScope":[],"belowThreshold":[]}` |
  | a changed path outside `allowedFiles` (`.sdlc/` excluded) | 1 | `{"ok":false,"outOfScope":["x.js"],…}` |
  | a fixed id below `minSeverity`, or with null severity | 1 | `{"ok":false,"belowThreshold":["F3"],…}` |
  | manifest unreadable, `--fixed` id unknown | 2 | stderr message |
  `allowedFiles: null` skips the path check; `minSeverity: null` skips the severity check. The severity rank order is CRITICAL > HIGH > MEDIUM > LOW.
  Both manifests, comment-file (`received-review.js:376-389`) and PR (`:498`), carry `allowedFiles` and `flags.minSeverity`.
- names: `planFile`, `minSeverity`, `checkScope`, `manifestPath`, `fixedIds`, `allowedFiles`, `allowedFilesFromPlan`; R28–R30, P19, P20.
- mirror: `stageCommands` at `ship.js:1344-1359` (plan walk); `parseArgs` at `received-review.js:241-261`.
- decisions: Key Decisions "received-review owns the fix scope".
- sync: Task 13 (SKILL.md calls the mode); Task 14 (ship forwards the flags); exports gain `allowedFilesFromPlan`, `checkScope`.

**Test proof:** `rr-scope: (a) --plan writes allowedFiles`, `rr-scope: (b) no --plan gives null allowedFiles`, `rr-scope: (c) invalid --min-severity is an error`, `rr-scope: (d) check-scope passes on allowed paths` (fixture `project-received-review-scope`), `rr-scope: (e) check-scope fails on an outside path` (fixture `project-received-review-scope-outside`), `rr-scope: (f) check-scope fails on a below-threshold fixed id`, `rr-scope: (g) check-scope exit 2 on an unreadable manifest`. The PR-mode manifest (`:498`) is not covered by an exec case: building it needs a `gh` call to a live PR. Fixture state comes from `setup.sh`; no case waits.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "rr-scope:|rr-comment-file|received-review-prepare|rr-output-file|fixture-guard:" -j 2 --no-cache -o /tmp/pf-wRb1-t12.json`

---

### Task 13: received-review SKILL.md — scope and threshold rules, `--check-scope` after Step 11 (item 6, N1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 12
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Step 4 verdict rules (R28, R29); Step 11 end runs `--check-scope` (R30); `argument-hint`
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — update the `rr-skill-text:` argument-hint count case; add `rr-skill-text: (scope)` counts
- Modify: `docs/skills/received-review-sdlc.md` — `--plan`, `--min-severity` rows; a "Fix scope" paragraph

**Commit:** `feat(#9319): received-review-sdlc - apply the fix scope and threshold`

**Notes:** The skill only reads `manifest.allowedFiles` and `flags.minSeverity` and runs the check. A failure returns a `pendingQuestion` through the ship-step agent's existing item (4), so ship stops before commit-fixes (ship R82).

**Acceptance criteria:**
- [ ] Step 4 says: a fix needing a path outside `manifest.allowedFiles` → "needs discussion"; a finding below `flags.minSeverity` or with null severity → "below threshold", never fixed.
- [ ] Step 11 ends with one plain Bash call `node "<PLUGIN_ROOT>/scripts/skill/received-review.js" --check-scope --manifest "<manifest>" --fixed <ids>`, run only when `manifest.allowedFiles` or `flags.minSeverity` is non-null; exit 1/2 → stop with failure and a `pendingQuestion`, skip Steps 11.6–12.
- [ ] `argument-hint` is `"[--pr <number>] [--auto] [--comment-file <path>] [--plan <path>] [--min-severity <level>]"`, and the count case is updated to it.

**Contract:**
- shape (code): SKILL.md text blocks, rendered here:
  ```markdown
  **Fix scope (R28, R29):** When `manifest.allowedFiles` is non-null, a finding whose fix needs a
  path outside it gets the verdict "needs discussion". When `flags.minSeverity` is set, a finding
  whose severity ranks below it, or is null, gets "below threshold" and is never fixed, even under
  `--auto` or the R18 bypass.
  ```
  ```markdown
  **Scope check (R30, G13):** After the last fix, when `manifest.allowedFiles` or `flags.minSeverity`
  is set, run as one plain Bash call:
  node "<PLUGIN_ROOT>/scripts/skill/received-review.js" --check-scope --manifest "<RR_MANIFEST>" --fixed <comma-separated fixed ids>
  Exit 0: continue. Exit 1 or 2: stop. Return failure with `pendingQuestion` = the printed JSON and
  "Revert or keep the listed changes?" (options: keep, revert). Do not revert. Skip Steps 11.6–12 (E9).
  ```
- names: R28–R30, G13, E9; strings counted once: `**Fix scope (R28, R29):**`, `**Scope check (R30, G13):**`.
- mirror: the Step 1a fence form at `SKILL.md:133`; the Step 11 heading at `:367`.
- decisions: Key Decisions "received-review owns the fix scope".
- sync: `rr-skill-text:` cases at `received-review-prepare-exec.yaml:141`, `:196`; `docs/skills/received-review-sdlc.md` flags table `:24-29`.

**Test proof:** the edited `rr-skill-text:` argument-hint case; `rr-skill-text: (scope) fix-scope and scope-check blocks appear once`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "rr-skill-text|rr-scope:" -j 2 --no-cache -o /tmp/pf-wRb1-t13.json`

---

### Task 14: ship — forward `--plan` and `--min-severity` to received-review (item 6, N1)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 13
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — received-review `args`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-rr-scope:` cases; update `ship-rr-input` exact-args assertions; update the exact prompt assertions of `ship-step: (q) review_gate threshold row critical` (yaml:2844) and `ship-step: (cf6)` (yaml:3305) to the new received-review args
- Modify: `docs/skills/ship-sdlc.md` — the received-review step paragraph names the scope guard

**Commit:** `feat(#9319): ship-sdlc - pass the plan and threshold to received-review`

**Notes:** The threshold forwarded is the same `flags.reviewThreshold` that gated the review, so "dispatch received-review" and "fix" use one value.

**Acceptance criteria:**
- [ ] With a plan, the received-review args are `--auto --plan "<planFile>" --min-severity <reviewThreshold>`, then the R77 input.
- [ ] Without a plan file (`execute` not in steps and no `--plan`), `--plan` is omitted and `--min-severity` stays.

**Contract:**
- shape (code):
  ```diff
  -      args: '--auto',
  +      args: ['--auto',
  +             planFile ? `--plan "${planFile}"` : '',
  +             `--min-severity ${flags.reviewThreshold}`].filter(Boolean).join(' '),
  ```
- names: R82.
- mirror: the execute `--plan` arg at `ship.js:452`.
- decisions: one threshold for gate and fix.
- sync: `pickNextStep` appends the R77 input after these args (`ship.js:1946-1952`).

**Test proof:** `ship-rr-scope: (a) received-review args carry --plan and --min-severity`, `ship-rr-scope: (b) no plan omits --plan`; the `ship-rr-input` cases updated to the new prefix.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rr-scope:|ship-rr-input|ship-step: \(q\)|ship-step: \(cf6\)" -j 2 --no-cache -o /tmp/pf-wRb1-t14.json`

---

### Task 15: execute — `--strict-files` makes the expectedFiles check hard (item 7, N1b)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 14
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` — `--strict-files` in `BOOLEAN_FLAGS`; `flags.strictFiles` and its source
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — step 1a hard branch under `flags.strictFiles`; `argument-hint` and the frontmatter description Arguments list gain `[--strict-files]`
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — `execute-prepare: (strict-files)` cases
- Modify: `docs/skills/execute-plan-sdlc.md` — `--strict-files` row

**Commit:** `feat(#9319): execute-plan-sdlc - add --strict-files`

**Notes:** A standalone run keeps the soft warning; only a caller that passes the flag (ship, Task 16) gets the hard stop. No retry: a re-dispatch of the same tasks would touch the same files again.

**Acceptance criteria:**
- [ ] `--strict-files` gives `"strictFiles": true` with source `cli`; without it `false`/`default`.
- [ ] SKILL.md step 1a: under `flags.strictFiles`, a non-empty `diffFiles \ expectedSet` marks no task done, prints the E16 line and returns failure, with no Step 6 RECOVER; otherwise the soft warning stays as today.

**Contract:**
- shape (code):
  ```diff
  - const BOOLEAN_FLAGS = ['--resume', '--auto', '--commit-waves', '--skip-config-check', '--output-file'];
  + const BOOLEAN_FLAGS = ['--resume', '--auto', '--commit-waves', '--skip-config-check', '--output-file', '--strict-files'];
  ```
  ```diff
  - … **SOFT WARNING** — surface a single line `Wave N touched files outside expectedFiles: <…>` and CONTINUE to step 2. Do not block.
  + … When `flags.strictFiles` is true (R44, E16): mark no task of the wave done, print the same line, and stop with failure — no Step 6 RECOVER. Otherwise: **SOFT WARNING** — … CONTINUE to step 2. Do not block.
  ```
- names: `strictFiles`, `--strict-files`; A10, R44, P10, E16.
- mirror: `--commit-waves` in `execute.js:82` and its manifest field.
- decisions: Deviations "N1b ship flag".
- sync: `docs/skills/execute-plan-sdlc.md`; ship Task 16 forwards the flag.

**Test proof:** `execute-prepare: (strict-files) flag resolves true with source cli`, `execute-prepare: (strict-files) default is false`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "execute-prepare: " -j 2 --no-cache -o /tmp/pf-wRb1-t15.json`

---

### Task 16: ship — forward `--strict-files`; stage steps refuse paths outside Files (item 7, N1b)

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 15
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — execute args gain `--strict-files`; `stageScope(planFile, cwd)`; `stage_changes`/`stage_fixes` return `{ pending }` on a refusal
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenario `stage-outside-files`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-strict:` cases; update the exact execute-args assertions of `ship-prepare: execute step args carry only --plan, --auto and --quality (W5.2)` (yaml:818)
- Modify: `docs/cost-tiers.md` — update the "Arguments ship adds" rows (commit/commit-fixes `--auto --no-stash`, received-review `--auto [--plan "<p>"] --min-severity <t>` then the input, version `--bump <type> --auto [--no-tag] [--no-push] [--subject "<text>"]`, execute `--strict-files`)
- Modify: `site/src/content-source/cost-tiers.md` — copied by `cp docs/cost-tiers.md site/src/content-source/cost-tiers.md`

**Commit:** `feat(#9319): ship-sdlc - plan-scope guard for execute and staging`

**Notes:** This covers SAFE-9 (stop-1, stop-8). The refusal reuses Task 8's pending-question return, so no new stop path is added. The allowlist is the R8 `.sdlc/` rule only (Deviations). The plan file must be committed before ship runs; an uncommitted plan file is reported by `stageOutsideFiles` like any other path (the allowlist is not widened).

**Acceptance criteria:**
- [ ] The execute args are `--plan "<p>" [--auto] --strict-files [--quality …] [--tasks …] [--from-wave …]`.
- [ ] A changed path outside every plan Files path makes `stage_changes` (and `stage_fixes`) return a `pending-question` envelope `id: 'stageOutsideFiles'` listing the paths; no `git add` command is emitted.
- [ ] Paths under `.sdlc/` never count as outside; a tree with only plan paths changed emits the same commands as today.

**Contract:**
- shape (code): `function stageScope(planFile: string, cwd: string): { outside: string[] }` — changed paths from `git status --porcelain -z --untracked-files=all` (rename targets included), minus `.sdlc/`, minus the plan's Files paths (`parseFilesEntries`, all kinds).

  | Condition | Result |
  |---|---|
  | `outside` empty | `data.commands = stageCommands(…)` (unchanged) |
  | `outside` non-empty | `{ pending: { prompt: 'These files are outside the plan Files: … Keep them out (revert) or add them to the plan?', options: ['revert', 'amend-plan'], id: 'stageOutsideFiles', paths } }` (no `question` key) |
  | plan unreadable | `outside` empty, the R8 behaviour (no new failure) |
- names: `stageScope`, `stageOutsideFiles`; R83, G9.
- mirror: `stageCommands` at `ship.js:1344-1359`; the Task 8 `{ pending }` return.
- decisions: Deviations "N1b allowlist".
- sync: Task 10's `stage_fixes` case; execute A10.

**Test proof:** `ship-strict: (a) execute args carry --strict-files`, `ship-strict: (b) outside path stops stage_changes with stageOutsideFiles`, `ship-strict: (c) .sdlc paths are never outside`, `ship-strict: (d) outside path stops stage_fixes`, `ship-strict: (e) an uncommitted plan file is listed as outside`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-strict:|ship-stage|ship-step:|R76|W5\.2" -j 2 --no-cache -o /tmp/pf-wRb1-t16.json`

---

### Task 17: ship — `--review-rounds`, a real loop (item 8, #9308)

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 16
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — parse/merge `--review-rounds`; the round reset in `runAfter` after commit-fixes
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenarios `rounds-2-fixes`, `rounds-2-no-fixes`, `rounds-1-default`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-rounds:` cases
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — `argument-hint`, Arguments list, the step table note "repeats per round"
- Modify: `docs/skills/ship-sdlc.md` — `--review-rounds` row and a "Review rounds" paragraph

**Commit:** `feat(#9319): ship-sdlc - add --review-rounds`

**Notes:** Was S, now M: a real loop, not a second fixed step. Resetting the same three ledger entries keeps R-b1 (proceed gate), `pipelineAdvancing` and the task tray working without new step names.

**Acceptance criteria:**
- [ ] `--review-rounds 2` gives `flags.reviewRounds: 2` (source `cli`); default 1; values outside 1–3 or non-integer are errors.
- [ ] Round 1 with commit-fixes `completed` and `reviewRounds: 2`: `--after dispatch_commit_fixes` appends one entry to `ledger.rounds[]`, sets `ledger.round: 2`, resets review, received-review and commit-fixes to `pending`, and the next step is `dispatch_review`.
- [ ] Round 2 ends the loop: the next step after commit-fixes is the step after it in `STEP_ORDER`; with commit-fixes skipped in round 1, round 2 does not run.
- [ ] `reviewRounds: 1` behaves as today (byte-identical step sequence in `rounds-1-default`).
- [ ] In round 2, `stage_fixes` and `review_gate` (not ledger steps) re-emit because their history check is scoped to the latest `dispatch_review`; `confirm_commit_fixes` re-emits by its own condition (received-review `completed` again and a dirty tree).

**Contract:**
- shape (code):

  | From (round k) | Event | To |
  |---|---|---|
  | commit-fixes `completed`, k < n | `--after dispatch_commit_fixes` | `rounds[]` += record; `round` = k+1; review, received-review, commit-fixes → `pending`; next `dispatch_review` |
  | commit-fixes `completed`, k = n | same | loop ends; next step after commit-fixes |
  | commit-fixes `skipped` | any | loop ends |

  ```diff
    { …,
  +   "round": 2,
  +   "rounds": [ { "round": 1, "review": { "status": "completed", … },
  +                 "receivedReview": { … }, "commitFixes": { "commitSha": "…", … } } ],
      … }
  ```
  A missing `ledger.round` is read as 1.

  After the round reset, `runAfter` sets `from = 'dispatch_commit'`, so the next `pickNextStep` starts at `dispatch_review`.

  `stage_fixes` and `review_gate` count only history rows after the latest `dispatch_review`: for these two ids `pickNextStep` uses `historyAfter(ledger, id, 'dispatch_review')` instead of `historySuccess`.
- names: `reviewRounds`, `ledger.round`, `ledger.rounds`; A19, R84.
- mirror: `reconcileSteps` reset style at `ship.js:1410-1427`; `--from-wave` integer check at `:163-164`.
- decisions: Key Decisions "review rounds reuse the existing steps".
- sync: `reviewGateDecision` reads the review step's fresh `startedAt` (`ship.js:1675-1684`), so round 2 needs a new summary.

**Test proof:** `ship-rounds: (a) --review-rounds 2 resolves with source cli`, `ship-rounds: (b) invalid value is an error`, `ship-rounds: (c) round 1 fixes reset the round steps and emit dispatch_review`, `ship-rounds: (d) round 2 ends the loop`, `ship-rounds: (e) skipped commit-fixes ends the loop early`, `ship-rounds: (f) default one round is unchanged`, `ship-rounds: (g) round 2 with fixes emits stage_fixes again` (asserts `stage_fixes` is emitted with `data.commands`), `ship-rounds: (h) round 2 emits review_gate again`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rounds:|ship-step:|review-gate:" -j 2 --no-cache -o /tmp/pf-wRb1-t17.json`

---

## Final Shape

After part 1, ship carries the release and review half of a wave unattended. Part 2 adds the no-question, resume and commit-trailer half.

- **Contracts.** All six specs carry the new contracts for both parts, including the pr evidence section that the later ship-evidence wave (R-b2) implements.

- **Release.** With `--no-tag --no-push --release-subject "<subject>"`, the version step makes the release commit with that subject and no tag. Ship checks that commit, not a tag. A re-run after a dispatched but unrecorded version step stops and asks instead of bumping again.

- **Review.** `--review-threshold` sets the fix bar from the command line. `--review-rounds 2` runs review, received-review and commit-fixes twice, and keeps each round's results in the ledger. Received-review gets the plan and the threshold. It fixes nothing outside the plan's Files and nothing below the threshold. After its fixes, `--check-scope` proves this, or the run stops with a pending question before commit-fixes.

- **Staging and scope.** Execute runs with `--strict-files`. Both stage steps (after execute, and new: before commit-fixes) refuse files outside the plan. Commit steps get `--no-stash`, so nothing goes onto the shared stash stack.

## Verification Scorecard

The plan-sdlc review (Step 5, three iterations) ran on the single plan before the split; the scorecard covers both parts.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Spec-first commits (ship, received-review, commit, version, pr, execute) | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6 | covered |
| 2 W8.40 forwarding + R-b3 exception + #9318 guard | Task 7, Task 8 | covered |
| 3 #9310 --no-stash | Task 9 | covered |
| 4 #9307 stage step before commit-fixes | Task 10 | covered |
| 5 #9309 --review-threshold | Task 11 | covered |
| 6 N1 fix-scope guard | Task 12, Task 13, Task 14 | covered |
| 7 N1b strict files / stage scope | Task 15, Task 16 | covered |
| 8 #9308 --review-rounds loop | Task 17 | covered |
| 9–16 | part 2 Tasks 1–14 | covered in part 2 |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
