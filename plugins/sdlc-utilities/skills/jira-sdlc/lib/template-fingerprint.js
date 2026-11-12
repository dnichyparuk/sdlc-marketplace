'use strict';

/**
 * Resolve and fingerprint description templates for R18 enforcement.
 *
 * Resolution order:
 *   1. Override:  <projectRoot>/.sdlc/jira-templates/<IssueType>.md
 *   2. Shipped:   <pluginRoot>/skills/jira-sdlc/templates/<IssueType>.md
 *
 * The fingerprint is the set of `## ` heading texts. For the hook to allow
 * dispatch, every `## ` heading appearing in the payload description must be
 * a member of the resolved template's heading set (sections may be removed
 * but never invented).
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract `## ` headings from a markdown source.
 * @param {string} markdown
 * @returns {Set<string>}
 */
function extractHeadings(input) {
  const headings = new Set();
  let doc = input;
  if (typeof input === 'string' && input.trim().startsWith('{')) {
    try { doc = JSON.parse(input); } catch (_) { doc = input; }
  }
  if (doc && typeof doc === 'object') { collectAdfHeadings(doc, headings); return headings; }
  if (typeof input !== 'string' || input.length === 0) return headings;
  const lines = input.split(/\r?\n/);
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) headings.add(m[1].trim());
  }
  return headings;
}

// Walk an ADF tree; add the trimmed text of every heading node with attrs.level === 2.
function collectAdfHeadings(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectAdfHeadings(n, out); return; }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'heading' && node.attrs && node.attrs.level === 2) {
    const text = adfText(node).trim();
    if (text) out.add(text);
    return;
  }
  collectAdfHeadings(node.content, out);
}

function adfText(node) {
  if (Array.isArray(node)) return node.map(adfText).join('');
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  return adfText(node.content);
}

/**
 * Resolve the template for the given issue type and return its heading set.
 *
 * @param {string} issueType
 * @param {string} projectRoot
 * @param {object} [opts]
 * @param {string} [opts.shippedTemplatesDir] override for the shipped templates root
 * @returns {{ headings: Set<string>, source: 'override'|'shipped'|null, file: string|null }}
 */
function loadTemplateHeadings(issueType, projectRoot, opts = {}) {
  if (!issueType || typeof issueType !== 'string') {
    return { headings: new Set(), source: null, file: null };
  }
  const overrideFile = path.join(projectRoot, '.sdlc', 'jira-templates', `${issueType}.md`);
  if (fs.existsSync(overrideFile)) {
    const md = fs.readFileSync(overrideFile, 'utf8');
    return { headings: extractHeadings(md), source: 'override', file: overrideFile };
  }
  const shippedDir = opts.shippedTemplatesDir
    || path.resolve(__dirname, '..', 'templates');
  const shippedFile = path.join(shippedDir, `${issueType}.md`);
  if (fs.existsSync(shippedFile)) {
    const md = fs.readFileSync(shippedFile, 'utf8');
    return { headings: extractHeadings(md), source: 'shipped', file: shippedFile };
  }
  return { headings: new Set(), source: null, file: null };
}

module.exports = { extractHeadings, loadTemplateHeadings };
