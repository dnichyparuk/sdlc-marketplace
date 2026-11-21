# sdlc-marketplace programme

The waves after lean-w37, in order. Each `##` section is the brief of one wave (unit) of `docs/plans/register.json`.

| Kind of status | Lives in |
| --- | --- |
| Waves: order, dependencies, status, PR | `docs/plans/register.json`, shown in `docs/plans/README.md` (generated) |
| Work items | `docs/tickets/`; their state is computed by `node scripts/plan-register.mjs tickets status` |
| Scope and schedule of a wave | its section below |
| Progress | the boxes of the wave's registered executable plan |
| Decisions | `docs/plans/decisions.md` |
| Deferred review lows | `docs/TODO/lows-<wave>.md`, homed to `W-END` (PD-1) |
| History of lean-w1 to lean-w38 | the lean ledger |

## W-H2: Suite speed infrastructure, pre-push tier and per-round review findings

Scope (wave order, 2026-11-19): "H2: #9425 + pre-push tier + #9462 (per-round review findings in review-summary) (default -j 1; -j 4 trial owner-only). If the pre-push tier is Complex and H2 would reach 3 Complex, move it to F."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-001, TK-002, TK-003 | `2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier` | default -j 1; -j 4 trial owner-only |

## W-B: Suite false passes and the guardrail table re-splice

Scope (wave order, 2026-11-19): "B: #9424+#9440+#9441 + #9453 (~11 tasks / 0 Complex; lean-w34 lows moved to END, owner 2026-11-19). After H2."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-004, TK-005, TK-006, TK-007 | `2026-11-19-w-b-suite-false-passes-and-the-guardrail` | ~11 tasks, 0 Complex |

## W-D1: Suite reduction

Scope (wave order, 2026-11-19): "D1: #9426 reduction (~8 tasks; lean-w35 lows moved to END). After B."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-008 | `2026-11-19-w-d1-suite-reduction` | ~8 tasks |

## W-D2: Ship, execute and plan follow-ups

Scope (wave order, 2026-11-19): "D2: #9445, #9446, #9449, #9451, #9452 (+#9456 doc-only), #9454, #9455, #9458 (+ship-sdlc state-location sentence), #9450 (exact-name match in lib/state.js :176/:260 + branch check on read; slug format unchanged) (~10 tasks / <=2 Complex; lean-w36 lows moved to END). After D1."

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-009, TK-010, TK-011, TK-012, TK-013, TK-014 | `2026-11-20-w-d2-ship-execute-and-plan-follow-ups` | ~10 tasks, at most 2 Complex (M1 and M2 together) |
| M2 | TK-015, TK-016, TK-017, TK-018 | `2026-11-20-w-d2-ship-execute-and-plan-follow-ups` | same wave as M1 |

## W-F: Suite coverage gaps, tiers and structure

Scope (wave order, 2026-11-19): "F: #9428 + #9427 without the pre-push tier; the ship-prepare-exec.yaml split last. After D2." #9463 (no wave named in the todo) is scheduled here (wave L planner, 2026-11-19).

### Milestones

| Milestone | Tickets | Plan(s) | Estimate |
| --- | --- | --- | --- |
| M1 | TK-019, TK-020, TK-021 | `2026-11-21-w-f-suite-coverage-gaps-tiers-and-structure` | ship-prepare-exec.yaml split last |

## W-END: Programme post-merge audit

> END (owner 2026-11-19, 'accepted with optimisations'): after F, ONE post-merge audit of the programme; its brief carries, as context, every deferred low of every wave (`ledger.js backlog` + review-archive texts, incl. the placement architect's file:line list for lean-w34/w35/w36: plan-critique-orchestrator.md :41/:104, spec R75 rerun lanes, ship.js:526, pr-sdlc SKILL.md:456; mutation-smoke.js :164/:165/:172/:187, check-dataset-asserts.js:175, check-spec-id-coverage.js:73; ship-step-received-review.md:21, received-review SKILL.md:612) plus #9450's wider prefix-match note. Confirmed defects and still-present lows then go to final fix wave(s) sized by the usual bounds. No low becomes a wave before END; new lows from H1..F also accumulate in the backlog.

> END brief: brief.js audit --prs 110-<F PR> (with --context-file from `plan-register show END --brief` once skill PR A is installed), launch prompt adds 're-check every entry of the END gate's homed lows notes on HEAD: STILL PRESENT / FIXED / NOT A DEFECT with file:line, outside the 15-defect cap'.

Homed notes: `docs/TODO/lows-lean-w34.md`, `docs/TODO/lows-lean-w35.md`, `docs/TODO/lows-lean-w36.md` and decision PD-1.
