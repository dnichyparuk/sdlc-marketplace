# Architecture

## Overview

This repository serves two roles:

1. **Marketplace** — The root `.claude-plugin/marketplace.json` makes the repo installable
   as a Claude Code marketplace
2. **Plugin** — One plugin lives under `plugins/sdlc-utilities/` with its own skills, commands, hooks,
   scripts, and agents

## Directory Structure

```text
sdlc-marketplace/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace manifest (entry point)
├── plugins/
│   └── sdlc-utilities/           # Plugin: SDLC automation
│       ├── .claude-plugin/
│       │   └── plugin.json       # Plugin manifest (name: "sdlc")
│       ├── agents/               # Agent definitions (orchestrators spawned by skills)
│       ├── skills/               # Skill definitions (user-invocable skills appear in the / menu)
│       │   └── <skill-name>/
│       │       ├── SKILL.md      # Skill entry point (YAML frontmatter + instructions)
│       │       └── *.md          # Optional supporting files
│       ├── hooks/
│       │   └── hooks.json        # Hook configuration
│       └── scripts/
│           ├── skill/                 # Invoked by skills to pre-compute context
│           │   ├── commit.js, pr.js, review.js, ...
│           ├── ci/                    # CI validation and maintenance
│           │   ├── validate-dimensions.js, validate-discovery.js, ...
│           ├── state/                 # State persistence CLIs
│           │   ├── execute.js, ship.js
│           ├── util/                  # Action utilities
│           │   ├── ship-init.js
│           └── lib/                   # Shared modules (git, config, state, ...)
└── docs/                         # Documentation
```

## How It Works

### Marketplace Layer

The root `marketplace.json` tells Claude Code: "This repository contains plugins. Here
is where to find them." It lists each plugin with a name and a relative source path.

When a user runs `/plugin marketplace add rnagrodzki/sdlc-marketplace` in Claude Code:

1. Clones or references this repository
2. Reads `.claude-plugin/marketplace.json`
3. Discovers the listed plugins and makes them available to browse

No plugins are installed yet at this point. The user must then run `/plugin install sdlc@sdlc-marketplace` (or use the interactive **Discover** tab in `/plugin`) to install the plugin.

**Important:** The `name` in each `marketplace.json` plugin entry must match the `name` in the corresponding `plugin.json`. A mismatch causes "plugin not found" errors when users try to update via the `/plugin` UI, because Claude Code looks up the installed plugin identity (from `plugin.json`) in the marketplace catalog.

### Plugin Layer

Each plugin has its own `.claude-plugin/plugin.json` that declares:

- **name** and **description** — Identification
- **version** — Semantic version for tracking updates
- **author** — Who maintains this plugin

### Name Resolution

When a plugin is loaded from a marketplace, Claude Code installs skills so that
user-invocable skills are callable directly by their directory name — with **no prefix**.

**Skills** — a skill named `pr-sdlc` in `skills/pr-sdlc/` is invoked as `/pr-sdlc`:

| Directory             | Invocation        |
|-----------------------|-------------------|
| `skills/pr-sdlc/`     | `/pr-sdlc`        |
| `skills/review-sdlc/` | `/review-sdlc`    |
| `skills/version-sdlc/`| `/version-sdlc`   |

The `-sdlc` suffix on each skill name provides disambiguation: action word first,
`-sdlc` suffix ensures the skill is identifiable in a user's combined skill namespace
(project skills + plugin skills). Use the pattern `<action>-sdlc` for all skills in
this plugin.

The `name` field in `plugin.json` is a plugin identifier used for marketplace/update
operations — **not** the prefix for skill invocations. Keep it stable.

### Skills

Skills are directories under `plugins/<plugin>/skills/`. Each skill directory must
contain a `SKILL.md` file with YAML frontmatter:

```yaml
---
name: skill-name
description: "When Claude should invoke this skill (max 1024 characters)"
user-invocable: true
---
```

The `description` field is critical — Claude uses it to decide when to activate the
skill. Write it as a trigger condition, not a summary.

Set `user-invocable: true` to make the skill appear in the `/` menu so users can invoke
it directly (e.g., `/pr-sdlc`). Set it to `false` for internal skills that should only
be invoked by Claude automatically or by other skills — not by users directly.

Supporting files (`.md` templates, checklists, scripts) live alongside `SKILL.md` in
the same directory. Reference them with relative paths like `./supporting-file.md`.

### Commands (legacy)

Commands are `.md` files under `plugins/<plugin>/commands/`. The filename (without `.md`)
becomes the slash command name, prefixed with the plugin name. Each file has YAML
frontmatter:

```yaml
---
description: "Short description shown in command list"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash]
---
```

**The skills-primary model is preferred.** New functionality should be added as skills
with `user-invocable: true` rather than as commands. Commands remain supported for
backwards compatibility but are no longer the recommended entry point.

### Hooks

Hooks are defined in `plugins/<plugin>/hooks/hooks.json`. Available hook points:

