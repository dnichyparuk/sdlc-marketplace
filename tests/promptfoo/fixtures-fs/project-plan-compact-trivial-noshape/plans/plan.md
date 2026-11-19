# Test Feature Implementation Plan

**Goal:** Add a test feature to validate plan format checking.
**Architecture:** Single trivial edit.
**Source:** conversation context
**Verification:** npm test

---

## Deviations & assumptions

None.

---

## Key Decisions

- **Standalone edit over refactor:** Keeps the scope small.

---

### Task 1: Update usage line

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `README.md` — update usage line

**Description:**
Update the usage line in the README.

**Acceptance criteria:**
- [ ] README usage line updated

**Contract:** update the usage line
