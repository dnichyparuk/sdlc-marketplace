const fs = require('fs');
const os = require('os');
const path = require('path');

// afterAll extension hook (exec configs only): removes the per-case fixture copies
// that scripts/extract-skill-content.js recorded in globalThis.__sdlcFixtureCopies.
async function afterAll() {
  let removed = 0;
  for (const p of globalThis.__sdlcFixtureCopies ?? []) {
    // Delete only our own copies: directly under os.tmpdir(), named promptfoo-fixture-*.
    if (path.dirname(p) !== os.tmpdir() || !path.basename(p).startsWith('promptfoo-fixture-')) continue;
    try {
      await fs.promises.rm(p, { recursive: true, force: true });
      removed++;
    } catch (err) {
      // never throw: a failing hook fails the whole eval; log so a leaked copy leaves a trace
      console.error(`fixture-copies-cleanup: failed to remove ${p}: ${err.message}`);
    }
  }
  console.error(`fixture-copies-cleanup: removed ${removed}`);
}

module.exports = { afterAll };
