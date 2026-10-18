#!/usr/bin/env node
/**
 * check-consistency.js
 * Validates structural consistency across the sdlc-utilities plugin:
 * skills and scripts (skills-primary architecture).
 *
 * Rules checked:
 *   1. script-resolution-order  — all find patterns in skill files use plugins-first
 *                                 (~/.claude/plugins before CWD)
 *   1b. script-resolution-version — plugin scripts must be resolved via the
 *                                 injected-path form node "<PLUGIN_ROOT>/scripts/…"
 *                                 (see #485). Any `find ~/.claude/plugins` resolver
 *                                 is flagged as the buggy shape it replaces. Subagent
 *                                 prompt templates (skills/**\/*-prompt.md) and
 *                                 orchestrator agent templates (agents/*.md) must
 *                                 contain NO plugin-script resolver at all — they run
 *                                 without the injected plugin-root context.
 *   2. skill-runs-script        — skills paired with prepare scripts must contain
 *                                 the find+node resolution pattern themselves
 *                                 Pairings: review-prepare.js → review-sdlc,
 *                                           pr-prepare.js     → pr-sdlc,
 *                                           version-prepare.js → version-sdlc
 *   3. skill-uses-mktemp        — skills that run prepare scripts must write output
 *                                 to a mktemp file (not pipe directly)
 *   4. skill-checks-exit-code   — skills that run prepare scripts must capture
 *                                 EXIT_CODE=$? and handle non-zero exit codes
 *   5. skill-passes-arguments   — skills that run prepare scripts must use $ARGUMENTS
 *                                 in the node "$SCRIPT" $ARGUMENTS call
 *   6. frontmatter-field-names  — all skills must use user-invocable (not user-invokable)
 *   7. user-invocable-flag      — the 6 user-facing skills must have user-invocable: true
 *   8. docs-skill-existence     — every skill directory must have a matching docs/skills/<name>.md
 *   9. skills-meta-existence    — every user-invocable skill must have a slug entry in
 *                                 site/src/data/skills-meta.ts
 *  10. readme-skills-table      — every user-invocable skill must appear in README.md's
 *                                 skills table (warning)
 *  11. temp-file-cleanup        — skills that use mktemp must also contain a cleanup
 *                                 reference (rm -f / rm -rf / clean) (warning)
 *  12. invocation-verbatim      — dispatch-bearing templates (orchestrator agents +
 *                                 subagent prompt templates) that show an inline
 *                                 dispatch example built from a precomputed field
 *                                 (subagent_type:/model: on one line, or a fenced
 *                                 .invocation example) must carry a verbatim guard
 *                                 co-located in the same header-delimited section (#485)
 *  13. orchestrator-await-barrier — dispatch-bearing orchestrator agent templates
 *                                 (frontmatter `tools` includes Agent) and any file
 *                                 carrying the `<!-- fan-out-dispatch:
 *                                 await-barrier-required -->` marker must carry the
 *                                 await-barrier guard: `run_in_background: false`
 *                                 plus a barrier instruction (await barrier / never
 *                                 consolidate on partial / R-orchestrator-await).
 *                                 Leaf drafters (`tools: Read`) do not dispatch and
 *                                 are excluded structurally (#487)
 *
 * Usage:
 *   node check-consistency.js [--project-root <path>] [--json]
 *
 * Exit codes: 0 = all pass (or warnings only), 1 = errors found, 2 = script error
 * Output: human-readable report (default) or JSON array of findings
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = process.cwd();
  let jsonOutput  = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (args[i] === '--json') {
      jsonOutput = true;
    }
  }
  return { projectRoot, jsonOutput };
}

// ---------------------------------------------------------------------------
// File reading helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function listDir(dirPath) {
  try {
    return fs.readdirSync(dirPath);
  } catch {
    return [];
  }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function discoverSkills(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/skills');
  return listDir(dir)
    .filter(d => isDir(path.join(dir, d)))
    .map(d => ({ name: d, file: path.join(dir, d, 'SKILL.md') }))
    .filter(s => isFile(s.file));
}

function discoverScripts(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/scripts');
  return listDir(dir).filter(f => f.endsWith('.js') && !listDir(path.join(dir, f)).length);
}

// Recursively collect files under dir whose name matches suffix (e.g. '-prompt.md').
function walkForSuffix(dir, suffix, results) {
  for (const entry of listDir(dir)) {
    const full = path.join(dir, entry);
    if (isDir(full)) {
      walkForSuffix(full, suffix, results);
    } else if (entry.endsWith(suffix)) {
      results.push(full);
    }
  }
  return results;
}

// Subagent prompt templates: plugins/sdlc-utilities/skills/**/*-prompt.md
function discoverPromptTemplates(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/skills');
  return walkForSuffix(dir, '-prompt.md', []);
}

