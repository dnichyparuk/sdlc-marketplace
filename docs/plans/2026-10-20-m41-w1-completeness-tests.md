# Verifying Execute Cleanup and Scoped Completeness Gate — Tests (W8.22 Change 3) Implementation Plan

**Goal:** Add promptfoo exec cases for the verifying `state/execute.js cleanup` and for ship's scoped completeness gate (small-plan path, wave path, state file present), and rewrite case (u2), which still asserts the old defect (W8.22 Change 3).
**Architecture:** A new test wrapper runs `cleanup` against a temporary state directory (`SDLC_STATE_DIR_OVERRIDE`) and prints one JSON line; four cases in `execute-plan-sdlc-overflow-exec.yaml` use it. The ship stepper gains a boolean `--exec-cleanup` flag that runs execute's own verify and cleanup in the fixture before the `--after dispatch_execute` call, and exposes `execPreGate` and each history entry's `completenessGate`. Case (u2) is rewritten and case (u4) added in `ship-prepare-exec.yaml`.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/wave-1-plan-source.md (item W8.22, Change 3; plan §0 rules 4–5; readings R-F7, R-dated), /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/preflight-wave-1.md, discovery brief F-exec-test-harness-sites-1…9, F-execute-state-cleanup-verify-split-5, -6
**Verification:** from `tests/promptfoo`, with `mkdir -p /tmp/claude-1000/pf-tmp-exec-m41` first: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m41 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml --filter-pattern "ship-step: \((t|u|u2|u3|u4|eh3a|eh3b)\)|execute-plan-sdlc/(cleanup-verify|wave-runner-overflow/verify-completeness)" --no-cache` passes 14 of 14; then the same command with `--filter-pattern "ship-step"` passes 88 of 88 (base 87 + (u4)).

---

## Context

**What problem does this change solve?**

- Plan 2 changed two behaviours without new tests:
  - `state/execute.js cleanup` now deletes a state file only when the completeness check passes.
  - Ship's completeness gate now runs only when an execute state file exists.
- Case (u2) still asserts the old defect: "no execute state file halts too", exit 1. After plan 2 it fails until it is rewritten.
- No exec case runs `cleanup` at all today.

**What prompted this change now?**

The owner asked for exec cases "for the small-plan path, the wave path, and a state file present" (W8.22 Source, 2026-10-20). This is the third of W8.22's three commits.

**What does success look like?**

- Four `cleanup-verify` cases cover: missing task (kept, exit 65), all done (deleted, exit 0), no `plannedTaskIds` (kept, exit 2), no file (exit 0).
- (u2) covers the small-plan path: no state file, execute recorded completed with `completenessGate: "no-execute-state"`.
- (u4) covers the wave path: execute's own verify and cleanup ran, then ship records the same.
- (t), (u) and (u3) still cover "state file present" unchanged and still pass.

## Research Findings

- `run-ship-stepper.js` (LF):
  - Value flags are parsed in the `for` loop (`--exec-seed` at `:89`). Boolean flags are read with `process.argv.includes(…)`, e.g. `--late-exec` at `:258` (F-exec-test-harness-sites-1).
  - `env` is built at `:121`, then `delete env.SDLC_STATE_DIR_OVERRIDE;` (`:122`). `sh()` already spawns with `{ cwd: projectRoot, env, … }` (F-…-2). Reading R-F7: the new spawns use `env` too, so they read the same state directory as ship.js (the fixture repo's `.sdlc/execution/`).
  - The exec seed is copied at `:259-262` (`execute-feat-ship-20261019T120000Z.json`). A second copy at `:399` serves the `handoff --late-exec` path and is not touched (F-…-3).
  - The output JSON (`:495-510`) has `execFiles`. Its `ledger.history` keeps only `{ step, result, source }` of each entry (`:463`). So `data.completenessGate` is not visible to assertions today.
- Fixture `project-ship-stepper/setup.sh` generates `seed/execute-complete.json` with `plannedTaskIds: ["1", "2"]` and both tasks done, on branch `feat/ship` (F-…-5). verify and cleanup on that seed both exit 0 (plan 2 Task 1 table).
- `ship-prepare-exec.yaml`: (t) `:2524`, (u) `:2543`, (u2) `:2567-2583`, (u3) `:2585`, (eh3a) `:3159`, (eh3b) `:3178`. Today 87 case descriptions contain `ship-step`, all in this file (F-…-6; `grep -c` at 7a002fb).
- `execute-plan-sdlc-overflow-exec.yaml`: the three `verify-completeness` cases end at `:221`, followed by the `# state/execute.js wave-split subcommand` banner (F-…-7).
- Fixtures `execute-overflow/state-*.json` carry top-level `plannedTaskIds: ["T1","T2","T3","T4"]`, no `context` key. `state-missing-t3-t4.json` accounts only T1 and T2 (F-…-9).
- `run-stop-plan-integrity.js:68-76` has the repo-root walk to copy (F-…-8). `slugifyBranch('fix/cleanup')` = `fix-cleanup` (run at 7a002fb), so the state file name `execute-fix-cleanup-20261020T120000Z.json` matches `findStateFile('execute', 'fix-cleanup')`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Stepper history projection | no | adds `completenessGate: h.data && h.data.completenessGate` to each `ledger.history` entry; (u2)/(u4) assert `h.completenessGate` | the item asserts "`data.completenessGate`" but the wrapper exposes only `step`, `result`, `source` of each history entry; mirroring `source` is the only way to see it |
| `--exec-cleanup` parsing | no | read with `process.argv.includes('--exec-cleanup')` next to the seeding block | the flag takes no value; boolean flags in this file use `argv.includes` (`--late-exec`), the `for` loop holds value flags only |
| Spawn options | no | `{ cwd: projectRoot, env }` | reading R-F7 replaces the item's `{ cwd: projectRoot }` |
| `--seed missing` file | no | maps `missing` → `state-missing-t3-t4.json`, `all-done` → `state-all-done.json` | the item's seed names; the fixture names differ |
| Case (u2) expected status | no | rewritten to the new behaviour | the item; (u2) was the defect's assertion |

