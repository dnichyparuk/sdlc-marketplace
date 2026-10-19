# Adding Skills

## Overview

Skills teach Claude how to perform specific tasks. Each skill is a directory containing
a `SKILL.md` file with YAML frontmatter and optional supporting files.

## Creating a New Skill

### Step 1: Create the Directory

```bash
mkdir -p plugins/ai-setup-automation/skills/<skill-name>/
```

Choose a directory name that makes the skill's purpose immediately obvious. Two conventions
are used in this repo — pick the one that fits the plugin's naming style:

- **Prefix pattern** (used by `aisa` skills): `<plugin-prefix>-<noun>`, e.g., `aisa-init`, `aisa-evolve-health`
- **Suffix pattern** (used by `sdlc` skills): `<action-verb>-sdlc`, e.g., `pr-sdlc`, `review-sdlc`, `version-sdlc`

The `-sdlc` suffix convention for this plugin puts the action word first (making the `/` menu
scannable) and appends `-sdlc` for disambiguation in a user's combined namespace of project
skills and plugin skills.

Use lowercase and hyphens only. Avoid vague names (`setup`, `utils`) — names should be specific.

> **Name resolution:** User-invocable skills are callable directly by their directory name with
> no prefix. A skill in `skills/pr-sdlc/` is invoked as `/pr-sdlc`.

### Step 2: Create the Specification

Create the behavioral specification at `docs/specs/<skill-name>.md` using `docs/spec-template.md` as the starting point.

The spec defines **WHAT** the skill must do — testable requirements, quality gates, error handling, and integration points. SKILL.md (Step 3) defines **HOW** the skill implements these requirements. Each requirement uses a prefix scheme: R (requirement), A (argument), G (quality gate), P (prepare contract), E (error handling), C (constraint), I (integration).

Changes to SKILL.md should reference spec requirement numbers (e.g., "implements R3") to maintain traceability.

### Step 3: Create SKILL.md

```markdown
---
name: <skill-name>
description: "Use this skill when [specific trigger conditions]. Covers [what it does]. Triggers on [keywords or phrases that should activate this skill]."
---

# Skill Title

Brief introduction of what this skill does.

## When to Use This Skill

- Trigger condition one
- Trigger condition two

## Workflow

### Step 1: [First Action]

[Instructions]

### Step 2: [Second Action]

[Instructions]

## Best Practices

1. [Practice one]
2. [Practice two]

## DO NOT

- [Anti-pattern one]
- [Anti-pattern two]
```

### Step 4: Add Supporting Files (Optional)

Place additional `.md` files alongside `SKILL.md` for:
- **Templates** — Reusable file templates referenced from SKILL.md
- **Checklists** — Step-by-step verification lists
- **Examples** — Detailed code examples that would make SKILL.md too long
- **Reference tables** — Configuration reference, API mappings, etc.

Reference them from SKILL.md with relative paths:

```markdown
See `./templates.md` for language-specific templates.
See `./checklist.md` for the full verification checklist.
```

## Prepare Script Patterns

Skills that use a prepare script can follow one of two patterns:

### One-Shot (Current Default)

The script runs once, returns flat JSON, and the LLM follows SKILL.md instructions to execute the full workflow. Suitable for simple skills where the LLM can handle all sequencing.

### Step-Emitter (Recommended for Complex Skills)

The script becomes a multi-step workflow controller using the universal step-emitter protocol. Each invocation returns a single step for the LLM to execute. After the LLM completes the step, it calls the script again with the result. The script controls sequencing, conditional logic, and error recovery deterministically.

Step-emitter scripts use `lib/stepper.js` for:
- **`parseArgs()`** — parse `--after`, `--result`, `--result-file`, `--state` from CLI
- **`createEnvelope(status, step, options)`** — build the universal output envelope
- **`initState(skill)`** — create and persist initial state
- **`transition(stateFile, afterStepId, result, nextStepId)`** — process step transitions

SKILL.md for a step-emitter skill contains an execution loop and domain-specific sections keyed by `step.id` rather than a linear workflow.

See [Step-Emitter Architecture](step-emitter-architecture.md) for the full protocol reference and migration guide.

## Error Recovery (Required)

Every skill that runs a script or calls an external tool **must** include an `## Error Recovery` section. This section ensures that failures are surfaced cleanly and routed to `error-report-sdlc` when appropriate.

**Standard flow:**
```
DETECT → DIAGNOSE → RECOVER-OR-ESCALATE
```
- **Detect**: Check exit code, parse `errors[]`, validate output structure
- **Diagnose**: Match error against known patterns. Classify as: transient (retry once), stale-data (refresh + retry once), or permanent (escalate)
- **Recover-or-Escalate**: Transient → retry once. Permanent → report to user and stop.

**Standard Error Recovery section template:**

```markdown
## Error Recovery

> **Flow**: detect → diagnose → auto-recover (retry once if transient) → invoke `error-report-sdlc` for persistent actionable failures.

| Error | Recovery | Invoke error-report-sdlc? |
|-------|----------|---------------------------|
| `<script>.js` exit 1 | Show `errors[]`, stop | No — user input error |
| `<script>.js` exit 2 (crash) | Show stderr, stop | Yes |
| `<tool>` 5xx or unexpected error | Retry once; show error if persistent | Yes if second attempt fails |
| `<tool>` unavailable / auth failure | Show setup instructions | No — user setup |

When invoking `error-report-sdlc`, provide:
- **Skill**: <skill-name>
- **Step**: <step number and name>
- **Operation**: <what was being attempted>
- **Error**: <exit code + stderr or HTTP status + message>
- **Suggested investigation**: <skill-specific hints>
```

