#!/usr/bin/env node
/**
 * wave-overflow-test.js
 * Test harness for wave-runner context-overflow hardening modules (#432).
 *
 * Usage:
 *   node wave-overflow-test.js --op <operation> [options]
 *
 * Operations:
 *   factsheet-path        -- verify taskFactSheetPath is deterministic
 *   budget-tight          -- computeWaveBudget with tight byte budget
 *   budget-uncapped       -- computeWaveBudget with 3-task wave (no static cap)
 *   budget-model-limits   -- MODEL_MAX_INPUT_BYTES per-model ceilings
 *   budget-config-override -- dispatchBudget config lowers maxConcurrentTasks
 *   summarize-files       -- summarizePriorWaveContext caps filesAdded
 *   summarize-decisions   -- summarizePriorWaveContext caps decisionsFromPriorWaves
 *   render-notes          -- renderFactSheet: present description → `## Notes (rationale)`, absent → omitted
 *   parse-complete        -- parseWaveSummary for a complete wave
 *   parse-overflow        -- parseWaveSummary: 4 dispatched, 2 returned → CONTEXT_OVERFLOW
 *   parse-free-text-error -- parseWaveSummary: free-text errorCode rejected
 *   parse-malformed       -- parseWaveSummary: malformed JSON
 *   parse-extra-ids       -- parseWaveSummary: extra IDs not in dispatched set
 *   split-4task           -- splitWave: 4-task → 2+2
 *   split-all-missing     -- splitWave: all-missing uses full dispatched set
 *   split-depth-ceiling   -- splitWave: depth ≥ maxSplitDepth throws
 *   split-idempotent      -- splitWave: same inputs → same partition
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

// Resolve plugin lib paths from this test script's location
const REPO_ROOT = path.resolve(__dirname, '../../..');
const LIB = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/lib');
const STATE_DIR = path.join(REPO_ROOT, 'plugins/sdlc-utilities/scripts/state');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      result[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = args[++i];
    } else if (args[i].startsWith('--')) {
      result[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
    }
  }
  return result;
}

const opts = parseArgs(process.argv);
const op = opts.op;

if (!op) {
  process.stderr.write('Error: --op is required\n');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function out(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

switch (op) {
  case 'factsheet-path': {
    const { taskFactSheetPath } = require(path.join(LIB, 'task-factsheet'));
    // R-IDNORM: T3 and 3 must resolve to the same file path
    const p1 = taskFactSheetPath({ runId: 'run-001', taskId: 'T3', stateDir: '/tmp/sdlc' });
    const p2 = taskFactSheetPath({ runId: 'run-001', taskId: 'T3', stateDir: '/tmp/sdlc' });
    const p3 = taskFactSheetPath({ runId: 'run-001', taskId: '3', stateDir: '/tmp/sdlc' });
    out({ same: p1 === p2, path: p1, containsTaskId: p1.includes('task-3'), idNormSame: p1 === p3 });
    break;
  }

  case 'render-contract': {
    const { renderFactSheet } = require(path.join(LIB, 'task-factsheet'));
    // R-CONTRACT (#459): a contract-bearing task renders a `## Contract` section;
    // a no-contract task omits it entirely.
    const withContract = renderFactSheet({
      id: '1',
      name: 'Contract-bearing task',
      description: 'Implement the thing.',
      acceptanceCriteria: ['It works'],
      files: ['src/thing.ts'],
      contract: '- shape (code): `doThing(x: number): string`\n- names: `doThing`',
    });
    const withoutContract = renderFactSheet({
      id: '2',
      name: 'No-contract task',
      description: 'Implement another thing.',
      acceptanceCriteria: ['It also works'],
      files: ['src/other.ts'],
    });
    out({
      hasContractSection: withContract.includes('## Contract'),
      contractBeforeAcceptance:
        withContract.indexOf('## Contract') < withContract.indexOf('## Acceptance Criteria'),
      noContractSection: !withoutContract.includes('## Contract'),
    });
    break;
  }

  case 'render-notes': {
    const { renderFactSheet } = require(path.join(LIB, 'task-factsheet'));
    // Notes (rationale): a task whose `description` field is set renders a
    // `## Notes (rationale)` section; an absent/empty description omits it.
    const withNotes = renderFactSheet({
      id: '1',
      name: 'Notes-bearing task',
      description: 'Cross-skill compatibility rationale.',
      acceptanceCriteria: ['It works'],
      files: ['src/thing.ts'],
    });
    const withoutNotes = renderFactSheet({
      id: '2',
      name: 'No-notes task',
      description: '',
      acceptanceCriteria: ['It also works'],
      files: ['src/other.ts'],
    });
    const withAbsentDescription = renderFactSheet({
      id: '3',
      name: 'Omitted-desc task',
      acceptanceCriteria: ['x'],
      files: ['src/y.ts'],
    });
    out({
      hasNotesSection: withNotes.includes('## Notes (rationale)'),
      noNotesSection: !withoutNotes.includes('## Notes (rationale)'),
      absentDescNoNotesSection: !withAbsentDescription.includes('## Notes (rationale)'),
    });
    break;
  }

  case 'budget-tight': {
    const { computeWaveBudget } = require(path.join(LIB, 'dispatch-budget'));
    // 25KB total, 5KB template overhead, 4 tasks × 5KB each → only 4 fit in (25-5)=20KB, 4×5=20 exactly
    // Use 4 tasks × 6KB with 25KB budget → 3 fit: 3×6=18KB ≤ 20KB; 4×6=24KB > 20KB
    const r = computeWaveBudget({
      templateBytes: 5000,
      guardrailsBytes: 0,
      perTaskFactSheetBytes: [6000, 6000, 6000, 6000],
      priorWaveContextBytes: 0,
      model: 'sonnet',
      modelMaxInputBytes: 25000,
      totalRemainingTasks: 4,
    });
    out({ maxConcurrentTasks: r.maxConcurrentTasks, lessThanCap: r.maxConcurrentTasks < 4 });
    break;
  }

  case 'budget-model-limits': {
    const { MODEL_MAX_INPUT_BYTES } = require(path.join(LIB, 'dispatch-budget'));
    out({
      haiku: MODEL_MAX_INPUT_BYTES.haiku,
      sonnet: MODEL_MAX_INPUT_BYTES.sonnet,
      opus: MODEL_MAX_INPUT_BYTES.opus,
      ok: MODEL_MAX_INPUT_BYTES.haiku === 300000
        && MODEL_MAX_INPUT_BYTES.sonnet === 3000000
        && MODEL_MAX_INPUT_BYTES.opus === 3000000,
    });
    break;
  }

  case 'budget-config-override': {
    const { computeWaveBudget } = require(path.join(LIB, 'dispatch-budget'));
    const base = {
      templateBytes: 5000,
      guardrailsBytes: 0,
      perTaskFactSheetBytes: [10000, 10000, 10000],
      priorWaveContextBytes: 0,
      model: 'sonnet',
      totalRemainingTasks: 3,
    };
    const without = computeWaveBudget(base);
    const withOverride = computeWaveBudget({ ...base, dispatchBudget: { sonnet: 10000 } });
    out({
      without: without.maxConcurrentTasks,
      withOverride: withOverride.maxConcurrentTasks,
      lower: withOverride.maxConcurrentTasks < without.maxConcurrentTasks,
    });
    break;
  }

  case 'budget-uncapped': {
    const { computeWaveBudget } = require(path.join(LIB, 'dispatch-budget'));
    const r = computeWaveBudget({
      templateBytes: 1000,
      guardrailsBytes: 0,
      perTaskFactSheetBytes: [5000, 5000, 5000],
      priorWaveContextBytes: 0,
      model: 'sonnet',
      modelMaxInputBytes: 600000,
      totalRemainingTasks: 3,
    });
    out({ maxConcurrentTasks: r.maxConcurrentTasks });
    break;
  }

  case 'summarize-files': {
    const { summarizePriorWaveContext } = require(path.join(LIB, 'state'));
    const state = {
      context: {
        planSummary: 'Test',
        completedTaskIds: ['T1'],
        filesAdded: Array.from({ length: 30 }, (_, i) => `src/file-${i}.js`),
        filesModified: [],
        interfacesCreated: [],
        decisionsFromPriorWaves: [],
      },
    };
    const r = summarizePriorWaveContext(state, { maxFiles: 20 });
    out({ count: r.filesAdded.length, last: r.filesAdded[r.filesAdded.length - 1] });
    break;
  }

  case 'summarize-decisions': {
    const { summarizePriorWaveContext } = require(path.join(LIB, 'state'));
    const state = {
      context: {
        planSummary: 'Test',
        completedTaskIds: [],
        filesAdded: [],
        filesModified: [],
        interfacesCreated: [],
        decisionsFromPriorWaves: Array.from({ length: 25 }, (_, i) => `decision-${i}`),
      },
    };
    const r = summarizePriorWaveContext(state, { maxDecisions: 10 });
    out({ count: r.decisionsFromPriorWaves.length, last: r.decisionsFromPriorWaves[9] });
    break;
  }

  case 'parse-complete': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"completed","tasks":[{"id":"T1","status":"DONE","sha":null,"filesTouched":["src/a.js"]},{"id":"T2","status":"DONE","sha":null,"filesTouched":["src/b.js"]}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['T1', 'T2']);
    out({ schemaOk: r.schemaOk, missingIds: r.missingIds, extraIds: r.extraIds });
    break;
  }

  case 'parse-overflow': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    // 4 dispatched, only T1+T2 returned → T3+T4 missing → CONTEXT_OVERFLOW
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"partial","tasks":[{"id":"T1","status":"DONE","sha":null,"filesTouched":["src/a.js"]},{"id":"T2","status":"DONE","sha":null,"filesTouched":["src/b.js"]}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['T1', 'T2', 'T3', 'T4']);
    out({ schemaOk: r.schemaOk, missingIds: r.missingIds, isOverflow: r.missingIds.length > 0 });
    break;
  }

  case 'parse-free-text-error': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"partial","tasks":[{"id":"T1","status":"FAILED","sha":null,"filesTouched":[],"errorCode":"some arbitrary error message"}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['T1']);
    out({ schemaOk: r.schemaOk, hasEnumViolation: r.violations.some(v => v.includes('not in bounded enum')) });
    break;
  }

  case 'parse-malformed': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    const text = 'WAVE_SUMMARY: {broken json here...';
    const r = parseWaveSummary(text, ['T1']);
    out({ schemaOk: r.schemaOk, tokenFound: r.tokenFound });
    break;
  }

  case 'parse-extra-ids': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"completed","tasks":[{"id":"T1","status":"DONE","sha":null,"filesTouched":[]},{"id":"T_EXTRA","status":"DONE","sha":null,"filesTouched":[]}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['T1']);
    out({ schemaOk: r.schemaOk, extraIds: r.extraIds });
    break;
  }

  case 'split-4task': {
    const { splitWave } = require(path.join(LIB, 'wave-split'));
    const r = splitWave({ dispatched: ['T1', 'T2', 'T3', 'T4'], missingIds: ['T3', 'T4'], splitDepth: 0 });
    const total = r.halves[0].tasks.length + r.halves[1].tasks.length;
    out({ total, half0: r.halves[0].tasks.length, half1: r.halves[1].tasks.length, depth: r.halves[0].depth });
    break;
  }

  case 'split-all-missing': {
    const { splitWave } = require(path.join(LIB, 'wave-split'));
    // All 4 dispatched, all 4 missing → must split ALL dispatched (not just missing)
    const r = splitWave({ dispatched: ['T1', 'T2', 'T3', 'T4'], missingIds: ['T1', 'T2', 'T3', 'T4'], splitDepth: 1 });
    const total = r.halves[0].tasks.length + r.halves[1].tasks.length;
    out({ total, depth: r.halves[0].depth });
    break;
  }

  case 'split-depth-ceiling': {
    const { splitWave, MaxSplitDepthExceededError } = require(path.join(LIB, 'wave-split'));
    let threw = false;
    let errorName = '';
    try {
      splitWave({ dispatched: ['T1', 'T2'], splitDepth: 3, maxSplitDepth: 3 });
    } catch (e) {
      threw = true;
      errorName = e.name;
    }
    out({ threw, errorName });
    break;
  }

  case 'split-idempotent': {
    const { splitWave } = require(path.join(LIB, 'wave-split'));
    const r1 = splitWave({ dispatched: ['T4', 'T2', 'T3', 'T1'], splitDepth: 0 });
    const r2 = splitWave({ dispatched: ['T4', 'T2', 'T3', 'T1'], splitDepth: 0 });
    const same = JSON.stringify(r1.halves) === JSON.stringify(r2.halves);
    out({ same });
    break;
  }

  // R-IDNORM: mixed T-prefixed and numeric IDs are treated as equal after normalization
  case 'parse-idnorm-mixed': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    // Dispatched: numeric ["1","2","3"]; returned: mixed ["T1","t2","3"] → all accounted
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"completed","tasks":[{"id":"T1","status":"DONE","sha":null,"filesTouched":["src/a.js"]},{"id":"t2","status":"DONE","sha":null,"filesTouched":["src/b.js"]},{"id":"3","status":"DONE","sha":null,"filesTouched":["src/c.js"]}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['1', '2', '3']);
    out({ schemaOk: r.schemaOk, missingIds: r.missingIds, extraIds: r.extraIds, allAccounted: r.missingIds.length === 0 });
    break;
  }

  // R-IDNORM: stale field 'filesChanged' is rejected by bounded schema (filesTouched is canonical)
  case 'parse-stale-fileschanged': {
    const { parseWaveSummary } = require(path.join(LIB, 'wave-summary'));
    const text = 'WAVE_SUMMARY: {"wave":1,"status":"completed","tasks":[{"id":"1","status":"DONE","sha":null,"filesTouched":["src/a.js"],"filesChanged":["src/a.js"]}],"escalationsUsed":0}';
    const r = parseWaveSummary(text, ['1']);
    // filesChanged is a dropped field — should produce a schema violation
    out({ schemaOk: r.schemaOk, hasDroppedFieldViolation: r.violations.some(v => v.includes('"filesChanged"')) });
    break;
  }

  // R-IDNORM: normalizeTaskId exported correctly from wave-summary
  case 'normalize-task-id': {
    const { normalizeTaskId } = require(path.join(LIB, 'wave-summary'));
    out({
      t1: normalizeTaskId('T1'),
      t2: normalizeTaskId('t2'),
      n3: normalizeTaskId('3'),
      tUpper: normalizeTaskId('T10'),
      tLower: normalizeTaskId('t10'),
      noPrefix: normalizeTaskId('abc'),
    });
    break;
  }

  default: {
    process.stderr.write(`Error: unknown op "${op}"\n`);
    process.exit(2);
  }
}
