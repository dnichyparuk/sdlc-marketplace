# M5.1 Wave 7 — jira.js Resolves Its Templates Beside the Script (#9195) Implementation Plan

**Commit:** `fix(#9195): jira-sdlc - templates resolve beside the script`
**Goal:**
- The root problem: `skill/jira.js` finds the shipped jira templates by walking `~/.claude/plugins` and taking the first `jira-sdlc/templates` directory it meets. After the plugin swap, that can be an old cached version.
- Make `resolveTemplatesDir()` return `--templates-dir` when given, else the templates beside the script (`__dirname/../../skills/jira-sdlc/templates`).
- Remove `findPluginInstalls()` (the home walk) and the cwd fallback (KD2).
- Prove it with ONE exec case: HOME holds a decoy cached install, and the shipped templates still win. Keep every existing jira.js exec case green.

**Architecture:** This is the feat plan for the ONE ship run of the branch: `/sdlc:ship-sdlc --auto --plan docs/plans/2026-10-28-m51-w7-jira-templates.md --steps execute,commit --rebase skip --quality balanced` (ruling w1-shipauto). It makes exactly ONE in-ship commit with the `**Commit:**` subject above (59 characters; matches `commit.subjectPattern`; no `"`, backtick, `$` or `\`). Its files are exactly `plugins/sdlc-utilities/scripts/skill/jira.js`, `tests/promptfoo/datasets/jira-sdlc-exec.yaml` and `tests/promptfoo/fixtures-fs/jira-templates-decoy-home/.claude/plugins/cache/sdlc-marketplace/sdlc/0.0.1/skills/jira-sdlc/templates/Decoy.md`.

Pre-ship precondition: `git status --porcelain` prints nothing (the C-docs commit, Task 5 of `docs/plans/2026-10-28-m51-w7-direct-a.md`, is done). The spec sentence (`R-templates-root`) is direct-a Task 3, already committed (spec-first).

After this run, the executor applies `docs/plans/2026-10-28-m51-w7-direct-b.md`.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-7-plan-source.md (scope C, design point D-jira), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w7-preflight.md Q5.3, /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w7-plan.md ("The jira exec case fixture: confirmed"), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w7-plan2.md Q3

**Verification:** with PF-ENV (one Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`; never `--env-file`, never read `tests/promptfoo/.env`):

- (1) The new case: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "jira-prepare \(templates-root\)" -o /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/pf-logs/w7-jira-templates-root-verify.json`: 1 passed, 0 failed. 0 cases match at b00f176.
- (2) Consumers (addendum C9; every exec case that runs `skill/jira.js` or loads it): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "jira-prepare|jira\.js --validate-body|stdin-fd0: jira|migrate-jira-templates|guardrail helper: template-fallback" -o /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/pf-logs/w7-jira-consumers-verify.json`: 24 passed, 0 failed. 23 cases match at b00f176 (11 `jira-prepare`, 4 `jira.js --validate-body`, 1 `stdin-fd0: jira`, 6 `migrate-jira-templates`, 1 `guardrail helper: template-fallback`); this plan adds 1.
- (3) `node --check plugins/sdlc-utilities/scripts/skill/jira.js` exits 0; `node .claude/skills/validate-plugin-consistency/check-consistency.js --project-root .` prints `✓ All consistency checks passed.` and exits 0 (same at b00f176).
- (4) `grep -n "findPluginInstalls\|\.claude/plugins" plugins/sdlc-utilities/scripts/skill/jira.js; echo "rc=$?"` prints only `rc=1` (ruling w7-preflight Q7: prints nothing). At b00f176 it prints `291:function findPluginInstalls() {`, `321:  const installs = findPluginInstalls();`, `rc=0`. The scanned file is the one script (1 file; `wc -l` 1021 at b00f176).
- (5) Exec total after this run: 984 (983 at b00f176 plus 1); hooks 58; behavioural 361 (count table in direct-a; ruling w2-a2 Q1: a different count is a STOP).
- (6) No behavioural run (ruling w7-preflight Q7: "No behavioural case").

