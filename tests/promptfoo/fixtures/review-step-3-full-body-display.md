# Review-sdlc — Step 3 full-body display context (issue #176)

The `review-orchestrator` agent has already completed. It persisted the consolidated
comment body to the path shown below and returned the structured summary that follows.
You are the skill's main context resuming at **Step 3 — Parse Orchestrator Summary
and Display Full Comment Body**.

## Orchestrator summary (returned to skill)

```text
Review complete
  Dimensions run:  3 (0 skipped)
  Total findings:  4
    critical: 1 | high: 1 | medium: 1 | low: 1 | info: 0
  Verdict:         CHANGES REQUESTED
  Scope:           Committed branch changes only
  Branch:          feat/search-api
  Comment file:    /tmp/review-diff-issue176/review-comment.md
  PR exists:       true
  PR owner:        acme-corp
  PR repo:         widgets
  PR number:       57
  Diff dir:        /tmp/review-diff-issue176
  Post decision:   ask
  Auto:            false
  Save path:       /home/dev/project/.sdlc/reviews/feat-search-api-2026-11-05.md
```

## File state

`/tmp/review-diff-issue176/review-comment.md` exists. Its full contents are reproduced
verbatim below — this is what the Read tool would return when the skill loads
`comment_file`. Per **R13 / G5** the skill must emit these contents verbatim in the
main context before any posting prompt.

## Contents of `/tmp/review-diff-issue176/review-comment.md`

```markdown
# Code Review — feat/search-api

**Verdict:** CHANGES REQUESTED
**Scope:** Committed branch changes only
**Base branch:** main
**Findings:** 4 (1 critical, 1 high, 1 medium, 1 low)

## Summary

| Dimension | Severity | Findings |
|---|---|---|
| security-review | critical | 1 |
| security-review | high | 1 |
| code-quality-review | medium | 1 |
| api-review | low | 1 |

---

<details>
<summary>security-review (2 findings)</summary>

### CRITICAL — `src/auth/login.ts:42` — Plaintext password comparison

The login handler compares `req.body.password` against the stored hash using `===` instead of a constant-time bcrypt comparison. This leaks timing information and accepts the raw hash if an attacker can read it from the database.

**Fix:** Replace `user.passwordHash === req.body.password` with `await bcrypt.compare(req.body.password, user.passwordHash)`.

### HIGH — `src/auth/session.ts:88` — Session token has no expiry

`createSession()` issues a JWT without an `exp` claim, so tokens are valid forever once issued. Combined with no revocation list, a leaked token is permanent.

**Fix:** Add `expiresIn: '24h'` to the `jwt.sign()` options and document refresh-token rotation.

</details>

<details>
<summary>code-quality-review (1 finding)</summary>

### MEDIUM — `src/search/query.ts:120` — Unbounded recursion in nested filter parser

`parseFilter()` recurses into `filter.children` without a depth limit. A pathological 10-deep nested query crashes the worker with stack overflow.

**Fix:** Add a `MAX_FILTER_DEPTH = 8` guard and reject deeper queries with a 400 response.

</details>

<details>
<summary>api-review (1 finding)</summary>

### LOW — `src/api/search.ts:15` — Inconsistent response envelope

`/api/search` returns `{ results: [] }` while every other endpoint returns `{ data: [] }`. This breaks the SDK's response normalizer.

**Fix:** Rename `results` to `data` or add the field as an alias for one release before removing.

</details>

---

_Posted by `/review-sdlc` — 4 findings across 3 dimensions._
```

## What the skill must do next

Per Step 3 (R13, G5):

1. Display the orchestrator's structured summary above verbatim.
2. Parse summary fields (`comment_file`, `pr.*`, `verdict`, `scope`, `branch`, `diff_dir`).
3. **Read `comment_file` and emit its full contents verbatim** in a fenced block — every
   finding (critical, high, medium, low) must appear with its `file:line` reference and
   message text. Do NOT collapse non-critical findings to placeholders like
   "Additional finding (see PR comment for details)". Do NOT synthesize a severity/count
   table in place of the body.
4. Only after the full body is shown, present the Step 4 posting prompt
   (`yes / save / cancel`).
