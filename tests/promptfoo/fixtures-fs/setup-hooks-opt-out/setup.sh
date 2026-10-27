#!/bin/bash
# Fixture for setup-prepare hooks section — opt-out already written.
# Verifies that setup.js detects hooks.agentIsolationGuard.enabled: false
# and populates the hooks section summary correctly.
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git commit -q --allow-empty -m "init"

mkdir -p .sdlc
cat > .sdlc/local.json << 'EOF'
{
  "schemaVersion": 3,
  "hooks": { "agentIsolationGuard": { "enabled": false } }
}
EOF