// Orchestrator agent templates: plugins/sdlc-utilities/agents/*.md
function discoverOrchestratorTemplates(root) {
  const dir = path.join(root, 'plugins/sdlc-utilities/agents');
  return listDir(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f))
    .filter(f => isFile(f));
}

// ---------------------------------------------------------------------------
// Skill–script pairings (skills-primary architecture)
// ---------------------------------------------------------------------------

// Maps prepare script filename → skill directory name
const SCRIPT_TO_SKILL = {
  'review-prepare.js':           'review-sdlc',
  'pr-prepare.js':               'pr-sdlc',
  'version-prepare.js':          'version-sdlc',
  'jira-prepare.js':             'jira-sdlc',
  'received-review-prepare.js':  'received-review-sdlc',
  'commit-prepare.js':           'commit-sdlc',
  'ship-prepare.js':             'ship-sdlc',
};

// All 10 skills that must declare user-invocable: true
// (review-init-sdlc, pr-customize-sdlc, guardrails-init-sdlc absorbed into setup-sdlc)
const USER_INVOCABLE_SKILLS = [
  'plan-sdlc',
  'execute-plan-sdlc',
  'pr-sdlc',
  'review-sdlc',
  'received-review-sdlc',
  'commit-sdlc',
  'version-sdlc',
  'jira-sdlc',
  'ship-sdlc',
  'setup-sdlc',
];

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

// Detect if content searches CWD (.) before ~/.claude/plugins for any *.js script
function detectCwdFirstResolution(content) {
  const lines = content.split('\n');
  const findings = [];
  let cwdIdx     = -1;
  let pluginsIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/find\s+\.\s+-name\s+["'][^"']+\.js["']/.test(line)) {
      cwdIdx = i;
    }
    if (/find\s+~\/\.claude\/plugins\s+-name\s+["'][^"']+\.js["']/.test(line)) {
      pluginsIdx = i;
    }
  }

  if (cwdIdx !== -1 && pluginsIdx !== -1 && cwdIdx < pluginsIdx) {
    findings.push({ line: cwdIdx + 1, detail: 'CWD searched before ~/.claude/plugins' });
  }
  return findings;
}

// Detect if content contains a find pattern referencing a specific script name
function containsPrepareScriptExecution(content, scriptName) {
  return content.includes(`-name "${scriptName}"`) || content.includes(`-name '${scriptName}'`);
}

