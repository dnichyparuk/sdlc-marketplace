# jira-sdlc script safety, docs drift and test hygiene (M3) Implementation Plan

**Commit:** `fix(#9363): jira-sdlc - path guard, report quoting, dedup search`
**Goal:**
- Stop `jira.js` from reading, writing or deleting files outside the Jira cache when `--project` or `--site` holds a path (M-39).
- Make the error-report arguments that `mcp-failure.js --analyze` prints safe in POSIX single quotes, keep `--class` inside the R26 set, and insert template values literally (M-25).
- Make the R28 duplicate search able to find the issues jira-sdlc really files, and post the duplicate comment to the right repository (M-36).
- Make the `--check-payload` heading check see the headings of an ADF description (M-31).
- Fix the stale placeholder, docs and examples text in jira-sdlc (M-27, M-26, M-29), and remove orphan test fixtures and a stale comment (hygiene).

**Architecture:** The root problem is that two jira-sdlc helper scripts trust raw CLI text: `jira.js` joins it into file paths, and `mcp-failure.js` puts it into a shell string, a regex and a template replace, and searches for labels that no issue carries. Both are fixed in the scripts themselves (argument validation in `parseArgs`, one-pass template fill, single-quote builder, title-or-body duplicate match), so SKILL.md only relays the script output. The spec is amended first (A5, R28, P7, P8 and a new P9), then the scripts with exec cases, then SKILL.md, EXAMPLES.md, the behavioural rubrics and the user doc.
**Source:** conversation context (wave M3 scope, tracking id #9363; architect-validated scope of 2026-11-12, re-verified at HEAD f56c2f1)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- `jira.js` builds cache file paths from the raw `--project` and `--site` values. A value such as `../../../escaped` makes `--save` write, and `--clear` delete, a file outside `~/.sdlc-cache/jira/`. This is a path traversal — a file path that climbs out of its intended directory with `..`.
- `mcp-failure.js --analyze` prints `errorReportArgs`, a string of flags that the skill hands to error-report-sdlc. It escapes only `"` inside double quotes, but error-report-sdlc pastes values into POSIX single quotes. A `$(...)` or a backtick in a step label could run in the shell.
- The same script uses the raw `--class` value inside a regex and in labels, and fills the issue template with `String.replace`, which expands `$&` and `` $` `` in untrusted text.
- The R28 duplicate search looks for the labels `mcp-failure` and `class:<x>`. error-report-sdlc never applies them (it applies only `tooling-error` and the skill name), and the search has no repository flag. So a duplicate is never found, and the comment command could target the wrong repository.
- `--check-payload` silently passes an ADF description (Atlassian Document Format — Jira's JSON rich-text tree), because the heading reader only reads markdown strings.
- Smaller drift: an undefined placeholder name in SKILL.md, a user doc that still describes hook denies that no longer exist, cache-init examples that tell the model to extract into the cache instead of keeping raw phase results, five empty fixture folders and one stale comment.

**What prompted this change now?**

- The wave M3 scope from the architect review on 2026-11-12. M-39 was reproduced (a write outside the cache).

**What does success look like?**

- `--project ../X` and `--site ../x` each give `errors[]` and exit 1, and nothing is written.
- `errorReportArgs` uses single quotes; an unknown `--class` becomes `unknown`; `$&` in an error stays literal.
- With a stub `gh` that answers only the correct repository and labels, the duplicate search finds the open issue.
- An ADF description with an invented `##` heading fails `--check-payload`.
- The targeted exec runs and the five main-session validators pass.

## Research Findings

Every item was re-checked at HEAD f56c2f1. All eight still reproduce. Discovery brief: `/tmp/sdlc-explore-main-YBXIkp/discovery-brief.md` (finding ids `F-<dimension>-<n>`).

**M-39 — path traversal in `jira.js`** (F-jira-cli-input-validation-and-adf-headings-1, -2, -3, -9, -10)

- `parseArgs` takes `--project` as `toUpperCase()` and `--site` raw. The only check is "`--project` is required".
- Raw joins: `resolveCandidatePaths` joins `explicitSite` and `projectKey` (feeds `--check`, `--load`, `--save-field`, `--clear`); `writeCacheFile` joins `site || sanitizeSiteHost(siteUrl)` and `projectKey` (`--save`, `--assemble --save`); the legacy migration joins `projectKey`; `clearCache` unlinks the joined path.
- `sanitizeSiteHost` lower-cases and turns `.` into `_`, but turns `..` into `__` without rejecting it.
- `main()` already writes `errors[]` with exit 1 before any subcommand runs (spec E1), so validation in `parseArgs` stops every vector at once.
- Existing exec cases pass `--site acme_atlassian_net` and project keys of two or more letters, so the new rules do not break them.

**M-25 — `errorReportArgs` quoting, class and template fill** (F-mcp-failure-report-args-and-duplicate-search-1, -2, -3, -7, -8)

- `errorReportArgs` is built from `--step "${esc(step)}" --operation "${esc(operation)}"`, where `esc` only escapes `"`. error-report-sdlc substitutes every value as a single-quoted literal.
- `CLASSES` is defined but never used to validate `--class`; the class goes into a `new RegExp`, the labels, the title and the args.
- The template is filled by eight chained `.replace(/\{X\}/g, value)` calls; `$&` in a value is expanded, and a value holding `{SITE}` is replaced again by a later call.
- The exec case "analyze --record emits proposalTitle, …" asserts `--step "Step3"` and labels `["mcp-failure","class:auth"]`; both change.

**M-36 — duplicate search and comment repository** (F-mcp-failure-report-args-and-duplicate-search-4, -5, -6, -10, -12)

- The search runs `gh issue list --state open --label mcp-failure --search <tool> --json number,title,labels` with no `-R`, then needs a `class:<cls>` label.
- error-report-sdlc applies only `tooling-error` and `<skill>` (`error-report-prepare.js` `labels: ['tooling-error', skill]`), and its issue title is drafted by the error-report orchestrator as `[<skill>] <summary>`. The `mcp-failure[<cls>]: <tool> on <site>` line is the first line of `errorText`, which the orchestrator keeps verbatim in the issue body.
- SKILL.md runs `gh issue comment '<DUPLICATE>' --body-file '<ERROR_FILE>'` without `--repo`.
- `harden-prepare.js` does not require `mcp-failure.js`; it only checks for an `mcp-failure` label on a fetched issue. Harden behaviour is unchanged by this plan.

**M-31 — ADF headings** (F-jira-cli-input-validation-and-adf-headings-4, -5, -6, -7)

- `extractHeadings` returns an empty set for anything that is not a string. `checkPayload` passes the description straight in, so an ADF description has no headings and never fails.
- ADF heading shape (from `markdown-to-adf.js`): `{ type: 'heading', attrs: { level: N }, content: [{ type: 'text', text }] }` under `{ version: 1, type: 'doc', content: [...] }`. `placeholder-detect.js` already parses stringified ADF.

**M-27, M-26, M-29 and hygiene** (F-jira-docs-spec-drift-and-site-copies-1, -2, -3, -5; F-jira-test-harness-and-orphan-fixtures-1, -2, -6)

- SKILL.md's retry telemetry line uses `<FAILURE_CLASS>`; the gate uses `<CLASS>`.
- `docs/skills/jira-sdlc.md` class table still cites hook denies for `schema` and `hook-block`; spec R26 says no jira-sdlc path emits `hook-block` since R21.
- EXAMPLES.md Phases 1–5 say `→ Extract … → cache.*`; SKILL.md Step 1 keeps raw results (`phase1.resources`, …) for the Phase 6 `--assemble` raw file.
- `tests/promptfoo/fixtures-fs/jira-hook-*` are five folders, each holding only `.gitkeep`, referenced by no dataset. `tests/promptfoo/providers/hook-runner.js` names "jira-sdlc-debug dumps per R21.2" in its header comment.
- `docs/specs/jira-sdlc.md` and `docs/skills/jira-sdlc.md` have byte copies under `site/src/content-source/` (identical today).

**Test harness** (F-mcp-failure-report-args-and-duplicate-search-9; F-jira-test-harness-and-orphan-fixtures-3, -4, -5)

- `tests/promptfoo/providers/script-runner.js` splits `script_args` on whitespace (no shell, no quote handling), and prepends `script_stub_bin` to `PATH`. `pr-prepare-exec.yaml` and `ship-prepare-exec.yaml` pass it as `{{repo_root}}/tests/promptfoo/fixtures-fs/stub-bin-gh/bin`.
- The runner does not expose the exit code; on a handled error `jira.js` prints the output-file path and the runner reads the JSON, so cases assert on `errors[]` and the absence of `saved`.
- The three existing `--analyze` cases reach a live `gh` today; this plan points them at a stub.
- Datasets are listed explicitly in `promptfooconfig-exec.yaml`; this plan adds no dataset file.

Commands: exec runs as in the header **Verification:** line. Main-session validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --root . --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.

## Deviations & assumptions

| Item | asked | does | why |
|------|-------|------|-----|
| `--site` rule | no | Rejects a raw value that is empty or holds `/`, `\` or `..`, then normalises it with `sanitizeSiteHost` | The brief offered a bare regex or sanitize-then-reject. `sanitizeSiteHost` turns `..` into `__`, so the check must run on the raw value; normalising also makes a dotted host reach the same folder `--save` uses (KD1) |
| Duplicate match | no | Matches `mcp-failure[<cls>]: <tool>` in the issue title or body | The brief said "in the title". The error-report orchestrator writes the title as `[<skill>] <summary>`; the marker line is only certain to be in the body (KD3) |
| `labels` field of P8 | no | Becomes `["tooling-error","jira-sdlc"]` | The field must name the labels the issue really gets; the key stays, so P8's key list is unchanged (KD4) |
| Structured fields beside `errorReportArgs` | no | Not added | Optional in the brief; no consumer reads them (YAGNI) |
| `--recovered 'yes:R9'` on the retry telemetry line | no | Not changed | Optional in the brief; the retry paths have no R-path id for 409 or transition retries, so a fix needs a spec decision first |
| EXAMPLES.md Objective bullets (M-28) | no | Not converted | Dropped by the architect as already compliant |
| M-37 | no | Dropped | Architect: exec fixtures are copied to a temp dir; the tracked fixture is never written |
| Hygiene item 8 | no | Done (two Trivial tasks) | Cheap, no shared files, removes dead test surface |

### Decisions taken without the owner

- KD1 `--site` validation shape (raw check, then normalise).
- KD3 duplicate match on title or body instead of title only.
- KD4 `labels` value change instead of dropping the key.
- The single-letter Jira project key is rejected by `^[A-Z][A-Z0-9_]{1,254}$` (Jira Cloud keys have at least two characters; no test or doc uses a one-letter key with `jira.js`).
- The optional items above (structured fields, `--recovered`, M-28) are left out.
- KD7 task grouping by shared file; KD8 PR names #9363 without a closing keyword.
- Step 6.5 link gate: the first draft quoted the test-fixture site URL from the existing `stdin-fd0` case, which the link validator reported as HTTP 404 (it is fake test data). The plan now points the worker at that case's stdin instead of quoting the URL; the dataset itself is unchanged.

## Key Decisions

**KD1 — Validate `--site` on the raw value, then normalise.**

- Choice: reject an empty value or one that holds `/`, `\` or `..`; otherwise replace it with `sanitizeSiteHost(value)`.
- Alternative: the bare regex `^[a-z0-9_-]+$`.
- Why: the regex would reject a dotted host such as `acme.atlassian.net`, which users may type. Normalising sends it to `acme_atlassian_net`, the folder `--save` writes. The raw check is needed because `sanitizeSiteHost('../x')` returns `__` instead of failing.

**KD2 — Validate in `parseArgs`, not at each path join.**

- Choice: one check after the argument loop pushes to `errors[]`.
- Alternative: guard each `path.join` site.
- Why: `main()` already stops with exit 1 on `errors[]` before any subcommand runs, so one check covers `--save`, `--clear`, `--load`, `--save-field`, `--assemble --save` and the legacy migration.

**KD3 — Match the duplicate on title or body text.**

- Choice: search `-R rnagrodzki/sdlc-marketplace --label tooling-error --label jira-sdlc --search <tool>` and match the text `mcp-failure[<cls>]: <tool>` in `title + "\n" + body`.
- Alternative: add `mcp-failure` and `class:` labels to error-report-sdlc.
- Why: error-report-sdlc is a shared skill and the brief rules out a labels input. The marker line is part of `errorText`, which error-report keeps verbatim in the body. A plain `includes` also removes the class from any regex.

**KD4 — Keep the `labels` key, change its value.**

- Choice: `labels: ["tooling-error", "jira-sdlc"]`.
- Alternative: remove the key.
- Why: P8 pins the key order; changing the value keeps the shape and makes it true.

**KD5 — One-pass template fill.**

- Choice: one `replace(/\{(CLASS|TOOL|SITE|PROJECT|ERROR|R_PATH|PRIOR_COUNT|DUPLICATE_HINT)\}/g, (_, k) => values[k])`.
- Alternative: keep eight calls, each with a function replacer.
- Why: one pass makes `$&` literal and also stops a value holding `{SITE}` from being replaced by a later call.

**KD6 — ADF support inside `extractHeadings`.**

- Choice: `extractHeadings` accepts a markdown string, an ADF object, or a JSON string of an ADF doc.
- Alternative: a separate walker in `jira.js`.
- Why: the heading reader stays in one module, and template reading (markdown) is unchanged.

**KD7 — Group by file, not by finding.**

- Choice: Task 4 holds both M-25 and M-36 because both change `mcp-failure.js --analyze` and the same exec cases; Task 5 holds all skill-text edits (SKILL.md, EXAMPLES.md, the rubrics that quote SKILL.md).
- Alternative: one task per finding.
- Why: two tasks on one file would need a dependency chain and an extra execute wave (ledger F-43: one task per shared file per wave). Each task still has one deliverable: the `--analyze` contract, or the skill text that follows it.

**KD8 — PR link for #9363.**

- Choice: the PR body names `#9363` as a tracking id, with no `Fixes` or `Closes` keyword.
- Alternative: `Fixes #9363`, as the `pr-link-github-issue` guardrail asks for GitHub issues.
- Why: #9363 is an internal register id, not a GitHub issue (project note). A `Fixes` keyword would close an unrelated GitHub issue with that number.

**Smallest viable cut:** Tasks 1, 2 and 4 (spec, M-39, M-25/M-36 scripts) are the security core. Task 3 (M-31) closes a silent gate bypass. Tasks 5 and 6 keep SKILL.md, the rubrics and the user doc true to the changed scripts. Tasks 7 and 8 are cheap hygiene the brief asked for.

**Who fails if this ships wrong:** a jira-sdlc user (a cache file written or deleted outside the cache, a shell command run from a step label), and the plugin maintainers (duplicate MCP-failure issues, or a comment on the wrong repository).

**Non-goals:**

- No change to error-report-sdlc, harden-sdlc or `harden-prepare.js`. The harden `mcp-failure` label hint stays as it is (it already never fires for jira-filed issues).
- No validation of `--type` for `--copy-template` or `--cache-dir` (not in the wave scope).
- No change to the draft github-sdlc spec or its future `--source github` mode.
- No setup-sdlc change (wave M2), no behavioural, headless or live Jira/GitHub run.

**Workspace modes:** every change is to tracked repository files and to scripts that resolve paths from `HOME`, their own location or `resolveSdlcRoot()`. Nothing depends on `ship.workspace`; the plan behaves the same under `branch` and `worktree`.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): `normalizeClass(value: unknown): string` returns `value` when it is in `CLASSES`, else `'unknown'`; `sq(value: unknown): string` returns `'` + text with each `'` as `'\''` + `'`.
- names: `normalizeClass`, `sq`, `REPORT_REPO`.
- mirror: `plugins/sdlc-utilities/scripts/lib/git.js:1332` single-quote escape.
- decisions: KD3, KD4, KD5.
- sync: `jira-sdlc-exec.yaml` analyze cases assert the new strings.
```

### Worked example — docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/jira-sdlc.md` class table rows `schema` and `hook-block`; audience end users.
- names: rows `schema`, `hook-block`.
- mirror: spec R26 wording at `docs/specs/jira-sdlc.md:76`.
- decisions: no new section.
- sync: `site/src/content-source/skills/jira-sdlc.md` byte copy.
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): ADD `P9` after `P8` in `## Prepare script contract`; MODIFY `P8` with a quoting note.
- names: `P9` (new), `P8`, `P7`, `R28`, `A5` (modified).
- mirror: P7/P8 bullet style at `docs/specs/jira-sdlc.md:129-130`.
- decisions: next free P id is P9.
- sync: `site/src/content-source/specs/jira-sdlc.md` byte copy.
```

## Tasks

### Task 1: Spec amendments (A5, R28, P7, P8, new P9)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/jira-sdlc.md` — amend A5, R28, P7, P8; add P9
- Modify: `site/src/content-source/specs/jira-sdlc.md` — byte copy via `cp docs/specs/jira-sdlc.md site/src/content-source/specs/jira-sdlc.md`

