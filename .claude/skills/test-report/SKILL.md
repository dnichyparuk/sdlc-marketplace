---
name: test-report
description: "Use this skill when analyzing promptfoo test results and generating evidence reports. Consumes pre-computed data from test-report-prepare.js, generates categorized markdown report with failure diagnosis and fix plan. Triggers on: test report, analyze test results, promptfoo report, test evidence, test failures, generate evidence."
---

# Analyzing Promptfoo Test Results

Consume pre-computed test data from `test-report-prepare.js` and generate a
detailed evidence report in `.evidences/` with failure categorization, root
cause analysis, and a prioritized fix plan.

## When to Use This Skill

- After running `promptfoo eval` and wanting a structured evidence report
- When asked to analyze test results, failures, or generate a test evidence file
- When the `/test-report` command delegates here after running `test-report-prepare.js`

## Step 0 — Run the Prepare Script

> **VERBATIM** — Run this bash block exactly as written. Do not modify, rephrase, or simplify the commands.

```bash
# Safe: test-report-prepare.js ships only under .claude/skills/ (repo-level), never under plugins/sdlc-utilities/scripts/, so this find never matches a plugin-cache copy and cannot carry #485's contamination.
SCRIPT=$(find ~/.claude/plugins -name "test-report-prepare.js" 2>/dev/null | sort -V | tail -1)
[ -z "$SCRIPT" ] && [ -f ".claude/skills/test-report/test-report-prepare.js" ] && SCRIPT=".claude/skills/test-report/test-report-prepare.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate test-report-prepare.js. Is the sdlc plugin installed?" >&2; exit 2; }

DATA_FILE=$(node "$SCRIPT" --output-file $ARGUMENTS)
EXIT_CODE=$?
```

- If exit code **1**: Read the JSON, surface `errors[]` to the user, stop.
- If exit code **2**: Report the script crash, stop.
- If exit code **0**: Read `DATA_FILE` into `REPORT_DATA_JSON`.

**Error-to-GitHub issue proposal**:

For exit code 2 (script crash), locate the procedure: Glob for `**/error-report-sdlc/SKILL.md`
under `~/.claude/plugins`, then retry with cwd. If found, follow the procedure with:

- **Skill**: test-report
- **Step**: Step 0 — test-report-prepare.js execution
- **Operation**: Running test-report-prepare.js to pre-compute test data
- **Error**: Exit code 2 — script crash (full error on stderr)
- **Suggested investigation**: Check Node.js version; inspect stderr for stack trace; verify test-report-prepare.js is accessible via the plugin path

If not found, skip — the capability is not installed.

Clean up `DATA_FILE` after writing the report.

## Step 1 — Consume Context

Read `REPORT_DATA_JSON`. Display a brief orientation:

```
Eval: {evalMeta.evalId} ({evalMeta.createdAt})
Type: {evalMeta.configType}
Passed: {summary.passed}/{summary.executed} ({summary.passRate}%)
Failed: {summary.failed} | Missing: {summary.missing}
```

Key fields reference:

| Field | Description |
|-------|-------------|
| `evalMeta.evalId` | Eval run identifier |
| `evalMeta.configType` | `behavioral` or `exec` |
| `summary.passRate` | Integer percentage |
| `passingTests[]` | Tests with `success=1` |
| `failingTests[]` | Tests with `success=0`; each has `assertions[]`, `responsePreview`, `gradingReason` |
| `missingTests[]` | Tests defined in datasets but absent from results |
| `comparison` | null or `{regressions[], improvements[], unchanged}` |

## Step 2 (PLAN) — Categorize Failures and Draft Report

Analyze `failingTests[]` and classify each into exactly one category:

**Category A — Infrastructure Failures**
- `latencyMs < 10000` AND (`responsePreview` is empty OR contains "Command failed")
- Root cause: CLI crash, rate limit, concurrent session exhaustion

