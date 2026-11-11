/**
 * jira-write-guard-test.js — drives the jira-sdlc placeholder and template helpers.
 *
 * Used by datasets/jira-sdlc-guardrail-exec.yaml via script-runner.js. Each
 * --op invocation runs one isolated scenario, prints a single
 * "RESULT: <PASS|FAIL> <details>" line on stdout, and exits 0 when the
 * scenario matches expectations. We never throw on assertion failure — we
 * print and exit non-zero so the eval tooling can surface reasons.
 *
 * Operations:
 *   helper-placeholder        — detects markers in nested ADF; ignores < 3 chars
 *   helper-template           — override beats shipped; missing returns null
 *   helper-template-fallback  — FALLBACK_MAP resolves Sub-bug, Sub-task, Subtask
 *
 * Args (per scenario):
 *   --op <name>               one of the three operations above (no other args)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(REPO_ROOT, 'plugins/sdlc-utilities/skills/jira-sdlc/lib');

const { findPlaceholders, findPlaceholdersForToolInput, PLACEHOLDER_REGEX } = require(path.join(LIB, 'placeholder-detect.js'));
const { extractHeadings, loadTemplateHeadings } = require(path.join(LIB, 'template-fingerprint.js'));

function arg(name, def = null) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return def;
  return process.argv[i + 1];
}

function emit(ok, details) {
  console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'} ${details}`);
  process.exitCode = ok ? 0 : 1;
  // Do NOT call process.exit() — it bypasses `finally` blocks, leaving artifact
  // files behind and polluting subsequent test runs that share os.tmpdir().
  return ok;
}

// ---- Helper-module tests ----

function helperPlaceholder() {
  const adf = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'See {issue_id}' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Owner: [name of owner]' }] },
    ],
  };
  const m = findPlaceholders({ description: 'No marker here', adf });
  if (m.length !== 2) return emit(false, `expected 2 markers, got ${m.length}: ${JSON.stringify(m)}`);
  const shortBracket = findPlaceholders({ s: '[ab]' });
  if (shortBracket.length !== 0) return emit(false, `short bracket should be ignored: ${JSON.stringify(shortBracket)}`);
  // Spec C13 negative lookahead: JSON-array bodies and numeric-led arrays
  // must not be flagged as placeholders. Issue #240 false-positive guard.
  const jsonArrayBody = findPlaceholders({
    commentBody: 'identities contained one entry: [{"id":"auth0|sub","provider":"auth0"}]',
  });
  if (jsonArrayBody.length !== 0) {
    return emit(false, `JSON-array body must not match: ${JSON.stringify(jsonArrayBody)}`);
  }
  const numericLedArray = findPlaceholders({ s: '[123, 456, 789]' });
  if (numericLedArray.length !== 0) {
    return emit(false, `numeric-led array must not match: ${JSON.stringify(numericLedArray)}`);
  }
  // Quoted-string-led array (also JSON-shape)
  const quotedArray = findPlaceholders({ s: '["a", "b", "c"]' });
  if (quotedArray.length !== 0) {
    return emit(false, `quoted-array must not match: ${JSON.stringify(quotedArray)}`);
  }
  // True-positive prose placeholder must still match (regression guard)
  const prose = findPlaceholders({ s: '[Enter description here]' });
  if (prose.length !== 1) {
    return emit(false, `prose placeholder regression: ${JSON.stringify(prose)}`);
  }
  // Sanity: regex global flag works
  if (!PLACEHOLDER_REGEX.global) return emit(false, 'regex missing /g flag');

  // Issue #276: contentFormat-aware dispatch
  // (1) Stringified ADF blob with `contentFormat='adf'` — bracket regex must NOT
  //     run against the JSON-serialized ADF (no false-positive on `[{...},...]`).
  const stringifiedAdf = JSON.stringify({
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'normal copy without markers' }] },
    ],
  });
  const r1 = findPlaceholdersForToolInput({
    issueIdOrKey: 'PROJ-1',
    commentBody: stringifiedAdf,
    contentFormat: 'adf',
  });
  if (r1.results.length !== 0) {
    return emit(false, `adf-stringified false-positive: ${JSON.stringify(r1.results)}`);
  }
  // (2) Parsed ADF object with a `text` node containing a true placeholder must be detected.
  const r2 = findPlaceholdersForToolInput({
    issueIdOrKey: 'PROJ-1',
    commentBody: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'value is {TBD}' }] }] },
    contentFormat: 'adf',
  });
  if (r2.results.length !== 1 || r2.results[0].marker !== '{TBD}') {
    return emit(false, `adf-text-node placeholder missed: ${JSON.stringify(r2.results)}`);
  }
  // (3) Markdown contentFormat path keeps existing behavior — placeholder in body is detected.
  const r3 = findPlaceholdersForToolInput({
    issueIdOrKey: 'PROJ-1',
    commentBody: 'has {placeholder} here',
    contentFormat: 'markdown',
  });
  if (r3.results.length !== 1 || r3.results[0].marker !== '{placeholder}') {
    return emit(false, `markdown path regression: ${JSON.stringify(r3.results)}`);
  }
  // (4) Malformed ADF JSON with contentFormat='adf' — falls back to whole-payload walk + warning.
  const r4 = findPlaceholdersForToolInput({
    issueIdOrKey: 'PROJ-1',
    commentBody: 'not valid json {',
    contentFormat: 'adf',
  });
  if (r4.warnings.length !== 1) {
    return emit(false, `malformed-adf warning missing: ${JSON.stringify(r4.warnings)}`);
  }

  // Issue #365: summary field bracket-form carve-out.
  // (5) Common [CATEGORY] prefix must NOT be flagged as a placeholder.
  const r5 = findPlaceholdersForToolInput({
    summary: '[OIDC/SSO] Add token exchange',
    description: '## Objective\n\nBody.',
    contentFormat: 'markdown',
  });
  if (r5.results.length !== 0) {
    return emit(false, `summary bracket-form false-positive [OIDC/SSO]: ${JSON.stringify(r5.results)}`);
  }
  // (6) Minimum-length bracket prefix [IDS] (3 chars — exactly at regex threshold).
  const r6 = findPlaceholdersForToolInput({ summary: '[IDS] Title' });
  if (r6.results.length !== 0) {
    return emit(false, `summary bracket-form false-positive [IDS]: ${JSON.stringify(r6.results)}`);
  }
  // (7) [FEAT] and [BUG] prefix variants.
  const r7a = findPlaceholdersForToolInput({ summary: '[FEAT] X' });
  if (r7a.results.length !== 0) {
    return emit(false, `summary bracket-form false-positive [FEAT]: ${JSON.stringify(r7a.results)}`);
  }
  const r7b = findPlaceholdersForToolInput({ summary: '[BUG] Y' });
  if (r7b.results.length !== 0) {
    return emit(false, `summary bracket-form false-positive [BUG]: ${JSON.stringify(r7b.results)}`);
  }
  // (8) Brace-form in summary still detected — carve-out must not suppress {name} markers.
  const r8 = findPlaceholdersForToolInput({ summary: '{placeholder_name} Title' });
  if (r8.results.length !== 1 || r8.results[0].path !== 'summary' || r8.results[0].marker !== '{placeholder_name}') {
    return emit(false, `brace-form in summary not detected: ${JSON.stringify(r8.results)}`);
  }
  // (9) Bracket-form in description still detected (regression guard).
  const r9 = findPlaceholdersForToolInput({ summary: 'Clean title', description: '[Enter description here]' });
  if (r9.results.length !== 1 || r9.results[0].path !== 'description') {
    return emit(false, `bracket-form in description regression: ${JSON.stringify(r9.results)}`);
  }
  // (10) Combined: summary bracket suppressed, description bracket detected — exactly one result.
  const r10 = findPlaceholdersForToolInput({
    summary: '[OIDC/SSO] X',
    description: '[State the question...]',
    contentFormat: 'markdown',
  });
  if (r10.results.length !== 1 || r10.results[0].path !== 'description') {
    return emit(false, `combined payload: expected 1 description result, got: ${JSON.stringify(r10.results)}`);
  }
  // (11) ADF dispatch path: bracket-form in summary must NOT fire on the ADF return paths
  // (cb===null/undefined path and ADF happy-path after findPlaceholdersInAdf).
  const r11 = findPlaceholdersForToolInput({
    summary: '[OIDC/SSO] Token exchange',
    contentFormat: 'adf',
    commentBody: JSON.stringify({ type: 'doc', version: 1, content: [] }),
  });
  if (r11.results.length !== 0) {
    return emit(false, `ADF summary bracket false-positive: ${JSON.stringify(r11.results)}`);
  }

  emit(true, `markers=${m.length} adf-dispatch=ok summary-carve-out=ok`);
}

function helperTemplateFallback() {
  // Issue #241: FALLBACK_MAP must cover all three keys (Sub-bug, Sub-task, Subtask).
  // Build a temp templates dir with only Bug.md + Task.md so the fallback arm
  // fires for every subtask variant (including Sub-task → Task).
  const { resolveTemplateStatus } = require(path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/jira.js')).__testExports || {};
  // The script does not export __testExports today; replicate the call via spawnSync
  // against --templates with a controlled templates dir + cache fixture.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-fallback-'));
  try {
    const tplDir = path.join(tmpRoot, 'tpl');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'Bug.md'), '## H\n', 'utf8');
    fs.writeFileSync(path.join(tplDir, 'Task.md'), '## H\n', 'utf8');
    // Cache fixture
    const cacheDir = path.join(tmpRoot, '.sdlc-cache/jira/test_atlassian_net');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'FB.json'), JSON.stringify({
      version: 1, lastUpdated: '2026-01-15T10:00:00Z', maxAgeHours: 0,
      cloudId: 'c', siteUrl: 'https://test.atlassian.net',
      currentUser: { accountId: 'u', displayName: 'U', email: 'e' },
      project: { key: 'FB', name: 'FB', id: '1' },
      issueTypes: {
        'Sub-bug':  { id: '1', subtask: true, hierarchyLevel: -1 },
        'Sub-task': { id: '2', subtask: true, hierarchyLevel: -1 },
        'Subtask':  { id: '3', subtask: true, hierarchyLevel: -1 },
      },
      fieldSchemas: {}, workflows: {}, linkTypes: [], userMappings: {},
    }), 'utf8');
    const SCRIPT = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/skill/jira.js');
    const r = spawnSync('node', [SCRIPT, '--project', 'FB', '--templates', '--templates-dir', tplDir], {
      cwd: tmpRoot,
      env: { ...process.env, HOME: tmpRoot },
      encoding: 'utf8',
      timeout: 5000,
    });
    if (r.status !== 0) return emit(false, `script failed: ${r.stderr || r.stdout}`);
    const outPath = (r.stdout || '').trim();
    const out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const fbMap = Object.fromEntries((out.fallbacks || []).map(f => [f.type, f.fallbackTo]));
    if (fbMap['Sub-bug'] !== 'Bug')  return emit(false, `Sub-bug fallback missing: ${JSON.stringify(out.fallbacks)}`);
    if (fbMap['Sub-task'] !== 'Task') return emit(false, `Sub-task fallback missing: ${JSON.stringify(out.fallbacks)}`);
    if (fbMap['Subtask'] !== 'Task') return emit(false, `Subtask fallback missing: ${JSON.stringify(out.fallbacks)}`);
    if ((out.noneTypes || []).length !== 0) return emit(false, `unexpected noneTypes: ${JSON.stringify(out.noneTypes)}`);
    emit(true, 'all-three-fallbacks-resolved');
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

function helperTemplate() {
  // Shipped Bug.md must exist
  const tplShipped = loadTemplateHeadings('Bug', REPO_ROOT);
  if (tplShipped.source !== 'shipped' || tplShipped.headings.size === 0) {
    return emit(false, `shipped resolution failed: ${JSON.stringify({ source: tplShipped.source, n: tplShipped.headings.size })}`);
  }
  // Build a temp project root with override
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jira-tpl-test-'));
  fs.mkdirSync(path.join(tmpRoot, '.sdlc/jira-templates'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, '.sdlc/jira-templates/Bug.md'),
    '# Override\n## Custom Section\n## Another\n',
    'utf8'
  );
  const tplOverride = loadTemplateHeadings('Bug', tmpRoot);
  if (tplOverride.source !== 'override') {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return emit(false, `override not preferred: ${tplOverride.source}`);
  }
  if (!tplOverride.headings.has('Custom Section') || !tplOverride.headings.has('Another')) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    return emit(false, `override headings missing: ${[...tplOverride.headings].join(',')}`);
  }
  // Missing template
  const tplMiss = loadTemplateHeadings('NoSuchType', REPO_ROOT);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  if (tplMiss.source !== null) return emit(false, `missing should be null, got ${tplMiss.source}`);
  emit(true, `shipped=${tplShipped.headings.size} override=ok missing=null`);
}

const op = arg('--op');
try {
  switch (op) {
    case 'helper-placeholder':    helperPlaceholder(); break;
    case 'helper-template':       helperTemplate(); break;
    case 'helper-template-fallback': helperTemplateFallback(); break;
    default:
      console.log(`RESULT: FAIL unknown op "${op}"`);
      process.exitCode = 2;
  }
} catch (e) {
  console.log(`RESULT: FAIL ${op}: ${e && e.message}`);
  process.exitCode = 1;
}
