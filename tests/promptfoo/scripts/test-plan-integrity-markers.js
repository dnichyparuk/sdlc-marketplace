#!/usr/bin/env node
/**
 * test-plan-integrity-markers.js
 * Multi-step test: exercises plan.js --output-file and --mark CLI modes
 * to verify planIntegrity marker writes (R20, issue #285).
 *
 * Steps:
 *   1. Run plan.js --output-file → should create .sdlc/execution/plan-*.json
 *      with planIntegrity.skillInvoked populated.
 *   2. Run plan.js --mark plan-file --path /tmp/fake-plan.md → state file gains
 *      planIntegrity.planFile + planFilePath.
 *   3. Run plan.js --mark guardrailsEvaluated → state gains that key, preserves earlier.
 *   4. Run plan.js --mark critiqueRan → all four markers present.
 *   5. Read state file, validate all fields, print JSON result for promptfoo assertions.
 *
 * Args:
 *   --project-root <path>  Working directory (a git-init'd fixture)
 *   --repo-root    <path>  Repo root (to find plan.js)
 *
 * Outputs: JSON { skillInvoked, planFile, guardrailsEvaluated, critiqueRan,
 *                 planFilePath, allPresent, stateFileCreated }
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let repoRoot    = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) {
    projectRoot = path.resolve(args[++i]);
  } else if (args[i] === '--repo-root' && args[i + 1]) {
    repoRoot = path.resolve(args[++i]);
  }
}

// Auto-discover repo root (walk up to find scripts/skill/plan.js)
if (!repoRoot) {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'plugins/sdlc-utilities/scripts/skill/plan.js'))) {
      repoRoot = dir;
      break;
    }
    dir = path.dirname(dir);
  }
}

if (!repoRoot) {
  console.log(JSON.stringify({ error: 'could not locate repo root (plan.js not found)' }));
  process.exit(1);
}

const planScript = path.join(repoRoot, 'plugins/sdlc-utilities/scripts/skill/plan.js');

// ---------------------------------------------------------------------------
// Helper: run plan.js with given args, returns { stdout, stderr, status }
// ---------------------------------------------------------------------------

function runPlan(extraArgs) {
  const result = spawnSync('node', [planScript, ...extraArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 15_000,
    env: Object.assign({}, process.env, { SDLC_SKIP_CONFIG_CHECK: '1' }),
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

// ---------------------------------------------------------------------------
// Helper: find the latest plan-*.json state file
// ---------------------------------------------------------------------------

function findPlanStateFile() {
  const stateDir = path.join(projectRoot, '.sdlc', 'execution');
  if (!fs.existsSync(stateDir)) return null;

  const entries = fs.readdirSync(stateDir)
    .filter(f => f.startsWith('plan-') && f.endsWith('.json'))
    .map(f => {
      const fp = path.join(stateDir, f);
      try {
        return { name: f, fullPath: fp, mtime: fs.statSync(fp).mtimeMs };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  return entries.length > 0 ? entries[0] : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const fakePlanPath = path.join(projectRoot, 'fake-plan.md');
// Create a fake plan file so planFilePath stat can succeed in hook tests
try {
  fs.writeFileSync(fakePlanPath, '# Test Plan\n\nSome content.\n', 'utf8');
} catch (_) {}

// Step 1: --output-file
const step1 = runPlan(['--output-file']);

// Check state file was created
const afterStep1 = findPlanStateFile();
if (!afterStep1) {
  console.log(JSON.stringify({
    error: 'no plan state file created after --output-file',
    step1_stderr: step1.stderr,
    step1_status: step1.status,
  }));
  process.exit(0);
}

// Step 2: --mark plan-file
const step2 = runPlan(['--mark', 'plan-file', '--path', fakePlanPath]);

// Step 3: --mark guardrailsEvaluated
const step3 = runPlan(['--mark', 'guardrailsEvaluated']);

// Step 4: --mark critiqueRan
const step4 = runPlan(['--mark', 'critiqueRan']);

// Read final state
const final = findPlanStateFile();
let stateData = {};
try {
  stateData = JSON.parse(fs.readFileSync(final.fullPath, 'utf8'));
} catch (e) {
  console.log(JSON.stringify({ error: `failed to read state file: ${e.message}` }));
  process.exit(0);
}

const pi = stateData.planIntegrity || {};

// Idempotency: a second --output-file run leaves exactly one plan state file,
// and it records the second run's critiqueDir, not the first one's.
const firstCritiqueDir = stateData.critiqueDir;
runPlan(['--output-file']);
const stateDir = path.join(projectRoot, '.sdlc', 'execution');
const planFiles = fs.readdirSync(stateDir).filter(f => f.startsWith('plan-') && f.endsWith('.json'));
let secondCritiqueDir = null;
try {
  secondCritiqueDir = JSON.parse(fs.readFileSync(path.join(stateDir, planFiles[0]), 'utf8')).critiqueDir;
} catch (_) {}
const rePrepareSingleMarker = planFiles.length === 1
  && typeof secondCritiqueDir === 'string'
  && secondCritiqueDir !== firstCritiqueDir;

const result = {
  stateFileCreated: true,
  skillInvoked:          typeof pi.skillInvoked === 'string',
  planFile:              typeof pi.planFile === 'string',
  guardrailsEvaluated:   typeof pi.guardrailsEvaluated === 'string',
  critiqueRan:           typeof pi.critiqueRan === 'string',
  planFilePathSet:       stateData.planFilePath === fakePlanPath,
  planFilePath:          stateData.planFilePath || null,
  critiqueDirRecorded:   typeof stateData.critiqueDir === 'string' && path.basename(stateData.critiqueDir).startsWith('sdlc-plan-critique-'),
  rePrepareSingleMarker,
  allPresent: !!(pi.skillInvoked && pi.planFile && pi.guardrailsEvaluated && pi.critiqueRan),
  step1_status: step1.status,
  step2_status: step2.status,
  step3_status: step3.status,
  step4_status: step4.status,
};

console.log(JSON.stringify(result, null, 2));
