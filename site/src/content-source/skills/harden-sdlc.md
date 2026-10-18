# `/harden-sdlc` — Strengthen Hardening Surfaces After a Pipeline Failure

## Overview

Use this skill after an SDLC pipeline failure to analyze the project's hardening surfaces (plan and execute guardrails, review dimensions, copilot instructions) and propose user-approved edits that would catch the same class of failure earlier next time. Strengthen-only in v1 — never relaxes or removes existing rules. No surface is edited without explicit per-proposal approval.

---

## Usage

```text
/harden-sdlc --failure-text "<full failure text>" --skill <caller-name>
```

The skill is also opt-in dispatched from caller skills (see spec I1 for the canonical list and dispatch contract). `ship-sdlc` is intentionally NOT a caller — it delegates failure handling to its sub-skills, so harden-sdlc reaches the user through whichever sub-skill failed.

---

## Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--failure-text <string>` | Full text of the failure being analyzed (mutually exclusive with `--from-issue`) | — |
| `--from-issue <num>` | GitHub issue number to fetch as failure text (mutually exclusive with `--failure-text`); when the issue carries the `mcp-failure` label, pre-sets `plugin-defect` classification | — |
| `--skill <name>` | Caller skill that produced the failure (REQUIRED) | — |
| `--step <name>` | Step or section that failed | empty |
| `--operation <name>` | Operation the caller was attempting | empty |
| `--exit-code <int>` | Exit code or HTTP status from the failure | empty |
| `--error-type <kind>` | `script crash` / `CLI failure` / `API error` / `build failure` / `escalation` | empty |
| `--user-intent <string>` | Short description of what the user was trying to do | empty |
| `--args-string <string>` | Arguments the caller skill was invoked with | empty |

---

## Examples

### Standalone invocation after a guardrail block

```text
/harden-sdlc \
  --failure-text "Guardrail no-auto-eval failed: plan task 7 invokes full-suite promptfoo eval" \
  --skill plan-sdlc \
  --step "Step 4 — IMPROVE" \
  --operation "error-severity guardrail block"
```

Expected: prepare script writes a manifest to `$TMPDIR/sdlc-harden-*.json` with all five surfaces loaded, the orchestrator classifies the failure as `user-code`, and one or more `plan-guardrails` proposals are presented for approval.

### Caller-dispatched invocation from execute-plan-sdlc

```text
Skill(harden-sdlc) with args:
  --failure-text "Wave 2 output violates spec-first: SKILL.md edited without matching spec edit"
  --skill execute-plan-sdlc
  --step "5c-ter"
  --operation "post-wave guardrail evaluation"
```

Expected: harden-sdlc resumes the user's interactive flow within the caller skill, presents proposals tightening the relevant guardrail's description or severity, and returns to the caller after the user approves or skips.

### Plugin-defect classification routing to error-report-sdlc

```text
/harden-sdlc \
  --failure-text "harden-prepare.js crashed with exit code 2: undefined readSection" \
  --skill harden-sdlc \
  --step "Step 1 — CONSUME" \
  --error-type "script crash" \
  --exit-code 2
```

Expected: orchestrator emits `classification: "plugin-defect"`, no surface proposals are presented, and the user is asked to confirm dispatch of `error-report-sdlc` with the supplied payload. The prompt names the target repository using `MANIFEST.pluginRepoUrl` (sourced from the prepare-script manifest, not hardcoded in the SKILL).

### Feed a mcp-failure GitHub issue as failure input (--from-issue, R19)

When jira-sdlc files a `mcp-failure`-labeled issue (via the R28 analyze-then-confirm gate), consume it directly as hardening input — no copy-paste needed:

```text
/harden-sdlc --from-issue 422 --skill jira-sdlc
```

The prepare script fetches the issue body via `gh issue view 422 --json body,labels,title`. Because the issue carries the `mcp-failure` label, the orchestrator pre-classifies as `plugin-defect` and routes to the plugin-defect path (Step 6 → `error-report-sdlc`). The four hardening surfaces (plan-guardrails, execute-guardrails, review-dimensions, copilot-instructions) are proposed over that classification.

`--from-issue` and `--failure-text` are mutually exclusive — providing both exits with code 2 and a clear error.

