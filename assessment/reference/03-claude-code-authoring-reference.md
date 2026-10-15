# Claude Code Plugin Authoring Reference (audit baseline)

Compiled 2026-10-15 from the official Claude Code docs at code.claude.com and the Claude prompting docs at platform.claude.com. Each claim cites its source page. Where the docs are silent the line says **not documented**. Where a fetched page was truncated, the caveat is stated in the section.

Conventions: "Docs:" gives the page that states the fact. Values are quoted or paraphrased from that page. Items marked *inference* are not stated verbatim.

---

## 1. SKILL.md frontmatter

Docs: https://code.claude.com/docs/en/skills.md

All fields are optional. The page recommends setting `description`. Field names must match exactly. Unknown fields are ignored without error. If the YAML does not parse, the skill loads with no metadata.

| Field | Default / allowed values | Semantics (per docs) |
|---|---|---|
| `name` | Defaults to directory name | Command name in the `/` menu. Max length: **not documented**. Names with zero-width, control, bidi, or `<` `>` characters are refused. |
| `description` | First non-empty line of content if omitted | What the skill does and when to use it. Claude uses it to decide auto-loading. Put the key use case first. |
| `when_to_use` | None | Extra trigger text. Appended to `description` in the listing; counts toward the 1,536-char cap. |
| `argument-hint` | None | Autocomplete hint, e.g. `[issue-number]`. |
| `arguments` | None | Named positional args for `$name` substitution. Space-separated string or YAML list. |
| `disable-model-invocation` | `false` | `true` stops auto-loading. Also blocks preloading into subagents and running from scheduled tasks. Description is not placed in context. |
| `user-invocable` | `true` | `false` hides the skill from the `/` menu; Claude can still invoke it. |
| `allowed-tools` | None | Tools usable without permission prompts during the invoking turn. Grant clears on the user's next message. |
| `disallowed-tools` | None | Tools removed from the pool while the skill is active. Clears on next message. |
| `model` | None | Model for the current turn. Accepts `/model` values or `inherit`. Not saved to settings. (`/model` values include `fable`.) |
| `effort` | None | `low`, `medium`, `high`, `xhigh`, `max`. Available levels depend on model. Overrides session level while the skill runs, but not `CLAUDE_CODE_EFFORT_LEVEL`. (Docs: model-config.md, "Skill and subagent frontmatter".) |
| `context` | None | `fork` runs the skill in a forked subagent. |
| `agent` | `general-purpose` when `context: fork` and omitted | Subagent type: `Explore`, `Plan`, `general-purpose`, or a custom agent from `.claude/agents/`. |
| `background` | `true` | With `context: fork`, `false` waits for the result in the invoking turn. Requires v2.1.218+. |
| `hooks` | None | Hooks registered on invocation and kept for the session. |
| `paths` | None | Glob patterns limiting auto-activation to matching files. |
| `shell` | `bash` | `bash` or `powershell` for `` !`cmd` `` blocks. |
| `metadata` | None | Free-form YAML map; ignored by Claude Code. |
| `license` | None | Accepted, not acted on. |
| `compatibility` | None | String up to 500 chars. Accepted, not acted on. |

**Portability note (docs):** outside Claude Code (claude.ai uploads, Skills API) only `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools` are accepted. Other keys cause a hard error there.

**Boolean parsing:** `true`/`false`, plus `yes`/`no`/`on`/`off`/`1`/`0` in any case (v2.1.218+).

**Substitutions:** `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` (plugin skills only), `${CLAUDE_PLUGIN_DATA}` (plugin skills only). `${user_config.KEY}` also substitutes in skill and agent content, non-sensitive values only (manifest-reference.md).

**Size and progressive disclosure (docs):**
- "Keep `SKILL.md` **under 500 lines**" (tip on the page).
- Move detail into `reference.md`, `examples.md`, `scripts/`, and link them with a note on when to load each.
- Scripts are executed, not loaded into context.
- Hard byte or token limit for SKILL.md: **not documented**.

**Invocation lifecycle (docs):** after invocation, rendered content stays in the conversation. On compaction Claude Code re-attaches each skill's most recent invocation keeping the **first 5,000 tokens** per skill, with a **combined 25,000-token** budget. Put critical instructions near the top.

**Plugin skill namespacing:** `my-plugin/skills/review/SKILL.md` becomes `/my-plugin:review`. A frontmatter `name` replaces the last segment (`name: fancy` gives `/my-plugin:fancy`). Bare `/fancy` also works unless another command uses that name. `name: my-plugin:fancy` gives `/my-plugin:fancy` (no double prefix, v2.1.246+).

