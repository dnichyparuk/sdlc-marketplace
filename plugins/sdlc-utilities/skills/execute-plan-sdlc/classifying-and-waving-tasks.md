# Classifying Tasks and Building Waves

Reference for the `execute-plan-sdlc` skill — Step 2 (CLASSIFY).

## Complexity Classification Heuristics

| Signal | Complexity |
|---|---|
| Task mentions "rename", "update config", "change value", "add import" | Trivial |
| Task body is < 3 sentences with a single clear action | Trivial |
| Task creates or modifies 1 file with a well-defined output at a single location | Trivial |
| Task edits multiple distinct locations in a single file (e.g., struct + interface + init + getter) | Standard |
| Task creates or modifies 2–4 files with clear outputs | Standard |
| Task implements a feature, writes tests, adds a component | Standard |
| Task involves > 5 files or cross-cutting concerns | Complex |
| Task requires understanding multiple existing modules to implement correctly | Complex |
| Task involves architectural patterns or systemic changes | Complex |

When signals are mixed, round up (prefer higher complexity class).

## Risk Classification Heuristics

| Signal | Risk Level |
|---|---|
| Task touches only test files | Low |
| Task touches only documentation or comments | Low |
| Task creates new internal-only modules with no public surface | Low |
| Task modifies a public API or function signatures called by other modules | Medium |
| Task changes database schemas, migrations, or data models | Medium |
| Task modifies authentication, authorization, or session handling | High |
| Task changes infrastructure (Docker, k8s, CI/CD, deploy scripts) | High |
| Task involves credential management, secrets, or encryption | High |
| Task deletes files or removes existing functionality | High |
| Task touches shared state accessible by multiple services | High |

When signals are mixed, round up (prefer higher risk level).

## Worker routing (agent × effort)

| Complexity | Speed (`--quality full`) | Balanced (default) | Quality (`--quality minimal`) |
|---|---|---|---|
| Trivial (single, in-wave) | execute-worker / low | execute-worker / low | execute-worker / medium |
| Trivial (2+ batched) | execute-worker-batch / medium | execute-worker-batch / medium | execute-worker / medium |
| Standard | execute-worker / low | execute-worker / medium | execute-worker-complex / medium |
| Complex | execute-worker / high | execute-worker-complex / high | execute-worker-complex / high |

Haiku runs only the batched-trivial agent. Raise a task one column (never a tier) when it touches unfamiliar code or needs a judgment between valid approaches. Always dispatch with an agent file (or an explicit `model:`); an omitted model inherits the session model, which may be the most expensive tier. Re-measure this table after each model release.

