# example-skill Specification

> Fixture spec in contract shape.

**Model:** sonnet
**User-invocable:** yes
**Prepare script:** none

## Inputs and flags

- A1: `--dry-run` — print the plan and stop (default: false)

## Gates

- G1: Result present — the step returned a result

## State model

None.

## Step composition

- R1 (issue #123): Runs one step and reports the result
- R2: (removed) Old behaviour.

## Dispatch and routing

None.

## Failure handling and resume

- E1: Step fails → stop and report the error

## Invariants and constraints

- C1: Must not write outside the project root

## Integration

None.
