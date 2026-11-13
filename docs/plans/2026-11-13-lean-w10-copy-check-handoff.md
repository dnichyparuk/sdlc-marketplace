# Copy check and final-check hand-off Implementation Plan

**Commit:** `fix(#9368): plan, ship - copy check and final-check hand-off`
**Goal:**
- Make the plan-time "every copy" rule (plan-sdlc R71(d)) deterministic: a new config key `plan.copyRules` and a script check in `plan.js merge-lanes`.
- Let setup-sdlc validate `plan.copyRules` and warn about rules that match no file.
- Make ship's final fix review (R95) hand its open findings to the caller: `finalCheck.open` in the summary and, under `--auto`, a `done` stop with `reason: 'final-check-open'`.
**Architecture:** One shared derivation `requiredCopies(planText, rules, cwd)` in `scripts/lib/plan-parse.js` turns the copy rules and the plan's Files into a list of required copy paths. `plan.js merge-lanes --plan <path>` reads `plan.copyRules` from the project config and adds one blocking issue for each required path that no task lists; `skill/setup.js` reuses the same library to validate the rules. Ship computes `finalCheck.open` from the review summary and the review comment when the final check's result is recorded, and under `--auto` stops with a resumable `done` envelope.
**Source:** conversation context (wave brief for #9368; architect advice on ledger finding F-62(b), owner decision 2026-11-12 "Hand off to main")
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- Item 1. Copies of a changed behaviour escaped plan review three times (ledger F-35, F-42, F-62). A copy is a file that restates what a skill does: its user doc page, the site copy of that page, the site metadata entry and the skill's companion `.md` files.
- plan-sdlc R71(d) already says a plan must list them. Only models enforce it (the planner, the risk lens and the single reviewer). Models miss copies.
- Item 2. Ship's final fix review (R95) runs once and never loops. Findings it raises at or above `reviewThreshold` stay open, and nothing tells the caller. The main session then needed extra fix rounds in waves M1, M2, m4a0, 5b-1 and 5b-2.

**What prompted this change now?**

- An isolated Opus architect reviewed ledger finding F-62(b) on 2026-11-12. It rejected run-time scope widening in received-review and proposed this plan-time check instead (rated "strong").
- The owner decided on 2026-11-12 for item 2: "Hand off to main".

**What does success look like?**

- With `plan.copyRules` set, `plan.js merge-lanes --plan <plan>` reports each missing copy as one blocking issue that names the path and the rule. Without the key, nothing changes.
- setup-sdlc reports an invalid glob as an error and a rule that matches no file as a warning.
- A final check with an open finding at or above the threshold puts `finalCheck.open` in the summary. Under `--auto` the run ends `done` with `reason: 'final-check-open'` and a resume command. A clean final check behaves as today.

**Re-verification at HEAD 44510f2 (both items still reproduce):**

- Item 1: R71(d) is prose only (`docs/specs/plan-sdlc.md:292`). `mergeLanes` at `plugins/sdlc-utilities/scripts/lib/plan-critique.js:598` takes no plan path and no config. `plan.js:344` lists the merge-lanes flags, and there is no `--plan`. No `copyRules` string exists in the repository. `planSection` in `schemas/sdlc-config.schema.json:281-293` has only `guardrails`, with `additionalProperties: false`.
- Item 2: `ship.js:2732-2738` sets only `status` and `verdict` on the final check and continues with `from = 'dispatch_commit_fixes'`. The done envelope has no reason for open findings. No `final-check-open` string exists.
- No item is dropped.

**Execute compatibility check (brief item 1, last bullet).** A copy listed in Files that ends up unchanged does not trip execute:

- The wave-level phantom check (execute R34 5c-bis(a), `docs/specs/execute-plan-sdlc.md:136`) fails a wave only when the diff and the wave's expected files have no file in common.
- `--strict-files` (execute R44, `docs/specs/execute-plan-sdlc.md:35`) fails only on changed files outside the expected set. An unchanged listed file is never outside it.
- The risk that remains is a task whose only listed file is an unchanged copy. The per-task phantom-success rule (E9) and the verify-token canary could read it as "no work done". So a copy is listed in a task that also changes another file. The R71(d) amendment states this rule (Task 1).

## Research Findings

The discovery brief (`F-<dimension>-<n>` ids below) and direct reading found these facts.

**Plan parsing and the received-review scope (F-required-copies-derivation-and-merge-lanes-1, -2, -6).**

- `parseFilesEntries(body)` in `plugins/sdlc-utilities/scripts/lib/plan-parse.js:241-251` returns `[{ kind, path }]`. It removes a `:N` line suffix only.
- `allowedFilesFromPlan` in `plugins/sdlc-utilities/scripts/skill/received-review.js:292-300` adds the normalisation: no leading `./`, no trailing `/`. `checkScope` (:330) treats a directory entry as covering every path under it (`p === a || p.startsWith(a + '/')`).
- `globToRegex` (`scripts/skill/review.js:135`) is exported, and `plan-critique.js:202` already imports it. It supports `{a,b}` brace alternation. A brace group with no comma, such as `{skill}`, would turn into a one-way alternation that matches the literal word. So captures must be replaced before the glob is converted.
- `isValidGlob` in `scripts/lib/dimensions.js:21` is the only glob validator.

**merge-lanes (F-required-copies-derivation-and-merge-lanes-3, -4, -5, -10).**

- `runMergeLanes` (`plan.js:390-403`) passes only the flags to `mergeLanes`. The issue shape is `{ gateId, taskRef, severity, message, blocking, lane }`. Dedup keys on the task ref and a message prefix, so each copy message must start with its path.
- Existing `plan-merge:` exec cases assert exact `blockingCount` values (for example 14). The new check must be opt-in: it runs only when `--plan` is passed.
- Config is read with `readSection(resolveSdlcRoot(), 'plan')`, as the prepare flow does at `plan.js:612`. `PROJECT_SECTIONS` already holds `plan` (F-plan-copyrules-config-surface-2).
- The exec harness copies each `fixtures-fs/<dir>` fixture to a temporary directory and runs the script there when `script_cwd: "{{project_root}}"` is set (`tests/promptfoo/scripts/extract-skill-content.js:50-67`). A fixture copy is not a git repository, so `resolveSdlcRoot` resolves to that directory.

**Sentinels (F-required-copies-derivation-and-merge-lanes-8).** `tests/promptfoo/scripts/check-plan-lens-sentinels.js:29-32` checks substrings in `agents/plan-lens-risk.md`, `agents/plan-reviewer.md` and `skills/plan-sdlc/SKILL.md`. It does not read the spec. The current strings stay, and one new SKILL.md string is added for the script part.

**Setup (F-plan-copyrules-config-surface-3 to -9).** `docs/specs/setup-sdlc.md` has R27 as its highest numeric id, so the next free id is R28. The schema version stays 4: the key is optional and additive (F-plan-copyrules-config-surface-7). `skill/setup.js` has no `warnings` field today. setup prepare fixtures are plain directories (`project-setup-empty`).

**Ship final check (F-ship-final-check-open-handoff-1 to -12).**

- `afterFixesCommitted` (`ship.js:2316-2335`) creates `ledger.finalCheck = { base, commit, status: 'pending', verdict: null }`.
- `reviewGateDecision(ledger)` (`ship.js:1838`) reads `review-summary.json` and applies the threshold. The summary holds only counts (`schemas/review-summary.schema.json`). Per-finding id, severity and path exist only in the review comment.
- `parseReviewComment(text, projectRoot, knownData)` (`received-review.js:355`) gives `{ id: 'F<n>', severity, path, ... }` — the same ids received-review uses. It throws without `knownData` (`knownData.dimensionNames` is read at :204). Its default needs to be empty known data.
- `pendingStop` (`ship.js:2596-2609`) is the model for a resumable `done` stop: it sets `ledger.paused`, builds `ext.commands` with `/sdlc:ship-sdlc --resume[ --auto]`, and keeps the ledger.
- The stepper harness `tests/promptfoo/scripts/run-ship-stepper.js:398-414,650-675` writes the same summary before every review result. `rounds-*` scenarios seed `flags.auto = true` (:333). Cases (a), (b), (d) and (e) pass `--summary high-1.json`. With the default threshold `high`, that summary would make their final check "open" and stop them early. So the harness gets a separate summary for the final check, with `approved-0.json` as the default.

**Copy inventory (F-skill-copy-surface-inventory-1 to -5).** All 14 skills have `docs/skills/<skill>.md`, a byte-identical site copy and a spec. `docs/skills/` also holds 5 non-skill pages, so the `{skill}` capture is anchored to the `skills/{skill}/SKILL.md` and `docs/specs/{skill}.md` triggers. ship-sdlc has 5 companion `.md` files, setup-sdlc 7, plan-sdlc 5 and received-review-sdlc none.

**Test commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`. Validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --strict`, `validate-cost-tiers.js`, `validate-discovery.js`, `validate-guardrails.js`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| A Notes mention does not satisfy a copy rule | no | Only Files entries cover a required copy. R71(d)'s Notes option stays for copies that no rule covers. | The brief says "missing from every task's Files". A script cannot judge Notes prose. Listing an unchanged copy is safe for execute (Context). |
| Copy check opt-in by `--plan` | no | `merge-lanes` runs the check only when `--plan <path>` is given. plan-sdlc's Step 3 command and the review-loop merged re-dispatch command pass it. | Existing `plan-merge:` cases assert exact blocking counts. |
| `final-check-open` stops before version and PR | no | Under `--auto`, the `--after dispatch_review` call of the final check returns `done` at once, keeps the ledger and gives `/sdlc:ship-sdlc --resume --auto`. | The brief's test is on that call. A stop before the version bump and PR lets main fix the findings first and then resume. |
| Interactive runs do not stop | no | Without `--auto`, `finalCheck.open` is filled and the run continues as today. The summary shows the open findings. | The brief limits the stop to `--auto`. |
| Open findings from the review comment | no | `open` is parsed from the final review's comment with received-review's `parseReviewComment`. When the counts meet the threshold but no comment finding is parsed, `open` holds one entry with `id: null`. | The summary schema has no per-finding records. A schema change would widen scope into review-sdlc. |
| No setup sub-flow for copyRules | no | setup-sdlc validates and reports in its prepare output. It does not prompt for rules. | The brief asks for validation and a warning, not an editor. |
| Brief names `received-review R28` | no | The history row goes to `docs/specs/received-review-sdlc.md`. | That is the spec file name. |

## Decisions taken without the owner

No owner was available. Each decision below took the recommended option. The reasons are in `## Deviations & assumptions` and `## Key Decisions`.

- D1: Only Files entries satisfy a copy rule; a Notes mention does not (Deviations row 1).
- D2: The copy check runs only when `merge-lanes` gets `--plan` (Deviations row 2).
- D3: Under `--auto`, `final-check-open` stops right after the final review, before version and PR, and keeps the ledger for `--resume --auto` (Deviations row 3).
- D4: Interactive runs do not stop; they only report `finalCheck.open` (Deviations row 4).
- D5: Open findings come from the review comment via received-review's parser, with an `id: null` fallback entry (Deviations row 5).
- D6: setup-sdlc validates and reports; it gets no copy-rule editor (Deviations row 6).
- D7: The capture syntax is any `{name}` token without a comma (KD1); require globs expand against existing files and exclude paths matched by the rule's own `when` globs (KD2).

## Key Decisions

**KD1 — The capture token is replaced before glob conversion.**

- Choice: a token `{name}` with no comma (`name` matches `[a-z][a-z0-9]*`) is a capture. It is replaced by `([^/]+)`; each literal piece between tokens goes through `globToRegex`. A brace group with a comma stays alternation.
- Alternative: write a second glob engine.
- Why: `globToRegex` already exists. Replacing first keeps one engine and keeps `{a,b}` working.

**KD2 — Require globs expand against existing files only.**

- Choice: a required path must exist in the working tree. A literal path that does not exist is not required. A path that matches one of the rule's own `when` globs is excluded, so `skills/{skill}/*.md` does not require `SKILL.md`.
- Alternative: require literal paths even when absent.
- Why: the brief says so. A new skill's missing pages are already caught by the `skill-docs-required` guardrail.

**KD3 — The check lives in merge-lanes, not in a new gate.**

- Choice: the copy issues carry `gateId: null`, `lane: 'copy-check'`, `severity: 'error'`, `blocking: true`.
- Alternative: a new PF check in `validate-plan-format.js`, or a new gate id.
- Why: the brief says "no new gate". merge-lanes already turns script results into blocking issues.

**KD4 — Shared helpers go in `plan-parse.js`; received-review reuses them.**

- Choice: `normalisePlanPath` and `planFilesPaths` move into `plan-parse.js`, and `allowedFilesFromPlan` calls `planFilesPaths`.
- Alternative: copy the normalisation into the new function.
- Why: the `dry` guardrail. received-review's scope and the copy check then cannot diverge.

**KD5 — The final check computes `open` once, when its result is recorded.**

- Choice: `open` is computed in the `--after dispatch_review` branch while `finalCheck.status` is `pending`. A repeated result changes nothing (R95 idempotency).
- Alternative: compute it in `buildSummary` on every call.
- Why: the summary file may be overwritten later. One computation also keeps the resume path stable.

**KD6 — One task edits `skills-meta.ts` for both skills.**

- Choice: Task 12 edits the plan-sdlc `critique-plan` node and the ship-sdlc `final-check` node, after Tasks 7 and 10.
- Alternative: Task 7 and Task 11 each edit their own entry, in dependency order.
- Why: one task per shared file per wave (F-43). It also keeps Tasks 7 and 11 at five files or fewer.

**KD7 — Workspace modes (`ship.workspace` = `branch` or `worktree`).**

- Copy check: config comes from `resolveSdlcRoot()` (the main worktree's `.sdlc/config.json`, the same source as plan guardrails at `plan.js:612`). Require globs expand against `process.cwd()`, the worktree where plan-sdlc runs. plan-sdlc writes plans before ship creates any worktree, so in both modes the cwd is the tree the plan describes.
- setup-sdlc: reads and expands against its `projectRoot` (setup always runs in the project root). No worktree path is involved.
- Ship stop: `final-check-open` uses the ledger path that `pendingStop` already uses (`ledgerPath`, in the main worktree's `.sdlc/execution/`). The review summary is read with `reviewGateDecision`, which already resolves the main-worktree copy in both modes (review spec P11). `--resume` finds the ledger by branch in both modes, as for `pending-question`.

**KD8 — The `--plan` flag name keeps one meaning across scripts.**

- Evidence (grep `--plan` over `plugins/sdlc-utilities/scripts/skill/*.js` at HEAD): `execute.js:82`, `received-review.js:272`, `review.js:114`, `ship.js:172` and `plan.js g17-prepare` (`plan.js:11`) all take `--plan <path>` as the path of a plan file.
- Choice: `merge-lanes --plan <path>` takes the same value, a plan file path. No new meaning is added.

**KD9 — Scope edges.**

- Smallest viable cut: Tasks 1, 4, 5 and 9 alone deliver the copy check; Tasks 3 and 10 alone deliver the hand-off. Tasks 2, 6 and 8 (setup validation) and 7, 11, 12 (docs) are required by the brief and by the spec-first and every-copy rules.
- Who fails if this ships wrong: plan-sdlc users with `plan.copyRules` set (a false blocking issue stops plan approval at Step 3); ship `--auto` callers (a false `final-check-open` stops a run before version and PR). Projects without `plan.copyRules` and interactive ship runs are not affected.
- Non-goals: run-time scope widening in received-review (rejected); copies in a different skill than the one changed; changes to the GitHub skill; a setup sub-flow that edits copy rules; a review-summary schema change; any headless, behavioural or `claude -p` run.

## Contract Examples

### Worked example — code

```markdown
**Contract:**
- shape (code): `requiredCopies(planText: string, rules: Array<{when: string[], require: string[]}>, cwd: string): Array<{ path, rule, trigger, covered }>`; pure apart from `fs` reads under `cwd`.
- names: `requiredCopies`, `validateCopyRules`, `planFilesPaths`, `normalisePlanPath`.
- mirror: `allowedFilesFromPlan` at `plugins/sdlc-utilities/scripts/skill/received-review.js:292-300`.
- decisions: KD1, KD2, KD4.
- sync: `plan.js merge-lanes` and `skill/setup.js` import these functions.
- example: rule `{ when: ['skills/{skill}/SKILL.md'], require: ['docs/skills/{skill}.md'] }` with Files `skills/demo-sdlc/SKILL.md` → `[{ path: 'docs/skills/demo-sdlc.md', rule: 0, trigger: 'skills/demo-sdlc/SKILL.md', covered: false }]`.
```

### Worked example — docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/ship-sdlc.md`. Extend the final fix review paragraph (audience: end users) with the `finalCheck.open` list and the `final-check-open` stop.
- names: `finalCheck.open`, `final-check-open`.
- mirror: the paragraph at `docs/skills/ship-sdlc.md:257`.
- decisions: KD5.
- sync: `site/src/content-source/skills/ship-sdlc.md` is a byte copy (`cp`).
```

### Worked example — openspec / spec

```markdown
**Contract:**
- shape (openspec): MODIFY `R95` in `docs/specs/ship-sdlc.md` (append the open-findings clause); numbering unchanged.
- names: `R95` (modified).
- mirror: R95 block at `docs/specs/ship-sdlc.md:209-210`.
- decisions: KD5; Deviations rows 3–5.
- sync: `site/src/content-source/specs/ship-sdlc.md` byte copy; ship SKILL.md cites "implements R95".
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Source tasks 4, 5, 6 and 10 are covered by plan-copy:, setup-copy-rules:, ship-final-check: and rr-scope: cases; case (a) is updated. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no tight-loop retries. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Tasks map to the stated #9368 items; extras are recorded in Deviations. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (spec, lib, merge-lanes, setup, docs, ship). |
| scripts-over-llm-logic | error | PASS | Copy check and open-findings logic are deterministic scripts. |
| yagni | warning | PASS | No speculative parameters; the setup editor was explicitly excluded. |
| cross-skill-consistency | error | PASS | received-review, setup, plan, ship and execute compatibility are addressed; shared helpers reused. |
| pr-link-github-issue | error | PASS | #9368 is an internal register id, not a GitHub issue; named without a keyword per project rule. |
| dry | warning | PASS | KD4 shares normalisation, and setup reuses the same matcher. |
| kiss | warning | PASS | Reuses globToRegex; capture replaced before conversion. |
| spec-first | error | PASS | Tasks 1-3 (specs) precede SKILL.md tasks 7, 8 and 11 via dependencies. |
| project-agnostic | error | PASS | Behaviour ships in plugin code and schema; the .sdlc/config.json edit is dogfooding only. |
| flag-coherence-cross-skill | error | PASS | Ship cites flags.auto and flags.reviewThreshold from the prepare output. |
| no-opposite-logical-vectors | error | PASS | Single gate phrasing for the open-findings stop. |
| flag-resolution-single-source | warning | PASS | Flags are resolved once in the script. |
| state-premise | error | PASS | Context states the root problems. |
| smallest-viable-cut | warning | PASS | KD9 names the smallest cut and why the other tasks are needed. |
| failure-audience | warning | PASS | KD9 names who fails if this ships wrong. |
| explicit-non-goals | warning | PASS | KD9 lists the non-goals. |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives are recorded in KD1-KD6 and Deviations. |
| state-machine-idempotency | error | PASS | Repeated final-check result is tested by case (d); open is computed once. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are overridden. |
| flag-semantic-consistency-cross-skill | error | PASS | KD8: grep shows every `--plan` takes a plan file path; merge-lanes keeps that meaning. |
| workspace-mode-compatibility | error | PASS | KD7 states config, cwd and ledger behaviour for branch and worktree modes. |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: docs-skill-sync (B1)

**Why:** Task 7 changes the Step 3 command in `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` to add `--plan`, and Task 11 adds a `final-check-open` done handling to the ship-sdlc SKILL.md and docs.

**Severity hint:** high

**Patch:** Check that the SKILL.md, `docs/skills/` and `skills-meta.ts` text all describe `merge-lanes --plan`, `plan.copyRules` and the `final-check-open` stop consistently.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the SKILL.md, `docs/skills/` and `skills-meta.ts` text all describe `merge-lanes --plan`, `plan.copyRules` and the `final-check-open` stop consistently.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: runtime-contract (B1)

**Why:** Task 5 adds the `--plan <path>` flag to `plugins/sdlc-utilities/scripts/skill/plan.js`, Task 6 adds a `copyRules` output to `skill/setup.js`, and Task 10 adds `ext.reason: 'final-check-open'` to `ship.js`.

**Severity hint:** high

**Patch:** Check the new `merge-lanes --plan` flag and `copyCheck` output, the `copyRules` setup output, and the `final-check-open` done reason with `finalCheck.open`, for opt-in behaviour and unchanged defaults.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new `merge-lanes --plan` flag and `copyCheck` output, the `copyRules` setup output, and the `final-check-open` done reason with `finalCheck.open`, for opt-in behaviour and unchanged defaults.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** The plan's Files cover many Markdown paths (Task 1 `docs/specs/plan-sdlc.md`, Task 7 `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md`, Task 11 `state-format.md`) that code-quality's triggers do not match.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Tasks

### Task 1: plan-sdlc and received-review specs — copy check

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — amend R71(d) and R67(a), add two history rows
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp`)
- Modify: `docs/specs/received-review-sdlc.md` — R28 history row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy (`cp`)

**Notes:** Brief: F-required-copies-derivation-and-merge-lanes-7, -9. Spec first (`spec-first` guardrail). R28's rule text stays unchanged: the brief keeps R28, ship R83, R94 and R95's scope rules as they are. Copies checked that need no change: `docs/skills/received-review-sdlc.md` and its site copy (history rows are not user-facing); received-review-sdlc has no companion `.md`.

**Acceptance criteria:**
- [ ] R71(d) keeps its current text, including the clause "every file that documents that skill for users", and gains the script sentence rendered below.
- [ ] R67(a)'s signature line names `[--plan <path>]` and the output names `copyCheck`, as rendered below.
- [ ] The plan-sdlc appendix history table gains rows `| R71 | (d) script copy check from plan.copyRules (ledger F-62(b)), #9368 |` and `| R67 | merge-lanes --plan copy check, #9368 |`.
- [ ] The received-review-sdlc appendix history table gains `| R28 | run-time scope widening for copies (ledger F-62(b)) rejected in favour of the plan-time copy check (plan-sdlc R71(d)), #9368 |`.
- [ ] Each site copy is byte-identical to its source (`cmp` exits 0).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY R71 (append to clause (d)) and R67 (clause (a)) in `docs/specs/plan-sdlc.md`; MODIFY the appendix history tables of both specs. No new id. Text appended to the end of R71's clause (d), before "; (e) environment":

  ```text
  When `.sdlc/config.json` sets `plan.copyRules` (setup-sdlc R28), the check is also made by script: `plan.js merge-lanes --plan <path>` (R67) reports each required copy that no task lists under **Files:** as a blocking issue (`lane: "copy-check"`, `gateId: null`) whose message starts with the path and names the rule index and the trigger file. A Notes mention does not satisfy a copy rule. A required copy is an existing file that matches a rule's `require` glob after the `{name}` captures of a matched `when` glob are filled in, and that matches none of the rule's `when` globs. A Files entry covers a required path when it equals the path or is a directory above it (no leading `./`, no trailing `/`). List such a copy in a task that also changes another file, so an unchanged copy cannot look like phantom success (execute E9). Without `plan.copyRules` there is no script check.
  ```

  R67(a) before → after:

  ```diff
  -(a) `merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run]` → `{ issues, passes, coverage, laneFailures, guardrailCompliancePayload, g17Findings, lens, scorecard, blockingCount, carried }` (R31, R35, R36, R40).
  +(a) `merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run] [--plan <path>]` → `{ issues, passes, coverage, laneFailures, guardrailCompliancePayload, g17Findings, lens, scorecard, blockingCount, carried, copyCheck }` (R31, R35, R36, R40, R71). `--plan` (R71(d)): `copyCheck` is `{ rules, missing: [{ path, rule, trigger }] }` and each `missing` entry is one blocking `copy-check` issue; `copyCheck` is null without `--plan` or without `plan.copyRules`. An invalid rule is skipped and reported as one non-blocking `copy-check` issue. An unreadable `--plan` file is a usage error (exit 1).
  ```
- names: R71, R67, received-review-sdlc R28 (history row only).
- mirror: history rows at `docs/specs/plan-sdlc.md:370-371`; `docs/specs/received-review-sdlc.md:224`.
- decisions: KD2, KD3; Deviations rows 1–2.
- sync: both site copies via `cp`.

### Task 2: setup-sdlc spec and config schema — plan.copyRules

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/setup-sdlc.md` — add R28 and P-copyRules, history row
- Modify: `site/src/content-source/specs/setup-sdlc.md` — byte copy (`cp`)
- Modify: `schemas/sdlc-config.schema.json` — `planSection.properties.copyRules`

**Notes:** Brief: F-plan-copyrules-config-surface-1, -5, -7. The key is optional and additive, so the schema version stays 4 (F-plan-copyrules-config-surface-7). The `{name}` capture is a string convention; the schema checks only the shape.

**Acceptance criteria:**
- [ ] `docs/specs/setup-sdlc.md` has R28 and P-copyRules with the text rendered below, and a history row `| R28 | plan.copyRules validation (ledger F-62(b)), #9368 |`.
- [ ] `planSection` accepts the rendered `copyRules` and still rejects unknown keys.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0; the site copy is byte-identical.

**Contract:**
- shape (openspec + code): ADD R28 (next free number after R27) to the setup-sdlc requirements, ADD P-copyRules to its prepare-script contract:

  ```text
  - R28: `plan.copyRules` (optional, `.sdlc/config.json`) is a list of `{ when: string[], require: string[] }` copy rules read by plan-sdlc R71(d). A `{name}` token (`name` matching `[a-z][a-z0-9]*`, no comma) is a capture: it matches one path segment in `when` and is filled in `require`. `skill/setup.js` validates every rule (P-copyRules): a glob that fails `isValidGlob` (`scripts/lib/dimensions.js`), an empty list, or a `require` capture absent from every `when` glob of the rule is an error; a rule whose `when` globs match no existing file of the project is a warning. setup-sdlc prints each error and warning once in its context summary. It does not write or prompt for the key.
  - P-copyRules: `copyRules` (object | null) — `{ rules: number, errors: string[], warnings: string[] }`, null when `plan.copyRules` is absent. Each message starts with `plan.copyRules[<i>]`.
  ```

  Schema delta (`schemas/sdlc-config.schema.json`, inside `planSection.properties`):

  ```json
  "copyRules": {
    "type": "array",
    "description": "Copy rules for the plan-sdlc copy check (plan-sdlc R71(d), setup-sdlc R28).",
    "items": {
      "type": "object",
      "properties": {
        "when": { "type": "array", "minItems": 1, "items": { "type": "string", "minLength": 1 } },
        "require": { "type": "array", "minItems": 1, "items": { "type": "string", "minLength": 1 } }
      },
      "required": ["when", "require"],
      "additionalProperties": false
    }
  }
  ```
- names: R28, P-copyRules, `copyRules`.
- mirror: `guardrails` property at `schemas/sdlc-config.schema.json:285-290`; P-field style at `docs/specs/setup-sdlc.md:158-161`.
- decisions: Deviations row 6.
- sync: site copy of the spec via `cp`.

### Task 3: ship-sdlc spec — R95 open findings hand-off

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/ship-sdlc.md` — amend R95, the transition table and a history row
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp`)

