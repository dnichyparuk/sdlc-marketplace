#!/usr/bin/env node
/**
 * github.js
 * Prepare script for the github-sdlc skill (spec docs/specs/github-sdlc.md).
 * Every `gh` call of the skill runs here (R25).
 *
 * Usage:
 *   node github.js <--check|--refresh|--load|--clear|--view <n>|--search|--validate-links>
 *                  [--repo <[HOST/]OWNER/REPO>] [--force-refresh] [--skip-projects]
 *                  [--sections <csv>] [--auto] [--query-file <p>] [--file <p>]
 *                  [--output-file [<p>]] [--skip-config-check]
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
 *
 * Output (P17): `--output-file <p>` writes the JSON to <p> and prints nothing; a bare
 * `--output-file` uses writeOutput (prints the manifest path); otherwise JSON on stdout.
 * Exit codes: 0 ok, 1 handled finding or error (including invalid arguments), 2 crash.
 * Uses only Node.js built-in modules.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const LIB = path.join(__dirname, '..', 'lib');

const { writeOutput } = require(path.join(LIB, 'output'));
const {
  execGh, selectGhAccountForTarget, probeGhAuth, parseRemoteOwner, formatAccessDenied,
} = require(path.join(LIB, 'git'));
const { resolveSkipConfigCheck, ensureConfigVersion } = require(path.join(LIB, 'config-version-prepare'));
const { resolveSdlcRoot, readSection } = require(path.join(LIB, 'config'));
const { redact } = require(path.join(LIB, 'mcp-failure'));
const { validateLinks, formatViolations } = require(path.join(LIB, 'links'));
const { parseMarkdownTemplate, parseIssueForm, parseTemplateConfig } = require(path.join(LIB, 'github-templates'));

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
};

// The acting account's token (R30): reaches `gh` children only as env.GH_TOKEN, never output.
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
    subcommand: null, viewNumber: null, repo: null, forceRefresh: false, skipProjects: false,
    sections: null, auto: false, queryFile: null, file: null, outputFile: null, errors,
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
      case '--query-file':
      case '--file': {
        const v = valueAt(i, a);
        if (v === null) break;
        i++;
        if (a === '--file') args.file = v;
        else args.queryFile = v;
        break;
      }
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
  return execGh(args, { env: { ...process.env, ...(ghToken ? { GH_TOKEN: ghToken } : {}) } });
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
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
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
  const text = fs.readFileSync(file, 'utf8');
  const env = { ...process.env, ...(ghToken ? { GH_TOKEN: ghToken } : {}) };
  const result = await validateLinks(text, { github: { host: repo.host, owner: repo.owner, repo: repo.name, env } });
  if (!result.ok) process.stderr.write(formatViolations(result.violations) + '\n');
  emit({ ok: result.ok, violations: result.violations, skipped: result.skipped }, result.ok ? 0 : 1);
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
    initTemplates: false,
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
  parseSlug,
  cachePath,
  classifyGhFailure,
  readWithRetry,
};