**Notes:**
Spec first (AGENTS.md principle 1): Tasks 2–6 cite these ids. Ids are never renumbered; P9 is the next free P id (P1–P8 exist). Findings: F-jira-cli-input-validation-and-adf-headings-8, F-mcp-failure-report-args-and-duplicate-search-12, F-jira-docs-spec-drift-and-site-copies-4, -5.

**Acceptance criteria:**
- [ ] A5, R28, P7 and P8 read exactly as in the Contract; P9 exists directly after P8.
- [ ] No other requirement text changes; no id is renumbered.
- [ ] `cmp docs/specs/jira-sdlc.md site/src/content-source/specs/jira-sdlc.md` exits 0.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY A5, R28 (a)(d)(e), P7, P8; ADD P9. Delta text:

```diff
- A5: `--site <host>` — disambiguator … Value is the sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`).
+ A5: `--site <host>` — disambiguator … Value is the sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`). A dotted host is accepted and normalised to that form; a value holding `/`, `\` or `..` is rejected (P9).
```

```diff
- (a) … search `gh issue list --state open --label mcp-failure --search "<toolName>" --json number,title,labels`, …
+ (a) … search `gh issue list -R rnagrodzki/sdlc-marketplace --state open --label tooling-error --label jira-sdlc --search "<toolName>" --json number,title,body`, …
- (d) on approval, dispatch the existing `error-report-sdlc` flow with payload `--error-type mcp-<class>` and labels `mcp-failure`, `class:<x>`;
+ (d) on approval, dispatch the existing `error-report-sdlc` flow with payload `--error-type mcp-<class>`; the issue carries the labels error-report-sdlc applies (`tooling-error`, `jira-sdlc`) and no jira-specific labels;
- (e) on duplicate found in step (a) (open issue with matching `class:<x>` label and `<toolName>` in title), default to comment-on-existing rather than create-new (still gated by user approval).
+ (e) on duplicate found in step (a) (open issue whose title or body holds `mcp-failure[<class>]: <toolName>`), default to comment-on-existing rather than create-new (still gated by user approval); the comment is posted with `gh issue comment <n> --repo rnagrodzki/sdlc-marketplace`.
```

