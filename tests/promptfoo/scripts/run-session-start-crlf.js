#!/usr/bin/env node
/**
 * run-session-start-crlf.js
 * Builds a temp plugin tree whose SKILL.md is CRLF with `user-invocable: true`
 * and runs the temp copy of hooks/session-start.js. hooks/ and scripts/ are
 * copied (not symlinked): Node resolves symlinks, so __dirname would escape
 * the temp tree.
 *
 * Output: the hook's stdout.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const realPlugin = path.join(repoRoot, 'plugins', 'sdlc-utilities');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-crlf-'));
let out = '';
try {
  const plugin = path.join(tmp, 'plugin');
  fs.cpSync(path.join(realPlugin, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  fs.cpSync(path.join(realPlugin, 'scripts'), path.join(plugin, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(plugin, 'skills', 'x'), { recursive: true });
  fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), '{\r\n  "name": "sdlc",\r\n  "version": "0.0.0"\r\n}\r\n');
  fs.writeFileSync(
    path.join(plugin, 'skills', 'x', 'SKILL.md'),
    '---\r\nname: x\r\ndescription: test skill\r\nuser-invocable: true\r\n---\r\n\r\n# x\r\n'
  );
  const project = path.join(tmp, 'project');
  fs.mkdirSync(project, { recursive: true });
  const r = spawnSync('node', [path.join(plugin, 'hooks', 'session-start.js')], {
    cwd: project,
    encoding: 'utf8',
    input: '{}',
  });
  out = (r.stdout || '') + (r.stderr || '');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.stdout.write(out);
