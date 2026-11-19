const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Resolve paths relative to repo root (three levels up from tests/promptfoo/scripts/)
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Memo (TK-001): a fixture whose setup.sh does not depend on its own path is built once per run
// into a template folder and copied per case. Committed git objects hold the build path in
// compressed form, so a path-dependent fixture is built per case. Threat model (best effort): the
// rule guards against a copy that points at the template. Accepted gap: a setup that writes its
// path only into a committed file and then deletes that file from the work tree, without naming
// pwd in setup.sh, is not detected.
// NOT --show-toplevel: the #9161 guard line of every git fixture uses it.
const PATH_DEPENDENT_RE = /\$PWD|\$\{PWD\}|\$\(pwd\)|`pwd`|\bpwd\b|worktree\s+add/;
const COPY_OPTS = { recursive: true, preserveTimestamps: true, verbatimSymlinks: true };
// Registry read by scripts/fixture-copies-cleanup.js (afterAll hook, exec configs only).
const register = (dir) => (globalThis.__sdlcFixtureCopies ??= new Set()).add(dir);

function isPathDependent(setupText) {
  return PATH_DEPENDENT_RE.test(setupText);
}

// Run the fixture setup script (initializes git state, stages files, etc.)
async function runSetup(dir) {
  const setup = execFileAsync('bash', [path.join(dir, 'setup.sh')], { cwd: dir, timeout: 10_000 });
  setup.child.stdin.on('error', () => {}); // ignore EPIPE, as in the providers
  setup.child.stdin.end(); // EOF at once, as the old synchronous call gave
  await setup;
}

// One fresh build per case: copy the fixture and run its setup.sh, if present, in the copy.
async function buildFresh(sourceDir) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));
  register(dir);
  await fs.promises.cp(sourceDir, dir, { recursive: true });
  if (fs.existsSync(path.join(dir, 'setup.sh'))) await runSetup(dir);
  return dir;
}

// True when any regular file outside .git/objects contains dir or its real path as bytes,
// or any symlink's target contains it.
function containsOwnPath(dir) {
  const needles = [...new Set([dir, fs.realpathSync(dir)])].map((p) => Buffer.from(p));
  const hit = (buf) => needles.some((n) => buf.includes(n));
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isSymbolicLink()) {
        if (hit(Buffer.from(fs.readlinkSync(full)))) return true;
      } else if (entry.isDirectory()) {
        if (entry.name === 'objects' && path.basename(d) === '.git') continue;
        if (walk(full)) return true;
      } else if (entry.isFile() && hit(fs.readFileSync(full))) {
        return true;
      }
    }
    return false;
  };
  return walk(dir);
}

// Promise<string|null>, one per sourceDir per run: the template folder, or null when the fixture
// has no setup.sh or is path-dependent. A failed setup rejects every case that awaits it.
function templateFor(sourceDir) {
  const memo = (globalThis.__sdlcFixtureTemplates ??= new Map());
  if (!memo.has(sourceDir)) memo.set(sourceDir, (async () => {
    const setup = path.join(sourceDir, 'setup.sh');
    if (!fs.existsSync(setup) || isPathDependent(fs.readFileSync(setup, 'utf8'))) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-tmpl-'));
    register(dir);
    await fs.promises.cp(sourceDir, dir, { recursive: true });
    await runSetup(dir);
    return containsOwnPath(dir) ? null : dir;
  })());
  return memo.get(sourceDir);
}

// fs.cp keeps file times only: a copied directory gets the time of the copy. Set every directory's
// times from the template, so a fixture that backdates a directory (execute-state-mid-wave) keeps it.
async function copyDirTimes(from, to) {
  for (const entry of await fs.promises.readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyDirTimes(path.join(from, entry.name), path.join(to, entry.name));
  }
  const st = await fs.promises.stat(from);
  await fs.promises.utimes(to, st.atime, st.mtime);
}

async function copyTemplate(template) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));
  register(dir);
  await fs.promises.cp(template, dir, COPY_OPTS);
  await copyDirTimes(template, dir);
  return dir;
}

