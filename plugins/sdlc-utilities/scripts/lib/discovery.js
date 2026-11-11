/**
 * discovery.js
 * Validates the plugin discovery and cross-reference chain.
 * Checks that every manifest, command, skill, script, hook, and agent is
 * correctly wired so the plugin will work after installation.
 *
 * Zero external dependencies — Node.js built-ins only.
 *
 * Exports: validateAll
 *
 * Check IDs:
 *   PD1  marketplace-manifest-exists     — .claude-plugin/marketplace.json valid JSON
 *   PD2  marketplace-schema-reference    — $schema field present
 *   PD3  marketplace-required-fields     — name + plugins array
 *   PD4  plugin-source-paths-valid       — each source has plugin.json
 *   PD5  name-consistency               — marketplace name matches plugin.json name
 *   PD6  plugin-required-fields         — name, description, version in plugin.json
 *   PD7  semver-format                  — version is valid semver
 *   PD8  commands-discoverable          — commands have frontmatter with description
 *   PD9  command-skill-refs-valid       — skill names referenced in commands exist
 *   PD10 command-script-refs-valid      — scripts referenced in commands exist
 *   PD11 skills-discoverable            — skills have SKILL.md with name+description
 *   PD12 skill-supporting-files-exist   — sibling .md files referenced in SKILL.md exist
 *   PD13 skill-agent-refs-valid         — agents referenced in skills exist
 *   PD14 skill-script-refs-valid        — scripts referenced in skills exist
 *   PD15 hooks-valid-json               — hooks.json exists and parses
 *   PD16 agents-discoverable            — agents have frontmatter with name+description (tools optional: absent = all tools)
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { extractFrontmatter, parseSimpleYaml } = require('./yaml.js');

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function listDir(dirPath) {
  try { return fs.readdirSync(dirPath); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Pattern extractors for cross-reference detection
// ---------------------------------------------------------------------------

// Extract script filenames from `find -name "<script>.js"` patterns.
// Excludes placeholder patterns like "<script>.js" (containing < or >).
const RE_FIND_SCRIPT = /find\s[^`\n]*?-name\s+["']([^"'<>]+\.js)["']/g;

// Extract relative path from `-path "*/sdlc*/scripts/<subdir>/<name>.js"` patterns.
// Captures the portion after `scripts/` (e.g., `skill/commit.js`).
const RE_PATH_SCRIPT = /-path\s+["']\*\/sdlc\*\/scripts\/([^\s"'<>]+\.js)["']/g;

