# W-B Suite False Passes and Guardrail Table Re-splice Implementation Plan

> ARCHIVED / IMPLEMENTED — PR #119, f782c7e

**Commit:** `test(W-B): tests, plan-sdlc - exec false passes, guardrail re-splice`
**Goal:**
- Make each exec case named in TK-004 fail when the behaviour it covers is broken.
- Add the missing jira P10 case: `flags.forceRefresh` is `false` when `--force-refresh` is absent (TK-005).
- Check the received-review E10 invalid-value stop text, in the script and in SKILL.md (TK-006).
- Stop plan-sdlc from leaving stale `FAIL` rows in `## Guardrail Compliance`: re-splice that table from the newest critique result that holds a guardrail lane, after the R74 re-check and after the last Step 5 iteration (TK-007).
**Architecture:** TK-004 to TK-006 are test-only changes in `tests/promptfoo/datasets/*-exec.yaml`, two test harnesses and two new fixtures; no product code changes for them. TK-007 is spec-first: a new plan-sdlc requirement R77 and an R67 (f) extension in `docs/specs/plan-sdlc.md`, then one new `--critique-dir <dir>` option on `plan.js splice` that picks the newest `iter-<k>/merged.json` with a guardrail payload and writes only `## Guardrail Compliance`, then the SKILL.md and review-loop.md calls. A last task refreshes the two suite baselines (`spec-id-coverage.json`, `dataset-asserts-allow.json`) once.
**Source:** docs/plans/programme.md#W-B
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- Some exec cases pass even when the code they cover is broken. An "exec case" is a promptfoo test that runs a script and checks its output, with no language model. A case like that is a "false pass": it gives a green result that proves nothing.
- The suite audit of 2026-11-18 (ledger F-121, ticket TK-004) named these cases. The line numbers in the ticket have drifted; this plan names each case by its `description`.
- The jira prepare script reports `flags.forceRefresh` (contract P10). Only the `true` side has a case. Nothing checks that the value is `false` without the flag (TK-005).
- The received-review E10 failure (an invalid flag value) has a stop text. The existing cases check only a prefix of it (TK-006).
- plan-sdlc writes a `## Guardrail Compliance` table from the first critique, before the planner fixes the plan. When the planner fixes a guardrail finding, the old `FAIL` row stays. The R74 re-check (the cheap second critique of the Lightweight route) runs the guardrail lane again but never writes the table back (TK-007; ledger F-141, recurred in lean-w36).

**What prompted this change now?**

- Unit W-B of the plan register schedules TK-004 to TK-007. Its dependency W-H2 is done.

**What does success look like?**

- Each fixed case fails when its behaviour is broken on purpose, and the exec suite passes on the current code (TK-004/A1, A2).
- A plan whose guardrail finding was fixed during critique shows no stale `FAIL` row, and the re-splice also runs after the R74 re-check (TK-007/A1, A2).

**Non-goals.**

- No change to product behaviour for TK-004 to TK-006: only tests, two harnesses and fixtures.
- No new false-pass hunt beyond the cases the ticket names (for example compact Cases 1 and 4 stay).
- No re-run of the guardrail lane for a non-blocking FAIL (the R77 accepted gap); no change to `--carry` or R76.
- No register, ticket or TODO-note edits; no change to the orchestrate-lean-sdlc skill.

**Smallest viable cut.** Tasks 11 to 13 (R77) alone close TK-007; each TK-004 task stands alone and can ship without the others. Task 14 must follow every test task.

**Who is hurt if this ships wrong.** A wrong test change hurts maintainers: CI goes red on correct code, or a weak case keeps passing. A wrong `--critique-dir` hurts every plan-sdlc user: the splice call stops the run (`error-report-sdlc`) or the plan shows a wrong guardrail table. Cases `plan-splice: (a)` to `(e)` guard both.

**Items re-verified against HEAD 91fc696.** Every TK-004 item still reproduces; none is dropped. Two items need a note:

- TK-006: `received-review-prepare-exec.yaml` has no case labelled "E10", and line ~364 is now the `rr-skill-text: comment-file source…` case. E10 is defined at `docs/specs/received-review-sdlc.md:183`: "a flag value with a single quote, newline or shell metacharacter, or a `--min-severity` value outside A5's set → failure naming the invalid value". Its stop text lives in two places: the script message `received-review.js:434-437` and the SKILL.md Flags rule (`SKILL.md:128`, "stop and report it as an invalid value"). The plan checks both (F-jira-forcerefresh-and-review-e10-stop-text-3, -5).
- TK-004 `config-resolve :39`: running the harness at HEAD shows `"value": null` for `readSection workspace` on `setup-fully-configured`, so the case title ("returns workspace block") is false today. The fix needs a fixture that holds a `workspace` block (F-exec-case-false-pass-assertions-6).

## Research Findings

The discovery brief has 46 findings in 4 dimensions. The ones that shape the tasks:

**The false-pass cases (TK-004).** Each row is: finding, dataset and case, why it can pass when broken.

| Finding | Dataset · case | Weakness |
|---|---|---|
| F-exec-case-false-pass-assertions-1 | `plan-format-exec.yaml` · "valid plan passes all checks (markdown)" | case-insensitive `PASS` also matches PASS rows of a failing report |
| F-exec-case-false-pass-assertions-2 | `pr-prepare-exec.yaml` · "config present includes prConfig", "no config sets prConfig null" | `"review"` substring; whitespace-dependent `"prConfig": null` |
| F-exec-case-false-pass-assertions-3 | `pr-prepare-exec.yaml` · the two "manifest path" cases | path shape only; the manifest is never opened |
| F-exec-case-false-pass-assertions-4 | `pr-prepare-exec.yaml` · ".sdlc/pr-template.md is resolved", "both templates present" | only a negative check; passes on a crash |
| F-exec-case-false-pass-assertions-5 | `sdlc-dimensions-exec.yaml` · "_common.md is excluded" | `(?!_common\.md)` is a zero-width lookahead and always matches |
| F-exec-case-false-pass-assertions-6 | `config-resolve-sdlc-root-exec.yaml` · "readSection workspace returns workspace block" | `"ok": true` is printed for a null value too |
| F-exec-case-false-pass-assertions-7 | `config-resolve-sdlc-root-exec.yaml` · "verbose trace deduplicates" | `traceDedup:done` is printed whatever the trace does |
| F-exec-case-false-pass-assertions-8 | `harvest-learnings-exec.yaml` · "uses .sdlc path when both exist" | only `!includes('DEPRECATED')` |
| F-exec-case-false-pass-assertions-9 | `review-prepare-exec.yaml` · "plugin_version matching semver or 'unknown'" | `unknown` is accepted, and `unknown` is the failure value |
| F-exec-case-false-pass-assertions-10 | `received-review-prepare-exec.yaml` · plugin_version and reply_footer cases | same `unknown`; `v\S+` accepts `vunknown` |
| F-exec-case-false-pass-assertions-11 | `state-gc-migrate-exec.yaml` · the two `wave-committed` cases | only `not-icontains "Error:"` |
| F-exec-case-false-pass-assertions-12 | `jira-sdlc-exec.yaml` · "fresh install — exists=false, flags echoed" | a one-line array literal can never match pretty-printed JSON |
| F-exec-case-false-pass-assertions-13 | `jira-sdlc-exec.yaml` · "record-occurrence returns 1 on first call" | `n >= 1` |
| F-exec-case-false-pass-assertions-14 | `compact-recovery-sweep-exec.yaml` · "no-op when no compact-recovery files exist" | `Array.isArray` is always true; the fixture has no `.sdlc/execution` |
| F-exec-case-false-pass-assertions-15 | `ship-prepare-exec.yaml` · "VALID_STEPS includes archive-openspec / verify-openspec" | negative only; the stronger cases next to them cover the same steps |
| F-exec-case-false-pass-assertions-16 | `ship-prepare-exec.yaml` · "--gc wins when combined with --plan-mode-blocked" | an `||` lets the weaker side pass; spacing-dependent negative |

