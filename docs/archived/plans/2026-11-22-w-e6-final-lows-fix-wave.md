# W-E6 Final Lows Fix Wave Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #140, 71bb076

**Commit:** `chore(W-E6): lows - fix the seven final deferred lows`
**Goal:**

- Fix the seven deferred lows still present at HEAD (items A1 to A4 of unit W-E6, decision PD-4).
- Change no behaviour and no spec: two prose fixes, one docs example, one script read and four test-wrapper or dataset fixes.

**Architecture:** Five independent tasks in one execute wave. Each shared file belongs to one task only. Task 1 rewords one sentence in execute-plan-sdlc (SKILL.md and its wave-runner template), Task 2 completes a docs example and its byte copy, Task 3 makes `plan.js splice --critique-dir` read the directory once, Tasks 4 and 5 harden test wrappers and one dataset. No register, ticket or TODO file is edited.
**Source:** docs/plans/programme.md#W-E6
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

Seven small defects ("lows") were deferred by the reviews of waves lean-w45 and lean-w48. They sit in two notes: `docs/TODO/lows-lean-w45.md` and `docs/TODO/lows-lean-w48.md`. Each one is a stale sentence, a missing docs line, a duplicate directory read or a weak test helper.

**What prompted this change now?**

The owner asked for one more low-fix wave (2026-11-22). Decision PD-4 (`docs/plans/decisions.md:26`) scopes it to items A1 to A4.

**What does success look like?**

- Every item below is fixed at its named path.
- The targeted exec cases of each task pass.
- No spec, register, TODO note or ticket changes.

**Scope items re-verified at HEAD (b1980e7):**

| Item | Lows row | Evidence at HEAD | Still present |
|---|---|---|---|
| A1 | `docs/TODO/lows-lean-w45.md` line 11, "Stale 60 s timeout rationale" | `wave-runner-template.md:103-105` and `execute-plan-sdlc/SKILL.md:390` both end "pass `--timeout` of at most 60 so the call does not block on a marker a returned worker never wrote." | yes |
| A2 | `docs/TODO/lows-lean-w45.md` line 8, "Step 12 summary gains a deferred line not shown in the reference doc" | `docs/skills/received-review-sdlc.md:250-253` shows only the addressed and pushed-back lines; `received-review-sdlc/SKILL.md:553-558` has four lines (N, M, K, D). The site copy is byte-identical (`cmp` exit 0). | yes |
| A3 | `docs/TODO/lows-lean-w45.md` line 10, "Critique dir is read twice; the bare readCritiqueDir call discards its result" | `plan.js:489` calls `readCritiqueDir` and discards the result; `plan.js:490` calls `latestGuardrailMerged`, which calls `readCritiqueDir` again (`lib/plan-critique.js:928`). | yes |
| A4(a) | `docs/TODO/lows-lean-w45.md` line 12, "The R-subagent-brief case now pins only the shared tail of the plugin-root sentence for the commit, pr and execute agents" | `run-script-resolution-case.js:67-75` counts only the `never` and `keep` sentences; the phrase "use that path wherever the skill substitutes `<PLUGIN_ROOT>`" occurs once in each of the six `agents/ship-step-*.md` files and is not pinned. | yes |
| A4(b) | `docs/TODO/lows-lean-w48.md` line 8, "prepare() parses stdout without handling a failed spawn" | `run-commit-prepare-case.js:98-101` parses `r.stdout.trim()` with no check of `r.error` or empty stdout. | yes |
| A4(c) | `docs/TODO/lows-lean-w48.md` line 9, "w25-no-git-fallback leaks its nogit- temp dir on every run" | `run-ship-hooks-case.js:348-354` creates `nogit-` with `mkdtempSync` and never removes it. | yes |
| A4(d) | `docs/TODO/lows-lean-w48.md` line 10, "Stale comment on the claimSession implicit-resume case" | `ship-hooks-exec.yaml:558-569` still says "the same expression below" and "a separate script_args"; the write and the spawn now happen inside `claimCase()` (`run-ship-hooks-case.js:158-176`). | yes |

No item was dropped.

## Research Findings

