#!/usr/bin/env node
/**
 * mcp-failure.js — deterministic MCP failure classifier, telemetry writer,
 * and analyze-then-confirm synthesizer for jira-sdlc.
 *
 * Implements docs/specs/jira-sdlc.md R26 (classifier), R27 (telemetry),
 * R28 (analyze-then-confirm dispatch).
 *
 * Exports:
 *   classify(signal)           -> class string
 *   appendTelemetry(failure)   -> void
 *   analyzeForDispatch(failure)-> proposal object
 *   recordOccurrence(cls,key)  -> current count
 *   resolveLogPath(root)       -> absolute path to learnings log
 *
 * CLI entrypoint (if require.main === module):
 *   node mcp-failure.js --classify [--http-status N] [--error-msg X] [--hook-deny Y] [--r-path Z] [--tool T]
 *   node mcp-failure.js --telemetry --class X --tool T --site S --project P --error E --recovered R
 *   node mcp-failure.js --analyze [--record] [--step S] [--operation O] --class X --tool T --site S --project P --error E --recovered R [--r-path Z]
 *
 * Exit codes:
 *   0 — success
 *   1 — --classify produced "unknown" with no other signal (used by exec tests)
 *   2 — argument / IO error
 */

'use strict';

const fs      = require('node:fs');
const path    = require('node:path');
const crypto  = require('node:crypto');
const os      = require('node:os');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Dependency resolution (plugin-tree aware; mirrors other lib helpers)
// ---------------------------------------------------------------------------
const LIB = path.join(__dirname);
const { resolveSdlcRoot } = require(path.join(LIB, 'config'));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Closed set of failure classes (R26). */
const CLASSES = ['transport', 'auth', 'schema', 'workflow', 'hook-block', 'link-verification', 'unknown'];

/** Repository the failure report is filed to (same as error-report-sdlc). */
const REPORT_REPO = 'rnagrodzki/sdlc-marketplace';

/** GitHub failure classes (github-sdlc R31). */
const GH_CLASSES = ['transport', 'auth', 'permission', 'rate-limit', 'not-found', 'validation', 'capability', 'link-verification', 'unknown'];

/** Per-source settings (P14); jira keeps today's behaviour. */
const SOURCES = {
  jira: { classes: CLASSES, labels: ['tooling-error', 'jira-sdlc'] },
  github: {
    classes: GH_CLASSES,
    envClasses: ['auth', 'permission', 'rate-limit', 'not-found', 'transport', 'capability'],
    labels: ['tooling-error', 'github-sdlc'],
    titlePrefix: 'gh-failure',
  },
};

/** Map any value outside the source's closed class set to 'unknown'. */
function normalizeClass(value, source = 'jira') {
  const c = String(value || 'unknown');
  return SOURCES[source].classes.includes(c) ? c : 'unknown';
}

