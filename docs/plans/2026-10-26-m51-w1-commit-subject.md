# commit-sdlc Takes the Planned Subject (W8.24, M5.1 wave 1) Implementation Plan

**Commit:** `feat(#9017): commit-sdlc - take the planned subject (W8.24)`

**Goal:**
- `skill/commit.js` parses `--subject`, `--message-file` and `--expected-subject`.
  - It checks every given subject before any draft (empty, line break, more than 72 characters, disagreement), as an `errors[]` entry with exit 1.
  - It prunes this branch's earlier `.msg` message files itself.
- commit-sdlc's SKILL.md uses the given subject or message file:
  - it skips the message agent when a message file is given;
  - its subject gate exits 3 when the written message differs from what the caller gave (E9, E10);
  - it no longer runs `rm -f "$COMMIT_CONTEXT_FILE"`.
- `skill/ship.js` forwards a plan's `**Commit:**` header subject to the `commit` step as `--subject "<subject>"`. It never forwards one to `commit-fixes`.
- Docs, the agent file and promptfoo exec cases follow. The specs were committed first by `docs/plans/2026-10-26-m51-w1-commit-subject-spec.md`.

**Architecture:** One `/sdlc:ship-sdlc --plan docs/plans/2026-10-26-m51-w1-commit-subject.md --steps execute,commit --rebase skip --quality balanced` run (ruling w1-oneship) executes the eight tasks and makes exactly ONE in-ship commit. Its subject is `feat(#9017): commit-sdlc - take the planned subject (W8.24)` (59 characters; type `feat` is in `commit.subjectPattern` `^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`). Its files are exactly the eight listed under Final Shape. The `**Commit:**` line above is R66's header field. The installed plugin (0.21.29) does not read it yet; it is there so the next ship run after the owner's plugin update can.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-1-plan-source.md (plan 2), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/item-W8.24-cd6e665.md (Changes 2–10), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/preflight-wave-1.md ("Current line numbers to use (at cd6e665)"), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w1-preflight.md, specs as committed by `docs/plans/2026-10-26-m51-w1-commit-subject-spec.md`, discovery brief /tmp/sdlc-explore-m51-w1-9017-commit-subject-LD4lxo/discovery-brief.md

**Verification:** from the repository root, after all eight tasks:
1. `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . 2>/dev/null; echo "exit=$?"` prints only `exit=0`. It prints only `exit=0` at cd6e665 too. P-5 `SAME` for the spec commit is plan 1's check.
2. `cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=$(mktemp -d /tmp/m51w1-exec-XXXXXX) npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "commit-subject|commit-prepare|commit-literal-message|ship-prepare"` passes with 0 failures. `/tmp` is outside every work tree and matches the script-runner's temp-path rule (`tests/promptfoo/providers/script-runner.js:27`).
3. `node .claude/skills/validate-plugin-consistency/check-consistency.js > /dev/null; echo "exit=$?"` prints `exit=0`. It does at cd6e665.
4. `grep -nE 'commit (--amend )?-m "<message>"' plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` prints nothing (W8.1, M5.1 exit criterion). It prints nothing at cd6e665.
5. `grep -n 'rm -f "\$COMMIT_CONTEXT_FILE"' plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` prints nothing. At cd6e665 it prints 7 lines (`:46`, `:53`, `:54`, `:55`, `:203`, `:240`, `:258`).
6. Consumer grep (addendum C9): `grep -rlF -e 'COMMIT_CONTEXT_FILE' -e 'pruned on the next run' -e '{ noStash, scope, type, amend, auto }' -e 'argument-hint: "[--no-stash]' tests/promptfoo docs site/src plugins --exclude-dir=plans | sort`.
   - At cd6e665 it prints: `docs/specs/commit-sdlc.md`, `plugins/sdlc-utilities/agents/commit-orchestrator.md`, `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md`, `site/src/content-source/specs/commit-sdlc.md`, `tests/promptfoo/datasets/commit-sdlc.yaml`, `tests/promptfoo/scripts/run-commit-literal-message.js`.
   - After the spec commit and these tasks, it must print no file outside that list plus `tests/promptfoo/datasets/commit-prepare-exec.yaml`. That dataset is a deliberate new consumer: the Task 5 `commit-subject: expected-subject gate` case splits the gate out of SKILL.md on `\x22<COMMIT_CONTEXT_FILE>\x22`, and check 2 runs it (ruling w1-plancheck B1). The expected end-state output, from the arbiter's simulation, is: `docs/specs/commit-sdlc.md`, `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md`, `site/src/content-source/specs/commit-sdlc.md`, `tests/promptfoo/datasets/commit-prepare-exec.yaml`, `tests/promptfoo/datasets/commit-sdlc.yaml`, `tests/promptfoo/scripts/run-commit-literal-message.js`. (`agents/commit-orchestrator.md` drops out because Task 2 replaces its `{ noStash, scope, type, amend, auto }` row.)
   - Exec cases to re-run because of these hits: `commit-literal-message` (the wrapper extracts the gate block), every `commit-prepare` and `commit-subject` case, and every `ship-prepare` case. All are in check 2.
7. The one behavioural case, LAST: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig.yaml --filter-pattern "commit-sdlc: manifest cleanup on pre-commit hook failure"`. This is Task 8's updated case (ruling w1-plan R2: test-only Files extension `tests/promptfoo/datasets/commit-sdlc.yaml` :170-192 and :281, §0 rule 5) and the item's Verification (4): the single targeted behavioural case and the last check. Run it once, only when the orchestrator confirms the run under the testing policy.

---

## Context

**What problem does this change solve?**

- commit-sdlc's message agent (the commit-orchestrator, a small model that drafts the commit message) always invents the subject line. Callers that already know the planned subject had to throw the draft away and finish the commit by hand. That happened 18 times in M4.1 (item W8.24, Source).
- The skill's prompt also deleted its own manifest under the owner checkout's `.sdlc/execution/`. That clashed with the orchestration rule against deletes there (`rootcause-commitjs.md` §1, stop-2).
- The owner's scope (ruling commit-wrapper item 4; arbiter ruling pr40 F2):
  - `--subject`, `--message-file` and `--expected-subject`;
  - ship passes the plan's subject;
  - the 72-character check runs before drafting;
  - the script prunes the manifests.

**What prompted this change now?**

- W8.24 is M5.1 wave 1, the first item (owner). Its spec commit (plan 1) lands first; this is the code plan.

**What does success look like?**

- A caller gives `--subject "<s>"`, and the commit's subject is `<s>` byte for byte. A difference stops the commit (gate exit 3).
- `--message-file` commits a prepared message without the message agent.
- `--expected-subject` stops an `--auto` run whose draft differs.
- Given subjects longer than 72 characters fail in `commit.js`, before any draft.
- No `rm -f "$COMMIT_CONTEXT_FILE"` is left in SKILL.md.
- Ship forwards a plan's `**Commit:**` subject to its `commit` step.
- All `commit-subject`, `commit-prepare`, `commit-literal-message` and `ship-prepare` exec cases pass.

---

## Research Findings

- **`commit.js` parsing.** `parseArgs` (`commit.js:66-101`) consumes a flag's value only when `args[i + 1]` is truthy, so `--subject ""` and a bare trailing `--subject` would be silently ignored (F-commit-ship-exec-test-shapes-3). The new flags read the next token explicitly and treat a missing value as `''`, which the pre-draft check rejects. `commit.js` imports no `fs` today (`:31-40`).
- **`errors[]` and exit 1.** `errors[]` entries pushed before the staged-files gate reach the output on every path: the success-path manifest (`:356-358`, exit 1 when non-empty) and the "nothing staged" path (`:271`) (F-commit-script-flags-manifests-3). The pre-draft check therefore goes next to the existing type/scope validation (`:231-242`).
- **Pruning.** `writeManifestState` already prunes same-branch `.json` manifests (`lib/state.js:402-421`, F-commit-script-flags-manifests-7). `.msg` files are never pruned. `resolveStateDir` and `slugifyBranch` are exported by `lib/state.js` (ship.js imports both at `:44`).
- **The subject gate** is one `node -e` block in SKILL.md (`:192-200`). Its first argument is the manifest and its second the message file. `run-commit-literal-message.js:73` finds it by the string `"<COMMIT_CONTEXT_FILE>" "<MSG_FILE>"` and runs it with a manifest that has no `flags` (`:99`), so new checks guarded by `m.flags || {}` keep that case green (F-commit-ship-exec-test-shapes-7). `node -e '` occurs once in SKILL.md (`grep -c "node -e '"` prints `1` at cd6e665), so an exec case can extract the gate script by splitting on it.
- **Exec test mechanics.** `script-runner.js:90` splits `script_args` on whitespace, so a subject with spaces cannot be passed as `script_args` (F-commit-ship-exec-test-shapes-3). The established workaround in this repository is `script_path: "-e"` with a whitespace-free one-liner that spawns the target with an argv array (`tests/promptfoo/datasets/ship-hooks-exec.yaml:108-109`). That dataset runs under `promptfooconfig-exec-hooks.yaml` with `hook-runner.js:72,95`; `providers/script-runner.js:90,140` uses the same whitespace split and the same `node [script_path, ...args]` spawn, so the pattern applies unchanged to `promptfooconfig-exec.yaml`. Inside it, `\x20` stands for a space, `\x27` for `'`, `\x22` for `"`, `\x24` for `$` and `\x60` for a backtick. No new fixture, wrapper or assertion file is needed.
- **Ship.** The commit-step args are a space-joined string (`ship.js:467-470`). `step.invocation` wraps them in plain quotes (`:767-771`). Tests assert `--expected-branch` presence with `includes`, not equality (`ship-prepare-exec.yaml:1114-1115`). `computeSteps` is called from `main` (`:2461`) and from the `--after` recompute (`:1823`), both with `planFile`. Prepare errors are `{id, message}` objects, mirrored to stderr by `writeFatalErrors` (`:2622`).
- **Behavioural dataset.** `tests/promptfoo/datasets/commit-sdlc.yaml:170-192` and `:281` describe the `rm -f` cleanup that this item removes (F-commit-ship-exec-test-shapes-9). That file is outside the item's Files (see Deviations).