**Category B — Assertion Failures**
- LLM produced meaningful output (non-empty `responsePreview`, no "Command failed")
- Specific assertions in `assertions[]` have `pass: false`
- Sub-classify:
  - **B-false-positive**: Failing assertion is `not-regex` or `not-icontains` AND response shows correct behavior (e.g., explicitly refuses or negates the thing being checked). Most other assertions passed.
  - **B-true-failure**: LLM genuinely produced incorrect output — the assertion correctly caught a real behavioral problem.

**Category C — Missing Tests**
- Items from `missingTests[]`

For each Category B failure, draft:
- Failed assertion(s) with type and value
- Diagnosis (why the assertion fired, whether behavior is correct)
- Response preview excerpt (from `responsePreview` — do not fabricate)
- Specific fix suggestion (e.g., change assertion value, narrow regex, fix skill)

Draft the full markdown report using this template:

```markdown
# Promptfoo {configType|title} Test Report

**Generated:** {current timestamp YYYY-MM-DD HH:MM:SS}
**Eval ID:** `{evalMeta.evalId}`
**Config:** `tests/promptfoo/promptfooconfig{-exec if exec}.yaml`

---

## Summary

| Metric | Value |
|--------|-------|
| Tests defined | {summary.totalTests} |
| Tests executed | {summary.executed} |
| Tests missing | {summary.missing} |
| Passed | {summary.passed} ({summary.passRate}%) |
| Failed — infrastructure | {count of Category A} |
| Failed — assertion | {count of Category B} |
| Avg latency | {summary.avgLatencyMs}ms |
| Total cost | ${summary.totalCost} |

**Overall health: {HEALTHY if passRate >= 90 | WARNING if 70-89 | CRITICAL if < 70} — {summary.passRate}% pass rate**

---

## Passing Tests ({summary.passed}/{summary.executed})

| Test | Skill | Score |
|------|-------|-------|
{one row per passing test}

---

## Category A — Infrastructure Failures ({count} tests)

{Description of the common failure pattern and root cause}

| Test | Skill | Latency |
|------|-------|---------|
{one row per Cat-A failure}

---

## Category B — Assertion Failures ({count} tests)

### B{n}: {test description}
- **Score:** {score} ({passed_count}/{total_count} assertions passed)
- **Failed assertion:** `{type} "{value}"`
- **Diagnosis:** {root cause analysis}
- **LLM behavior:** Correct/Incorrect — {explanation}
- **Response preview:**
  ```
  {responsePreview, max 400 chars}
  ```
- **Fix:** {specific, actionable fix}

---

## Category C — Missing Tests ({count} tests)

| Test | Source |
|------|--------|
{one row per missing test}

---

## Failure Attribution

| Root Cause | Tests Affected | Fix |
|------------|---------------|-----|
{one row per distinct root cause}

**True behavioral failures:** {count of B-true-failure} — {summary sentence}

---

{IF comparison is not null:}
## Comparison with Previous Run

**Previous eval:** `{comparison.previousEvalId}` ({comparison.previousCreatedAt})

### Regressions ({count})
| Test | Previous Score | Current Score |
|------|---------------|--------------|

### Improvements ({count})
| Test | Previous Score | Current Score |
|------|---------------|--------------|

### Unchanged
- Still passing: {comparison.unchanged.stillPassing}
- Still failing: {comparison.unchanged.stillFailing}
{END IF}

---

## Fix Plan

### Priority 1 — Infrastructure ({count} tests affected)
{numbered action items: config changes, concurrency settings}

### Priority 2 — Assertion Corrections ({count} tests affected)
{numbered action items with file paths and specific assertion changes}

### Priority 3 — Behavioral Fixes ({count} tests affected)
{numbered action items with skill paths and what needs to change}

---

## Conclusion

{1-2 paragraph summary of overall health, key takeaways, and recommended next steps}
```

## Step 3 (CRITIQUE) — Self-Review the Report

