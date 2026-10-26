# execute-plan-sdlc On-Demand Reference Files (W5.4) Implementation Plan

**Goal:**
- Move the OpenSpec blocks and the `--commit-waves` blocks of `execute-plan-sdlc/SKILL.md` into two on-demand companion files, `openspec-tasks.md` and `commit-waves.md`. Each moved block is replaced by a gated pointer of at most two lines.
- Make the session-start hook emit one resolved line, `execute-resume: implicit|deferred-to-ship|none`, and make SKILL.md's post-compact discriminator branch on it.
- Strip every GitHub issue number from SKILL.md prose and keep the `R…` anchors (W5.4 Change; rulings w3-preflight Q1–Q7; owner Q19d).

**Architecture:**
- **Task 1 (the move).** A Node script builds both companion files from SKILL.md at 710c438, using exact line ranges with content anchors. It replaces each range in SKILL.md with its pointer. The move is therefore byte-for-byte by construction.
- **Task 2 (the ruled changes inside the moved text).**
  - Q3: the `validateChangeStrict` `node -e` becomes `openspec-step.js validate`; the `parseTasks` `node -e` gets a TODO; one clause is reworded.
  - Q4: the `git commit -m` line becomes a quoted-heredoc message file and `git commit -F`.
- **Task 3 (the hook).** `hooks/session-start.js` computes the `execute-resume:` value, and three new exec cases cover its three values (ruling w3-plancheck m3).
- **Task 4 (SKILL.md text).** Rewrite the post-compact section, strip the issue numbers, and add both companions to See Also.
- **The ship run.** The whole plan runs as ONE `/sdlc:ship-sdlc --plan docs/plans/2026-10-26-m5-w3-execute-ondemand.md --steps execute,commit --rebase skip --quality balanced`. It is driven by the installed sdlc 0.21.29 (reading R-installed) and makes exactly ONE commit:
  - subject `refactor(#9015): execute-plan-sdlc - on-demand reference files (W5.4)` (69 characters);
  - it matches `commit.subjectPattern` `^(feat|fix|refactor|chore|docs|test|ci)\(#\d+\): .+ - .+$`;
  - if the in-ship commit subject differs, the executor STOPs (standing commit rule); no amend.
- **Order.** Commits 1 (the spec, `2026-10-26-m5-w3-spec-disclosure.md`) and 2 (the plans and site mirror) must already be on the branch.

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5/wave-3-plan-source.md (plan 2; item W5.4 verbatim at 710c438, `item-W5.4-W5.5-710c438.md`; ruling w3-preflight Q1–Q7; readings R-W8.22, R-W5.2-contract, R-W5.3, R-installed, Q19d; plan §0), /workspace/sdlc-marketplace/.sdlc/orchestration/m5/preflight-wave-3.md (§1 anchors, §2–§7), discovery brief /tmp/sdlc-explore-m5-w3-9015-execute-ondemand-docs-xmh8Kx/discovery-brief.md (F-skill-md-move-blocks-and-consumers-1…15, F-session-start-execute-resume-hook-1…9)

**Verification:** after the ship run, from the repository root, in this order. Each item gives its exact command and expected result; an executor who would have to adapt a command STOPs and asks first (ruling w2-judge row 52).

