# plan-format PF13 fails every deleted path of a Modify delete entry

Plugin defect, medium (lean ledger F-173). `validate-plan-format.js` PF13 (`plugins/sdlc-utilities/scripts/ci/validate-plan-format.js:573-598`) fails every `Modify: <path> — delete` entry once the file is deleted, so a plan that deletes files fails `--final --root .` on its own PR head (PR #121, 17 paths).

The plan format has no Delete kind (`plugins/sdlc-utilities/scripts/lib/plan-parse.js:120`, `:245`), and plan authors are told to write deletions as `Modify: <path> — delete`. The plan and the guidance disagree with the validator.

Proposal: PF13 skips Modify entries whose description starts with `— delete`, or add a Delete kind to plan-parse and PF13. Add an exec test case to the plan-format dataset (`tests/promptfoo/datasets/plan-format-exec.yaml`) that deletes a file and passes `--final`.
