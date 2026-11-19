# W-H2 Suite Speed Infrastructure, Pre-push Tier and Round Findings Implementation Plan

**Commit:** `feat(W-H2): tests, review - suite speed, pre-push tier, round findings`
**Goal:**
- Make the exec test suite faster: build each git fixture once per run, answer the github `gh` calls in the same process, run the C16 apply loop without one process per payload, and drop the fixture copies that no case uses.
- Make parallel runs (`-j N`) safe, and keep one thread (`-j 1`) as the default in the configs, the docs, the Taskfile and the pre-push hook.
- Keep the finding text of every review round on disk after a ship run, also for rounds below the received-review threshold.
- Give the pre-push hook a fast exec tier instead of both full exec configs; the full configs still run on demand.
**Architecture:** The root problem is that the exec suite repeats expensive setup work for every case and is not safe to run in parallel, and that a review round below the threshold keeps only counts. The suite fix lives in the test infrastructure: `tests/promptfoo/scripts/extract-skill-content.js` (fixture build memo), `providers/script-runner.js` (per-case HOME copy), the github stub (`fixtures-fs/stub-bin-gh-issues/`, a shared core module used by the binary and by an in-process preload) and `scripts/run-github-case.js` (a callable `runCase`). The review fix adds a `findings` array to `review-summary.json` (`review-consolidate.js`, review-sdlc P11), a `findings` field to each ship round record (ship-sdlc R106) and one new per-run file `review-rounds-<slug>.json` (new id R108). The fast tier is one new config `promptfooconfig-exec-fast.yaml` that lists a subset of the exec datasets; `lefthook.yml` runs it.
**Source:** docs/plans/programme.md#W-H2
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

The exec suite has about 1,850 cases. About 1,430 of them copy a fixture directory and run its `setup.sh` (a shell script that makes a git repository) for every case, even when 4 cases out of 5 use the same fixture. The github cases start a new node process for every `gh` call (the stub `gh` is a node script). The C16 apply cases start one runner process per payload. 85 cases declare a fixture (`project_root`) that they never use, so the copy and the setup are wasted.

Parallel runs are not safe today. About 180 github, jira and links cases point `HOME` straight into the repository's fixture folders, so two cases that write to `HOME` at the same time write to the same folder.

A ship run with more than one review round writes the review summary to the same file each round. The summary holds only counts. A round below the received-review threshold never runs received-review, so its finding text is lost (the lean ledger records "counts-only" for it).

The pre-push hook runs both full exec configs, which takes many minutes.

**What prompted this change now?**