**Notes:** Brief: F-ship-final-check-open-handoff-1, -7, -12. Ids stay stable: R95 is amended, not replaced. The ship-sdlc user-facing files are changed in Tasks 11 and 12.

**Acceptance criteria:**
- [ ] R95 ends with the clause rendered below.
- [ ] The transition table (near `docs/specs/ship-sdlc.md:328-358`) gains the row rendered below.
- [ ] The history table gains `| R95 | open final-check findings handed to the caller (finalCheck.open, final-check-open), #9368 |`.
- [ ] `validate-spec-shape.js --root . --strict` exits 0; the site copy is byte-identical.

**Contract:**
- shape (openspec): MODIFY R95; ADD one transition row. Appended to R95:

  ```text
  `finalCheck` carries `open` (`[]` when the check is created). On the `--after dispatch_review` call that completes the check, ship.js applies the review gate (R6, `flags.reviewThreshold`) to the final review's summary. When findings meet the threshold, `open` lists each finding of the review comment (`commentCopyPath`, else `commentPath`) at or above the threshold as `{ id, severity, path }`, with ids and fields from received-review's comment parser (`F<n>`). When the counts meet the threshold and no such comment finding is parsed, `open` is `[{ id: null, severity: <highest severity met>, path: null }]`. With `open` non-empty and `flags.auto`, the call returns `done` with `ext.reason: "final-check-open"`, `ext.summary` (with `finalCheck.open`) and `ext.commands: ["/sdlc:ship-sdlc --resume --auto"]`; it sets `ledger.paused` and keeps the ledger, and `--resume` continues with the step after commit-fixes. Without `flags.auto`, or with `open` empty, the run continues as before.
  ```

  New transition row:

  ```text
  | `dispatch_review` (final check, R95) with `finalCheck.open` non-empty and `flags.auto` | `done` | `ext.reason:"final-check-open"`, `ext.summary`, `ext.commands` (`/sdlc:ship-sdlc --resume --auto`); `paused` set; ledger kept |
  ```

  Acceptance line under R95 becomes: exec cases whose descriptions start with `ship-final-check:`, including (f).
