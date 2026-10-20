# Skill Best Practices

## Scope

This guide covers **design quality**: what separates a reliable, maintainable skill from a fragile one. It assumes you have already read [Adding Skills](adding-skills.md), which covers the mechanics of creating a skill (directory structure, SKILL.md format, naming conventions, file limits).

---

## 1. Pipeline Structure (PCIDCI)

PCIDCI stands for **Plan → Critique → Improve → Do → Critique → Improve**. It is the mandatory pipeline structure for every skill that produces output for the user. Every step in a skill should be labeled with its role in this cycle.

Label steps with a role in parentheses: `### Step N (ROLE): Description`. Valid roles: `CONSUME`, `LOAD`, `SCAN`, `PLAN`, `CRITIQUE`, `IMPROVE`, `DO`, `VERIFY`, `REPORT`, `RECOVER`.

The dual critique gate is the key structural guarantee: critique the *plan* (pre-execution quality), then critique the *output* (post-execution quality). Not every skill needs all six stages, but every skill producing user-facing output must have at least one critique-improve loop before presenting it.

**Canonical examples:**
- `pr-sdlc` Steps 2–5: PLAN (draft description) → CRITIQUE (9-row gate table) → IMPROVE (fix issues) → DO (present and confirm).
- `execute-plan-sdlc` Steps 2–4 + 7–8: CRITIQUE wave structure before execution, then VERIFY + CRITIQUE after each wave.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Every non-trivial step has a `(ROLE)` label | No unlabeled steps in the workflow |
| At least one CRITIQUE step precedes any user-facing output | Draft is never presented without a review pass |
| A CRITIQUE step exists after execution for externally-visible actions | Output quality is verified, not assumed |

---

## 2. Critique-Improve Loops

A critique-improve loop consists of two parts: a **quality gate table** that defines what to check and what "pass" means, and an **IMPROVE step** that fixes every failing gate. Neither part is optional.

Quality gate tables are not decoration. They are the machine-readable contract for what "good" means at that point in the pipeline. Each gate must be specific and verifiable — not a judgment call.

**Bad quality gate:**
```markdown
| Check | The output looks correct |
```

**Good quality gate (from `pr-sdlc`):**
```markdown
| Title length | Title is 72 characters or fewer |
| No fabrication | All claims traceable to commits or diff — nothing invented |
| No file paths | Changes Overview uses concepts only, no file paths |
```

Separate pre-execution gates (plan quality) from post-execution gates (output quality). These answer different questions and should not share a table.

Cap iterations at 2 per gate. If issues remain after two passes, surface to the user rather than looping indefinitely. See `received-review-sdlc` Steps 5 and 8 for a dual-gate implementation: Step 5 gates the *evaluation* of feedback, Step 8 gates the *drafted response*.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Every CRITIQUE step has a gate table | No prose-only critiques |
| Each gate row specifies a concrete pass criterion | No subjective checks ("looks good", "seems correct") |
| Max iterations are specified | Infinite loop prevention is explicit |

---

## 3. Spending Context Wisely

Once a skill activates, its full `SKILL.md` loads into the agent's context window alongside conversation history, system context, and other active skills. Every token competes for attention. Skills that pad context with things the agent already knows cause the agent to miss what matters.

Add what the agent *wouldn't* know without your skill: project conventions, non-obvious APIs, edge cases, specific tools to use. Omit general knowledge.

**Verbose (cut this):**
```markdown
## Authenticate with GitHub

GitHub is a code hosting platform. To create a pull request, you need to
authenticate. The `gh` CLI tool can be used for this purpose. First, make sure
the user is authenticated by running the auth check command.
```

**Concise (write this):**
```markdown
## Authenticate with GitHub

Check authentication: `gh auth status`. If it fails, stop and tell the user to run `gh auth login`.
```

Keep `SKILL.md` under 500 lines. When a skill legitimately needs more content, move reference material to separate files and use **conditional loading**: "Read `./api-errors.md` if the API returns a non-200 status code" — not a generic "see references/ for details." The agent must know *when* to load each file, or it won't load them at the right time.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Each paragraph answers "would the agent get this wrong without it?" | No general knowledge, no filler |
| Reference files are conditionally loaded | "Read X when Y" — not "see references/" |
| SKILL.md is under 500 lines | Progressive disclosure is in place if needed |

---

## 4. Description as Trigger Spec

The `description` field in SKILL.md frontmatter determines when Claude activates your skill. It is a **trigger specification**, not a summary. Vague descriptions cause false negatives (skill misses relevant invocations) and false positives (skill fires for the wrong task).

