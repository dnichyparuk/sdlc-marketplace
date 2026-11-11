'use strict';

/**
 * project-scan.js
 * Project signal detection shared by skill/guardrails.js and skill/setup.js --scan
 * (setup-sdlc R10, R14, P-scan).
 *
 * The detectors and their helpers moved verbatim from skill/guardrails.js. New
 * behaviour (structure walk, files, hosting, git, Jira evidence, recent PRs)
 * lives only in scanProject. Every git/gh call uses an argument array and no
 * shell; any failure yields empty values, never an exception.
 *
 * Exports:
 *   - scanProject(contentRoot, { projectRoot, prs })  P-scan object
 *   - createSignals()                                 empty signal bag
 *   - detectLanguagesAndFrameworks, detectStructure, detectReviewDimensions,
 *     extractClaudeMdRules                            detectors (mutate signals)
 *   - SCAN_PATTERNS                                   52 { glob, label } pairs
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

const fs   = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { resolveDimensionsDir } = require('./dimensions');
const { jiraKeyRegex } = require('./jira-keys');

// ---------------------------------------------------------------------------
// Signal detection helpers
// ---------------------------------------------------------------------------

function existsRel(projectRoot, ...parts) {
  return fs.existsSync(path.join(projectRoot, ...parts));
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function parseJsonSafe(filePath) {
  const raw = readFileSafe(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Find first existing directory path from a list of candidates (relative to root).
 * Returns the relative path (e.g. "src/repositories/") or null.
 */
function findDir(projectRoot, ...candidates) {
  for (const rel of candidates) {
    if (existsRel(projectRoot, rel)) return rel + '/';
  }
  return null;
}

/**
 * Check whether any file at the top level of dir matches a predicate (non-recursive).
 */