- names: R95, `finalCheck.open`, `final-check-open`.
- mirror: R95 at `docs/specs/ship-sdlc.md:209-210`; the `pending-question` row in the same table.
- decisions: KD5; Deviations rows 3–5.
- sync: site copy via `cp`.

### Task 4: Shared copy-rule derivation in plan-parse.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-parse.js` — add `normalisePlanPath`, `planFilesPaths`, `validateCopyRules`, `requiredCopies`
- Modify: `plugins/sdlc-utilities/scripts/skill/received-review.js` — `allowedFilesFromPlan` uses `planFilesPaths`; `parseReviewComment` defaults `knownData`

**Notes:** Brief: F-required-copies-derivation-and-merge-lanes-1, -2, -6; F-ship-final-check-open-handoff-5. `received-review.js` is changed only here, so Tasks 5, 6 and 10 can depend on this one task. The `rr-scope:` cases cover the refactor of `allowedFilesFromPlan`. `requiredCopies` gets its exec cases in Task 5 through merge-lanes, which is its only caller with plan text.

**Acceptance criteria:**
- [ ] `allowedFilesFromPlan(planFile)` returns the same sorted list as before (the `rr-scope:` cases pass).
- [ ] `parseReviewComment(text)` with no second or third argument returns findings and does not throw.
- [ ] `requiredCopies` and `validateCopyRules` behave as rendered below; both use one capture-aware matcher (one internal function), so setup's "matches nothing" warning and the copy check cannot disagree.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "rr-scope:"` passes.