---

## Plan readings

- **Spec-first** (plan Execution conventions; arbiter 2026-10-20): spec-consequence commits go FIRST; never record a waiver nobody gave. → Plan 1 (`docs/plans/2026-10-26-m51-w1-commit-subject-spec.md`) commits the spec before this plan's ship run.
- **One ship run per wave branch** (owner "accept" 2026-10-20, ruling w1-oneship): only the feat plan goes through ship; spec commits go direct; a second planned run would use `/sdlc:execute-plan-sdlc` directly. → This plan is the one ship run.
- **Direct commits** (ruling commit-wrapper item 1; in force for ALL of M5.1, because W8.24 is not installed until the owner's swap): one call `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "<exact subject>" <body-file> <files…>`; the body file has NO `Co-Authored-By` line (ruling w3-trailers).
- **In-ship commit** (ruling w1-run1commit item 2; ruling w1-plancheck m1): accepted only when its subject equals the plan subject and its files equal the plan's files; a different subject is a STOP, never an amend. → Subject `feat(#9017): commit-sdlc - take the planned subject (W8.24)`; files: those listed under Final Shape.
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → 59 characters.
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1). → No new fixture `setup.sh` is created; all cases reuse `project-commit-no-config`, `project-commit-on-default-branch` and `project-sdlc-gitignore-inner`.
- **Classifier refusals** (ruling w4-curl): the plan's task text tells execute's workers to stop and report on a classifier refusal and never switch tools; public docs only via WebFetch. → Every task carries the worker rules line below.
- **Worker temp files** (ruling stop-w3-2): a worker's ephemeral temp file is created under `$TMPDIR` and removed in its own run; none is left behind.
- **No adapted verification** (ruling w2-judge row 52): every command in the plan runs exactly as written; test each grep against the current text before you write it, and give its current output.
- **Files extensions:** any file outside the item's Files list is a QUESTION, never assumed. → One, raised and confirmed: ruling w1-plan R2: test-only Files extension `tests/promptfoo/datasets/commit-sdlc.yaml` :170-192 and :281, §0 rule 5 (Task 8).
- **ruling w1-preflight Q1:** P2, the agent's flags row and the docs flags table gain the keys `commit.js:196` already emits (`noSquashWip`, `skipConfigCheck`, `forceDefaultBranch`). In the docs table, `--no-squash-wip` and `--force-default-branch` already have rows (`docs/skills/commit-sdlc.md:26-27`), so only `--skip-config-check` is added. No follow-up is filed.
- **ruling w1-preflight Q2:** `commit-fixes` stays unchanged and forwards no subject.
- **ruling w1-preflight Q3** (orchestration-placed items, not in this wave): #9172 goes to the joined wave 4+5, #9174 to the joined wave 2+3.
- **ruling w1-plan R1: `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'.**
- **ruling w1-plan R2: test-only Files extension `tests/promptfoo/datasets/commit-sdlc.yaml` :170-192 and :281, §0 rule 5.** The updated hook-failure case is Verification check 7 (the item's Verification (4)), the single targeted behavioural case and the last check.
- **ruling w1-plan R3: plan-sdlc does not emit `**Commit:**`; follow-up #9176.**
- **ruling w1-plan E8: the E8 contract (trigger, printed reason, stop without commit, no prompt or error report) is unchanged; only the cleanup Change 10 moves into the script goes.**

**Worker rules (every task):** On a classifier refusal, stop and report it; never retry, reword or switch tools. Public docs only via WebFetch. Create any ephemeral temp file under `$TMPDIR` and remove it in the same run. Run no behavioural promptfoo case and no `claude` command. Locate every quoted line with `grep -n` before editing; if it does not occur exactly once, stop and report (§0 rule 2). Apply multi-site edits in one file bottom-up.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Task 8 edits `tests/promptfoo/datasets/commit-sdlc.yaml` (outside the item's Files) | yes (ruling w1-plan R2) | rewrites two behavioural rubrics that still describe the removed `rm -f "$COMMIT_CONTEXT_FILE"` cleanup | Without it, the two cases at `:170` and `:263` (rubric `:281`) assert behaviour this item removes. Confirmed: ruling w1-plan R2: test-only Files extension `tests/promptfoo/datasets/commit-sdlc.yaml` :170-192 and :281, §0 rule 5. |
| Change 4's E9 check "after `:135`" is enforced by the Step 5 gate (exit 3); the text after `:135` states the rule | no | deterministic byte comparison in the existing gate script | scripts-over-llm-logic; plan 1 KD1. |
| `--subject` alone still dispatches the message agent (body only) | yes (ruling w1-plan R1) | the agent is skipped only with `--message-file` | Change 3 vs Change 7 wording; plan 1 Deviations row 5 (D3); ruling w1-plan R1: `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'. |
| SKILL.md keeps `rm -f "<MSG_FILE>"` at `:222` and `:242` | no | only the `rm -f "$COMMIT_CONTEXT_FILE"` lines go | The plan source lists only those lines; the two kept lines are W8.1 message-file text (Must not touch). The script now prunes `.msg` files anyway. |
| E8's `rm -f` at `:203` goes | no | the E8 branch prints and stops; the next run prunes | Named in the plan source D6; spec E8 reworded in plan 1; ruling w1-plan E8: the E8 contract (trigger, printed reason, stop without commit, no prompt or error report) is unchanged; only the cleanup Change 10 moves into the script goes. |
| Exec cases use `script_path: "-e"` one-liners instead of new wrapper or fixture files | no | inline one-liners, whitespace-free, with `\x20` escapes | Change 6 (a) needs a spaced argument that `script_args` cannot carry; the inline pattern keeps the item's Files list. |
| The order of Change 6 (a)–(d) assertions follows the item exactly; case (a)'s value is `docs(#1): x - y` | no | passes it via argv | The item's exact values. |

---

## Key Decisions

1. **Subjects reach `commit.js` as argv, and commit-sdlc's Step 0 line stays unchanged.**
   - The ship-forwarded value is `--subject "<subject>"`.
   - plan-sdlc R66 bans `"`, backtick, `$` and `\` in it. That makes the double-quoted word safe in `node … commit.js --output-file $ARGUMENTS` (Step 0).
   - The alternative was a temp file handed to ship. It would add a file lifecycle for no gain.
2. **Pruning is a small helper in `commit.js` (`pruneCommitMessageFiles`), called just before `writeManifestState`.**
   - It is not a change to `lib/state.js`. The item's Files list `commit.js`, not the library.
   - `pruneStateFiles` filters to `.json` and is shared with ship, execute and plan state. Widening it would touch their files too.
3. **Ship validates the field at prepare time, including `commit.subjectPattern`.**
   - A bad planned subject fails before execute spends a run.
   - The pattern check repeats R6 on purpose: R6 stays the commit-time gate, and this check is an early warning with its own error id.
   - D8: the `commit-fixes` step stays byte-identical and forwards no subject, because review fixes have no planned subject (ruling w1-preflight Q2; spec plan KD7).
4. **The exec cases write their inputs into the fixture copy (`process.cwd()`) or into a `mkdtemp` directory that the same one-liner removes.** Nothing is left outside the harness's fixture copies (Worker temp files ruling).
5. **Workspace modes (workspace-mode-compatibility).** Each of the three surfaces behaves the same under `workspace: branch` and `workspace: worktree`:
   - The state directory comes from `resolveStateDir()`, which is always `<main worktree>/.sdlc/execution/`. So the `.msg` prune finds the same files that R15's `.json` prune finds. The prune is keyed on the slug of the branch checked out in the current worktree, so it has the same isolation as R15's `.json` prune: a run does not prune another branch's files, except that detached-HEAD runs (slug `HEAD`, `lib/git.js:107`) and colliding slugs (for example `feat/x` and `feat-x`) share files.
   - `--message-file` is resolved with `path.resolve` against the `commit.js` process's cwd, which is the checkout being committed (the feature worktree or the branch checkout). `flags.messageFile` is absolute from then on, so the gate reads the same file.
   - Ship reads `commit.subjectPattern` with `readSection(projectRoot, 'commit')`. `projectRoot` is `resolveSdlcRoot()` (`ship.js:2114`), the main worktree's `.sdlc/`, which is the same config commit-sdlc's own gate uses. The plan path is already absolute (`resolvePlanFile`).
6. **One parser for the plan field (flag-resolution-single-source).**
   - `readPlanCommitSubject` is the only code that reads the `**Commit:**` field. It runs twice:
     - in `main`, with the pattern, as the gate;
     - in `computeSteps`, without the pattern, to build args.
   - `computeSteps` also runs on `--after` calls, which have no prepare-time config. A run with an invalid field never reaches `computeSteps` with a ledger, because prepare exits 1 first.
   - In SKILL.md, "the given subject" is defined once (Task 3, Step 2), and every later site refers to it.
7. **Smallest viable cut.**
   - The minimal useful change is `--subject` plus the gate's exit 3. That alone removes the hand-finished commits.
   - The owner's scope (ruling commit-wrapper item 4) adds four parts:
     - `--message-file`, for callers that already hold a full message;
     - `--expected-subject`, a fail-fast check without forcing the subject;
     - ship forwarding, so in-ship commits get the planned subject;
     - script pruning, which removes the `.sdlc/` delete conflict.
   - Each of these is one requirement with one test. Task 8 exists only to keep the behavioural dataset true.
8. **ruling w1-plan R1:** `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'. Task 2 and Task 3 implement it: the agent writes only the body, the gate's exit 3 is E9, and Step 2 skips the agent for `--message-file`.
9. **CRLF message files.** A CRLF message file is rejected, by design (ruling w1-plancheck m6): its first line ends in `\r`, which `checkGivenSubjects` reports as `--message-file first line contains a line break.` Git messages are LF; the user converts the file.