---

## Context

**What problem does this change solve?**

- `jira-sdlc` fills Jira issue descriptions from templates. The plugin ships them in `skills/jira-sdlc/templates/`.
- `skill/jira.js` does not look next to itself for them. `findPluginInstalls()` walks `~/.claude/plugins` up to depth 6 and returns every `jira-sdlc/templates` dir it meets; `resolveTemplatesDir()` takes the first one.
- The plugin cache keeps old versions (for example the upstream 0.21.29). So after the plugin swap, the first match can be an old version's templates.
- If nothing matches, the script falls back to `<cwd>/plugins/sdlc-utilities/skills/jira-sdlc/templates`. That works only when the cwd is a checkout of this repo.

**What prompted this change now?**

- The owner wanted wave 7 before the swap because "after the swap, old cached versions can still be picked". Ruling w7-preflight Q5.3 put `findPluginInstalls()` in this wave as "that defect".

**What does success look like?**

- Without `--templates-dir`, `--templates` lists the nine shipped templates even when HOME holds a decoy cached install.
- With `--templates-dir`, nothing changes.
- The new exec case passes. It fails on b00f176's script (planner probe: `"defaultTemplates": ["Decoy"]`).

---

## Research Findings

Line numbers at b00f176 (re-read for this plan).

- **The resolver** (`plugins/sdlc-utilities/scripts/skill/jira.js:291-325`):

  ```js
  function findPluginInstalls() {
    const pluginsRoot = path.join(os.homedir(), '.claude', 'plugins');
    const results     = [];

    function walk(dir, depth) {
      if (depth > 6) return;
      …
          if (entry.name === 'templates' && dir.endsWith('jira-sdlc')) {
            results.push(full);
          } else {
            walk(full, depth + 1);
          }
      …
    }

    walk(pluginsRoot, 0);
    return results;
  }

  function resolveTemplatesDir(overridePath) {
    if (overridePath) return overridePath;

    const installs = findPluginInstalls();
    if (installs.length > 0) return installs[0];

    return path.join(process.cwd(), 'plugins', 'sdlc-utilities', 'skills', 'jira-sdlc', 'templates');
  }
  ```

  `findPluginInstalls` is used only at `:321` and is not exported. `resolveTemplatesDir` is called once, in `main()` at `:951` (`const templatesDir = resolveTemplatesDir(templatesOverride);`), for every subcommand, and is exported at `:1011`. `os` is still needed afterwards by `getHomeCacheRoot()` (`:60`, `os.homedir()` for `~/.sdlc-cache/jira`).
- **The override:** `--templates-dir <path>` is parsed at `:205-206`. The two template cases (`jira-sdlc-exec.yaml:341`, `:366`) and `tests/promptfoo/scripts/jira-write-guard-test.js:257` pass it, so they never reach the walk.
- **The layout:** `scripts/skill/jira.js` and `skills/jira-sdlc/templates/` are siblings under the plugin root in every layout: the installed cache, a `--plugin-dir` run and a dev checkout. `plan.js` already resolves its templates this way first (`plan.js:168-171`), and so does `lib/harden-surfaces.js:191-198`.
- **Where the dir goes:** `resolveTemplateStatus()` reads only the file names (`defaultTemplates`; `:369-374`). `checkCache()` emits only counts (`templates.defaultCount`; `:646-652`). `initTemplates()` and `copyTemplate()` copy from it. The directory path itself is not emitted in any output, and the jira SKILL.md and `docs/skills/jira-sdlc.md` do not describe the walk (grep for `plugins`, `installed`, `home`, `templates dir`). So no skill text or doc changes.
- **How the exec case runs** (`tests/promptfoo/providers/script-runner.js`):
  - `script_home` sets `HOME` for the child (`:99-103`);
  - `repo://` script paths resolve to the repo checkout (`scripts/extract-skill-content.js:71-73`), so `__dirname` is the repo's `scripts/skill`;
  - a `file://fixtures-fs/<name>` project root is copied to `fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'))` (`extract-skill-content.js:53-56`);
  - a `setup.sh` runs only if the fixture has one. This fixture has none.
  - `.claude/` directories inside fixtures are an existing pattern (e.g. `fixtures-fs/project-commit-config/.claude/sdlc.json`). The new path is not git-ignored (`git check-ignore` exit 1).
