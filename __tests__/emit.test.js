'use strict';

const fs = require('fs');
const path = require('path');
const { Parser } = require('@dbml/core');
const { diff, emitText, emitJson, emitDbml } = require('../lib');

const FIXTURES = path.join(__dirname, 'fixtures');
const v1 = fs.readFileSync(path.join(FIXTURES, 'v1.dbml'), 'utf8');
const v2 = fs.readFileSync(path.join(FIXTURES, 'v2.dbml'), 'utf8');

// Fixed date so the emitted header is deterministic across runs.
const DATE = '2026-01-01';

describe('emit (v1 -> v2 fixtures)', () => {
  const result = diff(v1, v2);

  test('fixture pair has the expected counts', () => {
    expect(result.counts).toEqual({ added: 1, removed: 1, modified: 4 });
  });

  test('emitDbml default matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE }))
      .toMatchSnapshot();
  });

  test('emitDbml with fullNewTables matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, fullNewTables: true }))
      .toMatchSnapshot();
  });

  test('emitDbml with colors matches snapshot', () => {
    expect(emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, colors: true }))
      .toMatchSnapshot();
  });

  test('emitText matches snapshot', () => {
    expect(emitText(result)).toMatchSnapshot();
  });

  test('emitJson matches snapshot', () => {
    expect(emitJson(result)).toMatchSnapshot();
  });

  test('emitJson is valid JSON with the documented shape', () => {
    const parsed = JSON.parse(emitJson(result));
    expect(parsed.counts).toEqual({ added: 1, removed: 1, modified: 4 });
    expect(parsed.tables.added[0].name).toBe('dbo.PlanKind');
  });

  test('emitText reports no differences for identical schemas', () => {
    expect(emitText(diff(v1, v1))).toBe('No differences found.');
  });

  // Acceptance check: guarantees dbdiagram.io will accept the output.
  test.each([
    ['default', {}],
    ['fullNewTables', { fullNewTables: true }],
    ['colors', { colors: true }],
  ])('emitDbml output (%s) parses cleanly back through @dbml/core', (_label, opts) => {
    const out = emitDbml(result, { oldLabel: 'v1.dbml', newLabel: 'v2.dbml', date: DATE, ...opts });
    expect(() => new Parser().parse(out, 'dbmlv2')).not.toThrow();
  });
});
