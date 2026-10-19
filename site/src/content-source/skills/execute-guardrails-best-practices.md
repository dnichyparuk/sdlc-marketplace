# Execute Guardrails Best Practices

## Overview

`execute.guardrails[]` entries in `.sdlc/config.json` are runtime constraints enforced by `execute-plan-sdlc` at two points in each wave: before agents run (against task descriptions) and after agents run (against `git diff --stat` output). This doc helps you author guardrails that fire where they should — and stay silent where they shouldn't — by explaining the evaluation surface, showing worked examples with the full item schema, and naming the anti-patterns that cause guardrails to miss or over-fire.

---

## Plan vs Execute Guardrails — Decision Rule

Both guardrail types share the same item shape (`id`, `description`, `severity`) but live under different keys and fire at different stages:

- **Plan guardrails** (`plan.guardrails[]`) constrain **scope and intent** — they are evaluated by `plan-sdlc` against the plan text before execution begins. Use them when you can evaluate the constraint from what the plan *says*.
- **Execute guardrails** (`execute.guardrails[]`) constrain **artifacts** — they are evaluated by `execute-plan-sdlc` against task descriptions (pre-wave) and `git diff --stat` output (post-wave). Use them when you need to see what the plan *produced*.

**Rule of thumb:** If you can evaluate it from the plan text alone → plan guardrail. If you need to see actual file changes → execute guardrail.

---

## Pre-wave vs Post-wave Evaluation Surface

### Pre-wave

Runs before any agents are dispatched for a wave. The guardrail description is evaluated against the **task descriptions** for every task in that wave — this catches tasks that *plan to* violate a constraint before any code is written. Only `error`-severity guardrails are evaluated pre-wave; `warning`-severity entries are reserved for post-wave evaluation against real output.

### Post-wave

Runs after the wave-runner returns and mechanical verification (filesystem diff, canary checks, test/build/lint) passes. The guardrail description is evaluated against the actual `git diff --stat <base>...HEAD` output — the list of changed files and their line-count deltas. **`git diff --stat` exposes filenames and line counts only — it does not include file content.** All severities (`error` and `warning`) are evaluated post-wave.

For small plans (≤3 tasks), a single guardrail evaluation runs after all tasks complete (see `execute-plan-sdlc.md` lines 300–304).

---

## Worked Scenarios

### Scenario A — No new dependencies without approval

```json
{
  "id": "no-new-deps",
  "description": "Do not add new entries to package.json dependencies or devDependencies without explicit approval in the task description.",
  "severity": "error"
}
```

**Why this works:** `git diff --stat` lists `package.json` as a changed file when any field in it changes, and line counts increase when new dependency entries are added. The pre-wave check catches tasks whose descriptions mention installing new packages. The post-wave check confirms whether `package.json` actually changed. The phrase "without explicit approval in the task description" gives the LLM evaluator a clear pass criterion when the task explicitly names the new dependency.

**Surface:** pre-wave (intent) + post-wave (filename + line count)

---

### Scenario B — Test files must accompany source changes

```json
{
  "id": "tests-accompany-source",
  "description": "Any wave that modifies files under src/ must also produce a changed or added file matching tests/ or *.test.* or *.spec.*.",
  "severity": "error"
}
```

**Why this works:** `git diff --stat` lists all changed filenames, so a filename-pattern rule — does the diff include both a `src/` file and a test file? — is directly checkable from the stat output. No file content is needed.

**Surface:** post-wave (filenames in `git diff --stat`)

---

### Scenario C — No console.log shipped

```json
{
  "id": "no-console-log",
  "description": "Source files under src/ must not introduce new console.log statements. If the diff touches src/ files, flag for manual review if the line count increases by more than expected for the stated change.",
  "severity": "warning"
}
```

**Why this works — and where it doesn't:** `git diff --stat` does **not** include file content — only filenames and line counts. The LLM evaluating this guardrail cannot read the actual lines added. The description above uses a line-count heuristic as a proxy signal, but it is approximate: a large feature with zero `console.log` statements will also increase the line count. Use `warning` severity for content-dependent guardrails to avoid blocking on false positives.

**Content-blind alternative:** If you want a guardrail that fires on debug output without relying on content, scope it to filename patterns instead:

```json
{
  "id": "no-debug-files",
  "description": "Diff must not add files under src/ whose name matches a debug pattern such as *.debug.*, *.log.*, or debug-*.ts.",
  "severity": "error"
}
```

This version works cleanly against `git diff --stat` because it only checks filenames.

**Surface:** post-wave (line counts as proxy; content-blind)

---

### Scenario D — Migration files are append-only

```json
{
  "id": "migrations-append-only",
  "description": "Diff must not show any pre-existing file under migrations/ as having lines removed. New migration files may be added; existing ones must remain untouched.",
  "severity": "error"
}
```

**Why this works:** `git diff --stat` reports per-file insertion and deletion counts. A pre-existing migration file being edited will surface as deletions (or mixed insertions and deletions) against an existing path, whereas a newly added migration file shows only insertions on a path the evaluator has not seen before. The LLM can reason about that signal directly from `--stat`. For extra precision, pair this guardrail with a pre-wave check — tasks should state they are adding new migration files, not editing existing ones.

**Surface:** pre-wave (task description intent) + post-wave (line-count shape under `migrations/`)

---

## `--auto` Mode and Error Severity

When `execute-plan-sdlc` runs with `--auto`, error-severity guardrail violations are always blocking — both pre-wave and post-wave. The pipeline stops; the violation is printed; no automatic override is applied. This is by design: guardrails exist to prevent drift, and silent auto-override would defeat the purpose.

Only `warning`-severity guardrails are non-blocking under `--auto`. They are reported in the progress output but do not stop the pipeline.

---

## Anti-patterns

- **Guardrails that require file content.** `git diff --stat` exposes filenames and line counts only, not the actual lines changed. Rules like "no TODO comments", "no hardcoded secrets", or "all exported functions must have JSDoc" cannot be reliably enforced from `--stat` output. Use pre-commit hooks or linter rules for content-based enforcement; keep execute guardrails to filename and line-count reasoning.

- **Guardrails duplicating plan-time checks.** If a rule already appears in `plan.guardrails[]` (e.g., "no scope creep"), adding the same rule to `execute.guardrails[]` adds noise without coverage. The violation was already caught at planning time; re-evaluating at execution adds a second prompt for the same issue.

- **Vacuously true or always-passing guardrails.** Rules like "the diff must contain changes" or "files must be valid JSON" never fire usefully — either the pipeline already verifies them mechanically, or the LLM evaluator will always return PASS regardless of the actual output. Guardrails are most valuable when they encode project-specific constraints that mechanical verification cannot catch.

---

## Related

- [execute-plan-sdlc](execute-plan-sdlc.md) — Guardrail Enforcement section documents the loading, pre-wave, and post-wave evaluation stages
- [plan-sdlc](plan-sdlc.md) — plan guardrails (`plan.guardrails[]`) evaluated at planning time
- [plan-guardrails-best-practices](plan-guardrails-best-practices.md) — how to write evaluable plan guardrails for the planning-time critique gate
- [setup-sdlc](setup-sdlc.md) — run with `--execution-guardrails` for interactive configuration of `execute.guardrails[]`
