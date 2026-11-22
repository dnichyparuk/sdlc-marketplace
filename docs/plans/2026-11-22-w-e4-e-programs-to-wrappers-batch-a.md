# W-E4 -e programs to wrappers, batch A Implementation Plan

**Commit:** `test(W-E4): tests - batch A -e programs to wrapper scripts`
**Goal:** Move the 99 inline `script_path: "-e"` programs of four exec datasets into readable wrapper scripts, with byte-identical output and unchanged assertions.
**Architecture:** One table-driven wrapper per dataset under `tests/promptfoo/scripts/`, in the shape of `run-ship-prepare-summary.js` (`--case <name>`, usage errors exit 2). Each converted case changes only `script_path` and `script_args` (github-sdlc also drops its harness env key). A last task refreshes the coverage baseline, whose `-e` flag keys disappear.
**Source:** docs/plans/programme.md#W-E4
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- 99 exec test cases run an inline program: `script_path: "-e"` (node runs the text in `script_args` as code).
- The test runners split `script_args` on whitespace, so each program is one long line with no spaces. It uses escapes such as `\x20` for a space, or hides the code in an environment variable and runs it with `eval`.
- A reviewer cannot read these programs, and a small edit is easy to get wrong.

**What prompted this change now?**

- The owner decided on 2026-11-21 to convert every remaining `-e` program (`docs/TODO/end-e-programs-to-wrappers.md`).
- The programme splits the work into two waves. This wave (W-E4, batch A) covers the four largest datasets. W-E5 (batch B) covers the rest.

**What does success look like?**

- `github-sdlc-exec.yaml`, `ship-hooks-exec.yaml`, `commit-prepare-exec.yaml` and `received-review-prepare-exec.yaml` hold no `script_path: "-e"` case.
- Every converted case keeps its description and its assertion block byte for byte.
- The wrappers print the same stdout (and, for hook cases, the same stderr and exit code) as the old programs, so the same assertions pass.
- The coverage check (`check-spec-id-coverage.js`) is ok again after one reviewed baseline update, and the targeted exec runs pass.

**Who is hurt if this goes wrong?**

- A wrong wrapper fails exec cases in the pre-push hook and in the main session's full exec run, so later waves are blocked.
- Worse, a wrapper that prints the expected shape without running the same steps would let a real plugin regression pass silently. That is why every wrapper case must keep the old program's steps, not only its output.

## Research Findings

Re-verified at HEAD 66663d8 (the base of this wave; the plan is not made ahead):

- **Counts.** `grep -c 'script_path: "-e"'` gives github-sdlc-exec 29, ship-hooks-exec 24, commit-prepare-exec 23, received-review-prepare-exec 23: 99 in all (F-exec-e-case-execution-mechanics-1). Over all datasets the count is 179, so 80 remain for W-E5. No scope item was dropped.

- **How a case runs.** `providers/script-runner.js` (about line 105) spawns `node <script_path> ...script_args.split(/\s+/)`. With `-e` the program is the first token, so it holds no whitespace (F-exec-e-case-execution-mechanics-2). `{{repo_root}}` and `{{project_root}}` are replaced as text before the run. The case runs in `script_cwd`, or in a fresh temp dir when that is unset (F-exec-e-case-execution-mechanics-5).

- **Hook cases.** `ship-hooks-exec.yaml` runs only under `promptfooconfig-exec-hooks.yaml` with `providers/hook-runner.js`. Its output is the JSON envelope `{stdout, stderr, exitCode}`. The assertions of all 24 `-e` cases except the last one read `stderr` (in FAIL messages) and `exitCode`. So a hook wrapper must keep stdout, stderr and the exit code equal (F-exec-e-case-execution-mechanics-3, -8). The hooks config also applies `transformVars: extract-skill-content.js`, which resolves `repo://` paths, so `repo://` works there too.

- **github-sdlc harnesses.** 27 of the 29 cases run `eval(process.env.PARITY_HARNESS)` (3 cases) or `eval(process.env.APPLY_HARNESS)` (24 cases: the anchor case and 23 aliases). The harness code is a YAML block anchor in `script_env` (`&parity_harness` at about line 212, `&apply_harness` at about line 2108). Its argv is `-- <repo root> <key or keys> <run-github-case.js args>` (F-exec-e-case-execution-mechanics-7). The remaining 2 are one-liners: `refresh C15` (about line 1021) and `skill-text A14 C21` (about line 1085). Under `node -e prog -- a b -- c`, `process.argv` is `[node, a, b, '--', c]`, so the harness passes the second `--` on to `run-github-case.js`.

