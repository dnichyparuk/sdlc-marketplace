# Step-Emitter Architecture

## Overview

The step-emitter pattern inverts control between SDLC skill scripts and the LLM. Instead of running once and returning flat JSON for the LLM to interpret, scripts become workflow controllers that emit one step at a time. The LLM executes each step using domain knowledge (critique, content generation, user interaction), then calls the script again with the result. The script decides what happens next.

**Principle:** Scripts do sequencing. The LLM does judgment.

## Universal Protocol

Every step-emitter script speaks a two-call protocol.

### Initial Call

```bash
node skill.js [--flags ...]
```

Returns the first step to execute.

### Subsequent Calls

```bash
node skill.js --after <step_id> --result-file <path> --state <state_file>
```

The LLM passes back the step it just executed (`--after`), the result of that execution (`--result-file` pointing to a JSON file, or `--result` with inline JSON), and the state file path (`--state`). The script reads the result, updates its internal state, and returns the next step.

## Universal Output Envelope

Every script invocation returns this structure:

```json
{
  "status": "step | done | error",
  "step": {
    "id": "unique_step_identifier",
    "action": "Human-readable instruction for the LLM",
    "tool_hints": ["Agent", "Bash", "AskUserQuestion"],
    "data": {}
  },
  "llm_decision": null,
  "state_file": "/tmp/skill-abc123.json",
  "progress": { "completed": 2, "total": 7 },
  "ext": {}
}
```

| Field | Purpose |
|---|---|
| `status` | `"step"` = do this next, `"done"` = workflow complete, `"error"` = unrecoverable |
| `step.id` | Unique identifier passed back via `--after` |
| `step.action` | What the LLM should do — human-readable, not a command |
| `step.tool_hints` | Which tools the LLM will likely need (guidance, not enforcement) |
| `step.data` | All pre-computed data for this step (diffs, file lists, classifications) |
| `llm_decision` | If non-null, the LLM must make a judgment call or ask the user. Result goes back via `--result` |
| `state_file` | Path to accumulated state — the LLM passes it back, never reads or modifies it directly |
| `progress` | Step counter for progress reporting |
| `ext` | Skill-specific extension fields (review dimensions, wave structure, pipeline table, etc.) |

### Result Envelope (LLM to Script)

When calling `--after`, the LLM passes back:

```json
{
  "step_id": "echoes the step.id that was executed",
  "success": true,
  "output": {},
  "error": null
}
```

The `output` field is skill-step-specific. Examples:
- After `generate_message`: `{ "message": "feat: add widget parser" }`
- After `run_review`: `{ "verdict": "APPROVED_WITH_NOTES", "notes": [...] }`
- After `execute_wave_1`: `{ "T1": "done", "T2": "failed", "T2_error": "..." }`

### State File

Owned entirely by the script. The LLM never reads or modifies it — just passes the path. Structure:

```json
{
  "skill": "skill-name",
  "started_at": "2026-04-04T10:00:00Z",
  "current_step": "step_id",
  "history": [
    { "step": "classify", "result": "success", "data": {}, "timestamp": "..." }
  ],
  "ext": {}
}
```

## Writing a Step-Emitter Script

### Using `lib/stepper.js`

All step-emitter scripts use the shared `lib/stepper.js` module:

```javascript
const path = require('node:path');
const LIB = path.join(__dirname, '..', 'lib');
const {
  parseArgs,
  createEnvelope,
  initState,
  transition,
  readState,
  writeState,
  cleanupState,
} = require(path.join(LIB, 'stepper'));
```

### Script Structure

