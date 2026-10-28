---
name: script-resolution
description: "Reviews injected-path script resolution and Glob-based reference lookup patterns in commands and skills for runtime correctness across installed and development contexts"
triggers:
  - "**/commands/*.md"
  - "**/skills/**/SKILL.md"
skip-when:
  - "**/node_modules/**"
  - "docs/**"
severity: high
model: sonnet
---

# Script Resolution Review

Review the runtime script resolution and file reference lookup patterns embedded in command and skill markdown files. This project resolves Node.js helper scripts at runtime from the plugin root injected into session context by the `SessionStart` hook — a stable `sdlc plugin root: <abs>` line emitted on `startup|clear|compact`. Skill bodies invoke scripts with the literal form `node "<PLUGIN_ROOT>/scripts/<subdir>/<script>.js"`, substituting `<PLUGIN_ROOT>` from that line. Because the hook that fired IS the active install, its root is the one correct target — no version ranking or `find` traversal is needed (the #258 multi-version-ambiguity concern is dissolved). Subagent prompt templates and orchestrator agent templates run in subagent context, where the injected line is ABSENT — no plugin-script resolver of any form belongs there; pass a pre-computed path in instead. Auto-approving this invocation form is a user-deployed recommendation, not something this checklist enforces: see `permissions.allow` in `settings.json` (documented in `plugins/sdlc-utilities/scripts/README.md` and `docs/plugin-installation.md`), never `SKILL.md` frontmatter.

## Checklist

- [ ] Every plugin-script invocation uses the injected-path form: `node "<PLUGIN_ROOT>/scripts/<subdir>/<script>.js"` — no `find ~/.claude/plugins` resolver, no `$SCRIPT` variable, no cached-version ranking, no `trap`
- [ ] The block instructs the model to substitute `<PLUGIN_ROOT>` from the `sdlc plugin root:` line injected into session context by the `SessionStart` hook
- [ ] The script path in `<PLUGIN_ROOT>/scripts/<subdir>/<script>.js` exactly matches the file as it exists in `plugins/*/scripts/` (case-sensitive, no typos, correct extension, correct subdirectory)
- [ ] No resolver of any form (old `find`-based or the new injected-path form) appears in a subagent prompt template (`**/*-prompt.md`) or orchestrator agent template (`agents/*.md`) — the injected line is absent in subagent context, so any resolver there fails silently; pre-computed paths must be passed in instead
- [ ] The plugin's own files (REFERENCE.md, EXAMPLES.md, another skill's SKILL.md, agent definitions) are read at `<PLUGIN_ROOT>/…` in the main context, or from an absolute path passed in to a subagent — never located by a Glob over `~/.claude` or the cwd, which can return a stale cached install or no file
- [ ] Glob patterns for reference file lookups are specific enough to match exactly one file — e.g., `**/review-sdlc/REFERENCE.md` not `**/REFERENCE.md`
- [ ] No resolution pattern uses hardcoded absolute paths other than the `<PLUGIN_ROOT>` substitution described above
- [ ] When a skill re-resolves the same script in a later step (e.g., first in Step 2 for validation, then in Step 7 for execution), both resolution blocks use the identical injected-path form — no divergent logic for the same script

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
