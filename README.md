# sdlc-marketplace

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that automates SDLC tasks: generates structured PR descriptions from commits and diffs, and runs project-customizable multi-dimension code reviews.

**[Documentation & Skill Reference](https://rnagrodzki.github.io/sdlc-marketplace/)** — interactive skill docs, workflow diagrams, and pipeline visualizations.

## Installation

### Via the plugin UI (recommended)

1. Open Claude Code and run `/plugin`
2. Go to **Marketplaces** → **Add marketplace** → enter `rnagrodzki/sdlc-marketplace`
3. Go to **Discover** → select `sdlc` → **Install**

### Via CLI commands

```text
/plugin marketplace add rnagrodzki/sdlc-marketplace
/plugin install sdlc@sdlc-marketplace
```

See [docs/getting-started.md](docs/getting-started.md) for a full first-use walkthrough.

Contributors: run `task hooks:install` (or `lefthook install`) once to enable the pre-push hook that runs the exec test suite; requires `lefthook` and `promptfoo` on PATH.

## Updating

### Via the plugin UI

Open `/plugin`, go to **Marketplaces**, and toggle auto-update for `sdlc-marketplace`. When enabled, Claude Code checks for new versions on startup.

### Via update commands

```text
/plugin marketplace update sdlc-marketplace
/plugin update sdlc@sdlc-marketplace
```

---

## Skills

| Skill | Description |
| --- | --- |
| [`/pr-sdlc`](docs/skills/pr-sdlc.md) | Create a PR with an auto-generated structured description |
| [`/review-sdlc`](docs/skills/review-sdlc.md) | Run multi-dimension code review on the current branch |
| [`/received-review-sdlc`](docs/skills/received-review-sdlc.md) | Process code review feedback with verification, self-critique, configurable per-severity auto-apply, and implementation |
| [`/version-sdlc`](docs/skills/version-sdlc.md) | Bump version, create git tag, optionally generate CHANGELOG, and push |
| [`/commit-sdlc`](docs/skills/commit-sdlc.md) | Analyze staged changes, generate a commit message matching project style, stash unstaged changes, and commit |
| [`/plan-sdlc`](docs/skills/plan-sdlc.md) | Write an implementation plan from requirements, a spec, or a user description — dispatches a parallel dynamic-dimension orchestrator for 4+ file scopes, producing a `discovery-brief.md` with cited findings; annotates OpenSpec tasks.md with per-task back-pointers when `--from-openspec` is active |
| [`/execute-plan-sdlc`](docs/skills/execute-plan-sdlc.md) | Execute an implementation plan with adaptive task classification, wave-based parallel dispatch, and automatic error recovery; flips OpenSpec tasks.md checkboxes in real time as waves complete |
| [`/ship-sdlc`](docs/skills/ship-sdlc.md) | Chain execute, commit, review, version, and PR into a single shipping pipeline with conditional review-fix loop |
| [`/jira-sdlc`](docs/skills/jira-sdlc.md) | Create, edit, search, and transition Jira issues with cached project metadata |
| [`/github-sdlc`](docs/skills/github-sdlc.md) | Create, edit, search, close, link and comment on GitHub issues with cached repository metadata |
| [`/setup-sdlc`](docs/skills/setup-sdlc.md) | Unified project setup — configure version, ship, review, PR templates, plan templates, guardrails, and jira settings in one flow |
| [`/harden-sdlc`](docs/skills/harden-sdlc.md) | After a pipeline failure, analyze hardening surfaces (guardrails, review dimensions, copilot instructions) and propose user-approved edits that would catch the same class of failure earlier next time |
| [`/verify-pipeline-sdlc`](docs/skills/verify-pipeline-sdlc.md) | Analyze a failed CI run on a PR, classify the root cause, and either apply a minimal fix or emit a proposal — invoked by ship-sdlc's verify-pipeline step under --auto |

---

## Documentation

| Document | Description |
| --- | --- |
| [Getting Started](docs/getting-started.md) | Installation, first use, what gets created |
| [Architecture](docs/architecture.md) | Repository structure, plugin system, name resolution |
| [Cost Tiers](docs/cost-tiers.md) | Per-skill/agent model assignments, resolution precedence, and dispatch-site overrides |
| [Plugin Installation](docs/plugin-installation.md) | How plugins are installed, discovered, and resolved at runtime |
| [Adding Skills](docs/adding-skills.md) | Create custom skills for your project |
| [Skill Best Practices](docs/skill-best-practices.md) | Design patterns for reliable, maintainable skills |
| [Adding Commands](docs/adding-commands.md) | Create custom slash commands (legacy — prefer skills) |
| [Adding Hooks](docs/adding-hooks.md) | Set up automated actions on session events |
| [OpenSpec Integration](docs/openspec-integration.md) | Using SDLC skills with OpenSpec for spec-driven development |
| [Plugin Interop](docs/plugin-interop.md) | Authority model for OpenSpec detection when multiple plugins coexist |

## Troubleshooting

### "Plugin not found" when updating via `/plugin` UI

Clear the cache, restart, and reinstall:

```bash
rm -rf ~/.claude/plugins/cache/sdlc-marketplace
```

Then restart Claude Code and run:

```text
/plugin install sdlc@sdlc-marketplace
```

### Plugin not updating after marketplace refresh

The `version` field in `plugin.json` must be bumped for Claude Code to detect a new version. If the version hasn't changed, Claude Code uses the cached copy.

### Auto-update not working

Open `/plugin`, go to the **Marketplaces** tab, and verify auto-update is toggled on for `sdlc-marketplace`. Auto-update is off by default for third-party marketplaces.

### Timeout during marketplace add or plugin install

Large repositories may exceed the default git timeout. Set the environment variable before starting Claude Code:

```bash
export CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS=300000
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[AGPL-3.0](LICENSE)