`scripts/skill/execute.js` holds this table as `WORKER_ROUTING` and emits it per wave as `waves[].dispatch` (with each agent's `model` from `AGENT_MODELS` and the R13 `retries`); SKILL.md dispatches those entries verbatim. This table is documentation: `tests/promptfoo/scripts/check-worker-routing-table.js` fails when it differs from `WORKER_ROUTING`. The "raise a task one column" rule above is applied by SKILL.md Step 2's re-derivation rule, with the reason stated.

## Wave-Building Algorithm

1. **Build a dependency graph (DAG)** where an edge A → B means "task B depends on outputs from task A"
   - Identify explicit file dependencies: task B reads a file that task A creates
   - Identify implicit dependencies: task B modifies a module that task A adds to an index/barrel file

2. **Topological sort** the DAG to establish valid execution order

3. **Assign wave numbers:**
   - Wave 1: all tasks with no dependencies
   - Wave N+1: all tasks whose dependencies are all in waves ≤ N
   - Continue until all tasks are assigned

4. **Apply same-file constraint:** If two tasks in Wave N both modify the same file, move the later one (by plan order) to Wave N+1

5. **Apply adaptive wave size cap** (see table below). If a wave exceeds the cap, split the excess into Wave N+0.5 (insert a new wave between N and N+1)

6. **Apply risk spreading:** If a wave contains > 1 high-risk task, move the excess to the next wave

6a. **Verification-boundary affinity (advisory tiebreaker — Fixes #392 / R34):** when two candidate orderings satisfy all dependency, same-file, wave-size-cap, and risk-spreading constraints equally, prefer the ordering that keeps tasks sharing a verification target (same `Verify:` value AND overlapping `Files:` directory prefixes) in the same wave. **Never sacrifice dependency correctness or any constraint above to honor this — it is a tiebreaker only.** This heuristic helps Step 5c-bis (expectedFiles cross-check) and the spec-compliance reviewer run against a coherent surface per wave.

6b. **Compute per-wave `expectedFiles` (Fixes #392 / R34):** for every wave entry in the manifest, set `expectedFiles: string[]` to the deterministic union of every `Files: Create:` / `Files: Modify:` / `Files: Test:` path declared across the wave's tasks. No LLM inference; the plan-sdlc G10 "File existence" gate guarantees exact paths. Set `verificationHint: string` only when every task in the wave shares the same `Verify:` value (verbatim); otherwise omit the field.

   Example wave manifest entry:

   ```json
   {
     "wave": 2,
     "tasks": [
       { "id": "7", "files": { "modify": ["src/auth/token.ts"], "test": ["src/auth/token.test.ts"] }, "verify": "npm test -- token" },
       { "id": "8", "files": { "modify": ["src/auth/token.ts", "src/auth/index.ts"] }, "verify": "npm test -- token" }
     ],
     "expectedFiles": ["src/auth/token.ts", "src/auth/token.test.ts", "src/auth/index.ts"],
     "verificationHint": "npm test -- token",
     "guardrails": [
       { "id": "no-direct-db-access", "description": "Do not import db client outside repo layer", "severity": "error" }
     ]
   }
   ```

7. **Identify pre-wave trivials:** Trivial tasks that have downstream dependents in Wave 1 should run in the pre-wave. Pre-wave trivials, one or more, are executed inline in the main context, one after another (spec R6).

8. **Identify in-wave trivial batches:** Within each wave, if 2 or more tasks are classified Trivial, dispatch them together as one batch worker (the "Trivial (2+ batched)" row of the routing table). A single trivial task in a wave is dispatched as one worker (the "Trivial (single, in-wave)" row). Same-file ordering rules apply within the batch (the dispatch prompt's `ORDERING` line, SKILL.md Step 5b).

## Adaptive Wave Size Cap

Complex tasks count as 2 toward the cap (they consume more context and are more likely to conflict).

**Wave sizing is computed by `lib/dispatch-budget.js::computeWaveBudget()`** (R-BYTE-BUDGET, #432), not by a static table. The utility accounts for template scaffolding bytes, guardrails block bytes, per-task fact-sheet sizes, and prior-wave context bytes against the model's input budget. The result is always ≤ the static fallback cap:

| Total remaining tasks | Static fallback cap |
|---|---|
| 1–3 | No cap (dispatch all) |
| 4–8 | 4 |
| 9–15 | 5 |
| 16+ | 6 |

The static table is the ceiling. When `computeWaveBudget` returns a lower value (e.g., large fact-sheets push the byte budget below the static cap), use the lower value.

On resource-constrained systems or when tasks share mutable state (databases, caches, singletons), reduce to 2–3 regardless of the table.

## Worker Agents

The worker prompts live in three agent files, dispatched by `subagent_type` (SKILL.md Step 5b):

| Agent | Body |
|---|---|
| `sdlc:execute-worker` | one task (`agents/execute-worker.md`) |
| `sdlc:execute-worker-complex` | one task; the same body as `execute-worker` (`agents/execute-worker-complex.md`) |
| `sdlc:execute-worker-batch` | 2+ trivial tasks, in order (`agents/execute-worker-batch.md`) |

The routing table above picks the agent and the effort. The dispatch prompt carries only per-dispatch values (SKILL.md Step 5b, direct mode; `wave-runner-template.md` §2, runner mode).

## Common Dependency Patterns

These implicit dependencies are easy to miss:

| Scenario | Dependency |
|---|---|
| Task A creates a new module; Task B adds it to an index/barrel file | B depends on A |
| Task A defines a TypeScript type; Task B uses that type | B depends on A |
| Task A creates a database table; Task B seeds or queries it | B depends on A |
| Task A adds a config key; Task B reads that config key | B depends on A |
| Task A adds a route handler; Task B adds middleware that wraps all routes | Depends on order — check the framework's middleware registration semantics |
| Task A writes a test fixture; Task B writes tests that use that fixture | B depends on A |