- **C17 dataset check.** The `github-sdlc/c17-dataset-check` case (`run-github-case.js --check-dataset`) requires every case to keep `script_stub_bin`, `script_home` and `SDLC_LINKS_OFFLINE` in `script_env`. Removing only the harness env key keeps it green.

- **Wrapper precedent.** W-F moved 48 programs of `ship-prepare-exec.yaml` into `run-ship-prepare-{ledger,plan-fields,summary}.js` (`docs/archived/plans/2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure.md`, Task 9). Shape: shebang, header that maps each case name to its description, `'use strict'`, `NAME`, `usage()` that exits 2 with nothing on stdout, a repo-root walk-up from `__dirname`, a `CASES` table and `parseCase` (F-wrapper-precedent-shape-3, -6, -7). `run-github-case.js` exports `runCase`, which the apply harness already uses (F-shared-helpers-w-e2-w-e3-3).

- **Shared helpers.** W-E2 and W-E3 added no general helper module. `plugin-json-version.js` is specific to plugin.json (F-shared-helpers-w-e2-w-e3-9). No wrapper name below collides with an existing file.

- **Count and floor checks.** Only `tests/promptfoo/scripts/check-spec-id-coverage.js` breaks. Its baseline (`tests/promptfoo/baselines/spec-id-coverage.json`) holds 11 flag keys of the form `-e --<flag>` (`-e --apply`, `-e --auto`, `-e --check`, `-e --config`, `-e --dry-run`, `-e --dump`, `-e --expect-hash`, `-e --input`, `-e --output-file`, `-e --repo`, `-e --view`), all from these four datasets. They disappear after the move, so the check reports flag drops until one reviewed `--update`; the `spec-id-coverage: (a)` exec case is red until then (F-dataset-count-floor-checks-1, -2). The floors (at least 81 datasets, 1641 cases, 2645 assertions; now 86/1717/2775), `check-dataset-asserts.js` with its allowlist (keyed by description), `check-dataset-regex.js`, `check-fixture-refs.js`, `check-fixture-guard.js` and `mutation-smoke.js` are not affected when no description changes and no case or assertion is removed (F-dataset-count-floor-checks-3 to -6). No check scans the names in `tests/promptfoo/scripts/` (F-dataset-count-floor-checks-7).

- **Comments that describe the old mechanism.** `github-sdlc-exec.yaml` (about lines 196-200 and 2085-2093), `ship-hooks-exec.yaml` (about lines 482-495 and 762-765) and `commit-prepare-exec.yaml` (about lines 460-463) explain the `node -e` harness or the whitespace-free one-liners. A fragment grep (`PARITY_HARNESS`, `APPLY_HARNESS`, `whitespace-free`, `parity_harness`, `apply_harness`) over `tests/`, `plugins/` and live `docs/` finds these words only in these datasets, in old plans and in `ship-prepare-exec.yaml:1785` (unrelated). No test or check script asserts them. A word-fragment grep (plain, `~`-joined and `\x20`-joined) of the reworded sentences ("reused by YAML alias", "no fixture needed", "multi-param arrow", "ONLY var that substitutes", "Spaced values cannot", "argv array from", "invoke it directly", "stamps the fixture") over `tests/` and `tests/promptfoo/scripts/check-*.js` finds them only in the four datasets, and no assertion reads them.

