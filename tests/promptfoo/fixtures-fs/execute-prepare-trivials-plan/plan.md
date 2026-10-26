# Fixture Trivial Batch Implementation Plan

**Goal:** Provide a plan whose first wave holds two Trivial tasks and one Standard task.
**Architecture:** Four files; Task 4 depends on Task 3.
**Source:** conversation context
**Verification:** npm test

---

## Context

**What problem does this change solve?** The prepare script needs a realistic plan to parse.

**What prompted this change now?** Prepare-script contract cases need a stable fixture.

**What does success look like?** The plan parses into two waves: tasks 1, 2, 3 and task 4.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| None | — | — | — |

---

## Key Decisions

- **Two trivials in one wave:** Tasks 1 and 2 batch; Task 4 is a lone trivial in wave 2.

---

## Security Impact

Not applicable — fixture only, no runtime behaviour.

---

## Tasks

### Task 1: Rename alpha

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `src/a.js`

**Acceptance criteria:**
- [ ] Rename alpha is applied in `src/a.js`

**Contract:**
- shape (code): one edit in `src/a.js`
- names: `src/a.js`
- mirror: none
- decisions: none
- sync: none

### Task 2: Rename beta

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `src/b.js`

**Acceptance criteria:**
- [ ] Rename beta is applied in `src/b.js`

**Contract:**
- shape (code): one edit in `src/b.js`
- names: `src/b.js`
- mirror: none
- decisions: none
- sync: none

### Task 3: Add gamma

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `src/c.js`

**Acceptance criteria:**
- [ ] Add gamma is applied in `src/c.js`

**Contract:**
- shape (code): one edit in `src/c.js`
- names: `src/c.js`
- mirror: none
- decisions: none
- sync: none

### Task 4: Rename delta

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 3
**Verify:** tests

**Files:**
- Modify: `src/d.js`

**Acceptance criteria:**
- [ ] Rename delta is applied in `src/d.js`

**Contract:**
- shape (code): one edit in `src/d.js`
- names: `src/d.js`
- mirror: none
- decisions: none
- sync: none
