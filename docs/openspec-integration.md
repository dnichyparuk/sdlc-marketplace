# OpenSpec Integration

## Overview

The sdlc-utilities plugin detects and consumes [OpenSpec](https://github.com/Fission-AI/OpenSpec/) artifacts when present in a project. OpenSpec owns the specification workflow (proposing changes, writing delta specs, designing solutions); SDLC skills own the implementation workflow (planning, executing, reviewing, committing, and creating PRs). SDLC skills read OpenSpec artifacts. Only ship-sdlc writes to `openspec/`: its opt-in `verify-openspec` step runs `openspec validate --strict`, and its `archive-openspec` step archives the change and commits it.

---

## Prerequisites

| Requirement | Install | Notes |
| --- | --- | --- |
| OpenSpec CLI | `npm install -g @fission-ai/openspec@latest` | Requires Node.js 20.19.0+ |
| Project initialized | `openspec init` | Creates `openspec/` directory with `config.yaml` |
| sdlc-utilities plugin | `/plugin install sdlc@sdlc-marketplace` | See [Getting Started](getting-started.md) |

---

## How Detection Works

Every skill that supports OpenSpec runs the same lightweight detection:

1. **Glob** for `openspec/config.yaml` — if absent, skip OpenSpec integration entirely (zero overhead).
2. **Glob** `openspec/changes/*/proposal.md` (excluding `archive/`) — find active changes.
3. **Resolve** the active change:
   - If exactly one exists → use it.
   - If multiple exist → match against the current git branch name.
   - If ambiguous → ask the user (`plan-sdlc`) or silently skip (`pr-sdlc`, `commit-sdlc`).

When `openspec/` is absent, all skills behave identically to their non-OpenSpec behavior. Detection adds one failing Glob call (~milliseconds) — no measurable overhead.

### Detection vs Loading

Detection (Tier 1) is always on — one Glob for `config.yaml`, zero file reads, negligible cost. Loading (Tier 2) varies by skill. Enrichment-only skills (`pr-sdlc`, `commit-sdlc`) auto-load when a unique active change is detected — they read a small number of artifacts to improve output quality without changing workflow. Workflow-altering skills (`plan-sdlc`) remain opt-in via `--spec` or an explicit spec path, because loading there triggers a different planning workflow, not just enrichment.

---

## End-to-End Workflow

```text
    OpenSpec                                        SDLC Skills
    ────────                                        ───────────

 1. /opsx:propose "add user notifications"
    └─► openspec/changes/add-user-notifications/
        ├── proposal.md
        └── specs/

 2. /opsx:continue
    └─► openspec/changes/add-user-notifications/
        ├── proposal.md
        ├── specs/*.md  (delta specs)
        ├── design.md
        └── tasks.md
                │
                │  ── artifacts flow ──►
                │
                ▼
                                             3. /plan-sdlc
                                                reads proposal.md, specs/*.md,
                                                design.md, tasks.md
                                                └─► implementation plan

                                             4. /execute-plan-sdlc
                                                wave-based parallel dispatch
                                                + spec compliance checks
                                                └─► implemented code

                                             5. /review-sdlc
                                                /commit-sdlc
                                                /pr-sdlc
                                                └─► reviewed, committed, PR created
                │
                │  ◄── verify ──
                │
                ▼
 6. /opsx:verify
    └─► validates implementation completeness

 7. /opsx:archive
    └─► merges delta specs into main specs/
```

### Step 1: Propose a Change (OpenSpec)

```text
/opsx:propose "add user notifications"
```

OpenSpec creates `openspec/changes/add-user-notifications/` with `proposal.md` capturing intent, scope, and capabilities.

### Step 2: Develop the Spec (OpenSpec)

```text
/opsx:continue
```

Work through delta specs (`specs/*.md`) with ADDED/MODIFIED/REMOVED sections, then `design.md` for technical approach, then `tasks.md` for a high-level task checklist.

### Step 3: Create Implementation Plan (SDLC)

```text
/plan-sdlc --spec
# or with explicit path (implicitly enables spec loading):
# /plan-sdlc openspec/changes/add-user-notifications/
```

plan-sdlc reads all OpenSpec artifacts:

- `proposal.md` → goal and scope
- `specs/*.md` → authoritative requirements (every ADDED/MODIFIED entry becomes at least one task)
- `design.md` → architecture constraints and key decisions
- `tasks.md` → coarse decomposition reference (further decomposed into plan-sdlc's finer-grained tasks)

Produces an implementation plan with the `**Source:**` header pointing to the OpenSpec change.

### Step 4: Execute the Plan (SDLC)

```text
/execute-plan-sdlc
```

Executes the plan with wave-based parallel dispatch. When the plan's Source points to an OpenSpec change, the spec compliance reviewer additionally checks implementations against the delta spec requirements — not just the task acceptance criteria. After all waves complete, a final holistic spec completeness check (Step 8-bis) verifies that the union of all implementations covers every delta spec requirement. On completion, suggests `/opsx:verify` and `/opsx:archive` as next steps.

### Step 5: Review, Commit, and PR (SDLC)

```text
/review-sdlc          # with spec-compliance-review dimension if installed
/commit-sdlc          # scope hint + OpenSpec-Change trailer from change name
/pr-sdlc              # auto-detects OpenSpec, pre-fills Business Context from proposal.md
```

### Step 6: Verify and Archive (OpenSpec)

```text
/opsx:verify          # validates implementation completeness
/opsx:archive         # merges delta specs into main specs/
```

Or let `/ship-sdlc` do it: add `verify-openspec` and `archive-openspec` to `ship.steps` (see [ship-sdlc](skills/ship-sdlc.md)).

---

## Per-Skill Behavior

| Skill | Without OpenSpec | With OpenSpec |
| --- | --- | --- |
| `/plan-sdlc` | Asks for requirements via conversation | Detects presence via `plan-prepare.js` (uses shared `lib/openspec.js`). With `--from-openspec <name>`: validates change, loads all artifacts, uses `tasks.md` as primary skeleton, bypasses gate check. For functional changes without `--spec` or `--from-openspec`, proposes starting the OpenSpec flow. For non-functional changes, prints a passive hint. With `--spec` or matching active change: reads proposal, delta specs, design, and tasks |
| `/execute-plan-sdlc` | Spec compliance checks task acceptance criteria only | Additionally checks implementations against delta spec requirements (per-wave in Step 5c-bis, holistic in Step 8-bis). Suggests `/opsx:verify` and `/opsx:archive` after completion |
| `/pr-sdlc` | Asks user for Business Context/Benefits | Auto-detects active change and pre-fills Business Context/Benefits from `proposal.md` intent and scope. Suggests `/opsx:verify` and `/opsx:archive` in What's Next after merge. Silently skips if ambiguous |
| `/commit-sdlc` | Infers scope from changed files | Uses change directory name as scope candidate. Adds `OpenSpec-Change` trailer to commit body when active change detected |
| `/setup-sdlc --dimensions` | Proposes dimensions based on tech stack | Additionally proposes `spec-compliance-review` dimension |
| `/review-sdlc` | Reviews against installed dimensions | No change (spec awareness comes from the dimension) |
| `/version-sdlc` | No change | No change |
| `/jira-sdlc` | No change | No change |
| `/received-review-sdlc` | No change | No change |
| `/setup-sdlc --pr-template` | Creates PR template from conventions | No change |

---

## Alternative Execution Path: /opsx:apply vs /execute-plan-sdlc

OpenSpec provides its own execution command (`/opsx:apply`) that works through `tasks.md` checkboxes. The SDLC plugin's `/execute-plan-sdlc` is a more sophisticated alternative with:

- Wave-based parallel agent dispatch
- Per-task complexity classification and model assignment
- Automatic spec compliance review
- Error recovery with model escalation

**When to use which:**

- Use `/opsx:apply` for simple changes where the OpenSpec task checklist is sufficient.
- Use `/plan-sdlc` + `/execute-plan-sdlc` for complex changes that benefit from finer-grained task decomposition, parallel execution, and automated verification.

Both paths are valid — the choice depends on the complexity of the change.

For stage-aware handoff protocol — which command to use at each OpenSpec stage — see [OpenSpec → SDLC Handover Workflow: Stage-Aware Handoff](openspec-sdlc-handover.md#stage-aware-handoff).

---

## Proposed Workflows

Choose the workflow that matches your situation:

### 1. Spec-First (recommended for non-trivial features)

Start with `/opsx:propose "description"` to create a proposal, then `/opsx:continue` to develop delta specs and a design document. Once specs are ready, run `/plan-sdlc --spec` to create an implementation plan from the spec artifacts, then `/execute-plan-sdlc` to implement. Finish with `/review-sdlc`, `/commit-sdlc`, `/pr-sdlc`, and close the loop with `/opsx:verify` and `/opsx:archive`. Best for features where requirements benefit from structured specification before implementation begins.

### 2. Plan-First with Spec Prompt

Start with `/plan-sdlc` and describe the change in conversation. If the skill detects a functional change and OpenSpec is present, it proposes switching to the spec-first flow — you choose whether to start `/opsx:propose`, continue planning directly, or load an existing spec. Best for moderate changes where you want the option of spec rigor without committing upfront.

### 3. Direct Planning (non-functional changes)

Start with `/plan-sdlc` for refactoring, config updates, documentation, or CI/CD changes. The skill detects the non-functional scope and shows a passive hint about OpenSpec without interrupting. Proceed with standard planning — OpenSpec adds no value for these changes.

### 4. Existing Spec, New Session

Run `/plan-sdlc --spec` or `/plan-sdlc openspec/changes/<name>/` when OpenSpec artifacts already exist from a previous session or were written by a teammate. The skill loads the proposal, delta specs, design, and tasks as authoritative requirements. Best when spec work was done earlier and you're picking up at the implementation stage.

---

## Adding a Spec-Compliance Review Dimension

When OpenSpec is detected, `/setup-sdlc --dimensions` proposes a `spec-compliance-review` dimension. To install it:

```text
/setup-sdlc --dimensions
```

Select `spec-compliance-review` from the proposed dimensions. The dimension verifies:

- Every ADDED requirement in delta specs has corresponding implementation.
- Every MODIFIED requirement's changes are reflected in code.
- No REMOVED requirements still have active code paths.

After installation, `/review-sdlc` automatically includes spec compliance in its multi-dimension review.

---

## Troubleshooting

### Multiple active OpenSpec changes

If you have multiple changes in `openspec/changes/` (excluding archive), skills try to match against your current git branch name. If no match is found:

- `plan-sdlc` asks you to select the active change.
- `pr-sdlc` and `commit-sdlc` silently skip OpenSpec enrichment (PR/commit creation should not be blocked by detection ambiguity).

**Fix:** Name your git branch to match the OpenSpec change directory (e.g., branch `add-user-notifications` for change `openspec/changes/add-user-notifications/`).

### Missing OpenSpec artifacts

If `design.md` or `tasks.md` don't exist yet in the change directory, skills skip them gracefully. Only `proposal.md` and at least one delta spec in `specs/` are needed for meaningful integration.

### OpenSpec not detected despite being installed

Check that `openspec/config.yaml` exists in your project root. If you've customized the OpenSpec directory location, the detection won't find it — it only checks the default path.

---

## Design Principles

1. **Read-only by default** — SDLC skills do not write to `openspec/`; ship-sdlc's `archive-openspec` step is the one writer.
2. **Graceful degradation** — Every OpenSpec-aware code path has a "skip if absent" guard. No skill breaks without OpenSpec.
3. **Minimal CLI coupling** — only ship-sdlc's `verify-openspec` and `archive-openspec` steps call the `openspec` CLI, through `scripts/skill/openspec-step.js`; other skills read the markdown directly.
4. **Script-based detection** — detection runs in `scripts/lib/openspec.js` and `scripts/skill/openspec-step.js`; there is no OpenSpec session-start hook.
5. **Proportional context loading** — Enrichment-only skills (`pr-sdlc`, `commit-sdlc`) auto-load artifacts when a unique active change is detected — they read 1–2 files to improve output quality. Workflow-altering skills (`plan-sdlc`) remain opt-in via `--spec`, because loading there changes the planning workflow. When no active change can be uniquely identified, all skills silently skip — no context bloat on unrelated tasks.
