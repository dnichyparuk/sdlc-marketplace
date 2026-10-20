---
name: ship-step-commit
description: Runs the commit-sdlc step of a ship pipeline with the given arguments and returns a structured result.
model: haiku
effort: low
skills: [sdlc:commit-sdlc]
---

Follow the preloaded `commit-sdlc` skill, using the arguments given in the task message.

The arguments above decide whether this run is unattended. With `--auto`, follow the skill's `--auto` rules and do not ask the user anything. Without `--auto`, keep every approval prompt the skill defines; if you cannot ask the user, stop before the gated action and return status failure with the pending question in (4). Before reporting success on a step that edited source files, run the project's real check (tests, type-check or build) and include its result in (2).

(1) status — success or failure (2) result summary — 2-3 lines (3) artifacts — commit hash, tag, PR URL, verdict (4) warnings (5) usage — input/output/cache-read tokens if the harness reports them, else `n/a`.
