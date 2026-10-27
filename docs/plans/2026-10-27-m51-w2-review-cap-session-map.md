# M5.1 Wave 2 — Review Dispatch in Batches (W8.31) and the Session-Map Helper (W8.26) Implementation Plan

**Goal:**
- **W8.31 (group A).** The review cap drops no matching dimension:
  - `review.js` gives every dispatched dimension a `batch` index (8 per batch, in priority order) instead of demoting the rest to `QUEUED`;
  - the review orchestrator dispatches batch after batch and awaits every result;
  - `hook-readiness` matches hook scripts (`**/hooks/*.js`).
- **W8.26 (group B).** A new read-only CI script, `session-map.js`, builds the `session-cost.js --sessions` map from the agents' worktree paths and time windows, using transcript metadata up to the first user message only.

**Architecture:** This is the ruled second planned run of the branch. The executor runs exactly `/sdlc:execute-plan-sdlc --plan docs/plans/2026-10-27-m51-w2-review-cap-session-map.md --auto --quality balanced --rebase skip` directly, not through ship (ruling w1-oneship; ruling w2-preflight D2). The flags mirror the ship line of ruling w1-shipauto (`--auto … --rebase skip --quality balanced`), so no tier prompt or rebase question is asked (plan review m1). `execute.js` accepts all three (`VALUE_FLAGS` `:80`, `VALID_REBASE` `:55`). Execute does not commit: `commitWaves` stays off (the default). After the run, the executor makes two direct wrapper commits with literal subjects and disjoint file lists, W8.31 first:

1. `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "fix(#9019): review-sdlc - dispatch every dimension in batches (W8.31)" <body-file> plugins/sdlc-utilities/scripts/skill/review.js plugins/sdlc-utilities/agents/review-orchestrator.md plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md .sdlc/review-dimensions/hook-readiness.md tests/promptfoo/datasets/review-prepare-exec.yaml tests/promptfoo/datasets/review-sdlc.yaml tests/promptfoo/fixtures/project-with-queued-dimensions.md tests/promptfoo/fixtures-fs/review-cap-dimensions/.sdlc/review-dimensions/cap-d01.md … cap-d17.md` (all 17 listed literally). Subject 69 characters.
2. `bash /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/commit-planned.sh "feat(#9019): ci - session-map builds the session-cost map (W8.26)" <body-file> plugins/sdlc-utilities/scripts/ci/session-map.js plugins/sdlc-utilities/scripts/README.md tests/promptfoo/datasets/session-map-exec.yaml tests/promptfoo/promptfooconfig-exec.yaml <the 14 files under tests/promptfoo/fixtures-fs/session-map/, listed literally>`. Subject 65 characters.

Both subjects match `commit.subjectPattern` and are at most 72 characters (checked with python3). Each body file is written with the Write tool under `$TMPDIR`, has no `Co-Authored-By` line and is removed after its commit. The run's dispatches get only the verbatim hard-rule block, nothing else (ruling stop-6 Q1, applied to this run by ruling w2-preflight D2).

Preconditions: the direct-a plan is done (S4 is on the branch), the ship run's commit is on the branch, and `git status --porcelain` prints nothing.

This plan has no `**Commit:**` header field (it is not run by ship).

**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/wave-2-plan-source.md (plan 3; D-31, D-31v, D-26; amendments 2 and 5), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/item-W2W3-bae33fd.md (W8.31 Changes 2–5, W8.26), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w2-plan.md (Q1), /workspace/sdlc-marketplace/.sdlc/orchestration/m5.1/ruling-w2-preflight.md (Q3, D2), /workspace/sdlc-marketplace/.sdlc/orchestration/ruling-pr40.md

**Verification:** with PF-ENV (one Bash call that starts with `export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR=<a fresh scratch dir outside every work tree>;`):

- W8.31 (1): `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . 2>/dev/null; echo "exit=$?"` prints only `exit=0` (as at bae33fd and after S4).
- W8.31 (2): `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "review-cap|review-prepare"`: 19 passed, 0 failed (15 at bae33fd plus 4).
- W8.31 (3): `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0. The bare `validate-dimensions.js` command (ruling w2-preflight Q3; a named Verification command under ruling w2-judge row 52, not an adapted one):

  ```bash
  node plugins/sdlc-utilities/scripts/ci/validate-dimensions.js | node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const o=JSON.parse(s);const d=o.dimensions.find(x=>x.name==="hook-readiness");console.log(o.summary.total+" "+o.summary.fail+" "+d.status+" "+o.overall)})'; echo "exit=${PIPESTATUS[0]}"
  ```

  Output at bae33fd (run by the planner): `14 0 PASS PASS` and `exit=0`. Expected after Task 3: the same two lines (prediction: the added trigger is a quoted glob like the other three).
- W8.31 (4): the one behavioural case, the updated `review-sdlc.yaml` case `"review-sdlc: cap applied dispatches all dimensions in batches of 8"`. It may run ONCE at the final head as the single targeted LLM case, with no retries (ruling w2-plan Q1). The orchestrator decides whether it runs; the executor does not run it unasked.
- W8.26: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "session-map|session-cost"`: 19 passed, 0 failed (13 at bae33fd plus 6). Also `node plugins/sdlc-utilities/scripts/ci/session-map.js --help; echo "exit=$?"` prints the usage text and `exit=0`, and `check-consistency.js` exits 0. No behavioural run.

---

## Context

**What problem does this change solve?**