**Suite guards that count these files.** Three exec-suite tools read the datasets by count or by description:

- `tests/promptfoo/scripts/check-spec-id-coverage.js` with `baselines/spec-id-coverage.json`: a dataset's assertion count may not drop below its baseline. The floor case `spec-id-coverage: (b)` needs at least 77 datasets, 1817 cases and 2645 assertions; HEAD has 82, 1868 and 2702.
- `tests/promptfoo/scripts/check-dataset-asserts.js` with `baselines/dataset-asserts-allow.json`: seven of its entries name cases this plan fixes or deletes. An entry with no matching finding is only reported as stale; it does not fail.
- `tests/promptfoo/scripts/mutation-smoke.js` selects cases by description patterns, among them `pr\.js: template at` and `wave-committed`. Keeping the case descriptions unchanged keeps those patterns valid.

**The guardrail table (TK-007).**

- `plan.js splice --plan <p> --merged <file> [--no-guardrails]` writes Guardrail Compliance, Suggested Review Dimensions and the Verification Scorecard from one merged file (`plan.js:485-496`, `plan-critique.js:883-915`). The table is written only when `guardrailCompliancePayload` is a string (F-plan-guardrail-table-resplice-1, -2).
- Step 4 splices from `iter-0`, the result from before the fixes (F-plan-guardrail-table-resplice-4). The R74 round writes `iter-1` and SKILL.md says "no splice" (`SKILL.md:471`, `:491`) (F-plan-guardrail-table-resplice-5).
- Gate B in `review-loop.md:52-58` splices after every Step 5 round, but a round's merged file can hold a null payload (a lens-only or checks-only merge), and nothing runs after the loop ends (F-plan-guardrail-table-resplice-6, F-plan-sdlc-spec-and-test-surface-2).
- A full splice from an older file would also rewrite the Scorecard and the dimension suggestions, so the new call must touch the guardrail table only (F-plan-guardrail-table-resplice-8).
- The spec's highest id is R76, so the new id is R77 (F-plan-sdlc-spec-and-test-surface-6). The existing splice cases are `plan-splice: (a)` to `(c)` in `plan-prepare-exec.yaml`; the sentinel `plan-sdlc/critique-rounds` counts splice calls with `>=` floors (F-plan-sdlc-spec-and-test-surface-9).
- `.sdlc/config.json` `plan.copyRules`: a change to plan-sdlc `SKILL.md` or its spec requires `docs/skills/plan-sdlc.md`, its site copy, `site/src/data/skills-meta.ts` and the skill's companion `*.md` files in some task's **Files:**.

**Commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. Every dataset in this plan is in `promptfooconfig-exec.yaml`. Docs and specs have byte copies under `site/src/content-source/`, made with `cp`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| TK-006 "E10 case ~:364" | no | checks the E10 stop text in the script case `rr-scope: (c)` and in the SKILL.md text case `received-review-prepare/skill-text A7 C20` | no case is labelled E10 and :364 moved; E10 has a script message and a SKILL.md rule, so both are checked |
| `config-resolve :39` | no | adds a small fixture with a `workspace` block | the shared fixture holds none, so the case can only pass vacuously; editing the shared fixture could change other cases |
| `ship-prepare :399/:456` | no | deletes the two cases | the ticket says "delete"; the stronger cases next to them cover the same steps |
| `received-review :49/:61` | no | compares to the version in `plugin.json`; the harness keeps its own footer string | importing the production footer would need a new export from `received-review.js`, which is product code outside this test-only item |
| `compact :64` | no | fixes Case 3 only | Cases 1 and 4 are not named in the ticket |
| New `--critique-dir` usage errors | no | exit 1, message on stderr, no JSON on stdout | R67 fixes exit 1 for usage errors of every `plan.js` subcommand; the exit-2 rule (F-151) is for new scripts |
| Baseline refresh | no | one last task runs `--update` and removes stale allowlist entries | the baselines are shared by every test task; one owner per wave (F-43) |

## Key Decisions

**1. Strengthen the cases; do not rename them.**
- Choice: keep each `description` and change only its assertions.
- Alternative: new descriptions that say what is now checked.
- Why: `mutation-smoke.js` and the dataset-asserts allowlist find cases by description. Renaming would break them.

**2. Keep or grow each dataset's assertion count.**
- Choice: add a stronger assertion next to an existing one, or turn a weak one into a strong one; do not merge three assertions into one.
- Alternative: rewrite each case as one JavaScript assertion.
- Why: the spec-id coverage gate fails when a dataset's assertion count drops. Only the ship-prepare deletion lowers a count, and Task 14 records that in the baseline.

**3. Version checks compare with `plugin.json`.**
- Choice: each harness also reports the version read straight from `plugins/sdlc-utilities/.claude-plugin/plugin.json`, and the case asserts equality.
- Alternative: a stricter semver regex.
- Why: a regex still passes when the version lookup returns a wrong but well-formed value. Equality fails on any wrong value, and `unknown` is no longer accepted.

**4. TK-007 adds a script option, not prose.**
- Choice: `plan.js splice --plan <p> --critique-dir <d>` finds the newest `iter-<k>/merged.json` whose `guardrailCompliancePayload` is a string and writes only `## Guardrail Compliance` from it.
- Alternative A: tell the author in SKILL.md to splice `iter-1/merged.json` after R74.
- Alternative B: re-run the full splice after the last Step 6.
- Why: choosing the newest file is logic, and the `scripts-over-llm-logic` guardrail puts logic in scripts. Writing only the guardrail table keeps the Scorecard and the dimension suggestions of the last round (F-plan-guardrail-table-resplice-8). This also settles the brief's contradiction between F-plan-guardrail-table-resplice-6 and F-plan-sdlc-spec-and-test-surface-2: one call after the loop, reading the newest file, covers both readings.