- **copy rule.** `.sdlc/config.json` `plan.copyRules` fires on any edit of `plugins/sdlc-utilities/skills/{skill}/SKILL.md`. For execute-plan-sdlc it requires `docs/skills/execute-plan-sdlc.md`, its site copy, `site/src/data/skills-meta.ts` and every `skills/execute-plan-sdlc/*.md` companion in the same task's **Files:**. Task 1 lists them; all but the template are check-only. A2 edits only the user doc, not `received-review-sdlc/SKILL.md`, so the copy rule does not fire for it.

- **Literal greps for the reworded A1 sentence.** `git grep` over `tests`, `.claude`, `plugins/sdlc-utilities/scripts` and `docs` for the whole sentence and the fragments "never wrote", "block on a marker", "so the call does not", "at most 60", "some workers have already", and the `~`/`\x20` joined forms "never~wrote", "returned~worker", "at~most~60" finds no test or check script. The only hits are archived plans. `check-handback-sentinels.js:79-83` pins other sentences of the same step (`WAIT_TARGET`) and stays green.

- **Docs example greps for A2.** The K and D lines appear in tests only as `rrDeferred` in `check-handback-sentinels.js:73`, which reads `received-review-sdlc/SKILL.md`, not the user doc. No test reads the docs example.

- **A3 error order.** `latestGuardrailMerged` calls `readCritiqueDir` first (`lib/plan-critique.js:928`). So calling only `latestGuardrailMerged` on the guardrail path keeps the R67(f) usage error (exit 1) for an unreadable `--critique-dir`, before the plan file is read. The `--no-guardrails` path must still call `readCritiqueDir`. Acceptance: `plan-splice: (e) --critique-dir usage and empty cases (R77)` in `plan-prepare-exec.yaml:1529`.

- **Test wrappers.** Each wrapper under `tests/promptfoo/scripts/run-*-case.js` prints one JSON line per case. An uncaught throw exits non-zero with the message on stderr, and the case assertion then fails with that text. `prepare()` is used by the `commit-subject:` cases (`run-commit-prepare-case.js:146-198`) and by `trailers-valued` and `trailers-malformed` (`:224`, `:229`; the `commit-trailers:` cases). `commit.js --output-file` prints the manifest path even on its exit-1 validation errors (case `subject-empty`), so the new check must test `r.error` and empty stdout, never the exit status.

- **Count and floor checks (F-104).** No task adds or deletes a test case or an `assert` entry. `tests/promptfoo/baselines/spec-id-coverage.json:542` records 33 asserts for `sdlc-script-resolution-exec.yaml` and stays 33 (Task 4 edits the body of an existing javascript assertion). The wrapper case counts (`run-script-resolution-case.js --case`: 2, `run-commit-prepare-case.js --case`: 23, `run-ship-hooks-case.js --case`: 24) do not change. `dataset-asserts-allow.json` lists no case touched here.

- **Commands.** Plan-format validator: `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --markdown --file <plan> --final --template plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md --root .`. Targeted exec runs use the **Verification:** command above with `-j 1` (parallel runs hit EISDIR).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| A2 example counts | no | adds the K and D lines with the count 0 (`- 0 comments intentionally skipped …`, `- 0 comments deferred …`) | the example's scenario has no skipped or deferred comment; 0 keeps the example consistent while showing every line of `received-review-sdlc/SKILL.md:553-558` |
| A4(b) failure signal | no | throws an `Error` (uncaught, non-zero exit, message on stderr) instead of printing JSON | the brief says "throw with stderr and status"; the case assertion then fails with a readable reason |
| A1 wording | no | uses one new sentence in both files (rendered in Task 1) | the scope requires the same text in both places |

## Key Decisions

- **Five tasks, one wave, over seven tasks.** A4(b), (c) and (d) are three small test hygiene fixes in three files. One task for them keeps the wave short. A4(a) is its own task because it changes an assertion. No file is shared between tasks, so all five run in parallel.

- **A3: branch on `--no-guardrails` over a new `names` parameter.** The alternative is to pass the directory listing into `latestGuardrailMerged`. That changes a library signature for no gain. Calling `readCritiqueDir` only on the `--no-guardrails` path keeps one read per run and touches one file.

- **A4(a): add a third count `c` over replacing `a`.** The existing `a` and `b` counts stay, so nothing that the case pinned before is lost. The new count pins the first half of the plugin-root sentence in all six step agents.

