#!/usr/bin/env node
/**
 * run-stop-plan-integrity.js
 * Test wrapper for stop-plan-integrity.js hook.
 * Constructs the stdin JSON with the correct transcript_path (absolute,
 * computed from script_cwd at runtime) and invokes the hook, capturing
 * stdout/stderr/exitCode.
 *
 * Args:
 *   --project-root <path>  Working directory (fixture, git-init'd)
 *   --transcript-file <name>  Filename of transcript in the project-root
 *                             (omit to test "no transcript" case)
 *   --fix-planfile-path       Rewrite planFilePath in the state file to use
 *                             the actual project-root (handles copied fixtures)
 *   --readonly-state-dir      chmod the fixture's .sdlc/execution dir 0555 around
 *                             the hook run (an undeletable marker), 0755 after
 *
 * Outputs JSON { stdout, stderr, exitCode } for promptfoo assertions.
 */

'use strict';

const path   = require('path');
const fs     = require('fs');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let projectRoot   = process.cwd();
let transcriptFile = null;
let fixPlanfilePath = false;
let branchOverride = null; // passed as SDLC_BRANCH_OVERRIDE to the hook
let reportStateFiles = false; // when true, append stateFiles[] to output JSON
let readonlyStateDir = false; // when true, chmod the fixture state dir read-only around the hook run

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) {
    projectRoot = path.resolve(args[++i]);
  } else if (args[i] === '--transcript-file' && args[i + 1]) {
    transcriptFile = args[++i];
  } else if (args[i] === '--fix-planfile-path') {
    fixPlanfilePath = true;
  } else if (args[i] === '--branch' && args[i + 1]) {
    branchOverride = args[++i];
  } else if (args[i] === '--report-state-files') {
    reportStateFiles = true;
  } else if (args[i] === '--readonly-state-dir') {
    readonlyStateDir = true;
  }
}

// Auto-detect branch from the fixture's plan state files when --branch is not given.
// Looks for plan-<slug>-*.json in .sdlc/execution/ and extracts the slug.
if (!branchOverride) {
  const stateDir = path.join(projectRoot, '.sdlc', 'execution');
  try {
    const entries = fs.readdirSync(stateDir).filter(f => /^plan-[a-z0-9-]+-\d{8}T/.test(f));
    if (entries.length > 0) {
      // Extract slug from the first matching file: plan-<slug>-<ts>.json
      const match = entries[0].match(/^plan-([a-z0-9-]+)-\d{8}T/);
      if (match) branchOverride = match[1];
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Locate hook script
// ---------------------------------------------------------------------------

let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/hooks/stop-plan-integrity.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}

if (!repoRoot) {
  console.log(JSON.stringify({ error: 'stop-plan-integrity.js not found' }));
  process.exit(1);
}

const hookScript = path.join(repoRoot, 'plugins/sdlc-utilities/hooks/stop-plan-integrity.js');

// ---------------------------------------------------------------------------
// Optional: rewrite planFilePath in state file to use actual project-root
// (needed because fixtures are copied to a temp dir, breaking embedded abs paths)
// ---------------------------------------------------------------------------

if (fixPlanfilePath) {
  const stateDir = path.join(projectRoot, '.sdlc', 'execution');
  if (fs.existsSync(stateDir)) {
    const entries = fs.readdirSync(stateDir).filter(f => f.startsWith('plan-') && f.endsWith('.json'));
    for (const entry of entries) {
      const fp = path.join(stateDir, entry);
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const data = JSON.parse(raw);
        if (typeof data.planFilePath === 'string') {
          // Replace anything before the filename with the actual projectRoot
          const basename = path.basename(data.planFilePath);
          data.planFilePath = path.join(projectRoot, basename);
          fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
        }
      } catch (_) {}
    }
  }
}

// ---------------------------------------------------------------------------
// Construct stdin payload
// ---------------------------------------------------------------------------

const payload = {};
if (transcriptFile) {
  payload.transcript_path = path.join(projectRoot, transcriptFile);
}

const stdinData = JSON.stringify(payload);

// ---------------------------------------------------------------------------
// Invoke hook
// ---------------------------------------------------------------------------

// Build env: inherit process env, inject test-harness overrides.
// SDLC_BRANCH_OVERRIDE: lets the hook call slugifyBranch without a .git repo.
// SDLC_STATE_DIR_OVERRIDE: points state.js at the fixture's .sdlc/execution/ dir.
const spawnEnv = { ...process.env };
if (branchOverride) spawnEnv.SDLC_BRANCH_OVERRIDE = branchOverride;
const fixtureStateDir = path.join(projectRoot, '.sdlc', 'execution');
if (fs.existsSync(fixtureStateDir)) {
  spawnEnv.SDLC_STATE_DIR_OVERRIDE = fixtureStateDir;
}

if (readonlyStateDir && fs.existsSync(fixtureStateDir)) fs.chmodSync(fixtureStateDir, 0o555);
const result = spawnSync('node', [hookScript], {
  input: stdinData,
  cwd: projectRoot,
  env: spawnEnv,
  encoding: 'utf8',
  timeout: 10_000,
});
if (readonlyStateDir && fs.existsSync(fixtureStateDir)) fs.chmodSync(fixtureStateDir, 0o755);

const output = {
  stdout: result.stdout || '',
  stderr: result.stderr || '',
  exitCode: result.status ?? -1,
};

// --report-state-files: list .sdlc/execution/ contents after the hook ran.
// Enables assertions about file deletion (consume-then-delete contract).
if (reportStateFiles) {
  try {
    const stateDir = path.join(projectRoot, '.sdlc', 'execution');
    output.stateFiles = fs.existsSync(stateDir) ? fs.readdirSync(stateDir) : [];
  } catch (_) {
    output.stateFiles = [];
  }
}

console.log(JSON.stringify(output));
