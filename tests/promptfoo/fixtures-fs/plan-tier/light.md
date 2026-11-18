# Tier Fixture Plan

**Goal:** Exercise the lightweight tier bounds check.
**Architecture:** Small modules.
**Source:** conversation context
**Verification:** npm test

---

## Deviations & assumptions

None.

---

## Key Decisions

- **Keep it small:** Fewer files, simpler review.

---

## Tasks

### Task 1: Step 1

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** tests

**Files:**
- Modify: `src/m1.js`

**Description:**
Change module 1.

**Acceptance criteria:**
- [ ] Module 1 works

---

### Task 2: Step 2

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** tests

**Files:**
- Modify: `src/m2.js`

**Description:**
Change module 2.

**Acceptance criteria:**
- [ ] Module 2 works

---
