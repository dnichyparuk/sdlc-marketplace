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

const SHELL_WORD_RE = /\S+/g; // one word of the masked text (a run of non-space characters); copy it per use, the g flag keeps lastIndex
const WHITESPACE_RE = /\s+/; // a run of whitespace between words
const DOLLAR_BEFORE_QUOTE_RE = /\$(?=["'])/g; // the $ of a $'..' or $".." quote
const QUOTE_CHAR_RE = /["']/g; // any quote character, removed as the shell does
const UNSAFE_WORD_RE = /\\|\$['"]/; // a backslash or $'/$" quote: the shell word can differ from its text
const BACKSLASH_RE = /\\/g; // a backslash the shell removes from an unquoted word
const LEADING_QUOTE_RE = /^["']/; // one quote at the start of a target
const TRAILING_QUOTE_RE = /["']$/; // one quote at the end of a target

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
        // An escaped letter or digit is the plain char to the shell (`\tee` is `tee`): keep it.
        if (/[A-Za-z0-9]/.test(cmd[i + 1])) {
          out += ch + cmd[i + 1];
        } else {
          out += '__';
        }
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

const WRAPPER_WORDS = ['env', 'sudo', 'exec', 'command', 'nohup', 'time', 'xargs', 'timeout', 'nice', 'stdbuf', 'setsid', 'ionice', 'eval', 'coproc'];
const MAX_PREFIX_TOKENS = 256;
const MAX_ESCAPED_WORD = 64; // longest word whose backslashes are removed before comparing; a longer one that holds a backslash is denied
const NO_COMMAND = -1; // scanPrefix: no such command at this position
const TOO_LONG = -2; // scanPrefix: the prefix is too long to scan (fail closed)
const KEYWORDS = ['then', 'do', 'else', 'if', 'elif', 'while', 'until', '!'];

/** Words of the command, as [start, end, segment] offsets; a word never crosses `|`, `;`, `&` or whitespace. */
function tokenize(masked) {
  const toks = [];
  const re = /[^\s|;&]+/g;
  let m;
  let seg = 0;
  let prevEnd = 0;
  while ((m = re.exec(masked)) !== null) {
    if (toks.length > 0 && /[|;&\n]/.test(masked.slice(prevEnd, m.index))) seg++;
    toks.push({ s: m.index, e: m.index + m[0].length, seg });
    prevEnd = m.index + m[0].length;
  }
  return toks;
}

/** The word [ws, we) is `word`, or ends in `/word` (a path-qualified command). */
function isCommandWord(masked, ws, we, word) {
  const len = word.length;
  if (we - ws < len || !masked.startsWith(word, we - len)) return false;
  return we - ws === len || masked[we - len - 1] === '/';
}

function isWordEqual(masked, ws, we, word) {
  return we - ws === word.length && masked.startsWith(word, ws);
}

function isAssignment(masked, ws, we) {
  if (!/[A-Za-z_]/.test(masked[ws])) return false;
  let i = ws + 1;
  while (i < we && /[A-Za-z0-9_]/.test(masked[i])) i++;
  return i < we && masked[i] === '=';
}

/** A wrapper numeric argument: digits and dots, then an optional s, m, h or d (`5`, `1.5`, `2m`). */
function isDuration(masked, ws, we) {
  if (!/[0-9]/.test(masked[ws])) return false;
  let i = ws + 1;
  while (i < we && /[0-9.]/.test(masked[i])) i++;
  if (i < we && /[smhd]/.test(masked[i])) i++;
  return i === we;
}

/**
 * Scan the words from token `j` (whose first word starts at `first`, inside the token when
 * the start follows `(`, `{` or a backtick). Returns the offset after the command word,
 * NO_COMMAND, or TOO_LONG.
 */
function scanPrefix(masked, toks, j, first, name, nextBackslash) {
  const seg = toks[j].seg;
  let inWrapper = false;
  let afterOption = false;
  let keywords = true; // leading shell keywords (`if`, `!`, `then` ...) come before the command
  let open = 0; // unclosed `$(` or backtick text of an assignment value
  for (let n = 0; ; n++) {
    const k = j + n;
    if (k >= toks.length || toks[k].seg !== seg) return NO_COMMAND;
    if (n >= MAX_PREFIX_TOKENS) return TOO_LONG; // only prefix words so far: fail closed
    const ws0 = n === 0 ? first : toks[k].s;
    const we0 = toks[k].e;
    // The shell removes backslashes from an unquoted word (`te\e` is `tee`): compare the word without them.
    let src = masked;
    let ws = ws0;
    let we = we0;
    if (nextBackslash[ws0] < we0) {
      if (we0 - ws0 > MAX_ESCAPED_WORD) return TOO_LONG; // a long escaped word: fail closed
      src = masked.slice(ws0, we0).replace(BACKSLASH_RE, '');
      ws = 0;
      we = src.length;
      if (we === 0) continue;
    }
    if (open !== 0) {
      open = openDepth(masked, ws0, we0, open); // a spaced command substitution inside an assignment value
      continue;
    }
    if (keywords && KEYWORDS.some((w) => isWordEqual(src, ws, we, w))) continue;
    keywords = false;
    if (isAssignment(src, ws, we)) {
      afterOption = false;
      open = openDepth(masked, ws0, we0, 0);
    } else if (isCommandWord(src, ws, we, name)) {
      return we0;
    } else if (WRAPPER_WORDS.some((w) => isCommandWord(src, ws, we, w))) {
      inWrapper = true;
      afterOption = false;
    } else if (inWrapper && src[ws] === '-') {
      afterOption = true;
    } else if (inWrapper && (isWordEqual(src, ws, we, '{}') || isDuration(src, ws, we))) {
      afterOption = false;
    } else if (inWrapper && afterOption) {
      afterOption = false; // the option's own argument
    } else {
      return NO_COMMAND;
    }
  }
}

/** Open `(` (after `$`) and backtick count after the word [ws, we), starting from `open`; never below 0. */
function openDepth(masked, ws, we, open) {
  let depth = open;
  for (let i = ws; i < we; i++) {
    const ch = masked[i];
    if (ch === '(' && i > ws && masked[i - 1] === '$') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === '`') depth = depth > 0 ? depth - 1 : depth + 1;
  }
  return depth;
}

/**
 * One command-position scanner shared by the tee, dd, git-apply and patch rules, so they
 * cannot drift (R90). It is code, not one backtracking regex, and it works on offsets
 * without slicing words, so its cost is linear in the command length: the work per start
 * position is bounded by MAX_PREFIX_TOKENS. A command starts at the line start, after
 * `| ; &`, `(`, `)` (a case label), `{`, a backtick or a newline, after the keywords
 * `then`, `do`, `else`, `if`, `elif`, `while`, `until` and `!`, after leading `VAR=val` words
 * (also with a spaced `$(...)` value), and after wrapper words (`env`, `sudo`, `exec`,
 * `command`, `nohup`, `time`, `xargs`, `timeout`, `nice`, `stdbuf`, `setsid`, `ionice`, `eval`,
 * `coproc`) with
 * their own options, option arguments, `VAR=val` words and numbers. The command name may
 * carry a path (`/usr/bin/tee`) or backslashes inside the word (`\\tee`, `te\\e`: the shell removes them from an unquoted word; a word of more than MAX_ESCAPED_WORD characters that holds a backslash is denied, fail closed). A prefix of
 * MAX_PREFIX_TOKENS or more words before the command is denied (fail closed). Accepted gaps
 * (best-effort filter, not a sandbox; R90): a command run through another interpreter or wrapper
 * string (`bash -c`, `sh -c`, `find -exec`, `xargs sh -c`, busybox applets), a quoted command
 * name (`"tee"`), and path-qualified or escaped `sed`/`perl`/`awk` in-place forms.
 */
function findCommands(masked, name) {
  const toks = tokenize(masked);
  const segEnd = [];
  toks.forEach((t) => {
    segEnd[t.seg] = t.e;
  });
  const nextBackslash = new Int32Array(masked.length + 1); // first backslash at or after each offset
  nextBackslash[masked.length] = masked.length;
  for (let i = masked.length - 1; i >= 0; i--) nextBackslash[i] = masked[i] === '\\' ? i : nextBackslash[i + 1];
  const found = [];
  const add = (j, first) => {
    const s = scanPrefix(masked, toks, j, first, name, nextBackslash);
    if (s >= 0) found.push({ s, e: segEnd[toks[j].seg] });
    else if (s === TOO_LONG) found.push({ overflow: true });
  };
  for (let j = 0; j < toks.length; j++) {
    if (j === 0 || toks[j].seg !== toks[j - 1].seg) add(j, toks[j].s);
    for (let i = toks[j].s; i < toks[j].e; i++) {
      const ch = masked[i];
      if (ch !== '(' && ch !== ')' && ch !== '`' && ch !== '{') continue;
      if (i + 1 < toks[j].e) add(j, i + 1);
      else if (j + 1 < toks.length && toks[j + 1].seg === toks[j].seg) add(j + 1, toks[j + 1].s);
    }
  }
  return found;
}

function isAllowedTarget(target) {
  const unquoted = target.replace(LEADING_QUOTE_RE, '').replace(TRAILING_QUOTE_RE, '');
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
    const args = cmd.slice(s, e).split(WHITESPACE_RE).filter((a) => a && !a.startsWith('-'));
    if (args.some((a) => !isAllowedTarget(a))) return true;
  }
  return false;
}

function ddDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'dd')) {
    if (overflow) return true;
    const outs = cmd.slice(s, e).split(WHITESPACE_RE).filter(Boolean).map((a) => a.replace(LEADING_QUOTE_RE, '')).filter((a) => a.startsWith('of='));
    if (outs.some((a) => !isAllowedTarget(a.slice(3)))) return true;
  }
  return false;
}

/** Shell words of cmd[s, e) split on the masked text (same offsets), so a quoted word with spaces stays one word; text has every quote character removed. */
function argWords(cmd, masked, s, e) {
  const words = [];
  const re = new RegExp(SHELL_WORD_RE);
  const seg = masked.slice(s, e);
  let m;
  while ((m = re.exec(seg)) !== null) {
    const raw = cmd.slice(s + m.index, s + m.index + m[0].length);
    // A backslash escape or $'..' / $".." quoting makes the shell word differ from the text: fail closed.
    words.push({ masked: m[0], text: raw.replace(DOLLAR_BEFORE_QUOTE_RE, '').replace(QUOTE_CHAR_RE, ''), unsafe: UNSAFE_WORD_RE.test(raw) });
  }
  return words;
}

/** The word as the shell reads it for a plain word: quotes, `$` before a quote and backslashes removed. */
function shellWord(w) {
  return w.text.replace(BACKSLASH_RE, '');
}

const GIT_APPLY_READ_ONLY = ['--check', '--stat', '--numstat', '--summary'];
const GIT_APPLY_WRITE = ['--apply', '--index', '--cached', '--3way', '-3'];
const BUNDLED_3WAY_RE = /^-[^-=]*3[^=]*$/; // single-dash option word without '=' that holds 3 (-v3 includes -3)
const PATCH_OUTPUT_LONG = '--output'; // GNU patch accepts any unambiguous abbreviation (--o, --out, --outp)
// A word that may name the subcommand sits within the first words after `git`.
const GIT_SUBCOMMAND_WINDOW = 4;

// git global options that take their value as the next word (`--git-dir=x` carries it in the same word).
const GIT_GLOBAL_WITH_VALUE = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source'];

/** Index of the git subcommand: the first word that is not a global option or the value of one; -1 when there is none. */
function gitSubcommandIndex(words) {
  for (let i = 0; i < words.length; i++) {
    const w = shellWord(words[i]);
    if (!w.startsWith('-')) return i;
    if (GIT_GLOBAL_WITH_VALUE.includes(w)) i++;
  }
  return -1;
}

function gitApplyDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'git')) {
    if (overflow) return true;
    const words = argWords(cmd, masked, s, e);
    const sub = gitSubcommandIndex(words);
    const at = sub >= 0 && shellWord(words[sub]) === 'apply' ? sub : -1;
    if (at < 0) {
      // No `apply` word: deny only an unquoted escape or $'..' quote near the subcommand slot, where it can hide `apply`.
      if (words.slice(0, GIT_SUBCOMMAND_WINDOW).some((w) => UNSAFE_WORD_RE.test(w.masked))) return true;
      continue;
    }
    if (words.slice(at + 1).some((w) => w.unsafe)) return true;
    const all = words.slice(at + 1).map((w) => w.text);
    // git reads every word after a bare `--` as a file name, so options come only from the words before it.
    const end = all.indexOf('--');
    const args = end < 0 ? all : all.slice(0, end);
    // `-p3` and `-C3` match too and are denied (fail closed); `-p 3` stays allowed.
    const writes = args.some((a) => GIT_APPLY_WRITE.includes(a) || BUNDLED_3WAY_RE.test(a));
    const readOnly = args.some((a) => GIT_APPLY_READ_ONLY.includes(a));
    // Any other long option is denied: git accepts unambiguous abbreviations (`--ap` is `--apply`).
    const otherLong = args.some((a) => a.startsWith('--') && !GIT_APPLY_READ_ONLY.includes(a));
    if (writes || otherLong || !readOnly) return true;
  }
  return false;
}

function patchDenied(cmd, masked) {
  for (const { s, e, overflow } of findCommands(masked, 'patch')) {
    if (overflow) return true;
    const pw = argWords(cmd, masked, s, e);
    if (pw.some((w) => w.unsafe)) return true;
    const args = pw.map((w) => w.text);
    if (args.includes('--dry-run')) continue;
    const outputs = [];
    args.forEach((a, i) => {
      if (a === '-o') outputs.push(args[i + 1] || '');
      else if (a.startsWith('--o')) {
        // GNU patch obeys the last output option, so every target must be a scratch path.
        const eq = a.indexOf('=');
        const name = eq < 0 ? a : a.slice(0, eq);
        if (PATCH_OUTPUT_LONG.startsWith(name)) outputs.push(eq < 0 ? args[i + 1] || '' : a.slice(eq + 1));
      }
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
