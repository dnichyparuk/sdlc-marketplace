# Ship Pipeline — Entry-Mode Handlers

On-demand companion for `ship-sdlc/SKILL.md` (implements R-progressive-disclosure). These handlers short-circuit the pipeline — they run instead of the normal `ship it` flow. Read this file only when the corresponding flag is passed; never preemptively.

## --init-config handler (R16, R-quick-7)

If `--init-config` was passed:

**Redirect:** Suggest running `/setup-sdlc` instead for unified configuration. If user insists on `--init-config`, proceed with the existing walkthrough.

1. Read `./config-format.md` and run the interactive walkthrough to collect the user's answers (steps multi-select, bump type, auto, threshold).
   After the `steps[]` selection, offer the optional `--quick` profile prompt (R-quick-7):
   > "Would you like to define a `--quick` profile? Select steps that form your shortened pipeline, or skip to omit."
   If the user selects steps, capture them. If the user skips, omit the `--quick` flag when calling `ship-init.js`.
2. Locate and call `ship-init.js` via Bash with the collected answers (append `--quick <csv>` only when the user made a quick-profile selection):
```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
node "<PLUGIN_ROOT>/scripts/util/ship-init.js" --output-file --steps execute,commit,review,archive-openspec,pr --bump patch --auto --threshold high
```
   Run this as one plain Bash call. Take the output path the command prints on stdout as `INIT_OUTPUT_FILE`, and the command's exit code from the tool result as `EXIT_CODE` (a tool result without an error is exit code 0). Use the literal path in every later step.
3. Check `EXIT_CODE` first, then parse the output JSON from `$INIT_OUTPUT_FILE`:
   - If `EXIT_CODE` is non-zero: exit code 1 → display the `errors` array from the JSON and stop; exit code 2 → show the script error message (stderr) and stop. Do not proceed to confirmation.
   - If `EXIT_CODE` is 0 but `errors` is non-empty, display them and stop.
   - Otherwise display the `created` files list and `config` JSON for user confirmation.
4. Stop. No pipeline execution.

## --gc handler (R39, issue #223)

If `--gc` (with optional `--ttl-days <N>`) was passed, run `skill/ship.js --gc` and stop — no pipeline composition. The prepare script short-circuits: it scans `<main-worktree>/.sdlc/execution/` for stale ship- and execute- state files (older than TTL AND whose branch is no longer in `git branch --list`), removes them, and emits a JSON report.

```bash
# Substitute <PLUGIN_ROOT> from the `sdlc plugin root:` context line. Do not run `find`.
node "<PLUGIN_ROOT>/scripts/skill/ship.js" --output-file --gc  # add --ttl-days <N> when provided
```

Run this as one plain Bash call; it prints the path of its output file. Read the prepare output from that path. The top-level `action` field will be `"gc"`; the `report` field contains `{ttlDays, ship: {deleted, kept}, execute: {deleted, kept}}`.

Print one line per file:
```
[deleted] ship-deletedbranch-20240101T000000Z.json — stale+branch-gone
[kept]    ship-main-20260505T120000Z.json — ttl-fresh
```

Then stop. Do not proceed to step 1b. The pipeline does not run.

## Dry-run mode (R15, R59)

If `--dry-run`, display the full pipeline table and stop:
```
Ship Pipeline (dry run)
────────────────────────────────────────────────────────────────
Step  Skill                 Status       Args              Pause?
────────────────────────────────────────────────────────────────
1     execute-plan-sdlc     will run     (none)             no
2     commit-sdlc           will run     --auto            no
3     review-sdlc           will run     --committed       no
4     received-review-sdlc  conditional  (if crit/high)    YES
5     commit-sdlc (fixes)   conditional  --auto            no
6     version-sdlc          skipped      —                 —
7     pr-sdlc               will run     --auto --draft    no
────────────────────────────────────────────────────────────────
Review threshold: critical or high findings trigger fix loop
Interactive pauses: received-review (if triggered)
```
