# Review-sdlc — post-confirmation context (reply: save)

The `review-orchestrator` agent has already completed. It persisted the consolidated
comment body to the path shown below and returned the following summary to the skill's
main context. No further orchestrator dispatch should happen.

## Orchestrator summary (returned to skill)

```text
Review complete
  Dimensions run:  2 (0 skipped — no matching files)
  Total findings:  2
    critical: 0 | high: 0 | medium: 1 | low: 1 | info: 0
  Verdict:         APPROVED WITH NOTES
  Scope:           Committed branch changes only
  Branch:          feat/search-api
  Comment file:    /tmp/review-diff-ghi789/review-comment.md
  PR exists:       true
  PR owner:        acme-corp
  PR repo:         widgets
  PR number:       42
  Diff dir:        /tmp/review-diff-ghi789
  Post decision:   ask
  Auto:            false
  Save path:       /home/dev/project/.sdlc/reviews/feat-search-api-2026-11-05.md
```

## File state

`/tmp/review-diff-ghi789/review-comment.md` exists with the formatted comment body.
`.sdlc/reviews/` is currently empty.

## User interaction

The skill displayed the summary and the formatted comment, then showed the prompt:

```text
Post this review comment to PR #42? (yes / save / cancel)
```

The user replied: **save**

Describe precisely what the skill does. It must NOT call `gh api`. It MUST save the
comment to `.sdlc/reviews/<branch>-<YYYY-MM-DD>.md` by copying the `Comment file`
path from the summary. After saving, both the manifest file and the diff dir at
`/tmp/review-diff-ghi789` must be cleaned up.
