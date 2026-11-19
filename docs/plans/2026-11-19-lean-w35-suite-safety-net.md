# Suite Safety Net Implementation Plan

**Commit:** `test(#9448): tests, ci - suite safety net checks`
**Goal:**
- Add the safety net that the exec-suite audit (#9422, audit W1) asks for before any test reduction.
- Make a drop in exec coverage (spec ids, parsed flags, assertions, cases, datasets) fail the exec suite.
- Lint the exec datasets for assertions that can never fail.
- Show the exit code of a script run to assertions, and document the exec suite.
- Give the owner a mutation smoke run that proves chosen cases turn red.
**Architecture:** Four new text-scan checkers in `tests/promptfoo/scripts/` (siblings of `check-fixture-refs.js` and `check-dataset-regex.js`: one JSON line on stdout, exit 0/1/2, a `--probe-*` self-test on a temp tree). Two committed JSON baselines in a new `tests/promptfoo/baselines/` directory. Each checker has its own exec dataset; one late task registers the four new datasets in `promptfooconfig-exec.yaml`. The exec provider gains `metadata.exitCode` and an opt-in `[exit N]` line. The mutation-smoke script is owner-only and never wired into a config or hook.
**Source:** conversation context (brief for lean wave w35; audit report of #9422, section "The safety net that must land BEFORE any reduction")
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` per task (patterns in each task); the main session runs the full exec and exec-hooks suites at PR validation.

---

## Context

**What problem does this change solve?**

- The exec suite (77 datasets, 1,817 cases, 2,645 assertions at HEAD 9aa85b5) has no floor of its own.
- The existing floors scan only the behavioural and headless datasets. A large deletion of exec cases passes without notice.
- Some exec assertions can never fail. Examples: a regex that matches the empty string, a case with only `not-*` assertions, and a `contains '"key":'` with no value.
- The exec provider hides the exit code. Stderr appears only on a non-zero exit, so a negative assertion on stdout proves nothing about success.
- Nothing compares `docs/skills` and `docs/specs` with their byte copies under `site/src/content-source/` (ledger F-124).

**What prompted this change now?**

- The audit plans later waves that merge and remove about 230 exec cases (#9426, out of scope here). The audit says the safety net must land first.
- This wave is planned while wave P (lean-w34) ships. It edits no wave-P file.

**What does success look like?**

- A drop of a cited spec id, a parsed flag, a dataset or a dataset's assertion count fails an exec case. Growth passes.
- The exec suite fails when the case count or the dataset count falls below the HEAD values.
- A new never-failing assertion fails the lint. The existing ones are listed in an allowlist that later waves shrink.
- An assertion can read `context.metadata.exitCode`.
- The README exec section describes the suite as it is.
- The owner can run a mutation smoke run. Nobody else (CI, pre-push, an agent) can start it.

**Who a wrong checker hits (failure audience):**

- A checker that fails by mistake turns the pre-push exec suite red for every contributor and blocks ship runs at PR validation. Each checker therefore prints which dataset, case or file caused the failure, and each baseline can be refreshed with one command.
- A checker that passes by mistake hides lost coverage from the later reduction waves. The `--probe-*` self-tests prove each failure path.

**Re-verification at HEAD (each item still reproduces):**

- Byte-copy check: none exists. `site/scripts/copy-docs.mjs:8-12` copies the whole `docs/` tree and never compares. All 19 skill docs and 14 specs match today (planner `cmp` run). `docs/plans` has 55 files with no copy, so the check is scoped to `skills` and `specs`.
- Coverage gate and floors: no `check-spec-id-coverage.js` and no exec floor exist. `fixture-guard-exec.yaml:41` and `dataset-regex-exec.yaml` scan only `promptfooconfig.yaml` and `promptfooconfig-headless.yaml` (`check-fixture-refs.js` `CONFIGS`).
- Fixture-refs headroom: `fixture-guard-exec.yaml:41` asserts `r.refs >= 316`; `node tests/promptfoo/scripts/check-fixture-refs.js` prints `"refs":316`. Zero headroom.
- Assertion lint: no `check-dataset-asserts.js`. Planner scan of the exec datasets: 27 negative-only cases, 1 empty-matching regex (`sdlc-dimensions-exec.yaml`, `(?!_common\.md)`), 22 key-only `contains`/`icontains` values (positive and `not-` together).
- Exit code: `providers/script-runner.js:144` computes `exitCode`; `:168` builds the output without it; the return at `:169` has no metadata.
- README: `tests/promptfoo/README.md:61-69` says the exec config "runs the three validator scripts".
- Mutation smoke: no script exists.

No item was dropped.

## Research Findings

**Discovery brief:** `/tmp/sdlc-explore-main-VymjTy/discovery-brief.md` (4 code dimensions, 35 findings). Tasks cite its `F-<DIM>-<n>` ids.

**File patterns and conventions:**

- Test-suite checkers live in `tests/promptfoo/scripts/` (F-dataset-assert-lint-and-exec-provider-1). They are CommonJS, start with a `CLAUDE.md` marker guard on `REPO_ROOT`, write one JSON line to stdout, exit 0 (ok), 1 (problems found) or 2 (script error), and carry a `--probe-*` self-test that builds a temp tree with `fs.mkdtempSync` and scans it with the real function (`check-dataset-regex.js:90-112`, `check-fixture-refs.js:89-101`, F-spec-id-coverage-baseline-and-floors-3).
- Each checker states a threat model and its accepted gaps in a header comment (`check-dataset-regex.js:18-26`).
- A checker reaches the pre-push hook only through an exec dataset registered in `promptfooconfig-exec.yaml` (F-docs-site-copy-parity-check-6, F-ci-prepush-wiring-and-readme-2, F-ci-prepush-wiring-and-readme-4). No `scripts/ci` validator runs in GitHub CI (F-ci-prepush-wiring-and-readme-1).
- A dataset case runs a checker with `script_path: "repo://tests/promptfoo/scripts/<name>.js"` and asserts with `JSON.parse(output.split('\\n')[0])` (`dataset-regex-exec.yaml`).
- A provider test runs a wrapper script that calls `callApi` directly and prints the result (`fixtures-fs/stub-bin-gh/error-runner.js`, `script-runner-stub-bin-exec.yaml`, F-dataset-assert-lint-and-exec-provider-8).

**Measured values at HEAD (planner scan, the same text rules the tasks specify):**

| Value | Count |
|---|---|
| exec configs | 2 (`promptfooconfig-exec.yaml`, `promptfooconfig-exec-hooks.yaml`) |
| exec datasets | 77 |
| exec cases (lines starting `- ` at column 0) | 1,817 |
| exec assertions (non-comment lines matching `^\s*-\s*type:`) | 2,645 |
| dataset-scoped cited ids | 382 |
| `<script> <flag or subcommand>` keys | 535 |
| negative-only cases | 27 |

**Exit-code risk (F-dataset-assert-lint-and-exec-provider-4):** about 1,185 `JSON.parse(output)` sites in 52 datasets, 6 `equals` assertions, 2 exact `output.trim() === ''` compares and 7 `$`-anchored regexes (2 in the protected `pr-prepare-exec.yaml`). Any default change to the output text risks them.

**promptfoo 0.123.1:** `runAssertionInternal` passes `providerResponse.metadata` to the assertion as `context.metadata` (read in the cached package `dist/src/index.cjs`). A javascript assertion can therefore read `context.metadata.exitCode`.

**Commands:**

- Targeted exec run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Main-session validators: the six commands of the brief (consistency, docs consistency, spec shape, cost tiers, discovery, args rule). This plan touches no file they read.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Exec case and dataset floors | no | lives as a case of the coverage-gate dataset (Task 2), not as its own task | both read the same scan; one script, one place to raise the floor |
| `[exit N]` default | no | the provider always sets `metadata.exitCode`; the `[exit N]` line is opt-in (`script_show_exit`) | the audit allows metadata; a default suffix would break about 1,200 assertions, 2 of them in a protected dataset |
| Existing offenders of the lint | no | listed in a committed allowlist; only new offenders fail | 8 of the 27 negative-only cases sit in wave-P datasets; fixing them is wave W2 (out of scope) |
| Fixture-refs floor value | no | `refs >= 300` (headroom 16) | the audit asks for headroom; 300 matches the `dataset-regex` floor style (312 vs 300) |
| New datasets in the coverage baseline | no | the four new datasets are not in the seeded baseline | the baseline is seeded in Task 2 before Task 8 registers them; growth passes, and the next deliberate `--update` adds them |
| Behavioural datasets in the lint | no | the lint scans the two exec configs only | the audit scope is the exec suite; `not-*`-only cases are normal in LLM tests |
| Exec config list in Task 4 | no | Task 4 keeps its own two-name `EXEC_CONFIGS` copy and case-block scan instead of requiring Task 2's exports | the dry guardrail warns; the copy keeps Tasks 2 and 4 in one execute wave (F-43); a later wave can move both into a shared helper |
| PR link for #9448 (pr-link-github-issue) | no | the PR body names `#9448` as the internal tracking id, with no `Fixes`/`Closes` keyword; ship's PR step adds it from the **Commit:** header | #9448 is an internal register id, not a GitHub issue (project notes); a `Fixes` keyword would point at an unrelated GitHub number |
| Spec ids | no | no spec id is added or changed | this wave changes test infrastructure only; no skill behaviour changes |

## Decisions taken without the owner

- The exec floors are a case of the coverage-gate dataset (not a separate task).
- `[exit N]` is opt-in; `metadata.exitCode` is always set.
- Existing lint offenders go into an allowlist keyed by rule, dataset and description.
- The fixture-refs floor becomes `refs >= 300`.
- The mutation-smoke script refuses to run unless `--owner` is passed and neither `CI` nor `CLAUDECODE` is set.
- The mutation targets avoid every wave-P file, so wave P cannot break `--check`.
- The review loop reached its 3-iteration cap. The last round approved all three lenses; its one blocking item was the `pr-link-github-issue` guardrail, which the project rule overrides (#9448 is an internal id; see the Deviations row). The Guardrail Compliance table below still shows that row as FAIL because it is generated by the critique lane; it is accepted, not fixed.

## Key Decisions

**1. Where the new checkers live.**

- Choice: `tests/promptfoo/scripts/`, beside `check-fixture-refs.js` and `check-dataset-regex.js`.
- Alternative: `plugins/sdlc-utilities/scripts/ci/`.
- Why: that folder ships with the plugin to every project. These checks know this repository's test layout only (project-agnostic guardrail).

**2. How a drop is detected (coverage gate).**

- Choice: a committed baseline file plus a "no drop" compare. Each dataset keeps its assertion count and its cited ids. The suite keeps a count per `<script> <flag>` key.
- Alternative: fixed floors typed into assertions.
- Why: a floor per dataset would be 77 hand-kept numbers. A baseline is written by one command (`--update`), and its diff shows every deliberate drop to a reviewer.
- Cases per dataset are not compared, only assertions. A later merge wave removes cases on purpose but must keep every assertion.

**3. How the exit code is shown.**

- Choice: always add `metadata: { exitCode }`; add the text line `[exit N]` only when the case sets `script_show_exit`.
- Alternative: always append `[exit N]`.
- Why: about 1,200 existing assertions parse or compare the whole output. The audit offers metadata as an equal option.

**4. How existing offenders are handled by the lint.**

- Choice: an allowlist file. A finding in the allowlist passes. An allowlist entry that no longer matches is reported as `stale` and does not fail.
- Alternative: fix every offender now.
- Why: fixing them is the false-pass wave (W2), out of scope. Several sit in wave-P datasets that this wave must not edit. A stale entry must not fail, so W2 fixes pass.

**5. How the mutation-smoke script stays owner-only.**

- Choice: it runs mutations only with `--run --owner` and only when neither `CI` nor `CLAUDECODE` is set. It is not listed in any promptfoo config, `lefthook.yml` or `Taskfile.yml`.
- Alternative: rely on documentation only.
- Why: an exec case can then prove the refusal. The guard stops accidental runs; it is not a security boundary.

**6. Registration order.**

- Choice: Tasks 1, 2, 4 and 6 create their datasets; Task 8 alone registers them in `promptfooconfig-exec.yaml` and runs them.
- Alternative: each task registers its own dataset.
- Why: one shared file per wave (F-43). A chain of four registering tasks would add four execute waves.

## Final Shape

When all tasks are done:

- `tests/promptfoo/scripts/` has four new scripts:
  - `check-docs-copies.js` — byte compare of `docs/{skills,specs}/*.md` with `site/src/content-source/{skills,specs}/*.md`.
  - `check-spec-id-coverage.js` — the coverage gate with its baseline, plus the exec totals used by the floors.
  - `check-dataset-asserts.js` — the assertion lint with its allowlist.
  - `mutation-smoke.js` — the owner-only mutation smoke run.
- `tests/promptfoo/baselines/` holds `spec-id-coverage.json` and `dataset-asserts-allow.json`.
- Four new exec datasets run in the pre-push exec suite: `docs-copies-exec.yaml`, `spec-id-coverage-exec.yaml`, `dataset-asserts-exec.yaml`, `mutation-smoke-exec.yaml`.
- `script-runner.js` returns `metadata.exitCode` on every run and prints `[exit N]` when asked. `script-runner-stub-bin-exec.yaml` proves both.
- `fixture-guard-exec.yaml` has a 16-reference headroom on the fixture-refs floor.
- `tests/promptfoo/README.md` has a current exec section.
- Nothing in `plugins/` changes. No skill, spec or user doc changes.

## Tasks

### Task 1: Docs byte-copy check

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-docs-copies.js`
- Create: `tests/promptfoo/datasets/docs-copies-exec.yaml`

**Notes:**
Implements ledger F-124 (F-docs-site-copy-parity-check-1, -3, -4, -9). Scoped to `skills` and `specs` because `docs/plans` has no copies today and would fail. Wave P edits spec and skill docs together with their copies, so the check passes after its merge. The dataset is registered by Task 8.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-docs-copies.js` exits 0 at HEAD and prints `"ok":true` with `compared` equal to 33.
- [ ] `--probe-drift` exits 0 and reports exactly one drift, one missing and one extra entry, and no entry for the matching file.
- [ ] Each assertion expression in `docs-copies-exec.yaml` evaluates to true against the real output (check with `node -e` on the captured output).
- [ ] The header comment states the threat model and the accepted gaps.

**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/check-docs-copies.js [--probe-drift]`. Exit 0 = all copies match (or the probe ran), 1 = a problem found, 2 = script error (stderr `Script error: <message>`).
- names: function `scanCopies(docsRoot, copyRoot)`; constant `DIRS = ['skills', 'specs']`; `docsRoot = <repo>/docs`, `copyRoot = <repo>/site/src/content-source`; `REPO_ROOT = path.resolve(__dirname, '../../..')` with the `CLAUDE.md` marker guard.
- stdout (one JSON line):

  ```json
  {"ok":false,"dirs":["skills","specs"],"compared":3,"drift":["skills/b.md"],"missing":["skills/c.md"],"extra":["skills/d.md"]}
  ```

  `compared` = number of `docs/<dir>/*.md` files that have a copy; `drift` = copy exists, bytes differ (`Buffer.equals`); `missing` = doc with no copy; `extra` = copy with no doc. Paths are posix `<dir>/<file>`, sorted. Only `*.md` files at depth 1 are compared.
- probe: `--probe-drift` builds a temp tree `docs/skills/{a,b,c}.md` and `copy/skills/{a,b,d}.md` (`a` same bytes, `b` one byte different), scans it with `scanCopies`, prints the result, removes the tree in `finally`, and exits 0.
- dataset cases (description prefix `docs-copies:`):

  ```yaml
  - description: "docs-copies: (a) every docs/skills and docs/specs file is byte-identical to its site/src/content-source copy"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-docs-copies.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.compared >= 33 && r.drift.length === 0 && r.missing.length === 0 && r.extra.length === 0"
  - description: "docs-copies: (b) a drifted copy, a missing copy and an extra copy are reported; a matching copy is not"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-docs-copies.js"
      script_args: "--probe-drift"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.compared === 2 && r.drift.join(',') === 'skills/b.md' && r.missing.join(',') === 'skills/c.md' && r.extra.join(',') === 'skills/d.md'"
  ```

- mirror: `tests/promptfoo/scripts/check-dataset-regex.js:1-16` (marker guard), `:90-126` (probe and main); `tests/promptfoo/datasets/dataset-regex-exec.yaml` (case shape).
- decisions: threat model = accidental drift after a hand edit of one side; accepted gaps: files below depth 1, non-`.md` files and `docs/plans` are not compared; a copy edited in the same way on both sides passes (it is not drift).
- sync: none.
- verify: until Task 8 registers the dataset, run the script and the probe with `node`. After Task 8: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "docs-copies:"`.

### Task 2: Coverage gate with baseline and exec floors

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-spec-id-coverage.js`
- Create: `tests/promptfoo/baselines/spec-id-coverage.json`
- Create: `tests/promptfoo/datasets/spec-id-coverage-exec.yaml`

**Notes:**
Implements audit safety net (a) and (b) (F-spec-id-coverage-baseline-and-floors-1, -6, -7). Growth must pass because wave P adds cases to four exec datasets while this wave is open. Cases per dataset are not compared, so a later merge wave can remove cases as long as every assertion moves. A text scan (no YAML parser) keeps the script dependency-free like its siblings. Seed the baseline from HEAD, not from the working tree: Task 5 edits a registered dataset in the same wave, and a seed that held its new cases would fail later if that task were reverted.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-spec-id-coverage.js --update` writes the baseline; a second run without `--update` exits 0 with `"ok":true` and `"drops":[]`.
- [ ] At HEAD the output shows `configs` 2, `datasets` >= 77, `cases` >= 1817, `asserts` >= 2645.
- [ ] The seeded baseline holds exactly the datasets and assertion sum that a scan of HEAD prints (77 and 2645 at 9aa85b5; the ship base includes wave P, which adds cases, so the HEAD values may be higher). Seed it with two Bash calls: `git archive HEAD tests/promptfoo | tar -x -C <empty temp dir>`, then `node tests/promptfoo/scripts/check-spec-id-coverage.js --update --scan-dir <temp dir>/tests/promptfoo`; remove the temp dir after.
- [ ] `--probe-drop` reports exactly the four drop kinds `asserts`, `dataset`, `flag`, `id`, and nothing for the dataset that only grew.
- [ ] A missing or unreadable baseline exits 2 with `Script error: baseline not found: <path>; run with --update`.
- [ ] Each assertion expression in `spec-id-coverage-exec.yaml` evaluates to true against the real output.
- [ ] The header comment states the threat model and the accepted gaps.

**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/check-spec-id-coverage.js [--update [--scan-dir <promptfooDir>] | --probe-drop]`. `--scan-dir` (default `<repo>/tests/promptfoo`) names the tree that `--update` scans; the baseline is always written to `<repo>/tests/promptfoo/baselines/spec-id-coverage.json`. Exit 0 = no drop (or baseline written, or probe ran), 1 = at least one drop, 2 = script error.
- names: `EXEC_CONFIGS = ['promptfooconfig-exec.yaml', 'promptfooconfig-exec-hooks.yaml']`; `BASELINE = 'tests/promptfoo/baselines/spec-id-coverage.json'`; functions `scanCoverage(promptfooDir)` (returns the current record) and `compareCoverage(baseline, current)` (returns `drops[]`); `module.exports = { EXEC_CONFIGS, scanCoverage, compareCoverage }` behind `if (require.main === module)`.
- scan rules (text, per dataset file named by an uncommented `- file://datasets/<x>.yaml` line of an exec config):

  | Item | Rule |
  |---|---|
  | case | a line that starts with `- ` at column 0; a case block runs to the next such line |
  | assertion | a non-comment line matching `^\s*-\s*type:` |
  | cited id | each match of `\b[A-Z]{1,3}\d{1,4}\b` on a `description:` line or a `#` comment line, kept per dataset |
  | flag key | in a case block with both `script_path:` and `script_args:`: `<basename of script_path> <token>` for each `--name` token (text before `=`) and for the first token when it matches `^[a-z][a-z0-9-]*$` (a subcommand) |

- baseline file shape (keys sorted, 2-space indent, trailing newline):

  ```json
  {
    "version": 1,
    "configs": ["promptfooconfig-exec-hooks.yaml", "promptfooconfig-exec.yaml"],
    "datasets": {
      "datasets/plan-prepare-exec.yaml": { "asserts": 140, "ids": ["P22", "R20", "…"] }
    },
    "flags": { "plan.js --mark": 4, "plan.js merge-lanes": 3 }
  }
  ```

- drop rules:

  | kind | fails when |
  |---|---|
  | `dataset` | a baseline dataset is no longer named by an exec config |
  | `asserts` | a dataset's assertion count is below its baseline value |
  | `id` | a baseline id is no longer cited in that dataset |
  | `flag` | a baseline flag key had a count > 0 and now has 0 |

  New datasets, ids and flags, and higher counts, never fail.
- stdout (one JSON line):

  ```json
  {"ok":true,"configs":2,"datasets":77,"cases":1817,"asserts":2645,"ids":382,"flags":535,"drops":[]}
  ```

  A drop entry: `{"kind":"asserts","dataset":"datasets/a.yaml","baseline":3,"now":2}`; `{"kind":"id","dataset":"datasets/a.yaml","key":"R7"}`; `{"kind":"flag","key":"a.js --x"}`; `{"kind":"dataset","dataset":"datasets/c.yaml"}`. `drops` sorted by `kind`, then `dataset`, then `key`. `--update` prints the same line with `"updated":true`.
- probe: `--probe-drop` builds a temp `tests/promptfoo`-shaped tree with two configs and datasets `a.yaml`, `b.yaml`, `c.yaml`; writes a baseline from it; then removes one assertion and the id `R7` from `a.yaml`, removes the only `--x` flag case from `b.yaml` (adding an unrelated assertion, so `b.yaml` does not drop asserts), drops `c.yaml` from the config, adds two cases to a fourth dataset `d.yaml` that is in the baseline; scans and prints the result; exits 0.
- dataset cases (description prefix `spec-id-coverage:`):

  ```yaml
  - description: "spec-id-coverage: (a) no exec dataset, assertion count, cited id or parsed flag dropped below the baseline"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-spec-id-coverage.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.drops.length === 0"
  - description: "spec-id-coverage: (b) exec floors: 2 configs, at least 77 datasets, 1817 cases and 2645 assertions"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-spec-id-coverage.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.configs === 2 && r.datasets >= 77 && r.cases >= 1817 && r.asserts >= 2645"
  - description: "spec-id-coverage: (c) a dropped dataset, assertion, id and flag are reported; growth is not"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-spec-id-coverage.js"
      script_args: "--probe-drop"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.drops.map(d => d.kind).join(',') === 'asserts,dataset,flag,id' && !r.drops.some(d => d.dataset === 'datasets/d.yaml')"
  ```

- mirror: `tests/promptfoo/scripts/check-fixture-refs.js:26-60` (config read and dataset list), `check-dataset-regex.js:90-126` (probe and main).
- decisions: threat model = a later wave deletes or merges cases and loses coverage by accident; accepted gaps: the id regex also collects tokens that are not spec ids (they only must not drop); ids cited only inside assertion values are not counted; a case moved to another dataset needs a deliberate `--update`; flag keys from a `script_args` value that spans several lines are not seen; `--update` can hide a drop, so a baseline diff in a PR must be reviewed.
- sync: the floors in case (b) are the HEAD values; Task 8 and later waves only raise them (F-104).
- verify: until Task 8 registers the dataset, run the script, `--update` and the probe with `node`. After Task 8: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "spec-id-coverage:"`.

### Task 3: Fixture-refs floor headroom

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — case "fixture-refs: (a)" floor `r.refs >= 316` becomes `r.refs >= 300`

**Notes:** Rationale: the floor equals the count (316), so one legitimate removed reference fails it (F-spec-id-coverage-baseline-and-floors-4). No other count check reads this value.

**Acceptance criteria:**
- [ ] Line 41 reads `... r.datasets >= 19 && r.refs >= 300"` and nothing else in the file changes.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs:"` passes 2 of 2.

**Contract:** shape (code): in case "fixture-refs: (a)" the expression `... r.datasets >= 19 && r.refs >= 316"` becomes `... r.datasets >= 19 && r.refs >= 300"`; names: assertion field `r.refs`, floor 300.

### Task 4: Assertion lint with allowlist

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-dataset-asserts.js`
- Create: `tests/promptfoo/baselines/dataset-asserts-allow.json`
- Create: `tests/promptfoo/datasets/dataset-asserts-exec.yaml`
- Modify: `tests/promptfoo/scripts/check-dataset-regex.js` — export `decode` and run the main block only under `require.main === module`

**Notes:**
Implements audit safety net (c) (F-dataset-assert-lint-and-exec-provider-1, -5, -6, -7). Reusing `decode` from `check-dataset-regex.js` keeps one YAML-scalar decoder (DRY); the main guard keeps its own exec case unchanged. A stale allowlist entry does not fail, so the later false-pass wave can fix offenders without touching the allowlist first. Seed the allowlist with `--update` and review it: expected about 27 negative-only, 1 empty-regex and up to 22 key-only entries.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-dataset-asserts.js` exits 0 at HEAD after `--update`, with `findings` empty and `allowed` equal to the allowlist length.
- [ ] The allowlist holds the `empty-regex` entry for `datasets/sdlc-dimensions-exec.yaml`.
- [ ] `--probe` reports exactly one finding of each rule, reports no finding for the positive-control case and the allowlisted case, and reports one `stale` entry.
- [ ] `node tests/promptfoo/scripts/check-dataset-regex.js` still prints the same counts as before (`checked` 312) and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-regex:"` passes 2 of 2.
- [ ] Each assertion expression in `dataset-asserts-exec.yaml` evaluates to true against the real output.
- [ ] The header comment states the threat model and the accepted gaps.

**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/check-dataset-asserts.js [--update | --probe]`. Exit 0 = no finding outside the allowlist (or allowlist written, or probe ran), 1 = a new finding, 2 = script error (a missing allowlist is exit 2 with `run with --update`).
- names: `ALLOWLIST = 'tests/promptfoo/baselines/dataset-asserts-allow.json'`; functions `lintDatasets(promptfooDir)` → `findings[]`, `applyAllowlist(findings, entries)` → `{ findings, allowed, stale }`; dataset list from `EXEC_CONFIGS` (copy the two names; do not require Task 2's script, so the tasks stay independent).
- rules (per case block, a case block as in Task 2):

  | rule | finding when |
  |---|---|
  | `empty-regex` | a `type: regex` value, decoded by `decode` from `check-dataset-regex.js`, compiles and `new RegExp(v).test('') === true` |
  | `negative-only` | the case has at least one assertion, every assertion type starts with `not-`, and no `script_capture_stderr:` var with a truthy value |
  | `key-only-contains` | a `type: contains` or `type: icontains` value whose decoded text matches `^"[^"]+":\s*$` |

- finding shape: `{"rule":"negative-only","dataset":"datasets/a.yaml","line":12,"description":"<case description text>"}`; `line` = 1-based line of the case start (rules 2) or of the value (rules 1, 3).
- allowlist file shape (entries sorted by `rule`, `dataset`, `description`):

  ```json
  {
    "version": 1,
    "entries": [
      { "rule": "empty-regex", "dataset": "datasets/sdlc-dimensions-exec.yaml", "description": "…" }
    ]
  }
  ```

  A finding is allowed when an entry has the same `rule`, `dataset` and `description` (no line number, so added cases do not shift it). An entry with no matching finding goes to `stale`.
- stdout (one JSON line): `{"ok":true,"datasets":77,"cases":1817,"findings":[],"allowed":50,"stale":[]}`.
- probe: `--probe` builds a temp tree with one exec config and one dataset holding: a case with `regex '(?!x)'`; a case with only `not-contains`; a case with `contains '"key":'`; a positive-control case (`contains`, plus a `not-contains`); a negative-only case listed in a temp allowlist; and a temp allowlist entry with no matching case. Prints the result; exits 0.
- dataset cases (description prefix `dataset-asserts:`):

  ```yaml
  - description: "dataset-asserts: (a) no exec assertion outside the allowlist matches empty, is negative-only or is a key-only contains"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-dataset-asserts.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.findings.length === 0 && r.datasets >= 77 && r.cases >= 1817"
  - description: "dataset-asserts: (b) each rule reports its case; a positive control and an allowlisted case are not reported; an unused entry is stale"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-dataset-asserts.js"
      script_args: "--probe"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.findings.map(f => f.rule).sort().join(',') === 'empty-regex,key-only-contains,negative-only' && r.allowed === 1 && r.stale.length === 1"
  ```

- `check-dataset-regex.js` change (end of file):

  ```diff
  -try {
  -  if (process.argv.includes('--probe-invalid')) {
  +module.exports = { decode, scanRegex };
  +
  +if (require.main === module) try {
  +  if (process.argv.includes('--probe-invalid')) {
  ```

  The marker guard at `:11-16` stays at top level.
- mirror: `tests/promptfoo/scripts/check-dataset-regex.js:28-88` (type/value scan), `:90-112` (probe).
- decisions: threat model = an author adds an assertion that cannot fail; accepted gaps: a value on a later line than its `type:` line or a block scalar is skipped; javascript assertions are not judged; a negative-only case that captures stderr is trusted; two cases with the same description in one dataset share one allowlist entry; behavioural and headless datasets are not linted.
- sync: none.
- verify: until Task 8 registers the dataset, run the script and the probe with `node`. After Task 8: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "dataset-asserts:"`.

### Task 5: Exit code in the exec provider

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/script-runner.js` — return `metadata.exitCode`; append `[exit N]` when `script_show_exit` is truthy; document the var
- Create: `tests/promptfoo/scripts/run-script-runner-exit.js`
- Modify: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — append four `script-runner exit:` cases

**Notes:**
Implements audit safety net (d) (F-dataset-assert-lint-and-exec-provider-2, -4). The output text stays byte-identical when `script_show_exit` is unset, so no existing assertion changes. `hook-runner.js` already returns its exit code and is left alone. The dataset is already registered, so this task runs its cases directly.

**Acceptance criteria:**
- [ ] Without `script_show_exit`, the provider output is unchanged for every exit code.
- [ ] Every normal return carries `metadata: { exitCode: <number> }`; the spawn-error return carries `metadata: { exitCode: null }`.
- [ ] With `script_show_exit` truthy, the output ends with the line `[exit N]`, after stderr when stderr is included.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "script-runner exit:|script_stub_bin:"` passes all cases.

**Contract:**
- shape (code): provider return before → after:

  ```diff
  -    if (result.error) {
  -      return { output: result.error.message };
  -    }
  +    if (result.error) {
  +      return { output: result.error.message, metadata: { exitCode: null } };
  +    }
       ...
  -    const output = [stdout.trimEnd(), includeStderr ? stderr : null].filter(Boolean).join('\n');
  -    return { output: output };
  +    const showExit = vars.script_show_exit ? `[exit ${exitCode}]` : null;
  +    const output = [stdout.trimEnd(), includeStderr ? stderr : null, showExit].filter(Boolean).join('\n');
  +    return { output, metadata: { exitCode } };
  ```

  Header doc comment gains: ` *   script_show_exit       — (optional) when truthy, append a last line "[exit N]" to the output; the exit code is always in metadata.exitCode`.
- names: var `script_show_exit`; metadata field `exitCode`; harness `run-script-runner-exit.js` with modes `--child <code>` (writes `CHILD-OUT` to stdout, `CHILD-ERR` to stderr, exits `<code>`) and default (calls the provider three times and prints one JSON line `{"plain3":{output,metadata},"show3":{…},"show0":{…}}`, where `plain3` = child exit 3 without the var, `show3` = exit 3 with it, `show0` = exit 0 with it). The harness takes the provider path from `path.join(__dirname, '../providers/script-runner.js')`.
- dataset cases (description prefix `script-runner exit:`):

  ```yaml
  - description: "script-runner exit: (a) metadata.exitCode is set and the output has no exit line by default"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-script-runner-exit.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.plain3.metadata.exitCode === 3 && r.plain3.output === 'CHILD-OUT\\nCHILD-ERR'"
  - description: "script-runner exit: (b) script_show_exit appends [exit N] as the last line, after stderr"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-script-runner-exit.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.show3.output === 'CHILD-OUT\\nCHILD-ERR\\n[exit 3]' && r.show0.output === 'CHILD-OUT\\n[exit 0]' && r.show0.metadata.exitCode === 0"
  - description: "script-runner exit: (c) an assertion reads context.metadata.exitCode of a real run"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-script-runner-exit.js"
      script_args: "--child 4"
    assert:
      - type: javascript
        value: "context.metadata.exitCode === 4 && output.includes('CHILD-OUT')"
  - description: "script-runner exit: (d) script_show_exit prints [exit 0] on a clean run"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-script-runner-exit.js"
      script_args: "--child 0"
      script_show_exit: true
    assert:
      - type: javascript
        value: "output.endsWith('[exit 0]') && context.metadata.exitCode === 0"
  ```

- mirror: `tests/promptfoo/fixtures-fs/stub-bin-gh/error-runner.js` (direct `callApi` harness); `tests/promptfoo/scripts/run-claude-cli-limit-stub.js` (JSON result per mode).
- decisions: metadata always, text opt-in (Key Decision 3).
- sync: Task 7 documents `script_show_exit` and `metadata.exitCode` in the README; Task 2's baseline counts this dataset's assertions (growth only, F-104).

### Task 6: Owner-only mutation smoke script

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/mutation-smoke.js`
- Create: `tests/promptfoo/datasets/mutation-smoke-exec.yaml`

**Notes:**
Implements audit safety net (e) (F-ci-prepush-wiring-and-readme-7, -9). The exec cases exercise only `--list`, `--check` and the refusal, so no exec run ever mutates code or starts promptfoo. Wave-P files are excluded as targets so wave P cannot break `--check`. Workers run only `--list` and `--check`; both stay allowed. The guard is against accidents, not a security boundary.

**Acceptance criteria:**
- [ ] Each mutation's `filter` matches at most 5 case descriptions in its dataset, and the worker has read each matched case and confirmed that its assertion checks the mutated code path (a note per mutation in a `why` field).
- [ ] The script defines at least 10 mutations; `--check` exits 0 with `"ok":true` and `"problems":[]` at HEAD.
- [ ] `--run` without `--owner` exits 2 and prints `"refused":"missing --owner"`; with `--owner` and `CI` set it exits 2 and prints `"refused":"CI is set"`.
- [ ] No mutation targets a wave-P file (list in decisions).
- [ ] The script is not named in any promptfoo config, `lefthook.yml` or `Taskfile.yml`.
- [ ] Each assertion expression in `mutation-smoke-exec.yaml` evaluates to true against the real output.
- [ ] The header comment says owner-only and states the threat model and accepted gaps.

**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/mutation-smoke.js (--list | --check | --run --owner [--only <id>])`.

  | Mode | Effect | Exit |
  |---|---|---|
  | `--list` | prints `{"mutations":[{"id","file","dataset","filter"}]}` | 0 |
  | `--check` | for each mutation: `file` exists, `find` occurs exactly once in it, `dataset` exists, `new RegExp(filter)` matches at least one `description:` line of `dataset`; prints `{"ok":bool,"mutations":N,"problems":[{"id","problem"}]}`, `problem` one of `file-missing`, `find-missing`, `find-not-unique`, `dataset-missing`, `filter-no-case` | 0 ok / 1 problem |
  | `--run` refused | prints `{"ok":false,"refused":"<reason>"}`, reason `missing --owner`, `CI is set` or `CLAUDECODE is set` (presence test, value never read or printed) | 2 |
  | `--run --owner` | copies the repository once to `fs.mkdtempSync(os.tmpdir() + '/mutation-smoke-')` (skips `.git`, `node_modules`, `.sdlc/execution`); for each mutation (or the `--only` one): writes the mutated file, runs `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <filter>` with `cwd` `<copy>/tests/promptfoo` via `spawnSync` (argument array, no shell), records `killed = status !== 0`, restores the file; removes the copy in `finally`; prints `{"ok":bool,"results":[{"id","killed","exitCode"}]}` | 0 all killed / 1 a survivor |

- names: constant `MUTATIONS = [{ id, file, find, replace, dataset, filter, why }]` (repo-relative posix paths). Required targets: `plugins/sdlc-utilities/scripts/lib/ship-fields.js` (drop one `VALID_STEPS` source option), `plugins/sdlc-utilities/scripts/lib/pr-template.js` (swap the template priority), `plugins/sdlc-utilities/scripts/state/execute.js` (`cmdWaveCommitted` writes nothing). Seven more from (the worker picks the exact `find` text): `lib/links.js`, `lib/branch-guard.js`, `lib/version.js`, `lib/commit-message.js`, `lib/wave-split.js`, `lib/dimensions.js`, `lib/yaml.js`.
- dataset cases (description prefix `mutation-smoke:`):

  ```yaml
  - description: "mutation-smoke: (a) --check finds every mutation target exactly once and a case for every filter"
    vars:
      script_path: "repo://tests/promptfoo/scripts/mutation-smoke.js"
      script_args: "--check"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.mutations >= 10 && r.problems.length === 0"
  - description: "mutation-smoke: (b) --list names at least 10 mutations with file, dataset and filter"
    vars:
      script_path: "repo://tests/promptfoo/scripts/mutation-smoke.js"
      script_args: "--list"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.mutations.length >= 10 && r.mutations.every(m => m.id && m.file && m.dataset && m.filter)"
  - description: "mutation-smoke: (c) --run without --owner is refused with exit 2"
    vars:
      script_path: "repo://tests/promptfoo/scripts/mutation-smoke.js"
      script_args: "--run"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.refused === 'missing --owner'"
  - description: "mutation-smoke: (d) --run --owner is refused when CI is set"
    vars:
      script_path: "repo://tests/promptfoo/scripts/mutation-smoke.js"
      script_args: "--run --owner"
      script_env: '{"CI":"true"}'
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.refused === 'CI is set'"
  ```

  Check order for refusal: `--owner` first, then `CI`, then `CLAUDECODE`, so cases (c) and (d) give the same reason whether a person or an agent runs the suite.
- mirror: `tests/promptfoo/scripts/check-fixture-refs.js:89-101` (JSON line and exit codes); README headless wording "Never run it in CI or from a pre-push hook" (`tests/promptfoo/README.md:75`).
- decisions: excluded targets (wave P): `scripts/lib/plan-parse.js`, `scripts/lib/plan-critique.js`, `scripts/skill/plan.js`, `scripts/skill/pr.js`, `scripts/skill/ship.js`, and the datasets `plan-prepare-exec.yaml`, `plan-format-exec.yaml`, `pr-prepare-exec.yaml`, `ship-prepare-exec.yaml`; threat model = an accidental start by CI, a hook or an agent; accepted gaps: a person can unset the variables and pass `--owner`; `CLAUDECODE` covers Claude Code shells only; whether each mutation turns its case red is proven only by the owner's run.
- sync: Task 7 documents the script as owner-only.
- verify: until Task 8 registers the dataset, run `--list`, `--check` and the two refusals with `node` (set `CI` only inside that one command). After Task 8: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "mutation-smoke:"`.

### Task 7: README exec section rewrite

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 4, Task 5, Task 6
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/README.md` — replace the stale `### Script execution tests (promptfooconfig-exec.yaml)` section (lines 61-69)

**Notes:**
Rationale: the section still says the config "runs the three validator scripts" (F-ci-prepush-wiring-and-readme-6). It depends on the guard tasks so it describes their final flags and file names. Only this section changes; the headless and structure sections stay.

**Acceptance criteria:**
- [ ] The section names both exec configs, the dataset location, the `repo://` and `file://fixtures-fs` var forms, the per-case `setup.sh` fixture model, and the `-j 1` targeted-run command verbatim.
- [ ] It documents `script_show_exit` and `metadata.exitCode`.
- [ ] It lists the five suite guards with their scripts and baselines, and says how to refresh a baseline (`--update`) and that the PR diff of a baseline must be reviewed.
- [ ] It states that `mutation-smoke.js --run` is owner-only and never runs in CI, pre-push or from an agent.
- [ ] No other section of the README changes.

**Contract:**
- shape (docs): heading kept: `### Script execution tests (\`promptfooconfig-exec.yaml\`)`. Body, in order:
  1. One paragraph: what the exec configs run (scripts and hooks, no LLM), that `lefthook` pre-push runs both, and the counts as "about 80 datasets" (no exact number, so it does not rot).
  2. `#### Run` — the targeted command `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`, the hooks variant, and why `-j 1` (EISDIR on 0.125+ is why 0.123.1 is pinned).
  3. `#### Case vars` — table: `script_path`, `script_args`, `script_cwd`, `project_root`, `script_env`, `script_stub_bin`, `script_capture_stderr`, `script_show_exit`; one line each; plus `context.metadata.exitCode`.
  4. `#### Suite guards` — table: guard | script | baseline or allowlist | fails when: fixture refs, dataset regex, docs copies, spec-id coverage and floors, dataset asserts.
  5. `#### Mutation smoke (owner-initiated)` — bold line mirroring the headless wording: **Owner-initiated only. Never run it in CI, from a pre-push hook or from an agent.** Then the `--list`, `--check`, `--run --owner [--only <id>]` modes.
- audience: test authors and the owner.
- cross-links: `promptfooconfig-exec.yaml`, `promptfooconfig-exec-hooks.yaml`, `scripts/`, `baselines/`.
- mirror: `tests/promptfoo/README.md:71-75` (headless section style).

### Task 8: Register the new exec datasets

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2, Task 4, Task 6
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — append four dataset lines after `- file://datasets/dataset-regex-exec.yaml`
- Modify: `tests/promptfoo/datasets/docs-copies-exec.yaml` — fix only if a case fails
- Modify: `tests/promptfoo/datasets/spec-id-coverage-exec.yaml` — fix only if a case fails
- Modify: `tests/promptfoo/datasets/dataset-asserts-exec.yaml` — fix only if a case fails
- Modify: `tests/promptfoo/datasets/mutation-smoke-exec.yaml` — fix only if a case fails

**Notes:**
Rationale: a guard reaches pre-push only when its dataset is registered in `promptfooconfig-exec.yaml` (F-ci-prepush-wiring-and-readme-2, F-ci-prepush-wiring-and-readme-4). One task owns the shared config (ledger F-43). It runs each new dataset once through promptfoo, which the guard tasks could not do. A fix here changes an assertion's form, never weakens it; a script fault is reported back, not patched here (the scripts are not in this task's files).

**Acceptance criteria:**
- [ ] The config tail reads exactly as in the Contract.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "docs-copies:|spec-id-coverage:|dataset-asserts:|mutation-smoke:"` passes 11 of 11.
- [ ] `node tests/promptfoo/scripts/check-dataset-asserts.js` still exits 0 (the new datasets add no offender).
- [ ] `node tests/promptfoo/scripts/check-spec-id-coverage.js` still exits 0.

**Contract:**
- shape (code): `promptfooconfig-exec.yaml` tail before → after:

  ```diff
     - file://datasets/fixture-guard-exec.yaml
     - file://datasets/dataset-regex-exec.yaml
  +  - file://datasets/docs-copies-exec.yaml
  +  - file://datasets/spec-id-coverage-exec.yaml
  +  - file://datasets/dataset-asserts-exec.yaml
  +  - file://datasets/mutation-smoke-exec.yaml
  ```

- names: the four dataset paths above.
- decisions: no change to `evaluateOptions`, `maxConcurrency`, providers or `promptfooconfig-exec-hooks.yaml` (exec parallelism is out of scope).
- sync: count checks over the exec configs (F-104): Task 2 case (b) floors `datasets >= 77`, `cases >= 1817`, `asserts >= 2645` and Task 4 case (a) `datasets >= 77`, `cases >= 1817` stay valid, because this task raises the totals to 81 datasets and 1,817 + 15 cases (2 + 3 + 2 + 4 new, plus 4 in Task 5); no floor value changes. `fixture-refs` and `dataset-regex` scan only the behavioural and headless configs and do not change.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every new script has an exec dataset; the modified provider and check-dataset-regex.js are covered by new cases or their existing dataset |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; mutation smoke is owner-only and refuses CI and agents |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to audit safety-net items (a) to (e) plus the README |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | All logic is deterministic scripts; no LLM instructions added |
| yagni | warning | PASS | Features are tied to audit requirements |
| cross-skill-consistency | error | PASS | Nothing under plugins/ changes; wave-P overlap avoided explicitly |
| pr-link-github-issue | error | FAIL | #9448 appears only in the commit header; no explicit PR-linking step (Fixes #9448) in tasks or acceptance criteria |
| dry | warning | FAIL | Task 4 duplicates Task 2's EXEC_CONFIGS and case-block scan with no shared helper |
| kiss | warning | PASS | Dependency-free text scans mirroring sibling scripts |
| spec-first | error | PASS | No SKILL.md or skill behaviour changes |
| project-agnostic | error | PASS | Checks live in tests/promptfoo, justified in Key Decision 1; nothing in plugins/ changes |
| flag-coherence-cross-skill | error | PASS | No skill dispatch or flag gating involved |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates involved |
| flag-resolution-single-source | warning | PASS | script_show_exit is resolved only in the provider |
| state-premise | error | PASS | Context states the problem: the exec suite has no floor and some assertions can never fail |
| smallest-viable-cut | warning | PASS | Deviations and Key Decisions justify the cut; Task 8 is the single registration point |
| failure-audience | warning | PASS | Context names who a wrong checker hits: contributors on pre-push, ship PR validation and later reduction waves |
| explicit-non-goals | warning | PASS | Deviations and Context exclude W2, #9426 and behavioural-dataset linting |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions with alternatives and rationale |
| state-machine-idempotency | error | PASS | Not migration/preflight logic; --update then re-run check is in the acceptance criteria |
| agent-dispatch-script-driven | error | PASS | No agent dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | No plugin skill prepare-script flags are added |
| workspace-mode-compatibility | error | PASS | No state files or config readers; paths resolve from __dirname within the repo |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are modified |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Tasks 1, 2, 4, 5, 6, 7 and 8 create or modify exec dataset and config yaml (for example `tests/promptfoo/datasets/docs-copies-exec.yaml` and `tests/promptfoo/promptfooconfig-exec.yaml`), which the code-quality dimension's current triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 3 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Byte-copy check docs/{skills,specs} vs site/src/content-source (F-124) | Task 1 | covered |
| 2 check-spec-id-coverage.js: baseline of cited spec ids, parsed flags and per-dataset assertion counts; fails on a drop, growth passes | Task 2 | covered |
| 3 Exec case and dataset floors | Task 2, Task 8 | covered |
| 4 Fixture-refs floor headroom (316 = 316 now) | Task 3 | covered |
| 5 check-dataset-asserts.js: empty-matching regex, negative-only cases, key-only contains | Task 4 | covered |
| 6 Exec provider shows [exit N] | Task 5 | covered |
| 7 tests/promptfoo/README.md exec section rewrite | Task 7 | covered |
| 8 Owner-only mutation-smoke script (never CI, pre-push or agent) | Task 6 | covered |
| 9 Exec cases for the new guards | Task 1, Task 2, Task 4, Task 5, Task 6, Task 8 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change

## Contract Examples

**Code task (worked example):**

```markdown
**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/check-docs-copies.js [--probe-drift]`; exit 0 ok, 1 problem, 2 script error; one JSON line `{"ok","dirs","compared","drift","missing","extra"}`.
- names: `scanCopies(docsRoot, copyRoot)`, `DIRS = ['skills', 'specs']`.
- mirror: `tests/promptfoo/scripts/check-dataset-regex.js:90-126`.
- decisions: depth-1 `.md` files only; `docs/plans` not compared.
- sync: none.
```

**Docs task (worked example):**

```markdown
**Contract:**
- shape (docs): replace one README section; heading kept; five sub-sections in a fixed order.
- audience: test authors and the owner.
- cross-links: `promptfooconfig-exec.yaml`, `baselines/`.
- mirror: `tests/promptfoo/README.md:71-75`.
```