- **Planner probe** (planning evidence only, ruling w7-plan2 Q3; scratch copies in the planner's scratchpad; HOME and TMPDIR there; cwd a scratch copy of the fixture):
  - b00f176's `jira.js --project FALL --templates` printed `"defaultTemplates": ["Decoy"]`, which is the defect;
  - with the change below it printed the nine shipped names (`Bug`, `Epic`, `McpFailure`, `Spike`, `Story`, `Sub-task`, `Task`, `Test Case`, `Test Plan`) and no `Decoy`;
  - `node --check` passed; the Verification (4) grep printed nothing.
- **Existing cases that touch templates:** 4 `templates` hits in `jira-sdlc-exec.yaml`. These are the two cases at `:341` and `:366`, each with `--templates-dir {{repo_root}}/plugins/sdlc-utilities/skills/jira-sdlc/templates`, which is the same dir `__dirname` now gives. Their assertions do not change.

---

## Plan readings

- **Ruling w7-preflight Q5.3:** "`__dirname` first; the `~/.claude/plugins` home walk is dropped; `--templates-dir` is kept; the cwd fallback stays only if the spec needs it (the planner decides and discloses)." "One jira-sdlc-exec case: exec 983 → 984." → KD1, KD2, Task 2.
- **Ruling w7-plan, the fixture:** "nothing is written under the real `$HOME`; the fixture holds no credential-like files or names; the W8.29 fixture-guard rules apply; the case asserts that the `__dirname` templates win over the decoy." → Task 2.
- **Ruling w7-plan2 Q3:** "The probes are accepted as planning evidence (ruling stop-5)." No gate or PR claim rests on them.
- **Spec-first** (arbiter 2026-10-20): "spec-consequence commits go FIRST; never record a waiver nobody gave." → `R-templates-root`, direct-a Task 3.
- **One ship run per wave branch:** "one ship run per branch (owner 2026-10-20, ruling w1-oneship)". → This is that run.
- **Ship line** (ruling w1-shipauto): `/sdlc:ship-sdlc --auto --plan <frozen feat plan> --steps execute,commit --rebase skip --quality balanced`.
- **The #9123 bypass** (installed 0.21.29): self-check → `complete-step` naming #9123 → `--resume --dry-run` with the ORIGINAL flags → `--resume` with the original flags. Pre-authorised for the identical signature only.
- **In-ship commit** (ruling w1-run1commit item 2; ruling w1-plancheck m1; STANDING remedy ruling stop-1 item 2): accepted when its files equal the plan's files; a subject that differs from the `**Commit:**` subject, and/or a missing or wrong trailer, is fixed by a message-only reword amend, disclosed, with no STOP; any other difference is a STOP.
- **`**Commit:**` by hand** (ruling w1-plan R3; plan-sdlc R66). → The header field above.
- **No steering in ship-run dispatches** (ruling stop-6 Q1). The **verbatim hard-rule block goes in every dispatch prompt** (ruling stop-5 Q3, widened by ruling stop-6 Q2, the pkill line by w2-plan, the credential line by w2-e4, the probe clause by stop-7).
- **Repo files by Write/Edit only** (ruling stop-4 item 1): "Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed."
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1; W8.29): the new fixture has no `setup.sh` and runs no `git init` or `git config`, so there is nothing to guard. Workers never run a fixture `setup.sh` by hand.
- **Counts** (ruling w2-a2 Q1): "A count that differs from a plan's prediction is a STOP, even with a verified cause."
- **Classifier refusals** (ruling w4-curl; ruling w2-a2 Q3): stop and report on a refusal, never switch tools; an ERROR may be retried once, unchanged; public docs only via WebFetch.
- **Worker temp files** (ruling stop-w3-2): created under `$TMPDIR` and removed in the same run.
- **promptfoo exports** (ruling stop-9): every run uses `-o` under `pf-logs/` with a unique name.
- **Recurrence rule** (ruling stop-10-cause): a positional start-of-run `spawnSync … ETIMEDOUT` gets a `ps -o pid,etime,args --ppid <runner pid>` at ~15 s, the run finishes with its export, and it is a STOP; never reorder tests.
- **R27 learnings append** (ruling scan-r3-and-r27): execute-plan-sdlc may skip it when the hard rules forbid the write; the skip is disclosed.
- **No adapted verification** (ruling w2-judge row 52); **absence checks** report what they scanned (ruling w1b-planok m2).
- **Files extensions:** ruling w7-preflight Q5.3 and ruling w7-plan (script, dataset, the new fixture path). Any other file is a QUESTION.

