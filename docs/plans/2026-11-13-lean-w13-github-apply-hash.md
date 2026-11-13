# github-sdlc apply hash gate Implementation Plan

**Commit:** `fix(#9374): github-sdlc - apply refuses a write without the hash`
**Goal:** Make the github-sdlc script refuse every real `--apply` that carries no `--expect-hash`, so the write approval no longer rests on the model alone (spec R36).
**Architecture:** One fail-closed check at the top of `apply()` in `skill/github.js`, before authentication and before any `gh` call; `--dry-run` stays hash-free and `--auto` needs the hash too. The spec (A12, R36, P13) states the rule first; the exec cases pass the hash through a new per-run harness token; the skill prose and the user doc say the hash is always passed.
**Source:** docs/specs/github-sdlc.md (R36, A12, P13); post-merge Opus audit of PRs #74-#88, finding MEDIUM-1 (todo #9374)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/apply"`

---

## Context

**What problem does this change solve?**

- The github-sdlc skill writes to GitHub only through one script, `plugins/sdlc-utilities/scripts/skill/github.js`.
- Its `--apply` subcommand checks the payload hash (a sha256 digest of the approved payload) only when the caller passes `--expect-hash`.
- So `--apply --input p.json`, with no hash and no `--auto`, runs every write.
- A model that skips the approval gate, or anyone who calls the script directly, can write freely.
- Spec R36 says "the approval does not rest on the model alone". Today it does.

**What prompted this change now?**

- The post-merge audit of PRs #74-#88 (2026-11-13) logged this as MEDIUM-1 (todo #9374).
- The audit's cross-skill note: a gate a script claims to enforce must fail closed when its token is absent.

**What does success look like?**

- A real `--apply` without `--expect-hash` exits 1 with `errors: ["--apply requires --expect-hash"]` and makes no `gh` call, with and without `--auto`.
- `--apply --dry-run` still runs without a hash.
- Every exec case that runs a real `--apply` passes the hash; new cases lock in the refusal and a non-dry-run mismatch.
- The spec, the skill prose, the user doc and their site copies all say the same thing.

## Research Findings

Re-verified at HEAD `1096354`:

