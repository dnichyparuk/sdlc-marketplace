# Shared Guards Hardening (W15) Implementation Plan

**Commit:** `fix(#9375): guards - copy root, SSRF ranges, write routes, wave wait`
**Goal:** Close four guard gaps found by the post-merge audit of PRs #74-#88, and retire two dead orchestration files:
- the plan copy check (R71(d)) must find missing copies when it runs from a subdirectory;
- the link validator must block more reserved address ranges and free every response body it does not read;
- the worker write guard must deny more shell write routes (dd, git apply, patch, python stdin scripts); cp, mv and install stay allowed because plans copy files with them;
- the blocking wave wait must return within seconds, not up to 90 s, after the last worker reports;
- the heavy orchestration profile files must leave the repository.
**Architecture:** Each guard is a small deterministic script (plan.js, links.js, worker-write-guard.js, state/execute.js). Each fix amends the owning spec rule in place first (plan-sdlc R67, pr-sdlc R15, execute-plan-sdlc R90 and R92; no new ids), then changes the script and adds exec cases. The root problem is the same in every item: each guard trusts one input (the working directory, a literal blocklist, a pattern list, a poll interval) that does not hold in a real run.
**Source:** conversation context (todo #9375, wave 15 brief; audit of PRs #74-#88)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>` (hook cases: `-c promptfooconfig-exec-hooks.yaml`)

---

## Context

**What problem does this change solve?**

- The plan copy check reads the copy rules from the SDLC root, but it looks for files from the working directory. Run from a subdirectory, it finds no files and passes in silence.
- The link validator lets a few reserved address ranges through, and it leaves response bodies open (an open socket per redirect hop or HEAD fallback).
- The worker write guard denies `sed -i`, redirects and similar routes, but not `dd of=`, `git apply`, `patch` or a `python3 - <<EOF` script. (`cp`, `mv` and `install` are not denied either; this plan keeps them allowed, see Key Decisions.)
- The blocking wave wait polls every 60 s and then waits 30 s more. A fast wave can sit idle for about 90 s after its last worker reports.
- Two files under `orchestration/` were read only by the heavy orchestration skill. The owner retired that skill on 2026-11-13 and lean orchestration replaced it.

**What prompted this change now?**

The post-merge Opus audit of PRs #74-#88 (2026-11-13, todo #9375) found items 1-4. The owner added item 5 the same day.

**What does success look like?**

- `merge-lanes --plan` run from a subdirectory of a git repository reports the same missing copies as a run from its root.
- A URL to each new range is reported as `url-blocked-host` and is never fetched.
- Each new shell write route from an execute worker is denied with the existing message style. The same command with a scratch target (`/tmp/`, `/dev/`, `$TMPDIR/`) is still allowed.
- A `--wait` call returns within about 10 s after the last task reports, with a 60 s `--interval`.
- No tracked file names the deleted profile files.

**Who fails if this ships wrong?** Execute workers (a too-wide write rule blocks a legal command), plan-sdlc runs (a wrong root reports false missing copies), pr-sdlc and plan-sdlc link gates (a wrong range blocks a public URL), and every ship run (a wrong wait returns before the worker results arrive).

### Re-verification at HEAD 0334f7f (PRs #89 and #90 merged)

| Item | Still reproduces | Evidence |
|---|---|---|
| 1 copy-check root | yes | `plugins/sdlc-utilities/scripts/skill/plan.js:395` reads `readSection(resolveSdlcRoot(), 'plan')`; `:400` calls `requiredCopies(text, rules, process.cwd())`; `scripts/lib/plan-parse.js:423` expands globs from that `cwd`. Reproduced: a git-initialised copy of `fixtures-fs/plan-copy-rules`, `merge-lanes --plan plans/missing-doc.md` from `docs/` gives `missing: []`, from the root gives 3. |
| 2 SSRF ranges, open bodies | yes | `scripts/lib/links.js:348-354` `v4(a, b)` has no 192.0.0/24, 198.18/15, 224/4, 240/4 or broadcast rule; `:359` has `^fe[89ab]` only (no fec0::/10). `fetchOnce` `:390-417` returns after `:407` (`const loc`) on every path and hops without touching `res.body`; `checkGenericUrl` `:431-434` drops the HEAD response before the GET fallback. Offline run: the five IPv4 URLs come back `skipped: offline`, not `url-blocked-host`. |
| 3 write-guard routes | yes | `hooks/worker-write-guard.js:96-105` rules array has no cp/mv/install/dd/git apply/patch rule; `python-write` (`:102`) needs `-c`. `classifyCommand` returns `{deny:false}` for all seven commands of the brief. |
| 4 wave wait dead time | yes | `scripts/state/execute.js:1311` polls every `--interval`; `:1313` grace defaults to 30 s; `:1327-1334` the tick only checks again after a full interval. `scripts/skill/execute.js:49` sets `waveInterval: 60`; `skills/execute-plan-sdlc/SKILL.md:390` and `wave-runner-template.md:94` pass no `--grace`. |
| 5 profile files | yes | `git ls-files orchestration` lists only `herdr-sdlc-profile.json` and `herdr-sdlc-profile.md`. `git grep herdr-sdlc-profile` finds only a self-reference in the `.md` file. |

No item was dropped.

## Research Findings

**Item 1.** `buildCopyCheck` (`plan.js:392-402`) is the only caller of `requiredCopies`. `plan.js` already imports `resolveActiveWorktreeSafe` (`:39`), which runs `git rev-parse --show-toplevel` (the top folder of the active checkout) and falls back to the given cwd. `resolveSdlcRoot()` (`lib/config.js:168`) resolves the main worktree and falls back to cwd. The existing cases `plan-copy: (a)` to `(e)` (`tests/promptfoo/datasets/plan-prepare-exec.yaml:919-990`) run from the fixture root. The script runner gives each case a fresh non-git temp copy of the fixture, so a subdirectory case needs a small runner script that runs `git init` first (mirror `tests/promptfoo/scripts/run-commit-literal-message.js:93-99`).

**Item 2.** `blockedHostReason` (`links.js:340-374`) is a literal check; DNS answers and redirect targets go through it too (`blockedUrlReason`, `fetchOnce`). Text URL extraction (`URL_REGEX`, `links.js:75`) stops at `]`, so a bracketed IPv6 URL in text such as `http://[fec0::1]/` is reported `url-invalid` before the host check. So fec0::/10 is reachable only through a DNS answer or a redirect target. Its exec case must call `blockedHostReason` directly. `blockedHostReason` is exported (`links.js:652`).

**Item 3.** `classifyCommand` masks quoted text (`maskQuotes`) and checks targets with `isAllowedTarget` (unquote, `path.posix.normalize`, scratch prefix). `teeDenied` (`:76-86`) is the idiom for a command-position rule with per-argument target checks. 24 exec cases exist in `tests/promptfoo/datasets/worker-write-guard-exec.yaml`, run by `promptfooconfig-exec-hooks.yaml`. `plugins/sdlc-utilities/hooks/README.md:7` restates the R90 route list.

**Item 4.** `waitForWaveProgress` (`state/execute.js:1309-1337`). The grace exists so a repeated call does not return at once and spin (`docs/skills/execute-plan-sdlc.md:463`). The wait command appears in `SKILL.md:390`, `wave-runner-template.md:94`, `docs/skills/execute-plan-sdlc.md:463` and the spec R92 (`docs/specs/execute-plan-sdlc.md:205`). `check-handback-sentinels.js:54` checks only the literal `wave-progress --wait`. The liveness cases are in `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml:66-108`. A one-shot case cannot change the marker during the wait, so the timing case needs a runner script that rewrites the marker while the wait runs. Markers live at `<stateDir>/<runId>/progress-wave-<n>.json`; the state dir comes from `SDLC_STATE_DIR_OVERRIDE`.

**Item 5.** Only `assessment/03-plan/consolidated-plan.md:5269` and `:5446` mention the retired skill `orchestrate-herdr-sdlc` (by its home-directory registry path, not the profile files). `.sdlc/orchestration/` and `site/src/content-source/plans/*` are history and stay as they are.

**Copy rules.** `.sdlc/config.json` `plan.copyRules`: a task that lists `docs/specs/<skill>.md` or `skills/<skill>/SKILL.md` must also list `docs/skills/<skill>.md`, `site/src/content-source/skills/<skill>.md`, `site/src/data/skills-meta.ts` and `skills/<skill>/*.md`. A directory entry covers every file below it. Specs, docs and `docs/cost-tiers.md` have byte copies under `site/src/content-source/`.

**Commands.** Exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`; hook cases use `-c promptfooconfig-exec-hooks.yaml`. Main-session validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --root . --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| fec0::/10 exec case | no | checks `blockedHostReason('[fec0::1]')` through a runner script, not through a URL in a text fixture | Text extraction stops at `]`, so `http://[fec0::1]/` is `url-invalid` before the host check (wrong fact in the brief's "one URL per new range") |
| Body cancel test | no | covered by review and the unchanged existing link cases; no new exec case | Every fetch in an offline case is skipped, and a loopback test server is itself a blocked host |
| Item 5 reference update | no | adds one dated parenthetical at each of the two `orchestrate-herdr-sdlc` mentions in `assessment/03-plan/consolidated-plan.md` | No tracked file names the profile files; the brief names that file as the place to record the retirement |
| copy-check root | no | config from `resolveSdlcRoot()`, globs from the active worktree top (`resolveActiveWorktreeSafe`) | The brief allows "sdlc root or the plan's repo root"; the active top level is correct in both branch and worktree mode |
| Check-only copy entries | no | `site/src/data/skills-meta.ts` and companion directories are listed as check-only entries | `plan.copyRules` requires them; wave 14 edits `skills-meta.ts` |
| Files per task | no | Tasks 1, 3 and 5 list up to 6 entries, of which some are check-only | The copy rule needs them in a task that also changes another file |
| cp, mv, install routes | yes (brief: deny) | not denied; R90 states the exclusion and its reason | Plans tell workers to make byte site copies with `cp docs/specs/<f> site/src/content-source/specs/<f>` (project plan notes; Tasks 1, 3, 5 and 8 of this plan). A target rule would block that step in every later wave and in consumer projects. The Step 5c `expectedFiles` cross-check (R44, hard under `--strict-files`, which ship always forwards per I14) still catches a copy outside the task Files |