Unit W-H2 of the plan register schedules tickets TK-001 (#9425), TK-002 (#9462) and TK-003 (#9427, the pre-push part). The owner decided on 2026-11-19 that the fast pre-push tier ships in wave H and that the default exec concurrency drops from 2 to 1.

**What does success look like?**

- TK-001 A1: each memoisable fixture is built once per run, and the github runner cases answer `gh` in process.
- TK-001 A2: `-j 4` is safe (per-case temp cwd, per-case HOME copy, no shared writes); `maxConcurrency`, the docs, the Taskfile and the pre-push hook keep `-j 1`. The owner runs the `-j 4` trial; this wave does not.
- TK-002 A1: after a ship run, `.sdlc/execution/review-rounds-<slug>.json` holds every round's findings (severity, path, line, title), also for rounds below the threshold.
- TK-002 A2: the lean ledger can read finding text from that file. The ledger itself lives in another repository (`/workspace/orchestrate-lean-sdlc`); its change is not in this plan.
- TK-003 A1/A2: `lefthook.yml` runs only `promptfooconfig-exec-fast.yaml`; `task test:exec` still runs both full configs.

**Who fails if this ships wrong?** Contributors and agents: a wrong memo or HOME copy makes exec cases fail or, worse, pass on stale state; a wrong pre-push tier lets broken code be pushed. Ship users: a wrong summary change can break the review gate (R6), which reads the same file.

## Research Findings

Re-verified against HEAD `84f1c3d` (discovery brief findings cited by id).

- **No memo.** `tests/promptfoo/scripts/extract-skill-content.js:50-65` copies the fixture with `fs.promises.cp` and runs `bash setup.sh` for every case (F-exec-suite-fixture-memoisation-and-parallel-safety-1). The registry `globalThis.__sdlcFixtureCopies` is only read by the `afterAll` cleanup in `scripts/fixture-copies-cleanup.js:9-19`, which deletes entries named `promptfoo-fixture-*` directly under `os.tmpdir()` (F-exec-suite-fixture-memoisation-and-parallel-safety-7). 170 fixtures have a `setup.sh`; 1,430 cases use 306 fixtures; the most used are `project-ship-stepper` (187 cases), `project-sdlc-gitignore-inner` (101), `project-execute-prepare` (45), `execute-overflow` (39).
- **Path-dependent fixtures.** 17 `setup.sh` files write their own absolute path (`$PWD`, `pwd`, `git worktree add`), for example `fixtures-fs/project-ship-stepper/setup.sh:43,57` (`"planFile": "$PWD/plan.md"`, `"worktree": "$PWD"`) and then `git add -A` (`:223`). A copy of such a build points at the wrong directory, so these fixtures must keep the per-case build.
- **Wasted project_root.** A block scan (the case declares `project_root: "file://fixtures-fs/..."` and no other line of the case, vars or asserts, names `project_root` or `repo_root`) finds 85 cases in 16 datasets (F-exec-suite-fixture-memoisation-and-parallel-safety-2): `execute-plan-sdlc-overflow` 23, `git-lib` 17, `branch-name` 7, `version-retag` 7, `branch-guard` 6, `migrate-jira-templates` 6, `plan-prepare` 5, `setup-script-versions` 3, `dimension-to-instructions` 2, `setup-migrate-dispatch` 2, `execute-plan-sdlc-dispatch-resilience` 2, and 1 each in `config-resolve-sdlc-root`, `execute-prepare`, `lib-worktree`, `markdown-to-adf`, `plan-format`. A transform-level skip is not safe: assertions read `context.vars.project_root` (for example `datasets/plan-prepare-exec.yaml:1152,1225`, `datasets/review-consolidate-exec.yaml:111`), and the transform cannot see assertions.
- **Concurrency.** Both exec configs set `evaluateOptions.maxConcurrency: 2` at line 4 (F-exec-suite-fixture-memoisation-and-parallel-safety-3, F-prepush-fast-exec-tier-and-jobs-default-3). `Taskfile.yml:24-30` (`test:exec`) and `lefthook.yml:5-13` pass no `-j`. `tests/promptfoo/README.md:73` says to use `-j 1` "because cases share fixture copies and temp directories". CI (`.github/workflows/`, 4 files) runs no exec suite, so "CI keeps -j 1" needs no change (F-prepush-fast-exec-tier-and-jobs-default-7; owner decision 2026-11-19 (9): "CI for exec suites: not chosen").
- **Per-case cwd is already safe.** `providers/script-runner.js:103-107` makes a `promptfoo-cwd-*` temp dir per case (F-exec-suite-fixture-memoisation-and-parallel-safety-4). The shared-write risk is `script_home`: 120 cases use `fixtures-fs/github-sdlc-home`, 40 use `fixtures-fs/stub-bin-gh-issues`, 1 uses `fixtures-fs/github-sdlc-home-decoy`; `script-runner.js:82` resolves them into the repository (F-exec-suite-fixture-memoisation-and-parallel-safety-5). `run-github-case.js` copies an in-repo HOME itself, but the direct cases do not. No hook dataset sets `script_home`, so `providers/hook-runner.js` needs no change.
- **gh stub.** `fixtures-fs/stub-bin-gh-issues/bin/gh` is a 231-line node script, one process per call, driven by `GH_STUB_*` environment variables (F-gh-stub-and-c16-loop-inprocess-1). The seam in plugin code is `execGh` in `plugins/sdlc-utilities/scripts/lib/git.js:71` (`spawnSync('gh', args, …)`), used by `skill/github.js` for every gh call (F-gh-stub-and-c16-loop-inprocess-2). `run-github-case.js` runs 127 github cases, each in its own temp workspace and HOME (F-gh-stub-and-c16-loop-inprocess-4). Its C17 dataset check requires `script_stub_bin` on github cases (F-gh-stub-and-c16-loop-inprocess-7), so the stub directory stays on PATH.
- **C16 loop.** The two C16 cases (`datasets/github-sdlc-exec.yaml:2348,2369`) run 8 and 9 payloads through the `APPLY_HARNESS` anchor (`:2059-2092`), which starts `run-github-case.js` once per payload with `cp.spawnSync` (F-gh-stub-and-c16-loop-inprocess-5, -6). Every apply case uses the same anchor.
- **Review summary.** `review-consolidate.js` `buildSummary` (`:419-440`) writes `{schemaVersion, verdict, counts, dimensions, commentPath, commentCopyPath, branch}`; the deduped `results[].findings` (`:169-174`) already hold `severity`, `file`, `line`, `title` (F-review-round-findings-persistence-1, -8). The summary path is per branch, so each round overwrites the last (F-review-round-findings-persistence-2). `ship.js` `reviewGateFromSummary` (`:1839-1858`) reads only verdict and counts; `reviewRoundRecord` (`:1926-1940`, R106) stores counts only (F-review-round-findings-persistence-3, -4). The Step 6 summary sidecar is written at `ship.js:3021` and deleted after cleanup (`:2552-2556`), so the summary is not on disk after the run.
- **Lean ledger.** `/workspace/orchestrate-lean-sdlc/skill/scripts/ledger.js` marks below-threshold rounds `lost: "counts-only"` (F-review-round-findings-persistence-6). It is outside this repository.
- **Pre-push.** `lefthook.yml` is the only pre-push wiring (F-prepush-fast-exec-tier-and-jobs-default-1, -8). No fast tier or owner list of its content exists (F-prepush-fast-exec-tier-and-jobs-default-9).
- **Suite guards that count.** `datasets/spec-id-coverage-exec.yaml` (b) holds floors (2 configs, at least 77 datasets, 1817 cases, 2645 assertions) and a per-dataset baseline where growth never fails. `datasets/fixture-guard-exec.yaml` (a) needs `scanned >= 150` git-init fixtures; (fixture-refs a) needs `configs === 2` (behavioural and headless only). `check-dataset-asserts.js` and `check-spec-id-coverage.js` read only the two full exec configs (`EXEC_CONFIGS`).
- **Commands.** Targeted exec run: the **Verification:** command above. Validators: `node .claude/skills/validate-plugin-consistency/check-consistency.js`, `node .claude/skills/validate-skill-docs/check-docs-consistency.js`, `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict`. Docs and specs have byte copies under `site/src/content-source/`, refreshed with `cp`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Path-dependent fixtures | no | keep the per-case build for a fixture whose `setup.sh` names its own path, or whose build holds its build path | a copy of such a build points at the template folder; `project-ship-stepper` (187 cases) stays per-case |
| "drop the wasted project_root" | no | removes the `project_root` line from the 85 cases a block scan finds; no transform-level skip | assertions read `context.vars.project_root`, which the transform cannot see |
| hook-runner HOME copy | no | only `script-runner.js` copies an in-repo `script_home` | no hook dataset sets `script_home` (YAGNI) |
| "CI keeps -j 1" | no | no CI change | no workflow runs an exec suite; the owner did not choose CI for exec suites |
| TK-002 "or ship keeps a per-round copy" | no | both: `findings` in `review-summary.json`, and ship writes one per-run `review-rounds-<slug>.json` | the summary sidecar is deleted after cleanup and the summary file is overwritten per round |
| TK-002 A2 (lean ledger) | no | this plan writes the data; the ledger reader change is in `/workspace/orchestrate-lean-sdlc`, outside this repository | the plan can only change this repository; the main session updates the lean skill |
| TK-003 tier content | no | the planner chose the list (see Key Decisions) | the owner approved the tier but did not fix its content |
| TK-003 kept in W-H2 | no | the tier is Standard, so W-H2 has 2 Complex tasks and TK-003 stays | the scope moves TK-003 to W-F only when it is Complex and W-H2 would reach 3 Complex |
| Review loop cap | no | the third review round's three render findings (Tasks 8, 12, 14: render the config, Taskfile and doc edits as diffs) were fixed without a fourth round | the loop allows 3 rounds; all lenses approved in rounds 2 and 3; no owner was available to ask, so the recommended option (fix and proceed) was taken |
| `execSync('gh …')` calls | no | the in-process stub covers only `spawnSync('gh', …)`; shell `gh` calls fall back to the stub binary on PATH | `skill/github.js` calls gh only through `execGh` (spawnSync) |

## Key Decisions

**Decisions taken without the owner**

1. **Fast pre-push tier content.** The tier is the suite guards and the repository validators: `fixture-guard-exec`, `dataset-regex-exec`, `dataset-asserts-exec`, `docs-copies-exec`, `spec-id-coverage-exec`, `validate-cost-tiers-exec`, `validate-spec-shape-exec`, `validate-args-rule-exec`, `validate-copilot-mirror-exec`, `sdlc-plugin-discovery-exec`, `sdlc-script-resolution-exec` and `plan-format-exec`.
   - Why: these datasets check the whole repository at once (fixture references, regexes, docs copies, spec coverage, spec shape, plugin discovery, plan format). Most build no git fixture, so they run fast.
   - Alternative: a tier picked from the files a push changes. Rejected: it needs a file-to-dataset map that does not exist and would itself need tests.
   - The full suites still run with `task test:exec`, and the lean main session runs both full configs at PR validation.
   - The owner can change the list by editing one file.

2. **Memo rule for fixtures.** A fixture is built once per run (a "template" folder) and each case gets a copy, unless its `setup.sh` text matches the path-dependence pattern, or the built template contains its own absolute path in any file outside `.git/objects` or in any symlink target. Then the case builds it fresh, as today.
   - Alternative: rewrite the path in each copy. Rejected: committed git objects are compressed, so the path cannot be rewritten there.
   - The copy keeps file times (`preserveTimestamps`), because the GC cases depend on aged files, and keeps relative symlinks as they are (`verbatimSymlinks`).

3. **In-process gh stub through a preload, not a plugin change.** `run-github-case.js` starts the target script with `node -r tests/promptfoo/scripts/gh-inprocess.js`. The preload replaces `child_process.spawnSync` for the command `gh` when the stub folder is the first `gh` on PATH, and answers from the same core module the stub binary uses.
   - Alternative: an environment switch inside `lib/git.js`. Rejected: test-only code in the shipped plugin.
   - One core module serves the binary and the preload, so the two cannot drift.

4. **C16 loop in process.** `run-github-case.js` exports `runCase(argv)`, and `APPLY_HARNESS` calls it instead of starting a node process per payload. This saves one process per payload for every apply case, not only the two C16 cases.

5. **Round findings file.** `ship.js` writes `<state dir>/review-rounds-<slug>.json` once, at the same place it writes the summary sidecar (the cleanup emit). It holds `{ schemaVersion: 1, branch, startedAt, rounds }`, where `rounds` is the summary's `reviewRounds`.
   - Alternative: one copy of the review summary per round. Rejected: an earlier run with more rounds leaves stale round files that a reader cannot tell apart.
   - `resolveStateDir()` gives the main worktree's `.sdlc/execution` in both `ship.workspace=branch` and `ship.workspace=worktree`, the same folder as `review-summary-<slug>.json`.

6. **Default one thread everywhere.** Both full exec configs and the new fast config set `maxConcurrency: 1`; `lefthook.yml` and `task test:exec` pass `-j 1`. The README states that `-j N` is supported and that the owner runs the `-j 4` trial.

7. **Review-loop cap.** The third critique round left three render-only findings (rendered diffs for the config, Taskfile and doc edits of Tasks 8, 12 and 14). They were fixed in the plan without a fourth round, because the loop stops at 3 rounds and no owner was available; the hard format and link gates still ran after the fixes.

8. **Smallest viable cut.** Every task maps to an acceptance item. The three dataset clean-up tasks (Tasks 5–7) only remove lines. The docs task (Task 12) exists because the user docs of review-sdlc and ship-sdlc state the summary and record fields.

9. **Not plugin behaviour (project-agnostic guardrail).** Tasks 1–8, 13 and 14 change this repository's own test suite and its `lefthook.yml` and `Taskfile.yml`. These are not plugin behaviour, so the `project-agnostic` rule does not apply to them. Tasks 9–12 change shipped plugin code and specs.

**Non-goals**

- TK-020 (split `ship-prepare-exec.yaml`, `-e` programs to wrappers, stale headers): unit W-F.
- Converting the 17 path-dependent fixtures so they can be memoised.
- Running the `-j 4` trial (owner only).
- The lean ledger reader change (other repository).
- A persisted ship summary file (TK-015, another unit).
- Deferred lows (PD-1: they go to W-END).

## Final Shape

When all tasks are done:

- One exec run builds each memoisable fixture once. Each case still gets its own writable copy.
- The 85 cases that never used their fixture no longer declare one.
- A case whose `script_home` is in the repository gets its own copy of that HOME, so no case writes into the repository.
- The github runner cases answer `gh` in the runner's node process. The stub binary stays for the direct cases and for the stub self-tests.
- The apply cases call the runner as a function, not as a new process per payload.
- All exec configs default to one thread. The docs say how to run in parallel.
- `git push` runs `promptfooconfig-exec-fast.yaml` only. `task test:exec` runs both full configs, and `task test:exec:fast` runs the fast tier.
- `review-summary.json` carries a `findings` array. Each ship round record carries `findings`. After a ship run, `.sdlc/execution/review-rounds-<slug>.json` lists every round with its findings.

## Tasks

### Task 1: Memoised fixture build per run
**Ticket:** TK-001 @60918ba9
**Complexity:** Complex
**Risk:** High
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/extract-skill-content.js` — build each memoisable fixture once per run and copy the template per case
- Create: `tests/promptfoo/scripts/run-fixture-memo.js` — test helper: concurrent builds, path-dependence and an equivalence scan
- Create: `tests/promptfoo/fixtures-fs/fixture-memo-probe/setup.sh` — probe fixture: random build id, an aged file, a relative symlink
- Test: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — four new `fixture-memo:` cases

**Notes:** Path-dependent fixtures cannot be copied, because committed git objects hold the build path in compressed form. promptfoo 0.123.1 runs `transformVars` in one node process, so a Map of promises is enough to share one build between concurrent cases at `-j N`. The template name starts with `promptfoo-fixture-`, so the existing `afterAll` cleanup removes it with no change to `fixture-copies-cleanup.js`. Threat model of the memo rule (best effort): it guards against a copy that points at the template. Findings: F-exec-suite-fixture-memoisation-and-parallel-safety-1, -7. Accepted gap: a setup that writes its path only into a committed file and then deletes that file from the work tree, without naming `pwd`/`PWD` in `setup.sh`, is not detected.

**Acceptance criteria:**
- [ ] Four concurrent `transformVars` calls for `fixture-memo-probe` give four different `project_root` folders with one shared build id (one build).
- [ ] A path-dependent fixture (`project-ship-resume-flags`, its `setup.sh` writes `$PWD`) gives a different build per case.
- [ ] A copy keeps the aged file's mtime (2020-01-01) and the relative symlink target `aged.txt`.
- [ ] `node tests/promptfoo/scripts/run-fixture-memo.js --scan` over every fixture with a `setup.sh` exits 0 with `mismatches: []` (run once by the worker; the suite case scans 3 fixtures only).
- [ ] Targeted runs pass for the datasets of the three most-used memoised fixtures that the scan prints (for example `--filter-pattern "^setup-prepare"`, `"^execute-prepare:"`), and for `"^fixture-memo:"` and `"^fixture-guard:"`.
- [ ] Count checks: `fixture-guard (a)` still passes (`scanned >= 150`; the probe runs no git); `spec-id-coverage (b)` floors only grow (+4 cases).

**Contract:**
- shape (code): the copy-and-setup block of `transformVars`, before → after. The existing block (`extract-skill-content.js`, inside `if (vars.project_root && vars.project_root.startsWith('file://fixtures-fs/')) {`):

  ```diff
       const relativePath = vars.project_root.replace('file://fixtures-fs/', 'tests/promptfoo/fixtures-fs/');
       const sourceDir = path.join(REPO_ROOT, relativePath);
  -    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));
  -    // Registry read by scripts/fixture-copies-cleanup.js (afterAll hook, exec configs only).
  -    (globalThis.__sdlcFixtureCopies ??= new Set()).add(tmpDir);
  -    await fs.promises.cp(sourceDir, tmpDir, { recursive: true });
  -
  -    // Auto-run fixture setup script if present (initializes git state, stages files, etc.)
  -    const setupScript = path.join(tmpDir, 'setup.sh');
  -    if (fs.existsSync(setupScript)) {
  -      const setup = execFileAsync('bash', [setupScript], { cwd: tmpDir, timeout: 10_000 });
  -      setup.child.stdin.on('error', () => {}); // ignore EPIPE, as in the providers
  -      setup.child.stdin.end(); // EOF at once, as the old synchronous call gave
  -      await setup;
  -    }
  +    // Memo (TK-001): a memoisable fixture is built once per run into a template and copied per case.
  +    const template = await templateFor(sourceDir);          // null: no setup.sh, or path-dependent
  +    const tmpDir = template ? await copyTemplate(template) : await buildFresh(sourceDir);
 
       result.project_root = tmpDir;
       result.repo_root = REPO_ROOT;
  ```

  New module-level helpers in the same file:

  ```js
  const PATH_DEPENDENT_RE = /\$PWD|\$\{PWD\}|\$\(pwd\)|`pwd`|\bpwd\b|worktree\s+add/;   // NOT --show-toplevel: the #9161 guard line of every git fixture uses it
  // at planning HEAD this pattern matches exactly 17 setup.sh files (the scan prints perCase: 17 or more)
  const COPY_OPTS = { recursive: true, preserveTimestamps: true, verbatimSymlinks: true };
  const register = (dir) => (globalThis.__sdlcFixtureCopies ??= new Set()).add(dir);   // afterAll cleanup registry

  async function runSetup(dir) { /* the removed setup.sh block, unchanged: execFileAsync bash, cwd dir, 10 s timeout, stdin EOF */ }
  async function buildFresh(sourceDir) {                     // today's behaviour, as one function
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-')); register(dir);
    await fs.promises.cp(sourceDir, dir, { recursive: true });
    if (fs.existsSync(path.join(dir, 'setup.sh'))) await runSetup(dir);
    return dir;
  }
  function templateFor(sourceDir) {                          // Promise<string|null>, one per sourceDir per run
    const memo = (globalThis.__sdlcFixtureTemplates ??= new Map());
    if (!memo.has(sourceDir)) memo.set(sourceDir, (async () => {
      const setup = path.join(sourceDir, 'setup.sh');
      if (!fs.existsSync(setup) || PATH_DEPENDENT_RE.test(fs.readFileSync(setup, 'utf8'))) return null;
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-tmpl-')); register(dir);
      await fs.promises.cp(sourceDir, dir, { recursive: true });
      await runSetup(dir);                                   // a rejection rejects every case that awaits it
      return containsOwnPath(dir) ? null : dir;
    })());
    return memo.get(sourceDir);
  }
  async function copyTemplate(template) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-')); register(dir);
    await fs.promises.cp(template, dir, COPY_OPTS);
    return dir;
  }
  // containsOwnPath(dir): true when any regular file outside .git/objects contains dir or fs.realpathSync(dir)
  //   as bytes, or any symlink's readlink target contains it.
  ```

- names: `globalThis.__sdlcFixtureTemplates`, `PATH_DEPENDENT_RE`, exports added on the default function: `transformVars.isPathDependent(setupText)`, `transformVars.buildFresh(sourceDir) → Promise<string>`, `transformVars.templateFor(sourceDir) → Promise<string|null>`; probe files `build-id`, `aged.txt`, `link-rel`.
- `run-fixture-memo.js` CLI:

  | Invocation | stdout (one JSON line) | exit |
  |---|---|---|
  | `--fixture <name> --cases <n>` | `{ roots, distinctRoots, buildIds, distinctBuildIds, agedMtimes, linkTargets, templates }` | 0 |
  | `--scan [--fixtures a,b,c]` | `{ scanned, memo, perCase, mismatches: [{ fixture, diff }] }` | 0 when `mismatches` is empty, else 1 |
  | missing `--fixture` value, unknown flag, `--cases` not a positive integer | nothing on stdout; `Error: <reason>` on stderr | 2 |

  The scan compares, for each memoisable fixture, a fresh build with a template copy: relative path list, entry type, mode, symlink target, and for git repositories `git status --porcelain=v1`, `git rev-parse --abbrev-ref HEAD`, `git log --format=%s`. It removes every folder it made before it exits.
- mirror: provider temp handling `providers/script-runner.js:103-107`; cleanup registry `scripts/fixture-copies-cleanup.js:9-19`.
- decisions: Key Decision 2.
- sync: Task 8 rewrites the README sentence "a fixture with a `setup.sh` is built per case in a fresh temp directory" (`tests/promptfoo/README.md`, `### Script execution tests` intro paragraph).
- example: new cases (exact descriptions):

  ```yaml
  - description: "fixture-memo: (a) four concurrent cases of one fixture share one build and get four copies"
  - description: "fixture-memo: (b) a path-dependent fixture is built per case"
  - description: "fixture-memo: (c) a copy keeps file times and relative symlinks"
  - description: "fixture-memo: (d) the copies of three memoised fixtures match a fresh build"
  ```

  Each case: `script_path: "repo://tests/promptfoo/scripts/run-fixture-memo.js"`; (d) uses `--scan --fixtures project-sdlc-gitignore-inner,project-execute-prepare,execute-state-mid-wave`.