function anyFileMatches(dirPath, predicate) {
  if (!fs.existsSync(dirPath)) return false;
  try {
    return fs.readdirSync(dirPath).some(predicate);
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Language & framework detection
// ---------------------------------------------------------------------------

function detectLanguagesAndFrameworks(projectRoot, signals) {
  // JavaScript / TypeScript
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = parseJsonSafe(pkgPath);
  if (pkg) {
    const allDeps = {
      ...((pkg.dependencies) || {}),
      ...((pkg.devDependencies) || {}),
    };
    const hasTsConfig = existsRel(projectRoot, 'tsconfig.json');
    const hasTypeScriptDep = 'typescript' in allDeps;
    signals.languages.push(hasTsConfig || hasTypeScriptDep ? 'typescript' : 'javascript');

    const frameworkMap = {
      express:  'express',
      fastify:  'fastify',
      nestjs:   'nestjs',
      '@nestjs/core': 'nestjs',
      react:    'react',
      next:     'next',
      'next.js': 'next',
      nuxt:     'nuxt',
      vue:      'vue',
      angular:  'angular',
      '@angular/core': 'angular',
      svelte:   'svelte',
      astro:    'astro',
      hapi:     'hapi',
      koa:      'koa',
      // Serverless / IaC
      'serverless':       'serverless-framework',
      'aws-cdk-lib':      'aws-cdk',
      'sst':              'sst',
      // Observability
      'dd-trace':         'datadog',
      'newrelic':         'newrelic',
      'aws-xray-sdk-core':'aws-xray',
      // Validation
      'zod':              'zod',
      'joi':              'joi',
      'yup':              'yup',
      'class-validator':  'class-validator',
      'ajv':              'ajv',
      // Build tools
      'webpack':          'webpack',
      'esbuild':          'esbuild',
      'vite':             'vite',
      'rollup':           'rollup',
    };
    for (const [dep, framework] of Object.entries(frameworkMap)) {
      if (dep in allDeps && !signals.frameworks.includes(framework)) {
        signals.frameworks.push(framework);
      }
    }

    // Scoped package prefix matching
    const prefixMap = {
      '@middy/':          'middy',
      '@sentry/':         'sentry',
      '@pulumi/':         'pulumi',
      '@opentelemetry/':  'opentelemetry',
    };
    for (const dep of Object.keys(allDeps)) {
      for (const [prefix, framework] of Object.entries(prefixMap)) {
        if (dep.startsWith(prefix) && !signals.frameworks.includes(framework)) {
          signals.frameworks.push(framework);
        }
      }
    }
  }

  // Go
  if (existsRel(projectRoot, 'go.mod')) {
    signals.languages.push('go');
    const goMod = readFileSafe(path.join(projectRoot, 'go.mod')) || '';
    for (const fw of ['gin', 'echo', 'fiber']) {
      if (goMod.includes(fw)) signals.frameworks.push(fw);
    }
  }

  // Rust
  if (existsRel(projectRoot, 'Cargo.toml')) {
    signals.languages.push('rust');
  }

  // Python
  if (existsRel(projectRoot, 'pyproject.toml') || existsRel(projectRoot, 'requirements.txt')) {
    signals.languages.push('python');
    const pyFiles = [
      readFileSafe(path.join(projectRoot, 'pyproject.toml')) || '',
      readFileSafe(path.join(projectRoot, 'requirements.txt')) || '',
    ].join('\n');
    for (const fw of ['django', 'flask', 'fastapi']) {
      if (pyFiles.toLowerCase().includes(fw)) signals.frameworks.push(fw);
    }
  }

  // Java
  if (existsRel(projectRoot, 'pom.xml') || existsRel(projectRoot, 'build.gradle')) {
    signals.languages.push('java');
  }
}

// ---------------------------------------------------------------------------
// Structural signal detection
// ---------------------------------------------------------------------------

function detectStructure(projectRoot, signals) {
  const dirs = signals.directories;

  // Key directories — check both root and src/
  const structuralDirs = ['controllers', 'services', 'repositories', 'middleware', 'models', 'migrations'];
  for (const d of structuralDirs) {
    const found = findDir(projectRoot, d, path.join('src', d));
    if (found) dirs[d] = found;
  }

  // ORM / database
  if (existsRel(projectRoot, 'prisma')) {
    signals.hasDatabase = true;
    signals.dbType = 'prisma';
  } else if (existsRel(projectRoot, 'alembic')) {
    signals.hasDatabase = true;
    signals.dbType = 'alembic';
  } else if (
    existsRel(projectRoot, 'knexfile.js') ||
    existsRel(projectRoot, 'knexfile.ts') ||
    existsRel(projectRoot, 'knexfile.cjs')
  ) {
    signals.hasDatabase = true;
    signals.dbType = 'knex';
  } else {
    // Check for typeorm in package.json deps
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = parseJsonSafe(pkgPath);
    if (pkg) {
      const allDeps = { ...((pkg.dependencies) || {}), ...((pkg.devDependencies) || {}) };
      if ('typeorm' in allDeps) {
        signals.hasDatabase = true;
        signals.dbType = 'typeorm';
      }
      // NoSQL / driver-based database detection
      if (!signals.hasDatabase) {
        const driverMap = {
          '@aws-sdk/client-dynamodb': 'dynamodb',
          '@aws-sdk/lib-dynamodb':    'dynamodb',
          'serverless-dynamodb':      'dynamodb',
          'mongoose':                 'mongodb',
          'mongodb':                  'mongodb',
          'redis':                    'redis',
          'ioredis':                  'redis',
          '@google-cloud/firestore':  'firestore',
          'firebase-admin':           'firestore',
          'cassandra-driver':         'cassandra',
          'neo4j-driver':             'neo4j',
        };
        for (const [dep, dbType] of Object.entries(driverMap)) {
          if (dep in allDeps) {
            signals.hasDatabase = true;
            signals.dbType = dbType;
            break;
          }
        }
      }
    }
  }
  // Migrations dir also implies database
  if ('migrations' in dirs && !signals.hasDatabase) {
    signals.hasDatabase = true;
    signals.dbType = 'migrations';
  }
  // Serverless resources with DynamoDB table definitions
  if (!signals.hasDatabase) {
    const resourcesPath = path.join(projectRoot, 'serverless', 'resources.yml');
    const resourcesContent = readFileSafe(resourcesPath);
    if (resourcesContent && resourcesContent.includes('AWS::DynamoDB::Table')) {
      signals.hasDatabase = true;
      signals.dbType = 'dynamodb';
    }
  }
  // persistence/ directory as a weaker database hint
  if (!signals.hasDatabase) {
    if (findDir(projectRoot, 'persistence', path.join('src', 'persistence'))) {
      signals.hasDatabase = true;
      signals.dbType = 'unknown';
    }
  }

  // API signals
  if (existsRel(projectRoot, 'openapi.yaml') || existsRel(projectRoot, 'openapi.json')) {
    signals.hasApi = true;
    signals.apiFormat = 'openapi';
  } else if (
    anyFileMatches(projectRoot, f => f.endsWith('.graphql') || f.endsWith('.gql')) ||
    existsRel(projectRoot, 'schema.graphql') ||
    existsRel(projectRoot, 'schema.gql')
  ) {
    signals.hasApi = true;
    signals.apiFormat = 'graphql';
  } else if (existsRel(projectRoot, 'routes') || existsRel(projectRoot, 'src', 'routes')) {
    signals.hasApi = true;
    signals.apiFormat = 'rest';
  }

  // Lambda / Serverless HTTP API detection
  if (!signals.hasApi) {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = parseJsonSafe(pkgPath);
    if (pkg) {
      const allDeps = { ...((pkg.dependencies) || {}), ...((pkg.devDependencies) || {}) };
      // @middy/http-* or http-status-codes → lambda-http
      const hasMiddyHttp = Object.keys(allDeps).some(dep => dep.startsWith('@middy/http-'));
      if (hasMiddyHttp || 'http-status-codes' in allDeps) {
        signals.hasApi = true;
        signals.apiFormat = 'lambda-http';
      }
    }
  }
  if (!signals.hasApi) {
    // Serverless Framework config files
    if (
      existsRel(projectRoot, 'serverless', 'functions.yml') ||
      existsRel(projectRoot, 'serverless.yml') ||
      existsRel(projectRoot, 'serverless.ts')
    ) {
      signals.hasApi = true;
      signals.apiFormat = 'serverless';
    }
  }
  if (!signals.hasApi) {
    // src/function/ or src/functions/ with handler files
    const fnDir = findDir(projectRoot, 'src/function', 'src/functions');
    if (fnDir) {
      const fullFnDir = path.join(projectRoot, fnDir);
      if (anyFileMatches(fullFnDir, f => f.toLowerCase().includes('handler'))) {
        signals.hasApi = true;
        signals.apiFormat = 'lambda-http';
      }
    }
  }

  // Tests
  if (
    existsRel(projectRoot, 'test') ||
    existsRel(projectRoot, 'tests') ||
    existsRel(projectRoot, '__tests__')
  ) {
    signals.hasTests = true;
  }
  // Check test framework in package.json devDeps
  if (!signals.hasTests || !signals.testFramework) {
    const pkg = parseJsonSafe(path.join(projectRoot, 'package.json'));
    if (pkg) {
      const devDeps = (pkg.devDependencies) || {};
      const deps = (pkg.dependencies) || {};
      const all = { ...deps, ...devDeps };
      if ('jest' in all) { signals.hasTests = true; signals.testFramework = 'jest'; }
      else if ('vitest' in all) { signals.hasTests = true; signals.testFramework = 'vitest'; }
      else if ('mocha' in all) { signals.hasTests = true; signals.testFramework = 'mocha'; }
    }
  }
  // Go test files
  if (!signals.hasTests && signals.languages.includes('go')) {
    const hasGoTests = anyFileMatches(projectRoot, f => f.endsWith('_test.go'));
    if (hasGoTests) { signals.hasTests = true; signals.testFramework = 'go-test'; }
  }

  // CI
  const ghWorkflowsDir = path.join(projectRoot, '.github', 'workflows');
  if (
    fs.existsSync(ghWorkflowsDir) &&
    anyFileMatches(ghWorkflowsDir, f => f.endsWith('.yml') || f.endsWith('.yaml'))
  ) {
    signals.hasCi = true;
    signals.ciPlatform = 'github-actions';
  } else if (existsRel(projectRoot, 'Jenkinsfile')) {
    signals.hasCi = true;
    signals.ciPlatform = 'jenkins';
  } else if (existsRel(projectRoot, '.gitlab-ci.yml')) {
    signals.hasCi = true;
    signals.ciPlatform = 'gitlab';
  }

  // Monorepo
  if (
    existsRel(projectRoot, 'lerna.json') ||
    existsRel(projectRoot, 'pnpm-workspace.yaml') ||
    existsRel(projectRoot, 'nx.json')
  ) {
    signals.hasMonorepo = true;
  }

  // OpenSpec
  if (existsRel(projectRoot, 'openspec', 'config.yaml')) {
    signals.hasOpenSpec = true;
  }
}

// ---------------------------------------------------------------------------
// Review dimensions
// ---------------------------------------------------------------------------

function detectReviewDimensions(projectRoot, signals) {
  // Route through resolveDimensionsDir() so .sdlc/-first lookup works.
  // Fixes #259 — direct .claude/ read missed every project that had migrated.
  const dimDir = resolveDimensionsDir(projectRoot);
  if (!fs.existsSync(dimDir)) return;
  try {
    const files = fs.readdirSync(dimDir);
    for (const f of files) {
      if (f.endsWith('.md')) {
        signals.reviewDimensions.push(f.replace(/\.md$/, ''));
      }
    }
  } catch (_) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md / AGENTS.md rule extraction
// ---------------------------------------------------------------------------

const CONSTRAINT_REGEX = /\b(must|never|always|require[sd]?|forbidden|prohibited)\b/i;

function extractClaudeMdRules(projectRoot, signals) {
  const candidates = ['CLAUDE.md', 'AGENTS.md'];
  const seen = new Set();
  const rules = [];

  for (const filename of candidates) {
    const filePath = path.join(projectRoot, filename);
    const content = readFileSafe(filePath);
    if (!content) continue;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (CONSTRAINT_REGEX.test(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        rules.push(trimmed);
        if (rules.length >= 20) break;
      }
    }
    if (rules.length >= 20) break;
  }

  signals.claudeMdRules = rules;
}

// ---------------------------------------------------------------------------
// Signal bag
// ---------------------------------------------------------------------------

/**
 * Empty signal bag filled by the detectors above.
 * @returns {object}
 */
function createSignals() {
  return {
    languages: [],
    frameworks: [],
    hasDatabase: false,
    dbType: null,
    hasApi: false,
    apiFormat: null,
    hasTests: false,
    testFramework: null,
    hasCi: false,
    ciPlatform: null,
    hasMonorepo: false,
    hasOpenSpec: false,
    directories: {},
    reviewDimensions: [],
    claudeMdRules: [],
  };
}

// ---------------------------------------------------------------------------
// Structure patterns (W6a.9: the 52 glob → label pairs of the setup scan)
// ---------------------------------------------------------------------------

const SCAN_PATTERNS = [
  { glob: '**/middleware/**',     label: 'auth / request pipeline' },
  { glob: '**/auth/**',           label: 'authentication' },
  { glob: '**/routes/**',         label: 'HTTP routing' },
  { glob: '**/controllers/**',    label: 'MVC controllers' },
  { glob: '**/handlers/**',       label: 'request handlers' },
  { glob: '**/migrations/**',     label: 'database migrations' },
  { glob: '**/models/**',         label: 'data models' },
  { glob: '**/repositories/**',   label: 'data access layer' },
  { glob: '**/workers/**',        label: 'background workers' },
  { glob: '**/queues/**',         label: 'message queues' },
  { glob: '**/jobs/**',           label: 'scheduled jobs' },
  { glob: '**/components/**',     label: 'UI components' },
  { glob: '**/pages/**',          label: 'page components (Next.js, Nuxt, etc.)' },
  { glob: '**/views/**',          label: 'view templates' },
  { glob: '**/*.scss',            label: 'CSS/styling' },
  { glob: '**/terraform/**',      label: 'infrastructure as code' },
  { glob: '**/k8s/**',            label: 'Kubernetes manifests' },
  { glob: '**/Dockerfile',        label: 'containerization' },
  { glob: '**/*.test.*',          label: 'test files' },
  { glob: '**/*.spec.*',          label: 'test files' },
  { glob: 'docs/',                label: 'documentation directory' },
  { glob: '**/i18n/**',           label: 'internationalization' },
  { glob: '**/locales/**',        label: 'internationalization' },
  { glob: '**/translations/**',   label: 'internationalization' },
  { glob: '**/.env*',             label: 'configuration management' },
  { glob: '**/config/**',         label: 'configuration management' },
  { glob: '**/feature-flags/**',  label: 'configuration management' },
  { glob: '**/*.graphql',         label: 'API contract (GraphQL)' },
  { glob: '**/*.proto',           label: 'API contract (gRPC/protobuf)' },
  { glob: '**/openapi.*',         label: 'API contract (OpenAPI)' },
  { glob: '**/swagger.*',         label: 'API contract (Swagger)' },
  { glob: '**/*.schema.*',        label: 'config/type schemas' },
  { glob: '**/a11y/**',           label: 'accessibility' },
  { glob: '**/cypress/**',        label: 'E2E testing' },
  { glob: '**/playwright/**',     label: 'E2E testing' },
  { glob: '**/packages/*/',       label: 'monorepo workspace' },
  { glob: '**/apps/*/',           label: 'monorepo workspace' },
  { glob: '**/libs/*/',           label: 'monorepo shared libs' },
  { glob: '**/plugins/*/',        label: 'plugin architecture' },
  { glob: '**/extensions/*/',     label: 'plugin architecture' },
  { glob: '**/*.d.ts',            label: 'TypeScript type definitions' },
  { glob: '**/tsconfig*.json',    label: 'TypeScript project config' },
  { glob: '**/Jenkinsfile',       label: 'CI/CD' },
  { glob: '**/.circleci/**',      label: 'CI/CD' },
  { glob: '**/android/**',        label: 'mobile app' },
  { glob: '**/ios/**',            label: 'mobile app' },
  { glob: '**/model*/**',         label: 'ML/AI' },
  { glob: '**/dags/**',           label: 'data pipeline (Airflow)' },
  { glob: '**/pipeline*/**',      label: 'data pipeline' },
  { glob: '**/store/**',          label: 'state management' },
  { glob: '**/state/**',          label: 'state management' },
  { glob: '**/bin/**',            label: 'CLI entry points' },
];

// ---------------------------------------------------------------------------
// Structure walk
// ---------------------------------------------------------------------------

const WALK_MAX_DEPTH = 6;
const WALK_MAX_ENTRIES = 20000;
const WALK_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', '.venv', 'target']);
const STRUCTURE_MAX_COUNT = 500;
const STRUCTURE_MAX_SAMPLES = 3;

/**
 * Glob → anchored RegExp over POSIX relative paths. Directory entries carry a
 * trailing "/" so `docs/` and `**\/packages/*\/` match directories only.
 */
function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
      else { re += '.*'; i += 1; }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp('^' + re + '$');
}

/**
 * One bounded walk of contentRoot; returns POSIX relative paths (directories
 * end in "/"), sorted per directory for stable samples.
 */
function walkEntries(root) {
  const entries = [];
  const queue = [{ rel: '', depth: 1 }];
  while (queue.length > 0 && entries.length < WALK_MAX_ENTRIES) {
    const { rel, depth } = queue.shift();
    let dirents;
    try {
      dirents = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch (_) {
      continue;
    }
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const d of dirents) {
      if (entries.length >= WALK_MAX_ENTRIES) break;
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (WALK_SKIP_DIRS.has(d.name)) continue;
        entries.push(childRel + '/');
        if (depth < WALK_MAX_DEPTH) queue.push({ rel: childRel, depth: depth + 1 });
      } else {
        entries.push(childRel);
      }
    }
  }
  return entries;
}

function scanStructure(contentRoot) {
  const entries = walkEntries(contentRoot);
  const structure = {};
  for (const { glob, label } of SCAN_PATTERNS) {
    const re = globToRegex(glob);
    const hit = { label, count: 0, samples: [], truncated: false };
    for (const entry of entries) {
      if (!re.test(entry)) continue;
      if (hit.count >= STRUCTURE_MAX_COUNT) { hit.truncated = true; break; }
      hit.count++;
      if (hit.samples.length < STRUCTURE_MAX_SAMPLES) hit.samples.push(entry);
    }
    structure[glob] = hit;
  }
  return structure;
}

// ---------------------------------------------------------------------------
// Files, CI files
// ---------------------------------------------------------------------------

const SCAN_FILES = [
  'package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py',
  'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'Gemfile',
  'CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md',
  '.github/PULL_REQUEST_TEMPLATE.md', '.github/pull_request_template.md', '.sdlc/pr-template.md',
];
const PR_TEMPLATE_DIR = '.github/PULL_REQUEST_TEMPLATE/';
const FILE_MAX_BYTES = 8 * 1024;

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

function readCapped(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(size, FILE_MAX_BYTES));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return { content: buf.subarray(0, n).toString('utf8'), truncated: size > FILE_MAX_BYTES };
  } catch (_) {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) { /* ignore */ } }
  }
}

