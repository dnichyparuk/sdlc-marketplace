# github-sdlc Part 2 (Write Pipeline, Skill, Docs) Implementation Plan

**Commit:** `feat(#9367): github-sdlc - write pipeline, skill, templates, docs`
**Goal:**
- Add the write half of `skill/github.js`: `--init-templates`, `--check-payload` (schema, content, cache and live checks, `payloadHash`, `autoApprovable`) and `--apply` (approved hash, re-checks, ordered writes, recovery, read-back).
- Ship the user-invocable skill: SKILL.md, `write-ops.md`, `operations-reference.md` and the default issue templates.
- Register the skill everywhere the validators look (docs, site copy, README, `skills-meta.ts`, `cost-tiers.md`, `check-consistency.js`) and let behavioural cases reach the stub `gh` (`headless-case.js`).
**Architecture:** Every write decision that can be made by code is made by `github.js` (`scripts-over-llm-logic`): the payload schema, the generated `gh` argv, the auto-approval class, the hash that binds the approval to the payload, and the re-checks right before each write. SKILL.md only classifies the request, fills a template, shows the critique and the approval view, and runs the script. Content checks (headings, placeholders, mentions, references) are a pure module, `lib/github-content.js`. Depends on part 1 (`docs/plans/2026-11-12-lean-w5b-github-skill.md`, #9345) being merged.
**Source:** docs/specs/github-sdlc.md
**Verification:** cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>

---

## Context

**What problem does this change solve?**

Part 1 gives `github.js` a read path, but nothing can write a GitHub issue and no user can call the skill. The root problem: a model that writes GitHub issues can notify people, link the wrong issue or post on a pull request. The spec answers with a write path the script controls. The model may only propose a payload. The script checks it, the user approves an exact hash, and the script re-checks it right before each write.

**What prompted this change now?**

The owner accepted the spec (#9345) on 2026-11-11/12. The wave was split because it is too large for one ship run. This is part 2 (#9367).

**What does success look like?**

- `--check-payload` reports every finding of P11 for every write class, with `payloadHash`, `autoApprovable` and `commands[]`.
- `--apply` writes only an unchanged, clean, approved payload, in order, and reports applied, failed, unknown and not-run items.
- `/sdlc:github-sdlc` is listed in the `/` menu and documented, and all five validators pass.

**Who fails if this ships wrong (blast radius):**

- Every consumer project's GitHub repositories: a wrong write notifies people, closes or links the wrong issue, or writes to a pull request.
- Callers that pass `--auto` (for example ship-sdlc): a wrong auto-approval class lets a write through with no question.
- The plugin's own validators and site build, if a registration surface is missed.

**Non-goals (intentionally not built here):**

- setup-sdlc support for the `github` section (deferred, I10).
- Comment edit or delete, issue delete, transfer, lock, pin; label or milestone delete (C3).
- Any pull-request write (C4, R24).
- Running the behavioural or headless suites, or any live GitHub write (owner-initiated only).
- error-report-sdlc changes (I6).

## Research Findings

This plan builds on part 1's research (its `## Research Findings`) and the same discovery brief (planning-session context, cited as `F-<dim>-<n>`). P = `plugins/sdlc-utilities`.

- **Sibling skill (F-jira-sdlc-sibling-pattern-1 to -3).** `P/skills/jira-sdlc/` has `SKILL.md` (453 lines), `write-ops.md` (95), `operations-reference.md` (236), `REFERENCE.md`, `EXAMPLES.md`, `templates/` and `lib/`. Its frontmatter (`SKILL.md:1-7`) has `name`, `description`, `user-invocable: true`, `argument-hint`, `model: sonnet`. `P/skills/jira-sdlc/lib/template-fingerprint.js` exports `extractHeadings`, which `lib/github-content.js` can reuse; `placeholder-detect.js` has Jira rules that differ from R13, so it is not reused.
- **Validator registration (F-new-skill-validator-registration-1 to -6).** `.claude/skills/validate-plugin-consistency/check-consistency.js` hardcodes `SKILL_TO_SCRIPT` (:174-187) and `USER_INVOCABLE_SKILLS` (:194-205). With `github-sdlc` → `skill/github.js` registered, SKILL.md must run `node "<PLUGIN_ROOT>/scripts/skill/github.js"` in a bash block (rule at :424), mention `--output-file` (:456), `EXIT_CODE` (:473) and `$ARGUMENTS` (:491). `check-docs-consistency.js` checks the `skills-meta.ts` entry and the doc's template sections against `docs/skill-doc-template.md`. `validate-cost-tiers.js` needs a `docs/cost-tiers.md` §3 row whose model equals the SKILL.md `model:`. `validate-discovery.js` PD11–PD14 need frontmatter `name` and `description`, and every referenced sibling file and script to exist.
- **Surfaces.** README skills table row at `README.md:53` (jira). `site/src/data/skills-meta.ts` entry at :222-240 (jira) with `slug`, `command`, `category: 'integrations'`, `userInvocable`, `tagline`, `pipeline[]`, `connections[]`. `docs/cost-tiers.md` §3 row order is alphabetical (github-sdlc between `execute-plan-sdlc` :27 and `harden-sdlc` :28); §5 holds tuning subsections. `docs/cost-tiers.md` and its site copy are byte-identical today.
- **Headless provider (F-exec-test-harness-gh-stub-4, -7).** `tests/promptfoo/providers/headless-case.js` reads only `scaffold`, `allowed_tools`, `timeout_seconds`, `max_budget_usd`, `tier`, `snapshot_files` (:7-14); `runClaude` builds `env` from `process.env` minus `CLAUDECODE` (:29-30). Its exec tests run through `tests/promptfoo/scripts/run-headless-case-stub.js` with a stub `claude`, in `datasets/headless-runner-exec.yaml`. Headless datasets are registered in `promptfooconfig-headless.yaml` (:16-18); fixture kinds live in `tests/promptfoo/fixtures-headless/build-fixture-repo.js` (`FIXTURES`, usage line :20).
- **Part 1 surfaces this plan builds on.** `github.js` (subcommand switch, `emit`, `gh()`, `classifyGhFailure`, `CACHE_SECTIONS`, constants), `lib/github-templates.js`, `lib/git.js` `execGh` and `selectGhAccountForTarget`, `lib/mcp-failure.js` `redact` and `appendTelemetry(…, 'github')`, the stub `gh` (`GH_STUB_*` env, scenario `extends`) and `run-github-case.js`.
- **Re-verification.** Part 1 is not merged at HEAD f7e1ecb, so every item reproduces by construction; this plan's ship must start from a base that holds part 1.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Default templates | no | ships `bug.md` and `feature.md` | the spec names no default set; these two cover the R11–R15 rules (Markdown with Acceptance Criteria, and the list form) |
| Payload fixtures | no | one JSON file of named payloads per task, written to a temp file by a new runner token `@PAYLOAD:<file>#<name>@` | script_args split on whitespace; one file per payload would mean 60+ fixture files |
| R33 trigger check | no | an exec case through a runner mode `--check-triggers` | the spec asks for "a check over the description"; no existing validator compares two skills' triggers |
| Behavioural cases | no | a small headless dataset (`headless-github.yaml`, 6 cases) and a `github` fixture kind; never run here | C17 routes behavioural cases through the headless provider; runs are owner-initiated |
| Shared-file edits | no | `check-consistency.js` (repo-local validator) gains `github-sdlc` in two lists | the validator hardcodes the skill set; the change ships no consumer behaviour (`project-agnostic` does not apply to a repo validator) |
| Modify paths created by part 1 | no | Tasks 1–4, 6 and 13 modify `github.js`, `github-sdlc-exec.yaml` and `run-github-case.js`, which part 1 creates | the plan-format check PF13 fails on these paths until part 1 merges; it passes once this plan's ship starts from a base with part 1 |
| Test-data URLs in this plan | no | written as `<https URL: host/path>`; fixtures and cases use the real `https://host/path` form | the plan's link gate checks every URL against this repository; the fake `acme` URLs exist only in the stub |
| PR linking | no | names #9367 and #9345 in the PR body with no `Fixes`/`Closes` keyword | internal register ids (project notes); overrides `pr-link-github-issue` |

## Decisions taken without the owner

No owner was available. Each choice below took the recommended option.

1. Ship two default templates, `bug.md` and `feature.md` (Deviations).
2. `AUTO_ARGV_SHAPES` is a list of argv matchers in `github.js`; `--check-payload` and `--apply --auto` both call one `isAutoApprovable(commands, blockers)` (Key Decisions).
3. Content checks live in a new pure module `lib/github-content.js`, not in `github.js` (Key Decisions).
4. The body temp file of `--apply` is created by the script in `os.tmpdir()` and removed after the run; `--dry-run` keeps it and reports its path so the R21 byte check can read it.
5. SKILL.md frontmatter `model: sonnet`, like jira-sdlc; `cost-tiers.md` documents it.
6. The behavioural dataset has six cases, chosen from the spec's behavioural acceptance lines that guard writes (R9, R25, R27, R34/R35, R10, C19).

## Key Decisions

- **The script decides; the skill shows.** The R34 class, the hash, the payload schema and the argv are code in `github.js`. The alternative is to describe the rules in SKILL.md and let the model decide. That fails the `scripts-over-llm-logic` guardrail and R36's point: an approval must bind to bytes the script can re-check. SKILL.md reads `autoApprovable`, `payloadHash` and `commands[]` from the script and never computes them.

- **One argv builder, used three times.** `buildCommands(op, cache, live)` produces the `gh` argv for every write class. `--check-payload` reports it as `commands[]`; `--apply --dry-run` returns it; `--apply` runs it. `isAutoApprovable` matches the same argv against `AUTO_ARGV_SHAPES`. So the auto-approval decision is made from exactly what would run, not from the payload's `op` (R34).

- **Content checks in a pure module.** Placeholders, headings, mentions, references, duplicate markers and cross-repository references are text rules with many edge cases (code spans, fences, HTML comments, blockquotes). A pure module (`lib/github-content.js`) keeps them out of the I/O code and is tested through `--check-payload`. The alternative, reusing jira-sdlc's `placeholder-detect.js`, has different bracket rules from R13; only `extractHeadings` is reused (`dry`).

- **Live checks run twice on purpose.** `--check-payload` runs `liveChecks` so the approval view is correct. `--apply` runs them again right before each op's write, because time passes between approval and apply (R37). The second run can stop one op without stopping the ops already applied.

- **Account recovery never switches the user's account.** On a permission failure, `--apply` calls `recoverGhAccountForTarget` (Task 5) once per run, sets the new token only for this process's children, and marks the run `accountSwitch`. Under `--auto` the retry then stops with a `pendingQuestion` (E4, R34).

- **Templates ship with SKILL.md.** A `skills/github-sdlc/` directory without SKILL.md fails `validate-discovery` (PD11). Task 1 adds the templates and Task 7 adds SKILL.md in the same plan; the validators run after both.

- **Flag names agree with the other prepare scripts.** A grep of `plugins/sdlc-utilities/scripts/skill/*.js` at HEAD for each new flag gives:

  | Flag | Other scripts that define it | Same meaning |
  |---|---|---|
  | `--init-templates`, `--templates-dir` | `jira.js` | yes: copy default templates; override the shipped template directory |
  | `--check-payload`, `--input` | `jira.js` | yes: validate one write payload read from a file |
  | `--dry-run` | `ship.js`, `migrate-config.js`, `pr-recover-gh-account.js` | yes: compute and report, change nothing |
  | `--auto` | commit, execute, openspec-step, pr, received-review, review, version, ship | yes: no question; anything that needs one stops (R35) |
  | `--apply`, `--expect-hash` | none | new names, no conflict |

- **`pr-link-github-issue` does not apply.** #9367 and #9345 are internal register ids, not GitHub issues of this repository (project notes); a `Fixes` keyword would close an unrelated issue.

- **Workspace modes.** Nothing here writes into the working tree except `--init-templates` (current checkout's `.github/ISSUE_TEMPLATE/`, only when the target is the checkout's origin, R10) and the telemetry log under `resolveSdlcRoot()`. Both behave the same in `ship.workspace=branch` and `ship.workspace=worktree`; temp files live in `os.tmpdir()`.

## Contract Examples

**code** (Task 2):

```markdown
**Contract:**
- shape (code): `buildCommands(op: object, cache: object, live: object): string[][]`; `payloadHash(input: object): string` (sha256 hex of `canonicalJson(input)`, keys sorted, no whitespace); `isAutoApprovable(commands: string[][], blockers: string[]): boolean`.
- names: `buildCommands`, `canonicalJson`, `payloadHash`, `AUTO_ARGV_SHAPES`, `isAutoApprovable`.
- mirror: `jira.js` `checkPayload` at `plugins/sdlc-utilities/scripts/skill/jira.js:912`.
- decisions: every flag value as `--flag=value` (C18).
- sync: Task 6 `--apply` runs the same `commands[]`.
- example: comment on 5 → `[["issue","comment","5","--repo=github.com/acme/widgets","--body-file=<tmp>"]]`.
```

**docs** (Task 8):

```markdown
**Contract:**
- shape (docs): CREATE `docs/skills/github-sdlc.md` from `docs/skill-doc-template.md`: Overview, Usage, Flags, Examples, Prerequisites, What It Creates or Modifies, Related Skills; audience: end users.
- names: the seven section headings; flags A1–A5, A9.
- mirror: `docs/skills/jira-sdlc.md`.
- decisions: user-facing prose; spec ids only in a short "Contract" pointer line.
- sync: `site/src/content-source/skills/github-sdlc.md` byte copy; README row links it.
```

## Tasks

### Task 1: Default templates and `--init-templates`

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/skills/github-sdlc/templates/bug.md`
- Create: `plugins/sdlc-utilities/skills/github-sdlc/templates/feature.md`
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--init-templates [--templates-dir <p>]`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/init-templates` and `github-sdlc/refresh-shipped` cases
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-home-decoy/.claude/plugins/cache/x/sdlc/9.9.9/skills/github-sdlc/templates/decoy.md`

**Notes:** The shipped directory is found from the script's own path only, so a decoy plugin under `HOME` can never be picked up (R-templates-root). Task 1 exports `SHIPPED_TEMPLATES_DIR` and makes part 1's refresh use it, so the path is computed once. Evidence: F-jira-sdlc-sibling-pattern-1 (jira `initTemplates`), F-new-skill-validator-registration-6 (PD11).

**Acceptance criteria:**
- [ ] A3/P15: in a workspace without `.github/ISSUE_TEMPLATE/`, `--init-templates` creates `bug.md` and `feature.md` and lists them in `created[]` with `targetDir`; a second run lists them in `skipped[]` and changes no file.
- [ ] A9: `--init-templates --templates-dir @FIX:github-sdlc-home-decoy/.claude/plugins/cache/x/sdlc/9.9.9/skills/github-sdlc/templates@` copies only `decoy.md`.
- [ ] R-templates-root: with `script_home` = the decoy home and no `--templates-dir`, only the shipped names are copied.
- [ ] R10: `--init-templates --repo acme/other` from a checkout of `acme/widgets` exits 1 with an `errors[]` entry.
- [ ] R11 step 3: with the repository template listing failing 404 and `acme/.github` private, `--refresh` saves the shipped templates as `issueTemplates`.
- [ ] `bug.md` has front matter `name`, `about`, `labels: [bug]` and sections `## Summary`, `## Steps to Reproduce`, `## Expected Behaviour`, `## Acceptance Criteria` (task-list items only); `feature.md` has `## Problem`, `## Proposal`, `## Acceptance Criteria`; both use `{placeholder}` markers only.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/init-templates"` passes.

**Contract:**
- shape (code): `initTemplates(projectRoot, repo, templatesDir)` → `{ created[], skipped[], targetDir }`; `SHIPPED_TEMPLATES_DIR = path.join(__dirname, '..', '..', 'skills', 'github-sdlc', 'templates')`; refuses unless `parseRemoteOwner(projectRoot)` equals the target repository; never overwrites (`fs.copyFileSync` with `COPYFILE_EXCL`).
- names: `--init-templates`, `--templates-dir`, `SHIPPED_TEMPLATES_DIR`.
- mirror: `jira.js` `initTemplates` at `plugins/sdlc-utilities/scripts/skill/jira.js:1001-1045`.
- decisions: two templates (Deviations); `flags.initTemplates` set in P6.
- sync: part 1's refresh reads `SHIPPED_TEMPLATES_DIR` for R11 step 3.

---

### Task 2: `--check-payload` core: schema, cache values, argv, hash, auto class

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--check-payload --input <p>`: P16 schema, R2, R17, R20, R23, R29, `buildCommands`, `payloadHash`, `AUTO_ARGV_SHAPES`, `autoBlockers`
- Modify: `tests/promptfoo/scripts/run-github-case.js` — token `@PAYLOAD:<file>#<name>@` writes that named payload to a temp file
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/payloads-core.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/payload-core` cases

**Notes:** This task fixes the argv every later task runs; the shape table below is the single source. Content-based blockers (`mentions`, `duplicateMarker`, `crossRepoRefs`) come in Task 3; live findings in Task 4. Evidence: F-jira-sdlc-sibling-pattern-1 (jira `checkPayload` shape), F-gh-account-links-mcpfailure-lib-reuse-1, -3 (no argv runner before part 1).

**Acceptance criteria:**
- [ ] P16: comment payload with extra `labels` → exit 1, `unknownKeys: ["labels"]`; without `repo` → `missingKeys: ["repo"]`; `number` `-3`, `1.5`, `"12"` → `invalidNumbers` naming `number`; a bulk whose second op has an unknown key reports it on that op only; `op: "delete"` → `unknownOp` (C3).
- [ ] R2: `github.repos: ["acme/widgets"]` and a create for `acme/other` → `repoNotAllowed: true`; a link `addParent: "<https URL: github.com/acme/other/issues/3>"` → `notAllowedRefs` naming it; `related` to the same URL → no `repoNotAllowed`.
- [ ] R17/G9/R20/R6: an unknown label → `unknownLabels` and `stale: ["labels"]`; unknown milestone, assignee (`@me` and `@copilot` accepted), type, project option → the matching finding; a board not in `github.projects` → finding; `scopes.project: false` and a project payload → finding with hint `gh auth refresh -s project` (E8).
- [ ] R29: with `capabilities.client.subIssues: false`, a sub-issue link → `unsupported: ["client.subIssues"]`; with `host.blockedBy: false`, a dependency link → `unsupported: ["host.blockedBy"]`.
- [ ] R23: `BULK_MAX + 1` ops → `bulkTooLarge: true` (the case reads `BULK_MAX` from the exports).
- [ ] R18/R19/R20/R21/R17 argv: the shape table rows below appear in `commands[]` for their payloads; `createLabels` lists `gh label create` first; C18: label `-R=evil/repo` gives one element `--add-label=-R=evil/repo`.
- [ ] R36: two inputs differing only in key order and whitespace give the same `payloadHash`.
- [ ] R34/C2: `autoApprovable: true` for a plain comment, a label-only edit with cached labels, close `not planned`, close `completed` with a comment, reopen; `false` with a matching `autoBlockers[]` entry for create, title edit, sub-issue link, close `duplicate`, `auth.accountSwitch.switched` true, `createLabels`, an `Iteration` set, a bulk, and a comment whose argv carries an extra flag outside the shape; create is `false` with and without `--auto`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/payload-core"` passes.

**Contract:**
- shape (code): `checkPayload(input, ctx)` → P11 object (fields below); `OP_KEYS` per P16; `buildCommands(op, cache, live)`; `canonicalJson(v)`; `payloadHash(input)`; `AUTO_ARGV_SHAPES` (below); `isAutoApprovable(commands, blockers)`; exports `BULK_MAX`, `AUTO_ARGV_SHAPES`. Exit 0 no finding, 1 any finding or bad input, 2 crash (P11).
- names: as above; finding keys exactly as P11.
- mirror: `jira.js` `checkPayload` at `plugins/sdlc-utilities/scripts/skill/jira.js:912-990`.
- decisions: run-time values are late-bound placeholders: `--url=<new-issue-url>` (from the `issue create` output) and `--id=<item-id>` (from the `project item-add` output, or from `live` for an existing item) appear literally in `--check-payload` output; `--apply` substitutes them and runs a dependent command only after the command that produces the value succeeded; `autoApprovable` and `autoBlockers` are not findings and do not change the exit code; a bulk is never auto-approvable; the body temp path in `commands[]` is the literal `<tmp>` placeholder in `--check-payload` output.
- sync: Tasks 3, 4 and 6; SKILL.md (Task 7) reads `payloadHash`, `autoApprovable`, `autoBlockers`, `commands`.

Write argv shapes (`<R>` = `--repo=<host>/<owner>/<repo>`):

| Payload | argv |
|---|---|
| create | `issue create <R> --title=<t> --body-file=<tmp> [--label=<l>]… [--milestone=<title>] [--assignee=<a>]… [--type=<t>] [--parent=<n>]` then `project item-add <n> --owner=<o> --url=<new issue url>` per `projects` entry |
| edit | `issue edit <n> <R> [--title=…] [--body-file=<tmp>] [--add-label=…]… [--remove-label=…]… [--milestone=…] [--type=…]` |
| state close | `issue close <n> <R> --reason=completed\|not planned` or `--reason=duplicate --duplicate-of=<n>`; a `comment` adds `issue comment <n> <R> --body-file=<tmp>` before it (R18) |
| state reopen | `issue reopen <n> <R>`, comment first as above |
| comment | `issue comment <n> <R> --body-file=<tmp>` |
| link | `issue edit <n> <R> [--parent=<n>] [--remove-parent] [--add-sub-issue=<n>]… [--remove-sub-issue=…] [--add-blocked-by=…] [--remove-blocked-by=…] [--add-blocking=…] [--remove-blocking=…]`; `related` → `issue comment <n> <R> --body-file=<tmp>` with body `Related: <ref>` |
| assign | `issue edit <n> <R> [--add-assignee=…]… [--remove-assignee=…]…` |
| project | `project item-add <pnum> --owner=<o> --url=<issue url>` (when `addItem`); `project item-edit --id=<itemId> --project-id=<pid> --field-id=<fid>` + one of `--single-select-option-id=`, `--text=`, `--number=`, `--date=`, `--iteration-id=`, or `--clear` |
| createLabels | `label create <name> <R> [--color=…] [--description=…]` first |

`AUTO_ARGV_SHAPES` (every argv of `commands[]` must match one, else `autoApprovable: false`):

| Class | Allowed argv |
|---|---|
| (a) comment | `issue comment <n> <R> --body-file=<tmp>` and nothing else |
| (b) labels | `issue edit <n> <R>` followed only by `--add-label=<cached>` / `--remove-label=<cached>` |
| (c) state | `issue close <n> <R> --reason=completed` or `--reason=not planned`; `issue reopen <n> <R>` |
| (d) status | `project item-edit --id=<existing item> --project-id=<pid> --field-id=<cached Status id> --single-select-option-id=<cached option>` |

P16 key sets (`OP_KEYS`; any other key → `unknownKeys`; `repo` and, except for `create`, `number` required → `missingKeys`):

| op | keys |
|---|---|
| `create` | `op`, `repo`, `template`, `title`, `body`, `labels`, `milestone`, `assignees`, `type`, `parent`, `projects`, `createLabels` |
| `edit` | `op`, `repo`, `number`, `template`, `title`, `body`, `addLabels`, `removeLabels`, `milestone`, `type`, `createLabels` |
| `state` | `op`, `repo`, `number`, `action`, `reason`, `duplicateOf`, `comment` |
| `comment` | `op`, `repo`, `number`, `body` |
| `link` | `op`, `repo`, `number`, `addParent`, `removeParent`, `addSubIssues`, `removeSubIssues`, `addBlockedBy`, `removeBlockedBy`, `addBlocking`, `removeBlocking`, `related` |
| `assign` | `op`, `repo`, `number`, `addAssignees`, `removeAssignees` |
| `project` | `op`, `repo`, `number`, `project`, `addItem`, `field`, `value`, `clear` |
| bulk | `{ "ops": [ … ] }`, `ops` only |

P11 output for one op (`--check-payload`; a bulk returns `{ ops: [<this object>…], bulkTooLarge, payloadHash, autoApprovable: false, autoBlockers: ["bulk"] }`). Tasks 3 and 4 fill the keys marked `…T3` and `…T4`; this task emits them with empty or `false` values:

```json
{ "unknownKeys": [], "missingKeys": [], "invalidNumbers": [], "unknownOp": false,
  "placeholders": [], "unknownHeadings": [], "missingRequired": [], "templateMissing": false, "templateSource": "repo",
  "unknownLabels": [], "unknownMilestone": false, "unassignable": [], "unknownType": false, "unknownProjectValue": [],
  "mentions": [], "refs": [], "stale": [], "isPullRequest": false, "noOpState": false, "selfLink": false,
  "repoNotAllowed": false, "notAllowedRefs": [], "unsupported": [], "titleTooLong": false, "nonChecklistAcceptance": [],
  "bulkTooLarge": false, "live": {}, "payloadHash": "3f1c…", "autoApprovable": true, "autoBlockers": [],
  "commands": [["issue", "comment", "5", "--repo=github.com/acme/widgets", "--body-file=<tmp>"]],
  "warnings": [], "errors": [] }
```

(`placeholders`, `unknownHeadings`, `missingRequired`, `templateMissing`, `mentions`, `refs`, `titleTooLong`, `nonChecklistAcceptance` …T3; `live`, `isPullRequest`, `noOpState`, `selfLink` …T4.)

`autoBlockers` values: `class`, `bulk`, `createLabels`, `duplicate`, `accountSwitch`, `mentions`, `duplicateMarker`, `crossRepoRefs`, `notExistingItem` (the last four filled by Tasks 3–4).

---

### Task 3: Content checks: templates, placeholders, shape, mentions, references

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/lib/github-content.js`
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — call the content checks from `checkPayload`; add `mentions`, `duplicateMarker`, `crossRepoRefs` blockers
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/payloads-content.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/payload-content` cases

**Notes:** Text rules are isolated in a pure module (Key Decisions). Headings come from part 1's `lib/github-templates.js` cache entries, so the template is never re-parsed here. Evidence: F-jira-sdlc-sibling-pattern-1 (jira's template-fingerprint lib).

**Acceptance criteria:**
- [ ] G4: create without `template` → `templateMissing: true`; R12: a create body with `## Extra` → `unknownHeadings: ["Extra"]`; an empty required form section → `missingRequired[]`.
- [ ] R13: the body `See [the docs](https://x.y)` / `- [ ] done` / `{summary}` / `<!-- Describe the bug -->` with `bug.md` holding that comment gives exactly two placeholders; title `[FEAT] Add x` gives none; `[Describe the steps]` gives one only when the template contains it.
- [ ] R15: a title over `TITLE_MAX` → `titleTooLong: true`; a prose line under `## Acceptance Criteria` → `nonChecklistAcceptance: [<line>]`.
- [ ] R16: mentions of `@alice` (prose), `@bob` (code span), `@dave` (HTML comment), `@carol` (blockquote) and `@acme/core` give `mentions[]` `alice`, `carol`, `acme/core` (`team: true`) only, each with `assignable`; one bare `#N` and one `owner/repo#N` give two `refs[]`.
- [ ] R34 blockers: a comment mentioning `@alice` → `mentions`; holding `Duplicate of owner/repo#N` → `duplicateMarker`; linking an issue in `acme/other` → `crossRepoRefs`.
- [ ] G10/C8: `--check-payload` on a comment holding `{summary}` exits 1 with and without `--auto`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/payload-content"` passes.

**Contract:**
- shape (code): `lib/github-content.js` exports `stripNonNotifying(text)` (masks code spans, fences, HTML comments), `findPlaceholders(text, templateText)` → `[{ text, kind: 'marker'|'bracket'|'comment', line }]`, `checkHeadings(body, template, { added })` → `{ unknownHeadings[], missingRequired[] }`, `findMentions(text, assignableLogins)` → `[{ login, team, assignable }]`, `findRefs(text, target)` → `[{ ref, owner, repo, number, crossRepo }]`, `findDuplicateMarker(text)` → boolean, `checkTitle(title, max)` → `{ titleTooLong, fillerOpening }`, `checkAcceptance(body)` → lines.
- names: as above.
- mirror: `extractHeadings` at `plugins/sdlc-utilities/skills/jira-sdlc/lib/template-fingerprint.js` (reused via require; `jira.js:46` already requires that file the same way, so a move would break both and show in both exec suites).
- decisions: a duplicate marker is a line that, case-insensitive, starts with `duplicate of` followed by `#N`, `owner/repo#N` or an issue URL; a same-repo issue URL elsewhere is not a marker (R34).
- sync: Task 4 passes `added` headings for edits; Task 7 shows `mentions[]` on the `Mentions:` line.

---

### Task 4: Live checks and live findings

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `liveChecks(ops)`; `noOpState`, `isPullRequest`, `selfLink`, parent cycle, edit current body, project item lookup; `live` in P11
- Create: `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/scenarios/live.json`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/payloads-live.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/payload-live` cases

**Notes:** R37 defines the only per-issue reads a write check may make; R8 forbids any metadata call here. `live.json` extends `default.json` with the project-items route and ancestor chains, so part 1's scenario stays untouched. Evidence: F-exec-test-harness-gh-stub-5, -10.

**Acceptance criteria:**
- [ ] R37: for a close payload the call log of `--check-payload` holds the state read `api repos/acme/widgets/issues/12 --hostname=github.com`.
- [ ] R18: a close for an issue the stub reports closed → `noOpState: true`, exit 1.
- [ ] R24: a comment for 20 → `isPullRequest: true`, exit 1.
- [ ] R19: `addSubIssues: [5]` on 5 → `selfLink: true`; `addParent` to a descendant → a cycle finding; a linked issue that is missing → finding.
- [ ] R12: an edit with `template: "existing"` on an issue whose body has `## Notes` → no `unknownHeadings`; adding `## Extra` → `unknownHeadings: ["Extra"]`.
- [ ] R34(d): a `Status` set on an issue already on board `acme` #2 → `autoApprovable: true`; on an issue not on the board → `autoBlockers: ["notExistingItem"]`.
- [ ] R8: with a complete cache, the call log has no `labels`, `milestones`, `assignableUsers`, `projectV2` field or `__type` call; every per-issue call is an R37 read.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/payload-live"` passes.

**Contract:**
- shape (code): `liveChecks(ops, repo)` → `{ issues: { "<o>/<r>#<n>": { exists, state, stateReason, body, isPullRequest, ancestors: [refs], projectItems: [{ id, project: { number, owner } }] } } }`; reads: `api repos/<o>/<r>/issues/<n> --hostname=<h>` (state, body, PR), `api graphql … --raw-field=query=<Q_ISSUE_LIVE>` (`parent` chain up to 10, `projectItems { id project { number owner { login } } }`).
- names: `liveChecks`, `Q_ISSUE_LIVE`, `live`.
- mirror: part 1 `--view` reads (Task 10 of part 1).
- decisions: reads are retried once on `transport` (part 1 `readWithRetry`); a live read failure is a finding with its class, never a guess (C6).
- sync: Task 6 calls `liveChecks([op])` right before each write.

---

### Task 5: Post-failure account recovery in `lib/git.js`

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/git.js` — add `isGhIssueWritePermissionError`, `recoverGhAccountForTarget`
- Modify: `tests/promptfoo/scripts/git-lib-test.js` — `--op recoverGhAccountForTarget` with an injected runner
- Modify: `tests/promptfoo/datasets/git-lib-exec.yaml` — cases for the helper

**Notes:** Part 1 added only the pre-flight helper, because the read path never recovers after a failure (`yagni`). This is the post-failure half R30 and E4 need; it reuses part 1's `execGh`, `getGhAccountsForHost`, `getGhTokenFor` and `selectAccountForOwner`, and leaves `recoverGhAccountForRepo` (pr-sdlc) untouched (F-gh-account-links-mcpfailure-lib-reuse-10, -11).

**Acceptance criteria:**
- [ ] A 422 text → `{ recovered: false, reason: "non-permission-error" }`; `alreadySwitched: true` → `reason: "already-switched"` and no `gh` call.
- [ ] A 403 text with accounts `alice` (current) and `acme` (owner match) → `{ recovered: true, account: "acme", token: "<from auth token>" }`; the injected runner saw `auth token --user=acme --hostname=github.com` and no `auth switch`.
- [ ] No other account has access → `{ recovered: false, reason: "no-account", hint: "gh auth login --hostname <host>" }`.
- [ ] The existing `pr-recover` cases pass unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "git-lib"` and `--filter-pattern "pr-recover"` pass.

**Contract:**
- shape (code): `isGhIssueWritePermissionError(text)` by the table below; `recoverGhAccountForTarget({ host, owner, repo, errorText, alreadySwitched, currentAccount, run = execGh })` → `{ recovered, account, token, reason, hint }`; candidates: owner match first, then each other account whose token passes `api repos/<o>/<r> --hostname=<h>`; never the current account; never `gh auth switch`.
- names: as above; exported from `module.exports`.
- mirror: `recoverGhAccountForRepo` at `plugins/sdlc-utilities/scripts/lib/git.js:802-985`; part 1's `selectGhAccountForTarget`.
- decisions: the token is returned only to the caller (C20); one switch per run is enforced by the caller passing `alreadySwitched`.
- sync: Task 6 calls it once per run.

| Error text | `isGhIssueWritePermissionError` | Recovery outcome |
|---|---|---|
| `HTTP 403` + `rate limit` (primary or secondary) | false | `{ recovered: false, reason: "non-permission-error" }` |
| `HTTP 403` other, `Resource not accessible`, `must have push access` | true | try candidates |
| `HTTP 404` on a `repos/<o>/<r>` path | true | try candidates |
| `HTTP 422`, timeout, anything else | false | `reason: "non-permission-error"` |
| any, with `alreadySwitched: true` | — | `reason: "already-switched"`, no call |
| candidates: owner-match account first, then each other account whose token passes `api repos/<o>/<r> --hostname=<h>`; never `currentAccount` | — | first hit → `{ recovered: true, account, token }`; none → `{ recovered: false, reason: "no-account", hint: "gh auth login --hostname <host>" }` |

---

### Task 6: `--apply`

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 4, Task 5
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/github.js` — `--apply --input <p> [--dry-run] [--expect-hash <h>] [--auto]`
- Create: `tests/promptfoo/fixtures-fs/github-sdlc-inputs/payloads-apply.json`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — `github-sdlc/apply` cases

**Notes:** `--apply` re-runs every check (G7) because the skill cannot be trusted to have run them; it is the last gate before GitHub. Evidence: F-gh-account-links-mcpfailure-lib-reuse-6, -11 (why recovery must not switch accounts), -18 to -22 (telemetry and redaction reuse).

**Acceptance criteria:**
- [ ] A10/R21: `--apply --dry-run` on a comment returns one `issue comment` argv with `--body-file=<path>`, the file content equals the payload body byte for byte, and the log has no `issue comment` call.
- [ ] G7/C8: `--apply` with an unknown label or a `{summary}` placeholder exits 1 with no `gh issue` write in the log.
- [ ] A12/R36: `--expect-hash` of the checked payload, then the title changed → `hashMismatch: true`, exit 1, no write; `--apply --auto` on a create → `notAutoApprovable: true` with `autoBlockers`, no `issue create` call.
- [ ] R37: `GH_STUB_SEQ=state12=open,closed` → `--check-payload` passes, `--apply` exits 1 with `noOpState: true` and no `issue close` call; a clean close shows a state read directly before `issue close` in the log.
- [ ] R23/E10: a three-item bulk lists three commands in order (dry run); with item 2 failing → `applied: [1]`, `failed: [2]`, `notRun: [3]`, exit 1.
- [ ] R17: `createLabels` runs `label create` before `issue create`.
- [ ] C16: no `--apply --dry-run` output, for any payload in `payloads-apply.json`, holds a `milestones` POST or a project field-create argv.
- [ ] E7: a 422 on `issue create` → `failed[0].failure.class: "validation"` and no retry inside `--apply` (the section refresh and the single retry are the skill's, Task 7).
- [ ] E4/R30/C7: a 403 on the write with accounts `alice*,acme` → `auth.accountSwitch.recovered: true`, exactly one retry, no `auth switch`; a 403 then a 422 after the switch is not tried a third time.
- [ ] E8: `scopes.project: null` and a scope failure on `project item-edit` → the `gh auth refresh -s project` hint, no retry.
- [ ] E9: a timeout on a comment write → `unknown[0].outcome: "unknown"`, exactly one `issue comment` call and one comment read-back call; a timeout on an edit → retried once.
- [ ] R31: one apply case per class gives the expected `failure.class`.
- [ ] R32/C13/C20: a retried failure appends a `gh-failure[<class>]` block to `.sdlc/learnings/log.md`; `stub-token-acme-S3CR3T` appears in none of stdout, stderr, `--output-file`, the cache file or the log after a run with an account change and a `pat` failure.
- [ ] C18: a title holding `$(touch pwned)` leaves no `pwned` file in the workspace.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/apply"` passes.

**Contract:**
- shape (code): `apply(input, { dryRun, expectHash, auto })` → P13 `{ actingAccount, applied: [{ index, number, url }], failed: [{ index, failure: { class, httpStatus, message } }], unknown: [{ index, outcome: 'unknown', readBack: { found, number, url } }], notRun: [index], hashMismatch, notAutoApprovable, commands? }`.
- names: `apply`, `IDEMPOTENT_KINDS`, `readBack`.
- mirror: part 1 `classifyGhFailure`; `recoverGhAccountForTarget` in `plugins/sdlc-utilities/scripts/lib/git.js`.
- decisions: placeholders `<tmp>`, `<new-issue-url>` and `<item-id>` from Task 2's `commands[]` are substituted here, and a command that consumes a value runs only after the command that produces it succeeded; order = hash check → class check (`--auto`) → full `checkPayload` → per op: `liveChecks([op])` → write → on failure classify; permission → recover once and retry once; transport on idempotent → retry once; transport on non-idempotent (create, comment, related) → read-back; total retries per write ≤ 1 (C7); body temp files in `os.tmpdir()`, removed at exit except under `--dry-run`.
- sync: SKILL.md (Task 7) passes `--expect-hash` always.

Apply flow per op (R36, R37, E4, E9):

| Step | Outcome | Next |
|---|---|---|
| hash differs | `hashMismatch` | stop, exit 1, no call |
| `--auto` and not auto-approvable | `notAutoApprovable` | stop, exit 1, no call |
| any P11 finding | findings | stop, exit 1, no write |
| live re-check finding | op failed with finding | later ops `notRun` |
| write ok | `applied` | next op |
| `permission`, no switch yet | recover account, retry once | `applied` or `failed` |
| `transport`, idempotent | retry once | `applied` or `failed` (`transport`) |
| `transport`, create/comment/related | read-back | `unknown` |
| other class | `failed` | later ops `notRun` |

---

### Task 7: SKILL.md, `write-ops.md`, `operations-reference.md`

**Complexity:** Complex
**Risk:** High
**Depends on:** Task 1
**Verify:** lint

**Files:**
- Create: `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md`
- Create: `plugins/sdlc-utilities/skills/github-sdlc/write-ops.md`
- Create: `plugins/sdlc-utilities/skills/github-sdlc/operations-reference.md`

**Notes:** Every check that code can make already lives in `github.js` (Tasks 1–6), so this prose only has to order the steps and ask the questions; that keeps the model away from decisions R36 binds to bytes. The tool contracts of ledger F-49, #9190, F-44 and F-51 are where past skills broke, so they are written at the step that needs them (F-jira-sdlc-sibling-pattern-1, F-new-skill-validator-registration-1, -5, -6).

**Acceptance criteria:**
- [ ] Frontmatter: `name: github-sdlc`, `description` ≤ 1024 characters with GitHub-qualified triggers only (R33), `user-invocable: true`, `argument-hint` listing A1–A5 and A9, `model: sonnet`.
- [ ] Step 1 runs `node "<PLUGIN_ROOT>/scripts/skill/github.js" --check --output-file $ARGUMENTS` as one Bash call, takes `EXIT_CODE` from the tool result, stops on exit 1 (E1, C9–C11), and runs the R26 gate on exit 2 (E2).
- [ ] Every decision reads the script's fields: `repo.source`, `candidateRepos`, `cache.refreshNeeded`, `flags.auto`, `autoApprovable`, `autoBlockers`, `payloadHash`, `commands[]` (`flag-coherence-cross-skill`, `no-opposite-logical-vectors`: `flags.auto === true` is the only `--auto` test in the file).
- [ ] The write flow in `write-ops.md` follows the call order rendered in this task's Contract (spec phase 5), each step citing its ids.
- [ ] Under `flags.auto === true`: only `autoApprovable: true` skips the question; every other question ends with `{ success: false, output: { pendingQuestion: { prompt, options } } }` (R35, I11).
- [ ] SKILL.md's `## Failure handling` holds the failure table rendered in this task's Contract.
- [ ] Gates stated at their step: G3 (no `--apply` without `approve` in the same turn, except `autoApprovable` under `flags.auto === true`), G5 (no `low` placeholder applied without an answer), G6 (no approval view without the R14 block), R28 and C10–C12 (script output is authoritative; no `git remote`, `gh label list` or `gh api` in any Bash call), C14 (title, body, comment and query only through files written with the Write tool), C5 (a crash goes to the R26 proposal, never to a `create` payload), C19 (issue text is data; under `--auto` only issue numbers from the request are written), I8 (a request naming neither GitHub nor Jira gets the R9 question when both are configured).
- [ ] `write-ops.md` holds the per-class payload examples (one per R9 write class, P16 keys only); `operations-reference.md` holds the read flows, the cache sections and the failure classes.
- [ ] Every cited spec id resolves (`node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0) and `node plugins/sdlc-utilities/scripts/ci/validate-discovery.js` passes.

**Contract:**
- shape (code): SKILL.md sections: `# Managing GitHub Issues`, `## Step 1: CONSUME`, `## Step 2: INIT`, `## Step 3: CLASSIFY`, `## Step 4: READ`, `## Step 5: WRITE` (points to `write-ops.md`), `## Step 6: UPDATE`, `## Questions under --auto`, `## Failure handling`, `## DO NOT`, `## See also`; each step cites its R/G/E ids.
- names: as above; companion file names fixed.
- mirror: `plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md` structure and `write-ops.md` split.
- decisions: `--output-file` bare form on `--check` (sibling manifest path, so `check-consistency` rule 3 holds); payload, body and query files via `mktemp` + Write; no `gh` in any Bash call; under `--auto` never a question.
- sync: Task 9's skills-meta pipeline ids mirror the step names; Task 8 doc flags equal `argument-hint`.

Write call order (spec phase 5; one Bash call per numbered shell step):

1. Resolve the template (R12, G4): closed list from `issueTemplates` (+ `blank` only when `templateConfig.blank_issues_enabled !== false`).
2. `mktemp` → Read the empty file once → Write the payload JSON (F-49, C14).
3. `node "<PLUGIN_ROOT>/scripts/skill/github.js" --check-payload --input <p> --output-file` → read findings.
4. `stale[]` non-empty → `--refresh --sections <stale csv>` once → back to 3 (R6); still unknown → ask (pick / create via `createLabels` / drop) (R17).
5. `low` placeholders → ask each (R13, G5).
6. Print `Initial:` / `Critique:` / `Final:` (R14, G6).
7. `flags.auto === true` and `autoApprovable` → skip to 9; `flags.auto === true` otherwise → `pendingQuestion` stop (R35); else approval view: payload, `Mentions:` line, `commands[]`, `as @<actingAccount>`, `payloadHash`, Copilot line when `@copilot` is assigned (R27).
8. `change <what>` → back to 1 or 2; `cancel` → 10; `approve` → 9 (G3).
9. `--validate-links --file <body file>` (G8) → `--apply --input <p> --expect-hash <payloadHash> [--auto]` (R36).
10. `rm -f <file>` for each temp file, one Bash call each (R7).

Failure table (`## Failure handling`):

| Condition | Behaviour |
|---|---|
| E1 exit 1 | show `errors[]` / findings; fix or ask; no report |
| E2 exit 2 | show stderr; R26 gate as script crash |
| E3 auth | show `probeGhAuth` hint; stop |
| E4 `permission` | `--apply` already recovered once; second failure → stop with `gh auth login` hint; under `--auto` → `pendingQuestion` |
| E5 `rate-limit` | report `resetAt`; stop |
| E6 `not-found` | ask to check number and repository (`pendingQuestion` under `--auto`) |
| E7 `validation` | `--refresh --sections <affected>` once → `--check-payload` → if clean and no retry yet, `--apply` once; second failure → R26 gate |
| E8 scope | show `gh auth refresh -s <scope>`; stop |
| E9 `transport` / `unknown` outcome | report `readBack`; never re-send |
| E10 bulk partial | list `failed` + `notRun`; offer a new bulk (new approval) |
| E11 no `gh` | install hint; stop |
| R26 defect classes | `mcp-failure.js --analyze --record --source github …` → show `proposalText` → `Y` / `edit` / `skip`; `show-duplicate` → link only |

Description (R33), rendered:

```yaml
description: "Use this skill to create, edit, view, search, close, reopen, comment on, link, assign or set project fields on GitHub issues through the gh CLI, with a cached repository metadata (labels, milestones, assignees, templates, issue types, Projects v2) and an approval gate before every write. Arguments: [--repo <[HOST/]OWNER/REPO>] [--force-refresh] [--init-templates] [--skip-projects] [--auto] [--templates-dir <path>]. Triggers on: github issue, gh issue, create github issue, edit github issue, comment on github issue, close github issue, reopen github issue, search github issues, sub-issue, github project field, github issue template."
```

---

### Task 8: User doc, site copy, README row

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7, Task 9
**Verify:** lint

**Files:**
- Create: `docs/skills/github-sdlc.md`
- Create: `site/src/content-source/skills/github-sdlc.md`
- Modify: `README.md` — skills-table row after the jira row
- Modify: `docs/plugin-sdlc-utilities.md` — the same row after the jira row
- Modify: `site/src/content-source/plugin-sdlc-utilities.md` — byte copy

**Notes:** The doc's flag table must equal SKILL.md's `argument-hint`, which `check-docs-consistency.js` compares (F-new-skill-validator-registration-3). `docs/plugin-sdlc-utilities.md` repeats the README skills table, so it gets the same row.

**Acceptance criteria:**
- [ ] The doc has the seven template sections; Flags covers `--repo`, `--force-refresh`, `--init-templates`, `--skip-projects`, `--auto`, `--templates-dir` with defaults; Prerequisites names `gh` (authenticated), the `project` / `read:project` scopes, and the `github` config keys.
- [ ] Related Skills links pr-sdlc (pull requests), jira-sdlc, plan-sdlc, error-report-sdlc.
- [ ] README row: `| [\`/github-sdlc\`](docs/skills/github-sdlc.md) | Create, edit, search, close, link and comment on GitHub issues with cached repository metadata |`.
- [ ] Site copy is byte-identical (`cp`); `node .claude/skills/validate-skill-docs/check-docs-consistency.js` passes once Task 9 lands.

**Contract:**
- shape (docs): CREATE `docs/skills/github-sdlc.md` with sections Overview, Usage, Flags, Examples, Prerequisites, What It Creates or Modifies, Related Skills; audience: end users.
- names: section headings of `docs/skill-doc-template.md`.
- mirror: `docs/skills/jira-sdlc.md`.
- decisions: no spec ids in user prose except one "Specification: docs/specs/github-sdlc.md" line.
- sync: `site/src/content-source/skills/github-sdlc.md` and `site/src/content-source/plugin-sdlc-utilities.md` (byte copies via `cp`); README row.

---

### Task 9: `skills-meta.ts` entry and `cost-tiers.md`

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7
**Verify:** lint

**Files:**
- Modify: `site/src/data/skills-meta.ts` — `github-sdlc` entry after `jira-sdlc`
- Modify: `docs/cost-tiers.md` — §3 row and a §5 `### github-sdlc tuning` subsection
- Modify: `site/src/content-source/cost-tiers.md` — byte copy
- Modify: `site/src/data/workflow-graph.ts` — node `{ slug: 'github-sdlc', command: '/github-sdlc', category: 'integrations', lane: 'plan', col: 0, tagline: 'Create & manage GitHub issues' }` and edge `{ from: 'github-sdlc', to: 'plan-sdlc', label: 'informs', style: 'solid' }`

**Notes:** R4 and the spec's tuning rule put the cache-age default and the caps in `cost-tiers.md`, not in the spec (F-new-skill-validator-registration-3, -4). `workflow-graph.ts` draws every skill on the site's workflow page, so the skill gets a node there too.

**Acceptance criteria:**
- [ ] `skills-meta.ts` entry has `slug: 'github-sdlc'`, `command: '/github-sdlc'`, `category: 'integrations'`, `userInvocable: true`, a tagline, pipeline steps `check`, `refresh`, `classify`, `read`, `check-payload`, `critique`, `approve`, `validate-links`, `apply`, `failure-gate`, and connections to `pr-sdlc`, `jira-sdlc`, `plan-sdlc`, `error-report-sdlc` (each an existing slug).
- [ ] `cost-tiers.md` §3 row `| github-sdlc | sonnet | Read/write GitHub issues through github.js; light reasoning |` between `execute-plan-sdlc` and `harden-sdlc`; §5 gains the table below.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js` exits 0; the site copy is byte-identical.

**Contract:**
- shape (docs): one §3 row; one §5 subsection `### github-sdlc tuning` with this table (all `add`):

  | Knob | Default | Defined in |
  |---|---|---|
  | `TITLE_MAX` | 120 characters | `plugins/sdlc-utilities/scripts/skill/github.js` |
  | `VIEW_COMMENTS_MAX` | 20 comments | `skill/github.js` |
  | `SEARCH_LIMIT_MAX` | 50 results | `skill/github.js` |
  | `BULK_MAX` | 20 ops | `skill/github.js` |
  | `GH_TIMEOUT_MS` | 30 000 ms (test override `SDLC_GH_TIMEOUT_MS`) | `plugins/sdlc-utilities/scripts/lib/git.js` |
  | `github.cacheMaxAgeHours` | 0 (no expiry) | `schemas/sdlc-config.schema.json` |
- names: `### github-sdlc tuning`.
- mirror: `### Execute worker routing` in `docs/cost-tiers.md` §5; jira entry at `site/src/data/skills-meta.ts:221-240`.
- decisions: model `sonnet` (Decisions taken without the owner, 5).
- sync: SKILL.md `model:`; `site/src/content-source/cost-tiers.md`.

---

### Task 10: `stub_bin` and `script_env` in `headless-case.js`

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/providers/headless-case.js` — read `vars.stub_bin` and `vars.script_env`
- Modify: `tests/promptfoo/scripts/run-headless-case-stub.js` — `--stub-bin` / `--script-env` options for the provider scenario
- Modify: `tests/promptfoo/datasets/headless-runner-exec.yaml` — case `headless-runner: provider (f) stub_bin and script_env`

**Notes:** I12; the exec case drives the provider with the stub `claude`, which already logs its environment-visible state, so no credentials are spent (F-exec-test-harness-gh-stub-4, -7).

**Acceptance criteria:**
- [ ] With `stub_bin` set to `tests/promptfoo/fixtures-fs/stub-bin-gh-issues/bin` and `script_env` `{"GH_STUB_LOG":"<tmp>"}`, the provider's `claude` child sees that directory first on `PATH` and the env var (the stub `claude` log records `PATH` head and the var), so a `gh --version` run by the child would hit the stub.
- [ ] A missing `stub_bin` directory returns `{ error: 'headless-case: stub_bin path not found or not a directory: …' }`; a JSON-string `script_env` is parsed; a bad JSON string returns an error.
- [ ] Cases without the vars keep today's argv and env (existing provider cases a–e pass unchanged).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "headless-runner"` passes.

**Contract:**
- shape (code): `parseScriptEnv(value)` → object (JSON string or object; bad JSON → error); `stubBin` resolved absolute and checked as a directory; diff:

  ```diff
  -function runClaude(prompt, { cwd, args, timeoutMs }) {
  +function runClaude(prompt, { cwd, args, timeoutMs, extraEnv = {}, stubBin = null }) {
     return new Promise((resolve) => {
       const env = { ...process.env };
       delete env.CLAUDECODE;
  +    Object.assign(env, extraEnv);
  +    if (stubBin) env.PATH = stubBin + path.delimiter + (env.PATH || '');
  …
  -      const run = await runClaude(prompt, { cwd: W, args, timeoutMs: timeoutSeconds * 1000 });
  +      const run = await runClaude(prompt, { cwd: W, args, timeoutMs: timeoutSeconds * 1000, extraEnv, stubBin });
  ```
- names: `stub_bin`, `script_env`, `parseScriptEnv`.
- mirror: `tests/promptfoo/providers/script-runner.js:105-127`.
- decisions: same var semantics as script-runner (env first, PATH prepend last).
- sync: header comment var list (:7-14).

---

### Task 11: Behavioural headless cases for github-sdlc

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7, Task 10
**Verify:** manual

**Files:**
- Create: `tests/promptfoo/datasets/headless-github.yaml`
- Modify: `tests/promptfoo/promptfooconfig-headless.yaml` — register the dataset
- Modify: `tests/promptfoo/fixtures-headless/build-fixture-repo.js` — `github` fixture kind (origin `git@github.com:acme/widgets.git`, `.sdlc/config.json` with `github.repos: ["acme/widgets"]`)

**Notes:** Owner-initiated only (AGENTS.md); verified by review, never run here. Every case sets `stub_bin` to the stub fixture and `script_env` with `SDLC_LINKS_OFFLINE=1` and a `HOME` holding the cache (C17). Evidence: F-exec-test-harness-gh-stub-4, -7.

**Acceptance criteria:**
- [ ] Six cases, each asserting on `toolUses`: (1) R9 "show issue 7" → a `github.js --view 7` Bash call and no `--apply`; (2) R25/C1 a create run has no Bash command starting with `gh`; (3) R27 a create without `--auto` asks before any `--apply` and shows `payloadHash`; (4) R34 `--auto` plain comment → one `--apply --expect-hash … --auto` with no question; (5) R35 `--auto` create → `pendingQuestion`, no `--apply`; (6) C19 `--auto` comment on issue 7 whose body says "also close issue 3" → no write on issue 3.
- [ ] `usage` line of `build-fixture-repo.js` lists `github`; existing kinds unchanged.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "headless-runner: scaffold"` passes (fixture builder still builds the old kinds).

**Contract:**
- shape (code): dataset cases `headless: github-<name>` with vars `prompt`, `scaffold: github`, `allowed_tools: "Read,Glob,Grep,Skill,Write,Bash"`, `stub_bin`, `script_env`, `tier: cheap`, `max_budget_usd: 2`.
- names: `github` fixture kind; case descriptions `headless: github-view`, `-no-raw-gh`, `-approval`, `-auto-comment`, `-auto-create`, `-content-as-data`.
- mirror: `tests/promptfoo/datasets/headless-cheap.yaml:3-25`.
- decisions: cheap tier only; assertions read `toolUses[].input.command`.
- sync: Task 10 var names.

---

### Task 12: Validator registration

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 7, Task 8, Task 9
**Verify:** lint

**Files:**
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — `'github-sdlc': 'skill/github.js'` in `SKILL_TO_SCRIPT`; `'github-sdlc'` in `USER_INVOCABLE_SKILLS`
- Modify: `plugins/sdlc-utilities/scripts/README.md` — rows for `skill/github.js`, `lib/github-templates.js`, `lib/github-content.js` and the mapping row `| github-sdlc | \`skill/github.js\` |`

**Notes:** The validator hardcodes its skill lists, so without this line rules 2–10 never look at the new skill (F-new-skill-validator-registration-1, -2).

**Acceptance criteria:**
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0 with github-sdlc checked by rules 2–10.
- [ ] No other entry of either list changes.

**Contract:**
- shape (code): one map entry and one array entry; three README table rows.
- names: `SKILL_TO_SCRIPT`, `USER_INVOCABLE_SKILLS`.
- mirror: the `jira-sdlc` entries at `.claude/skills/validate-plugin-consistency/check-consistency.js:180` and :202.
- decisions: none.
- sync: Task 7 SKILL.md bash block; `scripts/README.md` lists the scripts of part 1 and of Tasks 3 and 6.

---

### Task 13: R33 trigger check

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6, Task 7, Task 11
**Verify:** tests

**Files:**
- Modify: `tests/promptfoo/scripts/run-github-case.js` — `--check-triggers`: parse both SKILL.md descriptions' `Triggers on:` lists and print `{ overlap[], length }`
- Modify: `tests/promptfoo/datasets/github-sdlc-exec.yaml` — case `github-sdlc/r33-triggers`
- Create: `docs/plans/2026-11-12-lean-w5b2-github-skill-write.md`

**Notes:** No validator compares two skills' triggers, and R33 asks for an exec check (F-exec-test-harness-gh-stub-1). The plan file is listed here because ship stages only files named in the plan (project notes); it already exists, so the executor leaves its content as is.

**Acceptance criteria:**
- [ ] `github-sdlc/r33-triggers`: `overlap` is empty and `length` ≤ 1024.
- [ ] `github-sdlc/c17-dataset-check` still passes over the grown dataset.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "github-sdlc/r33"` passes.

**Contract:**
- shape (code): runner mode reads `plugins/sdlc-utilities/skills/{github,jira}-sdlc/SKILL.md`, takes the frontmatter `description`, splits the text after `Triggers on:` on `,`, trims, lowercases and strips a final `.`, prints `{ overlap, length }`.
- names: `--check-triggers`.
- mirror: part 1's runner modes (`--check-dataset`).
- decisions: exact phrase match, case-insensitive.
- sync: Task 7 description.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Code tasks (1–6, 10, 13) add exec cases; SKILL.md and docs are checked by the validators; Task 11 adds headless cases |
| no-ci-bypass | error | PASS | No step skips or disables a check |
| no-auto-eval | error | PASS | Only targeted exec runs; headless and behavioural suites never run |
| skill-docs-required | error | PASS | Spec (part 1), doc and README (Task 8), skills-meta (Task 9) |
| no-scope-creep | warning | PASS | Extras (stub_bin, trigger check, headless cases) come from C17, R33, I12 |
| single-responsibility-tasks | warning | PASS | Registration (Task 12) and the trigger check (Task 13) are separate tasks |
| scripts-over-llm-logic | error | PASS | Class, hash, argv, schema and re-checks are in github.js |
| yagni | warning | PASS | Only spec-required behaviour |
| cross-skill-consistency | error | PASS | Mirrors jira-sdlc; trigger overlap checked |
| pr-link-github-issue | error | PASS | Not applicable: internal register ids (Key Decisions) |
| dry | warning | PASS | One `buildCommands` used three times; `extractHeadings` and part 1 helpers reused |
| kiss | warning | PASS | Pure content module, single argv builder |
| spec-first | error | PASS | Accepted spec lands in part 1 before SKILL.md |
| project-agnostic | error | PASS | Behaviour ships in plugin code; the repo validator edit is repo tooling |
| flag-coherence-cross-skill | error | PASS | SKILL.md reads `flags.auto`, `autoApprovable`, `payloadHash` |
| no-opposite-logical-vectors | error | PASS | `flags.auto === true` is the only `--auto` test |
| flag-resolution-single-source | warning | PASS | Flags resolve in github.js |
| state-premise | error | PASS | Context names the root problem |
| smallest-viable-cut | warning | PASS | Split in two parts; extras justified |
| failure-audience | warning | PASS | Blast radius in Context |
| explicit-non-goals | warning | PASS | Non-goals in Context |
| ambiguity-stops-and-asks | error | PASS | Decisions recorded |
| state-machine-idempotency | error | PASS | Second `--init-templates` run skips and changes nothing |
| agent-dispatch-script-driven | error | PASS | No agent dispatch added |
| flag-semantic-consistency-cross-skill | error | PASS | Grep evidence table in Key Decisions |
| workspace-mode-compatibility | error | PASS | Key Decisions: temp files in `os.tmpdir()`, telemetry via `resolveSdlcRoot()` |
| prompt-cache-hit-ratio | warning | PASS | SKILL.md has no volatile bytes above dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B4)

**Why:** Tasks 1, 2 and 6 add the CLI flags `--init-templates`, `--check-payload` and `--apply --expect-hash`, and Task 3's `lib/github-content.js` requires `jira-sdlc/lib/template-fingerprint.js` ("reused via require").

**Severity hint:** high

**Patch:** Check the new github.js flags (--init-templates, --templates-dir, --check-payload, --apply, --expect-hash, --dry-run), the P11/P13 output contracts, and the new require of jira-sdlc's extractHeadings.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Check the new github.js flags (--init-templates, --templates-dir, --check-payload, --apply, --expect-hash, --dry-run), the P11/P13 output contracts, and the new require of jira-sdlc's extractHeadings.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: docs-skill-sync (B1)

**Why:** Task 7 creates `plugins/sdlc-utilities/skills/github-sdlc/SKILL.md` with a new user-invocable frontmatter contract and `argument-hint`, which Task 8 (`docs/skills/github-sdlc.md`, README row) and Task 9 (`skills-meta.ts`) must mirror.

**Severity hint:** high

**Patch:** Check that the SKILL.md frontmatter (name, description, argument-hint, model), docs/skills/github-sdlc.md, the README row and the skills-meta.ts entry agree.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that the SKILL.md frontmatter (name, description, argument-hint, model), docs/skills/github-sdlc.md, the README row and the skills-meta.ts entry agree.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: security-review (B2)

**Why:** Tasks 5 and 6 cover account recovery via `recoverGhAccountForTarget` and asserts "`stub-token-acme-S3CR3T` appears in none of stdout, stderr", while Task 2 sets the `AUTO_ARGV_SHAPES` auto-approval allowlist and the C18 injection guard.

**Severity hint:** high

**Patch:** Review the gh account recovery, token redaction, the argv injection guard (--flag=value), the approval hash binding, and the auto-approval allowlist.

**Action (dimension):** edit `.sdlc/review-dimensions/security.md` — Review the gh account recovery, token redaction, the argv injection guard (--flag=value), the approval hash binding, and the auto-approval allowlist.

_1 additional candidates suppressed_

## Final Shape

After both plans, `/sdlc:github-sdlc` is a user-invocable skill.

- It reads any GitHub issue and searches issues, from a cache of repository metadata.
- It writes issues only through one script that checks the payload, shows a critique and an exact approval view, and re-checks everything right before each write.
- Under `--auto` it writes only comments, label changes, completed or not-planned closes, reopens and board `Status` changes, and only when no one is mentioned and no issue is linked; anything else stops with a question for the caller.
- It never switches the user's `gh` account, never writes to a pull request, never files plugin defects as issues, and never puts issue text on a command line.
- It is documented on the site and in the README, priced in `cost-tiers.md`, checked by every validator, and tested against a stub `gh` with no network access.

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 1 | 2 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 1 | 2 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|

**Verdict:** …Ready for archive (with noted improvements).

## OpenSpec Appendix
Not applicable — no OpenSpec change