```javascript
const { after, result, stateFile, rest } = parseArgs();

if (!after) {
  // Initial call — compute first step
  const { state, stateFile: sf } = initState('my-skill');
  // ... compute step data ...
  console.log(JSON.stringify(createEnvelope('step', {
    id: 'first_step',
    action: 'Do something',
    tool_hints: ['Edit'],
    data: { /* pre-computed */ },
  }, { stateFile: sf, progress: { completed: 0, total: 3 } })));
  return;
}

// Subsequent call — route based on completed step
const state = transition(stateFile, after, result, 'next_step_id');

switch (after) {
  case 'first_step':
    console.log(JSON.stringify(createEnvelope('step', {
      id: 'second_step',
      action: 'Do the next thing',
      data: { /* uses result.output from first_step */ },
    }, { stateFile, progress: { completed: 1, total: 3 } })));
    break;

  case 'second_step':
    cleanupState(stateFile);
    console.log(JSON.stringify(createEnvelope('done', null, {
      ext: { summary: { /* final results */ } },
    })));
    break;
}
```

### Defining Step Transitions

Document all valid transitions as a map in the script header:

```javascript
// Transition map:
//   init → generate_message → confirm_and_commit → done
//   init → generate_message → confirm_and_commit (cancel) → done (aborted)
//   Any step (error) → error
```

Every step.id must have a handler in the switch statement. Unrecognized step IDs should return an error envelope.

### Handling Errors

Return an error envelope when the script cannot continue:

```javascript
console.log(JSON.stringify(createEnvelope('error', null, {
  error: 'Descriptive error message',
  stateFile, // preserve state for debugging
})));
```

### LLM Decisions

When the script needs the LLM to make a judgment call or ask the user:

```javascript
console.log(JSON.stringify(createEnvelope('step', {
  id: 'confirm_action',
  action: 'Present options to user and get approval',
  data: { options: ['yes', 'edit', 'cancel'] },
}, {
  llmDecision: {
    question: 'Approve this action?',
    options: ['yes', 'edit', 'cancel'],
    default: 'yes',
  },
  stateFile,
  progress: { completed: 1, total: 3 },
})));
```

When `llm_decision` is non-null, the LLM must resolve it before proceeding. When null, the LLM executes the step without asking.

## SKILL.md Executor Pattern

A step-emitter SKILL.md contains an execution loop and domain-specific sections keyed by `step.id`.

### Execution Loop

```markdown
## Execution Loop

1. Run prepare script: `node $SCRIPT $ARGUMENTS`
2. Read output JSON
3. While output.status == "step":
   a. If output.llm_decision is non-null, apply domain knowledge or ask user
   b. Execute output.step using domain instructions (see sections below)
   c. Capture result as { step_id, success, output, error }
   d. Call: node $SCRIPT --after <step.id> --result-file <path> --state <state_file>
   e. Read new output
4. If output.status == "done", present ext.summary
5. If output.status == "error", present error and stop
```

### Domain Instruction Sections

Below the loop, SKILL.md contains sections keyed by step.id:

```markdown
### When step.id == "critique_wave"
Apply these quality criteria: [quality gate table]

### When step.id == "generate_commit_message"
Follow conventional commits format, match recent history style...

### When step.id == "present_review"
Format findings by dimension, severity-sort, include file:line references...
```

The script controls WHAT happens WHEN. SKILL.md controls HOW the LLM does its part.

## State Management

### What Goes in State

- `skill` — skill name (immutable after init)
- `started_at` — ISO timestamp (immutable after init)
- `current_step` — the step about to be executed
- `history` — append-only log of completed steps and their results
- `ext` — skill-specific accumulated data (e.g., review findings, wave results)

### What Goes in `ext` (Envelope)

Per-step extension data that the LLM needs for the current response but does not need to persist across steps. Examples: review dimension scores, pipeline stage table, diff statistics.

### State File Lifecycle

1. **Created** on first invocation via `initState(skill)`
2. **Updated** after each step via `transition()` or `writeState()`
3. **Cleaned up** when status is `"done"` via `cleanupState()`
4. **Preserved** on error for debugging or resume

## Testing

### Script Execution Tests (`promptfooconfig-exec.yaml`)

Test step transitions as deterministic functions. Each test case invokes the script with specific inputs and asserts on the output envelope:

