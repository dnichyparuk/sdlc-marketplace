# Consolidated plan — review

Date: 2026-10-18 · Reviewed file: [`consolidated-plan.md`](consolidated-plan.md) (65 items, W1–W7, M1–M5) · Checked against HEAD `0c0cdcc` (LF), with line-ending-only differences in the CRLF working tree ignored · Reviewer: senior-architect pass (Claude Opus 5.5) with six read-only verification subagents.

## Verdict: READY-WITH-FIXES

The plan was not executable as written. It contained one structural break, eight dependency or ordering defects (three of them cycles), about ten places where its own reconciliation decisions were stated but not applied, and roughly 200 smaller defects. The small ones were mostly wrong line numbers, filter patterns that select no test, and verification steps a weaker executor could not run or that could never pass. A Sonnet/Haiku-class executor following §0's rule "stop on any mismatch" would have halted in most workstreams.

All of these defects were corrected in place, and the corrections are listed below. After them, every item has a resolvable dependency chain in milestone order, every `--filter-pattern` was checked against real `description:` strings, and every quoted current state was checked at its HEAD line. No item contradicts D1–D4. The plan is ready to execute once the maintainer has seen the residual decisions at the end. Two of them (R-1 trap convention, R-2 W7.6 premise) should be settled before the items they affect run.

Correction count by category. A row may touch several sentences, and ops that fixed several issues in one item are counted once per issue.

| Category (task check) | Issues corrected | Left open (residual) |
|---|---|---|
| 1. Completeness / disposition | 3 | 0 |
| 2. Maintainer decisions D1–D4 | 0 contradictions; 2 D2/D4-adjacent consistency fixes (counted under 5 and 6) | 1 (R-3) |
| 3. Technical accuracy (paths, lines, quotes, names, flags, tool facts, datasets) | 118 | 2 (R-5, R-6) |
| 4. Executability (vague Change, Verification without command, non-mechanical Done-when, unrunnable commands) | 61 | 0 |
| 5. Ordering and dependencies | 16 | 0 |
| 6. Internal consistency (IDs, reconciliation deviations, cross-item contradictions) | 22 | 2 (R-1, R-2) |
| Structure (broken headings, drafting artefacts) | 2 | 0 |
| **Total** | **≈222** | **6** |

## 1. Completeness — every source item is accounted for

Method: the README §6 item numbers and design-review §H rows were extracted with `grep` from both sources and from plan §4.1/§4.2 and compared with `diff`. Every consolidated ID referenced anywhere in the plan was diffed against the 65 `### W…` item headings; none was undefined.

- README items 1–32: all 32 rows are present in §4.1, and design items #1–#10 are all present in §4.2. The declined `claude -p` driver is recorded.
- Items not named in §4 (W2.7, W3.3 inside the `W3.1–W3.6` range, W4.6) come from group-report findings or the "Do not change" list, not from a numbered source item. This is correct.
- Three gaps were fixed (table below, rows C-1 to C-3).

## 2. Maintainer decisions D1–D4

- **D1:** `claude -p` appears only as "declined" (§1, §2 table, W4 scope, §4.2). The step-emitter and per-step agent files are W4.2/W4.3. The S1 spike covers fork permission and consent.
- **D2:** W5.3 implements workers-from-main with the wave-runner as an opt-in through `execute.waveRunnerMinTasks`. It ships with the runner-always default (`1`) until the S3 measurement, then flips the default. This matches "proceed with #4 after measurement" (see R-3). The S3 → W5.3 cycle was fixed (O-4).
- **D3:** W1.5 CI runs only validators and the two exec configs, with a comment forbidding behavioral and eval steps. W1.7 is local only. No CI item runs an LLM.
- **D4:** M3 (W3.1 → W3.6 → W3.2/3.3/3.4) precedes W4.2, W5.2 and W7.3/W7.4. W3.1 changes `AGENTS.md` §1 and `docs/spec-template.md` in one commit. R-ids are kept verbatim (P-5 set equality), history goes to the appendix, and tuning values leave the specs. Remaining tuning values were found in the ship spec (R34/R38/R47) and removed (A-W3-5).
- **W1.1 before tuning:** W6c.1 (tier), W6c.7 and W6b.5 (effort) now depend on W1.1 and the W1.8 baseline row. Inside M1, W1.1 lands first (O-6).

## 3. Sampling

All 65 items were checked; none was skipped. Six read-only subagents verified the workstreams in parallel against HEAD with `git show`/`grep`, returning item → claim → finding. I re-verified every finding before applying it, by targeted reads of the cited lines only. Where a finding was a design judgment, I decided it myself.

| Workstream | Items checked in full | Spot-checked | Lead re-verification (targeted reads) |
|---|---|---|---|
| W1 (8), W2 (7) | all 15 | — | `hooks.json` timeouts :10–85; `dispatch-budget.js:14–23,127`; `yaml.js:42`; `pipeline-continue.js` requires; hook-runner output nesting; `adding-hooks.md:256–283`; `ship-prepare-exec.yaml` complete-step descriptions (:1520+) |
| W3 (6) | all 6, incl. id inventories, issue-ref checklists, fence balance | — | `spec-compliance.md:41,54`; `validate-plan-format.js` `--file`; ship spec :86/:93/:112/:129/:338–341 |
| W4 (6), W5 (5) | all 11 | — | `state/ship.js` (no exports, unguarded main :683–709); `readState(prefix, branchSlug)`; `config-format.md` :45/:171/:190/:209; `ship-init.js:84–87`; ship SKILL :407/:510–518/:670–734; plan SKILL :24–46; `openspec.js` `branchMatch`; wave-runner :80–89/:218; recovering :52/:247; ship-fields :170–172 |
| W6a (9) | W6a.1, .2, .5, .6, .8, .9 | .3, .4, .7 | docs jira :295–383; `jira.js saveCache`; `setup.js:541`; setup-sdlc.yaml "none" cases; setup-sections order; setup spec :90; EXAMPLES :124–128 |
| W6b (6), W6c (10) | W6b.1, .3, .4, .5, .6; W6c.1, .2, .3, .6, .7, .10 | W6b.2; W6c.4, .5, .8, .9 | rule 3 `discoverScripts`/`SCRIPT_TO_SKILL`; exec config registrations; version dataset prefixes; received-review :362; review :92; commit :198; error-report-prepare stdin; harden-prepare `--output-file`; review spec :60 |
| W7 (8) | W7.1–W7.4, W7.6–W7.8 | W7.5 | plan SKILL :65/:236/:537/:591; validator :44–52, :275–284, :719–720; c2 fixture :60; content lane :135; `yaml.js:40–44` |

Direct lead checks (no subagent) covered §0–§2, §3 milestones, §4 disposition, §5 risks and §6 questions in full. They also covered every Depends-on line (extracted and checked for cycles and later-milestone references), and the reconciliation deviations listed in the brief.

## 4. Issues found and changes made

Line numbers in this table are HEAD line numbers of the cited repository files, not of the plan. "Applied" means the plan text was changed in place.

### Structure, ordering and internal consistency (lead review)