## Decisions taken without the owner

- **Item 5 note placement.** No file references the profile files. The plan adds a dated note to the two mentions of the retired skill in `assessment/03-plan/consolidated-plan.md`, and changes nothing else in that history file. Alternative: no note at all. The brief asked for the retirement to be recorded.
- **Glob root for the copy check.** Globs expand from the active worktree top level, config still comes from the SDLC root. Alternative: the SDLC root for both. In worktree mode the plan's new files exist only in the active worktree.
- **Grace value.** The SKILL.md and wave-runner wait calls pass `--grace 10`. Alternative: 0 or 5. A grace of 0 lets a repeated call spin, and 10 s still leaves time for the Agent results to arrive after the `reporting` marker.
- **Reporting poll interval.** 5 s once any listed task reports (a new constant `WAIT_REPORTING_POLL_SECONDS`). Alternative: a fixed 5 s interval always. The configured interval still applies while no worker has reported, so idle waves read the marker less often.
- **python heredoc.** A rule, not an exclusion. It reuses the `open(` / `write_text` content test of `python-write`, so it is as reliable as the existing `-c` rule.

## Key Decisions

- **Amend existing ids, add none.** Each change refines an existing rule: R67 (plan-sdlc), R15 (pr-sdlc), R90 and R92 (execute-plan-sdlc). Each gets a new appendix row with #9375. A new id would split one rule into two places.

- **Two roots in the copy check.** The copy rules are project config, so they come from `resolveSdlcRoot()` (the main worktree, as every config read). The `require` globs name files of the plan's checkout, so they expand from `resolveActiveWorktreeSafe()` (the top folder of the active checkout). In branch mode both are the same folder. In worktree mode the globs see the worktree's files. Alternative: pass `resolveSdlcRoot()` to both. It is simpler, but in worktree mode it would look for files in the wrong checkout.

- **Range rules as code, not a table.** The new IPv4 ranges extend the `v4` helper with a third octet. A CIDR table would be cleaner but is a larger change than the four extra lines need (KISS).

- **Write routes: deny with a scratch exception.** `dd` is checked on `of=`. `git apply` is allowed only in a read-only form (`--check`, `--stat`, `--numstat`, `--summary`). `patch` is allowed only with `--dry-run` or a scratch `-o` / `--output` target. Alternative: deny these commands outright. That would block legal scratch writes that workers make during verification.

- **cp, mv and install are not checked.** Plans tell workers to copy files with `cp` (the byte site copies under `site/src/content-source/`, also in Tasks 1, 3, 5 and 8 here), so a target rule would deny a step that plans require, in this and in consumer projects. The file-scope check still covers these commands: execute's Step 5c `expectedFiles` cross-check (R44; hard under `--strict-files`, which ship always forwards, I14) fails a wave that changes a file outside its task Files. R90 states this exclusion. Alternative: deny with a scratch exception plus a site-copy allow list. That is project-specific and still blocks consumer projects that copy files.