## Key Decisions

**Problem in one sentence:** the new verifying cleanup and the scoped ship gate have no tests, and (u2) still asserts the defect they fix.

- **Test cleanup through a wrapper, not directly.** The case must know whether the file survived, which the script's own output does not say. The wrapper owns a temporary state directory, runs `cleanup`, and reports `{ exitCode, kept, stderr }`. It mirrors `run-stop-plan-integrity.js`.

- **Simulate the wave path inside the existing stepper.** (u4) seeds a complete execute state, runs execute's own `verify-completeness` and `cleanup` (Step 5f and R14), then calls `--after dispatch_execute`. This proves the full order without a real execute run. The spawns share `env` with the ship.js calls (R-F7), so all three see one state directory.

- **No timing.** The wrapper and the new stepper spawns set no `timeout`. Nothing depends on CPU speed.

- **Non-goals.** No change to cases (t), (u), (u3), (eh3a), (eh3b), the three existing `verify-completeness` cases, `project-ship-stepper/setup.sh` or `execute-overflow/`. No behavioural run (W8.22 Verification 5). No production code change.

- **Failure audience.** Future editors of execute's state handling (W5.2, W5.3 in M5). If these cases are wrong, a regression of the verifying cleanup or the scoped gate passes CI unnoticed.

## Contract Examples

**code** (taken from Task 1):

