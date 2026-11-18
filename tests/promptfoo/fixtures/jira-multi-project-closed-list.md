# Jira Project Context — multi-project config, no branch signal

## Project Config (`.sdlc/config.json`)
```json
{
  "jira": {
    "defaultProject": null,
    "projects": ["FOO", "BAR"]
  }
}
```

## Cache state
- No `--project` argument passed
- Branch name contains no `[A-Z]{2,10}-\d+` pattern
- `jira.defaultProject` is null
- `jira.projects` has 2 entries: `FOO` and `BAR`
- Home-cache scan returns 0 matches for any candidate key (fresh install)

## User Request Context
The user invoked `/jira-sdlc` with no arguments from a branch named `main` (no
ticket ID parseable). Because `jira.projects` is configured with two entries,
the skill must ask the user to pick a project from a closed list containing
exactly those entries — not a free-form prompt.
