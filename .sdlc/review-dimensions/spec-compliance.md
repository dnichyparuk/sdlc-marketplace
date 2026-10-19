---
name: spec-compliance
description: "Reviews that SKILL.md changes are consistent with the corresponding spec in docs/specs/, and that spec was updated before implementation"
triggers:
  - "**/skills/**/SKILL.md"
  - "docs/specs/*.md"
  - "docs/spec-template.md"
skip-when:
  - "**/node_modules/**"
  - "tests/**"
severity: high
model: opus
requires-full-diff: true
---

# Spec Compliance Review

Review that every skill implementation change is traceable to a specification in `docs/specs/<skill-name>.md`. Specs are the source of truth for skill behavior — SKILL.md implements the spec, not the other way around.

## Checklist

### Spec-first ordering
- [ ] If a SKILL.md was modified, the corresponding `docs/specs/<skill-name>.md` was also modified in the same changeset (or was already up to date)
- [ ] New behavioral requirements in SKILL.md have matching R-prefixed entries in the spec
- [ ] No SKILL.md changes introduce behavior that contradicts existing spec requirements

### Requirement coverage
- [ ] Every R (Core Requirement) entry in the spec has corresponding implementation in SKILL.md
- [ ] Every A (Argument) entry in the spec is handled in SKILL.md's flag/argument parsing
- [ ] Every G (Quality Gate) entry in the spec appears in SKILL.md's critique/validation steps
- [ ] Every E (Error Handling) entry in the spec has a matching error recovery path in SKILL.md
- [ ] Every C (Constraint) entry in the spec is enforced in SKILL.md (often in DO NOT sections)
- [ ] Every I (Integration) entry in the spec reflects actual skill interactions in SKILL.md

### Prepare script contract
- [ ] If the spec lists P (Prepare Script Contract) entries, SKILL.md consumes those exact fields from the prepare script output
- [ ] No SKILL.md code depends on prepare script fields not listed in the spec's P entries

### Spec structure
- [ ] New or modified specs follow the template at `docs/spec-template.md`
- [ ] Ids are never renumbered or reused; a gap is allowed only when the missing id is listed under `### Withdrawn` in the spec appendix
- [ ] Specs contain only WHAT (behavioral contract), not HOW (implementation details)

## Severity Guide

| Finding | Severity |
|---------|----------|
| SKILL.md changed but spec not updated — new behavior has no spec backing | critical |
| SKILL.md contradicts a spec requirement | critical |
| Spec requirement exists but SKILL.md does not implement it | high |
| Spec quality gate missing from SKILL.md critique step | high |
| SKILL.md depends on prepare script field not in spec P entries | medium |
| Spec argument entry missing for a SKILL.md flag | medium |
| Id gap not listed under Withdrawn | low |
| Spec wording could be more precise but is not wrong | info |
