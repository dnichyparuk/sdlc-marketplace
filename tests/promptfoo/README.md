# Promptfoo Behavioral Tests

Regression tests that run SDLC skills through Claude and verify behavioral patterns.

## Requirements

- Claude Code CLI installed (`claude` in PATH) and logged in
- Node.js 18+
- promptfoo installed globally: `npm install -g promptfoo`
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

Or directly from `tests/promptfoo/`:

```bash
promptfoo eval --env-file .env
promptfoo eval --config promptfooconfig-exec.yaml --env-file .env
promptfoo view --env-file .env
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

## Eval smoke suite (local, pre-release)

`plugins/sdlc-utilities/evals/` holds a small `claude plugin eval` suite. Each case runs one skill once in an isolated Claude Code session against a tiny scaffolded git repo, then grades only the files the run leaves (no model-judged graders). It complements the promptfoo suites; it is not a promptfoo config.

**Never run it in CI.** It is local and pre-release only.

**Cost.** Every run calls the model with your credentials and counts against your plan's usage limits or your API bill. Ship cases dispatch several agents and cost the most. Always pass `--max-cost-usd`.

Prerequisites: Claude Code logged in; on Linux, `bubblewrap` and `socat` (every case grants Bash, which runs under the OS sandbox). `--scaffold` runs each case's `scaffold.sh` as you, outside the sandbox.

Run one case from the repo root (put the target first; `--allow-tools` takes a list, so keep it last):

```bash
claude plugin eval plugins/sdlc-utilities --case commit-auto --runs 1 --ablation none \
  --trust-plugin --scaffold --max-cost-usd 3 --allow-tools Bash
```

| Case | Skill run | `--allow-tools` | Graded files |
|---|---|---|---|
| `commit-auto` | `commit-sdlc --auto` | `Bash` | `.git/logs/HEAD`, `.git/COMMIT_EDITMSG` |
| `crlf-checkout` | `commit-sdlc --auto` on CRLF files | `Bash` | same |
| `review-dry-run` | `review-sdlc --dry-run --staged` | `Bash` | `.sdlc/execution/out/`, no files elsewhere |
| `ship-dry-run` | `ship-sdlc --dry-run` | `Bash` | prepare manifest; no commit, tag or ledger |
| `execute-two-task` | `execute-plan-sdlc` on a 2-task plan | `Bash Write Edit` | created files; state cleaned |
| `ship-auto-commit-review` | `ship-sdlc --auto` (execute, commit, review) | `Bash Write Edit` | reflog; review summary; ledger and cap sidecar absent |
| `ship-review-zero-findings` | same, on a change with nothing to review | `Bash Write Edit` | review summary written with 0 critical/high findings (the gate's skip condition; inferred, not observed) |

Defaults: `--runs 3` (the case's own `runs`, else 3; repeated runs give the flakiness signal), `--threshold 1.0`, `--ablation with-without` (doubles the runs; pass `--ablation none` for a smoke check), turn and time limits from each `prompt.md`. Exit 0 = every case at or above the threshold, 1 = below it or a load error, 2 = partial (for example the cost ceiling). `--json <path>.json` writes the result document (`schemaVersion: 1`).

Results go to `plugins/sdlc-utilities/evals/results/<timestamp>/` (`aggregate-result.json`, `report.html`), which is gitignored. `plugin.json` declares the directory as `experimental.evals`; the field is optional while the directory is `evals/`.

## Structure

```
tests/promptfoo/
  providers/      claude-cli.js, script-runner.js
  prompts/        skill-runner.txt, skill-runner-exec.txt
  scripts/        extract-skill-content.js (transformVars)
  datasets/       one YAML per skill (LLM + exec variants)
  fixtures/       markdown project context files (for LLM tests)
  fixtures-fs/    real directory fixtures (for exec tests)
```
