#!/bin/bash
# Fixture guard (#9161): never git init/config inside an existing work tree.
if git rev-parse --show-toplevel >/dev/null 2>&1; then echo "refusing: inside a git work tree" >&2; exit 1; fi
git init -q
git config user.email "test@test.com"
git config user.name "Test"
git add -A
git commit -q -m "init"

# Modify all 25 files with 15-20 line additions each
for f in src/module-*.js; do
  cat >> "$f" << 'ADDITIONS'

function enhancedProcess(input, options) {
  const defaults = { threshold: 10, maxRetries: 3, timeout: 5000 };
  const config = { ...defaults, ...options };

  if (config.threshold < 0) {
    throw new Error('Threshold must be non-negative');
  }

  const results = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] > config.threshold) {
      results.push({
        value: input[i],
        processed: true,
        timestamp: Date.now(),
      });
    }
  }

  return { results, totalProcessed: results.length, config };
}
ADDITIONS
  # Also add a unique export line per file to make diffs distinct
  echo "module.exports.enhancedProcess = enhancedProcess;" >> "$f"
done

git add -A
