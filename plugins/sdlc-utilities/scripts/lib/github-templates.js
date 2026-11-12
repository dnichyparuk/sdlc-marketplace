/**
 * github-templates.js
 * Pure parsers for GitHub issue templates (github-sdlc spec R11): markdown templates with
 * front matter, issue forms (`*.yml`) and the template chooser `config.yml`. `skill/github.js`
 * uses them for the `issueTemplates` cache section; the payload checks read the same shapes.
 *
 * `parseFormYaml` is a narrow indentation parser (see lib/yaml.js, which stays as narrow as it
 * is): scalars (plain, quoted, `|` / `>` blocks), `- ` list items, nested maps and inline
 * `[a, b]` lists. No anchors, aliases, tags or flow maps.
 *
 * Exports: parseMarkdownTemplate, parseIssueForm, parseTemplateConfig, parseFormYaml
 */

'use strict';

const { extractFrontmatter, extractBody } = require('./yaml');

// Issue-form elements GitHub renders as one `### <label>` section; `markdown` is skipped.
const FORM_SECTION_TYPES = ['textarea', 'input', 'dropdown', 'checkboxes'];

const KEY_RE = /^("[^"]*"|'[^']*'|[^\s:#"'[{-][^:]*?|-[^\s:][^:]*?)\s*:(?:\s+(.*))?$/;

// ---------------------------------------------------------------------------
// parseFormYaml
// ---------------------------------------------------------------------------

