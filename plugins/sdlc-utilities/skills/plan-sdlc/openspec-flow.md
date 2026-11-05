# plan-sdlc — OpenSpec flow

Read by SKILL.md Step 0 (the **OpenSpec:** pointer) when prepare output shows `openspec.present: true` or a non-null `fromOpenspec`. Each section holds the OpenSpec rules of one SKILL.md step, moved verbatim; apply each rule at the point of that step it names.

## Step 0 — Mode Detection, Routing, and Setup

**Contradictory-signal override:** After reading the prepare output, IF `openspec.authoritative.path` is set AND the current session-start `<system-reminder>` contains a line matching `/openspec.*not initialized|not initialized.*openspec/i`, print exactly one line: <!-- implements R16 -->
`Ignoring contradictory 'not initialized' signal in session context — openspec/config.yaml exists (authoritative source: SDLC's own check via plan.js prepare output).`
Then continue the flow. If the contradictory phrase is absent, emit nothing.

**`--from-openspec` handling (after prepare output, before gate check):**

If `fromOpenspec.valid` is true in the prepare output:
1. Read in parallel: `openspec/changes/<name>/proposal.md`, `openspec/changes/<name>/design.md` (optional), all `openspec/changes/<name>/specs/*.md`, `openspec/changes/<name>/tasks.md` (optional)
2. Store as `openspecContext`. Set `fromOpenspecDirect = true`
3. Skip to Step 1 — bypass the gate check entirely

If `fromOpenspec` is present but `valid` is false and errors exist: display errors and stop.

**OpenSpec integration (opt-in — requires `--spec` flag or explicit spec path):**

1. Run `node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" detect` (substitute `<PLUGIN_ROOT>` from the `sdlc plugin root:` context line) and keep its JSON as `openspecDetect`. If `openspecDetect.detected` is false, skip this entire block — no OpenSpec in this project.
2. **Gate check:** If `openspec/config.yaml` exists but neither `--spec` flag was passed NOR the user provided a path into `openspec/changes/`:
   a. **Classify the request:** Determine whether the user's task involves functional changes (new features, behavior modifications, API changes, new integrations, capability additions) vs non-functional changes (refactoring, config, docs, CI/CD, dependency updates, formatting, infrastructure).
   b. **Non-functional changes:** Print:
      > OpenSpec detected — pass `--spec` to include spec context in planning.
      Then skip the rest of this block. `openspecContext` remains empty.
   c. **Functional changes:** Check whether an active OpenSpec change already covers this work — a match is `openspecDetect.matchedBy === "branch"` (the change is `openspecDetect.changeName`). If a match is found, treat it as if the user passed `--spec` and continue to step 3. If no match, use AskUserQuestion:
      > This looks like a functional change. This project uses OpenSpec for spec-driven development.
      >
      > Options:
      > 1. **Start OpenSpec flow** — use the openspec CLI to author a change first (for non-trivial features requiring full spec workflow)
      > 2. **Generate OpenSpec artifacts as plan appendix** — plan generates proposal, spec deltas, and tasks as inline appendix content (recommended default)
      > 3. **Use existing spec** — pass `--spec` if you already have an OpenSpec change for this
      >
      > Select (1/2/3):
      When `--from-openspec` was not passed and prepare output `openspec.branchMatch` names a change at stage `ready-for-plan`, show option 3 as: `3. **Use existing spec** — re-invoke with /plan-sdlc --from-openspec <matched-change-name>`.

      - On **1**: Stop plan-sdlc. Tell the user to use the openspec CLI directly to create a change (run `openspec --help` for available commands). In plan mode, call ExitPlanMode first.
      - On **2** (recommended default — implements R63): Do NOT prompt the user further at this gate (R22 single-touchpoint). Set `openspecInlineGenerate = true`. `openspecContext` stays empty, so OpenSpec enrichment, Gate A, and openspec-task annotations do not activate — artifact authoring is deferred to Step 4 (OpenSpec Appendix generation), where exploration and decomposition data are available. Skip the rest of the OpenSpec block (steps 3–6 — there is no on-disk change to load). Continue with standard planning.
      - On **3**: Re-run the OpenSpec loading logic (steps 3–6) to resolve and load the active change.
