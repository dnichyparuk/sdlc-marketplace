'use strict';
/**
 * quality.js — shared --quality preset resolver (plan, execute, ship).
 * Public names: speed | balanced | quality. Internal keys: full | balanced | minimal.
 * `full` and `minimal` are deprecated aliases of `speed` and `quality`.
 */

const QUALITY_NAMES = ['speed', 'balanced', 'quality'];
const QUALITY_KEYS = { speed: 'full', balanced: 'balanced', quality: 'minimal' };
const DEPRECATED_QUALITY = { full: 'speed', minimal: 'quality' };
const LEGACY_LETTERS = { A: 'full', B: 'balanced', C: 'minimal' };
const QUALITY_EXPECTED = 'speed|balanced|quality (deprecated: full|minimal)';

/** internal key → public name; null when unknown. */
function qualityName(key) {
  for (const [name, k] of Object.entries(QUALITY_KEYS)) if (k === key) return name;
  return null;
}

/**
 * Resolve a --quality value (exact, case-sensitive match).
 * @returns {{ key: string|null, name: string|null, warning: string|null }}
 */
function resolveQuality(value, { allowLetters = false } = {}) {
  if (typeof value === 'string') {
    if (Object.prototype.hasOwnProperty.call(QUALITY_KEYS, value)) {
      return { key: QUALITY_KEYS[value], name: value, warning: null };
    }
    if (Object.prototype.hasOwnProperty.call(DEPRECATED_QUALITY, value)) {
      const name = DEPRECATED_QUALITY[value];
      return { key: value, name, warning: `--quality ${value} is deprecated; use --quality ${name} (same preset).` };
    }
    if (allowLetters && Object.prototype.hasOwnProperty.call(LEGACY_LETTERS, value)) {
      const key = LEGACY_LETTERS[value];
      return { key, name: qualityName(key), warning: null };
    }
  }
  return { key: null, name: null, warning: null };
}

module.exports = { QUALITY_NAMES, QUALITY_KEYS, DEPRECATED_QUALITY, QUALITY_EXPECTED, resolveQuality, qualityName };