Further readings, verbatim from the plan source "Readings":
- **Scope (OWNER):** `owner-q24.md`: Q24 "(a) Copy early"; "The planner re-greps at the base and covers every surface of this class". Ruling stop-11: "**Owner decisions:** `owner-q24.md`. Q24 is (a), copy early. **Wave 7** comes before the swap". Ruling w7-preflight Q1–Q7 and Shape ("**Q5.3, jira.js, is IN.**"; "`plan.js:176-194` … is follow-up **#9196**").
- **Plan review (OWNER, `owner-plan-review.md`):** "The arbiter does not review plans." The orchestrator's Opus review, then FREEZE and `PLAN-FROZEN` for the record.
- **Direct commits** (ruling commit-wrapper item 1; in force for ALL of M5.1): one call: `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "<exact subject>" <body-file> <files…>`; the body file has NO `Co-Authored-By` line (ruling w3-trailers); the subject is passed literally (ruling stop-3); the call runs ALONE in its own Bash call (ruling w2-a2 Q2): "Nothing chained before or after it, not even read-only commands." Ruling stop-8: "If the cwd may have drifted, run `cd <worktree>` in its own Bash call before the wrapper call; never prefix or suffix the wrapper call with anything, not even `cd`." Prefer absolute paths. (N/A to this plan: its one commit is the in-ship commit)
- **Quoting** (ruling w6-preflight Q10): single-quote model-inlined literals, `'` as `'\''`, never in double quotes. (N/A to this plan)
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → The `**Commit:**` subject is 59 characters.
- **Scratch work** (ruling stop-7): scratch repos, archive copies and probes stay inside the own session scratchpad.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| cwd fallback | no (planner decides, ruling Q5.3) | dropped | no spec line needs it (KD2) |
| Decoy fixture is static | no | one checked-in `Decoy.md` under `.claude/plugins/…`; no `setup.sh` | the ruling puts the decoy home "inside the fixture copy"; a static file needs no guard and no runtime write |
| The case asserts names, not the dir path | no | asserts `"Test Plan"`, `"Story"` present and `"Decoy"` absent | the output carries names only (`defaultTemplates`); the dir path is never emitted |

---

## Key Decisions

- **KD1 — `__dirname`, not a smarter search.** The script resolves `path.join(__dirname, '..', '..', 'skills', 'jira-sdlc', 'templates')`. The alternative was to keep the walk and rank versions, like the old #258 scripts. That was rejected: the running script IS the active install, so its own sibling dir is always the right one (the same reasoning the session-start hook uses for the plugin root).
- **KD2 — the cwd fallback is dropped.** It existed only for a repo checkout with nothing installed. `__dirname` covers that case too, from any cwd. No spec line needs the fallback (direct-a KD-A3). Keeping it would add a second source that can disagree with the first, which is the defect class itself.
  - **Visible behaviour change:** someone running a script from one checkout while the cwd is a different checkout now gets the running script's templates, not the cwd's.
  - **Visible behaviour change:** after the swap, the jira skill always uses the active version's templates, never a cached older one.
  - **Visible behaviour change:** from a sub-directory, the shipped templates are found. Before, the cwd fallback failed there and `defaultTemplates` was empty when nothing was installed.
