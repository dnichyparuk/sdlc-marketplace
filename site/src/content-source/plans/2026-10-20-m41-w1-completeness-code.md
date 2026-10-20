# Verifying Execute Cleanup and Scoped Completeness Gate — Code and Docs (W8.22 Change 2) Implementation Plan

**Goal:** Make `state/execute.js cleanup` check completeness before it deletes the execute state file, and make ship's completeness gate run only when an execute state file exists, so ship stops halting after every successful execute (W8.22 Change 2).
**Architecture:** The completeness verdict moves out of `cmdVerifyCompleteness` into a pure function `completenessOf(data)` that both `verify-completeness` (unchanged output) and `cleanup` (new check) call. Ship's `--after dispatch_execute` path asks `findStateFile` first and records `completenessGate: "no-execute-state"` when there is no file. SKILL.md and the two docs pages state the new behaviour; `site/` is refreshed later by the wave's copy-docs commit.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/wave-1-plan-source.md (item W8.22, Change 2; plan §0; readings R-F7, R-order, R-dated, R-installed), /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/preflight-wave-1.md, discovery brief F-execute-state-cleanup-verify-split-*, F-ship-completeness-gate-site-*, F-execute-skill-and-docs-sites-*
**Verification:** from `tests/promptfoo`, with `mkdir -p /tmp/claude-1000/pf-tmp-exec-m41` first: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m41 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-step: \((t|u|u3|eh3a|eh3b)\)|execute-plan-sdlc/wave-runner-overflow/verify-completeness" --no-cache` passes 8 of 8; then `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

---

## Context

**What problem does this change solve?**