// Detect if content contains node "$SCRIPT" (or 'node $SCRIPT') call
function containsNodeScriptCall(content) {
  return /node\s+["']?\$SCRIPT["']?/.test(content);
}

// Detect the old buggy resolver: a `find ~/.claude/plugins ...` line locating a
// plugin script by name. Regardless of `sort -V`/`head -1`, this shape can select
// a fixture/clone copy instead of the installed script (#485).
function isFindPluginScriptLine(line) {
  return line.includes('find ~/.claude/plugins') && line.includes('.js');
}

// Detect the new injected-path resolver form: node "<PLUGIN_ROOT>/scripts/…".
function isInjectedPathResolverLine(line) {
  return line.includes('<PLUGIN_ROOT>/scripts/');
}

// Any plugin-script resolver — old find form or new injected-path form. Forbidden
// in subagent/orchestrator templates, which run without the injected root context.
function isAnyPluginScriptResolverLine(line) {
  return isFindPluginScriptLine(line) || isInjectedPathResolverLine(line);
}

// Detect a dispatch example that forwards a precomputed invocation/dispatch field.
// Two shapes (per #485, Key Decision 5): a fenced example referencing a precomputed
// `.invocation` field, or an inline-constructed dispatch naming BOTH `subagent_type:`
// and `model:` on one line where the value is a dotted precomputed field reference
// (e.g. `dimension.model`). Bare placeholders on separate lines are NOT construction.
function isDispatchExampleLine(line, inFence) {
  if (inFence && line.includes('.invocation')) return true;
  return /subagent_type:/.test(line)
      && /model:/.test(line)
      && /[A-Za-z_]\w*\.[A-Za-z_]\w*/.test(line);
}

// Detect a verbatim guard in a section's text. Accept both phrasings (#485):
//   exact:   /verbatim/i AND (/do not construct/i OR /from .*example/i)
//   variant: /verbatim/i AND /without .*(mutation|modif)/i  (plan-explore-orchestrator.md:12)
function hasVerbatimGuard(text) {
  if (!/verbatim/i.test(text)) return false;
  const exact   = /do not construct/i.test(text) || /from .*example/i.test(text);
  const variant = /without .*(mutation|modif)/i.test(text);
  return exact || variant;
}

// Detect whether an agent template's frontmatter `tools` field lists Agent — the
// marker of a dispatch-bearing orchestrator. Leaf drafters (`tools: Read`) do not
// dispatch subagents and are excluded from the await-barrier rule (#487).
function frontmatterToolsIncludesAgent(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const toolsLine = frontmatter.split('\n').find(l => /^\s*tools:/i.test(l));
  return toolsLine ? /\bAgent\b/.test(toolsLine) : false;
}

// Detect the await-barrier guard tokens (#487): a mandatory synchronous dispatch
// (`run_in_background: false`) co-present with a barrier instruction in any of its
// accepted phrasings.
function hasAwaitBarrierTokens(content) {
  const hasSyncDispatch = /run_in_background:\s*false/.test(content);
  const hasBarrier = /await barrier/i.test(content)
      || /never consolidate on partial/i.test(content)
      || /R-orchestrator-await/.test(content);
  return hasSyncDispatch && hasBarrier;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Rule 1 — script-resolution-order
 * All find patterns in skill files must use plugins-first order.
 */
function checkScriptResolutionOrder(skills, findings) {
  for (const skill of skills) {
    const content = readFile(skill.file);
    if (!content) continue;
    const issues = detectCwdFirstResolution(content);
    for (const issue of issues) {
      findings.push({
        rule: 'script-resolution-order',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        line: issue.line,
        message: 'Script resolution uses CWD-first order. Use plugins-first: find ~/.claude/plugins first, then fall back to find .',
      });
    }
  }
}

/**
 * Rule 1b — script-resolution-version
 * Plugin scripts must be resolved via the injected-path form —
 * node "<PLUGIN_ROOT>/scripts/…" — where <PLUGIN_ROOT> is substituted from the
 * `sdlc plugin root: <abs>` line the SessionStart hook injects into session
 * context. The old `find ~/.claude/plugins ...` resolver (even with
 * `| sort -V | tail -1`) can silently select a fixture or marketplace-clone
 * copy of the script instead of the installed one. See #485.
 *
 * Subagent prompt templates (plugins/sdlc-utilities/skills/**\/*-prompt.md) and
 * orchestrator agent templates (plugins/sdlc-utilities/agents/*.md) run in
 * subagent context, where the `sdlc plugin root:` line is ABSENT — so ANY
 * plugin-script resolver there (old find form or the injected-path form) fails
 * silently. Both forms are forbidden in that surface.
 */
function checkScriptResolutionVersionSelector(skills, projectRoot, findings) {
  // Surface A: skill bodies — only the old find-based resolver is flagged; the
  // injected-path form is the required replacement and is not an error here.
  for (const skill of skills) {
    const content = readFile(skill.file);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!isFindPluginScriptLine(lines[i])) continue;
      findings.push({
        rule: 'script-resolution-version',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        line: i + 1,
        message: 'Script resolution uses \'find ~/.claude/plugins\' which can silently select a fixture or marketplace-clone copy of the script (#485). Use the injected-path form instead: node "<PLUGIN_ROOT>/scripts/…", substituting <PLUGIN_ROOT> from the \'sdlc plugin root:\' line in session context.',
      });
    }
  }

  // Surface B: subagent prompt templates + orchestrator agent templates — no
  // plugin-script resolver of any form is allowed; the injected root line is
  // absent in subagent context.
  const subagentFiles = [
    ...discoverPromptTemplates(projectRoot),
    ...discoverOrchestratorTemplates(projectRoot),
  ];
  for (const file of subagentFiles) {
    const content = readFile(file);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!isAnyPluginScriptResolverLine(lines[i])) continue;
      findings.push({
        rule: 'script-resolution-version',
        severity: 'error',
        file: path.relative(process.cwd(), file),
        line: i + 1,
        message: 'Subagent/orchestrator template contains a plugin-script resolver. These run in subagent context where the \'sdlc plugin root:\' line is absent, so any resolver here (find-based or injected-path) fails silently. Pass a pre-computed path into the template instead.',
      });
    }
  }
}

