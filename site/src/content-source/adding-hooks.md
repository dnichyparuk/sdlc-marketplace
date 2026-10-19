# Adding Hooks

## Overview

Hooks run shell commands at specific points in the Claude Code lifecycle. They are
defined in `plugins/<plugin>/hooks/hooks.json`.

## All Hook Events

### Session Lifecycle

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `SessionStart` | Session begins or resumes | `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | Session terminates | `clear`, `logout`, `prompt_input_exit` |
| `PreCompact` | Before context compaction | `manual`, `auto` |

### User Interaction

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `UserPromptSubmit` | After you submit a prompt, before Claude processes it | None — always fires |
| `Notification` | When Claude sends a notification | `permission_prompt`, `idle_prompt`, `auth_success` |

### Tool Execution

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `PreToolUse` | Before a tool runs (can block it) | Tool name regex, e.g. `Bash`, `Edit\|Write` |
| `PostToolUse` | After a tool succeeds | Tool name regex |
| `PostToolUseFailure` | After a tool fails | Tool name regex |
| `PermissionRequest` | When a permission dialog appears | Tool name regex |

### Agent Lifecycle

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `SubagentStart` | When a subagent is spawned | Agent type, e.g. `Bash`, `Explore`, `Plan` |
| `SubagentStop` | When a subagent finishes | Agent type |
| `TeammateIdle` | When a team teammate is about to go idle | None — always fires |

### Task Management

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `Stop` | When Claude finishes responding | None — always fires |
| `TaskCompleted` | When a task is being marked as completed | None — always fires |

### Configuration & Worktrees

| Hook | When It Fires | Matcher Support |
|---|---|---|
| `ConfigChange` | When a config file changes during a session | `user_settings`, `project_settings`, `local_settings`, `skills` |
| `WorktreeCreate` | When a worktree is being created | None — always fires |
| `WorktreeRemove` | When a worktree is being removed | None — always fires |

## Hook Types

| Type | Description |
|---|---|
| `command` | Run a shell command. Fastest, most common. |
| `prompt` | Send hook data to an LLM (Haiku by default) for a yes/no judgment. |
| `agent` | Spawn a subagent that can read files, search code, and run commands. |

## Exit Code Behavior (command hooks)

| Exit Code | Effect |
|---|---|
| `0` | Action proceeds. Stdout is added to Claude's context (SessionStart / UserPromptSubmit only). |
| `2` | Action is **blocked**. Stderr becomes feedback to Claude explaining why. |
| Other | Action proceeds. Stderr is logged silently (visible in verbose mode). |

## Configuration Format

Edit `plugins/<plugin>/hooks/hooks.json`:

```json
{
  "hooks": {
    "<HookEvent>": [
      {
        "matcher": "<regex-pattern>",
        "hooks": [
          {
            "type": "command",
            "command": "<shell-command>"
          }
        ]
      }
    ]
  }
}
```

### Fields

| Field | Description |
|---|---|
| `matcher` | Regex matching tool names, agent types, or session sources. Omit for events that have no matcher support. |
| `type` | `command`, `prompt`, or `agent` |
| `command` | Shell command to execute (for `type: command`) |
| `timeout` | Optional timeout in milliseconds (default: 10 minutes) |

## Examples

### Welcome Message on Session Start

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Plugin loaded. Use /aisa:setup to get started.'"
          }
        ]
      }
    ]
  }
}
```

> **Note:** Plugin `SessionStart` hooks typically omit the `matcher` field to fire on every
> session start. Add `"matcher": "startup"` only if you want to fire exclusively on fresh starts
> (not on resume or compaction).

### Lint After File Edits

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npm run lint --fix 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Block Edits to Protected Files

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

### Desktop Notification When Claude Needs Input

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code needs your attention\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

### Validate Markdown After Writes

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/validate-markdown.js --changed-only 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

## Multiple Hooks in One File

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "echo 'Session started'" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npm run lint --fix 2>/dev/null || true" }
        ]
      }
    ]
  }
}
```

### Validate Config Files After Edits

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-validate.js\"",
            "timeout": 10000
          }
        ]
      }
    ]
  }
}
```

> **Note:** PostToolUse hooks do not inject stdout into context. Use exit code 2 with
> stderr output to surface validation findings as feedback to Claude. Exit 0 means
> clean — no output needed.

## Tips

1. **Use `|| true`** — Prevent hook failures from blocking Claude's workflow
2. **Use `2>/dev/null`** — Suppress error output when tools are not installed
3. **Keep hooks fast** — Long-running hooks block the session; avoid slow commands
4. **Test commands manually first** — Run the command in your terminal before adding it
5. **One concern per hook** — Don't combine linting and testing in one hook entry
6. **Use matchers** — Filter by tool name or session source to avoid unnecessary runs

## Plugin Hooks vs Project Hooks

| Location | Scope |
|---|---|
| `plugins/<plugin>/hooks/hooks.json` | Applied everywhere the plugin is installed |
| `.claude/settings.json` (in a project) | Applied to that specific project only |
| `~/.claude/settings.json` | Applied to all your projects globally |

Plugin hooks are portable — they follow the plugin across all projects. Project-level
hooks in `settings.json` are scoped to that repo.
