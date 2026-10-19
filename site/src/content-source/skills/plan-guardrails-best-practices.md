# Plan Guardrails — Authoring Best Practices

## Overview

Plan guardrails are natural-language rules evaluated by `plan-sdlc` at the Step 3 critique gate. They are configured under `plan.guardrails` in `.sdlc/config.json`. Each guardrail's `description` field is evaluated by the critique LLM against the plan text — if the plan violates the rule, the gate blocks (`error`) or warns (`warning`) before execution begins.

---

## Anatomy of an evaluable guardrail

Three properties separate a guardrail that produces signal from one that produces noise:

- **Specific** — names concrete files, paths, or behaviors. "Do not modify `src/auth/`" is evaluable. "Write good code" is not.
- **Testable against plan text** — the critique LLM reads the plan document, not the runtime. It cannot evaluate test results, performance numbers, or future behavior — only what the plan explicitly says.
- **Severity-justified** — `error` reserves for outcomes that are wrong regardless of context. `warning` is for conventions where exceptions are legitimate.

---

## Severity selection rubric

| Severity | When to use | Effect |
|---|---|---|
| `error` | Violating this guardrail causes a bad outcome regardless of context — wrong scope, wrong files, missing safety step. | Blocks the plan; user must override or fix before execution. |
| `warning` | Important convention, but exceptions legitimately exist (style preferences, soft norms). | Advisory only; plan proceeds. |

Default when `severity` is absent: `error`.

---

## Worked scenarios — bad vs good

### A. "Don't touch auth code in unrelated tasks"

**Bad:** `"Avoid auth changes"` — vague; the LLM cannot determine what "avoid" means or which files constitute "auth".

**Good:**

```json
{
  "id": "auth-scope-guard",
  "description": "Plan must not modify files under src/auth/ unless the user request explicitly references authentication",
  "severity": "error"
}
```

### B. "Migration tasks should not add new features"

**Bad:** `"Keep migrations clean"` — no file anchor, no behavioral constraint the plan text can be evaluated against.

**Good:**

```json
{
  "id": "migration-no-new-api",
  "description": "If the plan title mentions migration or refactor, no new public API surface (new exported functions, new endpoints) may be introduced",
  "severity": "error"
}
```

### C. "DB schema changes need an explicit rollback step"

**Bad:** `"Be careful with schema changes"` — not evaluable; "careful" has no definition in plan text.

**Good:**

```json
{
  "id": "schema-rollback-required",
  "description": "Any plan task touching prisma/schema.prisma or *.sql must include a rollback or down-migration sub-task",
  "severity": "warning"
}
```

### D. "Stay within the requested package"

**Bad:** `"Don't change unrelated packages"` — "unrelated" requires runtime inference; the critique gate only sees the plan document.

**Good:**

```json
{
  "id": "package-scope-guard",
  "description": "Plan must not modify files outside the package directory named in the original user request",
  "severity": "error"
}
```

---

## Anti-patterns

**Process guardrails** — rules like `"write good code"` or `"follow best practices"` give the critique LLM no plan-text signal to evaluate. Every plan trivially satisfies them; they produce no blocking behavior and no useful signal.

**Tautologies** — `"plan should implement what was asked"` is always true by definition. It will never block a plan, so it serves no purpose in the guardrail list.

**Unverifiable-from-plan** — guardrails about runtime behavior, test outcomes, or performance numbers cannot be evaluated at plan-critique time. The plan document does not contain that information. Example of what not to write: `"Implementation must not regress p95 latency above 200ms"`. The critique gate cannot evaluate this; it will either always pass or always fail depending on how the LLM interprets the ambiguity.

---

## See Also

- [`plan-sdlc.md`](plan-sdlc.md) — the skill that evaluates these guardrails at the Step 3 critique gate
- [`execute-guardrails-best-practices.md`](execute-guardrails-best-practices.md) — the sibling concept for execution-time guardrails (`execute.guardrails` in `.sdlc/config.json`)