- **The gap reproduces.** `apply()` in `plugins/sdlc-utilities/scripts/skill/github.js:1758-1767` computes `hash` and returns early only `if (expectHash && hash !== expectHash)` (F-apply-auto-hash-check-placement-1). A missing hash falls through to `ctx.authenticate()` and the writes.
- **`--auto` does not close the gap.** The `if (auto && !check.autoApprovable)` refusal at `github.js:1782` runs after authentication and only checks the R34 class (F-apply-auto-hash-check-placement-2). The safety carve-outs (mentions, duplicate marker, duplicate close, cross-repo refs, account switch) live in `checkPayload` and stay untouched.
- **`parseArgs` only checks the digest format** (`github.js:220-226`); it knows no per-subcommand rules (F-apply-auto-hash-check-placement-3). `--dry-run` cases pass no hash and run no write (F-apply-auto-hash-check-placement-4).
- **The exec harness.** `APPLY_HARNESS` in `tests/promptfoo/datasets/github-sdlc-exec.yaml:2030-2057` runs one `run-github-case.js` per comma-separated payload key. Its `@HASH:<key>@` token always resolves to one fixed key, so a multi-key case cannot give each run its own hash (F-apply-exec-cases-hash-harness-1).
- **The brief named four exec cases; there are fifteen.** Every real (non-dry-run) `--apply` case except the R36 C2 `--auto` create case (about line 2133, which passes `@HASH:create@`) passes no hash: the cases at about lines 2073, 2094, 2152, 2175, 2218, 2241, 2305, 2327, 2354, 2377, 2400, 2426, 2450, 2474 (nine keys) and 2498 (F-apply-exec-cases-hash-harness-2). The `--dry-run` cases (2023, 2113, 2197, 2263, 2284) need no change.
- **A mismatch case exists** at about line 2110, but it runs under `--dry-run`. No refusal case exists (F-apply-exec-cases-hash-harness-3).
- **The skill already passes the hash.** `plugins/sdlc-utilities/skills/github-sdlc/write-ops.md:157-165` always runs `--apply ... --expect-hash '<PAYLOAD_HASH>'`, also under `--auto` (F-apply-hash-semantics-doc-copies-5). `SKILL.md` never names the flag, and its E7 retry row runs `--apply once` without saying which hash.
- **Spec and doc copies.** `docs/specs/github-sdlc.md` A12 (line 32) says "(default: none)", R36 (line 150) makes the hash a skill rule only, and P13 (line 176) shows `[--expect-hash <h>]` as optional (F-apply-hash-semantics-doc-copies-1..3). The script header (`github.js:11`, `:26`) and the `apply()` JSDoc also show it as optional (F-apply-hash-semantics-doc-copies-4). `docs/skills/github-sdlc.md` has no `--apply` text; its Overview and "What It Creates or Modifies" rows describe approval (F-apply-hash-semantics-doc-copies-6).
- **Site copies.** `site/src/content-source/specs/github-sdlc.md` and `site/src/content-source/skills/github-sdlc.md` are byte copies of the two docs (`diff -q` is empty at HEAD).
- **Out of scope, no change.** `tests/promptfoo/datasets/headless-github.yaml:105` already asserts `--expect-hash` and `--auto` on the apply call (F-apply-exec-cases-hash-harness-4). No other dataset and no other skill calls `github.js --apply`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Exec cases to update | no | updates all 15 real `--apply` cases that lack a hash, not only the 4 the brief named | the new refusal breaks every real `--apply` case without a hash; the brief's list was a sample |
| Harness token | no | adds a per-run `@HASH@` token beside `@HASH:<key>@` | the nine-key case at about line 2474 needs one hash per run; a fixed-key token cannot do it |
| Mismatch case | no | adds a non-dry-run mismatch case | the existing mismatch case runs under `--dry-run`, so no case proved a real write refuses a stale hash |
| Spec id | no | edits A12, R36 and P13 in place; no new id | R36 already owns "script-enforced approval"; the fix makes the script meet it |
| PR issue link | no | names `#9374` in the PR body with no `Fixes`/`Closes` keyword | `#9374` is an internal register id, not a GitHub issue (project note); the `pr-link-github-issue` guardrail does not apply |
| Extra copies | no | Task 3 edits `operations-reference.md` and Task 4 edits `site/src/data/skills-meta.ts` | the project's `plan.copyRules` require them when the spec changes; each gets a one-line truthful update |
| Plan file under Files | no | Task 4 lists `Create:` for this plan file | ship stages only files named in the plan (project note) |
| `--auto` and the hash | no | requires the hash under `--auto` too | R36 already says the skill passes the hash of the auto-approved `--check-payload` run; the headless case asserts it |

### Decisions taken without the owner

- The refusal lives in `apply()`, not in `parseArgs()` (see Key Decisions).
- `--auto` does not replace the hash; both are required for an auto-approved write.
- `--dry-run` stays hash-free, because it runs no write and the approval view needs its output before a hash exists in the user's view.
- The refusal output carries `payloadHash`, like the mismatch refusal, so a caller can see the current hash.

## Key Decisions

- **Check in `apply()` over a `parseArgs()` rule.** `apply()` already holds the mismatch check, and `done()` gives the refusal the full result shape (`applied`, `hashMismatch`, ...). `parseArgs()` knows no per-subcommand rules. The check sits before `ctx.authenticate()`, so no `gh` call runs.

- **Hash required with and without `--auto`.** `--auto` only says "this class needs no question" (R34). The hash proves which payload was checked. Dropping it under `--auto` would reopen the same gap for comments and closes.

- **`--dry-run` stays free.** A dry run makes no write. The skill runs it to build the approval view.

- **A new harness token `@HASH@` over listing the hash per key.** One token keeps every case one line long. The fixed-key `@HASH:<key>@` stays for the mismatch cases, where a run must carry another payload's hash.

