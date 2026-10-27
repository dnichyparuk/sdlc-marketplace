#!/usr/bin/env node
/**
 * session-map.js
 *
 * Build the tag -> transcript map that session-cost.js --sessions reads, by
 * matching each top-level session transcript of an agent's project directory
 * against the agent's time windows. Only the head of each transcript (up to
 * its first user message) is read; nothing under --projects-dir is written.
 *
 * Usage:
 *   node session-map.js (--agents <file.json> | --events <file.jsonl>)… (--json | --map-out <file>) [options]
 *
 * Options:
 *   --agents <file.json>   JSON object: tag -> array of { name?, cwd, from?, to?, firstPrompt? }
 *                          (cwd: the agent's worktree path; from/to: ISO times; firstPrompt: a
 *                          regular expression on the session's first user prompt)
 *   --events <file.jsonl>  one JSON object per line: { ts, tag, cwd, event: start|clear|exit };
 *                          each start/clear opens a window that the next event of that tag+cwd closes
 *   --window <from>/<to>   default ISO window for --agents entries without their own from/to
 *   --projects-dir <dir>   transcript root (default: ~/.claude/projects); never written
 *   --json                 print { schema, map, unassigned } to stdout
 *   --map-out <file>       write only `map` (the session-cost.js --sessions format) to <file>
 *   --help                 print this usage text
 *
 * Exit codes: 0 map built (also with unassigned entries); 2 usage, IO or parse error.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCHEMA = 'sdlc-session-map-1';
const CHUNK = 64 * 1024;
const HEAD_CAP = 1024 * 1024;
const EVENTS = ['start', 'clear', 'exit'];

class CliError extends Error {
  constructor(message, code = 2) {
    super(message);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function usageText() {
  const src = fs.readFileSync(__filename, 'utf8');
  const header = src.slice(src.indexOf('/**') + 3, src.indexOf('*/'));
  return header
    .split('\n')
    .map((l) => l.replace(/^ \* ?/, ''))
    .join('\n')
    .trim() + '\n';
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    agents: [],
    events: [],
    window: null,
    projectsDir: path.join(os.homedir(), '.claude', 'projects'),
    mapOut: null,
    json: false,
    help: false,
  };
  const repeated = { '--agents': 'agents', '--events': 'events' };
  const valued = { '--window': 'window', '--projects-dir': 'projectsDir', '--map-out': 'mapOut' };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help') {
      opts.help = true;
      return opts;
    } else if (a === '--json') {
      opts.json = true;
    } else if (Object.prototype.hasOwnProperty.call(valued, a) || Object.prototype.hasOwnProperty.call(repeated, a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) throw new CliError(`missing value for ${a}`);
      if (repeated[a]) opts[repeated[a]].push(v);
      else opts[valued[a]] = v;
      i++;
    } else {
      throw new CliError(`unknown flag: ${a}`);
    }
  }

  if (opts.agents.length === 0 && opts.events.length === 0) throw new CliError('one of --agents or --events is required');
  if (!opts.json && !opts.mapOut) throw new CliError('one of --json or --map-out is required');
  return opts;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new CliError(`${file}: ${err.message}`);
  }
}

function readJson(file) {
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new CliError(`${file}: invalid JSON: ${err.message}`);
  }
}

function readJsonl(file) {
  const rows = [];
  readText(file).split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      rows.push(JSON.parse(line));
    } catch (err) {
      throw new CliError(`${file}:${i + 1}: invalid JSON: ${err.message}`);
    }
  });
  return rows;
}

/** ISO time -> epoch ms; anything else -> CliError. */
function parseTime(value, label) {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) throw new CliError(`${label}: not an ISO time: ${JSON.stringify(value)}`);
  return ms;
}

function parseWindow(value) {
  const parts = value.split('/');
  if (parts.length !== 2) throw new CliError(`bad --window: ${value} (expected <from>/<to>)`);
  const from = parseTime(parts[0], '--window from');
  const to = parseTime(parts[1], '--window to');
  if (from >= to) throw new CliError(`bad --window: ${value} (from must precede to)`);
  return { from, to };
}

// ---------------------------------------------------------------------------
// Transcripts (read-only)
// ---------------------------------------------------------------------------