| Hook          | When It Fires                                                         |
|---------------|-----------------------------------------------------------------------|
| `SessionStart`| When a Claude Code session begins                                     |
| `PreToolUse`  | Before a tool is invoked (use `matcher` to filter by tool name)       |
| `PostToolUse` | After a tool completes                                                |

See [adding-hooks.md](adding-hooks.md) for the complete list of hook events.

> **Note (#378, #379):** The former `pre-tool-agent-isolation-guard.js` PreToolUse hook has been removed (along with all PreToolUse guards). The Agent-SDK `isolation: "worktree"` anti-pattern is still avoided, but it is now documented as skill-prose guidance in the per-task and wave-runner templates rather than enforced by a harness hook. SDLC no longer creates git worktrees — workspace is auto-detected (`branch`/`continue`).

### Cost Tiers

Each skill and orchestrator agent pins a `model:` in its frontmatter to control which Claude tier executes it. Mechanical surfaces (commit messages, version bumps) run on Haiku; reasoning-heavy surfaces (plan decomposition, review-comment triage) run on Opus; the rest run on Sonnet. Per-call overrides at dispatch sites (e.g., `ship.js`, `execute.js`, `review.js`) take precedence over frontmatter at runtime.

See [cost-tiers.md](cost-tiers.md) for the full skill/agent table, resolution precedence, and dispatch-site override list.

## Adding a New Plugin

To add another plugin to this marketplace:

1. Create `plugins/<new-plugin-name>/` with its own `.claude-plugin/plugin.json`
2. Add an entry to the root `marketplace.json`:

   ```json
   {
     "name": "new-plugin-name",
     "source": "./plugins/new-plugin-name"
   }
   ```

3. Follow the same structure: `skills/`, `hooks/` (and optionally `scripts/`, `commands/`)

## Step-Emitter Script Architecture

Skills can use the **step-emitter pattern** where prepare scripts become multi-step workflow controllers. Instead of running once and returning flat JSON, a step-emitter script emits one step at a time via a universal envelope protocol. The LLM executes each step using domain knowledge, then calls the script again with the result. The script controls sequencing; the LLM provides judgment.

Key components:
- **`lib/stepper.js`** — shared utility for envelope creation, state management, and CLI argument parsing
- **Universal envelope** — every script invocation returns `{ status, step, llm_decision, state_file, progress, ext }`
- **Two-call protocol** — initial call returns the first step; subsequent calls use `--after <step_id> --result-file <path> --state <state_file>`

See [Step-Emitter Architecture](step-emitter-architecture.md) for the full protocol reference, migration guide, and testing patterns.

## Config Schema Versioning

Configuration files (`.sdlc/local.json`, `.sdlc/config.json`) carry a top-level integer `version` field. The current schema version is **2**.

When introducing a format-breaking change to a config schema:

1. Bump the schema `version` constant in the relevant JSON Schema (e.g. `schemas/sdlc-local.schema.json`).
2. Add a migration step in `lib/config.js` that runs at read time (`readLocalConfig`/`readProjectConfig`).
3. Migrations MUST be **idempotent** — reading an already-migrated config is a no-op.
4. Migrations MUST **persist back to disk** atomically and emit a single deprecation notice on first migration.
5. Legacy fields are dropped from the in-memory state once migrated; downstream consumers see only the modern shape.

Issue [#180](https://github.com/rnagrodzki/sdlc-marketplace/issues/180) (replacing the decorative `preset` field with explicit `steps[]`) is the motivating example: legacy v1 ship configs auto-migrate to v2 on the next read, with a one-line stderr deprecation notice.

## Testing

All testing uses [promptfoo](https://promptfoo.dev/) — a framework for evaluating LLM outputs. Two configurations cover different test types:

### Behavioral Tests (`promptfooconfig.yaml`)

Test skill behavior end-to-end via the `claude-cli` provider. Each test case provides a skill path, project context fixture, and user request, then asserts on the LLM's response.

```text
tests/promptfoo/
├── promptfooconfig.yaml          # Behavioral test config
├── providers/claude-cli.js       # Invokes Claude Code skills
├── prompts/skill-runner.txt      # Prompt template
├── datasets/<skill-name>.yaml    # Test cases per skill
├── fixtures/*.md                 # Markdown project context
└── fixtures-fs/                  # Filesystem project fixtures
```

**Dataset structure:**
```yaml
- description: "skill-name: test scenario description"
  vars:
    skill_path: "plugins/sdlc-utilities/skills/<skill>/SKILL.md"
    project_context: "file://fixtures/<fixture>.md"
    user_request: "..."
  assert:
    - type: icontains
      value: "expected substring"
    - type: llm-rubric
      value: "behavioral expectation in plain English"
```

### Script Execution Tests (`promptfooconfig-exec.yaml`)

Test scripts directly — no LLM involved. Uses the `script-runner.js` provider to execute Node.js scripts against fixture directories.

### Adding Tests

When adding or modifying a skill or script:
1. Add test cases to `tests/promptfoo/datasets/<skill-name>.yaml`
2. Create fixtures in `tests/promptfoo/fixtures/` if existing ones don't cover the scenario
3. Do **not** create unit test files — all testing goes through promptfoo datasets