**Name rules:** Docs state no maximum length for `name`.

---

## 2. Subagent frontmatter (agents/*.md)

Docs: https://code.claude.com/docs/en/sub-agents.md

Only `name` and `description` are required. Field names are camelCase. Unknown fields ignored.

| Field | Required | Allowed values / semantics | Default |
|---|---|---|---|
| `name` | yes | Unique id, max **256** chars, no `:` (reserved for plugin-scoped ids). | — |
| `description` | yes | When to delegate. Combined descriptions over **15,000 tokens** trigger a startup warning. | — |
| `tools` | no | Allowlist, comma string or YAML list. | Inherits every tool available to subagents |
| `disallowedTools` | no | Denylist; applied first. `Bash(...)` specifiers still remove the whole tool. Accepts `mcp__<server>`, `mcp__<server>__*`, `mcp__*`. | None stated |
| `model` | no | `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`. | Resolution order below |
| `effort` | no | `low`, `medium`, `high`, `xhigh`, `max`; depends on model. Overrides session effort, not `CLAUDE_CODE_EFFORT_LEVEL`. | **Not documented** (see §5) |
| `permissionMode` | no | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, `manual` (alias of `default`). **Ignored for plugin subagents.** | Inherits main conversation's mode |
| `maxTurns` | no | Max agentic turns. On reaching it, output is marked partial and resumable. | **Not documented** |
| `autoCompactWindow` | no | Integer 100000–1000000 (v2.1.296+). Overridden by `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. | **Not documented** |
| `skills` | no | Skills preloaded at startup with full content. Only first **32** distinct names used. Skills with `disable-model-invocation: true` cannot be preloaded. | Not documented (none) |
| `mcpServers` | no | Name references or inline defs (`stdio`, `http`, `sse`, `ws`). **Ignored for plugin subagents.** | Not documented |
| `hooks` | no | Lifecycle hooks (`PreToolUse`, `PostToolUse`, `Stop`, etc.). **Ignored for plugin subagents.** | Not documented |
| `memory` | no | `user` (`~/.claude/agent-memory/<name>/`), `project` (`.claude/agent-memory/<name>/`, recommended), `local` (`.claude/agent-memory-local/<name>/`). Enables Read/Write/Edit automatically; first 200 lines or 25KB of `MEMORY.md` loaded. | Not documented (no memory) |
| `background` | no | `true` keeps subagent in background even when Claude asks for foreground. | Not documented; implicitly off |
| `omitClaudeMd` | no | `true` omits user, project, local CLAUDE.md from initial context (v2.1.271+). Managed policy files still load. | Not documented |
| `isolation` | no | Only `worktree`: temp git worktree, auto-removed if no changes. | Not documented (none) |
| `color` | no | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. | Not documented |
| `initialPrompt` | no | Auto-submitted first turn when agent runs as main session agent (`--agent` or `agent` setting). Ignored for plugin subagents. | None |
| `experimental` | no | Map; only `cacheTtl` documented (`5m` or `1h`, v2.1.248+). | — |

**Model resolution (docs, quoted order):**
1. The per-invocation `model` parameter Claude passes
2. The definition's `model` frontmatter (`inherit` selects the main conversation's model)
3. `CLAUDE_CODE_SUBAGENT_MODEL`, if set to an alias or model ID (before v2.1.251 this came first and overrode 1 and 2)
4. The main conversation's model

**Built-in subagent defaults (docs):** Explore = main model (on Bedrock/Vertex/Foundry stays on main; on subscription/Console/gateway it runs on whatever `opus` resolves to when main uses Fable). Plan = main model. general-purpose = `CLAUDE_CODE_SUBAGENT_MODEL` if set, else main model. statusline-setup = Sonnet. claude-code-guide = Haiku.

**Force mode:** `CLAUDE_CODE_SUBAGENT_MODEL` + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) makes every subagent use that model and ignores `model` fields.

**How `model: haiku` resolves:** to the Haiku alias target for the provider. Anthropic API: **Haiku 5.5** (`claude-haiku-5-5`). Claude Platform on AWS: Haiku 4.5. Amazon Bedrock and Google Cloud Agent Platform: Haiku 4.5. Microsoft Foundry: Haiku 4.5 (model-config.md, provider table). The same alias gives different models on different providers.

**What a non-fork subagent loads at startup (docs: sub-agents.md, "What loads at startup"):** its own system prompt (not the Claude Code system prompt), the delegation task message, every level of the CLAUDE.md hierarchy (except Explore and Plan), git status snapshot (except Explore and Plan), full content of skills named in `skills`. Main-conversation auto memory is not loaded. MCP servers are not listed in the startup list. The page says inline MCP servers connect at subagent start.

**Effort inheritance (docs):** Not explicitly stated. The `effort` field wording is "Overrides the session effort level", which implies session level applies when unset (*inference*). Per-invocation `effort` parameter (v2.1.292+) overrides the field.

**Thinking inheritance (docs):** since v2.1.198 subagents inherit the main conversation's extended-thinking on/off setting. No per-subagent thinking setting.

**Plugin subagent limitations (docs):** `permissionMode`, `hooks`, `mcpServers`, `initialPrompt` are ignored for plugin-supplied agents.

**Cost guidance (docs):** subagents "send their own requests, which count toward the same usage limits". "Control costs by routing tasks to faster, lower-cost models like Haiku." Explore: "define one with `model: haiku`". No specific subagent effort recommendation found in the fetched text.

---

## 3. Plugin manifest and marketplace.json

Docs: https://code.claude.com/docs/en/plugins/manifest-reference.md and https://code.claude.com/docs/en/plugins/marketplace-reference.md

### plugin.json
- The manifest is **optional**. Without it, components are loaded from the standard layout, and the plugin name comes from the marketplace entry or the directory name.
- **Required:** `name` only. Kebab-case; no spaces, `@`, `:`, path separators, control or bidi characters.
- **Optional top-level fields:** `$schema`, `displayName`, `version` (string, not checked against semver; setting it pins), `description`, `author` (object; `name` required, `email` and `url` optional), `homepage` (must parse as URL), `repository`, `license` (SPDX), `keywords`, `metadata`, directory-listing fields (`icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`; ignored at load), `defaultEnabled` (default `true`), `dependencies`, `settings` (only `agent` and `subagentStatusLine` take effect), `userConfig`, `types`, `channels`, `skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`, `workflows`, `experimental` (`themes`, `monitors`, `evals`).
- **Unknown top-level keys:** stripped with a validator warning; plugin still loads. Unknown keys inside `userConfig` options, `channels`, `lspServers`, `monitors` entries are **errors**.

**Component path rules:** every component path is relative to plugin root and **must start with `./`** (except `skills` also accepts `"."`).
- `skills`: **adds to** the default `skills/` scan.
- `commands`, `agents`, `outputStyles`, `workflows`, `experimental.themes`, `experimental.monitors`: **replace** the default folder.
- `hooks`, `mcpServers`, `lspServers`: **merge** with the default file (`hooks/hooks.json`, `.mcp.json`, `.lsp.json`).
- `agents` entries must be `.md` files; directories not accepted.
- Path must stay inside plugin root and exist.

**Standard layout (defaults):** `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/monitors.json`, `bin/` (added to Bash PATH while enabled), `settings.json`.

**Important (docs):** "A `CLAUDE.md` at the plugin root isn't loaded as context, and `claude plugin validate` warns when it finds one. To include instructions that load into Claude's context, put them in a skill."

**Variables:**
- `${CLAUDE_PLUGIN_ROOT}`: absolute path of the installed plugin version. Changes on update; do not write state there.
- `${CLAUDE_PLUGIN_DATA}`: `~/.claude/plugins/data/<id>/`, persists across updates; deleted on uninstall by default.
- `${CLAUDE_PROJECT_DIR}`: project root.
- Variables are NOT present in the environment of Bash tool commands. In skill/agent Markdown, write `${...}` and Claude Code substitutes it on load.

**Namespacing:** every component is namespaced under plugin name. Agent `reviewer` in plugin `deploy-tools` appears as `deploy-tools:reviewer`. Skills: `/plugin-name:skill-name`.

**userConfig:** field types `string`, `number`, `boolean`, `directory`, `file`; `sensitive` values go to secure store. Access as `${user_config.KEY}` or `CLAUDE_PLUGIN_OPTION_<KEY>` env var.

### marketplace.json
- **Required top-level:** `name`, `owner` (object; `name` required, `email` and `url` optional), `plugins` (array).
- **Optional top-level:** `$schema`, `description`, `version`, `metadata.description`, `metadata.version`, `metadata.pluginRoot` (v2.1.239+), `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`.
- **Marketplace name rules:** letters, digits, `.`, `_`, `-`; starts with letter or digit; no `..`. Reserved names exist (e.g. `claude-plugins-official`, `anthropic-*` variants).
- **Plugin entry required:** `name` and `source`. Optional: `description`, `version`, `category`, `tags`, `strict` (default `true`), `relevance`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, `headers`, `headersHelper`. Entries accept any `plugin.json` field except directory-listing fields.
- **Plugin source types:** relative path string (must start `./`), `github` (`repo`, `ref`, `sha`), `url`, `git-subdir`, `npm`, `archive` (`url`, `sha256`), `command` (`command`, `timeout` default 60, `mode` `copy`|`link`).
- **Strict mode:** `strict: true` (default) appends entry component fields to `plugin.json`. `strict: false` with entry components present is a conflict and the plugin fails to load.
- **Hooks in an entry:** must be an inline object. File-path or array hooks in an entry never run; the plugin gets a "not yet supported" error.

---

## 4. Hooks

Docs: https://code.claude.com/docs/en/hooks.md (the fetch covered roughly the first 100k of 270k characters. Per-event JSON schemas after the early events are only partly confirmed. Confirm specific events against the full page before relying on them.)

### Events (33 listed in the events table, page says)
`Setup`, `SessionStart`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`, `SessionEnd`.

