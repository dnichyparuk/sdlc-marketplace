<!--
  Skill Specification Template (contract shape)

  Three-layer relationship:
  - Spec (docs/specs/<name>.md)  — WHAT the skill must do (behavioral contract, testable requirements)
  - SKILL.md (plugins/.../skills/<name>/SKILL.md) — HOW the skill does it (implementation steps, prompts, tool usage)
  - Docs (docs/skills/<name>.md) — Usage reference for end users (flags, examples, prerequisites)

  The spec is the source of truth. Changes to SKILL.md must cite spec ids (e.g., "implements R3").
  New skills need an accepted spec before writing SKILL.md.

  Prefix legend:
    R = Core Requirement    A = Argument       G = Quality Gate
    P = Prepare Contract    E = Error Handling  C = Constraint
    I = Integration
  Named ids (R-<slug>) are allowed alongside numbered ids. Step-emitter skills add P-STEP-n,
  P-TRANS-n and C-STEP-n (docs/step-emitter-architecture.md).

  Section rules:
  - The "##" sections below appear in this order. Group requirements by the behaviour they
    constrain, not by when they were added. A/G/P/E/C/I ids normally sit in their home section
    (A → Inputs and flags, G → Gates, P → Prepare script contract, E → Failure handling and
    resume, C → Invariants and constraints, I → Integration). An id may sit where its behaviour
    lives (e.g. a dispatch-field P-id under Dispatch and routing).
  - Omit "## Prepare script contract" when **Prepare script:** is none, and "## Appendix — history"
    when there is no history. Every other section is required; a required section with nothing to
    state contains the single line "None."
  - "###" sub-headings may group entries inside a section.

  Identifier rules:
  - Ids are stable anchors cited by SKILL.md, agents, scripts and promptfoo datasets. Never
    renumber, rename or reuse an id. A new requirement takes the next free number or a new R-slug.
  - Acceptance criteria stay indented directly under their requirement ("  - Acceptance: …").
  - A withdrawn requirement leaves the body and moves to "### Withdrawn" in the appendix, keeping
    its id: "- R26 — withdrawn in 0.21.0 (see CHANGELOG 0.21.0): <reason>". Its id is never reused.
  - No GitHub issue numbers (#NNN, "Fixes #", "issue #") in the body. Record them in the
    appendix "### Issue trail" table, or in the CHANGELOG.

  Tuning rule:
  - Tuning values — model, effort, timeouts, intervals, retry counts, caps, limits — are not
    contract. They live in skill and agent frontmatter (plugins/<plugin>/agents/<name>.md), in
    config keys (.sdlc/config.json, .sdlc/local.json; defaults in schemas/*.schema.json) or in
    scripts/lib/* constants, and are documented in docs/cost-tiers.md. The spec names the knob,
    what it controls and where it is defined — never its value. Changing a tuning value needs no
    spec update (docs/cost-tiers.md §6). A model/effort value with no other home moves to
    docs/cost-tiers.md; any other value with no config key or constant stays in the spec until
    one exists.
-->

# <skill-name> Specification

> One-line purpose statement describing what this skill does and why it exists.

**User-invocable:** yes | no
**Prepare script:** `<path under plugins/<plugin>/scripts/>` | none

## Inputs and flags

<!-- Every flag and positional argument (A-ids), the config keys the skill reads, and inputs it derives (e.g. workspace). State what each controls. Give a default only when it is behaviour (e.g. "off"), not a tuning value. -->

- A1: `--flag` — behavior description (default: value)

## State model

<!-- Files that outlive one step: path pattern, keys, which component writes each key, lifecycle (create → update → cleanup), and what resume reads. Write "None." for stateless skills. -->

- R1: [Testable requirement about persisted state]

## Step composition

<!-- The ordered phases/steps and what each accomplishes (WHAT, not the procedure — that belongs in SKILL.md). When a phase executes a script, add indented sub-items:
       - **Script:** `script-name.js` (or `script-name.js --subcommand`)
       - **Params:** A-ids forwarded + internal params
       - **Output:** JSON → P-id range (brief summary of key fields)
     Step-emitter skills add a "### Step-emitter contract" sub-section here holding P-STEP-*, P-TRANS-* (the transition map) and C-STEP-* (docs/step-emitter-architecture.md). -->

1. CONSUME — [what inputs are consumed and validated]
   - **Script:** `example-prepare.js`
   - **Params:** A1-A3 forwarded (`--flag1`, `--flag2`, `--flag3`)
   - **Output:** JSON → P1-P5 (field summary)
2. DO — [what transformation or action is performed]

- R2: [Testable behavioral requirement]

## Dispatch and routing

<!-- What is dispatched (sub-skill, agent, script), to which agent file or skill, with which arguments, and what comes back. Name the agent file (`agents/<name>.md`) or the script that computes the dispatch fields. Never write model or effort values here: they live in the agent's frontmatter and are documented in docs/cost-tiers.md. -->

- R3: [Testable requirement about dispatch]

## Gates

<!-- Pass/fail criteria that must hold before the skill proceeds or reports success: consent gates, validation gates, deterministic CI checks. -->

- G1: [Gate name] — [pass/fail criteria]

## Prepare script contract

<!-- Output fields from the prepare script that the skill depends on. This is an interface boundary: if the script changes output shape, the skill breaks. For dispatch fields such as `model`, state that the field is forwarded verbatim, not its value. Omit this section when **Prepare script:** is none. -->

- P1: `fieldName` (type) — [what the skill uses this field for]

## Failure handling and resume

<!-- How the skill behaves under specific failure conditions, and how a later run resumes. -->

- E1: [condition] → [behavior]

## Invariants and constraints

<!-- Properties that always hold, and what the skill must NOT do. -->
<!-- MANDATORY when Prepare script is not "none" — include the following as R- and C-items (use the next free ids):
- R[N]: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (git state, config, flags, metadata) must originate from script output to ensure deterministic behavior
- C[N]:   Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C[N+1]: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C[N+2]: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C[N+3]: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
-->

- C1: [What the skill must not do]

## Integration

<!-- How this skill interacts with other skills, scripts, tools, or external systems. -->

- I1: [Other skill/tool] — [nature of interaction]

## Appendix — history

<!-- Not contract. Withdrawn ids (kept, never reused) and the issue trail. Omit when empty. -->

### Withdrawn

- R9 — withdrawn in 0.x.y (see CHANGELOG 0.x.y): [one-line reason]

### Issue trail

| Id | History |
|---|---|
| R4 | (issue #NNN) |