// Extract script filenames from direct-path fallback pattern:
// plugins/sdlc-utilities/scripts/<subdir>/<script>.js
const RE_DIRECT_SCRIPT = /plugins\/sdlc-utilities\/scripts\/([^\s"'<>]+\.js)/g;

function extractScriptRefs(content) {
  const names = new Set();
  let m;
  // Prefer -path match (includes subdirectory) over -name match (bare filename)
  const rePathScript = new RegExp(RE_PATH_SCRIPT.source, 'g');
  while ((m = rePathScript.exec(content)) !== null) {
    names.add(m[1]);
  }
  const reDirectScript = new RegExp(RE_DIRECT_SCRIPT.source, 'g');
  while ((m = reDirectScript.exec(content)) !== null) {
    names.add(m[1]);
  }
  // Fall back to -name for patterns that lack -path (e.g., lib/config.js lookups)
  const reFindScript = new RegExp(RE_FIND_SCRIPT.source, 'g');
  while ((m = reFindScript.exec(content)) !== null) {
    // Skip if we already captured this script via -path or direct pattern
    const basename = m[1];
    const alreadyCaptured = [...names].some(n => n === basename || n.endsWith('/' + basename));
    if (!alreadyCaptured) {
      names.add(m[1]);
    }
  }
  return [...names];
}

// Extract skill names from `Invoke the `<skill-name>` skill` patterns
const RE_INVOKE_SKILL = /Invoke the `([^`]+)` skill/g;

function extractSkillRefs(content) {
  const names = new Set();
  let m;
  const re = new RegExp(RE_INVOKE_SKILL.source, 'g');
  while ((m = re.exec(content)) !== null) {
    names.add(m[1]);
  }
  return [...names];
}

// Extract agent names from `agents/<name>` or `` `<name>` agent `` patterns
const RE_AGENTS_PATH = /agents\/([a-z][a-z0-9-]+)/g;
const RE_AGENT_BACKTICK = /`([a-z][a-z0-9-]+)`\s+agent/g;

function extractAgentRefs(content) {
  const names = new Set();
  let m;
  const re1 = new RegExp(RE_AGENTS_PATH.source, 'g');
  while ((m = re1.exec(content)) !== null) {
    names.add(m[1]);
  }
  const re2 = new RegExp(RE_AGENT_BACKTICK.source, 'g');
  while ((m = re2.exec(content)) !== null) {
    names.add(m[1]);
  }
  return [...names];
}

// Extract sibling supporting-file references: backtick-wrapped uppercase .md filenames.
// Uses negative lookbehind/lookahead to exclude double-backtick code spans
// (`` `REFERENCE.md` `` is an example in text, not a real file reference).
// Also excludes known project artifact filenames that are never skill siblings.
const RE_SIBLING_MD = /(?<!`)`([A-Z][A-Z0-9_-]*\.md)`(?!`)/g;
const NON_SIBLING_MD = new Set(['CHANGELOG.md', 'README.md', 'LICENSE.md', 'CLAUDE.md', 'SKILL.md']);

function extractSiblingFileRefs(content) {
  const names = new Set();
  let m;
  const re = new RegExp(RE_SIBLING_MD.source, 'g');
  while ((m = re.exec(content)) !== null) {
    if (!NON_SIBLING_MD.has(m[1])) {
      names.add(m[1]);
    }
  }
  return [...names];
}

// ---------------------------------------------------------------------------
// Check builders
// ---------------------------------------------------------------------------

function pass(id, check, message) {
  return { id, check, status: 'pass', severity: 'error', message, details: [] };
}

function fail(id, check, severity, message, details = []) {
  return { id, check, status: 'fail', severity, message, details };
}

function skip(id, check, reason) {
  return { id, check, status: 'skip', severity: 'error', message: reason, details: [] };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkPD1(projectRoot) {
  const filePath = path.join(projectRoot, '.claude-plugin', 'marketplace.json');
  const rel = '.claude-plugin/marketplace.json';

  if (!isFile(filePath)) {
    return { finding: fail('PD1', 'marketplace-manifest-exists', 'error',
      `${rel} not found`, [`Expected at: ${filePath}`]), data: null };
  }

  const content = readFile(filePath);
  if (content === null) {
    return { finding: fail('PD1', 'marketplace-manifest-exists', 'error',
      `${rel} is not readable`, []), data: null };
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return { finding: fail('PD1', 'marketplace-manifest-exists', 'error',
      `${rel} contains invalid JSON`, [err.message]), data: null };
  }

  return { finding: pass('PD1', 'marketplace-manifest-exists',
    `${rel} exists and is valid JSON`), data };
}

function checkPD2(marketplace) {
  if (!marketplace) return skip('PD2', 'marketplace-schema-reference', 'PD1 failed — cannot check');
  const expected = 'https://anthropic.com/claude-code/marketplace.schema.json';
  if (!marketplace.$schema) {
    return fail('PD2', 'marketplace-schema-reference', 'warning',
      '$schema field missing from marketplace.json',
      [`Add: "$schema": "${expected}"`]);
  }
  return pass('PD2', 'marketplace-schema-reference', '$schema field present');
}

function checkPD3(marketplace) {
  if (!marketplace) return skip('PD3', 'marketplace-required-fields', 'PD1 failed — cannot check');
  const details = [];
  if (!marketplace.name) details.push('Missing required field: name');
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    details.push('Missing or empty required field: plugins (array)');
  }
  if (details.length > 0) {
    return fail('PD3', 'marketplace-required-fields', 'error',
      'marketplace.json is missing required fields', details);
  }
  return pass('PD3', 'marketplace-required-fields',
    'marketplace.json has required fields (name, plugins)');
}

function checkPD4(projectRoot, marketplace) {
  if (!marketplace || !Array.isArray(marketplace.plugins)) {
    return { finding: skip('PD4', 'plugin-source-paths-valid', 'PD1/PD3 failed — cannot check'), plugins: [] };
  }

  const findings = [];
  const validPlugins = [];

  for (const entry of marketplace.plugins) {
    if (!entry.name || !entry.source) {
      findings.push(`Plugin entry missing name or source: ${JSON.stringify(entry)}`);
      continue;
    }
    const sourcePath = entry.source.replace(/^\.\//, '');
    const pluginDir  = path.join(projectRoot, sourcePath);
    const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');

    if (!isDir(pluginDir)) {
      findings.push(`Plugin "${entry.name}": source directory not found: ${pluginDir}`);
      continue;
    }
    if (!isFile(manifestPath)) {
      findings.push(`Plugin "${entry.name}": .claude-plugin/plugin.json not found in ${pluginDir}`);
      continue;
    }

    const content = readFile(manifestPath);
    let pluginData = null;
    try {
      pluginData = JSON.parse(content);
    } catch (err) {
      findings.push(`Plugin "${entry.name}": plugin.json is invalid JSON — ${err.message}`);
      continue;
    }

    validPlugins.push({ entry, pluginDir, pluginData, manifestPath });
  }

  if (findings.length > 0) {
    return { finding: fail('PD4', 'plugin-source-paths-valid', 'error',
      'One or more plugin source paths are invalid', findings), plugins: validPlugins };
  }
  return { finding: pass('PD4', 'plugin-source-paths-valid',
    `All ${validPlugins.length} plugin source path(s) resolve to valid plugin.json`), plugins: validPlugins };
}

function checkPD5(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD5', 'name-consistency', 'PD4 failed — cannot check');
  const details = [];
  for (const { entry, pluginData } of plugins) {
    if (entry.name !== pluginData.name) {
      details.push(
        `Plugin entry name "${entry.name}" in marketplace.json does not match ` +
        `plugin.json name "${pluginData.name}" — this causes "plugin not found" on update`
      );
    }
  }
  if (details.length > 0) {
    return fail('PD5', 'name-consistency', 'error',
      'marketplace.json plugin name(s) do not match plugin.json name(s)', details);
  }
  return pass('PD5', 'name-consistency',
    'marketplace.json plugin names match plugin.json names');
}

function checkPD6(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD6', 'plugin-required-fields', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginData, manifestPath } of plugins) {
    // KEEP: display string — do not change to resolveSdlcRoot()
    const rel = path.relative(process.cwd(), manifestPath);
    if (!pluginData.name) details.push(`${rel}: missing required field "name"`);
    if (!pluginData.description) details.push(`${rel}: missing required field "description"`);
    if (!pluginData.version) details.push(`${rel}: missing required field "version"`);
  }
  if (details.length > 0) {
    return fail('PD6', 'plugin-required-fields', 'error',
      'One or more plugin.json files are missing required fields', details);
  }
  return pass('PD6', 'plugin-required-fields',
    'All plugin.json files have required fields (name, description, version)');
}

const RE_SEMVER = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function checkPD7(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD7', 'semver-format', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginData, manifestPath } of plugins) {
    // KEEP: display string — do not change to resolveSdlcRoot()
    const rel = path.relative(process.cwd(), manifestPath);
    if (pluginData.version && !RE_SEMVER.test(pluginData.version)) {
      details.push(`${rel}: version "${pluginData.version}" is not valid semver (expected X.Y.Z or X.Y.Z-pre)`);
    }
  }
  if (details.length > 0) {
    return fail('PD7', 'semver-format', 'error',
      'One or more plugin.json files have invalid semver version', details);
  }
  return pass('PD7', 'semver-format', 'All plugin versions are valid semver');
}

function checkPD8(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD8', 'commands-discoverable', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const cmdDir = path.join(pluginDir, 'commands');
    const files = listDir(cmdDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const filePath = path.join(cmdDir, f);
      const content = readFile(filePath);
      if (!content) { details.push(`${entry.name}/commands/${f}: cannot read file`); continue; }
      const rawFm = extractFrontmatter(content);
      if (!rawFm) {
        details.push(`${entry.name}/commands/${f}: missing YAML frontmatter (--- delimiters)`);
        continue;
      }
      const fm = parseSimpleYaml(rawFm);
      if (!fm.description) {
        details.push(`${entry.name}/commands/${f}: frontmatter missing required "description" field`);
      }
    }
  }
  if (details.length > 0) {
    return fail('PD8', 'commands-discoverable', 'error',
      'One or more command files are missing discoverable frontmatter', details);
  }
  return pass('PD8', 'commands-discoverable',
    'All command files have frontmatter with description');
}

function checkPD9(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD9', 'command-skill-refs-valid', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const cmdDir   = path.join(pluginDir, 'commands');
    const skillDir = path.join(pluginDir, 'skills');
    const files = listDir(cmdDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = readFile(path.join(cmdDir, f));
      if (!content) continue;
      const skillRefs = extractSkillRefs(content);
      for (const skillName of skillRefs) {
        const skillPath = path.join(skillDir, skillName, 'SKILL.md');
        if (!isFile(skillPath)) {
          details.push(
            `${entry.name}/commands/${f}: references skill "${skillName}" ` +
            `but skills/${skillName}/SKILL.md does not exist`
          );
        }
      }
    }
  }
  if (details.length > 0) {
    return fail('PD9', 'command-skill-refs-valid', 'error',
      'One or more commands reference skills that do not exist', details);
  }
  return pass('PD9', 'command-skill-refs-valid',
    'All command skill references resolve to existing skill directories');
}

function checkPD10(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD10', 'command-script-refs-valid', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const cmdDir    = path.join(pluginDir, 'commands');
    const scriptDir = path.join(pluginDir, 'scripts');
    const files = listDir(cmdDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = readFile(path.join(cmdDir, f));
      if (!content) continue;
      const scriptRefs = extractScriptRefs(content);
      for (const scriptName of scriptRefs) {
        const scriptPath = path.join(scriptDir, scriptName);
        if (!isFile(scriptPath)) {
          details.push(
            `${entry.name}/commands/${f}: references script "${scriptName}" ` +
            `but scripts/${scriptName} does not exist`
          );
        }
      }
    }
  }
  if (details.length > 0) {
    return fail('PD10', 'command-script-refs-valid', 'error',
      'One or more commands reference scripts that do not exist', details);
  }
  return pass('PD10', 'command-script-refs-valid',
    'All command script references resolve to existing files');
}

function checkPD11(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD11', 'skills-discoverable', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const skillsDir = path.join(pluginDir, 'skills');
    const skillDirs = listDir(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    for (const d of skillDirs) {
      const skillFile = path.join(skillsDir, d, 'SKILL.md');
      if (!isFile(skillFile)) {
        details.push(`${entry.name}/skills/${d}: SKILL.md is missing`);
        continue;
      }
      const content = readFile(skillFile);
      if (!content) { details.push(`${entry.name}/skills/${d}/SKILL.md: cannot read`); continue; }
      const rawFm = extractFrontmatter(content);
      if (!rawFm) {
        details.push(`${entry.name}/skills/${d}/SKILL.md: missing YAML frontmatter`);
        continue;
      }
      const fm = parseSimpleYaml(rawFm);
      if (!fm.name)        details.push(`${entry.name}/skills/${d}/SKILL.md: frontmatter missing "name"`);
      if (!fm.description) details.push(`${entry.name}/skills/${d}/SKILL.md: frontmatter missing "description"`);
    }
  }
  if (details.length > 0) {
    return fail('PD11', 'skills-discoverable', 'error',
      'One or more skills are missing SKILL.md or required frontmatter', details);
  }
  return pass('PD11', 'skills-discoverable',
    'All skill directories have SKILL.md with name and description');
}

function checkPD12(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD12', 'skill-supporting-files-exist', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const skillsDir = path.join(pluginDir, 'skills');
    const skillDirs = listDir(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    for (const d of skillDirs) {
      const skillFile = path.join(skillsDir, d, 'SKILL.md');
      const content = readFile(skillFile);
      if (!content) continue;
      const siblingRefs = extractSiblingFileRefs(content);
      for (const ref of siblingRefs) {
        // Skip SKILL.md itself (it always exists) and common false-positive patterns
        if (ref === 'SKILL.md') continue;
        const siblingPath = path.join(skillsDir, d, ref);
        if (!isFile(siblingPath)) {
          details.push(
            `${entry.name}/skills/${d}/SKILL.md: references \`${ref}\` ` +
            `but the file does not exist in the skill directory`
          );
        }
      }
    }
  }
  if (details.length > 0) {
    return fail('PD12', 'skill-supporting-files-exist', 'error',
      'One or more skills reference supporting files that do not exist', details);
  }
  return pass('PD12', 'skill-supporting-files-exist',
    'All sibling file references in SKILL.md files resolve to existing files');
}

