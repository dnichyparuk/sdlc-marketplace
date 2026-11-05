# Orchestration profile: sdlc (sdlc-marketplace fork)

Companion of `herdr-sdlc-profile.json` for the `orchestrate-herdr-sdlc` skill (v2.4.0, contract profile-1). Built
from the skill's sdlc test fixture (`tests/fixtures/profiles/sdlc.json`, `sdlc.md`) with the modes the owner
decided for M7 onward. The headings below are fixed by `reference/profile-contract.md`. The text under them
points to the project's binding records and keeps their decision ids. Where this file and a record differ, the
record wins.

## Decision sources and precedence

Precedence 1 (all equal; on a conflict, the later owner decision wins):

- **PLAN**: `assessment/03-plan/consolidated-plan.md`, section "Execution conventions (owner and arbiter,
  2026-10-19 to 2026-10-29)". This includes the 2026-10-29 "Wave-overhead cuts", which apply from M7, the
  2026-11-04 bullets and "In force since 2026-11-03".
- **LOG**: `/workspace/sdlc-marketplace/.sdlc/orchestration/log.md`, the append-only log of owner decisions
  with UTC timestamps.
- **RUL**: `/workspace/sdlc-marketplace/.sdlc/orchestration/`. Rulings are `ruling-*.md` at the top level and
  under `m3/`, `m4/`, `m4.1/`, `m5/` and `m5.1/`. Owner decision files are `owner-*.md` at the top level and
  under `m*/`. The standing-rules register is `standing-rules.md`, with `standing-rules-general.md` and
  `standing-rules-sdlc.md`.

Precedence 2:

- **ARB**: `/workspace/sdlc-marketplace/.sdlc/orchestration/arbiter-brief.md` (owner-approved 2026-10-18).
- **ADD**: `/workspace/sdlc-marketplace/.sdlc/orchestration/addendum-2026-10-18.md`. Where it differs from
  ARB, ADD wins (ARB, header).

The RUL, LOG, ARB and ADD paths are local state. They are gitignored by `.sdlc/.gitignore` and exist only in
the owner's checkout, so they are absolute paths, as the schema allows. Rulings are cited by id or file, never
by line number (DEC-1).

The owner language is English: "Talk to the owner in English" (ARB §1). The log records no other language
decision.

## Terms

