#!/usr/bin/env node
/**
 * guardrails-prepare.js
 * Scans a project codebase and proposes plan guardrails based on detected signals.
 * Guardrails are constraints that plan-sdlc evaluates during its critique phases.
 *
 * Usage:
 *   node guardrails-prepare.js --project-root <path> [--mode init|add] [--target plan|execute] [--json]
 *
 * Options:
 *   --project-root <path>   Project root (default: cwd)
 *   --mode init|add         init = propose all; add = filter out existing (default: init)
 *   --target plan|execute   Target context: plan = plan-phase guardrails; execute = execution-phase guardrails (default: plan)
 *   --json                  Output JSON (always on; flag is for convention consistency)
 *
 * Exit codes: 0 = success, 1 = expected/config error, 2 = unexpected crash
 * Stdout: JSON
 * Stderr: warnings/progress
 *
 * Uses only Node.js built-in modules. No npm install required.
 */

'use strict';

const path = require('path');
const LIB = path.join(__dirname, '..', 'lib');

const { readSection, resolveSdlcRoot } = require(path.join(LIB, 'config'));
const { writeOutput } = require(path.join(LIB, 'output'));
const {
  createSignals,
  detectLanguagesAndFrameworks,
  detectStructure,
  detectReviewDimensions,
  extractClaudeMdRules,
} = require(path.join(LIB, 'project-scan'));

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = resolveSdlcRoot(); // issue #351: route to main worktree .sdlc/ (overridable via --project-root)
  let mode = 'init';
  let target = 'plan';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project-root' && args[i + 1]) {
      projectRoot = path.resolve(args[++i]);
    } else if (a === '--mode' && args[i + 1]) {
      mode = args[++i];
    } else if (a === '--target' && args[i + 1]) {
      target = args[++i];
    }
    // --json is accepted for convention; no action needed
  }

  if (mode !== 'init' && mode !== 'add') {
    process.stderr.write(`guardrails-prepare: invalid --mode "${mode}". Valid: init, add\n`);
    process.exit(1);
  }

  if (target !== 'plan' && target !== 'execute') {
    process.stderr.write(`guardrails-prepare: invalid --target "${target}". Valid: plan, execute\n`);
    process.exit(1);
  }

  return { projectRoot, mode, target };
}

// ---------------------------------------------------------------------------
// Existing guardrails
// ---------------------------------------------------------------------------

function readExisting(projectRoot, target) {
  let section = null;
  try {
    section = readSection(projectRoot, target);
  } catch (err) {
    return { error: `Failed to read ${target} config: ${err.message}`, count: 0, guardrails: [], ids: [] };
  }

  const guardrails = (section && Array.isArray(section.guardrails))
    ? section.guardrails
    : [];

  return {
    error: null,
    count: guardrails.length,
    guardrails,
    ids: guardrails.map(g => g.id).filter(Boolean),
  };
}

// Signal detection helpers and detectors live in lib/project-scan.js
// (setup-sdlc R14), shared with skill/setup.js --scan.

// ---------------------------------------------------------------------------
// Proposal catalog
// ---------------------------------------------------------------------------

/**
 * Build proposals from detected signals.
 * @param {object} signals
 * @param {string} target  'plan' or 'execute'
 * @returns {Array<{id, description, severity, category, evidence}>}
 */
