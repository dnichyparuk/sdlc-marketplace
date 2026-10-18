# harden-sdlc Specification

> User-invocable skill that, after an SDLC pipeline failure, analyzes the five hardening surfaces (plan guardrails, execute guardrails, review dimensions, copilot instructions, plugin self-bugs) and proposes user-approved edits that would prevent the same class of failure. Strengthen-only in v1.

**User-invocable:** yes
**Model:** sonnet (orchestrator pinned `haiku` per agent frontmatter)
**Prepare script:** `skill/harden-prepare.js`

## Arguments

- A1: `--failure-text <string>` — full text of the failure being analyzed (REQUIRED)
- A2: `--skill <skill-name>` — caller skill that produced the failure (REQUIRED)
- A3: `--step <name>` — step or section that failed (optional)
- A4: `--operation <name>` — operation the caller was attempting (optional)
- A5: `--exit-code <int>` — exit code or HTTP status from the failure (optional)
- A6: `--error-type <kind>` — `script crash` / `CLI failure` / `API error` / `build failure` / `escalation` (optional)
- A7: `--user-intent <string>` — short description of what the user was trying to do (optional)
- A8: `--args-string <string>` — arguments the caller skill was invoked with (optional)
- A9: `--output-file` — print manifest path only and exit 0 (mirrors `error-report-prepare.js` posture)

## Core Requirements

- R1: Required CLI flags `--failure-text` and `--skill` MUST be enforced — missing either yields a non-zero exit and a structured error message; the skill MUST NOT proceed past Step 1 (CONSUME) when validation fails.
- R2: Optional CLI flags (A3–A8) MUST be accepted and forwarded verbatim into the prepare-script manifest; absent fields surface as empty strings (or `null` for `exitCode`).
- R3: Stdin JSON fallback MUST be supported on the prepare script for long string fields (mirroring `error-report-prepare.js`); CLI flags take precedence over stdin fields.
- R4: The prepare script `harden-prepare.js` MUST load all five hardening surfaces deterministically into a single manifest:
  - Plan guardrails — `.sdlc/config.json` `plan.guardrails[]` (via `lib/config.js::readSection`)
  - Execute guardrails — `.sdlc/config.json` `execute.guardrails[]` (via `lib/config.js::readSection`)
  - Review dimensions — `.sdlc/review-dimensions/*.md` (frontmatter parsed via `lib/dimensions.js::extractFrontmatter` + `parseSimpleYaml`)
  - Copilot instructions — `.github/instructions/*.instructions.md` (frontmatter `applyTo` extracted; body NOT loaded)
  - Sibling-skill resolution — absolute path to `error-report-sdlc/REFERENCE.md` resolved via the canonical find-then-fallback pattern