module.exports = async function transformVars(vars) {
  const result = { ...vars };

  if (vars.skill_path) {
    const fullPath = path.join(REPO_ROOT, vars.skill_path);
    try {
      result.skill_content = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      throw new Error(`extract-skill-content: cannot read skill_path "${fullPath}": ${err.message}`);
    }

    // Auto-load all sibling .md files in the same skill directory (e.g. REFERENCE.md)
    const skillDir = path.dirname(fullPath);
    const siblings = fs.readdirSync(skillDir)
      .filter(f => f !== 'SKILL.md' && f.endsWith('.md'))
      .sort();
    if (siblings.length > 0) {
      result.reference_content = siblings.map(f => {
        const content = fs.readFileSync(path.join(skillDir, f), 'utf8');
        return `### ${f}\n\n${content}`;
      }).join('\n\n---\n\n');
    }
  }

  // Optional cross-skill reference_path — appended after auto-discovered siblings
  if (vars.reference_path) {
    const fullPath = path.join(REPO_ROOT, vars.reference_path);
    if (fs.existsSync(fullPath)) {
      const crossRef = fs.readFileSync(fullPath, 'utf8');
      const header = `### ${path.basename(vars.reference_path)} (cross-skill)\n\n${crossRef}`;
      result.reference_content = result.reference_content
        ? `${result.reference_content}\n\n---\n\n${header}`
        : header;
    }
  }

  // project_root with "file://fixtures-fs/" prefix points to a real directory fixture.
  // Copy it to a temp dir so scripts can write files without dirtying the source fixture.
  if (vars.project_root && vars.project_root.startsWith('file://fixtures-fs/')) {
    const relativePath = vars.project_root.replace('file://fixtures-fs/', 'tests/promptfoo/fixtures-fs/');
    const sourceDir = path.join(REPO_ROOT, relativePath);
    // Memo (TK-001): a memoisable fixture is built once per run into a template and copied per case.
    const template = await templateFor(sourceDir); // null: no setup.sh, or path-dependent
    const tmpDir = template ? await copyTemplate(template) : await buildFresh(sourceDir);

    result.project_root = tmpDir;
    result.repo_root = REPO_ROOT;
  }

  // script_path with "repo://" prefix resolves relative to repo root
  if (vars.script_path && vars.script_path.startsWith('repo://')) {
    result.script_path = path.join(REPO_ROOT, vars.script_path.replace('repo://', ''));
  }

  // script_args: replace {{project_root}} and {{repo_root}} placeholders after temp dir resolution
  if (vars.script_args) {
    let args = vars.script_args;
    if (result.project_root) args = args.replace(/\{\{project_root\}\}/g, result.project_root);
    args = args.replace(/\{\{repo_root\}\}/g, REPO_ROOT);
    result.script_args = args;
  }

  // script_home: replace {{project_root}} placeholder so tests can anchor HOME
  // overrides against the temp-copied fixture directory.
  if (vars.script_home && result.project_root) {
    result.script_home = vars.script_home.replace(/\{\{project_root\}\}/g, result.project_root);
  }

  // script_cwd: same substitution — common when the fixture root itself is the cwd.
  if (vars.script_cwd && result.project_root) {
    result.script_cwd = vars.script_cwd.replace(/\{\{project_root\}\}/g, result.project_root);
  }

  // script_env: substitute {{project_root}} in env values so tests can point env
  // variables (TMPDIR, HOME-style paths, etc.) at fixture-copied directories.
  // Accepts both string-encoded JSON and object forms.
  if (vars.script_env && result.project_root) {
    let envVal = vars.script_env;
    if (typeof envVal === 'string') {
      result.script_env = envVal.replace(/\{\{project_root\}\}/g, result.project_root);
    } else if (envVal && typeof envVal === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(envVal)) {
        out[k] = typeof v === 'string'
          ? v.replace(/\{\{project_root\}\}/g, result.project_root)
          : v;
      }
      result.script_env = out;
    }
  }

  return result;
};

// Used by scripts/run-fixture-memo.js.
module.exports.isPathDependent = isPathDependent;
module.exports.buildFresh = buildFresh;
module.exports.templateFor = templateFor;
