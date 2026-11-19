# Script-runner provider errors EISDIR on the plan-splice filter

Plugin test-tooling defect (lean ledger F-169). During lean-w40 review round 2 the promptfoo script-runner provider errored EISDIR on `--filter-pattern "^plan-splice:"` in `tests/promptfoo/promptfooconfig-exec.yaml`, so a new exit-2 path was only checked by hand. It did not recur later.

Proposal: find the case or fixture that makes the provider read a directory as a file, and fix it.