Structure the description to:
1. Start with `"Use this skill when..."` or `"Use when..."`
2. List specific trigger situations with action verbs
3. End with `"Triggers on: keyword1, keyword2, ..."`

**Example (`jira-sdlc`):**
> Use this skill when creating, editing, searching, transitioning, commenting on, linking, assigning, or adding worklogs to Jira issues. Triggers on: create jira issue, update ticket, search jira, transition issue, log work, bulk operations.

The keyword list is what Claude uses for activation routing. If users commonly invoke the skill with a phrase you haven't listed, add it.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Starts with "Use this skill when" or "Use when" | Consistent activation format |
| Ends with "Triggers on:" keyword list | Explicit routing keywords present |
| Under 1024 characters | Within system limit |

---

## 5. Calibrating Control

Not every instruction needs the same specificity. Prescribing everything produces rigid skills that fail when context varies. Leaving everything to judgment produces inconsistent output. Match instruction specificity to task fragility.

**Give the agent freedom** when multiple approaches are valid. Explain *why* rather than prescribing *how* — an agent that understands the intent makes better context-dependent decisions.

**Be prescriptive** when operations are fragile, order matters, or consistency is the requirement. Mark exact commands with `> **VERBATIM** — Run this block exactly as written.`

**Provide a default, not a menu.** Pick the right tool and mention alternatives briefly:

**Too many options:**
```markdown
You can use pypdf, pdfplumber, PyMuPDF, or pdf2image for text extraction.
```

**Clear default with escape hatch:**
```markdown
Use pdfplumber for text extraction. For scanned PDFs requiring OCR, use pdf2image with pytesseract instead.
```

The VERBATIM pattern appears in `commit-sdlc`, `pr-sdlc`, `review-sdlc`, and `version-sdlc` for script invocation blocks. The scripts themselves are flexible; the *invocation* is not.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Fragile operations are marked VERBATIM | No ambiguity on exact commands |
| Flexible areas explain why, not just what | Agent can adapt correctly to context |

---

## 6. User Consent Gates

Never execute an externally-visible action — git push, PR creation, API mutations, file writes to the user's project — without explicit user approval via the `AskUserQuestion` tool. Show the full plan or output first, then use `AskUserQuestion` to present the consent prompt. This ensures structured user interaction in VSCode and consistent UX across all skills.

**Standard consent pattern (using AskUserQuestion):**

Use AskUserQuestion to ask:
> [Action-specific question, e.g. "Commit as shown?" or "Create this PR?"]

Options:
- **yes** — execute as shown above
- **edit** — revise and re-present
- **cancel** — stop here

Rules:
- Show the complete output *before* the consent prompt. The user approves what they see.
- The edit loop is unbounded — no limit on revision cycles.
- No default selection. The user types their choice.

`pr-sdlc` Step 5 shows the full PR title and description, then presents this menu. `commit-sdlc` Step 5 shows the staged files, stash status, and complete commit message before prompting. `version-sdlc` Step 5 shows the full release plan table before any git command runs.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| No externally-visible action precedes explicit "yes" | Consent gate covers every side-effect |
| Full output is shown before the consent prompt | User sees exactly what they are approving |
| Edit loop has no iteration cap | Unbounded revision is possible |

---

## 7. Error Recovery

