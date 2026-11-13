/**
 * github-content.js
 * Pure text rules for github-sdlc write payloads (spec R12, R13, R15, R16, R34): placeholders, headings against a
 * resolved template, mentions, references, the duplicate marker, title and acceptance-criteria shape.
 * `skill/github.js` calls them from `--check-payload`; nothing here touches the network or the disk.
 *
 * Exports: stripNonNotifying, findPlaceholders, checkHeadings, findMentions, findRefs, findDuplicateMarker,
 *          checkTitle, checkAcceptance
 */

'use strict';

const path = require('path');

const { extractHeadings } = require(path.join(__dirname, '..', '..', 'skills', 'jira-sdlc', 'lib', 'template-fingerprint'));

const ACCEPTANCE_HEADING = 'Acceptance Criteria';
const FILLER_OPENING_RE = /^\s*(?:this issue|we need to)\b/i;
const CHECKLIST_RE = /^\s*[-*]\s+\[[ xX]\]\s+\S/;
const DUPLICATE_RE = /^\s*duplicate of\s+(?:#\d+|[\w-]+\/[\w.-]+#\d+|https?:\/\/\S+\/(?:issues|pull)\/\d+)/i;

/** Replace every match with spaces of the same length (newlines kept), so line numbers and offsets hold. */
const blank = (s) => s.replace(/[^\n]/g, ' ');

/** Mask fenced blocks and code spans; HTML comments too when `comments` is true. */
function mask(text, comments) {
  let out = String(text);
  out = out.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[`~]*[ \t]*$|(?![\s\S]))/gm, blank);
  out = out.replace(/(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g, blank);
  if (comments) out = out.replace(/<!--[\s\S]*?-->/g, blank);
  return out;
}

/** Text that does not notify or link: code spans, fenced blocks and HTML comments become blanks (R16). */
const stripNonNotifying = (text) => mask(text, true);

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * R13 placeholders of one text: `{name}` markers, `[bracketed prose]` and HTML comments only when the template
 * holds them verbatim.
 * @returns {{ text: string, kind: 'marker'|'bracket'|'comment', line: number }[]}
 */
function findPlaceholders(text, templateText) {
  const template = typeof templateText === 'string' ? templateText : '';
  const found = [];
  const masked = mask(text, false);
  for (const m of masked.matchAll(/\{[^{}\n]+\}/g)) {
    found.push({ text: m[0], kind: 'marker', line: lineOf(masked, m.index) });
  }
  for (const m of masked.matchAll(/\[([^[\]\n]+)\](?![([])/g)) {
    if (/^[ xX]$/.test(m[1]) || !template.includes(m[0])) continue;
    found.push({ text: m[0], kind: 'bracket', line: lineOf(masked, m.index) });
  }
  for (const m of masked.matchAll(/<!--[\s\S]*?-->/g)) {
    if (template.includes(m[0])) found.push({ text: m[0], kind: 'comment', line: lineOf(masked, m.index) });
  }
  return found.sort((a, b) => a.line - b.line);
}

/** `{ heading, lines[] }` for each heading of `level` outside code; deeper headings stay in the content. */
function sections(text, level) {
  const out = [];
  let current = null;
  for (const line of mask(text, false).split('\n')) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (m && m[1].length <= level) {
      current = m[1].length === level ? { heading: m[2].trim(), lines: [] } : null;
      if (current) out.push(current);
    } else if (current) current.lines.push(line);
  }
  return out;
}

/**
 * R12 headings of a body against the resolved template (a cache `issueTemplates` entry). Markdown templates use
 * `##` headings, issue forms `###`. With `added` (an edit), only those headings count as new.
 * @returns {{ unknownHeadings: string[], missingRequired: string[] }}
 */
function checkHeadings(body, template, { added } = {}) {
  const level = template && template.kind === 'form' ? 3 : 2;
  const known = new Set(((template && template.headings) || []).map((h) => h.text));
  const secs = sections(body, level);
  const present = level === 2 ? [...extractHeadings(mask(body, false))] : secs.map((s) => s.heading);
  const unknownHeadings = present.filter((h) => !known.has(h) && (!Array.isArray(added) || added.includes(h)));
  const missingRequired = [];
  for (const s of (template && template.sections) || []) {
    if (!s.required) continue;
    const sec = secs.find((x) => x.heading === s.label);
    const content = sec ? sec.lines.join('\n').trim() : '';
    if (!content || /^_No response_$/i.test(content)) missingRequired.push(s.label);
  }
  return { unknownHeadings, missingRequired };
}

/** R16 `@login` and `@org/team` mentions that notify; `assignableLogins` is the cache's login list. */
function findMentions(text, assignableLogins) {
  const logins = new Set((assignableLogins || []).map((l) => String(l).toLowerCase()));
  const out = [];
  const seen = new Set();
  for (const m of stripNonNotifying(text).matchAll(/(?<![\w@/.-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))(?:\/([A-Za-z0-9_][A-Za-z0-9_.-]*))?/g)) {
    const team = m[2] !== undefined;
    const login = team ? `${m[1]}/${m[2].replace(/[.-]+$/, '')}` : m[1];
    if (seen.has(login.toLowerCase())) continue;
    seen.add(login.toLowerCase());
    out.push({ login, team, assignable: !team && logins.has(login.toLowerCase()) });
  }
  return out;
}

/** R16 issue references (`#n`, `owner/repo#n`, issue and pull URLs); `target` is the target repository. */
function findRefs(text, target) {
  const re = /https?:\/\/[^\s/]+\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)|(?<![\w/&#])([\w-]+)\/([\w.-]+)#(\d+)|(?<![\w/&#])#(\d+)\b/g;
  const own = target ? `${target.owner}/${target.name}`.toLowerCase() : null;
  const out = [];
  for (const m of stripNonNotifying(text).matchAll(re)) {
    const owner = m[1] || m[4] || (target ? target.owner : null);
    const repo = m[2] || m[5] || (target ? target.name : null);
    out.push({
      ref: m[0], owner, repo, number: Number(m[3] || m[6] || m[7]),
      crossRepo: own !== null && `${owner}/${repo}`.toLowerCase() !== own,
    });
  }
  return out;
}

/** R34: a line that starts with `duplicate of` and an issue reference. */
function findDuplicateMarker(text) {
  return String(text).split('\n').some((line) => DUPLICATE_RE.test(line));
}

/** R15 title shape. */
function checkTitle(title, max) {
  return { titleTooLong: [...String(title)].length > max, fillerOpening: FILLER_OPENING_RE.test(String(title)) };
}

/** R15: the lines under `## Acceptance Criteria` that are not task-list items. */
function checkAcceptance(body) {
  const sec = sections(body, 2).find((s) => s.heading === ACCEPTANCE_HEADING);
  return sec ? sec.lines.filter((l) => l.trim() && !CHECKLIST_RE.test(l)).map((l) => l.trimEnd()) : [];
}

module.exports = {
  stripNonNotifying, findPlaceholders, checkHeadings, findMentions, findRefs, findDuplicateMarker, checkTitle,
  checkAcceptance,
};