Per-tool-call events: `PreToolUse`, `PostToolUse`. Per-session: `SessionStart`, `SessionEnd`. Per-turn: `UserPromptSubmit`, `Stop`, `StopFailure`.

### Handler types
`command`, `http`, `mcp_tool`, `prompt`, `agent` (agent is marked "experimental and may change").

### Common fields
- `type` (required)
- `if`: permission-rule syntax such as `"Bash(git *)"`. Evaluated only on `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`. Holds one rule; no `&&` or `||`.
- `timeout`: seconds. **Defaults:** 600 for `command`, `http`, `mcp_tool`; 30 for `prompt`; 60 for `agent`. Lowered for command/http/mcp_tool to **30** on `UserPromptSubmit`, `PreModelSwitch`, `PostModelSwitch`, and to **10** on `MessageDisplay`. `SessionEnd` hooks share a **1.5-second** budget, raised to match a longer per-hook timeout "up to 60 seconds". **General maximum: not documented.** Claude Code does not enforce `timeout` on `async: true` command hooks.
- `statusMessage`: spinner text while running.
- `once`: if `true`, removed after first successful run. **Only honored in skill frontmatter**, ignored in settings and agent frontmatter.

### Command-hook fields
- `command` (required), shell form, or the executable when `args` is set.
- `args`: exec form. Each element is one argument, no shell.
- `async`: background, non-blocking.
- `asyncRewake`: background; wakes Claude on exit code 2.
- `shell`: `bash` (default) or `powershell`.
- `onFailure`: `continue` (default) or `block` (v2.1.295+). No effect on Stop, SubagentStop, TaskCompleted, TeammateIdle, or background hooks.