/** POSIX single-quote a value for a shell command line. */
function sq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/** Redactor patterns — must run before any persistence or presentation. */
const REDACTORS = [
  { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{1,255}\b/g,      sub: '[REDACTED]' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{1,255}\b/g,                  sub: '[REDACTED]' },
  { re: /Bearer [A-Za-z0-9._-]+/g,                              sub: 'Bearer [REDACTED]' },
  // Raw JWT (3 base64url segments separated by `.`) — must run before Bearer pattern
  // would have matched it, and catches JWTs that appear without a "Bearer " prefix
  // (e.g., in WWW-Authenticate headers or error bodies).
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, sub: '[jwt:REDACTED]' },
  { re: /cookie:[^;\n]+/gi,                                      sub: 'cookie:[REDACTED]' },
  { re: /(?:cloudId|cloud_id)[=:\s"']+([0-9a-f-]{30,})/gi,     sub: (_, id) => `cloudId=[REDACTED:${id.slice(0,6)}…]` },
  { re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, sub: '[email:REDACTED]' },
];

// ---------------------------------------------------------------------------
// resolveLogPath — canonical learnings log path with legacy fallback
// ---------------------------------------------------------------------------

/**
 * @param {string} [root] — project root (defaults to resolveSdlcRoot())
 * @returns {string} absolute path to .sdlc/learnings/log.md (creates dirs)
 */
function resolveLogPath(root) {
  const projectRoot = root || resolveSdlcRoot();
  const canonical   = path.join(projectRoot, '.sdlc', 'learnings', 'log.md');
  const legacy      = path.join(projectRoot, '.claude', 'learnings', 'log.md');
  // Prefer canonical; fall back if canonical dir is not writable
  try {
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    return canonical;
  } catch (_) {
    return legacy;
  }
}

// ---------------------------------------------------------------------------
// redact — apply all redactor patterns to a string
// ---------------------------------------------------------------------------

function redact(str) {
  if (typeof str !== 'string') return str;
  let s = str;
  for (const { re, sub } of REDACTORS) {
    s = s.replace(re, sub);
  }
  return s;
}

// ---------------------------------------------------------------------------
// classify(signal) — deterministic, no LLM, no network (R26)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   httpStatus?: number,
 *   errorMessage?: string,
 *   hookDenyReason?: string,
 *   rPath?: string,
 *   toolName?: string
 * }} signal
 * @returns {string} one of CLASSES
 */
function classify(signal = {}) {
  const { httpStatus, errorMessage = '', hookDenyReason = '', rPath = '' } = signal;
  const msg  = String(errorMessage || '');
  const deny = String(hookDenyReason || '');
  const rp   = String(rPath || '');

  // Priority order matters — most specific first
  // hook-block: deny reason prefixes indicating PreToolUse hook denial (R17/R20/R21 paths)
  if (deny && /R2[01]/.test(deny)) return 'hook-block';
  // schema: deny reason prefixes indicating content/placeholder/template violations
  if (deny && /R19|C13|R18|R25|G15/.test(deny)) return 'schema';
  if (rp === 'R22') return 'link-verification';

  if (httpStatus === 401 || /cloudId|namespace|unauthorized/i.test(msg)) return 'auth';
  if (httpStatus === 403) return 'auth';
  if (httpStatus === 400 && /transition|workflow|invalid status/i.test(msg)) return 'workflow';
  if (httpStatus === 400) return 'schema';
  if (httpStatus >= 500 || /ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg)) return 'transport';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// appendTelemetry(failure) — structured 5-line block append (R27)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   class: string,
 *   tool: string,
 *   site: string,
 *   project: string,
 *   error: string,
 *   recovered: string
 * }} failure
 * @param {string} [root] — optional project root override
 */
function oneLine(value) {
  // CR, LF, other C0/C1 control characters and U+2028/2029 would start a new log line (A09).
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ');
}

function appendTelemetry(failure, root, source = 'jira') {
  const today   = new Date().toISOString().slice(0, 10);
  if (source === 'github') {
    const cls       = normalizeClass(failure.class, source);
    const operation = redact(oneLine(failure.operation || ''));
    const block = [
      `## ${today} — github-sdlc gh-failure[${cls}]: ${operation}`,
      `- operation: ${operation}`,
      `- repo: ${redact(oneLine(failure.repo || ''))}`,
      `- class: ${cls}`,
      `- error: ${redact(oneLine(failure.error || '').slice(0, 300))}`,
      `- recovered: ${oneLine(failure.recovered || 'no')}`,
      '',
    ].join('\n');
    const logPath = resolveLogPath(root);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, block, 'utf8');
    return block;
  }
  const cls     = normalizeClass(failure.class);
  const tool    = redact(oneLine(failure.tool    || ''));
  const site    = redact(oneLine(failure.site    || ''));
  const project = redact(oneLine(failure.project || ''));
  const error   = redact(oneLine(failure.error   || '').slice(0, 300));
  const recovered = oneLine(failure.recovered || 'no');

  const logPath = resolveLogPath(root);
  const heading = `## ${today} — jira-sdlc mcp-failure[${cls}]: ${tool}`;
  const block   = [
    heading,
    `tool: ${tool}`,
    `site: ${site}`,
    `project: ${project}`,
    `error: ${error}`,
    `recovered: ${recovered}`,
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, block, 'utf8');
  return block;
}