- **KD3 — `findPluginInstalls()` is deleted, not kept unused** (YAGNI). It is not exported, and no test or other script calls it (grep).
- **KD4 — the exec case.** It reuses the existing case shape (`script_home: "{{project_root}}"`, `repo://` script) and adds one static fixture. The decoy lives at `.claude/plugins/cache/sdlc-marketplace/sdlc/0.0.1/skills/jira-sdlc/templates/Decoy.md`. That is the depth and name pattern the old walk matches (`dir.endsWith('jira-sdlc')`, `entry.name === 'templates'`). So the case FAILS on b00f176 and PASSES after Task 1 (planner probe).
  - Nothing is written under the real `$HOME`: HOME is the fixture copy in `$TMPDIR`.
  - No file or name is credential-like.
- **KD5 — workspace modes.** The templates dir depends only on the script's location, so `ship.workspace=branch` and `=worktree` behave the same. The custom templates dir (`resolveSdlcRoot()/.sdlc/jira-templates`) and the cache path are unchanged.

---

## Contract Examples

**code** (Task 1):

```markdown
**Contract:**
- shape (code): `resolveTemplatesDir(overridePath: string|undefined): string` returns `overridePath` when
  truthy, else `path.join(__dirname, '..', '..', 'skills', 'jira-sdlc', 'templates')`; `findPluginInstalls`
  removed; no new import; `os` stays (used by `getHomeCacheRoot`).
- names: `resolveTemplatesDir` (kept, exported), `findPluginInstalls` (removed).
- mirror: `plan.js:168-171` (`path.join(__dirname, '..', '..', 'skills', 'plan-sdlc', templateName)`).
- decisions: KD1, KD2, KD3.
- sync: `main()` `:951` caller unchanged; module.exports unchanged.
```

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds the exec case for the changed behaviour; the existing template cases still hold |
| no-ci-bypass | error | PASS | No check is skipped |
| no-auto-eval | error | PASS | Exec-only targeted runs (fully relaxed); no behavioural run |
| spec-first | error | PASS | `R-templates-root` lands in direct-a Task 3 before this run |
| scripts-over-llm-logic | error | PASS | The fix is in the script |
| project-agnostic | error | PASS | Plugin code; works in every consumer project (KD2) |
| workspace-mode-compatibility | error | PASS | KD5 |
| state-machine-idempotency | error | N/A | No migration, init or preflight logic changes |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag; `--templates-dir` is unchanged |
| state-premise / failure-audience | error / warning | PASS | Goal, first bullet; Context (jira-sdlc users after the swap) |
| explicit-non-goals | warning | PASS | `plan.js:176-194` (#9196) and `plan-explore.js` are out (ruling Q5.4) |
| yagni / kiss / dry | warning | PASS | KD3; one path expression mirroring `plan.js` |
| other guardrails | — | N/A | No SKILL.md, dispatch or prompt change |

---

## Tasks

### Task 1: `resolveTemplatesDir()` — the templates beside the script

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/jira.js` — replace `:291-325` (`findPluginInstalls` + `resolveTemplatesDir`) with the block below.

**Notes:** KD1–KD3. Risk Medium because every jira.js subcommand calls the resolver (Verification (2) runs all of them).

**Edit (old → new), with the Edit tool:** locate with `grep -c 'function findPluginInstalls() {' plugins/sdlc-utilities/scripts/skill/jira.js` (prints `1`). The old_string is exactly these 35 lines (`:291-325` at b00f176):

old:
```js
function findPluginInstalls() {
  const pluginsRoot = path.join(os.homedir(), '.claude', 'plugins');
  const results     = [];

  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'templates' && dir.endsWith('jira-sdlc')) {
        results.push(full);
      } else {
        walk(full, depth + 1);
      }
    }
  }

  walk(pluginsRoot, 0);
  return results;
}

