# Hermetic Exec Suite Implementation Plan

**Commit:** `test(#9460): tests - hermetic exec suite`
**Goal:** Make the promptfoo exec suite hermetic (#9423, wave H1): no case reaches the real `gh`, the network or a real `git push`, no case depends on a tight wall-clock threshold, and no case runs in `tests/promptfoo` as its working directory.
**Architecture:** The two providers (`providers/script-runner.js`, `providers/hook-runner.js`) give every case without `script_cwd` its own temp working directory and set `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` by default; relative `script_home` and `script_stub_bin` keep resolving against `tests/promptfoo`, so the 161 existing relative paths need no edit. The `pr.js` cases get the stub `gh`, the three generic-404 link cases get a preloaded fetch stub instead of the live network, and the timing cases get wider, ratio-based or call-count thresholds. Plugin code does not change; this is test infrastructure only.
**Source:** conversation context (tracking id #9460; todo item #9423 [suite-A], audit W3, ledger F-120)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The exec suite (the promptfoo script tests that run real scripts with no LLM) is not hermetic. Hermetic means a test depends only on what the repository holds, not on the machine, the network or the user's accounts.
- 41 of the 47 `pr-prepare-exec.yaml` cases run with the real `gh` CLI on `PATH`. `pr.js` calls `ensureGhAccount`, which can run `gh auth switch` and so change the user's global `gh` account.
- Four `pr.js` cases build a fixture whose `origin` is `git@github.com:example-org/example-repo.git`. `pr.js` then runs a real `git push -u origin` over SSH.
- Three link-check cases fetch `https://example.com/...` from the live internet to get a 404.
- Two timing cases use tight wall-clock limits (`ms < 1500`, `elapsedMs < 15000`). Seven `gh` timeout cases leave a 500 ms margin between a call that must succeed and a call that must time out.
- 794 of 1,849 exec cases have no `script_cwd`. They run with `tests/promptfoo` as their working directory, so a script that writes relative to its working directory writes into the repository checkout.

**What prompted this change now?** The audit (W3) and ledger finding F-120 listed these leaks. The consolidated order puts them in wave H1, split from H2 (speed) because wave H had three Complex tasks.

**What does success look like?**

- Every `pr-prepare-exec.yaml` case has the stub `gh` first on `PATH`.
- No exec case can push over SSH or prompt for git credentials.
- The three generic-404 cases pass with the network unreachable.
- The timing cases keep their regression meaning with wide margins.
- A case without `script_cwd` runs in its own temp directory, which the provider removes afterwards.

**Who is hurt if this ships wrong?** Developers who run the lefthook pre-push hook or the exec suite by hand. A wrong provider change fails many unrelated cases at once and blocks every push; a missed stub can still switch the developer's global `gh` account or push to a real remote.

## Research Findings

The re-check ran at HEAD `df001c7`. Every sub-item still reproduces; none is done. Evidence (file:line at HEAD):

- **gh stub.** `tests/promptfoo/datasets/pr-prepare-exec.yaml` holds 47 cases; only 6 set `script_stub_bin` (lines 494-567). The stub `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh` answers `auth status`, `api user` and `api repos/* -i`; any other call prints `STUB-GH-INVOKED <args>` and exits 0 (F-pr-exec-gh-stub-and-push-block-1, -2). `SDLC_PROBE_REPO_ACCESS` (lines 327-390) replaces only the access probe; `ensureGhAccount` (`plugins/sdlc-utilities/scripts/lib/git.js:648-706`) still calls `gh auth status` and `gh auth switch` (F-pr-exec-gh-stub-and-push-block-7). `pr.js` also reaches `gh pr view` and `gh repo view` (`lib/git.js:326-328`). The `-e` cases at lines 179-212 and 588-620 spawn `pr.js` themselves with `env: {...process.env}`, so they inherit the provider's `PATH` (F-pr-exec-gh-stub-and-push-block-8).
- **Real push.** `fixtures-fs/project-pr-origin-stubbed/setup.sh:11` (3 cases) and `fixtures-fs/project-pr-expected-account-explicit/setup.sh:10` (1 case) add an SSH `origin` on github.com; `lib/git.js:1216` runs `git push -u origin <branch>` (F-pr-exec-gh-stub-and-push-block-4, -5). No provider or dataset sets `GIT_SSH_COMMAND`. A provider-level default covers every case in one place (F-pr-exec-gh-stub-and-push-block-6).
- **Offline.** `links-lib-exec.yaml:98` and `jira-sdlc-exec.yaml:430` fetch a live 404 URL. A third case, `pr-prepare-exec.yaml:165`, does the same (F-offline-404-cases-links-jira-1, -2, -9). `SDLC_LINKS_OFFLINE=1` cannot fix them: `links.js:433-435, 477` returns before any fetch, so `url-not-found` never appears (F-offline-404-cases-links-jira-3). `links.js` uses the global `fetch` and `dns.promises.lookup` with no injection seam (F-offline-404-cases-links-jira-4, -5). A `--require` preload passed in `NODE_OPTIONS` can replace both without a plugin change (F-offline-404-cases-links-jira-6, -8). A loopback test server is not an option: `links.js` blocks loopback and private hosts (F-offline-404-cases-links-jira-8).
- **Timing.** `github-sdlc-exec.yaml:668` asserts `ms < 1500` on one sample of `scripts/github-content-timing.js` (F-exec-timing-threshold-flakiness-1). `execute-plan-sdlc-liveness-exec.yaml:84` asserts `elapsedMs < 15000`, while the invariant it guards is "returns before the 60 s interval" (F-exec-timing-threshold-flakiness-2). The six `SDLC_GH_TIMEOUT_MS=500` cases (lines 1132, 2027, 2495, 2521, 2545, 2569) assert call counts, not wall time; the risk is a slow stub start above 500 ms on a call meant to succeed; the case at line 1132 also leaves `GH_STUB_SLEEP_MS` at the stub's 3000 ms default (F-exec-timing-threshold-flakiness-3, `fixtures-fs/stub-bin-gh-issues/bin/gh:29`). No other exec case asserts wall time (F-exec-timing-threshold-flakiness-4).
- **Temp cwd.** `providers/script-runner.js:92` uses `script_cwd || undefined`, so the case inherits `tests/promptfoo`. Relative `script_home` and `script_stub_bin` resolve against that cwd (`script-runner.js:100-104, 116-122`) (F-script-runner-per-case-temp-cwd-1, -4). `providers/hook-runner.js:74-84` repeats the same logic (F-script-runner-per-case-temp-cwd-7). A static scan of the 794 no-cwd cases found 161 relative `script_home`/`script_stub_bin` values (github-sdlc 147, mcp-failure-github 9, links-lib 5), all under `fixtures-fs/`. `-e` program cases read files through `{{repo_root}}` (absolute). The 24 helper scripts that default to `process.cwd()` are called with `--project-root` or `script_cwd` in practice (F-script-runner-per-case-temp-cwd-6). The no-cwd cases most likely to notice a non-repo cwd are those whose script runs `git` with no cwd, such as `error-report-prepare.js` (`safeExec('git remote get-url origin')`, 6 cases), and `headless-runner-exec.yaml` (15 cases) (F-script-runner-per-case-temp-cwd-10). `scripts/fixture-copies-cleanup.js` removes only `promptfoo-fixture-*` directories, so the provider must remove its own temp cwd (F-script-runner-per-case-temp-cwd-3). `scripts/run-script-runner-exit.js` loads the provider in-process and is the precedent for provider-level tests (F-script-runner-per-case-temp-cwd-8).
- **Docs.** `tests/promptfoo/README.md` documents the case vars (`script_cwd` row) and must state the new default (F-script-runner-per-case-temp-cwd-9). No spec, skill or site file describes the providers, so no spec task is needed.
- **Count and floor checks over the touched test files (F-104).** `scripts/check-spec-id-coverage.js` with `baselines/spec-id-coverage.json` fails only when a count drops below the baseline. `dataset-regex-exec.yaml:8` asserts `r.datasets >= 19 && r.checked >= 300` (floors). `fixture-guard-exec.yaml` holds a `refs` floor. `scripts/check-dataset-asserts.js` rejects a new case whose only assertions are negative, empty-regex or key-only `contains`. This plan only adds cases or rewrites assertions in place, so no floor drops and no count check needs a new value.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Offline sub-item | no | uses a `NODE_OPTIONS` fetch/DNS stub preload, not `SDLC_LINKS_OFFLINE=1` | the offline flag skips the fetch, so `url-not-found` could never be asserted (F-offline-404-cases-links-jira-3) |
| Third 404 case | no | adds `pr-prepare-exec.yaml:165` to the offline fix | it reaches the live network the same way; found during the re-check |
| Push block | no | sets `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` as provider defaults, not a `.invalid` remote | one edit covers every case; a `.invalid` host would break `parseRemoteOwner`, which the access-probe cases need |
| `SDLC_GH_TIMEOUT_MS` cases | no | widens them to timeout 1000 ms and stub sleep 2500 ms instead of removing them | they assert call counts, so they are already deterministic except for the start-up margin |
| Relative `script_home`/`script_stub_bin` | no | resolve against `tests/promptfoo` when `script_cwd` is unset, instead of rewriting 161 case paths | keeps every existing case valid; no case rewrites beyond hermeticity |
| Helper scripts using `process.cwd()` | no | not edited | each is called with `--project-root` or `script_cwd`; under the temp cwd a missed root writes into a throwaway directory, which is the goal |

## Decisions taken without the owner

No user was available. Each decision below took the recommended or most conservative option.

- **Fetch stub preload over the offline flag** for the three generic-404 cases. See Deviations.
- **Provider env defaults** (`GIT_SSH_COMMAND=false`, `GIT_TERMINAL_PROMPT=0`) are applied before the `script_env` merge, so a case can still override them.
- **Accepted gap:** an HTTPS remote with a stored credential could still push. No exec case pushes to an HTTPS remote today (F-pr-exec-gh-stub-and-push-block-5).
- **Ratio check for the content-scan timing case:** compares the full-size input with a quarter-size input, plus a 10 s ceiling, instead of one absolute threshold.
- **Liveness threshold 15000 → 45000 ms:** still well under the 60 s interval the case guards.
- **Fallout sweep (Task 3) bounded to five datasets.** These are the datasets the scan marked as most likely to depend on the old cwd. A failure in another dataset is found by the main session's full exec run.

## Key Decisions

- **One temp cwd per case, made by the provider.** The provider creates the directory (`os.tmpdir()/promptfoo-cwd-*`) only when `script_cwd` is unset. It removes it after the output is built. The alternative was a fixture per case, which would touch about 794 cases.

- **Relative paths keep their old base.** A relative `script_home` or `script_stub_bin` resolves against `script_cwd` when that is set, else against `tests/promptfoo` (the directory the suite was always run from). The alternative, a `{{repo_root}}` rewrite of 161 paths, changes many cases for no behaviour gain.

- **Git safety in the provider, not in fixtures.** `GIT_SSH_COMMAND=false` makes any SSH transport fail at once. `GIT_TERMINAL_PROMPT=0` stops git asking for a password. Fixtures with real-looking SSH remotes stay unchanged, so `parseRemoteOwner` still sees a GitHub owner.

- **The stub `gh` learns the `pr.js` calls.** It answers `pr view` with "no pull requests found" (exit 1), `repo view --json` with the fixture owner, and `auth switch` with success. Any other call still prints `STUB-GH-INVOKED <args>`, so `script-runner-stub-bin-exec.yaml` keeps its marker.

- **A preload, not a plugin seam, for fetch.** `tests/promptfoo/scripts/stub-fetch-404.js` replaces `globalThis.fetch` and `dns.promises.lookup` in the child. Plugin code stays unchanged (no test-only seam in shipped code).

- **Independent tasks first.** Tasks 1, 2 and 5 do not depend on each other. Tasks 3, 4 and 6 wait for Task 1 (Task 4 also for Task 5). Each shared file belongs to one task (F-43).

## Contract Examples

**code** (from Task 1):

```markdown
**Contract:**
- shape (code): `callApi(prompt, context)` keeps its signature; when `vars.script_cwd` is unset it
  runs the child in `fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cwd-'))` and removes it after
  the output is built; env defaults `GIT_SSH_COMMAND=false`, `GIT_TERMINAL_PROMPT=0` before the
  `script_env` merge.
- names: `PROMPTFOO_DIR`, `promptfoo-cwd-`.
- mirror: `providers/headless-case.js:196` (per-case mkdtemp).
- decisions: relative paths resolve against `script_cwd || PROMPTFOO_DIR` (Key Decisions).
- sync: `providers/hook-runner.js` (Task 2) uses the same rules.
```

**docs** (from Task 1):

```markdown
**Contract:**
- shape (docs): MODIFY `tests/promptfoo/README.md` `#### Case vars` table rows `script_cwd`,
  `script_home`, `script_stub_bin`; add one paragraph on the git env defaults.
- names: rows `script_cwd`, `script_home`, `script_stub_bin`.
- mirror: existing table at `tests/promptfoo/README.md:76-88`.
- decisions: audience is suite maintainers.
- sync: provider header comments in `providers/script-runner.js`.
```

## Tasks

### Task 1: script-runner per-case temp cwd and git safety defaults

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/script-runner.js` — temp cwd when `script_cwd` is unset, `PROMPTFOO_DIR` base for relative paths, git env defaults, header comment
- Modify: `tests/promptfoo/scripts/run-script-runner-exit.js` — add a `--cwd-probe` mode that reports the child cwd, the git env and whether the cwd still exists after `callApi` returns
- Modify: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — add 4 cases (11 → 15 cases)
- Modify: `tests/promptfoo/README.md` — `#### Case vars` rows and a git-defaults paragraph

**Notes:** Findings: F-script-runner-per-case-temp-cwd-1, -3, -4, -8, F-pr-exec-gh-stub-and-push-block-6. Removing the temp cwd must happen after the stdout temp-file read, because `TMP_PATH_RE` also matches `.sdlc/execution/out/*.json`, which a script may write under its cwd. Cases that set `script_cwd` see no change at all.

**Acceptance criteria:**
- [ ] A case with no `script_cwd` runs with `process.cwd()` under `os.tmpdir()` in a directory named `promptfoo-cwd-*`, never `tests/promptfoo`.
- [ ] The temp cwd no longer exists after `callApi` returns, on success, on non-zero exit, on a spawn error and on the provider's own error returns.
- [ ] A case with `script_cwd` runs there, and its relative `script_home`/`script_stub_bin` still resolve against it.
- [ ] With no `script_cwd`, `script_stub_bin: "fixtures-fs/stub-bin-gh/bin"` resolves to `tests/promptfoo/fixtures-fs/stub-bin-gh/bin`.
- [ ] The child env has `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` unless `script_env` sets them.
- [ ] Targeted runs pass: `--filter-pattern "script_stub_bin|script-runner|claude-cli-provider"`, then `--filter-pattern "^github-sdlc"`, `--filter-pattern "^mcp-failure"` and `--filter-pattern "^links:"`.

**Contract:**
- shape (code): `callApi(prompt, context)` signature unchanged. New module constant `const PROMPTFOO_DIR = path.resolve(__dirname, '..');` and `const os = require('os');`. The `script_path` check stays before the temp dir is made. When `vars.script_cwd` is falsy: `tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cwd-'))`; the child runs there; `fs.rmSync(tmpCwd, { recursive: true, force: true })` runs in a `finally` after the output string is built, so every return path removes it.
- names: `PROMPTFOO_DIR`, prefix `promptfoo-cwd-`, env keys `GIT_SSH_COMMAND`, `GIT_TERMINAL_PROMPT`; harness flag `--cwd-probe`.
- mirror: `tests/promptfoo/providers/headless-case.js:196` (per-case mkdtemp); `tests/promptfoo/scripts/run-script-runner-exit.js:20-31` (in-process provider harness).
- decisions: defaults are set before the `script_env` merge so a case can override them (Decisions taken without the owner). `--cwd-probe` is a mode of an existing test harness, not a new command-line script; an unknown flag keeps today's behaviour.
- sync: `tests/promptfoo/providers/hook-runner.js` (Task 2) applies the same three rules.
- example: harness `--cwd-probe` runs the provider twice (once plain, once with `script_env: {"GIT_SSH_COMMAND": "ssh -o BatchMode=yes"}`) and prints one JSON line `{"cwd":"/tmp/promptfoo-cwd-AbC123","inTmp":true,"existsAfter":false,"ssh":"false","prompt":"0","override":"ssh -o BatchMode=yes"}`.

Change at the cwd and path resolution (`script-runner.js`, `callApi`):

```diff
     const scriptArgs = (vars.script_args ?? '').split(/\s+/).filter(Boolean);
-    const cwd = vars.script_cwd || undefined;
 
     if (!scriptPath) {
       return { error: 'script-runner: script_path var is required' };
     }
+    const tmpCwd = vars.script_cwd ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cwd-'));
+    const cwd = vars.script_cwd || tmpCwd;
+    const base = vars.script_cwd || PROMPTFOO_DIR;
+    try {
 
-    const env = Object.assign({}, process.env);
+    const env = Object.assign({}, process.env, { GIT_SSH_COMMAND: 'false', GIT_TERMINAL_PROMPT: '0' });
     if (vars.script_home) {
       const home = path.isAbsolute(vars.script_home)
         ? vars.script_home
-        : path.resolve(cwd || process.cwd(), vars.script_home);
+        : path.resolve(base, vars.script_home);
 …
       const stubBin = path.isAbsolute(vars.script_stub_bin)
         ? vars.script_stub_bin
-        : path.resolve(cwd || process.cwd(), vars.script_stub_bin);
+        : path.resolve(base, vars.script_stub_bin);
 …
     return { output, metadata: { exitCode } };
+    } finally {
+      if (tmpCwd) fs.rmSync(tmpCwd, { recursive: true, force: true });
+    }
```

Env delta (child process):

| Op | Key | Type | Value | Notes |
|---|---|---|---|---|
| add | `GIT_SSH_COMMAND` | string | `"false"` | any SSH fetch or push fails at once; `script_env` may override |
| add | `GIT_TERMINAL_PROMPT` | string | `"0"` | git never waits for a password |

New cases in `script-runner-stub-bin-exec.yaml`:

| Description | Vars | Assertion |
|---|---|---|
| `script-runner: a case without script_cwd runs in its own temp dir that is removed afterwards` | `script_path: "repo://tests/promptfoo/scripts/run-script-runner-exit.js"`, `script_args: "--cwd-probe"` | javascript: `inTmp === true && existsAfter === false` and the `cwd` basename starts with `promptfoo-cwd-` |
| `script-runner: git ssh and prompt are off by default` | same | javascript: `ssh === 'false' && prompt === '0'` |
| `script-runner: script_env overrides the git defaults` | same | javascript: `override === 'ssh -o BatchMode=yes'` |
| `script_stub_bin: a relative path without script_cwd resolves against tests/promptfoo` | `script_path: "-e"`, `script_args: 'console.log(require("child_process").execSync("gh --version").toString())'`, `script_stub_bin: "fixtures-fs/stub-bin-gh/bin"` | `contains` `STUB-GH-INVOKED --version` |

README `#### Case vars` rows after the change:

| Var | Meaning |
|---|---|
| `script_cwd` | working directory of the script; when unset, the provider makes a fresh `promptfoo-cwd-*` temp directory for the case and removes it afterwards |
| `script_home` | `HOME` for the script; a relative path resolves against `script_cwd`, or against `tests/promptfoo` when `script_cwd` is unset |
| `script_stub_bin` | directory of stub binaries put first on `PATH`; relative paths resolve as for `script_home` |

Plus one paragraph after the table: both providers set `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` unless `script_env` sets them, so no case can push over SSH or wait for a git password.

### Task 2: hook-runner per-case temp cwd and git safety defaults

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/hook-runner.js` — the same temp cwd, relative-path base and git env defaults as Task 1; header comment
- Modify: `tests/promptfoo/datasets/ship-hooks-exec.yaml` — add 1 case (50 → 51 cases)

**Notes:** Findings: F-script-runner-per-case-temp-cwd-7. The 109 `worker-write-guard-exec.yaml` cases run through this provider with no `script_cwd`. The guard reads its paths from the JSON payload, so the temp cwd should not change them; the targeted run below confirms it.

**Acceptance criteria:**
- [ ] A hook case with no `script_cwd` runs in a `promptfoo-cwd-*` temp directory that is removed after `callApi` returns.
- [ ] The child env has `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` unless `script_env` sets them; a relative `script_home` resolves against `script_cwd || tests/promptfoo`.
- [ ] Targeted runs pass with `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern <pattern>` for `"hook-runner:"`, `"worker-write-guard"` and `"hookEnforcementAllowed"`.

**Contract:**
- shape (code): `HookRunnerProvider.callApi` signature and its JSON output `{stdout, stderr, exitCode}` unchanged; add `const os = require('os'); const fs = require('fs'); const PROMPTFOO_DIR = path.resolve(__dirname, '..');`; the cwd, base, env and `finally` changes are the ones rendered in Task 1.
- names: `PROMPTFOO_DIR`, prefix `promptfoo-cwd-`, `GIT_SSH_COMMAND`, `GIT_TERMINAL_PROMPT`.
- mirror: Task 1 diff; `tests/promptfoo/providers/hook-runner.js:69-96` (current `callApi`).
- decisions: hook-runner keeps no `script_stub_bin` support (its header states why).
- sync: the Task 1 README paragraph covers both providers.
- example: new case `hook-runner: a case without script_cwd runs in a removed temp dir with git defaults`, `script_path: "-e"`, `script_args: 'console.log(JSON.stringify({cwd:process.cwd(),ssh:process.env.GIT_SSH_COMMAND,prompt:process.env.GIT_TERMINAL_PROMPT}))'`; javascript assertion: `const o = JSON.parse(JSON.parse(output).stdout); return require('path').basename(o.cwd).startsWith('promptfoo-cwd-') && !require('fs').existsSync(o.cwd) && o.ssh === 'false' && o.prompt === '0';`.

### Task 3: fallout sweep for cases that relied on the tests/promptfoo cwd

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/error-report-prepare-exec.yaml` — only if a targeted run fails: give the failing case a fixture and `script_cwd: "{{project_root}}"`
- Modify: `tests/promptfoo/datasets/headless-runner-exec.yaml` — same rule
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — same rule
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — same rule
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — same rule
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — the case "wave-split-cmd: wave-split subcommand returns 2+2 halves" gets `--state-file {{project_root}}/state-missing-t3-t4.json` in script_args (added in ship, architect-accepted 2026-11-19: it failed under the temp cwd)

**Notes:** Findings: F-script-runner-per-case-temp-cwd-6, -10. These five datasets hold the no-cwd cases whose scripts run `git` or read files with no explicit root (Research Findings, Temp cwd). A case that needs a git repository gets an existing fixture, never the repository checkout, so it stays hermetic.

**Acceptance criteria:**
- [ ] Targeted runs pass for each dataset: `--filter-pattern "^error-report-prepare"`, `"^headless-runner"`, `"^execute-prepare"`, `"^commit-"` and `"^plan-"`.
- [ ] Every edited case keeps its assertions, or the task report names each changed assertion and the reason (for example a value that was read from the checkout's own `origin`).
- [ ] No case gets a `script_cwd` that points at the repository checkout or at `tests/promptfoo`.

**Contract:**
- shape (code): dataset-only edits; per failing case add `project_root: "file://fixtures-fs/<existing fixture>"` and `script_cwd: "{{project_root}}"`; no new fixtures, no case removals or merges.
- names: vars `project_root`, `script_cwd`.
- mirror: `tests/promptfoo/datasets/error-report-prepare-exec.yaml:32-38` (a case that already uses a fixture with `SDLC_STATE_DIR_OVERRIDE`).
- decisions: a failure in a dataset outside this list is reported in the task result, not fixed here (Decisions taken without the owner).
- sync: none.

### Task 4: stub gh for every pr.js case

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1, Task 5
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — add `script_stub_bin` to the 41 cases that lack it; add the fetch-stub preload to the generic-404 case
- Modify: `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh` — answer `pr view`, `repo view`, `auth switch` and `auth status --active`; header comment

**Notes:** Findings: F-pr-exec-gh-stub-and-push-block-1, -2, -7, -8, F-offline-404-cases-links-jira-9. `ensureGhAccount` can run `gh auth switch`, which changes the user's global `gh` state, so no `pr.js` case may reach the real `gh`. Task 1 already blocks the SSH push, so the four SSH-origin cases need no remote change. `ship-prepare-exec.yaml` and `script-runner-stub-bin-exec.yaml` share this stub; the targeted runs below cover them.

**Acceptance criteria:**
- [ ] Every case in `pr-prepare-exec.yaml` sets `script_stub_bin` (47 of 47 at HEAD), including the `-e` cases that spawn `pr.js` themselves, so their children inherit the stubbed `PATH`.
- [ ] The generic-404 case passes through the preload from Task 5, with `SDLC_LINKS_OFFLINE` unset.
- [ ] The case "fetchBaseRef non-fatal when origin unreachable" keeps both of its assertions.
- [ ] Targeted runs pass: `--filter-pattern "pr-prepare|pr.js"`, `--filter-pattern "^ship-prepare"` and `--filter-pattern "script_stub_bin"`.

**Contract:**
- shape (code): per case add `script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin"` when the case has a `project_root`; else `script_stub_bin: "fixtures-fs/stub-bin-gh/bin"` (resolved by Task 1 against `tests/promptfoo`). The generic-404 case adds `script_env: '{"NODE_OPTIONS": "--require {{repo_root}}/tests/promptfoo/scripts/stub-fetch-404.js"}'`.
- names: var `script_stub_bin`; stub answers below.
- mirror: `tests/promptfoo/datasets/pr-prepare-exec.yaml:490-500` (an existing stubbed case); `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh:9-31` (case dispatch).
- decisions: the stub keeps its catch-all `STUB-GH-INVOKED <args>` line, so `script-runner-stub-bin-exec.yaml` AC1 still holds.
- sync: `ship-prepare-exec.yaml` uses the same stub and must keep passing.

Stub `gh` answers (added before the catch-all):

| Call | stdout | stderr | exit |
|---|---|---|---|
| `gh pr view …` | empty | `no pull requests found for branch` | 1 |
| `gh repo view --json …` | `{"owner":{"login":"example-org"},"name":"example-repo"}` | empty | 0 |
| `gh auth switch …` | empty | `Switched active account (stub)` | 0 |
| `gh auth status --active` | same text as `gh auth status` | empty | 0 |
| any other call | `STUB-GH-INVOKED <args>` | empty | 0 |

### Task 5: offline fetch stub for the generic-404 link cases

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/stub-fetch-404.js` — preload that replaces `globalThis.fetch` and `dns.promises.lookup`
- Modify: `tests/promptfoo/datasets/links-lib-exec.yaml` — the generic-404 case loads the preload
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — the generic-404 case loads the preload

**Notes:** Findings: F-offline-404-cases-links-jira-1, -2, -3, -8. Threat model: the preload stops the three generic-404 cases from reaching the network. Accepted gaps: a script that uses the `http`/`https` modules directly, or spawns a non-node child, is not covered; `links.js` uses only `fetch` and `dns.promises.lookup` (F-offline-404-cases-links-jira-4, -5). The stub resolves to a public address because `links.js` rejects loopback and private hosts.

**Acceptance criteria:**
- [ ] With the preload, `links.js` and `jira.js --validate-body` report `url-not-found` for the fixture URL, with no network access and `SDLC_LINKS_OFFLINE` unset.
- [ ] The preload writes nothing to stdout, so JSON output stays parseable.
- [ ] Targeted runs pass: `--filter-pattern "^links:"` and `--filter-pattern "jira.js --validate-body"`.

**Contract:**
- shape (code): CommonJS module with no exports, loaded by `node --require`. Sets `globalThis.fetch = async () => new Response('', { status: 404, statusText: 'Not Found' })`; replaces `require('dns').promises.lookup` with `async (host, opts) => (opts && opts.all) ? [{ address: '93.184.215.14', family: 4 }] : { address: '93.184.215.14', family: 4 }`. It parses no arguments, so it has no usage-error path (F-151 does not apply: it is not a command-line script).
- names: file `tests/promptfoo/scripts/stub-fetch-404.js`; env `NODE_OPTIONS`.
- mirror: `tests/promptfoo/scripts/github-content-timing.js:1-3` (header comment style).
- decisions: preload over the offline flag (Deviations). If `{{repo_root}}` is not rendered inside `script_env` (it is rendered in `script_stub_bin` today, `pr-prepare-exec.yaml:494`), the worker reports it and stops; it does not switch to a relative path.
- sync: Task 4 uses the same preload line for the `pr.js` generic-404 case.

Case change (the generic-404 case in each dataset):

```diff
 - description: "links: generic 404 URL violates with url-not-found"
   vars:
     script_path: "repo://plugins/sdlc-utilities/scripts/lib/links.js"
     script_args: "--file {{project_root}}/url-not-found.txt --json"
     project_root: "file://fixtures-fs/links-lib"
+    script_env: '{"NODE_OPTIONS": "--require {{repo_root}}/tests/promptfoo/scripts/stub-fetch-404.js"}'
```

```diff
 - description: "jira.js --validate-body: generic 404 URL aborts with url-not-found"
   vars:
     script_path: "repo://plugins/sdlc-utilities/scripts/skill/jira.js"
     script_args: "--validate-body --project PROJ --file {{project_root}}/body-generic-404.txt --json"
     script_cwd: "{{project_root}}"
     script_home: "{{project_root}}"
     project_root: "file://fixtures-fs/jira-validate-body"
+    script_env: '{"NODE_OPTIONS": "--require {{repo_root}}/tests/promptfoo/scripts/stub-fetch-404.js"}'
```

### Task 6: wide timing thresholds

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/github-content-timing.js` — time a full-size and a quarter-size input, best of 3 each
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — ratio assertion at the content-scan case; timeout 1000 ms and stub sleep 2500 ms on the 6 timeout cases
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — `elapsedMs < 45000`

**Notes:** Findings: F-exec-timing-threshold-flakiness-1, -2, -3. A quadratic scan grows about 16 times when the input grows 4 times; a linear one about 4 times. A ratio limit of 8 keeps the regression check, and the 25 ms floor stops tiny timings from flaking. The timeout cases assert call counts, so only the margins change.

**Acceptance criteria:**
- [ ] `github-content-timing.js` prints one JSON line `{ms, msSmall, logins}`, where `ms` and `msSmall` are the best of 3 runs.
- [ ] The content-scan case asserts `o.json.ms <= 8 * Math.max(o.json.msSmall, 25) && o.json.ms < 10000` and keeps the `logins` checks.
- [ ] All 6 cases with `SDLC_GH_TIMEOUT_MS` use `"SDLC_GH_TIMEOUT_MS": "1000"` and `"GH_STUB_SLEEP_MS": "2500"` (the case near line 1132 gains the sleep key).
- [ ] Targeted runs pass: `--filter-pattern "github-sdlc/"` and `--filter-pattern "liveness/wave-progress"`.

**Contract:**
- shape (code): `github-content-timing.js` takes no arguments (unchanged); `text(n) = 'x' + '`'.repeat(n) + ' @bob\n' + '```\n'.repeat(n / 2) + '@carol'`; `best = (n) => Math.min(...[0, 1, 2].map(() => time(n)))`; prints `{ ms: best(30000), msSmall: best(7500), logins }` with `logins` from the full-size run.
- names: output fields `ms`, `msSmall`, `logins`; env keys `SDLC_GH_TIMEOUT_MS`, `GH_STUB_SLEEP_MS`.
- mirror: `tests/promptfoo/scripts/github-content-timing.js:1-10`.
- decisions: ratio plus ceiling over one absolute limit (Decisions taken without the owner).
- sync: none.

Assertion changes:

```diff
         const o = JSON.parse(output);
-        const ok = o.exit === 0 && o.json.ms < 1500 && o.json.logins.includes('bob') && o.json.logins.includes('carol');
+        const ok = o.exit === 0 && o.json.ms <= 8 * Math.max(o.json.msSmall, 25) && o.json.ms < 10000
+          && o.json.logins.includes('bob') && o.json.logins.includes('carol');
```

```diff
         const r = JSON.parse(output);
-        return r.result.timedOut === false && r.result.inFlight.length === 0 && r.elapsedMs < 15000
+        return r.result.timedOut === false && r.result.inFlight.length === 0 && r.elapsedMs < 45000
```

| Op | Key | Type | Value | Notes |
|---|---|---|---|---|
| replace | `SDLC_GH_TIMEOUT_MS` | string | `"1000"` | was `"500"`, 6 cases |
| replace | `GH_STUB_SLEEP_MS` | string | `"2500"` | was `"1500"` (5 cases) or unset (stub default 3000, 1 case) |

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code task (provider, harness, stub gh, preload, timing script) adds or updates promptfoo cases or is covered by existing cases it re-runs. |
| no-ci-bypass | error | PASS | No step skips or disables a CI check. The count and floor checks are reviewed and kept. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only configs, with no run-fix-rerun loop. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to a stated H1 sub-item; the third 404 case and the fallout sweep are justified in the plan. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (provider cwd/git defaults, hook provider, fallout sweep, stub gh, fetch stub, timing thresholds). |
| scripts-over-llm-logic | error | PASS | No skill instructions change; the logic lives in deterministic provider and test scripts. |
| yagni | warning | PASS | Only the changes needed for hermeticity; speed work is deferred to H2. |
| cross-skill-consistency | error | PASS | The shared stub gh is re-verified against ship-prepare and script-runner-stub-bin cases, and both providers get the same rules. |
| pr-link-github-issue | error | PASS | #9460 and #9423 are internal tracking ids, so the rule does not apply. |
| dry | warning | PASS | hook-runner repeats the provider rules, but it mirrors the existing duplicated provider structure and the plan names it as a sync point. |
| kiss | warning | PASS | Simple provider defaults and a small preload; the ratio check is a modest, justified complexity. |
| spec-first | error | PASS | No SKILL.md or skill behaviour change; the plan states that no spec covers the providers. |
| project-agnostic | error | PASS | Test infrastructure only; no plugin code and no repo-local config edits that should ship to consumers. |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill flag dispatch is touched. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites are touched. |
| flag-resolution-single-source | warning | PASS | Env defaults are set at one point in each provider, before the script_env merge. |
| state-premise | error | PASS | The Goal and Context section state the problem: the exec suite is not hermetic. |
| smallest-viable-cut | warning | PASS | The plan is scoped to wave H1, and Decisions and Deviations justify the extra pieces. |
| failure-audience | warning | PASS | Context names who is hurt if this ships wrong (developers running the pre-push hook or the exec suite). |
| explicit-non-goals | warning | PASS | Non-goals appear in Deviations (helper scripts not edited, no path rewrite), the accepted HTTPS-push gap, and speed work deferred to H2. |
| ambiguity-stops-and-asks | error | PASS | The viable alternatives (offline flag vs preload, .invalid remote vs env defaults, path rewrite vs base resolution) are recorded in Key Decisions and Deviations with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | No flag is added to a skill prepare script; --cwd-probe lives in a test harness. |
| workspace-mode-compatibility | error | PASS | Test-only change; no state files or config readers are touched, and the temp cwd is independent of the ship.workspace mode. |
| prompt-cache-hit-ratio | warning | PASS | No skill or dispatched prompt is touched. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 adds env defaults 'GIT_SSH_COMMAND=false' and 'GIT_TERMINAL_PROMPT=0' to the child process and changes the `script_cwd` default in `tests/promptfoo/scripts/run-script-runner-exit.js` and `script-runner.js`.

**Severity hint:** high

**Patch:** Check that the changed provider contract is handled: the default for `script_cwd`, the base for relative paths, and the new `GIT_SSH_COMMAND` and `GIT_TERMINAL_PROMPT` child env defaults that `script_env` can override.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the changed provider contract is handled: the default for `script_cwd`, the base for relative paths, and the new `GIT_SSH_COMMAND` and `GIT_TERMINAL_PROMPT` child env defaults that `script_env` can override.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Task 4 changes `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh` to answer `gh auth switch` because 'ensureGhAccount can run gh auth switch, which changes the user's global gh state'.

**Severity hint:** high

**Patch:** Check that the stub `gh` handles `auth switch` and `auth status --active` without touching the real gh account state, and that no real credentials are reachable.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Check that the stub `gh` handles `auth switch` and `auth status --active` without touching the real gh account state, and that no real credentials are reachable.

### UPDATE: code-quality (U1)

**Why:** Tasks 1 and 3 edit many `tests/promptfoo/datasets/*-exec.yaml` files (for example `pr-prepare-exec.yaml` in Task 4), which the dimension's current triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

_1 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 3 | 0 |
| Correctness | 0 | 0 | 3 | 1 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Stub gh in every pr.js case of pr-prepare-exec.yaml (41 of 47 lack script_stub_bin) | Task 4 | covered |
| 2 Block the real git push in exec cases (GIT_SSH_COMMAND=false or .invalid remote) | Task 1, Task 2 | covered |
| 3 Make the generic-404 link cases offline/hermetic (links-lib, jira-sdlc, pr-prepare) | Task 5, Task 4 | covered |
| 4 Remove flaky timing thresholds (github-sdlc ms<1500, liveness elapsedMs<15000, SDLC_GH_TIMEOUT_MS=500 cases) | Task 6 | covered |
| 5 Per-case temp cwd for exec cases without script_cwd, keeping relative script_home/script_stub_bin valid | Task 1, Task 2, Task 3 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

After this wave the exec suite depends only on the repository and the local machine.

- Every case runs in a working directory it owns. Either the case names one (`script_cwd`), or the provider makes a temp one and deletes it afterwards. Nothing is written into `tests/promptfoo` by accident.

- No case can push over SSH or wait for a git password. Both providers turn those off unless a case asks otherwise.

- No `pr.js` case reaches the real `gh`, so the user's `gh` account never switches during a test run.

- The three link-check cases that expect a 404 get it from a stub, not from the internet.

- Timing cases still catch a slow (quadratic) scan or a stuck wait, with margins wide enough for a busy machine.

Speed work (memoised fixtures, the in-process `gh` stub, the concurrency setting) stays for wave H2.

## OpenSpec Appendix

Not applicable — no OpenSpec change