```markdown
**Contract:**
- shape (code): CLI `node run-execute-cleanup-verify.js --seed all-done|missing|noplanned|none --fixture <dir>`; prints one line `{"exitCode": number|null, "kept": boolean, "stderr": string}` and exits 0; prints `{"error": …}` and exits 1 when the repo root is not found.
- names: `run-execute-cleanup-verify.js`; seed names `all-done`, `missing`, `noplanned`, `none`.
- mirror: repo-root walk `tests/promptfoo/scripts/run-stop-plan-integrity.js:68-81`.
- decisions: temp state dir via `SDLC_STATE_DIR_OVERRIDE`; removed on its own path only.
- sync: the four `execute-plan-sdlc/cleanup-verify:` cases.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | This plan is the test coverage for plan 2; the stale (u2) assertion is corrected, not left behind |
| no-ci-bypass | error | PASS | No check is skipped |
| no-auto-eval | error | PASS | Only targeted runs of the exec config (no LLM provider); no behavioural run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Only the item's cases and the minimum wrapper changes they need |
| single-responsibility-tasks | warning | PASS | Task 1: cleanup cases; Task 2: ship-stepper cases (plus the plan's closing checks, as the last task) |
| scripts-over-llm-logic | error | PASS | Tests only |
| yagni | warning | PASS | `execPreGate` and `completenessGate` are both asserted by (u2)/(u4) |
| cross-skill-consistency | error | PASS | (u4) exercises execute's cleanup and ship's gate together |
| pr-link-github-issue | error | PASS | Local todo only |
| dry | warning | PASS | The wrapper reuses the existing repo-root walk pattern; the stepper reuses its own `env` |
| kiss | warning | PASS | One small wrapper, one boolean flag |
| spec-first | error | PASS | No SKILL.md change |
| project-agnostic | error | PASS | Test files of the plugin repo only |
| flag-coherence-cross-skill | error | PASS | No skill flag |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate |
| flag-resolution-single-source | warning | PASS | No skill flag |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | Four + two cases, the item's set |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | The history-projection and flag-parsing choices are in the Deviations table |
| state-machine-idempotency | error | PASS | The cleanup cases cover "kept" (a re-run returns the same code) and "deleted / no file" (a re-run exits 0); (u4) runs cleanup and then ship sees no state |
| agent-dispatch-script-driven | error | PASS | No dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | `--exec-cleanup` is a test-wrapper flag, not a skill prepare-script flag; `command grep -rn -- '--exec-cleanup' plugins tests` prints nothing at 7a002fb |
| workspace-mode-compatibility | error | PASS | Tests only; the stepper fixture is the main worktree, so `resolveStateDir()` is the fixture's `.sdlc/execution/` |
| prompt-cache-hit-ratio | warning | PASS | No prompts change |

## Tasks

### Task 1: Cleanup-verify wrapper and four exec cases

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/run-execute-cleanup-verify.js`
- Modify: `tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml` — four cases inserted before the wave-split banner.

**Notes:** Implements F-exec-test-harness-sites-7, -8, -9 and uses F-execute-state-cleanup-verify-split-5, -6 (state lookup, `SDLC_STATE_DIR_OVERRIDE`). Plan 2 must be on the branch: `command grep -c 'function completenessOf' plugins/sdlc-utilities/scripts/state/execute.js` prints `1`, else STOP.

**Anchors (each must print `1`; the file must not exist yet):**

```bash
o=tests/promptfoo/datasets/execute-plan-sdlc-overflow-exec.yaml
for a in '- description: "execute-plan-sdlc/wave-runner-overflow/verify-completeness: all-skipped-dependency exits 0"' \
  '# state/execute.js wave-split subcommand'; do printf '%s  %s\n' "$(command grep -F -- "$a" "$o" | wc -l)" "$a"; done
command grep -c 'cleanup-verify' "$o"   # must print 0
test ! -e tests/promptfoo/scripts/run-execute-cleanup-verify.js && echo absent
```

**Must not touch:** the three existing `verify-completeness` cases; every fixture under `fixtures-fs/execute-overflow/`; every other case.

