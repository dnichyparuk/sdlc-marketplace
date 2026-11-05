# G17 Dimension Coverage Prompt Template

Use this template in plan-sdlc Step 3 when dispatching the G17 Dimension Coverage subagent.

**Purpose:** Judge the behaviour criteria (B1–B4) and write one `why` sentence per review-dimension candidate. `plan.js g17-prepare` has already done the deterministic part, and `plan.js merge-lanes` ranks, caps and renders the result as the `## Suggested Review Dimensions` advisory block.

**Model:** sonnet (from `g17Dispatch.model` in prepare output — do NOT hardcode)

**Dispatch parameters (from prepare output — `agent-dispatch-script-driven` guardrail):**
- `subagent_type`: `g17Dispatch.subagentType`
- `model`: `g17Dispatch.model`
- prompt body: fill the template variables below from prepare output and plan context

```
Agent tool:
  subagent_type: <g17Dispatch.subagentType from prepare output>
  description: "G17 Dimension Coverage analysis for <plan title>"
  model: <g17Dispatch.model from prepare output>
  prompt: |
    You are the Dimension Coverage subagent (G17). A script has already parsed the
    catalog, matched plan paths against trigger globs, evaluated C1–C6 and U1–U6,
    applied suppression and the learnings deferral. Your job is the part that needs
    judgment.

    **This gate is advisory (non-blocking).** Never fail or halt plan finalization.
    If you cannot complete a step, return `{"candidates":[]}`.

    ## Inputs

    - Plan file path: {PLAN_FILE_PATH}
    - Script result (g17-prepare): {FIRED_CRITERIA_JSON}
      Fields used here: `coveredDims` (`[{name, file, paths}]`), `candidates`
      (`[{kind, dimension, criteria, severity, paths, triggers?, patch?}]`), `deferred`.

    Skip `## OpenSpec Appendix` content.

    ## Step 1 — Behaviour criteria (B1–B4)

    Read `{PLAN_FILE_PATH}`. For each task whose Files paths appear in
    `coveredDims[i].paths`, apply these criteria to that task's text, against
    dimension `coveredDims[i].name`. Skip dimensions listed in `deferred`.

    - **B1**: Description indicates a public API, CLI flag, environment variable, webhook, hook, or frontmatter contract change. Severity: high.
    - **B2**: Description references authentication, cryptography, PII, IAM, secrets, or session management — and a `security`-type dimension exists. Severity: high.
    - **B3**: Description indicates an invariant flip: sync↔async, idempotent↔non-idempotent, atomic↔multi-step, blocking↔non-blocking. Severity: critical.
    - **B4**: Description adds or removes a runtime dependency (new `require()`, import, npm package) that changes the module surface. Severity: medium.

    **Pure-refactor suppression**: Do NOT fire B-criteria when the Description explicitly indicates rename-only, formatting, type-narrowing without semantic change, or dead-code removal. Look for markers like "rename-only", "no behavior change", "pure refactor", "formatting only".

    Each fired criterion yields
    `{"kind":"UPDATE-behavior","dimension":"<name>","criteria":["B1"],"severity":"<severity>","taskRefs":["Task 3"],"patch":"<one-line patch description>"}`.
    Merge it into an UPDATE-behavior candidate of the same dimension when one exists
    (union of criteria and taskRefs, the higher severity).

    ## Step 2 — Why

    For every script candidate and every Step 1 candidate, write one sentence `why`
    that cites a task number and a path or a quoted phrase from the plan.

    ## Output

    Return one fenced `json` block as the last content of your response:

    ```json
    {
      "candidates": [
        { "kind": "CREATE", "dimension": "<script candidate's dimension>", "why": "<one sentence>" },
        { "kind": "UPDATE-behavior", "dimension": "<name>", "criteria": ["B1"], "severity": "high", "taskRefs": ["Task 3"], "patch": "<one line>", "why": "<one sentence>" }
      ]
    }
    ```

    Script candidates carry only `kind`, `dimension` and `why`; do not change their
    criteria, severity, triggers or patch.

    ## DO NOT

    - Propose REMOVING any checklist item from an existing dimension (strengthen-only invariant).
    - Emit absolute GitHub blob URLs (use relative paths or slash commands only).
```

## Handling G17 Subagent Output

After the subagent returns, in main context:

1. Write the fenced `json` block verbatim to `<ITER_DIR>/dimension-coverage.json` with the Write tool.
2. `plan.js merge-lanes` attaches each `why`, adds the UPDATE-behavior candidates, ranks, caps at 3 and renders. Read `g17Findings` from `merged.json`.
3. **On dispatch failure, timeout, or no JSON:** write nothing. merge-lanes records an advisory lane failure and builds the findings from the script candidates alone. Log the failure to `.sdlc/learnings/log.md`:
   ```
   ## YYYY-MM-DD — plan-sdlc: G17 dispatch failed — <error summary>
   ```
   Never block plan finalization on a G17 fault (R31).

## Template Variable Reference

| Variable | Source | Notes |
|---|---|---|
| `{PLAN_FILE_PATH}` | Plan file path resolved in Step 0/3 | Absolute path |
| `{FIRED_CRITERIA_JSON}` | contents of `<ITER_DIR>/g17-prepare.json` | JSON object, verbatim |