function buildProposals(signals, target) {
  const isPlan = (target || 'plan') === 'plan';
  const proposals = [];
  const dirs = signals.directories;

  const repoPath = dirs.repositories;
  const repoLabel = repoPath
    ? `the repository layer (${repoPath})`
    : 'the repository layer';

  if (signals.hasDatabase && repoPath) {
    proposals.push({
      id: 'no-direct-db-access',
      description: isPlan
        ? `Plans must route all database operations through ${repoLabel}. No direct SQL or ORM calls in controllers/handlers.`
        : `Code changes must not introduce direct database queries outside ${repoLabel}.`,
      severity: 'error',
      category: 'architecture',
      evidence: `Detected ${signals.dbType || 'database'} with repositories/ directory at "${repoPath}".`,
    });
  }

  if (signals.hasApi) {
    proposals.push({
      id: 'api-backward-compatibility',
      description: isPlan
        ? 'Plans must version or deprecate changed APIs. Breaking changes must be documented in Key Decisions.'
        : 'API changes must maintain backward compatibility — no breaking changes to existing endpoints or contracts without versioning.',
      severity: 'error',
      category: 'architecture',
      evidence: `Detected API (format: ${signals.apiFormat || 'unknown'}).`,
    });
  }

  if (signals.hasTests) {
    proposals.push({
      id: 'test-coverage-required',
      description: isPlan
        ? 'Every task that creates or modifies source code must include corresponding test cases.'
        : 'Code changes must include corresponding test coverage — verify tests exist and pass after each wave.',
      severity: 'error',
      category: 'testing',
      evidence: `Detected test infrastructure${signals.testFramework ? ` (${signals.testFramework})` : ''}.`,
    });
  }

  if (signals.hasDatabase) {
    proposals.push({
      id: 'database-migration-review',
      description: isPlan
        ? 'Tasks modifying database schema must be flagged as High risk.'
        : 'Database migration files must be reviewed — schema changes are flagged for manual verification.',
      severity: 'warning',
      category: 'architecture',
      evidence: `Detected ${signals.dbType || 'database'} integration.`,
    });
  }

  if (signals.hasCi) {
    proposals.push({
      id: 'no-ci-bypass',
      description: isPlan
        ? 'Plans must not include steps that skip or disable CI checks.'
        : 'Implemented code must not disable, skip, or weaken CI checks, linters, or pre-commit hooks.',
      severity: 'error',
      category: 'security',
      evidence: `Detected CI platform: ${signals.ciPlatform}.`,
    });
  }

  if (signals.hasMonorepo) {
    proposals.push({
      id: 'monorepo-boundary-respect',
      description: isPlan
        ? 'Tasks must not create cross-package dependencies without explicit justification.'
        : 'Code changes must respect monorepo package boundaries — no cross-package imports outside declared dependencies.',
      severity: 'warning',
      category: 'architecture',
      evidence: 'Detected monorepo configuration (lerna.json / pnpm-workspace.yaml / nx.json).',
    });
  }

  if (signals.hasOpenSpec) {
    proposals.push({
      id: 'spec-compliance',
      description: isPlan
        ? 'Changes must reference an OpenSpec change for traceability.'
        : 'Implementation must comply with OpenSpec delta spec requirements when available.',
      severity: 'warning',
      category: 'architecture',
      evidence: 'Detected openspec/config.yaml.',
    });
  }

  // Always-on guardrails
  proposals.push({
    id: 'no-scope-creep',
    description: isPlan
      ? 'Tasks must only address stated requirements; no gold-plating.'
      : 'Implementation must stay within the task\'s stated scope — no additional features, refactoring, or cleanup beyond what was specified.',
    severity: 'warning',
    category: 'scope',
    evidence: 'Universal guardrail — always applicable.',
  });

  proposals.push({
    id: 'single-responsibility-tasks',
    description: isPlan
      ? 'Each task must have exactly one clear deliverable.'
      : 'Each implemented change must address exactly one concern — no bundled fixes or unrelated modifications.',
    severity: 'warning',
    category: 'scope',
    evidence: 'Universal guardrail — always applicable.',
  });

  // Engineering principles — universally applicable
  proposals.push({
    id: 'yagni',
    description: isPlan
      ? 'Tasks must not add functionality beyond stated requirements — no speculative abstractions, premature generalization, or unused parameters.'
      : 'Do not add functionality until it is actually needed. No speculative abstractions, premature generalization, or unused parameters.',
    severity: 'warning',
    category: 'scope',
    evidence: 'Universal guardrail — always applicable.',
  });

  proposals.push({
    id: 'dry',
    description: isPlan
      ? 'Tasks must not duplicate logic that exists elsewhere — reuse existing functions or extract shared utilities.'
      : 'Do not duplicate logic. If the same behavior exists elsewhere, reuse it or extract a shared function.',
    severity: 'warning',
    category: 'quality',
    evidence: 'Universal guardrail — always applicable.',
  });

  proposals.push({
    id: 'kiss',
    description: isPlan
      ? 'Tasks must prefer the simplest design that satisfies requirements — avoid unnecessary abstractions and over-engineering.'
      : 'Prefer the simplest implementation that satisfies the requirements. Avoid unnecessary abstractions and over-engineered solutions.',
    severity: 'warning',
    category: 'quality',
    evidence: 'Universal guardrail — always applicable.',
  });

  // Framework-specific guardrails (issue #336)
  // Spec allows shared id with framework-specific description. Svelte and Astro
  // both use the islands pattern but with different runtime semantics, so each
  // framework gets its own description while sharing the proposal id.
  if (signals.frameworks.includes('svelte')) {
    proposals.push({
      id: 'island-only-interactivity',
      description: isPlan
        ? 'Tasks must use Svelte components as interactive islands only — default to static markup and reach for `<script>` blocks only where interactivity is required.'
        : 'Use Svelte components as interactive islands only; default to static markup. Add `<script>` interactivity only where it is required, not by default.',
      severity: 'warning',
      category: 'framework',
      evidence: 'Detected framework(s): svelte.',
    });
  }
  if (signals.frameworks.includes('astro')) {
    proposals.push({
      id: 'island-only-interactivity',
      description: isPlan
        ? 'Tasks must keep Astro components static by default — opt into client hydration (`client:load`, `client:idle`, `client:visible`) only for components that require interactivity.'
        : 'Astro components must be static by default. Use `client:*` directives only for components that genuinely require client-side interactivity; avoid unnecessary hydration.',
      severity: 'warning',
      category: 'framework',
      evidence: 'Detected framework(s): astro.',
    });
  }

  if (signals.dbType === 'prisma') {
    proposals.push({
      id: 'prisma-migration-required',
      description: isPlan
        ? 'Tasks that modify the Prisma schema must include a corresponding `prisma migrate` step. Schema changes without migrations are a blocking issue.'
        : 'Prisma schema changes must be accompanied by a migration file (`prisma migrate dev` or `prisma migrate deploy`). Do not modify schema.prisma without generating a migration.',
      severity: 'error',
      category: 'framework',
      evidence: 'Detected Prisma ORM (prisma/ directory present).',
    });
  }

  // Planning-discipline guardrails — plan target only
  if (isPlan) {
    proposals.push({
      id: 'state-premise',
      description: 'Plan must state the underlying problem in one sentence — in Goal, Architecture, or Key Decisions. Reject plans that transcribe requirements without naming the root problem.',
      severity: 'error',
      category: 'planning-discipline',
      evidence: 'Universal guardrail — always applicable to non-trivial plans.',
    });

    proposals.push({
      id: 'smallest-viable-cut',
      description: 'Plan must identify the smallest version of the work that still delivers value. If the plan covers more than the minimum, each extra task must be justified in Key Decisions.',
      severity: 'warning',
      category: 'planning-discipline',
      evidence: 'Universal guardrail — always applicable to non-trivial plans.',
    });

    proposals.push({
      id: 'failure-audience',
      description: 'Plan must name who or what fails if this implementation ships incorrectly (user, system, team, downstream service). Surfaces the blast radius before decomposition.',
      severity: 'warning',
      category: 'planning-discipline',
      evidence: 'Universal guardrail — always applicable to non-trivial plans.',
    });

    proposals.push({
      id: 'explicit-non-goals',
      description: 'Plan must list what is intentionally NOT being built. Surface adjacent improvements that were considered and excluded so reviewers and executors do not silently re-expand scope.',
      severity: 'warning',
      category: 'planning-discipline',
      evidence: 'Universal guardrail — always applicable to non-trivial plans.',
    });

    proposals.push({
      id: 'ambiguity-stops-and-asks',
      description: 'When two or more codebase patterns are viable for the same requirement with materially different downstream implications, the plan must EITHER record the choice in Key Decisions with rationale, OR the skill must AskUserQuestion before committing. Silent selection between viable patterns is a critique failure.',
      severity: 'error',
      category: 'planning-discipline',
      evidence: 'Universal guardrail — always applicable to non-trivial plans.',
    });
  }

  // Internal invariant: every proposal must carry a non-empty category field.
  // Throw early with the offending id list to surface missing categories at
  // dev time rather than silently emitting malformed output. Placed after ALL
  // proposal pushes (including isPlan-gated ones) so future proposals cannot
  // bypass the check.
  const missingCategory = proposals.filter(p => !p.category);
  if (missingCategory.length > 0) {
    throw new Error(
      `buildProposals: proposals missing category field: ${missingCategory.map(p => p.id).join(', ')}`
    );
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { projectRoot, mode, target } = parseArgs(process.argv);

  const errors = [];
  const warnings = [];

  // 1. Read existing guardrails
  const existingResult = readExisting(projectRoot, target);
  if (existingResult.error) {
    errors.push(existingResult.error);
  }
  const existing = {
    count: existingResult.count,
    guardrails: existingResult.guardrails,
    ids: existingResult.ids,
  };

  // 2. Detect signals
  const signals = createSignals();

  detectLanguagesAndFrameworks(projectRoot, signals);
  detectStructure(projectRoot, signals);
  detectReviewDimensions(projectRoot, signals);
  extractClaudeMdRules(projectRoot, signals);

  // 3. Build proposals
  let proposals = buildProposals(signals, target);

  // 4. In add mode, filter out already-existing ids
  if (mode === 'add' && existing.ids.length > 0) {
    const existingSet = new Set(existing.ids);
    proposals = proposals.filter(p => !existingSet.has(p.id));
  }

  const output = {
    errors,
    warnings,
    existing,
    signals,
    proposals,
  };

  writeOutput(output, 'guardrails-prepare', errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`guardrails-prepare.js error: ${err.message}\n${err.stack}\n`);
    process.exit(2);
  }
}

module.exports = { buildProposals, detectLanguagesAndFrameworks, detectStructure, readExisting };