**5. Exact E10 stop text.**
- Choice: the script case asserts the full message with the bad value, `Error: --min-severity must be one of critical, high, medium, low (got "severe").`
- Alternative: keep the prefix check.
- Why: E10 requires that the failure names the invalid value; the prefix check does not prove that.

## Decisions taken without the owner

No owner was available. Each choice below took the recommended, narrowest option:

- TK-006 is read as "the E10 stop text", checked in both places where it lives (script and SKILL.md). See the Deviations table.
- TK-004 `received-review :49/:61`: the harness re-implements the footer; making it import production code is left out (it needs a product export). Equality with `plugin.json` still catches a wrong version.
- TK-007 uses a new `--critique-dir` option on `splice` (Key Decision 4) and a new requirement id R77.
- The two ship-prepare cases are deleted, as the ticket says.
- A new config-resolve fixture is added instead of editing the shared `setup-fully-configured` fixture.

## Contract Examples

Code (Task 12):

```markdown
**Contract:**
- shape (code): `node plan.js splice --plan <path> --critique-dir <dir> [--no-guardrails]` → `{ written, replaced, source }`;
  exactly one of `--merged` / `--critique-dir`, else exit 1 with `plan.js splice error: …` on stderr.
- names: `--critique-dir`, `latestGuardrailMerged(critiqueDir)`, `source`.
- mirror: `runSplice` at `plugins/sdlc-utilities/scripts/skill/plan.js:485-496`.
- decisions: only `## Guardrail Compliance` is written in this mode (Key Decision 4).
- sync: `docs/specs/plan-sdlc.md` R67 (f) and R77 name the same option and output.
```

Docs (Task 13):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/plan-sdlc.md` step 4 of the plan-file lifecycle list: add one sentence on the re-splice (audience: end users).
- names: `## Guardrail Compliance`.
- mirror: the step 4 sentence at `docs/skills/plan-sdlc.md:290`.
- decisions: no script flags in the user doc.
- sync: `site/src/content-source/skills/plan-sdlc.md` is a byte copy.
```

Spec (Task 11):

```markdown
**Contract:**
- shape (openspec): ADD `R77` to `docs/specs/plan-sdlc.md` after R76; MODIFY R67 (f) and R74; numbering continues from R76.
- names: `R77` (new), `R67`, `R74` (modified).
- mirror: the R76 block style at `docs/specs/plan-sdlc.md:88-89`.
- decisions: a new id, because the rule spans R74 and Step 5.
- sync: SKILL.md and review-loop.md cite R77 (Task 13).
```

## Tasks

### Task 1: Plan-format and dimensions false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/plan-format-exec.yaml` — strengthen "plan-format: valid plan passes all checks (markdown)"
- Modify: `tests/promptfoo/datasets/sdlc-dimensions-exec.yaml` — replace the always-true regex in "sdlc-dimensions: _common.md is excluded from validation results"

**Notes:** The markdown report prints PASS rows even when another check fails, so only the summary line and the absence of a FAIL row prove a pass (F-exec-case-false-pass-assertions-1, -5).

**Acceptance criteria:**
- [x] The plan-format case adds `contains` `**Format floor:** PASS` (case-sensitive; the report prints `**Format floor:** PASS | 11/11 …`) and `not-contains` `| FAIL |`, keeping its existing assertions (TK-004/A1).
- [x] The dimensions case replaces the regex `(?!_common\.md)` with `not-icontains` `_common`; the existing total-3 assertion stays (TK-004/A1).
- [~] Each case fails when broken on purpose (the plan-format case pointed at a fixture plan with one failing check; the dimensions case expecting `_common`), run once each, then reverted (TK-004/A1).
  *Skipped on 2026-11-19: the Task 1 worker skipped the break-on-purpose check (DONE_WITH_CONCERNS)*
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-format: valid plan passes all checks|_common.md is excluded"` passes (TK-004/A2).

**Contract:** shape (code): YAML assertion edits only, assertion count per dataset kept or grown; names: `**Format floor:** PASS`, `| FAIL |`, `_common`; sync: Task 14 removes the `empty-regex` allowlist entry for the dimensions case

### Task 2: PR-prepare false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/pr-prepare-exec.yaml` — strengthen six cases: "config present includes prConfig", "no config sets prConfig null", the two "output is … a manifest path" cases, ".sdlc/pr-template.md is resolved", "with both templates present, .sdlc/ wins"

**Notes:** The two manifest-path cases run with `script_passthrough: true`, so their output is the path; a `javascript` assertion can read that file with `require('fs')`, as `fixture-guard-exec.yaml:91` does. Keep each description (mutation-smoke pattern `pr\.js: template at`). Findings: F-exec-case-false-pass-assertions-2, -3, -4.

**Acceptance criteria:**
- [x] "config present includes prConfig": a `javascript` assertion parses the output and checks that `prConfig.requiredLabels` deep-equals the list in the `project-pr-config` fixture config (TK-004/A1).
- [x] "no config sets prConfig null": a `javascript` assertion checks `JSON.parse(output).prConfig === null` (TK-004/A1).
- [x] Both manifest-path cases read the manifest file at the printed path, parse it, and check that it holds the top-level keys `prConfig` and `branchGuard`; the path regex stays (TK-004/A1).
- [x] The two template cases set `script_capture_stderr: true` (so the negative deprecation check sees stderr), keep that check, and add `contains` checks on the `customTemplate` text: ".sdlc/pr-template.md is resolved" contains `SDLC canonical template marker`; "both templates present" contains `SDLC wins precedence marker` and `not-contains` `Legacy fallback marker` (TK-004/A1).
- [x] Each strengthened case fails once when broken on purpose (for example, the expected label list changed or the fixture swapped), then the change is reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^pr-prepare:|^pr.js:"` passes (TK-004/A2).

**Contract:**
- shape (code): YAML assertion edits in six cases; the output and manifest shapes they read:

  ```text
  stdout (pr.js with or without --output-file, script_passthrough): <abs path>/pr-context-<slug>-<ts>-<hex>.json
  manifest JSON top-level keys used: prConfig (object | null), branchGuard, customTemplate (string | null:
  the template text that loadPrTemplate(projectRoot) read, pr.js:560 and :606)
  fixture markers: project-pr-template-sdlc/.sdlc/pr-template.md line 2 "SDLC canonical template marker — fixture for issue #260."
                   project-pr-template-both/.sdlc/pr-template.md line 2 "SDLC wins precedence marker — fixture for issue #260."
                   project-pr-template-both/.claude/pr-template.md line 2 "Legacy fallback marker that should NOT win — fixture for issue #260."
  ```

  The template cases use `contains` on the raw output (stdout and stderr mixed), not `JSON.parse`.