/**
 * Rule 2 — skill-runs-script
 * Skills paired with a prepare script must contain the find+node resolution pattern.
 */
function checkSkillRunsScript(skills, scriptNames, findings) {
  for (const [scriptName, skillName] of Object.entries(SCRIPT_TO_SKILL)) {
    if (!scriptNames.includes(scriptName)) continue; // script not present in repo — skip

    const skill = skills.find(s => s.name === skillName);
    if (!skill) {
      findings.push({
        rule: 'skill-runs-script',
        severity: 'error',
        file: `plugins/sdlc-utilities/skills/${skillName}/SKILL.md`,
        message: `Skill directory '${skillName}' not found. Expected skill paired with ${scriptName}.`,
      });
      continue;
    }

    const content = readFile(skill.file);
    if (!content) continue;

    if (!containsPrepareScriptExecution(content, scriptName) || !containsNodeScriptCall(content)) {
      findings.push({
        rule: 'skill-runs-script',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skillName}' is paired with ${scriptName} but does not contain the find+node resolution pattern. Skills must run their own prepare scripts.`,
      });
    }
  }
}

/**
 * Rule 3 — skill-uses-output-file
 * Skills that run prepare scripts must use --output-file to capture output.
 */
function checkSkillUsesMktemp(skills, scriptNames, findings) {
  for (const [scriptName, skillName] of Object.entries(SCRIPT_TO_SKILL)) {
    if (!scriptNames.includes(scriptName)) continue;

    const skill = skills.find(s => s.name === skillName);
    if (!skill) continue; // already reported in rule 2

    const content = readFile(skill.file);
    if (!content || !containsPrepareScriptExecution(content, scriptName)) continue;

    if (!content.includes('--output-file')) {
      findings.push({
        rule: 'skill-uses-output-file',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skillName}' runs ${scriptName} but does not use --output-file. Scripts write JSON to a crypto-random temp file via --output-file — never use mktemp in the bash block.`,
      });
    }
  }
}

/**
 * Rule 4 — skill-checks-exit-code
 * Skills that run prepare scripts must capture EXIT_CODE=$? and handle non-zero exits.
 */
function checkSkillChecksExitCode(skills, scriptNames, findings) {
  for (const [scriptName, skillName] of Object.entries(SCRIPT_TO_SKILL)) {
    if (!scriptNames.includes(scriptName)) continue;

    const skill = skills.find(s => s.name === skillName);
    if (!skill) continue;

    const content = readFile(skill.file);
    if (!content || !containsPrepareScriptExecution(content, scriptName)) continue;

    if (!content.includes('EXIT_CODE')) {
      findings.push({
        rule: 'skill-checks-exit-code',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skillName}' runs ${scriptName} but does not capture or check EXIT_CODE. Add: EXIT_CODE=$? and handle non-zero exit codes.`,
      });
    }
  }
}

/**
 * Rule 5 — skill-passes-arguments
 * Skills that run prepare scripts must use $ARGUMENTS in the node "$SCRIPT" $ARGUMENTS call.
 */
function checkSkillPassesArguments(skills, scriptNames, findings) {
  for (const [scriptName, skillName] of Object.entries(SCRIPT_TO_SKILL)) {
    if (!scriptNames.includes(scriptName)) continue;

    const skill = skills.find(s => s.name === skillName);
    if (!skill) continue;

    const content = readFile(skill.file);
    if (!content || !containsPrepareScriptExecution(content, scriptName)) continue;

    if (!content.includes('$ARGUMENTS')) {
      findings.push({
        rule: 'skill-passes-arguments',
        severity: 'warning',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skillName}' runs ${scriptName} but does not use $ARGUMENTS. Use: node "$SCRIPT" $ARGUMENTS`,
      });
    }
  }
}

