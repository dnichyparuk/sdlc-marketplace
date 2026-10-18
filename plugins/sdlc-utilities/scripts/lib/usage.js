'use strict';
/**
 * usage.js
 * Parse and merge the `--usage <json>` payload recorded on ship steps and
 * execute waves. Zero npm dependencies.
 */

const COUNT_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const ALLOWED_KEYS = [...COUNT_KEYS, 'model', 'effort', 'source'];

/**
 * @param {string} raw
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
function parseUsage(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `not valid JSON (${e.message})` };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'must be a JSON object' };
  }
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.includes(key)) {
      return { ok: false, error: `unknown key "${key}" (allowed: ${ALLOWED_KEYS.join(', ')})` };
    }
  }
  for (const key of COUNT_KEYS) {
    if (key in value && !(Number.isInteger(value[key]) && value[key] >= 0)) {
      return { ok: false, error: `${key} must be a non-negative integer` };
    }
  }
  for (const key of ['model', 'source']) {
    if (key in value && typeof value[key] !== 'string') {
      return { ok: false, error: `${key} must be a string` };
    }
  }
  if ('effort' in value && !EFFORTS.includes(value.effort)) {
    return { ok: false, error: `effort must be one of ${EFFORTS.join(', ')}` };
  }
  return { ok: true, value };
}

/**
 * Precedence: a hook-written `source: "subagent-stop"` value is the source of
 * record; a self-report never replaces it.
 * @returns the value to persist
 */
function resolveUsage(existing, incoming) {
  if (existing && existing.source === 'subagent-stop' && incoming.source !== 'subagent-stop') {
    return existing;
  }
  return incoming;
}

module.exports = { parseUsage, resolveUsage };
