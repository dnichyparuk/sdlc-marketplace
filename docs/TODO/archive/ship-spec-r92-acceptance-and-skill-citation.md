# ship-sdlc spec: R92 and P-STEP-2 acceptance lines incomplete, SKILL.md mktemp step cites no spec id

Status: Promoted (TK-028)

Plugin defect (lean ledger F-197, low; also covers the deferred low of lean-w52). In `docs/specs/ship-sdlc.md`:
- the Acceptance line of R92 (line ~409) names only `execute-plan-sdlc/liveness/wave-watch:` and the handback sentinel, not the exec cases `ship-sdlc/tool-handling:` (`tests/promptfoo/datasets/ship-sdlc-exec.yaml`);
- P-STEP-2 (line ~347) has no Acceptance line, though the case `ship-sdlc/tool-handling: mktemp result file is read once ...` tests it;
- `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md:278` (the mktemp Read step) cites no spec id.

Proposal: add both Acceptance lines, cite P-STEP-2 in SKILL.md:278, and copy the spec to `site/src/content-source/specs/ship-sdlc.md` with `cp`.
