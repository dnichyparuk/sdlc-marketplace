#!/bin/bash
# Fixture for plan-explore.js --check-brief (R72). Generates one brief variant per
# directory: ok/, skipped/ (brief names dimensions, no dim-*.md), no-ids/, no-dims/.
# No repository is created here: the check reads only the outDir.
set -e

brief() { # <dir> <with-ids: 1|0>
  mkdir -p "$1"
  {
    printf '# Discovery brief\n\n## Dimensions\n\n| Dimension | Purpose |\n|---|---|\n'
    printf '| a-dim | first |\n| `b-dim` | second |\n| c-dim | third |\n\n## Findings\n\n'
    if [ "$2" = 1 ]; then
      printf -- '- F-a-dim-1 first finding\n- F-b-dim-1 second finding\n- F-b-dim-2 third finding\n- F-c-dim-1 fourth finding\n'
    else
      printf -- '- first finding without an id\n'
    fi
  } > "$1/discovery-brief.md"
}

results() {
  for d in a-dim b-dim c-dim; do echo "results for $d" > "$1/dim-$d.md"; done
}

brief ok 1;      results ok
brief skipped 1
brief no-ids 0;  results no-ids

mkdir -p no-dims
printf '# Discovery brief\n\n## Dimensions\n\n| Dimension | Purpose |\n|---|---|\n\n- F-x-1 finding\n' > no-dims/discovery-brief.md