/** Claude Code's project directory name for a working directory. */
function encodeProjectDir(cwd) {
  return cwd.replace(/[^A-Za-z0-9-]/g, '-');
}

/**
 * Read a transcript up to its first user message (64 KiB chunks, at most
 * 1 MiB) -> { start, prompt, end }.
 */
function readHead(file) {
  let start = null;
  let prompt = null;
  let rest = '';
  let read = 0;
  let done = false;
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(CHUNK);
    while (!done && read < HEAD_CAP) {
      const n = fs.readSync(fd, buf, 0, Math.min(CHUNK, HEAD_CAP - read), read);
      const eof = n === 0;
      read += n;
      rest += buf.toString('utf8', 0, n);
      const lines = rest.split('\n');
      rest = eof ? '' : lines.pop();
      for (const line of lines) {
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (!row || typeof row !== 'object') continue;
        if (start === null && typeof row.timestamp === 'string') start = row.timestamp;
        if (row.type === 'user') {
          prompt = promptText(row.message && row.message.content);
          done = true;
          break;
        }
      }
      if (eof) break;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { start, prompt, end: fs.statSync(file).mtime.toISOString() };
}

function promptText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  return content
    .filter((c) => c && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function agentWindows(file, agents, window, tags) {
  if (!agents || typeof agents !== 'object' || Array.isArray(agents)) throw new CliError(`${file}: expected a JSON object`);
  const windows = [];
  for (const [tag, entries] of Object.entries(agents)) {
    if (!Array.isArray(entries)) throw new CliError(`${file}: tag ${tag}: expected an array`);
    tags.add(tag);
    entries.forEach((e, i) => {
      const label = `${file}: ${tag}[${i}]`;
      if (!e || typeof e !== 'object' || typeof e.cwd !== 'string') throw new CliError(`${label}: entry without a string cwd`);
      let firstPrompt = null;
      if (e.firstPrompt !== undefined) {
        if (typeof e.firstPrompt !== 'string') throw new CliError(`${label}: firstPrompt must be a string`);
        try {
          firstPrompt = new RegExp(e.firstPrompt);
        } catch (err) {
          throw new CliError(`${label}: invalid firstPrompt: ${err.message}`);
        }
      }
      const own = e.from !== undefined || e.to !== undefined;
      windows.push({
        tag,
        cwd: e.cwd,
        from: own ? (e.from === undefined ? null : parseTime(e.from, `${label}.from`)) : (window ? window.from : null),
        to: own ? (e.to === undefined ? null : parseTime(e.to, `${label}.to`)) : (window ? window.to : null),
        firstPrompt,
      });
    });
  }
  return windows;
}

function eventWindows(file, events, tags) {
  const groups = new Map();
  events.forEach((ev, i) => {
    const label = `${file}:${i + 1}`;
    if (!ev || typeof ev !== 'object' || typeof ev.tag !== 'string' || typeof ev.cwd !== 'string' || !EVENTS.includes(ev.event)) {
      throw new CliError(`${label}: bad event (expected { ts, tag, cwd, event: start|clear|exit })`);
    }
    const ts = parseTime(ev.ts, `${label}: bad event ts`);
    tags.add(ev.tag);
    const key = JSON.stringify([ev.tag, ev.cwd]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ts, tag: ev.tag, cwd: ev.cwd, event: ev.event });
  });
  const windows = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.ts - b.ts);
    list.forEach((ev, i) => {
      if (ev.event === 'exit') return;
      const next = list[i + 1];
      windows.push({ tag: ev.tag, cwd: ev.cwd, from: ev.ts, to: next ? next.ts : null, firstPrompt: null });
    });
  }
  return windows;
}