### Task 2: Per-case HOME copy in the script runner
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/script-runner.js` — copy an in-repo `script_home` to a per-case temp HOME, removed in `finally`
- Test: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — two new cases

**Notes:** This closes the only shared-write path at `-j N`. It changes a default that every case with `script_home` inherits, so the affected cases are found by a scan (ledger rule F-160; findings F-exec-suite-fixture-memoisation-and-parallel-safety-4, -5): `git grep -n "script_home:" tests/promptfoo/datasets` gives `github-sdlc-exec`, `jira-sdlc-exec`, `jira-assemble-exec`, `links-lib-exec`, `mcp-failure-github-exec`; each gets a full targeted run. `run-github-case.js` copies an in-repo HOME itself; after this change it gets a HOME outside the repository and uses it as is, which is also per case.

**Acceptance criteria:**
- [ ] A case with `script_home: "fixtures-fs/github-sdlc-home"` whose script writes `$HOME/probe-home.txt` prints a HOME outside the repository, and `tests/promptfoo/fixtures-fs/github-sdlc-home/probe-home.txt` does not exist afterwards.
- [ ] A case with `script_home: "{{project_root}}"` keeps that path as HOME (no copy).
- [ ] The per-case HOME copy is removed after the case.
- [ ] Targeted runs pass: `"^github-sdlc/"`, `"^mcp-failure"`, `"^jira-prepare:"`, `"^jira.js"`, `"^jira-assemble:"`, `"^links:"`, `"^script-runner"`, `"^script_stub_bin:"`.

**Contract:**
- shape (code): before → after in `callApi`:

  ```diff
   if (vars.script_home) {
     const home = path.isAbsolute(vars.script_home) ? vars.script_home : path.resolve(base, vars.script_home);
  -  env.HOME = home;
  +  // in-repo HOME: copy per case so no case writes into the repository (-j N safe)
  +  const rel = path.relative(REPO_ROOT, home);
  +  if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(home)) {
  +    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-home-'));
  +    fs.cpSync(home, tmpHome, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  +    env.HOME = tmpHome;
  +  } else env.HOME = home;
   }
   …
   } finally {
     if (tmpCwd) fs.rmSync(tmpCwd, { recursive: true, force: true });
  +  if (tmpHome) fs.rmSync(tmpHome, { recursive: true, force: true });
   }
  ```

- names: `REPO_ROOT = path.resolve(__dirname, '../../..')`, `tmpHome`, temp prefix `promptfoo-home-`; header comment line for `script_home` gains "an in-repo HOME is copied per case".
- mirror: `tmpCwd` handling in the same function.
- decisions: hook-runner unchanged (no hook dataset sets `script_home`).
- sync: Task 8 updates the `script_home` row of the README case-vars table.
- example: new case descriptions `"script-runner: an in-repo script_home is copied per case and the repo fixture stays untouched"` and `"script-runner: a script_home outside the repo is used as is"`.

### Task 3: In-process gh stub for the github runner cases
**Ticket:** TK-001 @60918ba9
**Complexity:** Complex
**Risk:** High
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/lib/gh-stub.js` — the stub's answer logic as a function
- Modify: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin/gh` — thin wrapper over `lib/gh-stub.js`
- Create: `tests/promptfoo/scripts/gh-inprocess.js` — `-r` preload that answers `spawnSync('gh', …)` in process
- Modify: `tests/promptfoo/scripts/run-github-case.js` — start the target with the preload; new `--gh-subprocess` option
- Test: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — three parity cases

**Notes:** `lib/git.js` takes `spawnSync` from `child_process` when it loads; a `-r` preload runs first, so replacing the property on the module object is seen by it. The stub folder stays on PATH (C17 check, direct cases, `--raw-gh` self-tests), and the preload falls through to the real `spawnSync` when another `gh` comes first on PATH, so the `--no-gh-path` cases keep their result. Findings: F-gh-stub-and-c16-loop-inprocess-1, -2, -3, -7. Threat model: test-only code; accepted gap: shell `execSync('gh …')` calls are not intercepted and use the binary.

**Acceptance criteria:**
- [ ] For three scenarios (one view, one apply `--dry-run`, one auth-timeout case), the runner output `{exit, json, calls}` with the preload equals the output with `--gh-subprocess`.
- [ ] An auth-timeout answer whose sleep is at least the call's `timeout` returns at once as a timed-out result (`timedOut: true` in `execGh`), with no real sleep.
- [ ] A `--no-gh-path` case still reports gh as missing.
- [ ] `--raw-gh` stub self-tests still run the binary and pass.
- [ ] Targeted runs pass: `"^github-sdlc/"` and `"^mcp-failure"`.

**Contract:**
- shape (code):

  ```js
  // fixtures-fs/stub-bin-gh-issues/lib/gh-stub.js
  // answer(argv: string[], env: object, input?: string) -> { stdout: string, stderr: string, status: number, sleepMs: number }
  //   same routes, built-ins, GH_STUB_* handling, GH_STUB_LOG append and GH_STUB_SEQ counter as bin/gh today;
  //   a sleeping answer (timeout routes, GH_STUB_SLEEP_MS) returns sleepMs instead of sleeping.
  module.exports = { answer };

  // bin/gh
  const r = answer(process.argv.slice(2), process.env, stdinText /* read only when stdin is not a TTY */);
  if (r.sleepMs) sleepSync(r.sleepMs);
  process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status);

  // scripts/gh-inprocess.js (loaded with node -r)
  const cp = require('child_process'); const real = cp.spawnSync;
  cp.spawnSync = function (cmd, args, opts = {}) {
    if (cmd !== 'gh' || firstGhOnPath((opts.env || process.env).PATH) !== STUB_GH) return real.apply(this, arguments);
    const r = answer(args || [], opts.env || process.env, opts.input);
    if (opts.timeout && r.sleepMs >= opts.timeout) return timedOut();     // { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' } }
    if (r.sleepMs) sleepSync(r.sleepMs);
    return result(r, opts.encoding);                                     // { pid: 0, output: [null, out, err], stdout, stderr, status, signal: null }
  };
  ```

- names: `answer`, `STUB_GH = <repo>/tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin/gh`, `firstGhOnPath`, `sleepSync` (`Atomics.wait` on a `SharedArrayBuffer`), runner option `--gh-subprocess` (added to the usage header of `run-github-case.js`); stdout/stderr are strings when `opts.encoding` is set, else Buffers.
- mirror: `run-github-case.js:154-156` (the target spawn), stub header `bin/gh:1-20`.
- decisions: Key Decision 3.
- sync: the scenario files under `fixtures-fs/stub-bin-gh-issues/scenarios/` are unchanged.
- example: parity case descriptions `"github-sdlc/stub: in-process and subprocess gh give the same view result"`, `"github-sdlc/stub: in-process and subprocess gh give the same apply dry-run commands"`, `"github-sdlc/stub: an in-process auth timeout returns at once as timed out"`.

### Task 4: C16 apply loop in process
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-github-case.js` — export `runCase(argv)`; the CLI prints its result as before
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `APPLY_HARNESS` calls `runCase` instead of `cp.spawnSync` per payload