function resolveTemplatesDir(overridePath) {
  if (overridePath) return overridePath;

  const installs = findPluginInstalls();
  if (installs.length > 0) return installs[0];

  return path.join(process.cwd(), 'plugins', 'sdlc-utilities', 'skills', 'jira-sdlc', 'templates');
}
```
new:
```js
// Spec R-templates-root: the shipped templates are the ones next to this script
// (scripts/skill/ → skills/jira-sdlc/templates). No search of the home dir, which
// can return a stale cached install; --templates-dir overrides.
function resolveTemplatesDir(overridePath) {
  if (overridePath) return overridePath;
  return path.join(__dirname, '..', '..', 'skills', 'jira-sdlc', 'templates');
}
```

**Acceptance criteria:**
- [ ] The edit above is applied with the Edit tool; nothing else in the file changes.
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/jira.js` exits 0.
- [ ] `grep -n "findPluginInstalls\|\.claude/plugins" plugins/sdlc-utilities/scripts/skill/jira.js; echo "rc=$?"` prints only `rc=1` (at b00f176: the `:291` and `:321` lines, then `rc=0`).
- [ ] `sha256sum plugins/sdlc-utilities/scripts/skill/jira.js` prints `e95714325a160de73542cee21aef22e09f22d5390a8efdaca7485fe99a38d07f  plugins/sdlc-utilities/scripts/skill/jira.js` (planner probe).

**Contract:**
- shape (code): as in Contract Examples (code).
- names: `resolveTemplatesDir`; `findPluginInstalls` removed.
- mirror: `plan.js:168-171`.
- decisions: KD1, KD2, KD3.
- sync: the exec case of Task 2; spec `R-templates-root` (direct-a Task 3).

**Must not touch:** every other function of `jira.js` (`getHomeCacheRoot`, `parseArgs`, `resolveTemplateStatus`, `main`, `module.exports`), and `os`/`fs` requires.

**Rules for this task:** HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop); never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens); promptfoo only as npx --yes promptfoo@0.123.1 with the brief's PF-ENV. Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools (an ERROR may be retried once, unchanged). Public docs only via WebFetch. Temp files go under `$TMPDIR` and are removed in the same run.

### Task 2: one exec case and its decoy-home fixture

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/jira-templates-decoy-home/.claude/plugins/cache/sdlc-marketplace/sdlc/0.0.1/skills/jira-sdlc/templates/Decoy.md`
- Modify: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — one new case after the `--check surfaces templates.fallbacks` case.

**Notes:** KD4. The case passes only with Task 1. On b00f176's script the walk finds the decoy, so `"Decoy"` appears and the `not-icontains` assertion fails.

**The fixture file** (Write tool; exactly these three lines and a final newline):

```markdown
## Summary

Decoy template of a stale cached install. The jira templates must never resolve here.
```

**The case.** Edit with the Edit tool. The old_string is the last 4 assertion lines of the `--check surfaces templates.fallbacks` case, which are unique (`"Whim"` alone occurs twice):

old:
```yaml
    - type: icontains
      value: '"uncoveredTypes":'
    - type: icontains
      value: '"Whim"'
```
new:
```yaml
    - type: icontains
      value: '"uncoveredTypes":'
    - type: icontains
      value: '"Whim"'

# ---------- Templates resolve beside the script (R-templates-root) ----------
# HOME is the fixture copy, which holds a decoy cached install under .claude/plugins/.
# With no --templates-dir, the shipped templates next to jira.js must win.

- description: "jira-prepare (templates-root): --templates lists the shipped templates beside the script, not a decoy install under HOME"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/jira.js"
    script_cwd: "{{project_root}}"
    script_home: "{{project_root}}"
    project_root: "file://fixtures-fs/jira-templates-decoy-home"
    script_args: "--project FALL --templates"
  assert:
    - type: icontains
      value: '"Test Plan"'
    - type: icontains
      value: '"Story"'
    - type: not-icontains
      value: '"Decoy"'