function realPathWithin(abs, realRoot) {
  try {
    const real = fs.realpathSync(abs);
    return real === realRoot || real.startsWith(realRoot + path.sep);
  } catch (_) {
    return false;
  }
}

function scanFiles(contentRoot) {
  const files = {};
  let realRoot;
  try { realRoot = fs.realpathSync(contentRoot); } catch (_) { return files; }
  for (const rel of SCAN_FILES) {
    const abs = path.join(contentRoot, rel);
    if (!isFile(abs) || !realPathWithin(abs, realRoot)) continue;
    const read = readCapped(abs);
    if (read) files[rel] = read;
  }
  const templateDir = path.join(contentRoot, PR_TEMPLATE_DIR);
  if (isDir(templateDir) && realPathWithin(templateDir, realRoot)) {
    try {
      files[PR_TEMPLATE_DIR] = { content: fs.readdirSync(templateDir).sort().join('\n'), truncated: false };
    } catch (_) { /* unreadable — omit */ }
  }
  return files;
}

function scanCiFiles(contentRoot) {
  const ciFiles = [];
  const workflowsDir = path.join(contentRoot, '.github', 'workflows');
  let realRoot;
  try { realRoot = fs.realpathSync(contentRoot); } catch (_) { return ciFiles; }
  try {
    for (const f of fs.readdirSync(workflowsDir).sort()) {
      if ((f.endsWith('.yml') || f.endsWith('.yaml')) && isFile(path.join(workflowsDir, f)) && realPathWithin(path.join(workflowsDir, f), realRoot)) {
        ciFiles.push(`.github/workflows/${f}`);
      }
    }
  } catch (_) { /* no workflows dir */ }
  for (const rel of ['Jenkinsfile', '.circleci/config.yml', '.gitlab-ci.yml']) {
    if (isFile(path.join(contentRoot, rel))) ciFiles.push(rel);
  }
  return ciFiles;
}

