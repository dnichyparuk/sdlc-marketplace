#!/usr/bin/env node
/**
 * run-ship-prepare-summary.js
 * Test wrapper for the ship summary, step-text and lean cases of datasets/ship-prepare-exec.yaml
 * (ship-summary-commits, ship-summary-rounds, ship-summary-file, ship-summary-unwritable, ship-final-check,
 * ship-step-text, ship-lean).
 *
 * Each case calls a skill/ship.js export, runs ship.js or run-ship-stepper.js in the fixture working dir
 * (the case's script_cwd), or counts sentences of an agent file, and prints one JSON line that the case's
 * assertions read. Every case was a `node -e` program before; the output is byte-compatible with it.
 *
 * Args:
 *   --case <name>   One of the names below. Usage errors (no --case, an unknown name, an unknown flag)
 *                   exit 2 with a message on stderr and nothing on stdout.
 *
 * Cases (name: description of the case that uses it):
 *   summary-commits-git-error: ship-summary-commits: (b) commitSubject is null on a git error
 *   summary-commits-usage: ship-summary-commits: (c) summary adds every round's usage and lists each round's commit-fixes commit once
 *   summary-rounds-file: ship-summary-rounds: (d) cleanup writes the round findings file with every record
 *   summary-file-equal: ship-summary-file: (a) cleanup writes ship-summary-<slug>.json equal to the cleanup summary
 *   summary-unwritable-dir: ship-summary-unwritable: (b) a directory at the summary path leaves the cleanup envelope unchanged
 *   final-check-summary: ship-final-check: (e) the Step 6 summary carries the ledger finalCheck, null without one
 *   step-text-no-attribution: ship-step-text: (R-subagent-brief) both in-ship agents carry the no-attribution-line sentence once
 *   step-text-commit-waits: ship-step-text: (R97) commit agent waits for its drafter
 *   lean-testing-file: ship-lean: (pr testing) a the execute summary is passed to pr as --testing-file
 *   lean-no-testing-file: ship-lean: (pr testing) b an execute result without a summary adds no --testing-file
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const NAME = 'run-ship-prepare-summary';

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

const SHIP = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js');
const STEPPER = path.join(repoRoot, 'tests', 'promptfoo', 'scripts', 'run-ship-stepper.js');
const AGENTS = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'agents');

function print(value) {
  console.log(JSON.stringify(value));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function git(args) {
  return cp.execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

function readAgent(name) {
  return readText(path.join(AGENTS, `${name}.md`));
}

// run-ship-stepper rounds-final-check: two auto review rounds walked to cleanup; returns its JSON line.
function walkTwoRounds() {
  const projectRoot = process.cwd();
  const r = cp.spawnSync('node', [
    STEPPER, '--project-root', projectRoot, '--scenario', 'rounds-final-check', '--seed', 'frozen',
    '--summary', 'high-1-findings.json', '--rounds', '2', '--received-result', 'results/received-review-counts.json', '--walk',
  ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 1 << 26 });
  return JSON.parse(r.stdout);
}

function executionFile(name) {
  return path.join(process.cwd(), '.sdlc', 'execution', name);
}

// ship-lean: seeds a ledger whose execute, commit, review and version steps are done and whose last history
// entry is a dispatch_execute success with `executeData`, then answers confirm_pipeline (and confirm_pr when
// it follows) with results/yes.json. Returns the last envelope and the ledger path.
function advanceToPr(executeData) {
  const cwd = process.cwd();
  const ledger = JSON.parse(readText(path.join(cwd, 'seed', 'ledger-frozen.json')));
  ledger.steps.forEach((s) => {
    if (['execute', 'commit', 'review', 'version'].includes(s.name)) s.status = 'completed';
    if (['received-review', 'commit-fixes'].includes(s.name)) s.status = 'skipped';
  });
  ledger.history = [{ step: 'dispatch_execute', result: 'success', data: executeData, timestamp: '2026-10-19T12:00:00.000Z' }];
  fs.mkdirSync(path.join(cwd, '.sdlc', 'execution'), { recursive: true });
  const statePath = path.join(cwd, '.sdlc', 'execution', 'ship-feat-ship-20261019T120000Z.json');
  fs.writeFileSync(statePath, JSON.stringify(ledger, null, 2));
  const after = (stepId, resultFile) => {
    const r = cp.spawnSync('node', [SHIP, '--after', stepId, '--result-file', path.join(cwd, 'results', resultFile), '--state', statePath], { cwd, encoding: 'utf8' });
    return JSON.parse(readText(r.stdout.trim()));
  };
  let envelope = after('confirm_pipeline', 'yes.json');
  if (envelope.step && envelope.step.id === 'confirm_pr') envelope = after('confirm_pr', 'yes.json');
  return { envelope, statePath };
}

const CASES = {
  'summary-commits-git-error'() {
    const ship = require(SHIP);
    print({
      bad: ship.commitSubject('0000000', process.cwd()),
      nonsha: ship.commitSubject('not-a-sha', process.cwd()),
      head: ship.commitSubject(git(['rev-parse', 'HEAD']), process.cwd()),
      want: git(['log', '-1', '--format=%s']),
    });
  },

  'summary-commits-usage'() {
    const ship = require(SHIP);
    const withUsage = (n) => ({ usage: { inputTokens: n, outputTokens: n / 2, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    const fixCommit = (sha) => ({ step: 'dispatch_commit_fixes', result: 'success', data: { artifacts: { commit: sha } } });
    print(ship.buildSummary({
      branch: 'feat/ship',
      steps: [{ name: 'review', status: 'completed', ...withUsage(100) }],
      rounds: [{ round: 1, review: withUsage(10), receivedReview: withUsage(10), commitFixes: withUsage(10) }],
      history: [fixCommit('aaaaaaa'), fixCommit('bbbbbbb'), fixCommit('bbbbbbb')],
    }));
  },

  'summary-rounds-file'() {
    const o = walkTwoRounds();
    print({ o, file: JSON.parse(readText(executionFile('review-rounds-feat-ship.json'))) });
  },

  'summary-file-equal'() {
    const o = walkTwoRounds();
    print({ o, file: JSON.parse(readText(executionFile('ship-summary-feat-ship.json'))) });
  },

  'summary-unwritable-dir'() {
    const summaryPath = executionFile('ship-summary-feat-ship.json');
    fs.mkdirSync(summaryPath, { recursive: true });
    const o = walkTwoRounds();
    fs.rmSync(summaryPath, { recursive: true, force: true });
    print({ o });
  },

  'final-check-summary'() {
    const ship = require(SHIP);
    const finalCheck = { base: 'aaaaaaa', commit: 'bbbbbbb', status: 'completed', verdict: 'APPROVED' };
    print([
      ship.buildSummary({ branch: 'feat/ship', steps: [], history: [], finalCheck }).finalCheck,
      ship.buildSummary({ branch: 'feat/ship', steps: [], history: [] }).finalCheck,
    ]);
  },

  'step-text-no-attribution'() {
    const sentence = 'Add no attribution line of your own';
    print({ commit: countOf(readAgent('ship-step-commit'), sentence), version: countOf(readAgent('ship-step-version'), sentence) });
  },

  'step-text-commit-waits'() {
    const text = readAgent('ship-step-commit');
    print({
      wait: countOf(text, 'never end your turn while the commit-orchestrator'),
      commit: countOf(text, 'Run `git commit` with the drafted message'),
    });
  },

  'lean-testing-file'() {
    const { envelope, statePath } = advanceToPr({ summary: '25/25 exec cases passed' });
    const args = (envelope.step && envelope.step.data && envelope.step.data.args) || '';
    const m = args.match(/--testing-file "([^"]+)/);
    print({ env: envelope, file: m ? readText(m[1]) : null, stateDir: path.dirname(statePath) });
  },

  'lean-no-testing-file'() {
    const { envelope } = advanceToPr({});
    print({ env: envelope });
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