- **W8.31.** `review.js` keeps only the top 8 ACTIVE dimensions and marks the rest `QUEUED`; the orchestrator never dispatches them. Every ACTIVE dimension matched a changed file, so the cap silently skipped review on real changes (`hook-readiness` and `type-safety-review` on PRs #37 and #39). Separately, `hook-readiness` did not match `plugins/sdlc-utilities/hooks/*.js` at all (#9166).
- **W8.26.** The per-wave cost report needs a `session-cost.js --sessions` map of tag → transcripts. The owner built the M4.1 map by hand. No script builds it.

**What prompted this change now?**

- Arbiter ruling pr40 chose batches of 8 for as many batches as needed (not a higher cap). Ruling w2-plan Q1 extended W8.31's Files with `REFERENCE.md` and the behavioural fixture. The owner asked for the map helper (W8.26, 2026-10-22).

**What does success look like?**

- The `review-cap:` cases show batches 1..⌈N/8⌉ for 10, 8 and 17 matching dimensions, none `QUEUED`, and `hook-readiness` matching `hooks/session-start.js`.
- The six `session-map:` cases pass, including one where `session-cost.js` accepts the produced map.

---

## Research Findings

Line numbers at bae33fd.

- **Cap code.** `review.js` `refinePlan` (`:432-458`) sorts ACTIVE dimensions by `SEVERITY_RANK` (`:335`) descending, then `matched_files.length` ascending. It sets the rest to `QUEUED` (`:451`). It is called at `:624` as `const queued = refinePlan(dims);`.
  - The manifest carries `plan_critique.queued_dimensions: queued` (`:658`) and `summary.queued_dimensions: queued.length` (`:664`).
  - `toIndexEntry` (`:311-329`) sets `slice_file` only for ACTIVE/TRUNCATED.
  - Slices are written for every ACTIVE/TRUNCATED dimension before `refinePlan` (`:616-620`).
  - `critiquePlan` sets `dimensionCapApplied: active.length > 8` (`:366`).
  - Exports `:686`: `globToRegex, matchFiles, loadAndMatchDimensions, analyzeUncoveredFiles, UNCOVERED_PATTERN_CATALOG, writeDimensionSlices, toIndexEntry`.
- **Orchestrator.** `agents/review-orchestrator.md`:
  - `:53` `- **Queued** (`queued_dimensions`): note they were capped out`;
  - `:88` dispatches ACTIVE/TRUNCATED;
  - `:99` "Dispatch ALL active dimensions in a SINGLE message";
  - `:101` the await barrier (N = count of ACTIVE or TRUNCATED);
  - `:105` the await guard.
  - `check-consistency.js` rule `orchestrator-await-barrier` (`:727-745`) requires the barrier tokens, and they stay.
- **REFERENCE.md** (`skills/review-sdlc/REFERENCE.md`): the example entry ends with `slice_file` at `:45`; `:60-61` and `:67` carry `dimension_cap_applied`/`queued_dimensions`; `:76` lists `QUEUED` among the status values; `:80` says "(SKIPPED/QUEUED)".
- **Behavioural fixture.** `tests/promptfoo/fixtures/project-with-queued-dimensions.md`: 10 dimensions, accessibility and internationalization `QUEUED` (`:77-78`), cap text at `:5` and `:36`, `plan_critique` `:85-86`, summary `:90-92`. The case is `review-sdlc.yaml:169-190`. Six other review fixtures carry `"queued_dimensions": []`; they stay valid.
- **Synthetic fixture probe.** The planner wrote 17 dimension files of the shape in Task 2 into a scratch dir. Against the current code they validate, and 8, 10 and 17 of them are ACTIVE for the three changed-file lists.
  - The planner also applied Task 1's `review.js` change to a scratch copy and ran the four case `-e` strings the way `script-runner.js` runs them (split on whitespace). With the planned code, cases (a), (b), (b2) and (c) all passed. With the current code, (a)–(b2) fail (no `refinePlan` export) and (c) fails (`hook-readiness` SKIPPED).
- **Dimension matching.** `globToRegex("**/hooks/*.js")` matches `plugins/sdlc-utilities/hooks/session-start.js`; `**/scripts/*.js` does not. Checked with the exported function.
- **session-cost contract.** `session-cost.js`:
  - `:13-16`: an entry ending in `.jsonl` or containing `/` is a transcript path relative to `--projects-dir`;
  - `:17` `--projects-dir` defaults to `~/.claude/projects`;
  - `:24` `aux-` tags stay out of `total`;
  - `validateSessions` (`:482-492`) accepts any tag → array of non-empty strings, an empty array included.
  - A scratch probe ran `session-cost.js --sessions <map> --projects-dir <scratch projects> --prices tests/promptfoo/fixtures-fs/session-cost/prices.json --json` on a map `{"orch":["-fixture-wt-a/s-a1.jsonl"],"exec":[]}` over a synthetic transcript of Task 7's shape: exit 0.
- **Project-dir encoding (D-26).** Evidence from directory NAMES only: `ls ~/.claude/projects` lists 78 names, 0 with a character outside `[A-Za-z0-9-]`, and 46 contain `--`. Example: the cwd `/home/developer/.herdr/worktrees/…` is the directory `-home-developer--herdr-worktrees-…`, so `/` and `.` both become `-`. No real transcript was opened (item Guardrail, ruling w13-modifiers).
- **Consumer grep (addendum C9).** At bae33fd, `grep -rlE 'QUEUED|queued_dimensions|refinePlan|dimension_cap_applied' tests/promptfoo docs site/src plugins .claude` (plans excluded) lists:
  - `review.js`, `review-orchestrator.md`, `REFERENCE.md` and the review spec (all edited by W8.31 or S4);
  - `site/src/content-source/specs/review-sdlc.md` (C-docs mirror);
  - `review-sdlc.yaml` and seven behavioural fixtures. Six of the fixtures carry only `"queued_dimensions": []` / `"dimension_cap_applied": false`, which stay valid; the seventh is the one Task 5 rewrites.
  - `session-cost.js` is used by `session-cost-exec.yaml`, `docs/cost-tiers.md` and the scripts README; it is not edited, and its cases are re-run in Verification W8.26.
- **README.** `plugins/sdlc-utilities/scripts/README.md:23-30` has the `ci/` section ("two read-only reporting scripts") and its table rows for `session-cost.js` and `wave-metrics.js`.
- **Config.** `promptfooconfig-exec.yaml` ends with `  - file://datasets/session-cost-exec.yaml` (`:84`; direct-a Task 19 inserts one line at `:64`, so re-locate by content).

---

## Plan readings

Quoted from the plan source "Readings" list:

- **Spec-first** (arbiter 2026-10-20): "spec-consequence commits go FIRST". → S4 (direct-a Task 4) precedes this run. W8.26 has no spec (a CI script).
- **One ship run per wave branch**: "If a wave really needs two planned runs, the second one uses `/sdlc:execute-plan-sdlc` directly". → This run.
- **Direct commits** (ruling commit-wrapper item 1): one call of `commit-planned.sh` per commit; "the body file has NO `Co-Authored-By` line (ruling w3-trailers); the subject is passed literally (ruling stop-3)." → The two commits after the run.
- **No steering in ship-run dispatches** (ruling stop-6 Q1) and the **verbatim hard-rule block in every dispatch prompt** (ruling stop-5 Q3, widened by ruling stop-6 Q2). → Applied to this run's dispatches (ruling w2-preflight D2): they get only this block, copied as one block:
  `HARD RULES (verbatim): never run a fixture setup.sh by hand, not even in a scratch copy; never rm another agent's or another dispatch's files; no repo-file writes by shell; no claude commands except claude plugin validate; no pkill/killall; kill only by a PID you started yourself (or TaskStop).`
- **Repo files by Write/Edit only** (ruling stop-4 item 1): "Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed." → Every task.
- **Subjects ≤ 72 characters** (ruling w1-phaseS item 2). → 69 and 65.
- **Fixture guard** (rulings stop-4 item 4, stop-8 item 1). → Both new fixtures are plain files with no `setup.sh`.
- **Classifier refusals** (ruling w4-curl): "the task text tells execute's workers to stop and report on a classifier refusal and never switch tools; public docs only via WebFetch." → Every task.
- **Worker temp files** (ruling stop-w3-2): "a worker's ephemeral temp file is created under `$TMPDIR` and removed in its own run; none is left behind." → Every task. Fact sheets from this run name the run's scratch directory only after the fork install (W8.33), so the task text states it.
- **No adapted verification** (ruling w2-judge row 52). → The bare `validate-dimensions.js` command above was run as written.
- **Bypass-absence checks** (ruling w1b-planok m2). → Case (f) of W8.26 asserts absence of `usd`/`token` over the full JSON output, and case (a) proves that output is non-empty.
- **R27 learnings append** (ruling scan-r3-and-r27): "execute-plan-sdlc may skip it when the hard rules forbid the write; the skip is disclosed, the learning text named in the done-file."
- **Q22 and ruling pr40** for W8.31: batches of 8, as many as needed, no higher cap.
- **Q23 reading** (orchestrator brief reading 2) for W8.26: only `--agents` and `--events` JSON input; the script does not parse `wave-log.md` or `ledger.json`; synthetic fixtures only.
- **Files extensions:** W8.31's Files gain `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` and `tests/promptfoo/fixtures/project-with-queued-dimensions.md` — "ruling w2-plan Q1" (same class as w1-preflight Q1; cite it in the PR). No other extension.
- **Standing rule** (ruling w2-plan): "no pkill/killall; kill only by a PID you started yourself (or TaskStop)."

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| W8.31 Files + `REFERENCE.md` and `fixtures/project-with-queued-dimensions.md` | yes (ruling w2-plan Q1) | both edited; the fixture's file name stays | The item's own change makes their rows false (cite ruling w2-plan Q1 in the PR). |
| `queued_dimensions` stays as an always-empty array and 0 (D-31) | yes (ruling w2-plan Q1, "D-31 is accepted as designed") | keeps the field | Seven behavioural fixtures carry it; no consumer breaks. |
| The behavioural fixture's batch 2 holds accessibility and documentation-quality, not internationalization | no | batches follow the real priority order of the fixture's own data (low severity, matched 2 < 3 < 5) | The old fixture named the two smallest low-severity dimensions as queued, which the code never did. Same 10 dimensions, all ACTIVE, batch 1 (8) and batch 2 (2), as ruled. |
| `review-cap:` cases are inline `-e` cases over a synthetic fixture with no `setup.sh` | yes (D-31 accepted) | no new wrapper file | Keeps W8.31 inside its Files. |
| Case (c) uses a changed-file list, not a fixture diff | no | calls `loadAndMatchDimensions` with `["plugins/sdlc-utilities/hooks/session-start.js"]` over the repo's own dimensions | Matching depends only on the changed-file paths; a git fixture would need a `setup.sh` and the guard. |
| Task 2 and Task 7 each create more than 5 files | no | one task per fixture (17 and 13 small files) | Each fixture is one unit; splitting identical files across tasks adds nothing. |
| W8.26 encoding: every character outside `[A-Za-z0-9-]` becomes `-` | no | evidenced for `/` and `.` only (directory names); other characters are unproven | A wrong guess usually yields `no-project-dir` (unassigned). Two cwds that differ only in such a character would map to the same directory and collide, as they would in Claude Code's own encoding. The rule was not checked against public Claude Code docs (none consulted); it is evidenced by directory names only (disclosed in the PR list). |
| plan-sdlc learnings-log append | no | not written | The planner brief allows writes only under `docs/plans/`. |

---

## Key Decisions

1. **`refinePlan` keeps its name and assigns batches (D-31).**
   - Choice: `refinePlan(dimensions)` sorts the dispatched dimensions (ACTIVE and TRUNCATED) by the existing priority, then sets `dim.batch = ⌊i / DIMENSION_BATCH_SIZE⌋ + 1`. Every other dimension gets `batch = null`. The function returns the batch count and is exported.
   - Alternative: a new function beside a no-op `refinePlan`.
   - Why: one call site (`:624`), and the priority sort is reused unchanged. `DIMENSION_BATCH_SIZE = 8` is a script constant, because tuning values are not contract.
2. **`dimension_cap_applied` keeps its definition.** It is true when more than 8 dimensions are ACTIVE (`critiquePlan`, unchanged). The `batch` field, not the flag, drives dispatch.
3. **The await barrier rule is unchanged.**
   - R-orchestrator-await and G6 keep their text. N is still "count of dimensions with status ACTIVE or TRUNCATED", which now counts every batch.
   - The orchestrator text adds per-batch collection: all results of batch k before batch k+1. The words "across all batches" are added to N.
   - The final barrier before Step 3 is the same barrier (item Change 3). The Guardrail holds: if a later batch breaks the barrier in any case, STOP.
4. **`session-map.js` reads metadata only (D-26).**
   - It reads each top-level `<session-id>.jsonl` in chunks only up to the first user message: start = the first of those lines that carries a string `timestamp` (lines without one are skipped), prompt = that message's text, end = the file's mtime.
   - Matching is exact: same project dir, the window holds the start (`from` ≤ start < `to`; a missing bound is open), and `firstPrompt` matches if given.
   - Zero candidates → `outside-window`; more than one → `ambiguous` with the candidate tags.
   - `--events` turns each `start`/`clear` event of a (tag, cwd) into a window that ends at that pair's next event.
5. **Behavioural case (D-beh).** Only the updated `review-sdlc.yaml` case; W8.26 has none.

**Non-goals:**
- No change to `max-files` truncation, R-on-demand-force-active, the severity ranks, P11 or the summary schema, or any other dimension file.
- No change to `session-cost.js`, `session-prices.json`, `wave-metrics.js`, anything under `.sdlc/orchestration/`, or any real transcript.
- No price, token or cost field in `session-map.js` output.

**Failure audience:** review-sdlc users with more than 8 matching dimensions (and hook authors, for `hook-readiness`); the orchestration's cost reporting (W8.26).

---

## Contract Examples

```markdown
**Contract:**
- shape (code): `refinePlan(dimensions) → number` (batch count); mutates `dim.batch`; `toIndexEntry(dim).batch` is the batch for ACTIVE/TRUNCATED, else `null`.
- names: `refinePlan`, `DIMENSION_BATCH_SIZE`, `batch`.
- mirror: the current `refinePlan` sort (`review.js:441-444`).
- decisions: KD1.
- sync: R-dimension-cap (S4); `REFERENCE.md`.
```

```markdown
**Contract:**
- shape (docs): orchestrator Step 1 and Step 2 text; REFERENCE manifest example and status list.
- names: `batch`, `dimension_cap_applied`, R-orchestrator-await.
- mirror: the existing Step 2 bullets (`review-orchestrator.md:86-101`).
- decisions: KD3.
- sync: R-dimension-cap.
```

---

## Tasks

### Task 1: review.js — batch every dispatched dimension instead of queueing

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/review.js` — `toIndexEntry` (`:311-329`), `SEVERITY_RANK` neighbourhood (`:335`), `refinePlan` (`:432-458`), its call (`:624`), the manifest (`:658`, `:664`), exports (`:686`).

**Notes:** KD1, KD2. Group A (W8.31). The slices are already written for every dispatched dimension (`:616-620`), so each entry now keeps its `slice_file`. Do not raise or remove the batch size without a ruling.

**Acceptance criteria:**
- [ ] `grep -c "'QUEUED'" plugins/sdlc-utilities/scripts/skill/review.js` prints `0` (current: `1`, `:451`).
- [ ] `node -e 'const r=require("./plugins/sdlc-utilities/scripts/skill/review.js"); console.log(typeof r.refinePlan)'` prints `function` (current: `undefined`).
- [ ] `node --check plugins/sdlc-utilities/scripts/skill/review.js` exits 0.

**Contract:**
- shape (code): as in Contract Examples; `refinePlan` body below.
- names: `refinePlan`, `DIMENSION_BATCH_SIZE`, `batch`.
- mirror: the current sort comparator.
- decisions: KD1, KD2.
- sync: Task 2's cases.

```js
// after SEVERITY_RANK (:335)
// R-dimension-cap: dispatched dimensions per batch (a tuning value, not contract).
const DIMENSION_BATCH_SIZE = 8;

// replaces the JSDoc and body of refinePlan (:432-458)
/**
 * R-dimension-cap: no dispatched dimension is dropped. Every dispatched dimension
 * (ACTIVE/TRUNCATED) gets a batch index, DIMENSION_BATCH_SIZE per batch, in priority
 * order: severity descending, then matched_files count ascending. Other dimensions
 * get batch null. Returns the number of batches.
 */
function refinePlan(dimensions) {
  const dispatched = dimensions.filter(d => d.status === 'ACTIVE' || d.status === 'TRUNCATED');
  dispatched.sort((a, b) => {
    const diff = (SEVERITY_RANK[b.severity] || 3) - (SEVERITY_RANK[a.severity] || 3);
    return diff !== 0 ? diff : a.matched_files.length - b.matched_files.length;
  });
  for (const dim of dimensions) dim.batch = null;
  dispatched.forEach((dim, i) => { dim.batch = Math.floor(i / DIMENSION_BATCH_SIZE) + 1; });
  return Math.ceil(dispatched.length / DIMENSION_BATCH_SIZE);
}
```

```diff
 toIndexEntry (:311-329): the comment loses the QUEUED sentences; one field is added
-  // Only dispatched dimensions (ACTIVE/TRUNCATED) carry a slice_file. refinePlan() may demote
-  // an ACTIVE dim to QUEUED *after* its slice was written — gate on status so QUEUED/SKIPPED
-  // always report slice_file: null, per R-manifest-index-slices (#447). A written-but-orphaned
-  // slice for a now-QUEUED dim is harmless (orchestrator never dispatches it).
+  // Only dispatched dimensions (ACTIVE/TRUNCATED) carry a slice_file and a batch
+  // (R-manifest-index-slices, R-dimension-cap); SKIPPED/ERROR report null for both.
   const dispatched = dim.status === 'ACTIVE' || dim.status === 'TRUNCATED';
 …
     slice_file:         dispatched ? (dim.slice_file != null ? dim.slice_file : null) : null,
+    batch:              dispatched ? (dim.batch != null ? dim.batch : null) : null,
 :624
-  const queued   = refinePlan(dims);
+  refinePlan(dims);
 :658
-      queued_dimensions:      queued,
+      queued_dimensions:      [],
 :664
-      queued_dimensions:     queued.length,
+      queued_dimensions:     0,
 :686
-module.exports = { …, writeDimensionSlices, toIndexEntry };
+module.exports = { …, writeDimensionSlices, toIndexEntry, refinePlan };
```

The JSDoc of `toIndexEntry` (`:306-310`) keeps its text. The exact replaced comment lines above (`:312-315`) each occur once.

**Must not touch:** `critiquePlan`; `max-files` truncation; R-on-demand-force-active code; `SEVERITY_RANK`; the summary schema other than `queued_dimensions`.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. Never run a fixture `setup.sh` by hand. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 2: Synthetic 17-dimension fixture and the `review-cap:` cases (a), (b), (b2)

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/review-cap-dimensions/.sdlc/review-dimensions/cap-d01.md` … `cap-d17.md` (17 files)
- Test: `tests/promptfoo/datasets/review-prepare-exec.yaml` — three cases appended after `:98`.

**Notes:** D-31 (accepted): a synthetic fixture with no `setup.sh`; inline `-e` cases call the exported functions, as the planner's scratch probe did. The `-e` code contains no whitespace, because `script-runner.js` splits `script_args` on whitespace.

**Acceptance criteria:**
- [ ] `ls tests/promptfoo/fixtures-fs/review-cap-dimensions/.sdlc/review-dimensions/ | wc -l` prints `17`.
- [ ] With PF-ENV: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "review-cap"`: 3 passed.

**Contract:**
- shape (code): 17 dimension files from one template; three exec cases.
- names: `cap-dNN` (NN = 01…17).
- mirror: `tests/promptfoo/fixtures-fs/project-on-demand-dimension/.sdlc/review-dimensions/qa-on-demand.md`.
- decisions: KD1.
- sync: the case assertions.

Each `cap-dNN.md` (NN two digits, n its number):

```markdown
---
name: cap-dNN
description: Synthetic dimension NN for the review dispatch cap cases.
severity: <high when n % 3 == 0, medium when n % 3 == 1, low when n % 3 == 2>
triggers:
  - "<src/** for n 1–8, lib/** for n 9–10, pkg/** for n 11–17>"
---

# Cap dimension NN

Synthetic review dimension used only by the review-cap exec cases.
```

The three cases share `script_path: "-e"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/review-cap-dimensions"`. The `script_args` of each is the line below, with `<CHANGED>` replaced:

```text
'(({loadAndMatchDimensions:l,writeDimensionSlices:w,toIndexEntry:t,refinePlan:r},fs,os,p)=>{const[d,o]=[l(process.cwd(),<CHANGED>,null),fs.mkdtempSync(p.join(os.tmpdir(),"review-cap-"))];w(d.filter(x=>x.status==="ACTIVE"),o,null);const[n,e]=[r(d),d.map(x=>t(x))];const[ok]=[e.filter(x=>x.status==="ACTIVE").every(x=>fs.existsSync(x.slice_file))];fs.rmSync(o,{recursive:true,force:true});console.log(JSON.stringify({n,ok,e}))})(require("{{repo_root}}/plugins/sdlc-utilities/scripts/skill/review.js"),require("fs"),require("os"),require("path"))'
```

| Case | description | `<CHANGED>` | assertion (`type: javascript`) |
|---|---|---|---|
| (a) | `"review-cap: (a) 10 matching dimensions give 10 dispatched entries with a slice_file and batch 1 or 2, none QUEUED"` | `["src/a.js","lib/a.js"]` | `const r = JSON.parse(output); const x = r.e.filter(e => e.status === "ACTIVE"); r.n === 2 && r.ok === true && x.length === 10 && !r.e.some(e => e.status === "QUEUED") && x.every(e => typeof e.slice_file === "string") && x.filter(e => e.batch === 1).length === 8 && x.filter(e => e.batch === 2).length === 2 && r.e.filter(e => e.status === "SKIPPED").every(e => e.batch === null && e.slice_file === null)` |
| (b) | `"review-cap: (b) 8 matching dimensions all go to batch 1"` | `["src/a.js"]` | `const r = JSON.parse(output); const x = r.e.filter(e => e.status === "ACTIVE"); r.n === 1 && r.ok === true && x.length === 8 && x.every(e => e.batch === 1) && r.e.filter(e => e.status === "SKIPPED").length === 9` |
| (b2) | `"review-cap: (b2) 17 matching dimensions give batches of 8, 8 and 1 in priority order"` | `["src/a.js","lib/a.js","pkg/a.js"]` | `const r = JSON.parse(output); const c = k => r.e.filter(e => e.batch === k).length; r.n === 3 && r.ok === true && r.e.length === 17 && c(1) === 8 && c(2) === 8 && c(3) === 1 && r.e.filter(e => e.severity === "high").every(e => e.batch === 1) && r.e.find(e => e.name === "cap-d17").batch === 3` |

**Must not touch:** the six existing `review-prepare-exec.yaml` cases; every other fixture.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. Never run a fixture `setup.sh` by hand. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 3: hook-readiness matches hook scripts, and case (c)

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `.sdlc/review-dimensions/hook-readiness.md` — `triggers` (`:4-7`).
- Test: `tests/promptfoo/datasets/review-prepare-exec.yaml` — case (c) after Task 2's cases.

**Notes:** Item Change 4 (#9166). `skip-when` stays.

**Acceptance criteria:**
- [ ] `grep -c '"\*\*/hooks/\*\.js"' .sdlc/review-dimensions/hook-readiness.md` prints `1` (current: `0`).
- [ ] The bare `validate-dimensions.js` command (plan header) prints `14 0 PASS PASS` and `exit=0`.
- [ ] Verification W8.31 (2) and (3) of the plan header pass: 19 passed; `check-consistency.js` exits 0.

**Contract:**
- shape (code): one trigger line; one exec case.
- names: `**/hooks/*.js`.
- mirror: the existing trigger lines.
- decisions: item Change 4.
- sync: none.

```diff
 .sdlc/review-dimensions/hook-readiness.md:4-7
 triggers:
   - "**/skills/**/SKILL.md"
   - "**/hooks/hooks.json"
+  - "**/hooks/*.js"
   - "**/scripts/*.js"
```

```yaml

- description: "review-cap: (c) the repo's hook-readiness dimension matches plugins/sdlc-utilities/hooks/session-start.js"
  vars:
    script_path: "-e"
    script_args: '(({loadAndMatchDimensions:l})=>{const[h]=[l("{{repo_root}}",["plugins/sdlc-utilities/hooks/session-start.js"],null).find(x=>x.name==="hook-readiness")];console.log(JSON.stringify({status:h&&h.status,matched:h&&h.matched_count}))})(require("{{repo_root}}/plugins/sdlc-utilities/scripts/skill/review.js"))'
  assert:
    - type: javascript
      value: "const r = JSON.parse(output); r.status === 'ACTIVE' && r.matched === 1"
```

**Must not touch:** `skip-when`; the other 13 dimension files; the dimension body.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 4: review-orchestrator dispatches batch by batch; REFERENCE.md documents `batch`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — `:53`, `:99`, `:101`, `:105`.
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — `:45`, `:76`, `:80` (ruling w2-plan Q1).

**Notes:** KD3. The barrier tokens that `check-consistency.js` requires ("Await barrier", "R-orchestrator-await", "Never consolidate on partial or zero results") stay. REFERENCE.md section 2 (the subagent prompt template) is unchanged, so the cached static prefix stays byte-stable.

**Acceptance criteria:**
- [ ] `grep -c "capped out" plugins/sdlc-utilities/agents/review-orchestrator.md` prints `0` (current: `1`).
- [ ] `grep -c "QUEUED" plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` prints `0` (current: `2`).
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (docs): before → after text below.
- names: `batch`, `dimension_cap_applied`.
- mirror: the Step 2 bold-lead style.
- decisions: KD3; ruling w2-plan Q1.
- sync: R-dimension-cap (S4).

```diff
 review-orchestrator.md:53
-- **Queued** (`queued_dimensions`): note they were capped out
+- **Batches** (`dimension_cap_applied` true): note that the dispatched dimensions run in batches of 8 (`dimensions[].batch`), and list each batch's dimension names
 :99
-**Dispatch ALL active dimensions in a SINGLE message** (multiple Agent tool calls in one response). Do not dispatch one at a time.
+**Dispatch each batch in a SINGLE message** (multiple Agent tool calls in one response), in `batch` order: every dimension whose `batch` is 1, then 2, and so on (R-dimension-cap). Collect every result of a batch before you dispatch the next batch. Do not dispatch one at a time.
 :101 (one in-line change)
-… exactly one result per dispatched dimension — N = count of dimensions with status ACTIVE or TRUNCATED. …
+… exactly one result per dispatched dimension — N = count of dimensions with status ACTIVE or TRUNCATED, across all batches. …
 :105 (one in-line change)
-… equals N (dimensions dispatched ACTIVE/TRUNCATED). …
+… equals N (dimensions dispatched ACTIVE/TRUNCATED, all batches). …
```

```diff
 REFERENCE.md:45-46
-      "slice_file": "/tmp/sdlc-review-XXXXX/security-review.slice.json"
+      "slice_file": "/tmp/sdlc-review-XXXXX/security-review.slice.json",
+      "batch": 1
     }
 :76
-`status` values: `ACTIVE`, `SKIPPED`, `TRUNCATED`, `QUEUED`
+`status` values: `ACTIVE`, `SKIPPED`, `TRUNCATED`
+
+`batch`: the dispatch batch index (1, 2, …) of an ACTIVE or TRUNCATED entry, 8 entries per batch in priority order (severity descending, then matched files ascending); `null` for other entries. No dimension is queued, so `queued_dimensions` is always empty (R-dimension-cap).
 :80 (one in-line change)
-… Non-dispatched dimensions (SKIPPED/QUEUED) have `slice_file: null`. …
+… Non-dispatched dimensions (SKIPPED) have `slice_file: null`. …
```

**Must not touch:** REFERENCE.md section 2 and every other section; the orchestrator's Step 3 onward except the `:105` clause; the dispatch parameters (`run_in_background: false`, model precedence).

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 5: The behavioural fixture and rubric show batches, not queued dimensions

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 4
**Verify:** manual

**Files:**
- Modify: `tests/promptfoo/fixtures/project-with-queued-dimensions.md` — `:1`, `:5`, `:36`, `:69-78`, `:85-86`, `:90`, `:92` (ruling w2-plan Q1; the file name stays).
- Modify: `tests/promptfoo/datasets/review-sdlc.yaml` — the case at `:169-190`.

**Notes:** §0 rule 5: changed behaviour, changed assertion. Same 10 dimensions, all ACTIVE, `batch` 1 (8) and 2 (2), `dimension_cap_applied: true`, `queued_dimensions: []` / `0`. Priority order of the fixture's own data:
- high: api-review 6, security-review 8;
- medium: performance 10, test-coverage 12, error-handling 15, type-safety 20, code-quality-review 25;
- low: internationalization 2, accessibility 3, documentation-quality 5.

So batch 2 is accessibility and documentation-quality. The executor does NOT run this behavioural case (W8.31 Verification (4)).

**Acceptance criteria:**
- [ ] `grep -c 'QUEUED\|queued_dimensions": \[\"' tests/promptfoo/fixtures/project-with-queued-dimensions.md` prints `0` (current: `5`, at `:5`, `:36`, `:77`, `:78`, `:86`).
- [ ] `grep -c '"batch": 2' tests/promptfoo/fixtures/project-with-queued-dimensions.md` prints `2` and `grep -c '"batch": 1' tests/promptfoo/fixtures/project-with-queued-dimensions.md` prints `8` (current: `0` and `0`).
- [ ] `grep -c 'review-sdlc: cap applied dispatches all dimensions in batches of 8' tests/promptfoo/datasets/review-sdlc.yaml` prints `1`, and `grep -c 'queued dimensions shown when cap applied' tests/promptfoo/datasets/review-sdlc.yaml` prints `0` (current: `0` and `1`).

**Contract:**
- shape (docs): fixture prose and JSON; one behavioural case's description and assertions.
- names: `batch`, the new description.
- mirror: the existing fixture's JSON layout.
- decisions: ruling w2-plan Q1.
- sync: R-dimension-cap; `review-orchestrator.md:53`.

Fixture changes (each old line occurs once):

```diff
 :1
-# Simulated Project Context: Project with Queued Dimensions (cap applied)
+# Simulated Project Context: Project with Batched Dimensions (cap applied)
 :5
-Full rewrite touching many files across the project. 10 review dimensions are configured, but the concurrent dimension cap of 8 has been applied, leaving 2 dimensions in a QUEUED state.
+Full rewrite touching many files across the project. 10 review dimensions are configured and all 10 match changed files. The dispatch batch size is 8, so the dimensions run in two batches: 8 in batch 1 and 2 in batch 2. No dimension is dropped.
 :36
-Ten dimensions installed. The dimension cap is 8, so the two lowest-severity dimensions (accessibility, internationalization) are QUEUED and will not run in this pass.
+Ten dimensions installed, all ACTIVE. In priority order (severity descending, then matched files ascending) the first 8 form batch 1; accessibility and documentation-quality form batch 2.
 :69-78
-    { "name": "security-review", "status": "ACTIVE", "severity": "high", "matched_count": 8 },
-    { "name": "code-quality-review", "status": "ACTIVE", "severity": "medium", "matched_count": 25 },
-    { "name": "api-review", "status": "ACTIVE", "severity": "high", "matched_count": 6 },
-    { "name": "test-coverage", "status": "ACTIVE", "severity": "medium", "matched_count": 12 },
-    { "name": "type-safety", "status": "ACTIVE", "severity": "medium", "matched_count": 20 },
-    { "name": "performance", "status": "ACTIVE", "severity": "medium", "matched_count": 10 },
-    { "name": "error-handling", "status": "ACTIVE", "severity": "medium", "matched_count": 15 },
-    { "name": "documentation-quality", "status": "ACTIVE", "severity": "low", "matched_count": 5 },
-    { "name": "accessibility", "status": "QUEUED", "severity": "low", "matched_count": 3 },
-    { "name": "internationalization", "status": "QUEUED", "severity": "low", "matched_count": 2 }
+    { "name": "security-review", "status": "ACTIVE", "severity": "high", "matched_count": 8, "batch": 1 },
+    { "name": "code-quality-review", "status": "ACTIVE", "severity": "medium", "matched_count": 25, "batch": 1 },
+    { "name": "api-review", "status": "ACTIVE", "severity": "high", "matched_count": 6, "batch": 1 },
+    { "name": "test-coverage", "status": "ACTIVE", "severity": "medium", "matched_count": 12, "batch": 1 },
+    { "name": "type-safety", "status": "ACTIVE", "severity": "medium", "matched_count": 20, "batch": 1 },
+    { "name": "performance", "status": "ACTIVE", "severity": "medium", "matched_count": 10, "batch": 1 },
+    { "name": "error-handling", "status": "ACTIVE", "severity": "medium", "matched_count": 15, "batch": 1 },
+    { "name": "documentation-quality", "status": "ACTIVE", "severity": "low", "matched_count": 5, "batch": 2 },
+    { "name": "accessibility", "status": "ACTIVE", "severity": "low", "matched_count": 3, "batch": 2 },
+    { "name": "internationalization", "status": "ACTIVE", "severity": "low", "matched_count": 2, "batch": 1 }
 :85-92
     "dimension_cap_applied": true,
-    "queued_dimensions": ["accessibility", "internationalization"]
+    "queued_dimensions": []
   },
   "summary": {
     "total_dimensions": 10,
-    "active_dimensions": 8,
+    "active_dimensions": 10,
     "skipped_dimensions": 0,
-    "queued_dimensions": 2,
+    "queued_dimensions": 0,
```

Case at `review-sdlc.yaml:169` (vars unchanged):

```yaml
- description: "review-sdlc: cap applied dispatches all dimensions in batches of 8"
  vars:
    skill_path: "plugins/sdlc-utilities/skills/review-sdlc/SKILL.md"
    project_context: "file://fixtures/project-with-queued-dimensions.md"
    user_request: >
      Run /review-sdlc on this project. The review-prepare.js manifest is in the project
      context. Show the review plan including all dimension statuses.
  assert:
    - type: regex
      value: "(batch|Batch)"
    - type: regex
      value: "(accessibility|documentation-quality)"
    - type: llm-rubric
      value: >
        The response shows all 10 dimensions as active and dispatched in two batches:
        8 in batch 1 and 2 (accessibility and documentation-quality) in batch 2. It
        explains that the cap of 8 sets the batch size and that no dimension is dropped
        or queued. It does not suggest re-running the review to process queued dimensions.
```

**Must not touch:** the fixture's file name, project structure block and `changed_files` list; every other `review-sdlc.yaml` case; the six other review fixtures.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Never run a behavioural promptfoo case or `claude`. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 6: session-map.js — the map builder

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/ci/session-map.js`

**Notes:** KD4, D-26, Q23 reading. Group B (W8.26), disjoint from group A. Guardrails:
- read only the lines up to the first user message of each top-level transcript;
- never write under `--projects-dir`;
- never guess an assignment;
- no agent reads the owner's real transcripts during this run (ruling w13-modifiers). Test only against the synthetic fixture of Task 7.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/session-map.js --help; echo "exit=$?"` prints the usage header and `exit=0`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/session-map.js; echo "exit=$?"` prints one stderr line and `exit=2` (neither `--agents` nor `--events`).
- [ ] `node --check plugins/sdlc-utilities/scripts/ci/session-map.js` exits 0.

**Contract:**
- shape (code): CLI and output below.
- names: `SCHEMA = 'sdlc-session-map-1'`, `encodeProjectDir(cwd)`, `readHead(file)`, `buildWindows(agents, events, window)`, `assign(sessions, windows)`, `CliError`.
- mirror: `scripts/ci/session-cost.js:1-130` — usage header in the leading comment, `usageText()` from that comment, `parseArgs` with a `valued` map, `CliError(message, code)`, `readJson`, a `main()` that returns the exit code.
- decisions: KD4; Q23 reading.
- sync: `session-cost.js --sessions` accepts the `map` (Task 8 case (e)).

```text
Usage:
  node session-map.js (--agents <file.json> | --events <file.jsonl>)… (--json | --map-out <file>) [options]

Options:
  --agents <file.json>   JSON object: tag -> array of { name?, cwd, from?, to?, firstPrompt? }
                         (cwd: the agent's worktree path; from/to: ISO times; firstPrompt: a
                         regular expression on the session's first user prompt)
  --events <file.jsonl>  one JSON object per line: { ts, tag, cwd, event: start|clear|exit };
                         each start/clear opens a window that the next event of that tag+cwd closes
  --window <from>/<to>   default ISO window for --agents entries without their own from/to
  --projects-dir <dir>   transcript root (default: ~/.claude/projects); never written
  --json                 print { schema, map, unassigned } to stdout
  --map-out <file>       write only `map` (the session-cost.js --sessions format) to <file>
  --help                 print this usage text

Exit codes: 0 map built (also with unassigned entries); 2 usage, IO or parse error.
```

- Project dir: `encodeProjectDir(cwd) = cwd.replace(/[^A-Za-z0-9-]/g, '-')` (evidenced for `/` and `.`). A cwd whose directory does not exist adds `{ path: <encoded name>, start: null, end: null, reason: 'no-project-dir' }` to `unassigned`, once per cwd.
- Sessions: the top-level `*.jsonl` files of each existing project dir (never `subagents/`), sorted by name. `readHead` reads 64 KiB chunks until it has parsed the first line whose `type` is `user`, or EOF, or 1 MiB. It returns `start` (the `timestamp` of the first parsed line, up to and including the first user message, that carries a string `timestamp`; lines without one, such as a leading `summary` line, are skipped; `null` only when no such line exists), `prompt` (that user message's `message.content` string, or the joined `text` items of an array) and `end` (`fs.statSync(file).mtime.toISOString()`).
- Windows: one per `--agents` entry (`from`/`to` from the entry, else `--window`, else open). One per `--events` `start`/`clear` event, ending at the next event of the same (tag, cwd), or open after the last. An `exit` event opens nothing.
- Assignment: the candidates are the windows with the same project dir where `from ≤ start < to` and `firstPrompt` (if any) matches the prompt. A session with `start === null` matches only fully open windows.
  - 0 candidates → `unassigned` `{ path, start, end, reason: 'outside-window' }`;
  - 1 → `map[tag]` gets `path` (relative to `--projects-dir`, `/` separators);
  - more than 1 → `{ path, start, end, reason: 'ambiguous', candidates: [sorted tags] }`.
- Output: `{ "schema": "sdlc-session-map-1", "map": { <tag>: [paths sorted by start, then path] }, "unassigned": [sorted by path] }`. Tags are in input order; a tag with no session keeps `[]`. No price, token or cost field anywhere.
- `--map-out` writes `JSON.stringify(map, null, 2) + '\n'`. A `--map-out` path inside `--projects-dir` is a usage error (exit 2).
- Errors (exit 2, one stderr line `session-map: <message>`): missing or unknown flag; neither `--agents` nor `--events`; neither `--json` nor `--map-out`; unreadable or invalid JSON/JSONL; a bad `--window`; an agents entry without a string `cwd`; an invalid `firstPrompt` regular expression; a bad event.
- `require` uses only `node:fs`, `node:path` and `node:os`.

**Must not touch:** `session-cost.js`, `session-prices.json`, `wave-metrics.js`; anything under `.sdlc/orchestration/`; any real transcript.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Never open a real transcript under `~/.claude/projects` (directory names only). Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 7: The synthetic session-map fixture

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Create under `tests/promptfoo/fixtures-fs/session-map/`: `agents-two.json`, `agents-split.json`, `agents-unassigned.json`, `events-clear.jsonl`, `projects/-fixture-wt-a/s-a1.jsonl`, `projects/-fixture-wt-a/s-a1/subagents/agent-x.jsonl`, `projects/-fixture-wt-b/s-b1.jsonl`, `projects/-fixture-wt-c/s-plan.jsonl`, `projects/-fixture-wt-c/s-exec.jsonl`, `projects/-fixture-wt-d/s-e1.jsonl`, `projects/-fixture-wt-d/s-e2.jsonl`, `projects/-fixture-wt-d/s-e3.jsonl`, `projects/-fixture-wt-e/s-out.jsonl` and `projects/-fixture-wt-e/s-amb.jsonl` (14 files; the W8.26 commit lists all 14).

**Notes:** Synthetic transcripts only. The cwds are fake absolute paths (`/fixture/wt-a` … `/fixture/wt-e`, and `/fixture/missing` with no directory). No `setup.sh`.

**Acceptance criteria:**
- [ ] `find tests/promptfoo/fixtures-fs/session-map -type f | wc -l` prints `14`.
- [ ] `grep -rlE 'usd|token' tests/promptfoo/fixtures-fs/session-map/agents-*.json tests/promptfoo/fixtures-fs/session-map/events-clear.jsonl | wc -l` prints `0` (4 files scanned).

**Contract:**
- shape (code): fixture data below.
- names: the file names above.
- mirror: `tests/promptfoo/fixtures-fs/session-cost/projects/-fixture-proj/sess-aux.jsonl` (line shape).
- decisions: KD4.
- sync: Task 8's assertions.

Each transcript is these two lines; `s-a1.jsonl` alone has a third line before them, `{"type":"summary","summary":"synthetic fixture transcript"}` (no `timestamp`, so its start is still `2026-10-20T10:00:00Z`):
1. `{"type":"user","sessionId":"<id>","timestamp":"<start>","message":{"role":"user","content":"<prompt>"}}`
2. `{"type":"assistant","sessionId":"<id>","timestamp":"<start + 5 s>","message":{"id":"msg_<id>","role":"assistant","model":"test-model-a","usage":{"input_tokens":10,"output_tokens":5}}}`

`agent-x.jsonl` has the same shape (id `agent-x`, start `2026-10-20T10:01:00Z`).

| File (under `projects/`) | `<start>` | `<prompt>` |
|---|---|---|
| `-fixture-wt-a/s-a1.jsonl` | `2026-10-20T10:00:00Z` | `orchestrate wave 1` |
| `-fixture-wt-b/s-b1.jsonl` | `2026-10-20T10:05:00Z` | `execute the plan` |
| `-fixture-wt-c/s-plan.jsonl` | `2026-10-20T10:00:00Z` | `write the plans` |
| `-fixture-wt-c/s-exec.jsonl` | `2026-10-20T12:00:00Z` | `run the phase` |
| `-fixture-wt-d/s-e1.jsonl` | `2026-10-20T09:00:00Z` | `phase A` |
| `-fixture-wt-d/s-e2.jsonl` | `2026-10-20T10:00:00Z` | `phase B` |
| `-fixture-wt-d/s-e3.jsonl` | `2026-10-20T11:00:00Z` | `phase C` |
| `-fixture-wt-e/s-out.jsonl` | `2026-10-20T08:00:00Z` | `early check` |
| `-fixture-wt-e/s-amb.jsonl` | `2026-10-20T10:30:00Z` | `gate check` |

- `agents-two.json`: `{"orch":[{"cwd":"/fixture/wt-a"}],"exec":[{"cwd":"/fixture/wt-b"}]}`
- `agents-split.json`: `{"plan":[{"cwd":"/fixture/wt-c","from":"2026-10-20T09:00:00Z","to":"2026-10-20T11:00:00Z"}],"exec":[{"cwd":"/fixture/wt-c","from":"2026-10-20T11:00:00Z","to":"2026-10-20T13:00:00Z"}]}`
- `agents-unassigned.json`: `{"arb":[{"cwd":"/fixture/wt-e","from":"2026-10-20T10:00:00Z","to":"2026-10-20T11:00:00Z"}],"aux-gate":[{"cwd":"/fixture/wt-e","from":"2026-10-20T10:15:00Z","to":"2026-10-20T12:00:00Z"}],"orch":[{"cwd":"/fixture/missing"}]}`
- `events-clear.jsonl`, four lines, all `"tag":"exec","cwd":"/fixture/wt-d"`: `start` at `2026-10-20T08:30:00Z`, `clear` at `2026-10-20T09:30:00Z`, `clear` at `2026-10-20T10:30:00Z`, `exit` at `2026-10-20T12:00:00Z`.

**Must not touch:** the `session-cost` fixture.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Never open a real transcript under `~/.claude/projects`. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

### Task 8: session-map cases, config registration and the scripts README

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 7
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/datasets/session-map-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — one line after `  - file://datasets/session-cost-exec.yaml`.
- Modify: `plugins/sdlc-utilities/scripts/README.md` — `:25` and a new table row after `:29`.

**Notes:** Six cases (a)–(f), descriptions starting `session-map: `. Shared vars for (a)–(d), (f): `script_path: "repo://plugins/sdlc-utilities/scripts/ci/session-map.js"`, `project_root: "file://fixtures-fs/session-map"`.

**Acceptance criteria:**
- [ ] Verification W8.26 of the plan header: 19 passed for `session-map|session-cost`; `--help` exit 0; `check-consistency.js` exits 0.

**Contract:**
- shape (code): six exec cases; one config line; README text.
- names: `session-map-exec.yaml`.
- mirror: `session-cost-exec.yaml:7-17` (vars style).
- decisions: KD4.
- sync: Task 6's output.

| Case | `script_args` | assertion (`type: javascript`) |
|---|---|---|
| (a) `"session-map: (a) two worktrees with one agent each map to two tags"` | `--agents {{project_root}}/agents-two.json --projects-dir {{project_root}}/projects --json` | `const o = JSON.parse(output); o.schema === 'sdlc-session-map-1' && JSON.stringify(o.map) === '{"orch":["-fixture-wt-a/s-a1.jsonl"],"exec":["-fixture-wt-b/s-b1.jsonl"]}' && o.unassigned.length === 0` |
| (b) `"session-map: (b) an executor and a planner in one worktree are split by their windows"` | `--agents {{project_root}}/agents-split.json --projects-dir {{project_root}}/projects --json` | `const o = JSON.parse(output); JSON.stringify(o.map) === '{"plan":["-fixture-wt-c/s-plan.jsonl"],"exec":["-fixture-wt-c/s-exec.jsonl"]}' && o.unassigned.length === 0` |
| (c) `"session-map: (c) three executor sessions after clear resets all go to exec via --events"` | `--events {{project_root}}/events-clear.jsonl --projects-dir {{project_root}}/projects --json` | `const o = JSON.parse(output); JSON.stringify(o.map.exec) === '["-fixture-wt-d/s-e1.jsonl","-fixture-wt-d/s-e2.jsonl","-fixture-wt-d/s-e3.jsonl"]' && o.unassigned.length === 0` |
| (d) `"session-map: (d) sessions outside every window or in two windows go to unassigned"` | `--agents {{project_root}}/agents-unassigned.json --projects-dir {{project_root}}/projects --json` | `const o = JSON.parse(output); const u = p => o.unassigned.find(x => x.path === p); u('-fixture-wt-e/s-out.jsonl').reason === 'outside-window' && u('-fixture-wt-e/s-amb.jsonl').reason === 'ambiguous' && JSON.stringify(u('-fixture-wt-e/s-amb.jsonl').candidates) === '["arb","aux-gate"]' && u('-fixture-missing').reason === 'no-project-dir' && o.map.arb.length === 0` |
| (f) `"session-map: (f) the output holds no usd or token field"` | `--agents {{project_root}}/agents-two.json --projects-dir {{project_root}}/projects --json` | two assertions: `not-icontains "usd"` and `not-icontains "token"`, plus `type: javascript` `JSON.parse(output).map.orch.length === 1` (proves the output is not empty) |

Case (e), `"session-map: (e) the --map-out map is accepted by session-cost.js --sessions"`: `script_path: "-e"`, `script_cwd: "{{project_root}}"`, `project_root: "file://fixtures-fs/session-map"`, and:

```text
script_args: '((cp,fs,f,r)=>{const[a]=[cp.spawnSync("node",[r+"/plugins/sdlc-utilities/scripts/ci/session-map.js","--agents",f+"/agents-two.json","--projects-dir",f+"/projects","--map-out",f+"/map.json"],{encoding:"utf8"})];const[b]=[cp.spawnSync("node",[r+"/plugins/sdlc-utilities/scripts/ci/session-cost.js","--sessions",f+"/map.json","--projects-dir",f+"/projects","--prices",r+"/tests/promptfoo/fixtures-fs/session-cost/prices.json","--json"],{encoding:"utf8"})];console.log(JSON.stringify({mapExit:a.status,costExit:b.status,costErr:b.stderr,map:fs.existsSync(f+"/map.json")?JSON.parse(fs.readFileSync(f+"/map.json","utf8")):null}))})(require("child_process"),require("fs"),process.cwd(),"{{repo_root}}")'
```

Its assertion: `const r = JSON.parse(output); r.mapExit === 0 && r.costExit === 0 && r.map.orch.length === 1 && r.map.exec.length === 1`. The planner ran this string at bae33fd the way `script-runner.js` runs it (session-map absent, a hand-made map): it is one argument, and `session-cost.js` exited 0 on the map.

`promptfooconfig-exec.yaml`: after `  - file://datasets/session-cost-exec.yaml` add `  - file://datasets/session-map-exec.yaml`.

README:

```diff
-Besides the `validate-*` validators, `ci/` holds two read-only reporting scripts for the orchestration:
+Besides the `validate-*` validators, `ci/` holds three read-only reporting scripts for the orchestration:
 …
 | `session-cost.js` | … |
+| `session-map.js` | Builds the `session-cost.js --sessions` map from each agent's worktree path and time window (`--agents`, `--events`), reading transcript metadata only up to the first user message; unmatched sessions are listed under `unassigned`, never guessed |
 | `wave-metrics.js` | … |
```

**Must not touch:** `session-cost-exec.yaml`; the other `tests:` lines.

**Rules for this task:** Any change to a REPO file must be made with the Write or Edit tool. A change to a repo file by a shell command, an interpreter script (python/node/perl/sed -i/awk/tee/redirect) or a heredoc is a STOP, even if quoted, even if disclosed. On a classifier refusal, stop and report; never retry, reword or switch tools. Public docs only via WebFetch. Never open a real transcript under `~/.claude/projects`. Write temporary files only under the run's scratch directory (`$TMPDIR`) and delete them before you report. No pkill/killall; kill only by a PID you started yourself (or TaskStop).

---

## Final Shape

- **W8.31 commit:**
  - Every matching dimension is dispatched. `review.js` tags each ACTIVE/TRUNCATED entry with a `batch` (8 per batch, priority order) and never sets `QUEUED`.
  - The orchestrator dispatches and awaits batch by batch under the same barrier.
  - `REFERENCE.md` documents `batch`, and `hook-readiness` matches `hooks/*.js`.
  - Four `review-cap:` exec cases prove it, and the behavioural case expects 10 dimensions in two batches.
- **W8.26 commit:**
  - `ci/session-map.js` builds the `--sessions` map from `--agents`/`--events` windows, reading transcript metadata only up to the first user message.
  - Six `session-map:` cases over a synthetic fixture prove it, one of them through `session-cost.js` itself. The README lists the script.

---

## Verification Scorecard

*(Matrix built from requirements checklist — requirement inventory unavailable)* Five lanes and three lenses over all four wave plans; iteration 2 Approved.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 1 | 1 |
| Correctness | 0 | 1 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

Applied: the Task 5 fixture diff (G21), the `session-map` `start` definition (G13), the transcript line count (G5), and the C9 consumer grep. Fix round fix1 (Opus plan review): m1 (exact run command with `--auto --quality balanced --rebase skip`), m2 (verbatim hard-rule block quoted), m4 (encoding wording: collisions possible, docs not consulted).

| Requirement (plan source) | Task(s) | Status |
|---|---|---|
| D-31 `batch`, no `QUEUED`, `queued_dimensions` empty, `dimension_cap_applied` kept | 1 | covered |
| Synthetic 17-dimension fixture; `review-cap:` (a), (b), (b2), (c) | 2, 3 | covered |
| Orchestrator batches, barrier unchanged; `REFERENCE.md` (ruling w2-plan Q1) | 4 | covered |
| Behavioural fixture and rubric (10 in 2 batches, no re-run) | 5 | covered |
| D-31v bare `validate-dimensions.js` command with output | header | covered |
| W8.26 script, synthetic fixture, six cases, config line, README (D-26, Q23) | 6–8 | covered |
| Two wrapper commits, disjoint files, W8.31 first | header | covered |

**Verdict:** All checks passed. Ready for archive.

---

## OpenSpec Appendix

Not applicable — no OpenSpec change