**Notes:** The anchor is shared by every apply case, so one change removes one node process per payload from all of them. `runCase` must be re-entrant: each call makes and removes its own temp folders and never calls `process.exit`, `process.chdir` or changes `process.env`. Findings: F-gh-stub-and-c16-loop-inprocess-4, -5, -6.

**Acceptance criteria:**
- [ ] `APPLY_HARNESS` holds no `spawnSync(process.execPath` call for the runner.
- [ ] Running `node run-github-case.js …` from the shell prints the same JSON line as before.
- [ ] The two C16 cases still assert `runs.length === 8` and `runs.length === 9` and pass.
- [ ] Targeted run passes: `"^github-sdlc/apply"`, then `"^github-sdlc/"`.

**Contract:**
- shape (code):

  ```diff
  -        const r = cp.spawnSync(process.execPath, [path.join(pf, 'scripts', 'run-github-case.js'), ...args], { encoding: 'utf8' });
  -        const o = JSON.parse(r.stdout);
  +        const o = runCase(args);
  ```

  with `const { runCase } = require(path.join(pf, 'scripts', 'run-github-case.js'));` next to the `payloadHash` require. In the runner:

  ```js
  function runCase(argv) { /* today's body; returns the object it printed */ }
  module.exports = { runCase };
  if (require.main === module) process.stdout.write(JSON.stringify(runCase(process.argv.slice(2))) + '\n');
  ```

- names: `runCase`; the printed object keeps `{ exit, stdout, json, stderr, calls, outputFile, dumps, runs? }`.
- mirror: `APPLY_HARNESS` anchor `github-sdlc-exec.yaml:2059-2092`.
- decisions: Key Decision 4.
- sync: argument errors in `runCase` throw (the CLI path prints the error on stderr and exits 2, as `parseArgs` errors do today).

### Task 5: Drop the wasted project_root (batch 1)
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — remove 23 unused `project_root` lines
- Modify: `tests/promptfoo/datasets/git-lib-exec.yaml` — remove 17
- Modify: `tests/promptfoo/datasets/branch-name-exec.yaml` — remove 7
- Modify: `tests/promptfoo/datasets/version-retag-exec.yaml` — remove 7
- Modify: `tests/promptfoo/datasets/branch-guard-exec.yaml` — remove 6

**Notes:** Mechanical line removal; the scan treats any other `project_root` or `repo_root` mention (assertions included) as a use, because the transform sets `repo_root` only for a case with a fixture. Findings: F-exec-suite-fixture-memoisation-and-parallel-safety-2.

**Contract:**
- shape (code): per flagged case, before → after (example from `branch-guard-exec.yaml`):

  ```diff
     vars:
       script_path: "repo://…"
       script_args: "…"
  -    project_root: "file://fixtures-fs/<fixture>"
  ```

  No other line changes; no case is added or removed.
