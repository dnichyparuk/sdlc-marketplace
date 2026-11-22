# W-E3 Test-tooling Hygiene Implementation Plan

**Commit:** `fix(W-E3): tests - test-tooling hygiene fixes`
**Goal:** Fix the test-tooling defects that the END audit found in unit W-E3, each with an exec test case.
**Architecture:** Seven independent tasks, one execute wave. Each task owns its scripts and datasets, so no file is shared between tasks. Every fix stays inside `tests/promptfoo/`; no plugin code, spec or skill changes.
**Source:** docs/plans/programme.md#W-E3
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- The test tooling under `tests/promptfoo/scripts/` has small defects.
- Some leave temporary folders behind when a step throws.
- Some lose the file name in an error message.
- One owner tool (`mutation-smoke.js`) can never report success.
- The in-process `gh` stub (a fake `gh` that answers inside the test process) breaks on one call form and throws where the real call returns an error.

**What prompted this change now?**

- The END audit (owner delegation 2026-11-21) listed these items as unit W-E3 in `docs/plans/programme.md`.
- W-F is done, so W-E3 is ready.

**What does success look like?**

- Each confirmed item is fixed.
- Each fix is covered by an exec case (a promptfoo case that runs a script, no model).
- The exec suites and the main-session validators stay green.

**Who is hurt if this ships wrong?** The owner and the agents that run the exec suites. A wrong change in a shared preload (`gh-inprocess.js`) or a wrapper breaks many exec cases at once, or hides a real failure behind a false pass. No plugin user is affected, because nothing outside `tests/promptfoo/` changes.

## Research Findings

All items were re-checked against HEAD `ccc7b53` (W-E2 merged). The discovery brief lists 27 findings; this section keeps the ones that shape the tasks.

**mutation-smoke.js (item 1).**

- `run()` writes `original.replace(m.find, ...)` without checking that `m.find` is present (`mutation-smoke.js:174-176`). A mutation that no longer applies is reported as a survivor (F-mutation-smoke-expected-survivor-semantics-1).
- The `execute-wave-committed-no-write` mutation is declared "expected to SURVIVE" (`:62`). But `ok` is `results.every(r => r.killed)` (`:190`). So `--run` can never report `ok: true` (F-mutation-smoke-expected-survivor-semantics-2).
- The temp path is `os.tmpdir() + '/mutation-smoke-'` (`:165`), not `path.join` (F-mutation-smoke-expected-survivor-semantics-3).
- `run()` checks an unknown `--only` id (`:164`). The main block already throws for it before `run()` is called (`:210-212`), so `:164` is dead code. Case (g) covers the live path (F-mutation-smoke-expected-survivor-semantics-4).
- No exec case runs `--run`; it starts promptfoo and is owner-only. A new read-only `--probe` mode is needed to test the new logic.

**Temp-dir hygiene (item 2).**

- `inTempDir` in `run-ship-prepare-plan-fields.js:109-115` removes its folder only when `body` returns. A throw leaks the folder. The `plan-commit-subject-unreadable` case body (`:175-182`) has the same shape (F-tempdir-hygiene-and-lint-error-handling-1).
- `run-jira-cache.js:54-109` has no `try/finally`. A throw leaks `tmp` and, in the `cache-dir` scenario, `outside` (`:83`). A missing `--home` makes `cpSync` throw after `mkdtempSync` ran (F-tempdir-hygiene-and-lint-error-handling-2).
- No shared temp-dir helper exists in `tests/promptfoo/scripts/` (F-tempdir-hygiene-and-lint-error-handling-5).

**Lint error handling (item 3).**

- `check-dataset-asserts.js:175` runs a bare `JSON.parse(...).entries`. A broken allowlist gives a message without the file name. A `null` file throws a `TypeError` (F-tempdir-hygiene-and-lint-error-handling-3).
- `check-spec-id-coverage.js:73` reads each exec config without a guard. A missing config gives a raw `ENOENT` message (F-tempdir-hygiene-and-lint-error-handling-4).
- `readBaseline` in `check-spec-id-coverage.js:143-150` already shows the guarded pattern to copy.
- Both lints have read-only self-test modes (`--probe`, `--probe-drop`) that build a temp tree. Those modes are the place to test the new error paths (F-tempdir-hygiene-and-lint-error-handling-6).

**gh-inprocess.js and run-fixture-memo.js (item 4).**

- `gh-inprocess.js:44` takes `(cmd, args, opts = {})`. Node also accepts `spawnSync(cmd, options)`. In that form the options land in `args`, and `answer()` gets an object as argv (F-gh-inprocess-and-fixture-memo-robustness-1).
- `answer()` (`gh-stub.js:198-222`) can throw, for example when `GH_STUB_DATA` names a missing scenario (`loadRoutes`, `gh-stub.js:150-154`). The real `spawnSync` of the stub binary returns status 1 instead (F-gh-inprocess-and-fixture-memo-robustness-2).
- `run-github-case.js --script <repo-relative path>` runs any target script with `gh-inprocess.js` preloaded. A small probe script can therefore test both forms.
- `run-fixture-memo.js:59` uses `Promise.all`. On the first rejection it returns, and the `finally` cleanup at `:177-179` runs while sibling builds still run and register new folders. Those folders leak (F-gh-inprocess-and-fixture-memo-robustness-3).
- The cleanup itself covers fresh and template builds: both register their folder (`extract-skill-content.js:22`, `:36-39`). So the `:178` item is fixed by waiting for every build; the cleanup line needs no change (F-gh-inprocess-and-fixture-memo-robustness-4).

**plugin.json version read (item 5).**

- `run-review-plugin-version.js:34-35` and `run-received-review-manifest-fields.js:63-64` each read `plugin.json` with a bare `JSON.parse` (F-plugin-json-version-shared-read-1, F-plugin-json-version-shared-read-2).
- `getPluginVersion()` in `lib/config-version.js:92-104` is the code under test, so the tests must not use it for the expected value (F-plugin-json-version-shared-read-3).
- Helpers in `tests/promptfoo/scripts/` are flat files; there is no `lib/` folder (F-plugin-json-version-shared-read-5).
- Cases: `review-prepare-exec.yaml:75-86` and `received-review-prepare-exec.yaml:49-70` (F-plugin-json-version-shared-read-6).