### HTTP and MCP-tool fields
- HTTP: `url` (required), `headers` (env interpolation only for names in `allowedEnvVars`), `allowedEnvVars`, `onFailure`.
- MCP tool: `server` (required; plugin servers as `plugin:<plugin>:<server>`), `tool` (required), `input`.
- Prompt and agent: `prompt` (required; `$ARGUMENTS` replaced with hook input JSON), `model` (optional).

### JSON output contract (as stated)
Universal fields:
- `continue` (default `true`). `false` stops Claude after the hook; takes precedence over event-specific decisions.
- `stopReason`: shown to user when `continue` is `false`.
- `suppressOutput` (default `false`): documented as "Has no effect".
- `systemMessage`: warning shown to the user.
- `terminalSequence`: allowlisted OSC sequences only.
- Top-level `decision`: only value `"block"`; plus `reason`.

`hookSpecificOutput` (requires `hookEventName`):
- **PreToolUse:** `permissionDecision` (`allow` | `deny` | `ask` | `defer`), `permissionDecisionReason`, `updatedInput` (directly under `hookSpecificOutput`), `additionalContext`.
- **PermissionRequest:** `decision: { behavior: "allow" | "deny", updatedInput }`.
- **PermissionDenied:** `retry: true`.
- **PostToolUse:** `updatedToolOutput`; top-level `decision: "block"`.
- **SessionStart:** `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills`.
- **Stop / SubagentStop:** `decision` plus `hookSpecificOutput.additionalContext`.
- **Elicitation / ElicitationResult:** `action` (`accept` | `decline` | `cancel`), `content`.
- **PreModelSwitch:** `permissionDecision` (`allow` | `deny` | `ask`), or `decision: "block"`.
- **MessageDisplay:** `displayContent` (display only).
- **WorktreeCreate (HTTP):** `worktreePath`.
- **SessionStart, SubagentStart, PostModelSwitch:** context only via `additionalContext`.