/** All windows from every --agents and --events file, plus tags in input order. */
function buildWindows(agents, events, window) {
  const tags = new Set();
  const windows = [];
  for (const [file, data] of agents) windows.push(...agentWindows(file, data, window, tags));
  for (const [file, rows] of events) windows.push(...eventWindows(file, rows, tags));
  return { tags: [...tags], windows };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

function matches(w, s) {
  if (s.startMs === null) return w.from === null && w.to === null;
  if (w.from !== null && s.startMs < w.from) return false;
  if (w.to !== null && s.startMs >= w.to) return false;
  return w.firstPrompt === null || (s.prompt !== null && w.firstPrompt.test(s.prompt));
}

/** sessions: [{ path, dir, start, end, prompt }] -> { map, unassigned } (map keyed by tag). */
function assign(sessions, windows) {
  const map = {};
  const unassigned = [];
  for (const s of sessions) {
    const parsed = s.start === null ? NaN : Date.parse(s.start);
    const session = { ...s, startMs: Number.isNaN(parsed) ? null : parsed };
    const candidates = [...new Set(windows.filter((w) => encodeProjectDir(w.cwd) === s.dir && matches(w, session)).map((w) => w.tag))].sort();
    const base = { path: s.path, start: s.start, end: s.end };
    if (candidates.length === 0) unassigned.push({ ...base, reason: 'outside-window' });
    else if (candidates.length > 1) unassigned.push({ ...base, reason: 'ambiguous', candidates });
    else (map[candidates[0]] = map[candidates[0]] || []).push(session);
  }
  return { map, unassigned };
}

function byStartThenPath(a, b) {
  const sa = a.startMs === null ? -Infinity : a.startMs;
  const sb = b.startMs === null ? -Infinity : b.startMs;
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Sessions of every project dir the windows name, plus no-project-dir entries. */
function collectSessions(projectsDir, windows) {
  const sessions = [];
  const missing = [];
  const seenCwd = new Set();
  const seenDir = new Set();
  for (const w of windows) {
    if (seenCwd.has(w.cwd)) continue;
    seenCwd.add(w.cwd);
    const dir = encodeProjectDir(w.cwd);
    const abs = path.join(projectsDir, dir);
    let isDir = false;
    try {
      isDir = fs.statSync(abs).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      missing.push({ path: dir, start: null, end: null, reason: 'no-project-dir' });
      continue;
    }
    if (seenDir.has(dir)) continue;
    seenDir.add(dir);
    let names;
    try {
      names = fs.readdirSync(abs, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.jsonl'))
        .map((d) => d.name)
        .sort();
    } catch (err) {
      throw new CliError(`${abs}: ${err.message}`);
    }
    for (const name of names) {
      let head;
      try {
        head = readHead(path.join(abs, name));
      } catch (err) {
        throw new CliError(`${path.join(abs, name)}: ${err.message}`);
      }
      sessions.push({ path: `${dir}/${name}`, dir, ...head });
    }
  }
  return { sessions, missing };
}

function isInside(dir, file) {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    process.stdout.write(usageText());
    return 0;
  }
  opts.projectsDir = path.resolve(opts.projectsDir);
  if (opts.mapOut && isInside(opts.projectsDir, path.resolve(opts.mapOut))) {
    throw new CliError(`--map-out must not be inside --projects-dir: ${opts.mapOut}`);
  }
  const window = opts.window === null ? null : parseWindow(opts.window);

  const agents = opts.agents.map((f) => [f, readJson(f)]);
  const events = opts.events.map((f) => [f, readJsonl(f)]);
  const { tags, windows } = buildWindows(agents, events, window);
  const { sessions, missing } = collectSessions(opts.projectsDir, windows);
  const assigned = assign(sessions, windows);

  const map = {};
  for (const tag of tags) map[tag] = (assigned.map[tag] || []).sort(byStartThenPath).map((s) => s.path);
  const unassigned = [...missing, ...assigned.unassigned].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  if (opts.mapOut) {
    try {
      fs.writeFileSync(opts.mapOut, `${JSON.stringify(map, null, 2)}\n`);
    } catch (err) {
      throw new CliError(`${opts.mapOut}: ${err.message}`);
    }
  }
  if (opts.json) process.stdout.write(`${JSON.stringify({ schema: SCHEMA, map, unassigned }, null, 2)}\n`);
  return 0;
}

module.exports = { SCHEMA, encodeProjectDir, readHead, buildWindows, assign, CliError };

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    process.stderr.write(`session-map: ${err.message}\n`);
    process.exit(err instanceof CliError ? err.code : 2);
  }
}