**Trivial batch (item 6).**

- `run-ship-prepare-ledger.js:63` is `process.exit(1)` for a missing repo root. Usage errors already exit 2 (`:46-48`). Every sibling wrapper uses the same split (`run-ship-prepare-plan-fields.js:63`, `run-ship-prepare-summary.js:56`). The item is not a defect: exit 1 is the convention for runtime errors and exit 2 for usage errors (F-trivial-batch-ledger-exit-and-deprecated-config-1).
- `fixtures-fs/version-no-tags/setup.sh:9-10` and `fixtures-fs/version-invalid-semver/setup.sh:9-10` write the deprecated `.claude/sdlc.json` (F-trivial-batch-ledger-exit-and-deprecated-config-2).
- A config without a numeric `schemaVersion` is treated as version 0 and migrated (`lib/config-version.js:248-266`). The current version is 4 (`lib/config-version.js:32`), so the moved file carries `"schemaVersion": 4` (F-trivial-batch-ledger-exit-and-deprecated-config-3).
- Only cases (f) and (g) of `version-prepare-exec.yaml:387-410` use these fixtures. Their assertions do not depend on the config path (F-trivial-batch-ledger-exit-and-deprecated-config-4).

**Floors and baselines.**

- `dataset-asserts-exec.yaml` case (a) asserts `r.datasets >= 81 && r.cases >= 1641`.
- `spec-id-coverage-exec.yaml` case (b) asserts `r.configs === 2 && r.datasets >= 81 && r.cases >= 1641 && r.asserts >= 2645`.
- This plan only adds cases and assertions, so every floor still holds. The `baselines/spec-id-coverage.json` gate fails only on drops, so no baseline refresh is needed.

**Build and test commands.**

- Exec targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Lints run directly: `node tests/promptfoo/scripts/check-dataset-asserts.js`, `node tests/promptfoo/scripts/check-spec-id-coverage.js`, `node tests/promptfoo/scripts/mutation-smoke.js --check`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Item 6a `run-ship-prepare-ledger.js:63` exit 2 | no | dropped | Not a defect: `:63` is the missing-repo-root runtime exit 1, usage already exits 2 (`:46-48`), and every sibling wrapper uses the same split (F-trivial-batch-ledger-exit-and-deprecated-config-1) |
| Item 4 cleanup `run-fixture-memo.js:178` | no | no edit to the cleanup line; fixed by waiting for every build (Task 5) | The cleanup already covers fresh and template folders; the leak came only from cleaning up before sibling builds finished |
| `mutation-smoke.js --probe` mode | no | adds a read-only self-test mode | `--run` starts promptfoo and is owner-only, so the new apply and verdict logic needs a mode an exec case can run (same pattern as `check-dataset-asserts.js --probe`) |
| `plugin-json-version.js` CLI | no | the new helper is also a small CLI (`--file <path>`) | The guarded-parse error path needs an exec case; a CLI over a broken fixture file tests it without touching the real `plugin.json` |
| `fixture-memo-probe/setup.sh` forced failure | no | fails only when `FIXTURE_MEMO_FAIL` is set | Gives a build that rejects for the `allSettled` case, while the owner's full `--scan` still builds it normally |
| Other unguarded temp-dir sites (brief F-tempdir-hygiene-and-lint-error-handling-5) | no | not changed | Not named in the W-E3 scope; the brief forbids deferred lows outside the scope |
| Spec or skill changes | no | none | Every change is test tooling; no skill behaviour changes, so no spec id applies |

### Decisions taken without the owner

- Item 6a dropped (row above).
- A missing exec config in `check-spec-id-coverage.js` fails with a clear error instead of being skipped (Key Decisions).
- No shared temp-dir helper (Key Decisions).
- Wrapper runtime failures (an unreadable `plugin.json`) exit 1; usage errors exit 2, matching the sibling wrappers.

## Key Decisions

- **Missing exec config fails, it is not skipped.** `check-dataset-asserts.js` skips a missing config. That is safe there, because its dataset floors catch a loss. In `check-spec-id-coverage.js`, a skip would let `--update` silently write a smaller baseline. So it throws `exec config not found: <path>`, and the top-level catch exits 2.

- **No shared temp-dir helper.** The two leak sites have different shapes: a callback in one file and a whole-script flow in the other. A local `try/finally` in each is simpler than a new module. Other leak sites are out of scope.

- **One shared plugin.json reader.** Both wrappers call a new flat module `tests/promptfoo/scripts/plugin-json-version.js`. It does not use `getPluginVersion()`, because that function is the code under test.

- **Expected survivors are data, not code.** A mutation gets `expectSurvive: true`. `ok` means every result has no error and was killed exactly when it was expected to be killed. So `--run` reports `ok: true` when every mutation behaves as declared.

- **A mutation that does not apply is an error, not a survivor.** `run()` records `error: 'find-missing'` and does not start promptfoo for it.

- **The in-process gh stub behaves like a crashed binary when `answer()` throws.** It returns status 1 with the message on stderr. That is what `spawnSync` returns when the stub binary itself throws.

- **One execute wave.** The seven tasks share no file, so they run in parallel (F-43).

## Contract Examples

**Code (Task 1):**

```markdown
**Contract:**
- shape (code): `applyMutation(text, m)` returns the mutated text, or `null` when `m.find` is absent;
  `verdict(results)` returns true when every result has no `error` and `killed === !expectSurvive`.
- names: `applyMutation`, `verdict`, `probe`, `expectSurvive`, `--probe`.
- mirror: the `probe()` self-test of `tests/promptfoo/scripts/check-dataset-asserts.js:186-215`.
- decisions: expected survivors are data (Key Decisions).
- sync: `tests/promptfoo/README.md` mutation-smoke section lists the modes.
- example: `verdict([{ killed: false, expectSurvive: true }])` → `true`.
```

## Tasks

