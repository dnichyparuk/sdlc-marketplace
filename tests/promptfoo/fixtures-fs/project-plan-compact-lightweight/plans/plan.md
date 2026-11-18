# Compact Lightweight Fixture Implementation Plan

**Commit:** `docs(#1): fixture - compact lightweight plan`
**Goal:** Prove compact Trivial blocks keep the full format.
**Ticket:** TK-001 @deadbeef
**Architecture:** Three small tasks.
**Source:** docs/x.md#U-1
**Verification:** manual

---

## Context

**What problem does this change solve?** The usage doc names a flag that was renamed.

**What prompted this change now?** A reader followed the doc and the flag was rejected.

**What does success look like?** The doc names the new flag and the helper behaves as documented.

---

## Research Findings

The helper and the usage doc are small; only the flag name and one helper return value are stale.

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| None | no | — | — |

---

## Key Decisions

- **Compact blocks for Trivial tasks:** One-line edits do not need a multi-line Contract.

---

## Contract Examples

**Contract:**
- shape (code): `function helper(input: string): string` — returns the trimmed input
- names: `helper`
- mirror: `src/helper.js`
- decisions: none
- sync: none

---

## Tasks

### Task 1: Fix the helper

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual
**Ticket:** TK-001 @deadbeef

**Files:**
- Modify: `src/helper.js` — trim the input

**Notes:** The helper returned the input untrimmed.

**Acceptance criteria:**
- [ ] `helper` returns the trimmed input

**Contract:**
- shape (code): `function helper(input: string): string` — returns the trimmed input
- names: `helper`
- mirror: `src/helper.js`
- decisions: none
- sync: none

---

### Task 2: Fix the usage line

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual
**Ticket:** TK-001 @deadbeef

**Files:**
- Modify: `docs/usage.md` — fix the flag name

**Notes:** The flag was renamed; only this line kept the old name.

**Acceptance criteria:**
- [ ] `docs/usage.md` names `--lightweight`

**Contract:** shape (docs): one-line edit in Usage; names: `--lightweight`; sync: none

---

### Task 3: Fix the README link

**Complexity:** Trivial
**Risk:** Low
**Depends on:** Task 2
**Verify:** manual
**Ticket:** TK-001 @deadbeef

**Files:**
- Modify: `README.md` — fix the usage link

**Notes:** The link pointed at the old doc path.

**Acceptance criteria:**
- [ ] `README.md` links `docs/usage.md`

**Contract:** shape (docs): one-line edit of the usage link; names: `docs/usage.md`; sync: none

---

## Final Shape

The helper trims its input, and the usage doc and README name the current flag and path.

---

## Verification Scorecard

Not applicable — lightweight plan

---

## OpenSpec Appendix

Not applicable — no OpenSpec change.