function checkPD13(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD13', 'skill-agent-refs-valid', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const skillsDir = path.join(pluginDir, 'skills');
    const agentsDir = path.join(pluginDir, 'agents');
    const skillDirs = listDir(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    for (const d of skillDirs) {
      const content = readFile(path.join(skillsDir, d, 'SKILL.md'));
      if (!content) continue;
      const agentRefs = extractAgentRefs(content);
      for (const agentName of agentRefs) {
        const agentPath = path.join(agentsDir, `${agentName}.md`);
        if (!isFile(agentPath)) {
          details.push(
            `${entry.name}/skills/${d}/SKILL.md: references agent "${agentName}" ` +
            `but agents/${agentName}.md does not exist`
          );
        }
      }
    }
  }
  if (details.length > 0) {
    return fail('PD13', 'skill-agent-refs-valid', 'error',
      'One or more skills reference agents that do not exist', details);
  }
  return pass('PD13', 'skill-agent-refs-valid',
    'All agent references in skills resolve to existing agent files');
}

function checkPD14(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD14', 'skill-script-refs-valid', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const skillsDir = path.join(pluginDir, 'skills');
    const scriptDir = path.join(pluginDir, 'scripts');
    const skillDirs = listDir(skillsDir).filter(d => isDir(path.join(skillsDir, d)));
    for (const d of skillDirs) {
      const content = readFile(path.join(skillsDir, d, 'SKILL.md'));
      if (!content) continue;
      const scriptRefs = extractScriptRefs(content);
      for (const scriptName of scriptRefs) {
        const scriptPath = path.join(scriptDir, scriptName);
        if (!isFile(scriptPath)) {
          details.push(
            `${entry.name}/skills/${d}/SKILL.md: references script "${scriptName}" ` +
            `but scripts/${scriptName} does not exist`
          );
        }
      }
    }
  }
  if (details.length > 0) {
    return fail('PD14', 'skill-script-refs-valid', 'warning',
      'One or more skills reference scripts that do not exist', details);
  }
  return pass('PD14', 'skill-script-refs-valid',
    'All script references in skills resolve to existing files');
}

