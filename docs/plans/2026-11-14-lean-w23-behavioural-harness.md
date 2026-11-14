# Behavioural Harness Fixes Implementation Plan

**Commit:** `fix(#9391): tests - claude-cli limit latch, JS regex, OWASP vars`
**Goal:**
- Make a `claude -p` usage-limit refusal visible in behavioural results and stop the run from spending after it.
- Make the 21 regex assertions that JavaScript cannot compile pass or fail on their merits, and add a check that keeps them compilable.
- Make the 10 review-sdlc OWASP cases send their diff to the model.

**Architecture:** The behavioural suite gave zero signal because three harness defects hid or broke results. The claude-cli provider (`tests/promptfoo/providers/claude-cli.js`) gets a named usage-limit pattern, a module-level latch and a richer error text. The 21 inline-flag regexes are rewritten mechanically (letter classes, `[\s\S]`, explicit line-start alternation). A new text-scan script compiles every `regex`/`not-regex` value of the behavioural and headless datasets. The OWASP cases move their diff from `skill_content` (overwritten by transformVars) to `project_context`.
**Source:** conversation context (wave brief for tracking id #9391; ledger F-99, F-100)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- The owner ran the behavioural suite (eval-SNP-2026-11-14T15:54:04, 371 cases). It gave zero signal.
- The Claude plan's 5-hour usage limit was hit at 16:36:49. Every later `claude -p` call was refused.
- The results only said `Command failed: claude -p ...`. The limit message goes to stdout in text mode, and the provider drops stdout on a non-zero exit (ledger F-99).
- 21 regex assertions use inline flags such as `(?i)`. JavaScript rejects them ("Invalid group"), so they can never pass (ledger F-100).
- The 10 review-sdlc OWASP cases answered "no diff came with it". The diff never reached the prompt.

**What prompted this change now?** An isolated analysis of the `claude -p` transcripts of that run proved the three defects. This wave fixes the harness only.

**What does success look like?**

- A usage-limit refusal shows up once as an error that names the limit and its reset time. Later calls in the same run fail at once, without starting `claude -p`.
- A normal non-zero exit shows its exit code and the end of stdout.
- No behavioural or headless dataset holds a regex that `new RegExp(value)` rejects, and an exec case proves it.
- The OWASP cases render their diff in the prompt.

## Research Findings

All three items reproduce at HEAD `1a6dfe7`.

**Item 1 — provider error text (F-claude-cli-usage-limit-failfast-1..7).**

- `tests/promptfoo/providers/claude-cli.js:41-43` returns `{ error: error.message, output: stderr }`. The exit code and stdout are lost.
- The only module state is `const MAX_ATTEMPTS = 3` at line 3. The new constant and the latch go beside it.
- The provider is also the `llm-rubric` grader (`promptfooconfig.yaml:12`, `defaultTest.options.provider`). So the latch also stops grading calls after the limit. That is wanted: they are refused too.
- The stub pattern exists in `tests/promptfoo/scripts/run-claude-cli-enoent-retry.js:9-28` (F-claude-cli-stub-exec-test-pattern-1, -3). It sets `PATH` to a temp dir that holds only a `#!/bin/sh` stub, so the stub may use only shell builtins and absolute paths such as `/bin/cat` (F-claude-cli-stub-exec-test-pattern-7).
- Each exec case runs in its own node process (F-claude-cli-stub-exec-test-pattern-2). So the latch test makes two `callApi` calls in one script run.
- The case lives in `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml:45-53`, already listed in `promptfooconfig-exec.yaml` (F-claude-cli-stub-exec-test-pattern-4, -5).
- The README spot is `### Behavioral tests (`promptfooconfig.yaml`)` in `tests/promptfoo/README.md:43` (F-claude-cli-usage-limit-failfast-6).

**Item 2 — inline regex flags (F-inline-regex-flag-rewrite-1..21).**

- promptfoo 0.123.1 compiles a `regex` value with `new RegExp(renderedValue)` and no flags. An invalid pattern fails with `Invalid regex pattern: ...`. So a broken `not-regex` fails too.
- A scan of the 19 datasets named by `promptfooconfig.yaml` and `promptfooconfig-headless.yaml` finds 320 `regex`/`not-regex` values. Exactly the 21 named in the brief throw: review-sdlc 13, version-sdlc 5, ship-sdlc 2, jira-sdlc 1.
- Every value sits on the line after its `type:` line and is single- or double-quoted. None uses a block scalar or `{{` (F-regex-compile-exec-guard-wiring-2).
- The lookaheads at `version-sdlc.yaml:188` and `sdlc-dimensions-exec.yaml:220` are valid JavaScript and stay as they are.
- There is no YAML parser (no `node_modules`). `tests/promptfoo/scripts/check-fixture-refs.js:22-23` already lists the datasets of both configs with `CONFIGS` and `DATASET_RE` (F-regex-compile-exec-guard-wiring-3, -5).
- A new exec dataset needs one line in `promptfooconfig-exec.yaml` (F-regex-compile-exec-guard-wiring-4). No CI list or doc lists exec datasets one by one (F-regex-compile-exec-guard-wiring-6).
- Each rewrite below was checked: the old pattern with its flags and the new pattern without flags gave the same match result on 28 sample strings.

**Item 3 — OWASP wiring (F-review-owasp-diff-wiring-1..4).** The wiring is broken.

- The 10 cases (`review-sdlc.yaml`, keys at lines 648, 681, 711, 738, 770, 799, 829, 859, 891, 924) put the diff inline in `skill_content` and also set `skill_path: ".../review-sdlc/REFERENCE.md"`.
- `tests/promptfoo/scripts/extract-skill-content.js:15-19` (the `transformVars` hook) replaces `skill_content` with the file at `skill_path`. The diff is lost.
- `tests/promptfoo/prompts/skill-runner.txt` renders `{{project_context}}` under "Simulated Project Context", which is empty for these cases. The user request says "the diff above", and the model sees none.
- They are the only cases in any dataset that set both `skill_path` and `skill_content`. Other review cases use `project_context` (F-review-owasp-diff-wiring-4).

**Commands.** Exec-only targeted run: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. The behavioural suite and the headless runner are owner-run only.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| No spec task | no | changes test-harness files only, with no `docs/specs/` edit | the harness is not a skill and has no spec; the brief puts plugin skills, scripts and specs out of scope |
| Limit detection only on a non-zero exit | no | tests the usage-limit pattern only when `claude -p` failed | a successful answer may quote "hit your ... limit" (for example a skill about rate limits); the real refusal exits non-zero (F-99) |
| Exit-0 negative case | no | adds one exec case: a stub that prints the limit text and exits 0 is not latched | proves the decision above; one small case |
| OWASP fix in the dataset, not in transformVars | no | renames `skill_content:` to `project_context:` in the 10 cases | narrowest fix; changing `extract-skill-content.js` would change every behavioural and exec case |
| Regex guard reuses the dataset list | no | exports `CONFIGS` and `DATASET_RE` from `check-fixture-refs.js` | the list already exists there (dry guardrail) |
| Probe mode and fail-safe decoding in the compile check | no | adds `--probe-invalid` and reports values it cannot decode | the probe is the negative test of requirement 7 (it proves the check reports a bad value), mirroring `--probe-missing` in `check-fixture-refs.js`; fail-safe decoding keeps the check from passing on a value it never compiled (F-73) |
| Tracking id is not a GitHub issue | no | the PR body names #9391 with no `Fixes`/`Closes` keyword | #9391 is an internal register id (project notes) |
| Exact multi-line rewrite | no | `(?im)^model:\s` becomes `(?:^\|[\n\r\u2028\u2029])[Mm][Oo][Dd][Ee][Ll]:\s` | JavaScript `m` mode `^` matches after all four line terminators; the brief's `(?:^\|\n)` would be narrower |

## Key Decisions

- **Letter classes over a `javascript` assertion.** Each `(?i)` letter becomes `[Xx]`. A `javascript` assertion with `/.../i` would read better. But it changes the assertion type, which the brief puts out of scope, and the new compile check would not cover it.

- **Detect the limit only on a non-zero exit.** The alternative is to test every answer. That could latch a whole run on a model answer that only talks about limits.

- **The latch returns the same error text.** Later calls return the first limit error unchanged. The README says that later calls are skipped. This keeps one message per run in the results table.

- **Error text keeps `error.message` and appends the detail.** The alternative is a new message format. Keeping the old text first keeps existing result searches working.

- **Text scan, not a YAML parse.** The project has no YAML library and adds no dependency. The scan states its threat model and accepted gaps in the script header, like `check-fixture-refs.js`. It fails safe: a value it cannot decode is reported, not skipped.

- **New exec dataset file.** The compile check gets `datasets/dataset-regex-exec.yaml`. Adding it to `fixture-guard-exec.yaml` would avoid one config line, but that file is about fixtures.

- **Root problem.** The harness hid or broke results, so a 371-case owner run produced no usable signal.

- **Who fails if this ships wrong.** The owner who runs the behavioural suite. A wrong latch could fail a whole run without a limit; a wrong rewrite could pass or fail a case for the wrong reason. Plugin users are not affected: no plugin file changes.

- **Smallest viable cut.** Tasks 1 to 3 are the fixes. Task 4 (the compile check) is the one extra; the brief asks for it, and it keeps the 21 fixes from coming back.

- **Non-goals.** No change to `extract-skill-content.js` (it could warn when a case sets both `skill_path` and `skill_content`, but only these 10 cases do). No retry or wait after a usage limit. No change to assertion content beyond regex syntax. No change to the headless datasets, plugin skills, scripts or specs. No behavioural, headless or `claude -p` run.

- **One task per shared file.** Task 2 holds both the regex rewrites and the OWASP rewiring of `review-sdlc.yaml`. Splitting them would give one file to two tasks in the same execute wave, or add a wave (F-43). Both edits are small and mechanical.

- **Brief finding disposition.** All 45 brief findings were used. There are no web findings, so no ADOPT/REJECT list is needed.

## Contract Examples

**code** (Task 1):

```markdown
**Contract:**
- shape (code): module constants `USAGE_LIMIT_RE = /hit your[^\n]*limit/i`,
  `STDOUT_TAIL_CHARS = 500`, latch `let usageLimitError = null`; `callApi` returns
  `{ error: usageLimitError }` before spawning when the latch is set.
- names: `USAGE_LIMIT_RE`, `STDOUT_TAIL_CHARS`, `usageLimitError`.
- mirror: `tests/promptfoo/providers/claude-cli.js:3` (`MAX_ATTEMPTS`).
- decisions: detect only on a non-zero exit (Key Decisions).
- sync: `tests/promptfoo/README.md` behavioural section describes the same behaviour.
```

**docs** (Task 1, README part):

```markdown
**Contract:**
- shape (docs): MODIFY `tests/promptfoo/README.md`; add one paragraph at the end of
  `### Behavioral tests (`promptfooconfig.yaml`)` (audience: the owner who runs the suite).
- names: no new heading.
- mirror: the paragraph style at `tests/promptfoo/README.md:45-49`.
- decisions: plain prose, names the constant so readers can find it.
- sync: the error texts in `providers/claude-cli.js`.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1 and 4 add exec cases; Tasks 2 and 3 edit test datasets and are covered by Task 4's compile check |
| no-ci-bypass | error | PASS | No CI checks are skipped or disabled |
| no-auto-eval | error | PASS | Only targeted runs of the exec-only config; behavioural and headless runs are non-goals |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to the three stated fixes, plus the justified compile check |
| single-responsibility-tasks | warning | FAIL | Task 2 combines the regex rewrites with the OWASP diff rewiring |
| scripts-over-llm-logic | error | PASS | No skill logic changes; the new check is a deterministic script |
| yagni | warning | PASS | No speculative functionality or unused parameters |
| cross-skill-consistency | error | PASS | No skills touched; the harness change is test-only |
| pr-link-github-issue | error | PASS | #9391 is an internal register id, not a GitHub issue; the deviation is documented |
| dry | warning | PASS | The compile check reuses CONFIGS and DATASET_RE from check-fixture-refs.js |
| kiss | warning | PASS | Text scan and letter-class rewrites, with the alternatives rejected in Key Decisions |
| spec-first | error | PASS | No SKILL.md changes, so no spec task is needed |
| project-agnostic | error | PASS | Only the repo's own test harness changes; no plugin behaviour is affected |
| flag-coherence-cross-skill | error | PASS | No skill dispatch or flag gating involved |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are touched |
| flag-resolution-single-source | warning | PASS | No contractual flags are added |
| state-premise | error | PASS | Root problem is stated in Architecture and Key Decisions |
| smallest-viable-cut | warning | PASS | Task 4 is identified as the one extra and justified |
| failure-audience | warning | PASS | The owner who runs the suite is named as the party affected |
| explicit-non-goals | warning | PASS | The Non-goals section lists exclusions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded with rationale in Key Decisions |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is involved |
| flag-semantic-consistency-cross-skill | error | PASS | --probe-invalid is on a test helper, not a skill prepare script |
| workspace-mode-compatibility | error | PASS | Test-harness files only, with no state, config or cwd-dependent logic |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompts are modified |

The one warning (single-responsibility-tasks, Task 2) is accepted; see Key Decisions.

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 4 adds the `--probe-invalid` CLI flag and exit-code contract in `tests/promptfoo/scripts/check-dataset-regex.js`, and changes `check-fixture-refs.js` to `module.exports = { CONFIGS, DATASET_RE }`.

**Severity hint:** high

**Patch:** Cover the new `check-dataset-regex.js` CLI contract (`--probe-invalid` flag, exit codes 0/1/2, JSON output line) and the new `CONFIGS`/`DATASET_RE` exports of `check-fixture-refs.js`.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Cover the new `check-dataset-regex.js` CLI contract (`--probe-invalid` flag, exit codes 0/1/2, JSON output line) and the new `CONFIGS`/`DATASET_RE` exports of `check-fixture-refs.js`.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: test-quality (U3)

**Why:** Task 1 modifies `tests/promptfoo/providers/claude-cli.js` and `tests/promptfoo/README.md`, which the script flagged against the `tests/promptfoo/datasets` triggers.

**Severity hint:** high

**Patch:** update triggers naming `tests/promptfoo/datasets` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/test-quality.md` — update triggers naming `tests/promptfoo/datasets` after the rename

### UPDATE: code-quality (U1)

**Why:** Tasks 1 to 4 touch `tests/promptfoo/README.md`, the four dataset files and `promptfooconfig-exec.yaml`, none of which the dimension's triggers cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_1 additional candidates suppressed_

## Tasks

### Task 1: claude-cli provider — error detail and usage-limit latch

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/claude-cli.js` — add the usage-limit constant, the latch and the richer error text
- Modify: `tests/promptfoo/README.md` — one paragraph in the behavioural tests section
- Create: `tests/promptfoo/scripts/run-claude-cli-limit-stub.js`
- Test: `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml` — three new cases after the ENOENT case

**Notes:** Implements F-claude-cli-usage-limit-failfast-1..7 and F-claude-cli-stub-exec-test-pattern-1..7. The stub runs with `PATH` set to its temp dir only, so it uses shell builtins and `/bin/cat`. The latch is per process, so the limit case makes both calls inside one script run.

**Acceptance criteria:**
- [ ] A stub that prints the limit message and exits 1 gives an error that contains `claude -p usage limit reached` and the reset text `resets 9pm`.
- [ ] A second `callApi` in the same process returns the same error and does not run the stub (the marker file holds one line).
- [ ] A stub that prints `TAIL-MARKER-77` and exits 3 gives an error that contains `exit: 3` and `TAIL-MARKER-77`, and not `usage limit`.
- [ ] A stub that prints the limit text and exits 0 returns it as `output`, with no error.
- [ ] The existing case `claude-cli-provider: spawn ENOENT is retried until the binary is back` still passes.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern claude-cli-provider`

**Contract:**
- shape (code): provider change, rendered below. Harness `run-claude-cli-limit-stub.js <mode>`, mode one of `limit | exit | ok`; prints one JSON line; exit 1 only on a rejected promise; removes its temp dir in `finally`.
- names: `USAGE_LIMIT_RE`, `STDOUT_TAIL_CHARS`, `usageLimitError`; harness modes `limit`, `exit`, `ok`; case descriptions start with `claude-cli-provider:`.
- mirror: `tests/promptfoo/scripts/run-claude-cli-enoent-retry.js:1-28` (temp `PATH`, stub written with mode `0o755`, one JSON line, `finally` cleanup); case shape `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml:45-53`.
- decisions: detect only on a non-zero exit; latched calls return the same text (Key Decisions).
- sync: README paragraph names `USAGE_LIMIT_RE` and both error forms.

Provider change (`callApi` in `tests/promptfoo/providers/claude-cli.js`):

```diff
 const MAX_ATTEMPTS = 3;
+// A `claude -p` usage-limit refusal ("You've hit your ... limit ... resets ..."); text mode prints it to stdout.
+const USAGE_LIMIT_RE = /hit your[^\n]*limit/i;
+const STDOUT_TAIL_CHARS = 500;
+// Set on the first refusal; every later call in this process returns it without spawning `claude -p`.
+let usageLimitError = null;
 …
   async callApi(prompt, context) {
+    if (usageLimitError) return { error: usageLimitError };
     for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
       …
       if (error) {
-        return { error: error.message, output: stderr };
+        const limitLine = [stdout, stderr].join('\n').split('\n').find((l) => USAGE_LIMIT_RE.test(l));
+        if (limitLine) {
+          usageLimitError = `claude -p usage limit reached: ${limitLine.trim().slice(0, 300)}`;
+          return { error: usageLimitError };
+        }
+        const exit = typeof error.code === 'number' ? error.code : (error.signal || error.code);
+        const tail = (stdout || '').trim().slice(-STDOUT_TAIL_CHARS) || '(empty)';
+        return { error: `${error.message} | exit: ${exit} | stdout tail: ${tail}`, output: stderr };
       }
       return { output: stdout };
```

Error forms:

| Condition | Returned | Spawns `claude -p` |
|---|---|---|
| Latch set | `{ error: usageLimitError }` | no |
| Non-zero exit, a stdout or stderr line matches `USAGE_LIMIT_RE` | `{ error: "claude -p usage limit reached: <line>" }`, latch set | yes (this call only) |
| Other non-zero exit or timeout | `{ error: "<error.message> \| exit: <code or signal> \| stdout tail: <last 500 chars or (empty)>", output: stderr }` | yes |
| ENOENT, attempts left | retry, unchanged | yes |
| Exit 0 | `{ output: stdout }`, even when stdout matches the pattern | yes |

Harness output per mode (one JSON line):

```
limit: {"first":{"error":"claude -p usage limit reached: You've hit your 5-hour limit · resets 9pm (UTC)"},"second":{…same…},"calls":1}
exit:  {"result":{"error":"Command failed: claude -p … | exit: 3 | stdout tail: TAIL-MARKER-77","output":""}}
ok:    {"result":{"output":"You've hit your 5-hour limit · resets 9pm (UTC)\n"}}
```

The `limit` stub appends one line to a marker file in the temp dir (`echo call >> "<dir>/marker"`) before it prints the message; `calls` is the marker's line count.

New cases (append after the ENOENT case):

```yaml
- description: "claude-cli-provider: a usage-limit refusal names the limit and latches (second call does not spawn)"
  vars:
    script_path: "repo://tests/promptfoo/scripts/run-claude-cli-limit-stub.js"
    script_args: "limit"
  assert:
    - type: javascript
      value: "const r = JSON.parse(output); r.calls === 1 && r.first.error.includes('claude -p usage limit reached') && r.first.error.includes('resets 9pm') && r.second.error === r.first.error"
# … "exit" case: r.result.error includes 'exit: 3' and 'TAIL-MARKER-77' and not 'usage limit'
# … "ok" case: r.result.output includes 'hit your' and r.result.error === undefined
```

README paragraph (append to the behavioural tests section):

```markdown
When `claude -p` exits non-zero, the provider error adds the exit code and the last 500
characters of stdout. A usage-limit refusal (a line matching `USAGE_LIMIT_RE`, "hit your …
limit") gives the error `claude -p usage limit reached: <message with its reset time>`. Every
later call in the same promptfoo run returns that error at once and does not start `claude -p`,
so a run stops spending after the limit. Re-run after the reset time.
```

### Task 2: review-sdlc dataset — JS-compatible regexes and OWASP diff wiring

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — rewrite 13 regex values; rename `skill_content:` to `project_context:` in the 10 OWASP cases

**Notes:** Implements F-inline-regex-flag-rewrite-1..13 and F-review-owasp-diff-wiring-1..4. Behavioural cases are verified by review only (owner-run suite). Task 4's exec case proves the values compile. Only the `value:` lines and the 10 var keys change; assertion types and other content stay.

**Acceptance criteria:**
- [ ] Each of the 13 values in the table below reads exactly as its "After" column.
- [ ] `grep -nE '\(\?[a-z]+\)' tests/promptfoo/datasets/review-sdlc.yaml` prints nothing.
- [ ] The 10 OWASP cases (`OWASP A01` … `OWASP A10`) use `project_context: |` with their unchanged block body, and still set `skill_path`. The non-OWASP `skill_content:` key near line 626 is unchanged.
- [ ] No other line of the file changes.

**Contract:**
- shape (code): YAML value replacements, rendered below; new values single-quoted (no YAML escapes needed).
- names: the 13 `value:` lines; key `project_context` in the 10 cases titled `review-sdlc: OWASP A01` … `A10`.
- mirror: other review cases set `project_context` (`tests/promptfoo/datasets/review-sdlc.yaml:10`).
- decisions: letter classes for `(?i)`, `[\s\S]` for `(?s)`, line-terminator alternation for `(?m)` (Key Decisions).
- sync: Task 4's check scans this file.

| Line (HEAD) | Type | Before | After |
|---|---|---|---|
| 386 | regex | `'(?s)links\.js.*?gh api'` | `'links\.js[\s\S]*?gh api'` |
| 510 | regex | `"(?s)src/auth/login\\.ts:42.*?yes\\s*/\\s*save\\s*/\\s*cancel"` | `'src/auth/login\.ts:42[\s\S]*?yes\s*/\s*save\s*/\s*cancel'` |
| 587 | not-regex | `"(?im)^model:\\s"` | `'(?:^\|[\n\r\u2028\u2029])[Mm][Oo][Dd][Ee][Ll]:\s'` |
| 669, 700, 727, 848 | regex | `'(?i)"severity"\s*:\s*"critical"'` | `'"[Ss][Ee][Vv][Ee][Rr][Ii][Tt][Yy]"\s*:\s*"[Cc][Rr][Ii][Tt][Ii][Cc][Aa][Ll]"'` |
| 759, 788, 818, 880, 944 | regex | `'(?i)"severity"\s*:\s*"high"'` | `'"[Ss][Ee][Vv][Ee][Rr][Ii][Tt][Yy]"\s*:\s*"[Hh][Ii][Gg][Hh]"'` |
| 913 | regex | `'(?i)"severity"\s*:\s*"medium"'` | `'"[Ss][Ee][Vv][Ee][Rr][Ii][Tt][Yy]"\s*:\s*"[Mm][Ee][Dd][Ii][Uu][Mm]"'` |

In the table, `\|` is the Markdown escape for the regex `|`; the file holds a plain `|`. The line-587 value in the file is exactly `'(?:^|[\n\r\u2028\u2029])[Mm][Oo][Dd][Ee][Ll]:\s'` (`\u2028` is a regex escape that JavaScript accepts without the `u` flag).

OWASP wiring, the same in each of the 10 cases:

```diff
   - description: "review-sdlc: OWASP A01 — finding tagged with category (issue #272)"
     vars:
       skill_path: "plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md"
       user_request: "Produce the security finding for the diff above. …"
-      skill_content: |
+      project_context: |
         You are running the review-sdlc security-review dimension subagent against this diff:
         …
```

| | Prompt `{{skill_content}}` | Prompt `{{project_context}}` |
|---|---|---|
| Now | REFERENCE.md (inline diff overwritten) | empty |
| After | REFERENCE.md | the inline diff and its instructions |

### Task 3: version, ship and jira datasets — JS-compatible regexes

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/datasets/version-sdlc.yaml` — rewrite 5 regex values
- Modify: `tests/promptfoo/datasets/ship-sdlc.yaml` — rewrite 2 regex values
- Modify: `tests/promptfoo/datasets/jira-sdlc.yaml` — rewrite 1 regex value

**Notes:** Implements F-inline-regex-flag-rewrite-14..21. Verified by review; Task 4's exec case proves the values compile.

**Acceptance criteria:**
- [ ] Each of the 8 values reads exactly as its "After" column, quote style unchanged (all single-quoted except jira 439, which stays double-quoted).
- [ ] `grep -nE '\(\?[a-z]+\)' tests/promptfoo/datasets/version-sdlc.yaml tests/promptfoo/datasets/ship-sdlc.yaml tests/promptfoo/datasets/jira-sdlc.yaml` prints nothing; the lookahead `PROJ-(?!123|456)\d+` at `version-sdlc.yaml:188` is unchanged.

**Contract:**
- shape (code): YAML value replacements, rendered below.
- names: the 8 `value:` lines.
- mirror: Task 2 rewrite rules.
- decisions: letter classes for `(?i)` (Key Decisions).
- sync: Task 4's check scans these files.

| File:line (HEAD) | Type | Before (pattern) | After (pattern) |
|---|---|---|---|
| version-sdlc:304, 448 | not-regex | `(?i)suggest.*major` | `[Ss][Uu][Gg][Gg][Ee][Ss][Tt].*[Mm][Aa][Jj][Oo][Rr]` |
| version-sdlc:388 | regex | `(?i)(invalid\|reject\|cannot)` | `([Ii][Nn][Vv][Aa][Ll][Ii][Dd]\|[Rr][Ee][Jj][Ee][Cc][Tt]\|[Cc][Aa][Nn][Nn][Oo][Tt])` |
| version-sdlc:446 | regex | `(?i)(config\|preRelease\|sdlc\.json)` | `([Cc][Oo][Nn][Ff][Ii][Gg]\|[Pp][Rr][Ee][Rr][Ee][Ll][Ee][Aa][Ss][Ee]\|[Ss][Dd][Ll][Cc]\.[Jj][Ss][Oo][Nn])` |
| version-sdlc:527 | not-regex | `(?i)(rewrite\|regenerate\|update).*(description\|author\|keywords)` | `([Rr][Ee][Ww][Rr][Ii][Tt][Ee]\|[Rr][Ee][Gg][Ee][Nn][Ee][Rr][Aa][Tt][Ee]\|[Uu][Pp][Dd][Aa][Tt][Ee]).*([Dd][Ee][Ss][Cc][Rr][Ii][Pp][Tt][Ii][Oo][Nn]\|[Aa][Uu][Tt][Hh][Oo][Rr]\|[Kk][Ee][Yy][Ww][Oo][Rr][Dd][Ss])` |
| ship-sdlc:486 | regex | `(?i)(rc\|pre[- ]?release\|label)` | `([Rr][Cc]\|[Pp][Rr][Ee][- ]?[Rr][Ee][Ll][Ee][Aa][Ss][Ee]\|[Ll][Aa][Bb][Ee][Ll])` |
| ship-sdlc:511 | regex | `(?i)(invalid\|reject)` | `([Ii][Nn][Vv][Aa][Ll][Ii][Dd]\|[Rr][Ee][Jj][Ee][Cc][Tt])` |
| jira-sdlc:439 | not-regex | `(?i)(This (ticket\|task\|story) (covers\|addresses)\|The goal of\|We need to make sure)` | `([Tt][Hh][Ii][Ss] ([Tt][Ii][Cc][Kk][Ee][Tt]\|[Tt][Aa][Ss][Kk]\|[Ss][Tt][Oo][Rr][Yy]) ([Cc][Oo][Vv][Ee][Rr][Ss]\|[Aa][Dd][Dd][Rr][Ee][Ss][Ss][Ee][Ss])\|[Tt][Hh][Ee] [Gg][Oo][Aa][Ll] [Oo][Ff]\|[Ww][Ee] [Nn][Ee][Ee][Dd] [Tt][Oo] [Mm][Aa][Kk][Ee] [Ss][Uu][Rr][Ee])` |

In the table, `\|` is the Markdown escape for the regex `|`; the files hold a plain `|`. None of these patterns holds a backslash except `sdlc\.json`, which is single-quoted and so needs no YAML escape.

### Task 4: Regex compile check for the behavioural and headless datasets

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 3
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/scripts/check-dataset-regex.js`
- Modify: `tests/promptfoo/scripts/check-fixture-refs.js` — export `CONFIGS` and `DATASET_RE`; run the CLI block only when run directly
- Test: `tests/promptfoo/datasets/dataset-regex-exec.yaml` (new)
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — add `- file://datasets/dataset-regex-exec.yaml` after `fixture-guard-exec.yaml`

**Notes:** Implements F-regex-compile-exec-guard-wiring-1..6. A text scan, because the project has no YAML parser. The case (a) depends on Tasks 2 and 3: before them it reports the 21 values. The `fixture-refs` cases must still pass after the export change.

**Acceptance criteria:**
- [ ] On the repo, the script prints `{"ok":true,…}` with `configs === 2`, `datasets >= 19`, `checked >= 320` and an empty `invalid`, and exits 0.
- [ ] `--probe-invalid` reports exactly the two invalid values of its temp tree (one `regex`, one `not-regex`), with dataset path, line and error, and does not report the valid ones (including a single-quoted value with `''`).
- [ ] A value the scanner cannot decode, or a `type:` line with no `value:` on the next non-comment line, is reported (fails safe).
- [ ] `fixture-refs` cases (a) and (b) in `fixture-guard-exec.yaml` still pass.
- [ ] Targeted runs pass: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern dataset-regex` and the same command with `--filter-pattern fixture-refs`.

**Contract:**
- shape (code): CLI `node tests/promptfoo/scripts/check-dataset-regex.js [--probe-invalid]`. Exit 0 = all compile (or probe ran), 1 = an invalid value, 2 = script error (`Script error: <message>` on stderr). Function `scanRegex(root)` returns the JSON below. Datasets come from `require('./check-fixture-refs.js')` `CONFIGS` and `DATASET_RE`.
- names: `scanRegex`, `probeInvalid`, `TYPE_RE = /^\s*-?\s*type:\s*["']?(not-)?regex["']?\s*$/`, `VALUE_RE = /^\s*value:\s*(.*)$/`, flag `--probe-invalid`.
- mirror: `tests/promptfoo/scripts/check-fixture-refs.js:1-96` (REPO_ROOT marker guard, threat-model header, temp-tree probe, JSON line, exit codes); cases `tests/promptfoo/datasets/fixture-guard-exec.yaml:36-49`.
- decisions: text scan with stated gaps; fails safe on what it cannot decode (Key Decisions).
- sync: `check-fixture-refs.js` keeps its CLI output and exit codes byte for byte.

Output (one JSON line):

```
{"ok":false,"configs":2,"datasets":19,"checked":320,
 "invalid":[{"dataset":"datasets/jira-sdlc.yaml","line":439,"value":"(?i)(This …)","error":"Invalid regular expression: … Invalid group"}, …]}
```

Value decoding:

| Raw value form | Decoded as | On failure |
|---|---|---|
| `"..."` (double-quoted) | `JSON.parse(raw)` | reported with `error: "cannot decode double-quoted value: <message>"` |
| `'...'` (single-quoted) | inner text, `''` → `'` | n/a |
| `|`, `>` or empty (block scalar) | not decoded | reported with `error: "block scalar not supported"` |
| other (plain) | trimmed text | n/a |

Each decoded value is compiled with `new RegExp(value)`; a throw adds `{dataset, line, value, error: err.message}`.

`check-fixture-refs.js` change:

```diff
-try {
-  if (process.argv.includes('--probe-missing')) {
+module.exports = { CONFIGS, DATASET_RE };
+
+if (require.main === module) try {
+  if (process.argv.includes('--probe-missing')) {
   …
```

Header threat model for `check-dataset-regex.js` (comment, best effort per F-73):

```
// #9391: every regex/not-regex value in a behavioural or headless dataset must compile with
// new RegExp(value) (promptfoo adds no flags), or the assertion can never pass.
// Threat model: a best-effort lint for dataset authors, a text scan, not a YAML parse. Accepted gaps:
//  - the value must be on the first non-comment line after its type: line (all 320 are);
//  - a value with {{...}} is compiled as written, before promptfoo renders it;
//  - an assertion in a config file (not a dataset) or under defaultTest is not seen;
//  - a JSON-incompatible YAML escape (\x, \ ) is reported as undecodable (fails safe).
```

New dataset `tests/promptfoo/datasets/dataset-regex-exec.yaml`:

```yaml
# Script execution tests for tests/promptfoo/scripts/check-dataset-regex.js (#9391).

- description: "dataset-regex: (a) every regex and not-regex value in the behavioural and headless datasets compiles in JavaScript"
  vars:
    script_path: "repo://tests/promptfoo/scripts/check-dataset-regex.js"
  assert:
    - type: javascript
      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === true && r.invalid.length === 0 && r.configs === 2 && r.datasets >= 19 && r.checked >= 320"

- description: "dataset-regex: (b) an inline-flag regex and an inline-flag not-regex are reported; valid values are not"
  vars:
    script_path: "repo://tests/promptfoo/scripts/check-dataset-regex.js"
    script_args: "--probe-invalid"
  assert:
    - type: javascript
      value: "const r = JSON.parse(output.split('\\n')[0]); r.ok === false && r.checked === 4 && r.invalid.map(i => i.dataset + ':' + i.line).join(',') === 'datasets/a.yaml:3,datasets/b.yaml:3'"
```

The probe tree (built in a `mkdtemp` dir outside `tests/promptfoo/`, removed in `finally`), line by line:

```
promptfooconfig.yaml           tests:\n  - file://datasets/a.yaml
promptfooconfig-headless.yaml  tests:\n  - file://datasets/b.yaml
datasets/a.yaml   1 - assert:
                  2     - type: regex
                  3       value: '(?i)bad'
                  4     - type: regex
                  5       value: 'it''s ok'
datasets/b.yaml   1 - assert:
                  2     - type: not-regex
                  3       value: "(?s)x.*y"
                  4     - type: not-regex
                  5       value: "x\\.y"
```

The reported `line` is the value line, so the expected list is `datasets/a.yaml:3,datasets/b.yaml:3`.

## Final Shape

The behavioural harness reports what really happened.

- When the Claude usage limit is hit, the first refused case shows "claude -p usage limit reached" with the reset time. Every later case fails at once with the same text. No more `claude -p` processes start in that run.

- Any other failed `claude -p` call shows its exit code and the end of its output, not only "Command failed".

- All 320 regex assertions in the behavioural and headless datasets compile in JavaScript. The 21 rewritten ones keep the same meaning: they match exactly the text they matched before, as the original authors intended.

- A new exec case fails and lists the dataset and line of any regex that does not compile.

- The 10 review-sdlc OWASP cases show their diff under "Simulated Project Context". The skill's REFERENCE.md still loads as before.

Nothing in the plugin, its scripts, specs or headless datasets changes.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 1 | 0 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 claude-cli.js: include exit code and stdout tail in the error on a non-zero exit | Task 1 | covered |
| 2 Detect a usage-limit refusal (named constant) and return an error naming the limit and reset text | Task 1 | covered |
| 3 Module-level latch: later calls return the error without spawning claude -p | Task 1 | covered |
| 4 Document the behaviour in tests/promptfoo/README.md | Task 1 | covered |
| 5 Exec cases with a stub claude (limit, latch marker file, normal non-zero exit) | Task 1 | covered |
| 6 Rewrite the 21 inline-flag regex assertions as JS-compatible patterns | Task 2, Task 3 | covered |
| 7 Script and exec case that compile every regex/not-regex value in both configs' datasets | Task 4 | covered |
| 8 Check the 10 review-sdlc OWASP cases' diff wiring; fix or give evidence | Task 2 | covered |
| 9 Out of scope: plugin skills, scripts, specs, assertion content, headless datasets, any claude -p run | — | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
