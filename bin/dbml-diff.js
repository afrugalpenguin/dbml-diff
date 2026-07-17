#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { parseSchema } = require('../lib/parse');
const { diffSchemas, changeCounts } = require('../lib/diff');
const { emitText, emitJson, emitDbml, emitMermaid, emitMigration } = require('../lib/emit');
const pkg = require('../package.json');

const USAGE = `Usage: dbml-diff <old.dbml> <new.dbml> [options]

Structurally diff two DBML schema files.

Options:
  --format <text|json|dbml|mermaid>
                              output format (default: text). dbml renders in
                              dbdiagram.io; mermaid emits an erDiagram block
                              that renders natively in GitHub / Azure DevOps
  --full-new-tables           in a visual format, emit full column lists for
                              added tables (default: stub to PK + note with
                              column count)
  --colors                    in dbml format, use headercolor annotations
                              (requires dbdiagram paid tier to render;
                              name prefixes are always emitted regardless)
  --hide-unchanged-pk         in a visual format, drop the unchanged primary-key
                              row from modified tables (leaner delta-only view)
  --migrate                   emit a T-SQL migration script (ALTER/CREATE DDL)
                              instead of a diff; DROP and heuristic RENAME
                              statements are commented out. Cannot be combined
                              with --format. Honors -o.
  --include-notes             treat a changed column note as a column change
                              (reported as "note changed"); off by default
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

  dbml-diff old.dbml new.dbml --format mermaid -o diff.mmd
      visual diff as an erDiagram block - wrap it in a mermaid code fence to
      render it in a GitHub or Azure DevOps comment

  dbml-diff old.dbml new.dbml --format json
      machine-readable result on stdout (counts stay on stderr)

  dbml-diff old.dbml new.dbml --migrate -o up.sql
      generate a T-SQL migration script (review before running)`;

function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { format: 'text', fullNewTables: false, colors: false, hideUnchangedPk: false, migrate: false, includeNotes: false, output: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--version') opts.version = true;
    else if (a === '--format') {
      opts.format = argv[++i];
      opts.formatGiven = true;
      if (opts.format === undefined) fail(`--format requires a value\n\n${USAGE}`);
    } else if (a === '--full-new-tables') opts.fullNewTables = true;
    else if (a === '--colors') opts.colors = true;
    else if (a === '--hide-unchanged-pk') opts.hideUnchangedPk = true;
    else if (a === '--migrate') opts.migrate = true;
    else if (a === '--include-notes') opts.includeNotes = true;
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
  if (opts.migrate && opts.formatGiven) {
    fail(`dbml-diff: --migrate cannot be combined with --format`);
  }
  if (!opts.migrate && !['text', 'json', 'dbml', 'mermaid'].includes(opts.format)) {
    fail(`dbml-diff: invalid --format "${opts.format}" (expected text, json, dbml, or mermaid)`);
  }
  // --full-new-tables and --hide-unchanged-pk are view-density knobs that mean
  // the same thing in either visual format; --colors is a dbdiagram headercolor
  // annotation with no mermaid equivalent, so it stays dbml-only. Warn (do not
  // fail) when a flag is set with a format that ignores it, so a scripting
  // mistake is visible instead of silently dropped.
  const ctx = opts.migrate ? '--migrate' : `--format ${opts.format}`;
  const isVisual = !opts.migrate && ['dbml', 'mermaid'].includes(opts.format);
  const viewFlags = [];
  if (opts.fullNewTables) viewFlags.push('--full-new-tables');
  if (opts.hideUnchangedPk) viewFlags.push('--hide-unchanged-pk');
  if (viewFlags.length && !isVisual) {
    process.stderr.write(`dbml-diff: ${viewFlags.join(', ')} apply only to --format dbml or --format mermaid; ignored with ${ctx}\n`);
  }
  if (opts.colors && (opts.migrate || opts.format !== 'dbml')) {
    process.stderr.write(`dbml-diff: --colors applies only to --format dbml; ignored with ${ctx}\n`);
  }

  const [oldFile, newFile] = opts.files;
  const oldSchema = parseOrFail(oldFile, readFileOrFail(oldFile));
  const newSchema = parseOrFail(newFile, readFileOrFail(newFile));
  const result = diffSchemas(oldSchema, newSchema, { includeNotes: opts.includeNotes });

  let out;
  if (opts.migrate) {
    out = emitMigration(result, { oldLabel: oldFile, newLabel: newFile });
  } else if (opts.format === 'json') out = emitJson(result);
  else if (opts.format === 'dbml') {
    out = emitDbml(result, {
      oldLabel: oldFile,
      newLabel: newFile,
      fullNewTables: opts.fullNewTables,
      colors: opts.colors,
      hideUnchangedPk: opts.hideUnchangedPk,
    });
  } else if (opts.format === 'mermaid') {
    out = emitMermaid(result, {
      oldLabel: oldFile,
      newLabel: newFile,
      fullNewTables: opts.fullNewTables,
      hideUnchangedPk: opts.hideUnchangedPk,
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

  const { counts, enums, refs, groups } = result;
  const cc = changeCounts(result);
  let summary = `added: ${counts.added}, removed: ${counts.removed}, modified: ${counts.modified}`;
  if (cc.enums) {
    summary += ` | enums added: ${enums.added.length}, removed: ${enums.removed.length}, modified: ${enums.modified.length}`;
  }
  if (cc.refs) {
    summary += ` | refs added: ${refs.added.length}, removed: ${refs.removed.length}, retargeted: ${refs.retargeted.length}, unresolved: ${refs.unresolved.length}`;
  }
  if (cc.groups) {
    summary += ` | groups added: ${groups.added.length}, removed: ${groups.removed.length}, modified: ${groups.modified.length}`;
  }
  process.stderr.write(`${summary}\n`);
  // Set the exit code and return rather than calling process.exit(): a large
  // diff written to a pipe (async stdout on POSIX) is still buffered here, and
  // process.exit() would drop everything past the ~64KB OS pipe buffer. Letting
  // main() return lets Node drain stdout before exiting with this code.
  process.exitCode = cc.total ? 1 : 0;
}

main();
