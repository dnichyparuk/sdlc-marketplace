#!/usr/bin/env node
/**
 * subagent-track.js
 * SubagentStart / SubagentStop hook (no matcher) — implements ship-sdlc R110.
 *
 * Usage: node subagent-track.js <start|stop>
 *
 * Keeps `<stateDir>/.step-agent-live-<branchSlug>.json` listing the ship step
 * agents that are running:
 *   { "schemaVersion": 1, "branch": "<branch>",
 *     "agents": { "<agent_id>": { "agentType": "<agent_type>", "startedAt": "<ISO>" } } }
 *
 * `start` adds `agents[agent_id]`; `stop` removes it and deletes the file when
 * no agent is left. Only an `agent_type` matching `ship-step-*` (with or without
 * a plugin prefix) and a string `agent_id` are tracked; every other event is
 * ignored. stop-pipeline-continue.js reads the marker and stays quiet while a
 * fresh entry exists and the current step is `in_progress`.
 *
 * The marker is dot-prefixed, so no state glob or `parseStateFilename` matches it.
 * This hook never blocks, never prints, never throws, and always exits 0.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const STEP_AGENT_TYPE = /(^|:)ship-step-[a-z-]+$/;

function main() {
  const mode = process.argv[2];
  if (mode !== 'start' && mode !== 'stop') return;

  let payload;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return;
  }
  if (!payload || typeof payload !== 'object') return;

  const agentId = payload.agent_id;
  const agentType = payload.agent_type;
  if (typeof agentId !== 'string' || !agentId) return;
  if (typeof agentType !== 'string' || !STEP_AGENT_TYPE.test(agentType)) return;

  const { resolveHookContext } = require('../scripts/lib/state');
  const { stateDir, branch, branchSlug } = resolveHookContext(payload);
  if (!stateDir || !branchSlug || !fs.existsSync(stateDir)) return;

  const markerPath = path.join(stateDir, `.step-agent-live-${branchSlug}.json`);

  let marker = null;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch { /* absent or corrupt — start fresh */ }
  if (!marker || typeof marker !== 'object' || !marker.agents || typeof marker.agents !== 'object') {
    marker = { schemaVersion: 1, branch, agents: {} };
  }

  if (mode === 'start') {
    marker.agents[agentId] = { agentType, startedAt: new Date().toISOString() };
  } else {
    delete marker.agents[agentId];
    if (Object.keys(marker.agents).length === 0) {
      try { fs.unlinkSync(markerPath); } catch { /* absent is fine */ }
      return;
    }
  }

  // Atomic write: tmp sibling, then rename.
  const tmp = `${markerPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(marker, null, 2), 'utf8');
    fs.renameSync(tmp, markerPath);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* nothing to remove */ }
  }
}

try { main(); } catch { /* never throw */ }
process.exit(0);