3. If the user provided a spec file path pointing into `openspec/changes/<name>/`, extract `<name>` as the active change.
4. Otherwise, use `openspecDetect.changeName` when it is non-null (`matchedBy` `branch` or `single-active`). If it is null and `openspecDetect.activeChanges` has more than one entry, use AskUserQuestion:
   > Multiple active OpenSpec changes found. Which one are you working on?
   List the change names as options.
5. Once the active change is identified, Read in parallel:
   - `openspec/changes/<name>/proposal.md` — intent and scope
   - `openspec/changes/<name>/design.md` — technical approach (may not exist yet; skip if absent)
   - All files matching `openspec/changes/<name>/specs/*.md` — delta specs (the requirements)
   - `openspec/changes/<name>/tasks.md` — OpenSpec's task checklist (may not exist; skip if absent)
6. Store these as `openspecContext` for use in Steps 1–5. Update the plan file header `**Source:**` to `openspec/changes/<name>/`.

## Step 1 — Requirements Discovery and Exploration

**`fromOpenspecDirect` enrichment:** When `fromOpenspecDirect` is true (set by `--from-openspec` handling in Step 0):
- Use `tasks.md` as the PRIMARY decomposition skeleton — OpenSpec tasks were deliberately authored
- Skip the "Structured discovery" AskUserQuestion below — the proposal and delta specs already provide scope, integration, and success criteria
- Delta specs remain the authoritative requirements for Step 3 coverage validation

**OpenSpec enrichment (when `openspecContext` is available):**
- Use `proposal.md` for goal and scope understanding (what's in, what's out)
- Use delta specs (`specs/*.md`) with their ADDED/MODIFIED/REMOVED sections as the authoritative requirements — each delta entry is a requirement
- Use `design.md` for architecture constraints and technical approach decisions
- Use `tasks.md` as a coarse reference for decomposition — OpenSpec tasks are higher-level than plan-sdlc tasks, so decompose further rather than copying verbatim
- When the OpenSpec artifacts provide sufficient scope, integration, and success criteria, skip the "Structured discovery" AskUserQuestion — the proposal and delta specs already answer those questions

**Gate A — Intake Audit:** <!-- implements R39 -->

When `openspecContext.requirements` is present (non-null) in the prepare output:

1. Dispatch one Gate A audit Agent from `intakeAuditDispatch` (P20) by the Step 3 dispatch rule: `subagent_type: intakeAuditDispatch.agent`, `description: "plan gate A"`, prompt = one `NAME: value` line per name in `intakeAuditDispatch.inputNames` (values from `presetInputs`, else from the run-time input table in Step 3). Do not pass `model` or `effort` (`agent-dispatch-script-driven` guardrail). If `intakeAuditDispatch.agentPath` is null, skip Gate A and emit one note: `Gate A skipped — plan-intake-verify agent file not found.`

2. The artifacts read in Step 0 are the values of `PROPOSAL`, `DELTA_SPECS`, `TASKS_MD` and `DESIGN` (see the run-time input table in Step 3); `REQUIREMENTS_JSON` is preset.

3. Parse the agent's JSON response `{ findings, verdict, skipped }`.

4. Verdict handling:
   - `verdict: "CRITICAL"` — **block decomposition**. Do NOT proceed to Step 2. Surface findings to user with E7 menu: (a) fix source change artifacts and re-run; (b) override (proceed anyway, recording the override in `## Intake Audit Caveats`). No `--auto` bypass for CRITICAL.
   - `verdict: "WARNING"` or `"SUGGESTION"` — append a `## Intake Audit Caveats` section to the plan file listing the findings. Proceed to Step 2.
   - `verdict: "PASS"` — proceed to Step 2 without any caveat section.

5. When `openspecContext` is absent (non-OpenSpec plan), skip Gate A entirely. Emit one note: `Gate A skipped — plan is not OpenSpec-sourced.`

## Step 2 — Decompose Into Tasks

**`fromOpenspecDirect` decomposition:** When `fromOpenspecDirect` is true:
- Adopt the task structure from `tasks.md` as the starting skeleton
- For each OpenSpec task: map to one plan task (or split if > 5 files), add Complexity/Risk/Depends on/Verify metadata, and expand the description to be self-contained for agent dispatch
- If `tasks.md` is absent (prepare output shows `hasTasks: false`), fall back to standard decomposition from delta specs below

