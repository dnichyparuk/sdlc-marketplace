# commit-sdlc Planned Subject — Spec Commit (W8.24, M5.1 wave 1) Implementation Plan

**Goal:**
- Write the spec text of W8.24 before any code changes (spec-first).
- `docs/specs/commit-sdlc.md`: three new inputs (A7 `--subject`, A8 `--message-file`, A9 `--expected-subject`), five new requirements (R-subject-verbatim, R-message-file, R-expected-subject, R-subject-precheck, R-script-prune) and two new failure entries (E9, E10). Two existing lines get new text: P2 (the full flag-key list, ruling w1-preflight Q1) and E8 (manifest cleanup moves to the script, D6).
- `docs/specs/plan-sdlc.md`: R66, which defines the optional plan-header field `**Commit:**` (D1).
- `docs/specs/ship-sdlc.md`: R-plan-commit-subject. Ship forwards that field to the `commit` step as `--subject` and never to `commit-fixes` (D2, D8).

**Architecture:** This plan has two tasks. Task 1 edits the commit spec. Task 2 edits the plan spec and the ship spec. The executor applies them directly, not through ship or execute. One commit goes through the orchestrator's commit wrapper, as the FIRST commit of the wave, before the plans commit and the ship run:
`bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "docs(#9017): commit-sdlc - subject flags and plan Commit field (W8.24)" <body-file> docs/specs/commit-sdlc.md docs/specs/plan-sdlc.md docs/specs/ship-sdlc.md`.
The subject is 70 characters and matches `commit.subjectPattern` (`^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`). The body file has one line per spec with its added ids, then `Checks: P-5 SAME (commit-sdlc 93, ship-sdlc 200, plan-sdlc 161); validate-spec-shape exit 0, no stdout.` with the real results. It has no `Co-Authored-By` line (ruling w3-trailers).

Site mirror: two refresh points. Both are executor steps outside ship, not plan tasks. Each runs `node site/scripts/copy-docs.mjs` (one recursive copy of `docs/`, `site/scripts/copy-docs.mjs:5-11`; the file lists below are expected, not yet probed by a run) and commits through the wrapper:
1. After the spec commit, together with the plans commit: `docs(#9017): plan - W8.24 plans and site mirror of the specs` (60 characters, matches `subjectPattern`). Files: `docs/plans/2026-10-26-m51-w1-commit-subject-spec.md`, `docs/plans/2026-10-26-m51-w1-commit-subject.md`, `site/src/content-source/specs/commit-sdlc.md`, `site/src/content-source/specs/plan-sdlc.md`, `site/src/content-source/specs/ship-sdlc.md`, `site/src/content-source/plans/2026-10-26-m51-w1-commit-subject-spec.md`, `site/src/content-source/plans/2026-10-26-m51-w1-commit-subject.md`.
2. After the ship run (which changes `docs/skills/commit-sdlc.md`): `docs(#9017): site - mirror the commit-sdlc skill doc (W8.24)` (60 characters, matches `subjectPattern`). File: `site/src/content-source/skills/commit-sdlc.md`.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-1-plan-source.md (plan 1; item W8.24 Change 1 and the spec parts of Changes 7–10; design points D1–D8), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/item-W8.24-cd6e665.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/preflight-wave-1.md, /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w1-preflight.md (Q1, Q2), discovery brief /tmp/sdlc-explore-m51-w1-9017-commit-subject-LD4lxo/discovery-brief.md

**Verification:** run in ONE Bash call from the repository root:

```bash
RE='^[[:space:]]*- (R[0-9]+[a-z]?|R-[A-Za-z0-9_-]+|A[0-9]+|G[0-9]+[a-z]?|PF[0-9]+|P[0-9]+|P-[A-Z]+-[0-9]+|E[0-9]+|C[0-9]+|C-[A-Z]+-[0-9]+|I[0-9]+)[:( ]'; ids() { tr -d '\r' | grep -oE "$RE" | sed -E 's/^[[:space:]]*- //; s/[:( ]$//' | sort; }; p5() { diff <(git show cd6e665:docs/specs/$1.md | ids) <(ids < docs/specs/$1.md | grep -vxE "$2") >/dev/null && echo "$1 SAME $(ids < docs/specs/$1.md | wc -l)" || echo "$1 DIFF"; }; p5 commit-sdlc 'A7|A8|A9|E9|E10|R-subject-verbatim|R-message-file|R-expected-subject|R-subject-precheck|R-script-prune'; p5 ship-sdlc 'R-plan-commit-subject'; p5 plan-sdlc 'R66'; node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . 2>/dev/null; echo "exit=$?"
```

