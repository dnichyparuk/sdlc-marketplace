#!/usr/bin/env node
/**
 * run-review-manifest-split.js
 * Test harness for the manifest division contract (R-manifest-index-slices, issue #447).
 *
 * Exercises writeDimensionSlices + toIndexEntry from review.js against a SYNTHESIZED
 * "large changeset": N dimensions, each carrying a sizable `body` string and a large
 * `matched_files` array. The amplification lives here (not in fixtures) so the test is a
 * true large-changeset case without bloating committed fixture files.
 *
 * It proves the thin index does NOT scale with content:
 *   - the index (JSON.stringify(dims.map(toIndexEntry))) excludes body/matched_files/commit_log
 *     and stays small, while
 *   - each per-dimension slice file carries the heavy body/matched_files.
 *
 * Usage:
 *   node run-review-manifest-split.js [--project-root <path>]
 *
 * Output (JSON to stdout):
 *   { index_bytes, index_has_body, index_has_matched_files, index_has_commit_log,
 *     slice_count, slice_has_body, slice_has_matched_files }
 *
 * Notes:
 *   - Imports the REAL writeDimensionSlices + toIndexEntry from review.js to avoid drift.
 *   - Writes slices into an OS temp dir; does not touch the project root.
 */

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const REPO_ROOT  = path.resolve(__dirname, '..', '..', '..');
const reviewPath = path.join(REPO_ROOT, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'review.js');

const { writeDimensionSlices, toIndexEntry } = require(reviewPath);

// --- Synthesize a large changeset ---------------------------------------------------------
// Each dimension gets a large body (~4 KB) and many matched files so the cumulative heavy
// content far exceeds any reasonable thin-index size.
const DIM_COUNT       = 8;
const BODY_SIZE       = 4096;   // bytes of body per dimension
const FILES_PER_DIM   = 120;    // matched files per dimension

function makeDim(i) {
  const matched = Array.from({ length: FILES_PER_DIM }, (_, j) => `src/module-${i}/deeply/nested/path/file-${j}.ts`);
  return {
    name:               `dimension-${i}`,
    description:         `Synthetic dimension ${i} for manifest-split test`,
    severity:           'high',
    model:              'sonnet',
    effort:             i === 0 ? 'low' : undefined,
    status:             'ACTIVE',
    requires_full_diff: false,
    truncated:          false,
    matched_count:      matched.length,
    diff_file:          `/tmp/sdlc-review-XXXXX/dimension-${i}.diff`,
    slice_file:         null,
    body:               'X'.repeat(BODY_SIZE),
    matched_files:      matched,
    file_context:       matched.map(f => ({ file: f, commits: [{ hash: 'abc1234', subject: 'feat: synthetic commit' }] })),
    warnings:           [],
  };
}

const dims  = Array.from({ length: DIM_COUNT }, (_, i) => makeDim(i));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-review-split-'));

// Write per-dimension slice files (mutates dim.slice_file).
writeDimensionSlices(dims, tmpDir);

// Project to the thin index and stringify (what the orchestrator would read).
const indexJson  = JSON.stringify(dims.map(toIndexEntry));
const indexBytes = Buffer.byteLength(indexJson, 'utf8');

const index = dims.map(toIndexEntry);
const index_effort_dim0 = index[0].effort;
const index_effort_dim1 = index[1].effort;

const index_has_body          = /"body"/.test(indexJson);
const index_has_matched_files = /"matched_files"/.test(indexJson);
const index_has_commit_log    = /"commit_log"/.test(indexJson);

// Read back one slice file and confirm it carries the heavy fields.
const sliceRaw = fs.readFileSync(dims[0].slice_file, 'utf8');
const slice    = JSON.parse(sliceRaw);
const slice_has_body          = typeof slice.body === 'string' && slice.body.length > 0;
const slice_has_matched_files = Array.isArray(slice.matched_files) && slice.matched_files.length > 0;

process.stdout.write(JSON.stringify({
  index_bytes:             indexBytes,
  index_has_body,
  index_has_matched_files,
  index_has_commit_log,
  index_effort_dim0,
  index_effort_dim1,
  slice_count:             dims.length,
  slice_has_body,
  slice_has_matched_files,
}) + '\n');
