# Link Gate Code-Span Skip Implementation Plan

**Commit:** `fix(#9371): links, review - skip URLs in code spans and fences`
**Goal:**
- The shared link gate (`plugins/sdlc-utilities/scripts/lib/links.js`) stops checking URLs that sit inside an inline code span or a fenced code block.
- review-sdlc dimension reviewers write example or quoted URLs inside code spans, so a review comment that quotes SSRF test URLs can be posted.
- The rule is recorded once, in the spec that owns links.js behaviour (pr-sdlc), for every caller.
**Architecture:** One shared, line-preserving masking helper in links.js blanks fenced blocks and inline code spans; `extractUrls` and `extractIssueRefs` both run on its output, so the two extractors skip code the same way. The review-sdlc subagent prompt template (REFERENCE.md §2) and the orchestrator judgment pass tell reviewers to quote example URLs in code spans. Spec first: pr-sdlc R20 (new) and review-sdlc R20 (new).
**Source:** conversation context (todo #9370 followup, ledger F-66, PR #85)
**Verification:** `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "links:"`

---

## Context

**What problem does this change solve?**

- review-sdlc posts its review comment only after the link gate passes. The link gate is `node plugins/sdlc-utilities/scripts/lib/links.js --file <comment_file> --json` (`plugins/sdlc-utilities/skills/review-sdlc/SKILL.md:185`).
- The gate checks every URL in the body. A finding that quotes an example URL, such as a loopback or cloud-metadata address in an SSRF (server-side request forgery) finding, fails the gate with `url-blocked-host`.
- Then the comment is not posted. It stays only in the review summary file.

**What prompted this change now?**

- Todo #9370 (ledger F-66) recorded this during PR #85: a security finding quoted test URLs, and the review comment could not be posted.

**What does success look like?**

- A body that has a private-IP URL inside an inline code span or inside a fenced block passes the gate. The URL is not reported and not fetched.
- The same URL as plain text is still reported.
- Multi-backtick spans and an unclosed backtick behave as they already do for issue references.
- Line numbers of the other reported URLs stay correct.
- review-sdlc reviewers put example URLs in code spans.

**Re-verification at HEAD b272c6f (all reproduce):**

- `plugins/sdlc-utilities/scripts/lib/links.js:82-98` — `extractUrls` splits the text into lines and runs `URL_REGEX` on each line. It masks nothing. A URL in backticks is extracted with the closing backtick attached, because `URL_REGEX` (`:74`) does not exclude a backtick.
- `links.js:107-134` — `extractIssueRefs` already skips HTML comments, fences (`:113-120`) and inline spans (`:122`).
- `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md:185` — the gate call is unchanged.
- Running the CLI on `tests/promptfoo/fixtures-fs/links-lib/blocked-hosts.txt` with `{"offline":true}` reports all three private URLs as `url-blocked-host`; nothing distinguishes a quoted URL.

## Research Findings

- **The reference implementation is `extractIssueRefs`** (`links.js:107-134`). It works line by line. A fence opens on `^ {0,3}(`{3,}|~{3,})` and closes on a line that starts with the same character and at least the same run length. An unclosed fence hides the rest of the text. Inline spans are blanked with `/(`+)[^`]*?\1/g` on each line, so a span opened by two backticks closes only on two backticks. A lone, unclosed backtick masks nothing. Blanking keeps the length and the newlines (`blank`, `:101-103`), so the line numbers stay `i + 1`.
- **`extractUrls` has one caller in the file**, `validateLinks` (`links.js:~480`). Script callers reach it through `validateLinks`: `scripts/skill/pr.js:665`, `scripts/skill/jira.js:1138` and `scripts/skill/github.js:918`. The CLI is called directly by the plan-sdlc, review-sdlc, commit-sdlc, version-sdlc and received-review-sdlc SKILL.md files (F-links-callers-and-spec-owner-2, F-links-callers-and-spec-owner-3).
- **Spec owner.** `docs/specs/pr-sdlc.md` R15 (`:108`, under `## Gates`) holds the generic-URL safety rule. `docs/specs/version-sdlc.md:81` (R17) refers to pr-sdlc R15. The other callers' specs (commit-sdlc R12, plan-sdlc R18, review-sdlc R14, received-review-sdlc R17, jira-sdlc R22, github-sdlc P12) name links.js by path only. The highest numeric id in pr-sdlc is R19, so the next free id is R20; in review-sdlc it is R19 as well, so R20 is free there too (F-links-callers-and-spec-owner-4, F-links-callers-and-spec-owner-5).
- **Spec-shape rule.** `validate-spec-shape.js` rejects a bare `#<number>` in a spec body; the issue trail goes only in the appendix table (F-links-callers-and-spec-owner-7).
- **Byte copies.** `site/src/content-source/specs/*.md` and `site/src/content-source/skills/*.md` are byte copies of `docs/specs` and `docs/skills`. Each edited file is copied with `cp`. Plans under `site/src/content-source/plans/` are not kept in sync (F-links-callers-and-spec-owner-9, F-links-callers-and-spec-owner-10).
- **Where review-sdlc writes finding text.** Dimension subagents write the findings JSON from the prompt template in `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` §2 (`## Output Format`, `:188`). The orchestrator's judgment pass (`plugins/sdlc-utilities/agents/review-orchestrator.md:53`) rewrites that JSON. `scripts/skill/review-consolidate.js` `renderComment` (`:357-411`) writes `description` and `suggestion` raw, so no script change is needed (F-review-comment-url-quoting-and-exec-tests-4, F-review-comment-url-quoting-and-exec-tests-6, F-review-comment-url-quoting-and-exec-tests-8).
- **Exec test shape.** `tests/promptfoo/datasets/links-lib-exec.yaml` cases use `script_path: "repo://plugins/sdlc-utilities/scripts/lib/links.js"`, `script_args: "--file {{project_root}}/<fixture> --json --ctx {{ctx}}"`, `project_root: "file://fixtures-fs/links-lib"` and `contains` / `not-contains` asserts. With `ctx` `{"offline":true}`, a private-IP URL gives `url-blocked-host` without network, so "not reported" is a safe proof of "not fetched". No existing fixture has a URL inside backticks (`grep` over `tests/promptfoo/fixtures-fs` and the exec datasets), so existing cases are not affected (F-review-comment-url-quoting-and-exec-tests-9, F-review-comment-url-quoting-and-exec-tests-10, F-review-comment-url-quoting-and-exec-tests-11).
- **Do not edit** the stale worktree under `.claude/worktrees/` (F-links-callers-and-spec-owner-11).

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| HTML comments | no | the URL skip covers code spans and fences only; URLs inside HTML comments are still checked | the request names code spans and fenced blocks; widening the skip to comments changes more caller behaviour than the fix needs (smallest viable cut) |
| Shared helper | no | factors the fence and span masking of `extractIssueRefs` into one helper used by both extractors | DRY: the request says "the same way `extractIssueRefs` skips"; one helper keeps the two rules from drifting; issue-ref behaviour is unchanged |
| Unclosed fence | no | an unclosed fence hides the rest of the body from the URL check, as it already does for issue refs | the request asks for the same behaviour as `extractIssueRefs`; a Markdown renderer also shows the rest as code |
| Behavioural test for the review-sdlc prose rule | no | no behavioural case is added; the REFERENCE.md and orchestrator sentences are verified by review | the behavioural suite is owner-initiated only; the gate behaviour itself is covered by exec cases |
| Other callers' specs and docs | no | not edited; pr-sdlc R20 states the rule for every caller by name | one owner spec avoids seven copies of the same sentence |
| User docs (Task 4) | no | adds one sentence to the review-sdlc and pr-sdlc link-gate pages | the request does not name docs, but plan-sdlc R71 requires a behaviour change to update the skill's user docs; two sentences keep users from hitting the old failure |
| Release | no | no version task; ship's version step bumps to 0.54.0 (`--bump minor`) | owner correction 2026-11-13 |
| Issue link in the PR | no | the PR body names #9371 and #9370 without a `Fixes` or `Closes` keyword | tracking ids are internal register ids, not GitHub issues (project note); this is how the plan meets `pr-link-github-issue` |

