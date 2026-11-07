#!/usr/bin/env bash
# Fixture: message files and manifests for commit.js --check-message (G10+, commit R17).
# Writes into the case directory; no git command runs here.
set -euo pipefail

T='Co-Authored-By: Claude Opus <noreply@anthropic.com>'
printf '{"commitConfig":{"requiredTrailers":["%s"],"trailers":[{"key":"Co-Authored-By","value":"Claude Opus <noreply@anthropic.com>"}]}}\n' "${T#Co-Authored-By: }" > manifest.json
printf '{"commitConfig":null}\n' > manifest-null.json
printf '{"commitConfig":{"allowedTypes":["feat"]}}\n' > manifest-no-trailers.json

printf 'feat: x\n\nbody\n\n%s\n' "$T" > ok-lf.txt
printf 'feat: x\r\n\r\nbody\r\n\r\n%s\r\n' "$T" > ok-crlf.txt
printf 'feat: x\n\n%s\nCo-Authored-By: Claude Haiku <noreply@anthropic.com>\n' "$T" > dup-model.txt
printf 'feat: x\n\n%s\nCo-authored-by: Someone <a@b.c>\n' "$T" > dup-lowercase.txt
printf 'feat: x\n\nbody only\n' > missing.txt
