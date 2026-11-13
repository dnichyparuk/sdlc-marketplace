# Ship adoption scope, final-check resume and learnings push Implementation Plan

**Commit:** `fix(#9373): ship - scope-check adopted fixes, re-arm final check`
**Goal:**
- An adopted received-review commit passes the same plan-Files scope check as staged fixes (R83/R94), and a subject that differs from the plan's fix subject is reported.
- A resume after `final-check-open` reviews the new fix commit once, or stops with a question when nothing was fixed.
- `learnings_commit` does not push when the run has `--no-push`.
**Architecture:** All three behaviour changes live in `plugins/sdlc-utilities/scripts/skill/ship.js`. The R83 scope check (`stageScope`) gets an optional base commit, so it also checks the paths committed since received-review started; R97 adoption and `stage_fixes` both use it. The resume rule hooks into `runAfter` at `--after confirm_pipeline`, keyed on a `handoff` marker that `finalCheckStop` writes. The learnings command becomes a function of `flags.noPush`. Spec first (new R103, R104; amended R36, R97, A16), exec cases through `run-ship-stepper.js`.
**Source:** conversation context (todo #9373, post-merge Opus audit of PRs #74-#88)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- A received-review agent can commit its own fixes. Ship then "adopts" that commit (R97) and skips `stage_fixes`. That skip also skips the plan-Files scope check (R83 — the rule that refuses to stage paths outside the plan's **Files:** lists). An out-of-scope file can therefore reach the PR without any stop.
- After the final fix review stops a `--auto` run with open findings (`final-check-open`), `--resume` goes straight on to version and PR. A fix made in between is never reviewed, and a resume with no fix at all still ships.
- The trailing learnings commit runs `git push --set-upstream origin HEAD` even when the run asked for `--no-push`, so it creates the remote branch.

**What prompted this change now?** The post-merge Opus audit of PRs #74-#88 (2026-11-13, todo #9373) found these three gaps (HIGH-1, MEDIUM-2, LOW-1). Each was re-verified at HEAD `b9b6d76` (after PR #89); see Research Findings.

**What does success look like?**

- An adopted commit with a path outside the plan Files stops with the existing `stageOutsideFiles` question.
- A resume after `final-check-open` with a new commit dispatches one final review of that commit; a resume without a new commit stops with a `finalCheckOpen` question.
- With `--no-push`, the `learnings_commit` command holds no `git push`.
- Each behaviour has an exec case in `tests/promptfoo/datasets/ship-prepare-exec.yaml`.

## Research Findings

All three items still reproduce at HEAD `b9b6d76`. No item was dropped.

**HIGH-1 (R97 adoption skips the scope gate).** The adoption block is at `plugins/sdlc-utilities/scripts/skill/ship.js:2797-2807`. It checks only that HEAD moved past `fixBaseHead` and that `git status --porcelain` is empty, then marks commit-fixes `completed`. The transition at `:2810-2813` (`afterFixesCommitted`) then moves to the next review. `stage_fixes` (`:2134-2145`) is the only caller of `stageScope` for fixes, and it is never emitted after adoption. `stageScope` (`:1468-1491`) reads only `git status --porcelain`, so it cannot see committed paths even if it ran. The plan fix subject (`planFixSubject`, from the plan's optional `**Fix commit:**` header, `readPlanCommitSubject` `:1657-1688`) is only forwarded as `--subject` to commit-fixes (`:636`); an adopted commit keeps the agent's own message.

**MEDIUM-2 (resume after final-check-open).** `finalCheckStop` (`:2682-2688`) sets `ledger.paused` and returns `final-check-open`. The final check is marked `completed` before the stop (`:2817-2822`), and received-review and commit-fixes are `skipped` (R95). A resume enters through `ensureLedger` (`:1576-1621`, which sets `currentStep = 'confirm_pipeline'`) and then `--after confirm_pipeline`, which runs `pickNextStep` straight to version. Nothing compares HEAD with `finalCheck.commit`. `finalCheck.open` is computed under any `--auto` value, so the new rule must key on the hand-off itself, not on `open` alone (a non-auto run that continued to version must not stop later).

**LOW-1 (learnings push with --no-push).** `LEARNINGS_COMMIT_COMMAND` (`:1502`) is a constant with `git push --set-upstream origin HEAD`; the `learnings_commit` case (`:2206-2214`) emits it unchanged. `flags.noPush` (A16, `:473`) is only forwarded to the version step (`:661`).

**Tests.** Exec cases drive `tests/promptfoo/scripts/run-ship-stepper.js` against `tests/promptfoo/fixtures-fs/project-ship-stepper` (built by its `setup.sh`). The `rounds-self-commit` scenario (`run-ship-stepper.js:708-733`, `reviewRound` `:315-340`) does not call `setPlanFiles`, so the fixture plan has no **Files:** and `fix.txt` is outside the plan. With the new scope check the existing case `ship-self-commit: (a)` would stop; the scenario must list `fix.txt` first (as `rounds-2-fixes` already does). `--final-summary medium-1.json --review-threshold medium` already reproduces `final-check-open` (case `ship-final-check: (f)`, dataset `:5849`). The learnings cases are at dataset `:2574-2606` (`after-pr` scenario).

**Spec.** `docs/specs/ship-sdlc.md`: R83 `:203`, R94 `:205`, R95 `:209`, R97 `:213`, R36 `:239`, A16 `:27`, step-output table `:340-367`, appendix history `:590-611`. The last id is R102, so the new ids are R103 and R104. Byte copies live in `site/src/content-source/specs/ship-sdlc.md` and `site/src/content-source/skills/ship-sdlc.md`.

**Exploration note.** The plan-explore orchestrator could not fan out (no Agent tool in its context) and wrote no brief, so this plan used inline exploration (plan-sdlc R28 fallback; logged to `.sdlc/learnings/log.md`). Tasks therefore cite no `F-<DIM>-<n>` ids.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Subject mismatch on adoption | no | warns and still adopts | the paths are in scope; a stop could only be cleared by rewriting history, which the unattended pipeline cannot do; the PR squash replaces the subject anyway |
| `accept-open` answer | no | the answer is a second resume with no new commit | ship reads no answer files for pending questions (C-STEP-2 forbids ledger edits by the caller); the state-based form mirrors R94's "resume without reverting is keep" |
| New ids R103 and R104 | no | adds two ids instead of rewriting R97 and R95 | each rule gets its own anchor; R97 and R95 get one cross-reference sentence each |
| `stage_fixes` adoption | no | `stage_fixes` also adopts a clean, moved HEAD | after a refused adoption the user may revert with a new commit; without this, commit-fixes runs with nothing to commit |
| Brief's ship.js line numbers | no | uses HEAD line numbers | PR #89 moved the code; all evidence is re-taken at `b9b6d76` |

## Decisions taken without the owner

- **Subject mismatch warns, not stops.** Warning text: `adopted commit subject "<s>" differs from the plan fix subject "<planFixSubject>" (R103)`. Only when the plan has a `**Fix commit:**` header.
- **accept-open is a second resume.** The first resume without a new commit stops with `finalCheckOpen`; a second resume with HEAD still at `finalCheck.commit` accepts the open findings, adds a warning and continues.
- **The resume rule applies whatever `--auto` says on the resume.** It is keyed on the `handoff` marker that only an `--auto` stop writes.
- **No ship.js transition-table refactor.** Recorded as a follow-up only (out of scope per the brief).

## Key Decisions

- **One scope helper, two callers.** `stageScope` gains an optional `base` argument. With a base it adds the paths of `git diff --name-only -z <base>..HEAD` to the changed set. The alternative, a second helper for adoption, would duplicate the allowed-path rules (plan Files, plan file, R94 approved paths). One helper keeps R83, R94 and R103 the same rule.

- **Refused adoption reuses `stageOutsideFiles`.** The brief asks for the existing stop. The caller already knows its two answers (revert or amend the plan). No new question id is needed.

- **The resume hook sits at `--after confirm_pipeline`.** Every resume passes through it (`ensureLedger` sets `currentStep = 'confirm_pipeline'`). A hook in the initial call would run before the ledger is adopted and could not emit a step.

- **A `handoff` marker, not `paused.reason`.** `pendingStop` overwrites `paused.reason`, so the second resume (accept-open) could not see it. `finalCheck.handoff = true` survives until the check is re-armed or accepted.

- **At most one re-check per resume.** Re-arming replaces `finalCheck` with a fresh `pending` object. When that review completes with findings still open, the existing R95 stop fires again and the run waits for the next resume. Nothing re-arms inside one resume, so it cannot loop. Case (g) tests this: one resume emits exactly one `dispatch_review`.

- **Smallest viable cut.** The three audit items, one spec task and two docs tasks. Tasks 4 and 5 are needed because the user doc, `state-format.md` and `reference.md` describe the old behaviour; they are split so each touches at most four files (the plan file itself is listed under Task 5 only so ship stages it).

- **Who fails if this ships wrong.** The ship user and the main session that drives `--auto` runs: a wrong scope check stops good runs (false `stageOutsideFiles`), a wrong resume rule ships unreviewed fixes or loops on review. The exec cases cover both directions.

- **Workspace modes.** Every git call uses `resolveActiveWorktreeSafe()` as today, so `ship.workspace=branch` and `worktree` behave the same. No new state file; the ledger fields are written through the existing `writeState`.

- **No new CLI flag.** `--no-push` (A16) already exists; ship only reads `flags.noPush`. The stepper flags are test-runner flags, not skill flags.

- **Tracking id.** `#9373` is an internal register id, not a GitHub issue; the PR body names it without `Fixes`/`Closes`.

- **Non-goals.** No change to github-sdlc (wave 13), shared libraries and guards (`links.js`, `plan.js`, `worker-write-guard.js`, `execute.js`), the lean orchestration skill, a `runAfter` transition-table refactor, or any behavioural, headless or `claude -p` run. No change to received-review itself: its "never commit" rule (R97) stays as is.

## Contract Examples

**code** (Task 2):

```markdown
**Contract:**
- shape (code): `stageScope(planFile: string, cwd: string, approved: string[] = [], base: string|null = null): { outside: string[] }`; with `base`, the changed set also holds `git diff --name-only -z <base>..HEAD`; a failed diff adds nothing (R8 rule).
- names: `stageScope`, `adoptFixCommit`, warning `adopted commit subject "<s>" differs from the plan fix subject "<f>" (R103)`.
- mirror: `stageScope` at `plugins/sdlc-utilities/scripts/skill/ship.js:1468-1491`.
- decisions: refused adoption returns `stageOutsidePending(outside)` (Key Decisions).
- sync: `docs/specs/ship-sdlc.md` R103.
```

**openspec / spec** (Task 1):

```markdown
**Contract:**
- shape (openspec): ADD `R103`, `R104` after `R102`; MODIFY `R36`, `R97`, `A16`; two step-output rows; appendix rows for #9373.
- names: `R103`, `R104`, `R36`, `R97`, `A16`.
- mirror: requirement style of `R101` at `docs/specs/ship-sdlc.md:221`.
- decisions: new ids, never renumbered.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy.
```

**docs** (Task 4):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `### Review rounds` paragraph 2 (end users): adopted-commit scope stop, resume re-check, accept-open; MODIFY the `--no-push` flag row.
- names: `### Review rounds`, flag row `--no-push`.
- mirror: the existing R95/R97 sentences at `docs/skills/ship-sdlc.md:259`.
- decisions: user-facing prose; cites R103/R104.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 2 and 3 add or update exec cases (existing self-commit scenario updated); Tasks 1 and 4 are spec/docs only |
| no-ci-bypass | error | PASS | No CI skipping steps |
| no-auto-eval | error | PASS | Only filtered exec-only promptfoo runs; no full-suite runs, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md created |
| no-scope-creep | warning | PASS | Extras (stage_fixes adoption, subject warning) are justified in Deviations |
| single-responsibility-tasks | warning | PASS (justified) | Task 3 bundles R104 with the five-line learnings change because both edit the same three files; the bundling is explained in its Notes |
| scripts-over-llm-logic | error | PASS | All logic lives in ship.js; SKILL.md edits are one-sentence prose |
| yagni | warning | PASS | Every addition maps to an audit item |
| cross-skill-consistency | error | PASS | Aligns with pr-sdlc R19 push rule and version-step --no-push (A16) |
| pr-link-github-issue | error | PASS | #9373 is stated as an internal id, not a GitHub issue |
| dry | warning | PASS | One stageScope helper and one adoptFixCommit helper shared by both call sites |
| kiss | warning | PASS | Reuses existing question id and helpers |
| spec-first | error | PASS | Task 1 (spec) precedes Tasks 2-4 that touch ship.js and SKILL.md |
| project-agnostic | error | PASS | Changes are in plugin code and plugin docs |
| flag-coherence-cross-skill | error | PASS | Uses resolved flags.noPush from prepare output |
| no-opposite-logical-vectors | error | PASS | No divergent SKILL.md gate phrasings introduced |
| flag-resolution-single-source | warning | PASS | flags.noPush is resolved once and only read downstream |
| state-premise | error | PASS | Context states the root problem for each item |
| smallest-viable-cut | warning | PASS | Key Decisions states the minimal cut and justifies Task 4 |
| failure-audience | warning | PASS | Key Decisions names who fails |
| explicit-non-goals | warning | PASS | Non-goals listed |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Decisions taken without the owner and Key Decisions |
| state-machine-idempotency | error | PASS | Cases (h)/(i) verify ask-once then accept; handoff removal prevents re-trigger |
| agent-dispatch-script-driven | error | PASS | dispatch_review is emitted by the script with its own invocation |
| flag-semantic-consistency-cross-skill | error | PASS | No new skill flag; stepper flags are test-runner only |
| workspace-mode-compatibility | error | PASS | Plan states branch and worktree behave the same via existing resolvers |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 3 adds the finalCheckOpen pending question, the finalCheck.handoff marker and a learningsCommitCommand(noPush) that drops the push, and Task 2 adds the stageOutsideFiles stop on adoption, all changing the ship.js envelope and state contract.

**Severity hint:** high

**Patch:** Add checklist items for ship.js output contract changes: new pendingQuestion id finalCheckOpen, new finalCheck ledger fields (handoff, asked, accepted, recheck), and learnings_commit command varying with flags.noPush.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add checklist items for ship.js output contract changes: new pendingQuestion id finalCheckOpen, new finalCheck ledger fields (handoff, asked, accepted, recheck), and learnings_commit command varying with flags.noPush.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 and Task 4 modify markdown files which the code-quality dimension does not currently trigger on, so the script proposes adding the **/*.md trigger.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Tasks

### Task 1: Spec — R103, R104, and the R36/R97/A16 amendments

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — add R103, R104; amend A16, R36, R95 (one sentence), R97 (one sentence); two step-output rows; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec (`cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only (plan.copyRules companion): no text on adoption, final-check resume or the learnings push; change nothing unless a grep for `R97|finalCheck|no-push|learnings push` finds a stale sentence
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only (copyRules companion), same grep, change nothing unless stale
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only (copyRules companion), same grep, change nothing unless stale

**Notes:** Spec first: Tasks 2-5 cite these ids. The three companion files are listed because `plan.copyRules` requires every `skills/ship-sdlc/*.md` copy when the spec changes; at planning time a grep found no affected text in them. The text below is the decided wording; keep it verbatim apart from line wrapping. Never run `site/scripts/copy-docs.mjs`.

**Acceptance criteria:**
- [ ] R103 and R104 exist after R102 with the text in the Contract; no id is renumbered.
- [ ] A16 and R36 say that `--no-push` also drops the learnings push.
- [ ] R97 ends with `The adopted commit must pass R103 first.`; R95's resume clause ends with `R104 governs that resume.`
- [ ] The step-output table has the two new rows; the appendix has rows `R103`, `R104`, `R36`, `A16` with `#9373`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0 and `cmp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` exits 0.

**Contract:**
- shape (openspec): ADD after R102 (blank line between, as the file does):

  ```markdown
  - R103: Adopted fixes stay in scope. Before R97 adopts a commit at `--after dispatch_received_review`, `skill/ship.js` runs the R83 check on the paths of `git diff --name-only <fixBaseHead>..HEAD` (the R94 paths of the current round allowed, `.sdlc/` excluded). When a path is outside, it adopts nothing, records no commit-fixes result and stops through the pending-question path with the R83 question (`id: 'stageOutsideFiles'`, those paths). `stage_fixes` checks the same committed paths together with `git status --porcelain`, so a resume that keeps them stops again. When `stage_fixes` finds no outside path, a clean work tree and HEAD past `fixBaseHead`, it adopts HEAD as R97 does (reason `adopted: received-review committed its fixes`) instead of emitting staging commands. When the plan has a `**Fix commit:**` subject and the subject of the adopted HEAD differs from it, ship adds the warning `adopted commit subject "<subject>" differs from the plan fix subject "<planFixSubject>" (R103)` and still adopts. A failed `git diff` adds no path and adopts nothing.
  - R104: Resume after an open final check. `finalCheckStop` (R95) sets `finalCheck.handoff = true`. On `--after confirm_pipeline` with `finalCheck.status: "completed"`, `open` non-empty and `handoff: true`: (a) when HEAD differs from `finalCheck.commit`, ship re-arms the check: `finalCheck` becomes `{ base: <old commit>, commit: HEAD, status: "pending", verdict: null, open: [], recheck: <n> }` (`n` = earlier `recheck` + 1, 1 when absent), the review entry is reset to `pending`, and `dispatch_review` is emitted with `--committed --base <old commit>`; its result follows R95, so at most one re-check runs per resume. (b) When HEAD equals `finalCheck.commit` and `finalCheck.asked` is not true, ship sets `asked: true` and stops through the pending-question path with `{ id: 'finalCheckOpen', prompt, options: ['fix', 'accept-open'], open }`; the prompt says to commit a fix and resume, or to resume again without a commit to accept the open findings. (c) When HEAD equals `finalCheck.commit` and `asked` is true, ship sets `accepted: true`, removes `handoff`, adds the warning `final check: open findings accepted (R104)` and continues with the step after commit-fixes. Without `handoff`, `--after confirm_pipeline` changes nothing here.
  ```

  MODIFY A16 to: ``- A16: `--no-push` — forwarded to the version step as `--no-push` (R79); the `learnings_commit` command then holds no push (R36) (default: false)``.
  MODIFY R36: after the sentence ending `(the pr-sdlc R19 rule).` insert ``With `flags.noPush` (A16) the command commits and does not push.``
  MODIFY R95: append to the sentence ending ``and `--resume` continues with the step after commit-fixes.`` the words `R104 governs that resume.`
  MODIFY R97: after the sentence ending `as after a completed commit-fixes.` insert `The adopted commit must pass R103 first.`
  ADD step-output rows after the R95 row (`:365`):

  | Called after | Emits | Notes |
  |---|---|---|
  | `dispatch_received_review` (R97 adoption) or `stage_fixes` with a committed path outside the plan Files (R103) | `done` | `ext.reason:"pending-question"`, `ext.pendingQuestion.id:"stageOutsideFiles"`; commit-fixes not recorded |
  | `confirm_pipeline` with `finalCheck.handoff` (R104) | `dispatch_review` (HEAD moved) or `done` | re-armed check `--committed --base <old commit>`; else `pendingQuestion.id:"finalCheckOpen"` once, then accept-open on the next resume |

  ADD appendix rows: `| R103 | adopted fixes stay in scope (audit HIGH-1), #9373 |`, `| R104 | resume after an open final check (audit MEDIUM-2), #9373 |`, `| R36, A16 | no learnings push with --no-push (audit LOW-1), #9373 |`.
- names: `R103`, `R104`, `A16`, `R36`, `R95`, `R97`, `finalCheck.handoff`, `finalCheck.asked`, `finalCheck.accepted`, `finalCheck.recheck`, `finalCheckOpen`.
- mirror: requirement style of R101/R102 at `docs/specs/ship-sdlc.md:221-223`; appendix row style at `:601-611`.
- decisions: see `## Decisions taken without the owner`.
- sync: `site/src/content-source/specs/ship-sdlc.md` must equal `docs/specs/ship-sdlc.md` byte for byte.

### Task 2: ship.js — scope-check adopted fix commits (R103) with exec cases

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `stageScope` base argument, `adoptFixCommit` helper used by R97 adoption and `stage_fixes`, subject warning
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `rounds-self-commit` lists `fix.txt` in the plan Files; new flags `--self-commit-outside <path>`, `--fix-subject`, `--resume-after-outside`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new cases `ship-self-commit: (c)`, `(d)`, `(e)`

**Notes:** Complex and High because it changes when the pipeline gates a commit: a wrong check either ships out-of-scope code or stops good runs. The existing case `ship-self-commit: (a)` passes today only because nothing checks scope on adoption; the stepper must put `fix.txt` in the plan Files (as `rounds-2-fixes` does) so (a) keeps its meaning. Workers edit with the Edit tool only, never `sed -i` or shell redirects.

**Acceptance criteria:**
- [ ] `ship-self-commit: (a)` and `(b)` pass with their assertions unchanged.
- [ ] (c) A self-commit that also adds `src/unrelated.js` stops at `--after dispatch_received_review` with `ext.reason: "pending-question"`, `pendingQuestion.id: "stageOutsideFiles"`, `pendingQuestion.paths` equal to `["src/unrelated.js"]`; no warning contains `adopted as the commit-fixes commit`; the snapshot shows `commit-fixes` not `completed`.
- [ ] (d) With a plan `**Fix commit:**` subject, the self-commit is adopted and a warning contains `differs from the plan fix subject`.
- [ ] (e) After the (c) stop, a commit that deletes `src/unrelated.js` and `--after confirm_pipeline` lead to adoption through `stage_fixes`: no `dispatch_commit_fixes` is emitted, a warning contains `adopted as the commit-fixes commit`, the next step is `dispatch_review` with `--committed --base`. A second `--after confirm_pipeline` before the revert (case c extended) stops with `stageOutsideFiles` again (idempotent stop).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-self-commit|ship-rounds|stage-outside"` passes.

**Contract:**
- shape (code): `stageScope` in `plugins/sdlc-utilities/scripts/skill/ship.js`:

  ```diff
  -function stageScope(planFile, cwd, approved = []) {
  +function stageScope(planFile, cwd, approved = [], base = null) {
     let text = '';
     try { text = fs.readFileSync(planFile, 'utf8'); } catch { return { outside: [] }; }
  @@
     const parts = st.stdout.split('\0').filter(Boolean);
     const changed = [];
     for (let i = 0; i < parts.length; i++) {
       changed.push(parts[i].slice(3));
       if (/^[RC]/.test(parts[i])) i++; // the next entry is the rename source
     }
  +  // R103: paths committed since received-review started count as changed too.
  +  let diffFailed = false;
  +  if (base) {
  +    const d = spawnSync('git', ['diff', '--name-only', '-z', `${base}..HEAD`], { cwd, encoding: 'utf8', timeout: 8000 });
  +    if (d.status === 0) changed.push(...d.stdout.split('\0').filter(Boolean)); else diffFailed = true;
  +  }
     const outside = changed.filter(p => !p.startsWith('.sdlc/') && ![...allowed].some(a => p === a || p.startsWith(`${a}/`)));
  -  return { outside: [...new Set(outside)].sort() };
  +  return { outside: [...new Set(outside)].sort(), diffFailed };
   }
  ```

  New helper, placed directly above `afterFixesCommitted`:

  ```js
  /**
   * R97/R103: adopt HEAD as the commit-fixes commit when received-review committed its fixes itself.
   * @returns {{ adopted: string|null, pending: object|null }} pending = stageOutsidePending(outside)
   */
  function adoptFixCommit(ledger, { flags, planFixSubject, warnings }) {
    const none = { adopted: null, pending: null };
    const rr = ledger.steps.find(s => s.name === 'received-review');
    const wt = resolveActiveWorktreeSafe();
    const head = exec('git rev-parse HEAD', { cwd: wt });
    if (!rr || !rr.fixBaseHead || !head || head === rr.fixBaseHead) return none;
    if (exec('git status --porcelain', { cwd: wt }) !== '') return none; // dirty or failed: commit-fixes path
    const as = ledger.approvedScope;
    const approved = as && as.round === (ledger.round || 1) && Array.isArray(as.paths) ? as.paths : [];
    const { outside, diffFailed } = stageScope(flags.planFile, wt, approved, rr.fixBaseHead);
    if (diffFailed) return none;
    if (outside.length) return { adopted: null, pending: stageOutsidePending(outside) };
    const cf = ledger.steps.find(s => s.name === 'commit-fixes');
    if (cf) Object.assign(cf, { status: 'completed', reason: 'adopted: received-review committed its fixes', artifacts: { commit: head } });
    warnings.push(`received-review committed ${head} itself; adopted as the commit-fixes commit (R97)`);
    const subject = exec('git log -1 --format=%s HEAD', { cwd: wt });
    if (planFixSubject && subject !== null && subject !== planFixSubject) {
      warnings.push(`adopted commit subject "${subject}" differs from the plan fix subject "${planFixSubject}" (R103)`);
    }
    return { adopted: head, pending: null };
  }
  ```

  Call site 1, in `runAfter`:

  ```diff
     // R97: received-review committed its fixes itself; adopt that commit as commit-fixes.
     let adopted = null;
     if (after === 'dispatch_received_review' && result.success === true) {
  -    const rr = ledger.steps.find(s => s.name === 'received-review');
  -    const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
  -    if (rr && rr.fixBaseHead && head && head !== rr.fixBaseHead && exec('git status --porcelain', { cwd: resolveActiveWorktreeSafe() }) === '') {
  -      const cf = ledger.steps.find(s => s.name === 'commit-fixes');
  -      if (cf) Object.assign(cf, { status: 'completed', reason: 'adopted: received-review committed its fixes', artifacts: { commit: head } });
  -      warnings.push(`received-review committed ${head} itself; adopted as the commit-fixes commit (R97)`);
  -      adopted = head;
  -    }
  +    const a = adoptFixCommit(ledger, { flags, planFixSubject: planCommit.fixSubject, warnings });
  +    if (a.pending) return pendingStop(a.pending.pending, false, a.pending.commands); // R103
  +    adopted = a.adopted;
     }
     // R84/R95/R97: one transition for a completed commit-fixes, reached from commit-fixes or from adoption.
  ```

  Call site 2, the shared `stage_changes` / `stage_fixes` case in `pickNextStep`. A refused adoption leaves a clean tree, and today `unmetCondition('commit-fixes')` would then skip commit-fixes and ship the outside commit, so the committed-path branch runs first:

  ```diff
       case 'stage_changes':
       case 'stage_fixes': {
  +      // R103: committed fixes since fixBaseHead are checked (and adopted) before the clean-tree skip.
  +      if (id === 'stage_fixes') {
  +        const rr = entryOf('received-review');
  +        const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
  +        if (rr && rr.status === 'completed' && !isDone('commit-fixes') && rr.fixBaseHead && head && head !== rr.fixBaseHead) {
  +          const as0 = ledger.approvedScope;
  +          const ok0 = as0 && as0.round === (ledger.round || 1) && Array.isArray(as0.paths) ? as0.paths : [];
  +          const { outside } = stageScope(flags.planFile, resolveActiveWorktreeSafe(), ok0, rr.fixBaseHead);
  +          if (outside.length) return stageOutsidePending(outside);
  +          const a = adoptFixCommit(ledger, { flags, planFixSubject: ctx.planFixSubject || null, warnings });
  +          if (a.adopted) return { adopted: a.adopted, warnings }; // warnings: pickNextStep's per-step array
  +        }
  +      }
         if (id === 'stage_changes'
           ? !(entryOf('execute') && entryOf('execute').status === 'completed' && !isDone('commit'))
           : unmetCondition('commit-fixes', ledger) !== null) continue;
  ```

  `pickNextStep`'s context gains `planFixSubject`; `runAfter` handles the new `adopted` return before `pending`:

  ```diff
  -  const next = pickNextStep(from, { ledger, flags, steps, ledgerPath, recorded, skipped });
  +  const ctx = { ledger, flags, steps, ledgerPath, recorded, skipped, planFixSubject: planCommit.fixSubject };
  +  let next = pickNextStep(from, ctx);
  +  if (next.adopted) { // R103: stage_fixes adopted a clean committed fix
  +    warnings.push(...next.warnings);
  +    from = afterFixesCommitted(ledger, { sha: next.adopted, round, flags, warnings }) || 'dispatch_commit_fixes';
  +    ctx.steps = steps = recomputeSteps();
  +    next = pickNextStep(from, ctx);
  +  }
     if (next.error) return failStep(next.error);
     if (next.pending) return pendingStop(next.pending, false, next.commands);
  ```

  Stepper `tests/promptfoo/scripts/run-ship-stepper.js`:

  ```diff
  -function setPlanFiles(paths) {
  +function setPlanFiles(paths, { fixSubject = null } = {}) {
     if (!paths.length) return;
     const files = paths.map(p => `- Modify: \`${p}\``).join('\n');
  -  fs.writeFileSync(path.join(projectRoot, 'plan.md'), `# Add widget support\n\n## Tasks\n\n...`);
  +  const header = fixSubject ? `**Fix commit:** \`${fixSubject}\`\n\n` : '';
  +  fs.writeFileSync(path.join(projectRoot, 'plan.md'), `# Add widget support\n\n${header}## Tasks\n\n...`);
  @@ case 'rounds-self-commit'
  -    if (fixes && !selfCommit) setPlanFiles(['fix.txt']); // the fixes are inside the plan Files (R83)
  -    else {
  +    if (fixes) setPlanFiles(['fix.txt'], { fixSubject: process.argv.includes('--fix-subject') ? 'fix(#1): widget - review fixes' : null }); // R83/R103
  +    if (!fixes || selfCommit) {
         fs.writeFileSync(path.join(projectRoot, '.gitignore'), '.sdlc/\n');
         sh('git add -A && git commit -q -m "fixture: clean tree"');
       }
  @@ function reviewRound
     if (selfCommit) {
  -    sh('git add fix.txt && git commit -q -m "fixture: received-review commits its fixes"');
  +    const extra = selfCommitOutside ? (fs.mkdirSync(path.dirname(path.join(projectRoot, selfCommitOutside)), { recursive: true }), fs.writeFileSync(path.join(projectRoot, selfCommitOutside), 'x\n'), ` ${selfCommitOutside}`) : '';
  +    sh(`git add fix.txt${extra} && git commit -q -m "fixture: received-review commits its fixes"`);
       headAfter = sh('git rev-parse HEAD').stdout.trim();
     }
  ```

  and, after the `rounds-self-commit` loop, the `--resume-after-outside` sequence:

  ```js
  if (selfCommit && selfCommitOutside && process.argv.includes('--resume-after-outside')) {
    after('confirm_pipeline', 'results/yes.json');           // resume before the revert: stops again
    snapshots.push(snap());
    sh(`git rm -q ${selfCommitOutside} && git commit -q -m "fixture: revert outside path"`);
    after('confirm_pipeline', 'results/yes.json');           // resume after the revert: stage_fixes adopts
    snapshots.push(snap());
  }
  ```

  where `selfCommitOutside` is read from `--self-commit-outside <path>` in the argument loop. Each new flag gets a line in the header comment block.

  New dataset cases after `ship-self-commit: (b)`; all use `--project-root {{project_root}} --scenario rounds-self-commit --seed frozen --summary high-1.json` plus:

  | description | extra script_args |
  |---|---|
  | `ship-self-commit: (c) a committed path outside the plan Files refuses adoption with stageOutsideFiles` | `--self-commit-outside src/unrelated.js` |
  | `ship-self-commit: (d) a subject that differs from the plan fix subject warns and still adopts` | `--fix-subject` |
  | `ship-self-commit: (e) a resume stops again until the outside path is reverted, then stage_fixes adopts` | `--self-commit-outside src/unrelated.js --resume-after-outside` |

- names: `stageScope`, `adoptFixCommit`, `stageOutsidePending`, `diffFailed`, `--self-commit-outside`, `--fix-subject`, `--resume-after-outside`.
- mirror: R94 `approvedScope` read in the `stage_fixes` case; case style `ship-self-commit: (a)` in `ship-prepare-exec.yaml`.
- decisions: subject mismatch warns (Decisions taken without the owner); refused adoption reuses `stageOutsideFiles` (Key Decisions).
- sync: R103 wording in `docs/specs/ship-sdlc.md` (Task 1).

### Task 3: ship.js — resume after an open final check (R104) and no learnings push with --no-push, with exec cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `finalCheckStop` sets `handoff`; R104 block in `runAfter`; `learningsCommitCommand(noPush)` replaces the constant
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--fc-resume fix|again|twice` on `rounds-final-check`; `--no-push` seed patch
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — new cases `ship-final-check: (g)`, `(h)`, `(i)` and `ship-lean: (learnings) c`

**Notes:** The learnings change is bundled here on purpose: it edits the same three files as R104, and one task per shared file per wave (F-43) would otherwise add a fourth serial wave for a five-line change. It runs after Task 2 for the same reason.

**Acceptance criteria:**
- [ ] (g) After `final-check-open`, a new fix commit and `--after confirm_pipeline`: the envelope is `dispatch_review` whose invocation has `--committed --base <old finalCheck.commit>`; the snapshot shows `finalCheck.status: "pending"`, `base` = old commit, `commit` = new HEAD, `recheck: 1`; answering that review with the medium summary again ends with `final-check-open`, and exactly one `dispatch_review` was emitted after the resume.
- [ ] (h) Without a new commit, `--after confirm_pipeline` returns `done` with `ext.reason: "pending-question"`, `pendingQuestion.id: "finalCheckOpen"`, options `["fix","accept-open"]`; no `dispatch_version`.
- [ ] (i) A second `--after confirm_pipeline` without a new commit emits `dispatch_version` and a warning containing `open findings accepted (R104)`; the snapshot shows `finalCheck.accepted: true` and no `handoff`.
- [ ] (learnings c) With `noPush` in the ledger flags, the `learnings_commit` command contains `git commit` and no `git push`; `ship-lean: (learnings) b` still passes.
- [ ] `ship-final-check:` cases (a)-(f) still pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-final-check|learnings|ship-self-commit"` passes.

**Contract:**
- shape (code): `ledger.finalCheck` transitions added by R104:

  | from | event | to |
  |---|---|---|
  | `completed`, `open` non-empty, `--auto` | R95 stop (`finalCheckStop`) | same + `handoff: true` |
  | `handoff: true`, HEAD ≠ `commit` | `--after confirm_pipeline` | `{ base: old.commit, commit: HEAD, status: 'pending', verdict: null, open: [], recheck: (old.recheck or 0) + 1 }`; review entry `pending`; emit `dispatch_review` |
  | `handoff: true`, HEAD = `commit`, `asked` not true | `--after confirm_pipeline` | same + `asked: true`; pending question `finalCheckOpen` |
  | `handoff: true`, HEAD = `commit`, `asked: true` | `--after confirm_pipeline` | same + `accepted: true`, `handoff` deleted; warning; continue |

  `finalCheckStop`:

  ```diff
     const finalCheckStop = () => {
  +    ledger.finalCheck.handoff = true; // R104: the next resume re-checks or asks
       ledger.paused = { at: new Date().toISOString(), reason: 'final check open' };
  ```

  R104 block, inserted directly above `// R97: received-review committed its fixes itself; adopt that commit as commit-fixes.`:

  ```js
  // R104: a resume after final-check-open reviews a new fix commit once, or asks, then accepts.
  const fc = ledger.finalCheck;
  if (after === 'confirm_pipeline' && fc && fc.handoff === true && fc.status === 'completed' && Array.isArray(fc.open) && fc.open.length > 0) {
    const head = exec('git rev-parse HEAD', { cwd: resolveActiveWorktreeSafe() });
    if (head && head !== fc.commit) {
      ledger.finalCheck = { base: fc.commit, commit: head, status: 'pending', verdict: null, open: [], recheck: (fc.recheck || 0) + 1 };
      const i = ledger.steps.findIndex(s => s.name === 'review');
      if (i >= 0) {
        const fresh = { name: 'review', status: 'pending' };
        if (ledger.steps[i].condition) fresh.condition = ledger.steps[i].condition;
        ledger.steps[i] = fresh;
      }
      from = 'dispatch_commit';
      steps = recomputeSteps(); // the review args carry --base <old commit>
    } else if (fc.asked !== true) {
      fc.asked = true;
      return pendingStop({
        id: 'finalCheckOpen', open: fc.open, options: ['fix', 'accept-open'],
        prompt: `The final fix review left ${fc.open.length} finding(s) open at ${fc.threshold || 'the threshold'}. Commit a fix and resume to review it, or resume again without a new commit to accept them.`,
      }, false);
    } else {
      fc.accepted = true;
      delete fc.handoff;
      warnings.push('final check: open findings accepted (R104)');
    }
  }
  ```

  Learnings command:

  ```diff
  -const LEARNINGS_COMMIT_COMMAND ='git diff --quiet -- .sdlc/learnings/log.md || { git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings" && { git push --set-upstream origin HEAD || echo "push failed (non-fatal)" >&2; }; }';
  +// ship R36/A16: with --no-push the learnings commit stays local.
  +function learningsCommitCommand(noPush) {
  +  const commit = 'git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings"';
  +  return noPush
  +    ? `git diff --quiet -- .sdlc/learnings/log.md || { ${commit}; }`
  +    : `git diff --quiet -- .sdlc/learnings/log.md || { ${commit} && { git push --set-upstream origin HEAD || echo "push failed (non-fatal)" >&2; }; }`;
  +}
  @@ case 'learnings_commit':
  -        data = { commands: [LEARNINGS_COMMIT_COMMAND] };
  +        data = { commands: [learningsCommitCommand(flags.noPush === true)] };
  ```

  Grep `LEARNINGS_COMMIT_COMMAND` for any other use (module exports included) and update each.

  Stepper, seed patch:

  ```diff
       if (reviewThreshold) data.flags.reviewThreshold = reviewThreshold;
  +    if (process.argv.includes('--no-push')) data.flags.noPush = true; // A16 (learnings c)
       if (process.argv.includes('--no-tag')) {
  ```

  and after the `rounds-final-check` loop (`fcResume` read from `--fc-resume <mode>` in the argument loop):

  ```js
  const lastEnv = calls[calls.length - 1].envelope;
  if (scenario === 'rounds-final-check' && fcResume && lastEnv.ext && lastEnv.ext.reason === 'final-check-open') {
    if (fcResume === 'fix') {
      fs.appendFileSync(path.join(projectRoot, 'fix.txt'), 'final fix\n');
      sh('git add fix.txt && git commit -q -m "fixture: main session fixes the open findings"');
    }
    let c = after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap());
    if (fcResume === 'fix' && c.status === 'step' && c.step.id === 'dispatch_review') {
      writeSummary(true);
      after('dispatch_review', 'results/review-approved.json'); snapshots.push(snap());
    }
    if (fcResume === 'twice') { after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap()); }
  }
  ```

  New dataset cases after `ship-final-check: (f)`; all use `--project-root {{project_root}} --scenario rounds-final-check --seed frozen --summary high-1.json --final-summary medium-1.json --review-threshold medium` plus:

  | description | extra script_args |
  |---|---|
  | `ship-final-check: (g) a resume after a fix commit re-arms the final check once` | `--fc-resume fix` |
  | `ship-final-check: (h) a resume without a new commit stops with finalCheckOpen` | `--fc-resume again` |
  | `ship-final-check: (i) a second resume without a new commit accepts the open findings` | `--fc-resume twice` |

  and after `ship-lean: (learnings) b`: `ship-lean: (learnings) c with --no-push the learnings commit does not push`, args `--project-root {{project_root}} --scenario after-pr --seed frozen --result results/pr-ok.json --gh-pr-url https://example/pr/1 --no-push`; assertion: the command includes `git commit` and does not include `git push`.
- names: `finalCheck.handoff`, `finalCheck.asked`, `finalCheck.accepted`, `finalCheck.recheck`, `finalCheckOpen`, `learningsCommitCommand`, `--fc-resume`, `--no-push`.
- mirror: `afterFixesCommitted` review reset loop; `pendingStop`; case style `ship-final-check: (f)`.
- decisions: accept-open is a second resume; the rule applies whatever `--auto` says on resume (Decisions taken without the owner).
- sync: R104, R36, A16 wording in `docs/specs/ship-sdlc.md` (Task 1).

### Task 4: User reference doc and site metadata

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — `### Review rounds` paragraph 2 and the `--no-push` flag row
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`)
- Modify: `site/src/data/skills-meta.ts` — `final-check` node description gains the resume re-check

**Acceptance criteria:**
- [ ] `docs/skills/ship-sdlc.md` says: an adopted fix commit with a path outside the plan Files stops with the outside-files question; a resume after `final-check-open` reviews a new fix commit once, or asks `fix` / `accept-open` and accepts on a second resume without a commit; `--no-push` also keeps the learnings commit local.
- [ ] The `Ignored learnings log (R36)` bullet no longer says the learnings commit is always pushed: its push sentence ends with `, unless the run has --no-push (A16)` (wrapped in backticks as the file does).
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): in `docs/skills/ship-sdlc.md`, `### Review rounds`, second paragraph:

  ```diff
  -... then run `/sdlc:ship-sdlc --resume --auto`. A fix commit that received-review made itself is adopted as the commit-fixes commit (R97). See `docs/specs/ship-sdlc.md` R95–R97.
  +... then run `/sdlc:ship-sdlc --resume --auto`. When you resume with a new commit, ship reviews that commit once more; without a new commit it asks `fix` or `accept-open`, and a second resume without a commit accepts the open findings (R104). A fix commit that received-review made itself is adopted as the commit-fixes commit (R97) only when every path it changed is in the plan Files; otherwise the run stops with the outside-files question (R103). See `docs/specs/ship-sdlc.md` R95–R97, R103 and R104.
  ```

  Flag table row:

  ```diff
  -| `--no-push` | Forwarded to version-sdlc as `--no-push`. | Off |
  +| `--no-push` | Forwarded to version-sdlc as `--no-push`; the learnings commit is not pushed either. | Off |
  ```

  `site/src/data/skills-meta.ts`, `final-check` node description: append `; a resume after that stop reviews a new fix commit once, or asks fix / accept-open (R104)` before the closing `'`, keeping the escaped quote style of the line.
- names: `### Review rounds`, `--no-push`, `final-check`.
- mirror: existing R95/R97 sentence in `### Review rounds`.
- decisions: user-facing prose only; spec ids cited.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.

### Task 5: ship-sdlc skill companions

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — the rounds paragraph after the step table: adoption in scope (R103), resume re-check (R104)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `finalCheck` row (handoff, asked, accepted, recheck) and `fixBaseHead` row (R103)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — `learnings_commit` step 3: no push with `--no-push`
- Create: `docs/plans/2026-11-13-lean-w14-ship-adoption-scope.md`

**Notes:** SKILL.md Step 5 already prints any `pending-question` with its options and commands, so `finalCheckOpen` and a refused adoption need no new handling; only the descriptive rounds paragraph changes. `agents/ship-step-received-review.md` already forbids `git commit` and needs no change.

**Acceptance criteria:**
- [ ] `state-format.md` lists `handoff`, `asked`, `accepted`, `recheck` on `finalCheck`, and R103 on `fixBaseHead`.
- [ ] `reference.md` says the learnings step does not push with `--no-push`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): `SKILL.md`, rounds paragraph:

  ```diff
  -... A fix commit made by received-review itself is adopted as the commit-fixes commit (R97). Nothing changes in Step 5: run whatever step `ship.js` emits.
  +... A fix commit made by received-review itself is adopted as the commit-fixes commit when its paths are in the plan Files (R97, R103); a resume after `final-check-open` re-reviews a new fix commit once (R104). Nothing changes in Step 5: run whatever step `ship.js` emits.
  ```

  `reference.md`, `## learnings_commit — final step`, step 3, after the line about the push target:

  ```diff
     The push goes to the branch's own name, also when its upstream names another branch, such as a worktree branch that tracks `origin/main` (ship R36).
  +   With `--no-push` (ship A16) the step commits and does not push.
  ```

  `state-format.md`: append to the `finalCheck` row text `R104 adds \`handoff\` (set by the final-check-open stop), \`asked\` (the finalCheckOpen question was asked), \`accepted\` (open findings accepted on resume) and \`recheck\` (count of re-armed checks).`; append to the `fixBaseHead` row `R103 checks the paths committed since it before adopting.`
- names: rounds paragraph, `learnings_commit — final step`, `finalCheck`, `fixBaseHead`.
- mirror: existing R95/R97 prose in each file.
- decisions: descriptive text only; no new SKILL.md instruction.
- sync: none beyond the spec (Task 1).

## Final Shape

When all tasks are done:

- The ship spec has two new rules. R103 keeps adopted fix commits inside the plan's file list. R104 says what a resume does after an open final check.
- `ship.js` checks committed paths, not only uncommitted ones, before it adopts a fix commit. An out-of-scope path stops the run with the question the user already knows.
- A resume after `final-check-open` either reviews the new fix commit once, or asks once and then accepts on the next resume.
- `--no-push` keeps every commit local, the learnings commit included.
- The exec suite has seven new cases and the existing self-commit and final-check cases still pass.
- Follow-up only (not in this plan): turning `runAfter`'s transitions into a table.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 R97 self-commit adoption runs the R83/R94 plan-Files scope check on fixBaseHead..HEAD; outside path refuses with stageOutsideFiles; subject mismatch warns/stops; exec cases (ship-self-commit:) | Task 1, Task 2 | covered |
| 2 Resume after final-check-open re-arms final check once or stops with pendingQuestion (accept-open / fix); no loop; exec cases (ship-final-check:) | Task 1, Task 3 | covered |
| 3 learnings_commit omits push when flags.noPush; spec A16 says so; exec case | Task 1, Task 3 | covered |
| 4 Spec first (R97, R95, A16 or new ids); update docs/skills/ship-sdlc.md and site copies | Task 1, Task 4, Task 5 | covered |
| 5 Out of scope: github-sdlc, shared libs/guards, lean orchestration skill, runAfter refactor, headless/behavioural runs | — | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