### Decisions taken without the owner

- The skip rule is a new requirement, pr-sdlc R20, under `## Gates` right after R15. R15 is not edited, so its acceptance stays stable.
- review-sdlc gets a new R20 for the writing rule (reviewers quote example URLs in code spans). It cites pr-sdlc R20.
- HTML comments are out of the URL skip (see the Deviations row).
- The user docs updated are review-sdlc and pr-sdlc (the two link-gate pages closest to the problem and to the owner spec). The other link-gate pages (commit-sdlc, jira-sdlc, plan-sdlc, received-review-sdlc, version-sdlc) stay as they are; they describe the classes checked, which do not change.

## Key Decisions

- **One masking helper over a second copy of the logic.** The alternative is to paste the fence and span code into `extractUrls`. One helper wins because the request asks for the same behaviour as the issue-ref skip, and two copies would drift.
- **Fences and code spans only, not HTML comments.** `extractIssueRefs` also blanks HTML comments. Its helper call keeps that step, but `extractUrls` does not get it. The request names code only; a URL hidden in a comment is a different question.
- **A prose rule for reviewers, not a script rewrite of finding text.** The alternative is to make `review-consolidate.js` wrap URLs. A script cannot tell an example URL from a real reference link, so the decision belongs to the reviewer that writes the finding. The orchestrator's judgment pass is the second chance.
- **Root problem in one sentence.** The link gate cannot tell a URL the reader should open from a URL that is quoted as code, so it blocks honest review comments.
- **Who fails if this ships wrong.** Every skill that publishes text through `links.js` (PR bodies, commit messages, changelogs, Jira payloads, GitHub comments, plans, review comments). Too wide a mask lets a broken or unsafe link through unchecked; a wrong line number misleads the user who fixes a violation. The exec cases cover both.
- **Smallest viable cut.** Task 2 alone fixes the gate. Task 1 is required by spec-first. Task 3 makes review-sdlc actually quote example URLs, which the request asks for. Task 4 is two sentences of user docs, so users know how to quote a URL.
- **Non-goals.** No change to the SSRF guard, redirects or GitHub Enterprise host handling; no HTML-comment skip for URLs; no change to `github-content.js` masking; no script rewrite of finding text in `review-consolidate.js`; no behavioural or headless run; no version or CHANGELOG edit.
- **Workspace modes.** No task reads or writes state files, config or cwd-dependent paths; `links.js` works on the text it is given, so the change behaves the same under `ship.workspace=branch` and `ship.workspace=worktree`.
- **Spec owner is pr-sdlc.** It already owns the generic-URL safety rule (R15) that version-sdlc refers to. A new id keeps R15's text and acceptance stable.