```

**Acceptance criteria:**
- [ ] Both files are written with the Write/Edit tool exactly as above.
- [ ] `sha256sum tests/promptfoo/datasets/jira-sdlc-exec.yaml tests/promptfoo/fixtures-fs/jira-templates-decoy-home/.claude/plugins/cache/sdlc-marketplace/sdlc/0.0.1/skills/jira-sdlc/templates/Decoy.md` prints `7d6027f679dc57a1ae98cd0dd727385f428e4fee37ee0e10565a1b46bedfedf8` and `9efd06cb989eea0420d8722e6c4d6883a2467537314a25caa96db658039f68b5` (planner probe).
- [ ] `grep -c '^- description:' tests/promptfoo/datasets/jira-sdlc-exec.yaml` prints `27` (26 at b00f176).
- [ ] `find tests/promptfoo/fixtures-fs/jira-templates-decoy-home -type f | wc -l` prints `1`, and the fixture has no `setup.sh`.
- [ ] With PF-ENV (`export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;` in the same Bash call):
  - `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "jira-prepare \(templates-root\)" -o /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/pf-logs/w7-jira-templates-root.json` prints 1 passed, 0 failed;
  - `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "jira-prepare|jira\.js --validate-body|stdin-fd0: jira|migrate-jira-templates|guardrail helper: template-fallback" -o /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/pf-logs/w7-jira-consumers.json` prints 24 passed, 0 failed.
- [ ] Exec total 984: the static count of `^- description:` over the datasets `promptfooconfig-exec.yaml` lists is 984 (983 at b00f176); hooks 58.

**Contract:**
- shape (code): promptfoo case keys `description`, `vars` (`script_path`, `script_cwd`, `script_home`, `project_root`, `script_args`), `assert` (2× `icontains`, 1× `not-icontains`); `--filter-pattern` `jira-prepare \(templates-root\)`.
- names: case description prefix `jira-prepare (templates-root): `; fixture `jira-templates-decoy-home`.
- mirror: `jira-sdlc-exec.yaml:341-364` (the `--templates` fallback case: same vars shape, `script_home: "{{project_root}}"`).
- decisions: KD4.
- sync: spec `R-templates-root` Acceptance (direct-a Task 3).

**Must not touch:** every existing case of `jira-sdlc-exec.yaml`; every other fixture.

**Rules for this task:** HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop); never read, print, source, pass or probe (ls/test/stat/find) .env or any credential file (--env-file, .npmrc, keys, tokens); promptfoo only as npx --yes promptfoo@0.123.1 with the brief's PF-ENV. Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools (an ERROR may be retried once, unchanged). Public docs only via WebFetch. Temp files go under `$TMPDIR` and are removed in the same run. If a permission dialog appears for the write under `.claude/`, stop and report it; do not work around it.

---

## Final Shape

`skill/jira.js` resolves the shipped jira templates in one line: the `--templates-dir` override, or the `templates` dir beside the script. The home-dir walk and the cwd fallback are gone. So the jira skill always uses the active version's templates, after the swap too.

One new exec case guards this: a decoy cached install under HOME never wins. The 23 existing jira.js cases still pass. Exec grows from 983 to 984, and hooks stay at 58.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

| Requirement | Covering task(s) | Status |
|---|---|---|
| `__dirname` first; home walk dropped; `--templates-dir` kept (Q5.3) | Task 1 | covered |
| cwd fallback decision, disclosed (Q5.3) | Task 1, KD2 | covered |
| One exec case; decoy home inside the fixture copy; no write under real `$HOME`; `__dirname` wins (w7-plan) | Task 2 | covered |
| Exec 983 → 984, hooks 58 | Verification (5) | covered |
| Gate grep prints nothing (Q7) | Verification (4) | covered |

Verdict: All checks passed. Ready for archive.

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
