# cost-tiers.md: the 60 s --timeout cap after a worker returned has no row in the wave wait tuning table

Status: Promoted (TK-027)

Plugin defect (lean ledger F-198, low). `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:390` and `wave-runner-template.md:104` pass `--timeout` of at most 60 once some workers have returned. The table "execute-plan-sdlc wave wait tuning" in `docs/cost-tiers.md` (lines ~143-153) has no row for it. R92 of `docs/specs/execute-plan-sdlc.md` says these values live there.

Proposal: add a row (`--timeout` passed by the skill after a worker returned: at most 60 s; defined in `skills/execute-plan-sdlc/SKILL.md`, `wave-runner-template.md`) and copy the file to `site/src/content-source/cost-tiers.md` with `cp`.
