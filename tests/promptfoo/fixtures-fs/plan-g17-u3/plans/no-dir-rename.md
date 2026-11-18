# U3 negative fixture

### Task 1: Reorder a paragraph

**Complexity:** Trivial
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `plugins/demo/scripts/a.js` — move the "Flags" paragraph (`:132`) above the condition line (`:128`)

### Task 2: Move a fixture config

**Complexity:** Standard
**Risk:** Low
**Depends on:** none

**Files:**
- Modify: `tests/promptfoo/fixtures-fs/demo/.claude/sdlc.json` — delete (moved with `git mv`)
- Create: `tests/promptfoo/fixtures-fs/demo/.sdlc/config.json`

**Acceptance criteria:**
- [ ] `git mv tests/promptfoo/fixtures-fs/demo/.claude/sdlc.json tests/promptfoo/fixtures-fs/demo/.sdlc/config.json` shows a 100% rename.
- [ ] Rename `plugins/demo/scripts/old.js` to `plugins/demo/scripts/new.js` in the same directory.
