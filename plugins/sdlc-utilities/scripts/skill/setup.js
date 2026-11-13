#!/usr/bin/env node
/**
 * @file skill/setup.js
 * @description Pre-computes project state for the setup-sdlc skill: detects version
 *   files, existing config, legacy settings, and outputs a JSON manifest.
 *   With --scan it adds `scan` (P-scan, lib/project-scan.js) read from the active
 *   worktree; --scan-prs also fills `scan.recentPrs` (R10, R14).
 * @skill setup-sdlc
 * @exit 0 success (JSON on stdout), 1 error
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const LIB = path.join(__dirname, '..', 'lib');

const { detectVersionFile } = require(path.join(LIB, 'version'));
const { LEGACY, PROJECT_CONFIG_PATH, LOCAL_CONFIG_PATH, PROJECT_SECTIONS, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { writeOutput } = require(path.join(LIB, 'output'));
const { SHIP_FIELDS } = require(path.join(LIB, 'ship-fields'));
const { SETUP_SECTIONS } = require(path.join(LIB, 'setup-sections'));
const { detectBaseBranchSafe } = require(path.join(LIB, 'git'));
const { resolveActiveWorktreeSafe } = require(path.join(LIB, 'worktree'));
const { scanProject } = require(path.join(LIB, 'project-scan'));
const { OPENSPEC_ENRICH_VERSION } = require(path.join(__dirname, '..', 'util', 'openspec-enrich'));
// workspace-context removed (issue #378, #379): workspace is auto-detected, no
// placement wizard, no worktree previews.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Copy fields, adding `current` when cfg holds a value for field.name (R7, P-sections). Never mutates input. */
function withCurrent(fields, cfg) {
  if (!cfg || typeof cfg !== 'object') return fields.map(f => ({ ...f }));
  return fields.map(f => (cfg[f.name] !== undefined ? { ...f, current: cfg[f.name] } : { ...f }));
}

function countFiles(dirPath, ext, exclude) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath).filter(f => f.endsWith(ext) && f !== exclude).length;
}