- names: the six descriptions listed under **Files:**, unchanged.
- mirror: the JSON.parse assertion style of `pr-prepare-exec.yaml:236-239`.
- decisions: per-dataset assertion count kept or grown (Key Decision 2); descriptions unchanged (Key Decision 1).
- sync: Task 14 removes the two `negative-only` allowlist entries for the template cases.

### Task 3: Config-resolve false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/config-resolve-sdlc-root-exec.yaml` — the "readSection workspace" case uses the new fixture and checks the value; the "verbose trace deduplicates" case counts trace lines
- Create: `tests/promptfoo/fixtures-fs/config-sdlc-root-workspace/.sdlc/local.json` — local config with a `workspace` block

**Notes:** At HEAD the workspace case prints `"value": null` and still passes. The dedup case runs without `SDLC_CONFIG_QUIET=""`, so it may trace nothing at all; at HEAD with the env set the trace line is `[sdlc:config] read-miss <path>`, printed once. Findings: F-exec-case-false-pass-assertions-6, -7.

**Acceptance criteria:**
- [x] The workspace case points at `file://fixtures-fs/config-sdlc-root-workspace` and asserts `"value": {` and `"mode": "branch"` besides `"ok": true` (TK-004/A1).
- [x] The dedup case sets `script_env: '{"SDLC_CONFIG_QUIET": ""}'` and adds a `javascript` assertion `(output.match(/\[sdlc:config\] read/g) || []).length === 1`; `traceDedup:done` stays (TK-004/A1).
- [x] Broken on purpose, each fails once (the workspace case against `setup-fully-configured`, the dedup case expecting 2), then reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^config-sdlc-root:"` passes (TK-004/A2).

**Contract:**
- shape (code): the new fixture file:

  ```json
  { "schemaVersion": 3, "workspace": { "mode": "branch" } }
  ```

  and the harness output the workspace case reads (`config-sdlc-root-test.js --op readSection`): `{ "ok": true, "value": { "mode": "branch" } }`.
- names: fixture dir `config-sdlc-root-workspace`; descriptions unchanged.
- mirror: the `workspace` block of `fixtures-fs/project-linked-worktree-staged/.sdlc/local.json`; the env line of the "verbose trace emits" case (`config-resolve-sdlc-root-exec.yaml:58-69`).
- decisions: a new fixture, not an edit of the shared one (Deviations).
- sync: none.

### Task 4: Harvest and state-gc false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/harvest-learnings-exec.yaml` — "resolveLogPath uses .sdlc path when both exist (no deprecation)" asserts the resolved path
- Modify: `tests/promptfoo/datasets/state-gc-migrate-exec.yaml` — the two `wave-committed` cases read the state file

**Notes:** `wave-committed` prints nothing on success, so a negative check on `Error:` passes on any silent failure. The two state cases run the command and then read the state through `state/execute.js read` in one `-e` script, the way the received-review cases chain two `spawnSync` calls. Keep the descriptions (mutation-smoke pattern `wave-committed`). Findings: F-exec-case-false-pass-assertions-8, -11.

**Acceptance criteria:**
- [x] The harvest case asserts that the output names `.sdlc/learnings/log.md` and not `.claude/learnings/log.md`, keeping the no-`DEPRECATED` check (TK-004/A1).
- [x] "wave-committed sets committedSha": exit 0, and the state read after the call has `committedSha` `abc1234567890abc1234567890abc1234567890a` on wave 1 (TK-004/A1).
- [x] "wave-committed is idempotent": exit 0, and the state read is the same before and after the call (TK-004/A1).
- [~] Broken on purpose (another sha expected; the harvest fixture swapped to `project-learnings-legacy-only`), each fails once, then reverted (TK-004/A1).
  *Skipped on 2026-11-19: the Task 4 worker skipped the break-on-purpose check (DONE_WITH_CONCERNS)*
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "resolveLogPath|wave-committed"` passes (TK-004/A2).

**Contract:**
- shape (code): the `-e` script output of each state case:

  ```json
  { "status": 0, "stderr": "", "before": "<read JSON before the call>", "after": "<read JSON after the call>" }
  ```
- names: descriptions unchanged.
- mirror: the two-call `spawnSync` chain of `received-review-prepare-exec.yaml:340`.
- decisions: assert on the persisted state, not on stdout (success prints nothing).
- sync: Task 14 removes the two `negative-only` allowlist entries for these cases.

### Task 5: Compact-recovery no-op false pass
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/compact-recovery-sweep-exec.yaml` — Case 3 uses the new fixture and asserts the exact hidden-file list
- Create: `tests/promptfoo/fixtures-fs/project-compact-recovery-noop/setup.sh` — guard and git init lines of the stale fixture, no mtime change
- Create: `tests/promptfoo/fixtures-fs/project-compact-recovery-noop/.sdlc/execution/.unrelated-state.json` — a hidden file the sweep must keep

**Notes:** The old fixture `project-commit-config` has no `.sdlc/execution`, so the list is always empty and the case cannot fail. With one unrelated hidden file present, a sweep that deletes too much makes the list differ. Finding: F-exec-case-false-pass-assertions-14.

**Acceptance criteria:**
- [x] Case 3 points at `file://fixtures-fs/project-compact-recovery-noop` and asserts `exitCode === 0` and `JSON.stringify(data.hiddenFiles) === '[".unrelated-state.json"]'` (TK-004/A1).
- [x] With the expected list changed to `[]` on purpose, the case fails once, then the change is reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^session-start: stale sweep is a no-op"` passes, and so do the fixture-guard cases (`--filter-pattern "^fixture-guard:"`) (TK-004/A2).

**Contract:**
- shape (code): fixture layout and the harness output the case reads (`run-session-start-state.js`):

  ```text
  project-compact-recovery-noop/
    setup.sh                               # guard + git init + empty commit, as project-compact-recovery-stale/setup.sh:1-8
    .sdlc/execution/.unrelated-state.json  # {"note":"not a compact-recovery file"}
  output: { exitCode: 0, hiddenFiles: [".unrelated-state.json"], ... }
  ```
- names: fixture dir `project-compact-recovery-noop`, file `.unrelated-state.json`; description unchanged.
- mirror: `fixtures-fs/project-compact-recovery-stale/setup.sh`.
- decisions: Cases 1 and 4 stay as they are (Deviations).
- sync: none.

### Task 6: Plugin-version checks in review and received-review
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-review-plugin-version.js` — add `expected` (version read from `plugin.json`) to its output
- Modify: `tests/promptfoo/scripts/run-received-review-manifest-fields.js` — add the boolean flag `--with-expected`
- Modify: `tests/promptfoo/datasets/review-prepare-exec.yaml` — the `#363` plugin_version case asserts equality
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — the `#363` plugin_version and reply_footer cases assert equality

**Notes:** `getPluginVersion()` returns `unknown` when it fails, and the old regex accepts `unknown`, so the broken path passes. Each harness reads `plugin.json` on its own path (`REPO_ROOT/plugins/sdlc-utilities/.claude-plugin/plugin.json`), so a wrong lookup in `config-version.js` gives a mismatch. Findings: F-exec-case-false-pass-assertions-9, -10.

