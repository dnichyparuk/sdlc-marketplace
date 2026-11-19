// Harness for providers/script-runner.js exit-code reporting.
//   --child <code>  child mode: writes CHILD-OUT to stdout, CHILD-ERR to stderr, exits <code>
//   (default)       runs the provider three times and prints one JSON line:
//                   {"plain3":{output,metadata},"show3":{...},"show0":{...}}
//   --cwd-probe     runs the provider twice without script_cwd (plain, then with
//                   script_env GIT_SSH_COMMAND) and prints one JSON line:
//                   {"cwd","inTmp","existsAfter","ssh","prompt","override"}
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

const argv = process.argv.slice(2);
const childIdx = argv.indexOf('--child');

if (childIdx !== -1) {
  process.stdout.write('CHILD-OUT\n');
  process.stderr.write('CHILD-ERR\n');
  process.exit(Number(argv[childIdx + 1]));
}

// Child code for --cwd-probe: prints [cwd, GIT_SSH_COMMAND, GIT_TERMINAL_PROMPT] as JSON.
const PROBE = 'console.log(JSON.stringify([process.cwd(),process.env.GIT_SSH_COMMAND,process.env.GIT_TERMINAL_PROMPT]))';

(async () => {
  const Provider = require(path.join(__dirname, '../providers/script-runner.js'));
  const provider = new Provider();
  if (argv.includes('--cwd-probe')) {
    const probe = (extra) => provider.callApi('run', { vars: { script_path: '-e', script_args: PROBE, ...extra } });
    const [cwd, ssh, prompt] = JSON.parse((await probe({})).output);
    const [, override] = JSON.parse((await probe({ script_env: { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' } })).output);
    const tmp = fs.realpathSync(os.tmpdir());
    const inTmp = cwd.startsWith(tmp + path.sep) && path.basename(cwd).startsWith('promptfoo-cwd-');
    process.stdout.write(`${JSON.stringify({ cwd, inTmp, existsAfter: fs.existsSync(cwd), ssh, prompt, override })}\n`);
    return;
  }
  const run = (code, extra) => provider.callApi('run', {
    vars: { script_path: __filename, script_args: `--child ${code}`, ...extra },
  });
  const result = {
    plain3: await run(3, {}),
    show3: await run(3, { script_show_exit: true }),
    show0: await run(0, { script_show_exit: true }),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
})().catch((err) => {
  process.stderr.write(`Script error: ${err.message}\n`);
  process.exit(2);
});