| ID | Item | What was wrong | Change |
|---|---|---|---|
| S-1 | W6a/W6b boundary | `## W6b — …` heading was glued to the end of W6a "Open point 5", so it did not render as a heading | Split onto its own line |
| S-2 | W6c/W7 boundary | Drafting artefact "No files were modified in this drafting pass." with `## W7 — Plan pipeline` glued to it | Bullet removed; heading split |
| O-1 | W1.5 ↔ W1.6 | Cycle: W1.5 depended on W1.6 "for the optional step"; W1.6 depends on W1.5 | W1.5 depends on W1.3 only; W1.6 adds its own CI step |
| O-2 | W2.2 / W2.5 | Intro said "W2.5 then W2.2" while W2.5 reuses W2.2's `mainWorktreeFromFs` | Order W2.2 → W2.5; W2.5 depends on W2.2, W2.4, W2.6 |
| O-3 | W5.3 | No dependency on the validator rule-13 relaxation although it removes `run_in_background: false` (S12) | Depends on W7.1 item 18, or applies it first |
| O-4 | W5.3 / S3 / M5 | Cycle: W5.3 depended on the S3 measurement, which needs W5.3's `waveRunnerMinTasks` switch | S3 gates only the default flip (Change 9); M5 order W5.2 → W5.3 → S3 → flip |
| O-5 | W6b.3 | Same rule-13 gap as O-3 | Depends on W7.1 item 18 |
| O-6 | W6c.1, W6c.7, W6b.5 | Tier/effort changes in M1 without W1.1 or a baseline, against §1's ordering rule | Depend on W1.1 + W1.8 baseline row; W1.8 baseline step recorded inside M1; milestone note |
| O-7 | W6c.9 | M1 item depended on W6b.1 (parallel track after M1) | Dependency removed (the review hint is W6b.1's); ship part waits for W4.2; execute description moved to W5.5 |
| O-8 | W6b.4 | Effective dependency on W4.5 (M4) unstated; Change ("leave TODO") contradicted the Guardrail ("stop") | W4.5 named for the emission only; both texts now say TODO-and-report |
| O-9 | §3 milestones | W1.8 in no milestone row; the internal-order note lacked W6b.3/W5.3 after W7.1 | Parallel row lists W1.8 after M2 (baseline in M1); note extended |
| O-10 | S1 / W7.4 | S1 spike sat in M4, but W7.4 (after M3) is gated on it; rule 1 forbids starting later-milestone work | S1 moved to M3 (no dependencies); W7.4 depends on S1 |
| O-11 | W1.8 | Change step (4) (batched-trivial A/B) and the S3 row need W5.1/W5.3 (M5) | Dependency stated |
| O-12 | W3.2 | Depended on W1.4 (does not edit specs); missed W2.4's new `R-pause` anchor (id set 196 → 197) | Correct M2 owners listed; R-pause placed under Step lifecycle; "every id mapped or stop" guard |
| O-13 | W3.3 | Vacuous "commit items that touched this spec" (none do) | Restated as milestone dependency |
| O-14 | W3.4 | Missed W2.3 (R20/R21) and W2.6 (R17), which edit the plan spec in M2 | Added, with the line re-read instruction |
| O-15 | §0 rule 2 | "Stop if a quoted line is not at the cited number" made every second item in a file halt, because earlier items shift lines | Rule 2: HEAD numbers; when the file was already edited, locate by `grep -n`, proceed if unique, apply multi-site edits bottom-up |
| O-16 | §0 | W3.5 ("restructure on next touch") was unreachable for an executor working one item at a time | Rule 9 added |
| I-1 | W3 P-5 | Told the executor to edit the plan's M3 row, which already said the right thing; rule 8 would stop on it | Parenthetical removed; M3 row's R-id list corrected (ship R67/R68/R74/R-cap-recovery/R-pause/R35, plan R17/R20/R21) |
| I-2 | W4 intro, W4.4 | "R-progressive-disclosure amended by W4.4" was stated (Depends-on, Q4) but no Change step did it; intro said "via W3.2" and cited :340–345 | W4.4 Change 7 amends the requirement to five companion files with a Done-when grep; intro fixed to :338–341 |
| I-3 | W3.3 / W5.3 | Two different R8 texts; W3.3's said "full task text, never a reference to the plan file", which contradicts W5.1 B10 and W5.3's fact-sheet prompt | W3.3 points to W5.3 Change 10 |
| I-4 | W4.2 | New Step 5 kept "`begin-step` and the Agent dispatch are one uninterrupted sequence", although the item makes the LLM stop calling `begin-step`; "(issue #68)" against rule 7 | Reworded around the `--after` call; issue number dropped |
| I-5 | W1.4 / W6b.4 | W1.4 (M1) deleted `emitText`, which W6b.4 (later) reuses | W1.4 keeps `emitText` and updates its JSDoc (`output.js:89`) |
| I-6 | W6a.5 | Introduced `trap 'rm -f "$RAW"' EXIT` on a file a later tool call writes (violates the adopted trap deviation) | `mktemp` + Write tool + explicit `rm -f` in the consuming call |
| I-7 | W6b.1 | Pointed at, and stopped if missing, `error-report-sdlc/REFERENCE.md`, which W6c.2 deletes in M1 before W6b.1 runs | Points at `SKILL.md` |
| I-8 | W6c.2 | Deleted REFERENCE.md in M1 while repointing crash lines was owned by later items, leaving dangling references | W6c.2 repoints the path token on every row in the same commit; owners rewrite later |
| I-9 | W6c.2/W6c.10 tables | Owners wrong or vague ("spec owner", "W7", setup-dimensions → W6a.6) | W6a.7, W6c.6, W3.3, W7.2 |
| I-10 | W6c.10, W6c intro | "ship/execute parts wait for M3/M4" | M4 (ship), M5 (execute), W7 (plan) |
| I-11 | W6c.9 / W5.5 | Both wrote the execute description, with different texts | W5.5 owns it; W6c.9 Done-when made explicit |
| I-12 | `--output-file` deviation | Rationale "the `skill-uses-output-file` validator requires it" (W6b.1, W6b.6, §4 row 19) is false: rule 3 never fires at HEAD | Rationale changed to "convention (Q11)"; W6b.6 verification greps the flag directly; Q14 added |
| I-13 | Trap deviation | S11 and the W6c notes omitted `received-review-sdlc:136` and `review-sdlc:30`; W6b.6 said "the trap works"; W6c.6 added a later read of a trap-deleted manifest | Lists completed; W6b.6 wording corrected; W6c.6 replaces the harden trap with explicit `rm -f` |
| I-14 | `run_in_background`/`mode` deviation | Dropped "everywhere" but wave-runner :80–81/:89/:217 and recovering :52 kept `mode: bypassPermissions` / `run_in_background`, so W5.3's own grep could not pass | Added to W5.3 Change 8 (§2b gets a one-phrase exception) |
| I-15 | W6b.3 | Executor meta-instruction sat inside the fenced paragraph to be pasted into the agent file | Moved out of the fence |
| I-16 | W7.5 | Moving Step 5 moves the await-barrier marker out of SKILL.md, the only surface rule 13 scans | Rule-13 surface extended in the same commit, with an exec case |
| I-17 | W7.7 / W7.8 | Edited files and text that W7.4/W7.3/W7.5 had already moved or renamed (`lane-guardrail-compliance-prompt.md`, "all five lanes", "seven snapshot structures") | Retargeted to the post-W7.4/W7.5 locations |
| I-18 | W6a.8 | Merged guardrails file keeps the execute single prompt that spec R-guardrail-custom-prompt says "is removed" | Spec amendment added (pending maintainer, Open point 5) |
| I-19 | W4.3 | Agent `tools:` allowlists lacked `AskUserQuestion`, `Write`, `Glob`, `Skill`, `TodoWrite`, `Monitor` and `TaskStop`, which the sub-skills use; the body used `$ARGUMENTS`, which agent bodies do not substitute | `tools:` dropped (inherit); body follows the preloaded skill |
| I-20 | W4.2 | `ship.js` was to call `completeStepCore` in-process, but `state/ship.js` exports nothing and runs main unguarded | `require.main` guard + exports added to Change 3 |
| I-21 | W5.2 | Proposed a cross-file config migration that `config-migrations.js` cannot express (per-file registries), so the item's own guardrail would always stop | Read-with-legacy-fallback instead; guardrail updated |
| I-22 | W4.4 | `matchedBy: "branch-slug"/"git-diff"` cannot be produced without editing `lib/openspec.js`, which is Must-not-touch | `matchedBy: flag/branch/single-active`; verification adjusted |
| C-1 | README 31 / W1.8 | Disposition said the batched-trivial question "moves to W1.8", but W1.8 did not contain it | W1.8 Change step (4), source, Done-when; §4.1 row says "split" |
| C-2 | README 18 | `~/.claude` Glob and stale refs fixed in W6b.1, which the disposition row omitted | W6b.1 added to the row |
| C-3 | README 23 | B13 (drop the pre-wave guardrail LLM pass) lands in W5.3, not W5.2 | W5.3 added to the row |

### Per-item technical and executability corrections (verified findings)

| Item | What was wrong | Change applied |
|---|---|---|
| W1.1 | `parseArgs` range :47-80 (real :47-95); usage string ":1263" is the subcommand list; new case names lacked the filter token; wrapper branch unspecified | :47-95; header lines `execute.js:10`, `state/ship.js:12,14`; descriptions start `ship complete-step (usage):` / `execute-plan-sdlc/liveness/wave-done:`; `--branch fix/ctx-alpha` |
| W1.2 | Quote :15-23 was an excerpt; new case names lacked the filter token; the 1M window for bare aliases is not in reference 03 | :14-23; descriptions with `dispatch-budget:` and concrete numbers; comment and guardrail require confirming the window on model-config.md |
| W1.3 | CRLF fix incomplete: `yaml.js:42` `split('\n')` drops every CRLF key; §1 line 7 has three sentences; §7 described `review.js` effort pass-through as existing; case names lacked the filter token; Done-when not a command | `split(/\r?\n/)` added; sentence scope fixed; §7 says "not read today"; prefixed names; `grep -rnF '^---\n'` check |
| W1.4 | `try {` at :77, not :78; `node --check` named three files (two edited); the grep is not empty (`state-gc-migrate-exec.yaml:225-226`); filter matched no ship cases | Fixed line; two files; expected grep output; filter `ship-prepare\|ship-state\|ship-todos\|plan-prepare` |
| W1.6 | Dataset asserted exit codes that script-runner does not expose | `icontains`/`not-icontains` on `DRIFT:` |
| W1.8 | Verification not checkable | `awk '/^## 7/,0' … \| grep -c` ≥ 8 and the n ≥ 3 rule |
| W2.2 | Early-gate snippet crashed (`path` not required; `path.join(null)`); R67 sentence mis-cited; "Optionally" left a design choice; Done-when not checkable; whitespace pitfall in `-e` cases; the sweep case could never be selected | Safe snippet inside the lazy-load try; R67 :167 replacement; mandatory `ship-` check; grep line-order Done-when; whitespace note; fixture + description + filter |
| W2.3 | `'"exitCode": 2'` could never match (hook-runner nests the wrapper's JSON; the existing checks are vacuous); R20(b) quote not verbatim; exit-2 Stop also blocks the stop once | javascript assert on the inner `exitCode` for all six cases; verbatim quote; note |
| W2.4 | `loadShipStateOrExit` :272 (real :273); `cmdBeginStep` lacked import and slug; pause case put in the wrong dataset, with whitespace in `script_args`; filter matched nothing | :273; `path.join(resolveStateDir(), … slugifyBranch(data.branch) …)` + import; hooks dataset case with no-whitespace `-e`; filter fixed |
| W2.5 | `stop-plan-integrity.js` has no payload after W2.3 | `resolveHookContext(null)` |
| W2.6 | Deleted `maxAgeMs`, which the kept legacy cleanup needs, and left `consumedRecoveryPath` refs in the sweep; ranges :205-237/:196-199/:119-165 off; docs deletion :263-279 broke a fence; site copy rule contradicted cross-rule 2 (25 files already drift); spec quote lacked backticks; final check had no command | :202-238 + :253-254, keep `maxAgeMs`; :191-195; :119-170; :258-282 section; regenerate via `copy-docs.mjs` in a separate commit; verbatim quote; filter command |
| W3 P-1/P-7 | Shell state does not persist between Bash calls; `$TMPDIR` empty here, so P-7 wrote `/spec-rids.txt` | Run P-1 in the same call; `T=$(mktemp)` |
| W3 Facts | "All seven (removed) entries" lists eight | eight |
| W3.1 | `spec-compliance.md:41,54` review dimension demands gap-free numbering, which contradicts the new id rule (W3.2 creates gaps); `site/src/content-source/**` Must-not-touch contradicted cross-rule 2 | Change 8 rewrites both lines; "hand edits to … (regenerate)" |
| W3.2 | R34/R38/R47 tuning defaults left in the body (D4); R57 append named the schema, not `BUILT_IN_DEFAULTS`; P-3 lacked `(Fixes #N):` / `(issues #N, …):` forms; :112 parenthetical had no rule; capture commands missing; no model grep | Three deletions; R57 text; P-3(a) forms; :112 to trail; before/after capture commands; `\b(haiku\|sonnet\|opus)\b` = 0 |
| W3.3 | Must-not-touch froze R-wave-runner-contract although the change edits its :91 | Exception for the :91 tuning replacement |
| W3.4 | `validate-plan-format.js` requires `--file`; the bare command fails | Bullet replaced |
| W3.5 | No placement rule for legacy R-ids, too loose for a weaker executor | Default mapping + per-id mapping in the commit body |
| W3.6 | Fence-toggle regex shown as an invalid `^\s*```)`; missing-dir and `--json` behaviour unspecified; case 1 passes on a crash | `/^\s*```/`; behaviours specified; javascript `--json` case 3 (3/3) |
| W4.1 | R1 range :510 (blank line); F2 missed `"workspace"` keys at :171/:190/:209 (the item's own grep would fail) and steps 7–8 renumbering; the `ship-init.js --workspace` conditional is already answered by the code; Done-when cited a shifting line | :511–518; three keys + commas; renumber 6–8; unconditional removal (`ship-init.js:84–87`); grep-based Done-when |
| W4.2 | `readState` takes `(prefix, branchSlug)`, not a path; `writeOutput` :1605; the interim fallback pointed at text the item deletes; P-TRANS-2 violated by family rules; :361 orphaned; "keeping the heading" contradicted the new heading; "KEEP :600–619" had no destination; regression filter missed state-verb cases; ledger assertions impossible from javascript; Done-when grep could not match; shell-quoting of agent text | All corrected: path read via `loadShipStateOrExit` pattern; :1605; C16 inlined; P-TRANS-2 amended; :295–361; replacing heading; placement stated; filter widened + hooks run; `run-ship-stepper.js` wrapper; `grep -cE 'begin-step\|complete-step'`; Write-tool temp file |
| W4.3 | `computeSteps` :425–830, `resolveAgentsDir` :73–144; eleven agent rows, not ten; fixture doc row missing; Done-when failed on the S1 = NO path; `docs/architecture.md` in Files without a Change | Lines; eleven; fixture row; conditional Done-when; Change 6 |
| W4.4 | Heredoc/prompt line numbers off; execute fence :667–682; undefined `$OPENSPEC_STEP`; pr range left :188 dangling; plan Glob lines :24/:26/:32/:46; archive case needs an `openspec` CLI stub; Done-when not mechanical | All corrected; stub via `script_stub_bin`; `cliAvailable:false → halted` |
| W4.5 | Branch-slug rule for the summary copy unspecified (LLM and script must agree) | `slugifyBranch` named, emitted by the orchestrator |
| W4.6 | :404–406 → :407; `verifySideEffect` :1055–1087; `commit-fixes` would pass as `no-side-effect`; `-q .url` discarded `state`; non-deterministic sha | Lines; `--step commit` for commit-fixes; full JSON check; wrapper script |
| W5.1 | B17 replacement still pseudocode (agent text is not a shell var; vars don't persist); B40 left :247 dangling; :364 → :365; dataset case :368 → :363; Done-when not mechanical | Write-tool temp file; :245–247; lines; `grep -c 'attempts\` array'` = 0 |
| W5.2 | `stripFences` dependency missed; ship.js/ship-fields/SKILL ranges off (:367–407, :982, :1571–1582, :153–172, :403–435, :180–203); `commitWaves` missing from the schema; README row already exists at :35; unnamed fixture and final case; `validate-plan-format.js` needs `--file` | All corrected; new fixture `project-execute-prepare`; final case `execute-plan-sdlc.yaml:54` |
| W5.3 | Bullets :445–449; worktree refs not at SKILL :449; grep ambiguous; dataset lines :363/:646; Done-when required 7 behavioral runs (policy allows one); subagent_type shorthand | All corrected; Done-when = the `:199` case only |
| W5.4 | Fence :667–682; sync warnings :831–837 | Fixed |
| W5.5 | `execute` config lives in `.sdlc/config.json`, not `local.json`; README/skills-meta in Files without an action | Fixed; conditional sync |
| W6a.1 | Verification grep could never be empty (docs keep legitimate mentions); :251 replacement contradicted ops-ref :249–250; dead scaffolding list incomplete | Scoped greps; "step 5 critique"; `loadFixture`, `crypto` added |
| W6a.2 | `GATE_JSON=$(…)` hid the JSON from the model | Plain call; fields named |
| W6a.3 | Expected grep output wrong; "add to the table" vs Must-not-touch the table | Fixed |
| W6a.5 | `--save` via `saveCache()` impossible (reads stdin, exits); range :272–305 deleted the `--load` block; REFERENCE/EXAMPLES edits not in Files; second case unselectable; `--output-file` silently ignored | `writeCacheFile` helper; :272–297; Files; prefix; parseArgs accepts the flag |
| W6a.6 | Id order self-contradictory; filter matched three cases; duplicate "Step 4" heading in docs; out-of-scope edits; "check" not an action; vague grep | All fixed |
| W6a.7 | Grep matched untouched lines; "move or delete" left a choice | Narrowed regex; delete |
| W6a.8 | `--target <target>` vs "(default)" | `--target plan` |
| W6a.9 | Verification ran `setup.js` inside the repo (scans the repo root via `resolveSdlcRoot`); `copilotEnabled` had no home; "4-line"/"13 bullets" wrong; fixture scope ambiguous | Temp-copy command; sub-flow computes it; exact wording; 14 bullets; five fixtures |
| W6b.1 | :93–94 → :92–94 | Fixed |
| W6b.3 | `SKILL.md:248` shifts after W6b.1; final check unnamed; spec R-orchestrator-await (a) still requires `run_in_background: false` | Locate by text; explicit filter; spec clause rewritten |
| W6b.4 | Dataset not registered; one fixture for five threshold scenarios; shared `/tmp` output dir races under concurrency; exit code not observable; OWASP behavioral cases would get no inline JSON; :792 attribution case renders a removed step; step-list range swallowed `## DO NOT`; rule-1b `<PLUGIN_ROOT>` pitfall | Registered; five fixture dirs; `{{project_root}}/out`; stderr assert; `user_request` change; case moved to exec; :24–189; brace-form guardrail |
| W6b.5 | Premise "Sonnet default was `high`" is outdated (Sonnet 5.5 defaults to `medium`, reference §5); `security.md` justified as "preserving" behaviour; `KNOWN_FIELDS` :59–62; missing W6b.3 dependency | Premise and expected effect corrected; intentional raise; line; dependency |
| W6b.6 | Consent-gate range :364 → :362; verification greps expected wrong output; final check unnamed | Fixed |
| W6c.1 | — (verified OK) | — |
| W6c.2 | `error-report-prepare-exec.yaml` not registered (filter ran zero cases); `--error-type "script crash"` broken by whitespace splitting; `priority` expression self-referenced the manifest literal; Done-when not a command; `:41–42` REFERENCE mention uncovered; W6c.1 line shift | Registered; `script_stdin`; `const errorType`; harden-prepare command; grep; dependency |
| W6c.3 | Gate :200 → :198; "before any git command runs" false (Step 1c ran git); dataset phrase crosses a folded line; filter with literal parentheses matches nothing | Fixed |
| W6c.4 / W6c.5 | Filters with `+` / wrong description prefixes matched nothing | Regex-safe filters |
| W6c.6 | Mirror fixtures without a `.sdlc/review-dimensions/` path would report `skipped` | Fixture layout specified |
| W6c.8 | Verification ran exec suites that do not read the edited prose | Two greps |
| W6c.10 | Filter matched none of the script-resolution cases; wave-runner wording mis-described; count expected 0 while ship/execute are excluded; `setup-init.js` omitted from util line | All fixed |
| W7.1 | Rule-13 header :44–52 and doc :719–720; comment :275–277; fixture `plan-sdlc-c2-material-change.md:60` quotes removed text; Done-when not a command; no `cd`; sub-item order shifts lines | All fixed |
| W7.2 | "Unpinned dispatch inherits this agent's model" is wrong (falls back to the main conversation's model); filter matches seven cases; no `cd`; behavioral case lacked `user_request` | Fixed |
| W7.3 | HEAD line numbers after W7.1 shifts; P1/c2 rubrics contradicted the item's own guardrail-lane skip; c2 prose :59–66 stale; empty `--lanes` rejected by the parser style; Lane 4 variables :424 not updated; requirements lens has no severity sentence; g17 fixture assertions conflicted; PF4 case named a cycle the fixture lacks; Must-not-touch vs change 9; Done-when elided | All fixed |
| W7.4 | Behavioral sweep missed cases asserting the old dispatch shape; `readAgent` would throw on missing frontmatter; R39 omitted; `buildLanes` range; `ls` check not a count | All fixed |
| W7.5 | W4.4 Change 5 order; non-numeric verification | Fixed |
| W7.6 | Self-negating sentence; Change 2 contradicted Verification; core premise unsound (see R-2) | Sentence and contradiction fixed; item gated on measurement; Q13 added |
| W7.7 | Content lane still excludes G14 (:135); `docs/cost-tiers.md` missing from Files; g17 skip rule contradicted W7.3 | Fixed |
| W7.8 | Edited text that no longer exists; c2 is a task-count change, so the selective rubric would fail; unnamed filter/fixture path; `lens:*` vs `lens:all` for <5-task plans | New contract-change case and fixture path; mapping rule |
| §0 rule 5 | New exec cases did not have to match the item's filter | Descriptions start with the filter string; regex escaping note |

### Subagent findings not applied (my decision)

| Item | Finding | Why left |
|---|---|---|
| W6a.9 | Root the scan at `resolveActiveWorktreeSafe()` instead of the main worktree | Design choice about setup semantics, not a defect → R-5 |
| W7.6 | Replace the item by a measurement-only item | It implements maintainer refinement (a). It is gated on the measurement instead, and the decision is left to the maintainer → R-2 |
| W2.2 | Reference 03 does not list `additionalContext` for PostToolUse | The plan keeps today's output shape; recorded as unverified → R-6 |
| W2.5 | The new "no `.sdlc/execution`" case passes on today's code too | Kept as a smoke test |
| W6c.1 | Add `not-icontains "validate-cost-tiers.js error"` | Nice-to-have; not a defect |

## 5. Residual concerns for the maintainer

- **R-1 — Trap convention (Q11) is still undecided and is a live defect today.** `trap … EXIT` in pr-sdlc :107, version-sdlc :48, error-report-sdlc :82, review-sdlc :30, received-review-sdlc :136 and plan-sdlc :96/:195 deletes manifests when the declaring Bash call ends, before later calls read them. The plan now fixes only harden (W6c.6) and commit (no trap added). Decide the pattern before W6c.4/W6c.5/W6b.1/W6b.6/W7.1 run, and either add one item that applies it across these skills or extend the owning items.
- **R-2 — W7.6's cache premise.** Each plan critique agent file is its own system prompt and tool list. Dispatches of different agent types therefore cannot share a cached prefix, and inlining the plan costs Opus output tokens per dispatch. W7.6 is now measurement-gated (Q13). Confirm whether refinement (a) still stands. W7.7 depends on the W7.6 measurement.
- **R-3 — D2 default.** W5.3 ships with `waveRunnerMinTasks: 1` (runner always) and flips only after S3. If D2 is meant to make main-context dispatch the default immediately, say so; otherwise the current gating is the conservative reading.
- **R-4 — Dead validator rules (Q14).** Rules 2, 3, 4, 5 and 11 of `check-consistency.js` never fire since the scripts moved into subdirectories. Validators the plan uses as gates are therefore weaker than the plan assumes. Consider an item to repair them before M2's CI goes live.
- **R-5 — Setup scan root (W6a.9).** Main worktree (today's `resolveSdlcRoot`) vs active worktree (`resolveActiveWorktreeSafe`, precedent at `worktree.js:97`).
- **R-6 — Unverified harness facts** carried by the plan: PostToolUse `additionalContext` (W2.2), bare-alias 1M context windows (W1.2, now guarded), the `experimental.evals` value format (W1.7, already guarded), and fork permission/consent behaviour (S1).

## 6. Recommendations on residual concerns

Written 2026-10-18 at the maintainer's request. The plan is **not** edited yet: each "plan change" below is the edit to make once the maintainer has decided. Code references are HEAD `0c0cdcc`.

| | Recommended option | Plan change |
|---|---|---|
| R-1 | (c) Persistent manifests under `.sdlc/execution/`; remove every `trap … EXIT` | New W1.9 (M1); correct W6c.3; simplify W6b.1, W6b.6, W6c.6; close Q11 and S11 |
| R-2 | Keep per-lane agent files and path reads; do not inline the plan | W7.6 becomes measurement-only; W7.7 depends on that measurement; Q13 closes |
| R-3 | Flip now for small plans: plan-size threshold, default `9`; S3 tunes it | Edit W5.3 Changes 4, 9 and 10, W5.2 config key, Q1 |
| R-4 | Repair now, in M1, before the CI in W1.5 goes live | New W1.10 (M1, after W1.9) |
| R-5 | Active worktree for content; main worktree for `.sdlc/` reads | Edit W6a.9 |
| R-6 | Verify each fact by a doc fetch first, a live check only if the doc is silent | Add a "verify first" guardrail to W2.2, W1.2 and W1.7; S1 stays as the spike |

### R-1 — Manifest hand-off and the `trap … EXIT` convention

**The problem.** Each Bash tool call in Claude Code runs in its own shell, so an `EXIT` trap fires when the call that declared it ends.

`trap 'rm -f …' EXIT` is the last line of the Step 0 block at these sites:
- `ship-sdlc/SKILL.md:80`
- `entry-modes.md:23`, `:38`
- `pr-sdlc:107`
- `version-sdlc:48`
- `review-sdlc:30`
- `received-review-sdlc:136`
- `error-report-sdlc:82`
- `harden-sdlc:74`
- `jira-sdlc:86`, `:124`
- `plan-sdlc:96`, `:195`
- `setup-sdlc:632`

That is 14 sites in 11 files; §5's list had 7 of them. At every site the manifest is gone before the next call reads it: the skill's own Read, or an orchestrator subagent.

The repository already found and fixed this once. Commit `470d248` (#398/#399, "persistent manifest … cross-shell manifest survival") moved commit-sdlc's manifest to `.sdlc/execution/` through `writeManifestState` (`lib/state.js:340`, prune-on-write via `pruneStateFiles`), and `commit.js:355` still does this at HEAD.

**What already exists.**
- `lib/output.js writeOutput(data, prefix)` (`:47-52`) always writes `os.tmpdir()/<prefix>-<8 hex>.json`, prints the path and exits. It has no cleanup and no GC.
- `lib/state.js` has `writeManifestState` (branch-keyed `<prefix>-<slug>-<ts>.json`, prune-on-write), `gcStateFiles` (TTL plus branch-gone, default 7 days, `state.gc.ttlDays`) and `gcTempdirs` (os.tmpdir dirs by prefix).
- `ship.js --gc` (`:1193-1201`) sweeps the `ship`, `execute`, `plan` and `commit` prefixes plus `sdlc-explore-` tempdirs.
- `parseStateFilename` (`lib/state.js:408`) accepts only `ship|execute|plan|commit`.

**Options.**

| Option | How it works | Verdict |
|---|---|---|
| (a) No trap; a run-scoped tempdir under `os.tmpdir()`, removed by a final cleanup step or a TTL sweep | Needs a new run-dir convention in every script, plus a cleanup step that every exit path of every skill must reach. Only `gcTempdirs` exists, and only `ship.js --gc` calls it. | Workable, but cleanup is again prose the model must follow, and there is no prune: files accumulate until someone runs `--gc` |
| (b) Keep the trap; read in the same Bash call (`cat "$FILE"`) | Works only when the main context consumes the JSON in that same call | Not viable. The review, received-review, commit, error-report and harden manifests are read by an orchestrator subagent in another process. `review-sdlc/SKILL.md` forbids reading the manifest into main context. `cat`-ing pr/review manifests that carry diffs costs main-context tokens |
| (c) Manifests under `.sdlc/execution/` with the existing prune and GC | Generalise the #399 fix. Prune-on-write bounds files to one per skill per branch, `--gc` removes stale ones, and survival across Bash calls is already tested | **Recommended** |

**Recommendation: (c), implemented once in `lib/output.js`.**
- `writeOutput` writes to `<resolveStateDir()>/out/<prefix>-<slug>-<ts>.json`. The `out/` subdirectory keeps these files from colliding with state-file lookups, and `parseStateFilename` and the hooks stay unchanged. The branch comes from `git branch --show-current`, else `nobranch`.
- It falls back to `os.tmpdir()` when `resolveStateDir()` throws (non-git fixtures).
- Prune-on-write removes same-prefix, same-branch files older than one hour, so two concurrent sessions do not delete each other's manifest.
- It writes `.sdlc/execution/.gitignore` containing `*` if that file is absent. Repository-level ignore is not guaranteed in consumer projects; `ship.js` already warns on `sdlcGitignored === false`.
- `ship.js --gc` and the `session-start.js` stale sweep gain an `out/` sweep (24 h).
- Every `trap … EXIT` line is deleted with no replacement. Pruning makes per-exit `rm -f` unnecessary, which also removes about 14 cleanup sentences and the "do not add scattered rm" prose.

Reasons: one change point covers every prepare script, it reuses tested machinery, and no SKILL.md has to narrate cleanup. Commit-sdlc's success path already runs this way, and #398's review accepted the residual risk that a diff stays on disk under a gitignored `.sdlc/` until the next prune or GC.

**Plan change.**
- **New W1.9 "Persistent prepare manifests; remove EXIT traps" (M1, after W1.3, before W1.4).**
  - Files: `scripts/lib/output.js`, `scripts/lib/state.js` (an `out/` GC helper), `scripts/skill/ship.js` (`--gc`), `hooks/session-start.js` (sweep), and the 11 skill files above (delete the trap lines and their "trap cleans up" sentences). Datasets: one exec case modelled on the #399 cross-shell survival case (the path printed by one process is readable by a second `node` process after the first exits), one prune case, and one `--gc` case.
  - Verification: `grep -rn "trap '" plugins/sdlc-utilities/skills` returns nothing; `--filter-pattern "manifest-persist|ship-prepare|session-start"` passes.
- **Edit W6c.3.** Change 4 and its dataset edit are wrong. The success-path manifest *is* persistent (`commit.js:355` → `writeManifestState`), so replacing the comment with "the manifest lives in os.tmpdir()" and rewriting `commit-sdlc.yaml:187-188` would introduce a false statement. After W1.9 the comment becomes "No trap: prepare manifests persist under `.sdlc/execution/` and are pruned on the next run". The explicit `rm -f` lines may stay (the dataset asserts them). This is a plan defect the review in §4 missed.
- **Edits elsewhere.**
  - W6c.6 Change 6: drop the per-skill trap replacement.
  - W6b.1 Change 2 and W6b.6 Change 1: drop the trap wording.
  - W7.3: keep the `critiqueDir` design, which is the same idea.
  - Close Q11 (trap half) and S11.
  - §0 cross-workstream rule (4) becomes "prepare manifests persist; never add `trap … EXIT`".

**Risk if the maintainer chooses otherwise.**
- (a) or the status quo: 11 skills keep a broken Step 0 hand-off. The first real (non-simulation) run of pr, version, review or received-review fails or improvises, and promptfoo's simulation mode cannot see it (S8).
- (b): the orchestrator-based skills stay broken, and main context grows by the size of each manifest.

### R-2 — W7.6 prompt-cache sharing for the plan critique dispatches

**Facts** (Claude API prompt-caching guide, bundled claude-api skill `shared/prompt-caching.md`):
- The cache is a prefix match rendered in the order `tools` → `system` → `messages`.
- Caches are model-scoped.
- The minimum cacheable prefix is 512 tokens on the 5.5 models.
- The default TTL is 5 minutes.
- "A cache entry becomes readable only after the first response **begins streaming**. N parallel requests with identical prefixes all pay full price."

**The counter-argument, evaluated.** With ONE shared critique agent definition (same system prompt and tool list) and the lane selector in the dynamic tail, the prefix of system + tools + inlined plan is byte-identical across lanes. That much is correct, and per-lane agent files do break it. But four facts defeat it here:
1. **Parallel fan-out reads nothing.** W7 dispatches all lanes and lenses in one message (R-orchestrator-await, single-message fan-out). Simultaneous requests cannot read each other's entries, so the first batch is all writes, at 1.25× input price on the shared part.
2. **The lanes are on different models.** The static lane runs on haiku and the others on sonnet (`plan.js buildLanes` :264-282; the W7.4 agent files keep this). Model-scoped caches cannot be shared across them.
3. **The plan bytes change between iterations.** Step 5/6 (IMPROVE) rewrites the plan, so an inlined plan has a different prefix in every iteration. A later iteration cannot read an earlier iteration's entry either.
4. **Inlining is paid in Opus output tokens.** The Agent `prompt` is written by the plan-sdlc main context (`model: opus`, `SKILL.md:6`) as output, at $20/MTok. An 8k-token plan inlined into 7 dispatches is about 56k Opus output tokens, roughly $1.12 per iteration. Reading the same plan by path is about 56k Sonnet input tokens, roughly $0.11 ($2/MTok, before any cache), and the best case for a cache read is $0.20/MTok. Inlining therefore costs about ten times what it could save.

**Recommendation.** W7 keeps the W7.4 shape: per-lane agent files, each pinning its own model and effort, with the plan read by path. W7.6 is reduced to a measurement. The parts of W7.6 that cost nothing and keep the cacheable part static stay:
- static content first in each agent body;
- no timestamp or run id above the `## This run` block;
- the shared `critique-common.md` text copied into each agent body, not passed by path, so each agent's system prompt is stable across iterations and its own entry is reused within the TTL.

**Measurement that decides it.** Over one 3-iteration full plan run (≥5 tasks), record per critique dispatch from W1.1 `usage`:
- `inputTokens`, `cacheReadTokens` and `cacheWriteTokens`;
- the caller's output tokens spent writing the dispatch prompts.

Adopt a shared-agent, inlined-plan shape only if the measured cost per iteration, including the caller's output tokens, falls by ≥15% against the current shape, with the dispatches staggered (first dispatch, then the rest after it streams). The P1/c2 behavioral cases must still pass. Given points 1–4 above, the expected result is "keep per-lane".

**Plan change.**
- Rewrite W7.6 as "measure critique-dispatch cache behaviour; no inlining": Files `docs/cost-tiers.md` §7 only; Done-when = the §7 row exists.
- Delete Changes 1–4 of W7.6.
- W7.7 depends on the W7.6 row.
- Close Q13. Record refinement (a) in §4.3 as "measured, not built".

**Risk if the maintainer chooses otherwise.** Building the inlined shared prefix raises the cost of every plan run (Opus output tokens per dispatch), removes per-lane model and effort pinning (the cheap haiku static lane would have to move up a tier), and adds a 60 KB size-guard path to maintain. None of this pays back while fan-out stays parallel.

### R-3 — D2: when execute dispatches workers from main context by default

**Options.**
1. Flip W5.3 to direct dispatch for every plan now.
2. Keep "runner always" until S3 has run, as the plan does today.
3. Flip now for small plans, use the runner for large ones, and let S3 tune the boundary.

**Recommendation: option 3, with the predicate on plan size, not wave size.** Code facts:
- The wave cap is static: 1–3 tasks → no cap, 4–8 → 4, 9–15 → 5, 16+ → 6 (`dispatch-budget.js STATIC_CAP_TABLE`, spec R4). A wave never exceeds 6 tasks, so W5.3's current predicate `wave.taskIds.length >= waveRunnerMinTasks` can only distinguish 1–6 and cannot express "large plan".
- Main-context growth under direct dispatch accumulates over all waves. It is bounded per worker by the bounded return contract (R-BOUNDED-RETURN, `WAVE_SUMMARY` schema).
- Plans of 1–3 tasks already run in main context (R-small-plan-inline).

D2 says the wave-runner is "opt-in for large/complex plans", which is a property of the plan.

So W5.3 should ship with `execute.waveRunnerMinPlanTasks` (renamed from `waveRunnerMinTasks`), default **9**: plans of up to 8 tasks, the first cap band, run workers from main. That is D2's default for typical plans. S3 then measures a 12-task, 3-wave plan in both modes and moves the threshold. This honours "proceed after measurement" for the large-plan case only, where the context risk actually lies.

**Plan change.**
- W5.3 Change 4: predicate `plan.tasks.length >= flags.waveRunnerMinPlanTasks`.
- W5.3 Change 9: default `9`; S3 adjusts it.
- W5.3 Change 10: R8 text names the plan-size threshold.
- W5.2: config key and schema field `waveRunnerMinPlanTasks` (integer, minimum 1).
- Q1 rewritten: "the plan-size threshold above which the runner is used".
- S3 measures at 12 tasks.

**Risk if the maintainer chooses otherwise.**
- Option 2: D2's default does not take effect until M5 plus a measurement, and the per-wave predicate as written never expresses "large plan".
- Option 1: unmeasured main-context growth on 16+ task plans, which run on the most expensive context with the deadline loop running in main.

### R-4 — Dead validator rules 2, 3, 4, 5 and 11

**Facts** (`.claude/skills/validate-plugin-consistency/check-consistency.js`):
- `discoverScripts` (`:125-128`) lists only top-level `plugins/sdlc-utilities/scripts/*.js`, and there are none.
- `SCRIPT_TO_SKILL` (`:163-171`) names `*-prepare.js` files that no longer exist.
- `containsPrepareScriptExecution` (`:216`) looks for the retired `find … -name "<script>"` resolver, and `containsNodeScriptCall` looks for `node "$SCRIPT"`.

Every per-script rule returns before checking anything. The plan relies on these validators as CI gates (W1.5), so a green check on these rules today carries no information.

**Recommendation: repair now, in M1 (before W1.5 makes CI authoritative), as a new item W1.10, after W1.9 so that rule 11 matches the new convention.**

- **Files:** `check-consistency.js`; `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml`; new fixtures `tests/promptfoo/fixtures-fs/prepare-contract-cases/{good-project,bad-project}`.
- **Change:**
  1. Replace `SCRIPT_TO_SKILL` with a skill → script map using current paths:
     - commit-sdlc → `skill/commit.js`
     - pr-sdlc → `skill/pr.js`
     - version-sdlc → `skill/version.js`
     - review-sdlc → `skill/review.js`
     - received-review-sdlc → `skill/received-review.js`
     - jira-sdlc → `skill/jira.js`
     - ship-sdlc → `skill/ship.js`
     - plan-sdlc → `skill/plan.js`
     - setup-sdlc → `skill/setup.js`
     - error-report-sdlc → `skill/error-report-prepare.js`
     - harden-sdlc → `skill/harden-prepare.js`
     - execute-plan-sdlc → `skill/execute.js`, skipped while the file is absent (until W5.2)
  2. `discoverScripts` lists `scripts/skill/*.js`.
  3. "Runs its script" means a bash fence containing `node "<PLUGIN_ROOT>/scripts/skill/<file>"`.
  4. Rule 2 checks that invocation. Rule 3 checks `--output-file` (kept by convention, Q11). Rule 4 checks `EXIT_CODE`. Rule 5 checks `$ARGUMENTS`, exempting the three skills that pass explicit flags (error-report, harden, plan).
  5. Rule 11 becomes `no-exit-trap`: an error on `trap … EXIT` inside a code fence of `skills/**/*.md` (per R-1).
  6. Update the header comment.
- **Verification:**
  - Before editing, run the validator on the repo and save the output; after editing, run it again. Every new finding is either fixed in the same commit or listed in the commit body with the owning item (after W1.9 there should be none).
  - Two new exec cases, `prepare-contract: flags missing EXIT_CODE, --output-file, $ARGUMENTS and an EXIT trap` (bad-project) and `prepare-contract: clean project passes` (good-project); run with `--filter-pattern "prepare-contract"`.
  - The existing `script-resolution` and `orchestrator-await-barrier` cases still pass.
- **Done when:** the rules fire on the bad fixture and the repo run is clean.

**Risk of deferring.** M2 CI and every item verification that runs `check-consistency.js` report green while the prepare-script contract (EXIT_CODE gate, `--output-file`, `$ARGUMENTS`) can regress unnoticed, at exactly the time W4/W5/W6 rewrite those Step 0 blocks.

### R-5 — Root of the setup project scan (W6a.9)

**Options.**
1. Main worktree (`resolveSdlcRoot()`, today's `setup.js:541`).
2. Active worktree (`resolveActiveWorktreeSafe()`, `lib/worktree.js:97`).

**Recommendation: the active worktree for the scan, with `.sdlc/` reads still from the main worktree.** The repository has an explicit convention: `projectRoot` = main worktree for `.sdlc/` config and state (#351), `contentRoot` = active worktree for content scans (#457 `plan-explore.js:332`, #474 `harden-prepare.js:236`, `plan.js:448`).

The scan reads branch content: manifests, CI files, PR templates, `CLAUDE.md`. It also runs `git` for the branch name, recent commits and Jira keys from the branch. In a linked worktree, the main-worktree scan would report main's branch and commits, so `jiraEvidence` would be wrong. `detectReviewDimensions` (`.sdlc/review-dimensions/`) is configuration and keeps `projectRoot`.

**Plan change (W6a.9).**
- `scanProject(contentRoot, { projectRoot, prs })`; `setup.js --scan` passes `resolveActiveWorktreeSafe()` and `resolveSdlcRoot()`.
- `signals.reviewDimensions` reads from `projectRoot`; every other field from `contentRoot`.
- `guardrails.js` is unchanged (still `projectRoot`, Must-not-touch).
- Add one exec assertion that `scan.git.branch` equals the fixture's branch.

**Risk if the maintainer chooses otherwise** (main worktree): in linked worktrees the PR-template and dimension proposals are built from the wrong branch's files and commits, which is the class of bug #457 and #474 already fixed for plan and harden.

### R-6 — Harness facts the plan relies on but has not verified

Each fact is verified by a doc fetch first, then a live check only if the doc is silent. Each check is a short "verify first" step at the top of the item it gates.

| Fact | Cheap verification | Gates |
|---|---|---|
| PostToolUse hook output supports `hookSpecificOutput.additionalContext` (reference 03 lists it for PreToolUse and Stop, not PostToolUse) | Fetch https://code.claude.com/docs/en/hooks.md, section "PostToolUse decision control". If silent: in a scratch project, register a PostToolUse command hook that prints `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"MARKER-7f3"}}`, run one Bash call interactively and ask the session whether it sees `MARKER-7f3` | W2.2. If unsupported, today's nudge has been inert, and W2.2 becomes "delete `pipeline-continue.js`" (design #3's original option) |
| Bare `sonnet`/`opus` aliases in Claude Code run with a 1M window (reference 03 lists `sonnet[1m]`/`opus[1m]` separately; the API model table gives 1M for Opus 5.5, Sonnet 5.5 and Haiku 5.5, with Haiku pricing changing above 100K) | Fetch https://code.claude.com/docs/en/model-config.md, sections "Model aliases" and "Extended context". The Models API `max_input_tokens` (`client.models.retrieve("claude-sonnet-5-5")`) confirms the model; the docs confirm what the alias selects | W1.2 constants (and W5.2, which consumes them). If the bare alias is smaller, use the `[1m]` alias in agent frontmatter or keep the sonnet/opus budget at the alias's window |
| `plugin.json` `experimental.evals` value format | Fetch https://code.claude.com/docs/en/plugin-evals.md; then `claude plugin eval --help` and `claude plugin validate plugins/sdlc-utilities` after adding the field (W1.7 already says "do not guess") | W1.7 |
| A `context: fork` / plugin-agent step inherits the session permission mode, can reach `AskUserQuestion`, and honours agent `effort:` | Fetch https://code.claude.com/docs/en/skills.md (`context: fork`, `agent`) and https://code.claude.com/docs/en/sub-agents.md (plugin-agent limitations, tool access). Then the S1 half-day spike as written (throwaway skill: `git status`, one `AskUserQuestion`, `effort` probe via `${CLAUDE_EFFORT}`) | S1 → W4.3, W7.4 (Q5) |

## 7. Applied

On 2026-10-18 the maintainer accepted all six recommendations in §6, and they were applied to [`consolidated-plan.md`](consolidated-plan.md). The plan now has **67 items** (65 + W1.9, W1.10); no existing ID changed.

| Decision | Items changed |
|---|---|
| R-1 (option c) | **New W1.9** "Persistent prepare manifests under `.sdlc/execution/`; remove every `trap … EXIT`". It lists all 14 `trap` commands, 20 comment lines and 15 cleanup-prose lines in 11 skill files by `file:line`. **W6c.3:** the Current-state claim, Change 4 and the `:187-188` dataset edit are fixed (`commit.js:355` writes the manifest via `writeManifestState`); W1.9 added to Depends on; Done-when updated. **W6c.2:** trap wording removed; depends on W1.9. **W6c.6:** H6 no longer replaces the trap; depends on W1.9. **W6b.1:** Change 2 dropped, verification and Done-when updated. **W6b.6:** trap text removed, `--output-file` rationale changed, depends on W1.9 and W1.10. **W4.5:** current-state note and Must-not-touch updated. The W6c header finding 1, the W6c cross-workstream note and the W7 "trap fragility" note are updated. §0 cross-workstream rule (4) is rewritten. S11 and Q11 are closed |
| R-2 | **W7.6** rewritten as a measurement-only item (usage plus the caller's dispatch-prompt output over one 3-iteration run; a shared shape only at ≥15% saving per iteration). **W7.7** depends on the W7.6 §7 row. §4.3 row (a) updated. Q13 closed |
| R-3 | **W5.2:** key renamed to `waveRunnerMinPlanTasks`, default 9; schema field with minimum and default. **W5.3:** Changes 4 (plan-size predicate), 9 (default 9; S3 moves it) and 10 (R8 text); verification and Done-when follow the rename. **W5.5** config table renamed. **W3.3** hand-off pointer updated. **S3** rewritten. M5 row updated. Q1 closed |
| R-4 | **New W1.10** "Repair validator rules 2–5 and 11", with fixtures `prepare-contract-cases/{good,bad}-project` and two `prepare-contract:` exec cases. **W1.5** depends on W1.10. Q14 closed |
| R-5 | **W6a.9:** the scan is rooted at the active worktree (`resolveActiveWorktreeSafe`), `signals.reviewDimensions` reads from the main worktree, and a new `setup-prepare: --scan reports the active branch` case is added |
| R-6 | §5 gains the table "Harness facts to verify via docs first", one row per fact, each naming its gated item (W2.2, W1.2 and W5.2, W1.7, S1 → W4.3/W7.4). **W2.2** guardrail: verify first |

Plan-wide changes:
- §2: the count is now 67 and the W1 row reads W1.1–W1.10.
- §3: the M1 row adds W1.9 → W1.10 with two exit criteria (no trap in skills; no prepare-contract finding), and the internal-order note adds W1.3 → W1.9 → W1.10 → W1.5.
- §4: new §4.4 maps R-1…R-6 to items.
- §7 provenance gains one line.
- Source links were added to W1.9, W1.10 and W7.6.

Checks after applying:
- Every referenced W, S and Q ID is defined: 67 items, S1–S12, Q1–Q14.
- No code fence is left open.
- Link check: 251 resolved, 0 unresolved.

The brief mentioned "23" trap sites. HEAD has 14 `trap` commands, plus 35 comment and prose lines that promise trap cleanup. W1.9 lists all 49 lines.