## Contract Examples

### code

```markdown
**Contract:**
- shape (code): `maskCodeLines(lines: string[]): string[]` — same length, each line the same length; fence lines blanked; inline spans blanked.
- names: `maskCodeLines`, `extractUrls`, `extractIssueRefs`.
- mirror: `extractIssueRefs` fence and span logic at `plugins/sdlc-utilities/scripts/lib/links.js:113-122`.
- decisions: line-preserving blanking so line numbers stay `i + 1`.
- sync: `validateLinks` calls `extractUrls` unchanged.
```

### docs

```markdown
**Contract:**
- shape (docs): MODIFY `docs/skills/review-sdlc.md` `## Link Verification (issue #198)` — append one sentence on code spans and fences (audience: end users); cross-link pr-sdlc R20 by name.
- names: section `## Link Verification (issue #198)`.
- mirror: the existing sentence style of that section.
- decisions: user-facing prose only.
- sync: `site/src/content-source/skills/review-sdlc.md` byte copy.
```

### openspec

```markdown
**Contract:**
- shape (openspec): ADD `R20` to `docs/specs/pr-sdlc.md` under `## Gates` after R15; numbering continues from R19; appendix row added.
- names: `R20` (new).
- mirror: R15 block style at `docs/specs/pr-sdlc.md:108-109`.
- decisions: new id over editing R15.
- sync: `site/src/content-source/specs/pr-sdlc.md` byte copy.
```

## Tasks

### Task 1: Spec the code-span skip and the reviewer quoting rule

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** lint

**Files:**
- Modify: `docs/specs/pr-sdlc.md` — ADD R20 under `## Gates` after R15's acceptance line; ADD appendix row
- Modify: `docs/specs/review-sdlc.md` — ADD R20 under `## Gates` after R14; ADD appendix row
- Modify: `site/src/content-source/specs/pr-sdlc.md` — byte copy of `docs/specs/pr-sdlc.md` (`cp`)
- Modify: `site/src/content-source/specs/review-sdlc.md` — byte copy of `docs/specs/review-sdlc.md` (`cp`)

