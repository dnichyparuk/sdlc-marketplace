# ship-sdlc doc words the deferred Monitor rule differently from the spec and SKILL.md

Status: Promoted (TK-026)

Plugin defect (lean ledger F-196, low). `docs/skills/ship-sdlc.md:229` says "When Monitor is a deferred tool, ship first loads Monitor and TaskStop". The spec (`docs/specs/ship-sdlc.md:408`, R92) and `SKILL.md:276` say "When `Monitor` or `TaskStop` is listed as a deferred tool". The two conditions differ when only one of the tools is deferred.

Proposal: reword the doc to "When Monitor or TaskStop is a deferred tool" and copy it to `site/src/content-source/skills/ship-sdlc.md` with `cp` in the same commit.
