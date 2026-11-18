#!/usr/bin/env node
/**
 * validate-args-rule.js
 *
 * Enforce the arguments rule: a skill never pastes the raw `$ARGUMENTS` string
 * into a fenced command unless its argument-hint is flags only (or a typed
 * positional the skill declares).
 *
 * Usage:
 *   node validate-args-rule.js [--root <dir>] [--json]
 *
 * Scans <root>/plugins/*\/skills/<skill>/*.md, every fenced block.
 *
 * Findings:
 *   ARGS_IN_REQUEST_SKILL  request-text skill has $ARGUMENTS in a fence
 *   ARGS_NOT_FLAGS_ONLY    $ARGUMENTS in a fence; hint group is not a flag or typed positional
 *   ARGS_NO_HINT           $ARGUMENTS in a fence; SKILL.md has no argument-hint
 *
 * Exit codes: 0 no findings, 1 findings, 2 usage or read error.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUEST_TEXT_SKILLS = ['error-report-sdlc', 'github-sdlc', 'harden-sdlc', 'jira-sdlc',
  'plan-sdlc', 'received-review-sdlc', 'verify-pipeline-sdlc'];
const TYPED_POSITIONALS = { 'execute-plan-sdlc': ['<plan-file-path>'], 'version-sdlc': ['major|minor|patch|<label>'] };

function parseArgs(argv) {
  const args = argv.slice(2);
  let root = process.cwd();
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--root' && args[i + 1]) root = path.resolve(args[++i]);
    else if (a === '--json') json = true;
    else return { error: `unknown argument: ${a}` };
  }
  return { root, json };
}

/** Split a hint into groups: top-level [...] groups plus bare tokens; <...> is opaque. */
function parseHintGroups(hint) {
  const groups = [];
  let depthBracket = 0;
  let depthAngle = 0;
  // Pass 1: walk characters, cutting top-level bracket groups and bare tokens.
  let buf = '';
  for (const ch of hint) {
    if (ch === '<') depthAngle++;
    else if (ch === '>' && depthAngle > 0) depthAngle--;
    if (depthAngle === 0 && ch === '[') {
      if (depthBracket === 0) {
        if (buf.trim()) groups.push({ text: buf.trim(), bracketed: false });
        buf = '';
      }
      depthBracket++;
      if (depthBracket === 1) continue;
    } else if (depthAngle === 0 && ch === ']' && depthBracket > 0) {
      depthBracket--;
      if (depthBracket === 0) {
        groups.push({ text: `[${buf.trim()}]`, bracketed: true });
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) groups.push({ text: buf.trim(), bracketed: false });

  // Pass 2: split bare groups into tokens; a --x token starts a group, a following non-`--` token is its value.
  const out = [];
  for (const g of groups) {
    if (g.bracketed) { out.push(g.text); continue; }
    const toks = [];
    let t = '';
    let ang = 0;
    for (const ch of g.text) {
      if (ch === '<') ang++;
      else if (ch === '>' && ang > 0) ang--;
      if (/\s/.test(ch) && ang === 0) { if (t) toks.push(t); t = ''; } else t += ch;
    }
    if (t) toks.push(t);
    let curGroup = null;
    for (const tok of toks) {
      if (tok.startsWith('--')) { if (curGroup) out.push(curGroup); curGroup = tok; }
      else if (curGroup) { out.push(`${curGroup} ${tok}`); curGroup = null; }
      else out.push(tok);
    }
    if (curGroup) out.push(curGroup);
  }
  return out;
}

function readHint(text) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^argument-hint:\s*(.*)$/m);
  if (!m) return null;
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
}

/** Line numbers (1-based) of `$ARGUMENTS` inside fenced blocks (any info string). */
function argumentLinesInFences(text) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  let fence = null;
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1];
      else if (m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*[`~]+\s*$/.test(line)) fence = null;
      return;
    }
    if (fence && line.includes('$ARGUMENTS')) hits.push(i + 1);
  });
  return hits;
}

function isAllowedGroup(skill, group) {
  const inner = group.replace(/^\[|\]$/g, '').trim();
  if (inner.startsWith('--')) return true;
  return (TYPED_POSITIONALS[skill] || []).includes(inner);
}

function scan(root) {
  const findings = [];
  const pluginsDir = path.join(root, 'plugins');
  if (!fs.existsSync(pluginsDir)) return findings;
  for (const plugin of fs.readdirSync(pluginsDir).sort()) {
    const skillsDir = path.join(pluginsDir, plugin, 'skills');
    if (!fs.existsSync(skillsDir) || !fs.statSync(skillsDir).isDirectory()) continue;
    for (const skill of fs.readdirSync(skillsDir).sort()) {
      const dir = path.join(skillsDir, skill);
      if (!fs.statSync(dir).isDirectory()) continue;
      const skillMd = path.join(dir, 'SKILL.md');
      const hint = fs.existsSync(skillMd) ? readHint(fs.readFileSync(skillMd, 'utf8')) : null;
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
        const rel = path.relative(root, path.join(dir, f));
        const lines = argumentLinesInFences(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const line of lines) {
          const base = { skill, file: rel, line };
          if (REQUEST_TEXT_SKILLS.includes(skill)) {
            findings.push({ code: 'ARGS_IN_REQUEST_SKILL', ...base, detail: '' });
          } else if (hint === null) {
            findings.push({ code: 'ARGS_NO_HINT', ...base, detail: '' });
          } else {
            for (const g of parseHintGroups(hint)) {
              if (!isAllowedGroup(skill, g)) findings.push({ code: 'ARGS_NOT_FLAGS_ONLY', ...base, detail: g });
            }
          }
        }
      }
    }
  }
  findings.sort((a, b) => a.skill.localeCompare(b.skill) || a.file.localeCompare(b.file) || a.line - b.line);
  return findings;
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.error) {
    process.stderr.write(`validate-args-rule: ${opts.error}\n`);
    process.exit(2);
  }
  let findings;
  try {
    findings = scan(opts.root);
  } catch (e) {
    process.stderr.write(`validate-args-rule: ${e.message}\n`);
    process.exit(2);
  }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  } else {
    for (const f of findings) {
      const d = f.code === 'ARGS_NOT_FLAGS_ONLY' ? ` "${f.detail}"` : '';
      process.stdout.write(`${f.code}: ${f.skill} ${f.file}:${f.line}${d}\n`);
    }
    process.stdout.write(`validate-args-rule: ${findings.length} findings\n`);
  }
  process.exit(findings.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { REQUEST_TEXT_SKILLS, TYPED_POSITIONALS, parseHintGroups };