## Decisions taken without the owner

- The A2 example uses count 0 for the two new lines (see Deviations).
- The commit type is `chore`, as the brief requires, although the wave mixes docs, script and test fixes.

## Contract Examples

**code** (Task 3):

```markdown
**Contract:**
- shape (code): `runSplice(flags)` in `plugins/sdlc-utilities/scripts/skill/plan.js`; `--critique-dir` branch reads the directory once.
- names: `runSplice`, `readCritiqueDir`, `latestGuardrailMerged`.
- mirror: `plugins/sdlc-utilities/scripts/lib/plan-critique.js:927-950`.
- decisions: branch on `flags.noGuardrails`.
- sync: none.
```

**docs** (Task 2):

```markdown
**Contract:**
- shape (docs): MODIFY the `### Reply to review threads after fixing` example in `docs/skills/received-review-sdlc.md`; add two lines.
- names: lines `- 0 comments intentionally skipped (agree, won't fix)` and `- 0 comments deferred (needs discussion or below threshold)`.
- mirror: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md:553-558`.
- decisions: count 0.
- sync: `site/src/content-source/skills/received-review-sdlc.md` byte copy.
```

## Tasks

### Task 1: Replace the stale 60 s timeout reason in execute-plan-sdlc

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — reword the `--timeout` reason in §2b step 2
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — reword the same reason in "Wave deadline (direct mode)" step 2
- Modify: `docs/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — check only, no change expected
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/recovering-from-failures.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/spec-compliance-reviewer.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/state-format.md` — check only, no change expected

**Notes:** Fixes `docs/TODO/lows-lean-w45.md` line 11 ("Stale 60 s timeout rationale"). Implements R92 (docs/specs/execute-plan-sdlc.md), no behaviour change: the 60 s cap stays. The old reason predates the wait listing only unreturned workers; the cap now matters when a listed worker returns during the call without writing `reporting`. The check-only files are the copy-rule companions; none states the reason (greps in Research Findings).

**Acceptance criteria:**
- [x] Both files carry the new sentence below exactly once, and neither contains "a marker a returned worker never wrote".
- [x] `git grep -n "at most 60" -- plugins/sdlc-utilities/skills/execute-plan-sdlc` shows the same sentence text in both files (line wrapping in the template may differ).
- [x] The targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/(handback|dispatch-resilience)"`.

**Contract:** shape (code): one sentence replaced in two prose files, as rendered below; names: sentence "When some workers have already returned, pass `--timeout` of at most 60 so the call returns soon when a listed worker returns during the call without writing its `reporting` phase."; sync: SKILL.md and wave-runner-template.md carry the same text

`SKILL.md` (end of "Wave deadline (direct mode)" step 2):

```diff
- … when the deadline has passed, go to step 4. When some workers have already returned, pass `--timeout` of at most 60 so the call does not block on a marker a returned worker never wrote.
+ … when the deadline has passed, go to step 4. When some workers have already returned, pass `--timeout` of at most 60 so the call returns soon when a listed worker returns during the call without writing its `reporting` phase.
```

`wave-runner-template.md` (§2b step 2, keep the surrounding wrap width):

```diff
    once with corrected arguments, then repeat the call as above (each failed call is retried
    once); when the deadline has passed, go to step 4. When some workers have already
-   returned, pass `--timeout` of at most 60 so the call does not block on a marker a returned
-   worker never wrote.
+   returned, pass `--timeout` of at most 60 so the call returns soon when a listed worker
+   returns during the call without writing its `reporting` phase.
 3. Use the call's `inFlight` list as the termination target in step 4: …
```