// ---------------------------------------------------------------------------
// recordOccurrence(cls, key) — per-session on-disk counter (KD7)
// ---------------------------------------------------------------------------

/**
 * Resolve a stable session identifier for the current SKILL invocation.
 *
 * Resolution order:
 *   1. `SDLC_SESSION_ID` env var (explicit caller intent, most reliable).
 *   2. A marker file under the project's sdlc root containing a UUID written
 *      on first call and reused thereafter. This is stable across separate
 *      `node mcp-failure.js` invocations even when each runs in a fresh
 *      shell (so `process.ppid` differs per invocation) — which is the
 *      normal case for SKILL.md bash blocks executed by claude-cli.
 *   3. Fallback to `process.ppid`/`process.pid` when no writable root exists.
 *
 * The marker file is intentionally per-project (keyed by sdlc root) rather
 * than per-shell so the R28 "twice in one invocation" contract works across
 * the multiple bash blocks a skill emits during one user turn.
 *
 * @param {string} [root] — optional project root override
 * @returns {string} session id
 */
function resolveSessionId(root) {
  if (process.env.SDLC_SESSION_ID) return process.env.SDLC_SESSION_ID;
  try {
    const projectRoot = root || resolveSdlcRoot();
    const markerDir   = path.join(projectRoot, '.sdlc', 'state');
    const marker      = path.join(markerDir, 'mcp-session.id');
    if (fs.existsSync(marker)) {
      const existing = fs.readFileSync(marker, 'utf8').trim();
      if (existing) return existing;
    }
    fs.mkdirSync(markerDir, { recursive: true });
    const id = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(marker, id, 'utf8');
    return id;
  } catch (_) {
    // sdlc root unavailable or read-only — fall back to ppid (best-effort)
    return String(process.ppid || process.pid);
  }
}

/**
 * Increments a per-session counter and returns the post-increment count.
 * Persists across CLI re-spawns within one SKILL invocation. The session
 * is identified by `resolveSessionId()` — see that function for details
 * on how stability across separate shells is achieved.
 * @param {string} cls — failure class
 * @param {string} key — arbitrary key (e.g. hook-hash, tool name)
 * @param {string} [root] — optional project root override
 * @returns {number} current count after increment
 */
function recordOccurrence(cls, key, root) {
  const sessionId = resolveSessionId(root);
  const hash      = crypto.createHash('sha1').update(`${cls}:${key}`).digest('hex');
  const dir       = path.join(os.tmpdir(), `sdlc-mcp-session-${sessionId}`);
  const file      = path.join(dir, `${cls}-${hash}.count`);

  fs.mkdirSync(dir, { recursive: true });

  let count = 0;
  try {
    count = parseInt(fs.readFileSync(file, 'utf8').trim(), 10) || 0;
  } catch (_) { /* first call — file doesn't exist yet */ }

  count += 1;
  fs.writeFileSync(file, String(count), 'utf8');
  return count;
}

// ---------------------------------------------------------------------------
// analyzeGithub(failure) — github-sdlc R26 proposal (P14)
// ---------------------------------------------------------------------------