- **Shorter poll after the first report.** The wait keeps the configured interval while no task has reported and drops to 5 s once one has. Alternative: lower `waveInterval` itself. That would make every idle wave read the marker 12 times as often.

- **Smallest viable cut.** Items 1-4 each need a spec sentence, a script change and an exec case. Item 5 is two deletions and two parentheticals. The cost-tiers task exists only because the new constants are tuning values, and `docs/cost-tiers.md` is where tuning values are listed.

**Non-goals (not built in this wave):**

- `cp`, `mv`, `install`, `git mv`, `rsync`, `ln`, `truncate`, `touch` and other shell write routes. R90 stays best effort; R90 names `cp`, `mv` and `install` as deliberately not checked.
- Bracketed IPv6 URL extraction in `URL_REGEX`.
- DNS pinning of the checked address.
- The same grace pattern in `review.js` `waitForSummary`.
- Any change to ship.js, the ship-sdlc skill, spec or docs, or `site/src/data/skills-meta.ts` (wave 14).
- github-sdlc, the plan-explore orchestrator investigation (F-70), the lean orchestration skill, and any behavioural or headless run.

## Contract Examples

Code (Task 4):

```markdown
**Contract:**
- shape (code): `blockedHostReason(hostname: string): string|null` keeps its signature; inner `v4(a, b, c)` gains the third octet and returns `'reserved address'` for 192.0.0.0/24 and 198.18.0.0/15, `'multicast or reserved address'` for a >= 224.
- names: `blockedHostReason`, `v4`, `fetchOnce`.
- mirror: existing `v4` rules at `plugins/sdlc-utilities/scripts/lib/links.js:348-354`.
- decisions: literal code rules, not a CIDR table (KISS).
- sync: `docs/specs/pr-sdlc.md` R15 lists the same ranges.
```

Docs (Task 9):

```markdown
**Contract:**
- shape (docs): MODIFY `assessment/03-plan/consolidated-plan.md`; after each of the two `~/.claude/skills/orchestrate-herdr-sdlc/...` paths add the parenthetical `(the heavy orchestration skill was retired on 2026-11-13; lean orchestration replaced it)`.
- names: none.
- mirror: the inline parenthetical style of the same lines.
- decisions: history stays; only a dated note is added.
- sync: none.
```

Spec (Task 1):

```markdown
**Contract:**
- shape (openspec): MODIFY `R67` (a) `--plan` clause in `docs/specs/plan-sdlc.md`; add one sentence on the two roots; add appendix row `| R67 | copy check roots: config from the SDLC root, globs from the active worktree, #9375 |`.
- names: `R67` (modified).
- mirror: appendix rows at `docs/specs/plan-sdlc.md:370-373`.
- decisions: amend in place, no new id.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.
```

## Tasks

### Task 1: plan-sdlc spec R67 — copy-check roots

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/plan-sdlc.md` — R67 `--plan` sentence and one appendix row
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy of the spec (`cp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md`)
- Modify: `docs/skills/plan-sdlc.md` — copy check only (plan.copyRules): no edit expected, the doc does not state the copy-check root
- Modify: `site/src/content-source/skills/plan-sdlc.md` — copy check only (plan.copyRules): no edit expected
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — copy check only (plan.copyRules) for the companion `.md` files: no edit expected, none states the copy-check root

**Notes:** Spec first: Task 2 implements this sentence. The skill doc and companions describe `--plan` only by name, so they need no change; the worker confirms with a grep for `copyRules` and `copy check`.

**Acceptance criteria:**
- [ ] R67 (a) carries the new sentence after "`copyCheck` is null without `--plan` or without `plan.copyRules`."
- [ ] The appendix has the new R67 row; no id is renumbered or added.
- [ ] `cmp docs/specs/plan-sdlc.md site/src/content-source/specs/plan-sdlc.md` exits 0.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY `R67`. Insert after the sentence "`copyCheck` is null without `--plan` or without `plan.copyRules`.":

  ```text
  The copy rules are read from the SDLC root (`resolveSdlcRoot()`, the main worktree) and the `require` globs expand from the top level of the active worktree (`git rev-parse --show-toplevel`, falling back to the working directory), so the check gives the same result from any subdirectory and, in worktree mode, looks at the plan's own checkout.
  ```

  Add the appendix row after `| R67 | merge-lanes --plan copy check, #9368 |`:

  ```text
  | R67 | copy check roots: config from the SDLC root, globs from the active worktree, #9375 |
  ```
- names: `R67`.
- mirror: appendix rows at `docs/specs/plan-sdlc.md:370-373`.
- decisions: amend in place; R71(d) is unchanged because it delegates the script check to R67.
- sync: `site/src/content-source/specs/plan-sdlc.md` byte copy.

### Task 2: plan.js copy check from a subdirectory

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — `buildCopyCheck` passes the active worktree top to `requiredCopies`
- Create: `tests/promptfoo/scripts/run-plan-copy-subdir.js` — git-inits the fixture copy and runs `merge-lanes --plan` from `docs/`
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — new case `plan-copy: (f) a run from a subdirectory still reports each missing copy`
- Modify: `site/src/data/skills-meta.ts` — copy check only (plan.copyRules): no edit in this wave (wave 14 edits it)

**Notes:** A runner script is needed because the script runner copies fixtures to a non-git temp folder, where both roots fall back to the working directory and the bug cannot show. Workspace modes: config still comes from `resolveSdlcRoot()` (main worktree); globs come from the active checkout, which is the same folder in branch mode.

