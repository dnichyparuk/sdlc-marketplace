#!/usr/bin/env node
/**
 * github.js
 * Prepare script for the github-sdlc skill (spec docs/specs/github-sdlc.md).
 * Every `gh` call of the skill runs here (R25).
 *
 * Usage:
 *   node github.js <--check|--refresh|--load|--clear|--view <n>|--search|--validate-links|--check-payload|--apply>
 *                  [--repo <[HOST/]OWNER/REPO>] [--force-refresh] [--skip-projects]
 *                  [--sections <csv>] [--auto] [--query-file <p>] [--file <p>] [--input <p>]
 *                  [--dry-run] [--expect-hash <h>] [--output-file [<p>]] [--skip-config-check]
 *
 * Subcommands (one; default --check):
 *   --check   Resolve the repository (R1, R3), probe auth and pick the acting account (P3, R30),
 *             report the cache status (P4), config (R4) and flags (P6).
 *   --refresh Build the cache sections (all, or --sections <csv>) with gh calls and save the
 *             cache atomically (R5, R11, R29, P7); --skip-projects reads no Projects v2 data.
 *   --load    Print the full cache of the target repository (P8).
 *   --clear   Delete the cache file of the target repository (P15).
 *   --view <n> Read an issue with links, project values and recent comments (R22, R24, P9).
 *   --search   Search issues with the query in --query-file (R22, A13, P10).
 *   --validate-links --file <path>: existence-only check of the links in a file (P12).
 *   --init-templates [--templates-dir <p>]: copy default issue templates into .github/ISSUE_TEMPLATE/ (R10).
 *   --check-payload --input <p>: check one write payload or a bulk { ops } against P16, the cache and the
 *             R37 live reads, and report the commands --apply would run, the R36 hash and the R34 class (P11).
 *   --apply --input <p> [--dry-run] [--expect-hash <h>] [--auto]: re-check the payload (G7, R36) and run its
 *             commands in order, each op after a fresh R37 live check (P13); --dry-run lists them only.
 *
 * Output (P17): `--output-file <p>` writes the JSON to <p> and prints nothing; a bare
 * `--output-file` uses writeOutput (prints the manifest path); otherwise JSON on stdout.
 * Exit codes: 0 ok, 1 handled finding or error (including invalid arguments), 2 crash.
 * Uses only Node.js built-in modules.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LIB = path.join(__dirname, '..', 'lib');

const { writeOutput } = require(path.join(LIB, 'output'));
const {
  execGh, selectGhAccountForTarget, recoverGhAccountForTarget, ghTokenEnv, probeGhAuth, parseRemoteOwner,
  formatAccessDenied,
} = require(path.join(LIB, 'git'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { resolveSdlcRoot, readSection } = require(path.join(LIB, 'config'));
const { redact, appendTelemetry } = require(path.join(LIB, 'mcp-failure'));
const { validateLinks, formatViolations } = require(path.join(LIB, 'links'));
const { parseMarkdownTemplate, parseIssueForm, parseTemplateConfig } = require(path.join(LIB, 'github-templates'));
const {
  findPlaceholders, checkHeadings, findMentions, findRefs, findDuplicateMarker, checkTitle, checkAcceptance,
} = require(path.join(LIB, 'github-content'));

// Tuning constants (docs/cost-tiers.md); later subcommands read them.
const TITLE_MAX = 120;
const VIEW_COMMENTS_MAX = 20;
const SEARCH_LIMIT_MAX = 50;
const BULK_MAX = 20;
// R4: must equal the keys and the cacheMaxAgeHours default of `githubSection` in the schema.
const GITHUB_CONFIG_KEYS = ['defaultRepo', 'repos', 'projects', 'cacheMaxAgeHours'];
const CACHE_MAX_AGE_HOURS_DEFAULT = 0;
const CACHE_SECTIONS = ['labels', 'milestones', 'assignableUsers', 'issueTemplates', 'issueTypes', 'projects', 'capabilities'];
// R5: every key of a cache file, in the order --refresh writes them.
const CACHE_KEYS = ['schemaVersion', 'fetchedAt', 'fetchedBy', 'repo', 'labels', 'milestones', 'assignableUsers',
  'issueTemplates', 'templateConfig', 'issueTypes', 'projects', 'capabilities'];
const CACHE_SCHEMA_VERSION = 1;
// R-templates-root: shipped default templates (R11 step 3); empty while the directory is absent.
const SHIPPED_TEMPLATES_DIR = path.join(__dirname, '..', '..', 'skills', 'github-sdlc', 'templates');
const TEMPLATE_DIR = '.github/ISSUE_TEMPLATE';
const TEMPLATE_FILE_RE = /^[A-Za-z0-9._-]+\.(md|ya?ml)$/i;
const TEMPLATE_CONFIG_RE = /^config\.ya?ml$/i;
const RAW_ACCEPT = '--header=Accept: application/vnd.github.raw';

// GraphQL documents of --refresh (R8: the only metadata reader).
const Q_ASSIGNABLE = 'query($owner:String!,$name:String!,$cursor:String){repository(owner:$owner,name:$name){'
  + 'assignableUsers(first:100,after:$cursor){nodes{login name}pageInfo{hasNextPage endCursor}}}}';
const Q_ISSUE_TYPES = 'query($owner:String!){repositoryOwner(login:$owner){'
  + '...on Organization{issueTypes(first:100){nodes{id name}}}}}';
const Q_PROJECT = 'query($owner:String!,$number:Int!){repositoryOwner(login:$owner){...on ProjectV2Owner{'
  + 'projectV2(number:$number){id number title fields(first:100){nodes{'
  + '...on ProjectV2FieldCommon{id name dataType}'
  + '...on ProjectV2SingleSelectField{options{id name}}'
  + '...on ProjectV2IterationField{configuration{iterations{id title startDate duration}}}}}}}}}';
const Q_ISSUE_FIELDS = 'query{__type(name:"Issue"){fields{name}}}';

const OUTPUT_PREFIX = 'github-context';
const DEFAULT_HOST = 'github.com';
const GH_MISSING = 'gh CLI not found: install it from https://cli.github.com';

// A1 slug grammar.
const HOST_RE = /^[A-Za-z0-9.-]+(:\d+)?$/;
const OWNER_RE = /^[A-Za-z0-9-]+$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

const SUBCOMMANDS = {
  '--check': 'check',
  '--refresh': 'refresh',
  '--load': 'load',
  '--clear': 'clear',
  '--view': 'view',
  '--search': 'search',
  '--validate-links': 'validate-links',
  '--init-templates': 'init-templates',
  '--check-payload': 'check-payload',
  '--apply': 'apply',
};

// The acting account's token (R30): reaches `gh` children only through ghTokenEnv (GH_TOKEN or GH_ENTERPRISE_TOKEN by host), never output.
let ghToken = null;
// Host of the repository being worked on, for host-bound gh calls made outside resolveAuth (R30).
let activeHost = null;
// Output target of emit(): null (stdout), true (writeOutput) or a file path.
let outputTarget = null;

// ---------------------------------------------------------------------------
// Slugs and paths
// ---------------------------------------------------------------------------

/**
 * Parse `[HOST/]OWNER/REPO` by the A1 grammar.
 * @param {string} text
 * @returns {{ host: string, owner: string, name: string, slug: string } | null}
 */
function parseSlug(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split('/');
  if (parts.length < 2 || parts.length > 3) return null;
  const [host, owner, name] = parts.length === 3 ? parts : [DEFAULT_HOST, ...parts];
  if (!HOST_RE.test(host) || !OWNER_RE.test(owner) || !REPO_RE.test(name) || name === '.' || name === '..') {
    return null;
  }
  const lowerHost = host.toLowerCase();
  const slug = lowerHost === DEFAULT_HOST ? `${owner}/${name}` : `${lowerHost}/${owner}/${name}`;
  return { host: lowerHost, owner, name, slug };
}

/** R5 cache file of one repository (every part already validated by parseSlug). */
function cachePath(repo) {
  return path.join(os.homedir(), '.sdlc-cache', 'github', repo.host.toLowerCase().replace(/\./g, '_'),
    repo.owner.toLowerCase(), repo.name.toLowerCase() + '.json');
}

// ---------------------------------------------------------------------------
// Arguments and output
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const errors = [];
  const args = {
    subcommand: null, initTemplates: false, viewNumber: null, repo: null, forceRefresh: false, skipProjects: false,
    sections: null, auto: false, templatesDir: null, queryFile: null, file: null, input: null, outputFile: null,
    dryRun: false, expectHash: null, errors,
  };
  // Value of a flag that requires one; null (and an error) when it is absent.
  const valueAt = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) {
      errors.push(`${flag}: a value is required`);
      return null;
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // `--init-templates` may ride along with `--check` (the skill forwards its arguments to Step 1); alone it is the subcommand.
    if (a === '--init-templates') { args.initTemplates = true; continue; }
    if (Object.prototype.hasOwnProperty.call(SUBCOMMANDS, a)) {
      if (args.subcommand) errors.push(`${a}: only one subcommand is allowed (already --${args.subcommand})`);
      else args.subcommand = SUBCOMMANDS[a];
      if (a === '--view') {
        const v = valueAt(i, a);
        if (v === null) continue;
        i++;
        if (/^[1-9]\d*$/.test(v)) args.viewNumber = Number(v);
        else errors.push(`--view: "${v}" is not a positive issue number`);
      }
      continue;
    }
    switch (a) {
      case '--repo': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        args.repo = parseSlug(v);
        if (!args.repo) errors.push(`--repo: "${v}" is not a valid [HOST/]OWNER/REPO slug`);
        break;
      }
      case '--sections': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        args.sections = v.split(',').map((s) => s.trim()).filter(Boolean);
        const bad = args.sections.filter((s) => !CACHE_SECTIONS.includes(s));
        if (bad.length) errors.push(`--sections: unknown section(s) ${bad.join(', ')} (allowed: ${CACHE_SECTIONS.join(', ')})`);
        if (args.sections.length === 0) errors.push('--sections: a value is required');
        break;
      }
      case '--templates-dir': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        args.templatesDir = v;
        break;
      }
      case '--query-file':
      case '--file':
      case '--input': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        if (a === '--file') args.file = v;
        else if (a === '--input') args.input = v;
        else args.queryFile = v;
        break;
      }
      case '--expect-hash': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        if (/^[0-9a-f]{64}$/.test(v)) args.expectHash = v;
        else errors.push(`--expect-hash: "${v}" is not a sha256 hex digest`);
        break;
      }
      case '--dry-run': args.dryRun = true; break;
      case '--output-file': {
        const v = argv[i + 1];
        if (v !== undefined && !v.startsWith('--')) { args.outputFile = v; i++; } else args.outputFile = true;
        break;
      }
      case '--force-refresh': args.forceRefresh = true; break;
      case '--skip-projects': args.skipProjects = true; break;
      case '--auto': args.auto = true; break;
      case '--skip-config-check': break; // read by resolveSkipConfigCheck (CLI > env > default)
      default: errors.push(`${a}: unknown flag`);
    }
  }
  if (args.initTemplates) {
    if (!args.subcommand) args.subcommand = 'init-templates';
    else if (args.subcommand !== 'check') errors.push(`--init-templates: only one subcommand is allowed (already --${args.subcommand})`);
  }
  args.subcommand = args.subcommand || 'check';
  return args;
}

/** P17: write `data` to the chosen target and set the exit code. */
function emit(data, exitCode) {
  const text = JSON.stringify(data, null, 2) + '\n';
  if (typeof outputTarget === 'string') fs.writeFileSync(outputTarget, text);
  else if (outputTarget === true) writeOutput(data, OUTPUT_PREFIX, exitCode);
  else process.stdout.write(text);
  process.exitCode = exitCode;
}

// ---------------------------------------------------------------------------
// Config (R4) and repository resolution (R1, R3)
// ---------------------------------------------------------------------------