function execSafe(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (_) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Static compatibility tables (T2: R-version-prerelease-compat, #338)
// ---------------------------------------------------------------------------

/**
 * Static map of fileType → pre-release compatibility level.
 * Emitted verbatim in prepare output as `preReleaseCompat`.
 * Data-only — no detection-time inputs; SKILL.md cites `level` by name.
 */
const PRE_RELEASE_COMPAT = {
  'package.json': { level: 'compatible', message: '' },
  'cargo.toml':   { level: 'compatible', message: '' },
  'plugin.json':  { level: 'compatible', message: '' },
  'pyproject.toml': {
    level: 'partial',
    message: 'pyproject.toml uses PEP 440 pre-release format (e.g., .rc1), which differs from semver (-rc.1). /version-sdlc writes a semver string that may not parse cleanly with PEP 440 tooling. Confirm before writing.',
  },
  'pubspec.yaml': {
    level: 'incompatible',
    message: 'pubspec.yaml does not support semver pre-release labels. Setting preRelease will break /version-sdlc at bump time.',
  },
  'version-file': {
    level: 'unknown',
    message: 'Plain text version files accept any string, but downstream tooling that reads this file may not. Confirm before writing.',
  },
};

/**
 * Contract describing accepted free-text patterns for Step 1's numbered-list reply.
 * Emitted in prepare output as `menuInputContract` with `defaultToken` overlaid per-invocation.
 * SKILL.md cites this object when constructing the prompt and parsing the reply.
 */
const MENU_INPUT_CONTRACT = {
  tokens: { all: 'all', notSet: 'not-set', none: 'none', cancel: 'cancel' },
  allowsNumbers: true,
  allowsRanges: true,
  separators: [',', ' '],
  // defaultToken is overlaid per-invocation in the main block based on flags.unsetOnly
};

// ---------------------------------------------------------------------------
// Plugin self-version (R-SCRIPT-VERSIONS, #424 — Key Decision #7)
// Uses __dirname walk: works in any consumer project (plugin-agnostic).
// ---------------------------------------------------------------------------
let pluginVersion = null;
try {
  const pluginJsonPath = path.resolve(__dirname, '..', '..', '.claude-plugin', 'plugin.json');
  pluginVersion = require(pluginJsonPath).version || null;
} catch (_) { /* non-fatal — plugin.json may not exist in dev setups */ }

// ---------------------------------------------------------------------------
// Detection logic
// ---------------------------------------------------------------------------

function detect(projectRoot) {
  // --- Project config (.sdlc/config.json — issue #231; legacy .claude/sdlc.json
  // read via lib/config.js fallback if PROJECT_CONFIG_PATH points to the new location). ---
  const unifiedPath = path.join(projectRoot, PROJECT_CONFIG_PATH);
  const unifiedExists = fs.existsSync(unifiedPath);
  let projectConfigSections = [];
  let parsedProjectConfig = null;
  if (unifiedExists) {
    try {
      parsedProjectConfig = JSON.parse(fs.readFileSync(unifiedPath, 'utf8'));
      projectConfigSections = Object.keys(parsedProjectConfig).filter(k => k !== '$schema' && k !== 'schemaVersion');
    } catch (_) {
      // file exists but is not valid JSON — report it as existing with no sections
    }
  }

  // --- Local config (.sdlc/local.json) ---
  const localPath = path.join(projectRoot, LOCAL_CONFIG_PATH);
  const localExists = fs.existsSync(localPath);

  // Detect v1 ship-section shape (legacy preset/skip keys, or missing
  // top-level version stamp). Drives needsMigration so `/setup-sdlc` reports
  // the migration to the user even though readLocalConfig will run it
  // automatically on next read.
  let localIsV1 = false;
  if (localExists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      const hasLegacyShipKeys =
        parsed.ship && (
          Object.prototype.hasOwnProperty.call(parsed.ship, 'preset') ||
          Object.prototype.hasOwnProperty.call(parsed.ship, 'skip')
        );
      const noVersion = parsed.schemaVersion == null && parsed.version == null;
      localIsV1 = hasLegacyShipKeys || (noVersion && !!parsed.ship);
    } catch (_) {
      // unreadable JSON — leave localIsV1 false; downstream tooling handles errors
    }
  }

  // --- Legacy files ---
  const legacyVersionPath = path.join(projectRoot, LEGACY.version);
  const legacyShipPath = path.join(projectRoot, LEGACY.ship);
  const legacyJiraPath = path.join(projectRoot, LEGACY.jira);
  const legacyReviewSdlcPath = path.join(projectRoot, LEGACY.reviewSdlc);
  const legacyReviewClaudePath = path.join(projectRoot, LEGACY.reviewClaude);

  // --- Content files ---
  const reviewDimensionsDir = path.join(projectRoot, '.sdlc', 'review-dimensions');
  // Issue #260: scaffold target is now .sdlc/pr-template.md (canonical).
  // The deprecated .claude/pr-template.md location remains read-only via
  // lib/pr-template.js::resolvePrTemplatePath until the deprecation window closes.
  const prTemplatePath = path.join(projectRoot, '.sdlc', 'pr-template.md');
  const jiraTemplatesDir = path.join(projectRoot, '.sdlc', 'jira-templates');
  const planTemplatePath = path.join(projectRoot, '.sdlc', 'plan-template.md');

  // --- OpenSpec config detection ---
  const openspecConfigPath = path.join(projectRoot, 'openspec', 'config.yaml');
  const openspecConfigExists = fs.existsSync(openspecConfigPath);
  let openspecManagedBlockVersion = null;
  if (openspecConfigExists) {
    try {
      const configContent = fs.readFileSync(openspecConfigPath, 'utf8');
      const beginMatch = /^# BEGIN MANAGED BY sdlc-utilities \(v(\d+)\)$/m.exec(configContent);
      if (beginMatch) {
        openspecManagedBlockVersion = parseInt(beginMatch[1], 10);
      }
    } catch (_) {
      // file exists but unreadable — report exists with null version
    }
  }

  // --- Version file detection ---
  const versionResult = detectVersionFile(projectRoot);
  let detectedVersionFile = null;
  let detectedFileType = null;
  if (versionResult) {
    // filePath is absolute; compute relative path for display
    detectedVersionFile = path.relative(projectRoot, versionResult.filePath);
    detectedFileType = versionResult.fileType;
  }

  // --- Tag prefix detection ---
  let tagPrefix = 'v';
  const latestTag = execSafe('git tag --list --sort=-version:refname | head -1');
  if (latestTag) {
    const prefixMatch = latestTag.match(/^([^0-9]*)/);
    tagPrefix = prefixMatch ? prefixMatch[1] : '';
  }

  // --- Default branch detection (issue #339: shared helper, never throws) ---
  const defaultBranch = detectBaseBranchSafe(projectRoot);

  // ---------------------------------------------------------------------------
  // Assemble output
  // ---------------------------------------------------------------------------

  const misplacedSections = projectConfigSections.filter(s => !PROJECT_SECTIONS.has(s));

  const result = {
    projectConfig: {
      exists: unifiedExists,
      sections: projectConfigSections,
      misplaced: misplacedSections,
      path: PROJECT_CONFIG_PATH,
    },
    localConfig: {
      exists: localExists,
      path: LOCAL_CONFIG_PATH,
    },
    legacy: {
      version: { exists: fs.existsSync(legacyVersionPath), path: LEGACY.version },
      ship:    { exists: fs.existsSync(legacyShipPath),    path: LEGACY.ship    },
      review:  { exists: fs.existsSync(legacyReviewSdlcPath),   path: LEGACY.reviewSdlc   },
      reviewLegacy: { exists: fs.existsSync(legacyReviewClaudePath), path: LEGACY.reviewClaude },
      jira:    { exists: fs.existsSync(legacyJiraPath),    path: LEGACY.jira    },
      // R-LEGACY-DETECT (#423): detect legacy jira-templates dir for migration reporting.
      jiraTemplates: {
        exists: fs.existsSync(path.join(projectRoot, '.claude', 'jira-templates')),
        path: path.join('.claude', 'jira-templates') + path.sep,
      },
    },
    content: {
      reviewDimensions: {
        count: countFiles(reviewDimensionsDir, '.md', '_common.md'),
        path: path.join('.sdlc', 'review-dimensions') + path.sep,
      },
      prTemplate: {
        exists: fs.existsSync(prTemplatePath),
        path: path.join('.sdlc', 'pr-template.md'),
      },
      planTemplate: {
        exists: fs.existsSync(planTemplatePath),
        path: path.join('.sdlc', 'plan-template.md'),
      },
      jiraTemplates: {
        count: countFiles(jiraTemplatesDir, '.md'),
        path: path.join('.sdlc', 'jira-templates') + path.sep,
      },
      planGuardrails: {
        count: Array.isArray(parsedProjectConfig?.plan?.guardrails)
          ? parsedProjectConfig.plan.guardrails.length
          : 0,
      },
    },
    detected: {
      versionFile: detectedVersionFile,
      fileType: detectedFileType,
      tagPrefix,
      defaultBranch,
    },
    openspecConfig: {
      exists: openspecConfigExists,
      path: path.join('openspec', 'config.yaml'),
      managedBlockVersion: openspecManagedBlockVersion,
    },
    shipFields: SHIP_FIELDS,
    preReleaseCompat: PRE_RELEASE_COMPAT,
    pluginVersion,
  };

  // R-SCRIPT-VERSIONS (#424): check installed CI scripts using scaffold-ci.js
  // MANIFEST + extractVersion exports to avoid spawn overhead.
  // Mirrors the existing version-sdlc Step 7.5 integration — report only, no writes.
  try {
    const scaffoldCi = require(path.join(__dirname, '..', 'util', 'scaffold-ci'));
    const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
    const ciFiles = [];
    for (const entry of scaffoldCi.MANIFEST) {
      const srcPath  = path.join(PLUGIN_ROOT, entry.src);
      const destPath = path.join(projectRoot, entry.dest);
      const legacyPath = entry.legacyDest ? path.join(projectRoot, entry.legacyDest) : null;
      const destExists   = fs.existsSync(srcPath) && (() => {
        try { fs.readFileSync(srcPath, 'utf8'); return true; } catch (_) { return false; }
      })();
      let currentVersion = null;
      try {
        const srcContent = fs.readFileSync(srcPath, 'utf8');
        currentVersion = scaffoldCi.extractVersion(srcContent, entry.versionRegex);
      } catch (_) { /* source missing */ }

      const ciDestExists   = fs.existsSync(destPath);
      const ciLegacyExists = legacyPath ? fs.existsSync(legacyPath) : false;
      let installedVersion = null;
      let action = 'current';
      try {
        if (ciDestExists) {
          const destContent = fs.readFileSync(destPath, 'utf8');
          installedVersion = scaffoldCi.extractVersion(destContent, entry.versionRegex);
        } else if (ciLegacyExists) {
          const legacyContent = fs.readFileSync(legacyPath, 'utf8');
          installedVersion = scaffoldCi.extractVersion(legacyContent, entry.versionRegex);
        }
        if (!ciDestExists && ciLegacyExists) {
          action = 'outdated';
        } else if (!ciDestExists) {
          action = 'missing';
        } else if (currentVersion !== null && installedVersion !== null && installedVersion < currentVersion) {
          action = 'outdated';
        } else {
          action = 'current';
        }
      } catch (_) { action = 'missing'; }

      ciFiles.push({ file: entry.dest, action, installedVersion, currentVersion });
    }
    const outdatedCount = ciFiles.filter(
      f => f.action === 'outdated' || f.action === 'missing'
    ).length;
    result.scriptVersions = { files: ciFiles, outdatedCount };
  } catch (_) {
    // Non-fatal: scaffold-ci.js exports may not be available in all installs.
    result.scriptVersions = { files: [], outdatedCount: 0 };
  }

  result.needsMigration =
    Object.values(result.legacy).some(l => l.exists) ||
    misplacedSections.length > 0 ||
    localIsV1;
  result.localIsV1 = localIsV1;

  // plan.copyRules validation (P-copyRules): same matcher as the plan copy check.
  const copyRules = parsedProjectConfig?.plan?.copyRules;
  if (copyRules === undefined) {
    result.copyRules = null;
  } else {
    const { validateCopyRules } = require(path.join(LIB, 'plan-parse'));
    const { errors, warnings } = validateCopyRules(copyRules, projectRoot);
    result.copyRules = { rules: Array.isArray(copyRules) ? copyRules.length : 0, errors, warnings };
  }

  // ---------------------------------------------------------------------------
  // sections[] — joined view of SETUP_SECTIONS × detect() state. Drives the
  // selective-section menu in setup-sdlc/SKILL.md Step 1 and the verbose
  // dispatch loop in Step 3. See lib/setup-sections.js for the manifest.
  // Existing top-level keys above are preserved for back-compat.
  // ---------------------------------------------------------------------------

  // Read local config once (parsed) so summarize() can render set-state rows.
  let parsedLocalConfig = null;
  if (localExists) {
    try {
      parsedLocalConfig = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    } catch (_) { /* unreadable — leave null */ }
  }

  // Build a detected-context object for summarize() consumers. The leading
  // underscore on _parsedProjectConfig signals "internal — not part of the
  // P-field contract" but it is still serialized in the JSON output, which is
  // fine because summarize() runs server-side here, not in the LLM.
  const detectedContext = {
    versionFile: detectedVersionFile,
    fileType: detectedFileType,
    tagPrefix,
    defaultBranch,
    content: result.content,
    openspecConfig: result.openspecConfig,
    _parsedProjectConfig: parsedProjectConfig,
  };

  // Resolve current config slice for a given section, used as `summarize(cfg, detected)`.
  function currentCfgFor(section) {
    if (section.configFile === '.sdlc/config.json' && section.configPath) {
      // Walk dot-path. `plan.guardrails`, `execute.guardrails` need split.
      let cfg = parsedProjectConfig;
      if (!cfg) return null;
      for (const key of section.configPath.split('.')) {
        cfg = cfg?.[key];
        if (cfg == null) return null;
      }
      return cfg;
    }
    if (section.configFile === '.sdlc/local.json' && section.configPath) {
      return parsedLocalConfig?.[section.configPath] ?? null;
    }
    // Delegated/content sections — no direct config slice; summarize reads detected
    return null;
  }

  // Compute state: 'set' | 'not-set' | 'legacy'
  function computeState(section) {
    // Legacy detection per section
    if (section.id === 'version' && result.legacy.version.exists) return 'legacy';
    if (section.id === 'ship') {
      if (result.legacy.ship.exists) return 'legacy';
      if (localIsV1) return 'legacy';
    }
    if (section.id === 'review') {
      if (result.legacy.review.exists || result.legacy.reviewLegacy.exists) return 'legacy';
      if (localIsV1) return 'legacy';
    }
    if (section.id === 'jira' && result.legacy.jira.exists) return 'legacy';
    if (section.id === 'openspec-block') {
      // Legacy when managed block version is set but below the current plugin-shipped
      // version (OPENSPEC_ENRICH_VERSION from util/openspec-enrich.js). Keep this
      // conservative — a false 'set' is safer than a false 'legacy'; every run
      // offers every section again (R-walk-1).
      const v = result.openspecConfig.managedBlockVersion;
      if (v != null && v < OPENSPEC_ENRICH_VERSION) return 'legacy';
    }
    // Misplaced section in project config (e.g., `ship` keyed at project level)
    if (misplacedSections.includes(section.id)) return 'legacy';

    // Set detection
    if (section.configFile === '.sdlc/config.json') {
      // Top-level key for simple sections (version, jira, commit, pr); nested
      // for plan-guardrails (plan.guardrails) and execution-guardrails
      // (execute.guardrails).
      if (section.configPath) {
        const slice = currentCfgFor(section);
        if (slice != null) {
          // For arrays (guardrails), require length > 0 to count as set
          if (Array.isArray(slice)) return slice.length > 0 ? 'set' : 'not-set';
          return 'set';
        }
      }
    }
    if (section.configFile === '.sdlc/local.json') {
      if (parsedLocalConfig?.[section.configPath] != null) return 'set';
    }
    // Content/delegated sections
    if (section.id === 'review-dimensions') {
      return result.content.reviewDimensions.count > 0 ? 'set' : 'not-set';
    }
    if (section.id === 'pr-template') {
      return result.content.prTemplate.exists ? 'set' : 'not-set';
    }
    if (section.id === 'plan-template') {
      return result.content.planTemplate.exists ? 'set' : 'not-set';
    }
    if (section.id === 'openspec-block') {
      return result.openspecConfig.managedBlockVersion != null ? 'set' : 'not-set';
    }
    return 'not-set';
  }

  // Locked: row cannot be unchecked when migration applies and this section is
  // a migration trigger. The user must run migration; the menu auto-selects it.
  function computeLocked(section, state) {
    if (!result.needsMigration) return false;
    return state === 'legacy';
  }

  // Workspace placement context removed (issue #378, #379): workspace is
  // auto-detected from cwd + branch — there is no placement wizard or worktree
  // preview to pre-compute.

  result.sections = SETUP_SECTIONS.map(section => {
    const state = computeState(section);
    const cfg = currentCfgFor(section);
    let summary = '';
    try {
      summary = section.summarize(cfg, detectedContext) || '';
    } catch (err) {
      process.stderr.write(`[setup.js] summarize() failed for section "${section.id}": ${err.message}\n`);
      summary = '';
    }
    const row = {
      id: section.id,
      label: section.label,
      state,
      summary,
      locked: computeLocked(section, state),
      purpose: section.purpose,
      configFile: section.configFile,
      configPath: section.configPath,
      consumedBy: section.consumedBy,
      filesModified: section.filesModified,
      optional: section.optional,
      delegatedTo: section.delegatedTo,
      confirmDetected: section.confirmDetected || false,
      fields: withCurrent(section.fields, cfg),
    };
    return row;
  });

  // R7/P7: shipFields carries the current local ship values too.
  const shipSection = SETUP_SECTIONS.find(s => s.id === 'ship');
  result.shipFields = withCurrent(result.shipFields, shipSection ? currentCfgFor(shipSection) : null);

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Parse a minimal subset of CLI flags relevant to the prepare contract
 * (issue #235, issue #292). Style mirrors `version.js::parseArgs` for cross-script
 * consistency. Unknown flags are ignored — the wider flag surface (`--migrate`,
 * `--only`, sub-flow direct-entry flags) is parsed by SKILL.md. `--skip <ids>`
 * fills `flags.skip` (A2, P-skip).
 * `--scan` adds the `scan` key (P-scan); `--scan-prs` (with `--scan`) also
 * fills `scan.recentPrs` (R10).
 *
 * @param {string[]} argv — process.argv
 * @returns {{ flags: { unsetOnly: boolean, force: boolean, steps: string[]|null, scan: boolean, scanPrs: boolean, skip: string[] }, defaultSelectionMode: 'all' | 'unset-only' }}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  let unsetOnly = false;
  let force = false;
  let steps = null; // null means "not provided via CLI"
  let scan = false;
  let scanPrs = false;
  const skip = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--unset-only') {
      unsetOnly = true;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--scan') {
      scan = true;
    } else if (a === '--scan-prs') {
      scanPrs = true;
    } else if (a === '--skip') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        process.stderr.write('setup-prepare: --skip requires a section id\n');
        process.exit(1);
      }
      // --skip <ids> — comma-separated config section ids, repeatable (A2, P-skip).
      for (const id of args[i + 1].split(',').map(s => s.trim()).filter(Boolean)) {
        if (!skip.includes(id)) skip.push(id);
      }
      i++;
    } else if (a === '--steps' && args[i + 1]) {
      // --steps <csv> — comma-separated step names; used by setup-sdlc to pass
      // the user's just-selected ship.steps[] so the when-evaluator can mark
      // gated shipFields entries with skip: true (issue #292 / R15).
      steps = args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
      i++;
    }
  }

  // --force is deprecated (A3): its only effect is to win over --unset-only, so the
  // default selection mode stays 'all'.
  const defaultSelectionMode = force ? 'all' : (unsetOnly ? 'unset-only' : 'all');

  return {
    flags: { unsetOnly, force, steps, scan, scanPrs, skip },
    defaultSelectionMode,
  };
}

