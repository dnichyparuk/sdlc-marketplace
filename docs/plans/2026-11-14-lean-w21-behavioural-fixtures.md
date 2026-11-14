# Lean wave 21: behavioural fixtures Implementation Plan

**Commit:** `fix(#9388): tests - harden fixtures, fixture ref check`
**Goal:** Make the behavioural suite load again, and stop a missing fixture from going unseen:
- the three harden-sdlc fixtures that `tests/promptfoo/datasets/harden-sdlc.yaml` names exist under `tests/promptfoo/fixtures/`, in the standard harden fixture format;
- the three misplaced copies under `tests/promptfoo/datasets/fixtures/` are deleted;
- a new exec-only check script reports every `file://fixtures/...` or `file://fixtures-fs/...` reference in a behavioural or headless dataset that points to a missing file, with two exec cases (the real tree, and a negative self-test).
**Architecture:** Three independent tasks in execute wave 1 (two fixture tasks, one script task), then one dataset task in wave 2. No two tasks share a file. No plugin skill, script or spec changes: the fixtures and the check are test tooling only.
**Source:** conversation context (wave 21 brief; todo #9388)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The owner ran the behavioural suite (`tests/promptfoo/promptfooconfig.yaml`) on 2026-11-14. It aborted before any case ran.
- promptfoo found no file for `fixtures/harden-duplicate-plan-guardrail-context.md`, named by `tests/promptfoo/datasets/harden-sdlc.yaml:340`.
- Two more references in the same dataset are missing too (`:369` and `:396`).
- Nothing in the exec suite checks that dataset fixture references resolve, so the defect stayed hidden from May 2026 (commit 8ffe2d6, PR #419) until a full behavioural run.

**What prompted this change now?**

The failed behavioural run of 2026-11-14 (todo #9388).

**What does success look like?**

- All 316 fixture references in the 19 behavioural and headless datasets resolve.
- The new exec cases pass at the end of the wave, and the reference case would have failed at HEAD.
- The three test cases at `harden-sdlc.yaml:340-415` get exactly the context their assertions expect.

### Re-verification at HEAD cd42bb7

| Item | Still reproduces | Evidence |
|---|---|---|
| 1 three missing fixtures | yes | A scan of the 19 datasets listed in `promptfooconfig.yaml:15-30` and `promptfooconfig-headless.yaml:17-19` finds 316 `file://fixtures...` references. Exactly three do not resolve against `tests/promptfoo/`: `harden-sdlc.yaml:340` `fixtures/harden-duplicate-plan-guardrail-context.md`, `:369` `fixtures/harden-duplicate-execute-guardrail-context.md`, `:396` `fixtures/harden-review-dim-priority-context.md`. Commit 8ffe2d6 did add files with these names, but at `tests/promptfoo/datasets/fixtures/` (git-tracked; 42, 42 and 49 lines), so the references stay broken (F-dataset-fileref-enumeration-5). |
| 2 no check for missing references | yes | No script under `tests/promptfoo/scripts/` reads dataset fixture references; the exec config (`promptfooconfig-exec.yaml`) runs no such check (F-exec-fixture-guard-check-pattern-8, -10). |

No item is dropped.

**Who is affected if this ships wrong?** The owner, when the behavioural suite aborts again or a harden case judges against the wrong context. Fixture authors, if the check reports a false missing reference and fails the exec suite.

**Non-goals.** No change to `harden-sdlc.yaml` test cases or assertions. No change to harden-sdlc SKILL.md, its agent, its spec or its scripts. No check of fixture paths that are not `file://` references (for example the bare `stub_bin: "fixtures-fs/..."` values in `headless-github.yaml`). No behavioural or headless run. No change to `tests/promptfoo/datasets/fixtures/jira-payloads/`.

## Research Findings

All finding ids below come from the discovery brief (`F-<dimension>-<n>`).

**Fixture format (F-harden-fixture-content-contract-1).** Every harden fixture under `tests/promptfoo/fixtures/` starts with `# Failure Context — harden-sdlc invocation (<qualifier>)`. It has `## Failure Details` (Calling skill, Step, Operation, Failure text, Exit code, Error type, User intent) and `## Loaded Surfaces` (one line per surface; listed entries as `  - <id> (<severity>): "<description>"`). Fixtures that point at one hardening action add `## Hardening Signal` (`harden-new-dimension-context.md:17-18`).

**What the three cases need (F-harden-fixture-content-contract-2 to -4).**
- `:340` case: a plan guardrail `no-bare-cwd` (error) and a failure about a bare `process.cwd()` call. It asserts `consolidate` and `no-bare-cwd`, and a `not-regex` for the literal `"action":\s*"add"`.
- `:369` case: an execute guardrail `no-scope-creep` (warning) whose description does not yet mention wave execution, and a failure about out-of-scope code added during a wave. Its `not-regex` is `(action.*add.*scope|new.*scope.*guardrail)`.
- `:396` case: a failure with two signals, a missing review dimension for YAML config files and a vague `spec-first` plan guardrail. It asserts that review-dimensions proposals come first.

**Where the rules live (F-harden-fixture-content-contract-5).** R14 (ordering) and R15 (`consolidate`) are in `docs/specs/harden-sdlc.md:63,65` and `plugins/sdlc-utilities/agents/harden-orchestrator.md:96-134`. The behavioural runner loads only `skill_path` (SKILL.md), and SKILL.md names R14 and R15 only at line 16 and the `consolidate` apply step at line 298. So each fixture must state the rule it exercises in its Hardening Signal, as the misplaced copies did. No case contradicts the spec.

**Misplaced copies.** `tests/promptfoo/datasets/fixtures/harden-*.md` hold the right scenarios in another format (`# Harden Context: ...`, `## Project Context`, `## Failure Context`). Nothing references them: the only consumer path, `file://fixtures/...`, resolves against `tests/promptfoo/`.

**Check script pattern (F-exec-fixture-guard-check-pattern-1 to -7).** `tests/promptfoo/scripts/check-fixture-guard.js` is the precedent: `REPO_ROOT` three levels up with a `CLAUDE.md` marker check (exit 2), a pure scan function, one JSON line on stdout, exit 0/1/2, and a `--probe-unguarded` negative self-test in a temp directory. Its dataset `tests/promptfoo/datasets/fixture-guard-exec.yaml` is already registered (`promptfooconfig-exec.yaml:92`). The script runner does not expose the exit code (`providers/script-runner.js:143-169`); cases assert on the JSON and parse only the first output line.

**Reference shapes (F-dataset-fileref-enumeration-1 to -9).** All 316 references today are double-quoted `file://fixtures/<name>.md`. There are no fragments, globs or directories, and no `file://fixtures-fs/` references in these 19 datasets; the check still handles that form. promptfoo resolves dataset `file://` vars against the config directory, `tests/promptfoo/`.

**Commands (F-exec-fixture-guard-check-pattern-11).** Targeted exec run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Fixtures "introduced without files" | no | creates the three fixtures at `tests/promptfoo/fixtures/` and deletes the copies at `tests/promptfoo/datasets/fixtures/` | The brief's premise is half right: the files exist, but at a path nothing reads (F-dataset-fileref-enumeration-5) |
| Fixture format | no | rewrites the scenarios in the standard harden fixture format | Matches the other harden fixtures the brief names |
| Two exec cases, not one | no | adds a reference case and a negative self-test case | A check that only ever passes proves nothing; wave 19 added the same self-test to the fixture guard |
| Dataset for the cases | no | appends to `fixture-guard-exec.yaml`, the test-hygiene dataset | Already registered; no config change |
| Full-line YAML comments | no | the check skips them | A commented-out reference is never loaded, so reporting it would be a false failure |
| Missing dataset file | no | reported as a missing entry with the config file as `dataset` | promptfoo would abort on it too; one more line in the same loop |
| pr-link-github-issue guardrail | no | the PR names #9388 without `Fixes` or `Closes` | It is an internal register id, not a GitHub issue (project notes) |

## Decisions taken without the owner

- **Delete the misplaced copies.** Alternative: keep them. They are unused and drift from the real fixtures, so the next reader could edit the wrong file.
- **State the R14 and R15 rules in each fixture's Hardening Signal.** Alternative: a neutral fixture. The runner loads only SKILL.md, which does not carry the ordering or overlap rules, so a neutral fixture would make the cases test the model's memory, not the skill.
- **Add a negative self-test case.** The brief asks for one case; a second case proves the check can fail.

## Key Decisions

- **Fixtures move, they do not get copied.** Each fixture task creates the file under `tests/promptfoo/fixtures/` and deletes its misplaced copy in the same task. One source per fixture.

- **Fixture text avoids the forbidden output strings.** The `not-regex` checks run on the model output, and models echo their context. So no fixture holds the literal `"action": "add"`, or the words "new scope guardrail" or "action ... add ... scope".

- **The check reads text, not YAML.** It finds dataset paths in each config with a regex for `file://datasets/...yaml`, and fixture paths in each dataset line with a regex for `file://fixtures/...` or `file://fixtures-fs/...`. Alternative: parse YAML with a library. The test directory has no YAML parser dependency, and every reference today is one quoted string on one line.

- **Threat model of the check.** A best-effort lint for dataset authors. It catches a quoted or bare `file://fixtures/...` or `file://fixtures-fs/...` reference that does not resolve under `tests/promptfoo/`. Accepted gaps:
  - a reference built from a template variable (`{{...}}`) or split over lines is not seen;
  - a fixture path without `file://` (for example `stub_bin` in `headless-github.yaml`) is not checked;
  - a `..` segment is resolved as written, not confined to `tests/promptfoo/`;
  - a reference inside a block scalar or after a `#` on the same line is checked (fails safe).

- **Smallest cut.** Four tasks: two fixture tasks, the script, the cases. No spec: the script is test tooling, like `check-fixture-guard.js`, which has no spec either.

## Contract Examples

**code**

```markdown
**Contract:**
- shape (code): `function scanRefs(root: string): { ok, configs, datasets, refs, missing: Array<{dataset, line, ref}> }`
- names: `scanRefs`, `probeMissing`, `--probe-missing`.
- mirror: `tests/promptfoo/scripts/check-fixture-guard.js:1-16` (marker check), `:125-149` (main block).
- decisions: one JSON line on stdout; exit 1 on a missing reference; exit 2 on a script error.
- sync: Task 4 cases assert this output shape.
```

**docs**

```markdown
**Contract:**
- shape (docs): new fixture `tests/promptfoo/fixtures/harden-review-dim-priority-context.md` with H1, `## Failure Details`, `## Loaded Surfaces`, `## Hardening Signal`.
- names: `spec-first`, `yaml-config-coverage`.
- mirror: `tests/promptfoo/fixtures/harden-new-dimension-context.md:1-18`.
- decisions: states R14 ordering in the Hardening Signal.
- sync: assertions at `tests/promptfoo/datasets/harden-sdlc.yaml:396-415`.
```

## Tasks

### Task 1: Duplicate-guardrail harden fixtures (plan and execute)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `tests/promptfoo/fixtures/harden-duplicate-plan-guardrail-context.md`
- Create: `tests/promptfoo/fixtures/harden-duplicate-execute-guardrail-context.md`
- Modify: `tests/promptfoo/datasets/fixtures/harden-duplicate-plan-guardrail-context.md` — delete
- Modify: `tests/promptfoo/datasets/fixtures/harden-duplicate-execute-guardrail-context.md` — delete

**Notes:**
Findings: F-harden-fixture-content-contract-1, -2, -3, -5; F-dataset-fileref-enumeration-5. The scenarios come from the misplaced copies; only the format changes (Key Decisions). The Hardening Signal must carry R15 because the runner loads SKILL.md only. Behavioural cases are verified by review only (owner-initiated suite). Delete with `git rm`.

**Acceptance criteria:**
- [ ] Both new files have exactly the content in the Contract.
- [ ] `grep -c '"action": "add"' tests/promptfoo/fixtures/harden-duplicate-*-guardrail-context.md` prints 0 for both files; `grep -ci 'new scope' tests/promptfoo/fixtures/harden-duplicate-execute-guardrail-context.md` prints 0.
- [ ] The two copies under `tests/promptfoo/datasets/fixtures/` are deleted; `tests/promptfoo/datasets/fixtures/jira-payloads/` is untouched.
- [ ] `tests/promptfoo/datasets/harden-sdlc.yaml` is byte-unchanged.

**Contract:**
- shape (docs): `tests/promptfoo/fixtures/harden-duplicate-plan-guardrail-context.md`, full content:
  ```markdown
  # Failure Context — harden-sdlc invocation (duplicate plan guardrail)

  ## Failure Details
  Calling skill:  plan-sdlc
  Step:           Step 3 — CRITIQUE
  Operation:      error-severity guardrail evaluation
  Failure text:   Plan task 3 modifies `scripts/lib/foo.js` to add a new resolver. Its implementation snippet reads `const root = process.cwd()` at line 47 instead of calling `resolveSdlcRoot()`. The task description does not repeat the cwd-safety rule, so the bare `process.cwd()` call reached an approved plan.
  Exit code:      —
  Error type:     —
  User intent:    Author an implementation plan for a new project-root resolver

  ## Loaded Surfaces (preview from harden-prepare.js)
  plan.guardrails:
    - no-bare-cwd (error): "Avoid bare `process.cwd()` in scripts — always route through `resolveSdlcRoot()`."
    - test-coverage-required (error): "Every task that creates or modifies source code must include corresponding promptfoo test cases."
    - spec-first (error): "Any task that modifies a skill's behavior must first update the corresponding spec in docs/specs/<skill-name>.md."
  execute.guardrails: 10 entries
  review.dimensions: 13 entries (script-resolution, runtime-contract, ...)
  copilot.instructions: 6 entries
  error-report-skill: resolved

  ## Hardening Signal
  The failure is the class of bug that the existing plan guardrail `no-bare-cwd` already targets: a bare `process.cwd()` call in a script. The proposed plan-guardrails change overlaps `no-bare-cwd` by id and by description. Per R15, an overlapping proposal uses the `consolidate` action and cites `no-bare-cwd` in its patch: it tightens the existing description (for example, the rule also covers implementation snippets inside plan tasks) and keeps severity `error`. It does not create a second guardrail id for the same rule (strengthen-only, R8/C9).
  ```
  `tests/promptfoo/fixtures/harden-duplicate-execute-guardrail-context.md`, full content:
  ```markdown
  # Failure Context — harden-sdlc invocation (duplicate execute guardrail)

  ## Failure Details
  Calling skill:  execute-plan-sdlc
  Step:           Step 5c-ter — post-wave guardrail evaluation
  Operation:      post-wave guardrail evaluation
  Failure text:   Wave 2 completed, but the worker for task 4 added a helper function `extractContextKey()` to `lib/context.js` that the task never mentioned. The task was scoped to the `run()` function only. The out-of-scope helper adds untested code paths during wave execution.
  Exit code:      0
  Error type:     —
  User intent:    Execute an approved plan for the context loader

  ## Loaded Surfaces (preview from harden-prepare.js)
  plan.guardrails: 17 entries
  execute.guardrails:
    - no-scope-creep (warning): "Implementation must stay within the task's stated scope — no additional features, refactoring, or cleanup beyond what was specified."
    - test-coverage-required (error): "Every changed source file must keep its promptfoo test cases passing."
  review.dimensions: 13 entries (script-resolution, runtime-contract, ...)
  copilot.instructions: 6 entries
  error-report-skill: resolved

  ## Hardening Signal
  The failure is scope creep, which the existing execute guardrail `no-scope-creep` already covers, but its description does not mention wave execution. The proposed execute-guardrails change overlaps `no-scope-creep` by description. Per R15, an overlapping proposal uses the `consolidate` action and cites `no-scope-creep` in its patch: it tightens the description to name wave execution (a worker must not add helpers, files or functions its task does not name) and may raise severity, never lower it. It does not create a second guardrail with an overlapping rule (strengthen-only, R8/C9).
  ```
- names: guardrail ids `no-bare-cwd`, `no-scope-creep`; H1 qualifiers `(duplicate plan guardrail)`, `(duplicate execute guardrail)`.
- mirror: `tests/promptfoo/fixtures/harden-plan-guardrail-failure-context.md:1-20` (Failure Details and Loaded Surfaces); `tests/promptfoo/fixtures/harden-new-dimension-context.md:17-18` (Hardening Signal).
- decisions: scenarios kept from the misplaced copies; R15 rule stated in the fixture; forbidden output strings avoided (Key Decisions).
- sync: assertions at `tests/promptfoo/datasets/harden-sdlc.yaml:340-395`.

### Task 2: Review-dimension priority harden fixture

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `tests/promptfoo/fixtures/harden-review-dim-priority-context.md`
- Modify: `tests/promptfoo/datasets/fixtures/harden-review-dim-priority-context.md` — delete

**Notes:**
Findings: F-harden-fixture-content-contract-1, -4, -5; F-dataset-fileref-enumeration-5. R14 ordering lives in the agent file, not SKILL.md, so the fixture states it. The YAML dimension is described as missing, with no review dimension matching `**/*.yaml`, so the proposal is an `add` on the review-dimensions surface; the `:396` case has no `not-regex`, so naming that is safe. Delete with `git rm`.

**Acceptance criteria:**
- [ ] The new file has exactly the content in the Contract.
- [ ] The copy under `tests/promptfoo/datasets/fixtures/` is deleted.
- [ ] `tests/promptfoo/datasets/harden-sdlc.yaml` is byte-unchanged.

**Contract:**
- shape (docs): `tests/promptfoo/fixtures/harden-review-dim-priority-context.md`, full content:
  ```markdown
  # Failure Context — harden-sdlc invocation (review-dimension priority)

  ## Failure Details
  Calling skill:  review-sdlc
  Step:           Step 5 — actionable findings
  Operation:      post-merge regression analysis
  Failure text:   Review passed with no blockers, but a regression appeared after merge in `infrastructure/db-config.yaml`. The file was changed, and no review dimension covers YAML config files, so nobody reviewed it. The plan guardrail `spec-first` is also too vague: it does not say that the spec lives in docs/specs/ or that it must cite the issue number, so the plan shipped the config change without a spec update. Both gaps contributed to the regression.
  Exit code:      —
  Error type:     —
  User intent:    Review the database configuration change before release

  ## Loaded Surfaces (preview from harden-prepare.js)
  plan.guardrails:
    - spec-first (error): "Changes must have a spec before code."
    - test-coverage-required (error): "Every task that creates or modifies source code must include corresponding promptfoo test cases."
  execute.guardrails: 10 entries
  review.dimensions:
    - script-resolution (high): "Reviews find-based script resolution and Glob-based reference lookup patterns in commands and skills."
    - runtime-contract (high)
    - skill-architecture (medium)
    (none of the existing dimensions have triggers matching `**/*.yaml`)
  copilot.instructions: 6 entries (one per existing dimension)
  error-report-skill: resolved

  ## Hardening Signal
  Two surfaces need a proposal: a new review dimension for YAML config files (for example `yaml-config-coverage`, triggers `**/*.yaml`) on the review-dimensions surface, and a tighter `spec-first` description on the plan-guardrails surface. Per R14, the orchestrator orders `proposals[]` by surface: every review-dimensions proposal first, then plan-guardrails, then execute-guardrails, then copilot-instructions. So the YAML dimension proposal comes before the `spec-first` proposal, even though the `spec-first` signal names a guardrail by id.
  ```
- names: `spec-first`, `yaml-config-coverage`, H1 qualifier `(review-dimension priority)`.
- mirror: `tests/promptfoo/fixtures/harden-new-dimension-context.md:1-18`.
- decisions: R14 ordering stated in the fixture; scenario kept from the misplaced copy.
- sync: assertions at `tests/promptfoo/datasets/harden-sdlc.yaml:396-415`.

### Task 3: Fixture reference check script

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-fixture-refs.js`

**Notes:**
Findings: F-exec-fixture-guard-check-pattern-1 to -3, -7; F-dataset-fileref-enumeration-1 to -4, -6. Mirrors `check-fixture-guard.js` so a reader knows the shape. The threat model goes in the header comment (Key Decisions), so reviewers report only gaps outside that list. The self-test writes files under `os.tmpdir()`, never under `tests/promptfoo/`, and never runs them. At HEAD before Tasks 1 and 2 the default scan reports the three harden references; after them it is clean.

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-fixture-refs.js` prints one JSON line. After Tasks 1 and 2 it is `{"ok":true,"configs":2,"datasets":19,"refs":316,"missing":[]}` and the exit code is 0; before them `ok` is false, `missing` names `harden-sdlc.yaml` lines 340, 369 and 396, and the exit code is 1.
- [ ] `node tests/promptfoo/scripts/check-fixture-refs.js --probe-missing` prints exactly `{"ok":false,"configs":2,"datasets":2,"refs":3,"missing":[{"dataset":"datasets/a.yaml","line":3,"ref":"fixtures/absent.md"},{"dataset":"datasets/b.yaml","line":2,"ref":"fixtures-fs/absent-dir"}]}` and exits 0; the temp directory is removed (also when the scan throws).
- [ ] A missing config file or another thrown error prints `Script error: <message>` on stderr and exits 2.
- [ ] Targeted run after Task 4: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs"`.

**Contract:**
- shape (code): CLI and output:

  | Invocation | stdout (one line) | exit |
  |---|---|---|
  | (no args) | `{"ok","configs","datasets","refs","missing":[{"dataset","line","ref"}]}` for `tests/promptfoo/` | 0 when `ok`, 1 when not |
  | `--probe-missing` | the same shape for a temp tree (output in Acceptance) | 0 |
  | marker missing or thrown error | nothing; stderr `Script error: <message>` (marker: `Script error: REPO_ROOT marker not found at <path> — script may have moved`) | 2 |

  Module outline:
  ```js
  #!/usr/bin/env node
  'use strict';
  // #9388: every file://fixtures/... or file://fixtures-fs/... reference in a behavioural or headless dataset must
  // resolve, or promptfoo aborts the whole suite before any case runs.
  // Threat model: <the four accepted gaps from Key Decisions, as comment lines>
  const path = require('path'); const fs = require('fs'); const os = require('os');
  const REPO_ROOT = path.resolve(__dirname, '../../..');   // + CLAUDE.md marker check, exit 2 (mirror)
  const PROMPTFOO_DIR = path.join(REPO_ROOT, 'tests/promptfoo');
  const CONFIGS = ['promptfooconfig.yaml', 'promptfooconfig-headless.yaml'];
  const DATASET_RE = /file:\/\/(datasets\/[^"'\s]+\.ya?ml)/g;
  const REF_RE = /file:\/\/(fixtures(?:-fs)?\/[^"'\s,\]}]+)/g;

  // root: a directory that holds CONFIGS. Paths in the result are posix-relative to root.
  function scanRefs(root) {
    // for each config (read it; a missing config throws): collect DATASET_RE matches, in order, no duplicates;
    //   a dataset path that does not exist -> missing.push({ dataset: <config name>, line: <config line>, ref: <dataset path> })
    // for each existing dataset: split on '\n'; skip a line whose first non-blank char is '#';
    //   each REF_RE match: refs++; if !fs.existsSync(path.join(root, ref)) -> missing.push({ dataset, line: i + 1, ref })
    // return { ok: missing.length === 0, configs: CONFIGS.length, datasets: <unique dataset count>, refs, missing };
  }

  function probeMissing() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-refs-missing-'));
    try {
      const files = {
        'promptfooconfig.yaml': ['tests:', '  - file://datasets/a.yaml', ''],
        'promptfooconfig-headless.yaml': ['tests:', '  - file://datasets/b.yaml', ''],
        'datasets/a.yaml': ['- vars:', '    project_context: "file://fixtures/present.md"',
          '    other: "file://fixtures/absent.md"', '# project_context: "file://fixtures/commented.md"', ''],
        'datasets/b.yaml': ['- vars:', '    project_root: "file://fixtures-fs/absent-dir"', ''],
        'fixtures/present.md': ['# present', ''],
      };
      // mkdirSync(dirname, { recursive: true }) + writeFileSync(lines.join('\n')) for each entry
      return scanRefs(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  // main: try { --probe-missing -> print probeMissing(); else print scanRefs(PROMPTFOO_DIR), exit 1 when !ok }
  //       catch (err) { stderr `Script error: ${err.message}`; exit 2 }
  ```
- names: file `check-fixture-refs.js`; functions `scanRefs`, `probeMissing`; flag `--probe-missing`; constants `PROMPTFOO_DIR`, `CONFIGS`, `DATASET_RE`, `REF_RE`; temp prefix `fixture-refs-missing-`.
- mirror: `tests/promptfoo/scripts/check-fixture-guard.js:1-16` (header, marker check), `probeUnguarded()` and the main block at `:125-149`.
- decisions: text scan, not YAML parse; full-line comments skipped; a missing dataset is a missing entry; probe exits 0 (it tests the reporting path, like `--probe-unguarded`); the regexes use `exec` or `matchAll` per line, so no `g`-flag `lastIndex` state leaks between lines (use `line.matchAll(REF_RE)`).
- sync: Task 4 cases assert this output; the line numbers 3 and 2 come from the probe file lists above.

### Task 4: Exec cases for the fixture reference check

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — header comment names both scripts; append cases `fixture-refs: (a)` and `fixture-refs: (b)`

**Notes:**
Findings: F-exec-fixture-guard-check-pattern-4, -5, -7. Case (a) passes only after the fixtures of Tasks 1 and 2 exist, hence the dependency. Both assertions parse only the first output line, so an appended stderr line cannot break `JSON.parse`. No `|` appears in the assertions, so no regex escaping applies.

**Acceptance criteria:**
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-refs"` reports 2 passed, 0 failed.
- [ ] The four `fixture-guard:` cases are byte-unchanged.

**Contract:**
- shape (code): header line 1, before → after:
  ```diff
  -# Script execution tests for tests/promptfoo/scripts/check-fixture-guard.js (W8.29).
  +# Script execution tests for tests/promptfoo/scripts/check-fixture-guard.js (W8.29)
  +# and tests/promptfoo/scripts/check-fixture-refs.js (#9388).
  ```
  Appended at the end of the file, after a blank line:
  ```yaml
  - description: "fixture-refs: (a) every file://fixtures and file://fixtures-fs reference in the behavioural and headless datasets resolves"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-fixture-refs.js"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.missing.length === 0 && r.configs === 2 && r.datasets >= 19 && r.refs >= 316"

  - description: "fixture-refs: (b) a missing fixture and a missing fixtures-fs reference are reported; a commented reference is skipped"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-fixture-refs.js"
      script_args: "--probe-missing"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.refs === 3 && r.missing.map(m => m.dataset + ':' + m.line + ':' + m.ref).join(',') === 'datasets/a.yaml:3:fixtures/absent.md,datasets/b.yaml:2:fixtures-fs/absent-dir'"
  ```
- names: description prefix `fixture-refs:`.
- mirror: case (d) at `tests/promptfoo/datasets/fixture-guard-exec.yaml:27-33`.
- decisions: lower bounds (`>= 19`, `>= 316`) so adding datasets or references does not break case (a); exact list in case (b).
- sync: output shape of Task 3 `scanRefs` and `probeMissing`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | New script check-fixture-refs.js is covered by two exec cases in Task 4; other tasks are test fixtures only |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted exec-only promptfoo runs; behavioural and headless suites are not run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks cover only the missing fixtures, the copy cleanup and the reference check; non-goals are listed |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (duplicate-guardrail fixture pair, priority fixture, check script, exec cases) |
| scripts-over-llm-logic | error | PASS | The check is a deterministic script; no skill instructions change |
| yagni | warning | PASS | Self-test case justified in Decisions; no speculative abstractions |
| cross-skill-consistency | error | PASS | No skill behaviour changes; fixtures follow the existing harden fixture format |
| pr-link-github-issue | error | PASS | #9388 is an internal register id, not a GitHub issue; recorded in Deviations |
| dry | warning | PASS | The script mirrors the check-fixture-guard.js pattern without copying logic; fixtures are distinct scenarios |
| kiss | warning | PASS | Text-scan regex approach chosen over a YAML parser, with rationale |
| spec-first | error | PASS | No SKILL.md or skill behaviour change; no spec update needed |
| project-agnostic | error | PASS | Change is repo test tooling only; no plugin behaviour or consumer-facing files |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill dispatch or SKILL.md flag gates |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites |
| flag-resolution-single-source | warning | PASS | No contractual flags added |
| state-premise | error | PASS | Context states that the behavioural suite aborts on three missing fixtures and nothing checks references |
| smallest-viable-cut | warning | PASS | Key Decisions has a Smallest cut entry: four tasks, no spec |
| failure-audience | warning | PASS | Names the owner and fixture authors as affected |
| explicit-non-goals | warning | PASS | Non-goals paragraph lists exclusions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives (delete vs keep copies, neutral fixture, YAML parse) recorded with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch described |
| flag-semantic-consistency-cross-skill | error | PASS | --probe-missing is on a test script, not a user-invoked skill prepare script |
| workspace-mode-compatibility | error | PASS | No state, config reads or cwd-dependent plugin logic; the script resolves its root from __dirname |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md, prepare script or dispatched prompt changes |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 3 creates `tests/promptfoo/scripts/check-fixture-refs.js` with a new `--probe-missing` flag and a defined stdout shape and exit-code contract that the Task 4 cases depend on.

**Severity hint:** high

**Patch:** Check the new CLI contract of check-fixture-refs.js (`--probe-missing` flag, one-line JSON stdout, exit codes 0/1/2) against its callers in the exec dataset.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new CLI contract of check-fixture-refs.js (`--probe-missing` flag, one-line JSON stdout, exit codes 0/1/2) against its callers in the exec dataset.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1, 2 and 4 add or edit `tests/promptfoo/fixtures/harden-*-context.md` and `tests/promptfoo/datasets/fixture-guard-exec.yaml`, paths that code-quality's triggers do not yet match (patch: add trigger `**/*.md`).

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Final Shape

- `tests/promptfoo/fixtures/` holds the three harden fixtures the dataset names, in the same format as the other harden fixtures. Each states the R14 or R15 rule its case checks.

- `tests/promptfoo/datasets/fixtures/` holds only `jira-payloads/`.

- `tests/promptfoo/scripts/check-fixture-refs.js` scans the 19 behavioural and headless datasets. It prints one JSON line and fails when a fixture reference does not resolve.

- `fixture-guard-exec.yaml` has six cases: four for the fixture guard and two for the reference check. The exec suite now catches the defect that aborted the behavioural run.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Create tests/promptfoo/fixtures/harden-duplicate-plan-guardrail-context.md for the harden-sdlc.yaml:340 case | Task 1 | covered |
| 2 Create tests/promptfoo/fixtures/harden-duplicate-execute-guardrail-context.md for the :369 case | Task 1 | covered |
| 3 Create tests/promptfoo/fixtures/harden-review-dim-priority-context.md for the :396 case | Task 2 | covered |
| 4 Do not change test cases or assertions in harden-sdlc.yaml unless one contradicts the spec | Task 1, Task 2 | covered |
| 5 Exec-only check script plus exec case that fails on a missing file://fixtures reference; passes after items 1-3 | Task 3, Task 4 | covered |
| 6 Out of scope: plugin skills, scripts, specs; other behavioural datasets; lean orchestration skill; behavioural/headless runs | Task 1, Task 2, Task 3, Task 4 | covered |
| 7 Verification by targeted exec run with --filter-pattern | Task 3, Task 4 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