**Non-goals:**
- plan-sdlc does not write the `**Commit:**` field (ruling w1-plan R3: plan-sdlc does not emit `**Commit:**`; follow-up #9176).
- `commit-fixes` gets no subject (ruling w1-preflight Q2).
- No change to the W8.1 message-file path, the quoted heredoc, R6, R12, the `wip` rules or `--amend`'s other behaviour.
- No subject-pattern check in `commit.js` (R6 stays the gate's job).
- No change to `lib/state.js` or `lib/output.js`.
- No change to the two `rm -f "<MSG_FILE>"` lines.

**Failure audience:**
- If ship's field check is wrong, ship runs on plans that carry a `**Commit:**` line stop at prepare with `planCommitSubjectInvalid`. Plans without the field are unaffected.
- If the gate's exit 3 is wrong, commit-sdlc runs given `--subject`, `--message-file` or `--expected-subject` stop without committing. Runs without these flags are unaffected, because every new gate line is guarded by a flag.
- If the prune is wrong, other branches' or other skills' files in `.sdlc/execution/` could be deleted. The `prune` exec case guards exactly that.

---

## Contract Examples

```markdown
**Contract:**
- shape (code): `parseArgs(argv)` returns `{ …, subject: string|null, messageFile: string|null, expectedSubject: string|null }`; `checkGivenSubjects({ subject, messageFile, expectedSubject }): string[]`; `pruneCommitMessageFiles(branch: string): void`.
- names: `checkGivenSubjects`, `pruneCommitMessageFiles`, `MAX_SUBJECT_CHARS`.
- mirror: the type/scope validation block at `commit.js:231-242`.
- decisions: KD2; missing flag value → `''` → rejected.
- sync: SKILL.md gate reads `flags.subject|messageFile|expectedSubject`; spec P2 lists them.
- example: `--subject ""` → `errors: ["--subject is empty."]`, exit 1.
```

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/commit-sdlc.md` Flags table (rows after `--expected-branch`) and the "What It Creates or Modifies" table (row after the `.json` manifest row).
- names: rows `--subject <text>`, `--message-file <path>`, `--expected-subject <text>`, `--skip-config-check`; row `.sdlc/execution/commit-<slug>-<ts>.msg`.
- mirror: row style of `docs/skills/commit-sdlc.md:28`.
- decisions: user-facing wording; spec ids only in parentheses.
- sync: SKILL.md argument-hint (Task 3).
- example: `| \`--subject <text>\` | Use \`<text>\` verbatim as the commit subject … | Unset (subject drafted) |`
```

---

## Tasks

### Task 1: `commit.js` — new flags, pre-draft checks, `.msg` pruning

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/commit.js` — parse three flags; `checkGivenSubjects`; `pruneCommitMessageFiles`; flags object; header comment.

**Notes:** Implements commit spec A7–A9, R-subject-precheck and R-script-prune (F-commit-script-flags-manifests-1, -2, -3, -7; F-commit-ship-exec-test-shapes-3). Cross-skill flag check (flag-semantic-consistency-cross-skill): `grep -lE -- "'--(subject|message-file|expected-subject)'" plugins/sdlc-utilities/scripts/skill/*.js` prints nothing at cd6e665 (exit 1), so no other prepare script gives these names another meaning. Edit bottom-up. Every anchor below printed `1` with `grep -cF` at cd6e665. The exec cases live in Task 5.

**Acceptance criteria:**
- [ ] `node -e 'const {parseArgs}=require("./plugins/sdlc-utilities/scripts/skill/commit.js");console.log(JSON.stringify(parseArgs(["n","s","--subject","a b","--expected-subject","--message-file","m.txt"])))'` prints JSON with `"subject":"a b"`, `"expectedSubject":""` and `"messageFile":"m.txt"`.
- [ ] `grep -c "require('node:fs')" plugins/sdlc-utilities/scripts/skill/commit.js` prints `1`.
- [ ] The Task 5 cases `commit-subject: (a)`–`(d)`, `message-file`, `length before draft` and `prune` pass, as do all existing `commit-prepare` cases.

**Contract:**
- shape (code): the diffs below, verbatim.
- names: `subject`, `messageFile`, `expectedSubject` (flags keys); `checkGivenSubjects`, `pruneCommitMessageFiles`, `MAX_SUBJECT_CHARS`; error strings `"<label> is empty."`, `"<label> contains a line break."`, `"<label> is <n> characters; the limit is 72."`, the shell-character error for `--subject`/`--expected-subject` (exact template literal in the code block; it starts `<label> contains "`), `"--message-file needs a path."`, the path-character error (exact text in the code block; it starts `--message-file path contains`), `"--message-file <path> cannot be read: <reason>"`, `"Given subjects disagree: <label> \"<s>\", …."`.
- mirror: `commit.js:231-242` (validation pushing to `errors`).
- decisions: `<label>` is `--subject`, `--expected-subject` or `--message-file first line`; `"`, backtick, `$` and `\` are rejected in `--subject`/`--expected-subject` only (spec A7, R-subject-precheck; a `$` that arrives has survived expansion, an expanded one cannot be seen); C14's text is unchanged; `flags.messageFile` is `path.resolve(...)` of the given path, or null; the prune runs only on the manifest-writing path.
- sync: spec P2 key order; SKILL.md Task 3 gate uses the same keys.

```diff
@@ header comment, after " *                    into the final commit (Fixes #392 / R35; passed through to output)"
+ *   --subject <text>          Use <text> verbatim as the commit subject (R-subject-verbatim)
+ *   --message-file <path>     Commit the file's content as the whole message (R-message-file)
+ *   --expected-subject <text> The subject the caller expects; the gate stops on a difference (R-expected-subject)
@@ imports
+const fs = require('node:fs');
 const path = require('node:path');
@@
-const { writeManifestState } = require(path.join(LIB, 'state'));
+const { writeManifestState, resolveStateDir, slugifyBranch } = require(path.join(LIB, 'state'));
@@ parseArgs — declarations
   let forceDefaultBranch  = false;
+  let subject             = null;
+  let messageFile         = null;
+  let expectedSubject     = null;
   const warnings = [];
+  // A value flag without a value yields '' so checkGivenSubjects rejects it (R-subject-precheck).
+  const valueAt = (i) => (i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : '');
@@ parseArgs — loop
     } else if (a === '--force-default-branch') {
       forceDefaultBranch = true;
+    } else if (a === '--subject') {
+      subject = valueAt(i);
+      if (subject !== '') i++;
+    } else if (a === '--message-file') {
+      messageFile = valueAt(i);
+      if (messageFile !== '') i++;
+    } else if (a === '--expected-subject') {
+      expectedSubject = valueAt(i);
+      if (expectedSubject !== '') i++;
     }
@@ parseArgs — return
-  return { noStash, scope, type, amend, auto, noSquashWip, expectedBranch, forceDefaultBranch, warnings };
+  return { noStash, scope, type, amend, auto, noSquashWip, expectedBranch, forceDefaultBranch, subject, messageFile, expectedSubject, warnings };
```

Insert after `parseArgs` (before the `// Default-branch resolution helper (R14, fixes #398)` banner):

```js
// ---------------------------------------------------------------------------
// Given subjects (R-subject-precheck) and message-file pruning (R-script-prune)
// ---------------------------------------------------------------------------

const MAX_SUBJECT_CHARS = 72;

/**
 * Checks every subject the caller gave, before any draft: --subject,
 * --expected-subject and the first line of the --message-file file.
 * @returns {string[]} errors[] entries; empty when all given subjects are valid and equal
 */
function checkGivenSubjects({ subject, messageFile, expectedSubject }) {
  const errors = [];
  const given = [];
  // --subject and --expected-subject pass the Step 0 shell line, so they exclude the
  // plan-sdlc R66 set (", backtick, $, \); a message file's first line has no such rule.
  const check = (label, s, viaShell) => {
    if (s === '') errors.push(`${label} is empty.`);
    else if (/[\r\n]/.test(s)) errors.push(`${label} contains a line break.`);
    else if (s.length > MAX_SUBJECT_CHARS) errors.push(`${label} is ${s.length} characters; the limit is ${MAX_SUBJECT_CHARS}.`);
    else if (viaShell && /["`$\\]/.test(s)) errors.push(`${label} contains ", \`, $ or \\, which cannot pass the Step 0 shell line; use --message-file.`);
    else given.push([label, s]);
  };
  if (subject !== null) check('--subject', subject, true);
  if (expectedSubject !== null) check('--expected-subject', expectedSubject, true);
  if (messageFile === '') {
    errors.push('--message-file needs a path.');
  } else if (messageFile !== null && /["`$\\\r\n]/.test(messageFile)) {
    // The path passed the Step 0 shell line; it is never read back into one (R-message-file).
    errors.push('--message-file path contains ", `, $, \\, a newline or a carriage return; use a plain path.');
  } else if (messageFile !== null) {
    let text = null;
    try { text = fs.readFileSync(messageFile, 'utf8'); } catch (err) { errors.push(`--message-file ${messageFile} cannot be read: ${err.message}`); }
    if (text !== null) check('--message-file first line', text.split('\n')[0], false);
  }
  if (new Set(given.map(([, s]) => s)).size > 1) {
    errors.push(`Given subjects disagree: ${given.map(([label, s]) => `${label} "${s}"`).join(', ')}.`);
  }
  return errors;
}

/**
 * Deletes this branch's earlier `commit-<branchSlug>-<YYYYMMDDTHHmmssZ>.msg` files
 * in the state directory. The `.json` manifests are pruned by writeManifestState (R15);
 * no other file is touched.
 */