**Acceptance criteria:**
- [ ] From `docs/` of a git-initialised copy of `fixtures-fs/plan-copy-rules`, `merge-lanes --plan plans/missing-doc.md` reports 3 blocking `copy-check` issues.
- [ ] Cases `plan-copy: (a)` to `(e)` still pass.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "plan-copy:"`

**Contract:**
- shape (code): in `buildCopyCheck(planPath)` (`plan.js:392-402`):

  ```diff
     const text = readPlanFile(planPath);
  -  const rules = (readSection(resolveSdlcRoot(), 'plan') || {}).copyRules;
  +  const rules = (readSection(resolveSdlcRoot(), 'plan') || {}).copyRules; // config: main worktree (R67)
     if (rules === undefined || rules === null) return null;
     const valid = ...;
  +  const contentRoot = resolveActiveWorktreeSafe(); // globs: active checkout top, not cwd (R67, #9375)
     return {
       rules: valid,
  -    missing: requiredCopies(text, rules, process.cwd()).filter(...)...,
  +    missing: requiredCopies(text, rules, contentRoot).filter(...)...,
  ```

  Runner `run-plan-copy-subdir.js`: args `--project-root <path>`; in that folder run `git init -q -b main` (spawnSync, `git config user.name/user.email` not needed, no commit); then `spawnSync(process.execPath, [<repo>/plugins/sdlc-utilities/scripts/skill/plan.js, 'merge-lanes', '--dir', <root>/iter, '--lenses', 'all', '--plan', <root>/plans/missing-doc.md], { cwd: <root>/docs })`; print the child's stdout unchanged; exit with the child's status. `<repo>` is `path.resolve(__dirname, '../../..')`.

  Dataset case:

  ```yaml
  - description: "plan-copy: (f) a run from a subdirectory still reports each missing copy"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-plan-copy-subdir.js"
      script_args: "--project-root {{project_root}}"
      project_root: "file://fixtures-fs/plan-copy-rules"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const cc = r.issues.filter(i => i.lane === 'copy-check' && i.blocking === true);
          return cc.length === 3 && r.copyCheck.missing.length === 3
  ```
- names: `buildCopyCheck`, `contentRoot`, `run-plan-copy-subdir.js`, case `plan-copy: (f)`.
- mirror: `resolveActiveWorktreeSafe()` use at `plan.js:475`; runner layout of `tests/promptfoo/scripts/run-plan-state.js:1-40`; git setup of `run-commit-literal-message.js:93-99`; case `plan-copy: (a)` at `plan-prepare-exec.yaml:919`.
- decisions: no change to `lib/plan-parse.js` (`requiredCopies` already takes the root as an argument).
- sync: spec R67 sentence from Task 1.

### Task 3: pr-sdlc spec R15 — new blocked ranges

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — R15 range list, R15 acceptance line, appendix row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy (`cp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md`)
- Modify: `docs/skills/pr-sdlc.md` — copy check only (plan.copyRules): no edit expected, the doc does not list address ranges
- Modify: `site/src/content-source/skills/pr-sdlc.md` — copy check only (plan.copyRules): no edit expected

**Notes:** `pr-sdlc` has no companion `.md` beside its SKILL.md, so the companion glob matches nothing. `docs/specs/version-sdlc.md` names `url-blocked-host` but not the ranges; the worker confirms with a grep for `shared-address-space`.

**Acceptance criteria:**
- [ ] R15's address list names the six new ranges with the exact text below.
- [ ] R15 has the new acceptance line; the appendix has the new R15 row.
- [ ] `cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md` exits 0.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY `R15`.

  ```diff
  - ... or a loopback, unspecified, link-local, private (RFC 1918, unique-local IPv6, 6to4, NAT64, IPv4-compatible or IPv4-mapped IPv6), shared-address-space or cloud-metadata address ...
  + ... or a loopback, unspecified, link-local, private (RFC 1918, unique-local IPv6, site-local IPv6 `fec0::/10`, 6to4, NAT64, IPv4-compatible or IPv4-mapped IPv6), shared-address-space, IETF-reserved (`192.0.0.0/24`), benchmarking (`198.18.0.0/15`), multicast (`224.0.0.0/4`), reserved (`240.0.0.0/4`), broadcast (`255.255.255.255`) or cloud-metadata address ...
  ```

  After the existing generic-URL safety sentence, add: "The validator cancels the body of every response it does not read (each redirect hop, the HEAD response before a GET fallback, and the final response)."

  Add acceptance line under R15:

  ```text
    - Acceptance: exec — `http://198.18.0.1/`, `http://224.0.0.1/`, `http://240.0.0.1/`, `http://255.255.255.255/` and `http://192.0.0.8/` are reported `url-blocked-host` offline, and `blockedHostReason('[fec0::1]')` is non-null.
  ```

  Appendix row: `| R15 | reserved, multicast, broadcast and site-local ranges; response bodies cancelled, #9375 |`
- names: `R15`.
- mirror: R15 acceptance lines at `docs/specs/pr-sdlc.md:109-111`; appendix rows at `:204-219`.
- decisions: amend in place, no new id.
- sync: `site/src/content-source/specs/pr-sdlc.md`; Task 4 implements it.

### Task 4: links.js — reserved ranges and body cancel

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/links.js` — `v4` third octet and new ranges, `fe[c-f]` rule, mapped-address capture, body cancel in `fetchOnce` and before the GET fallback
- Create: `tests/promptfoo/fixtures-fs/links-lib/blocked-hosts-reserved.txt` — one line with the five IPv4 URLs
- Create: `tests/promptfoo/scripts/run-links-blocked-host.js` — prints `blockedHostReason` for a fixed host list as JSON
- Test: `tests/promptfoo/datasets/links-lib-exec.yaml` — two new cases

**Notes:** fec0 needs the runner because text extraction stops at `]`. The body cancel has no offline test (every offline fetch is skipped and a loopback server is a blocked host); review checks it, and the existing link cases guard against regressions.

**Acceptance criteria:**
- [ ] The five IPv4 URLs are reported `url-blocked-host` offline; `url-unreachable` does not appear.
- [ ] `blockedHostReason` is non-null for `[fec0::1]`, `feff::1`, `::ffff:198.18.0.1`, `::ffff:c000:0008` (192.0.0.8) and null for `93.184.216.34`, `192.0.2.1`, `198.20.0.1`.
- [ ] `fetchOnce` cancels `res.body` once per fetched response, and `checkGenericUrl` does not hold the HEAD body before the GET fallback.
- [ ] Existing `links:` cases still pass.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "links:"`

