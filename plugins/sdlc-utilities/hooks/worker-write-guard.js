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

/**
 * Replace the interior of quoted strings with `_`, keeping length and quote marks.
 * A command substitution inside double quotes (`$(...)` or backticks) is code the shell
 * runs, so it stays unmasked (its own quotes are masked as usual); single-quoted text
 * is always masked.
 */
function maskQuotes(cmd) {
  let out = '';
  const stack = []; // open contexts: {t:'"'} {t:"'"} {t:'$(', depth} {t:'`'}
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const top = stack[stack.length - 1];
    if (!top || top.t === '$(' || top.t === '`') {
      if (top && top.t === '$(') {
        if (ch === '(') top.depth++;
        else if (ch === ')') {
          if (top.depth === 0) {
            stack.pop();
            out += ch;
            continue;
          }
          top.depth--;
        }
      } else if (top && ch === '`') {
        stack.pop();
        out += ch;
        continue;
      }
      if (ch === '\\' && i + 1 < cmd.length) {
        // An escaped char outside quotes is literal: `\'` or `\"` opens no quote context.
        out += '__';
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") stack.push({ t: ch });
      out += ch;
    } else if (top.t === "'") {
      if (ch === "'") {
        stack.pop();
        out += ch;
      } else {
        out += '_';
      }
    } else if (ch === '\\' && i + 1 < cmd.length) {
      out += '__';
      i++;
    } else if (ch === '"') {
      stack.pop();
      out += ch;
    } else if (ch === '$' && cmd[i + 1] === '(') {
      out += '$(';
      i++;
      stack.push({ t: '$(', depth: 0 });
    } else if (ch === '`') {
      out += ch;
      stack.push({ t: '`' });
    } else {
      out += '_';
    }
  }
  return out;
}

/**
 * One command-position scanner shared by the tee, dd, git-apply and patch rules, so they
 * cannot drift (R90). It is code, not one backtracking regex: the work per start position
 * is bounded by MAX_PREFIX_TOKENS, so it is linear in the command length. A command starts
 * at the line start, after `| ; &`, `(`, `{`, a backtick or a newline, after `then`/`do`/`else`,
 * after leading `VAR=val` words, and after wrapper words (`env`, `sudo`, `exec`, `command`,
 * `nohup`, `time`, `xargs`, `timeout`, `nice`, `stdbuf`, `setsid`, `ionice`) with their own
 * options, option arguments, `VAR=val` words and numbers. The command name may carry a path
 * (`/usr/bin/tee`). A wrapper chain of MAX_PREFIX_TOKENS words or more is denied (fail closed). Known gaps (best-effort guard): a quoted command name (`"tee" f`),
 * `bash -c "..."` and other interpreters.
 */
const WRAPPER_WORDS = new Set(['env', 'sudo', 'exec', 'command', 'nohup', 'time', 'xargs', 'timeout', 'nice', 'stdbuf', 'setsid', 'ionice']);
const MAX_PREFIX_TOKENS = 256;

function baseName(word) {
  return word.slice(word.lastIndexOf('/') + 1);
}

/** Scan the tokens at `pos` (inside a segment ending at `end`); return the offset after the command word, or -1. */
function scanPrefix(masked, pos, end, name) {
  const re = /\S{1,256}/g; // bounded token, so many start positions in one long word stay linear
  re.lastIndex = pos;
  let inWrapper = false;
  let afterOption = false;
  for (let n = 0; n < MAX_PREFIX_TOKENS; n++) {
    const t = re.exec(masked);
    if (!t || t.index >= end) return -1;
    if (n === MAX_PREFIX_TOKENS - 1 && inWrapper) return -2; // chain too long to scan: fail closed
    const w = t[0];
    if (n === 0 && (w === 'then' || w === 'do' || w === 'else')) continue;
    if (baseName(w) === name) return t.index + w.length;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      afterOption = false;
    } else if (WRAPPER_WORDS.has(baseName(w))) {
      inWrapper = true;
      afterOption = false;
    } else if (inWrapper && w[0] === '-') {
      afterOption = true;
    } else if (inWrapper && (w === '{}' || /^[0-9]+[smhd]?$/.test(w))) {
      afterOption = false;
    } else if (inWrapper && afterOption) {
      afterOption = false; // the option's own argument
    } else {
      return -1;
    }
  }
  return -1;
}

/** Every command-position use of `name` in the masked command: [{ s, e }] = the argument text range. */
function findCommands(masked, name) {
  const found = [];
  const segRe = /[^|;&\n]+/g;
  let seg;
  while ((seg = segRe.exec(masked)) !== null) {
    const a = seg.index;
    const b = a + seg[0].length;
    const startRe = /(?:[(`{]|^)[ \t]*/g;
    let st;
    while ((st = startRe.exec(seg[0])) !== null) {
      if (st[0] === '') startRe.lastIndex++;
      const s = scanPrefix(masked, a + st.index + st[0].length, b, name);
      if (s >= 0) found.push({ s, e: b });
      else if (s === -2) found.push({ overflow: true });
    }
  }
  return found;
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
  for (const { s, e, overflow } of findCommands(masked, 'tee')) {
    if (overflow) return true;
    const args = cmd.slice(s, e).split(/\s+/).filter((a) => a && !a.startsWith('-'));
    if (args.some((a) => !isAllowedTarget(a))) return true;
  }
  return false;
}

function ddDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'dd')) {
    if (overflow) return true;
    const outs = cmd.slice(s, e).split(/\s+/).filter(Boolean).map((a) => a.replace(/^["']/, '')).filter((a) => a.startsWith('of='));
    if (outs.some((a) => !isAllowedTarget(a.slice(3)))) return true;
  }
  return false;
}

function gitApplyDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'git')) {
    if (overflow) return true;
    const maskedWords = masked.slice(s, e).split(/\s+/).filter(Boolean);
    const at = maskedWords.lastIndexOf('apply');
    if (at < 0) continue;
    const args = cmd.slice(s, e).split(/\s+/).filter(Boolean).slice(at + 1);
    const writes = args.some((a) => ['--apply', '--index', '--cached', '--3way', '-3'].includes(a));
    const readOnly = args.some((a) => ['--check', '--stat', '--numstat', '--summary'].includes(a));
    if (writes || !readOnly) return true;
  }
  return false;
}

function patchDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'patch')) {
    if (overflow) return true;
    const args = cmd.slice(s, e).split(/\s+/).filter(Boolean);
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
