#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
# Fixture for lib-worktree-exec.yaml — resolveMainWorktreeSafe from non-git cwd.
# This is NOT a git repo — the safe variant should return cwd as fallback.
# No git init intentionally.
mkdir -p not-a-git-dir
echo "not-git" > not-a-git-dir/marker.txt