**Acceptance criteria:**
- [x] The review case asserts `o.plugin_version === o.expected` and that `o.expected` matches `^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$`; `unknown` is no longer accepted (TK-004/A1).
- [x] The received-review plugin_version case runs `--field plugin_version --with-expected` and asserts `o.value === o.expected` with the same semver check (TK-004/A1).
- [x] The reply_footer case runs `--field reply_footer --with-expected` and asserts that `o.value` equals two newlines, then `_via`, the backticked `received-review-sdlc`, ` v`, `o.expected` and `_` (TK-004/A1).
- [x] Without `--with-expected` the received-review harness prints what it prints today (the `hardenSurfaceHint` case at `received-review-prepare-exec.yaml:100-110` still passes).
- [x] With `getPluginVersion` forced to `unknown` in a scratch edit of `config-version.js`, the three cases fail once, then the edit is reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "#363"` passes (TK-004/A2).

**Contract:**
- shape (code): harness outputs, before → after:

  ```diff
  run-review-plugin-version.js
  - { "plugin_version": "<v>" }
  + { "plugin_version": "<v>", "expected": "<plugin.json version>" }
  run-received-review-manifest-fields.js --field plugin_version|reply_footer
    (no flag)          → raw field text, unchanged
  + --with-expected    → {"value": "<raw field text>", "expected": "<plugin.json version>"}
  ```

  `--with-expected` is a boolean flag; the harness usage line gains ` [--with-expected]`; a missing `--field` keeps today's usage error.
- names: `expected`, `--with-expected`, `value`.
- mirror: the existing harness style of `run-review-plugin-version.js:18-35`.
- decisions: compare with `plugin.json` (Key Decision 3); the footer string stays in the harness (Deviations).
- sync: Task 10 also edits `received-review-prepare-exec.yaml` and runs after this task.

### Task 7: Jira false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — "mcp-failure: record-occurrence returns 1 on first call" and "jira-prepare: fresh install — exists=false, flags echoed"

**Notes:** The counter lives in `os.tmpdir()/sdlc-mcp-session-<id>/`, keyed by `SDLC_SESSION_ID` when set (`mcp-failure.js:247`, `:279`), so a stale directory from an earlier run can make the first call return 2. At HEAD the fresh-install manifest holds `"candidateSites": []` and `"exists": false` (checked on a scratch copy of the fixture). Findings: F-exec-case-false-pass-assertions-12, -13.

**Acceptance criteria:**
- [x] The record-occurrence case is an `-e` script that sets `SDLC_SESSION_ID` to `w-b-<pid>-<Date.now()>`, runs the command twice with that env, removes `os.tmpdir()/sdlc-mcp-session-<id>` afterwards, and asserts the outputs `1` then `2` (TK-004/A1).
- [x] The fresh-install case replaces the never-matching negative with a `javascript` assertion: `const o = JSON.parse(output); Array.isArray(o.candidateSites) && o.candidateSites.length === 0 && o.exists === false`; the other assertions stay (TK-004/A1).
- [x] Broken on purpose (`2` expected first; a non-empty `candidateSites` expected), each fails once, then reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "record-occurrence|fresh install"` passes (TK-004/A2).

**Contract:**
- shape (code): the record-occurrence `-e` output:

  ```json
  { "first": "1", "second": "2" }
  ```
- names: descriptions unchanged.
- mirror: the two-call `spawnSync` chain of `received-review-prepare-exec.yaml:340`.
- decisions: assert exact values, not `>=`.
- sync: Task 9 also edits `jira-sdlc-exec.yaml` and runs after this task.

### Task 8: Ship-prepare false passes
**Ticket:** TK-004 @5c248785
**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — delete the two "VALID_STEPS includes …" cases; tighten the "--gc wins when combined with --plan-mode-blocked" case

**Notes:** The cases next to the deleted ones (`archive-openspec skipped when absent`, `verify-openspec will_run`, `verify-openspec skipped when absent`) already fail when a step is not recognised (F-exec-case-false-pass-assertions-15, -16).

**Acceptance criteria:**
- [x] "ship-prepare: VALID_STEPS includes archive-openspec" and "ship-prepare: VALID_STEPS includes verify-openspec" are gone (−2 cases, −2 assertions in this dataset) (TK-004/A1).
- [x] The `--gc` case asserts `o.action === 'gc' && typeof o.report === 'object' && o.report !== null && !('planModeBlocked' in o)`; the `not-icontains` stays (TK-004/A1).
- [x] The `--gc` case fails once when the expected action is changed on purpose, then reverted (TK-004/A1).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^ship-prepare: (verify-openspec|archive-openspec|--gc wins)"` passes (TK-004/A2).

**Contract:** shape (code): one case tightened, two deleted; names: the three descriptions above; sync: Task 14 records −2 in the spec-id baseline and removes the two `negative-only` allowlist entries

### Task 9: Jira P10 forceRefresh false without the flag
**Ticket:** TK-005 @41e3e209
**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — add one case after "jira-prepare: (P10) --force-refresh is echoed as flags.forceRefresh"

**Notes:** P10 (`docs/specs/jira-sdlc.md:134`) has two sides and only `true` is covered; `jira.js:208` sets the default `false` (F-jira-forcerefresh-and-review-e10-stop-text-1, -2).

**Acceptance criteria:**
- [x] A case `jira-prepare: (P10) without --force-refresh flags.forceRefresh is false` runs `--project FOO --check` on `jira-multi-project-config` and asserts `JSON.parse(output).flags.forceRefresh === false` (TK-005/A1).
- [x] With the default in `jira.js:208` set to `true` in a scratch edit, the case fails once, then the edit is reverted (TK-005/A2).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "\(P10\)"` passes both P10 cases.

**Contract:** shape (code): one new case, vars as in the P10 true case at `jira-sdlc-exec.yaml:314-323` minus `--force-refresh`, one `javascript` assertion; names: `jira-prepare: (P10) without --force-refresh flags.forceRefresh is false`; sync: none

### Task 10: Received-review E10 stop text
**Ticket:** TK-006 @4efa40f5
**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — `rr-scope: (c)` asserts the full stop text; `received-review-prepare/skill-text A7 C20` counts the two E10 sentences of SKILL.md

**Notes:** E10 lives in the script message (`received-review.js:434-437`) and in the SKILL.md Flags rule (`SKILL.md:128`); both are checked, because the skill stops before any Bash call for a metacharacter value (F-jira-forcerefresh-and-review-e10-stop-text-3, -4, -5).

**Acceptance criteria:**
- [x] `rr-scope: (c)` asserts `o.a.stderr.includes('Error: --min-severity must be one of critical, high, medium, low (got "severe").')` in place of the prefix check (TK-006/A1).
- [x] The A7 C20 case adds two counts over SKILL.md, each `=== 1`: the phrase `stop and report it as an invalid value`, and the sentence that starts `` `--min-severity` takes only `` and ends `any other value is reported the same way` (TK-006/A1).
- [x] With one word of the script message or of either SKILL.md sentence changed in a scratch edit, the matching case fails once, then the edit is reverted (TK-006/A2).
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "rr-scope: \(c\)|skill-text A7 C20"` passes.

