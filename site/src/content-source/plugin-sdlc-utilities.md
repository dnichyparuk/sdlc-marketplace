# Plugin: sdlc-utilities

`sdlc-utilities` automates common SDLC tasks. See the [README](../README.md) for installation.

## Skills

| Skill | Description |
| --- | --- |
| [`/plan-sdlc`](skills/plan-sdlc.md) | Write an implementation plan from requirements with per-task complexity, risk, and dependency metadata |
| [`/execute-plan-sdlc`](skills/execute-plan-sdlc.md) | Execute an implementation plan with adaptive task classification, wave-based parallel dispatch, and automatic error recovery |
| [`/review-sdlc`](skills/review-sdlc.md) | Run multi-dimension code review on the current branch |
| [`/received-review-sdlc`](skills/received-review-sdlc.md) | Process code review feedback with verification, self-critique, and implementation |
| [`/commit-sdlc`](skills/commit-sdlc.md) | Analyze staged changes, generate a commit message matching project style, stash unstaged changes, and commit |
| [`/pr-sdlc`](skills/pr-sdlc.md) | Create a PR with an auto-generated structured description |
| [`/version-sdlc`](skills/version-sdlc.md) | Bump version, create git tag, optionally generate CHANGELOG, and push |
| [`/setup-sdlc`](skills/setup-sdlc.md) | Unified project setup: config, review dimensions, PR template, and plan guardrails (replaces legacy init skills) |
| [`/jira-sdlc`](skills/jira-sdlc.md) | Create, edit, search, and transition Jira issues with cached project metadata |
| [`/github-sdlc`](skills/github-sdlc.md) | Create, edit, search, close, link and comment on GitHub issues with cached repository metadata |
| [`/ship-sdlc`](skills/ship-sdlc.md) | End-to-end feature shipping: plan execution, commit, review, version, and PR creation |
| [`/harden-sdlc`](skills/harden-sdlc.md) | After a pipeline failure, analyze hardening surfaces (guardrails, review dimensions, copilot instructions) and propose user-approved edits that would catch the same class of failure earlier next time |
