'use strict';

/**
 * Shared commit-message helpers used by skill/commit.js and skill/version.js:
 * the requiredTrailers resolver, the given-subject precheck and the trailer
 * line rule of commit-sdlc's G10 gate.
 */

const fs = require('node:fs');

const TRAILER_RE = /^([A-Za-z][A-Za-z0-9-]*)(?:: (\S.*))?$/;
const MAX_SUBJECT_CHARS = 72;

/** R5: requiredTrailers → [{ key, value }]; value null for a key-only entry. */
function resolveTrailers(list, errs) {
  const out = [];
  for (const e of list) {
    const m = typeof e === 'string' && !/[\r\n]/.test(e) ? TRAILER_RE.exec(e) : null;
    if (!m) { errs.push(`commit.requiredTrailers entry ${JSON.stringify(e)} is not "Key" or "Key: Value"`); continue; }
    out.push({ key: m[1], value: m[2] === undefined ? null : m[2] });
  }
  return out;
}

/**
 * Checks every subject the caller gave, before any draft: --subject,
 * --expected-subject and the first line of the --message-file file.
 * @returns {string[]} errors[] entries; empty when all given subjects are valid and equal
 */
function checkGivenSubjects({ subject, messageFile, expectedSubject }) {
  const errors = [];
  const given = [];
  // --subject and --expected-subject pass the Step 0 shell line, so they exclude the
  // plan-sdlc R66 set (", backtick, $, \); a message file's first line has no such rule.
  const check = (label, s, viaShell) => {
    if (s === '') errors.push(`${label} is empty.`);
    else if (/[\r\n]/.test(s)) errors.push(`${label} contains a line break.`);
    else if (s.length > MAX_SUBJECT_CHARS) errors.push(`${label} is ${s.length} characters; the limit is ${MAX_SUBJECT_CHARS}.`);
    else if (viaShell && /["`$\\]/.test(s)) errors.push(`${label} contains ", \`, $ or \\, which cannot pass the Step 0 shell line; use --message-file.`);
    else given.push([label, s]);
  };
  if (subject !== null) check('--subject', subject, true);
  if (expectedSubject !== null) check('--expected-subject', expectedSubject, true);
  if (messageFile === '') {
    errors.push('--message-file needs a path.');
  } else if (messageFile !== null && /["`$\\\r\n]/.test(messageFile)) {
    // The path passed the Step 0 shell line; it is never read back into one (R-message-file).
    errors.push('--message-file path contains ", `, $, \\, a newline or a carriage return; use a plain path.');
  } else if (messageFile !== null) {
    let text = null;
    try { text = fs.readFileSync(messageFile, 'utf8'); } catch (err) { errors.push(`--message-file ${messageFile} cannot be read: ${err.message}`); }
    if (text !== null) check('--message-file first line', text.split('\n')[0], false);
  }
  if (new Set(given.map(([, s]) => s)).size > 1) {
    errors.push(`Given subjects disagree: ${given.map(([label, s]) => `${label} "${s}"`).join(', ')}.`);
  }
  return errors;
}

/** G10/G9 line rule: returns "Key" or "Key: Value" for each trailer with no matching line in text. */
function missingTrailers(text, trailers) {
  const lines = text.split(/\r?\n/);
  return trailers
    .filter(t => (t.value === null ? !lines.some(l => l.startsWith(t.key + ':')) : !lines.includes(t.key + ': ' + t.value)))
    .map(t => (t.value === null ? t.key : t.key + ': ' + t.value));
}

/** G10+ (commit R17): exactly one line per configured key; valued entries byte-exact. CRLF-safe. */
function checkTrailers(text, trailers) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const t of trailers) {
    const prefix = t.key.toLowerCase() + ':';
    const found = lines.filter(l => l.toLowerCase().startsWith(prefix));
    const want = t.value === null ? t.key : t.key + ': ' + t.value;
    if (found.length > 1) out.push('duplicate trailer: ' + t.key);
    else if (found.length === 0) out.push('missing trailer: ' + want);
    else if (t.value !== null && found[0] !== want) out.push('wrong trailer: ' + found[0]);
  }
  return out;
}

module.exports = { TRAILER_RE, MAX_SUBJECT_CHARS, resolveTrailers, checkGivenSubjects, missingTrailers, checkTrailers };