**Contract:**
- shape (code): new exports of `plugins/sdlc-utilities/scripts/lib/plan-parse.js`:

  ```js
  /** "./a/b/" → "a/b" (no leading "./", no trailing "/"). */
  function normalisePlanPath(p) {}
  /** Sorted, unique, normalised Files paths of every task, every kind (extractTasks + taskSection + parseFilesEntries). */
  function planFilesPaths(planText) {}
  /**
   * → { errors: string[], warnings: string[] }; each message starts with `plan.copyRules[<i>]`.
   * errors: not an array; a rule whose `when` or `require` is not a non-empty string array; a glob that fails
   *   isValidGlob (lib/dimensions.js); a `require` capture absent from every `when` glob of the rule.
   * warnings (only when `cwd` is given, only for valid rules): no existing file under `cwd` matches any `when` glob.
   */
  function validateCopyRules(rules, cwd) {}
  /**
   * → [{ path, rule, trigger, covered }], sorted by path, then rule. Only valid rules are used (invalid ones are skipped).
   * 1. files = planFilesPaths(planText).
   * 2. For each rule i, each `when` glob, each file it matches: captures = the {name} values.
   * 3. For each `require` glob: fill the captures; expand against existing files under `cwd` (walk the
   *    static directory prefix, recursive only for `**`, skip `.git` and `node_modules`); drop paths
   *    matching any `when` glob of rule i (any capture values).
   * 4. covered = files.some(a => path === a || path.startsWith(a + '/')). One entry per (path, rule); the first trigger wins.
   */
  function requiredCopies(planText, rules, cwd) {}
  ```

  Capture conversion (KD1): split the glob on `/\{([a-z][a-z0-9]*)\}/`; literal pieces go through `globToRegex(piece).source.slice(1, -1)`; tokens become `([^/]+)`; anchor with `^…$`. Require `globToRegex` from `../skill/review` and `isValidGlob` from `./dimensions` lazily, inside the matcher function, not at the top of the file: `plan-parse.js` is also loaded by `validate-plan-format.js`, `execute.js` and `ship.js`, which must not load `review.js`. `review.js` must never require `plan-parse.js` (directly or through another module), or the lazy import becomes a load cycle. `requiredCopies` and `validateCopyRules` are exercised by Task 5 and Task 6 cases, which depend on this task.

  `received-review.js` changes:

  ```diff
   function allowedFilesFromPlan(planFile) {
     const text = fs.readFileSync(planFile, 'utf8');
  -  const paths = new Set();
  -  for (const t of extractTasks(text)) {
  -    // Same normalisation as ship's stageScope: no leading "./", no trailing "/".
  -    for (const e of parseFilesEntries(taskSection(t.body))) paths.add(e.path.replace(/^\.\//, '').replace(/\/$/, ''));
  -  }
  -  return [...paths].sort();
  +  return planFilesPaths(text); // same normalisation as ship's stageScope (plan-parse normalisePlanPath)
   }
  -function parseReviewComment(text, projectRoot, knownData) {
  +function parseReviewComment(text, projectRoot = process.cwd(), knownData = { dimensionNames: new Set(), planGuardrailIds: new Set(), executeGuardrailIds: new Set() }) {
  ```
