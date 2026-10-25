#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
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