/**
 * Apply when-gate evaluation to shipFields (issue #292 / P7).
 *
 * For each entry in SHIP_FIELDS:
 *   - Entries without `when` → skip: false
 *   - Entries with `when.stepInActiveSteps` → skip: true if the step is absent
 *     from `activeSteps`, skip: false if present.
 *
 * The array order and length are preserved (skipped entries remain in place).
 *
 * @param {object[]} fields — raw SHIP_FIELDS array
 * @param {string[]|null} activeSteps — resolved steps[]; null means unknown (all skip: false)
 * @returns {object[]} new array with skip property added to each entry
 */
function applyWhenGates(fields, activeSteps) {
  return fields.map(field => {
    const entry = Object.assign({}, field);
    if (entry.when && entry.when.stepInActiveSteps) {
      entry.skip = activeSteps == null
        ? false
        : !activeSteps.includes(entry.when.stepInActiveSteps);
    } else {
      entry.skip = false;
    }
    return entry;
  });
}

/**
 * Config section ids that --skip accepts (A2): rows without a setup-* sub-flow.
 * @returns {string[]}
 */
function skippableSectionIds() {
  return SETUP_SECTIONS
    .filter(s => !String(s.delegatedTo || '').startsWith('setup-'))
    .map(s => s.id);
}

