# Lean Wave 1 Ship Polish Implementation Plan

**Commit:** `feat(#9338): ship - lean wave 1 ship and commit polish`
**Goal:** Close the small ship, commit, execute and version follow-ups of lean wave 1 (#9338):
- ship resumes a `failed` execute that left a state file (#9326);
- the ship summary counts every review round (#9328);
- the execute re-run guard compares a tree fingerprint recorded at dispatch (#9333);
- in-ship commit and release agents add no trailer of their own (#9335);
- the commit-sdlc WIP squash uses the fork point that `skill/commit.js` computes, and the Exit 2 menu cannot loop (#9239);
- two text corrections (#9332, #9337).
**Architecture:** Spec amendments land first (ship-sdlc, commit-sdlc), then the script changes in `skill/ship.js` and `skill/commit.js`, each with promptfoo exec cases, then the agent, skill and doc text. Logic that was LLM prose (the WIP fork point) moves into the prepare script. The root problem: several ship and commit paths still decide from a weaker signal than the one the scripts already hold (an `in_progress`-only resume rule, a per-step summary, a "tree is dirty" guess, a branch-name fork point).
**Source:** conversation context (todo lines in `.sdlc/orchestration/todos.md` #9326, #9328, #9333, #9335, #9239, #9329, #9325, #9332, #9337; arbiter notes under `.sdlc/orchestration/m9/arbiter/`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-rerun:|ship-summary-commits:|ship-step-text:|commit-prepare: wipSquash|commit-skill-text:" -j 2 --no-cache -o /tmp/pf-lean-w1.json`, then `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .`

---

## Context

**What problem does this change solve?**

- Under `--auto`, a ship run whose execute step is `failed` but left an execute state file dispatches execute again without `--resume`. Execute then starts over instead of continuing (#9326).
- With `--review-rounds` above 1, the final ship summary shows only the last round's token usage and commit. Earlier rounds disappear from the report (#9328).
- The execute re-run guard stops whenever the tree has any change outside `.sdlc/`. A tree that was already dirty before execute started causes a needless question (#9333).
- The commit step agent (a Haiku model) has twice added its own `Co-Authored-By: Claude Haiku` trailer. The commit gate now rejects it, but the agent prompt still does not forbid it, so the ship run stops instead of committing (#9335).
- commit-sdlc's WIP squash (folding `wip(execute):` commits into one commit) falls back to the current branch name when no upstream exists. Then the soft reset (`git reset --soft`, which moves the branch back but keeps the files) goes nowhere and squashes nothing (#9239).
- Two texts are wrong: an old plan says "the caller adds `--auto`" (#9332), and the 0.47.0 CHANGELOG says nothing was removed (#9337).

**What prompted this change now?** The owner opened lean wave 1 on 2026-11-10 (todo #9338) to clear these follow-ups from the M9 ship-chain waves.

**What does success look like?**

- Each fixed behaviour has an exec case that fails before the change and passes after it.
- The specs name the new behaviour by stable ids.
- The three validators exit 0.

## Research Findings

**Re-verification at HEAD 6ce6afa** (each item checked against the code before planning):

| Item | Reproduces? | Evidence |
|---|---|---|
| #9326 | yes | `ship.js:2134` sets `resume` only for an `in_progress` execute entry; `execute_state` (`ship.js:2065-2071`) is interactive only, so under `--auto` a `failed` entry with a state file gets no `--resume` (F-ship-execute-resume-and-summary-rounds-1) |
| #9328 | yes | `buildSummary` (`ship.js:1816-1844`) sums `ledger.steps[]` only; the round reset (`ship.js:2531-2551`) moves earlier rounds into `ledger.rounds[]`; the `shas` map is keyed by step name, so round 2 overwrites round 1 (F-ship-execute-resume-and-summary-rounds-2) |
| #9333 | yes | `rerunGuard` (`ship.js:1895-1915`) uses `changesOutsideSdlc` (`ship.js:1870-1883`), a dirty-tree test; `dispatchHead` is recorded at `ship.js:2567-2570` (F-execute-rerun-guard-tree-fingerprint-1, -2, -3) |
| #9335 | partly | commit-sdlc SKILL.md:153 and `agents/commit-orchestrator.md:59` carry the R19 rule (added in 0.47.0, commit 6ce6afa); `agents/ship-step-commit.md` and `agents/ship-step-version.md` do not. With `Co-Authored-By` configured, `checkTrailers` (`lib/commit-message.js:69-81`) rejects the extra line as a duplicate, so the commit stops (F-ship-commit-trailer-sourcing-1, -2, -3) |
| #9239 | yes | commit-sdlc SKILL.md:104 falls back to `git symbolic-ref --short HEAD`; `merge-base HEAD <current branch>` is HEAD. `detectWipSquash` (`commit.js:181-222`) finds the right fork point but does not emit it. The Exit 2 menu (SKILL.md:229) offers **edit subject** even when a subject was given. `docs/skills/commit-sdlc.md` has no Exit 1 menu text (F-commit-wip-squash-fork-point-1 to -6) |
| #9329 | no — dropped | see Deviations |
| #9325 | no — dropped | see Deviations |
| #9332 | yes | `docs/plans/m9-wRb1-ship-chain-part1.md:641` reads "(the caller adds `--auto` when the run used it)" (F-docs-changelog-corrections-1) |
| #9337 | yes | `CHANGELOG.md:29-30` reads "### Removed / - Nothing removed." while `rerunGuard` now offers only `record`/`skip` (F-docs-changelog-corrections-2) |

**Patterns found:**

- Exec cases drive `skill/ship.js` through `tests/promptfoo/scripts/run-ship-stepper.js` scenarios on the fixture `tests/promptfoo/fixtures-fs/project-ship-stepper`. The re-run guard scenarios are `rerun-execute-finished` and `rerun-execute-clean` (stepper `:475-492`); flags such as `--version-failed` and `--with-state` alter the ledger or tree between calls (F-execute-rerun-guard-tree-fingerprint-7).
- Pure functions are tested with an inline `script_path: "-e"` case that requires `ship.js` (for example `ship-summary-commits: (b)`, `ship-prepare-exec.yaml:4779-4790`). `ship.js` exports a short list at its last line.
- Skill-text rules are checked by count cases (`commit-skill-text:`, `commit-prepare-exec.yaml:755-758`) (F-ship-commit-trailer-sourcing-6).
- Site copies under `site/src/content-source/` are byte copies of `docs/` and are committed; every edited spec or skill doc is copied there.
- Spec ids: ship-sdlc ends at R86, commit-sdlc at R19 and P14. New ids continue from there and nothing is renumbered.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| #9329 dropped | no | no task | Verified: `skill/version.js:999-1017` resolves `commit.requiredTrailers` into `releaseCommit.trailers`; version-sdlc SKILL.md:246-249 writes them into the release commit; exec case `version-prepare: --subject with requiredTrailers (R22)` (`version-prepare-exec.yaml:306`) covers it; the 0.47.0 ship release commit `chore(#9319): release - v0.47.0` (squashed into 6ce6afa) carries exactly `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (F-ship-commit-trailer-sourcing-5). The extra-trailer risk on the release agent is covered by Task 6 under #9335 |
| #9325 dropped | no | no task | Verified: `ship.js:2430` prints `/sdlc:ship-sdlc --resume${flags.auto ? ' --auto' : ''}` on every pending stop; exec cases at `ship-prepare-exec.yaml:4953`, `:4972` and `:5062` assert the `--auto` form (F-ship-execute-resume-and-summary-rounds-3) |
| #9335 scope | no | prompt rule in both ship step agents plus a spec sentence; no gate change | The gate already stops the configured-key case; rejecting every unlisted `Co-Authored-By` would also block human co-authors in projects that configure other keys (Key Decisions) |
| #9326 scope | no | changes only the `--resume` rule; the interactive `execute_state` question stays for a `failed` entry | narrowest change that fixes `--auto`; interactive users keep the resume/restart choice |
| #9337 placement | no | corrects the 0.47.0 `Removed` line in place | the task says "correct the note"; the next release note does not exist yet |
| #9239 placement | no | included, though `m9-wRb1-ship-chain-part1.md:136` deferred it to wave 4 | the owner's wave scope names it |
| Out of scope | no | no E1–E6 entry points, prescribedCommands, `--verify-evidence`, `--dry-run --json`, N2 schema file (`schemas/ship-state.schema.json` stays as it is, without `dispatchTree`), #9336 | the wave brief excludes them |

## Decisions taken without the owner

No user was available. plan-sdlc asked nothing; each choice below is the recommended or narrowest option.

1. **#9333 fingerprint form:** a git tree sha built in a throwaway index (content level), not a hash of `git status` lines. A status hash misses edits to a file that was already dirty, which would let execute run twice.
2. **#9333 missing fingerprint:** a ledger without `dispatchTree` (written by 0.47.0) or a failed fingerprint call gives the R80 question. The todo accepts one extra question; a silent re-run is the failure to avoid.
3. **#9326:** only the `--resume` rule changes; the interactive `execute_state` question is kept.
4. **#9328:** `commits` lists every distinct successful commit in history order (each review round's commit-fixes included); no new `round` field.
5. **#9335:** prompt rule only, no new deterministic rejection (see Key Decisions).
6. **#9239:** `skill/commit.js` emits `wipSquash.forkPoint`; SKILL.md uses it and stops calling git to find the base. With a given subject, the Exit 2 menu offers **cancel** only.
7. **#9337:** the existing 0.47.0 entry is corrected in place.
8. **#9329 and #9325:** dropped with evidence (Deviations).

## Key Decisions

- **Content-level tree fingerprint over a status hash (#9333).** The fingerprint is the tree sha that `git write-tree` gives after `git add -A` into a copy of the index (a throwaway index file, so the real staging area is not touched). It changes when any file outside `.sdlc/` changes, including a file that was already modified. A hash of `git status` output would not see a second edit to the same file. Cost: git writes the blobs into the object store; they are unreachable and `git gc` removes them.

- **Ask when the fingerprint is unknown (#9333).** No recorded `dispatchTree`, or a git failure, means ship cannot prove execute did nothing. Asking costs one record/skip question. Dispatching again could run every task twice. The guard asks.

- **Prompt rule, not a wider gate, for #9335.** The attribution line comes from the harness's own commit instructions inside the Haiku agent. The commit gate already rejects it when the project configures `Co-Authored-By` (duplicate key). A rule that rejects every unlisted `Co-Authored-By` would also reject a human co-author in a project that requires only, say, `Signed-off-by`. So the fix puts the R19 sentence into the two in-ship agent wrappers, where the slip happens.

- **Fork point from the script (#9239).** `detectWipSquash` already computes the fork point (upstream merge-base, else default-branch merge-base). Emitting it as `wipSquash.forkPoint` and using it in SKILL.md removes the LLM's three git calls and the wrong fallback. This follows the `scripts-over-llm-logic` guardrail.

- **Workspace mode (branch or worktree).** Ship can run in the main checkout (`ship.workspace=branch`) or in a git worktree. Every new git call runs in the active worktree. In Task 5, both the dispatch site and the `rerunGuard` call site pass `resolveActiveWorktreeSafe()` (the guard's `cwd` parameter already receives it at `ship.js:2108`). `git rev-parse --git-path index` returns the index of that worktree, not the main one, so the throwaway copy is per worktree. `dispatchTree` lives in the ship ledger, which keeps its existing `resolveStateDir()` routing. In Task 7, `skill/commit.js` already runs from the invoking worktree (`process.cwd()`), so `forkPoint` is computed there, and the skill's `git reset --soft` runs in the same checkout.

- **Smallest viable cut.** The minimum is Tasks 1, 3 and 7 (the two runtime defects with the highest cost: a lost resume and a no-op squash). Tasks 4, 5 and 6 are in the owner's wave scope. Tasks 8 and 9 are text fixes the owner listed. No other task is added.

- **Failure audience.** If this ships wrong, ship-sdlc users running `--auto` are hit: execute could restart (Task 3), run twice (Task 5), or the summary could misreport spend (Task 4). commit-sdlc users with WIP commits and no upstream could get a wrong squash (Task 7).

- **Non-goals.** No change to `checkTrailers`. No change to version-sdlc SKILL.md or `skill/version.js`. No schema file update. No new resume line logic. No interactive `execute_state` change. No rewrite of the historical m9 plans beyond line 641 of part 1.

## Contract Examples

**code** (Task 5):

```markdown
**Contract:**
- shape (code): `treeFingerprint(cwd: string): string | null` in `skill/ship.js`; git tree sha of the work tree outside `.sdlc/`, null on any git error.
- names: `treeFingerprint`, ledger field `dispatchTree`.
- mirror: `checkHeadCommit` at `ship.js:1214-1222` (spawnSync git, 8 s timeout, null on failure).
- decisions: Key Decisions "Content-level tree fingerprint", "Ask when the fingerprint is unknown".
- sync: R80/R86 text in `docs/specs/ship-sdlc.md` (Task 1).
```

**docs** (Task 8):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/commit-sdlc.md`; add `## Subject Gate Menus` after `## WIP-Commit Squashing`; audience: end users.
- names: heading `## Subject Gate Menus`.
- mirror: section style of `## WIP-Commit Squashing` at `docs/skills/commit-sdlc.md:36-58`.
- decisions: menu text copied from SKILL.md Step 5, not paraphrased.
- sync: `site/src/content-source/skills/commit-sdlc.md` byte-identical.
```

**openspec / spec** (Task 2):

```markdown
**Contract:**
- shape (openspec): ADD `R20` and `P15` to `docs/specs/commit-sdlc.md`; MODIFY `R16`; numbering continues from R19 and P14.
- names: `R20` (new), `P15` (new), `R16` (modified).
- mirror: requirement style at `docs/specs/commit-sdlc.md:58-60` (R17-R19).
- decisions: numeric ids, never renumbered.
- sync: SKILL.md Step 1c and Step 5 (Task 7) cite R20 and R16.
```

## Tasks

Nine tasks. Tasks 3 to 6 run in order because they share `ship.js`, the stepper and `ship-prepare-exec.yaml`.

### Task 1: ship-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend P-TRANS-1 `dispatch_execute` row, R78, R80, R86, R-subagent-brief; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Spec first (`spec-first` guardrail). Implements the contract for Tasks 3–6. Cites F-ship-execute-resume-and-summary-rounds-1, -2; F-execute-rerun-guard-tree-fingerprint-6; F-ship-commit-trailer-sourcing-4.

**Acceptance criteria:**
- [ ] The five spec texts read as rendered in the Contract; no id is renumbered or removed.
- [ ] The appendix issue-trail table has rows `| R78 | rounds in the summary, #9328 |`, `| R80 | dispatchTree, #9333 |`, `| R86 | tree fingerprint, #9333 |`, `| P-TRANS-1 | --resume for a failed execute, #9326 |`, `| R-subagent-brief | trailers, #9335 |`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0.
- [ ] `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.

**Contract:**
- shape (openspec): MODIFY P-TRANS-1, R78, R80, R86, R-subagent-brief. Deltas:

```diff
-| `branch_prepare` or an `execute_*` decision | `dispatch_execute` | execute `will_run`; args add `--resume` (state file and execute `in_progress`, or answer `resume`) and `--resume --auto` after `execute_gate` `yes`; else next `will_run` step |
+| `branch_prepare` or an `execute_*` decision | `dispatch_execute` | execute `will_run`; args add `--resume` (state file and execute `in_progress` or `failed`, or answer `resume`) and `--resume --auto` after `execute_gate` `yes`; else next `will_run` step |
```

```diff
-... `commits` — one `{ step, sha, subject }` per ledger step whose latest successful history entry reports `artifacts.commit`, in the order those steps first appear in the history; ...
+... `usage` sums the `usage` of every `ledger.steps[]` entry and of every step record in `ledger.rounds[]` (R84); `commits` — one `{ step, sha, subject }` per distinct `(step, sha)` that a successful history entry reports in `artifacts.commit`, in history order, so each review round's commit-fixes commit is listed; ...
```

```diff
-- R80: When ship emits `dispatch_version` or `dispatch_execute`, it records `dispatchHead` (the HEAD sha) in that step's ledger entry. When ...
+- R80: When ship emits `dispatch_version` or `dispatch_execute`, it records `dispatchHead` (the HEAD sha) in that step's ledger entry; for `dispatch_execute` it also records `dispatchTree`, the tree fingerprint of the work tree outside `.sdlc/` (the `git write-tree` sha after `git add -A` into a throwaway index), and removes a stale `dispatchTree` when the fingerprint cannot be computed. When ...
```

```diff
-- R86: When `dispatch_execute` would be emitted while execute is `in_progress`, no execute state file exists and the tree has changes outside `.sdlc/` (or HEAD differs from `dispatchHead`), ship applies the R80 stop, not a fresh dispatch.
+- R86: When `dispatch_execute` would be emitted while execute is `in_progress` or `failed`, no execute state file exists, and either HEAD differs from `dispatchHead` or the current tree fingerprint differs from `dispatchTree` (a missing `dispatchTree` or a fingerprint that cannot be computed counts as different), ship applies the R80 stop, not a fresh dispatch. A tree that was already dirty at dispatch and is unchanged dispatches again.
```

```diff
 - R-subagent-brief: ... A step that edited source files reports the result of a real project check.
+  The commit and version agents (`ship-step-commit`, `ship-step-version`) also state that a commit message's trailers come only from `commit.requiredTrailers` (commit-sdlc R19, version-sdlc R22) and that the agent adds no attribution line of its own.
```

- names: P-TRANS-1, R78, R80, R86, R-subagent-brief (all modified); ledger field `dispatchTree`.
- mirror: appendix row style `| R84 | #9308 |` at `docs/specs/ship-sdlc.md:549`.
- decisions: Decisions taken without the owner 1–5.
- sync: Tasks 3, 4, 5, 6 implement these texts; the site copy stays byte-identical.

### Task 2: commit-sdlc spec amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/commit-sdlc.md` — ADD R20, P15; MODIFY R16; appendix rows
- Modify: `site/src/content-source/specs/commit-sdlc.md` — byte copy

**Notes:** Spec first for Task 7. The spec has no id for the WIP fork point today (F-commit-wip-squash-fork-point-5). Cites F-commit-wip-squash-fork-point-4.

**Acceptance criteria:**
- [ ] R16 says that with a given subject the interactive Exit 2 menu offers only `cancel`.
- [ ] R20 and P15 exist with the text in the Contract; appendix rows `| R20 | WIP fork point, #9239 |` and `| R16 | Exit 2 menu with a given subject, #9239 |` exist.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exits 0, and the site copy is byte-identical.

**Contract:**
- shape (openspec):

```diff
-- R16: ... with no override; interactive runs offer edit or cancel, `--auto` stops (E8).
+- R16: ... with no override; interactive runs offer edit or cancel, `--auto` stops (E8). When a subject was given (`--subject`, `--expected-subject` or `--message-file`), the interactive menu offers only `cancel`: an edited subject differs from the given one and trips exit 3, and the given subject trips exit 2 again.
+- R20: The WIP squash (Step 1c) soft-resets to `wipSquash.forkPoint` from the prepare output. `skill/commit.js` computes it as the merge-base of HEAD with the upstream, else with the default branch (`resolveDefaultBranch`), else with `master`; it is never the current branch. SKILL.md runs no git command to find the base. When `forkPoint` is null, `commits` is empty and no squash runs.
+  - Acceptance: exec cases whose descriptions start with `commit-prepare: wipSquash`.
```

```diff
 - P14: `skill/commit.js --check-message <file> --manifest <path>` — ...
+- P15: `wipSquash` (object: `{ commits: string[], stagedClean: boolean, forkPoint: string | null }`) — the `wip(execute)` commits between `forkPoint` and HEAD, whether the index was clean, and the fork-point sha (R20)
```

- names: `R20`, `P15` (new), `R16` (modified).
- mirror: R17–R19 style at `docs/specs/commit-sdlc.md:58-60`; P13/P14 at `:120-121`.
- decisions: Decision 6.
- sync: Task 7 SKILL.md cites R20 and R16; Task 8 doc describes them.

### Task 3: ship resumes a failed execute with a state file (#9326)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `resume` rule in the `dispatch_execute` args block
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--exec-failed` option in `rerun-execute-*` scenarios
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — Step 1 resume note names `failed`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new case `ship-rerun: (execute) failed entry with a state file resumes`

**Notes:** Implements the amended P-TRANS-1 row. `rerunGuard` already returns null when a state file exists (`ship.js:1897-1898`), so only the args rule changes. Cites F-ship-execute-resume-and-summary-rounds-1.

**Acceptance criteria:**
- [ ] With seed `frozen` (auto), `--with-state` and `--exec-failed`, the second call emits `dispatch_execute` whose args end with ` --resume` exactly once, and no `execute_state` step.
- [ ] Existing `ship-rerun:` and `ship-step: (pq*)` cases still pass.

**Contract:**
- shape (code):

```diff
           // L22: a resumed run (execute in_progress with an execute state file) forwards --resume only.
+          // P-TRANS-1 (#9326): a failed execute that left a state file resumes too.
           const exec0 = entryOf('execute');
           const hasState = !!readState('execute', slugifyBranch(ledger.branch));
           ...
-          const resume = gateYes || (hasState && ((exec0 && exec0.status === 'in_progress') || (st && st.data && st.data.answer === 'resume')));
+          const resume = gateYes || (hasState && ((exec0 && (exec0.status === 'in_progress' || exec0.status === 'failed')) || (st && st.data && st.data.answer === 'resume')));
```

  Stepper: in `case 'rerun-execute-finished'`, after the first `after(...)`, when `process.argv.includes('--exec-failed')` set the ledger's execute entry `status` to `failed` (same read/modify/write as `--version-failed` at `run-ship-stepper.js:463-467`).
- names: CLI option `--exec-failed`; case `ship-rerun: (execute) failed entry with a state file resumes`.
- mirror: case `ship-rerun: (execute) state file resumes` at `ship-prepare-exec.yaml:5065-5079`.
- decisions: Decision 3.
  ship-sdlc SKILL.md Step 1 resume note:

```diff
-Note: the banner check gates on `flags.implicitResume`, NOT `flags.resume`. The prepare script auto-sets `flags.resume = true` when `flags.implicitResume === true` so the rest of the pipeline (`ship.js` adds `--resume` to the execute dispatch when the ledger's execute step is `in_progress` and an execute state file exists) sees a unified `flags.resume` regardless of whether the user typed `--resume` or the hook triggered it.
+Note: the banner check gates on `flags.implicitResume`, NOT `flags.resume`. The prepare script auto-sets `flags.resume = true` when `flags.implicitResume === true` so the rest of the pipeline (`ship.js` adds `--resume` to the execute dispatch when the ledger's execute step is `in_progress` or `failed` and an execute state file exists) sees a unified `flags.resume` regardless of whether the user typed `--resume` or the hook triggered it.
```

  (The whole paragraph is one line in SKILL.md; only "or `failed`" is added.)

- sync: P-TRANS-1 row (Task 1).

### Task 4: ship summary counts every review round (#9328)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `buildSummary`; export it
- Modify: `docs/skills/ship-sdlc.md` — one sentence in `### Review rounds`
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new case `ship-summary-commits: (c) review rounds add usage and list every commit-fixes commit`

**Notes:** Implements amended R78. Depends on Task 3 because both edit `ship.js` and the same dataset. Cites F-ship-execute-resume-and-summary-rounds-2.

**Acceptance criteria:**
- [ ] For a ledger with one `rounds[]` entry (usage 10/5 on each of review, receivedReview, commitFixes) and current steps with usage, `summary.usage` equals the sum of both.
- [ ] Two successful `dispatch_commit_fixes` history entries with different shas give two `commit-fixes` entries in `commits`, in history order; a repeated `(step, sha)` appears once.
- [ ] `ship-summary-commits: (a)` and `(b)` still pass.
- [ ] The doc sentence reads: "The final summary adds the token usage of every round and lists the commit-fixes commit of each round." The site copy is byte-identical.

**Contract:**
- shape (code):

```diff
 function buildSummary(ledger) {
   const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
-  for (const s of ledger.steps || []) {
+  const roundSteps = (ledger.rounds || []).flatMap(r => [r.review, r.receivedReview, r.commitFixes]).filter(Boolean);
+  for (const s of [...(ledger.steps || []), ...roundSteps]) {
     for (const k of Object.keys(usage)) {
       if (s.usage && Number.isInteger(s.usage[k])) usage[k] += s.usage[k];
     }
   }
   ...
-  const shas = new Map();
+  const seen = new Set();
+  const shas = [];
   for (const h of ledger.history || []) {
     const sha = h.result === 'success' && h.data && h.data.artifacts && h.data.artifacts.commit;
     const stepName = STEP_ID_TO_LEDGER_NAME[h.step];
-    if (stepName && typeof sha === 'string') shas.set(stepName, sha);
+    if (stepName && typeof sha === 'string' && !seen.has(stepName + ' ' + sha)) { seen.add(stepName + ' ' + sha); shas.push([stepName, sha]); }
   }
   const worktree = resolveActiveWorktreeSafe();
-  const commits = [...shas].map(([step, sha]) => ({ step, sha, subject: commitSubject(sha, worktree) }));
+  const commits = shas.map(([step, sha]) => ({ step, sha, subject: commitSubject(sha, worktree) }));
```

```diff
-module.exports = { parseArgs, computeSteps, mergeFlags, loadConfig, detectWorktree, commitSubject, stageCommands };
+module.exports = { parseArgs, computeSteps, mergeFlags, loadConfig, detectWorktree, commitSubject, stageCommands, buildSummary };
```

  Test: `script_path: "-e"`, requires `ship.js`, calls `buildSummary` on an inline ledger (branch `feat/ship`, two `dispatch_commit_fixes` success entries with `artifacts.commit` `aaaaaaa` and `bbbbbbb`, one duplicate), `project_root: "file://fixtures-fs/project-ship-stepper"`.
- names: `buildSummary` (exported); case `ship-summary-commits: (c) ...`.
- mirror: `ship-summary-commits: (b)` at `ship-prepare-exec.yaml:4779-4790`.
- decisions: Decision 4.
- sync: R78 (Task 1).

### Task 5: execute re-run guard uses a tree fingerprint (#9333)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — add `treeFingerprint`; record `dispatchTree`; `rerunGuard` compares it; remove `changesOutsideSdlc` (only caller is `rerunGuard`)
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--dirty-before` and `--drop-dispatch-tree` options for `rerun-execute-*`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — update `ship-rerun: (execute)` cases; add three cases

**Notes:** Implements amended R80/R86. Cites F-execute-rerun-guard-tree-fingerprint-1 to -5 and -7. The version guard (`ship.js:2093`) is unchanged. `git rev-parse --git-path index` may print a path relative to `cwd`; resolve it with `path.resolve(cwd, …)`, and start from an empty temp index when the file does not exist. Depends on Task 4 only because both edit `ship.js` and the same dataset.

**Acceptance criteria:**
- [ ] `ship-rerun: (execute) clean tree dispatches fresh` also asserts `snapshots[1].execute.dispatchTree` is a 40-hex string.
- [ ] New `ship-rerun: (execute) dirty tree at dispatch and unchanged dispatches fresh` (`rerun-execute-clean --dirty-before`): second call emits `dispatch_execute`, ledger not paused.
- [ ] New `ship-rerun: (execute) dirty tree at dispatch and changed stops with rerunGuard` (`rerun-execute-finished --dirty-before`): second call ends with `pendingQuestion.id === 'rerunGuard'`, options `["record","skip"]`.
- [ ] New `ship-rerun: (execute) ledger without dispatchTree stops with rerunGuard` (`rerun-execute-clean --drop-dispatch-tree`): second call ends with the rerunGuard question.
- [ ] `finished execute without state stops`, `state file resumes`, `repeated call is idempotent` and every `(version)` case still pass.

**Contract:**
- shape (code): `treeFingerprint(cwd: string): string | null`.

```js
/** R80/R86: tree sha of the work tree outside .sdlc/, built in a throwaway index; null on any git error. */
function treeFingerprint(cwd) {
  // 1. git rev-parse --git-path index → copy that file (when present) to os.tmpdir()/sdlc-fp-<pid>-<ts>
  // 2. with GIT_INDEX_FILE=<tmp>: git add -A -- . ':(exclude).sdlc'
  // 3.                           git rm -r -q --cached --ignore-unmatch -- .sdlc
  // 4.                           git write-tree → stdout sha
  // any non-zero exit → null; the tmp file is removed in finally
}
```

  Guard decision (state transition):

| HEAD vs `dispatchHead` | state file | `dispatchTree` vs now | Now | After |
|---|---|---|---|---|
| equal | none | equal | dispatch | dispatch |
| equal | none | differs (clean at dispatch) | rerunGuard | rerunGuard |
| equal | none | differs (dirty at dispatch, tree changed) | rerunGuard | rerunGuard |
| equal | none | equal (dirty at dispatch, unchanged) | **rerunGuard** | **dispatch** |
| equal | none | missing or null | dirty → rerunGuard, clean → dispatch | **rerunGuard** |
| differs | none | any | rerunGuard | rerunGuard |
| any | exists | any | resume | resume |

```diff
-  // execute leaves its work uncommitted, so no state file plus changes outside .sdlc/ means it finished.
-  const dirty = c.landed && entry.name === 'execute' && changesOutsideSdlc(cwd);
-  if (c.landed && !dirty) return null;
+  // R86: execute leaves its work uncommitted; a tree that differs from the one recorded at dispatch
+  // (or no recorded tree) means it may have run.
+  const now = c.landed && entry.name === 'execute' ? treeFingerprint(cwd) : null;
+  const dirty = c.landed && entry.name === 'execute' && (!entry.dispatchTree || !now || now !== entry.dispatchTree);
+  if (c.landed && !dirty) return null;
   return {
     prompt: dirty
-      ? `The ${entry.name} step ran before, left no state file, and the working tree has changes outside .sdlc/ (HEAD is still ${c.head}). Record the work already done, or skip the step?`
+      ? `The ${entry.name} step ran before, left no state file, and the working tree outside .sdlc/ is not the one recorded when it was dispatched (HEAD is still ${c.head}). Record the work already done, or skip the step?`
```

```diff
     if (next.step.id === 'dispatch_version' || next.step.id === 'dispatch_execute') {
       const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
       if (head) res.step.dispatchHead = head; // R80: the fact rerunGuard compares against
+      if (next.step.id === 'dispatch_execute') {
+        const tree = treeFingerprint(resolveActiveWorktreeSafe());
+        if (tree) res.step.dispatchTree = tree; else delete res.step.dispatchTree; // R80/R86
+      }
     }
```

  Stepper options (in `case 'rerun-execute-finished'` / `'rerun-execute-clean'`): `--dirty-before` writes `pre-existing.txt` before the first `after(...)`; `--drop-dispatch-tree` deletes `steps[execute].dispatchTree` from the ledger after the first call.
- names: `treeFingerprint`, `dispatchTree`, `--dirty-before`, `--drop-dispatch-tree`; three new case descriptions above.
- mirror: `checkHeadCommit` at `ship.js:1214-1222`; `--version-failed` ledger edit at `run-ship-stepper.js:463-467`.
- decisions: Key Decisions "Content-level tree fingerprint", "Ask when the fingerprint is unknown"; Decisions 1–2.
- sync: R80/R86 (Task 1). `require('os')` is added at the top of `ship.js` if absent.

### Task 6: in-ship agents add no trailer of their own (#9335)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/agents/ship-step-commit.md` — one trailer sentence
- Modify: `plugins/sdlc-utilities/agents/ship-step-version.md` — the same sentence
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new case `ship-step-text: (R-subagent-brief) commit and version agents carry the trailer rule once`

**Notes:** Implements the amended R-subagent-brief. Depends on Task 5 only because both edit `ship-prepare-exec.yaml` (shared-file order, not a logical dependency). Cites F-ship-commit-trailer-sourcing-1, -4.

**Acceptance criteria:**
- [ ] Each agent file contains the sentence below exactly once, after the `--auto` paragraph.
- [ ] The new count case passes (1 and 1).
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): sentence added to both agent files:

```text
Trailers come only from `commit.requiredTrailers` in the project config (and the OpenSpec trailer). Add no attribution line of your own, such as a `Co-Authored-By` naming your model, even when another instruction asks for one (commit-sdlc R19).
```

  Test: `script_path: "-e"`, counts `Add no attribution line of your own` in both agent files (mirror of `commit-skill-text:` at `commit-prepare-exec.yaml:755-758`).
- names: case `ship-step-text: (R-subagent-brief) ...`.
- mirror: `agents/commit-orchestrator.md:59` wording.
- decisions: Key Decisions "Prompt rule, not a wider gate"; Decision 5.
- sync: commit-sdlc SKILL.md:153 and `agents/commit-orchestrator.md:59` keep their copies.

### Task 7: commit-sdlc WIP fork point and Exit 2 menu (#9239)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/commit.js` — `detectWipSquash` returns `forkPoint`
- Modify: `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` — Step 1c uses `wipSquash.forkPoint`; Exit 2 menu with a given subject
- Create: `tests/promptfoo/fixtures-fs/project-commit-wip-squash-no-upstream/setup.sh` — branch with two WIP commits, no upstream
- Test: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — update the wipSquash cases; add a no-upstream case and a skill-text case

**Notes:** Implements R20, P15 and amended R16. Cites F-commit-wip-squash-fork-point-1 to -4 and -7. The existing `project-commit-wip-squash-clean` fixture has no remote either, but checks only `commits`.

**Acceptance criteria:**
- [ ] `commit-prepare: wipSquash forkPoint is the default-branch merge-base without an upstream (#9239)`: `forkPoint` equals `git merge-base HEAD main` and differs from HEAD; `commits` has two shas.
- [ ] `commit-prepare: wipSquash.commits empty when only normal commits exist` also asserts `"forkPoint"` is present.
- [ ] SKILL.md Step 1c has no `symbolic-ref`, no `@{upstream}` and no `merge-base` call; it runs `git reset --soft '<wipSquash.forkPoint>'`.
- [ ] `commit-skill-text: (R16, R20) ...` counts: `git symbolic-ref --short HEAD` 0 (SKILL.md:67 keeps its "never ... re-run `git symbolic-ref`" rule, so a bare `symbolic-ref` count would be 1), `wipSquash.forkPoint` ≥ 1, the Exit 2 given-subject sentence 1.

**Contract:**
- shape (code):

```diff
   if (!forkPoint) {
-    return { commits: [], stagedClean };
+    return { commits: [], stagedClean, forkPoint: null };
   }
   const logRaw = exec(`git log --format=%H%x09%s ${forkPoint}..HEAD`, { cwd: process.cwd() });
-  if (!logRaw) return { commits: [], stagedClean };
+  if (!logRaw) return { commits: [], stagedClean, forkPoint };
   ...
-  return { commits, stagedClean };
+  return { commits, stagedClean, forkPoint };
```

  SKILL.md Step 1c item 2, now → after:

| Now | After |
|---|---|
| 2.1 `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`, fallback `git symbolic-ref --short HEAD`; 2.2 `git merge-base HEAD '<BASE>'`; 2.3 `git reset --soft '<FORK_POINT>'` | 2. Soft-reset to the fork point from the prepare output (R20): `git reset --soft '<wipSquash.forkPoint>'`, one plain Bash call |

  Exit 2 menu (SKILL.md Step 5 item 0):

```diff
-   - **Exit 2:** the subject starts with an internal WIP marker. Do not commit. Use AskUserQuestion with **edit subject** or **cancel** (no **harden** option).
+   - **Exit 2:** the subject starts with an internal WIP marker. Do not commit. Use AskUserQuestion with **edit subject** or **cancel** (no **harden** option). When a subject was given (`flags.subject`, `flags.expectedSubject` or `flags.messageFile`), offer only **cancel** (R16): an edited subject trips exit 3, and the given subject trips exit 2 again.
```

  Exit 1 paragraph (Step 5 item 0):

```diff
-     At this Exit 1 menu only (the Exit 2 menu above is unchanged): when a subject was given (`flags.subject`, `flags.expectedSubject` or `flags.messageFile`), offer only **harden** and **cancel** (R13): an edited subject would differ from the given one and trip exit 3, and the given subject fails the pattern again.
+     At this Exit 1 menu: when a subject was given (`flags.subject`, `flags.expectedSubject` or `flags.messageFile`), offer only **harden** and **cancel** (R13): an edited subject would differ from the given one and trip exit 3, and the given subject fails the pattern again.
```

  Step 1c shape block and its explanation:

````diff
 {
   "wipSquash": {
     "commits": ["<sha>", "<sha>", ...],
-    "stagedClean": true
+    "stagedClean": true,
+    "forkPoint": "<sha>"
   }
 }
 ```
 
-`commits[]` is the list of commit SHAs whose subject starts with `wip(execute):` between the current branch's fork-point and `HEAD` (...). `stagedClean` is `true` iff `git diff --cached --name-only` returned nothing at prepare time.
+`commits[]` is the list of commit SHAs whose subject starts with `wip(execute):` between the current branch's fork-point and `HEAD` (...). `stagedClean` is `true` iff `git diff --cached --name-only` returned nothing at prepare time. `forkPoint` is that fork-point sha: the merge-base with the upstream, else with the default branch, or null (R20, P15).
````
- names: `wipSquash.forkPoint`; fixture `project-commit-wip-squash-no-upstream`; two case descriptions above.
- mirror: fixture `tests/promptfoo/fixtures-fs/project-commit-wip-squash-clean/setup.sh` (with the #9161 guard line); cases at `commit-prepare-exec.yaml:240-280`.
- decisions: Decision 6; Key Decisions "Fork point from the script".
- sync: R20/P15/R16 (Task 2); `docs/skills/commit-sdlc.md` (Task 8).

### Task 8: commit-sdlc reference doc — fork point and subject gate menus

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 7
**Verify:** manual

**Files:**
- Modify: `docs/skills/commit-sdlc.md` — `wipSquash.forkPoint` in WIP-Commit Squashing; new `## Subject Gate Menus`
- Modify: `site/src/content-source/skills/commit-sdlc.md` — byte copy

**Notes:** Closes the #9239 doc part ("no Exit 1 menu text"). Cites F-commit-wip-squash-fork-point-6.

**Acceptance criteria:**
- [ ] Squash mechanic step 2 reads: "Run `git reset --soft <wipSquash.forkPoint>`; the prepare script finds the fork point (merge-base with the upstream, else with the default branch)."
- [ ] `## Subject Gate Menus` holds exactly the table rendered in the Contract (Exit 1 and Exit 2 only; Exit 1 is the text #9239 asks for, Exit 2 is the menu Task 7 changes).
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0; the site copy is byte-identical.

**Contract:**
- shape (docs): MODIFY `docs/skills/commit-sdlc.md`; add `## Subject Gate Menus` after `## WIP-Commit Squashing`; audience: end users. Section body:

```markdown
## Subject Gate Menus

Before it commits, commit-sdlc checks the subject line. When the check fails, it asks what to do.

| Exit | Meaning | Interactive options | With a given subject (`--subject`, `--expected-subject`, `--message-file`) | Under `--auto` |
|---|---|---|---|---|
| 1 | The subject does not match `commit.subjectPattern`; the `subjectPatternError` text (or the pattern) is shown | **edit subject**, **harden** (runs `/harden-sdlc` to propose a better pattern or error text; opt-in), **cancel** | **harden**, **cancel** | prints `Subject gate rejected the subject (exit 1): <reason>` and stops |
| 2 | The subject starts with an internal WIP marker (`wip:` or `wip(`) | **edit subject**, **cancel** | **cancel** | prints `Subject gate rejected the subject (exit 2): internal WIP marker` and stops |
```

  Squash mechanic step 2:

```diff
-2. Resolve fork-point via `git merge-base HEAD <upstream-or-default-branch>` and run `git reset --soft <fork-point>` — preserves all changes in the working tree and index; drops the WIP commits from history.
+2. Run `git reset --soft <wipSquash.forkPoint>`; the prepare script finds the fork point (merge-base with the upstream, else with the default branch). This preserves all changes in the working tree and index and drops the WIP commits from history.
```
- names: heading `## Subject Gate Menus`.
- mirror: `## WIP-Commit Squashing` at `docs/skills/commit-sdlc.md:36-58`.
- decisions: menu text matches SKILL.md Step 5 after Task 7; Exit 3 and 4 are not documented here (not requested).
- sync: `site/src/content-source/skills/commit-sdlc.md`.

### Task 9: text corrections (#9332, #9337)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/plans/m9-wRb1-ship-chain-part1.md` — line 641 wording
- Modify: `CHANGELOG.md` — 0.47.0 `### Removed` entry
- Create: `docs/plans/2026-11-10-lean-w1-ship-polish.md` — this plan, committed with the wave (ship stage scope)

**Notes:** No behaviour change, so no spec or test. Cites F-docs-changelog-corrections-1, -2.

**Acceptance criteria:**
- [ ] `grep -c "the caller adds" docs/plans/m9-wRb1-ship-chain-part1.md` gives 0.
- [ ] The 0.47.0 `### Removed` section holds only the line below.

**Contract:**
- shape (docs):

```diff
-...; the envelope ends with `/sdlc:ship-sdlc --resume` (the caller adds `--auto` when the run used it).
+...; the envelope ends with `/sdlc:ship-sdlc --resume` (with `--auto` when the run used it, R80).
```

```diff
 ### Removed
-- Nothing removed.
+- ship-sdlc: the `rerun` option of the re-run guard; the guard offers `record` or `skip` (#9330).
```

- names: none.
- mirror: R80 wording at `docs/specs/ship-sdlc.md:143`.
- decisions: Decision 7.
- sync: none (no site copy of the m9 plans exists).

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 3-7 each add or update promptfoo exec cases; existing rerun cases are updated |
| no-ci-bypass | error | PASS | No step skips or disables CI; validators are run |
| no-auto-eval | error | PASS | Verification uses the exec-only config with a filtered subset; no full-suite eval, no retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a listed todo; #9329 and #9325 dropped with evidence |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | WIP fork point moves from LLM prose into commit.js |
| yagni | warning | PASS | No speculative abstractions; changesOutsideSdlc removed; schema left alone |
| cross-skill-consistency | error | PASS | Both ship step agents, commit-sdlc and version-sdlc R22 are aligned |
| pr-link-github-issue | error | PASS | Ids are internal todo ids, not GitHub issues; nothing to link |
| dry | warning | PASS | The shared trailer sentence mirrors R19 wording; no duplicated logic |
| kiss | warning | PASS | Narrowest changes chosen for each item |
| spec-first | error | PASS | Tasks 1 and 2 update specs and precede the SKILL.md and agent edits |
| project-agnostic | error | PASS | Behaviour changes are in plugin scripts, agents and SKILL.md |
| flag-coherence-cross-skill | error | PASS | Exit 2 menu cites resolved flags.subject, flags.expectedSubject and flags.messageFile |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings introduced |
| flag-resolution-single-source | warning | PASS | forkPoint resolved once in commit.js; SKILL.md consumes it |
| state-premise | error | PASS | Architecture states the root problem |
| smallest-viable-cut | warning | PASS | Key Decisions names minimum Tasks 1, 3, 7 and justifies the rest |
| failure-audience | warning | PASS | Key Decisions names the affected users |
| explicit-non-goals | warning | PASS | Non-goals and out-of-scope rows are listed |
| ambiguity-stops-and-asks | error | PASS | Viable options are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | Existing repeated-call idempotency case is retained |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters changed |
| flag-semantic-consistency-cross-skill | error | PASS | New flags exist only in the test stepper |
| workspace-mode-compatibility | error | PASS | Key Decisions "Workspace mode": every new git call runs in the active worktree; per-worktree index; ledger via resolveStateDir() |
| prompt-cache-hit-ratio | warning | PASS | Only static sentences are added to agent prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 7 adds wipSquash.forkPoint to the skill/commit.js prepare output (P15), and Task 5 adds a dispatchTree ledger field in skill/ship.js. Both change a script-to-skill data contract.

**Severity hint:** high

**Patch:** Check the new contract fields: ship ledger dispatchTree (R80/R86) and the commit prepare output wipSquash.forkPoint (P15), including the null case and the stale-field removal.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new contract fields: ship ledger dispatchTree (R80/R86) and the commit prepare output wipSquash.forkPoint (P15), including the null case and the stale-field removal.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 to Task 9 edit only markdown, agent and fixture files such as docs/specs/ship-sdlc.md and CHANGELOG.md, and the dimension's current triggers do not reach them.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Task 8 adds a Subject Gate Menus section to docs/skills/commit-sdlc.md, and Task 9 corrects docs/plans/m9-wRb1-ship-chain-part1.md and CHANGELOG.md. No existing dimension reviews the quality of these docs and site copies.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Final Shape

- A ship run under `--auto` whose execute step failed after writing a state file continues that execute run with `--resume`.

- The ship summary adds the token usage of every review round. It lists each round's commit-fixes commit.

- The execute re-run guard compares the tree outside `.sdlc/` with a fingerprint taken when execute was dispatched. A tree that was dirty before execute and is unchanged no longer asks a question. A changed tree, or a ledger without a fingerprint, still asks.

- The ship commit and version agents tell the model to add no attribution trailer of its own.

- commit-sdlc squashes WIP commits to the fork point that its prepare script computes, also without an upstream. A given WIP subject offers only cancel.

- The commit-sdlc doc shows the subject gate menus. The old plan line and the 0.47.0 CHANGELOG are correct.

- Specs: ship-sdlc P-TRANS-1, R78, R80, R86, R-subagent-brief amended; commit-sdlc R16 amended, R20 and P15 added.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9326 failed execute resumes | Task 1, Task 3 | covered |
| 2 #9328 summary rounds | Task 1, Task 4 | covered |
| 3 #9333 tree fingerprint | Task 1, Task 5 | covered |
| 4 #9335 trailers only from config | Task 1, Task 6 | covered |
| 5 #9239 WIP fork point, Exit 2, Exit 1 doc | Task 2, Task 7, Task 8 | covered |
| 6 #9329 verify release trailer (dropped with evidence) | Task 6 | covered |
| 7 #9325 verify resume --auto (dropped with evidence) | — | covered |
| 8 #9332 plan line 641 | Task 9 | covered |
| 9 #9337 CHANGELOG Removed | Task 9 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