**Contract:**
- shape (code): `blockedHostReason(hostname)` keeps its signature and export.

  ```diff
  -  const v4 = (a, b) => {
  +  const v4 = (a, b, c) => {
       if (a === 0 || a === 127) return 'loopback or unspecified address';
       ...
       if (a === 100 && b >= 64 && b <= 127) return 'shared address space';
  +    if (a === 192 && b === 0 && c === 0) return 'reserved address';
  +    if (a === 198 && (b === 18 || b === 19)) return 'reserved address';
  +    if (a >= 224) return 'multicast or reserved address';
       return null;
     };
  -  if (m4) return v4(parseInt(m4[1], 10), parseInt(m4[2], 10));
  +  if (m4) return v4(parseInt(m4[1], 10), parseInt(m4[2], 10), parseInt(m4[3], 10));
     ...
       if (/^fe[89ab]/.test(h)) return 'link-local address';
  +    if (/^fe[c-f]/.test(h)) return 'site-local address';
     ...
  -    const mapped = h.match(/^::ffff:(?:(\d+)\.(\d+)\.\d+\.\d+|([0-9a-f]{1,4}):[0-9a-f]{1,4})$/);
  +    const mapped = h.match(/^::ffff:(?:(\d+)\.(\d+)\.(\d+)\.\d+|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
       if (mapped) {
  -      const hi = mapped[3] !== undefined ? parseInt(mapped[3], 16) : null;
  -      return mapped[1] !== undefined ? v4(...) : v4(hi >> 8, hi & 255);
  +      if (mapped[1] !== undefined) return v4(parseInt(mapped[1], 10), parseInt(mapped[2], 10), parseInt(mapped[3], 10));
  +      const hi = parseInt(mapped[4], 16);
  +      const lo = parseInt(mapped[5], 16);
  +      return v4(hi >> 8, hi & 255, lo >> 8);
       }
  ```

  In `fetchOnce`, directly after `const loc = ...` (`links.js:407`), add one line that covers every return and hop below it:

  ```js
  if (res.body) res.body.cancel().catch(() => {}); // body never read: free the socket (R15)
  ```

  `fetchOnce` returns `{status}` / `{blocked}` / `{tooManyRedirects}` only, so no caller reads a body.

  Runner `run-links-blocked-host.js`: `require` `plugins/sdlc-utilities/scripts/lib/links.js` from `path.resolve(__dirname, '../../..')`; for the host list `['[fec0::1]','feff::1','::ffff:198.18.0.1','::ffff:c000:0008','93.184.216.34','192.0.2.1','198.20.0.1']` print `JSON.stringify(Object.fromEntries(list.map(h => [h, blockedHostReason(h)])))`.

  Fixture line: `Reserved: http://198.18.0.1/ http://224.0.0.1/ http://240.0.0.1/ http://255.255.255.255/ http://192.0.0.8/`

  Cases (mirror `links-lib-exec.yaml:223`):

  ```yaml
  - description: "links: reserved, benchmarking, multicast and broadcast URLs are reported as url-blocked-host"
    vars:
      script_path: "repo://plugins/sdlc-utilities/scripts/lib/links.js"
      script_args: "--file {{project_root}}/blocked-hosts-reserved.txt --json --ctx {{ctx}}"
      project_root: "file://fixtures-fs/links-lib"
      ctx: '{"offline":true}'
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          const urls = ['http://198.18.0.1/','http://224.0.0.1/','http://240.0.0.1/','http://255.255.255.255/','http://192.0.0.8/'];
          return r.ok === false && urls.every(u => r.violations.some(v => v.url === u && v.reason === 'url-blocked-host'))
  - description: "links: blockedHostReason blocks site-local IPv6 and mapped reserved addresses"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-links-blocked-host.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          return ['[fec0::1]','feff::1','::ffff:198.18.0.1','::ffff:c000:0008'].every(h => typeof r[h] === 'string')
            && ['93.184.216.34','192.0.2.1','198.20.0.1'].every(h => r[h] === null)
  ```
- names: `v4`, `blockedHostReason`, `fetchOnce`, reasons `'reserved address'`, `'multicast or reserved address'`, `'site-local address'`.
- mirror: `links.js:340-367`; case at `links-lib-exec.yaml:223`.
- decisions: one cancel after `loc` instead of one per return (covers every path, including the HEAD response before the GET fallback); `.catch` because a cancel can reject on a closed stream.
- sync: spec R15 (Task 3).

