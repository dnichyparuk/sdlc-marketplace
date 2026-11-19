# Promptfoo Behavioral Tests

Regression tests that run SDLC skills through Claude and verify behavioral patterns.

## Requirements

- Claude Code CLI installed (`claude` in PATH) and logged in
- Node.js 18+
- promptfoo 0.123.1, run through `npx --yes promptfoo@0.123.1` (later versions read the templated `file://` `script_cwd` var as a file and fail with EISDIR)
- [Task](https://taskfile.dev) installed (optional but recommended): `brew install go-task`

## Run tests

From repo root:

```bash
task test          # LLM behavioral tests (all 6 skills)
task test:exec     # Script execution tests (no LLM, fast)
task test:all      # Both behavioral and exec tests
task test:skill -- pr-sdlc  # Single skill
task test:view     # Open web UI to inspect results
```

Or directly from `tests/promptfoo/` (first run `cp .env.example .env`; `.env` is untracked and holds local settings):

```bash
npx --yes promptfoo@0.123.1 eval --env-file .env
npx --yes promptfoo@0.123.1 eval --config promptfooconfig-exec.yaml --env-file .env
npx --yes promptfoo@0.123.1 view --env-file .env
```

## Results

Results are stored locally in `.promptfoo-data/` (gitignored).

- `.promptfoo-data/promptfoo.db` — SQLite database with all eval results
- `.promptfoo-data/logs/` — debug and error logs

Both `eval` and `view` must use `--env-file .env` to pick up this location.

## How it works

### Behavioral tests (`promptfooconfig.yaml`)

Each skill gets a dataset YAML under `datasets/` with 2–3 test cases. The
`providers/claude-cli.js` custom provider shells out to `claude -p` (your Claude
Pro/Max subscription — no API key needed). The `scripts/extract-skill-content.js`
`transformVars` script reads the skill's SKILL.md and injects it into the prompt
along with any sibling reference documents and a simulated project context.

Assertion pattern per test:
1. **Structural** (`regex`, `icontains`, `not-icontains`) — fast, deterministic
2. **Behavioral** (`llm-rubric`) — LLM-graded semantic check

When `claude -p` exits non-zero, the provider error adds the exit code and the last 500
characters of stdout. A usage-limit refusal (a line matching `USAGE_LIMIT_RE`, "hit your …
limit") gives the error `claude -p usage limit reached: <message with its reset time>`. Every
later call in the same promptfoo run returns that error at once and does not start `claude -p`,
so a run stops spending after the limit. Re-run after the reset time.

### Script execution tests (`promptfooconfig-exec.yaml`)

`promptfooconfig-exec.yaml` and `promptfooconfig-exec-hooks.yaml` run the plugin's scripts and hooks directly through `providers/script-runner.js` (no LLM involved), about 80 datasets in total under `datasets/*-exec*.yaml`. The `lefthook` pre-push hook runs both configs. Script paths use `repo://<path>` (relative to the repository root); fixture directories use `file://fixtures-fs/<name>`, and a fixture with a `setup.sh` is built per case in a fresh temp directory. Helper scripts live in `scripts/`, committed baselines in `baselines/`.

#### Run

Run a targeted subset from `tests/promptfoo/`:

```bash
cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>
```

The hooks variant uses `-c promptfooconfig-exec-hooks.yaml` with the same flags. Use `-j 1` because cases share fixture copies and temp directories. promptfoo is pinned to 0.123.1 because 0.125 and later fail with EISDIR.

#### Case vars

| Var | Meaning |
|---|---|
| `script_path` | script to run (`repo://...` or absolute); required |
| `script_args` | space-separated arguments; may use `{{project_root}}` |
| `script_cwd` | working directory of the script |
| `project_root` | fixture directory, usually `file://fixtures-fs/<name>`; used in `script_args` |
| `script_env` | JSON string or object of extra environment variables |
| `script_stub_bin` | directory of stub binaries put first on `PATH` |
| `script_capture_stderr` | when truthy, append stderr to the output even on exit 0 |
| `script_show_exit` | when truthy, append a last line `[exit N]` to the output |

The exit code is always in `context.metadata.exitCode`, whether or not `script_show_exit` is set.

#### Suite guards

Exec cases that check the suite itself. After a baseline changes, refresh it with `--update` and review the baseline diff in the PR: `--update` can hide a drop.

| Guard | Script | Baseline or allowlist | Fails when |
|---|---|---|---|
| Fixture refs | `scripts/check-fixture-refs.js` | none (datasets and `refs` floor in `fixture-guard-exec.yaml`) | a `file://fixtures...` ref or a named dataset does not resolve |
| Dataset regex | `scripts/check-dataset-regex.js` | none | a `regex` or `not-regex` value does not compile or is empty |
| Docs copies | `scripts/check-docs-copies.js` | none | a `docs/<dir>/*.md` file differs from its copy in `site/src/content-source/<dir>/` |
| Spec-id coverage and floors | `scripts/check-spec-id-coverage.js` | `baselines/spec-id-coverage.json` | a dataset, assertion count, cited id or parsed flag drops below the baseline |
| Dataset asserts | `scripts/check-dataset-asserts.js` | `baselines/dataset-asserts-allow.json` | a case has an empty regex, only negative assertions or a key-only `contains`, and is not allowlisted |

#### Mutation smoke (owner-initiated)

`scripts/mutation-smoke.js` breaks one library line at a time in a throwaway copy of the repository and runs the exec cases that should notice. A surviving mutation marks a case that does not check the mutated path.

**Owner-initiated only. Never run it in CI, from a pre-push hook or from an agent.** `--run` starts promptfoo and refuses to start without `--owner`, when `CI` is set, or when `CLAUDECODE` is set.

```bash
node tests/promptfoo/scripts/mutation-smoke.js --list
node tests/promptfoo/scripts/mutation-smoke.js --check
node tests/promptfoo/scripts/mutation-smoke.js --run --owner [--only <id>]
```

`--list` prints the mutations. `--check` verifies, read-only, that every mutation still applies and has a case. `--run --owner` runs them.

## Headless runner (credentialed, owner-initiated)

`promptfooconfig-headless.yaml` runs one skill per case through a real `claude -p` session, via the provider `providers/headless-case.js`. The provider scaffolds a tiny git repo in a fresh temp directory, runs the skill there, and returns what the run did and left behind. Assertions read only those outputs (no model-judged graders).

**Credentialed and owner-initiated only. Never run it in CI or from a pre-push hook.** Every run calls the model with your credentials and counts against your plan's usage limits or your API bill. Costly cases dispatch several agents and are gated behind `SDLC_HEADLESS_COSTLY=1`.

Prerequisites: Claude Code logged in; Node.js 18+.

Run the cheap cases (the default) from `tests/promptfoo/`:

```bash
cd tests/promptfoo
npx --yes promptfoo@0.123.1 eval -c promptfooconfig-headless.yaml -j 1 --no-cache --filter-metadata tier=cheap
```

Run one costly case:

```bash
SDLC_HEADLESS_COSTLY=1 npx --yes promptfoo@0.123.1 eval -c promptfooconfig-headless.yaml -j 1 --no-cache --filter-pattern "headless: plan-sdlc"
```

| Case | Tier | Skill run |
|---|---|---|
| `headless: commit-auto` | cheap | `commit-sdlc --auto` |
| `headless: crlf-checkout` | cheap | `commit-sdlc --auto` on CRLF files |
| `headless: commit-subject` | cheap | `commit-sdlc --auto` with `--subject` and `--expected-subject` |
| `headless: review-dry-run` | cheap | `review-sdlc --dry-run --staged` |
| `headless: ship-dry-run` | cheap | `ship-sdlc --dry-run` |
| `headless: execute-two-task` | costly | `execute-plan-sdlc` on a 2-task plan |
| `headless: ship-auto-commit-review` | costly | `ship-sdlc --auto` (execute, commit, review) |
| `headless: ship-review-zero-findings` | costly | `ship-sdlc --auto` on a change with nothing to review |
| `headless: plan-sdlc` | costly | `plan-sdlc --auto` on a five-file request |

Output fields the assertions read:

| Field | Meaning |
|---|---|
| `workspace` | path of the scaffolded temp repo the case ran in |
| `exitCode`, `signal`, `timedOut` | how the `claude` process ended |
| `isError`, `resultSubtype` | the session's final result record |
| `costUsd` | cost the session reported |
| `toolUses` | list of `{id, name, input, isError, resultTail}` for each tool call (`isError` and `resultTail`, the last 300 chars of the result text, are null until its result arrives) |
| `resultText` | last 1000 characters of the final `result` event's text, or null |
| `files` | files present in the workspace after the run |
| `contents` | contents of the files a case asks to read back |
| `stderrTail` | last lines of the process's stderr |

The provider and scaffolder are tested without credentials: the `headless-runner:` cases in `datasets/headless-runner-exec.yaml` run them against a stub `claude` (`fixtures-fs/stub-bin-claude/bin/claude`) through `scripts/run-headless-case-stub.js`. They belong to the exec suite, so they cost nothing.

## Structure

```
tests/promptfoo/
  providers/      claude-cli.js, script-runner.js, headless-case.js
  prompts/        skill-runner.txt, skill-runner-exec.txt
  scripts/        extract-skill-content.js (transformVars)
  datasets/       one YAML per skill (LLM + exec variants); headless-*.yaml for the headless runner
  fixtures/       markdown project context files (for LLM tests)
  fixtures-fs/    real directory fixtures (for exec tests)
  fixtures-headless/  fixture-repo builder for the headless runner
  promptfooconfig-headless.yaml   headless runner config
```