- names: `normalisePlanPath`, `planFilesPaths`, `validateCopyRules`, `requiredCopies`.
- mirror: `allowedFilesFromPlan` at `received-review.js:292-300`; `checkScope` directory rule at `received-review.js:330`.
- decisions: KD1, KD2, KD4.
- sync: the import line at `received-review.js:55` drops names it no longer uses; Tasks 5, 6 and 10 import these functions.
- example: `normalisePlanPath('./docs/skills/')` → `'docs/skills'`.

### Task 5: merge-lanes --plan copy check and exec cases

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `--plan` flag, usage line, config read in `runMergeLanes`
- Modify: `plugins/sdlc-utilities/scripts/lib/plan-critique.js` — `mergeLanes` takes `copyCheck`, adds its issues
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — five `plan-copy:` cases, header fixture comment
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/.sdlc/config.json`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/iter/lens-all.json`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/plans/missing-doc.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/plans/all-listed.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/plans/dir-entry.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/skills/demo-sdlc/SKILL.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/skills/demo-sdlc/reference.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/docs/skills/demo-sdlc.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/site/skills/demo-sdlc.md`
- Test: `tests/promptfoo/fixtures-fs/plan-copy-rules/site/skills-meta.ts`
- Test: `tests/promptfoo/fixtures-fs/plan-merge-lanes/copy-plan.md`

**Notes:** Brief: F-required-copies-derivation-and-merge-lanes-3, -4, -5, -10. The copy issues are built in `plan.js` (which owns config and file reads) and passed to the pure `mergeLanes`, so `plan-critique.js` stays free of config reads. The check runs only with `--plan`, so the existing `plan-merge:` cases keep their exact counts. The no-rules case uses the `plan-merge-lanes` fixture, which has no `.sdlc/config.json`. The fixture paths are generic (`skills/`, `site/`), not this repository's paths.

**Acceptance criteria:**
- [ ] `plan-copy: (a)` — `plans/missing-doc.md` lists only `skills/demo-sdlc/SKILL.md` and `skills/demo-sdlc/reference.md`: the issues include exactly one blocking `copy-check` issue whose message starts with `docs/skills/demo-sdlc.md`, plus one each for `site/skills/demo-sdlc.md` and `site/skills-meta.ts`; `copyCheck.missing` has 3 entries with `rule: 0`.
- [ ] `plan-copy: (b)` — `plans/all-listed.md` lists every required copy: no `copy-check` issue; `copyCheck.missing` is `[]`.
- [ ] `plan-copy: (c)` — `--plan` on the `plan-merge-lanes` fixture (no config): `copyCheck` is null and no `copy-check` issue exists.
- [ ] `plan-copy: (d)` — in (a), no `copy-check` issue and no `copyCheck.missing` entry names `skills/demo-sdlc/SKILL.md` (excluded by the rule's own `when` glob) or `skills/demo-sdlc/reference.md` (required and covered by the Files entry); every `missing` path exists in the fixture.
- [ ] `plan-copy: (e)` — `plans/dir-entry.md` lists `./docs/skills/`, `site/`, `./skills/demo-sdlc/SKILL.md` and `skills/demo-sdlc/reference.md`: no `copy-check` issue and `copyCheck.missing` is `[]` (the directory entries cover `docs/skills/demo-sdlc.md`, `site/skills/demo-sdlc.md` and `site/skills-meta.ts`; the `./`-prefixed trigger is normalised and still fires the rule).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-copy:"` passes, and the same with `--filter-pattern "plan-merge:"` still passes.

**Contract:**
- shape (code): CLI flag delta of `plan.js merge-lanes`:

  | Flag | Type | Default | Effect |
  |---|---|---|---|
  | `--plan <path>` | string | unset | Read the plan and `plan.copyRules` (`readSection(resolveSdlcRoot(), 'plan')`); run `requiredCopies(text, rules, process.cwd())`; unreadable file → usage error (exit 1) |

  Changes:

  ```diff
  - *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run]
  + *   node plan.js merge-lanes --dir <iterDir> [--lanes <csv>] [--lenses <csv>] [--no-guardrails] [--gate-a <path>] [--inventory <path>] [--carry <prevIterDir>] [--g17-not-run] [--plan <path>]
  -  'merge-lanes': ['dir', 'lanes', 'lenses', 'no-guardrails', 'gate-a', 'inventory', 'carry', 'g17-not-run'],
  +  'merge-lanes': ['dir', 'lanes', 'lenses', 'no-guardrails', 'gate-a', 'inventory', 'carry', 'g17-not-run', 'plan'],
  ```

  `mergeLanes({ ..., copyCheck = null })`: when `copyCheck` is non-null, push before the dedup at `plan-critique.js:717`:

  ```js
  // one per missing copy
  { gateId: null, taskRef: null, severity: 'error', blocking: true, lane: 'copy-check',
    message: `${m.path} is a required copy that no task lists under Files (plan.copyRules[${m.rule}], trigger ${m.trigger})` }
  // one per validateCopyRules error
  { gateId: null, taskRef: null, severity: 'warning', blocking: false, lane: 'copy-check', message: `${err} — rule skipped` }
  ```

  and return `copyCheck: { rules, missing }`, where `rules` is the number of valid rules and `missing` is the `covered: false` subset of `requiredCopies(...)` mapped to `{ path, rule, trigger }` (null when there is no `--plan` or no `plan.copyRules`).

  Fixture `.sdlc/config.json`:

  ```json
  { "plan": { "copyRules": [ {
    "when": ["skills/{skill}/SKILL.md", "docs/specs/{skill}.md"],
    "require": ["docs/skills/{skill}.md", "site/skills/{skill}.md", "site/skills-meta.ts", "skills/{skill}/*.md"]
  } ] } }
  ```

  `iter/lens-all.json`: `{"status":"Approved","issues":[],"recommendations":[],"traceability":[]}`. Each plan fixture holds `### Task 1:` blocks with `**Files:**` lists only. Cases run `merge-lanes --dir {{project_root}}/iter --lanes "" --lenses all --plan {{project_root}}/plans/<file>` with `script_cwd: "{{project_root}}"`. The case shape mirrors `plan-merge: --no-guardrails synthesizes the guardrail payload` at `plan-prepare-exec.yaml:806-815`.
