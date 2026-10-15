# Shared reviewer brief — sdlc-utilities plugin audit against Claude 5.x guidance

Repository root: /mnt/c/projects-learn/sdlc-marketplace
Plugin root:     plugins/sdlc-utilities  (version 0.21.29, plugin name "sdlc")
Audit date:      2026-10-15

## Target models (Step 0 of prompt-audit)
Claude Code resolves frontmatter model aliases to the current generation:
- `model: haiku`  -> claude-haiku-5-5  (effort default medium; thinking on by default; refusals exist, no server fallback)
- `model: sonnet` -> claude-sonnet-5-5 (effort default high, recalibrated; strongest on multistep agentic coding; follows "minimize tool calls" literally; reads text placed right after tool_result as possible injection)
- `model: opus`   -> claude-opus-5-5   (effort default medium; thinking cannot be disabled; medium ~ Opus 5 high)
- no model pinned (skills with no `model:` and reference/prompt files) -> the model running the session; assume Claude Fable 5.1 (thinking always on; narrates less; under-formats; may issue one tool call per turn where several were implied; rewrites whole files; needs autonomy + scope prompts for unattended runs; "hold findings / don't narrate" and anti-formatting rules are now harmful).
A prompt file loaded by a pinned subagent (e.g. dimension prompts dispatched by review-orchestrator) is audited against the model that subagent/dispatch pins.

## What to produce (per file in your group)
For EVERY instruction-bearing file in your group (SKILL.md, agent .md, supporting .md prompts/references/templates, hooks.json, hook .js files that inject text into the model's context):
1. **Summary** (2-4 sentences): what the file does, when it loads (every session / on skill trigger / on subagent dispatch / on hook), approx size (lines, words), which model reads it.
2. **Assessment** (1 paragraph): fit against the target model's documented behavior. Rate: GOOD / NEEDS-TUNING / NEEDS-REWORK.
3. **Findings table** in prompt-audit Step 5 shape: Location (file:line) | Evidence (quoted, short) | Pattern (group/row, e.g. "1a pressure language", "1c step choreography", "1d update suppressor", "2 volatile specifics", "2 contradiction", "3 tool description", "4 model/effort routing", "4 LLM executor for deterministic plan", "4 cache-hostile") | Why obsolete / why it matters on target model | Confidence (High/Med/Low) | Action (remove/rewrite(+replacement)/move/add/flag).
4. **Efficiency & cost notes**: token cost paid per load (size), whether content could move to progressive-disclosure reference files, whether model tier/effort for this surface is right (over-provisioned = cost; under-provisioned = quality), deterministic steps done by LLM that could be code, and prompt-caching hazards (volatile text early in a prompt, per-turn re-injected reminders).

Apply the KEEP LIST strictly: context, tool contracts, exact scripts for fragile ops (git, gh, destructive commands), reasoned prohibitions, calibrated trigger text in frontmatter descriptions, and working redundancy are NOT findings. "Shorter" is not a goal; "every token earns its place" is. An empty findings table for a clean file is a valid result.

Verify volatile specifics with the file tools (does the referenced script/flag/path exist under plugins/sdlc-utilities/scripts?). Use git blame/log sparingly for provenance where a line looks like an incident patch. Do not run promptfoo. Do not edit any repository file.

## Output
Write your full report to the scratchpad path given in your prompt, as Markdown with one `## <file path>` section per file, then a final `## Group summary` (top 3-5 highest-impact findings in prose, counts by confidence, and an overall rating for the group). Return to the caller ONLY a ~10-line summary plus the report path.

## Reference sources (read before auditing; all in this directory)
- PROMPT-AUDIT-METHOD.md — the audit methodology (pattern groups 1a-1f, 2, 3, 4; keep list; report shape). Binding.
- PROMPTING-BEST-PRACTICES.md — Anthropic's "Prompting best practices" page (fetched 2026-10-15). Sections most relevant: General principles (36-105), Communication style / format (321-382), Tool usage incl. "dial back CRITICAL/MUST" (443-521), Overthinking (525-542), Agentic systems: long-horizon state, autonomy/safety, subagent orchestration, chain prompts, overeagerness, hallucinations (792-1012), Migration (1070+).
- Per-model deltas (already summarized in "Target models" above) come from the claude-api skill's shared/model-migration.md sections for Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5.
