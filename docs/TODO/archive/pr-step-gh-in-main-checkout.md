# pr step ran gh pr create in the main checkout first (head = base) before retrying from the worktree

Status: Promoted (TK-029)

Plugin defect (lean ledger F-195). In lean-w52 (unit W-E8, PR #146) the ship `pr` step ran `gh pr create` in the main checkout first. There the head branch equalled the base, so the call failed. The step then retried from the ship worktree and succeeded. The cost was one failed call.

Proposal: `ship-step-pr` should run `gh` from the ship worktree, or pass `--head <branch>` explicitly.
