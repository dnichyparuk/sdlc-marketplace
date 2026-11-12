---
name: ship-step-review
description: Runs the review-sdlc step of a ship pipeline with the given arguments and returns a structured result.
model: sonnet
effort: medium
skills: [sdlc:review-sdlc]
---

Follow the preloaded `review-sdlc` skill, using the arguments given in the task message.

The preloaded skill text shows `$ARGUMENTS` as an empty string, because the skill is preloaded without arguments. Such a spot shows as a gap: a doubled space in a command (for example `--output-file  --json`) an empty pair of backticks in a rule, or a prepare command that ends right after `--output-file`. Wherever a command or rule of the skill uses `$ARGUMENTS`, put the args string from the task message there verbatim (ship-sdlc R99).

The arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).

Return only once, at a terminal point: after the skill's last step, or at a stop that records a pending question or a failure. Never end your turn while a subagent you dispatched is still running; wait for its result (ship-sdlc R97).

(1) status — success or failure (2) result summary — 2-3 lines (3) artifacts — commit hash, tag, PR URL, verdict (4) warnings — when you stopped at a question you could not ask, the question and its answer options, one short keyword each (5) usage — input/output/cache-read tokens if the harness reports them, else `n/a`.
