# Setup-sdlc runtime steps and project-scan hardening (M2) Implementation Plan

**Commit:** `fix(#9362): setup-sdlc - scan guard, dry-run diff, field defaults`
**Goal:**
- Stop the project scan from reading files outside the repository or device files (M-13).
- Make the end-of-run diff preview compare the real files with the real merged write (X, M-10, M-11).
- Give the PR template sub-flow the recent PRs it needs, and a failure rule for the scan re-run (M-9, M-12).
- Fix the inverted AskUserQuestion rule and the stale write bullet in SKILL.md (M-14).
- Use each field's current value as its prompt default, and mark `--force` deprecated (R7/A3 owner decision).

**Architecture:** All behaviour that needs file access moves into scripts: `lib/project-scan.js` gets one guarded reader, `util/setup-init.js` gets a `--dry-run` mode that shares the merge with the real write (new helpers in `lib/config.js`), and `skill/setup.js` emits `field.current`. SKILL.md only calls these scripts and renders their output. The spec is amended in place (A3, R7, R-walk-3) and gains R26, R27, E5 and P9.
**Source:** conversation context (wave M2 scope, tracking id #9362; architect-validated scope of 2026-11-12)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

The setup-sdlc skill has six defects that were found by an architect review and re-verified at HEAD f56c2f1.

- The project scan reads `CLAUDE.md`, `AGENTS.md`, `package.json`, `go.mod`, `pyproject.toml`, `requirements.txt` and `serverless/resources.yml` with a reader that follows symlinks (links to other files) and has no size limit. A symlinked `CLAUDE.md` can copy lines from outside the repository into the scan. A symlink to `/dev/zero` (a device that never ends) makes the scan hang.
- The diff preview before a config write compares against a "snapshot" that the Step 0 output does not contain. Its diff helper also reports every untouched section as removed when the "after" object holds only the changed sections. The local config is not previewed at all.
- The PR template sub-flow never gets recent PRs, because the review-dimensions section runs first, scans without `--scan-prs`, and the scan is then reused.
- A failed scan re-run has no failure rule.
- A positive rule ("Use AskUserQuestion for every answer…") sits under `## DO NOT`, so it reads as a ban.
- The spec promises a per-field `keep | change | unset` prompt and a `--force` that skips it. Neither exists.

**What prompted this change now?**

Wave M2 of the setup-sdlc hardening programme. The owner decided on 2026-11-12 how to close the R7/A3 gap: "Amend spec + current-value default".

**What does success look like?**

- A scan of a project whose `CLAUDE.md` and `package.json` are symlinks to outside files returns no rules and no dependency signal, and does not hang.
- `setup-init.js --dry-run` prints the per-file diff of the real merged write and writes no file.
- A setup run that selects both review-dimensions and pr-template scans once, with `--scan-prs`.
- Each Step 3.G prompt defaults to the value already in the config.
- The targeted exec cases pass, and the `setup-prepare` exec subset stays green.

## Research Findings

The exploration brief is `/tmp/sdlc-explore-main-oxhu9k/discovery-brief.md` (four code dimensions, no web research). Each item was also re-checked by hand at HEAD f56c2f1.

**Item 1, M-13 (project-scan reads), confirmed.**

- `readFileSafe` is a bare `fs.readFileSync` in a try/catch, with no size cap and no realpath check (F-project-scan-guarded-reader-1).
- It is used for `package.json` (three detector sites through `parseJsonSafe`), `go.mod`, `pyproject.toml`/`requirements.txt`, `serverless/resources.yml` and both `CLAUDE.md`/`AGENTS.md` (F-project-scan-guarded-reader-3).
- `FILE_MAX_BYTES` already exists at 8 KiB. Only `readCapped` uses it, for `scan.files` (F-project-scan-guarded-reader-4).
- `realPathWithin` is used only in `scanFiles` and the workflow loop of `scanCiFiles` (F-project-scan-guarded-reader-5).
- `realRoot` (the resolved real path of the project root) is computed twice, in `scanFiles` and `scanCiFiles`, and never in `scanProject` (F-project-scan-guarded-reader-6).
- The `Jenkinsfile`/`.circleci/config.yml`/`.gitlab-ci.yml` check uses `isFile` only (F-project-scan-guarded-reader-7).
- The detectors are also exported to `skill/guardrails.js`, which calls them with `(projectRoot, signals)` (guardrails.js:377-380). Any new parameter must therefore be optional.

**Item 2, X + M-10 + M-11 (diff preview), confirmed.**

- The Step 0 manifest carries only `projectConfig.{exists,sections,misplaced,path}` and `localConfig.{exists,path}`, with no config body (F-setup-init-dry-run-diff-8).
- `computeConfigDiff` walks `before ∪ after`. A partial "after" therefore reports untouched keys as changed to `undefined` (F-setup-init-dry-run-diff-3).
- `writeProjectConfig` does a shallow top-level merge and stamps `schemaVersion` and `$schema` (F-setup-init-dry-run-diff-1).
- `writeLocalConfig` does the same merge, but also drops the legacy `version` key and uses the local schema URL (F-setup-init-dry-run-diff-2).
- SKILL.md Diff preview uses `mktemp -d`, the Write tool, an inline `node -e` with no exit handling, and `rm -rf` (F-setup-init-dry-run-diff-9).
- `setup-init.js` side effects that a dry run must skip are `ensureSdlcGitignore`, `sweepBackups`, `ensureRootGitignore` and both config writes (F-setup-init-dry-run-diff-6).
- `writeOutput` writes the result JSON under the state dir, falling back to the OS temp dir, and prints only its path (F-setup-init-dry-run-diff-7).

**Item 3, M-9 (recent PRs), confirmed.**

- Step 3.S re-runs the scan only when `prepare.scan` is absent (F-setup-skill-scan-prs-and-rules-1, -2).
- Step 0 runs `setup.js` with `$ARGUMENTS` only, so `prepare.scan` is normally absent.
- The section order puts review-dimensions before pr-template (F-setup-skill-scan-prs-and-rules-5). The first re-run therefore has no `--scan-prs`, and pr-template reuses a scan whose `recentPrs` is `[]`.

**Item 4, M-12 (scan failure rule), confirmed.**

- A `scanProject` throw reaches the catch in `setup.js` main. That catch exits 2 with stderr and no output path (F-setup-skill-scan-prs-and-rules-3).
- Step 3.S has no rule for this case.
- The Step 0 exit-code rules are at SKILL.md:61-63 (F-setup-init-dry-run-diff-11).

**Item 5, M-14 (SKILL.md rules), confirmed.**

- The positive AskUserQuestion sentence is under `## DO NOT` (F-setup-skill-scan-prs-and-rules-6).
- The bullet beside it says config writes go "via inline Node.js in Bash". Writes really go through `util/setup-init.js` (F-setup-skill-scan-prs-and-rules-7).

**Item 6, R7/A3 (current value), confirmed.**

- Step 3.G uses `field.default` as the default (F-setup-skill-scan-prs-and-rules-8).
- `currentCfgFor(section)` already returns the section slice, and `cfg` is in scope where the rows are built (F-setup-skill-scan-prs-and-rules-9).
- `shipFields` (P7) is emitted separately from `SHIP_FIELDS`, and `applyWhenGates` copies each entry with `Object.assign`. A `current` key added before the gates are applied survives them.
- `--force` only sets `defaultSelectionMode` (F-setup-skill-scan-prs-and-rules-10).
- The stale comments are at setup.js:387 ("re-run with --force anyway") and :524-525 ("skips the per-field keep prompt").

**Where the `--force` wording lives (F-42 grep).** The live copies are:

- spec A3 and R7;
- SKILL.md:25 (flag row) and :514 (Idempotency);
- docs/skills/setup-sdlc.md:29 and :45;
- setup.js:387 and :524-525.

The two site mirrors are byte copies (F-spec-docs-force-wording-copies-7). The CHANGELOG and old plans are history and are not edited (F-spec-docs-force-wording-copies-9). `README.md` and `site/src/data/skills-meta.ts` carry no setup `--force` wording (F-spec-docs-force-wording-copies-10). The existing `--force` exec cases (setup-prepare-exec.yaml:126-130 and :269-272) assert `defaultSelectionMode`/`defaultToken` only. They stay valid (F-spec-docs-force-wording-copies-6).

**Spec ids.** These are the free ids, checked with grep over `docs/specs/setup-sdlc.md` (F-spec-docs-force-wording-copies-3):

- R ids go up to R25 (R24 and R25 are withdrawn), so the next free one is R26.
- P ids go up to P8, so the next free one is P9.
- E ids go up to E4, so the next free one is E5.

**Test patterns.**

- Exec cases are flat `- description:` items with `script_path` (`repo://`), `script_cwd`, `project_root` (`file://fixtures-fs/...`) and `script_args` (F-project-scan-guarded-reader-8).
- Helper scripts follow `tests/promptfoo/scripts/run-review-tempdir-gc.js`: `mkdtempSync`, build the fixture in a try block, print one JSON line, `rmSync` in finally (F-project-scan-guarded-reader-9).
- `setup-prepare-exec.yaml` and `setup-init-exec.yaml` are already listed in `promptfooconfig-exec.yaml`, so new cases need no registration there.
- The fixture `fixtures-fs/setup-fully-configured` has `version.tagPrefix: "v"`, `pr.expectedAccount: "test-user"` and local `ship.bump: "patch"`.

**Validators.** The main session keeps these green:

- `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js`
- `node .claude/skills/validate-plugin-consistency/check-consistency.js`
- the plan-format validator

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Detector file-size cap | no | adds `DETECTOR_MAX_BYTES = 256 KiB` for detector reads and keeps `FILE_MAX_BYTES = 8 KiB` for `scan.files` | the brief names `FILE_MAX_BYTES`, but 8 KiB would truncate ordinary `package.json` and `CLAUDE.md` files and break JSON parsing (see Key Decisions) |
| Dry-run diff includes the schema stamps | no | `schemaVersion` and `$schema` rows appear in the preview when the write would change them | the preview shows exactly what the write does; hiding stamps would make it differ from the write |
| `go.mod` symlinked to a device still adds `go` to `languages` | no | the existence check (`existsRel`) is not changed; only reads are guarded | the brief targets reads (leaks and hangs); presence detection reads nothing and is out of scope |
| Behavioural case for Step 3.S | no | adds one case to `tests/promptfoo/datasets/setup-sdlc.yaml`, verified by review only | the `test-coverage-required` guardrail asks for a test for SKILL.md behaviour; behavioural runs are owner-initiated only |
| `--scan` passed by the user at Step 0 | no | Step 3.S always runs its own single scan and ignores any scan in the Step 0 output | `--scan` is not a documented setup-sdlc flag; a single decision point is simpler and deterministic |
| docs/skills/setup-sdlc.md says "15 ship fields" while `ship-fields.js` has 13 | no | not fixed | outside the M2 scope; reported to the owner |
| Brief names a VALIDATORS block that is not present | no | uses `validate-spec-shape.js`, `check-consistency.js` and the plan-format validator | these are the project's documented validators |

### Decisions taken without the owner

No user was available. Each decision below took the recommended or most conservative option:

1. Detector reads use a separate 256 KiB cap. An over-cap detector file is treated as absent (no truncated parse).
2. `mergeProjectConfig`/`mergeLocalConfig` are new pure helpers in `lib/config.js`. They are shared by the writers and by `--dry-run`, so the preview cannot drift from the write.
3. The dry-run "before" is the raw file read by `readJsonFile`, not `readProjectConfig`. `readProjectConfig` falls back to legacy files and is not what the writer merges into.
4. `field.current` is emitted only when the config holds a value for that field. The key is omitted otherwise, so the manifest stays the same for unset fields.
5. A failed Step 3.S scan skips every delegated section that needs the scan in this run. Other sections continue. There is no retry.
6. The new SKILL.md positive rule goes in a new `## Interaction rules` section placed directly before `## DO NOT`.

## Key Decisions

- **One guarded reader over per-site checks.** Every detector read goes through `readWithinRoot(filePath, realRoot)`. It accepts only regular files whose real path is inside the real root, and it reads at most a capped number of bytes. Adding checks at each call site was the alternative. One reader means a new detector cannot forget the check.

- **A separate detector cap (256 KiB) over reusing the 8 KiB `FILE_MAX_BYTES`.** `scan.files` shows file heads to the model, so 8 KiB is right there. Detectors parse whole files: a 9 KiB `package.json` cut at 8 KiB is invalid JSON, and the language signal would be lost. 256 KiB still stops `/dev/zero`-style hangs. The `isFile` check already rejects devices, and the cap stops huge regular files.

- **`realRoot` computed once in `scanProject`, passed down, with an optional parameter on exported detectors.** `skill/guardrails.js` calls the detectors without a root. A default parameter `realRoot = realRootOf(projectRoot)` keeps that caller working unchanged and still guards it.

- **Dry run inside `setup-init.js` over a new script.** The preview must apply the same merge as the write. The write lives in `setup-init.js`, so the same script with `--dry-run` and the same arguments gives the same merge. A new script would duplicate argument parsing and validation.

- **Diff at write granularity.** The write is a shallow top-level merge, so a written section replaces the whole old section. The preview diffs `existing` against `merged`, not against the partial answers. Untouched sections are equal on both sides and are not reported. Removed keys inside a rewritten section are reported, because the write really removes them.

- **Decide `--scan-prs` from `selectedIds`, not from scan output.** An empty `recentPrs` is normal on non-GitHub hosts. Only the selection says whether pr-template will run.

- **`field.current` as the prompt default over a separate keep/change/unset action.** This is the owner decision of 2026-11-12. One prompt per field stays (R15 and the 3.G "exactly one AskUserQuestion per field" rule).

- **Root problem in one sentence.** setup-sdlc trusts inputs it never checked (symlinked files, a snapshot that does not exist, a scan decided by the first section) and documents behaviour (`keep` prompt) that was never built.

- **Who fails if this ships wrong.** Consumer projects running `/setup-sdlc`. A wrong guard would drop real language signals from the scan (worse guardrail and dimension proposals). A wrong dry-run merge would show a preview that differs from the write. A wrong `field.current` would offer a wrong default. `skill/guardrails.js` shares the detectors and would lose signals too.

- **Smallest viable cut.** Tasks 1, 2, 3 and 5 each close confirmed defects or the owner-decided R7/A3 change. Tasks 4 and 6 only keep the spec and user doc true. Task 7 only runs the final checks. No task adds behaviour beyond the six items.

- **Non-goals.** These are left out on purpose:
  - no guard on presence checks (`existsRel`, `findDir`);
  - no change to `scan.files` cap or content;
  - no keep/change/unset action;
  - no removal of the `--force` flag (deprecation only);
  - no fix of the "15 ship fields" doc text;
  - no change to `setup-guardrails.md` inline-Node wording;
  - no headless or behavioural runs;
  - nothing from M3, M4, jira or GitHub work.

- **Workspace modes (branch and worktree).** The scan already reads the active worktree for content and the main worktree for review dimensions (`resolveActiveWorktreeSafe`, `projectRoot`), and Task 1 keeps that split. `setup-init.js` keeps its documented bootstrap `process.cwd()` root (C-projectroot exemption), and the dry run reads the same paths the write uses. `field.current` comes from the config `setup.js` already reads through `resolveSdlcRoot()`. Nothing new writes to cwd.

- **New flag name check.** `--dry-run` is added to `util/setup-init.js`, which is an internal util script, not a user-invoked prepare script. Elsewhere it already means "compute, do not write" (`skill/review.js --dry-run`, `skill/migrate-config.js --dry-run`, spec I2c). No conflicting meaning exists.

- **PR linking.** #9362 is an internal tracking id, not a GitHub issue. The PR body names it without `Fixes`/`Closes`. The `pr-link-github-issue` guardrail does not apply.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): `readWithinRoot(filePath: string, realRoot: string|null, maxBytes = DETECTOR_MAX_BYTES): string|null`;
  null when realRoot is null, the path is not a regular file, its real path is outside realRoot, the read fails, or the file is larger than maxBytes.
- names: `readWithinRoot`, `realRootOf`, `DETECTOR_MAX_BYTES`.
- mirror: `readCapped` / `realPathWithin` at `plugins/sdlc-utilities/scripts/lib/project-scan.js:619-642`.
- decisions: over-cap means absent (Key Decisions: separate detector cap).
- sync: `skill/guardrails.js` calls the detectors without `realRoot` — the parameter must stay optional.
```

### Worked example — docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/setup-sdlc.md` `### Diff Preview and Confirmation`; replace the first paragraph with the dry-run description (audience: end users).
- names: heading `### Diff Preview and Confirmation` (unchanged).
- mirror: the existing paragraph and table style in that section.
- decisions: user-facing prose only; no internal function names except `util/setup-init.js --dry-run`.
- sync: `site/src/content-source/skills/setup-sdlc.md` byte copy via `cp`.
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY `A3`, `R7`, `R-walk-3`, `P7`, `P-sections`; ADD `R26`, `R27`, `E5`, `P9`; delta text pinned in Task 4.
- names: `R26`, `R27`, `E5`, `P9` (new); `A3`, `R7`, `R-walk-3`, `P7`, `P-sections` (modified).
- mirror: requirement style at `docs/specs/setup-sdlc.md:82-85` (R7, R10, R14).
- decisions: numeric ids continue from R25, E4 and P8; nothing renumbered.
- sync: `site/src/content-source/specs/setup-sdlc.md` byte copy via `cp`.
```

## Tasks

Execute waves (F-43): wave 1 runs Tasks 1, 2, 4, 5 and 6; wave 2 runs Task 3 (it shares `setup-prepare-exec.yaml` with Task 1); wave 3 runs Task 7.

### Task 1: Guarded reader for project-scan detectors (M-13)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/project-scan.js` — one guarded reader; `realRoot` computed once in `scanProject`; CI-file check guarded
- Create: `tests/promptfoo/scripts/run-project-scan-symlink.js` — builds a symlinked project at runtime and reports the scan result
- Modify: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — one exec case for the helper

**Notes:**
Implements spec R26 (Task 4). Symlinks are created at runtime in `os.tmpdir()`, never committed (brief rule). The scan runs in a child process with a timeout, so a hang shows as a failed case instead of a stuck eval. Cites F-project-scan-guarded-reader-1 to -9.

**Acceptance criteria:**
- [ ] No call to `readFileSafe` or `fs.readFileSync` remains in the detector code; every detector read goes through `readWithinRoot`.
- [ ] `scanProject` computes `realRoot` once and passes it to the detectors, `scanFiles` and `scanCiFiles`.
- [ ] `Jenkinsfile`, `.circleci/config.yml` and `.gitlab-ci.yml` are listed only when `isFile` and `realPathWithin` both pass.
- [ ] `skill/guardrails.js` is not edited and still works (detectors called with two arguments).
- [ ] The helper prints `timedOut: false`, `exit: 0`, empty `claudeMdRules`, no `express` in `frameworks`, `flask` in `frameworks` (control file), no `Jenkinsfile` in `ciFiles`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "project-scan symlink"` passes.

**Contract:**
- shape (code): new module-level helpers and changed signatures in `project-scan.js`:

  ```js
  const DETECTOR_MAX_BYTES = 256 * 1024;            // next to FILE_MAX_BYTES (8 KiB, unchanged)
  function realRootOf(root)                         // fs.realpathSync(root) or null on error
  function readCapped(filePath, maxBytes = FILE_MAX_BYTES)   // existing; cap now a parameter
  function readWithinRoot(filePath, realRoot, maxBytes = DETECTOR_MAX_BYTES)
    // → string | null. null when: !realRoot; !isFile(filePath); !realPathWithin(filePath, realRoot);
    //   readCapped returns null; or readCapped(...).truncated === true.
  function parseJsonSafe(filePath, realRoot)        // readWithinRoot + JSON.parse, null on failure
  // readFileSafe is deleted; its callers use readWithinRoot(filePath, realRoot).

  function detectLanguagesAndFrameworks(projectRoot, signals, realRoot = realRootOf(projectRoot))
  function detectStructure(projectRoot, signals, realRoot = realRootOf(projectRoot))
  function extractClaudeMdRules(projectRoot, signals, realRoot = realRootOf(projectRoot))
  function scanFiles(contentRoot, realRoot)         // returns {} when realRoot is null
  function scanCiFiles(contentRoot, realRoot)       // returns [] when realRoot is null
  ```

  `scanProject` body, before → after:

  ```diff
   function scanProject(contentRoot, { projectRoot, prs = false } = {}) {
     const signals = createSignals();
  -  detectLanguagesAndFrameworks(contentRoot, signals);
  -  detectStructure(contentRoot, signals);
  +  const realRoot = realRootOf(contentRoot);
  +  detectLanguagesAndFrameworks(contentRoot, signals, realRoot);
  +  detectStructure(contentRoot, signals, realRoot);
     detectReviewDimensions(projectRoot || contentRoot, signals);
  -  extractClaudeMdRules(contentRoot, signals);
  +  extractClaudeMdRules(contentRoot, signals, realRoot);
  ...
  -    files: scanFiles(contentRoot),
  +    files: scanFiles(contentRoot, realRoot),
       hosting,
  -    ciFiles: scanCiFiles(contentRoot),
  +    ciFiles: scanCiFiles(contentRoot, realRoot),
  ```

  CI loop in `scanCiFiles`:

  ```diff
     for (const rel of ['Jenkinsfile', '.circleci/config.yml', '.gitlab-ci.yml']) {
  -    if (isFile(path.join(contentRoot, rel))) ciFiles.push(rel);
  +    const abs = path.join(contentRoot, rel);
  +    if (isFile(abs) && realPathWithin(abs, realRoot)) ciFiles.push(rel);
     }
  ```

  Helper `run-project-scan-symlink.js` (no arguments; ignores its cwd). It builds `outside/` and `project/` under one `fs.mkdtempSync(path.join(os.tmpdir(), 'project-scan-symlink-'))` dir:

  | path in `project/` | kind | target / content |
  |---|---|---|
  | `CLAUDE.md` | symlink | `outside/secret.md` = `Engineers must rotate the outside secret\n` |
  | `package.json` | symlink | `outside/package.json` = `{"dependencies":{"express":"4.0.0"}}` |
  | `AGENTS.md` | symlink | `/dev/zero` |
  | `serverless/resources.yml` | symlink | `/dev/zero` |
  | `Jenkinsfile` | symlink | `outside/Jenkinsfile` = `pipeline {}\n` |
  | `requirements.txt` | regular file | `flask==3.0\n` (positive control) |

  It runs `spawnSync(process.execPath, ['-e', <code>, projectDir], { timeout: 20000, encoding: 'utf8' })`. The child code requires `<REPO_ROOT>/plugins/sdlc-utilities/scripts/lib/project-scan.js`, calls `scanProject(dir, { prs: false })` and prints `JSON.stringify({ claudeMdRules, languages, frameworks, ciFiles, files: Object.keys(files) })`. The parent prints one line:

  ```json
  {"exit":0,"timedOut":false,"claudeMdRules":[],"languages":["python"],"frameworks":["flask"],"ciFiles":[],"files":["requirements.txt"]}
  ```

  `timedOut` is `res.error && res.error.code === 'ETIMEDOUT'`. The `finally` block runs `fs.rmSync(base, { recursive: true, force: true })`.

  Exec case appended to the "Project scan" block of `setup-prepare-exec.yaml`:

  ```yaml
  - description: "setup-prepare (#9362): project-scan symlink and device files are not read (R26)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-project-scan-symlink.js"
      script_args: ""
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-setup-empty"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const checks = {
            noHang: r.timedOut === false && r.exit === 0,
            noRules: Array.isArray(r.claudeMdRules) && r.claudeMdRules.length === 0,
            noExpress: !r.frameworks.includes('express'),
            control: r.frameworks.includes('flask'),
            noJenkins: !r.ciFiles.includes('Jenkinsfile'),
            noFiles: !r.files.includes('CLAUDE.md') && !r.files.includes('package.json'),
          };
          const failed = Object.keys(checks).filter(k => !checks[k]);
          return failed.length === 0 ? true : 'FAIL: ' + failed.join(', ');
  ```

- names: `DETECTOR_MAX_BYTES`, `realRootOf`, `readWithinRoot`, `parseJsonSafe(filePath, realRoot)`; helper file `run-project-scan-symlink.js`; case description prefix `setup-prepare (#9362): project-scan symlink`.
- mirror: `readCapped`/`realPathWithin`/`scanFiles` at `project-scan.js:619-660`; helper shape `tests/promptfoo/scripts/run-review-tempdir-gc.js:1-45`; case shape `setup-prepare-exec.yaml:361-385`.
- decisions: separate detector cap; over-cap means absent; existence checks unchanged (Deviations table).
- sync: `skill/guardrails.js:377-380` calls detectors with two arguments — keep the default parameter; the module header comment's export list stays accurate.

### Task 2: `setup-init.js --dry-run` with shared merge helpers (X, M-10, M-11)

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/config.js` — extract `mergeProjectConfig`/`mergeLocalConfig`; writers call them; export both
- Modify: `plugins/sdlc-utilities/scripts/util/setup-init.js` — parse `--dry-run`; emit P9 and skip every side effect
- Create: `tests/promptfoo/scripts/run-setup-init-dry-run.js` — copies a fixture to a temp dir, runs `--dry-run`, checks nothing was written
- Modify: `tests/promptfoo/datasets/setup-init-exec.yaml` — three `--dry-run` cases

**Notes:**
Implements spec P9 and amended R-walk-3 (Task 4). This is Complex because it adds a new prepare-script contract and must keep the real write byte-identical. The merge is moved, not rewritten, so existing setup-init cases guard the write path. Cites F-setup-init-dry-run-diff-1 to -8 and -12.

**Acceptance criteria:**
- [ ] `writeProjectConfig` and `writeLocalConfig` produce the same file content as before (existing `setup-init` exec cases pass unchanged).
- [ ] With `--dry-run`, the script skips `ensureSdlcGitignore`, `sweepBackups`, `ensureRootGitignore` and both config writes; in the non-git temp copy the helper sees an unchanged file tree (the output manifest goes through `writeOutput` as for every prepare script).
- [ ] A section not named in `--project-config`/`--local-config` never appears in `changed[]`.
- [ ] Invalid JSON with `--dry-run` exits 1 with the same `errors[]` text as without it.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "setup-init"` passes.

**Contract:**
- shape (code): `lib/config.js`, new pure helpers (read, no write):

  ```js
  /** @returns {{ filePath: string, existing: object, merged: object }} */
  function mergeProjectConfig(projectRoot, config)
    // filePath = path.join(projectRoot, PROJECT_CONFIG_PATH); existing = readJsonFile(filePath) || {};
    // merged = { ...existing, ...config, schemaVersion: config.schemaVersion != null ? config.schemaVersion : CURRENT_SCHEMA_VERSION, $schema: PROJECT_SCHEMA_URL }
  function mergeLocalConfig(projectRoot, config)
    // same, with LOCAL_CONFIG_PATH, legacy `version` key dropped from existing before the spread, $schema: LOCAL_SCHEMA_URL
  ```

  Writers after the change:

  ```diff
   function writeProjectConfig(projectRoot, config) {
  -  const filePath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  -  let existing = readJsonFile(filePath) || {};
  -  const merged = {
  -    ...existing,
  -    ...config,
  -    schemaVersion: config.schemaVersion != null ? config.schemaVersion : CURRENT_SCHEMA_VERSION,
  -    $schema: PROJECT_SCHEMA_URL,
  -  };
  +  const { filePath, merged } = mergeProjectConfig(projectRoot, config);
     writeJsonFile(filePath, merged);
     _traceRead(path.resolve(filePath), 'write');
   }
  ```

  (`writeLocalConfig` is changed the same way, using `mergeLocalConfig`.) Add `mergeProjectConfig` and `mergeLocalConfig` to `module.exports`.

  `util/setup-init.js`: `parseArgs` returns `{ projectConfig, localConfig, dryRun }` (`--dry-run` sets `dryRun: true`). In `main()`, after validation and before step 1 (`ensureSdlcGitignore`):

  ```js
  if (cli.dryRun) {
    const entry = (raw, merge, rel) => {
      if (raw === null) return null;
      const config = JSON.parse(raw);
      if (Object.keys(config).length === 0) return null;
      const { existing, merged } = merge(projectRoot, config);
      return { path: rel, ...computeConfigDiff(existing, merged) };
    };
    writeOutput({ errors, warnings, dryRun: true, diff: {
      projectConfig: entry(cli.projectConfig, mergeProjectConfig, '.sdlc/config.json'),
      localConfig:   entry(cli.localConfig,   mergeLocalConfig,   '.sdlc/local.json'),
    } }, 'setup-init', 0);
    return;
  }
  ```

  Output (P9):

  | key | type | value |
  |---|---|---|
  | `errors` | string[] | `[]` on success; on invalid JSON the existing validation path exits 1 before the dry-run branch |
  | `warnings` | string[] | `[]` |
  | `dryRun` | boolean | `true` |
  | `diff.projectConfig` | object \| null | `{ path: ".sdlc/config.json", changed: [{ path, before, after }], unchanged: <n> }`; `null` when `--project-config` is absent or `{}` |
  | `diff.localConfig` | object \| null | same with `".sdlc/local.json"` |

  Exit codes: 0 success; 1 invalid JSON (unchanged path); 2 crash (unchanged catch, e.g. an existing config file with invalid JSON).

  Header usage comment gains: `--dry-run  Print the per-file diff of the merged write; write nothing (P9)`.

  Helper `run-setup-init-dry-run.js` (no arguments):
  1. `fs.cpSync(<REPO_ROOT>/tests/promptfoo/fixtures-fs/setup-fully-configured, tmp, { recursive: true })` into `fs.mkdtempSync(path.join(os.tmpdir(), 'setup-init-dry-run-'))`.
  2. Snapshot every file under `tmp` (relative path → content).
  3. Run `spawnSync(process.execPath, [setupInit, '--dry-run', '--project-config', '{"version":{"mode":"tag","tagPrefix":"v"}}', '--local-config', '{"ship":{"bump":"minor"}}'], { cwd: tmp, encoding: 'utf8' })`.
  4. Read the JSON at the printed path, then remove that file.
  5. Run step 3 and 4 a second time (idempotency: a dry run changes no state, so the second `diff` must equal the first).
  6. Snapshot again, then remove `tmp` in `finally`.

  It prints:

  ```json
  {"exit":0,"treeUnchanged":true,"secondRunSame":true,"dryRun":true,"projectPaths":["schemaVersion","version.mode","version.versionFile","version.fileType","$schema"],"localPaths":["schemaVersion","ship.steps","ship.bump","…","$schema"]}
  ```

  Three cases appended to `setup-init-exec.yaml`:

  ```yaml
  - description: "setup-init (#9362): --dry-run writes nothing and diffs only touched sections (P9)"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-setup-init-dry-run.js"
      script_args: ""
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-setup-empty"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const outside = p => /^(jira|commit|pr)(\.|$)/.test(p);
          const checks = {
            exit0: r.exit === 0, dryRun: r.dryRun === true, noWrite: r.treeUnchanged === true,
            idempotent: r.secondRunSame === true,
            modeChanged: r.projectPaths.includes('version.mode'),
            untouchedHidden: !r.projectPaths.some(outside),
            tagPrefixSame: !r.projectPaths.includes('version.tagPrefix'),
            localBump: r.localPaths.includes('ship.bump'),
          };
          const failed = Object.keys(checks).filter(k => !checks[k]);
          return failed.length === 0 ? true : 'FAIL: ' + failed.join(', ');

  - description: "setup-init (#9362): --dry-run on an empty project reports only the new section"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/util/setup-init.js"
      script_args: "--dry-run --project-config {\"version\":{\"mode\":\"tag\"}}"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-setup-empty"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          return r.dryRun === true && r.diff.localConfig === null &&
                 r.diff.projectConfig.changed.some(c => c.path === 'version.mode' && c.after === 'tag')

  - description: "setup-init (#9362): --dry-run with invalid JSON exits 1"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/util/setup-init.js"
      script_args: "--dry-run --project-config 'not-json'"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-setup-empty"
    assert:
      - type: icontains
        value: "not valid JSON"
  ```

- names: `mergeProjectConfig`, `mergeLocalConfig`, `--dry-run`, `dryRun`, `diff.projectConfig`, `diff.localConfig`; helper `run-setup-init-dry-run.js`; case prefix `setup-init (#9362)`.
- mirror: merge bodies at `config.js:366-377` and `:452-469`; invalid-JSON case at `setup-init-exec.yaml:49-60`; helper shape `run-review-dry-run-gitignore.js:1-45`.
- decisions: diff `existing` vs `merged` (Key Decisions: diff at write granularity); raw `readJsonFile` read (Decision 3); stamps shown (Deviations table).
- sync: SKILL.md Diff preview (Task 5) calls exactly `--dry-run` with the same `--project-config`/`--local-config` arguments as the write; spec P9 (Task 4) carries this table.

### Task 3: Emit `field.current` and fix `--force` comments (R7/A3)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/setup.js` — add `current` to `sections[].fields[]` and `shipFields[]`; fix comments at :387 and :524-525
- Modify: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — two `field.current` cases

**Notes:**
Implements amended R7, A3, P7 and P-sections (Task 4). It depends on Task 1 only because both tasks append to `setup-prepare-exec.yaml` (F-43: one task per shared file per wave). Task 7 re-runs the full `setup-prepare` subset at the end (brief item 6). Cites F-setup-skill-scan-prs-and-rules-8 to -10.

**Acceptance criteria:**
- [ ] On `fixtures-fs/setup-fully-configured`, the `version` row's `tagPrefix` field has `current: "v"`, the `pr` row's `expectedAccount` field has `current: "test-user"`, and the `version` row's `changelog` field has no `current` key.
- [ ] `shipFields` entry `bump` has `current: "patch"` and the `ship` row's `bump` field has the same value.
- [ ] `SHIP_FIELDS` and the `SETUP_SECTIONS` field arrays are not mutated (copies only).
- [ ] No comment in `setup.js` mentions a per-field keep prompt or "--force anyway".
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "setup-prepare"` passes (whole subset, including Task 1's case).

**Contract:**
- shape (code): new helper in `setup.js` (Helpers block):

  ```js
  /** Copy fields, adding `current` when cfg holds a value for field.name (R7, P-sections). Never mutates input. */
  function withCurrent(fields, cfg) {
    if (!cfg || typeof cfg !== 'object') return fields.map(f => ({ ...f }));
    return fields.map(f => (cfg[f.name] !== undefined ? { ...f, current: cfg[f.name] } : { ...f }));
  }
  ```

  Row building in `detect()`:

  ```diff
         confirmDetected: section.confirmDetected || false,
  -      fields: section.fields,
  +      fields: withCurrent(section.fields, cfg),
       };
       return row;
     });
  +
  +  // R7/P7: shipFields carries the current local ship values too.
  +  const shipSection = SETUP_SECTIONS.find(s => s.id === 'ship');
  +  result.shipFields = withCurrent(result.shipFields, shipSection ? currentCfgFor(shipSection) : null);

     return result;
  ```

  Comment fixes:

  ```diff
  -      // conservative — a false 'set' is safer than a false 'legacy'; the user can
  -      // re-run with --force anyway.
  +      // conservative — a false 'set' is safer than a false 'legacy'; every run
  +      // offers every section again (R-walk-1).
  ```

  ```diff
  -  // --force wins over --unset-only (selection mode is 'all' in both default and --force cases;
  -  // the difference is that --force skips the per-field "keep" prompt during the dispatch loop).
  +  // --force is deprecated (A3): its only effect is to win over --unset-only, so the
  +  // default selection mode stays 'all'.
  ```

  Exec cases (after the #234 `expectedAccount` case):

  ```yaml
  - description: "setup-prepare (#9362): fields carry current config values (R7, P-sections)"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/setup.js"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/setup-fully-configured"
    assert:
      - type: javascript
        value: |
          const out = JSON.parse(output);
          const f = (id, name) => out.sections.find(s => s.id === id).fields.find(x => x.name === name);
          const checks = {
            tagPrefix: f('version', 'tagPrefix').current === 'v',
            account: f('pr', 'expectedAccount').current === 'test-user',
            unsetHasNoKey: !('current' in f('version', 'changelog')),
            shipRow: f('ship', 'bump').current === 'patch',
            shipFields: out.shipFields.find(x => x.name === 'bump').current === 'patch',
          };
          const failed = Object.keys(checks).filter(k => !checks[k]);
          return failed.length === 0 ? true : 'FAIL: ' + failed.join(', ');

  - description: "setup-prepare (#9362): empty project emits no current keys"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/skill/setup.js"
      script_cwd: "{{project_root}}"
      project_root: "file://fixtures-fs/project-setup-empty"
    assert:
      - type: javascript
        value: |
          const out = JSON.parse(output);
          return out.sections.every(s => s.fields.every(f => !('current' in f))) &&
                 out.shipFields.every(f => !('current' in f))
  ```

- names: `withCurrent`, field key `current`.
- mirror: `currentCfgFor` at `setup.js:351-366`; row object at `setup.js:448-463`; `applyWhenGates` copy style at `setup.js:549-561`.
- decisions: omit `current` when unset (Decision 4); one prompt per field kept (Key Decisions).
- sync: SKILL.md 3.G (Task 5) reads `field.current`; spec P7/P-sections (Task 4) list `current?`.

### Task 4: Spec amendments and new ids

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/setup-sdlc.md` — amend A3, R7, R-walk-3, P7, P-sections; add R26, R27, E5, P9; appendix history rows
- Modify: `site/src/content-source/specs/setup-sdlc.md` — byte copy via `cp docs/specs/setup-sdlc.md site/src/content-source/specs/setup-sdlc.md`

