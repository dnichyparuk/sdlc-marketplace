# Argument Rule and Quality Preset Aliases Implementation Plan

**Commit:** `fix(#9395): skills - argument rule, quality preset aliases`
**Goal:**
- Make "request text never goes on a command line" a plugin-wide, checked rule: a skill may paste `$ARGUMENTS` into a Bash call only when its arguments are flags only.
- Switch received-review-sdlc, the one raw-`$ARGUMENTS` skill that also takes request text, to an explicit flag allow list.
- Add a deterministic validator, `scripts/ci/validate-args-rule.js`, with exec cases.
- Make `jira.js` parse `--force-refresh` itself, so the jira-sdlc skill reads `flags.forceRefresh` and never the raw arguments.
- Add clear `--quality` names `speed`, `balanced` and `quality` to plan-sdlc, execute-plan-sdlc and ship-sdlc; `full` and `minimal` stay as deprecated aliases with one warning line.

**Architecture:** One new CI validator scans every fenced block of every skill `.md` file for `$ARGUMENTS` and checks it against a request-text skill registry and the skill's `argument-hint`. received-review-sdlc gets the A6/C16 allow-list shape that github-sdlc and jira-sdlc already use. `jira.js` echoes `forceRefresh` in its `flags`. A new shared module `scripts/lib/quality.js` resolves every `--quality` input (new name, deprecated name, execute's legacy letters) to the existing internal preset key, so the routing tables, state files and prepare-output shapes do not change; ship stores and forwards the public name.
**Source:** conversation context (wave brief for #9395: items #9390 and #9394; discovery brief from plan-explore)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`

---

## Context

**What problem does this change solve?**

- Item #9390 — wave 22 stopped github-sdlc and jira-sdlc from pasting `$ARGUMENTS` (everything the user typed after the skill name) into Bash calls. Only an allow list of flags reaches their scripts now.
  - That rule exists only in those two skills. Nothing stops a new or edited skill from pasting request text onto a command line again.
  - received-review-sdlc still pastes `$ARGUMENTS` into its prepare call, and its own text says the user may type a bare PR number or URL there. That is request text on a command line.
  - jira-sdlc decides "rebuild the cache" by reading `--force-refresh` from the raw arguments, because `jira.js` does not parse that flag.
- Item #9394 — the `--quality` preset names read backwards.
  - `minimal` is the costliest preset (opus reviewers at high effort; opus workers for Standard tasks).
  - `full` is the cheapest (sonnet at low effort).
  - A user who picks `minimal` to save money gets the most expensive run.

**What prompted this change now?**

- #9390 is a follow-up from the wave 22 architect question (an allow list for two skills, not yet a rule for all).
- #9394 is ledger finding F-103 from the wave 24 light-mode review.

**What does success look like?**

- `node plugins/sdlc-utilities/scripts/ci/validate-args-rule.js --root .` exits 0 on the repository and exits 1 with a named finding on a fixture that breaks the rule.
- No request-text skill holds `$ARGUMENTS` in a fenced block; the rule is written once in `docs/adding-skills.md`.
- `jira.js --check --force-refresh` reports `flags.forceRefresh: true`, and the jira skill cites that field.
- `--quality speed|balanced|quality` works in plan-sdlc, execute-plan-sdlc and ship-sdlc; `--quality full` and `--quality minimal` still work and print one deprecation line; every doc shows the new names.

**What is intentionally not built (non-goals)?**

- No renaming or removal of `full` and `minimal`; they stay as deprecated aliases, and the internal preset keys keep those names (KD5).
- No allow list for commit, review, pr, setup, version, execute-plan or ship: their arguments are flags only (KD1).
- No change to the lean orchestration skill, the post-merge audit findings or the deferred low review backlog.
- No run of the behavioural or headless suites; the headless datasets are not edited.
- No change to `scripts/state/execute.js`: it stores the internal key that SKILL.md passes to `init`, so it needs no alias resolution; its removed-`--preset` message keeps the old list (F-quality-preset-alias-resolution-5).
- No new main-session validator wiring: adding `validate-args-rule.js` to the orchestration brief's validator list is the main session's job after merge.

**Who is hurt if this ships wrong?**

- Users of received-review-sdlc and of ship (which dispatches it): a wrong allow list drops `--pr`, `--plan` or `--min-severity`, so the fix scope changes or the run stops.
- Users of `--quality`: a wrong mapping silently runs the wrong (cheaper or costlier) preset.
- Plugin authors: a validator with false positives blocks valid skills.

## Research Findings

Both items were checked again at HEAD `f798895`. Both still apply. Paths: P = `plugins/sdlc-utilities`, T = `tests/promptfoo`.

**Item #9390 — where `$ARGUMENTS` reaches a command line (F-arguments-command-line-rule-audit-1).**

- Raw `--output-file $ARGUMENTS` in a bash fence: `P/skills/commit-sdlc/SKILL.md:42`, `review-sdlc/SKILL.md:23`, `pr-sdlc/SKILL.md:104`, `setup-sdlc/SKILL.md:58`, `execute-plan-sdlc/SKILL.md:50`, `version-sdlc/SKILL.md:42`, `ship-sdlc/SKILL.md:25` and `:72`, `received-review-sdlc/SKILL.md:133`.
- The argument-hints of commit, review, pr, setup and ship hold flags only. execute-plan-sdlc has one positional plan path (`<plan-file-path>`); version-sdlc has one positional bump (`[major|minor|patch|<label>]`). Both scripts validate that value: `execute.js` fails a run without a readable plan (R41, `execute.js:85-91`), and `version.js` rejects a token that matches no form (`version.js:242`).
- received-review-sdlc's hint is flags only, but `SKILL.md:128` says "or the user gives a PR number or URL", and `:133-136` pastes `$ARGUMENTS` and then a hand-built `--pr`. So request text can reach `received-review.js`. Its spec's last ids are A6 and C19 (`docs/specs/received-review-sdlc.md`), so the next free ids are A7 and C20.
- Reference pattern: github-sdlc A14/C21 and jira-sdlc A6/C16 (F-arguments-command-line-rule-audit-2, -3). The jira text is at `P/skills/jira-sdlc/SKILL.md:71-74`.
- ship dispatches received-review with `args` `--auto`, `--plan "<path>"` and `--min-severity <level>` (`P/scripts/skill/ship.js:620-622`), and `--pr <N>` or `--comment-file "<path>"` (`ship.js:1894-1898`). The ship-step agents put these `args` wherever the skill text uses `$ARGUMENTS` (`P/agents/ship-step-received-review.md:11`; F-arguments-command-line-rule-audit-5), so an allow-list rule that reads from `$ARGUMENTS` keeps working under ship.
- `jira.js` `parseArgs` (`P/scripts/skill/jira.js:197-264`) has no `--force-refresh` branch; the flag name appears only in two messages (`:177`, `:452`). The skill decides at `P/skills/jira-sdlc/SKILL.md:94` ("If `--force-refresh` passed") and `:143`. The `flags` objects are built at `jira.js:288-291` and `:509-512`; `REFERENCE.md:181` documents the `flags` block (F-arguments-command-line-rule-audit-4). jira's last P id is P9, so the next free id is P10.
- The only existing check is `skill-passes-arguments` in `.claude/skills/validate-plugin-consistency/check-consistency.js:488-502`, a warning that a skill does NOT forward `$ARGUMENTS`; `EXPLICIT_FLAG_SKILLS` (`:191`) exempts five skills, and the list is repeated in `.claude/skills/validate-plugin-consistency/SKILL.md:79` (F-arguments-command-line-rule-audit-6).
- Validator pattern: `P/scripts/ci/validate-spec-shape.js` and `T/datasets/validate-spec-shape-exec.yaml:5-30`. The script runner runs a fixture's `setup.sh` in a temp copy and replaces `{{repo_root}}` in `script_args` (`T/scripts/extract-skill-content.js:52-80`). Exit-0 stderr is not captured (`validate-spec-shape-exec.yaml:10`) (F-arguments-command-line-rule-audit-7).

**Item #9394 — `--quality` (F-quality-preset-alias-resolution-1 to -10).**

- The name list is defined three times: `P/scripts/skill/plan.js:191`, `execute.js:55`, `ship.js:64`. `P/scripts/lib/config.js:40-41` holds a fourth list for ship step presets, which is a different thing and is not touched (F-quality-preset-alias-resolution-6).
- The values prove the names are inverted: `plan.js:192-196` maps `full` to sonnet/low and `minimal` to opus/high; `execute.js:66-70` routes `full` as "Speed" and `minimal` as "Quality"; `docs/cost-tiers.md:85-91` and `:111` label them the same way.
- Only `execute.js` normalises today (letters A/B/C, `execute.js:56`, `:233-256`). `plan.js:479-485` and `ship.js:1026-1029` validate the raw value, so ship would reject a new name before execute sees it.
- `plan.js` has no `warnings` channel; P24 pins the exact `flags` shape and error text, and `T/datasets/plan-prepare-exec.yaml:393`, `:411` compare `flags` with `JSON.stringify`, `:429` compares the error string.
- `execute.js` has `warnings[]` in its output; so does ship (`ship.js:983`).
- ship forwards the value verbatim (`ship.js:569`, `:1648`), asks `execute_tier` with options `full|balanced|minimal` (`:2325`, `:2609`), and its resume line repeats a CLI-given `--quality` (R105; `T/datasets/ship-prepare-exec.yaml:5965`).
- `--quality minimal` forces the per-wave spec reviewer (`execute.js:663-669`); the config schema text says so too (`schemas/sdlc-config.schema.json:361`); `site/src/data/skills-meta.ts:70` says it too.
- Exec checks that read the routing table: `T/scripts/check-worker-routing-table.js:24-25` compares table cells by column index with `TIERS = ['full','balanced','minimal']`, so a header-only rename does not break it.
- Docs that list the names: `docs/cost-tiers.md:81-91`, `:97`, `:109-117`; `docs/skills/{plan,ship,execute-plan}-sdlc.md`; `P/skills/plan-sdlc/SKILL.md:5`, `:62`; `review-loop.md:30-36`; `P/skills/ship-sdlc/SKILL.md:5` and later lines; `P/skills/execute-plan-sdlc/SKILL.md:5`, `:286-296` and later lines; `classifying-and-waving-tasks.md:40`.
- Site copies under `site/src/content-source/` are byte copies of `docs/` and are made with `cp` (the brief's `copy-docs.mjs` suggestion is not used).
- The owner-run headless datasets pass `--quality minimal` (`T/datasets/headless-costly.yaml`, `headless-cheap.yaml`); they keep working through the alias and are not edited.

**Build and test commands.**

- Targeted exec runs: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern <pattern>`.
- Main-session validators: `check-consistency.js`, `check-docs-consistency.js`, `validate-spec-shape.js --root . --strict`, `validate-cost-tiers.js`, `validate-discovery.js`.
- The behavioural and headless configs are never run by an agent.

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| "Flags only" definition | no | counts one typed positional per skill (execute-plan's plan path, version's bump) as flags only | the script validates that value and rejects anything else; switching both skills would change the ship pipeline for no request-text gain (KD1) |
| received-review-sdlc | no | switches it to an allow list although its hint is flags only | its own text accepts a bare PR number or URL, which is request text (KD2) |
| Validator home | no | new `scripts/ci/validate-args-rule.js`, not an extension of `check-consistency.js` | the brief prefers `scripts/ci/`; `check-consistency.js` lives outside the shipped plugin (KD3) |
| Internal preset keys | no | keeps `full`/`balanced`/`minimal` as the internal keys in plan and execute outputs, state and tables | renaming the old names is out of scope; only the accepted input names change (KD5) |
| Ship's stored value | no | ship stores and forwards the public name (`speed`/`balanced`/`quality`) | ship's value is only a forwarded command-line token; this avoids a second warning in execute (KD6) |
| Warning channel | no | plan: one stderr line; execute and ship: one `warnings[]` entry | plan.js has no `warnings` key and P24 pins its `flags` shape (KD7) |
| Site copies | no | `cp` per edited file | project notes; the discovery brief's `copy-docs.mjs` copies the whole tree |
| Headless datasets | no | not edited | owner-run only; `--quality minimal` keeps working as an alias |
| Check-only copy entries | no | tasks list skill directories and user docs with no edit expected | `plan.copyRules` requires them in a task once a skill's spec or SKILL.md changes |

## Decisions taken without the owner

No user was available, so plan-sdlc took the recommended option each time:

- A positional value that the script validates (execute-plan's plan path, version's bump) counts as a flag for the rule (KD1).
- received-review-sdlc moves to an allow list (KD2).
- The validator is a new script under `scripts/ci/` (KD3), and it counts `$ARGUMENTS` inside quotes too (KD4).
- The internal preset keys stay `full`/`balanced`/`minimal`; only inputs gain the new names (KD5).
- ship stores and forwards the public name (KD6).
- plan.js warns on stderr; execute and ship warn in `warnings[]` (KD7).
- Execute's legacy letters A/B/C keep working with no warning (KD8).

## Key Decisions

- **KD1 — What "flags only" means.**
  - Choice: an argument-hint is flags only when every group is a `--flag` (with its value), plus at most the one typed positional named for that skill in the validator (`execute-plan-sdlc`: `<plan-file-path>`; `version-sdlc`: `major|minor|patch|<label>`).
  - Alternative: no positionals at all, which forces allow lists on execute-plan-sdlc and version-sdlc.
  - Why: both scripts reject any value that is not a plan path or a bump form, so a stray word fails loudly instead of acting. Both skills run inside ship's pipeline. Changing them adds risk without keeping any request text off a command line.

- **KD2 — received-review-sdlc uses the allow list.**
  - Choice: A7 and C20 in the A6/C16 shape: `--pr <number>`, `--auto`, `--comment-file <path>`, `--plan <path>`, `--min-severity <level>`.
  - Alternative: keep raw `$ARGUMENTS` because the hint is flags only.
  - Why: the skill accepts a PR number or URL as plain words. A bare number becomes `--pr '<N>'`; a pull-request URL gives its trailing number. Nothing else reaches the call.

- **KD3 — A new validator, not a new rule in `check-consistency.js`.**
  - Alternative: add a rule beside `skill-passes-arguments`.
  - Why: `check-consistency.js` is a repo-local skill script, not shipped plugin code, and its rule 5 points the other way (it warns when `$ARGUMENTS` is missing). The new script follows `validate-spec-shape.js`. `EXPLICIT_FLAG_SKILLS` still gains `received-review-sdlc` so rule 5 stays coherent.

- **KD4 — Threat model of the rule and the validator (F-73).**
  - The rule is skill prose that the model follows. The validator is a best-effort static check of that prose.
  - It catches: `$ARGUMENTS` in any fenced block of a request-text skill; `$ARGUMENTS` in a fenced block of a skill whose hint is not flags only; a hint that is missing.
  - `$ARGUMENTS` inside quotes counts too. The harness substitutes it as text before any shell runs, so quotes do not keep it off the command line. This is why the F-51 "ignore quoted text" rule does not apply here.
  - Accepted gaps: a command written in inline code outside a fence is not scanned; the request-text registry and the typed-positional list are kept by hand; the validator cannot see how the model splits the arguments; a flags-only skill still receives whatever the user typed (its script then rejects unknown tokens or ignores them).

- **KD5 — Inputs gain names; internal keys stay.**
  - Choice: `scripts/lib/quality.js` maps `speed → full`, `balanced → balanced`, `quality → minimal`. Plan and execute keep emitting `flags.quality` as `full|balanced|minimal`.
  - Alternative: rename the keys everywhere (tables, state files, outputs, about 35 test assertions).
  - Why: the brief puts renaming the old names out of scope. The user-facing fix is the accepted names, the prompts and the docs. A later wave can rename the keys.

- **KD6 — ship stores the public name.**
  - Choice: ship resolves `--quality` and the `execute_tier` answer through `quality.js` and stores `speed|balanced|quality` in `flags.quality`. It forwards that value to execute and prints it in the R105 resume line.
  - Alternative: store the internal key and translate at each output site.
  - Why: ship never routes on the value; it only forwards it. Forwarding the public name means execute never warns a second time.

- **KD7 — Where the one warning line goes.**
  - plan.js prints `Warning: --quality full is deprecated; use --quality speed (same preset).` on stderr once. execute and ship put the same text (without `Warning: `) in `warnings[]` once.
  - Alternative: add a `warnings` key to plan.js output.
  - Why: P24 and two exact-match exec cases pin plan's `flags` shape. stderr reaches the model through the Bash tool result anyway.

- **KD8 — Legacy letters A/B/C.**
  - They stay execute-only and silent, as today (`allowLetters` option). plan and ship do not start accepting them.

## Contract Examples

**Code** (from Task 6):

```markdown
**Contract:**
- shape (code): `resolveQuality(value: string, opts?: { allowLetters?: boolean }): { key: 'full'|'balanced'|'minimal'|null, name: 'speed'|'balanced'|'quality'|null, warning: string|null }`;
  unknown value → `{ key: null, name: null, warning: null }`.
- names: `QUALITY_NAMES`, `QUALITY_KEYS`, `DEPRECATED_QUALITY`, `QUALITY_EXPECTED`, `resolveQuality`, `qualityName`.
- mirror: `normaliseQuality` at `plugins/sdlc-utilities/scripts/skill/execute.js:233-238`.
- decisions: internal keys unchanged (KD5).
- sync: `plan.js`, `execute.js`, `ship.js` import it.
- example: `resolveQuality('full')` → `{ key: 'full', name: 'speed', warning: '--quality full is deprecated; use --quality speed (same preset).' }`.
```

**Docs** (from Task 2):

```markdown
**Contract:**
- shape (docs): MODIFY `docs/adding-skills.md`. Add `### Arguments on a command line` (audience: skill authors) after the `### argument-hint` section.
- names: heading `### Arguments on a command line`.
- mirror: the `### argument-hint` section style at `docs/adding-skills.md:186-195`.
- decisions: one rule, one registry, one validator command.
- sync: the registry matches `REQUEST_TEXT_SKILLS` in `validate-args-rule.js` (Task 5).
- example: the section names `node plugins/sdlc-utilities/scripts/ci/validate-args-rule.js --root .`.
```

**Spec** (from Task 1):

```markdown
**Contract:**
- shape (openspec): ADD `P10` to `docs/specs/jira-sdlc.md` under `## Prepare script contract`; MODIFY `A2`; numbering continues from `P9`.
- names: `P10` (new), `A2` (modified).
- mirror: requirement-block style of `P5` and `P9` in the same section.
- decisions: numeric ids, next free numbers.
- sync: `jira.js` (Task 3) implements it; the exec case cites it.
- example: `P10` reads "`flags.forceRefresh` (boolean) …".
```

## Tasks

### Task 1: Specs for the argument rule (jira-sdlc, received-review-sdlc)

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/jira-sdlc.md` — amend A2, add P10, amend C16's accepted gaps
- Modify: `site/src/content-source/specs/jira-sdlc.md` — byte copy (`cp`)
- Modify: `docs/specs/received-review-sdlc.md` — add A7, C20 and an appendix decision row
- Modify: `site/src/content-source/specs/received-review-sdlc.md` — byte copy (`cp`)

**Notes:**
Spec first for #9390 (F-arguments-command-line-rule-audit-1, -3, -4). The ids are the next free numbers. The threat model sits in C20 itself (F-73), in the same words as jira C16.

**Acceptance criteria:**
- [ ] jira A2 says `jira.js` parses the flag into `flags.forceRefresh` (P10); P10 follows P9 with an acceptance line; C16 no longer says the skill reads raw arguments for `--force-refresh` (its stray-token gap stays).
- [ ] received-review A7 follows A6 and C20 follows C19, each with an acceptance line; a 2026-11-18 decision row cites A7, C20 (#9390).
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.
- [ ] `cmp` of each spec with its site copy exits 0.

**Contract:**
- shape (openspec): delta text, rendered:

```markdown
- A2: `--force-refresh` — rebuild cache regardless of current state (default: false). `skill/jira.js` parses it into `flags.forceRefresh` (P10); the skill decides on that field, never on the raw arguments.
- P10: `flags.forceRefresh` (boolean) — present in every `--check` output's `flags`; `true` when `--force-refresh` was passed, else `false`.
  - Acceptance: exec — `jira.js --project <KEY> --check --force-refresh` gives `"forceRefresh": true`; without the flag, `false`.
```

```markdown
- A7: Arguments — only `--pr <number>`, `--auto`, `--comment-file <path>`, `--plan <path>` and `--min-severity <level>` reach `skill/received-review.js` from the user's arguments. The skill takes them from `$ARGUMENTS` before its first Bash call: a token is a flag only when it is outside quotes and is exactly one of these names, and the value of `--pr`, `--comment-file`, `--plan` and `--min-severity` is the next token, without its enclosing quotes. It passes them as `<FLAGS>`, each value a single-quoted literal. A PR the user names in words becomes `--pr '<N>'` only when `<N>` is all digits: a bare number, or the number after `/pull/` in a pull-request URL. Every other token is the request: it stays with the model and never reaches a command line (C20). An unknown `--` token outside quotes is request text, and the skill says so: `Not a received-review-sdlc flag, read as request text: <token>`.
  - Acceptance: exec — the SKILL.md has no `$ARGUMENTS` inside a fenced block, the prepare call is `received-review.js --output-file <FLAGS>`, and the allow-list rule text is present.
```

```markdown
- C20: Must not put `$ARGUMENTS` or request text into a Bash call. Threat model: a best-effort rule in skill prose that keeps request words off the command line. Accepted gaps: no code checks how the model splits `$ARGUMENTS`; a request word outside quotes that is exactly an allowed flag name is read as that flag; `received-review.js` ignores stray tokens.
  - Acceptance: exec — the static SKILL.md case of A7; `validate-args-rule.js --root .` reports nothing for received-review-sdlc.
```

- names: `A2`, `P10`, `C16` (jira); `A7`, `C20` (received-review).
- mirror: jira `A6` and `C16` (`docs/specs/jira-sdlc.md:15-16`, `:171-172`); the decision-row table at `docs/specs/jira-sdlc.md:186-188`.
- decisions: KD2; ids are the next free numbers.
- sync: Task 3 implements P10; Task 4 implements A7/C20; Task 5's registry lists received-review-sdlc.

### Task 2: Plugin-wide rule text and the consistency exemption

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `docs/adding-skills.md` — new `### Arguments on a command line` section
- Modify: `site/src/content-source/adding-skills.md` — byte copy (`cp`)
- Modify: `.claude/skills/validate-plugin-consistency/check-consistency.js` — add `received-review-sdlc` to `EXPLICIT_FLAG_SKILLS`
- Modify: `.claude/skills/validate-plugin-consistency/SKILL.md` — the exempt list in `skill-passes-arguments`
- Test: `tests/promptfoo/datasets/sdlc-script-resolution-exec.yaml` — static case for the exempt list

**Notes:**
The single written home of the rule (F-arguments-command-line-rule-audit-6). The registry here, in Task 5's validator and in `EXPLICIT_FLAG_SKILLS` must name the same request-text skills that run a prepare script.

**Acceptance criteria:**
- [ ] `docs/adding-skills.md` has the section below, directly after the `### argument-hint` section.
- [ ] `EXPLICIT_FLAG_SKILLS` is `['error-report-sdlc', 'github-sdlc', 'harden-sdlc', 'jira-sdlc', 'plan-sdlc', 'received-review-sdlc']`, and the validate-plugin-consistency SKILL.md sentence names the same six.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.
- [ ] A new case `script-resolution: (args-rule) EXPLICIT_FLAG_SKILLS lists the six request-text skills and the SKILL.md sentence names them` (`script_path: "-e"`, reads both files as text, like `jira-sdlc-exec.yaml:576-590`) passes: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'script-resolution'`.
- [ ] `cmp docs/adding-skills.md site/src/content-source/adding-skills.md` exits 0.

**Contract:**
- shape (docs): the new section:

```markdown
### Arguments on a command line

A skill may put `$ARGUMENTS` into a Bash call only when its arguments are flags only: every group of its `argument-hint` is a `--flag` with its value, or the one typed positional that the prepare script validates (`execute-plan-sdlc`'s plan path, `version-sdlc`'s bump).

A skill that also takes request text — words such as `show issue 7` — never puts `$ARGUMENTS` or request text into a Bash call. Before its first Bash call it takes an explicit allow list of flags from `$ARGUMENTS` and passes them as `<FLAGS>`, each value a single-quoted literal (github-sdlc A14, jira-sdlc A6, received-review-sdlc A7). These skills are: `error-report-sdlc`, `github-sdlc`, `harden-sdlc`, `jira-sdlc`, `plan-sdlc`, `received-review-sdlc` and `verify-pipeline-sdlc`.

`node plugins/sdlc-utilities/scripts/ci/validate-args-rule.js --root .` checks every fenced block of every skill `.md` file. It is a best-effort check: it does not scan inline code outside a fence, and the request-text list and the typed-positional list are kept by hand in the script.
```

- names: heading `### Arguments on a command line`; constant `EXPLICIT_FLAG_SKILLS`.
- mirror: `docs/adding-skills.md:186-195` (`### argument-hint`).
- decisions: KD1, KD3, KD4.
- sync: Task 5 `REQUEST_TEXT_SKILLS` and `TYPED_POSITIONALS`.

### Task 3: jira.js parses --force-refresh

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/jira.js` — parse `--force-refresh`; `forceRefresh` in both `flags` objects
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md` — decisions cite `flags.forceRefresh`
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc/REFERENCE.md` — `forceRefresh` in the documented `flags` block
- Test: `tests/promptfoo/datasets/jira-sdlc-exec.yaml` — P10 case
- Modify: `plugins/sdlc-utilities/skills/jira-sdlc` — check only: `EXAMPLES.md`, `operations-reference.md`, `write-ops.md`, no change expected (copy rule)
- Modify: `docs/skills/jira-sdlc.md` — check only: the Flags row already documents `--force-refresh`, no change expected (copy rule)
- Modify: `site/src/content-source/skills/jira-sdlc.md` — check only, no change expected (copy rule)

**Notes:**
Implements jira A2 and P10 (F-arguments-command-line-rule-audit-4). Spec first: Task 1 lands P10. `--force-refresh` means the same in the only other prepare script that defines it, `github.js` (rebuild the cache; `grep -n "force-refresh" plugins/sdlc-utilities/scripts/skill/*.js`). The flag name in user-facing prose (the Flags table, "use `--force-refresh` to rebuild") stays; only decision sites change.

**Acceptance criteria:**
- [ ] `jira.js --project PROJ --check --force-refresh` emits `"forceRefresh": true` in `flags`; without the flag, `false`.
- [ ] SKILL.md `:94` reads `- If \`flags.forceRefresh\` is \`true\` in the \`--check\` output → rebuild regardless of age. Proceed to **Step 1**.`, and the Phase-run condition at `:143` names `flags.forceRefresh` instead of "`--force-refresh` is set".
- [ ] `grep -n "force-refresh. passed\|force-refresh. is set" plugins/sdlc-utilities/skills/jira-sdlc/SKILL.md` finds nothing.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'jira-prepare'` passes (the existing `jira-prepare` cases and the new one).

**Contract:**
- shape (code):

```diff
 // parseArgs (jira.js:207-224)
   let skipWorkflowDiscovery  = false;
+  let forceRefresh           = false;
 ...
     } else if (a === '--skip-workflow-discovery') {
       skipWorkflowDiscovery = true;
+    } else if (a === '--force-refresh') {
+      forceRefresh = true;
 ...
   const flags = {
     skipWorkflowDiscovery,
+    forceRefresh,
     site,
   };
 // return value gains forceRefresh; main's flagsBlock (jira.js:509-512):
   const flagsBlock = {
     skipWorkflowDiscovery: !!skipWorkflowDiscovery,
+    forceRefresh:          !!forceRefresh,
     site:                  site || null,
   };
```

- names: `forceRefresh`, `flags.forceRefresh`; exec case description `jira-prepare: (P10) --force-refresh is echoed as flags.forceRefresh`.
- mirror: the `--skip-workflow-discovery` branch and case (e) in `jira-sdlc-exec.yaml` (asserts `'"skipWorkflowDiscovery": true'` near `:310`).
- shape (docs): the two SKILL.md decision sites (before → after):

```diff
 # Cache Status Evaluation list
-- If `--force-refresh` passed → rebuild regardless of age. Proceed to **Step 1**.
+- If `flags.forceRefresh` is `true` in the `--check` output → rebuild regardless of age. Proceed to **Step 1**.
 # Step 1 — Deterministic Cache Initialization, opening note
-> Run this phase only when the cache is missing, incomplete, `--force-refresh` is set,
+> Run this phase only when the cache is missing, incomplete, `flags.forceRefresh` is `true`,
 > a TTL-based expiry was exceeded, or an operation error triggered an auto-refresh.
```

- decisions: the flag only echoes; `jira.js` still rebuilds nothing itself.
- sync: Task 1 P10 text.

### Task 4: received-review-sdlc flag allow list

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/received-review-sdlc/SKILL.md` — Step 1a allow-list rule and `<FLAGS>` call
- Test: `tests/promptfoo/datasets/received-review-prepare-exec.yaml` — static SKILL.md case
- Modify: `docs/skills/received-review-sdlc.md` — check only: the user doc documents the same flags, no change expected (copy rule)
- Modify: `site/src/content-source/skills/received-review-sdlc.md` — check only, no change expected (copy rule)

**Notes:**
Implements received-review A7 and C20 (KD2; F-arguments-command-line-rule-audit-1, -2); spec first via Task 1. `received-review.js` reads `--output-file` as a plain switch (`received-review.js:277`), so `<FLAGS>` may follow it. Other `$ARGUMENTS` mentions in prose (`:128`, `:136`, `:140`, `:151`) are decision text, not command lines; they change to name `<FLAGS>` or the manifest so no step reads raw arguments.

**Acceptance criteria:**
- [ ] No `$ARGUMENTS` inside any fenced block of the SKILL.md; the Step 1a call is exactly the one rendered below.
- [ ] The rule paragraph is present once, directly above that call; the old "Replace `--pr <PR_NUMBER>`…" sentence is gone.
- [ ] The Step 1a entry condition reads "When `<FLAGS>` holds `--pr` or `--comment-file`"; the exit-1 rule names `<FLAGS>` for `--plan`/`--min-severity`.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'received-review-prepare/skill-text'` passes.

**Contract:**
- shape (code): Step 1a text, after the `<PLUGIN_ROOT>` note:

```markdown
**Flags (A7, C20).** Before the first Bash call, take from `$ARGUMENTS` only these flags: `--pr <number>`, `--auto`, `--comment-file <path>`, `--plan <path>`, `--min-severity <level>`. The value of `--pr`, `--comment-file`, `--plan` and `--min-severity` is the next token, without its enclosing quotes. A token is a flag only when it is outside quotes and is exactly one of these names. When there is no `--pr` and no `--comment-file` and the user names a PR in words, add `--pr '<N>'` only when `<N>` is all digits: a bare number, or the number after `/pull/` in a pull-request URL. Write the flags you took as `<FLAGS>`, each value a single-quoted literal (for example `--pr '42' --auto`); `<FLAGS>` is empty when there are none. Every other token is the request: keep it in the conversation and never put it in a Bash call. For each `--` token outside quotes that is not one of these names, say `Not a received-review-sdlc flag, read as request text: <token>` and read it as request text.
```

  followed by this call (its bash fence):

```bash
node "<PLUGIN_ROOT>/scripts/skill/received-review.js" --output-file <FLAGS>
```

- names: `<FLAGS>`; exec case description `received-review-prepare/skill-text A7 C20: no $ARGUMENTS in a fence, <FLAGS> in the prepare call, the allow-list rule present`.
- mirror: `jira-sdlc/SKILL.md:71-74` and the jira static case `tests/promptfoo/datasets/jira-sdlc-exec.yaml:576-590` (`script_path: "-e"`, counts needles, `inFence` over every fence, not only `bash`).
- shape (docs): the other Step 1a prose sites (before → after):

```diff
-When `$ARGUMENTS` holds `--pr` or `--comment-file`, or the user gives a PR number or URL, run the prepare script (R27):
+When `<FLAGS>` (A7) holds `--pr` or `--comment-file`, run the prepare script (R27):
-Replace `--pr <PR_NUMBER>` with the PR number the user gave; drop it when `$ARGUMENTS` already holds `--pr` or `--comment-file`.
+(sentence removed: the A7 rule above builds `--pr` from the user's words)
-… If `--auto` was passed in `$ARGUMENTS` but not in the manifest, treat it as `true`. …
+… If `<FLAGS>` holds `--auto` but the manifest does not, treat it as `true`. …
-… When `$ARGUMENTS` holds `--plan` or `--min-severity` but neither `--pr` nor `--comment-file`, Step 1a does not run …
+… When `<FLAGS>` holds `--plan` or `--min-severity` but neither `--pr` nor `--comment-file`, Step 1a does not run …
```

- decisions: KD2.
- sync: Task 1 A7/C20; Task 5's real-repo case passes only after this task.

### Task 5: validate-args-rule.js

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 4
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/ci/validate-args-rule.js` — the validator
- Test: `tests/promptfoo/datasets/validate-args-rule-exec.yaml` — three cases
- Create: `tests/promptfoo/fixtures-fs/args-rule-bad/setup.sh` — writes three rule-breaking skill files
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — register the dataset after `validate-spec-shape-exec.yaml`

**Notes:**
Implements the checked rule (F-arguments-command-line-rule-audit-6, -7; KD1, KD3, KD4). Tasks 10 to 12 also edit argument-hints; their new `--quality` groups are flag groups, and the main session's PR validation re-runs this case after all tasks. It depends on Task 4 because its real-repository case fails while received-review still pastes `$ARGUMENTS`. The fixture is one `setup.sh` (no `git`, so the #9161 guard line is not needed; run `node tests/promptfoo/scripts/check-fixture-guard.js` and `node tests/promptfoo/scripts/check-fixture-refs.js` to confirm). No count or floor check covers `promptfooconfig-exec.yaml` or the datasets (checked: no script counts datasets), so F-104 adds nothing.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-args-rule.js --root .` exits 0 and prints `validate-args-rule: 0 findings`.
- [ ] On the fixture it exits 1 and prints one line per code below.
- [ ] `--json` prints `{ "findings": [...] }` with `code`, `skill`, `file`, `line`, `detail`; an unknown argument exits 2.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'validate-args-rule'` passes (3 cases).

**Contract:**
- shape (code): CLI and findings:

```text
node plugins/sdlc-utilities/scripts/ci/validate-args-rule.js [--root <dir>] [--json]
  scans <root>/plugins/*/skills/<skill>/*.md, every fenced block (any info string)
  exit 0 = no findings, 1 = findings, 2 = usage or read error

ARGS_IN_REQUEST_SKILL: <skill> <file>:<line>       request-text skill has $ARGUMENTS in a fence
ARGS_NOT_FLAGS_ONLY: <skill> <file>:<line> "<group>"  $ARGUMENTS in a fence; hint group is not a flag or the skill's typed positional
ARGS_NO_HINT: <skill> <file>:<line>               $ARGUMENTS in a fence; SKILL.md has no argument-hint
validate-args-rule: <n> findings                  last line (stdout)
```

```js
const REQUEST_TEXT_SKILLS = ['error-report-sdlc', 'github-sdlc', 'harden-sdlc', 'jira-sdlc',
  'plan-sdlc', 'received-review-sdlc', 'verify-pipeline-sdlc'];
const TYPED_POSITIONALS = { 'execute-plan-sdlc': ['<plan-file-path>'], 'version-sdlc': ['major|minor|patch|<label>'] };
```

- names: `REQUEST_TEXT_SKILLS`, `TYPED_POSITIONALS`, `parseHintGroups`, finding codes above.
- mirror: `plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js:1-40` (CLI, `--root`, `--json`, exit codes) and `tests/promptfoo/datasets/validate-spec-shape-exec.yaml:5-30`.
- decisions: hint groups are the top-level `[...]` groups plus bare tokens (a `--x` token starts a group; a following non-`--` token is its value); `<...>` contents are opaque, so `<[HOST/]OWNER/REPO>` stays one value; a group is a flag group when its first token starts with `--`; a typed positional matches after its brackets are stripped. `$ARGUMENTS` counts inside quotes (KD4). Findings sort by skill, then file, then line.
- example: fixture skills written by `setup.sh` under `plugins/sdlc-utilities/skills/`: `github-sdlc/SKILL.md` (flag-only hint, `$ARGUMENTS` in a bash fence) → `ARGS_IN_REQUEST_SKILL: github-sdlc`; `free-text-sdlc/SKILL.md` (hint `"[--auto] [request]"`, `$ARGUMENTS` in a fence) → `ARGS_NOT_FLAGS_ONLY: free-text-sdlc … "[request]"`; `no-hint-sdlc/SKILL.md` (no hint, `$ARGUMENTS` in a fence) → `ARGS_NO_HINT: no-hint-sdlc`. Cases: (1) `--root {{repo_root}}` → `not-icontains "ARGS_"` and `icontains "0 findings"`; (2) the fixture → all three codes; (3) the fixture with `--json` → a javascript check that `findings.length === 3`.

### Task 6: Shared quality resolver and plan-sdlc

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/lib/quality.js` — the shared resolver
- Modify: `plugins/sdlc-utilities/scripts/skill/plan.js` — resolve `--quality` through it; stderr warning
- Modify: `docs/specs/plan-sdlc.md` — amend A4 and P24
- Modify: `site/src/content-source/specs/plan-sdlc.md` — byte copy (`cp`)
- Test: `tests/promptfoo/datasets/plan-prepare-exec.yaml` — alias cases; updated error string

**Notes:**
Spec first for #9394 (F-quality-preset-alias-resolution-1, -3, -10). The resolver lives in `lib/` so plan, execute and ship share one table. plan's `flags` shape does not change, so the two exact-match cases at `:393` and `:411` keep passing (KD5, KD7).

**Acceptance criteria:**
- [ ] `plan.js --quality speed` gives `flags` `{"quality":"full","sources":{"quality":"cli"}}` and lens `dispatchModel` `sonnet`, `dispatchEffort` `low`; `--quality quality` gives `minimal`, `opus`, `high`; neither prints a warning.
- [ ] `plan.js --quality full` gives the same output as `speed` and prints exactly one stderr line `Warning: --quality full is deprecated; use --quality speed (same preset).`; `minimal` likewise names `quality`.
- [ ] An invalid value gives the one error `Invalid --quality value "bogus"; expected one of speed|balanced|quality (deprecated: full|minimal).` and exit 1; the case at `:418-429` is updated to this string.
- [ ] A4 and P24 read as rendered below; `validate-spec-shape.js --root . --strict` exits 0; `cmp` with the site copy exits 0.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'plan-prepare'` passes.

**Contract:**
- shape (code):

```js
// plugins/sdlc-utilities/scripts/lib/quality.js
const QUALITY_NAMES = ['speed', 'balanced', 'quality'];                     // public names
const QUALITY_KEYS = { speed: 'full', balanced: 'balanced', quality: 'minimal' }; // public → internal key
const DEPRECATED_QUALITY = { full: 'speed', minimal: 'quality' };           // deprecated → public
const LEGACY_LETTERS = { A: 'full', B: 'balanced', C: 'minimal' };          // execute only (KD8)
const QUALITY_EXPECTED = 'speed|balanced|quality (deprecated: full|minimal)';
/** @returns {{ key: string|null, name: string|null, warning: string|null }} */
function resolveQuality(value, { allowLetters = false } = {}) { /* exact, case-sensitive match */ }
/** internal key → public name; null when unknown */
function qualityName(key) { /* full→speed, balanced→balanced, minimal→quality */ }
module.exports = { QUALITY_NAMES, QUALITY_KEYS, DEPRECATED_QUALITY, QUALITY_EXPECTED, resolveQuality, qualityName };
```

| Input | `key` | `name` | `warning` |
|---|---|---|---|
| `speed` | `full` | `speed` | null |
| `balanced` | `balanced` | `balanced` | null |
| `quality` | `minimal` | `quality` | null |
| `full` | `full` | `speed` | `--quality full is deprecated; use --quality speed (same preset).` |
| `minimal` | `minimal` | `quality` | `--quality minimal is deprecated; use --quality quality (same preset).` |
| `A`/`B`/`C` with `allowLetters` | `full`/`balanced`/`minimal` | `speed`/`balanced`/`quality` | null |
| anything else | null | null | null |

- shape (openspec): delta text:

```markdown
- A4: `--quality speed|balanced|quality` — plan-review quality preset: sets the model and effort of the Step 5 lens reviewers and the single reviewer (R8); `speed` is the cheapest, `quality` the costliest; resolved by `plan.js` into `flags` (P24); `full` and `minimal` are deprecated aliases of `speed` and `quality`: they resolve to the same preset and `plan.js` prints one stderr line `Warning: --quality <old> is deprecated; use --quality <new> (same preset).`; an invalid value is an `errors[]` entry and exit 1 (default: `balanced`)
  - Acceptance: exec — `plan-prepare: (quality-alias)` cases for `speed`, `quality`, `full` (one warning line) and the invalid value.
- P24: `flags` (object) — `{ quality: "full"|"balanced"|"minimal", sources: { quality: "cli"|"default" } }` (A4). `quality` is the preset's internal key (`speed` → `full`, `quality` → `minimal`), or `balanced` when the flag is absent (`sources.quality` is then `default`). An invalid value is not resolved: the output is `{ errors, flags }` only, `errors` holds one entry `Invalid --quality value "<v>"; expected one of speed|balanced|quality (deprecated: full|minimal).`, and `plan.js` exits 1 before any other prepare work (no `critiqueDir`).
```

- names: new case descriptions start `plan-prepare: (quality-alias)`; the stderr case uses `script_path: "-e"` with `child_process.spawnSync` on `plan.js` and asserts the warning appears exactly once (exit-0 stderr is not captured otherwise).
- mirror: the existing `--quality minimal` case at `plan-prepare-exec.yaml:401-411`; the `-e` spawn pattern in `tests/promptfoo/datasets/execute-plan-sdlc-context-producer-exec.yaml:177`.
- decisions: KD5, KD7, KD8.
- sync: Tasks 7 and 8 import `lib/quality.js`; Task 9 and Task 10 docs use these names.

### Task 7: execute-plan-sdlc accepts the new names

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/execute.js` — `normaliseQuality`/`resolveQuality` use `lib/quality.js`; one `warnings[]` line
- Modify: `docs/specs/execute-plan-sdlc.md` — amend A2 and P1
- Modify: `site/src/content-source/specs/execute-plan-sdlc.md` — byte copy (`cp`)
- Test: `tests/promptfoo/datasets/execute-prepare-exec.yaml` — alias cases; updated invalid-value text

**Notes:**
Implements execute A2 (F-quality-preset-alias-resolution-2, -6, -9). `VALID_QUALITY`, `LEGACY_QUALITY` and `WORKER_ROUTING` keys stay; the spec-reviewer rule still tests the key `minimal`. A resumed state value is resolved without a warning, because the user did not type it.

**Acceptance criteria:**
- [ ] `--quality speed` gives `flags.quality === 'full'`, `sources.quality === 'cli'` and no deprecation entry in `warnings`; `--quality quality` gives `minimal` and forces `specReviewer` `per-wave`.
- [ ] `--quality full` and `--quality minimal` each add exactly one `warnings[]` entry (the table text in Task 6) and route as today.
- [ ] A resumed state holding `quality: "minimal"` (fixture `project-execute-prepare-resume-planpath`) resolves to `minimal` with no deprecation entry.
- [ ] The invalid-value error and warning text name `speed|balanced|quality (deprecated: full|minimal)`; letters A/B/C still resolve silently.
- [ ] A2 and P1 read as rendered below; spec shape and `cmp` checks pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'execute-prepare'` passes.

**Contract:**
- shape (code):

```diff
-/** Normalise a quality value (legacy A/B/C accepted); null when invalid. */
-function normaliseQuality(v) { ... VALID_QUALITY.includes(v) ... LEGACY_QUALITY[v] ... }
+const { resolveQuality: resolveQualityName, QUALITY_EXPECTED } = require('../lib/quality');
+/** Normalise a quality value (new names, deprecated names, legacy A/B/C); null when invalid. */
+function normaliseQuality(v) { return resolveQualityName(v, { allowLetters: true }).key; }
 // resolveQuality(cli, stateData, errors, warnings), CLI branch:
+//   const r = resolveQualityName(cli.quality, { allowLetters: true });
+//   if (r.warning) warnings.push(r.warning);            // once, CLI only
+//   error/warning text: `expected one of ${QUALITY_EXPECTED}.`
```

- shape (openspec): delta text:

```markdown
- A2: `--quality speed|balanced|quality` — model tier (quality preset); selects the worker routing (agent and effort, R2) … [rest unchanged]. `speed` is the cheapest tier and `quality` the costliest. `full` and `minimal` are deprecated aliases of `speed` and `quality`: they route the same and add one `warnings[]` line `--quality <old> is deprecated; use --quality <new> (same preset).`; a tier read from a resumed state file never warns.
  - Acceptance: exec — `execute-prepare: (quality-alias)` cases.
```

  P1: replace "a resolved `quality` of `minimal` forces `per-wave`" with "a resolved `quality` of `minimal` (the `quality` preset) forces `per-wave`", and add "`quality` holds the internal key `full|balanced|minimal` (`speed` → `full`, `quality` → `minimal`)".
- names: new case descriptions start `execute-prepare: (quality-alias)`.
- mirror: cases `(r2)`, `(r3)`, `(s2)` at `execute-prepare-exec.yaml:430-470`.
- decisions: KD5, KD7, KD8.
- sync: Task 6 `lib/quality.js`; Task 11 docs.

### Task 8: ship-sdlc accepts and forwards the new names

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 6
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/skill/ship.js` — resolve `--quality` and the `execute_tier` answer; store and forward the public name
- Modify: `docs/specs/ship-sdlc.md` — amend A3 and R105
- Modify: `site/src/content-source/specs/ship-sdlc.md` — byte copy (`cp`)
- Test: `tests/promptfoo/datasets/ship-prepare-exec.yaml` — alias cases; `execute_tier` options; R105 expectations

**Notes:**
Implements ship A3 (F-quality-preset-alias-resolution-4, -9; KD6). Ship rejects new names today, so execute would never see them. Ship's `VALID_QUALITY` constant goes away in favour of the resolver. A resumed ledger never re-forwards an old stored value: `ship.js:1624-1625` drops a stored tier unless this run passes `--quality`, so no old `full`/`minimal` reaches execute.

**Acceptance criteria:**
- [ ] `--quality full` gives `flags.quality === 'speed'`, one `warnings[]` deprecation entry, and execute step args holding `--quality speed`; `--quality quality` forwards `--quality quality` with no warning.
- [ ] An invalid value gives the error `Invalid --quality "<v>". Valid values: speed|balanced|quality (deprecated: full|minimal)`.
- [ ] `execute_tier` offers `['speed', 'balanced', 'quality']`; an answer of `full` is stored as `speed`; an unknown answer still fails as in case `(et3)`, with the new names in its text.
- [ ] The R105 resume line prints `--quality <public name>`; case `ship-final-check: (r105)` is updated to the new value.
- [ ] A3 and R105 read as rendered below; spec shape and `cmp` checks pass.
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'ship-prepare|ship-step|ship-final-check'` passes.

**Contract:**
- shape (code): resolution sites in `ship.js`:

| Site | Today | After |
|---|---|---|
| validation `:1026-1029` | `VALID_QUALITY.includes(flags.quality)` | `const r = resolveQuality(flags.quality)`; invalid → error with `QUALITY_EXPECTED`; valid → `flags.quality = r.name`; `r.warning` → `warnings.push` once |
| `execute_tier` prompt `:2325` | options `full, balanced, minimal` | options `['speed', 'balanced', 'quality']` |
| `execute_tier` answer `:2609` | `VALID_QUALITY.includes(tier)` | `resolveQuality(tier).name`; null → the existing `fail(...)` with the new names |
| forward `:569`, `:1648` | `--quality ${flags.quality}` | unchanged (value is now the public name) |

- shape (openspec): delta text:

```markdown
- A3: `--quality speed|balanced|quality` — execution quality (model tier) for execute-plan-sdlc; `speed` is the cheapest, `quality` the costliest. `full` and `minimal` are deprecated aliases of `speed` and `quality`: ship resolves them, adds one `warnings[]` line `--quality <old> is deprecated; use --quality <new> (same preset).`, and stores and forwards the new name. When it is passed, ship forwards it. When it is absent in an interactive run, ship asks for the tier in its main context (`execute_tier`, options speed|balanced|quality), stores the answer in the ledger's `flags.quality` and forwards it; ship never picks a tier itself. Under `--auto` nothing is asked and ship forwards no tier; execute-plan-sdlc resolves it per its A6 (`balanced` unless resumed) (default: not set).
  - Acceptance: exec — `ship-prepare: (quality-alias)` cases and the `execute_tier` cases (et1)–(et3).
```

  R105: after "`--quality`" add "(the stored public name, A3)".
- names: new case descriptions start `ship-prepare: (quality-alias)`.
- mirror: cases at `ship-prepare-exec.yaml:592-620` (`--quality balanced is forwarded`) and `:3467-3520` (et1–et3).
- decisions: KD6, KD7.
- sync: Task 6 `lib/quality.js`; Task 12 docs.

### Task 9: Cost-tier tables, config schema text and site metadata

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/cost-tiers.md` — preset names in §5 tables and the ship dispatch row
- Modify: `site/src/content-source/cost-tiers.md` — byte copy (`cp`)
- Modify: `schemas/sdlc-config.schema.json` — `specReviewer` description names `--quality quality`
- Modify: `site/src/data/skills-meta.ts` — execute-plan step text names `--quality quality`; check only for the other skills of this plan (copy rule)

**Notes:**
Docs for #9394 (F-quality-preset-alias-resolution-7, -8). `validate-cost-tiers.js` does not parse preset names, but it is run to be sure. `skills-meta.ts` is also the copy-rule entry for jira-sdlc, received-review-sdlc, plan-sdlc, execute-plan-sdlc and ship-sdlc; only line 70 holds a preset name (checked).

**Acceptance criteria:**
- [ ] The Plan quality presets table rows read `` `speed` (cheapest; deprecated alias `full`) ``, `` `balanced` (default) ``, `` `quality` (costliest; deprecated alias `minimal`) ``; the routing table header reads `| Complexity | Speed (\`--quality speed\`) | Balanced (default) | Quality (\`--quality quality\`) |`; the `:97` row says `--quality <tier>` unchanged.
- [ ] One sentence under "Plan quality presets" says the old names `full` and `minimal` still work and print a deprecation line.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js` exits 0; `cmp` with the site copy exits 0; `node -e "JSON.parse(require('fs').readFileSync('schemas/sdlc-config.schema.json','utf8'))"` exits 0.

**Contract:**
- shape (docs): table rows (before → after):

```diff
-| `full` (Speed) | agent-file defaults | `sonnet` | `low` |
+| `speed` (cheapest; deprecated alias `full`) | agent-file defaults | `sonnet` | `low` |
-| `minimal` (Quality) | agent-file defaults | `opus` | `high` |
+| `quality` (costliest; deprecated alias `minimal`) | agent-file defaults | `opus` | `high` |
```

- names: preset names `speed`, `balanced`, `quality`.
- mirror: `docs/cost-tiers.md:85-91`, `:111`.
- decisions: KD5 (values unchanged; names only).
- sync: Task 10 copies the same rows into `review-loop.md`.

### Task 10: plan-sdlc skill text and user doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 6
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/SKILL.md` — argument-hint and the `--quality` paragraph
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc/review-loop.md` — the Plan quality presets table (same rows as Task 9)
- Modify: `docs/skills/plan-sdlc.md` — Flags row and any example
- Modify: `site/src/content-source/skills/plan-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/plan-sdlc` — check only: `openspec-flow.md`, `plan-format-reference.md`, `plan-template-default.md`, `state-format.md` hold no preset name, no change expected (copy rule)

**Notes:**
Docs for plan A4 (F-quality-preset-alias-resolution-7). The argument-hint is also read by `check-docs-consistency.js`, so the Flags row and the hint change together.

**Acceptance criteria:**
- [ ] The argument-hint reads `"[--spec] [--from-openspec <change-name>] [--quality speed|balanced|quality] [spec-file-path]"`.
- [ ] In plugins/sdlc-utilities/skills/plan-sdlc/*.md docs/skills/plan-sdlc.md, every remaining preset list `full|balanced|minimal` (or its table form with `\|`), `--quality full`, `--quality minimal`, `**full**` or `**minimal**` also says `deprecated` on the same line (`grep -nF -e 'full|' -e 'full\\|' -e 'quality full' -e 'quality minimal' -e '**full**' -e '**minimal**' <files>` and read each hit).
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0; `cmp` with the site copy exits 0.

**Contract:**
- shape (docs): the Flags row in `docs/skills/plan-sdlc.md` (before → after; the review-loop table takes the Task 9 rows):

```diff
-| `--quality full\|balanced\|minimal` | Plan-review preset: the model and effort of the Step 5 lens reviewers and the single reviewer. `full` = sonnet, low effort; `balanced` = the agent files' values, with opus when the plan author ran on sonnet; `minimal` = opus, high effort (`docs/cost-tiers.md` §5). `full` and `minimal` fix the model whatever the plan author ran on, so only `balanced` keeps the opposite-model rule. Lanes and Gate A always use their agent files. An invalid value stops plan-sdlc at prepare time. | `balanced` |
+| `--quality speed\|balanced\|quality` | Plan-review preset: the model and effort of the Step 5 lens reviewers and the single reviewer. `speed` = sonnet, low effort (cheapest); `balanced` = the agent files' values, with opus when the plan author ran on sonnet; `quality` = opus, high effort (costliest) (`docs/cost-tiers.md` §5). `speed` and `quality` fix the model whatever the plan author ran on, so only `balanced` keeps the opposite-model rule. `full` and `minimal` still work as deprecated aliases of `speed` and `quality` and print one warning line. Lanes and Gate A always use their agent files. An invalid value stops plan-sdlc at prepare time. | `balanced` |
```

  The review-loop sentence "`full` and `minimal` pass a fixed model …" becomes "`speed` and `quality` pass a fixed model …".
- names: `speed`, `balanced`, `quality`.
- mirror: the current `--quality` row in `docs/skills/plan-sdlc.md`.
- decisions: user-facing names only; internal keys are not mentioned in the user doc.
- sync: Task 9 table rows; Task 6 spec A4.

### Task 11: execute-plan-sdlc skill text and user doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 7
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md` — argument-hint, description, tier prompt and every `--quality` example
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc/classifying-and-waving-tasks.md` — routing table header
- Modify: `docs/skills/execute-plan-sdlc.md` — Flags row and examples
- Modify: `site/src/content-source/skills/execute-plan-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/execute-plan-sdlc` — check only: the other companions hold no preset name, no change expected (copy rule)

**Notes:**
Docs for execute A2 (F-quality-preset-alias-resolution-7). The tier prompt now offers the public names, and the re-run uses them, so a picked tier never triggers the deprecation line. The routing-table check reads cells by column, so a header change is safe.

**Acceptance criteria:**
- [ ] The tier prompt reads as rendered below; the re-run sentence says `--quality <tier>` with `<tier>` one of `speed|balanced|quality`.
- [ ] The argument-hint and the description's `Arguments:` list read `[--quality speed|balanced|quality]`.
- [ ] In plugins/sdlc-utilities/skills/execute-plan-sdlc/*.md docs/skills/execute-plan-sdlc.md, every remaining preset list `full|balanced|minimal` (or its table form with `\|`), `--quality full`, `--quality minimal`, `**full**` or `**minimal**` also says `deprecated` on the same line (`grep -nF -e 'full|' -e 'full\\|' -e 'quality full' -e 'quality minimal' -e '**full**' -e '**minimal**' <files>` and read each hit).
- [ ] `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern 'execute-prepare: .rt.'` passes; `check-docs-consistency.js` exits 0; `cmp` passes.

**Contract:**
- shape (docs): tier prompt block:

```text
Quality Tiers (worker routing):
  speed) Speed:        lower effort; Complex on execute-worker     — fast, low cost
  balanced) Balanced:  Complex on execute-worker-complex           — default ✓
  quality) Quality:    Standard on execute-worker-complex          — max correctness (spec review per wave)