function pruneCommitMessageFiles(branch) {
  const dir = resolveStateDir();
  const slug = slugifyBranch(branch);
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  for (const name of names) {
    const m = /^commit-(.+)-(\d{8}T\d{6}Z)\.msg$/.exec(name);
    if (!m || m[1] !== slug) continue;
    try { fs.unlinkSync(path.join(dir, name)); } catch (_) { /* best effort */ }
  }
}
```

```diff
@@ main — destructuring
-  const { noStash, scope, type, amend, auto, noSquashWip, expectedBranch, forceDefaultBranch, warnings: parseWarnings } = parseArgs(process.argv);
+  const { noStash, scope, type, amend, auto, noSquashWip, expectedBranch, forceDefaultBranch, subject, messageFile: messageFileArg, expectedSubject, warnings: parseWarnings } = parseArgs(process.argv);
+  const messageFile = messageFileArg ? path.resolve(messageFileArg) : messageFileArg;
@@ main — flags object
-  const flags = { noStash, scope, type, amend, auto, noSquashWip, skipConfigCheck, forceDefaultBranch };
+  const flags = { noStash, scope, type, amend, auto, noSquashWip, skipConfigCheck, forceDefaultBranch, subject, messageFile, expectedSubject };
@@ main — immediately before "  // Step 4: Get staged files"
+  // Step 3d: Given subjects are checked before any draft (R-subject-precheck)
+  errors.push(...checkGivenSubjects({ subject, messageFile, expectedSubject }));
+
@@ main — manifest write
+  pruneCommitMessageFiles(currentBranch); // R-script-prune
   const manifestPath = writeManifestState('commit', currentBranch, result);
```

`messageFileArg` keeps `null` (flag absent) and `''` (flag without a value) unchanged, so `checkGivenSubjects` still reports `--message-file needs a path.`.

---

### Task 2: `commit-orchestrator.md` — flags row and the given-subject rule

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/agents/commit-orchestrator.md` — flags row `:27`; one rule paragraph before the Step 3 list.

**Notes:** Item Change 3 and ruling w1-preflight Q1 (F-commit-skill-prompt-gates-6). The rule goes before the numbered list, so the existing items 1–7 keep their numbers and text (§0 rule 3). Anchors (each `1` at cd6e665): the row below and the line `## Step 3 — Generate Subject and Body`.

**Acceptance criteria:**
- [ ] `grep -c -- '--subject\|--expected-subject\|--message-file' plugins/sdlc-utilities/agents/commit-orchestrator.md` prints `1` (the rule line; `0` at cd6e665); `grep -c 'flags.subject' plugins/sdlc-utilities/agents/commit-orchestrator.md` prints `1` or more; `grep -cF '{ noStash, scope, type, amend, auto }' plugins/sdlc-utilities/agents/commit-orchestrator.md` prints `0`.
- [ ] Lines `1. Read \`staged.diff\`` … `7. Body only when` are byte-identical to cd6e665 (`git diff` shows no `-` line among them).

**Contract:**
- shape (docs): the diff below.
- names: `flags.subject`, `flags.expectedSubject`, `flags.messageFile`, R-subject-verbatim, R-expected-subject.
- mirror: the row style of `:26-35`.
- decisions: the agent ignores `expectedSubject` (spec R-expected-subject) and never sees a `messageFile` run (the skill skips it).
- sync: spec P2 key order.

```diff
-| `flags` | `{ noStash, scope, type, amend, auto }` — parsed CLI flags |
+| `flags` | `{ noStash, scope, type, amend, auto, noSquashWip, skipConfigCheck, forceDefaultBranch, subject, messageFile, expectedSubject }` — parsed CLI flags |
@@
 ## Step 3 — Generate Subject and Body
 
+If `flags.subject` is set (`--subject`), the subject line is exactly `flags.subject`; write only the body (R-subject-verbatim). Rules 2, 3 and 5 below then do not apply, and the Step 4 self-critique never alters that subject line. With `flags.amend`, revise the body per rule 4 and replace the subject. Ignore `flags.expectedSubject` (`--expected-subject`): the skill checks it after you return (R-expected-subject). A `--message-file` run does not dispatch you (R-message-file).
+
 1. Read `staged.diff` to understand what changed. …
```

---

### Task 3: commit-sdlc `SKILL.md` — arguments, message-file branch, gate exit 3, no manifest `rm`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` — frontmatter `:3`, `:5`; Step 0 comment `:44-46` and exit bullets `:53-55`; Step 2 (before `:118`, after `:135`); Step 5 display (`:156-157`, `:178`); gate block `:196-198`; gate outcomes `:203-204`; `:240`; `:258`.

**Notes:** Implements A7–A9, R-subject-verbatim, R-message-file, R-expected-subject, E8–E10 and R-script-prune (F-commit-skill-prompt-gates-1…5, -7; F-commit-ship-exec-test-shapes-7, -10). Must not touch: the message-file path sentence and the quoted heredoc block (`:182-188`), the R12 link-gate text, the `wip` rules, and the two `rm -f "<MSG_FILE>"` lines (`:222`, `:242`). Edit bottom-up: `:258`, `:240`, `:203-204`, `:196-198`, `:178`, `:156`, `:135`, `:118`, `:53-55`, `:44-46`, `:5`, `:3`. Every anchor was checked with `grep -cF` at cd6e665: each prints `1`, except `Run \`rm -f "$COMMIT_CONTEXT_FILE" "<MSG_FILE>"\` to clean up the manifest.`, which prints `2` (inside `:240` and as the whole line `:258`). Locate `:258` with `grep -nxF` (prints `258`) and `:240` by its `**On \`cancel\`:**` prefix.

**Acceptance criteria:**
- [ ] Verification checks 4 and 5 print nothing.
- [ ] `grep -c -- '--subject <text>' plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` prints `2` (`:3` and `:5`); the same holds for `--message-file <path>` and `--expected-subject <text>`.
- [ ] `grep -c "node -e '" plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` still prints `1`.
- [ ] The exec cases `commit-literal-message` and `commit-subject: expected-subject gate` pass.

**Contract:**
- shape (code): the diffs below, verbatim. The gate keeps all its original lines unchanged (three `const` lines, two `if` lines). It gains one `const f` line after `const cfg` and three exit-3 lines after the pattern line. After an **edit subject** loop (exit 1) with `flags.subject` set, the next gate run can exit 3 and offers **use the given subject** again (spec E8–E10).
- names: gate exit `3`; prompt options **use the given subject**, **cancel**; display line `Source:`.
- mirror: the Exit 1/Exit 2 bullet style at `:202-209`.
- decisions: plan 1 KD1, KD4, KD5; under `--auto`, exit 3 stops like E8.
- sync: spec E8–E10; exec case `commit-subject: expected-subject gate` extracts this gate.

```diff
@@ :3 description
-description: "Use this skill when committing staged changes or generating a commit message that matches the project's style: stashes unstaged work, commits after confirmation, restores the stash. Arguments: [--no-stash] [--scope <scope>] [--type <type>] [--amend] [--auto] [--no-squash-wip] [--expected-branch <name>] [--force-default-branch]. Triggers on: commit changes, create commit, commit message, git commit, commit staged."
+description: "Use this skill when committing staged changes or generating a commit message that matches the project's style: stashes unstaged work, commits after confirmation, restores the stash. Arguments: [--no-stash] [--scope <scope>] [--type <type>] [--amend] [--auto] [--no-squash-wip] [--expected-branch <name>] [--force-default-branch] [--subject <text>] [--message-file <path>] [--expected-subject <text>]. Triggers on: commit changes, create commit, commit message, git commit, commit staged."
@@ :5 argument-hint
-argument-hint: "[--no-stash] [--scope <scope>] [--type <type>] [--amend] [--auto] [--no-squash-wip] [--expected-branch <name>] [--force-default-branch]"
+argument-hint: "[--no-stash] [--scope <scope>] [--type <type>] [--amend] [--auto] [--no-squash-wip] [--expected-branch <name>] [--force-default-branch] [--subject <text>] [--message-file <path>] [--expected-subject <text>]"
@@ :44-46 Step 0 comment
-# No EXIT trap: each Bash call is its own shell. The manifest persists under .sdlc/execution/
-# (success path: commit-<slug>-<ts>.json via writeManifestState; error paths: out/ via writeOutput)
-# and is pruned on the next run; the explicit `rm -f "$COMMIT_CONTEXT_FILE"` lines remove it early.
+# No EXIT trap and no rm: each Bash call is its own shell. The manifest persists under .sdlc/execution/
+# (success path: commit-<slug>-<ts>.json via writeManifestState; error paths: out/ via writeOutput).
+# skill/commit.js prunes this branch's earlier manifests and message files on its next run (R-script-prune).
@@ :53-55
-- Exit code 1: The JSON still contains an `errors` array. Show each error to the user, run `rm -f "$COMMIT_CONTEXT_FILE"`, and stop.
-- Exit code 2: Show `Script error — see output above`, run `rm -f "$COMMIT_CONTEXT_FILE"`, and stop.
-- Exit code 3: expected-branch guard failed (`--expected-branch` did not match) — show `errors[0]` (the guard message), run `rm -f "$COMMIT_CONTEXT_FILE"`, and stop.
+- Exit code 1: The JSON still contains an `errors` array. Show each error to the user and stop.
+- Exit code 2: Show `Script error — see output above` and stop.
+- Exit code 3: expected-branch guard failed (`--expected-branch` did not match) — show `errors[0]` (the guard message) and stop.
@@ Step 2 — insert before the line "Dispatch the `commit-orchestrator` agent so its input is bounded to the prepared manifest and does not inherit the conversation transcript. `model: haiku` on the Agent call keeps this bounded task on a lightweight model."
+**Given subject:** the subject the caller gave is, in this order, `flags.subject`, else the first line of the `flags.messageFile` file, else `flags.expectedSubject`. `skill/commit.js` has already checked that all given subjects are equal (R-subject-precheck), so the order only decides which flag is named. Every later mention of "the given subject" means this value.
+
+**Message file given (R-message-file):** If `flags.messageFile` is set, do not dispatch the orchestrator and skip the OpenSpec scope hint below. Read the file and set `MESSAGE` to its exact content, then go to Step 5.
+
@@ Step 2 — insert after the line starting "Capture the orchestrator's return value as `MESSAGE`."
+
+**Given subject (R-subject-verbatim, E9):** When `flags.subject` is set, the first line of `MESSAGE` must be `flags.subject` byte for byte. Never edit it to fit a gate. The Step 5 subject gate checks it and exits 3 on a difference.
@@ Step 5 display block — insert after "            the new OAuth 2.1 requirements." and its blank line
+Source:     drafted
+
@@ insert after "Show `Amend:` instead of `Commit:` heading when `flags.amend` is true."
+Set `Source:` to the flag that supplied the given subject, in the same order (`--subject`, else `--message-file`, else `--expected-subject (checked)`), or `drafted` when none is set.
@@ gate block — keep every original line (5-space indent, as in SKILL.md:194-198); add one `const` and three `if` lines
      const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).commitConfig || {};
+     const f = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).flags || {};
      if (/^wip(\(|:)/.test(subject)) process.exit(2);
      if (cfg.subjectPattern && !new RegExp(cfg.subjectPattern).test(subject)) process.exit(1);
+     if (f.subject && subject !== f.subject) process.exit(3);
+     if (f.expectedSubject && subject !== f.expectedSubject) process.exit(3);
+     if (f.messageFile && fs.readFileSync(process.argv[2], "utf8").trimEnd() !== fs.readFileSync(f.messageFile, "utf8").trimEnd()) process.exit(3);
@@ gate outcomes :203 (E8) and new exit-3 bullets before "   - **Exit 2:** the subject starts with an internal WIP marker."
-   - **Exit 1 or 2 with `flags.auto` true:** do not call AskUserQuestion. Print `Subject gate rejected the subject (exit <code>): <reason>` — for 2 the reason is "internal WIP marker"; for 1 it is `commitConfig.subjectPatternError` if set, otherwise the pattern — run `rm -f "$COMMIT_CONTEXT_FILE" "<MSG_FILE>"`, and stop without committing. (C14, E8)
+   - **Exit 1 or 2 with `flags.auto` true:** do not call AskUserQuestion. Print `Subject gate rejected the subject (exit <code>): <reason>` — for 2 the reason is "internal WIP marker"; for 1 it is `commitConfig.subjectPatternError` if set, otherwise the pattern — and stop without committing. The next run prunes the manifest and message file (R-script-prune). (C14, E8)
+   - **Exit 3 with `flags.auto` true:** do not call AskUserQuestion. Print `Subject gate rejected the message (exit 3): given "<the given subject>", written "<first line of <MSG_FILE>>"` and stop without committing. (E9; E10 when only `flags.expectedSubject` is set)
+   - **Exit 3:** the written message differs from what the caller gave. Show the given subject and the written one, and use AskUserQuestion with **use the given subject** or **cancel**. On **use the given subject**: when `flags.messageFile` is set, set `MESSAGE` to the file's content; otherwise replace the first line of `MESSAGE` with the given subject. Then rewrite `<MSG_FILE>` with the heredoc block and re-run the gate. (E9, E10)
@@ :240
-**On `cancel`:** Abort without changes. Run `rm -f "$COMMIT_CONTEXT_FILE" "<MSG_FILE>"` to clean up the manifest.
+**On `cancel`:** Abort without changes. The next run of `skill/commit.js` prunes the manifest and the message file (R-script-prune).
@@ :258
-Run `rm -f "$COMMIT_CONTEXT_FILE" "<MSG_FILE>"` to clean up the manifest.
+The next run of `skill/commit.js` prunes the manifest and the message file (R-script-prune).
```