Expected after both tasks, exactly four lines: `commit-sdlc SAME 93`, `ship-sdlc SAME 200`, `plan-sdlc SAME 161`, `exit=0`.
- Current output at cd6e665 (tested before writing this plan): `commit-sdlc SAME 83`, `ship-sdlc SAME 199`, `plan-sdlc SAME 160`, `exit=0`.
- `p5` is the W3 P-5 id-set check, restricted to the old ids. `SAME` means no old id was removed, renumbered or reused. The count shows that exactly the new ids were added (+10, +1, +1).
- The validator prints its LEGACY_SHAPE notes on stderr, which goes to `/dev/null`, so a clean run prints no stdout line.

---

## Context

**What problem does this change solve?**

- commit-sdlc cannot be given a planned commit subject. Its draft agent invents one. In M4.1 this forced 18 commits to be finished or amended by hand (item W8.24, Source).
- The owner set the scope (ruling commit-wrapper item 4, recorded as arbiter ruling pr40 F2):
  - `--subject`, `--message-file` and `--expected-subject`;
  - ship passes the plan's subject on;
  - the 72-character check runs before drafting;
  - the script, not the prompt, prunes the manifests.
- The repository rule is spec first (AGENTS.md, "Spec-driven development"). This plan writes the spec text that the code plan (`docs/plans/2026-10-26-m51-w1-commit-subject.md`) then implements.

**What prompted this change now?**

- W8.24 is the first item of M5.1 wave 1 (owner, ruling commit-wrapper item 4). This is its spec commit.

**What does success look like?**

- The three specs carry the new ids with Acceptance lines.
- P-5 prints `SAME` for each spec (no old id lost or reused).
- `validate-spec-shape.js --root .` prints no stdout line and exits 0.

---

## Research Findings

- **The commit spec is contract-shaped.** `## Inputs and flags` is at `docs/specs/commit-sdlc.md:8`. Its id sets are A1–A6, C1–C14, E1–E8, G1–G10, I1–I6, P1–P13 and R1–R15, plus R-config-version and R-expected-branch (pre-flight notes). A7–A9, E9, E10 and every `R-subject-*` name are free. The plan spec's highest numbered id is R65 (F-plan-format-commit-field-owner-7). The ship spec already uses R66, so the P-5 filter is per spec.
- **The validator rejects issue numbers in spec bodies.** `validate-spec-shape.js:170` flags any `#<digits>` outside the appendix. The new text therefore uses no `#1`-style example. The commit `subjectPattern` needs `(#<n>)`, so examples say `<subject>` instead.
- **Manifest pruning already exists for `.json`.** `lib/state.js:402-421` `writeManifestState` calls `pruneStateFiles('commit', branchSlug)`, which removes earlier same-branch `commit-<slug>-<ts>.json` files (R15). It does not remove the `.msg` message files that SKILL.md writes next to the manifest. Error-path manifests go to `<stateDir>/out/` via `lib/output.js:61-87`, which prunes same-prefix files older than one hour. So R-script-prune adds only the `.msg` part, and SKILL.md stops deleting (D6).
- **The plan-format owner is `docs/specs/plan-sdlc.md`** ("Plan document invariants", `:217-266`). No `**Commit:**` field is defined anywhere (pre-flight). Eight older plans carry a free-form per-task `**Commit:**` note below their header, for example `docs/plans/2026-10-20-m41-w1-completeness-spec.md:178`. R66 therefore reads the header only.
- **Ship's commit-step args** are a space-joined string (`plugins/sdlc-utilities/scripts/skill/ship.js:467-470`). `step.invocation` wraps them in plain double quotes (`ship.js:767-771`). commit-sdlc Step 0 puts them unquoted into a shell line (`node … commit.js --output-file $ARGUMENTS`, `SKILL.md:42`). A forwarded subject must therefore not contain `"`, a backtick, `$` or `\`.
- **R-expected-branch-injection's acceptance** says `steps[commit].invocation` *ends with* `--expected-branch <branch>` (`docs/specs/ship-sdlc.md:317`). The forwarded `--subject` must therefore come before it.

---

## Plan readings

