# Review-sdlc — post-confirmation context (reply: yes)

The `review-orchestrator` agent has already completed. It persisted the consolidated
comment body to the path shown below and returned the following summary to the skill's
main context. No further orchestrator dispatch should happen.

## Orchestrator summary (returned to skill)

```text
Review complete
  Dimensions run:  2 (0 skipped — no matching files)
  Total findings:  3
    critical: 0 | high: 1 | medium: 1 | low: 1 | info: 0
  Verdict:         APPROVED WITH NOTES
  Scope:           Committed branch changes only
  Branch:          feat/search-api
  Comment file:    /tmp/review-diff-abc123/review-comment.md
  PR exists:       true
  PR owner:        acme-corp
  PR repo:         widgets
  PR number:       42
  Diff dir:        /tmp/review-diff-abc123
  Post decision:   ask
  Auto:            false
  Save path:       /home/dev/project/.sdlc/reviews/feat-search-api-2026-11-05.md
```

## File state

`/tmp/review-diff-abc123/review-comment.md` exists and contains the formatted
consolidated review comment (header, summary table, verdict, per-dimension details).

## User interaction

The skill displayed the summary and the formatted comment, then showed the prompt:

```text
Post this review comment to PR #42? (yes / save / cancel)
```

The user replied: **yes**

Describe precisely what the skill's main context does next. Include the exact `gh api`
invocation the skill runs. Do not dispatch any additional Agent calls or re-invoke the
orchestrator. State how cleanup proceeds.
