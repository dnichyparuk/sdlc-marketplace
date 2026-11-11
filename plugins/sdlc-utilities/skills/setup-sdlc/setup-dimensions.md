# Dimensions Sub-Flow

Project-aware dimension creator: consumes tech stack scan results from parent,
proposes tailored dimensions with evidence, lets the user select, writes files,
and validates with the validation script.

> **Permission context:** This sub-flow inherits the parent skill's permission mode.
> Do NOT call ExitPlanMode, change permission settings, or exit any mode during this sub-flow.
> Do NOT ask the user to approve file writes individually — the parent (setup-sdlc) manages mode transitions.
> Write all dimension files in a single Bash block or rapid sequence to minimize permission prompts.

Supporting references (dimension format spec, 5 example dimensions) are the plugin's
own files `<PLUGIN_ROOT>/skills/review-sdlc/REFERENCE.md` and
`<PLUGIN_ROOT>/skills/review-sdlc/EXAMPLES.md` (setup-sdlc R-plugin-root-refs;
`<PLUGIN_ROOT>` is the path from the `sdlc plugin root:` context line). Read them at
those paths. Do not search for them with Glob: a search can return a stale cached install.

---

## Arguments

- `--add` — expansion mode: propose only dimensions not already installed
- `--no-copilot` — skip GitHub Copilot instructions entirely (bypasses the GitHub hosting prompt)

---

## Scan Input

This sub-flow expects the parent skill (setup-sdlc) to have provided the scan in `prepare.scan` as "Scan Input":

- **Dependency manifests** — `signals.frameworks` and `signals.languages`, plus the manifest contents in `files`
- **Directory structure** — `signals.structure`
- **CI/CD config** — `ciFiles`
- **Database and test signals** — `signals.hasDatabase`, `signals.hasTests`
- **Existing review dimensions** — `signals.reviewDimensions`
- **GitHub hosting detection** — `hosting.github`

All structural and dependency evidence has been collected. This sub-flow consumes it and produces dimension proposals and installed files.

---

## Workflow

### Step 2 — Discover Existing Dimensions

Check `.sdlc/review-dimensions/` for already-installed dimension files.

In `--add` (expansion) mode:

- Run the validation script:
  ```bash
  node "<PLUGIN_ROOT>/scripts/ci/validate-dimensions.js" --project-root . --json
  ```
- Extract installed dimension names and their trigger patterns (new proposals must avoid identical globs).

Also check for uncovered file suggestions from a recent review run:

```bash
node "<PLUGIN_ROOT>/scripts/skill/review.js" --project-root . --json 2>/dev/null
```

If this succeeds, parse `plan_critique.uncovered_suggestions` and use as additional evidence in Step 3 (cite: "Recent review found N uncovered files matching this pattern"). If the command fails, silently skip.

If NOT in expansion mode: skip this step.

---

### Step 3 (PLAN) — Propose Dimension Catalog

Read `./dimension-catalog.md` for dimension definitions. Propose dimensions matching detected evidence from Core, Extended, and Project-type sections.

**Rules:**

- Only propose a dimension if there is concrete evidence
- Always include `code-quality-review` as the baseline
- In `--add` mode: exclude installed dimensions; cite uncovered file suggestions as evidence
- Distinguish `api-review` (route/controller code quality) from `api-contract-review` (schema file changes); flag if both are proposed
- Distinguish `documentation-review` (docs presence/structure) from `documentation-quality-review` (docs content accuracy); flag if both are proposed
- When `openspec/config.yaml` is detected, propose `spec-compliance-review` (high severity) — this dimension verifies that code changes satisfy the delta spec requirements from the active OpenSpec change. The dimension body should reference `openspec/changes/*/specs/` as the authoritative requirements source and include checklist items for: every ADDED requirement has corresponding implementation, every MODIFIED requirement's changes are reflected in code, no REMOVED requirements still have active code paths.

For each proposed dimension, prepare: name (lowercase-hyphenated), description (one sentence, max 256 chars), why relevant (cite specific evidence), trigger patterns (match actual directory names), skip-when patterns, and a tailored body checklist.

**Customization is mandatory** — reference the project's actual stack in the body (e.g., "Check SQLAlchemy ORM usage — avoid raw `session.execute()` with string concatenation", not just "avoid raw SQL").

---

### Step 4 (CRITIQUE) — Evaluate Proposals