- **Edit R36 in place over a new id.** The rule is the same contract ("approval does not rest on the model alone"); only its script half was missing. Ids are never renumbered; a dated row in the appendix records the change.

- **Root problem in one sentence.** The script trusts the model to pass the approval hash, so a missing hash silently turns the approval gate off.

- **Who fails if this ships wrong.** A GitHub user whose repository gets an unapproved issue write (a comment, close or create they never saw), and every github-sdlc caller (a run whose `--apply` the script now refuses would stop with exit 1).

- **Smallest viable cut.** Task 2 alone closes the hole. Task 1 is required by the spec-first rule. Tasks 3 and 4 are one-line prose edits that keep the skill, the user doc and the site true (two of the files are required copies under `plan.copyRules`); they add no behaviour.

- **Non-goals (intentionally not built).**
  - No change to the R34 auto-approvable class or its safety carve-outs.
  - No new flag, no new spec id, no change to `--check-payload` or `--dry-run`.
  - No change to jira-sdlc (R21 there removed its hash gate on purpose), ship-sdlc or review-sdlc.
  - No other audit finding, no live GitHub write, no headless, behavioural or `claude -p` run; `tests/promptfoo/datasets/headless-github.yaml` already asserts the hash and is not touched.

- **Guardrail notes.** No new CLI flag is added (`--expect-hash` exists), so `flag-semantic-consistency-cross-skill` needs no grep evidence. The change writes no state file and reads no config, so it behaves the same under `ship.workspace=branch` and `worktree`. `#9374` is an internal register id, not a GitHub issue: the PR body names it with no `Fixes`/`Closes` keyword.

## Contract Examples

Code (Task 2):

```markdown
**Contract:**
- shape (code): `apply(input, { dryRun, expectHash, auto }, ctx)` returns `{ data, exitCode }`; new first check `!dryRun && !expectHash` → exit 1, `errors: ['--apply requires --expect-hash']`, no `ctx.authenticate()` call.
- names: `apply`, `expectHash`, `dryRun`, error text `--apply requires --expect-hash`.
- mirror: the mismatch refusal at `plugins/sdlc-utilities/scripts/skill/github.js:1764-1767`.
- decisions: Key Decisions "Check in apply()" and "Hash required with and without --auto".
- sync: spec R36 and P13 (Task 1) state the same error text.
```

Docs (Task 4):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/github-sdlc.md` Overview; append one sentence after "...run without asking."; audience: end users.
- names: no new heading.
- mirror: the Overview sentence style at `docs/skills/github-sdlc.md:5`.
- decisions: user-facing words only; no flag names.
- sync: `site/src/content-source/skills/github-sdlc.md` is a byte copy.
```

