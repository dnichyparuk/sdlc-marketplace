#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

mkdir -p .claude decoy-plans

# A configured plansDirectory (R72/C19, #505): before the fix, ship.js scanned
# this directory for the most recently modified *.md file and used it as
# context.planFile. That scan is shared across every repo on the machine, so
# it could hand this repo a plan written for a different one.
cat > .claude/settings.json <<'EOF'
{
  "plansDirectory": "decoy-plans"
}
EOF

# The decoy plan: written fresh by this script, so it is always the most
# recently modified *.md in decoy-plans/ — exactly what the old autodiscovery
# ladder would have selected as context.planFile with no --plan supplied.
cat > decoy-plans/unrelated-repo-plan.md <<'EOF'
# Plan: Unrelated Repository Feature

This plan document does not belong to this repository. If ship.js ever
resolves context.planFile by scanning a configured plansDirectory instead of
requiring an explicit --plan flag, this decoy would be wrongly selected and
implemented here (issue #505).
EOF

git add -A
git commit -q -m "init"