- **Test commands.** Targeted exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`, with `-c promptfooconfig-exec-hooks.yaml` for hook cases. `-j 1` is required (parallel runs hit EISDIR).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| github-sdlc case vars | no | removes the `PARITY_HARNESS` / `APPLY_HARNESS` key (and its anchor block) from `script_env` of the 27 harness cases, besides `script_path` and `script_args` | the harness code moves into the wrapper; the env key would be dead text. The W-F rule "only script_path and script_args change" is kept for every other var |
| Wrapper count | no | one wrapper per dataset (4 new files) | each dataset is one family of one skill; W-F split 48 cases into 3 files by family, here each dataset stays under 30 cases |
| Shared helper module | no | none | the four wrappers share almost no code (different scripts, providers and fixtures); a module would be a speculative abstraction (yagni, kiss) |
| Dataset header comments | no | rewords the comments that explain the `node -e` mechanism in the three datasets that have them | they would be false after the move; no test asserts them (fragment grep in Research Findings) |
| Version bump, CHANGELOG | no | not in the plan | ship's version step makes them |
| Byte-identical proof | no | the targeted exec run with unchanged assertions is the proof, as in W-F | the old programs depend on runner substitution; a separate old-versus-new diff tool would be throw-away work |

## Key Decisions

- **One wrapper per dataset, not one per family.** Each dataset holds 23 to 29 programs of one skill. One file per dataset gives each execute task exactly one dataset and one wrapper, so the four tasks run in parallel with no shared file (F-43).

- **New `run-github-harness.js`, not an extension of `run-github-case.js`.** `run-github-case.js` serves 114 other cases. Adding harness modes there would put risk on all of them. The new wrapper keeps the old harness behaviour: apply calls the exported `runCase` in-process, parity spawns `run-github-case.js`.

- **Harness argv kept positional.** The github wrapper keeps the old harness argv (`parity <key|-> <args…>` and `apply <keys> <args…>`), minus the repo root, which now comes from `__dirname`. So each case's `script_args` keeps its tail byte for byte, and the risk of a typo in 27 cases is small.

- **Hook wrapper keeps stderr and the exit code.** The hook-runner envelope shows stderr and the exit code, and the assertions read both. So `run-ship-hooks-case.js` writes nothing extra to stderr and exits 0 like the old programs (the old programs print with `console.log` and end normally).

- **Programs that run a block from a SKILL.md keep doing so.** The commit `expected-subject gate` case cuts a `node -e '…'` block out of `commit-sdlc/SKILL.md` at run time and spawns `node -e` with it. The wrapper keeps that spawn: it tests the skill text, and it is not a dataset `-e` case.

- **The baseline update is its own last task.** All four dataset tasks change the same baseline file. One final task (after all four) runs the check, confirms that the drops are only the 11 `-e --<flag>` keys, and runs `--update` once.

### Decisions taken without the owner

- **D1: wrapper names** `run-github-harness.js`, `run-ship-hooks-case.js`, `run-commit-prepare-case.js`, `run-received-review-prepare-case.js` (no collision, F-shared-helpers-w-e2-w-e3-9).
- **D2: no shared helper module** (see Deviations).
- **D3: harness env keys are removed** from the 27 github-sdlc cases (see Deviations).
- **D4: the stale comments** of the three datasets are reworded in the same tasks (see Deviations).

## Contract Examples

Worked example — code (Task 3 shape):

```markdown
**Contract:**
- shape (code): `node tests/promptfoo/scripts/run-commit-prepare-case.js --case <name>`; stdout equal to the old
  program's stdout; exit code equal; usage errors exit 2 with the message on stderr and nothing on stdout.
- names: `run-commit-prepare-case.js`, `CASES`, `parseCase`, case names such as `subject-spaces`.
- mirror: `tests/promptfoo/scripts/run-ship-prepare-summary.js:1-218`.
- decisions: one wrapper per dataset (Key Decisions).
- sync: `tests/promptfoo/datasets/commit-prepare-exec.yaml` points 23 cases at it.
- example: `--case subject-spaces` prints `{"status":0,"out":{…}}`.
```

## Tasks

### Task 1: github-sdlc harnesses and one-liners to run-github-harness.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-github-harness.js` — the parity and apply harnesses and the 2 one-liner cases
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — 29 `-e` cases point at the wrapper; harness env keys and anchors removed; the two harness comment blocks reworded

**Notes:** Cites F-exec-e-case-execution-mechanics-7 and F-shared-helpers-w-e2-w-e3-3. The harness bodies move nearly verbatim; only `root` changes source (from argv to the `__dirname` walk-up), so the risk is in the 27 `script_args` edits, which keep their tail unchanged (Key Decisions).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/github-sdlc-exec.yaml` prints `0`, and `grep -c 'HARNESS' tests/promptfoo/datasets/github-sdlc-exec.yaml` prints `0`.
- [ ] The `- description:` count (143) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] Each moved case changes only `script_path`, `script_args` and (harness cases) the removed `PARITY_HARNESS`/`APPLY_HARNESS` key; `script_stub_bin`, `script_home`, the other `script_env` keys and the assertion block stay byte-equal.
- [ ] `node tests/promptfoo/scripts/run-github-harness.js` (no arguments) and `node tests/promptfoo/scripts/run-github-harness.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^github-sdlc/(stub: |apply |refresh C15|skill-text A14|c17-dataset-check)"` passes.