Openspec / spec (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY A12, R36 (text and acceptance) and P13 in `docs/specs/github-sdlc.md`; ADD one Decisions row and one Issue trail row in the appendix; no new id.
- names: A12, R36, P13.
- mirror: requirement style at `docs/specs/github-sdlc.md:150`.
- decisions: Key Decisions "Edit R36 in place".
- sync: `site/src/content-source/specs/github-sdlc.md` byte copy; Task 2 error text.
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds 3 exec cases and updates the 15 existing real --apply cases that lack a hash |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | One targeted exec-only promptfoo run with a filter; no retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks stay within the hash-gate fix; non-goals listed |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; the script change and its tests are bundled with stated reason |
| scripts-over-llm-logic | error | PASS | Enforcement is moved into the script (apply()); the prose only documents it |
| yagni | warning | PASS | No new flag or speculative abstraction; the @HASH@ token is needed by the nine-key case |
| cross-skill-consistency | error | PASS | Checked jira-sdlc, ship-sdlc, review-sdlc and the headless dataset; no change needed |
| pr-link-github-issue | error | PASS | #9374 is an internal register id, not a GitHub issue; the PR body names it, with the rationale recorded |
| dry | warning | PASS | Error text is shared across tasks; the harness token reuses payloadHash |
| kiss | warning | PASS | A single early-return check in apply() |
| spec-first | error | PASS | Task 1 updates the spec before Tasks 2 and 3 |
| project-agnostic | error | PASS | Change is in plugin script and skill files, which ship to consumers |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag gating introduced |
| no-opposite-logical-vectors | error | PASS | The hash requirement is phrased consistently: required unless --dry-run |
| flag-resolution-single-source | warning | PASS | Single resolution and check site in apply() |
| state-premise | error | PASS | Root problem stated in one sentence in Key Decisions |
| smallest-viable-cut | warning | PASS | Smallest cut identified; Tasks 1 and 3 justified |
| failure-audience | warning | PASS | GitHub users and github-sdlc callers named |
| explicit-non-goals | warning | PASS | Non-goals list present |
| ambiguity-stops-and-asks | error | PASS | Choice of apply() over parseArgs() recorded in Key Decisions with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is changed |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag; --expect-hash already exists |
| workspace-mode-compatibility | error | PASS | No state or config touched; plan states mode-independent behaviour |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 changes `apply()` in `plugins/sdlc-utilities/scripts/skill/github.js` so a real `--apply` without `--expect-hash` exits 1 with `--apply requires --expect-hash`, which changes the CLI flag contract.

**Severity hint:** high

**Patch:** Add a checklist item: a CLI flag that becomes mandatory (`--expect-hash` on a real `--apply`) must fail closed with exit 1 and a stable error string before any auth or `gh` call.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add a checklist item: a CLI flag that becomes mandatory (`--expect-hash` on a real `--apply`) must fail closed with exit 1 and a stable error string before any auth or `gh` call.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Task 2 puts the missing-hash refusal in `apply()` before `ctx.authenticate()`, closing the gap where "the approval does not rest on the model alone" (R36) was not true.

**Severity hint:** high

**Patch:** Add a checklist item: an approval or authorization token (payload hash) must be enforced by the script and checked before `ctx.authenticate()`, with a missing token treated as a refusal.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Add a checklist item: an approval or authorization token (payload hash) must be enforced by the script and checked before `ctx.authenticate()`, with a missing token treated as a refusal.

### UPDATE: spec-compliance (B1)

**Why:** Task 1 edits A12, R36 and P13 in `docs/specs/github-sdlc.md` so that `--expect-hash` goes from optional to required for every real `--apply`.

**Severity hint:** high

**Patch:** Add a checklist item: when a flag's required/optional status changes, the spec's flag row and the prepare-script contract row (here A12 and P13) must change in the same PR as the requirement text (R36).

**Action (dimension):** edit `.sdlc/review-dimensions/spec-compliance.md` — Add a checklist item: when a flag's required/optional status changes, the spec's flag row and the prepare-script contract row (here A12 and P13) must change in the same PR as the requirement text (R36).

_1 additional candidates suppressed_

## Tasks

### Task 1: Spec — R36 makes the hash mandatory for a real `--apply`

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual, lint

**Files:**
- Modify: `docs/specs/github-sdlc.md` — A12, R36, P13 text; one Decisions row and one Issue trail row in the appendix
- Modify: `site/src/content-source/specs/github-sdlc.md` — byte copy of the spec (`cp docs/specs/github-sdlc.md site/src/content-source/specs/github-sdlc.md`)

**Notes:**
Implements F-apply-hash-semantics-doc-copies-1, -2 and -3. Spec first (AGENTS.md principle 1): the behaviour change cites R36 before the script changes. G7 and G10 already say the hash check "still runs and still blocks", so their text stays true and is not edited.

**Acceptance criteria:**
- [ ] A12, R36 and P13 read exactly as the Contract below; no id is renumbered or added.
- [ ] The appendix has one new Decisions row dated 2026-11-13 citing A12, R36, P13, and one new Issue trail row for R36 naming #9374.
- [ ] `diff docs/specs/github-sdlc.md site/src/content-source/specs/github-sdlc.md` prints nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY A12, R36, P13; ADD two appendix rows. Before → after:

  ```diff
  - A12: `--expect-hash <h>` — with `--apply`, the `payloadHash` the approval view showed; `--apply` refuses a payload whose hash differs (R36) (default: none).
  + A12: `--expect-hash <h>` — with `--apply`, the `payloadHash` the approval view showed; required by every `--apply` without `--dry-run`, also under `--auto`; `--apply` refuses a payload whose hash differs, and a run without the flag (R36) (default: none).
  ```

  R36 is one line. Insert one sentence after the mismatch sentence ("…on a mismatch, refuses with exit 1, `hashMismatch: true` and no `gh` call.") and append one clause to the end of R36's existing `- Acceptance: exec — …` bullet (the line after R36; keep its current text):

  ```diff
  - … `--apply --expect-hash <h>` (A12) recomputes the hash and, on a mismatch, refuses with exit 1, `hashMismatch: true` and no `gh` call. `--apply --auto` recomputes the R34 class …
  + … `--apply --expect-hash <h>` (A12) recomputes the hash and, on a mismatch, refuses with exit 1, `hashMismatch: true` and no `gh` call. `--apply` without `--dry-run` and without `--expect-hash` refuses, with and without `--auto`: exit 1, `errors: ["--apply requires --expect-hash"]`, `payloadHash` (the current hash) and no `gh` call; the gate fails closed when its token is absent, and `--apply --dry-run` needs no hash. `--apply --auto` recomputes the R34 class …
  -   - Acceptance: exec — `--check-payload` gives the same `payloadHash` … <existing text>.
  +   - Acceptance: exec — `--check-payload` gives the same `payloadHash` … <existing text>; `--apply` with no `--expect-hash` on a comment and on a create exits 1 with `errors: ["--apply requires --expect-hash"]` and an empty stub call log; the same with `--auto`; a real `--apply` with the hash of another payload exits 1 with `hashMismatch: true` and an empty stub call log; `--apply --dry-run` with no hash exits 0.
  ```

  ```diff
  - P13: `--apply --input <file> [--dry-run] [--expect-hash <h>] [--auto]` re-runs every P11 check (G7) and the R36 checks, …
  + P13: `--apply --input <file> (--expect-hash <h> | --dry-run) [--auto]` re-runs every P11 check (G7) and the R36 checks (a missing `--expect-hash` without `--dry-run` is a refusal), …
  ```

  Appendix rows:

  | Date | Source | Decision | Ids |
  |---|---|---|---|
  | 2026-11-13 | audit finding, taken on the owner's behalf | `--apply` fails closed: a real `--apply` without `--expect-hash` refuses (exit 1, no `gh` call), with and without `--auto`; `--dry-run` needs no hash. | A12, R36, P13 |

  | Id | History |
  |---|---|
  | R36 | script-side hash requirement added for todo #9374 (post-merge audit MEDIUM-1) |
- names: A12, R36, P13; error text `--apply requires --expect-hash`.
- mirror: R36 at `docs/specs/github-sdlc.md:150-151`; Decisions table at `docs/specs/github-sdlc.md:285-301`; Issue trail table at the end of the file (append the row after the `(spec)` row).
- decisions: Key Decisions "Edit R36 in place over a new id" and "Hash required with and without --auto".
- sync: Task 2 uses the same error text; Task 3 and Task 4 prose cite R36.

---

### Task 2: Script — fail-closed hash check in `apply()`; exec cases pass the hash

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — refusal at the top of `apply()`; header usage lines and `apply()` JSDoc show the hash as required unless `--dry-run`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `@HASH@` harness token; `--expect-hash @HASH@` on the 15 real `--apply` cases that lack a hash; three new cases

**Notes:**
Implements F-apply-auto-hash-check-placement-1..4, F-apply-exec-cases-hash-harness-1..3 and F-apply-hash-semantics-doc-copies-4. The script change and the exec cases ship in one task: the refusal breaks every case that runs a real `--apply` without a hash, so splitting them would leave one wave red. Run only the targeted exec command below, once at the end; no run-fix-rerun loop.

**Acceptance criteria:**
- [ ] `apply()` refuses a real `--apply` without `--expect-hash` before `ctx.authenticate()`, as in the Contract diff.
- [ ] Every non-dry-run `--apply` case in `github-sdlc-exec.yaml` passes `--expect-hash @HASH@` (or keeps its `@HASH:<key>@`), and its existing assertions are unchanged.
- [ ] Three new cases exist (refusal, refusal under `--auto`, non-dry-run mismatch) as in the Contract table.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/apply"` passes every case.

**Contract:**
- shape (code): change site in `apply()`:

  ```diff
    const done = (data, exitCode) => ({ data: { ...data, ...result }, exitCode });
    const hash = payloadHash(input);
  + if (!dryRun && !expectHash) {
  +   return done({ payloadHash: hash, warnings: [], errors: ['--apply requires --expect-hash'] }, 1);
  + }
    if (expectHash && hash !== expectHash) {
      result.hashMismatch = true;
  ```

  Header and JSDoc text:

  ```diff
  - *                  [--dry-run] [--expect-hash <h>] [--output-file [<p>]] [--skip-config-check]
  + *                  [--dry-run] [--expect-hash <h>] [--output-file [<p>]] [--skip-config-check]
  + *                  (--apply needs --expect-hash <h> unless --dry-run; R36)
  - *   --apply --input <p> [--dry-run] [--expect-hash <h>] [--auto]: re-check the payload (G7, R36) and run its
  + *   --apply --input <p> (--expect-hash <h> | --dry-run) [--auto]: re-check the payload (G7, R36) and run its
  ```

  ```diff
  - * P13 `--apply`: hash check (R36) → `--auto` class check (R36) → full checkPayload (G7) → …
  + * P13 `--apply`: missing-hash refusal unless dryRun, then hash check (R36) → `--auto` class check (R36) → full checkPayload (G7) → …
  ```

  Harness token (one line in the `&apply_harness` anchor, plus the comment block above the first case that documents the tokens):

  ```diff
  - const args = rest.map((a) => a.replace('@INPUT@', input).replace(/@HASH:([^@]+)@/, (_, k) => payloadHash(entry(k))));
  + const args = rest.map((a) => a.replace('@INPUT@', input).replace(/@HASH:([^@]+)@/, (_, k) => payloadHash(entry(k)))
  +   .replace('@HASH@', payloadHash(entry(key))));
  ```

  ```diff
  - # For each key it writes payloads[key] to a temp file, replaces @INPUT@ with that path and @HASH:<key>@ with
  - # github.js payloadHash(payloads[key]), runs run-github-case.js, …
  + # For each key it writes payloads[key] to a temp file, replaces @INPUT@ with that path, @HASH:<k>@ with
  + # github.js payloadHash(payloads[k]) and @HASH@ with the hash of the current key's payload, runs run-github-case.js, …
  ```

  Case updates: in each of the 15 real `--apply` cases without a hash (the R36 C2 `--auto` create case already passes `@HASH:create@` and stays as it is), `--apply --input @INPUT@` becomes `--apply --input @INPUT@ --expect-hash @HASH@` (keep any trailing `--auto` / `--output-file @OUT@`). The cases: G7 C8 (`edit-unknown-label,comment-placeholder`), G10 (`comment-placeholder --auto`), both R37 `close` cases, R23 E10 (`bulk-three`), R17 C18 (`create-labels`), E7 (`create`), and the cases at about lines 2327, 2354, 2377, 2400, 2426, 2450, 2474 and 2498. Find them with the Grep tool: `script_args:.*--apply --input @INPUT@` on lines without `--dry-run` or `--expect-hash`.

  New cases (insert after the existing A12 R36 mismatch case; same `vars` block as it, `APPLY_HARNESS: *apply_harness`):

  | description | script_args tail | assertion |
  |---|---|---|
  | `github-sdlc/apply R36: --apply without --expect-hash refuses a comment and a create, exit 1, no gh call` | `comment,create -- --apply --input @INPUT@` | each run: `exit === 1`, `JSON.stringify(json.errors) === '["--apply requires --expect-hash"]'`, `calls.length === 0`, `applied.length === 0`, `hashMismatch === false`, `/^[0-9a-f]{64}$/.test(json.payloadHash)` |
  | `github-sdlc/apply R36: --apply --auto without --expect-hash refuses a plain comment, exit 1, no gh call` | `comment -- --apply --input @INPUT@ --auto` | `exit === 1`, same `errors`, `calls.length === 0`, `notAutoApprovable === false` |
  | `github-sdlc/apply R36: a real --apply with the hash of another payload is hashMismatch, exit 1, no gh call` | `create-retitled -- --apply --input @INPUT@ --expect-hash @HASH:create@` | `exit === 1`, `hashMismatch === true`, `calls.length === 0`, `applied.length === 0` |
- names: `apply`, `@HASH@`, error text `--apply requires --expect-hash`.
- mirror: mismatch refusal at `plugins/sdlc-utilities/scripts/skill/github.js:1764-1767`; the A12 R36 exec case at `tests/promptfoo/datasets/github-sdlc-exec.yaml:2110-2127`.
- decisions: Key Decisions "Check in apply()", "Hash required with and without --auto", "--dry-run stays free", "A new harness token @HASH@".
- sync: error text matches Task 1 R36; dry-run cases (`--dry-run` in `script_args`) are not changed.

---

### Task 3: Skill prose — the hash is always passed

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual, lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` — one sentence in the Step 5 WRITE paragraph; E7 note names the retry hash
- Modify: `plugins/sdlc-utilities/skills/github-sdlc/write-ops.md` — one sentence after the step 9 apply block
- Modify: `plugins/sdlc-utilities/skills/github-sdlc/operations-reference.md` — the `validation` row of the Failure classes table names the retry hash

**Notes:**
Implements F-apply-hash-semantics-doc-copies-5. `write-ops.md` already passes the hash on every apply, so the prose only states the script rule and closes the E7 retry wording. `operations-reference.md` is a required copy under the project's `plan.copyRules` (trigger: the spec); its E7 row is the only text there about a retried `--apply`. Edits go through the Edit tool.

**Acceptance criteria:**
- [ ] The four text edits read as in the Contract; nothing else in these files changes.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): four edits.

  SKILL.md, Step 5 WRITE paragraph (after "...no `--apply` before `--validate-links` passes (G8)."):

  ```diff
    `--validate-links` passes (G8).
  + Every `--apply` without `--dry-run` carries `--expect-hash` with the `payloadHash` the run approved
  + (the approval view, or the auto-approved `--check-payload` run); the script refuses it without one (R36).
  ```

  SKILL.md, E7 note (after "...offer a new payload for the remaining steps only."):

  ```diff
  -  payload for the remaining steps only. Before the retry, record it with one plain
  +  payload for the remaining steps only. The E7 retry `--apply` passes `--expect-hash` with the
  +  `payloadHash` of the new `--check-payload` run; when that hash differs from the approved one, the
  +  payload changed and needs a new approval (R27). Before the retry, record it with one plain
  ```

  write-ops.md, after "`<PAYLOAD_HASH>` is the `payloadHash` the approval view showed, or under auto-approval the hash of the `--check-payload` run that gave `autoApprovable: true`.":

  ```diff
  + Never drop `--expect-hash`: the script refuses a real `--apply` without it (exit 1,
  + `errors: ["--apply requires --expect-hash"]`, no `gh` call; R36). Only `--dry-run` runs without it.
  ```

  operations-reference.md, Failure classes table, `validation` row:

  ```diff
  - | `validation` | HTTP 422; a label, milestone, user or project value `gh` does not know | E7: one section refresh, one re-check, at most one retry; a second failure goes to R26 | yes |
  + | `validation` | HTTP 422; a label, milestone, user or project value `gh` does not know | E7: one section refresh, one re-check, at most one retry with the re-check's `payloadHash` as `--expect-hash` (R36); a second failure goes to R26 | yes |
  ```
- names: no new headings; error text `--apply requires --expect-hash`.
- mirror: `plugins/sdlc-utilities/skills/github-sdlc/write-ops.md:157-165` (step 9 apply block); `plugins/sdlc-utilities/skills/github-sdlc/operations-reference.md:93-113`.
- decisions: Key Decisions "Hash required with and without --auto".
- sync: error text matches Task 1 R36 and Task 2.

---

### Task 4: User doc and site — the script enforces the approval

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual, lint

**Files:**
- Modify: `docs/skills/github-sdlc.md` — one Overview sentence
- Modify: `site/src/content-source/skills/github-sdlc.md` — byte copy (`cp docs/skills/github-sdlc.md site/src/content-source/skills/github-sdlc.md`)
- Modify: `site/src/data/skills-meta.ts` — the github-sdlc `apply` step description
- Create: `docs/plans/2026-11-13-lean-w13-github-apply-hash.md`

**Notes:**
Implements F-apply-hash-semantics-doc-copies-6. `site/src/data/skills-meta.ts` is a required copy under `plan.copyRules`; its `apply` step is the one place the site describes the write. `README.md` holds no apply or approval text, so it needs no change. The plan file is listed because ship stages only files named in the plan (project note).

**Acceptance criteria:**
- [ ] The two text edits read as in the Contract; nothing else in these files changes.
- [ ] `diff docs/skills/github-sdlc.md site/src/content-source/skills/github-sdlc.md` prints nothing.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): two edits; audience: end users.

  docs/skills/github-sdlc.md Overview, after "Under `--auto`, only the low-risk writes listed under `--auto` run without asking.":

  ```diff
  + The script itself refuses a write that does not carry the fingerprint of the payload you approved, so a write cannot run without that approval step, even when the script is called directly.
  ```

  site/src/data/skills-meta.ts, github-sdlc steps:

  ```diff
  - { id: 'apply', label: 'Apply operation', type: 'script', description: 'Runs the gh commands built by github.js' },
  + { id: 'apply', label: 'Apply operation', type: 'script', description: 'Runs the gh commands built by github.js; refuses a write without the approved payload hash' },
  ```
- names: no new headings; step id `apply` unchanged.
- mirror: `docs/skills/github-sdlc.md:5`; `site/src/data/skills-meta.ts:255-261`.
- decisions: user doc uses no flag names (audience: end users).
- sync: `site/src/content-source/skills/github-sdlc.md` byte copy of `docs/skills/github-sdlc.md`.

## Final Shape

- The script refuses a real `--apply` that carries no `--expect-hash`. It exits 1, prints `--apply requires --expect-hash` and the current hash, and makes no `gh` call.

- This holds with and without `--auto`. The `--auto` class check and its safety carve-outs (mentions, duplicate marker, duplicate close, cross-repo refs, account switch) are unchanged.

- `--apply --dry-run` still runs without a hash, so the approval view can still be built.

- The spec (A12, R36, P13) states the rule, with a dated appendix row. The skill prose and the user doc say the hash is always passed. All site copies match byte for byte.

- The exec suite passes the hash on every real `--apply` through a per-run `@HASH@` token. Three new cases prove the refusal, the refusal under `--auto`, and a real-write hash mismatch.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 0 |
| Correctness | 0 | 0 | 1 | 0 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Without --dry-run, github.js --apply requires --expect-hash: exit 1, errors ["--apply requires --expect-hash"], no gh call (with and without --auto). | Task 2 | covered |
| 2 Keep the --auto R34 class check and its safety carve-outs unchanged. | Task 2 | covered |
| 3 SKILL.md / write-ops.md always pass the hash shown to the user (or the auto-approved check-payload hash). | Task 3 | covered |
| 4 Update every exec case that runs a real --apply without a hash; add a refusal case and a mismatch case if none exists. | Task 2 | covered |
| 5 Spec first: R36 (and A12, P13) in docs/specs/github-sdlc.md; user doc and site copies in sync. | Task 1, Task 4 | covered |
| 6 Out of scope: jira-sdlc, ship-sdlc, review-sdlc, other audit findings, live GitHub writes, headless/behavioural runs. | Task 2 | covered |

**Verdict:** All checks passed. Ready for archive.

## OpenSpec Appendix

Not applicable — no OpenSpec change