/** R4: the `github` block with defaults applied, plus key and slug errors. */
function resolveGithubConfig(section) {
  const errors = [];
  const isObject = section !== null && typeof section === 'object' && !Array.isArray(section);
  if (section !== null && section !== undefined && !isObject) errors.push('github: must be an object');
  const raw = isObject ? section : {};
  for (const key of Object.keys(raw)) {
    if (!GITHUB_CONFIG_KEYS.includes(key)) errors.push(`github.${key}: unknown key (allowed: ${GITHUB_CONFIG_KEYS.join(', ')})`);
  }
  const github = {
    defaultRepo: raw.defaultRepo ?? null,
    repos: raw.repos ?? [],
    projects: raw.projects ?? [],
    cacheMaxAgeHours: raw.cacheMaxAgeHours ?? CACHE_MAX_AGE_HOURS_DEFAULT,
  };
  if (github.defaultRepo !== null && !parseSlug(github.defaultRepo)) {
    errors.push(`github.defaultRepo: "${github.defaultRepo}" is not a valid [HOST/]OWNER/REPO slug`);
  }
  if (!Array.isArray(github.repos)) errors.push('github.repos: must be an array of slugs');
  else {
    for (const r of github.repos) {
      if (!parseSlug(r)) errors.push(`github.repos: "${r}" is not a valid [HOST/]OWNER/REPO slug`);
    }
  }
  if (!Array.isArray(github.projects)) errors.push('github.projects: must be an array of { owner, number }');
  if (typeof github.cacheMaxAgeHours !== 'number' || !(github.cacheMaxAgeHours >= 0)) {
    errors.push('github.cacheMaxAgeHours: must be a number >= 0');
  }
  return { github, errors };
}

/** Hosts `gh auth status` lists (R3); empty when gh is missing or answers nothing usable. */
function ghListedHosts() {
  const r = gh(['auth', 'status', '--json=hosts']);
  try {
    return Object.keys(JSON.parse(r.stdout).hosts || {}).map((h) => h.toLowerCase());
  } catch (_) {
    return [];
  }
}

/** R1 steps 1-3 (+ R3 host normalisation); step 4 reported as candidateRepos. */
function resolveRepo(projectRoot, args, config) {
  const warnings = [];
  const errors = [];
  const done = (repo, source, candidateRepos = []) => ({
    repo: { ...repo, source }, candidateRepos, warnings, errors,
  });
  if (args.repo) return done(args.repo, 'flag');
  if (config.defaultRepo) return done(parseSlug(config.defaultRepo), 'config');

  const origin = parseRemoteOwner(projectRoot);
  if (origin) {
    let host = origin.host.toLowerCase();
    if (host !== DEFAULT_HOST && !ghListedHosts().includes(host)) {
      warnings.push(`origin host "${origin.host}" is not a host gh lists (an SSH alias?); using ${DEFAULT_HOST}`);
      host = DEFAULT_HOST;
    }
    const text = `${host}/${origin.owner}/${origin.repo}`;
    const parsed = parseSlug(text);
    if (parsed) return done(parsed, 'origin');
    errors.push(`origin: "${text}" is not a valid [HOST/]OWNER/REPO slug`);
  }
  const none = { host: null, owner: null, name: null, slug: null };
  return done(none, 'none', config.repos.length >= 2 ? [...config.repos] : []);
}

// ---------------------------------------------------------------------------
// Auth (P3, R20, R30, E3, E11)
// ---------------------------------------------------------------------------

/** Run `gh` with the acting account's token, when one was selected. */
function gh(args) {
  // F10: a token never reaches a host other than the one it was selected for.
  const hostArg = args.find((a) => typeof a === 'string' && a.startsWith('--hostname='));
  const callHost = hostArg ? hostArg.slice('--hostname='.length).toLowerCase() : null;
  const foreign = callHost && activeHost && callHost !== String(activeHost).toLowerCase();
  return execGh(args, { env: foreign ? ghTokenEnv(callHost, null) : ghTokenEnv(activeHost, ghToken) });
}

function scopesFrom(tokenScopes) {
  if (!Array.isArray(tokenScopes)) return { project: null, readProject: null };
  const project = tokenScopes.includes('project');
  return { project, readProject: project || tokenScopes.includes('read:project') };
}

/**
 * P3: probe auth for the repository host, select the acting account (never `gh auth switch`)
 * and probe repository access. A repository with source `none` gets the probe only.
 */
function resolveAuth(repo) {
  const host = repo.host || DEFAULT_HOST;
  activeHost = host;
  const warnings = [];
  const errors = [];
  const auth = {
    authenticated: false, activeAccount: null, actingAccount: null, expired: false, timedOut: false,
    scopes: { project: null, readProject: null }, repoAccessible: null,
    accountSwitch: { switched: false, account: null, previousAccount: null, reason: null },
  };
  const result = () => ({ auth, warnings, errors });

  const version = gh(['--version']);
  if (!version.ok && version.status === null && !version.timedOut) {
    errors.push(GH_MISSING);
    return result();
  }

  const probe = probeGhAuth({ host });
  if (!probe.authenticated) {
    let { expired, timedOut, errorMessage } = probe;
    // probeGhAuth sees only "no output" when `gh auth status` exits non-zero; read the text to tell
    // an expired or invalid token from a logged-out host (E3).
    if (!expired && !timedOut) {
      const status = gh(['auth', 'status', '--hostname', host]);
      if (status.timedOut) {
        timedOut = true;
        errorMessage = `gh auth status timed out for ${host}. Check the network and gh, then retry.`;
      } else if (/expired|invalid/i.test(`${status.stdout}\n${status.stderr}`)) {
        expired = true;
        errorMessage = `gh token for ${host} has expired. Run: gh auth refresh --hostname ${host}`;
      }
    }
    auth.expired = expired;
    auth.timedOut = timedOut;
    errors.push(errorMessage);
    return result();
  }

  auth.authenticated = true;
  auth.activeAccount = probe.activeAccount;
  auth.actingAccount = probe.activeAccount;
  auth.scopes = scopesFrom(probe.tokenScopes);
  if (!repo.slug) return result();

  const sel = selectGhAccountForTarget({ host, owner: repo.owner, repo: repo.name });
  if (sel.warning) warnings.push(sel.warning);
  ghToken = sel.token;
  if (sel.activeAccount) auth.activeAccount = sel.activeAccount;
  if (sel.actingAccount) auth.actingAccount = sel.actingAccount;
  auth.accountSwitch = sel.accountSwitch;
  // The scopes gh reported belong to the active account; a per-process token has unknown scopes (R20).
  if (ghToken) auth.scopes = { project: null, readProject: null };

  const access = gh(['api', `repos/${repo.owner}/${repo.name}`, `--hostname=${host}`, '--silent']);
  auth.repoAccessible = access.ok;
  if (!access.ok) {
    if (access.timedOut) {
      auth.timedOut = true;
      errors.push(`gh api repos/${repo.owner}/${repo.name} timed out for ${host}. Check the network and gh, then retry.`);
    } else {
      errors.push(formatAccessDenied({
        activeAccount: auth.actingAccount, owner: repo.owner, repo: repo.name, suggestedAccounts: [],
      }));
    }
  }
  return result();
}

// ---------------------------------------------------------------------------
// Cache (R5, R6, G1, P4, P8, P15)
// ---------------------------------------------------------------------------

/** Parsed cache, `{}` when unparsable, null when absent (ENOENT); other I/O errors propagate. */
function readCache(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  try {
    const data = JSON.parse(text);
    return data !== null && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (_) {
    return {};
  }
}

/** P4: cache status; reason precedence force-refresh > missing > incomplete > expired > null. */
function checkCache(repo, config, flags) {
  const file = cachePath(repo);
  const data = readCache(file);
  const required = ['repo', ...CACHE_SECTIONS].filter((k) => !(flags.skipProjects && k === 'projects'));
  const missing = data ? required.filter((k) => !(k in data)) : required;
  const maxAgeMs = config.cacheMaxAgeHours * 3600 * 1000;
  const fresh = !!data && (maxAgeMs <= 0 || Date.now() - Date.parse(data.fetchedAt) <= maxAgeMs);
  let reason = null;
  if (flags.forceRefresh) reason = 'force-refresh';
  else if (!data) reason = 'missing';
  else if (missing.length) reason = 'incomplete';
  else if (!fresh) reason = 'expired';
  return { exists: !!data, path: file, missing, fresh, refreshNeeded: reason !== null, reason };
}

function clearCache(repo) {
  const file = cachePath(repo);
  try {
    fs.unlinkSync(file);
    return { cleared: true, cachePath: file };
  } catch (err) {
    if (err.code === 'ENOENT') return { cleared: false, cachePath: file };
    throw err;
  }
}

/** Write the cache through a temp file renamed in the same directory: never half a cache. */
function writeCacheAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* best effort */ }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Refresh (R5, R8, R11, R20, R29, A4, A8, P7)
// ---------------------------------------------------------------------------

/** First line of a failed gh call, redacted (C13). */
function ghFailure(r) {
  const text = (r.stderr || r.stdout || '').split('\n').find((l) => l.trim());
  if (text) return redact(text.trim());
  return r.timedOut ? 'gh timed out' : `gh exited with status ${r.status}`;
}

/**
 * R31: one class per gh failure, rules checked in order (rate limit before 403).
 * @param {{ status: number|null, stderr: string, timedOut?: boolean }} r
 * @returns {{ class: string, httpStatus: number|null, message: string, resetAt?: string, hint?: string }}
 */
function classifyGhFailure({ status, stderr, timedOut }) {
  const text = stderr || '';
  const http = text.match(/HTTP (\d{3})/);
  const httpStatus = http ? Number(http[1]) : null;
  const line = text.split('\n').find((l) => l.trim());
  const message = line ? redact(line.trim()) : (timedOut ? 'gh timed out' : `gh exited with status ${status}`);
  const out = (cls, extra) => ({ class: cls, httpStatus, message, ...extra });

  if (timedOut || (status === null && !text)) return out('transport');
  if (/rate limit/i.test(text)) {
    let reset = (text.match(/x-ratelimit-reset[:= ]+(\d{9,})/i) || [])[1];
    if (!reset) {
      const r = gh(['api', 'rate_limit', `--hostname=${activeHost || DEFAULT_HOST}`, '--jq=.resources.core.reset']);
      if (r.ok && /^\d+$/.test(r.stdout)) reset = r.stdout;
    }
    return out('rate-limit', reset ? { resetAt: new Date(Number(reset) * 1000).toISOString() } : {});
  }
  const scope = text.match(/requires the '([^']+)' scope/i) || text.match(/missing required scopes? \[?([\w:, -]+?)\]?(?:\s|$)/i);
  if (scope) return out('auth', { hint: `gh auth refresh -s ${scope[1].trim()}` });
  if (httpStatus === 401 || /not logged in|expired/i.test(text)) return out('auth');
  if (httpStatus === 403) return out('permission');
  if (httpStatus === 404 || /Could not resolve/i.test(text)) return out('not-found');
  if (httpStatus === 422 || /(label|milestone|user|project)\b.*not found|not found.*\b(label|milestone|user|project)\b/i.test(text)) {
    return out('validation');
  }
  if (/unknown flag|unknown command/i.test(text)) return out('capability');
  return out('unknown');
}

/** A read retried once on `transport` only (E9). */
function readWithRetry(args) {
  let r = gh(args);
  if (!r.ok && classifyGhFailure(r).class === 'transport') r = gh(args);
  return r;
}

function notFound(r) {
  return /HTTP 404|Not Found/i.test(`${r.stderr}\n${r.stdout}`);
}

/** `gh api <args>` parsed as JSON; `data` is undefined when the call failed or the answer is not JSON. */
function apiJson(args) {
  const r = gh(['api', ...args]);
  if (!r.ok) return { r };
  try {
    return { r, data: JSON.parse(r.stdout) };
  } catch (_) {
    return { r: { ...r, stderr: `unparsable JSON from gh api ${args[0]}` } };
  }
}

function graphql(host, query, fields) {
  return apiJson(['graphql', `--hostname=${host}`, `--raw-field=query=${query}`, ...fields]);
}

/** A section result: `{ values }` on success, `{ warning }` when its call failed (P7). */
const failed = (section, what, r) => ({ warning: `${section}: ${what} failed (${ghFailure(r)}); kept the previous value` });

/** `--paginate --slurp` REST list (pages flattened). */
function restList(section, repo, endpoint, map) {
  const { r, data } = apiJson([`repos/${repo.owner}/${repo.name}/${endpoint}`, `--hostname=${repo.host}`,
    '--paginate', '--slurp']);
  if (!Array.isArray(data)) return failed(section, `gh api repos/${repo.owner}/${repo.name}/${endpoint}`, r);
  return { values: { [section]: data.flat().map(map) } };
}