### Exit codes (command hooks)
- **0:** success. Stdout parsed as JSON only if the whole output is one JSON object. Stdout is added as context only for `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch`. "Claude never sees stderr from a hook that exits 0."
- **2:** blocking error; stderr is the reason. JSON cannot override the block. Not honored for `PermissionRequest`. On `PostToolUse` it shows stderr to Claude because the tool already ran.
- **Other non-zero (including 1):** non-blocking error; action proceeds. "Without valid JSON on stdout, Claude Code treats exit code 1 as a non-blocking error… If your hook is meant to enforce a policy, use `exit 2`."

HTTP hooks: 2xx empty body = success; 2xx JSON object = parsed; non-2xx, connection failure, or non-JSON 2xx = non-blocking error. HTTP hooks cannot block by status code alone.

**Output caps:** `additionalContext`, `systemMessage`, and plain stdout are each limited to **10,000 characters**. Over the limit, output goes to a file with a 2,000-character preview.

### Matchers
`"*"`, `""`, or omitted match all. Plain names (letters, digits, `_`, `-`, space, `,`, `|`) are exact. Other characters are an unanchored JavaScript regex; use `^...$` for whole-string.

### Cost and latency guidance (docs)
- "All matching hooks run in parallel. If you define the same handler in more than one settings file, it runs once."
- Narrow early: use `matcher` and `if` so a script does not spawn for every call. The docs' own example is a `block-rm.sh` hook that "only spawns when both filters match".
- "SessionStart runs on every session, so keep these hooks fast." The first response waits for SessionStart hooks.
- "A timed-out `command`, `http`, or `mcp_tool` hook doesn't block the tool call… don't count on a stalled hook to act as a gate." Use `onFailure: "block"`.
- "Because the `if` filter is best-effort, use the permission system rather than a hook to enforce a hard allow or deny."
- "Prefer exec form for any hook that references a path placeholder."
- "For instructions that never change, prefer CLAUDE.md."
- Write `additionalContext` as factual statements, not "out-of-band system commands", which can trigger prompt-injection defenses.
- On Windows, exec form requires a real executable; `.cmd`/`.bat` need shell form.

### Plugin hooks
`hooks/hooks.json` wraps the event map under a top-level `"hooks"` key. Use `${CLAUDE_PLUGIN_ROOT}` in exec-form `args`, or quote it in shell form.

---

## 5. Effort

Docs: https://code.claude.com/docs/en/model-config.md (section "Effort"). Subagent and skill wording from sub-agents.md.

**Levels:** `low`, `medium`, `high`, `xhigh`, `max`.
- Fable 5.1, Fable 5, Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 5, Sonnet 5, Opus 4.8, Opus 4.7: all five levels.
- Opus 4.6, Sonnet 4.6: `low`, `medium`, `high`, `max` (no `xhigh`).
- Models not listed do not support effort. If a level is unsupported, Claude Code falls back to the highest supported level at or below it (e.g. `xhigh` runs as `high` on Opus 4.6).

**Default effort:** `high` on every effort-capable model, except Opus 5.5, Sonnet 5.5, Haiku 5.5 default to **`medium`**, and Opus 4.7 defaults to **`xhigh`**.

**Resolution order (docs):**
1. Explicit choice: `CLAUDE_CODE_EFFORT_LEVEL`, `--effort`, or in-session `/effort`
2. Saved settings: per-model level in `modelSettings`, or `effortLevel`
3. Model default (above)

**`CLAUDE_CODE_EFFORT_LEVEL`:** accepts a level name or `auto`. Does not accept `ultracode`. It takes precedence over skill and subagent `effort` fields and over the per-invocation parameter.

**`/effort`:** no argument opens a slider; `/effort <level>` sets; `/effort auto` clears the saved level for the active model; `/effort ultracode` toggles ultracode (v2.1.284+). In `-p` runs it applies to that session only.

**Per skill / per subagent:** yes. `effort` frontmatter exists for both skills and subagents. For subagents, the per-invocation `effort` parameter (v2.1.292+) overrides the field.

**Subagent default when `effort` unset:** **not documented** explicitly. The wording "overrides the session effort level" implies the session level applies (*inference*).

**Recommendation for routine subtasks:** no explicit "use lower effort for subagents" guidance was found. The costs page says to lower effort to save tokens on simpler tasks ("lowering the effort level with `/effort` or in `/model`"). The prompting best-practices page says to use effort "as a fallback" if the model is overly aggressive.

**Ultracode:** a Claude Code setting, not a model level. Unavailable when workflows are off or the model lacks `xhigh`.

---

## 6. Writing skills and CLAUDE.md for current models