/**
 * Rule 6 — frontmatter-field-names
 * All skills must use user-invocable (not the deprecated user-invokable).
 */
function checkFrontmatterFieldNames(skills, findings) {
  for (const skill of skills) {
    const content = readFile(skill.file);
    if (!content) continue;

    if (content.includes('user-invokable')) {
      const lineNum = content.split('\n').findIndex(l => l.includes('user-invokable')) + 1;
      findings.push({
        rule: 'frontmatter-field-names',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        line: lineNum,
        message: "Deprecated frontmatter field 'user-invokable' found. Use 'user-invocable' instead.",
      });
    }
  }
}

/**
 * Rule 7 — user-invocable-flag
 * All 6 user-facing skills must declare user-invocable: true in frontmatter.
 */
function checkUserInvocableFlag(skills, findings) {
  for (const skillName of USER_INVOCABLE_SKILLS) {
    const skill = skills.find(s => s.name === skillName);
    if (!skill) {
      findings.push({
        rule: 'user-invocable-flag',
        severity: 'error',
        file: `plugins/sdlc-utilities/skills/${skillName}/SKILL.md`,
        message: `Skill '${skillName}' not found. All 6 user-facing skills must exist with user-invocable: true.`,
      });
      continue;
    }

    const content = readFile(skill.file);
    if (!content) continue;

    // Extract frontmatter block (between first --- and second ---)
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const frontmatter = fmMatch ? fmMatch[1] : '';

    if (!frontmatter.includes('user-invocable: true')) {
      const lineNum = content.split('\n').findIndex(l => l.includes('user-invocable')) + 1;
      findings.push({
        rule: 'user-invocable-flag',
        severity: 'error',
        file: path.relative(process.cwd(), skill.file),
        line: lineNum > 0 ? lineNum : undefined,
        message: `Skill '${skillName}' must have 'user-invocable: true' in frontmatter.`,
      });
    }
  }
}

/**
 * Rule 8 — docs-skill-existence
 * Every skill directory must have a matching docs/skills/<name>.md file.
 */
function checkDocsSkillExistence(skills, projectRoot, findings) {
  for (const skill of skills) {
    const docPath = path.join(projectRoot, 'docs/skills', skill.name + '.md');
    if (!isFile(docPath)) {
      findings.push({
        rule: 'docs-skill-existence',
        severity: 'error',
        file: `docs/skills/${skill.name}.md`,
        message: `Missing documentation file for skill '${skill.name}'. Expected: docs/skills/${skill.name}.md`,
      });
    }
  }
}

/**
 * Rule 9 — skills-meta-existence
 * Every user-invocable skill must have a matching slug entry in site/src/data/skills-meta.ts.
 */
function checkSkillsMetaExistence(projectRoot, findings) {
  const metaPath = path.join(projectRoot, 'site/src/data/skills-meta.ts');
  const content  = readFile(metaPath);
  if (!content) {
    findings.push({
      rule: 'skills-meta-existence',
      severity: 'error',
      file: 'site/src/data/skills-meta.ts',
      message: 'Could not read site/src/data/skills-meta.ts. File missing or unreadable.',
    });
    return;
  }

  const slugs = new Set();
  const slugRe = /slug:\s*'([^']+)'/g;
  let m;
  while ((m = slugRe.exec(content)) !== null) {
    slugs.add(m[1]);
  }

  for (const skillName of USER_INVOCABLE_SKILLS) {
    if (!slugs.has(skillName)) {
      findings.push({
        rule: 'skills-meta-existence',
        severity: 'error',
        file: 'site/src/data/skills-meta.ts',
        message: `No slug entry found for user-invocable skill '${skillName}'. Add: slug: '${skillName}'`,
      });
    }
  }
}

/**
 * Rule 10 — readme-skills-table
 * Every user-invocable skill must appear in the README.md skills table.
 */
