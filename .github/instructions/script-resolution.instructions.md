---
applyTo: "**/commands/*.md,**/skills/**/SKILL.md"
---
# script-resolution — Review Instructions

Reviews injected-path script resolution and Glob-based reference lookup patterns in commands and skills for runtime correctness across installed and development contexts

Default severity: high

## Checklist

- Every plugin-script invocation uses the injected-path form: `node "<PLUGIN_ROOT>/scripts/<subdir>/<script>.js"` — no `find ~/.claude/plugins` resolver, no `$SCRIPT` variable, no cached-version ranking, no `trap`
- The block instructs the model to substitute `<PLUGIN_ROOT>` from the `sdlc plugin root:` line injected into session context by the `SessionStart` hook
- The script path in `<PLUGIN_ROOT>/scripts/<subdir>/<script>.js` exactly matches the file as it exists in `plugins/*/scripts/` (case-sensitive, no typos, correct extension, correct subdirectory)
- No resolver of any form (old `find`-based or the new injected-path form) appears in a subagent prompt template (`**/*-prompt.md`) or orchestrator agent template (`agents/*.md`) — the injected line is absent in subagent context, so any resolver there fails silently; pre-computed paths must be passed in instead
- The plugin's own files (REFERENCE.md, EXAMPLES.md, another skill's SKILL.md, agent definitions) are read at `<PLUGIN_ROOT>/…` in the main context, or from an absolute path passed in to a subagent — never located by a Glob over `~/.claude` or the cwd, which can return a stale cached install or no file
- Glob patterns for reference file lookups are specific enough to match exactly one file — e.g., `**/review-sdlc/REFERENCE.md` not `**/REFERENCE.md`
- No resolution pattern uses hardcoded absolute paths other than the `<PLUGIN_ROOT>` substitution described above
- When a skill re-resolves the same script in a later step (e.g., first in Step 2 for validation, then in Step 7 for execution), both resolution blocks use the identical injected-path form — no divergent logic for the same script

## Severity Guide

| Finding | Severity |
|---------|----------|
| `find ~/.claude/plugins` resolver used instead of the injected-path form — can silently select a fixture or marketplace-clone copy of the script | high |
| Plugin-script resolver (old or new form) present in a subagent prompt template or orchestrator agent template — the injected line is absent there, so resolution fails silently | high |
| Script path mismatch between resolution pattern and actual file | high |
| Missing/incorrect instruction to substitute `<PLUGIN_ROOT>` from the `sdlc plugin root:` context line | medium |
| Glob reference lookup pattern too broad — could match wrong file | medium |
| Plugin-own file located by a Glob over `~/.claude` or the cwd instead of `<PLUGIN_ROOT>` or a passed-in path — can pick a stale cached install | high |
| Divergent resolution patterns for the same script across steps | medium |
| Hardcoded absolute path other than the `<PLUGIN_ROOT>` substitution | medium |

## Note

In Claude Code reviews, files matching these patterns are excluded: **/node_modules/**, docs/**.
Copilot path-specific instructions do not support exclusion patterns — use judgment when findings apply to these files.
