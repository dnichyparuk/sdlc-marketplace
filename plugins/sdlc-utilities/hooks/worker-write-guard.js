#!/usr/bin/env node
/**
 * worker-write-guard.js
 * PreToolUse hook (matcher Bash) — implements execute-plan-sdlc R90 (R87).
 *
 * Execute workers change repository files only with the Edit and Write tools.
 * This hook DENIES a Bash command from an execute-worker agent when it writes
 * files through a shell route (sed -i, perl -i, awk -i inplace, tee, redirects
 * and heredocs, python/node one-liners). Scratch targets (/dev/, /tmp/,
 * $TMPDIR) are allowed. Characters inside quoted strings are ignored by the
 * sed/perl/awk/tee/redirect rules, so `grep 'a > b' f` is not denied.
 *
 * Best-effort guard, not a sandbox. Redirects covered: `>`, `>>`, `&>`, `&>>`
 * and fd forms (`2>`, `1>>`); `2>&1` and `>&2` are allowed. A target is
 * normalized (`path.posix.normalize`) before the scratch-prefix test, so
 * `/tmp/../src/a` and `$TMPDIR/../src/a` are denied (tee shares this check).
 *
 * The stdin payload is the only input: no state read, same in branch and
 * worktree mode. Every other path (no stdin, bad JSON, other agent, main
 * session, non-Bash tool) exits 0 silently.
 *
 * Exit codes:
 *   0 = always.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKER_RE = /(^|:)execute-worker(-complex|-batch)?$/;

const ALLOWED_TARGET_RE = /^(\/dev\/|\/tmp\/|\$TMPDIR\/|\$\{TMPDIR\}\/)/;

/** Replace the interior of quoted strings with `_`, keeping length and quote marks. */
function maskQuotes(cmd) {
  let out = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (quote === '"' && ch === '\\' && i + 1 < cmd.length) {
        out += '__';
        i++;
      } else if (ch === quote) {
        quote = null;
        out += ch;
      } else {
        out += '_';
      }
    } else {
      if (ch === '"' || ch === "'") quote = ch;
      out += ch;
    }
  }
  return out;
}

