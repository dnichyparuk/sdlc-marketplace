# Lean wave 19: fixture guard negative case Implementation Plan

**Commit:** `fix(#9386): tests - fixture guard reports an unguarded setup.sh`
**Goal:** Prove that the fixture guard check reports a fixture `setup.sh` that runs git without the guard line:
- the checker gets a `--probe-unguarded` mode that builds two unguarded `setup.sh` files in a temporary directory and scans them with the real scan code;
- a new exec case (d) asserts that both files are reported;
- cases (a), (b) and (c) stay green, and no file is added under `tests/promptfoo/fixtures-fs`.
**Architecture:** Two tasks in two execute waves. Task 1 adds the probe mode to `tests/promptfoo/scripts/check-fixture-guard.js`, next to the existing `--probe` mode and built the same way (`fs.mkdtempSync`, cleanup in `finally`). The probe always exits 0 and prints one JSON line, so the script runner never appends stderr. Task 2 adds case (d) to `tests/promptfoo/datasets/fixture-guard-exec.yaml`; it parses the first output line only.
**Source:** conversation context (wave 19 brief; todo #9385; deferred low of wave 18 at `tests/promptfoo/datasets/fixture-guard-exec.yaml:17`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The fixture guard check is a test script. It makes sure that every fixture `setup.sh` that runs `git init` or `git config` first refuses to run inside a git work tree (the "guard line").
- Today its exec cases prove only the positive side. Nothing proves that a `setup.sh` without the guard line is reported. A bug that made the scan report nothing would pass every case.

**What prompted this change now?**

- Todo #9385, which is also the one low finding that wave 18 deferred ("No --dir case proves an unguarded setup.sh is still reported").

**What does success look like?**

- A new exec case fails if the scan stops reporting an unguarded `setup.sh`.
- Cases (a), (b) and (c) still pass, and the whole-tree scan of case (a) still sees every real fixture.

**Who is affected if this ships wrong?**

- Fixture authors: they rely on the lint to catch a `setup.sh` that could rewrite the shared `.git/config` of a linked worktree.
- The exec suite in CI and pre-push: a wrong case (d) fails every exec run, or, worse, passes while the scan reports nothing.

**Non-goals:**

- No new scan rule and no fix of the wave 18 accepted gaps (variables, aliases, `git -C`, heredocs).
- No checked-in negative fixture and no skip rule in the whole-tree scan.
- No change to cases (a), (b) and (c), to `tests/promptfoo/fixtures-fs`, to plugin code or to any spec.

**Re-verification at HEAD (de1c38a):**

- `tests/promptfoo/datasets/fixture-guard-exec.yaml:3-25` has three cases. Case (a) (lines 3-8) requires `ok === true` on the whole tree. Case (b) (lines 10-16) is the run probe. Case (c) (lines 18-25) requires `ok === true` and `scanned === 2` on `fixture-guard-comments`. No case expects `ok === false`. The item reproduces.

## Research Findings

- **Checker:** `tests/promptfoo/scripts/check-fixture-guard.js`.
  - `scanGuards(dir)` (lines 65-80) returns `{ ok, scanned, unguarded }`. `unguarded` holds directory names relative to the scanned root, in sorted order, because `findSetupScripts` (lines 25-38) sorts its entries.
  - A file is unguarded when the guard line is absent or comes after the first git line (line 75). Two branches, so the negative case needs two files.
  - `probe()` (lines 83-100) is the precedent for a self-contained mode: `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, then `fs.rmSync(..., { recursive: true, force: true })` in `finally`.
  - The main block (lines 102-123) prints the scan JSON and then calls `process.exit(1)` when `ok` is false. Errors print `Script error: ...` to stderr and exit 2.
- **Runner:** `tests/promptfoo/providers/script-runner.js:165-168`. On a non-zero exit it appends stderr after stdout. Today the scan writes nothing to stderr on exit 1, so the output would still be one JSON line, but that is fragile.
- **Exec runner and fixtures:** a `project_root` fixture is copied to a temp directory, and only a top-level `setup.sh` is run (`tests/promptfoo/scripts/extract-skill-content.js:48-67`, noted in wave 18).
- **Test command:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-guard"`. The dataset is wired in `tests/promptfoo/promptfooconfig-exec.yaml:92`.
- **Spec:** the checker is test tooling, not a skill. No `docs/specs/` file states its behaviour, and no user doc or site copy names it (Grep of `docs/` outside `docs/plans/`, `site/src/` outside plans, `tests/promptfoo/README.md`). No spec id is needed.
- **Threat model (from the wave 18 plan, `docs/plans/2026-11-13-lean-w18-remaining-lows.md:324`):** a best-effort lint for fixture authors. Accepted gaps: a quoted mention counts as a git line (fails safe); git run through a variable or alias, or with options between `git` and the subcommand, is not seen; heredoc bodies are read as command lines.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Negative fixture location | no | builds the unguarded `setup.sh` files in a temporary directory inside the checker, not under `fixtures-fs` | A fixture under `fixtures-fs` would need an exclusion rule in the whole-tree scan, and that rule could hide a real unguarded fixture. The brief names the temp-directory option first. |
| Exit code of the new mode | no | `--probe-unguarded` exits 0 even though the scan result is `ok: false` | The mode is a self-test: success means the scan worked. Exit 0 keeps stderr out of the runner output (`script-runner.js:167`). |
| No spec change | no | no `docs/specs/` edit | The checker is test tooling with no spec (Research Findings). |

## Key Decisions

- **Temporary directory, not a checked-in fixture.**
  - Choice: the checker writes two unguarded `setup.sh` files into a new temporary directory and scans it with the same `scanGuards` function.
  - Alternative: a fixture directory under `fixtures-fs` that the whole-tree scan skips by a rule.
  - Why: the alternative adds a skip rule to the real scan. A wrong or too-wide rule could hide a real unguarded fixture. The temporary directory is outside `fixtures-fs`, so case (a) cannot see it, and the scan code stays unchanged.
- **Two files, one per failure branch.**
  - `no-guard/setup.sh` runs `git init -q` with no guard line. `guard-after/setup.sh` runs `git config` before the guard line.
  - Together they cover both `git init` and `git config`, and both conditions of the check at line 75 (guard absent, guard too late).
- **Robust output.**
  - The mode prints exactly one JSON line and exits 0. Case (d) still parses only the first output line, so a future stderr line cannot break `JSON.parse`.
- **The files are scanned, never run.** The mode does not call `bash` or `git`, so it needs no git binary and cannot touch any `.git/config`.

## Decisions taken without the owner

- Lightweight plan route (two files, clear scope): Step 3 critique lanes ran; the Step 5 lens review loop did not.
- Temporary-directory probe instead of a checked-in fixture with a skip rule (Key Decisions).
- `--probe-unguarded` exits 0 (Deviations row 2).
- Threat model moves into the checker header comment (Step 3 finding G1).
- The G17 review-dimension suggestions are recorded below for the owner and are not applied by this plan.

## Contract Examples

```markdown
**Contract:**
- shape (code): new function `probeUnguarded(): { ok: boolean, scanned: number, unguarded: string[] }`
  in `tests/promptfoo/scripts/check-fixture-guard.js`; reached by the CLI flag `--probe-unguarded`;
  prints `JSON.stringify(result)` plus a newline and exits 0; an error exits 2 through the existing catch.
- names: `probeUnguarded`, `--probe-unguarded`.
- mirror: `probe()` at `tests/promptfoo/scripts/check-fixture-guard.js:83-100`.
- decisions: temp directory, not a checked-in fixture (Key Decisions).
- sync: case (d) in `tests/promptfoo/datasets/fixture-guard-exec.yaml` asserts this output.
- example: `node tests/promptfoo/scripts/check-fixture-guard.js --probe-unguarded` prints
  `{"ok":false,"scanned":2,"unguarded":["guard-after","no-guard"]}`.
```

## Tasks

### Task 1: Add the --probe-unguarded mode to the fixture guard checker

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/check-fixture-guard.js` — add `probeUnguarded()`, the `--probe-unguarded` branch in the main block, and a threat-model comment in the header

**Notes:**
Best-effort lint: the threat model and accepted gaps (Research Findings) move from the wave 18 plan into the checker header, so they live next to the code. The new mode tests the reporting path only; it adds no new scan rule, so reviewers report only gaps outside that list. The temp directory sits under `os.tmpdir()`, outside `fixtures-fs`, so case (a) cannot see it. Exit 0 is deliberate (Deviations row 2).

**Acceptance criteria:**
- [ ] `node tests/promptfoo/scripts/check-fixture-guard.js --probe-unguarded` prints exactly one line, `{"ok":false,"scanned":2,"unguarded":["guard-after","no-guard"]}`, and exits 0.
- [ ] The temporary directory is removed after the run, also when the scan throws (`finally`).
- [ ] The header comment block after the W8.29 lines (`check-fixture-guard.js:18-20`) holds the threat-model text from the Contract, word for word.
- [ ] `scanGuards`, `findSetupScripts`, `stripComment`, `isGitLine`, `probe` and `GUARD_LINE` are unchanged.
- [ ] `node tests/promptfoo/scripts/check-fixture-guard.js` (no flag) still prints `ok: true`; `--probe` and `--dir` behave as before.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-guard"` passes cases (a), (b) and (c).

**Contract:**
- shape (code): `function probeUnguarded()` returns `scanGuards(root)` for a fresh temp directory `root`; no arguments; files are written with `fs.mkdirSync` and `fs.writeFileSync`, never executed. Main-block change, before→after:
  ```diff
   try {
     if (process.argv.includes('--probe')) {
       process.stdout.write(JSON.stringify(probe()) + '\n');
  +  } else if (process.argv.includes('--probe-unguarded')) {
  +    // Self-test of the reporting path: exits 0 when the scan ran, whatever it reports.
  +    process.stdout.write(JSON.stringify(probeUnguarded()) + '\n');
     } else {
  ```
  Function body to add after `probe()`:
  ```js
  // Negative self-test: build setup.sh files that must be reported (no guard; guard after git config) in a temp dir
  // outside fixtures-fs, so the whole-tree scan never sees them, and scan them with the real scanGuards.
  function probeUnguarded() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-guard-unguarded-'));
    try {
      const files = {
        'no-guard': ['#!/bin/bash', 'git init -q', ''],
        'guard-after': ['#!/bin/bash', 'git config user.email test@example.com', GUARD_LINE, ''],
      };
      for (const [name, lines] of Object.entries(files)) {
        fs.mkdirSync(path.join(root, name));
        fs.writeFileSync(path.join(root, name, 'setup.sh'), lines.join('\n'));
      }
      return scanGuards(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  ```
  Error case: any throw reaches the existing catch (`Script error: <message>` on stderr, exit 2).
  Header comment to add directly after line 20 (`// directory of a linked worktree rewrites the SHARED .git/config.`):
  ```js
  // Threat model: a best-effort lint for fixture authors. It catches a setup.sh that runs `git init` or `git config`
  // before the guard line. Accepted gaps: a quoted mention (echo "git init") counts as a git line (fails safe); git run
  // through a variable or alias, or with options between `git` and the subcommand (git -C x init), is not seen;
  // heredoc bodies are read as command lines. --probe-unguarded proves that the scan reports an unguarded setup.sh.
  ```
- names: `probeUnguarded`, `--probe-unguarded`, temp prefix `fixture-guard-unguarded-`, directories `no-guard`, `guard-after`.
- mirror: `probe()` at `tests/promptfoo/scripts/check-fixture-guard.js:83-100`; main block at `:102-123`.
- decisions: the `--probe-unguarded` branch is checked before the default scan; `process.argv.includes` matches whole arguments, so `--probe` and `--probe-unguarded` do not collide. Exit 0 (Deviations row 2).
- sync: Task 2 case (d) asserts the exact output above.

### Task 2: Add exec case (d) for the unguarded probe

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/fixture-guard-exec.yaml` — append case (d)

**Notes:**
The assertion parses only the first output line so that an appended stderr line (runner rule at `script-runner.js:167`) cannot break `JSON.parse`. The exact `unguarded` list pins both failure branches. No `|` appears in the assertion, so no regex escaping applies.

**Acceptance criteria:**
- [ ] Case (d) passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "fixture-guard"` reports 4 passed, 0 failed.
- [ ] Cases (a), (b) and (c) are byte-unchanged.
- [ ] Case (d) would fail if `scanGuards` reported nothing (it requires `ok === false` and both names).

**Contract:**
- shape (code): new dataset entry appended at the end of the file:
  ```yaml
  - description: "fixture-guard: (d) an unguarded setup.sh (no guard line, or the guard after git config) is reported"
    vars:
      script_path: "repo://tests/promptfoo/scripts/check-fixture-guard.js"
      script_args: "--probe-unguarded"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.scanned === 2 && r.unguarded.join(',') === 'guard-after,no-guard'"
  ```
- names: case description prefix `fixture-guard: (d)`.
- mirror: case (b) at `tests/promptfoo/datasets/fixture-guard-exec.yaml:10-16`.
- decisions: first-line parse (Key Decisions, robust output); a blank line separates (c) and (d), as between the other cases.
- sync: output shape of Task 1 `probeUnguarded`.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds exec case (d); cases (a)-(c) stay valid and unchanged. |
| no-ci-bypass | error | PASS | No step skips or disables CI checks. |
| no-auto-eval | error | PASS | Only a targeted `--filter-pattern fixture-guard` run on the exec-only config. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Both tasks serve the stated negative-case requirement. |
| single-responsibility-tasks | warning | PASS | Task 1 adds the probe mode; Task 2 adds the test case. |
| scripts-over-llm-logic | error | PASS | Deterministic script logic; no skill instructions changed. |
| yagni | warning | PASS | Only the probe needed for case (d); no extra parameters. |
| cross-skill-consistency | error | PASS | Test tooling only; no skill interaction. |
| pr-link-github-issue | error | PASS | Commit line carries #9386; the PR link is handled at ship. The plan does not state `Fixes #`, and the todo #9385 citation is ambiguous. |
| dry | warning | PASS | Reuses `scanGuards` and `GUARD_LINE`; no copied logic. |
| kiss | warning | PASS | One small function and one dataset entry. |
| spec-first | error | PASS | No SKILL.md change; the checker has no spec (Research Findings). |
| project-agnostic | error | PASS | Edits test tooling of this repo, not plugin behaviour shipped to consumers. |
| flag-coherence-cross-skill | error | PASS | No skill dispatch or SKILL.md flag gates involved. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates touched. |
| flag-resolution-single-source | warning | PASS | `--probe-unguarded` is resolved at a single main-block site. |
| state-premise | error | PASS | Context states the problem: nothing proves an unguarded setup.sh is reported. |
| smallest-viable-cut | warning | PASS | Two tasks, the minimum: probe mode plus its case. |
| failure-audience | warning | PASS | Context names who is affected if this ships wrong (fixture authors, the exec suite) (fixed after Step 3). |
| explicit-non-goals | warning | PASS | Context lists the non-goals (fixed after Step 3). |
| ambiguity-stops-and-asks | error | PASS | Temp dir versus checked-in fixture is recorded in Key Decisions with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch. |
| flag-semantic-consistency-cross-skill | error | PASS | Flag is on a test script, not a user-invoked skill prepare script under scripts/skill. |
| workspace-mode-compatibility | error | PASS | Uses only os.tmpdir and no state, config or git operations; works in both workspace modes. |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md, prepare script or dispatched prompt changed. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 1 adds the CLI flag `--probe-unguarded` to `tests/promptfoo/scripts/check-fixture-guard.js`, with a fixed exit-0 and one-line JSON output that case (d) in Task 2 depends on.

**Severity hint:** high

**Patch:** Add a checklist note that the check-fixture-guard.js CLI flags (--probe, --probe-unguarded, --dir) and their exit codes (0, 1, 2) and one-line JSON output form a contract that dataset cases depend on.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add a checklist note that the check-fixture-guard.js CLI flags (--probe, --probe-unguarded, --dir) and their exit codes (0, 1, 2) and one-line JSON output form a contract that dataset cases depend on.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 2 modifies `tests/promptfoo/datasets/fixture-guard-exec.yaml` by appending case (d), and that YAML path is not yet matched by the code-quality dimension's triggers.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

## Final Shape

- The fixture guard checker has three modes:
  - the default scan (whole `fixtures-fs` tree, or `--dir <path>`);
  - `--probe`, which runs a guarded `setup.sh` inside a git work tree;
  - `--probe-unguarded`, which builds two unguarded `setup.sh` files in a temporary directory and reports the scan result.
- The exec dataset has four cases. Case (d) is the first case that expects `ok: false`.
- Nothing under `tests/promptfoo/fixtures-fs` changes, and the scan rules are unchanged.

## Verification Scorecard

Not applicable — lightweight plan

## OpenSpec Appendix

Not applicable — no OpenSpec change
