#!/bin/bash
# Fixture for pre-tool-agent-isolation-guard.js — opt-out via local.json.
# When hooks.agentIsolationGuard.enabled: false, hook must emit continue.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init --quiet -b main
git config user.email "test@test.com"
git config user.name "Test"
echo "seed" > seed.txt
git add seed.txt
git commit --quiet -m "init"

mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "hooks": { "agentIsolationGuard": { "enabled": false } }
}
EOF