```diff
- P7: … using the C13 detector and the R18 template headings (fallback map applied). Read-only. …
+ P7: … using the C13 detector and the R18 template headings (fallback map applied). An ADF `description` (an object, or a JSON string of an ADF doc) is read through its `heading` nodes with `attrs.level` 2. Read-only. …
```

```diff
- P8: … followed by `proposalTitle`, `proposalText`, `errorReportArgs`, `labels`, `errorText`. Exit 0 success, 2 argument or IO error.
+ P8: … followed by `proposalTitle`, `proposalText`, `errorReportArgs`, `labels`, `errorText`. `errorReportArgs` writes `--step` and `--operation` as POSIX single-quoted literals (`'` → `'\''`); a `--class` outside the R26 set is recorded as `unknown`; `labels` is `["tooling-error","jira-sdlc"]`; template values are inserted literally (`$&` is not expanded). Exit 0 success, 2 argument or IO error.
+ P9: `skill/jira.js` validates `--project` and `--site` in argument parsing, before any cache read, write or delete. `--project` (upper-cased) must match `^[A-Z][A-Z0-9_]{1,254}$`. `--site` must be non-empty and hold no `/`, `\` or `..`; a valid value is normalised with the sanitized-host rule of A5. A rejected value gives `errors[]` and exit 1 (E1).
```