**Contract:** shape (code): assertion edits in two cases (the `-e` script of A7 C20 gains two `c(...)` counts, with `\x20`-escaped spaces as the case already uses); names: `rr-scope: (c) invalid --min-severity is an error (and an unreadable --plan)`, `received-review-prepare/skill-text A7 C20: …`; sync: none

### Task 11: Spec R77 for the guardrail table re-splice
**Ticket:** TK-007 @603f2b08
**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — add R77, extend R67 (f), amend R74, add an appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-format-reference.md` — check only, no change expected (it does not describe when the splice runs)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/openspec-flow.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/plan-template-default.md` — check only, no change expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/state-format.md` — check only, no change expected (the R20 marker set is unchanged)

**Notes:** Spec first (`spec-first` guardrail): Tasks 12 and 13 implement what this task pins. R77 states its threat model and its accepted gap in the spec, so reviewers report only gaps outside it. Findings: F-plan-guardrail-table-resplice-3, -7; F-plan-sdlc-spec-and-test-surface-6, -7.

**Acceptance criteria:**
- [x] R77 is placed right after R76 under `## Dispatch and routing`, with the text below and its Acceptance line (TK-007/A1, A2).
- [x] R67 (f) reads `splice --plan <p> (--merged <path> | --critique-dir <dir>) [--no-guardrails]` and names the `source` field.
- [x] R74 no longer ends at "no further critique round"; it points to R77.
- [x] The appendix history table gains `| R67, R74, R77 | guardrail table re-splice, W-B (#9453) |`.
- [x] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0, and `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` is silent.

**Contract:**
- shape (openspec): ADD R77; MODIFY R67 (f) and R74. R77 text:

  ```markdown
  - R77 (Guardrail table re-splice): After the R74 re-check and its fixes, and once after the Step 5 loop ends (before Step 6.5), the skill runs `plan.js splice --plan <plan> --critique-dir <critiqueDir>` (plus `--no-guardrails` when `activeGuardrails` is empty). The script reads `<critiqueDir>/iter-<k>/merged.json` for every non-negative integer k, takes the highest k whose `guardrailCompliancePayload` is a string, and writes only `## Guardrail Compliance` from it, replacing the earlier copy (R34 placement). It never writes Suggested Review Dimensions or the Verification Scorecard. With no such file, or with `--no-guardrails`, it writes nothing. Output `{ written, replaced, source }`, `source` the chosen file or null. Threat model: a table written from a result older than the newest guardrail lane result. Accepted gap: a warning-severity FAIL fixed by a non-material edit is carried forward by `--carry` (R64) and can still show.
    - Acceptance: exec cases `plan-splice: (d)` and `plan-splice: (e)` in tests/promptfoo/datasets/plan-prepare-exec.yaml, and the sentinel `plan-sdlc/critique-rounds:`.
  ```

  R67 (f), before → after:

  ```diff
  - (f) `splice --plan <p> --merged <path> [--no-guardrails]` → `{ written, replaced }` (section names).
  + (f) `splice --plan <p> (--merged <path> | --critique-dir <dir>) [--no-guardrails]` → `{ written, replaced }` (section names) with `--merged`, `{ written, replaced, source }` with `--critique-dir` (R77). Exactly one of `--merged` and `--critique-dir`; both or neither is a usage error (exit 1). A `--critique-dir` that is not a readable directory is a usage error.
  ```

  R74, before → after (the sentence about the fixes):

  ```diff
  - The author fixes the blocking issues once; no further critique round.
  + The author fixes the blocking issues once; no further critique round. Then the guardrail table is re-spliced (R77).
  ```
- names: `R77`, `--critique-dir`, `source`.
- mirror: R76 block at `docs/specs/plan-sdlc.md:88-89`; R67 (f) clause at `:213`.
- decisions: a new id, because the rule covers R74 and Step 5; no issue number in the body (appendix only).
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy; Tasks 12 and 13 implement it.

### Task 12: `plan.js splice --critique-dir`
**Ticket:** TK-007 @603f2b08
**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 11
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `--critique-dir` on `splice`, the usage comment, the `SUBCOMMAND_FLAGS` entry
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `latestGuardrailMerged(critiqueDir)`; `splicePlan` option `only`
- Create: `tests/promptfoo/fixtures-fs/plan-splice-latest/iter-0/merged.json` — guardrail payload with a FAIL row, scorecard set
- Create: `tests/promptfoo/fixtures-fs/plan-splice-latest/iter-1/merged.json` — guardrail payload with the PASS row
- Create: `tests/promptfoo/fixtures-fs/plan-splice-latest/iter-2/merged.json` — `guardrailCompliancePayload: null` (a lens-only merge), scorecard set
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — cases `plan-splice: (d)` and `plan-splice: (e)` after `plan-splice: (c)`

**Notes:** The fixture plan is the existing `fixtures-fs/plan-splice/plan.md`, copied to a temp dir as cases (a) to (c) do. k is compared as a number, so `iter-10` comes after `iter-2`. Risk is Medium because `splice` runs on every plan-sdlc run; the `--merged` path must not change, and cases (a) to (c) guard it. Findings: F-plan-guardrail-table-resplice-1, -2, -8; F-plan-sdlc-spec-and-test-surface-12.

**Acceptance criteria:**
- [x] `plan-splice: (d) --critique-dir writes the newest guardrail table only (R77)`: on a plan copy with an old `## Guardrail Compliance` (FAIL row) and an old Scorecard, the call exits 0 and prints `written: ["Guardrail Compliance"]`, `replaced: ["Guardrail Compliance"]` and a `source` ending in `iter-1/merged.json`; the plan holds the PASS row, no FAIL row, and the old Scorecard body unchanged (TK-007/A1).
- [x] `plan-splice: (e) --critique-dir usage and empty cases (R77)`: both flags → exit 1, stderr `plan.js splice error: …`, empty stdout; neither flag → exit 1; an unreadable dir → exit 1; a dir whose only result has a null payload → exit 0, `written: []`, `source: null`, plan unchanged; `--no-guardrails` → exit 0, `written: []`.
- [x] Cases (a) to (c) still pass unchanged.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^plan-splice:"` passes.

