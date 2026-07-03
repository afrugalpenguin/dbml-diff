#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { parseSchema } = require('../lib/parse');
const { diffTables } = require('../lib/diff');
const { emitText, emitJson, emitDbml } = require('../lib/emit');
const pkg = require('../package.json');

const USAGE = `Usage: dbml-diff <old.dbml> <new.dbml> [options]

Structurally diff two DBML schema files.

Options:
  --format <text|json|dbml>   output format (default: text)
  --full-new-tables           in dbml format, emit full column lists for
                              added tables (default: stub to PK + note with
                              column count)
  --colors                    in dbml format, use headercolor annotations
                              (requires dbdiagram paid tier to render;
                              name prefixes are always emitted regardless)
  -o, --output <file>         write to file instead of stdout
  -h, --help                  show this help
  --version                   print package version

Exit codes:
  0  schemas are identical
  1  differences found
  2  error (bad arguments, unreadable file, DBML parse failure)

Examples:
  dbml-diff old.dbml new.dbml
      human-readable summary of what changed

  dbml-diff old.dbml new.dbml --format dbml -o diff.dbml
      visual diff - paste diff.dbml into https://dbdiagram.io

  dbml-diff old.dbml new.dbml --format json
      machine-readable result on stdout (counts stay on stderr)`;

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { format: 'text', fullNewTables: false, colors: false, output: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--version') opts.version = true;
    else if (a === '--format') {
      opts.format = argv[++i];
      if (opts.format === undefined) fail(`--format requires a value\n\n${USAGE}`);
    } else if (a === '--full-new-tables') opts.fullNewTables = true;
    else if (a === '--colors') opts.colors = true;
    else if (a === '-o' || a === '--output') {
      opts.output = argv[++i];
      if (opts.output === undefined) fail(`${a} requires a value\n\n${USAGE}`);
    } else if (a.startsWith('-')) fail(`Unknown option: ${a}\n\n${USAGE}`);
    else opts.files.push(a);
  }
  return opts;
}

function readFileOrFail(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    fail(`dbml-diff: cannot read ${file}: ${err.message}`);
  }
}

function parseOrFail(file, text) {
  try {
    return parseSchema(text);
  } catch (err) {
    const diags = err && err.diags;
    if (Array.isArray(diags) && diags.length) {
      fail(diags.map((d) => {
        const line = d.location && d.location.start && d.location.start.line;
        return `dbml-diff: parse error in ${file}${line ? ` (line ${line})` : ''}: ${d.message}`;
      }).join('\n'));
    }
    fail(`dbml-diff: parse error in ${file}: ${err && err.message ? err.message : String(err)}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const opts = parseArgs(argv);

  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (opts.version) {
    process.stdout.write(`${pkg.version}\n`);
    process.exit(0);
  }
  if (opts.files.length !== 2) {
    fail(`dbml-diff: expected exactly two input files, got ${opts.files.length}\n\n${USAGE}`);
  }
  if (!['text', 'json', 'dbml'].includes(opts.format)) {
    fail(`dbml-diff: invalid --format "${opts.format}" (expected text, json, or dbml)`);
  }

  const [oldFile, newFile] = opts.files;
  const oldTables = parseOrFail(oldFile, readFileOrFail(oldFile));
  const newTables = parseOrFail(newFile, readFileOrFail(newFile));
  const result = diffTables(oldTables, newTables);

  let out;
  if (opts.format === 'json') out = emitJson(result);
  else if (opts.format === 'dbml') {
    out = emitDbml(result, {
      oldLabel: oldFile,
      newLabel: newFile,
      fullNewTables: opts.fullNewTables,
      colors: opts.colors,
    });
  } else out = emitText(result);
  if (!out.endsWith('\n')) out += '\n';

  if (opts.output) {
    try {
      fs.writeFileSync(opts.output, out);
    } catch (err) {
      fail(`dbml-diff: cannot write ${opts.output}: ${err.message}`);
    }
  } else {
    process.stdout.write(out);
  }

  const { counts } = result;
  process.stderr.write(`added: ${counts.added}, removed: ${counts.removed}, modified: ${counts.modified}\n`);
  process.exit(counts.added + counts.removed + counts.modified ? 1 : 0);
}

main();
