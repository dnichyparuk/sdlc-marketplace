#!/bin/bash
# Fixture for tests/promptfoo/scripts/run-fixture-memo.js (fixture-memo cases a and c, and case e: FIXTURE_MEMO_FAIL forces a failure). No git.
# Every build writes a new random build-id, so copies of one memoised build share one id.
# aged.txt has a 2020-01-01 mtime and link-rel is a relative symlink to it: a copy keeps both.
set -e
if [ -n "${FIXTURE_MEMO_FAIL+x}" ]; then echo "fixture-memo-probe: forced failure" >&2; exit 3; fi
od -An -N8 -tx1 /dev/urandom | tr -d ' \n' > build-id
echo aged > aged.txt
touch -t 202001011200 aged.txt
ln -s aged.txt link-rel
