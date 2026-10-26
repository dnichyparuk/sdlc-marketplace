#!/usr/bin/env node
'use strict';

// Exec check (ruling w2-plan Q1, ruling w2-planreview Q3): the routing table in
// classifying-and-waving-tasks.md equals skill/execute.js WORKER_ROUTING; routeWave re-derives each
// row from that table, so a re-derivation from the doc table (a Step 2 raise or a Step 3 move) gives
// what the script gives; and AGENT_MODELS equals each worker agent's frontmatter model.

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const P = path.join(REPO_ROOT, 'plugins/sdlc-utilities');
let WORKER_ROUTING, AGENT_MODELS, routeWave, mdText;
try {
  ({ WORKER_ROUTING, AGENT_MODELS, routeWave } = require(path.join(P, 'scripts/skill/execute.js')));
  mdText = fs.readFileSync(path.join(P, 'skills/execute-plan-sdlc/classifying-and-waving-tasks.md'), 'utf8');
} catch (err) {
  // Exit 2 is a script error; exit 1 is reserved for table mismatches (as in check-dispatch-resilience-sentinel.js).
  process.stderr.write(`check-worker-routing-table: ${err.message}\n`);
  process.exit(2);
}

const ROWS = { 'Trivial (single, in-wave)': 'Trivial', 'Trivial (2+ batched)': 'TrivialBatched', Standard: 'Standard', Complex: 'Complex' };
const TIERS = ['full', 'balanced', 'minimal'];
const mismatches = [];

const md = mdText.split('\n');
const start = md.indexOf('## Worker routing (agent × effort)');
if (start < 0) mismatches.push('heading "## Worker routing (agent × effort)" not found');
const seen = new Set();
for (const line of start < 0 ? [] : md.slice(start + 1)) {
  if (line.startsWith('## ')) break;
  const cells = line.split('|').slice(1, -1).map(c => c.trim());
  const row = ROWS[cells[0]];
  if (!row) continue;
  seen.add(row);
  TIERS.forEach((tier, i) => {
    const code = (WORKER_ROUTING[tier]?.[row] || ['missing']).join(' / ');
    if (cells[i + 1] !== code) mismatches.push(`${tier}/${row}: doc "${cells[i + 1]}" vs WORKER_ROUTING "${code}"`);
  });
}
for (const row of Object.values(ROWS)) if (!seen.has(row)) mismatches.push(`row ${row} missing from the doc table`);

// One single-task wave per tier and complexity, plus one two-Trivial batch wave per tier.
let routeChecks = 0;
for (const tier of TIERS) {
  for (const complexity of ['Trivial', 'Standard', 'Complex']) {
    const [e] = routeWave([{ id: 1, complexity }], tier);
    const want = WORKER_ROUTING[tier][complexity];
    routeChecks++;
    if (e.agent !== `sdlc:${want[0]}` || e.effort !== want[1] || e.model !== AGENT_MODELS[want[0]]) mismatches.push(`routeWave ${tier}/${complexity}: ${e.agent}/${e.effort}`);
  }
  const batch = routeWave([{ id: 1, complexity: 'Trivial' }, { id: 2, complexity: 'Trivial' }], tier);
  const want = WORKER_ROUTING[tier].TrivialBatched;
  routeChecks++;
  if (batch.length !== 1 || batch[0].agent !== `sdlc:${want[0]}` || batch[0].effort !== want[1] || batch[0].taskIds.join() !== '1,2') mismatches.push(`routeWave ${tier}/TrivialBatched`);
}

for (const [agent, model] of Object.entries(AGENT_MODELS)) {
  const file = path.join(P, 'agents', `${agent}.md`);
  const m = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').match(/^model:\s*(\S+)/m) : null;
  if (!m || m[1] !== model) mismatches.push(`${agent}: frontmatter model ${m ? m[1] : 'missing'} vs AGENT_MODELS ${model}`);
}

process.stdout.write(JSON.stringify({ ok: mismatches.length === 0, rows: seen.size, routeChecks, mismatches }) + '\n');
process.exit(mismatches.length ? 1 : 0);