### Task 5: execute-plan-sdlc spec R90 and R92

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `docs/specs/execute-plan-sdlc.md` — R90 route list, R92 poll and grace sentences, two appendix rows
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy (`cp`)
- Modify: `docs/skills/execute-plan-sdlc.md` — `:463` wait-mode line: add the reporting poll and the `--grace 10` the skill passes
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — byte copy of the skill doc (`cp`)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc` — copy check only (plan.copyRules) for the companion `.md` files other than `wave-runner-template.md` (Task 7): no edit expected; `state-format.md:240` describes markers, not the wait

**Notes:** Spec first for Tasks 6 and 7. The docs line is changed here so Task 7 stays within five files.

**Acceptance criteria:**
- [ ] R90 lists the new routes with the exact text below, states that `cp`, `mv` and `install` are not checked and why (R44); the "best-effort" sentence stays.
- [ ] R92 states the 5 s reporting poll and that the dispatching context passes `--grace 10`.
- [ ] Two appendix rows (R90, R92) with #9375.
- [ ] `docs/skills/execute-plan-sdlc.md:463` names the reporting poll and the passed grace.
- [ ] Both `cmp` checks against the site copies exit 0; `validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): MODIFY `R90`: after "`node -e`/`--eval` with `writeFileSync` or `appendFileSync`" insert:

  ```text
  , a `python -` or `python <<` stdin script with `open(` or `write_text`, `dd` with an `of=` target that is not a scratch path, `git apply` without `--check`, `--stat`, `--numstat` or `--summary`, and `patch` unless it has `--dry-run` or a `-o`/`--output` target that is a scratch path
  ```

  and change "A redirect or `tee` target is unquoted and normalized" to "A redirect, `tee`, `dd of=` or `patch -o` target is unquoted and normalized". Before "The hook is a best-effort guard" insert:

  ```text
  `cp`, `mv` and `install` are not checked: plans copy files with them (for example byte copies of docs), and the Step 5c `expectedFiles` cross-check (R44, hard under `--strict-files`) still fails a wave that changes a file outside its task files.
  ```

  MODIFY `R92`: after "reads the wave's progress marker every `--interval` seconds (default 5)" insert "; once at least one listed task has phase `reporting`, it reads the marker every 5 seconds at most (the reporting poll)". After "passing `--interval <waveInterval>`" insert "and `--grace 10`".

  Appendix rows:

  ```text
  | R90 | dd, git apply, patch and python stdin routes; cp, mv, install not checked, #9375 |
  | R92 | reporting poll and passed grace, #9375 |
  ```

  Docs line 463 (docs shape; the line starts "- **Wait mode** (used by the enforcing layer to block until a wave's workers have reported, R92):"): replace "(then keeps blocking `--grace` more seconds, default and maximum 30, so a repeat call never returns at once)" with "(then keeps blocking `--grace` more seconds, default and maximum 30, so a repeat call never returns at once; the skill passes `--grace 10`)", and after "`--interval` is the poll interval (the resolved `waveInterval`)" add "; once any listed task reports, the marker is read every 5 seconds at most".
- names: `R90`, `R92`.
- mirror: appendix rows at `docs/specs/execute-plan-sdlc.md:435-437`.
- decisions: amend in place; the values (5 s, 10 s) are tuning, listed in `docs/cost-tiers.md` by Task 8; the spec names them because R92 already states its defaults.
- sync: site copies; Tasks 6, 7, 8.

### Task 6: worker-write-guard — new shell write routes

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/hooks/worker-write-guard.js` — three new rules (`dd-write`, `git-apply`, `patch`), wider `python-write`, header comment
- Modify: `plugins/sdlc-utilities/hooks/README.md` — `:7` route list
- Test: `tests/promptfoo/datasets/worker-write-guard-exec.yaml` — cases `(l1)` to `(l15)`

**Notes:** Quote masking stays the rule for detection (ledger F-51): command words and options are matched on the masked text, and targets are sliced from the original command and unquoted by `isAllowedTarget`. Rules are matched in command position (`^` or after `|`, `;`, `&`, `(` or a newline), so `npm install`, `grep patch f` and `git log --stat` are not denied. No rule matches `cp`, `mv` or `install` (R90 exclusion, Key Decisions).

**Acceptance criteria:**
- [ ] Each deny case below returns `permissionDecision: "deny"` with `Blocked rule: <name>.`
- [ ] Each allow case below gives exit 0 and empty stdout.
- [ ] Cases `(a)` to `(k6)` still pass.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec-hooks.yaml -j 1 --no-cache --filter-pattern "worker-write-guard:"`

**Contract:**
- shape (code): `classifyCommand(cmd) -> { deny, rule }` keeps its signature. New helpers, each `(cmd, masked) -> boolean`, in the style of `teeDenied`:

  | Rule name | Command-position match on masked text | Denied when |
  |---|---|---|
  | `dd-write` | `(^\|[\|;&(\n])[ \t]*dd\b([^\|;&\n]*)` | an `of=<path>` argument whose path is not allowed |
  | `git-apply` | `(^\|[\|;&(\n])[ \t]*git\b[^\|;&\n]*\sapply\b([^\|;&\n]*)` | none of `--check`, `--stat`, `--numstat`, `--summary` in the args |
  | `patch` | `(^\|[\|;&(\n])[ \t]*patch\b([^\|;&\n]*)` | no `--dry-run`, and no `-o X` / `-oX` / `--output=X` with an allowed X |
  | `python-write` (widened) | `\bpython[0-9.]*\b[^\|;&\n]*(\s-c\b\|\s-(?=\s\|$)\|<<)` | command contains `open(` or `write_text` (unchanged content test) |

  Rule order in the array: existing seven (with `python-write` widened in place), then `dd-write`, `git-apply`, `patch`. Deny message unchanged (`Blocked rule: ${verdict.rule}.`).

  Exec cases (agent `sdlc:execute-worker`; mirror `(a)` at `:3` for deny and `(d)` at `:39` for allow):

  | Case | Command | Expected |
  |---|---|---|
  | (l1) | `cp docs/x site/x` | allowed (cp not checked) |
  | (l2) | `mv a b` | allowed (mv not checked) |
  | (l3) | `install -m 644 /tmp/x src/a` | allowed (install not checked) |
  | (l4) | `cp -t site docs/x` | allowed (cp not checked) |
  | (l5) | `dd if=/tmp/x of=src/a` | deny `dd-write` |
  | (l6) | `git apply /tmp/p.diff` | deny `git-apply` |
  | (l7) | `patch -p1 < /tmp/p.diff` | deny `patch` |
  | (l8) | `python3 - <<EOF\nopen('a','w').write('x')\nEOF` | deny `python-write` |
  | (l9) | `cp src/a /tmp/x` | allowed |
  | (l10) | `mv /tmp/a "$TMPDIR/b"` | allowed |
  | (l11) | `dd if=src/a of=/dev/null` | allowed |
  | (l12) | `git apply --check /tmp/p.diff` | allowed |
  | (l13) | `patch --dry-run -p1 < /tmp/p.diff` | allowed |
  | (l14) | `npm install && git log --stat` | allowed |
  | (l15) | `git commit -m "apply fix"` | allowed (quoted text is masked) |

  README `:7` (the paragraph that starts "`worker-write-guard.js` is a `PreToolUse` hook on `Bash`"): after "and `python -c` / `node -e` file writes" add ", `python -` stdin scripts, and `dd of=` into a non-scratch path, `git apply` (except `--check`, `--stat`, `--numstat`, `--summary`) and `patch` (except `--dry-run` or a scratch `-o`); `cp`, `mv` and `install` are not checked (R90)".
- names: `ddDenied`, `gitApplyDenied`, `patchDenied`; rules `dd-write`, `git-apply`, `patch`, `python-write`.
- mirror: `teeDenied` at `worker-write-guard.js:76-86`; cases `(a)` and `(d)` in `worker-write-guard-exec.yaml`.
- decisions: deny with a scratch exception, not an outright deny; `cp`, `mv` and `install` not checked (Key Decisions).
- sync: spec R90 text (Task 5), `hooks/README.md`.

### Task 7: wave-progress --wait reporting poll and passed grace

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/state/execute.js` — `WAIT_REPORTING_POLL_SECONDS` and the poll in `waitForWaveProgress`
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — `:390` wait command passes `--grace 10`
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/wave-runner-template.md` — `:94` wait command passes `--grace 10`
- Create: `tests/promptfoo/scripts/run-wave-progress-wait-timing.js` — runs a wait, flips the second task to `reporting` after 1 s, prints the elapsed time
- Test: `tests/promptfoo/datasets/execute-plan-sdlc-liveness-exec.yaml` — new case `execute-plan-sdlc/liveness/wave-progress: --wait returns within the reporting poll after the last task reports`

**Notes:** The runner is needed because one case runs one process and cannot change the marker mid-wait. The state dir comes from `SDLC_STATE_DIR_OVERRIDE` (a mkdtemp folder), so both workspace modes are untouched by the test. The handback sentinel (`wave-progress --wait`) stays in both prose files.

**Acceptance criteria:**
- [ ] With `--interval 60 --grace 0`, the wait returns `timedOut: false` with both tasks reported in under 15 s.
- [ ] Both prose wait commands contain `--grace 10`.
- [ ] Existing liveness cases still pass, and the handback sentinel case still passes.
- [ ] Targeted run passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "execute-plan-sdlc/(liveness/wave-progress|handback)"`

**Contract:**
- shape (code):

  ```diff
   const WAIT_MAX_GRACE_SECONDS = 30;
  +// Once any listed task reports, poll at most this often so a wave does not idle a full --interval (R92).
  +const WAIT_REPORTING_POLL_SECONDS = 5;
   ...
     const tick = () => {
  -    if (snapshot().inFlight.length === 0) {
  +    const { reported, inFlight } = snapshot();
  +    if (inFlight.length === 0) {
         setTimeout(() => finish(false), graceMs);
         return;
       }
       if (Date.now() - startedAt >= timeoutMs) { finish(true); return; }
       const remaining = timeoutMs - (Date.now() - startedAt);
  -    setTimeout(tick, Math.min(intervalMs, remaining));
  +    const pollMs = reported.length > 0 ? Math.min(intervalMs, WAIT_REPORTING_POLL_SECONDS * 1000) : intervalMs;
  +    setTimeout(tick, Math.min(pollMs, remaining));
     };
  ```

  SKILL.md step 2 of the wait procedure (`:390`, the line that starts "2. Wait with one foreground Bash call"); only the command span changes:

  ```diff
  - `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-progress --wave <N> --run-id <runId> --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --timeout <min(540, remaining budget in seconds)>`
  + `node "<PLUGIN_ROOT>/scripts/state/execute.js" wave-progress --wave <N> --run-id <runId> --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --grace 10 --timeout <min(540, remaining budget in seconds)>`
  ```

  wave-runner-template.md §2b (`:94`), the whole line:

  ```diff
  -   `node {STATE_SCRIPT} wave-progress --wave {WAVE} --run-id {RUN_ID} --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --timeout <min(540, remaining budget in seconds)>`.
  +   `node {STATE_SCRIPT} wave-progress --wave {WAVE} --run-id {RUN_ID} --wait --tasks <plan task ids of the wave, comma-separated> --interval <waveInterval> --grace 10 --timeout <min(540, remaining budget in seconds)>`.
  ```

  No other prose change in either file.

  Runner `run-wave-progress-wait-timing.js`: `fs.mkdtempSync` state dir; write `<dir>/20250101T000000/progress-wave-1.json` = `{"tasks":{"T1":{"phase":"reporting","updatedAt":"2025-01-01T00:00:00Z"},"T2":{"phase":"editing","updatedAt":"2025-01-01T00:00:00Z"}}}`; `child_process.spawn(process.execPath, [<repo>/plugins/sdlc-utilities/scripts/state/execute.js, 'wave-progress', '--wave', '1', '--run-id', '20250101T000000', '--wait', '--tasks', 'T1,T2', '--interval', '60', '--grace', '0', '--timeout', '120'], { env: { ...process.env, SDLC_STATE_DIR_OVERRIDE: dir } })`; after 1000 ms write the marker with T2 `reporting` (write a temp file, then `fs.renameSync`); on exit print `JSON.stringify({ elapsedMs, result: JSON.parse(stdout) })` and remove the dir.

  Case:

  ```yaml
  - description: "execute-plan-sdlc/liveness/wave-progress: --wait returns within the reporting poll after the last task reports"
    vars:
      script_path: "repo://tests/promptfoo/scripts/run-wave-progress-wait-timing.js"
    assert:
      - type: javascript
        value: |
          const r = JSON.parse(output);
          return r.result.timedOut === false && r.result.inFlight.length === 0 && r.elapsedMs < 15000
  ```
- names: `WAIT_REPORTING_POLL_SECONDS`, `waitForWaveProgress`, `run-wave-progress-wait-timing.js`.
- mirror: `execute.js:1294-1337`; case at `execute-plan-sdlc-liveness-exec.yaml:66`.
- decisions: keep the configured interval until the first report (Key Decisions); grace 10 (Decisions taken without the owner).
- sync: spec R92 and `docs/skills/execute-plan-sdlc.md:463` (Task 5); `docs/cost-tiers.md` (Task 8).

### Task 8: cost-tiers — wave wait tuning values

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/cost-tiers.md` — new `### execute-plan-sdlc wave wait tuning` table after `### github-sdlc tuning`
- Modify: `site/src/content-source/cost-tiers.md` — byte copy (`cp`)

**Notes:** The values are tuning (§6), so they live here; Task 7 adds the constant this table names.

**Acceptance criteria:**
- [ ] The table below sits between the github-sdlc table and `## 6.`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js` exits 0; `cmp docs/cost-tiers.md site/src/content-source/cost-tiers.md` exits 0.

**Contract:**
- shape (docs):

  ```markdown
  ### execute-plan-sdlc wave wait tuning

  | Knob | Default | Defined in |
  |---|---|---|
  | `execute.waveInterval` | 60 s (`--wave-interval`, minimum 10) | `plugins/sdlc-utilities/scripts/skill/execute.js` |
  | `WAIT_REPORTING_POLL_SECONDS` | 5 s once any task reports | `plugins/sdlc-utilities/scripts/state/execute.js` |
  | `WAIT_MAX_GRACE_SECONDS` | 30 s (cap and default of `--grace`) | `scripts/state/execute.js` |
  | `--grace` passed by the skill | 10 s | `skills/execute-plan-sdlc/SKILL.md`, `wave-runner-template.md` |
  | `WAIT_MAX_TIMEOUT_SECONDS` | 540 s | `scripts/state/execute.js` |
  ```
- names: heading `### execute-plan-sdlc wave wait tuning`.
- mirror: `### github-sdlc tuning` at `docs/cost-tiers.md:129-138`.
- decisions: a table under §5, like the github-sdlc one.
- sync: values must match Task 7.

### Task 9: retire the heavy orchestration profile files

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `orchestration/herdr-sdlc-profile.json` — delete
- Modify: `orchestration/herdr-sdlc-profile.md` — delete
- Modify: `assessment/03-plan/consolidated-plan.md` — dated note at `:5269` and `:5446`
- Create: `docs/plans/2026-11-13-lean-w15-shared-guards.md`

**Notes:** Delete with `git rm`. `.sdlc/orchestration/` and `site/src/content-source/plans/` are history and must not change.

**Acceptance criteria:**
- [ ] `git ls-files orchestration` prints nothing.
- [ ] `git grep -n "herdr-sdlc-profile" -- . ':!docs/plans'` prints nothing.
- [ ] Both `orchestrate-herdr-sdlc` mentions in `consolidated-plan.md` carry the note; no other line of that file changes.

**Contract:**
- shape (docs): MODIFY `assessment/03-plan/consolidated-plan.md`: directly after each `` `~/.claude/skills/orchestrate-herdr-sdlc/reference/workarounds/sdlc.json` `` (lines 5269 and 5446) insert ` (the heavy orchestration skill was retired on 2026-11-13; lean orchestration replaced it)`. DELETE the two profile files.
- names: none.
- mirror: inline parentheticals on the same lines.
- decisions: history kept; only a dated note.
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks 2, 4, 6 and 7 each add or extend promptfoo exec cases; the existing cases are rerun, and the spec, docs and cleanup tasks change no source. |
| no-ci-bypass | error | PASS | No step skips or disables CI. |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on exec-only configs; no full-suite or retry loops. |
| skill-docs-required | error | PASS | No new SKILL.md is created. |
| no-scope-creep | warning | PASS | Every task maps to one of the five stated items. |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable; check-only copy entries are justified in the deviations table. |
| scripts-over-llm-logic | error | PASS | All fixes are deterministic script changes; SKILL.md edits only add a flag value. |
| yagni | warning | PASS | Non-goals exclude speculative extras. |
| cross-skill-consistency | error | PASS | The plan covers the plan-sdlc, pr-sdlc and execute-plan-sdlc specs, docs and site copies together. |
| pr-link-github-issue | error | PASS | The commit title references #9375. |
| dry | warning | PASS | The existing teeDenied idiom and requiredCopies are reused; a single cancel line covers every fetch path. |
| kiss | warning | PASS | Code rules are kept literal rather than a CIDR table, with the reason stated. |
| spec-first | error | PASS | Tasks 1, 3 and 5 update the specs and are ordered before the implementation tasks 2, 4, 6 and 7. |
| project-agnostic | error | PASS | Fixes live in plugin scripts and hooks; the repo-local deletions in Task 9 are orchestration cleanup only. |
| flag-coherence-cross-skill | error | PASS | No cross-skill flag gating is added; --grace is passed explicitly. |
| no-opposite-logical-vectors | error | PASS | The two wait call sites (SKILL.md and wave-runner-template.md) use identical phrasing. |
| flag-resolution-single-source | warning | PASS | The grace default and cap stay in state/execute.js. |
| state-premise | error | PASS | The Architecture section names the root problem: each guard trusts one input that does not hold in a real run. |
| smallest-viable-cut | warning | PASS | Key Decisions has a smallest-viable-cut entry and justifies the cost-tiers task. |
| failure-audience | warning | PASS | The 'Who fails if this ships wrong?' section names the audiences. |
| explicit-non-goals | warning | PASS | A non-goals list is present. |
| ambiguity-stops-and-asks | error | PASS | Choices are recorded with alternatives in Key Decisions and Decisions taken without the owner. |
| state-machine-idempotency | error | PASS | No migration, initialization or preflight logic is modified. |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters are changed. |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag is added to a prepare script. |
| workspace-mode-compatibility | error | PASS | The plan states branch and worktree behaviour for the copy check; the wait test uses SDLC_STATE_DIR_OVERRIDE; config reads go through resolveSdlcRoot(). |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts. |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 7 changes `plugins/sdlc-utilities/scripts/state/execute.js` wait timing and makes `SKILL.md:390` pass `--grace 10`, a CLI flag contract change.

**Severity hint:** high

**Patch:** cover the wave-progress --wait contract: the 5 s reporting poll and the --grace 10 argument passed by SKILL.md and wave-runner-template.md

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — cover the wave-progress --wait contract: the 5 s reporting poll and the --grace 10 argument passed by SKILL.md and wave-runner-template.md

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B1)

**Why:** Task 6 widens the deny contract of the `worker-write-guard.js` hook with three new rules (`dd-write`, `git-apply`, `patch`) and a widened `python-write`; `cp`, `mv` and `install` stay unchecked.

**Severity hint:** high

**Patch:** add checklist coverage for the worker-write-guard hook deny contract: new dd/git apply/patch/python stdin routes, their scratch-path exceptions, and the deliberate cp/mv/install exclusion

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — add checklist coverage for the worker-write-guard hook deny contract: new dd/git apply/patch/python stdin routes, their scratch-path exceptions, and the deliberate cp/mv/install exclusion

### UPDATE: security-review (U5, U1)

**Why:** Task 6 changes `plugins/sdlc-utilities/hooks/worker-write-guard.js` and `hooks/README.md`, and Tasks 1 and 5 touch `plugins/sdlc-utilities/skills/plan-sdlc` and `skills/execute-plan-sdlc`, which the current security-review triggers do not cover.

**Severity hint:** medium

**Patch:** widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/skills/plan-sdlc`

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — widen trigger `plugins/**/scripts/**/*.js` to cover `plugins/sdlc-utilities/skills/plan-sdlc`

_3 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 2 | 1 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 Re-verify each audit item at HEAD with file:line evidence; drop and explain any that no longer reproduce. | Context: Re-verification table | covered |
| 2 LOW-2: plan.js copy check root fix plus exec case from fixture subdirectory | Task 1, Task 2 | covered |
| 3 LOW-3: links.js new blocked ranges (R15 spec first), body cancel, exec cases per range | Task 3, Task 4 | covered |
| 4 LOW-4: worker-write-guard deny git apply/patch/dd/python heredoc, exec cases deny and scratch-allowed; cp/mv/install excluded by main-session finding (Deviations) | Task 5, Task 6 | covered |
| 5 LOW-5: wave-progress --wait shorter poll once reporting, explicit --grace in SKILL.md, tuning constants, liveness exec case | Task 5, Task 7, Task 8 | covered |
| 6 Delete orchestration/herdr-sdlc-profile.json and .md and update references; do not touch .sdlc/orchestration/ | Task 9 | covered |
| 7 Do not edit ship.js, ship-sdlc files or skills-meta.ts (check-only) | Task 2, Task 1, Task 3 | covered |
| 8 Spec-first, byte site copies with cp, targeted exec runs only, plan file Create under last task, commit subject <= 72 chars | Task 1, Task 3, Task 5, Task 9 | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

When all nine tasks are done:

- `plan.js merge-lanes --plan` gives the same copy-check result from the repository root and from any subdirectory. Config comes from the SDLC root, file globs from the active checkout.

- The link validator blocks 192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4, 255.255.255.255 and fec0::/10, also as IPv4-mapped IPv6 addresses. It cancels every response body it does not read.

- The worker write guard denies `dd of=` into non-scratch paths, `git apply` outside its read-only forms, `patch` without `--dry-run` or a scratch output, and python stdin scripts that open files. Scratch-target forms stay allowed. `cp`, `mv` and `install` are not checked, so the site-copy step of every plan still runs; R44 catches stray copies.

- A blocking wave wait reads the marker every 5 s once a worker reports, and the skill passes `--grace 10`. A fast wave now waits about 15 s, not 90 s, after its last worker reports.

- Specs R67, R15, R90 and R92 state the new behaviour, with #9375 rows in their appendices. `docs/cost-tiers.md` lists the new tuning values. All site copies match byte for byte.

- `orchestration/` no longer exists. The assessment plan notes that the heavy skill was retired on 2026-11-13 and lean orchestration replaced it.

## OpenSpec Appendix

Not applicable — no OpenSpec change
