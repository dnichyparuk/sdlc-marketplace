# Ship and Execute Runtime Fixes (M4a) Implementation Plan

**Commit:** `fix(#9364): ship, execute - git upstream, hand-back key, write guard`
**Goal:** Fix seven runtime defects in the ship and execute pipelines: git helpers that create sha branches and push to the wrong upstream, ship.js checks that read a failed `git status` as clean, a silent `ship.stepModels` gap, a stale hand-back rule keyed on the wrong thing, write-guard bypasses, contradictory wave-wait prose and two leaky test fixtures. The eighth defect (step agents that lose their arguments, ship R99, ledger F-63) shipped in the separate wave #9366.
**Architecture:** Spec first: each behaviour change is written into its spec (ship R98, R90; execute R90, R92; review R19 new; pr R19 new; version P13) before or inside the task that implements it. Script fixes stay small and local (lib/git.js, skill/ship.js, hooks/worker-write-guard.js); prose fixes are one sentence each; every fix is proven by an exec-only promptfoo case or a sentinel check.
**Source:** conversation context (wave M4a brief, tracking id #9364)
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

The root problem: several ship and execute runtime paths silently do the wrong thing when an input is not what they expect. They do not fail loudly.

- `fetchBaseRef` fetches `origin <base>:<base>` even when the base is a commit sha. This creates a local branch named after the sha.
- `getRemoteState` reports an upstream for a branch that tracks `origin/main` (herdr worktree branches). Version and PR then run a bare `git push`, which is refused (or, with `push.default=upstream`, pushes to main).
- ship.js reads a failed `git status` (null) as a clean tree.
- A `ship.stepModels` entry with only unknown keys is dropped silently.
- Ship R98 keys a stale hand-back on the ledger, which the session must not read, and a late round-1 review hand-back can match the current step.
- The worker write guard misses `&>`, fd-numbered redirects and `..` escapes.
- The execute wait prose names a `wave-progress --read` poll and an undefined "keep waiting" branch.
- Two test fixtures are not isolated.

**What prompted this change now?**

Wave M4a of the lean programme. An isolated Opus architect validated the item list at origin/main 4c7fff3 on 2026-11-12. Item 1 (F-63, step agents without arguments) was seen in a live ship run (subagent `agent-a190b6ab38df268ab`); on the owner's request (2026-11-12) it shipped earlier as the separate wave #9366 (ship R99, the six step-agent sentences, the R99 args sentinel).

**Assumption:** this plan assumes #9366 has merged: R99 already exists in `docs/specs/ship-sdlc.md`, the six `agents/ship-step-*.md` carry the R99 sentence, and `check-handback-sentinels.js` already has the `ARGS`/`stepArgs` sentinel and the case description names R99.

**What does success look like?**

- A sha base creates no `refs/heads/<sha>`.
- A worktree branch that tracks `origin/main` pushes with `-u origin <branch>`.
- Each item has an exec case or sentinel that fails before the fix and passes after it.

**Who fails if this ships wrong (blast radius):** every consumer project that runs `/ship-sdlc` (review, version and PR steps), every execute worker (write guard) and the exec test suite. A wrong git.js change breaks review.js, pr.js and version.js together.

## Research Findings

All items were re-verified at HEAD 4c7fff3. Exploration ran through the discovery brief (`/tmp/sdlc-explore-main-24Yl2e/discovery-brief.md`, findings `F-<dimension>-<n>`) plus inline reads.

- **Step agents (item 1, shipped in #9366).** All six `agents/ship-step-*.md` have `skills: [sdlc:<skill>]` and line 9 "Follow the preloaded … skill, using the arguments given in the task message." Nothing says how `$ARGUMENTS` gets its value (F-ship-step-agent-args-and-handback-sentinels-1). The skills use `$ARGUMENTS` in their prepare commands: `review-sdlc/SKILL.md:23`, `commit-sdlc:42`, `version-sdlc:42`, `pr-sdlc:104`, `execute-plan-sdlc:50`, `received-review-sdlc:133`. Wave #9366 added ship R99 and the args sentence; this plan does not touch them (F-…-2).
- **Sentinel checker.** `tests/promptfoo/scripts/check-handback-sentinels.js` has only a presence helper `has()`. The ship stale check at line 40 tests only the `**Stale hand-backs (R98).**` heading (F-…-6). Its single case is `execute-plan-sdlc/handback:` in `execute-plan-sdlc-dispatch-resilience-exec.yaml` (F-…-7).
- **git.js (item 2).** `fetchBaseRef` (git.js:199-205) always runs `git fetch --quiet origin <base>:<base>` (F-git-lib-sha-base-and-upstream-guard-1). `getRemoteState` (git.js:981-1001) returns `hasUpstream: true` for any upstream and never compares names (F-…-2). `pushToRemote` then runs a bare `git push` (F-…-3). Callers: review.js:607, pr.js:436-446 and 488, version.js:990-996, and the bare push in version-sdlc SKILL.md:259-261 (F-…-4, F-…-5). Tests run through `tests/promptfoo/scripts/git-lib-test.js` ops. The `tagListVariants` op builds a temp repo in `os.tmpdir()` — that is the precedent for the new ops (F-…-7).
- **ship.js (item 3).** `exec()` returns trimmed stdout, or null on failure (git.js:40-57; F-ship-js-adoption-and-stepmodels-validation-1). Adoption at ship.js:2708 uses `!exec('git status --porcelain', …)` (F-…-2). `unmetCondition` at ship.js:1886 uses `exec(…) ? null : 'no working-tree changes after received-review'` (F-…-3). `resolveStepModels` (ship.js:230-259) checks only `Object.keys(v).length === 0` and drops an empty entry silently at :255 (F-…-4). The JSON schema already forbids unknown entry keys (F-…-9), but prepare does not use the schema. The R97 adoption case is `ship-self-commit: (a)`, driven by `tests/promptfoo/scripts/run-ship-stepper.js` scenario `rounds-self-commit` (F-…-8). The stepper already writes a stub `gh` into a temp `stubDir` and puts it first on PATH (run-ship-stepper.js:171-175).
- **R98 (item 4).** The spec is at docs/specs/ship-sdlc.md:215 and the skill at ship SKILL.md:280. Both key on "ledger entry is already `completed`…" (F-ship-step-agent-args-and-handback-sentinels-3, -4).
- **Write guard (item 5).** The redirect regex `/(^|[^0-9&>])>>?(?!&)[ \t]*(\S*)/g` skips `&>`, `&>>`, `2>`, `1>>`. `ALLOWED_TARGET_RE` is a prefix test with no normalization. All four bypasses reproduce at HEAD; `2>&1`, `>&2` and quoted `>` are allowed (checked with `classifyCommand`). The dead ternary is at :43 (F-worker-write-guard-redirect-bypasses-1..3). Existing cases are (a)-(i) in `worker-write-guard-exec.yaml`, run by `promptfooconfig-exec-hooks.yaml` (F-…-5). `hooks/README.md:7` describes the guard (F-…-8).
- **Wave wait (item 6).** wave-runner-template.md:207 still says "The only `state/execute.js` call you make is the `wave-progress --read` poll in §2b". That contradicts :84 and :94. SKILL.md:390 and template:98-100 still say "when it fails again keep waiting for the worker returns until the deadline". The discovery brief missed :207 (F-execute-wave-wait-prose-and-fixture-hygiene-1). The inline grep found it. Spec R92 (execute spec :205) has no branch for a failed retry (F-…-3).
- **pr case (f) (item 7).** The case sets `SDLC_STATE_DIR_OVERRIDE` to `{{project_root}}`. That is also the worktree, so the state-dir branch at pr.js:571 is never isolated (F-…-6). `script_env` substitutes only `{{project_root}}` (extract-skill-content.js:95-108). `writeOutput` writes the manifest under `<state dir>/out/`, so the override must point inside the temp fixture copy, not into the repo.
- **Fixture planPath (item 8).** Five state files under `fixtures-fs/execute-state-mid-wave` use `/tmp/<name>-plan.md`: ctx-alpha (main and `gc-swept/`), live-flags, resume-idem, resume-mixed (F-…-7). Only `wave-start` reads `planPath` (state/execute.js:444, `readPlanVerification`). A relative path resolves against the main worktree root, then the cwd.
- **Site mirrors.** `site/src/content-source/specs/*.md` and `site/src/content-source/skills/*.md` are byte copies. All are currently identical to `docs/`.
- **Build and test commands.** Exec-only promptfoo: `promptfooconfig-exec.yaml` (script-runner) and `promptfooconfig-exec-hooks.yaml` (hook-runner), `-j 1`. Validators: check-consistency.js, check-docs-consistency.js, validate-spec-shape.js `--strict`, validate-cost-tiers.js, validate-discovery.js.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item 6 scope | no | edits the spec R92, SKILL.md:390, template :98-100 and :207 | the discovery brief said the template was already aligned; the inline grep shows :207 and the "keep waiting" text still at HEAD, so the item stands |
| Item 7 isolation | no | adds a new fixture whose git repo is a `repo/` subdirectory, with the state dir as a sibling `state/` | the override must be outside the worktree and inside the temp fixture copy (pr.js writes its manifest under the state dir); `script_env` cannot reference `{{repo_root}}` |
| Item 8 siblings | no | rewrites all five `/tmp/*-plan.md` planPaths, not only ctx-alpha | the brief asks to check the siblings; they have the same pattern and only wave-start reads the field |
| Git spec ids | no | adds new ids review R19 and pr R19 and amends version P13 | the brief asks for "one line each"; the next free numeric ids keep ids stable |
| PR linking | no | names #9364 in the PR body with no `Fixes`/`Closes` keyword | tracking ids are internal register ids, not GitHub issues (project notes); this overrides the `pr-link-github-issue` guardrail |
| Optional execute.js items (77-L2, usage text) | no | not done | execute.js is not opened by any task |
| Tests for git-status failure | no | adds a `--git-status-fail` switch to run-ship-stepper.js (a shim `git` that fails `status` only while a flag file exists) | no fixture can make `git status` fail; the stepper already owns a stub bin dir |

### Decisions taken without the owner

- **R92 failed-retry branch:** follows the architect's strong decision. Each failed call is retried once, the loop repeats the call, and when the deadline passes the run goes to step 4 (TaskStop the in-flight tasks, wave partial). There is no "keep waiting" outside the call.
- **Commit-fixes reason on a failed `git status`:** `unmetCondition` returns `git status failed after received-review`, so commit-fixes is skipped with that reason. The alternative was to fail the step; the brief asks only for the message.
- **stepModels error text:** keeps the existing message `ship.stepModels.<step> must be an object with model and/or effort.` for an entry with neither key. Adds `ship.stepModels.<step>.<key>: unknown key; expected model or effort.` for each unknown key.
- **Sha-base detection:** a base that matches `/^[0-9a-f]{7,40}$/` and has no `refs/heads/<base>` skips the fetch. A real branch with a hex name still fetches.
- **Upstream name rule:** the upstream counts only when its branch part (after the first `/`) equals `git branch --show-current`. A detached HEAD counts as no upstream.
- **Spec mirrors:** each spec file is copied to `site/src/content-source/` by the task that edits it (ship, execute), or by a final sync task (review, pr, version), with `cp`.

## Key Decisions

- **Key stale hand-backs on the Agent task, not on the ledger.** The ship session knows which Agent task it started for the current `dispatch_*` envelope. A hand-back from any other task is stale. This also covers a late round-1 review hand-back when R84 or R95 dispatches review again. The ledger clause is dropped because the session must not read the ledger.

- **Upstream counts only when the names match.** A branch that tracks `origin/main` is treated as having no upstream. Then pr.js and version-sdlc take the existing `push -u origin <branch>` path, which also re-points the upstream. No new push path is added. Workspace mode: both `branch` and `worktree` mode run the same git calls in the active worktree cwd, so the rule is the same in both. The herdr worktree case is the one it fixes.

- **Normalize redirect targets before the prefix test.** `path.posix.normalize` turns `/tmp/../home/a.js` into `/home/a.js`, and the prefix test then denies it. This is simpler than parsing `..` segments by hand. The hook stays a best-effort guard; R87 is still the rule.

- **Two ship.js tasks in a chain.** The stepModels fix and the git-status fix both change ship.js and ship-prepare-exec.yaml. They run one after the other (Task 8, then Task 9), so each shared file has one writer per wave (F-43).

- **One owner for the sentinel checker.** Items 4 and 6 both add sentinels. Task 6 owns `check-handback-sentinels.js` and runs after the prose tasks. The item-1 R99 args sentinel shipped in #9366.

- **Smallest viable cut.** Every task maps to one brief item. There are no extra tasks. The spec tasks (1, 2, 3) and the mirror sync (13) are required by the spec-first rule.

**Non-goals (intentionally not built):**

- ship R99 and the step-agent args sentence (item 1, ledger F-63): shipped in the separate wave #9366;
- the wave M4b prose items (received-review R34, plan-sdlc R71(d), ship docs M-20, the 3b fence, the setup doc count);
- jira-sdlc and lib/mcp-failure.js (wave M3);
- the GitHub skill;
- execute.js 77-L2 and its usage text;
- commit.js `@{upstream}` merge-base and ship.js's own bare `git push` (F-git-lib-sha-base-and-upstream-guard-5, out of the brief);
- any behavioural or headless run.

## Contract Examples

**code** (Task 7):

```markdown
**Contract:**
- shape (code): `fetchBaseRef(base: string, projectRoot: string): void` returns early when `base` matches `/^[0-9a-f]{7,40}$/` and `git rev-parse --verify --quiet refs/heads/<base>` exits non-zero; `getRemoteState(projectRoot)` returns `{ hasUpstream: false, remoteBranch: null, isAhead: false, isBehind: false }` when the upstream's branch part differs from `git branch --show-current`.
- names: `fetchBaseRef`, `getRemoteState`, ops `fetchBaseRefSha`, `remoteStateTracking`.
- mirror: `tagListVariants` op at `tests/promptfoo/scripts/git-lib-test.js:213-250`.
- decisions: see Key Decisions (upstream name rule).
- sync: review.js:607, pr.js:436-446/488, version.js:990 consume these helpers unchanged.
```

**docs** (Task 8, docs/skills/ship-sdlc.md):

```markdown
**Contract:**
- shape (docs): MODIFY the `ship.stepModels` paragraph of `docs/skills/ship-sdlc.md` (audience: end users); last sentence lists the new error cases.
- names: paragraph starting "`ship.stepModels` lives in `.sdlc/local.json`".
- mirror: the same paragraph's current wording.
- decisions: user-facing wording only.
- sync: `site/src/content-source/skills/ship-sdlc.md` byte copy.
```

**openspec / spec** (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY `R98` and `R90` in `docs/specs/ship-sdlc.md`.
- names: `R98`, `R90` (modified).
- mirror: R97/R98 block style at `docs/specs/ship-sdlc.md:213-216`.
- decisions: ids never renumbered; R99 (from #9366) unchanged.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy.
```

## Tasks

### Task 1: Ship spec — R98 and R90 amended

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — rewrite R98, amend R90
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec

**Notes:**
Brief items 3b and 4 (F-ship-step-agent-args-and-handback-sentinels-3; F-ship-js-adoption-and-stepmodels-validation-6). Spec first: Tasks 4 and 8 implement these ids. R99 already exists (wave #9366) and is not changed.

**Acceptance criteria:**
- [ ] R99 (added by #9366) and its appendix row are unchanged.
- [ ] R98 no longer contains "ledger entry is already"; it keys staleness on the Agent task of the current `dispatch_*` envelope.
- [ ] R90 names an unknown key inside an entry and an entry with neither `model` nor `effort` as errors.
- [ ] `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` was run after the last edit; `diff -q` of the two files prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY R98 and R90 as rendered below; no new id.
- names: `R98`, `R90`.
- mirror: R97/R98 style at `docs/specs/ship-sdlc.md:213-216`.
- decisions: R98 drops the ledger clause (Key Decisions).
- sync: Task 4 (ship SKILL.md) and Task 8 (ship.js) implement these ids.

R98 before → after:

```diff
- - R98: Stale hand-backs. A hand-back report or task notification that arrives for a step whose ledger entry is already `completed`, `skipped` or `failed`, or from an agent of a step that is not the current `dispatch_*` step, is stale: the ship session prints …
+ - R98: Stale hand-backs. The ship session keys each hand-back on the Agent task it started for the current `dispatch_*` envelope (the last envelope it received). A hand-back report or task notification from any other Agent task is stale: one of an earlier step, or an earlier dispatch of the same step (a round-1 `dispatch_review` when R84 or R95 dispatches review again). The ship session prints one line `ignored stale hand-back for <step>` and makes no Agent call, no `--after` call and no re-run for it. Stale reports come from harness delivery, which the plugin does not control.
```

R90 sentence changes:

```diff
- Each value is `{ model?, effort? }` with at least one key; …
+ Each value is `{ model?, effort? }` with at least one of `model` and `effort` and no other key; …
- An unknown step key, a non-object value or an invalid model or effort is a prepare `errors[]` entry naming the key and the value.
+ An unknown step key, an unknown key inside an entry, an entry with neither `model` nor `effort`, a non-object value or an invalid model or effort is a prepare `errors[]` entry naming the key and the value.
```

### Task 2: Execute spec — R90 and R92 amended

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — amend R90 (redirect forms, normalization, best-effort) and R92 (failed-retry branch)
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy

**Notes:**
Brief items 5 and 6 (F-worker-write-guard-redirect-bypasses-6; F-execute-wave-wait-prose-and-fixture-hygiene-3). The R92 wording follows the architect's decision (Decisions taken without the owner).

**Acceptance criteria:**
- [ ] R90 lists `&>`, `&>>` and fd-numbered redirects, says a `>&N` duplication is allowed, says the target is normalized and a `..` escape is denied, and says the hook is a best-effort guard.
- [ ] R92 no longer allows any wait outside the call: a failed call is retried once, the call repeats, and past the deadline the run goes to the deadline step (TaskStop the in-flight tasks, wave `partial`).
- [ ] The site copy is byte-identical (`cp`, then `diff -q` prints nothing); `validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY R90 and R92 in place; no new id; appendix rows R90/R92 get `, #9364` appended.
- names: `R90`, `R92`.
- mirror: current R90/R92 wording at `docs/specs/execute-plan-sdlc.md:201-206`.
- decisions: Decisions taken without the owner (R92).
- sync: Tasks 5 and 10 implement them.

```diff
  R90: … write patterns: `sed -i`/`--in-place`, `perl -i`, `awk -i inplace`, `tee` into a path,
- `cat >`/`>>`, a heredoc redirect into a path, …
+ a `>`, `>>`, `&>` or `&>>` redirect into a path, also with an fd number before it (`2>`, `1>>`; a `>&N` duplication is not a write), a heredoc redirect into a path, …
- A redirect or `tee` target under `$TMPDIR`, `/tmp/` or `/dev/` is allowed.
+ A redirect or `tee` target is unquoted and normalized with `path.posix.normalize` before the test; it is allowed only when it then starts with `$TMPDIR/`, `${TMPDIR}/`, `/tmp/` or `/dev/`, so a `..` escape such as `/tmp/../home/a.js` is denied. The hook is a best-effort guard: R87 is the rule, and a write route the patterns miss is not denied.

  R92: …
- A call that exits non-zero or prints no JSON is retried once and is never treated as a timeout: `TaskStop` runs only after the deadline has passed, …
+ A call that exits non-zero or prints no JSON is never treated as a timeout: it is retried once, and then the call is repeated as above (each failed call is retried once). When the deadline has passed, the context goes to the deadline step: `TaskStop` on the tasks still in flight, wave `partial`. There is no other way to wait. `TaskStop` runs only after the deadline has passed, …
```

### Task 3: Git specs — review R19, pr R19, version P13

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/review-sdlc.md` — add R19 after `R-base-ref-fetch` (line 40) and an appendix row
- Modify: `docs/specs/pr-sdlc.md` — add R19 after `R-base-ref-fetch` (line 45) and an appendix row
- Modify: `docs/specs/version-sdlc.md` — amend P13 and add `, #9364` to its appendix trail

**Notes:**
Brief item 2 (F-git-lib-sha-base-and-upstream-guard-6). Mirrors are copied by Task 13.

**Acceptance criteria:**
- [ ] review R19 and pr R19 read as rendered below, each with an `Acceptance:` sub-bullet naming `git-lib:` exec cases.
- [ ] version P13 says `hasUpstream` is false also when the upstream branch name differs from the current branch.
- [ ] `validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD review `R19`, ADD pr `R19`, MODIFY version `P13`; appendix rows `| R19 | sha base skips the base fetch, #9364 |` (review) and `| R19 | upstream counts only on a matching branch name, #9364 |` (pr).
- names: review `R19`, pr `R19`, version `P13`.
- mirror: `R-base-ref-fetch` at `docs/specs/review-sdlc.md:40`.
- decisions: Decisions taken without the owner (sha detection, upstream name rule).
- sync: Task 7 implements; Task 13 mirrors.

```markdown
review-sdlc:
- R19: A sha base skips the base fetch. When `--base` matches `^[0-9a-f]{7,40}$` and no local branch `refs/heads/<base>` exists, `lib/git.js::fetchBaseRef` runs no fetch, so no `refs/heads/<sha>` branch is created; the diff uses the commit as given.
  - Acceptance: exec case `git-lib: fetchBaseRef with a sha base creates no branch`.

pr-sdlc:
- R19: Upstream name match. `lib/git.js::getRemoteState` reports `hasUpstream: true` only when the upstream's branch name (after `<remote>/`) equals the current branch; a branch that tracks another branch (for example `origin/main`) or a detached HEAD reports `hasUpstream: false`, so pr.js pushes with `git push -u origin <branch>`, never a bare `git push`.
  - Acceptance: exec case `git-lib: getRemoteState ignores an upstream with another branch name`.

version-sdlc P13 (after):
- P13: `remoteState` (object: `{ hasUpstream, remoteBranch }`) — upstream tracking state for current branch; `hasUpstream` is false when no upstream is configured or when the upstream's branch name differs from the current branch (pr-sdlc R19), so R15's `--set-upstream` push runs
```

### Task 4: Ship SKILL.md — R98 keyed on the Agent task

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — rewrite the `**Stale hand-backs (R98).**` paragraph (line 280)

**Notes:**
Implements the amended R98 (F-ship-step-agent-args-and-handback-sentinels-4).

**Acceptance criteria:**
- [ ] The paragraph reads as rendered below; the file no longer contains "ledger entry is already".
- [ ] The heading `**Stale hand-backs (R98).**` is unchanged, so the existing sentinel still matches.

**Contract:**
- shape (code): replace one paragraph.
- names: sentinel substring `the Agent task you start for each \`dispatch_*\` envelope`.
- mirror: execute R91 paragraph style at `skills/execute-plan-sdlc/SKILL.md:385`.
- decisions: drop the ledger clause (Key Decisions).
- sync: spec R98 (Task 1).

```diff
- **Stale hand-backs (R98).** A hand-back or task notification for a step whose ledger entry is already `completed`, `skipped` or `failed`, or from an agent of a step that is not the current `dispatch_*` step, is stale. Print one line `ignored stale hand-back for <step>` and do nothing else for it: no Agent call, no `--after` call, no re-run. Take the step status from the last envelope; do not read the ledger for it.
+ **Stale hand-backs (R98).** Note the Agent task you start for each `dispatch_*` envelope. A hand-back or task notification from any other Agent task is stale: one of an earlier step, or an earlier dispatch of the same step (a round-1 `dispatch_review` when review runs again under R84 or R95). Print one line `ignored stale hand-back for <step>` and do nothing else for it: no Agent call, no `--after` call, no re-run.
```

(The sentinel substring is "the Agent task you start for each `dispatch_*` envelope"; the paragraph's "Note the Agent task you start for each `dispatch_*` envelope" contains it.)

### Task 5: Execute wait prose — name the blocking call, drop "keep waiting"

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — step 2 of the wave deadline (line 390)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — §2b step 2 (lines 98-100) and the "What Wave-Runner Does NOT Do" bullet (line 207)

**Notes:**
Implements amended R92 (brief item 6; F-execute-wave-wait-prose-and-fixture-hygiene-1, -2, -3, plus the line-207 text the inline grep found). The template wraps step 2 across lines; keep its wrap style.

**Acceptance criteria:**
- [ ] Neither file contains `keep waiting for the worker returns`.
- [ ] wave-runner-template.md does not contain "`wave-progress --read` poll"; the line-207 bullet names the blocking `wave-progress --wait` call.
- [ ] The step-2 sentence is the same in both files (modulo line wrap).

**Contract:**
- shape (code): two sentence replacements, rendered below.
- names: `wave-progress --wait`, step 4.
- mirror: R92 text from Task 2.
- decisions: Decisions taken without the owner (R92).
- sync: SKILL.md step 2 and template §2b step 2 must say the same thing.

```diff
  (SKILL.md:390 and template:98-100, same sentence)
- … it is a failed call, not a timeout: read its stderr, retry it once with corrected arguments, and when it fails again keep waiting for the worker returns until the deadline; go to step 4 only when the deadline has passed.
+ … it is a failed call, not a timeout: read its stderr and retry it once with corrected arguments, then repeat the call as above (each failed call is retried once); when the deadline has passed, go to step 4.

  (template:207)
- The only `state/execute.js` call you make is the `wave-progress --read` poll in §2b;
+ The only `state/execute.js` call you make is the blocking `wave-progress --wait` call in §2b;
```

### Task 6: Sentinel checker — R98 key, wait prose

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 4, Task 5
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-handback-sentinels.js` — add a `lacks()` helper and the R98-key and wait-prose sentinels
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml` — rename the handback case description to add R98

**Notes:**
The single owner of the checker in this wave (Key Decisions; F-ship-step-agent-args-and-handback-sentinels-6, -7). The R99 `ARGS`/`stepArgs` sentinel from #9366 is already in the file and stays as is. The checker reads files by plain substring, so quoting rules (F-51) do not apply. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/handback"`

**Acceptance criteria:**
- [ ] The case `execute-plan-sdlc/handback:` passes at the end of this task.
- [ ] Restoring "ledger entry is already" in ship SKILL.md, or restoring "`wave-progress --read` poll" in the template makes `ok` false (checked by reading the code, not by editing the files).
- [ ] The JSON output adds the keys `shipStaleKey` and `waitNoReadPoll`; the existing `stepArgs` key (#9366) is kept.

**Contract:**
- shape (code): `function lacks(rel, strings)` → true when none of `strings` occurs (same read/exit-2 error handling as `has`). New constants and checks:
  ```js
  const shipStaleKey = has('skills/ship-sdlc/SKILL.md', ['the Agent task you start for each `dispatch_*` envelope'])
    && lacks('skills/ship-sdlc/SKILL.md', ['ledger entry is already']);
  const waitNoReadPoll = lacks('skills/execute-plan-sdlc/wave-runner-template.md', ['`wave-progress --read` poll', 'keep waiting for the worker returns'])
    && lacks('skills/execute-plan-sdlc/SKILL.md', ['keep waiting for the worker returns']);
  ```
  `ok` also ANDs `shipStaleKey && waitNoReadPoll`; the output JSON adds the two keys.
- names: `lacks`, `shipStaleKey`, `waitNoReadPoll`.
- mirror: the `workers` loop at `check-handback-sentinels.js:48-51`.
- decisions: presence and absence checks only; no new script.
- sync: case description changes from `execute-plan-sdlc/handback: R86/R87/R92/R99 sentinels present in skill, wave-runner, the ship step agents, ship-sdlc and the three workers` (#9366) to `execute-plan-sdlc/handback: R86/R87/R92/R98/R99 sentinels present in skill, wave-runner, the ship step agents, ship-sdlc and the three workers`.

### Task 7: lib/git.js — sha base skips fetch, upstream must match the branch

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/git.js` — `fetchBaseRef` sha guard; `getRemoteState` name check; doc comments
- Modify: `tests/promptfoo/scripts/git-lib-test.js` — ops `fetchBaseRefSha` and `remoteStateTracking`
- Test: `tests/promptfoo/datasets/git-lib-exec.yaml` — two cases

**Notes:**
Implements review R19 and pr R19 / version P13 (F-git-lib-sha-base-and-upstream-guard-1, -2, -7). Shared by review.js, pr.js and version.js, so their suites must stay green. The ops build bare-origin repos in `os.tmpdir()` like `tagListVariants`; no committed fixture. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(git-lib|pr-prepare|pr\.js|version-prepare|review-)"`

**Acceptance criteria:**
- [ ] `git-lib: fetchBaseRef with a sha base creates no branch` prints `RESULT: PASS`: after `fetchBaseRef(<40-hex sha of HEAD~1>, work)`, `git show-ref --verify --quiet refs/heads/<sha>` exits non-zero, and `fetchBaseRef('main', work)` does not throw.
- [ ] `git-lib: getRemoteState ignores an upstream with another branch name` prints `RESULT: PASS`: on `feat` tracking `origin/main`, `hasUpstream === false` and `remoteBranch === null`; on `same` pushed with `-u origin same`, `hasUpstream === true` and `remoteBranch === 'origin/same'`.
- [ ] The filtered run above passes (the existing git-lib, pr, version and review prepare cases still pass).

**Contract:**
- shape (code):
  ```diff
    function fetchBaseRef(base, projectRoot) {
  +   // review-sdlc R19: a sha base is not a branch; `<sha>:<sha>` would create refs/heads/<sha>.
  +   if (/^[0-9a-f]{7,40}$/.test(base)) {
  +     const isBranch = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${base}`], { cwd: projectRoot, encoding: 'utf8' });
  +     if (isBranch.status !== 0) return;
  +   }
      spawnSync('git', ['fetch', '--quiet', 'origin', `${base}:${base}`], { cwd: projectRoot, encoding: 'utf8' });
    }

    function getRemoteState(projectRoot) {
      const upstream = exec('git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null', { cwd: projectRoot });
      if (!upstream) return { hasUpstream: false, remoteBranch: null, isAhead: false, isBehind: false };
  +   // pr-sdlc R19: an upstream counts only when its branch name equals the current branch.
  +   const current = exec('git branch --show-current', { cwd: projectRoot });
  +   const slashAt = upstream.indexOf('/');
  +   const upstreamBranch = slashAt > 0 ? upstream.slice(slashAt + 1) : upstream;
  +   if (!current || upstreamBranch !== current) return { hasUpstream: false, remoteBranch: null, isAhead: false, isBehind: false };
      …
  ```
  Test ops (in `git-lib-test.js`, each in a `fs.mkdtempSync(os.tmpdir() + '/git-lib-…')` dir removed in `finally`): `git init -q --bare -b main origin.git`; `git init -q -b main work`; user/email/`commit.gpgsign false` config; two empty commits; `git remote add origin ../origin.git`; `git push -q origin main`; then the per-op steps. Print `RESULT: PASS` or `RESULT: FAIL <detail>` with `process.exitCode = 1`.
- names: ops `fetchBaseRefSha`, `remoteStateTracking`; descriptions as in the acceptance criteria.
- mirror: `tagListVariants` at `tests/promptfoo/scripts/git-lib-test.js:213-250`; case shape at `git-lib-exec.yaml:174-182`.
- decisions: Decisions taken without the owner (sha detection, name rule); same in branch and worktree mode (Key Decisions).
- sync: the usage comment at the top of `git-lib-test.js` lists the two new ops.

### Task 8: ship.js — stepModels rejects unknown and empty entries

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `resolveStepModels`
- Modify: `tests/promptfoo/fixtures-fs/project-ship-step-models-invalid/.sdlc/local.json` — add `"version": { "modle": "opus" }`
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case `ship-step-models: (g)` after case (f)
- Modify: `docs/skills/ship-sdlc.md` — the `ship.stepModels` paragraph (line 654)
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy

**Notes:**
Implements amended R90 (brief item 3b; F-ship-js-adoption-and-stepmodels-validation-4, -7). Cases (d) and (e) count exact messages, so the extra fixture entry does not break them. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-step-models"`

**Acceptance criteria:**
- [ ] Case (g) passes: `o.errors` contains exactly once each of `ship.stepModels.version.modle: unknown key; expected model or effort.` and `ship.stepModels.version must be an object with model and/or effort.`
- [ ] Cases (a)-(f) still pass.
- [ ] The docs paragraph's last sentence reads "An unknown step, an unknown key in an entry, an entry with neither `model` nor `effort`, or an invalid value stops prepare."; the site copy is byte-identical.

**Contract:**
- shape (code):
  ```diff
  -   if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length === 0) {
  +   if (v === null || typeof v !== 'object' || Array.isArray(v)) {
        errors.push(`ship.stepModels.${k} must be an object with model and/or effort.`);
        continue;
      }
  +   for (const key of Object.keys(v)) {
  +     if (key !== 'model' && key !== 'effort') errors.push(`ship.stepModels.${k}.${key}: unknown key; expected model or effort.`);
  +   }
  +   if (v.model === undefined && v.effort === undefined) {
  +     errors.push(`ship.stepModels.${k} must be an object with model and/or effort.`);
  +     continue;
  +   }
  ```
- names: `resolveStepModels`; case `ship-step-models: (g) unknown entry key and an entry with neither key are errors`.
- mirror: case (e) at `ship-prepare-exec.yaml` (description `ship-step-models: (e) invalid effort is an error`).
- decisions: Decisions taken without the owner (error text).
- sync: spec R90 (Task 1); `schemas/sdlc-local.schema.json` already forbids extra keys (no change).

### Task 9: ship.js — a failed git status is never clean

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — adoption check and `unmetCondition('commit-fixes')`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--git-status-fail` switch
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case `ship-self-commit: (b)` after case (a)

**Notes:**
Brief item 3a (F-ship-js-adoption-and-stepmodels-validation-2, -3, -8). `exec` returns null on failure, so only `=== ''` means clean. The shim fails `git status` only while a flag file exists, so prepare and staging are not affected. Workspace modes: the cwd of each call is kept as is (adoption: `resolveActiveWorktreeSafe()`, the active worktree in both `ship.workspace=branch` and `=worktree`; `unmetCondition`: `process.cwd()`, the ship.js run directory, unchanged from today in both modes); only the null handling changes, so each mode keeps its current cwd and gains the same failure handling. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-self-commit|ship-rounds|ship-step:"`

**Acceptance criteria:**
- [ ] Case `ship-self-commit: (b) a failed git status adopts nothing` passes. It runs `--scenario rounds-self-commit --seed frozen --summary high-1.json --git-status-fail`. It asserts: no envelope warning contains `adopted as the commit-fixes commit`; no call emits `dispatch_commit_fixes`; `JSON.stringify(o)` contains `git status failed after received-review`.
- [ ] Case `ship-self-commit: (a)` and the other filtered cases still pass.
- [ ] Without `--git-status-fail` the stepper behaves exactly as before (no shim file is written).

**Contract:**
- shape (code):
  ```diff
  (ship.js unmetCondition, 'commit-fixes' branch)
  -   return exec('git status --porcelain', { cwd: process.cwd() }) ? null : 'no working-tree changes after received-review';
  +   const status = exec('git status --porcelain', { cwd: process.cwd() });
  +   if (status === null) return 'git status failed after received-review';
  +   return status ? null : 'no working-tree changes after received-review';

  (ship.js R97 adoption)
  -   if (rr && rr.fixBaseHead && head && head !== rr.fixBaseHead && !exec('git status --porcelain', { cwd: resolveActiveWorktreeSafe() })) {
  +   if (rr && rr.fixBaseHead && head && head !== rr.fixBaseHead && exec('git status --porcelain', { cwd: resolveActiveWorktreeSafe() }) === '') {
  ```
  Stepper: when `args.includes('--git-status-fail')`, resolve the real git once with `spawnSync('sh', ['-c', 'command -v git'])` before `env` is built. Write `<stubDir>/git` with `fs.writeFileSync(..., { mode: 0o755 })`:
  ```sh
  #!/bin/sh
  if [ "$1" = "status" ] && [ -e "$STUB_GIT_STATUS_FAIL" ]; then echo "fatal: stub git status failure" >&2; exit 128; fi
  exec <real git path> "$@"
  ```
  Set `env.STUB_GIT_STATUS_FAIL = path.join(stubDir, 'fail-status')`. Around each `after('dispatch_received_review', …)` call (in `reviewRound` and in the `after-received-review-changes` case), create that flag file before the call and remove it after.
- names: `--git-status-fail`, `STUB_GIT_STATUS_FAIL`; reason string `git status failed after received-review`.
- mirror: the `stubDir` gh stub at `run-ship-stepper.js:171-175`; case (a) shape in `ship-prepare-exec.yaml` (`ship-self-commit: (a)`).
- decisions: Decisions taken without the owner (commit-fixes reason).
- sync: spec R97 unchanged (it already says "is empty").

### Task 10: Worker write guard — `&>`, fd redirects, `..` escapes

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/worker-write-guard.js` — redirect regex, normalized target test, dead ternary, header comment
- Test: `tests/promptfoo/datasets/worker-write-guard-exec.yaml` — cases (j) onward
- Modify: `plugins/sdlc-utilities/hooks/README.md` — the worker-write-guard paragraph (line 7)

**Notes:**
Implements amended execute R90 (F-worker-write-guard-redirect-bypasses-1..5, -8). `isAllowedTarget` is shared with the `tee` rule, so tee gains normalization too. The masked-quote scan is kept (F-51). Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "worker-write-guard"`

**Acceptance criteria:**
- [ ] Deny cases with `Blocked rule: redirect.`: `echo x &> src/a.js`, `echo x &>> src/a.js`, `echo x 1>src/a`, `node t.js 2> src/err.txt`, `echo x > /tmp/../home/a.js`, `echo x >> /dev/../a`, `echo x > "$TMPDIR/../src/a"`.
- [ ] Deny case with `Blocked rule: tee.`: `echo x | tee /tmp/../src/a`.
- [ ] Allow cases (exit 0, empty stdout): `node t.js 2>&1`, `echo x >&2`, `grep "a > b" f`, `echo "x &> y"`, `cmd &> /tmp/o.txt`, `cmd 2>/dev/null`.
- [ ] Existing cases (a)-(i) still pass; the dead ternary in `maskQuotes` is gone (diff below).

**Contract:**
- shape (code):
  ```diff
  + const path = require('node:path');
  - const ALLOWED_TARGET_RE = /^["']?(\/dev\/|\/tmp\/|\$TMPDIR|\$\{TMPDIR\})/;
  + const ALLOWED_TARGET_RE = /^(\/dev\/|\/tmp\/|\$TMPDIR\/|\$\{TMPDIR\}\/)/;

    function isAllowedTarget(target) {
  -   return ALLOWED_TARGET_RE.test(target);
  +   const unquoted = target.replace(/^["']/, '').replace(/["']$/, '');
  +   return ALLOWED_TARGET_RE.test(path.posix.normalize(unquoted));
    }

    function redirectDenied(cmd, masked) {
  -   const re = /(^|[^0-9&>])>>?(?!&)[ \t]*(\S*)/g;
  +   const re = /(^|[^>&0-9])(?:&|[0-9]+)?>>?(?!&)[ \t]*(\S*)/g;
  ```
  ```diff
    (maskQuotes, inside the quoted branch)
        } else if (ch === quote) {
          quote = null;
          out += ch;
        } else {
  -       out += ch === '\n' ? '_' : '_';
  +       out += '_';
        }
  ```
  (`(?!&)` keeps `2>&1` and `>&2` allowed; the optional `&` or digits catch `&>`, `&>>`, `2>`, `1>>`.) The header comment and README say the guard is best-effort and list the new forms and normalization.
- names: `isAllowedTarget`, `redirectDenied`, `ALLOWED_TARGET_RE`; case letters from (j).
- mirror: deny case (b) and allow case (d) in `worker-write-guard-exec.yaml`.
- decisions: normalize, then prefix test (Key Decisions).
- sync: spec R90 (Task 2).

### Task 11: pr case (f) — state dir outside the worktree

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/pr-testing-outside-state/setup.sh`
- Create: `tests/promptfoo/fixtures-fs/pr-testing-outside-state/state/testing.md`
- Test: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — rewrite case `pr-prepare-testing: (f)`

**Notes:**
Brief item 7 (F-execute-wave-wait-prose-and-fixture-hygiene-6). The git repo is the `repo/` subdirectory, so `state/` is outside the worktree but inside the temp copy (pr.js writes its manifest under the state dir). Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "pr-prepare-testing|fixture-guard"`

**Acceptance criteria:**
- [ ] Case (f) uses `script_cwd: "{{project_root}}/repo"`, `script_env: '{"SDLC_STATE_DIR_OVERRIDE": "{{project_root}}/state"}'`, `script_args: "--testing-file {{project_root}}/state/testing.md"`, `project_root: "file://fixtures-fs/pr-testing-outside-state"`.
- [ ] It asserts `testingSummary` equals the exact trimmed file text below and the output has no `is outside the worktree` warning.
- [ ] `setup.sh` carries the #9161 guard before its first git command, and the `fixture-guard:` cases pass.

**Contract:**
- shape (code): `setup.sh` (bash, `set -e`): the guard line from `project-openspec-detect-diff/setup.sh:10-11`; then `mkdir -p repo && cd repo`; `git init -q -b main`; user/email/`commit.gpgsign false` config; write `README.md`; commit; `git checkout -q -b feat/state-dir`; write `change.txt`; commit. `state/testing.md`:
  ```markdown
  ## Verification summary

  - State-dir fixture: read from the state directory outside the worktree.
  ```
- names: fixture `pr-testing-outside-state`; case description `pr-prepare-testing: (f) file under the state directory outside the worktree is read`.
- mirror: case (f) at `pr-prepare-exec.yaml` and `project-openspec-detect-diff/setup.sh`.
- decisions: Deviations row "Item 7 isolation".
- sync: none.

### Task 12: Execute fixtures — no planPath under /tmp

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/execute-fix-ctx-alpha-20250101T000000Z.json` — planPath
- Modify: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/gc-swept/.sdlc/execution/execute-fix-ctx-alpha-20250101T000000Z.json` — planPath
- Modify: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/execute-fix-live-flags-20250102T000000Z.json` — planPath
- Modify: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/execute-fix-resume-idem-20250104T000000Z.json` — planPath
- Modify: `tests/promptfoo/fixtures-fs/execute-state-mid-wave/.sdlc/execution/execute-fix-resume-mixed-20250103T000000Z.json` — planPath

**Notes:**
Brief item 8 (F-execute-wave-wait-prose-and-fixture-hygiene-7). The missing-plan test (`a missing plan omits the verification section`) then no longer depends on `/tmp` contents. Run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/(context-producer|liveness)"`

**Acceptance criteria:**
- [ ] Each `planPath` is `docs/plans/<name>-missing.md` (`ctx-alpha`, `live-flags`, `resume-idem`, `resume-mixed`); no such file exists in the fixture.
- [ ] `grep -rn '"/tmp/' tests/promptfoo/fixtures-fs/execute-state-mid-wave` prints nothing; the filtered run passes.

**Contract:**
- shape (code):
  ```diff
  -   "planPath": "/tmp/ctx-alpha-plan.md",
  +   "planPath": "docs/plans/ctx-alpha-missing.md",
  ```
  The same edit applies to each file with its own name.
- names: `planPath`.
- mirror: `execute-fix-verify-sheet-20250105T000000Z.json:6` (relative `docs/plans/verify-sheet.md`).
- decisions: relative path inside the fixture.
- sync: none.

### Task 13: Sync git spec mirrors

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 3
**Verify:** lint

**Files:**
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy
- Modify: `site/src/content-source/specs/version-sdlc.md` — byte copy
- Create: `docs/plans/2026-11-12-lean-m4a-ship-execute-runtime.md`

**Notes:**
Run `cp` once per file; never `site/scripts/copy-docs.mjs` (project notes). The plan file is listed here only so ship stages it (project notes: ship stages only files named in the plan); no task edits it.

**Acceptance criteria:**
- [ ] `diff -q docs/specs/<s>.md site/src/content-source/specs/<s>.md` prints nothing for review-sdlc, pr-sdlc and version-sdlc.
- [ ] No other site file changes.

**Contract:**
- shape (docs): byte copies via `cp docs/specs/<s>.md site/src/content-source/specs/<s>.md`.
- names: the three mirror paths.
- mirror: Task 1's mirror step.
- decisions: `cp`, not the copy script.
- sync: Task 3 output.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code/prompt change has exec cases or sentinel checks (Tasks 6-12); existing cases updated |
| no-ci-bypass | error | PASS | No CI skipping |
| no-auto-eval | error | PASS | Only exec-only configs with filtered patterns; no full-suite or retry loops |
| skill-docs-required | error | PASS | No new SKILL.md created |
| no-scope-creep | warning | PASS | Every task maps to one brief item; extras justified in Deviations |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Fixes are in scripts; the prose fixes (R98 paragraph, wait sentence) state skill rules and are sentinel-checked |
| yagni | warning | PASS | No speculative abstractions |
| cross-skill-consistency | error | PASS | Shared git.js callers (review, pr, version) identified and suites run |
| pr-link-github-issue | error | PASS | #9364 is an internal tracking id, not a GitHub issue; recorded and named in the PR body |
| dry | warning | PASS | The wait sentence repeated in SKILL.md and the template is required identical and sentinel-checked |
| kiss | warning | PASS | Smallest local fixes chosen |
| spec-first | error | PASS | Spec tasks 1-3 precede the dependent implementation tasks |
| project-agnostic | error | PASS | Changes are in plugin code; repo-local edits are test fixtures only |
| flag-coherence-cross-skill | error | PASS | No new cross-skill flag gating in SKILL.md |
| no-opposite-logical-vectors | error | PASS | Wait prose is aligned across SKILL.md and template |
| flag-resolution-single-source | warning | PASS | No flag re-derivation |
| state-premise | error | PASS | Root problem stated in Context |
| smallest-viable-cut | warning | PASS | Key Decisions states no extra tasks |
| failure-audience | warning | PASS | Blast radius named |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration/init/preflight logic changed |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters added |
| flag-semantic-consistency-cross-skill | error | PASS | --git-status-fail is on a test stepper script, not a skill prepare script |
| workspace-mode-compatibility | error | PASS | Task 9 now states branch and worktree behaviour for both ship.js git status calls (fixed in Step 4) |
| prompt-cache-hit-ratio | warning | PASS | Only static skill text changed; no volatile bytes |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 8 changes a config contract.

**Severity hint:** high

**Patch:** Check that the tightened ship.stepModels validation is reflected in spec R90, the schema and the user docs.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the tightened ship.stepModels validation is reflected in spec R90, the schema and the user docs.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B1)

**Why:** Task 10 changes hook deny/allow rules.

**Severity hint:** high

**Patch:** Check the worker-write-guard hook's new deny and allow contract.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Check the worker-write-guard hook's new deny and allow contract.

### UPDATE: test-quality (U3)

**Why:** Task 6 and Task 7 rework tests/promptfoo scripts and *-exec.yaml cases.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/datasets` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/datasets` after the rename

_4 additional candidates suppressed_

## Final Shape

When all tasks are done:

- **Stale hand-backs.** Ship drops a hand-back that does not come from the Agent task of the current dispatch (R98). It never reads the ledger to decide.

- **Git helpers.** `fetchBaseRef` leaves a sha base alone, so no sha-named branch appears. `getRemoteState` ignores an upstream with another branch name, so a worktree branch that tracks `origin/main` pushes with `-u origin <branch>`. Review, pr and version behave the same in branch and worktree mode.

- **ship.js.** ship.js treats a failed `git status` as a failure, never as a clean tree. `ship.stepModels` reports unknown entry keys and entries with neither key.

- **Write guard.** The guard denies `&>`, `&>>`, fd-numbered and `..`-escaping redirects into the repo. It still allows `2>&1`, `>&2` and quoted `>`.

- **Execute wait.** The execute wait prose names only the blocking `wave-progress --wait` call, with retry-once and the deadline step (R92).

- **Tests.** The pr testing-file case proves the state-dir branch. The execute fixtures no longer read `/tmp`. The sentinel checker guards the two prose fixes (the step-agent args sentinel shipped in #9366).

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
| 2 lib/git.js sha fetch skip and upstream-name match; spec lines; exec cases | Task 3, Task 7, Task 13 | covered |
| 3 ship.js git status null handling; stepModels unknown/empty entry error; spec R90; docs | Task 1, Task 8, Task 9 | covered |
| 4 Ship R98 keyed on Agent task; ledger clause dropped; sentinel | Task 1, Task 4, Task 6 | covered |
| 5 worker-write-guard bypasses; execute spec R90; hook cases | Task 2, Task 10 | covered |
| 6 Execute wait prose; spec R92; sentinel | Task 2, Task 5, Task 6 | covered |
| 7 pr-prepare case (f) state dir outside worktree | Task 11 | covered |
| 8 execute-state-mid-wave planPath fixtures | Task 12 | covered |

Item 1 (six ship-step agents: args sentence; ship spec R99; sentinel check) shipped in the separate wave #9366 and is not in this plan.

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