- milestone = stage (M7, M8, M9);
- wave = work unit (one PR);
- item = a plan item (W<n>.<m> or a todo #9xxx).

Tracking ids are local todos: `#9001+` with `[type:tracking]` and `#9101+` with `[type:followup]`, in
`.sdlc/orchestration/todos.md` (PLAN "Tracking is local", owner 2026-10-19).

## Project hard rules

### SDLC-TEST-1

Testing per `AGENTS.md`: promptfoo only. Exec configs are targeted with `--filter-pattern` at any gate. At most
**one** targeted behavioural case runs, as the final check of an item. Never the full behavioural suite. No
run-fix-rerun loops (ARB §8).

### SDLC-PR-1

Interim pr-sdlc brief rule (PLAN "In force since 2026-11-03"; owner 2026-11-04, §6 Q29 (a), §6 Q30): a
standalone `/sdlc:pr-sdlc --auto` (the draft PR before ship, §6 Q28 (c)) still asks for business context. The
executor brief supplies it, or allows "Not detected". A question asked anyway is a STOP. The rule ends when W8.42
(#9220) is installed at the one M7 re-install after M7 wave 1.

### SDLC-PLAN-1

M7-1 pre-flight placement (PLAN "M7-1 pre-flight placement", owner 2026-11-04; supersedes the 2026-11-03 "not to
wave 1" rule):

- A todo that the pre-flight reproduces, that is S, and that touches only files M7 wave 1's 1a part already edits,
  joins M7 wave 1. The orchestrator logs it and the arbiter checks it.
- Anything else goes to M9 wave 4, or to the owner if it is urgent.

## Gates and test environment

- **Full gate** (`gates.full`, the executor's T1 run on the head): both exec configs, one after the other, then
  `claude plugin validate plugins/sdlc-utilities`.
  - Run from `tests/promptfoo` as `npx --yes promptfoo@0.123.1 eval ... -j 2 --no-cache -o <unique export under
    $SD/pf-logs/>` (RUL standing-rules-sdlc.md "Gates and checks"; ruling w2-floor; ruling stop-9).
  - Env (PF-ENV): `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main`, plus
    `TMPDIR=<a fresh scratch subdir>` for each run. TMPDIR changes per run, so it is not in `gates.env`.
- **Named branch** (`gateCheckout: named-branch`): the gate worktree is on a named local temp branch at the exact
  head SHA, never a detached HEAD. Some exec cases fail on a detached HEAD.
- **No `npm ci`**: there is no root `package.json` (m5.1 gate briefs). `setup.deps` only pre-fetches the pinned
  promptfoo.
- **Gate evidence** (`gateEvidence: executor-export`, owner cut 4): the executor's T1 export at the head is the
  evidence. The gate confirms the SHA and tree and runs only a targeted subset.
- **Claude Code pre-check** before every credentialed, headless or `claude plugin validate` run: record
  `command -v claude`, the link time of `/usr/local/bin/claude`, and `claude --version` (SDLC-STOP-3).
- **Credentials**: never read, print, source or probe `tests/promptfoo/.env` or any credential file
  (standing-rules-general.md, worker hard rules).
- **Timeout pattern**: a known timeout pattern gets ONE unchanged evidence re-run with `ps` captures (rulings
  stop-10-cause and stop-12; core GATE-8). It is not yet a profile standing ruling (see Open owner questions).

## Programme sources and hand-off package

- **Programme plan**: `assessment/03-plan/consolidated-plan.md`: §3 Milestones (wave map, exit criteria) and
  "Execution conventions". Milestone notes: `.sdlc/orchestration/post-m5-milestones.md`.
- **Carry-forward**: `.sdlc/orchestration/carry-forward.md`.
- **Wave map** (owner 2026-11-04, §6 Q30): nine waves, ten if M7 wave 1 splits.
  - M7: waves 0, 1, 2, 3. M7 wave 1 is split into 1a and 1b only past the split escape (about 30 files or 25
    commits).
  - M8: waves 1, 2.
  - M9: waves 1, 3, 4.
- **Plans**: written only under `docs/plans/` by the separate Opus planner session (PLAN "L items get a separate
  planner session").
  - Plan tasks carry `**Notes:**` (D2FORMAT, owner 2026-11-04).
  - The `**Commit:**` header is added by hand until #9176 is installed.
- **Plan verification**: owned by the orchestrator (owner 2026-10-27, RUL m5.1/owner-plan-review.md;
  LOG 2026-10-27T15:45:47Z). There is no arbiter plan check and no PLAN-OK. The orchestrator sends
  `PLAN-FROZEN <hashes>` for the record. After a small fix round, it checks the fix itself.
- **Hand-off package per wave**:
  - the wave's plan item text verbatim at the current `origin/main` SHA;
  - the handover file of the per-wave orchestrator reset (RUL orchestrator-wave-reset.md);
  - the standing-rules register;
  - the rulings index.
- **Workarounds**: the 0.21.29 workarounds are dropped since the fork swap of 2026-11-03 (PLAN "After the plugin
  swap"). The active fork rows come from `detect-tools.py`. The `--rebase skip` brief line stays until the post-M7-1
  re-install.

## Close-out and release

- **Release** (`release.mode: manual-bump`): a manual version bump and CHANGELOG entry on the wave branch, as one
  direct commit `chore(#<id>): release - vX.Y.Z` (ARB §3 D-version; PLAN "In force since 2026-11-03").
  - Patch for fixes and docs, minor for new capability.
  - The arbiter gives VERSION-OK.
- **Merge** (`merger: arbiter`, `merge: squash`): the arbiter merges on the owner's standing word with
  `gh pr merge <N> -R dnichyparuk/sdlc-marketplace --squash --match-head-commit <sha>`, alone in its Bash call
  (ARB §3 D-merge).
  - From M7, the check before the merge is one gate and one judge (`mergeCheck: verify-spot`, owner cut 2). The
    arbiter verifies the orchestrator's gate exports and judge table, then spot-checks them.
  - A REAL miss brings back the full arbiter gate and acceptance for the next wave ("merge check only", owner
    answer 1).
  - From M8 the arbiter role is split (RUL m8/owner-supervised-topology.md): the standing supervisor
    `sdlc-sup-<stage>` (Sonnet) merges only through `sup-merge.sh --live`, on a GO from its own Opus A3 subagent for
    the exact SHA. The merge, ready and tag rights are granted up front in `merge.permissionFile` of the
    supervisor's checkout only; the orchestrator never merges.
- **Tag**: the arbiter tags the squash commit (tagger dnichyparuk). From M7 this is `git tag -a vX.Y.Z <sha>` and
  `git push origin vX.Y.Z` in the main checkout (m7/arbiter-handover-r3.md §4); from M8 inside `sup-merge.sh`.
  Docs-only PRs get no tag.
- **Milestone close**:
  - the standing milestone-close e2e (B1, B4, B6; M7 adds a plan-sdlc case), owner-approved spend, $3 cap per
    run;
  - the metrics record, captured before any ledger cleanup;
  - then the owner's fork re-install (SDLC-STOP-2).

## Project stop conditions

### SDLC-STOP-1

Legacy: ARB §5. An owner gate on a measurement that would change a project constant: the S3 measurement result,
if it would move `waveRunnerMinPlanTasks` off 9 (re-measure #9164, M9 wave 4). STOP and ask the owner before
acting on it.

### SDLC-STOP-2

Legacy: PLAN Execution conventions. Fork re-install (owner action):

- after the M7 wave 1 release (after wave 1a if wave 1 splits; owner 2026-11-04, §6 Q30);
- at each milestone close, after the close e2e passes.

The orchestrator stops before the next wave. Before the re-install, every ship and execute ledger is finished or
cleaned up, and the wave's metrics and session costs are captured. No re-install follows M7 wave 0.

### SDLC-STOP-3

Legacy: M5.1 STOPs 13 and 14. A missing `claude` binary at the pre-check (Gates and test environment) is an
environment STOP, with no retry in that phase. A version change is disclosed, not a STOP. Claude Code
auto-update is off for the length of each milestone (owner action; done 2026-11-03 at 2.1.317).

## Defaults changed

Modes (each source is in `modes.sources`):

- `topology: standing-arbiter` (ARB §2; from M8 the standing agent is the supervisor, RUL
  m8/owner-supervised-topology.md).
- `reset: in-place-clear`, per wave: the per-wave orchestrator reset (owner 2026-10-22, kept 2026-10-26 and at
  the M5.1 close).
- `merge: squash`, `merger: arbiter` (ARB §3 D-merge; from M8 the supervisor through `sup-merge.sh`, same RUL
  file).
- `stacking: serial` (ARB §3 D-serial).
- `executorReset: per-stop`, with `executor.contextLimitK: 300` (owner cut 3, answer 5).
- `gateCheckout: named-branch` (M5 conventions).
- `release: manual-bump` (PLAN "In force since 2026-11-03").
- `transcriptScan: owner-authorised`, commands only (ruling commit-wrapper item 3).
- `usageFields: owner-authorised` (owner 2026-10-20 metrics; usage fields only).
- `orchestratorModel: sonnet-judged`, with `orchestrator.contextLimitK: 300` (owner cut 1, answer 5).
- `mergeCheck: verify-spot` (owner cut 2).
- `gateEvidence: executor-export` (owner cut 4).
- `planDepth: light`: only for S-only waves (owner cut 5, answer 4). The PLAN "Planner sizing" keeps the full
  critique for M7 waves 0, 1, 2 and 3. Only a split-off 1b takes the light path.

Defaults kept: `resetCadence: per-wu`; `prTool: pr-sdlc` (the draft PR before ship, §6 Q28 (c)); `planner:
l-items`.

Other values:

- **Models**: pinned to `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5` (ARB §2).
- **Commit trailer**: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The executor is Sonnet, and
  ARB §8 asks for the trailer of the model that wrote the commit (ruling commit-wrapper item 1).
- **Deviation REVIEW-3**: the follow-up review covers every dimension the cap dropped whose file triggers match
  a changed file, code-quality and test-quality included (ruling stop-6 item 2, ruling w8-judge Q2).

## Open owner questions

1. **Standing rulings** (owner cut 6) are adopted, but no exact signatures are recorded, so `standingRulings` is
   empty. Until the owner rules exact signatures, every such event goes to the arbiter as before. The three
   classes that need signatures:
   - environment stop (`claude: command not found` after an auto-update);
   - scratch-class scan hits;
   - the timeout re-run (`ship-prepare:` `spawnSync ... ETIMEDOUT` at 30 s, rulings stop-10-cause and stop-12).
2. **Metrics baseline**: PLAN asks that the first M7 wave's cost be compared with the M5.1 per-wave cost.
   `metrics.baseline` is not set, because the fork's `metrics-schema.md` records are not the skill's ledger
   format.