Check these gates before proceeding:

| Gate | Check |
|------|-------|
| Completeness | Every `failingTests[]` entry appears in exactly one category |
| Count accuracy | Category A + B counts + missing = `summary.failed + summary.missing` |
| Passing count | Passing tests table row count = `summary.passed` |
| No fabrication | All response previews and assertion details come from `REPORT_DATA_JSON` |
| Actionability | Every failure has a concrete fix (not "investigate further") |
| Attribution | Every distinct root cause has a row in Failure Attribution table |
| No DB queries | Skill never runs `sqlite3` — all data from script |

List any issues found.

## Step 4 (IMPROVE) — Revise the Report

Fix all issues from Step 3. Repeat critique/improve up to 2 times until all gates pass.

## Step 5 (DO) — Write the Report

1. Create `.evidences/` directory if it does not exist:
   ```bash
   mkdir -p .evidences
   ```

2. Generate filename using current timestamp:
   ```bash
   TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
   REPORT_FILE=".evidences/promptfoo-${CONFIG_TYPE}-report-${TIMESTAMP}.md"
   ```

3. Write the final report to `REPORT_FILE`.

4. Clean up the temp data file (`DATA_FILE`).

## Step 6 (CRITIQUE) — Self-Review the Fix Plan

Only if `summary.failed > 0`. Check:

| Gate | Check |
|------|-------|
| Ordering | Infrastructure fixes listed before assertion fixes before skill fixes |
| Specificity | Each action references a specific file path and/or assertion value |
| No eval runs | Does not suggest running `promptfoo eval` automatically |
| Completeness | All root causes from Attribution table have a fix action item |

List any issues.

## Step 7 (IMPROVE) — Revise the Fix Plan

Fix all issues from Step 6. Up to 2 iterations.

## Step 8 — Present Summary to User

Show:
```
Report written to: {REPORT_FILE}

Health: {HEALTHY|WARNING|CRITICAL} — {passRate}%
  Passed:   {summary.passed}/{summary.executed}
  Category A (infra):    {count}
  Category B (assert):   {count}
  Category C (missing):  {count}

Top fix priorities:
  1. {first priority action}
  2. {second priority action}
  3. {third priority action}

{IF --compare: "Regressions: {count} | Improvements: {count}"}
```

## Error Recovery

> **Flow**: detect → diagnose → auto-recover (retry once if transient) → invoke `error-report-sdlc` for persistent actionable failures.

| Error | Recovery | Invoke error-report-sdlc? |
|-------|----------|---------------------------|
| `test-report-prepare.js` exit 1 | Show `errors[]`, stop | No — user input error |
| `test-report-prepare.js` exit 2 (crash) | Show stderr, stop | Yes |
| Zero test results (empty eval) | List available evals; ask user to verify | No — expected (empty run) |
| `.evidences/` directory not writable | Show error; ask user to check permissions | No — environment issue |

When invoking `error-report-sdlc`, provide:
- **Skill**: test-report
- **Step**: Step 0 — test-report-prepare.js execution
- **Operation**: Running test-report-prepare.js to pre-compute test report data
- **Error**: Exit code 2 — script crash (full error on stderr)
- **Suggested investigation**: Check Node.js version; inspect stderr for stack trace; verify promptfoo DB exists at `tests/promptfoo/.promptfoo-data/promptfoo.db`

---

## DO NOT

- Run `sqlite3` queries — all data comes from the prepare script JSON
- Run `promptfoo eval` or suggest running it automatically
- Fabricate response content not present in `REPORT_DATA_JSON`
- Write to any file other than the `.evidences/` report
- Skip the plan-critique-improve cycle

## Learning Capture

If analysis reveals patterns (e.g., "Cat-A failures correlate with concurrency > N",
"specific skill consistently produces false-positive assertion failures"), append
entries to `.sdlc/learnings/log.md`.