**Notes:**
Spec first: Tasks 1, 2, 3 and 5 cite these ids. Ids are amended in place, and nothing is renumbered. The withdrawn wording goes to the appendix only (AGENTS.md spec shape). Cites F-spec-docs-force-wording-copies-1, -3 and -7.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js` exits 0.
- [ ] `grep -n "keep | change | unset\|per-field \`keep\`" docs/specs/setup-sdlc.md` matches only appendix lines.
- [ ] `cmp docs/specs/setup-sdlc.md site/src/content-source/specs/setup-sdlc.md` exits 0.

**Contract:**
- shape (openspec): exact delta text:

  ```diff
  -- A3: `--force` — skip the per-field `keep` prompt so every field is explicitly reconfirmed; does not change default row pre-selection (all rows are pre-checked by default) and does not bypass the Step 1 menu (default: false)
  +- A3: `--force` — deprecated. Its only effect is to win over `--unset-only` for the default menu reply (`defaultSelectionMode` stays `all`). It does not bypass the Step 1 menu (default: false)
  ```

  ```diff
  -- R7: Default flow walks every configurable field. For each field the user is presented `keep | change | unset` actions. The legacy "early exit when everything is configured" behavior is preserved as an opt-in via `--unset-only` (see R-walk-1 / R-walk-2). `--force` no longer gates re-prompting (default already re-prompts) but retains its semantic of skipping the per-field "keep" prompt and reconfirming all values.
  +- R7: Default flow walks every configurable field with one prompt per field. The prompt default is the field's current value (`field.current`, P-sections and P7) when the config holds one, otherwise `field.default`. Accepting the default keeps the current value; an empty answer unsets an optional field. The legacy "early exit when everything is configured" behavior is preserved as an opt-in via `--unset-only` (see R-walk-1 / R-walk-2).
  ```

  R-walk-3, one-phrase change: `over in-memory JSON snapshots` → `over each existing config file and its merged write, computed by \`util/setup-init.js --dry-run\` (P9), which writes nothing`.

  ADD after R10:

  ```markdown
  - R27: Step 3.S runs the project scan at most once per run, before the first `setup-dimensions` or `setup-pr-template` section, and reuses it for every delegated section. The flags are decided once from `selectedIds`: `--scan` always, plus `--scan-prs` when `pr-template` is in `selectedIds`. An empty `scan.recentPrs` is never a reason to re-scan (it is normal on non-GitHub hosts).
  ```

  ADD after R14:

  ```markdown
  - R26: Every file the scan reads for signals (detectors and `scan.files`) is read only when it is a regular file whose real path is inside the real path of the scanned root, and only up to a byte cap; a file that fails a check is treated as absent. The CI-file list applies the same root check. `realRoot` is computed once per `scanProject` call.
  ```

  ADD after E4:

  ```markdown
  - E5: Step 3.S scan re-run exits non-zero → show the command's stderr verbatim, skip every delegated section that needs the scan in this run, continue with the other selected sections (Step 0 exit-code rules apply)
  ```

  ADD after P8:

  ```markdown
  - P9: `util/setup-init.js --dry-run` output — `{ errors: [], warnings: [], dryRun: true, diff: { projectConfig, localConfig } }`. Each `diff` entry is `{ path, changed: [{ path, before, after }], unchanged }` from `computeConfigDiff(existing, merged)`, where `merged` is the same shallow top-level merge the write applies (`mergeProjectConfig` / `mergeLocalConfig`); it is `null` when that file's config argument is absent or `{}`. Nothing else is written: no config file, `.gitignore` or backup sweep (the output manifest itself goes through the normal `writeOutput` channel). Exit 1 on invalid JSON arguments, 2 on an unexpected error.
  ```

  P7 entry shape: `{ name, label, type, options, default, description, when?, skip }` → `{ name, label, type, options, default, description, when?, skip, current? }`, plus the sentence `` `current` is present only when `.sdlc/local.json` `ship` holds a value for `name` (R7). ``

  P-sections `fields` bullet: `{ name, label, type, options, default, description, validate? }` → `{ name, label, type, options, default, description, validate?, current? }`, plus the sentence `` `current` is the value at `configPath` + `name` in the config file, present only when set (R7). ``

  Appendix — `### Withdrawn` gains:

  ```markdown
  - R7 wording (withdrawn by #9362): "For each field the user is presented `keep | change | unset` actions" and "`--force` … retains its semantic of skipping the per-field "keep" prompt". Replaced by the current-value default (owner decision 2026-11-12).
  - A3 wording (withdrawn by #9362): "skip the per-field `keep` prompt so every field is explicitly reconfirmed". The keep prompt never existed; `--force` is deprecated.
  ```

  Issue trail table gains: `| A3, R7, R-walk-3, R26, R27, E5, P7, P9, P-sections | (#9362) |`.