- **Spec-first** (plan Execution conventions; arbiter 2026-10-20): spec-consequence commits go FIRST; never record a waiver nobody gave. → This plan is that first commit; it lands before the plans commit and the ship run.
- **Direct commits** (ruling commit-wrapper item 1; in force for ALL of M5.1, because W8.24 is not installed until the owner's swap): one call `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "<exact subject>" <body-file> <files…>`; the body file has NO `Co-Authored-By` line (ruling w3-trailers). → The spec commit and the two site-mirror commits (Architecture).
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → 70, 60 and 60 characters.
- **Classifier refusals** (ruling w4-curl): the plan's task text tells execute's workers to stop and report on a classifier refusal and never switch tools; public docs only via WebFetch. → The executor applies this plan directly and follows the same rule.
- **Worker temp files** (ruling stop-w3-2): a worker's ephemeral temp file is created under `$TMPDIR` and removed in its own run; none is left behind. → Any body file for the wrapper is created under `$TMPDIR` and removed after the commit.
- **No adapted verification** (ruling w2-judge row 52): every command in the plan runs exactly as written; test each grep against the current text before you write it, and give its current output.
- **Files extensions:** any file outside the item's Files list is a QUESTION, never assumed. → None asked here: `docs/specs/plan-sdlc.md` is named by the plan source itself (plan 1: "and, if D1 puts the field there, `docs/specs/plan-sdlc.md`").
- **ruling w1-preflight Q1:** P2 gains `noSquashWip`, `skipConfigCheck`, `forceDefaultBranch` next to the new keys; no new id; no follow-up.
- **ruling w1-preflight Q2:** `commit-fixes` stays unchanged and forwards no subject (R-plan-commit-subject).
- **ruling w1-plan R1: `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'.**
- **ruling w1-plan R3: plan-sdlc does not emit `**Commit:**`; follow-up #9176.**
- **ruling w1-plan E8: the E8 contract (trigger, printed reason, stop without commit, no prompt or error report) is unchanged; only the cleanup Change 10 moves into the script goes.**

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| E8 text changes ("remove the manifest and the message file" → left for the next run's prune) | yes (ruling w1-plan E8) | rewords E8's cleanup clause; the gate exit, no-prompt and no-error-report behaviour stay | D6 removes the `rm -f` on the E8 path (`SKILL.md:203`, named in the plan source). Leaving the old E8 text would make the spec false. ruling w1-plan E8: the E8 contract (trigger, printed reason, stop without commit, no prompt or error report) is unchanged; only the cleanup Change 10 moves into the script goes. |
| E9 drops "removes the manifest and the message file" from the item's Change 1 wording | no | E9 stops without committing; the files stay for the next run's prune | Same reason as E8 (D6). |
| R66 is defined in `docs/specs/plan-sdlc.md` but plan-sdlc does not write the field | yes (ruling w1-plan R3) | the spec says plan authors add it; plan-sdlc's emitter files are not edited | Making plan-sdlc emit the field would need `plan-format-reference.md` and possibly `plan-sdlc/SKILL.md`, which are outside the item's Files. The plan source says not to plan that. Reading the field in ship needs no plan-sdlc change. ruling w1-plan R3: plan-sdlc does not emit `**Commit:**`; follow-up #9176. |
| P2 lists the three keys `commit.js:196` already emits | yes (ruling w1-preflight Q1) | adds `noSquashWip, skipConfigCheck, forceDefaultBranch` next to the new keys | Ruled extension; no new id. |
| `--subject` alone still dispatches the orchestrator (for the body) | yes (ruling w1-plan R1) | the orchestrator is skipped only with `--message-file` | Change 3 (orchestrator writes only the body) and Change 7 ("with `--subject` and/or `--message-file` the orchestrator is skipped") disagree for `--subject` alone. Without a body source, an in-ship commit would have no body. D3; ruling w1-plan R1: `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'. |

---

## Key Decisions

1. **The deterministic check lives in the Step 5 subject gate.**
   - Choice: E9 and E10 are gate exit 3 in the existing `node -e` gate. The alternative was a model-side string comparison after `SKILL.md:135`.
   - Why: the gate already reads the message file and the manifest. A byte comparison in a script cannot drift. A model comparison can (guardrail scripts-over-llm-logic).
   - The text after `:135` (code plan) states the rule and points to the gate.
2. **Pre-draft checks live in `skill/commit.js` (R-subject-precheck).**
   - Choice: every given subject (`--subject`, `--expected-subject`, the message file's first line) is checked for empty, line break, more than 72 characters, and disagreement, before any draft. The alternative was to check after drafting.
   - Why: D5 and Change 10 ("reported before drafting"). A planned subject that is too long fails at once, with exit 1 (E1), instead of after a wasted draft.
3. **Conflict rule (D3).** When several subjects are given, they must all be equal, or the prepare script exits 1. A given subject is never silently replaced (item guardrail).
4. **`--expected-subject` is a check, not an instruction (D4).** The orchestrator ignores it. Otherwise it would act as a second `--subject`, and no mismatch could ever be detected. Its failure is E10 (gate exit 3). This is separate from E9 because the remedy differs: E9 means a given subject was altered; E10 means the draft is not what the caller expected.
5. **Pruning (D6).** The script deletes only `commit-<branchSlug>-<YYYYMMDDTHHmmssZ>.msg` files of the current branch in the state directory. `.json` manifests are already pruned by R15, and `out/` files by `lib/output.js`. SKILL.md keeps its two early `rm -f "<MSG_FILE>"` lines (link-gate failure `:222`, hook failure `:242`). The plan source's list of lines to drop names only the `rm -f "$COMMIT_CONTEXT_FILE"` lines, and those two lines are part of the W8.1 message-file text.
6. **The `**Commit:**` field (D1).**
   - The field sits in the plan header only, meaning the lines before the first `---`, `## ` or `### ` line. It is written as `` **Commit:** `<subject>` ``.
   - Header-only keeps the free-form per-task notes in older plans unread.
   - Backticks make the exact subject unambiguous.
   - One field per plan, because a ship run makes one commit.
7. **Ship's handling (D2, D8).**
   - A valid field is forwarded as `--subject "<subject>"`, before `--expected-branch`.
   - A malformed field, or a subject that fails `commit.subjectPattern`, is a prepare error `planCommitSubjectInvalid`, raised before any step runs. Failing loudly beats a silent draft, which would bring back the invented subjects this item removes.
   - The `commit-fixes` step forwards no subject (ruling w1-preflight Q2).

8. **Smallest viable cut.**
   - The minimal spec is A7 plus R-subject-verbatim plus E9, which is enough for `--subject` alone.
   - The owner's scope (ruling commit-wrapper item 4) adds A8, A9, R-message-file, R-expected-subject, E10, R-subject-precheck, R-script-prune, R66 and R-plan-commit-subject. Each new id backs exactly one owner-scoped part and one exec case.
   - No id is added for anything outside that scope.
9. **ruling w1-plan R1:** `--subject` alone dispatches the commit-orchestrator for the BODY only; the subject is used byte for byte and any difference is E9; `--message-file` skips the orchestrator entirely; rootcause §(b)'s 'skip' is read as 'skip drafting the subject'.

**Non-goals:**
- No change to R6, R12 or C14.
- No plan-sdlc emitter requirement: R66 only defines the field (ruling w1-plan R3: plan-sdlc does not emit `**Commit:**`; follow-up #9176).
- No new ship flag: the subject comes from the plan, not the CLI.
- No `commit-fixes` subject.
- No renumbering: ids are only added, and P2 and E8 are only reworded.

**Failure audience:**
- If this spec text is wrong, the code plan implements it as written. The people affected are callers of commit-sdlc that pass the new flags (planned direct and in-ship commits) and ship runs whose plans carry a `**Commit:**` line.
- Wrong ids would also break the SKILL.md citations that `validate-spec-shape.js` checks.

**Rulings on the points this plan raised:** ruling w1-plan R1 (Deviations row 5, KD9), ruling w1-plan R3 (Deviations row 3) and ruling w1-plan E8 (Deviations row 1, KD5). KD1's gate placement was accepted by the plan review (planreview-wave-1 §3a).

---

## Contract Examples

```markdown
**Contract:**
- shape (openspec): ADD `A7`, `A8`, `A9` after A6 in `docs/specs/commit-sdlc.md` `## Inputs and flags`; ADD `R-subject-verbatim` … after the R-config-version Acceptance line; MODIFY `P2`, `E8`; delta text pinned in the task's before→after blocks.
- names: `A7`–`A9`, `E9`, `E10`, `R-subject-verbatim`, `R-message-file`, `R-expected-subject`, `R-subject-precheck`, `R-script-prune` (new); `P2`, `E8` (modified).
- mirror: Acceptance sub-bullet style at `docs/specs/commit-sdlc.md:16-17` (R-expected-branch).
- decisions: named R- ids (the R1–R15 range is used; named ids match R-config-version / R-expected-branch).
- sync: commit-sdlc SKILL.md, `agents/commit-orchestrator.md`, `scripts/skill/commit.js` cite these ids in the code plan.
- example: `- E10: Subject gate exit 3 because the first line differs from \`flags.expectedSubject\` → …`
```

---

## Tasks

### Task 1: commit-sdlc spec — inputs, requirements, P2, E8–E10

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/commit-sdlc.md` — add A7–A9, R-script-prune, R-subject-verbatim, R-message-file, R-expected-subject, R-subject-precheck, E9, E10; reword P2 and E8.

**Notes:** Brief findings F-commit-spec-ids-and-docs-mirror-1, -2, -3, -4 (id sets, P2, E8, Acceptance style) and F-commit-script-flags-manifests-7 (existing prune). Apply the edits bottom-up (E8–E10 first, then P2, then the requirements, then R-script-prune, then the inputs), per §0 rule 2. Before editing, each anchor below must print `1` with `tr -d '\r' < docs/specs/commit-sdlc.md | grep -cF -- '<anchor>'`; all eight did at cd6e665.

**Acceptance criteria:**
- [ ] The eight anchors print `1` before editing: `- A6: \`--force-default-branch\``, `- R-expected-branch: When`, `- R15: Prepare manifest MUST`, `  - Acceptance: prepare output includes \`flags.skipConfigCheck\``, `- P2: \`flags\` (object: \`{ noStash, scope, type, amend, auto }\`) — parsed CLI flags`, `- E8: Subject gate exit 1 or 2 under \`--auto\``, `- R-config-version: The prepare script`, `| R-expected-branch | (issues #347, #348, #349) |`.
- [ ] After editing, `p5 commit-sdlc …` from the plan Verification prints `commit-sdlc SAME 93`.
- [ ] `sed '/^## Appendix — history/,$d' docs/specs/commit-sdlc.md | grep -c '#[0-9]'` prints `0` (it prints `0` at cd6e665).
- [ ] `git diff --stat` shows only `docs/specs/commit-sdlc.md`.

**Contract:**
- shape (openspec): the four before→after blocks below, applied verbatim.
- names: A7, A8, A9, R-script-prune, R-subject-verbatim, R-message-file, R-expected-subject, R-subject-precheck, E9, E10 (new); P2, E8 (modified).
- mirror: `docs/specs/commit-sdlc.md:16-17` (named requirement + two-space `  - Acceptance:` sub-bullet).
- decisions: KD1–KD5; P2 per ruling w1-preflight Q1.
- sync: code plan Tasks 1–5 cite these ids; exec case names in the Acceptance lines equal the code plan's case descriptions.

**Edit 1a — Failure handling (replace the E8 line, then append E9 and E10 after it):**

```diff
-- E8: Subject gate exit 1 or 2 under `--auto` → print the reason, remove the manifest and the message file, stop without committing (no prompt, no error report).
+- E8: Subject gate exit 1 or 2 under `--auto` → print the reason, stop without committing (no prompt, no error report). The manifest and the message file stay for the next run's prune (R-script-prune).
+- E9: Subject gate exit 3 because the written message differs from a given subject (`flags.subject`) or a given message file (`flags.messageFile`) → under `--auto`, print the given and the written subject and stop without committing (no prompt, no error report); interactive runs show both and ask: use the given subject (or file) / cancel.
+- E10: Subject gate exit 3 because the first line differs from `flags.expectedSubject` → under `--auto`, print the expected and the written subject and stop without committing (no prompt, no error report); interactive runs show both and ask: use the expected subject / cancel.
```

**Edit 1b — Prepare script contract (replace P2):**

```diff
-- P2: `flags` (object: `{ noStash, scope, type, amend, auto }`) — parsed CLI flags
+- P2: `flags` (object: `{ noStash, scope, type, amend, auto, noSquashWip, skipConfigCheck, forceDefaultBranch, subject, messageFile, expectedSubject }`) — parsed CLI flags; `subject` and `expectedSubject` are strings or null, `messageFile` is an absolute path or null
```

**Edit 1c — Step composition › Requirements (insert after the line `  - Acceptance: prepare output includes \`flags.skipConfigCheck\` and a \`migration\` block (or null when skipped); SKILL.md gates further work on \`errors.length === 0\`.`):**

```markdown
- R-subject-verbatim: When `--subject <text>` is set and `--message-file` is not, the commit-orchestrator writes only the body, and the final subject equals `<text>` byte for byte. With `--amend`, `<text>` replaces the amended message's subject. The orchestrator never alters a given subject; the Step 5 subject gate compares the message file's first line with `flags.subject` and exits 3 on a difference (E9). R6 and G2 still apply to the given subject.
  - Acceptance: exec cases `commit-subject: (a)` to `commit-subject: (d)` show `flags.subject` set, rejected or null; exec case `commit-subject: expected-subject gate` shows the gate's exit 3 path.
- R-message-file: When `--message-file <path>` is set, `skill/commit.js` reads the file and `flags.messageFile` is its absolute path. The skill does not dispatch the commit-orchestrator and does not add the OpenSpec trailer; `MESSAGE` is the file's exact content. The rest of Step 5 still runs: the message file written with the quoted heredoc (C14), the subject gate (WIP marker, R6 pattern), the link check (R12) and `git commit -F`. The subject is the file's first line. When `--subject` is also set it must equal that first line, or the prepare script stops (R-subject-precheck). The gate exits 3 when the written message differs from the file (E9). The path reaches a shell string only in the Step 0 command line: afterwards the skill reads the file with its file-read tool, the gate reads it with `fs`, and `git commit -F` uses the skill's own message file (C14). So `skill/commit.js` rejects a path (as resolved to an absolute path) that contains `"`, a backtick, `$`, `\`, a newline or a carriage return, with an `errors[]` entry and exit 1, before it reads the file.
  - Acceptance: exec case `commit-subject: message-file` — a readable file gives `flags.messageFile` as an absolute path and exit 0; a `--subject` that differs from its first line gives an `errors[]` entry and exit 1; a path containing `$` gives an `errors[]` entry starting `--message-file path contains` and exit 1.
- R-expected-subject: `--expected-subject <text>` is a check, not an instruction: the commit-orchestrator ignores it. The Step 5 subject gate exits 3 when the message's first line differs from `flags.expectedSubject`. Under `--auto` this stops the run without a commit (E10); interactive runs show both subjects and ask.
  - Acceptance: exec case `commit-subject: expected-subject gate` — the SKILL.md gate exits 3 for a different first line and 0 for the same one.
- R-subject-precheck: Before any draft, `skill/commit.js` checks every given subject: `--subject`, `--expected-subject` and the first line of the `--message-file` file. Each must be non-empty, one line, and at most 72 characters (G2), and all given subjects must be equal. A flag without a value, and a missing or unreadable message file, also fail. `--subject` and `--expected-subject` values reach `skill/commit.js` through the Step 0 command line, so they must not contain `"`, a backtick, `$` or `\` (the plan-sdlc R66 set); the script rejects each of the four. A `$` that reaches the script has survived shell expansion (escaped, or not followed by a name), so rejecting it keeps one rule for the whole set; a `$name` or `$(…)` is expanded before the script runs and cannot be detected, which is why such a subject must go through `--message-file`. The first line of a message file has no character rule: C14 governs the message, which reaches git only through the message file. Each failure is an `errors[]` entry and the script exits 1 (E1). A drafted subject is still checked after drafting by the G2 row of the quality gates.
  - Acceptance: exec cases `commit-subject: (b)`, `commit-subject: (c)` and `commit-subject: length before draft` (which also rejects a `--subject` containing `"`).
```

**Edit 1d — State model (insert after the R15 line):**

```markdown
- R-script-prune: `skill/commit.js` prunes its own earlier files; SKILL.md never deletes the manifest. Before it writes a manifest (R15), the script deletes every file in the state directory whose name is `commit-<branchSlug>-<YYYYMMDDTHHmmssZ>.msg` for the current branch slug; R15's prune removes the matching `.json` manifests. Error-path manifests under `<stateDir>/out/` are pruned by `lib/output.js` once older than one hour. No other file is deleted: other branches' files, other prefixes and other names stay. A deleted branch's last `.msg` file is not collected (`gcStateFiles` handles `.json` only). The manifest and the message file stay after a run until the next run, which keeps R15's cross-shell survival.
  - Acceptance: exec case `commit-subject: prune` — after a run, a same-branch `commit-main-<ts>.msg` is gone, and `commit-otherbranch-<ts>.msg`, `review-main-<ts>.msg` and `commit-main-notes.msg` remain; `grep -c 'rm -f "$COMMIT_CONTEXT_FILE"' plugins/sdlc-utilities/skills/commit-sdlc/SKILL.md` prints `0`.
```

**Edit 1e — Inputs and flags (insert after the A6 line, before `- R-expected-branch: When`):**

```markdown
- A7: `--subject <text>` — use `<text>` verbatim as the commit subject; the orchestrator writes only the body (R-subject-verbatim, R-subject-precheck). The value reaches `skill/commit.js` through the Step 0 command line, so it must not contain `"`, a backtick, `$` or `\` (the plan-sdlc R66 set); a subject that needs one of them goes through `--message-file` (default: unset)
- A8: `--message-file <path>` — commit the file's content as the whole message; the commit-orchestrator is not dispatched (R-message-file). The path reaches `skill/commit.js` through the Step 0 command line, so it must not contain `"`, a backtick, `$`, `\`, a newline or a carriage return (default: unset)
- A9: `--expected-subject <text>` — the subject the caller expects; a different subject stops the commit (R-expected-subject, E10). Like A7, it must not contain `"`, a backtick, `$` or `\` (R-subject-precheck) (default: unset)
```

---

### Task 2: plan-sdlc R66 and ship-sdlc R-plan-commit-subject

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — add R66 after R62 in `### Plan document invariants`.
- Modify: `docs/specs/ship-sdlc.md` — add R-plan-commit-subject after R-PLANFILE.

**Notes:** Brief findings F-plan-format-commit-field-owner-2, -4, -6 (owner spec, older per-task notes, emitter files) and F-ship-commit-step-plan-subject-1, -6, -8 (args, quoting, "ending with" acceptance). Task 2 depends on Task 1 only for commit order: both land in the one spec commit, and R-plan-commit-subject cites commit-sdlc A7. Anchors at cd6e665: `grep -cF -- '- R62 (plain-language style): Plans must use short sentences' docs/specs/plan-sdlc.md` prints `1`. `grep -cF -- '- R-PLANFILE: The \`ship.js\` prepare script MUST resolve' docs/specs/ship-sdlc.md` prints `1`.

**Acceptance criteria:**
- [ ] Both anchors print `1` before editing.
- [ ] After editing, the plan Verification prints `ship-sdlc SAME 200` and `plan-sdlc SAME 161`.
- [ ] `for s in ship-sdlc plan-sdlc; do sed '/^## Appendix — history/,$d' docs/specs/$s.md | grep -c '#[0-9]'; done` prints `0` twice (it prints `0` twice at cd6e665).
- [ ] `git diff --stat` shows only the two spec files of this task (plus Task 1's file).

**Contract:**
- shape (openspec): ADD R66 (plan-sdlc) and R-plan-commit-subject (ship-sdlc), text below, verbatim.
- names: `R66`, `R-plan-commit-subject`, error id `planCommitSubjectInvalid`.
- mirror: R72's `{id, message}` error wording at `docs/specs/ship-sdlc.md:28`; R-plan entries in `docs/specs/plan-sdlc.md:217-266`.
- decisions: KD6, KD7; header-only field; `commit-fixes` excluded (ruling w1-preflight Q2).
- sync: code plan Task 6 (`ship.js` `readPlanCommitSubject`) implements this grammar; the feat plan's own header carries a `**Commit:**` line in this grammar.

**Edit 2a — `docs/specs/plan-sdlc.md` (insert after the R62 line):**

```markdown
- R66 (`**Commit:**` header field): A plan MAY carry one `` **Commit:** `<subject>` `` line in its header, meaning the lines before the first `---`, `## ` or `### ` line. `<subject>` is the exact subject of the single commit a ship run makes for this plan: one line, 1–72 characters, matching `commit.subjectPattern` when set, and containing no `"`, backtick, `$` or `\`. Nothing but optional trailing whitespace follows the closing backtick. `**Commit:**` lines below the header (per-task notes) are prose and are not read. plan-sdlc does not write the field; plan authors add it. Consumer: ship-sdlc R-plan-commit-subject.
```

**Edit 2b — `docs/specs/ship-sdlc.md` (insert after the R-PLANFILE line):**

```markdown
- R-plan-commit-subject: When `context.planFile` is set and the plan header carries a `**Commit:**` field (plan-sdlc R66), `skill/ship.js` forwards its subject to the `commit` step as `--subject "<subject>"` (commit-sdlc A7), placed before `--expected-branch` so R-expected-branch-injection's "ending with" acceptance holds. R66 excludes `"`, backtick, `$` and `\`, so the double-quoted value is safe in commit-sdlc's Step 0 shell line. A header `**Commit:**` line that breaks R66, or whose subject does not match `commit.subjectPattern`, is a prepare error `{ id: 'planCommitSubjectInvalid', message }`, mirrored to stderr, before any step runs. When the field is absent, the commit step gets no `--subject` (unchanged behaviour). The `commit-fixes` step never forwards a subject: review fixes have no planned subject. The steps are recomputed from the frozen `planFile`, so the branch_prepare recompute (R-expected-branch-branch-derive) keeps the subject.
  - Acceptance: exec cases in `tests/promptfoo/datasets/ship-prepare-exec.yaml` — `ship-prepare (R-plan-commit-subject): header field forwards --subject to the commit step only` (commit args contain `--subject "<subject>"` before `--expected-branch`; commit-fixes args contain no `--subject`), `ship-prepare (R-plan-commit-subject): malformed header field hard-errors with planCommitSubjectInvalid`, and `ship-prepare (R-plan-commit-subject): plan without the field forwards no --subject`.
```

---

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 1, 3, 6 have exec cases (Tasks 5, 7); the spec plan edits no source. |
| no-ci-bypass | error | PASS | No CI step is skipped or disabled. |
| no-auto-eval | error | PASS | Exec-only config for check 2; one targeted behavioural case, last and once (check 7). |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Tasks follow the ten owner-scoped Changes; the one Files extension (Task 8) is confirmed by ruling w1-plan R2. |
| single-responsibility-tasks | warning | PASS | One deliverable per task. |
| scripts-over-llm-logic | error | PASS | Subject checks, pruning and forwarding live in scripts or the deterministic gate. |
| yagni | warning | PASS | No speculative abstractions. |
| cross-skill-consistency | error | PASS | ship → commit forwarding and commit-fixes covered; consumer grep and the literal-message wrapper checked. |
| pr-link-github-issue | error | PASS | #9017 is a local todo carried in subjects; no GitHub issue or PR step is planned here. |
| dry | warning | PASS | One parser for the plan field; one definition of "the given subject" (feat KD6). |
| kiss | warning | PASS | Small helpers and a gate extension. |
| spec-first | error | PASS | Spec plan commits first; code cites its ids. |
| project-agnostic | error | PASS | Behaviour changes are in plugin scripts, skills and agents. |
| flag-coherence-cross-skill | error | PASS | The gate and SKILL.md read resolved `flags.*`; ship forwards prepare-built args. |
| no-opposite-logical-vectors | error | PASS | Fixed: one precedence for "the given subject", defined once in SKILL.md Step 2 and reused by the exit-3 bullets and the `Source:` rule (feat Task 3). |
| flag-resolution-single-source | warning | PASS | Fixed: one parser `readPlanCommitSubject`; the two call sites and their reasons are recorded (feat KD6). |
| state-premise | error | PASS | Context states the root problem (invented subjects; 18 hand-finished commits). |
| smallest-viable-cut | warning | PASS | Fixed: minimal cut named and extras justified (spec KD8, feat KD7). |
| failure-audience | warning | PASS | Fixed: a "Failure audience" list in both plans. |
| explicit-non-goals | warning | PASS | Fixed: a "Non-goals" list in both plans. |
| ambiguity-stops-and-asks | error | PASS | Alternatives recorded in Key Decisions and Deviations; the Files extension was raised, not assumed, and confirmed (ruling w1-plan R2). |
| state-machine-idempotency | error | PASS | No migration/init/config-check logic changes; the prune is idempotent. |
| agent-dispatch-script-driven | error | PASS | Dispatch uses `step.data.invocation` built by `ship.js` from `step.args`; no model/isolation overrides added. |
| flag-semantic-consistency-cross-skill | error | PASS | Fixed: `grep -lE -- "'--(subject|message-file|expected-subject)'" plugins/sdlc-utilities/scripts/skill/*.js` prints nothing at cd6e665 (feat Task 1 Notes). |
| workspace-mode-compatibility | error | PASS | Fixed: branch and worktree behaviour of the prune, the `--message-file` path and the config read (feat KD5). |
| prompt-cache-hit-ratio | warning | PASS | Only static prompt text is added; dynamic values travel in args. |

---

## Final Shape

- `docs/specs/commit-sdlc.md` defines the three new inputs (A7–A9) and the five new requirements, each with an Acceptance line.
- It also defines E9 and E10 (gate exit 3), a reworded E8 (the script prunes, the skill does not delete), and P2 with every key `commit.js` emits.
- `docs/specs/plan-sdlc.md` R66 defines the optional header field `` **Commit:** `<subject>` ``.
- `docs/specs/ship-sdlc.md` R-plan-commit-subject says ship forwards that field to the `commit` step only, and fails at prepare time on a malformed field.
- One commit, `docs(#9017): commit-sdlc - subject flags and plan Commit field (W8.24)`, made through the commit wrapper before any code commit. P-5 prints `SAME` for all three specs.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 1 | 1 |

Review: Step 3 lanes (G1–G21) — round 1 had no spec-plan issue except G14 warnings (non-goals, failure audience, smallest cut), fixed in Step 4. Step 5 single reviewer (`{LENS}=all`, Sonnet): **Approved** in iteration 1; it ran the Verification command read-only and confirmed `commit-sdlc SAME 83`, `ship-sdlc SAME 199`, `plan-sdlc SAME 160`, `exit=0` and every anchor.

| Requirement (checklist) | Task(s) | Status |
|---|---|---|
| 1. Spec commit first; P-5 SAME; validate-spec-shape clean | Tasks 1–2, Verification | covered |
| 2. commit spec A7–A9, R-subject-verbatim, Changes 7/8/10 ids, P2, E9/E10, Acceptance | Task 1 | covered |
| 3. D1 `**Commit:**` field in owner spec; no emitter planned | Task 2 (R66) | covered |
| 4. D2 ship forwarding, quoting, branch-derive kept | Task 2 (R-plan-commit-subject) | covered |
| 5–8. D3–D6 | Task 1 | covered |
| 9. D7 flag keys (ruling w1-preflight Q1) | Task 1 (P2) | covered |
| 10. D8 commit-fixes | Task 2, KD7 | covered |

**Verdict:** All checks passed. Ready for archive.

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
