#!/usr/bin/env node
/**
 * run-ship-stepper.js
 * Test wrapper for the ship.js step emitter (P-STEP-1..4, P-TRANS-1).
 *
 * Runs one or more skill/ship.js calls (the initial call and/or `--after` calls)
 * against the project-ship-stepper fixture and prints exactly one JSON line so
 * every assertion is a `javascript` check over it. A wrapper is needed because
 * most scenarios chain several calls (the `--state` of a call is the
 * `state_file` of the previous envelope) and assert the persisted ledger.
 *
 * Args:
 *   --project-root <p>   Fixture working dir (copied to tmp by the harness)
 *   --scenario <name>    initial | initial-dry-run | initial-resume-legacy |
 *                        legacy-twice | after-confirm | edit-cancel |
 *                        after-commit-ok | after-commit-fail | after-cleanup |
 *                        after-version-no-tag | after-bad-result |
 *                        step-list-equal | branch-migrate | resumed-completed |
 *                        emit-in-progress | review-gate-rows | ttl-days |
 *                        worktree-mismatch | after-execute | plan-no-tasks | after-commit-fail-gc |
 *                        rebase-emit | inline-fail-<step-with-dashes> | forced-cleanup |
 *                        after-stage | tier | exec-state | confirm-pr | resume-twice | auto-walk | pending | handoff | after-pr |
 *                        openspec | resume-plan | resume-plan-auto | resume-plan-quick |
 *                        stale-plan | other-worktree-plan | finished-plan | rebase-conflict |
 *                        rerun-version-moved | rerun-version-same | rerun-execute-finished | rerun-execute-clean | after-received-review-changes | stage-outside-files |
 *                        rounds-2-fixes | rounds-2-no-fixes | rounds-1-default | rounds-final-check | rounds-self-commit |
 *                        guard-received-open | guard-earlier-open | guard-release-ahead | guard-release-ahead-resume
 *                        guard-received-open: received-review in_progress, answered with --result (R100, R82)
 *                        guard-earlier-open: received-review in_progress, commit-fixes done; --after stage_fixes walks to version (R101)
 *                        guard-release-ahead: dispatch_version, then release commit R and commit F, then --after dispatch_version
 *                        with artifacts.commit = R (R102a); -resume: the same commits, then two re-emissions (R102b)
 *   --plan <path>      Plan passed to initial calls only (never to --after, L8)
 *   --steps <csv>        Appended to every initial call as `--steps <csv>`
 *   --no-plan            Initial calls pass --has-plan without --plan (ship-sdlc/SKILL.md always passes --has-plan)
 *   --result <rel>       Result file (relative to project-root) for the scenario's --after call
 *   --seed <name>        legacy | frozen | frozen-dryrun | frozen-branch | frozen-resumed | frozen-exec | frozen-pending | none
 *                        (copies seed/ledger-<name>.json to .sdlc/execution/ship-<slug>-<ts>.json)
 *   --exec-seed <name>   complete | missing | noplanned | midwave | none
 *                        (copies seed/execute-<name>.json to .sdlc/execution/execute-feat-ship-<ts>.json)
 *   --exec-cleanup       (after-execute) runs `state/execute.js verify-completeness --branch feat/ship` and then
 *                        `state/execute.js cleanup --branch feat/ship` in the fixture after seeding, as execute's Step 5f and R14 do
 *   --answer <a>         yes | edit | cancel | skip — answer file used for confirm_pipeline/review_gate/confirm_*
 *   --answer-text <w>    Writes results/answer-text.json with answer <w> and uses it as --answer (one word; script_args split on spaces)
 *   --quality <q>        Patch data.flags.quality into the seed
 *   --again              Rerun `--after confirm_pipeline` (yes) at the end of the scenario
 *   --commit             (pending) seed commit in_progress
 *   --late-exec          (handoff) copy the execute seed after the first call
 *   --auto-seed          Patch data.flags.auto = true into the seed (any scenario)
 *   --with-state         (rerun-execute-*) copy seed/execute-complete.json as the branch's execute state file after the first emission
 *   --version-failed    (rerun-version-*) mark the version entry failed after the first emission
 *   --dirty-before       (rerun-execute-*) write pre-existing.txt before the first call, so the tree is dirty at dispatch
 *   --drop-dispatch-tree (rerun-execute-*) delete the execute entry's dispatchTree from the ledger after the first call
 *   --exec-failed        (rerun-execute-*) mark the execute entry failed after the first emission
 *   --clean-tree       (after-received-review-changes) commit everything but .sdlc/ first, so the tree is clean; otherwise a fix.txt change is written
 *   --plan-files <csv>   (stage-outside-files) commit a plan whose Task 1 Files are these paths
 *   --write <csv>        (stage-outside-files) create these files, untracked
 *   --edit-plan          (stage-outside-files) leave plan.md modified and uncommitted
 *   --fixes              (stage-outside-files) reach stage_fixes (after received-review) instead of stage_changes
 *   --resume-after-fix   (stage-outside-files) after the stop: delete every --write path not in --plan-files, then
 *                        --after confirm_pipeline (yes); with --again also --after stage_changes (generic-ok) and
 *                        --after confirm_pipeline (yes) once more
 *   --untrack-plan       (stage-outside-files) untrack plan.md (git rm --cached + commit) before the --after call
 *   --ignore-sdlc        (after-pr) write .sdlc/.gitignore holding `*` before the first call
 *   --rounds <n>         (rounds-*) patch data.flags.reviewRounds = n into the seed; absent: the seed has no reviewRounds
 *                        rounds-*: auto seed; each round answers dispatch_review, review_gate, received-review (rounds-2-no-fixes:
 *                        clean tree; otherwise it appends to fix.txt, stages and commits it) until the next step is not dispatch_review;
 *                        --summary is rewritten before each later round
 *                        rounds-final-check: as rounds-2-fixes, every dispatch_review answered with results/review-approved.json;
 *                        with --again the final-check review result is reported once more (a snapshot follows each)
 *                        rounds-self-commit: clean tree; received-review appends to fix.txt and commits it itself (R97);
 *                        a snapshot follows its --after call and headAfter is the fixture HEAD after that commit
 *   --self-commit-outside <p>  (rounds-self-commit) the received-review commit also adds <p>, outside the plan Files (R103)
 *   --fix-subject        (rounds-self-commit) the plan header carries **Fix commit:** `fix(#1): widget - review fixes` (R103)

 *   --cli-flags <k=v,...>  (R105) seeds CLI-sourced flags into the ledger: value and sources entry (bump=minor,draft=true,rebase=auto)
 *   --resume-after-outside  (rounds-self-commit, with --self-commit-outside) seeds execute and commit completed; after the
 *                        stop: --after confirm_pipeline (yes), then a commit that deletes <p>, then --after confirm_pipeline
 *                        (yes) again (a snapshot follows each)
 *   --no-tag             Patch data.flags.noTag = true into the seed (any scenario)
 *   --version-head       A successful dispatch_version result without artifacts.commit gets the fixture repo's HEAD sha
 *   --other-exec         Also copy seed/execute-complete.json to a second branch's execute state file (es2)
 *   --walk               (handoff) walk the remaining steps to cleanup
 *   --summary <name>     review-gate: copy fixtures-fs/review-summaries/<name> to the main
 *                        worktree's .sdlc/execution/review-summary-feat-ship.json before the scenario runs
 *   --final-summary <n>  (rounds-*, walk) when the emitted dispatch_review has --committed --base, write review-summaries/<n>
 *                        (default approved-0.json) instead of --summary; review-summaries/<n minus .json>.comment.md,
 *                        when present, is copied beside it and set as its commentCopyPath
 *   --review-threshold <t>  Patch data.flags.reviewThreshold = t into the seed (any scenario)
 *   --summary-stale      review-gate: the summary predates the review step's startedAt (treated as missing)
 *   --in-worktree        review-gate: run ship.js from a linked worktree of the fixture repo
 *   --summary-comment    with --summary: write <projectRoot>/review-comment.md and point the copied summary's commentPath at it
 *   --gh-pr-number <n>   with --gh-pr-url: the number the stub `gh pr view` reports (default 1)
 *   --gh-pr-url <url>    stub `gh pr view` reports an OPEN PR with this url (default: `gh pr view` fails)
 *   --os-change <n>      (openspec) change name written to flags.openspecChange (default: add-auth)
 *   --os-tasks <d>/<t>   (openspec) tasks.md gets <d> done and <t>-<d> open task lines (default: 1/3)
 *   --os-validate ok|fail  (openspec) stub `openspec validate` exits 0 or 1 (default: ok)
 *   --os-archived        (openspec) write the change under openspec/changes/archive/2026-01-01-<n>/
 *   --os-verify          (openspec) also make verify-openspec runnable
 *   --os-answer abort|result  (openspec) answer archive_openspec with results/os-abort.json or results/os-result.json
 *   --os-resume          (openspec) after the abort: --after confirm_pipeline (yes), then walk to the next archive_openspec
 *   --scope-asked        (stage-outside-files, with --fixes) first received-review call returns results/received-review-scope.json (keep/revert question)
 *   --scope-result <rel>  (with --scope-asked) the canned received-review result to return first
 *   --write-after <csv>  (stage-outside-files) paths written after the scope stop, before the second received-review call
 *
 * A successful dispatch_commit / dispatch_commit_fixes result without artifacts.commit gets the fixture
 * repo's HEAD sha injected (W4.6: ship.js cross-checks the reported commit against HEAD).
 *
 * Output JSON (one line):
 *   { scenario, calls: [{ args, exitCode, envelope, stateFlags }], snapshots, headAfter, releaseSha, ledger, ledgerExists, ledgerFiles, execFiles, execPreGate, otherFiles,
 *     summarySidecars, commandScripts, stopCapExists, mdPrompts: { incomplete, allDone }, seedUnchanged }
 *   seedUnchanged = true when the seeded ledger file is byte-identical at the end; null when no seed was written
 *   ledger = { stepStatuses, history, stepReasons, currentStep, flagsKeys, flags, paused, stepResults, finalCheck } | null
 *   history entry = { step, result, source, completenessGate }; execPreGate = { verifyExit, cleanupExit } | null
 *   mdPrompts = the two "> OpenSpec change" prompt lines of ship-sdlc/openspec-steps.md, without the leading "> "
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
let projectRoot = process.cwd();
let scenario = 'initial';
let plan = null;
let stepsCsv = null;
let noPlan = false;
let seedPath = null;
let seedBytes = null;
let resultRel = null;
let seed = 'none';
let answer = 'yes';
let execSeed = 'none';
let quality = null;
let summaryRel = null;
let finalSummaryRel = 'approved-0.json';
let reviewThreshold = null;
let osChange = 'add-auth';
let osTasks = '1/3';
let osValidate = 'ok';
let osAnswer = null;
let answerText = null;
let selfCommitOutside = null;
let fcResume = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-root' && args[i + 1]) projectRoot = path.resolve(args[++i]);
  else if (args[i] === '--scenario' && args[i + 1]) scenario = args[++i];
  else if (args[i] === '--plan' && args[i + 1]) plan = args[++i];
  else if (args[i] === '--result' && args[i + 1]) resultRel = args[++i];
  else if (args[i] === '--seed' && args[i + 1]) seed = args[++i];
  else if (args[i] === '--answer' && args[i + 1]) answer = args[++i];
  else if (args[i] === '--exec-seed' && args[i + 1]) execSeed = args[++i];
  else if (args[i] === '--quality' && args[i + 1]) quality = args[++i];
  else if (args[i] === '--summary' && args[i + 1]) summaryRel = args[++i];
  else if (args[i] === '--final-summary' && args[i + 1]) finalSummaryRel = args[++i];
  else if (args[i] === '--review-threshold' && args[i + 1]) reviewThreshold = args[++i];
  else if (args[i] === '--os-change' && args[i + 1]) osChange = args[++i];
  else if (args[i] === '--os-tasks' && args[i + 1]) osTasks = args[++i];
  else if (args[i] === '--os-validate' && args[i + 1]) osValidate = args[++i];
  else if (args[i] === '--os-answer' && args[i + 1]) osAnswer = args[++i];
  else if (args[i] === '--steps' && args[i + 1]) stepsCsv = args[++i];
  else if (args[i] === '--answer-text' && args[i + 1]) answerText = args[++i];
  else if (args[i] === '--self-commit-outside' && args[i + 1]) selfCommitOutside = args[++i];
  else if (args[i] === '--fc-resume' && args[i + 1]) fcResume = args[++i];
  else if (args[i] === '--no-plan') noPlan = true;
}
if (answerText !== null) {
  fs.mkdirSync(path.join(projectRoot, 'results'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'results', 'answer-text.json'), JSON.stringify({ success: true, output: { answer: answerText, summary: 'free-text answer' } }));
  answer = 'answer-text';
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
  console.log(JSON.stringify({ error: 'Could not find repo root with skill/ship.js' }));
  process.exit(0);
}

const shipScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'skill', 'ship.js');
const execDir = path.join(projectRoot, '.sdlc', 'execution');
const SEED_TS = '20261019T120000Z';

// Stub `gh` so the initial call's auth preflight passes offline.
const stubDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ship-stepper-gh-'));
fs.writeFileSync(path.join(stubDir, 'gh'), '#!/bin/sh\nif [ "$1" = "pr" ] && [ "$2" = "view" ]; then\n  if [ -n "$STUB_PR_URL" ]; then echo "{\\"number\\":${STUB_PR_NUMBER:-1},\\"title\\":\\"fixture\\",\\"url\\":\\"$STUB_PR_URL\\",\\"state\\":\\"OPEN\\",\\"labels\\":[]}"; exit 0; fi\n  exit 1\nfi\nif [ "$1" = "repo" ] && [ "$2" = "view" ] && [ -n "$STUB_PR_URL" ]; then echo "{\\"owner\\":{\\"login\\":\\"fixture\\"},\\"name\\":\\"fixture\\"}"; exit 0; fi\necho "Logged in to github.com account fixture"\nexit 0\n', { mode: 0o755 });
const ghPrIdx = args.indexOf('--gh-pr-url');
const ghPrNumIdx = args.indexOf('--gh-pr-number');
// --git-status-fail: a git shim whose `status` fails while the flag file exists (set around the received-review call).
const gitStatusFail = args.includes('--git-status-fail');
const statusFailFlag = path.join(stubDir, 'fail-status');
if (gitStatusFail) {
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(stubDir, 'git'), `#!/bin/sh\nif [ "$1" = "status" ] && [ -e "$STUB_GIT_STATUS_FAIL" ]; then echo "fatal: stub git status failure" >&2; exit 128; fi\nexec ${realGit} "$@"\n`, { mode: 0o755 });
}
const env = { ...process.env, ...(gitStatusFail ? { STUB_GIT_STATUS_FAIL: statusFailFlag } : {}), PATH: stubDir + path.delimiter + (process.env.PATH || ''), ...(ghPrIdx >= 0 ? { STUB_PR_URL: args[ghPrIdx + 1] } : {}), ...(ghPrNumIdx >= 0 ? { STUB_PR_NUMBER: args[ghPrNumIdx + 1] } : {}) };
delete env.SDLC_STATE_DIR_OVERRIDE;

const calls = [];
let statePath = null;
let runCwd = projectRoot;

function sh(cmd) {
  return spawnSync('sh', ['-c', cmd], { cwd: projectRoot, env, encoding: 'utf8', timeout: 8000 });
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function ledgerFiles() {
  try { return fs.readdirSync(execDir).filter(f => /^ship-.*\.json$/.test(f)).sort(); } catch (_) { return []; }
}

function ship(shipArgs) {
  const res = spawnSync('node', [shipScript, ...shipArgs], { cwd: runCwd, env, encoding: 'utf8', timeout: 8000 });
  const out = (res.stdout || '').trim();
  let envelope = null;
  if (out && !out.includes('\n') && fs.existsSync(out)) envelope = readJson(out);
  if (envelope && envelope.state_file) statePath = envelope.state_file;
  const ledger = envelope && envelope.state_file ? readJson(envelope.state_file) : null;
  calls.push({
    args: shipArgs,
    exitCode: res.status ?? -1,
    envelope: envelope || { raw: out, stderr: (res.stderr || '').trim() },
    stateFlags: ledger ? ledger.flags : null,
  });
  return envelope || {};
}

function initial(extra = []) {
  const planArgs = noPlan ? ['--has-plan'] : plan ? ['--has-plan', '--plan', path.resolve(projectRoot, plan)] : [];
  const stepArgs = stepsCsv ? ['--steps', stepsCsv] : [];
  return ship([...planArgs, ...stepArgs, ...extra]);
}

// W4.6: a successful commit result reports the fixture repo's HEAD sha (not deterministic, so injected here).
function withHeadSha(file) {
  const r = readJson(file);
  if (!r || r.success !== true) return file;
  r.output = r.output || {};
  r.output.artifacts = r.output.artifacts || {};
  if (r.output.artifacts.commit) return file;
  r.output.artifacts.commit = sh('git rev-parse HEAD').stdout.trim();
  const out = path.join(stubDir, 'with-sha-' + path.basename(file));
  fs.writeFileSync(out, JSON.stringify(r));
  return out;
}

function after(id, rel) {
  let file = path.join(projectRoot, rel);
  if (id === 'dispatch_commit' || id === 'dispatch_commit_fixes' || (id === 'dispatch_version' && process.argv.includes('--version-head'))) file = withHeadSha(file);
  return ship(['--after', id, '--result-file', file, '--state', statePath || '']);
}

// R83: rewrite plan.md so Task 1 lists the given paths under Files, and commit it (a clean plan file is not "outside").
function setPlanFiles(paths, { fixSubject = null } = {}) {
  if (!paths.length) return;
  const files = paths.map(p => `- Modify: \`${p}\``).join('\n');
  const header = fixSubject ? `**Fix commit:** \`${fixSubject}\`\n\n` : '';
  fs.writeFileSync(path.join(projectRoot, 'plan.md'), `# Add widget support\n\n${header}## Tasks\n\n### Task 1: Add the widget module\n\n**Files:**\n${files}\n\n### Task 2: Wire the widget into the CLI\n`);
  sh('git add plan.md && git commit -q -m "fixture: plan files"');
}

function seedLedger(name, patch) {
  if (name === 'frozen-branch') sh('git checkout -q main');
  const data = readJson(path.join(projectRoot, 'seed', `ledger-${name}.json`));
  if (patch) patch(data);
  fs.mkdirSync(execDir, { recursive: true });
  statePath = path.join(execDir, `ship-${data.branch.replace(/[^a-zA-Z0-9-]/g, '-')}-${SEED_TS}.json`);
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
  seedPath = statePath;
  seedBytes = JSON.stringify(data, null, 2);
}

// Ledger facts after one call (rerun-version-* scenarios).
const snapshots = [];
let headAfter = null;
let releaseSha = null; // guard-release-ahead*: the release commit R (R102)
function snap() {
  const d = readJson(statePath) || {};
  return {
    version: (d.steps || []).find(s => s.name === 'version') || null,
    execute: (d.steps || []).find(s => s.name === 'execute') || null,
    pausedAt: d.paused ? d.paused.at : null,
    paused: d.paused !== undefined,
    historyLength: (d.history || []).length,
    round: d.round === undefined ? null : d.round,
    rounds: d.rounds === undefined ? null : d.rounds,
    approvedScope: d.approvedScope === undefined ? null : d.approvedScope,
    finalCheck: d.finalCheck === undefined ? null : d.finalCheck,
    stepStatuses: Object.fromEntries((d.steps || []).map(s => [s.name, s.status])),
  };
}

function clearLedgers() {
  for (const f of ledgerFiles()) fs.unlinkSync(path.join(execDir, f));
}

// Answer each emitted step with yes.json (decisions) or generic-ok.json until done
// (or, with stopAt, until that step is emitted, left unanswered).
function walk(env0, stopAt = null, max = 12) {
  let envelope = env0;
  for (let i = 0; i < max && envelope && envelope.status === 'step'; i++) {
    const id = envelope.step.id;
    if (id === stopAt) break;
    // R95: review-sdlc leaves a summary for the final check (--final-summary, default approved-0.json).
    if (id === 'dispatch_review' && /--committed --base /.test((envelope.step.data && envelope.step.data.invocation) || '')) writeSummary(true);
    const decision = id === 'confirm_pipeline' || id === 'review_gate' || id.startsWith('confirm_');
    envelope = after(id, id === 'execute_tier' ? 'results/tier-balanced.json' : decision ? `results/${answer}.json` : 'results/generic-ok.json');
  }
}

// R84: one review round from `--after dispatch_review` to the step after it ends. With fixLine, received-review
// appends it to fix.txt; stage_fixes' commands run and commit-fixes commits (a snapshot follows its --after call).
// selfCommit (R97): received-review commits fix.txt itself (a snapshot follows its --after call).
function reviewRound(fixLine, { reviewResult = 'results/generic-ok.json', selfCommit = false } = {}) {
  const is = (c, id) => c.status === 'step' && c.step.id === id;
  let c = after('dispatch_review', reviewResult);
  if (is(c, 'review_gate')) c = after('review_gate', 'results/yes.json');
  if (!is(c, 'dispatch_received_review')) return c;
  if (fixLine) fs.appendFileSync(path.join(projectRoot, 'fix.txt'), fixLine);
  if (selfCommit) {
    const extra = selfCommitOutside ? (fs.mkdirSync(path.dirname(path.join(projectRoot, selfCommitOutside)), { recursive: true }), fs.writeFileSync(path.join(projectRoot, selfCommitOutside), 'x\n'), ` ${selfCommitOutside}`) : '';
    sh(`git add fix.txt${extra} && git commit -q -m "fixture: received-review commits its fixes"`);
    headAfter = sh('git rev-parse HEAD').stdout.trim();
  }
  if (gitStatusFail) fs.writeFileSync(statusFailFlag, '');
  c = after('dispatch_received_review', 'results/generic-ok.json');
  fs.rmSync(statusFailFlag, { force: true });
  if (selfCommit) snapshots.push(snap());
  if (is(c, 'stage_fixes')) {
    for (const cmd of c.step.data.commands) sh(cmd); // the main context runs them
    c = after('stage_fixes', 'results/generic-ok.json');
  }
  if (is(c, 'dispatch_commit_fixes')) {
    sh('git commit -q -m "fixture: review fixes"');
    c = after('dispatch_commit_fixes', 'results/generic-ok.json');
    snapshots.push(snap());
  }
  return c;
}

if (seed !== 'none' && !['initial', 'initial-dry-run', 'step-list-equal', 'ttl-days'].includes(scenario)) {
  const result = resultRel ? readJson(path.join(projectRoot, resultRel)) : null;
  seedLedger(seed, (data) => {
    if (quality) data.flags.quality = quality;
    if (scenario === 'pending' && process.argv.includes('--commit')) { const e = data.steps.find(x => x.name === 'commit'); if (e) e.status = 'in_progress'; }
    if (process.argv.includes('--auto-seed')) data.flags.auto = true; // any scenario (v3, eh6)
    const roundsIdx = process.argv.indexOf('--rounds');
    if (roundsIdx >= 0) data.flags.reviewRounds = Number(process.argv[roundsIdx + 1]);
    if (scenario.startsWith('rounds-')) data.flags.auto = true;
    if (reviewThreshold) data.flags.reviewThreshold = reviewThreshold;
    if (process.argv.includes('--no-push')) data.flags.noPush = true; // A16 (learnings c)
    // R105: --cli-flags bump=minor,draft=true,rebase=auto seeds CLI-sourced flags (value and sources entry).
    const cliFlagsIdx = process.argv.indexOf('--cli-flags');
    if (cliFlagsIdx >= 0) {
      data.flags.sources = data.flags.sources || {};
      for (const pair of process.argv[cliFlagsIdx + 1].split(',')) {
        const [k, v] = pair.split('=');
        data.flags[k] = v === 'true' ? true : v;
        data.flags.sources[k] = 'cli';
      }
    }
    if (process.argv.includes('--no-tag')) {
      data.flags.noTag = true; // A15: the ledger records an untagged release
      // verify_version_tag emits its command only after branch_prepare succeeded; seed that so an empty list is the noTag rule's doing.
      data.history = [...(data.history || []), { step: 'branch_prepare', result: 'success' }];
    }
    if (scenario === 'handoff' && process.argv.includes('--walk')) { data.flags.steps = ['execute']; for (const s of data.steps) if (s.name !== 'execute' && s.status === 'pending') s.status = 'skipped'; }
    if (scenario === 'emit-in-progress') data.flags.auto = true;
    if (scenario === 'confirm-pr') {
      for (const nm of ['verify-pipeline', 'await-remote-review']) {
        if (!data.flags.steps.includes(nm)) data.flags.steps.push(nm);
        const x = data.steps.find(s => s.name === nm); if (x) { x.status = 'pending'; delete x.reason; } else data.steps.push({ name: nm, status: 'pending' });
      }
      for (const nm of ['execute', 'commit', 'review', 'version']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
    }
    if (scenario === 'resume-twice') { const e = data.steps.find(x => x.name === 'execute'); if (e) e.status = 'completed'; }
    if (scenario === 'openspec') {
      data.flags.openspecChange = osChange;
      const runnable = ['archive-openspec', ...(process.argv.includes('--os-verify') ? ['verify-openspec'] : [])];
      for (const nm of runnable) {
        if (!data.flags.steps.includes(nm)) data.flags.steps.push(nm);
        const x = data.steps.find(s => s.name === nm); if (x) { x.status = 'pending'; delete x.reason; }
      }
      for (const nm of ['execute', 'commit', 'review', 'version']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
      for (const nm of ['received-review', 'commit-fixes']) { const e = data.steps.find(x => x.name === nm); if (e) { e.status = 'skipped'; e.reason = 'fixture'; } }
    }
    if (scenario.startsWith('rerun-execute-')) {
      data.flags.auto = true;
      data.flags.quality = 'balanced'; // execute_tier is skipped, so confirm_pipeline emits dispatch_execute
    }
    if (scenario === 'guard-earlier-open') {
      // R101: received-review still open, everything else before version done.
      data.flags.auto = true;
      for (const nm of ['execute', 'commit', 'review', 'commit-fixes']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
      const rr = data.steps.find(x => x.name === 'received-review'); if (rr) rr.status = 'in_progress';
    }
    if (scenario.startsWith('rerun-version-') || scenario.startsWith('guard-release-ahead')) {
      // R80: everything before version is done, so confirm_pipeline emits dispatch_version.
      data.flags.auto = true;
      for (const nm of ['execute', 'commit', 'review']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
      for (const nm of ['received-review', 'commit-fixes']) { const e = data.steps.find(x => x.name === nm); if (e) { e.status = 'skipped'; e.reason = 'fixture'; } }
    }
    if (scenario === 'after-received-review-changes' || scenario === 'guard-received-open' || (scenario === 'stage-outside-files' && process.argv.includes('--fixes'))) {
      // review done, received-review running: its result decides whether stage_fixes is emitted.
      data.flags.auto = true;
      const rv = data.steps.find(x => x.name === 'review'); if (rv) rv.status = 'completed';
      const rr = data.steps.find(x => x.name === 'received-review'); if (rr) rr.status = 'in_progress';
      data.history = [...(data.history || []), { step: 'dispatch_review', result: 'success' }];
    }
    if (process.argv.includes('--resume-after-outside')) {
      // R103: execute and commit are done, so a resumed --after confirm_pipeline walks on to stage_fixes.
      for (const nm of ['execute', 'commit']) { const e = data.steps.find(x => x.name === nm); if (e) e.status = 'completed'; }
    }
    if (scenario === 'review-gate-rows' && result && result.threshold) data.flags.reviewThreshold = result.threshold;
    if (process.argv.includes('--summary-stale')) { const e = data.steps.find(x => x.name === 'review'); if (e) e.startedAt = new Date().toISOString(); }
    if (scenario === 'emit-in-progress') data.paused = { at: '2026-10-19T12:00:00.000Z', reason: 'fixture' };
    if (scenario === 'worktree-mismatch') data.worktree = path.dirname(projectRoot);
    if (scenario === 'rebase-emit') { data.flags.rebase = 'auto'; data.flags.auto = true; }
    if (scenario.startsWith('inline-fail-') || scenario === 'forced-cleanup') {
      const nm = scenario === 'forced-cleanup' ? 'learnings-commit' : scenario.slice('inline-fail-'.length);
      data.flags.auto = true;
      if (!data.flags.steps.includes(nm)) data.flags.steps.push(nm);
      const e = data.steps.find(x => x.name === nm);
      if (e) e.status = 'in_progress'; else data.steps.push({ name: nm, status: 'in_progress' });
    }
    if (scenario === 'plan-no-tasks') data.flags.planFile = path.join(projectRoot, 'plan-notasks.md');
    if (scenario.startsWith('resume-plan')) { data.flags.steps = ['execute', 'commit']; data.flags.auto = true; data.flags.quality = 'balanced'; }
    if (scenario === 'other-worktree-plan') data.worktree = path.dirname(projectRoot);
    if (scenario === 'finished-plan') {
      data.flags.planFile = path.join(projectRoot, 'plan-notasks.md');
      for (const s of data.steps) if (s.status === 'pending' && s.condition === undefined) s.status = 'completed';
    }
  });
}
// review-gate: the copy review-sdlc leaves in the main worktree's .sdlc/execution/ (P11); rounds-* write it again per round.
// final: the R95 final-check summary (--final-summary); a review-summaries/<name>.comment.md beside it becomes its commentCopyPath.
function writeSummary(final = false) {
  fs.mkdirSync(execDir, { recursive: true });
  const dest = path.join(execDir, 'review-summary-feat-ship.json');
  const summariesDir = path.join(repoRoot, 'tests', 'promptfoo', 'fixtures-fs', 'review-summaries');
  const rel = final ? finalSummaryRel : summaryRel;
  fs.copyFileSync(path.join(summariesDir, rel), dest);
  const t = new Date(Date.now() + (process.argv.includes('--summary-stale') ? -3600000 : 60000));
  const commentSrc = path.join(summariesDir, rel.replace(/\.json$/, '') + '.comment.md');
  if (final && fs.existsSync(commentSrc)) {
    const commentCopy = dest.replace(/\.json$/, '') + '.comment.md';
    fs.copyFileSync(commentSrc, commentCopy);
    const doc = JSON.parse(fs.readFileSync(dest, 'utf8'));
    doc.commentCopyPath = commentCopy;
    fs.writeFileSync(dest, JSON.stringify(doc));
  }
  if (process.argv.includes('--summary-comment')) {
    // Models review-sdlc Step 6: the comment copy sits beside the summary; the diff_dir path is gone.
    const commentCopy = dest.replace(/\.json$/, '') + '.comment.md';
    fs.writeFileSync(commentCopy, '## Code Review\n');
    const doc = JSON.parse(fs.readFileSync(dest, 'utf8'));
    doc.commentCopyPath = commentCopy;
    doc.commentPath = path.join(require('os').tmpdir(), 'sdlc-review-gone', 'review-comment.md');
    fs.writeFileSync(dest, JSON.stringify(doc));
  }
  fs.utimesSync(dest, t, t);
}
if (summaryRel) writeSummary();
if (process.argv.includes('--in-worktree')) {
  runCwd = path.join(path.dirname(projectRoot), 'wt-' + path.basename(projectRoot));
  sh(`git worktree add -q -b wt-review "${runCwd}"`);
}
const late = process.argv.includes('--late-exec');
if (execSeed !== 'none' && !late) {
  fs.mkdirSync(execDir, { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'seed', `execute-${execSeed}.json`), path.join(execDir, `execute-feat-ship-${SEED_TS}.json`));
}
// --exec-cleanup: execute's own Step 5f check, then its verifying R14 cleanup, before ship's --after call.
// Same env as the ship.js calls (R-F7: env drops SDLC_STATE_DIR_OVERRIDE), so all read one state dir.
let execPreGate = null;
if (process.argv.includes('--exec-cleanup')) {
  const execScript = path.join(repoRoot, 'plugins', 'sdlc-utilities', 'scripts', 'state', 'execute.js');
  const verify = spawnSync('node', [execScript, 'verify-completeness', '--branch', 'feat/ship'], { cwd: projectRoot, env });
  const cleanup = spawnSync('node', [execScript, 'cleanup', '--branch', 'feat/ship'], { cwd: projectRoot, env });
  execPreGate = { verifyExit: verify.status, cleanupExit: cleanup.status };
}

if (process.argv.includes('--other-exec')) {
  fs.mkdirSync(execDir, { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'seed', 'execute-complete.json'), path.join(execDir, `execute-other-branch-${SEED_TS}.json`));
}

switch (scenario) {
  case 'initial':
    clearLedgers();
    initial();
    break;
  case 'initial-dry-run':
    clearLedgers();
    initial(['--dry-run']);
    break;
  case 'initial-resume-legacy':
    initial();
    break;
  case 'legacy-twice':
    initial();
    initial();
    break;
  case 'after-confirm':
  case 'edit-cancel':
  case 'resumed-completed':
    after('confirm_pipeline', resultRel || `results/${answer}.json`);
    break;
  case 'after-commit-ok':
  case 'after-commit-fail':
    after('dispatch_commit', resultRel);
    break;
  case 'after-commit-fail-gc': {
    // R38 failure-path sweep (M7): a stale ledger of a branch that no longer exists
    // must be pruned when a step fails; the failed ledger itself is kept.
    const orphan = path.join(execDir, 'ship-gone-branch-20200101T000000Z.json');
    fs.writeFileSync(orphan, JSON.stringify({ version: 1, branch: 'gone-branch', steps: [] }));
    const old = new Date(Date.now() - 30 * 86400000);
    fs.utimesSync(orphan, old, old);
    after('dispatch_commit', resultRel || 'results/commit-fail.json');
    break;
  }
  case 'rebase-emit': {
    // A real local origin so `git fetch origin` succeeds; rebase.flag auto + version runnable.
    sh('git init -q --bare ../origin-bare.git && git remote add origin ../origin-bare.git && git push -q origin main && git fetch -q origin');
    const gate = after('dispatch_review', resultRel || 'results/review-approved.json');
    if (gate.status === 'step' && gate.step.id === 'review_gate') after('review_gate', `results/${answer}.json`);
    break;
  }
  case 'forced-cleanup':
    // learnings_commit fails (non-fatal) -> forced cleanup is emitted with the ledger kept.
    after('learnings_commit', 'results/commit-fail.json');
    after('cleanup', 'results/cleanup-ok.json');
    break;
  case 'after-pr':
    if (process.argv.includes('--ignore-sdlc')) fs.writeFileSync(path.join(projectRoot, '.sdlc', '.gitignore'), '*\n');
    after('dispatch_pr', resultRel);
    break;
  case 'rerun-version-moved':
  case 'rerun-version-same': {
    // R80: emit dispatch_version, optionally fail the entry and move HEAD, then emit again (and once more when HEAD moved).
    const moved = scenario === 'rerun-version-moved';
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    if (process.argv.includes('--version-failed')) {
      const d = readJson(statePath);
      d.steps.find(x => x.name === 'version').status = 'failed';
      fs.writeFileSync(statePath, JSON.stringify(d, null, 2));
    }
    if (moved) sh('git commit -q --allow-empty -m "release commit made by the first run"');
    headAfter = sh('git rev-parse HEAD').stdout.trim();
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    if (moved) { after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap()); }
    break;
  }
  case 'guard-received-open':
    after('dispatch_received_review', resultRel);
    snapshots.push(snap());
    break;
  case 'guard-earlier-open':
    after('stage_fixes', 'results/generic-ok.json');
    snapshots.push(snap());
    break;
  case 'guard-release-ahead':
  case 'guard-release-ahead-resume': {
    // R102: the version step made release commit R, then commit F landed after it.
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    sh('git commit -q --allow-empty -m "release commit"');
    releaseSha = sh('git rev-parse HEAD').stdout.trim();
    sh('git commit -q --allow-empty -m "commit after the release"');
    headAfter = sh('git rev-parse HEAD').stdout.trim();
    if (scenario === 'guard-release-ahead') {
      const file = path.join(stubDir, 'version-ahead.json');
      fs.writeFileSync(file, JSON.stringify({ success: true, output: { summary: 'released', artifacts: { commit: releaseSha } } }));
      ship(['--after', 'dispatch_version', '--result-file', file, '--state', statePath || '']);
      snapshots.push(snap());
    } else {
      for (let i = 0; i < 2; i++) { after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap()); }
    }
    break;
  }
  case 'rerun-execute-finished':
  case 'rerun-execute-clean': {
    // R86: emit dispatch_execute, then (finished) leave uncommitted work outside .sdlc/ and, with --with-state,
    // an execute state file; emit again, and once more to compare the two outcomes.
    if (process.argv.includes('--dirty-before')) fs.writeFileSync(path.join(projectRoot, 'pre-existing.txt'), 'dirty before dispatch\n');
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    headAfter = sh('git rev-parse HEAD').stdout.trim();
    if (process.argv.includes('--drop-dispatch-tree')) {
      const d = readJson(statePath);
      delete d.steps.find(x => x.name === 'execute').dispatchTree;
      fs.writeFileSync(statePath, JSON.stringify(d, null, 2));
    }
    if (process.argv.includes('--exec-failed')) {
      const d = readJson(statePath);
      d.steps.find(x => x.name === 'execute').status = 'failed';
      fs.writeFileSync(statePath, JSON.stringify(d, null, 2));
    }
    if (scenario === 'rerun-execute-finished') fs.writeFileSync(path.join(projectRoot, 'executed-work.txt'), 'work from the first run\n');
    if (process.argv.includes('--with-state')) {
      fs.mkdirSync(execDir, { recursive: true });
      fs.copyFileSync(path.join(projectRoot, 'seed', 'execute-complete.json'), path.join(execDir, `execute-feat-ship-${SEED_TS}.json`));
    }
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    after('confirm_pipeline', 'results/yes.json');
    snapshots.push(snap());
    break;
  }
  case 'after-execute':
    after('dispatch_execute', resultRel || 'results/execute-ok.json');
    break;
  case 'plan-no-tasks':
    after('confirm_pipeline', `results/${answer}.json`);
    break;
  case 'after-version-no-tag':
    after('dispatch_version', resultRel || 'results/version-tag-missing.json');
    break;
  case 'after-bad-result':
    after('confirm_pipeline', resultRel || 'results/does-not-exist.json');
    break;
  case 'after-cleanup': {
    after('learnings_commit', 'results/generic-ok.json');
    // The normal cleanup-pipeline deletes the ledger before `--after cleanup`.
    if (statePath) fs.rmSync(statePath, { force: true });
    after('cleanup', resultRel || 'results/cleanup-ok.json');
    break;
  }
  case 'step-list-equal': {
    clearLedgers();
    initial(['--steps', 'commit']);
    // A config change after init must not change the frozen step plan (L6).
    fs.writeFileSync(path.join(projectRoot, '.sdlc', 'local.json'), JSON.stringify({ ship: { steps: ['commit', 'review'] } }));
    walk(after('confirm_pipeline', `results/${answer}.json`));
    break;
  }
  case 'ttl-days': {
    clearLedgers();
    initial(['--steps', 'commit', '--ttl-days', '3']);
    walk(after('confirm_pipeline', `results/${answer}.json`));
    break;
  }
  case 'branch-migrate': {
    const env1 = after('confirm_pipeline', 'results/yes.json');
    const cmd = env1.step && env1.step.data && env1.step.data.commands && env1.step.data.commands[0];
    if (cmd) sh(cmd);
    after('branch_prepare', resultRel || 'results/branch-prepare-ok.json');
    break;
  }
  case 'emit-in-progress':
    fs.writeFileSync(path.join(execDir, '.stop-cap-exhausted-feat-ship.json'), '{"stepName":"commit","count":3}');
    after('stage_changes', resultRel || 'results/generic-ok.json');
    break;
  case 'review-gate-rows': {
    const gate = after('dispatch_review', resultRel);
    if (gate.status === 'step') after('review_gate', `results/${answer}.json`);
    break;
  }
  case 'worktree-mismatch':
    initial(['--dry-run']);
    initial();
    break;
  case 'after-stage': {
    const c = after('stage_changes', 'results/generic-ok.json');
    if (c.status === 'step' && c.step.id.startsWith('confirm_')) after(c.step.id, `results/${answer}.json`);
    break;
  }
  case 'after-received-review-changes': {
    // Default: received-review left a change (fix.txt). --clean-tree: it changed nothing (.sdlc/ ignored, rest committed).
    if (process.argv.includes('--clean-tree')) {
      fs.writeFileSync(path.join(projectRoot, '.gitignore'), '.sdlc/\n');
      sh('git add -A && git commit -q -m "fixture: clean tree"');
    } else {
      setPlanFiles(['fix.txt']); // the fix is inside the plan Files (R83)
      fs.writeFileSync(path.join(projectRoot, 'fix.txt'), 'review fix\n');
    }
    if (gitStatusFail) fs.writeFileSync(statusFailFlag, '');
    const c = after('dispatch_received_review', 'results/generic-ok.json');
    fs.rmSync(statusFailFlag, { force: true });
    if (c.status === 'step' && c.step.id === 'stage_fixes') {
      for (const cmd of c.step.data.commands) sh(cmd); // the main context runs them
      after('stage_fixes', 'results/generic-ok.json');
    }
    break;
  }
  case 'stage-outside-files': {
    // R83: --plan-files <csv> commits a plan whose Files are those paths; --write <csv> creates untracked files;
    // --edit-plan leaves an uncommitted edit in plan.md; --fixes reaches stage_fixes instead of stage_changes.
    const csv = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].split(',') : []; };
    setPlanFiles(csv('--plan-files'));
    for (const rel of csv('--write')) {
      fs.mkdirSync(path.dirname(path.join(projectRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, rel), 'x\n');
    }
    if (process.argv.includes('--edit-plan')) fs.appendFileSync(path.join(projectRoot, 'plan.md'), '\nedited\n');
    if (process.argv.includes('--untrack-plan')) sh('git rm -q --cached plan.md && git commit -q -m "fixture: untrack plan"');
    if (process.argv.includes('--fixes') && process.argv.includes('--scope-asked')) {
      // R94: received-review stops on the scope question first; --write-after paths appear after that stop.
      const si = process.argv.indexOf('--scope-result');
      after('dispatch_received_review', si >= 0 && process.argv[si + 1] ? process.argv[si + 1] : 'results/received-review-scope.json');
      snapshots.push(snap());
      for (const rel of csv('--write-after')) {
        fs.mkdirSync(path.dirname(path.join(projectRoot, rel)), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, rel), 'x\n');
      }
    }
    after(process.argv.includes('--fixes') ? 'dispatch_received_review' : 'dispatch_execute', 'results/generic-ok.json');
    if (process.argv.includes('--resume-after-fix')) {
      // R87: the user reverts the outside paths, then resumes; stage_changes must still be emitted (once).
      const keep = csv('--plan-files');
      for (const rel of csv('--write')) if (!keep.includes(rel)) fs.rmSync(path.join(projectRoot, rel), { force: true });
      after('confirm_pipeline', 'results/yes.json');
      if (process.argv.includes('--again')) {
        after('stage_changes', 'results/generic-ok.json');
        after('confirm_pipeline', 'results/yes.json');
      }
    }
    break;
  }
  case 'rounds-2-fixes':
  case 'rounds-2-no-fixes':
  case 'rounds-1-default':
  case 'rounds-final-check':
  case 'rounds-self-commit': {
    // R84: rounds-2-no-fixes leaves a clean tree after received-review (.sdlc/ ignored, rest committed);
    // rounds-self-commit starts from that clean tree too, so its own commit leaves it clean (R97).
    const fixes = scenario !== 'rounds-2-no-fixes';
    const selfCommit = scenario === 'rounds-self-commit';
    const reviewResult = scenario === 'rounds-final-check' || selfCommit ? 'results/review-approved.json' : 'results/generic-ok.json';
    if (fixes) setPlanFiles(['fix.txt'], { fixSubject: process.argv.includes('--fix-subject') ? 'fix(#1): widget - review fixes' : null }); // R83/R103
    if (!fixes || selfCommit) {
      fs.writeFileSync(path.join(projectRoot, '.gitignore'), '.sdlc/\n');
      sh('git add -A && git commit -q -m "fixture: clean tree"');
    }
    for (let round = 1; round <= 3; round++) {
      const c = reviewRound(fixes ? `review fix ${round}\n` : null, { reviewResult, selfCommit });
      if (!(c.status === 'step' && c.step.id === 'dispatch_review')) break;
      // review-sdlc writes a new summary each round; the final check (R95) gets --final-summary.
      if (summaryRel) writeSummary(/--committed --base /.test(c.step.data.invocation || ''));
    }
    if (selfCommit && selfCommitOutside && process.argv.includes('--resume-after-outside')) {
      after('confirm_pipeline', 'results/yes.json');           // resume before the revert: stops again
      snapshots.push(snap());
      sh(`git rm -q ${selfCommitOutside} && git commit -q -m "fixture: revert outside path"`);
      after('confirm_pipeline', 'results/yes.json');           // resume after the revert: stage_fixes adopts
      snapshots.push(snap());
    }
    if (scenario === 'rounds-final-check') {
      snapshots.push(snap());
      // R95 idempotency: the final-check review result reported once more.
      if (process.argv.includes('--again')) { after('dispatch_review', reviewResult); snapshots.push(snap()); }
    }
    const lastEnv = calls[calls.length - 1].envelope;
    if (scenario === 'rounds-final-check' && fcResume && lastEnv.ext && lastEnv.ext.reason === 'final-check-open') {
      if (fcResume === 'fix') {
        fs.appendFileSync(path.join(projectRoot, 'fix.txt'), 'final fix\n');
        sh('git add fix.txt && git commit -q -m "fixture: main session fixes the open findings"');
      }
      let c = after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap());
      if (fcResume === 'fix' && c.status === 'step' && c.step.id === 'dispatch_review') {
        writeSummary(true);
        after('dispatch_review', 'results/review-approved.json'); snapshots.push(snap());
      }
      if (fcResume === 'twice') { after('confirm_pipeline', 'results/yes.json'); snapshots.push(snap()); }
    }
    break;
  }
  case 'tier': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (c.status === 'step' && c.step.id === 'execute_tier') after('execute_tier', resultRel || 'results/tier-balanced.json');
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    break;
  }
  case 'exec-state': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (c.status === 'step' && c.step.id === 'execute_state') after('execute_state', resultRel);
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    break;
  }
  case 'pending': {
    // --result: the dispatch result; --answer: the execute_gate answer file name, or none
    const c = after(process.argv.includes('--commit') ? 'dispatch_commit' : 'dispatch_execute', resultRel);
    if (c.status === 'step' && c.step.id === 'execute_gate' && answer !== 'none') after('execute_gate', `results/${answer}.json`);
    break;
  }
  case 'handoff': {
    const c = after('confirm_pipeline', 'results/yes.json');
    if (late && execSeed !== 'none') {
      fs.mkdirSync(execDir, { recursive: true });
      fs.copyFileSync(path.join(projectRoot, 'seed', `execute-${execSeed}.json`), path.join(execDir, `execute-feat-ship-${SEED_TS}.json`));
    }
    if (c.status === 'step' && c.step.id === 'execute_handoff' && resultRel) after('execute_handoff', resultRel);
    if (process.argv.includes('--again')) after('confirm_pipeline', 'results/yes.json');
    if (process.argv.includes('--walk')) walk(calls[calls.length - 1].envelope);
    break;
  }
  case 'confirm-pr':
    after('archive_openspec', 'results/generic-ok.json');
    if (calls[calls.length - 1].envelope.step && calls[calls.length - 1].envelope.step.id === 'confirm_pr') after('confirm_pr', `results/${answer}.json`);
    break;
  case 'auto-walk':
    clearLedgers();
    initial(['--steps', 'commit,review', '--auto']);
    walk(after('confirm_pipeline', 'results/yes.json'));
    break;
  case 'resume-twice':
    after('stage_changes', 'results/generic-ok.json');
    after('confirm_commit', 'results/cancel.json');
    after('confirm_pipeline', 'results/yes.json');
    break;
  case 'openspec': {
    // OpenSpec change in the project root, a stub `openspec` CLI on PATH, and the two answer files.
    if (/^[A-Za-z0-9._-]+$/.test(osChange)) {
      const [done, total] = osTasks.split('/').map(Number);
      const changeDir = process.argv.includes('--os-archived')
        ? path.join(projectRoot, 'openspec', 'changes', 'archive', `2026-01-01-${osChange}`)
        : path.join(projectRoot, 'openspec', 'changes', osChange);
      fs.mkdirSync(changeDir, { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
      fs.writeFileSync(path.join(changeDir, 'proposal.md'), `# ${osChange}\n\n## Why\n\nFixture change.\n`);
      const lines = [];
      for (let i = 1; i <= total; i++) lines.push(`- [${i <= done ? 'x' : ' '}] Task ${i}`);
      fs.writeFileSync(path.join(changeDir, 'tasks.md'), `## 1. Tasks\n\n${lines.join('\n')}\n`);
    }
    fs.mkdirSync(path.join(projectRoot, 'results'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'results', 'os-abort.json'), JSON.stringify({ success: true, output: { answer: 'abort', summary: 'aborted' } }));
    fs.writeFileSync(path.join(projectRoot, 'results', 'os-result.json'), JSON.stringify({ success: true, output: { status: 'synced-and-archived', resultText: 'archived add-auth (synced 2 tasks)', summary: 'ignored' } }));
    fs.writeFileSync(path.join(stubDir, 'openspec'), `#!/bin/sh\nif [ "$1" = "validate" ]; then exit ${osValidate === 'fail' ? 1 : 0}; fi\nexit 0\n`, { mode: 0o755 });
    after('verify_version_tag', 'results/generic-ok.json');
    if (osAnswer === 'abort' || osAnswer === 'result') {
      after('archive_openspec', `results/os-${osAnswer}.json`);
      if (osAnswer === 'abort' && process.argv.includes('--os-resume')) {
        walk(after('confirm_pipeline', 'results/yes.json'), 'archive_openspec', 8);
      }
    }
    break;
  }
  case 'resume-plan':
    initial(['--resume']);
    break;
  case 'resume-plan-auto':
    initial(['--resume', '--auto']);
    break;
  case 'resume-plan-quick':
    fs.mkdirSync(path.join(projectRoot, '.sdlc'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, '.sdlc', 'local.json'), JSON.stringify({ schemaVersion: 4, ship: { quick: ['execute', 'commit', 'pr'] } }));
    initial(['--resume', '--quick']);
    break;
  case 'stale-plan': {
    // Ruling w2-planreview Q1: a ledger older than the resume TTL (1 h) is still checked.
    const old = new Date(Date.now() - 2 * 3600000);
    fs.utimesSync(seedPath, old, old);
    initial();
    break;
  }
  case 'other-worktree-plan':
  case 'finished-plan':
    initial();
    break;
  case 'rebase-conflict': {
    // #9126: an interactive rebase failure emits rebase_conflict; --answer / --answer-text name the answer.
    const c = after('rebase', 'results/commit-fail.json');
    if (c.status === 'step' && c.step.id === 'rebase_conflict') after('rebase_conflict', `results/${answer}.json`);
    break;
  }
  default:
    if (scenario.startsWith('inline-fail-')) {
      after(scenario.slice('inline-fail-'.length).replace(/-/g, '_'), resultRel || 'results/commit-fail.json');
      break;
    }
    console.log(JSON.stringify({ scenario, error: `unknown scenario: ${scenario}` }));
    process.exit(0);
}

let ledger = null;
const finalPath = statePath && fs.existsSync(statePath)
  ? statePath
  : (ledgerFiles()[0] ? path.join(execDir, ledgerFiles()[0]) : null);
const data = finalPath ? readJson(finalPath) : null;
if (data) {
  ledger = {
    stepStatuses: Object.fromEntries((data.steps || []).map(s => [s.name, s.status])),
    history: (data.history || []).map(h => ({ step: h.step, result: h.result, source: h.data && h.data.source, completenessGate: h.data && h.data.completenessGate })),
    stepReasons: Object.fromEntries((data.steps || []).filter(s => s.reason).map(s => [s.name, s.reason])),
    currentStep: data.currentStep === undefined ? null : data.currentStep,
    flagsKeys: Object.keys(data.flags || {}),
    flags: data.flags || {},
    paused: data.paused !== undefined,
    stepResults: Object.fromEntries((data.steps || []).filter(s => s.result !== undefined).map(s => [s.name, s.result])),
    finalCheck: data.finalCheck === undefined ? null : data.finalCheck,
  };
}

// The two "> OpenSpec change" prompt lines of openspec-steps.md (incomplete, all-done).
const osPromptLines = (() => {
  try {
    return fs.readFileSync(path.join(repoRoot, 'plugins', 'sdlc-utilities', 'skills', 'ship-sdlc', 'openspec-steps.md'), 'utf8')
      .split('\n').filter(l => l.startsWith('> OpenSpec change')).map(l => l.slice(2));
  } catch (_) { return []; }
})();

// Existence of every script path named in an emitted command (`node "<path>" …`),
// so assertions can check absolute paths without filesystem access.
const commandScripts = {};
for (const c of calls) {
  const cmds = (c.envelope.step && c.envelope.step.data && c.envelope.step.data.commands) || [];
  for (const cmd of cmds) {
    const m = /^node "([^"]+)"/.exec(cmd);
    if (m) commandScripts[m[1]] = path.isAbsolute(m[1]) && fs.existsSync(m[1]);
  }
}

fs.rmSync(stubDir, { recursive: true, force: true });

console.log(JSON.stringify({
  scenario,
  calls,
  snapshots,
  headAfter,
  releaseSha,
  ledger,
  ledgerExists: Boolean(data),
  ledgerFiles: ledgerFiles(),
  execFiles: (() => { try { return fs.readdirSync(execDir).filter(f => /^execute-/.test(f)); } catch (_) { return []; } })(),
  execPreGate,
  otherFiles: (() => { try { return fs.readdirSync(execDir).filter(f => !/^execute-/.test(f)); } catch (_) { return []; } })(),
  summarySidecars: (() => { try { return fs.readdirSync(execDir).filter(f => f.startsWith('.summary-')); } catch (_) { return []; } })(),
  commandScripts,
  stopCapExists: fs.existsSync(path.join(execDir, '.stop-cap-exhausted-feat-ship.json')),
  mdPrompts: {
    incomplete: osPromptLines.find(l => l.includes('incomplete')) || null,
    allDone: osPromptLines.find(l => l.includes('passed validation')) || null,
  },
  seedUnchanged: seedBytes === null ? null : (fs.existsSync(seedPath) && fs.readFileSync(seedPath, 'utf8') === seedBytes),
}));