function unquote(text) {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    try { return JSON.parse(text); } catch (_) { return text.slice(1, -1); }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

/** One scalar or inline `[a, b]` list. */
function scalar(raw) {
  let text = raw.trim();
  const quoted = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s*(?:#.*)?$/);
  if (quoted) text = quoted[1];
  else text = text.replace(/\s+#.*$/, '');
  if (text.startsWith('[') && text.endsWith(']')) {
    return text.slice(1, -1).split(',').map((v) => v.trim()).filter(Boolean).map(scalar);
  }
  if (/^["']/.test(text)) return unquote(text);
  if (text === '' || text === '~' || /^null$/i.test(text)) return null;
  if (/^true$/i.test(text)) return true;
  if (/^false$/i.test(text)) return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

/**
 * Parse the narrow YAML subset issue forms and front matter use.
 * @param {string} text
 * @returns {*} the root map, list or scalar; null for an empty document
 */
function parseFormYaml(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const indentOf = (line) => line.match(/^ */)[0].length;
  const isItem = (body) => body === '-' || body.startsWith('- ');
  const skipBlank = () => {
    while (i < lines.length && (/^\s*(#.*)?$/.test(lines[i]) || /^(---|\.\.\.)\s*$/.test(lines[i]))) i++;
  };

  // `|` / `>` block scalar: the more-indented lines after the key line.
  function blockScalar(header, parentIndent) {
    const block = [];
    while (i < lines.length && (lines[i].trim() === '' || indentOf(lines[i]) > parentIndent)) block.push(lines[i++]);
    while (block.length && block[block.length - 1].trim() === '') block.pop();
    const indent = Math.min(...block.filter((l) => l.trim()).map(indentOf), Infinity);
    const body = block.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
    const joined = header.startsWith('>')
      ? body.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ')
      : body.join('\n');
    return header.includes('-') || joined === '' ? joined : `${joined}\n`;
  }

  function valueAfter(rest, indent) {
    const text = (rest ?? '').trim();
    if (/^[|>][+-]?\s*(#.*)?$/.test(text)) return blockScalar(text, indent);
    if (text !== '' && !text.startsWith('#')) return scalar(text);
    skipBlank();
    if (i >= lines.length) return null;
    const next = indentOf(lines[i]);
    if (next > indent || (next === indent && isItem(lines[i].slice(next)))) return node(next);
    return null;
  }

  function map(indent) {
    const out = {};
    for (;;) {
      skipBlank();
      if (i >= lines.length || indentOf(lines[i]) < indent) break;
      if (indentOf(lines[i]) > indent) { i++; continue; } // stray continuation line
      const body = lines[i].slice(indent);
      if (isItem(body)) break;
      const m = body.match(KEY_RE);
      i++;
      if (m) out[unquote(m[1])] = valueAfter(m[2], indent);
    }
    return out;
  }

  function list(indent) {
    const out = [];
    for (;;) {
      skipBlank();
      if (i >= lines.length || indentOf(lines[i]) < indent) break;
      if (indentOf(lines[i]) > indent) { i++; continue; } // stray continuation line
      const body = lines[i].slice(indent);
      if (!isItem(body)) break;
      const after = body.slice(1);
      const item = after.trim();
      if (item === '') {
        i++;
        out.push(valueAfter('', indent));
      } else if (KEY_RE.test(item)) {
        // `- key: value` starts a map whose keys sit at the column of `key`.
        const column = indent + 1 + indentOf(after);
        lines[i] = ' '.repeat(column) + item;
        out.push(map(column));
      } else {
        i++;
        out.push(scalar(item));
      }
    }
    return out;
  }

  function node(indent) {
    const body = lines[i].slice(indent);
    if (isItem(body)) return list(indent);
    if (KEY_RE.test(body)) return map(indent);
    i++;
    return scalar(body);
  }

  skipBlank();
  return i < lines.length ? node(indentOf(lines[i])) : null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function asMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Front-matter list value: a YAML list or a comma-separated string (both GitHub forms). */
function toList(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== '').map(String);
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(',').map((v) => v.trim()).filter(Boolean);
}

function textOrNull(value) {
  return value === null || value === undefined ? null : String(value);
}

/** `## ` / `### ` headings outside fenced code blocks. */
function headingsOf(body) {
  const headings = [];
  let fence = null;
  for (const line of body.split(/\r?\n/)) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^\s{0,3}(#{2,3})\s+(.+?)(?:\s+#+)?\s*$/);
    if (m) headings.push({ level: m[1].length, text: m[2] });
  }
  return headings;
}

/** Fields every template entry shares, from its front matter or form header. */
function commonFields(name, kind, meta, about) {
  return {
    name: textOrNull(meta.name),
    file: name,
    kind,
    about: textOrNull(about),
    title: textOrNull(meta.title),
    labels: toList(meta.labels),
    assignees: toList(meta.assignees),
    type: textOrNull(meta.type),
    projects: toList(meta.projects),
  };
}

/**
 * Markdown issue template (R11): front matter plus `## ` / `### ` headings.
 * @param {string} name  file name, e.g. `bug.md`
 * @param {string} text
 */
function parseMarkdownTemplate(name, text) {
  const source = String(text ?? '');
  const front = extractFrontmatter(source);
  const meta = asMap(front === null ? null : parseFormYaml(front));
  const body = front === null ? source : extractBody(source);
  return { ...commonFields(name, 'markdown', meta, meta.about), headings: headingsOf(body), body };
}

/**
 * Issue form (R11): one `### <label>` section per textarea, input, dropdown and checkboxes
 * element, `required` kept per section; markdown elements skipped.
 * @param {string} name  file name, e.g. `feature.yml`
 * @param {string} text
 */
function parseIssueForm(name, text) {
  const doc = asMap(parseFormYaml(text));
  const elements = Array.isArray(doc.body) ? doc.body : [];
  const sections = elements
    .map(asMap)
    .filter((el) => FORM_SECTION_TYPES.includes(el.type))
    .map((el) => ({
      id: textOrNull(el.id),
      label: textOrNull(asMap(el.attributes).label),
      type: el.type,
      required: asMap(el.validations).required === true,
    }))
    .filter((s) => s.label);
  return {
    ...commonFields(name, 'form', doc, doc.description),
    headings: sections.map((s) => ({ level: 3, text: s.label })),
    body: sections.map((s) => `### ${s.label}\n\n`).join(''),
    sections,
  };
}

/**
 * Template chooser config (`config.yml`): only `blank_issues_enabled` is read.
 * @param {string} text
 * @returns {{ blank_issues_enabled: boolean|null }}
 */
function parseTemplateConfig(text) {
  const value = asMap(parseFormYaml(text)).blank_issues_enabled;
  return { blank_issues_enabled: typeof value === 'boolean' ? value : null };
}

module.exports = { parseMarkdownTemplate, parseIssueForm, parseTemplateConfig, parseFormYaml };
