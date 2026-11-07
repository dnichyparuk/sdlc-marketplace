---
name: ship-sdlc
description: Fixture - a guarded question site and a prohibition line.
---

# Ship

## Step 1: Confirm the target

Use AskUserQuestion to ask which branch to ship from. When `flags.auto === true`, stop with failure and a `pendingQuestion` instead of asking.

## Step 2: Headless runs

Never call AskUserQuestion in a subagent prompt.