- names: var `project_root`; the five dataset files above.
- mirror: none (line removal only).
- decisions: dataset edits, not a transform-level skip (Deviations row 2).
- sync: none.

**Acceptance criteria:**
- [ ] The wasted-project_root scan, run from the repository root, prints no entry for the five files. Scan: `node -e 'const fs=require("fs");const d="tests/promptfoo/datasets/";const o={};for(const f of fs.readdirSync(d).filter(f=>f.endsWith(".yaml")))for(const b of fs.readFileSync(d+f,"utf8").split(/^(?=\s*- description:)/m)){if(!/project_root:\s*"?file:\/\/fixtures-fs/.test(b))continue;const r=b.split("\n").filter(l=>!/^\s*project_root:\s*"?file:/.test(l));const a=r.filter(l=>/^\s*script_args:/.test(l)).join("\n");const x=r.filter(l=>!/^\s*script_args:/.test(l)).join("\n");if(/project_root/.test(a+x)||/repo_root/.test(x))continue;o[f]=(o[f]||0)+1}console.log(JSON.stringify(o))'`
- [ ] No case is removed (the `- description:` count of each file is unchanged).
- [ ] Targeted runs pass: `"^execute-plan-sdlc/"`, `"^git-lib:"`, `"^branch-name:"`, `"^version"` (version-retag cases), `"^branch-guard:"`.

### Task 6: Drop the wasted project_root (batch 2)
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/migrate-jira-templates-exec.yaml` — remove 6 unused `project_root` lines
- Modify: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — remove 5
- Modify: `tests/promptfoo/datasets/setup-script-versions-exec.yaml` — remove 3
- Modify: `tests/promptfoo/datasets/dimension-to-instructions-exec.yaml` — remove 2
- Modify: `tests/promptfoo/datasets/setup-migrate-dispatch-exec.yaml` — remove 2

**Notes:** Same mechanical removal as Task 5, for the next five files. Findings: F-exec-suite-fixture-memoisation-and-parallel-safety-2.

**Contract:**
- shape (code): the Task 5 diff (remove the `project_root: "file://fixtures-fs/…"` line of each flagged case), checked with the Task 5 scan command.
- names: var `project_root`; the five dataset files above.
- mirror: Task 5.
- decisions: as Task 5.
- sync: none.

**Acceptance criteria:**
- [ ] The scan prints no entry for the five files.
- [ ] No case is removed.
- [ ] Targeted runs pass: `"^migrate-jira-templates:"`, `"^plan-"` (plan-prepare, plan-merge, plan-diff cases), `"^setup"`, `"^dimension-to-instructions"`.

### Task 7: Drop the wasted project_root (batch 3)
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-dispatch-resilience-exec.yaml` — remove 2 unused `project_root` lines
- Modify: `tests/promptfoo/datasets/config-resolve-sdlc-root-exec.yaml` — remove 1
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — remove 1
- Modify: `tests/promptfoo/datasets/lib-worktree-exec.yaml` — remove 1
- Modify: `tests/promptfoo/datasets/markdown-to-adf-exec.yaml` — remove 1
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — remove 1

**Notes:** Six files with one or two lines each (7 lines in all); one batch keeps the plan at 14 tasks (the size rule) and the clean-up in one wave. Findings: F-exec-suite-fixture-memoisation-and-parallel-safety-2.

**Contract:**
- shape (code): the Task 5 diff, checked with the Task 5 scan command; after this task the scan prints `{}`.
- names: var `project_root`; the six dataset files above.
- mirror: Task 5.
- decisions: as Task 5.
- sync: none.

**Acceptance criteria:**
- [ ] The scan prints `{}`.
- [ ] No case is removed.
- [ ] Targeted runs pass: `"^execute-plan-sdlc/"`, `"^config-sdlc-root:"`, `"^execute-prepare:"`, `"^worktree-lib:"`, `"^markdown-to-adf:"`, `"^plan-format"`.

### Task 8: One-thread default and suite docs
**Ticket:** TK-001 @60918ba9
**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — `maxConcurrency: 2` → `1`
- Modify: `tests/promptfoo/promptfooconfig-exec-hooks.yaml` — `maxConcurrency: 2` → `1`
- Modify: `Taskfile.yml` — `test:exec` passes `-j 1` to both evals
- Modify: `tests/promptfoo/README.md` — memo, parallel runs, HOME copy, in-process gh stub

**Notes:** The README sentence at `:73` ("Use `-j 1` because cases share fixture copies and temp directories") becomes false after Tasks 1–2, so it is rewritten here. `git grep -F "share fixture copies" tests/promptfoo` and `git grep -F "built per case in a fresh temp directory" tests/promptfoo` find no test file asserting these literals (checked at planning HEAD; the worker re-runs both greps). `.github/workflows/` runs no exec suite, so no CI file changes. Findings: F-exec-suite-fixture-memoisation-and-parallel-safety-3, F-prepush-fast-exec-tier-and-jobs-default-2, -5, -7.

**Acceptance criteria:**
- [ ] Both full exec configs set `maxConcurrency: 1`.
- [ ] `task test:exec` runs both configs with `-j 1`.
- [ ] The README states: fixtures with a `setup.sh` are built once per run unless path-dependent; an in-repo `script_home` is copied per case; github runner cases answer `gh` in process; `-j N` is supported and the default is `-j 1`; the `-j 4` trial is owner-run.
- [ ] Targeted runs pass: `"^fixture-memo:"` and, with `-c promptfooconfig-exec-hooks.yaml`, `"^worker-write-guard"`.

**Contract:**
- shape (docs): `tests/promptfoo/README.md`, section `### Script execution tests`; locate each site by its quoted text, not by line number (Task 14 edits the same paragraph later). Before → after:

  ```diff
  -… and a fixture with a `setup.sh` is built per case in a fresh temp directory. Helper scripts live in `scripts/`, committed baselines in `baselines/`.
  +… and a fixture with a `setup.sh` is built once per run and copied for each case; a fixture whose `setup.sh` uses its own path (`$PWD`, `pwd`, `git worktree add`) is built per case. Helper scripts live in `scripts/`, committed baselines in `baselines/`.
  ```

  ```diff
  -The hooks variant uses `-c promptfooconfig-exec-hooks.yaml` with the same flags. Use `-j 1` because cases share fixture copies and temp directories. promptfoo is pinned to 0.123.1 because 0.125 and later fail with EISDIR.
  +The hooks variant uses `-c promptfooconfig-exec-hooks.yaml` with the same flags. The default is one thread (`-j 1`, `maxConcurrency: 1`). Parallel runs (`-j N`) are supported: each case has its own temp cwd, fixture copy and HOME copy. The owner runs the `-j 4` trial. promptfoo is pinned to 0.123.1 because 0.125 and later fail with EISDIR.
  ```

  ```diff
  -| `script_home` | `HOME` for the script; a relative path resolves against `script_cwd`, or against `tests/promptfoo` when `script_cwd` is unset |
  +| `script_home` | `HOME` for the script; a relative path resolves against `script_cwd`, or against `tests/promptfoo` when `script_cwd` is unset; a HOME inside the repository is copied to a per-case temp folder |
  ```

  New paragraph right after the case-vars table (before "Both providers set `GIT_SSH_COMMAND=false` …"):

  ```diff
  +The github runner cases (`scripts/run-github-case.js`) answer `gh` in process through `scripts/gh-inprocess.js`; `--gh-subprocess` uses the stub binary instead.
  +
   Both providers set `GIT_SSH_COMMAND=false` and `GIT_TERMINAL_PROMPT=0` unless `script_env` sets them, so no case can push over SSH or wait for a git password.
  ```

- shape (code): both full exec configs, line 4, and `Taskfile.yml` `test:exec`, before → after:

  ```diff
   # tests/promptfoo/promptfooconfig-exec.yaml and tests/promptfoo/promptfooconfig-exec-hooks.yaml
   evaluateOptions:
  -  maxConcurrency: 2
  +  maxConcurrency: 1
  ```

  ```diff
     test:exec:
       desc: Run script execution tests (no LLM, real scripts against fixtures)
       silent: true
       dir: tests/promptfoo
       cmds:
  -      - npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec.yaml --env-file .env
  -      - npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-hooks.yaml --env-file .env
  +      - npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec.yaml -j 1 --env-file .env
  +      - npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-hooks.yaml -j 1 --env-file .env
  ```
- mirror: README `:70` targeted-run command (already `-j 1`).
- decisions: Key Decision 6.
- sync: Task 14 edits the pre-push sentence of the same README section and adds a Taskfile task.