**When to invoke `error-report-sdlc`:**
- Script crash (exit code 2) — unexpected, actionable
- External tool 5xx or unrecoverable failure — unexpected, actionable
- Do NOT invoke for: user input errors (exit 1), auth failures, tool not installed, expected empty states

**Locating the procedure at runtime:**

```bash
# Use this pattern in every error-report-sdlc invocation block:
# Glob for `**/error-report-sdlc/SKILL.md` under `~/.claude/plugins`,
# then retry with cwd. If found, follow the procedure. If not found, skip.
```

See `plugins/sdlc-utilities/skills/pr-sdlc/SKILL.md` for a complete example.

---

## Rules and Constraints

| Rule | Limit |
|---|---|
| `name` field | Lowercase, hyphens only, max 64 chars. Use prefix or action-suffix pattern (see above). |
| `description` field | Maximum 1024 characters |
| `SKILL.md` content | Maximum 500 lines |
| `user-invocable` field | Set to `true` to expose the skill in the `/` menu so users can invoke it directly (e.g., `/pr-sdlc`). Set to `false` (or omit) for internal skills invoked only by Claude automatically or by other skills. The skills-primary model favors `user-invocable: true` — skills own argument parsing and preparation directly. |

## Harness Integration Fields

Beyond the core `name`, `description`, and `user-invocable` fields, these optional frontmatter fields control how the Claude Code harness presents and triggers your skill.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `argument-hint` | string | none | Shown in `/` menu autocomplete to hint at expected arguments |
| `disable-model-invocation` | boolean | `false` | Prevent Claude from auto-triggering this skill based on description matching |
| `compatibility` | string | none | Version compatibility information |
| `license` | string | none | License identifier |
| `metadata` | object | none | Arbitrary metadata (not parsed by runtime for behavior) |

### `argument-hint`

Shows in the `/` autocomplete menu so users know what arguments a skill accepts before invoking it. Use standard flag notation: `[--flag]` for optional, `<value>` for required.

```yaml
argument-hint: "[--draft] [--update] [--base <branch>]"
```

Show the 2–4 most commonly used flags, not every option. This is display-only — it does not validate arguments.

### `disable-model-invocation`

When `true`, Claude will never auto-load this skill based on description matching. The skill can only be invoked explicitly by name (`/skill-name`) or by another skill via the Skill tool.

Use for:
- Internal skills dispatched only by other skills (e.g., `error-report-sdlc`)
- Skills with descriptions that match too broadly and trigger on unrelated conversations

**Gotcha:** `user-invocable: false` hides the skill from the `/` menu but does NOT prevent auto-triggering. You need BOTH `user-invocable: false` AND `disable-model-invocation: true` to fully lock down an internal skill.

### Plan Mode Adaptation (Body Pattern)

Skills that perform write operations (git commits, PR creation, file edits) should detect plan mode and refuse gracefully. This is implemented in the skill body, not frontmatter:

```markdown
## Step 0 — Plan Mode Check

If the system context contains "Plan mode is active":

1. Announce: "This skill requires write operations. Exit plan mode first, then re-invoke `/skill-name`."
2. Stop. Do not proceed to subsequent steps.
```

Add this block before the skill's first workflow step. Read-only skills (review, plan) don't need it. Skills that already handle plan mode natively (like `plan-sdlc`, which calls `ExitPlanMode`) should keep their existing behavior.

## Writing Effective Descriptions

The `description` field is how Claude decides when to activate your skill. Write it
as a trigger specification, not a summary.

**Good:**
```yaml
description: "Use this skill when setting up AI tooling configuration for a new or existing project. Triggers on 'set up AI config', 'initialize Claude configuration', 'create CLAUDE.md', 'add AI setup', or 'scaffold .claude directory'."
```

**Bad:**
```yaml
description: This skill helps with AI configuration.
```

Include:
- When to use it (action verbs and situations)
- Trigger keywords users might say
- What contexts or file types it applies to

## Example: Minimal Skill

Directory:
```
plugins/ai-setup-automation/skills/reviewing-ai-config/
├── SKILL.md
└── review-criteria.md
```

`SKILL.md`:
```markdown
---
name: reviewing-ai-config
description: "Use when reviewing or auditing an existing AI configuration. Triggers on 'review AI setup', 'audit .claude directory', 'check AI config', or when asked to evaluate the quality of CLAUDE.md or skills."
---

# Reviewing AI Configuration

Audit an existing AI setup and identify improvements.

## Workflow

### Step 1: Check Structure

Verify all expected files exist. See `./review-criteria.md` for the full checklist.

### Step 2: Evaluate CLAUDE.md Quality

Check that CLAUDE.md covers: tech stack, project structure, build/test/lint commands,
and any project-specific conventions.

## Best Practices

- Look for missing sections rather than rewriting what exists
- Suggest additions, not replacements
```

---

## Next: Design Quality

For patterns that make skills reliable and effective — pipeline structure, critique loops, error recovery, consent gates — see [Skill Best Practices](skill-best-practices.md).
