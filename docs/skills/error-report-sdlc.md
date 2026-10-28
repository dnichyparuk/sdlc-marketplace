# `error-report-sdlc` — Error-to-GitHub Issue Proposal

## Overview

Internal skill that proposes creating a GitHub issue in rnagrodzki/sdlc-marketplace when an SDLC skill encounters an actionable error. When invoked by another skill's error handling path, it verifies gh CLI availability, asks for user consent (two gates), assembles a structured issue from the error context, and creates the issue using the gh CLI. Non-user-invocable — it only runs when explicitly dispatched from within another skill.

---

## Usage

This skill is not user-invocable. It is dispatched internally by other skills at specific error handling points. The calling skill provides error context; this skill handles the rest.

To add error-reporting to a skill, insert this block at each issue-worthy error point in the skill's SKILL.md:

```text
**Error-to-GitHub issue proposal**:

If this error is issue-worthy (see error classification in error-report-sdlc/SKILL.md),
read the procedure at `<PLUGIN_ROOT>/skills/error-report-sdlc/SKILL.md` (the plugin root
from the `sdlc plugin root:` context line) and follow it with this context:

- **Skill**: {this skill's name}
- **Step**: {current step number and name}
- **Operation**: {what was being attempted}
- **Error**: {full error details}
- **Suggested investigation**: {skill-specific diagnostic hint}

If the file is not found, skip — the capability is not installed.
```

---

## Flags

This skill has no flags. It is configured entirely by the context provided by the calling skill.

---

## Examples

### Skill author adopting the error proposal (pr-sdlc, exit code 2)

When `pr-prepare.js` crashes (exit code 2), pr-sdlc calls this skill with:

```text
- Skill: pr-sdlc
- Step: Step 0 — pr-prepare.js execution
- Operation: Running pr-prepare.js to pre-compute PR context
- Error: Exit code 2 — Script error (see output above)
- Suggested investigation: Check Node.js version, verify pr-prepare.js is not corrupted,
  inspect stderr for the stack trace
```

The skill then:
1. Verifies gh CLI is authenticated and a GitHub remote is resolvable
2. Offers: `This error may be worth tracking as a GitHub issue. Create one? (yes / no)`
3. If yes: assembles and presents a draft issue for review
4. If confirmed: creates the issue and reports the key + URL

### User sees (on yes → yes)

```text
This error may be worth tracking as a GitHub issue. Create one? (yes / no)
> yes

Proposed GitHub Issue:
───────────────────────────────────────────
Title:    [pr-sdlc] pr-prepare.js crashed with exit code 2
Priority: High
Labels:   tooling-error, pr-sdlc

Description:
## Error Summary
pr-prepare.js crashed unexpectedly during PR context collection.
...
───────────────────────────────────────────
Create this issue? (yes / edit / cancel)
> yes

GitHub issue created: #42 — https://github.com/rnagrodzki/sdlc-marketplace/issues/42
```

---

## Prerequisites

- **gh CLI installed and authenticated**: `gh auth status` must succeed
- **GitHub remote configured**: The calling skill's project must have a git remote pointing to a GitHub repository

If either prerequisite is missing, the proposal is silently skipped — no error shown to the user.

### Harness Configuration

| Field | Value |
|---|---|
| `disable-model-invocation` | `true` (only dispatched by other skills' error handlers) |
| Plan mode | Not applicable (internal skill) |

---

## What It Creates or Modifies

| File / Artifact | Description |
|---|---|
| GitHub issue (external) | An issue in rnagrodzki/sdlc-marketplace with tooling-error label, created only after explicit user confirmation |

No local files are created or modified by this skill.

---

## Related Skills

- [`/pr-sdlc`](pr-sdlc.md) — Adopts error reporting at Step 0 (script crash) and Step 6 (gh failure)
- [`/version-sdlc`](version-sdlc.md) — Adopts error reporting at Step 0 (script crash) and Step 8 (git failure)
- [`/review-sdlc`](review-sdlc.md) — Adopts error reporting at Step 0 (script crash) and Step 3 (orchestrator failure)
- [`/execute-plan-sdlc`](execute-plan-sdlc.md) — Adopts error reporting in the Escalation Protocol (after 2 retries)
