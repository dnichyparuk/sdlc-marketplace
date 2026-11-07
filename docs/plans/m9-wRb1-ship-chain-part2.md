# M9 wave R-b1 — the ship chain, part 2 of 2 (Tasks 1–14) Implementation Plan

**Commit:** `feat(#9319): ship-sdlc - ship chain part 2 (M9 wave R-b1)`
**Goal:** Part 2 of the ship chain (items 9–16 of the 16 wave items, in their order):
- items 9–11: no question under `--auto` (N3), resume robustness (N4/#9228), and the comment-copy preference with the comment-file fixes (#9302);
- items 12–14: exactly one configured trailer (G10+, #9303 and #9304), the config value, and the commit drafter fallback (#9272);
- item 15: the `PARSE_EXIT` split (#9241); item 16: the read-only re-verification of #9138 and #9139.
**Architecture:** Part 2 builds on part 1 (`docs/plans/m9-wRb1-ship-chain-part1.md`), which must be merged first: it holds all six spec commits and the ship helpers this part reuses (`rerunGuard`, the `{ pending, commands }` return of `pickNextStep`, `pendingStop(question, viaExecute, extraCommands)`). The root problem stays the same: several ship paths ask a question or redo work under `--auto`, and the trailer check runs only for given messages. Every decision lives in a script (`skill/ship.js`, `skill/commit.js`, `scripts/lib/commit-message.js`, `check-consistency.js`), and each SKILL.md only reads the resolved fields.
**Source:** the wave brief for M9 wave R-b1 (16 items, rulings Q1–Q8) and the planner resume 1 ruling (fixes, then split); split from `docs/plans/m9-wRb1-ship-chain.md`, task numbers kept; every needed fact is embedded in the tasks
**Verification:** node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . && node .claude/skills/validate-plugin-consistency/check-consistency.js && node .claude/skills/validate-skill-docs/check-docs-consistency.js && cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache -o /tmp/pf-wRb1-exec.json && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 2 --no-cache -o /tmp/pf-wRb1-hooks.json (exec-only configs, no LLM provider)

---

## Context

**What problem does this change solve?**

- Ship (`/sdlc:ship-sdlc`) is the pipeline that runs execute, commit, review, received-review, commit-fixes, version and pr in one go.
- Part 1 moved the release commit, the review threshold, the review rounds and the fix-scope checks into ship.
- Some ship paths still ask a question under `--auto`, or redo work after a resume. In a headless run (no human at the keyboard) both stop or damage the run.
- The trailer check (a trailer is a `Key: Value` line at the end of a commit message) runs only for a given message file, splits on `\n` only, and does not stop a second attribution line.

**What prompted this change now?**

- The owner's GO for M9 wave R-b1, the ship chain: items 1–16, in this order.
- The pre-flight rulings Q1–Q8 fix the scope: #9228/#9303/#9272/#9241 are in, #9138/#9139 are read-only, the #9304 worker extras are out.
- The plan passed the split escape, so it is split in item order: this part holds items 9–16.

**What does success look like?**

- Under `--auto`, no skill on the ship path asks a question; each such place stops with a pending question.
- A resumed run writes this run's merged flags into the ledger and never re-runs a finished execute.
- Every in-ship commit carries exactly the configured `Co-Authored-By` line.
- The consistency checks exit 0 and both exec configs are green.

## Research Findings

All facts were read at base `d37c57f` (plugin 0.45.0) in this checkout. Paths are under `plugins/sdlc-utilities/` unless they start with `docs/`, `tests/` or `.sdlc/`. Part 1 changes ship.js, received-review.js, execute.js and their datasets, so the line numbers below may shift: re-verify every quoted line at the new base (Task 1 note).

- **Resume.** `FROZEN_FLAG_KEYS = ['planFile', 'openspecContext', 'sources']` (`ship.js:1327`). `ensureLedger` (`:1435-1469`) adopts the ledger on resume and refreshes only `tasks`/`fromWave`; `runAfter` reads every flag from `ledger.flags` (`:2048`). So CLI flags given on `--resume` never reach the steps (#9228), against spec R11 (`docs/specs/ship-sdlc.md:129`). `dispatch_execute` adds `--resume` only when an execute state file exists (`:1953-1970`); after a finished execute whose `--after` never ran, the state file is gone, so execute runs the plan again (stop-2).
- **Pending questions.** A dispatch failure with a valid `pendingQuestion` is not recorded as a failure (`ship.js:2180-2184`); `pendingStop` (`:2240-2250`) pauses the ledger and ends with `reason: 'pending-question'` and the resume commands.
- **received-review.** Steps 7/8/10 draft thread replies even in comment-file mode (`skills/received-review-sdlc/SKILL.md:282`, `:301`, `:342-344`); Step 11.6 writes `PR: <pr.number>` with no null rule (`:450-455`) and its dedup reads only `surface=`/`targetFile=` (`:418`). review-sdlc posts one top-level PR comment (`skills/review-sdlc/SKILL.md:197`), so the `--pr` input finds no review threads. At dispatch, `receivedReviewInput` (`ship.js:1687-1694`) returns `--pr <N>` for an OPEN PR first, else `--comment-file "<copy>"`.
- **AskUserQuestion sites without an `--auto` branch** (grep over `skills/**/*.md`): `ship-sdlc/SKILL.md:123` (missing-state prompt), `execute-plan-sdlc/SKILL.md:193` (rebase `prompt`), `execute-plan-sdlc/SKILL.md:432` (`MaxSplitDepthExceededError` escalation), `version-sdlc/SKILL.md:60` (uncommitted changes), `version-sdlc/init-workflow.md:31` (init confirm). Plain "ask the user" sites: `received-review-sdlc/SKILL.md:188` (unclear items), `:210` (cannot verify). The hook `hooks/block-askuserquestion-auto.js` only denies the call inside a ship pipeline (`:100-111`). `.claude/skills/validate-plugin-consistency/check-consistency.js` has Rules 1–13 (`checkNoExitTrap` `:649-669` is the pattern); none covers AskUserQuestion. Its fixtures live in `tests/promptfoo/fixtures-fs/<rule>-cases/{bad,good}-project`, its cases in `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml`.
- **Trailers.** The G10 gate is inline in `skills/commit-sdlc/SKILL.md:205-224`; it splits on `"\n"` (`:208`, `:219`), so a CRLF message fails a valued trailer, and it runs only under `--message-file` (`:215`). It checks presence, not "exactly one". `scripts/lib/commit-message.js` exports `TRAILER_RE`, `MAX_SUBJECT_CHARS`, `resolveTrailers`, `checkGivenSubjects`, `missingTrailers` (`:68`); `missingTrailers` is CRLF-safe (`:62`) and only `skill/version.js` uses it. `ship-step-commit.md:4` and `commit-orchestrator.md:5` are `model: haiku`; no agent or skill file names `Co-Authored-By`. `.sdlc/config.json` `commit` (`:149-160`) has no `requiredTrailers`. Recent branch commits carry `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (70 of the last 78 trailer lines; 7 use the lower-case `Co-authored-by:` form, 1 names Opus).
- **Nested drafter (#9272).** `skills/commit-sdlc/SKILL.md:132-149` dispatches `sdlc:commit-orchestrator` from inside the ship-step agent; `:149` stops when `MESSAGE` is empty, with no fallback when the dispatch returns nothing.
- **PARSE_EXIT (#9241).** `skills/execute-plan-sdlc/SKILL.md:407-417` is one fenced Bash call: the node parse, then `echo "PARSE_EXIT=$?"` (`:415`) and `rm -f "<SUMMARY_FILE>"` (`:416`). Spec E15 is at `docs/specs/execute-plan-sdlc.md:258`.
- **Version SKILL.md (#9312 parts).** The SKILL.md Quality Gates table (`skills/version-sdlc/SKILL.md:384-394`) has G1–G7 only; the Gotchas `:440-441` lack the `--no-tag` caveat.
- **Tests.** `tests/promptfoo/datasets/ship-prepare-exec.yaml` (266 cases at base; `ship-prepare:` cases call ship.js, `ship-step:` cases run `tests/promptfoo/scripts/run-ship-stepper.js` with scenarios and seed patches, `:232-273`); `received-review-prepare-exec.yaml` (15 cases at base; `rr-skill-text:` cases count SKILL.md strings, `:141`, `:196`); `commit-prepare-exec.yaml` (48 cases, prefixes `commit-prepare`, `commit-subject`, `commit-trailers`); `execute-prepare-exec.yaml` (65 cases at base, all `execute-prepare: `). Git-init fixtures use a guarded `setup.sh` (`tests/promptfoo/fixtures-fs/worktree-linked-ahead/setup.sh`; the `fixture-guard:` cases check the guard).
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
| #9312 SKILL.md parts | no | the spec parts go into the version spec commit (part 1 Task 4); the SKILL.md parts (Quality Gates G8/G9 rows, the Gotchas caveat) go into the N3 task that already edits `version-sdlc/SKILL.md` (Task 2); the `version.js:24` header comment stays | Q6: "A fold goes only into files its host item already edits"; item 1 edits specs only; version.js is not touched |
| #9316 | no | no behaviour change; commit spec A8 gets one sentence (relative to the cwd; see version-sdlc A11) | Q6 says "documented in the commit spec A11", but the commit spec has no A11 (A1–A9); version spec A11 already documents it; listed in QUESTIONS |
| pr (evidence) | no | part 1 Task 5 adds the pr evidence contract (A6 `--evidence-file`, R17, G13, P19, E8, I9) to the spec only; no pr SKILL.md or script change in this wave | R-b1 item 1 names "pr (evidence)"; the implementation is R-b2's PR evidence template; listed in QUESTIONS (a spec ahead of its code until R-b2) |
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
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `## Flags` table: the `--resume` row states that
  every non-frozen flag is merged again and written back, and that `--auto` is repeated; audience:
  end users and pipeline authors.
- names: the `--resume` row.
- mirror: the `--resume` row at `docs/skills/ship-sdlc.md:48`.
- decisions: user-facing wording; name the repeated `--auto` command.
- sync: ship spec R11 and Task 4.
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
| spec-first | error | PASS | part 1 Tasks 1-6 update specs before any SKILL.md or script task (part 1 Tasks 7-17 and Tasks 1-12) |
| project-agnostic | error | PASS | Behaviour ships in plugin code; repo-local edits (Tasks 3, 10) are dogfooding only |
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

### UPDATE: runtime-contract (B1, B3)

**Why:** Task 4 adds the R11 refresh: on `--resume` the merged CLI > config > default flags are written back into the ledger in `plugins/sdlc-utilities/scripts/skill/ship.js`. Task 8 adds the public `commit.js --check-message` mode.

**Severity hint:** critical

**Patch:** Check that the merged-flag refresh on --resume keeps the ledger and resume contract, and that --check-message resolves its manifest once and exits 0, 4 or 2 as specified.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the merged-flag refresh on --resume keeps the ledger and resume contract, and that --check-message resolves its manifest once and exits 0, 4 or 2 as specified.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: hook-readiness (B1)

**Why:** Task 1 adds a line starting `**Under \`--auto\`:**` to `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` and `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`. Task 2 does the same for version-sdlc and received-review, so the headless pending-question contract changes.

**Severity hint:** high

**Patch:** Check that every AskUserQuestion site on the ship path stops with a failure and a pendingQuestion under --auto, consistent with the block-askuserquestion-auto hook.

**Action (dimension):** edit `.sdlc/review-dimensions/hook-readiness.md` — Check that every AskUserQuestion site on the ship path stops with a failure and a pendingQuestion under --auto, consistent with the block-askuserquestion-auto hook.

## Tasks

### Task 1: N3 — `--auto` branches in ship and execute-plan (item 9)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none (part 1 merged first)
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the missing-state prompt (`:123`) gains an `--auto` branch
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — the rebase `prompt` choice (`:193`) and the `MaxSplitDepthExceededError` escalation (`:432`) gain `--auto` branches

**Commit:** `fix(#9319): ship-sdlc - no question under --auto in ship and execute`

**Notes:** Re-verify every quoted line at the new base before editing: part 1 is merged first and moves lines in ship.js, the ship and execute SKILL.md files and the datasets. The hook only denies the call, and then the model improvises. An explicit branch makes the stop deterministic. The pending-question text is the question the interactive path would ask.

**Acceptance criteria:**
- [ ] Each of the three sites has, in its own section, a line starting `**Under \`--auto\`:**` that gates on the resolved field `flags.auto === true` (ship: the prepare output's `flags.auto`; execute: the execute manifest's `flags.auto`) and says: do not call AskUserQuestion; stop with failure and a `pendingQuestion` holding the question and its options.
- [ ] No other text in the two files changes.

**Contract:**
- shape (code): one insertion per site, rendered with its surrounding lines.

  `ship-sdlc/SKILL.md`, the missing-state prompt:
  ```diff
   **Missing-state prompt (R-implicit-resume):** If the prepare output's `errors` array contains an entry with `id === "implicitResumeNoState"`, use AskUserQuestion:
  +
  +**Under `--auto`:** when the prepare output's `flags.auto === true`, do not call AskUserQuestion. Stop and return failure with `pendingQuestion`: "Active pipeline reminder found but no state file for current branch. Start fresh, or specify a state path?" (options: fresh, path, abort) (ship R85).
  ```
  `execute-plan-sdlc/SKILL.md`, Step 1 rebase:
  ```diff
   If `flags.rebase` is `prompt`: Use AskUserQuestion — rebase onto default branch or skip.
  +
  +**Under `--auto`:** when `flags.auto === true` and `flags.rebase` is `prompt`, do not call AskUserQuestion. Stop and return failure with `pendingQuestion`: "Rebase onto the default branch or skip?" (options: rebase, skip) (execute C17).
  ```
  `execute-plan-sdlc/SKILL.md`, the split-depth escalation (the end of the long recovery line):
  ```diff
  -… `MaxSplitDepthExceededError` (exit 2) means the task set cannot be further split — escalate to user with `AskUserQuestion` listing the unresolved task IDs.
  +… `MaxSplitDepthExceededError` (exit 2) means the task set cannot be further split — escalate to user with `AskUserQuestion` listing the unresolved task IDs. **Under `--auto`:** when `flags.auto === true`, do not call AskUserQuestion; stop and return failure with `pendingQuestion`: "Tasks <ids> cannot be split further. Re-plan them or stop?" (options: re-plan, stop) (execute C17).
  ```
- names: ship R85; execute C17.
- mirror: the guarded quality-tier text at `execute-plan-sdlc/SKILL.md:259`.
- decisions: Key Decisions "pending question".
- sync: Task 3's rule must pass on both files.

**Test proof:** covered by Task 3's rule run over the repository (`check-consistency.js` exits 0).

**Verification:** `grep -c 'Under `--auto`:\*\* when' plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `1` for ship and `2` for execute.

---

### Task 2: N3 — `--auto` branches in version-sdlc and received-review (item 9)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/version-sdlc/SKILL.md` — uncommitted-changes prompt (`:60`) `--auto` branch; Quality Gates G8/G9 rows; Gotchas `--no-tag` caveat (#9312 SKILL.md parts)
- Modify: `plugins/sdlc-utilities/skills/version-sdlc/init-workflow.md` — init confirm (`:31`) `--auto` branch
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Steps 2 (`:188`) and 3 (`:210`) `--auto` → "needs discussion"
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — `rr-skill-text: (auto)` count case

**Commit:** `fix(#9319): version-sdlc - no question under --auto in version and received-review`

**Notes:** Split from Task 1 to keep each task at five files or fewer. The one deliverable is "the remaining N3 sites of item 9 get an auto branch"; the two skills share it. The version SKILL.md parts of #9312 ride here only because this task already edits that file (Q6: a fold goes only into a file its host already edits).

**Acceptance criteria:**
- [ ] version SKILL.md and init-workflow.md each carry an `**Under \`--auto\`:**` line gated on `VERSION_CONTEXT_JSON.flags.auto === true` at the named site (version C12).
- [ ] The version Quality Gates table has G8 and G9 rows; the Gotchas `git push --tags` lines say "skipped under `--no-tag` (R21)".
- [ ] received-review Steps 2 and 3 say: when `manifest.flags.auto === true`, an unclear or unverifiable item gets "needs discussion" and no question is asked (C19).

**Contract:**
- shape (code): one insertion per site, rendered with its surrounding lines.

  `version-sdlc/SKILL.md`, Step 1 warnings:
  ```diff
   **If `VERSION_CONTEXT_JSON.warnings` is non-empty**, show the warnings to the user before continuing.
   For the warning `"You have uncommitted changes"`, use AskUserQuestion to ask:
  +
  +**Under `--auto`:** when `VERSION_CONTEXT_JSON.flags.auto === true`, do not call AskUserQuestion. Stop and return failure with `pendingQuestion`: "You have uncommitted changes that will NOT be included in this release." (options: proceed, commit first, cancel) (version C12).
  ```
  `version-sdlc/init-workflow.md`, Step 3:
  ```diff
   ### Step 3 (CONFIRM): Ask User to Confirm
   
  +**Under `--auto`:** when `VERSION_CONTEXT_JSON.flags.auto === true`, do not call AskUserQuestion. Stop and return failure with `pendingQuestion`: "Does this look right?" (options: yes, tag-only, changelog, cancel) (version C12).
  +
   Use AskUserQuestion to present the detected setup and ask:
  ```
  `received-review-sdlc/SKILL.md`, Step 2 and Step 3:
  ```diff
   If any item is unclear, ask about all unclear items in one message before implementing anything: items may be related, and partial understanding produces the wrong change.
  +
  +**Under `--auto`:** when `manifest.flags.auto === true`, ask nothing; give each unclear item the verdict "needs discussion" (C19).
  …
   For "cannot verify" items: state the limitation explicitly, ask the user for direction.
  +**Under `--auto`:** when `manifest.flags.auto === true`, ask nothing; give the item the verdict "needs discussion" (C19).
  ```
  Quality Gates rows appended after the G7 row:
  ```markdown
  | Retag exclusivity | `--retag` with a bump, `--init`, `--changelog`, `--hotfix` or `--no-tag` | `errors[]` names every conflict (G8) |
  | Message-file trailers | `--message-file` carries every `releaseCommit.trailers` entry | else `skill/version.js` exits 1 before any git command (G9) |
  ```
- names: version C12, G8, G9, R21; received-review C19.
- mirror: the G7 row at `version-sdlc/SKILL.md:394`; Gotchas `:440-441`.
- decisions: Deviations "N3 plain ask sites", "#9312 SKILL.md parts".
- sync: `rr-skill-text:` counts.

**Test proof:** `rr-skill-text: (auto) the needs-discussion auto line appears twice`; Task 3's rule run.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "rr-skill-text|version-prepare" -j 2 --no-cache -o /tmp/pf-wRb1-t19.json`

---

### Task 3: N3 — consistency Rule 14 `ask-auto-branch` (item 9)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — Rule 14 docblock, `checkAskAutoBranch`, call in `main()`
- Create: `tests/promptfoo/fixtures-fs/ask-auto-branch-cases/bad-project/plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — a section with AskUserQuestion and no auto mention
- Create: `tests/promptfoo/fixtures-fs/ask-auto-branch-cases/good-project/plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — a guarded site and a prohibition line
- Modify: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — `ask-auto-branch:` cases

**Commit:** `test(#9319): consistency - require an --auto branch at ship-path AskUserQuestion sites`

**Notes:** The rule makes C20 permanent for the ship path: a new unguarded site fails the validator, not a headless run. It scans only the seven skills ship dispatches. The other skills (setup, jira, harden, plan, error-report) are interactive by design, and their ~100 sites are out of this wave. Section scope (heading to heading) matches how the skills write their auto branches, so no marker comments are needed.

**Acceptance criteria:**
- [ ] For every `.md` file under `plugins/sdlc-utilities/skills/<d>/` with `<d>` in `SHIP_PATH_SKILLS` = `ship-sdlc`, `execute-plan-sdlc`, `commit-sdlc`, `review-sdlc`, `received-review-sdlc`, `version-sdlc`, `pr-sdlc`: each line outside a fence that contains `AskUserQuestion` and is not a prohibition (`/\b(do not|never|not)\b[^.]*AskUserQuestion/i`) has `--auto`, `flags.auto` or `isAuto` in its enclosing section (the previous `#` heading outside a fence up to the next). Otherwise the rule pushes an `error` finding `ask-auto-branch` with file and line.
- [ ] The bad fixture yields the finding; the good fixture does not; the real repository yields none after Tasks 1–2. A simulation of this rule at base found exactly 3 unguarded sites, `ship-sdlc/SKILL.md:123`, `version-sdlc/SKILL.md:60` and `version-sdlc/init-workflow.md:31`, all fixed by Tasks 1–2. commit-sdlc and pr-sdlc already pass.

**Contract:**
- shape (code): `const SHIP_PATH_SKILLS = ['ship-sdlc', 'execute-plan-sdlc', 'commit-sdlc', 'review-sdlc', 'received-review-sdlc', 'version-sdlc', 'pr-sdlc'];` `function checkAskAutoBranch(projectRoot: string, findings: object[]): void`; finding `{ rule: 'ask-auto-branch', severity: 'error', file, line, message: 'AskUserQuestion without an --auto branch in the same section (ship C20).' }`.
- names: Rule 14 `ask-auto-branch`, `checkAskAutoBranch`, `SHIP_PATH_SKILLS`; ship C20, R85.
- mirror: `checkNoExitTrap` at `check-consistency.js:649-669`; the call list at `:799-812`.
- decisions: section scope over a fixed line window (the guarded quality-tier site is 28 lines from its auto line). The rule accepts `flags.auto`, `isAuto` or `--auto` in the section: the guarded sites at base (for example `execute-plan-sdlc/SKILL.md:98` "Mismatch, `--auto` set") use the `--auto` wording, and the rule checks presence, not phrasing. Every line added in this wave cites the resolved field (`flags.auto === true`, flag-coherence-cross-skill).
- sync: the header list at `check-consistency.js:7-52`.

**Test proof:** `ask-auto-branch: flags an unguarded AskUserQuestion section`, `ask-auto-branch: passes a guarded site and a prohibition line`.

**Verification:** `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ask-auto-branch:|script-resolution:|orchestrator-await-barrier:" -j 2 --no-cache -o /tmp/pf-wRb1-t20.json`

---

### Task 4: ship — refresh the ledger flags on resume (item 10, #9228)

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `ensureLedger` rewrites the non-frozen flags and their sources of an adopted ledger from this run's merged values
- Create: `tests/promptfoo/fixtures-fs/project-ship-resume-flags/setup.sh` — starts with `set -e`, then `if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi` before any git command; builds a git repo with a ledger whose flags hold `auto: true`, `bump: "patch"`, `quality: "full"`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-resume-flags:` cases
- Modify: `docs/skills/ship-sdlc.md` — the `--resume` row (`:48`) states the refresh and the repeated `--auto`

**Commit:** `fix(#9319): ship-sdlc - rewrite the ledger flags from merged values on --resume`

**Notes:** Non-frozen flags keep CLI > config > default and are never taken from the ledger; the refresh only writes the merged values back, because the step emitter reads `ledger.flags`. An `execute_tier` answer stored in `flags.quality` is not kept across a resume. An interactive resume asks `execute_tier` again unless `--quality` is given.

**Acceptance criteria:**
- [ ] `--resume --bump minor --review-threshold medium` on the fixture ledger (`auto: true`, `quality: "full"`) writes `bump: "minor"`, `reviewThreshold: "medium"`, `auto: false` and `quality` = the merged value, with the sources rewritten (`cli`, `cli`, `default`, …).
- [ ] A bare `--resume`, run twice, gives byte-identical `ledger.flags` (idempotent).
- [ ] `planFile`, `openspecContext`, `steps`, `tasks` and `fromWave` follow their own rules and never change through this block.

**Contract:**
- shape (code):
  ```js
  // R11 (#9228): on an adopted ledger the non-frozen flags and their sources are rewritten
  // from this run's merged CLI > config > default values; none is taken from the ledger.
  if (adopted) {
    const OWN_RULE = ['steps', 'tasks', 'fromWave'];
    for (const [key, val] of Object.entries(flags)) {
      if (FROZEN_FLAG_KEYS.includes(key) || OWN_RULE.includes(key)) continue;
      ledger.flags[key] = val;
    }
    if (ttlDays != null) ledger.flags.ttlDays = ttlDays; else delete ledger.flags.ttlDays;
    ledger.flags.sources = { ...ledger.flags.sources,
      ...Object.fromEntries(Object.entries(flagSources).filter(([k]) => !OWN_RULE.includes(k))) };
  }
  ```
  The block goes after the `FROZEN_FLAG_KEYS` loop in `ensureLedger` (`adopted` = the `resume && resume.found && flags.resume` branch). There is no delete loop over the ledger keys.

  `docs/skills/ship-sdlc.md`, the `--resume` row:
  ```diff
  -| `--resume` | Resume the branch's ship run from its state file (the ledger). The plan and the step list are restored from it unless `--plan`, `--steps` or `--quick` is given; every other flag comes from the CLI, then config, then the default. Completed steps are skipped; … | Off |
  +| `--resume` | Resume the branch's ship run from its state file (the ledger). The plan and the step list are restored from it unless `--plan`, `--steps` or `--quick` is given. Every other flag comes from the CLI, then config, then the default, and is written back into the ledger. A run that used `--auto` must repeat it: `/sdlc:ship-sdlc --resume --auto`. Completed steps are skipped; … | Off |
  ```
- names: R11 (amended); `ship-resume-flags:`.
- mirror: the R76 refresh loop at `ship.js:1458-1462`.
- decisions: Deviations "Ledger flag refresh".
- sync: `docs/skills/ship-sdlc.md:48`; spec R11.

**Test proof:** `ship-resume-flags: (a) --resume rewrites the ledger flags from the merged values`, `ship-resume-flags: (b) bare --resume twice gives byte-identical ledger flags`, `ship-resume-flags: (c) frozen and own-rule keys never change`; the existing `fixture-guard:` cases cover the new `setup.sh`; the existing `ship-resume-plan` cases stay green.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-resume-flags:|ship-resume-plan|R-implicit-resume|fixture-guard:" -j 2 --no-cache -o /tmp/pf-wRb1-t21.json`

---

### Task 5: ship — no redo after a finished but unrecorded execute (item 10, stop-2)

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `rerunGuard` gains the execute condition; `dispatch_execute` records `dispatchHead`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — scenarios `rerun-execute-finished`, `rerun-execute-clean`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-rerun: (execute)` cases

**Commit:** `fix(#9319): ship-sdlc - do not re-run a finished execute on resume`

**Notes:** Reuses part 1 Task 8's helper and stop path. An execute state file means execute is mid-run (resume it with `--resume`, as today). No state file plus changes means it finished, so ship asks instead of starting over.

**Reused shape (from part 1 Task 8):** `rerunGuard(entry, cwd) → null | { prompt, options: ['record', 'rerun'], id: 'rerunGuard', step, dispatchHead, head }`; `pickNextStep` returns `{ pending: <that object>, commands: <extraCommands> }` and the caller ends with `pendingStop(question, viaExecute, extraCommands)` (`reason: 'pending-question'`, ledger `paused`, `ext.commands = [...viaExecuteLine, ...extraCommands, '/sdlc:ship-sdlc --resume']`). The extra commands for execute: `node "<PLUGIN_ROOT>/scripts/state/ship.js" complete --step execute --result "<text>"` and `node "<PLUGIN_ROOT>/scripts/state/ship.js" skip --step execute --reason "<text>"`. This task adds the execute condition: for `step === 'execute'`, the guard also fires when no execute state file exists and `git status --porcelain` shows a path outside `.sdlc/`. Like part 1 Task 8, the guard covers an entry that is `in_progress` or `failed` with `dispatchHead` set.

**Acceptance criteria:**
- [ ] execute `in_progress` or `failed` with `dispatchHead` set, no execute state file, tree changes outside `.sdlc/` (or HEAD ≠ `dispatchHead`) → `rerunGuard` pending question for `execute`; no dispatch.
- [ ] execute `in_progress` with an execute state file → `dispatch_execute … --resume` as today.
- [ ] execute `in_progress`, no state file, clean tree, HEAD = `dispatchHead` → a fresh dispatch (nothing was done).

**Contract:**
- shape (code):

  | execute entry | execute state file | tree / HEAD | Result |
  |---|---|---|---|
  | `in_progress` | yes | any | dispatch with `--resume` (unchanged) |
  | `in_progress` or `failed`, `dispatchHead` set | no | changes outside `.sdlc/` or HEAD moved | `rerunGuard` (step `execute`), options `record`, `rerun` |
  | `in_progress` | no | clean, HEAD = `dispatchHead` | fresh dispatch |
  | `pending` | — | — | fresh dispatch, records `dispatchHead` |
- names: R86; `rerunGuard`.
- mirror: the L22 block at `ship.js:1953-1962`.
- decisions: Key Decisions "re-run guard records a fact".
- sync: part 1 Task 8's `ship-rerun: (version)` cases stay green.

**Test proof:** `ship-rerun: (execute) finished execute without state stops with rerunGuard`, `ship-rerun: (execute) state file resumes`, `ship-rerun: (execute) clean tree dispatches fresh`, `ship-rerun: (execute) repeated call is idempotent` (the same envelope twice; the ledger differs only in `paused.at` and the appended history row; `steps[execute]` and `dispatchHead` are unchanged).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rerun:|ship-step:" -j 2 --no-cache -o /tmp/pf-wRb1-t22.json`

---

### Task 6: ship — prefer the review copy over `--pr` (item 11, #9302)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `receivedReviewInput` order
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-rr-input` cases for the new order

**Commit:** `fix(#9319): ship-sdlc - send the review copy to received-review`

**Notes:** review-sdlc posts one top-level comment, so the `--pr` branch finds no threads and received-review fixes nothing. The copy is this run's review, which is what received-review must answer.

**Acceptance criteria:**
- [ ] OPEN PR and a valid review copy → `--comment-file "<copy>"`; OPEN PR without a copy → `--pr <N>`; neither → `''`.

**Contract:**
- shape (code):
  ```diff
   function receivedReviewInput(ledger) {
  -  const pr = fetchPrMetadata();
  -  if (pr.exists && pr.state === 'OPEN' && Number.isInteger(pr.number) && pr.number > 0) return `--pr ${pr.number}`;
     const d = reviewGateDecision(ledger);
     const p = d.commentCopyPath || d.commentPath;
     if (typeof p === 'string' && path.isAbsolute(p) && !/["`$\\\n\r]/.test(p) && fs.existsSync(p)) return `--comment-file "${p}"`;
  +  const pr = fetchPrMetadata();
  +  if (pr.exists && pr.state === 'OPEN' && Number.isInteger(pr.number) && pr.number > 0) return `--pr ${pr.number}`;
     return '';
   }
  ```
- names: R77 (amended).
- mirror: `ship.js:1687-1694`.
- decisions: Deviations none; Key Decisions none (a direct item).
- sync: spec R77; `docs/specs/review-sdlc.md:125` P11 text still holds (the copy is what ship reads).

**Test proof:** `ship-rr-input: (d) open PR with a review copy sends --comment-file`, `ship-rr-input: (e) open PR without a copy sends --pr`; the three existing `ship-rr-input` cases updated where they asserted the old order.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rr-input|ship-rr-scope:" -j 2 --no-cache -o /tmp/pf-wRb1-t23.json`

---

### Task 7: received-review SKILL.md — comment-file mode fixes (item 11, #9302)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Steps 7, 8, 10 under `manifest.source === "comment-file"` (R31); Step 11.6 `PR:` line and dedup (R32)
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — `rr-skill-text: (comment-file)` counts
- Modify: `docs/skills/received-review-sdlc.md` — the comment-file paragraph names R31/R32

**Commit:** `fix(#9319): received-review-sdlc - comment-file mode drafts no replies`

**Notes:** Comment-file mode posts nothing (R27). Drafting thread replies there wastes the run and invites a post that R27 forbids.

**Acceptance criteria:**
- [ ] Step 7: "**Comment-file mode (R31):** In the `comment-file` source (`manifest.source`), draft no reply. Keep one decision line per finding for the Step 10 table." Step 8: the thread-level row is marked "not applied in comment-file mode". Step 10: the "Drafted PR responses" block is omitted in that mode. No sentence this task adds, in Step 7, 8 or 10, contains the exact string ``When `manifest.source` is `comment-file` ``.
- [ ] Step 11.6 cell 3 writes `PR: none (comment-file <basename>)` when `manifest.pr` is null, and the dedup matches on `surface=`, `targetFile=` and the `PR:` line (R32).
- [ ] Every string counted by the existing `rr-skill-text:` cases still appears exactly once.

**Contract:**
- shape (code): inserted sentences (rendered):
  ```markdown
  **Comment-file mode (R31):** In the `comment-file` source (`manifest.source`), draft no reply. Keep one decision line per finding for the Step 10 table.
  ```
  ```diff
  - PR: <pr.number>
  + PR: <pr.number>   (or, when `manifest.pr` is null: PR: none (comment-file <basename of manifest.comment_file>)) (R32)
  ```
- names: R31, R32; the string `**Comment-file mode (R31):**`.
- mirror: the R27 lines at `SKILL.md:371`, `:495`, `:514`.
- decisions: Deviations none.
- sync: `rr-skill-text:` cases at `received-review-prepare-exec.yaml:141`, `:196`.

**Test proof:** `rr-skill-text: (comment-file) R31 and R32 lines appear once`; existing `rr-skill-text:` cases green, and the existing `rr-skill-text:` `src` count (``When `manifest.source` is `comment-file` ``) stays 1.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "rr-skill-text|rr-comment-file" -j 2 --no-cache -o /tmp/pf-wRb1-t24.json`

---

### Task 8: commit — `checkTrailers` and `commit.js --check-message` (item 12, G10+)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/commit-message.js` — add and export `checkTrailers`
- Modify: `plugins/sdlc-utilities/scripts/skill/commit.js` — `--check-message <file> --manifest <path>` mode (exit 0/4/2)
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — `commit-trailers: (G10+)` cases
- Create: `tests/promptfoo/fixtures-fs/commit-check-message/setup.sh` — writes `manifest.json` (one valued `Co-Authored-By` trailer), `ok-lf.txt`, `ok-crlf.txt` (with `printf` CR bytes), `dup-model.txt`, `dup-lowercase.txt` and `missing.txt` into the case directory

**Commit:** `fix(#9319): commit-sdlc - exact trailer check, CRLF-safe`

**Notes:** #9303 and #9304 merge here (item 12). `missingTrailers` stays for version.js (G9), so version behaviour does not change in this wave.

**Acceptance criteria:**
- [ ] `ok-lf.txt` and `ok-crlf.txt` (one configured `Co-Authored-By` line) exit 0.
- [ ] `dup-model.txt` (the configured line plus a `Co-Authored-By: Claude Haiku …` line) exits 4 with `duplicate trailer: Co-Authored-By`; `dup-lowercase.txt` (configured line plus `Co-authored-by: …`) exits 4 the same way; `missing.txt` exits 4 with `missing trailer: Co-Authored-By: …`.
- [ ] A manifest with `commitConfig: null` or no `trailers` exits 0; an unreadable file exits 2.

**Contract:**
- shape (code):
  ```js
  /** G10+ (commit R17): exactly one line per configured key; valued entries byte-exact. CRLF-safe. */
  function checkTrailers(text, trailers) { … }   // → string[] of violation lines
  module.exports = { TRAILER_RE, MAX_SUBJECT_CHARS, resolveTrailers, checkGivenSubjects, missingTrailers, checkTrailers };
  ```

  | Message lines for key `Co-Authored-By` | Entry | Result |
  |---|---|---|
  | exactly one, equal to `Co-Authored-By: <V>` | valued `<V>` | pass |
  | none | valued | `missing trailer: Co-Authored-By: <V>` |
  | two or more (any case) | valued or key-only | `duplicate trailer: Co-Authored-By` |
  | one, other value | valued | `wrong trailer: Co-Authored-By: <other>` |
- names: `checkTrailers`, `--check-message`, `--manifest`; commit R17, P14, E12.
- mirror: `missingTrailers` at `commit-message.js:61-66`; commit.js flag parse at `:73-119`.
- decisions: Key Decisions "G10+ as one shared check".
- sync: Task 9 SKILL.md calls the mode; version.js unchanged.

**Test proof:** `commit-trailers: (G10+) LF message passes`, `(G10+) CRLF message passes`, `(G10+) second model trailer fails as duplicate`, `(G10+) lowercase duplicate fails`, `(G10+) missing trailer fails`, `(G10+) no config passes`, `(G10+) unreadable file exits 2`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "commit-trailers|commit-subject|commit-literal-message|version-prepare" -j 2 --no-cache -o /tmp/pf-wRb1-t25.json`

---

### Task 9: commit SKILL.md and drafter — run the check on every message; no own trailer (item 12, G10+)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` — gate subject read CRLF-safe; trailer loop replaced by a `--check-message` call for every message; R19 sentence in Step 2
- Modify: `plugins/sdlc-utilities/agents/commit-orchestrator.md` — R19 rule next to `:59`
- Modify: `docs/skills/commit-sdlc.md` — the `requiredTrailers` row (`:188`) says "exactly one, CRLF-safe, checked for every message"
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — `commit-skill-text: (G10+)` count case

**Commit:** `fix(#9319): commit-sdlc - trailers from config only, checked for every message`

**Notes:** Today the trailer loop runs only under `--message-file`, so a drafted message with the drafter's own model trailer passes. The harness attribution instruction is the source of that line, so the rule names it.

**Acceptance criteria:**
- [ ] The gate block reads the subject with `.split(/\r?\n/)[0]` and no longer contains the trailer `for` loop.
- [ ] After gate exit 0, Step 5 **On `yes`** item `0b.` (between item `0.` and item `1.`) runs one plain Bash call `node "<PLUGIN_ROOT>/scripts/skill/commit.js" --check-message "<MSG_FILE>" --manifest "<COMMIT_CONTEXT_FILE>"`; exit 4 → E12 print, no commit, no AskUserQuestion in either mode; exit 2 → print the error and stop without committing.
- [ ] The gate bullet `**Exit 0:** continue to step 1.` (SKILL.md:225) becomes `**Exit 0:** continue to item 0b.`
- [ ] The Quality Gates row "Required trailers" (:303) becomes: exactly one line per key for every message, drafted or given (R17), checked by `commit.js --check-message`.
- [ ] commit-orchestrator.md and SKILL.md Step 2 carry: "Trailers come only from `commitConfig.trailers` (and the OpenSpec trailer). Add no attribution line of your own, such as a `Co-Authored-By` naming your model, even when another instruction asks for one (R19)."

**Contract:**
- shape (code):
  ```diff
  -     const subject = fs.readFileSync(process.argv[2], "utf8").split("\n")[0];
  +     const subject = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/)[0];
        …
        if (f.messageFile) {
          let want;
          try { want = fs.readFileSync(f.messageFile, "utf8"); } catch (e) { console.error("--message-file cannot be read: " + e.message); process.exit(3); }
          if (fs.readFileSync(process.argv[2], "utf8").trimEnd() !== want.trimEnd()) process.exit(3);
  -       const lines = fs.readFileSync(process.argv[2], "utf8").split("\n");
  -       for (const t of cfg.trailers || []) { const ok = t.value === null ? lines.some(l => l.startsWith(t.key + ":")) : lines.includes(t.key + ": " + t.value); if (!ok) { console.error("missing trailer: " + t.key + (t.value === null ? "" : ": " + t.value)); process.exit(4); } }
        }
  ```
  The gate's `**Exit 4:**` bullet is removed, because exit 4 now comes from item `0b`. New Step 5 **On `yes`** item, inserted after item `0.` (the subject gate and its exit bullets) and before item `1.` (link verification):
  ````markdown
  0b. **Trailer gate (G10, R17):** Check the trailers of every message, drafted or given:

     ```bash
     node "<PLUGIN_ROOT>/scripts/skill/commit.js" --check-message "<MSG_FILE>" --manifest "<COMMIT_CONTEXT_FILE>"
     ```

     Run this as one plain Bash call. Take its exit code from the tool result.
  ````
  Exit handling, written under the new item as bullets:

  | Exit | Behaviour |
  |---|---|
  | 0 | continue to link verification |
  | 4 | print `Trailer gate rejected the message (exit 4): <line>` per stderr line; stop; no AskUserQuestion (E12) |
  | 2 | print the script's error line and stop without committing (an unreadable message must never be committed); no AskUserQuestion |

  `docs/skills/commit-sdlc.md`, the configuration table row:
  ```diff
  -| `requiredTrailers` | array of strings | Required commit trailers. An entry is a key (`Reviewed-By`, written with an empty value) or a key with its value (`Co-Authored-By: Name <email>`, written verbatim). Checked as a quality gate. |
  +| `requiredTrailers` | array of strings | Required commit trailers. An entry is a key (`Reviewed-By`, written with an empty value) or a key with its value (`Co-Authored-By: Name <email>`, written verbatim). Every message, drafted or given, must hold exactly one line per key (keys compared case-insensitively; CRLF line ends accepted), checked by `commit.js --check-message` before the commit. |
  ```
- names: R17, R19, E12; `0b. **Trailer gate (G10, R17):**`.
- mirror: the link-check step 1 at `SKILL.md:238-252` (one plain Bash call, exit from the tool result).
- decisions: Key Decisions "G10+ as one shared check".
- sync: Quality Gates row `:303`; `docs/skills/commit-sdlc.md:174`, `:188`.

**Test proof:** `commit-skill-text: (G10+) trailer gate step and R19 rule appear once, the inline trailer loop is gone`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "commit-skill-text|commit-trailers" -j 2 --no-cache -o /tmp/pf-wRb1-t26.json`

---

### Task 10: config — `commit.requiredTrailers` with the executor's line (item 13)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 9
**Verify:** tests

**Files:**
- Modify: `.sdlc/config.json` — `commit.requiredTrailers`
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — `commit-trailers: (config)` probe case

**Commit:** `chore(#9319): config - require the executor's Co-Authored-By trailer`

**Notes:** The value must equal the line the executor's commits actually carry (brief). 70 of the last 78 trailer lines on the branch history carry it, and the project profile names the same line.

**Acceptance criteria:**
- [ ] `.sdlc/config.json` `commit` gains `"requiredTrailers": ["Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"]`; the file still validates against `schemas/sdlc-config.schema.json` (at the repository root, not under `plugins/sdlc-utilities/`; `commit.requiredTrailers` is an array of strings).
- [ ] The probe case resolves the repo config through `resolveTrailers` to `[{ key: "Co-Authored-By", value: "Claude Sonnet 5.5 <noreply@anthropic.com>" }]`.

**Contract:**
- shape (code):

  | Op | Key | Type | Value | Notes |
  |---|---|---|---|---|
  | add | `commit.requiredTrailers` | string[] | `["Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"]` | read from the main worktree root by `resolveSdlcRoot()` |
- names: `commit.requiredTrailers`.
- mirror: the example at `docs/skills/commit-sdlc.md:174`.
- decisions: value from the brief's item-13 ruling.
- sync: Task 8's G10+ check uses it on every in-ship commit after merge.

**Test proof:** `commit-trailers: (config) repo config resolves the Sonnet 5.5 trailer` (`script_path: "-e"`, requires `scripts/lib/commit-message.js` and reads `{{repo_root}}/.sdlc/config.json`).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "commit-trailers" -j 2 --no-cache -o /tmp/pf-wRb1-t27.json`

---

### Task 11: commit SKILL.md — drafter fallback (item 14, #9272)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 10
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` — Step 2 "Capture" paragraph (`:149`) gains the R18 fallback
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — `commit-skill-text: (R18)` count case

**Commit:** `fix(#9319): commit-sdlc - draft in context when the drafter returns nothing`

**Notes:** In ship, commit-sdlc runs inside the ship-step agent, so the drafter is a nested dispatch. When it returned nothing, the step stopped before committing.

**Acceptance criteria:**
- [ ] `:149` reads: "If the manifest's `errors[]` is non-empty, surface those errors and stop. If the dispatch returns no message (empty result, error, or no Agent tool here), read `<PLUGIN_ROOT>/agents/commit-orchestrator.md` and the manifest, draft `MESSAGE` in this context with the same rules, and continue to Step 5 (R18)."
- [ ] No other Step 2 text changes.

**Contract:**
- shape (code):
  ```diff
  - Capture the orchestrator's return value as `MESSAGE`. If `MESSAGE` is empty, the orchestrator detected an `errors[]` array in the manifest — surface those errors and stop.
  + Capture the orchestrator's return value as `MESSAGE`. If the manifest's `errors[]` is non-empty, surface those errors and stop. If the dispatch returns no message (empty result, error, or no Agent tool here), read `<PLUGIN_ROOT>/agents/commit-orchestrator.md` and the manifest, draft `MESSAGE` in this context with the same rules, and continue to Step 5 (R18).
  ```
- names: R18.
- mirror: `SKILL.md:149`.
- decisions: Deviations "#9272 fix".
- sync: the Task 9 trailer gate still checks the in-context draft.

**Test proof:** `commit-skill-text: (R18) the fallback sentence appears once`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "commit-skill-text" -j 2 --no-cache -o /tmp/pf-wRb1-t28.json`

---

### Task 12: execute SKILL.md — split the `PARSE_EXIT` call (item 15, #9241)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 11
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — the Step 5c parse block (`:407-419`)
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — `execute-prepare: (#9241)` text case

**Commit:** `fix(#9319): execute-plan-sdlc - parse and remove the wave summary in separate calls`

**Notes:** Compound Bash calls (`;`, chained commands) risk permission denials in a headless run. The exit code is read from the tool result, as every other skill block does.

**Acceptance criteria:**
- [ ] The parse fence holds only the node parse; no `echo "PARSE_EXIT=$?"` line remains.
- [ ] A second fence holds `rm -f "<SUMMARY_FILE>"` alone, run after the parse result is read.
- [ ] `:419` reads "If no JSON line was printed or the parse call's exit code (from the tool result) is not 0 … (E15)".

**Contract:**
- shape (code):
  ```diff
       … node -e "…" < "<SUMMARY_FILE>"
  -    echo "PARSE_EXIT=$?"
  -    rm -f "<SUMMARY_FILE>"
     ```
  +  Run this as one plain Bash call; take its exit code from the tool result. Then remove the file in its own call:
  +  ```bash
  +  rm -f "<SUMMARY_FILE>"
  +  ```
  - If no JSON line was printed or `PARSE_EXIT` is not 0, …
  + If no JSON line was printed or the parse call's exit code (from the tool result) is not 0, …
  ```
- names: E15 (amended).
- mirror: the "Run this as one plain Bash call" wording at `commit-sdlc/SKILL.md:245`.
- decisions: none beyond the item.
- sync: spec E15 (part 1 Task 6).

**Test proof:** `execute-prepare: (#9241) SKILL.md has no PARSE_EXIT echo and a separate rm call` (reads the SKILL.md through `script_path: "-e"` and counts `PARSE_EXIT=` = 0).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "execute-prepare: " -j 2 --no-cache -o /tmp/pf-wRb1-t29.json`

---

### Task 13: re-verify #9138 and #9139 (item 16, read-only)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 12
**Verify:** manual

**Files:**
- none (read-only; no file is created or changed)

**Commit:** none (no change)

**Notes:** Q4: done at pre-flight; this task only re-records the evidence at the final head, so the PR body can cite it. Nothing else.

**Acceptance criteria:**
- [ ] `grep -n "writeManifestState('commit'" plugins/sdlc-utilities/scripts/skill/commit.js` and `grep -n "process.stdout.write(manifestPath" plugins/sdlc-utilities/scripts/skill/commit.js` each print one line (#9138: per-branch timestamped manifest, path printed).
- [ ] `grep -n "cs.status === 'skipped' && entry.status === 'pending'" plugins/sdlc-utilities/scripts/skill/ship.js` prints one line, and `grep -n "s.status !== 'skipped' && s.status !== 'failed'" plugins/sdlc-utilities/scripts/lib/state.js` prints one line (#9139).
- [ ] The four lines and their line numbers go into the executor's done-file and the PR body evidence, stamped with the final head sha.

**Verification:** the four grep commands of the acceptance criteria, each printing exactly one line.

---

### Task 14: site copies of the touched skill docs, and the final checks

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 13
**Verify:** build, tests

**Files:**
- Modify: `site/src/content-source/skills/ship-sdlc.md` — copied by `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`, never edited by hand
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — copied the same way
- Modify: `site/src/content-source/skills/commit-sdlc.md` — copied the same way
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — copied the same way

**Commit:** `docs(#9319): site - copy skill doc pages`

**Notes:** The spec copies were made in part 1 Tasks 1–6. These four docs pages changed in part 1 Tasks 7–17 and Tasks 1–11, so one copy at the end avoids a copy per task.

**Acceptance criteria:**
- [ ] After `for n in ship-sdlc received-review-sdlc commit-sdlc execute-plan-sdlc; do cp docs/skills/$n.md site/src/content-source/skills/$n.md && cmp docs/skills/$n.md site/src/content-source/skills/$n.md; done`, `git status --short site/` lists only these four files.
- [ ] The closing checks pass: `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0; `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0, with no new finding for ship-sdlc, received-review-sdlc, commit-sdlc, execute-plan-sdlc, version-sdlc or pr-sdlc; both exec configs are green in full.

**Contract:**
- shape (docs): per-file `cp` copies, byte-equal to `docs/skills/<name>.md` (checked by `cmp`); no hand edit.
- names: the four copy paths.
- mirror: the per-file spec copies of part 1 Tasks 1–6.
- decisions: one copy step at the end.
- sync: `docs/skills/{ship-sdlc,received-review-sdlc,commit-sdlc,execute-plan-sdlc}.md`.

**Verification:** `for n in ship-sdlc received-review-sdlc commit-sdlc execute-plan-sdlc; do cp docs/skills/$n.md site/src/content-source/skills/$n.md && cmp docs/skills/$n.md site/src/content-source/skills/$n.md; done`, then the part 2 header **Verification:** command (full `promptfooconfig-exec.yaml` and `promptfooconfig-exec-hooks.yaml`).

---

## Final Shape

After part 2 (on top of part 1), ship can run a whole wave unattended.

- **Questions and resume.** Under `--auto`, no skill on the ship path asks a question; each such place stops with a pending question. A consistency rule keeps it that way. On `--resume`, every non-frozen flag is merged again (CLI, then config, then default) and written back into the ledger, so a run that used `--auto` repeats it. A finished execute is not run again.

- **Review input.** Received-review gets this run's review copy, not an empty PR thread list. In comment-file mode it drafts no replies and logs `PR: none (comment-file …)`.

- **Commits.** Every commit message, drafted or given, passes one CRLF-safe trailer check: exactly one `Co-Authored-By` line, equal to the configured one. The drafter adds no trailer of its own. When the nested drafter returns nothing, commit-sdlc drafts the message itself.

- **Execute.** The wave-summary parse and its file removal run as two separate Bash calls.

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
| 1–8 | part 1 Tasks 1–17 | covered in part 1 |
| 9 N3 --auto branches + consistency rule | Task 1, Task 2, Task 3 | covered |
| 10 N4/#9228 resume flag refresh and no redo | Task 4, Task 5 | covered |
| 11 #9302 comment-copy and comment-file fixes | Task 6, Task 7 | covered |
| 12 G10+ exactly one trailer, CRLF-safe | Task 8, Task 9 | covered |
| 13 Config commit.requiredTrailers | Task 10 | covered |
| 14 #9272 drafter fallback | Task 11 | covered |
| 15 #9241 PARSE_EXIT split | Task 12 | covered |
| 16 Re-verify #9138/#9139 read-only | Task 13 | covered |
| 17 Constraints (one plan, order, final validators, no release/PR) | Task 14 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
