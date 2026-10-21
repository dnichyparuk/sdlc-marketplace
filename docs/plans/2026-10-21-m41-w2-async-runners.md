# Async exec runners with per-case fixture-copy cleanup (W1.12) Implementation Plan

**Goal:** Make the two exec-only promptfoo configs actually run cases in parallel, and stop leaving fixture copies behind.
- Replace the blocking `spawnSync` in both exec providers with a non-blocking `spawn` that keeps today's output shape.
- Make the fixture-copy step in `transformVars` non-blocking and record every copy it makes.
- Remove the recorded copies once, at the end of each exec run, through a promptfoo `afterAll` extension hook.

**Architecture:** The root problem is that `spawnSync` blocks Node's event loop, so promptfoo's worker pool (`-j N`) runs one case at a time. (The configs' `concurrency: 8` key is ignored by promptfoo 0.123.1, which reads `maxConcurrency`, default 4; follow-up #9145.) Both providers keep their `async callApi` signature; inside it a small promise wrapper around `child_process.spawn` returns the same `{ stdout, stderr, status, signal, error }` record that `spawnSync` returned, so the existing output-mapping code runs unchanged. Fixture copies keep their path (`os.tmpdir()/promptfoo-fixture-*`) and order (copy, then `setup.sh`); a process-wide `Set` records them, and a new `scripts/fixture-copies-cleanup.js` `afterAll` hook, registered in both exec configs only, deletes them.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/wave-2-plan-source.md (item W1.12, consolidated-plan.md at 2de6f6f; tracking todo #9009)
**Verification:** `cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<fresh subdir of /tmp/claude-1000/pf-tmp-exec-m41> npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern '<task pattern>' --no-cache` (targeted, per task); the four timed full runs happen after the commit (Task 7).

---

## 0. How to execute this plan

This plan is written for an executor model that works **one item at a time with no memory of the review**. Rules:

1. Work in **milestone order** (§3). Inside a milestone, pick any item whose **Depends on** list is satisfied. Never start an item from a later milestone.
2. Before editing, read the item's **Files** and **Current state** and confirm every quoted line is present (`sed -n 'N,Mp' <file> | tr -d '\r'` — the working tree is a CRLF checkout; line numbers match HEAD). In quoted current-state text a backslash-backtick (`\``) is a backtick nested inside the quote, not part of the file. Line numbers are HEAD (`0c0cdcc`). When an earlier item or sub-item has already edited the same file, locate each quoted line with `grep -n` and proceed only if it occurs exactly once; apply multi-site edits within one item bottom-up (highest line first). If a quoted line, path, subcommand or flag cannot be found that way, **stop and report** the discrepancy. Do not search for an alternative and do not guess.
3. Apply **only the Change**. Leave everything under **Must not touch** byte-identical. Do not "improve" adjacent text.
4. Run the item's **Verification** commands and compare with the stated expected result. Testing policy (AGENTS.md): promptfoo only, never `node:test`/Jest. Exec-only configs (`tests/promptfoo/promptfooconfig-exec.yaml`, `promptfooconfig-exec-hooks.yaml`) may be run targeted at any gate with `--filter-pattern`. Never run the full behavioral suite (`promptfooconfig.yaml`); at most **one** targeted behavioral case as the final check. No run-fix-rerun loops.
5. Update the named promptfoo **dataset** under `tests/promptfoo/datasets/` when the item says so (new behaviour → new case; changed strings → changed assertion). Every new case's `description` starts with the item's `--filter-pattern` string followed by `: `, so the targeted run selects it; `--filter-pattern` is a regular expression, so escape `(`, `)` and `+`.
6. Commit per item with the repository convention `type(#issue): skill - description` (e.g. `fix(#NNN): ship-sdlc - remove worktree gotchas`), ending the message with the attribution line the session provides. Do not commit on `main`.
7. Keep `R<n>` / `R-slug` spec anchors in SKILL.md text; drop GitHub issue numbers from model-facing prose; state each rule once with its reason.
8. If an item's **Change** contradicts the code you find (a function already exists, a flag already parsed, a spec line already removed), stop and report. The plan is not the source of truth; the code is.
9. After M3, if your item edits the SKILL.md or spec of a skill whose `docs/specs/<skill>.md` has no `## Inputs and flags` line, first do W3.5 for that spec in a separate commit.

**How §0 applies to this plan (read with §0, not instead of it):**

- **Base and line numbers.** The base is `2de6f6f` (origin/main, v0.29.1), not `0c0cdcc`. Every line number below is at `2de6f6f`. Probe: `git log --oneline -1` printed `2de6f6f fix(#9008): ...`.
- **Line endings.** This worktree is an LF checkout, not CRLF. Probe: `command grep -c $'\r'` printed `0` for all five edited files, and `git ls-files --eol` printed `i/lf w/lf`. `tr -d '\r'` stays in the commands; it is harmless.
- **One item, one milestone.** The whole plan is item W1.12. "Milestone order" means task order (Task 1 → Task 7).
- **Commits (rule 6).** No task commits. The single `/sdlc:ship-sdlc --plan <this file> --steps execute,commit --rebase skip --quality balanced` run makes exactly one commit after Task 7, with the subject `test(#9009): promptfoo - async runners, fixture-copy cleanup (W1.12)` (68 characters, ≤ 72).
- **Datasets (rule 5).** Rule 5 does not apply: W1.12 lists every dataset as Must-not-touch. No dataset is created or edited.
- **Rules 7 and 9.** Not applicable: no SKILL.md and no spec is edited (see Research Findings, spec grep).

## Context

**What problem does this change solve?**

- The exec test gates are slow. promptfoo runs several cases at once (`-j N`; default 4, because promptfoo 0.123.1 ignores the configs' `concurrency: 8` key and reads `maxConcurrency`; follow-up #9145), yet they run one case at a time.
- The cause is `spawnSync`. It runs a child process and blocks Node's event loop (the single thread that runs all JavaScript) until the child exits. While it blocks, promptfoo cannot start any other case.
- A second, smaller problem: every fixture-backed case copies its fixture into the temp directory. Nothing ever deletes those copies, so they pile up run after run.

**What prompted this change now?**

- The owner approved "option D" on 2026-10-20: async test runners plus per-case fixture copies.
- The finding behind it (log.md 2026-10-19T11:24:10Z): a run at concurrency 4 took 11m27s, while the cases' summed latency was 11.8 min. Concurrency gave almost nothing.
- The owner set a speed floor (owner 2026-10-21, ruling w2-floor; replaces the item's ≥2× wording): `promptfooconfig-exec.yaml` at `-j 2` must be at least 1.5× faster than its `-j 1` run. `promptfooconfig-exec-hooks.yaml` at `-j 2` must be not slower than its `-j 1` run.

**What does success look like?**

- Both exec configs pass with exactly the base's counts (exec 846, hooks 53), at `-j 1` and at `-j 2`.
- `promptfooconfig-exec.yaml` at `-j 2` is at least 1.5× faster than its `-j 1` run (owner 2026-10-21, ruling w2-floor; replaces the item's ≥2× wording).
- `promptfooconfig-exec-hooks.yaml` at `-j 2` is not slower than its `-j 1` run.
- No `promptfoo-fixture-*` directory is left in `TMPDIR` after any run, and no fixture under `tests/promptfoo/fixtures-fs/` changes.
- If the 1.5× floor is missed, the executor stops and reports the four timings. Nobody tunes the code to hit it.

**Who fails if this ships wrong?**

- Every exec gate that runs these two configs: each wave executor's targeted runs, the pre-PR full runs, and the arbiter's gate on a clean checkout.
- A mapping slip in `script-runner.js` fails or falsely passes most of the 846 exec cases at once. A wrong delete in the cleanup hook could remove files outside the fixture copies.
- The owner, who reads the four timings to judge the item. A wrong timing misleads the M5 planning.

**Non-goals (deliberately not built):**

- No change to any dataset, assertion or fixture, including the two stale "one spawnSync per case" dataset comments.
- No shared spawn module for the two providers (KD1).
- No parallel fixture setup: promptfoo runs `transformVars` serially before the first case, and this plan does not work around that (KD5).
- No change to the behavioural config, `providers/claude-cli.js`, `concurrency: 8`, the pinned promptfoo version or the env recipe.
- No fix for the latent record-only risks the audit lists (for example `migrate-jira-templates-test.js:220`).
- No new test case for the timeout or buffer-overflow branches (KD4).

## Research Findings

**Spec check (plan-source requirement).** `command grep -rnE 'spawnSync|script-runner|hook-runner|transformVars' docs/specs/` printed nothing (0 files) at `2de6f6f`. No spec requirement describes the providers or the transform, so W1.12 needs no spec-consequence commit.

**The three files that block (all LF, all at `2de6f6f`).**

- `tests/promptfoo/providers/script-runner.js` (139 lines). Line 23 imports `spawnSync`. Line 27 is `TMP_PATH_RE` (W1.9's line, kept). Line 47 is `async callApi(prompt, context) {`. Lines 100–106 are the `spawnSync('node', [scriptPath, ...scriptArgs], { timeout: 30_000, encoding: 'utf8', cwd, env, input: scriptStdin })` call. Lines 108–135 map the result: `result.stdout`, `result.stderr`, `result.status`, `result.error`. They are kept unchanged.
- `tests/promptfoo/providers/hook-runner.js` (72 lines). Line 21 imports `spawnSync`. Lines 54–60 are the same call with `input: stdinData` first. Lines 62–66 build the JSON output across five lines (the source item quotes it as one line; the pre-flight confirmed the multi-line form has the same shape).
- `tests/promptfoo/scripts/extract-skill-content.js` (106 lines). Lines 46–61 are the `project_root` branch: `fs.mkdtempSync` (49), `fs.cpSync` (50), an inline `require('child_process')` and `execSync` of `setup.sh` (55–56). No `rmSync` exists anywhere in the transform or the providers.

**The configs.** Both exec configs have `evaluateOptions:` / `  concurrency: 8` at lines 3–4 and a `defaultTest.options.transformVars` entry at lines 14–16 (exec) and 12–14 (hooks). Neither has an `extensions:` key (pre-flight count 0). The exec config loads 61 datasets; the hooks config loads 2.

**promptfoo 0.123.1 facts (planner probe; Task 1 re-confirms and records them).** The package `npx --yes promptfoo@0.123.1` installs is cached at `~/.npm/_npx/55d1233f1980185b/node_modules/promptfoo` (`"version": "0.123.1"`).

| Claim | Source (planner probe) |
|---|---|
| An extension string whose suffix is a known hook name runs only for that hook | `dist/src/evaluatorHelpers-BGZUsdbL.js:525-536` (`runExtensionHook` skips when `extensionHookName !== hookName`) |
| Such a hook is called with the new convention `fn(context, { hookName })` | same file, `:537-541` (`transform(extension, updatedContext, { hookName }, false)`) |
| `afterAll` runs once, after all cases, with `{ prompts, results, suite, evalId, config }` | `dist/src/evaluator-DlYW7Rgb.js:9621` and `:9651-9660` (`runAfterAllExtensions`) |
| `transformVars` runs for every case **up front and one after another**, before any case starts | `dist/src/evaluator-DlYW7Rgb.js:8524-8550` (`prepareTestVariables` awaits `applyInputTransform` in a `for` loop) |
| File-based transforms and hooks load into the same Node process (so one `globalThis` is shared) | `dist/src/transform-B9c5qo6I.js:3` (`importModule`) |

The discovery brief reached the same facts independently (F-orchestrator-1, F-orchestrator-2, F-orchestrator-3).

Two consequences follow. First, the item's cleanup design works in 0.123.1. Second, making the transform async gives no parallel speed-up: copies and `setup.sh` runs stay sequential before the first case. The item already says this changes only the speed gain, not correctness. The speed gain must come from the providers alone.

**Node facts** (F-orchestrator-4). The installed Node is `v22.23.3`. `fs.promises.cp` exists there. The `maxBuffer` default of `spawnSync` is `1024 * 1024` bytes per stream; Task 3 confirms it in the Node docs for v22.

**Counts at `2de6f6f` (pre-flight recount, re-probed by the planner with js-yaml over each config's datasets).**

| Config | Cases | With `project_root: file://fixtures-fs/…` | Without |
|---|---|---|---|
| `promptfooconfig-exec.yaml` | 846 | 789 | 57 |
| `promptfooconfig-exec-hooks.yaml` | 53 | 49 | 4 |

The 61 cases without a copy are: `sdlc-dimensions` 1, `ship-prepare` 5, `error-report-prepare` 5, `session-start` 1, `jira-sdlc-guardrail` 5, `state-gc-migrate` 1, `manifest-persist` 3, `version-lib` 2, `version-prerelease` 1, `validate-cost-tiers` 1, `verify-pipeline` 12, `await-remote-review` 14, `derive-workspace` 4, `ship-hooks` 4, `commit-prepare` 1 (new in wave 1), `post-tool-validate-argv` 1 (new in wave 1). Probe: `preflight-wave-2.md` §Recount.

**Fixture baseline.** `git status --short --ignored -- tests/promptfoo/fixtures-fs | wc -l` printed `0` at `2de6f6f`.

**Baseline input (R-baseline, arbiter 2026-10-21).** In the wave-1 gate, `execute-plan-sdlc/wave-runner-overflow/wave-split-cmd: wave-split subcommand returns 2+2 halves` failed with "Could not determine current branch" because the checkout was a detached HEAD. On a named branch it passes. Every run in this plan (targeted and the four timed runs) is on the named branch `m41-w2-9009-async-runners`. If that case fails under a detached HEAD, it is an environment failure, not a concurrency failure.

**Stale dataset comments.** `datasets/execute-plan-sdlc-context-producer-exec.yaml:25-26` says "providers/script-runner.js issues exactly one spawnSync per test case", and `datasets/execute-plan-sdlc-liveness-exec.yaml:20` says the same (F-spawnsync-to-spawn-parity-edge-cases-6). After this plan both are stale. They stay: datasets are Must-not-touch. No doc goes stale: `docs/architecture.md:225` and `tests/promptfoo/README.md:69` name `script-runner.js` but say nothing about `spawnSync` or concurrency (planner grep).

**Discovery brief.** The plan-explore orchestrator wrote `/tmp/sdlc-explore-m41-w2-9009-async-runners-z1lSjr/discovery-brief.md` (4 code dimensions, 0 web). Its findings that shape the tasks:

- **No shared state among the 61 no-copy cases** (F-no-copy-cases-shared-state-a-1, -a-2, F-no-copy-cases-shared-state-b-1). The one write outside an own directory is `error-report-prepare` writing unique-named manifests to the checkout's `.sdlc/execution/out/` (`plugins/sdlc-utilities/scripts/skill/error-report-prepare.js:144,172`, `lib/output.js:57-80`). No case reads another's file. Task 2 re-does this audit and records it; the brief is input, not proof.
- **Latent, record-only risks** (F-cross-case-fixture-and-order-dependence-1 to -5): a `Date.now()`-named file in `os.tmpdir()` (`tests/promptfoo/scripts/migrate-jira-templates-test.js:220`), a dead one (`version-retag-test.js:65`), `ship.js --gc` cases scanning `os.tmpdir()` (a fresh `TMPDIR` per run confines them), an MCP-failure counter under `os.tmpdir()` (`lib/mcp-failure.js:227`), and a shared random-keyed `jira-sdlc` dir. None is a dependency between cases. Not covered by the brief: `assertions/*.js` beyond the three the item cites, and the hook dataset `hook-stop-plan-integrity-exec.yaml` (Task 2 covers both).
- **Parity traps** (F-spawnsync-to-spawn-parity-edge-cases-1 to -5, -9): five scripts read stdin synchronously (`plan.js:432`, `plan-explore.js:307`, `error-report-prepare.js:91`, `harden-prepare.js:66`, `hooks/session-start.js:34`), so stdin must be ended even with no payload or they hang to the 30 s timer. `markdown-to-adf-exec.yaml:211` depends on `exitCode = status ?? (error ? 1 : 0)` and the stderr rule. `pr-prepare-exec.yaml:129` asserts `not-contains 'Error: spawnSync'`; it still passes. No dataset asserts `ETIMEDOUT`, `ENOBUFS` or `spawnSync node <CODE>`.
- **Measured `maxBuffer`** (F-orchestrator-4): on Node v22.23.3, 2 MiB of stdout gave `spawnSync node ENOBUFS`, status `null`, signal `SIGTERM`. The async port need not cut at the identical byte; no case comes near 1 MiB (F-spawnsync-to-spawn-parity-edge-cases-7).
- **The 1.5× floor (`-j 2`) is a real risk** (F-orchestrator-3, F-spawnsync-to-spawn-parity-edge-cases-8): 789 copies and 500 `setup.sh` runs (exec; hooks 49/49) run serially up front; reviewer measurement of the current sync transform: 76 s (exec), 4.8 s (hooks). The floor stays a STOP.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| §0 base, line endings | no | reads §0's `0c0cdcc` as `2de6f6f` and "CRLF checkout" as LF | probes in "How §0 applies"; quotes are located by content anyway (R-dated) |
| Commit per item (§0 rule 6) | no | no task commits; the one ship run makes one commit | plan-source owner rule: one ship run per branch, exactly one commit |
| Counts | no | uses 846 / 53 / 789 / 49 / 61, not 815 / 756 / 59 | R-dated: the pre-flight recount at `2de6f6f` is binding |
| Verification (1) path | no | writes `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/w112.fx.before`, not `/tmp/w112.fx.before` | plan-source reading; R-scratch |
| Fixture check during targeted runs | no | each targeted verification also checks `git status --short --ignored -- tests/promptfoo/fixtures-fs` prints nothing | Verification (1) is captured after the commit; the base prints nothing (probe), so this catches an in-place write before (1) could mask it |
| Same-process check in Task 1 | no | Task 1 also records whether the transform and the hook share one `globalThis` | the registry design depends on it; a "no" is an unsettled design question, so it is a STOP with a QUESTION |
| Wrapper placement | no | one copy of the spawn wrapper in each provider; no shared module | see Key Decisions (KD1) |
| test-coverage guardrail | no | adds no new promptfoo case | see Key Decisions (KD4) |
| Targeted runs serialized | no | Tasks 3→4→5→6 depend on each other although they edit different files | see Key Decisions (KD3) |
| Speed floor and timed `-j` | yes (owner decision) | timed runs use explicit `-j 2`; floor is exec `-j 2` ≥ 1.5× faster than `-j 1`, hooks `-j 2` not slower; each run logs `(concurrency: N)` = the given `-j`; `concurrency: 8` stays untouched | owner 2026-10-21, ruling w2-floor; replaces the item's ≥2× wording; promptfoo 0.123.1 ignores `concurrency` (reads `maxConcurrency`, default 4), host CPU is limited; follow-up #9145 |
| Registry placement | no | `add(tmpDir)` right after `mkdtempSync`, before `fs.promises.cp` | a copy that fails half-way is still cleaned up |
| Setup stdin | no | ends the `execFile` child's stdin at once, ignores EPIPE | keeps `execSync`'s closed-stdin behaviour |
| Learnings log | no | the planner did not append to `.sdlc/learnings/log.md` (neither the learning-capture entry nor the brief-fallback line) | planner brief: write only under `docs/plans/` |
| Brief validation | no | keeps the discovery brief and cites its IDs | plan-sdlc's check regex `F-[A-Z0-9_-]+-[0-9]+` is case-sensitive and the brief's IDs use lowercase dimension names (`F-orchestrator-3`), so the literal check finds 0; the planner also did the inline exploration the fallback asks for (Research Findings) |

## Key Decisions

- **KD1 — one wrapper copy per provider, not a shared module.** The item's Files list names exactly one new file, `scripts/fixture-copies-cleanup.js`. A shared `providers/spawn-node.js` would add a file the item does not list. The two providers already duplicate their env-building code (`script-runner.js:57-71`, `hook-runner.js:39-52`), so a copy matches the existing pattern. The cost is a DRY warning (guardrail `dry`, accepted): about 35 lines exist twice. Task 4 checks with a `diff` that the two copies are byte-identical, and the wrapper has the same name, `runNode`, in both files, so a later merge is easy.

- **KD2 — the wrapper returns `spawnSync`'s record.** The alternative is to rewrite the output mapping for the new API. Returning `{ stdout, stderr, status, signal, error }` lets `script-runner.js:108-135` and `hook-runner.js:62-66` run byte-identical. That keeps every case's expected output the same, which is what the 899 existing cases test.

- **KD3 — targeted runs never overlap.** Tasks 3, 4 and 5 edit different files and could run in parallel. But their verifications run promptfoo, and two promptfoo processes started together race on the SQLite migration (item Verification preamble). So each task depends on the previous one.

- **KD4 — no new test case.** The `test-coverage-required` guardrail asks for promptfoo cases with every source change. W1.12 forbids any dataset edit (Must not touch: "every dataset's cases, comments and assertions"). The change is also behaviour-preserving by design (KD2). The 899 existing exec cases are its regression test, and Verification (5)'s `fixture-copies-cleanup: removed <n>` line tests the new hook. The timeout and buffer-overflow branches have no case today and get none.

- **KD5 — the transform change stays, although it adds no speed.** Task 1's probe shows promptfoo awaits each transform in turn. An async transform is still what the item asks for, and it must exist to record the copies. The item names the speed gain of this part as unverified and says it changes only speed, not correctness.

- **KD6 — the cleanup guards its own deletes.** It deletes a path only if `path.dirname(p) === os.tmpdir()` and the basename starts with `promptfoo-fixture-`. A path that fails the guard is skipped and not counted. This enforces the guardrail "never delete outside `os.tmpdir()/promptfoo-fixture-*`" in code, not by trust.

## Contract Examples

**Contract (code)** — Task 3's shape, as an example of the code column:

```markdown
**Contract:**
- shape (code): `function runNode(args: string[], opts: { cwd?: string, env: object, input?: string }): Promise<{ stdout: string, stderr: string, status: number|null, signal: string|null, error: Error|undefined }>`; never rejects; `error.message` is `spawnSync node <CODE>`.
- names: `runNode`, `MAX_BUFFER`, `TIMEOUT_MS`.
- mirror: the `spawnSync` call and its options at `tests/promptfoo/providers/script-runner.js:100-106`.
- decisions: KD1 (copy per provider), KD2 (spawnSync record).
- sync: `tests/promptfoo/providers/hook-runner.js` holds the same `runNode`.
```

**Contract (docs)** — Not used: no task in this plan edits a docs artifact. Tasks 1, 2 and 7 write state-dir notes only, which are never committed.

**Contract (openspec)** — Not used: no task edits a spec (spec grep printed nothing).

## Tasks

Common env recipe for every promptfoo command below (`<id>` is the task's id, e.g. `t3`):

```bash
# One Bash call, from the repository root; the subshell keeps the caller's cwd at the root.
(
  cd tests/promptfoo || exit 1
  T=/tmp/claude-1000/pf-tmp-exec-m41/<id>-$(date +%s); mkdir -p "$T"; echo "T=$T"
  git branch --show-current            # must print m41-w2-9009-async-runners (never a detached HEAD)
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR="$T" \
    npx --yes promptfoo@0.123.1 eval -c <config> --filter-pattern '<pattern>' --no-cache 2> "$T.stderr"; echo "EXIT=$?"
  command grep -c '^fixture-copies-cleanup: removed ' "$T.stderr"
  find "$T" -maxdepth 1 -name 'promptfoo-fixture-*' | wc -l
  git -C ../.. status --short --ignored -- tests/promptfoo/fixtures-fs   # must print nothing
)
```

Run one promptfoo command at a time. Do not retry a failed run. A failure or error is a STOP with the case's dataset and description. A pass count different from the stated one (with no failure) is also a STOP: report the count; it means the filter selected a different case set, not a regression. The stated counts are planner js-yaml probes at `2de6f6f`.

### Task 1: Verify the promptfoo 0.123.1 hook and transform facts (no edit)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/w112-audit.md` — state-dir note, section `## Change 1 — promptfoo 0.123.1 facts` (never committed)

**Notes:**
This is item Change 1 (planner probe and F-orchestrator-1 to -3 already point to "supported"; re-confirm, do not copy). The cleanup design depends on fact (a), so (a) is a STOP gate. Fact (b) is a PR-body note only. Fact (c) is a plan addition (see Deviations): the registry only works if both modules see one `globalThis`.

**Acceptance criteria:**
- [ ] `npx --yes promptfoo@0.123.1 --version` prints `0.123.1`, and the note names the package directory it resolved (find it with `command grep -l '"version": "0.123.1"' ~/.npm/_npx/*/node_modules/promptfoo/package.json`).
- [ ] (a) The note quotes, with `file:line`, the code that calls an `extensions:` entry `file://<path>:afterAll` only for the `afterAll` hook, and the calling convention it uses (`fn(context, { hookName })`). It records the exact config form to register: `extensions:` / `  - file://scripts/fixture-copies-cleanup.js:afterAll`.
- [ ] (b) The note records, with `file:line`, where `transformVars` is applied: per case inside the concurrency pool, or all up front.
- [ ] (c) The note records, with `file:line`, whether file transforms and extension hooks load in the same Node process (same `globalThis`).
- [ ] The note records the spec grep: `command grep -rnE 'spawnSync|script-runner|hook-runner|transformVars' docs/specs/ | wc -l` prints `0`.
- [ ] No file in the repository changes: `git status --porcelain` prints nothing except `?? docs/plans/2026-10-21-m41-w2-async-runners.md` (this plan, while it is untracked), and `git diff --stat` prints nothing.

**STOP conditions (exactly as the item states, plus the plan addition):**
- If 0.123.1 does not call a `file://…:afterAll` extension for the `afterAll` hook: **STOP**. "The cleanup design is open and the owner decides." Write the evidence into the note and report.
- If (c) is "no": **STOP with a QUESTION** ("the transform and the hook do not share `globalThis`; how should the copy registry reach the hook?").
- If the spec grep prints anything: **STOP with a QUESTION** (a spec-consequence commit would be needed first).

**Contract:**
- shape (code): read-only probe; output is the note section below, nothing else.
  ```markdown
  ## Change 1 — promptfoo 0.123.1 facts
  - package: <dir> (version 0.123.1)
  - (a) afterAll extension: <yes|no> — <file:line> — convention <fn(context, { hookName })> — config form `- file://scripts/fixture-copies-cleanup.js:afterAll`
  - (b) transformVars: <up front, sequential | per case in pool> — <file:line>
  - (c) same process/globalThis: <yes|no> — <file:line>
  - spec grep: <n> lines
  ```
- names: section heading `## Change 1 — promptfoo 0.123.1 facts`.
- mirror: the claim→source table in this plan's Research Findings (planner probe; re-run it, do not copy it).
- decisions: the note lives in the state dir, never in the repository (plan-source).
- sync: Task 6 uses the config form recorded in (a), verbatim.

### Task 2: Shared-state audit of the exec cases (no edit)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/w112-audit.md` — append section `## Change 2 — shared-state audit` (never committed)

**Notes:**
This is item Change 2. After Tasks 3–6, several cases run at once (2 in the timed `-j 2` runs, up to promptfoo's default 4 elsewhere) and share one `TMPDIR`, one `HOME` (unless `script_home` sets it), one repository checkout and one `.sdlc/execution/` directory. A case that is safe one at a time can collide there. The audit works per invoked script (`script_path`), then maps scripts to cases, because 899 cases call far fewer scripts.

**Acceptance criteria:**
- [ ] The note lists every one of the 61 cases without a fixture copy, recounted at the base: exec 57 + hooks 4. A different count is a STOP. Expected per dataset (pre-flight `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/preflight-wave-2.md` §"Per-dataset cases WITHOUT project_root"): `sdlc-dimensions-exec` 1, `ship-prepare-exec` 5, `error-report-prepare-exec` 5, `session-start-exec` 1, `jira-sdlc-guardrail-exec` 5, `state-gc-migrate-exec` 1, `manifest-persist-exec` 3, `version-lib-exec` 2, `version-prerelease-exec` 1, `validate-cost-tiers-exec` 1, `verify-pipeline-exec` 12, `await-remote-review-exec` 14, `derive-workspace-exec` 4, `commit-prepare-exec` 1, `post-tool-validate-argv-exec` 1 (exec, 57); `ship-hooks-exec` 4 (hooks). Recount: for each dataset of each config, count the cases whose `vars.project_root` does not start with `file://fixtures-fs/` (js-yaml from the promptfoo package, e.g. `require('<pkg dir>/../js-yaml')`).
- [ ] For each of the 61 cases, the note records: (i) does it write outside a directory it created itself (answer with the path, or `none`); (ii) does it read anything another case writes (`yes` + what, or `no`); (iii) is it order-dependent (passes only because an earlier case ran).
- [ ] For every dataset whose cases share a fixture name, the note records (i) and (ii) per invoked script, mapped to its cases.
- [ ] Each answer cites evidence: the script's write site `file:line`, or the case's `script_home` / `script_env` / `script_cwd` var.
- [ ] The places checked are at least: the repository checkout (a case without `script_cwd` runs in `tests/promptfoo`), `$HOME` (`~/.sdlc-cache`, `~/.claude`), fixed file names directly in `os.tmpdir()`, `.sdlc/execution/` of the main worktree (state files keyed by branch), and `.sdlc/execution/out/` (P13 manifests).
- [ ] The note also covers what the discovery brief did not: every `tests/promptfoo/assertions/*.js` (does it write, and where), and `datasets/hook-stop-plan-integrity-exec.yaml`. It records each record-only risk the brief found (F-cross-case-fixture-and-order-dependence-1 to -5) with a yes/no on "dependency between cases".
- [ ] Known safe pattern, recorded with its probe: `writeOutput` manifests in `.sdlc/execution/out/` have unique names (`<prefix>-<slug>-<ts>-<4 hex>.json`), and prune-on-write removes only files older than 1 hour (W1.9).
- [ ] No dataset, assertion or fixture changes: `git status --porcelain` prints nothing except `?? docs/plans/2026-10-21-m41-w2-async-runners.md` (this plan, while it is untracked), and `git diff --stat` prints nothing.

**STOP condition (exactly as the item states):** If any case depends on state shared with another case, **STOP** and list the cases (dataset + description). Do not edit datasets.

**Contract:**
- shape (code): read-only audit; output is the note section below.

  | dataset | description | script | (i) writes outside own dir | (ii) reads another case's writes | (iii) order-dependent | evidence |
  |---|---|---|---|---|---|---|
  | `ship-prepare-exec` | `ship-prepare: …` | `plugins/sdlc-utilities/scripts/skill/ship.js` | `none` / `<path>` | `no` / `yes: <what>` | `no` / `yes` | `<file:line>` |
  | … | … | … | … | … | … | … |

  followed by one line `Verdict: no shared state` or `STOP: <n> cases share state` with the list.
- names: section heading `## Change 2 — shared-state audit`.
- mirror: the per-dataset table layout of `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/preflight-wave-2.md` §"Per-dataset cases WITHOUT project_root".
- decisions: audit per script, then map to cases (Notes); the brief (F-no-copy-cases-shared-state-a-1, -b-1) is input to check, not a result to copy.
- sync: the PR body quotes this section's verdict.

### Task 3: Non-blocking `spawn` in `script-runner.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/script-runner.js` — swap the `spawnSync` import and call for a local `runNode` promise wrapper; lines 108–139 unchanged

**Notes:**
Every exec case except the hooks config goes through this provider, so a mapping slip shows up as mass failures. The wrapper's job is to reproduce `spawnSync`'s record exactly (KD2). Confirm in the Node v22 docs (`child_process.spawnSync`, option `maxBuffer`) that the default is `1024 * 1024` bytes; if it is not, STOP and report.

**Current state (locate each by content, exactly once):**

```bash
command grep -F -- "const { spawnSync } = require('child_process');" tests/promptfoo/providers/script-runner.js | wc -l   # 1 (line 23)
command grep -F -- "const result = spawnSync('node', [scriptPath, ...scriptArgs], {" tests/promptfoo/providers/script-runner.js | wc -l   # 1 (line 100)
command grep -F -- "      input: scriptStdin," tests/promptfoo/providers/script-runner.js | wc -l   # 1 (line 105)
command grep -F -- "const exitCode = result.status ?? (result.error ? 1 : 0);" tests/promptfoo/providers/script-runner.js | wc -l   # 1 (line 110)
```

**Change (apply bottom-up):**

```diff
@@ line 100-106
-    const result = spawnSync('node', [scriptPath, ...scriptArgs], {
-      timeout: 30_000,
-      encoding: 'utf8',
-      cwd,
-      env,
-      input: scriptStdin,
-    });
+    const result = await runNode([scriptPath, ...scriptArgs], { cwd, env, input: scriptStdin });

     const rawStdout = result.stdout ?? '';
     const stderr = (result.stderr ?? '').trim();
     const exitCode = result.status ?? (result.error ? 1 : 0);
```

```diff
@@ line 23-28
-const { spawnSync } = require('child_process');
+const { spawn } = require('child_process');

 // Matches paths created by lib/output.js#createOutputFile via os.tmpdir() on macOS/Linux:
 //   /tmp/...,  /var/folders/.../...  (macOS),  /private/var/...  (macOS canonicalized)
 const TMP_PATH_RE = /^(?:\/(?:tmp|var|private)\/.+|.+\/\.sdlc\/execution\/out\/.+)\.json$/;
+
+// spawnSync's limits, kept so every case sees the same outcome as before.
+const TIMEOUT_MS = 30_000;
+const MAX_BUFFER = 1024 * 1024; // spawnSync default maxBuffer, bytes per stream
+
+
+// Async stand-in for spawnSync('node', args, { timeout, encoding: 'utf8', input }):
+// resolves (never rejects) with the same { stdout, stderr, status, signal, error } record.
+function runNode(args, { cwd, env, input }) {
+  return new Promise((resolve) => {
+    const out = { stdout: '', stderr: '' };
+    const bytes = { stdout: 0, stderr: 0 };
+    let error;
+    const child = spawn('node', args, { cwd, env, stdio: 'pipe' });
+    const fail = (code) => {
+      if (!error) error = new Error(`spawnSync node ${code}`);
+      child.kill('SIGTERM');
+    };
+    const timer = setTimeout(() => fail('ETIMEDOUT'), TIMEOUT_MS);
+    for (const name of ['stdout', 'stderr']) {
+      child[name].setEncoding('utf8');
+      child[name].on('data', (chunk) => {
+        out[name] += chunk;
+        bytes[name] += Buffer.byteLength(chunk, 'utf8');
+        if (bytes[name] > MAX_BUFFER) fail('ENOBUFS');
+      });
+    }
+    child.on('error', (err) => {
+      if (!error) error = new Error(`spawnSync node ${err.code}`);
+    });
+    // Always end stdin (EOF), as spawnSync does; ignore EPIPE when the child exits first.
+    child.stdin.on('error', () => {});
+    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
+    child.on('close', (code, signal) => {
+      clearTimeout(timer);
+      // spawnSync reports status null whenever it reports an error.
+      resolve({ stdout: out.stdout, stderr: out.stderr, status: error ? null : code, signal, error });
+    });
+  });
+}
```

This body is the decided shape; write it as shown. Probe for `status: error ? null : code`: a failed `spawn` (`ENOENT`) emits `'error'` and then `'close'` with code `-2`, not `null` (planner probe on Node v22.23.3), while `spawnSync` reports `null`.

Planner parity probe (scratchpad copy of this body, Node v22.23.3, side by side with `spawnSync`): exit 3 with stdout/stderr, no-payload stdin read to EOF, a 5-byte payload, 2 MiB of stdout, a missing script, and a 5 s child under a 500 ms timer all gave the same `status`, `signal`, `error.message`, stdout and stderr. The one difference is where stdout is cut on `ENOBUFS` (1205952 vs 1114112 characters); no case depends on it (F-orchestrator-4).

`runNode` behaviour (the wrapper resolves once, on the child's `'close'` event):

| Condition | `status` | `signal` | `error.message` | stdout / stderr |
|---|---|---|---|---|
| Child exits with code N | N | `null` | (no error) | collected text |
| Child killed by the 30 s timer (`SIGTERM`) | `null` | `'SIGTERM'` | `spawnSync node ETIMEDOUT` | text collected so far |
| A stream passes `MAX_BUFFER` bytes → child gets `SIGTERM` | `null` | `'SIGTERM'` | `spawnSync node ENOBUFS` | text collected so far |
| `spawn` fails (`'error'` event, e.g. `ENOENT`; `'close'` then reports code `-2`) | `null` | `null` | `spawnSync node <err.code>` | `''` |
| Child killed by another signal | `null` | `<signal>` | (no error) | collected text |

Stdin is always ended: `child.stdin.end(input)` when `input !== undefined`, else `child.stdin.end()`. This matters: five scripts read stdin synchronously and would otherwise wait for the 30 s timer (F-spawnsync-to-spawn-parity-edge-cases-4). An `'error'` listener on `child.stdin` swallows `EPIPE` (the child may exit before reading). Both streams use `setEncoding('utf8')`; the byte count for `MAX_BUFFER` uses `Buffer.byteLength(chunk, 'utf8')`. The timer is cleared on `'close'`.

**Must not touch** (line numbers are base `2de6f6f` numbers, before this task's insertions; after the edit, locate by content): `TMP_PATH_RE` (line 27); the header comment's `script_*` var contract (lines 1–20); lines 108–139 (output mapping, temp-path auto-read, `if (result.error) { return { output: result.error.message }; }`, stderr rule); `maybeReadTmpFile`; any dataset, assertion or fixture.

**Acceptance criteria:**
- [ ] `command grep -cF -- "{ spawnSync }" tests/promptfoo/providers/script-runner.js` and `command grep -cF -- "= spawnSync(" tests/promptfoo/providers/script-runner.js` both print `0`. (The word `spawnSync` survives only in comments and in the `spawnSync node <CODE>` message, so do not grep for the bare word.)
- [ ] `node --check tests/promptfoo/providers/script-runner.js` exits 0.
- [ ] `w112-audit.md` §Change 1 records the Node docs page/version (v22.x `child_process.spawnSync` `maxBuffer`) and the default `1024 * 1024`.
- [ ] `git diff --stat` shows only this file changed in the repository.
- [ ] Targeted run (env recipe, id `t3`, config `promptfooconfig-exec.yaml`, pattern `^(session-start|script_stub_bin|error-report-prepare|received-review-prepare)`) prints `EXIT=0` and reports 37 passed, 0 failed, 0 errors (count: planner js-yaml probe over the config's datasets at `2de6f6f`). These cases cover stdin payloads, stub `PATH`, `--output-file` temp-path reads, `script_capture_stderr`, non-zero exits and a provider error.
- [ ] The fixture check after the run prints nothing.

**Contract:**
- shape (code): `function runNode(args, { cwd, env, input })` → `Promise<{ stdout: string, stderr: string, status: number|null, signal: string|null, error: Error|undefined }>`; never rejects; `spawn('node', args, { cwd, env })`; error messages `spawnSync node ETIMEDOUT` | `spawnSync node ENOBUFS` | `spawnSync node <spawn err.code>`.
- names: `runNode`, `TIMEOUT_MS`, `MAX_BUFFER`; import `spawn` (replaces `spawnSync`).
- mirror: the `spawnSync` call it replaces, `tests/promptfoo/providers/script-runner.js:100-106`; the result fields read at `:108-110` and `:127-128`.
- decisions: KD1, KD2; timeout and buffer limits copied from `spawnSync` (item Change 3); parity traps F-spawnsync-to-spawn-parity-edge-cases-2, -3, -4, -9.
- sync: Task 4 puts the same `runNode` in `hook-runner.js`.

### Task 4: Non-blocking `spawn` in `hook-runner.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/hook-runner.js` — swap the `spawnSync` import and call for the same `runNode` wrapper; output keys unchanged

**Notes:**
Same wrapper as Task 3 (KD1), written out in full below. stdin is always a string here (`stdinData` defaults to `''`), so it is always `child.stdin.end(stdinData)`.

**Current state (locate each by content, exactly once):**

```bash
command grep -F -- "const { spawnSync } = require('child_process');" tests/promptfoo/providers/hook-runner.js | wc -l   # 1 (line 21)
command grep -F -- "const result = spawnSync('node', [scriptPath, ...scriptArgs], {" tests/promptfoo/providers/hook-runner.js | wc -l   # 1 (line 54)
command grep -F -- "      exitCode: result.status ?? -1," tests/promptfoo/providers/hook-runner.js | wc -l   # 1 (line 65)
```

**Change (apply bottom-up):**

```diff
@@ line 54-66
-    const result = spawnSync('node', [scriptPath, ...scriptArgs], {
-      input: stdinData,
-      timeout: 30_000,
-      encoding: 'utf8',
-      cwd,
-      env,
-    });
+    const result = await runNode([scriptPath, ...scriptArgs], { cwd, env, input: stdinData });

     const output = JSON.stringify({
       stdout: result.stdout || '',
       stderr: result.stderr || '',
       exitCode: result.status ?? -1,
     }, null, 2);
```

```diff
@@ line 20-22
 const path = require('path');
-const { spawnSync } = require('child_process');
+const { spawn } = require('child_process');
+
+// spawnSync's limits, kept so every case sees the same outcome as before.
+const TIMEOUT_MS = 30_000;
+const MAX_BUFFER = 1024 * 1024; // spawnSync default maxBuffer, bytes per stream
+
+
+// Async stand-in for spawnSync('node', args, { timeout, encoding: 'utf8', input }):
+// resolves (never rejects) with the same { stdout, stderr, status, signal, error } record.
+function runNode(args, { cwd, env, input }) {
+  return new Promise((resolve) => {
+    const out = { stdout: '', stderr: '' };
+    const bytes = { stdout: 0, stderr: 0 };
+    let error;
+    const child = spawn('node', args, { cwd, env, stdio: 'pipe' });
+    const fail = (code) => {
+      if (!error) error = new Error(`spawnSync node ${code}`);
+      child.kill('SIGTERM');
+    };
+    const timer = setTimeout(() => fail('ETIMEDOUT'), TIMEOUT_MS);
+    for (const name of ['stdout', 'stderr']) {
+      child[name].setEncoding('utf8');
+      child[name].on('data', (chunk) => {
+        out[name] += chunk;
+        bytes[name] += Buffer.byteLength(chunk, 'utf8');
+        if (bytes[name] > MAX_BUFFER) fail('ENOBUFS');
+      });
+    }
+    child.on('error', (err) => {
+      if (!error) error = new Error(`spawnSync node ${err.code}`);
+    });
+    // Always end stdin (EOF), as spawnSync does; ignore EPIPE when the child exits first.
+    child.stdin.on('error', () => {});
+    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
+    child.on('close', (code, signal) => {
+      clearTimeout(timer);
+      // spawnSync reports status null whenever it reports an error.
+      resolve({ stdout: out.stdout, stderr: out.stderr, status: error ? null : code, signal, error });
+    });
+  });
+}

```

The inserted block is byte-identical to the one Task 3 inserts into `script-runner.js` (the acceptance `diff` checks it).

The output stays `JSON.stringify({ stdout: stdout || '', stderr: stderr || '', exitCode: code ?? -1 }, null, 2)`, read from the wrapper's record as `result.stdout`, `result.stderr`, `result.status` (lines 62–66 unchanged).

**Must not touch** (base `2de6f6f` line numbers, before this task's insertions): the header's `script_*` var contract (lines 1–19); lines 62–68 (from `const output = JSON.stringify({` to `return { output };`); any dataset, assertion or fixture.

**Acceptance criteria:**
- [ ] `node --check tests/promptfoo/providers/hook-runner.js` exits 0.
- [ ] The `runNode` block and its two constants are byte-identical in both providers: `diff <(sed -n '/^const TIMEOUT_MS/,/^}$/p' tests/promptfoo/providers/script-runner.js) <(sed -n '/^const TIMEOUT_MS/,/^}$/p' tests/promptfoo/providers/hook-runner.js)` prints nothing.
- [ ] Targeted run (env recipe, id `t4`, config `promptfooconfig-exec-hooks.yaml`, pattern `^(stop-plan-integrity|pipeline-continue)`) prints `EXIT=0` and reports 18 passed, 0 failed, 0 errors (planner js-yaml probe at `2de6f6f`).
- [ ] The fixture check after the run prints nothing.

**Contract:**
- shape (code): same `runNode` signature and error table as Task 3; call site `await runNode([scriptPath, ...scriptArgs], { cwd, env, input: stdinData })`.
- names: `runNode`, `TIMEOUT_MS`, `MAX_BUFFER`; import `spawn`.
- mirror: `runNode` in `tests/promptfoo/providers/script-runner.js` (after Task 3).
- decisions: KD1; output mapping unchanged, `exitCode: -1` on a signal (item Change 4; F-spawnsync-to-spawn-parity-edge-cases-3, -5).
- sync: byte-identical `runNode` block with `script-runner.js` (acceptance diff).

### Task 5: Non-blocking copy and setup in `extract-skill-content.js`, with a copy registry

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/extract-skill-content.js` — `fs.promises.cp` + promisified `execFile` for `setup.sh`; record each copy in `globalThis.__sdlcFixtureCopies`

**Notes:**
The copy path and the copy-then-setup order stay, so every `setup.sh` still runs on the copy. A failing `setup.sh` must still throw from the transform: promisified `execFile` rejects on a non-zero exit and on its timeout, as `execSync` threw. The behavioural config shares this transform but never reaches this branch (no behavioural dataset sets `project_root`; pre-flight).

**Current state (locate each by content, exactly once):**

```bash
command grep -F -- "const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));" tests/promptfoo/scripts/extract-skill-content.js | wc -l   # 1 (line 49)
command grep -F -- "fs.cpSync(sourceDir, tmpDir, { recursive: true });" tests/promptfoo/scripts/extract-skill-content.js | wc -l   # 1 (line 50)
command grep -F -- "execSync(\`bash \"\${setupScript}\"\`, { cwd: tmpDir, timeout: 10_000, stdio: 'pipe' });" tests/promptfoo/scripts/extract-skill-content.js | wc -l   # 1 (line 56)
```

(If the shell escaping of the third pattern is awkward, use `command grep -F -- "{ cwd: tmpDir, timeout: 10_000, stdio: 'pipe' }"`; it must also print 1.)

**Change (apply bottom-up):**

```diff
@@ line 46-61
   if (vars.project_root && vars.project_root.startsWith('file://fixtures-fs/')) {
     const relativePath = vars.project_root.replace('file://fixtures-fs/', 'tests/promptfoo/fixtures-fs/');
     const sourceDir = path.join(REPO_ROOT, relativePath);
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));
-    fs.cpSync(sourceDir, tmpDir, { recursive: true });
+    // Registry read by scripts/fixture-copies-cleanup.js (afterAll hook, exec configs only).
+    (globalThis.__sdlcFixtureCopies ??= new Set()).add(tmpDir);
+    await fs.promises.cp(sourceDir, tmpDir, { recursive: true });

     // Auto-run fixture setup script if present (initializes git state, stages files, etc.)
     const setupScript = path.join(tmpDir, 'setup.sh');
     if (fs.existsSync(setupScript)) {
-      const { execSync } = require('child_process');
-      execSync(`bash "${setupScript}"`, { cwd: tmpDir, timeout: 10_000, stdio: 'pipe' });
+      const setup = execFileAsync('bash', [setupScript], { cwd: tmpDir, timeout: 10_000 });
+      setup.child.stdin.on('error', () => {}); // ignore EPIPE, as in the providers
+      setup.child.stdin.end(); // EOF at once, as the old synchronous call gave
+      await setup;
     }
```

```diff
@@ line 1-4
 const fs = require('fs');
 const os = require('os');
 const path = require('path');
+const { execFile } = require('child_process');
+const { promisify } = require('util');
+
+const execFileAsync = promisify(execFile);
```

The registry `add` comes right after `mkdtempSync` (before the copy), so a copy that fails half-way is still cleaned up. `setup.child.stdin.end()` keeps `execSync`'s closed-stdin behaviour. Probes: no fixture `setup.sh` reads stdin (`grep` for `read`, bare `cat`, `/dev/stdin`, `<&0` over `fixtures-fs/*/setup.sh` printed 0 files), and `promisify(execFile)(…)` returns a promise with a `.child` whose `stdin.end()` lets a `cat`-reading child finish (planner probe, Node v22.23.3).

**Must not touch:** lines 8–45 and 59–106 (other transform branches, `result.project_root = tmpDir`, placeholder substitution); the `promptfoo-fixture-` prefix; `tests/promptfoo/promptfooconfig.yaml`; any dataset or fixture.

**Acceptance criteria:**
- [ ] `node --check tests/promptfoo/scripts/extract-skill-content.js` exits 0.
- [ ] `command grep -cE 'cpSync|execSync' tests/promptfoo/scripts/extract-skill-content.js` prints `0`.
- [ ] Targeted run (env recipe, id `t5`, config `promptfooconfig-exec.yaml`, pattern `^(harvest-learnings|config-sdlc-root): `) prints `EXIT=0` and reports 30 passed, 0 failed, 0 errors (planner js-yaml probe at `2de6f6f`: 30 cases, all with `project_root`). 8 of these cases use fixtures with `setup.sh`.
- [ ] Without the hook (Task 6 not done yet), `find "$T" -maxdepth 1 -name 'promptfoo-fixture-*' | wc -l` prints `30` (one copy per case; shows the copy path is unchanged).
- [ ] The fixture check after the run prints nothing.

**Contract:**
- shape (code): `module.exports = async function transformVars(vars)` unchanged in signature; copy via `await fs.promises.cp(sourceDir, tmpDir, { recursive: true })`; setup via `execFileAsync('bash', [setupScript], { cwd: tmpDir, timeout: 10_000 })`, its `.child.stdin` ended at once, then awaited (rejects → transform throws); registry `globalThis.__sdlcFixtureCopies: Set<string>`.
- names: `execFileAsync`, `globalThis.__sdlcFixtureCopies`.
- mirror: the copy block it replaces, `tests/promptfoo/scripts/extract-skill-content.js:46-61`.
- decisions: KD5 (F-orchestrator-3); registry name and form fixed by item Change 5.
- sync: Task 6's hook reads `globalThis.__sdlcFixtureCopies`.

### Task 6: `afterAll` cleanup hook, registered in both exec configs

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 5
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/fixture-copies-cleanup.js` — exports `async function afterAll()`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — add one `extensions:` entry
- Modify: `tests/promptfoo/promptfooconfig-exec-hooks.yaml` — add one `extensions:` entry

**Notes:**
The hook must never fail the run: promptfoo wraps a throwing hook as `Extension hook "afterAll" failed` and the eval errors (`evaluatorHelpers-BGZUsdbL.js:542-547`). So every delete is inside a try/catch. The behavioural config gets no hook (item Change 5).

**Change — new file `tests/promptfoo/scripts/fixture-copies-cleanup.js`:**

```js
const fs = require('fs');
const os = require('os');
const path = require('path');

// afterAll extension hook (exec configs only): removes the per-case fixture copies
// that scripts/extract-skill-content.js recorded in globalThis.__sdlcFixtureCopies.
async function afterAll() {
  let removed = 0;
  for (const p of globalThis.__sdlcFixtureCopies ?? []) {
    // Delete only our own copies: directly under os.tmpdir(), named promptfoo-fixture-*.
    if (path.dirname(p) !== os.tmpdir() || !path.basename(p).startsWith('promptfoo-fixture-')) continue;
    try {
      await fs.promises.rm(p, { recursive: true, force: true });
      removed++;
    } catch (_) { /* never throw: a failing hook fails the whole eval */ }
  }
  console.error(`fixture-copies-cleanup: removed ${removed}`);
}

module.exports = { afterAll };
```

**Change — config delta (both exec configs, same op):**

| Op | Key | Type | Value | Notes |
|---|---|---|---|---|
| add | `extensions` | list of string | `- file://scripts/fixture-copies-cleanup.js:afterAll` | top-level key, placed after the `defaultTest:` block, before `tests:`; use the exact form Task 1 (a) recorded |

```diff
 defaultTest:
   options:
     transformVars: "file://scripts/extract-skill-content.js"

+extensions:
+  - file://scripts/fixture-copies-cleanup.js:afterAll
+
 tests:
```

Both configs have the same layout here (planner probe: exec lines 14–18, hooks lines 12–16, are `defaultTest:`, `  options:`, `    transformVars: "file://scripts/extract-skill-content.js"`, a blank line, `tests:`). Anchor (each config, exactly once): `command grep -F -- 'transformVars: "file://scripts/extract-skill-content.js"' <config> | wc -l` prints `1`, and `command grep -c '^extensions:' <config>` prints `0` before the edit.

**Must not touch:** `concurrency: 8` in both configs; `providers:`, `prompts:`, `tests:` lists; `tests/promptfoo/promptfooconfig.yaml`; the pinned promptfoo version.

**Acceptance criteria:**
- [ ] `node --check tests/promptfoo/scripts/fixture-copies-cleanup.js` exits 0, and `node -e "const m=require('./tests/promptfoo/scripts/fixture-copies-cleanup.js'); console.log(typeof m.afterAll)"` prints `function`.
- [ ] Each exec config has exactly one `^extensions:` line, and `command grep -c 'concurrency: 8'` still prints `1` in each.
- [ ] Exec targeted run (env recipe, id `t6a`, config `promptfooconfig-exec.yaml`, pattern `^(harvest-learnings|config-sdlc-root): `) prints `EXIT=0`, 30 passed; `"$T.stderr"` has exactly one line `fixture-copies-cleanup: removed <n>` with `n` ≥ 30; `find "$T" -maxdepth 1 -name 'promptfoo-fixture-*' | wc -l` prints `0`.
- [ ] Hooks targeted run (id `t6b`, config `promptfooconfig-exec-hooks.yaml`, pattern `^(stop-plan-integrity|pipeline-continue)`) prints `EXIT=0`, 18 passed; one `fixture-copies-cleanup: removed <n>` line with `n` ≥ 18; the same `find` prints `0`.
- [ ] The fixture check after each run prints nothing.

**Contract:**
- shape (code): `async function afterAll(): Promise<void>`, exported as `module.exports = { afterAll }`; never throws; one stderr line `fixture-copies-cleanup: removed <n>`; deletes only `p` with `path.dirname(p) === os.tmpdir()` and basename prefix `promptfoo-fixture-`, via `fs.promises.rm(p, { recursive: true, force: true })`.
- names: file `tests/promptfoo/scripts/fixture-copies-cleanup.js`; export `afterAll`; config key `extensions`.
- mirror: CommonJS module style of `tests/promptfoo/scripts/extract-skill-content.js:1-8`.
- decisions: KD6 (guarded deletes); registration form from Task 1 (a) (F-orchestrator-1, F-orchestrator-2).
- sync: registry name `globalThis.__sdlcFixtureCopies` matches Task 5; both exec configs carry the identical entry.

### Task 7: Pre-commit check and the after-commit runbook

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2, Task 6
**Verify:** manual

**Files:**
- Modify: `/workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/w112-audit.md` — append the heading `## After the commit` and the empty table header only (never committed); the rows are filled by the executor after the ship commit, outside this plan.

**Notes:**
Out-of-scope addition (no brief finding): the plan source requires a last task that names Verification (1)–(6) for the executor. The item's Verification (1)–(5) are not ship-run tasks. The executor runs them once, after the ship commit, on the final head; they are also the pre-PR full runs. This task only checks the tree before the commit and names the steps.

**Acceptance criteria:**
- [ ] `git status --porcelain` lists exactly these six paths and nothing else, each as `XY path` (status `M` = staged or unstaged; ` M path` with a leading space is unstaged): `M` `tests/promptfoo/providers/script-runner.js`, `M` `tests/promptfoo/providers/hook-runner.js`, `M` `tests/promptfoo/scripts/extract-skill-content.js`, `M` `tests/promptfoo/promptfooconfig-exec.yaml`, `M` `tests/promptfoo/promptfooconfig-exec-hooks.yaml`, `??` `tests/promptfoo/scripts/fixture-copies-cleanup.js` (plus this plan file if it is still untracked, and its `site/src/content-source/plans/` copy if `node site/scripts/copy-docs.mjs` has run; the wave-1 ship commit `2de6f6f` carried its plan files and their site copies the same way). The ship commit includes this plan file (and its site copy if generated), as 2de6f6f did; if it does not, Verification (4) excludes exactly those paths.
- [ ] `git diff -- tests/promptfoo/promptfooconfig.yaml tests/promptfoo/datasets tests/promptfoo/assertions tests/promptfoo/fixtures-fs tests/promptfoo/providers/claude-cli.js` prints nothing.
- [ ] The commit subject the ship run uses is `test(#9009): promptfoo - async runners, fixture-copy cleanup (W1.12)` (68 characters).

---

**After the commit — the executor runs these once, on the final head, on the named branch, one config at a time (never in parallel):**

**Do not run any step of the runbook in this task.**

1. Verification (1): `git status --short --ignored -- tests/promptfoo/fixtures-fs > /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/w112.fx.before`.
2. Verification (2): four timed full runs, each with its own fresh `TMPDIR` under `/tmp/claude-1000/pf-tmp-exec-m41/` and the env recipe (no `--filter-pattern`), each timed with `date +%s` before and after, with an explicit `-j` and an `-o` export (`<sha7>` = `git rev-parse --short=7 HEAD`; `<cfg>` = `exec` | `hooks`):
   - `promptfooconfig-exec.yaml -j 1 -o /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/pf-logs/w112-j1-exec-<sha7>.json`, then `promptfooconfig-exec.yaml -j 2 -o /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/pf-logs/pre-pr-exec-<sha7>.json`;
   - `promptfooconfig-exec-hooks.yaml -j 1 -o /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/pf-logs/w112-j1-hooks-<sha7>.json`, then `promptfooconfig-exec-hooks.yaml -j 2 -o /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/pf-logs/pre-pr-hooks-<sha7>.json`.
   The two `-j 2` runs double as the T1 pre-PR full runs. Every timed run logs promptfoo's `(concurrency: N)` line (record it in the table); it must read `1` for the `-j 1` runs and `2` for the `-j 2` runs. Never run without `-j`: promptfoo 0.123.1 ignores the configs' `concurrency: 8` key and would use its default 4 (owner 2026-10-21, ruling w2-floor; replaces the item's ≥2× wording).
   Record the four wall times next to the earlier 11m27s figure (concurrency 4, old runners).
   Timing biases (no change to the method): the PR names them: the order of runs (`-j 1` runs first), the warm page cache this gives the `-j 2` run, host load, and the 1 s resolution of `date +%s` on the short hooks run.
3. Verification (3): every run passes with exactly the base's counts: exec 846, hooks 53; no failure, no error, no case added or removed.
4. Verification (4): `git status --short` prints nothing, and `git status --short --ignored -- tests/promptfoo/fixtures-fs` matches `w112.fx.before`.
5. Verification (5): after each run, `find "$TMPDIR" -maxdepth 1 -name 'promptfoo-fixture-*' | wc -l` prints `0`, and the run's stderr has one `fixture-copies-cleanup: removed <n>` line with `n` ≥ 789 (exec) or ≥ 49 (hooks).
6. Verification (6): no behavioural run.

**STOP conditions after the commit (no tuning loop, no retry):**
- `promptfooconfig-exec.yaml` at `-j 2` is less than 1.5× faster than its `-j 1` run, or the hooks config's `-j 2` run is slower than its `-j 1` run: **STOP** and report all four times, no tuning loop (owner 2026-10-21, ruling w2-floor; replaces the item's ≥2× wording). "The item's premise failed."
- A timed run whose `(concurrency: N)` line does not read the `-j` it was given: **STOP** and report it.
- A case fails only at `-j 2`, or depends on state shared with another case: **STOP** and list it with its dataset and description. Do not change any dataset, assertion or fixture. Do not lower `concurrency`.
- `execute-plan-sdlc/wave-runner-overflow/wave-split-cmd: …` failing with "Could not determine current branch" means the checkout was detached. That is not a concurrency failure (R-baseline). The run is invalid: **STOP** and report it with `git branch --show-current` output. Do not re-run on your own; the plan does not decide whether a re-run is allowed.

**Contract:**
- shape (code): check-only task; output is the three acceptance checks plus the empty `## After the commit` heading and table header. **Do not run any step of the runbook in this task.**

  | run | config | `-j` | `(concurrency: N)` | start | end | wall s | passed | failed | errors | cleanup n | leftover copies | `-o` export |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|

- names: section heading `## After the commit`.
- mirror: item W1.12 Verification (1)–(6) and Done when (plan source).
- decisions: Verification runs after the commit, not inside the ship run (plan source).
- sync: the PR body quotes the four wall times and the counts.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS (waiver: item Must-not-touch, KD4) | No new case (KD4). W1.12 forbids dataset edits. The change keeps behaviour, so the 899 existing exec cases are its regression suite. The new hook is checked by the `fixture-copies-cleanup: removed <n>` line. No existing case goes stale. |
| no-ci-bypass | error | PASS | No step skips or disables a check. The 1.5× floor at `-j 2` is a STOP, not a tuning target. |
| no-auto-eval | error | PASS | Only exec-only configs run (no LLM), targeted with `--filter-pattern`. No retries. No behavioural run. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a W1.12 change. Task 7 is required by the plan source. |
| single-responsibility-tasks | warning | PASS | One deliverable per task. Task 6 touches three files for one hook and its registration. |
| scripts-over-llm-logic | error | PASS | No skill instructions change. All logic is deterministic Node code. |
| yagni | warning | PASS | No speculative parameters. KD1 rejects a shared module. |
| cross-skill-consistency | error | PASS | No skill is touched. The providers keep the `spawnSync` record (KD2). |
| pr-link-github-issue | error | PASS | Tracked by local todo #9009, not a GitHub issue. The commit subject cites #9009. |
| dry | warning | ACCEPTED | `runNode` exists in both providers (KD1). Byte-identity is checked in Task 4. |
| kiss | warning | PASS | One promise wrapper, one `Set`, one small hook. |
| spec-first | error | PASS | No SKILL.md change. The spec grep printed 0 lines. |
| project-agnostic | error | PASS | Only test infrastructure under `tests/promptfoo/` changes. |
| flag-coherence-cross-skill | error | PASS | No skill flags involved. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates involved. |
| flag-resolution-single-source | warning | PASS | No contractual flags. |
| state-premise | error | PASS | Root problem in Architecture: `spawnSync` blocks the event loop, so promptfoo's worker pool runs one case at a time. |
| smallest-viable-cut | warning | PASS | Scope is the owner-approved item; KD5 explains why the transform change stays. |
| failure-audience | warning | PASS | Named in Context, "Who fails if this ships wrong?". |
| explicit-non-goals | warning | PASS | Listed in Context, "Non-goals". |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in KD1–KD6; unsettled design points are STOP with a QUESTION (Task 1). |
| state-machine-idempotency | error | PASS | No migration or preflight logic changes. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch. |
| flag-semantic-consistency-cross-skill | error | PASS | No new CLI flag. |
| workspace-mode-compatibility | error | PASS | Test infrastructure only; copies go to `os.tmpdir()`, no state files written via cwd. |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md, prepare script or dispatched prompt changes. |

## Suggested Review Dimensions

These are advisory (G17). They are not tasks of this plan: `.sdlc/review-dimensions/` is outside this item's Files list. The owner may adopt them separately.

### UPDATE: test-quality (B3, B1)

**Why:** Tasks 3–4 move the exec providers from blocking `spawnSync` to non-blocking `spawn` (cases run concurrently), and Task 6 adds an `extensions:` `afterAll` hook to both exec configs, but `test-quality` has no checklist items for concurrency safety, state shared across parallel cases, or fixture-copy cleanup.

**Severity hint:** critical

**Patch:** Add checklist items to `test-quality`: (1) exec cases must not share mutable state (fixed names in `os.tmpdir()`, `$HOME`, the checkout, `.sdlc/execution/`) when run at concurrency 8; (2) async spawn wrappers must keep `spawnSync`'s result record, end stdin, and keep the timeout and `maxBuffer` semantics; (3) fixture-copy registries and `afterAll` cleanup hooks must delete only `os.tmpdir()/promptfoo-fixture-*` paths and never throw.

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md`: append the three checklist items above (strengthen-only; keep all existing items).

### UPDATE: test-quality (U2)

**Why:** The plan modifies `tests/promptfoo/providers/script-runner.js` and `tests/promptfoo/providers/hook-runner.js`, but the `test-quality` triggers cover only `tests/promptfoo/scripts/*.js`.

**Severity hint:** medium

**Patch:** Add trigger `"tests/promptfoo/providers/*.js"` to `test-quality` `triggers[]`.

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md`: add `- "tests/promptfoo/providers/*.js"` to the frontmatter triggers list.

## Final Shape

When all tasks are done, the exec gates look like this:

- **The providers no longer block.** `script-runner.js` and `hook-runner.js` start each script with `spawn` and wait on a promise. promptfoo can now keep several scripts running at once (`-j 2` in the timed runs, by owner ruling w2-floor; the configs' `concurrency: 8` key stays untouched and ignored, follow-up #9145).

- **Every case sees the same result as before.** Exit codes, stdout, stderr, the temp-path auto-read and the `spawnSync node ETIMEDOUT` message all keep their old shape. No dataset, assertion or fixture changed.

- **Fixture copies are cleaned up.** Copies still go to `os.tmpdir()/promptfoo-fixture-*`, and `setup.sh` still runs inside the copy. At the end of each exec run, one `afterAll` hook removes them and prints `fixture-copies-cleanup: removed <n>`.

- **The behavioural config is untouched.** It shares the transform but never reaches the copy branch, and it has no hook.

- **The speed claim is measured, not promised.** The four timed runs after the commit decide it. Below the owner's 1.5× floor at `-j 2` (ruling w2-floor), the work stops and the timings go to the owner.

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

Review rounds: 3 (round 1: 5 lanes + 3 lenses; round 2: merged re-dispatch, 5 lanes + 3 lenses, after a material Task 5 contract change; round 3: 3 lenses). Round 3 statuses: architecture Approved, requirements Approved, risk Issues Found (warnings only, no execution blocker). The two round-3 risk warnings were fixed after round 3 and have not been re-reviewed: the Task 1 and Task 2 `git status --porcelain` criteria now allow the untracked plan file, and the `test-coverage-required` row now says "waiver".

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 1 | 0 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

Counts are round-3 lens findings with a severity tag (the round-1 CRITICAL, Task 3's self-contradicting grep, was fixed in round 2 and confirmed by round 3).

| # | Requirement | Covering task(s) | Status |
|---|---|---|---|
| 1 | Spec grep; STOP with QUESTION on a hit | Task 1 (+ Research Findings) | covered |
| 2 | Change 1: `afterAll` support (STOP), `transformVars` placement | Task 1 | covered |
| 3 | Change 2: shared-state audit (STOP with list) | Task 2 | covered |
| 4 | Change 3: `script-runner.js` async `spawn` | Task 3 | covered |
| 5 | Change 4: `hook-runner.js` same wrapper | Task 4 | covered |
| 6 | Change 5: async copy + setup, registry | Task 5 | covered |
| 7 | Change 6: `afterAll` cleanup hook in both exec configs | Task 6 | covered |
| 8 | Content anchors, Must-not-touch, targeted runs with the env recipe | Tasks 3–6 | covered |
| 9 | Verification (1)–(6) after the commit; 1.5× floor at `-j 2` is a STOP | Task 7 | covered |
| 10 | One ship commit, subject ≤ 72 characters | "How §0 applies", Task 7 | covered |
| 11 | Must-not-touch list | Tasks 3–6, Context "Non-goals" | covered |
| 12 | R-baseline; counts 846 / 53 | Research Findings, Task 7 | covered |
| 13 | §0 verbatim; open design questions are STOP with QUESTION | §0, Task 1 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