- names: `--plan`, `copyCheck`, lane `copy-check`, case prefix `plan-copy:`.
- mirror: `runG17Prepare`'s `--plan` read at `plan.js:373-388`; issue pushes at `plan-critique.js:683`.
- decisions: KD3; Deviations rows 1–2.
- sync: spec R67(a) (Task 1) names the same flag and output field.

### Task 6: setup-sdlc validates plan.copyRules

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/setup.js` — emit `copyRules` (P-copyRules)
- Test: `tests/promptfoo/datasets/setup-prepare-exec.yaml` — two `setup-copy-rules:` cases
- Test: `tests/promptfoo/fixtures-fs/project-setup-copy-rules/.sdlc/config.json`
- Test: `tests/promptfoo/fixtures-fs/project-setup-copy-rules/docs/specs/demo-sdlc.md`

**Notes:** Brief: F-plan-copyrules-config-surface-3, -4, -9. `setup.js` only calls `validateCopyRules(rules, projectRoot)` from Task 4, so the validation and the copy check share one matcher (`dry`). merge-lanes calls the same function without `cwd` and so gets no warnings. One fixture holds three rules (valid, matches nothing, invalid glob), so two cases cover every outcome.

**Acceptance criteria:**
- [ ] `setup-copy-rules: (a)` — fixture `project-setup-copy-rules`: `copyRules.rules === 3`; `errors` has exactly one entry, starting `plan.copyRules[2]`; `warnings` has exactly one entry, starting `plan.copyRules[1]`.
- [ ] `setup-copy-rules: (b)` — fixture `project-setup-empty` (no key): `copyRules === null`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "setup-copy-rules:"` passes.

**Contract:**
- shape (code): `setup.js` prepare output gains

  ```json
  "copyRules": { "rules": 3, "errors": ["plan.copyRules[2]: invalid glob \"a/***\""], "warnings": ["plan.copyRules[1]: no file matches its when globs"] }
  ```

  computed by `validateCopyRules(rules, projectRoot)` from `plan-parse.js`, where the optional second argument adds the `warnings` list (an invalid rule gets no warning). `null` when `plan.copyRules` is absent. Fixture config: `{ "schemaVersion": 4, "plan": { "copyRules": [ { "when": ["docs/specs/{skill}.md"], "require": ["docs/skills/{skill}.md"] }, { "when": ["nowhere/{skill}.md"], "require": ["x/{skill}.md"] }, { "when": ["a/***"], "require": ["b"] } ] } }`.
- names: `copyRules`, case prefix `setup-copy-rules:`.
- mirror: `setup-prepare:` cases at `setup-prepare-exec.yaml:6-15` (`script_cwd`, `project_root`).
- decisions: Deviations row 6.
- sync: spec P-copyRules (Task 2).

### Task 7: plan-sdlc skill prose and sentinel

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — Step 3 merge-lanes command adds `--plan`; R71 rule line names the script part
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — the merged re-dispatch merge passes `--plan`
- Test: `tests/promptfoo/scripts/check-plan-lens-sentinels.js` — SKILL.md sentinel `plan.copyRules`

**Notes:** Brief: F-required-copies-derivation-and-merge-lanes-7, -8. The three existing sentinel strings stay in their files. The user doc page, its site copy and `skills-meta.ts` are changed in Task 12. Companions checked that need no change: `agents/plan-lens-risk.md` and `agents/plan-reviewer.md` (their model part of R71(d) is unchanged), `plan-format-reference.md`, `plan-template-default.md`, `openspec-flow.md`, `state-format.md` (none describes merge-lanes flags or the copy rule).

**Acceptance criteria:**
- [ ] SKILL.md Step 3 block reads `node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "<lane names, comma-separated>" [--no-guardrails] --plan "<PLAN_PATH>" > "<ITER_DIR>/merged.json"`.
- [ ] The SKILL.md R71 decomposition rule gains: "When `plan.copyRules` is set, Step 3's `merge-lanes --plan` reports each required copy missing from every task's **Files:** as a blocking issue; a Notes mention does not count; list such a copy in a task that also changes another file (implements R71)."
- [ ] In `review-loop.md`, the **Merge:** bullet of the merged re-dispatch passes `--plan "<PLAN_PATH>"` (diff below); the lens-only merge command (the `--lanes ""` block) is unchanged, because that merge reads only `lens`.
- [ ] `check-plan-lens-sentinels.js` requires `plan.copyRules` in SKILL.md in addition to the existing strings.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-sdlc/lens-sentinels:"` passes; `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): SKILL.md command delta:

  ```diff
  -node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "<lane names, comma-separated>" [--no-guardrails] > "<ITER_DIR>/merged.json"
  +node "<PLUGIN_ROOT>/scripts/skill/plan.js" merge-lanes --dir "<ITER_DIR>" --lanes "<lane names, comma-separated>" [--no-guardrails] --plan "<PLAN_PATH>" > "<ITER_DIR>/merged.json"
  ```

  `review-loop.md` **Merge:** bullet delta (the text around the change):

  ```diff
  -…(either may be `""`), `--no-guardrails` exactly as in Step 3, `--carry "<critiqueDir>/iter-<k-1>"` unless `affectedLanes` is `["*"]`…
  +…(either may be `""`), `--no-guardrails` exactly as in Step 3, `--plan "<PLAN_PATH>"` (the copy check, R71(d)), `--carry "<critiqueDir>/iter-<k-1>"` unless `affectedLanes` is `["*"]`…
  ```

  Sentinel delta:

  ```diff
  -const skill = has('skills/plan-sdlc/SKILL.md', ['(implements R71)', USERS]);
  +const skill = has('skills/plan-sdlc/SKILL.md', ['(implements R71)', USERS, 'plan.copyRules']);
  ```
- names: `--plan`, `plan.copyRules`.
- mirror: the `--no-guardrails` sentence at `SKILL.md:347`.
- decisions: Deviations rows 1–2.
- sync: spec R71(d) (Task 1); user docs (Task 12).

### Task 8: setup-sdlc skill prose and docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/setup-sdlc/SKILL.md` — context summary prints `copyRules.errors` and `copyRules.warnings` (implements R28)
- Modify: `docs/skills/setup-sdlc.md` — mention the validation
- Modify: `site/src/content-source/skills/setup-sdlc.md` — byte copy (`cp`)

**Notes:** Brief: F-plan-copyrules-config-surface-8. Copies checked that need no change: `site/src/data/skills-meta.ts` setup-sdlc entry (no node describes config validation) and the 7 companions (`dimension-catalog.md`, `setup-dimensions.md`, `setup-guardrails.md`, `setup-openspec.md`, `setup-plan-template.md`, `setup-pr-labels.md`, `setup-pr-template.md`): none reads `plan.*` keys other than guardrails.