- names: `A5`, `R28`, `P7`, `P8` (modified); `P9` (new).
- mirror: bullet style of P7/P8 at `docs/specs/jira-sdlc.md:129-130`.
- decisions: KD1, KD3, KD4, KD6; P9 numbering continues from P8.
- sync: site byte copy; Tasks 2–6 cite these ids.

---

### Task 2: `jira.js` — reject path-like `--project` and `--site` (M-39)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/jira.js` — validation after the `parseArgs` loop
- Test: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — three new cases after "jira-prepare: --site disambiguates multi-candidate to a single cache"

**Notes:**
One check in `parseArgs` (KD2) covers every path join, because `main()` writes `errors[]` with exit 1 before any subcommand. The raw-value check comes before normalising (KD1). `site` is already a `let` in `parseArgs` and `sanitizeSiteHost` is defined above it in the same file. Findings: F-jira-cli-input-validation-and-adf-headings-1, -2, -3, -9, -10.

**Acceptance criteria:**
- [ ] `--project ../../../../KEYESC --save` gives `errors[]` naming `--project` and no `saved` key.
- [ ] `--project PROJ --site ../escaped --save` gives `errors[]` naming `--site` and no `saved` key.
- [ ] `--project MULTI --site acme.atlassian.net --check` on `jira-cache-home-multi-site` finds the `acme_atlassian_net` cache (`"exists": true`).
- [ ] Every existing `jira-prepare` and `stdin-fd0` case still passes.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "jira-prepare|stdin-fd0|jira.js --validate-body"`

**Contract:**
- shape (code): in `parseArgs`, replace the end check with:

```diff
   if (!projectKey && subcommand !== 'validate-body' && subcommand !== 'check-payload') {
     errors.push('--project <KEY> is required');
   }
+  // P9: reject path-like values before any cache path is built.
+  if (projectKey && !PROJECT_KEY_RE.test(projectKey)) {
+    errors.push(`--project '${projectKey}' is not a valid Jira project key (${PROJECT_KEY_RE.source})`);
+  }
+  if (site !== null) {
+    if (site === '' || /[\/\\]|\.\./.test(site)) {
+      errors.push(`--site '${site}' must be a sanitized site host without '/', '\\' or '..'`);
+    } else {
+      site = sanitizeSiteHost(site);
+    }
+  }
```

  plus a module constant `const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]{1,254}$/;` next to `getHomeCacheRoot`. The returned `site` and `flags.site` carry the normalised value.
- names: `PROJECT_KEY_RE`; error strings start with `--project '` and `--site '`.
- mirror: the `--project <KEY> is required` push in the same function.
- decisions: KD1, KD2; spec P9 and A5.
- sync: the exec cases below; SKILL.md `--site` row (Task 5); user doc `--site` row (Task 6).
- example: three new exec cases (rendered):

```yaml
- description: "jira-prepare: --site with a path is rejected and nothing is saved (P9)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/jira.js"
    script_cwd: "{{project_root}}"
    script_home: "{{project_root}}"
    project_root: "file://fixtures-fs/jira-save-roundtrip"
    script_args: "--project PROJ --site ../escaped --save"
    script_stdin: <copy the script_stdin of the "stdin-fd0: jira --save reads the cache JSON from stdin" case, with project key PROJ>  # placeholder: the literal holds a URL the plan link gate rejects
  assert:
    - type: javascript
      value: |
        const d = JSON.parse(output);
        return Array.isArray(d.errors) && d.errors.some(e => e.startsWith("--site '")) && !('saved' in d);
# "jira-prepare: --project with a path is rejected and nothing is saved (P9)": same, script_args
#   "--project ../../../../KEYESC --save", assert errors start with "--project '" and no `saved`.
# "jira-prepare: dotted --site is normalised to the sanitized host (P9)": fixture
#   jira-cache-home-multi-site, script_args "--project MULTI --site acme.atlassian.net --check",
#   icontains '"exists": true' and 'acme_atlassian_net'.
```

---

### Task 3: ADF headings for `--check-payload` (M-31)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/lib/template-fingerprint.js` — `extractHeadings` reads ADF
- Test: `tests/promptfoo/datasets/jira-assemble-exec.yaml` — three new `--check-payload` cases and the header comment list

**Notes:**
`checkPayload` in `jira.js` needs no change: it already passes the description to `extractHeadings` (KD6). Template files are markdown, so `loadTemplateHeadings` keeps the string path. Findings: F-jira-cli-input-validation-and-adf-headings-4, -5, -6, -7.