Options: **speed** (Speed) | **balanced** (Balanced, default) | **quality** (Quality) | **custom** | **cancel**
Tip: Use --quality balanced to skip this prompt next time. (`full` and `minimal` still work as deprecated aliases.)
```

- names: `speed`, `balanced`, `quality`.
- mirror: `plugins/sdlc-utilities/skills/execute-plan-sdlc/SKILL.md:284-296`.
- decisions: KD5 — `flags.quality` in prepare output stays `full|balanced|minimal`; SKILL.md decision sites that test `flags.quality` keep the internal key.
- sync: Task 7 spec A2; Task 9 routing header.

### Task 12: ship-sdlc skill text and user doc

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 8
**Verify:** lint

**Files:**
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc/SKILL.md` — argument-hint, description and every `--quality` value list
- Modify: `docs/skills/ship-sdlc.md` — Flags row and examples
- Modify: `site/src/content-source/skills/ship-sdlc.md` — byte copy (`cp`)
- Modify: `plugins/sdlc-utilities/skills/ship-sdlc` — check only: `config-format.md`, `entry-modes.md`, `openspec-steps.md`, `reference.md`, `state-format.md`; change a preset list only if one is found

**Notes:**
Docs for ship A3 (F-quality-preset-alias-resolution-7).

**Acceptance criteria:**
- [ ] The argument-hint and the description's `Arguments:` list read `[--quality speed|balanced|quality]`.
- [ ] In plugins/sdlc-utilities/skills/ship-sdlc/*.md docs/skills/ship-sdlc.md, every remaining preset list `full|balanced|minimal` (or its table form with `\|`), `--quality full`, `--quality minimal`, `**full**` or `**minimal**` also says `deprecated` on the same line (`grep -nF -e 'full|' -e 'full\\|' -e 'quality full' -e 'quality minimal' -e '**full**' -e '**minimal**' <files>` and read each hit).
- [ ] `check-docs-consistency.js` exits 0; `cmp` with the site copy exits 0.

**Contract:**
- shape (docs): `docs/skills/ship-sdlc.md` (before → after; the SKILL.md argument-hint and description change the same way):

```diff
-/ship-sdlc [--auto] [--steps <csv>] [--quality full|balanced|minimal] [--plan <path>] …
+/ship-sdlc [--auto] [--steps <csv>] [--quality speed|balanced|quality] [--plan <path>] …
-| `--quality <full\|balanced\|minimal>` | Forwarded to execute-plan-sdlc as `--quality` (model tier). In interactive runs … | Not set (asked in interactive runs) |
+| `--quality <speed\|balanced\|quality>` | Forwarded to execute-plan-sdlc as `--quality` (model tier): `speed` is the cheapest, `quality` the costliest; `full` and `minimal` still work as deprecated aliases. In interactive runs … | Not set (asked in interactive runs) |
-/ship-sdlc --auto --quality minimal --plan .claude/plans/my-feature-plan.md
+/ship-sdlc --auto --quality quality --plan .claude/plans/my-feature-plan.md
-| `argument-hint` | `[--auto] [--steps <csv>] [--quality full\|balanced\|minimal] [--draft] [--dry-run]` |
+| `argument-hint` | `[--auto] [--steps <csv>] [--quality speed\|balanced\|quality] [--draft] [--dry-run]` |
```
- names: `speed`, `balanced`, `quality`.
- mirror: the current `--quality` row in `docs/skills/ship-sdlc.md`.
- decisions: KD6.
- sync: Task 8 spec A3.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Every code task adds or updates exec cases; Task 2 adds a static case for `EXPLICIT_FLAG_SKILLS` (fixed after the Step 3 critique) |
| no-ci-bypass | error | PASS | No step skips or disables CI checks |
| no-auto-eval | error | PASS | Only targeted --filter-pattern runs on the exec-only config; no behavioural or headless runs |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to #9390 and #9394; non-goals are explicit |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable |
| scripts-over-llm-logic | error | PASS | Validator, quality.js and jira.js parsing are scripts; the allow list stays in prose by design because request text cannot go to a script (KD4) |
| yagni | warning | PASS | quality.js is needed by three scripts; no unused parameters |
| cross-skill-consistency | error | PASS | Ship, execute and plan share one resolver; the received-review allow list works under ship dispatch |
| pr-link-github-issue | error | PASS | #9395 is an internal register id, not a GitHub issue; no Fixes/Closes keyword applies |
| dry | warning | PASS | One shared resolver replaces three name lists; the rule is written once in adding-skills.md |
| kiss | warning | PASS | Internal preset keys stay and only the accepted inputs change (KD5) |
| spec-first | error | PASS | Specs (Tasks 1, 6, 7, 8) land before or inside the tasks that change SKILL.md files, which depend on them |
| project-agnostic | error | PASS | Behaviour ships in plugin code; the repo-local edit is only the dogfood consistency checker |
| flag-coherence-cross-skill | error | PASS | jira now cites flags.forceRefresh; plan and execute decisions cite resolved fields |
| no-opposite-logical-vectors | error | PASS | The jira gates at :94 and :143 use the same flags.forceRefresh field |
| flag-resolution-single-source | warning | PASS | quality.js is the single resolver; ship forwards the resolved name; the allow-list re-parse is the documented exception |
| state-premise | error | PASS | Context and Goal name both root problems |
| smallest-viable-cut | warning | PASS | Two bundled items; each task is tied to one of them with its reason in the Key Decisions |
| failure-audience | warning | PASS | The Context section names who is hurt if this ships wrong |
| explicit-non-goals | warning | PASS | A non-goals list is present |
| ambiguity-stops-and-asks | error | PASS | KD1-KD8 record the choices with rationale |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic is changed |
| agent-dispatch-script-driven | error | PASS | Dispatch parameters are unchanged; ship forwards its resolved args |
| flag-semantic-consistency-cross-skill | error | PASS | jira --force-refresh keeps github.js semantics (grep evidence in Task 3); the --quality meaning is unchanged |
| workspace-mode-compatibility | error | PASS | No state, config path or git changes; quality.js and the validator are pure and take --root |
| prompt-cache-hit-ratio | warning | PASS | No volatile bytes are added to dispatched prompts |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1, B4)

**Why:** Task 6 adds `--quality speed|balanced|quality` with the quoted warning `--quality full is deprecated; use --quality speed (same preset).`, and Task 3 adds `flags.forceRefresh` to `jira.js`, so the CLI and prepare-output contracts change. Task 6 also adds a shared `scripts/lib/quality.js` module required by plan.js, execute.js and ship.js (B4).

**Severity hint:** high

**Patch:** Verify the new CLI flag surface: `flags.forceRefresh` in jira.js output, the received-review `<FLAGS>` allow list, and `--quality speed|balanced|quality` with deprecated aliases and the new `scripts/lib/quality.js` import in plan.js, execute.js and ship.js.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Verify the new CLI flag surface: `flags.forceRefresh` in jira.js output, the received-review `<FLAGS>` allow list, and `--quality speed|balanced|quality` with deprecated aliases and the new `scripts/lib/quality.js` import in plan.js, execute.js and ship.js.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: docs-skill-sync (B1)

**Why:** Tasks 10-12 change the frontmatter `argument-hint` to `[--quality speed|balanced|quality]` in the SKILL.md files and the `docs/skills/*.md` Flags rows, and Task 4 changes received-review-sdlc's argument handling to the A7 allow list.

**Severity hint:** high

**Patch:** Check that each changed `argument-hint` and `--quality` Flags row in the plan, execute-plan and ship SKILL.md files matches `docs/skills/*.md`, and that received-review's documented flags match the A7 allow list.

**Action (dimension):** edit `.sdlc/review-dimensions/docs-skill-sync.md` — Check that each changed `argument-hint` and `--quality` Flags row in the plan, execute-plan and ship SKILL.md files matches `docs/skills/*.md`, and that received-review's documented flags match the A7 allow list.

**Action (Copilot mirror, X1):** regenerate .github/instructions/docs-skill-sync.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Tasks 1-12 edit many `.md` files (for example `docs/adding-skills.md` in Task 2 and `docs/specs/jira-sdlc.md` in Task 1) that the code-quality trigger globs do not cover.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

_2 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 1 | 4 | 0 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 0 | 3 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 #9390: plugin-wide rule, $ARGUMENTS only in flags-only skills, audit, allow list otherwise | Task 1, Task 2, Task 4, Task 5 | covered |
| 2 #9390: deterministic CI validator with exec cases | Task 5 | covered |
| 3 #9390: spec/docs text stating the rule | Task 1, Task 2 | covered |
| 4 #9390: jira.js parses --force-refresh with exec case; remove raw-args read from jira-sdlc | Task 1, Task 3 | covered |
| 5 #9394: --quality aliases speed/balanced/quality in every skill and script accepting --quality | Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12 | partial |
| 6 #9394: old names keep working as deprecated aliases with one warning line | Task 6, Task 7, Task 8 | covered |
| 7 #9394: spec first, cost-tiers, user docs, site copies, exec cases for alias resolution | Task 6, Task 7, Task 8, Task 9, Task 10, Task 11, Task 12 | covered |

**Verdict:** …Ready for archive (with noted improvements).

## Final Shape

- A new validator, `validate-args-rule.js`, guards the rule "request text never goes on a command line" across every skill. It passes on the repository.
- Seven skills keep pasting `$ARGUMENTS`, because their arguments are flags only (plus one validated positional for execute-plan-sdlc and version-sdlc).
- received-review-sdlc now takes an allow list, like github-sdlc and jira-sdlc.
- The rule is written once, in `docs/adding-skills.md`.
- jira-sdlc reads `flags.forceRefresh` from `jira.js`, not the raw arguments.
- Every `--quality` input goes through `scripts/lib/quality.js`.
  - `speed`, `balanced` and `quality` are the documented names.
  - `full` and `minimal` still work and print one deprecation line.
  - Prepare outputs, state files and routing tables keep their old internal keys, so no existing run or resume breaks.
- cost-tiers, specs, skill text, user docs and their site copies all show the new names.

## OpenSpec Appendix

Not applicable — no OpenSpec change
