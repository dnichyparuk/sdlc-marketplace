# Headless Runner and w8a Review Follow-ups Implementation Plan

**Commit:** `feat(#9355): tests - headless runner replaces plugin eval, w8a fixes`
**Goal:**
- Replace the `claude plugin eval` smoke suite, which cannot run on the owner's hosts, with a promptfoo headless runner (`claude -p` stream-json against scaffolded repos) (#9346).
- Port the 8 eval cases and add one commit-sdlc `--subject` case; remove `plugins/sdlc-utilities/evals/` and `experimental.evals`.
- Fix the 6 deferred findings of the PR #74 review (#9356).
**Architecture:** The root problem is that the eval suite depends on a sandboxed harness (bubblewrap, socat, nested user namespaces) that never ran here, so the plugin has no working end-to-end check. A new promptfoo provider builds a fixture repo in a temp dir, runs `claude -p --output-format stream-json` in it, and returns one JSON document (exit code, cost, tool calls with their error flags, a file list and selected file contents); promptfoo `javascript` assertions grade it. The provider is verified only with a stub `claude` first on PATH in the exec config; nobody runs the real headless suite in this wave.
**Source:** conversation context (wave brief w8b; todo items #9346 and #9356; PR #74 review summary at `.sdlc/execution/review-summary-fix-lean-w8a-validators-test-hygiene.comment.md`)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "<pattern>"` (targeted, exec-only) plus the main-session validators

---

## Context

**What problem does this change solve?**

- The plugin has an end-to-end smoke suite under `plugins/sdlc-utilities/evals/` for `claude plugin eval`. That harness needs an OS sandbox. On this host the sandbox cannot start (#9150, #9285), so the suite has never run through it.
- Its graders cannot check an exit code (#9279) and can only guess what ship did, because a finished ship deletes its ledger (#9149).
- The PR #74 review left 2 medium and 4 low findings unfixed (#9356).

**What prompted this change now?**

- The owner wrote on 2026-11-11: "skip eval since it doesn't work. concider replacing it with headless run". The architect strongly recommended the same.
- The w8a ship review produced the deferred findings.

**What does success look like?**

- `tests/promptfoo/promptfooconfig-headless.yaml` holds 9 cases. The 5 cheap cases run by default; the 4 costly cases run only with `SDLC_HEADLESS_COSTLY=1`.
- Exec-only cases prove the provider with a stub `claude`: the argv, the cwd, the stream parsing, the snapshot, the cleanup, the costly gate and the error paths.
- `plugins/sdlc-utilities/evals/` and `experimental.evals` are gone. AGENTS.md, the tests README and `docs/architecture.md` describe the headless runner.
- The R94 keep match accepts paths with punctuation; `run-schema-truth.js` no longer leaks its temp dir; the four doc and spec wording findings are fixed.

**Credentials rule for this wave.** The headless runner spends model credentials. Nobody runs it in this wave: not the planner, not ship, not its workers. Every task verifies with exec-only cases (a stub `claude` first on PATH), YAML parsing, and `promptfoo validate config`, which makes no model call.

**PR body.** The PR body must say that the AGENTS.md change (Task 7) needs owner approval before merge. Its `## Github Issue` section names tracking id #9355, items #9346 and #9356, and the absorbed items #9149, #9150, #9179, #9279 and #9285, as PR #74 did for #9350. These are internal tracker ids, not GitHub issues (`gh issue view 9346` finds no issue), so the body uses no `Fixes`/`Closes` keyword: it would link to issues that do not exist.

**Re-verification at HEAD 31a1b5e.** Every item still reproduces; none is dropped.

| Item | Evidence at HEAD |
|---|---|
| #9346 eval suite | `git ls-files plugins/sdlc-utilities/evals` lists 25 files; `plugin.json:8-10` has `experimental.evals`; `AGENTS.md:47` holds the exception |
| R94 match (medium) | `plugins/sdlc-utilities/scripts/skill/ship.js:2557-2559` splits the prompt on `/[\s"'`,:\[\]{}()]+/` and keeps only whole tokens |
| schema-truth leak (medium) | `tests/promptfoo/scripts/run-schema-truth.js:69-72` calls `process.exit(2)` inside `try`, so `finally` (line 81-83) never removes `T` |
| pr-sdlc placement (low) | `docs/skills/pr-sdlc.md:253` `### gh pr create warnings` sits under `## GitHub Multi-Account Support` (line 220) |
| ship-sdlc wording (low) | `docs/skills/ship-sdlc.md:231` says "commit-fixes stages those files" |
| R83 / R94 spec wording (low, 2) | `docs/specs/ship-sdlc.md:203` R83 has no R94 exception; line 205 R94 says "a path changed later" |

## Research Findings

**The eval suite (F-eval-suite-port-inventory-2 to -8).** Each of the 8 cases is three files: `prompt.md` (turn and time limits, allowed tools, one slash command), `case.yaml` (graders) and a 5-line `scaffold.sh`. Every `scaffold.sh` calls one shared builder, `evals/_fixture/build-fixture-repo.js`, with a kind (`commit`, `commit-crlf`, `review`, `execute`, `ship`, `ship-clean`, `plan`). The builder makes a git repo in an empty directory, commits once on `main`, deletes `.git/COMMIT_EDITMSG`, and switches to `eval-<kind>`. Graders are `regex` on a file, `file_exists` with globs, and one `tool_used` check. No grader uses a model.

**Cost tiers (F-eval-suite-port-inventory-3 to -7).** Cheap: `commit-auto`, `crlf-checkout`, `review-dry-run`, `ship-dry-run`. Costly: `execute-two-task`, `ship-auto-commit-review`, `ship-review-zero-findings`, and `plan-sdlc` (the most expensive, 2400 s).

**Providers (F-headless-provider-and-stub-testing-1 to -8).** `tests/promptfoo/providers/claude-cli.js` is a class with `id()` and `async callApi(prompt, context)`. It runs a bare `claude` from PATH, so a stub first on PATH replaces it with no code change. `tests/promptfoo/scripts/run-claude-cli-enoent-retry.js` is the template for a stub-driven exec case. The exec config lists datasets by hand and runs in pre-push and the Taskfile, so the headless config must stay out of both.

**Claude CLI facts (probed with `--help` only, CLI 2.1.317).** `--output-format stream-json` (needs `--verbose` with `-p`), `--plugin-dir`, `--allowedTools`, `--max-budget-usd` and `--no-session-persistence` exist. `--max-turns` is not in the help text, so the port does not rely on it.

**promptfoo facts (0.123.1, `--help` only).** `promptfoo validate config -c <file>` validates a config without calling a provider (tried on `promptfooconfig-exec-hooks.yaml`: "Configuration is valid."). `eval` has `--filter-pattern` and `--filter-metadata`.

**Validators (F-eval-reference-and-validator-sweep-6 to -13).** No validator reads `experimental.evals` or `evals/`: not `check-consistency.js`, not `check-docs-consistency.js`, and none of `scripts/ci/validate-*.js`. `schemas/plugin.schema.json` is not read by any script. The references to update are prose: `AGENTS.md:47`, `docs/architecture.md:66` and `:194`, the site copy of `architecture.md`, `tests/promptfoo/README.md:65-95`, `schemas/plugin.schema.json:27-35` and `.gitignore:6`. Historical plans and CHANGELOG lines stay. The CHANGELOG entry comes from the ship version step.

**Site copies.** `site/scripts/copy-docs.mjs` copies `docs/` to `site/src/content-source/`, and the copies are committed. Today `architecture.md`, `skills/ship-sdlc.md`, `skills/pr-sdlc.md` and `specs/ship-sdlc.md` are byte-identical to their `docs/` sources (`cmp`), so each doc task copies the edited file over its site copy.

**Fixture guard (F-headless-provider-and-stub-testing-9).** `check-fixture-guard.js` scans only `setup.sh` files under `fixtures-fs/`. The moved builder is a Node script, so it carries the same refusal in code.

**PR #74 findings (F-pr74-deferred-review-fixes-1 to -6).** The review file named in the todo item is not in the tree. The full review text is in `.sdlc/execution/review-summary-fix-lean-w8a-validators-test-hygiene.comment.md`. The plan uses that text. `stageScope` reads `git status --porcelain -z` (`ship.js:1464`), so paths reach the R94 match raw, while the received-review prompt carries them as JSON strings. The `ship-scope-keep:` cases drive the match through `run-ship-stepper.js` and the canned `results/received-review-scope.json` from `fixtures-fs/project-ship-stepper/setup.sh:184`. `script-runner.js` splits `script_args` on whitespace, so a test path cannot contain a space; a path with parentheses tests the same code path.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Review file path | no | reads the review from `.sdlc/execution/review-summary-fix-lean-w8a-validators-test-hygiene.comment.md` | the `.sdlc/reviews/` file named in the todo does not exist; the summary holds the same 6 findings |
| Case split "5 cheap + 3 execute/ship" | no | 5 cheap default cases, 4 costly cases (the 3 execute/ship ones plus `plan-sdlc`) | there are 9 cases; `plan-sdlc` is the most expensive, so it cannot be a default case |
| Turn limits | no | drops `max_turns`; keeps a wall-clock timeout and adds `--max-budget-usd` per case | `--max-turns` is not in the CLI 2.1.317 help; the budget flag is documented |
| `scaffold.sh` files | no | not ported; the provider calls the moved builder with a `scaffold` kind var | the scripts were 5-line wrappers around the builder |
| Space-in-path test | no | the new R94 exec case uses `(g)/out.txt`, not a path with a space | `script-runner.js` splits `script_args` on whitespace; the JSON-string match covers spaces and punctuation the same way |
| Directory deletion | no | lists the 24 deleted eval files one by one under `Modify:` (delete) in Task 4 | the plan format has no `Delete:` kind; ship stages only paths named in the plan |
| Commit `--expected-subject` mismatch (E9/E10) | no | the one new case passes the same text to `--subject` and `--expected-subject`; no mismatch case | the brief allows one new case only |

## Decisions taken without the owner

No owner was available. Each choice below took the recommended or most conservative option.

1. Costly cases are gated by `SDLC_HEADLESS_COSTLY=1` inside the provider, not by a second config. One config stays the single entry point, and a run without the variable cannot spend on a costly case.
2. `plan-sdlc` is a costly case (4 costly, not 3).
3. Turn limits are replaced by `--max-budget-usd` plus the timeout.
4. The builder moves to `tests/promptfoo/fixtures-headless/build-fixture-repo.js`, and `fixtures-headless/` holds only that builder.
5. The R94 fix keeps the whole-token match and adds a JSON-string match, as the review suggested.
6. The schema-truth fix returns through `finally` with `process.exitCode = 2`, and a top-level catch maps a schema read error to exit 2.
7. The AGENTS.md exception keeps the owner's original approval date and adds the 2026-11-11 change.

## Key Decisions

- **One provider that returns JSON, graded by `javascript` assertions, over a port of the eval grader types.** The old graders were regex-on-file, file-exists and tool-used. One JSON document with `files`, `contents` and `toolUses` covers all three. Plain JS assertions need no custom grader code. (F-eval-suite-port-inventory-2, F-headless-provider-and-stub-testing-2)

- **Snapshot inside the provider, then delete the workspace.** promptfoo assertions run after the provider returns. If the provider kept the temp dir, nothing would remove it. So the provider lists the files and reads the named ones first, then deletes the dir in `finally`. (F-eval-suite-port-inventory-4)

- **Tool results paired with tool calls.** The provider matches each `tool_result` to its `tool_use` by id and records `isError`. This gives the exit-code check that #9279 asked for: the plan-sdlc case asserts that the `--final` format gate call did not fail. (F-eval-suite-port-inventory-7)

- **Ship outcomes observed, not inferred (#9149).** `ship-review-zero-findings` asserts from the stream that no agent with `subagent_type` `sdlc:ship-step-received-review` was dispatched. That is the gate's skip, seen directly.

- **No sandbox needed (#9150, #9285).** `claude -p` runs Bash without the eval harness sandbox, so bubblewrap, socat and nested user namespaces no longer matter.

- **Stub `claude` on PATH over a code seam.** The provider runs a bare `claude`, like `claude-cli.js`. The exec cases put `fixtures-fs/stub-bin-claude/bin` first on PATH. The provider has no test-only branch. (F-headless-provider-and-stub-testing-1, -5, -6)

- **The builder refuses to run inside a git work tree.** It mirrors the `setup.sh` guard of #9161, so a wrong cwd cannot rewrite this repo's `.git/config`. (F-headless-provider-and-stub-testing-9)

- **Mechanical tasks stay Trivial even with several files.** Tasks 4, 5, 8, 11 and 12 are deletions, JSON key removals, wording edits and `cp` of a doc to its site copy; none needs design judgement, so the cheaper worker fits.

- **One Trivial task deletes all 24 eval files, above the 5-file guideline.** It is one `git rm` of a directory that nothing reads. Splitting it would add execute waves and no safety. (F-eval-reference-and-validator-sweep-8)

- **Smallest viable cut.** The minimum is the provider, the config and the 9 cases, plus the removal and doc truth. The PR #74 fixes ride along because the wave brief bundles them (#9356). No CHANGELOG task: the ship version step writes it.

- **Who fails if this ships wrong.** The owner, at the next pre-release check: a broken provider makes the headless suite report wrong results, and a wrong R94 fix makes a ship run stop again at `stage_fixes`. Plugin users are not affected by the test files; they are affected only by the `ship.js` change.

- **Workspace modes.** The provider and builder work in a fresh `os.tmpdir()` dir and find the repo root from `__dirname`. They behave the same under `ship.workspace=branch` and `worktree`. The `ship.js` change only widens a string match; it adds no state write and no path logic.

**Non-goals.** No real headless or behavioural run. No new case beyond the 8 ports and the commit `--subject` case. No E9 mismatch case. No change to `claude-cli.js`. No CI or pre-push wiring for the headless config. No jira or GitHub-issues work (waves 4 and 5). No fix for the `#9353` id in the ship spec appendix (not in the review).

## Contract Examples

```markdown
**Contract:**
- shape (code): `class HeadlessCaseProvider { id(): 'headless-case'; async callApi(prompt, context): { output: string, cost?: number } | { error: string } }`.
- names: `HeadlessCaseProvider`, vars `scaffold`, `allowed_tools`, `timeout_seconds`, `max_budget_usd`, `tier`, `snapshot_files`.
- mirror: `tests/promptfoo/providers/claude-cli.js:26-48`.
- decisions: JSON output graded by javascript assertions (Key Decisions).
- sync: `tests/promptfoo/promptfooconfig-headless.yaml` provider id.
```

```markdown
**Contract:**
- shape (docs): MODIFY `tests/promptfoo/README.md`; replace `## Eval smoke suite (local, pre-release)` with `## Headless runner (credentialed, owner-initiated)`.
- names: heading `## Headless runner (credentialed, owner-initiated)`.
- mirror: the section layout at `tests/promptfoo/README.md:65-95`.
- decisions: owner-only, never CI or pre-push.
- sync: `AGENTS.md` exception text, `docs/architecture.md` Testing paragraph.
```

```markdown
**Contract:**
- shape (openspec): MODIFY R83 in `docs/specs/ship-sdlc.md` to name the R94 exception; MODIFY R94's refusal sentence to say "a path first changed after the question".
- names: `R83`, `R94` (no new ids).
- mirror: requirement style at `docs/specs/ship-sdlc.md:203-206`.
- decisions: wording only; behaviour unchanged.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Tasks 1, 2, 9 and 10 changing code or test scripts add exec promptfoo cases; Task 3 is verified by exec cases and config validation; the other tasks are deletions, manifest changes or docs |
| no-ci-bypass | error | PASS | No step skips or disables CI; the headless config is kept out of CI and pre-push |
| no-auto-eval | error | PASS | Only targeted exec-only, stub-based --filter-pattern runs; the headless config is never run; no retry loops |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | The PR #74 fixes are bundled by the wave brief and justified in Key Decisions; non-goals are listed |
| single-responsibility-tasks | warning | PASS | Doc fixes split into Tasks 11 and 12; the plan file rides in the last task only so ship stages it |
| scripts-over-llm-logic | error | PASS | No skill instructions are edited; logic lives in scripts and the provider |
| yagni | warning | PASS | Provider vars and the --scope-result flag are each used by a case |
| cross-skill-consistency | error | PASS | The ship.js R94 change is mirrored in spec, docs and stepper tests; the commit --subject case is aligned with commit-sdlc |
| pr-link-github-issue | error | PASS | No GitHub issue is addressed: #9346, #9355, #9356 are internal tracker ids (no such GitHub issues); the PR body names them in its Github Issue section (Context) |
| dry | warning | PASS | The single builder is reused; the provider is shared by all cases |
| kiss | warning | PASS | One provider, JSON output and plain JS assertions |
| spec-first | error | PASS | No SKILL.md change; the spec task (Task 8) precedes the ship.js task (Task 9) |
| project-agnostic | error | PASS | The behavioural change is in plugin code (ship.js); the repo-local edits only remove this repo's own eval harness |
| flag-coherence-cross-skill | error | PASS | No SKILL.md flag gating is added |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates are touched |
| flag-resolution-single-source | warning | PASS | No flag re-derivation is introduced |
| state-premise | error | PASS | The Architecture section states the root problem in one sentence |
| smallest-viable-cut | warning | PASS | The minimum cut and the extra tasks are justified in Key Decisions |
| failure-audience | warning | PASS | Names the owner and ship users as the ones affected |
| explicit-non-goals | warning | PASS | A Non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded in 'Decisions taken without the owner' and Key Decisions |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are added in SKILL.md; the provider only drives the claude CLI in tests |
| flag-semantic-consistency-cross-skill | error | PASS | --scope-result is added to a test helper, not a user-invoked skill prepare script |
| workspace-mode-compatibility | error | PASS | Plan states behaviour is identical under branch and worktree; no state writes or .claude/ hardcoding |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts or prepare output |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (U3, U2)

**Why:** Task 6 and Task 11 edit docs/architecture.md and docs/skills/pr-sdlc.md and docs/skills/ship-sdlc.md, plus byte copies under site/src/content-source/, so the dimension's triggers should match the renamed doc paths.

**Severity hint:** high

**Patch:** update triggers naming `docs/skills` after the rename

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — update triggers naming `docs/skills` after the rename

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: release-consistency (B1)

**Why:** Task 5 removes `experimental` from plugins/sdlc-utilities/.claude-plugin/plugin.json and schemas/plugin.schema.json, which is a manifest contract change.

**Severity hint:** high

**Patch:** Add a checklist item that removing a plugin.json field (experimental.evals) is mirrored in schemas/plugin.schema.json and docs, and that the version bump is left to the ship version step.

**Action (dimension):** edit `.sdlc/review-dimensions/release-consistency.md` — Add a checklist item that removing a plugin.json field (experimental.evals) is mirrored in schemas/plugin.schema.json and docs, and that the version bump is left to the ship version step.

### UPDATE: runtime-contract (B1)

**Why:** Task 2 introduces env var `SDLC_HEADLESS_COSTLY`, `STUB_CLAUDE_MODE`/`STUB_CLAUDE_LOG` and the `claude -p --output-format stream-json` argv contract in tests/promptfoo/providers/headless-case.js.

**Severity hint:** high

**Patch:** Add checklist items for the headless provider contract: env var SDLC_HEADLESS_COSTLY gate, STUB_CLAUDE_MODE and STUB_CLAUDE_LOG, the claude -p stream-json argv, and the output document field names.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add checklist items for the headless provider contract: env var SDLC_HEADLESS_COSTLY gate, STUB_CLAUDE_MODE and STUB_CLAUDE_LOG, the claude -p stream-json argv, and the output document field names.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_4 additional candidates suppressed_

## Tasks

### Task 1: Move the fixture builder to fixtures-headless and add its exec cases

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-headless/build-fixture-repo.js`
- Modify: `plugins/sdlc-utilities/evals/_fixture/build-fixture-repo.js` — delete it: `git mv` to the new path
- Create: `tests/promptfoo/scripts/run-headless-case-stub.js`
- Create: `tests/promptfoo/datasets/headless-runner-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — add `file://datasets/headless-runner-exec.yaml` to `tests:`

**Notes:** Implements #9346 "move scaffolds" (F-eval-suite-port-inventory-8, F-headless-provider-and-stub-testing-6, -9). `git mv` keeps history. The move brings the builder under `tests/promptfoo/`, where the #9161 rule holds for every fixture that runs `git init`; the guard keeps it compliant. Never run `claude`, `claude -p` or the headless config in this task.

**Acceptance criteria:**
- [ ] `git status` shows the builder as renamed to `tests/promptfoo/fixtures-headless/build-fixture-repo.js`; nothing else remains under `plugins/sdlc-utilities/evals/_fixture/`.
- [ ] The builder header says it builds a fixture for a headless runner case (`providers/headless-case.js`); it no longer names `claude plugin eval` or `scaffold.sh`.
- [ ] Run inside a git work tree, the builder prints `refusing: inside a git work tree` to stderr and exits 2 before any git command.
- [ ] The three `headless-runner: scaffold` exec cases pass with the pinned command below.

**Contract:**
- shape (code): builder CLI unchanged: `node build-fixture-repo.js <commit|commit-crlf|review|execute|ship|ship-clean|plan>`; exit 0 ok, 1 git failure, 2 usage, non-empty dir, or inside a work tree. The guard is the first check in `main()` after the kind check:
  ```diff
     const cwd = process.cwd();
  +  // #9161: never git init/config inside an existing work tree.
  +  const inside = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio: 'ignore' });
  +  if (inside.status === 0) {
  +    process.stderr.write('refusing: inside a git work tree\n');
  +    return 2;
  +  }
     if (fs.readdirSync(cwd).length > 0) {
  ```
  Wrapper `run-headless-case-stub.js --scenario <name> [--kind <kind>]` prints one JSON line. Scenarios in this task:

  | Scenario | Does | Prints |
  |---|---|---|
  | `scaffold` | mkdtemp D, run the builder with `--kind` in D | `{"exit":0,"stdout":"fixture commit: …","branch":"eval-commit","staged":["README.md"]}` |
  | `scaffold-in-worktree` | mkdtemp D, `git init -q` D, mkdir `D/sub`, run the builder in `D/sub` | `{"exit":2,"stderr":"refusing: inside a git work tree\n","gitDirs":[]}` (`gitDirs`: any `.git` under `D/sub`) |

  The wrapper removes D in `finally`.
- names: `run-headless-case-stub.js`, scenarios `scaffold`, `scaffold-in-worktree`; case descriptions `headless-runner: scaffold (a) commit kind builds eval-commit with README staged`, `headless-runner: scaffold (b) refuses inside a work tree`, `headless-runner: scaffold (c) unknown kind exits 2`.
- mirror: `tests/promptfoo/scripts/run-claude-cli-enoent-retry.js:1-28` (wrapper), `tests/promptfoo/datasets/script-runner-stub-bin-exec.yaml:45-53` (case shape).
- decisions: the builder keeps its exit-code contract; the guard reuses exit 2.
- sync: `tests/promptfoo/providers/headless-case.js` (Task 2) calls the builder at this path.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "headless-runner: scaffold"` → 3 passed. Exec-only; no model call.

### Task 2: Headless provider, stub claude and provider exec cases

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/providers/headless-case.js`
- Create: `tests/promptfoo/fixtures-fs/stub-bin-claude/bin/claude`
- Modify: `tests/promptfoo/scripts/run-headless-case-stub.js` — add the `provider` scenario
- Modify: `tests/promptfoo/datasets/headless-runner-exec.yaml` — add the five `headless-runner: provider` cases

**Notes:** Implements #9346 provider (F-eval-suite-port-inventory-9, F-headless-provider-and-stub-testing-1 to -6, -12) and the #9149 and #9279 observation needs (Key Decisions). The stub needs mode 755 (`chmod +x`, committed as executable). Never run the real `claude` or the headless config: every check uses the stub.

**Acceptance criteria:**
- [ ] The provider matches the call order and output schema below.
- [ ] A costly case without `SDLC_HEADLESS_COSTLY=1` returns an error and starts neither the builder nor `claude`.
- [ ] The workspace dir is removed on every path, including a scaffold failure and a crash.
- [ ] The five `headless-runner: provider` cases pass with the pinned command below, and the three Task 1 cases still pass.

**Contract:**
- shape (code): `module.exports = class HeadlessCaseProvider { id() { return 'headless-case'; } async callApi(prompt, context) }`. Vars from `context.vars`:

  | Var | Type | Default | Use |
  |---|---|---|---|
  | `scaffold` | string | required | builder kind |
  | `allowed_tools` | string, comma list | required | `--allowedTools` value |
  | `timeout_seconds` | number | 600 | kill after this many seconds (SIGTERM) |
  | `max_budget_usd` | number | 2 | `--max-budget-usd` value |
  | `tier` | `cheap` \| `costly` | `cheap` | costly needs env `SDLC_HEADLESS_COSTLY=1` |
  | `snapshot_files` | string[] | `[]` | workspace-relative files whose text goes to `contents` |

  Call order:
  1. `tier === 'costly'` and `process.env.SDLC_HEADLESS_COSTLY !== '1'` → return `{ error: 'costly case skipped: set SDLC_HEADLESS_COSTLY=1 to run it' }`.
  2. `W = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-headless-'))`; run `node <repo>/tests/promptfoo/fixtures-headless/build-fixture-repo.js <scaffold>` with cwd W.
  3. Spawn `claude` (bare name, PATH lookup) with cwd W, env = `process.env` minus `CLAUDECODE`, the prompt on stdin, args `-p --output-format stream-json --verbose --no-session-persistence --plugin-dir <repo>/plugins/sdlc-utilities --max-budget-usd <n> --allowedTools <list>`.
  4. Parse stdout line by line as JSON (skip lines that do not parse): `assistant` message `tool_use` items → `toolUses[]`; `user` message `tool_result` items → set `isError` on the `toolUses` entry with the same id; the `result` event → `costUsd` (`total_cost_usd`), `resultSubtype`, `is_error`.
  5. Snapshot W: every file path relative to W, posix separators, sorted, `.git/objects/` skipped → `files`; the text of each existing `snapshot_files` entry → `contents`.
  6. `fs.rmSync(W, { recursive: true, force: true })` in `finally`.

  Output on a finished run, `{ output: JSON.stringify(doc), cost: doc.costUsd ?? undefined }`:
  ```json
  { "workspace": "/tmp/sdlc-headless-Ab12", "exitCode": 0, "signal": null, "timedOut": false,
    "isError": false, "costUsd": 0.0123, "resultSubtype": "success",
    "toolUses": [ { "id": "t1", "name": "Bash", "input": { "command": "echo hi" }, "isError": false } ],
    "files": [ ".git/HEAD", "…", "README.md", "stub-touched.txt" ],
    "contents": { "README.md": "# Eval fixture\n…Second line.\n" },
    "stderrTail": "" }
  ```
  `isError` is true when there is no `result` event, the result has `is_error: true`, or the exit code is not 0. `stderrTail` is the last 2000 characters of stderr.

  Error returns:

  | Condition | Return |
  |---|---|
  | costly without the env var | `{ error: 'costly case skipped: set SDLC_HEADLESS_COSTLY=1 to run it' }` |
  | builder exit not 0 | `{ error: 'scaffold failed (exit <n>): <stderr>' }` |
  | `claude` not on PATH (ENOENT) | `{ error: 'claude not found on PATH' }` |
  | timeout | output document with `timedOut: true`, `isError: true` |
  | exit not 0 without a result | output document with `exitCode: <n>`, `costUsd: null`, `isError: true` |

  Stub `claude` (bash): appends one JSON line `{"argv":[…],"cwd":"…","claudecode":<bool>}` to `$STUB_CLAUDE_LOG` when it is set, reads stdin to the end, then by `$STUB_CLAUDE_MODE`:

  | Mode | stdout | Side effect | Exit |
  |---|---|---|---|
  | `ok` (default) | `system` init line; `assistant` with `tool_use` `t1` Bash `{"command":"echo hi"}`; `user` with `tool_result` `t1` `is_error:false`; `result` `subtype:"success"`, `is_error:false`, `total_cost_usd:0.0123`, `num_turns:2` | `touch stub-touched.txt` in cwd | 0 |
  | `error` | init line; `result` `subtype:"error_max_budget_usd"`, `is_error:true`, `total_cost_usd:0.5` | none | 1 |
  | `crash` | nothing; `boom` on stderr | none | 3 |

  Wrapper scenario `provider`: flags `--mode <ok|error|crash>`, `--kind <kind>`, `--tier <cheap|costly>`. It sets `PATH=<repo>/tests/promptfoo/fixtures-fs/stub-bin-claude/bin:<PATH>`, `CLAUDECODE=1`, `STUB_CLAUDE_MODE`, `STUB_CLAUDE_LOG=<mkdtemp>/log.jsonl`, deletes `SDLC_HEADLESS_COSTLY`, calls `callApi('stub prompt', { vars: { scaffold, allowed_tools: 'Read,Bash', tier, snapshot_files: ['README.md'] } })`, and prints `{ "result": <parsed output or null>, "error": <string or null>, "log": [<stub lines>], "workspaceGone": <bool> }`.
- names: `HeadlessCaseProvider`, `headless-case`, env `SDLC_HEADLESS_COSTLY`, `STUB_CLAUDE_MODE`, `STUB_CLAUDE_LOG`; case descriptions `headless-runner: provider (a) ok run`, `(b) error result`, `(c) crash without result`, `(d) costly case is gated`, `(e) scaffold failure`.
- mirror: `tests/promptfoo/providers/claude-cli.js:5-48` (class shape, CLAUDECODE removal, stdin EPIPE guard); `tests/promptfoo/fixtures-fs/stub-bin-gh/bin/gh` (stub style).
- decisions: no ENOENT retry (a missing CLI is a setup error for an owner run); JSON output (Key Decisions).
- sync: the field names above are the ones the Task 3 assertions read.
- example: case (a) asserts `log[0].argv` contains `-p`, `stream-json`, `--verbose`, `--no-session-persistence`, `--plugin-dir`, `--max-budget-usd`, `--allowedTools`; `log[0].claudecode === false`; `path.basename(log[0].cwd)` starts with `sdlc-headless-`; `result.toolUses[0]` is `{id:'t1',name:'Bash',isError:false,…}`; `result.files` includes `stub-touched.txt`; `result.contents['README.md']` ends with `Second line.\n`; `result.costUsd === 0.0123`; `workspaceGone === true`. Case (d) asserts `error` names `SDLC_HEADLESS_COSTLY` and `log` is empty. Case (e) uses `--kind nope` and asserts `error` starts with `scaffold failed (exit 2)` and `workspaceGone === true`.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "headless-runner:"` → 8 passed. Exec-only; the stub replaces `claude`; no model call.

### Task 3: Headless config and the 9 ported cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** build

**Files:**
- Create: `tests/promptfoo/promptfooconfig-headless.yaml`
- Create: `tests/promptfoo/datasets/headless-cheap.yaml`
- Create: `tests/promptfoo/datasets/headless-costly.yaml`

**Notes:** Implements #9346 "port the 8 eval cases + commit --subject case", #9179 (commit `--subject`), #9149 and #9279 (F-eval-suite-port-inventory-3 to -7, -10). Assertions translate each `case.yaml` grader one to one, plus the two new direct observations. Do NOT run this config: verify with YAML parsing and `promptfoo validate config` only.

**Acceptance criteria:**
- [ ] The config lists both datasets, uses provider `file://providers/headless-case.js`, prompt `{{prompt}}`, and `evaluateOptions.maxConcurrency: 1`; a header comment says it is credentialed and owner-initiated only, and that costly cases need `SDLC_HEADLESS_COSTLY=1`.
- [ ] `headless-cheap.yaml` has 5 cases and `headless-costly.yaml` has 4, matching the table below; every case has `metadata.tier` equal to its `vars.tier`.
- [ ] Every old grader has an assertion, as in the table.
- [ ] From `tests/promptfoo`, `npx --yes -p js-yaml@4.1.0 js-yaml <file> > /dev/null` exits 0 for each of the 3 files, and `npx --yes promptfoo@0.123.1 validate config -c promptfooconfig-headless.yaml` prints `Configuration is valid.`
- [ ] `snapshot_files` per case: commit and ship cases `[".git/logs/HEAD", ".git/COMMIT_EDITMSG"]` (commit cases) or `[".git/logs/HEAD"]` (ship cases); `ship-review-zero-findings` adds `.sdlc/execution/review-summary-eval-ship.json` (the `ship-clean` kind also uses branch `eval-ship`, so the summary name is the same); `plan-sdlc` `["docs/plans/eval-plan-sdlc.md"]`; the others `[]`. Each case's assertion code is self-contained (no shared helper file).

**Contract:**
- shape (code): each case is

  ```yaml
  - description: "headless: commit-auto"
    metadata: { tier: cheap }
    vars:
      prompt: "/sdlc:commit-sdlc --auto"
      scaffold: commit
      allowed_tools: "Read,Glob,Grep,Skill,Agent,Write,Bash"
      timeout_seconds: 600
      max_budget_usd: 2
      tier: cheap
      snapshot_files: [".git/logs/HEAD", ".git/COMMIT_EDITMSG"]
    assert:
      - type: javascript
        value: |
          const o = JSON.parse(output);
          if (o.isError) return `FAIL: run error ${o.resultSubtype} exit ${o.exitCode}`;
          …
  ```

  Cases (`B` = `Read,Glob,Grep,Skill`; a check fails with a `FAIL: <reason>` string):

  | Case | Tier | Scaffold | Prompt | Tools | Timeout s / budget $ | Assertions |
  |---|---|---|---|---|---|---|
  | `commit-auto` | cheap | `commit` | `/sdlc:commit-sdlc --auto` | B,Agent,Write,Bash | 600 / 2 | exactly one `\tcommit: ` in `.git/logs/HEAD`; `.git/COMMIT_EDITMSG` matches `^(feat\|fix\|docs\|chore)(\([a-z0-9-]+\))?: \S` |
  | `crlf-checkout` | cheap | `commit-crlf` | same | same | 600 / 2 | same two |
  | `commit-subject` | cheap | `commit` | `/sdlc:commit-sdlc --auto --subject "docs(readme): add the second fixture line" --expected-subject "docs(readme): add the second fixture line"` | same | 600 / 2 | one new commit; first line of `.git/COMMIT_EDITMSG` equals the subject exactly |
  | `review-dry-run` | cheap | `review` | `/sdlc:review-sdlc --dry-run --staged` | B,Bash | 600 / 2 | a `files` entry matches `^\.sdlc/execution/out/review-manifest-.*\.json$`; none matches `^\.sdlc/execution/review-summary-`, `^\.sdlc/reviews/`, `^docs/` |
  | `ship-dry-run` | cheap | `ship` | `/sdlc:ship-sdlc --dry-run --plan docs/plans/eval-plan.md --steps execute,commit,review --rebase skip --quality minimal` | B,TodoWrite,Bash | 600 / 2 | `^\.sdlc/execution/out/ship-prepare-.*\.json$` present; `^\.sdlc/execution/ship-.*\.json$` absent; no `\tcommit: ` in `.git/logs/HEAD`; no `^\.git/refs/tags/` entry |
  | `execute-two-task` | costly | `execute` | `/sdlc:execute-plan-sdlc docs/plans/eval-plan.md --auto --quality minimal --rebase skip` | B,Agent,TodoWrite,Write,Edit,Bash | 1200 / 3 | `notes/one.txt` and `notes/two.txt` present; `^\.sdlc/execution/execute-.*\.json$` absent |
  | `ship-auto-commit-review` | costly | `ship` | `/sdlc:ship-sdlc --auto --plan docs/plans/eval-plan.md --steps execute,commit,review --rebase skip --quality minimal` | B,Agent,TodoWrite,Write,Edit,Bash | 1800 / 5 | a `\tcommit: ` line in `.git/logs/HEAD`; `.sdlc/execution/review-summary-eval-ship.json` present; no `^\.sdlc/execution/ship-.*\.json$`; no `.sdlc/execution/.stop-cap-exhausted-eval-ship.json` |
  | `ship-review-zero-findings` | costly | `ship-clean` | same as above | same | 1800 / 5 | the review summary (in `snapshot_files`) parses as JSON with `verdict` in `APPROVED`, `APPROVED WITH NOTES`, `CHANGES REQUESTED` and `counts.critical === 0`, `counts.high === 0`; no `toolUses` entry with `name === 'Agent'` and `input.subagent_type === 'sdlc:ship-step-received-review'` (#9149) |
  | `plan-sdlc` | costly | `plan` | the old prompt text from `evals/plan-sdlc/prompt.md` verbatim | B,Agent,TodoWrite,Bash,Write,Edit | 2400 / 5 | `docs/plans/eval-plan-sdlc.md` present; a `Bash` `toolUses` entry whose `input.command` matches `validate-plan-format\.js[\s\S]*--final` with `isError === false` (#9279); exactly one `**Verdict:** ` line in the plan (in `snapshot_files`) |

- names: `promptfooconfig-headless.yaml`, `headless-cheap.yaml`, `headless-costly.yaml`, descriptions `headless: <case>`.
- mirror: `tests/promptfoo/promptfooconfig-exec-hooks.yaml:1-22` (config shape); old graders in `plugins/sdlc-utilities/evals/*/case.yaml`.
- decisions: costly gate in the provider (Decisions taken without the owner, 1); no turn limits (3).
- sync: var and field names from Task 2; the commit subject matches the builder's `subjectPattern`.

**Verification:** from `tests/promptfoo`: the `js-yaml@4.1.0` parse of the 3 files and `npx --yes promptfoo@0.123.1 validate config -c promptfooconfig-headless.yaml` → `Configuration is valid.`; then `npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "headless-runner:"` → 8 passed. Never `promptfoo eval -c promptfooconfig-headless.yaml`.

### Task 4: Delete the eval suite cases

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 3
**Verify:** build

**Files:**
- Modify: `plugins/sdlc-utilities/evals/commit-auto/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/commit-auto/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/commit-auto/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/crlf-checkout/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/crlf-checkout/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/crlf-checkout/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/execute-two-task/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/execute-two-task/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/execute-two-task/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/plan-sdlc/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/plan-sdlc/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/plan-sdlc/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/review-dry-run/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/review-dry-run/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/review-dry-run/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-auto-commit-review/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-auto-commit-review/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-auto-commit-review/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-dry-run/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-dry-run/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-dry-run/scaffold.sh` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-review-zero-findings/case.yaml` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-review-zero-findings/prompt.md` — delete
- Modify: `plugins/sdlc-utilities/evals/ship-review-zero-findings/scaffold.sh` — delete

**Notes:** Implements #9346 "remove plugins/sdlc-utilities/evals/" (F-eval-reference-and-validator-sweep-8). Above the 5-file guideline on purpose (Key Decisions). Task 3 must have ported the cases first.

**Acceptance criteria:**
- [ ] `git rm -r plugins/sdlc-utilities/evals` removes exactly the 24 files above (the builder already moved in Task 1).
- [ ] `git ls-files plugins/sdlc-utilities/evals` prints nothing, and the directory is gone from disk (including any untracked `results/`).

**Contract:**
- shape (code): deletion only; `git rm -r -q plugins/sdlc-utilities/evals` then `rm -rf plugins/sdlc-utilities/evals`.
- names: the 24 paths above.
- mirror: `git ls-files plugins/sdlc-utilities/evals` at HEAD 31a1b5e.
- decisions: one deletion task (Key Decisions).
- sync: Task 5 removes the manifest field that pointed here.

**Verification:** `git ls-files plugins/sdlc-utilities/evals | wc -l` → 0; `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.

### Task 5: Drop experimental.evals from the manifest, schema and gitignore

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 4
**Verify:** build

**Files:**
- Modify: `plugins/sdlc-utilities/.claude-plugin/plugin.json` — remove `experimental`
- Modify: `schemas/plugin.schema.json` — remove the `experimental` property
- Modify: `.gitignore` — remove `plugins/sdlc-utilities/evals/results/`

**Notes:** Implements #9346 "remove plugin.json experimental.evals" (F-eval-reference-and-validator-sweep-6, -7, -9). No validator reads these fields.

**Acceptance criteria:**
- [ ] `plugin.json` parses and has no `experimental` key; `schemas/plugin.schema.json` parses and has no `experimental` property.
- [ ] `.gitignore` has no `evals/results` line.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js` reports 16/16.

**Contract:**
- shape (code):
  ```diff
     "author": {
       "name": "rnagrodzki"
  -  },
  -  "experimental": {
  -    "evals": "evals"
     }
   }
  ```
  In `schemas/plugin.schema.json`, remove the whole `"experimental": { … }` property and the comma before it; `"additionalProperties": false` stays.
- names: `experimental`, `experimental.evals`.
- mirror: `schemas/plugin.schema.json:18-26` (the `author` block that stays last).
- decisions: the version field is left to the ship version step.
- sync: `docs/architecture.md:66` (Task 6).

**Verification:** `node -e "JSON.parse(require('fs').readFileSync('plugins/sdlc-utilities/.claude-plugin/plugin.json','utf8'));JSON.parse(require('fs').readFileSync('schemas/plugin.schema.json','utf8'))"` exit 0; `grep -c evals .gitignore` → 0; validate-discovery 16/16.

### Task 6: Tests README and architecture docs describe the headless runner

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3, Task 5
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/README.md` — replace the eval section; update the Structure block
- Modify: `docs/architecture.md` — drop the `experimental.evals` bullet; rewrite the Testing exception
- Modify: `site/src/content-source/architecture.md` — byte copy of `docs/architecture.md`

**Notes:** Implements #9346 "update tests README/architecture docs" (F-eval-reference-and-validator-sweep-2 to -5, F-headless-provider-and-stub-testing-10). The README is the single place that holds the run command; the other docs point to it.

**Acceptance criteria:**
- [ ] `grep -n "plugin eval\|experimental.evals\|sdlc-utilities/evals" tests/promptfoo/README.md docs/architecture.md` prints nothing.
- [ ] The README section has: a credentialed, owner-initiated, never-CI/pre-push warning; the default run command; the costly run command; the 9-case table (case, tier, skill run); the output fields the assertions read; the stub-based exec cases (`headless-runner:`).
- [ ] The Structure block lists `providers/headless-case.js`, `datasets/headless-*.yaml` and `fixtures-headless/`.
- [ ] `cmp docs/architecture.md site/src/content-source/architecture.md` exit 0.

**Contract:**
- shape (docs): README `## Headless runner (credentialed, owner-initiated)` replaces `## Eval smoke suite (local, pre-release)`. Commands:
  ```bash
  cd tests/promptfoo
  npx --yes promptfoo@0.123.1 eval -c promptfooconfig-headless.yaml -j 1 --no-cache --filter-metadata tier=cheap
  SDLC_HEADLESS_COSTLY=1 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-headless.yaml -j 1 --no-cache --filter-pattern "headless: plan-sdlc"
  ```
  `docs/architecture.md`: delete the `experimental.evals` bullet at the plugin.json field list; the Testing paragraph's exception reads "except the headless runner (`promptfooconfig-headless.yaml`, provider `providers/headless-case.js`), which runs real `claude -p` sessions: credentialed and owner-initiated only, never in CI (see `tests/promptfoo/README.md`)"; the layout tree adds `promptfooconfig-headless.yaml`.
- names: heading `## Headless runner (credentialed, owner-initiated)`.
- mirror: `tests/promptfoo/README.md:65-95` (section layout and table style).
- decisions: audience is the owner and contributors; no internal ruling ids.
- sync: `AGENTS.md` exception (Task 7); field names from Task 2.

**Verification:** the grep and `cmp` above; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

### Task 7: AGENTS.md exception names the headless runner (owner approval)

**Complexity:** Trivial
**Risk:** Medium
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `AGENTS.md` — rewrite the one-exception paragraph in `## Testing`

**Notes:** Implements #9346 "rewrite AGENTS.md exception" (F-eval-reference-and-validator-sweep-1). Its own task because AGENTS.md changes need owner approval; the PR body says so (Context).

**Acceptance criteria:**
- [ ] The paragraph reads exactly as in the Contract; no other AGENTS.md line changes (`git diff --stat AGENTS.md` shows 1 line changed).
- [ ] `grep -c "plugin eval" AGENTS.md` → 0.

**Contract:**
- shape (docs):
  ```diff
  -One exception, approved by the owner (2026-10-20/21): the local `claude plugin eval` smoke suite in `plugins/sdlc-utilities/evals/` (declared by `experimental.evals` in `plugin.json`; see `tests/promptfoo/README.md`). It is local and pre-release only, never in CI, and it spends credentials, so every run is user-initiated.
  +One exception, approved by the owner (2026-10-20/21; changed to the headless runner 2026-11-11): the headless runner `tests/promptfoo/promptfooconfig-headless.yaml` (provider `providers/headless-case.js`; see `tests/promptfoo/README.md`). It runs real `claude -p` sessions, so it is credentialed and owner-initiated only: never in CI or pre-push, and never started by an agent. Its provider is tested by exec-only cases with a stub `claude`.
  ```
- names: none new.
- mirror: `AGENTS.md:47`.
- decisions: keep the original approval date (Decisions taken without the owner, 7).
- sync: `tests/promptfoo/README.md` and `docs/architecture.md` (Task 6).

**Verification:** `git diff AGENTS.md` shows only the line above.

### Task 8: Ship spec R83 and R94 wording

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — R83 names the R94 exception; R94 refusal sentence
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy

**Notes:** Implements #9356 low findings 3 and 4 (F-pr74-deferred-review-fixes-5, -6). Spec first: it precedes the `ship.js` fix (Task 9). Wording only.

**Acceptance criteria:**
- [ ] R83 and R94 read as in the Contract; no id is renumbered.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root .` exit 0; `cmp` of the two files exit 0.

**Contract:**
- shape (openspec):
  ```diff
  -… The plan file (`flags.planFile`, compared as a path relative to the active worktree root) is always an allowed path, so a new or edited plan file is staged with the wave.
  +… The plan file (`flags.planFile`, compared as a path relative to the active worktree root) is always an allowed path, so a new or edited plan file is staged with the wave. In `stage_fixes`, the paths R94 records for the current review round are also allowed.
  ```
  ```diff
  -… A path the prompt did not name, a path changed later, and every path in a later round are still refused (R83). …
  +… A path the prompt did not name, a path first changed after the question, and every path in a later round are still refused (R83). The prompt names a path when it contains the path as a whole token or as a JSON string. …
  ```
- names: `R83`, `R94`.
- mirror: `docs/specs/ship-sdlc.md:203-206`.
- decisions: the JSON-string clause states the Task 9 behaviour.
- sync: `site/src/content-source/specs/ship-sdlc.md`.

**Verification:** validate-spec-shape exit 0; `cmp` exit 0.

### Task 9: R94 match accepts JSON-quoted paths

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — add the JSON-string match
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — add `--scope-result <rel>`
- Modify: `tests/promptfoo/fixtures-fs/project-ship-stepper/setup.sh` — add `results/received-review-scope-punct.json`
- Modify: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — add `ship-scope-keep: (c)`

**Notes:** Implements #9356 medium finding 1 and spec R94 (F-pr74-deferred-review-fixes-1). The JSON form keeps the whole-token guarantee (`"a.txt"` is not inside `"data.txt"`). A space cannot reach the test through `script_args` (Deviations).

**Acceptance criteria:**
- [ ] The new case (c) fails at HEAD and passes after the change; cases (a) and (b) still pass.
- [ ] Without `--scope-result`, the stepper uses `results/received-review-scope.json` as today.

**Contract:**
- shape (code):
  ```diff
         // Whole-token match: `a.txt` must not match a prompt that names `data.txt`.
         const tokens = new Set(pq.prompt.split(/[\s"'`,:\[\]{}()]+/));
  -      const named = outside.filter(p => tokens.has(p));
  +      // R94: received-review prints --check-scope JSON, so a path may appear only as a JSON string.
  +      const named = outside.filter(p => tokens.has(p) || pq.prompt.includes(JSON.stringify(p)));
  ```
  Stepper, in the `--scope-asked` branch of `case 'stage-outside-files'`:
  ```diff
  -      after('dispatch_received_review', 'results/received-review-scope.json');
  +      const si = process.argv.indexOf('--scope-result');
  +      after('dispatch_received_review', si >= 0 && process.argv[si + 1] ? process.argv[si + 1] : 'results/received-review-scope.json');
  ```
  The usage comment at the top of the stepper gains `--scope-result <rel>  (with --scope-asked) the canned received-review result to return first`. `setup.sh` adds, after the `received-review-scope.json` line:
  ```bash
  echo '{"success":false,"output":{"summary":"scope check failed","pendingQuestion":{"prompt":"{\"ok\":false,\"outOfScope\":[\"(g)/out.txt\"]} Revert or keep the listed changes?","options":["keep","revert"]}}}' > results/received-review-scope-punct.json
  ```
  Case (c) `script_args`: `--project-root {{project_root}} --scenario stage-outside-files --seed frozen --fixes --plan-files in.txt --write in.txt,(g)/out.txt --scope-asked --scope-result results/received-review-scope-punct.json`; it asserts `snapshots[0].approvedScope` equals `{ round: 1, paths: ['(g)/out.txt'] }` and `calls[1]` is a `stage_fixes` step.
- names: `--scope-result`, `received-review-scope-punct.json`, description `ship-scope-keep: (c) a kept path with punctuation is matched as a JSON string`.
- mirror: `tests/promptfoo/datasets/ship-prepare-exec.yaml` case `ship-scope-keep: (a)`.
- decisions: keep the token match, add the JSON match (Decisions taken without the owner, 5).
- sync: spec R94 (Task 8).

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-scope-keep:"` → 3 passed.

### Task 10: run-schema-truth.js removes its temp dir on init failure

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-schema-truth.js` — return through `finally`; top-level catch
- Create: `tests/promptfoo/scripts/run-schema-truth-cleanup.js`
- Modify: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — add the cleanup case

**Notes:** Implements #9356 medium finding 2 (F-pr74-deferred-review-fixes-2). The wrapper forces the init failure with a PATH that has no `node`, and points `TMPDIR` at a fresh dir it can inspect.

**Acceptance criteria:**
- [ ] On init failure the script exits 2, prints `init failed:` to stderr, and leaves no `schema-truth-*` dir.
- [ ] A schema read or parse error exits 2 with a one-line `schema-truth:` message, matching the header contract.
- [ ] The existing schema-truth cases and the new cleanup case pass.

**Contract:**
- shape (code):
  ```diff
       if (r.status !== 0 || !file) {
         process.stderr.write('init failed: ' + (r.stderr || '') + '\n');
  -      process.exit(2);
  +      process.exitCode = 2;
  +      return null; // `finally` still removes T
       }
  ```
  ```diff
  -const result = surface === 'execute-state' ? executeStateSurface() : reviewDimensionSurface();
  -process.stdout.write(JSON.stringify(result) + '\n');
  +let result;
  +try {
  +  result = surface === 'execute-state' ? executeStateSurface() : reviewDimensionSurface();
  +} catch (err) {
  +  process.stderr.write(`schema-truth: ${err.message}\n`);
  +  process.exit(2);
  +}
  +if (result !== null) process.stdout.write(JSON.stringify(result) + '\n');
  ```
  Wrapper: mkdtemp D; `spawnSync(process.execPath, [<repo>/tests/promptfoo/scripts/run-schema-truth.js, '--surface', 'execute-state'], { env: { ...process.env, TMPDIR: D, PATH: '/nonexistent' }, encoding: 'utf8' })`; prints `{"status":2,"stderrHasInitFailed":true,"leftovers":[]}`; removes D in `finally`.
- names: `run-schema-truth-cleanup.js`, description `schema-truth: init failure exits 2 and leaves no temp dir`.
- mirror: `tests/promptfoo/datasets/execute-prepare-exec.yaml:740-760` (schema-truth case).
- decisions: `process.exitCode` over `rmSync` before exit, so one cleanup path stays (Decisions taken without the owner, 6).
- sync: the script's header comment (exit 2 contract) stays true.

**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "schema-truth"` → all passed (the existing cases plus the new one).

### Task 11: Move the pr-sdlc gh warnings section out of multi-account

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/skills/pr-sdlc.md` — move `### gh pr create warnings` to the end of `## Auto-Labeling`
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy

**Notes:** Implements #9356 low finding 1 (F-pr74-deferred-review-fixes-3). The finding is placement only, so the text moves unchanged.

**Acceptance criteria:**
- [ ] The section and its paragraph sit after `### When labeling is skipped` and before the `---` that precedes `## GitHub Multi-Account Support`, with the text unchanged.
- [ ] `cmp docs/skills/pr-sdlc.md site/src/content-source/skills/pr-sdlc.md` exit 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (docs): before → after outline of the moved block:
  ```diff
   ### When labeling is skipped

   If the repository has no labels defined or `gh` is unavailable, the inferred labeling step is skipped. Forced labels (via `--label`) still work — they are created in the repo if needed.

  +### gh pr create warnings
  +
  +When `gh pr create` succeeds but writes to stderr (for example a notice about an unpushed commit or a deprecated flag), the skill prints that text after the line `gh pr create warnings:`. Nothing is printed when stderr is empty. Tracked in spec requirement E9.
  +
   ---

   ## GitHub Multi-Account Support
   …
   This recovery is one-shot per pipeline invocation — a second consecutive permission failure is terminal. Tracked in spec requirement E7 (…).

  -### gh pr create warnings
  -
  -When `gh pr create` succeeds but writes to stderr (for example a notice about an unpushed commit or a deprecated flag), the skill prints that text after the line `gh pr create warnings:`. Nothing is printed when stderr is empty. Tracked in spec requirement E9.
  -
   ---
  ```
- names: `### gh pr create warnings`.
- mirror: `docs/skills/pr-sdlc.md:206-218` (Auto-Labeling subsections).
- decisions: move, do not reword.
- sync: `site/src/content-source/skills/pr-sdlc.md`.

**Verification:** `cmp` exit 0; check-docs-consistency exit 0.

### Task 12: ship-sdlc R94 bullet names stage_fixes

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 8
**Verify:** manual

**Files:**
- Modify: `docs/skills/ship-sdlc.md` — the R94 bullet names `stage_fixes`
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy
- Create: `docs/plans/2026-11-11-lean-w8b-headless-runner.md`

**Notes:** Implements #9356 low finding 2 (F-pr74-deferred-review-fixes-4). The plan file is listed in the last task so ship stages it with the wave; it is not a second deliverable.

**Acceptance criteria:**
- [ ] The bullet reads as in the Contract.
- [ ] `cmp docs/skills/ship-sdlc.md site/src/content-source/skills/ship-sdlc.md` exit 0; `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exit 0.

**Contract:**
- shape (docs):
  ```diff
  -… In the same review round, commit-fixes stages those files without asking again; any other outside file is still refused.
  +… In the same review round, stage_fixes stages those files without asking again, and commit-fixes then commits them; any other outside file, and every outside file in a later round, is still refused.
  ```
- names: bullet `**Review-scope keep (R94)**`.
- mirror: `docs/skills/ship-sdlc.md:230-231` (neighbouring R83 bullet).
- decisions: wording matches spec R94 (Task 8).
- sync: `site/src/content-source/skills/ship-sdlc.md`.

**Verification:** `cmp` exit 0; check-docs-consistency exit 0.

## Final Shape

- `tests/promptfoo/` has a third config, `promptfooconfig-headless.yaml`. It runs 9 real `claude -p` cases against fixture repos that `fixtures-headless/build-fixture-repo.js` builds. Only the owner runs it.

- By default the 5 cheap cases run; the 4 costly ones need `SDLC_HEADLESS_COSTLY=1`.

- The provider returns one JSON document per run. Assertions read exit codes, cost, tool calls (with their error flags) and workspace files. So the suite sees ship skip received-review directly, and sees that the `--final` format gate passed.

- The exec suite proves the provider with a stub `claude`. It covers the argv, the cwd, CLAUDECODE removal, stream parsing, the snapshot, cleanup, the costly gate and the failure paths.

- `plugins/sdlc-utilities/evals/` and `experimental.evals` no longer exist. AGENTS.md, the tests README and the architecture doc describe the headless runner. The AGENTS.md change waits for owner approval in the PR.

- Ship keeps a received-review path with punctuation in the same round. `run-schema-truth.js` cleans up on every exit. The pr-sdlc, ship-sdlc and spec texts match the code.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9346: add promptfoo provider headless-case.js running claude -p stream-json against scaffolded repos | Task 2 | covered |
| 2 #9346: add promptfooconfig-headless.yaml; port the 8 eval cases plus a commit-sdlc --subject case, cheap by default and execute/ship opt-in | Task 3 | covered |
| 3 #9346: move scaffolds to tests/promptfoo/fixtures-headless/ | Task 1 | covered |
| 4 #9346: remove plugins/sdlc-utilities/evals/ and plugin.json experimental.evals | Task 4, Task 5 | covered |
| 5 #9346: rewrite the AGENTS.md exception as headless runner, owner-initiated only (own task; PR body names owner approval) | Task 7 | covered |
| 6 #9346: update tests README and architecture docs | Task 6 | covered |
| 7 #9346: verify provider/config only with exec-only stub cases, YAML parse and promptfoo validate config; never run the headless suite | Task 1, Task 2, Task 3 | covered |
| 8 #9356 medium: ship.js R94 whole-token match drops kept paths with spaces or punctuation | Task 9 | covered |
| 9 #9356 medium: run-schema-truth.js process.exit(2) skips finally and leaks the temp dir | Task 10 | covered |
| 10 #9356 low: pr-sdlc.md section placement; ship-sdlc.md R94 bullet names the wrong step | Task 11, Task 12 | covered |
| 11 #9356 low: specs/ship-sdlc.md R83 lacks R94 exception; R94 'a path changed later' ambiguous | Task 8 | covered |
| 12 The plan file is listed as Create under the last task; deleted evals files listed one by one | Task 12, Task 4 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