---

### Task 4: `docs/skills/commit-sdlc.md` — flag rows and the `.msg` artifact

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/commit-sdlc.md` — four Flags rows after `:28`; one "What It Creates or Modifies" row after `:288`.

**Notes:** Item Change 5 and ruling w1-preflight Q1 (F-commit-spec-ids-and-docs-mirror-5). Anchors (each `1` at cd6e665): `| \`--expected-branch <name>\` | **Internal — set by ship-sdlc.**` and `| \`.sdlc/execution/commit-<slug>-<ts>.json\` | Persistent prepare manifest`. The site mirror `site/src/content-source/skills/commit-sdlc.md` is refreshed by the executor's `node site/scripts/copy-docs.mjs`, outside this plan (plan source §3).

**Acceptance criteria:**
- [ ] `grep -cE '^\| \`--(subject|message-file|expected-subject|skip-config-check)' docs/skills/commit-sdlc.md` prints `4`.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js > /dev/null; echo "exit=$?"` prints `exit=0` (it does at cd6e665).

**Contract:**
- shape (docs): append the rows below, unchanged.
- names: the four flag rows; the `.msg` artifact row.
- mirror: `docs/skills/commit-sdlc.md:28`.
- decisions: no new section; user-facing wording.
- sync: SKILL.md argument-hint (Task 3).

```markdown
| `--subject <text>` | Use `<text>` verbatim as the commit subject; the message agent writes only the body. One line, at most 72 characters, checked before drafting. A different subject in the written message stops the commit. The value must not contain `"`, a backtick (`` ` ``), `$` or `\`; for such a subject, write the whole message to a file and use `--message-file`. | Unset (subject drafted) |
| `--message-file <path>` | Commit the file's content as the whole message; the message agent is skipped. The subject gate, the link check and `git commit -F` still run. The subject is the file's first line. The path must not contain `"`, a backtick (`` ` ``), `$`, `\`, a newline or a carriage return. | Unset |
| `--expected-subject <text>` | The subject you expect. With `--auto`, a different subject stops the run without a commit; without `--auto`, you are shown both and asked. Like `--subject`, the value must not contain `"`, a backtick (`` ` ``), `$` or `\`. | Unset |
| `--skip-config-check` | Skip the config-version check and migration at start (same as `SDLC_SKIP_CONFIG_CHECK=1`). | Disabled |
```

```markdown
| `.sdlc/execution/commit-<slug>-<ts>.msg` | The commit message file, written with a quoted heredoc and read by the subject gate, the link check and `git commit -F`. `skill/commit.js` deletes this branch's earlier `.msg` files on its next run. A deleted branch's last `.msg` file is not collected. |
```

---

### Task 5: `commit-prepare-exec.yaml` — the `commit-subject:` cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 3
**Verify:** tests

**Files:**
- Test: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — append eight cases after the last case (`commit-literal-message`, which ends the file).

**Notes:** Item Change 6 (a)–(d) exactly, Change 7 (`message-file`), Change 8 (`expected-subject gate`), and Change 10 (`length before draft`, `prune`) (F-commit-ship-exec-test-shapes-1…8). Every description starts `commit-subject: ` (§0 rule 5). Each `script_args` one-liner contains no whitespace (the runner splits on it) and no `{{` or `{#` except `{{repo_root}}`. The cases need no new fixture.

**Acceptance criteria:**
- [ ] `grep -c 'description: "commit-subject: ' tests/promptfoo/datasets/commit-prepare-exec.yaml` prints `8` (it prints `0` at cd6e665).
- [ ] `node -e 'const y=require("fs").readFileSync("tests/promptfoo/datasets/commit-prepare-exec.yaml","utf8");for(const m of y.matchAll(/script_args: \x27([^\x27]*)\x27/g))if(/\s/.test(m[1]))process.exit(1)'; echo "exit=$?"` prints `exit=0`.
- [ ] Verification check 2 passes.

**Contract:**
- shape (code): the YAML below, appended verbatim.
- names: the eight descriptions below.
- mirror: `script_path: "-e"` one-liners at `tests/promptfoo/datasets/ship-hooks-exec.yaml:108-109` (hook-runner `:72,95`; `providers/script-runner.js:90,140` splits and spawns the same way); flag cases at `commit-prepare-exec.yaml:35-43`.
- decisions: spaced values via argv; inputs written into the fixture copy (KD4).
- sync: spec Acceptance lines name these descriptions.

```yaml
# W8.24 — commit-sdlc takes the planned subject (A7–A9, R-subject-verbatim, R-message-file,
# R-expected-subject, R-subject-precheck, R-script-prune). Spaced values cannot pass through
# script_args (split on whitespace), so these cases spawn commit.js with an argv array from a
# whitespace-free `node -e` one-liner (\x20 = space, \x27 = ', \x22 = ").
- description: "commit-subject: (a) --subject with spaces appears verbatim as flags.subject"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((r)=>console.log(JSON.stringify({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))})))(cp.spawnSync("node",[js,"--output-file","--subject","docs(#1):\x20x\x20-\x20y"],{cwd:process.cwd(),encoding:"utf8"})))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 0) return `FAIL: exit ${o.status}: ${JSON.stringify(o.out.errors)}`;
        return o.out.flags.subject === 'docs(#1): x - y' ? true : `FAIL: flags.subject ${JSON.stringify(o.out.flags.subject)}`;

- description: "commit-subject: (b) an empty --subject gives an errors[] entry and exit 1"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((r)=>console.log(JSON.stringify({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))})))(cp.spawnSync("node",[js,"--output-file","--subject",""],{cwd:process.cwd(),encoding:"utf8"})))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 1) return `FAIL: exit ${o.status}`;
        return o.out.errors.includes('--subject is empty.') ? true : `FAIL: errors ${JSON.stringify(o.out.errors)}`;

- description: "commit-subject: (c) a 73-character --subject gives exit 1"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((r)=>console.log(JSON.stringify({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))})))(cp.spawnSync("node",[js,"--output-file","--subject","docs(#1):\x20"+"a".repeat(63)],{cwd:process.cwd(),encoding:"utf8"})))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 1) return `FAIL: exit ${o.status}`;
        return o.out.errors.some(e => e.startsWith('--subject is 73 characters')) ? true : `FAIL: errors ${JSON.stringify(o.out.errors)}`;

- description: "commit-subject: (d) no --subject gives flags.subject null"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/commit.js"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        return o.flags.subject === null && o.flags.messageFile === null && o.flags.expectedSubject === null;

- description: "commit-subject: message-file — the file path is absolute in flags; a different --subject or a path with $ is rejected before drafting"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((run)=>(fs.writeFileSync("msg.txt","docs(#1):\x20x\x20-\x20y\n\nWhy\x20it\x20changed.\n"),console.log(JSON.stringify({alone:run(["--message-file","msg.txt"]),clash:run(["--message-file","msg.txt","--subject","docs(#1):\x20other\x20-\x20z"]),badpath:run(["--message-file","m\x24x.txt"])}))))((a)=>((r)=>({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))}))(cp.spawnSync("node",[js,"--output-file",...a],{cwd:process.cwd(),encoding:"utf8"}))))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.alone.status !== 0) return `FAIL: alone exit ${o.alone.status}: ${JSON.stringify(o.alone.out.errors)}`;
        const mf = o.alone.out.flags.messageFile;
        if (typeof mf !== 'string' || !mf.startsWith('/') || !mf.endsWith('/msg.txt')) return `FAIL: messageFile ${mf}`;
        if (o.clash.status !== 1) return `FAIL: clash exit ${o.clash.status}`;
        if (!o.clash.out.errors.some(e => e.startsWith('Given subjects disagree'))) return `FAIL: clash errors ${JSON.stringify(o.clash.out.errors)}`;
        if (o.badpath.status !== 1) return `FAIL: badpath exit ${o.badpath.status}`;
        return o.badpath.out.errors.some(e => e.startsWith('--message-file path contains')) ? true : `FAIL: badpath errors ${JSON.stringify(o.badpath.out.errors)}`;

- description: "commit-subject: expected-subject gate — the SKILL.md subject gate exits 3 on a different first line and 0 on the same"
  vars:
    script_path: "-e"
    script_args: '((cp,fs)=>((js)=>(fs.writeFileSync("e.json",JSON.stringify({flags:{expectedSubject:"docs(#1):\x20x\x20-\x20y"},commitConfig:null})),fs.writeFileSync("g.json",JSON.stringify({flags:{subject:"docs(#1):\x20x\x20-\x20y"},commitConfig:null})),fs.writeFileSync("f.json",JSON.stringify({flags:{messageFile:"same.msg"},commitConfig:null})),fs.writeFileSync("other.msg","docs(#1):\x20other\x20-\x20z\n\nBody.\n"),fs.writeFileSync("same.msg","docs(#1):\x20x\x20-\x20y\n\nBody.\n"),console.log(JSON.stringify({found:js.length>0,differ:cp.spawnSync("node",["-e",js,"e.json","other.msg"]).status,same:cp.spawnSync("node",["-e",js,"e.json","same.msg"]).status,given:cp.spawnSync("node",["-e",js,"g.json","other.msg"]).status,file:cp.spawnSync("node",["-e",js,"f.json","other.msg"]).status}))))(fs.readFileSync("{{repo_root}}/plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md","utf8").split("node\x20-e\x20\x27")[1].split("\x27\x20\x22<COMMIT_CONTEXT_FILE>\x22")[0]))(require("child_process"),require("fs"))'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (!o.found) return 'FAIL: gate block not found in SKILL.md';
        if (o.differ !== 3) return `FAIL: expected-subject differ exit ${o.differ}`;
        if (o.same !== 0) return `FAIL: expected-subject same exit ${o.same}`;
        if (o.given !== 3) return `FAIL: --subject differ exit ${o.given}`;
        return o.file === 3 ? true : `FAIL: --message-file differ exit ${o.file}`;

- description: "commit-subject: length before draft — a 73-character --expected-subject or message-file first line, or a --subject with a double quote, or an --expected-subject with a backtick, gives exit 1"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((run)=>(fs.writeFileSync("long.txt","docs(#1):\x20"+"a".repeat(63)+"\n\nBody.\n"),console.log(JSON.stringify({expected:run(["--expected-subject","docs(#1):\x20"+"a".repeat(63)]),file:run(["--message-file","long.txt"]),quote:run(["--subject","docs(#1):\x20a\x22b\x20-\x20y"]),tick:run(["--expected-subject","docs(#1):\x20a\x60b\x20-\x20y"])}))))((a)=>((r)=>({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8"))}))(cp.spawnSync("node",[js,"--output-file",...a],{cwd:process.cwd(),encoding:"utf8"}))))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.expected.status !== 1) return `FAIL: expected exit ${o.expected.status}`;
        if (!o.expected.out.errors.some(e => e.startsWith('--expected-subject is 73 characters'))) return `FAIL: expected errors ${JSON.stringify(o.expected.out.errors)}`;
        if (o.expected.out.flags.expectedSubject.length !== 73) return 'FAIL: flags.expectedSubject not carried';
        if (o.file.status !== 1) return `FAIL: file exit ${o.file.status}`;
        if (!o.file.out.errors.some(e => e.startsWith('--message-file first line is 73 characters'))) return `FAIL: file errors ${JSON.stringify(o.file.out.errors)}`;
        if (o.quote.status !== 1) return `FAIL: quote exit ${o.quote.status}`;
        if (!o.quote.out.errors.some(e => e.startsWith('--subject contains "'))) return `FAIL: quote errors ${JSON.stringify(o.quote.out.errors)}`;
        if (o.tick.status !== 1) return `FAIL: tick exit ${o.tick.status}`;
        return o.tick.out.errors.some(e => e.startsWith('--expected-subject contains "')) ? true : `FAIL: tick errors ${JSON.stringify(o.tick.out.errors)}`;

- description: "commit-subject: prune — the script deletes this branch's earlier .msg files and keeps foreign ones"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,js)=>((d)=>(["commit-main-20240101T000000Z.msg","commit-otherbranch-20240101T000000Z.msg","review-main-20240101T000000Z.msg","commit-main-notes.msg"].forEach((n)=>fs.writeFileSync(d+"/"+n,"x\n")),((r)=>console.log(JSON.stringify({status:r.status,manifest:fs.existsSync(r.stdout.trim()),left:fs.readdirSync(d).filter((n)=>n.endsWith(".msg")).sort()})))(cp.spawnSync("node",[js,"--output-file"],{cwd:process.cwd(),encoding:"utf8",env:Object.assign({},process.env,{SDLC_STATE_DIR_OVERRIDE:d})}))))(process.cwd()+"/.sdlc/execution"))(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-on-default-branch"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 0) return `FAIL: exit ${o.status}`;
        if (!o.manifest) return 'FAIL: new manifest missing (cross-shell survival, R15)';
        const want = ['commit-main-notes.msg', 'commit-otherbranch-20240101T000000Z.msg', 'review-main-20240101T000000Z.msg'];
        return JSON.stringify(o.left) === JSON.stringify(want) ? true : `FAIL: left ${JSON.stringify(o.left)}`;
```

---

### Task 6: `ship.js` — read the plan's `**Commit:**` field and forward it to the commit step

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — new `readPlanCommitSubject`; `computeSteps` commit-step args; `main` error after `resolvePlanFile`.

**Notes:** Implements ship R-plan-commit-subject and plan-sdlc R66 (F-ship-commit-step-plan-subject-1, -2, -3, -6, -8, -10; F-plan-format-commit-field-owner-4). Change 9 only: `commit-fixes` (`:503-510`) and every other step stay byte-identical (Must not touch; ruling w1-preflight Q2). Anchors (each `1` at cd6e665): `function lastHistory(ledger, id) {`, `  const stepsSet = new Set(Array.isArray(flags.steps) ? flags.steps : []);`, `      name: 'commit',` (whole line, `grep -cx`), `  const planFile = resolvePlanFile(cli.planFile || null, errors);`.

**Acceptance criteria:**
- [ ] `git diff -U0 plugins/sdlc-utilities/scripts/skill/ship.js | grep -c '^-[^-]'` prints `0`: the change only adds lines.
- [ ] The three Task 7 cases and every existing `ship-prepare` case pass.

**Contract:**
- shape (code): `readPlanCommitSubject(planFile: string|null, subjectPattern?: string|null): { subject: string|null, error: string|null }`; commit args `--auto [--subject "<s>"] [--expected-branch <b>]`; error `{ id: 'planCommitSubjectInvalid', message }`.
- names: `readPlanCommitSubject`, `planCommitSubjectInvalid`.
- mirror: `deriveBranchFromPlan` (`ship.js:1288-1300`) for the plan read; `resolvePlanFile`'s `{id, message}` errors (`:2397-2424`).
- decisions: plan 1 KD6, KD7; this plan KD1, KD3.
- sync: plan-sdlc R66 grammar; ship spec R-plan-commit-subject.

Insert before `function lastHistory(ledger, id) {`:

```js
/**
 * R-plan-commit-subject / plan-sdlc R66: the plan header's `**Commit:** `<subject>`` field.
 * The header is every line before the first `---`, `## ` or `### ` line; per-task
 * `**Commit:**` notes below it are prose and are not read.
 * @returns {{ subject: string|null, error: string|null }}  both null when there is no field
 */
function readPlanCommitSubject(planFile, subjectPattern = null) {
  if (!planFile) return { subject: null, error: null };
  let text;
  try { text = fs.readFileSync(planFile, 'utf8'); } catch { return { subject: null, error: null }; }
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex(l => l === '---' || l.startsWith('## ') || l.startsWith('### '));
  const fields = (end === -1 ? lines : lines.slice(0, end)).filter(l => l.startsWith('**Commit:**'));
  if (fields.length === 0) return { subject: null, error: null };
  const fail = (why) => ({
    subject: null,
    error: `The **Commit:** field in the header of ${planFile} ${why}. ` +
      'Fix: write it once, as **Commit:** `<subject>` — one line of at most 72 characters, without ", `, $ or \\, matching commit.subjectPattern. ' +
      'Why: ship forwards it verbatim to commit-sdlc as --subject.',
  });
  if (fields.length > 1) return fail('appears more than once');
  const m = /^\*\*Commit:\*\* `([^`]+)`\s*$/.exec(fields[0]);
  if (!m) return fail('is not one backticked subject');
  const subject = m[1];
  if (subject.length > 72) return fail(`is ${subject.length} characters long`);
  if (/["$\\]/.test(subject)) return fail('contains ", $ or \\');
  if (subjectPattern) {
    let ok;
    try { ok = new RegExp(subjectPattern).test(subject); } catch (err) { return fail(`cannot be checked: commit.subjectPattern is not a valid regex (${err.message})`); }
    if (!ok) return fail(`does not match commit.subjectPattern ${subjectPattern}`);
  }
  return { subject, error: null };
}

```

```diff
@@ computeSteps — after "  const stepsSet = new Set(Array.isArray(flags.steps) ? flags.steps : []);"
+  // R-plan-commit-subject: prepare already rejected a malformed field, so only a valid subject arrives here.
+  const planSubject = readPlanCommitSubject(planFile).subject;
@@ the step object whose line is "      name: 'commit'," (not 'commit-fixes')
       args: [
         '--auto',
+        planSubject ? `--subject "${planSubject}"` : '',
         expectedBranch ? `--expected-branch ${expectedBranch}` : '',
       ].filter(Boolean).join(' '),
@@ main — after "  const planFile = resolvePlanFile(cli.planFile || null, errors);"
+
+  // R-plan-commit-subject: a malformed **Commit:** header field stops prepare before any step
+  // runs, so the commit step never drafts a subject nobody planned.
+  let commitSubjectPattern = null;
+  try { commitSubjectPattern = (readSection(projectRoot, 'commit') || {}).subjectPattern || null; } catch (_) { /* no commit config */ }
+  const planCommit = readPlanCommitSubject(planFile, commitSubjectPattern);
+  if (planCommit.error) errors.push({ id: 'planCommitSubjectInvalid', message: planCommit.error });
```

---

### Task 7: `ship-prepare-exec.yaml` — the R-plan-commit-subject cases

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — append three cases at the end of the file.

**Notes:** Item Change 9's case plus the absent-field and invalid-field behaviour (F-commit-ship-exec-test-shapes-11). Descriptions start `ship-prepare (R-plan-commit-subject): `, so the Verification filter `ship-prepare` selects them. The valid and invalid plans are written into a `mkdtemp` directory that the same one-liner removes (Worker temp files). The valid plan also carries a per-task `**Commit:**` prose line below `---`, which must be ignored (R66).

**Acceptance criteria:**
- [ ] `grep -c 'description: "ship-prepare (R-plan-commit-subject): ' tests/promptfoo/datasets/ship-prepare-exec.yaml` prints `3` (`0` at cd6e665).
- [ ] Verification check 2 passes.

**Contract:**
- shape (code): the YAML below, appended verbatim.
- names: the three descriptions, cited by the ship spec's R-plan-commit-subject Acceptance.
- mirror: `ship-prepare-exec.yaml:1409-1438` (R-PLANFILE cases, same fixture).
- decisions: one ship.js spawn per case, so no ledger from one run affects another.
- sync: ship spec R-plan-commit-subject Acceptance.

```yaml
# W8.24 / R-plan-commit-subject (plan-sdlc R66): ship forwards the plan header's
# **Commit:** subject to the commit step only. Plans with a spaced subject are written
# into a mkdtemp dir by a whitespace-free one-liner (\x20 space, \x60 backtick, \x24 $).
- description: "ship-prepare (R-plan-commit-subject): header field forwards --subject to the commit step only"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,os,js)=>((d)=>((o)=>(fs.rmSync(d,{recursive:true,force:true}),console.log(JSON.stringify(o))))((fs.writeFileSync(d+"/plan.md","#\x20Plan\n\n**Commit:**\x20\x60docs(#1):\x20x\x20-\x20y\x60\n\n---\n\n###\x20Task\x201:\x20A\n\n**Commit:**\x20subject\x20\x60free\x20text\x60\x20note\n"),JSON.parse(fs.readFileSync(cp.spawnSync("node",[js,"--has-plan","--plan",d+"/plan.md"],{cwd:process.cwd(),encoding:"utf8"}).stdout.trim(),"utf8")))))(fs.mkdtempSync(os.tmpdir()+"/ship-commit-")))(require("child_process"),require("fs"),require("os"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/ship.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if ((o.errors || []).some(e => e && e.id === 'planCommitSubjectInvalid')) return `FAIL: valid field rejected: ${JSON.stringify(o.errors)}`;
        const c = (o.steps || []).find(s => s.name === 'commit');
        const f = (o.steps || []).find(s => s.name === 'commit-fixes');
        if (!c || !c.args.includes('--subject "docs(#1): x - y"')) return `FAIL: commit args ${c && c.args}`;
        if (c.args.includes('--expected-branch') && c.args.indexOf('--subject') > c.args.indexOf('--expected-branch')) return `FAIL: --subject after --expected-branch: ${c.args}`;
        if (!f || f.args.includes('--subject')) return `FAIL: commit-fixes args ${f && f.args}`;
        return true;

- description: "ship-prepare (R-plan-commit-subject): malformed header field hard-errors with planCommitSubjectInvalid"
  vars:
    script_path: "-e"
    script_args: '((cp,fs,os,js)=>((d)=>((o)=>(fs.rmSync(d,{recursive:true,force:true}),console.log(JSON.stringify(o))))((fs.writeFileSync(d+"/plan.md","#\x20Plan\n\n**Commit:**\x20\x60docs(#1):\x20\x24(x)\x20-\x20y\x60\n\n---\n\n###\x20Task\x201:\x20A\n"),((r)=>({status:r.status,out:JSON.parse(fs.readFileSync(r.stdout.trim(),"utf8")),stderr:r.stderr}))(cp.spawnSync("node",[js,"--has-plan","--plan",d+"/plan.md"],{cwd:process.cwd(),encoding:"utf8"})))))(fs.mkdtempSync(os.tmpdir()+"/ship-commit-")))(require("child_process"),require("fs"),require("os"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/ship.js")'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        if (o.status !== 1) return `FAIL: exit ${o.status}`;
        const err = (o.out.errors || []).find(e => e && e.id === 'planCommitSubjectInvalid');
        if (!err) return `FAIL: no planCommitSubjectInvalid: ${JSON.stringify(o.out.errors)}`;
        if (!err.message.includes('Fix:')) return `FAIL: message lacks Fix: ${err.message}`;
        return o.stderr.includes('**Commit:**') ? true : 'FAIL: error not mirrored to stderr';

- description: "ship-prepare (R-plan-commit-subject): plan without the field forwards no --subject"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/ship.js"
    script_args: "--has-plan --plan {{repo_root}}/tests/promptfoo/fixtures-fs/ship-todos/plan-3-tasks.md"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-sdlc-gitignore-inner"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output);
        const c = (o.steps || []).find(s => s.name === 'commit');
        return c !== undefined && typeof c.args === 'string' && !c.args.includes('--subject');
```

`grep -c 'Commit:' tests/promptfoo/fixtures-fs/ship-todos/plan-3-tasks.md` prints `0` at cd6e665, so the third case has no field.

---

### Task 8: behavioural rubrics in `commit-sdlc.yaml` (Files extension — ruling w1-plan R2)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 3
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/commit-sdlc.yaml` — case at `:170` (description, asserts, rubric) and the rubric sentence at `:281` (case `:263`).

**Notes:** ruling w1-plan R2: test-only Files extension `tests/promptfoo/datasets/commit-sdlc.yaml` :170-192 and :281, §0 rule 5. Its updated hook-failure case is Verification check 7, the item's Verification (4) (F-commit-ship-exec-test-shapes-9). Anchors (each `1` at cd6e665): the description line below and `        invoke git commit. It cleans up the manifest file with explicit rm -f. It suggests`. No behavioural case is run inside the task.

**Acceptance criteria:**
- [ ] `grep -c 'rm -f "\$COMMIT_CONTEXT_FILE"' tests/promptfoo/datasets/commit-sdlc.yaml` prints `0`; `grep -c 'R-script-prune' tests/promptfoo/datasets/commit-sdlc.yaml` prints `3` (description, rubric, `:281` sentence; it prints `0` at cd6e665).

**Contract:**
- shape (docs): the diff below.
- names: description `commit-sdlc: manifest cleanup on pre-commit hook failure is the script's prune, not a trap (R-script-prune, R15/#399)`.
- mirror: the case's own structure at `:170-192`.
- decisions: keep the `not-icontains "trap 'rm -f"` assert; drop `icontains "rm -f"`, because the hook-failure path now only removes the message file.
- sync: SKILL.md Task 3 text.

```diff
-- description: "commit-sdlc: explicit rm -f cleanup runs on pre-commit hook failure (issue #209, R15/#399)"
+- description: "commit-sdlc: manifest cleanup on pre-commit hook failure is the script's prune, not a trap (R-script-prune, R15/#399)"
@@ user_request (ruling w1-plancheck m2: not leading)
-      to $COMMIT_CONTEXT_FILE in this failure path. Describe the exact mechanism that ensures
-      the manifest file is cleaned up after a pre-commit hook failure. Does the skill use an
-      EXIT trap or explicit rm -f calls?
+      to $COMMIT_CONTEXT_FILE and the message file in this failure path. Who removes the
+      manifest, and when? Does the skill use an EXIT trap, explicit rm -f calls, or neither?
@@ assert
-    - type: icontains
-      value: "rm -f"
     - type: not-icontains
       value: "trap 'rm -f"
     - type: llm-rubric
       value: >
-        The response describes explicit `rm -f "$COMMIT_CONTEXT_FILE"` cleanup on the pre-commit
-        hook failure path — NOT an EXIT trap. It confirms the manifest at `.sdlc/execution/commit-*.json`
-        is removed via an explicit `rm -f` call in the failure branch (not via a trap construct).
-        It does NOT describe a `trap 'rm -f ...' EXIT INT TERM` as the cleanup mechanism.
-        It correctly notes the manifest persists until explicitly cleaned up (enabling cross-shell
-        survival), and that each exit path (success, cancel, hook failure, link-gate failure)
-        performs its own explicit cleanup.
+        The response says the skill does not delete the manifest itself on the pre-commit hook
+        failure path: there is no EXIT trap and no `rm -f` of the manifest. The manifest at
+        `.sdlc/execution/commit-*.json` persists (cross-shell survival), and `skill/commit.js`
+        prunes it and the message file on its next run (R-script-prune). It may mention that the
+        message file is removed early with `rm -f "<MSG_FILE>"`. It does NOT describe a
+        `trap 'rm -f ...' EXIT INT TERM` as the cleanup mechanism.
@@ :281
-        invoke git commit. It cleans up the manifest file with explicit rm -f. It suggests
+        invoke git commit. It does not delete the manifest itself; the next run prunes it (R-script-prune). It suggests
```

The old description does not match check 7's filter; the new one does.

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 1, 3, 6 have exec cases (Tasks 5, 7); the spec plan edits no source. |
| no-ci-bypass | error | PASS | No CI step is skipped or disabled. |
| no-auto-eval | error | PASS | Exec-only config for check 2; one targeted behavioural case, last and once (check 7). |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Tasks follow the ten owner-scoped Changes; the one Files extension (Task 8) is confirmed by ruling w1-plan R2. |
| single-responsibility-tasks | warning | PASS | One deliverable per task. |
| scripts-over-llm-logic | error | PASS | Subject checks, pruning and forwarding live in scripts or the deterministic gate. |
| yagni | warning | PASS | No speculative abstractions. |
| cross-skill-consistency | error | PASS | ship → commit forwarding and commit-fixes covered; consumer grep and the literal-message wrapper checked. |
| pr-link-github-issue | error | PASS | #9017 is a local todo carried in subjects; no GitHub issue or PR step is planned here. |
| dry | warning | PASS | One parser for the plan field; one definition of "the given subject" (feat KD6). |
| kiss | warning | PASS | Small helpers and a gate extension. |
| spec-first | error | PASS | Spec plan commits first; code cites its ids. |
| project-agnostic | error | PASS | Behaviour changes are in plugin scripts, skills and agents. |
| flag-coherence-cross-skill | error | PASS | The gate and SKILL.md read resolved `flags.*`; ship forwards prepare-built args. |
| no-opposite-logical-vectors | error | PASS | Fixed: one precedence for "the given subject", defined once in SKILL.md Step 2 and reused by the exit-3 bullets and the `Source:` rule (feat Task 3). |
| flag-resolution-single-source | warning | PASS | Fixed: one parser `readPlanCommitSubject`; the two call sites and their reasons are recorded (feat KD6). |
| state-premise | error | PASS | Context states the root problem (invented subjects; 18 hand-finished commits). |
| smallest-viable-cut | warning | PASS | Fixed: minimal cut named and extras justified (spec KD8, feat KD7). |
| failure-audience | warning | PASS | Fixed: a "Failure audience" list in both plans. |
| explicit-non-goals | warning | PASS | Fixed: a "Non-goals" list in both plans. |
| ambiguity-stops-and-asks | error | PASS | Alternatives recorded in Key Decisions and Deviations; the Files extension was raised, not assumed, and confirmed (ruling w1-plan R2). |
| state-machine-idempotency | error | PASS | No migration/init/config-check logic changes; the prune is idempotent. |
| agent-dispatch-script-driven | error | PASS | Dispatch uses `step.data.invocation` built by `ship.js` from `step.args`; no model/isolation overrides added. |
| flag-semantic-consistency-cross-skill | error | PASS | Fixed: `grep -lE -- "'--(subject|message-file|expected-subject)'" plugins/sdlc-utilities/scripts/skill/*.js` prints nothing at cd6e665 (feat Task 1 Notes). |
| workspace-mode-compatibility | error | PASS | Fixed: branch and worktree behaviour of the prune, the `--message-file` path and the config read (feat KD5). |
| prompt-cache-hit-ratio | warning | PASS | Only static prompt text is added; dynamic values travel in args. |

---

## Suggested Review Dimensions

Advisory (G17). Not part of this plan's tasks and not edited by this wave: `.sdlc/review-dimensions/` is outside the item's Files.

### UPDATE: runtime-contract (U2, B1)

**Why:** The plan changes `plugins/sdlc-utilities/scripts/skill/commit.js` and `scripts/skill/ship.js` (new flags, the gate exit code, `.msg` pruning). The runtime-contract triggers `**/scripts/*.js` match only one directory level, so the dimension that covers exit codes, temp-file lifecycle and argument passing does not review these nested `scripts/skill/*.js` files.

**Severity hint:** high

**Patch:** Add trigger `**/scripts/**/*.js` to runtime-contract (keep existing triggers; strengthen-only, no checklist item removed).

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` frontmatter: add `- "**/scripts/**/*.js"` to `triggers[]`.

**Action (Copilot mirror, X1):** regenerate `.github/instructions/runtime-contract.instructions.md` per `setup-sdlc/setup-dimensions.md` Step 8.

---

## Final Shape

- `skill/commit.js` emits `flags.subject`, `flags.messageFile` and `flags.expectedSubject`.
  - It rejects an empty, multi-line, over-72-character or disagreeing given subject with exit 1, before any draft.
  - It deletes this branch's earlier `.msg` files before writing a manifest.
- commit-sdlc SKILL.md:
  - names the three flags in `description` and `argument-hint`;
  - skips the message agent for `--message-file`;
  - shows the subject's source;
  - stops on gate exit 3 (E9, E10);
  - has no `rm -f "$COMMIT_CONTEXT_FILE"`.
- The commit-orchestrator writes only the body when `flags.subject` is set.
- `skill/ship.js` forwards a valid plan-header `**Commit:**` subject to the `commit` step as `--subject "<subject>"`, before `--expected-branch`. Dispatch passes `step.data.invocation` as the Agent prompt (`ship-sdlc/SKILL.md:268`; `ship.js:1686`), so the value travels inside `args: "--auto --subject "<s>" …"` with unescaped inner quotes, like the execute step's `--plan "<path>"` (`ship.js:440`). If an agent drops the inner quotes, the unquoted `(` is a bash syntax error in commit-sdlc Step 0: a loud failure, not a wrong subject. It hard-errors on a malformed field. `commit-fixes` is unchanged.
- The ONE in-ship commit is `feat(#9017): commit-sdlc - take the planned subject (W8.24)`. Its files are exactly:
  1. `plugins/sdlc-utilities/scripts/skill/commit.js`
  2. `plugins/sdlc-utilities/agents/commit-orchestrator.md`
  3. `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md`
  4. `docs/skills/commit-sdlc.md`
  5. `tests/promptfoo/datasets/commit-prepare-exec.yaml`
  6. `plugins/sdlc-utilities/scripts/skill/ship.js`
  7. `tests/promptfoo/datasets/ship-prepare-exec.yaml`
  8. `tests/promptfoo/datasets/commit-sdlc.yaml` (Task 8; ruling w1-plan R2)
- Outside this plan, the executor does two things:
  - It refreshes the site mirror at two points, each committed through the wrapper (the spec plan's Architecture names both):
    1. after the spec commit, with the plans commit `docs(#9017): plan - W8.24 plans and site mirror of the specs` (60 characters): the two plans, `site/src/content-source/specs/{commit-sdlc,plan-sdlc,ship-sdlc}.md` and `site/src/content-source/plans/2026-10-26-m51-w1-commit-subject{-spec,}.md`;
    2. after this ship run, `docs(#9017): site - mirror the commit-sdlc skill doc (W8.24)` (60 characters): `site/src/content-source/skills/commit-sdlc.md`.
    Both run `node site/scripts/copy-docs.mjs`, one recursive copy of `docs/` (`site/scripts/copy-docs.mjs:5-11`); the file lists are expected, not yet probed by a run.
  - It makes the release (plugin.json and CHANGELOG, minor: `VERSION-PROPOSAL 0.35.0`).

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 1 | 3 | 1 |
| Coherence | 0 | 0 | 3 | 1 |

Review rounds: 2 (cap 3).
- Iteration 1 (Step 3 lanes + Step 5 lenses, Sonnet): G21 blocking (Task 3 elided frontmatter hunk) and G6, plus G14 errors (no-opposite-logical-vectors, flag-semantic-consistency-cross-skill, workspace-mode-compatibility) and warnings — all fixed in Step 4. Risk lens: Task 8 grep count (fixed); architecture lens: Task 2/Task 3 wording (fixed).
- Iteration 2 (merged re-dispatch, material change): all five lanes pass (G1–G21; G14 27/27 PASS); architecture, requirements and risk lenses **Approved**. The remaining WARNING (risk lens, the Task 8 Files extension for the cases at `commit-sdlc.yaml:170` and `:263`/`:281`) is resolved: ruling w1-plan R2 confirmed it.
- Fix round 1 (planreview-wave-1: M1, m1–m8; ruling w1-plan R1–R3 and E8) applied as text edits.
- Fix round 2 (ruling w1-plancheck: B1, m4, m1, m5 required; m2, m3, m6 optional, all applied) applied as text edits.

| Requirement (checklist) | Task(s) | Status |
|---|---|---|
| 4. Ship forwards plan subject, quoting, commit step only | Task 6, Task 7 | covered |
| 5. D3 message-file / subject rules | Task 1, Task 3, Task 5 (`message-file`) | covered |
| 6. D4 expected-subject, exit 3, E10 | Task 3, Task 5 (`expected-subject gate`) | covered |
| 7. D5 72-character row before drafting | Task 1, Task 5 (`(c)`, `length before draft`) | covered |
| 8. D6 script prune; `rm -f` lines gone | Task 1, Task 3, Task 5 (`prune`) | covered |
| 9. D7 flag rows | Task 2, Task 4 | covered |
| 10. D8 commit-fixes unchanged | Task 6, Task 7, KD3 | covered |
| 11. One ship run, one commit subject | Header, Architecture, Final Shape | covered |
| 12. Exec cases (a)–(d), Changes 7–10, ship case(s) | Task 5, Task 7 | covered |
| 13. Must not touch | Task 3 Notes, Non-goals | covered |
| 14. Verification runs as written, current outputs | Verification 1–7 | covered |
| 15. Plan readings | Plan readings | covered |
| 16. Docs/site and release not tasks; mirror paths named | Final Shape | covered |
| 17. Files extension raised as a question | Task 8, Deviations (ruling w1-plan R2) | covered |

**Verdict:** …Ready for archive (with noted improvements).

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