**Notes:**
Spec first (AGENTS.md principle 1): Tasks 2 and 3 cite these ids. Brief: F-links-callers-and-spec-owner-4, F-links-callers-and-spec-owner-5, F-links-callers-and-spec-owner-7, F-links-callers-and-spec-owner-9. No bare `#<number>` in the body text (validate-spec-shape ISSUE_REF); the tracking id goes only in the appendix tables. Copy each edited spec with `cp docs/specs/<f> site/src/content-source/specs/<f>`; never run `site/scripts/copy-docs.mjs`.

**Acceptance criteria:**
- [ ] `docs/specs/pr-sdlc.md` has R20 with the text below, placed right after R15's `- Acceptance:` line and before `- R-gh-auth-preflight:`.
- [ ] `docs/specs/review-sdlc.md` has R20 with the text below, placed right after the R14 line and before `- R-orchestrator-await:`.
- [ ] Each spec's `### Issue trail` table ends with the new row below.
- [ ] No existing id is renumbered or edited.
- [ ] `cmp docs/specs/pr-sdlc.md site/src/content-source/specs/pr-sdlc.md` and `cmp docs/specs/review-sdlc.md site/src/content-source/specs/review-sdlc.md` print nothing.
- [ ] `node plugins/sdlc-utilities/scripts/ci/validate-spec-shape.js --root . --strict` exits 0.

**Contract:**
- shape (openspec): ADD `R20` to `docs/specs/pr-sdlc.md` (Gates) and ADD `R20` to `docs/specs/review-sdlc.md` (Gates); numbering continues from R19 in both files; one appendix row each. Delta text:

  `docs/specs/pr-sdlc.md`, after R15's acceptance line:

  ```markdown
  - R20: Code is not a link — `scripts/lib/links.js` does not extract, report or fetch a URL that sits inside an inline code span or a fenced code block. A fence opens on a line that starts with up to three spaces and three or more backticks or tildes, and closes on a line that starts with the same character in a run at least as long; an unclosed fence runs to the end of the body. An inline span is a run of one or more backticks, text without a backtick, and the same run again on the same line; a backtick with no such closing run on its line opens no span. URLs inside HTML comments are still checked. The line number reported for every other URL stays its line in the original body. The rule holds for every caller of `links.js`: pr-sdlc, version-sdlc, commit-sdlc, plan-sdlc, review-sdlc, received-review-sdlc, jira-sdlc and github-sdlc.
    - Acceptance: exec — a body with `http://10.0.0.5/x` inside an inline code span and `http://169.254.169.254/latest/meta-data` inside a fenced block is not reported for either URL, nor for `http://127.0.0.1/z` in a double-backtick span; the same URL as plain text is reported as `url-blocked-host`; a URL after a lone, unclosed backtick is reported; a plain URL below a fenced block is reported with its original line number.
  ```

  `docs/specs/review-sdlc.md`, after the R14 line:

  ```markdown
  - R20: Example URLs are quoted as code — a dimension reviewer writes every URL that a finding quotes as an example or as test data (not as a link for the reader to open) inside an inline code span, and the orchestrator's judgment pass wraps such a URL in a code span when a finding leaves it bare. A URL in a code span is not checked by the R14 link gate (pr-sdlc R20), so a finding that quotes a loopback, private or metadata address does not stop the comment from being posted.
    - Acceptance: `REFERENCE.md` §2 `## Output Format` and `agents/review-orchestrator.md` Step 3 state the rule; review only (behavioural runs are owner-initiated).
  ```

  Appendix rows (append to each `### Issue trail` table):

  ```markdown
  | R20 | code spans and fences are not links, #9371 |
  ```

  (review-sdlc row text: `| R20 | example URLs quoted as code, #9371 |`)
- names: `R20` (pr-sdlc, new), `R20` (review-sdlc, new).
- mirror: R15 block style at `docs/specs/pr-sdlc.md:108-109`; R14 line at `docs/specs/review-sdlc.md:114`; appendix rows such as `| R19 | upstream counts only on a matching branch name, #9364 |`.
- decisions: new ids over editing R15/R14 (Key Decisions); HTML comments stay checked (Deviations).
- sync: site byte copies listed under Files; Task 2 implements pr-sdlc R20; Task 3 implements review-sdlc R20; Task 4 documents both.

### Task 2: Skip URLs in code spans and fences in links.js, with exec cases