| Gate | Check |
|---|---|
| Trigger specificity | Any trigger matching `**/*` or broader? Tighten to actual directories found. |
| Overlap | Two proposed dimensions share identical trigger file sets? Flag for merging. |
| Evidence quality | Each proposal backed by concrete scan findings? Remove any without evidence. |
| Instructions tailored | Each body references project's specific framework by name? Add context if not. |
| Expansion gaps (`--add`) | Project patterns not covered by existing OR proposed dimensions? |
| Uncovered coverage (`--add`) | All `uncovered_suggestions` from Step 2 now covered? List any that remain. |
| Trigger validity | Patterns conform to glob syntax (no `***`, balanced brackets)? |
| Dimension distinction | If both `api-review`+`api-contract-review` or both doc variants proposed, confirm both are justified. |

---

### Step 5 (IMPROVE) — Refine Proposals

Based on the critique: tighten broad triggers, resolve overlaps (merge or split for exclusive coverage), add project-specific framework names to each body, remove dimensions without concrete evidence.

---

### Step 6 (DO) — Present and Create

**Present proposals** as a numbered list with evidence summaries:

```text
Proposed review dimensions for this project:

1. code-quality-review (medium severity) — always included
   Coverage: **/*.ts, **/*.tsx
   Why: TypeScript project with 47 source files

2. security-review (high severity)
   Coverage: **/middleware/**, **/auth/**, **/*auth*
   Why: Found `jsonwebtoken` and `passport` in package.json; src/auth/ with 8 files
```

Use AskUserQuestion to ask: "Install which dimensions?" Options: **all** / **select** (comma-separated numbers) / **cancel**.

For each selected dimension:

1. `mkdir -p .sdlc/review-dimensions`
2. Write the full dimension file (frontmatter + tailored body). Use the corresponding example from `<PLUGIN_ROOT>/skills/review-sdlc/EXAMPLES.md` as the starting template, then customize with project-specific evidence.
3. Confirm each file written with its path.

---

### Step 7 — Validate Installation

Run the validation script:

```bash
node "<PLUGIN_ROOT>/scripts/ci/validate-dimensions.js" --project-root . --markdown
EXIT_CODE=$?
```

- Exit code **1**: Show validation errors. Use AskUserQuestion: "Fix these validation errors automatically? (yes / no)"
- Exit code **2**: Show `Script error — see output above` and stop. Dispatch `error-report-sdlc` with `--skill setup-sdlc --step "dimensions: Step 7"`, `--operation validate-dimensions.js` and the stderr as `--error-text`.

Present the markdown output table. If any file has errors, show the error detail and offer to fix them automatically.

---

### Step 8 (COPILOT) — Propose GitHub Copilot Review Instructions

Check `gh auth status` first; if unauthenticated, skip this step with a one-line notice.

**Skip this step if:** Step 7 reported any errors, or `copilotEnabled` is false (determined by the scan in `prepare.scan`).

**Check existing state:** Glob `.github/instructions/*.instructions.md`. If files exist with the same names as selected dimensions, confirm overwrite. In `--add` mode: when `_common.md` exists and contains new or changed content, regenerate ALL existing mirrors (not just newly added ones) to incorporate the common instructions; otherwise, only generate for newly added dimensions.

**PLAN — map dimensions to files:** Show the proposed `.github/instructions/<name>.instructions.md` list with `applyTo` and estimated char count. Use AskUserQuestion: "Generate these Copilot instruction files?" Options: **yes** / **no** / **select** (numbers).

**CRITIQUE — before writing:**

| Check | Rule |
|---|---|
| Broad `applyTo` | Flag any pattern that is `**/*` or `**` alone for tightening. |
| 4,000-char overflow | Estimate char count; flag any that exceed the limit. |
| Duplicate `applyTo` | Note overlapping patterns across files (acceptable but worth flagging). |

**IMPROVE — before writing:** Condense instructions exceeding 4,000 chars (remove verbose prose, keep checklist and severity table; if still over, truncate and add `<!-- truncated to fit 4,000-char Copilot limit -->`). Tighten broad `applyTo` patterns.

**DO — write files:**

1. **Check for the common prompt once:**
   ```bash
   test -f '.sdlc/review-dimensions/_common.md'
   ```
   Run this as one plain Bash call. Exit code 0 in the tool result (no error shown) means the common prompt exists; any other exit code means it is absent. An empty `_common.md` needs no special case: the generator ignores a blank common file, so its mirror equals the mirror without one.

