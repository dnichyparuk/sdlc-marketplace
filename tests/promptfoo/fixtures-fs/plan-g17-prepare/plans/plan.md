# G17 Fixture Plan

**Goal:** Exercise g17-prepare coverage criteria.
**Architecture:** Three tasks touching infra, db and src paths.
**Source:** conversation context
**Verification:** npm test

---

### Task 1: Add infrastructure

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Create: `infra/terraform/main.tf`

---

### Task 2: Add migrations

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Create: `db/migrations/001.sql`
- Create: `db/migrations/002.sql`

---

### Task 3: Update sources

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `src/a.ts`
- Modify: `src/b.js`
