---
name: validate-plugin-consistency
description: "Use after modifying any file under plugins/sdlc-utilities/ (skills/*/SKILL.md, scripts/*.js). Runs the consistency validation script to catch structural issues before they reach users: wrong script resolution order, skills missing prepare-script execution, missing --output-file or exit-code handling, missing frontmatter fields, missing user-invocable flags, missing docs/skills/ documentation, missing skills-meta.ts entries, missing README table rows, EXIT traps in skill bash blocks."
user-invocable: true
---

# Validate Plugin Consistency

After modifying the `sdlc-utilities` plugin, run this validation to catch structural
issues that would cause failures in users' repositories.

## When to Use

Invoke this skill when you have modified any of:

- `plugins/sdlc-utilities/skills/*/SKILL.md`
- `plugins/sdlc-utilities/scripts/*.js`

## Step 1 — Run the Validation Script

```bash
node .claude/skills/validate-plugin-consistency/check-consistency.js
```

If the script exits 0: all checks pass — proceed.

If the script exits 1: fix each issue before finishing the task (see Step 2).

If the script exits 2: run from the repository root or pass `--project-root <path>`.

## Step 2 — Fix Issues Found

For each finding, apply the appropriate fix:

### `script-resolution-order` (error)

The `find` pattern searches CWD (`.`) before `~/.claude/plugins`. Reverse the order:

```bash
# Correct (plugins-first)
SCRIPT=$(find ~/.claude/plugins -name "<script>.js" 2>/dev/null | sort -V | tail -1)
[ -z "$SCRIPT" ] && [ -f "plugins/sdlc-utilities/scripts/<script>.js" ] && SCRIPT="plugins/sdlc-utilities/scripts/<script>.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate <script>.js. Is the sdlc plugin installed?" >&2; exit 2; }
```

### `script-resolution-version` (error)

The `find ~/.claude/plugins ... | head -1` pipeline picks an arbitrary cached version
when multiple plugin versions are present in `~/.claude/plugins/cache/sdlc-marketplace/sdlc/`
(filesystem-traversal order, not version order). Replace `| head -1` with
`| sort -V | tail -1` to deterministically select the newest semver. See #258.

```bash
# Correct
SCRIPT=$(find ~/.claude/plugins -name "<script>.js" -path "*/sdlc*/scripts/<script>.js" 2>/dev/null | sort -V | tail -1)
```

### `skill-runs-script` (error)

A skill listed in `SKILL_TO_SCRIPT` (check-consistency.js) whose prepare script exists under
`plugins/sdlc-utilities/scripts/skill/` does not invoke it in a bash block as
`node "<PLUGIN_ROOT>/scripts/skill/<script>.js"`. Skills must run their own prepare scripts;
write the script path inline in the `node` call, not through a variable.

### `skill-uses-output-file` (error)

A skill that invokes its prepare script does not pass `--output-file`. Capture the printed
manifest path:

```bash
MANIFEST_FILE=$(node "<PLUGIN_ROOT>/scripts/skill/<script>.js" --output-file $ARGUMENTS)
EXIT_CODE=$?
```

### `skill-checks-exit-code` (error)

A skill that invokes its prepare script does not capture `EXIT_CODE`. Add after the node call:

```bash
EXIT_CODE=$?
# Exit code 1: show the stderr message to the user and stop.
# Exit code 2: show "Script error — see output above" and stop.
```

### `skill-passes-arguments` (warning)

A skill that invokes its prepare script does not forward `$ARGUMENTS`. Add it to the node call.
`error-report-sdlc`, `harden-sdlc` and `plan-sdlc` pass explicit flags instead and are exempt.

### `frontmatter-field-names` (error)

A skill uses the deprecated `user-invokable` field. Replace with `user-invocable`.

### `user-invocable-flag` (error)

A user-facing skill is missing `user-invocable: true` in its frontmatter. Add it:

```yaml
---
name: <skill-name>
description: "..."
user-invocable: true
---
```

The 10 user-facing skills that must have this flag are: `plan-sdlc`, `execute-plan-sdlc`,
`pr-sdlc`, `review-sdlc`, `received-review-sdlc`,
`commit-sdlc`, `version-sdlc`, `jira-sdlc`, `ship-sdlc`, `setup-sdlc`.

### `docs-skill-existence` (error)

A skill directory exists under `plugins/sdlc-utilities/skills/<name>/` but has no matching
documentation file at `docs/skills/<name>.md`. Create the doc file using `docs/skill-doc-template.md`
as the starting point.

### `skills-meta-existence` (error)

A user-invocable skill has no matching `slug` entry in `site/src/data/skills-meta.ts`. Add an
entry to the `skillsMeta` array with the correct slug, command, category, tagline, pipeline,
and connections. See existing entries for the format.

### `readme-skills-table` (warning)

A user-invocable skill is not listed in the README.md skills table. Add a row following the
format: `| [\`/<name>\`](docs/skills/<name>.md) | description |`

### `no-exit-trap` (error)

A fenced block under `plugins/sdlc-utilities/skills/` declares `trap … EXIT`. Each Bash tool call
is its own shell, so the trap fires when the declaring call ends — before a later call can read the
manifest. Prepare manifests persist under `.sdlc/execution/out/` and are pruned on write and swept
by `ship.js --gc`; delete the `trap` and do not add `rm -f` lines.

## Step 3 — Re-run Validation

After fixing all issues:

```bash
node .claude/skills/validate-plugin-consistency/check-consistency.js
```

Confirm exit 0 before marking work complete.

## Reference: The Correct Skill Pattern (for paired skills)

Every skill that has a matching `*-prepare.js` script must follow this exact pattern:

```bash
# Step 0: Resolve and run the prepare script
SCRIPT=$(find ~/.claude/plugins -name "<name>-prepare.js" 2>/dev/null | sort -V | tail -1)
[ -z "$SCRIPT" ] && [ -f "plugins/sdlc-utilities/scripts/<name>-prepare.js" ] && SCRIPT="plugins/sdlc-utilities/scripts/<name>-prepare.js"
[ -z "$SCRIPT" ] && { echo "ERROR: Could not locate <name>-prepare.js. Is the sdlc plugin installed?" >&2; exit 2; }

CONTEXT_FILE=$(node "$SCRIPT" --output-file $ARGUMENTS --json)
EXIT_CODE=$?
# Cleanup: rm -f "$CONTEXT_FILE" after use

# On non-zero EXIT_CODE:
# Exit code 1: show stderr message to the user and stop.
# Exit code 2: show "Script error — see output above" and stop.

# Step 1: Read and parse CONTEXT_FILE as CONTEXT_JSON, then proceed with skill logic.
```
