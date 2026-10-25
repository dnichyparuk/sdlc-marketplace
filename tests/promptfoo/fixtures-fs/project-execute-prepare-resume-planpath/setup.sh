#!/bin/bash
set -e
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q -b main
git config user.email "test@test.com"
git config user.name "Test"
git config commit.gpgsign false

cat > plan.md <<'PLAN_EOF'
# Fixture Four Task Implementation Plan

**Goal:** Provide a four-task plan for execute-plan-sdlc prepare-script cases.
**Architecture:** Four small source files with one dependency edge between tasks.
**Source:** conversation context
**Verification:** npm test

---

## Context

**What problem does this change solve?** The prepare script needs a realistic plan to parse.

**What prompted this change now?** Prepare-script contract cases need a stable fixture.

**What does success look like?** The plan validates and parses into four tasks.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| None | — | — | — |

---

## Key Decisions

- **Four tasks, one dependency:** Task 3 depends on Task 1; the rest are independent.

---

## Security Impact

Not applicable — fixture only, no runtime behaviour.

---

## Tasks

### Task 1: Alpha

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/a.js`
- Test: `tests/a.test.js`

**Acceptance criteria:**
- [ ] Alpha module exports its function
- [ ] Tests cover alpha

**Contract:**
- shape (code): `function alpha(): string`
- names: `alpha`
- mirror: none
- decisions: none
- sync: none

### Task 2: Beta

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `src/a.js`

**Acceptance criteria:**
- [ ] Beta behaviour is added to the alpha module
- [ ] Existing alpha behaviour is unchanged

**Contract:**
- shape (code): `function beta(): string`
- names: `beta`
- mirror: none
- decisions: none
- sync: none

### Task 3: Gamma

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** build

**Files:**
- Create: `src/c.js`

**Acceptance criteria:**
- [ ] Gamma module imports alpha
- [ ] Build passes

**Contract:**
- shape (code): `function gamma(): string`
- names: `gamma`
- mirror: none
- decisions: none
- sync: `src/c.js` calls `alpha`

### Task 4: Delta

**Complexity:** Complex
**Risk:** Medium
**Depends on:** none
**Verify:** tests

**Files:**
- Create: `src/d.js`

**Acceptance criteria:**
- [ ] Delta module implements its function
- [ ] Tests cover delta

**Contract:**
- shape (code): `function delta(): string`
- names: `delta`
- mirror: none
- decisions: none
- sync: none

---

## Final Shape

Four small modules exist; gamma builds on alpha.

---

## OpenSpec Appendix

Not applicable — no OpenSpec change.
PLAN_EOF
git add plan.md
git commit -q -m "chore: initial"

git checkout -q -b feat/resume

mkdir -p .sdlc/execution

cat > .sdlc/execution/execute-feat-resume-20260101T000000Z.json <<'STATE_EOF'
{
  "version": 1,
  "skill": "execute-plan-sdlc",
  "startedAt": "2026-01-01T00:00:00Z",
  "branch": "feat/resume",
  "planPath": "plan.md",
  "planHash": null,
  "quality": "minimal",
  "totalTasks": 4,
  "plannedTaskIds": ["1", "2", "3", "4"],
  "waves": [
    { "number": 1, "status": "completed", "tasks": [] }
  ],
  "context": {}
}
STATE_EOF
