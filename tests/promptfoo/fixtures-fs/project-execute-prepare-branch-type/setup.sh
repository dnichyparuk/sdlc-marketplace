#!/bin/bash
# Fixture: plans for execute-prepare branch-type, wave-split, PF3 and OpenSpec
# cases, plus a linked worktree at .wt (branch feat/wt) for the worktree cases.
# Stays on main. .wt/plan-wt-only.md exists only in the linked worktree.
set -e
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

# two_task_plan <file> <title> [source]: writes a valid 2-task plan.
two_task_plan() {
  cat > "$1" <<EOF
# $2 Implementation Plan

**Goal:** Fixture plan for execute-prepare cases.
**Architecture:** Two independent source files.
**Source:** ${3:-conversation context}
**Verification:** npm test

---

## Tasks

### Task 1: First

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: \`src/one.js\`

### Task 2: Second

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: \`src/two.js\`
EOF
}

two_task_plan plan-fix.md "Fix login redirect"
two_task_plan plan-bug.md "Bug in token refresh"
two_task_plan plan-docs.md "Docs refresh for setup"
two_task_plan plan-refactor.md "Refactor state helpers"
two_task_plan plan-chore.md "Chore bump fixtures"
two_task_plan plan-feature.md "Add webhook signing"

cat > plan-openspec.md <<'EOF'
# Add demo spec Implementation Plan

**Goal:** Fixture plan sourced from an OpenSpec change.
**Architecture:** Two independent source files.
**Source:** openspec/changes/demo/
**Verification:** npm test

---

## Tasks

### Task 1: Add demo

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/demo.js`

**openspec-task:**
- change: demo
- ref: add-demo-abc123
- line: 3
- title: Add demo

### Task 2: Wire demo

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/wire.js`
EOF

cat > plan-bad.md <<'EOF'
# Bad plan Implementation Plan

**Goal:** Fixture plan with a task missing its Complexity line.
**Architecture:** Two independent source files.
**Source:** conversation context
**Verification:** npm test

---

## Tasks

### Task 1: First

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/one.js`

### Task 2: Second

**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/two.js`
EOF

# wave_task <n> <complexity> <risk> <depends>: one task of plan-waves.md.
wave_task() {
  cat <<EOF

### Task $1: Wave task $1

**Complexity:** $2
**Risk:** $3
**Depends on:** $4
**Verify:** tests

**Files:**
- Create: \`w$1.js\`
EOF
}

{
  cat <<'EOF'
# Wave split check Implementation Plan

**Goal:** Fixture plan for the weighted cap and risk spreading.
**Architecture:** Six single-file tasks.
**Source:** conversation context
**Verification:** npm test

---

## Tasks
EOF
  wave_task 1 Complex Low none
  wave_task 2 Complex Low none
  wave_task 3 Complex Low none
  wave_task 4 Standard High none
  wave_task 5 Standard High none
  wave_task 6 Trivial Low "Task 1, Task 4"
} > plan-waves.md

mkdir -p openspec/changes/demo/specs
cat > openspec/changes/demo/specs/demo.md <<'EOF'
# Demo spec

### Requirement: Demo
EOF

git add -A
git commit -q -m "chore: initial"

# Linked worktree inside the fixture; the worktree-only plan stays uncommitted.
rm -rf .wt
git worktree add -q .wt -b feat/wt
two_task_plan .wt/plan-wt-only.md "Worktree only"