**OpenSpec task annotation:** When `fromOpenspecDirect` is true AND `openspecContext.tasks[]` is non-null in the prepare output, each plan task derived from one or more OpenSpec tasks MUST carry an `openspec-task:` block beneath its standard metadata fields. Format documented in `./plan-format-reference.md`: <!-- implements R29 -->

```
**openspec-task:**
- change: <change-name>
- ref: <kebab-slug-6char-hash from openspecContext.tasks[i].ref>
- line: <openspecContext.tasks[i].line>
- title: <openspecContext.tasks[i].title>
```

Plan tasks NOT derived from any OpenSpec task MUST omit the field. N:1 mapping (multiple plan tasks → same `ref`) is allowed when one OpenSpec task expands into several plan tasks — copy the same `change`/`ref`/`line`/`title` quad on each.

**Out-of-scope OpenSpec tasks:** When the plan introduces a plan-only task with no OpenSpec source, the plan-author MUST also append (or extend) an `## Out-of-scope OpenSpec tasks` section listing each uncovered OpenSpec task title with a one-line rationale — OR add at least one plan task carrying that `ref`. Every entry from `openspecContext.tasks[]` must be either covered by ≥1 plan task's `openspec-task.ref` OR listed in `## Out-of-scope OpenSpec tasks`. This is enforced by G16 in Step 3. <!-- implements R30 -->

**OpenSpec-aware decomposition (when `openspecContext` is available):**
- Map each ADDED and MODIFIED requirement from the delta specs to at least one task
- In the Key Decisions section, note which OpenSpec `design.md` decisions were adopted and which (if any) were overridden with rationale
- Set the plan header `**Source:**` field to `openspec/changes/<name>/` (not "conversation context")

## Step 4 — Revise Plan and Present for Approval

**G16 (OpenSpec tasks.md coverage) failure resolution:** When G16 reports uncovered OpenSpec task entries, resolve each one by EITHER (a) adding a plan task with the missing `openspec-task` block carrying the corresponding `ref`, OR (b) appending the uncovered title under the `## Out-of-scope OpenSpec tasks` section with a one-line rationale. Both paths are valid; choose based on whether the implementation actually covers the work.

**OpenSpec Appendix generation:** Three-way conditional: <!-- implements R59, R63 -->

**(a)** When `fromOpenspecDirect` is true (full-pipeline OpenSpec path), populate the `## OpenSpec Appendix` section with:

1. **Requirement inventory table** — one row per entry from `openspecContext.requirements[]` with columns: reqId, capability, type, covering task(s).
2. **Delta-spec fragments** — reproduce each delta-spec file's content so a reviewer does not need to open OpenSpec files separately.

**Nested-fence safety (N+1 backticks):** Delta-spec fragments are themselves markdown containing fenced code blocks. Before fencing a fragment, count the longest consecutive backtick run (N) appearing anywhere inside the fragment's content. Wrap the fragment in a fence of max(N+1, 4) backticks — CommonMark closes a fence only on a run at least as long as the opening run, so the longer outer fence passes shorter inner runs through untouched. Each fragment is fenced independently (different fragments may need different outer fence lengths).

**(b)** When `openspecInlineGenerate` is true (inline generate path from gate check Option 2, implements R63), populate the `## OpenSpec Appendix` section with an **OpenSpec Artifacts (Draft)** label and author fresh artifacts from exploration and decomposition data:

1. **`### Proposal Summary`** — author a proposal summary from the user's request and exploration findings. Wrap with `<!-- openspec-target: proposal.md -->`.
2. **`### Delta Specs`** — author spec deltas with ADDED/MODIFIED/REMOVED sections derived from exploration and decomposition. Wrap with `<!-- openspec-target: specs/<feature-name>.md -->`.
3. **`### Tasks List`** — author a tasks checklist derived from the plan's task decomposition. Wrap with `<!-- openspec-target: tasks.md -->`.

Each fragment MUST be wrapped with `<!-- openspec-target: <path> -->` annotations as shown above. The appendix MUST be complete enough that `openspec create`/`openspec validate` can run directly off it after handoff, with no further interactive authoring step. Apply the same nested-fence safety (N+1 backticks) rule to any fenced content within the authored artifacts.