1. **Diff proof of the move.** Run the "Move diff proof" block under Final Shape, exactly as written (it sets `PROOF` itself on its first line). It prints the seven `diff-exit` lines stated there. The two non-empty diffs must equal the stated Q3 and Q4 hunks exactly. The block writes them to `$PROOF` (the executor's scratch); the PR names that directory.
2. `node .claude/skills/validate-plugin-consistency/check-consistency.js --root .` prints `✓ All consistency checks passed.` and exits 0.
3. `wc -l plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`: REPORT the number (plan-time probe: `827`; the item's ≤ 500 is not reachable, ruling Q5).
4. `grep -n 'openspec' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`: REPORT the count and every line, each classified as common-path or pointer, using the table under Final Shape (plan-time probe: 13 lines).
5. `grep -c '#[0-9]\{3\}' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `0`.
6. `grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `1` (the exit criterion is ≤ 1; the one left is Step 5c.0's `PARSE_RESULT`).
7. **Exec targeted runs.**
   - Each run is ONE self-contained command, run from the repository root exactly as written (no `export`; each Bash call is a new shell), in the background with one bounded wait, never two at once.
   - Commands and expected results:
     - (a) `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "session-start"` → 23 of 23 (20 existing + the three new cases);
     - (b) `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "ship-step: \((t|u|u2|u3|u4)\) --after dispatch_execute|execute-plan-sdlc/cleanup-verify"` → 9 of 9 (R-W8.22);
     - (c) `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "execute-prepare"` → 52 of 52 (all of `execute-prepare-exec.yaml`);
     - (d) `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "execute-plan-sdlc/dispatch-resilience"` → 1 of 1 (it reads SKILL.md directly; consumer, addendum C9).
     - (e) `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --no-cache --filter-pattern "openspec-lib"` → 17 of 17. The consumer grep below hits `openspec-lib-exec.yaml`, which tests the `validateChangeStrict` export that the moved archive block now reaches through `openspec-step.js validate`.
   - **Consumer grep** (addendum C9; run before the exec runs): `grep -lE '5c-quater|5d-bis|validateChangeStrict|OpenSpec sync warnings|layer-agnostic|markTaskDone|Post-compact recovery|execute-resume' tests/promptfoo/datasets/*-exec*.yaml` prints exactly `tests/promptfoo/datasets/openspec-lib-exec.yaml` and `tests/promptfoo/datasets/session-start-exec.yaml`. These are covered by runs (e) and (a). The plan-time probe at 710c438 printed only the first; the second comes from Task 3's new cases. Any other file is a STOP: report it, with the exec filter that selects its cases.
8. `node plugins/sdlc-utilities/scripts/ci/validate-plan-format.js --file docs/plans/2026-10-26-m5-w3-execute-ondemand.md` and `node /home/developer/.claude/plugins/cache/sdlc-marketplace/sdlc/0.21.29/scripts/ci/validate-plan-format.js --file docs/plans/2026-10-26-m5-w3-execute-ondemand.md` each exit 0.

The item's single behavioural case is NOT a plan task. The executor runs it after the ship run as the item's final check: the 5d-bis case of `tests/promptfoo/datasets/execute-plan-sdlc.yaml` whose description is `execute-plan-sdlc: Step 5d calls markTaskDone after wave WAVE_SUMMARY for tasks with openspec-task blocks (R37, #414)`. Run it from the repository root exactly as written, in the background, with one bounded wait: `mkdir -p /tmp/claude-1000/pf-tmp-exec-m5w3/final && cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=/tmp/claude-1000/pf-tmp-exec-m5w3/final npx --yes promptfoo@0.123.1 eval -c promptfooconfig.yaml -j 2 --no-cache --filter-pattern "Step 5d calls markTaskDone after wave WAVE_SUMMARY"` → 1 of 1.

**Release (CHANGELOG and PR body; version 0.34.0, pending VERSION-OK; not a plan task):**
- execute-plan-sdlc reads its OpenSpec instructions (`openspec-tasks.md`) and its `--commit-waves` instructions (`commit-waves.md`) only when a run needs them. Common runs carry less resident text.
- The SessionStart banner gains one line on compaction, `execute-resume: implicit|deferred-to-ship|none`, and execute-plan-sdlc's post-compact resume branches on it.
- `--commit-waves` writes each per-wave WIP commit with `git commit -F` from a message file (owner Q19d), so task titles are never shell-expanded.
- Spec: new requirement `R-progressive-disclosure` for execute-plan-sdlc (commit 1).
- Docs and the skill description are synced to the W5.3 and W5.4 behaviour (W5.5, plan 3).

**Commit order (plan source):**
1. **The spec (plan 1, wrapper).**
   - Subject: `docs(#9015): execute-plan-sdlc - spec R-progressive-disclosure (W5.4)` (69 characters).
   - File: `docs/specs/execute-plan-sdlc.md`.
2. **The plans (wrapper).** Run `node site/scripts/copy-docs.mjs` first.
   - Subject: `docs(#9015): plan - wave 3 plans for W5.4 and W5.5` (50 characters).
   - Files:
     - `docs/plans/2026-10-26-m5-w3-spec-disclosure.md`
     - `docs/plans/2026-10-26-m5-w3-execute-ondemand.md`
     - `docs/plans/2026-10-26-m5-w3-docs-sync.md`
     - `site/src/content-source/plans/2026-10-26-m5-w3-spec-disclosure.md`
     - `site/src/content-source/plans/2026-10-26-m5-w3-execute-ondemand.md`
     - `site/src/content-source/plans/2026-10-26-m5-w3-docs-sync.md`
     - `site/src/content-source/specs/execute-plan-sdlc.md`
   - Plan-time probe: after commit 1, copy-docs changes exactly these four mirror paths.
3. **This ship run.** One in-ship commit:
   - subject `refactor(#9015): execute-plan-sdlc - on-demand reference files (W5.4)` (69 characters);
   - files:
     - `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`
     - `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md`
     - `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md`
     - `plugins/sdlc-utilities/hooks/session-start.js`
     - `tests/promptfoo/datasets/session-start-exec.yaml`
4. **W5.5 (plan 3, wrapper).**
   - Subject: `docs(#9015): execute-plan-sdlc - docs and metadata sync (W5.5)` (62 characters).
   - Files: the six files plan 3 lists, the site mirror included.
5. **copy-docs.** Already part of commits 2 and 4. Re-running `node site/scripts/copy-docs.mjs` after commit 4 must leave `git status --porcelain` empty.
6. **The release.**

---

## Context

**What problem does this change solve?**

- `execute-plan-sdlc/SKILL.md` is 949 lines, and the model reads all of it on every run.
- Several blocks only matter in rare runs:
  - the OpenSpec work: loading delta specs, flipping `tasks.md` checkboxes, the sync warnings, and the archive suggestion;
  - the `--commit-waves` per-wave commit.
- On a common run they are dead weight, and after a context compaction they compete for the small re-attach budget.
- The post-compact discriminator compares two banner lines in the model's head. The hook can resolve that comparison itself and emit one line.
- SKILL.md prose still carries about 29 GitHub issue numbers, which mean nothing to the model (plan §0 rule 7).

**What prompted this change now?**

- W5.4 is M5 wave 3 (item W5.4, after W5.3 merged in PR #38).
- W4.4 already shipped `scripts/skill/openspec-step.js`, so the moved archive block can call `openspec-step.js validate` instead of an inline `node -e` (ruling Q3).

**What does success look like?**

- `openspec-tasks.md` and `commit-waves.md` exist and hold the moved blocks byte-for-byte. The only exceptions are the ruled Q3 and Q4 lines, which a diff proves.
- SKILL.md has a pointer of at most two lines at each moved block. It has 0 issue numbers and one `node -e`.
- A compact SessionStart with execute state prints `execute-resume: implicit` (or `deferred-to-ship`), and SKILL.md branches on it.
- `check-consistency.js` passes. The targeted exec runs pass, including the R-W8.22 set.

**User-visible changes:** see the header field **Release**.

## Research Findings

- **Line endings.** Every edited file is LF: `grep -c $'\r'` prints `0` at 710c438 for SKILL.md, `session-start.js` and `session-start-exec.yaml`.
- **Move ranges at 710c438** (pre-flight §1, re-checked by content; F-skill-md-move-blocks-and-consumers-1…5):

  | Block | SKILL.md lines | Goes to | Pointer |
  |---|---|---|---|
  | OpenSpec context loading | 75 | `openspec-tasks.md` | gated on `openspec.specFiles` non-empty |
  | OpenSpec task-flip map | 77 | `openspec-tasks.md` | gated on `openspec.taskMap` non-empty |
  | `--commit-waves` parse paragraph and help table | 152-156 | `commit-waves.md` | names `flags.commitWaves` |
  | 5c-quater per-wave WIP commit | 510-543 | `commit-waves.md` | the item's second pointer, verbatim |
  | 5d-bis OpenSpec task flip | 598-626 | `openspec-tasks.md` | the item's first pointer, verbatim |
  | OpenSpec sync warnings | 766-772 | `openspec-tasks.md` | gated on `openspecSyncWarnings` non-empty |
  | Step 9 archive suggestion | 884-935 | `openspec-tasks.md` | gated on `openspecSpecs` loaded |

  - Lines 937-939 stay: "The archive suggestion is never auto-executed …" and the worktree note.
  - 8-bis (`:703-720`) stays (ruling Q2 a).
- **`node -e` count.** SKILL.md has three today (`:404`, `:889`, `:905`). After the move it has one (`:404`, Step 5c.0 `PARSE_RESULT`). `openspec-tasks.md` holds one (`parseTasks`, ruling Q3).
- **openspec-step.js contract** (`scripts/skill/openspec-step.js:9-28`):
  - `validate --change <n> [--project-root <p>]` prints `{"ok":B,"cliAvailable":B,"stderr":S}`;
  - it exits 0 when `ok` is true or the CLI is missing, and 1 otherwise;
  - a usage error prints `{"error":…}` and exits 2;
  - no subcommand returns per-task titles, so `parseTasks` stays (follow-up #9165).
- **The hook** (F-session-start-execute-resume-hook-1…5):
  - Resume detection runs inside one `try` (`session-start.js:93-173`). It only reads.
  - The ship banner is pushed only when the state has a `steps` array, a current step and `sameWorktree` (`:127-139`). The execute block gates on a `waves` array and `sameWorktree` (`:148-152`), then emits the post-compact line on `compact` (`:161-162`).
  - The hook's only writes are the sidecar-sweep unlinks (`:213`, `:239`). The new line is pure computation, so the hook writes nothing outside its current contract (ruling Q6).
- **Tests of the hook:**
  - `tests/promptfoo/datasets/session-start-exec.yaml` has 16 cases; `compact-recovery-sweep-exec.yaml` adds 4 whose descriptions start with `session-start`.
  - The filter `session-start` selects 20 today and 23 after the three new cases (ruling w3-plancheck m3).
  - No existing case asserts against a string the new line contains (`not-icontains` values: `Active pipeline: ship-sdlc`, `(post-compact)`, `Active execution: execute-plan-sdlc`, `OpenSpec`, `otherbranch`, `/tests/`, `/marketplaces/`; F-session-start-execute-resume-hook-6, -8).
  - The new cases reuse existing fixtures (no new `setup.sh`): `project-execute-post-compact-no-ship` (`implicit`), `project-execute-post-compact-with-ship` (`deferred-to-ship`: its compact case already shows the ship banner) and `project-session-start-worktree-mismatch` (`none`: its execute state records a sibling worktree, so `sameWorktree` is false and no post-compact line is emitted).
- **Consumers of the moved text** (F-skill-md-move-blocks-and-consumers-12, -13, -15; addendum C9 grep over `tests/promptfoo`, `docs/`, `site/`, `plugins/`):
  - `extract-skill-content.js` auto-loads every sibling `*.md` of SKILL.md into the behavioural prompt, so the two new files reach the behavioural cases with no dataset change.
  - The moved text keeps every word the assertions use: `markTaskDone`, `OpenSpec sync warnings`, `openspec archive`, `Out-of-scope OpenSpec tasks`.
  - `check-dispatch-resilience-sentinel.js` reads SKILL.md for two sentinel strings. Neither contains an issue number, and neither moves (run (d)).
  - `docs/skills/execute-plan-sdlc.md:74` names the "layer-agnostic" note; that is plan 3's file (W5.5).
  - `ship.js`, `openspec-lib-test.js` and the ship spec name `validateChangeStrict` for their own code paths and are unaffected.
- **`check-consistency.js`:** rule `no-exit-trap` scans every skill `.md` fence for `trap … EXIT`, and the new files have none (F-skill-md-move-blocks-and-consumers-14).
- **Plan-time probe:**
  - Tasks 1–4 were applied, in order, to a scratch clone at 710c438 outside every work tree: the scripts were run as written, and the Old/New pairs were applied with Edit-tool semantics. Results:
    - `check-consistency.js --root .` passed;
    - the move diff proof printed the stated lines;
    - `wc -l`, the `openspec` grep, the `#NNN` count and the `node -e` count gave the values in the Verification header;
    - `node --check` passed on `session-start.js`.
  - The edited hook was run directly against a scratch git repository that mirrors the no-ship and with-ship fixtures (built by hand in the scratch directory, not by the fixture `setup.sh`). Results:
    - compact with no ship → `execute-resume: implicit`;
    - compact with ship → `execute-resume: deferred-to-ship`;
    - startup → no `execute-resume:` line.
  - No promptfoo case was run at plan time.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| 5d-bis block | no | moves the CURRENT `openspec-step.js flip` block byte-for-byte; no conversion | ruling Q1: W4.4 already converted it |
| 8-bis | no | stays in SKILL.md; no `:768` pointer | ruling Q2 (a) |
| Step 9 archive block | no | moves whole; `validateChangeStrict` `node -e` → `openspec-step.js validate`; `parseTasks` `node -e` copied with a one-line TODO naming #9165; only the `:899` clause reworded | ruling Q3 |
| Usage-error handling of `validate` | no | one sentence: a usage error (exit 2) or non-JSON output is handled like `ok === false` | the usage header defines exit 2; this mirrors the moved 5d-bis rule ("A non-zero exit or output that is not this JSON … is handled like `io-error`"); without it, an exit-2 run has no branch Ruled: accepted (ruling w3-planreview). |
| `git commit -m` at `:521` | no | quoted-heredoc message file, `git commit -F`, then `rm -f` | ruling Q4, owner Q19d |
| Column-1 heredoc lines in the Q4 block | no | the `<subject>` and `EOF` lines are written unindented (column 1) inside the 3-space-indented fence, plus one comment saying they must stay there | bash closes `<<'EOF'` only on an unindented `EOF`, and an indented `<subject>` gives a subject with leading spaces that commit.js `/^wip\(execute\)/` does not match; the block must work whether or not the model strips the list indent. The companion is not mirrored to the site, so the CommonMark list break does not matter (plan review FIX 1) |
| `--commit-waves` parse paragraph and table (`:152-156`) | no | moves to `commit-waves.md` ("Flag sources and help"), with a one-line pointer | the item's Files (`:157-161`) and Current state name the parse table, and its Change says "move each block verbatim"; the plan source keeps them "unless the item's Change moves them". The pre-flight's ~810-line estimate also counts them as moved. Key Decision (b) Ruled: accepted (ruling w3-planreview). |
| Pointers for `:75`, `:77`, `:766`, `:884`, `:152` | no | one pointer per block, worded like the item's two pointers, each gated on the prepare field the block already gated on | the item gives pointer text only for 5d-bis and 5c-quater; its guardrail is "one pointer per block". Key Decision (c) Ruled: accepted (ruling w3-planreview). |
| Bold lead-in labels on the two item pointers | no | `**5c-quater. Per-wave WIP commit (R35).**` and `**5d-bis — OpenSpec task flip (R37, R39).**` come before each verbatim pointer | keeps the step names that other SKILL.md lines, the spec and the behavioural cases use ("Step 5d", "5c-quater"); the pointer sentence itself is verbatim (ruling Q7) |
| Sync warnings range | no | moves `:766-772` only; `:761-764` (the `OpenSpec:` report line) stays | the item cites the old `:831-837` (7 lines), which matches `:766-772` exactly; `:761-764` is common report text |
| `execute-resume:` resolution | no | the hook emits the line only on `compact` and only when an execute state file exists for the branch | Key Decision (a); ruled: accepted (ruling w3-planreview) |
| Hook comment block `:153-160` | no | reworded to describe the new line; the "layer-agnostic" sentence goes | the item strips the matching SKILL.md note; the comment would otherwise contradict the code below it |
| `hooks/README.md:7` | no | unchanged | it names the banner lines the hook derives from the ledger; it stays true with one more line |
| See Also | no | adds `./openspec-tasks.md` and `./commit-waves.md` | pre-flight §5 side effect (plan source) |
| `#NNN` in the moved companion text | no | kept | ruling Q5: the move is verbatim |
| Files extensions (beyond the item's Files) | no | `tests/promptfoo/datasets/session-start-exec.yaml` (three new cases) | named by the item's Verification and ruling Q6; three cases, not one, by ruling w3-plancheck m3. No other file outside the item's Files is edited |

## Key Decisions

**Problem in one sentence:** SKILL.md carries rarely-used OpenSpec and commit-waves text on every run, and its post-compact branch compares two banner lines that the hook could resolve once.

**(a) The `execute-resume:` resolution (RULED: accepted, ruling w3-planreview; plan source "Design questions").**

- The line mirrors the existing three-branch table:

  | Facts the hook sees (same session-start run) | Line emitted | SKILL.md branch |
  |---|---|---|
  | `compact`, execute state with `waves` and `sameWorktree`, and NO `Active pipeline: ship-sdlc` line pushed | `execute-resume: implicit` | 1 — implicit `--resume` |
  | as above, and the `Active pipeline: ship-sdlc` line WAS pushed | `execute-resume: deferred-to-ship` | 2 — defer to ship |
  | `compact`, an execute state file found for the branch, but no post-compact line (no `waves` array, or `sameWorktree` false) | `execute-resume: none` | 3 — unchanged routing |
  | `startup` / `clear` / `resume`, or no execute state file | no line | 3 — unchanged routing |

- "Was pushed" is a new boolean, `shipBannerEmitted`. It mirrors the ship banner, not the state file's existence (F-session-start-execute-resume-hook-2). That is exactly what the old table compared.
- Alternative 1: emit `execute-resume: none` on every `compact` start, even with no execute state. Rejected: it adds a line to every compaction in every repository using the plugin, which is a prompt-cache and noise cost for no decision.
- Alternative 2: emit only next to the post-compact line. Rejected: `none` could then never be emitted, which leaves a dead value in the contract.

**(b) The `--commit-waves` parse paragraph and table move (RULED: accepted, ruling w3-planreview).**

- The item's Files names `:157-161` (the parse table, now `:152-156`), and its Change moves "each block". So both commit-waves blocks go to `commit-waves.md`, and SKILL.md keeps a one-line pointer that names `flags.commitWaves`.
- Alternative: keep the paragraph (the source's default). Rejected because the item names it.
- Ruled: accepted (ruling w3-planreview). (The fallback, kept for the record: drop `152` from Task 1's ranges and pointers and the "Flag sources and help" section; the rest is independent. Also amend plan 1's S1 role phrase for `commit-waves.md` ("the `--commit-waves` flag sources and" goes), so the spec commit stays true.)

**(c) Pointer wording for the blocks the item gives no text for (RULED: accepted, ruling w3-planreview).**

- Each pointer copies the item's form: "When `<prepare field>` … → Read `./<file>` and follow its "<section>" section. Do not read preemptively."
- Each gates on the field the moved block already tested, so the executed flow is unchanged (R-progressive-disclosure part 2):
  - `openspec.specFiles` for context loading;
  - `openspec.taskMap` for the flip map;
  - `openspecSyncWarnings` for the warnings;
  - `openspecSpecs` loaded for the archive suggestion.

**(d) The move is a script, not hand edits.**

- A script reads SKILL.md at 710c438 with `git show` and copies exact line ranges after checking each range's first and last line by content. "Byte-for-byte" then holds by construction, and the diff proof checks it.
- Alternative: Edit-tool moves of 30–50-line blocks. Rejected: retyping that much text by hand invites silent drift.

**(e) The Q4 heredoc's `<subject>` and `EOF` lines are unindented.**

- Every other line of the moved bash block keeps the three-space list indent, because it is a fenced block inside a list item.
- The heredoc body line `<subject>` and the terminator `EOF` start in column 1. An indented `EOF` never closes `<<'EOF'`: bash would read the rest of the call into the message file, make no commit, and report no error. An indented subject would also carry leading spaces.
- One comment in the block says the two lines must stay in column 1.

**Non-goals:**

- No change to `state/execute.js`, `lib/`, `skill/execute.js`, ship-sdlc, or the verifying cleanup and scoped gate (R-W8.22).
- No new `openspec-step.js` subcommand (#9165).
- No change to the `wave-committed` or `task-done` verbs, or to the `Out-of-scope OpenSpec tasks` parsing rules.
- No `docs/skills` edit: W5.5, plan 3.

**Failure audience:** execute-plan-sdlc's model at run time, and users who resume after a compaction. A wrong pointer gate would silently skip OpenSpec flips or WIP commits. A wrong `execute-resume:` value would double-dispatch a wave or skip a resume.

## Contract Examples

**code** (from Task 3):

```markdown
**Contract:**
- shape (code): `session-start.js` — new `let shipBannerEmitted = false` set where the ship banner is pushed; execute block pushes `execute-resume: <implicit|deferred-to-ship|none>` per Key Decision (a); no new write, no new exit path.
- names: `shipBannerEmitted`, `postCompactEmitted`, line prefix `execute-resume: `.
- mirror: the existing `Active execution (post-compact):` push at `session-start.js:162`.
- decisions: Key Decision (a).
- sync: SKILL.md Post-compact recovery (Task 4 K1–K3); spec R36 (commit 1).
```

**docs** (from Task 1):

```markdown
**Contract:**
- shape (docs): two companion files under `plugins/sdlc-utilities/skills/execute-plan-sdlc/`, each an H1, one intro paragraph, then one `##` section per moved block holding the block verbatim; SKILL.md keeps a ≤2-line pointer per block.
- names: `openspec-tasks.md` sections "OpenSpec context loading (Step 1)", "OpenSpec task-flip map (Step 1)", "5d-bis — OpenSpec task flip", "OpenSpec sync warnings (Step 9)", "Archive suggestion (Step 9, What's Next)"; `commit-waves.md` sections "Flag sources and help", "5c-quater — per-wave WIP commit".
- mirror: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md` (ship's on-demand OpenSpec companion).
- decisions: Key Decisions (b), (c), (d).
- sync: spec R-progressive-disclosure (commit 1).
```

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | The new hook output has one exec case per value (Task 3; ruling w3-plancheck m3); the moved text keeps every asserted word; the R-W8.22 set, `execute-prepare` and the dispatch-resilience consumer re-run |
| no-ci-bypass | error | PASS | No check is skipped; every gate check runs on the final head |
| no-auto-eval | error | PASS | Exec runs only; the one behavioural case is the item's final check, run once by the executor |
| skill-docs-required | error | PASS | No new skill; the docs/skills sync is plan 3 (W5.5) |
| no-scope-creep | warning | PASS | Every edit is in the item's Files, the ruled extensions, or the Deviations table |
| single-responsibility-tasks | warning | PASS | Move; ruled edits in the moved text; hook; SKILL.md text |
| scripts-over-llm-logic | error | PASS | The `execute-resume:` value is computed by the hook; the move is a script |
| yagni | warning | PASS | No new subcommand; one TODO for #9165 |
| cross-skill-consistency | error | PASS | Same pointer shape as ship's R-progressive-disclosure companions |
| pr-link-github-issue | error | PASS | Tracking is local todo #9015 |
| dry | warning | PASS | Each moved rule lives once, in its companion |
| kiss | warning | PASS | One boolean and one push in the hook |
| spec-first | error | PASS | Commit 1 lands the spec before this ship run |
| project-agnostic | error | PASS | Plugin files only |
| flag-coherence-cross-skill | error | PASS | Pointers read `flags.commitWaves` and `openspec.*` from the prepare output (R-W5.2-contract) |
| no-opposite-logical-vectors | error | PASS | Each pointer states one positive gate; the hook states each value once |
| flag-resolution-single-source | warning | PASS | `flags.commitWaves` is still resolved only by `execute.js` |
| state-premise | error | PASS | Key Decisions states it |
| smallest-viable-cut | warning | PASS | Moves are verbatim; only ruled lines change |
| failure-audience | warning | PASS | Key Decisions names it |
| explicit-non-goals | warning | PASS | Key Decisions lists them |
| ambiguity-stops-and-asks | error | PASS | Key Decisions (a), (b), (c) and X1 are ruled (ruling w3-planreview, accepted); the tasks STOP on any anchor mismatch |
| state-machine-idempotency | error | PASS | The hook is read-only for state; no migration |
| agent-dispatch-script-driven | error | PASS | No dispatch parameter changes |
| flag-semantic-consistency-cross-skill | error | PASS | `--commit-waves` semantics unchanged |
| workspace-mode-compatibility | error | PASS | The hook keeps `sameWorktree`; `git commit -F` runs in the active checkout like `-m` did |
| prompt-cache-hit-ratio | warning | PASS | `startup`/`clear` banners stay byte-identical; only `compact` gains a line |

## Suggested Review Dimensions

Advisory only (G17). These suggestions are not plan tasks: this wave edits nothing under `.sdlc/` or `.github/`, so they go to the orchestrator as follow-ups.

### UPDATE: hook-readiness (B1)

**Why**: P2 Task 3 changes the session-start hook output contract (new resolved/none `execute-resume:` line) in plugins/sdlc-utilities/hooks/session-start.js, which no hook-readiness trigger matches.
**Severity hint**: high
**Patch**: Add trigger `**/hooks/*.js` so hook scripts that emit session-start context lines are reviewed for hook-readiness.
**Action (dimension)**: Edit .sdlc/review-dimensions/hook-readiness.md: append `**/hooks/*.js` to triggers[] (strengthen-only; keep every checklist item)

### UPDATE: runtime-contract (B1)

**Why**: P2 Task 3 adds an `execute-resume:` line to the hook output that P2 Task 4 (SKILL.md post-compact branch) consumes, so a hook-to-skill format contract changes, while runtime-contract triggers do not cover hooks/*.js.
**Severity hint**: high
**Patch**: Add trigger `**/hooks/*.js` and a checklist item that hook-emitted line formats (e.g. `execute-resume:`) match the SKILL.md branch that parses them.
**Action (dimension)**: Edit .sdlc/review-dimensions/runtime-contract.md: append `**/hooks/*.js` to triggers[] and add one checklist item for hook-output line format agreement (strengthen-only)
**Action (Copilot mirror, X1)**: regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: skill-architecture (U2)

**Why**: P2 Task 1 creates companion files skills/execute-plan-sdlc/openspec-tasks.md and commit-waves.md (progressive-disclosure split), which skill-architecture triggers do not match.
**Severity hint**: medium
**Patch**: Add trigger `**/skills/**/*.md` (or the named companion files) so moved skill content gets structural and cross-reference review.
**Action (dimension)**: Edit .sdlc/review-dimensions/skill-architecture.md: append `**/skills/**/*.md` to triggers[] (strengthen-only)

## Tasks

Rules for every task (for the executor; each task's **Notes:** repeats the worker rules, because workers receive only their task's fact sheet):
- On a classifier refusal, stop and report it. Never switch tools to get past one.
- Fetch public docs with WebFetch only (ruling w4-curl).
- Never run a fixture `setup.sh` by hand (ruling stop-4). The promptfoo provider runs fixtures; this plan's workers run no promptfoo at all.
- Write files with the Write or Edit tool. A shell heredoc that writes a file must be quoted (`<<'EOF'`).
- Apply only the Change. Leave everything under Must not touch byte-identical (plan §0 rule 3).
- Never run `claude`, `claude -p` or `claude plugin eval`, and run no promptfoo case at all (ruling stop-w3-1).
- Before any Bash call that contains backticks or a `$(…)` command substitution, re-read it for unintended execution (ruling stop-w3-1).

### Task 1: Move the OpenSpec and commit-waves blocks into two companion files

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** build

**Files:**
- Create: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` — OpenSpec context loading, task-flip map, 5d-bis, sync warnings, archive suggestion (moved).
- Create: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` — `--commit-waves` flag sources and help, 5c-quater (moved).
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — seven ranges replaced by pointers.

**Notes:** Implements W5.4 Change (move + pointers), rulings Q1, Q2 (a), Q3 (the block moves), Q7 (F-skill-md-move-blocks-and-consumers-1…5). The script refuses to run unless SKILL.md is byte-identical to 710c438, so it must run before any other SKILL.md edit. It replaces ranges bottom-up. Worker rules (ruling stop-w3-1 and standing rulings): write files with the Write or Edit tool, never with a shell heredoc (an unavoidable heredoc is quoted, `<<'EOF'`); never run `claude`, `claude -p` or `claude plugin eval`; before any Bash call that contains backticks or a dollar-paren command substitution, re-read it for unintended execution; on a classifier refusal, stop and report it, never switch tools to get past it; fetch public docs with WebFetch only; never run a fixture `setup.sh` by hand.

**Steps:**
1. Confirm the precondition: `git diff --quiet 710c438 -- plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md; echo $?` prints `0`. Otherwise STOP.
2. Write the script below with the Write tool to a file OUTSIDE the work tree, `$TMPDIR/w54-move.js` (use the absolute path `echo "$TMPDIR"` prints; if `TMPDIR` is empty use `/tmp`).
3. From the repository root run `node "$TMPDIR/w54-move.js"`. Expected stdout, exactly: `ok: SKILL.md 949 -> 827 lines; openspec-tasks.md and commit-waves.md written`. Any `STOP:` line → STOP and report it; do not patch the script.
4. Delete the script file you created.

```js
// W5.4 move: builds openspec-tasks.md and commit-waves.md from SKILL.md at 710c438
// (byte-for-byte line ranges) and replaces each range in SKILL.md with its pointer.
// Run from the repository root: node <this file>. Exits 1 without writing on any mismatch.
'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const DIR = 'plugins/sdlc-utilities/skills/execute-plan-sdlc/';
const SK = DIR + 'SKILL.md';
const base = execFileSync('git', ['show', '710c438:' + SK], { encoding: 'utf8' });
if (fs.readFileSync(SK, 'utf8') !== base) {
  console.error('STOP: SKILL.md differs from 710c438; this script runs on the unedited file only.');
  process.exit(1);
}
const L = base.split('\n'); // L[n - 1] is line n
const lines = (a, b) => L.slice(a - 1, b).join('\n');

// Anchor check: the first and last line of every range, by content (plan §0 rule 2).
const anchors = [
  [75, '**OpenSpec context loading (optional):**'],
  [77, '**OpenSpec task-flip map (implements R37 — Fixes #414):**'],
  [152, '**Parse `--commit-waves` (R35):**'],
  [156, '| `--commit-waves` | Commit each completed wave'],
  [510, '**5c-quater. Per-wave WIP commit (Fixes #392 / R35)'],
  [543, '5. Workspace compatibility: state writes route through'],
  [598, '**5d-bis — OpenSpec task flip (implements R37, R39, I13, E14 — Fixes #414).**'],
  [626, 'Wave abort on `markTaskDone` failure is FORBIDDEN.'],
  [766, '**OpenSpec sync warnings (implements R39 — Fixes #414):**'],
  [772, 'When the array is empty (the happy path), omit the section entirely.'],
  [884, 'If `openspecSpecs` was loaded in Step 1 (the plan was OpenSpec-sourced)'],
  [935, '   ```'],
  [937, 'The archive suggestion is **never auto-executed**'],
];
for (const [n, start] of anchors) {
  if (!L[n - 1].startsWith(start)) {
    console.error(`STOP: line ${n} does not start with ${JSON.stringify(start)}`);
    process.exit(1);
  }
}
for (const n of [74, 76, 78, 151, 157, 509, 544, 597, 627, 765, 773, 883, 936]) {
  if (L[n - 1] !== '') {
    console.error(`STOP: line ${n} is not blank`);
    process.exit(1);
  }
}

const openspecTasks = [
  '# OpenSpec tasks (execute-plan-sdlc)',
  '',
  'Read on demand from SKILL.md, only when the prepare output carries OpenSpec context (R-progressive-disclosure). Each section below is moved from SKILL.md; the SKILL.md step that points here says when to follow it. The archive-suggestion section validates through `openspec-step.js validate`; everything else is unchanged.',
  '',
  '## OpenSpec context loading (Step 1)',
  '',
  lines(75, 75),
  '',
  '## OpenSpec task-flip map (Step 1)',
  '',
  lines(77, 77),
  '',
  '## 5d-bis — OpenSpec task flip',
  '',
  lines(598, 626),
  '',
  '## OpenSpec sync warnings (Step 9)',
  '',
  lines(766, 772),
  '',
  '## Archive suggestion (Step 9, What\'s Next)',
  '',
  lines(884, 935),
  '',
].join('\n');

const commitWaves = [
  '# Per-wave WIP commits (`--commit-waves`)',
  '',
  'Read on demand from SKILL.md, only when `flags.commitWaves` is true (R-progressive-disclosure). Both sections are moved from SKILL.md; the 5c-quater commit runs from a message file (`git commit -F`), everything else is unchanged.',
  '',
  '## Flag sources and help',
  '',
  lines(152, 156),
  '',
  '## 5c-quater — per-wave WIP commit',
  '',
  lines(510, 543),
  '',
].join('\n');

const P = {
  75: '**OpenSpec context loading (optional):** When `openspec.specFiles` in the prepare output is non-empty → Read `./openspec-tasks.md` and follow its "OpenSpec context loading" section; otherwise `openspecSpecs` stays empty. Do not read preemptively.',
  77: '**OpenSpec task-flip map (R37):** When `openspec.taskMap` in the prepare output is non-empty → Read `./openspec-tasks.md` and follow its "OpenSpec task-flip map" section. Do not read preemptively.',
  152: '**Parse `--commit-waves` (R35):** Read `flags.commitWaves` (default `false`). When it is true → Read `./commit-waves.md` at Step 5c-quater; it also holds the flag\'s sources and help. Do not read preemptively.',
  510: '**5c-quater. Per-wave WIP commit (R35).** When `flags.commitWaves` is true → Read `./commit-waves.md` and follow it after G9 + G11 pass.',
  598: '**5d-bis — OpenSpec task flip (R37, R39).** When `openspec.taskMap` in the prepare output is non-empty → Read `./openspec-tasks.md` and follow its 5d-bis section after the wave\'s `task-done` writes. Do not read preemptively.',
  766: '**OpenSpec sync warnings (R39):** When `openspecSyncWarnings` (Step 5d-bis) is non-empty → Read `./openspec-tasks.md` and follow its "OpenSpec sync warnings" section; otherwise omit the section.',
  884: 'If `openspecSpecs` was loaded in Step 1 (the plan was OpenSpec-sourced) → Read `./openspec-tasks.md` and follow its "Archive suggestion" section: it validates the change and applies the tasks.md coverage gate (R38) before any archive suggestion. Do not read preemptively.',
};
// Ranges replaced bottom-up so earlier line numbers stay valid.
const ranges = [[884, 935], [766, 772], [598, 626], [510, 543], [152, 156], [77, 77], [75, 75]];
const out = L.slice();
for (const [a, b] of ranges) out.splice(a - 1, b - a + 1, P[a]);

fs.writeFileSync(DIR + 'openspec-tasks.md', openspecTasks);
fs.writeFileSync(DIR + 'commit-waves.md', commitWaves);
fs.writeFileSync(SK, out.join('\n'));
console.log(`ok: SKILL.md ${L.length - 1} -> ${out.length - 1} lines; openspec-tasks.md and commit-waves.md written`);
```

**Must not touch:** every SKILL.md line outside the seven ranges (in particular 8-bis `:703-720`, `:761-764`, `:937-939`, Step 5c.0 `:404`, the resume steps `:102-119`); `state/execute.js`; every other file.

**Acceptance criteria:**
- [ ] The script printed the expected `ok:` line.
- [ ] `ls plugins/sdlc-utilities/skills/execute-plan-sdlc/` lists `commit-waves.md` and `openspec-tasks.md` next to the five existing companions and SKILL.md.
- [ ] `grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `1`.
- [ ] `grep -cF 'Read `./openspec-tasks.md`' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `5` and `grep -cF 'Read `./commit-waves.md`' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `2`.

**Contract:**
- shape (docs): as in Contract Examples ("docs"); the script above is the exact rendering.
- names: the two files and their seven section headings; pointer texts as in `P` above.
- mirror: `plugins/sdlc-utilities/skills/ship-sdlc/openspec-steps.md`.
- decisions: Key Decisions (b), (c), (d).
- sync: spec R-progressive-disclosure; Task 2 (edits inside the moved text).

### Task 2: Apply the ruled changes inside the moved text (Q3, Q4)

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** build

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` (created by Task 1) — X1 (validate swap), X2 (the `:899` clause), X3 (TODO line).
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` (created by Task 1) — X4 (`git commit -F`).

**Notes:** Implements rulings Q3 and Q4 (owner Q19d; F-skill-md-move-blocks-and-consumers-3, -4). These are the only lines of the moved text that change. The move diff proof in the Verification header shows them as the only hunks. Apply each pair with the Edit tool (Old must occur once). Worker rules (ruling stop-w3-1 and standing rulings): write files with the Write or Edit tool, never with a shell heredoc (an unavoidable heredoc is quoted, `<<'EOF'`); never run `claude`, `claude -p` or `claude plugin eval`; before any Bash call that contains backticks or a dollar-paren command substitution, re-read it for unintended execution; on a classifier refusal, stop and report it, never switch tools to get past it; fetch public docs with WebFetch only; never run a fixture `setup.sh` by hand.

**Anchors (run after Task 1; each must print `1`):**

```bash
D=plugins/sdlc-utilities/skills/execute-plan-sdlc
grep -cF 'Call `lib/openspec.js::validateChangeStrict(projectRoot, name)` via Bash:' $D/openspec-tasks.md
grep -cF 'using the same injected `<PLUGIN_ROOT>` path + env-var contract as the `markTaskDone` block in Step 5d-bis:' $D/openspec-tasks.md
grep -cF 'OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \' $D/openspec-tasks.md
grep -cF 'git commit -m "<subject>"' $D/commit-waves.md
```

If any count is not `1`, STOP and report.

**Must not touch:** every other line of both files; in particular the `parseTasks` `node -e` body, the `## Out-of-scope OpenSpec tasks` parsing rules, the 5d-bis flip block, the `wave-committed` call, and the `git add -A` line.

**Acceptance criteria:**
- [ ] `grep -c 'node -e' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `1`.
- [ ] `grep -c 'openspec-step.js" validate --change' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `1`.
- [ ] `grep -c 'TODO(#9165)' plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md` prints `1`.
- [ ] `grep -c 'git commit -F "$MSG_FILE"' plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` prints `1` and `grep -c 'git commit -m' plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md` prints `0`.

**Contract:**
- shape (docs): the four Old/New pairs below, verbatim.
- names: `openspec-step.js validate --change`; `{ ok, cliAvailable, stderr }`; `MSG_FILE`; `TODO(#9165)`.
- mirror: the 5d-bis flip block (single-quoted variable, then the double-quoted argument; "handled like" rule for non-JSON output).
- decisions: Deviations rows "Usage-error handling of `validate`" and "Comment line in the Q4 block"; Key Decision (e).
- sync: spec R35 (commit 1).

#### X1 — validate swap (ruling Q3)

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md`

Old (must occur once):

````text
2. Call `lib/openspec.js::validateChangeStrict(projectRoot, name)` via Bash:
   ```bash
   node -e "
   const { validateChangeStrict } = require('<LIB>/openspec.js');
   const result = validateChangeStrict(process.cwd(), '<name>');
   console.log(JSON.stringify(result));
   "
   ```
````

New:

````text
2. Call `openspec-step.js validate` (it wraps `lib/openspec.js::validateChangeStrict`) via Bash; inside the single-quoted value write every `'` as `'\''`:
   ```bash
   # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
   OPENSPEC_CHANGE='<name>'
   node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" validate --change "$OPENSPEC_CHANGE"
   ```
   It prints one JSON line `{ ok, cliAvailable, stderr }` and exits 0 when `ok` is true or the CLI is missing, 1 otherwise. A usage error (exit 2) or output that is not this JSON is handled like `ok === false`, with the output as `<stderr output>`.
````

#### X2 — the `:899` clause (ruling Q3)

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md`

Old (must occur once):

````text
using the same injected `<PLUGIN_ROOT>` path + env-var contract as the `markTaskDone` block in Step 5d-bis:
````

New:

````text
using the `<PLUGIN_ROOT>` path and the env-var contract below:
````

#### X3 — TODO naming the missing subcommand (ruling Q3, follow-up #9165)

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/openspec-tasks.md`

Old (must occur once):

````text
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \
````

New:

````text
     # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
     # TODO(#9165): openspec-step.js has no tasks/coverage subcommand yet; replace this node -e with it when it lands.
     OPENSPEC_LIB="<PLUGIN_ROOT>/scripts/lib/openspec.js" \
````

#### X4 — `git commit -F` from a quoted-heredoc message file (ruling Q4, owner Q19d)

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/commit-waves.md`

Old (must occur once):

````text
   git commit -m "<subject>"
   COMMIT_EXIT=$?
````

New:

````text
   MSG_FILE=$(mktemp)
   # Quoted heredoc: the subject is never shell-expanded. Keep the <subject> and EOF lines in column 1; an indented EOF never closes the heredoc.
   cat > "$MSG_FILE" <<'EOF'
<subject>
EOF
   git commit -F "$MSG_FILE"
   COMMIT_EXIT=$?
   rm -f "$MSG_FILE"
````

### Task 3: Emit the resolved `execute-resume:` line from the session-start hook

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/session-start.js` — H1 (ship flag), H2 (set it), H3 (execute block).
- Test: `tests/promptfoo/datasets/session-start-exec.yaml` — D1 (three new cases, one per value; ruling w3-plancheck m3).

**Notes:** Implements the W5.4 hook sub-item, ruling Q6 (F-session-start-execute-resume-hook-1…9). The value mapping is Key Decision (a). `startup`, `clear` and `resume` output stays byte-identical. The hook gains no write and no exit path. The worker does not run promptfoo; the executor's Verification run (a) covers this task. Worker rules (ruling stop-w3-1 and standing rulings): write files with the Write or Edit tool, never with a shell heredoc (an unavoidable heredoc is quoted, `<<'EOF'`); never run `claude`, `claude -p` or `claude plugin eval`; before any Bash call that contains backticks or a dollar-paren command substitution, re-read it for unintended execution; on a classifier refusal, stop and report it, never switch tools to get past it; fetch public docs with WebFetch only; never run a fixture `setup.sh` by hand.

**Anchors (each must print `1`):**

```bash
H=plugins/sdlc-utilities/hooks/session-start.js
grep -cF "    const shipFound = findStateFile('ship', branchSlug);" $H
grep -cF "            resumeLines.push('  Resume with: /ship-sdlc --resume');" $H
grep -cF '          // guardrail). The hook is layer-agnostic: when both ship and execute' $H
grep -cF 'value: "Active execution (post-compact): execute-plan-sdlc on feat/execute-and-ship"' tests/promptfoo/datasets/session-start-exec.yaml
```

If any count is not `1`, STOP and report.

**Must not touch:** the ship block's conditions and lines; `sameWorktree`; the legacy `Active execution:` line; the sidecar sweep; every other dataset case.

**Acceptance criteria:**
- [ ] `node --check plugins/sdlc-utilities/hooks/session-start.js` exits 0.
- [ ] `grep -c 'execute-resume: ' plugins/sdlc-utilities/hooks/session-start.js` prints `2` (the resolved push and the `none` push).
- [ ] `grep -c '^- description: "session-start' tests/promptfoo/datasets/session-start-exec.yaml` prints `19`.

**Contract:**
- shape (code): as in Contract Examples ("code"); Old/New pairs below.
- names: `shipBannerEmitted`, `postCompactEmitted`; values `implicit`, `deferred-to-ship`, `none`; case descriptions `session-start: matcher=compact + execute state, no ship state emits 'execute-resume: implicit' (R36)`, `session-start: matcher=compact + BOTH ship and execute states emits 'execute-resume: deferred-to-ship' (R36)`, `session-start: matcher=compact + execute state of a sibling worktree emits 'execute-resume: none' (R36)`.
- mirror: `session-start.js:162`; dataset case at `session-start-exec.yaml:80`.
- decisions: Key Decision (a).
- sync: Task 4 K1–K3; spec R36.

#### H1 — the ship-banner flag

File: `plugins/sdlc-utilities/hooks/session-start.js`

Old (must occur once):

````text
    // Check for ship state file
    const shipFound = findStateFile('ship', branchSlug);
````

New:

````text
    // Check for ship state file. shipBannerEmitted records whether the
    // `Active pipeline: ship-sdlc` line below is pushed: the execute-resume
    // line mirrors that banner, not the state file's existence (R36).
    let shipBannerEmitted = false;
    const shipFound = findStateFile('ship', branchSlug);
````

#### H2 — set the flag with the banner

File: `plugins/sdlc-utilities/hooks/session-start.js`

Old (must occur once):

````text
            resumeLines.push('  Resume with: /ship-sdlc --resume');
````

New:

````text
            resumeLines.push('  Resume with: /ship-sdlc --resume');
            shipBannerEmitted = true;
````

#### H3 — the execute block

File: `plugins/sdlc-utilities/hooks/session-start.js`

Old (must occur once):

````text
    if (executeFound) {
      const executeState = readState('execute', branchSlug);
      if (executeState && executeState.data && Array.isArray(executeState.data.waves)) {
        const waves = executeState.data.waves;
        const completedWaves = waves.filter(w => w.status === 'completed').length;
        const totalWaves = waves.length;
        if (sameWorktree(executeState.data)) {
          // Fixes #392 / R36: emit a distinct `Active execution (post-compact):`
          // line on compact matcher so execute-plan-sdlc Step 0 can treat it as
          // implicit --resume. The legacy `Active execution:` line is preserved
          // byte-stable for startup/clear/resume matchers — protects prompt-cache and
          // avoids breaking existing fast-path consumers (prompt-cache-hit-ratio
          // guardrail). The hook is layer-agnostic: when both ship and execute
          // states exist on compact, both lines are emitted; the consumer
          // (SKILL.md Step 0) discriminates (ship-sdlc owns recovery).
          if (matcherSource === 'compact') {
            resumeLines.push(`Active execution (post-compact): execute-plan-sdlc on ${branch} (wave ${completedWaves} of ${totalWaves} complete)`);
          } else {
            resumeLines.push(`Active execution: execute-plan-sdlc on ${branch} (wave ${completedWaves} of ${totalWaves} complete)`);
          }
          resumeLines.push('  Resume with: /execute-plan-sdlc --resume');
        }
      }
    }
````

New:

````text
    if (executeFound) {
      let postCompactEmitted = false;
      const executeState = readState('execute', branchSlug);
      if (executeState && executeState.data && Array.isArray(executeState.data.waves)) {
        const waves = executeState.data.waves;
        const completedWaves = waves.filter(w => w.status === 'completed').length;
        const totalWaves = waves.length;
        if (sameWorktree(executeState.data)) {
          // R36: emit a distinct `Active execution (post-compact):` line on the
          // compact matcher, followed by one resolved `execute-resume:` line that
          // execute-plan-sdlc Step 0 branches on: `implicit` (no ship banner, so
          // execute resumes itself) or `deferred-to-ship` (ship-sdlc owns
          // recovery). The legacy `Active execution:` line is preserved
          // byte-stable for startup/clear/resume matchers — protects prompt-cache and
          // avoids breaking existing fast-path consumers (prompt-cache-hit-ratio
          // guardrail).
          if (matcherSource === 'compact') {
            resumeLines.push(`Active execution (post-compact): execute-plan-sdlc on ${branch} (wave ${completedWaves} of ${totalWaves} complete)`);
            resumeLines.push(`execute-resume: ${shipBannerEmitted ? 'deferred-to-ship' : 'implicit'}`);
            postCompactEmitted = true;
          } else {
            resumeLines.push(`Active execution: execute-plan-sdlc on ${branch} (wave ${completedWaves} of ${totalWaves} complete)`);
          }
          resumeLines.push('  Resume with: /execute-plan-sdlc --resume');
        }
      }
      // R36: execute state exists but no post-compact line was emitted (no
      // waves array, or another worktree's state) — tell Step 0 explicitly.
      if (matcherSource === 'compact' && !postCompactEmitted) {
        resumeLines.push('execute-resume: none');
      }
    }
````

#### D1 — three new exec cases (one per value; ruling w3-plancheck m3)

File: `tests/promptfoo/datasets/session-start-exec.yaml`

Old (must occur once):

````text
    - type: icontains
      value: "Active execution (post-compact): execute-plan-sdlc on feat/execute-and-ship"
````

New:

````text
    - type: icontains
      value: "Active execution (post-compact): execute-plan-sdlc on feat/execute-and-ship"

- description: "session-start: matcher=compact + execute state, no ship state emits 'execute-resume: implicit' (R36)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/hooks/session-start.js"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-execute-post-compact-no-ship"
    script_stdin:
      hook_event_name: "SessionStart"
      source: "compact"
  assert:
    - type: icontains
      value: "execute-resume: implicit"
    - type: not-icontains
      value: "execute-resume: deferred-to-ship"

- description: "session-start: matcher=compact + BOTH ship and execute states emits 'execute-resume: deferred-to-ship' (R36)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/hooks/session-start.js"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-execute-post-compact-with-ship"
    script_stdin:
      hook_event_name: "SessionStart"
      source: "compact"
  assert:
    - type: icontains
      value: "execute-resume: deferred-to-ship"
    - type: not-icontains
      value: "execute-resume: implicit"

- description: "session-start: matcher=compact + execute state of a sibling worktree emits 'execute-resume: none' (R36)"
  vars:
    script_path: "repo://plugins/sdlc-utilities/hooks/session-start.js"
    script_cwd: "{{project_root}}"
    project_root: "file://fixtures-fs/project-session-start-worktree-mismatch"
    script_stdin:
      hook_event_name: "SessionStart"
      source: "compact"
  assert:
    - type: icontains
      value: "execute-resume: none"
    - type: not-icontains
      value: "Active execution (post-compact)"
````

### Task 4: Rewrite the post-compact branch, strip issue numbers, extend See Also

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1, Task 3
**Verify:** build

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — K1–K3 (Post-compact recovery), the issue-number strip, K4 (See Also).

**Notes:** Implements the W5.4 discriminator change and "strip remaining `#NNN`" (rulings Q5, Q6; F-skill-md-move-blocks-and-consumers-8, -9, -10). The three-branch text stays: only the branch conditions name the `execute-resume:` values, and the trailing layer-agnostic note goes. Apply K1–K3 first; the strip script expects the post-compact heading already rewritten. Worker rules (ruling stop-w3-1 and standing rulings): write files with the Write or Edit tool, never with a shell heredoc (an unavoidable heredoc is quoted, `<<'EOF'`); never run `claude`, `claude -p` or `claude plugin eval`; before any Bash call that contains backticks or a dollar-paren command substitution, re-read it for unintended execution; on a classifier refusal, stop and report it, never switch tools to get past it; fetch public docs with WebFetch only; never run a fixture `setup.sh` by hand.

**Steps:**
1. Run the anchor loop below.
2. Apply K1, K2 and K3 with the Edit tool.
3. Write the strip script below with the Write tool to `$TMPDIR/w54-strip.js`, outside the work tree. Run `node "$TMPDIR/w54-strip.js"` from the repository root. Expected stdout: `ok: no #NNN left in SKILL.md`. On a `STOP:` line, stop and report. Then delete the script.
4. Apply K4 with the Edit tool.

**Anchors (after Task 1; each must print `1`):**

```bash
S=plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md
grep -cF '### Post-compact recovery (Fixes #392 / R36)' $S
grep -cF '2. **`Active execution (post-compact):` present AND `Active pipeline: ship-sdlc` ALSO present**:' $S
grep -cF 'The hook is layer-agnostic (it surfaces facts); this discriminator is the consumer-side decision.' $S
grep -cF -- '- `./recovering-from-failures.md` — full error recovery playbook and escalation protocol' $S
```

If any count is not `1`, STOP and report.

```js
// W5.4: strip GitHub issue numbers from SKILL.md prose, keeping every R anchor (plan §0 rule 7).
// Run from the repository root after Task 1 and the K1–K3 edits: node <this file>.
// Each pair must occur exactly the stated number of times, or the script exits 1 without writing.
'use strict';
const fs = require('node:fs');
const SK = 'plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md';
const pairs = [
  ['(implements R41, #505)', '(implements R41)', 1],
  ['(R41, #505)', '(R41)', 1],
  ['(Fixes #392 / R35)', '(R35)', 1],
  ['(R-WAVE-RESUME-RESET, #506)', '(R-WAVE-RESUME-RESET)', 1],
  ['(R-WAVE-DEADLINE, #506)', '(R-WAVE-DEADLINE)', 2],
  ['Implements R30 (fixes #378, #379).', 'Implements R30.', 1],
  ['(R-nested-dispatch-resilient — Fixes #463)', '(R-nested-dispatch-resilient)', 1],
  ['and `R-todowrite-visibility`, issue #427)', 'and `R-todowrite-visibility`)', 1],
  ['(R-FACT-SHEET-DISPATCH, #432)', '(R-FACT-SHEET-DISPATCH)', 2],
  ['(R-CONTRACT, #459)', '(R-CONTRACT)', 1],
  ['(R-BYTE-BUDGET, #432)', '(R-BYTE-BUDGET)', 1],
  ['(R-BYTE-BUDGET, #432;', '(R-BYTE-BUDGET;', 1],
  ['R-CONTEXT_OVERFLOW, #432)', 'R-CONTEXT_OVERFLOW)', 2],
  ['(Fixes #392 / R34)', '(R34)', 1],
  ['(R-WAVE-CONTEXT-PRODUCER, #506; mandatory per R9)', '(R-WAVE-CONTEXT-PRODUCER; mandatory per R9)', 1],
  ['(R-WAVE-CONTEXT-PRODUCER, #506)', '(R-WAVE-CONTEXT-PRODUCER)', 2],
  ['(R-INVARIANT-COMPLETENESS, #432)', '(R-INVARIANT-COMPLETENESS)', 1],
  ['(R31, fixes #378, #379)', '(R31)', 1],
  ['(implements R32, addresses #379)', '(implements R32)', 1],
];
let txt = fs.readFileSync(SK, 'utf8');
for (const [from, to, want] of pairs) {
  const n = txt.split(from).length - 1;
  if (n !== want) {
    console.error(`STOP: ${JSON.stringify(from)} occurs ${n}x, expected ${want}x`);
    process.exit(1);
  }
  txt = txt.split(from).join(to);
}
const left = txt.match(/#[0-9]{3}/g) || [];
if (left.length) {
  console.error(`STOP: issue numbers left: ${left.join(' ')}`);
  process.exit(1);
}
fs.writeFileSync(SK, txt);
console.log('ok: no #NNN left in SKILL.md');
```

**Must not touch:** branch 1's and branch 2's bullets (the resume codepath, the `--auto` behaviour, the confirmation text, the deferring line); every `R…` anchor; the sentinel strings `Nested Agent dispatch is supported — being dispatched as a subagent does not remove your Agent tool` and `When ship-sdlc dispatches you as a subagent you still have the Agent tool — dispatch workers normally.`; every other SKILL.md line.

**Acceptance criteria:**
- [ ] `grep -c '#[0-9]\{3\}' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `0`.
- [ ] `grep -c 'execute-resume: ' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `4`.
- [ ] `grep -c 'layer-agnostic' plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` prints `0`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js --root .` exits 0.

**Contract:**
- shape (docs): K1–K4 Old/New below, verbatim; the strip script above (19 pairs, counts pinned).
- names: `execute-resume: implicit`, `execute-resume: deferred-to-ship`, `execute-resume: none`; heading `### Post-compact recovery (R36)`.
- mirror: the three-branch list at SKILL.md `:132-144` (structure kept).
- decisions: Key Decision (a).
- sync: Task 3 (the hook values); spec R36 (commit 1).

#### K1 — heading, scan sentence, branch 1 condition

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`

Old (must occur once):

````text
### Post-compact recovery (Fixes #392 / R36)

In addition to the explicit `--resume` flag, Step 0 MUST scan the SessionStart `<system-reminder>` context for the literal string `Active execution (post-compact):` (emitted by `hooks/session-start.js` when the matcher source is `compact` and execute state exists for the current branch):

1. **`Active execution (post-compact):` present AND `Active pipeline: ship-sdlc` ABSENT** in the same system-reminder block:
````

New:

````text
### Post-compact recovery (R36)

In addition to the explicit `--resume` flag, Step 0 MUST scan the SessionStart `<system-reminder>` context for the line `execute-resume: <value>`. `hooks/session-start.js` emits it beside the `Active execution (post-compact):` line when the matcher source is `compact` and execute state exists for the current branch, resolved from the banner lines it emits: `implicit` when it emitted `Active execution (post-compact):` without `Active pipeline: ship-sdlc`, `deferred-to-ship` when it emitted both, `none` otherwise. Branch on the value:

1. **`execute-resume: implicit`**:
````

#### K2 — branch 2 condition

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`

Old (must occur once):

````text
2. **`Active execution (post-compact):` present AND `Active pipeline: ship-sdlc` ALSO present**:
````

New:

````text
2. **`execute-resume: deferred-to-ship`**:
````

#### K3 — branch 3 condition; the layer-agnostic note goes

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`

Old (must occur once):

````text
3. **Neither signal present AND no `--resume` on CLI**: Step 0 routing is unchanged from prior behavior.

The hook is layer-agnostic (it surfaces facts); this discriminator is the consumer-side decision. Implementation: see `hooks/session-start.js` for the source-aware emission.

````

New:

````text
3. **`execute-resume: none`, or no `execute-resume:` line, AND no `--resume` on CLI**: Step 0 routing is unchanged from prior behavior.

````

#### K4 — See Also

File: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md`

Old (must occur once):

````text
- `./recovering-from-failures.md` — full error recovery playbook and escalation protocol
````

New:

````text
- `./recovering-from-failures.md` — full error recovery playbook and escalation protocol
- `./openspec-tasks.md` — OpenSpec context loading, task flip, sync warnings and archive suggestion (read only when the plan carries OpenSpec context)
- `./commit-waves.md` — `--commit-waves` flag sources and the per-wave WIP commit (read only when `flags.commitWaves` is true)
````

## Final Shape

**When all four tasks are done:**

- `plugins/sdlc-utilities/skills/execute-plan-sdlc/` holds SKILL.md plus seven companions. The two new ones are `openspec-tasks.md` (108 lines before Task 2) and `commit-waves.md` (48 lines before Task 2).
- SKILL.md is 827 lines (plan-time probe). It has seven pointers where the moved blocks were, the `execute-resume:` three-branch discriminator, no issue numbers, and one `node -e`.
- `session-start.js` prints `execute-resume: implicit|deferred-to-ship|none` on `compact` when execute state exists. `session-start-exec.yaml` has three more cases (19), one per value.
- One commit from the ship run: `refactor(#9015): execute-plan-sdlc - on-demand reference files (W5.4)`.

**Move diff proof** (Verification item 1). Run from the repository root in ONE Bash call, exactly as written. Its first line sets `PROOF` to a fresh absolute directory outside the work tree:

```bash
PROOF=/tmp/claude-1000/pf-tmp-exec-m5w3/move-proof; mkdir -p "$PROOF"
D=plugins/sdlc-utilities/skills/execute-plan-sdlc
base() { git show "710c438:$D/SKILL.md" | sed -n "$1p"; }
sec() { awk -v h="$2" 'f&&/^## /{exit} f{b[++n]=$0} $0==h{f=1;getline} END{while(n&&b[n]=="")n--;for(i=1;i<=n;i++)print b[i]}' "$D/$1"; }
chk() { diff <(base "$1") <(sec "$2" "$3") > "$PROOF/move-$4.diff"; echo "$4 diff-exit=$?"; }
chk 75,75 openspec-tasks.md '## OpenSpec context loading (Step 1)' ctx
chk 77,77 openspec-tasks.md '## OpenSpec task-flip map (Step 1)' flipmap
chk 598,626 openspec-tasks.md '## 5d-bis — OpenSpec task flip' 5dbis
chk 766,772 openspec-tasks.md '## OpenSpec sync warnings (Step 9)' syncwarn
chk 884,935 openspec-tasks.md "## Archive suggestion (Step 9, What's Next)" archive
chk 152,156 commit-waves.md '## Flag sources and help' flags
chk 510,543 commit-waves.md '## 5c-quater — per-wave WIP commit' 5cquater
cat "$PROOF/move-archive.diff" "$PROOF/move-5cquater.diff"
```

Expected output (plan-time probe, byte for byte). Five blocks are identical (`diff-exit=0`). The archive block differs only by the Q3 hunks (X1–X3), and 5c-quater only by the Q4 hunk (X4):

```text
ctx diff-exit=0
flipmap diff-exit=0
5dbis diff-exit=0
syncwarn diff-exit=0
archive diff-exit=1
flags diff-exit=0
5cquater diff-exit=1
4c4
< 2. Call `lib/openspec.js::validateChangeStrict(projectRoot, name)` via Bash:
---
> 2. Call `openspec-step.js validate` (it wraps `lib/openspec.js::validateChangeStrict`) via Bash; inside the single-quoted value write every `'` as `'\''`:
6,10c6,8
<    node -e "
<    const { validateChangeStrict } = require('<LIB>/openspec.js');
<    const result = validateChangeStrict(process.cwd(), '<name>');
<    console.log(JSON.stringify(result));
<    "
---
>    # Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
>    OPENSPEC_CHANGE='<name>'
>    node "<PLUGIN_ROOT>/scripts/skill/openspec-step.js" validate --change "$OPENSPEC_CHANGE"
11a10
>    It prints one JSON line `{ ok, cliAvailable, stderr }` and exits 0 when `ok` is true or the CLI is missing, 1 otherwise. A usage error (exit 2) or output that is not this JSON is handled like `ok === false`, with the output as `<stderr output>`.
16c15
<    - Re-parse `openspec/changes/<name>/tasks.md` via `lib/openspec.js::parseTasks` using the same injected `<PLUGIN_ROOT>` path + env-var contract as the `markTaskDone` block in Step 5d-bis:
---
>    - Re-parse `openspec/changes/<name>/tasks.md` via `lib/openspec.js::parseTasks` using the `<PLUGIN_ROOT>` path and the env-var contract below:
19a19
>      # TODO(#9165): openspec-step.js has no tasks/coverage subcommand yet; replace this node -e with it when it lands.
12c12,17
<    git commit -m "<subject>"
---
>    MSG_FILE=$(mktemp)
>    # Quoted heredoc: the subject is never shell-expanded. Keep the <subject> and EOF lines in column 1; an indented EOF never closes the heredoc.
>    cat > "$MSG_FILE" <<'EOF'
> <subject>
> EOF
>    git commit -F "$MSG_FILE"
13a19
>    rm -f "$MSG_FILE"
```

**`openspec` lines left in SKILL.md** (Verification item 4; plan-time probe, 13 lines). Every line is common-path text or a pointer (ruling Q5). Line numbers are from the probe; match each by content:

| Probe line | Content (start) | Class |
|---|---|---|
| 55 | `Check \`EXIT_CODE\` first. …` (lists the prepare fields, `openspec` among them) | common-path |
| 75 | `**OpenSpec context loading (optional):** When \`openspec.specFiles\` …` | pointer |
| 77 | `**OpenSpec task-flip map (R37):** When \`openspec.taskMap\` …` | pointer |
| 559 | `**5d-bis — OpenSpec task flip (R37, R39).** When \`openspec.taskMap\` …` | pointer |
| 571 | `- When \`openspecSpecs\` is available: …` (5e critique) | common-path |
| 638 | `Runs when \`flags.specReviewer === 'once'\` …` (8-bis, stays: Q2 a) | common-path |
| 646 | `- When \`openspecSpecs\` is non-empty, in the \`{OPENSPEC_DELTA_SPECS}\` section …` (8-bis) | common-path |
| 694 | `If \`openspecSpecs\` was loaded in Step 1, append to the report:` | common-path |
| 696 | `OpenSpec:         openspec/changes/<name>/ — run openspec validate …` (report sample) | common-path |
| 699 | `**OpenSpec sync warnings (R39):** When \`openspecSyncWarnings\` …` | pointer |
| 726 | `\| Final spec completeness \| … (when openspecSpecs available) \|` | common-path |
| 811 | `If \`openspecSpecs\` was loaded in Step 1 (the plan was OpenSpec-sourced) → Read \`./openspec-tasks.md\` …` | pointer |
| 822 | `- \`./openspec-tasks.md\` — OpenSpec context loading, …` (See Also) | pointer |

**Release list** (plan source item 4; for the CHANGELOG): see "User-visible changes" under Context.

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)*

Review round 1 (Step 3 lanes + Step 5 lenses, one set over all three wave-3 plans): 5 lanes, 3 lenses (architecture, requirements, risk; sonnet, opposite of the opus author). All three lenses: Approved. Blocking lane issues fixed in Step 4: G10 ×2 (Modify of files created by Task 1 → annotated), G4 (cross-plan SKILL.md order → plan-3 precondition). Warnings fixed: G15 citations, G6 (plan 3 Task 4 → Standard), G1 (worker rules, consumer grep). Advisory fixes after round 1 (not material): sync-warnings pointer made a Read pointer, Key Decision (b) coupling note, B15/B16 order.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 4 | 3 |
| Correctness | 0 | 1 | 3 | 3 |
| Coherence | 0 | 0 | 7 | 3 |

| Requirement | Covering task(s) | Status |
|---|---|---|
| R3 one ship run, one commit | header | covered |
| R4 5d-bis move (Q1) | Task 1 | covered |
| R5 8-bis stays (Q2 a) | Task 1 (Must not touch) | covered |
| R6 Step 9 archive move + Q3 swaps | Tasks 1, 2 | covered |
| R7 context loading / flip map / sync warnings | Task 1 | covered |
| R8 5c-quater + Q4; parse table (Key Decision b) | Tasks 1, 2 | covered |
| R9 execute-resume hook line + SKILL.md + one case per value (m3) | Tasks 3, 4 | covered |
| R10 #NNN strip; See Also | Task 4 | covered |
| R11 must-not-touch | all tasks | covered |
| R12 final verification set | header Verification | covered |
| R18 all-plan rules (anchors, commands run as written, worker rules, validators) | all tasks | covered |

**Verdict:** Ready for archive (with noted improvements).

## OpenSpec Appendix

Not applicable — no OpenSpec change
