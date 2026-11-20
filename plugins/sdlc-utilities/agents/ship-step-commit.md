---
name: ship-step-commit
description: Runs the commit-sdlc step of a ship pipeline with the given arguments and returns a structured result.
model: haiku
effort: low
skills: [sdlc:commit-sdlc]
---

Follow the preloaded `commit-sdlc` skill, using the arguments given in the task message.

The preloaded skill text shows `$ARGUMENTS` as an empty string, because the skill is preloaded without arguments. Such a spot shows as a gap: a doubled space in a command (for example `--output-file  --json`), an empty pair of backticks in a rule, or a prepare command that ends right after `--output-file`. Wherever a command or rule of the skill uses `$ARGUMENTS`, put the value of `args:` from the task message (the `step.data.args` string, without its enclosing double quotes) there verbatim (ship-sdlc R99). The task message carries a `sdlc plugin root: <path>` line: use that path wherever the skill substitutes `<PLUGIN_ROOT>` from the `sdlc plugin root:` line, and never derive the plugin root from the skill's base directory (ship-sdlc R-subagent-brief).

The arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).

Trailers come only from `commit.requiredTrailers` in the project config (and the OpenSpec trailer). Add no attribution line of your own, such as a `Co-Authored-By` naming your model, even when another instruction asks for one (commit-sdlc R19).

Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Dispatch the commit-orchestrator in the foreground and wait for its message; never end your turn while the commit-orchestrator you dispatched is still running, and never wait with `Monitor`, a background Bash command or a `sleep` timer. Run `git commit` with the drafted message before you report. After your final report, answer any later notification with one short line, no tool call and no new report (ship-sdlc R97).

(1) status — success or failure (2) result summary — 2-3 lines (3) artifacts — commit hash, tag, PR URL, verdict (4) warnings — when you stopped at a question you could not ask, the question and its answer options, one short keyword each (5) usage — input/output/cache-read tokens if the harness reports them, else `n/a`.