**Contract:**
- shape (code): wrapper flow, in this order:

  1. Parse `--seed <name>` (default `none`) and `--fixture <dir>`.
  2. Walk up from `__dirname` until `plugins/sdlc-utilities/scripts/state/execute.js` exists (copy of `run-stop-plan-integrity.js:68-81`); if not found print `{"error":"execute.js not found"}` and exit 1.
  3. `const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-cleanup-'));` and `const target = path.join(tmp, 'execute-fix-cleanup-20261020T120000Z.json');`
  4. Seed:

     | `--seed` | written to `target` |
     |---|---|
     | `all-done` | copy of `<fixture>/state-all-done.json` |
     | `missing` | copy of `<fixture>/state-missing-t3-t4.json` |
     | `noplanned` | `state-all-done.json` parsed, `delete d.plannedTaskIds; if (d.context) delete d.context.plannedTaskIds;`, written back as JSON |
     | `none` | nothing |

  5. `const r = spawnSync('node', [path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js'), 'cleanup', '--branch', 'fix/cleanup'], { env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: tmp }, encoding: 'utf8' });`
  6. `const kept = fs.existsSync(target);` then `fs.rmSync(tmp, { recursive: true, force: true });` (its own path only).
  7. `console.log(JSON.stringify({ exitCode: r.status, kept, stderr: r.stderr || '' }));` exit 0.

  Header comment: purpose, Args (`--seed`, `--fixture`), Output JSON, in the style of `run-ship-stepper.js:1-58`.

  Directly before the existing `# ----…` line above `# state/execute.js wave-split subcommand`, insert: the new 3-line banner, one blank line, the four case blocks each followed by one blank line.

  ```yaml
  # ---------------------------------------------------------------------------
  # state/execute.js cleanup — verifying cleanup (R14)
  # ---------------------------------------------------------------------------

  - description: "execute-plan-sdlc/cleanup-verify: a state file with a missing task is kept and cleanup exits 65"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-execute-cleanup-verify.js"
      script_args: "--seed missing --fixture {{project_root}}"
      project_root: "file://fixtures-fs/execute-overflow"
    assert:
      - type: javascript
        value: "const r = JSON.parse(output); r.exitCode === 65 && r.kept === true && r.stderr.includes('T3')"

  - description: "execute-plan-sdlc/cleanup-verify: an all-done state file is deleted and cleanup exits 0"
    … script_args: "--seed all-done --fixture {{project_root}}" …
        value: "const r = JSON.parse(output); r.exitCode === 0 && r.kept === false"

  - description: "execute-plan-sdlc/cleanup-verify: a state file without plannedTaskIds is kept and cleanup exits 2"
    … script_args: "--seed noplanned --fixture {{project_root}}" …
        value: "const r = JSON.parse(output); r.exitCode === 2 && r.kept === true"

  - description: "execute-plan-sdlc/cleanup-verify: no state file exits 0"
    … script_args: "--seed none --fixture {{project_root}}" …
        value: "const r = JSON.parse(output); r.exitCode === 0"
  ```

  (`…` = the same `vars`/`assert` lines as the first case.)

- names: `run-execute-cleanup-verify.js`; descriptions exactly as above (prefix `execute-plan-sdlc/cleanup-verify: `).
- mirror: `run-stop-plan-integrity.js:68-81` (repo-root walk); the existing `verify-completeness` cases (`execute-plan-sdlc-overflow-exec.yaml:196-221`) for case shape.
- decisions: Key Decisions "Test cleanup through a wrapper"; "No timing".
- sync: plan 2 Task 1 cleanup exit table.

**Acceptance criteria:**
- [ ] Anchors print `1`, `0` and `absent` before editing.
- [ ] `node --check tests/promptfoo/scripts/run-execute-cleanup-verify.js` exits 0; `node tests/promptfoo/scripts/run-execute-cleanup-verify.js --seed missing --fixture tests/promptfoo/fixtures-fs/execute-overflow` prints one JSON line with `"exitCode":65,"kept":true` and a `stderr` naming `T3` and `T4`.
- [ ] `git status --porcelain tests/promptfoo/fixtures-fs` prints nothing after the probe (fixtures unchanged).
- [ ] Plan-header command with `--filter-pattern "execute-plan-sdlc/(cleanup-verify|wave-runner-overflow/verify-completeness)"` passes 7 of 7.

### Task 2: Ship stepper `--exec-cleanup`, case (u2) rewrite and case (u4)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — header (flag + output keys); `--exec-cleanup` block after the exec seeding; `completenessGate` in the history projection; `execPreGate` in the output.
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case (u2) rewritten; case (u4) inserted after it.

**Notes:** Implements F-exec-test-harness-sites-1, -2, -3, -4, -5, -6. It depends on Task 1 only because, as the last task, it carries the plan's closing checks (its last four acceptance criteria), which run Task 1's cases too. Plan 2 must be on the branch: `command grep -c "output.completenessGate = 'no-execute-state'" plugins/sdlc-utilities/scripts/skill/ship.js` prints `1`, else STOP.

**Anchors (each must print `1`):**

```bash
r=tests/promptfoo/scripts/run-ship-stepper.js; y=tests/promptfoo/datasets/ship-prepare-exec.yaml
for a in ' *                        (copies seed/execute-<name>.json to .sdlc/execution/execute-feat-ship-<ts>.json)' \
  ' *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], ledger, ledgerExists, ledgerFiles, execFiles, otherFiles,' \
  ' *   ledger = { stepStatuses, history, stepReasons, currentStep, flagsKeys, flags, paused, stepResults } | null' \
  'delete env.SDLC_STATE_DIR_OVERRIDE;' "if (execSeed !== 'none' && !late) {" "if (process.argv.includes('--other-exec')) {" \
  '    history: (data.history || []).map(h => ({ step: h.step, result: h.result, source: h.data && h.data.source })),' \
  '  execFiles: (() => { try { return fs.readdirSync(execDir).filter(f => /^execute-/.test(f)); } catch (_) { return []; } })(),'; do
  printf '%s  %s\n' "$(command grep -F -- "$a" "$r" | wc -l)" "$a"; done
for a in '- description: "ship-step: (u2) --after dispatch_execute with no execute state file halts too (any non-zero exit, L23)"' \
  '- description: "ship-step: (u3) --after dispatch_execute with an execute state file lacking plannedTaskIds returns error with exit 2"'; do
  printf '%s  %s\n' "$(command grep -F -- "$a" "$y" | wc -l)" "$a"; done
command grep -c 'exec-cleanup\|(u4)' "$r" "$y"   # both must print 0
```