- R5: The orchestrator agent MUST classify the failure as exactly one of `user-code`, `plugin-defect`, `ambiguous`, with a one-sentence rationale tied to the failure signal.
- R6: For each hardening surface (plan-guardrails, execute-guardrails, review-dimensions, copilot-instructions), the orchestrator MUST decide PROPOSE or SKIP and, when PROPOSE, emit a proposal with `surface`, `action`, `targetFile`, `patch` (preview), and `rationale` linked to the failure signal.
- R7: No surface file MAY be edited without an explicit per-proposal user approval recorded via AskUserQuestion in the SKILL.md main context. The orchestrator agent MUST NOT have file-write capability — the no-silent-write invariant is enforced at the tool boundary.
- R8: All v1 proposals MUST be in the strengthen-only direction (add a guardrail, tighten a description, raise severity, narrow a glob). Proposals to relax, remove, or weaken existing rules are forbidden in v1; the orchestrator MUST self-critique against this constraint before emitting JSON.
- R9: When classification is `plugin-defect`, the orchestrator MUST set `routeToErrorReport=true`, populate `errorReportPayload` with the suggested `--skill / --step / --operation / --error-text` for `error-report-sdlc`, and emit an empty `proposals` array. The SKILL.md MUST then dispatch `error-report-sdlc` instead of editing any user-side surface.
- R10: Severity vocabulary MUST be preserved per destination surface — see R17 and `lib/dimensions.js`. Proposals must use the destination surface's vocabulary, never substitute one for the other.
- R11: The skill MUST support both standalone invocation (`/harden-sdlc --failure-text "…" --skill plan-sdlc`) and caller-dispatched invocation (Skill-tool dispatch — see I1 for the canonical caller list); pipeline state (ship-sdlc paused state, execute-plan-sdlc state file) is optional context and absent values MUST NOT block execution.
- R12: Any proposed edit to `.sdlc/config.json` MUST be validated against `schemas/sdlc-config.schema.json` via `plugins/sdlc-utilities/scripts/ci/validate-guardrails.js` before write. Validation failure MUST surface the validator error to the user and offer retry-or-cancel — never silent commit.
- R13: Prepare script output is the single authoritative source for all contracted fields (P-fields) — script-provided values take unconditional precedence over skill-generated content, and all factual context (config, surface contents, sibling-skill paths, repo state) must originate from script output to ensure deterministic behavior.
- R-config-version (issue #232): The prepare script `skill/harden-prepare.js` MUST call `verifyAndMigrate(projectRoot, 'project')` at start. The call is short-circuited when CLI `--skip-config-check` OR env `SDLC_SKIP_CONFIG_CHECK=1` is present; both gates resolve into a single `flags.skipConfigCheck` boolean in the prepare output (CLI > env > default false). On migration failure the prepare emits non-zero exit and an `errors[]` entry naming the failing step; SKILL.md halts with that text verbatim.
  - Acceptance: prepare output includes `flags.skipConfigCheck` and a `migration` block (or null when skipped); SKILL.md gates further work on `errors.length === 0`.
- R-ambig-offer (issue #288): When orchestrator returns `classification="ambiguous"` AND `errorReportPayload` is non-null (plugin evidence cited in rationale), SKILL.md MUST present an opt-in AskUserQuestion offering `error-report-sdlc` dispatch alongside the per-proposal apply/skip flow. Strengthen-only invariant preserved — no surface is auto-edited; the user explicitly approves the dispatch.
  - Acceptance: SKILL.md Step 5 contains a `5c` sub-step gated on `RESULT.classification === 'ambiguous' && RESULT.errorReportPayload != null` that surfaces an `AskUserQuestion` with options `dispatch error-report-sdlc | skip`; on dispatch, the canonical Glob-then-follow path from Step 6 is reused.
- R-orchestrator-ambig (issue #288): `harden-orchestrator` MUST populate `errorReportPayload` on `ambiguous` classification only when the rationale cites plugin evidence (script crash inside `plugins/sdlc-utilities/`, agent malformed JSON, prepare-script exit 2). Pure user-code ambiguity emits `errorReportPayload: null`.
  - Acceptance: orchestrator response-shape rules in `agents/harden-orchestrator.md` document that `ambiguous + errorReportPayload != null` is a valid combination and provide a JSON example; `ambiguous + errorReportPayload == null` remains valid for user-code ambiguity.
- R-iteration-write (issue #387): For each proposal the user approves in Step 5, SKILL.md MUST persist the change to disk before presenting the next proposal. It MUST re-read `targetFile` from disk at the start of each iteration (not hold an in-memory copy from the previous write), and MUST NOT accumulate approved changes across proposals before writing. On validation or write failure for a proposal, iteration halts for that proposal — SKILL.md does not silently advance to the next proposal.
  - Acceptance: SKILL.md Step 5 contains an explicit per-iteration preamble stating the four rules (re-read, write-before-advance, no-accumulation, halt-on-failure); 5a explicitly re-reads `targetFile` from disk; 5b explicitly writes before advancing; no code path exists where two approved proposals are held in memory simultaneously before writing.
- R-copilot-mirror (issue #456): When harden-sdlc creates a NEW review-dimension file under `.sdlc/review-dimensions/<name>.md`, SKILL.md MUST also write the matching `.github/instructions/<name>.instructions.md` Copilot mirror in the SAME atomic, approved write step (same R-iteration-write contract). Specifically: (a) `.github/instructions/` MUST be created if missing; (b) if the mirror already exists, it MUST be PATCHED strengthen-only (never blindly overwritten — preserves the R8/C9 strengthen-only invariant); (c) existing dimensions are NOT retroactively mirrored (out of scope — only the dimension being created this run gets a mirror); (d) the mirror content MUST be produced by a deterministic generator script (`scripts/lib/dimension-to-instructions.js`, mechanical field-mapping), NOT inline LLM prose (`scripts-over-llm-logic` guardrail); (e) if the mirror write FAILS after the dimension write has already succeeded, SKILL.md MUST HALT and surface the partial state (dimension written, mirror missing) per R-iteration-write rule 4 — it MUST NOT silently advance. This mirrors the transform setup-sdlc already performs in `setup-dimensions.md` Step 8.
  - Acceptance: SKILL.md Step 5b contains a review-dimensions-gated branch (fires only when the approved proposal's `targetFile` is under `.sdlc/review-dimensions/`) that runs the generator on the just-written dimension file, ensures `.github/instructions/` exists, patches-if-exists or writes the mirror, and halts on mirror-write failure after a successful dimension write; `docs/skills/harden-sdlc.md` "What It Creates or Modifies" lists the mirror artifact.
- R-common-prompt-passthrough (issue #519): When generating the Copilot mirror per R-copilot-mirror, SKILL.md MUST pass the shared common-prompt file (`.sdlc/review-dimensions/_common.md` — canonical definition, injection contract, and validation-exclusion rule at `docs/specs/review-sdlc.md::R-common-prompt`; this spec MUST NOT restate that content inline) to `scripts/lib/dimension-to-instructions.js` via `--common-file <path>` whenever `$CONTENT_ROOT/.sdlc/review-dimensions/_common.md` exists; the flag MUST be omitted when the file is absent (mirror output byte-identical to the no-common-file case). The file-existence branch MUST use an explicit `if [ -f ... ]` conditional producing distinct argv tokens in both invocation branches — MUST NOT build the flag as a variable expanded unquoted, since that construction is not portable (bash: embedded-quote corruption; zsh: no IFS word-splitting on unquoted expansion, so a two-token flag collapses into one argv token and is silently dropped by the script's arg parser).
  - Acceptance: SKILL.md Step 5(1) contains an explicit `if [ -f "$COMMON_FILE_PATH" ]` branch (not a flag-string variable expanded unquoted) around the generator invocation; mirror output for a given `_common.md` matches the equivalent injection performed by `setup-dimensions.md`.
- R14 — Review-dimension priority and minimum coverage: The orchestrator MUST order proposals with `surface: "review-dimensions"` first, followed by `plan-guardrails`, `execute-guardrails`, `copilot-instructions`. Within a surface, proposals are ordered as drafted. Per iteration the orchestrator MUST emit either ≥1 review-dimension proposal OR populate `skipped.reviewDimensions.rationale` (string) on the envelope explaining why no review-dimension change is warranted. The skill body surfaces this rationale to the user. Absence of both is a malformed envelope (treated per E4).
  - Acceptance: orchestrator JSON example in `agents/harden-orchestrator.md` shows review-dimensions first; missing both conditions produces an E4 malformed-envelope halt.
- R15 — Duplication scan + `consolidate` action: Before emitting `strengthen` or `add` for `plan-guardrails` / `execute-guardrails`, the orchestrator MUST scan the manifest's existing guardrails for id overlap or strong description overlap. On overlap, the proposal action MUST be `consolidate` (merge/supersede the existing guardrail by id; description tightening + severity raise only). The strengthen-only invariant (R8/C9) is preserved — `consolidate` MAY NOT remove fields or lower severity. Acceptance: orchestrator's allowed `action` enum extended to `add | strengthen | consolidate`; Step 4 self-critique checks consolidate-vs-strengthen choice; `lib/harden-surfaces.js` exports `findDuplicateGuardrails` for semantic overlap detection.
- R16 — Pre-flight existing-config validation: `harden-prepare.js` MUST validate the on-disk state of `.sdlc/config.json` (both `plan.guardrails[]` and `execute.guardrails[]` sections) AND every existing `.sdlc/review-dimensions/*.md` file BEFORE assembling the manifest. Validation uses `ci/validate-guardrails.js::validateGuardrailsConfig` (extracted per Task 4) and `lib/dimensions.js::validateDimensionFile`. On any error, the prepare script MUST exit 1 with structured `errors[]` (per-surface, per-file) and MUST NOT write the manifest.
  - Acceptance: invocation against a fixture with broken dimension frontmatter exits 1 and prints the file path + error.
- R17 — Severity vocabulary single source: The canonical severity vocabularies live in `lib/dimensions.js`: existing `VALID_SEVERITIES` (review-dimensions: `critical|high|medium|low|info`) and new export `GUARDRAIL_SEVERITIES` (`error|warning`, for plan/execute guardrails). This inline definition at R17 is the single canonical restatement of the literal vocabulary — all other markdown surfaces (SKILL.md, orchestrator, docs) MUST reference by qualified name (`lib/dimensions.js::VALID_SEVERITIES`, `lib/dimensions.js::GUARDRAIL_SEVERITIES`) and MUST NOT restate the literal vocabulary inline.
- R18 (Fixes #417 — Learning Capture log format with Dimensions line): The LEARN step MUST append a multi-line entry to `.sdlc/learnings/log.md` with the following format:
  ```
  ## YYYY-MM-DD — harden-sdlc: <classification> for <failure.skill> at <failure.step>
  Applied: <count> proposal(s) across <surface-list> | Skipped: <count> | Routed: <yes|no>
  AmbiguousOffer: <not-applicable|offered-dispatched|offered-skipped>
  Trigger: <first 80 chars of failure.text>
  ```
  When `<surface-list>` includes `review-dimensions`, the entry MUST include one additional line immediately after `Trigger:`:
  ```
  Dimensions: <comma-separated dimension names that were created or modified>
  ```
  The `Dimensions:` line MUST be omitted when the surface-list does not include `review-dimensions`. This line exists so that plan-sdlc's G17 gate can deterministically suppress duplicate dimension proposals on subsequent runs within the same PR commit window — it greps the last 100 lines of `log.md` for recent `harden-sdlc` entries whose `Dimensions:` line names the candidate dimension (Fixes #417 defer rule, R31 in the plan-sdlc spec).
- R19 (--from-issue flag): harden-sdlc MUST accept `--from-issue <num>` as a mutually exclusive alternative to `--failure-text`. When set, `harden-prepare.js` fetches the GitHub issue via `gh issue view <num> --json body,labels,title` and uses `.body` as `failureText`. When the fetched issue carries the `mcp-failure` label (i.e., `.labels[].name` contains `"mcp-failure"`), harden-sdlc MUST pre-set `classification: "plugin-defect"` in the manifest so the orchestrator skips triage and routes directly to the plugin-defect path (R9). The four existing hardening surfaces (plan-guardrails, execute-guardrails, review-dimensions, copilot-instructions) are unchanged — `mcp-failure` issues land as guardrail/dimension hardening proposals over those four surfaces. `--from-issue` and `--failure-text` specified simultaneously MUST exit code 2 with a clear mutual-exclusion error message. On `gh issue view` failure (issue not found, auth error, no gh CLI), the prepare script MUST exit 1 with a structured error entry naming the issue number and the gh error.
  - Acceptance: exec test asserts `--from-issue <num>` fetches issue body and routes through the existing harden flow; exec test asserts simultaneous `--from-issue` + `--failure-text` flags exit 2 with descriptive error; exec test asserts an issue with `mcp-failure` label pre-sets `plugin-defect` classification in manifest output.

## Workflow Phases

1. CONSUME — validate args, run prepare script, capture manifest path
   - **Script:** `skill/harden-prepare.js`
   - **Params:** A1–A8 forwarded
   - **Output:** JSON → P1–P10 (failure context, classification hint, five surface arrays, sibling skill path, pipeline state, repo metadata)
2. CLASSIFY — surface manifest classification + rationale to user; on `plugin-defect`, jump directly to ROUTE
3. ANALYZE — dispatch `harden-orchestrator` agent (model: haiku, tools: Read) with `MANIFEST_FILE` and `PROJECT_ROOT`; agent emits ONLY a JSON object with `classification`, `proposals`, `routeToErrorReport`, `errorReportPayload`
4. PRESENT — display every proposal with full patch preview; AskUserQuestion per proposal (`apply | skip`) plus global `cancel`
5. APPLY — for each approved proposal: validate against the surface's schema; on pass, write the file; on fail, surface validator error and offer retry-or-cancel
6. ROUTE — when classification is `plugin-defect`, dispatch `error-report-sdlc` using the canonical Glob-then-follow pattern with the orchestrator-supplied payload (no surface edits)
7. LEARN — append a one-line entry to `.sdlc/learnings/log.md` summarizing the hardening action

## Quality Gates

- G1: Proposal coherence — every emitted proposal MUST cite a specific failure-signal element (a guardrail id, a dimension name, a copilot pattern, or a verbatim phrase from `failure.text`) in its `rationale`
- G2: Surface coverage — when failure signal is non-empty, the orchestrator MUST evaluate every loaded surface (skip is acceptable but must be intentional, not omission)
- G3: Classification accuracy — `classification` MUST match observable evidence; `plugin-defect` requires the failure to point at plugin code (script crash inside `plugins/sdlc-utilities/`, agent malformed JSON, prepare-script exit 2), not user-code or config. An `ambiguous` classification MAY carry a non-null `errorReportPayload` when the rationale cites plugin evidence (R-orchestrator-ambig); pure user-code ambiguity emits `errorReportPayload: null`.
- G4: No-silent-write and no-silent-drop invariant — across all paths (success, cancel, agent crash, validation fail) the count of files written without an `apply` AskUserQuestion answer MUST be zero; additionally, the count of approved proposals that were not immediately persisted to disk (dropped silently by accumulation or cross-iteration merge) MUST also be zero

## Prepare Script Contract

- P1: `failure.text` (string) — verbatim from `--failure-text`
- P2: `failure.skill` (string) — verbatim from `--skill`
- P3: `failure.step` / `failure.operation` / `failure.exitCode` / `failure.errorType` / `failure.userIntent` / `failure.argsString` — optional context fields, empty when absent
- P4: `classification_hint` (string|null) — `user-code` | `plugin-defect` | `ambiguous` | `null`
- P5: `surfaces.planGuardrails[]` — `{id, severity, description}` objects
- P6: `surfaces.executeGuardrails[]` — `{id, severity, description}` objects
- P7: `surfaces.reviewDimensions[]` — `{name, severity, description, triggers, model, path}` objects
- P8: `surfaces.copilotInstructions[]` — `{applyTo, name, path}` objects
- P9: `surfaces.errorReportSkillPath` (string) — absolute path to resolved `error-report-sdlc/REFERENCE.md`
- P10: `pipeline.shipState` / `pipeline.executeState` — optional summaries of paused pipeline state (or `null`)
- P11: `repository.root` / `repository.branch` / `repository.recentDiffSummary` — `repository.root` is the MAIN worktree (config/`.sdlc/` root, = `resolveSdlcRoot()`); `branch`/`recentDiffSummary` describe the ACTIVE checkout (resolved against `repository.contentRoot`); git short-stat only, no full body
- P12: `pluginRepoUrl` (string) — constant URL of the plugin's GitHub repository, surfaced verbatim to the user prompt and forwarded as context to error-report-sdlc.
- P13: `repository.contentRoot` (string) — the ACTIVE worktree root (`resolveActiveWorktreeSafe()`); equals `repository.root` in the single-worktree case. Branch-tracked surface paths (`reviewDimensions[].path`, `copilotInstructions[].path`) are rooted here, NOT at `repository.root`.

## Error Handling

- E1: Missing `--failure-text` or `--skill` → exit code 1; stdout JSON `{ errors: [...] }`; SKILL.md aborts at Step 1
- E2: Malformed surface file (e.g., dimension file with broken frontmatter) → record in manifest `errors[]`; surface returns the parseable subset; SKILL.md surfaces the warning to user but proceeds
- E3: Unknown failure type / classification cannot be determined → orchestrator emits `classification: "ambiguous"` with rationale; SKILL.md proceeds with proposals if any surface has signal, otherwise reports "no actionable hardening" and exits cleanly
- E4: Orchestrator returns malformed or non-JSON output → SKILL.md aborts with the raw response shown to user; no retry (issue is unrelated to the failure being analyzed)

## Constraints

- C1: No shell-out beyond read-only `git` (`git rev-parse --abbrev-ref HEAD`, `git diff --shortstat`); no `gh`, no `curl`, no network calls in the prepare script
- C2: `harden-prepare.js` MUST be ≤ 200 lines; surface-specific loaders MAY be extracted into `lib/harden-surfaces.js` to honor this bound
- C3: No LLM logic in the loader — all five surfaces are loaded deterministically by the prepare script; SKILL.md MUST NOT glob, parse YAML, or read config directly
- C4: `promptfoo eval` invocation policy (per `no-auto-eval` guardrail):
  - **Allowed:** a single targeted test case scoped to the changed surface MAY be run as the final verification step at the end of an implementation.
  - **Allowed:** exec-only configs (`promptfooconfig-exec.yaml`, `promptfooconfig-exec-hooks.yaml`) — no LLM provider — are fully relaxed; targeted runs are permitted at any verification gate.
  - **Forbidden:** running the full suite (`promptfooconfig.yaml`) or a wide subset autonomously.
  - **Forbidden:** tight-loop retries (run-fix-rerun) in any case.
- C5: Must not skip, bypass, or defer prepare script execution — the script must run and exit successfully before any skill phase begins
- C6: Must not override, reinterpret, or discard prepare script output — for every P-field, the script return value is authoritative and final; the skill must not substitute LLM-generated alternatives
- C7: Must not independently compute, infer, or fabricate values for any field the prepare script is contracted to provide — if the script fails or a field is absent, the skill must stop rather than fill in data
- C8: Must not re-derive data the prepare script already computes via shell commands, tool calls, or LLM inference — script output is the sole source for all factual context, preserving deterministic behavior
- C9: Must not propose relaxing or removing existing rules in v1 (strengthen-only invariant)
- C10: Must not auto-dispatch from caller skills — every caller integration is opt-in via menu selection only
- C-projectroot: Scripts that use `process.cwd()` as the project root silently break when invoked from a sub-directory or a git worktree. All projectRoot resolutions in this skill's scripts MUST route through `resolveSdlcRoot()` (lib/config.js); `process.cwd()` is forbidden except in documented bootstrap entry points. Scope: config/guardrail/state paths only — branch-tracked content paths use `contentRoot` per C-contentroot.
  - Acceptance: `resolveSdlcRoot()` is called to establish `projectRoot` in `skill/harden-prepare.js`; no bare `process.cwd()` usage contributes to any path resolved against the project root; invoking the script from a repo sub-directory yields the correct root.
- C-contentroot: Branch-tracked surfaces (review-dimensions, copilot-instructions) and their pre-flight validation MUST resolve against `contentRoot = resolveActiveWorktreeSafe()` (lib/worktree.js), so writes land in the active worktree. Config/guardrail surfaces (plan/execute guardrails) and their pre-flight validation MUST resolve against `projectRoot = resolveSdlcRoot()` (main worktree) for both read and write — config is shared, main-rooted state (#351, `workspace-mode-compatibility`). The orchestrator builds the `.sdlc/config.json` targetFile from `repository.root` (main) and dimension/copilot targetFiles from each surface's `path` field (content). `PROJECT_ROOT` passed to the orchestrator is `repository.contentRoot`; the "do not Read outside PROJECT_ROOT" rule is scoped to Reads (the config targetFile under `repository.root` is an emitted path, not a Read).
  - Acceptance: invoking `harden-prepare.js` from a linked worktree yields `reviewDimensions[].path` and `copilotInstructions[].path` under the active worktree and `repository.contentRoot` = active root, while `planGuardrails`/`executeGuardrails` are read from the main config and `repository.root` = main; in a single worktree all roots are identical.
- C-11: Caller list MUST appear inline in this spec at I1 only. All other harden-sdlc surfaces (SKILL.md, `docs/skills/harden-sdlc.md`, `agents/harden-orchestrator.md`) MUST reference I1 by name rather than restating the list.
- C-12: Strengthen-only invariant MUST appear inline at R8 (rule) and C9 (constraint) only. All other surfaces MUST reference R8 and C9 by name rather than restating the invariant text.

## Integration

- I1: Caller-skill dispatch contract — the following caller skills present an opt-in menu option that dispatches `Skill(harden-sdlc)` with `--failure-text`, `--skill`, `--step`, `--operation` (and optionally `--exit-code`): **plan-sdlc, execute-plan-sdlc, review-sdlc, commit-sdlc, received-review-sdlc**. Canonical menu wording is shared per `cross-skill-consistency` and `no-opposite-logical-vectors` guardrails. Other harden-sdlc surfaces (SKILL.md, `docs/skills/harden-sdlc.md`, orchestrator agent) MUST reference I1 rather than restating this list.
- I2: `error-report-sdlc` handoff — when `classification == "plugin-defect"`, harden-sdlc dispatches `error-report-sdlc` instead of editing user-side surfaces; the orchestrator-supplied `errorReportPayload` carries `--skill / --step / --operation / --error-text` ready to forward.
- I3: `schemas/sdlc-config.schema.json` validation — proposed sdlc.json edits MUST pass `plugins/sdlc-utilities/scripts/ci/validate-guardrails.js` (canonical validator) before write; review-dimension edits MUST pass `schemas/review-dimension.schema.json`.
- I4: Session-start state — paused ship-sdlc state file (`.sdlc/execution/ship-*.json`) and execute-plan-sdlc state file (`.sdlc/execution/execute-*.json`) are optional context for the manifest; harden-sdlc reads these files when present but does not require them. `ship-sdlc` is intentionally NOT a caller — it delegates failure handling to its sub-skills, and harden-sdlc reaches the user through whichever sub-skill failed.

## Source

Fixes #221.