### Task 1: mutation-smoke expected survivors, apply check and probe mode

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/mutation-smoke.js` — apply check, `expectSurvive`, verdict, `path.join`, remove dead `--only` check, add `--probe`
- Modify: `tests/promptfoo/datasets/mutation-smoke-exec.yaml` — extend case (b), add case (h); update the header comment on line 2 ("Only --list, --check and the refusals run here") to name `--probe`
- Modify: `tests/promptfoo/README.md` — mutation-smoke section: `--probe` command and the `ok` meaning

**Notes:** Findings F-mutation-smoke-expected-survivor-semantics-1 to -4. `--run` stays untested by exec cases (owner-only); `--probe` tests the same two functions `run()` uses. The README edit appends sentences and a command line; the existing sentence at README `:119` stays unchanged (no test asserts it; fragment grep of `prints the mutations` and `runs them` over `tests/` found only README itself and unrelated comments).

**Acceptance criteria:**
- [ ] `run()` calls `applyMutation`; a mutation whose `find` is absent gets `{ id, killed: false, expectSurvive, error: 'find-missing' }` and no promptfoo run
- [ ] `execute-wave-committed-no-write` carries `expectSurvive: true`; no other mutation does
- [ ] `run()` returns `{ ok: verdict(results), results }`; each result carries `expectSurvive`
- [ ] The temp folder is made with `fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-smoke-'))`
- [ ] The `todo.length === 0` branch in `run()` is removed; case (g) still passes
- [ ] `--list` prints `expectSurvive` (boolean) for every mutation
- [ ] `--probe` prints `{"applied":true,"notApplied":true,"expectedOutcomes":true,"unexpectedSurvivor":false,"unexpectedKill":false,"findMissing":false}` and exits 0, with no `--owner` needed and no promptfoo start
- [ ] The usage line reads `Usage: mutation-smoke.js (--list | --check | --probe | --run --owner [--only <id>])`
- [ ] Case (b) also asserts that exactly one mutation, `execute-wave-committed-no-write`, has `expectSurvive: true`
- [ ] New case (h) asserts the `--probe` output above
- [ ] `node tests/promptfoo/scripts/mutation-smoke.js --check` prints `"ok":true`
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'mutation-smoke'` passes (8 cases, +1)

**Contract:**
- shape (code): changes in `mutation-smoke.js`:

  ```diff
     dataset: SD + 'state-gc-migrate-exec.yaml',
     filter: 'wave-committed',
  +  expectSurvive: true,
     why: 'the matched cases check exit paths and error text; ...',
  ```

  ```diff
  +// The mutated text, or null when m.find is not in text (the mutation does not apply).
  +function applyMutation(text, m) {
  +  return text.includes(m.find) ? text.replace(m.find, () => m.replace) : null;
  +}
  +
  +// True when no result has an error and each was killed exactly when it was not expected to survive.
  +function verdict(results) {
  +  return results.every(r => !r.error && r.killed === !r.expectSurvive);
  +}
  +
   function run(only) {
     const todo = only ? MUTATIONS.filter(m => m.id === only) : MUTATIONS;
  -  if (todo.length === 0) return { ok: false, results: [], error: `unknown --only id: ${only}` };
  -  const copy = fs.mkdtempSync(os.tmpdir() + '/mutation-smoke-');
  +  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'mutation-smoke-'));
     ...
       for (const m of todo) {
         const target = path.join(copy, m.file);
         const original = fs.readFileSync(target, 'utf8');
  -      fs.writeFileSync(target, original.replace(m.find, () => m.replace));
  +      const expectSurvive = Boolean(m.expectSurvive);
  +      const mutated = applyMutation(original, m);
  +      if (mutated === null) {
  +        results.push({ id: m.id, killed: false, expectSurvive, error: 'find-missing' });
  +        continue;
  +      }
  +      fs.writeFileSync(target, mutated);
         ...
  -          results.push({ id: m.id, killed: false, exitCode: r.status, error: ... });
  +          results.push({ id: m.id, killed: false, expectSurvive, exitCode: r.status, error: ... });
         } else {
  -          results.push({ id: m.id, killed: r.status !== 0, exitCode: r.status });
  +          results.push({ id: m.id, killed: r.status !== 0, expectSurvive, exitCode: r.status });
     ...
  -    return { ok: results.every(r => r.killed), results };
  +    return { ok: verdict(results), results };
  ```

  `probe()` (read-only, pure):

  ```js
  function probe() {
    const m = { find: 'a', replace: 'b' };
    const r = (killed, expectSurvive, error) => ({ id: 'probe', killed, expectSurvive, ...(error ? { error } : {}) });
    return {
      applied: applyMutation('xay', m) === 'xby',
      notApplied: applyMutation('xyz', m) === null,
      expectedOutcomes: verdict([r(true, false), r(false, true)]),
      unexpectedSurvivor: verdict([r(false, false)]),
      unexpectedKill: verdict([r(true, true)]),
      findMissing: verdict([r(false, true, 'find-missing')]),
    };
  }
  ```

  Main block: `--list` maps `({ id, file, dataset, filter, expectSurvive }) => ({ id, file, dataset, filter, expectSurvive: Boolean(expectSurvive) })`; a new `else if (argv.includes('--probe')) result = probe();` branch sits before `--run`; the header comment `Modes:` list gains `--probe  self-test of the apply check and the verdict (read-only, no promptfoo)`.

  | Mode | stdout | exit |
  |---|---|---|
  | `--probe` | the probe JSON line | 0 |
  | no mode | nothing (Usage on stderr) | 2 |

- names: `applyMutation`, `verdict`, `probe`, `expectSurvive`, `--probe`, case description `mutation-smoke: (h) --probe proves the apply check and the expected-survivor verdict`.
- mirror: `probe()` in `tests/promptfoo/scripts/check-dataset-asserts.js:186-215`; case shape of `mutation-smoke-exec.yaml:12-18` (case b).
- decisions: expected survivors are data; a non-applying mutation is an error (Key Decisions).
- sync: `tests/promptfoo/README.md:113-119` gains `node tests/promptfoo/scripts/mutation-smoke.js --probe` in the command block and the sentences "`--probe` runs a read-only self-test of the apply check and the verdict. `--run` reports `ok: true` when every mutation is killed, except the ones marked `expectSurvive`, which must survive; a mutation that no longer applies is an error."
- example: case (h):

  ```yaml
  - description: "mutation-smoke: (h) --probe proves the apply check and the expected-survivor verdict"
    vars:
      script_path: "repo://tests/promptfoo/scripts/mutation-smoke.js"
      script_args: "--probe"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.applied === true && r.notApplied === true && r.expectedOutcomes === true && r.unexpectedSurvivor === false && r.unexpectedKill === false && r.findMissing === false"
  ```

### Task 2: Temp-dir cleanup on throw in two wrappers

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-ship-prepare-plan-fields.js` — `inTempDir` and `plan-commit-subject-unreadable` remove their folder in `finally`
- Modify: `tests/promptfoo/scripts/run-jira-cache.js` — `--home` existence check before `mkdtempSync`; `tmp` and `outside` removed in `finally`
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — add one usage-error case

**Notes:** Findings F-tempdir-hygiene-and-lint-error-handling-1, -2 and -5. A throw inside a case body cannot be forced from a dataset case without fault injection, so the 20 plan-fields cases and the 5 jira-cache cases are the regression check; the new case proves the `--home` check runs before any folder is made. Output bytes of every existing case stay the same.

**Acceptance criteria:**
- [ ] `inTempDir` removes `tmpDir` in a `finally` and prints only when `body` returned
- [ ] `plan-commit-subject-unreadable` restores the mode and removes `tmpDir` in a `finally`
- [ ] `run-jira-cache.js` exits 2 with `run-jira-cache: --home not found: <path>` on stderr and nothing on stdout when `--home` does not exist, before `mkdtempSync`
- [ ] `run-jira-cache.js` removes `tmp` and, when made, `outside` in a `finally`
- [ ] New case "jira-cache: a missing --home exits 2 before any temp folder is made" asserts exit 2 and the stderr text
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'jira-cache|ship-prepare|ship-fix|ship-fwd|ship-bump|ship-stage-sdlc'` passes

**Contract:**
- shape (code):

  ```diff
   function inTempDir(prefix, body) {
  -  const tmpDir = fs.mkdtempSync(os.tmpdir() + '/' + prefix);
  -  const result = body(tmpDir);
  -  fs.rmSync(tmpDir, { recursive: true, force: true });
  -  print(result);
  +  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  +  let result;
  +  try {
  +    result = body(tmpDir);
  +  } finally {
  +    fs.rmSync(tmpDir, { recursive: true, force: true });
  +  }
  +  print(result);
   }
  ```

  ```diff
       const tmpDir = fs.mkdtempSync(os.tmpdir() + '/ship-commit-');
       const plan = tmpDir + '/plan.md';
  -    fs.writeFileSync(plan, `# Plan\n\n${DOCS_COMMIT}\n`);
  -    fs.chmodSync(plan, 0);
  -    const result = statusReport(ship(['--has-plan', '--plan', plan]));
  -    fs.chmodSync(plan, 0o644);
  -    fs.rmSync(tmpDir, { recursive: true, force: true });
  +    let result;
  +    try {
  +      fs.writeFileSync(plan, `# Plan\n\n${DOCS_COMMIT}\n`);
  +      fs.chmodSync(plan, 0);
  +      result = statusReport(ship(['--has-plan', '--plan', plan]));
  +    } finally {
  +      if (fs.existsSync(plan)) fs.chmodSync(plan, 0o644);
  +      fs.rmSync(tmpDir, { recursive: true, force: true });
  +    }
       print(result);
  ```

  `run-jira-cache.js` flow after the argument checks:

  ```diff
   if (!project) usage('--project is required');
  +if (!fs.existsSync(path.resolve(home))) usage(`--home not found: ${home}`);

   const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-cache-wrap-'));
  -fs.cpSync(path.resolve(home), tmp, { recursive: true });
  +let outside = null;
  +try {
  +  fs.cpSync(path.resolve(home), tmp, { recursive: true });
     ... calls, switch (the cache-dir case assigns `outside = fs.mkdtempSync(...)` and drops its own rmSync) ...
  +  const files = {};
  +  for (const rel of checks) files[rel] = fs.existsSync(path.join(tmp, rel));
  +  console.log(JSON.stringify({ scenario, calls, files }));
  +} finally {
  +  fs.rmSync(tmp, { recursive: true, force: true });
  +  if (outside) fs.rmSync(outside, { recursive: true, force: true });
  +}
  ```

  | Condition | stdout | stderr | exit |
  |---|---|---|---|
  | `--home` path does not exist | nothing | `run-jira-cache: --home not found: <path>` | 2 |
  | a call or copy throws | nothing | node error | non-zero; `tmp` and `outside` removed |

- names: `inTempDir`, `outside`, case description `jira-cache: a missing --home exits 2 before any temp folder is made`.
- mirror: `try/finally` in `check-spec-id-coverage.js:169-202` (`probeDrop`); case shape `jira-sdlc-exec.yaml:615-630`.
- decisions: local `try/finally`, no shared helper (Key Decisions).
- sync: the header comment of `run-jira-cache.js:19-20` adds "a --home that does not exist" to the usage-error list.
- example: case

  ```yaml
  - description: "jira-cache: a missing --home exits 2 before any temp folder is made"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-jira-cache.js"
      script_args: "--scenario clear --home /nonexistent-jira-home --project SAVETEST"
      script_show_exit: true
    assert:
      - type: javascript
        value: "context.metadata.exitCode === 2"
      - type: contains
        value: "--home not found: /nonexistent-jira-home"
  ```

### Task 3: Guarded reads in the two exec lints

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-dataset-asserts.js` — guarded allowlist parse; `--probe` reports an unreadable allowlist
- Modify: `tests/promptfoo/scripts/check-spec-id-coverage.js` — exec config existence check; `--probe-drop` reports a missing config
- Modify: `tests/promptfoo/datasets/dataset-asserts-exec.yaml` — extend case (b)
- Modify: `tests/promptfoo/datasets/spec-id-coverage-exec.yaml` — extend case (c)

**Notes:** Findings F-tempdir-hygiene-and-lint-error-handling-3, -4 and -6. The new checks go into the existing self-test modes, so no new flag and no new case is needed; each extended case keeps its single `javascript` assertion (assertion counts unchanged, no baseline drop). The failure decision is in Key Decisions.

**Acceptance criteria:**
- [ ] `readAllowlist` throws `allowlist unreadable: <file>: <parse message>` for invalid JSON, and `allowlist has no entries array: <file>` for `null` or a missing `entries`
- [ ] `--probe` output gains `unreadable`: the message `readAllowlist` throws for a probe allowlist holding `null` (starts with `allowlist has no entries array:`) and `invalid`: the message for `{` (starts with `allowlist unreadable:`)
- [ ] `scanCoverage` throws `exec config not found: <path>` when an `EXEC_CONFIGS` file is missing
- [ ] `--probe-drop` output gains `missingConfig`: the message `scanCoverage` throws after the probe removes its `promptfooconfig-exec.yaml` (starts with `exec config not found:`)
- [ ] `dataset-asserts` case (b) and `spec-id-coverage` case (c) also assert the new fields
- [ ] `node tests/promptfoo/scripts/check-dataset-asserts.js` and `node tests/promptfoo/scripts/check-spec-id-coverage.js` still print `"ok":true`
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'dataset-asserts|spec-id-coverage'` passes

**Contract:**
- shape (code):

  ```diff
   function readAllowlist(file) {
     if (!fs.existsSync(file)) throw new Error(`allowlist not found: ${file}; run with --update`);
  -  const entries = JSON.parse(fs.readFileSync(file, 'utf8')).entries;
  +  let data;
  +  try {
  +    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  +  } catch (err) {
  +    throw new Error(`allowlist unreadable: ${file}: ${err.message}`);
  +  }
  +  const entries = data && data.entries;
     if (!Array.isArray(entries)) throw new Error(`allowlist has no entries array: ${file}`);
     return entries;
   }
  ```

  ```diff
     for (const config of EXEC_CONFIGS) {
  -    for (const line of fs.readFileSync(path.join(promptfooDir, config), 'utf8').split('\n')) {
  +    const configFile = path.join(promptfooDir, config);
  +    if (!fs.existsSync(configFile)) throw new Error(`exec config not found: ${configFile}`);
  +    for (const line of fs.readFileSync(configFile, 'utf8').split('\n')) {
  ```

  Probe additions (inside each probe's existing `try`, before its `finally`):

  ```js
  // check-dataset-asserts.js probe()
  const caught = (fn) => { try { fn(); return null; } catch (err) { return err.message; } };
  fs.writeFileSync(path.join(root, 'baselines/null.json'), 'null');
  fs.writeFileSync(path.join(root, 'baselines/invalid.json'), '{');
  const extra = {
    unreadable: caught(() => readAllowlist(path.join(root, 'baselines/null.json'))),
    invalid: caught(() => readAllowlist(path.join(root, 'baselines/invalid.json'))),
  };
  return { ...summary(lintDatasets(root), readAllowlist(allowFile)), ...extra };

  // check-spec-id-coverage.js probeDrop(): after `current` and the drops are computed
  fs.rmSync(path.join(root, 'promptfooconfig-exec.yaml'));
  const missingConfig = (() => { try { scanCoverage(root); return null; } catch (err) { return err.message; } })();
  return { ...summary(current, compareCoverage(readBaseline(baselineFile), current)), missingConfig };
  ```

  | Condition | message | exit (top-level catch) |
  |---|---|---|
  | allowlist is not JSON | `allowlist unreadable: <file>: <parse message>` | 2 |
  | allowlist is `null` or has no `entries` array | `allowlist has no entries array: <file>` | 2 |
  | an exec config is missing | `exec config not found: <path>` | 2 |

- names: `readAllowlist`, `scanCoverage`, probe fields `unreadable`, `invalid`, `missingConfig`.
- mirror: `readBaseline` in `check-spec-id-coverage.js:143-150`.
- decisions: a missing config fails (Key Decisions).
- sync: the threat-model comment of `check-spec-id-coverage.js:18-28` adds "a missing exec config is an error, not skipped"; the `--probe` comment of `check-dataset-asserts.js:32-34` adds "and that an unreadable allowlist names its file".
- example: case (b) assertion becomes `... && r.stale.length === 1 && r.unreadable.startsWith('allowlist has no entries array:') && r.invalid.startsWith('allowlist unreadable:')`; case (c) gains `&& r.missingConfig.startsWith('exec config not found:')`.

### Task 4: gh-inprocess call forms and answer errors

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/gh-inprocess.js` — normalise the `(cmd, options)` form; catch `answer()` errors
- Create: `tests/promptfoo/scripts/gh-inprocess-forms.js` — probe target script for the in-process stub
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — add one case in the in-process section

**Notes:** Findings F-gh-inprocess-and-fixture-memo-robustness-1 and -2. Medium risk because every github-sdlc exec case runs through this preload; the change is limited to the two new branches, and the regression check is the filter `github-sdlc|mcp-failure`: `grep -l run-github-case.js tests/promptfoo/datasets/*` lists exactly `github-sdlc-exec.yaml` and `mcp-failure-github-exec.yaml`, and the second dataset's cases do not match `github-sdlc` alone. The new case follows C17 (stub bin, home, `SDLC_LINKS_OFFLINE`).

**Acceptance criteria:**
- [ ] `spawnSync('gh', { encoding: 'utf8' })` through the preload is answered by the stub with `args = []` and honours the options (string stdout)
- [ ] When `answer()` throws, the preload returns `{ status: 1, stdout: '', stderr: 'gh-inprocess: <message>\n', signal: null, ... }` instead of throwing
- [ ] `gh-inprocess-forms.js` with no arguments prints one JSON line `{ optionsForm: { status, stdoutType }, answerThrows: { status, stderr } }` and exits 0; any argument exits 2 with `gh-inprocess-forms: unexpected argument: <arg>` on stderr and nothing on stdout
- [ ] New case asserts `optionsForm.stdoutType === 'string'`, `optionsForm.status === 1` (unmatched route), `answerThrows.status === 1` and `answerThrows.stderr` starts with `gh-inprocess:`
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'github-sdlc|mcp-failure'` passes

**Contract:**
- shape (code):

  ```diff
   cp.spawnSync = function spawnSync(cmd, args, opts = {}) {
  +  if (args !== null && args !== undefined && !Array.isArray(args) && typeof args === 'object') {
  +    opts = args; // spawnSync(cmd, options)
  +    args = [];
  +  }
  +  opts = opts || {};
     const env = opts.env || process.env;
     if (cmd !== 'gh' || firstGhOnPath(env.PATH) !== STUB_GH) return real.apply(this, arguments);
  -  const r = answer(args || [], env, opts.input);
  +  let r;
  +  try {
  +    r = answer(args || [], env, opts.input);
  +  } catch (err) {
  +    // The stub binary would crash with exit 1; return that instead of throwing into the caller.
  +    return result({ stdout: '', stderr: `gh-inprocess: ${err.message}\n`, status: 1 }, opts.encoding);
  +  }
     if (opts.timeout && r.sleepMs >= opts.timeout) return timedOut(args || [], opts.encoding);
  ```

  `gh-inprocess-forms.js` (new, `'use strict'`, header comment naming its runner `run-github-case.js --script`):

  ```js
  const cp = require('child_process');
  const extra = process.argv.slice(2);
  if (extra.length) { process.stderr.write(`gh-inprocess-forms: unexpected argument: ${extra[0]}\n`); process.exit(2); }
  const a = cp.spawnSync('gh', { encoding: 'utf8' });
  const b = cp.spawnSync('gh', ['issue', 'list'], { encoding: 'utf8', env: { ...process.env, GH_STUB_DATA: 'no-such-scenario' } });
  process.stdout.write(JSON.stringify({
    optionsForm: { status: a.status, stdoutType: typeof a.stdout },
    answerThrows: { status: b.status, stderr: b.stderr },
  }) + '\n');
  ```

  | Call | before | after |
  |---|---|---|
  | `spawnSync('gh', { encoding })` | `answer()` gets an object as argv and throws | stub answers `[]` (unmatched, status 1), string stdout |
  | `answer()` throws | exception reaches the caller | `{ status: 1, stderr: 'gh-inprocess: …' }` |

- names: `gh-inprocess-forms.js`, case description `github-sdlc/stub: in-process gh takes the options-only call form and turns a stub error into status 1`.
- mirror: `result()` in `gh-inprocess.js:38-42`; case shape `github-sdlc-exec.yaml:12-25`.
- decisions: a thrown `answer()` maps to a crashed-binary result (Key Decisions).
- sync: the header comment of `gh-inprocess.js:2-8` adds "Both spawnSync(cmd, args, options) and spawnSync(cmd, options) are handled; an error inside the stub returns status 1 with the message on stderr."
- example: case

  ```yaml
  - description: "github-sdlc/stub: in-process gh takes the options-only call form and turns a stub error into status 1"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-github-case.js"
      script_args: "--no-git --script tests/promptfoo/scripts/gh-inprocess-forms.js"
      script_stub_bin: "fixtures-fs/stub-bin-gh-issues/bin"
      script_home: "fixtures-fs/stub-bin-gh-issues"
      script_env: '{"SDLC_LINKS_OFFLINE": "1", "GH_TOKEN": ""}'
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          const j = o.json;
          const ok = o.exit === 0 && j && j.optionsForm.stdoutType === 'string' && j.optionsForm.status === 1
            && j.answerThrows.status === 1 && j.answerThrows.stderr.startsWith('gh-inprocess:');
          return ok ? true : `FAIL ${output}`;
  ```

### Task 5: run-fixture-memo waits for every build before cleanup

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-fixture-memo.js` — `Promise.allSettled` in `runFixture`, one error naming the failed count
- Modify: `tests/promptfoo/fixtures-fs/fixture-memo-probe/setup.sh` — fail when `FIXTURE_MEMO_FAIL` is set
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — add case fixture-memo (e)

**Notes:** Findings F-gh-inprocess-and-fixture-memo-robustness-3 and -4. The forced failure is opt-in, so cases (a) and (c) and the owner's `--scan` still build the fixture normally. The failure line sits after `set -e`, and the fixture runs no git, so the #9161 guard rule does not apply.

**Acceptance criteria:**
- [ ] `runFixture` awaits `Promise.allSettled` for the case builds; when any rejects it throws `Error('<failed> of <cases> builds failed: <first reason message>')`
- [ ] The templates read (`:62`) also uses `Promise.allSettled` and maps a rejected template to `null`
- [ ] `fixture-memo-probe/setup.sh` exits 3 with `fixture-memo-probe: forced failure` on stderr when `FIXTURE_MEMO_FAIL` is set, and is unchanged otherwise
- [ ] New case (e) runs `--fixture fixture-memo-probe --cases 3` with `FIXTURE_MEMO_FAIL=1` and asserts exit 2 and `3 of 3 builds failed`
- [ ] Cases (a) to (d) still pass
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'fixture-memo'` passes (5 cases, +1)

**Contract:**
- shape (code):

  ```diff
   async function runFixture(name, cases) {
  -  const results = await Promise.all(Array.from({ length: cases }, () => transformVars(caseVars(name))));
  +  // Wait for every build: an early return would let the cleanup run while sibling builds still register folders.
  +  const settled = await Promise.allSettled(Array.from({ length: cases }, () => transformVars(caseVars(name))));
  +  const failed = settled.filter((s) => s.status === 'rejected');
  +  if (failed.length) throw new Error(`${failed.length} of ${cases} builds failed: ${failed[0].reason.message}`);
  +  const results = settled.map((s) => s.value);
     const roots = results.map((r) => r.project_root);
     ...
  -  const templates = await Promise.all([...(globalThis.__sdlcFixtureTemplates ?? new Map()).values()]);
  +  const templates = (await Promise.allSettled([...(globalThis.__sdlcFixtureTemplates ?? new Map()).values()]))
  +    .map((s) => (s.status === 'fulfilled' ? s.value : null));
  ```

  ```diff
   set -e
  +if [ -n "${FIXTURE_MEMO_FAIL+x}" ]; then echo "fixture-memo-probe: forced failure" >&2; exit 3; fi
   od -An -N8 -tx1 /dev/urandom | tr -d ' \n' > build-id
  ```

  | Condition | stdout | stderr | exit |
  |---|---|---|---|
  | every build succeeds | result JSON | cleanup line | 0 |
  | k of n builds reject | nothing | `run-fixture-memo: Error: k of n builds failed: …` | 2 (existing `main().catch`) |

- names: `runFixture`, `FIXTURE_MEMO_FAIL`, case description `fixture-memo: (e) a failing build is reported after every build settled`.
- mirror: `scan()` error collection in `run-fixture-memo.js:141-161`; case shape `fixture-guard-exec.yaml:52-58`.
- decisions: cleanup line unchanged (Deviations row).
- sync: the header comment of `fixture-memo-probe/setup.sh:2` adds "and case e (FIXTURE_MEMO_FAIL forces a failure)"; the usage comment of `run-fixture-memo.js:7-9` adds "A failed build exits 2 after every build settled."
- example: case

  ```yaml
  - description: "fixture-memo: (e) a failing build is reported after every build settled"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-fixture-memo.js"
      script_args: "--fixture fixture-memo-probe --cases 3"
      script_env: '{"FIXTURE_MEMO_FAIL": "1"}'
      script_show_exit: true
    assert:
      - type: javascript
        value: "context.metadata.exitCode === 2"
      - type: contains
        value: "3 of 3 builds failed"
  ```

### Task 6: Shared guarded plugin.json version read

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/plugin-json-version.js` — `readPluginJsonVersion(file)` and a small CLI
- Create: `tests/promptfoo/fixtures-fs/plugin-json-bad/plugin.json` — truncated JSON for the error case
- Modify: `tests/promptfoo/scripts/run-review-plugin-version.js` — use the helper; exit 1 with a message on failure
- Modify: `tests/promptfoo/scripts/run-received-review-manifest-fields.js` — use the helper in `emitField`; exit 1 with a message on failure
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — add two helper cases

**Notes:** Findings F-plugin-json-version-shared-read-1 to -6. The helper must not call `getPluginVersion()` (it is the code under test). Runtime failures exit 1 and usage errors exit 2, as in the sibling wrappers. The three existing plugin_version cases (`review-prepare-exec.yaml:75`, `received-review-prepare-exec.yaml:49`, `:62`) are the regression check; their output bytes stay the same.

**Acceptance criteria:**
- [ ] `readPluginJsonVersion()` returns the `version` string of `plugins/sdlc-utilities/.claude-plugin/plugin.json`
- [ ] It throws `plugin.json unreadable: <file>: <reason>` on a read or parse failure, and `plugin.json has no string version: <file>` when `version` is not a string
- [ ] Both wrappers use it; neither reads `plugin.json` itself; on a thrown error each prints `<script name>: <message>` on stderr, nothing on stdout, and exits 1
- [ ] CLI: `node plugin-json-version.js [--file <path>]` prints `{"version":"<v>"}` and exits 0; an unreadable file exits 1 with the message on stderr; `--file` without a value or an unknown flag exits 2 with `plugin-json-version: <reason>` on stderr and nothing on stdout
- [ ] Two new cases: the real file gives a semver `version`; the bad fixture exits 1 with `plugin.json unreadable:`
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'plugin_version|reply_footer|plugin-json-version|hardenSurfaceHint'` passes

**Contract:**
- shape (code): new module

  ```js
  'use strict';
  // Reads the version of the plugin manifest for the exec cases that compare it with getPluginVersion().
  // It never calls getPluginVersion(): that function is the code under test.
  // CLI: node plugin-json-version.js [--file <path>]
  const fs = require('fs');
  const path = require('path');
  const PLUGIN_JSON = path.resolve(__dirname, '..', '..', '..', 'plugins', 'sdlc-utilities', '.claude-plugin', 'plugin.json');

  function readPluginJsonVersion(file = PLUGIN_JSON) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`plugin.json unreadable: ${file}: ${err.message}`);
    }
    if (!data || typeof data.version !== 'string') throw new Error(`plugin.json has no string version: ${file}`);
    return data.version;
  }

  module.exports = { PLUGIN_JSON, readPluginJsonVersion };
  // require.main === module: parse --file (exit 2 on a usage error), print {"version":...} or exit 1 with the message.
  ```

  Caller change (same shape in both wrappers):

  ```diff
  -const pluginJsonPath = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', '.claude-plugin', 'plugin.json');
  -const expected = JSON.parse(require('fs').readFileSync(pluginJsonPath, 'utf8')).version;
  +let expected;
  +try {
  +  expected = readPluginJsonVersion();
  +} catch (err) {
  +  process.stderr.write(`run-review-plugin-version: ${err.message}\n`);
  +  process.exit(1);
  +}
  ```

  | Condition | stdout | stderr | exit |
  |---|---|---|---|
  | CLI, readable file | `{"version":"<v>"}` | nothing | 0 |
  | CLI, unreadable or invalid file | nothing | `plugin.json unreadable: …` or `plugin.json has no string version: …` | 1 |
  | CLI, `--file` without a value, unknown flag | nothing | `plugin-json-version: <reason>` | 2 |

  Fixture `plugin-json-bad/plugin.json` holds exactly `{ "version": ` (truncated JSON).
- names: `readPluginJsonVersion`, `PLUGIN_JSON`, `plugin-json-version.js`, case descriptions `plugin-json-version: reads the version of the real plugin.json` and `plugin-json-version: an unreadable plugin.json exits 1 and names the file`.
- mirror: `readBaseline` in `check-spec-id-coverage.js:143-150`; case shape `review-prepare-exec.yaml:75-86`.
- decisions: one shared reader that avoids the code under test (Key Decisions).
- sync: the header comments of both wrappers say the expected value comes from `plugin-json-version.js`.
- example: cases

  ```yaml
  - description: "plugin-json-version: reads the version of the real plugin.json"
    vars:
      script_path: "repo://tests/promptfoo/scripts/plugin-json-version.js"
    assert:
      - type: javascript
        value: "/^[0-9]+\\.[0-9]+\\.[0-9]+(-[A-Za-z0-9.-]+)?$/.test(JSON.parse(output.split('\\n')[0]).version)"

  - description: "plugin-json-version: an unreadable plugin.json exits 1 and names the file"
    vars:
      script_path: "repo://tests/promptfoo/scripts/plugin-json-version.js"
      project_root: "file://fixtures-fs/plugin-json-bad"
      script_args: "--file {{project_root}}/plugin.json"
      script_show_exit: true
    assert:
      - type: javascript
        value: "context.metadata.exitCode === 1"
      - type: contains
        value: "plugin.json unreadable:"
  ```

### Task 7: Version fixtures write .sdlc/config.json

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/version-no-tags/setup.sh` — write `.sdlc/config.json` with `schemaVersion` 4
- Modify: `tests/promptfoo/fixtures-fs/version-invalid-semver/setup.sh` — same

**Notes:** `.claude/sdlc.json` is the deprecated legacy path; `schemaVersion` 4 avoids the v0 migration path (F-trivial-batch-ledger-exit-and-deprecated-config-2, -3).

**Acceptance criteria:**
- [ ] Both scripts run `mkdir -p .sdlc` and write `.sdlc/config.json` holding `"schemaVersion": 4` plus the unchanged `version` block; neither writes `.claude/`
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'version-errors'` passes, cases (f) and (g) included

**Contract:** shape (code): `mkdir -p .claude` + `cat > .claude/sdlc.json` → `mkdir -p .sdlc` + `cat > .sdlc/config.json` with `{ "schemaVersion": 4, "version": { … } }`; names: `.sdlc/config.json`, `schemaVersion`; sync: `version-prepare-exec.yaml:387-410` cases (f), (g) unchanged

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1 and 3-6 add or extend exec cases; Task 2 relies on the 20 plan-fields and 5 jira-cache regression cases plus one new case; Task 7 is covered by existing cases (f) and (g) |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only exec-only config with targeted --filter-pattern runs; no retry loops |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the W-E3 items; deviations are listed |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable theme |
| scripts-over-llm-logic | error | PASS | Deterministic test-script changes only; no skill instructions |
| yagni | warning | PASS | The new --probe mode and plugin-json-version CLI are justified by the need to test new logic |
| cross-skill-consistency | error | PASS | No skill behaviour changes |
| pr-link-github-issue | error | PASS | Only internal W-E3 register ids are used; no GitHub issue |
| dry | warning | PASS | Shared plugin.json reader replaces two copies; the no-shared-temp-helper choice is justified in Key Decisions |
| kiss | warning | PASS | Local try/finally and small helpers |
| spec-first | error | PASS | No SKILL.md changes; the plan states that no spec applies |
| project-agnostic | error | PASS | Changes are confined to the repo's own test tooling; no plugin or consumer behaviour is affected |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill dispatch |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates |
| flag-resolution-single-source | warning | PASS | No contractual flags are added |
| state-premise | error | PASS | Context states the problem: small defects in the test tooling |
| smallest-viable-cut | warning | PASS | Seven independent items from the programme; the dropped item and deviations are justified |
| failure-audience | warning | PASS | Context names who is hurt if the change ships wrong: the owner and agents running the exec suites (fixed after the Step 5 review) |
| explicit-non-goals | warning | PASS | The Deviations table lists excluded items (6a, other temp-dir sites, spec or skill changes) |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in Key Decisions with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified; Task 7 only changes fixtures |
| agent-dispatch-script-driven | error | PASS | No agent dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | --probe is added to a test tool, not a plugins/*/scripts/skill prepare script |
| workspace-mode-compatibility | error | PASS | Test tooling only; no state, config or plugin cwd logic |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are touched |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B4)

**Why:** Task 1 adds a `--probe` flag with the usage line `(--list | --check | --probe | --run ...)`, Task 5 adds the `FIXTURE_MEMO_FAIL` env var, and Task 6 adds a `plugin-json-version.js` CLI and module imported by two wrappers.

**Severity hint:** high

**Patch:** Check the new CLI and env contracts (`mutation-smoke.js --probe` and its usage line, the `FIXTURE_MEMO_FAIL` env var, the `plugin-json-version.js --file` exit codes) and the new `plugin-json-version.js` module that both wrappers now require.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new CLI and env contracts (`mutation-smoke.js --probe` and its usage line, the `FIXTURE_MEMO_FAIL` env var, the `plugin-json-version.js --file` exit codes) and the new `plugin-json-version.js` module that both wrappers now require.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-7 edit `tests/promptfoo/datasets/*.yaml`, such as `mutation-smoke-exec.yaml` in Task 1 and `review-prepare-exec.yaml` in Task 6, plus `fixtures-fs` files that the dimension's current triggers miss.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

### CREATE: documentation-quality-review

**Why:** Task 1 modifies `tests/promptfoo/README.md` to add the `--probe` command and the new `ok` meaning, and no covered dimension reviews that file.

**Severity hint:** low

**Triggers:** `tests/promptfoo/README.md`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `tests/promptfoo/README.md`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 1 | 0 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 mutation-smoke.js: verify mutation applied, expected-survivor semantics, path.join temp path, remove unreachable --only path | Task 1 | covered |
| 2 Temp-dir hygiene: run-ship-prepare-plan-fields.js inTempDir leak; run-jira-cache.js | Task 2 | covered |
| 3 Lint error handling: check-dataset-asserts.js bare JSON.parse; check-spec-id-coverage.js readFileSync guard | Task 3 | covered |
| 4 gh-inprocess.js spawnSync form and answer() throw; run-fixture-memo.js allSettled and cleanup | Task 4, Task 5 | covered |
| 5 Shared plugin.json version read with guarded parse for the two wrappers | Task 6 | covered |
| 6 Trivial batch: ledger exit 2 (re-verify, drop if not reproduced); version fixtures move to .sdlc/config.json | Task 7 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

- `mutation-smoke.js --run` reports `ok: true` when every mutation behaves as declared. A mutation that no longer applies shows as an error. A read-only `--probe` mode proves both rules in the exec suite.

- The plan-fields and jira-cache wrappers remove their temp folders even when a step throws.

- The two exec lints name the broken file in their error messages. A missing exec config fails the coverage gate instead of shrinking it.

- The in-process `gh` stub handles every `spawnSync` call form and never throws into the script under test.

- `run-fixture-memo.js` waits for every build before it cleans up.

- One guarded reader supplies the expected `plugin.json` version to the plugin-version cases.

- The two version fixtures use the current config path.

- The exec suites gain 6 cases (mutation-smoke +1, jira-sdlc +1, github-sdlc +1, fixture-guard +1, review-prepare +2). Every floor still holds.

## OpenSpec Appendix

Not applicable — no OpenSpec change