**Contract:**
- shape (code): command-line forms:
  ```text
  node tests/promptfoo/scripts/run-github-harness.js parity <payload key | -> <run-github-case.js args…>
  node tests/promptfoo/scripts/run-github-harness.js apply <payload keys, comma-separated> <run-github-case.js args…>
  node tests/promptfoo/scripts/run-github-harness.js --case refresh-c15 | skill-text-a14
  stdout: exactly what the old program printed (parity and apply write with process.stdout.write, no newline);
  exit code: the old program's exit code
  usage errors (no arguments, parity/apply without a key, an unknown mode, --case without a value or with an unknown name): exit 2, message on stderr, nothing on stdout
  ```
  Everything after the key is passed on verbatim, including the `--` that the old argv carried (`[root, key, ...rest] = process.argv.slice(1)` gave `rest = ['--', …]`). Case vars after the move:
  ```diff
  -    script_path: "-e"
  -    script_args: "eval(process.env.APPLY_HARNESS) -- {{repo_root}} comment -- --apply --input @INPUT@ --dry-run"
  +    script_path: "repo://tests/promptfoo/scripts/run-github-harness.js"
  +    script_args: "apply comment -- --apply --input @INPUT@ --dry-run"
       script_stub_bin: "fixtures-fs/stub-bin-gh-issues/bin"
       script_home: "fixtures-fs/github-sdlc-home"
       script_env:
         SDLC_LINKS_OFFLINE: "1"
         GH_TOKEN: ""
         GH_STUB_DATA: "../../github-sdlc-inputs/payloads-apply.json"
  -      APPLY_HARNESS: &apply_harness |
  -        const fs = require('fs');
  -        …
  ```
- names: modes `parity`, `apply`; cases `refresh-c15`, `skill-text-a14`. Case-to-form map (the 29 `-e` descriptions at HEAD):

  | Form | Descriptions (count) |
  |---|---|
  | `parity` | `github-sdlc/stub:` (3) |
  | `apply` | `github-sdlc/apply` (24) |
  | `--case refresh-c15` | `github-sdlc/refresh C15` (1) |
  | `--case skill-text-a14` | `github-sdlc/skill-text A14 C21` (1) |

- mirror: `tests/promptfoo/scripts/run-ship-prepare-summary.js:1-60` (header, `usage`, repo-root walk-up) and `:203-218` (`parseCase`); the harness bodies are the `&parity_harness` and `&apply_harness` blocks of `github-sdlc-exec.yaml`.
- decisions: Key Decisions (new wrapper, positional harness argv); D3. The two comment blocks keep every other line; the token text (`@INPUT@`, `@HASH:<k>@`, `@HASH@`, `bodies`, 1-based indices) stays:
  ```diff
   # ── in-process stub gh (scripts/gh-inprocess.js) vs the binary (--gh-subprocess) ──
  -# Each case runs `node -e` with the PARITY_HARNESS script (defined once below, reused by YAML alias). Its argv:
  -#   -- <repo root> <payloads-apply.json key | -> <run-github-case.js args>
  +# Each case runs scripts/run-github-harness.js parity. Its argv:
  +#   parity <payloads-apply.json key | -> <run-github-case.js args>
   # It writes that payload to a temp file for @INPUT@, …
  ```
  ```diff
   # and, under `payloads`, their inputs. The runner's --payload reads payloads-core.json only, so each case runs
  -# `node -e` with the APPLY_HARNESS script (defined once below, reused by YAML alias). Its argv:
  -#   -- <repo root> <payload keys, comma-separated> <run-github-case.js args>
  +# scripts/run-github-harness.js apply. Its argv:
  +#   apply <payload keys, comma-separated> <run-github-case.js args>
   # For each key it writes payloads[key] to a temp file, …
  ```
- sync: Task 5 refreshes the coverage baseline for the dropped `-e --<flag>` keys.

### Task 2: ship-hooks programs to run-ship-hooks-case.js

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-ship-hooks-case.js` — 24 cases: pipeline-continue, stop-pipeline-continue, hookEnforcementAllowed, claimSession, cap-exhaustion, hook-runner
- Modify: `tests/promptfoo/datasets/ship-hooks-exec.yaml` — 24 `-e` cases point at the wrapper; the comments at the hookEnforcementAllowed block and before case 16 reworded

**Notes:** Cites F-exec-e-case-execution-mechanics-3 and -8. These are the longest programs (up to about 1300 characters of nested arrow functions); rewriting them as named steps is the main work. The hook-runner envelope exposes stderr and the exit code, so the wrapper must not log anything of its own (Key Decisions).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/ship-hooks-exec.yaml` prints `0`.
- [ ] The `- description:` count (55) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_cwd`, `project_root`, `script_env`, `script_stdin` and the assertion block stay byte-equal.
- [ ] Each wrapper case is the old program reformatted into readable code (named helpers, real string literals instead of `\x20`/`\x22` escapes) with the same steps, the same stdout, an empty stderr where the old one was empty, and exit 0.
- [ ] `node tests/promptfoo/scripts/run-ship-hooks-case.js --case` and `node tests/promptfoo/scripts/run-ship-hooks-case.js --bad` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "^(pipeline-continue|stop-pipeline-continue|hookEnforcementAllowed|claimSession|cap-exhaustion|hook-runner)"` passes.