### Task 9: Spec — round findings in the review summary and ship records
**Ticket:** TK-002 @99f967fd
**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/review-sdlc.md` — P11 gains `findings`
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy (`cp`)
- Modify: `docs/specs/ship-sdlc.md` — R106 record gains `findings`; new R108; appendix rows
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — check only (plan.copyRules copy of the review-sdlc spec): edit only if it states the summary fields
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — check only (plan.copyRules copy): edit only if an example shows `review-summary.json`

**Notes:** Spec first: Tasks 10–12 implement these ids. R108 is the next free id after R107. The appendix row names W-H2 and TK-002, with no `Fixes`/`Closes` keyword. The two review-sdlc companions are check-only copies for `plan.copyRules` (`git grep -n "review-summary" plugins/sdlc-utilities/skills/review-sdlc` is empty at planning HEAD), so the file list is six but the real edit is four. Findings: F-review-round-findings-persistence-1, -7.

**Acceptance criteria:**
- [ ] P11's field list reads `{schemaVersion, verdict, counts, findings, dimensions, commentPath, branch}` and defines `findings`.
- [ ] R106's record reads `{ round, final, counts, threshold, receivedReview, fixed, declined, deferred, findings }` and defines `findings`.
- [ ] R108 exists with an Acceptance line naming its exec case.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; `cmp` of each spec with its site copy exits 0.

**Contract:**
- shape (openspec): requirement ids — MODIFY review-sdlc P11, MODIFY ship-sdlc R106, ADD ship-sdlc R108; no renumbering. Delta text:
  - P11 (added sentence): "`findings` is the list of consolidated findings after dedupe, sorted as in the comment, one `{ severity, dimension, path, line, title }` per finding (`path` is the finding's `file`; `line` is an integer or a range string such as `"42-48"`); `[]` when there is none."
  - R106 (record list gains `findings`, added sentence): "`findings` is the `findings` array of the review summary that round's gate read, each entry `{ severity, dimension, path, line, title }`, or null when the summary is missing, stale, malformed or has no `findings` array."
  - R108 (new): "R108: Round findings file. When ship.js emits the cleanup step, it also writes `<state dir>/review-rounds-<slug>.json` (`resolveStateDir()`, the folder of the R6 review summary; `<slug>` = `slugifyBranch(ledger.branch)`) as `{ schemaVersion: 1, branch, startedAt, rounds }`, where `startedAt` is the ledger's `startedAt` and `rounds` is the summary's `reviewRounds` (R106). The file is not removed by cleanup; the next ship run on the branch overwrites it. A write error adds no error and does not stop the pipeline. Acceptance: exec case `ship-summary-rounds: (d)` in `tests/promptfoo/datasets/ship-prepare-exec.yaml`."
  - Appendix: `| R108 | round findings file, W-H2 (TK-002) |` in ship-sdlc; a history line for the P11 and R106 changes in each spec's appendix.
- names: P11, R106, R108, `review-rounds-<slug>.json`.
- mirror: R78/R106 text style `docs/specs/ship-sdlc.md:240-242`.
- decisions: Key Decision 5.
- sync: site copies with `cp docs/specs/<skill>.md site/src/content-source/specs/<skill>.md`.

### Task 10: Findings array in review-summary.json
**Ticket:** TK-002 @99f967fd
**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 9
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review-consolidate.js` — `buildSummary` adds `findings` (implements review-sdlc P11)
- Modify: `schemas/review-summary.schema.json` — optional `findings` array
- Modify: `docs/skills/review-sdlc.md` — the review-summary row names `findings`
- Modify: `site/src/content-source/skills/review-sdlc.md` — byte copy (`cp`)
- Test: `tests/promptfoo/datasets/review-consolidate-exec.yaml` — update the schema-fields case; one new case

**Notes:** `findings` is optional in the schema so older summaries still validate; `ship.js` ignores unknown keys (`:1843-1846`). Findings: F-review-round-findings-persistence-1, -8. The byte-identical case stays valid because the sort is the comment's `compareFindings`. The review-sdlc companions `SKILL.md`, `REFERENCE.md` and `EXAMPLES.md` and `site/src/data/skills-meta.ts` do not state the summary fields (`git grep -n "review-summary" plugins/sdlc-utilities/skills/review-sdlc site/src/data/skills-meta.ts` is empty at planning HEAD); Task 9 lists `REFERENCE.md` and `EXAMPLES.md` and Task 12 lists `skills-meta.ts` as check-only copies.

**Acceptance criteria:**
- [ ] With the existing dedupe input, `summary.json` holds `findings` entries `{ severity, dimension, path, line, title }` in comment order, and `[]` with no findings.
- [ ] The summary still validates against `schemas/review-summary.schema.json`.
- [ ] The byte-identical case passes.
- [ ] Targeted run passes: `"^review-consolidate:"`; then `"^ship-review-gate"` (the gate still reads the file).

**Contract:**
- shape (code): before → after in `buildSummary`:

  ```diff
     return {
       schemaVersion: 1,
       verdict: verdictText,
       counts: counts.total,
  +    findings: results.flatMap(r => r.findings).sort(compareFindings)
  +      .map(f => ({ severity: f.severity, dimension: f.dimension, path: f.file, line: f.line, title: f.title })),
       dimensions,
  ```

  schema property:

  ```json
  "findings": { "type": "array", "items": { "type": "object",
    "properties": { "severity": { "enum": ["critical", "high", "medium", "low", "info"] }, "dimension": { "type": "string" },
      "path": { "type": "string" }, "line": { "type": ["integer", "string"] }, "title": { "type": "string" } },
    "required": ["severity", "dimension", "path", "line", "title"], "additionalProperties": false } }
  ```

- names: `findings`, `compareFindings` (existing), new case `"review-consolidate: summary findings list each finding's severity, dimension, path, line and title"`.
- mirror: `renderComment` sort at `review-consolidate.js:398`.
- decisions: severity enum includes `info` (the consolidated list keeps info findings, as the comment does).
- sync: Task 9 P11 text; the review-summary row of the "What It Creates or Modifies" table in `docs/skills/review-sdlc.md` (then `cp` to the site copy), before → after (only the opening is shown; the rest of the row stays):

  ```diff
  -| `.sdlc/execution/review-summary-<branch-slug>.json` (main worktree) | Machine-readable review summary (`verdict`, `counts`, `dimensions`; schema `schemas/review-summary.schema.json`), …
  +| `.sdlc/execution/review-summary-<branch-slug>.json` (main worktree) | Machine-readable review summary (`verdict`, `counts`, `findings` — severity, dimension, path, line and title of each finding — and `dimensions`; schema `schemas/review-summary.schema.json`), …
  ```

### Task 11: Findings in ship round records and the round findings file
**Ticket:** TK-002 @99f967fd
**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 9
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `reviewGateFromSummary` returns `findings`; `reviewRoundRecord` adds it (R106); the cleanup emit writes `review-rounds-<slug>.json` (R108)
- Create: `tests/promptfoo/fixtures-fs/review-summaries/high-1-findings.json` — `high-1.json` plus a two-entry `findings` array
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — update `ship-summary-rounds: (a)` and `(b)`; add `(c)` and `(d)`
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/config-format.md` — check only (plan.copyRules copy of the ship-sdlc spec): edit only if it states the round record or summary fields
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/entry-modes.md` — check only (plan.copyRules copy): edit only if it states the round record or summary fields

**Notes:** The record is built when a round ends, before the next review overwrites the summary, so earlier rounds keep their own findings. The existing fixtures have no `findings` array, so cases (a) and (b) only gain `findings: null` in each expected record. `git grep -n "reviewRounds" tests/promptfoo/datasets` lists only `ship-prepare-exec.yaml` (5023-5047, 5801); line 5801 checks the flag, not records. Findings: F-review-round-findings-persistence-3, -4, -5. Workspace modes: `resolveStateDir()` is the main worktree's state folder in both `branch` and `worktree` mode, as for the R6 summary.

**Acceptance criteria:**
- [ ] (a) and (b) pass with `findings: null` appended to each expected record.
- [ ] (c) with `--summary high-1-findings.json`: every round record's `findings` equals the fixture's array.
- [ ] (d) after the walk reaches cleanup, `<project_root>/.sdlc/execution/review-rounds-feat-ship.json` parses to `{ schemaVersion: 1, branch: "feat/ship", startedAt, rounds }` with `rounds` equal to the cleanup summary's `reviewRounds`.
- [ ] A write failure of the file (state folder not writable) still emits cleanup.
- [ ] Targeted runs pass: `"^ship-summary-rounds:"`, `"^ship-summary-commits:"`, `"^ship-review-gate"`, `"^ship-step:"`.

