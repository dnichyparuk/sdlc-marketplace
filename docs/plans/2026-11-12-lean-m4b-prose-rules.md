# Prose Rules and Doc Truth (M4b) Implementation Plan

**Commit:** `fix(#9365): received-review, plan, ship - prose rules, doc truth`
**Goal:**
- Stop received-review from rewriting a true doc into a false one when a finding judges the doc against the spec instead of the code (received-review R34, ledger F-58).
- Make the planner and its reviewers list the user-facing files of a skill whose behaviour a task changes, so ship does not decline findings in them as outside the plan (plan-sdlc R71(d), ledger F-62(a)).
- Fix three doc-truth slips (M-20, 77-L3, the setup ship field count) and the one bare `git push` left in ship.js (ship R36).
**Architecture:** Spec first: received-review R34 (new), plan-sdlc R71(d) (amended) and ship R36 (amended) are written before the skill, agent and script changes that implement them. Prose rules are proven by sentinel exec cases (the existing `plan-sdlc/lens-sentinels:` case, extended, and a new inline `rr-verify:` case); the push change is proven by an assertion on the emitted `learnings_commit` command. The doc fixes are text moves and corrections with byte copies to `site/src/content-source/`.
**Source:** conversation context (wave M4b brief, tracking id #9365; architect validation of the M4 batch 2026-11-12 plus one item from the M4a planner)
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

Two prose rules let a pipeline do the wrong thing, and four places say something untrue.

- In PR #79, received-review changed a correct doc ("no effect") into a false claim. The review finding had compared the doc with the spec, not with the code. Ship's final check caught it (ledger F-58).
- In PR #80, ship declined findings in `site/src/data/skills-meta.ts` and in companion docs. The plan had not listed those files, so they were "outside plan Files" (ledger F-62(a)).
- Three docs are wrong or misplaced: a ship doc sentence sits under the wrong heading (M-20), a ship SKILL.md instruction sits inside an output template (77-L3), and the setup doc counts 15 ship fields where there are 13.
- After M4a, `getRemoteState` treats an upstream as absent unless its branch name matches. Ship's learnings-commit step still runs a bare `git push`. On a worktree branch that tracks `origin/main`, that push is refused, or, with `push.default=upstream`, goes to `main`.

**What prompted this change now?**

The isolated Opus validation of the M4 batch on 2026-11-12 accepted these items for wave M4b. The M4a planner found the bare-push question. Waves M4a0 (#9366) and M4a (#9364) have merged, so every item was re-checked at HEAD f7e1ecb.

**What does success look like?**

- received-review Step 3 tells the model to read the code before it agrees that a doc is wrong against the spec.
- The planner, the risk lens and the single plan reviewer all require the user-facing files of a changed skill in the task's Files (or a Notes line saying they were checked).
- The ship and setup docs say true things in the right places.
- The learnings commit pushes to its own branch name.

**Who fails if this ships wrong (blast radius):** every consumer project that runs `/received-review-sdlc` (directly or from `/ship-sdlc`), `/plan-sdlc`, or a ship run with the `learnings-commit` step. A wrong R34 rule would make received-review refuse valid doc fixes; a wrong push would leave learnings commits unpushed (the step is non-fatal).

## Research Findings

Exploration used the explore orchestrator (it read the code directly and returned findings `F-M4b-1` to `F-M4b-6` in its report; it wrote no `discovery-brief.md`) plus inline reads at HEAD f7e1ecb. P = `plugins/sdlc-utilities`.

- **received-review (item 1, F-M4b-1).** The spec's highest id is R33 (`docs/specs/received-review-sdlc.md:95`), in `### Workflow`, before `### Step-emitter contract` at :98. Step 3 VERIFY is `P/skills/received-review-sdlc/SKILL.md:196-215`; the status list ("confirmed" … "cannot verify") ends at :212. No rule covers a doc-versus-spec finding. The reference doc has a `### Plan decisions` subsection (`docs/skills/received-review-sdlc.md:37-41`) as precedent for a rule subsection. `skills-meta.ts` has a `verify-claims` card ("Reads referenced code to confirm or refute each claim") that stays true. The skill dir has only SKILL.md (no companions). Spec and doc site copies are byte-identical today.
- **plan-sdlc R71(d) (item 2, F-M4b-2).** Spec text at `docs/specs/plan-sdlc.md:292`, acceptance at :293 (`plan-sdlc/lens-sentinels:`), history row at :370. Copies of the rule: `P/skills/plan-sdlc/SKILL.md:217` (ends "(implements R71)"), `P/agents/plan-lens-risk.md:47`, `P/agents/plan-reviewer.md:60`, and a one-line summary in `docs/skills/plan-sdlc.md:83` ("every copy of a changed value"). No plan-sdlc companion (`plan-format-reference.md`, `review-loop.md`, …) states R71. The checker `tests/promptfoo/scripts/check-plan-lens-sentinels.js:29-31` matches three substrings; the case is `tests/promptfoo/datasets/plan-prepare-exec.yaml:914`.
- **M-20 (item 3, F-M4b-3).** `docs/skills/ship-sdlc.md:258` "During the execute step, ship prints one line per finished execute wave when the Monitor tool is available." closes `### Review rounds` (:252). "How the Pipeline Works" (:98) has a `**Key points:**` bullet list (:225-240) with bullets such as "**Testing summary to pr (R89)**". The behaviour is ship R92 (`docs/specs/ship-sdlc.md:380`). Site copy identical.
- **77-L3 (item 4, F-M4b-4).** `P/skills/ship-sdlc/SKILL.md:334` "Print the 3b row only when `ext.summary.finalCheck` is non-null." is inside the Step 6 summary fence (opens at :320, closes at :348 after "State file cleaned up: …"). Text after the fence starts at :350 ("An `execute` row …"). No test asserts the sentence.
- **Setup count (item 5, F-M4b-5).** `docs/skills/setup-sdlc.md:208` says "The 15 `ship` fields" and "Eight of the 15 are R57 tunables", listing `executeWaveTimeout` and `executeWaveInterval` and the gate `execute`. `SHIP_FIELDS` has 13 entries (exec case `setup-prepare-exec.yaml:15` asserts `shipFields.length === 13`); the six tunables are gated by `verify-pipeline` or `await-remote-review`. The wave timeout is `execute.waveTimeout` (`P/scripts/lib/ship-fields.js:29-33`; documented in `docs/skills/execute-plan-sdlc.md` `## Configuration`, :52-58). No other file holds the "15" claim except the site copy.
- **Bare push (item 6, F-M4b-6).** `P/scripts/skill/commit.js` has no `git push` (its `push` hits are `errors.push`/`warnings.push`): dropped for commit.js. `P/scripts/skill/ship.js:1500` `LEARNINGS_COMMIT_COMMAND` ends `{ git push || echo "push failed (non-fatal)" >&2; }`, emitted at :2163 for `learnings_commit`. It is the only bare push in ship.js. ship.js does not import `getRemoteState`. The rule it must follow is pr-sdlc R19 (`docs/specs/pr-sdlc.md:22`). `P/skills/ship-sdlc/reference.md:159-164` shows the same commands with a bare `git push`. The spec is ship R36 (`docs/specs/ship-sdlc.md:233-234`; history rows :523, :584). Exec case `ship-lean: (learnings) b` (`tests/promptfoo/datasets/ship-prepare-exec.yaml:2592`) already emits `learnings_commit` after `dispatch_pr`; `step.data.commands[0]` is the command (as in the case at :2670).
- **Build and test commands.** Exec-only promptfoo config `tests/promptfoo/promptfooconfig-exec.yaml` holds `plan-prepare-exec.yaml`, `received-review-prepare-exec.yaml` and `ship-prepare-exec.yaml`; run with `-j 1`. Validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| commit.js part of item 6 | no | dropped: commit.js runs no `git push` | evidence F-M4b-6 |
| Item 6 push form | no | `git push --set-upstream origin HEAD` in the static command, not a `getRemoteState` call at emission | gives the same result as the R19 rule in every case without a git call or a branch name in a shell string (Key Decisions) |
| Item 6 spec id | no | amends ship R36 (the learnings-commit contract) instead of adding R100 | the push is part of R36's existing step; one contract, not two |
| R71(d) wording | no | names the user-facing files generically, with this repository's paths as examples | `project-agnostic` guardrail: consumer projects have no `site/src/data/skills-meta.ts` |
| Doc copies of changed rules | no | Tasks 2, 4 and 8 also update `docs/skills/<skill>.md` and its site copy | the new R71(d) rule itself requires it; `skills-meta.ts` checked, no text contradicts the changes |
| Discovery brief | no | the orchestrator returned findings in its report and wrote no brief file; tasks cite `F-M4b-<n>` | manifest had no scope hints and no web signal |
| PR linking | no | names #9365 in the PR body with no `Fixes`/`Closes` keyword | tracking ids are internal register ids (project notes); overrides `pr-link-github-issue` |

### Decisions taken without the owner

- **R34 sentinel:** an inline `-e` exec case in `received-review-prepare-exec.yaml` (the `rr-plan:` cases' style), not a new checker script. The brief called the sentinel optional; an inline case adds coverage without a new file.
- **R71(d) sentinel:** the existing checker gains one substring per file; the three existing substrings stay as they are.
- **Task split:** the 77-L3 SKILL.md move is its own Task 10, apart from the ship doc Task 8 (single-responsibility).
- **M-20 placement:** a new `**Per-wave progress (R92)**` bullet in the "How the Pipeline Works" `**Key points:**` list, not "What Gets Printed".
- **Spec mirrors:** every edited doc or spec is copied to `site/src/content-source/` with `cp` by the task that edits it.

## Key Decisions

- **R34 is a verification rule, not a new verdict.** The finding gets the existing status "partially correct". The alternative, a new verdict such as "spec ahead of code", would touch Step 4, the reply templates and ship's parsing. The existing status says exactly what is true: the reviewer is right that doc and spec differ, and wrong that the doc must change.

- **Push with `--set-upstream origin HEAD`.** `HEAD` here means "the current branch's name". When the upstream already matches, this pushes to the same place as a bare push. When it is absent or names another branch (a worktree branch tracking `origin/main`), it pushes to `origin/<branch>` and fixes the tracking, which is the pr-sdlc R19 rule. The alternative, calling `getRemoteState` when ship emits the step and putting the branch name in the command, adds a git call and puts a branch name (which may hold `$` or backticks) inside a shell string. The static form avoids both.

- **R71(d) names files by role.** "Every file that documents that skill for users" is the rule; `docs/skills/<skill>.md`, its site copy and `skills-meta.ts` are this repository's examples. A Notes line may say a file was checked and needs no change, so a task is not forced to edit a file the change does not affect.

- **Root problem (state-premise).** Prose rules that check one source (the spec, or the plan's literal text) instead of the truth (the code, or every file that describes the skill) let a careful pipeline write false docs or refuse true fixes.

- **Smallest viable cut.** Each task maps to one brief item. Tasks 2, 4 and 8 touch the reference docs only because the new R71(d) requires it. The sentinels (Tasks 5 and the assertion in Task 7) are required by `test-coverage-required`.

**Non-goals (intentionally not built):**

- received-review scope widening (F-62(b)): deferred by the owner rule unless F-62 recurs.
- the GitHub-issues skill (wave 5b).
- any change to commit.js (it does not push), to pr.js or version-sdlc (already follow R19).
- any behavioural, headless or `claude -p` run; the full exec suite stays a main-session PR check.

## Contract Examples

**openspec / spec** (Task 1):

```markdown
**Contract:**
- shape (openspec): ADD `R34` to `docs/specs/received-review-sdlc.md` after R33 (in `### Workflow`); append an issue-trail row.
- names: `R34` (new).
- mirror: R33 block at `docs/specs/received-review-sdlc.md:95-96`.
- decisions: next free id R34; ids never renumbered.
- sync: `site/src/content-source/specs/received-review-sdlc.md` byte copy.
```

**docs** (Task 9):

```markdown
**Contract:**
- shape (docs): replace one paragraph in `#### \`ship\`` of the setup reference doc; audience: users configuring ship.
- names: "13 `ship` fields", "Six of the 13".
- mirror: the current paragraph at `docs/skills/setup-sdlc.md:208`.
- decisions: the wave timeout points at execute-plan-sdlc's Configuration section.
- sync: `site/src/content-source/skills/setup-sdlc.md` byte copy.
```

**code** (Task 7):

```markdown
**Contract:**
- shape (code): constant `LEARNINGS_COMMIT_COMMAND` in `ship.js` pushes with `git push --set-upstream origin HEAD`.
- names: `LEARNINGS_COMMIT_COMMAND`.
- mirror: `ship.js:1500`.
- decisions: static command, no `getRemoteState` call (Key Decisions).
- sync: `reference.md` learnings-commit commands; exec case `ship-lean: (learnings) b`.
```

## Tasks

### Task 1: received-review spec — R34 new

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/received-review-sdlc.md` — add R34 after R33; add an issue-trail row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy of the spec

**Notes:**
Brief item 1 (F-M4b-1). Spec first: Task 2 implements this id.

**Acceptance criteria:**
- [ ] R34 sits directly after R33's Acceptance line and before `### Step-emitter contract`, with an Acceptance sub-bullet.
- [ ] The issue-trail table gains `| R34 | doc-versus-spec findings checked against the code (ledger F-58), #9365 |` after the `| R32 | (issue #9302) |` row.
- [ ] No other id changes.
- [ ] `cp docs/specs/received-review-sdlc.md site/src/content-source/specs/received-review-sdlc.md` was run after the last edit; `diff -q` of the two prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD R34 as rendered below.
- names: `R34` (new).
- mirror: R33 style at `docs/specs/received-review-sdlc.md:95-96`.
- decisions: reuse the status "partially correct" (Key Decisions).
- sync: Task 2 (SKILL.md, reference doc) cites R34.

```markdown
- R34: Doc-versus-spec findings. In Step 3, a finding that says a doc or skill text disagrees with the spec is first checked against the code. When the code does what the doc says, the status is "partially correct": the fix documents the gap between spec and code, or the reply names the spec/code mismatch, and the doc is never rewritten to claim behaviour the code does not have. When the code does what the spec says, the doc is wrong and the doc fix goes ahead. This holds also under `--auto` and the R18 bypass.
  - Acceptance: exec case `rr-verify: (a)` (SKILL.md Step 3 carries the R34 rule).
```

### Task 2: received-review skill and doc — R34 rule

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — add the R34 paragraph to Step 3
- Modify: `docs/skills/received-review-sdlc.md` — add a `### Doc-versus-spec findings` subsection after `### Plan decisions`
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — byte copy of the doc

**Notes:**
Implements received-review R34 (F-M4b-1). `site/src/data/skills-meta.ts` was checked: its `verify-claims` card ("Reads referenced code to confirm or refute each claim") stays true, so it is not edited. Task 5 adds the sentinel case.

**Acceptance criteria:**
- [ ] SKILL.md Step 3 has the paragraph below right after the status list (after the "cannot verify" bullet, before "For "cannot verify" items: …").
- [ ] The doc has the subsection below directly after the `### Plan decisions` paragraph, before `## Configuration`.
- [ ] `cp docs/skills/received-review-sdlc.md site/src/content-source/skills/received-review-sdlc.md` was run after the last edit; `diff -q` prints nothing.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): one SKILL.md paragraph and one doc subsection, as rendered below.
- names: sentinel substrings `Doc-versus-spec findings (R34)` and `never rewrite the doc to claim behaviour the code lacks`.
- mirror: the `**Plan decisions (R33):**` paragraph style at `received-review-sdlc/SKILL.md:232`; doc subsection `### Plan decisions` at `docs/skills/received-review-sdlc.md:37`.
- decisions: existing status "partially correct", no new verdict.
- sync: Task 5 sentinel substrings must match byte for byte.

SKILL.md paragraph:

```markdown
**Doc-versus-spec findings (R34):** When a finding says a doc or skill text disagrees with the spec, read the code before you decide. If the code does what the doc says, the status is **partially correct**: the doc is true and the spec is ahead of the code. The fix documents that gap, or the reply names the spec/code mismatch; never rewrite the doc to claim behaviour the code lacks. If the code does what the spec says, the status is **confirmed** and the doc fix goes ahead.
```

Doc subsection:

```markdown
### Doc-versus-spec findings

A finding that says a doc disagrees with the spec is checked against the code first (R34). When the code matches the doc, received-review keeps the doc true: it documents the gap, or names the spec/code mismatch in its reply, and never rewrites the doc to claim behaviour the code lacks. When the code matches the spec, the doc is fixed.
```

### Task 3: plan-sdlc spec — R71(d) user-facing files

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — extend R71 clause (d) and its Acceptance; add an issue-trail row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec

**Notes:**
Brief item 2 (F-M4b-2). Spec first: Task 4 implements the amended clause; Task 5 proves it.

**Acceptance criteria:**
- [ ] In R71 (`docs/specs/plan-sdlc.md:292`), clause (d) gains the inserted text below, right after "lists every companion of that skill that states the rule;" and before " (e) environment".
- [ ] R71's Acceptance line reads as rendered below.
- [ ] The issue-trail table gains `| R71 | (d) user-facing files of a changed skill (ledger F-62), #9365 |` after the existing R71 row (:370).
- [ ] `cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` was run after the last edit; `diff -q` prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY R71 (clause d and Acceptance) as rendered; no new id.
- names: sentinel substring `every file that documents that skill for users`.
- mirror: R71's own clause style at `docs/specs/plan-sdlc.md:292`.
- decisions: generic wording with this repository's paths as examples (`project-agnostic`).
- sync: Task 4 (SKILL.md, lens-risk, plan-reviewer, doc) and Task 5 (checker).

Before → after of clause (d) (inserted text in the second line):

```diff
- … a task that changes a dispatch or model rule lists every companion of that skill that states the rule; (e) environment: …
+ … a task that changes a dispatch or model rule lists every companion of that skill that states the rule; a task that changes a skill's behaviour lists every file that documents that skill for users: its reference doc and that doc's site copy, its site metadata entry and its companion `.md` files (in this repository `docs/skills/<skill>.md`, `site/src/content-source/skills/<skill>.md`, `site/src/data/skills-meta.ts` and the `.md` files beside `skills/<skill>/SKILL.md`), or its Notes name the ones it checked that need no change; (e) environment: …
```

Acceptance line:

```markdown
  - Acceptance: exec case `plan-sdlc/lens-sentinels:` (lens-risk, plan-reviewer and plan-sdlc SKILL.md carry the R71 text, including the clause (d) user-facing-files text).
```

### Task 4: plan-sdlc skill, lenses and doc — R71(d) text

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — extend the R71 bullet at :217
- Modify: `plugins/sdlc-utilities/agents/plan-lens-risk.md` — extend clause (d) at :47
- Modify: `plugins/sdlc-utilities/agents/plan-reviewer.md` — extend clause (d) at :60
- Modify: `docs/skills/plan-sdlc.md` — extend the R71 summary at the end of :83
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy of the doc

**Notes:**
Implements plan-sdlc R71(d) (F-M4b-2). The existing sentinel substrings (`Runtime semantics (R71`, `Runtime semantics (R71, under Verification strategy and Scope discipline)`, `(implements R71)`) must stay intact. `site/src/data/skills-meta.ts` was checked: its plan-sdlc entry does not describe R71, so it is not edited. No plan-sdlc companion (`plan-format-reference.md`, `review-loop.md`, `openspec-flow.md`, `state-format.md`, `plan-template-default.md`) states R71.

**Acceptance criteria:**
- [ ] Each of the three plugin files holds the substring `every file that documents that skill for users`.
- [ ] SKILL.md :217 still ends with `(implements R71).`
- [ ] The two agent files carry byte-identical inserted text.
- [ ] `cp docs/skills/plan-sdlc.md site/src/content-source/skills/plan-sdlc.md` was run after the last edit; `diff -q` prints nothing.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): insert text as rendered; no other change.
- names: sentinel substring `every file that documents that skill for users`.
- mirror: the clause (d) text at `agents/plan-lens-risk.md:47`.
- decisions: as Task 3.
- sync: Task 5 checker substring.

SKILL.md :217 — insert before ` (implements R71).`:

```diff
- … a value read from an environment variable, the working directory or a path names where it comes from (implements R71).
+ … a value read from an environment variable, the working directory or a path names where it comes from; a task that changes a skill's behaviour lists every file that documents that skill for users (its reference doc and that doc's site copy, its site metadata such as `site/src/data/skills-meta.ts`, its companion `.md` files), or its Notes name the ones it checked that need no change (implements R71).
```

Both agent files — clause (d), insert after "lists every companion of that skill that states it":

```diff
- … and a task that changes a dispatch or model rule lists every companion of that skill that states it; (e) environment: …
+ … and a task that changes a dispatch or model rule lists every companion of that skill that states it, and a task that changes a skill's behaviour lists every file that documents that skill for users (its reference doc and that doc's site copy, its site metadata such as `site/src/data/skills-meta.ts`, its companion `.md` files) or its Notes name the ones it checked that need no change; (e) environment: …
```

`docs/skills/plan-sdlc.md` :83, last sentence:

```diff
- … every copy of a changed value, and environment sources.
+ … every copy of a changed value (including every file that documents a changed skill for users: its reference doc, site copy, site metadata and companion files), and environment sources.
```

### Task 5: Sentinel cases — R71(d) and R34

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 4
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-plan-lens-sentinels.js` — add the R71(d) substring to the three checks
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — update the `plan-sdlc/lens-sentinels:` description
- Test: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — add case `rr-verify: (a)`

**Notes:**
Sentinels for items 1 and 2 (F-M4b-1, F-M4b-2). The checker reads files by plain substring, so quoting rules (F-51) do not apply. The R34 case uses an inline `-e` script like the `rr-plan:` cases, so no new script file; `script-runner.js` splits `script_args` on whitespace, so the script has no spaces and the substring checks live in the assertion. Runs:
`cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/lens-sentinels"`
`cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "rr-verify"`

**Acceptance criteria:**
- [ ] Both cases pass at the end of this task.
- [ ] Removing the R71(d) substring from any one of the three plugin files makes `ok` false (checked by reading the code).
- [ ] The `rr-verify: (a)` case fails when either R34 substring is absent from SKILL.md (checked by reading the assertion).
- [ ] The `script_args` value of the new case contains no whitespace.

**Contract:**
- shape (code): checker change and new case as rendered.
- names: constant `USERS`; case `rr-verify: (a) SKILL.md Step 3 carries the R34 doc-versus-spec rule`.
- mirror: `check-plan-lens-sentinels.js:29-31`; the `rr-plan: (a)` case at `received-review-prepare-exec.yaml:234`.
- decisions: one substring per file; existing substrings unchanged.
- sync: Task 2 and Task 4 sentence text.

```js
const USERS = 'every file that documents that skill for users';
const risk = has('agents/plan-lens-risk.md', ['Runtime semantics (R71', USERS]);
const reviewer = has('agents/plan-reviewer.md', ['Runtime semantics (R71, under Verification strategy and Scope discipline)', USERS]);
const skill = has('skills/plan-sdlc/SKILL.md', ['(implements R71)', USERS]);
```

`plan-prepare-exec.yaml` description becomes `plan-sdlc/lens-sentinels: R71 runtime-semantics and user-facing-files sentinels present in the risk lens, the reviewer and SKILL.md`.

New case (appended after the `rr-plan:` cases):

```yaml
- description: "rr-verify: (a) SKILL.md Step 3 carries the R34 doc-versus-spec rule"
  vars:
    script_path: "-e"
    script_args: '((fs)=>console.log(fs.readFileSync("{{repo_root}}/plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md","utf8")))(require("fs"))'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-received-review-scope"
  assert:
    - type: javascript
      value: |
        if (!output.includes('Doc-versus-spec findings (R34)')) return 'FAIL: R34 label missing from received-review SKILL.md';
        if (!output.includes('never rewrite the doc to claim behaviour the code lacks')) return 'FAIL: R34 rule text missing from received-review SKILL.md';
        return true;
```

### Task 6: ship spec — R36 push form

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend R36 and its Acceptance; add an issue-trail row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy of the spec

**Notes:**
Brief item 6 (F-M4b-6). Spec first: Task 7 implements it, Task 8 documents it.

**Acceptance criteria:**
- [ ] R36 (`docs/specs/ship-sdlc.md:233`) reads as in the diff below; its Acceptance line gains the sentence below.
- [ ] The issue-trail table gains `| R36 | learnings push to its own branch name (M4a planner), #9365 |` after the `| R99 | … |` row.
- [ ] `cp docs/specs/ship-sdlc.md site/src/content-source/specs/ship-sdlc.md` was run after the last edit; `diff -q` prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY R36; no new id.
- names: `git push --set-upstream origin HEAD`.
- mirror: pr-sdlc R19 wording at `docs/specs/pr-sdlc.md:22`.
- decisions: static push form (Key Decisions).
- sync: Task 7 (ship.js, reference.md, exec case), Task 8 (ship doc).

```diff
- When there is a diff, the step commits `chore(ship-sdlc): capture pipeline learnings` and pushes. Push failures report a warning but do not halt the pipeline.
+ When there is a diff, the step commits `chore(ship-sdlc): capture pipeline learnings` and pushes with `git push --set-upstream origin HEAD`, so a branch whose upstream names another branch (a worktree branch that tracks `origin/main`) pushes to its own name and never to that branch (the pr-sdlc R19 rule). Push failures report a warning but do not halt the pipeline.
```

Acceptance addition: ``The `learnings_commit` command holds `git push --set-upstream origin HEAD` and no bare `git push ||` (exec case `ship-lean: (learnings) b`).``

### Task 7: ship.js learnings push and reference

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `LEARNINGS_COMMIT_COMMAND` push form
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — learnings-commit step 3 commands
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — extend case `ship-lean: (learnings) b`

**Notes:**
Implements ship R36 (F-M4b-6). The command stays one static string, so no git call at emission and no branch name in a shell string. The regex in the assertion has no `|` alternation; the literal `|` in `git push ||` is escaped (F-44). Run:
`cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-lean: .learnings."`

**Acceptance criteria:**
- [ ] `ship.js:1500` reads as rendered below.
- [ ] `reference.md` step 3 shows `git push --set-upstream origin HEAD` and one sentence saying why.
- [ ] Both `ship-lean: (learnings)` cases pass.

**Contract:**
- shape (code): as rendered.
- names: `LEARNINGS_COMMIT_COMMAND`.
- mirror: `ship.js:1500`; assertion style of the case at `ship-prepare-exec.yaml:2670`.
- decisions: static form (Key Decisions).
- sync: R36 text from Task 6.

```diff
- const LEARNINGS_COMMIT_COMMAND ='git diff --quiet -- .sdlc/learnings/log.md || { git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings" && { git push || echo "push failed (non-fatal)" >&2; }; }';
+ // ship R36: push to the current branch's own name, also when its upstream names another branch (pr-sdlc R19).
+ const LEARNINGS_COMMIT_COMMAND ='git diff --quiet -- .sdlc/learnings/log.md || { git add .sdlc/learnings/log.md && git commit -m "chore(ship-sdlc): capture pipeline learnings" && { git push --set-upstream origin HEAD || echo "push failed (non-fatal)" >&2; }; }';
```

`reference.md` step 3:

```diff
-    git push
+    git push --set-upstream origin HEAD
     ```
+   The push goes to the branch's own name, also when its upstream names another branch, such as a worktree branch that tracks `origin/main` (ship R36).
```

Exec case `ship-lean: (learnings) b` — replace the final `return` with:

```js
if (e.status !== 'step' || e.step.id !== 'learnings_commit') return `FAIL: ${e.status} ${e.step && e.step.id} ${e.error || ''}`;
const cmd = e.step.data.commands[0];
if (!cmd.includes('git push --set-upstream origin HEAD')) return `FAIL: push form ${cmd}`;
if (/git push \|\|/.test(cmd)) return `FAIL: bare push ${cmd}`;
return true;
```

Its description becomes `ship-lean: (learnings) b a tracked learnings log still emits learnings_commit after dispatch_pr, pushing with --set-upstream origin HEAD`.

### Task 8: ship doc — wave-progress placement (M-20) and R36 push

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — move the wave-progress sentence; add the push form to the R36 bullet
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy of the doc

**Notes:**
Brief item 3 (F-M4b-3), plus the ship doc half of item 6 (F-M4b-6) required by R71(d); both edits are in one file pair, so one task owns it (F-43). `site/src/data/skills-meta.ts` was checked: it has no text about the learnings push or wave lines.

**Acceptance criteria:**
- [ ] `docs/skills/ship-sdlc.md` no longer has the sentence "During the execute step, ship prints one line per finished execute wave when the Monitor tool is available." under `### Review rounds`.
- [ ] The `**Key points:**` list of "How the Pipeline Works" has the new bullet below directly before the `**Testing summary to pr (R89)**` bullet.
- [ ] The `**Ignored learnings log (R36)**` bullet ends with the sentence below.
- [ ] `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` was run after the last edit; `diff -q` prints nothing.

**Contract:**
- shape (docs): text moves as rendered; no rewording of the moved sentences except the bullet label.
- names: bullet label `**Per-wave progress (R92)**`.
- mirror: the `**Testing summary to pr (R89)**` bullet in `docs/skills/ship-sdlc.md` Key points.
- decisions: "How the Pipeline Works" Key points, not "What Gets Printed".
- sync: R36 text from Task 6.

New Key points bullet:

```markdown
- **Per-wave progress (R92)**: during the execute step, ship prints one line per finished execute wave when the Monitor tool is available.
```

Sentence appended to the R36 bullet:

```markdown
The learnings commit is pushed with `git push --set-upstream origin HEAD`, so it goes to the branch's own name, also from a worktree branch that tracks `origin/main`.
```

### Task 9: setup doc — ship field count

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/setup-sdlc.md` — correct the `#### \`ship\`` paragraph at :208
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy of the doc

**Notes:**
Brief item 5 (F-M4b-5). The count 13 is pinned by exec case `setup-prepare-exec.yaml:15`. Trivial: one paragraph plus a `cp` byte copy.

**Acceptance criteria:**
- [ ] The paragraph reads as rendered below; the sentences after "Run `/setup-sdlc --only ship` …" are unchanged.
- [ ] `cp docs/skills/setup-sdlc.md site/src/content-source/skills/setup-sdlc.md` was run after the last edit; `diff -q` prints nothing.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): replace the first three sentences of the paragraph as rendered.
- names: "13 `ship` fields", "Six of the 13", `execute.waveTimeout`.
- mirror: `docs/skills/setup-sdlc.md:208`.
- decisions: link to `execute-plan-sdlc.md#configuration`, where `waveTimeout` is documented.
- sync: site copy.

```markdown
The 13 `ship` fields are imported verbatim from `scripts/lib/ship-fields.js` (single source of truth for both `/ship-sdlc` and `/setup-sdlc`). Six of the 13 are R57 tunables (`verifyPipelineTimeout`, `verifyPipelineInterval`, `verifyPipelineMaxIterations`, `awaitRemoteReviewTimeout`, `awaitRemoteReviewInterval`, `awaitRemoteReviewers`) prompted only when the gating step (`verify-pipeline` or `await-remote-review`) is in the selected `ship.steps[]` — the prepare script applies these `when.stepInActiveSteps` gates per issue #292 / R15. The per-wave timeout is not a `ship` field: it is `execute.waveTimeout` in the `execute` section (legacy fallback `ship.executeWaveTimeout`; see [execute-plan-sdlc Configuration](execute-plan-sdlc.md#configuration)). Its ceiling is `3600` seconds, restating `MAX_WAVE_TIMEOUT_SECONDS` in `scripts/lib/ship-fields.js` — the single enforcement point.
```

### Task 10: ship SKILL.md — 3b sentence out of the fence (77-L3)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — move the 3b sentence out of the Step 6 summary fence
- Create: `docs/plans/2026-11-12-lean-m4b-prose-rules.md`

**Notes:**
Brief item 4 (F-M4b-4). A placement move with no behaviour change, so no spec id and no test. The plan file is listed here only so ship stages it (project notes); no task edits it.

**Acceptance criteria:**
- [ ] "Print the 3b row only when `ext.summary.finalCheck` is non-null." is the first line after the Step 6 summary fence's closing line (before "An `execute` row …"), separated by blank lines, and no longer inside the fence.
- [ ] The fence content is otherwise unchanged.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): move one line as rendered; no rewording.
- names: the sentence text unchanged.
- mirror: the text paragraph after the fence ("An `execute` row whose summary entry …").
- decisions: placed right after the fence, next to the other summary rules.
- sync: none.