**Must not touch:** cases (t), (u), (u3), (eh3a), (eh3b) and every other case; the second seeding copy in the `handoff` case; `project-ship-stepper/setup.sh`.

**Contract:**
- shape (code): `run-ship-stepper.js`

  ```diff
    *   --exec-seed <name>   complete | missing | noplanned | none
    *                        (copies seed/execute-<name>.json to .sdlc/execution/execute-feat-ship-<ts>.json)
  + *   --exec-cleanup       (after-execute) runs `state/execute.js verify-completeness --branch feat/ship` and then
  + *                        `state/execute.js cleanup --branch feat/ship` in the fixture after seeding, as execute's Step 5f and R14 do
  …
  - *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], ledger, ledgerExists, ledgerFiles, execFiles, otherFiles,
  + *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], ledger, ledgerExists, ledgerFiles, execFiles, execPreGate, otherFiles,
  …
  - *   ledger = { stepStatuses, history, stepReasons, currentStep, flagsKeys, flags, paused, stepResults } | null
  + *   ledger = { stepStatuses, history, stepReasons, currentStep, flagsKeys, flags, paused, stepResults } | null
  + *   history entry = { step, result, source, completenessGate }; execPreGate = { verifyExit, cleanupExit } | null
  …
    if (execSeed !== 'none' && !late) {
      fs.mkdirSync(execDir, { recursive: true });
      fs.copyFileSync(…);
    }
  +// --exec-cleanup: execute's own Step 5f check, then its verifying R14 cleanup, before ship's --after call.
  +// Same env as the ship.js calls (R-F7: env drops SDLC_STATE_DIR_OVERRIDE), so all read one state dir.
  +let execPreGate = null;
  +if (process.argv.includes('--exec-cleanup')) {
  +  const execScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js');
  +  const verify = spawnSync('node', [execScript, 'verify-completeness', '--branch', 'feat/ship'], { cwd: projectRoot, env });
  +  const cleanup = spawnSync('node', [execScript, 'cleanup', '--branch', 'feat/ship'], { cwd: projectRoot, env });
  +  execPreGate = { verifyExit: verify.status, cleanupExit: cleanup.status };
  +}

    if (process.argv.includes('--other-exec')) {
  …
  -    history: (data.history || []).map(h => ({ step: h.step, result: h.result, source: h.data && h.data.source })),
  +    history: (data.history || []).map(h => ({ step: h.step, result: h.result, source: h.data && h.data.source, completenessGate: h.data && h.data.completenessGate })),
  …
      execFiles: (() => { … })(),
  +  execPreGate,
  ```

  `ship-prepare-exec.yaml` — (u2) replaced as a whole block (its description line through its `return true;`), then (u4) and one blank line before (u3):

  ```yaml
  - description: "ship-step: (u2) --after dispatch_execute with no execute state file (R5 small-plan path: no state is ever written) records execute completed and emits stage_changes"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"
      script_args: "--project-root {{project_root}} --scenario after-execute --seed frozen-exec --result results/execute-ok.json"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-ship-stepper"
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          const c = o.calls[0];
          const e = c.envelope;
          if (c.exitCode !== 0) return `FAIL: exit ${c.exitCode}: ${JSON.stringify(e).slice(0, 400)}`;
          if (e.status !== 'step' || e.step.id !== 'stage_changes') return `FAIL: next ${e.status} ${e.step && e.step.id}`;
          if (o.ledger.stepStatuses.execute !== 'completed') return `FAIL: execute ${o.ledger.stepStatuses.execute}`;
          const h = o.ledger.history[o.ledger.history.length - 1];
          if (!h || h.step !== 'dispatch_execute' || h.result !== 'success' || h.completenessGate !== 'no-execute-state') return `FAIL: history ${JSON.stringify(o.ledger.history)}`;
          return true;

  - description: "ship-step: (u4) --after dispatch_execute after the wave path's own verify and R14 cleanup records execute completed and emits stage_changes"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-ship-stepper.js"
      script_args: "--project-root {{project_root}} --scenario after-execute --seed frozen-exec --exec-seed complete --exec-cleanup --result results/execute-ok.json"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-ship-stepper"
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          if (!o.execPreGate || o.execPreGate.verifyExit !== 0 || o.execPreGate.cleanupExit !== 0) return `FAIL: execPreGate ${JSON.stringify(o.execPreGate)}`;
          if (o.execFiles.length !== 0) return `FAIL: execute state left ${JSON.stringify(o.execFiles)}`;
          const c = o.calls[0];
          const e = c.envelope;
          … (the same five checks as (u2), from `if (c.exitCode !== 0)` through `return true;`)
  ```