- Ship halts after every successful execute run (todo #9123, shipped v0.26.0 to v0.29.0).
- Ship runs `verify-completeness` after each successful execute dispatch. Execute has already deleted its state file (R14), or never wrote one (R5, small plans). The script then exits 1, and ship halts.
- The spec commit (plan 1) settled the rule: execute's cleanup verifies before it deletes, and ship's gate runs only when a state file exists. This plan implements it.

**What prompted this change now?**

Every M4 wave 3b ship run needed a manual `complete-step` bypass. The owner ruled "R14 wins + verifying cleanup" on 2026-10-20 and made the fix PRIORITY for M4.1 wave 1.

**What does success look like?**

- `cleanup` deletes a state file only when the completeness check passes. Otherwise it keeps the file, prints the same stderr as `verify-completeness`, and exits 65 or 2.
- `verify-completeness` prints byte-identical output and exit codes.
- Ship records execute completed with `completenessGate: "no-execute-state"` when there is no state file, and still halts when a state file fails the check.
- The existing "state file present" cases (t), (u), (u3), (eh3a), (eh3b) and the three `verify-completeness` cases still pass.

## Research Findings

- `state/execute.js` (LF):
  - `cmdCleanup` reads the state with `readState`, exits 0 when there is none, and otherwise deletes it unchecked (F-execute-state-cleanup-verify-split-2).
  - `cmdVerifyCompleteness` declares `ACCOUNTED_STATUSES` first, then looks the state up (`--state-file` or branch; no file → exit 1), then computes the verdict from `const { data } = found;` to `process.exit(65);`. `normalizeId` is nested inside it (F-…-3).
  - The exit-2 message is a fixed string ending in `\n` (F-…-4).
  - The header exit-code block lists 0, 1 and 2 (F-…-1).
- `lib/state.js`:
  - `findStateFile(prefix, branchSlug)` returns `{ file, fullPath }` or `null`, and is exported (F-…-5).
  - `readState` returns `null` for a corrupt file after a stderr warning. So cleanup treats a corrupt file as "no state" and does not delete it, while ship's `findStateFile` still sees it and runs the check. This matches the spec's "a corrupt file counts as existing" (F-…-5).
- `skill/ship.js`:
  - `:44` imports `readState` and `slugifyBranch` but not `findStateFile` (F-ship-completeness-gate-site-1).
  - The gate block sits at 2-space indent. The item's fenced snippet carries the markdown list indent; strip it so the code sits at ship.js's 2-space nesting (F-…-2).
  - `output` is the object pushed as the history entry's `data`, after the gate. `output.source = 'user-attested'` in the `execute_handoff` block is the precedent (F-…-4).
  - `runCompletenessGate` and the `execute_handoff` block are must-not-touch (F-…-3, F-…-5).
- `execute-plan-sdlc/SKILL.md`: the only `node "$STATE_SCRIPT" cleanup` command is in Step 5 (`:649`). Step 9's **State file cleanup:** (`:833`) is prose (F-execute-skill-and-docs-sites-1, -2).
- Docs: `docs/skills/execute-plan-sdlc.md:415` and `docs/skills/ship-sdlc.md:539`, `:543` state the gate without the new scope (F-…-4, -5).
- Test harness facts used for verification: the ship stepper's fixture branch is `feat/ship`, and `slugifyBranch('feat/ship')` = `feat-ship`, `slugifyBranch('fix/cleanup')` = `fix-cleanup` (run at 7a002fb).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| R-F7 pointer at SKILL.md Step 5 cleanup line | no | appends one parenthetical to the `node "$STATE_SCRIPT" cleanup` line | reading R-F7 orders a pointer there and relaxes "SKILL.md outside `:833`" for it only; its wording is not given, so the plan pins the shortest wording that names R14 and the Step 9 rule |
| Header line position | no | the `65 =` line goes after the `2 =` line | the item says "add the line"; ascending code order is the existing order of the block |
| Gate snippet indentation | no | re-indented to the file's 2-space nesting | the item's fenced snippet carries the markdown list indent; strip it so the code sits at ship.js's 2-space nesting |
| Case (u2) during this plan | no | excluded from this plan's test run | (u2) asserts the old defect (exit 1); plan 3 rewrites it. Running it here would fail by design |
| Spec pre-condition | no | Task 1 starts with a grep of the amended spec sentences and STOPs if absent | the source requires plan 2 to cite the amended spec lines as present |
| `site/` | no | untouched | the source: copy-docs runs once at the wave end |

## Key Decisions

**Problem in one sentence:** ship's completeness gate requires an execute state file that execute deletes on success (R14) or never writes (R5), so every successful execute halts ship.

- **One verdict function, two callers.** `completenessOf(data)` holds the check once. `verify-completeness` and `cleanup` both call it, so the two can never disagree (guardrail `dry`). The alternative, spawning `verify-completeness` from `cleanup`, adds a process and a second state lookup.

- **The verdict function does not print or exit.** It returns `{ code, out | err }`. A small printer `writeCompleteness(v)` writes exactly the bytes `cmdVerifyCompleteness` writes today. Each caller then exits. This keeps `verify-completeness` output byte-identical.

- **Ship decides by file existence (`findStateFile`), not by exit code.** It does not special-case exit 1 (item guardrail). `findStateFile` also sees a corrupt file, so a corrupt file still runs the check and fails loudly.

- **Record why the check was skipped.** `output.completenessGate = 'no-execute-state'` goes into the history entry, as `output.source = 'user-attested'` already does at `execute_handoff`. A reader of the ledger can tell a skipped check from a passed one.

- **Tests come in plan 3.** The item splits W8.22 into three commits. This plan proves no regression with the existing exec cases and with direct script probes. Plan 3 adds the new cases and rewrites (u2).

- **Non-goals.**
  - No change to `runCompletenessGate`, the `execute_handoff` block, `verify-completeness`'s output, exit codes or `--state-file` path.
  - No change to Step 5f, R5's small-plan text or any other SKILL.md line except the two named.
  - No change to the installed plugin 0.21.29 (reading R-installed). No `site/` edit.
  - The stale `verify-completeness --run-id <id>` usage line in the header stays (F-…-7).

- **Failure audience.** Every ship run. A wrong gate either halts again after each execute (today's defect) or lets an incomplete execute pass to commit. A wrong cleanup either deletes an incomplete state (loses `--resume`) or never deletes a complete one.

- **Workspace modes.** `findStateFile`, `readState` and `deleteState` all go through `resolveStateDir()`, which is the main worktree's `.sdlc/execution/` in both `ship.workspace=branch` and `worktree` mode. No path logic changes.

## Contract Examples

**code** (taken from Task 1):

```markdown
**Contract:**
- shape (code): `completenessOf(data: object): {code: 0, out: {ok: true, totalPlanned: number, totalAccounted: number}} | {code: 65, err: {missingIds: string[], totalPlanned: number, totalAccounted: number}} | {code: 2, err: string}`; `writeCompleteness(v): void`; `cmdCleanup` exits 0 | 65 | 2.
- names: `completenessOf`, `writeCompleteness`, `cmdCleanup`, `cmdVerifyCompleteness`.
- mirror: the current body of `cmdVerifyCompleteness` (`state/execute.js:1052-1117`).
- decisions: verdict is pure; printing and exit stay in the callers.
- sync: `verify-completeness` stdout/stderr byte-identical; exec cases in `execute-plan-sdlc-overflow-exec.yaml`.
```

**docs** (taken from Task 4):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md` `## Post-execute completeness gate`: scope the first sentence; replace the "What triggers it" sentence. Audience: plugin users.
- names: section `## Post-execute completeness gate`; ledger field `completenessGate`.
- mirror: ship spec R-INVARIANT-COMPLETENESS Scope sentence (plan 1).
- decisions: user-facing wording; no code references beyond the script name.
- sync: `docs/specs/ship-sdlc.md` R-INVARIANT-COMPLETENESS.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The changed behaviour gets promptfoo cases in plan 3 (same wave, item's three-commit split); this plan re-runs the existing cases, which must still pass, and (u2), whose asserted behaviour changes, is rewritten in plan 3 |
| no-ci-bypass | error | PASS | No CI step skipped; (u2) is excluded only from this plan's local targeted run and is rewritten in plan 3 before the PR |
| no-auto-eval | error | PASS | Only targeted runs of the exec config (no LLM provider) |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Only the item's sites plus the R-F7 pointer |
| single-responsibility-tasks | warning | PASS | Four tasks, one deliverable each |
| scripts-over-llm-logic | error | PASS | The check moves from SKILL.md prose order into the cleanup script |
| yagni | warning | PASS | Two small functions, both used by two callers or one printer |
| cross-skill-consistency | error | PASS | Ship's dispatch gate now matches its `execute_handoff` scoped form and execute's R14 |
| pr-link-github-issue | error | PASS | Local todo only; no GitHub issue to link |
| dry | warning | PASS | One verdict function for both verbs |
| kiss | warning | PASS | No new flags or files |
| spec-first | error | PASS | Plan 1's spec commit lands before this one; Task 1 STOPs if the amended spec sentences are absent |
| project-agnostic | error | PASS | All changes are in plugin code and plugin docs |
| flag-coherence-cross-skill | error | PASS | No flags added or read |
| no-opposite-logical-vectors | error | PASS | Both ship gate sites (dispatch and `execute_handoff`) now gate on "execute state file exists" |
| flag-resolution-single-source | warning | PASS | No flags |
| state-premise | error | PASS | Key Decisions states the problem in one sentence |
| smallest-viable-cut | warning | PASS | Code + the two docs pages the item names; tests are a separate plan per the item |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | Pointer wording, header position and indentation are recorded in the Deviations table |
| state-machine-idempotency | error | PASS | `cleanup` stays idempotent: on a kept file a re-run returns the same code; after a delete a re-run exits 0 (no file). Plan 3's cases cover both outcomes |
| agent-dispatch-script-driven | error | PASS | No agent dispatch changes |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag |
| workspace-mode-compatibility | error | PASS | All lookups use `resolveStateDir()` (Key Decisions, Workspace modes) |
| prompt-cache-hit-ratio | warning | PASS | The SKILL.md edits are static text; no volatile bytes |

## Suggested Review Dimensions

### UPDATE: runtime-contract (U2, B1)

**Why:** Plan modifies plugins/sdlc-utilities/scripts/state/execute.js and scripts/skill/ship.js (subdirectories not matched by the trigger `**/scripts/*.js`) and changes the `cleanup` CLI exit-code contract (new exit 65/2 with state file kept) plus ship's gate behaviour, which is exactly this dimension's exit-code semantics scope.

**Severity hint:** high

**Patch:** Add trigger `**/scripts/**/*.js` so nested script directories (state/, skill/, lib/) are reviewed for exit-code and JSON-contract agreement.

**Action (dimension):** /review-sdlc --dimensions runtime-contract after editing .sdlc/review-dimensions/runtime-contract.md to add the trigger `**/scripts/**/*.js`

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: hook-readiness (U2)

**Why:** Plan modifies scripts/state/execute.js and scripts/skill/ship.js, which sit in subdirectories outside the trigger `**/scripts/*.js`, so this dimension never sees them.

**Severity hint:** medium

**Patch:** Widen trigger `**/scripts/*.js` to `**/scripts/**/*.js`.

**Action (dimension):** Edit .sdlc/review-dimensions/hook-readiness.md frontmatter triggers: replace `**/scripts/*.js` with `**/scripts/**/*.js`

(Advisory, G17. Not part of this plan's tasks; dimension files are outside this wave's scope.)

## Tasks

### Task 1: Verifying cleanup in state/execute.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — header exit-code line; extract `completenessOf` + `writeCompleteness`; `cmdVerifyCompleteness` uses them; `cmdCleanup` verifies before deleting.

**Notes:** Implements F-execute-state-cleanup-verify-split-1, -2, -3, -4 (header, cleanup, verdict body, exit-2 message) and relies on F-execute-state-cleanup-verify-split-5 (corrupt file → `readState` null). Plan 1's spec commit must be on the branch first (run this plan after ship run 1, never in parallel with it). Copy the verdict body; do not retype it. Every probe in this plan writes under `$TMPDIR`; in each Bash call that uses it, first run `export TMPDIR=/tmp/claude-1000/pf-tmp-exec-m41; mkdir -p "$TMPDIR"`.

**Pre-condition and anchors (each must print `1`; if a spec line prints `0`, STOP: plan 1 is not on the branch):**

```bash
for a in 'runs the R-INVARIANT-COMPLETENESS check itself and deletes the state file only when the check exits 0' ; do printf '%s  %s\n' "$(command grep -F -- "$a" docs/specs/execute-plan-sdlc.md | wc -l)" "$a"; done
for a in 'when an execute state file for the branch exists at that point (a corrupt file counts as existing)'; do printf '%s  %s\n' "$(command grep -F -- "$a" docs/specs/ship-sdlc.md | wc -l)" "$a"; done
f=plugins/sdlc-utilities/scripts/state/execute.js
for a in ' *   1 = state file not found (read/cleanup)' ' *   2 = unexpected error' 'function cmdCleanup(opts) {' \
  '    // Nothing to delete — treat as success' '  deleteState(found.filePath);' 'function cmdVerifyCompleteness(opts) {' \
  "  const ACCOUNTED_STATUSES = new Set(['completed', 'failed', 'skipped-dependency']);" '  const { data } = found;' \
  "      'ERROR: verify-completeness cannot find plannedTaskIds in state — invariant check cannot run." \
  '    process.stdout.write(JSON.stringify({ ok: true, totalPlanned, totalAccounted }) + '"'"'\n'"'"');' \
  '  process.stderr.write(JSON.stringify({ missingIds, totalPlanned, totalAccounted }) + '"'"'\n'"'"');' \
  '  process.exit(65);'; do printf '%s  %s\n' "$(command grep -F -- "$a" "$f" | wc -l)" "$a"; done
```

Before editing, capture `node .claude/skills/validate-skill-docs/check-docs-consistency.js > "$TMPDIR/w822-dc.before" 2>&1; echo $? >> "$TMPDIR/w822-dc.before"` (Task 4 compares against it) and the baseline bytes: `for s in all-done missing-t3-t4 skipped-deps; do node plugins/sdlc-utilities/scripts/state/execute.js verify-completeness --state-file tests/promptfoo/fixtures-fs/execute-overflow/state-$s.json > "$TMPDIR/w822-vc-$s.out" 2> "$TMPDIR/w822-vc-$s.err"; echo $? > "$TMPDIR/w822-vc-$s.code"; done`.

**Must not touch:** `verify-completeness`'s output bytes, exit codes and `--state-file` path; the `cmdVerifyCompleteness` JSDoc; the usage lines; every other verb.

**Contract:**
- shape (code):

  Header (`65` line added after the `2 =` line):

  ```diff
     * Exit codes:
     *   0 = success
     *   1 = state file not found (read/cleanup)
     *   2 = unexpected error
  +  *   65 = cleanup/verify-completeness: planned tasks unaccounted (cleanup keeps the state file)
     */
  ```

  `cmdVerifyCompleteness` keeps its state lookup unchanged. From `const { data } = found;` to the final `process.exit(65);`, the body moves into `completenessOf`, and the function ends:

  ```diff
   function cmdVerifyCompleteness(opts) {
  -  const ACCOUNTED_STATUSES = new Set(['completed', 'failed', 'skipped-dependency']);
  -
     // Resolve state
     let found = null;
     … (state lookup unchanged, through the closing brace of the else branch)
  -  const { data } = found;
  -  … (verdict body)
  -  process.exit(65);
  +  const v = completenessOf(found.data);
  +  writeCompleteness(v);
  +  process.exit(v.code);
   }
  +
  +/**
  + * Pure R-INVARIANT-COMPLETENESS verdict over one execute state object, shared by
  + * verify-completeness and the verifying cleanup (R14). Prints nothing, never exits.
  + * @returns {{code: 0, out: object} | {code: 65, err: object} | {code: 2, err: string}}
  + */
  +function completenessOf(data) {
  +  const ACCOUNTED_STATUSES = new Set(['completed', 'failed', 'skipped-dependency']);
  +  … (verdict body moved verbatim from `// Collect all task entries across waves`, with the three exits replaced:)
  +  if (!plannedIds) {
  +    // (existing comment lines kept)
  +    return { code: 2, err: 'ERROR: verify-completeness cannot find plannedTaskIds in state — invariant check cannot run. Use --resume on a fresh execute run, or re-run without --resume to start over.\n' };
  +  }
  +  …
  +  if (missingIds.length === 0) return { code: 0, out: { ok: true, totalPlanned, totalAccounted } };
  +  // Incomplete — exit 65 (BSD EX_DATAERR) with structured stderr JSON
  +  return { code: 65, err: { missingIds, totalPlanned, totalAccounted } };
  +}
  +
  +/** Write a completenessOf verdict exactly as verify-completeness always has. */
  +function writeCompleteness(v) {
  +  if (v.code === 0) process.stdout.write(JSON.stringify(v.out) + '\n');
  +  else process.stderr.write(typeof v.err === 'string' ? v.err : JSON.stringify(v.err) + '\n');
  +}
  ```

  `cmdCleanup`:

  ```diff
     if (!found) {
       // Nothing to delete — treat as success
       process.exit(0);
     }

  +  // R14: verifying cleanup; a state whose completeness check fails is kept for --resume.
  +  const v = completenessOf(found.data);
  +  if (v.code !== 0) {
  +    writeCompleteness(v);
  +    process.stderr.write(`Error: state file kept (completeness check failed): ${found.filePath}\n`);
  +    process.exit(v.code);
  +  }
     deleteState(found.filePath);
     process.exit(0);
   }
  ```

  | Condition | `cleanup` exit | stdout | stderr | state file |
  |---|---|---|---|---|
  | no state file (or corrupt: `readState` → null) | 0 | — | (readState warning when corrupt) | untouched |
  | all planned ids accounted | 0 | — | — | deleted |
  | planned ids missing | 65 | — | `{"missingIds":[…],"totalPlanned":…,"totalAccounted":…}` + `Error: state file kept (completeness check failed): <path>` | kept |
  | no `plannedTaskIds` | 2 | — | the exit-2 `ERROR: verify-completeness cannot find plannedTaskIds …` line + the `Error: state file kept …` line | kept |

- names: `completenessOf`, `writeCompleteness` (new, module-private, placed right after `cmdVerifyCompleteness`); `cmdCleanup`, `cmdVerifyCompleteness` (modified).
- mirror: the verdict body of `cmdVerifyCompleteness` (`state/execute.js:1052-1117` at 7a002fb), moved verbatim.
- decisions: Key Decisions "One verdict function, two callers" and "The verdict function does not print or exit".
- sync: `verify-completeness` bytes unchanged (exec cases `execute-plan-sdlc/wave-runner-overflow/verify-completeness: …`); plan 3's `cleanup-verify` cases assert the table above.

**Acceptance criteria:**
- [ ] The two spec pre-condition lines and all twelve code anchors print `1`.
- [ ] After editing, the three baseline probes re-run into `.after` files give `diff` empty for `.out`, `.err` and `.code` of each fixture.
- [ ] Cleanup probes, each in ONE Bash call with a fresh dir: `T=$(mktemp -d "$TMPDIR/w822-cu-XXXX"); cp tests/promptfoo/fixtures-fs/execute-overflow/state-missing-t3-t4.json "$T/execute-fix-cleanup-20261020T120000Z.json"; SDLC_STATE_DIR_OVERRIDE="$T" node plugins/sdlc-utilities/scripts/state/execute.js cleanup --branch fix/cleanup; echo "exit=$?"; ls "$T"; rm -r -- "$T"` prints `exit=65` and the file name (kept), with stderr naming `T3` and `Error: state file kept`; the same with `state-all-done.json` prints `exit=0` and no file; with no file copied prints `exit=0`.
- [ ] `node --check plugins/sdlc-utilities/scripts/state/execute.js` exits 0.

### Task 2: Execute SKILL.md and docs page — verifying cleanup

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — Step 9 **State file cleanup:** sentence; R-F7 pointer on the Step 5 cleanup line.
- Modify: `docs/skills/execute-plan-sdlc.md` — append one sentence to the completeness-gate paragraph.

**Notes:** Implements F-execute-skill-and-docs-sites-1, -2, -4. R-F7 relaxes "SKILL.md outside `:833`" for the Step 5 pointer only. The pointer exists so a reader of Step 5 knows the cleanup can now refuse and where that is handled.

**Anchors (each must print `1`):**

```bash
k=plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md; d=docs/skills/execute-plan-sdlc.md
for a in 'On successful completion: `node "$STATE_SCRIPT" cleanup`' \
  '**State file cleanup:** On successful completion (all tasks completed), delete the execution state file. Print:'; do
  printf '%s  %s\n' "$(command grep -F -- "$a" "$k" | wc -l)" "$a"; done
command grep -c 'node "\$STATE_SCRIPT" cleanup' "$k"
a="The pipeline **halts before the commit step** on exit 65 — it does not silently advance. This gate is also wired into \`ship-sdlc\`'s execute-step finalization."
printf '%s  %s\n' "$(command grep -F -- "$a" "$d" | wc -l)" "$a"
```

**Must not touch:** every other SKILL.md line (Step 5f `:699-711`, `**No state file is written**`, the `Print:` line's next line `` `State file cleaned up.` ``, the failure/interruption paragraph); every other docs line.

**Contract:**
- shape (docs): two SKILL.md lines and one docs line.

  ```diff
  -On successful completion: `node "$STATE_SCRIPT" cleanup`
  +On successful completion: `node "$STATE_SCRIPT" cleanup` (verifying cleanup, R14: see **State file cleanup** in Step 9 for its exit handling)
  -**State file cleanup:** On successful completion (all tasks completed), delete the execution state file. Print:
  +**State file cleanup:** On successful completion (all tasks completed), delete the execution state file with `node "$STATE_SCRIPT" cleanup`. It re-runs the completeness check and deletes the file only when it passes. On a non-zero exit the state is kept: report the stderr and stop as in Step 5f. Print:
  ```

  `docs/skills/execute-plan-sdlc.md`:

  ```diff
  -The pipeline **halts before the commit step** on exit 65 — it does not silently advance. This gate is also wired into `ship-sdlc`'s execute-step finalization.
  +The pipeline **halts before the commit step** on exit 65 — it does not silently advance. This gate is also wired into `ship-sdlc`'s execute-step finalization. `state/execute.js cleanup` runs the same check and keeps the state file when it fails.
  ```

- names: Step 9 **State file cleanup:**; Step 5 cleanup line; R14.
- mirror: the item's Change 2 text for `SKILL.md:833` and `docs/skills/execute-plan-sdlc.md:415`, verbatim.
- decisions: pointer wording per the Deviations table.
- sync: Task 1's cleanup exit table; execute spec R14 (plan 1).

**Acceptance criteria:**
- [ ] All anchors print `1` before editing (the bare `cleanup` command count prints `1`).
- [ ] After editing, `command grep -c 'node "\$STATE_SCRIPT" cleanup' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `2`, and `command grep -cF -- 'It re-runs the completeness check and deletes the file only when it passes.' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `1`.
- [ ] `git diff --numstat -- plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `2	2`; `git diff --numstat -- docs/skills/execute-plan-sdlc.md` prints `1	1`.
- [ ] P-7 for execute-plan-sdlc prints nothing: `T=$(mktemp); cat docs/specs/*.md | tr -d '\r' | grep -oE '^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+)[:( ]' | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort -u > "$T"; grep -ohE '\bR([0-9]+[a-z]?|-[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*)\b' plugins/sdlc-utilities/skills/execute-plan-sdlc/*.md plugins/sdlc-utilities/agents/*.md | sort -u | comm -23 - "$T"`.

### Task 3: Ship completeness gate scoped to an existing execute state file

**Complexity:** Standard
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `findStateFile` import; gate block.

**Notes:** Implements F-ship-completeness-gate-site-1, -2 and -4 (import, gate block, `output` → history `data`); leaves -3 and -5 untouched. Risk High because every ship run passes this block. Run after Task 1 so the (t) pre-check sees a complete execute.js. Before editing, prove the seeded file is visible: run the plan-header promptfoo command with `--filter-pattern "ship-step: \(t\)"`; it must pass 1 of 1. If (t) fails before the change, STOP and report (item guardrail).

**Anchors (each must print `1`):**

```bash
f=plugins/sdlc-utilities/scripts/skill/ship.js
for a in "const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, readState, slugifyBranch, claimSession," \
  '  // L23/L27: completeness gate; any non-zero exit halts and becomes the process exit code.' \
  "  if (name === 'execute' && success) {" '    const g = runCompletenessGate(ledger.branch);' \
  '    if (!g.ok) { success = false; failExitCode = g.exitCode; failureText = g.text; }'; do
  printf '%s  %s\n' "$(command grep -F -- "$a" "$f" | wc -l)" "$a"; done
command grep -c 'findStateFile' "$f"   # must print 0
```

**Must not touch:** `runCompletenessGate`; the `execute_handoff` block (`// R-INVARIANT-COMPLETENESS scope (ruling w2-handoff)` through `recorded.add('execute');` and its closing braces); every other line.

**Contract:**
- shape (code):

  ```diff
  -const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, readState, slugifyBranch, claimSession, writeState, deleteState, migrateBranchSlug, listBranches, readTtlDaysFromConfig } = require(path.join(LIB, 'state'));
  +const { resolveMainWorktree, detectResumeState: detectResumeStateLib, resolveStateDir, findStateFile, readState, slugifyBranch, claimSession, writeState, deleteState, migrateBranchSlug, listBranches, readTtlDaysFromConfig } = require(path.join(LIB, 'state'));
  ```

  ```diff
  -  // L23/L27: completeness gate; any non-zero exit halts and becomes the process exit code.
  +  // L23/L27: completeness gate when an execute state file exists; any non-zero exit halts and becomes the process exit code.
     let failExitCode;
     if (name === 'execute' && success) {
  -    const g = runCompletenessGate(ledger.branch);
  -    if (!g.ok) { success = false; failExitCode = g.exitCode; failureText = g.text; }
  +    // R-INVARIANT-COMPLETENESS scope: execute's verifying R14 cleanup (or the R5 small-plan path) leaves no state to check.
  +    if (findStateFile('execute', slugifyBranch(ledger.branch))) {
  +      const g = runCompletenessGate(ledger.branch);
  +      if (!g.ok) { success = false; failExitCode = g.exitCode; failureText = g.text; }
  +    } else {
  +      output.completenessGate = 'no-execute-state';
  +    }
     }
  ```

  History entry for `--after dispatch_execute` with a successful result and no execute state file:

  ```
  Before:  status "error", exit 1, history { step: "dispatch_execute", result: "failed", data: { … } }, execute "failed"
  After:   status "step" (stage_changes), exit 0, history { step: "dispatch_execute", result: "success", data: { …, completenessGate: "no-execute-state" } }, execute "completed"
  ```

- names: `findStateFile` (import), `output.completenessGate`, value `'no-execute-state'`.
- mirror: the `execute_handoff` scoped gate (`const found = readState(…); const gate = found ? runCompletenessGate(ledger.branch) : { ok: true };`) and its `output.source = 'user-attested'` record.
- decisions: Key Decisions "Ship decides by file existence" and "Record why the check was skipped".
- sync: ship spec R-INVARIANT-COMPLETENESS Scope (plan 1); plan 3's (u2) and (u4) assert the After record.

**Acceptance criteria:**
- [ ] Case (t) passes before editing; all anchors print `1`; `findStateFile` count prints `0`.
- [ ] After editing, `command grep -n "findStateFile" plugins/sdlc-utilities/scripts/skill/ship.js` shows exactly the import line and the gate line; `command grep -c "completenessGate" plugins/sdlc-utilities/scripts/skill/ship.js` prints `1`; `node --check plugins/sdlc-utilities/scripts/skill/ship.js` exits 0.
- [ ] `git diff -U0 -- plugins/sdlc-utilities/scripts/skill/ship.js | command grep -c '^[-+][^-+]'` prints `13` (4 removed, 9 added).

### Task 4: Ship docs page — scoped gate

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3
**Verify:** tests, lint

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — `## Post-execute completeness gate`: two sentences.

**Notes:** Implements F-execute-skill-and-docs-sites-5. This task is last, so it also carries the plan's closing checks (its last four acceptance criteria).

**Anchors (each must print `1`):**

```bash
d=docs/skills/ship-sdlc.md
for a in 'ship-sdlc runs a blocking invariant check: `state/execute.js verify-completeness`.' \
  'The gate runs automatically after every successful `execute-plan-sdlc` dispatch. It cannot be skipped.'; do
  printf '%s  %s\n' "$(command grep -F -- "$a" "$d" | wc -l)" "$a"; done
```

**Must not touch:** every other line of the page, including the "Exit outcomes" list.

**Contract:**
- shape (docs):

  ```diff
  -After `execute-plan-sdlc` returns and before ship-sdlc advances to the commit step, ship-sdlc runs a blocking invariant check: `state/execute.js verify-completeness`. This gate …
  +After `execute-plan-sdlc` returns and before ship-sdlc advances to the commit step, ship-sdlc runs a blocking invariant check when an execute state file exists: `state/execute.js verify-completeness`. This gate …
  -The gate runs automatically after every successful `execute-plan-sdlc` dispatch. It cannot be skipped.
  +The gate runs after every successful `execute-plan-sdlc` dispatch that leaves an execute state file. When execute has already removed its state (its cleanup deletes it only after the same check passed) or never wrote one (small plans), ship records the execute step completed with `completenessGate: "no-execute-state"` in the ledger history and moves on.
  ```

- names: section `## Post-execute completeness gate`; `completenessGate`.
- mirror: the item's Change 2 text for `docs/skills/ship-sdlc.md:539` and `:543`, verbatim.
- decisions: none beyond the item.
- sync: ship spec R-INVARIANT-COMPLETENESS (plan 1); Task 3's gate.

**Acceptance criteria:**
- [ ] Both anchors print `1` before editing.
- [ ] After editing, `command grep -n "completenessGate" plugins/sdlc-utilities/scripts/skill/ship.js docs/specs/ship-sdlc.md docs/skills/ship-sdlc.md` lists each of the three files; `command grep -c 'It cannot be skipped.' docs/skills/ship-sdlc.md` prints `0`.
- [ ] `git diff --numstat -- docs/skills/ship-sdlc.md` prints `2	2`.
- [ ] The plan-header promptfoo command passes 8 of 8 ((t), (u), (u3), (eh3a), (eh3b) and the three `verify-completeness` cases). Run it with `run_in_background` if it may exceed 5 minutes. (u2) is not run here; plan 3 rewrites it. No re-run loop: on a failure, stop and report.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits with the same code and output as before the plan (capture `.before` at the start of Task 1).
- [ ] `git status --porcelain` lists only the five files of this plan; nothing under `site/`.
- [ ] Do not commit inside the tasks; the ship run's commit step uses the subject `fix(#9008): ship-sdlc - verifying execute cleanup and scoped completeness gate (W8.22)`.
- [ ] `git status --porcelain` shows no untracked file outside this plan's file list before the ship commit step.


## Final Shape

Execute and ship now follow the amended specs.

- `state/execute.js cleanup` deletes a state file only after the completeness check passes. On a failing check it keeps the file, prints the same error as `verify-completeness`, adds one `state file kept` line, and exits 65 or 2.
- `verify-completeness` behaves exactly as before.
- Ship runs its completeness gate only when an execute state file exists. Without one it records execute completed, marks the history entry `completenessGate: "no-execute-state"`, and moves on to `stage_changes`.
- SKILL.md and both docs pages say the same thing. `site/` is refreshed later in the wave. Plan 3 adds the tests for the new paths.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 1 |
| Correctness | 0 | 0 | 2 | 1 |
| Coherence | 0 | 0 | 1 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Task(s) | Status |
|---|---|---|
| Amended spec lines present, else STOP | Task 1 | covered |
| `completenessOf` extraction; verify-completeness byte-identical | Task 1 | covered |
| Verifying `cmdCleanup` + header `65` line | Task 1 | covered |
| SKILL.md Step 9 text + R-F7 Step 5 pointer | Task 2 | covered |
| `docs/skills/execute-plan-sdlc.md` sentence | Task 2 | covered |
| `ship.js` import + scoped gate + `completenessGate` | Task 3 | covered |
| `docs/skills/ship-sdlc.md` two sentences; `site/` untouched | Task 4 | covered |
| Existing exec cases pass; consistency check exits 0 | Task 4 | covered |

Review: round 1 Approved (single reviewer, all lenses). Applied: `TMPDIR` setup note; `git status` check (plan fix 1: no untracked file outside the plan's file list; the plans are moved out of the worktree before the ship runs). Open advisories (not blocking): parenthesise the `writeCompleteness` else branch; add a corrupt-file `cleanup` probe.

Verdict: All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