// ---------------------------------------------------------------------------
// git / gh (argument arrays, no shell; failures give empty values)
// ---------------------------------------------------------------------------

function runSafe(cmd, args, cwd, timeout) {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeout || 10000,
    }).trim();
  } catch (_) {
    return '';
  }
}

function detectHosting(contentRoot) {
  if (runSafe('git', ['remote', 'get-url', 'origin'], contentRoot).includes('github.com')) {
    return { github: true, via: 'remote' };
  }
  const gh = spawnSync('gh', ['repo', 'view', '--json', 'url'], {
    cwd: contentRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (!gh.error && gh.status === 0) return { github: true, via: 'gh' };
  if (isDir(path.join(contentRoot, '.github'))) return { github: true, via: 'dir' };
  return { github: false, via: null };
}

function scanGit(contentRoot) {
  const branch = runSafe('git', ['rev-parse', '--abbrev-ref', 'HEAD'], contentRoot);
  const log = runSafe('git', ['log', '--oneline', '-20'], contentRoot);
  return { branch, recentCommits: log ? log.split('\n') : [] };
}

/**
 * Jira key evidence from the branch and recent commit subjects.
 * `ambiguous` when fewer than 2 matches or more than one prefix.
 */
function scanJiraEvidence(git) {
  const subjects = git.recentCommits.map(line => line.replace(/^\S+\s*/, ''));
  const text = [git.branch, ...subjects].join('\n');
  const keys = {};
  let matches = 0;
  for (const m of text.matchAll(jiraKeyRegex('g'))) {
    const prefix = m[1].split('-')[0];
    keys[prefix] = (keys[prefix] || 0) + 1;
    matches++;
  }
  return { keys, ambiguous: matches < 2 || Object.keys(keys).length > 1 };
}

function scanRecentPrs(contentRoot) {
  const raw = runSafe('gh', ['pr', 'list', '--state', 'all', '--limit', '5', '--json', 'title,body'], contentRoot);
  if (!raw) return [];
  try {
    return JSON.parse(raw).slice(0, 5).map(pr => ({
      title: pr.title || '',
      headings: String(pr.body || '').split('\n').filter(l => l.startsWith('## ')).map(l => l.trim()),
    }));
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// scanProject
// ---------------------------------------------------------------------------

/**
 * Project scan for setup-sdlc (P-scan). Returns:
 *   { signals: { languages, frameworks, hasDatabase, dbType, hasApi, apiFormat, hasTests,
 *                testFramework, hasCi, ciPlatform, hasMonorepo, hasOpenSpec, directories,
 *                reviewDimensions, claudeMdRules,
 *                structure: { "<glob>": { label, count, samples, truncated } } },
 *     files: { "<rel path>": { content, truncated } },
 *     hosting: { github, via },
 *     ciFiles: [],
 *     git: { branch, recentCommits },
 *     jiraEvidence: { keys, ambiguous },
 *     recentPrs: [] }
 * `recentPrs` is filled only with `prs` and GitHub hosting. `signals.reviewDimensions`
 * reads `projectRoot` (main worktree); every other field reads `contentRoot`.
 *
 * @param {string} contentRoot  Active worktree.
 * @param {{ projectRoot?: string, prs?: boolean }} [opts]
 * @returns {object}
 */
function scanProject(contentRoot, { projectRoot, prs = false } = {}) {
  const signals = createSignals();
  detectLanguagesAndFrameworks(contentRoot, signals);
  detectStructure(contentRoot, signals);
  detectReviewDimensions(projectRoot || contentRoot, signals);
  extractClaudeMdRules(contentRoot, signals);
  signals.structure = scanStructure(contentRoot);

  const hosting = detectHosting(contentRoot);
  const git = scanGit(contentRoot);

  return {
    signals,
    files: scanFiles(contentRoot),
    hosting,
    ciFiles: scanCiFiles(contentRoot),
    git,
    jiraEvidence: scanJiraEvidence(git),
    recentPrs: prs && hosting.github ? scanRecentPrs(contentRoot) : [],
  };
}

module.exports = {
  scanProject,
  createSignals,
  detectLanguagesAndFrameworks,
  detectStructure,
  detectReviewDimensions,
  extractClaudeMdRules,
  SCAN_PATTERNS,
};