function isAllowedTarget(target) {
  const unquoted = target.replace(/^["']/, '').replace(/["']$/, '');
  return ALLOWED_TARGET_RE.test(path.posix.normalize(unquoted));
}

function redirectDenied(cmd, masked) {
  // Also catches `&>`, `&>>`, and fd redirects such as `2>` and `1>>`; `2>&1` and `>&2` (fd duplication, `>&N` or `>&-`) stay allowed; `>&file` is checked like `&>file`.
  const re = /(^|[^>&0-9])(?:&|[0-9]+)?>>?(?!&(?:[0-9]+|-)(?:[\s;&|)]|$))&?[ \t]*(\S*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const end = m.index + m[0].length;
    const start = end - m[2].length;
    if (!isAllowedTarget(cmd.slice(start, end))) return true;
  }
  return false;
}

function teeDenied(cmd, masked) {
  // `tee` counts only in command position, so `grep -n tee f` is not denied.
  const re = /(^|[|;&(])[ \t]*tee\b([^|;&\n]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const argsEnd = m.index + m[0].length;
    const argsStart = argsEnd - m[2].length;
    const args = cmd.slice(argsStart, argsEnd).split(/\s+/).filter((a) => a && !a.startsWith('-'));
    if (args.some((a) => !isAllowedTarget(a))) return true;
  }
  return false;
}

/** Argument words of a command-position match, sliced from the original (unmasked) command. */
function matchArgs(cmd, m, groupIndex) {
  const argsEnd = m.index + m[0].length;
  return cmd.slice(argsEnd - m[groupIndex].length, argsEnd).split(/\s+/).filter(Boolean);
}

function ddDenied(cmd, masked) {
  const re = /(^|[|;&(\n])[ \t]*dd\b([^|;&\n]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const outs = matchArgs(cmd, m, 2).filter((a) => a.startsWith('of='));
    if (outs.some((a) => !isAllowedTarget(a.slice(3)))) return true;
  }
  return false;
}

function gitApplyDenied(cmd, masked) {
  const re = /(^|[|;&(\n])[ \t]*git\b[^|;&\n]*\sapply\b([^|;&\n]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const args = matchArgs(cmd, m, 2);
    const writes = args.some((a) => ['--apply', '--index', '--cached', '--3way', '-3'].includes(a));
    const readOnly = args.some((a) => ['--check', '--stat', '--numstat', '--summary'].includes(a));
    if (writes || !readOnly) return true;
  }
  return false;
}

function patchDenied(cmd, masked) {
  const re = /(^|[|;&(\n])[ \t]*patch\b([^|;&\n]*)/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const args = matchArgs(cmd, m, 2);
    if (args.includes('--dry-run')) continue;
    const outputs = [];
    args.forEach((a, i) => {
      if (a === '-o') outputs.push(args[i + 1] || '');
      else if (a.startsWith('--output=')) outputs.push(a.slice(9));
      else if (a.startsWith('-o') && !a.startsWith('--')) outputs.push(a.slice(2));
    });
    if (!(outputs.length > 0 && outputs.every((t) => t && isAllowedTarget(t)))) return true;
  }
  return false;
}

/** @returns {{ deny: boolean, rule: string|null }} first matching rule, else not denied. */
function classifyCommand(cmd) {
  const command = typeof cmd === 'string' ? cmd : '';
  const masked = maskQuotes(command);
  const rules = [
    ['sed-in-place', () => /(^|[\s|;&(])sed\b[^|;&\n]*\s(-[A-Za-z]*i|--in-place)/.test(masked)],
    // -i after only no-argument switch letters (so `perl -Mstrict -e 1` is not denied).
    ['perl-in-place', () => /(^|[\s|;&(])perl\b[^|;&\n]*\s-[nplasw0-9]*i/.test(masked)],
    ['awk-in-place', () => /(^|[\s|;&(])g?awk\b[^|;&\n]*\s-i\s*inplace/.test(masked)],
    ['tee', () => teeDenied(command, masked)],
    ['redirect', () => redirectDenied(command, masked)],
    ['python-write', () => /\bpython[0-9.]*\b[^|;&\n]*(\s-c\b|\s-(?=\s|$)|<<)/.test(masked) && /open\(|write_text/.test(command)],
    ['node-write', () => /\bnode\b[^|;&\n]*\s(-e|--eval)\b/.test(masked) && /writeFileSync|appendFileSync/.test(command)],
    ['dd-write', () => ddDenied(command, masked)],
    ['git-apply', () => gitApplyDenied(command, masked)],
    ['patch', () => patchDenied(command, masked)],
  ];
  for (const [name, test] of rules) {
    if (test()) return { deny: true, rule: name };
  }
  return { deny: false, rule: null };
}

function main() {
  let payload;
  try {
    const raw = fs.readFileSync(0, 'utf8');
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    process.exit(0);
  }
  if (!payload || typeof payload !== 'object') process.exit(0);
  if (typeof payload.agent_type !== 'string' || !WORKER_RE.test(payload.agent_type)) process.exit(0);
  if (payload.tool_name !== 'Bash') process.exit(0);
  let out = null;
  try {
    const command = payload.tool_input && payload.tool_input.command;
    const verdict = classifyCommand(command);
    if (verdict.deny) {
      out = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            `execute-plan-sdlc R87/R90: workers change repository files only with the Edit and Write tools. Blocked rule: ${verdict.rule}. Use Edit or Write instead.`,
        },
      });
    }
  } catch {
    out = null; // R90: any failure exits 0 with no output
  }
  if (out) console.log(out);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { classifyCommand, WORKER_RE };
