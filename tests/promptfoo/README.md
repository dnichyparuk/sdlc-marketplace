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

### Script execution tests (`promptfooconfig-exec.yaml`)

Runs the three validator scripts directly against filesystem fixture directories
(no LLM involved). Tests that the scripts the skills call actually work correctly.

Testable scripts (no git dependency):
- `validate-discovery.js` — 16 plugin discovery checks
- `validate-pr-template.js` — 5 PR template validation checks
- `validate-dimensions.js` — dimension file validation

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
| `toolUses` | list of `{id, name, input, isError}` for each tool call (`isError` is null until its result arrives) |
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
