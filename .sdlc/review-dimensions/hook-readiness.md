---
name: hook-readiness
description: "Reviews skills and scripts for reactive patterns better served as Claude Code harness hooks, and validates hooks.json structural correctness"
triggers:
  - "**/skills/**/SKILL.md"
  - "**/hooks/hooks.json"
  - "**/hooks/*.js"
  - "**/scripts/*.js"
skip-when:
  - "**/node_modules/**"
  - "docs/**"
  - "tests/**"
severity: medium
model: sonnet
---

# Hook Readiness Review

Review skills, hooks config, and scripts for patterns that belong in the Claude Code harness hook system rather than inline skill logic. Claude Code harness hooks fire automatically on lifecycle events (SessionStart, PreToolUse, PostToolUse, etc.) and can be type `command` (shell), `prompt` (LLM judgment), or `agent` (subagent). Exit code 0 = proceed, exit code 2 = block action. Moving recurring reactive patterns into hooks makes them automatic and eliminates duplication across skills.

## A. Hook Opportunity Detection

Check skills and scripts for patterns that should instead be hooks:

- [ ] Reactive validation patterns (e.g., "after editing, run lint/validate") that fire on every tool use → should be a `PostToolUse` hook rather than inline skill instructions
- [ ] Session initialization logic (e.g., "check tool availability on startup", "verify environment on start") → should be a `SessionStart` hook rather than a pre-flight block repeated in each skill
- [ ] File protection patterns (e.g., "don't edit files matching X", "never modify Y") → should be a `PreToolUse` hook with exit code 2 to block the action automatically
- [ ] Post-write validation (e.g., "validate dimension files after writing", "lint after saving") → should be a `PostToolUse` hook scoped to `Edit|Write` tool matches
- [ ] Notification patterns (e.g., "alert when permission needed", "notify on completion") → should use the `Notification` hook event rather than inline skill output
- [ ] Pre-flight checks repeated across 2 or more skills (e.g., checking for a required binary, confirming a config file exists) → centralize as a `SessionStart` or `PreToolUse` hook

## B. hooks.json Structural Correctness

When `hooks.json` is among the changed files, verify:

- [ ] Hook events use only valid event names: `SessionStart`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Notification`, `SubagentStart`, `SubagentStop`, `Stop`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `SessionEnd`, `PreCompact`, `PermissionRequest`, `TeammateIdle`
- [ ] Matchers are valid regex patterns — no unescaped characters that make an invalid regex
- [ ] Hook types are one of: `command`, `prompt`, `agent` — no other values
- [ ] Commands referenced by hooks exist on disk and are executable (check scripts referenced by path)
- [ ] No overly broad matchers (e.g., `.*`) on `PreToolUse` — a catch-all `PreToolUse` matcher fires on every tool invocation and will block or slow everything
- [ ] Hook commands include appropriate error handling (`|| true`, `2>/dev/null`) where failure should not abort the triggering action
- [ ] Hook commands that invoke potentially slow operations (network calls, large file scans, full test suites) include an explicit timeout or are documented as acceptable to block

## Severity Guide

| Finding | Severity |
|---------|----------|
| File protection logic inline in skill instead of `PreToolUse` hook | high |
| Invalid hook event name in hooks.json | high |
| Hook command references non-existent script | high |
| Overly broad matcher on `PreToolUse` (blocks all tools) | high |
| Reactive validation pattern in skill instead of `PostToolUse` hook | medium |
| Session setup duplicated across skills instead of `SessionStart` hook | medium |
| Missing error handling in hook command (no `\|\| true`) | medium |
| Hook command without timeout on potentially slow operation | medium |
| Pre-flight check repeated in 2+ skills (hook candidate) | low |
| Minor hook structural issue (e.g., unnecessary whitespace, redundant matcher) | low |
