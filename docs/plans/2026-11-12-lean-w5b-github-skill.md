# github-sdlc Part 1 (Read Path, Cache, Stub, Shared Libs) Implementation Plan

**Commit:** `feat(#9345): github-sdlc - read path, cache, gh stub, shared libs`
**Goal:**
- Land the accepted github-sdlc spec in the repository (docs and site copy).
- Build the read half of the new prepare script `skill/github.js`: repository resolution, auth and acting account, cache check/refresh/load/clear, view, search and link checks.
- Extend the shared libraries the spec names (`lib/git.js`, `lib/links.js`, `lib/mcp-failure.js`, `lib/config.js`) and the config schema, without changing what their current callers see.
- Build the stub `gh` and the exec harness that every github-sdlc test uses, so no test calls GitHub.
**Architecture:** One Node prepare script (`plugins/sdlc-utilities/scripts/skill/github.js`) owns every `gh` call; it runs `gh` only through a new argv helper in `lib/git.js` (`execFile`, `--flag=value` argv, per-process `GH_TOKEN`). Repository metadata lives in a per-repository cache file under `~/.sdlc-cache/github/`. Issue-template parsing is a new pure module (`lib/github-templates.js`) that part 2 reuses. Tests run the script through a case runner against a data-driven stub `gh`. Part 2 (`docs/plans/2026-11-12-lean-w5b2-github-skill-write.md`, #9367) adds the write pipeline, SKILL.md, templates and docs, and depends on this plan merging.
**Source:** docs/specs/github-sdlc.md (accepted text: the scratchpad copy named in Task 1)
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

The plugin can manage Jira issues (`jira-sdlc`) but not GitHub issues. Issue #9345 asks for the same for GitHub. The owner accepted a spec for a new skill, `github-sdlc`, on 2026-11-11/12. The spec is large: one prepare script with ten subcommands, four shared-library changes, a stub `gh`, a test dataset, the skill files and the docs.

The root problem this part solves: nothing in the repository can run `gh` safely for an issue skill today. The account helpers switch the user's global `gh` account and build shell strings. The link checker refuses links to other repositories. The failure helper only knows Jira. And there is no way to test a `gh`-driven script without calling GitHub.

**What prompted this change now?**

The spec was accepted, so the spec-first rule now allows the implementation. The spec author estimated 12–14 tasks with two Complex ones. Planning found 23 tasks (7 Complex), so the wave is split. This plan (5b-1) is the read path and the foundations. Part 2 (5b-2, #9367) is the write path, the skill and the docs.

**What does success look like?**

- `node plugins/sdlc-utilities/scripts/skill/github.js --check --repo acme/widgets` reports the repository, auth, acting account, cache and config, against the stub `gh`.
- `--refresh`, `--load`, `--clear`, `--view`, `--search` and `--validate-links` work against the stub, with the spec's acceptance cases as exec tests.
- The existing pr-sdlc, jira-sdlc and link-check exec cases still pass unchanged.
- No test calls GitHub (C17).

**Who fails if this ships wrong (blast radius):**

- pr-sdlc, ship-sdlc, review-sdlc and plan-sdlc call `probeGhAuth` and `validateLinks`. A wrong change there breaks every PR flow in every consumer project.
- jira-sdlc calls `mcp-failure.js`. A wrong change there breaks its failure reports.
- The github-sdlc script itself has no users until part 2 ships SKILL.md.

**Non-goals (intentionally not built here):**

- `--check-payload`, `--apply`, `--init-templates`, the shipped templates, SKILL.md and its companions, the docs, README, `skills-meta.ts`, `cost-tiers.md` and `headless-case.js`: part 2.
- setup-sdlc support for the `github` config section: deferred by the spec (I10).
- No change to `ensureGhAccount`, `recoverGhAccountForRepo` or error-report-sdlc.
- No behavioural or headless test runs, and no live GitHub call.

## Research Findings

Exploration used the explore orchestrator (brief `/tmp/sdlc-explore-main-oaANAa/discovery-brief.md`, findings `F-<dim>-<n>` cited below) plus inline reads at HEAD f7e1ecb. P = `plugins/sdlc-utilities`.

- **Account helpers (F-gh-account-links-mcpfailure-lib-reuse-1, -3, -5 to -12).** `P/scripts/lib/git.js` imports only `execSync` and `spawnSync` (:18). `exec(cmd)` (:40) runs shell strings and applies `GH_TIMEOUT_MS` (30 s, :27) to `gh` commands. `getGhAccounts(host)` (:427) runs `gh auth status --json hosts` with no `--hostname`. `ensureGhAccount` (:461) and `recoverGhAccountForRepo` (:802) run `gh auth switch`, which R30 forbids. `selectAccountForOwner` (:745) is pure and reusable. `isGhCreatePrPermissionError` (:764) only matches pull-request text. `probeGhAuth` (:669) passes `--hostname` to `gh auth status` but not to `gh api user`, and returns no token scopes. Callers: `pr.js`, `ship.js`, `received-review.js`, `review.js`, `plan.js`, `jira.js`, `pr-recover-gh-account.js`. Tests: `tests/promptfoo/scripts/git-lib-test.js` (`--op` switch, :66-285) with `datasets/git-lib-exec.yaml`.
- **Link checker (F-…-13 to -17).** `P/scripts/lib/links.js` `classifyUrl` (:99) treats only `github.com` as GitHub. `validateLinks` (:315) fills `expectedRepo` from origin (:318-323), so every cross-repository link is a `github-context-mismatch` (:164-170). `resolvedCtx` (:330-335) drops unknown ctx keys. There is no `owner/repo#n` or `#n` parsing. `ghViewExists` (:135) already uses `execFileSync`.
- **Failure helper (F-…-18 to -22).** `P/scripts/lib/mcp-failure.js` has a closed Jira class set (:46), Jira labels and title (:169, :320, :378, :480-481), no GitHub token redactors (:63-80) and exports no `redact`. Its CLI (:404-503) has no `--source`. Duplicate detection runs `gh issue list` with `spawnSync` argv (:316-323).
- **Config (F-jira-sdlc-sibling-pattern-4).** `P/scripts/lib/config.js` `PROJECT_SECTIONS` (:315) lacks `github`, so `readSection(root, 'github')` returns `null`. The schema is `schemas/sdlc-config.schema.json` at the repository root (not under `P/`), with `jiraSection` (:51) as the model and a root `additionalProperties: false` (:370).
- **Sibling script (F-jira-sdlc-sibling-pattern-1 to -3).** `P/scripts/skill/jira.js` shows the shape: `parseArgs` with `errors[]` (:197), config-version gate (:1159-1166), subcommand switch, `require.main` crash guard → exit 2. Its `--output-file` is ignored and `writeOutput` (`P/scripts/lib/output.js:47`) always prints a path; the spec's A11 wants a given path written and nothing on stdout (contradiction settled in Key Decisions).
- **Exec harness (F-exec-test-harness-gh-stub-1 to -11).** `tests/promptfoo/providers/script-runner.js` supports `script_stub_bin`, `script_home` and `script_env` (:99-127). Relative `script_stub_bin` and `script_home` resolve against `script_cwd`, or against promptfoo's working directory (`tests/promptfoo`) when no `script_cwd` is set. Exec output is stdout only, so call-log assertions need a runner script (precedent: `tests/promptfoo/scripts/run-headless-case-stub.js`). The stub precedent is `tests/promptfoo/fixtures-fs/stub-bin-claude/bin/claude` (env-driven, call log); stub files must be committed with mode 100755 (as `stub-bin-gh/bin/gh` is).
- **Validators (F-new-skill-validator-registration-1 to -6).** `check-consistency.js` discovers skills only by `SKILL.md` and skips a prepare script with no skill, so `github.js` alone passes. `validate-discovery` (PD11) fails a `skills/<name>/` directory with no `SKILL.md`, so the shipped templates move to part 2 with SKILL.md. `validate-spec-shape --strict` already passes with the spec present.
- **YAML.** `P/scripts/lib/yaml.js` handles only flat front matter and says a richer parser belongs in a separate module (:7-12). Issue forms need a narrow nested parser.
- **Build and test commands.** Exec config `tests/promptfoo/promptfooconfig-exec.yaml` (one line per dataset); targeted runs with `-j 1`. Validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.
- **Re-verification at HEAD.** `docs/specs/github-sdlc.md` exists only as an untracked working-tree file, byte-identical to the accepted scratchpad copy; it is not in git, so Task 1 still creates it. `site/src/content-source/specs/github-sdlc.md` does not exist. No `github.js`, `stub-bin-gh-issues` or `github-sdlc-exec.yaml` exists. Every scope item reproduces; none is dropped.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Wave split | no | two plans: this one (10 tasks) and part 2 (#9367, 13 tasks) | 23 tasks and 7 Complex exceed the brief's 14-task cap |
| Templates and `--init-templates` | no | moved to part 2 | a `skills/github-sdlc/` directory without SKILL.md fails PD11 (`validate-discovery`) |
| R11 step 3 (shipped defaults) | no | the refresh reads the shipped directory and returns no templates while it is absent; the step-3 acceptance case lands in part 2 with the templates | same PD11 reason |
| `lib/config.js` change | no | adds `github` to `PROJECT_SECTIONS` | without it `readSection(root, 'github')` is `null` (F-jira-sdlc-sibling-pattern-4); the spec's I10 list omits it |
| `--output-file` with no value | no | also accepted: then it writes the sibling manifest file and prints its path, like every other prepare script | `flag-semantic-consistency-cross-skill` guardrail; the spec's `--output-file <path>` form is kept exactly |
| `gh` timeout override | no | `execGh` reads `SDLC_GH_TIMEOUT_MS` (test-only override, default `GH_TIMEOUT_MS`) | the E9 timeout case would otherwise need 60 s, over the 30 s script-runner limit |
| pr-sdlc docs quoting `gh api user --jq .login` | no | left unchanged | descriptive text; the added `--hostname` does not change the behaviour they document |
| Test-data URLs in this plan | no | written as `<https URL: host/path>`; fixtures and cases use the real `https://host/path` form | the plan's link gate checks every URL against this repository; the fake `acme` URLs exist only in the stub |
| PR linking | no | names #9345 in the PR body with no `Fixes`/`Closes` keyword | tracking ids are internal register ids (project notes); overrides `pr-link-github-issue` |

## Decisions taken without the owner

No owner was available. Each choice below took the recommended option.

1. Split the wave into 5b-1 (this plan) and 5b-2 (#9367), as the brief prescribes for an over-size wave.
2. Add new target-based account helpers to `lib/git.js` instead of changing `ensureGhAccount` and `recoverGhAccountForRepo` (Key Decisions).
3. `--output-file` accepts both the spec's path form and the bare sibling form (Deviations).
4. Add `github` to `PROJECT_SECTIONS` in `lib/config.js` (Deviations).
5. The stub `gh` is one data-driven Node script; tests reach it through a case runner (Key Decisions).
6. The shipped templates and `--init-templates` move to part 2 (Deviations).
7. Tuning constants: `TITLE_MAX` 120, `VIEW_COMMENTS_MAX` 20, `SEARCH_LIMIT_MAX` 50, `BULK_MAX` 20, `github.cacheMaxAgeHours` default 0 (no expiry). `cost-tiers.md` documents them in part 2.

## Key Decisions

- **New account helpers over changing the old ones.** R30 needs per-process tokens, `--hostname` everywhere and `execFile`. `ensureGhAccount` and `recoverGhAccountForRepo` switch the global account, and pr-sdlc depends on that. Changing them would change pr-sdlc. So `lib/git.js` gains `selectGhAccountForTarget` (pre-flight, this plan) and, in part 2, `recoverGhAccountForTarget` (post-failure, used only by `--apply`); both reuse `selectAccountForOwner` and share one new argv runner, `execGh`. The spec's acceptance requires pr-sdlc's cases to pass unchanged; this is the only way to be sure of it.

- **One argv runner for every `gh` call.** `execGh(args, { env, timeout })` in `lib/git.js` runs `execFileSync('gh', args)` and returns `{ ok, stdout, stderr, status, timedOut }`. It never throws for a failed command (the caller classifies the failure) and never uses a shell (C18). github.js, the new account helpers and the new link-check path all use it.

- **The `gh` call table is fixed in this plan.** The stub (Task 2) is written before the script (Tasks 7–10). So the exact argv of every read is decided here, in Task 2's contract, and the script tasks must use exactly those argv. Every flag value uses the `--flag=value` form (C18). `gh issue`, `gh label` and `gh project` take `--repo=<host>/<owner>/<repo>`; `gh api` and `gh auth` take `--hostname=<host>` (R30).

- **REST per cache section, GraphQL only where REST lacks the data.** Labels, milestones, repository info and template contents use REST endpoints, one per section. So the A8 acceptance ("`--sections labels` makes only label calls") can be checked from the call log. GraphQL is used for assignable users (REST has no `name`), issue types, Projects v2 boards, the capability introspection and the per-issue links of `--view`.

- **A data-driven Node stub, not a shell `case`.** The existing stub `stub-bin-gh/bin/gh` matches two words with `case`. The new stub must answer about 40 call shapes, log every argv, inject failures and change answers over a sequence. A Node script that reads a JSON scenario file does that with one routing rule. Scenario files can `extend` the default one, so a later task adds a variant without editing the shared file.

- **A case runner for every github-sdlc exec case.** script-runner returns only stdout, but the spec's cases assert on the stub call log, written files and the output file. `tests/promptfoo/scripts/run-github-case.js` builds a throw-away workspace (git repo, origin, config, a copy of the fixture home), runs the target script, and prints one JSON document with the exit code, the output, the call log and the requested files. Cases still set `script_stub_bin` and `script_home` (C17); the runner uses `PATH` and `HOME` as the script-runner sets them. With no `script_cwd`, both relative paths resolve against `tests/promptfoo`, the directory every documented command runs from.

- **Issue-form parsing in a new module.** `lib/yaml.js` cannot read nested YAML, and its header asks for a separate module when a richer parser is needed. `lib/github-templates.js` holds a narrow indentation parser for the issue-form keys the spec needs (`body[].type`, `id`, `attributes.label`, `validations.required`) plus the Markdown front-matter and heading parser. Part 2's payload checks reuse it.

- **`mcp-failure.js` gets a source parameter, not a copy.** The redactor, telemetry and analyze code stay single-sourced (`dry`). A `source` value (`jira` default, `github`) picks the class set, title, labels, telemetry heading and duplicate search. With no `--source`, every output byte stays the same (P14). The GitHub proposal body is an inline template in `mcp-failure.js`, because a template file under `skills/github-sdlc/` would fail PD11 until part 2.

- **Flag names agree with the other prepare scripts.** A grep of `plugins/sdlc-utilities/scripts/skill/*.js` at HEAD (`grep -l -- "'<flag>'"`) gives:

  | Flag | Other scripts that define it | Same meaning |
  |---|---|---|
  | `--repo` | `received-review.js` (`owner/repo`) | yes: target repository slug |
  | `--check`, `--load`, `--clear` | `jira.js` | yes: cache check, load, clear |
  | `--file` | `jira.js` (body file), `pr.js`, `version.js` | yes: path of an input file to read |
  | `--auto` | commit, execute, openspec-step, pr, received-review, review, version, ship | yes: no interactive question; anything that needs one stops |
  | `--output-file` | error-report-prepare, execute, harden-prepare, plan, received-review, jira, version | yes in the bare form (manifest path printed); the `<path>` form is the spec's addition (Deviations) |
  | `--force-refresh` | `jira.js` (prose and SKILL.md) | yes: rebuild the cache |
  | `--skip-config-check` | `execute.js`, every script through `config-version-prepare` | yes |
  | `--view`, `--search`, `--validate-links`, `--skip-projects`, `--sections`, `--query-file` | none | new names, no conflict |

- **`pr-link-github-issue` does not apply.** #9345 is an internal register id, not a GitHub issue of this repository (project notes). A `Fixes #9345` line would close an unrelated GitHub issue, so the PR body names the id without a keyword.

- **Workspace modes.** github.js resolves the project root only through `resolveSdlcRoot()` (C-projectroot), which returns the main worktree's root in both `ship.workspace=branch` and `ship.workspace=worktree`. The cache lives under `HOME`, outside any worktree, so both modes share it. The script writes no state file in the working tree (R7).

## Contract Examples

**code** (Task 3):

```markdown
**Contract:**
- shape (code): `execGh(args: string[], opts?: { env?: object, timeout?: number, input?: string }): { ok: boolean, stdout: string, stderr: string, status: number|null, timedOut: boolean }`; never throws for a non-zero exit; `execFileSync('gh', args, { encoding: 'utf8', maxBuffer: MAX_BUFFER, timeout })`.
- names: `execGh`, `GH_TIMEOUT_MS`.
- mirror: `exec()` at `plugins/sdlc-utilities/scripts/lib/git.js:40-60`.
- decisions: no shell; timeout from `opts.timeout`, else `SDLC_GH_TIMEOUT_MS`, else `GH_TIMEOUT_MS`.
- sync: Tasks 5, 7–10 call it.
- example: `execGh(['api', 'user', '--hostname=github.com', '--jq=.login'])` → `{ ok: true, stdout: 'alice', … }`.
```

**docs** (none: this plan writes no user docs; part 2 does).

**openspec / spec** (Task 1):

```markdown
**Contract:**
- shape (openspec): ADD the accepted spec file verbatim; no requirement is added, modified or removed.
- names: `docs/specs/github-sdlc.md` (A1–A13, R1–R37, G1–G10, P1–P17, E1–E11, C1–C20, I1–I12).
- mirror: `docs/specs/jira-sdlc.md` layout.
- decisions: byte copy from the accepted file; no edit.
- sync: `site/src/content-source/specs/github-sdlc.md` byte-identical.
```

## Tasks

### Task 1: Land the accepted spec

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Create: `docs/specs/github-sdlc.md`
- Create: `site/src/content-source/specs/github-sdlc.md`

**Notes:** The spec text is accepted and must not change; a copy avoids any retyping drift. The accepted file lives in the orchestrating session's scratchpad on this machine, where ship runs (brief). If it is missing, stop and report: never retype or reconstruct the spec.

**Acceptance criteria:**
- [ ] Both files are byte-identical to `/tmp/claude-1000/-workspace-sdlc-marketplace/101d243d-3a34-43c0-999e-39c47a18b14c/scratchpad/accepted/github-sdlc.md` (307 lines) (`cmp` exits 0 for each).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD `docs/specs/github-sdlc.md` by `cp /tmp/claude-1000/-workspace-sdlc-marketplace/101d243d-3a34-43c0-999e-39c47a18b14c/scratchpad/accepted/github-sdlc.md docs/specs/github-sdlc.md`, then `cp docs/specs/github-sdlc.md site/src/content-source/specs/github-sdlc.md`. No text edit.
- names: requirement ids exactly as in the accepted file.
- mirror: `docs/specs/jira-sdlc.md` and its site copy.
- decisions: never run `site/scripts/copy-docs.mjs` (it copies the whole tree).
- sync: the two files stay byte-identical.

---

### Task 2: Stub `gh`, case runner and dataset scaffold

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin/gh`
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/scenarios/default.json`
- Create: `tests/promptfoo/scripts/run-github-case.js`
- Create: `tests/promptfoo/datasets/github-sdlc-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register `file://datasets/github-sdlc-exec.yaml` after the jira datasets

**Notes:** Every later task's exec cases depend on this harness (C17, F-exec-test-harness-gh-stub-5, -7, -10). The stub must be committed executable (`chmod +x`, git mode 100755), like `stub-bin-gh/bin/gh`. `chmod` is the one shell step; file contents go through the Write tool.

**Acceptance criteria:**
- [ ] The stub answers each route of the call table below from `default.json`, appends one JSON line per call to `$GH_STUB_LOG`, and prints `STUB-GH-UNEXPECTED <argv>` on stderr with exit 1 for an unmatched call.
- [ ] `GH_STUB_FAIL`, `GH_STUB_AUTH`, `GH_STUB_ACCOUNTS`, `GH_STUB_SCOPES` and `GH_STUB_SEQ` change the answers as the env table says; each has one stub self-test case in `github-sdlc-exec.yaml` (run through `run-github-case.js --script <stub>` mode `--raw-gh`).
- [ ] `run-github-case.js` prints the output document below for each option in its table.
- [ ] The dataset holds a `github-sdlc/c17-dataset-check` case that runs `run-github-case.js --check-dataset datasets/github-sdlc-exec.yaml` and passes: every case except those whose description contains `E11` sets `script_stub_bin: "fixtures-fs/stub-bin-gh-issues/bin"`, every case sets `script_home`, and every case except those whose description contains `online G8` passes `SDLC_LINKS_OFFLINE=1` in `script_env` (C17).
- [ ] `git ls-files -s tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin/gh` shows mode 100755 once staged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/stub"` and `--filter-pattern "github-sdlc/c17"` pass.

**Contract:**
- shape (code): stub `bin/gh` is `#!/usr/bin/env node`; runner is a CommonJS script with no dependencies outside Node built-ins.
- names: env vars below; scenario keys `extends`, `routes[]` (`match`, `contains`, `stdout`, `stderr`, `exit`); runner options below; case-description prefix `github-sdlc/`.
- mirror: `tests/promptfoo/fixtures-fs/stub-bin-claude/bin/claude:1-30` (env-driven stub with call log); `tests/promptfoo/scripts/run-headless-case-stub.js:1-60` (runner printing one JSON line).
- decisions: routing = first route whose `match` is a prefix of `argv.join(' ')` and whose `contains` strings all appear in some argv element; built-in handlers for `--version`, `auth status`, `auth token`, `api user` run before routes; `stdout` objects are printed as JSON; scenario `extends` names another file in `scenarios/` whose routes come after this file's routes.
- sync: Tasks 4–10 use these env vars, routes and runner options exactly.

Stub env table:

| Env var | Values | Effect |
|---|---|---|
| `GH_STUB_LOG` | file path | append `{"argv":[…],"tokenHash":"<sha256(GH_TOKEN) first 12 hex>"|null}` per call |
| `GH_STUB_DATA` | scenario name or absolute path | default `default` (`scenarios/default.json`) |
| `GH_STUB_AUTH` | `ok` (default) \| `expired` \| `logged-out` \| `timeout` | `auth status` answer; `timeout` sleeps `GH_STUB_SLEEP_MS` (default 3000) |
| `GH_STUB_ACCOUNTS` | `alice*,acme` (default `alice*`) | accounts for `auth status --json=hosts`; `*` = active |
| `GH_STUB_SCOPES` | comma list \| `none` (default `repo,read:org,project,read:project`) | `Token scopes:` line of `auth status`; omitted entirely when `GH_TOKEN` is set |
| `GH_STUB_FAIL` | `<kind>@<argv prefix>[#<n>]`, several joined by `;` | make the matching call fail; `#n` only the n-th matching call; kinds: `rate-limit` (exit 1, stderr `HTTP 403: API rate limit exceeded … reset 1767225600`), `secondary-rate-limit` (`HTTP 403: You have exceeded a secondary rate limit`), `401`, `403` (`HTTP 403: Resource not accessible by integration`), `404` (`HTTP 404: Not Found`), `422` (`HTTP 422: Validation Failed`), `scope` (`HTTP 403: … requires the 'project' scope`), `timeout` (sleep `GH_STUB_SLEEP_MS`), `pat` (stderr holds `github_pat_11ABCDEFG0123456789_secret`) |
| `GH_STUB_SEQ` | `<route key>=<v1>,<v2>,…` | the k-th call of a route returns variant k (last repeats); counter file `$GH_STUB_LOG.seq` |

`auth token --user=<login> --hostname=<h>` prints `stub-token-<login>-S3CR3T` (known value for C20).

`gh` call table (fixed; Tasks 7–10 call exactly these argv; `<R>` = `<host>/<owner>/<repo>`, `<h>` = host, `<o>/<r>` = owner/repo):

| Purpose | argv |
|---|---|
| version (E11 probe) | `--version` |
| auth state | `auth status --hostname <h>` (existing `probeGhAuth` form) |
| accounts | `auth status --hostname=<h> --json=hosts` |
| token | `auth token --user=<login> --hostname=<h>` |
| active login | `api user --hostname=<h> --jq=.login` |
| repo access / info | `api repos/<o>/<r> --hostname=<h>` |
| labels | `api repos/<o>/<r>/labels?per_page=100 --hostname=<h> --paginate --slurp` |
| milestones | `api repos/<o>/<r>/milestones?state=all&per_page=100 --hostname=<h> --paginate --slurp` |
| assignable users | `api graphql --hostname=<h> --raw-field=query=<Q_ASSIGNABLE> --field=owner=<o> --field=name=<r>` |
| template list | `api repos/<o>/<r>/contents/.github/ISSUE_TEMPLATE --hostname=<h>` |
| template file | `api repos/<o>/<r>/contents/.github/ISSUE_TEMPLATE/<file> --hostname=<h> --header=Accept: application/vnd.github.raw` |
| owner `.github` visibility | `api repos/<o>/.github --hostname=<h> --jq=.visibility` |
| issue types | `api graphql --hostname=<h> --raw-field=query=<Q_ISSUE_TYPES> --field=owner=<o>` |
| project board | `api graphql --hostname=<h> --raw-field=query=<Q_PROJECT> --field=owner=<o> --field=number=<n>` |
| host capabilities | `api graphql --hostname=<h> --raw-field=query=<Q_ISSUE_FIELDS>` |
| client capabilities | `issue create --help`, `issue edit --help`, `issue close --help` |
| issue (view, PR check) | `api repos/<o>/<r>/issues/<n> --hostname=<h>` |
| issue comments | `api repos/<o>/<r>/issues/<n>/comments?per_page=100 --hostname=<h> --paginate --slurp` |
| issue links | `api graphql --hostname=<h> --raw-field=query=<Q_ISSUE_LINKS> --field=owner=<o> --field=name=<r> --field=number=<n>` |
| search | `api search/issues --hostname=<h> --method=GET --raw-field=q=<query> --raw-field=per_page=<SEARCH_LIMIT_MAX>` |
| link existence (Task 5) | `api repos/<o>/<r>/issues/<n> --hostname=<h> --silent` |
| duplicate search (Task 6) | `issue list -R rnagrodzki/sdlc-marketplace --state open --label tooling-error --label github-sdlc --search <text> --json number,title,body,url` (the existing `mcp-failure.js` argv style, kept for one code path: every value is a constant or the `gh-failure[<class>]` marker, so none starts with `-`) |

`Q_ISSUE_LINKS` selects `issueType { name }`, `parent { number repository { nameWithOwner } }`, `subIssues(first:50) { nodes { number } }`, `blockedBy(first:50)` and `blocking(first:50) { nodes { number } }`, and `projectItems(first:20) { nodes { project { number owner { login } } fieldValues(first:30) { nodes { … on ProjectV2ItemFieldSingleSelectValue { name field { … on ProjectV2FieldCommon { name } } } … text, number, date, iteration } } } }`; `default.json` answers it for issues 5 and 7 (issue 7: type `Bug`, no parent, sub-issue 12, blocked by 4, on board `acme` #2 with `Status` `Todo`). The `Q_*` query strings are named constants in github.js; stub routes match them by a distinctive `contains` substring (`assignableUsers`, `issueTypes`, `projectV2`, `__type`, `subIssues`).

`default.json` data (repository `acme/widgets` on `github.com` unless noted):

| Route | Answer |
|---|---|
| repo | `{"node_id":"R_1","full_name":"acme/widgets","has_issues":true,"visibility":"public"}` (also `acme/other`, `acme/a`, `acme/b` with their own names) |
| labels | `bug`, `enhancement`, `documentation` (`acme/a`: `a-only`; `acme/b`: `b-only`) |
| milestones | `{number:1,title:"v1.0",state:"open",due_on:null}` |
| assignable | `alice` (Alice A), `bob` (Bob B) |
| template list | `bug.md`, `feature.yml`, `config.yml` |
| `bug.md` | front matter `name: Bug report`, `about: …`, `labels: [bug]`, `title: "[BUG] "`; body `## Describe the bug` with `<!-- Describe the bug -->`, `## Steps` with `[Describe the steps]`, `## Acceptance Criteria` |
| `feature.yml` | `name: Feature`; `body:` one `markdown` element, textarea `id: problem` label `Problem` `validations: {required: true}`, textarea `id: notes` label `Notes` |
| `config.yml` | `blank_issues_enabled: false` |
| `acme/.github` visibility | `private` |
| issue types | `{"data":{"repositoryOwner":{"issueTypes":{"nodes":[{"id":"IT_1","name":"Bug"},{"id":"IT_2","name":"Task"}]}}}}` |
| project `acme` #2 | id `PVT_2`, title `Roadmap`, fields `Status` (single-select `PVTSSF_1`, options `Todo`/`OPT_1`, `In Progress`/`OPT_2`, `Done`/`OPT_3`), `Notes` (text), `Size` (number), `Due` (date), `Iteration` (iteration `PVTIF_1`, iteration `IT_A` `Sprint 1`) |
| host capabilities | Issue fields include `subIssues`, `blockedBy`, `blocking`, `issueType`, `parent` |
| client help | create help lists `--type`; edit help lists `--parent`, `--add-sub-issue`, `--add-blocked-by`, `--add-blocking`; close help lists `--duplicate-of` |
| issue 7 | open issue, 3 comments (created ascending) |
| issue 12 | open issue; seq key `state12` variants: `open`, `closed` |
| issue 20 | has `pull_request` key |
| issues 3, 4, 5 | open issues; issue 5 links: parent 3 |
| issue 999 | 404 |
| search | two results (numbers 7, 12) |
| `ghe.acme.test` | repo `acme/widgets` and issue 4 (for Task 5's GHE case) |

Runner `run-github-case.js` options:

| Option | Effect |
|---|---|
| `--script <repo-relative path>` | target script (default `plugins/sdlc-utilities/scripts/skill/github.js`) |
| `--raw-gh` | run `gh` itself with the args after `--` (stub self-tests) |
| `--origin <url>` / `--no-git` | temp workspace git repo with that origin / no git repo |
| `--config <json>` | write `.sdlc/config.json` (JSON without spaces, since script_args split on whitespace) |
| `--sub <dir>` | run from that sub-directory of the workspace (C-projectroot) |
| `--break-cache` | make `$HOME/.sdlc-cache/github` a file, so the script's cache I/O throws (P17 crash case) |
| `--no-gh-path` | `PATH` = a temp dir holding only `node` and `git` symlinks (E11) |
| `--dump <path>` | add that file's text (path relative to the temp home when it starts with `~/`, else to the workspace) to `dumps` |
| `--check-dataset <path>` | run the C17 check over a dataset (path relative to `tests/promptfoo`) and print `{ ok, offenders[] }`; line-based: split the file into case blocks at each line starting `- description:`, then test each block's text for `script_stub_bin:`, `script_home:` and `SDLC_LINKS_OFFLINE` (no YAML parser) |
| `--` | every following arg goes to the script; tokens `@OUT@` (a temp output path), `@HOME@`, `@WS@` (workspace) and `@FIX:<path under fixtures-fs>@` are replaced with absolute paths |

The runner copies `$HOME` (the case's `script_home`) to a temp home, sets `GH_STUB_LOG` to a temp file, and prints:

```json
{ "exit": 0, "stdout": "…", "json": { … } , "stderr": "…",
  "calls": [ { "argv": ["api", "user", "--hostname=github.com", "--jq=.login"], "tokenHash": null } ],
  "outputFile": { "path": "…", "content": "…" }, "dumps": { "~/.sdlc-cache/github/github_com/acme/widgets.json": "…" } }
```

`json` is `JSON.parse(stdout)` when stdout parses, else `null`. A case asserts with `type: javascript` on `JSON.parse(output)`.

---

### Task 3: Argv `gh` runner and target-based account helpers in `lib/git.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/git.js` — add `execGh`, `getGhAccountsForHost`, `getGhTokenFor`, `selectGhAccountForTarget`; add `--hostname` and token scopes to `probeGhAuth`
- Modify: `tests/promptfoo/scripts/git-lib-test.js` — new `--op` cases with an injected runner
- Modify: `tests/promptfoo/datasets/git-lib-exec.yaml` — cases for the new helpers

**Notes:** New functions keep pr-sdlc's behaviour unchanged (Key Decisions). `docs/specs/pr-sdlc.md:112`, `docs/skills/pr-sdlc.md:317` and their site copies describe the login call as `gh api user --jq .login`; that stays true in meaning (the same command, now with `--hostname`), so they are left unchanged (Deviations). Every new function takes an injectable `run` (default `execGh`) so the git-lib cases stay hermetic without the stub (F-gh-account-links-mcpfailure-lib-reuse-7, -11).

**Acceptance criteria:**
- [ ] `execGh` never uses a shell, applies the timeout rule of the contract, and reports `timedOut: true` on a timeout instead of throwing.
- [ ] `selectGhAccountForTarget` with accounts `alice` (active) and `acme` and owner `acme` returns `actingAccount: "acme"`, `activeAccount: "alice"`, `accountSwitch.switched: true`, and a `token` read by `getGhTokenFor('acme', 'github.com')`; the injected runner saw `auth token --user=acme --hostname=github.com` and no `auth switch`.
- [ ] With the active account owning the repository (or accessible by probe), it returns `switched: false`, `token: null`, `actingAccount` = active login.
- [ ] `probeGhAuth` runs `gh api user --hostname <host> --jq .login` and returns `tokenScopes` (array parsed from the `Token scopes:` line, `null` when the line is absent); the existing `probeGhAuthTimeout` and `execGhTimeoutApplied` git-lib cases and the pr-recover cases pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "git-lib"` and `--filter-pattern "pr-recover"` pass.

**Contract:**
- shape (code):
  - `execGh(args, { env, timeout, input } = {})` → `{ ok, stdout, stderr, status, timedOut }`; `timeout = opts.timeout ?? (Number(process.env.SDLC_GH_TIMEOUT_MS) || GH_TIMEOUT_MS)`; `env` replaces `process.env` when given.
  - `getGhAccountsForHost(host, { run = execGh, env } = {})` → `{ accounts: [{ login, active }], error }`; argv `['auth','status','--hostname=' + host, '--json=hosts']`.
  - `getGhTokenFor(login, host, { run = execGh } = {})` → `string|null`; argv `['auth','token','--user=' + login, '--hostname=' + host]`.
  - `selectGhAccountForTarget({ host, owner, repo, run = execGh })` → `{ activeAccount, actingAccount, token, accountSwitch: { switched, account, previousAccount, reason }, warning }`. Phase 1: active login equals owner → no switch. Phase 2: an inactive account equal to owner → its token. Phase 3: probe `['api', 'repos/' + o + '/' + r, '--hostname=' + host]` with the active account, then with each other account's token in `env.GH_TOKEN`; first success wins.
  - `probeGhAuth` return gains `tokenScopes: string[]|null`; its `gh api user` call becomes `gh api user --hostname ${host} --jq .login`.
- names: as above; exported from `module.exports` (:1396).
- mirror: `ensureGhAccount` phases at `plugins/sdlc-utilities/scripts/lib/git.js:461-525`; `selectAccountForOwner` :745.
- decisions: the token is returned to the caller only and never logged (C20); slug parts are validated by the caller (github.js A1 grammar) and again here with `probeRepoAccess`'s regexes (:596-603).
- sync: `probeGhAuth` callers `pr.js:222`, `ship.js:3019` read only the old keys; the new key is additive.

Before → after for `probeGhAuth`'s login call:

```diff
   // Authenticated: query the active login.
-  const activeAccount = run('gh api user --jq .login');
+  const activeAccount = run(`gh api user --hostname ${host} --jq .login`);
+  const scopesLine = statusRaw.split('\n').find((l) => /Token scopes:/i.test(l));
+  const tokenScopes = scopesLine ? (scopesLine.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1)) : null;
   return {
     authenticated: true,
     activeAccount: activeAccount || null,
+    tokenScopes,
```

---

### Task 4: `github` config section in the schema and `lib/config.js`

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `schemas/sdlc-config.schema.json` — add `$defs.githubSection` and root `properties.github`
- Modify: `plugins/sdlc-utilities/scripts/lib/config.js` — add `'github'` to `PROJECT_SECTIONS`
- Modify: `tests/promptfoo/runners/config-load-runner.js` — optional `--section <name>` prints `readSection(cwd, name)`
- Modify: `tests/promptfoo/datasets/config-load-exec.yaml` — case `config-load: github section read`
- Create: `tests/promptfoo/fixtures-fs/project-config-github/.sdlc/config.json`

**Notes:** R4 makes the schema the home of the `cacheMaxAgeHours` default; github.js keeps its own key list because consumer projects do not ship the schema, and Task 7's sync case keeps the two equal (F-jira-sdlc-sibling-pattern-4).

**Acceptance criteria:**
- [ ] The schema declares `githubSection` with exactly the keys below and `additionalProperties: false`, and the root `properties` has `github` → `#/$defs/githubSection`.
- [ ] `readSection(root, 'github')` returns the `github` block of the fixture; the runner prints it with `--section github`.
- [ ] The existing `config-load` cases and `received-review` schema-rejection case pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "config-load"` passes.

**Contract:**
- shape (code): schema field delta below; `PROJECT_SECTIONS = new Set(['version', 'jira', 'commit', 'pr', 'plan', 'execute', 'github'])`; runner: when `--section <name>` is present print `JSON.stringify(cfg.readSection(process.cwd(), name))`, else today's output.
- names: `githubSection`, `defaultRepo`, `repos`, `projects`, `cacheMaxAgeHours`.
- mirror: `jiraSection` at `schemas/sdlc-config.schema.json:51-68`.
- decisions: slug pattern is the A1 grammar with optional host; `cacheMaxAgeHours` default `0` means no expiry (R6).
- sync: Task 7's `GITHUB_CONFIG_KEYS` and `CACHE_MAX_AGE_HOURS_DEFAULT`; `.sdlc/config.json` of this repository is unchanged.

```diff
   "$defs": {
     …
+    "githubSection": {
+      "type": "object",
+      "description": "Controls GitHub issue integration (github-sdlc).",
+      "properties": {
+        "defaultRepo": { "type": "string", "pattern": "^([A-Za-z0-9.-]+(:\\d+)?/)?[A-Za-z0-9-]+/[A-Za-z0-9._-]+$" },
+        "repos": { "type": "array", "items": { "type": "string", "pattern": "^([A-Za-z0-9.-]+(:\\d+)?/)?[A-Za-z0-9-]+/[A-Za-z0-9._-]+$" }, "uniqueItems": true },
+        "projects": { "type": "array", "items": { "type": "object",
+          "properties": { "owner": { "type": "string" }, "number": { "type": "integer", "minimum": 1 } },
+          "required": ["owner", "number"], "additionalProperties": false } },
+        "cacheMaxAgeHours": { "type": "number", "minimum": 0, "default": 0 }
+      },
+      "additionalProperties": false
+    },
   "properties": {
     …
+    "github": { "$ref": "#/$defs/githubSection" },
```

Fixture `project-config-github/.sdlc/config.json`: `{"github":{"defaultRepo":"acme/widgets","repos":["acme/widgets"],"projects":[{"owner":"acme","number":2}]}}`.

---

### Task 5: GitHub context option in `lib/links.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2, Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/links.js` — `ctx.github` option, `owner/repo#n` and `#n` references, target-host GitHub classification
- Modify: `tests/promptfoo/datasets/links-lib-exec.yaml` — new `links: github-context` cases
- Create: `tests/promptfoo/fixtures-fs/links-lib/github-context.txt`
- Create: `tests/promptfoo/fixtures-fs/links-lib/github-context-ghe.txt`

**Notes:** Existence-only checking for cross-repository links is an owner decision (spec appendix, P12, I4). The option is opt-in, so pr-sdlc, jira-sdlc and the SKILL.md CLI callers keep the identity match (F-gh-account-links-mcpfailure-lib-reuse-15 to -17).

**Acceptance criteria:**
- [ ] Without `ctx.github`, every existing `links-lib` case passes unchanged.
- [ ] With `ctx.github`, `expectedRepo` is never auto-filled; a `github.com/acme/other/issues/3` URL is not a `github-context-mismatch`.
- [ ] With `ctx.github.host` = `ghe.acme.test` and offline unset, `<https URL: ghe.acme.test/acme/widgets/issues/4>` is checked by `gh api repos/acme/widgets/issues/4 --hostname=ghe.acme.test --silent` against the stub (exit 0 → ok), not by the generic reachability check.
- [ ] `owner/repo#N` references are checked for existence in that repository; bare `#N` in the target repository; references inside code spans and fenced blocks are ignored.
- [ ] A stub 404 for issue 4 (`GH_STUB_FAIL=404@api repos/acme/widgets/issues/4`) gives a `github-not-found` violation naming the URL.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "links"` passes.

**Contract:**
- shape (code): `validateLinks(text, ctx)` accepts `ctx.github = { host: string, owner: string, repo: string, env?: object }`. When present: (1) skip the `expectedRepo` auto-fill; (2) `classifyUrl` also treats `ctx.github.host` as a GitHub host; (3) `extractIssueRefs(text)` returns `{ ref, owner, repo, number, line }` for `owner/repo#N` and `#N` outside code spans, fenced blocks and HTML comments; (4) existence via `execGh(['api', 'repos/' + o + '/' + r + '/issues/' + n, '--hostname=' + host, '--silent'], { env: ctx.github.env })`; offline skips existence only. Violation reasons: existing `github-not-found`, new `github-ref-not-found` for references. CLI `--ctx` accepts the same key.
- names: `ctx.github`, `extractIssueRefs`, `github-ref-not-found`.
- mirror: `checkGithubUrl` at `plugins/sdlc-utilities/scripts/lib/links.js:148-175`; `resolvedCtx` at :330-335.
- decisions: one ctx object, not separate flags, so the opt-in is a single check; `env` carries the acting account's `GH_TOKEN` from github.js (R30).
- sync: Task 10 builds `ctx.github` from the resolved repository.

| Input (ctx.github set) | Before | After |
|---|---|---|
| `<https URL: github.com/acme/other/issues/3>` | `github-context-mismatch` | existence check, ok |
| `<https URL: ghe.acme.test/acme/widgets/issues/4>` | generic reachability | `gh api … --hostname=ghe.acme.test --silent` |
| `acme/other#3` | ignored | existence check |
| `` `#9` `` in a code span | ignored | ignored |

---

### Task 6: `--source github` in `lib/mcp-failure.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/mcp-failure.js` — source-aware classes, telemetry, analyze, duplicate search, GitHub redactors, export `redact`
- Create: `tests/promptfoo/datasets/mcp-failure-github-exec.yaml`
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/scenarios/report-duplicate.json`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register `file://datasets/mcp-failure-github-exec.yaml`

**Notes:** One helper with a source switch keeps redaction and telemetry single-sourced (Key Decisions). The jira output must stay byte-identical (P14, F-gh-account-links-mcpfailure-lib-reuse-18 to -22).

**Acceptance criteria:**
- [ ] The existing `mcp-failure` cases in `jira-sdlc-exec.yaml` pass unchanged.
- [ ] `--analyze --record --source github --class validation --operation create --repo acme/widgets --error "HTTP 422" --recovered no --step R26` prints JSON with `proposalTitle` containing `gh-failure[validation]`, `labels: ["tooling-error","github-sdlc"]`, `shouldDispatch: true`, `action: "create"`, and the call log holds the duplicate search argv of Task 2's table.
- [ ] With `GH_STUB_DATA=report-duplicate`, the output has `duplicate.url` and `action: "show-duplicate"`.
- [ ] `--class rate-limit`, `auth`, `permission`, `not-found`, `transport` and `capability` print `shouldDispatch: false`, `proposal: null` and make no `gh issue list` call.
- [ ] The `--record` telemetry block written to `.sdlc/learnings/log.md` is exactly the heading `## <date> — github-sdlc gh-failure[validation]: create` plus five lines `- operation:`, `- repo:`, `- class:`, `- error:`, `- recovered:`; an `--error` holding `github_pat_11ABC` and `ghp_abc` shows `[REDACTED]` in both the telemetry and `errorText` (C13).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "mcp-failure"` passes (jira and github cases).

**Contract:**
- shape (code): `SOURCES = { jira: {…today…}, github: { classes: GH_CLASSES, envClasses: ['auth','permission','rate-limit','not-found','transport','capability'], labels: ['tooling-error','github-sdlc'], titlePrefix: 'gh-failure' } }`; `GH_CLASSES = ['transport','auth','permission','rate-limit','not-found','validation','capability','link-verification','unknown']`; `appendTelemetry(failure, root, source = 'jira')`; `analyzeForDispatch(failure, root, source = 'jira')`; CLI reads `--source` (default `jira`) and, for github, `--repo` instead of `--site`/`--project`; `REDACTORS` gain `/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{1,255}\b/g` and `/\bgithub_pat_[A-Za-z0-9_]{1,255}\b/g` → `[REDACTED]`; `module.exports` adds `redact`, `GH_CLASSES`.
- names: as above; title `gh-failure[<class>]: <operation> on <repo>`; `errorReportArgs` `--error-type gh-<class> --skill github-sdlc --step <step> --operation <op>`.
- mirror: `analyzeForDispatch` at `plugins/sdlc-utilities/scripts/lib/mcp-failure.js:289-385`; CLI `--analyze` at :450-488.
- decisions: environment classes return `shouldDispatch: false` with no search (R26); a duplicate returns `{ number, url }` and `action: "show-duplicate"` (no comment in v1); the GitHub proposal body is an inline template (Key Decisions).
- sync: Tasks 9 and part 2 import `redact`; error-report-sdlc is unchanged (I6).

GitHub `--analyze` output:

```json
{ "shouldDispatch": true, "duplicate": null, "proposal": { "title": "gh-failure[validation]: create on acme/widgets", "body": "…" },
  "action": "create", "proposalTitle": "gh-failure[validation]: create on acme/widgets", "proposalText": "…",
  "errorReportArgs": "--error-type gh-validation --skill github-sdlc --step 'R26' --operation 'create'",
  "labels": ["tooling-error", "github-sdlc"], "errorText": "…" }
```

---

### Task 7: `skill/github.js` core: arguments, resolution, auth, cache status, `--check`, `--load`, `--clear`

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 2, Task 3, Task 4
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/skill/github.js`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-home/.sdlc-cache/github/github_com/acme/widgets.json`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-home/.sdlc-cache/github/github_com/acme/other.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/check`, `/load`, `/clear`, `/args`, `/output-file`, `/sync` cases
- Modify: `tests/promptfoo/scripts/run-github-case.js` — `--schema-sync` mode: compare `githubSection` keys and default with github.js exports

**Notes:** This is the foundation every later subcommand plugs into, so the output writer, exit-code rule and argument parser are fixed here (P17). Required reading before coding: the landed spec `docs/specs/github-sdlc.md` (the ids cited below) and Task 2's `gh` call table, stub env table and runner options, which this task must match exactly. Evidence: F-jira-sdlc-sibling-pattern-1 to -4, F-gh-account-links-mcpfailure-lib-reuse-4, -8.

**Acceptance criteria:**
- [ ] A1: `--check --repo acme/widgets` with origin `acme/other` reports `repo.slug: "acme/widgets"`, `repo.source: "flag"`; `--repo bad//x` and `--repo acme/..` exit 1 with an `errors[]` entry naming `--repo`, no `gh` call and no cache read or write.
- [ ] R1: three workspaces report `repo.source` `flag`, `config` and `origin`; no origin, no config and `github.repos: ["a/x","b/y"]` reports `source: "none"`, `candidateRepos: ["a/x","b/y"]`, exit 0.
- [ ] R3: origin `git@github-work:acme/widgets.git` with the stub listing only `github.com` reports `repo.host: "github.com"` and one `warnings[]` entry containing `github-work`.
- [ ] R4: `--check` echoes `config.github` with defaults; `github.unknownKey` gives exit 1 with an `errors[]` entry naming `unknownKey`, also with `--skip-config-check`.
- [ ] R-config-version: output has `flags.skipConfigCheck` and `migration` (null when skipped). A5/P6: `flags.auto` true/false.
- [ ] P3/R30: with `GH_STUB_ACCOUNTS=alice*,acme`, `auth.accountSwitch.switched: true`, `account: "acme"`, `actingAccount: "acme"`, `activeAccount: "alice"`; the call log has `auth token --user=acme --hostname=github.com`, no `auth switch`, and every later call has the token hash; R20 scopes: `read:project` only → `scopes.project: false`, `scopes.readProject: true`; `GH_TOKEN` in `script_env` → both `null`.
- [ ] G2/E3/E11: stub `logged-out` → exit 1 with the `probeGhAuth` message; `expired` → `auth.expired: true`, exit 1, refresh hint; `--no-gh-path` → exit 1 with an `errors[]` entry naming `gh`.
- [ ] P4/G1/A2/R6: complete cache → `cache.exists: true`, `refreshNeeded: false`; cache missing `labels` → `missing: ["labels"]`, `refreshNeeded: true`, `reason: "incomplete"`; `--force-refresh` → `reason: "force-refresh"`; `cacheMaxAgeHours: 1` with an old `fetchedAt` → `reason: "expired"`.
- [ ] A6/A7/P8/P15/C15: `--clear --repo acme/widgets` → `cleared: true`, file gone, `acme/other` file unchanged; again → `cleared: false`, exit 0; `--load` prints every R5 key with no `gh` call; `--load` with no cache → exit 1.
- [ ] A11/P17: `--check --output-file @OUT@` prints nothing on stdout and the file holds the same keys; an unknown flag → exit 1 with `errors[]`; `--break-cache` → exit 2.
- [ ] C-projectroot: `--check` from a sub-directory resolves the workspace's `.sdlc/config.json`.
- [ ] Schema sync: `--schema-sync` reports `GITHUB_CONFIG_KEYS` equal to the schema's `githubSection` keys and `CACHE_MAX_AGE_HOURS_DEFAULT` equal to its default.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/"` passes.

**Contract:**
- shape (code):
  - CLI: `github.js <--check|--refresh|--load|--clear|--view <n>|--search|--validate-links> [--repo <slug>] [--force-refresh] [--skip-projects] [--sections <csv>] [--auto] [--query-file <p>] [--file <p>] [--output-file [<p>]] [--skip-config-check]`; one subcommand (default `--check`); this task implements `--check`, `--load`, `--clear`; the others return exit 1 `"<sub>: not implemented"` until Tasks 8–10.
  - `parseSlug(text)` → `{ host, owner, name, slug } | null` by the A1 grammar (`HOST_RE = /^[A-Za-z0-9.-]+(:\d+)?$/`, `OWNER_RE = /^[A-Za-z0-9-]+$/`, `REPO_RE = /^[A-Za-z0-9._-]+$/` and not `.`/`..`).
  - `resolveRepo(projectRoot, args, config)` → P1 + P2 + warnings (R1, R3).
  - `resolveAuth(repo)` → P3: `probeGhAuth({ host })`, `selectGhAccountForTarget`, access probe; the token stays in a module variable and reaches children only as `env.GH_TOKEN`.
  - `gh(args)` → `execGh(args, { env: { ...process.env, ...(token ? { GH_TOKEN: token } : {}) } })`.
  - `cachePath(repo)` = `path.join(os.homedir(), '.sdlc-cache', 'github', host.toLowerCase().replace(/\./g, '_'), owner.toLowerCase(), name.toLowerCase() + '.json')`.
  - `checkCache(repo, config, flags)` → P4.
  - `emit(data, exitCode)`: `--output-file <p>` → write `p`, print nothing; bare `--output-file` → `writeOutput(data, 'github-context', code)`; none → JSON on stdout.
  - exports when required: `TITLE_MAX = 120`, `VIEW_COMMENTS_MAX = 20`, `SEARCH_LIMIT_MAX = 50`, `BULK_MAX = 20`, `GITHUB_CONFIG_KEYS = ['defaultRepo','repos','projects','cacheMaxAgeHours']`, `CACHE_MAX_AGE_HOURS_DEFAULT = 0`, `CACHE_SECTIONS = ['labels','milestones','assignableUsers','issueTemplates','issueTypes','projects','capabilities']`, `parseSlug`, `cachePath`.
  - `main()` wraps everything; an uncaught error → stderr message, exit 2.
- names: as above; prefix `github-context`.
- mirror: `plugins/sdlc-utilities/scripts/skill/jira.js:197-320` (parseArgs with `errors[]`), :1153-1225 (config gate, switch, crash guard).
- decisions: `--skip-config-check` skips only the migration, never the R4 key check; R3 alias rule: when the origin host is not in `getGhAccountsForHost` hosts, use `github.com` and warn; `cache.reason` precedence `force-refresh` > `missing` > `incomplete` > `expired` > `null`; ENOENT on cache read = no cache, any other cache I/O error propagates (crash, exit 2).
- sync: the `gh` call table of Task 2; Task 4 schema; Tasks 8–10 add subcommands to the same switch.

`--check` output (P1–P6):

```json
{ "repo": { "host": "github.com", "owner": "acme", "name": "widgets", "slug": "acme/widgets", "source": "flag" },
  "candidateRepos": [],
  "auth": { "authenticated": true, "activeAccount": "alice", "actingAccount": "acme", "expired": false, "timedOut": false,
            "scopes": { "project": true, "readProject": true }, "repoAccessible": true,
            "accountSwitch": { "switched": true, "account": "acme", "previousAccount": "alice", "reason": "owner-match" } },
  "cache": { "exists": true, "path": "…/.sdlc-cache/github/github_com/acme/widgets.json", "missing": [], "fresh": true, "refreshNeeded": false, "reason": null },
  "config": { "github": { "defaultRepo": null, "repos": [], "projects": [], "cacheMaxAgeHours": 0 } },
  "flags": { "skipConfigCheck": false, "skipProjects": false, "forceRefresh": false, "initTemplates": false, "auto": false },
  "migration": null, "warnings": [], "errors": [] }
```

Cache fixture `widgets.json` holds every R5 key (`schemaVersion: 1`, `fetchedAt`, `fetchedBy: "alice"`, `repo`, `labels`, `milestones`, `assignableUsers`, `issueTemplates`, `templateConfig`, `issueTypes`, `projects`, `capabilities`) with the same values as the stub's `default.json`; `other.json` holds only `repo` and `labels: [{ "name": "other-only" }]`.

| Condition | Exit | Output |
|---|---|---|
| invalid slug or unknown flag | 1 | `errors[]` names the flag |
| unknown `github.*` key | 1 | `errors[]` names the key |
| `gh` missing | 1 | `errors[]`: `gh CLI not found: install it from https://cli.github.com` |
| not logged in / expired / timeout | 1 | `auth.*` + `errors[]` from `probeGhAuth` |
| repository not accessible | 1 | `auth.repoAccessible: false` + `formatAccessDenied` text |
| crash | 2 | stderr |

---

### Task 8: `--refresh`: cache build, templates, issue types, projects, capabilities

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--refresh [--sections] [--skip-projects]`
- Create: `plugins/sdlc-utilities/scripts/lib/github-templates.js`
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/scenarios/capabilities-old.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/refresh` cases

**Notes:** Template parsing is a separate pure module because part 2's payload checks need the same headings, sections and front matter (Key Decisions). R8 makes `--refresh` the only metadata reader, so this task is where every metadata call lives. Evidence: F-jira-sdlc-sibling-pattern-3 (cache shape differs from jira's), F-exec-test-harness-gh-stub-10.

**Acceptance criteria:**
- [ ] R5/P7: `--refresh` writes `<home>/.sdlc-cache/github/github_com/acme/widgets.json` with every R5 key, `fetchedBy` equal to `auth.actingAccount`, no `currentUser` key; output has `saved: true`, `cachePath`, `counts`.
- [ ] A8: `--refresh --sections labels` makes only the label call (plus the auth calls) and keeps every other section byte for byte; `--sections bogus` → exit 1 naming `bogus`.
- [ ] A4: `--refresh --skip-projects` makes no `projectV2` call and saves `projects: { "skipped": true }`.
- [ ] R11: `bug.md` gives `{ kind: "markdown", labels: ["bug"], … }`; `feature.yml` gives `kind: "form"` with sections `Problem` (required) and `Notes` (not required), the `markdown` element skipped; `templateConfig.blank_issues_enabled: false`; with no repository templates and a private `acme/.github`, `.github` templates are not read.
- [ ] R29: default stub → `capabilities.client` and `capabilities.host` all true; `GH_STUB_DATA=capabilities-old` (edit help without `--add-sub-issue`, introspection without `blockedBy`) → `client.subIssues: false`, `host.blockedBy: false`.
- [ ] R20: `GH_STUB_SCOPES=repo,read:project` still reads the boards.
- [ ] P7: a failing labels call (`GH_STUB_FAIL=404@api repos/acme/widgets/labels`) keeps the previous `labels` and adds a `warnings[]` entry; a failing repository call → exit 1 with `failure.message` (its class is added by Task 9).
- [ ] C15: refresh `acme/a` then `acme/b`, then `--load --repo acme/b` returns only `b-only`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/refresh"` passes.

**Contract:**
- shape (code):
  - `lib/github-templates.js` exports `parseMarkdownTemplate(name, text)` → `{ name, file, kind: 'markdown', about, title, labels[], assignees[], type, projects[], headings: [{ level, text }], body }`; `parseIssueForm(name, text)` → `{ …, kind: 'form', sections: [{ id, label, type, required }] }`; `parseTemplateConfig(text)` → `{ blank_issues_enabled: boolean|null }`; `parseFormYaml(text)` (narrow indentation parser: scalars, `- ` list items, nested maps; no anchors or flow maps except `[a, b]`).
  - github.js `refresh(repo, sections, flags)`: per section, the call(s) from Task 2's table; `issueTemplates` resolution order R11 (repository → public `<owner>/.github` → shipped dir `skills/github-sdlc/templates`, empty while absent); `issueTypes` `null` when the owner has none; `projects` per `config.github.projects` entry via `Q_PROJECT`; `capabilities = { client: { subIssues, blockedBy, issueType, duplicateOf }, host: { subIssues, blockedBy, issueType, orgIssueTypes, projectsV2 } }`.
  - P7 output `{ saved, cachePath, counts: { labels, milestones, assignableUsers, issueTemplates, issueTypes, projectFields }, warnings, errors }`.
- names: as above; `Q_ASSIGNABLE`, `Q_ISSUE_TYPES`, `Q_PROJECT`, `Q_ISSUE_FIELDS` constants.
- mirror: `jira.js` `assembleCache` :810 and `saveCache` :707 (section merge, write).
- decisions: write via a temp file and rename in the same directory, so a crash never leaves half a cache; sections not named in `--sections` are copied from the previous cache object unchanged; `fetchedAt` = ISO time of this refresh.
- sync: part 2's `--check-payload` reads `issueTemplates[].headings`, `sections`, `labels`; Task 7's `CACHE_SECTIONS`.

Cache delta (R5) written by a full refresh:

```diff
+ { "schemaVersion": 1, "fetchedAt": "2026-11-12T…Z", "fetchedBy": "alice",
+   "repo": { "id": "R_1", "nameWithOwner": "acme/widgets", "hasIssuesEnabled": true, "visibility": "public" },
+   "labels": [ { "name": "bug", "color": "d73a4a", "description": "…" }, … ],
+   "milestones": [ { "number": 1, "title": "v1.0", "state": "open", "dueOn": null } ],
+   "assignableUsers": [ { "login": "alice", "name": "Alice A" }, … ],
+   "issueTemplates": [ { "file": "bug.md", "kind": "markdown", "labels": ["bug"], "headings": […], … }, … ],
+   "templateConfig": { "blank_issues_enabled": false },
+   "issueTypes": [ { "id": "IT_1", "name": "Bug" }, … ],
+   "projects": [ { "owner": "acme", "number": 2, "id": "PVT_2", "title": "Roadmap", "fields": [ { "id": "PVTSSF_1", "name": "Status", "dataType": "SINGLE_SELECT", "options": [ { "id": "OPT_1", "name": "Todo" }, … ] }, … ] } ],
+   "capabilities": { "client": { … }, "host": { … } } }
```

---

### Task 9: `--view`, `--search` and the failure classifier

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6, Task 8
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--view <n>`, `--search --query-file`, `classifyGhFailure`, read retry
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/view`, `/search`, `/failure` cases
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/query-bug.txt`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/query-flag.txt`

**Notes:** The classifier is defined here because `--view` is its first user; part 2's `--apply` reuses it unchanged (R31). Reads may target any readable repository (R2). Evidence: F-gh-account-links-mcpfailure-lib-reuse-18, -19 (the Jira classifier maps 403 to auth, so GitHub needs its own order).

**Acceptance criteria:**
- [ ] P9/R22: `--view 7` returns title, body, state, stateReason, labels, milestone, assignees, type, parent, subIssues, dependencies, project field values, url, `isPullRequest: false` and three comments newest last; `--view 20` → `isPullRequest: true` (R24); `--view 1 --repo acme/other` is not refused for R2.
- [ ] E6: `--view 999` → exit 1, `failure.class: "not-found"`.
- [ ] E9: `GH_STUB_FAIL=timeout@api repos/acme/widgets/issues/7` with `SDLC_GH_TIMEOUT_MS=500` → `failure.class: "transport"` after exactly two issue-7 calls in the log.
- [ ] R31/E5: `rate-limit` → `failure.class: "rate-limit"` and `resetAt`; `secondary-rate-limit` (403) → `rate-limit`, not `permission`; `403` → `permission`; `401` → `auth`; `422` → `validation`; `scope` → `auth` with hint `gh auth refresh -s project`.
- [ ] C13: a `pat` failure returns `[REDACTED]` in `failure.message`.
- [ ] P7: `--refresh` with the repository call failing 404 → exit 1 with `failure.class: "not-found"` (Task 8's failure path now goes through `classifyGhFailure`).
- [ ] A13/P10/R22: `--search --query-file <query-bug.txt>` (`label:bug`) sends one `--raw-field=q=label:bug repo:acme/widgets is:issue` argv element; `query-flag.txt` (`--help label:bug`) reaches the stub as query text; `--search` without `--query-file` → exit 1 naming the flag; results capped at `SEARCH_LIMIT_MAX` with `truncated`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/view"` and `--filter-pattern "github-sdlc/search"` pass.

**Contract:**
- shape (code): `classifyGhFailure({ status, stderr, timedOut })` → `{ class, httpStatus, message, resetAt?, hint? }`; `message = redact(stderr line)` from `lib/mcp-failure.js`; `readWithRetry(args)` retries a read once on `transport` only.
- names: `classifyGhFailure`, `readWithRetry`, `--view`, `--search`.
- mirror: `classify` at `plugins/sdlc-utilities/scripts/lib/mcp-failure.js:122-157` (ordered rules).
- decisions: search adds `repo:<o>/<r>` unless the query has `repo:` or `org:`, and always adds `is:issue`; the query file is read as UTF-8 and trimmed.
- sync: part 2's `--apply` uses `classifyGhFailure` and the same class set as `GH_CLASSES` (Task 6).

Failure classes (R31), checked in this order:

| Condition | Class | Extra |
|---|---|---|
| `timedOut` or spawn error | `transport` | |
| text `rate limit` (primary or secondary) | `rate-limit` | `resetAt` from the text, else `gh api rate_limit` |
| text `requires the '…' scope` / `missing required scopes` | `auth` | `hint: gh auth refresh -s <scope>` |
| HTTP 401 / `not logged in` / `expired` | `auth` | |
| HTTP 403 | `permission` | |
| HTTP 404 / `Could not resolve` | `not-found` | |
| HTTP 422 / `not found` for label, milestone, user, project value | `validation` | |
| `unknown flag` / `unknown command` | `capability` | |
| anything else | `unknown` | |

---

### Task 10: `--validate-links`

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 5, Task 9
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--validate-links --file <p>`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/links` cases, including the online G8 case
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/links-gh.md`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/links-ghe.md`
- Create: `docs/plans/2026-11-12-lean-w5b-github-skill.md`

**Notes:** P12 needs existence-only checks with the acting account's token, which Task 5's `ctx.github` provides; this task only wires it (F-gh-account-links-mcpfailure-lib-reuse-15 to -17). The plan file is listed here because ship stages only files named in the plan (project notes).

**Acceptance criteria:**
- [ ] G8: with `SDLC_LINKS_OFFLINE=1`, `links-gh.md` (links `<https URL: github.com/acme/widgets/issues/4>`) exits 0; the online G8 case (no `SDLC_LINKS_OFFLINE`, `GH_STUB_FAIL=404@api repos/acme/widgets/issues/4`) exits 1 and stderr names the URL.
- [ ] P12: with `--repo ghe.acme.test/acme/widgets` and offline unset, `links-ghe.md` is checked through `api repos/acme/widgets/issues/4 --hostname=ghe.acme.test --silent` in the call log.
- [ ] A cross-repository link `acme/other#3` gives no identity violation.
- [ ] Exit 0 clean, 1 violations (list on stderr), 2 crash.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/links"` passes, and `--filter-pattern "github-sdlc/c17"` still passes.

**Contract:**
- shape (code): `validateLinksSub(repo, file)` → `validateLinks(text, { github: { host, owner, repo: name, env: ghEnv() } })`; stderr `formatViolations(violations)`; stdout/`--output-file` `{ ok, violations, skipped }`.
- names: `--validate-links`, `--file`.
- mirror: `jira.js` `validateBodySubcommand` :1105 (async, `.catch` → exit 2).
- decisions: the online G8 case is the only dataset case without `SDLC_LINKS_OFFLINE=1` and its description contains `online G8` (C17).
- sync: Task 5 `ctx.github` shape.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code task adds exec cases (git-lib, config-load, links, mcp-failure, github-sdlc); Task 1 is spec-only |
| no-ci-bypass | error | PASS | No step skips or disables a check |
| no-auto-eval | error | PASS | Only targeted `--filter-pattern` runs of the exec-only config |
| skill-docs-required | error | PASS | No SKILL.md in this plan (part 2) |
| no-scope-creep | warning | PASS | The plan file in Task 10 is required by the project notes (ship stages only listed files) |
| single-responsibility-tasks | warning | PASS | One deliverable per task |
| scripts-over-llm-logic | error | PASS | All logic is in scripts and libs |
| yagni | warning | PASS | The post-failure recovery helper moved to part 2, where `--apply` uses it |
| cross-skill-consistency | error | PASS | Old helpers unchanged; existing pr, jira and links cases kept as regression |
| pr-link-github-issue | error | PASS | Not applicable: #9345 is an internal register id (Key Decisions) |
| dry | warning | PASS | Redaction, classification and account selection reused through shared libs |
| kiss | warning | PASS | Choices justified in Key Decisions |
| spec-first | error | PASS | Spec lands in Task 1; no SKILL.md change |
| project-agnostic | error | PASS | Changes ship in plugin scripts; the schema is the published config schema |
| flag-coherence-cross-skill | error | PASS | No skill-to-skill dispatch added |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gates added |
| flag-resolution-single-source | warning | PASS | Flags resolve once in github.js `parseArgs` |
| state-premise | error | PASS | Context names the root problem |
| smallest-viable-cut | warning | PASS | Split into 5b-1 and 5b-2; extras justified in Deviations |
| failure-audience | warning | PASS | Blast radius named in Context |
| explicit-non-goals | warning | PASS | Non-goals listed in Context |
| ambiguity-stops-and-asks | error | PASS | Choices recorded in Key Decisions and Decisions taken without the owner |
| state-machine-idempotency | error | PASS | `--clear` twice, cache reasons and refresh-by-section cases |
| agent-dispatch-script-driven | error | PASS | No agent dispatch |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence table in Key Decisions; `--output-file` keeps the bare sibling form |
| workspace-mode-compatibility | error | PASS | Key Decisions: `resolveSdlcRoot`, cache under HOME, no working-tree state |
| prompt-cache-hit-ratio | warning | PASS | No dispatched prompt changes |

## Suggested Review Dimensions

### UPDATE: security-review (B1, B2)

**Why:** Task 3 adds getGhTokenFor and selectGhAccountForTarget which pass the token as env.GH_TOKEN; Task 6 adds token redactors; Task 7 holds the token in a module variable (R30, C20).

**Severity hint:** high

**Patch:** Check per-process GH_TOKEN handling with no gh auth switch, argv-only execFile with no shell, redaction of ghp_* and github_pat_* tokens, and that tokens are never logged or persisted.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Check per-process GH_TOKEN handling with no gh auth switch, argv-only execFile with no shell, redaction of ghp_* and github_pat_* tokens, and that tokens are never logged or persisted.

### UPDATE: runtime-contract (B1)

**Why:** Task 7 defines a new CLI, Task 6 adds --source github, Task 5 adds ctx.github and Task 3 adds tokenScopes to probeGhAuth, all contracts that pr-sdlc, jira-sdlc and ship-sdlc callers depend on.

**Severity hint:** high

**Patch:** Check the new CLI surface and library contracts: the github.js flags and exit codes, --source github in mcp-failure.js, ctx.github in links.js, tokenScopes in probeGhAuth, and the github config section with its schema.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new CLI surface and library contracts: the github.js flags and exit codes, --source github in mcp-failure.js, ctx.github in links.js, tokenScopes in probeGhAuth, and the github config section with its schema.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 and Tasks 2-7 add docs/specs/github-sdlc.md, site/src/content-source/specs/github-sdlc.md, fixtures and datasets that the code-quality triggers do not match, so the script proposes adding trigger **/*.md.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

## Final Shape

After this plan, the repository has the accepted github-sdlc spec and the read half of its prepare script.

- `plugins/sdlc-utilities/scripts/skill/github.js` resolves the target repository, checks `gh` auth, picks the acting account without touching the user's active `gh` account, and builds, loads and clears a per-repository metadata cache. It views and searches issues and checks links. Every `gh` call is an argv array with `--flag=value` values.
- `lib/github-templates.js` parses Markdown templates and issue forms.
- `lib/git.js`, `lib/links.js`, `lib/mcp-failure.js` and `lib/config.js` gain GitHub-aware options that are off unless a caller asks for them, so pr-sdlc, ship-sdlc and jira-sdlc behave as before.
- The config schema has a `github` section.
- A stub `gh`, a case runner and a dataset test all of it with no network access.

No user can invoke the skill yet: SKILL.md, the write subcommands, the templates and the docs come in part 2.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 1 | 2 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix
Not applicable — no OpenSpec change
