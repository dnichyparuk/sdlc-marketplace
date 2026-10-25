#!/bin/bash
set -e
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p .sdlc
cat > .sdlc/config.json <<'EOF'
{
  "schemaVersion": 4,
  "execute": {
    "guardrails": [
      { "id": "g1", "description": "no direct db", "severity": "error" }
    ],
    "waveTimeout": 900,
    "commitWaves": true,
    "rebase": "auto",
    "waveRunnerMinPlanTasks": 5,
    "specReviewer": "per-wave"
  }
}
EOF

cat > .sdlc/local.json <<'EOF'
{
  "schemaVersion": 4,
  "ship": {
    "executeWaveInterval": 30
  }
}
EOF

git add .sdlc
git commit -q -m "chore: initial"