function checkReadmeSkillsTable(projectRoot, findings) {
  const readmePath = path.join(projectRoot, 'README.md');
  const content    = readFile(readmePath);
  if (!content) {
    findings.push({
      rule: 'readme-skills-table',
      severity: 'warning',
      file: 'README.md',
      message: 'Could not read README.md. File missing or unreadable.',
    });
    return;
  }

  const tableLines = content.split('\n').filter(l => l.trimStart().startsWith('|'));

  for (const skillName of USER_INVOCABLE_SKILLS) {
    const present = tableLines.some(l => l.includes(`/${skillName}`));
    if (!present) {
      findings.push({
        rule: 'readme-skills-table',
        severity: 'warning',
        file: 'README.md',
        message: `Skill '${skillName}' not found in README.md skills table. Add a row referencing /${skillName}.`,
      });
    }
  }
}

/**
 * Rule 11 — temp-file-cleanup
 * Skills that use --output-file must also contain a cleanup reference (rm -f, rm -rf, or clean).
 */
function checkTempFileCleanup(skills, scriptNames, findings) {
  for (const [scriptName, skillName] of Object.entries(SCRIPT_TO_SKILL)) {
    if (!scriptNames.includes(scriptName)) continue;

    const skill = skills.find(s => s.name === skillName);
    if (!skill) continue;

    const content = readFile(skill.file);
    if (!content) continue;

    if (!content.includes('--output-file')) continue;

    const hasCleanup = /rm\s+-[rf]f?/.test(content) || /clean/i.test(content);
    if (!hasCleanup) {
      findings.push({
        rule: 'temp-file-cleanup',
        severity: 'warning',
        file: path.relative(process.cwd(), skill.file),
        message: `Skill '${skillName}' uses --output-file but has no cleanup reference (rm -f, rm -rf, or clean). Temp files should be cleaned up after use.`,
      });
    }
  }
}

/**
 * Rule 12 — invocation-verbatim
 * Dispatch-bearing templates (orchestrator agent templates + subagent prompt
 * templates) that show an inline dispatch example built from a precomputed
 * invocation/dispatch field must carry a verbatim guard co-located in the SAME
 * header-delimited section as the example (#485). A "section" is the span
 * between markdown headers (a `#` line outside a code fence). The example and
 * its guard must live together so the LLM sees both — a guard in a different
 * section does not defend the example.
 */
function checkInvocationVerbatim(projectRoot, findings) {
  const files = [
    ...discoverOrchestratorTemplates(projectRoot),
    ...discoverPromptTemplates(projectRoot),
  ];

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;
    const lines = content.split('\n');

    // Partition into header-delimited sections. Each section records the first
    // dispatch-example line it contains (1-based) and its full text for guard
    // detection. Code fences are tracked so a `#` inside a fence is not a header
    // and a `.invocation` inside a fence is recognised as a fenced example.
    const sections = [];
    let current = { dispatchLine: null, text: [] };
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
      } else if (!inFence && /^#{1,6}\s/.test(line)) {
        sections.push(current);
        current = { dispatchLine: null, text: [] };
      }
      current.text.push(line);
      if (current.dispatchLine === null && isDispatchExampleLine(line, inFence)) {
        current.dispatchLine = i + 1;
      }
    }
    sections.push(current);

    for (const section of sections) {
      if (section.dispatchLine === null) continue;
      if (hasVerbatimGuard(section.text.join('\n'))) continue;
      findings.push({
        rule: 'invocation-verbatim',
        severity: 'error',
        file: path.relative(process.cwd(), file),
        line: section.dispatchLine,
        message: 'Dispatch example builds invocation/dispatch args from a precomputed field but its section has no verbatim guard. Add a co-located instruction to forward the precomputed field verbatim (e.g. "Use the precomputed dispatch fields verbatim; do not construct them from the examples above").',
      });
    }
  }
}

/**
 * Rule 13 — orchestrator-await-barrier
 * Two dispatch surfaces must carry the await-barrier guard (#487):
 *   1. Orchestrator agent templates whose frontmatter `tools` includes Agent
 *      (dispatch-bearing). Leaf drafters (`tools: Read` — commit / harden /
 *      error-report orchestrators) do not dispatch subagents and are excluded
 *      structurally.
 *   2. Any SKILL file carrying the `<!-- fan-out-dispatch: await-barrier-required -->`
 *      marker (e.g. the plan-sdlc Step 5 fan-out). The marker declares that the
 *      surrounding fan-out must block on results, so the guard tokens must be
 *      present — without a brittle "detect a fan-out in prose" heuristic.
 * Guard tokens: `run_in_background: false` AND a barrier instruction
 * (await barrier / never consolidate on partial / R-orchestrator-await).
 */