**Acceptance criteria:**
- [ ] SKILL.md Step 0 gains the **Copy rules report** block below, placed directly after the **Outdated CI scripts warning** block and before **Flag routing**.
- [ ] `docs/skills/setup-sdlc.md` Prerequisites gains the bullet below; the site copy is byte-identical (`cmp` exits 0).
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): audience — the setup-sdlc model (SKILL.md) and end users (doc page). SKILL.md insertion, after the paragraph that ends `This is a report-only warning (mirrors version-sdlc Step 7.5 pattern).`:

  ```markdown
  **Copy rules report:** When `prepare.copyRules` is non-null, print each `prepare.copyRules.errors[]` entry as `ERROR: <message>` and each `prepare.copyRules.warnings[]` entry as `WARNING: <message>`, once each, in order. Do not edit `plan.copyRules` and do not block the rest of setup. <!-- implements R28 -->
  ```

  `docs/skills/setup-sdlc.md` `## Prerequisites` delta:

  ```diff
   - Must be inside a git repository
   - Node.js >= 16 (for `scripts/skill/setup.js`)
  +- Optional: `plan.copyRules` in `.sdlc/config.json` (copy rules for the plan-sdlc copy check). setup-sdlc reports an invalid glob as an error and a rule whose `when` globs match no file as a warning; it does not edit the key. See [plan-sdlc](plan-sdlc.md).
  ```
- names: `copyRules`, R28.
- mirror: the **Outdated CI scripts warning** block in setup-sdlc SKILL.md Step 0 (report-only, no block).
- decisions: Deviations row 6.
- sync: site copy via `cp`.

### Task 9: Dogfood rule set in .sdlc/config.json

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2
**Verify:** build

**Files:**
- Modify: `.sdlc/config.json` — add `plan.copyRules`

**Notes:** Brief: F-plan-copyrules-config-surface-6; F-skill-copy-surface-inventory-4, -5. This is the plugin's own dogfooding (`project-agnostic` guardrail allows it). Other projects are unaffected: no key means no check.

**Acceptance criteria:**
- [ ] `plan.copyRules` equals the rendered value; `plan.guardrails` is unchanged.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-guardrails.js` exits 0.

**Contract:**
- shape (code): config delta inside `plan`:

  ```json
  "copyRules": [
    {
      "when": ["plugins/sdlc-utilities/skills/{skill}/SKILL.md", "docs/specs/{skill}.md"],
      "require": [
        "docs/skills/{skill}.md",
        "site/src/content-source/skills/{skill}.md",
        "site/src/data/skills-meta.ts",
        "plugins/sdlc-utilities/skills/{skill}/*.md"
      ]
    }
  ]
  ```
- names: `plan.copyRules`.
- mirror: `plan.guardrails` block in `.sdlc/config.json`.
- decisions: KD2 (SKILL.md excluded by the `when` rule).
- sync: schema (Task 2).

### Task 10: ship.js final-check open findings and exec case

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 3, Task 4
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — `open` on finalCheck, early `done` under `--auto`
- Modify: `tests/promptfoo/scripts/run-ship-stepper.js` — `--final-summary <file>` and `--review-threshold <t>` options
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — case (f), case (a) assertion on `open`
- Test: `tests/promptfoo/fixtures-fs/review-summaries/medium-1.comment.md`

**Notes:** Brief: F-ship-final-check-open-handoff-2, -3, -4, -6, -10, -11. High risk: this changes the state machine. The harness default for the final summary is `approved-0.json`, so cases (a), (b), (d) and (e) keep reaching `dispatch_version` even with `--summary high-1.json`. The stop reuses `pendingStop`'s persistence pattern so `--resume` works without new resume code.

**Acceptance criteria:**
- [ ] `afterFixesCommitted` creates `finalCheck = { base, commit, status: 'pending', verdict: null, open: [] }`.
- [ ] On the completing `--after dispatch_review`, `open` is computed once: `[]` when the review gate (`reviewGateDecision(ledger)`) does not meet `flags.reviewThreshold`; otherwise the comment findings (`commentCopyPath`, else `commentPath`) whose severity rank is at or above the threshold rank (`critical > high > medium > low`; `null` severity is never included), as `{ id, severity, path }`; and when that list is empty, `[{ id: null, severity: <the highest severity whose count is above 0>, path: null }]`. A repeated result changes nothing (case (d) still passes).
- [ ] Under `--auto` with `open` non-empty, the call returns `done` with `ext.reason: 'final-check-open'`; without `--auto`, or with `open` empty, the next step is the same as today (`dispatch_version` in the stepper scenario).
- [ ] `ship-final-check: (f)` — `--scenario rounds-final-check --seed frozen --summary high-1.json --final-summary medium-1.json --review-threshold medium`: the envelope after the final review is `done` with `ext.reason === 'final-check-open'`, `ext.summary.finalCheck.open` deep-equals `[{ id: 'F1', severity: 'medium', path: 'src/widget.js' }]`, `ext.commands` deep-equals `['/sdlc:ship-sdlc --resume --auto']`, and the ledger still exists.
- [ ] Case (a) also asserts `f.open` deep-equals `[]` (the clean final check).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "ship-final-check:"` passes.

**Contract:**
- shape (code): `ship.js` change at the R95 block:

  ```diff
     if (after === 'dispatch_review' && ledger.finalCheck) {
       if (ledger.finalCheck.status === 'pending') {
         ledger.finalCheck.status = 'completed';
         ledger.finalCheck.verdict = (output.artifacts && output.artifacts.verdict) ?? null;
  +      ledger.finalCheck.open = finalCheckOpen(ledger); // R95
  +      if (flags.auto && ledger.finalCheck.open.length > 0) return finalCheckStop(); // R95: hand off to the caller
       }
       from = 'dispatch_commit_fixes';
     }
  ```

  ```js
  /** R95: open findings of the final check, at or above flags.reviewThreshold. Never throws. */
  function finalCheckOpen(ledger) {
    // d = reviewGateDecision(ledger); if (!d.met) return [];
    // text = read d.commentCopyPath || d.commentPath (try/catch → '');
    // rows = parseReviewComment(text) filtered to severity rank >= threshold rank, mapped to { id, severity, path };
    // return rows.length ? rows : [{ id: null, severity: <highest severity with a count > 0>, path: null }];
  }
  ```

  `finalCheckStop` sets `ledger.paused = { at, reason: 'final check open' }` and returns `finish(createEnvelope('done', null, { ext: { ...ext, reason: 'final-check-open', summary: buildSummary(ledger), commands: ['/sdlc:ship-sdlc --resume --auto'] }, stateFile: ledgerPath, progress: progress() }))`. Import `parseReviewComment` from `./received-review`.

  Harness options:

  | Option | Effect |
  |---|---|
  | `--final-summary <file>` | In `rounds-*`, when the emitted `dispatch_review` invocation has `--committed --base`, write `review-summaries/<file>` (default `approved-0.json`) instead of `--summary`; when `review-summaries/<name>.comment.md` exists, copy it beside the summary and set `commentCopyPath` |
  | `--review-threshold <t>` | Seed `data.flags.reviewThreshold = t` |

  `medium-1.comment.md`:

  ```markdown
  ## Code Review

  #### [MEDIUM] Missing input check
  **File:** `src/widget.js:12`
  The widget accepts an empty name.
  **Suggestion:** Reject an empty name.
  ```
- names: `finalCheckOpen`, `finalCheckStop`, `finalCheck.open`, `final-check-open`, `--final-summary`, `--review-threshold`.
- mirror: `pendingStop` at `ship.js:2596-2609`; case (a) at `ship-prepare-exec.yaml:5638-5660`; `writeSummary` at `run-ship-stepper.js:398-414`.
- decisions: KD5; Deviations rows 3–5.
- sync: spec R95 (Task 3); `buildSummary` (`ship.js:1938`) already passes `finalCheck` through.

### Task 11: ship-sdlc skill prose and docs

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 10
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — done handling for `final-check-open`; 3b row prints open findings (implements R95)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/state-format.md` — `finalCheck` shape gains `open`
- Modify: `docs/skills/ship-sdlc.md` — final fix review paragraph
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp`)

**Notes:** Brief: F-ship-final-check-open-handoff-8, -9. The ship `final-check` node of `skills-meta.ts` is changed in Task 12 (KD6). Companions checked that need no change: `config-format.md` (no new config key), `entry-modes.md` (no new entry mode), `openspec-steps.md` (no OpenSpec change) and `reference.md` (grep at HEAD finds no `finalCheck` or `R95` text).

