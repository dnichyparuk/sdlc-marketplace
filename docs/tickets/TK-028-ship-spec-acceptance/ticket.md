---
id: TK-028
type: task
title: Ship spec R92 and P-STEP-2 Acceptance lines, SKILL.md:278 cites P-STEP-2 (F-197)
created: 2026-11-22
links: [todo:ship-spec-r92-acceptance-and-skill-citation]
---

# TK-028: Ship spec R92 and P-STEP-2 Acceptance lines, SKILL.md:278 cites P-STEP-2 (F-197)

## Why

In docs/specs/ship-sdlc.md the Acceptance line of R92 (~409) names only execute-plan-sdlc/liveness/wave-watch: and the handback sentinel, not the exec cases ship-sdlc/tool-handling: (tests/promptfoo/datasets/ship-sdlc-exec.yaml). P-STEP-2 (~347) has no Acceptance line, though the case "ship-sdlc/tool-handling: mktemp result file is read once" tests it. plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:278 (the mktemp Read step) cites no spec id (deferred low of lean-w52). Source: TODO note ship-spec-r92-acceptance-and-skill-citation (F-197).

## What

Add both Acceptance lines to the spec, cite P-STEP-2 in SKILL.md:278, and copy the spec to site/src/content-source/specs/ship-sdlc.md with cp.

## Acceptance

- A1: the R92 Acceptance line names the ship-sdlc/tool-handling: exec cases.
- A2: P-STEP-2 has an Acceptance line naming the mktemp tool-handling case.
- A3: SKILL.md:278 cites P-STEP-2.
- A4: site/src/content-source/specs/ship-sdlc.md is a byte copy of docs/specs/ship-sdlc.md.

## Notes

<context and decisions; longer material goes to notes/>

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