See [`/jira-sdlc`](jira-sdlc.md#mcp-failure-self-tracking) for the MCP failure self-tracking section that produces these issues.

### Ambiguous classification with plugin evidence — Step 5c upstream-report offer (issue #288)

When the orchestrator returns `classification: "ambiguous"` AND
`errorReportPayload` is non-null (the rationale cites plugin evidence such as a
script crash inside `plugins/sdlc-utilities/`, malformed JSON from a sibling
agent, or a prepare-script exit code 2), Step 5c surfaces an opt-in
upstream-report offer **after** the per-proposal apply/skip flow completes:

> This failure may also be a plugin defect. File a GitHub issue at
> `<MANIFEST.pluginRepoUrl>`?
>
> Options: **dispatch error-report-sdlc** | **skip**

The prompt text sources the plugin repo URL from the prepare-script manifest's
`pluginRepoUrl` field — Step 6 (the `plugin-defect` routing path) does the
same, so both prompts stay consistent. On `dispatch error-report-sdlc`, the
skill follows the same Glob-then-follow pattern as Step 6 to invoke
[`/error-report-sdlc`](error-report-sdlc.md) with the orchestrator-supplied
`errorReportPayload`. On `skip`, the skill records the outcome in Step 7
Learning Capture and exits cleanly. The strengthen-only invariant is preserved
— no surface is auto-edited; the user explicitly approves the dispatch.

When `classification: "ambiguous"` carries `errorReportPayload: null` (pure
user-code ambiguity with no plugin signal in the rationale), Step 5c is
suppressed entirely — the skill proceeds with only the user-side proposals.

---

## Guardrails are not set-and-forget

Every red pipeline is a signal. The question is which kind: `user-code` (the implementation or plan violated a project rule), `plugin-defect` (the failure originates inside plugin code), or `ambiguous` (evidence doesn't cleanly separate the two). `/harden-sdlc` is the routing tool that classifies which — and proposes the surface edit that would have caught it earlier.

The set-and-forget anti-pattern looks like this: guardrails and dimensions are authored once during `/setup-sdlc`, the team ships for a few months, and 20 failures later the same class of problem keeps slipping through because the rules were written for a simpler codebase than the one that exists now. If you recognize this — the pattern has a name, and `/harden-sdlc` is how you break it.

The recommended cadence is to run `/harden-sdlc` after every red pipeline that produced new information, not only after catastrophic failures. Small failures teach small lessons. Skipping them means the next pipeline inherits all the same gaps, and the lesson compounds.

Guardrails, review dimensions, and copilot instructions co-evolve with the project. The configuration produced by `/setup-sdlc` is a starting point, not a finished state. As the codebase grows, add dimensions for newly introduced tech (e.g., a new `**/*.yaml` dimension when YAML config files become load-bearing) and tighten guardrail descriptions when they produce false negatives. See guardrail authoring guidance in [`plan-sdlc.md`](plan-sdlc.md), execution-guardrail patterns in [`execute-plan-sdlc.md`](execute-plan-sdlc.md), and dimension scoping in [`review-sdlc.md`](review-sdlc.md).

Failure → harden classifies → proposes surface edits → user approves → next pipeline catches earlier → repeat until coverage is satisfactory.

---

## Scenario walkthroughs

### Scenario 1 — Plan drift caught late

**Symptom:** The plan reviewed clean, but execution touched files outside the intended scope — changes landed in packages that weren't mentioned in the plan.

**Classification:** `user-code` — plan guardrails are too loose. No rule prevented out-of-scope file references from appearing in the plan or passing the Step 3 critique gate.

**Proposed change:** A new `plan.guardrails[]` entry restricting file scope to the named package — for example: "Plan tasks must not reference files outside `packages/payments/`."

**Outcome:** Future plans with out-of-scope file references are blocked at plan-sdlc's Step 3 critique gate before any code is written.

---

### Scenario 2 — Review dimension blind spot

**Symptom:** The review passed with no blockers, but a regression appeared in YAML config files — no dimension was scoped to cover them.

**Classification:** `user-code` — no review dimension covers `**/*.yaml`. The gap wasn't visible until a failure exposed it.

**Proposed change:** A new review dimension scoped to `**/*.yaml`, validated via `lib/dimensions.js::validateDimensionFile` before write. The dimension describes what a correct YAML config review looks for: schema validity, no hardcoded secrets, environment parity.

**Outcome:** YAML config files receive dedicated review coverage on every future change. The same blind spot cannot recur silently.

---

### Scenario 3 — Plugin defect (route to error-report-sdlc)

**Symptom:** The skill itself misbehaved — `harden-prepare.js` crashed with exit code 2, or the orchestrator received malformed JSON from a sibling agent. The failure is not traceable to user config or plan content.

**Classification:** `plugin-defect` — the failure originates inside plugin code, not user-controlled surfaces.

**Proposed change:** None. harden-sdlc does not patch plugin code. Instead, it hands off to `/error-report-sdlc` with the full failure payload, sourcing the target repository URL from `MANIFEST.pluginRepoUrl`.

**Outcome:** A GitHub issue is filed against the plugin repository. The user's config surfaces are left unchanged. The boundary between "strengthen config" and "report a bug" is enforced by classification.

---

### Scenario 4 — Ambiguous classification

**Symptom:** The failure could be either user config or plugin behavior — for example, a guardrail triggered on edge-case output the plugin shouldn't have emitted, or a review dimension that produced unexpected results on a code pattern not anticipated during setup.

**Classification:** `ambiguous` — the evidence doesn't cleanly separate user-side from plugin-side causation.

**Proposed change:** harden-sdlc surfaces user-side proposals (tighten the relevant guardrail or dimension) AND an opt-in upstream-report offer (Step 5c), letting the user pick either, both, or neither.

**Outcome:** Normal — not every failure has a clean classification, and dual-routing is intended behavior. The user retains control over which path to take. Approving user-side proposals and filing a plugin issue are not mutually exclusive.

---

### Scenario 5 — Duplicate guardrail — consolidation

**Symptom:** The prepare manifest shows `plan.guardrails[]` already contains `id: "no-bare-cwd"` with description "Avoid bare `process.cwd()` in scripts." A new failure references another `process.cwd()` usage — the orchestrator considers emitting an `add` proposal for a semantically identical guardrail.

**Classification:** `user-code` — an existing guardrail was not enforced or its description needs tightening.

**Proposed change:** Instead of `action: "add"` (which would create a duplicate id), the orchestrator emits `action: "consolidate"` targeting `no-bare-cwd` — tightening the description to cover the new case and optionally raising severity. The proposal `patch` cites the existing guardrail's id.

**Outcome:** `.sdlc/config.json` is updated in-place at the existing guardrail entry (not a new entry added). No duplicate ids. Severity vocabulary per surface: see `lib/dimensions.js` (`VALID_SEVERITIES`, `GUARDRAIL_SEVERITIES`).

---

### Scenario 6 — Invalid existing config — prepare halts

**Symptom:** `.sdlc/config.json` contains a plan guardrail with a malformed id (not kebab-case) or a review-dimension file has missing required frontmatter fields. Running `/harden-sdlc` exits immediately with a non-zero exit code.

**Classification:** Not reached — the prepare script exits before the orchestrator runs.

**Proposed change:** None — the skill halts and prints the structured `errors[]` array listing the file and the specific validation problem. The user must fix the invalid config or dimension file before hardening can proceed.

**Outcome:** `harden-prepare.js` exits 1 and stderr shows `pre-flight validation failed: existing-review-dimension broken.md: <error>`. This prevents the duplication-detection logic from running against a corrupted manifest. Fix the broken file and re-invoke.

---

### Scenario 7 — Review-dimension priority

**Symptom:** A failure has signals across multiple surfaces: a stale plan guardrail AND a gap in review-dimension coverage for a new file type.

**Classification:** `user-code` — both surfaces contributed to the failure reaching production.

**Proposed change:** The orchestrator emits two proposals. The review-dimension proposal appears first in `proposals[]` (R14 ordering), followed by the plan-guardrail proposal. The user sees dimension changes first because they catch drift at review time, before plan execution.

**Outcome:** The user approves the review-dimension proposal first, then the plan-guardrail proposal. Both are written immediately per the per-iteration persistence rule (strengthen-only invariant — see spec R8 / C9). The failure class is now double-covered: review and plan-level.

---

> **Boundary.** harden-sdlc strengthens config surfaces only: `.sdlc/config.json` guardrails, `.sdlc/review-dimensions/*.md`, and `.github/instructions/*.instructions.md`. It does not patch plugin code. Plugin defects route to [`/error-report-sdlc`](error-report-sdlc.md).

> **Per-iteration persistence (issue #387).** Each approved proposal is written to disk immediately before the next proposal is presented — changes are never accumulated across proposals. At the start of each iteration `targetFile` is re-read from disk, ensuring a prior write's state is always the base for the next change.

---

## Prerequisites

- **`.sdlc/config.json`** — optional. When present, plan and execute guardrails are loaded from `plan.guardrails[]` and `execute.guardrails[]`. When absent, those surface arrays are empty and the orchestrator simply skips them.
- **`.sdlc/review-dimensions/*.md`** — optional. When present, each dimension's frontmatter is parsed via `lib/dimensions.js` and exposed as a hardening surface.
- **`.github/instructions/*.instructions.md`** — optional. When present, frontmatter `applyTo` patterns are exposed as a hardening surface (body content is not loaded).
- **`error-report-sdlc`** — required for the plugin-defect routing path. The prepare script resolves `REFERENCE.md` via in-repo path, then peer-relative fallback.
- **`gh` CLI / git** — only `git rev-parse` and `git diff --shortstat` are used (read-only). No network calls in the prepare script.

---

## What It Creates or Modifies

| File / Artifact | Description |
|-----------------|-------------|
| `$TMPDIR/sdlc-harden-<hex>.json` | Transient manifest written by `harden-prepare.js`; cleaned up by trap on every exit path |
| `.sdlc/config.json` | When user approves a `plan-guardrails` or `execute-guardrails` proposal — schema-validated via `ci/validate-guardrails.js` before write |
| `.sdlc/review-dimensions/<name>.md` | When user approves a `review-dimensions` proposal — validated via `lib/dimensions.js::validateDimensionFile` before write |
| `.github/instructions/<name>.instructions.md` | Two write paths: (1) when the user approves a `copilot-instructions` proposal — direct write after approval; (2) automatically as the Copilot mirror of a NEW `review-dimensions` file, generated by `scripts/lib/dimension-to-instructions.js` and written in the SAME approved write step as the dimension (R-copilot-mirror, issue #456). `.github/instructions/` is created if missing; an existing mirror is patched strengthen-only; existing dimensions are not retroactively mirrored. If the mirror write fails after the dimension write succeeded, harden halts and surfaces the partial state. |
| `.sdlc/learnings/log.md` | One-line append after each invocation summarizing classification, applied/skipped counts, and the failure trigger. When the `review-dimensions` surface is in the surface-list (i.e., at least one review-dimension file was created or modified), an optional `Dimensions: <comma-separated names>` line is appended immediately after the summary line. This line is consumed by plan-sdlc's G17 defer-check to determine whether a candidate dimension has been recently hardened. |

No file is written without an explicit `apply` AskUserQuestion answer recorded for that specific proposal.

> **Worktrees.** From a linked git worktree, review-dimension and Copilot-instruction
> edits land in the **active** worktree (your branch); guardrail edits to `.sdlc/config.json`
> land in the **main** worktree (shared config). In a single worktree the two coincide.

---

## Related Skills

- [`/plan-sdlc`](plan-sdlc.md) — caller; dispatches harden-sdlc at Step 4 error-severity guardrail block and Step 5 reviewer-loop max-iterations escalation
- [`/execute-plan-sdlc`](execute-plan-sdlc.md) — caller; dispatches harden-sdlc at Step 5a-pre and Step 5c-ter guardrail FAIL menus and at Step 6 persistent task-failure escalation
- [`/review-sdlc`](review-sdlc.md) — caller; dispatches harden-sdlc at Step 5 actionable-findings menu when verdict is CHANGES REQUESTED with at least one dimension blocker
- [`/commit-sdlc`](commit-sdlc.md) — caller; dispatches harden-sdlc at Step 5 subject-pattern reject as an alternative to editing the subject
- [`/error-report-sdlc`](error-report-sdlc.md) — receives plugin-defect routing when classification points at plugin code rather than user content
- [`/setup-sdlc`](setup-sdlc.md) — initial authoring of guardrails, dimensions, and copilot instructions — harden-sdlc strengthens what setup-sdlc creates
- [`/jira-sdlc`](jira-sdlc.md#mcp-failure-self-tracking) — source of `mcp-failure`-labeled issues; use `--from-issue <num>` to consume them as hardening input

<!--
NOTE: This section is for GitHub markdown browsing only.
On the site (rnagrodzki.github.io/sdlc-marketplace), Related Skills are rendered
as styled SkillCard tiles auto-generated from `site/src/data/skills-meta.ts` connections.
The remark-strip-related-skills plugin removes this section before site rendering.
To add/update related skills on the site, edit the `connections` array in skills-meta.ts.
-->
