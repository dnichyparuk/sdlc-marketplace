'use strict';
// Reads the version of the plugin manifest for the exec cases that compare it with getPluginVersion().
// It never calls getPluginVersion(): that function is the code under test.
// CLI: node plugin-json-version.js [--file <path>]
const fs = require('fs');
const path = require('path');
const PLUGIN_JSON = path.resolve(__dirname, '..', '..', '..', 'plugins', 'sdlc-utilities', '.claude-plugin', 'plugin.json');

function readPluginJsonVersion(file = PLUGIN_JSON) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`plugin.json unreadable: ${file}: ${err.message}`);
  }
  if (!data || typeof data.version !== 'string') throw new Error(`plugin.json has no string version: ${file}`);
  return data.version;
}

module.exports = { PLUGIN_JSON, readPluginJsonVersion };

if (require.main === module) {
  const argv = process.argv.slice(2);
  let file = PLUGIN_JSON;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') {
      if (i + 1 >= argv.length) {
        process.stderr.write('plugin-json-version: --file needs a value\n');
        process.exit(2);
      }
      file = argv[++i];
    } else {
      process.stderr.write(`plugin-json-version: unknown flag ${argv[i]}\n`);
      process.exit(2);
    }
  }
  try {
    process.stdout.write(JSON.stringify({ version: readPluginJsonVersion(file) }) + '\n');
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
