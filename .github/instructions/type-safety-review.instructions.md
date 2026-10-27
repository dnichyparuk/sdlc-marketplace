---
applyTo: "site/src/**/*.ts"
---
# type-safety-review — Review Instructions

Reviews TypeScript files in the Astro site for strict-mode compliance, any-type usage, null safety, and type annotation quality

Default severity: medium

## Checklist

- No `any` type used without a justified comment — prefer `unknown` with type guards or explicit types
- No non-null assertion (`!`) without a surrounding comment explaining why null is impossible at that point
- All function parameters and return types are explicitly annotated in non-trivial functions
- `undefined` and `null` cases are handled explicitly — no implicit assumptions that optional fields are always present
- Type assertions (`as X`) are used only when TypeScript cannot infer the type from context; never as a workaround for type errors
- Object shapes are defined via `interface` or `type` alias — no inline `{ foo: string; bar: number }` repeated across files
- Generic types are constrained where possible (`T extends Record<string, unknown>` not just `T`)
- No `@ts-ignore` or `@ts-expect-error` without an accompanying comment explaining the known issue
- Imported types use `import type` syntax to avoid runtime imports being emitted
- Array and object destructuring preserves types — no destructuring into `any`-typed intermediates
- Astro content collection types (from `content.config.ts`) are re-exported or typed correctly — no implicit `any` from untyped collection entries

## Severity Guide

| Finding | Severity |
|---------|----------|
| `any` type silently widening a collection or API boundary | high |
| Non-null assertion on a value that can be null in practice | high |
| `@ts-ignore` hiding a real type error | high |
| Missing return type on exported function with complex return shape | medium |
| Implicit `undefined` not handled in conditional | medium |
| Type assertion used as a workaround instead of proper typing | medium |
| Inline object type duplicated across files | low |
| Missing `import type` for type-only imports | low |
| Unconstrained generic that could be narrowed | low |

## Note

In Claude Code reviews, files matching these patterns are excluded: site/src/**/*.d.ts, **/node_modules/**, site/dist/**, site/.astro/**.
Copilot path-specific instructions do not support exclusion patterns — use judgment when findings apply to these files.
