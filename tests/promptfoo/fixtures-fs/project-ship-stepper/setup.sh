#!/bin/bash
# Fixture for the ship.js step emitter (P-STEP-1..4, P-TRANS-1), driven by
# tests/promptfoo/scripts/run-ship-stepper.js. The wrapper copies one seed
# ledger into .sdlc/execution/ as ship-<branch slug>-20261019T120000Z.json
# (the name findStateFile/detectResumeState match) before calling ship.js.
# No .sdlc/.gitignore here (reading 5).
set -e
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

cat > plan.md <<'EOF'
# Add widget support

## Tasks

### Task 1: Add the widget module

### Task 2: Wire the widget into the CLI
EOF

# A plan without any "### Task N:" heading (case y, R-SHIPTODOS-FAILLOUD).
cat > plan-notasks.md <<'EOF'
# Add widget support

## Tasks

- Add the widget module
EOF

mkdir -p seed results .sdlc/execution

# Frozen flags shared by the seeds below (keys of ledger.flags after init, L7).
FROZEN_COMMON=$(cat <<EOF
"bump": "patch", "draft": false, "resume": false, "openspecChange": null,
    "reviewThreshold": "high",
    "verifyPipelineTimeout": 1800, "verifyPipelineInterval": 30, "verifyPipelineMaxIterations": 3,
    "awaitRemoteReviewTimeout": 1800, "awaitRemoteReviewInterval": 30, "awaitRemoteReviewers": ["copilot"],
    "executeWaveTimeout": 900, "executeWaveInterval": 60, "executeCommitWaves": false,
    "planFile": "$PWD/plan.md",
    "openspecContext": { "branchMatch": null, "isAlreadyArchived": false, "tasksDone": null, "tasksTotal": null },
    "sources": { "steps": "cli", "auto": "default", "rebase": "cli", "workspace": "derived" }
EOF
)

# Full-pipeline ledger in workspace=continue: execute, commit, review, version, pr, learnings-commit.
frozen_ledger() {
  local dry="$1" exec_status="$2" commit_status="$3"
  cat <<EOF
{
  "version": 1,
  "startedAt": "2026-10-19T12:00:00.000Z",
  "branch": "feat/ship",
  "worktree": "$PWD",
  "sessionId": null,
  "flags": {
    "auto": false, "dryRun": $dry, "hasPlan": true, "workspace": "continue", "rebase": "skip",
    "steps": ["execute", "commit", "review", "version", "pr", "learnings-commit"],
    $FROZEN_COMMON
  },
  "steps": [
    { "name": "execute", "status": "$exec_status" },
    { "name": "commit", "status": "$commit_status" },
    { "name": "review", "status": "pending" },
    { "name": "received-review", "status": "pending", "condition": "if critical/high findings" },
    { "name": "commit-fixes", "status": "pending", "condition": "if received-review made changes" },
    { "name": "version", "status": "pending" },
    { "name": "verify-openspec", "status": "skipped", "reason": "not in steps[]" },
    { "name": "archive-openspec", "status": "skipped", "reason": "not in steps[]" },
    { "name": "pr", "status": "pending" },
    { "name": "verify-pipeline", "status": "skipped", "reason": "not in steps[]" },
    { "name": "await-remote-review", "status": "skipped", "reason": "not in steps[]" },
    { "name": "learnings-commit", "status": "pending" }
  ],
  "decisions": [],
  "deferredFindings": [],
  "history": [],
  "currentStep": "confirm_pipeline"
}
EOF
}

frozen_ledger false pending pending > seed/ledger-frozen.json
frozen_ledger true pending pending > seed/ledger-frozen-dryrun.json
frozen_ledger false completed completed > seed/ledger-frozen-resumed.json
frozen_ledger false in_progress pending > seed/ledger-frozen-exec.json

# Execute state files (cases t-v): the wrapper copies seed/execute-<name>.json to
# .sdlc/execution/execute-feat-ship-20261019T120000Z.json, where
# readState('execute', ...) and `state/execute.js verify-completeness` find it.
execute_state() {
  local planned="$1" tasks="$2"
  cat <<EOF
{
  "version": 1,
  "branch": "feat/ship",
  ${planned}
  "waves": [ { "wave": 1, "tasks": [ ${tasks} ] } ]
}
EOF
}
DONE1='{ "id": "1", "status": "completed" }'
DONE2='{ "id": "2", "status": "completed" }'
execute_state '"plannedTaskIds": ["1", "2"],' "$DONE1, $DONE2" > seed/execute-complete.json
execute_state '"plannedTaskIds": ["1", "2"],' "$DONE1" > seed/execute-missing.json
execute_state '' "$DONE1, $DONE2" > seed/execute-noplanned.json

