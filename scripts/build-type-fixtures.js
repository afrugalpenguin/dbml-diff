'use strict';

// Writes the emitJson output of each fixture pair to typecheck/*.json.
// typecheck/check.ts type-checks those files against lib/index.d.ts
// (run by `npm test` via tsc), and __tests__/types.test.js fails if they no
// longer match the live output.
//
//   node scripts/build-type-fixtures.js     rewrite typecheck/*.json
//
// Run it (`npm run types:fixtures`) when the diff output changes on purpose.

const fs = require('fs');
const path = require('path');
const { diff, emitJson } = require('../lib');

const FIXTURES = path.join(__dirname, '..', '__tests__', 'fixtures');
const OUT_DIR = path.join(__dirname, '..', 'typecheck');

// [old fixture, new fixture, output file]. types-a/types-b exist to cover
// every variant of the result shape; keep check.ts importing each output.
const PAIRS = [
  ['types-a.dbml', 'types-b.dbml', 'types-a-types-b.json'],
  ['v1.dbml', 'v2.dbml', 'v1-v2.json'],
  ['empty-a.dbml', 'empty-b.dbml', 'empty-a-empty-b.json'],
];

function render([oldFile, newFile]) {
  const read = (f) => fs.readFileSync(path.join(FIXTURES, f), 'utf8');
  return `${emitJson(diff(read(oldFile), read(newFile)))}\n`;
}

function main() {
  for (const pair of PAIRS) {
    fs.writeFileSync(path.join(OUT_DIR, pair[2]), render(pair));
    process.stdout.write(`wrote typecheck/${pair[2]}\n`);
  }
}

if (require.main === module) main();

module.exports = { PAIRS, OUT_DIR, render };
