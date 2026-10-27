# Scripts Directory

Helper scripts for the sdlc-utilities plugin, organized by audience.

## Directory Structure

```
scripts/
  skill/     Invoked by skills via prepare-script to pre-compute context
  ci/        CI validation and maintenance (run in GitHub Actions or locally)
  state/     State persistence CLIs for execute-plan and ship pipelines
  util/      Action utilities (worktree creation, ship init)
  lib/       Shared modules required by scripts above
```

### Naming Conventions

- **skill/** — named after the skill they serve (e.g., `commit.js` for commit-sdlc)
- **ci/** — prefixed with `validate-` for validators, otherwise descriptive
- **state/** — named after the pipeline they persist (e.g., `execute.js`, `ship.js`)
- **util/** — descriptive action names

### CI Scripts (`ci/`)

Besides the `validate-*` validators, `ci/` holds three read-only reporting scripts for the orchestration:

| Script | Purpose |
|--------|---------|
| `session-cost.js` | Prices Claude Code session transcripts per tag from `session-prices.json` (cited pricing page); unpriced tokens are listed, never guessed |
| `session-map.js` | Builds the `session-cost.js --sessions` map from each agent's worktree path and time window (`--agents`, `--events`), reading transcript metadata only up to the first user message; unmatched sessions are listed under `unassigned`, never guessed |
| `wave-metrics.js` | Sums `m*/metrics.json` wave records into the milestone summary table (`--json` for rows as objects) |

## Skill-to-Script Mapping

| Skill | Scripts |
|-------|---------|
| commit-sdlc | `skill/commit.js` |
| jira-sdlc | `skill/jira.js` |
| plan-sdlc | `skill/plan.js` |
| pr-sdlc | `skill/pr.js` |
| received-review-sdlc | `skill/received-review.js` |
| review-sdlc | `skill/review.js` |
| setup-sdlc | `skill/setup.js`, `skill/guardrails.js` |
| version-sdlc | `skill/version.js` |
| execute-plan-sdlc | `skill/execute.js`, `state/execute.js` |
| ship-sdlc | `util/ship-init.js`, `skill/ship.js`, `state/ship.js`, `skill/openspec-step.js` |

## Shared Modules (`lib/`)

| Module | Key Exports | Purpose |
|--------|-------------|---------|
| `config.js` | `readSection`, `writeSection`, `normalizePreset` | Read/write `.sdlc/config.json` sections |
| `dimensions.js` | `validateAll`, `extractFrontmatter` | Review dimension file validation |
| `discovery.js` | `validateAll`, `extractScriptRefs` | Plugin discovery and cross-reference checks |
| `git.js` | `exec`, `checkGitState`, `detectBaseBranch` | Git CLI wrappers |
| `openspec.js` | `detectActiveChanges`, `validateChange` | OpenSpec change detection |
| `output.js` | `writeOutput` | Structured JSON output helpers |
| `state.js` | `readState`, `writeState`, `initState` | Execution state file I/O |
| `stepper.js` | `parseArgs`, `createEnvelope`, `initState`, `transition`, `readState`, `writeState`, `addHistory`, `cleanupState` | Step-emitter protocol utilities (envelope creation, state lifecycle, CLI parsing) |
| `version.js` | `detectVersionFile`, `readVersion`, `computeNextVersions` | Semantic versioning utilities |

## Script Resolution

Skills locate scripts using the injected-path form. The `SessionStart` hook (`hooks/session-start.js`)
emits a stable `sdlc plugin root: <abs>` line into session context on `startup`, `clear`, and `compact`;
skill bodies substitute `<PLUGIN_ROOT>` from that line and invoke scripts directly:

```bash
node "<PLUGIN_ROOT>/scripts/<subdir>/<name>.js"
```

Because the hook that fired IS the active install, its root is the one correct target — no
`find` traversal, cached-version ranking, or dev-CWD fallback guard is needed. (The old
multi-cached-version ambiguity this used to guard against, #258, is dissolved for this reason.)

To let commands like this run without a per-invocation approval prompt, add a rule to
`permissions.allow` in `settings.json` (user-level `~/.claude/settings.json`, project-level
`.claude/settings.json`, or `.claude/settings.local.json`) — a plugin cannot write the user's
settings, so this is a documented recommendation you deploy yourself, never a `SKILL.md`
frontmatter field:

```json
{
  "permissions": {
    "allow": ["Bash(node \"*/scripts/*.js\"*)"]
  }
}
```

Claude Code Bash permission rules support `*` wildcards anywhere in the pattern, so this single
rule matches the literal `node "` prefix, any path down to a `scripts/` directory (covering both
the installed cache path and the `plugins/sdlc-utilities/scripts/...` path used when running
directly from this repository), any `.js` script name, and any trailing arguments.

All scripts use `__dirname`-based resolution for `lib/` imports:

```js
const path = require('node:path');
const LIB = path.join(__dirname, '..', 'lib');
const { readSection } = require(path.join(LIB, 'config'));
```