**Acceptance criteria:**
- [ ] SKILL.md done handling (Step 5 loop, item 2) matches the diff below.
- [ ] SKILL.md 3b row and its print rule match the diff below.
- [ ] `state-format.md` `finalCheck` row matches the diff below.
- [ ] `docs/skills/ship-sdlc.md` final fix review paragraph matches the diff below; the site copy is byte-identical (`cmp` exits 0).
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` and `node .claude/skills/validate-plugin-consistency/check-consistency.js` exit 0.

**Contract:**
- shape (docs): MODIFY four prose files. SKILL.md done-handling delta:

  ```diff
  -`pending-question` → print `ext.pendingQuestion.prompt` with its options, then each line of `ext.commands` in order, and stop; anything else → Step 6 with `ext.summary`.
  +`pending-question` → print `ext.pendingQuestion.prompt` with its options, then each line of `ext.commands` in order, and stop; `final-check-open` → Step 6 with `ext.summary`, then print each `ext.summary.finalCheck.open` entry as `[<severity>] <path> (<id>)` and each line of `ext.commands`, and stop (implements R95); anything else → Step 6 with `ext.summary`.
  ```

  SKILL.md summary block and print rule:

  ```diff
  -3b    review-sdlc (final)   [done] <verdict> on <short sha>
  +3b    review-sdlc (final)   [done] <verdict> on <short sha>[ — <n> open finding(s) at or above <threshold>]
  -Print the 3b row only when `ext.summary.finalCheck` is non-null.
  +Print the 3b row only when `ext.summary.finalCheck` is non-null. Add the bracketed part only when `finalCheck.open` is non-empty, with `<n>` its length (implements R95).
  ```

  `state-format.md` `finalCheck` row (field diff):

  ```diff
  -| `finalCheck` | object \| absent | `{ base, commit, status, verdict }` on the ledger (spec R95): … Its findings start no new round; the summary reports it as `finalCheck`. |
  +| `finalCheck` | object \| absent | `{ base, commit, status, verdict, open }` on the ledger (spec R95): … `open` is `[]` until the check completes, then the findings at or above `reviewThreshold` as `[{ id, severity, path }]` (`id: null` when the comment gave none). Its findings start no new round; the summary reports it as `finalCheck`; under `--auto` a non-empty `open` ends the run with `reason: "final-check-open"`. |
  ```

  `docs/skills/ship-sdlc.md` paragraph:

  ```diff
  -…Its findings start no new round and appear in the summary as `finalCheck` (row `3b`, printed only when a final check ran). A fix commit…
  +…Its findings start no new round and appear in the summary as `finalCheck` (row `3b`, printed only when a final check ran). Findings at or above `reviewThreshold` are listed in `finalCheck.open` as `{ id, severity, path }`. Under `--auto`, open findings stop the run before version and PR with `reason: final-check-open`: fix and commit them, then run `/sdlc:ship-sdlc --resume --auto`. A fix commit…
  ```
- names: `final-check-open`, `finalCheck.open`.
- mirror: `docs/skills/ship-sdlc.md:257`; `state-format.md:49`; `SKILL.md:269`, `:330`, `:349`.
- decisions: KD5, KD6.
- sync: site copy via `cp`.

### Task 12: plan-sdlc user docs and site metadata

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7, Task 10
**Verify:** manual

**Files:**
- Modify: `docs/skills/plan-sdlc.md` — Step 3 paragraph and Prerequisites name `plan.copyRules`
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp`)
- Modify: `site/src/data/skills-meta.ts` — plan-sdlc `critique-plan` node and ship-sdlc `final-check` node descriptions
- Create: `docs/plans/2026-11-13-lean-w10-copy-check-handoff.md`

**Notes:** Brief: F-ship-final-check-open-handoff-9; F-skill-copy-surface-inventory-3. `skills-meta.ts` is edited only here, for both skills, so no two tasks share it (KD6). The plan file is listed so ship stages it (project rule).

**Acceptance criteria:**
- [ ] `docs/skills/plan-sdlc.md` Step 3 paragraph and Prerequisites match the diffs below; the site copy is byte-identical (`cmp` exits 0).
- [ ] The two `skills-meta.ts` descriptions match the diffs below.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): `docs/skills/plan-sdlc.md` Step 3 paragraph (line 81), the sentence after the merge:

  ```diff
  -…Step 3 completes only after **every dispatched lane has returned** (JOIN barrier), and `plan.js merge-lanes` merges the results. Notable gates:…
  +…Step 3 completes only after **every dispatched lane has returned** (JOIN barrier), and `plan.js merge-lanes` merges the results. When `.sdlc/config.json` sets `plan.copyRules`, `merge-lanes --plan` also reports every required copy (for example a skill's doc page, its site copy and its companion files) that no task lists under **Files:** as a blocking issue. Notable gates:…
  ```

  Prerequisites gains one bullet: ``- Optional: `plan.copyRules` in `.sdlc/config.json` — `{ when, require }` glob rules with a `{skill}` capture for the copy check (see setup-sdlc R28). Without it there is no script copy check.``

  `skills-meta.ts`:

  ```diff
  -{ id: 'critique-plan', label: 'Self-critique plan', type: 'critique', description: 'Runs validate-plan-format.js (G3, G4, G10, G12) and g17-prepare, dispatches the gate lanes in parallel, and …
  +{ id: 'critique-plan', label: 'Self-critique plan', type: 'critique', description: 'Runs validate-plan-format.js (G3, G4, G10, G12) and g17-prepare, dispatches the gate lanes in parallel, checks plan.copyRules copies, and …
  -… findings start no new round and appear in the summary as finalCheck (R95)' },
  +… findings start no new round and appear in the summary as finalCheck; findings at or above the threshold are listed in finalCheck.open, and under --auto the run stops for a hand-off (R95)' },
  ```
- names: `plan.copyRules`, `finalCheck.open`.
- mirror: `docs/skills/plan-sdlc.md:81`, `:384` (Prerequisites); `site/src/data/skills-meta.ts:39`, `:97`.
- decisions: KD6.
- sync: site copy via `cp`.

## Final Shape

When all tasks are done:

- A project can set `plan.copyRules` in `.sdlc/config.json`. This repository sets one rule: a change to a skill's `SKILL.md` or spec requires its doc page, the site copy, `skills-meta.ts` and the skill's companion `.md` files in the plan's Files.
- plan-sdlc's Step 3 passes `--plan` to `merge-lanes`. Each missing copy becomes one blocking issue that names the path, the rule and the trigger. Plan review can no longer approve a plan that forgets a copy.
- setup-sdlc reports invalid copy-rule globs as errors and rules that match no file as warnings.
- received-review's fix scope and the copy check share one path normalisation in `plan-parse.js`.
- Ship's final fix review fills `finalCheck.open`. Under `--auto`, open findings stop the run before version and PR with `reason: 'final-check-open'` and a resume command. The caller fixes, commits and resumes. A clean final check behaves exactly as before.
- `skills-meta.ts` describes both changes (one task edits it).
- New exec cases: five `plan-copy:`, two `setup-copy-rules:`, and `ship-final-check: (f)`. The lens sentinel also checks the script part of R71.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 0 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Re-verify both items at HEAD 44510f2 with file:line evidence | — | covered |
| 2 plan.copyRules config key, schema, setup-sdlc spec id, setup validation | Task 2, Task 4, Task 6, Task 8 | covered |
| 3 Repo rule set in .sdlc/config.json | Task 9 | covered |
| 4 Shared requiredCopies derivation in plan-parse.js | Task 4 | covered |
| 5 merge-lanes blocking issue per missing copy, no new gate | Task 5 | covered |
| 6 Amend R71(d); received-review R28 history row | Task 1 | covered |
| 7 Exec cases for merge-lanes copy check; update sentinel | Task 5, Task 7 | covered |
| 8 Check unchanged copy does not trip execute E9 / --strict-files | Task 1 | covered |
| 9 Amend ship R95: finalCheck.open and final-check-open done reason | Task 3, Task 10 | covered |
| 10 Document item 9 in ship SKILL.md, docs and site copy | Task 11, Task 12 | covered |
| 11 ship-prepare exec case for final-check open vs clean | Task 10 | covered |
| 12 Out of scope items | — | covered |

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
