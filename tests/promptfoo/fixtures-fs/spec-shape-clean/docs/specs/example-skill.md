# example-skill Specification

> Fixture spec in contract shape.

**User-invocable:** yes
**Prepare script:** none

## Inputs and flags

- A1: `--dry-run` — print the plan and stop (default: false)

## State model

None.

## Step composition

- R1: Runs one step and reports the result

## Dispatch and routing

None.

## Gates

- G1: Result present — the step returned a result

## Failure handling and resume

- E1: Step fails → stop and report the error

## Invariants and constraints

- C1: Must not write outside the project root

## Integration

None.