**Contract:**
- shape (code):
  ```text
  node tests/promptfoo/scripts/run-ship-hooks-case.js --case <name>
  stdout: exactly what the old -e program printed; stderr: nothing of the wrapper's own; exit code: 0, as the old program
  usage errors (no --case, --case without a value, an unknown name, an unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  `{{repo_root}}` inside a program becomes the `__dirname` walk-up root; `{{project_root}}` is the case's `script_cwd`, so the wrapper uses `process.cwd()`. The `hook-runner` case prints `process.cwd()` and the two git env values; the wrapper must not change directory. Case vars after the move:
  ```diff
  -    script_path: "-e"
  -    script_args: '((cp,hook)=>console.log(JSON.stringify(Array(2).fill(0).map(…))))(require("child_process"),"{{repo_root}}/plugins/sdlc-utilities/hooks/pipeline-continue.js")'
  +    script_path: "repo://tests/promptfoo/scripts/run-ship-hooks-case.js"
  +    script_args: "--case r67-second-call-silent"
       script_cwd: "{{project_root}}"
  ```
- names: case names are kebab-case: family tag plus a short tag (for example `r67-second-call-silent`, `cap-reset-on-step-change`, `enforcement-match`, `claim-implicit-resume`, `pause-begin-step-clears`, `hook-runner-temp-cwd`). Case-to-family map (the 24 `-e` descriptions at HEAD):

  | Description family | Count |
  |---|---|
  | `pipeline-continue (R67)` | 1 |
  | `stop-pipeline-continue (Task 6, #505)` | 2 |
  | `stop-pipeline-continue (W4.2)` | 1 |
  | `stop-pipeline-continue (R110)` | 4 |
  | `hookEnforcementAllowed (R73, #505)` | 4 |
  | `claimSession (R73, #505)` | 2 |
  | `pipeline-continue (R73, #505)` | 1 |
  | `cap-exhaustion` | 2 |
  | `stop-pipeline-continue (R-pause)` | 4 |
  | `stop-pipeline-continue (W2.5)` | 2 |
  | `hook-runner` | 1 |

- mirror: `tests/promptfoo/scripts/run-ship-prepare-summary.js:1-218` (header that maps names to descriptions, `usage`, repo-root walk-up, `CASES`, `parseCase`); hook spawning as in `tests/promptfoo/scripts/run-pipeline-continue-rearm.js`.
- decisions: Key Decisions (one wrapper per dataset; hook wrapper keeps stderr and the exit code). Comment edits:
  ```diff
   # hookEnforcementAllowed(data, payload) is pure (no I/O), so the four
  -# predicate cases invoke it directly via `node -e` — no fixture needed.
  -# `script_args` is passed through hook-runner's `.split(/\s+/)`, so each
  -# `-e` body below is a single whitespace-free expression (no `const`/`let`,
  -# multi-param arrow functions instead of block statements).
  +# predicate cases call it directly in tests/promptfoo/scripts/run-ship-hooks-case.js
  +# — no fixture needed.
   #
   …
  -# — not just that the library function works in isolation. The `-e` script
  +# — not just that the library function works in isolation. The wrapper case
   # stamps the fixture's state file with sessionId "sess-A", spawns ship.js
  ```
  ```diff
   #     keeps its nudges instead of being silenced by the creating session's id.
  -#     `script_args` is the ONLY var that substitutes {{repo_root}}, so the claim
  -#     and the hook spawn both happen inside a single whitespace-free `-e`
  -#     expression (hook-runner splits script_args on /\s+/).
  +#     The claim and the hook spawn both happen inside one
  +#     run-ship-hooks-case.js case.
   - description: "pipeline-continue (R73, #505): reclaimed pipeline still nudges the resuming session"
  ```
- sync: Task 5.

### Task 3: commit-prepare programs to run-commit-prepare-case.js

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-commit-prepare-case.js` — 23 cases: commit-subject, commit-trailers, commit-skill-text
- Modify: `tests/promptfoo/datasets/commit-prepare-exec.yaml` — 23 `-e` cases point at the wrapper; the W8.24 comment (about lines 460-463) and the stale header (lines 1-2) reworded

**Notes:** Cites F-exec-e-case-execution-mechanics-9, -11 and F-dataset-count-floor-checks-8. Several programs build temp dirs, message files and argv lists with spaced values that `script_args` could not carry; a wrapper carries them as plain literals. `mutation-smoke.js` filters two `commit-trailers: (G10+)` cases by description, so descriptions must not change (F-dataset-count-floor-checks-6).

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/commit-prepare-exec.yaml` prints `0`.
- [ ] The `- description:` count (54) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; `script_cwd`, `project_root`, `script_env` and the assertion block stay byte-equal.
- [ ] Each wrapper case is the old program reformatted into readable code with the same steps and the same stdout; temp dirs are removed as before.
- [ ] `node tests/promptfoo/scripts/run-commit-prepare-case.js` and `node tests/promptfoo/scripts/run-commit-prepare-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^commit-(subject|trailers|skill-text)"` passes.

**Contract:**
- shape (code):
  ```text
  node tests/promptfoo/scripts/run-commit-prepare-case.js --case <name>
  stdout: exactly what the old -e program printed; exit code: exactly the old program's exit code
  usage errors (no --case, --case without a value, an unknown name, an unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  The `expected-subject gate` case still reads `plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md`, cuts the block between `node -e '` and `' "<COMMIT_CONTEXT_FILE>"`, and spawns `node -e <block> <context> <message>` for its four probes (Key Decisions). Case vars after the move:
  ```diff
  -    script_path: "-e"
  -    script_args: '((cp,fs,js)=>…)(require("child_process"),require("fs"),"{{repo_root}}/plugins/sdlc-utilities/scripts/skill/commit.js")'
  +    script_path: "repo://tests/promptfoo/scripts/run-commit-prepare-case.js"
  +    script_args: "--case subject-spaces"
       script_cwd: "{{project_root}}"
       project_root: "file://fixtures-fs/project-commit-no-config"
  ```
- names: kebab-case case names, family tag plus a short tag (for example `subject-spaces`, `subject-empty`, `subject-73-chars`, `subject-message-file`, `subject-gate`, `trailers-lf`, `trailers-crlf`, `skill-text-fallback`). Case-to-family map (the 23 `-e` descriptions at HEAD):

  | Description family | Count |
  |---|---|
  | `commit-subject:` | 8 |
  | `commit-trailers:` | 12 |
  | `commit-skill-text:` | 3 |

- mirror: `tests/promptfoo/scripts/run-ship-prepare-summary.js:1-218`; `tests/promptfoo/scripts/run-commit-literal-message.js` for commit.js spawning.
- decisions: Key Decisions (one wrapper per dataset; SKILL.md block spawn kept). Comment edits:
  ```diff
  -# Script execution tests for skill/commit.js (commit-sdlc prepare).
  -# These tests run commit.js directly against fixture directories (no LLM).
  +# Script execution tests for skill/commit.js (commit-sdlc prepare), run directly or through
  +# tests/promptfoo/scripts/run-commit-prepare-case.js against fixture directories (no LLM).
  ```
  ```diff
   # W8.24 — commit-sdlc takes the planned subject (A7–A9, R-subject-verbatim, R-message-file,
  -# R-expected-subject, R-subject-precheck, R-script-prune). Spaced values cannot pass through
  -# script_args (split on whitespace), so these cases spawn commit.js with an argv array from a
  -# whitespace-free `node -e` one-liner (\x20 = space, \x27 = ', \x22 = ").
  +# R-expected-subject, R-subject-precheck, R-script-prune). Spaced values cannot pass through
  +# script_args (split on whitespace), so these cases run run-commit-prepare-case.js, which
  +# spawns commit.js with an argv array.
  ```
- sync: Task 5.

### Task 4: received-review-prepare programs to run-received-review-prepare-case.js

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-received-review-prepare-case.js` — 23 cases: rr-output-file, rr-skill-text, rr-comment-file, rr-scope, rr-verify, rr-refusal, received-review-prepare (R37 and skill-text A7 C20)
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — 23 `-e` cases point at the wrapper

**Notes:** Cites F-exec-e-case-execution-mechanics-10. Most programs count substrings of SKILL.md and agent files or spawn `received-review.js` once, so this is the simplest of the four. A program that reads skill text keeps reading the same files at run time.

**Acceptance criteria:**
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/received-review-prepare-exec.yaml` prints `0`.
- [ ] The `- description:` count (33) and the assertion-line count of the dataset are unchanged, and no description text changes.
- [ ] For each moved case only `script_path` and `script_args` change; every other var and the assertion block stay byte-equal.
- [ ] Each wrapper case is the old program reformatted into readable code with the same steps and the same stdout.
- [ ] `node tests/promptfoo/scripts/run-received-review-prepare-case.js` and `node tests/promptfoo/scripts/run-received-review-prepare-case.js --case nope` each exit 2 with the message on stderr and nothing on stdout.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^(rr-|received-review-prepare)"` passes.

**Contract:**
- shape (code):
  ```text
  node tests/promptfoo/scripts/run-received-review-prepare-case.js --case <name>
  stdout: exactly what the old -e program printed; exit code: exactly the old program's exit code
  usage errors (no --case, --case without a value, an unknown name, an unknown flag): exit 2, message on stderr, nothing on stdout
  ```
  ```diff
  -    script_path: "-e"
  -    script_args: '…'
  +    script_path: "repo://tests/promptfoo/scripts/run-received-review-prepare-case.js"
  +    script_args: "--case scope-plan-allowed-files"
  ```
- names: kebab-case case names (for example `output-file-noop`, `skill-text-own-checks`, `comment-file-parsed`, `scope-plan-allowed-files`, `scope-check-prefix`, `refusal-r36`). Case-to-family map (the 23 `-e` descriptions at HEAD):

  | Description family | Count |
  |---|---|
  | `rr-output-file:` | 1 |
  | `rr-skill-text:` | 6 |
  | `received-review-prepare/skill-text A7 C20` | 1 |
  | `rr-comment-file:` | 3 |
  | `received-review-prepare (R37)` | 1 |
  | `rr-scope:` | 9 |
  | `rr-verify:` | 1 |
  | `rr-refusal:` | 1 |

- mirror: `tests/promptfoo/scripts/run-ship-prepare-summary.js:1-218`; `tests/promptfoo/scripts/run-received-review-manifest-fields.js` for spawning `received-review.js`.
- decisions: Key Decisions (one wrapper per dataset).
- sync: Task 5.

### Task 5: coverage baseline after the move

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — `--update` after the drops are confirmed to be only `-e --<flag>` keys

**Notes:** All four dataset tasks change the baseline's flag keys, so one task after them owns the file (F-43, F-dataset-count-floor-checks-1, -2).

**Acceptance criteria:**
- [ ] Before the update, `node tests/promptfoo/scripts/check-spec-id-coverage.js` reports drops only for flag keys that start with `-e ` (at most the 11 listed in Research Findings); if any other drop appears, stop and report it instead of updating.
- [ ] After `node tests/promptfoo/scripts/check-spec-id-coverage.js --update`, the check prints `"ok":true` with `cases` and `asserts` unchanged against the pre-wave run (1717 and 2775 at HEAD 66663d8), and `git diff tests/promptfoo/baselines/spec-id-coverage.json` shows only removed `-e --<flag>` keys and added keys of the four new wrappers.
- [ ] `grep -c 'script_path: "-e"' tests/promptfoo/datasets/*.yaml | awk -F: '{s+=$2} END {print s}'` prints `80` (179 minus 99).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^spec-id-coverage"` passes.

**Contract:** shape (code): baseline JSON regenerated by `check-spec-id-coverage.js --update`; names: `tests/promptfoo/baselines/spec-id-coverage.json` `flags` keys; sync: Tasks 1-4

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The change is test-only. Existing exec cases are repointed with assertions kept, and each task runs its targeted exec cases. |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled. The baseline refresh is a reviewed --update of a coverage check. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on exec-only configs (no LLM provider), with no retry loops. |
| skill-docs-required | error | PASS | No SKILL.md is created. |
| no-scope-creep | warning | PASS | Tasks cover the 99 programs plus the baseline and comments that the move makes stale. Deviations are tabled. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable: one wrapper and its dataset, or the baseline. |
| scripts-over-llm-logic | error | PASS | The change moves logic into deterministic scripts and adds no LLM instructions. |
| yagni | warning | PASS | No shared helper module is added, and the plan says so explicitly. |
| cross-skill-consistency | error | PASS | No skill behaviour changes. The shared run-github-case.js runCase is reused and left unmodified. |
| pr-link-github-issue | error | PASS | W-E4 is a register unit id, not a GitHub issue, so the rule does not apply. |
| dry | warning | PASS | The wrappers share almost no code. The harness bodies move once and reuse runCase. |
| kiss | warning | PASS | One table-driven wrapper per dataset, mirroring the existing run-ship-prepare-summary.js. |
| spec-first | error | PASS | No SKILL.md or behaviour change, so no spec update is needed. |
| project-agnostic | error | PASS | Only the repo's own test tooling changes, which is dogfooding. Plugin behaviour is untouched. |
| flag-coherence-cross-skill | error | PASS | No skill dispatches or flag gates are changed. |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are touched. |
| flag-resolution-single-source | warning | PASS | No contractual flags are introduced. |
| state-premise | error | PASS | Context states the problem: 99 inline -e programs that cannot be read or safely edited. |
| smallest-viable-cut | warning | PASS | One wrapper per dataset. The last baseline task is justified in Key Decisions, and the remaining 80 programs are deferred to W-E5. |
| failure-audience | warning | PASS | Context, "Who is hurt if this goes wrong?", names the pre-push hook, the full exec run and silent regressions. |
| explicit-non-goals | warning | PASS | Deviations excludes the shared helper, version bump, CHANGELOG and the old-versus-new diff tool. W-E5 batch B is excluded as well. |
| ambiguity-stops-and-asks | error | PASS | The wrapper layout, the new harness wrapper and the removed env keys are recorded as Key Decisions or D1-D4 with rationale. |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic changes. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved. |
| flag-semantic-consistency-cross-skill | error | PASS | --case lives in test wrappers, not in skill prepare scripts, so it is out of scope. |
| workspace-mode-compatibility | error | PASS | No state, config or path logic changes. Wrappers resolve the repo root from __dirname. |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are touched. |

## Suggested Review Dimensions

### UPDATE: code-quality (U1)

**Why:** Tasks 1-4 modify the exec datasets `tests/promptfoo/datasets/github-sdlc-exec.yaml`, `ship-hooks-exec.yaml`, `commit-prepare-exec.yaml` and `received-review-prepare-exec.yaml`, and Task 5 modifies `tests/promptfoo/baselines/spec-id-coverage.json`. Those files are not covered by the dimension's current triggers.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

### CREATE: tests-review

**Why:** Task 5 regenerates `tests/promptfoo/baselines/spec-id-coverage.json` with `check-spec-id-coverage.js --update`. No existing dimension covers that file, and its flag-key drops need a test-focused review.

**Severity hint:** low

**Triggers:** `tests/promptfoo/baselines/spec-id-coverage.json`

**Action (dimension):** /setup-sdlc --dimensions — add `tests-review` with triggers `tests/promptfoo/baselines/spec-id-coverage.json`

**Action (Copilot mirror, X1):** regenerate .github/instructions/tests-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Convert the 29 `script_path: "-e"` cases of github-sdlc-exec.yaml to a wrapper script | Task 1 | covered |
| 2 Convert the 24 `-e` cases of ship-hooks-exec.yaml (hook-runner provider) to a wrapper script | Task 2 | covered |
| 3 Convert the 23 `-e` cases of commit-prepare-exec.yaml to a wrapper script | Task 3 | covered |
| 4 Convert the 23 `-e` cases of received-review-prepare-exec.yaml to a wrapper script | Task 4 | covered |
| 5 Wrappers print byte-identical output; assertions and descriptions unchanged | Task 1, Task 2, Task 3, Task 4 | covered |
| 6 No case or assertion lost against the coverage baseline; exec suite passes | Task 1, Task 2, Task 3, Task 4, Task 5 | covered |
| 7 Out of scope: batch B datasets, register/region/ticket/TODO edits, lows notes, assertion changes | — | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- Four new wrappers live in `tests/promptfoo/scripts/`: `run-github-harness.js`, `run-ship-hooks-case.js`, `run-commit-prepare-case.js` and `run-received-review-prepare-case.js`.

- Each wrapper is readable code. Its header maps every case name to the dataset description that uses it. A wrong call exits 2 with a message on stderr.

- The four datasets hold no `script_path: "-e"` case. Their cases name a wrapper and a case (or, for github-sdlc, a harness mode and its arguments). Descriptions, fixtures, env values and assertions are unchanged.

- The github-sdlc dataset no longer carries the two harness programs in YAML anchors.

- The coverage baseline no longer lists `-e --<flag>` keys, and lists the wrappers' keys instead. Case and assertion counts are unchanged.

- 80 `-e` programs remain in other datasets for W-E5.

## OpenSpec Appendix

Not applicable — no OpenSpec change
