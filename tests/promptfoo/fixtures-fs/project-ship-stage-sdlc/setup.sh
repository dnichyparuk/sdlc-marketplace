#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
printf '.sdlc/execution/\n' > .gitignore
mkdir -p .sdlc/review-dimensions .sdlc/execution
echo "v1" > .sdlc/review-dimensions/x.md
git add -A
git commit -q -m "init"
echo "v2" > .sdlc/review-dimensions/x.md
echo "{}" > .sdlc/execution/state.json
cat > plan.md <<'EOF'
# Plan

### Task 1: A

**Files:**
- Modify: `.sdlc/review-dimensions/x.md`
- Modify: `.sdlc/execution/state.json`
- Create: `.sdlc/missing.md`
- Modify: `.sdlc/../.gitignore`
- Modify: `src/a.js`
EOF
cat > plan-none.md <<'EOF'
# Plan

### Task 1: A

**Files:**
- Modify: `src/a.js`
EOF