**Contract:**
- shape (code): three change sites in `ship.js`, before → after.

  `reviewGateFromSummary` (the valid-summary return):

  ```diff
     const counts = { critical: c.critical, high: c.high, medium: c.medium, low: c.low, info: c.info };
     const met = SEVERITIES.slice(0, SEVERITIES.indexOf(threshold) + 1).some(k => counts[k] > 0);
     return {
       dispatchReceivedReview: met,
       reason: met ? `findings at or above reviewThreshold (${threshold})` : `no findings at or above reviewThreshold (${threshold})`,
       counts, verdict: doc.verdict, summaryFound: true,
       commentPath: typeof doc.commentPath === 'string' ? doc.commentPath : null,
       commentCopyPath: typeof doc.commentCopyPath === 'string' ? doc.commentCopyPath : null,
  +    findings: summaryFindings(doc),   // R106: null when the summary has no findings array
     };
  ```

  with `const missing = { …, commentCopyPath: null, findings: null };` and the helper

  ```js
  function summaryFindings(doc) {
    if (!Array.isArray(doc.findings)) return null;
    return doc.findings
      .filter(f => f && [...SEVERITIES, 'info'].includes(f.severity) && typeof f.path === 'string' && typeof f.title === 'string')
      .map(f => ({ severity: f.severity, dimension: typeof f.dimension === 'string' ? f.dimension : null, path: f.path, line: f.line ?? null, title: f.title }));
  }
  ```

  `reviewGateDecision` return gains `findings: r.findings`. `reviewRoundRecord` return:

  ```diff
     return {
       round, final: !!final, counts, threshold: d.threshold, receivedReview: ran,
       fixed: ran ? int('fixed') : null, declined: ran ? int('declined') : null, deferred: ran ? int('deferred') : null,
  +    findings: d.parseable && Array.isArray(d.findings) ? d.findings : null,   // R106
     };
  ```

  Cleanup emit (R108), after the sidecar write:

  ```diff
     if (next.step.id === 'cleanup' && next.step.data && next.step.data.summary) {
       try {
         fs.writeFileSync(summarySidecarPath(ledgerPath), JSON.stringify(next.step.data.summary));
       } catch (_) { /* the summary then stays null after cleanup */ }
  +    try {
  +      const roundsFile = path.join(resolveStateDir(), `review-rounds-${slugifyBranch(ledger.branch || 'nobranch')}.json`);
  +      fs.writeFileSync(roundsFile, JSON.stringify({ schemaVersion: 1, branch: ledger.branch, startedAt: ledger.startedAt,
  +        rounds: next.step.data.summary.reviewRounds || [] }, null, 2) + '\n');
  +    } catch (_) { /* R108: a write error never stops the pipeline */ }
     }
  ```

  Record before → after:

  ```diff
  - { round, final, counts, threshold, receivedReview, fixed, declined, deferred }
  + { round, final, counts, threshold, receivedReview, fixed, declined, deferred, findings }
  ```

- names: `findings`, `review-rounds-<slug>.json`; new case descriptions `"ship-summary-rounds: (c) each round record carries the findings of the summary its gate read"` and `"ship-summary-rounds: (d) cleanup writes the round findings file with every record"`.
- mirror: `reviewRoundRecord` `ship.js:1926-1940`; sidecar write `ship.js:3021`.
- decisions: Key Decision 5.
- sync: Task 12 updates `state-format.md:49` and `docs/skills/ship-sdlc.md:261`.

### Task 12: Ship user docs for the round findings
**Ticket:** TK-002 @99f967fd
**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 9
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — the `reviewRounds` paragraph names `findings` and the round findings file
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — the `rounds` row's record gains `findings`
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/reference.md` — check only: the review-gate paragraph (:50) stays; edit only if it lists summary fields
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` — check only (plan.copyRules copy): edit only if it states the round record fields
- Modify: `site/src/data/skills-meta.ts` — check only: edit only if a ship or review entry lists the summary or record fields

**Notes:** The check-only entries are the copies that the `plan.copyRules` check requires for the ship-sdlc spec; they count toward the file list (six) but are edited only when they state the changed fields, so the real edit is three files. Findings: F-review-round-findings-persistence-4, -6, -7.

**Contract:**
- shape (docs): `docs/skills/ship-sdlc.md`, the `reviewRounds` paragraph (reference doc, audience: ship users), before → after (unchanged middle elided):

  ```diff
  -The summary also carries `reviewRounds`, one record per review that ran, in order (the final check included). Each record is `{ round, final, counts, threshold, receivedReview, fixed, declined, deferred }`: `final` is true only for the final check, … `reviewRounds` is kept in `ext.summary`, so it survives cleanup of the state file and is `[]` when no review completed. See `docs/specs/ship-sdlc.md` R106.
  +The summary also carries `reviewRounds`, one record per review that ran, in order (the final check included). Each record is `{ round, final, counts, threshold, receivedReview, fixed, declined, deferred, findings }`: `final` is true only for the final check, … and `findings` lists the severity, dimension, path, line and title of each finding of that round's review summary (null when the summary was missing, stale, malformed or had no findings list). `reviewRounds` is kept in `ext.summary`, so it survives cleanup of the state file and is `[]` when no review completed. After the run, `.sdlc/execution/review-rounds-<branch-slug>.json` keeps every record, so the findings of each round, also below the threshold, stay on disk. See `docs/specs/ship-sdlc.md` R106 and R108.
  ```

  `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` (the `rounds` row of the ledger table), before → after:

  ```diff
  -| `rounds` | array | One entry per closed review round (R84): { round, review, receivedReview, commitFixes, record }; record is the R106 round record { round, final, counts, threshold, receivedReview, fixed, declined, deferred }. |
  +| `rounds` | array | One entry per closed review round (R84): { round, review, receivedReview, commitFixes, record }; record is the R106 round record { round, final, counts, threshold, receivedReview, fixed, declined, deferred, findings }. |
  ```
- names: `findings`, `review-rounds-<branch-slug>.json`, R106, R108.
- mirror: the existing `reviewRounds` paragraph `docs/skills/ship-sdlc.md:261`.
- decisions: Key Decision 5.
- sync: `cp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md`.

**Acceptance criteria:**
- [ ] `docs/skills/ship-sdlc.md` and `state-format.md` name `findings`; the doc names R108 and the file.
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.

### Task 13: Fast pre-push exec tier
**Ticket:** TK-003 @82ed171e
**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/promptfooconfig-exec-fast.yaml` — the fast tier: same provider, transform and cleanup as the full script config, 12 datasets
- Modify: `lefthook.yml` — pre-push runs only the fast tier, with `-j 1`
- Test: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — one new `fast-tier:` guard case

**Notes:** The guard keeps the tier a true subset of the full config, so no case exists only in the pre-push tier and every fast case is also checked by the full-suite guards (`check-dataset-asserts.js`, `check-spec-id-coverage.js`), whose `EXEC_CONFIGS` therefore need no change. No step of this task skips or disables CI. `fixture-guard-exec.yaml` is shared with Task 1, hence the dependency. Findings: F-prepush-fast-exec-tier-and-jobs-default-1, -8, -9, -10.

**Acceptance criteria:**
- [ ] `lefthook.yml` pre-push has one command that runs `npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-fast.yaml -j 1 --no-cache` from `tests/promptfoo/`.
- [ ] The guard case passes: every dataset of the fast config is listed in `promptfooconfig-exec.yaml`, and its `providers`, `defaultTest` and `extensions` equal the full config's.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-fast.yaml -j 1 --no-cache` passes (a run of the tier itself, exec-only).
- [ ] Count checks: `fixture-refs (a)` keeps `configs === 2`; `spec-id-coverage (b)` floors only grow (+1 case).

**Contract:**
- shape (code): new config:

  ```yaml
  description: "Fast exec tier for the pre-push hook: suite guards and repository validators (a subset of promptfooconfig-exec.yaml)"
  evaluateOptions:
    maxConcurrency: 1
  providers:
    - id: file://providers/script-runner.js
  prompts:
    - "run"
  defaultTest:
    options:
      transformVars: "file://scripts/extract-skill-content.js"
  extensions:
    - file://scripts/fixture-copies-cleanup.js:afterAll
  tests:
    - file://datasets/fixture-guard-exec.yaml
    - file://datasets/dataset-regex-exec.yaml
    - file://datasets/dataset-asserts-exec.yaml
    - file://datasets/docs-copies-exec.yaml
    - file://datasets/spec-id-coverage-exec.yaml
    - file://datasets/validate-cost-tiers-exec.yaml
    - file://datasets/validate-spec-shape-exec.yaml
    - file://datasets/validate-args-rule-exec.yaml
    - file://datasets/validate-copilot-mirror-exec.yaml
    - file://datasets/sdlc-plugin-discovery-exec.yaml
    - file://datasets/sdlc-script-resolution-exec.yaml
    - file://datasets/plan-format-exec.yaml
  ```

  `lefthook.yml` before → after:

  ```diff
   pre-push:
     parallel: false
     commands:
  -    exec-scripts:
  -      root: "tests/promptfoo/"
  -      run: npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec.yaml
  -    exec-hooks:
  -      root: "tests/promptfoo/"
  -      run: npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-hooks.yaml
  +    exec-fast:
  +      root: "tests/promptfoo/"
  +      run: npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-fast.yaml -j 1 --no-cache
  ```

  The header comment of `lefthook.yml` says the hook runs the fast exec tier and that the full exec configs run with `task test:exec`.
