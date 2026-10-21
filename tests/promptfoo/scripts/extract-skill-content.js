const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Resolve paths relative to repo root (three levels up from tests/promptfoo/scripts/)
const REPO_ROOT = path.resolve(__dirname, '../../..');

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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-fixture-'));
    // Registry read by scripts/fixture-copies-cleanup.js (afterAll hook, exec configs only).
    (globalThis.__sdlcFixtureCopies ??= new Set()).add(tmpDir);
    await fs.promises.cp(sourceDir, tmpDir, { recursive: true });

    // Auto-run fixture setup script if present (initializes git state, stages files, etc.)
    const setupScript = path.join(tmpDir, 'setup.sh');
    if (fs.existsSync(setupScript)) {
      const setup = execFileAsync('bash', [setupScript], { cwd: tmpDir, timeout: 10_000 });
      setup.child.stdin.on('error', () => {}); // ignore EPIPE, as in the providers
      setup.child.stdin.end(); // EOF at once, as the old synchronous call gave
      await setup;
    }

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
