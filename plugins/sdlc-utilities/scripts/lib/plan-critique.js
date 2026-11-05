'use strict';

/**
 * plan-critique.js — shared plan-critique lane table (KD-4).
 * Gate ids G3, G4, G10, G12 are validator checks and belong to no lane.
 */

const LANE_DEFS = [
  { name: 'static-structural',    gateIds: ['G1', 'G2', 'G7'] },
  { name: 'content-coverage',     gateIds: ['G5', 'G6', 'G8', 'G9', 'G11', 'G13', 'G15', 'G16', 'G18', 'G19', 'G20', 'G21'] },
  { name: 'guardrail-compliance', gateIds: ['G14'] },
];

// ---------------------------------------------------------------------------
// diff-material (R64, R67): which plan edits change scope
// ---------------------------------------------------------------------------

const { extractField, extractTasksRaw, taskSection, parseFilesEntries, sectionBody } = require('./plan-parse');

/** Lines from the `**label:**` line up to the next fenced-out `**`, `#` or `---` line; null when absent. */
function labelLines(sec, label) {
  const lines = sec.split('\n');
  const out = [];
  let open = 0;
  let found = false;
  for (const line of lines) {
    const f = line.match(/^\s*(`{3,})(.*)$/);
    const inFence = open > 0;
    if (open === 0 && f) open = f[1].length;
    else if (open > 0 && f && f[1].length >= open && f[2].trim() === '') open = 0;
    if (!inFence && !f && /^(\*\*|#|---$)/.test(line)) {
      if (found) break;
      if (line.startsWith(`**${label}:**`)) { found = true; out.push(line); }
      continue;
    }
    if (found) out.push(line);
  }
  return found ? out : null;
}

function tasksOf(text) {
  const map = new Map();
  for (const t of extractTasksRaw(text)) map.set(`Task ${t.number}`, taskSection(t.body));
  return map;
}

const squash = s => s.replace(/\s+/g, ' ').trim();

/**
 * Key -> normalised body of a section body. Key: table first cell, bullet bold
 * lead (or its first 60 chars) or `### ` heading. Body: the row's other cells,
 * the bullet text after its lead (plus indented continuation lines), or the
 * heading's section text; whitespace collapsed and trimmed.
 */
function sectionEntries(body, { bullets }) {
  const entries = new Map();
  let headerSeen = false;
  let cur = null; // key still collecting continuation lines
  const add = (key, text) => { entries.set(key, text); };
  for (const line of (body || '').split('\n')) {
    if (line.startsWith('|')) {
      cur = null;
      if (!headerSeen) { headerSeen = true; continue; }
      if (/^\|\s*:?-/.test(line)) continue;
      const cells = line.split('|').slice(1);
      if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
      add(cells[0].trim(), squash(cells.slice(1).map(c => c.trim()).join('|')));
    } else if (bullets && /^\s*[-*]\s+/.test(line)) {
      const text = line.replace(/^\s*[-*]\s+/, '');
      const b = text.match(/^\*\*(.+?)\*\*/);
      cur = b ? b[1] : text.slice(0, 60);
      add(cur, squash(b ? text.slice(b[0].length) : text));
    } else if (bullets && line.startsWith('### ')) {
      cur = line.slice(4).trim();
      add(cur, '');
    } else if (cur !== null && line.trim() !== '') {
      add(cur, squash(`${entries.get(cur)} ${line}`));
    }
  }
  return entries;
}

function setDelta(before, after) {
  const added = [...after.keys()].filter(k => !before.has(k)).sort();
  const removed = [...before.keys()].filter(k => !after.has(k)).sort();
  const changed = [...after.keys()].filter(k => before.has(k) && before.get(k) !== after.get(k)).sort();
  return added.length || removed.length || changed.length ? { added, removed, changed } : null;
}

function openspecRef(sec) {
  const block = labelLines(sec, 'openspec-task');
  if (!block) return null;
  for (const l of block) {
    const m = l.match(/^\s*-\s*ref:\s*(.+)$/);
    if (m) return m[1].trim();
  }
  return null;
}

function filesKey(sec) {
  return JSON.stringify([...new Set(parseFilesEntries(sec).map(e => `${e.kind}:${e.path}`))].sort());
}

function contractOf(sec) {
  const block = labelLines(sec, 'Contract');
  return block ? block.join('\n').trimEnd() : null;
}

/** Compare two plan texts: { material, triggers, details }. */
function diffMaterial(beforeText, afterText) {
  const before = tasksOf(beforeText);
  const after = tasksOf(afterText);
  const common = [...before.keys()].filter(k => after.has(k));
  const changed = fn => common.filter(k => fn(before.get(k)) !== fn(after.get(k))).sort();
  const triggers = [];
  const details = {};
  const fire = (name, detail) => { triggers.push(name); details[name] = detail; };

  if (before.size !== after.size) fire('taskCount', { before: before.size, after: after.size });
  const perTask = [
    ['files', filesKey],
    ['contracts', contractOf],
    ['dependsOn', sec => extractField(sec, 'Depends on')],
  ];
  for (const [name, fn] of perTask) {
    const refs = changed(fn);
    if (refs.length) fire(name, refs);
  }
  const kd = /^## Key Decisions\s*$/;
  const kdDelta = setDelta(sectionEntries(sectionBody(beforeText, kd), { bullets: true }), sectionEntries(sectionBody(afterText, kd), { bullets: true }));
  if (kdDelta) fire('keyDecisions', kdDelta);
  const refs = changed(openspecRef);
  if (refs.length) fire('openspec', refs);
  const dev = /^## Deviations & assumptions\s*$/;
  // Deviations compare the key set only (R64 clause is a MAY): bodies are dropped before the delta.
  const keysOnly = m => new Map([...m.keys()].map(k => [k, '']));
  const devDelta = setDelta(keysOnly(sectionEntries(sectionBody(beforeText, dev), { bullets: false })), keysOnly(sectionEntries(sectionBody(afterText, dev), { bullets: false })));
  if (devDelta) fire('deviations', { added: devDelta.added, removed: devDelta.removed });

  return { material: triggers.length > 0, triggers, details };
}

// ---------------------------------------------------------------------------
// g17-prepare (R31, R67): G17 dimension-coverage candidates by script
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { globToRegex, UNCOVERED_PATTERN_CATALOG } = require(path.join(__dirname, '..', 'skill', 'review'));
const { extractFrontmatter, parseSimpleYaml } = require('./yaml');

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const C3_GLOBS = ['**/auth/**', '**/secret*', '**/cred*', '**/iam/**', '**/crypto/**', '**/pii/**'];
const C4_GLOBS = ['**/infra/**', '**/terraform/**', '**/*.tf', '**/k8s/**', '**/helm/**', '**/docker*', '**/Dockerfile*'];
const EXT_VARIANTS = { '.js': ['.mjs', '.cjs'], '.ts': ['.mts', '.cts', '.tsx'], '.yml': ['.yaml'] };
const DOC_GLOBS = ['docs/**', 'README*'].map(globToRegex);

const firstSegment = p => p.split('/')[0];
const matchesAny = (globs, p) => globs.some(g => globToRegex(g).test(p));
const kebab = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const extFamily = (a, b) => (EXT_VARIANTS[a] || []).includes(b) || (EXT_VARIANTS[b] || []).includes(a);
const isDocPath = p => (DOC_GLOBS.some(re => re.test(p)) || p.endsWith('.md')) && !p.startsWith('plugins/sdlc-utilities/skills/');
const baseName = d => d.replace(/-review$/, '');

/** Copilot mirror path for a candidate, or null (Step J). */
function mirrorPath(kind, dimension, mirrorMap, githubHosting) {
  if (!githubHosting) return null;
  if (kind === 'CREATE') return `.github/instructions/${dimension}.instructions.md`;
  return mirrorMap[dimension] ? `.github/instructions/${mirrorMap[dimension]}.instructions.md` : null;
}

/** Candidates ordered by severity DESC, criteria count DESC, dimension ASC. */
function rankCandidates(candidates) {
  return candidates.slice().sort((a, b) =>
    (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0) ||
    b.criteria.length - a.criteria.length ||
    (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0));
}

function loadCatalog(dimensionsDir) {
  if (!fs.existsSync(dimensionsDir)) return [];
  return fs.readdirSync(dimensionsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .map(file => {
      const fm = parseSimpleYaml(extractFrontmatter(fs.readFileSync(path.join(dimensionsDir, file), 'utf8')) || '');
      const list = v => (Array.isArray(v) ? v : []);
      return { name: fm.name || file.slice(0, -3), file, triggers: list(fm.triggers), skipWhen: list(fm['skip-when']), severity: fm.severity };
    });
}

function createName(paths) {
  const entry = UNCOVERED_PATTERN_CATALOG.find(e => paths.some(p => e.test(p)));
  return entry ? entry.dimension : `${kebab(firstSegment(paths[0]))}-review`;
}

/** C1–C6 firings over the uncovered paths. */
function createFirings(uncovered, createSet, planSize, rootDir) {
  const out = [];
  const fire = (id, paths, severity, triggers) => out.push({ id, kind: 'CREATE', dimension: createName(paths), paths, severity, triggers });
  const bySegment = new Map();
  for (const p of uncovered) bySegment.set(firstSegment(p), [...(bySegment.get(firstSegment(p)) || []), p]);
  for (const [s, paths] of bySegment) {
    let isDir = false;
    try { isDir = fs.statSync(path.join(rootDir, s)).isDirectory(); } catch (_) { /* absent */ }
    if (paths.length >= 2 && !isDir) fire('C1', paths, 'medium', [`${s}/**`]);
  }
  const byDir = new Map();
  for (const p of uncovered.filter(x => createSet.has(x))) byDir.set(path.posix.dirname(p), [...(byDir.get(path.posix.dirname(p)) || []), p]);
  for (const [dir, paths] of byDir) if (paths.length >= 3) fire('C2', paths, 'medium', [`${dir}/**`]);
  for (const [id, globs, severity] of [['C3', C3_GLOBS, 'high'], ['C4', C4_GLOBS, 'critical']]) {
    const paths = uncovered.filter(p => matchesAny(globs, p));
    if (paths.length) fire(id, paths, severity, [globs.find(g => paths.some(p => globToRegex(g).test(p)))]);
  }
  if (uncovered.length >= 5 && bySegment.size >= 2) fire('C5', uncovered, 'medium', [...bySegment.keys()].map(s => `${s}/**`));
  if (uncovered.length === 1 && planSize >= 2 && !matchesAny([...C3_GLOBS, ...C4_GLOBS], uncovered[0])) fire('C6', uncovered, 'low', [uncovered[0]]);
  return out;
}

/** U1–U6 firings for one covered dimension. */
function updateFirings(dim, planPaths, taskLines) {
  const out = [];
  const fire = (id, p, severity, patch) => out.push({ id, kind: 'UPDATE-path', dimension: dim.name, paths: [p], severity, patch });
  for (const p of planPaths.filter(x => !dim.paths.includes(x))) {
    const pExt = path.posix.extname(p);
    let extFired = false;
    for (const t of dim.triggers) {
      if (globToRegex(t).test(p)) continue; // excluded by skip-when, not a stale trigger
      const tExt = path.posix.extname(t);
      const swapped = tExt && pExt && tExt !== pExt ? t.slice(0, -tExt.length) + pExt : null;
      if (swapped && extFamily(tExt, pExt)) { fire('U4', p, 'low', `add trigger \`${swapped}\``); extFired = true; }
      else if (swapped && globToRegex(swapped).test(p)) { fire('U1', p, 'medium', `add trigger \`${swapped}\``); extFired = true; }
      if (globToRegex(`**/${t}`).test(p)) fire('U2', p, 'medium', `add trigger \`**/${t}\``);
      const glob = t.search(/[*?[]/);
      const dir = (glob === -1 ? path.posix.dirname(t) : t.slice(0, t.lastIndexOf('/', glob) + 1)).replace(/\/$/, '');
      if (dir && dir !== '.' && taskLines.some(l => /\b(rename|move)\b/i.test(l) && l.includes(dir))) {
        fire('U3', p, 'high', `update triggers naming \`${dir}\` after the rename`);
      }
      if (glob === -1) {
        const tDir = path.posix.dirname(t);
        const inDir = planPaths.filter(x => path.posix.dirname(x) === tDir && !globToRegex(t).test(x));
        if (inDir.length >= 3 && inDir.includes(p)) fire('U6', p, 'medium', `replace trigger \`${t}\` with \`${tDir}/**\``);
      }
    }
    for (const t of dim.triggers) {
      const prefix = t.split('*')[0];
      if (!extFired && t.includes('**') && prefix && p.startsWith(prefix) && !globToRegex(t).test(p)) {
        fire('U5', p, 'medium', `widen trigger \`${t}\` to cover \`${p}\``);
      }
    }
  }
  return out;
}

/** Step H grouping: one candidate per (kind, dimension). */
function groupFirings(firings, mirrorMap, githubHosting) {
  const groups = new Map();
  for (const f of firings) {
    const key = `${f.kind}\0${f.dimension}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { kind: f.kind, dimension: f.dimension, criteria: [f.id], severity: f.severity, paths: [...f.paths], triggers: f.triggers && [...f.triggers], patch: f.patch });
      continue;
    }
    if (!g.criteria.includes(f.id)) g.criteria.push(f.id);
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[g.severity]) g.severity = f.severity;
    for (const p of f.paths) if (!g.paths.includes(p)) g.paths.push(p);
    for (const t of f.triggers || []) if (!g.triggers.includes(t)) g.triggers.push(t);
  }
  return [...groups.values()].map(g => {
    const c = { kind: g.kind, dimension: g.dimension, criteria: g.criteria, severity: g.severity, paths: g.paths };
    if (g.kind === 'CREATE') c.triggers = g.triggers;
    else c.patch = g.patch;
    c.copilotMirror = mirrorPath(g.kind, g.dimension, mirrorMap, githubHosting);
    return c;
  });
}

/** Step I: dimension name → harden-sdlc entry date within the window. */
function readDeferrals(learningsPath, windowDays, today) {
  let text;
  try {
    text = fs.readFileSync(learningsPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return new Map();
    throw Object.assign(new Error(`cannot read ${learningsPath}: ${err.message}`), { code: 'USAGE' });
  }
  const lines = text.split(/\r?\n/).slice(-100);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const deferred = new Map();
  lines.forEach((line, i) => {
    const h = line.match(/^## (\d{4}-\d{2}-\d{2}) — harden-sdlc:/);
    if (!h) return;
    const age = (todayMs - Date.parse(`${h[1]}T00:00:00Z`)) / 86400000;
    if (!(age >= 0 && age <= windowDays)) return;
    const dims = lines.slice(i + 1, i + 4).map(l => l.match(/^Dimensions:\s*(.+)$/)).find(Boolean);
    if (!dims) return;
    for (const name of dims[1].split(',').map(s => s.trim()).filter(Boolean)) if (!deferred.has(name)) deferred.set(name, h[1]);
  });
  return deferred;
}

/** G17 dimension-coverage material for one plan (Steps A–I). */
function g17Prepare({ planPath, dimensionsDir, instructionsDir, learningsPath, windowDays = 14, githubHosting = false, rootDir = process.cwd(), today = new Date().toISOString().slice(0, 10) }) {
  let content;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch (err) {
    throw Object.assign(new Error(`cannot read ${planPath}: ${err.message}`), { code: 'USAGE' });
  }
  if (!Number.isFinite(windowDays) || windowDays < 0) {
    throw Object.assign(new Error(`--window must be a non-negative number of days, got ${windowDays}`), { code: 'USAGE' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(`${today}T00:00:00Z`))) {
    throw Object.assign(new Error(`--today must be YYYY-MM-DD, got ${today}`), { code: 'USAGE' });
  }
  const appendix = content.search(/^## OpenSpec Appendix/m);
  const sections = extractTasksRaw(appendix === -1 ? content : content.slice(0, appendix)).map(t => taskSection(t.body));

  // A: plan path set
  const planPaths = [];
  const createSet = new Set();
  for (const e of sections.flatMap(s => parseFilesEntries(s)).filter(x => x.kind !== 'Test')) {
    if (!planPaths.includes(e.path)) planPaths.push(e.path);
    if (e.kind === 'Create') createSet.add(e.path);
  }
  const taskLines = sections.flatMap(s => s.split('\n'));

  // B, C: catalog and Copilot mirror map
  const catalog = loadCatalog(dimensionsDir);
  const mirrorMap = {};
  for (const d of catalog) {
    const hit = [d.file.slice(0, -3), d.name, d.name.replace(/-review$/, '')]
      .find(x => fs.existsSync(path.join(instructionsDir, `${x}.instructions.md`)));
    if (hit) mirrorMap[d.name] = hit;
  }

  // D: coverage
  const coveredDims = [];
  for (const d of catalog) {
    const trig = d.triggers.map(globToRegex);
    const skip = d.skipWhen.map(globToRegex);
    const paths = planPaths.filter(p => trig.some(re => re.test(p)) && !skip.some(re => re.test(p)));
    if (paths.length) coveredDims.push({ name: d.name, file: d.file, paths, triggers: d.triggers });
  }
  const uncoveredPaths = planPaths.filter(p => !coveredDims.some(d => d.paths.includes(p)));

  // E, F: fired criteria
  const firings = createFirings(uncoveredPaths, createSet, planPaths.length, rootDir);
  if (!planPaths.every(isDocPath)) for (const d of coveredDims) firings.push(...updateFirings(d, planPaths, taskLines));

  // H: suppression, grouping, ranking
  const grouped = groupFirings(firings, mirrorMap, githubHosting)
    .filter(c => c.kind !== 'CREATE' || planPaths.length !== 1 || c.criteria.includes('C3') || c.criteria.includes('C4'));
  const ranked = rankCandidates(grouped);

  // I: harden-sdlc deferral
  const deferrals = readDeferrals(learningsPath, windowDays, today);
  const candidates = [];
  const suppressed = [];
  for (const c of ranked) {
    const hit = [...deferrals.keys()].find(n => baseName(n) === baseName(c.dimension));
    if (hit) suppressed.push({ dimension: c.dimension, reason: `deferred: harden-sdlc ${deferrals.get(hit)}` });
    else candidates.push(c);
  }

  return {
    planPaths,
    coveredDims: coveredDims.map(({ name, file, paths }) => ({ name, file, paths })),
    uncoveredPaths,
    firedCriteria: firings.map(({ id, kind, dimension, paths, severity }) => ({ id, kind, dimension, paths, severity })),
    candidates,
    mirrorMap,
    deferred: [...deferrals.keys()],
    suppressed,
    githubHosting,
  };
}

// ---------------------------------------------------------------------------
// merge-lanes (R35, R36, R40, R67): lane, PF, lens and G17 merge; scorecard
// ---------------------------------------------------------------------------

const EXPECTED_GATES = Array.from({ length: 21 }, (_, i) => `G${i + 1}`);
const PF_GATES = { PF4: ['G3', 'G12'], PF12: ['G4'], PF13: ['G10'] };
const LENS_NAMES = ['architecture', 'requirements', 'risk', 'all'];
const LENS_STATUSES = ['Approved', 'Issues Found'];
const SCORECARD_DIMENSIONS = ['Completeness', 'Correctness', 'Coherence'];
const SCORECARD_SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const VERDICTS = {
  critical: '…Fix before archiving.',
  warning: '…Ready for archive (with noted improvements).',
  pass: 'All checks passed. Ready for archive.',
};

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const prefix = m => String(m || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

/** Parsed JSON from `file` when `valid(value)`, else `{ reason }`. */
function readResult(file, valid) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { reason: err && err.code === 'ENOENT' ? 'no result file' : `cannot read result file (${(err && err.code) || 'error'})` };
  }
  try {
    const value = JSON.parse(text);
    return valid(value) ? { value } : { reason: 'invalid JSON' };
  } catch (_) {
    return { reason: 'invalid JSON' };
  }
}

/** Parsed JSON of an optional flag file; USAGE error when unreadable or not JSON. */
function readFlagJson(flag, file) {
  if (file === null || file === undefined) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw Object.assign(new Error(`cannot read ${flag} ${file}: ${err.message}`), { code: 'USAGE' });
  }
}

/** Items whose key(item) is new, first occurrence wins. */
function dedupBy(items, key) {
  const seen = new Set();
  return items.filter(i => {
    const k = key(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function laneFailureIssue(lane, reason, gateIds) {
  return {
    gateId: 'lane-failure',
    taskRef: null,
    severity: 'error',
    message: `Lane ${lane} failed: ${reason} — gate IDs ${gateIds.join(', ')} not evaluated`,
    blocking: true,
    lane,
  };
}

/** Markdown of the `## Suggested Review Dimensions` section; '' when no findings. */
function renderG17(findings, n) {
  if (!findings.length) return '';
  const parts = ['## Suggested Review Dimensions'];
  for (const f of findings) {
    parts.push(f.kind === 'CREATE' ? `### CREATE: ${f.dimension}` : `### UPDATE: ${f.dimension} (${f.criteria.join(', ')})`);
    parts.push(`**Why:** ${f.why}`, `**Severity hint:** ${f.severity_hint}`);
    if (f.kind === 'CREATE') parts.push(`**Triggers:** ${f.triggers.map(g => `\`${g}\``).join(', ')}`);
    else parts.push(`**Patch:** ${f.patch}`);
    parts.push(`**Action (dimension):** ${f.actions.dimension}`);
    if (f.actions.copilot_mirror !== null) parts.push(`**Action (Copilot mirror, X1):** ${f.actions.copilot_mirror}`);
  }
  if (n > 0) parts.push(`_${n} additional candidates suppressed_`);
  return parts.join('\n\n');
}

/** G17 findings from g17-prepare candidates plus the dimension-coverage lane (B1–B4, why). */
function g17Findings(dir, dcCandidates, laneFailures) {
  const prep = readResult(path.join(dir, 'g17-prepare.json'), v => isObject(v) && Array.isArray(v.candidates));
  if (prep.reason) laneFailures.push({ lane: 'g17-prepare', reason: prep.reason, advisory: true });
  const p = prep.value || { candidates: [] };
  const coveredDims = p.coveredDims || [];
  const mirrorMap = p.mirrorMap || {};
  const deferred = p.deferred || [];
  const key = c => `${c.kind}\0${c.dimension}`;
  const whyByKey = new Map(dcCandidates.map(c => [key(c), c.why]));

  const pool = p.candidates.map(c => ({ ...c, why: whyByKey.get(key(c)) || '' }));
  const known = new Set(pool.map(key));
  for (const c of dcCandidates) {
    if (c.kind !== 'UPDATE-behavior' || known.has(key(c)) || deferred.includes(c.dimension)) continue;
    known.add(key(c));
    pool.push({ ...c, criteria: Array.isArray(c.criteria) ? c.criteria : [], why: c.why || '' });
  }
  const ranked = rankCandidates(pool);
  const kept = ranked.slice(0, 3);
  const suppressedCount = (p.suppressed || []).length + (ranked.length - kept.length);

  const findings = kept.map(c => {
    const f = { kind: c.kind, dimension: c.dimension, criteria: c.criteria, severity_hint: c.severity, why: c.why };
    let action;
    if (c.kind === 'CREATE') {
      f.triggers = c.triggers || [];
      action = `/setup-sdlc --dimensions — add \`${c.dimension}\` with triggers ${f.triggers.map(g => `\`${g}\``).join(', ')}`;
    } else {
      f.patch = c.patch;
      const dim = coveredDims.find(d => d.name === c.dimension);
      action = `edit \`.sdlc/review-dimensions/${dim ? dim.file : `${c.dimension}.md`}\` — ${c.patch}`;
    }
    const mirror = mirrorPath(c.kind, c.dimension, mirrorMap, p.githubHosting === true);
    f.actions = { dimension: action, copilot_mirror: mirror ? `regenerate ${mirror} per setup-sdlc/setup-dimensions.md Step 8 transform` : null };
    return f;
  });
  return { findings, suppressed_count: suppressedCount, rendering: renderG17(findings, suppressedCount) };
}

/** Gate B scorecard: dimension counts, traceability rows, verdict and markdown. */
function renderScorecard(lensResults, gateAFindings, inventory) {
  const allIssues = lensResults.flatMap(l => l.issues);
  const counts = {};
  for (const dim of SCORECARD_DIMENSIONS) {
    const c = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0, PASS: 0 };
    for (const i of allIssues) if (i.dimension === dim && SCORECARD_SEVERITIES.includes(i.severity)) c[i.severity]++;
    c.PASS = lensResults.filter(l => l.status === 'Approved' && !l.issues.some(i => i.dimension === dim)).length;
    counts[dim] = c;
  }

  const lensRows = lensResults.filter(l => l.name === 'requirements' || l.name === 'all').flatMap(l => l.traceability);
  const traceability = Array.isArray(inventory)
    ? inventory.map(({ reqId, name }) => {
      const row = lensRows.find(r => r.requirement === reqId);
      return { requirement: reqId, name, status: row ? row.status : 'uncovered', taskRefs: row && Array.isArray(row.taskRefs) ? row.taskRefs : [] };
    })
    : lensRows;

  const severities = [...allIssues.map(i => i.severity), ...gateAFindings.map(f => f && f.severity)];
  const verdict = severities.includes('CRITICAL') ? VERDICTS.critical
    : severities.includes('WARNING') ? VERDICTS.warning
      : VERDICTS.pass;

  const lines = ['## Verification Scorecard', '', '| Dimension | CRITICAL | WARNING | SUGGESTION | PASS |', '|---|---|---|---|---|'];
  for (const dim of SCORECARD_DIMENSIONS) {
    const c = counts[dim];
    lines.push(`| ${dim} | ${c.CRITICAL} | ${c.WARNING} | ${c.SUGGESTION} | ${c.PASS} |`);
  }
  lines.push('', '### Traceability', '');
  if (!Array.isArray(inventory)) lines.push('*(Matrix built from requirements checklist — requirement inventory unavailable)*', '');
  lines.push('| Requirement | Covering task(s) | Status |', '|---|---|---|');
  for (const r of traceability) {
    const refs = Array.isArray(r.taskRefs) && r.taskRefs.length ? r.taskRefs.join(', ') : '—';
    lines.push(`| ${r.requirement} ${r.name} | ${refs} | ${r.status} |`);
  }
  lines.push('', `**Verdict:** ${verdict}`);
  return { counts, traceability, verdict, markdown: lines.join('\n') };
}

/** Merge lane, validator, lens and G17 results from one critique iteration directory. */
function mergeLanes({ dir, lanes = [], lenses = [], noGuardrails = false, gateAPath = null, inventoryPath = null }) {
  const usage = message => Object.assign(new Error(message), { code: 'USAGE' });
  if (!lanes.length && !lenses.length) throw usage('--lanes or --lenses is required');
  for (const name of lanes) {
    if (name !== 'dimension-coverage' && !LANE_DEFS.some(d => d.name === name)) throw usage(`unknown lane ${name}`);
  }
  for (const name of lenses) if (!LENS_NAMES.includes(name)) throw usage(`unknown lens ${name}`);
  const inventory = readFlagJson('--inventory', inventoryPath);
  const gateA = readFlagJson('--gate-a', gateAPath);

  const laneFailures = [];
  const laneIssues = [];
  const passes = [];
  const covered = [];
  const addAll = (target, items) => { for (const x of items) if (!target.includes(x)) target.push(x); };
  let guardrailCompliancePayload = null;
  let dcCandidates = null;

  // Lane result files
  const laneNames = noGuardrails && !lanes.includes('guardrail-compliance') ? [...lanes, 'guardrail-compliance'] : lanes;
  for (const name of laneNames) {
    if (name === 'dimension-coverage') {
      const r = readResult(path.join(dir, `${name}.json`), v => isObject(v) && Array.isArray(v.candidates));
      if (r.reason) laneFailures.push({ lane: name, reason: r.reason, advisory: true });
      else { dcCandidates = r.value.candidates.filter(isObject); addAll(covered, ['G17']); }
      continue;
    }
    const ids = LANE_DEFS.find(d => d.name === name).gateIds;
    const r = name === 'guardrail-compliance' && noGuardrails
      ? { value: { gateIds: ['G14'], issues: [], passes: ['G14'], laneStatus: 'ok', guardrailCompliancePayload: 'No active guardrails configured.' } }
      : readResult(path.join(dir, `${name}.json`), v => isObject(v) && Array.isArray(v.gateIds) && Array.isArray(v.issues));
    if (r.reason) {
      laneFailures.push({ lane: name, reason: r.reason, advisory: false });
      laneIssues.push(laneFailureIssue(name, r.reason, ids));
      continue;
    }
    const lane = r.value;
    if (lane.laneStatus !== 'ok') {
      const reason = `laneStatus ${lane.laneStatus}`;
      laneFailures.push({ lane: name, reason, advisory: false });
      laneIssues.push(laneFailureIssue(name, reason, ids));
    }
    laneIssues.push(...lane.issues.filter(isObject).map(i => ({ ...i, lane: name })));
    addAll(passes, Array.isArray(lane.passes) ? lane.passes : []);
    addAll(covered, lane.gateIds);
    if (name === 'guardrail-compliance') guardrailCompliancePayload = lane.guardrailCompliancePayload ?? null;
  }

  // Validator report (PF4, PF12, PF13) and gate coverage
  let coverage = null;
  if (lanes.length) {
    const pf = readResult(path.join(dir, 'pf-report.json'), v => isObject(v) && Array.isArray(v.checks));
    if (pf.reason) {
      laneFailures.push({ lane: 'validate-plan-format', reason: pf.reason, advisory: false });
      laneIssues.push(laneFailureIssue('validate-plan-format', pf.reason, ['G3', 'G4', 'G10', 'G12']));
    } else {
      for (const check of pf.value.checks.filter(c => isObject(c) && PF_GATES[c.id])) {
        const gates = PF_GATES[check.id];
        addAll(covered, gates);
        if (check.status === 'pass') addAll(passes, gates);
        if (check.status !== 'fail') continue;
        const details = Array.isArray(check.details) && check.details.length
          ? check.details
          : [{ gateId: gates[0], taskRef: null, message: check.message }];
        for (const d of details) {
          laneIssues.push({ gateId: d.gateId, taskRef: d.taskRef, message: d.message, severity: 'error', blocking: true, lane: 'validate-plan-format' });
        }
      }
    }
    const missing = EXPECTED_GATES.filter(g => g !== 'G17' && !covered.includes(g));
    for (const g of missing) {
      laneIssues.push({ gateId: g, taskRef: null, severity: 'error', message: `Gate ${g} not evaluated by any lane`, blocking: true, lane: 'merge-lanes' });
    }
    coverage = { expected: EXPECTED_GATES, covered, missing };
  }

  // Lens results
  const lensResults = lenses.map(name => {
    const r = readResult(path.join(dir, `lens-${name}.json`), v => isObject(v) && LENS_STATUSES.includes(v.status) && Array.isArray(v.issues));
    const tag = i => ({ ...i, gateId: null, lane: `lens:${name}`, blocking: i.severity === 'CRITICAL' ? true : i.blocking });
    if (r.reason) {
      return { name, status: 'Issues Found', recommendations: [], traceability: [], issues: [tag({ taskRef: null, message: `Lens ${name} returned no valid JSON`, severity: 'WARNING', dimension: null, blocking: true })] };
    }
    const v = r.value;
    return {
      name,
      status: v.status,
      issues: v.issues.filter(isObject).map(tag),
      recommendations: Array.isArray(v.recommendations) ? v.recommendations : [],
      traceability: Array.isArray(v.traceability) ? v.traceability.filter(isObject) : [],
    };
  });
  const lensIssues = dedupBy(lensResults.flatMap(l => l.issues), i => `${i.taskRef}\0${prefix(i.message)}`);
  const lens = lenses.length ? {
    status: lensResults.every(l => l.status === 'Approved') ? 'Approved' : 'Issues Found',
    issues: lensIssues,
    recommendations: dedupBy(lensResults.flatMap(l => l.recommendations), s => String(s).slice(0, 60)),
  } : null;

  const issues = dedupBy(
    [...dedupBy(laneIssues, i => `${i.gateId}\0${i.taskRef}\0${prefix(i.message)}`), ...lensIssues],
    i => `${i.taskRef}\0${prefix(i.message)}`,
  );

  return {
    issues,
    passes,
    coverage,
    laneFailures,
    guardrailCompliancePayload,
    g17Findings: lanes.length ? g17Findings(dir, dcCandidates || [], laneFailures) : null,
    lens,
    scorecard: lenses.length ? renderScorecard(lensResults, isObject(gateA) && Array.isArray(gateA.findings) ? gateA.findings : [], inventory) : null,
    blockingCount: issues.filter(i => i.blocking === true).length,
  };
}

module.exports = {
  LANE_DEFS, diffMaterial, g17Prepare, mirrorPath, rankCandidates, SEVERITY_RANK,
  EXPECTED_GATES, PF_GATES, mergeLanes, renderG17, renderScorecard,
};
