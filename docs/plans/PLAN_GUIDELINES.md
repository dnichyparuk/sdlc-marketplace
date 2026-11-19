# Plan guidelines

## Planning conventions

These rules are shared by every project that keeps a plan register (`plan-register/1`). Each rule
says whether it is checked by `node scripts/plan-register.mjs check` (run by the project's test
wrapper) or is only a convention, which is reviewed, not tested. After this section was inserted it
belongs to the project; changes to it are caught in review, not by a test. The project's own choices
(unit name, key patterns, directories, archive path and banner) are described in a project appendix
to this rules file.

Terms: the **programme** holds the order, dependencies, decisions, gates and the homes of TODO notes;
a **unit** (of delivery) is one or more PRs with one completion criterion and is the scope of
execution; an **executable plan** is generated from one unit (or a part of it) by the plan executor
at an explicit path, and a unit may have none or several; a **task** is a `### Task N:` inside an
executable plan; a **TODO note** is work without a plan. A **phase** is an optional grouping of units.

1. **Every kind of status has one place.** The programme document starts with a table "which status
   lives where"; other documents link to it instead of repeating it. Units and their status live only
   in the register (`Not started`, `In progress`, `Done`, `Superseded`) and are changed with
   `node scripts/plan-register.mjs set`; the tables in the generated regions are never edited by hand.
   Checked by `node scripts/plan-register.mjs check`: the generated regions must be current (fix:
   `node scripts/plan-register.mjs write`). Not checked: repeated status text in other documents
   (convention, reviewed, not tested).
2. **A unit is addressable:** it has a stable key, a scope, acceptance criteria and dependencies. A key
   is never reused: a unit that is no longer wanted is set to `Superseded`, not removed. Convention
   (reviewed, not tested): `check` verifies only that keys match `config.keyPatterns` and are unique
   in the current register; it cannot see the reuse of a removed key.
3. **The link between an executable plan and the programme can be checked.** The plan's `**Source:**`
   line names the unit key as a separate token; the recommended form is `<doc>#<key>`, where `<doc>` is
   the programme document. The plan executor writes the path of its scope brief there, so
   `node scripts/plan-register.mjs add-plan <key> <path> --role executable` rewrites the line when it
   does not name the key yet. No other line is required. Checked by
   `node scripts/plan-register.mjs check`: both directions (a registered executable plan names its key;
   an active plan that names a key is registered), plan files and sections.
4. **Progress is not written by hand.** It is computed from the checkboxes of the registered plans, or
   not kept at all; no percentages or dates are stored. Executors do not tick plan boxes: a person or an
   agent ticks an item after its task is done, in the same PR. A brief item handed over to an
   executable plan becomes `[~]` with an indented line `*Skipped on YYYY-MM-DD: <reason>*`. A fully
   ticked plan may fail an executor's plan-format validator; that is expected and not fixed. Checked by
   `node scripts/plan-register.mjs check`: a `Not started` unit with ticked boxes, and `[~]` without a
   dated reason, are errors; progress in the regions must be current.
5. **The decision log is append-only,** and the log wins over the text of a plan. Each entry lists the
   rejected options and the places the decision made obsolete. Decision ids carry a programme prefix
   (`<PREFIX>-<n>`) so that they are not confused between documents. Convention (reviewed, not tested):
   append-only and the prefixes; `check` verifies only that decision ids referenced by units are
   headings in the configured decision logs.
6. **Every open TODO note has a home in the programme:** a unit that lists it
   (`node scripts/plan-register.mjs home-todo <todo> <key>`), or an entry in `config.todos.unhomed` with
   a reason (`node scripts/plan-register.mjs home-todo <todo> --unhomed <reason>`). A note may have a
   section "decision awaiting transfer" with the rule for when to move it. Checked by
   `node scripts/plan-register.mjs check`.
7. **Blockers are recorded one way,** on the blocked unit only: `**Blocked by:**` in its documents, and
   `dependsOn` / `waitsOn` of the blocked unit in the register; there is no `blocks` field. The regions
   render them as `Blocked (decision: <ref>)`, `Blocked (credential)` and `Blocked (external: <ref>)`.
   In a TODO note the consequence field is `Impact`, not `Blocks`. Partly checked by
   `node scripts/plan-register.mjs check`: dependency references, cycles and `waitsOn` kinds; the
   `**Blocked by:**` lines and the wording of TODO notes are convention (reviewed, not tested).
8. **Archive:** finished and replaced plans are moved to the archive directory (`config.archive.dir`,
   the project's choice) with the banner from `config.archive.banner`, by default
   `ARCHIVED / IMPLEMENTED|SUPERSEDED|EXECUTED — PR #N, <commit>`. Convention (reviewed, not tested):
   `check` does not verify that archived plans carry the banner.
9. **A programme snapshot** is an optional frozen document; it is never the source of a decision or of
   the order. Convention (reviewed, not tested).
10. **Automation is honest:** these rules name only checks and commands that exist.
    `node scripts/plan-register.mjs check` checks rules 1, 3, 4 and 6 and part of rule 7; rules 2
    (reuse of a key), 5, 8 and 9 remain convention and review. The register does not check the format
    of executable plans; that is the job of the plan executor's own validator, where it has one.

## Project appendix (sdlc-marketplace)

- **Unit name:** `wave`. Delivery keys match `^W-(?:[A-Z][0-9]?)$` (for example `W-H2`); the gate key is `W-END`. The wave letter of the lean wave order is the alias (`H2`, `END`). Bare letters are not keys: they collide with tokens on the source lines of older plans (rule V11).
- **Programme document:** `docs/plans/programme.md`, one `## <key>: <title>` section per unit, registered as that unit's brief. Each section schedules its tickets in a `### Milestones` table.
- **Generated region:** `docs/plans/README.md`, marker `plan-register`, views `units`, `order`, `todos`. The tickets index is the `tickets-index` region of `docs/tickets/README.md`.
- **Plan directories:** `docs/plans` and `docs/archived/plans` (not recursive). The archive is `docs/archived/plans`, banner `ARCHIVED / {outcome} — {closedBy}`.
- **TODO notes:** `docs/TODO` (open) and `docs/TODO/archive` (closed). Deferred review lows of waves H1 to F go only to one note per wave, `docs/TODO/lows-<wave>.md`, homed to `W-END` (PD-1); never to a ticket or a note per low.
- **Decision log:** `docs/plans/decisions.md`, ids `PD-<n>`.
- **Tickets:** `docs/tickets/`, schema `tickets/1`, plugin defaults.
- **Test:** the exec case `plan-register` in `tests/promptfoo/datasets/plan-register-exec.yaml` runs `node scripts/plan-register.mjs check` (this project allows only promptfoo tests). Fix a failure with `node scripts/plan-register.mjs write`.
- **History:** waves lean-w1 to lean-w38 are not in the register; their record is the lean ledger.
