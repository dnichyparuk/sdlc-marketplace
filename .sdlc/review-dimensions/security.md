---
name: security-review
description: "OWASP Top 10 review — tags every finding with the matching A01–A10 category"
triggers:
  - "plugins/**/scripts/**/*.js"
  - "plugins/**/skills/**/*.md"
  - "plugins/**/hooks/**/*.js"
  - "plugins/**/hooks/hooks.json"
  - "tests/promptfoo/fixtures-fs/**"
  - ".github/workflows/**"
  - "schemas/**/*.json"
skip-when:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__fixtures__/**"
severity: high
max-files: 50
model: sonnet
effort: high
---

# Security Review (OWASP Top 10)

Review changes against the OWASP Top 10 (2025) for this marketplace plugin.

## Tagging Instruction (REQUIRED)

For every finding, set the `owasp` key of the finding JSON to the matching category code (`A01`–`A10`). When a finding spans multiple categories, pick the most specific. Omit the field only when no OWASP category applies (rare).

## Checklist

- [ ] A01 — Broken access control: scripts that touch git/gh/jira respect the configured scope; no path-traversal or unscoped writes outside the project root
- [ ] A02 — Cryptographic failures: no MD5/SHA1/DES, no plaintext credential persistence, hashes used only for non-secret keys (caches)
- [ ] A03 — Injection: no `exec()` / `child_process.exec` with unsanitised user input, no shell interpolation of untrusted strings, regex inputs anchored where appropriate
- [ ] A04 — Insecure design: trust boundaries between user input → script → LLM → tool calls are explicit; no implicit elevation
- [ ] A05 — Security misconfiguration: hooks, settings, and CI workflows do not disable security checks or grant overly broad permissions
- [ ] A06 — Vulnerable & outdated components: no deprecated/unmaintained npm packages, no known-CVE versions added in lockfile updates
- [ ] A07 — Identification & authentication failures: tokens (gh/jira) sourced from approved env/keychain only — never echoed, persisted, or logged; credential-bearing CLI calls (gh, jira, curl with a token) are time-bounded (a timeout option on the spawn), and tests never reach a live authenticated service (stub the CLI or the network)
- [ ] A08 — Software & data integrity failures: no unsigned plugin downloads, no untrusted deserialisation, hooks load only from approved paths
- [ ] A09 — Security logging & monitoring failures: failure paths surface actionable error text without leaking secrets; audit-relevant events are logged
- [ ] A10 — SSRF: outbound HTTP (links.js, gh/jira) validates URLs against an allowlist; no fetches to user-controlled internal hosts or metadata endpoints

## Severity Guide

| Category | Default Severity |
|----------|------------------|
| A01 — Broken access control | critical |
| A02 — Cryptographic failures | critical |
| A03 — Injection | critical |
| A04 — Insecure design | high |
| A05 — Security misconfiguration | high |
| A06 — Vulnerable & outdated components | high |
| A07 — Identification & authentication failures | critical |
| A08 — Software & data integrity failures | high |
| A09 — Security logging & monitoring failures | medium |
| A10 — SSRF | high |