Every skill that runs a script or external tool must have an `## Error Recovery` section. For the template format, see [Adding Skills](adding-skills.md#error-recovery-required). This section covers the design thinking behind it.

**Standard flow:** `DETECT → DIAGNOSE → RECOVER → ESCALATE`

**Error classification:**

| Type | Example | Action |
|---|---|---|
| User error | Wrong file path, auth not configured | Tell the user clearly. Do not report. |
| Transient | Network timeout, rate limit | Retry once. Escalate if it fails again. |
| Stale data | API rejects cached metadata | Rebuild cache, retry once. |
| System failure | Script crash (exit 2), 5xx after retry | Invoke `error-report-sdlc`. |

Invoke `error-report-sdlc` for persistent, actionable failures — script crashes and external service errors after retry. Do not invoke it for user errors (wrong input, tool not installed, missing auth). `jira-sdlc` demonstrates the stale-data pattern: when an API call fails due to stale cache, the skill rebuilds the cache and retries once before escalating.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| All failure classes are covered (user, transient, system) | No unhandled error paths |
| Each row has a specific recovery action | No "handle appropriately" entries |
| `error-report-sdlc` column is explicit for every row | Classification is not left to inference |

---

## 8. Complexity Routing

Not every invocation warrants the full pipeline. Routing by complexity makes trivial work fast and reserves the full PCIDCI cycle for tasks that need it. The routing decision must be explicit — a table or decision block in the skill — not buried in prose.

**Canonical routing table (`plan-sdlc` Step 0):**

| Scope | Action |
|---|---|
| 1 file, obvious change | Skip. Tell the user: "This doesn't need a plan." |
| 2–3 files, clear scope | Lightweight pipeline — skip exploration and review loop |
| 4+ files or unclear scope | Full PCIDCI pipeline |
| Multiple independent subsystems | Decompose into separate plans first |

Add a routing step near the top of any skill where invocation complexity varies significantly. Without it, the skill applies the same overhead to trivial and complex tasks alike.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Routing is a visible table or decision block | Not hidden in prose |
| Trivial path skips unnecessary steps | Simple work completes quickly |

---

## 9. Supporting Files and Cross-Skill References

When a skill needs a format spec, prompt template, or reference checklist, place it alongside `SKILL.md` in the skill directory and reference it with a relative path. Do not inline long reference content into `SKILL.md`.

```
skills/plan-sdlc/
  SKILL.md
  plan-format-reference.md      ← format spec for plan documents
  plan-reviewer-prompt.md       ← subagent prompt template for plan review
```

Reference in `SKILL.md`: `See ./plan-format-reference.md for the exact format specification.`

**See Also section:** Every skill ends with a `## See Also` section listing related skills, using relative paths:
```markdown
## See Also

- [`/commit-sdlc`](../commit-sdlc/SKILL.md) — commit changes before creating a PR
- [`/pr-sdlc`](../pr-sdlc/SKILL.md) — create the pull request
```

**What's Next:** After completing its task, a skill should show available follow-up skills as a passive hint — no prompt, no waiting, no `Select:`. The skill ends immediately after displaying the hint. The user invokes the next skill on their own terms.

```
## What's Next

After completing the commit, common follow-ups include:
- `/pr-sdlc` — create a pull request
- `/version-sdlc` — tag a release
```

No `Select:` prompt. No AskUserQuestion. No Skill tool invocation. Just a signpost, then the skill ends.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Long reference content is in separate files, not inlined | SKILL.md stays focused |
| See Also links use relative paths to SKILL.md files | Links work from the skill directory |
| What's Next section lists follow-up skills without prompting | User knows options without being forced to choose |

---

## 10. Gotchas, DO NOT, and Learning Capture

**Gotchas** are the highest-value content in many skills. They capture concrete failure modes the agent will hit without being told — not general advice, but specific corrections to specific mistakes.

Each gotcha entry: name the failure (bold), describe the symptom, explain the root cause, state the mitigation.

**Bad gotcha:**
```markdown
Be careful with large files.
```

**Good gotcha (from `pr-sdlc`):**
```markdown
**Large diff output.** `pr-prepare.js` embeds the full diff inline in its JSON output.
For repos with many changed files, this easily exceeds 100KB — too large to pipe through
a shell command without truncation. The failure manifests as "Unterminated string in JSON
at position N". Write script output to a temp file with `mktemp`, never pipe directly.
```

When the agent makes a mistake during real execution, add the correction to the gotchas section. This is the most direct way to improve a skill iteratively.

**DO NOT sections** list explicit prohibitions. Write them as imperatives, not suggestions:

```markdown
## DO NOT

- Skip the critique step, even when the task seems simple
- Present output to the user before the CRITIQUE step runs
- Invoke `error-report-sdlc` for user errors (wrong input, missing auth)
```

"Consider avoiding" is not a prohibition. "Do NOT" is.

**Learning Capture:** Every skill should end by appending discoveries to `.sdlc/learnings/log.md`. Only capture genuinely new information — project conventions not covered by the skill, edge cases encountered, patterns that required adjustment. Not a summary of what the skill did.

```markdown
## Learning Capture

After completing [action], append to `.sdlc/learnings/log.md`:

- Project-specific conventions not covered by this skill
- Edge cases the skill didn't handle that required manual adjustment

Format:
## YYYY-MM-DD — <skill-name>: <summary>
<what was learned>
```

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Each gotcha includes symptom, cause, and mitigation | Not vague warnings |
| DO NOT items use imperative voice | "Do NOT" — not "consider avoiding" |
| Learning Capture captures specific triggers | Not "log interesting things" |

---

## 11. Refine with Real Execution

The first draft of a skill almost always needs refinement. After writing a skill, run it against real tasks and feed results back into the skill — including successes, not just failures.

Read execution traces, not just final outputs. Common problems visible only in traces:

- Instructions too vague: the agent tries several approaches before finding one that works
- Instructions that don't apply to the current task: the agent follows them anyway
- Too many options with no clear default: the agent picks arbitrarily

Each pass of execute-then-revise noticeably improves quality. Complex domains benefit from several passes. Corrections from execution traces go into the [Gotchas](#10-gotchas-do-not-and-learning-capture) section — that is how the skill accumulates operational knowledge.

**Critique checkpoint:**

| Check | Pass criteria |
|---|---|
| Skill has been run against at least one real task | Not purely theoretical |
| Execution trace reviewed, not just final output | Inefficiencies visible in trace are addressed |

---

## Harness Integration Patterns

### Plan Mode Adaptation

Skills that perform write operations must not break when invoked in plan mode. The harness enforces read-only constraints — if your skill tries to write files, run git commands, or call external APIs, it will fail confusingly.

**Graceful refusal pattern** (add before the first workflow step in any skill that mutates state):

```markdown
## Step 0 — Plan Mode Check

If the system context contains "Plan mode is active":

1. Announce: "This skill requires write operations. Exit plan mode first, then re-invoke `/skill-name`."
2. Stop. Do not proceed to subsequent steps.
```

**Which skills need this:**
- Skills that run `git commit`, `git tag`, `git push` — always
- Skills that create/update PRs or issues via `gh` CLI — always
- Skills that write/edit project files as their primary action — always
- Read-only analysis skills (review, plan) — no

**Exception:** `plan-sdlc` is designed for plan mode and calls `ExitPlanMode` when done. Don't add the refusal pattern to it.

**Canonical examples:** `commit-sdlc`, `pr-sdlc`, `version-sdlc`, `execute-plan-sdlc`, `received-review-sdlc` all implement this pattern.

### Discoverability with `argument-hint`

The `argument-hint` frontmatter field shows in the `/` autocomplete menu. Users see the hint before invoking the skill, which eliminates the need to check docs for common flags.

**Guidelines:**
- Show 2–4 most commonly used flags, not every option
- Use `[--flag]` for optional, `<value>` for required
- This is display-only — your skill must still parse and validate arguments from the user's input

**Canonical examples:** `commit-sdlc` uses `"[--no-stash] [--scope <scope>]"`, `version-sdlc` uses `"[major|minor|patch] [--changelog]"`.

### Preventing Auto-Triggering with `disable-model-invocation`

Claude auto-loads skills when conversation content matches the skill's description. For internal skills dispatched only by other skills, this causes false activations.

Set `disable-model-invocation: true` alongside `user-invocable: false` to fully lock down an internal skill. The `user-invocable: false` flag alone only hides the skill from the `/` menu — it does NOT prevent auto-triggering.

**Canonical example:** `error-report-sdlc` uses both flags to ensure it only fires when another skill's error handler explicitly dispatches it.

### Context Isolation via Agent Dispatch

Skills may run in a forked context via `context: fork` + `agent:` frontmatter; the plugin uses per-step agent files for ship so model, effort and tools are declared, not narrated. To achieve context isolation (protecting the main conversation from intermediate output), use the `Agent` tool dispatch pattern in the skill body:

1. Skill gathers user input and runs prepare scripts in the main context
2. Skill dispatches a subagent via the `Agent` tool with the heavy computation
3. Subagent returns a clean summary
4. Skill handles interactive follow-up (consent gates, post actions) in the main context

This split-phase pattern keeps the main context clean while preserving user interaction where needed.

**Canonical example:** `review-sdlc` dispatches the `review-orchestrator` agent for parallel dimension review, then handles comment posting and self-fix offers in the main context.

### Why frontmatter `model:` is the wrong context-isolation knob

Pinning `model:` (e.g., `model: haiku`) in skill frontmatter does **not** create a fresh context. The harness routes the skill into a subagent that inherits the entire parent conversation transcript. On long sessions this overflows the smaller-window models and the skill aborts with `Context limit reached` (issue #202).

Use the in-body `Agent` dispatch pattern instead: write the skill body to run in the main parent-model context, have it generate a minimal payload (typically via a prepare script using `lib/output.js writeOutput()` and `--output-file`), and dispatch a dedicated orchestrator agent with a two-line prompt — `MANIFEST_FILE: <path>` and `PROJECT_ROOT: <cwd>`. Pin `model: haiku` (or whichever cheaper model fits) on the **orchestrator agent** under `plugins/sdlc-utilities/agents/`, where the input is bounded to the manifest, not on the skill, where the input is the unbounded conversation.

**Canonical pairs:**

- `review-sdlc` → `review-orchestrator`
- `commit-sdlc` → `commit-orchestrator`
- `error-report-sdlc` → `error-report-orchestrator`