function analyzeGithub(failure) {
  const cfg       = SOURCES.github;
  const cls       = normalizeClass(failure.class, 'github');
  const operation = redact(String(failure.operation || ''));
  const repo      = redact(String(failure.repo || ''));
  const error     = redact(String(failure.error || '').replace(/\n/g, ' ').slice(0, 300));

  // Environment classes: user message only, no search, no proposal (R26).
  if (cfg.envClasses.includes(cls)) {
    return { shouldDispatch: false, duplicate: null, proposal: null, action: 'none' };
  }

  const prefix = `${cfg.titlePrefix}[${cls}]`;
  let duplicate = null;
  try {
    const ghRes = spawnSync(
      'gh',
      ['issue', 'list', '-R', REPORT_REPO,
       '--state', 'open',
       '--label', cfg.labels[0], '--label', cfg.labels[1],
       '--search', prefix,
       '--json', 'number,title,body,url'],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, shell: false, encoding: 'utf8' }
    );
    if (ghRes.status === 0 && ghRes.stdout) {
      const issues = JSON.parse(ghRes.stdout.trim() || '[]');
      const hit = issues.find((i) => String(i.title || '').includes(`${prefix}:`));
      if (hit) duplicate = { number: hit.number, url: hit.url };
    }
  } catch (_) { /* gh unavailable or network failure — not fatal */ }

  const title = `${prefix}: ${operation} on ${repo}`;
  const body = [
    '## Classification',
    `- **Class**: \`${cls}\``,
    '## Observed failure',
    `- **Operation**: \`${operation}\``,
    `- **Repository**: ${repo}`,
    `- **Error**: ${error}`,
    '## Root-cause hypothesis',
    `${cls}-class failure on \`${operation}\`.`,
  ].join('\n');

  return {
    shouldDispatch: true,
    duplicate,
    proposal: { title, body },
    action: duplicate ? 'show-duplicate' : 'create',
  };
}

// ---------------------------------------------------------------------------
// analyzeForDispatch(failure) — synthesize R28 proposal
// ---------------------------------------------------------------------------

/**
 * Synthesizes an R28 dispatch proposal. Combines local context (telemetry
 * log scan, template rendering) with a duplicate-detection lookup.
 *
 * @remarks **Network side effect.** This function invokes the `gh` CLI
 * (`gh issue list -R rnagrodzki/sdlc-marketplace --label tooling-error --label jira-sdlc`) which performs an HTTPS call to
 * github.com. The lookup is bounded by a 10-second timeout and failures
 * are swallowed (duplicate is set to `null`). Callers running in offline
 * or hermetic CI contexts should be aware that the network call still
 * happens and may delay the function by up to the timeout. An offline
 * mode is not currently exposed.
 *
 * @param {{
 *   class: string,
 *   tool: string,
 *   site: string,
 *   project: string,
 *   error: string,
 *   recovered: string,
 *   sessionRecurrence?: number
 * }} failure
 * @param {string} [root] — optional project root override
 * @returns {{
 *   shouldDispatch: boolean,
 *   duplicate: number|null,
 *   proposal: { title: string, body: string },
 *   action: "create"|"comment"
 * }}
 */
