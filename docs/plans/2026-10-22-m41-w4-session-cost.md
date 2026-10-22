# Session-cost script and wave-metrics aggregator (W1.13) Implementation Plan

**Goal:** Add two zero-dependency CI scripts: `session-cost.js` prices Claude Code session transcripts per orchestration tag from a cited price table, and `wave-metrics.js` builds the milestone summary table from `m*/metrics.json`. They come with a promptfoo exec dataset of 11 cases.
**Architecture:** The root problem is that every wave's metrics record says `cost: "not recorded"`, and the milestone summary is typed by hand, because no script reads transcripts or sums the records. `session-cost.js` reads transcripts under `--projects-dir` only. It dedupes them by message id, books them per tag, and prices them in integer pico-dollars from `session-prices.json`. The price table is copied from the Anthropic pricing page at execution time. It supports prompt-size tiers, a fast-mode block and a US-geo multiplier (rulings w13-pricing and w13-modifiers). Anything the table cannot price goes to `unpriced`, and the totals say so. `wave-metrics.js` maps the 16 summary columns plus `Cost USD` to fixed record paths. It sums them and marks partial coverage as `(k of n waves)`.
**Source:** /workspace/sdlc-marketplace/.sdlc/orchestration/m4.1/wave-4-plan-source.md (item W1.13, consolidated-plan.md at c18444f; todo #9134; tracking todo #9011), with rulings w13-pricing and w13-modifiers and the owner/arbiter answer to the planner STOP (cont 1).
**Verification:** `T=/tmp/claude-1000/pf-tmp-exec-m41/w4-$(date +%s); mkdir -p "$T"; cd tests/promptfoo && GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main TMPDIR="$T" npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 2 --filter-pattern "session-cost|wave-metrics" --no-cache` passes 11/11.

---

## 0. How to execute this plan

This plan is written for an executor model that works **one item at a time with no memory of the review**. Rules:

1. Work in **milestone order** (§3). Inside a milestone, pick any item whose **Depends on** list is satisfied. Never start an item from a later milestone.
2. Before editing, read the item's **Files** and **Current state** and confirm every quoted line is present (`sed -n 'N,Mp' <file> | tr -d '\r'` — the working tree is a CRLF checkout; line numbers match HEAD). In quoted current-state text a backslash-backtick (`\``) is a backtick nested inside the quote, not part of the file. Line numbers are HEAD (`0c0cdcc`). When an earlier item or sub-item has already edited the same file, locate each quoted line with `grep -n` and proceed only if it occurs exactly once; apply multi-site edits within one item bottom-up (highest line first). If a quoted line, path, subcommand or flag cannot be found that way, **stop and report** the discrepancy. Do not search for an alternative and do not guess.
3. Apply **only the Change**. Leave everything under **Must not touch** byte-identical. Do not "improve" adjacent text.
4. Run the item's **Verification** commands and compare with the stated expected result. Testing policy (AGENTS.md): promptfoo only, never `node:test`/Jest. Exec-only configs (`tests/promptfoo/promptfooconfig-exec.yaml`, `promptfooconfig-exec-hooks.yaml`) may be run targeted at any gate with `--filter-pattern`. Never run the full behavioral suite (`promptfooconfig.yaml`); at most **one** targeted behavioral case as the final check. No run-fix-rerun loops.
5. Update the named promptfoo **dataset** under `tests/promptfoo/datasets/` when the item says so (new behaviour → new case; changed strings → changed assertion). Every new case's `description` starts with the item's `--filter-pattern` string followed by `: `, so the targeted run selects it; `--filter-pattern` is a regular expression, so escape `(`, `)` and `+`.
6. Commit per item with the repository convention `type(#issue): skill - description` (e.g. `fix(#NNN): ship-sdlc - remove worktree gotchas`), ending the message with the attribution line the session provides. Do not commit on `main`.
7. Keep `R<n>` / `R-slug` spec anchors in SKILL.md text; drop GitHub issue numbers from model-facing prose; state each rule once with its reason.
8. If an item's **Change** contradicts the code you find (a function already exists, a flag already parsed, a spec line already removed), stop and report. The plan is not the source of truth; the code is.
9. After M3, if your item edits the SKILL.md or spec of a skill whose `docs/specs/<skill>.md` has no `## Inputs and flags` line, first do W3.5 for that spec in a separate commit.

**How §0 applies to this plan (read with §0, not instead of it):**

- **Base and line numbers.** The base is `c18444f` (origin/main, v0.30.0), not `0c0cdcc`. Every line number below is at `c18444f`. Probe: `git log --oneline -1` printed `c18444f feat(#9010): evals - local claude plugin eval smoke suite (W1.7) (#34)`. Item line numbers from `8f7ca61` are re-located by content (R-dated).
- **Line endings.** This worktree is an LF checkout, not CRLF. Probe: `grep -c $'\r'` printed `0` for both edited files, and `git ls-files --eol` printed `i/lf w/lf` for each. `tr -d '\r'` stays in the commands; it is harmless. New files are written with LF endings.
- **Anchors.** Every edit site is located by content: `grep -n -F -x -- '<line>' <file>` must print exactly one line before the edit. Each task names its anchor and the probe result at `c18444f`.
- **One item, one milestone.** The whole plan is item W1.13. "Milestone order" means task order (Task 1 → Task 8).
- **Commits (rule 6).** No task commits. The single `/sdlc:ship-sdlc --plan <this file> --steps execute,commit --rebase skip --quality balanced` run makes exactly one commit after Task 8. Its subject is `feat(#9011): ci - session-cost and wave-metrics scripts (W1.13)` (63 characters, probe `printf '%s' '<subject>' | wc -c` printed `63`, ≤ 72). After the ship run, check that `git log -1 --format=%s` equals the planned subject. On a mismatch, report it to the orchestrator and do not amend.
- **Datasets (rule 5).** One new dataset, `tests/promptfoo/datasets/session-cost-exec.yaml` (Task 6). Every description starts with `session-cost: ` or `wave-metrics: `, and the targeted run uses `--filter-pattern "session-cost|wave-metrics"`. Probe: `grep -rlE "session-cost|wave-metrics" tests/promptfoo/datasets` printed nothing, so no existing case is selected.
- **Rules 7 and 9.** Not applicable: no SKILL.md and no spec is edited (see Research Findings, spec grep).
- **Must not touch (every task).** `plugins/sdlc-utilities/scripts/lib/usage.js` and the ledger `--usage` contract (W1.1); `docs/cost-tiers.md` (W1.8 records figures there); every file under `.sdlc/` (both the owner checkout `/workspace/sdlc-marketplace/.sdlc/` and any `.sdlc/` in this worktree: the orchestrator runs the scripts and writes the metrics and cost files); agent and skill frontmatter and every file under `plugins/sdlc-utilities/skills/`, `agents/`, `hooks/`; `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js`; `.claude/skills/validate-plugin-consistency/check-consistency.js` (if it flags the new scripts, STOP); `tests/promptfoo/promptfooconfig.yaml`, `promptfooconfig-exec-hooks.yaml`, every other dataset and fixture; everything under `.github/`; every file under `docs/` except this plan file; `README.md`, `AGENTS.md`, `CHANGELOG.md`, the `version` value in `plugin.json`; `site/`. Each task's own **Must not touch** line adds to this list.
- **Transcripts.** No agent reads, tallies or samples the owner's real Claude Code transcripts (`~/.claude/projects/**`), neither during execution nor during verification (ruling w13-modifiers). Every test and probe runs the script with `--projects-dir` pointing at a fixture copy. The script reads real transcripts only when a user runs it.
- **Credentials and behavioural runs.** No credentialed command and no behavioural promptfoo case (item Verification 5). Never run `claude plugin eval`.

## Context

**What problem does this change solve?**

- Every wave's metrics record holds `cost: "not recorded"`. No script reads Claude Code session transcripts (the per-session JSONL logs Claude Code writes under `~/.claude/projects/`), so nobody can say what a wave cost.
- The milestone table in `metrics-summary.md` is typed by hand from the per-wave records. Hand-summing 14+ records is slow and error-prone.

**What prompted this change now?**

- The owner asked for the cost script plus the metrics aggregator as a plan item (todo #9134, log 2026-10-20). They placed it in M4.1 wave 4, so every M5 wave record can carry a cost (owner W1.13-OK, R-placement).
- The orchestrators and planners mostly run on Opus, sometimes in fast mode. Their cost is the main thing to measure (ruling w13-modifiers).

**What does success look like?**

- The orchestrator runs `session-cost.js --sessions <map> --out m<k>/cost-wave-<n>.json`. It gets a per-tag USD figure with a cited price source, and every token it could not price is listed in `unpriced`.
- The orchestrator runs `wave-metrics.js` and gets the milestone table, with the same 16 columns plus `Cost USD`, without typing it.
- 11 promptfoo exec cases pass on synthetic fixtures. `check-consistency.js` and `validate-cost-tiers.js --strict` stay at exit 0.

**Who fails if this ships wrong?**

- The orchestrator and the owner read cost figures and milestone totals from these scripts. A wrong price, or a silently dropped message, gives them a false number they would act on, for example when they pick models or tiers (W1.8).
- No plugin user is affected. The scripts live under `scripts/ci/`, no skill calls them, and no hook runs them.

**Non-goals (deliberately not built):**

- No ledger change: `lib/usage.js` and the `--usage` payload stay as they are (W1.1).
- No figures in `docs/cost-tiers.md` (W1.8 does that).
- The scripts never write metrics or cost files under `.sdlc/orchestration/`. The orchestrator does.
- No batch-API pricing, because Claude Code transcripts are not batch requests. No Priority Tier pricing, because the page states no Priority Tier price.
- No price rows beyond the current lineup whose API ids the models overview page states (Key Decision KD8).
- No time-window filtering (LFP's old `cost.py` mode): booking is by tag only, as the item says.
- No CI workflow wiring and no GitHub Actions job.

## Research Findings

**Spec check (plan-source requirement).** Probe: `grep -rniE 'transcript|\.jsonl|session[- ]cost|wave-metrics|pricing|price' docs/specs docs/architecture.md | wc -l` printed `0` at `c18444f`. `grep -rn "scripts/ci/" docs/specs docs/architecture.md` hits only `plan-sdlc.md:148` (validate-plan-format.js), `review-sdlc.md:28` (validate-dimensions.js), `harden-sdlc.md:39,144` (validate-guardrails.js), and `docs/architecture.md:32` (`│           ├── ci/                    # CI validation and maintenance`). None of these lines lists the ci/ scripts exhaustively. A cost reporter and an aggregator fit "maintenance". **No spec line becomes untrue, so no spec-consequence commit and no QUESTION are needed.**

**Script conventions** (`plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js:1-33, 296-313`):

- A shebang, then a `/** … Usage: … Options: … Exit codes: … */` header, then `'use strict';`.
- `node:fs` and `node:path` only, with `const LIB = path.join(__dirname, '..', 'lib');`.
- A hand-written `parseArgs(argv)` loop.
- A top-level `try { … process.exit(code) } catch (err) { process.stderr.write('<name> error: …'); process.exit(2); }`.
- The default root comes from `resolveSdlcRoot()` (`lib/config.js:168-170`, exported at `:1066`), which resolves the main worktree, not the cwd.

**Exec test harness:**

- `tests/promptfoo/providers/script-runner.js:90-168` runs `node <script_path> <script_args split on whitespace>` and returns stdout. It appends stderr only on a non-zero exit, so a case cannot read the exit code directly; a failed run shows up as non-JSON output.
- `tests/promptfoo/scripts/extract-skill-content.js:48-67` copies `project_root: "file://fixtures-fs/<dir>"` to a fresh `os.tmpdir()` directory, and `:76-80` replaces `{{project_root}}` in `script_args`.
- `repo://` script paths resolve against the repo root (`:71-73`).
- `javascript` assertions with `JSON.parse(output)` are the house style (`validate-cost-tiers-exec.yaml:37-42`, `commit-prepare-exec.yaml:337`).

**Registration point.** `tests/promptfoo/promptfooconfig-exec.yaml:82` is the last `tests:` entry, `  - file://datasets/post-tool-validate-argv-exec.yaml`, and the file ends with a newline there.

**README.** `plugins/sdlc-utilities/scripts/README.md` has no per-file ci/ list. It has only line 10 (directory line) and line 19 (`- **ci/** — prefixed with \`validate-\` for validators, otherwise descriptive`). Line 23 is `## Skill-to-Script Mapping`, so the new ci/ section goes before it (R-readme).

**check-consistency.** `discoverScripts()` scans only `scripts/skill/` (`check-consistency.js:125-128`). The pre-flight recorded a baseline exit 0 and no rule covering `scripts/ci/`, so the new files will not be flagged. This is an unverified prediction until Task 8 runs it.

**Transcript format** (pre-flight §3, checked by the orchestrator on 2026-10-22; not re-sampled here, per ruling w13-modifiers):

- Assistant lines carry `message.id`, `message.model`, `message.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`, `message.usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`, a top-level `timestamp` and `sessionId`.
- `type: "api-request-blob"` lines have `message.role: "assistant"` and no `id`, `model` or `usage`. They are skipped (R-skip-lines).
- Wave 3's metrics record: the pre-flight read `cost: {"evalRunsUsd":"1.2627","sessions":"not recorded"}`. Ruling w13-pricing asks the orchestrator to keep `cost: "not recorded"` with a separate `evalSpendUsd` key. Either way `Cost USD` reads `not recorded`. The fixtures are synthetic and use the pre-flight shape.
- Subagent transcripts live under `<session-id>/subagents/*.jsonl` next to `<session-id>.jsonl`.
- The usage object also carries `speed`, `inference_geo` and `service_tier` keys.

**Modifier field values (public API docs, fetched 2026-10-22):**

- Fast mode page: "The response `usage` object includes a `speed` field that indicates which speed was used, either `"fast"` or `"standard"`."
- Data residency page: `inference_geo` values are `"global"` ("Default.") and `"us"`. "Only `"us"` and `"global"` are available."
- The pricing page states no `service_tier` price. It mentions no Priority Tier pricing at all. Probe: `grep -n -i "service.tier\|priority"` over the fetched page printed nothing.

**Pricing page** (`https://platform.claude.com/docs/en/about-claude/pricing`, WebFetch 2026-10-22; the pre-flight confirms `docs.claude.com/en/docs/about-claude/pricing` 302-redirects there). These are the lines the table quotes:

- Model table header: `| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |`.
- `Claude Fable 5.1 | $10 / MTok | $12.50 / MTok | $20 / MTok | $0.25 / MTok<sup>1</sup> | $50 / MTok`
- `Claude Opus 5.5 | $4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok<sup>2</sup> | $20 / MTok`
- `Claude Sonnet 5.5 | $2 / MTok | $2.50 / MTok | $4 / MTok | $0.10 / MTok<sup>2</sup> | $10 / MTok`
- `Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok`
- `Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok`
- Footnote 2: "Cache hits and refreshes on Claude Opus 5.5 and Claude Sonnet 5.5 are priced at 0.05x the base input price."
- **Tier definition (Long context pricing):** "Claude Haiku 5.5 is priced by prompt length: a request whose prompt is over 100,000 tokens pays higher prices. A request's prompt length counts all of its input tokens, including cache reads and cache writes. Each request is priced on its own: a request over the threshold pays the higher prices even when part of its prompt is a cache hit, and earlier requests keep the prices they were billed at."
- **Data residency:** "For Claude 4.6 and later models, specifying US-only inference through the `inference_geo` parameter incurs a 1.1x multiplier on all token pricing categories, including input tokens, output tokens, cache writes, and cache reads. On Claude Haiku 5.5, the multiplier also applies to the higher prices for prompts over 100,000 tokens … Global routing (the default) uses standard pricing."
- **Fast mode:** `| Claude Opus 5.5 | $8 USD / MTok | $40 USD / MTok |` (columns Input, Output), plus "Prompt caching multipliers apply on top of fast mode pricing." and "Data residency multipliers apply on top of fast mode pricing."
- **Cache multipliers** (Prompt caching table): "5-minute cache write | 1.25x base input price", "1-hour cache write | 2x base input price", "Cache read (hit) | 0.1x base input price (0.025x on Claude Fable 5.1 and Claude Mythos 5.1; 0.05x on Claude Opus 5.5 and Claude Sonnet 5.5)".

**Model ids.** The models overview page (`https://platform.claude.com/docs/en/models/overview`, fetched 2026-10-22) gives the Claude API IDs `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`, with aliases identical to the IDs. The pre-flight saw `claude-opus-5-5` and `claude-sonnet-5-5` in real transcripts.

**LFP precedent** (`research-lfp-metrics.md` §3): dedupe by message id keeping the largest usage, drop `<synthetic>`, include each session's subagents, and book by session tag. USD is "a 12-decimal string from integer pico-dollars". `unpriced` models are listed and `aux` is kept separate. Subagent `output_tokens` are recorded at stream start, so output is a floor.

**Metrics records** (`.sdlc/orchestration/metrics-schema.md`, read-only):

- Each `m<k>/metrics.json` is a JSON array of `sdlc-wave-metrics-1` records.
- A field nobody captured is `"not recorded"`.
- The 16 summary headers are exactly those in `metrics-summary.md`'s milestone table (pre-flight §4).
- In `m4.1/metrics.json`, wave 3 has `cost: {"evalRunsUsd":"1.2627","sessions":"not recorded"}`, which has no `usd` key, so its `Cost USD` is `not recorded` (R-metrics).

**Discovery brief.** None. The planner stopped the plan-explore orchestrator during the first STOP (classifier denial), so this plan used plan-sdlc's inline-exploration fallback. Every fact above was read directly by the planner and is cited by file:line or by fetch date. There are no `F-<DIM>-<n>` ids, so each task says "out-of-scope addition: no brief" under **Findings** (G15).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| Price row shape ("one row per model") | yes | optional `tiers` array per model, picked per message by prompt size | ruling w13-pricing (§0 rule-8 reading; PR Plan readings) |
| Fast mode and US geo ("price per model") | yes | optional `fast` block (Opus 5.5 only) and top-level `geoMultiplier: {us: 1.1}`; other values → `unpriced` | ruling w13-modifiers (§0 rule-8 reading; PR Plan readings) |
| Fast-mode cache prices | no | the `fast` block stores the page's cache multipliers (`cacheMultipliers`), and the script multiplies them by the fast input price | the page states "Prompt caching multipliers apply on top of fast mode pricing" with the multipliers, so this copies the stated rule instead of storing derived figures (KD3) |
| `unpriced` entry shape | yes | `{model, reason, messages, tokens}` objects, not a bare model list; totals carry `complete` and `unpricedMessages` | ruling w13-modifiers |
| Case count | yes | 11 cases (item 6 + 2 tier + 3 modifier), not 6 | rulings w13-pricing and w13-modifiers; Verification (1) expects 11 |
| `service_tier` | no | absent or `"standard"` is priced; any other value goes to `unpriced` | the page states no price for other tiers; ruling w13-modifiers ("a service_tier the page prices differently") |
| Price table rows | no | the four current-lineup models whose API ids the overview page states | narrowest scope that covers the transcripts seen (KD8); other models land in `unpriced`, which is visible |
| Wave-metrics column mapping | no | each column reads one fixed record path (Task 3 table) | the item names the columns, not the paths; `metrics-schema.md` gives one obvious path per column (KD6) |
| Missing field in a metrics record | no | treated like `"not recorded"` | "Nothing is estimated"; a missing value is not zero |
| `unsplitCacheWriteLines` | no | counts a line only when `cache_creation` is absent and `cache_creation_input_tokens > 0` | a line with no cache write has nothing to split (KD5) |
| Neither `--json` nor `--out` | no | exit 2 with "one of --json or --out is required" | the item names only those two outputs; the cleanest behaviour is a refusal, not a third format (KD7) |
| Discovery brief | no | inline exploration, no `F-` ids | the orchestrator was stopped at the first STOP; plan-sdlc's error-fallback path; the learnings-log line it prescribes is not written (the planner brief allows writes only under `docs/plans/`) |
| Host-specific `TMPDIR` in the run command | no | keeps `TMPDIR=<fresh subdir of /tmp/claude-1000/pf-tmp-exec-m41>` | the plan source prescribes this exact env prefix for this orchestration host; the command is a verification step, not a committed file |
| Task 4 size | no | one task with 12 small fixture files, over the 5-file guideline | data only; the map and the transcripts it names must stay consistent (KD9) |
| Commit per item (§0 rule 6) | no | no task commits; one ship run makes one commit | plan-source owner rule |
| Real-transcript field check | yes | not done by the executor; relies on pre-flight §3 (2026-10-22) | ruling w13-modifiers: no agent reads the owner's transcripts |

## Plan readings (copy into the PR body)

- **R-tiers (§0 rule-8 reading of "one row per model", ruling w13-pricing).** A model row may carry `tiers`. The tier is chosen per message by prompt size = input + cache reads + cache writes, as the page defines it (quoted in Research Findings).
- **R-modifiers (§0 rule-8 reading of "price per model", ruling w13-modifiers).** There is a `fast` block for Opus 5.5 ($8 / $40, cache multipliers as stated on the page) and `geoMultiplier: {us: 1.1}` on all categories, on top of the row or tier price. Every other `speed`, `inference_geo` or `service_tier` value, and fast on a model without a fast block, goes to `unpriced` as `{model, reason, messages, tokens}`.
- **R-metrics.** `Cost USD` sums `cost.usd` only. Wave 3's `{evalRunsUsd, sessions}` shows as `not recorded`.
- **R-skip-lines, R-readme, R-dated, R-installed, R-placement:** as in the plan source. Placement "proposed" was confirmed by the owner (W1.13-OK), and `scripts/ci/` is the location the item proposed.

## Key Decisions

- **KD1 — Integer pico-dollars with BigInt, not floating point.** Prices are parsed from their JSON decimal text into whole pico-dollars per token (price × 10⁶, at most 6 decimals). Every product is a `BigInt`. The item asks for this, as in LFP `orch cost`. Floating point would drift on sums like 0.1 + 0.2. BigInt is needed because tokens × rate can exceed 2⁵³ (about 9·10¹⁵). For example, 10⁹ output tokens at $40 / MTok (fast Opus 5.5) is 10⁹ × 4·10⁷ pico = 4·10¹⁶. Summing across sessions and applying multipliers only makes the numbers larger.

- **KD2 — Multipliers are exact or the script refuses.** The geo multiplier (1.1) and the fast cache multipliers (1.25, 2, 0.05) are parsed as exact fractions. The script multiplies them into the pico rate per token. If the result is not a whole number, it exits 2 instead of rounding. Every page value today gives a whole number (for example $0.125 × 1.1 = 137 500 pico). A silent rounding rule would be a guess.

- **KD3 — The fast block copies the page's multipliers, not derived prices.** The page states the fast input and output prices and says the cache multipliers apply on top. So `fast` stores `input`, `output` and `cacheMultipliers`, each copied verbatim. The script computes the fast cache rates. Storing "$10 / $16 / $0.40" would be figures the page never prints.

- **KD4 — One check order with one reason per message.** For each message the script checks, in order:

  1. model in table;
  2. `service_tier`;
  3. `speed` (and the fast block);
  4. `inference_geo`;
  5. per-category price recorded.

  The first failure decides the message's `unpriced` reason, so one message is never counted twice. A category whose price is `"not recorded"` sends only that category's tokens to `unpriced`. The message's other categories are still priced.

- **KD5 — Dedupe scope is the tag.** One usage per `message.id` within a tag, keeping the line with the largest token sum (input + output + cache read + cache creation; on a tie, the first line). This matches LFP booking by tag. If two tags list the same session, each books it. That is how the map defines it, and the orchestrator owns the map.

- **KD6 — Fixed column-to-path map for wave-metrics.** Each of the 17 columns reads one documented path (Task 3 table). A column whose path is missing or `"not recorded"` in a record counts that record as unrecorded. Free-text cells such as "n/a (no plan phase)" in the hand-made table are not reproduced. The item says "Nothing is estimated", and the script prints only what the records hold.

- **KD7 — Refuse rather than guess an output mode.** With neither `--json` nor `--out`, `session-cost.js` exits 2. With both, it writes the file and prints the same JSON. `wave-metrics.js` prints markdown by default and a JSON array with `--json`, as the item says.

- **KD8 — Price rows: current lineup only.** The real table holds `claude-fable-5-1`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5`. Those are the models whose API ids the overview page states. Legacy rows would need ids from per-model pages, and the pre-flight saw only Opus 5.5 and Sonnet 5.5 in transcripts. A model outside the table is reported in `unpriced` and never guessed, so a gap is visible, not wrong. Smallest viable cut: one more fetched page per legacy model was judged not worth it now.

- **KD9 — One shared session-cost fixture, one sessions map.** All 9 session-cost cases run the same command on the same fixture, and each asserts its own tag. This keeps the fixture small: 10 synthetic transcripts, one prices file, one map. It also lets the aux case check `total` against the real sum of the other tags.

- **KD11 — One copy of the money code.** `session-cost.js` exports `toPico(decimalString)` and `formatPico(bigint)`. Its entry point runs only under `if (require.main === module)`. `wave-metrics.js` requires them from `./session-cost` to sum `cost.usd`. This keeps a single decimal parser and formatter (dry guardrail) without a new `lib/` module, which the item's file list does not include. Each script keeps its own small `parseArgs`, as every ci/ script does (`validate-cost-tiers.js:38-58`). A shared parser for three flags would be more code than the duplicate.

- **KD10 — Workspace modes.** Both scripts read only the paths they are given. They write only `--out`. They never touch `.sdlc/` state. `wave-metrics.js`'s default root comes from `resolveSdlcRoot()`, which is the main worktree in both `ship.workspace=branch` and `ship.workspace=worktree` modes, so a run from a linked worktree finds the owner's `.sdlc/orchestration`. `session-cost.js` defaults to `~/.claude/projects`, which does not depend on the cwd.

## Contract Examples

**Contract (code)** — from Task 2:

```markdown
**Contract:**
- shape (code): `node session-cost.js --sessions <map.json> [--projects-dir <dir>] [--prices <file>] [--out <file>] [--json] [--help]`; exit 0 ok / 1 session not found / 2 argument, IO, parse or price-table error.
- names: schema `sdlc-session-cost-1`; reasons `model not in price table`, `service_tier: <v>`, `speed: <v>`, `fast: no fast price for model`, `inference_geo: <v>`, `price not recorded: <category>`.
- mirror: `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js:1-33,296-313` (header, parseArgs, try/exit 2).
- decisions: KD1, KD2, KD4, KD5, KD7.
- sync: Task 4 fixture and Task 6 assertions use these names and the output shape verbatim.
```

**Contract (docs)** — from Task 7:

```markdown
**Contract:**
- shape (docs): MODIFY `plugins/sdlc-utilities/scripts/README.md`; add `### CI Scripts (\`ci/\`)` after the Naming Conventions list (before `## Skill-to-Script Mapping`), a two-row table (Script | Purpose); audience: maintainers.
- names: heading `### CI Scripts (\`ci/\`)`; rows `session-cost.js`, `wave-metrics.js`.
- mirror: the table style of `## Shared Modules (\`lib/\`)` in the same file.
- decisions: R-readme (no per-file ci/ list exists; a short section naming the two scripts).
- sync: script names match Task 2 and Task 3 file names.
```

## Tasks

### Task 1: Real price table `session-prices.json`

**Findings:** out-of-scope addition: no brief (inline exploration; see Research Findings, pricing page).

**Complexity:** Standard
**Risk:** Medium
**Depends on:** none
**Verify:** manual

**Files:**
- Create: `plugins/sdlc-utilities/scripts/ci/session-prices.json`

**Notes:**
This is the only real price data in the repository, and W1.8 forbids uncited rate numbers. So every value is copied from the page fetched during this task, never from this plan or from memory. The values below are what the page showed on 2026-10-22. They are a cross-check, not a source.
geoMultiplier applies to every row in this table; all rows are Claude 4.6 or later per the page. A pre-4.6 row must not be added without a per-model geo rule (out of scope).

**Must not touch:** the plan-level list; any other file.

**Acceptance criteria:**
- [ ] WebFetch `https://platform.claude.com/docs/en/about-claude/pricing` and `https://platform.claude.com/docs/en/models/overview` during execution. If either cannot be read, STOP and report; write no file.
- [ ] Every numeric value equals the page value on the retrieval date. If a page value differs from the cross-check below, use the page value and list the difference in the execution report.
- [ ] A value the page does not show is written as `"not recorded"`.
- [ ] `source`, `retrieved` (execution date, `YYYY-MM-DD`), `unit`, `idsSource`, `geoMultiplier`, `quotes` and `models` are present. `quotes` holds the page lines verbatim: the model table header and the four rows, footnote 2, the long-context tier paragraph, the data-residency sentence, the fast-mode Opus 5.5 row and both "apply on top of fast mode pricing" lines, and the three cache-multiplier rows.
- [ ] `node -e 'const p=require("./plugins/sdlc-utilities/scripts/ci/session-prices.json"); if(!/^https:\/\//.test(p.source)||!/^\d{4}-\d{2}-\d{2}$/.test(p.retrieved)) process.exit(1)'` exits 0 (item Verification 4).
- [ ] Value-type probe: `node -e 'const p=require("./plugins/sdlc-utilities/scripts/ci/session-prices.json");const K=["input","output","cacheRead","cacheWrite5m","cacheWrite1h"];const ok=v=>v==="not recorded"||(typeof v==="number"&&v>=0);let bad=0;for(const [id,m] of Object.entries(p.models)){for(const r of (m.tiers||[m]))for(const k of K)if(!ok(r[k])){console.log(id,k);bad++}if(m.fast){for(const k of ["input","output"])if(!ok(m.fast[k])){console.log(id,"fast",k);bad++}}}process.exit(bad?1:0)'` exits 0.

**Contract:**
- shape (code): JSON data file with the shape below. Prices are JSON numbers in USD per million tokens with at most 6 decimals, or the string `"not recorded"`. `tiers` entries are ordered by ascending `maxPromptTokens`, and the last entry has no `maxPromptTokens`. `fast.cacheMultipliers` keys are `cacheWrite5m`, `cacheWrite1h` and `cacheRead`.
- names: top-level keys `source`, `retrieved`, `unit`, `idsSource`, `geoMultiplier`, `quotes`, `models`; row keys `input`, `output`, `cacheRead`, `cacheWrite5m`, `cacheWrite1h`, `tiers`, `maxPromptTokens`, `fast`, `cacheMultipliers`.
- mirror: item W1.13 Change 1 (`{ "source", "retrieved", "unit", "models": { "<model id>": { "input", "output", "cacheRead", "cacheWrite5m", "cacheWrite1h" } } }`).
- decisions: KD3, KD8; rulings w13-pricing and w13-modifiers.
- sync: Task 2 reads exactly these keys; the Task 4 fixture prices file uses the same shape.

```json
{
  "source": "https://platform.claude.com/docs/en/about-claude/pricing",
  "retrieved": "<execution date>",
  "unit": "USD per million tokens",
  "idsSource": "https://platform.claude.com/docs/en/models/overview",
  "geoMultiplier": { "us": 1.1 },
  "quotes": [ "| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |", "…" ],
  "models": {
    "claude-fable-5-1":  { "input": 10, "cacheWrite5m": 12.5, "cacheWrite1h": 20, "cacheRead": 0.25, "output": 50 },
    "claude-opus-5-5":   { "input": 4,  "cacheWrite5m": 5,    "cacheWrite1h": 8,  "cacheRead": 0.2,  "output": 20,
                           "fast": { "input": 8, "output": 40,
                                     "cacheMultipliers": { "cacheWrite5m": 1.25, "cacheWrite1h": 2, "cacheRead": 0.05 } } },
    "claude-sonnet-5-5": { "input": 2,  "cacheWrite5m": 2.5,  "cacheWrite1h": 4,  "cacheRead": 0.1,  "output": 10 },
    "claude-haiku-5-5":  { "tiers": [
        { "maxPromptTokens": 100000, "input": 0.1, "cacheWrite5m": 0.125, "cacheWrite1h": 0.2, "cacheRead": 0.01, "output": 0.5 },
        {                            "input": 0.5, "cacheWrite5m": 0.625, "cacheWrite1h": 1,   "cacheRead": 0.05, "output": 2.5 } ] }
  }
}
```

### Task 2: `session-cost.js`

**Findings:** out-of-scope addition: no brief.

**Complexity:** Complex
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/ci/session-cost.js`

**Notes:**
Zero dependencies (`node:fs`, `node:path`, `node:os`), because the ci/ scripts run without `npm ci`. It depends on Task 1 only for its default `--prices` path; the tests pass `--prices` explicitly. It reads transcripts only under `--projects-dir` and writes only `--out` (guardrail).

**Must not touch:** the plan-level list; `lib/*` (no new shared module).

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/session-cost.js --help` prints the usage header and exits 0.
- [ ] Smoke check (runnable now, before any fixture exists): `node plugins/sdlc-utilities/scripts/ci/session-cost.js --json; echo $?` prints `2` (no `--sessions`). `node -e 'const m=require("./plugins/sdlc-utilities/scripts/ci/session-cost.js"); if(m.formatPico(m.toPico("1.250000000000"))!=="1.250000000000") process.exit(1)'` exits 0 and runs no CLI (the `require.main` guard holds).
- [ ] Each flag, exit code and error string matches the tables below. The fixture run is Task 4's acceptance; the dataset pass is Task 6 and Task 8.
- [ ] Output tokens are labelled a floor in `notes`.

**Contract:**
- shape (code): CLI and output as rendered below; prices are resolved per message as in the call order.
- names: schema `sdlc-session-cost-1`; the reason strings in the error table; output keys as rendered.
- mirror: `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js:1-33` (header comment, `'use strict'`), `:38-58` (parseArgs loop), `:296-313` (try / `process.exit(2)` with `session-cost.js error: <message>` on stderr).
- decisions: KD1, KD2, KD4, KD5, KD7, KD10.
- sync: the Task 6 assertions and the Task 4 fixture.

CLI flags (typed-op table):

| Op | Flag | Type | Default | Notes |
|---|---|---|---|---|
| add | `--sessions <map.json>` | path | required | JSON object: tag → array of entries. An entry ending in `.jsonl` or containing `/` is a transcript path relative to `--projects-dir`; any other entry is a session id |
| add | `--projects-dir <dir>` | path | `path.join(os.homedir(), '.claude', 'projects')` | every transcript path must resolve inside it |
| add | `--prices <file>` | path | `path.join(__dirname, 'session-prices.json')` | |
| add | `--out <file>` | path | none | writes the JSON (2-space indent, trailing newline) |
| add | `--json` | bool | false | prints the JSON to stdout |
| add | `--help` | bool | false | prints the header usage text, exit 0 |

Call order per run:

```
1. parseArgs → unknown flag, missing value, missing --sessions, or neither --json nor --out → exit 2
2. read --prices and --sessions (JSON) → IO/parse error → exit 2
3. per tag, per entry: resolve the main transcript
     session id → every <projects-dir>/*/<id>.jsonl (one directory level); 0 matches → exit 1
                  "session not found: <tag>: <entry>"; >1 matches → exit 2 "ambiguous session id: <entry>"
     path       → path.resolve(projects-dir, entry); outside projects-dir → exit 2; missing → exit 1 (same message)
   subagents: sorted <dirname(main)>/<basename(main, '.jsonl')>/subagents/*.jsonl (absent dir = none)
4. per transcript line: skip empty or whitespace-only lines (a trailing newline is normal);
   JSON.parse the rest (failure → exit 2 "<file>:<line>: invalid JSON");
   keep only lines where message.usage is an object and message.id is a string (R-skip-lines);
   drop message.model === "<synthetic>"
5. per tag: one line per message.id = the largest input+output+cache_read+cache_creation sum (tie: first)
6. per kept message: book tokens (cache_creation present → 5m/1h split; absent → cache_creation_input_tokens
   to cacheWrite5m and, when > 0, unsplitCacheWriteLines += 1), then price (KD4 order):
     a. model not in table                          → unpriced "model not in price table"
     b. usage.service_tier not absent/"standard"    → unpriced "service_tier: <v>"
     c. usage.speed absent/"standard" → row; "fast" → row.fast or unpriced "fast: no fast price for model";
        other → unpriced "speed: <v>"
     d. usage.inference_geo absent/"global" → ×1; "us" → ×geoMultiplier.us; other → unpriced "inference_geo: <v>"
     e. row has tiers → first tier with prompt ≤ maxPromptTokens, else the last tier;
        prompt = input + cacheRead + cacheWrite5m + cacheWrite1h
     f. per category: rate "not recorded" (or fast cache multiplier missing/"not recorded")
        → that category's tokens to unpriced "price not recorded: <category>"; else pico += tokens × rate
7. tags starting with "aux-" go to aux.tags; total and aux.total sum their own tags
8. write --out and/or print --json; exit 0
```

Module shape: `module.exports = { toPico, formatPico }`. The CLI entry runs only when `require.main === module` (KD11). `toPico('1.250000000000')` → `1250000000000n` (at most 12 fractional digits, else `null`); `formatPico(1250000000000n)` → `'1.250000000000'`.

Price conversion: a JSON number price `p` → `String(p)` → whole pico per token = p × 10⁶ (more than 6 decimals → exit 2 `invalid price <model>.<category>`). A multiplier `m` → an exact fraction from `String(m)`. The rate × fraction must be a whole number, else exit 2 `inexact rate <model>.<category>` (KD2). Fast cache rate = fast input rate × `cacheMultipliers.<category>`. Geo applies after the tier or fast rate is chosen. USD string = `<pico / 10¹²>.<pico % 10¹², 12 digits zero-padded>`.

Output (`--json` / `--out`):

```json
{
  "schema": "sdlc-session-cost-1",
  "prices": { "source": "<from table>", "retrieved": "<from table>" },
  "tags": {
    "<tag>": {
      "sessions": 1, "messages": 2, "unsplitCacheWriteLines": 0, "unpricedMessages": 0,
      "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite5m": 0, "cacheWrite1h": 0 },
      "usd": "0.000000000000",
      "byModel": { "<model>": { "messages": 2, "tokens": { "input": 0, "…": 0 }, "usd": "0.000000000000" } }
    }
  },
  "total": { "tokens": { "input": 0, "…": 0 }, "usd": "0.000000000000", "unsplitCacheWriteLines": 0,
             "unpricedMessages": 0, "complete": true },
  "aux": { "tags": { "aux-…": { "…": "same shape as tags.<tag>" } }, "total": { "…": "same shape as total" },
           "unpriced": [] },
  "unpriced": [ { "model": "<model>", "reason": "<reason>", "messages": 1,
                  "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite5m": 0, "cacheWrite1h": 0 } } ],
  "notes": [ "output tokens are a floor (subagent transcripts)" ]
}
```

- `tokens` counts every kept message, priced or not; `usd` counts only priced tokens.
- `unpriced` (non-aux tags) and `aux.unpriced` aggregate by `(model, reason)` and are sorted by model, then reason.
- `unpricedMessages` counts messages with at least one unpriced category.
- `complete` is `unpricedMessages === 0`. When it is false, `notes` also carries `"<n> messages unpriced: usd is a lower bound"`.

Error table:

| Condition | Exit | stderr / stdout |
|---|---|---|
| `--help` | 0 | usage on stdout |
| unknown flag, missing flag value, no `--sessions`, neither `--json` nor `--out` | 2 | `session-cost.js error: <what>` |
| prices / sessions file unreadable or invalid JSON; transcript line invalid JSON | 2 | `session-cost.js error: <file>[:<line>]: <what>` |
| transcript path outside `--projects-dir`; ambiguous session id; invalid price; inexact rate | 2 | `session-cost.js error: <what>` |
| a tag's session or transcript path not found | 1 | `session-cost.js error: session not found: <tag>: <entry>` |
| model missing, other speed/geo/service_tier, fast without block, price `"not recorded"` | 0 | listed in `unpriced`, `complete: false` |

### Task 3: `wave-metrics.js`

**Findings:** out-of-scope addition: no brief.

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Create: `plugins/sdlc-utilities/scripts/ci/wave-metrics.js`

**Notes:**
The header strings must be byte-identical to `metrics-summary.md` (pre-flight §4). Column 9 contains ` / `, and the summary reader matches headers literally. The script is read-only over `--root`.

**Must not touch:** the plan-level list; every file under `--root`.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/wave-metrics.js --help` exits 0.
- [ ] Smoke check (runnable now): `node plugins/sdlc-utilities/scripts/ci/wave-metrics.js --root /nonexistent-dir; echo $?` prints `2`. The fixture runs are Task 5's acceptance; the dataset pass is Task 6 and Task 8.
- [ ] The 17 headers are copied from the table below, which is authoritative. Before finishing, `grep -c -F '| Milestone | Waves | Items | Sum net h | Sum owner-wait h | Plan stops | Exec stops | Executor resets | Review findings total / fixed / declined / REAL | Fix rounds | Orch gate first-try | Arb plan-check blocking items | Arbiter overturns | Gate bypasses | D15 deletes | Behavioural runs |' /workspace/sdlc-marketplace/.sdlc/orchestration/metrics-summary.md` prints `1` (read-only check). If it does not, STOP and report.
- [ ] Each flag and each error row in the tables below behaves as stated.

---

**Contract:**
- shape (code): CLI, scan order and errors as rendered below. The default output is a markdown table: a header row, a `|---|` separator, then one row per milestone. `--json` prints a JSON array of objects keyed by the header strings, with string cell values. `Cost USD` sums use `toPico` / `formatPico` required from `./session-cost` (KD11).
- names: the 17 headers below, verbatim; the error strings in the error table.
- mirror: `plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js:38-58,296-313` (parseArgs with a `resolveSdlcRoot()` default, try/exit 2).
- decisions: KD6, KD10, KD11, R-metrics.
- sync: the headers equal the `metrics-summary.md` milestone header (pre-flight §4) plus `Cost USD`; the Task 5 fixtures and Task 6 assertions use these paths.

CLI flags (typed-op table):

| Op | Flag | Type | Default | Notes |
|---|---|---|---|---|
| add | `--root <dir>` | path | `path.join(resolveSdlcRoot(), '.sdlc', 'orchestration')` | `resolveSdlcRoot` from `require(path.join(LIB, 'config'))` |
| add | `--json` | bool | false | rows as JSON objects instead of markdown |
| add | `--help` | bool | false | prints the header usage text, exit 0 |

Scan order:

```
1. parseArgs → unknown flag or missing value → exit 2
2. root missing or not a directory → exit 2
3. list <root>/* directories whose name starts with "m" and that contain metrics.json,
   sorted with a.localeCompare(b, undefined, { numeric: true })   (m1, m2, …, m4, m4.1)
4. per file: JSON.parse; not an array → exit 2; any record.schema !== "sdlc-wave-metrics-1" → exit 1;
   a record whose `milestone` is not a non-empty string → exit 1 `wave-metrics.js error: <file>: record <i> milestone <value>`
5. group records by record.milestone in order of first appearance; compute the cells (tables below)
6. print markdown (default) or the JSON array (--json); exit 0 (zero files → header only / [])
```

Error table:

| Condition | Exit | stderr / stdout |
|---|---|---|
| `--help` | 0 | usage on stdout |
| unknown flag or missing flag value | 2 | `wave-metrics.js error: <what>` |
| root missing or not a directory; metrics file unreadable or invalid JSON; file not a JSON array | 2 | `wave-metrics.js error: <file>: <what>` |
| a record whose `schema` is not `sdlc-wave-metrics-1` | 1 | `wave-metrics.js error: <file>: record <i> schema <value>` |
| a record whose `milestone` is not a non-empty string | 1 | `wave-metrics.js error: <file>: record <i> milestone <value>` |
| a `cost.usd` string that is not a decimal with at most 12 fractional digits | 0 | that record counts as unrecorded for `Cost USD` |

Column map (a "recorded" value is a number at the path; missing or `"not recorded"` = unrecorded):

| # | Header (verbatim) | Value per record | Cell |
|---|---|---|---|
| 1 | `Milestone` | `milestone` | group key |
| 2 | `Waves` | 1 | count of records |
| 3 | `Items` | `items.length` (array) | sum |
| 4 | `Sum net h` | `hours.net` | sum |
| 5 | `Sum owner-wait h` | `hours.ownerWait` | sum |
| 6 | `Plan stops` | `plan.plannerStops` | sum |
| 7 | `Exec stops` | `exec.execStops` | sum |
| 8 | `Executor resets` | `exec.executorResets` | sum |
| 9 | `Review findings total / fixed / declined / REAL` | sum of numeric values of `review.findings`; `review.fixed`; `review.declined`; `review.declineRecheck.real` | four sums joined by ` / `, each with its own marker |
| 10 | `Fix rounds` | `review.fixRounds` | sum |
| 11 | `Orch gate first-try` | `gate.orchGateFirstTry` (boolean = recorded) | `<true count>/<recorded count>` |
| 12 | `Arb plan-check blocking items` | `plan.arbCheck.B` | sum |
| 13 | `Arbiter overturns` | `arbiter.overturns` | sum |
| 14 | `Gate bypasses` | `exec.gateBypasses` | sum |
| 15 | `D15 deletes` | `exec.d15Deletes` | sum |
| 16 | `Behavioural runs` | `gate.behaviouralRuns` | sum |
| 17 | `Cost USD` | `cost.usd` when `cost` is an object and `usd` is a decimal string | exact decimal sum (BigInt pico, 12 decimals) |

Cell rules:

| Recorded records (k of n) | Cell |
|---|---|
| k = n | `<value>` |
| 0 < k < n | `<value> (<k> of <n> waves)` |
| k = 0 | `not recorded` |

Composite and boolean columns:

- **Column 9.** Each of the four parts follows the cell rules on its own, and the parts are joined by ` / `. For example: `7 / 1 (1 of 2 waves) / 6 / 1`. When nothing is recorded, the cell is `not recorded / not recorded / not recorded / not recorded`. `review.findings` counts as recorded when it is an object with at least one numeric value, and its value is the sum of those numbers.
- **Column 11.** k = the number of records where `gate.orchGateFirstTry` is a boolean. The cell is `<true count>/<k>` when k = n. It is `<true count>/<k> (<k> of <n> waves)` when 0 < k < n, and `not recorded` when k = 0.

Number format: integer sums print as integers. Other sums print `Number(sum.toFixed(2))` as a string, so `5.37`, not `5.370000000000001`.

### Task 4: session-cost fixture tree

**Findings:** out-of-scope addition: no brief.

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/session-cost/prices.json`
- Create: `tests/promptfoo/fixtures-fs/session-cost/sessions.json`
- Create: `tests/promptfoo/fixtures-fs/session-cost/projects/-fixture-proj/*.jsonl` (the 9 main transcripts listed below)
- Create: `tests/promptfoo/fixtures-fs/session-cost/projects/-fixture-proj/sess-parent/subagents/agent-s1.jsonl`

**Notes:**
The tree is data only, so it has 12 small files in one directory rather than the usual ≤ 5 files per task. Splitting it would separate the transcripts from the map that names them (KD9). All content is synthetic: no line is copied from a real transcript (ruling w13-modifiers).

**Must not touch:** the plan-level list; every other fixture directory.

**Acceptance criteria:**
- [ ] `prices.json` has `"source": "test fixture"` and holds only the test values below.
- [ ] Every `.jsonl` line is valid JSON with the field names from Research Findings (transcript format).
- [ ] `node plugins/sdlc-utilities/scripts/ci/session-cost.js --sessions tests/promptfoo/fixtures-fs/session-cost/sessions.json --projects-dir tests/promptfoo/fixtures-fs/session-cost/projects --prices tests/promptfoo/fixtures-fs/session-cost/prices.json --json` exits 0 and prints the expected values in the table below.

**Contract:**
- shape (code): fixture data as rendered; each assistant line is `{"type":"assistant","sessionId":"<id>","timestamp":"2026-10-22T00:00:00Z","message":{"id":"<msg>","role":"assistant","model":"<model>","usage":{…}}}`. Usage keys not listed are omitted, so `cache_read_input_tokens` and `cache_creation_input_tokens` default to 0.
- names: tags `dedupe`, `cache`, `subagent`, `aux-check`, `tier-le`, `tier-gt`, `fast`, `geo`, `fallback`; models `test-model-a`, `test-model-tiered`, `test-model-missing`.
- mirror: the transcript fields in Research Findings (pre-flight §3).
- decisions: KD9.
- sync: the Task 6 assertions use the expected values in the table below.

`prices.json`:

```json
{ "source": "test fixture", "retrieved": "2026-10-22", "unit": "USD per million tokens",
  "geoMultiplier": { "us": 1.1 }, "quotes": ["test fixture: not real prices"],
  "models": {
    "test-model-a": { "input": 1, "output": 10, "cacheRead": 0.1, "cacheWrite5m": 1.25, "cacheWrite1h": 2,
      "fast": { "input": 2, "output": 20, "cacheMultipliers": { "cacheWrite5m": 1.25, "cacheWrite1h": 2, "cacheRead": 0.1 } } },
    "test-model-tiered": { "tiers": [
      { "maxPromptTokens": 100000, "input": 1, "output": 10, "cacheRead": 0.1, "cacheWrite5m": 1.25, "cacheWrite1h": 2 },
      { "input": 3, "output": 30, "cacheRead": 0.3, "cacheWrite5m": 3.75, "cacheWrite1h": 6 } ] } } }
```

`sessions.json`: `{"dedupe":["sess-dedupe"],"cache":["sess-cache"],"subagent":["sess-parent"],"aux-check":["sess-aux"],"tier-le":["sess-tier-le"],"tier-gt":["sess-tier-gt"],"fast":["sess-fast"],"geo":["sess-geo"],"fallback":["sess-fallback"]}`

Transcripts (`projects/-fixture-proj/<session>.jsonl`; `in`/`out`/`cr`/`cc` = `input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens`; model `test-model-a` unless stated):

| Session | Lines | Expected tag result |
|---|---|---|
| `sess-dedupe` | user line; `msg_d1` in 1000 out 100; `msg_d1` in 1000 out 500; `msg_d2` model `<synthetic>` in 7 out 7; `{"type":"api-request-blob","message":{"role":"assistant","content":[]}}` | messages 1, tokens.input 1000, tokens.output 500, usd `0.006000000000` |
| `sess-cache` | `msg_c1` cc 2000000 with `cache_creation` {5m 1000000, 1h 1000000}; `msg_c2` cc 1000, no `cache_creation` | cacheWrite5m 1001000, cacheWrite1h 1000000, unsplitCacheWriteLines 1, usd `3.251250000000` |
| `sess-parent` + `sess-parent/subagents/agent-s1.jsonl` | main `msg_p1` in 1000000; subagent `msg_s1` out 100000 | sessions 1, messages 2, usd `2.000000000000` |
| `sess-aux` | `msg_x1` in 1000000 | only in `aux.tags["aux-check"]`, usd `1.000000000000` |
| `sess-tier-le` | `msg_t1` model `test-model-tiered`, in 60000 cr 40000 out 1000 (prompt 100000) | usd `0.074000000000` (tier 1) |
| `sess-tier-gt` | `msg_t2` model `test-model-tiered`, in 60000 cr 40000 cc 1 with `cache_creation` {5m 1, 1h 0} out 1000 (prompt 100001) | usd `0.222003750000` (tier 2) |
| `sess-fast` | `msg_f1` `speed` `"fast"`, in 1000000 out 100000 cr 1000000 | usd `4.200000000000` (2 + 2 + 0.2) |
| `sess-geo` | `msg_g1` `inference_geo` `"us"`, in 1000000 out 100000; `msg_g2` `inference_geo` `"global"`, in 1000000 | usd `3.200000000000` (2 × 1.1 + 1) |
| `sess-fallback` | `msg_u1` `speed` `"turbo"` in 1000; `msg_u2` `inference_geo` `"eu"` in 1000; `msg_u3` `service_tier` `"priority"` in 1000; `msg_u4` model `test-model-tiered` `speed` `"fast"` in 1000; `msg_u5` model `test-model-missing` in 500; `msg_u6` in 1000000 | messages 6, unpricedMessages 5, usd `1.000000000000` |

Run-level expectations:

- `total.usd` = `13.953253750000`, the sum of the 8 non-aux tags.
- `total.complete` = `false` and `total.unpricedMessages` = `5`.
- `aux.total.usd` = `1.000000000000`.
- `unpriced`, in order: `test-model-a`/`inference_geo: eu`, `test-model-a`/`service_tier: priority`, `test-model-a`/`speed: turbo`, `test-model-missing`/`model not in price table` (tokens.input 500), `test-model-tiered`/`fast: no fast price for model`. Each has messages 1.

### Task 5: wave-metrics fixtures

**Findings:** out-of-scope addition: no brief.

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/fixtures-fs/wave-metrics/two-milestones/m1/metrics.json`
- Create: `tests/promptfoo/fixtures-fs/wave-metrics/two-milestones/m2/metrics.json`
- Create: `tests/promptfoo/fixtures-fs/wave-metrics/not-recorded/m3/metrics.json`

**Notes:**
Records carry only the fields the column map reads, plus `schema`. A partial record is valid input: missing fields are unrecorded (KD6).

**Must not touch:** the plan-level list; `.sdlc/orchestration/**` (never copy real records).

**Acceptance criteria:**
- [ ] Every record has `"schema": "sdlc-wave-metrics-1"`.
- [ ] `node plugins/sdlc-utilities/scripts/ci/wave-metrics.js --root tests/promptfoo/fixtures-fs/wave-metrics/two-milestones --json` and `… --root tests/promptfoo/fixtures-fs/wave-metrics/not-recorded --json` print the cells below.

**Contract:**
- shape (code): each file is a JSON array of records as below.
- names: milestones `M1`, `M2`, `M3`.
- mirror: `.sdlc/orchestration/metrics-schema.md` record keys (read-only).
- decisions: KD6, R-metrics.
- sync: the Task 6 wave-metrics assertions.

Each record also has `"schema": "sdlc-wave-metrics-1"` (not repeated below). The records hold exactly these keys and no others, except one: the second M3 record also carries a top-level `evalSpendUsd`, which the aggregator ignores. The block uses shorthand: write each file as standard JSON with quoted keys and colons, and end each file with a newline.

```
two-milestones/m1: [
  {milestone "M1", items ["W1.1","W1.2"], hours {net 1.25, ownerWait 0}, plan {plannerStops 0, arbCheck {B 2}},
   exec {execStops 1, executorResets 0, gateBypasses 0, d15Deletes 0},
   review {findings {high 1, low 2}, fixed 1, declined 2, declineRecheck {real 0}, fixRounds 1},
   gate {orchGateFirstTry true, behaviouralRuns 1}, arbiter {overturns 0}, cost {usd "1.500000000000"}},
  {milestone "M1", items ["W1.3"], hours {net 0.5, ownerWait 1.5}, plan {plannerStops 1, arbCheck {B 0}},
   exec {execStops 2, executorResets 1, gateBypasses 0, d15Deletes 0},
   review {findings {medium 4}, fixed "not recorded", declined 4, declineRecheck {real 1}, fixRounds 0},
   gate {orchGateFirstTry false, behaviouralRuns 0}, arbiter {overturns 1}, cost {usd "0.250000000000"}} ]
two-milestones/m2: [
  {milestone "M2", items ["W2.1"], hours {net 2, ownerWait 0}, plan {plannerStops 0, arbCheck {B 0}},
   exec {execStops 0, executorResets 0, gateBypasses 1, d15Deletes 0},
   review {findings {low 1}, fixed 1, declined 0, declineRecheck {real 0}, fixRounds 1},
   gate {orchGateFirstTry true, behaviouralRuns 2}, arbiter {overturns 0}, cost {usd "3.000000000000"}} ]
not-recorded/m3: [
  {milestone "M3", hours {net 1.1, ownerWait "not recorded"}, gate {behaviouralRuns "not recorded"}, cost "not recorded"},
  {milestone "M3", hours {net 2.2, ownerWait "not recorded"}, gate {behaviouralRuns "not recorded"},
   cost {evalRunsUsd "1.2627", sessions "not recorded"}, evalSpendUsd 1.26},
  {milestone "M3", hours {net "not recorded", ownerWait "not recorded"}, gate {behaviouralRuns "not recorded"},
   cost "not recorded"} ]
```

Expected cells (all 17 columns for the two-milestones rows):

| Header | M1 | M2 | M3 (not-recorded) |
|---|---|---|---|
| `Milestone` | `M1` | `M2` | `M3` |
| `Waves` | `2` | `1` | `3` |
| `Items` | `3` | `1` | `not recorded` |
| `Sum net h` | `1.75` | `2` | `3.3 (2 of 3 waves)` |
| `Sum owner-wait h` | `1.5` | `0` | `not recorded` |
| `Plan stops` | `1` | `0` | `not recorded` |
| `Exec stops` | `3` | `0` | `not recorded` |
| `Executor resets` | `1` | `0` | `not recorded` |
| `Review findings total / fixed / declined / REAL` | `7 / 1 (1 of 2 waves) / 6 / 1` | `1 / 1 / 0 / 0` | `not recorded / not recorded / not recorded / not recorded` |
| `Fix rounds` | `1` | `1` | `not recorded` |
| `Orch gate first-try` | `1/2` | `1/1` | `not recorded` |
| `Arb plan-check blocking items` | `2` | `0` | `not recorded` |
| `Arbiter overturns` | `1` | `0` | `not recorded` |
| `Gate bypasses` | `0` | `1` | `not recorded` |
| `D15 deletes` | `0` | `0` | `not recorded` |
| `Behavioural runs` | `1` | `2` | `not recorded` |
| `Cost USD` | `1.750000000000` | `3.000000000000` | `not recorded` (R-metrics: `evalRunsUsd` is ignored) |

### Task 6: Dataset `session-cost-exec.yaml` and registration

**Findings:** out-of-scope addition: no brief.

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 2, Task 3, Task 4, Task 5
**Verify:** tests

**Files:**
- Create: `tests/promptfoo/datasets/session-cost-exec.yaml`
- Modify: `tests/promptfoo/promptfooconfig-exec.yaml` — append one `tests:` line after line 82

**Notes:**
All 9 session-cost cases share one command (KD9), so each case's assertion names its own tag. The expected values are taken verbatim from the Task 4 transcript table and the Task 5 expected-cells table, so read those tables before writing the assertions. Cases 10 and 11 embed the full 17-key objects from Task 5 as literals. The script-runner returns stdout only, so `JSON.parse(output)` failing also catches a non-zero exit.

**Must not touch:** the plan-level list; every other line of `promptfooconfig-exec.yaml`.

**Acceptance criteria:**
- [ ] The dataset has exactly 11 cases with the descriptions below, in this order.
- [ ] Each case asserts with one `type: javascript` assertion that parses `output`.
- [ ] The anchor probe `grep -n -F -x -- '  - file://datasets/post-tool-validate-argv-exec.yaml' tests/promptfoo/promptfooconfig-exec.yaml` prints `82:…` (exactly one line) before the edit.
- [ ] The targeted run (header Verification) passes 11/11.

**Contract:**
- shape (code): promptfoo YAML list. The session-cost cases set `script_path: "repo://plugins/sdlc-utilities/scripts/ci/session-cost.js"`, `project_root: "file://fixtures-fs/session-cost"` and `script_args: "--sessions {{project_root}}/sessions.json --projects-dir {{project_root}}/projects --prices {{project_root}}/prices.json --json"`. The wave-metrics cases set `script_path: "repo://plugins/sdlc-utilities/scripts/ci/wave-metrics.js"`, `project_root: "file://fixtures-fs/wave-metrics/<two-milestones|not-recorded>"` and `script_args: "--root {{project_root}} --json"`.
- names: the 11 descriptions below.
- mirror: `tests/promptfoo/datasets/validate-cost-tiers-exec.yaml:1-42` (header comment, vars, `javascript` assertion).
- decisions: KD9; item Change 4.
- sync: the expected values in Task 4 and Task 5.

| # | description | asserts (`d = JSON.parse(output)`) |
|---|---|---|
| 1 | `session-cost: duplicate message ids count once with the largest usage, and synthetic messages are dropped` | `d.tags.dedupe.messages === 1`, tokens.input 1000, tokens.output 500, usd `0.006000000000` |
| 2 | `session-cost: 5m and 1h cache writes are priced in separate columns` | `d.tags.cache` cacheWrite5m 1001000, cacheWrite1h 1000000, unsplitCacheWriteLines 1, usd `3.251250000000` |
| 3 | `session-cost: subagent transcripts are booked under their parent tag` | `d.tags.subagent` sessions 1, messages 2, usd `2.000000000000` |
| 4 | `session-cost: aux- tags are excluded from total` | `!('aux-check' in d.tags)`, `d.aux.tags['aux-check'].usd === '1.000000000000'`, `d.total.usd === '13.953253750000'` and equals the BigInt sum of `d.tags[*].usd`; `d.unpriced` has `{model:'test-model-missing', reason:'model not in price table', messages:1}` with tokens.input 500 |
| 5 | `session-cost: a tiered model at 100000 prompt tokens uses the first tier` | `d.tags['tier-le'].usd === '0.074000000000'` |
| 6 | `session-cost: a tiered model above 100000 prompt tokens uses the second tier` | `d.tags['tier-gt'].usd === '0.222003750000'` |
| 7 | `session-cost: fast-mode messages use the fast price block` | `d.tags.fast.usd === '4.200000000000'`, `d.tags.fast.unpricedMessages === 0` |
| 8 | `session-cost: US-only inference applies the geo multiplier` | `d.tags.geo.usd === '3.200000000000'` |
| 9 | `session-cost: unknown speed, geo, service tier and fast without a fast block go to unpriced` | `d.tags.fallback.usd === '1.000000000000'`, unpricedMessages 5, `d.total.complete === false`, `d.unpriced.map(u => u.reason)` equals `['inference_geo: eu','service_tier: priority','speed: turbo','model not in price table','fast: no fast price for model']` |
| 10 | `wave-metrics: two milestones give two summed rows` | `d.length === 2`, and `d[0]` and `d[1]` deep-equal the M1 and M2 columns of the Task 5 expected-cells table (all 17 keys) |
| 11 | `wave-metrics: a not recorded field gives the (k of n waves) marker` | `d.length === 1`, and `d[0]` deep-equals the M3 column of the Task 5 expected-cells table (all 17 keys) |

`promptfooconfig-exec.yaml` edit (end of file):

```diff
   - file://datasets/dimension-to-instructions-exec.yaml
   - file://datasets/post-tool-validate-argv-exec.yaml
+  - file://datasets/session-cost-exec.yaml
```

### Task 7: `scripts/README.md` ci/ section

**Findings:** out-of-scope addition: no brief.

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/README.md` — add a `### CI Scripts (\`ci/\`)` section between the Naming Conventions list and `## Skill-to-Script Mapping`

**Notes:**
There is no per-file ci/ list to extend (R-readme), so the section names only the two new scripts. Listing the nine existing validators would be scope creep.

**Must not touch:** the plan-level list; every other line of the README.

**Acceptance criteria:**
- [ ] The anchor probe `grep -n -F -x -- '- **util/** — descriptive action names' plugins/sdlc-utilities/scripts/README.md` prints exactly one line (line 21 at `c18444f`) before the edit.
- [ ] `git diff --stat plugins/sdlc-utilities/scripts/README.md` shows only additions.

**Contract:**
- shape (docs): MODIFY `plugins/sdlc-utilities/scripts/README.md`; insert after the `- **util/** — descriptive action names` line and its following blank line; audience: maintainers.
- names: `### CI Scripts (\`ci/\`)`, rows `session-cost.js`, `wave-metrics.js`.
- mirror: the table style of `## Shared Modules (\`lib/\`)` in the same file.
- decisions: R-readme.
- sync: the file names from Task 2 and Task 3.

```diff
 - **util/** — descriptive action names
 
+### CI Scripts (`ci/`)
+
+Besides the `validate-*` validators, `ci/` holds two read-only reporting scripts for the orchestration:
+
+| Script | Purpose |
+|--------|---------|
+| `session-cost.js` | Prices Claude Code session transcripts per tag from `session-prices.json` (cited pricing page); unpriced tokens are listed, never guessed |
+| `wave-metrics.js` | Sums `m*/metrics.json` wave records into the milestone summary table (`--json` for rows as objects) |
+
 ## Skill-to-Script Mapping
```

### Task 8: Final verification (no edit)

**Findings:** out-of-scope addition: no brief.

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
**Verify:** tests, lint

**Files:**
- Test: `tests/promptfoo/datasets/session-cost-exec.yaml` (run only)

**Notes:**
These are the gate checks this wave touches (addendum C8). The orchestrator's own gate runs on a clean checkout of the head. This task is the executor's single pass.

**Must not touch:** every repository file.

**Acceptance criteria:**
- [ ] `node plugins/sdlc-utilities/scripts/ci/session-cost.js --help; echo $?` and `node plugins/sdlc-utilities/scripts/ci/wave-metrics.js --help; echo $?` print `0` (item Verification 2).
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0; if it flags a new ci/ script, STOP (do not edit the validator).
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-cost-tiers.js --root . --strict` exits 0 (unchanged; item Verification 3).
- [ ] Task 1's `node -e` source/retrieved probe exits 0 (item Verification 4).
- [ ] The header Verification run passes 11/11 with a fresh `TMPDIR` subdir of `/tmp/claude-1000/pf-tmp-exec-m41`, created first: `T=/tmp/claude-1000/pf-tmp-exec-m41/w4-$(date +%s); mkdir -p "$T"`, then `TMPDIR="$T"`. Run it once, in the background if it may take more than 5 minutes; no rerun loop.
- [ ] Spec re-check: `grep -rniE 'transcript|\.jsonl|session[- ]cost|wave-metrics|pricing|price' docs/specs docs/architecture.md | wc -l` prints `0`, as at planning time. A non-zero count means a spec line may have become untrue: STOP with a QUESTION (plan-source rule).
- [ ] `git status --porcelain` lists only the files of Tasks 1–7 and this plan file. No behavioural run (item Verification 5).
- [ ] After the ship run (not part of execute): `git log -1 --format=%s` equals `feat(#9011): ci - session-cost and wave-metrics scripts (W1.13)` and `git rev-list --count c18444f..HEAD` prints `1`. On a mismatch, report it to the orchestrator and do not amend (§0 Commits note).

**Contract:**
- shape (code): verification only; no artifact.
- names: none.
- mirror: the wave-3 plan's final verification task.
- decisions: §0 rule 4.
- sync: none.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Both new scripts are covered by the 11-case `session-cost-exec.yaml` (Tasks 4–6); no existing behaviour changes, so no stale tests |
| no-ci-bypass | error | PASS | No step skips or disables CI; Task 8 runs the consistency and cost-tier validators |
| no-auto-eval | error | PASS | Only the exec-only config runs, targeted with `--filter-pattern`, once; no behavioural run |
| skill-docs-required | error | PASS | No SKILL.md is created |
| no-scope-creep | warning | PASS | Tasks map to W1.13 and the two rulings; Non-goals list the excluded work |
| single-responsibility-tasks | warning | PASS | One deliverable per task; Task 4 bundles fixture data on purpose (KD9) |
| scripts-over-llm-logic | error | PASS | All logic is in deterministic Node scripts |
| yagni | warning | PASS | Tiers, fast block and geo multiplier come from rulings w13-pricing and w13-modifiers; KD8 limits the rows |
| cross-skill-consistency | error | PASS | No skill, hook or spec changes; spec grep is 0 hits; check-consistency scans only `scripts/skill/` |
| pr-link-github-issue | error | PASS | Tracking is the local todo #9011 (#9134), not a GitHub issue; the orchestrator opens the PR |
| dry | warning | PASS | One money parser and formatter, exported by `session-cost.js` and required by `wave-metrics.js` (KD11) |
| kiss | warning | PASS | BigInt and exact fractions are justified by KD1–KD3; no extra abstractions |
| spec-first | error | PASS | No SKILL.md behaviour changes |
| project-agnostic | error | PASS | Scripts and README section live under `plugins/sdlc-utilities`; repo-local edits are test fixtures and the exec config only |
| flag-coherence-cross-skill | error | PASS | No skill dispatch is involved |
| no-opposite-logical-vectors | error | PASS | No SKILL.md gate sites; KD4 is the single check order |
| flag-resolution-single-source | warning | PASS | Each flag is resolved once in its script's `parseArgs` |
| state-premise | error | PASS | Architecture and Context state the root problem |
| smallest-viable-cut | warning | PASS | KD8 and Non-goals justify the scope |
| failure-audience | warning | PASS | Context "Who fails" names the orchestrator and the owner |
| explicit-non-goals | warning | PASS | Context lists seven non-goals |
| ambiguity-stops-and-asks | error | PASS | Open choices were STOP-asked (rulings) or recorded as KD1–KD11 and in Deviations |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic |
| agent-dispatch-script-driven | error | PASS | No agent dispatch is added |
| flag-semantic-consistency-cross-skill | error | PASS | The new flags are on ci/ scripts, outside the `skill/*.js` scope of this rule |
| workspace-mode-compatibility | error | PASS | KD10: `resolveSdlcRoot()` default, no state writes, reads only the given paths |
| prompt-cache-hit-ratio | warning | PASS | No SKILL.md, prepare script or dispatched prompt changes |

## Suggested Review Dimensions

Advisory (G17). Nothing here is applied by this plan: `.sdlc/` and `.github/` are Must-not-touch, and any change goes through `/setup-sdlc --dimensions` with owner approval.

### UPDATE: runtime-contract (U2)

- **Why**: The plan creates `plugins/sdlc-utilities/scripts/ci/session-cost.js` and `wave-metrics.js`, which define CLI flags, exit codes 0/1/2 and a JSON output schema. The trigger `**/scripts/*.js` matches only direct children of `scripts/`, so `scripts/ci/*.js` is outside it.
- **Severity hint**: medium
- **Patch**: Add trigger `**/scripts/ci/*.js` to runtime-contract, so exit-code semantics and JSON schema agreement are reviewed for ci/ scripts.
- **Action (dimension)**: Edit `.sdlc/review-dimensions/runtime-contract.md` frontmatter: add `- "**/scripts/ci/*.js"` under triggers (strengthen-only; no checklist item removed).
- **Action (Copilot mirror, X1)**: regenerate `.github/instructions/runtime-contract.instructions.md` per the `setup-sdlc/setup-dimensions.md` Step 8 transform.

### UPDATE: security-review (U4)

- **Why**: The plan adds `plugins/sdlc-utilities/scripts/ci/session-prices.json`, a `.json` data file in a path family whose security trigger `plugins/**/scripts/**/*.js` covers only `.js` files. The plan also adds scripts that read transcripts under a user-supplied `--projects-dir` and write to `--out`.
- **Severity hint**: low
- **Patch**: Add trigger `plugins/**/scripts/**/*.json` to the security dimension, so data files read by scripts are reviewed.
- **Action (dimension)**: Edit `.sdlc/review-dimensions/security.md` frontmatter: add `- "plugins/**/scripts/**/*.json"` under triggers (strengthen-only).

_1 additional candidate suppressed._

## Final Shape

`plugins/sdlc-utilities/scripts/ci/` holds three new files.

- `session-prices.json` is the price table. It is copied from the Anthropic pricing page on the execution date. It carries its source URL, the date and the quoted page lines.
- `session-cost.js` turns a tag → sessions map into one JSON report. The report gives per-tag tokens and USD (a 12-decimal string), a separate `aux` block, and an `unpriced` list. A `complete` flag says when the USD figure is a lower bound.
- `wave-metrics.js` turns the orchestration's `m*/metrics.json` records into the 17-column milestone table, as markdown or as JSON rows.

Nothing else in the plugin calls these scripts. No skill, hook, spec or ledger contract changes.

The orchestrator runs them by hand after each wave and writes the results into its own `.sdlc/orchestration/` files.

The promptfoo exec config has one more dataset. Its 11 synthetic cases cover:

- dedupe and synthetic drop;
- the 5m/1h cache-write split;
- subagent booking;
- aux exclusion;
- both Haiku-style tiers;
- fast mode and US geo;
- the unpriced fallback;
- the two aggregator rules.

`scripts/README.md` names the two scripts in a short ci/ section.

## Verification Scorecard

Review iteration 3 of 3 (the lenses ran after the merged re-dispatch in iteration 2). Counts are from the final iteration's severity-tagged lens findings.

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 3 |
| Correctness | 0 | 0 | 0 | 3 |
| Coherence | 0 | 0 | 1 | 2 |

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| # | Requirement | Task(s) | Status |
|---|---|---|---|
| 1 | Price table copied from the page at execution, with source, date and quotes | Task 1 | covered |
| 2 | R-tiers: per-message tier by prompt size; one case per branch | Tasks 1, 2, 4, 6 (cases 5–6) | covered |
| 3 | R-modifiers: fast block, US geo, unpriced fallback; synthetic fixtures only | Tasks 1, 2, 4, 6 (cases 7–9) | covered |
| 4 | `session-cost.js` flags, booking, pricing, output, exit codes | Task 2 | covered |
| 5 | `wave-metrics.js` columns, sums, markers, `Cost USD`, exit codes | Task 3 | covered |
| 6 | promptfoo exec dataset (11 cases), fixtures, registration | Tasks 4, 5, 6 | covered |
| 7 | README ci/ section | Task 7 | covered |
| 8 | Spec-consequence grep recorded; STOP on a hit | Research Findings, Task 8 | covered |
| 9 | Must-not-touch list | §0 note, every task | covered |
| 10 | Item Verification 1–5 | Task 8 | covered |
| 11 | One ship run, one commit, subject ≤ 72, Plan readings | §0 note, Plan readings, Task 8 | covered |

Verdict: *"All checks passed. Ready for archive."*

The one suggestion is that §0 rule 2 still names HEAD `0c0cdcc`, as the verbatim text requires. The "How §0 applies" note overrides it with `c18444f`.

## OpenSpec Appendix

Not applicable — no OpenSpec change