**Acceptance criteria:**
- [ ] An ADF object description with an `##`-level heading `Invented Section` gives `unknownHeadings` holding `Invented Section`.
- [ ] The same ADF passed as a JSON string gives the same result.
- [ ] An ADF description whose level-2 headings are `Objective`, `Details`, `Acceptance Criteria` gives `unknownHeadings: []` for `--type Task`.
- [ ] Markdown inputs behave as before (existing `jira-assemble` and "guardrail helper" cases pass).
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "jira-assemble|guardrail helper"`

**Contract:**
- shape (code):

```diff
-function extractHeadings(markdown) {
-  const headings = new Set();
-  if (typeof markdown !== 'string' || markdown.length === 0) return headings;
-  const lines = markdown.split(/\r?\n/);
+function extractHeadings(input) {
+  const headings = new Set();
+  let doc = input;
+  if (typeof input === 'string' && input.trim().startsWith('{')) {
+    try { doc = JSON.parse(input); } catch (_) { doc = input; }
+  }
+  if (doc && typeof doc === 'object') { collectAdfHeadings(doc, headings); return headings; }
+  if (typeof input !== 'string' || input.length === 0) return headings;
+  const lines = input.split(/\r?\n/);
   …
 }
+// Walk an ADF tree; add the trimmed text of every heading node with attrs.level === 2.
+function collectAdfHeadings(node, out) { … recurse over arrays and node.content … }
```

  Text of a heading = the `text` of its descendant `text` nodes joined with `''`, trimmed; empty text is skipped. Exports unchanged (`collectAdfHeadings` stays private).
- names: `extractHeadings` (widened), `collectAdfHeadings` (new, private).
- mirror: stringified-ADF parse in `plugins/sdlc-utilities/skills/jira-sdlc/lib/placeholder-detect.js` (`findPlaceholdersInAdf`); ADF heading shape in `plugins/sdlc-utilities/scripts/lib/markdown-to-adf.js:182-191`.
- decisions: KD6; spec P7.
- sync: `tests/promptfoo/scripts/jira-write-guard-test.js` imports `extractHeadings` (markdown path unchanged).
- example: new case (rendered; the other two differ only in stdin):

```yaml
- description: "jira-assemble: --check-payload flags an invented heading in an ADF description (P7)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/skill/jira.js"
    script_cwd: "{{project_root}}"
    script_home: "{{project_root}}"
    project_root: "file://fixtures-fs/jira-assemble-raw"
    script_args: "--project PROJ --check-payload --type Task"
    script_stdin: '{"description":{"version":1,"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Objective"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Invented Section"}]}]}}'
  assert:
    - type: javascript
      value: |
        const d = JSON.parse(output);
        return d.unknownHeadings.includes('Invented Section') && !d.unknownHeadings.includes('Objective');
```

---

### Task 4: `mcp-failure.js` — safe report args, class check, literal fill, real duplicate search (M-25, M-36)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/mcp-failure.js` — `normalizeClass`, `sq`, one-pass fill, duplicate search argv and match, `labels` value, `@remarks` text
- Create: `tests/promptfoo/fixtures-fs/mcp-failure-gh-stub/bin/gh` — executable bash stub for `gh issue list`
- Test: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — update the three `--analyze` cases, add four

**Notes:**
Depends on Task 2 only because both edit `jira-sdlc-exec.yaml`. The stub answers only the correct repository and labels, so a passing duplicate case also proves the argv; no case reaches a live `gh`. The Write tool creates the stub without the execute bit: run `chmod +x tests/promptfoo/fixtures-fs/mcp-failure-gh-stub/bin/gh` once (git records mode 100755, like `stub-bin-gh/bin/gh`). The runner splits `script_args` on whitespace with no shell, so case values must hold no spaces. One deliverable: the `--analyze` output contract of P8/R28 (KD7). Findings: F-mcp-failure-report-args-and-duplicate-search-1 to -10.

**Acceptance criteria:**
- [ ] `errorReportArgs` for `--step Step3` holds `--step 'Step3'`; for a step `S"$(x)` + backtick + `b'q` it holds `--step 'S"$(x)` + backtick + `b'\''q'`.
- [ ] `--class x(` gives `--error-type mcp-unknown` and a title starting `mcp-failure[unknown]`, exit 0.
- [ ] `--error e$&e` gives an `errorText` that holds `e$&e`.
- [ ] With the stub, `--class auth --tool mcp__atlassian__createJiraIssue` gives `duplicate: 4242`, `action: "comment"`; `--class schema` gives `duplicate: null`, `action: "create"`.
- [ ] `labels` is `["tooling-error","jira-sdlc"]`.
- [ ] Targeted runs pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "mcp-failure"` and `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "harden-prepare"`

**Contract:**
- shape (code):

```js
const REPORT_REPO = 'rnagrodzki/sdlc-marketplace';          // same repo error-report-sdlc files to
function normalizeClass(value) { const c = String(value || 'unknown'); return CLASSES.includes(c) ? c : 'unknown'; }
function sq(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }
```

```diff
 // appendTelemetry and analyzeForDispatch, first line:
-  const cls     = String(failure.class || 'unknown');
+  const cls     = normalizeClass(failure.class);
 // duplicate search argv:
-      ['issue', 'list',
-       '--state', 'open',
-       '--label', 'mcp-failure',
-       '--search', tool,
-       '--json', 'number,title,labels'],
+      ['issue', 'list', '-R', REPORT_REPO,
+       '--state', 'open',
+       '--label', 'tooling-error', '--label', 'jira-sdlc',
+       '--search', tool,
+       '--json', 'number,title,body'],
 // match:
-        const labels = (issue.labels || []).map(l => l.name || l);
-        if (labels.some(l => l === `class:${cls}`)) {
+        const marker = `mcp-failure[${cls}]: ${tool}`;
+        if (`${issue.title || ''}\n${issue.body || ''}`.includes(marker)) {
 // template fill (KD5):
-  const body = templateContent
-    .replace(/\{CLASS\}/g,          cls)
-    … six more .replace calls …
-    .replace(/\{DUPLICATE_HINT\}/g, duplicateHint);
+  const values = { CLASS: cls, TOOL: tool, SITE: site, PROJECT: project, ERROR: error,
+    R_PATH: rPath || 'unknown', PRIOR_COUNT: String(priorCount), DUPLICATE_HINT: duplicateHint };
+  const body = templateContent.replace(
+    /\{(CLASS|TOOL|SITE|PROJECT|ERROR|R_PATH|PRIOR_COUNT|DUPLICATE_HINT)\}/g, (_, k) => values[k]);
 // CLI --analyze:
-    const cls       = getArg('class')     || 'unknown';
+    const cls       = normalizeClass(getArg('class'));
-      const esc = (s) => String(s).replace(/"/g, '\\"');
-        errorReportArgs: `--error-type mcp-${cls} --skill jira-sdlc --step "${esc(step)}" --operation "${esc(operation)}"`,
-        labels:          ['mcp-failure', `class:${cls}`],
+        errorReportArgs: `--error-type mcp-${cls} --skill jira-sdlc --step ${sq(step)} --operation ${sq(operation)}`,
+        labels:          ['tooling-error', 'jira-sdlc'],
```

  The `@remarks` comment names the new `gh issue list -R … --label tooling-error --label jira-sdlc` call. Exports unchanged.
- names: `REPORT_REPO`, `normalizeClass`, `sq` (private); P8 keys and order unchanged.
- mirror: `plugins/sdlc-utilities/scripts/lib/git.js:1332` (`'\\''` escape); `REPORT_REPO` value equals `TARGET_REPO` in `plugins/sdlc-utilities/scripts/skill/error-report-prepare.js:44`; stub layout of `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh`.
- decisions: KD3, KD4, KD5; spec P8, R28.
- sync: SKILL.md gate text (Task 5); user doc R28 list (Task 6).
- example: stub and test changes (rendered):

```bash
#!/usr/bin/env bash
# Stub `gh` for mcp-failure.js --analyze (jira-sdlc R28 duplicate search).
# Answers `gh issue list` with one open issue only when the call names the plugin repo and the
# labels error-report-sdlc applies; any other issue list gets []. Other calls fail.
if [[ "$1 $2" == "issue list" ]]; then
  if [[ " $* " == *" -R rnagrodzki/sdlc-marketplace "* && " $* " == *" --label tooling-error "* && " $* " == *" --label jira-sdlc "* ]]; then
    echo '[{"number":4242,"title":"[jira-sdlc] createJiraIssue fails with 401","body":"mcp-failure[auth]: mcp__atlassian__createJiraIssue on acme_atlassian_net"}]'
  else
    echo '[]'
  fi
  exit 0
fi
echo "STUB-GH-UNEXPECTED $*" >&2
exit 1
```

```yaml
# Each --analyze case (existing three and new four) adds:
    script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/mcp-failure-gh-stub/bin"
# Existing "analyze --record emits …" assertion:
#   - o.errorReportArgs.includes('--step "Step3"') && JSON.stringify(o.labels)==='["mcp-failure","class:auth"]'
#   + o.errorReportArgs.includes("--step 'Step3'") && JSON.stringify(o.labels)==='["tooling-error","jira-sdlc"]'
- description: "mcp-failure: analyze single-quotes errorReportArgs and keeps $& literal (P8)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/scripts/lib/mcp-failure.js"
    script_args: '--analyze --class auth --tool t --site s --project PROJ --error e$&e --recovered no --r-path R23 --step S"$(x)`b''q'
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-commit-no-config"
    script_stub_bin: "{{repo_root}}/tests/promptfoo/fixtures-fs/mcp-failure-gh-stub/bin"
  assert:
    - type: javascript
      value: |
        const o = JSON.parse(output.trim());
        return o.errorReportArgs.includes("--step 'S\"$(x)`b'\\''q'") && o.errorText.includes('e$&e');
# "mcp-failure: analyze maps an unknown --class to unknown (P8)": --class x( → errorReportArgs
#   includes '--error-type mcp-unknown' and o.proposalTitle.startsWith('mcp-failure[unknown]').
# "mcp-failure: analyze finds the duplicate in the plugin repo by its marker line (R28 e)":
#   --class auth --tool mcp__atlassian__createJiraIssue → o.duplicate===4242 && o.action==='comment'.
# "mcp-failure: analyze reports no duplicate for another class (R28 e)": --class schema, same tool
#   → o.duplicate===null && o.action==='create'.
```

---

### Task 5: SKILL.md, EXAMPLES.md and behavioural rubrics (M-27, M-36 prose, M-29)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md` — `--site` row, retry telemetry placeholder, gate step 3
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/EXAMPLES.md` — §1 Phases 1–5 keep raw results
- Modify: `tests/promptfoo/datasets/jira-sdlc.yaml` — three R28 rubrics drop the `mcp-failure`/`class:` labels

**Notes:**
Behavioural dataset edits are verified by review only (no behavioural run, AGENTS.md). SKILL.md only relays script output; the logic is in Task 2 and Task 4. One deliverable: the skill's own text follows the new contract (KD7). Findings: F-jira-docs-spec-drift-and-site-copies-2, -3; F-mcp-failure-report-args-and-duplicate-search-5, -6.

**Acceptance criteria:**
- [ ] SKILL.md has no `<FAILURE_CLASS>`; the retry line uses `<CLASS>` with the sentence in the Contract.
- [ ] SKILL.md gate step 3 posts with `--repo 'rnagrodzki/sdlc-marketplace'` and no longer says labels `mcp-failure,class:<CLASS>`.
- [ ] EXAMPLES.md Phases 1–5 have no `→ Extract` line that writes to `cache.`; each names its raw key from the table.
- [ ] `grep -n "class:schema\|class:workflow\|--label mcp-failure" tests/promptfoo/datasets/jira-sdlc.yaml` prints nothing.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` and `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (code):

```diff
-| `--site <host>` | Sanitized site host (e.g., `acme_atlassian_net`). Disambiguates `--check`/`--load` when the same project key is cached under multiple sites. | Unset |
+| `--site <host>` | Sanitized site host (e.g., `acme_atlassian_net`). Disambiguates `--check`/`--load` when the same project key is cached under multiple sites. A dotted host is normalised; a value with `/`, `\` or `..` is rejected with exit 1 (P9). | Unset |
```

```diff
 Also call `--telemetry` on every retry (even successful ones) to maintain a per-session failure log:
+`<CLASS>` is the class the MCP-failure gate would use for that call site (R26).
 ```bash
-node "<PLUGIN_ROOT>/scripts/lib/mcp-failure.js" --telemetry --class '<FAILURE_CLASS>' --tool '<MCP_TOOL_NAME>' …
+node "<PLUGIN_ROOT>/scripts/lib/mcp-failure.js" --telemetry --class '<CLASS>' --tool '<MCP_TOOL_NAME>' …
```

```diff
-… Post it with one plain Bash call: `gh issue comment '<DUPLICATE>' --body-file '<ERROR_FILE>'`. …
+… Post it with one plain Bash call: `gh issue comment '<DUPLICATE>' --repo 'rnagrodzki/sdlc-marketplace' --body-file '<ERROR_FILE>'`. …
-… dispatch `error-report-sdlc` with the `errorReportArgs` field, `--error-text` set to `errorText` (the edited text after `edit`), and labels `mcp-failure,class:<CLASS>`. On `skip`, stop.
+… dispatch `error-report-sdlc` with the `errorReportArgs` field and `--error-text` set to `errorText` (the edited text after `edit`); error-report-sdlc applies its own labels (`tooling-error`, `jira-sdlc`), and the R28 duplicate search finds the issue by the `mcp-failure[<CLASS>]` line of that text. On `skip`, stop.
```

  EXAMPLES.md rule: each `→ Extract … → cache.<x> = …` block becomes `→ Keep raw as <raw key> (--assemble maps it to cache.<x>)`, and the example values stay below it as the shape illustration. Raw keys (match SKILL.md Step 1):

| Phase block | Raw key | Cache field `--assemble` fills |
|---|---|---|
| `getAccessibleAtlassianResources` | `phase1.resources` | `cache.cloudId`, `cache.siteUrl` |
| `atlassianUserInfo` | `phase1.userInfo` | `cache.currentUser` |
| `getVisibleJiraProjects` | `phase2.projects` | `cache.project` |
| `getIssueLinkTypes` | `phase2.linkTypes` | `cache.linkTypes` |
| `getJiraProjectIssueTypesMetadata` | `phase3` | `cache.issueTypes` |
| `getJiraIssueTypeMetaWithFields` | `phase4["Task"]` | `cache.fieldSchemas["Task"]` |
| Step 5a status search | `phase5["Task"].statuses` | (status list) |
| Step 5c transitions | `phase5["Task"].transitions["In Progress"]` | `cache.workflows["Task"].transitions["In Progress"]` |

  Step 5b (`→ Get: issues[0].key`) and the line `// Repeat for Bug, Story, Sub-task — each call uses cache.issueTypes[name].id` stay. Rubric edits in `jira-sdlc.yaml`: "with labels mcp-failure and class:schema" → "with `--error-type mcp-schema`"; "with labels mcp-failure and class:workflow" → "with `--error-type mcp-workflow`"; the duplicate case's request names "an open issue #99 in rnagrodzki/sdlc-marketplace whose body holds mcp-failure[auth]: <tool>", its rubric says "(matching `mcp-failure[auth]: <tool>` in title or body)" and "the dedup query shape (-R rnagrodzki/sdlc-marketplace --label tooling-error --label jira-sdlc --search)", and "error-report-sdlc is dispatched to add a comment" → "the skill posts a comment with `gh issue comment 99 --repo rnagrodzki/sdlc-marketplace`".
- names: placeholder `<CLASS>`; raw keys as in the table.
- mirror: SKILL.md Step 1 raw-key lines ("Keep the raw result for the Phase 6 raw file (`phase1.resources`)").
- decisions: KD3, KD4; spec R26, R27, R28, P9.
- sync: user doc (Task 6); `site/src/data/skills-meta.ts` `analyze-confirm-gate` text stays true (no change).

---

### Task 6: User doc `docs/skills/jira-sdlc.md` (M-26, R28 list, `--site` row)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/skills/jira-sdlc.md` — `--site` flag row, class table rows, R28 steps 1, 4, 5
- Modify: `site/src/content-source/skills/jira-sdlc.md` — byte copy via `cp docs/skills/jira-sdlc.md site/src/content-source/skills/jira-sdlc.md`

**Notes:**
Findings: F-jira-docs-spec-drift-and-site-copies-1, -5; F-mcp-failure-report-args-and-duplicate-search-12.

**Acceptance criteria:**
- [ ] The class table has no "hook deny" text; the `hook-block` row reads as in the Contract.
- [ ] The R28 list names the new search and the `--repo` comment.
- [ ] `cmp docs/skills/jira-sdlc.md site/src/content-source/skills/jira-sdlc.md` exits 0.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY rows and list items only; audience end users; no new section.

```diff
-| `--site <host>` | Sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`). Disambiguates `--check`/`--load` when the same project key is cached under multiple site subdirectories. | Unset |
+| `--site <host>` | Sanitized site host (lowercased, `.` → `_`, e.g., `acme_atlassian_net`). Disambiguates `--check`/`--load` when the same project key is cached under multiple site subdirectories. A dotted host is normalised; a value with `/`, `\` or `..` is rejected. | Unset |
-| `schema` | HTTP 400 with field/shape error, or hook deny citing R19/C13/R18/R25/G15 |
+| `schema` | HTTP 400 with field/shape error |
-| `hook-block` | PreToolUse hook deny citing R20/R21 |
+| `hook-block` | Retained for completeness; no jira-sdlc path emits it since R21 |
-1. Searches for duplicate open issues (`gh issue list --state open --label mcp-failure`).
+1. Searches the plugin repository for duplicate open issues (`gh issue list -R rnagrodzki/sdlc-marketplace --state open --label tooling-error --label jira-sdlc`) and matches the `mcp-failure[<class>]: <tool>` line.
-4. On approval, dispatches `error-report-sdlc` with labels `mcp-failure` and `class:<x>`.
+4. On approval, dispatches `error-report-sdlc` with `--error-type mcp-<class>`; the issue gets the `tooling-error` and `jira-sdlc` labels.
-5. When a duplicate is found, proposes commenting on the existing issue rather than creating a new one.
+5. When a duplicate is found, proposes commenting on the existing issue (`gh issue comment <n> --repo rnagrodzki/sdlc-marketplace`) rather than creating a new one.
```

- names: rows `--site <host>`, `schema`, `hook-block`; list items 1, 4, 5 under "Analyze-then-confirm dispatch gate (R28)".
- mirror: spec R26 (`docs/specs/jira-sdlc.md:76`) and amended R28.
- decisions: harden-sdlc doc lines about `mcp-failure`-labeled issues stay (non-goal).
- sync: site byte copy.

---

### Task 7: Delete orphan `jira-hook-*` fixtures

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/jira-hook-dump/.gitkeep` — delete
- Modify: `tests/promptfoo/fixtures-fs/jira-hook-lenhints/.gitkeep` — delete
- Modify: `tests/promptfoo/fixtures-fs/jira-hook-trim-eq-a/.gitkeep` — delete
- Modify: `tests/promptfoo/fixtures-fs/jira-hook-trim-eq-b/.gitkeep` — delete
- Modify: `tests/promptfoo/fixtures-fs/jira-hook-trim-neq/.gitkeep` — delete

**Notes:**
Findings: F-jira-test-harness-and-orphan-fixtures-1, -6 (no dataset, provider or validator reads these folders).

**Acceptance criteria:**
- [ ] `git rm` of the five files; the five folders no longer exist.
- [ ] `grep -rn "jira-hook-" tests/promptfoo --include=*.yaml --include=*.js` prints nothing.

**Contract:**
- shape (code): delete five tracked `.gitkeep` files with `git rm` (no content edits).
- names: the five paths above.
- mirror: none (removal).
- decisions: plans under `docs/plans/` that name these folders are history and stay unchanged.
- sync: none.

---

### Task 8: Stale R21.2 comment in `hook-runner.js` and the plan file

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/providers/hook-runner.js` — header comment of `script_env`
- Create: `docs/plans/2026-11-12-lean-m3-jira-safety.md`

**Notes:**
The plan file sits here because ship stages only files named in the plan (project rule), not as a second deliverable. The comment change is not executable, so a load check replaces an exec run; the hooks exec config is a main-session check. Findings: F-jira-test-harness-and-orphan-fixtures-2.

**Acceptance criteria:**
- [ ] The header comment no longer names R21.2 or jira-sdlc debug dumps.
- [ ] `node -e "require('./tests/promptfoo/providers/hook-runner.js')"` exits 0.

**Contract:**
- shape (code):

```diff
  *   script_env   — (optional) JSON string or object of extra env vars. Useful for
  *                  per-test TMPDIR isolation when the hook writes diagnostic files
- *                  to `os.tmpdir()` (e.g., jira-sdlc-debug dumps per R21.2).
+ *                  to `os.tmpdir()`.
```

- names: none.
- mirror: none.
- decisions: comment-only change.
- sync: none.

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 2, 3 and 4 add or update exec cases (including the three existing --analyze cases); Task 5 updates the stale behavioural rubrics |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no full-suite or retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | All tasks map to the stated goals; hygiene items are listed in Goal |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; grouping by shared file is justified in KD7; the plan file under Task 8 is a staging rule, not a deliverable |
| scripts-over-llm-logic | error | PASS | Validation, quoting, fill and duplicate matching are in scripts; SKILL.md only relays output |
| yagni | warning | PASS | Optional structured fields and --recovered changes are explicitly excluded |
| cross-skill-consistency | error | PASS | error-report-sdlc and harden-sdlc are checked and left unchanged; the match is adapted to the labels they really apply |
| pr-link-github-issue | error | PASS | Not applicable: #9363 is an internal register id, not a GitHub issue; the PR body names it without Fixes/Closes (KD8) |
| dry | warning | PASS | One-pass fill and shared helpers; the REPORT_REPO mirror of TARGET_REPO is noted; the site copies are byte copies |
| kiss | warning | PASS | One parseArgs check and one-pass fill are the simplest options |
| spec-first | error | PASS | Task 1 updates the spec before the SKILL.md changes in Task 5 |
| project-agnostic | error | PASS | Changes are in plugin scripts and skill files; no consumer repo-local edits |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag gating is introduced |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings are introduced in SKILL.md |
| flag-resolution-single-source | warning | PASS | --project and --site are resolved once in parseArgs |
| state-premise | error | PASS | Context and Architecture state the root problem |
| smallest-viable-cut | warning | PASS | The smallest cut is identified and the extra tasks are justified |
| failure-audience | warning | PASS | The 'Who fails' section names users and maintainers |
| explicit-non-goals | warning | PASS | The Non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | KD1-KD8 and the 'Decisions taken without the owner' list record the choices with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified; the legacy migration is only protected by upstream validation |
| agent-dispatch-script-driven | error | PASS | error-report-sdlc is dispatched with the script-produced errorReportArgs verbatim |
| flag-semantic-consistency-cross-skill | error | PASS | No new flags are added |
| workspace-mode-compatibility | error | PASS | The plan states that it behaves identically under branch and worktree |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 rejects `--project`/`--site` values in `plugins/sdlc-utilities/scripts/skill/jira.js` and Task 4 changes the P8 output of `plugins/sdlc-utilities/scripts/lib/mcp-failure.js`, both visible CLI contract changes.

**Severity hint:** high

**Patch:** Check the new `--project`/`--site` validation (P9, exit 1 via errors[]) and the changed `mcp-failure.js --analyze` output contract (single-quoted errorReportArgs, labels ["tooling-error","jira-sdlc"], class normalised to the R26 set, -R duplicate search).

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new `--project`/`--site` validation (P9, exit 1 via errors[]) and the changed `mcp-failure.js --analyze` output contract (single-quoted errorReportArgs, labels ["tooling-error","jira-sdlc"], class normalised to the R26 set, -R duplicate search).

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 (`docs/specs/jira-sdlc.md`), Task 5 (`plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md`) and Task 6 (`docs/skills/jira-sdlc.md`) are markdown-only changes, and the dimension does not yet trigger on `**/*.md`.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### UPDATE: docs-skill-sync (B1)

**Why:** Task 5 edits the `--site` row and the gate text in `plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md`, and Task 6 edits `docs/skills/jira-sdlc.md`, to follow the Task 2 and Task 4 flag and contract changes.

**Severity hint:** medium

**Patch:** Check that the SKILL.md and `docs/skills/jira-sdlc.md` `--site` row, retry placeholder `<CLASS>`, class table and R28 gate steps match the changed script contract.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the SKILL.md and `docs/skills/jira-sdlc.md` `--site` row, retry placeholder `<CLASS>`, class table and R28 gate steps match the changed script contract.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 M-39: jira.js rejects path-like --project and --site in parseArgs; spec P-contract rule; exec cases | Task 1, Task 2 | covered |
| 2 M-25: mcp-failure.js errorReportArgs single quotes, class validation, literal template fill, exec cases, spec P8 note | Task 1, Task 4 | covered |
| 3 M-36: duplicate search -R/labels/marker match, SKILL.md comment --repo, spec R28 and SKILL labels text, stub gh tests | Task 1, Task 4, Task 5 | covered |
| 4 M-31: --check-payload reads ADF level-2 headings; exec case | Task 1, Task 3 | covered |
| 5 M-27: SKILL.md <FAILURE_CLASS> renamed to <CLASS> with explanatory sentence | Task 5 | covered |
| 6 M-26: docs/skills/jira-sdlc.md hook-deny rows fixed; site copy with cp | Task 6 | covered |
| 7 M-29: EXAMPLES.md Phases 1-5 keep raw as phaseN.x | Task 5 | covered |
| 8 Optional hygiene: delete orphan jira-hook-* fixtures; fix stale R21.2 comment | Task 7, Task 8 | covered |
| 9 Plan file listed as Create under last task; targeted exec commands; excluded scope | Task 8, Task 2, Task 3, Task 4 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all tasks are done:

- `jira.js` refuses a `--project` or `--site` that could leave the cache folder. A dotted `--site` works and reaches the same folder as `--save`.
- `mcp-failure.js --analyze` prints single-quoted, shell-safe report arguments, keeps the class inside the R26 set, inserts untrusted text literally, and finds a duplicate issue in the plugin repository by its marker line.
- `--check-payload` checks the headings of markdown and ADF descriptions alike.
- The spec (A5, R28, P7, P8, P9), SKILL.md, EXAMPLES.md, the behavioural rubrics and the user doc all describe this behaviour, and the site copies match.
- No exec case reaches a live `gh`. Five empty fixture folders and one stale comment are gone.
- error-report-sdlc, harden-sdlc and setup-sdlc are unchanged.

## OpenSpec Appendix

Not applicable — no OpenSpec change