### CLAUDE.md (Claude Code docs)
- **Size:** "target under **200 lines** per CLAUDE.md file. Longer files consume more context and reduce adherence." Claude Code shows a startup warning when a file is over the recommended length, and when files together exceed a combined limit. (Docs: https://code.claude.com/docs/en/memory.md)
- **Delivery:** "CLAUDE.md content is delivered as a user message after the system prompt, not as part of the system prompt itself… there's no guarantee of strict compliance." For system-prompt-level text use `--append-system-prompt` at launch.
- **Advisory, not enforced:** "Claude treats CLAUDE.md files as context, not enforced configuration." Use hooks for guaranteed behavior (memory.md, best-practices.md).
- **Emphasis:** "If Claude keeps skipping one instruction, add emphasis such as 'IMPORTANT' to that line alone. If you emphasize many lines, none of them stands out." (best-practices.md)
- **Pruning test:** "Would removing this cause Claude to make mistakes? If not, cut it." (best-practices.md)
- **Path-scoped rules:** `.claude/rules/*.md` with `paths:` frontmatter load only when matching files are touched. Imports (`@path`) do not reduce context cost.
- **Imports:** `@path/to/import`; not parsed inside code spans or fences.
- **Auto memory:** `MEMORY.md`; first **200 lines or 25KB**, whichever first, loaded every session (memory.md, context-window.md).
- **Plugin root CLAUDE.md:** not loaded as context (manifest-reference.md).

### Skills (Claude Code docs)
- Keep `SKILL.md` under **500 lines** (skills.md tip).
- Move multi-step or occasional procedures from CLAUDE.md into skills (costs.md: "Skills load on-demand only when invoked").
- Skill-triggering: "Make the description more specific"; "Add `disable-model-invocation: true` if you only want manual invocation" (skills.md troubleshooting).
- Rules that must hold every time: move to a hook, not the skill body (skills.md "Claude stops following a skill").
- Word guidance to apply to the whole task (e.g. "Run the tests after every edit" rather than "Run the tests") (skills.md).

### Claude prompting docs (platform.claude.com)
Source: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- On Opus 4.5 and 4.6: "Claude Opus 4.5 and Claude Opus 4.6 are also more responsive to the system prompt than previous models. If your prompts were designed to reduce undertriggering on tools or skills, these models may now overtrigger. The fix is to dial back any aggressive language. Where you might have said 'CRITICAL: You MUST use this tool when...', you can use more normal prompting like 'Use this tool when...'."
- "Remove over-prompting. Tools that undertriggered in previous models are likely to trigger appropriately now. Instructions like 'If in doubt, use [tool]' will cause overtriggering."
- "Use effort as a fallback. If Claude continues to be overly aggressive, use a lower setting for `effort`."
- "Tune anti-laziness prompting: … dial back that guidance. Claude 4.6 models are more proactive and may overtrigger."
- Explain motivation: "Providing context or motivation behind your instructions… can help Claude better understand your goals."
- Per-model pages exist for Fable 5.1, Fable 5, Sonnet 5.5, Opus 5.5, Opus 5, Haiku 5.5, each covering differences such as progress updates, verbosity, and initiative. (Read these pages directly before relying on model-specific advice. They were not fetched in full here.)
- Opus 5 page: "its default user-facing responses run longer than prior models', and raising or lowering effort does not reliably change visible response length. Prompt explicitly for conciseness instead."

### Claude Code system prompt
- **Not documented:** the contents of Claude Code's built-in system prompt. The context-window page says only: "System prompt: Core instructions for behavior, tool use, and response formatting. Always loaded first. You never see it." (https://code.claude.com/docs/en/context-window.md)
- **Not documented:** whether the built-in system prompt already includes autonomy or progress-update guidance. Plugins should not assume either way from the docs. Test the plugin's behavior with `claude plugin eval` instead.
- The platform prompting page's progress-update and verbosity guidance is for the API generally, not a list of Claude Code system-prompt contents.

---

## 7. Model aliases and availability in Claude Code

Docs: https://code.claude.com/docs/en/model-config.md

| Alias | Documented behavior |
|---|---|
| `default` | Clears the override and reverts to the account's runtime default. Not a model alias. |
| `best` | The `fable` target where Fable is available, else the `opus` target. |
| `fable` | Fable model for the provider. Resolves to **Fable 5.1** unless `ANTHROPIC_DEFAULT_FABLE_MODEL` is set. |
| `sonnet` | "the latest Sonnet model for daily coding tasks" |
| `opus` | "the latest Opus model for complex reasoning tasks" |
| `haiku` | "the fast and efficient Haiku model for simple tasks" |
| `sonnet[1m]`, `opus[1m]` | Same model with 1M context window. |
| `opusplan` | Uses `opus` during plan mode, then switches to `sonnet` for execution. |

**Provider mapping for `opus` / `sonnet` / `haiku`:**

| Provider | opus | sonnet | haiku |
|---|---|---|---|
| Anthropic API | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| Claude Platform on AWS | Opus 5.5 | Sonnet 4.6 | Haiku 4.5 |
| Amazon Bedrock, Google Cloud Agent Platform | Opus 5.5 | Sonnet 4.5 | Haiku 4.5 |
| Microsoft Foundry | Opus 4.6 | Sonnet 4.5 | Haiku 4.5 |

Exact IDs named on the page: `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5-5`, `claude-opus-4-6`, `claude-sonnet-5` (fallback example), `claude-sonnet-4-5`, `claude-haiku-5-5`, `claude-haiku-4-5` (fallback example). Sonnet 5.5 and Opus 5 explicit IDs are **not stated** on the page.

**Version requirements:** Fable 5.1 v2.1.257+; Opus 5.5 v2.1.280+; Sonnet 5.5 v2.1.284+; Haiku 5.5 v2.1.293+.

**`/model` picker:** the page does not give a full picker list. It names Fable 5.1, Fable 5, Opus 5.5, Opus 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5.5, Sonnet 5, Sonnet 4.6, Sonnet 4.5, Haiku 5.5, Haiku 4.5. The page does not state which are in the picker.

**Default model:** Pro, Max, Team, Enterprise, Anthropic API: Opus 5.5. Bedrock, Claude Platform on AWS, Google Cloud Agent Platform: Opus 5.5. Microsoft Foundry: Sonnet 4.5. "Fable models are not the account-type default on any plan or provider."

**Setting the model (priority):** in session `/model`; launch `claude --model`; env `ANTHROPIC_MODEL`; settings `model`; `ANTHROPIC_DEFAULT_MODEL` (v2.1.236+, ignored when set to `default`, `inherit`, `opusplan`, `haiku`).

**Alias target env vars:** `ANTHROPIC_DEFAULT_FABLE_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`. Haiku variable also covers "background functionality".

**Subagent guidance (model-config.md):** a `/model` switch to Opus also reaches subagents that inherit the main model. "To keep a custom subagent on a smaller model, set `model` in its definition."

**Pricing and rate limits:**
- Haiku 5.5 on the API has 1M context on every plan. "A Haiku 5.5 request costs more per token when its prompt is longer than 100K tokens." (model-config.md)
- Per-model list prices: **not stated** on the fetched pages. Costs page says prices show in the picker only on the Anthropic API or gateways proxying it. Look up current prices at the pricing page (not fetched).
- Rate limits: **not documented** per model. Costs page gives org-level TPM and RPM per-user recommendations by team size (e.g. 1-5 users: 200k-300k TPM, 5-7 RPM) (costs.md).
- Opus 5.5 "tends to think more per turn than Opus 5" at a given effort; the page recommends starting at `medium` when migrating.

---

## 8. Documented limits

| Item | Documented value | Source |
|---|---|---|
| Skill `description` + `when_to_use` in `/` listing | Truncated at **1,536 characters** per entry. Configurable via `skillListingMaxDescChars`. | skills.md, settings-reference |
| Skill listing total budget | Scales at **1% of the model's context window**. Override with `skillListingBudgetFraction` (e.g. `0.02`) or `SLASH_COMMAND_TOOL_CHAR_BUDGET` (fixed char count). Low-priority skills can be set to `"name-only"` in `skillOverrides`. | skills.md |
| Skills dropped when over budget | Descriptions dropped starting with least-invoked skills. All skill names always listed. | skills.md |
| Are descriptions in every session | Yes for default skills ("Descriptions are always in context for default skills"). `disable-model-invocation: true` removes the description from context. | skills.md |
| Max number of skills | **Not documented.** | — |
| Skill `name` max length | **Not documented.** | — |
| SKILL.md recommended max | **Under 500 lines** (tip). | skills.md |
| Compaction re-attach for skills | First 5,000 tokens per skill; 25,000 tokens combined. | skills.md |
| Subagent `name` | Max 256 chars, no `:`. | sub-agents.md |
| Subagent combined descriptions | 15,000-token startup-warning threshold. | sub-agents.md |
| Subagent `skills` preload | First 32 distinct names. | sub-agents.md |
| CLAUDE.md size | Target under 200 lines per file. | memory.md |
| MEMORY.md (auto memory) load | First 200 lines or 25KB. | memory.md |
| Hook output (`additionalContext`, `systemMessage`, stdout) | 10,000 chars each; overflow goes to a file with a 2,000-char preview. | hooks.md |
| Hook timeouts | 600 s command/http/mcp_tool; 30 s prompt; 60 s agent; 30 s on UserPromptSubmit/PreModelSwitch/PostModelSwitch; 10 s on MessageDisplay; SessionEnd shared 1.5 s budget (up to 60 s). General max **not documented**. | hooks.md |
| Plugin `name` | Kebab-case; reserved names listed. | manifest-reference.md |
| Marketplace `name` | letters, digits, `.`, `_`, `-`; starts alphanumeric; no `..`. | marketplace-reference.md |
| Plugin eval runs | Default 3 per arm (1 to 50). Default threshold 1.0. | plugin-evals.md |
| Plugin eval mock budget | 4 times the case's `max_turns` (40 at default 10). | plugin-evals.md |
| Plugin eval defaults | `max_turns` 10; `timeout_seconds` 300. | plugin-evals.md |
| `claude plugin` `--concurrency` | Not in the fetched excerpt (**not verified**). | — |
| `/skill-doctor` | Listed in skills.md "Find unused skills"; `/doctor` gives an estimate of listing context cost. | skills.md |

---

## 9. Plugin evaluation and /skill-doctor

Docs: https://code.claude.com/docs/en/plugin-evals.md and https://code.claude.com/docs/en/skills.md ("Skill descriptions are cut short" section, and the link to `/skill-doctor`).

- `claude plugin eval` runs each case multiple times and scores the results. `claude plugin eval init` writes the suite interactively. A case is a directory with `prompt.md` and/or `case.yaml`, plus at least one grader under `graders/` or in `case.yaml`.
- Default `--runs` is 3. Default `--threshold` is **1.0**, so the command exits 1 when any case scores below perfect.
- Exit codes: 0 pass; 1 below threshold or load error or no cases or option error; 2 partial (cost ceiling or auth failure); 130 interrupted; 143 terminated.
- `--json` writes a v1 result document with `schemaVersion: 1`.
- Messages: "`plugin eval` is currently in early access" indicates an old build. "`plugin eval` is currently unavailable" indicates a server-side switch (plugin-evals.md troubleshooting).
- Cost: eval runs and judge graders use the user's own credentials and count against plan usage or the API bill.
- Trust: the first run in an untrusted directory asks `Trust this plugin directory?`. Non-interactive runs are refused unless `--trust-plugin` is passed.
- Security: a bundled suite passing is not a security vetting. Treat scores as advisory when a plugin has hooks you did not write or starts real MCP servers.
- Use `claude plugin validate` for structure and schema; use `claude plugin eval` for behavior.

---

## Caveats and gaps (not documented or not verified)

1. Hook per-event JSON schemas after the first events were only partly visible in the fetched text. Confirm on https://code.claude.com/docs/en/hooks.md before auditing a specific event.
2. Subagent effort default when the `effort` field is unset: not explicitly stated.
3. Subagent default for `maxTurns`, `mcpServers`, `hooks`, `memory`, `background`, `color`: not documented (absent means no effect or inherit, per the field table).
4. Max skill count, max skill `name` length, and max SKILL.md byte size: not documented.
5. Claude Code system prompt contents (autonomy, progress updates): not documented.
6. Per-token prices for Haiku, Sonnet, Opus, Fable: not on the fetched pages. Check the pricing page.
7. Exact model ID for the `sonnet` alias on the Anthropic API is listed as Sonnet 5.5 in the provider table, but the explicit ID `claude-sonnet-5-5` is not stated on the page. Pin with the ID the docs name only if verified.
8. The `/model` picker contents: not fully enumerated on the page.
9. Plugin eval docs are at https://code.claude.com/docs/en/plugin-evals.md (linked from the manifest reference). The embedded offline reference's "no docs URL yet" note is outdated for this audit. Use the URL above.

---

## Sources

- https://code.claude.com/docs/en/skills.md
- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/plugins/manifest-reference.md
- https://code.claude.com/docs/en/plugins/marketplace-reference.md
- https://code.claude.com/docs/en/hooks.md (partially read; see caveat 1)
- https://code.claude.com/docs/en/model-config.md (partially read; the trailing 16,769 characters after the effort section were not read)
- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/best-practices.md
- https://code.claude.com/docs/en/plugin-evals.md
- https://code.claude.com/docs/en/costs.md
- https://code.claude.com/docs/en/context-window.md
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://code.claude.com/docs/en/settings-reference.md (linked from the skills page for `skillListingBudgetFraction`, `skillListingMaxDescChars`; not fetched directly)