- names: config `promptfooconfig-exec-fast.yaml`, lefthook command `exec-fast`, guard case `"fast-tier: every fast-tier dataset is in the full exec config and the fast config matches its provider, transform and cleanup"` (an `-e` script that reads both YAML files as text with line regexes, no YAML parser).
- mirror: `promptfooconfig-exec.yaml:1-20`.
- decisions: Key Decision 1.
- sync: Task 14 documents the tier.

### Task 14: Fast tier wiring in Taskfile and docs
**Ticket:** TK-003 @82ed171e
**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 8, Task 13
**Verify:** manual

**Files:**
- Modify: `Taskfile.yml` — new `test:exec:fast` task; `hooks:install` description names the fast tier
- Modify: `tests/promptfoo/README.md` — the pre-push sentence and a short "Fast tier" paragraph
- Modify: `README.md` — the contributor line names the fast tier

**Contract:**
- shape (docs + code): before → after.

  ```diff
     hooks:install:
  -    desc: Install the local git pre-push hook (runs exec-only promptfoo suites)
  +    desc: Install the local git pre-push hook (runs the fast exec tier, promptfooconfig-exec-fast.yaml)
       silent: true
       cmds:
         - lefthook install
  ```

  New task in `Taskfile.yml`, right after `test:exec`:

  ```yaml
    test:exec:fast:
      desc: Run the fast exec tier (suite guards and repository validators; the pre-push tier)
      silent: true
      dir: tests/promptfoo
      cmds:
        - npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec-fast.yaml -j 1 --env-file .env
  ```

  `tests/promptfoo/README.md` (the `### Script execution tests` intro paragraph, located by its text after Task 8's edit):

  ```diff
  -… The `lefthook` pre-push hook runs both configs. Script paths use …
  +… The `lefthook` pre-push hook runs the fast tier `promptfooconfig-exec-fast.yaml` (suite guards and repository validators, a subset of `promptfooconfig-exec.yaml`); `task test:exec` runs both full configs and `task test:exec:fast` runs the fast tier. Script paths use …
  ```

  `README.md` (contributor line):

  ```diff
  -Contributors: run `task hooks:install` (or `lefthook install`) once to enable the pre-push hook that runs the exec test suite; requires `lefthook` and `promptfoo` on PATH.
  +Contributors: run `task hooks:install` (or `lefthook install`) once to enable the pre-push hook that runs the fast exec tier (`task test:exec` runs the full exec suites); requires `lefthook` and `promptfoo` on PATH.
  ```
- names: `test:exec:fast`, `promptfooconfig-exec-fast.yaml`.
**Notes:** `git grep -F "runs both configs" tests` and `git grep -F "runs the exec test suite" tests` find no asserting test file at planning HEAD; the worker re-runs both greps.

**Acceptance criteria:**
- [ ] `task --list` shows `test:exec:fast`.
- [ ] Both READMEs name the fast tier and `task test:exec` for the full suites.
- [ ] Targeted run passes: `"^fast-tier:"`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Source-changing tasks add or update promptfoo cases (fixture-memo, script-runner, gh parity, review-consolidate, ship-summary-rounds (a)-(d), fast-tier); Task 4 keeps the C16 and apply assertions |
| no-ci-bypass | error | PASS | No CI check is skipped; no workflow runs an exec suite, and only the pre-push hook is narrowed, with the full suites kept via task test:exec |
| no-auto-eval | error | PASS | Only targeted filter-pattern runs and exec-only configs; the -j 4 trial is owner-run; no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Each task maps to a TK-001/002/003 acceptance item (Key Decision 7) |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; the clean-up batches follow one mechanical edit rule |
| scripts-over-llm-logic | error | PASS | All logic is in scripts (ship.js, review-consolidate.js, test runners); no LLM-instruction logic added |
| yagni | warning | PASS | hook-runner HOME copy and a changed-file tier are explicitly excluded |
| cross-skill-consistency | error | PASS | review-sdlc P11 and ship-sdlc R106/R108 change together; the R6 gate reader stays compatible via an optional schema field |
| pr-link-github-issue | error | PASS | Only internal register ids (W-H2, TK-xxx); no GitHub issue is claimed |
| dry | warning | PASS | One gh-stub core serves the binary and the preload; runCase is reused by APPLY_HARNESS |
| kiss | warning | PASS | A memo Map, a preload and one new config; more complex alternatives are rejected |
| spec-first | error | PASS | Task 9 (spec) precedes the code and doc Tasks 10-12; no SKILL.md behaviour change |
| project-agnostic | error | PASS | Key Decision 8 separates repo-local test infrastructure from the shipped plugin changes in Tasks 9-12 |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill flag gating is introduced |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate conditions are added or changed |
| flag-resolution-single-source | warning | PASS | No contractual flag is re-derived; concurrency is set in configs and -j is passed explicitly |
| state-premise | error | PASS | Context and Architecture name the root problem |
| smallest-viable-cut | warning | PASS | Key Decision 7 justifies the task set against the acceptance items |
| failure-audience | warning | PASS | Context names contributors, agents and ship users (R6 gate) |
| explicit-non-goals | warning | PASS | A Non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | Alternatives are recorded with rationale in Key Decisions 1-5 and the Deviations table |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is changed; R108 overwrites per run |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is added or changed |
| flag-semantic-consistency-cross-skill | error | PASS | --gh-subprocess is on a test runner script, not a skill prepare script |
| workspace-mode-compatibility | error | PASS | Task 11 states resolveStateDir() behaviour in branch and worktree modes; test-infra tasks use per-case temp dirs |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are modified |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 10 (`docs/skills/review-sdlc.md`) and Task 12 (`docs/skills/ship-sdlc.md`) document the new summary `findings` field and the `review-rounds-<branch-slug>.json` file, so the docs must match the changed contract.

**Severity hint:** high

**Patch:** Check that docs/skills/review-sdlc.md, docs/skills/ship-sdlc.md and their site copies state the new findings field and the review-rounds-<branch-slug>.json file.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that docs/skills/review-sdlc.md, docs/skills/ship-sdlc.md and their site copies state the new findings field and the review-rounds-<branch-slug>.json file.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 10 adds `findings` to `buildSummary` in `review-consolidate.js`, and Task 11 adds a `findings` field to `reviewRoundRecord` and a new `review-rounds-<slug>.json` file in `ship.js`, all of which change the file contract.

**Severity hint:** high

**Patch:** Check the new optional `findings` field in review-summary.json, the `findings` field in ship round records, and the new review-rounds-<slug>.json file for backward-compatible readers and the R6 gate.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new optional `findings` field in review-summary.json, the `findings` field in ship round records, and the new review-rounds-<slug>.json file for backward-compatible readers and the R6 gate.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: spec-compliance (B1)

**Why:** Task 9 modifies `docs/specs/review-sdlc.md` P11 and `docs/specs/ship-sdlc.md` R106 and adds R108 ("round findings file"), which defines a new file contract.

**Severity hint:** high

**Patch:** Check that the P11, R106 and new R108 text matches the implementation in review-consolidate.js and ship.js, with no renumbering and a byte-identical site copy.

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — Check that the P11, R106 and new R108 text matches the implementation in review-consolidate.js and ship.js, with no renumbering and a byte-identical site copy.

_4 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 TK-001 A1: memoised fixture build, in-process gh stub, drop wasted project_root, speed up C16 loop | Task 1, Task 3, Task 4, Task 5, Task 6, Task 7 | covered |
| 2 TK-001 A2: -j N safe; -j 1 default in maxConcurrency, docs, Taskfile, hook, CI; owner runs -j 4 trial | Task 2, Task 8, Task 13 | covered |
| 3 TK-002 A1: findings of every review round on disk incl. below-threshold | Task 9, Task 10, Task 11, Task 12 | covered |
| 4 TK-002 A2: lean ledger can record finding text (this repo provides data) | Task 11 | covered |
| 5 TK-003 A1: pre-push runs a fast exec tier, content stated in plan | Task 13, Task 14 | covered |
| 6 TK-003 A2: full exec configs still run on demand | Task 8, Task 14 | covered |
| 7 Out of scope: TK-020, other units, deferred lows, owner -j 4 trial | — | covered |
| 8 Ticket lines, Source line, spec-first, exec-only targeted runs per task | Task 1, Task 9, Task 13 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change

## Contract Examples

**code** (from Task 2):

```diff
 if (vars.script_home) {
   const home = path.isAbsolute(vars.script_home) ? vars.script_home : path.resolve(base, vars.script_home);
-  env.HOME = home;
+  const rel = path.relative(REPO_ROOT, home);
+  if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(home)) { /* copy to promptfoo-home-* */ } else env.HOME = home;
 }
```

**docs** (from Task 8): template `tests/promptfoo/README.md` `### Script execution tests`; audience: contributors and agents running the exec suite; sections touched: the intro paragraph, `#### Run`, `#### Case vars`; cross-link: `promptfooconfig-exec-fast.yaml` (Task 14).

**openspec** (from Task 9): MODIFY review-sdlc P11, MODIFY ship-sdlc R106, ADD ship-sdlc R108 (next free id after R107); no renumbering; delta text as rendered in Task 9.
