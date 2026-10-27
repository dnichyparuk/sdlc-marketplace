# edge-skill Specification

> Fixture spec in contract shape with edge cases.

**User-invocable:** yes
**Prepare script:** none

## Inputs and flags

- A1: `--dry-run` — print the plan and stop (default: false)

## State model

None.

## Step composition

- R1: Runs one step and reports the result
- R1: Defined a second time

## Dispatch and routing

None.

## Gates

- G1: Result present — the step returned a result

## Gates

None.

## Failure handling and resume

- E1: Step fails → stop and report the error

## Invariants and constraints

- C1: Must not write outside the project root

## Appendix — history 

### Issue trail

| R1 | (Fixes #12.) |

### Withdrawn

- R5 — withdrawn in 0.21.0 (see CHANGELOG 0.21.0): gone.