**Complexity:** Standard
**Risk:** Medium
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `plugins/sdlc-utilities/scripts/lib/links.js` — add `maskCodeLines`; `extractUrls` and `extractIssueRefs` use it
- Modify: `tests/promptfoo/datasets/links-lib-exec.yaml` — add four cases at the end of the file
- Create: `tests/promptfoo/fixtures-fs/links-lib/urls-in-code.txt`
- Create: `tests/promptfoo/fixtures-fs/links-lib/urls-plain-and-spans.txt`

**Notes:**
links.js is shared by pr.js, jira.js, github.js and five SKILL.md CLI calls, so the existing `links:` cases are the regression net; `extractIssueRefs` must give the same refs as before (its HTML-comment blanking and URL blanking stay). Offline ctx proves "not fetched": a private-IP URL that reached the checker would be reported as `url-blocked-host`. Implements pr-sdlc R20. Brief: F-links-extracturls-code-span-skip-1, F-links-extracturls-code-span-skip-2, F-links-extracturls-code-span-skip-4, F-review-comment-url-quoting-and-exec-tests-9, F-review-comment-url-quoting-and-exec-tests-11.

**Acceptance criteria:**
- [ ] `maskCodeLines` exists and `extractUrls` runs `URL_REGEX` on its output; `extractIssueRefs` uses it for the fence and span steps and returns the same refs as before.
- [ ] The four new cases and every existing `links:` case pass with: `cd tests/promptfoo && npx --yes promptfoo@0.123.1 eval -c promptfooconfig-exec.yaml -j 1 --no-cache --filter-pattern "links:"`
- [ ] No other file is edited.