**Contract:**
- shape (code):

  ```text
  node plan.js splice --plan <path> --merged <merged.json> [--no-guardrails]   → { written, replaced }           (unchanged)
  node plan.js splice --plan <path> --critique-dir <dir> [--no-guardrails]     → { written, replaced, source }
  usage errors (exit 1, "plan.js splice error: <message>" on stderr, nothing on stdout):
    --merged and --critique-dir both given   → "give exactly one of --merged or --critique-dir"
    neither given                            → same message
    --critique-dir not a readable directory  → "--critique-dir is not a readable directory: <dir>"
    flag without value / unknown flag        → the existing runSubcommand messages
  ```

  ```js
  // plan-critique.js
  /** Newest iter-<k>/merged.json (numeric k) whose guardrailCompliancePayload is a string: { path, merged } or null. */
  function latestGuardrailMerged(critiqueDir) { … }  // throws { code: 'USAGE' } on an unreadable dir; skips unreadable or invalid JSON files
  function splicePlan(text, merged, { noGuardrails = false, only = null } = {})  // only: array of section names; null = all (today)
  ```

  `plan.js` edits, before → after:

  ```diff
   *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] … [--plan <path>] [--compact]
  - *   node plan.js splice --plan <path> --merged <merged.json> [--no-guardrails]
  + *   node plan.js splice --plan <path> (--merged <merged.json> | --critique-dir <dir>) [--no-guardrails]
   *   node plan.js critique-prep --critique-dir <dir> --iter <k> --plan <path> [--github-hosting true|false] [--root <dir>]
  ```

  ```diff
  -  splice: ['plan', 'merged', 'no-guardrails'],
  +  splice: ['plan', 'merged', 'critique-dir', 'no-guardrails'],
  ```

  Workspace modes: `--critique-dir` is the absolute `critiqueDir` under `os.tmpdir()` (P22), and `--plan` is the absolute plan path, so the call reads and writes the same files under `ship.workspace` `branch` and `worktree`; it never resolves a path from the working directory.
- names: `--critique-dir`, `latestGuardrailMerged`, `only`, `source`.
- mirror: `runSplice` at `plan.js:485-496`; `findSection` and `joinAround` at `plan-critique.js:858-876`; the `-e` temp-copy pattern of `plan-prepare-exec.yaml:1532-1554`.
- decisions: only the guardrail section is written (Key Decision 4); usage errors exit 1 per R67 (Deviations). Flag name check: `git grep -n -- '--critique-dir' -- plugins` finds it only on `plan.js critique-prep` (`plan.js:15`) and in `agents/plan-critique-orchestrator.md:61`, with the same meaning (the P22 critique directory); no other skill's prepare script has the flag, so there is no cross-skill conflict.
- sync: R67 (f) and R77 in `docs/specs/plan-sdlc.md` (Task 11); the usage comment at `plan.js:14`.

### Task 13: Re-splice calls in plan-sdlc
**Ticket:** TK-007 @603f2b08
**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 11, Task 12
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — R74 re-check: re-splice after the fixes (agent path and fallback); three edits rendered in the Contract
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — one re-splice when the loop ends, before Step 6.5
- Modify: `docs/skills/plan-sdlc.md` — step 4 of the plan-file lifecycle names the re-splice
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp`)
- Modify: `site/src/data/skills-meta.ts` — check only, no change expected (the plan-sdlc entry names no splice detail)
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — the sentinel `plan-sdlc/critique-rounds:` counts the new call in both files

**Notes:** The call is a plain Bash block by the skill's tool contract: one call, nothing appended, `<PLUGIN_ROOT>` and `<critiqueDir>` substituted as literals (no shell variable crosses calls). `git grep -F` over `tests/` finds no assertion on the changed sentences ("no further critique round", "the `plan.js splice` above has written"), so no other test file changes (F-55). Findings: F-plan-guardrail-table-resplice-5, -6; F-plan-sdlc-spec-and-test-surface-1, -2, -8.

**Acceptance criteria:**
- [x] SKILL.md gets the three edits rendered in the Contract (R74 agent path, fallback item 3, the Step 4 closing paragraph) (TK-007/A2).
- [x] review-loop.md runs the same block once when the review loop ends (Approved, or the max-iterations path resolved), before Step 6.5 (TK-007/A1).
- [x] The sentinel adds `skillLatest` and `loopLatest`, counts of `splice --plan "<PLAN_PATH>" --critique-dir`, each `>= 1`; the existing counts keep their floors.
- [x] `docs/skills/plan-sdlc.md` step 4 adds one sentence: the table is written again from the newest critique result after the re-check and after the review loop, so a fixed finding does not stay as FAIL; the site copy is byte-equal (`cmp` silent).
- [x] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/critique-rounds|plan-sdlc/lightweight-sentinels"` passes.

**Contract:**
- shape (code): the block added in both files (`[--no-guardrails]` when `activeGuardrails` is empty, as in Step 4):

  ```bash
  node "<PLUGIN_ROOT>/scripts/skill/plan.js" splice --plan "<PLAN_PATH>" --critique-dir "<critiqueDir>" [--no-guardrails]
  ```

  followed by: "It writes only `## Guardrail Compliance`, from the newest critique result that holds a guardrail lane (R77). A non-zero exit means stop and invoke `error-report-sdlc`." In review-loop.md it closes the **Review loop:** bullets as "When the loop ends (Approved, or the max-iterations path resolved), before Step 6.5, run once: …".

  SKILL.md edits, before → after (the R74 paragraph that starts "plus the other Step 3 lines"):

  ```diff
  -… `guardrail-block` shows the harden offer above; `ok`: fix the lines of `summary` once. There is no further critique round, no splice, and `guardrailsEvaluated` and `critiqueRan` are not re-written. On `no-agent-tool`, run the fallback below, with `<ITER_DIR>` = `<critiqueDir>/iter-1`:
  +… `guardrail-block` shows the harden offer above; `ok`: fix the lines of `summary` once. There is no further critique round; after the fixes, re-splice the guardrail table (R77, block below the fallback list), and `guardrailsEvaluated` and `critiqueRan` are not re-written. On `no-agent-tool`, run the fallback below, with `<ITER_DIR>` = `<critiqueDir>/iter-1`:
  ```

  Fallback item 3 and the paragraph after it:

  ```diff
  -3. Fix the blocking `issues` in `merged.json` once. There is no further critique round, and `guardrailsEvaluated` and `critiqueRan` are not re-written. <!-- R74 -->
  +3. Fix the blocking `issues` in `merged.json` once. There is no further critique round, and `guardrailsEvaluated` and `critiqueRan` are not re-written. <!-- R74 -->
  +
  +**Guardrail table re-splice (R77):** after the R74 fixes, on the agent path and on the fallback path, run as one plain Bash call:
  +
  +<the bash block above>
  +
  +<the two sentences above> <!-- R77 -->
  ```

  ```diff
  -Step 4 is autonomous (implements R22 single-touchpoint handoff). After fixes are applied (the `plan.js splice` above has written Guardrail Compliance when `activeGuardrails` is non-empty and Suggested Review Dimensions when `g17Findings.findings` is non-empty, per R34), proceed directly …
  +Step 4 is autonomous (implements R22 single-touchpoint handoff). After fixes are applied (the `plan.js splice` above has written Guardrail Compliance when `activeGuardrails` is non-empty and Suggested Review Dimensions when `g17Findings.findings` is non-empty, per R34, and on the Lightweight route the R77 re-splice has run), proceed directly …
  ```