# workspace=branch ledger on main (case n): commit and review only, so the first
# dispatch after branch_prepare carries --expected-branch.
cat > seed/ledger-frozen-branch.json <<EOF
{
  "version": 1,
  "startedAt": "2026-10-19T12:00:00.000Z",
  "branch": "main",
  "worktree": "$PWD",
  "sessionId": null,
  "flags": {
    "auto": false, "dryRun": false, "hasPlan": false, "workspace": "branch", "rebase": "skip",
    "steps": ["commit", "review"],
    $FROZEN_COMMON
  },
  "steps": [
    { "name": "execute", "status": "skipped", "reason": "no plan (--has-plan not set)" },
    { "name": "commit", "status": "pending" },
    { "name": "review", "status": "pending" },
    { "name": "received-review", "status": "pending", "condition": "if critical/high findings" },
    { "name": "commit-fixes", "status": "pending", "condition": "if received-review made changes" },
    { "name": "version", "status": "skipped", "reason": "not in steps[]" },
    { "name": "verify-openspec", "status": "skipped", "reason": "not in steps[]" },
    { "name": "archive-openspec", "status": "skipped", "reason": "not in steps[]" },
    { "name": "pr", "status": "skipped", "reason": "not in steps[]" },
    { "name": "verify-pipeline", "status": "skipped", "reason": "not in steps[]" },
    { "name": "await-remote-review", "status": "skipped", "reason": "not in steps[]" },
    { "name": "learnings-commit", "status": "skipped", "reason": "not in steps[]" }
  ],
  "decisions": [],
  "deferredFindings": [],
  "history": [],
  "currentStep": "confirm_pipeline"
}
EOF

# Legacy ledger (pre-stepper init seed): no planFile/openspecContext/sources, no history.
cat > seed/ledger-legacy.json <<EOF
{
  "version": 1,
  "startedAt": "2026-10-19T12:00:00.000Z",
  "branch": "feat/ship",
  "worktree": "$PWD",
  "sessionId": null,
  "flags": { "auto": false, "dryRun": false, "steps": ["execute", "commit", "review", "pr"] },
  "steps": [
    { "name": "execute", "status": "pending" },
    { "name": "commit", "status": "pending" },
    { "name": "review", "status": "pending" },
    { "name": "received-review", "status": "pending", "condition": "if critical/high findings" },
    { "name": "commit-fixes", "status": "pending", "condition": "if received-review made changes" },
    { "name": "version", "status": "pending" },
    { "name": "pr", "status": "pending" }
  ],
  "decisions": [],
  "deferredFindings": []
}
EOF

# Step results (the --result-file payloads the LLM writes).
echo '{"success":true,"output":{"answer":"yes","summary":"confirmed"}}' > results/yes.json
echo '{"success":true,"output":{"answer":"edit","summary":"edit requested"}}' > results/edit.json
echo '{"success":true,"output":{"answer":"cancel","summary":"cancelled"}}' > results/cancel.json
echo '{"success":true,"output":{"summary":"ok","usage":{"inputTokens":10,"outputTokens":5,"model":"haiku"}}}' > results/generic-ok.json
echo '{"success":true,"output":{"summary":"branch created","artifacts":{"branch":"feat/add-widget-support"}}}' > results/branch-prepare-ok.json
echo '{"success":true,"output":{"summary":"committed abc1234","usage":{"inputTokens":120,"outputTokens":40,"model":"haiku"}}}' > results/commit-ok.json
echo '{"success":false,"output":{"summary":"pre-commit hook failed"}}' > results/commit-fail.json
echo '{"success":true,"output":{"summary":"released v9.9.9","artifacts":{"tag":"v9.9.9"}}}' > results/version-tag-missing.json
echo '{"success":true,"output":{"summary":"pipeline cleaned up"}}' > results/cleanup-ok.json
echo '{"success":true,"output":{"summary":"2 tasks done","usage":{"inputTokens":900,"outputTokens":300,"model":"opus"}}}' > results/execute-ok.json

# Review verdicts: one file per R6 threshold-table row (`threshold` is read by the
# wrapper and written into the seeded ledger's flags.reviewThreshold), plus
# below-threshold and unparseable verdicts.
echo '{"threshold":"critical","success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"CHANGES REQUESTED (1 critical)"}}}' > results/review-critical.json
echo '{"threshold":"high","success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"CHANGES REQUESTED (0 critical, 2 high)"}}}' > results/review-high.json
echo '{"threshold":"medium","success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"CHANGES REQUESTED (1 medium)"}}}' > results/review-medium.json
echo '{"threshold":"low","success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"APPROVED WITH NOTES (3 low)"}}}' > results/review-low.json
echo '{"success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"APPROVED"}}}' > results/review-approved.json
echo '{"success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"APPROVED WITH NOTES (2 medium)"}}}' > results/review-approved-notes.json
echo '{"success":true,"output":{"summary":"reviewed","artifacts":{"verdict":"looks fine to me"}}}' > results/review-unparseable.json

git add -A
git commit -q -m "chore: initial"
git checkout -q -b feat/ship