**Contract:**
- shape (code):

  ```js
  // Blank fenced code blocks (opener, body and closer) and inline code spans,
  // keeping each line's length so line numbers and columns survive (pr-sdlc R20).
  function maskCodeLines(lines) { /* returns string[] of lines.length */ }
  ```

  Rules (mirror of `extractIssueRefs` `:113-122`):

  | Input line state | Output line |
  |---|---|
  | matches `/^ {0,3}(`{3,}|~{3,})/` with no fence open | `blank(line)`; fence opens with that run |
  | inside an open fence | `blank(line)`; a line whose run has the same char and length ≥ opener closes the fence |
  | outside a fence | `line.replace(/(`+)[^`]*?\1/g, blank)` |

  Change sites:

  ```diff
   function extractUrls(text) {
     if (!text || typeof text !== 'string') return [];
     const seen = new Map(); // url -> first line number
  -  const lines = text.split(/\r?\n/);
  +  const lines = maskCodeLines(text.split(/\r?\n/));
     for (let i = 0; i < lines.length; i++) {
  ```

  ```diff
   function extractIssueRefs(text) {
     if (!text || typeof text !== 'string') return [];
  -  const lines = text.replace(/<!--[\s\S]*?-->/g, blank).split(/\r?\n/);
  +  const lines = maskCodeLines(text.replace(/<!--[\s\S]*?-->/g, blank).split(/\r?\n/));
     ...
  -  let fence = null;
     for (let i = 0; i < lines.length; i++) {
  -    const f = lines[i].match(/^ {0,3}(`{3,}|~{3,})/);
  -    if (fence) { ... continue; }
  -    if (f) { fence = f[1]; continue; }
  -    const line = lines[i].replace(/(`+)[^`]*?\1/g, blank).replace(URL_REGEX, blank);
  +    const line = lines[i].replace(URL_REGEX, blank);
  ```

  `maskCodeLines` is defined after `blank` (`:101-103`); it is not exported (exports at `:634-638` unchanged).

  Fixture `urls-in-code.txt` (exact content, 8 lines; line numbers matter):

  ````text
  Quoted test URL: `http://10.0.0.5/x` in a span.
  Double-backtick span: ``http://127.0.0.1/z`` here.

  ```
  curl http://169.254.169.254/latest/meta-data
  ```

  Plain blocked http://10.0.0.6/after on line 8.
  ````

  Fixture `urls-plain-and-spans.txt` (exact content, 2 lines):

  ```text
  Plain blocked http://10.0.0.5/x on line one.
  Lone backtick ` then http://localhost:8080/y stays checked.
  ```

  New cases, appended at the end of the dataset (all `ctx: '{"offline":true}'`, `project_root: "file://fixtures-fs/links-lib"`, `script_path` and `script_args` as in the other cases):

  | description | fixture | asserts |
  |---|---|---|
  | `links: URLs inside an inline code span, a double-backtick span and a fenced block are not reported` | `urls-in-code.txt` | not-contains `10.0.0.5`; not-contains `127.0.0.1`; not-contains `169.254.169.254` |
  | `links: a plain URL after a fenced block keeps its original line number` | `urls-in-code.txt` | contains `"ok":false`; contains `"url":"http://10.0.0.6/after","line":8` |
  | `links: the same private URL as plain text is still reported as url-blocked-host` | `urls-plain-and-spans.txt` | contains `"ok":false`; contains `"url":"http://10.0.0.5/x","line":1`; contains `url-blocked-host` |
  | `links: a URL after a lone unclosed backtick is still reported with its line` | `urls-plain-and-spans.txt` | contains `"url":"http://localhost:8080/y","line":2` |

  The offline ctx proves "not fetched": a masked private URL that reached the checker would appear as `url-blocked-host`, and no case touches the network.
- names: `maskCodeLines`, `extractUrls`, `extractIssueRefs`, fixtures `urls-in-code.txt`, `urls-plain-and-spans.txt`.
- mirror: `extractIssueRefs` at `plugins/sdlc-utilities/scripts/lib/links.js:107-134`; case shape at `tests/promptfoo/datasets/links-lib-exec.yaml:223-241`.
- decisions: shared helper (Key Decisions); HTML comments not masked for URLs (Deviations); offline ctx so no case touches the network.
- sync: `validateLinks` (`:~480`) and the CLI are unchanged; the existing ref case `links: ctx.github skips identity match, checks URLs and refs by existence (stub gh)` must stay green.

### Task 3: review-sdlc reviewers quote example URLs in code spans

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md` — §2 `## Output Format`: one added sentence
- Modify: `plugins/sdlc-utilities/agents/review-orchestrator.md` — Step 3 judgment pass: one added sentence
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/SKILL.md` — link-gate bullet: one added sentence
- Modify: `plugins/sdlc-utilities/skills/review-sdlc/EXAMPLES.md` — copy check only (plan.copyRules): no edit expected, it does not describe the link gate

**Notes:**
The subagent prompt template is static text sent to every dimension, so the sentence is fixed (no per-run value) and keeps the cached prefix stable. `review-consolidate.js` writes finding text raw (`:357-411`), so no script change. Implements review-sdlc R20. Brief: F-review-comment-url-quoting-and-exec-tests-3, F-review-comment-url-quoting-and-exec-tests-4, F-review-comment-url-quoting-and-exec-tests-6, F-review-comment-url-quoting-and-exec-tests-8. The review-sdlc user doc is Task 4; `site/src/data/skills-meta.ts` needs no change (no flag or connection change).

**Acceptance criteria:**
- [ ] REFERENCE.md §2 `## Output Format` paragraph ends with the sentence below, inside the fenced template.
- [ ] review-orchestrator.md Step 3 paragraph (the one that starts `Read each findings file`) gets the sentence below after `add \`note\` / \`alsoFlaggedBy\`.`.
- [ ] SKILL.md link-gate bullet (line starting `- \`yes\` → **link verification — HARD GATE.**`) gets the sentence below before `<!-- R14 -->`.
- [ ] `node .claude/skills/validate-plugin-consistency/check-consistency.js` exits 0.

**Contract:**
- shape (code): three prose additions, exact text:

  REFERENCE.md §2, appended to the `## Output Format` paragraph:

  ```text
  Write every URL that a finding quotes as an example or as test data, not as a link for the reader, inside an inline code span (for example `http://169.254.169.254/`); the link gate does not check code.
  ```

  review-orchestrator.md Step 3, appended after the `add \`note\` / \`alsoFlaggedBy\`.` sentence:

  ```text
  When a finding quotes an example or test URL as bare text, wrap that URL in an inline code span in the rewrite (review-sdlc R20), so the link gate does not block the comment.
  ```

  SKILL.md link-gate bullet, before `<!-- R14 -->`:

  ```text
  URLs inside inline code spans and fenced code blocks are not checked (pr-sdlc R20).
  ```
- names: `## Output Format` (REFERENCE.md §2), `## Step 3 — Judgment Pass` (review-orchestrator.md), R14 link-gate bullet (SKILL.md).
- mirror: the existing sentence style of `plugins/sdlc-utilities/skills/review-sdlc/REFERENCE.md:188-189` and `plugins/sdlc-utilities/agents/review-orchestrator.md:53`.
- decisions: prose rule over a script rewrite (Key Decisions).
- sync: review-sdlc R20 text from Task 1.

### Task 4: User docs for the code-span skip

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `docs/skills/review-sdlc.md` — `## Link Verification (issue #198)`: one added sentence
- Modify: `docs/skills/pr-sdlc.md` — `## Link Verification (issue #198)`: one added sentence
- Modify: `site/src/content-source/skills/review-sdlc.md` — byte copy (`cp`)
- Modify: `site/src/content-source/skills/pr-sdlc.md` — byte copy (`cp`)
- Modify: `site/src/data/skills-meta.ts` — copy check only (plan.copyRules): no edit expected, no flag or connection changes
- Create: `docs/plans/2026-11-13-lean-w11-link-code-spans.md`

**Notes:**
The other link-gate pages (commit-sdlc, jira-sdlc, plan-sdlc, received-review-sdlc, version-sdlc) were checked and need no change: the URL classes and failure codes they list do not change. plan-sdlc R71 asks a behaviour-changing task to list the user docs of the skill, so the docs are part of the change (F-links-callers-and-spec-owner-8). The plan file is listed as `Create:` here because ship stages only files named in the plan (project rule). Copy each edited doc with `cp docs/skills/<f> site/src/content-source/skills/<f>`.

**Acceptance criteria:**
- [ ] Both sections end with the sentence below.
- [ ] `cmp` of each doc and its site copy prints nothing.
- [ ] `node .claude/skills/validate-skill-docs/check-docs-consistency.js` exits 0.

**Contract:**
- shape (docs): MODIFY both `## Link Verification (issue #198)` sections (audience: end users); append, as the last sentence of the section's last paragraph:

  ```text
  URLs inside inline code spans and fenced code blocks are not links: the validator does not check or fetch them, so quote an example URL in backticks.
  ```
- names: section `## Link Verification (issue #198)` in both docs.
- mirror: `docs/skills/review-sdlc.md:399-401`; `docs/skills/pr-sdlc.md:430-442`.
- decisions: two pages only (Decisions taken without the owner).
- sync: site byte copies listed under Files; pr-sdlc R20 text from Task 1.

## Guardrail Compliance

| Guardrail | Severity | Status | Rationale |
|---|---|---|---|
| test-coverage-required | error | PASS | Task 2 adds four exec cases and two fixtures; no existing case is stale; Task 3 edits prose only |
| no-ci-bypass | error | PASS | No step skips or disables CI |
| no-auto-eval | error | PASS | Only an exec-only config run with a --filter-pattern "links:" filter; no retry loop |
| skill-docs-required | error | PASS | No new SKILL.md is created |
| no-scope-creep | warning | PASS | Four tasks, each tied to the stated requirement; extras justified in Key Decisions |
| single-responsibility-tasks | warning | PASS | Each task has one deliverable (specs, links.js fix, reviewer rule, user docs) |
| scripts-over-llm-logic | error | PASS | The skip is deterministic in links.js; the prose rule is justified because a script cannot tell example URLs from real links |
| yagni | warning | PASS | One unexported helper; no speculative options |
| cross-skill-consistency | error | PASS | All links.js callers identified; pr-sdlc R20 states the rule for every caller |
| pr-link-github-issue | error | PASS | PR body names #9371 and #9370 without a keyword, with the rationale that they are register ids, not GitHub issues |
| dry | warning | PASS | One shared masking helper replaces duplicated fence and span logic |
| kiss | warning | PASS | Smallest approach: reuse the existing extractIssueRefs logic |
| spec-first | error | PASS | Task 1 updates the specs; Tasks 2-4 depend on it |
| project-agnostic | error | PASS | Changes ship in plugin code, specs and docs |
| flag-coherence-cross-skill | error | PASS | No flags involved |
| no-opposite-logical-vectors | error | PASS | No divergent gate phrasings; one rule R20 |
| flag-resolution-single-source | warning | PASS | No flags involved |
| state-premise | error | PASS | Root problem stated in Key Decisions and Context |
| smallest-viable-cut | warning | PASS | Key Decisions names Task 2 as the minimum and justifies Tasks 1, 3 and 4 |
| failure-audience | warning | PASS | Key Decisions names the skills that publish text through links.js |
| explicit-non-goals | warning | PASS | Non-goals listed in Key Decisions |
| ambiguity-stops-and-asks | error | PASS | Viable alternatives and the choices made are recorded in Key Decisions and Deviations |
| state-machine-idempotency | error | PASS | No migration, init or preflight logic modified |
| agent-dispatch-script-driven | error | PASS | No agent dispatch parameters added |
| flag-semantic-consistency-cross-skill | error | PASS | No new flag |
| workspace-mode-compatibility | error | PASS | Plan states there is no state, config or cwd dependence, so behaviour is identical in branch and worktree modes |
| prompt-cache-hit-ratio | warning | PASS | Added sentences are fixed static text with no volatile bytes |

## Suggested Review Dimensions

### UPDATE: runtime-contract (B1)

**Why:** Task 2 changes the observable output of the shared `plugins/sdlc-utilities/scripts/lib/links.js` CLI, so the gate now skips URLs in code, and Task 3 documents that in `review-sdlc/SKILL.md`.

**Severity hint:** high

**Patch:** Add a checklist item: the links.js CLI and validateLinks no longer report or fetch URLs inside inline code spans or fenced blocks (pr-sdlc R20), for every caller.

**Action (dimension):** edit `.sdlc/review-dimensions/runtime-contract.md` — Add a checklist item: the links.js CLI and validateLinks no longer report or fetch URLs inside inline code spans or fenced blocks (pr-sdlc R20), for every caller.

**Action (Copilot mirror, X1):** regenerate .github/instructions/runtime-contract.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

### UPDATE: code-quality (U1)

**Why:** Task 1 to Task 4 edit `docs/specs/pr-sdlc.md`, `REFERENCE.md` and `docs/skills/*.md`, which the code-quality trigger does not match today.

**Severity hint:** medium

**Patch:** add trigger `**/*.md`

**Action (dimension):** edit `.sdlc/review-dimensions/code-quality.md` — add trigger `**/*.md`

### CREATE: documentation-quality-review

**Why:** Task 1 and Task 4 edit `site/src/content-source/specs/pr-sdlc.md` and `site/src/content-source/skills/review-sdlc.md`, and no existing dimension covers them.

**Severity hint:** medium

**Triggers:** `site/**`, `docs/**`

**Action (dimension):** /setup-sdlc --dimensions — add `documentation-quality-review` with triggers `site/**`, `docs/**`

**Action (Copilot mirror, X1):** regenerate .github/instructions/documentation-quality-review.instructions.md per setup-sdlc/setup-dimensions.md Step 8 transform

_1 additional candidates suppressed_

## Verification Scorecard

| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |
|---|---|---|---|---|
| Completeness | 0 | 0 | 0 | 1 |
| Correctness | 0 | 0 | 0 | 1 |
| Coherence | 0 | 0 | 0 | 1 |

### Traceability

*(Matrix built from requirements checklist — requirement inventory unavailable)*

| Requirement | Covering task(s) | Status |
|---|---|---|
| 1 links.js extractUrls skips URLs inside inline code spans and fenced code blocks, the same way extractIssueRefs does. | Task 2 | covered |
| 2 Record the skip rule in the spec that owns links.js behaviour (spec first, new id, never renumber), stating it holds for every caller. | Task 1 | covered |
| 3 review-sdlc (orchestrator / subagent template) puts example or quoted URLs in findings inside code spans. | Task 1, Task 3, Task 4 | covered |
| 4 Exec cases: private-IP URL in inline span and fenced block passes; same URL as plain text reported; multi-backtick span and unclosed backtick behave as in extractIssueRefs; other URLs keep correct line numbers. | Task 2 | covered |
| 5 Keep existing exec cases of links.js callers (pr-sdlc, version-sdlc, jira) green. | Task 2 | covered |
| 6 No version task; no version field or CHANGELOG edit. | — | covered |

**Verdict:** All checks passed. Ready for archive.

## Final Shape

- `links.js` has one helper that blanks fenced blocks and inline code spans. Both extractors use it. A URL in code is not reported and not fetched, for every caller.
- URLs in HTML comments and plain text are checked as before. Line numbers are unchanged.
- pr-sdlc R20 records the rule for every caller. review-sdlc R20 records that reviewers quote example URLs in code spans.
- The review-sdlc prompt template, the orchestrator and the skill state that rule.
- The review-sdlc and pr-sdlc user docs say URLs in code are not checked.
- Four new exec cases prove the skip, the plain-text report, the span edge cases and the line numbers.


## OpenSpec Appendix

Not applicable — no OpenSpec change