function checkOrchestratorAwaitBarrier(skills, projectRoot, findings) {
  // Surface 1 — dispatch-bearing orchestrator agent templates.
  for (const file of discoverOrchestratorTemplates(projectRoot)) {
    const content = readFile(file);
    if (!content) continue;
    if (!frontmatterToolsIncludesAgent(content)) continue; // leaf drafter — no dispatch
    if (hasAwaitBarrierTokens(content)) continue;
    const lines = content.split('\n');
    const toolsIdx = lines.findIndex(l => /^\s*tools:/i.test(l));
    findings.push({
      rule: 'orchestrator-await-barrier',
      severity: 'error',
      file: path.relative(process.cwd(), file),
      line: toolsIdx >= 0 ? toolsIdx + 1 : undefined,
      message: 'Dispatch-bearing orchestrator template (frontmatter tools includes Agent) is missing the await-barrier guard. Add `run_in_background: false` on every Agent dispatch plus a barrier instruction so the turn cannot end on partial results (e.g. "Await barrier … never consolidate on partial or zero results", R-orchestrator-await, #487).',
    });
  }

  // Surface 2 — SKILL files carrying the fan-out-dispatch await-barrier-required marker.
  const MARKER = '<!-- fan-out-dispatch: await-barrier-required -->';
  for (const skill of skills) {
    const content = readFile(skill.file);
    if (!content || !content.includes(MARKER)) continue;
    if (hasAwaitBarrierTokens(content)) continue;
    const lines = content.split('\n');
    const markerIdx = lines.findIndex(l => l.includes(MARKER));
    findings.push({
      rule: 'orchestrator-await-barrier',
      severity: 'error',
      file: path.relative(process.cwd(), skill.file),
      line: markerIdx >= 0 ? markerIdx + 1 : undefined,
      message: 'Fan-out marked `await-barrier-required` but the file is missing the await-barrier guard. Add `run_in_background: false` on the parallel dispatch plus a barrier instruction (await barrier / never consolidate on partial / R-orchestrator-await, #487).',
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { projectRoot, jsonOutput } = parseArgs(process.argv);

  const pluginRoot = path.join(projectRoot, 'plugins/sdlc-utilities');
  if (!isDir(pluginRoot)) {
    process.stderr.write(`ERROR: Plugin directory not found: ${pluginRoot}\n`);
    process.stderr.write(`Run this script from the sdlc-marketplace repository root, or pass --project-root.\n`);
    process.exit(2);
  }

  const skills      = discoverSkills(projectRoot);
  const scriptNames = discoverScripts(projectRoot);

  const findings = [];

  checkScriptResolutionOrder(skills, findings);
  checkScriptResolutionVersionSelector(skills, projectRoot, findings);
  checkSkillRunsScript(skills, scriptNames, findings);
  checkSkillUsesMktemp(skills, scriptNames, findings);
  checkSkillChecksExitCode(skills, scriptNames, findings);
  checkSkillPassesArguments(skills, scriptNames, findings);
  checkFrontmatterFieldNames(skills, findings);
  checkUserInvocableFlag(skills, findings);
  checkDocsSkillExistence(skills, projectRoot, findings);
  checkSkillsMetaExistence(projectRoot, findings);
  checkReadmeSkillsTable(projectRoot, findings);
  checkTempFileCleanup(skills, scriptNames, findings);
  checkInvocationVerbatim(projectRoot, findings);
  checkOrchestratorAwaitBarrier(skills, projectRoot, findings);

  const errors   = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(findings, null, 2) + '\n');
    process.exit(errors.length > 0 ? 1 : 0);
  }

  // Human-readable output
  if (findings.length === 0) {
    process.stdout.write('✓ All consistency checks passed.\n');
    process.exit(0);
  }

  process.stdout.write(`Plugin consistency check: ${errors.length} error(s), ${warnings.length} warning(s)\n\n`);

  for (const f of findings) {
    const loc  = f.line ? `:${f.line}` : '';
    const icon = f.severity === 'error' ? '✗' : '⚠';
    process.stdout.write(`${icon} [${f.rule}] ${f.file}${loc}\n  ${f.message}\n\n`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