function analyzeForDispatch(failure, root, source = 'jira') {
  if (source === 'github') return analyzeGithub(failure);
  const cls     = normalizeClass(failure.class);
  const tool    = redact(String(failure.tool    || ''));
  const site    = redact(String(failure.site    || ''));
  const project = redact(String(failure.project || ''));
  const error   = redact(String(failure.error   || '').replace(/\n/g, ' ').slice(0, 300));
  const rPath   = String(failure.rPath || '');
  const projectRoot = root || resolveSdlcRoot();

  // Prior occurrence count from learnings log
  let priorCount = 0;
  try {
    const logPath = resolveLogPath(projectRoot);
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      const pattern = new RegExp(`mcp-failure\\[${cls}\\]: ${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      const matches = content.match(pattern);
      priorCount = matches ? matches.length : 0;
    }
  } catch (_) { /* non-fatal */ }

  // Duplicate detection via gh CLI (KD6).
  // Use spawnSync with an argument array (no shell) to prevent injection via
  // adversarial tool names containing backticks, $(...), or unbalanced quotes.
  let duplicate = null;
  let action    = 'create';
  try {
    const ghRes = spawnSync(
      'gh',
      ['issue', 'list', '-R', REPORT_REPO,
       '--state', 'open',
       '--label', 'tooling-error', '--label', 'jira-sdlc',
       '--search', tool,
       '--json', 'number,title,body'],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, shell: false, encoding: 'utf8' }
    );
    if (ghRes.status === 0 && ghRes.stdout) {
      const issues = JSON.parse(ghRes.stdout.trim() || '[]');
      for (const issue of issues) {
        // Anchor on the ` on ` the template renders after the tool name, so a
        // tool name that is a prefix of a longer one does not match.
        const marker = `mcp-failure[${cls}]: ${tool} on `;
        if (`${issue.title || ''}\n${issue.body || ''}`.includes(marker)) {
          duplicate = issue.number;
          action    = 'comment';
          break;
        }
      }
    }
  } catch (_) { /* gh CLI unavailable or network failure — not fatal */ }

  // Load template
  const templatePath = path.join(
    __dirname, '..', '..', 'skills', 'jira-sdlc', 'templates', 'McpFailure.md'
  );
  let templateContent = '';
  try {
    templateContent = fs.readFileSync(templatePath, 'utf8');
  } catch (_) {
    // Fallback minimal template
    templateContent = [
      'mcp-failure[{CLASS}]: {TOOL} on {SITE}',
      '## Classification',
      '- **Class**: `{CLASS}`',
      '- **R-path**: {R_PATH}',
      '## Observed failure',
      '- **Tool**: `{TOOL}`',
      '- **Site**: {SITE}',
      '- **Project**: {PROJECT}',
      '- **Error**: {ERROR}',
      '## Prior occurrences',
      '- **Count**: {PRIOR_COUNT}',
      '- **Duplicate**: {DUPLICATE_HINT}',
      '## Root-cause hypothesis',
      '{CLASS}-class failure on `{TOOL}`.',
      '## Relevant references',
      '- SKILL.md callsite: {R_PATH}',
    ].join('\n');
  }

  const duplicateHint = duplicate
    ? `#${duplicate} (open) — propose comment rather than new issue`
    : 'none found';

  const values = { CLASS: cls, TOOL: tool, SITE: site, PROJECT: project, ERROR: error,
    R_PATH: rPath || 'unknown', PRIOR_COUNT: String(priorCount), DUPLICATE_HINT: duplicateHint };
  const body = templateContent.replace(
    /\{(CLASS|TOOL|SITE|PROJECT|ERROR|R_PATH|PRIOR_COUNT|DUPLICATE_HINT)\}/g, (_, k) => values[k]);

  const title = `mcp-failure[${cls}]: ${tool} on ${site}`;

  return {
    shouldDispatch: true,
    duplicate,
    proposal: { title, body },
    action,
  };
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  classify,
  appendTelemetry,
  analyzeForDispatch,
  recordOccurrence,
  resolveLogPath,
  resolveSessionId,
  redact,
  GH_CLASSES,
};

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

if (require.main === module) {
  const argv = process.argv.slice(2);

  function getArg(name) {
    const idx = argv.indexOf(`--${name}`);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  }

  function hasFlag(name) {
    return argv.includes(`--${name}`);
  }

  // ---- --classify
  if (hasFlag('classify')) {
    const httpStatus  = getArg('http-status')  != null ? Number(getArg('http-status')) : undefined;
    const errorMsg    = getArg('error-msg')    || '';
    const hookDeny    = getArg('hook-deny')    || '';
    const rPath       = getArg('r-path')       || '';
    const toolName    = getArg('tool')         || '';

    const result = classify({ httpStatus, errorMessage: errorMsg, hookDenyReason: hookDeny, rPath, toolName });
    process.stdout.write(result + '\n');
    // Exit 1 when unknown with no signal — exec tests assert "unknown" is reachable
    process.exit(result === 'unknown' ? 1 : 0);
  }

  // ---- --telemetry
  if (hasFlag('telemetry')) {
    const cls       = getArg('class')     || 'unknown';
    const tool      = getArg('tool')      || '';
    const site      = getArg('site')      || '';
    const project   = getArg('project')   || '';
    const error     = getArg('error')     || '';
    const recovered = getArg('recovered') || 'no';

    try {
      const block = getArg('source') === 'github'
        ? appendTelemetry({ class: cls, operation: getArg('operation') || '', repo: getArg('repo') || '', error, recovered }, undefined, 'github')
        : appendTelemetry({ class: cls, tool, site, project, error, recovered });
      process.stdout.write(block);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`mcp-failure --telemetry error: ${err.message}\n`);
      process.exit(2);
    }
  }

  // ---- --analyze
  if (hasFlag('analyze') && getArg('source') === 'github') {
    const cls       = normalizeClass(getArg('class'), 'github');
    const operation = getArg('operation') || '';
    const repo      = getArg('repo')      || '';
    const error     = getArg('error')     || '';
    const recovered = getArg('recovered') || 'no';
    const step      = getArg('step')      || '';

    try {
      const failure = { class: cls, operation, repo, error, recovered };
      if (hasFlag('record')) process.stderr.write(appendTelemetry(failure, undefined, 'github'));
      const result = analyzeForDispatch(failure, undefined, 'github');
      const p = result.proposal;
      const out = {
        shouldDispatch:  result.shouldDispatch,
        duplicate:       result.duplicate,
        proposal:        p,
        action:          result.action,
        proposalTitle:   p ? p.title : null,
        proposalText:    p ? `${p.title}\n\n${p.body}` + (result.duplicate
          ? `\n\nAn open issue ${result.duplicate.url} already tracks this failure class; it is shown instead of filing a new issue.`
          : '') : null,
        errorReportArgs: p ? `--error-type gh-${cls} --skill github-sdlc --step ${sq(step)} --operation ${sq(operation)}` : null,
        labels:          SOURCES.github.labels,
        errorText:       p ? p.body : redact(error.replace(/\n/g, ' ').slice(0, 300)),
      };
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`mcp-failure --analyze error: ${err.message}\n`);
      process.exit(2);
    }
  }

  if (hasFlag('analyze')) {
    const cls       = normalizeClass(getArg('class'));
    const tool      = getArg('tool')      || '';
    const site      = getArg('site')      || '';
    const project   = getArg('project')   || '';
    const error     = getArg('error')     || '';
    const recovered = getArg('recovered') || 'no';
    const rPath     = getArg('r-path')    || '';

    const step      = getArg('step')      || rPath;
    const operation = getArg('operation') || tool;

    try {
      if (hasFlag('record')) {
        process.stderr.write(appendTelemetry({ class: cls, tool, site, project, error, recovered }));
      }
      const result = analyzeForDispatch({ class: cls, tool, site, project, error, recovered, rPath });
      const { title, body } = result.proposal;
      // Stable key order
      const out = {
        shouldDispatch:  result.shouldDispatch,
        duplicate:       result.duplicate,
        proposal:        result.proposal,
        action:          result.action,
        proposalTitle:   title,
        proposalText:    `${title}\n\n${body}` + (result.duplicate != null
          ? `\n\nAn open issue #${result.duplicate} already tracks this failure class; the proposed action is to comment on it instead of filing a new issue.`
          : ''),
        errorReportArgs: `--error-type mcp-${cls} --skill jira-sdlc --step ${sq(step)} --operation ${sq(operation)}`,
        labels:          ['tooling-error', 'jira-sdlc'],
        errorText:       body,
      };
      process.stdout.write(JSON.stringify(out) + '\n');
      process.exit(0);
    } catch (err) {
      process.stderr.write(`mcp-failure --analyze error: ${err.message}\n`);
      process.exit(2);
    }
  }

  // ---- --record-occurrence
  if (hasFlag('record-occurrence')) {
    const cls = getArg('class') || 'unknown';
    const key = getArg('key')   || '';
    const count = recordOccurrence(cls, key);
    process.stdout.write(String(count) + '\n');
    process.exit(0);
  }

  process.stderr.write('Usage: node mcp-failure.js --classify|--telemetry|--analyze|--record-occurrence [args]\n');
  process.exit(2);
}