- names: `R26`, `R27`, `E5`, `P9` (new); `A3`, `R7`, `R-walk-3`, `P7`, `P-sections` (modified).
- mirror: requirement style at `docs/specs/setup-sdlc.md:82-85`; withdrawn-entry style at `:225-226`; issue-trail row at `:242`.
- decisions: numbering continues from R25, E4, P8; the owner decision is recorded in the appendix.
- sync: site byte copy; SKILL.md comments cite these ids (Task 5).

### Task 5: SKILL.md runtime steps — scan, diff preview, current default, rules

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — Step 3.S, Diff preview, 3.G default, `--force` row, Idempotency, sections key list, `## Interaction rules`, DO NOT bullets
- Modify: `tests/promptfoo/datasets/setup-sdlc.yaml` — one behavioural case for Step 3.S (review-only verification)

**Notes:**
Implements R27, E5, R-walk-3/P9, R7 and A3 from Task 4. It does not depend on Tasks 2 and 3: the flag name and field key are pinned here, and the reviewer checks them against the code. Behavioural runs are owner-initiated only (AGENTS.md), so the new case is verified by review. Cites F-setup-skill-scan-prs-and-rules-1, -2, -6, -7, -8 and F-setup-init-dry-run-diff-9 to -11.

**Acceptance criteria:**
- [ ] Step 3.S decides `--scan`/`--scan-prs` once from `selectedIds`, applies the Step 0 exit-code rules, and never re-scans on an empty `recentPrs`.
- [ ] The Diff preview has no `mktemp`, no Write of `before.json`/`after.json`, no `node -e` and no `rm -rf`; it runs `setup-init.js --output-file --dry-run` with the write's arguments and handles a non-zero exit.
- [ ] 3.G **Default** uses `field.current` when present, otherwise `field.default`.
- [ ] `--force` row and Idempotency sentence say "deprecated: only wins over `--unset-only`", and "A3 gap" is gone.
- [ ] "Use AskUserQuestion for every answer…" is no longer under `## DO NOT`; the write bullet names `util/setup-init.js`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): SKILL.md text replacements.

  Flag table row, before → after:

  ```diff
  -| `--force` | Currently no effect beyond precedence: it wins over `--unset-only` for the default menu reply. Step 3.G has no per-field `keep` prompt for it to skip (spec A3 gap, tracked separately). Does not skip the menu | off |
  +| `--force` | Deprecated: only wins over `--unset-only` for the default menu reply (A3). No other effect; does not skip the menu | off |
  ```

  Step 0 key list, the `sections` bullet: append ``Each `fields[]` entry carries `current` when the config already holds a value (R7).``

  3.G default line:

  ```diff
  -- **Default:** `field.default`
  +- **Default:** `field.current` when the field carries it (the value already in the config), otherwise `field.default`. Accepting the default keeps the current value; an empty answer on an optional field unsets it (omit the key from the section object). <!-- implements R7 -->
  ```

  3.S replacement (whole subsection body):

  ```markdown
  #### 3.S. Scan phase (delegated content sections only)
  <!-- implements R10, R14, R27, E5, P-scan -->
  Run the project scan once per run, just before the first `setup-dimensions` or `setup-pr-template` section in `selectedIds`. Decide the flags once, from `selectedIds` only: always `--scan`, and also `--scan-prs` when `pr-template` is in `selectedIds`. Never decide from `scan.recentPrs` — an empty list is normal on non-GitHub hosts. Run Step 0's command with those flags added, as one plain Bash call, and apply Step 0's exit-code rules. On a non-zero exit code, show the command's stderr verbatim, print `Project scan failed — skipping the sections that need it.`, skip every delegated section that needs the scan in this run, and continue with the other selected sections. On exit 0, read `.scan` from the new output file (`signals`, `files`, `hosting`, `ciFiles`, `git`, `jiraEvidence`, `recentPrs`); do not re-scan with Glob or Bash. Pass that one scan to every delegated section as "Scan Input".
  ```

  Diff preview replacement (steps 1-4 and the `node -e` block are removed):

  ````markdown
  #### Diff preview
  <!-- implements R-walk-3, P9 -->
  Before the write, preview it with the same script in dry-run mode. Pass exactly the `--project-config` and `--local-config` arguments the write step will pass:

  ```bash
  node "<PLUGIN_ROOT>/scripts/util/setup-init.js" --output-file --dry-run --project-config '<PROJECT_CONFIG_JSON>' --local-config '<LOCAL_CONFIG_JSON>'
  ```

  Run this as one plain Bash call. Take the output path the command prints on stdout as `DRYRUN_OUTPUT_FILE`, and the exit code from the tool result. If the exit code is non-zero, show the command's stderr verbatim (and `errors[]` from the JSON when a path was printed), print `Write cancelled — no changes made.` and skip the write step. Otherwise read the JSON at the literal path. The script writes nothing.

  Render `diff.projectConfig.changed` and `diff.localConfig.changed` (skip a `null` entry) as one markdown table:

  ```text
  | file               | path                 | before   | after       |
  |--------------------|----------------------|----------|-------------|
  | .sdlc/config.json  | pr.expectedAccount   | (unset)  | rnagrodzki  |
  | .sdlc/local.json   | ship.bump            | patch    | minor       |
  ```
  ````

  The existing "When the diff's `changed` is empty…" and "Otherwise, ask the user to confirm…" paragraphs stay, with "the diff's `changed`" changed to "both `changed` lists".

  Idempotency sentence:

  ```diff
  -`--force` currently only takes precedence over `--unset-only`.
  +`--force` is deprecated and only takes precedence over `--unset-only` (A3).
  ```

  New section directly before `## DO NOT`, and the DO NOT bullets changed:

  ```diff
  +## Interaction rules
  +
  +- Use AskUserQuestion for every answer except the Step 1 menu reply, which is a plain chat prompt (R-menu-1, C5).
  +
  +---
  +
   ## DO NOT
  ...
  -- Write config files using the Write or Edit tools directly -- always go through `lib/config.js` functions (`writeProjectConfig`, `writeLocalConfig`) via inline Node.js in Bash
  +- Write config files using the Write or Edit tools directly -- every config write goes through `util/setup-init.js` (R6), which calls `writeProjectConfig` and `writeLocalConfig` from `lib/config.js`
  ...
  -- Use AskUserQuestion for every answer *except* the Step 1 menu reply, which is a plain chat prompt.
  ```

  Behavioural case appended to `setup-sdlc.yaml`:

  ```yaml
  - description: "setup-sdlc (#9362): one scan with --scan-prs when pr-template is selected with review-dimensions"
    vars:
      skill_path: "plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md"
      project_context: "file://fixtures/setup-fully-configured.md"
      user_request: >
        Run /setup-sdlc --only review-dimensions,pr-template. Show the exact Bash command you run
        for the project scan and say how many times you run it.
    assert:
      - type: icontains
        value: "--scan-prs"
      - type: llm-rubric
        value: >
          The response runs the setup.js scan exactly once, before the review-dimensions section,
          with both --scan and --scan-prs, and reuses that one scan for the pr-template section.
          It does not run a second scan for pr-template.
  ```

