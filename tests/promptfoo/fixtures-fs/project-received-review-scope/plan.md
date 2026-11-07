# Scope fixture plan

**Goal:** Two tasks whose Files bound the received-review fixes.

---

### Task 1: Guard the input

**Files:**
- Modify: `src/b.js`
- Create: `docs/a.md`
- Modify: `src/a.js:10-20`

### Task 2: Cover the guard

**Files:**
- Modify: `src/a.js`
- Test: `tests/b.test.js`

## Verification

Run the tests.