~~~diff
 3b    review-sdlc (final)   [done] <verdict> on <short sha>
 …
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-Print the 3b row only when `ext.summary.finalCheck` is non-null.
 
 Decisions log:
 …
 State file cleaned up: .sdlc/execution/ship-<branch>-<epoch>.json deleted
 ```
 
+Print the 3b row only when `ext.summary.finalCheck` is non-null.
+
 An `execute` row whose summary entry has `source: "user-attested"` is reported as `[done] finished outside the pipeline (user-attested)`.
~~~

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Sentinel exec cases cover R34 and R71(d) (Task 5); the ship-lean learnings case is updated for the push change (Task 7); the SKILL.md 3b edit only moves a sentence |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only the exec-only config, filtered runs with -j 1, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Every task maps to a brief item; doc copies are required by R71(d) |
| single-responsibility-tasks | warning | PASS | Task 8 split: Task 8 ship doc (M-20 and R36 sentence, one file pair), Task 10 ship SKILL.md 3b move |
| scripts-over-llm-logic | error | PASS | R34 and R71(d) are judgement rules; the push change is a static command with an exec assertion |
| yagni | warning | PASS | No speculative abstractions |
| cross-skill-consistency | error | PASS | Push form follows pr-sdlc R19; R71(d) applied to SKILL.md, both agents and the doc |
| pr-link-github-issue | error | PASS | #9365 is an internal tracking id, not a GitHub issue; named in the PR body without Fixes/Closes |
| dry | warning | PASS | Repeated R71(d) text is a required mirror guarded by the checker |
| kiss | warning | PASS | One paragraph, one substring per file, one static command |
| spec-first | error | PASS | Tasks 1, 3 and 6 update the specs before Tasks 2, 4, 7 and 8 |
| project-agnostic | error | PASS | R71(d) wording is generic, with this repository's paths only as examples |
| flag-coherence-cross-skill | error | PASS | No flags touched |
| no-opposite-logical-vectors | error | PASS | No gating conditions introduced |
| flag-resolution-single-source | warning | PASS | No flags touched |
| state-premise | error | PASS | Root problem stated in Key Decisions |
| smallest-viable-cut | warning | PASS | Key Decisions maps each task to a brief item |
| failure-audience | warning | PASS | Blast radius named in Context |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Alternatives recorded in Key Decisions |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic |
| agent-dispatch-script-driven | error | PASS | No dispatch parameters changed |
| flag-semantic-consistency-cross-skill | error | PASS | No new flags |
| workspace-mode-compatibility | error | PASS | The static push behaves the same in branch and worktree modes; no state files touched |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added |

## Suggested Review Dimensions

### UPDATE: security-review (U3, U5)

**Why:** Task 7 changes the push command in `plugins/sdlc-utilities/scripts/skill/ship.js` (`LEARNINGS_COMMIT_COMMAND`), a path this dimension's triggers match.

**Severity hint:** high

**Patch:** update triggers naming `plugins` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — update triggers naming `plugins` after the rename

### UPDATE: docs-skill-sync (U3)

**Why:** Tasks 2, 4, 8 and 9 edit `docs/skills/*.md` and their `site/src/content-source/skills/` copies, so the dimension's triggers should cover those site copies.

**Severity hint:** high

**Patch:** update triggers naming `docs/skills` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — update triggers naming `docs/skills` after the rename

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 7 changes the command ship.js emits for `learnings_commit` from a bare `git push` to `git push --set-upstream origin HEAD`, which changes an emitted command contract.

**Severity hint:** high

**Patch:** Check the changed `learnings_commit` command contract (`git push --set-upstream origin HEAD`) against the ship R36 spec text, reference.md and the exec assertion.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the changed `learnings_commit` command contract (`git push --set-upstream origin HEAD`) against the ship R36 spec text, reference.md and the exec assertion.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_3 additional candidates suppressed_

## Final Shape

When all tasks are done:

- **received-review.** Step 3 reads the code before it agrees that a doc is wrong against the spec. A true doc stays true; the gap is documented instead (R34). A sentinel case guards the rule.

- **plan-sdlc.** The planner, the risk lens and the single reviewer require a task that changes a skill's behaviour to list the skill's user-facing files, or to say in Notes which ones it checked (R71(d)). The lens-sentinel case guards all three copies.

- **ship.** The learnings commit pushes to the branch's own name (R36), tested on the emitted command. The ship doc puts the wave-progress line next to the execute step (Task 8), and ship SKILL.md keeps its 3b instruction outside the output template (Task 10).

- **setup.** The setup doc says 13 ship fields and six tunables, and points the wave timeout at the execute section.

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
| 1 F-58: received-review spec R34 + Step 3 VERIFY rule; site copy; optional sentinel | Task 1, Task 2, Task 5 | covered |
| 2 F-62(a): extend plan-sdlc R71(d); SKILL.md, plan-lens-risk.md, plan-reviewer.md, lens-sentinel check | Task 3, Task 4, Task 5 | covered |
| 3 M-20: move ship doc wave-progress sentence to How the Pipeline Works; site copy | Task 8 | covered |
| 4 77-L3: move ship SKILL.md 3b sentence out of output template fence | Task 10 | covered |
| 5 setup doc: 13 ship fields, six tunables, wave timeout points at execute section; site copy | Task 9 | covered |
| 6 bare git push in commit.js/ship.js: fix with exec case if present, else drop with evidence | Task 6, Task 7, Task 8 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