function fetchAssignableUsers(repo) {
  const users = [];
  let cursor = null;
  do {
    const { r, data } = graphql(repo.host, Q_ASSIGNABLE, [`--field=owner=${repo.owner}`, `--field=name=${repo.name}`,
      ...(cursor ? [`--raw-field=cursor=${cursor}`] : [])]);
    const page = data && data.data && data.data.repository && data.data.repository.assignableUsers;
    if (!page || !Array.isArray(page.nodes)) return failed('assignableUsers', 'the assignableUsers query', r);
    users.push(...page.nodes.map((u) => ({ login: u.login, name: u.name })));
    cursor = page.pageInfo && page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return { values: { assignableUsers: users } };
}

/** Org issue types; null when the owner has none (a user, or an org without types). */
function fetchIssueTypes(repo) {
  const { r, data } = graphql(repo.host, Q_ISSUE_TYPES, [`--field=owner=${repo.owner}`]);
  if (!data || !data.data) return failed('issueTypes', 'the issueTypes query', r);
  const owner = data.data.repositoryOwner;
  const nodes = owner && owner.issueTypes && owner.issueTypes.nodes;
  const types = Array.isArray(nodes) && nodes.length ? nodes.map((t) => ({ id: t.id, name: t.name })) : null;
  return { values: { issueTypes: types } };
}

function projectField(f) {
  const field = { id: f.id, name: f.name, dataType: f.dataType };
  if (Array.isArray(f.options)) field.options = f.options.map((o) => ({ id: o.id, name: o.name }));
  const iterations = f.configuration && f.configuration.iterations;
  if (Array.isArray(iterations)) {
    field.iterations = iterations.map((it) => ({ id: it.id, title: it.title, startDate: it.startDate, duration: it.duration }));
  }
  return field;
}

/** R20/A4: the configured Projects v2 boards; reading them needs only `read:project`. */
function fetchProjects(repo, boards, flags, scopes) {
  if (flags.skipProjects) return { values: { projects: { skipped: true } } };
  if (scopes.readProject === false) {
    return { warning: `projects: the token lacks the read:project scope; run: gh auth refresh -s read:project --hostname ${repo.host}; kept the previous value` };
  }
  const projects = [];
  for (const board of boards) {
    const owner = board && board.owner;
    const number = board && board.number;
    if (typeof owner !== 'string' || !OWNER_RE.test(owner) || !Number.isInteger(number) || number < 1) {
      return { warning: `projects: github.projects entry ${JSON.stringify(board)} is not { owner, number }; kept the previous value` };
    }
    const { r, data } = graphql(repo.host, Q_PROJECT, [`--field=owner=${owner}`, `--field=number=${number}`]);
    const p = data && data.data && data.data.repositoryOwner && data.data.repositoryOwner.projectV2;
    if (!p) return failed('projects', `the projectV2 query for ${owner}/${number}`, r);
    const nodes = (p.fields && p.fields.nodes) || [];
    projects.push({ owner, number, id: p.id, title: p.title, fields: nodes.filter((f) => f && f.id).map(projectField) });
  }
  return { values: { projects } };
}

/** One `--flag` in `gh … --help` text. */
function hasFlag(help, flag) {
  return new RegExp(`(^|[\\s,])${flag}(?![\\w-])`, 'm').test(help);
}

/**
 * R29: `client` from `gh issue create|edit|close --help`, `host` from Issue introspection plus
 * org issue types and Projects v2 access (null when no board was read).
 */
function fetchCapabilities(repo, issueTypes, projects, projectsRead) {
  const help = {};
  for (const cmd of ['create', 'edit', 'close']) {
    const r = gh(['issue', cmd, '--help']);
    if (!r.ok) return failed('capabilities', `gh issue ${cmd} --help`, r);
    help[cmd] = r.stdout;
  }
  const { r, data } = graphql(repo.host, Q_ISSUE_FIELDS, []);
  const fields = data && data.data && data.data.__type && data.data.__type.fields;
  if (!Array.isArray(fields)) return failed('capabilities', 'the Issue introspection query', r);
  const names = new Set(fields.map((f) => f.name));
  return {
    values: {
      capabilities: {
        client: {
          subIssues: hasFlag(help.edit, '--add-sub-issue') && hasFlag(help.edit, '--parent'),
          blockedBy: hasFlag(help.edit, '--add-blocked-by') && hasFlag(help.edit, '--add-blocking'),
          issueType: hasFlag(help.create, '--type'),
          duplicateOf: hasFlag(help.close, '--duplicate-of'),
        },
        host: {
          subIssues: names.has('subIssues') && names.has('parent'),
          blockedBy: names.has('blockedBy') && names.has('blocking'),
          issueType: names.has('issueType'),
          orgIssueTypes: issueTypes.values ? issueTypes.values.issueTypes !== null : null,
          projectsV2: projectsRead ? !!projects.values : null,
        },
      },
    },
  };
}

/** The template entry of one `.md` (markdown) or `.yml` / `.yaml` (issue form) file. */
function parseTemplateFile(name, text) {
  return /\.md$/i.test(name) ? parseMarkdownTemplate(name, text) : parseIssueForm(name, text);
}

/**
 * Templates of `.github/ISSUE_TEMPLATE/` in one repository, read through `gh api …/contents`.
 * `{ templates, configText }`; both empty when the directory is absent (404); `{ error }` otherwise.
 */
function readRepoTemplates(host, owner, name) {
  const base = `repos/${owner}/${name}/contents/${TEMPLATE_DIR}`;
  const { r, data } = apiJson([base, `--hostname=${host}`]);
  if (data === undefined) return notFound(r) ? { templates: [], configText: null } : { error: failed('issueTemplates', `gh api ${base}`, r) };
  const files = (Array.isArray(data) ? data : []).filter((f) => f && f.type === 'file' && TEMPLATE_FILE_RE.test(f.name));
  const templates = [];
  let configText = null;
  for (const f of files) {
    const file = gh(['api', `${base}/${f.name}`, `--hostname=${host}`, RAW_ACCEPT]);
    if (!file.ok) return { error: failed('issueTemplates', `gh api ${base}/${f.name}`, file) };
    if (TEMPLATE_CONFIG_RE.test(f.name)) configText = file.stdout;
    else templates.push(parseTemplateFile(f.name, file.stdout));
  }
  return { templates, configText };
}

function readShippedTemplates() {
  let names;
  try {
    names = fs.readdirSync(SHIPPED_TEMPLATES_DIR).filter((n) => TEMPLATE_FILE_RE.test(n)).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return { templates: [], configText: null };
    throw err;
  }
  const read = (n) => fs.readFileSync(path.join(SHIPPED_TEMPLATES_DIR, n), 'utf8');
  const config = names.find((n) => TEMPLATE_CONFIG_RE.test(n));
  return {
    templates: names.filter((n) => !TEMPLATE_CONFIG_RE.test(n)).map((n) => parseTemplateFile(n, read(n))),
    configText: config ? read(config) : null,
  };
}

/** R11 resolution: repository → public `<owner>/.github` → shipped defaults. */
function fetchTemplates(repo) {
  const result = (found, source) => ({
    values: {
      issueTemplates: found.templates.map((t) => ({ ...t, source })),
      templateConfig: found.configText === null ? { blank_issues_enabled: null } : parseTemplateConfig(found.configText),
    },
  });
  const own = readRepoTemplates(repo.host, repo.owner, repo.name);
  if (own.error) return own.error;
  if (own.templates.length) return result(own, 'repo');

  const visibility = gh(['api', `repos/${repo.owner}/.github`, `--hostname=${repo.host}`, '--jq=.visibility']);
  if (visibility.ok && visibility.stdout === 'public') {
    const org = readRepoTemplates(repo.host, repo.owner, '.github');
    if (org.error) return org.error;
    if (org.templates.length) return result(org, 'owner');
  } else if (!visibility.ok && !notFound(visibility)) {
    return failed('issueTemplates', `gh api repos/${repo.owner}/.github`, visibility);
  }
  return result(readShippedTemplates(), 'shipped');
}

function countsOf(cache) {
  const len = (v) => (Array.isArray(v) ? v.length : 0);
  return {
    labels: len(cache.labels),
    milestones: len(cache.milestones),
    assignableUsers: len(cache.assignableUsers),
    issueTemplates: len(cache.issueTemplates),
    issueTypes: len(cache.issueTypes),
    projectFields: Array.isArray(cache.projects) ? cache.projects.reduce((n, p) => n + len(p.fields), 0) : 0,
  };
}

/**
 * P7: build the named sections (all when `sections` is null), merge them over the previous
 * cache (other sections copied unchanged) and save. The repository call runs only on a full
 * refresh; its failure is exit 1. A failed section keeps its previous value with a warning.
 * @returns {{ data: object, exitCode: number }}
 */
function refresh(repo, sections, flags, { github, auth }) {
  const file = cachePath(repo);
  const previous = readCache(file) || {};
  const warnings = [];
  const fresh = {};

  if (!sections) {
    const { r, data } = apiJson([`repos/${repo.owner}/${repo.name}`, `--hostname=${repo.host}`]);
    if (!data) {
      const message = `repo: gh api repos/${repo.owner}/${repo.name} failed: ${ghFailure(r)}`;
      return { data: { saved: false, cachePath: file, failure: { ...classifyGhFailure(r), message }, warnings, errors: [message] }, exitCode: 1 };
    }
    fresh.repo = { id: data.node_id, nameWithOwner: data.full_name, hasIssuesEnabled: data.has_issues, visibility: data.visibility };
  }

  // issueTypes and projects also feed capabilities: each call runs at most once per refresh.
  const memo = {};
  const once = (key, fn) => (key in memo ? memo[key] : (memo[key] = fn()));
  const issueTypes = () => once('issueTypes', () => fetchIssueTypes(repo));
  const projects = () => once('projects', () => fetchProjects(repo, github.projects, flags, auth.scopes));
  const projectsRead = !flags.skipProjects && github.projects.length > 0;
  const fetchers = {
    labels: () => restList('labels', repo, 'labels?per_page=100',
      (l) => ({ name: l.name, color: l.color, description: l.description })),
    milestones: () => restList('milestones', repo, 'milestones?state=all&per_page=100',
      (m) => ({ number: m.number, title: m.title, state: m.state, dueOn: m.due_on ?? null })),
    assignableUsers: () => fetchAssignableUsers(repo),
    issueTemplates: () => fetchTemplates(repo),
    issueTypes,
    projects,
    capabilities: () => fetchCapabilities(repo, issueTypes(), projectsRead ? projects() : null, projectsRead),
  };
  for (const name of sections || CACHE_SECTIONS) {
    const res = fetchers[name]();
    if (res.warning) warnings.push(res.warning);
    else Object.assign(fresh, res.values);
  }

  const merged = {
    ...previous, ...fresh,
    schemaVersion: CACHE_SCHEMA_VERSION, fetchedAt: new Date().toISOString(), fetchedBy: auth.actingAccount,
  };
  const cache = {};
  for (const key of CACHE_KEYS) if (key in merged) cache[key] = merged[key];
  writeCacheAtomic(file, cache);
  return { data: { saved: true, cachePath: file, counts: countsOf(cache), warnings, errors: [] }, exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Reads (R22, R24, P9, P10)
// ---------------------------------------------------------------------------

const Q_ISSUE_LINKS = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){'
  + 'issue(number:$number){number issueType{name} parent{number repository{nameWithOwner}}'
  + ' subIssues(first:50){nodes{number}} blockedBy(first:50){nodes{number}} blocking(first:50){nodes{number}}'
  + ' projectItems(first:20){nodes{project{number owner{... on Organization{login} ... on User{login}}}'
  + ' fieldValues(first:30){nodes{'
  + '... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}}'
  + '... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}}'
  + '... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2FieldCommon{name}}}'
  + '... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2FieldCommon{name}}}'
  + '}}}}}}}';

/** A classified read failure as `{ failure, errors }` for emit (exit 1). */
function failureOut(what, r, extra = {}) {
  const failure = classifyGhFailure(r);
  return { data: { ...extra, failure, errors: [`${what}: ${failure.message}`] }, exitCode: 1 };
}

const numbersOf = (conn) => ((conn && conn.nodes) || []).map((n) => n.number);

/** R22/R24: the issue, its links and project values, and the newest comments. */
function view(repo, number) {
  const base = `repos/${repo.owner}/${repo.name}/issues/${number}`;
  const issue = readWithRetry(['api', base, `--hostname=${repo.host}`]);
  let it;
  try { it = JSON.parse(issue.stdout); } catch (_) { it = null; }
  if (!issue.ok || !it) {
    return failureOut(`view #${number}`, issue.ok ? { ...issue, stderr: `unparsable JSON from gh api ${base}` } : issue);
  }
  const out = {
    number: it.number, title: it.title, body: it.body, state: it.state, stateReason: it.state_reason,
    url: it.html_url, labels: (it.labels || []).map((l) => l.name), milestone: it.milestone ? it.milestone.title : null,
    assignees: (it.assignees || []).map((a) => a.login), isPullRequest: !!it.pull_request,
  };
  if (out.isPullRequest) {
    return { data: { ...out, hint: 'This is a pull request: use pr-sdlc', warnings: [], errors: [] }, exitCode: 0 };
  }

  const comments = readWithRetry(['api', `${base}/comments?per_page=100`, `--hostname=${repo.host}`, '--paginate', '--slurp']);
  let pages;
  try { pages = JSON.parse(comments.stdout); } catch (_) { pages = null; }
  if (!comments.ok || !Array.isArray(pages)) return failureOut(`view #${number} comments`, comments);
  const all = pages.flat().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const links = readWithRetry(['api', 'graphql', `--hostname=${repo.host}`, `--raw-field=query=${Q_ISSUE_LINKS}`,
    `--field=owner=${repo.owner}`, `--field=name=${repo.name}`, `--field=number=${number}`]);
  let node;
  try { node = JSON.parse(links.stdout).data.repository.issue; } catch (_) { node = null; }
  if (!links.ok || !node) return failureOut(`view #${number} links`, links.ok ? { ...links, stderr: 'unparsable GraphQL answer' } : links);

  const projectFields = [];
  for (const item of (node.projectItems && node.projectItems.nodes) || []) {
    for (const v of (item.fieldValues && item.fieldValues.nodes) || []) {
      if (!v || !v.field) continue;
      projectFields.push({
        owner: item.project.owner.login, number: item.project.number, field: v.field.name,
        value: v.name ?? v.text ?? v.number ?? v.date ?? null,
      });
    }
  }
  return {
    data: {
      ...out,
      type: node.issueType ? node.issueType.name : null,
      parent: node.parent ? { number: node.parent.number, repo: node.parent.repository.nameWithOwner } : null,
      subIssues: numbersOf(node.subIssues),
      dependencies: { blockedBy: numbersOf(node.blockedBy), blocking: numbersOf(node.blocking) },
      projectFields,
      comments: all.slice(-VIEW_COMMENTS_MAX).map((c) => ({
        author: c.user && c.user.login, body: c.body, createdAt: c.created_at, url: c.html_url,
      })),
      commentsTotal: all.length,
      warnings: [], errors: [],
    },
    exitCode: 0,
  };
}

/** R22/C18: the query is one argv element (`--raw-field=q=<query>`), scoped to the repository by default. */
function search(repo, queryFile) {
  let query;
  try { query = fs.readFileSync(queryFile, 'utf8').trim(); } catch (err) {
    return { data: { errors: [`--query-file: cannot read ${queryFile}: ${err.code || err.message}`], warnings: [] }, exitCode: 1 };
  }
  if (!query) return { data: { errors: [`--query-file: ${queryFile} is empty`], warnings: [] }, exitCode: 1 };
  if (!/(^|\s)(repo|org):/.test(query)) query += ` repo:${repo.owner}/${repo.name}`;
  query += ' is:issue';
  const r = readWithRetry(['api', 'search/issues', `--hostname=${repo.host}`, '--method=GET',
    `--raw-field=q=${query}`, `--raw-field=per_page=${SEARCH_LIMIT_MAX}`]);
  let data;
  try { data = JSON.parse(r.stdout); } catch (_) { data = null; }
  if (!r.ok || !data || !Array.isArray(data.items)) {
    return failureOut('search', r.ok ? { ...r, stderr: 'unparsable JSON from gh api search/issues' } : r, { query });
  }
  const results = data.items.slice(0, SEARCH_LIMIT_MAX).map((i) => ({
    number: i.number, title: i.title, state: i.state, labels: (i.labels || []).map((l) => l.name),
    assignees: (i.assignees || []).map((a) => a.login), url: i.html_url,
  }));
  return {
    data: { query, results, truncated: (data.total_count || 0) > results.length, warnings: [], errors: [] },
    exitCode: 0,
  };
}

/** P12: existence-only link check with the acting account's token; violations go to stderr. */
async function validateLinksSub(repo, file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    emit({ ok: false, violations: [], skipped: [], warnings: [], errors: [`--file: cannot read ${file}: ${err.code || err.message}`] }, 1);
    return;
  }
  const env = ghTokenEnv(repo.host, ghToken);
  const result = await validateLinks(text, { github: { host: repo.host, owner: repo.owner, repo: repo.name, env } });
  if (!result.ok) process.stderr.write(formatViolations(result.violations) + '\n');
  emit({ ok: result.ok, violations: result.violations, skipped: result.skipped, warnings: [], errors: [] }, result.ok ? 0 : 1);
}

/**
 * R10: copy default templates into `.github/ISSUE_TEMPLATE/` of the checkout, never overwriting.
 * Refuses (`{ error }`) unless the checkout's origin is the target repository.
 * @returns {{ created: string[], skipped: string[], targetDir: string } | { error: string }}
 */
function initTemplates(projectRoot, repo, templatesDir) {
  const origin = parseRemoteOwner(projectRoot);
  const same = origin && origin.owner.toLowerCase() === repo.owner.toLowerCase()
    && origin.repo.toLowerCase() === repo.name.toLowerCase();
  if (!same) {
    return { error: `init-templates: the checkout's origin is not ${repo.slug}; run it from a checkout of that repository` };
  }
  const targetDir = path.join(projectRoot, '.github', 'ISSUE_TEMPLATE');
  const created = [];
  const skipped = [];
  let names;
  try {
    names = fs.readdirSync(templatesDir).filter((n) => TEMPLATE_FILE_RE.test(n)).sort();
  } catch (err) {
    return { error: `--templates-dir: cannot read ${templatesDir}: ${err.code || err.message}` };
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of names) {
    try {
      fs.copyFileSync(path.join(templatesDir, name), path.join(targetDir, name), fs.constants.COPYFILE_EXCL);
      created.push(name);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      skipped.push(name);
    }
  }
  return { created, skipped, targetDir };
}

// ---------------------------------------------------------------------------
// Write payloads (P11, P16, R2, R17-R21, R23, R29, R34, R36)
// ---------------------------------------------------------------------------

// P16: the closed key set of each write op.
const OP_KEYS = {
  create: ['op', 'repo', 'template', 'title', 'body', 'labels', 'milestone', 'assignees', 'type', 'parent', 'projects',
    'createLabels'],
  edit: ['op', 'repo', 'number', 'template', 'title', 'body', 'addLabels', 'removeLabels', 'milestone', 'type',
    'createLabels'],
  state: ['op', 'repo', 'number', 'action', 'reason', 'duplicateOf', 'comment'],
  comment: ['op', 'repo', 'number', 'body'],
  link: ['op', 'repo', 'number', 'addParent', 'removeParent', 'addSubIssues', 'removeSubIssues', 'addBlockedBy',
    'removeBlockedBy', 'addBlocking', 'removeBlocking', 'related'],
  assign: ['op', 'repo', 'number', 'addAssignees', 'removeAssignees'],
  project: ['op', 'repo', 'number', 'project', 'addItem', 'field', 'value', 'clear'],
};
// Late-bound argv values (P11): `--apply` substitutes them at run time.
const TMP = '<tmp>';
const NEW_ISSUE_URL = '<new-issue-url>';
const ITEM_ID = '<item-id>';
const CLOSE_REASONS = ['completed', 'not planned', 'duplicate'];
const ASSIGNEE_ALIASES = ['@me', '@copilot'];
// Link ends (P16): one value, or a list of values; `related` is checked apart (R2: existence-only).
const LINK_END_KEYS = ['parent', 'duplicateOf', 'addParent', 'removeParent'];
const LINK_LIST_KEYS = ['addSubIssues', 'removeSubIssues', 'addBlockedBy', 'removeBlockedBy', 'addBlocking', 'removeBlocking'];
// R29: the capability each link key needs.
const LINK_CAPABILITY = {
  parent: 'subIssues', addParent: 'subIssues', removeParent: 'subIssues', addSubIssues: 'subIssues',
  removeSubIssues: 'subIssues', addBlockedBy: 'blockedBy', removeBlockedBy: 'blockedBy', addBlocking: 'blockedBy',
  removeBlocking: 'blockedBy',
};
// P11 keys whose non-empty or `true` value is a finding (exit 1); `errors` holds bad input.
const FINDING_KEYS = ['unknownKeys', 'missingKeys', 'invalidNumbers', 'unknownOp', 'placeholders', 'unknownHeadings',
  'missingRequired', 'templateMissing', 'unknownLabels', 'unknownMilestone', 'unassignable', 'unknownType',
  'unknownProjectValue', 'isPullRequest', 'noOpState', 'selfLink', 'repoNotAllowed', 'notAllowedRefs', 'unsupported',
  'titleTooLong', 'fillerOpening', 'nonChecklistAcceptance', 'bulkTooLarge', 'errors'];

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameRepo = (a, b) => a.slug.toLowerCase() === b.slug.toLowerCase();
const repoFlag = (repo) => `--repo=${repo.host}/${repo.owner}/${repo.name}`;
const issueUrl = (repo, number) => `https://${repo.host}/${repo.owner}/${repo.name}/issues/${number}`;
const eqi = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
/** R2: a write may target `repo` when `github.repos` is unset or lists it. */
const isRepoAllowed = (github, repo) => github.repos.length === 0
  || github.repos.some((s) => { const a = parseSlug(s); return !!a && sameRepo(a, repo); });

/** R36: JSON with sorted keys and no whitespace. */
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isPlainObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** R36: sha256 hex digest of the canonical payload. */
function payloadHash(input) {
  return crypto.createHash('sha256').update(canonicalJson(input)).digest('hex');
}

const ISSUE_URL_RE = /^https:\/\/([A-Za-z0-9.-]+(?::\d+)?)\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/(?:issues|pull)\/([1-9]\d*)$/;
const ISSUE_REF_RE = /^(?:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+))?#([1-9]\d*)$/;

/** A link end: a positive integer in `target`, `#n`, `owner/repo#n` or an issue URL; null when none. */
function linkEnd(value, target) {
  if (typeof value === 'number') return isPositiveInt(value) ? { repo: target, number: value } : null;
  if (typeof value !== 'string') return null;
  let m = value.match(ISSUE_URL_RE);
  if (m) {
    const repo = parseSlug(`${m[1]}/${m[2]}/${m[3]}`);
    // F10: a link end on another host is invalid: no live read and no token go to a host the payload names.
    return repo && eqi(repo.host, target.host) ? { repo, number: Number(m[4]) } : null;
  }
  m = value.match(ISSUE_REF_RE);
  if (!m) return null;
  const repo = m[1] ? parseSlug(`${target.host}/${m[1]}/${m[2]}`) : target;
  return repo && { repo, number: Number(m[3]) };
}

/** The argv value of a link end: the number in the target repository, else the issue URL. */
function endArg(value, target) {
  const end = linkEnd(value, target);
  return sameRepo(end.repo, target) ? String(end.number) : issueUrl(end.repo, end.number);
}

/** The link ends of an op as `{ key, value }`, `related` included; a list key that is not an array is skipped. */
function linkEndEntries(op) {
  const keys = OP_KEYS[op.op] || [];
  const out = [];
  for (const k of [...LINK_END_KEYS, ...LINK_LIST_KEYS, 'related']) {
    if (!keys.includes(k) || op[k] === undefined) continue;
    if (LINK_END_KEYS.includes(k)) out.push({ key: k, value: op[k] });
    else if (Array.isArray(op[k])) for (const value of op[k]) out.push({ key: k, value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live checks (R37, R18, R19, R24): the only per-issue reads of a write check (R8)
// ---------------------------------------------------------------------------

const ANCESTORS_MAX = 10;
const parentChain = (depth) => (depth ? `parent{number repository{nameWithOwner} ${parentChain(depth - 1)}}` : '');
// R37 (3) and (4): the parent chain (up to ANCESTORS_MAX) and the Projects v2 items of one issue.
const Q_ISSUE_LIVE = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){'
  + `issue(number:$number){${parentChain(ANCESTORS_MAX)} projectItems(first:20){nodes{id project{number`
  + ' owner{... on Organization{login} ... on User{login}}}}}}}}';

const issueRef = (repo, number) => `${repo.slug}#${number}`;

/**
 * R37 reads of one issue: REST for state, state reason, body and the pull-request mark, then (an existing issue
 * only) GraphQL for the ancestor chain and project items. A 404 is `exists: false`; any other failed read adds
 * `failure` (its R31 class), never a guess (C6).
 */
function readLiveIssue(repo, number) {
  const entry = {
    exists: false, state: null, stateReason: null, body: null, isPullRequest: false, ancestors: [], projectItems: [],
  };
  const endpoint = `repos/${repo.owner}/${repo.name}/issues/${number}`;
  const rest = readWithRetry(['api', endpoint, `--hostname=${repo.host}`]);
  if (!rest.ok) {
    const failure = classifyGhFailure(rest);
    return failure.class === 'not-found' ? entry : { ...entry, failure };
  }
  let it;
  try { it = JSON.parse(rest.stdout); } catch (_) { it = null; }
  if (!isPlainObject(it)) return { ...entry, failure: classifyGhFailure({ status: rest.status, stderr: `unparsable JSON from gh api ${endpoint}` }) };
  Object.assign(entry, {
    exists: true, state: it.state ?? null, stateReason: it.state_reason ?? null,
    body: typeof it.body === 'string' ? it.body : '', isPullRequest: !!it.pull_request,
  });
  if (entry.isPullRequest) return entry;

  const gq = readWithRetry(['api', 'graphql', `--hostname=${repo.host}`, `--raw-field=query=${Q_ISSUE_LIVE}`,
    `--field=owner=${repo.owner}`, `--field=name=${repo.name}`, `--field=number=${number}`]);
  let node;
  try { node = JSON.parse(gq.stdout).data.repository.issue; } catch (_) { node = null; }
  if (!gq.ok || !node) {
    return { ...entry, failure: classifyGhFailure(gq.ok ? { status: gq.status, stderr: 'unparsable GraphQL answer' } : gq) };
  }
  for (let p = node.parent; p; p = p.parent) {
    const pr = parseSlug(`${repo.host}/${p.repository.nameWithOwner}`);
    if (pr) entry.ancestors.push(issueRef(pr, p.number));
  }
  entry.projectItems = ((node.projectItems && node.projectItems.nodes) || []).filter(Boolean).map((i) => ({
    id: i.id, project: { number: i.project.number, owner: i.project.owner ? i.project.owner.login : null },
  }));
  return entry;
}

/**
 * R37 `liveChecks`: read the target issue (not for a create) and every link end of each op, once per issue.
 * `repo` is the parsed target of the ops; each op's own `repo` when it is omitted.
 * @returns {{ issues: Object<string, { exists, state, stateReason, body, isPullRequest, ancestors: string[],
 *   projectItems: { id, project: { number, owner } }[], failure? }> }}  keyed by `<slug>#<n>`
 */
function liveChecks(ops, repo) {
  const issues = {};
  for (const op of ops) {
    const target = repo || parseSlug(op.repo);
    if (!target) continue;
    const ends = linkEndEntries(op).map(({ value }) => linkEnd(value, target)).filter(Boolean);
    if (op.op !== 'create' && isPositiveInt(op.number)) ends.unshift({ repo: target, number: op.number });
    for (const end of ends) {
      const ref = issueRef(end.repo, end.number);
      if (!(ref in issues)) issues[ref] = readLiveIssue(end.repo, end.number);
    }
  }
  return { issues };
}

/**
 * P11 findings of one op from its liveChecks result: read failures, a missing or pull-request target (R24) or
 * link end (R19), a no-op state change (R18), a self-link and a parent cycle (R19).
 * @returns {{ target: object|null, itemId: string|null }} the target's live entry and its item on `op.project`
 */
function liveFindings(op, repo, live, r) {
  for (const [ref, e] of Object.entries(live.issues)) {
    if (e.failure) r.errors.push(`live ${ref}: ${e.failure.class}: ${e.failure.message}`);
  }
  const selfRef = op.op !== 'create' && isPositiveInt(op.number) ? issueRef(repo, op.number) : null;
  const found = selfRef ? live.issues[selfRef] : null;
  const target = found && !found.failure ? found : null;
  if (target && !target.exists) r.errors.push(`number: ${selfRef} does not exist`);
  if (target && target.isPullRequest) {
    r.isPullRequest = true;
    r.warnings.push(`${selfRef} is a pull request: use pr-sdlc`);
  }
  if (target && target.exists && op.op === 'state'
    && ((op.action === 'close' && target.state === 'closed') || (op.action === 'reopen' && target.state === 'open'))) {
    r.noOpState = true;
  }
  for (const { key, value } of linkEndEntries(op)) {
    const end = linkEnd(value, repo);
    if (!end) continue;
    const ref = issueRef(end.repo, end.number);
    if (selfRef && eqi(ref, selfRef)) { r.selfLink = true; continue; }
    const e = live.issues[ref];
    if (!e || e.failure) continue;
    if (!e.exists) r.errors.push(`${key} ${value}: ${ref} does not exist`);
    else if (e.isPullRequest) r.errors.push(`${key} ${value}: ${ref} is a pull request, not an issue`);
    else if (key === 'addParent' && selfRef && e.ancestors.some((a) => eqi(a, selfRef))) {
      r.errors.push(`addParent ${value}: ${ref} is a descendant of ${selfRef} (parent cycle)`);
    } else if (key === 'addSubIssues' && target && target.ancestors.some((a) => eqi(a, ref))) {
      r.errors.push(`addSubIssues ${value}: ${ref} is an ancestor of ${selfRef} (parent cycle)`);
    }
  }
  const item = op.op === 'project' && target && isPlainObject(op.project) ? target.projectItems
    .find((i) => i.project.number === op.project.number && eqi(i.project.owner, op.project.owner)) : null;
  return { target, itemId: item ? item.id : null };
}

const findBoard = (cache, board) => (Array.isArray(cache.projects) ? cache.projects : [])
  .find((p) => eqi(p.owner, board.owner) && p.number === board.number) || null;
const findField = (board, name) => (board.fields || []).find((f) => eqi(f.name, name)) || null;

/** R20: the `gh project item-edit` value flag for a field, or null when the value does not resolve. */
function fieldValueFlag(field, value) {
  switch (field.dataType) {
    case 'SINGLE_SELECT': {
      const o = (field.options || []).find((x) => eqi(x.name, value));
      return o ? `--single-select-option-id=${o.id}` : null;
    }
    case 'ITERATION': {
      const it = (field.iterations || []).find((x) => eqi(x.title, value));
      return it ? `--iteration-id=${it.id}` : null;
    }
    case 'TEXT': return typeof value === 'string' ? `--text=${value}` : null;
    case 'NUMBER': return typeof value === 'number' && Number.isFinite(value) ? `--number=${value}` : null;
    case 'DATE': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `--date=${value}` : null;
    default: return null;
  }
}

/**
 * The `gh` argv list `--apply` would run for one checked op (P11 `commands[]`, R17-R21).
 * `live` may carry `itemId`, the Projects v2 item of an issue already on the board (R37).
 */
function buildCommands(op, cache, live) {
  const repo = parseSlug(op.repo);
  const R = repoFlag(repo);
  const n = String(op.number);
  const each = (flag, list) => (list || []).map((v) => `${flag}=${v}`);
  const opt = (flag, v) => (v === undefined ? [] : [`${flag}=${v}`]);
  const comment = () => ['issue', 'comment', n, R, `--body-file=${TMP}`];
  const labelCreates = (op.createLabels || []).map((l) => ['label', 'create', l.name, R,
    ...opt('--color', l.color), ...opt('--description', l.description)]);
  switch (op.op) {
    case 'create':
      return [...labelCreates,
        ['issue', 'create', R, `--title=${op.title}`, `--body-file=${TMP}`, ...each('--label', op.labels),
          ...opt('--milestone', op.milestone), ...each('--assignee', op.assignees), ...opt('--type', op.type),
          ...(op.parent === undefined ? [] : [`--parent=${endArg(op.parent, repo)}`])],
        ...(op.projects || []).map((b) => ['project', 'item-add', String(b.number), `--owner=${b.owner}`, `--url=${NEW_ISSUE_URL}`])];
    case 'edit':
      return [...labelCreates,
        ['issue', 'edit', n, R, ...opt('--title', op.title), ...(op.body === undefined ? [] : [`--body-file=${TMP}`]),
          ...each('--add-label', op.addLabels), ...each('--remove-label', op.removeLabels),
          ...opt('--milestone', op.milestone), ...opt('--type', op.type)]];
    case 'state': {
      const first = op.comment === undefined ? [] : [comment()];
      if (op.action === 'reopen') return [...first, ['issue', 'reopen', n, R]];
      const reason = op.reason || 'completed';
      return [...first, ['issue', 'close', n, R, `--reason=${reason}`,
        ...(reason === 'duplicate' ? [`--duplicate-of=${endArg(op.duplicateOf, repo)}`] : [])]];
    }
    case 'comment':
      return [comment()];
    case 'link': {
      const ends = (flag, list) => each(flag, (list || []).map((v) => endArg(v, repo)));
      const flags = [
        ...(op.addParent === undefined ? [] : [`--parent=${endArg(op.addParent, repo)}`]),
        ...(op.removeParent === undefined ? [] : ['--remove-parent']),
        ...ends('--add-sub-issue', op.addSubIssues), ...ends('--remove-sub-issue', op.removeSubIssues),
        ...ends('--add-blocked-by', op.addBlockedBy), ...ends('--remove-blocked-by', op.removeBlockedBy),
        ...ends('--add-blocking', op.addBlocking), ...ends('--remove-blocking', op.removeBlocking),
      ];
      return [...(flags.length ? [['issue', 'edit', n, R, ...flags]] : []), ...(op.related || []).map(comment)];
    }
    case 'assign':
      return [['issue', 'edit', n, R, ...each('--add-assignee', op.addAssignees), ...each('--remove-assignee', op.removeAssignees)]];
    case 'project': {
      const cmds = [];
      if (op.addItem) {
        cmds.push(['project', 'item-add', String(op.project.number), `--owner=${op.project.owner}`, `--url=${issueUrl(repo, op.number)}`]);
      }
      const board = findBoard(cache, op.project);
      const field = board && op.field !== undefined ? findField(board, op.field) : null;
      const value = field && (op.clear ? '--clear' : fieldValueFlag(field, op.value));
      if (value) {
        cmds.push(['project', 'item-edit', `--id=${(live && live.itemId) || ITEM_ID}`, `--project-id=${board.id}`,
          `--field-id=${field.id}`, value]);
      }
      return cmds;
    }
    default:
      return [];
  }
}

/** The values AUTO_ARGV_SHAPES compare against: the repo flag, cached labels and cached Status fields. */
function autoShapeContext(repo, cache) {
  const statusFields = [];
  for (const p of Array.isArray(cache.projects) ? cache.projects : []) {
    const f = findField(p, 'Status');
    if (f && f.dataType === 'SINGLE_SELECT') {
      statusFields.push({ projectId: p.id, fieldId: f.id, optionIds: (f.options || []).map((o) => o.id) });
    }
  }
  const labels = new Set((Array.isArray(cache.labels) ? cache.labels : []).map((l) => String(l.name).toLowerCase()));
  return { repoFlag: repoFlag(repo), labels, statusFields };
}

const isIssueNumber = (s) => /^[1-9]\d*$/.test(s);
const issueHead = (a, c, verb) => a[0] === 'issue' && a[1] === verb && isIssueNumber(a[2]) && a[3] === c.repoFlag;

// R34: every argv of an auto-approvable payload matches one of these shapes (classes (a)-(d)).
const AUTO_ARGV_SHAPES = [
  { class: 'comment', test: (a, c) => a.length === 5 && issueHead(a, c, 'comment') && a[4] === `--body-file=${TMP}` },
  {
    class: 'labels',
    test: (a, c) => a.length > 4 && issueHead(a, c, 'edit') && a.slice(4).every((f) => {
      const m = f.match(/^--(?:add|remove)-label=([\s\S]+)$/);
      return !!m && c.labels.has(m[1].toLowerCase());
    }),
  },
  {
    class: 'state',
    test: (a, c) => (a.length === 5 && issueHead(a, c, 'close') && ['--reason=completed', '--reason=not planned'].includes(a[4]))
      || (a.length === 4 && issueHead(a, c, 'reopen')),
  },
  {
    class: 'status',
    test: (a, c) => a.length === 6 && a[0] === 'project' && a[1] === 'item-edit' && /^--id=./.test(a[2])
      && a[2] !== `--id=${ITEM_ID}` && c.statusFields.some((s) => a[3] === `--project-id=${s.projectId}`
        && a[4] === `--field-id=${s.fieldId}` && s.optionIds.some((id) => a[5] === `--single-select-option-id=${id}`)),
  },
];

/** R34: `['class']` when `commands` is empty or an argv matches no AUTO_ARGV_SHAPES entry, else `[]`. */
function shapeBlockers(commands, repo, cache) {
  const c = autoShapeContext(repo, cache);
  const ok = commands.length > 0 && commands.every((argv) => AUTO_ARGV_SHAPES.some((s) => s.test(argv, c)));
  return ok ? [] : ['class'];
}

/** R34: auto-approvable when there is something to run and no blocker (`class` included) applies. */
function isAutoApprovable(commands, blockers) {
  return commands.length > 0 && blockers.length === 0;
}

/** P11 object of one op with every key at its empty value. */
function emptyResult() {
  return {
    unknownKeys: [], missingKeys: [], invalidNumbers: [], unknownOp: false,
    placeholders: [], unknownHeadings: [], missingRequired: [], templateMissing: false, templateSource: null,
    unknownLabels: [], unknownMilestone: false, unassignable: [], unknownType: false, unknownProjectValue: [],
    mentions: [], refs: [], stale: [], isPullRequest: false, noOpState: false, selfLink: false,
    repoNotAllowed: false, notAllowedRefs: [], unsupported: [], titleTooLong: false, fillerOpening: false,
    nonChecklistAcceptance: [], duplicateMarker: false, crossRepoRefs: [],
    bulkTooLarge: false, live: {}, payloadHash: null, autoApprovable: false, autoBlockers: [], commands: [],
    warnings: [], errors: [],
  };
}

const isFinding = (v) => (Array.isArray(v) ? v.length > 0 : v === true);
const hasFinding = (r) => FINDING_KEYS.some((k) => isFinding(r[k]));
const pushOnce = (list, v) => { if (!list.includes(v)) list.push(v); };

/** P16 value types of one op: errors[] entries for values that are present but malformed. */
function checkTypes(op, keys, r) {
  const has = (k) => keys.includes(k) && op[k] !== undefined;
  const bad = (k, what) => r.errors.push(`${k}: must be ${what}`);
  for (const k of ['template', 'title', 'body', 'milestone', 'type', 'field', 'comment']) {
    if (has(k) && (typeof op[k] !== 'string' || (k !== 'body' && k !== 'comment' && !op[k]))) bad(k, 'a non-empty string');
  }
  for (const k of ['labels', 'assignees', 'addLabels', 'removeLabels', 'addAssignees', 'removeAssignees']) {
    if (has(k) && !(Array.isArray(op[k]) && op[k].every((v) => typeof v === 'string' && v))) bad(k, 'an array of non-empty strings');
  }
  for (const k of ['addItem', 'clear']) if (has(k) && typeof op[k] !== 'boolean') bad(k, 'a boolean');
  if (has('related') && !Array.isArray(op.related)) bad('related', 'an array of issue references');
  if (has('createLabels') && !(Array.isArray(op.createLabels) && op.createLabels.every((l) => isPlainObject(l)
    && typeof l.name === 'string' && l.name && !l.name.startsWith('-')
    && (l.color === undefined || /^[0-9A-Fa-f]{6}$/.test(l.color))
    && (l.description === undefined || typeof l.description === 'string')))) {
    bad('createLabels', 'an array of { name, color?, description? } (a name may not start with "-")');
  }
  const isBoard = (b) => isPlainObject(b) && typeof b.owner === 'string' && OWNER_RE.test(b.owner) && isPositiveInt(b.number);
  if (has('projects') && !(Array.isArray(op.projects) && op.projects.every(isBoard))) bad('projects', 'an array of { owner, number }');
  if (op.op === 'create' && !has('title')) r.errors.push('title: required for create');
  if (op.op === 'comment' && !has('body')) r.errors.push('body: required for comment');
  if (op.op === 'project' && !isBoard(op.project)) bad('project', 'a { owner, number } board');
  if (op.op === 'project' && op.field !== undefined && op.value === undefined && !op.clear) {
    r.errors.push('value: required with field unless clear is true');
  }
  if (op.op === 'state') {
    if (!['close', 'reopen'].includes(op.action)) bad('action', '"close" or "reopen"');
    if (op.reason !== undefined && (op.action !== 'close' || !CLOSE_REASONS.includes(op.reason))) {
      bad('reason', `one of ${CLOSE_REASONS.join(', ')} on a close`);
    }
    if ((op.reason === 'duplicate') !== (op.duplicateOf !== undefined)) r.errors.push('duplicateOf: required with, and only with, reason "duplicate"');
  }
}

/** R17/R6/G9/R20: payload values against the cache; unknown values are findings with their `stale` section. */
function checkValues(op, repo, cache, ctx, r) {
  const stale = (section) => pushOnce(r.stale, section);
  const created = new Set((op.createLabels || []).map((l) => l.name.toLowerCase()));
  const labels = new Set((Array.isArray(cache.labels) ? cache.labels : []).map((l) => String(l.name).toLowerCase()));
  for (const l of [...(op.labels || []), ...(op.addLabels || []), ...(op.removeLabels || [])]) {
    if (!labels.has(l.toLowerCase()) && !created.has(l.toLowerCase())) { pushOnce(r.unknownLabels, l); stale('labels'); }
  }
  if (op.milestone !== undefined && !(Array.isArray(cache.milestones) ? cache.milestones : []).some((m) => m.title === op.milestone)) {
    r.unknownMilestone = true;
    stale('milestones');
  }
  const users = Array.isArray(cache.assignableUsers) ? cache.assignableUsers : [];
  for (const a of [...(op.assignees || []), ...(op.addAssignees || [])]) {
    if (ASSIGNEE_ALIASES.includes(a.toLowerCase())) continue;
    if (!users.some((u) => eqi(u.login, a.replace(/^@/, '')))) { pushOnce(r.unassignable, a); stale('assignableUsers'); }
  }
  if (op.type !== undefined && !(Array.isArray(cache.issueTypes) ? cache.issueTypes : []).some((t) => eqi(t.name, op.type))) {
    r.unknownType = true;
    stale('issueTypes');
  }

  const boards = op.op === 'project' ? [op.project] : (op.projects || []);
  if (boards.length && ctx.auth && ctx.auth.scopes && ctx.auth.scopes.project === false) {
    r.errors.push(`project: the token lacks the project scope; run: gh auth refresh -s project --hostname ${repo.host}`);
  }
  if (boards.length && !Array.isArray(cache.projects)) {
    r.errors.push('projects: the cache holds no Projects v2 data (refreshed with --skip-projects); run --refresh --sections projects');
    return;
  }
  const configured = Array.isArray(ctx.github.projects) ? ctx.github.projects : [];
  for (const b of boards) {
    const name = `${b.owner}/${b.number}`;
    if (!configured.some((c) => c && eqi(c.owner, b.owner) && c.number === b.number)) {
      r.unknownProjectValue.push(`project ${name}: not in github.projects`);
      continue;
    }
    const board = findBoard(cache, b);
    if (!board) { r.unknownProjectValue.push(`project ${name}: not in the cache`); stale('projects'); continue; }
    if (op.op !== 'project' || op.field === undefined) continue;
    const field = findField(board, op.field);
    if (!field) { r.unknownProjectValue.push(`project ${name}: field "${op.field}"`); stale('projects'); continue; }
    if (!op.clear && !fieldValueFlag(field, op.value)) {
      r.unknownProjectValue.push(`project ${name}: field "${op.field}" value ${JSON.stringify(op.value)}`);
      stale('projects');
    }
  }
}

/** R12: the cache template a payload names (by file or name); `blank` only when the repository allows blank issues. */
function resolveTemplate(op, cache) {
  const list = Array.isArray(cache.issueTemplates) ? cache.issueTemplates : [];
  const found = list.find((t) => eqi(t.file, op.template) || eqi(t.name, op.template)) || null;
  const blankOk = op.template === 'blank' && !(cache.templateConfig && cache.templateConfig.blank_issues_enabled === false);
  return { template: found, ok: !!found || blankOk };
}

/** The headings of `text` at the level of a template `kind` (`##` markdown, `###` form). */
const headingsOf = (text, kind) => checkHeadings(text, { kind, headings: [] }).unknownHeadings;

/**
 * R12, R13, R15, R16, R34: text checks of the title, body and closing comment (lib/github-content.js).
 * `current` is the issue's current body (R37), null when unknown; an edit's heading check covers only the
 * headings it adds, and `template: "existing"` keeps the current structure.
 */
function checkContent(op, repo, cache, r, current) {
  const existing = op.op === 'edit' && op.template === 'existing';
  const { template, ok } = existing ? { template: null, ok: true } : resolveTemplate(op, cache);
  const bodyEdit = op.op === 'edit' && op.body !== undefined;
  if ((op.op === 'create' || bodyEdit) && !ok) r.templateMissing = true;
  if (template) r.templateSource = template.source || null;
  const templateText = template && typeof template.body === 'string' ? template.body : '';
  const body = typeof op.body === 'string' ? op.body : '';
  const title = typeof op.title === 'string' ? op.title : '';

  r.placeholders = [...findPlaceholders(title, templateText), ...findPlaceholders(body, templateText)];
  if (op.op === 'create' && template) {
    const h = checkHeadings(body, template);
    r.unknownHeadings = h.unknownHeadings;
    r.missingRequired = h.missingRequired;
  }
  if (bodyEdit && (template || existing) && typeof current === 'string') {
    const kind = template ? template.kind : 'markdown';
    const before = headingsOf(current, kind);
    const added = headingsOf(body, kind).filter((h) => !before.includes(h));
    const h = checkHeadings(body, template || { kind, headings: before.map((text) => ({ text })) }, { added });
    r.unknownHeadings = h.unknownHeadings;
    r.missingRequired = h.missingRequired;
  }
  if (title) {
    const t = checkTitle(title, TITLE_MAX);
    r.titleTooLong = t.titleTooLong;
    r.fillerOpening = t.fillerOpening;
  }
  if (template && (template.headings || []).some((h) => h.text === 'Acceptance Criteria')) {
    r.nonChecklistAcceptance = checkAcceptance(body);
  }

  const text = [title, body, typeof op.comment === 'string' ? op.comment : ''].join('\n');
  const logins = (Array.isArray(cache.assignableUsers) ? cache.assignableUsers : []).map((u) => u.login);
  r.mentions = findMentions(text, logins);
  r.refs = findRefs(text, repo);
  r.crossRepoRefs = r.refs.filter((x) => x.crossRepo).map((x) => x.ref);
  r.duplicateMarker = findDuplicateMarker(text);
}

/** R29: a capability the cache records as false is `unsupported: [<group>.<capability>]`. */
function checkCapabilities(op, keys, repo, cache, r) {
  const needs = new Set();
  for (const k of Object.keys(LINK_CAPABILITY)) if (keys.includes(k) && op[k] !== undefined) needs.add(LINK_CAPABILITY[k]);
  if (op.type !== undefined) needs.add('issueType');
  if (op.reason === 'duplicate') needs.add('duplicateOf');
  const caps = isPlainObject(cache.capabilities) ? cache.capabilities : {};
  for (const cap of needs) {
    if (caps.client && caps.client[cap] === false) {
      r.unsupported.push(`client.${cap}`);
      r.warnings.push(`client.${cap}: the installed gh does not support this; upgrade gh (https://cli.github.com)`);
    }
    if (caps.host && caps.host[cap] === false) {
      r.unsupported.push(`host.${cap}`);
      r.warnings.push(`host.${cap}: ${repo.host} does not support this feature`);
    }
  }
}

/** P11 for one op; ctx = { github, auth, cacheFor(repo) }. */
function checkOp(op, ctx) {
  const r = emptyResult();
  r.payloadHash = payloadHash(op);
  const accountSwitch = !!(ctx.auth && ctx.auth.accountSwitch && ctx.auth.accountSwitch.switched);
  let live = { target: null, itemId: null };
  const done = (repo, cache) => {
    const blockers = repo && cache ? shapeBlockers(r.commands, repo, cache) : ['class'];
    // R34 (d): a project write asks unless the R37 read shows the issue already on that board.
    if (live.target && op.op === 'project' && !live.itemId) blockers.push('notExistingItem');
    if (isPlainObject(op) && Array.isArray(op.createLabels) && op.createLabels.length) blockers.push('createLabels');
    if (isPlainObject(op) && op.op === 'state' && op.reason === 'duplicate') blockers.push('duplicate');
    // R34: every link write asks, including `related`, whose comment argv alone matches class (a).
    if (isPlainObject(op) && op.op === 'link' && !blockers.includes('class')) blockers.push('class');
    // R34 carve-out: content that notifies, marks a duplicate or reaches another repository always asks.
    if (r.mentions.length) blockers.push('mentions');
    if (r.duplicateMarker) blockers.push('duplicateMarker');
    if (r.crossRepoRefs.length) blockers.push('crossRepoRefs');
    if (accountSwitch) blockers.push('accountSwitch');
    r.autoBlockers = blockers;
    r.autoApprovable = isAutoApprovable(r.commands, blockers);
    return r;
  };
  if (!isPlainObject(op) || !Object.prototype.hasOwnProperty.call(OP_KEYS, op.op)) {
    r.unknownOp = true;
    return done(null, null);
  }

  // P16: keys, required keys, numbers.
  const keys = OP_KEYS[op.op];
  r.unknownKeys = Object.keys(op).filter((k) => !keys.includes(k));
  if (op.repo === undefined) r.missingKeys.push('repo');
  if (op.op !== 'create' && op.number === undefined) r.missingKeys.push('number');
  if (op.number !== undefined && keys.includes('number') && !isPositiveInt(op.number)) r.invalidNumbers.push('number');
  const repo = op.repo === undefined ? null : parseSlug(op.repo);
  if (op.repo !== undefined && !repo) r.errors.push(`repo: ${JSON.stringify(op.repo)} is not a valid [HOST/]OWNER/REPO slug`);
  checkTypes(op, keys, r);
  if (!repo || r.errors.length) return done(null, null);

  for (const k of LINK_LIST_KEYS) {
    if (keys.includes(k) && op[k] !== undefined && !Array.isArray(op[k])) pushOnce(r.invalidNumbers, k);
  }
  const ends = [];
  for (const e of linkEndEntries(op)) {
    if (e.key !== 'related') ends.push(e);
    else if (!linkEnd(e.value, repo)) pushOnce(r.invalidNumbers, 'related');
  }

  // R2: the target and every link end (not `related`) must be in github.repos when it is set.
  if (!isRepoAllowed(ctx.github, repo)) r.repoNotAllowed = true;
  for (const { key, value } of ends) {
    const end = linkEnd(value, repo);
    if (!end) { pushOnce(r.invalidNumbers, key); continue; }
    if (!isRepoAllowed(ctx.github, end.repo)) {
      r.repoNotAllowed = true;
      r.notAllowedRefs.push(String(value));
    }
  }

  const cache = ctx.cacheFor(repo);
  if (!cache) {
    r.errors.push(`no cache for ${repo.slug} at ${cachePath(repo)}; run --refresh`);
    return done(null, null);
  }
  checkValues(op, repo, cache, ctx, r);
  // Input errors stop commands[]; live findings below do not (they still set the exit code).
  const buildable = !r.missingKeys.length && !r.invalidNumbers.length && !r.errors.length;
  // R37: no live read for a payload R2 already refuses.
  r.live = r.repoNotAllowed ? { issues: {} } : liveChecks([op], repo);
  live = liveFindings(op, repo, r.live, r);
  checkContent(op, repo, cache, r, live.target && live.target.exists ? live.target.body : null);
  checkCapabilities(op, keys, repo, cache, r);
  if (buildable) r.commands = buildCommands(op, cache, { itemId: live.itemId });
  return done(repo, cache);
}

/**
 * P11: check one write payload or a bulk `{ ops: [...] }` (R23). A bulk is never auto-approvable.
 * ctx = { github, auth, cacheFor(repo) }.
 */
function checkPayload(input, ctx) {
  if (!(isPlainObject(input) && 'ops' in input)) return checkOp(input, ctx);
  const errors = [];
  const extra = Object.keys(input).filter((k) => k !== 'ops');
  if (extra.length) errors.push(`bulk: unknown key(s) ${extra.join(', ')} (a bulk input holds only ops)`);
  if (!Array.isArray(input.ops) || input.ops.length === 0) errors.push('ops: must be a non-empty array of ops');
  const ops = Array.isArray(input.ops) ? input.ops.map((op) => checkOp(op, ctx)) : [];
  // F10: every op of a bulk targets the host of the first op, the only host the run authenticates for.
  if (Array.isArray(input.ops)) {
    const hostOf = (op) => { const p = isPlainObject(op) ? parseSlug(op.repo) : null; return p && p.host; };
    const h0 = hostOf(input.ops[0]);
    input.ops.forEach((op, i) => {
      const h = hostOf(op);
      if (h0 && h && !eqi(h, h0)) errors.push(`ops[${i + 1}].repo: host ${h} differs from the first op's host ${h0}`);
    });
  }
  return {
    ops, bulkTooLarge: ops.length > BULK_MAX, payloadHash: payloadHash(input),
    autoApprovable: false, autoBlockers: ['bulk'], warnings: [], errors,
  };
}

/** Exit code of a checkPayload result (P11): 1 when any op or the bulk has a finding. */
function payloadExitCode(result) {
  return hasFinding(result) || (result.ops || []).some(hasFinding) ? 1 : 0;
}

/** The auth of a write payload (R30, R20): for the first op's repository, only when R2 allows it. */
function payloadAuth(input, github) {
  const first = isPlainObject(input) && Array.isArray(input.ops) ? input.ops[0] : input;
  const target = isPlainObject(first) ? parseSlug(first.repo) : null;
  if (!target || !isRepoAllowed(github, target)) return { auth: null, warnings: [], errors: [] };
  return resolveAuth(target);
}

// ---------------------------------------------------------------------------
// Apply (P13, R36, R37, G7, E4, E7-E10, C7, R32)
// ---------------------------------------------------------------------------

// E9: write kinds (`<argv[0]> <argv[1]>`) re-sent once after a transport failure: a second send leaves the
// same state. `label create` fails with 422 on an existing label, so a timeout leaves it `unknown`; `issue create` and `issue comment` (a comment, a closing or reopening comment, `related`) are not.
const IDEMPOTENT_KINDS = ['issue edit', 'issue close', 'issue reopen', 'project item-add', 'project item-edit'];
const READ_BACK_MAX = 30;
const LATE_VALUES = [`--url=${NEW_ISSUE_URL}`, `--id=${ITEM_ID}`];

/** The text of each `--body-file=<tmp>` buildCommands puts in an op's commands, in the same order. */
function bodyTexts(op) {
  switch (op.op) {
    case 'create': return [op.body ?? ''];
    case 'edit': return op.body === undefined ? [] : [op.body];
    case 'state': return op.comment === undefined ? [] : [op.comment];
    case 'comment': return [op.body];
    case 'link': return (op.related || []).map((ref) => `Related: ${ref}`);
    default: return [];
  }
}

/** `{ argv, text }` per command: each `<tmp>` becomes a file holding the next body text (R21, R25). */
function withBodyFiles(commands, texts, bodyFile) {
  let n = 0;
  return commands.map((cmd) => {
    let text = null;
    const argv = cmd.map((a) => {
      if (a !== `--body-file=${TMP}`) return a;
      text = texts[n++] ?? '';
      return `--body-file=${bodyFile(text)}`;
    });
    return { argv, text };
  });
}

/**
 * E9 read-back of a non-idempotent write that timed out: for `issue create`, an open issue with the same title
 * authored by `acting`; for `issue comment`, the last comment on the issue by `acting`, compared with `text`.
 * `found` is null when the read fails or no acting account is known.
 * @returns {{ found: boolean|null, number: number|null, url: string|null }}
 */
function readBack(op, argv, text, repo, acting) {
  const none = (found) => ({ found, number: null, url: null });
  if (!acting) return none(null);
  const base = `repos/${repo.owner}/${repo.name}/issues`;
  if (argv[1] === 'create') {
    const { data } = apiJson([`${base}?state=open&creator=${encodeURIComponent(acting)}&per_page=${READ_BACK_MAX}`,
      `--hostname=${repo.host}`]);
    if (!Array.isArray(data)) return none(null);
    const hit = data.find((i) => i && !i.pull_request && i.title === op.title);
    return hit ? { found: true, number: hit.number, url: hit.html_url } : none(false);
  }
  const { data } = apiJson([`${base}/${argv[2]}/comments?per_page=100`, `--hostname=${repo.host}`, '--paginate', '--slurp']);
  if (!Array.isArray(data)) return none(null);
  const last = data.flat().filter((c) => c && c.user && eqi(c.user.login, acting)).pop();
  return last && String(last.body).trimEnd() === String(text).trimEnd()
    ? { found: true, number: Number(argv[2]), url: last.html_url } : none(false);
}

/**
 * One write with the E4/E9 recovery: at most one retry (C7). `permission` (or a 404 the R30 helper reads as an
 * unseen repository) → account recovery once per run (never under `--auto`, R34 `accountSwitch`), then one retry;
 * `transport` → one retry for IDEMPOTENT_KINDS, else `unknown`; any other class fails as is (E7's refresh and
 * retry are the skill's). A retry appends R32 telemetry.
 * @returns {{ ok: true, r } | { ok: false, failure } | { ok: false, unknown: true }}
 */
function runWrite(argv, repo, st) {
  const first = gh(argv);
  if (first.ok) return { ok: true, r: first };
  const failure = classifyGhFailure(first);
  const kind = `${argv[0]} ${argv[1]}`;
  const retry = (rid) => {
    const r = gh(argv);
    appendTelemetry({ class: failure.class, operation: kind, repo: repo.slug, error: failure.message,
      recovered: r.ok ? `yes:${rid}` : 'no' }, st.projectRoot, 'github');
    return r.ok ? { ok: true, r } : { ok: false, failure: classifyGhFailure(r), retried: rid };
  };

  if ((failure.class === 'permission' || failure.class === 'not-found') && !st.auto) {
    const rec = recoverGhAccountForTarget({
      host: repo.host, owner: repo.owner, repo: repo.name, errorText: first.stderr,
      alreadySwitched: st.accountSwitch.recovered, currentAccount: st.actingAccount,
    });
    if (!rec.recovered) return { ok: false, failure: rec.hint ? { ...failure, hint: rec.hint } : failure };
    ghToken = rec.token;
    st.accountSwitch = {
      switched: true, account: rec.account, previousAccount: st.actingAccount, reason: 'permission failure on a write',
      recovered: true,
    };
    st.actingAccount = rec.account;
    const w = retry('E4');
    // E9: a transport failure of the retried non-idempotent write is `unknown`, never a plain failure.
    if (!w.ok && w.failure.class === 'transport' && !IDEMPOTENT_KINDS.includes(kind)) return { ok: false, unknown: true };
    if (w.ok || w.failure.class !== 'permission') return w;
    return { ok: false, retried: 'E4', failure: { ...failure, hint: `gh auth login --hostname ${repo.host}, or switch the account yourself` } };
  }
  if (failure.class === 'transport') return IDEMPOTENT_KINDS.includes(kind) ? retry('E9') : { ok: false, unknown: true };
  return { ok: false, failure };
}

/** F6: what a failed op already did: `partial` is set when a write ran, so a whole-op retry must not repeat it. */
function partialOf(vals, completed) {
  return completed ? { partial: { number: vals.number, url: vals.url, completedCommands: completed } } : {};
}

/**
 * One op of `--apply`: the R37 re-check, then its commands in order, late values filled from the commands
 * that produce them (`<new-issue-url>` from `issue create`, `<item-id>` from the board item).
 * @returns {{ applied: { number, url } } | { failed: { failure, findings? } } | { unknown: { outcome, readBack } }}
 */
function applyOp(op, commands, st) {
  const repo = parseSlug(op.repo);
  const r = emptyResult();
  const live = liveFindings(op, repo, liveChecks([op], repo), r);
  if (hasFinding(r)) {
    return { failed: { failure: null, findings: Object.fromEntries(FINDING_KEYS.filter((k) => isFinding(r[k])).map((k) => [k, r[k]])) } };
  }
  const created = op.op === 'create';
  const vals = { number: created ? null : op.number, url: created ? null : issueUrl(repo, op.number), itemId: live.itemId };
  let done = 0;
  for (const { argv: planned, text } of commands) {
    const argv = planned.map((a) => {
      if (a === `--url=${NEW_ISSUE_URL}` && vals.url) return `--url=${vals.url}`;
      if (a === `--id=${ITEM_ID}` && vals.itemId) return `--id=${vals.itemId}`;
      return a;
    });
    const late = argv.find((a) => LATE_VALUES.includes(a));
    if (late) {
      const message = late === `--id=${ITEM_ID}`
        ? `${issueRef(repo, op.number)} is not an item of board ${op.project.owner}/${op.project.number}; add addItem: true`
        : 'issue create printed no issue URL';
      return { failed: { failure: { class: late === `--id=${ITEM_ID}` ? 'validation' : 'unknown', httpStatus: null, message } } };
    }
    const w = runWrite(argv, repo, st);
    if (w.unknown) return { unknown: { outcome: 'unknown', ...partialOf(vals, done), readBack: readBack(op, argv, text, repo, st.actingAccount) } };
    if (!w.ok) return { failed: { failure: w.failure, ...(w.retried ? { retried: w.retried } : {}), ...partialOf(vals, done) } };
    done++;
    if (argv[0] === 'issue' && argv[1] === 'create') {
      const url = w.r.stdout.split('\n').map((l) => l.trim()).reverse().find((l) => ISSUE_URL_RE.test(l));
      if (url) Object.assign(vals, { url, number: Number(url.match(ISSUE_URL_RE)[4]) });
    }
    // The new board item's id: an R37 read of the issue's project items.
    if (argv[0] === 'project' && argv[1] === 'item-add' && op.op === 'project') {
      vals.itemId = liveFindings(op, repo, liveChecks([op], repo), emptyResult()).itemId;
    }
  }
  return { applied: { number: vals.number, url: vals.url } };
}

/**
 * P13 `--apply`: hash check (R36) → `--auto` class check (R36) → full checkPayload (G7) → per op the R37
 * re-check and its writes; the first failed or unknown op stops the batch (R23). `--dry-run` lists the
 * commands with their body files (kept) and runs no write. ctx = { github, cacheFor, projectRoot, authenticate }.
 * @returns {{ data: object, exitCode: number }}
 */
function apply(input, { dryRun, expectHash, auto }, ctx) {
  const result = {
    actingAccount: null, applied: [], failed: [], unknown: [], notRun: [], hashMismatch: false, notAutoApprovable: false,
  };
  const done = (data, exitCode) => ({ data: { ...data, ...result }, exitCode });
  const hash = payloadHash(input);
  if (expectHash && hash !== expectHash) {
    result.hashMismatch = true;
    return done({ payloadHash: hash, warnings: [], errors: [`--expect-hash: the payload changed after the check (now ${hash})`] }, 1);
  }

  const a = ctx.authenticate();
  if (a.errors.length) return done({ auth: a.auth, warnings: a.warnings, errors: a.errors }, 1);
  const st = {
    auto, projectRoot: ctx.projectRoot, actingAccount: a.auth ? a.auth.actingAccount : null,
    accountSwitch: { ...(a.auth ? a.auth.accountSwitch : {}), recovered: false },
  };
  const check = checkPayload(input, { github: ctx.github, auth: a.auth, cacheFor: ctx.cacheFor });
  const report = (exitCode) => {
    result.actingAccount = st.actingAccount;
    const auth = a.auth && { ...a.auth, actingAccount: st.actingAccount, accountSwitch: st.accountSwitch };
    return done({ ...check, auth, warnings: [...a.warnings, ...check.warnings] }, exitCode);
  };
  if (auto && !check.autoApprovable) {
    result.notAutoApprovable = true;
    return report(1);
  }
  if (payloadExitCode(check)) return report(1);

  const bulk = Array.isArray(check.ops);
  const ops = bulk ? input.ops : [input];
  const planned = bulk ? check.ops.map((o) => o.commands) : [check.commands];
  let tmpDir = null;
  let files = 0;
  const bodyFile = (text) => {
    tmpDir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'github-sdlc-'));
    const file = path.join(tmpDir, `body-${++files}.md`);
    fs.writeFileSync(file, text, { mode: 0o600 });
    return file;
  };
  try {
    const commands = ops.map((op, i) => withBodyFiles(planned[i], bodyTexts(op), bodyFile));
    if (dryRun) {
      result.commands = commands.flat().map((c) => c.argv);
      return report(0);
    }
    let stopped = false;
    ops.forEach((op, i) => {
      const index = i + 1;
      if (stopped) { result.notRun.push(index); return; }
      const out = applyOp(op, commands[i], st);
      if (out.applied) result.applied.push({ index, ...out.applied });
      else if (out.unknown) result.unknown.push({ index, ...out.unknown });
      else result.failed.push({ index, ...out.failed });
      stopped = !out.applied;
    });
    return report(stopped ? 1 : 0);
  } finally {
    if (tmpDir && !dryRun) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  outputTarget = args.outputFile;
  const flags = {
    skipConfigCheck: resolveSkipConfigCheck(process.argv),
    skipProjects: args.skipProjects,
    forceRefresh: args.forceRefresh,
    initTemplates: args.initTemplates,
    auto: args.auto,
  };
  // A1/P17: invalid arguments stop before any config, gh or cache access.
  if (args.errors.length) {
    emit({ flags, migration: null, warnings: [], errors: args.errors }, 1);
    return;
  }

  const projectRoot = resolveSdlcRoot();
  const cv = ensureConfigVersion(projectRoot, { skip: flags.skipConfigCheck, roles: ['project'] });
  const base = { flags, migration: cv.migration, warnings: [], errors: [] };
  if (cv.errors.length) {
    const errors = cv.errors.map((e) => `config-version: ${e.role}: ${e.step || e.code}: ${e.message}`);
    emit({ ...base, errors }, 1);
    return;
  }

  // R4: the key check runs even with --skip-config-check.
  const { github, errors: configErrors } = resolveGithubConfig(readSection(projectRoot, 'github'));
  if (configErrors.length) {
    emit({ config: { github }, ...base, errors: configErrors }, 1);
    return;
  }

  const resolved = resolveRepo(projectRoot, args, github);
  const warnings = [...resolved.warnings];
  if (resolved.errors.length) {
    emit({ repo: resolved.repo, config: { github }, ...base, warnings, errors: resolved.errors }, 1);
    return;
  }
  const { repo } = resolved;
  const needsRepo = (sub) => (repo.slug ? null
    : `${sub}: no repository resolved; pass --repo <[HOST/]OWNER/REPO> or set github.defaultRepo`);

  switch (args.subcommand) {
    case 'check': {
      const a = resolveAuth(repo);
      const out = {
        repo,
        candidateRepos: resolved.candidateRepos,
        auth: a.auth,
        cache: repo.slug ? checkCache(repo, github, flags) : null,
        config: { github },
        flags,
        migration: cv.migration,
        warnings: [...warnings, ...a.warnings],
        errors: a.errors,
      };
      emit(out, a.errors.length ? 1 : 0);
      return;
    }
    case 'refresh': {
      const missingRepo = needsRepo('refresh');
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      const a = resolveAuth(repo);
      const authWarnings = [...warnings, ...a.warnings];
      if (a.errors.length) {
        emit({ saved: false, cachePath: cachePath(repo), auth: a.auth, warnings: authWarnings, errors: a.errors }, 1);
        return;
      }
      const r = refresh(repo, args.sections, flags, { github, auth: a.auth });
      emit({ ...r.data, warnings: [...authWarnings, ...r.data.warnings] }, r.exitCode);
      return;
    }
    case 'view':
    case 'search': {
      const missingRepo = needsRepo(args.subcommand);
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      if (args.subcommand === 'search' && !args.queryFile) {
        emit({ ...base, warnings, errors: ['search: --query-file <path> is required'] }, 1);
        return;
      }
      const a = resolveAuth(repo);
      const authWarnings = [...warnings, ...a.warnings];
      if (a.errors.length) { emit({ auth: a.auth, warnings: authWarnings, errors: a.errors }, 1); return; }
      const r = args.subcommand === 'view' ? view(repo, args.viewNumber) : search(repo, args.queryFile);
      emit({ ...r.data, warnings: [...authWarnings, ...(r.data.warnings || [])] }, r.exitCode);
      return;
    }
    case 'validate-links': {
      const missingRepo = needsRepo('validate-links');
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      if (!args.file) { emit({ ...base, warnings, errors: ['validate-links: --file <path> is required'] }, 1); return; }
      const a = resolveAuth(repo);
      if (a.errors.length) { emit({ auth: a.auth, warnings: [...warnings, ...a.warnings], errors: a.errors }, 1); return; }
      validateLinksSub(repo, args.file).catch((err) => {
        process.stderr.write(`github.js --validate-links error: ${(err && err.stack) || err}\n`);
        process.exitCode = 2;
      });
      return;
    }
    case 'init-templates': {
      const missingRepo = needsRepo('init-templates');
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      const r = initTemplates(projectRoot, repo, args.templatesDir || SHIPPED_TEMPLATES_DIR);
      if (r.error) { emit({ ...base, warnings, errors: [r.error] }, 1); return; }
      emit({ repo, ...r, warnings, errors: [] }, 0);
      return;
    }
    case 'check-payload':
    case 'apply': {
      if (!args.input) { emit({ ...base, warnings, errors: [`${args.subcommand}: --input <path> is required`] }, 1); return; }
      let input;
      try {
        input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
      } catch (err) {
        emit({ ...base, warnings, errors: [`--input: cannot read JSON from ${args.input}: ${err.code || err.message}`] }, 1);
        return;
      }
      const caches = new Map();
      const cacheFor = (rp) => {
        const file = cachePath(rp);
        if (!caches.has(file)) caches.set(file, readCache(file));
        return caches.get(file);
      };
      if (args.subcommand === 'apply') {
        const r = apply(input, { dryRun: args.dryRun, expectHash: args.expectHash, auto: args.auto },
          { github, cacheFor, projectRoot, authenticate: () => payloadAuth(input, github) });
        emit({ ...r.data, warnings: [...warnings, ...r.data.warnings] }, r.exitCode);
        return;
      }
      const a = payloadAuth(input, github);
      warnings.push(...a.warnings);
      if (a.errors.length) { emit({ auth: a.auth, warnings, errors: a.errors }, 1); return; }
      const result = checkPayload(input, { github, auth: a.auth, cacheFor });
      emit({ ...result, warnings: [...warnings, ...result.warnings] }, payloadExitCode(result));
      return;
    }
    case 'load': {
      const missingRepo = needsRepo('load');
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      const file = cachePath(repo);
      const data = readCache(file);
      if (!data) {
        emit({ ...base, warnings, errors: [`load: no cache for ${repo.slug} at ${file}; run --refresh`] }, 1);
        return;
      }
      emit({ ...data, warnings, errors: [] }, 0);
      return;
    }
    case 'clear': {
      const missingRepo = needsRepo('clear');
      if (missingRepo) { emit({ ...base, warnings, errors: [missingRepo] }, 1); return; }
      emit({ ...clearCache(repo), warnings, errors: [] }, 0);
      return;
    }
    default:
      emit({ ...base, warnings, errors: [`${args.subcommand}: not implemented`] }, 1);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`github.js error: ${(err && err.stack) || err}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  TITLE_MAX,
  VIEW_COMMENTS_MAX,
  SEARCH_LIMIT_MAX,
  BULK_MAX,
  GITHUB_CONFIG_KEYS,
  CACHE_MAX_AGE_HOURS_DEFAULT,
  CACHE_SECTIONS,
  SHIPPED_TEMPLATES_DIR,
  OP_KEYS,
  AUTO_ARGV_SHAPES,
  initTemplates,
  checkPayload,
  apply,
  IDEMPOTENT_KINDS,
  readBack,
  liveChecks,
  buildCommands,
  canonicalJson,
  payloadHash,
  shapeBlockers,
  isAutoApprovable,
  parseSlug,
  cachePath,
  classifyGhFailure,
  readWithRetry,
};
