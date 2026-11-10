# Fence Divergence Implementation Plan

**Goal:** Test goal — an indented code fence hides a task from one parser but not the other.
**Architecture:** Two tasks; Task 1 holds an indented fence that contains the Task 2 heading.
**Source:** conversation
**Verification:** node test

---

## Deviations & assumptions

| Item | asked | does | why |
|---|---|---|---|
| None | — | — | — |

---

### Task 1: First thing

**Complexity:** Standard
**Risk:** Low
**Depends on:** none
**Verify:** manual

**Files:**
- Modify: `src/foo.js` — update the helper

**Acceptance criteria:**
- [ ] Helper updated

**Contract:**
- shape (code): `function doThing(input: string): string` — returns processed string
- names: `doThing`
- mirror: `src/foo.js`
- decisions: none
- sync: none

  ```markdown
### Task 2: Second thing

**Complexity:** Standard
**Risk:** Low
**Depends on:** Task 1
**Verify:** manual

**Files:**
- Modify: `src/bar.js` — update the other helper

**Acceptance criteria:**
- [ ] Other helper updated

**Contract:**
- shape (code): `function doOther(input: string): string` — returns processed string
- names: `doOther`
- mirror: `src/bar.js`
- decisions: none
- sync: none
  ```