- names: `#### 3.S. Scan phase (delegated content sections only)`, `#### Diff preview`, `## Interaction rules`, `DRYRUN_OUTPUT_FILE`, `--dry-run`, `field.current`.
- mirror: Step 0 prepare-call prose at `SKILL.md:55-63`; the write-step block at `SKILL.md:452-462`; behavioural case shape at `setup-sdlc.yaml:117-137`.
- decisions: one scan per run (Key Decisions); skip scan-dependent sections on failure (Decision 5); new rules section placement (Decision 6).
- sync: flag `--dry-run` and P9 keys must match Task 2; `field.current` must match Task 3; ids match Task 4. The text has no shell variable across calls, no `mktemp` and no Write-after-mktemp (F-49 and #9190 class do not apply).

### Task 6: User doc updates

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/setup-sdlc.md` — `--force` usage paragraph and flag row; Diff Preview paragraph; current-value default sentence
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy via `cp docs/skills/setup-sdlc.md site/src/content-source/skills/setup-sdlc.md`

**Notes:**
User-facing wording only. The two edits pin the deprecated `--force` meaning and the dry-run preview, so the reference doc matches A3, R7 and R-walk-3. Cites F-spec-docs-force-wording-copies-2 and -7.

**Acceptance criteria:**
- [ ] No "A3 gap" or "`keep` prompt" text remains in `docs/skills/setup-sdlc.md`.
- [ ] The Diff Preview paragraph names `util/setup-init.js --dry-run` and says untouched sections are not shown.
- [ ] `cmp docs/skills/setup-sdlc.md site/src/content-source/skills/setup-sdlc.md` exits 0.

**Contract:**
- shape (docs): three paragraph replacements, audience end users:

  ```diff
  -Keeps the default menu reply at `all` and wins over `--unset-only`. It currently has no other effect: the per-field `keep` prompt it is specified to skip does not exist in Step 3.G (spec A3 gap, tracked separately). Every row is pre-checked by default.
  +Deprecated. Its only effect is to win over `--unset-only`, so the default menu reply stays `all`. Every row is pre-checked by default.
  ```

  ```diff
  -| `--force` | Currently no effect beyond winning over `--unset-only` (default menu reply stays `all`); the per-field `keep` prompt it is specified to skip does not exist yet (spec A3 gap). Does not skip the menu. | — |
  +| `--force` | Deprecated: only wins over `--unset-only` (default menu reply stays `all`). Does not skip the menu. | — |
  ```

  `### Diff Preview and Confirmation` first paragraph:

  ```diff
  -Before writing any config files, `/setup-sdlc` renders a diff preview comparing the configuration as it was at startup against the values accumulated during the session:
  +Before writing any config files, `/setup-sdlc` runs `util/setup-init.js --dry-run` with the answers from the session. It applies the same section-level merge as the real write to `.sdlc/config.json` and `.sdlc/local.json`, writes nothing, and shows the changed fields. Sections you did not touch are not shown. Each prompt in the config builder defaults to the value already in your config, so pressing Enter keeps it:
  ```

- names: headings unchanged (`### Diff Preview and Confirmation`, `## Flags`).
- mirror: the existing paragraphs at `docs/skills/setup-sdlc.md:29`, `:45` and `:303`.
- decisions: no new sections (skill-doc template already satisfied).
- sync: site byte copy; wording matches spec A3/R7/R-walk-3 (Task 4).

### Task 7: Final exec verification and plan file

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
**Verify:** tests

**Files:**
- Create: `docs/plans/2026-11-12-lean-m2-setup-runtime-scan.md` — this plan (staged with the change)

**Notes:**
Brief item 6 asks for the `setup-prepare` exec subset "at the end", because other cases assert on the manifest shape. Two targeted exec-only subset runs are allowed by the `no-auto-eval` guardrail. This task edits no code; on a failure it reports and stops, and does not fix-and-rerun.

**Acceptance criteria:**
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "setup-prepare"` passes.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "setup-init"` passes.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js` and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.

**Contract:**
- shape (docs): no content change; the plan file already exists and is only added to the change set.
- names: plan path `docs/plans/2026-11-12-lean-m2-setup-runtime-scan.md`.
- mirror: final-task convention of earlier lean plans (plan file listed as Create under the last task).
- decisions: one run per subset, no tight-loop retries (`no-auto-eval`).
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1, 2, 3 add promptfoo exec cases and Task 5 adds a behavioural case; existing --force cases are checked and stay valid |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; behavioural runs are left to the owner |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Six tasks map to the six stated items, with non-goals listed |
| single-responsibility-tasks | warning | PASS | Fixed in Step 4: the plan file moved from Task 6 to Task 7, so each task has one deliverable |
| scripts-over-llm-logic | error | PASS | File access, merge, diff and current-value logic all move into scripts; SKILL.md only calls and renders them |
| yagni | warning | PASS | Nothing speculative; the detector realRoot parameter is optional only because guardrails.js needs it |
| cross-skill-consistency | error | PASS | The shared detectors used by skill/guardrails.js stay compatible through an optional parameter |
| pr-link-github-issue | error | PASS | #9362 is justified as an internal tracking id, not a GitHub issue |
| dry | warning | PASS | The merge helpers are shared by the writers and --dry-run |
| kiss | warning | PASS | One guarded reader and one dry-run mode in the existing script |
| spec-first | error | PASS | Task 4 (spec) is numbered before Task 5 (SKILL.md); making the dependency explicit is suggested |
| project-agnostic | error | PASS | All changes are in plugin code, spec and docs |
| flag-coherence-cross-skill | error | PASS | Step 3.S flags come from selectedIds in prepare output, not raw arguments |
| no-opposite-logical-vectors | error | PASS | The scan gate is stated once, in Step 3.S |
| flag-resolution-single-source | warning | PASS | --scan-prs is decided at one site and the scan is reused |
| state-premise | error | PASS | The root problem is stated in one sentence in Key Decisions |
| smallest-viable-cut | warning | PASS | Each task is tied to one confirmed defect or the owner decision |
| failure-audience | warning | PASS | Consumer projects and skill/guardrails.js are named |
| explicit-non-goals | warning | PASS | A non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | The viable alternatives are recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | The dry-run helper runs twice and asserts no state change |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is introduced |
| flag-semantic-consistency-cross-skill | error | PASS | --dry-run is added to an internal util script, and its meaning is consistent with other scripts |
| workspace-mode-compatibility | error | PASS | Behaviour under branch and worktree modes is stated; the plan keeps resolveSdlcRoot and the setup-init cwd exemption |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 5 rewrites the SKILL.md `--force` flag row and changes the Diff preview to `setup-init.js --dry-run`, which Task 6 must mirror in `docs/skills/setup-sdlc.md`.

**Severity hint:** high

**Patch:** Add checklist item: `--force` deprecation wording and the dry-run diff preview description stay identical across SKILL.md, the docs/skills reference and the site mirrors.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Add checklist item: `--force` deprecation wording and the dry-run diff preview description stay identical across SKILL.md, the docs/skills reference and the site mirrors.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 2 adds a `--dry-run` flag with a new `diff.projectConfig` output contract to `util/setup-init.js`, and Task 3 adds a `current` key to the `setup.js` manifest fields.

**Severity hint:** high

**Patch:** Add checklist items: new `setup-init.js --dry-run` flag and P9 output keys match the spec, and the `field.current` manifest key is optional and omitted when unset.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add checklist items: new `setup-init.js --dry-run` flag and P9 output keys match the spec, and the `field.current` manifest key is optional and omitted when unset.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1, 2, 4, 5 and 6 add or modify YAML files such as `tests/promptfoo/datasets/setup-prepare-exec.yaml` and `tests/promptfoo/datasets/setup-init-exec.yaml`, which no current code-quality trigger covers.

**Severity hint:** medium

**Patch:** add trigger `**/*.yaml`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.yaml`

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 3 | 1 |
| Coherence | 0 | 0 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 M-13: project-scan.js guarded reader, realRoot computed once, CI files guarded, runtime symlink helper registered in setup-prepare-exec.yaml, no committed symlink fixtures | Task 1, Task 4 | covered |
| 2 X+M-10+M-11: setup-init.js --dry-run, SKILL.md Diff preview, new P-id, R-walk-3 amended, docs diff preview, exec cases | Task 2, Task 4, Task 5, Task 6 | covered |
| 3 M-9: Step 3.S decides --scan-prs once from selectedIds, one scan reused | Task 4, Task 5 | covered |
| 4 M-12: Step 3.S scan failure uses Step 0 exit-code rules, show stderr, skip delegated section | Task 4, Task 5 | covered |
| 5 M-14: AskUserQuestion rule moved out of DO NOT, stale inline-Node write bullet fixed | Task 5 | covered |
| 6 R7/A3: setup.js emits field.current, 3.G default, spec amended with appendix, setup.js comments, docs --force rows, exec case, setup-prepare subset run at end | Task 3, Task 4, Task 5, Task 6, Task 7 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all seven tasks are done:

- **The scan is safe.** `lib/project-scan.js` reads every signal file through one guarded reader. Symlinks that leave the repository, device files and huge files are treated as absent. A runtime exec test proves this without committed symlinks.

- **The preview is honest.** `util/setup-init.js --dry-run` shows the per-file diff of the exact merge the write will apply, for both config files, and writes nothing. SKILL.md calls it with normal exit handling. The temp directory and the inline `node -e` are gone.

- **The scan runs once with the right flags.** Step 3.S decides `--scan-prs` from the selection, so the PR template sub-flow gets recent PRs. A failed scan skips only the sections that need it.

- **Prompts start from what you have.** `setup.js` emits `field.current`, and Step 3.G uses it as the prompt default.

- **Spec and docs match the code.** A3 says `--force` is deprecated. R7 describes the current-value default, and R26, R27, E5 and P9 are new. The user doc and both site mirrors match.

- **Rules read the right way.** SKILL.md states the AskUserQuestion rule as a positive rule, and the write bullet names the real write path.


## OpenSpec Appendix

Not applicable — no OpenSpec change