- names: `R77`; sentinel keys `skillLatest`, `loopLatest`.
- mirror: the Step 4 splice block at `SKILL.md:423-429`; the Gate B block at `review-loop.md:52-58`; the sentinel at `plan-prepare-exec.yaml:1296-1304`.
- decisions: one call per place, after the fixes (Key Decision 4).
- sync: `docs/skills/plan-sdlc.md` and `site/src/content-source/skills/plan-sdlc.md` byte copy; R77 text (Task 11).

### Task 14: Suite baselines after the fixes
**Ticket:** TK-004 @5c248785
**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 12, Task 13
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/baselines/spec-id-coverage.json` — refresh with `--update`
- Modify: `tests/promptfoo/baselines/dataset-asserts-allow.json` — remove the entries that are now stale

**Notes:** Each test task keeps or grows its assertion count except Task 8 (−2 in `ship-prepare-exec.yaml`), so `spec-id-coverage: (a)` fails between Task 8 and this refresh. The floors of `spec-id-coverage: (b)` (`cases >= 1817`, `asserts >= 2645`) and `dataset-asserts: (a)` (`cases >= 1817`) keep their values: the suite has 1868 cases at HEAD and grows by 1 net (+2 plan-splice, +1 jira, −2 ship-prepare).

**Acceptance criteria:**
- [x] `node tests/promptfoo/scripts/check-spec-id-coverage.js --update` is run once; in the baseline diff the only drop is the asserts of `datasets/ship-prepare-exec.yaml` (−2), and `R77` appears among the ids of `datasets/plan-prepare-exec.yaml`.
- [x] The allowlist loses the entries that `node tests/promptfoo/scripts/check-dataset-asserts.js` reports as stale, expected seven: `empty-regex` sdlc-dimensions `_common.md`; `negative-only` pr-prepare `.sdlc/pr-template.md` and `both templates`; `negative-only` ship-prepare `VALID_STEPS includes archive-openspec` and `… verify-openspec`; `negative-only` state-gc `wave-committed` (two). No entry is added.
- [x] `node tests/promptfoo/scripts/check-dataset-asserts.js` prints `ok: true`, no findings and an empty `stale` list.
- [x] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "^spec-id-coverage:|^dataset-asserts:"` passes (TK-004/A2).

**Contract:** shape (code): baseline JSON refresh by script plus entry removal by hand; names: the seven allowlist entries above; sync: none

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks carry promptfoo cases (plan-splice d/e, sentinel counts); weak existing assertions are corrected, not only added |
| no-ci-bypass | error | PASS | No CI check is skipped or disabled |
| no-auto-eval | error | PASS | Only targeted exec-only runs with --filter-pattern; broken-on-purpose checks run once and are reverted, no retry loops |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to TK-004 to TK-007; Task 14 baseline refresh is justified in Deviations |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Newest-file selection is moved into plan.js, not SKILL.md prose |
| yagni | warning | PASS | The new option is needed for TK-007 |
| cross-skill-consistency | error | PASS | Only plan-sdlc is affected; review-loop.md companion and docs copies are updated |
| pr-link-github-issue | error | PASS | W-B and TK ids are internal register ids; no Fixes or Closes needed |
| dry | warning | PASS | Reuses splicePlan and existing harness patterns |
| kiss | warning | PASS | One option, a single-section write |
| spec-first | error | PASS | Task 11 (spec) is ordered before Tasks 12 and 13 via Depends on |
| project-agnostic | error | PASS | Changes are in plugin code, skills and plugin tests |
| flag-coherence-cross-skill | error | PASS | No cross-skill dispatch flag gating is introduced |
| no-opposite-logical-vectors | error | PASS | Both re-splice sites use the identical call |
| flag-resolution-single-source | warning | PASS | The option is resolved in plan.js only |
| state-premise | error | PASS | Context states the problem |
| smallest-viable-cut | warning | PASS | Context names the minimal cut (Tasks 11-13 for TK-007; each TK-004 task standalone) |
| failure-audience | warning | PASS | Context names who is hurt (maintainers, plan-sdlc users) |
| explicit-non-goals | warning | PASS | Non-goals list present in Context |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is changed |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are added |
| flag-semantic-consistency-cross-skill | error | PASS | Task 12 gives grep evidence: --critique-dir exists only on plan.js critique-prep with the same meaning |
| workspace-mode-compatibility | error | PASS | Task 12 states absolute critiqueDir and plan paths behave identically under branch and worktree |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 12 adds a `--critique-dir` CLI flag to `plugins/sdlc-utilities/scripts/skill/plan.js splice`, which is a CLI flag contract change.

**Severity hint:** high

**Patch:** Check that the new `plan.js splice --critique-dir <dir>` option (exactly one of --merged or --critique-dir, output `{ written, replaced, source }`, exit 1 on usage errors) is covered by the runtime-contract checklist.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check that the new `plan.js splice --critique-dir <dir>` option (exactly one of --merged or --critique-dir, output `{ written, replaced, source }`, exit 1 on usage errors) is covered by the runtime-contract checklist.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-5, 7-10 and 14 edit exec datasets such as tests/promptfoo/datasets/pr-prepare-exec.yaml and the baseline JSON files, which the current triggers do not cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 3 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 TK-004 (#9424): each listed exec case fails when broken on purpose; suite passes on fixed code | Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 14 | covered |
| 2 TK-005 (#9440): jira case asserting flags.forceRefresh false without the flag | Task 9 | covered |
| 3 TK-006 (#9441): received-review E10 invalid-value case asserts stop text | Task 10 | covered |
| 4 TK-007 (#9453): re-splice Guardrail Compliance table after R74 re-check and last Step 5 iteration | Task 11, Task 12, Task 13 | covered |
| 5 Constraints: spec-first, exec-only targeted runs, cp site copies, Ticket lines, no register edits, count/floor checks, literal-assertion files | Task 11, Task 13, Task 14 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all tasks are done:

- Sixteen weak exec cases now fail when their behaviour breaks. Two redundant ship-prepare cases are gone.
- The jira suite checks both sides of `flags.forceRefresh`.
- The received-review suite checks the full E10 stop text in the script and in SKILL.md.
- `plan.js splice` has a second mode, `--critique-dir`. It writes only the guardrail table, from the newest critique result with a guardrail lane.
- plan-sdlc runs that mode after the R74 re-check and once after the Step 5 loop. A fixed guardrail finding no longer stays as a FAIL row, except for the accepted gap named in R77.
- The suite baselines match the new counts, and the allowlist has no stale entries.

## OpenSpec Appendix

Not applicable — no OpenSpec change