2. `mkdir -p .github/instructions`
3. For each selected dimension, generate its mirror deterministically using the dimension-to-instructions.js script. Run exactly one of the two commands, as one plain Bash call, with `<name>` substituted:

   When the common prompt exists:
   ```bash
   # Substitute <PLUGIN_ROOT> and <name> (from the dimension filename)
   node "<PLUGIN_ROOT>/scripts/lib/dimension-to-instructions.js" --file '.sdlc/review-dimensions/<name>.md' --common-file '.sdlc/review-dimensions/_common.md'
   ```

   When it is absent:
   ```bash
   # Substitute <PLUGIN_ROOT> and <name> (from the dimension filename)
   node "<PLUGIN_ROOT>/scripts/lib/dimension-to-instructions.js" --file '.sdlc/review-dimensions/<name>.md'
   ```

   The command's stdout is `MIRROR`; its exit code from the tool result is `GEN_EXIT` (a tool result without an error is exit code 0).
   
   If `GEN_EXIT` is non-zero (unparseable dimension), display the error and skip this dimension.

4. Write `.github/instructions/<name>.instructions.md` with the generated `$MIRROR` content.

5. Confirm each file with its path and character count. Print a final summary listing all generated files with sizes.

---

## Quality Gates

- Every proposed dimension cites specific project evidence (file paths, dependency names, counts)
- Every created dimension passes all D1-D12 validation checks
- No duplicate dimension names (including against existing dimensions in `--add` mode)
- All trigger patterns reference the project's actual directory structure, not generic defaults

---

## Error Recovery

| Error Type | Example | Invoke error-report-sdlc? | Recovery Action |
|---|---|---|---|
| User error — missing tools | `gh` not authenticated, `node` not on PATH | No | Tell user clearly. Provide the command to fix it. |
| User error — wrong flags | `--add` with no dimension name | No | Show correct usage. Ask user to re-invoke. |
| Transient — MCP timeout | Atlassian MCP network failure | No | Retry once; if fails again, skip MCP signal. |
| Stale cache | Dimension metadata out of sync | No | Re-run scan from scratch (Step 1). |
| Script crash — exit 2 | validate-dimensions.js uncaught exception | Yes | Invoke `error-report-sdlc` with full context. |
| Script error — exit 1 | Invalid dimension file format | No | Show validation errors; let user correct manually. |
| MCP tool unavailable | Atlassian MCP not configured | No | Warn; continue scan with remaining signals. |

---

## Gotchas

- **Dimension file naming collision.** In `--add` mode, the skill derives a filename from the dimension name. If a file with that name already exists, it will be silently overwritten. Always check before writing.
- **validate-dimensions.js YAML parser limitations.** The script uses a hand-rolled parser for simple key-value frontmatter only. Multi-line or nested YAML produces a misleading "malformed frontmatter" error. Use flat key-value frontmatter only.
- **skill/review.js not available at init time.** If not found via standard resolution in `--add` mode, skip the dimension matching step and proceed with manual scan.
- **GitHub hosting detection is multi-signal.** The primary `git remote -v` check may miss custom SSH aliases (e.g., `github-rn:org/repo`), but `gh repo view` (Signal 2) resolves the actual remote URL regardless of local SSH config. The `.github/` directory fallback (Signal 3) is a weak heuristic — it can false-positive for repos that have GitHub Actions config but are hosted elsewhere. If all three signals fail, use `--no-copilot` to bypass.

---

## DO NOT

- Do NOT create dimension files without first running the tech stack scan (the scan in `prepare.scan`)
- Do NOT skip the validate-dimensions.js step — invalid dimensions cause review-sdlc to fail silently
- Do NOT overwrite existing dimension files without explicit user consent
- Do NOT propose more than 10 dimensions at once — offer expansion in follow-up runs with `--add`
- Do NOT invoke `error-report-sdlc` for user errors — only for script crashes (exit 2)

---

## What's Next

After setting up review dimensions, common follow-ups include:
- `/review-sdlc` — run a code review with the new dimensions
- `/commit-sdlc` — commit the dimension files

## See Also

- `review-sdlc/REFERENCE.md` — dimension file format spec and examples
- `review-sdlc/EXAMPLES.md` — 5 copy-paste-ready dimension files to adapt
- [`/review-sdlc`](../review-sdlc/SKILL.md) — uses the dimensions created by this skill
- `/setup-sdlc --pr-template` — custom PR template configuration
- `/setup-sdlc --guardrails` — plan mode guardrails configuration