if (require.main === module) {
  try {
    // C-projectroot (#360): route to the main worktree's .sdlc/ root.
    const projectRoot = resolveSdlcRoot();
    const result = detect(projectRoot);
    const parsed = parseArgs(process.argv);
    const validSkip = skippableSectionIds();
    const unknownSkip = parsed.flags.skip.filter(id => !validSkip.includes(id));
    if (unknownSkip.length > 0) {
      process.stderr.write(`setup-prepare: --skip: unknown section id(s): ${unknownSkip.join(', ')}. Valid: ${validSkip.join(', ')}\n`);
      process.exit(1);
    }
    result.flags = parsed.flags;
    result.defaultSelectionMode = parsed.defaultSelectionMode;
    // Apply when-gate evaluation to shipFields (issue #292 / P7).
    // --steps <csv> supplies the actively selected steps[]; when absent, all
    // entries default to skip: false (no gating information available).
    result.shipFields = applyWhenGates(result.shipFields, parsed.flags.steps);
    // Overlay menuInputContract with per-invocation defaultToken (#337)
    result.menuInputContract = {
      ...MENU_INPUT_CONTRACT,
      defaultToken: parsed.defaultSelectionMode === 'unset-only' ? 'not-set' : 'all',
    };
    // R10/R14 (P-scan): content reads the active worktree; review dimensions
    // read the main worktree (projectRoot).
    if (parsed.flags.scan) {
      result.scan = scanProject(resolveActiveWorktreeSafe(), { projectRoot, prs: parsed.flags.scanPrs });
    }
    writeOutput(result, 'setup-prepare', 0);
  } catch (err) {
    process.stderr.write(`setup-prepare: unexpected error: ${err.message}\n`);
    process.exit(2);
  }
}

module.exports = { detect, parseArgs, applyWhenGates };
