#!/usr/bin/env bash
# Builds the execute-two-task fixture repo in the empty eval workspace.
set -euo pipefail
builder="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/_fixture/build-fixture-repo.js"
exec node "$builder" execute
