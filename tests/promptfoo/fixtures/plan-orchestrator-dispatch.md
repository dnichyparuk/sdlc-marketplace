# Plan Orchestrator Dispatch Context

## plan-prepare.js Output (pre-computed)

```json
{
  "openspec": { "present": false, "activeChanges": [], "branchMatch": null },
  "fromOpenspec": null,
  "guardrails": [],
  "explorePack": {
    "manifestPath": "/tmp/sdlc-explore-feat-auth-abc123/manifest.json",
    "outDir": "/tmp/sdlc-explore-feat-auth-abc123",
    "scopeHintCount": 8,
    "webResearchSignal": false,
    "error": null
  },
  "githubHosting": { "detected": true, "host": "github.com" },
  "g17Dispatch": {
    "subagentType": "general-purpose",
    "model": "sonnet",
    "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/g17-dimension-coverage-prompt.md"
  },
  "lanes": [
    { "name": "static-structural", "subagentType": "general-purpose", "model": "haiku", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-static-structural-prompt.md", "gateIds": ["G1","G2","G7"] },
    { "name": "content-coverage", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-content-coverage-prompt.md", "gateIds": ["G5","G6","G8","G9","G11","G13","G15","G16"] },
    { "name": "guardrail-compliance", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lane-guardrail-compliance-prompt.md", "gateIds": ["G14"] },
    { "name": "dimension-coverage", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/g17-dimension-coverage-prompt.md", "gateIds": ["G17"] }
  ],
  "lensReviewers": [
    { "lens": "architecture", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-architecture-prompt.md", "focusCategories": ["Buildability","Task descriptions","Decision documentation","Dependency accuracy"] },
    { "lens": "requirements", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-requirements-prompt.md", "focusCategories": ["Requirements coverage","Metadata completeness","Plan completeness","OpenSpec G16","Exploration provenance","Best-practice traceability"] },
    { "lens": "risk", "subagentType": "general-purpose", "model": "sonnet", "promptTemplatePath": "/home/user/.claude/plugins/cache/sdlc/0.20.21/skills/plan-sdlc/lens-risk-prompt.md", "focusCategories": ["File paths","Verification strategy","Scope discipline","Guardrail compliance"] }
  ],
  "errors": []
}
```

## User Request

Implement JWT token validation for the auth service. This affects:
- `src/api/auth.ts`
- `src/middleware/auth-guard.ts`
- `src/routes/index.ts`
- `src/services/token.ts`
- `src/models/session.ts`
- `src/utils/crypto.ts`
- `tests/auth.test.ts`
- `tests/middleware.test.ts`

## Scope

8 files are in scope — full pipeline threshold exceeded. `explorePack.manifestPath` is non-null.

## Orchestrator Brief (simulated return from plan-explore-orchestrator)

```
Brief file: /tmp/sdlc-explore-feat-auth-abc123/discovery-brief.md
Out dir: /tmp/sdlc-explore-feat-auth-abc123
Dimensions: 4 (3 code, 0 web, 1 hybrid)
Web findings: 3
Contradictions: 0
Zero-finding dimensions: none
```

### Discovery Brief Contents

```markdown
# Discovery Brief

Generated: 2026-05-20T06:00:00Z
Dimensions: 4 (3 code, 0 web, 1 hybrid)

## Dimensions

| Dimension | Mode | Model | Findings | Status |
|---|---|---|---|---|
| jwt-validation-flow | code | sonnet | 3 | ACTIVE |
| middleware-integration-pattern | code | haiku | 2 | ACTIVE |
| session-model-schema | code | haiku | 2 | ACTIVE |
| jwt-rfc-compliance | hybrid | sonnet | 3 | ACTIVE |

## Findings

### F-jwt-validation-flow-* (code)
F-jwt-validation-flow-1: src/api/auth.ts:42 — No token expiry check; only signature verified
F-jwt-validation-flow-2: src/services/token.ts:88 — `verifyToken()` missing issuer claim validation
F-jwt-validation-flow-3: src/utils/crypto.ts:15 — Algorithm hardcoded as HS256; RS256 not supported

### F-middleware-integration-pattern-* (code)
F-middleware-integration-pattern-1: src/middleware/auth-guard.ts:30 — Guard passes unauthenticated requests to next() silently
F-middleware-integration-pattern-2: src/routes/index.ts:55 — Auth guard applied inconsistently across routes

### F-session-model-schema-* (code)
F-session-model-schema-1: src/models/session.ts:12 — No `expiresAt` field in session schema
F-session-model-schema-2: src/models/session.ts:45 — No index on `userId` for token lookup

### F-jwt-rfc-compliance-* (hybrid)
F-jwt-rfc-compliance-1: https://www.rfc-editor.org/rfc/rfc7519 — RFC 7519 §4.1.4 requires `exp` claim validation (recency: 2015, source-type: RFC) [web-only]
F-jwt-rfc-compliance-2: src/services/token.ts:88 — Missing `exp` claim check confirmed in codebase [conflicts-with-codebase]
F-jwt-rfc-compliance-3: https://owasp.org/www-cheatsheet-series/JSON_Web_Token_Cheat_Sheet — OWASP recommends RS256 over HS256 for service-to-service auth (recency: 2023, source-type: OWASP) [web-only]

## Contradictions
None detected.

## Zero-Finding Dimensions
None.

## Best-Practice Synthesis
- F-jwt-rfc-compliance-1: RECOMMENDATION — Validate `exp` claim on every token decode; reject expired tokens before any business logic
- F-jwt-rfc-compliance-3: RECOMMENDATION — Migrate from HS256 to RS256 for service-to-service JWT signing
```