```yaml
- description: "skill stepper: init returns first step"
  vars:
    script_path: "plugins/sdlc-utilities/scripts/skill/example.js"
    script_args: ""
    fixture_dir: "fixtures-fs/example-basic"
  assert:
    - type: javascript
      value: "output.status === 'step' && output.step.id === 'first_step'"
    - type: javascript
      value: "output.progress.total >= 2"
```

**What to cover per skill:**
- Every step transition (step A to step B given result X)
- Conditional branching (different results lead to different next steps)
- Error and recovery paths
- State file creation, accumulation, and cleanup
- Envelope schema compliance (universal base fields always present)

### Behavioral Tests (`promptfooconfig.yaml`)

Test the LLM's execution of the step loop:

```yaml
- description: "skill: executes step-emitter loop correctly"
  vars:
    skill_path: "plugins/sdlc-utilities/skills/example/SKILL.md"
    project_context: "file://fixtures/example-stepper-context.md"
    user_request: "/example"
  assert:
    - type: llm-rubric
      value: "The assistant ran the prepare script, read the step envelope, executed the step action, then called the script again with --after and --result flags"
```

## Migration Guide

To convert an existing one-shot prepare script to step-emitter:

1. **Map the workflow** — identify every decision point in the current SKILL.md where the LLM makes a sequencing choice (not a judgment call). These become step boundaries.

2. **Define the transition map** — document all step transitions including error and conditional branches.

3. **Implement the script** — use `lib/stepper.js`. The initial call computes what the old script returned in one shot. Subsequent calls read the prior result and compute the next step.

4. **Update SKILL.md** — replace the linear workflow with the execution loop template. Move domain-specific instructions into `When step.id == "..."` sections.

5. **Update the spec** — add P-STEP, P-TRANS, and C-STEP requirements (see spec template below).

6. **Write tests** — add exec test cases for every step transition. Update behavioral tests to assert on the step-emitter loop pattern.

### Spec Field Templates

Add to the skill spec as a `### Step-emitter contract` sub-section of `## Step composition` (see `docs/spec-template.md`):

```markdown
### Step-emitter contract

P-STEP-1: Script returns universal envelope with `status`, `step`, `llm_decision`,
          `state_file`, `progress`, and `ext` fields on every invocation.

P-STEP-2: Script accepts `--after <step_id> --result-file <path> --state <state_file>`
          for subsequent invocations after the initial call.

P-STEP-3: State file is created on first invocation, updated after each step,
          and cleaned up when status is "done".

P-TRANS-1: Step transition map (skill-specific):
           init -> step_a -> step_b -> done
           (with error branches documented)

P-TRANS-2: Every step.id in the transition map has a corresponding
           "When step.id == X" section in SKILL.md.

C-STEP-1: The LLM MUST NOT skip steps or reorder the sequence.
          The script controls progression.

C-STEP-2: The LLM MUST NOT read or modify the state file directly.
          It passes the path back to the script via --state.

C-STEP-3: When llm_decision is null, the LLM executes the step
          without asking the user or making judgment calls.

C-STEP-4: When llm_decision is non-null, the LLM MUST resolve it
          (via domain knowledge or user interaction) before proceeding.
```

## What Changes vs What Stays

| Aspect | Before (One-Shot) | After (Step-Emitter) |
|---|---|---|
| Script invocation | Once (prepare phase) | Multiple (per step) |
| Workflow sequencing | LLM follows SKILL.md | Script emits next step |
| Conditional logic | LLM interprets conditions | Script evaluates deterministically |
| State management | LLM tracks in context | Script persists to file |
| SKILL.md content | Full workflow + domain knowledge | Domain knowledge only (keyed by step.id) |
| Output format | Per-skill flat JSON | Universal envelope + ext |
| Error recovery | LLM decides strategy | Script computes (model escalation, retry budget) |
| Shared utilities | `lib/output.js` (write helper) | `lib/stepper.js` (full step lifecycle) |