### Task 2: Add the K and D lines to the received-review reply example

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/received-review-sdlc.md` — add two summary lines to the "Reply to review threads after fixing" example
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — byte copy of the doc (`cp docs/skills/received-review-sdlc.md site/src/content-source/skills/received-review-sdlc.md`)

**Notes:** Fixes `docs/TODO/lows-lean-w45.md` line 8 ("Step 12 summary gains a deferred line not shown in the reference doc"). Docs only; SKILL.md is unchanged, so the copy rule does not fire.

**Acceptance criteria:**
- [x] The example block shows four summary lines in the SKILL.md order (addressed, pushed back, intentionally skipped, deferred), as rendered below.
- [x] `cmp docs/skills/received-review-sdlc.md site/src/content-source/skills/received-review-sdlc.md` exits 0.
- [x] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:** shape (docs): two lines added to one fenced example, as rendered below; names: `- 0 comments intentionally skipped (agree, won't fix)`, `- 0 comments deferred (needs discussion or below threshold)`; sync: site copy by `cp`

```diff
  Review feedback processing complete:
  - 2 comments addressed (code changes implemented)
  - 1 comment pushed back (with technical reasoning)
+ - 0 comments intentionally skipped (agree, won't fix)
+ - 0 comments deferred (needs discussion or below threshold)

  Should I reply to all addressed review comments on the PR and resolve the threads?
```

### Task 3: Read the critique dir once in plan.js splice

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `runSplice` `--critique-dir` branch reads the directory once

**Notes:** Fixes `docs/TODO/lows-lean-w45.md` line 10 ("Critique dir is read twice; the bare readCritiqueDir call discards its result"). `latestGuardrailMerged` already starts with `readCritiqueDir`, so the R67(f) usage error and its order (before the plan file is read) stay the same on both paths.

**Acceptance criteria:**
- [x] On one `splice --critique-dir` run, `readCritiqueDir` runs exactly once (directly under `--no-guardrails`, through `latestGuardrailMerged` otherwise).
- [x] An unreadable `--critique-dir` is still a usage error (exit 1) with and without `--no-guardrails`.
- [x] The targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-splice"`.

**Contract:** shape (code): edit inside `runSplice(flags)` as rendered below, no signature change; names: `runSplice`, `readCritiqueDir`, `latestGuardrailMerged`; sync: none

```diff
   if (flags['critique-dir'] !== undefined) {
-    readCritiqueDir(flags['critique-dir']);
-    const latest = flags.noGuardrails === true ? null : latestGuardrailMerged(flags['critique-dir']);
+    // One directory read: latestGuardrailMerged starts with readCritiqueDir (R67 (f) usage error).
+    let latest = null;
+    if (flags.noGuardrails === true) readCritiqueDir(flags['critique-dir']);
+    else latest = latestGuardrailMerged(flags['critique-dir']);
     const planText = readPlanFile(planPath);
     if (!latest) return { written: [], replaced: [], source: null };
```

### Task 4: Pin the first half of the plugin-root sentence in the six step agents

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-script-resolution-case.js` — `subagent-brief-root-line` prints a third count `c`
- Modify: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — the R-subagent-brief case asserts `c=[1,1,1,1,1,1]`

**Notes:** Fixes `docs/TODO/lows-lean-w45.md` line 12 ("The R-subagent-brief case now pins only the shared tail of the plugin-root sentence for the commit, pr and execute agents"). Tests only. No case or `assert` entry is added: `spec-id-coverage.json` stays at 33 asserts for this dataset and the wrapper still has 2 cases.

**Acceptance criteria:**
- [x] The wrapper prints `{"s":…,"a":[…],"b":[…],"c":[…]}`, `c` being the count of the phrase in `ship-step-<n>.md` for `STEPS` order (commit, review, received-review, version, pr, execute).
- [x] The case passes only when `s === 1`, `a` is `[1,1,1,1,1,1]`, `b` is `[0,1,1,1,0,0]` and `c` is `[1,1,1,1,1,1]`.
- [x] The wrapper header comment no longer says the output is byte-compatible for this case (it now adds `c`).
- [x] The targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "subagent-brief"`.

**Contract:**
- shape (code): wrapper output gains key `c`; dataset assertion gains one clause, as rendered below.
- names: constant `root` (the phrase), output key `c`.
- mirror: the `never` and `keep` constants at `tests/promptfoo/scripts/run-script-resolution-case.js:67-75`.
- decisions: keep `a` and `b`; add `c` (Key Decisions).
- sync: the phrase is copied byte for byte from `plugins/sdlc-utilities/agents/ship-step-*.md`.

```diff
   'subagent-brief-root-line'() {
     const never = "never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief).";
     const keep = 'the `sdlc plugin root:` line the skill names, not one of the other occurrences the skill tells you to ignore';
+    const root = 'use that path wherever the skill substitutes `<PLUGIN_ROOT>`';
     …
       b: STEPS.map((n) => count(agent(n), keep)),
+      c: STEPS.map((n) => count(agent(n), root)),
     }));
```

```diff
-        if (o.s === 1 && JSON.stringify(o.a) === '[1,1,1,1,1,1]' && JSON.stringify(o.b) === '[0,1,1,1,0,0]') return true;
+        if (o.s === 1 && JSON.stringify(o.a) === '[1,1,1,1,1,1]' && JSON.stringify(o.b) === '[0,1,1,1,0,0]' && JSON.stringify(o.c) === '[1,1,1,1,1,1]') return true;
```

### Task 5: Harden the commit and ship-hooks test wrappers and fix a stale comment

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-commit-prepare-case.js` — `prepare()` throws on a failed spawn or empty stdout
- Modify: `tests/promptfoo/scripts/run-ship-hooks-case.js` — `w25-no-git-fallback` removes its `nogit-` dir in `finally`
- Modify: `tests/promptfoo/datasets/ship-hooks-exec.yaml` — reword the comment above the claimSession implicit-resume case

**Notes:** Fixes `docs/TODO/lows-lean-w48.md` lines 8 ("prepare() parses stdout without handling a failed spawn"), 9 ("w25-no-git-fallback leaks its nogit- temp dir on every run") and 10 ("Stale comment on the claimSession implicit-resume case"). Tests only. The check never looks at the exit status, because `commit.js` exits 1 with a manifest path on stdout in the `subject-empty` case. The write stays inside `claimCase()` (scope item A4(d)). No case is added or removed.

**Acceptance criteria:**
- [x] `prepare()` throws an `Error` whose message holds the status, the spawn error message (when set) and stderr, when `r.error` is set or `r.stdout` is empty after trim; otherwise it returns `{ status, out }` as before.
- [x] `w25-no-git-fallback` prints the same JSON as before and removes the `nogit-` directory in a `finally` block, also when `print` or a hook run throws.
- [x] The comment above "claimSession (R73, #505): implicit resume reclaims sessionId …" no longer says "the same expression below" or "a separate script_args", and says that the write and the spawn happen inside `claimCase()` in `run-ship-hooks-case.js`.
- [x] The targeted runs pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^commit-(subject|trailers):"` and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "no .git anywhere|implicit resume reclaims"`.

**Contract:**
- shape (code): two helper edits and one YAML comment, as rendered below; no new flag, case or output key.
- names: `prepare`, case `w25-no-git-fallback`, `claimCase`.
- mirror: the `fs.rmSync(stateDir, { recursive: true, force: true })` cleanup at `tests/promptfoo/scripts/run-ship-hooks-case.js:148`.
- decisions: throw (not print JSON) on a failed spawn (Deviations row "A4(b) failure signal").
- sync: none.

```diff
 function prepare(args) {
   const r = spawnCommit(['--output-file', ...args]);
-  return { status: r.status, out: JSON.parse(readText(r.stdout.trim())) };
+  const file = (r.stdout || '').trim();
+  if (r.error || !file) {
+    throw new Error(`commit.js --output-file failed (status ${r.status})${r.error ? `: ${r.error.message}` : ''}\n${r.stderr || ''}`);
+  }
+  return { status: r.status, out: JSON.parse(readText(file)) };
 }
```

```diff
   'w25-no-git-fallback'() {
     const noGitDir = fs.mkdtempSync(os.tmpdir() + '/nogit-');
-    print({
-      gitStatus: …,
-      runs: …,
-    });
+    try {
+      print({
+        gitStatus: …,
+        runs: …,
+      });
+    } finally {
+      fs.rmSync(noGitDir, { recursive: true, force: true });
+    }
   },
```

```diff
 #    on-disk sessionId must flip to B.
-#    "fresh" here comes only from the fs.writeFileSync() call happening
-#    milliseconds before the ship.js spawn in the same expression below —
-#    resume.fresh is an mtime check, and nothing else in this case touches
-#    the file's mtime. Do not reorder or split the write out from the spawn
-#    (e.g. into a separate script_args or an earlier setup step): doing so
-#    lets the mtime age past …
+#    "fresh" here comes only from claimCase() in run-ship-hooks-case.js: it
+#    writes the state file milliseconds before it spawns ship.js, in the same
+#    function. resume.fresh is an mtime check, and nothing else in this case
+#    touches the file's mtime. Keep the write inside claimCase(), right
+#    before the spawn; moving it to an earlier setup step lets the mtime age
+#    past …   (rest of the comment unchanged)
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code and test edits are covered by targeted exec cases; the plan adds no new behaviour, and the existing plan-splice cases cover the plan.js refactor |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled |
| no-auto-eval | error | PASS | Only targeted, exec-only runs with -j 1 and no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map one-to-one to items A1 to A4 of PD-4 |
| single-responsibility-tasks | warning | FAIL | Task 5 bundles three deliverables in three files: prepare() hardening, nogit- cleanup and a YAML comment |
| scripts-over-llm-logic | error | PASS | No skill logic is added; the only SKILL.md change is a sentence rewording |
| yagni | warning | PASS | No speculative abstractions; the A3 fix is a simple branch |
| cross-skill-consistency | error | PASS | The same sentence is applied in SKILL.md and the wave-runner template; the docs copy is kept in sync |
| pr-link-github-issue | error | PASS | W-E6 is an internal register id, so the rule does not apply |
| dry | warning | PASS | No duplicated logic; the shared sentence is a required sync |
| kiss | warning | PASS | Minimal edits throughout |
| spec-first | error | PASS | Task 1 is a prose rewording with no behaviour change (R92 cited), so no spec task is needed |
| project-agnostic | error | PASS | Changes are to plugin code, plugin docs and tests, not repo-local config |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag dispatch is changed |
| no-opposite-logical-vectors | error | PASS | No gate conditions are introduced or changed |
| flag-resolution-single-source | warning | PASS | The existing flags.noGuardrails check is reused and no flag is re-derived |
| state-premise | error | PASS | Context states the problem: seven deferred lows |
| smallest-viable-cut | warning | PASS | The scope is fixed by PD-4, and Key Decisions justifies the task grouping |
| failure-audience | warning | FAIL | The plan does not name who or what fails if it ships incorrectly |
| explicit-non-goals | warning | PASS | The plan states that no spec, register, ticket or TODO note is edited, and drops no item |
| ambiguity-stops-and-asks | error | PASS | The A3 and A4(a) alternatives and the A2 count 0 are recorded in Key Decisions and Deviations |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are changed |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added |
| workspace-mode-compatibility | error | PASS | No state, config or path logic is changed; the plan.js edit only reorders a directory read |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are introduced into dispatched prompts |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Task 1 and Task 2 edit only markdown (`plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` and `docs/skills/received-review-sdlc.md`), which the code-quality dimension's triggers do not cover until `**/*.md` is added.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 0 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 A1: replace the stale 60 s timeout reason in wave-runner-template.md and execute-plan-sdlc/SKILL.md | Task 1 | covered |
| 2 A2: add the K and D lines to docs/skills/received-review-sdlc.md and its site copy | Task 2 | covered |
| 3 A3: read the critique dir once in plan.js runSplice | Task 3 | covered |
| 4 A4(a): count the plugin-root phrase in the six step agents and assert c=[1,1,1,1,1,1] | Task 4 | covered |
| 5 A4(b): prepare() throws with stderr and status on a failed spawn or empty stdout | Task 5 | covered |
| 6 A4(c): w25-no-git-fallback removes its nogit- temp dir in try/finally | Task 5 | covered |
| 7 A4(d): reword the stale comment above the claimSession implicit-resume case | Task 5 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- execute-plan-sdlc states one current reason for the 60 s `--timeout` cap, in the same words in SKILL.md and the wave-runner template.

- The received-review user doc and its site copy show all four summary lines of Step 12.

- `plan.js splice --critique-dir` reads the critique directory once per run and keeps its usage errors.

- The R-subagent-brief exec case pins both halves of the plugin-root sentence in all six step agents.

- The commit test wrapper fails with a readable message when `commit.js` cannot run, the no-git hook case leaves no temp directory behind, and the implicit-resume comment matches the code.

- No spec, register, ticket or TODO note changes.

## OpenSpec Appendix

Not applicable — no OpenSpec change