function checkPD15(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD15', 'hooks-valid-json', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const hooksPath = path.join(pluginDir, 'hooks', 'hooks.json');
    if (!isFile(hooksPath)) {
      details.push(`${entry.name}/hooks/hooks.json: file not found`);
      continue;
    }
    const content = readFile(hooksPath);
    if (!content) { details.push(`${entry.name}/hooks/hooks.json: cannot read`); continue; }
    try {
      JSON.parse(content);
    } catch (err) {
      details.push(`${entry.name}/hooks/hooks.json: invalid JSON — ${err.message}`);
    }
  }
  if (details.length > 0) {
    return fail('PD15', 'hooks-valid-json', 'error',
      'One or more hooks.json files are missing or invalid', details);
  }
  return pass('PD15', 'hooks-valid-json', 'All hooks.json files exist and are valid JSON');
}

function checkPD16(plugins) {
  if (!plugins || plugins.length === 0) return skip('PD16', 'agents-discoverable', 'PD4 failed — cannot check');
  const details = [];
  for (const { pluginDir, entry } of plugins) {
    const agentsDir = path.join(pluginDir, 'agents');
    const files = listDir(agentsDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      const content = readFile(path.join(agentsDir, f));
      if (!content) { details.push(`${entry.name}/agents/${f}: cannot read`); continue; }
      const rawFm = extractFrontmatter(content);
      if (!rawFm) {
        details.push(`${entry.name}/agents/${f}: missing YAML frontmatter`);
        continue;
      }
      const fm = parseSimpleYaml(rawFm);
      if (!fm.name)        details.push(`${entry.name}/agents/${f}: frontmatter missing "name"`);
      if (!fm.description) details.push(`${entry.name}/agents/${f}: frontmatter missing "description"`);
    }
  }
  if (details.length > 0) {
    return fail('PD16', 'agents-discoverable', 'warning',
      'One or more agent files are missing required frontmatter', details);
  }
  return pass('PD16', 'agents-discoverable',
    'All agent files have frontmatter with name and description');
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

function validateAll(projectRoot) {
  const checks = [];

  // PD1 — marketplace manifest
  const { finding: pd1, data: marketplace } = checkPD1(projectRoot);
  checks.push(pd1);

  // PD2-PD3 — marketplace structure (depend on PD1 data)
  checks.push(checkPD2(marketplace));
  checks.push(checkPD3(marketplace));

  // PD4 — plugin source paths (depends on PD1 data)
  const { finding: pd4, plugins } = checkPD4(projectRoot, marketplace);
  checks.push(pd4);

  // PD5-PD16 — per-plugin checks (depend on PD4 plugins list)
  checks.push(checkPD5(plugins));
  checks.push(checkPD6(plugins));
  checks.push(checkPD7(plugins));
  checks.push(checkPD8(plugins));
  checks.push(checkPD9(plugins));
  checks.push(checkPD10(plugins));
  checks.push(checkPD11(plugins));
  checks.push(checkPD12(plugins));
  checks.push(checkPD13(plugins));
  checks.push(checkPD14(plugins));
  checks.push(checkPD15(plugins));
  checks.push(checkPD16(plugins));

  const failed  = checks.filter(c => c.status === 'fail');
  const errors  = failed.filter(c => c.severity === 'error').length;
  const warnings = failed.filter(c => c.severity === 'warning').length;
  const passed  = checks.filter(c => c.status === 'pass').length;

  return {
    overall: errors > 0 ? 'fail' : 'pass',
    project_root: projectRoot,
    summary: {
      total: checks.length,
      pass: passed,
      fail: failed.length,
      total_errors: errors,
      total_warnings: warnings,
    },
    checks,
  };
}

module.exports = { validateAll };
