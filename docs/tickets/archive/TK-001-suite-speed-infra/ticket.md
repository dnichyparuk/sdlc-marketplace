---
id: TK-001
type: task
title: Suite speed infrastructure (#9425)
created: 2026-11-19
resolution: done
closed: 2026-11-19
by: [2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#1, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#2, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#3, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#4, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#5, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#6, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#7, 2026-11-19-w-h2-suite-speed-infrastructure-pre-push-tier#8]
---

# TK-001: Suite speed infrastructure (#9425)

## Why

#9425 [suite-C] speed infrastructure (audit W4, 6 tasks, 2 Complex): memoised fixture build per run, drop wasted project_root, in-process github gh stub, C16 loop; parallel runs SUPPORTED (safe at -j N: per-case temp cwd, no shared writes, an owner -j 4 trial run) but the DEFAULT stays one thread (-j 1 in config maxConcurrency, docs, Taskfile, pre-push and CI) | src: audit; owner 2026-11-18 "paralel runs should be supported, but by default suite is to be executed in one thread"

## What

Memoised fixture build per run, drop the wasted project_root, an in-process gh stub for the github cases and the C16 loop. Parallel runs are supported; the default stays one thread.

## Acceptance

- A1: each fixture is built once per run and the github cases use an in-process gh stub.
- A2: an owner trial run at -j 4 passes, while maxConcurrency, the docs, the Taskfile, the pre-push hook and CI keep -j 1 as the default.
  - Trial result (2026-11-21, one run by an agent the owner delegated): `promptfooconfig-exec.yaml` 1529/1529 passed (8 min 8 s) and `promptfooconfig-exec-hooks.yaml` 179/179 passed (36 s), command `npx --yes promptfoo@0.123.1 eval -c <config> -j 4 --no-cache`.

## Notes

Moved from .sdlc/orchestration/todos.md (#9425) by wave L (#9461), 2026-11-19. Acceptance drafted by the planner; the owner approves it at the merge of the planning PR.

## Files in this ticket

<one line per attachment; attachment folders: evidence/, spike/, notes/>
