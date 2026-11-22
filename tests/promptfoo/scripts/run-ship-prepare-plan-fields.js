#!/usr/bin/env node
/**
 * run-ship-prepare-plan-fields.js
 * Test wrapper for the ship-prepare plan-field and forwarded-flag cases of datasets/ship-prepare-exec.yaml
 * and datasets/ship-stepper-flows-exec.yaml
 * (R-plan-commit-subject, ship-fix-subject, ship-fix-scope, ship-stage-sdlc, ship-fwd, ship-bump).
 *
 * Each case writes a plan (most in a temp dir that is removed afterwards), runs skill/ship.js or calls one
 * of its exports and prints one JSON line that the case's assertions read. Every case was a `node -e`
 * program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   plan-commit-subject-forwarded: ship-prepare (R-plan-commit-subject): header field forwards --subject to the commit step only
 *   plan-commit-subject-malformed: ship-prepare (R-plan-commit-subject): malformed header field hard-errors with planCommitSubjectInvalid
 *   fix-subject-commit-fixes: ship-fix-subject: (a) a Fix commit field reaches commit-fixes only
 *   fix-subject-malformed: ship-fix-subject: (b) a malformed Fix commit field hard-errors
 *   fix-scope-commit-fixes: ship-fix-scope: (a) the Commit scope reaches commit-fixes without a Fix commit field
 *   plan-commit-subject-unreadable: ship-prepare (R-plan-commit-subject): unreadable plan hard-errors with planCommitSubjectInvalid
 *   plan-commit-subject-after-pattern: ship-prepare (R-plan-commit-subject): --after recompute applies commit.subjectPattern and records nothing on a mismatch
 *   plan-commit-subject-after-bad-config: ship-prepare (R-plan-commit-subject): --after recompute blocks on an unreadable .sdlc/config.json and records nothing
 *   stage-sdlc-paths: ship-stage-sdlc: tracked .sdlc paths of the plan are staged, ignored and missing ones are not
 *   fwd-release-flags: ship-fwd: (a) release flags reach the version args in order
 *   fwd-subject-dollar: ship-fwd: (c) release subject with $ is releaseSubjectInvalid
 *   fwd-subject-pattern: ship-fwd: (d) release subject failing subjectPattern is releaseSubjectInvalid
 *   bump-feat-minor: ship-bump: (a) feat plan gives minor
 *   bump-fix-patch: ship-bump: (b) fix plan gives patch
 *   bump-breaking-major: ship-bump: (c) breaking plan gives major
 *   bump-cli-wins: ship-bump: (d) CLI bump wins
 *   bump-rerun-same: ship-bump: (e) a re-run resolves the same bump
 *   bump-init-no-bump: ship-bump: (f) ship-init without --bump writes no bump and the plan bump applies
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const NAME = 'run-ship-prepare-plan-fields';

function usage(message) {
  process.stderr.write(`${NAME}: ${message}\nusage: node tests/promptfoo/scripts/${NAME}.js --case <name>\n`);
  process.exit(2);
}

// Locate repo root with skill/ship.js.
let repoRoot = null;
let dir = __dirname;
while (dir !== path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js'))) {
    repoRoot = dir;
    break;
  }
  dir = path.dirname(dir);
}
if (!repoRoot) {
  process.stderr.write(`${NAME}: could not find the repo root with skill/ship.js\n`);
  process.exit(1);
}

const SCRIPTS = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts');
const SHIP = path.join(SCRIPTS, 'skill', 'ship.js');
const SHIP_INIT = path.join(SCRIPTS, 'util', 'ship-init.js');
const TASK_SECTION = '\n\n---\n\n### Task 1: A\n';
const DOCS_COMMIT = '**Commit:** `docs(#1): x - y`';
const FEAT_PLAN = `# Plan\n\n**Commit:** \`feat(#1): x - y\`${TASK_SECTION}`;
const RELEASE_SUBJECT = 'chore(#1): release - v1.2.3';

function print(value) {
  console.log(JSON.stringify(value));
}

function cwdPath(...parts) {
  return path.join(process.cwd(), ...parts);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function ship(args, options = {}) {
  return cp.spawnSync('node', [SHIP, ...args], { cwd: process.cwd(), encoding: 'utf8', ...options });
}

// The prepare envelope: ship.js prints the path of its output file.
function readEnvelope(r) {
  return JSON.parse(readText(r.stdout.trim()));
}

// As readEnvelope, from the last stdout line.
function readLastEnvelope(r) {
  return JSON.parse(readText(r.stdout.trim().split('\n').pop()));
}

function statusReport(r) {
  return { status: r.status, out: readEnvelope(r), stderr: r.stderr };
}

function writeSubjectPattern(sdlcDir) {
  fs.mkdirSync(sdlcDir, { recursive: true });
  fs.writeFileSync(path.join(sdlcDir, 'config.json'), JSON.stringify({ commit: { subjectPattern: '^feat' } }));
}

// Runs `body(tmpDir)` in a fresh temp dir named <prefix>*, removes the dir, then prints the result.
function inTempDir(prefix, body) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  let result;
  try {
    result = body(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  print(result);
}

// Writes <tmp>/plan.md holding `planText` and returns `report(ship.js --has-plan --plan <plan> ...extraArgs)`.
function printPlanRun(prefix, planText, report, extraArgs = []) {
  inTempDir(prefix, (tmpDir) => {
    fs.writeFileSync(tmpDir + '/plan.md', planText);
    return report(ship(['--has-plan', '--plan', tmpDir + '/plan.md', ...extraArgs]));
  });
}

// R-plan-commit-subject: `--after confirm_pipeline` against a ledger of a docs plan in a temp dir.
// `writeConfig(tmpDir)` writes the .sdlc/config.json under test; `cwdOf(tmpDir)` names ship.js's working dir.
function printAfterRecompute(writeConfig, cwdOf) {
  inTempDir('ship-after-', (tmpDir) => {
    writeConfig(tmpDir);
    fs.writeFileSync(tmpDir + '/plan.md', `# Plan\n\n${DOCS_COMMIT}${TASK_SECTION}`);
    fs.writeFileSync(tmpDir + '/ledger.json', JSON.stringify({
      version: 1,
      startedAt: '2026-10-27T12:00:00.000Z',
      branch: 'main',
      flags: { planFile: tmpDir + '/plan.md', openspecContext: null, sources: {} },
      steps: [{ name: 'execute', status: 'pending' }, { name: 'commit', status: 'pending' }],
      history: [],
    }));
    fs.writeFileSync(tmpDir + '/yes.json', JSON.stringify({ success: true, output: { answer: 'yes' } }));
    const before = readText(tmpDir + '/ledger.json');
    const r = ship(
      ['--after', 'confirm_pipeline', '--result-file', tmpDir + '/yes.json', '--state', tmpDir + '/ledger.json'],
      { cwd: cwdOf(tmpDir) },
    );
    return { status: r.status, out: readEnvelope(r), unchanged: readText(tmpDir + '/ledger.json') === before };
  });
}

const CASES = {
  'plan-commit-subject-forwarded'() {
    printPlanRun('ship-commit-', `# Plan\n\n${DOCS_COMMIT}${TASK_SECTION}\n**Commit:** subject \`free text\` note\n`, readEnvelope);
  },

  'plan-commit-subject-malformed'() {
    printPlanRun('ship-commit-', `# Plan\n\n**Commit:** \`docs(#1): $(x) - y\`${TASK_SECTION}`, statusReport);
  },

  'fix-subject-commit-fixes'() {
    printPlanRun('ship-commit-', `# Plan\n\n${DOCS_COMMIT}\n**Fix commit:** \`fix(#1): x - review fixes\`${TASK_SECTION}`, readEnvelope);
  },

  'fix-subject-malformed'() {
    printPlanRun('ship-commit-', `# Plan\n\n${DOCS_COMMIT}\n**Fix commit:** bare${TASK_SECTION}`, statusReport);
  },

  'fix-scope-commit-fixes'() {
    printPlanRun('ship-commit-', `# Plan\n\n${DOCS_COMMIT}${TASK_SECTION}`, readEnvelope);
  },

  'plan-commit-subject-unreadable'() {
    if (process.getuid && process.getuid() === 0) {
      print({ skipped: 'root' });
      return;
    }
    const tmpDir = fs.mkdtempSync(os.tmpdir() + '/ship-commit-');
    const plan = tmpDir + '/plan.md';
    let result;
    try {
      fs.writeFileSync(plan, `# Plan\n\n${DOCS_COMMIT}\n`);
      fs.chmodSync(plan, 0);
      result = statusReport(ship(['--has-plan', '--plan', plan]));
    } finally {
      if (fs.existsSync(plan)) fs.chmodSync(plan, 0o644);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    print(result);
  },

  'plan-commit-subject-after-pattern'() {
    printAfterRecompute(() => writeSubjectPattern(cwdPath('.sdlc')), () => process.cwd());
  },

  'plan-commit-subject-after-bad-config'() {
    printAfterRecompute((tmpDir) => {
      fs.mkdirSync(path.join(tmpDir, '.sdlc'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.sdlc', 'config.json'), '{ "commit": ');
    }, (tmpDir) => tmpDir);
  },

  'stage-sdlc-paths'() {
    const { stageCommands } = require(SHIP);
    print([stageCommands('plan.md', process.cwd()), stageCommands('plan-none.md', process.cwd())]);
  },

  'fwd-release-flags'() {
    const r = ship(['--steps', 'version', '--no-tag', '--no-push', '--release-subject', RELEASE_SUBJECT]);
    print({ status: r.status, out: readLastEnvelope(r) });
  },

  'fwd-subject-dollar'() {
    const r = ship(['--has-plan', '--release-subject', 'chore(#1): r$x']);
    print({
      status: r.status,
      out: readLastEnvelope(r),
      stderr: r.stderr,
      ledgers: fs.existsSync('.sdlc/execution') ? fs.readdirSync('.sdlc/execution').filter(f => /^ship-/.test(f)) : [],
    });
  },

  'fwd-subject-pattern'() {
    writeSubjectPattern(cwdPath('.sdlc'));
    const r = ship(['--has-plan', '--release-subject', RELEASE_SUBJECT]);
    print({ status: r.status, out: readLastEnvelope(r), stderr: r.stderr });
  },

  'bump-feat-minor'() {
    printPlanRun('ship-bump-', FEAT_PLAN, readEnvelope);
  },

  'bump-fix-patch'() {
    printPlanRun('ship-bump-', `# Plan\n\n**Commit:** \`fix(#1): x - y\`${TASK_SECTION}`, readEnvelope);
  },

  'bump-breaking-major'() {
    printPlanRun('ship-bump-', `# Plan\n\n**Commit:** \`feat(x)!: y\`${TASK_SECTION}`, readEnvelope);
  },

  'bump-cli-wins'() {
    printPlanRun('ship-bump-', FEAT_PLAN, readEnvelope, ['--bump', 'patch']);
  },

  'bump-rerun-same'() {
    inTempDir('ship-bump-', (tmpDir) => {
      const run = () => readEnvelope(ship(['--has-plan', '--plan', tmpDir + '/plan.md']));
      fs.writeFileSync(tmpDir + '/plan.md', FEAT_PLAN);
      return [run(), run()];
    });
  },

  'bump-init-no-bump'() {
    inTempDir('ship-bump-', (tmpDir) => {
      const sh = (command, args) => cp.spawnSync(command, args, { cwd: tmpDir, encoding: 'utf8' });
      sh('git', ['init', '-q', '-b', 'main']);
      sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'i']);
      sh('git', ['checkout', '-q', '-b', 'feat/x']);
      fs.writeFileSync(tmpDir + '/plan.md', FEAT_PLAN);
      sh('node', [SHIP_INIT, '--auto']);
      return {
        local: JSON.parse(readText(tmpDir + '/.sdlc/local.json')),
        prep: readEnvelope(sh('node', [SHIP, '--has-plan', '--plan', tmpDir + '/plan.md'])),
      };
    });
  },
};

function parseCase(argv) {
  let name = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--case') {
      if (i + 1 >= argv.length) usage('--case needs a value');
      name = argv[++i];
    } else usage(`unknown argument ${argv[i]}`);
  }
  if (name === null) usage('--case is required');
  if (!Object.prototype.hasOwnProperty.call(CASES, name)) usage(`unknown case ${name}`);
  return name;
}

CASES[parseCase(process.argv.slice(2))]();
