// Harness for providers/script-runner.js exit-code reporting.
//   --child <code>  child mode: writes CHILD-OUT to stdout, CHILD-ERR to stderr, exits <code>
//   (default)       runs the provider three times and prints one JSON line:
//                   {"plain3":{output,metadata},"show3":{...},"show0":{...}}
'use strict';
const path = require('path');

const argv = process.argv.slice(2);
const childIdx = argv.indexOf('--child');

if (childIdx !== -1) {
  process.stdout.write('CHILD-OUT\n');
  process.stderr.write('CHILD-ERR\n');
  process.exit(Number(argv[childIdx + 1]));
}

(async () => {
  const Provider = require(path.join(__dirname, '../providers/script-runner.js'));
  const provider = new Provider();
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