- names: flag `--exec-cleanup`; output keys `execPreGate { verifyExit, cleanupExit }`, `ledger.history[].completenessGate`; cases (u2), (u4).
- mirror: case (t) (`ship-prepare-exec.yaml:2524-2541`) for the assertion style; `--late-exec` (`run-ship-stepper.js:258`) for boolean flag reading; `sh()` (`:128-130`) for `{ cwd: projectRoot, env }`.
- decisions: Deviations table rows 1–3; Key Decisions "Simulate the wave path".
- sync: plan 2 Task 3 History record; ship spec R-INVARIANT-COMPLETENESS Acceptance (plan 1).

**Acceptance criteria:**
- [ ] Anchors print `1` (and `0` for the last grep) before editing.
- [ ] `node --check tests/promptfoo/scripts/run-ship-stepper.js` exits 0.
- [ ] Plan-header command with `--filter-pattern "ship-step: \((t|u|u2|u3|u4|eh3a|eh3b)\)"` passes 7 of 7.
- [ ] `git diff -- tests/promptfoo/datasets/ship-prepare-exec.yaml` touches only the (u2) block and adds the (u4) block.
- [ ] The plan-header command passes 14 of 14, then `--filter-pattern "ship-step"` passes 88 of 88. Run each with `run_in_background` if it may exceed 5 minutes. No re-run loop: on a failure, stop and report.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.
- [ ] `git status --porcelain` lists only the three files of this plan; no fixture changes.
- [ ] Do not commit inside the tasks; the ship run's commit step uses the subject `test(#9008): ship-sdlc - cleanup-verify and no-execute-state cases (W8.22)`.
- [ ] `git status --porcelain` shows no untracked file outside this plan's file list before the ship commit step.


## Final Shape

The W8.22 behaviour is now pinned by exec cases.

- Four `cleanup-verify` cases prove the verifying cleanup: a failing state is kept with exit 65 or 2, a complete state is deleted, and no state exits 0.
- (u2) proves the small-plan path: ship records execute completed with `completenessGate: "no-execute-state"` and moves on.
- (u4) proves the wave path: execute's own check and cleanup pass and remove the file, then ship moves on the same way.
- (t), (u) and (u3) still prove that a present state file is checked and that a failing check halts ship.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 1 | 1 | 1 |
| Coherence | 0 | 0 | 3 | 1 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Task(s) | Status |
|---|---|---|
| `run-execute-cleanup-verify.js` wrapper | Task 1 | covered |
| Four `cleanup-verify` cases | Task 1 | covered |
| Stepper `--exec-cleanup` with `{ cwd: projectRoot, env }` (R-F7), `execPreGate` | Task 2 | covered |
| (u2) rewrite | Task 2 | covered |
| (u4) new case | Task 2 | covered |
| Existing cases untouched and passing; 14 and 88 counts | Task 2 | covered |

Review: round 1 Approved (single reviewer, all lenses). Applied: `git status` check (plan fix 1: no untracked file outside the plan's file list; the plans are moved out of the worktree before the ship runs); error-exit wording in Contract Examples; reason for `Depends on: Task 1`. Open advisories (not blocking): assert `missingIds` from parsed stderr JSON instead of `stderr.includes('T3')`; align the `run-stop-plan-integrity.js` line cites (`:68-76` walk, `:68-81` with the not-found block).

Verdict: …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
